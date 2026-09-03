/**
 * Partner analytics — mobile §12 (the estimated-sales pipeline) and desktop B9
 * (the findings computed on top of it).
 *
 * Two rules run through every function here, and both are about honesty rather
 * than arithmetic:
 *
 *   * **Counted, estimated and attributed are three different things** (§12) and
 *     the API says which one it is returning. A visit count is *counted* — it
 *     happened, we watched it. A month-end sales projection is *estimated*. The
 *     customers Paylez claims credit for are *attributed*, and that number is
 *     deliberately conservative: only visits with a deal claim or a redemption
 *     attached, because a customer who walked past and came in anyway is not
 *     ours to bill for.
 *   * **Aggregate only, with a minimum cohort** (§1.3, B9). Anything computed
 *     over fewer than ~10 customers is suppressed rather than rounded, because a
 *     "finding" over three people is a description of three people. The
 *     suppression is returned as a state, not as a zero — a partner who sees 0%
 *     will believe it.
 */
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import { median } from './money.ts';
import { minCohort, minVenues } from './settings.ts';
import { localMonth, monthStart, nextPeriod, now, plusDays, type Iso } from './time.ts';
import { getVenue } from './venues.ts';

/** What kind of number this is, so the client can label it (§12). */
export type Kind = 'counted' | 'estimated' | 'attributed';

export interface Metric {
  value: number | null;
  kind: Kind;
  /** True when the cohort was too small to report. `value` is then null. */
  suppressed: boolean;
  cohort?: number;
}

const counted = (value: number): Metric => ({ value, kind: 'counted', suppressed: false });
const estimated = (value: number): Metric => ({ value, kind: 'estimated', suppressed: false });
const attributed = (value: number): Metric => ({ value, kind: 'attributed', suppressed: false });

/** Suppress when the cohort is too small — see the note at the top. */
async function guarded(db: Db, value: number, cohort: number, kind: Kind = 'counted'): Promise<Metric> {
  const floor = await minCohort(db);
  if (cohort < floor) return { value: null, kind, suppressed: true, cohort };
  return { value, kind, suppressed: false, cohort };
}

export interface Window {
  /** `YYYY-MM`, venue-local. Defaults to the month containing `at`. */
  period?: string;
  at?: Iso;
}

interface Range {
  from: Iso;
  to: Iso;
  period: string;
}

async function rangeFor(db: Db, venueId: string, window: Window): Promise<Range> {
  const at = window.at ?? now();
  const venue = await getVenue(db, venueId);
  const period = window.period ?? localMonth(at, venue.timezone);
  return {
    from: monthStart(period, venue.timezone),
    to: monthStart(nextPeriod(period), venue.timezone),
    period,
  };
}

/* ═══════════════════════════════════════════════════ §12 the sales pipeline ══ */

export interface Overview {
  period: string;
  currency: string;
  visits: Metric;
  customers: Metric;
  newCustomers: Metric;
  returningCustomers: Metric;
  salesMinor: Metric;
  projectedSalesMinor: Metric;
  averageCheckMinor: Metric;
  attributedVisits: Metric;
  attributedCustomers: Metric;
  pointsIssued: number;
  discountGivenMinor: number;
}

