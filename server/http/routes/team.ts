/**
 * The team's endpoints — Staff and Manager workspaces. See `server/TEAM.md`.
 *
 * Three groups, and the authorisation of each is the point of it:
 *
 *   * **The owner's team sheet** (`/v1/partner/venues/:venueId/team…`): the
 *     owner, an admin, or this venue's manager — and a manager only over
 *     cashiers, shift leads and custom members (`team.ts`'s `assertCanManage`).
 *   * **Joining and the switcher** (`/v1/team/join`, `/v1/me/workspaces`): any
 *     signed-in account that is not a guest.
 *   * **The counter** (`/v1/team/:venueId/…`): anybody on this venue's counter,
 *     each act gated by its own permission bit.
 *
 * Every route is `auth: 'user'` and decides the venue question itself, from the
 * rows, on every request. None of them trusts a role, a permission or a venue id
 * the phone sends — a member id from the owner's shared device is a *request*
 * to attribute, checked like one.
 */
import * as limits from '../../domain/limits.ts';
import * as team from '../../domain/team.ts';
import { DomainError } from '../../domain/errors.ts';
import { actor, bool, oneOf, optStr, str } from '../input.ts';
import type { Ctx, Route } from '../router.ts';

const role = (ctx: Ctx, required: boolean): team.TeamRole | undefined =>
  required || ctx.body.role !== undefined
    ? oneOf(ctx.body, 'role', team.TEAM_ROLES)
    : undefined;

/** The daily-rotating connection key `limits.ts` defines — the same one the route limiter buckets on. */
const connectionOf = (ctx: Ctx): string =>
  limits.connectionKey(ctx.secret, ctx.at.slice(0, 10), ctx.ip);

