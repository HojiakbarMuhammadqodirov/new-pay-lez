/**
 * A whole venue's worth of answers, for looking at the dashboard.
 *
 * ── why this exists ───────────────────────────────────────────────────────
 *
 * `dashboardSeed.ts` fills the panels the *server has no endpoint for* — the
 * fortnight chart, the sparklines, the period deltas. It cannot fill a screen,
 * because every screen is `<Screen state={…}>` and `chain()` fails the whole
 * state before any panel is reached when the API session owns no venue. So on
 * any account without a listing — which is every account somebody makes to look
 * at the design — all seven screens draw "Unmeasured" and the seed is never
 * consulted. This file is the other half: one plausible response per endpoint,
 * so the screens have something to render.
 *
 * **It is reached only through `DEMO_MODE`, and only after the real call has
 * already failed.** Both halves of that matter. A venue with a listing never
 * touches this file, because its call succeeds. A browser that has not been
 * sent `?demo=1` never touches it either, because `Screen` does not look. So
 * the twelve real venues on the box see exactly what they saw before: the
 * honest "we could not ask" panel.
 *
 * **Nothing here is a claim about anybody.** The figures are the reference
 * design's, rounded to look like a small Kraków café over thirty days, and the
 * venue is called what it is called so that nobody reading a screenshot can
 * mistake it for a real customer's data. That is the same reason
 * `db/demo.ts` was deleted from the server: an invented venue with a real name
 * is the problem, not an invented venue.
 *
 * Typed against the real response interfaces rather than as loose objects, so
 * the compiler is what keeps this file honest: if an endpoint grows a field,
 * this stops building rather than quietly rendering a screen the server can no
 * longer produce.
 */
import type {
  CustomersResponse,
  PartnerVenue,
  PendingScan,
  PushQuotaResponse,
  AnalyticsResponse,
  BudgetBody,
  CampaignResponse,
  DealResponse,
  Metric,
  OverviewBody,
  OverviewResponse,
  TodayResponse,
} from './api/partner';
import type { ReachReport } from './api/reach';

/** Counted and unsuppressed, which is what a figure the venue owns looks like. */
const counted = (value: number): Metric => ({
  value,
  kind: 'counted',
  suppressed: false,
});

/** Attributed to Paylez rather than merely observed — the weaker claim. */
const attributed = (value: number, cohort: number): Metric => ({
  value,
  kind: 'attributed',
  suppressed: false,
  cohort,
});

const PERIOD = '30d';
const CURRENCY = 'PLN';

const OVERVIEW: OverviewBody = {
  period: PERIOD,
  currency: CURRENCY,
  visits: counted(1148),
  customers: counted(412),
  newCustomers: counted(96),
  returningCustomers: counted(316),
  salesMinor: counted(4_186_00),
  projectedSalesMinor: counted(4_530_00),
  averageCheckMinor: counted(36_50),
  attributedVisits: attributed(287, 96),
  attributedCustomers: attributed(96, 96),
  pointsIssued: 23_960,
  discountGivenMinor: 812_00,
};

/*
 * The two pools, summing to the budget exactly.
 *
 * `available` is `base − spent − reserved` on both, because the repository's
 * budget rule is that the three states exhaust the pool and a bar that does not
 * add up lets an owner commit the same money twice. `npm run verify` asserts it
 * for the ported figures; getting it wrong here would draw a broken bar in the
 * one place somebody is looking at the bars.
 */
const BUDGET: BudgetBody = {
  id: 'bud_demo',
  venueId: 'ven_demo',
  period: PERIOD,
  currency: CURRENCY,
  total: 3_000_00,
  loyalty: { allocation: 'loyalty', base: 1_800_00, spent: 742_00, reserved: 216_00, available: 842_00 },
  voucher: { allocation: 'voucher', base: 1_200_00, spent: 388_00, reserved: 145_00, available: 667_00 },
  tiers: [
    { id: 'tier_5', discountPct: 5, pointsCost: 300, maxDiscountMinor: 10_00, estimateMinor: 6_80, estimatedRemaining: 98, available: true },
    { id: 'tier_10', discountPct: 10, pointsCost: 500, maxDiscountMinor: 25_00, estimateMinor: 13_60, estimatedRemaining: 49, available: true },
    { id: 'tier_15', discountPct: 15, pointsCost: 800, maxDiscountMinor: 40_00, estimateMinor: 20_40, estimatedRemaining: 32, available: false },
  ],
  averageCheck: { minor: 36_50, currency: CURRENCY },
  rebalanceHint: { from: 'voucher', to: 'loyalty', suggested: 200_00 },
  tolerance: null,
};

