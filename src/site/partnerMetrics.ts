/**
 * The partner dashboard's month, derived.
 *
 * `b2b/Paylez Partner Dashboard v2.dc.html` is a working React prototype, not a
 * screenshot: its numbers come from a handful of seeds and a page of arithmetic
 * that turns them into every figure on all seven screens. This file is that
 * arithmetic, ported — the seeds below are the prototype's `SCEN` / `CUST` /
 * `CAMP_BASE` / `CSCEN` tables verbatim, and everything under `── derived ──`
 * recomputes what it recomputed.
 *
 * Porting the *formulas* rather than the *outputs* is the same call
 * `adminMetrics.ts` makes one screen over, and for the same reason: a month has
 * to hang together. The overview's claim count, the deals table's claim rates,
 * the customers screen's cost-per-new-customer and the campaign cards' set-aside
 * money are four views of one venue, and five separately transcribed figure sets
 * would drift apart the first time one of them was edited. Here, editing a seed
 * moves every screen that depends on it, together.
 *
 * **Money is euros**, like everything else the site prices. The prototype quotes
 * a Kraków café in złoty; each amount is divided by `PLN` once, at the seed, and
 * converted back out by `useMoney` — so a Polish reader sees the prototype's own
 * figures and everyone else sees theirs. A złoty literal below the seed block is
 * the bug this arrangement exists to prevent.
 *
 * Nothing here is user-visible text. Every label, sentence and column heading is
 * dictionary copy, filled with these numbers at render.
 */

/* ───────────────────────────────────────────────────────────────── seeds ── */

/**
 * The prototype's złoty, in euros.
 *
 * `i18n/fx.ts` is the one rate table in the building (root `CLAUDE.md`), so the
 * divisor is read from it rather than written again: the whole point of storing
 * euros is that `useMoney` in Polish gives the złoty figure back, and it can
 * only do that if the two directions use one number.
 */
import { FX } from './i18n/fx';
/* Type-only, so this stays a leaf: `i18n/context.ts` pulls in all five
   dictionaries and nothing here may drag those into a chart. */
import type { LanguageCode } from './i18n/context';

const zl = (pln: number) => pln / FX.PLN.rate;

/**
 * The venue's own average transaction, from its sales rather than from Paylez.
 *
 * It is the multiplier behind every money estimate on the overview, which is why
 * the screen says so out loud: an estimate built on a number the owner did not
 * recognise would be worth nothing to them.
 */
export const AVG_SPEND = zl(34.1);

/** What Paylez charged this month. A flat fee, not a rate on turnover. */
export const PAYLEZ_FEE = zl(1894);

/**
 * How the visit total splits.
 *
 * `NEW` is the share of visits from someone who had never scanned here before;
 * `CLAIM` the share that carried a deal claim. Both are the prototype's `OV.normal`.
 */
const NEW_RATIO = 0.2303;
const CLAIM_RATIO = 0.4598;

/**
 * How much of the claim total is *also* a first visit.
 *
 * It has to come out of the attribution sum once, not twice — a newcomer who
 * claimed a deal is one visit Paylez can claim credit for, not two.
 */
const CLAIMS_BY_NEW = 0.2;

/**
 * The windows the range picker offers, in the order it lists them.
 *
 * The prototype's four, and its arithmetic with them: a window is *days of the
 * series*, and the series is generated rather than sampled, so seven days is the
 * first seven of the same curve and not a different curve. The quarter draws 45
 * — the prototype clamps there too, and for the same reason: ninety daily points
 * across a chart this wide is a comb, and the shape is the only thing the panel
 * is for.
 */
export const PD_RANGES = [7, 14, 30, 90] as const;
export type RangeDays = (typeof PD_RANGES)[number];

/** The window everything defaults to, and the one the picker opens on. */
export const RANGE_DAYS: RangeDays = 30;

/** The most points the chart will draw, however long the window. */
const MAX_POINTS = 45;

/** Which day of the month the venue is standing on, for the run-out forecasts. */
const TODAY = 14;

/** How many days August has, for the same forecasts. */
const MONTH_DAYS = 31;

/**
 * The six hot deals, from the prototype's `rawDeals()`.
 *
 * `cost` is what the discounts on the claims have cost so far, in euros.
 * `trend` is seven days of claims, drawn as the row's sparkline — it is a shape
 * rather than a scale, so it is left as the prototype's own small integers.
 */
export interface PartnerDeal {
  id: string;
  badge: string;
  state: 'live' | 'scheduled' | 'paused' | 'expired';
  /** What the deal gives away, which decides how its cost is written. */
  kind: 'percent' | 'item' | 'points';
  /** Index into `copy.dashboard.deals.audiences`. */
  audience: number;
  /** How many of the five languages the deal is written in. */
  langs: number;
  /** Reach lost to the languages it is missing, as a percentage. */
  reachLoss: number;
  seen: number;
  opened: number;
  claimed: number;
  cost: number;
  /** Claims the deal stops after; 0 is no limit. */
  limit: number;
  trend: number[];
  /** How the deal's one notification stands. */
  notify: { state: 'none' | 'scheduled' | 'sent'; reach: number; match: number };
  /** How many weeks it ran, for the retrospective on an expired deal. */
  weeks: number;
}

