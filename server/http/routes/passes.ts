/**
 * Subscription passes (`domain/passes.ts`) — the partner screen, the counter,
 * and the customer's side.
 *
 * Three audiences, three gates, and each is the one its neighbours already use:
 *
 *   * **The Passes screen** is `auth: 'partner'` behind `gate.requireStaff` —
 *     the owner, an admin, or this venue's manager — like every other route
 *     under `/v1/partner/venues/:id`. Creating, publishing and resuming also
 *     need the venue's plan to include `passes` (Growth and Chain).
 *   * **The counter** is `auth: 'user'` behind `team.requireCounter`: looking a
 *     code up needs `scan`, using it needs `redeem` — the bit that already
 *     confirms voucher and reward redemptions, because handing over something
 *     the customer already paid for is the same act. `memberId` is the shared
 *     device naming who is on shift, and lands on `confirmed_member_id`.
 *   * **The customer** reads a venue's live passes with no account, and their
 *     own with one. Subscribing is the one press that would take money, and it
 *     answers `not_available` unless `CONFIG.passes.selfServeSubscribe` is on —
 *     see `ports/passPayments.ts` for why it is off.
 */
import * as entitlements from '../../domain/entitlements.ts';
import * as gate from '../../domain/gate.ts';
import * as passes from '../../domain/passes.ts';
import * as team from '../../domain/team.ts';
import { CONFIG } from '../../config.ts';
import { DomainError } from '../../domain/errors.ts';
import { getVenue } from '../../domain/venues.ts';
import { actor, oneOf, optInt, optStr, str } from '../input.ts';
import type { Ctx, Route } from '../router.ts';

type Bag = Record<string, unknown>;

/** The venue in the path, with the caller's dashboard access to it checked. */
async function mine(ctx: Ctx): Promise<string> {
  await gate.requireStaff(ctx.db, ctx.params.id, actor(ctx).user.id);
  return (await getVenue(ctx.db, ctx.params.id)).id;
}

const requirePasses = async (ctx: Ctx, venueId: string) =>
  entitlements.requireEntitlement(await entitlements.entitlementsFor(ctx.db, { venueId }), 'passes');

/**
 * The drawer's body, read field by field. Only what was **sent** is set, and
 * `null` survives as a value on the nullable fields, because it is how a
 * discount, a day restriction or a cap is removed — the same reason
 * `partner.ts` reads `minSpendMinor: null` before `optInt` can fold it away.
 */
