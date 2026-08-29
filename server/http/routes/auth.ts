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
function me(ctx: Ctx, fresh?: accounts.User) {
  const { user: resolved, session, roles } = actor(ctx);
  const user = fresh ?? resolved;
  const ent = entitlements.entitlementsFor(ctx.db, { userId: user.id });
  const plan = entitlements.planFor(ctx.db, { userId: user.id });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.display_name,
      language: user.language,
      city: user.city,
      phone: user.phone,
      /* Sent beside the number, never instead of it: a client that shows a
         number with no verification state has told the reader it is verified. */
      phoneVerified: user.phone_verified === 1,
      headline: user.headline,
      birthDate: user.birth_date,
      /* Null means "not yet", which is the only way a client can know whether
         to offer onboarding — and `POST /v1/me/onboarded` is idempotent
         precisely so a client that guesses wrong costs nothing. */
      onboardedAt: user.onboarded_at,
      trustTier: user.trust_tier,
      leaderboardOptIn: user.leaderboard_opt_in === 1,
      referralCode: user.referral_code,
      createdAt: user.created_at,
    },
    roles,
    mode: session.mode,
    /* The balance is read from the ledger, not the cache, on the one endpoint
       where being right matters more than being fast. */
    points: ledger.balance(ctx.db, user.id),
    plan: { code: plan.code, name: plan.name, audience: plan.audience },
    entitlements: ent,
    venues: ctx.db.all(
      `SELECT id, name, city, status FROM venues WHERE owner_user_id = $u AND deleted_at IS NULL`,
      { u: user.id },
    ),
  };
}