/**
 * What a deal's one notification did.
 *
 * Derived rather than seeded, and derived from the *claims* rather than from
 * the sends: the sentence the panel prints is "N of this deal's M claims came
 * from the notification", so making N a share of M is what stops the two halves
 * of that sentence disagreeing. Opens are a share of the send, which is the
 * only other figure the panel needs — and is always larger than N here, which
 * it has to be for the funnel to read downward.
 */
const NOTIFY_OPEN_RATE = 0.31;
const NOTIFY_CLAIM_SHARE = 0.42;
const NOTIFY_BLOCKED_RATE = 0.09;

export function dealNotify(deal: PartnerDeal) {
  const notified = deal.notify.reach;
  const opened = Math.round(notified * NOTIFY_OPEN_RATE);
  const camein = Math.round(deal.claimed * NOTIFY_CLAIM_SHARE);
  return {
    notified,
    opened,
    camein,
    /* Matched the audience but had had another notification recently, so this
       one was held back. It is the number that keeps the reach honest. */
    blocked: Math.round(deal.notify.match * NOTIFY_BLOCKED_RATE),
    /** The rest of the claims: people who found it in the app on their own. */
    alone: Math.max(0, deal.claimed - camein),
    openPct: notified > 0 ? (opened / notified) * 100 : 0,
    cameinPct: opened > 0 ? (camein / opened) * 100 : 0,
  };
}

export const PD_DEALS: PartnerDeal[] = [
  {
    id: 'flat',
    badge: '20%',
    state: 'live',
    kind: 'percent',
    audience: 0,
    langs: 3,
    reachLoss: 34,
    seen: 8412,
    opened: 612,
    claimed: 149,
    cost: zl(274),
    limit: 300,
    trend: [22, 26, 24, 31, 38, 34, 42],
    notify: { state: 'scheduled', reach: 3133, match: 4820 },
    weeks: 4,
  },
  {
    id: 'students',
    badge: '15%',
    state: 'live',
    kind: 'percent',
    audience: 1,
    langs: 5,
    reachLoss: 0,
    seen: 6134,
    opened: 548,
    claimed: 214,
    cost: zl(418),
    limit: 0,
    trend: [31, 28, 34, 30, 36, 41, 44],
    notify: { state: 'sent', reach: 938, match: 1400 },
    weeks: 13,
  },
  {
    id: 'filter',
    badge: 'FREE',
    state: 'live',
    kind: 'item',
    audience: 0,
    langs: 5,
    reachLoss: 0,
    seen: 4798,
    opened: 291,
    claimed: 186,
    cost: zl(930),
    limit: 0,
    trend: [18, 21, 19, 17, 22, 20, 24],
    notify: { state: 'sent', reach: 2968, match: 4820 },
    weeks: 4,
  },
  {
    id: 'points',
    badge: '2×',
    state: 'scheduled',
    kind: 'points',
    audience: 0,
    langs: 5,
    reachLoss: 0,
    seen: 0,
    opened: 0,
    claimed: 0,
    cost: 0,
    limit: 0,
    trend: [0, 0, 0, 0, 0, 0, 0],
    notify: { state: 'none', reach: 3133, match: 4820 },
    weeks: 9,
  },
  {
    id: 'neighbour',
    badge: '10%',
    state: 'paused',
    kind: 'percent',
    audience: 2,
    langs: 5,
    reachLoss: 0,
    seen: 3164,
    opened: 187,
    claimed: 61,
    cost: zl(143),
    limit: 0,
    trend: [14, 16, 13, 11, 12, 10, 9],
    notify: { state: 'none', reach: 320, match: 940 },
    weeks: 9,
  },
  {
    id: 'lunch',
    badge: '5%',
    state: 'expired',
    kind: 'percent',
    audience: 0,
    langs: 4,
    reachLoss: 11,
    seen: 9211,
    opened: 402,
    claimed: 38,
    cost: zl(71),
    limit: 0,
    trend: [26, 22, 19, 16, 12, 9, 6],
    notify: { state: 'sent', reach: 2104, match: 4820 },
    weeks: 4,
  },
];

/**
 * The four loyalty campaigns, from `CAMP_BASE` and `CSCEN.normal`.
 *
 * `cost` is what one reward costs the venue; `earned` / `used` / `expired` are
 * counts of rewards. Everything else about a campaign — what it has spent, what
 * it is holding, its gap — falls out of those four and is derived below.
 */
export const PD_CAMPAIGNS = [
  { visits: 4, cost: zl(5), priority: 1, live: true, earned: 62, used: 51, expired: 4 },
  { visits: 10, cost: zl(9), priority: 2, live: true, earned: 33, used: 20, expired: 3 },
  { visits: 6, cost: zl(10), priority: 3, live: true, earned: 18, used: 6, expired: 1 },
  { visits: 6, cost: zl(7), priority: 4, live: false, earned: 12, used: 3, expired: 2 },
];

/** Regulars who have earned a reward and are within a visit of the next one. */
export const PD_NEAR = 18;

