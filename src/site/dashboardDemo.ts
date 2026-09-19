/**
 * A whole venue's worth of answers, for looking at the dashboard.
 *
 * ── why this exists ───────────────────────────────────────────────────────
 *
 * Every screen is `<Screen state={…}>`, and `chain()` fails the whole state
 * before any panel is reached when the API session owns no venue. So on any
 * browser without one — which is every browser somebody opens `?demo=1` in, by
 * design, since the demo account carries no token — all seven screens would
 * draw "Unmeasured" and there would be nothing to look at. This file is one
 * plausible response per endpoint, so the screens have something to render.
 *
 * **It is reached only through `DEMO_MODE`, and only after the real call has
 * already failed.** Both halves of that matter. A venue with a listing never
 * touches this file, because its call succeeds. A browser that has not been
 * sent `?demo=1` never touches it either, because `Screen` does not look. So
 * the real venues on the box see exactly what they would otherwise: their own
 * figures, or the honest "we could not ask" panel.
 *
 * **Nothing here is a claim about anybody.** The venue is called what it is
 * called so that nobody reading a screenshot can mistake it for a real
 * customer's data. That is the same reason `db/demo.ts` was deleted from the
 * server: an invented venue with a real name is the problem, not an invented
 * venue.
 *
 * Typed against the real response interfaces rather than as loose objects, so
 * the compiler is what keeps this file honest: if an endpoint grows a field,
 * this stops building rather than quietly rendering a screen the server can no
 * longer produce.
 *
 * ── one till roll, and every figure is read off it ────────────────────────
 *
 * The version before this typed each endpoint's numbers separately, and they
 * disagreed the moment two panels showed the same fact: the overview's month of
 * sales was a tenth of its own visits times its own average check, and the
 * insight rows quoted offers that were not on the deals table. So the demo now
 * starts from **six months of days at the counter** — visits, first visits,
 * claims, redemptions and the bills behind them — and the series, the scan log,
 * today's tiles, the overview's totals and the month-on-month trend are all
 * *computed* from those days. Two panels quoting one fact cannot drift, because
 * there is only one copy of it.
 *
 * Everything is a function of the day's position and weekday. There is no
 * `Math.random()` and there must not be: a demo that dealt a different month on
 * every load would be a slot machine where an example is wanted, and two
 * screenshots of one screen would disagree.
 */
import type {
  AnalyticsResponse,
  AudienceRow,
  BudgetBody,
  CampaignResponse,
  CustomerDetailResponse,
  CustomersResponse,
  DealResponse,
  InboxResponse,
  InsightDeal,
  InsightsResponse,
  Metric,
  OverviewBody,
  OverviewResponse,
  PartnerVenue,
  PendingScan,
  PushQuotaResponse,
  RemindStatus,
  ScanRowResponse,
  ScansQuery,
  ScansResponse,
  SeriesDays,
  SeriesResponse,
  SeriesTotals,
  TodayResponse,
  VoucherRegister,
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

const CURRENCY = 'PLN';
const TIMEZONE = 'Europe/Warsaw';

const HOUR = 3_600_000;
const DAY = 86_400_000;

/* ═══════════════════════════════════════════════════════════════ the clock ══ */

/**
 * Local noon, `back` days before today.
 *
 * Noon rather than midnight: the constructor normalises a negative day number,
 * and an hour in the middle of the day cannot be carried across a date boundary
 * by a daylight-saving shift the way 00:00 can.
 */
const dayAt = (back: number): Date => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, 12);
};