export async function overview(db: Db, venueId: string, window: Window = {}): Promise<Overview> {
  const { from, to, period } = await rangeFor(db, venueId, window);
  const venue = await getVenue(db, venueId);
  const at = window.at ?? now();

  const visits = await db.all<{ user_id: string; amount_minor: number; created_at: string }>(
    `SELECT user_id, amount_minor, created_at FROM venue_visits
      WHERE venue_id = $v AND created_at >= $f AND created_at < $t`,
    { v: venueId, f: from, t: to },
  );

  const customers = new Set(visits.map((visit) => visit.user_id));
  const cohort = customers.size;

  /* New vs returning is decided by whether this venue had ever seen them before
     the window opened, not by whether they appear once inside it — otherwise a
     regular who visited twice this month would count as new the first time. */
  const firstSeen = await db.all<{ user_id: string; first_seen_at: string }>(
    `SELECT user_id, first_seen_at FROM venue_customers WHERE venue_id = $v`,
    { v: venueId },
  );
  const firstSeenMap = new Map(firstSeen.map((row) => [row.user_id, row.first_seen_at]));
  let fresh = 0;
  for (const user of customers) {
    const seen = firstSeenMap.get(user);
    if (!seen || seen >= from) fresh += 1;
  }

  const amounts = visits.map((visit) => visit.amount_minor);
  const sales = amounts.reduce((total, amount) => total + amount, 0);

  /* The month-end projection: sales so far, scaled by how much of the month has
     passed. Labelled `estimated` because it is a straight-line guess and the
     client renders it as one — a partner reading it as revenue booked would be
     the exact failure §12's honesty rules exist to prevent. */
  const elapsed = Math.max(1, (new Date(Math.min(new Date(at).getTime(), new Date(to).getTime())).getTime() - new Date(from).getTime()));
  const full = new Date(to).getTime() - new Date(from).getTime();
  const projected = Math.round(sales * (full / elapsed));

  const attributedRows = await db.all<{ user_id: string }>(
    `SELECT DISTINCT t.user_id FROM transactions t
      WHERE t.venue_id = $v AND t.status = 'committed'
        AND t.confirmed_at >= $f AND t.confirmed_at < $t
        AND (t.deal_id IS NOT NULL OR t.intent != 'earn')`,
    { v: venueId, f: from, t: to },
  );
  const attributedVisitCount = (await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM transactions
      WHERE venue_id = $v AND status = 'committed' AND confirmed_at >= $f AND confirmed_at < $t
        AND (deal_id IS NOT NULL OR intent != 'earn')`,
    { v: venueId, f: from, t: to },
  ))?.n ?? 0;

  const pointsIssued =
    (await db.get<{ total: number | null }>(
      `SELECT SUM(delta) AS total FROM points_ledger
        WHERE venue_id = $v AND delta > 0 AND status = 'committed'
          AND created_at >= $f AND created_at < $t`,
      { v: venueId, f: from, t: to },
    ))?.total ?? 0;

  const discountGiven =
    (await db.get<{ total: number | null }>(
      `SELECT SUM(discount_minor) AS total FROM transactions
        WHERE venue_id = $v AND status = 'committed' AND confirmed_at >= $f AND confirmed_at < $t`,
      { v: venueId, f: from, t: to },
    ))?.total ?? 0;

  return {
    period,
    currency: venue.currency,
    /* Visits and customers are exact counts and are *not* cohort-suppressed:
       they are the venue's own footfall, not a finding about a group of
       identifiable people. Everything derived from them is. */
    visits: counted(visits.length),
    customers: counted(cohort),
    newCustomers: await guarded(db, fresh, cohort),
    returningCustomers: await guarded(db, cohort - fresh, cohort),
    salesMinor: counted(sales),
    projectedSalesMinor: estimated(projected),
    averageCheckMinor: await guarded(db, median(amounts) ?? 0, cohort, 'estimated'),
    attributedVisits: attributed(attributedVisitCount),
    attributedCustomers: attributed(attributedRows.length),
    pointsIssued,
    discountGivenMinor: discountGiven,
  };
}

/* ═════════════════════════════════════════════════════ reach: seen, clicked ══ */

/** One row of the per-deal breakdown. `null` `id` is the listing itself. */
export interface ReachRow {
  id: string | null;
  title: string;
  impressions: number;
  clicks: number;
  claims: number;
  /** Clicks per impression, 0–1. Zero impressions is a zero rate, not a NaN. */
  clickRate: number;
}

export interface Reach {
  period: string;
  impressions: number;
  clicks: number;
  clickRate: number;
  /** How many *people* clicked, as opposed to how many clicks there were. */
  uniqueClickers: Metric;
  /** Claims, which only a deal can have — the listing has no counterpart. */
  claims: number;
  /** Claims per click. The bottom of the funnel, and the only paid step. */
  claimRate: number;
  /** Where the impressions came from, most first. */
  sources: Array<{ source: string; impressions: number; clicks: number }>;
  /** The listing, then one row per deal that was seen at all this period. */
  rows: ReachRow[];
}

/**
 * How many people saw this venue, and how many of them did something about it.
 *
 * The one question the dashboard could not answer. Everything else it reports
 * starts at a *visit* — a confirmed scan at the counter — which means a venue
 * whose deals nobody opens and a venue nobody has ever heard of produce exactly
 * the same screen: zeroes everywhere, with no way to tell "we are invisible"
 * from "we are seen and ignored". Those two have opposite fixes, and telling
 * them apart is the whole reason this exists.
 *
 * Two sources, one funnel. `service_events` is the *listing* — the venue's card
 * appearing in a list, a search result or a map, and being opened. `deal_events`
 * is an *offer* — the same two steps, plus the claim only the gate can write.
 * They are summed rather than reported separately at the top because an owner
 * asking "is anybody seeing us" does not care which surface it happened on; the
 * `rows` breakdown is there for when they do.
 *
 * **Rates are not suppressed and `uniqueClickers` is.** An impression is not a
 * person — it is a card being drawn — so counting them says nothing about
 * anybody. The moment the question becomes "how many *people*", the min-cohort
 * floor applies exactly as it does everywhere else on this screen.
 *
 * A rate over zero impressions is **0**, not NaN and not null. Null means "we
 * are not telling you"; this is "nothing happened", and the two must not render
 * the same way — that is the same lie `suppressed` exists to prevent one metric
 * over.
 */
export async function reach(db: Db, venueId: string, window: Window = {}): Promise<Reach> {
  const { from, to, period } = await rangeFor(db, venueId, window);
  const bind = { v: venueId, f: from, t: to };

  const listing = await db.get<{ impressions: number; clicks: number }>(
    `SELECT
        SUM(CASE WHEN event_type = 'impression' THEN 1 ELSE 0 END) AS impressions,
        SUM(CASE WHEN event_type = 'click' THEN 1 ELSE 0 END) AS clicks
       FROM service_events
      WHERE venue_id = $v AND created_at >= $f AND created_at < $t`,
    bind,
  );

  const deals = await db.all<{
    id: string;
    title: string;
    impressions: number;
    clicks: number;
    claims: number;
  }>(
    /* The title comes out of `translations`, not off the deal: copy lives in
       one table so the backend can tell which languages are filled (B3), and a
       deal row has no title column at all. English is the fallback rather than
       the answer — this is an owner's own report, and the label only has to name
       the deal they wrote. */
    `SELECT d.id,
            COALESCE(
              (SELECT value FROM translations
                WHERE entity = 'hot_deal' AND entity_id = d.id AND field = 'title'
                ORDER BY (language = 'en') DESC LIMIT 1),
              d.discount_text, d.id
            ) AS title,
            SUM(CASE WHEN e.event_type = 'impression' THEN 1 ELSE 0 END) AS impressions,
            SUM(CASE WHEN e.event_type = 'open' THEN 1 ELSE 0 END) AS clicks,
            SUM(CASE WHEN e.event_type = 'claim' THEN 1 ELSE 0 END) AS claims
       FROM deal_events e JOIN hot_deals d ON d.id = e.deal_id
      WHERE d.venue_id = $v AND e.created_at >= $f AND e.created_at < $t
      GROUP BY d.id
      ORDER BY impressions DESC`,
    bind,
  );

  /* Sources are read off both tables and folded together, because "where were
     we seen" is one question. `deal_events.source` and `service_events` do not
     share a vocabulary by accident — both are written by the same clients. */
  const sources = await db.all<{ source: string; impressions: number; clicks: number }>(
    `SELECT source,
            SUM(CASE WHEN kind = 'impression' THEN 1 ELSE 0 END) AS impressions,
            SUM(CASE WHEN kind = 'click' THEN 1 ELSE 0 END) AS clicks
       FROM (
         SELECT COALESCE(source, 'unknown') AS source,
                CASE WHEN event_type = 'impression' THEN 'impression' ELSE 'click' END AS kind
           FROM service_events
          WHERE venue_id = $v AND created_at >= $f AND created_at < $t
         UNION ALL
         SELECT COALESCE(e.source, 'unknown') AS source,
                CASE WHEN e.event_type = 'impression' THEN 'impression' ELSE 'click' END AS kind
           FROM deal_events e JOIN hot_deals d ON d.id = e.deal_id
          WHERE d.venue_id = $v AND e.event_type IN ('impression', 'open')
            AND e.created_at >= $f AND e.created_at < $t
       )
      GROUP BY source
      ORDER BY impressions DESC`,
    bind,
  );

  /* One person who opened the listing *and* two deals is one clicker. Counted
     across both tables in one pass for that reason — two counts added together
     would double them. Signed-out clicks have no id and cannot be deduplicated,
     so they are excluded rather than counted as one anonymous person. */
  const clickers =
    (await db.get<{ n: number }>(
      `SELECT COUNT(DISTINCT user_id) AS n FROM (
          SELECT user_id FROM service_events
           WHERE venue_id = $v AND event_type = 'click' AND user_id IS NOT NULL
             AND created_at >= $f AND created_at < $t
          UNION
          SELECT e.user_id FROM deal_events e JOIN hot_deals d ON d.id = e.deal_id
           WHERE d.venue_id = $v AND e.event_type = 'open' AND e.user_id IS NOT NULL
             AND e.created_at >= $f AND e.created_at < $t
        )`,
      bind,
    ))?.n ?? 0;

  const listingImpressions = listing?.impressions ?? 0;
  const listingClicks = listing?.clicks ?? 0;
  const impressions =
    listingImpressions + deals.reduce((total, row) => total + row.impressions, 0);
  const clicks = listingClicks + deals.reduce((total, row) => total + row.clicks, 0);
  const claims = deals.reduce((total, row) => total + row.claims, 0);

  const rate = (top: number, bottom: number) => (bottom > 0 ? top / bottom : 0);

  const rows: ReachRow[] = [
    {
      id: null,
      title: 'Listing',
      impressions: listingImpressions,
      clicks: listingClicks,
      claims: 0,
      clickRate: rate(listingClicks, listingImpressions),
    },
    ...deals.map((row) => ({
      id: row.id,
      title: row.title,
      impressions: row.impressions,
      clicks: row.clicks,
      claims: row.claims,
      clickRate: rate(row.clicks, row.impressions),
    })),
  ];

  return {
    period,
    impressions,
    clicks,
    clickRate: rate(clicks, impressions),
    uniqueClickers: await guarded(db, clickers, clickers),
    claims,
    claimRate: rate(claims, clicks),
    sources,
    rows,
  };
}

/* ═══════════════════════════════════════════════════════════ B9 findings ══ */

/**
 * The day × hour grid, and the quietest and busiest windows in it.
 *
 * The quiet window is the handoff to the hot-deal authoring flow: "Tuesday
 * 14:00–16:00 is your quietest hour, run something" is the single most useful
 * thing this dashboard says, and it is one `GROUP BY` away from the visits it
 * already stores in venue-local hours.
 */
export async function heatmap(db: Db, venueId: string, window: Window = {}) {
  const { from, to, period } = await rangeFor(db, venueId, window);
  const rows = await db.all<{ local_weekday: number; local_hour: number; n: number }>(
    `SELECT local_weekday, local_hour, COUNT(*) AS n FROM venue_visits
      WHERE venue_id = $v AND created_at >= $f AND created_at < $t
      GROUP BY local_weekday, local_hour`,
    { v: venueId, f: from, t: to },
  );

  const grid: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  let total = 0;
  for (const row of rows) {
    grid[row.local_weekday][row.local_hour] = row.n;
    total += row.n;
  }

  /* Only opening hours are candidates for "quietest": 04:00 on a Monday is not a
     hole in the trade, it is a closed café, and offering to run a deal into it
     would be the dashboard's most obviously stupid suggestion. */
  const open = await db.all<{ weekday: number; opens_min: number | null; closes_min: number | null; closed: number }>(
    `SELECT weekday, opens_min, closes_min, closed FROM venue_hours WHERE venue_id = $v`,
    { v: venueId },
  );
  const isOpenHour = (weekday: number, hour: number): boolean => {
    const row = open.find((h) => h.weekday === weekday);
    if (!row) return hour >= 8 && hour < 22;
    if (row.closed) return false;
    if (row.opens_min === null || row.closes_min === null) return true;
    const minutes = hour * 60;
    return row.opens_min < row.closes_min
      ? minutes >= row.opens_min && minutes < row.closes_min
      : minutes >= row.opens_min || minutes < row.closes_min;
  };

  let quietest: { weekday: number; hour: number; visits: number } | null = null;
  let busiest: { weekday: number; hour: number; visits: number } | null = null;
  for (let weekday = 0; weekday < 7; weekday += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      if (!isOpenHour(weekday, hour)) continue;
      const visits = grid[weekday][hour];
      if (!quietest || visits < quietest.visits) quietest = { weekday, hour, visits };
      if (!busiest || visits > busiest.visits) busiest = { weekday, hour, visits };
    }
  }

  return { period, grid, total, quietest, busiest };
}

/**
 * B9 second-visit rate, by monthly cohort.
 *
 * "For each monthly cohort of first-time visitors, the share returning within 30
 * days." A cohort smaller than the floor is reported as suppressed rather than
 * as a percentage of four people.
 */
export async function cohorts(db: Db, venueId: string, months = 6, window: Window = {}) {
  const at = window.at ?? now();
  const venue = await getVenue(db, venueId);
  const out: Array<{ cohort: string; size: number; returned: Metric }> = [];

  for (let back = months - 1; back >= 0; back -= 1) {
    const date = new Date(at);
    date.setUTCMonth(date.getUTCMonth() - back);
    const period = localMonth(date.toISOString(), venue.timezone);
    const from = monthStart(period, venue.timezone);
    const to = monthStart(nextPeriod(period), venue.timezone);

    const firstTimers = await db.all<{ user_id: string; first_seen_at: string }>(
      `SELECT user_id, first_seen_at FROM venue_customers
        WHERE venue_id = $v AND first_seen_at >= $f AND first_seen_at < $t`,
      { v: venueId, f: from, t: to },
    );

    let returned = 0;
    for (const person of firstTimers) {
      const again = await db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM venue_visits
          WHERE venue_id = $v AND user_id = $u AND created_at > $f AND created_at <= $w`,
        { v: venueId, u: person.user_id, f: person.first_seen_at, w: plusDays(person.first_seen_at, 30) },
      );
      if ((again?.n ?? 0) > 0) returned += 1;
    }

    out.push({
      cohort: period,
      size: firstTimers.length,
      returned: await guarded(db, firstTimers.length ? returned / firstTimers.length : 0, firstTimers.length),
    });
  }
  return out;
}

