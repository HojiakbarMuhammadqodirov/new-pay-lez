/**
 * The partner dashboard's reports — the figures `#/dashboard` draws that no one
 * table answers — and the two levers on it that are not authoring: a reminder,
 * and a sale recorded at the counter.
 *
 * Everything here is a read of rows other modules wrote, with those two
 * exceptions, and each of them writes through the module that owns the row: a
 * reminder is `notifications.notify` once per recipient, a counter sale is the
 * gate's own four steps. Both leave one `audit.record`. Nothing in this file
 * grants a point, moves a pool or edits a count.
 *
 * Three rules run through it, and they are the house rules rather than new ones:
 *
 *   * **Days are the venue's.** A window is N venue-local calendar days ending
 *     today, cut at local midnight, and `venue_visits.local_day` is already
 *     written that way by the gate. A Kraków dashboard that bucketed by UTC
 *     would file the last two hours of every Friday under Saturday.
 *   * **A figure about people takes the floor; a count of events does not.**
 *     Visits, claims and redemptions are counted as they happened. "How many
 *     new customers" and "how many people a segment is" are findings about a
 *     group, and below the minimum cohort they are withheld as a *state* — the
 *     same `analytics.guarded` floor, never a second copy of it.
 *   * **Identity is a grant, and the grant is checked in SQL.** A name or an
 *     avatar leaves the database only through a
 *     `CASE WHEN EXISTS (… data_sharing_consents … revoked_at IS NULL)` in the
 *     query that reads it, so no row in this process ever carries a name the
 *     venue was not given — the construction `profiles.ts` uses, for the reason
 *     it gives: a filter applied after the read is a read.
 */
import { createHash } from 'node:crypto';
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import { foldUsername, isUsernameShaped } from './accounts.ts';
import { guarded, type Metric } from './analytics.ts';
import * as audit from './audit.ts';
import { copyFor } from './deals.ts';
import { DomainError } from './errors.ts';
import * as gate from './gate.ts';
import { newId } from './ids.ts';
import { notify } from './notifications.ts';
import { linksOf } from './partners.ts';
import { minCohort } from './settings.ts';
import {
  localDay,
  localMidnight,
  localMonth,
  monthStart,
  now,
  plusDays,
  prevPeriod,
  shiftDay,
  type Iso,
} from './time.ts';
import { tiersFor } from './vouchers.ts';
import { getVenue, type Venue } from './venues.ts';

/* ═══════════════════════════════════════════════════════════════ the window ══ */

/** The spans the dashboard's range picker offers. The route refuses anything else. */
export const WINDOW_DAYS = ['7', '14', '30', '90'] as const;

export interface DayWindow {
  days: number;
  /** The first and last venue-local day, both inclusive. */
  from: string;
  to: string;
  /** The same span as instants: local midnight of `from` up to local midnight after `to`. */
  start: Iso;
  end: Iso;
}

/**
 * The `days` venue-local days ending today, inclusive.
 *
 * Cut on calendar days rather than as `at − N × 24h`, because every figure on
 * the screen is drawn against a day label: a rolling 720 hours starts at
 * whatever minute the page was opened, and puts part of the first day's trade
 * under a date whose other part is missing.
 */
export function dayWindow(timezone: string, days: number, at: Iso): DayWindow {
  const to = localDay(at, timezone);
  const from = shiftDay(to, -(days - 1));
  return {
    days,
    from,
    to,
    start: localMidnight(from, timezone),
    end: localMidnight(shiftDay(to, 1), timezone),
  };
}

/** The same number of days immediately before a window — what "previous" compares against. */
export function windowBefore(window: DayWindow, timezone: string): DayWindow {
  const to = shiftDay(window.from, -1);
  const from = shiftDay(to, -(window.days - 1));
  return { days: window.days, from, to, start: localMidnight(from, timezone), end: window.start };
}

const daysOf = (window: DayWindow): string[] =>
  Array.from({ length: window.days }, (_, index) => shiftDay(window.from, index));

/**
 * The venue-local day of a stored instant, or null for one that does not parse.
 *
 * Null rather than a throw: the imported rows carry the old database's
 * timestamps, and one malformed value must cost its own bucket, not the whole
 * report — `Intl` throws a `RangeError` on an invalid date and would take the
 * response down with it.
 */
function dayOf(instant: string, timezone: string): string | null {
  return Number.isFinite(Date.parse(instant)) ? localDay(instant, timezone) : null;
}

/* ═══════════════════════════════════════════════════════ §2.1 the day series ══ */

export interface SeriesDay {
  day: string;
  visits: number;
  customers: number;
  salesMinor: number;
  claims: number;
  vouchersRedeemed: number;
  rewardsRedeemed: number;
}

export interface SeriesTotals {
  visits: number;
  /** Distinct over the whole window — not the sum of the days, which counts a regular once a day. */
  customers: number;
  /** First seen inside the window. **Null below the minimum cohort** — see `series`. */
  newCustomers: number | null;
  salesMinor: number;
  claims: number;
  vouchersRedeemed: number;
  rewardsRedeemed: number;
}

export interface SeriesResponse {
  days: number;
  from: string;
  to: string;
  timezone: string;
  currency: string;
  series: SeriesDay[];
  totals: SeriesTotals;
  previous: SeriesTotals;
}

/**
 * The window's days, and the same span before it.
 *
 * **Zero-filled, never gapped.** A `GROUP BY` returns only the days that have
 * rows, and a line drawn straight off that closes the gaps — a venue that
 * traded twice a week renders as a healthy curve. The window is laid out first
 * and the counts are filled into it, which is the rule `deals.claimSeries`
 * already follows for the deals table.
 *
 * **`newCustomers` takes the floor, and it has to.** `overview.newCustomers`
 * suppresses the same figure below the minimum cohort; a thirty-day window that
 * happens to be a calendar month would otherwise hand the withheld number back
 * a request later, which makes the floor on the overview a formality. It is
 * guarded on the window's distinct customers, exactly as the overview guards it.
 * Visits, customers and sales are the venue's own footfall and are not — the
 * overview does not suppress those either.
 *
 * One read per table across both windows rather than one per window: the
 * previous span is the same query shifted, and asking twice is two round trips
 * to Frankfurt for one screen.
 */