/** Local `YYYY-MM-DD`. `toISOString` is UTC and names yesterday east of it. */
const isoDay = (date: Date): string =>
  `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;

/** `YYYY-MM` of a date `offset` months from it, which is the server's period. */
const monthKey = (date: Date, offset = 0): string => {
  const at = new Date(date.getFullYear(), date.getMonth() + offset, 1, 12);
  return `${at.getFullYear()}-${`${at.getMonth() + 1}`.padStart(2, '0')}`;
};

/** An ISO instant `back` days before today, or ahead of it when negative. */
const isoAt = (back: number): string => dayAt(back).toISOString();

const TODAY = dayAt(0);
const THIS_MONTH = monthKey(TODAY);

/**
 * How far ahead of UTC Warsaw is on a given day, in milliseconds.
 *
 * The till log's times are the venue's **wall clock** — an owner wants the hour
 * the bill was rung up — so each instant is built from a Warsaw hour and this
 * offset, once per day rather than once per row. `Intl` supplies it, DST
 * included, which is the construction `venueInstant` in `api/partner.ts` uses.
 */
let warsawClock: Intl.DateTimeFormat | null = null;

function warsawOffsetMs(noon: Date): number {
  /* One formatter for the life of the page: constructing an `Intl` formatter is
     the expensive half, and this is called once per day of the roll. */
  warsawClock ??= new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = warsawClock.formatToParts(noon);
  const at: Record<string, number> = {};
  for (const part of parts) if (part.type !== 'literal') at[part.type] = Number(part.value);
  return Date.UTC(at.year, at.month - 1, at.day, at.hour, at.minute) - Math.floor(noon.getTime() / 60_000) * 60_000;
}

/* ═══════════════════════════════════════════════════════════ the till roll ══ */

/** Six months, so the quarter view has a quarter before it to compare with. */
const HISTORY = 180;
/** The window the overview and every "this month" figure below are pinned to. */
const WINDOW = 30;

/*
 * A café's week, by weekday. Indexed by `Date.getDay()`, so Sunday first.
 *
 * Monday is the trough and the weekend runs about a third above midweek — which
 * is the shape the heat map below asserts too, and a chart whose busiest day
 * contradicted the heat map beside it would read as two venues.
 */
const WEEKDAY_WEIGHT = [1.3, 0.82, 0.92, 0.97, 1, 1.12, 1.33];

/**
 * The last thirty days, as the rest of this file quotes them.
 *
 * `visits` is the overview's headline and `first` its new customers — 8.4% of
 * visits, which is about what a café with a regular trade sees. `claims` is the
 * reach funnel's total, `vouchers` the ladder's redeemed count, and `rewards` the
 * stamp cards cashed in. The generator below is made to land on these exactly.
 */
const TARGET = { visits: 1_148, first: 96, claims: 262, vouchers: 54, rewards: 41 };

/**
 * Whole numbers that sum to `total` exactly, in proportion to `weights`.
 *
 * Largest remainder, ties broken by position so the result is the same on every
 * machine. Rounding each share on its own would miss the total by a few, and
 * the total is the one figure two panels both print.
 */
function apportion(weights: number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || total <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w / sum) * total);
  const out = exact.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (let k = 0; left > 0 && k < order.length; k += 1, left -= 1) out[order[k].index] += 1;
  return out;
}

/**
 * Twelve café bills in grosz, and their mean is not a coincidence.
 *
 * They sum to 438.00 zł, so the average is exactly 36.50 — the average check the
 * budget reports. The slot stride below is coprime with twelve, so across a day
 * the bills are dealt evenly and the till's own average lands on the same figure
 * rather than near it.
 *
 * The two small ones are load-bearing: 11.50 is under both the coffee card's
 * 15.00 minimum and the pastry card's 12.00, and 13.80 is under the coffee card's
 * alone. They are what puts a counted scan that advanced no card in the log.
 */
const SCAN_BILLS = [
  11_50, 31_50, 45_80, 13_80, 52_30, 36_70,
  27_60, 61_40, 24_80, 42_10, 33_20, 57_30,
];

const billFor = (dayIndex: number, slot: number): number =>
  SCAN_BILLS[(dayIndex * 5 + slot * 7) % SCAN_BILLS.length];

/**
 * Scans that did not count. The first two are under the venue's own 10.00 zł
 * floor; the other two are a second scan inside the cooldown — a customer who
 * came back for a pastry an hour after their coffee.
 */
const UNCOUNTED_BILLS = [7_90, 9_50, 24_00, 18_40];

interface TillDay {
  day: string;
  date: Date;
  visits: number;
  uncounted: number;
  first: number;
  claims: number;
  vouchers: number;
  rewards: number;
  salesMinor: number;
}

function buildDays(): TillDay[] {
  const dates = Array.from({ length: HISTORY }, (_, i) => dayAt(HISTORY - 1 - i));

  /* A base that grows across the six months — a venue building its regulars —
     with a small sine on top, because a curve with no noise in it reads as a
     diagram rather than as takings. */
  const raw = dates.map((date, i) => {
    const base = 26 + (13 * i) / (HISTORY - 1) + 1.4 * Math.sin(i * 1.7);
    return base * WEEKDAY_WEIGHT[date.getDay()];
  });

  const cut = HISTORY - WINDOW;
  const recent = raw.slice(cut);
  const scale = TARGET.visits / recent.reduce((a, b) => a + b, 0);
  const visits = [...raw.slice(0, cut).map((v) => Math.round(v * scale)), ...apportion(recent, TARGET.visits)];
  const recentVisits = visits.slice(cut);

  /* Older days at the same rates, rounded one by one — only the recent window
     has a total anybody prints. First visits run higher early on, when more of
     the trade was new. */
  const older = (i: number, rate: number) => Math.round(visits[i] * rate);
  const inThisMonth = (date: Date) => monthKey(date) === THIS_MONTH;

  const first = [
    ...visits.slice(0, cut).map((_, i) => older(i, (TARGET.first / TARGET.visits) * (1.35 - (0.35 * i) / cut))),
    ...apportion(recentVisits, TARGET.first),
  ];
  const claims = [
    ...visits.slice(0, cut).map((_, i) => older(i, (TARGET.claims / TARGET.visits) * 0.9)),
    ...apportion(recentVisits, TARGET.claims),
  ];
  /* Voucher use is held a little lower inside the current month than before
     it, so the month-on-month trend has a direction to report — and it is
     computed from these days below, not typed into the finding. */
  const vouchers = [
    ...visits.slice(0, cut).map((_, i) => older(i, (TARGET.vouchers / TARGET.visits) * 1.02)),
    ...apportion(
      recentVisits.map((v, k) => v * (inThisMonth(dates[cut + k]) ? 0.9 : 1.02)),
      TARGET.vouchers,
    ),
  ];
  const rewards = [
    ...visits.slice(0, cut).map((_, i) => older(i, TARGET.rewards / TARGET.visits)),
    ...apportion(recentVisits, TARGET.rewards),
  ];

  return dates.map((date, i) => {
    let salesMinor = 0;
    for (let slot = 0; slot < visits[i]; slot += 1) salesMinor += billFor(i, slot);
    return {
      day: isoDay(date),
      date,
      visits: visits[i],
      uncounted: Math.floor(visits[i] / 22) + (i % 4 === 0 ? 1 : 0),
      first: Math.min(first[i], visits[i]),
      claims: claims[i],
      vouchers: vouchers[i],
      rewards: rewards[i],
      salesMinor,
    };
  });
}

/*
 * Resolved once, at module load. The generator reads the clock, so two calls
 * either side of midnight would disagree about which day is "today" — and
 * "today" is exactly what the chart's right-hand end and the scan tiles claim.
 */
const TILL: TillDay[] = buildDays();
const RECENT = TILL.slice(HISTORY - WINDOW);
const LAST_DAY = TILL[HISTORY - 1];

/**
 * Distinct customers over a window, from how many visits it held.
 *
 * Sub-linear, because regulars repeat: a fortnight is not half a month's
 * customers but more like three fifths of them. Pinned so the thirty-day window
 * gives exactly the overview's 412, and never more people than visits.
 */
const distinctCustomers = (visits: number): number =>
  Math.min(visits, Math.round(412 * (visits / TARGET.visits) ** 0.7));

function totalsOver(days: TillDay[]): SeriesTotals {
  const add = (pick: (day: TillDay) => number) => days.reduce((sum, day) => sum + pick(day), 0);
  const visits = add((day) => day.visits);
  return {
    visits,
    customers: distinctCustomers(visits),
    newCustomers: add((day) => day.first),
    salesMinor: add((day) => day.salesMinor),
    claims: add((day) => day.claims),
    vouchersRedeemed: add((day) => day.vouchers),
    rewardsRedeemed: add((day) => day.rewards),
  };
}

const RECENT_TOTALS = totalsOver(RECENT);

const seriesCache = new Map<SeriesDays, SeriesResponse>();

/**
 * `GET …/series?days=` for the demo venue, read off the till roll.
 *
 * Cached per window so a panel that depends on the object's identity renders
 * once rather than on every pass — a fresh object per call would restart the
 * count-up and re-run every derivation that keys on it.
 */
export function demoSeries(days: SeriesDays): SeriesResponse {
  const hit = seriesCache.get(days);
  if (hit) return hit;

  const window = TILL.slice(HISTORY - days);
  const before = TILL.slice(Math.max(0, HISTORY - 2 * days), HISTORY - days);
  const built: SeriesResponse = {
    days,
    from: window[0].day,
    to: window[window.length - 1].day,
    timezone: TIMEZONE,
    currency: CURRENCY,
    series: window.map((day) => ({
      day: day.day,
      visits: day.visits,
      /* One counted visit per person per day — the cooldown is a day — so a
         day's customers are its visits. The window's distinct count is not the
         sum of these, and `totals` says so. */
      customers: day.visits,
      salesMinor: day.salesMinor,
      claims: day.claims,
      vouchersRedeemed: day.vouchers,
      rewardsRedeemed: day.rewards,
    })),
    totals: totalsOver(window),
    previous: totalsOver(before),
  };
  seriesCache.set(days, built);
  return built;
}

/* ═════════════════════════════════════════════════════════ the month's totals ══ */

const OVERVIEW: OverviewBody = {
  period: THIS_MONTH,
  currency: CURRENCY,
  visits: counted(RECENT_TOTALS.visits),
  customers: counted(RECENT_TOTALS.customers),
  newCustomers: counted(RECENT_TOTALS.newCustomers),
  returningCustomers: counted(RECENT_TOTALS.customers - RECENT_TOTALS.newCustomers),
  /* Read off the same bills the scan log prints. It was typed as 4 186 zł for
     a while — a tenth of 1 148 visits at 36.50 — and nothing caught it because
     no panel put the two side by side. */
  salesMinor: counted(RECENT_TOTALS.salesMinor),
  projectedSalesMinor: counted(Math.round(RECENT_TOTALS.salesMinor * 1.08)),
  averageCheckMinor: counted(Math.round(RECENT_TOTALS.salesMinor / RECENT_TOTALS.visits)),
  attributedVisits: attributed(287, RECENT_TOTALS.newCustomers),
  attributedCustomers: attributed(RECENT_TOTALS.newCustomers, RECENT_TOTALS.newCustomers),
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
  period: THIS_MONTH,
  currency: CURRENCY,
  total: 3_000_00,
  loyalty: { allocation: 'loyalty', base: 1_800_00, spent: 742_00, reserved: 216_00, available: 842_00 },
  voucher: { allocation: 'voucher', base: 1_200_00, spent: 388_00, reserved: 145_00, available: 667_00 },
  /*
   * The ladder, with its take-up.
   *
   * Four things hold this block together, and each of them is the kind of
   * arithmetic somebody reads off the screen:
   *
   *  - **`spentMinor` sums to `voucher.spent` exactly** — 170.00 + 133.00 +
   *    85.00 = 388.00, which is the invariant the server tests on the real
   *    response. A breakdown that does not add up to the total it breaks down is
   *    a bar an owner can commit the same złoty twice against.
   *  - **`redeemedCount` sums to 54**, which is the thirty-day `vouchersRedeemed`
   *    the overview's tile reads off the till roll.
   *  - **What is still out roughly matches `voucher.reserved`.** 11 + 2 + 2
   *    active at today's estimates is 142.80 against a 145.00 reserve — roughly
   *    rather than exactly, because a reserve is taken at the estimate that held
   *    on the day the voucher was issued.
   *  - **Cost per voucher rises with the rung and stays under its estimate** —
   *    5.00, 9.50, 14.17 against 6.80, 13.60, 20.40. The estimate is capped and
   *    deliberately conservative.
   *
   * The 15% rung is **retired** (`active: false`) and still listed, because two
   * vouchers issued at it this month are still in somebody's wallet — which is
   * exactly when the server keeps an inactive tier on the ladder, and the one
   * state of a rung the screen must not offer to edit.
   */
  tiers: [
    { id: 'tier_5', discountPct: 5, pointsCost: 300, maxDiscountMinor: 10_00, estimateMinor: 6_80, estimatedRemaining: 98, available: true, issuedCount: 45, redeemedCount: 34, activeCount: 11, spentMinor: 170_00, active: true },
    { id: 'tier_10', discountPct: 10, pointsCost: 500, maxDiscountMinor: 25_00, estimateMinor: 13_60, estimatedRemaining: 49, available: true, issuedCount: 16, redeemedCount: 14, activeCount: 2, spentMinor: 133_00, active: true },
    { id: 'tier_15', discountPct: 15, pointsCost: 800, maxDiscountMinor: 40_00, estimateMinor: 20_40, estimatedRemaining: 0, available: false, issuedCount: 8, redeemedCount: 6, activeCount: 2, spentMinor: 85_00, active: false },
  ],
  averageCheck: { minor: OVERVIEW.averageCheckMinor.value ?? 36_50, currency: CURRENCY },
  rebalanceHint: { from: 'voucher', to: 'loyalty', suggested: 200_00 },
  tolerance: null,
};

/*
 * The voucher register, and it is **the same venue as `BUDGET` above**.
 *
 * That is the only thing making this file worth having rather than a handful of
 * plausible numbers per screen: the register's totals are the ladder's take-up,
 * re-counted. `issuedTotal` on each rung is its lifetime count, which is larger
 * than the `issuedCount` beside it because that one is this month's — the whole
 * distinction a cap needs, and the reason both are sent.
 *
 * Three rungs, and each is a different state of a cap on purpose, because that
 * is what the screen has to draw differently:
 *
 *  - **5%** is capped at 400 with 312 taken — a bar three-quarters along, which
 *    is the reading `.pd-limit` exists for.
 *  - **10%** has no total cap at all (`null`) and a per-customer one, so it
 *    draws the count without a bar. A `?? 0` anywhere on that path would print
 *    "312 of 0".
 *  - **15%** is retired and read-only, and its cap is shown rather than
 *    editable — the one rung state the screen must not offer to edit, because
 *    saving it would put the rung back on sale.
 *
 * The rows are the last few of that venue's month. Two are unused, one was
 * spent, one lapsed — the four statuses minus `cancelled`, which nothing on the
 * server writes, so a demo that showed one would be demonstrating a state the
 * product cannot reach. One holder is `null`, which is the §1.4 grant withheld
 * and is drawn as withheld rather than as "anonymous".
 */
const REGISTER_TIERS: BudgetBody['tiers'] = BUDGET.tiers.map((tier) =>
  tier.discountPct === 5
    ? { ...tier, redeemLimit: 400, perUserLimit: 2, issuedTotal: 312 }
    : tier.discountPct === 10
      ? { ...tier, redeemLimit: null, perUserLimit: 1, issuedTotal: 96 }
      : { ...tier, redeemLimit: 60, perUserLimit: null, issuedTotal: 58 },
);

/*
 * The plan panel's two reads (item 24), for a browser with no partner session.
 *
 * `DEMO_VENUE_PLAN` is the same venue as `BUDGET` above and is on **Growth**,
 * which is the tier the demo's five live deals and three campaigns actually fit
 * inside — a demo on Starter would draw "5 of 1" and read as a bug rather than
 * as a screen. `DEMO_PARTNER_PLANS` mirrors the three seeds in
 * `server/domain/settings.ts` row for row, because the comparison's whole
 * claim is that it is showing the server's own entitlements.
 */
export const DEMO_PARTNER_PLANS = [
  {
    id: 'pln_starter',
    code: 'starter',
    name: 'Starter',
    price_minor: 0,
    currency: 'PLN',
    interval: 'month',
    rank: 0,
    entitlements: [
      { key: 'live_deals', value: '1' },
      { key: 'active_campaigns', value: '1' },
      { key: 'push_quota', value: '2' },
      { key: 'team_seats', value: '1' },
      { key: 'venues', value: '1' },
      { key: 'deep_analytics', value: 'false' },
      { key: 'identified_profiles', value: 'false' },
      { key: 'assistant', value: 'false' },
      { key: 'benchmarks', value: 'false' },
      { key: 'export_csv', value: 'false' },
    ],
  },
  {
    id: 'pln_growth',
    code: 'growth',
    name: 'Growth',
    price_minor: 29900,
    currency: 'PLN',
    interval: 'month',
    rank: 1,
    entitlements: [
      { key: 'live_deals', value: '5' },
      { key: 'active_campaigns', value: '3' },
      { key: 'push_quota', value: '4' },
      { key: 'team_seats', value: '5' },
      { key: 'venues', value: '3' },
      { key: 'deep_analytics', value: 'true' },
      { key: 'identified_profiles', value: 'true' },
      { key: 'assistant', value: 'true' },
      { key: 'benchmarks', value: 'true' },
      { key: 'export_csv', value: 'true' },
    ],
  },
  {
    id: 'pln_chain',
    code: 'chain',
    name: 'Chain',
    price_minor: 79900,
    currency: 'PLN',
    interval: 'month',
    rank: 2,
    entitlements: [
      { key: 'live_deals', value: '20' },
      { key: 'active_campaigns', value: '10' },
      { key: 'push_quota', value: '8' },
      { key: 'team_seats', value: '25' },
      { key: 'venues', value: '25' },
      { key: 'deep_analytics', value: 'true' },
      { key: 'identified_profiles', value: 'true' },
      { key: 'assistant', value: 'true' },
      { key: 'benchmarks', value: 'true' },
      { key: 'export_csv', value: 'true' },
    ],
  },
];

export const DEMO_VENUE_PLAN = {
  subscription: {
    id: 'sub_demo',
    status: 'active',
    source: 'stripe',
    started_at: isoAt(96),
    renews_at: isoAt(-14),
    cancel_at: null,
  },
  plan: { id: 'pln_growth', code: 'growth', name: 'Growth', rank: 1 },
  entitlements: Object.fromEntries(
    DEMO_PARTNER_PLANS[1].entitlements.map((row) => [row.key, row.value]),
  ),
};

export const DEMO_REGISTER: VoucherRegister = {
  tiers: REGISTER_TIERS,
  totals: { issued: 466, active: 15, redeemed: 401, expired: 50, lapsing: 4 },
  vouchers: [
    {
      id: 'ivc_demo_1',
      code: 'PZ-4K7Q-M2',
      discountPct: 10,
      pointsSpent: 500,
      reservedMinor: 13_60,
      spentMinor: 0,
      status: 'active',
      issuedAt: isoAt(2),
      expiresAt: isoAt(-28),
      redeemedAt: null,
      holder: 'Marta K.',
    },
    {
      id: 'ivc_demo_2',
      code: 'PZ-9XB3-71',
      discountPct: 5,
      pointsSpent: 300,
      reservedMinor: 6_80,
      spentMinor: 0,
      status: 'active',
      issuedAt: isoAt(5),
      expiresAt: isoAt(-3),
      redeemedAt: null,
      /* The grant withheld — "we are not telling you", not "anonymous". */
      holder: null,
    },
    {
      id: 'ivc_demo_3',
      code: 'PZ-2PDR-58',
      discountPct: 5,
      pointsSpent: 300,
      reservedMinor: 6_80,
      spentMinor: 5_00,
      status: 'redeemed',
      issuedAt: isoAt(9),
      expiresAt: isoAt(-21),
      redeemedAt: isoAt(6),
      holder: 'Tomasz W.',
    },
    {
      id: 'ivc_demo_4',
      code: 'PZ-6MJ1-04',
      discountPct: 15,
      pointsSpent: 800,
      reservedMinor: 20_40,
      spentMinor: 0,
      status: 'expired',
      issuedAt: isoAt(41),
      expiresAt: isoAt(11),
      redeemedAt: null,
      holder: 'Anna L.',
    },
  ],
};

export const DEMO_OVERVIEW: OverviewResponse = {
  overview: OVERVIEW,
  budget: BUDGET,
  findings: [
    { key: 'quiet_window', weight: 3, detail: { weekday: 1, hour: 15 } },
    { key: 'new_customers', weight: 2, detail: { n: RECENT_TOTALS.newCustomers } },
  ],
  floors: { minCohort: 10, minVenues: 5 },
};

export const DEMO_BUDGET: BudgetBody = BUDGET;

/* ── today, off the last day of the roll ─────────────────────────────────── */

export const DEMO_TODAY: TodayResponse = {
  period: 'today',
  customers: counted(LAST_DAY.visits),
  visits: counted(LAST_DAY.visits),
  salesMinor: counted(LAST_DAY.salesMinor),
  pendingConfirmations: 2,
};

/*
 * A 7 × 24 grid with a morning and an evening ridge, and a genuinely dead
 * Tuesday afternoon. Generated rather than typed out: 168 hand-written integers
 * is 168 chances to put a Sunday peak on a Wednesday.
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
    period: THIS_MONTH,
    grid: GRID,
    total: GRID.flat().reduce((sum, n) => sum + n, 0),
    quietest: { weekday: 1, hour: 15, visits: 1 },
    busiest: { weekday: 5, hour: 18, visits: 14 },
  },
  languageMix: {
    suppressed: false,
    total: RECENT_TOTALS.customers,
    rows: [
      { language: 'pl', share: 0.58 },
      { language: 'uk', share: 0.19 },
      { language: 'en', share: 0.13 },
      { language: 'ru', share: 0.07 },
      { language: 'uz', share: 0.03 },
    ],
  },
  costPerNewCustomer: {
    /* A calendar month, and the last row of the trend below — the Customers
       screen marks the current bar by matching the two. */
    period: THIS_MONTH,
    spendMinor: 1_130_00,
    breakdown: { subscription: 299_00, loyalty: 443_00, vouchers: 268_00, deals: 120_00 },
    newCustomers: RECENT_TOTALS.newCustomers,
    costPerNewCustomerMinor: counted(Math.round(1_130_00 / RECENT_TOTALS.newCustomers)),
  },
  costPerNewCustomerTrend: [
    { period: monthKey(TODAY, -2), costPerNewCustomerMinor: counted(15_40), newCustomers: 61, spendMinor: 939_00 },
    { period: monthKey(TODAY, -1), costPerNewCustomerMinor: counted(13_10), newCustomers: 78, spendMinor: 1_021_00 },
    {
      period: THIS_MONTH,
      costPerNewCustomerMinor: counted(Math.round(1_130_00 / RECENT_TOTALS.newCustomers)),
      newCustomers: RECENT_TOTALS.newCustomers,
      spendMinor: 1_130_00,
    },
  ],
  cohorts: [
    { cohort: monthKey(TODAY, -2), size: 61, returned: counted(28) },
    { cohort: monthKey(TODAY, -1), size: 78, returned: counted(41) },
    { cohort: THIS_MONTH, size: RECENT_TOTALS.newCustomers, returned: counted(57) },
  ],
  repeatMultiple: counted(2.4),
  roi: [
    { feature: 'loyalty', spendMinor: 443_00, outcome: 212, outcomeLabel: 'repeat visits', costPerOutcomeMinor: 2_09 },
    /* 54, the thirty-day redemptions off the till roll and the ladder's count. */
    { feature: 'vouchers', spendMinor: 268_00, outcome: RECENT_TOTALS.vouchersRedeemed, outcomeLabel: 'vouchers used', costPerOutcomeMinor: Math.round(268_00 / RECENT_TOTALS.vouchersRedeemed) },
    { feature: 'deals', spendMinor: 120_00, outcome: 38, outcomeLabel: 'claims', costPerOutcomeMinor: 3_16 },
  ],
  /*
   * What venues like this one pay, for the sentence under the trend bars. The
   * figure is deliberately *above* this venue's own: a benchmark that always
   * flatters is a benchmark nobody checks twice.
   */
  benchmarks: [
    { metric: 'repeat_multiple', value: 1.9, venue_count: 24 },
    { metric: 'average_check_minor', value: 33_20, venue_count: 24 },
    { metric: 'cost_per_new_customer_minor', value: 14_60, venue_count: 24 },
  ],
};

/* ═══════════════════════════════════════════════════════════════ the deals ══ */

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
    id: 'del_demo_bake',
    venue_id: 'ven_demo',
    discount_text: 'Free',
    status: 'live',
    valid_from: '2026-09-01',
    valid_to: '2026-12-31',
    target_audience: 'all',
    target_weekdays: 'wed,thu,fri,sat,sun',
    target_from_min: 14 * 60,
    target_to_min: 17 * 60,
    cap_claims: 150,
    spend_minor: 268_00,
    seen_count: 1_240,
    opened_count: 268,
    claimed_count: 74,
    funnel: {
      seen: 1_240,
      opened: 268,
      claimed: 74,
      openRate: 0.216,
      claimRate: 0.276,
      spendMinor: 268_00,
      /* The only spend cap in the set. Both caps null on every other row draws
         the uncapped state four times over and the capped one never. */
      capClaims: 150,
      capSpendMinor: 400_00,
    },
    translations: { languages: ['pl', 'uk', 'en', 'ru', 'uz'], filled: ['pl', 'uk', 'en'], missing: ['ru', 'uz'] },
    copy: {
      title: 'Free filter coffee with any bake',
      description: 'Afternoons, with anything off the counter.',
      terms: 'One per person per visit. Filter coffee only.',
      language: 'en',
    },
    series: series(2, 4, 3, 5, 2, 3, 1),
    /* The other push state: `scheduled` with no `sentAt`. The three counts are
       0 rather than null because they are counts of something that has not
       happened — `sentAt` is the field that says which state this is. */
    push: {
      status: 'scheduled',
      scheduledAt: '2026-09-14T14:00:00.000Z',
      sentAt: null,
      delivered: 0,
      opened: 0,
      cameIn: 0,
    },
  },
  {
    id: 'del_demo_weekend',
    venue_id: 'ven_demo',
    discount_text: '15%',
    status: 'live',
    valid_from: '2026-08-29',
    valid_to: '2026-10-31',
    target_audience: 'returning',
    target_weekdays: 'sat,sun',
    target_from_min: 9 * 60,
    target_to_min: 13 * 60,
    cap_claims: null,
    spend_minor: 152_00,
    seen_count: 806,
    opened_count: 141,
    claimed_count: 39,
    funnel: {
      seen: 806,
      opened: 141,
      claimed: 39,
      openRate: 0.175,
      claimRate: 0.277,
      spendMinor: 152_00,
      capClaims: null,
      capSpendMinor: null,
    },
    /* Written in all five, which no other row here is. The translations chip
       has a finished state and a demo that never reached it teaches the screen
       as a list of complaints. */
    translations: {
      languages: ['pl', 'uk', 'en', 'ru', 'uz'],
      filled: ['pl', 'uk', 'en', 'ru', 'uz'],
      missing: [],
    },
    copy: {
      title: 'Weekendowe śniadanie, 15% taniej',
      description: 'Sobota i niedziela, do trzynastej.',
      terms: 'Dla stałych gości. Nie łączy się z innymi promocjami.',
      language: 'pl',
    },
    /* A weekend-only deal claims nothing midweek, and the zeros are the point. */
    series: series(5, 3, 0, 0, 0, 0, 4),
    push: null,
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

/*
 * Four campaigns, and three sums that have to hold.
 *
 * ── the rewards waiting are one of the overview's own figures ──────────────
 *
 * `available` is a reward somebody has qualified for and not collected, and the
 * four rows sum to **35** — the `n` of "35 loyalty rewards are earned and sitting
 * unused" in `DEMO_INSIGHTS`, and the gap panel's "Waiting". `expired` is what
 * was left to lapse, so `earned = redeemed + expired + available` on every row.
 *
 * ── and they apportion the loyalty pool exactly ───────────────────────────
 *
 *     Σ redeemed × cost      74×6.00 + 36×4.50 + 0 + 17×8.00          = 742.00 = loyalty.spent
 *     Σ reserved_minor       20×6.00 + 8×4.50 + 2×10.00 + 5×8.00      = 216.00 = loyalty.reserved
 *
 * ── one stamp short ───────────────────────────────────────────────────────
 *
 * `near` sums to 18 across the three running cards — the reference design's
 * "18 regulars are one visit away" — and is 0 on the paused one, because a card
 * nobody can stamp has nobody one stamp from anything.
 *
 * Ordered `priority DESC, created_at DESC`, which is what the endpoint's own
 * `ORDER BY` returns.
 */
export const DEMO_CAMPAIGNS: CampaignResponse[] = [
  {
    id: 'cmp_demo_stamp',
    name: 'Every sixth coffee',
    visits_required: 6,
    reward_label: 'A free filter coffee',
    /* What it costs the *venue*, not what it sells for. */
    reward_cost_minor: 6_00,
    priority: 3,
    recurring: 1,
    min_spend_minor: 15_00,
    reward_valid_days: 60,
    status: 'active',
    created_at: '2026-03-04T09:12:00.000Z',
    updated_at: '2026-07-15T14:08:00.000Z',
    members: 263,
    earned: 100,
    redeemed: 74,
    near: 11,
    available: 20,
    expired: 6,
    reserved_minor: 120_00,
  },
  {
    id: 'cmp_demo_pastry',
    name: 'Pastry club',
    visits_required: 4,
    reward_label: 'A croissant on us',
    reward_cost_minor: 4_50,
    priority: 2,
    recurring: 1,
    min_spend_minor: 12_00,
    reward_valid_days: 30,
    status: 'active',
    created_at: '2026-05-19T11:40:00.000Z',
    updated_at: '2026-05-19T11:40:00.000Z',
    members: 141,
    earned: 47,
    redeemed: 36,
    near: 5,
    available: 8,
    expired: 3,
    reserved_minor: 36_00,
  },
  {
    id: 'cmp_demo_cake',
    name: 'Evening cake club',
    visits_required: 5,
    reward_label: 'A slice of cake',
    reward_cost_minor: 10_00,
    priority: 1,
    recurring: 1,
    /* The one row with no override — the venue's own floor applies. */
    min_spend_minor: null,
    reward_valid_days: 45,
    status: 'active',
    created_at: '2026-09-02T08:05:00.000Z',
    updated_at: '2026-09-02T08:05:00.000Z',
    members: 19,
    earned: 2,
    redeemed: 0,
    near: 2,
    available: 2,
    expired: 0,
    reserved_minor: 20_00,
  },
  {
    id: 'cmp_demo_lunch',
    name: 'Lunch loyalty',
    visits_required: 10,
    reward_label: 'A bowl of soup',
    reward_cost_minor: 8_00,
    priority: 0,
    /* The one that does not start again, and the one that is paused. Ten visits
       at a thirty-five złoty minimum for an eight złoty bowl is a worse deal
       than the six-visit coffee card above it. */
    recurring: 0,
    min_spend_minor: 35_00,
    reward_valid_days: 90,
    status: 'paused',
    created_at: '2026-04-22T10:30:00.000Z',
    updated_at: '2026-08-27T16:15:00.000Z',
    members: 96,
    earned: 24,
    redeemed: 17,
    near: 0,
    available: 5,
    expired: 2,
    reserved_minor: 40_00,
  },
];

/* ═════════════════════════════════════════════════════════ what we noticed ══ */

/** Claims per view, which is the rate the finding compares. */
const claimRate = (deal: DealResponse) =>
  deal.funnel.seen === 0 ? 0 : deal.funnel.claimed / deal.funnel.seen;

/* The server's own classification, restated: a badge with a percentage in it
   is a percentage, anything else written is "an item", and only deals seen at
   least twenty times are compared. */
const isPercent = (deal: DealResponse) => /\d+\s*%/.test(deal.discount_text ?? '');
const comparable = DEMO_DEALS.filter((deal) => deal.funnel.seen >= 20 && deal.discount_text?.trim());
const best = (deals: DealResponse[]) =>
  deals.reduce<DealResponse | null>((top, deal) => (top === null || claimRate(deal) > claimRate(top) ? deal : top), null);

const asInsightDeal = (deal: DealResponse): InsightDeal => ({
  dealId: deal.id,
  title: deal.copy?.title ?? '',
  badge: deal.discount_text ?? '',
  claims: deal.funnel.claimed,
  seen: deal.funnel.seen,
});

/**
 * Month-to-date against the same days of last month, off the till roll.
 *
 * `null` when either side has nothing to compare, which is the server's rule and
 * the reason the panel cannot state a direction it did not measure.
 */
function trendOf(): InsightsResponse['trend'] {
  const dayOfMonth = TODAY.getDate();
  const current = TILL.filter((day) => monthKey(day.date) === THIS_MONTH);
  const previousKey = monthKey(TODAY, -1);
  const previous = TILL.filter(
    (day) => monthKey(day.date) === previousKey && day.date.getDate() <= dayOfMonth,
  );
  const sum = (days: TillDay[], pick: (day: TillDay) => number) =>
    days.reduce((total, day) => total + pick(day), 0);
  const visitsBefore = sum(previous, (day) => day.visits);
  const vouchersBefore = sum(previous, (day) => day.vouchers);
  if (visitsBefore === 0 || vouchersBefore === 0) return null;
  return {
    visitsPct: Math.round(((sum(current, (day) => day.visits) - visitsBefore) / visitsBefore) * 100),
    vouchersPct: Math.round(((sum(current, (day) => day.vouchers) - vouchersBefore) / vouchersBefore) * 100),
  };
}

const bestItem = best(comparable.filter((deal) => !isPercent(deal)));
const bestPercent = best(comparable.filter(isPercent));

export const DEMO_INSIGHTS: InsightsResponse = {
  period: THIS_MONTH,
  trend: trendOf(),
  /* The 10% rung at 500 points, which is `DEMO_BUDGET`'s own. `eligible` is
     everybody who came in over the last thirty days — the 412 the overview
     counts — and it is far above the floor, so the finding may be stated. */
  tierReach: {
    tierId: 'tier_10',
    pct: 10,
    points: 500,
    eligible: RECENT_TOTALS.customers,
    reached: 27,
    lower: 450,
    more: 61,
  },
  /* Computed from the deals table rather than typed, so the two offers the
     sentence names are rows an owner can open one screen over. */
  itemVsPercent:
    bestItem && bestPercent && claimRate(bestPercent) > 0
      ? {
          item: asInsightDeal(bestItem),
          percent: asInsightDeal(bestPercent),
          multiple: Math.round((claimRate(bestItem) / claimRate(bestPercent)) * 10) / 10,
        }
      : null,
  unusedRewards: {
    n: DEMO_CAMPAIGNS.reduce((sum, row) => sum + (row.available ?? 0), 0),
    amountMinor: DEMO_CAMPAIGNS.reduce((sum, row) => sum + (row.reserved_minor ?? 0), 0),
  },
};

/*
 * Who a reminder reaches, and what the last one did.
 *
 * 31 people hold the 35 rewards and 13 hold the 15 vouchers still out; six hold
 * both, so the union is 38. The last reminder went out six weeks ago — outside
 * the week, so the button is live — and brought 14 of its 38 back, which is the
 * reference design's own "14 of 38".
 */
const LAST_REMINDER = new Date(TODAY.getTime() - 46 * DAY).toISOString();

export const DEMO_REMIND: RemindStatus = {
  rewardHolders: 31,
  voucherHolders: 13,
  audience: 38,
  lastSentAt: LAST_REMINDER,
  nextAllowedAt: null,
  lastResult: { sentAt: LAST_REMINDER, audience: 38, cameBack: 14, windowDays: 7 },
};

/*
 * The five audiences a deal can be aimed at.
 *
 * The venue's 412 customers split into 315 who came in within sixty days and 97
 * who did not; 798 people in the city have never been in; everybody is the two
 * together. Newcomers — accounts younger than six months — overlap all of them,
 * which is why that row does not add up with the rest and is not meant to.
 */
export const DEMO_AUDIENCES: AudienceRow[] = [
  { segment: 'all', reach: counted(1_210), notifiable: counted(784) },
  { segment: 'newcomer', reach: counted(338), notifiable: counted(241) },
  { segment: 'lapsed', reach: counted(97), notifiable: counted(52) },
  { segment: 'new', reach: counted(798), notifiable: counted(532) },
  { segment: 'returning', reach: counted(315), notifiable: counted(208) },
];

/* ── the reads that are not one of the seven screens ───────────────────────
 *
 * Several panels ask the API on their own account rather than through `Screen`:
 * the rail's plan card, the overview's reach funnel and cost panel, the deals
 * screen's push quota, the customers roster, the bell. Each needs the fallback
 * stated where it reads, so each needs a payload here.
 */

export const DEMO_VENUE: PartnerVenue = {
  id: 'ven_demo',
  name: 'Demo Café',
  city: 'Kraków',
  currency: CURRENCY,
  timezone: TIMEZONE,
  status: 'live',
  verified_at: '2026-06-01T09:00:00.000Z',
  scan_cooldown_hours: 24,
  min_spend_minor: 10_00,
  max_amount_minor: 2_000_00,
};

/*
 * The funnel, and the one figure in it that takes the min-cohort floor.
 *
 * `uniqueClickers` is a finding about *people*, so it is suppressed under the
 * floor while the raw counts are not.
 *
 * ── the rows *are* the totals ────────────────────────────────────────────
 *
 * `analytics.reach` derives `impressions`, `clicks` and `claims` by summing
 * these rows, so a payload where they disagree is a response the server cannot
 * produce. All three columns add up exactly: 6 550 / 1 205 / 262 — and 262 is
 * the thirty-day claims total the till roll is pinned to.
 *
 * Each deal row is pinned to that deal's own `funnel` in `DEMO_DEALS`, because
 * they are one offer seen from two endpoints. There is no row for the draft: a
 * deal nobody has been shown has no events.
 */
export const DEMO_REACH: ReachReport = {
  period: THIS_MONTH,
  impressions: 6_550,
  clicks: 1_205,
  clickRate: 0.184,
  uniqueClickers: { value: 402, kind: 'counted', suppressed: false, cohort: 402 },
  claims: TARGET.claims,
  /* Claims per *click*, not per impression — the same quotient the live report
     takes, and the reason the two rates on this panel are not comparable. */
  claimRate: 0.217,
  sources: [
    { source: 'feed', impressions: 3_840, clicks: 718 },
    { source: 'search', impressions: 1_412, clicks: 236 },
    { source: 'map', impressions: 704, clicks: 118 },
    { source: 'direct', impressions: 386, clicks: 92 },
    { source: 'share', impressions: 208, clicks: 41 },
  ],
  rows: [
    /* The listing itself, and its claims are 0 because a listing is not
       claimable — the only row where that nought is a fact about the product. */
    { id: null, title: 'Demo Café', impressions: 1_384, clicks: 213, claims: 0, clickRate: 0.154 },
    { id: 'del_demo_morning', title: 'Morning coffee, 20% off', impressions: 2_180, clicks: 431, claims: 118, clickRate: 0.198 },
    { id: 'del_demo_bake', title: 'Free filter coffee with any bake', impressions: 1_240, clicks: 268, claims: 74, clickRate: 0.216 },
    { id: 'del_demo_weekend', title: 'Weekendowe śniadanie, 15% taniej', impressions: 806, clicks: 141, claims: 39, clickRate: 0.175 },
    { id: 'del_demo_lunch', title: 'Trzy w cenie dwóch', impressions: 940, clicks: 152, claims: 31, clickRate: 0.162 },
  ],
};

/*
 * Two of the four used, and the funnel of the one that went out.
 *
 * `schedulePush` increments `push_quotas.used` when a push is **scheduled**, not
 * when it is delivered — so the notification waiting on `del_demo_bake` has
 * already spent its slot. The funnel, though, is over pushes that were *sent*,
 * which is only the morning deal's: its delivered, opened and came-in are the
 * same three figures its own row shows.
 */
export const DEMO_QUOTA: PushQuotaResponse = {
  period: THIS_MONTH,
  quota: 4,
  used: 2,
  remaining: 2,
  funnel: { sent: 1, delivered: 1_640, opened: 388, cameIn: 112 },
};

/*
 * The bell. The two kinds the server actually writes to a partner's inbox — the
 * monthly summary and the note about the average check — in its own words,
 * which are English whatever the reader's language is.
 */
export const DEMO_INBOX: InboxResponse = {
  unread: 2,
  items: [
    {
      id: 'ntf_demo_summary',
      kind: 'monthly_summary',
      mode: 'partner',
      title: 'Demo Café: your month',
      body: 'quiet window · new customers',
      action_url: '#/dashboard',
      read_at: null,
      created_at: new Date(TODAY.getFullYear(), TODAY.getMonth(), 1, 6).toISOString(),
      delivery: 'inbox',
    },
    {
      id: 'ntf_demo_check',
      kind: 'average_check_source',
      mode: 'partner',
      title: 'Your average check is now your own',
      body: 'Enough confirmed transactions have landed to compute it from your tills rather than the category default.',
      action_url: null,
      read_at: null,
      created_at: new Date(TODAY.getTime() - 9 * DAY).toISOString(),
      delivery: 'inbox',
    },
    {
      id: 'ntf_demo_summary_prev',
      kind: 'monthly_summary',
      mode: 'partner',
      title: 'Demo Café: your month',
      body: 'cost per new customer · second visit rate',
      action_url: '#/dashboard',
      read_at: new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 2, 9).toISOString(),
      created_at: new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1, 6).toISOString(),
      delivery: 'inbox',
    },
  ],
};

/*
 * Sixteen people, because three could not show what this screen is for.
 *
 * A roster of three is a list; a roster of sixteen is a *distribution*, and the
 * distribution is the whole finding.
 *
 * ── all five of the server's words ────────────────────────────────────────
 *
 * `profiles.deriveStatus` answers `new`, `regular`, `lapsed`, `at_risk` or
 * `high_value`, and the roster now has a word for each, so the demo uses all
 * five — by the server's own rule, with the venue's average lifetime spend at
 * about 178 zł: **valuable** is at least twice that (356 zł and up); valuable and
 * not seen for over thirty days is **at risk**; anybody else not seen for over
 * sixty is **lapsed**; one visit is **new**. So Marta, Tomasz and Kateryna are
 * high value, Anna — 356 zł, and sixty days away — is at risk, and Olena and
 * Rafał have lapsed.
 *
 * Four things are held consistent, and each is something a reader can check:
 *
 *  - **`spendMinor` is lifetime at this venue**, not the month.
 *  - **Spend over visits stays near the 36.50 average check**: 3 585 / 98 is 36.58.
 *  - **A held voucher implies a tier**: nobody holds a voucher they could not
 *    have bought, and the six held are a subset of those still out on the ladder.
 *  - **The lapsed and the at-risk appear in no scan in the last thirty days**,
 *    because their last visit is older than that.
 *
 * `sharedCustomers` is 96 of 412 — how many turned profile sharing on — and the
 * sixteen named rows are the first page of those 96. The gap is the point: it is
 * why most rows in the scan log have no name.
 */
export const DEMO_CUSTOMERS: CustomersResponse = {
  totalCustomers: 412,
  sharedCustomers: 96,
  rows: [
    {
      userId: 'usr_demo_1', name: 'Marta W.', avatar: null, spendMinor: 486_00, visits: 13,
      firstSeenAt: '2026-06-12T08:20:00.000Z', lastSeenAt: '2026-09-08T08:10:00.000Z',
      daysSince: 1, status: 'high_value', stamps: 5, vouchersHeld: 1,
      tierPct: 15, spendTrend: 'up',
    },
    {
      userId: 'usr_demo_2', name: 'Tomasz B.', avatar: null, spendMinor: 452_00, visits: 12,
      firstSeenAt: '2026-05-28T07:45:00.000Z', lastSeenAt: '2026-09-07T08:35:00.000Z',
      daysSince: 2, status: 'high_value', stamps: 2, vouchersHeld: 1,
      tierPct: 15, spendTrend: 'flat',
    },
    {
      userId: 'usr_demo_3', name: 'Kateryna P.', avatar: null, spendMinor: 398_00, visits: 11,
      firstSeenAt: '2026-06-02T09:05:00.000Z', lastSeenAt: '2026-09-05T07:50:00.000Z',
      daysSince: 4, status: 'high_value', stamps: 7, vouchersHeld: 0,
      tierPct: 10, spendTrend: 'up',
    },
    {
      userId: 'usr_demo_4', name: 'Piotr N.', avatar: null, spendMinor: 341_00, visits: 10,
      firstSeenAt: '2026-04-18T08:30:00.000Z', lastSeenAt: '2026-09-06T09:20:00.000Z',
      daysSince: 3, status: 'regular', stamps: 1, vouchersHeld: 0,
      tierPct: 10, spendTrend: 'down',
    },
    {
      userId: 'usr_demo_5', name: 'Anna S.', avatar: null, spendMinor: 356_00, visits: 9,
      firstSeenAt: '2026-04-03T10:15:00.000Z', lastSeenAt: '2026-07-11T08:30:00.000Z',
      daysSince: 60, status: 'at_risk', stamps: 5, vouchersHeld: 2,
      tierPct: 10, spendTrend: 'down',
    },
    {
      userId: 'usr_demo_6', name: 'Dmytro H.', avatar: null, spendMinor: 268_00, visits: 7,
      firstSeenAt: '2026-06-21T07:55:00.000Z', lastSeenAt: '2026-09-03T08:40:00.000Z',
      daysSince: 6, status: 'regular', stamps: 3, vouchersHeld: 1,
      tierPct: 10, spendTrend: 'up',
    },
    {
      userId: 'usr_demo_7', name: 'Zofia L.', avatar: null, spendMinor: 234_00, visits: 7,
      firstSeenAt: '2026-05-09T09:25:00.000Z', lastSeenAt: '2026-08-30T07:40:00.000Z',
      daysSince: 10, status: 'regular', stamps: 6, vouchersHeld: 0,
      tierPct: 5, spendTrend: 'flat',
    },
    {
      userId: 'usr_demo_8', name: 'Oleh K.', avatar: null, spendMinor: 207_00, visits: 6,
      firstSeenAt: '2026-07-02T08:05:00.000Z', lastSeenAt: '2026-09-04T09:15:00.000Z',
      daysSince: 5, status: 'regular', stamps: 2, vouchersHeld: 0,
      tierPct: 5, spendTrend: 'up',
    },
    {
      userId: 'usr_demo_9', name: 'Olena M.', avatar: null, spendMinor: 183_00, visits: 5,
      firstSeenAt: '2026-03-27T08:50:00.000Z', lastSeenAt: '2026-06-30T09:05:00.000Z',
      daysSince: 71, status: 'lapsed', stamps: 3, vouchersHeld: 1,
      tierPct: 5, spendTrend: 'down',
    },
    {
      userId: 'usr_demo_10', name: 'Bartosz G.', avatar: null, spendMinor: 164_00, visits: 5,
      firstSeenAt: '2026-06-15T07:35:00.000Z', lastSeenAt: '2026-09-01T08:25:00.000Z',
      daysSince: 8, status: 'regular', stamps: 0, vouchersHeld: 0,
      tierPct: 5, spendTrend: 'flat',
    },
    {
      userId: 'usr_demo_11', name: 'Sofiia T.', avatar: null, spendMinor: 141_00, visits: 4,
      firstSeenAt: '2026-07-19T09:10:00.000Z', lastSeenAt: '2026-09-07T07:55:00.000Z',
      daysSince: 2, status: 'regular', stamps: 4, vouchersHeld: 0,
      tierPct: 5, spendTrend: 'up',
    },
    /* From here down nobody has reached a rung yet, which is why `tierPct` is
       absent rather than 0: a 0% voucher is not a tier this ladder has. */
    {
      userId: 'usr_demo_12', name: 'Rafał D.', avatar: null, spendMinor: 118_00, visits: 3,
      firstSeenAt: '2026-05-02T08:15:00.000Z', lastSeenAt: '2026-07-07T08:45:00.000Z',
      daysSince: 64, status: 'lapsed', stamps: 2, vouchersHeld: 0,
      spendTrend: 'down',
    },
    {
      userId: 'usr_demo_13', name: 'Nazar V.', avatar: null, spendMinor: 96_00, visits: 3,
      firstSeenAt: '2026-08-24T09:30:00.000Z', lastSeenAt: '2026-09-06T08:05:00.000Z',
      daysSince: 3, status: 'regular', stamps: 3, vouchersHeld: 0,
      spendTrend: 'up',
    },
    {
      userId: 'usr_demo_14', name: 'Alina Ch.', avatar: null, spendMinor: 68_00, visits: 2,
      firstSeenAt: '2026-08-29T08:40:00.000Z', lastSeenAt: '2026-09-08T09:00:00.000Z',
      daysSince: 1, status: 'regular', stamps: 2, vouchersHeld: 0,
      spendTrend: 'up',
    },
    /* `new` is a narrow band and not a synonym for "recent": `deriveStatus`
       gives it only at `visits <= 1`, so the row above — two visits inside a
       fortnight — is already a regular. Both of these have been in once. */
    {
      userId: 'usr_demo_15', name: 'Michał K.', avatar: null, spendMinor: 44_00, visits: 1,
      firstSeenAt: '2026-09-05T08:20:00.000Z', lastSeenAt: '2026-09-05T08:20:00.000Z',
      daysSince: 4, status: 'new', stamps: 1, vouchersHeld: 0,
      spendTrend: 'up',
    },
    {
      userId: 'usr_demo_16', name: 'Iryna B.', avatar: null, spendMinor: 29_00, visits: 1,
      firstSeenAt: '2026-09-07T09:35:00.000Z', lastSeenAt: '2026-09-07T09:35:00.000Z',
      daysSince: 2, status: 'new', stamps: 1, vouchersHeld: 0,
      spendTrend: 'up',
    },
  ],
};

/** App languages for the demo roster's detail panel, by row. */
const DEMO_LANGUAGES = ['pl', 'uk', 'uk', 'pl', 'en', 'uk', 'pl', 'uk', 'ru', 'pl', 'uk', 'pl', 'uk', 'ru', 'pl', 'uk'];

/**
 * `GET …/customers/:userId` for one of the sixteen, built off their roster row.
 *
 * Every figure agrees with the row it opened from: the months run from their
 * first visit to their last and hold exactly their visit count and spend, and
 * their stamp card holds the stamps the roster shows. `null` for anybody else,
 * which the panel draws as the same "not available" a revoked consent is.
 */
export function demoCustomerDetail(userId: string): CustomerDetailResponse | null {
  const index = DEMO_CUSTOMERS.rows.findIndex((row) => row.userId === userId);
  if (index < 0) return null;
  const row = DEMO_CUSTOMERS.rows[index];

  const first = new Date(row.firstSeenAt);
  const last = new Date(row.lastSeenAt);
  const months: string[] = [];
  for (let at = new Date(first.getFullYear(), first.getMonth(), 1, 12); at <= last; at = new Date(at.getFullYear(), at.getMonth() + 1, 1, 12)) {
    months.push(monthKey(at));
  }
  /* More visits in the later months, which is what a customer who kept coming
     looks like — and exactly their total, by apportionment. */
  const visits = apportion(months.map((_, i) => 1 + i * 0.4), row.visits);
  const spend = apportion(visits, row.spendMinor);

  const card = DEMO_CAMPAIGNS[index % 3];
  return {
    userId: row.userId,
    name: row.name,
    avatar: null,
    language: DEMO_LANGUAGES[index] ?? 'pl',
    lifetimeValueMinor: row.spendMinor,
    visits: row.visits,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    status: row.status,
    trend: months.map((month, i) => ({ month, visits: visits[i], spend: spend[i] })).filter((m) => m.visits > 0),
    visitPattern: [
      { local_weekday: (index * 3) % 5, local_hour: 8 + ((index * 5) % 11), n: Math.ceil(row.visits / 2) },
      { local_weekday: 5, local_hour: 10 + (index % 4), n: Math.floor(row.visits / 3) },
    ].filter((cell) => cell.n > 0),
    deals:
      row.visits > 2
        ? [
            { deal_id: 'del_demo_morning', event_type: 'claim', created_at: new Date(last.getTime() - 3 * HOUR).toISOString() },
            { deal_id: 'del_demo_morning', event_type: 'open', created_at: new Date(last.getTime() - 5 * HOUR).toISOString() },
          ]
        : [],
    stamps: [
      {
        campaign_id: card.id,
        name: card.name,
        stamps: Math.min(row.stamps, card.visits_required),
        required: card.visits_required,
      },
    ],
  };
}

/*
 * Two scans waiting at the counter, matching `pendingConfirmations` on
 * `DEMO_TODAY` — the two figures are the same fact on two screens.
 */
export const DEMO_PENDING: PendingScan[] = [
  {
    id: 'txn_demo_pending_1', venue_id: 'ven_demo', user_id: 'usr_demo_2',
    trigger_type: 'qr', intent: 'earn', amount_minor: 42_00,
    amount_entered_by: 'cashier', currency: CURRENCY,
    opened_at: new Date(TODAY.getTime() - 2 * HOUR).toISOString(),
  },
  {
    id: 'txn_demo_pending_2', venue_id: 'ven_demo', user_id: 'usr_demo_1',
    trigger_type: 'qr', intent: 'voucher_redeem', amount_minor: null,
    amount_entered_by: null, currency: CURRENCY,
    opened_at: new Date(TODAY.getTime() - 1.9 * HOUR).toISOString(),
  },
];

/* ══════════════════════════════════════════════════════════ the scan log ══
 *
 * Every transaction on the till roll, as `GET …/scans` would page it.
 *
 * Built lazily, on the first page anybody asks for: six months of a café is a
 * few thousand rows, which is nothing to build and still nothing a visitor who
 * never opens the Scan activity screen should pay for.
 *
 * ── it has to agree with the screens either side of it ────────────────────
 *
 *  - **The counted rows per day are the series' visits**, the first-visit rows
 *    its new customers, and the bills its sales — the same till roll, so the
 *    log's "of 1 148" over thirty days is the overview's headline.
 *  - **Most rows have no name.** 96 of 412 customers share with this venue, so
 *    the sixteen on the roster carry their names on their own scans and
 *    everybody else is the translated "not shared".
 *  - **The roster's people come when the roster says**: their newest scan lands
 *    on their `daysSince`, and the lapsed and the at-risk have none in the
 *    window, because the Customers screen colours them for exactly that.
 */

const RECEIPT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * A four-character till code, unique across the log.
 *
 * An odd multiplier is invertible modulo 32⁴, so distinct row numbers give
 * distinct codes — no collision check, and no two receipts carrying one number.
 */
function receiptFor(index: number): string {
  let n = ((index + 7) * 39_769) % RECEIPT_ALPHABET.length ** 4;
  let out = '';
  for (let i = 0; i < 4; i += 1) {
    out = RECEIPT_ALPHABET[n % RECEIPT_ALPHABET.length] + out;
    n = Math.floor(n / RECEIPT_ALPHABET.length);
  }
  return `#${out}`;
}