export const authRoutes: Route[] = [
  {
    method: 'POST',
    pattern: '/v1/auth/signup',
    auth: 'none',
    handler: async (ctx) => {
      const user = await accounts.signUp(ctx.db, {
        email: str(ctx.body, 'email'),
        password: str(ctx.body, 'password'),
        name: str(ctx.body, 'name', { max: 120 }),
        language: optStr(ctx.body, 'language'),
        city: optStr(ctx.body, 'city'),
        partner: bool(ctx.body, 'partner'),
        referralCode: optStr(ctx.body, 'referralCode'),
        provisionalId: optStr(ctx.body, 'provisionalId'),
        at: ctx.at,
      });
      const session = accounts.createSession(ctx.db, {
        userId: user.id,
        mode: bool(ctx.body, 'partner') ? 'partner' : 'consumer',
        surface: oneOf(ctx.body, 'surface', ['web', 'mobile'] as const, 'web'),
        deviceFingerprint: optStr(ctx.body, 'device'),
        at: ctx.at,
      });
      ctx.res.setHeader('set-cookie', cookieFor(session.token, 30));
      return { token: session.token, user: { id: user.id, name: user.display_name, email: user.email } };
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

      const user = accounts.linkGoogleAccount(ctx.db, {
        sub: identity.sub,
        email: identity.email,
        name: identity.name,
        language: optStr(ctx.body, 'language'),
        at: ctx.at,
      });

      const result = accounts.sessionForUser(ctx.db, {
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
    method: 'POST',
    pattern: '/v1/auth/signout',
    auth: 'user',
    handler: (ctx) => {
      accounts.signOut(ctx.db, actor(ctx).session.id, ctx.at);
      ctx.res.setHeader('set-cookie', 'paylez_session=; Path=/; HttpOnly; Max-Age=0');
      return { ok: true };
    },
  },
  {
    /* §1.1 provisional identity: play first, sign up later, keep the points. */
    method: 'POST',
    pattern: '/v1/auth/guest',
    auth: 'none',
    handler: (ctx) => {
      const user = accounts.provisional(ctx.db, str(ctx.body, 'device'), ctx.at);
      const session = accounts.createSession(ctx.db, {
        userId: user.id,
        mode: 'consumer',
        surface: oneOf(ctx.body, 'surface', ['web', 'mobile'] as const, 'mobile'),
        deviceFingerprint: str(ctx.body, 'device'),
        at: ctx.at,
      });
      return { token: session.token, userId: user.id, provisional: true };
    },
  },
  { method: 'GET', pattern: '/v1/me', auth: 'user', handler: me },
  {
    method: 'PATCH',
    pattern: '/v1/me',
    auth: 'user',
    handler: (ctx) => {
      const { user } = actor(ctx);
      /* The opt-in first, the profile second, because the profile write is the
         one whose returned row is rendered — and it has to have seen both. */
      if (ctx.body.leaderboardOptIn !== undefined) {
        social.setLeaderboardOptIn(ctx.db, user.id, bool(ctx.body, 'leaderboardOptIn'));
      }
      const updated = accounts.updateProfile(
        ctx.db,
        user.id,
        {
          name: optStr(ctx.body, 'name'),
          language: optStr(ctx.body, 'language'),
          city: optStr(ctx.body, 'city'),
          avatar: optStr(ctx.body, 'avatar') ?? null,
          phone: optStr(ctx.body, 'phone'),
          headline: optStr(ctx.body, 'headline'),
          /* Sending this a second time is refused with a 409, not ignored — a
             birthday is write-once and a client that resends its whole profile
             on every save has to leave this key out once it is set. */
          birthDate: optStr(ctx.body, 'birthDate'),
        },
        ctx.at,
      );
      return me(ctx, updated);
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
    handler: (ctx) => accounts.completeOnboarding(ctx.db, actor(ctx).user.id, ctx.at),
  },
  {
    method: 'POST',
    pattern: '/v1/me/password',
    auth: 'user',
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
    /* §1.2: one identity, two experiences, the active one held in the session. */
    method: 'POST',
    pattern: '/v1/me/mode',
    auth: 'user',
    handler: (ctx) => {
      const { user, session } = actor(ctx);
      const mode = oneOf(ctx.body, 'mode', ['consumer', 'partner', 'admin'] as const);
      accounts.setMode(ctx.db, session.id, user.id, mode);
      return { mode };
    },
  },

  /* ───────────────────────────────────────────────────────────── consent ── */
  {
    method: 'GET',
    pattern: '/v1/me/consents',
    auth: 'user',
    handler: (ctx) => {
      const { user } = actor(ctx);
      return {
        account: (['terms', 'privacy', 'marketing', 'analytics'] as const).map((kind) => ({
          kind,
          granted: consent.has(ctx.db, user.id, kind),
        })),
        /* §1.4 is a *separate* list on purpose: bundling it under "consents"
           is the presentational version of bundling it into the terms. */
        dataSharing: consent.sharingWith(ctx.db, user.id),
      };
    },
  },
  {
    method: 'POST',
    pattern: '/v1/me/consents',
    auth: 'user',
    handler: (ctx) => {
      consent.record(ctx.db, {
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
    handler: (ctx) => {
      const id = consent.grantSharing(ctx.db, {
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
    handler: (ctx) => ({
      revoked: consent.revokeSharing(ctx.db, actor(ctx).user.id, ctx.params.venueId, ctx.at),
    }),
  },

  /* ────────────────────────────────────────────────────────────── GDPR ── */
  {
    method: 'GET',
    pattern: '/v1/me/export',
    auth: 'user',
    handler: (ctx) => consent.exportUser(ctx.db, actor(ctx).user.id),
  },
  {
    method: 'DELETE',
    pattern: '/v1/me',
    auth: 'user',
    handler: (ctx) => {
      const { user } = actor(ctx);
      /* Typing the address is the confirmation step. An erasure that a mistyped
         DELETE can trigger is one nobody can undo. */
      if (optStr(ctx.body, 'confirmEmail')?.toLowerCase() !== (user.email ?? '').toLowerCase()) {
        throw new DomainError('validation_failed', 'confirm with the account email', {
          field: 'confirmEmail',
        });
      }
      return consent.eraseUser(ctx.db, user.id, ctx.at);
    },
  },
];
