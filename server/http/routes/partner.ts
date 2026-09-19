/**
 * The partner dashboard's endpoints — desktop B1–B10, and the mobile
 * companion's reads and three urgent levers (§11).
 *
 * One rule shows up in every handler: **the venue is resolved from the path and
 * the caller is checked against it**, by `mine()` below. A partner dashboard is
 * the one surface where an id in a URL is somebody else's business, and a
 * missing check is a competitor reading your customers.
 *
 * The second is entitlements (B7). They gate *scale and depth* — how many live
 * deals, whether benchmarks and identified profiles are available — and are
 * checked in the domain layer where the limit is known, not here.
 */
import * as analytics from '../../domain/analytics.ts';
import * as assistant from '../../domain/assistant.ts';
import * as audit from '../../domain/audit.ts';
import * as budget from '../../domain/budget.ts';
import * as campaigns from '../../domain/campaigns.ts';
import * as dashboard from '../../domain/dashboard.ts';
import * as deals from '../../domain/deals.ts';
import * as entitlements from '../../domain/entitlements.ts';
import * as gate from '../../domain/gate.ts';
import * as partners from '../../domain/partners.ts';
import * as profiles from '../../domain/profiles.ts';
import * as vouchers from '../../domain/vouchers.ts';
import { averageCheck, getVenue, venuesOf } from '../../domain/venues.ts';
import { DomainError } from '../../domain/errors.ts';
import { actor, bool, int, list, oneOf, optInt, optStr, qChoice, qInt, qRange, qStr, str } from '../input.ts';
import type { Ctx, Route } from '../router.ts';

/** The four `issued_vouchers` statuses, plus the word for "do not filter". */
const VOUCHER_STATUS = ['all', 'active', 'redeemed', 'expired', 'cancelled'] as const;

const statusFilter = (
  choice: (typeof VOUCHER_STATUS)[number],
): 'active' | 'redeemed' | 'expired' | 'cancelled' | undefined =>
  choice === 'all' ? undefined : choice;

/**
 * A voucher rung's count cap: a whole number of at least one, or `null`.
 *
 * `null` has to survive as a value — it is how a partner *removes* a cap — so
 * this cannot be `optInt`, which folds null into absent. Zero is refused rather
 * than accepted as "none": a cap of zero is a rung that cannot be bought, and
 * the control for that is `active: false`, which says so on the screen.
 */
function capOf(raw: unknown, field: string): number | null {
  if (raw === null) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new DomainError('validation_failed', `${field} is a whole number of at least 1, or null`, {
      field,
    });
  }
  return value;
}

/** The venue in the path, with the caller's access to it already checked. */
async function mine(ctx: Ctx, param = 'id') {
  const venueId = ctx.params[param];
  await gate.requireStaff(ctx.db, venueId, actor(ctx).user.id);
  return await getVenue(ctx.db, venueId);
}

const entOf = async (ctx: Ctx, venueId: string) => await entitlements.entitlementsFor(ctx.db, { venueId });

/** `mine`, for a route addressed by campaign: its venue, with the caller's access to it checked. */
async function campaignVenue(ctx: Ctx): Promise<string> {
  const campaign = await ctx.db.get<{ venue_id: string }>(`SELECT venue_id FROM campaigns WHERE id = $i`, {
    i: ctx.params.id,
  });
  if (!campaign) throw new DomainError('not_found', 'campaign not found');
  await gate.requireStaff(ctx.db, campaign.venue_id, actor(ctx).user.id);
  return campaign.venue_id;
}

/**
 * A `YYYY-MM` report month, or none.
 *
 * Checked here because nothing downstream can refuse it: a period that is not a
 * month reached `monthStart`, built an invalid date and threw a `RangeError` —
 * a 500 for a typo in a query string.
 */
function qPeriod(ctx: Ctx): string | undefined {
  const period = qStr(ctx, 'period');
  if (period === undefined) return undefined;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw new DomainError('validation_failed', 'period is a month, YYYY-MM', { field: 'period' });
  }
  return period;
}

/** The five words `profiles.deriveStatus` can produce, and so the five a filter may ask for. */
const CUSTOMER_STATUSES: readonly profiles.CustomerStatus[] = ['new', 'regular', 'lapsed', 'at_risk', 'high_value'];

/** The listing's non-column parts, as sent. `null` is "not sent", like everywhere else in a patch. */
const extrasOf = (ctx: Ctx) => ({
  description: ctx.body.description ?? undefined,
  links: ctx.body.links ?? undefined,
  languages: ctx.body.languages ?? undefined,
});