export async function series(db: Db, venueId: string, days: number, at: Iso = now()): Promise<SeriesResponse> {
  const venue = await getVenue(db, venueId);
  const timezone = venue.timezone;
  const current = dayWindow(timezone, days, at);
  const previous = windowBefore(current, timezone);
  const span = { v: venue.id, start: previous.start, end: current.end };

  const visits = await db.all<{ local_day: string; user_id: string; amount_minor: number }>(
    `SELECT local_day, user_id, amount_minor FROM venue_visits
      WHERE venue_id = $v AND local_day >= $from AND local_day <= $to`,
    { v: venue.id, from: previous.from, to: current.to },
  );
  const instants = async (sql: string): Promise<string[]> =>
    (await db.all<{ occurred_at: string }>(sql, span)).map((row) => row.occurred_at);

  /* Claims are the gate's (a deal event carrying a transaction), and the day is
     the one the claim landed on in the venue's clock. */
  const claims = await instants(
    `SELECT e.created_at AS occurred_at FROM deal_events e JOIN hot_deals d ON d.id = e.deal_id
      WHERE d.venue_id = $v AND e.event_type = 'claim'
        AND e.created_at >= $start AND e.created_at < $end`,
  );
  const vouchers = await instants(
    `SELECT redeemed_at AS occurred_at FROM issued_vouchers
      WHERE venue_id = $v AND status = 'redeemed' AND redeemed_at >= $start AND redeemed_at < $end`,
  );
  const rewards = await instants(
    `SELECT redeemed_at AS occurred_at FROM earned_rewards
      WHERE venue_id = $v AND status = 'redeemed' AND redeemed_at >= $start AND redeemed_at < $end`,
  );
  const firsts = await instants(
    `SELECT first_seen_at AS occurred_at FROM venue_customers
      WHERE venue_id = $v AND first_seen_at >= $start AND first_seen_at < $end`,
  );

  type Bucket = SeriesDay & { people: Set<string> };
  const buckets = new Map<string, Bucket>();
  for (const day of [...daysOf(previous), ...daysOf(current)]) {
    buckets.set(day, {
      day,
      visits: 0,
      customers: 0,
      salesMinor: 0,
      claims: 0,
      vouchersRedeemed: 0,
      rewardsRedeemed: 0,
      people: new Set(),
    });
  }
  for (const visit of visits) {
    const bucket = buckets.get(visit.local_day);
    if (!bucket) continue;
    bucket.visits += 1;
    bucket.salesMinor += visit.amount_minor;
    bucket.people.add(visit.user_id);
  }
  const tally = (list: string[], key: 'claims' | 'vouchersRedeemed' | 'rewardsRedeemed') => {
    for (const instant of list) {
      const day = dayOf(instant, timezone);
      const bucket = day ? buckets.get(day) : undefined;
      if (bucket) bucket[key] += 1;
    }
  };
  tally(claims, 'claims');
  tally(vouchers, 'vouchersRedeemed');
  tally(rewards, 'rewardsRedeemed');

  const floor = await minCohort(db);
  const totalsOf = (window: DayWindow): SeriesTotals => {
    const rows = daysOf(window).map((day) => buckets.get(day)!);
    const people = new Set<string>();
    for (const row of rows) for (const person of row.people) people.add(person);
    const add = (key: 'visits' | 'salesMinor' | 'claims' | 'vouchersRedeemed' | 'rewardsRedeemed') =>
      rows.reduce((total, row) => total + row[key], 0);
    const fresh = firsts.filter((instant) => instant >= window.start && instant < window.end).length;
    return {
      visits: add('visits'),
      customers: people.size,
      newCustomers: people.size < floor ? null : fresh,
      salesMinor: add('salesMinor'),
      claims: add('claims'),
      vouchersRedeemed: add('vouchersRedeemed'),
      rewardsRedeemed: add('rewardsRedeemed'),
    };
  };

  return {
    days,
    from: current.from,
    to: current.to,
    timezone,
    currency: venue.currency,
    series: daysOf(current).map((day) => {
      const { people, ...row } = buckets.get(day)!;
      return { ...row, customers: people.size };
    }),
    totals: totalsOf(current),
    previous: totalsOf(previous),
  };
}

/* ═══════════════════════════════════════════════════ §2.2 what we noticed ══ */

export interface TierReach {
  tierId: string;
  pct: number;
  points: number;
  eligible: number;
  reached: number;
  lower: number;
  more: number;
}

export interface DealSide {
  dealId: string;
  title: string;
  badge: string;
  claims: number;
  seen: number;
}

export interface InsightsResponse {
  period: string;
  trend: null | { visitsPct: number; vouchersPct: number };
  tierReach: TierReach | null;
  itemVsPercent: null | { item: DealSide; percent: DealSide; multiple: number };
  unusedRewards: null | { n: number; amountMinor: number };
}

/**
 * The three findings the overview prints under "What we noticed", each null
 * when it does not apply or cannot be said honestly.
 *
 * Null is the ordinary answer and the screen draws nothing for it. A finding is
 * only worth a sentence when the arithmetic behind it is sound, and every
 * branch below that returns null is a case where the sentence would be true of
 * the numbers and false of the venue.
 */
export async function insights(db: Db, venueId: string, at: Iso = now(), language = 'en'): Promise<InsightsResponse> {
  const venue = await getVenue(db, venueId);
  const period = localMonth(at, venue.timezone);
  return {
    period,
    trend: await trendOf(db, venue, period, at),
    tierReach: await tierReachOf(db, venue, at),
    itemVsPercent: await itemVsPercentOf(db, venue.id, language),
    unusedRewards: await unusedRewardsOf(db, venue.id),
  };
}

/**
 * Month to date against the same elapsed span of the month before.
 *
 * The same *span*, not the same count of calendar days: on the 1st at nine in
 * the morning, "today so far" against all of last month's 1st is a nine-hour
 * day against a whole one, and it prints a collapse that did not happen.
 *
 * Null when either previous figure is zero — a percentage change from nothing
 * is not a small number or a large one, it is not a number.
 */
async function trendOf(db: Db, venue: Venue, period: string, at: Iso) {
  const start = monthStart(period, venue.timezone);
  const previousStart = monthStart(prevPeriod(period), venue.timezone);
  const elapsed = Math.max(0, Date.parse(at) - Date.parse(start));
  const previousEnd = new Date(
    Math.min(Date.parse(start), Date.parse(previousStart) + elapsed),
  ).toISOString();

  const count = async (sql: string, from: Iso, to: Iso) =>
    (await db.get<{ n: number }>(sql, { v: venue.id, from, to }))?.n ?? 0;
  const VISITS = `SELECT COUNT(*) AS n FROM venue_visits
                   WHERE venue_id = $v AND created_at >= $from AND created_at < $to`;
  const VOUCHERS = `SELECT COUNT(*) AS n FROM issued_vouchers
                     WHERE venue_id = $v AND status = 'redeemed'
                       AND redeemed_at >= $from AND redeemed_at < $to`;

  /* `at` is the end of the current span, and a scan confirmed at `at` itself
     belongs to it — so the current span ends a millisecond later. */
  const through = new Date(Date.parse(at) + 1).toISOString();
  const visits = await count(VISITS, start, through);
  const previousVisits = await count(VISITS, previousStart, previousEnd);
  const vouchers = await count(VOUCHERS, start, through);
  const previousVouchers = await count(VOUCHERS, previousStart, previousEnd);
  if (previousVisits === 0 || previousVouchers === 0) return null;

  const pct = (current: number, before: number) => Math.round(((current - before) / before) * 100);
  return { visitsPct: pct(visits, previousVisits), vouchersPct: pct(vouchers, previousVouchers) };
}

/** Points steps a suggested tier cost is rounded to. */
const TIER_STEP = 50;