export const DEMO_OVERVIEW: OverviewResponse = {
  overview: OVERVIEW,
  budget: BUDGET,
  findings: [
    { key: 'quiet_hours', weight: 3, detail: { weekday: 2, hour: 15 } },
    { key: 'repeat_rising', weight: 2, detail: { from: 1.5, to: 2.4 } },
  ],
  floors: { minCohort: 25, minVenues: 5 },
};

export const DEMO_BUDGET: BudgetBody = BUDGET;

export const DEMO_TODAY: TodayResponse = {
  period: 'today',
  customers: counted(38),
  visits: counted(44),
  salesMinor: counted(1_604_00),
  pendingConfirmations: 2,
};

/*
 * A 7 × 24 grid with a morning and an evening ridge, and a genuinely dead
 * Tuesday afternoon — which is what the "quiet hours" finding above points at.
 * Generated rather than typed out: 168 hand-written integers is 168 chances to
 * put a Sunday peak on a Wednesday.
 */
const GRID: number[][] = Array.from({ length: 7 }, (_, day) =>
  Array.from({ length: 24 }, (_, hour) => {
    if (hour < 7 || hour > 21) return 0;
    const morning = Math.exp(-((hour - 9) ** 2) / 6) * 9;
    const evening = Math.exp(-((hour - 18) ** 2) / 7) * 11;
    const weekend = day >= 5 ? 1.25 : 1;
    const tuesdayLull = day === 1 && hour >= 14 && hour <= 16 ? 0.2 : 1;
    return Math.round((morning + evening) * weekend * tuesdayLull);
  }),
);

export const DEMO_ANALYTICS: AnalyticsResponse = {
  overview: OVERVIEW,
  heatmap: {
    period: PERIOD,
    grid: GRID,
    total: GRID.flat().reduce((sum, n) => sum + n, 0),
    quietest: { weekday: 1, hour: 15, visits: 1 },
    busiest: { weekday: 5, hour: 18, visits: 14 },
  },
  languageMix: {
    suppressed: false,
    total: 412,
    rows: [
      { language: 'pl', share: 0.58 },
      { language: 'uk', share: 0.19 },
      { language: 'en', share: 0.13 },
      { language: 'ru', share: 0.07 },
      { language: 'uz', share: 0.03 },
    ],
  },
  costPerNewCustomer: {
    period: PERIOD,
    spendMinor: 1_130_00,
    breakdown: { subscription: 299_00, loyalty: 443_00, vouchers: 268_00, deals: 120_00 },
    newCustomers: 96,
    costPerNewCustomerMinor: counted(11_77),
  },
  costPerNewCustomerTrend: [
    { period: '2026-06', costPerNewCustomerMinor: counted(15_40), newCustomers: 61, spendMinor: 939_00 },
    { period: '2026-07', costPerNewCustomerMinor: counted(13_10), newCustomers: 78, spendMinor: 1_021_00 },
    { period: '2026-08', costPerNewCustomerMinor: counted(11_77), newCustomers: 96, spendMinor: 1_130_00 },
  ],
  cohorts: [
    { cohort: '2026-06', size: 61, returned: counted(28) },
    { cohort: '2026-07', size: 78, returned: counted(41) },
    { cohort: '2026-08', size: 96, returned: counted(57) },
  ],
  repeatMultiple: counted(2.4),
  roi: [
    { feature: 'loyalty', spendMinor: 443_00, outcome: 212, outcomeLabel: 'repeat visits', costPerOutcomeMinor: 2_09 },
    { feature: 'vouchers', spendMinor: 268_00, outcome: 74, outcomeLabel: 'vouchers used', costPerOutcomeMinor: 3_62 },
    { feature: 'deals', spendMinor: 120_00, outcome: 38, outcomeLabel: 'claims', costPerOutcomeMinor: 3_16 },
  ],
  benchmarks: [
    { metric: 'repeat_multiple', value: 1.9, venue_count: 24 },
    { metric: 'average_check_minor', value: 33_20, venue_count: 24 },
  ],
};

/** Claims per day for the last seven, oldest first — zeros, never gaps. */
const series = (...days: number[]): number[] => days;