/** The last reminder that went out to lapsed campaign members. */
export const PD_REMIND = { back: 14, of: 38 };

/**
 * The month's whole discount budget, split between the two pools.
 *
 * One number the owner sets, and a share of it earmarked for loyalty. Vouchers
 * get the remainder — which is what makes the overview's "move some across"
 * banner a real offer rather than a slogan.
 */
export const PD_ALLOCATION = { total: zl(3900), loyalty: zl(2000) };

/** What came back this month from voucher discounts that expired unused. */
const VOUCHERS_RETURNED = zl(168);

/**
 * The three voucher tiers.
 *
 * A tier holds no money. Points decide who reaches it, and what it costs is the
 * discount times how many people used it — so raising `points` sends less of the
 * budget that way, which is the sentence the screen leads with.
 */
export const PD_TIERS = [
  { pct: 5, points: 250, issued: 124, redeemed: 95 },
  { pct: 10, points: 600, issued: 59, redeemed: 45 },
  { pct: 15, points: 1200, issued: 16, redeemed: 12 },
];

/** The most any one voucher may take off a bill, however large the order. */
export const PD_MAX_PER_VOUCHER = zl(25);

/** Who comes in, from the prototype's `CUST`. Counts, not percentages. */
export const PD_CUSTOMERS = {
  total: 642,
  /** Percentages — index-aligned with `copy.dashboard.customers.langs`. */
  langs: [42, 24, 19, 11, 4],
  /** Percentages — index-aligned with `…customers.ages`. */
  ages: [31, 44, 17, 8],
  /** Percentages — index-aligned with `…customers.settled`. */
  settled: [27, 38, 35],
  /** Index-aligned with `…customers.months`. */
  cohorts: [
    { first: 268, back: 96 },
    { first: 291, back: 112 },
    { first: 284, back: 108 },
    { first: 312, back: 129 },
  ],
  /** Regulars who have not been in for over 30 days. */
  lapsed: 84,
  /**
   * Cost per new customer over the last three months, in euros.
   *
   * Only the first two are seeds. This month's is `PD_PER_NEW`, spliced in
   * below — the prototype carried a third seed here and it disagreed with its
   * own headline by a few pence, because one was written down and the other
   * divided the cost total by the new-customer count. Two figures for one thing
   * on one panel is the drift this file exists to prevent.
   */
  /* Two months, not three. The third column *is* the cost-per-new-customer
     headline beside it, and it moves with the range picker, so the trend is
     built in `metricsFor` rather than seeded with a hole and patched. */
  perNewPrev: [zl(21.4), zl(18.9)],
  /** What the average Kraków café on Paylez pays for one, in euros. */
  benchmark: zl(24.6),
  /** The same venues' average deal claim rate, as a percentage. */
  benchClaim: 2.1,
  /** …and their average second-visit-within-30-days rate. */
  benchSecond: 34,
  /** How many other venues the comparison is averaged over. */
  peers: 34,
};

/**
 * The customers who turned profile sharing on.
 *
 * Everyone else stays in the grouped figures above and is never shown by name —
 * which is the whole reason this is a separate, much shorter list than `total`.
 * `sg` / `so` are stamps got and stamps needed; `tier` is a discount tier, and a
 * customer has one or the other, never both.
 */
export interface RosterEntry {
  id: number;
  name: string;
  init: string;
  /** Euros. */
  spent: number;
  visits: number;
  /** Days since the last scan. */
  last: number;
  status: 'regular' | 'lapsed' | 'new';
  /** High value — one of the venue's top spenders. */
  hv: boolean;
  sg: number;
  so: number;
  tier: number;
  trend: 'up' | 'flat' | 'down';
  /** Months since they started sharing; drives the six-month spend chart. */
  tenure: number;
  /** Index into `copy.dashboard.customers.monthNames`. */
  since: number;
  /** Indices into `copy.dashboard.deals.rows`. */
  deals: number[];
  /** Index into `copy.dashboard.campaigns.rows`, or −1. */
  camp: number;
  /** Index into `copy.dashboard.customers.patterns`. */
  pattern: number;
  /** Index into `copy.dashboard.customers.rewards`. */
  reward: number;
}