export const teamRoutes: Route[] = [
  /* ═══════════════════════════════════════════════════ the owner's sheet ══ */
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:venueId/team',
    auth: 'user',
    handler: async (ctx) => {
      await team.requireManage(ctx.db, ctx.params.venueId, actor(ctx).user.id);
      return { members: await team.listTeam(ctx.db, ctx.params.venueId) };
    },
  },
  {
    /* The code in the answer is the only time it exists in the clear. */
    method: 'POST',
    pattern: '/v1/partner/venues/:venueId/team',
    auth: 'user',
    limit: { perHour: 60, by: 'account' },
    handler: async (ctx) => {
      const { user } = actor(ctx);
      const access = await team.requireManage(ctx.db, ctx.params.venueId, user.id);
      return await team.createMember(ctx.db, {
        venueId: ctx.params.venueId,
        access,
        actorId: user.id,
        name: str(ctx.body, 'name', { max: 60 }),
        role: role(ctx, true)!,
        perms: ctx.body.perms,
        secret: ctx.secret,
        at: ctx.at,
      });
    },
  },
  {
    method: 'PATCH',
    pattern: '/v1/partner/venues/:venueId/team/:memberId',
    auth: 'user',
    handler: async (ctx) => {
      const { user } = actor(ctx);
      const access = await team.requireManage(ctx.db, ctx.params.venueId, user.id);
      return {
        member: await team.updateMember(ctx.db, {
          venueId: ctx.params.venueId,
          memberId: ctx.params.memberId,
          access,
          actorId: user.id,
          role: role(ctx, false),
          perms: ctx.body.perms,
          at: ctx.at,
        }),
      };
    },
  },
  {
    /* 204. Their workspace disappears at once: nothing about access is cached. */
    method: 'DELETE',
    pattern: '/v1/partner/venues/:venueId/team/:memberId',
    auth: 'user',
    handler: async (ctx) => {
      const { user } = actor(ctx);
      const access = await team.requireManage(ctx.db, ctx.params.venueId, user.id);
      await team.revokeMember(ctx.db, {
        venueId: ctx.params.venueId,
        memberId: ctx.params.memberId,
        access,
        actorId: user.id,
        at: ctx.at,
      });
    },
  },
  {
    method: 'POST',
    pattern: '/v1/partner/venues/:venueId/team/:memberId/code',
    auth: 'user',
    limit: { perHour: 60, by: 'account' },
    handler: async (ctx) => {
      const { user } = actor(ctx);
      const access = await team.requireManage(ctx.db, ctx.params.venueId, user.id);
      return await team.reissueCode(ctx.db, {
        venueId: ctx.params.venueId,
        memberId: ctx.params.memberId,
        access,
        actorId: user.id,
        secret: ctx.secret,
        at: ctx.at,
      });
    },
  },

  /* ═══════════════════════════════════════════ joining and the switcher ══ */
  {
    /*
     * Redeem a join code. The hard limit — five *failed* attempts an hour per
     * account and per connection — lives in the domain and is always on,
     * including under the suite; the route `limit` below is only the ordinary
     * ceiling on calls, and exists so that a script that somehow succeeds a lot
     * is still bounded.
     */
    method: 'POST',
    pattern: '/v1/team/join',
    auth: 'user',
    limit: { perHour: 30, by: 'account' },
    handler: async (ctx) => {
      const { user } = actor(ctx);
      const raw = ctx.body.code;
      /* Any string is a guess and costs one; a missing field is a malformed
         request and costs nothing, because it cannot have matched anything. */
      if (typeof raw !== 'string' && typeof raw !== 'number') {
        throw new DomainError('validation_failed', 'code is required', { field: 'code' });
      }
      /* Bounded before it is hashed; anything longer than six digits misses anyway. */
      const typed = String(raw).slice(0, 32);
      return await team.join(ctx.db, {
        userId: user.id,
        userStatus: user.status,
        code: typed,
        secret: ctx.secret,
        connection: connectionOf(ctx),
        at: ctx.at,
      });
    },
  },
  {
    method: 'GET',
    pattern: '/v1/me/workspaces',
    auth: 'user',
    handler: async (ctx) => ({ workspaces: await team.workspacesFor(ctx.db, actor(ctx).user.id) }),
  },

  /* ═════════════════════════════════════════════════════════ the counter ══ */
  {
    /* `?memberId=` from the owner's (or a manager's) shared device shows the
       counter as that member would see it. */
    method: 'GET',
    pattern: '/v1/team/:venueId/counter',
    auth: 'user',
    handler: async (ctx) => {
      const access = await team.accessTo(ctx.db, ctx.params.venueId, actor(ctx).user.id);
      if (!access) throw new DomainError('forbidden', 'you are not on this venue’s team');
      return await team.counterView(ctx.db, {
        venueId: ctx.params.venueId,
        access,
        memberId: ctx.query.get('memberId') ?? undefined,
        language: ctx.language,
        at: ctx.at,
      });
    },
  },
  {
    method: 'POST',
    pattern: '/v1/team/:venueId/shift',
    auth: 'user',
    handler: async (ctx) => {
      const access = await team.accessTo(ctx.db, ctx.params.venueId, actor(ctx).user.id);
      if (!access) throw new DomainError('forbidden', 'you are not on this venue’s team');
      return {
        member: await team.setShift(ctx.db, {
          venueId: ctx.params.venueId,
          access,
          action: oneOf(ctx.body, 'action', ['start', 'end'] as const),
          memberId: optStr(ctx.body, 'memberId'),
          at: ctx.at,
        }),
      };
    },
  },
  {
    method: 'POST',
    pattern: '/v1/team/:venueId/running/:id/pause',
    auth: 'user',
    handler: async (ctx) => {
      const { user } = actor(ctx);
      const access = await team.requireCounter(ctx.db, ctx.params.venueId, user.id, 'pause', { at: ctx.at });
      if (ctx.body.paused === undefined || ctx.body.paused === null) {
        throw new DomainError('validation_failed', 'paused is required', { field: 'paused' });
      }
      return {
        item: await team.setPaused(ctx.db, {
          venueId: ctx.params.venueId,
          itemId: ctx.params.id,
          paused: bool(ctx.body, 'paused'),
          actorId: user.id,
          actorRole: access.via,
          language: ctx.language,
          at: ctx.at,
        }),
      };
    },
  },
];