/*
 * Two counters, and the coordinates belong to the counter rather than the scan:
 * no per-scan GPS is collected anywhere.
 */
const SCAN_SITES = [
  { venueId: 'ven_demo', name: 'Rajska 12', address: 'ul. Rajska 12, Kraków', lat: 50.0645, lng: 19.9312 },
  { venueId: 'ven_demo', name: 'Podgórze kiosk', address: null, lat: null, lng: null },
];

/** How many times each of the roster's sixteen appears in the last thirty days. */
const SCANS_PER_CUSTOMER: Record<string, number> = {
  usr_demo_1: 6, usr_demo_2: 6, usr_demo_3: 6, usr_demo_4: 5,
  usr_demo_5: 0, // at risk — 60 days since their last visit
  usr_demo_6: 4, usr_demo_7: 4, usr_demo_8: 4,
  usr_demo_9: 0, // lapsed — 71 days
  usr_demo_10: 3, usr_demo_11: 3,
  usr_demo_12: 0, // lapsed — 64 days
  usr_demo_13: 3, usr_demo_14: 2, usr_demo_15: 1, usr_demo_16: 1,
};

/*
 * What a scan pays: a flat rate per counted scan, a one-off for the first visit
 * to a venue, another for filling a stamp card — and **no spend bonus at all**,
 * because `server/config.ts` pays for the visit rather than the size of the
 * cheque. A scan that did not count paid nothing.
 */
