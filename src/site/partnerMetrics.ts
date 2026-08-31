/**
 * The partner dashboard's month — measured, or admitted to be absent.
 *
 * This file used to be the `b2b/` prototype's seeds and arithmetic ported
 * wholesale: an average transaction of 34.1 zł, six hot deals with claim
 * counts, four loyalty campaigns, three voucher tiers, sixteen named customers,
 * forty-eight till receipts, and a heat map built from three gaussians. Every
 * figure on all seven screens fell out of those. It hung together beautifully
 * and it was a measurement of nothing — an owner reading "149 claims" was
 * reading a number typed into a prototype, under their own venue's name.
 *
 * **All of it is gone.** What is left is three kinds of thing:
 *
 *  1. **Structure.** The windows the range picker offers, the hours the heat map
 *     covers, the shape of a polyline. None of it is data about anybody.
 *  2. **Pure derivations**, which now take their inputs as arguments instead of
 *     reading module seeds — `voucherModelFor` prices a ladder, `campaignModel`
 *     splits a pool, `totalsFrom` turns the server's overview into the six
 *     numbers the screen shows. These are the arithmetic worth keeping: they
 *     are what makes a figure shown twice computed once, and they are what
 *     `npm run verify` can hold to an invariant.
 *  3. **The empty month** — `PD_TOTALS`, `PD_DEALS`, `PD_CAMPAIGN_MODEL` and the
 *     rest, every one of them at zero or empty. That is not a placeholder for a
 *     better seed. It is the true state of a venue this device has no
 *     measurements for, which is *every* venue while the site's own auth is
 *     still `localStorage`, and `scale: 0` on the operator's console has always
 *     modelled exactly the same thing.
 *
 * ── the empty month is not the same as a zero on the screen ───────────────
 *
 * The screens do not render these constants as findings. `dashboardScreens.tsx`
 * asks `api/partner.ts` first, and renders one of three things: the measured
 * figure, a "still asking" state, or a panel saying what would put a number
 * there. **A failed request is a state, not a zero** — that rule is the whole
 * reason the empty model here is safe to have at all. If a screen ever reads
 * `PD_TOTALS.visits` and prints it as "your visits this month", it has undone
 * the rewrite.
 *
 * ── money ────────────────────────────────────────────────────────────────
 *
 * Amounts are euros, as everywhere else on the site, and are converted on the
 * way out by `useMoney`. The server sends minor units of the *venue's* currency;
 * `minorToEuro` in `api/partner.ts` is the single seam between the two, and it
 * reads its divisor from `i18n/fx.ts` like everything else that touches a rate.
 */

import type { LanguageCode } from './i18n/context';
/* Type-only: `api/reach.ts` and `api/partner.ts` import React, and this module
   is loaded by `npm run verify` outside a browser. */
import type { ReachReport } from './api/reach';
import type {
  CampaignResponse,
  DealResponse,
  DealStatus,
  Metric,
  OverviewBody,
  Pool,
} from './api/partner';

/* ══════════════════════════════════════════════════════════════ structure ══ */

/**
 * The windows the range picker offers, in the order it lists them.
 *
 * Structure, not data: which windows a reader may choose between is a property
 * of the control, and it survives the seeds going. What each window *contains*
 * is now a question for the server.
 */
export const PD_RANGES = [7, 14, 30, 90] as const;
export type RangeDays = (typeof PD_RANGES)[number];

/** The window everything defaults to, and the one the picker opens on. */
export const RANGE_DAYS: RangeDays = 30;

/**
 * The most points the chart will draw, however long the window.
 *
 * A drawing concern and nothing else — ninety daily points across a card this
 * wide is a comb, and the shape is the only thing the panel is for. It is
 * applied to a *copy* for the chart and never to the series a total is summed
 * from; doing it the other way round once made "last quarter" report 45 days of
 * activity against a whole month's cost.
 */
const MAX_POINTS = 45;

/** The hours the heat map covers, 07:00 to 20:00. */
export const HEAT_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

/* ════════════════════════════════════════════════════════════════ shapes ══ */

/**
 * A day-by-day series.
 *
 * There is no endpoint behind this yet. `GET /v1/partner/venues/:id/export`
 * returns a day-by-day roll-up as CSV and `analytics.overview` returns monthly
 * totals as JSON, but nothing returns a daily series a chart could draw, so the
 * chart panel says so rather than drawing a straight line through zero. When
 * that endpoint exists this is the shape it fills.
 */