export const PD_ROSTER: RosterEntry[] = [
  { id: 1, name: 'Andrii P.', init: 'AP', spent: zl(1180), visits: 14, last: 3, status: 'regular', hv: true, sg: 0, so: 0, tier: 15, trend: 'up', tenure: 5, since: 3, deals: [0, 2], camp: 0, pattern: 0, reward: 0 },
  { id: 2, name: 'Marta K.', init: 'MK', spent: zl(340), visits: 6, last: 4, status: 'regular', hv: false, sg: 3, so: 4, tier: 0, trend: 'up', tenure: 6, since: 2, deals: [0], camp: 0, pattern: 1, reward: 1 },
  { id: 3, name: 'Kateryna B.', init: 'KB', spent: zl(705), visits: 11, last: 6, status: 'regular', hv: true, sg: 0, so: 0, tier: 10, trend: 'flat', tenure: 4, since: 4, deals: [2], camp: 0, pattern: 2, reward: 2 },
  { id: 4, name: 'Giorgi M.', init: 'GM', spent: zl(610), visits: 9, last: 32, status: 'lapsed', hv: false, sg: 0, so: 0, tier: 10, trend: 'down', tenure: 4, since: 3, deals: [0], camp: 0, pattern: 3, reward: 3 },
  { id: 5, name: 'Dilnoza Y.', init: 'DY', spent: zl(95), visits: 2, last: 5, status: 'new', hv: false, sg: 1, so: 4, tier: 0, trend: 'up', tenure: 1, since: 7, deals: [], camp: -1, pattern: 4, reward: 4 },
  { id: 6, name: 'Oleksandr H.', init: 'OH', spent: zl(892), visits: 13, last: 9, status: 'regular', hv: true, sg: 0, so: 0, tier: 10, trend: 'up', tenure: 5, since: 3, deals: [2, 0], camp: 0, pattern: 5, reward: 2 },
  { id: 7, name: 'Nino K.', init: 'NK', spent: zl(418), visits: 7, last: 14, status: 'regular', hv: false, sg: 4, so: 4, tier: 0, trend: 'flat', tenure: 3, since: 5, deals: [0], camp: 0, pattern: 6, reward: 5 },
  { id: 8, name: 'Mehmet A.', init: 'MA', spent: zl(233), visits: 4, last: 3, status: 'regular', hv: false, sg: 2, so: 4, tier: 0, trend: 'up', tenure: 2, since: 6, deals: [0], camp: 0, pattern: 7, reward: 6 },
  { id: 9, name: 'Yulia S.', init: 'YS', spent: zl(1024), visits: 15, last: 2, status: 'regular', hv: true, sg: 0, so: 0, tier: 15, trend: 'up', tenure: 5, since: 3, deals: [2, 0], camp: 0, pattern: 8, reward: 7 },
  { id: 10, name: 'Aziz R.', init: 'AR', spent: zl(156), visits: 3, last: 21, status: 'new', hv: false, sg: 1, so: 4, tier: 0, trend: 'flat', tenure: 2, since: 6, deals: [], camp: -1, pattern: 9, reward: 4 },
  { id: 11, name: 'Sofiia M.', init: 'SM', spent: zl(487), visits: 8, last: 41, status: 'lapsed', hv: false, sg: 0, so: 0, tier: 10, trend: 'down', tenure: 4, since: 3, deals: [0], camp: 0, pattern: 10, reward: 8 },
  { id: 12, name: 'Davit T.', init: 'DT', spent: zl(372), visits: 6, last: 7, status: 'regular', hv: false, sg: 3, so: 4, tier: 0, trend: 'up', tenure: 3, since: 5, deals: [0], camp: 0, pattern: 1, reward: 1 },
  { id: 13, name: 'Anna W.', init: 'AW', spent: zl(268), visits: 5, last: 18, status: 'regular', hv: false, sg: 2, so: 4, tier: 0, trend: 'flat', tenure: 3, since: 5, deals: [0], camp: 0, pattern: 11, reward: 6 },
  { id: 14, name: 'Farrukh N.', init: 'FN', spent: zl(61), visits: 1, last: 2, status: 'new', hv: false, sg: 1, so: 4, tier: 0, trend: 'flat', tenure: 1, since: 7, deals: [], camp: -1, pattern: 12, reward: 4 },
  { id: 15, name: 'Tamar G.', init: 'TG', spent: zl(549), visits: 9, last: 28, status: 'regular', hv: false, sg: 0, so: 0, tier: 10, trend: 'down', tenure: 4, since: 3, deals: [2], camp: 0, pattern: 13, reward: 9 },
  { id: 16, name: 'Ivan D.', init: 'ID', spent: zl(815), visits: 12, last: 11, status: 'regular', hv: true, sg: 0, so: 0, tier: 10, trend: 'flat', tenure: 5, since: 3, deals: [0], camp: 0, pattern: 1, reward: 2 },
];

/** The five audiences a deal or notification can be aimed at. */
export const PD_AUDIENCES = [
  { reach: 4820, notifiable: 3133, sendAt: '07:30' },
  { reach: 1400, notifiable: 938, sendAt: '12:20' },
  { reach: 940, notifiable: 320, sendAt: '17:40' },
  { reach: 2310, notifiable: 1340, sendAt: '18:10' },
  { reach: 1680, notifiable: 1193, sendAt: '08:50' },
];

/** Notifications the plan allows a month, and how many are left. */
export const PD_NOTIFY_QUOTA = { total: 4, left: 2 };

/** The hours the heat map covers, 07:00 to 20:00. */
export const HEAT_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

/* ─────────────────────────────────────────────────────────────── derived ── */

/**
 * Thirty days of visits and voucher redemptions.
 *
 * Two overlaid sine waves, which is the prototype's own generator. It is not
 * random and must not be: the same call runs on every render and on the verify
 * pass, and a series that moved between them would make the chart, the totals
 * and the sparklines disagree with each other on the same screen.
 */