const SCAN_POINTS = 20;
const FIRST_VISIT_POINTS = 100;
const CARD_COMPLETE_POINTS = 100;

/** Voucher rungs a redemption row takes off, in the ladder's own order. */
const RUNGS = BUDGET.tiers;

interface NamedScan {
  personIndex: number;
  ordinal: number;
  first: boolean;
  hour: number;
  minute: number;
}

/** The roster's scans, keyed by how many days back they fall. */
function placeNamed(): Map<number, NamedScan[]> {
  const out = new Map<number, NamedScan[]>();
  DEMO_CUSTOMERS.rows.forEach((row, personIndex) => {
    const times = SCANS_PER_CUSTOMER[row.userId] ?? 0;
    if (times === 0) return;
    const newest = row.daysSince;
    const firstSeen = Math.round((TODAY.getTime() - Date.parse(row.firstSeenAt)) / DAY);
    const oldest = Math.max(newest, Math.min(firstSeen, WINDOW - 1));
    const newHere = firstSeen < WINDOW;
    for (let k = 0; k < times; k += 1) {
      const back = times === 1 ? newest : newest + Math.round((k * (oldest - newest)) / (times - 1));
      const list = out.get(back) ?? [];
      list.push({
        personIndex,
        /* `k` counts back from the newest, so the oldest row of somebody with
           thirteen lifetime visits is their eighth — which keeps the stamp count
           from restarting the card. */
        ordinal: row.visits - k,
        first: newHere && k === times - 1,
        /* A regular comes in at roughly the same time of day: the hour belongs
           to the person, and only the minutes move between visits. */
        hour: 8 + ((personIndex * 5) % 11),
        minute: (k * 17 + personIndex * 7) % 60,
      });
      out.set(back, list);
    }
  });
  return out;
}