export interface Series {
  visits: number[];
  redeemed: number[];
}

/** Days of nothing, which is what a venue with no measured visits has. */
const emptySeries = (days: number): Series => ({
  visits: Array.from({ length: days }, () => 0),
  redeemed: Array.from({ length: days }, () => 0),
});

/**
 * The same series, thinned to what the chart can draw.
 *
 * Evenly spaced samples rather than the first `points` days: a panel headed
 * "last 90 days" that plotted the first 45 of them would be a month and a half
 * drawn under a quarter's label, and the run-up to today — the part an owner is
 * actually reading — would be missing. Both ends are kept.
 */
function thin(series: Series, points: number): Series {
  const days = series.visits.length;
  if (days <= points) return series;
  const pick = (values: number[]) =>
    Array.from(
      { length: points },
      (_, i) => values[Math.round((i * (days - 1)) / (points - 1))],
    );
  return { visits: pick(series.visits), redeemed: pick(series.redeemed) };
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/**
 * The month in six numbers.
 *
 * `attributed` is the one worth reading twice, because it is the only figure on
 * the overview a venue can put in front of an accountant. It is no longer a
 * ratio applied to a visit count — the server counts it directly
 * (`overview.attributedVisits`, a `COUNT` over committed transactions that
 * carried a deal or were not a plain earn), which is what "attributed" was
 * always supposed to mean and what the two invented share constants here were
 * standing in for.
 */
export interface Totals {
  visits: number;
  redeemed: number;
  claims: number;
  newCustomers: number;
  attributed: number;
  /** What every visit through Paylez was probably worth. An estimate. */
  estimate: number;
  /** The share of that we can actually stand behind. */
  attributedMoney: number;
  /**
   * Whether any of the above is a measurement.
   *
   * The one field that is not a number, and the reason the rest are safe to be
   * numbers. `false` means nobody counted anything and the screen must not
   * print these as findings.
   */
  measured: boolean;
}

const EMPTY_TOTALS: Totals = {
  visits: 0,
  redeemed: 0,
  claims: 0,
  newCustomers: 0,
  attributed: 0,
  estimate: 0,
  attributedMoney: 0,
  measured: false,
};

/**
 * The server's `Metric` as a plain number, or `null`.
 *
 * `suppressed` and a genuine zero arrive in the same field and mean opposite
 * things, so this returns `null` for the first and the number for the second.
 * **Never write `?? 0` at a call site** — that is the lie the min-cohort floor
 * exists to prevent, restated as a default.
 */
export const metricValue = (metric: Metric | undefined): number | null =>
  metric === undefined || metric.suppressed ? null : metric.value;

/** The same, for the places that genuinely want "nothing happened" as zero. */
const counted = (metric: Metric | undefined): number => metricValue(metric) ?? 0;

/* ═══════════════════════════════════════════════════════════ the deals ══ */

/**
 * A hot deal as the dashboard draws it.
 *
 * Every field is a column of `hot_deals` or a figure `deals.funnel` returns.
 * What is *not* here is what the prototype's row carried and the server does not
 * measure: a seven-day claim sparkline, a "reach lost to missing languages"
 * percentage, and an audience size. The first two were invented; the third is
 * real but lives behind `deals.audienceFor`, which the list endpoint does not
 * call. A row that cannot say those things says nothing about them.
 */
export interface PartnerDeal {
  id: string;
  /** What the deal gives away, in the venue's own words. */
  badge: string;
  /* The server's own union rather than a copy of it. It *was* a copy, and the
     copy had `ended` where the server says `archived` — which nothing caught,
     because a state nobody had reached is a key nobody looks up. */
  state: DealStatus;
  seen: number;
  opened: number;
  claimed: number;
  /** What the discounts on those claims have cost, in euros. */
  cost: number;
  /** Claims the deal stops after; 0 is no limit. */
  limit: number;
  /** How many of the five languages the deal is written in, and which are missing. */
  langs: number;
  missing: string[];
  from: string | null;
  to: string | null;
}

/**
 * What a deal's one notification did.
 *
 * Three of these four used to be a share of the claim count times an invented
 * rate — `NOTIFY_OPEN_RATE = 0.31` and friends — which drew a plausible funnel
 * for a notification that may never have been sent. The server records the real
 * thing in `deal_pushes` (`sent`, `opened`, and the claims that carried the push
 * id), but `partners.dealsFor` does not join it, so the honest answer today is
 * that only `alone` is known: every claim the deal got, none of them
 * attributable to a push we cannot see.
 *
 * `measured` is what the panel branches on. The funnel still reads downward at
 * zero, which is what `npm run verify` holds it to.
 */
export function dealNotify(deal: PartnerDeal) {
  return {
    notified: 0,
    opened: 0,
    camein: 0,
    blocked: 0,
    /** The claims we can see: all of them, until a push join says otherwise. */
    alone: deal.claimed,
    openPct: 0,
    cameinPct: 0,
    measured: false,
  };
}

/** One server deal row, as the dashboard's shape. */
export function dealFromApi(row: DealResponse, currencyToEuro: (minor: number) => number): PartnerDeal {
  return {
    id: row.id,
    badge: row.discount_text?.trim() || '',
    state: row.status,
    seen: row.funnel.seen,
    opened: row.funnel.opened,
    claimed: row.funnel.claimed,
    cost: currencyToEuro(row.funnel.spendMinor),
    limit: row.funnel.capClaims ?? 0,
    langs: row.translations.filled.length,
    missing: row.translations.missing,
    from: row.valid_from,
    to: row.valid_to,
  };
}

/**
 * The empty deal list.
 *
 * Six invented deals used to live here, and the dictionaries still carry
 * index-aligned names for them (`copy.dashboard.deals.rows`). Those names are
 * now unreachable copy rather than labels for data — a live deal is named by its
 * own `discount_text` and its own translations, because a real venue's offer is
 * not the fourth row of a prototype's table.
 */
export const PD_DEALS: PartnerDeal[] = [];

/* ═══════════════════════════════════════════════════════════ the pools ══ */

/**
 * A loyalty campaign as the dashboard draws it, and what it has committed.
 *
 * `aside` is the number the campaigns screen is built around: money already
 * committed to rewards a customer has earned and not collected. It is not spent
 * — if the reward expires it comes back — but it is not available either, and a
 * budget bar that showed only "spent" would let an owner commit the same złoty
 * twice.
 */
export interface CampaignRow {
  id: string;
  name: string;
  /** What the reward is, in the owner's own words. */
  reward: string;
  visits: number;
  /** What one reward costs the venue, in euros. */
  cost: number;
  priority: number;
  live: boolean;
  earned: number;
  used: number;
  expired: number;
}

export interface CampaignModel {
  list: Array<
    CampaignRow & {
      outstanding: number;
      spent: number;
      aside: number;
      returned: number;
      rate: number;
      gap: number;
    }
  >;
  allocation: number;
  earned: number;
  used: number;
  holding: number;
  returned: number;
  spent: number;
  aside: number;
  available: number;
  /** Which campaign has the widest earned-but-unused gap, or −1 for none. */
  widest: number;
  widestGap: number;
  /** True only when the server told us what this pool holds. */
  measured: boolean;
}

/**
 * The loyalty pool, from the venue's campaigns and the server's own pool row.
 *
 * The pool figures are **not** re-derived from the campaign counts. `Pool`
 * arrives from `budget.budgetFor`, which is the money that actually moved
 * through `budget_movements`, and the server's own rule is that
 * `base − spent − reserved` exhausts it. Recomputing `spent` from
 * `used × cost` here would produce a second opinion about the same money, which
 * is the exact failure this file's original header warned about — one screen
 * short by whatever rounding or top-up the ledger knows about and this does not.
 *
 * The per-campaign `spent` / `aside` are still derived, because they are a
 * *split* of the pool the server does not break down, and they are labelled as
 * an apportionment rather than as a ledger figure on the screen.
 */
export function campaignModel(rows: CampaignRow[], pool: Pool | null): CampaignModel {
  const list = rows.map((c) => {
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

  /* Empty is not a special case, but `reduce` without a seed on an empty array
     throws — which is how an honest empty state becomes a white screen. */
  let widest = -1;
  let widestGap = 0;
  list.forEach((c, index) => {
    if (widest === -1 || c.gap > widestGap) {
      widest = index;
      widestGap = c.gap;
    }
  });

  return {
    list,
    allocation: pool?.base ?? 0,
    earned: sum(list.map((c) => c.earned)),
    used: sum(list.map((c) => c.used)),
    holding: sum(list.map((c) => c.outstanding)),
    returned: sum(list.map((c) => c.returned)),
    spent: pool?.spent ?? 0,
    aside: pool?.reserved ?? 0,
    available: pool?.available ?? 0,
    widest,
    widestGap,
    measured: pool !== null,
  };
}

/**
 * The empty campaign list.
 *
 * Four invented campaigns used to be here — a visit threshold, a reward cost,
 * and earned/used/expired counts each — and the dictionaries still carry
 * index-aligned names for them. A live venue's campaigns are whatever it
 * created through `POST /v1/partner/venues/:id/campaigns`, named by the owner.
 */
export const PD_CAMPAIGNS: CampaignRow[] = [];

/** The pool a device with no partner session knows about: none of one. */
export const PD_CAMPAIGN_MODEL: CampaignModel = campaignModel(PD_CAMPAIGNS, null);

/** One server campaign row, as the dashboard's shape. */
export const campaignFromApi = (
  row: CampaignResponse,
  currencyToEuro: (minor: number) => number,
): CampaignRow => ({
  id: row.id,
  name: row.name,
  reward: row.reward_label,
  visits: row.visits_required,
  cost: currencyToEuro(row.reward_cost_minor),
  priority: row.priority,
  live: row.status === 'active',
  earned: row.earned,
  used: row.redeemed,
  /* The list endpoint counts earned and redeemed and nothing between them, so
     "expired" is not a figure this screen has. Zero here is the count of
     expiries *we can see*, and the screen does not label it as a total. */
  expired: 0,
});

/**
 * A voucher tier, and what one costs.
 *
 * `issued` / `redeemed` are counts the server does not break down per tier — the
 * ladder endpoint returns the tier's *settings* and an estimate of how many the
 * remaining pool could still fund, not how many went out. So they default to
 * zero and the screen shows the settings rather than inventing a take-up.
 */
export interface TierRow {
  pct: number;
  points: number;
  issued: number;
  redeemed: number;
  /** The most this tier may take off one bill, in euros. */
  cap: number;
  /** What the pool could still fund at this tier, per the server's own estimate. */
  remaining: number;
}

/**
 * The voucher pool.
 *
 * A tier's unit cost is the venue's average transaction times the tier's
 * percentage, capped by the most-off-one-voucher figure — which is why that cap
 * is a field on that screen rather than a footnote. Without it a 15% voucher on
 * an unusually large order would take an unbounded bite out of a fixed monthly
 * budget.
 *
 * All four inputs are arguments rather than module constants, because all four
 * are things the owner can move or the server can tell us. **The invariant
 * survives**: `available` is `budget − spent − reserved`, so the three states
 * exhaust the pool at any budget, including zero — which is what `npm run
 * verify` holds this function to, and the reason that check is on the function
 * rather than on a seeded value.
 */
export function voucherModelFor(
  budget: number,
  avgSpend: number,
  maxPerVoucher: number,
  rows: TierRow[] = PD_TIERS,
) {
  const tiers = rows.map((t) => {
    const unit = Math.min((avgSpend * t.pct) / 100, maxPerVoucher);
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

  let biggest = -1;
  let biggestSpent = 0;
  tiers.forEach((t, index) => {
    if (biggest === -1 || t.spent > biggestSpent) {
      biggest = index;
      biggestSpent = t.spent;
    }
  });

  return {
    budget,
    tiers,
    spent,
    reserved,
    available,
    issued,
    held,
    /** What one more voucher buys, at the mix actually being issued. */
    moreVouchers: mixCost > 0 ? Math.max(0, Math.floor(Math.max(0, available) / mixCost)) : 0,
    biggest,
  };
}

export type VoucherModel = ReturnType<typeof voucherModelFor>;

/**
 * The voucher pool, from the server's own pool row rather than from the tiers.
 *
 * Same argument as `campaignModel`: `spent` and `reserved` are ledger figures
 * and must come from `budget_movements`, not from a tier table times a unit
 * price. The per-tier unit cost is still derived, because it is what the ladder
 * is *for* — "raising the points on this tier sends less of the budget that
 * way" is the sentence the screen leads with, and it needs a price per tier.
 */
export function voucherModelFrom(
  pool: Pool | null,
  tiers: TierRow[],
  avgSpend: number,
  maxPerVoucher: number,
) {
  const derived = voucherModelFor(pool?.base ?? 0, avgSpend, maxPerVoucher, tiers);
  if (pool === null) return { ...derived, measured: false };
  return {
    ...derived,
    spent: pool.spent,
    reserved: pool.reserved,
    available: pool.available,
    measured: true,
  };
}

/**
 * The empty tier ladder.
 *
 * Three tiers with issue and redemption counts used to live here. A venue's real
 * ladder is whatever it configured through `PUT /v1/partner/venues/:id/tiers`,
 * and a venue that has configured none has none.
 */
export const PD_TIERS: TierRow[] = [];

/**
 * The whole discount budget, and the loyalty share of it.
 *
 * Zero, because nobody has told us. On a live venue it is `budget.total` and
 * `budget.loyalty.base` from `GET /v1/partner/venues/:id/budget`, which is the
 * figure the owner set through the same endpoint's `PUT`.
 */
export const PD_ALLOCATION = { total: 0, loyalty: 0 };

/** The remainder of the allocation, which is what vouchers get. */
export const PD_VOUCHER_BUDGET = PD_ALLOCATION.total - PD_ALLOCATION.loyalty;

/**
 * The most any one voucher may take off a bill.
 *
 * A *setting*, not a measurement — but it is a setting of the venue's, stored
 * per tier as `max_discount_minor`, so with no venue there is no value for it
 * and zero is the honest one. The live screen reads it off the ladder.
 */
export const PD_MAX_PER_VOUCHER = 0;

export const PD_VOUCHER_MODEL = voucherModelFrom(null, PD_TIERS, 0, PD_MAX_PER_VOUCHER);

/**
 * The venue's own average transaction.
 *
 * It was `34.1 zł` — the prototype's café, quoted at every owner as though it
 * were theirs, and the multiplier behind every money estimate on the overview.
 * The server computes the real one (`averageCheck`, returned with the budget)
 * and the live screen reads it from there; with no venue there is no average,
 * and every estimate built on it is withheld rather than scaled from zero.
 */
export const AVG_SPEND = 0;

/* ═══════════════════════════════════════════════════════════ the window ══ */

/**
 * Everything the range picker moves.
 *
 * The window changes how much *counted activity* falls inside it. What it does
 * not change is what the month cost: a subscription is a monthly charge and the
 * two budget pools are a monthly allocation, and scaling those to a seven-day
 * window would say the venue paid a seventh of its subscription.
 */
export interface PartnerMetrics {
  days: RangeDays;
  index: number;
  /** The window as the chart draws it — thinned to `MAX_POINTS`, never summed. */
  series: Series;
  /** The window as it is counted — every day of it, however few are drawn. */
  totals: Totals;
  /**
   * Attributed sales over what the month cost; what one new customer cost; and
   * claims over views.
   *
   * All three are `0` in the empty month rather than `null`, and the field that
   * carries "we cannot say" is `totals.measured` beside them. That split is
   * deliberate: a ratio is a number wherever it is a ratio at all, and the
   * screens never read these — `Overview` computes its own `roi` from the
   * server's cost breakdown and keeps it `null` until it has both terms, which
   * is where the distinction actually has to be made.
   */
  roi: number;
  perNew: number;
  claimRate: number;
  /** Where each tool's money went. Index-aligned with `…roi.rows`. */
  roiRows: Array<{ cost: number; units: number }>;
  /** The cost-per-new-customer history. Empty until somebody measures one. */
  perNewTrend: number[];
}

const METRICS = new Map<number, PartnerMetrics>();

/**
 * The window, with nothing measured in it.
 *
 * Kept as a function of the window — and memoised on it — because a fresh
 * object per call would re-run every `useMemo` that reads one. Nothing on the
 * dashboard renders this any more; `totals.measured` is `false`, and the
 * screens branch on the live request's state long before they would reach it.
 * What it is still good for is the *shape*: thirty days long, so a chart has
 * something to size against, and pools that exhaust themselves at zero.
 */
export function metricsFor(days: RangeDays): PartnerMetrics {
  const cached = METRICS.get(days);
  if (cached) return cached;

  const built: PartnerMetrics = {
    days,
    index: PD_RANGES.indexOf(days),
    series: thin(emptySeries(days), MAX_POINTS),
    totals: EMPTY_TOTALS,
    roi: 0,
    perNew: 0,
    claimRate: 0,
    roiRows: [],
    /* Empty, not three zeros. A cost-per-new-customer *history* is three
       measurements; three zeros would be three months of claiming the venue
       spent nothing to win nobody. */
    perNewTrend: [],
  };

  METRICS.set(days, built);
  return built;
}

/**
 * The month, from the server's overview and its cost breakdown.
 *
 * Two things it does that the seeded version could not. The estimate uses the
 * venue's *own* average check rather than a prototype café's, so the sentence
 * "an estimate at your average transaction" is true. And `attributed` is the
 * server's own count rather than a ratio of visits minus an overlap constant —
 * which means it can be smaller than a naive derivation, and should be.
 */
export function totalsFrom(
  overview: OverviewBody,
  claims: number,
  redeemed: number,
  avgSpendEuro: number,
): Totals {
  const visits = counted(overview.visits);
  const attributed = counted(overview.attributedVisits);
  const newCustomers = metricValue(overview.newCustomers);

  return {
    visits,
    redeemed,
    claims,
    /* Suppressed by the min-cohort floor is not zero. The screen prints the
       withheld marker for a `null`, so it has to survive to here — but the
       shape is a number, so this is the one place it collapses, and it
       collapses to a *count of what we may say*, which is genuinely 0. */
    newCustomers: newCustomers ?? 0,
    attributed,
    estimate: visits * avgSpendEuro,
    attributedMoney: attributed * avgSpendEuro,
    measured: true,
  };
}

/* Named so anything outside the dashboard can reach one set of figures without
   asking for a window first. All three are the empty month. */
const DEFAULT_METRICS = metricsFor(RANGE_DAYS);

export const PD_SERIES = DEFAULT_METRICS.series;
export const PD_TOTALS = DEFAULT_METRICS.totals;
export const PD_PER_NEW = DEFAULT_METRICS.perNew;

/**
 * What the month cost, line by line. Index-aligned with `…overview.costRows`.
 *
 * Empty rather than four zeros, because the four rows named a subscription fee,
 * two pools and a deal spend that this device knows nothing about. The live
 * screen builds them from `costPerNewCustomer.breakdown`, which is the server
 * summing exactly those four out of `subscriptions`, `budget_movements` and
 * `transactions`.
 */
export const PD_COST_ROWS: number[] = [];
export const PD_COST_TOTAL = sum(PD_COST_ROWS);

/* ═══════════════════════════════════════════════════ the heat map ══ */

/**
 * An average week at the counter.
 *
 * It was three gaussians with a hard cut on Tuesday and Wednesday afternoons,
 * normalised to 278 scans — and the quiet block it produced was quoted as a
 * finding on two screens and by the assistant. The server has the real one:
 * `analytics.heatmap` groups `venue_visits` by venue-local weekday and hour and
 * names the quietest *open* hour, which is the part the generator could never
 * do, because 04:00 on a Monday is not a hole in the trade.
 *
 * Empty here is a 7 × 14 grid of zeros: the shape the screen expects, with
 * nothing in it. `PD_HEAT_MAX` is 0, and the screen reads that as "no range to
 * shade" and renders its empty state rather than a uniformly blank grid that
 * looks like a quiet week.
 */
export const PD_HEAT: number[][] = Array.from({ length: 7 }, () =>
  Array.from({ length: HEAT_HOURS.length }, () => 0),
);
export const PD_HEAT_MAX = Math.max(...PD_HEAT.flat());

/** The server's 7 × 24 grid, narrowed to the hours this map draws. */
export const heatFromApi = (grid: number[][]): number[][] =>
  Array.from({ length: 7 }, (_, day) =>
    HEAT_HOURS.map((hour) => grid[day]?.[hour] ?? 0),
  );

/* ═══════════════════════════════════════════════════════ the customers ══ */

/**
 * Who comes in.
 *
 * Every field was a seed: 642 customers, a language split, an age split, four
 * monthly cohorts, a cost-per-new-customer benchmark and a peer count. Three of
 * those the server measures (`languageMix`, `cohorts`, `costPerNewCustomer`);
 * one it measures but only for venues in a large enough group
 * (`benchmarksFor`); and **two it does not collect at all, deliberately** — age
 * and settled-status are not fields Paylez holds, because the language a
 * customer chose for themselves is the only demographic signal the spec allows.
 * Those two are gone rather than zeroed: a bar chart of a thing we do not
 * measure has no honest empty state.
 */
export const PD_CUSTOMERS = {
  total: 0,
  /** Percentages — index-aligned with `copy.dashboard.customers.langs`. */
  langs: [] as number[],
  /** Monthly cohorts: first-timers, and how many came back inside 30 days. */
  cohorts: [] as Array<{ first: number; back: number }>,
  /** Regulars who have not been in for over 30 days. */
  lapsed: 0,
  /** The venue's own cost per new customer, over as many months as we have. */
  perNewPrev: [] as number[],
  /**
   * What comparable venues pay for one, and how many they are.
   *
   * `null` rather than 0: the server withholds a benchmark until enough venues
   * are in the group, precisely so a partner cannot back out a competitor's
   * figure, and "we are not telling you" must not render as "they pay nothing".
   */
  benchmark: null as number | null,
  benchClaim: null as number | null,
  benchSecond: null as number | null,
  peers: 0,
};

/**
 * A customer who turned profile sharing on.
 *
 * Sixteen invented people used to be here, with names, spend, visit counts and
 * a "tenure" driving a six-month spend chart. The server's `customerTable` is
 * the real list and it is gated twice — by the `identified_profiles`
 * entitlement, and by an unrevoked `data_sharing_consents` row per person. Both
 * gates are the reason this list is much shorter than the customer count beside
 * it, and the screen says so.
 */
export interface RosterEntry {
  id: string;
  name: string;
  init: string;
  /** Euros, at this venue only. */
  spent: number;
  visits: number;
  /** Days since the last scan. */
  last: number;
  status: string;
  stamps: number;
  vouchers: number;
  since: string;
}

export const PD_ROSTER: RosterEntry[] = [];

/* ═══════════════════════════════════════════════════════════ the scans ══ */

/**
 * A scan at the counter.
 *
 * Forty-eight were generated from the row index — a name from a list of
 * sixteen, a receipt code, a spend, a campaign — and paged twelve at a time.
 * There is no endpoint that lists a venue's scans: `analytics.today` counts
 * them and `GET /v1/venues/:id/pending` lists the ones waiting to be confirmed,
 * and neither is a till log. So the screen reports the counts it can get and
 * says the log itself is not available, rather than generating one.
 */
export interface ScanRow {
  hour: number;
  minute: number;
  who: string;
  first: boolean;
  spent: number;
  points: number;
  receipt: string;
}

export const PD_SCANS: ScanRow[] = [];
/** Display names, so they are structure rather than copy — nobody translates a name. */
export const PD_SCAN_NAMES: string[] = [];
export const PD_SCAN_TOTAL = 0;
export const PD_SCAN_PAGE = 12;

/* ═════════════════════════════════════════════════════ audiences & quota ══ */

/**
 * The audiences a deal or notification can be aimed at.
 *
 * Five, with a reach, a notifiable count and a send time each — all invented.
 * The server computes a real audience per deal (`deals.audienceFor`, which is
 * the honest figure §9.1 asks for: who a push should reach against who it
 * actually will, after the platform-level frequency cap), but there is no
 * endpoint that lists the audiences a venue could pick from, so the create
 * drawer has no sizes to show and says so.
 */
export const PD_AUDIENCES: Array<{ reach: number; notifiable: number; sendAt: string }> = [];

/**
 * Notifications the plan allows a month, and how many are left.
 *
 * Real, and reachable: `GET /v1/partner/venues/:id/push-quota` returns exactly
 * this out of `push_quotas` and the plan's `push_quota` entitlement. Zero here
 * is the no-session state; `usePartnerPushQuota` is the live one.
 */
export const PD_NOTIFY_QUOTA = { total: 0, left: 0, measured: false };

/** Regulars who have earned a reward and are within a visit of the next one. */
export const PD_NEAR = 0;

/** The last reminder that went out to lapsed campaign members. */
export const PD_REMIND = { back: 0, of: 0 };

/* ═════════════════════════════════════════════════════ reach: the funnel ══ */

export interface Reach {
  /** The listing in a list, a search result or on the map. */
  listingSeen: number;
  listingClicks: number;
  /** The venue's live offers, summed. */
  dealSeen: number;
  dealClicks: number;
  /** Both, which is what an owner means by "seen". */
  seen: number;
  clicks: number;
  /** Clicks per impression and claims per click, as percentages. */
  clickRate: number;
  claims: number;
  claimRate: number;
}

/**
 * Reach, out of the server's own counters.
 *
 * This is the one panel that was already live before the rewrite, and the
 * pattern the rest now follows. It invents nothing: every figure is a row
 * somebody's browser posted through `api/reach.ts` and `analytics.reach` added
 * up. Its twin — `reachFor`, which multiplied visits by an invented
 * impressions-per-visit ratio — is gone.
 *
 * Three things it has to get right, all stated by the server:
 *
 * - **The rates arrive as 0–1 and this screen speaks percent.** Multiplying
 *   here keeps the unit attached to the shape.
 * - **A rate over nothing is 0**, which the server already guarantees; it is
 *   carried rather than re-derived, so there is one opinion about it.
 * - **`uniqueClickers` is not carried at all.** It takes the min-cohort floor,
 *   its value is `null` when suppressed, and `Reach` has no field that can hold
 *   "we are not telling you". A `?? 0` into a number field is the lie
 *   suppression exists to prevent, so it stays in `ReachReport`.
 */
export function reachFromApi(report: ReachReport): Reach {
  /* The listing is the row with no deal id; the server always emits it, but
     deriving the fallback from the totals means a response that ever stops
     emitting it still adds up rather than reporting a listing nobody saw. */
  const dealRows = report.rows.filter((row) => row.id !== null);
  const dealSeen = sum(dealRows.map((row) => row.impressions));
  const dealClicks = sum(dealRows.map((row) => row.clicks));
  const listing = report.rows.find((row) => row.id === null);

  return {
    listingSeen: listing?.impressions ?? Math.max(0, report.impressions - dealSeen),
    listingClicks: listing?.clicks ?? Math.max(0, report.clicks - dealClicks),
    dealSeen,
    dealClicks,
    seen: report.impressions,
    clicks: report.clicks,
    clickRate: report.clickRate * 100,
    claims: report.claims,
    claimRate: report.claimRate * 100,
  };
}

/* ────────────────────────────────────────────────────────────── assistant ── */

/**
 * The numbers the assistant is allowed to quote.
 *
 * CLAUDE.md's rule for this screen is that every figure in every sentence it
 * says arrives through a `fill()` hole from this file — which is exactly what
 * stops it inventing one. The corollary, now that the seeds are gone, is that
 * **it has nothing to quote and must say so**: an assistant that fills a hole
 * with 0 because it cannot know is the failure the rule exists to prevent, so
 * `measured` is false and the screen refuses to draft rather than drafting
 * around blanks.
 *
 * `budgets` and `weeks` survive because they are not measurements — they are the
 * sizes the assistant *offers*, the steps on a chooser, and a chooser with no
 * steps is a broken control rather than an honest one. Everything else here was
 * a claim about this venue: a quiet window, a peer count, a free-item multiple,
 * how much room the month has left, what share of customers read Russian, how
 * many regulars would have qualified at a lower tier. Every one of those is
 * something the server can answer once there is a session
 * (`assistant.venueContext`, `analytics.heatmap`, `analytics.languageMix`,
 * `budget.budgetFor`), and none of them is something this device can.
 */
export const PD_ASSIST = {
  /** False until a venue's own context has been fetched. Gate every sentence on it. */
  measured: false,
  /** The quietest stretch, and how far below the weekly average it runs. */
  quietDays: [] as number[],
  quietFrom: '',
  quietTo: '',
  quietBelow: 0,
  /** How many venues a comparison is drawn from. */
  peers: 0,
  itemMultiple: 0,
  itemCost: 0,
  /** How much room the month has left before a hot deal eats into margin. */
  hotRoom: 0,
  /** The three budgets it offers, and the three durations. Structure, not data. */
  budgets: [200, 400, 700],
  weeks: [2, 4, 8],
  audience: 0,
  stopAfter: 0,
  sendAt: '',
  russianShare: 0,
  students: 0,
  tierLower: 0,
  tierLowerReached: 0,
  twiceBefore: 0,
  redeemedBefore: 0,
};

/** The reward the assistant drafts: a free item, or a share off the bill. */
export type AssistReward = 'item' | 'percent';

/**
 * The deal text the assistant writes, in all five languages at once.
 *
 * **Copy, not data**, and the reason it survived the cut. The point of the
 * language tabs on the draft is that an owner reading in Polish sees what a
 * Russian-speaking customer will read; copy that lived in `pl.ts` would be the
 * Polish *for* five languages, which is a different thing and a useless one.
 * The prototype makes the same call. Nothing here is a claim about a venue —
 * it is the wording of an offer, and it is as true of an empty dashboard as of
 * a busy one.
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

/* ═══════════════════════════════════════════════════════════════ drawing ══ */

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