/**
 * The budget, as every client reads it — one shape, from one function.
 *
 * `budget.budgetFor` answers the money question and nothing else: the two pools
 * and their three states. What a dashboard also needs is the ladder it may
 * issue from, the average check every money estimate is multiplied by, the
 * rebalance hint and the tolerance — four decorations that were written out at
 * `GET .../budget` and *not* at `GET .../overview`, which returned the bare view
 * under the same field name.
 *
 * That divergence was not a smaller answer, it was a different type wearing the
 * same name, and it cost the whole partner dashboard: the overview screen reads
 * `budget.averageCheck.minor` and `budget.tiers`, both of which were `undefined`
 * on the response it was actually given, and a `TypeError` in render unmounts
 * React's whole tree — an owner with a venue got a black page and an owner with
 * none got a correct "nothing measured yet" panel, which is why it looked like
 * it depended on the account.
 *
 * So there is one budget body now and both routes return it. Composing it here
 * rather than folding the four calls into `budgetFor` keeps the domain function
 * about money and this function about what a screen needs.
 */
async function budgetBody(db: Ctx['db'], venue: Awaited<ReturnType<typeof getVenue>>, at: string) {
  const view = await budget.budgetFor(db, venue.id, at);
  return {
    ...view,
    /* B6: the voucher-count estimate the dashboard shows — the word "estimate"
       is load-bearing, enforcement is on money at redemption — and, on this
       body only, what each rung actually did this month. The partner ladder and
       never the public one: `GET /v1/venues/:id` serves `vouchers.ladder` to
       anybody who opens a venue, and a venue's issuance is its own trading. */
    tiers: await vouchers.partnerLadder(db, venue.id, at),
    averageCheck: await averageCheck(db, venue, at),
    rebalanceHint: budget.rebalanceHint(view),
    tolerance: budget.toleranceOf(view),
  };
}

