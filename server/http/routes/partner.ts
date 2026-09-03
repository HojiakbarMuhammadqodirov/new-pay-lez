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
import * as deals from '../../domain/deals.ts';
import * as entitlements from '../../domain/entitlements.ts';
import * as gate from '../../domain/gate.ts';
import * as partners from '../../domain/partners.ts';
import * as profiles from '../../domain/profiles.ts';
import * as vouchers from '../../domain/vouchers.ts';
import { averageCheck, getVenue, venuesOf } from '../../domain/venues.ts';
import { DomainError } from '../../domain/errors.ts';
import { actor, bool, int, list, oneOf, optInt, optStr, qInt, qStr, str } from '../input.ts';
import type { Ctx, Route } from '../router.ts';

/** The venue in the path, with the caller's access to it already checked. */
async function mine(ctx: Ctx, param = 'id') {
  const venueId = ctx.params[param];
  await gate.requireStaff(ctx.db, venueId, actor(ctx).user.id);
  return await getVenue(ctx.db, venueId);
}

const entOf = async (ctx: Ctx, venueId: string) => await entitlements.entitlementsFor(ctx.db, { venueId });

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
    /* B6: the voucher-count estimate the dashboard shows, and the word
       "estimate" is load-bearing — enforcement is on money at redemption. */
    tiers: await vouchers.ladder(db, venue.id, at),
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
        at: ctx.at,
      }),
  },
  {
    method: 'PATCH',
    pattern: '/v1/partner/venues/:id',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      return await partners.updateVenue(ctx.db, {
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
        list(ctx.body, 'links', (item) => {
          const link = item as { kind?: unknown; value?: unknown };
          return { kind: String(link.kind ?? ''), value: String(link.value ?? '') };
        }),
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
          const row = item as Record<string, unknown>;
          return {
            weekday: Number(row.weekday),
            opensMin: row.opensMin === null ? null : Number(row.opensMin),
            closesMin: row.closesMin === null ? null : Number(row.closesMin),
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
            active: tier.active !== false,
          };
        }),
        at: ctx.at,
      });
      return await vouchers.ladder(ctx.db, venue.id, ctx.at);
    },
  },

  /* ══════════════════════════════════════════════════════ B5 campaigns ══ */
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/campaigns',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      return await ctx.db.all(
        `SELECT c.*,
                (SELECT COUNT(*) FROM stamp_cards s WHERE s.campaign_id = c.id) AS members,
                (SELECT COUNT(*) FROM earned_rewards r WHERE r.campaign_id = c.id) AS earned,
                (SELECT COUNT(*) FROM earned_rewards r WHERE r.campaign_id = c.id
                   AND r.status = 'redeemed') AS redeemed
           FROM campaigns c WHERE c.venue_id = $v ORDER BY c.priority DESC, c.created_at DESC`,
        { v: venue.id },
      );
    },
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
      const campaign = await ctx.db.get<{ venue_id: string }>(
        `SELECT venue_id FROM campaigns WHERE id = $i`,
        { i: ctx.params.id },
      );
      if (!campaign) throw new DomainError('not_found', 'campaign not found');
      await gate.requireStaff(ctx.db, campaign.venue_id, actor(ctx).user.id);

      const status = oneOf(ctx.body, 'status', ['active', 'paused', 'ended'] as const);
      await campaigns.setStatus(ctx.db, ctx.params.id, status, ctx.at);
      await audit.record(ctx.db, {
        actorId: actor(ctx).user.id,
        action: `campaign.${status}`,
        entity: 'campaign',
        entityId: ctx.params.id,
        venueId: campaign.venue_id,
        at: ctx.at,
      });
      /* §5.3: pausing stops new earning; rewards already earned stay valid and
         stay reserved. Nothing is cancelled here, deliberately. */
      return { status };
    },
  },

  /* ═══════════════════════════════════════════════ B3–B4 deals & pushes ══ */
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/deals',
    auth: 'partner',
    handler: async (ctx) => partners.dealsFor(ctx.db, (await mine(ctx)).id),
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
      const updated = await deals.extend(ctx.db, deal.id, str(ctx.body, 'validTo'), ctx.at);
      await audit.record(ctx.db, {
        actorId: actor(ctx).user.id,
        action: 'deal.extend',
        entity: 'hot_deal',
        entityId: deal.id,
        venueId: deal.venue_id,
        after: { validTo: ctx.body.validTo },
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
      const window = { period: qStr(ctx, 'period'), at: ctx.at };
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
      analytics.reach(ctx.db, (await mine(ctx)).id, { period: qStr(ctx, 'period'), at: ctx.at }),
  },
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/analytics',
    auth: 'partner',
    handler: async (ctx) => {
      const venue = await mine(ctx);
      const ent = await entOf(ctx, venue.id);
      const window = { period: qStr(ctx, 'period'), at: ctx.at };

      const base = {
        overview: await analytics.overview(ctx.db, venue.id, window),
        heatmap: await analytics.heatmap(ctx.db, venue.id, window),
        languageMix: await analytics.languageMix(ctx.db, venue.id, window),
        costPerNewCustomer: await analytics.costPerNewCustomer(ctx.db, venue.id, window),
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
          ? await analytics.benchmarksFor(ctx.db, venue.city, venue.category, ctx.at)
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
      return { filename: `paylez-${venue.id}.csv`, csv: await analytics.exportCsv(ctx.db, venue.id, { at: ctx.at }) };
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
        sort: (qStr(ctx, 'sort') as 'spend' | 'visits' | 'recent') ?? 'spend',
        status: qStr(ctx, 'status') as profiles.CustomerStatus | undefined,
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