/**
 * "Only 4 customers reached the 15% tier because it needs 800 points. At 600,
 * 11 more of your regulars would have qualified."
 *
 * **Balances are read as counts and nothing else.** Each person's balance is
 * summed from the ledger *inside* the query — the derived balance, never the
 * cache — and the only rows that leave SQL are how many people sit at or above
 * a figure, and how many sit in each 50-point band below it. Nobody's balance
 * is ever a value in this process, and the whole finding is withheld below the
 * minimum cohort of recent customers, because "the one person who visited this
 * month has 790 points" is a description of a person.
 *
 * **Which lower cost, of the many that would qualify somebody.** The one that
 * buys the most customers per point taken off the price — so a cluster of ten
 * people just under 600 beats one person just under 800, which a "smallest
 * step that reaches anyone" rule would pick and print as "one more". Ties go to
 * the bigger group, then to the higher discount. A suggestion never undercuts
 * the next cheaper tier: a ladder whose 15% costs less than its 10% is not a
 * ladder, and advising it would be advice nobody could take.
 */
async function tierReachOf(db: Db, venue: Venue, at: Iso): Promise<TierReach | null> {
  const since = plusDays(at, -30);
  const recent = `SELECT DISTINCT v.user_id FROM venue_visits v JOIN users u ON u.id = v.user_id
                   WHERE v.venue_id = $v AND v.created_at > $since AND v.created_at <= $at
                     AND u.deleted_at IS NULL`;
  const people = { v: venue.id, since, at };

  const eligible =
    (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM (${recent}) r`, people))?.n ?? 0;
  if (eligible < (await minCohort(db))) return null;

  const balances = `SELECT l.user_id, SUM(l.delta) AS bal FROM points_ledger l
                     WHERE l.status = 'committed' AND l.user_id IN (${recent})
                     GROUP BY l.user_id`;

  const ladder = [...(await tiersFor(db, venue.id))].sort((a, b) => a.points_cost - b.points_cost);
  let best: (TierReach & { cut: number }) | null = null;

  for (const [index, tier] of ladder.entries()) {
    const points = tier.points_cost;
    const reached =
      (await db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM (${balances}) b WHERE b.bal >= $p`,
        { ...people, p: points },
      ))?.n ?? 0;
    const bands = await db.all<{ band: number; n: number }>(
      `SELECT b.bal / ${TIER_STEP} AS band, COUNT(*) AS n FROM (${balances}) b
        WHERE b.bal >= ${TIER_STEP} AND b.bal < $p
        GROUP BY b.bal / ${TIER_STEP}`,
      { ...people, p: points },
    );
    const inBand = new Map(bands.map((row) => [Number(row.band) * TIER_STEP, row.n]));
    const cheaper = index > 0 ? ladder[index - 1].points_cost : 0;

    let more = 0;
    for (
      let lower = Math.floor((points - 1) / TIER_STEP) * TIER_STEP;
      lower >= TIER_STEP && lower > cheaper;
      lower -= TIER_STEP
    ) {
      more += inBand.get(lower) ?? 0;
      if (more === 0) continue;
      const candidate = {
        tierId: tier.id,
        pct: tier.discount_pct,
        points,
        eligible,
        reached,
        lower,
        more,
        cut: points - lower,
      };
      /* Customers per point, compared as a cross product so two equal rates
         are equal rather than a floating-point coin toss. */
      const better =
        !best ||
        candidate.more * best.cut > best.more * candidate.cut ||
        (candidate.more * best.cut === best.more * candidate.cut &&
          (candidate.more > best.more ||
            (candidate.more === best.more && candidate.pct > best.pct)));
      if (better) best = candidate;
    }
  }

  if (!best) return null;
  const { cut: _cut, ...finding } = best;
  void _cut;
  return finding;
}

/** Impressions before a claim rate is a rate rather than an anecdote. */
const MIN_SEEN = 20;
const PERCENT_BADGE = /\d+\s*%/;

/**
 * Free-item deals against percentage discounts, on this venue's own funnel.
 *
 * The class is read off the badge an owner typed — "20%" is a percentage,
 * "2 for 1" or "free coffee" is an item — because that is the only place the
 * distinction is recorded, and an empty badge is neither. Each side is its best
 * deal by claims per impression among those seen at least `MIN_SEEN` times.
 *
 * Null when either side is missing, or when the percentage side's rate is zero:
 * "infinitely better" is not a multiple a sentence can carry.
 */
async function itemVsPercentOf(db: Db, venueId: string, language: string) {
  const rows = await db.all<{ id: string; discount_text: string | null; seen_count: number; claimed_count: number }>(
    `SELECT id, discount_text, seen_count, claimed_count FROM hot_deals
      WHERE venue_id = $v AND seen_count >= $min
      ORDER BY created_at`,
    { v: venueId, min: MIN_SEEN },
  );

  type Pick = { id: string; badge: string; claims: number; seen: number };
  const best: { item?: Pick; percent?: Pick } = {};
  for (const row of rows) {
    const badge = (row.discount_text ?? '').trim();
    if (!badge) continue;
    const side = PERCENT_BADGE.test(badge) ? 'percent' : 'item';
    const pick = { id: row.id, badge, claims: row.claimed_count, seen: row.seen_count };
    const held = best[side];
    const beats =
      !held ||
      pick.claims * held.seen > held.claims * pick.seen ||
      (pick.claims * held.seen === held.claims * pick.seen && pick.seen > held.seen);
    if (beats) best[side] = pick;
  }

  const { item, percent } = best;
  if (!item || !percent || percent.claims === 0) return null;

  const sideOf = async (pick: Pick): Promise<DealSide> => ({
    dealId: pick.id,
    title: (await copyFor(db, pick.id, language))?.title ?? pick.badge,
    badge: pick.badge,
    claims: pick.claims,
    seen: pick.seen,
  });
  const multiple = (item.claims / item.seen) / (percent.claims / percent.seen);
  return {
    item: await sideOf(item),
    percent: await sideOf(percent),
    multiple: Math.round(multiple * 10) / 10,
  };
}

/** Rewards customers have earned here and not collected, and the money they hold. */
async function unusedRewardsOf(db: Db, venueId: string) {
  const row = await db.get<{ n: number; total: number | null }>(
    `SELECT COUNT(*) AS n, SUM(reserved_minor) AS total FROM earned_rewards
      WHERE venue_id = $v AND status = 'available'`,
    { v: venueId },
  );
  const n = row?.n ?? 0;
  return n > 0 ? { n, amountMinor: row?.total ?? 0 } : null;
}

/* ════════════════════════════════════════════════════════ §2.3 reminders ══ */

/** One reminder per venue per this many days. The audit row is the record. */
export const REMIND_EVERY_DAYS = 7;
/** How long after a reminder a visit still counts as having answered it. */
export const CAME_BACK_DAYS = 7;

export interface RemindStatus {
  rewardHolders: number;
  voucherHolders: number;
  audience: number;
  lastSentAt: string | null;
  nextAllowedAt: string | null;
  lastResult: null | { sentAt: string; audience: number; cameBack: number; windowDays: number };
}