export const partnerRoutes: Route[] = [
  /* ═════════════════════════════════════════════ B1–B2 venues & profile ══ */
  {
    method: 'GET',
    pattern: '/v1/partner/venues',
    auth: 'partner',
    handler: async (ctx) => await venuesOf(ctx.db, actor(ctx).user.id),
  },
  {
    method: 'POST',
    pattern: '/v1/partner/venues',
    auth: 'partner',
    handler: async (ctx) =>
      await partners.createVenue(ctx.db, {
        ownerId: actor(ctx).user.id,
        draft: {
          name: str(ctx.body, 'name', { max: 120 }),
          category: str(ctx.body, 'category'),
          subcategory: optStr(ctx.body, 'subcategory'),
          city: str(ctx.body, 'city'),
          countryCode: optStr(ctx.body, 'countryCode'),
          address: optStr(ctx.body, 'address'),
          timezone: optStr(ctx.body, 'timezone'),
          currency: optStr(ctx.body, 'currency'),
          priceRange: optStr(ctx.body, 'priceRange'),
          phone: optStr(ctx.body, 'phone'),
          email: optStr(ctx.body, 'email'),
          imageUrl: optStr(ctx.body, 'imageUrl'),
        },
        /* The description, links and languages ride with the create, so the
           listing form's one save is one request (§2.9). The answer is still the
           venue row; `GET …/listing` reads the whole listing back. */
        extras: extrasOf(ctx),
        at: ctx.at,
      }),
  },
  {
    method: 'PATCH',
    pattern: '/v1/partner/venues/:id',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      /* An explicit `null` takes a listing detail back (§2.13); an absent key
         leaves it. The three a listing cannot exist without say so instead. */
      for (const field of ['name', 'category', 'city'] as const) {
        if (ctx.body[field] === null) {
          throw new DomainError('validation_failed', `${field} can be changed but not removed`, { field });
        }
      }
      const clear = (['subcategory', 'address', 'priceRange', 'phone', 'email', 'imageUrl'] as const).filter(
        (field) => ctx.body[field] === null,
      );
      return await partners.updateVenue(ctx.db, {
        clear,
        venueId: venue.id,
        actorId: actor(ctx).user.id,
        patch: {
          name: optStr(ctx.body, 'name'),
          category: optStr(ctx.body, 'category'),
          subcategory: optStr(ctx.body, 'subcategory'),
          city: optStr(ctx.body, 'city'),
          address: optStr(ctx.body, 'address'),
          priceRange: optStr(ctx.body, 'priceRange'),
          phone: optStr(ctx.body, 'phone'),
          email: optStr(ctx.body, 'email'),
          imageUrl: optStr(ctx.body, 'imageUrl'),
          amountEntry: ctx.body.amountEntry
            ? oneOf(ctx.body, 'amountEntry', ['cashier', 'customer'] as const)
            : undefined,
          minSpendMinor: optInt(ctx.body, 'minSpendMinor', { min: 0 }),
          maxAmountMinor: optInt(ctx.body, 'maxAmountMinor', { min: 100 }),
          pointsPerScan: optInt(ctx.body, 'pointsPerScan', { min: 0, max: 100 }),
          scanCooldownHours: optInt(ctx.body, 'scanCooldownHours', { min: 0, max: 720 }),
        },
        extras: extrasOf(ctx),
        at: ctx.at,
      });
    },
  },
  {
    method: 'PUT',
    pattern: '/v1/partner/venues/:id/links',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      await partners.setLinks(
        ctx.db,
        venue.id,
        /* Handed over as sent: `setLinks` checks them, for this route and for
           links saved with the listing alike. A `null` in the list is a row with
           nothing in it, not a TypeError. */
        list(ctx.body, 'links', (item) =>
          (item !== null && typeof item === 'object' ? item : {}) as { kind?: unknown; value?: unknown },
        ),
        ctx.at,
      );
      return await partners.linksOf(ctx.db, venue.id);
    },
  },
  {
    method: 'PUT',
    pattern: '/v1/partner/venues/:id/hours',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      await partners.setHours(
        ctx.db,
        venue.id,
        list(ctx.body, 'hours', (item) => {
          const row = (item !== null && typeof item === 'object' ? item : {}) as Record<string, unknown>;
          /* A closed day sends no times at all; absent is null, not `NaN`. */
          const minutes = (value: unknown) => (value === null || value === undefined ? null : Number(value));
          return {
            weekday: Number(row.weekday),
            opensMin: minutes(row.opensMin),
            closesMin: minutes(row.closesMin),
            closed: Boolean(row.closed),
          };
        }),
      );
      return { ok: true };
    },
  },
  {
    method: 'POST',
    pattern: '/v1/partner/venues/:id/verification',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      return {
        id: await partners.submitVerification(ctx.db, {
          venueId: venue.id,
          method: oneOf(ctx.body, 'method', ['email_domain', 'business_details', 'manual'] as const),
          taxId: optStr(ctx.body, 'taxId'),
          legalName: optStr(ctx.body, 'legalName'),
          at: ctx.at,
        }),
      };
    },
  },

  /* ═══════════════════════════════════════════ B6 tiers, budget, rebalance ══ */
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/budget',
    auth: 'partner',
    handler: async (ctx) => budgetBody(ctx.db, await mine(ctx), ctx.at),
  },
  {
    method: 'PUT',
    pattern: '/v1/partner/venues/:id/budget',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      return await partners.setBudget(ctx.db, {
        venueId: venue.id,
        actorId: actor(ctx).user.id,
        totalMinor: int(ctx.body, 'totalMinor', { min: 0 }),
        loyaltyBp: optInt(ctx.body, 'loyaltyBp', { min: 0, max: 10_000 }),
        at: ctx.at,
      });
    },
  },
  {
    /* §11.2's urgent lever. A single guarded action with an audit entry. */
    method: 'POST',
    pattern: '/v1/partner/venues/:id/budget/topup',
    auth: 'partner',
    idempotent: true,
    handler: async (ctx) => {
      const venue = await mine(ctx);
      const view = await budget.budgetFor(ctx.db, venue.id, ctx.at);
      const result = await budget.topUp(
        ctx.db,
        view.id,
        oneOf(ctx.body, 'allocation', ['loyalty', 'voucher'] as const),
        int(ctx.body, 'amountMinor', { min: 1 }),
        optStr(ctx.body, 'note') ?? 'mobile top-up',
        ctx.at,
      );
      await audit.record(ctx.db, {
        actorId: actor(ctx).user.id,
        action: 'budget.topup',
        entity: 'budget',
        entityId: view.id,
        venueId: venue.id,
        after: { amountMinor: ctx.body.amountMinor },
        at: ctx.at,
      });
      return result;
    },
  },
  {
    method: 'POST',
    pattern: '/v1/partner/venues/:id/budget/rebalance',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      const view = await budget.budgetFor(ctx.db, venue.id, ctx.at);
      const result = await budget.rebalance(
        ctx.db,
        view.id,
        oneOf(ctx.body, 'from', ['loyalty', 'voucher'] as const),
        int(ctx.body, 'amountMinor', { min: 1 }),
        ctx.at,
      );
      await audit.record(ctx.db, {
        actorId: actor(ctx).user.id,
        action: 'budget.rebalance',
        entity: 'budget',
        entityId: view.id,
        venueId: venue.id,
        after: { from: ctx.body.from, amountMinor: ctx.body.amountMinor },
        at: ctx.at,
      });
      return result;
    },
  },
  {
    /*
     * The partner's voucher register — the list, its totals and the ladder the
     * caps live on, in one call.
     *
     * Composed here rather than as three routes because they are one screen and
     * every figure on it has to agree: a rung reading "18 of 20" beside a list
     * fetched a second later would be two answers to one question. Same reason
     * `budgetBody` exists one file over.
     */
    method: 'GET',
    pattern: '/v1/partner/venues/:id/vouchers',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      return {
        tiers: await vouchers.partnerLadder(ctx.db, venue.id, ctx.at),
        totals: await vouchers.partnerVoucherTotals(ctx.db, venue.id, ctx.at),
        vouchers: await vouchers.partnerVouchers(ctx.db, venue.id, {
          tierId: qStr(ctx, 'tier'),
          /* `all` is a member of the set rather than an absent parameter,
             because `qChoice` refuses anything it does not know — which is what
             turns `?status=redemed` into a named 400 instead of a silent
             unfiltered list. */
          status: statusFilter(qChoice(ctx, 'status', VOUCHER_STATUS, 'all')),
          limit: qInt(ctx, 'limit', 200),
        }),
      };
    },
  },
  {
    method: 'PUT',
    pattern: '/v1/partner/venues/:id/tiers',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      await partners.setVoucherTiers(ctx.db, {
        venueId: venue.id,
        actorId: actor(ctx).user.id,
        tiers: list(ctx.body, 'tiers', (item) => {
          const tier = item as Record<string, unknown>;
          return {
            discountPct: Number(tier.discountPct),
            pointsCost: Number(tier.pointsCost),
            maxDiscountMinor: Number(tier.maxDiscountMinor),
            /*
             * The two count caps. `null` is a **value** here — "no limit" — and
             * `undefined` is "leave whatever is set alone", which is why they
             * are read off the raw body rather than through `optInt`: that
             * helper folds null into absent, and this is the one field where
             * the difference is the whole meaning. A partner clearing a cap and
             * a partner editing a rung's price without touching its cap are
             * different edits, and `setVoucherTiers` upserts the whole row.
             */
            redeemLimit: tier.redeemLimit === undefined ? undefined : capOf(tier.redeemLimit, 'redeemLimit'),
            perUserLimit:
              tier.perUserLimit === undefined ? undefined : capOf(tier.perUserLimit, 'perUserLimit'),
            active: tier.active !== false,
          };
        }),
        at: ctx.at,
      });
      return await vouchers.partnerLadder(ctx.db, venue.id, ctx.at);
    },
  },

  /* ══════════════════════════════════════════════════════ B5 campaigns ══ */
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/campaigns',
    auth: 'partner',
    handler: async (ctx) => campaigns.campaignRows(ctx.db, (await mine(ctx)).id),
  },
  {
    method: 'POST',
    pattern: '/v1/partner/venues/:id/campaigns',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      return await partners.createCampaign(ctx.db, {
        venueId: venue.id,
        actorId: actor(ctx).user.id,
        name: str(ctx.body, 'name', { max: 120 }),
        visitsRequired: int(ctx.body, 'visitsRequired', { min: 1, max: 50 }),
        rewardLabel: str(ctx.body, 'rewardLabel', { max: 120 }),
        rewardCostMinor: int(ctx.body, 'rewardCostMinor', { min: 1 }),
        priority: optInt(ctx.body, 'priority', { min: 0, max: 100 }),
        recurring: bool(ctx.body, 'recurring', true),
        minSpendMinor: optInt(ctx.body, 'minSpendMinor', { min: 0 }),
        rewardValidDays: optInt(ctx.body, 'rewardValidDays', { min: 1, max: 365 }),
        /* Passed through so the validator can refuse them by name (B5). */
        rewardKind: optStr(ctx.body, 'rewardKind'),
        pointsThreshold: optInt(ctx.body, 'pointsThreshold'),
        at: ctx.at,
      });
    },
  },
  {
    method: 'POST',
    pattern: '/v1/partner/campaigns/:id/status',
    auth: 'partner',
    handler: async (ctx) => {
      await campaignVenue(ctx);
      const status = oneOf(ctx.body, 'status', ['active', 'paused', 'ended'] as const);
      /* §5.3: pausing stops new earning; rewards already earned stay valid and
         stay reserved. Nothing is cancelled here, deliberately. Resuming is
         held to the plan's campaign allowance — see `setCampaignStatus`. */
      await partners.setCampaignStatus(ctx.db, {
        campaignId: ctx.params.id,
        status,
        actorId: actor(ctx).user.id,
        at: ctx.at,
      });
      return { status };
    },
  },
  {
    /*
     * Edit a campaign (§2.7). Every field is optional; the answer is the row in
     * the shape `GET …/campaigns` lists it in. `minSpendMinor: null` is a value
     * — "no override, the venue's minimum applies" — so it is read before
     * `optInt`, which treats null as absent.
     */
    method: 'PATCH',
    pattern: '/v1/partner/campaigns/:id',
    auth: 'partner',
    handler: async (ctx) => {
      await campaignVenue(ctx);
      const body = ctx.body;
      const sent = (field: string) => body[field] !== undefined && body[field] !== null;
      return await partners.updateCampaign(ctx.db, {
        campaignId: ctx.params.id,
        actorId: actor(ctx).user.id,
        patch: {
          name: sent('name') ? str(body, 'name', { max: 120 }) : undefined,
          rewardLabel: sent('rewardLabel') ? str(body, 'rewardLabel', { max: 120 }) : undefined,
          rewardCostMinor: optInt(body, 'rewardCostMinor', { min: 1 }),
          visitsRequired: optInt(body, 'visitsRequired', { min: 1, max: 50 }),
          minSpendMinor: body.minSpendMinor === null ? null : optInt(body, 'minSpendMinor', { min: 0 }),
          rewardValidDays: optInt(body, 'rewardValidDays', { min: 1, max: 365 }),
          priority: optInt(body, 'priority', { min: 0, max: 100 }),
          recurring: sent('recurring') ? bool(body, 'recurring') : undefined,
        },
        at: ctx.at,
      });
    },
  },

  /* ═══════════════════════════════════════════════ B3–B4 deals & pushes ══ */
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/deals',
    auth: 'partner',
    handler: async (ctx) => partners.dealsFor(ctx.db, (await mine(ctx)).id, ctx.language, ctx.at),
  },
  {
    method: 'POST',
    pattern: '/v1/partner/venues/:id/deals',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      return await partners.createDeal(ctx.db, {
        actorId: actor(ctx).user.id,
        draft: {
          venueId: venue.id,
          discountText: optStr(ctx.body, 'discountText'),
          promoCode: optStr(ctx.body, 'promoCode'),
          imageUrl: optStr(ctx.body, 'imageUrl'),
          category: optStr(ctx.body, 'category'),
          validFrom: optStr(ctx.body, 'validFrom'),
          validTo: optStr(ctx.body, 'validTo'),
          targetWeekdays: list(ctx.body, 'targetWeekdays', (item) => Number(item)),
          targetFromMin: optInt(ctx.body, 'targetFromMin', { min: 0, max: 1439 }),
          targetToMin: optInt(ctx.body, 'targetToMin', { min: 0, max: 1440 }),
          targetLanguages: list(ctx.body, 'targetLanguages', (item) => String(item)),
          targetAudience: list(ctx.body, 'targetAudience', (item) => String(item) as deals.Segment),
          capClaims: optInt(ctx.body, 'capClaims', { min: 1 }),
          capSpendMinor: optInt(ctx.body, 'capSpendMinor', { min: 1 }),
          copy: (ctx.body.copy as Record<string, { title?: string; description?: string; terms?: string }>) ?? {},
          aiGenerated: bool(ctx.body, 'aiGenerated'),
        },
        at: ctx.at,
      });
    },
  },
  {
    method: 'PATCH',
    pattern: '/v1/partner/deals/:id',
    auth: 'partner',
    handler: async (ctx) => {
      const deal = await deals.getDeal(ctx.db, ctx.params.id);
      if (deal.venue_id) await gate.requireStaff(ctx.db, deal.venue_id, actor(ctx).user.id);
      return await partners.updateDeal(ctx.db, {
        dealId: deal.id,
        actorId: actor(ctx).user.id,
        patch: {
          discountText: optStr(ctx.body, 'discountText'),
          validFrom: optStr(ctx.body, 'validFrom'),
          validTo: optStr(ctx.body, 'validTo'),
          capClaims: optInt(ctx.body, 'capClaims', { min: 1 }),
          capSpendMinor: optInt(ctx.body, 'capSpendMinor', { min: 1 }),
          copy: ctx.body.copy as Record<string, { title?: string; description?: string }> | undefined,
        },
        at: ctx.at,
      });
    },
  },
  {
    method: 'POST',
    pattern: '/v1/partner/deals/:id/publish',
    auth: 'partner',
    handler: async (ctx) => {
      const deal = await deals.getDeal(ctx.db, ctx.params.id);
      if (deal.venue_id) await gate.requireStaff(ctx.db, deal.venue_id, actor(ctx).user.id);
      return await partners.publishDeal(ctx.db, {
        dealId: deal.id,
        actorId: actor(ctx).user.id,
        at: ctx.at,
      });
    },
  },
  {
    /* §11.2's other two levers: pause/resume, and extend. */
    method: 'POST',
    pattern: '/v1/partner/deals/:id/status',
    auth: 'partner',
    handler: async (ctx) => {
      const deal = await deals.getDeal(ctx.db, ctx.params.id);
      if (deal.venue_id) await gate.requireStaff(ctx.db, deal.venue_id, actor(ctx).user.id);
      const status = oneOf(ctx.body, 'status', ['live', 'paused', 'archived'] as const);
      /*
       * Resuming a paused deal puts it back in front of customers, so it is
       * publishing and is checked like publishing — the venue still has to be
       * verified and the plan's live-deal cap still has to have room. Taking one
       * down needs no permission, which is why the guard only runs on the way
       * up. See `deals.setStatus`.
       */
      const updated = await deals.setStatus(ctx.db, deal.id, status, ctx.at, {
        check: async () => await partners.assertPublishable(ctx.db, deal.id),
      });
      await audit.record(ctx.db, {
        actorId: actor(ctx).user.id,
        action: `deal.${status}`,
        entity: 'hot_deal',
        entityId: deal.id,
        venueId: deal.venue_id,
        at: ctx.at,
      });
      return updated;
    },
  },
  {
    method: 'POST',
    pattern: '/v1/partner/deals/:id/extend',
    auth: 'partner',
    handler: async (ctx) => {
      const deal = await deals.getDeal(ctx.db, ctx.params.id);
      if (deal.venue_id) await gate.requireStaff(ctx.db, deal.venue_id, actor(ctx).user.id);
      /* An expired deal comes back live through here, so it passes the same
         three gates publishing does — see `deals.extend`. */
      const updated = await deals.extend(ctx.db, deal.id, str(ctx.body, 'validTo'), ctx.at, {
        check: async () => await partners.assertPublishable(ctx.db, deal.id),
      });
      await audit.record(ctx.db, {
        actorId: actor(ctx).user.id,
        action: 'deal.extend',
        entity: 'hot_deal',
        entityId: deal.id,
        venueId: deal.venue_id,
        /* What was stored, which for a bare day is the end of that day. */
        after: { validTo: updated.valid_to },
        at: ctx.at,
      });
      return updated;
    },
  },
  {
    method: 'POST',
    pattern: '/v1/partner/deals/:id/push',
    auth: 'partner',
    handler: async (ctx) => {
      const deal = await deals.getDeal(ctx.db, ctx.params.id);
      if (!deal.venue_id) throw new DomainError('invalid_state', 'deal has no venue');
      await gate.requireStaff(ctx.db, deal.venue_id, actor(ctx).user.id);
      const ent = await entOf(ctx, deal.venue_id);
      return await deals.schedulePush(ctx.db, {
        dealId: deal.id,
        scheduledAt: str(ctx.body, 'scheduledAt'),
        quota: entitlements.entNumber(ent, 'push_quota', 2),
        at: ctx.at,
      });
    },
  },
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/push-quota',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      const ent = await entOf(ctx, venue.id);
      return await deals.pushQuota(ctx.db, venue.id, entitlements.entNumber(ent, 'push_quota', 2), ctx.at);
    },
  },

  /* ═══════════════════════════════════════════════════════ B9 analytics ══ */
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/overview',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      const window = { period: qPeriod(ctx), at: ctx.at };
      return {
        overview: await analytics.overview(ctx.db, venue.id, window),
        /* The *same* body `GET .../budget` returns — see `budgetBody`. It was
           the bare `budgetFor` view here, and the overview screen reads fields
           that view does not carry. */
        budget: await budgetBody(ctx.db, venue, ctx.at),
        findings: await analytics.findings(ctx.db, venue.id, window),
        floors: await analytics.cohortFloor(ctx.db),
      };
    },
  },
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/today',
    auth: 'partner',
    handler: async (ctx) => analytics.today(ctx.db, (await mine(ctx)).id, ctx.at),
  },
  {
    /*
     * Seen, clicked, claimed — the top of the funnel, which every other figure
     * on this dashboard sits below. Its own route rather than a key on
     * `/analytics` because it answers a question an owner asks on its own ("is
     * anybody seeing us") and because it is the one report that is worth
     * reading for a venue with no visits at all, which is precisely when the
     * rest of that response is a screen of zeroes.
     *
     * Not gated behind `deep_analytics`. Knowing whether anybody has seen your
     * listing is not a premium insight — it is whether the product is doing the
     * thing it was bought for.
     */
    method: 'GET',
    pattern: '/v1/partner/venues/:id/reach',
    auth: 'partner',
    handler: async (ctx) =>
      analytics.reach(ctx.db, (await mine(ctx)).id, { period: qPeriod(ctx), at: ctx.at }),
  },
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/analytics',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      const ent = await entOf(ctx, venue.id);
      const window = { period: qPeriod(ctx), at: ctx.at };

      const base = {
        overview: await analytics.overview(ctx.db, venue.id, window),
        heatmap: await analytics.heatmap(ctx.db, venue.id, window),
        languageMix: await analytics.languageMix(ctx.db, venue.id, window),
        costPerNewCustomer: await analytics.costPerNewCustomer(ctx.db, venue.id, window),
        /* The same figure for the two months before, so the headline has a
           direction. In `base` rather than behind `deep_analytics`: it is the
           month's own arithmetic run twice more, not a new report, and the
           headline it qualifies is already here — a figure that moved with no
           way to see which way it moved is the state this fixes. */
        costPerNewCustomerTrend: await analytics.costPerNewCustomerTrend(
          ctx.db,
          venue.id,
          window,
        ),
      };
      /* B7: the deeper analytics are a paid tier. The *shape* of the response
         does not change — the keys are absent rather than nulled — so a client
         can render what it has without a special "locked" branch everywhere. */
      if (!entitlements.entBool(ent, 'deep_analytics')) return base;

      return {
        ...base,
        cohorts: await analytics.cohorts(ctx.db, venue.id, 6, window),
        repeatMultiple: await analytics.repeatMultiple(ctx.db, venue.id, window),
        roi: await analytics.roiByFeature(ctx.db, venue.id, window),
        benchmarks: entitlements.entBool(ent, 'benchmarks')
          ? await analytics.benchmarksFor(ctx.db, venue.city, venue.category, ctx.at, window.period)
          : undefined,
      };
    },
  },
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/export',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      entitlements.requireEntitlement(await entOf(ctx, venue.id), 'export_csv');
      /* B10: a venue's own aggregate data, respecting the no-individual rule —
         the CSV is a day-by-day roll-up and contains no user column. */
      return {
        filename: `paylez-${venue.id}.csv`,
        csv: await analytics.exportCsv(ctx.db, venue.id, { period: qPeriod(ctx), at: ctx.at }),
      };
    },
  },

  /* ════════════════════════════════════ B9a identified customer profiles ══ */
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/customers',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      entitlements.requireEntitlement(await entOf(ctx, venue.id), 'identified_profiles');
      return await profiles.customerTable(ctx.db, venue.id, {
        sort: qChoice(ctx, 'sort', ['spend', 'visits', 'recent'] as const, 'spend'),
        /* An unknown status used to be an empty table — a filter that matched
           nobody, read as "you have no customers like that". */
        status: ctx.query.get('status') === null ? undefined : qChoice(ctx, 'status', CUSTOMER_STATUSES, 'new'),
        limit: qInt(ctx, 'limit', 50),
        offset: qInt(ctx, 'offset', 0),
        at: ctx.at,
      });
    },
  },
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/customers/:userId',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      entitlements.requireEntitlement(await entOf(ctx, venue.id), 'identified_profiles');
      return await profiles.customerDetail(ctx.db, venue.id, ctx.params.userId, ctx.at);
    },
  },
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/customers/:userId/segment',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      entitlements.requireEntitlement(await entOf(ctx, venue.id), 'identified_profiles');
      return await profiles.segmentFor(ctx.db, venue.id, ctx.params.userId, ctx.at);
    },
  },

  /* ══════════════════════════════════════════════ the dashboard's own reports ══ */
  {
    /*
     * The day series under the overview's chart, and the same span before it
     * (§2.1). `days` is one of the range picker's four spans and nothing else: a
     * window the screen does not offer is a 400, not a quietly different span
     * drawn under the label that was asked for.
     */
    method: 'GET',
    pattern: '/v1/partner/venues/:id/series',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      const days = Number(qChoice(ctx, 'days', dashboard.WINDOW_DAYS, '30'));
      return await dashboard.series(ctx.db, venue.id, days, ctx.at);
    },
  },
  {
    /* "What we noticed" (§2.2). Each finding is null when it does not apply. */
    method: 'GET',
    pattern: '/v1/partner/venues/:id/insights',
    auth: 'partner',
    handler: async (ctx) => dashboard.insights(ctx.db, (await mine(ctx)).id, ctx.at, ctx.language),
  },
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/remind',
    auth: 'partner',
    handler: async (ctx) => dashboard.remindStatus(ctx.db, (await mine(ctx)).id, ctx.at),
  },
  {
    /*
     * Remind everybody holding an unused reward or voucher here (§2.3). Once a
     * week, enforced by the audit row the send writes. Idempotent, so a retry
     * after a dropped response returns the send that happened instead of
     * tripping its own rate limit.
     */
    method: 'POST',
    pattern: '/v1/partner/venues/:id/remind',
    auth: 'partner',
    idempotent: true,
    handler: async (ctx) => {
      const venue = await mine(ctx);
      return await dashboard.sendReminder(ctx.db, { venueId: venue.id, actorId: actor(ctx).user.id, at: ctx.at });
    },
  },
  {
    /* The till log (§2.6). Names only where a customer shared them with this venue. */
    method: 'GET',
    pattern: '/v1/partner/venues/:id/scans',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      return await dashboard.scans(ctx.db, venue.id, {
        days: Number(qChoice(ctx, 'days', dashboard.WINDOW_DAYS, '30')),
        segment: qChoice(ctx, 'segment', dashboard.SCAN_SEGMENTS, 'all'),
        limit: qRange(ctx, 'limit', 50, { min: 1, max: 100 }),
        offset: qRange(ctx, 'offset', 0, { min: 0, max: 1_000_000 }),
        at: ctx.at,
      });
    },
  },
  {
    /* How many people each targeting segment is, and how many a push reaches (§2.8). */
    method: 'GET',
    pattern: '/v1/partner/venues/:id/audiences',
    auth: 'partner',
    handler: async (ctx) => dashboard.audiences(ctx.db, (await mine(ctx)).id, ctx.at),
  },
  {
    /* The whole listing, as the profile screen edits it (§2.9). */
    method: 'GET',
    pattern: '/v1/partner/venues/:id/listing',
    auth: 'partner',
    handler: async (ctx) => dashboard.listing(ctx.db, (await mine(ctx)).id),
  },
  {
    /*
     * The counter tool's first half (§2.11): who a handle or a code belongs to,
     * before anybody types a bill. Writes nothing; a miss of any kind is one 404.
     */
    method: 'POST',
    pattern: '/v1/partner/venues/:id/counter/lookup',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      return await dashboard.counterLookup(ctx.db, venue.id, str(ctx.body, 'code', { max: 64 }), ctx.at);
    },
  },
  {
    /*
     * The second half: the sale, through the gate's own four steps with the
     * caller at the till. Idempotent, because this is a press that moves money
     * and a slow connection is exactly when a cashier presses twice.
     */
    method: 'POST',
    pattern: '/v1/partner/venues/:id/counter',
    auth: 'partner',
    idempotent: true,
    handler: async (ctx) => {
      const venue = await mine(ctx);
      return await dashboard.counterRecord(ctx.db, {
        venueId: venue.id,
        actorId: actor(ctx).user.id,
        code: str(ctx.body, 'code', { max: 64 }),
        amountMinor: int(ctx.body, 'amountMinor', { min: 1 }),
        at: ctx.at,
      });
    },
  },

  /* ═══════════════════════════════════════════════════ B8 the assistant ══ */
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/assistant/context',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      entitlements.requireEntitlement(await entOf(ctx, venue.id), 'assistant');
      return await assistant.venueContext(ctx.db, venue.id, ctx.at);
    },
  },
  {
    method: 'POST',
    pattern: '/v1/partner/venues/:id/assistant/ask',
    auth: 'partner',
    /* Async for the one reason the consumer's ask is — see `ports/llm.ts`. */
    handler: async (ctx) => {
      const venue = await mine(ctx);
      entitlements.requireEntitlement(await entOf(ctx, venue.id), 'assistant');
      return await assistant.askPartner(ctx.db, {
        sessionId: optStr(ctx.body, 'sessionId'),
        venueId: venue.id,
        userId: actor(ctx).user.id,
        text: str(ctx.body, 'text', { max: 500 }),
        at: ctx.at,
      });
    },
  },
  {
    method: 'POST',
    pattern: '/v1/partner/venues/:id/assistant/draft',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      entitlements.requireEntitlement(await entOf(ctx, venue.id), 'assistant');
      const draft = await assistant.draftFor(ctx.db, {
        venueId: venue.id,
        goal: str(ctx.body, 'goal', { max: 400 }),
        budgetMinor: optInt(ctx.body, 'budgetMinor', { min: 0 }),
        at: ctx.at,
      });
      const sessionId = optStr(ctx.body, 'sessionId');
      if (sessionId) await assistant.saveDraft(ctx.db, sessionId, draft, ctx.at);
      /* The assistant proposes; the partner approves. There is no publish here
         and there must not be one — the draft goes back to the client, which
         posts it to the ordinary authoring endpoint if the partner agrees. */
      return draft;
    },
  },
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/assistant/review',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      entitlements.requireEntitlement(await entOf(ctx, venue.id), 'assistant');
      return await assistant.review(ctx.db, venue.id, ctx.at);
    },
  },
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/audit',
    auth: 'partner',
    handler: async (ctx) => audit.forVenue(ctx.db, (await mine(ctx)).id, qInt(ctx, 'limit', 100)),
  },
];