function makeSeries(days: number) {
  const visits: number[] = [];
  const redeemed: number[] = [];
  for (let i = 0; i < days; i++) {
    const w = 1 + 0.3 * Math.sin(i / 2.4) + 0.14 * Math.sin(i / 6.1);
    visits.push(Math.round(38 * w) + (i % 5 === 0 ? 4 : 0));
    redeemed.push(Math.round(8 * w * (0.82 + 0.2 * Math.sin(i / 3.1)) * 0.719));
  }
  return { visits, redeemed };
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/**
 * The month in six numbers.
 *
 * `attributed` is the one worth reading twice, because it is the only figure on
 * the overview the venue can put in front of an accountant: visits from someone
 * new, plus visits with a claim behind them, minus the overlap. Everything else
 * on that screen is either counted (`visits`) or explicitly an estimate.
 */
function makeTotals(series: ReturnType<typeof makeSeries>) {
  const visits = sum(series.visits);
  const redeemed = sum(series.redeemed);
  const claims = Math.round(visits * CLAIM_RATIO);
  const newCustomers = Math.round(visits * NEW_RATIO);
  const attributed = newCustomers + Math.max(0, claims - Math.round(claims * CLAIMS_BY_NEW));
  return {
    visits,
    redeemed,
    claims,
    newCustomers,
    attributed,
    /** What every visit through Paylez was probably worth. An estimate. */
    estimate: visits * AVG_SPEND,
    /** The share of that we can actually stand behind. */
    attributedMoney: attributed * AVG_SPEND,
  };
}


/**
 * An average week at the counter, by day and hour.
 *
 * Three gaussians — a morning peak at 9, a lunch one at 13, an evening one at 18
 * — thinned at the weekend and cut hard on Tuesday and Wednesday afternoons,
 * which is the quiet stretch every "fill your quiet hours" prompt in the
 * prototype points at. Normalised so the week sums to 278 scans.
 */
function makeHeat() {
  const raw: number[][] = [];
  let total = 0;
  for (let day = 0; day < 7; day++) {
    const row: number[] = [];
    for (const hour of HEAT_HOURS) {
      let v =
        5 +
        15 * Math.exp(-((hour - 9) ** 2) / 4) +
        9 * Math.exp(-((hour - 13) ** 2) / 5) +
        5 * Math.exp(-((hour - 18) ** 2) / 6);
      if (day >= 5) v *= 0.86;
      if ((day === 1 || day === 2) && hour >= 14 && hour <= 16) v *= 0.34;
      row.push(v);
      total += v;
    }
    raw.push(row);
  }
  const k = 278 / total;
  return raw.map((row) => row.map((v) => Math.round(v * k)));
}

export const PD_HEAT = makeHeat();
export const PD_HEAT_MAX = Math.max(...PD_HEAT.flat());

/**
 * The loyalty pool.
 *
 * `aside` is the number the campaigns screen is built around: money already
 * committed to rewards a customer has earned and not collected. It is not spent
 * — if the reward expires it comes back — but it is not available either, and a
 * budget bar that showed only "spent" would let an owner commit the same złoty
 * twice.
 */
function makeCampaignModel() {
  const list = PD_CAMPAIGNS.map((c) => {
    const outstanding = Math.max(0, c.earned - c.used - c.expired);
    return {
      ...c,
      outstanding,
      spent: c.used * c.cost,
      aside: outstanding * c.cost,
      returned: c.expired * c.cost,
      /** How much of what was earned actually got used. */
      rate: c.earned > 0 ? c.used / c.earned : 0,
      gap: c.earned - c.used,
    };
  });

  const spent = sum(list.map((c) => c.spent));
  const aside = sum(list.map((c) => c.aside));
  const available = PD_ALLOCATION.loyalty - spent - aside;
  const perDay = spent / TODAY;
  const daysLeft = perDay > 0 ? Math.max(0, available) / perDay : Infinity;

  /* The widest gap is computed, not written down: a seed edit must not leave
     the sentence on the screen naming the wrong campaign. */
  const widest = list.reduce((a, b) => (b.gap > a.gap ? b : a));

  return {
    list,
    allocation: PD_ALLOCATION.loyalty,
    earned: sum(list.map((c) => c.earned)),
    used: sum(list.map((c) => c.used)),
    holding: sum(list.map((c) => c.outstanding)),
    returned: sum(list.map((c) => c.returned)),
    spent,
    aside,
    available,
    daysLeft,
    /**
     * Which day of *this* month the pool empties on.
     *
     * Only meaningful when it empties at all: a forecast that runs past the end
     * of August produces day 66, and "66 August" is what a date looks like when
     * nobody checked. `outlasts` is the flag the screen reads instead, and it
     * gets its own sentence rather than a rolled-over September date — the
     * forecast is a rate extrapolated over two weeks, and quoting a day six
     * weeks out claims a precision it has not got.
     */
    runOut: TODAY + Math.round(Math.min(daysLeft, 400)),
    outlasts: TODAY + daysLeft >= MONTH_DAYS,
    widest: list.indexOf(widest),
    widestGap: widest.gap,
    /** Forecast to run dry before the month ends — what the alert banner keys off. */
    tight: daysLeft < MONTH_DAYS - TODAY,
  };
}

export const PD_CAMPAIGN_MODEL = makeCampaignModel();

/**
 * The voucher pool.
 *
 * A tier's unit cost is the venue's average transaction times the tier's
 * percentage, capped by `PD_MAX_PER_VOUCHER` — which is why the cap is an input
 * on that screen rather than a footnote. Without it a 15% voucher on an unusually
 * large order would take an unbounded bite out of a fixed monthly budget.
 */
function makeVoucherModel() {
  const budget = PD_ALLOCATION.total - PD_ALLOCATION.loyalty;

  const tiers = PD_TIERS.map((t) => {
    const unit = Math.min((AVG_SPEND * t.pct) / 100, PD_MAX_PER_VOUCHER);
    return {
      ...t,
      unit,
      spent: t.redeemed * unit,
      reserved: (t.issued - t.redeemed) * unit,
    };
  });

  const spent = sum(tiers.map((t) => t.spent));
  const reserved = sum(tiers.map((t) => t.reserved));
  const available = budget - spent - reserved;
  const issued = sum(tiers.map((t) => t.issued));
  const held = issued - sum(tiers.map((t) => t.redeemed));

  /* What one more voucher costs on average, weighted by how the tiers actually
     land — not the mean of the three, which would price a mix nobody issues. */
  const mixCost = issued > 0 ? sum(tiers.map((t) => t.unit * t.issued)) / issued : 0;

  const perDay = spent / TODAY;
  const daysLeft = perDay > 0 ? Math.max(0, available) / perDay : Infinity;

  const biggest = tiers.reduce((a, b) => (b.spent > a.spent ? b : a));

  return {
    budget,
    tiers,
    spent,
    reserved,
    available,
    issued,
    held,
    returned: VOUCHERS_RETURNED,
    daysLeft,
    /** As above: only a date when the pool actually runs out this month. */
    runOut: TODAY + Math.round(Math.min(daysLeft, 400)),
    outlasts: TODAY + daysLeft >= MONTH_DAYS,
    /** What is left buys this many more vouchers at the current mix. */
    moreVouchers: mixCost > 0 ? Math.max(0, Math.floor(Math.max(0, available) / mixCost)) : 0,
    /** Which tier is eating the budget — the suggestion card names it. */
    biggest: tiers.indexOf(biggest),
    tight: daysLeft < MONTH_DAYS - TODAY,
  };
}

export const PD_VOUCHER_MODEL = makeVoucherModel();

/** What the month cost, line by line. Index-aligned with `…overview.costRows`. */
export const PD_COST_ROWS = [
  PAYLEZ_FEE,
  PD_CAMPAIGN_MODEL.spent,
  PD_VOUCHER_MODEL.spent,
  sum(PD_DEALS.map((d) => d.cost)),
];

export const PD_COST_TOTAL = sum(PD_COST_ROWS);

/**
 * The venue's deal claim rate, for the comparison table.
 *
 * Claims over views across the deals that are actually running — an expired deal
 * still carries its views, and leaving them in would quietly halve the figure.
 */
const liveSeen = sum(PD_DEALS.filter((d) => d.state === 'live').map((d) => d.seen));

/**
 * Everything the range picker moves — and deliberately nothing else.
 *
 * What a window changes is how much *counted activity* falls inside it: the
 * series, its sums, and every figure derived from them. What it does not change
 * is what the month cost. `PAYLEZ_FEE` is a monthly charge and the two budget
 * pools are a monthly allocation; scaling those to a seven-day window would say
 * the venue paid a seventh of its subscription, and it would break the invariant
 * the pools are checked against — that spent, set aside and available exhaust
 * the budget.
 *
 * So the cost side is fixed and the return side moves, and that asymmetry is
 * what makes the short windows worth opening: a seven-day view is honest about
 * having earned back a fraction of a fee it has still paid in full. Reading a
 * good ROI on every window would mean the picker was decoration.
 *
 * Memoised on the window because this is called during render on three screens
 * and the identity has to be stable — a fresh object per frame would re-run
 * every `useMemo` downstream and restart the count-up animations on every tick.
 */
export interface PartnerMetrics {
  /** The window in days, and its place in `PD_RANGES` for the label arrays. */
  days: RangeDays;
  index: number;
  series: ReturnType<typeof makeSeries>;
  totals: ReturnType<typeof makeTotals>;
  /** Attributed sales over what the month cost. The overview's verdict line. */
  roi: number;
  /** What one new customer cost. */
  perNew: number;
  /** Claims over views on the live deals, as a percentage. */
  claimRate: number;
  /** Where each of the three tools' money went. Index-aligned with `…roi.rows`. */
  roiRows: { cost: number; units: number }[];
  /** Three months, the last of which is `perNew` rather than a copy of it. */
  perNewTrend: number[];
}

const METRICS = new Map<number, PartnerMetrics>();

export function metricsFor(days: RangeDays): PartnerMetrics {
  const cached = METRICS.get(days);
  if (cached) return cached;

  const series = makeSeries(Math.min(days, MAX_POINTS));
  const totals = makeTotals(series);
  const perNew = PD_COST_TOTAL / Math.max(1, totals.newCustomers);

  const built: PartnerMetrics = {
    days,
    index: PD_RANGES.indexOf(days),
    series,
    totals,
    roi: totals.attributedMoney / PD_COST_TOTAL,
    perNew,
    claimRate: liveSeen > 0 ? (totals.claims / liveSeen) * 100 : 0,
    roiRows: [
      { cost: PD_CAMPAIGN_MODEL.spent, units: 148 },
      { cost: sum(PD_DEALS.map((d) => d.cost)), units: totals.claims },
      { cost: PD_VOUCHER_MODEL.spent, units: totals.redeemed },
    ],
    perNewTrend: [...PD_CUSTOMERS.perNewPrev, perNew],
  };

  METRICS.set(days, built);
  return built;
}

/* The default window, named so the checks and anything outside the dashboard
   can reach one set of figures without asking for a window first. */
const DEFAULT_METRICS = metricsFor(RANGE_DAYS);

export const PD_SERIES = DEFAULT_METRICS.series;
export const PD_TOTALS = DEFAULT_METRICS.totals;
export const PD_PER_NEW = DEFAULT_METRICS.perNew;

/**
 * Today's scans at the counter.
 *
 * The prototype generates 48 and pages them twelve at a time; this keeps the
 * generator and the first page, because a page-2 button with no server behind it
 * is a control that lies. The arithmetic is its own — every field is a function
 * of the row index, so the list is stable across renders.
 */
export interface ScanRow {
  /** Minutes before the most recent scan, turned into a clock time at render. */
  hour: number;
  minute: number;
  /** Index into `PD_SCAN_NAMES`. */
  who: number;
  first: boolean;
  /** Euros. */
  spent: number;
  points: number;
  receipt: string;
  /** Index into `copy.dashboard.scans.places`. */
  place: number;
  /** Index into `copy.dashboard.campaigns.rows`, or −1 for no campaign. */
  campaign: number;
  need: number;
  done: number;
}

/** Display names, so they are structure rather than copy — nobody translates a name. */
export const PD_SCAN_NAMES = [
  'Marta Kowalczyk', 'Dmytro Savchenko', 'Anna Nowak', 'Kerem Yılmaz',
  'Olena Bondar', 'Piotr Zieliński', 'Nigora Rashidova', 'Aylin Demir',
  'Jakub Wiśniewski', 'Sofia Petrenko', 'Tomasz Lewandowski', 'Rustam Aliyev',
  'Katarzyna Wójcik', 'Iryna Melnyk', 'Michał Dąbrowski', 'Elif Kaya',
];

/** How many scans the counter took in the window, of which the table shows twelve. */
export const PD_SCAN_TOTAL = 48;
export const PD_SCAN_PAGE = 12;

function makeScans(count: number): ScanRow[] {
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  /* Campaign, and how many visits its reward needs. −1 is a scan that earned
     points but belongs to no campaign, which most of them do. */
  const camps: Array<[number, number]> = [
    [1, 5], [0, 8], [-1, 0], [3, 4], [-1, 0], [1, 5],
  ];
  const rows: ScanRow[] = [];
  for (let i = 0; i < count; i++) {
    let receipt = '';
    for (let k = 0; k < 3; k++) receipt += alpha[(i * 5 + k * 9) % alpha.length];
    const [campaign, need] = camps[i % camps.length];
    rows.push({
      hour: Math.max(18 - Math.floor(i / 4), 7),
      minute: (9 + i * 17) % 60,
      who: (i * 5 + Math.floor(i / 3)) % PD_SCAN_NAMES.length,
      first: i % 5 === 0,
      spent: zl((1780 + ((i * 6421) % 4900)) / 100),
      points: 9 + (i % 7) * 4,
      receipt: `${receipt}${i % 9}`,
      place: i % 3,
      campaign,
      need,
      done: need ? 1 + ((i * 3) % need) : 0,
    });
  }
  /* Newest first, which is what the screen's own lede promises. The generator
     walks the hour down every four rows but the minute up within each four, so
     unsorted it reads 18:09, 18:26, 18:43, 18:00 — a till log that goes
     backwards three times a page. */
  return rows.sort((a, b) => b.hour * 60 + b.minute - (a.hour * 60 + a.minute));
}

/**
 * All forty-eight, not the first twelve.
 *
 * This used to build one page, on the argument that a "Next" button with no
 * server behind it is a control that lies. It is the generator that settles
 * that: every field is a pure function of the row index, so asking it for 48
 * rows costs nothing and the prototype's pager becomes true rather than
 * decorative. The screen still shows `PD_SCAN_PAGE` at a time.
 */
export const PD_SCANS = makeScans(PD_SCAN_TOTAL);

/* ────────────────────────────────────────────────────────────── assistant ── */

/**
 * The numbers the assistant quotes.
 *
 * It is the one screen that talks, so every figure it says out loud has to come
 * from somewhere the rest of the dashboard can be checked against — the
 * prototype's own rule, stated in its composer note: *every figure I use comes
 * from your own numbers or cafés like yours, I will not make one up*. These are
 * that second half, the seeds the prototype quotes at the owner; the first half
 * it reads out of the models above.
 */
export const PD_ASSIST = {
  /** The quietest stretch, and how far below the weekly average it runs. */
  quietDays: [1, 2] as const,
  quietFrom: '14:00',
  quietTo: '16:00',
  quietBelow: 60,
  /** How many cafés in the city the free-item comparison is drawn from. */
  peers: 47,
  /** Free-item deals against percentage ones, in claims. */
  itemMultiple: 2.4,
  /** What one free filter coffee costs the venue. */
  itemCost: zl(5),
  /**
   * How much room the month has left before a hot deal eats into margin.
   *
   * Hot deals have no pool of their own — the loyalty and voucher budgets do not
   * cover them — so this is the one figure that decides whether the assistant
   * takes the budget you asked for or quietly builds a smaller version and says
   * so. The prototype makes it a demo switch; here it is a number the three
   * budget chips are compared against, so the warning appears when it is true.
   */
  hotRoom: zl(260),
  /** The three budgets it offers, and the three durations. */
  budgets: [zl(200), zl(400), zl(700)],
  weeks: [2, 4, 8],
  /** Where the draft starts: audience 0 is everyone near the venue. */
  audience: 0,
  /** The claim ceiling it proposes, and the hour it would send at. */
  stopAfter: 80,
  sendAt: '07:30',
  /** Customers whose app language is Russian, as a share — the gap it names. */
  russianShare: 42,
} as const;

/** The reward the assistant drafts: a free item, or a share off the bill. */
export type AssistReward = 'item' | 'percent';

/**
 * The deal text the assistant writes, in all five languages at once.
 *
 * Not dictionary copy, and the one table in the building that deliberately is
 * not: the point of the language tabs on the draft is that an owner reading in
 * Polish sees what a Russian-speaking customer will read. Copy that lived in
 * `pl.ts` would be the Polish *for* five languages, which is a different thing
 * and a useless one. The prototype makes the same call — its own set is fixed
 * and its UI language is a separate control.
 *
 * The languages are the site's five, not the prototype's (which offers Turkish
 * and Azerbaijani): a draft cannot promise a translation the product does not
 * ship.
 */
export const PD_ASSIST_COPY: Record<
  AssistReward,
  Record<LanguageCode, { title: string; body: string }>
> = {
  item: {
    en: {
      title: 'Free filter coffee with any bake',
      body: 'Tuesday and Wednesday afternoons, any bake comes with a free filter coffee.',
    },
    pl: {
      title: 'Darmowa kawa przelewowa do każdego wypieku',
      body: 'We wtorki i środy po południu do każdego wypieku dostajesz darmową kawę przelewową.',
    },
    uz: {
      title: 'Har qanday pishiriqqa filtrli qahva bepul',
      body: 'Seshanba va chorshanba kunlari tushdan keyin har qanday pishiriqqa bepul filtrli qahva.',
    },
    ru: {
      title: 'Фильтр-кофе бесплатно к любой выпечке',
      body: 'По вторникам и средам после обеда к любой выпечке — бесплатный фильтр-кофе.',
    },
    uk: {
      title: 'Фільтр-кава безкоштовно до будь-якої випічки',
      body: 'У вівторок і середу по обіді до будь-якої випічки — безкоштовна фільтр-кава.',
    },
  },
  percent: {
    en: {
      title: '20% off on Tuesday and Wednesday afternoons',
      body: 'Come in between 14:00 and 16:00 on a Tuesday or Wednesday and take 20% off your bill.',
    },
    pl: {
      title: '20% zniżki we wtorki i środy po południu',
      body: 'Przyjdź we wtorek lub środę między 14:00 a 16:00 i odbierz 20% zniżki na rachunek.',
    },
    uz: {
      title: 'Seshanba va chorshanba kunlari 20% chegirma',
      body: 'Seshanba yoki chorshanba kuni soat 14:00 dan 16:00 gacha keling va hisobingizdan 20% chegirma oling.',
    },
    ru: {
      title: 'Скидка 20% по вторникам и средам после обеда',
      body: 'Приходите с 14:00 до 16:00 во вторник или среду и получите скидку 20% на счёт.',
    },
    uk: {
      title: 'Знижка 20% у вівторок і середу по обіді',
      body: 'Приходьте з 14:00 до 16:00 у вівторок або середу й отримайте знижку 20% на рахунок.',
    },
  },
};

/**
 * A polyline through a series, as an SVG `d` string in a 0–100 × 0–100 box.
 *
 * Shared by the sparklines and the main chart. `preserveAspectRatio="none"` on
 * the `<svg>` is what lets one normalised path stretch to any card width without
 * the caller doing arithmetic; the stroke is un-scaled with
 * `vector-effect: non-scaling-stroke` in `site.css`, which is the whole reason
 * this can be a pure function of the numbers.
 */
export function polyline(values: number[], max?: number): string {
  if (values.length < 2) return '';
  const top = max ?? Math.max(...values);
  const bottom = Math.min(...values, 0);
  const span = Math.max(top - bottom, 1);
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 100;
      const y = 100 - ((v - bottom) / span) * 100;
      return `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

/** The same path closed to the floor, for the wash under a line. */
export function polyarea(values: number[], max?: number): string {
  const line = polyline(values, max);
  return line ? `${line} L100 100 L0 100 Z` : '';
}