export const DEMO_DEALS: DealResponse[] = [
  {
    id: 'del_demo_morning',
    venue_id: 'ven_demo',
    discount_text: '20%',
    status: 'live',
    valid_from: '2026-08-15',
    valid_to: '2026-10-15',
    target_audience: 'all',
    target_weekdays: 'mon,tue,wed,thu,fri',
    target_from_min: 7 * 60,
    target_to_min: 10 * 60,
    cap_claims: 200,
    spend_minor: 214_00,
    seen_count: 2_180,
    opened_count: 431,
    claimed_count: 118,
    funnel: {
      seen: 2_180,
      opened: 431,
      claimed: 118,
      openRate: 0.198,
      claimRate: 0.274,
      spendMinor: 214_00,
      capClaims: 200,
      capSpendMinor: null,
    },
    translations: { languages: ['pl', 'uk', 'en', 'ru', 'uz'], filled: ['pl', 'uk', 'en'], missing: ['ru', 'uz'] },
    copy: {
      title: 'Morning coffee, 20% off',
      description: 'Any coffee before ten, on weekdays.',
      terms: 'One per person per day. Not with other offers.',
      language: 'en',
    },
    series: series(12, 9, 14, 18, 11, 15, 11),
    push: {
      status: 'sent',
      scheduledAt: '2026-08-20T07:00:00.000Z',
      sentAt: '2026-08-20T07:00:00.000Z',
      delivered: 1_640,
      opened: 388,
      cameIn: 112,
    },
  },
  {
    id: 'del_demo_lunch',
    venue_id: 'ven_demo',
    discount_text: '2+1',
    status: 'paused',
    valid_from: '2026-09-01',
    valid_to: '2026-11-30',
    target_audience: 'lapsed',
    target_weekdays: null,
    target_from_min: null,
    target_to_min: null,
    cap_claims: null,
    spend_minor: 86_00,
    seen_count: 940,
    opened_count: 152,
    claimed_count: 31,
    funnel: {
      seen: 940,
      opened: 152,
      claimed: 31,
      openRate: 0.162,
      claimRate: 0.204,
      spendMinor: 86_00,
      capClaims: null,
      capSpendMinor: null,
    },
    translations: { languages: ['pl', 'uk', 'en', 'ru', 'uz'], filled: ['pl'], missing: ['uk', 'en', 'ru', 'uz'] },
    copy: {
      title: 'Trzy w cenie dwóch',
      description: 'Dla tych, których dawno u nas nie było.',
      terms: 'Do wyczerpania zapasów.',
      language: 'pl',
    },
    series: series(4, 6, 3, 5, 0, 0, 0),
    push: null,
  },
  {
    id: 'del_demo_draft',
    venue_id: 'ven_demo',
    discount_text: '15%',
    status: 'draft',
    valid_from: null,
    valid_to: null,
    target_audience: 'newcomer',
    target_weekdays: null,
    target_from_min: null,
    target_to_min: null,
    cap_claims: null,
    spend_minor: 0,
    seen_count: 0,
    opened_count: 0,
    claimed_count: 0,
    funnel: {
      seen: 0,
      opened: 0,
      claimed: 0,
      openRate: 0,
      claimRate: 0,
      spendMinor: 0,
      capClaims: null,
      capSpendMinor: null,
    },
    translations: { languages: ['pl', 'uk', 'en', 'ru', 'uz'], filled: [], missing: ['pl', 'uk', 'en', 'ru', 'uz'] },
    /* A deal created and not yet written, which is a real state the row has to
       draw — see the note on `copy` in `api/partner.ts`. */
    copy: null,
    series: series(0, 0, 0, 0, 0, 0, 0),
    push: null,
  },
];

export const DEMO_CAMPAIGNS: CampaignResponse[] = [
  {
    id: 'cmp_demo_stamp',
    name: 'Every sixth coffee',
    visits_required: 6,
    reward_label: 'A free coffee',
    reward_cost_minor: 18_00,
    priority: 1,
    status: 'active',
    members: 214,
    earned: 61,
    redeemed: 44,
  },
  {
    id: 'cmp_demo_lunch',
    name: 'Lunch loyalty',
    visits_required: 10,
    reward_label: '25 zł off',
    reward_cost_minor: 25_00,
    priority: 2,
    status: 'paused',
    members: 88,
    earned: 12,
    redeemed: 7,
  },
];