function passInput(body: Bag): passes.PassInput {
  const out: passes.PassInput = {};
  const has = (field: string) => body[field] !== undefined;
  const nullableInt = (field: string): number | null | undefined =>
    body[field] === null ? null : optInt(body, field);
  const nullableStr = (field: string): string | null | undefined => {
    if (body[field] === null) return null;
    if (!has(field)) return undefined;
    if (typeof body[field] !== 'string') {
      throw new DomainError('validation_failed', `${field} must be text`, { field });
    }
    return body[field] as string;
  };
  const choice = <T extends string>(field: string, allowed: readonly T[]): T | undefined =>
    has(field) && body[field] !== null ? oneOf(body, field, allowed) : undefined;
  const intList = (field: string): number[] | null | undefined => {
    if (body[field] === null) return null;
    if (!has(field)) return undefined;
    if (!Array.isArray(body[field])) throw new DomainError('validation_failed', `${field} must be a list`, { field });
    return (body[field] as unknown[]).map((item) => {
      if (typeof item !== 'number' || !Number.isInteger(item)) {
        throw new DomainError('validation_failed', `${field} holds whole numbers`, { field });
      }
      return item;
    });
  };

  out.template = choice('template', passes.PASS_TEMPLATES);
  if (has('name')) out.name = nullableStr('name') ?? '';
  out.tagline = nullableStr('tagline');
  out.accent = choice('accent', passes.PASS_ACCENTS);
  out.benefitItem = nullableStr('benefitItem');
  out.discountPct = nullableInt('discountPct');
  if (has('perks') && body.perks !== null) {
    if (!Array.isArray(body.perks)) throw new DomainError('validation_failed', 'perks must be a list', { field: 'perks' });
    out.perks = (body.perks as unknown[]).map((p) => String(p) as passes.PassPerk);
  }
  out.capKind = choice('capKind', passes.CAP_KINDS);
  out.capCount = optInt(body, 'capCount');
  if (has('unlimitedOk') && body.unlimitedOk !== null) {
    if (typeof body.unlimitedOk !== 'boolean') {
      throw new DomainError('validation_failed', 'unlimitedOk must be true or false', { field: 'unlimitedOk' });
    }
    out.unlimitedOk = body.unlimitedOk;
  }
  out.allowedDays = intList('allowedDays');
  out.fromMin = nullableInt('fromMin');
  out.toMin = nullableInt('toMin');
  out.maxValueMinor = nullableInt('maxValueMinor');
  out.seats = optInt(body, 'seats');
  out.priceMinor = optInt(body, 'priceMinor');
  out.billingPeriod = choice('billingPeriod', passes.BILLING_PERIODS);
  out.intro = choice('intro', passes.INTROS);
  out.subscriberCap = nullableInt('subscriberCap');
  out.costPerUseMinor = nullableInt('costPerUseMinor');

  /* Drop the keys that were not sent, so a patch cannot mistake "absent" for a value. */
  for (const key of Object.keys(out) as Array<keyof passes.PassInput>) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

export const passRoutes: Route[] = [
  /* ═════════════════════════════════════════════════ the Passes screen ══ */
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/passes',
    auth: 'partner',
    handler: async (ctx) => await passes.listForVenue(ctx.db, await mine(ctx), ctx.at),
  },
  {
    method: 'POST',
    pattern: '/v1/partner/venues/:id/passes',
    auth: 'partner',
    handler: async (ctx) => {
      const venueId = await mine(ctx);
      await requirePasses(ctx, venueId);
      return await passes.createPass(ctx.db, {
        venueId,
        actorId: actor(ctx).user.id,
        pass: passInput(ctx.body),
        at: ctx.at,
      });
    },
  },
  {
    /* Literal beats parameter in `Router.match`, so this cannot be read as a pass called "members". */
    method: 'GET',
    pattern: '/v1/partner/venues/:id/passes/members',
    auth: 'partner',
    handler: async (ctx) => {
      const venueId = await mine(ctx);
      /* Names are identified data: the Customers page's entitlement, and its consent rule in the query. */
      entitlements.requireEntitlement(await entitlements.entitlementsFor(ctx.db, { venueId }), 'identified_profiles');
      return await passes.members(ctx.db, venueId, { at: ctx.at });
    },
  },
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/passes/:passId',
    auth: 'partner',
    handler: async (ctx) => await passes.detail(ctx.db, await mine(ctx), ctx.params.passId, ctx.at),
  },
  {
    method: 'PATCH',
    pattern: '/v1/partner/venues/:id/passes/:passId',
    auth: 'partner',
    handler: async (ctx) =>
      await passes.updatePass(ctx.db, {
        venueId: await mine(ctx),
        passId: ctx.params.passId,
        actorId: actor(ctx).user.id,
        patch: passInput(ctx.body),
        at: ctx.at,
      }),
  },
  {
    method: 'DELETE',
    pattern: '/v1/partner/venues/:id/passes/:passId',
    auth: 'partner',
    handler: async (ctx) => {
      await passes.deleteDraft(ctx.db, {
        venueId: await mine(ctx),
        passId: ctx.params.passId,
        actorId: actor(ctx).user.id,
        at: ctx.at,
      });
      return { deleted: true };
    },
  },
  {
    method: 'POST',
    pattern: '/v1/partner/venues/:id/passes/:passId/status',
    auth: 'partner',
    handler: async (ctx) =>
      await passes.setStatus(ctx.db, {
        venueId: await mine(ctx),
        passId: ctx.params.passId,
        action: oneOf(ctx.body, 'action', passes.PASS_ACTIONS),
        actorId: actor(ctx).user.id,
        at: ctx.at,
      }),
  },
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/passes/:passId/subscribers',
    auth: 'partner',
    handler: async (ctx) => {
      const venueId = await mine(ctx);
      entitlements.requireEntitlement(await entitlements.entitlementsFor(ctx.db, { venueId }), 'identified_profiles');
      return await passes.members(ctx.db, venueId, { passId: ctx.params.passId, at: ctx.at });
    },
  },

  /* ══════════════════════════════════════════════════════ the counter ══ */
  {
    /* Writes nothing. `scan`, checked before the code is read, so another
       venue's staff get a 403 rather than learning whether it matched. */
    method: 'POST',
    pattern: '/v1/partner/venues/:id/passes/lookup',
    auth: 'user',
    handler: async (ctx) => {
      const access = await team.requireCounter(ctx.db, ctx.params.id, actor(ctx).user.id, 'scan', { at: ctx.at });
      return await passes.lookup(ctx.db, {
        venueId: ctx.params.id,
        code: str(ctx.body, 'code', { max: 32 }),
        via: access.via,
        at: ctx.at,
      });
    },
  },
  {
    /* Idempotent: a slow connection is exactly when a cashier presses twice,
       and a second press here would spend a second coffee. */
    method: 'POST',
    pattern: '/v1/partner/venues/:id/passes/redeem',
    auth: 'user',
    idempotent: true,
    handler: async (ctx) => {
      const memberId = optStr(ctx.body, 'memberId') ?? null;
      await team.requireCounter(ctx.db, ctx.params.id, actor(ctx).user.id, 'redeem', { memberId, at: ctx.at });
      return await passes.redeem(ctx.db, {
        venueId: ctx.params.id,
        actorId: actor(ctx).user.id,
        code: str(ctx.body, 'code', { max: 32 }),
        quantity: optInt(ctx.body, 'quantity', { min: 1, max: CONFIG.passes.maxPerRedeem }),
        billMinor: optInt(ctx.body, 'billMinor', { min: 1 }),
        transactionId: optStr(ctx.body, 'transactionId'),
        memberId,
        at: ctx.at,
      });
    },
  },

  /* ═════════════════════════════════════════════════════ the customer ══ */
  {
    method: 'GET',
    pattern: '/v1/venues/:id/passes',
    auth: 'none',
    handler: async (ctx) => ({
      passes: await passes.publicForVenue(ctx.db, ctx.params.id, ctx.actor?.user.id ?? null, ctx.at),
      subscribeAvailable: CONFIG.passes.selfServeSubscribe,
    }),
  },
  {
    method: 'GET',
    pattern: '/v1/me/passes',
    auth: 'user',
    handler: async (ctx) => ({ subscriptions: await passes.mine(ctx.db, actor(ctx).user.id, ctx.at) }),
  },
  {
    /*
     * Off unless `PAYLEZ_PASS_SUBSCRIBE=on`. There is no payment rail for a
     * venue-direct subscription, and a subscription created here would be a
     * pass nobody paid for — so the honest answer is a refusal that says so.
     */
    method: 'POST',
    pattern: '/v1/passes/:passId/subscribe',
    auth: 'user',
    idempotent: true,
    handler: async (ctx) => {
      if (!CONFIG.passes.selfServeSubscribe) {
        throw new DomainError('not_available', 'subscribing to a pass in the app is not available yet', {
          reason: 'payments_unavailable',
        });
      }
      return await passes.subscribe(ctx.db, { passId: ctx.params.passId, userId: actor(ctx).user.id, at: ctx.at });
    },
  },
  {
    method: 'POST',
    pattern: '/v1/me/passes/:subscriptionId/cancel',
    auth: 'user',
    handler: async (ctx) =>
      await passes.cancel(ctx.db, { subscriptionId: ctx.params.subscriptionId, userId: actor(ctx).user.id, at: ctx.at }),
  },
];