export interface RemindSent {
  sentAt: string;
  audience: number;
  /** Every recipient: the inbox copy is written for all of them. */
  inbox: number;
  /** Of those, how many are also queued for a push. */
  queued: number;
  /** Of those, how many get the inbox copy only — no token, quiet hours, or the platform cap. */
  suppressed: number;
  nextAllowedAt: string;
}

/**
 * Who holds something unused here: a reward or a voucher still good at `at`,
 * on an account that can still be written to.
 *
 * Banned and erased accounts are left out of both the count and the send,
 * because a count the send disagrees with is a figure the screen cannot defend.
 */
const HOLDERS = `
  SELECT h.user_id, u.language FROM (
    SELECT r.user_id FROM earned_rewards r
     WHERE r.venue_id = $v AND r.status = 'available' AND r.expires_at > $at
    UNION
    SELECT i.user_id FROM issued_vouchers i
     WHERE i.venue_id = $v AND i.status = 'active' AND i.expires_at > $at
  ) h
  JOIN users u ON u.id = h.user_id
  WHERE u.deleted_at IS NULL AND u.status NOT IN ('banned', 'erased')`;

async function lastReminder(db: Db, venueId: string) {
  const row = await db.get<{ entity_id: string | null; after: string | null; created_at: string }>(
    `SELECT entity_id, after, created_at FROM audit_log
      WHERE venue_id = $v AND action = 'venue.remind'
      ORDER BY created_at DESC LIMIT 1`,
    { v: venueId },
  );
  if (!row) return null;
  let audience = 0;
  try {
    audience = Number((JSON.parse(row.after ?? '{}') as { audience?: unknown }).audience) || 0;
  } catch {
    /* An unreadable `after` is an old or hand-written row; the send still happened. */
  }
  return { id: row.entity_id, sentAt: row.created_at, audience };
}

/**
 * Where a reminder stands: who it would reach today, and what the last one did.
 *
 * `cameBack` is recipients who then visited within `CAME_BACK_DAYS` — counted
 * from the inbox rows the send wrote, which is what ties "who was reminded" to
 * "who came in" without a table for it. An erased recipient's inbox row goes
 * with them, so they leave the count too; a figure about a person who asked to
 * be forgotten is the one this should lose.
 */
export async function remindStatus(db: Db, venueId: string, at: Iso = now()): Promise<RemindStatus> {
  const bind = { v: venueId, at };
  const count = async (sql: string) => (await db.get<{ n: number }>(sql, bind))?.n ?? 0;

  const rewardHolders = await count(
    `SELECT COUNT(DISTINCT r.user_id) AS n FROM earned_rewards r JOIN users u ON u.id = r.user_id
      WHERE r.venue_id = $v AND r.status = 'available' AND r.expires_at > $at
        AND u.deleted_at IS NULL AND u.status NOT IN ('banned', 'erased')`,
  );
  const voucherHolders = await count(
    `SELECT COUNT(DISTINCT i.user_id) AS n FROM issued_vouchers i JOIN users u ON u.id = i.user_id
      WHERE i.venue_id = $v AND i.status = 'active' AND i.expires_at > $at
        AND u.deleted_at IS NULL AND u.status NOT IN ('banned', 'erased')`,
  );
  const audience = await count(`SELECT COUNT(*) AS n FROM (${HOLDERS}) a`);

  const last = await lastReminder(db, venueId);
  const next = last ? plusDays(last.sentAt, REMIND_EVERY_DAYS) : null;

  let lastResult: RemindStatus['lastResult'] = null;
  if (last) {
    const cameBack = last.id
      ? (await db.get<{ n: number }>(
          `SELECT COUNT(DISTINCT n.user_id) AS n FROM notifications n
            WHERE n.source_kind = 'venue_reminder' AND n.source_ref = $r
              AND EXISTS (SELECT 1 FROM venue_visits vv
                           WHERE vv.user_id = n.user_id AND vv.venue_id = $v
                             AND vv.created_at > $sent AND vv.created_at <= $until)`,
          { r: last.id, v: venueId, sent: last.sentAt, until: plusDays(last.sentAt, CAME_BACK_DAYS) },
        ))?.n ?? 0
      : 0;
    lastResult = { sentAt: last.sentAt, audience: last.audience, cameBack, windowDays: CAME_BACK_DAYS };
  }

  return {
    rewardHolders,
    voucherHolders,
    audience,
    lastSentAt: last?.sentAt ?? null,
    nextAllowedAt: next && next > at ? next : null,
    lastResult,
  };
}

/** The reminder, in the recipient's own language. Five, because the app has five. */
const REMINDER_COPY: Record<string, (venue: string) => { title: string; body: string }> = {
  en: (venue) => ({
    title: `${venue}: your reward is waiting`,
    body: 'You have an unused reward or voucher here. Drop in and use it before it expires.',
  }),
  pl: (venue) => ({
    title: `${venue}: Twoja nagroda czeka`,
    body: 'Masz tu niewykorzystaną nagrodę lub voucher. Wpadnij i wykorzystaj go, zanim wygaśnie.',
  }),
  ru: (venue) => ({
    title: `${venue}: ваша награда ждёт`,
    body: 'У вас здесь есть неиспользованная награда или ваучер. Зайдите и воспользуйтесь им, пока не истёк срок.',
  }),
  uk: (venue) => ({
    title: `${venue}: ваша нагорода чекає`,
    body: 'У вас тут є невикористана нагорода або ваучер. Завітайте й скористайтеся ним, поки не сплив термін.',
  }),
  uz: (venue) => ({
    title: `${venue}: mukofotingiz kutmoqda`,
    body: 'Bu yerda foydalanilmagan mukofot yoki vaucheringiz bor. Muddati tugashidan oldin kelib foydalaning.',
  }),
};

/**
 * Remind everybody holding something unused here, once a week at most.
 *
 * **One `notify` per person**, never a bulk insert, because `notify` is where
 * the platform's rules live: permission, preference, quiet hours in *this*
 * venue's clock, and the frequency cap across every venue on the platform. A
 * reminder that went round them would be the venue that taught a customer to
 * turn push off for everybody.
 *
 * **The audit row is the rate limit.** Nothing else records that a reminder was
 * sent, so the check and the record are the same row and cannot disagree. The
 * venue row is touched first inside the transaction: a no-op on SQLite, whose
 * transactions already queue, and a row lock on Postgres, so two presses that
 * race each other queue there too — the second then reads the first one's audit
 * row and is refused rather than sending the week's reminder twice.
 */
