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
function mine(ctx: Ctx, param = 'id') {
  const venueId = ctx.params[param];
  gate.requireStaff(ctx.db, venueId, actor(ctx).user.id);
  return getVenue(ctx.db, venueId);
}

const entOf = (ctx: Ctx, venueId: string) => entitlements.entitlementsFor(ctx.db, { venueId });

export const partnerRoutes: Route[] = [
  /* ═════════════════════════════════════════════ B1–B2 venues & profile ══ */
  {
    method: 'GET',
    pattern: '/v1/partner/venues',
    auth: 'partner',
    handler: (ctx) => venuesOf(ctx.db, actor(ctx).user.id),
  },
  {
    method: 'POST',
    pattern: '/v1/partner/venues',
    auth: 'partner',
    handler: (ctx) =>
      partners.createVenue(ctx.db, {
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
    handler: (ctx) => {
      const venue = mine(ctx);
      return partners.updateVenue(ctx.db, {
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
    handler: (ctx) => {
      const venue = mine(ctx);
      partners.setLinks(
        ctx.db,
        venue.id,
        list(ctx.body, 'links', (item) => {
          const link = item as { kind?: unknown; value?: unknown };
          return { kind: String(link.kind ?? ''), value: String(link.value ?? '') };
        }),
        ctx.at,
      );
      return partners.linksOf(ctx.db, venue.id);
    },
  },
  {
    method: 'PUT',
    pattern: '/v1/partner/venues/:id/hours',
    auth: 'partner',
    handler: (ctx) => {
      const venue = mine(ctx);
      partners.setHours(
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
    handler: (ctx) => {
      const venue = mine(ctx);
      return {
        id: partners.submitVerification(ctx.db, {
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
    handler: (ctx) => {
      const venue = mine(ctx);
      const view = budget.budgetFor(ctx.db, venue.id, ctx.at);
      return {
        ...view,
        /* B6: the voucher-count estimate the dashboard shows, and the word
           "estimate" is load-bearing — enforcement is on money at redemption. */
        tiers: vouchers.ladder(ctx.db, venue.id, ctx.at),
        averageCheck: averageCheck(ctx.db, venue, ctx.at),
        rebalanceHint: budget.rebalanceHint(view),
        tolerance: budget.toleranceOf(view),
      };
    },
  },
  {
    method: 'PUT',
    pattern: '/v1/partner/venues/:id/budget',
    auth: 'partner',
    handler: (ctx) => {
      const venue = mine(ctx);
      return partners.setBudget(ctx.db, {
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
    handler: (ctx) => {
      const venue = mine(ctx);
      const view = budget.budgetFor(ctx.db, venue.id, ctx.at);
      const result = budget.topUp(
        ctx.db,
        view.id,
        oneOf(ctx.body, 'allocation', ['loyalty', 'voucher'] as const),
        int(ctx.body, 'amountMinor', { min: 1 }),
        optStr(ctx.body, 'note') ?? 'mobile top-up',
        ctx.at,
      );
      audit.record(ctx.db, {
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
    handler: (ctx) => {
      const venue = mine(ctx);
      const view = budget.budgetFor(ctx.db, venue.id, ctx.at);
      const result = budget.rebalance(
        ctx.db,
        view.id,
        oneOf(ctx.body, 'from', ['loyalty', 'voucher'] as const),
        int(ctx.body, 'amountMinor', { min: 1 }),
        ctx.at,
      );
      audit.record(ctx.db, {
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
    handler: (ctx) => {
      const venue = mine(ctx);
      partners.setVoucherTiers(ctx.db, {
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
      return vouchers.ladder(ctx.db, venue.id, ctx.at);
    },
  },

  /* ══════════════════════════════════════════════════════ B5 campaigns ══ */
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/campaigns',
    auth: 'partner',
    handler: (ctx) => {
      const venue = mine(ctx);
      return ctx.db.all(
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
    handler: (ctx) => {
      const venue = mine(ctx);
      return partners.createCampaign(ctx.db, {
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
    handler: (ctx) => {
      const campaign = ctx.db.get<{ venue_id: string }>(
        `SELECT venue_id FROM campaigns WHERE id = $i`,
        { i: ctx.params.id },
      );
      if (!campaign) throw new DomainError('not_found', 'campaign not found');
      gate.requireStaff(ctx.db, campaign.venue_id, actor(ctx).user.id);

      const status = oneOf(ctx.body, 'status', ['active', 'paused', 'ended'] as const);
      campaigns.setStatus(ctx.db, ctx.params.id, status, ctx.at);
      audit.record(ctx.db, {
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
    handler: (ctx) => partners.dealsFor(ctx.db, mine(ctx).id),
  },
  {
    method: 'POST',
    pattern: '/v1/partner/venues/:id/deals',
    auth: 'partner',
    handler: (ctx) => {
      const venue = mine(ctx);
      return partners.createDeal(ctx.db, {
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
    handler: (ctx) => {
      const deal = deals.getDeal(ctx.db, ctx.params.id);
      if (deal.venue_id) gate.requireStaff(ctx.db, deal.venue_id, actor(ctx).user.id);
      return partners.updateDeal(ctx.db, {
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
    handler: (ctx) => {
      const deal = deals.getDeal(ctx.db, ctx.params.id);
      if (deal.venue_id) gate.requireStaff(ctx.db, deal.venue_id, actor(ctx).user.id);
      return partners.publishDeal(ctx.db, {
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
    handler: (ctx) => {
      const deal = deals.getDeal(ctx.db, ctx.params.id);
      if (deal.venue_id) gate.requireStaff(ctx.db, deal.venue_id, actor(ctx).user.id);
      const status = oneOf(ctx.body, 'status', ['live', 'paused', 'archived'] as const);
      const updated = deals.setStatus(ctx.db, deal.id, status, ctx.at);
      audit.record(ctx.db, {
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
    handler: (ctx) => {
      const deal = deals.getDeal(ctx.db, ctx.params.id);
      if (deal.venue_id) gate.requireStaff(ctx.db, deal.venue_id, actor(ctx).user.id);
      const updated = deals.extend(ctx.db, deal.id, str(ctx.body, 'validTo'), ctx.at);
      audit.record(ctx.db, {
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
    handler: (ctx) => {
      const deal = deals.getDeal(ctx.db, ctx.params.id);
      if (!deal.venue_id) throw new DomainError('invalid_state', 'deal has no venue');
      gate.requireStaff(ctx.db, deal.venue_id, actor(ctx).user.id);
      const ent = entOf(ctx, deal.venue_id);
      return deals.schedulePush(ctx.db, {
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
    handler: (ctx) => {
      const venue = mine(ctx);
      const ent = entOf(ctx, venue.id);
      return deals.pushQuota(ctx.db, venue.id, entitlements.entNumber(ent, 'push_quota', 2), ctx.at);
    },
  },

  /* ═══════════════════════════════════════════════════════ B9 analytics ══ */
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/overview',
    auth: 'partner',
    handler: (ctx) => {
      const venue = mine(ctx);
      const window = { period: qStr(ctx, 'period'), at: ctx.at };
      return {
        overview: analytics.overview(ctx.db, venue.id, window),
        budget: budget.budgetFor(ctx.db, venue.id, ctx.at),
        findings: analytics.findings(ctx.db, venue.id, window),
        floors: analytics.cohortFloor(ctx.db),
      };
    },
  },
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/today',
    auth: 'partner',
    handler: (ctx) => analytics.today(ctx.db, mine(ctx).id, ctx.at),
  },
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/analytics',
    auth: 'partner',
    handler: (ctx) => {
      const venue = mine(ctx);
      const ent = entOf(ctx, venue.id);
      const window = { period: qStr(ctx, 'period'), at: ctx.at };

      const base = {
        overview: analytics.overview(ctx.db, venue.id, window),
        heatmap: analytics.heatmap(ctx.db, venue.id, window),
        languageMix: analytics.languageMix(ctx.db, venue.id, window),
        costPerNewCustomer: analytics.costPerNewCustomer(ctx.db, venue.id, window),
      };
      /* B7: the deeper analytics are a paid tier. The *shape* of the response
         does not change — the keys are absent rather than nulled — so a client
         can render what it has without a special "locked" branch everywhere. */
      if (!entitlements.entBool(ent, 'deep_analytics')) return base;

      return {
        ...base,
        cohorts: analytics.cohorts(ctx.db, venue.id, 6, window),
        repeatMultiple: analytics.repeatMultiple(ctx.db, venue.id, window),
        roi: analytics.roiByFeature(ctx.db, venue.id, window),
        benchmarks: entitlements.entBool(ent, 'benchmarks')
          ? analytics.benchmarksFor(ctx.db, venue.city, venue.category, ctx.at)
          : undefined,
      };
    },
  },
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/export',
    auth: 'partner',
    handler: (ctx) => {
      const venue = mine(ctx);
      entitlements.requireEntitlement(entOf(ctx, venue.id), 'export_csv');
      /* B10: a venue's own aggregate data, respecting the no-individual rule —
         the CSV is a day-by-day roll-up and contains no user column. */
      return { filename: `paylez-${venue.id}.csv`, csv: analytics.exportCsv(ctx.db, venue.id, { at: ctx.at }) };
    },
  },

  /* ════════════════════════════════════ B9a identified customer profiles ══ */
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/customers',
    auth: 'partner',
    handler: (ctx) => {
      const venue = mine(ctx);
      entitlements.requireEntitlement(entOf(ctx, venue.id), 'identified_profiles');
      return profiles.customerTable(ctx.db, venue.id, {
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
    handler: (ctx) => {
      const venue = mine(ctx);
      entitlements.requireEntitlement(entOf(ctx, venue.id), 'identified_profiles');
      return profiles.customerDetail(ctx.db, venue.id, ctx.params.userId, ctx.at);
    },
  },
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/customers/:userId/segment',
    auth: 'partner',
    handler: (ctx) => {
      const venue = mine(ctx);
      entitlements.requireEntitlement(entOf(ctx, venue.id), 'identified_profiles');
      return profiles.segmentFor(ctx.db, venue.id, ctx.params.userId, ctx.at);
    },
  },

  /* ═══════════════════════════════════════════════════ B8 the assistant ══ */
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/assistant/context',
    auth: 'partner',
    handler: (ctx) => {
      const venue = mine(ctx);
      entitlements.requireEntitlement(entOf(ctx, venue.id), 'assistant');
      return assistant.venueContext(ctx.db, venue.id, ctx.at);
    },
  },
  {
    method: 'POST',
    pattern: '/v1/partner/venues/:id/assistant/ask',
    auth: 'partner',
    handler: (ctx) => {
      const venue = mine(ctx);
      entitlements.requireEntitlement(entOf(ctx, venue.id), 'assistant');
      return assistant.askPartner(ctx.db, {
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
    handler: (ctx) => {
      const venue = mine(ctx);
      entitlements.requireEntitlement(entOf(ctx, venue.id), 'assistant');
      const draft = assistant.draftFor(ctx.db, {
        venueId: venue.id,
        goal: str(ctx.body, 'goal', { max: 400 }),
        budgetMinor: optInt(ctx.body, 'budgetMinor', { min: 0 }),
        at: ctx.at,
      });
      const sessionId = optStr(ctx.body, 'sessionId');
      if (sessionId) assistant.saveDraft(ctx.db, sessionId, draft, ctx.at);
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
    handler: (ctx) => {
      const venue = mine(ctx);
      entitlements.requireEntitlement(entOf(ctx, venue.id), 'assistant');
      return assistant.review(ctx.db, venue.id, ctx.at);
    },
  },
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/audit',
    auth: 'partner',
    handler: (ctx) => audit.forVenue(ctx.db, mine(ctx).id, qInt(ctx, 'limit', 100)),
  },
];