/**
 * B9 repeat-visit multiple: how much more often campaign members come than they
 * did before joining.
 *
 * Computed from visit history with no PII, as the spec requires — the comparison
 * is a member's own monthly rate before and after the join date, so it does not
 * need to know anything about them beyond when they visited.
 */
export async function repeatMultiple(db: Db, venueId: string, window: Window = {}): Promise<Metric> {
  const { at } = { at: window.at ?? now() };
  const members = await db.all<{ user_id: string; joined_at: string }>(
    `SELECT s.user_id, s.joined_at FROM stamp_cards s
       JOIN campaigns c ON c.id = s.campaign_id
      WHERE c.venue_id = $v`,
    { v: venueId },
  );

  const ratios: number[] = [];
  for (const member of members) {
    const before = await db.get<{ n: number; first: string | null }>(
      `SELECT COUNT(*) AS n, MIN(created_at) AS first FROM venue_visits
        WHERE venue_id = $v AND user_id = $u AND created_at < $j`,
      { v: venueId, u: member.user_id, j: member.joined_at },
    );
    const after = await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM venue_visits
        WHERE venue_id = $v AND user_id = $u AND created_at >= $j`,
      { v: venueId, u: member.user_id, j: member.joined_at },
    );
    if (!before?.first || (before.n ?? 0) === 0) continue;

    const monthsBefore = Math.max(0.5, monthsBetween(before.first, member.joined_at));
    const monthsAfter = Math.max(0.5, monthsBetween(member.joined_at, at));
    const rateBefore = before.n / monthsBefore;
    const rateAfter = (after?.n ?? 0) / monthsAfter;
    if (rateBefore > 0) ratios.push(rateAfter / rateBefore);
  }

  const value = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0;
  return await guarded(db, value, ratios.length, 'estimated');
}

const monthsBetween = (from: Iso, to: Iso): number =>
  (new Date(to).getTime() - new Date(from).getTime()) / (30 * 86_400_000);

/**
 * B9 language mix — "the only demographic signal; no nationality/age/time".
 *
 * It is the app language the customer chose for themselves, which is a
 * *preference*, not an origin. That distinction is the whole reason it is
 * collectable at all.
 */
export async function languageMix(db: Db, venueId: string, window: Window = {}) {
  const { from, to } = await rangeFor(db, venueId, window);
  const rows = await db.all<{ language: string; n: number }>(
    `SELECT u.language, COUNT(DISTINCT v.user_id) AS n
       FROM venue_visits v JOIN users u ON u.id = v.user_id
      WHERE v.venue_id = $v AND v.created_at >= $f AND v.created_at < $t
      GROUP BY u.language ORDER BY n DESC`,
    { v: venueId, f: from, t: to },
  );
  const total = rows.reduce((sum, row) => sum + row.n, 0);
  if (total < (await minCohort(db))) return { suppressed: true, total, rows: [] as Array<{ language: string; share: number }> };
  return {
    suppressed: false,
    total,
    rows: rows.map((row) => ({ language: row.language, share: row.n / total })),
  };
}

/**
 * B9 cost per new customer.
 *
 * "Total partner spend in period (subscription fee + loyalty rewards given +
 * voucher discounts given + hot-deal discounts) ÷ new customers." All four
 * sources, summed here rather than in four places — the partner dashboard shows
 * this figure twice (a headline and the last column of a trend) and the site's
 * own rule is that a figure shown twice is computed once.
 */
export async function costPerNewCustomer(db: Db, venueId: string, window: Window = {}) {
  const { from, to, period } = await rangeFor(db, venueId, window);

  const subscription =
    (await db.get<{ price: number }>(
      `SELECT p.price_minor AS price FROM subscriptions s JOIN plans p ON p.id = s.plan_id
        WHERE s.venue_id = $v AND s.status IN ('active', 'trialing', 'grace')
        ORDER BY p.rank DESC LIMIT 1`,
      { v: venueId },
    ))?.price ?? 0;

  const loyalty =
    (await db.get<{ total: number | null }>(
      `SELECT SUM(amount_minor) AS total FROM budget_movements m
         JOIN budgets b ON b.id = m.budget_id
        WHERE b.venue_id = $v AND b.period = $p AND m.allocation = 'loyalty' AND m.kind = 'debit'`,
      { v: venueId, p: period },
    ))?.total ?? 0;

  const vouchers =
    (await db.get<{ total: number | null }>(
      `SELECT SUM(amount_minor) AS total FROM budget_movements m
         JOIN budgets b ON b.id = m.budget_id
        WHERE b.venue_id = $v AND b.period = $p AND m.allocation = 'voucher' AND m.kind = 'debit'`,
      { v: venueId, p: period },
    ))?.total ?? 0;

  const deals =
    (await db.get<{ total: number | null }>(
      `SELECT SUM(t.discount_minor) AS total FROM transactions t
        WHERE t.venue_id = $v AND t.status = 'committed' AND t.deal_id IS NOT NULL
          AND t.confirmed_at >= $f AND t.confirmed_at < $to`,
      { v: venueId, f: from, to },
    ))?.total ?? 0;

  const newCustomers =
    (await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM venue_customers
        WHERE venue_id = $v AND first_seen_at >= $f AND first_seen_at < $to`,
      { v: venueId, f: from, to },
    ))?.n ?? 0;

  const spend = subscription + loyalty + vouchers + deals;
  return {
    period,
    spendMinor: spend,
    breakdown: { subscription, loyalty, vouchers, deals },
    newCustomers,
    /* Guarded on the *customer* count for the same reason as everything else:
       "we spent 300 zł to win 2 customers" is a fact about two people. */
    costPerNewCustomerMinor: await guarded(
      db,
      newCustomers ? Math.round(spend / newCustomers) : 0,
      newCustomers,
      'estimated',
    ),
  };
}