export async function sendReminder(
  db: Db,
  input: { venueId: string; actorId: string; at?: Iso },
): Promise<RemindSent> {
  const at = input.at ?? now();
  return db.tx(async () => {
    await db.run(`UPDATE venues SET updated_at = updated_at WHERE id = $v`, { v: input.venueId });

    const last = await lastReminder(db, input.venueId);
    if (last) {
      const nextAllowedAt = plusDays(last.sentAt, REMIND_EVERY_DAYS);
      if (nextAllowedAt > at) {
        throw new DomainError('conflict', 'a reminder already went out this week', { nextAllowedAt });
      }
    }

    const venue = await getVenue(db, input.venueId);
    const recipients = await db.all<{ user_id: string; language: string }>(
      `${HOLDERS} ORDER BY h.user_id`,
      { v: venue.id, at },
    );
    if (recipients.length === 0) {
      /* `invalid_state` is a 400 in the closed table in `errors.ts`, like every
         other refusal with that code; `reason` is what a client branches on. */
      throw new DomainError('invalid_state', 'nobody to remind', { reason: 'no_audience' });
    }

    const id = newId('rmd');
    let queued = 0;
    let suppressed = 0;
    for (const person of recipients) {
      const language = REMINDER_COPY[person.language] ? person.language : 'en';
      const copy = REMINDER_COPY[language](venue.name);
      const delivery = await notify(db, {
        userId: person.user_id,
        kind: 'venue_reminder',
        title: copy.title,
        body: copy.body,
        language,
        push: true,
        venueId: venue.id,
        sourceKind: 'venue_reminder',
        sourceRef: id,
        at,
      });
      if (delivery.delivery === 'queued') queued += 1;
      else if (delivery.delivery === 'suppressed') suppressed += 1;
    }

    await audit.record(db, {
      actorId: input.actorId,
      action: 'venue.remind',
      entity: 'venue_reminder',
      entityId: id,
      venueId: venue.id,
      after: { audience: recipients.length, queued, suppressed },
      at,
    });

    return {
      sentAt: at,
      audience: recipients.length,
      inbox: recipients.length,
      queued,
      suppressed,
      nextAllowedAt: plusDays(at, REMIND_EVERY_DAYS),
    };
  });
}

/* ═══════════════════════════════════════════════════════ §2.6 the till log ══ */

export const SCAN_SEGMENTS = ['all', 'first', 'again'] as const;
export type ScanSegment = (typeof SCAN_SEGMENTS)[number];

export interface ScanRow {
  id: string;
  at: string;
  who: string | null;
  avatar: string | null;
  first: boolean;
  counted: boolean;
  intent: 'earn' | 'voucher_redeem' | 'reward_redeem';
  spentMinor: number;
  discountMinor: number;
  points: number;
  receipt: string;
  site: { venueId: string; name: string; address: string | null; lat: number | null; lng: number | null };
  progress: null | {
    campaignId: string;
    campaign: string;
    done: number;
    need: number;
    rewardEarned: boolean;
  };
}

export interface ScansResponse {
  days: number;
  segment: ScanSegment;
  total: number;
  firstCount: number;
  againCount: number;
  currency: string;
  timezone: string;
  rows: ScanRow[];
}

/** The same alphabet a voucher code uses, for the same reason: somebody reads it out. */
const RECEIPT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * A short receipt mark, derived from the transaction id.
 *
 * Derived rather than stored, so it needs no column and is the same on every
 * read; four characters of a 32-letter alphabet from a hash, which is enough to
 * find a row on a screen of fifty and deliberately not enough to be an id.
 */
export function receiptOf(transactionId: string): string {
  const digest = createHash('sha256').update(transactionId).digest();
  let mark = '#';
  for (let index = 0; index < 4; index += 1) mark += RECEIPT_ALPHABET[digest[index] % RECEIPT_ALPHABET.length];
  return mark;
}

/**
 * The shape of one row, as SQL. Identity is decided *here*: `who` and `avatar`
 * are the display name and photo only when an unrevoked grant for this venue
 * exists, and null otherwise — never read and then dropped.
 *
 * `is_first` is "this transaction's visit is the earliest visit this person has
 * here", which is the definition the till cares about: a scan that did not
 * count as a visit (a second one that day, a bill under the minimum) is never
 * anybody's first.
 */
const SCAN_BASE = `
  SELECT t.id, t.user_id, t.confirmed_at, t.intent, t.amount_minor, t.discount_minor,
         t.points_granted,
         CASE WHEN u.deleted_at IS NULL AND EXISTS (
                SELECT 1 FROM data_sharing_consents d
                 WHERE d.user_id = t.user_id AND d.venue_id = t.venue_id AND d.revoked_at IS NULL)
              THEN u.display_name ELSE NULL END AS who,
         CASE WHEN u.deleted_at IS NULL AND EXISTS (
                SELECT 1 FROM data_sharing_consents d
                 WHERE d.user_id = t.user_id AND d.venue_id = t.venue_id AND d.revoked_at IS NULL)
              THEN u.display_avatar ELSE NULL END AS avatar,
         vv.created_at AS visit_at,
         CASE WHEN vv.id IS NULL THEN 0 ELSE 1 END AS is_counted,
         CASE WHEN vv.id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM venue_visits p
                 WHERE p.user_id = t.user_id AND p.venue_id = t.venue_id
                   AND p.created_at < vv.created_at)
              THEN 1 ELSE 0 END AS is_first
    FROM transactions t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN venue_visits vv ON vv.transaction_id = t.id AND vv.venue_id = t.venue_id
   WHERE t.venue_id = $v AND t.status = 'committed'
     AND t.confirmed_at >= $start AND t.confirmed_at < $end`;

/** A fixed clause per segment, never an interpolated value. */
const SEGMENT_FILTER: Record<ScanSegment, string> = {
  all: '',
  first: 'WHERE s.is_first = 1',
  again: 'WHERE s.is_first = 0',
};

interface ScanSqlRow {
  id: string;
  user_id: string;
  confirmed_at: string;
  intent: ScanRow['intent'];
  amount_minor: number | null;
  discount_minor: number;
  points_granted: number;
  who: string | null;
  avatar: string | null;
  visit_at: string | null;
  is_counted: number;
  is_first: number;
}

/**
 * The till log: committed transactions confirmed inside the window, newest first.
 *
 * The counts are over the whole window before paging, so a screen can print
 * "84 scans · 12 first visits" above a page of fifty.
 */
export async function scans(
  db: Db,
  venueId: string,
  query: { days: number; segment: ScanSegment; limit: number; offset: number; at?: Iso },
): Promise<ScansResponse> {
  const at = query.at ?? now();
  const venue = await getVenue(db, venueId);
  const window = dayWindow(venue.timezone, query.days, at);
  const bind = { v: venue.id, start: window.start, end: window.end };

  const counts = await db.get<{ total: number; firsts: number | null }>(
    `SELECT COUNT(*) AS total, SUM(s.is_first) AS firsts FROM (${SCAN_BASE}) s`,
    bind,
  );
  const total = counts?.total ?? 0;
  const firstCount = counts?.firsts ?? 0;

  const page = await db.all<ScanSqlRow>(
    `SELECT s.* FROM (${SCAN_BASE}) s ${SEGMENT_FILTER[query.segment]}
      ORDER BY s.confirmed_at DESC, s.id DESC
      LIMIT $lim OFFSET $off`,
    { ...bind, lim: query.limit, off: query.offset },
  );

  const site = {
    venueId: venue.id,
    name: venue.name,
    address: venue.address,
    lat: venue.lat,
    lng: venue.lng,
  };

  const rows: ScanRow[] = [];
  for (const row of page) {
    rows.push({
      id: row.id,
      at: row.confirmed_at,
      who: row.who,
      avatar: row.avatar,
      first: row.is_first === 1,
      counted: row.is_counted === 1,
      intent: row.intent,
      spentMinor: row.amount_minor ?? 0,
      discountMinor: row.discount_minor,
      points: row.points_granted,
      receipt: receiptOf(row.id),
      site,
      progress: row.visit_at ? await progressOf(db, venue, row, row.visit_at) : null,
    });
  }

  return {
    days: query.days,
    segment: query.segment,
    total,
    firstCount,
    againCount: total - firstCount,
    currency: venue.currency,
    timezone: venue.timezone,
    rows,
  };
}

