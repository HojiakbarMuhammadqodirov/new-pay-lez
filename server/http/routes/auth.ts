/**
 * Identity endpoints: sign up, sign in, who am I, consent, and the two GDPR
 * routines.
 *
 * The session cookie is `HttpOnly`, `SameSite=Lax` and `Secure` outside
 * development, and the same token is returned in the body for the mobile
 * surface — one session store, two ways of carrying the token, which is what
 * A1 asks for ("session handling for web in addition to mobile tokens; both
 * resolve to one account").
 */
import * as accounts from '../../domain/accounts.ts';
import * as consent from '../../domain/consent.ts';
import * as entitlements from '../../domain/entitlements.ts';
import * as ledger from '../../domain/ledger.ts';
import * as social from '../../domain/social.ts';
import * as verification from '../../domain/verification.ts';
import { DomainError } from '../../domain/errors.ts';
import { actor, bool, oneOf, optStr, str } from '../input.ts';
import { CONFIG } from '../../config.ts';
import { exchangeGoogleCode, verifyGoogleIdToken } from '../../crypto/google.ts';
import type { Ctx, Route } from '../router.ts';

const cookieFor = (token: string, maxAgeDays: number): string => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `paylez_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${
    maxAgeDays * 86400
  }`;
};

/**
 * The whole account, as the app reads it.
 *
 * `fresh` exists because `ctx.actor.user` is the row as it was when the *token*
 * was resolved, at the top of the request — so a `PATCH` that renders its result
 * through here echoes the profile back unchanged and the client believes the
 * write was ignored. Anything that writes to the user row passes the row it
 * wrote; everything else reads the one already in hand rather than paying for a
 * second `SELECT`.
 */
async function me(ctx: Ctx, fresh?: accounts.User) {
  const { user: resolved, session, roles } = actor(ctx);
  const user = fresh ?? resolved;
  const ent = await entitlements.entitlementsFor(ctx.db, { userId: user.id });
  const plan = await entitlements.planFor(ctx.db, { userId: user.id });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.display_name,
      /* The handle, as typed. Null until they pick one. */
      username: user.username,
      language: user.language,
      city: user.city,
      countryCode: user.country_code,
      avatar: user.display_avatar,
      phone: user.phone,
      /* The field the UI labels "Status". It is not `status` here for the same
         reason it is not `status` in the schema: `users.status` is the account
         state. One of `accounts.OCCUPATIONS`, or null. */
      occupation: user.occupation,
      birthDate: user.birth_date,
      /* How many self-service writes are left, so a form can grey the field out
         *before* somebody spends their last one — the alternative is a client
         that finds out by being refused, which is the same information delivered
         after it is useful. */
      birthDateChangesLeft: Math.max(0, accounts.BIRTH_DATE_WRITES - user.birth_date_changes),
      /* A stamp, not a live flag: `CONFIG.earn.profileComplete` is paid once and
         a client showing "complete" is reading the moment it was, not a
         re-derivation that a cleared field could undo. */
      profileCompletedAt: user.profile_completed_at,
      /* Null means "not yet", which is the only way a client can know whether
         to offer onboarding — and `POST /v1/me/onboarded` is idempotent
         precisely so a client that guesses wrong costs nothing. */
      onboardedAt: user.onboarded_at,
      trustTier: user.trust_tier,
      /*
       * When the address was proved, or null.
       *
       * A **stamp rather than a boolean**, matching `profileCompletedAt` and
       * `onboardedAt` one field up: the moment is the fact, and a client that
       * wants a boolean has one. Null is the state that gates earning,
       * redeeming and the board — see `domain/verification.ts` for the full
       * list and for the three things it deliberately does not gate.
       */
      emailVerifiedAt: user.email_verified_at,
      /* §1.4's standing answer, as a boolean because it is one. The column is
         an integer for the same reason `leaderboard_opt_in` is — SQLite has no
         boolean — and a client should not have to know that. */
      venueSharingDefault: user.venue_sharing_default === 1,
      leaderboardOptIn: user.leaderboard_opt_in === 1,
      referralCode: user.referral_code,
      createdAt: user.created_at,
    },
    roles,
    mode: session.mode,
    /* The balance is read from the ledger, not the cache, on the one endpoint
       where being right matters more than being fast. */
    points: await ledger.balance(ctx.db, user.id),
    plan: { code: plan.code, name: plan.name, audience: plan.audience },
    entitlements: ent,
    venues: await ctx.db.all(
      `SELECT id, name, city, status FROM venues WHERE owner_user_id = $u AND deleted_at IS NULL`,
      { u: user.id },
    ),
  };
}

