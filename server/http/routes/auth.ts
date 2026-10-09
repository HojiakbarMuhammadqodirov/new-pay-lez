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
import * as media from '../../domain/media.ts';
import * as social from '../../domain/social.ts';
import * as verification from '../../domain/verification.ts';
import { DomainError } from '../../domain/errors.ts';
import { actor, bool, oneOf, optStr, str } from '../input.ts';
import { CONFIG } from '../../config.ts';
import { exchangeGoogleCode, verifyGoogleIdToken } from '../../crypto/google.ts';
import type { Ctx, Route } from '../router.ts';

/**
 * The guest account a sign-up may fold in: `provisionalId` from the body, and
 * only when the request is signed in **as that guest** (the app sends the
 * guest's bearer token with the sign-up, as it does with every call).
 *
 * The id alone was trusted before, and `merge` checks only that the target is
 * provisional — so anybody holding a guest's `usr_…` id could sign up and take
 * that guest's points, games and handle. An id that is not proven is ignored
 * rather than refused: the sign-up itself is still wanted.
 */
const ownGuest = (ctx: Ctx): string | undefined => {
  const named = optStr(ctx.body, 'provisionalId');
  return named && ctx.actor?.user.id === named ? named : undefined;
};

const cookieFor = (token: string, maxAgeDays: number): string => {
  /* `Secure` on any deployment. It keyed on `NODE_ENV=production` alone, which
     nothing in DEPLOY.md or the env example sets, so production's session
     cookie could travel over plain http. A Postgres URL is the other sign of a
     real deployment (a laptop runs on the SQLite file); browsers accept a
     Secure cookie on http://localhost anyway. */
  const secure =
    process.env.NODE_ENV === 'production' || process.env.PAYLEZ_PG_URL ? '; Secure' : '';
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
       * When the address was proved, or null. A Google sign-in stamps it, and
       * so does a code (`POST /v1/auth/email/verify`, or a password reset).
       */
      emailVerifiedAt: user.email_verified_at,
      /*
       * Whether buying a voucher or redeeming a gift card would be refused for
       * an unproved address right now (`domain/verification.ts`). False for a
       * proved, Google, address-less or pre-`verifySince` account, and false
       * for everybody while no mail transport is configured. A client asks for
       * the code before the spend rather than after the 403.
       */
      emailVerificationRequired: await verification.required(ctx.db, user.id),
      /* §1.4's standing answer, which is always on now and cannot be switched
         off (see the PATCH below). Still sent, and always `true`, because the
         app draws a switch from it; a client may stop drawing one. A constant
         rather than the column, so the answer cannot say "off" for any row the
         boot has not yet normalised. */
      venueSharingDefault: true,
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
 * A function rather than two copies of one call, because it is reached from
 * sign-up and from the resend route, and the `language` argument is the part
 * that would be forgotten in one of them. `ctx.language` is the account's own
 * setting first and the header second (see `languageOf`), which is the right
 * order for a message somebody reads in a mail client rather than in this
 * browser.
 */
/**
 * Whether a referral code sent with a sign-up actually bound.
 *
 * Reported rather than refused: a sign-up that failed over a mistyped invite
 * code would be the wrong trade, and the Flutter app already sends the field
 * and cannot learn a new refusal retroactively. `null` when no code was sent.
 * The web form checks the code first (`GET /v1/referrals/codes/:code`), so for
 * it this is a confirmation rather than news.
 */
async function referralOutcome(ctx: Ctx, userId: string, sent: string | undefined) {
  if (!sent) return null;
  const bond = await ctx.db.get<{ id: string }>(`SELECT id FROM referrals WHERE referred_id = $u`, { u: userId });
  return { applied: Boolean(bond) };
}

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
        provisionalId: ownGuest(ctx),
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
       * The first confirmation code, sent here so a client cannot forget to
       * ask. **A failure does not fail the sign-up**: the account and session
       * are real, and the code can be re-sent from the app at any time. The
       * outcome is reported (without the code) so the client can say so.
       */
      const verificationSent = await verification
        .sendCode(ctx.db, { userId: user.id, language: ctx.language, at: ctx.at })
        .catch((error: unknown) => {
          console.warn(`sign-up code not sent: ${(error as Error).message}`);
          return null;
        });

      return {
        token: session.token,
        user: { id: user.id, name: user.display_name, email: user.email },
        verification: verificationSent,
        /* Additive: whether a typed invite code was bound (the website shows it). */
        referral: await referralOutcome(ctx, user.id, optStr(ctx.body, 'referralCode')),
      };
    },
  },
  {
    method: 'POST',
    pattern: '/v1/auth/signin',
    auth: 'none',
    /* Per connection, beside the per-address failure throttle in
       `accounts.signIn` — see `CONFIG.limits.signInPerHour`. */
    limit: { perHour: CONFIG.limits.signInPerHour, by: 'connection' },
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
        /* Strictly compared, for the reason the sign-up route gives: every
           truthiness test in JavaScript reads the string "false" as true, and
           this is a field a client might serialise from a checkbox. */
        acceptTerms: ctx.body.acceptTerms === true,
        /* Bound only when this call creates the account; see the domain. */
        referralCode: optStr(ctx.body, 'referralCode'),
        at: ctx.at,
      });

      /*
       * The guest's points come with them.
       *
       * `signUp` has always done this and this route never did, which was fine
       * while only the web called it — the site has no provisional accounts.
       * The phone does, and the guest path is its main road: somebody plays the
       * welcome round, then signs in with Google, and without this the ledger
       * they earned stays on a `provisional` row nothing can reach again.
       *
       * Guarded rather than trusted. `merge` refuses anything that is not
       * provisional, so a client sending somebody else's id gets a `conflict`
       * rather than a transfer; merging onto the account already signed in is
       * skipped rather than treated as an error.
       */
      const provisionalId = ownGuest(ctx);
      if (provisionalId && provisionalId !== user.id) {
        await accounts.merge(ctx.db, provisionalId, user.id, ctx.at);
      }

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
        referral: await referralOutcome(ctx, result.user.id, optStr(ctx.body, 'referralCode')),
      };
    },
  },
  {
    /**
     * Send (or resend) the confirmation code to the signed-in account's own
     * address. Authenticated, so there is no address to enumerate and no
     * stranger's inbox to post to. A cooldown refusal is not an error: it
     * comes back `sent: false` with `nextSendAt`. **The code is never in the
     * response.**
     */
    method: 'POST',
    pattern: '/v1/auth/email/send-code',
    auth: 'user',
    limit: { perHour: CONFIG.limits.sendCodePerHour, by: 'account' },
    handler: async (ctx) =>
      await verification.sendCode(ctx.db, { userId: actor(ctx).user.id, language: ctx.language, at: ctx.at }),
  },
  {
    /**
     * Confirm the code: `{ code }` → `{ verified, granted }`. Rate-limited per
     * account on top of the five-attempt cap per code, which bounds burning
     * through codes by alternating guesses with resends.
     */
    method: 'POST',
    pattern: '/v1/auth/email/verify',
    auth: 'user',
    limit: { perHour: CONFIG.limits.verifyEmailPerHour, by: 'account' },
    handler: async (ctx) =>
      await verification.confirm(ctx.db, { userId: actor(ctx).user.id, code: str(ctx.body, 'code'), at: ctx.at }),
  },
  {
    /**
     * Ask for a password-reset code: `{ email }` → always `{ ok: true }`,
     * whether or not the address has an account, so this cannot be used to
     * find out which addresses do.
     */
    method: 'POST',
    pattern: '/v1/auth/password/reset-code',
    auth: 'none',
    limit: { perHour: CONFIG.limits.resetCodePerHour, by: 'connection' },
    handler: async (ctx) => {
      await verification.requestReset(ctx.db, { email: str(ctx.body, 'email'), language: ctx.language, at: ctx.at });
      return { ok: true };
    },
  },
  {
    /**
     * Set a new password with the code: `{ email, code, password }` →
     * `{ reset: true }`. Every open session is dropped; the client signs in
     * with the new password. Every code failure reads the same.
     */
    method: 'POST',
    pattern: '/v1/auth/password/reset',
    auth: 'none',
    limit: { perHour: CONFIG.limits.resetPasswordPerHour, by: 'connection' },
    handler: async (ctx) =>
      await verification.completeReset(ctx.db, {
        email: str(ctx.body, 'email'),
        code: str(ctx.body, 'code'),
        password: str(ctx.body, 'password'),
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
       * §1.4's standing answer — "share my profile with venues I visit" — is
       * **always on** now (2026-10-08), and no client may switch it off.
       *
       * The key is still *accepted*, because the app already on people's
       * phones sends it and a 400 for a key it has always sent would break its
       * whole profile save. It is read for shape and then **ignored**: neither
       * `true` nor `false` writes anything. The column is held at 1 by the boot
       * (`sharingAlwaysOn` in `db/db.ts` / `db/pg.ts`), which is also what took
       * every stored opt-out back — see the note there for why that is a
       * rewrite and not a read-side override. `consent.setSharingDefault` is
       * kept for the test suite's isolation of the consent gate and is called
       * from no route.
       */
      if (ctx.body.venueSharingDefault !== undefined) bool(ctx.body, 'venueSharingDefault');
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
    handler: async (ctx) => await accounts.completeOnboarding(ctx.db, actor(ctx).user.id, ctx.at),
  },
  {
    /**
     * Whether a username can be had — the as-you-type check.
     *
     * `{username, available, mine, reason, message, suggestions}`: `reason` is
     * one of `length`, `shape`, `reserved`, `taken` (null when available), and
     * `message` is the sentence `PATCH /v1/me` would refuse with. `mine` is an
     * account asking about its own handle, which is available to it.
     *
     * Advice, not a reservation: the `PATCH` is what claims the name, and a
     * second claim on it is still a 409. Signed-in only and bounded per
     * account, because an open existence check over every handle is a
     * directory of who is on the product.
     */
    method: 'GET',
    pattern: '/v1/usernames/:name',
    auth: 'user',
    limit: { perHour: CONFIG.limits.usernameCheckPerHour, by: 'account' },
    handler: async (ctx) =>
      /* Already decoded by the router; decoding twice would throw on a `%`. */
      await accounts.usernameAvailability(ctx.db, actor(ctx).user.id, ctx.params.name),
  },
  {
    /**
     * Three free handles for this account before anything is typed —
     * `{suggestions}`, built from its name and the part of its address before
     * the `@`. What a "create your username" step opens with. Advice, like the
     * check above, and bounded by the same per-account ceiling.
     */
    method: 'GET',
    pattern: '/v1/usernames',
    auth: 'user',
    limit: { perHour: CONFIG.limits.usernameCheckPerHour, by: 'account' },
    handler: async (ctx) => await accounts.usernameSuggestions(ctx.db, actor(ctx).user.id),
  },
  {
    /**
     * Set or change the username — `{username}` — and nothing else.
     *
     * The same write `PATCH /v1/me {username}` makes (one rule, in
     * `accounts.updateProfile`), on a route of its own for two reasons. It is
     * **bounded like a write**: a handle is the one profile answer other people
     * read, and changing it every few seconds is impersonation by rotation, so
     * `CONFIG.limits.usernameSetPerHour` caps it per account where the profile
     * PATCH has no ceiling. And a client's username step has exactly one thing
     * to send, so it should not have to know which other keys the PATCH would
     * also act on. Answers with the whole account, like the PATCH; a taken name
     * is `409 conflict` naming `username`, anything else a `400` naming it.
     */
    method: 'PUT',
    pattern: '/v1/me/username',
    auth: 'user',
    limit: { perHour: CONFIG.limits.usernameSetPerHour, by: 'account' },
    handler: async (ctx) => {
      const updated = await accounts.updateProfile(
        ctx.db,
        actor(ctx).user.id,
        { username: str(ctx.body, 'username'), clear: [] },
        ctx.at,
      );
      return await me(ctx, updated);
    },
  },
  {
    /**
     * Upload a profile photo: `{image}` — base64, or a whole `data:` URL.
     *
     * JPEG, PNG or WebP **by the bytes**, at most `CONFIG.media.avatarMaxBytes`
     * decoded (2 MB). Stored in `media_assets` and served back at
     * `GET /v1/media/user/:id?v=…`, which is what `avatar` on the account now
     * reads — a path on this API, so a client joins it to its API base. Answers
     * with the whole account, as `PATCH /v1/me` does; a photo that finishes the
     * seven answers pays the profile bonus here exactly as it would there.
     */
    method: 'POST',
    pattern: '/v1/me/avatar',
    auth: 'user',
    limit: { perHour: CONFIG.limits.avatarUploadPerHour, by: 'account' },
    /* base64 is 4/3 of the bytes, plus a little for the JSON around it. */
    maxBody: Math.ceil((CONFIG.media.avatarMaxBytes * 4) / 3) + 4096,
    handler: async (ctx) => {
      const raw = str(ctx.body, 'image');
      const encoded = raw.startsWith('data:') ? raw.slice(raw.indexOf(',') + 1) : raw;
      if (!/^[A-Za-z0-9+/\s]*={0,2}\s*$/.test(encoded)) {
        throw new DomainError('validation_failed', 'image is base64', { field: 'avatar' });
      }
      const updated = await media.storeAvatar(ctx.db, actor(ctx).user.id, Buffer.from(encoded, 'base64'), ctx.at);
      return await me(ctx, updated);
    },
  },
  {
    /** Remove the profile photo. The same as `PATCH /v1/me {avatar: null}`, plus the stored bytes go. */
    method: 'DELETE',
    pattern: '/v1/me/avatar',
    auth: 'user',
    handler: async (ctx) => await me(ctx, await media.removeAvatar(ctx.db, actor(ctx).user.id, ctx.at)),
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
        /* Venue ids switched off and not back on. Additive: it is what lets a
           client draw an undecided venue by the account's default and a
           declined one as off. */
        sharingWithdrawn: await consent.sharingWithdrawn(ctx.db, user.id),
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