interface CampaignForProgress {
  id: string;
  name: string;
  visits_required: number;
  recurring: number;
  min_spend_minor: number | null;
  created_at: string;
}

/**
 * Where the stamp card this visit went on stood right after it.
 *
 * Reconstructed rather than stored, because a card only keeps its current
 * count: the qualifying counted visits since the card was started, up to and
 * including this one, wrapped the way a recurring card wraps.
 *
 * Which card: the one this visit **paid out**, when it paid one, because that
 * is the card the visit was spent on, and naming a higher-priority card beside
 * "reward earned" would credit the wrong one. Otherwise the highest-priority
 * active campaign the bill qualified for that the customer had a card on by then.
 *
 * "Paid out" is a reward earned by this customer, here, **at this visit's
 * instant** — not "a reward whose `transaction_id` is this transaction". That
 * column is written twice: `grantReward` sets it to the visit that earned the
 * reward and `redeemReward` overwrites it with the visit that spent it, so after
 * a redemption it points at the wrong visit for this question. The gate stamps
 * the reward and the visit with the same `at`, and one visit pays at most one
 * reward, so the instant is exact.
 */
async function progressOf(
  db: Db,
  venue: Venue,
  row: ScanSqlRow,
  visitAt: string,
): Promise<ScanRow['progress']> {
  const earned = await db.get<CampaignForProgress>(
    `SELECT c.id, c.name, c.visits_required, c.recurring, c.min_spend_minor, c.created_at
       FROM earned_rewards r JOIN campaigns c ON c.id = r.campaign_id
      WHERE r.user_id = $u AND r.venue_id = $v AND r.earned_at = $at
      ORDER BY r.id LIMIT 1`,
    { u: row.user_id, v: venue.id, at: visitAt },
  );
  const candidates = earned
    ? [earned]
    : await db.all<CampaignForProgress>(
        `SELECT id, name, visits_required, recurring, min_spend_minor, created_at FROM campaigns
          WHERE venue_id = $v AND status = 'active'
          ORDER BY priority DESC, visits_required ASC`,
        { v: venue.id },
      );

  const bill = row.amount_minor ?? 0;
  for (const campaign of candidates) {
    const minSpend = campaign.min_spend_minor ?? venue.min_spend_minor;
    if (!earned && bill < minSpend) continue;

    const card = await db.get<{ joined_at: string }>(
      `SELECT joined_at FROM stamp_cards WHERE user_id = $u AND campaign_id = $c`,
      { u: row.user_id, c: campaign.id },
    );
    if (!card || card.joined_at > visitAt) continue;

    const qualifying =
      (await db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM venue_visits
          WHERE user_id = $u AND venue_id = $v AND amount_minor >= $min
            AND created_at >= $joined AND created_at <= $visit`,
        { u: row.user_id, v: venue.id, min: minSpend, joined: card.joined_at, visit: visitAt },
      ))?.n ?? 0;
    if (qualifying === 0) continue;

    const need = campaign.visits_required;
    const done = campaign.recurring ? ((qualifying - 1) % need) + 1 : Math.min(qualifying, need);
    return {
      campaignId: campaign.id,
      campaign: campaign.name,
      done,
      need,
      rewardEarned: Boolean(earned),
    };
  }
  return null;
}

/* ════════════════════════════════════════════════════════ §2.8 audiences ══ */

export const AUDIENCE_SEGMENTS = ['all', 'new', 'returning', 'lapsed', 'newcomer'] as const;
export type AudienceSegment = (typeof AUDIENCE_SEGMENTS)[number];

export interface Audience {
  segment: AudienceSegment;
  reach: Metric;
  notifiable: Metric;
}

/**
 * How many people each targeting segment is today, and how many of them a push
 * could reach.
 *
 * The definitions are **`deals.segmentsFor`'s, restricted to who can see the
 * deal**, because a figure beside a targeting checkbox that counted a different
 * set from the one the targeting admits is a figure about nothing. A deal is
 * listed to readers in its venue's city, so:
 *
 *   * `new` — accounts in the city with no visit here;
 *   * `returning` / `lapsed` — this venue's customers, split at
 *     `CONFIG.deals.lapsedDays` since their last visit;
 *   * `newcomer` — accounts in the city younger than `newcomerDays`, which is
 *     what `segmentsFor` means by it (account age, never origin);
 *   * `all` — the city's accounts and this venue's customers together.
 *
 * Both figures are about people and both take the floor.
 */
export async function audiences(db: Db, venueId: string, at: Iso = now()): Promise<Audience[]> {
  const venue = await getVenue(db, venueId);
  const lapsedSince = plusDays(at, -CONFIG.deals.lapsedDays);
  const newcomerSince = plusDays(at, -CONFIG.deals.newcomerDays);

  const segments: Record<AudienceSegment, { where: string; bind: Record<string, string> }> = {
    all: { where: '(u.city = $city OR vc.visits > 0)', bind: { city: venue.city } },
    new: { where: 'u.city = $city AND (vc.user_id IS NULL OR vc.visits = 0)', bind: { city: venue.city } },
    returning: { where: 'vc.visits > 0 AND vc.last_seen_at >= $lapsed', bind: { lapsed: lapsedSince } },
    lapsed: { where: 'vc.visits > 0 AND vc.last_seen_at < $lapsed', bind: { lapsed: lapsedSince } },
    newcomer: {
      where: 'u.city = $city AND u.created_at >= $newcomer',
      bind: { city: venue.city, newcomer: newcomerSince },
    },
  };

  const out: Audience[] = [];
  for (const segment of AUDIENCE_SEGMENTS) {
    const { where, bind } = segments[segment];
    const row = await db.get<{ reach: number; notifiable: number | null }>(
      `SELECT COUNT(*) AS reach,
              SUM(CASE WHEN EXISTS (SELECT 1 FROM push_tokens p
                                     WHERE p.user_id = u.id AND p.revoked_at IS NULL)
                       THEN 1 ELSE 0 END) AS notifiable
         FROM users u
         LEFT JOIN venue_customers vc ON vc.user_id = u.id AND vc.venue_id = $v
        WHERE u.status = 'active' AND u.deleted_at IS NULL AND ${where}`,
      { v: venue.id, ...bind },
    );
    const reach = row?.reach ?? 0;
    const notifiable = row?.notifiable ?? 0;
    out.push({
      segment,
      reach: await guarded(db, reach, reach),
      notifiable: await guarded(db, notifiable, notifiable),
    });
  }
  return out;
}

/* ═══════════════════════════════════════════════════════ §2.9 the listing ══ */

export interface ListingResponse {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  city: string | null;
  countryCode: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  timezone: string;
  currency: string;
  priceRange: string | null;
  phone: string | null;
  email: string | null;
  imageUrl: string | null;
  status: string;
  verifiedAt: string | null;
  acceptsVouchers: boolean;
  description: Record<string, string>;
  links: Array<{ kind: string; value: string }>;
  languages: string[];
  hours: Array<{ weekday: number; opensMin: number | null; closesMin: number | null; closed: boolean }>;
  verification: null | { status: 'pending' | 'approved' | 'rejected'; submittedAt: string; note: string | null };
  createdAt: string;
  updatedAt: string;
}

/**
 * The venue as its owner edits it — the row, and the four tables around it
 * that the row does not carry.
 *
 * One read for the profile screen, because the listing form is one form: a
 * client that assembled it from the venue row, the links route, the hours and
 * a translation lookup would render three of the four and leave the fourth
 * blank the first time one of them failed.
 */
export async function listing(db: Db, venueId: string): Promise<ListingResponse> {
  const venue = await getVenue(db, venueId);

  const description: Record<string, string> = {};
  for (const row of await db.all<{ language: string; value: string }>(
    `SELECT language, value FROM translations
      WHERE entity = 'venue' AND entity_id = $v AND field = 'description'
      ORDER BY language`,
    { v: venue.id },
  )) {
    description[row.language] = row.value;
  }

  const languages = (
    await db.all<{ language: string }>(
      `SELECT language FROM venue_languages WHERE venue_id = $v ORDER BY language`,
      { v: venue.id },
    )
  ).map((row) => row.language);

  const hours = (
    await db.all<{ weekday: number; opens_min: number | null; closes_min: number | null; closed: number }>(
      `SELECT weekday, opens_min, closes_min, closed FROM venue_hours WHERE venue_id = $v ORDER BY weekday`,
      { v: venue.id },
    )
  ).map((row) => ({
    weekday: row.weekday,
    opensMin: row.opens_min,
    closesMin: row.closes_min,
    closed: row.closed === 1,
  }));

  const record = await db.get<{ status: 'pending' | 'approved' | 'rejected'; submitted_at: string; note: string | null }>(
    `SELECT status, submitted_at, note FROM verification_records
      WHERE venue_id = $v ORDER BY submitted_at DESC LIMIT 1`,
    { v: venue.id },
  );

  return {
    id: venue.id,
    name: venue.name,
    category: venue.category,
    subcategory: venue.subcategory,
    city: venue.city,
    countryCode: venue.country_code,
    address: venue.address,
    lat: venue.lat,
    lng: venue.lng,
    timezone: venue.timezone,
    currency: venue.currency,
    priceRange: venue.price_range,
    phone: venue.phone,
    email: venue.email,
    imageUrl: venue.image_url,
    status: venue.status,
    verifiedAt: venue.verified_at,
    acceptsVouchers: venue.accepts_vouchers === 1,
    description,
    links: await linksOf(db, venue.id),
    languages,
    hours,
    verification: record
      ? { status: record.status, submittedAt: record.submitted_at, note: record.note }
      : null,
    createdAt: venue.created_at,
    updatedAt: venue.updated_at,
  };
}

/* ═══════════════════════════════════════════════════════ §2.11 the counter ══ */

export interface CounterCustomer {
  userId: string;
  handle: string | null;
  name: string | null;
  avatar: string | null;
  firstVisit: boolean;
  stamps: Array<{ campaignId: string; campaign: string; done: number; need: number }>;
}

export type CounterLookup =
  | { kind: 'customer'; customer: CounterCustomer }
  | {
      kind: 'voucher';
      customer: CounterCustomer;
      voucher: { id: string; code: string; discountPct: number; maxDiscountMinor: number; expiresAt: string };
    }
  | {
      kind: 'reward';
      customer: CounterCustomer;
      reward: { id: string; code: string; label: string; costMinor: number; expiresAt: string };
    };

export interface CounterResult {
  lookup: CounterLookup;
  receipt: {
    transactionId: string;
    amountMinor: number;
    currency: string;
    pointsGranted: number;
    discountMinor: number;
    stamped: boolean;
    visitCounted: boolean;
    rewardEarned: { label: string; code: string } | null;
  };
}

/** An account the counter may act for: not banned, not erased, not deleted. */
const WRITABLE = `u.deleted_at IS NULL AND u.status NOT IN ('banned', 'erased')`;

/**
 * One refusal for every miss, and the sameness is the point: "that code exists
 * but at another venue" and "that voucher was used yesterday" are both facts
 * about somebody else's wallet, and a till is not where a stranger learns them.
 */
const noMatch = () =>
  new DomainError('not_found', 'no customer, voucher or reward here matches that code');

/**
 * Who a code at the till belongs to, and what it is.
 *
 * **A leading `@` is a handle and nothing else.** Without one, a string shaped
 * like a handle is tried as one first and then **falls through to the codes**,
 * because the codes are handle-shaped too once folded: a reward code is six
 * characters of `A–Z2–9`, which lower-cases into a perfectly good username. A
 * rule that stopped at "looks like a username" would make every reward code at
 * the counter a 404. A voucher code (`PLZ-…`) carries a hyphen no handle can,
 * so it goes straight to the codes.
 *
 * Codes are matched at **this** venue only, and only while they can still be
 * spent — active or available, and not past their date.
 */
export async function counterLookup(db: Db, venueId: string, code: string, at: Iso = now()): Promise<CounterLookup> {
  const venue = await getVenue(db, venueId);
  const typed = code.trim();
  if (!typed) throw noMatch();

  const handle = typed.startsWith('@') ? typed.slice(1) : null;
  const folded = foldUsername(handle ?? typed);
  if (handle !== null || isUsernameShaped(folded)) {
    const user = await db.get<{ id: string }>(
      `SELECT u.id FROM users u WHERE u.username_norm = $n AND ${WRITABLE}`,
      { n: folded },
    );
    if (user) return { kind: 'customer', customer: await counterCustomer(db, venue, user.id) };
    if (handle !== null) throw noMatch();
  }

  const upper = typed.toUpperCase();
  const voucher = await db.get<{
    id: string;
    user_id: string;
    code: string;
    discount_pct: number;
    max_discount_minor: number;
    expires_at: string;
  }>(
    `SELECT i.id, i.user_id, i.code, i.discount_pct, i.max_discount_minor, i.expires_at
       FROM issued_vouchers i JOIN users u ON u.id = i.user_id
      WHERE i.venue_id = $v AND UPPER(i.code) = $c AND i.status = 'active' AND i.expires_at > $at
        AND ${WRITABLE}`,
    { v: venue.id, c: upper, at },
  );
  if (voucher) {
    return {
      kind: 'voucher',
      customer: await counterCustomer(db, venue, voucher.user_id),
      voucher: {
        id: voucher.id,
        code: voucher.code,
        discountPct: voucher.discount_pct,
        maxDiscountMinor: voucher.max_discount_minor,
        expiresAt: voucher.expires_at,
      },
    };
  }

  const reward = await db.get<{
    id: string;
    user_id: string;
    code: string;
    label: string;
    cost_minor: number;
    expires_at: string;
  }>(
    `SELECT r.id, r.user_id, r.code, r.label, r.cost_minor, r.expires_at
       FROM earned_rewards r JOIN users u ON u.id = r.user_id
      WHERE r.venue_id = $v AND UPPER(r.code) = $c AND r.status = 'available' AND r.expires_at > $at
        AND ${WRITABLE}`,
    { v: venue.id, c: upper, at },
  );
  if (reward) {
    return {
      kind: 'reward',
      customer: await counterCustomer(db, venue, reward.user_id),
      reward: {
        id: reward.id,
        code: reward.code,
        label: reward.label,
        costMinor: reward.cost_minor,
        expiresAt: reward.expires_at,
      },
    };
  }

  throw noMatch();
}

/**
 * The customer card the counter shows before anybody types a bill.
 *
 * The handle is always there — the customer read it out — and the name and
 * photo only with a grant, decided in the query. The stamp cards are this
 * venue's active campaigns, a card not yet started reading as none done.
 */
async function counterCustomer(db: Db, venue: Venue, userId: string): Promise<CounterCustomer> {
  const person = await db.get<{
    username: string | null;
    name: string | null;
    avatar: string | null;
    seen: number;
  }>(
    `SELECT u.username,
            CASE WHEN EXISTS (SELECT 1 FROM data_sharing_consents d
                               WHERE d.user_id = u.id AND d.venue_id = $v AND d.revoked_at IS NULL)
                 THEN u.display_name ELSE NULL END AS name,
            CASE WHEN EXISTS (SELECT 1 FROM data_sharing_consents d
                               WHERE d.user_id = u.id AND d.venue_id = $v AND d.revoked_at IS NULL)
                 THEN u.display_avatar ELSE NULL END AS avatar,
            CASE WHEN EXISTS (SELECT 1 FROM venue_customers vc
                               WHERE vc.venue_id = $v AND vc.user_id = u.id)
                 THEN 1 ELSE 0 END AS seen
       FROM users u WHERE u.id = $u`,
    { v: venue.id, u: userId },
  );
  if (!person) throw noMatch();

  const cards = await db.all<{ id: string; name: string; need: number; stamps: number | null }>(
    `SELECT c.id, c.name, c.visits_required AS need, s.stamps
       FROM campaigns c
       LEFT JOIN stamp_cards s ON s.campaign_id = c.id AND s.user_id = $u
      WHERE c.venue_id = $v AND c.status = 'active'
      ORDER BY c.priority DESC, c.visits_required ASC`,
    { v: venue.id, u: userId },
  );

  return {
    userId,
    handle: person.username ? `@${person.username}` : null,
    name: person.name,
    avatar: person.avatar,
    firstVisit: person.seen === 0,
    stamps: cards.map((card) => ({
      campaignId: card.id,
      campaign: card.name,
      /* A card that completed on a visit that paid a different one keeps its
         stamps past the line until its own payout; it reads as full, not as
         more than full. */
      done: Math.min(card.stamps ?? 0, card.need),
      need: card.need,
    })),
  };
}

/**
 * Record a sale at the counter: resolve the code, then the gate's four steps
 * with the caller as both the one who opened it and the cashier.
 *
 * **Nothing here grants anything.** The manual trigger, the amount and the
 * confirm are `gate.ts`'s own functions, so a counter sale pays exactly what a
 * QR scan of the same bill pays and is refused for exactly the same reasons —
 * an already-open transaction, an implausible amount, an empty pool.
 *
 * **A failure after opening cancels what it opened.** A pending row blocks
 * that customer's next scan at this venue, so a refused confirm that left one
 * behind would lock out the person standing at the till until the sweep. The
 * cancel is best-effort and the original refusal is what is reported.
 *
 * **Staff cannot ring up themselves**, or the venue's owner: the manual trigger
 * exists for a customer whose phone is flat, and a till that can pay its own
 * staff with no phone and no second person is the cheapest fraud this endpoint
 * could introduce.
 *
 * The response is the receipt a till needs and no more: never the customer's
 * balance or the next tier, which are facts about their wallet everywhere, not
 * about this sale.
 */
export async function counterRecord(
  db: Db,
  input: { venueId: string; actorId: string; code: string; amountMinor: number; at?: Iso },
): Promise<CounterResult> {
  const at = input.at ?? now();
  const lookup = await counterLookup(db, input.venueId, input.code, at);
  const venue = await getVenue(db, input.venueId);
  const customerId = lookup.customer.userId;
  if (customerId === input.actorId || customerId === venue.owner_user_id) {
    throw new DomainError('forbidden', 'a venue cannot record a sale to its own staff');
  }

  const intent: gate.Intent =
    lookup.kind === 'voucher' ? 'voucher_redeem' : lookup.kind === 'reward' ? 'reward_redeem' : 'earn';
  const intentRef =
    lookup.kind === 'voucher' ? lookup.voucher.id : lookup.kind === 'reward' ? lookup.reward.id : undefined;

  const opened = await gate.openTransaction(
    db,
    { kind: 'manual', venueId: venue.id, byUserId: input.actorId },
    { userId: customerId, intent, intentRef, at },
  );

  let receipt: gate.Receipt;
  try {
    await gate.submitAmount(db, {
      transactionId: opened.id,
      amountMinor: input.amountMinor,
      actorId: input.actorId,
      at,
    });
    receipt = await gate.confirm(db, { transactionId: opened.id, cashierId: input.actorId, at });
  } catch (error) {
    try {
      const left = await gate.getTransaction(db, opened.id);
      if (left.status === 'pending') {
        await gate.cancel(db, {
          transactionId: opened.id,
          reason: 'counter_failed',
          actorId: input.actorId,
          at,
        });
      }
    } catch {
      /* The refusal the caller needs to see is the one that got us here. */
    }
    throw error;
  }

  await audit.record(db, {
    actorId: input.actorId,
    action: 'gate.counter',
    entity: 'transaction',
    entityId: receipt.transaction.id,
    venueId: venue.id,
    after: {
      amountMinor: receipt.transaction.amount_minor,
      intent,
      points: receipt.pointsGranted,
      discountMinor: receipt.discountMinor,
    },
    at,
  });

  return {
    lookup,
    receipt: {
      transactionId: receipt.transaction.id,
      amountMinor: receipt.transaction.amount_minor ?? input.amountMinor,
      currency: receipt.transaction.currency,
      pointsGranted: receipt.pointsGranted,
      discountMinor: receipt.discountMinor,
      stamped: receipt.stamped,
      visitCounted: receipt.visitCounted,
      rewardEarned: receipt.reward ? { label: receipt.reward.label, code: receipt.reward.code } : null,
    },
  };
}