/**
 * Issue a code, in the reader's language.
 *
 * A function rather than three copies of one call, because it is reached from
 * three places — sign-up, the resend route, and a client whose first code
 * expired — and the `language` argument is the part that would be forgotten in
 * one of them. `ctx.language` is the account's own setting first and the header
 * second (see `languageOf`), which is the right order for a message somebody
 * reads in a mail client rather than in this browser.
 */
const sendCode = async (ctx: Ctx, userId: string) =>
  await verification.issue(ctx.db, { userId, language: ctx.language, at: ctx.at });

export const authRoutes: Route[] = [
  {
    method: 'POST',
    pattern: '/v1/auth/signup',
    auth: 'none',
    /* Per connection, because the thing being bounded is minting accounts and
       the address is a field a script fills in. See `CONFIG.limits`. */
    limit: { perHour: CONFIG.limits.signUpPerHour, by: 'connection' },
    handler: async (ctx) => {
      const user = await accounts.signUp(ctx.db, {
        email: str(ctx.body, 'email'),
        password: str(ctx.body, 'password'),
        /* No `max` here. The ceiling is `accounts.checkName`'s, which
           `PATCH /v1/me` writes through as well — stated at one of the two
           routes it was a ceiling the other did not have, and a 5,000-character
           display name was a 400 on sign-up and a 200 on the patch. `str` still
           owns "required", which is a property of *this* endpoint. */
        name: str(ctx.body, 'name'),
        language: optStr(ctx.body, 'language'),
        /* Suggested by `GET /v1/cities`, not restricted to it — a city off that
           list needs `countryCode` beside it, and a `countryCode` with no city
           is refused rather than quietly discarded. Not "the same rule as
           `PATCH /v1/me`" but the *same function* (`resolveCityAnswer`): the two
           were written at different times, agreed in prose, and disagreed in
           code on exactly that second clause. */
        city: optStr(ctx.body, 'city'),
        countryCode: optStr(ctx.body, 'countryCode'),
        partner: bool(ctx.body, 'partner'),
        /* Read with `ctx.body.acceptTerms === true` rather than through
           `bool()`, for the reason `practice` on the games route is: every
           truthiness test in JavaScript reads the *string* "false" as true, and
           this is a field a client might send from a form serialiser. A strict
           comparison is the only reading where an unchecked box cannot arrive
           as consent. */
        acceptTerms: ctx.body.acceptTerms === true,
        referralCode: optStr(ctx.body, 'referralCode'),
        provisionalId: optStr(ctx.body, 'provisionalId'),
        at: ctx.at,
      });
      const session = await accounts.createSession(ctx.db, {
        userId: user.id,
        mode: bool(ctx.body, 'partner') ? 'partner' : 'consumer',
        surface: oneOf(ctx.body, 'surface', ['web', 'mobile'] as const, 'web'),
        deviceFingerprint: optStr(ctx.body, 'device'),
        at: ctx.at,
      });
      ctx.res.setHeader('set-cookie', cookieFor(session.token, 30));

      /*
       * The first code, sent here rather than left for the client to ask for.
       *
       * A client that had to remember to call `/v1/auth/verify/send` after
       * every sign-up is a client that forgets once and leaves an account
       * unable to earn with nothing on screen explaining why. It is the same
       * argument the session is issued here for: the account exists, so
       * everything the account needs to exist *with* happens in one request.
       *
       * **A failure does not fail the sign-up.** The account is real, the
       * session is real, and the address is provable at any time from the
       * verification screen — losing all of that because a mail transport was
       * down would be trading something that works for something that does
       * not. `verification` comes back describing what happened, including
       * `sent: false`, so the client can say so.
       */
      const verification = await sendCode(ctx, user.id).catch((error: unknown) => {
        console.warn(`sign-up code not sent: ${(error as Error).message}`);
        return null;
      });

      return {
        token: session.token,
        user: { id: user.id, name: user.display_name, email: user.email },
        verification,
      };
    },
  },
  {
    method: 'POST',
    pattern: '/v1/auth/signin',
    auth: 'none',
    handler: async (ctx) => {
      const result = await accounts.signIn(ctx.db, {
        email: str(ctx.body, 'email'),
        password: str(ctx.body, 'password'),
        surface: oneOf(ctx.body, 'surface', ['web', 'mobile'] as const, 'web'),
        deviceFingerprint: optStr(ctx.body, 'device'),
        at: ctx.at,
      });
      ctx.res.setHeader('set-cookie', cookieFor(result.token, 30));
      return {
        token: result.token,
        roles: result.roles,
        mode: result.session.mode,
        user: { id: result.user.id, name: result.user.display_name, email: result.user.email },
      };
    },
  },
  {
    /**
     * Sign in with Google.
     *
     * The browser does the Google half and arrives here holding an ID token;
     * this verifies it and issues one of *our* sessions. So the token Google
     * signed never becomes the session — it is evidence, checked once, and
     * discarded. Everything downstream sees the same session shape the password
     * path produces, which is what keeps the rest of the API from having to
     * know that Google exists.
     *
     * Both surfaces use this one endpoint: the web app posts the credential
     * from Google Identity Services, and the Flutter client posts the ID token
     * from its native sign-in. Same verification, same audience check.
     */
    method: 'POST',
    pattern: '/v1/auth/google',
    auth: 'none',
    /* Higher than sign-up: this is a sign-*in* for most callers, and a family
       or an office behind one address signs in far more often than it
       registers. It still bounds a loop hunting for a forged token that
       verifies. */
    limit: { perHour: CONFIG.limits.googleSignInPerHour, by: 'connection' },
    handler: async (ctx) => {
      const clientId = CONFIG.auth.googleClientId;
      if (!clientId) {
        /* Not configured is a server condition, not a bad request — saying
           "unauthenticated" here would send a caller off debugging their token. */
        throw new DomainError('internal', 'google sign-in is not configured on this server');
      }

      /*
       * Two ways in, and they are two different clients rather than two ways of
       * doing the same thing.
       *
       * `code` is the web app: it draws its own button, so it runs the
       * authorisation-code flow and this server does the exchange. `credential`
       * is a native ID token, which is what the Flutter client already holds
       * after a platform sign-in and has no code to exchange.
       *
       * Both converge on `verifyGoogleIdToken` one line later, so there is a
       * single place where a Google identity is decided to be real.
       */
      const code = optStr(ctx.body, 'code');
      const credential = code ? '' : str(ctx.body, 'credential');

      if (code && !CONFIG.auth.googleClientSecret) {
        throw new DomainError('internal', 'google code exchange is not configured on this server');
      }

      let identity;
      try {
        identity = code
          ? await exchangeGoogleCode(code, clientId, CONFIG.auth.googleClientSecret)
          : await verifyGoogleIdToken(credential, clientId);
      } catch (error) {
        /* The reason is logged, never returned: "token was not issued for this
           client" and "signature does not verify" tell an attacker which part
           of a forgery to fix. */
        console.warn(`google sign-in rejected: ${(error as Error).message}`);
        throw new DomainError('unauthenticated', 'that Google sign-in could not be verified');
      }

      const user = await accounts.linkGoogleAccount(ctx.db, {
        sub: identity.sub,
        email: identity.email,
        name: identity.name,
        language: optStr(ctx.body, 'language'),
        at: ctx.at,
      });

      const result = await accounts.sessionForUser(ctx.db, {
        user,
        surface: oneOf(ctx.body, 'surface', ['web', 'mobile'] as const, 'web'),
        deviceFingerprint: optStr(ctx.body, 'device'),
        at: ctx.at,
      });

      ctx.res.setHeader('set-cookie', cookieFor(result.token, 30));
      return {
        token: result.token,
        roles: result.roles,
        mode: result.session.mode,
        user: { id: result.user.id, name: result.user.display_name, email: result.user.email },
      };
    },
  },
  {
    /**
     * Send (or resend) the sign-up code.
     *
     * `auth: 'user'` — the session exists from the moment sign-up returns, so
     * the account asking for its own code is authenticated. That is what makes
     * this safe to leave un-throttled by address: the caller is already known,
     * so there is no address to enumerate and no stranger to post mail on
     * behalf of.
     *
     * Three brakes still, and they answer different things:
     * `CONFIG.auth.codeCooldownSeconds` bounds the button,
     * `codeSendsPerAddress` bounds the total, and the route's own `limit`
     * bounds the requests. The first is not an error — a cooldown refusal comes
     * back `sent: false` with `nextSendAt`, because asking again too soon is
     * what an honest person does when a message is slow.
     */
    method: 'POST',
    pattern: '/v1/auth/verify/send',
    auth: 'user',
    limit: { perHour: CONFIG.limits.sendCodePerHour, by: 'account' },
    handler: async (ctx) => await sendCode(ctx, actor(ctx).user.id),
  },
  {
    /**
     * Confirm the code.
     *
     * Rate-limited per account on top of the per-code attempt cap, and the two
     * are not redundant: the cap kills **one code** after five wrong answers,
     * and this bounds how fast somebody can burn through codes by alternating
     * guesses with resends.
     *
     * Not idempotent in the `Idempotency-Key` sense, and it does not need to
     * be: `confirm` is idempotent by construction — a second confirm of an
     * account that is already verified is `granted: false` rather than an
     * error, the same shape `POST /v1/me/onboarded` uses.
     */
    method: 'POST',
    pattern: '/v1/auth/verify',
    auth: 'user',
    limit: { perHour: CONFIG.limits.verifyEmailPerHour, by: 'account' },
    handler: async (ctx) =>
      await verification.confirm(ctx.db, {
        userId: actor(ctx).user.id,
        code: str(ctx.body, 'code'),
        at: ctx.at,
      }),
  },
  {
    method: 'POST',
    pattern: '/v1/auth/signout',
    auth: 'user',
    handler: async (ctx) => {
      await accounts.signOut(ctx.db, actor(ctx).session.id, ctx.at);
      ctx.res.setHeader('set-cookie', 'paylez_session=; Path=/; HttpOnly; Max-Age=0');
      return { ok: true };
    },
  },
  {
    /* §1.1 provisional identity: play first, sign up later, keep the points. */
    method: 'POST',
    pattern: '/v1/auth/guest',
    auth: 'none',
    /* A provisional account is an account, and this one needs no password at
       all — so it is the cheapest row on the server to create in a loop. */
    limit: { perHour: CONFIG.limits.guestPerHour, by: 'connection' },
    handler: async (ctx) => {
      const user = await accounts.provisional(ctx.db, str(ctx.body, 'device'), ctx.at);
      const session = await accounts.createSession(ctx.db, {
        userId: user.id,
        mode: 'consumer',
        surface: oneOf(ctx.body, 'surface', ['web', 'mobile'] as const, 'mobile'),
        deviceFingerprint: str(ctx.body, 'device'),
        at: ctx.at,
      });
      return { token: session.token, userId: user.id, provisional: true };
    },
  },
  {
    /**
     * The cities the field **suggests** — unchanged in shape, changed in
     * standing. It was the closed set a profile had to pick from; it is now the
     * 114 places Paylez operates in, offered as somebody types, with
     * `PATCH /v1/me` accepting a city that is not on it as long as a country
     * comes with it.
     *
     * Public, and it has to be: `POST /v1/auth/signup` takes a city, so a form
     * that has to render the choice before anybody has an account cannot be
     * asked for a token to see it.
     *
     * It is a list rather than a search because it is short. A client that
     * filters it locally suggests as fast as the keyboard and shows the whole
     * set when the box is empty, which is the thing a visitor actually wants to
     * know: whether Paylez is anywhere near them yet. Nothing here is a
     * *constraint* any more, so a search endpoint would be a round trip per
     * keystroke to narrow a hint.
     */
    method: 'GET',
    pattern: '/v1/cities',
    auth: 'none',
    handler: () => ({
      countries: accounts.CITY_COUNTRIES,
      cities: accounts.CITIES,
    }),
  },
  { method: 'GET', pattern: '/v1/me', auth: 'user', handler: me },
  {
    method: 'PATCH',
    pattern: '/v1/me',
    auth: 'user',
    handler: async (ctx) => {
      const { user } = actor(ctx);
      /* The opt-in first, the profile second, because the profile write is the
         one whose returned row is rendered — and it has to have seen both. */
      if (ctx.body.leaderboardOptIn !== undefined) {
        await social.setLeaderboardOptIn(ctx.db, user.id, bool(ctx.body, 'leaderboardOptIn'));
      }
      /*
       * §1.4's standing answer — "share my profile with venues I visit".
       *
       * Beside the board's opt-in for the same reason: both are preferences
       * rather than profile *fields*, both are read by a switch that applies on
       * the flip, and both are written before the profile below so the row
       * `me()` renders has seen them.
       *
       * Switching it **off does not revoke anything**. The grants that stand
       * are about specific venues somebody has been to, and declining future
       * ones is a different decision from withdrawing the ones they made —
       * `DELETE /v1/me/sharing/:venueId` is that, one venue at a time, and
       * `GET /v1/me/consents` lists them.
       */
      if (ctx.body.venueSharingDefault !== undefined) {
        await consent.setSharingDefault(ctx.db, user.id, bool(ctx.body, 'venueSharingDefault'));
      }
      /*
       * An explicit JSON `null` takes an answer back (§2.13); an absent key and an
       * empty string still leave it alone, so a client that resends its whole
       * profile keeps the behaviour it shipped with. `optStr` reads `null` as
       * absent, so the nulls are read here, before it runs.
       *
       * Four fields cannot be taken back and say so rather than ignoring the null:
       * an account always has a name and a language, a handle is what other people
       * were given, and a birthday is corrected, not withdrawn.
       */
      for (const field of ['name', 'username', 'birthDate', 'language'] as const) {
        if (ctx.body[field] === null) {
          throw new DomainError('validation_failed', `${field} can be changed but not removed`, { field });
        }
      }
      if (ctx.body.city === null && ctx.body.countryCode !== undefined && ctx.body.countryCode !== null) {
        throw new DomainError('validation_failed', 'clearing the city clears its country too', { field: 'countryCode' });
      }
      const clear = (['avatar', 'phone', 'occupation', 'city'] as const).filter((field) => ctx.body[field] === null);
      const updated = await accounts.updateProfile(
        ctx.db,
        user.id,
        {
          /* Non-blank and bounded, by the same `checkName` sign-up uses. A
             whitespace name used to reach the `COALESCE` and be read as "not
             sent", so the request succeeded and the account kept its old one. */
          name: optStr(ctx.body, 'name'),
          /* Taken already is a 409 naming the field, not a 500 quoting SQLite. */
          username: optStr(ctx.body, 'username'),
          language: optStr(ctx.body, 'language'),
          /* Anything, but stored canonically — the city board matches on this
             value literally, so `resolveCity` folds every spelling of one place
             onto one. A city that is not one of `GET /v1/cities` needs
             `countryCode` with it, and the 400 for a missing one names
             `countryCode` so the form knows to show the country picker rather
             than to argue about the city. Sending `countryCode` without `city`
             is also a 400: it cannot mean anything on its own — and it is the
             same 400 `POST /v1/auth/signup` gives, because both go through
             `accounts.resolveCityAnswer`. */
          city: optStr(ctx.body, 'city'),
          countryCode: optStr(ctx.body, 'countryCode'),
          avatar: optStr(ctx.body, 'avatar') ?? null,
          phone: optStr(ctx.body, 'phone'),
          /* The UI's "Status": one of `accounts.OCCUPATIONS`, or a 400 that
             carries the whole set in `allowed`. */
          occupation: optStr(ctx.body, 'occupation'),
          /* Set once, corrected once; a third *different* day is a 409 naming
             support. Resending the day already stored costs nothing, which is
             what lets a client PATCH its whole profile on every save without
             spending somebody's one correction on a value it did not change. */
          birthDate: optStr(ctx.body, 'birthDate'),
          clear,
        },
        ctx.at,
      );
      return await me(ctx, updated);
    },
  },
  {
    /**
     * Onboarding is finished — a route of its own, not a field on `PATCH /v1/me`.
     *
     * Three reasons it is not a field. It **grants points**, and a profile edit
     * that can move the ledger as a side effect of a key the client happened to
     * include is the kind of coupling nobody remembers at the call site. It is
     * **once-only**, so its answer is not the new profile but whether *this*
     * call was the one that paid — a shape `PATCH` has nowhere to put. And it
     * takes **no input at all**: the server already knows who is asking and
     * whether they have asked before.
     *
     * Safe to send twice. `accounts.completeOnboarding` claims the row with an
     * `UPDATE … WHERE onboarded_at IS NULL`, so a retry, a second device or a
     * lost response all get `granted: false` and the same timestamp rather than
     * a second bonus or an error.
     */
    method: 'POST',
    pattern: '/v1/me/onboarded',
    auth: 'user',
    handler: async (ctx) => {
      /* It grants points, so it is behind the address — the gate is at the
         route rather than in `completeOnboarding` because the domain function
         is also how a fixture and the demo seed finish onboarding, and neither
         of those is a client with an inbox. */
      await verification.assertVerified(ctx.db, actor(ctx).user.id);
      return await accounts.completeOnboarding(ctx.db, actor(ctx).user.id, ctx.at);
    },
  },
  {
    method: 'POST',
    pattern: '/v1/me/password',
    auth: 'user',
    /* This route takes the *current* password, so an unbounded one is a
       password oracle for whoever holds a stolen session token. */
    limit: { perHour: CONFIG.limits.passwordChangePerHour, by: 'account' },
    handler: async (ctx) => {
      await accounts.changePassword(
        ctx.db,
        actor(ctx).user.id,
        str(ctx.body, 'current'),
        str(ctx.body, 'next'),
      );
      return { ok: true };
    },
  },
  {
    /**
     * Register the signed-in account as a venue owner.
     *
     * The site calls this the moment somebody chooses “Business owner”, which
     * with Google is *after* the session already exists — see `becomePartner`.
     * Granting a role a person selects is only alarming when the role is
     * `admin`, and that one is grantable nowhere.
     */
    method: 'POST',
    pattern: '/v1/me/partner',
    auth: 'user',
    handler: async (ctx) => await accounts.becomePartner(ctx.db, actor(ctx).user.id, ctx.at),
  },
  {
    /* §1.2: one identity, two experiences, the active one held in the session. */
    method: 'POST',
    pattern: '/v1/me/mode',
    auth: 'user',
    handler: async (ctx) => {
      const { user, session } = actor(ctx);
      const mode = oneOf(ctx.body, 'mode', ['consumer', 'partner', 'admin'] as const);
      await accounts.setMode(ctx.db, session.id, user.id, mode);
      return { mode };
    },
  },

  /* ───────────────────────────────────────────────────────────── consent ── */
  {
    method: 'GET',
    pattern: '/v1/me/consents',
    auth: 'user',
    handler: async (ctx) => {
      const { user } = actor(ctx);
      return {
        account: await Promise.all((['terms', 'privacy', 'marketing', 'analytics'] as const).map(async (kind) => ({
          kind,
          granted: await consent.has(ctx.db, user.id, kind),
        }))),
        /* §1.4 is a *separate* list on purpose: bundling it under "consents"
           is the presentational version of bundling it into the terms. */
        dataSharing: await consent.sharingWith(ctx.db, user.id),
      };
    },
  },
  {
    method: 'POST',
    pattern: '/v1/me/consents',
    auth: 'user',
    handler: async (ctx) => {
      await consent.record(ctx.db, {
        userId: actor(ctx).user.id,
        kind: oneOf(ctx.body, 'kind', ['terms', 'privacy', 'marketing', 'analytics'] as const),
        granted: bool(ctx.body, 'granted', true),
        source: 'api',
        at: ctx.at,
      });
      return { ok: true };
    },
  },
  {
    method: 'POST',
    pattern: '/v1/me/sharing/:venueId',
    auth: 'user',
    handler: async (ctx) => {
      const id = await consent.grantSharing(ctx.db, {
        userId: actor(ctx).user.id,
        venueId: ctx.params.venueId,
        at: ctx.at,
      });
      return { id, granted: true };
    },
  },
  {
    method: 'DELETE',
    pattern: '/v1/me/sharing/:venueId',
    auth: 'user',
    handler: async (ctx) => ({
      revoked: await consent.revokeSharing(ctx.db, actor(ctx).user.id, ctx.params.venueId, ctx.at),
    }),
  },

  /* ────────────────────────────────────────────────────────────── GDPR ── */
  {
    method: 'GET',
    pattern: '/v1/me/export',
    auth: 'user',
    handler: async (ctx) => await consent.exportUser(ctx.db, actor(ctx).user.id),
  },
  {
    method: 'DELETE',
    pattern: '/v1/me',
    auth: 'user',
    handler: async (ctx) => {
      const { user } = actor(ctx);
      /* Typing the address is the confirmation step. An erasure that a mistyped
         DELETE can trigger is one nobody can undo. */
      if (optStr(ctx.body, 'confirmEmail')?.toLowerCase() !== (user.email ?? '').toLowerCase()) {
        throw new DomainError('validation_failed', 'confirm with the account email', {
          field: 'confirmEmail',
        });
      }
      return await consent.eraseUser(ctx.db, user.id, ctx.at);
    },
  },
];