/* ── the reads that are not one of the seven screens ───────────────────────
 *
 * Five panels ask the API on their own account rather than through `Screen`:
 * the rail's plan card, the overview's reach funnel and cost panel, the deals
 * screen's push quota, the customers roster and the scan queue. Each needs the
 * fallback stated where it reads, so each needs a payload here.
 */

export const DEMO_VENUE: PartnerVenue = {
  id: 'ven_demo',
  name: 'Demo Café',
  city: 'Kraków',
  currency: CURRENCY,
  timezone: 'Europe/Warsaw',
  status: 'active',
  verified_at: '2026-06-01T09:00:00.000Z',
};

/*
 * The funnel, and the one figure in it that takes the min-cohort floor.
 *
 * `uniqueClickers` is a finding about *people*, so it is suppressed under the
 * floor while the raw counts are not — that asymmetry is the rule the reach
 * report exists to state, and a demo that showed a number there would teach the
 * wrong thing about the screen.
 */
export const DEMO_REACH: ReachReport = {
  period: PERIOD,
  impressions: 3_120,
  clicks: 583,
  clickRate: 0.187,
  uniqueClickers: { value: 402, kind: 'counted', suppressed: false, cohort: 402 },
  claims: 149,
  claimRate: 0.256,
  sources: [
    { source: 'feed', impressions: 2_040, clicks: 401 },
    { source: 'search', impressions: 733, clicks: 121 },
    { source: 'map', impressions: 347, clicks: 61 },
  ],
  rows: [
    { id: null, title: 'Demo Café', impressions: 940, clicks: 152, claims: 0, clickRate: 0.162 },
    { id: 'del_demo_morning', title: 'Morning coffee, 20% off', impressions: 2_180, clicks: 431, claims: 118, clickRate: 0.198 },
    { id: 'del_demo_lunch', title: 'Trzy w cenie dwóch', impressions: 940, clicks: 152, claims: 31, clickRate: 0.162 },
  ],
};

export const DEMO_QUOTA: PushQuotaResponse = {
  period: PERIOD,
  quota: 4,
  used: 1,
  remaining: 3,
};

/*
 * A roster with a spread rather than three near-identical rows: somebody in
 * their first week, a regular, and one who has not been back in two months.
 * The screen's whole job is telling those apart.
 */
export const DEMO_CUSTOMERS: CustomersResponse = {
  totalCustomers: 412,
  sharedCustomers: 96,
  rows: [
    {
      userId: 'usr_demo_1', name: 'Marta W.', avatar: null, spendMinor: 486_00, visits: 14,
      firstSeenAt: '2026-06-12T08:20:00.000Z', lastSeenAt: '2026-09-08T09:10:00.000Z',
      daysSince: 1, status: 'regular', stamps: 4, vouchersHeld: 1,
    },
    {
      userId: 'usr_demo_2', name: 'Oleh K.', avatar: null, spendMinor: 92_00, visits: 3,
      firstSeenAt: '2026-09-02T17:40:00.000Z', lastSeenAt: '2026-09-07T18:02:00.000Z',
      daysSince: 2, status: 'newcomer', stamps: 2, vouchersHeld: 0,
    },
    {
      userId: 'usr_demo_3', name: 'Anna S.', avatar: null, spendMinor: 214_00, visits: 7,
      firstSeenAt: '2026-04-03T10:15:00.000Z', lastSeenAt: '2026-07-11T11:30:00.000Z',
      daysSince: 61, status: 'lapsed', stamps: 5, vouchersHeld: 2,
    },
  ],
};

/*
 * Two scans waiting at the counter, matching `pendingConfirmations` on
 * `DEMO_TODAY` — the two figures are the same fact on two screens and a demo
 * where they disagreed would look like a bug in the product.
 */
export const DEMO_PENDING: PendingScan[] = [
  {
    id: 'txn_demo_1', venue_id: 'ven_demo', user_id: 'usr_demo_2',
    trigger_type: 'qr', intent: 'earn', amount_minor: 42_00,
    amount_entered_by: 'cashier', currency: CURRENCY,
    opened_at: '2026-09-09T10:41:00.000Z',
  },
  {
    id: 'txn_demo_2', venue_id: 'ven_demo', user_id: 'usr_demo_1',
    trigger_type: 'qr', intent: 'voucher_redeem', amount_minor: null,
    amount_entered_by: null, currency: CURRENCY,
    opened_at: '2026-09-09T10:44:00.000Z',
  },
];