/**
 * B9 ROI by feature: cost in period ÷ outcome, per mechanic.
 *
 * The outcomes are deliberately different per feature because the features do
 * different things — a campaign buys repeat visits, a deal buys claims, a
 * voucher buys redemptions. Normalising them into one "outcome" would produce a
 * comparable-looking number that compares nothing.
 */
export async function roiByFeature(db: Db, venueId: string, window: Window = {}) {
  const { from, to, period } = await rangeFor(db, venueId, window);

  const spendOf = async (allocation: 'loyalty' | 'voucher') =>
    (await db.get<{ total: number | null }>(
      `SELECT SUM(amount_minor) AS total FROM budget_movements m JOIN budgets b ON b.id = m.budget_id
        WHERE b.venue_id = $v AND b.period = $p AND m.allocation = $a AND m.kind = 'debit'`,
      { v: venueId, p: period, a: allocation },
    ))?.total ?? 0;

  const rewardsRedeemed =
    (await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM earned_rewards
        WHERE venue_id = $v AND status = 'redeemed' AND redeemed_at >= $f AND redeemed_at < $to`,
      { v: venueId, f: from, to },
    ))?.n ?? 0;

  const vouchersRedeemed =
    (await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM issued_vouchers
        WHERE venue_id = $v AND status = 'redeemed' AND redeemed_at >= $f AND redeemed_at < $to`,
      { v: venueId, f: from, to },
    ))?.n ?? 0;

  const dealClaims =
    (await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM deal_events e JOIN hot_deals d ON d.id = e.deal_id
        WHERE d.venue_id = $v AND e.event_type = 'claim' AND e.created_at >= $f AND e.created_at < $to`,
      { v: venueId, f: from, to },
    ))?.n ?? 0;

  const dealSpend =
    (await db.get<{ total: number | null }>(
      `SELECT SUM(t.discount_minor) AS total FROM transactions t
        WHERE t.venue_id = $v AND t.deal_id IS NOT NULL AND t.status = 'committed'
          AND t.confirmed_at >= $f AND t.confirmed_at < $to`,
      { v: venueId, f: from, to },
    ))?.total ?? 0;

  const per = (spend: number, outcomes: number) =>
    outcomes > 0 ? Math.round(spend / outcomes) : null;

  return [
    {
      feature: 'loyalty',
      spendMinor: await spendOf('loyalty'),
      outcome: rewardsRedeemed,
      outcomeLabel: 'rewards redeemed',
      costPerOutcomeMinor: per(await spendOf('loyalty'), rewardsRedeemed),
    },
    {
      feature: 'vouchers',
      spendMinor: await spendOf('voucher'),
      outcome: vouchersRedeemed,
      outcomeLabel: 'vouchers redeemed',
      costPerOutcomeMinor: per(await spendOf('voucher'), vouchersRedeemed),
    },
    {
      feature: 'deals',
      spendMinor: dealSpend,
      outcome: dealClaims,
      outcomeLabel: 'claims',
      costPerOutcomeMinor: per(dealSpend, dealClaims),
    },
  ];
}

/* ══════════════════════════════════════════════ B9 cross-venue benchmarks ══ */

/**
 * Anonymised averages across venues in the same category and city.
 *
 * Two thresholds, not one: the min-*cohort* protects individual customers, and
 * the min-*venues* protects individual businesses. With four venues in a
 * category, a benchmark plus your own number is a calculator away from a
 * competitor's number.
 */
export async function computeBenchmarks(db: Db, window: Window = {}): Promise<number> {
  const at = window.at ?? now();
  const floor = await minVenues(db);
  const groups = await db.all<{ city: string; category: string; n: number }>(
    `SELECT city, category, COUNT(*) AS n FROM venues
      WHERE status = 'live' AND deleted_at IS NULL GROUP BY city, category`,
  );

  let written = 0;
  await db.tx(async () => {
    for (const group of groups) {
      if (group.n < floor) continue;
      const period = localMonth(at, 'Europe/Warsaw');
      const venues = await db.all<{ id: string }>(
        `SELECT id FROM venues WHERE city = $c AND category = $cat AND status = 'live'`,
        { c: group.city, cat: group.category },
      );

      const claimRates: number[] = [];
      const secondVisit: number[] = [];
      const costs: number[] = [];
      for (const venue of venues) {
        const f = await funnelRate(db, venue.id);
        if (f !== null) claimRates.push(f);
        const c = await cohorts(db, venue.id, 3, { at });
        const usable = c.filter((row) => !row.returned.suppressed && row.returned.value !== null);
        if (usable.length) {
          secondVisit.push(
            usable.reduce((sum, row) => sum + (row.returned.value ?? 0), 0) / usable.length,
          );
        }
        const cost = await costPerNewCustomer(db, venue.id, { at });
        if (!cost.costPerNewCustomerMinor.suppressed && cost.costPerNewCustomerMinor.value) {
          costs.push(cost.costPerNewCustomerMinor.value);
        }
      }

      const write = async (metric: string, values: number[]) => {
        if (values.length < floor) return;
        const value = values.reduce((a, b) => a + b, 0) / values.length;
        await db.run(
          `INSERT INTO benchmarks (id, period, city, category, metric, value, venue_count, computed_at)
           VALUES ($i, $p, $c, $cat, $m, $v, $n, $t)
             ON CONFLICT (period, city, category, metric)
             DO UPDATE SET value = excluded.value, venue_count = excluded.venue_count,
                           computed_at = excluded.computed_at`,
          {
            i: `bmk_${period}_${group.city}_${group.category}_${metric}`.replace(/\s+/g, '_'),
            p: period,
            c: group.city,
            cat: group.category,
            m: metric,
            v: value,
            n: values.length,
            t: at,
          },
        );
        written += 1;
      };

      await write('claim_rate', claimRates);
      await write('second_visit_rate', secondVisit);
      await write('cost_per_new_customer', costs);
    }
  });
  return written;
}

async function funnelRate(db: Db, venueId: string): Promise<number | null> {
  const row = await db.get<{ opened: number | null; claimed: number | null }>(
    `SELECT SUM(opened_count) AS opened, SUM(claimed_count) AS claimed FROM hot_deals WHERE venue_id = $v`,
    { v: venueId },
  );
  if (!row?.opened) return null;
  return (row.claimed ?? 0) / row.opened;
}

export const benchmarksFor = async (db: Db, city: string, category: string, at: Iso = now()) =>
  await db.all<{ metric: string; value: number; venue_count: number }>(
    `SELECT metric, value, venue_count FROM benchmarks
      WHERE city = $c AND category = $cat AND period = $p`,
    { c: city, cat: category, p: localMonth(at, 'Europe/Warsaw') },
  );

/* ═════════════════════════════════════════════════ the monthly summary (B9) ══ */

/**
 * The three strongest findings for a venue, in the order they deserve
 * attention.
 *
 * Ranked rather than listed: a monthly email with eleven findings is an email
 * nobody reads to the end, and the ones that matter are the ones that changed.
 */
export async function findings(db: Db, venueId: string, window: Window = {}) {
  const at = window.at ?? now();
  const out: Array<{ key: string; weight: number; detail: Record<string, unknown> }> = [];

  const view = await overview(db, venueId, { at });
  const map = await heatmap(db, venueId, { at });
  const cost = await costPerNewCustomer(db, venueId, { at });
  const retention = await cohorts(db, venueId, 3, { at });

  if (map.quietest && map.total > 0) {
    out.push({
      key: 'quiet_window',
      weight: 3,
      detail: { weekday: map.quietest.weekday, hour: map.quietest.hour, visits: map.quietest.visits },
    });
  }
  if (!cost.costPerNewCustomerMinor.suppressed) {
    out.push({ key: 'cost_per_new_customer', weight: 2, detail: cost });
  }
  const latest = retention.at(-1);
  if (latest && !latest.returned.suppressed) {
    out.push({ key: 'second_visit_rate', weight: 2, detail: latest });
  }
  if (view.newCustomers.value !== null) {
    out.push({ key: 'new_customers', weight: 1, detail: { value: view.newCustomers.value } });
  }

  return out.sort((a, b) => b.weight - a.weight).slice(0, 3);
}

/** B10. A venue's own aggregate data, as CSV. Never a row about one person. */
export async function exportCsv(db: Db, venueId: string, window: Window = {}): Promise<string> {
  const { from, to, period } = await rangeFor(db, venueId, window);
  const rows = await db.all<{ day: string; visits: number; customers: number; sales: number }>(
    `SELECT local_day AS day, COUNT(*) AS visits, COUNT(DISTINCT user_id) AS customers,
            SUM(amount_minor) AS sales
       FROM venue_visits
      WHERE venue_id = $v AND created_at >= $f AND created_at < $t
      GROUP BY local_day ORDER BY local_day`,
    { v: venueId, f: from, t: to },
  );
  const header = 'day,visits,customers,sales_minor';
  const body = rows.map((row) => `${row.day},${row.visits},${row.customers},${row.sales}`);
  return [`# venue ${venueId} · ${period}`, header, ...body].join('\n');
}

/** The mobile companion's "today" screen (§11.1). */
export async function today(db: Db, venueId: string, at: Iso = now()) {
  const venue = await getVenue(db, venueId);
  const day = localMonth(at, venue.timezone);
  const since = new Date(at);
  since.setUTCHours(0, 0, 0, 0);

  const rows = await db.all<{ user_id: string; amount_minor: number }>(
    `SELECT user_id, amount_minor FROM venue_visits WHERE venue_id = $v AND created_at >= $s`,
    { v: venueId, s: since.toISOString() },
  );
  return {
    period: day,
    customers: counted(new Set(rows.map((row) => row.user_id)).size),
    visits: counted(rows.length),
    salesMinor: counted(rows.reduce((sum, row) => sum + row.amount_minor, 0)),
    pendingConfirmations:
      (await db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM transactions WHERE venue_id = $v AND status = 'pending'`,
        { v: venueId },
      ))?.n ?? 0,
  };
}

/** Kept beside the metrics it bounds, so the floor is never a mystery. */
export const cohortFloor = async (db: Db) => ({
  minCohort: await minCohort(db),
  minVenues: await minVenues(db),
  configured: CONFIG.privacy,
});