/** Evenly spaced picks out of a list, so a day's redemptions are not all at nine. */
function spread<T>(items: T[], count: number, offset: number): Set<T> {
  const picked = new Set<T>();
  if (count <= 0 || items.length === 0) return picked;
  const step = items.length / count;
  for (let j = 0; j < count && j < items.length; j += 1) {
    picked.add(items[Math.floor(j * step + (offset % Math.max(1, Math.floor(step))))] ?? items[j]);
  }
  return picked;
}

/* Each row with the venue-local day it fell on, recorded when it is built: the
   window filter below runs on every page request, and re-deriving a Warsaw date
   from thousands of instants per press would be the slow half of the screen. */
let logCache: Array<{ day: string; row: ScanRowResponse }> | null = null;

function buildLog(): Array<{ day: string; row: ScanRowResponse }> {
  const named = placeNamed();
  const rows: Array<{ at: number; day: string; row: ScanRowResponse }> = [];
  let serial = 0;

  TILL.forEach((day, dayIndex) => {
    const back = HISTORY - 1 - dayIndex;
    const people = named.get(back) ?? [];
    const offset = warsawOffsetMs(day.date);
    const slots = day.visits + day.uncounted;

    /* Which counted slots are anonymous, and which of those are first visits,
       voucher redemptions and reward redemptions. The roster's own first
       visits come out of the day's first-visit count, so the day still totals
       what the series says. */
    const anonymous = Array.from({ length: Math.max(0, day.visits - people.length) }, (_, k) => people.length + k);
    const firstLeft = Math.max(0, day.first - people.filter((person) => person.first).length);
    const firsts = spread(anonymous, firstLeft, dayIndex);
    const returning = anonymous.filter((slot) => !firsts.has(slot));
    const voucherSlots = spread(returning, day.vouchers, dayIndex + 1);
    const rewardSlots = spread(returning.filter((slot) => !voucherSlots.has(slot)), day.rewards, dayIndex + 2);

    for (let slot = 0; slot < slots; slot += 1) {
      const isCounted = slot < day.visits;
      const person = isCounted && slot < people.length ? people[slot] : null;
      const who = person ? DEMO_CUSTOMERS.rows[person.personIndex] : null;

      const bill = isCounted ? billFor(dayIndex, slot) : UNCOUNTED_BILLS[(dayIndex + slot) % UNCOUNTED_BILLS.length];
      const first = person ? person.first : isCounted && firsts.has(slot);
      const intent: ScanRowResponse['intent'] =
        !person && voucherSlots.has(slot) ? 'voucher_redeem' : !person && rewardSlots.has(slot) ? 'reward_redeem' : 'earn';

      /* The card this visit could stamp. The roster's people each keep one card
         across all four campaigns — so a quarter of them are on the paused one,
         and their scans advance nothing — and anonymous visits fall on the
         three that are running. */
      const card = person
        ? DEMO_CAMPAIGNS[person.personIndex % DEMO_CAMPAIGNS.length]
        : DEMO_CAMPAIGNS[(dayIndex * 3 + slot) % 3];
      const floor = card.min_spend_minor ?? DEMO_VENUE.min_spend_minor ?? 0;
      const qualifies = isCounted && card.status === 'active' && bill >= floor;
      const need = card.visits_required;
      /* A full card rolls over into the next one rather than overflowing, which
         is what `cycles` counts on the server. */
      const done = person ? ((person.ordinal - 1) % need) + 1 : ((dayIndex + slot * 5) % need) + 1;
      const rewardEarned = qualifies && done === need;

      const rung = RUNGS[(dayIndex + slot) % RUNGS.length];
      const discountMinor =
        intent === 'voucher_redeem'
          ? Math.min(Math.round((bill * rung.discountPct) / 100), rung.maxDiscountMinor)
          : intent === 'reward_redeem'
            ? card.reward_cost_minor
            : 0;

      /* Opening hours are eight to seven, and the day's slots are spread across
         them; a regular keeps their own hour. */
      const minuteOfDay = person
        ? person.hour * 60 + person.minute
        : 8 * 60 + Math.floor(((slot + 0.5) / slots) * 11 * 60) + ((dayIndex * 13 + slot * 7) % 9);
      const wall = Date.UTC(day.date.getFullYear(), day.date.getMonth(), day.date.getDate(), 0, minuteOfDay);
      const at = wall - offset;

      const index = serial;
      serial += 1;
      rows.push({
        at,
        day: day.day,
        row: {
          id: `txn_demo_${index}`,
          at: new Date(at).toISOString(),
          who: who?.name ?? null,
          avatar: null,
          first,
          counted: isCounted,
          intent,
          spentMinor: bill,
          discountMinor,
          points: isCounted
            ? SCAN_POINTS + (first ? FIRST_VISIT_POINTS : 0) + (rewardEarned ? CARD_COMPLETE_POINTS : 0)
            : 0,
          receipt: receiptFor(index),
          site: SCAN_SITES[(dayIndex + slot) % 3 === 2 ? 1 : 0],
          progress: qualifies
            ? { campaignId: card.id, campaign: card.name, done, need, rewardEarned }
            : null,
        },
      });
    }
  });

  /* Newest first, which is the order the endpoint answers in. The tie-break is
     the id rather than nothing, so the array is the same on every machine. */
  rows.sort((a, b) => b.at - a.at || a.row.id.localeCompare(b.row.id));
  return rows.map((entry) => ({ day: entry.day, row: entry.row }));
}

/**
 * One page of `GET …/scans` for the demo venue.
 *
 * The window is the last `days` days of the till roll, and the three counts are
 * over the whole window before paging — `total` for everyone, then first visits
 * and the rest — which is the response's own contract and what the pager's
 * "of N" reads.
 */
export function demoScans(query: ScansQuery): ScansResponse {
  logCache ??= buildLog();
  const from = TILL[HISTORY - query.days].day;
  const inWindow = logCache.filter((entry) => entry.day >= from).map((entry) => entry.row);
  const firstCount = inWindow.filter((row) => row.first).length;
  const shown =
    query.segment === 'all'
      ? inWindow
      : inWindow.filter((row) => (query.segment === 'first' ? row.first : !row.first));

  return {
    days: query.days,
    segment: query.segment,
    total: inWindow.length,
    firstCount,
    againCount: inWindow.length - firstCount,
    currency: CURRENCY,
    timezone: TIMEZONE,
    rows: shown.slice(query.offset, query.offset + query.limit),
  };
}
