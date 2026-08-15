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
import type { Ctx, Route } from '../router.ts';

const cookieFor = (token: string, maxAgeDays: number): string => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `paylez_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${
    maxAgeDays * 86400
  }`;
};

function me(ctx: Ctx) {
  const { user, session, roles } = actor(ctx);
  const ent = entitlements.entitlementsFor(ctx.db, { userId: user.id });
  const plan = entitlements.planFor(ctx.db, { userId: user.id });

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.display_name,
      language: user.language,
      city: user.city,
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
      accounts.updateProfile(ctx.db, user.id, {
        name: optStr(ctx.body, 'name'),
        language: optStr(ctx.body, 'language'),
        city: optStr(ctx.body, 'city'),
        avatar: optStr(ctx.body, 'avatar') ?? null,
      });
      if (ctx.body.leaderboardOptIn !== undefined) {
        social.setLeaderboardOptIn(ctx.db, user.id, bool(ctx.body, 'leaderboardOptIn'));
      }
      return me(ctx);
    },
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
