/**
 * The scheduled work.
 *
 * Six of the specs' rules only exist if something runs on a clock: points expire
 * (§2.3), unredeemed vouchers and rewards release their reserves (§4.3, §5.3),
 * deals go live and expire on their window (B3), pending transactions time out
 * (§3.1), subscriptions renew and lapse (D3), and the weekly leaderboard is
 * snapshotted and reset (§8.2). Without them the system is subtly wrong in the
 * direction nobody notices: budgets that look exhausted while nothing was ever
 * discounted, and points that never expire.
 *
 * Each job is idempotent and safe to run at any cadence — they all work from
 * "what is due at this instant" rather than from a cursor — so a missed run
 * catches up on the next one and a double run does nothing twice.
 */
import type { Db } from './db/db.ts';
import * as analytics from './domain/analytics.ts';
import * as deals from './domain/deals.ts';
import * as campaigns from './domain/campaigns.ts';
import * as entitlements from './domain/entitlements.ts';
import * as gate from './domain/gate.ts';
import * as ledger from './domain/ledger.ts';
import * as notifications from './domain/notifications.ts';
import * as social from './domain/social.ts';
import * as vouchers from './domain/vouchers.ts';
import { refreshAverageCheck } from './domain/venues.ts';
import * as push from './ports/push.ts';
import { isoWeek, now, type Iso } from './domain/time.ts';

export interface JobReport {
  at: Iso;
  ran: string[];
  detail: Record<string, unknown>;
}

/** Runs every few minutes. Cheap, and the two that matter most for correctness. */
export function runFrequent(db: Db, at: Iso = now()): JobReport {
  const detail: Record<string, unknown> = {};

  detail.pendingExpired = gate.expirePending(db, at);
  detail.dealLifecycle = deals.runLifecycle(db, at);

  return { at, ran: ['pending', 'deals'], detail };
}

/** Runs hourly. Everything with money in it. */
export async function runHourly(db: Db, at: Iso = now()): Promise<JobReport> {
  const detail: Record<string, unknown> = {};

  detail.vouchers = vouchers.expireVouchers(db, at);
  detail.rewards = campaigns.expireRewards(db, at);
  detail.subscriptions = entitlements.runRenewals(db, at);
  detail.push = await push.drain(db);

  return { at, ran: ['vouchers', 'rewards', 'subscriptions', 'push'], detail };
}

/**
 * Runs daily. Expiry, the notifications that warn about it, and the averages.
 *
 * The warning goes out *before* the expiry job takes the points, which is the
 * only order that makes it a warning. `expiryWarningDays` is the window.
 */
export function runDaily(db: Db, at: Iso = now()): JobReport {
  const detail: Record<string, unknown> = {};

  let warned = 0;
  const players = db.all<{ id: string }>(
    `SELECT id FROM users WHERE status = 'active' AND deleted_at IS NULL AND points_cache > 0`,
  );
  for (const player of players) {
    const soon = ledger.expiringSoon(db, player.id, at);
    const total = soon.reduce((sum, row) => sum + row.points, 0);
    if (total <= 0) continue;
    notifications.notify(db, {
      userId: player.id,
      kind: 'points_expiring',
      title: `${total} points expire soon`,
      body: 'Points last twelve months from the day they are earned. Spend them before they go.',
      actionUrl: '#/vouchers',
      push: true,
      at,
    });
    warned += 1;
  }
  detail.expiryWarnings = warned;

  /* Expiry runs after the warnings, so nobody is told about points that have
     already gone. */
  detail.expiry = ledger.runExpiry(db, at);

  /* §4.5: recompute the median check, and tell the partner when the source flips
     from the category default to their own tills — the estimate they read every
     day will visibly move, and an unexplained jump reads as a bug. */
  let flipped = 0;
  const venues = db.all<{ id: string; owner_user_id: string | null }>(
    `SELECT id, owner_user_id FROM venues WHERE status = 'live' AND deleted_at IS NULL`,
  );
  for (const venue of venues) {
    const full = db.get<Parameters<typeof refreshAverageCheck>[1]>(
      `SELECT * FROM venues WHERE id = $v`,
      { v: venue.id },
    );
    if (!full) continue;
    const result = refreshAverageCheck(db, full, at);
    if (result.flipped && venue.owner_user_id) {
      flipped += 1;
      notifications.notify(db, {
        userId: venue.owner_user_id,
        mode: 'partner',
        kind: 'average_check_source',
        title: 'Your average check is now your own',
        body: 'Enough confirmed transactions have landed to compute it from your tills rather than the category default.',
        sourceKind: 'venue',
        sourceRef: venue.id,
        venueId: venue.id,
        at,
      });
    }
  }
  detail.averageCheckFlips = flipped;

  /* Reconcile the cached balances against the ledger. It should never drift —
     nothing outside `ledger.ts` writes the cache — and the job exists precisely
     so that "should never" is a checked claim rather than an assumption. */
  let drifted = 0;
  for (const player of db.all<{ id: string }>(`SELECT id FROM users`)) {
    if (ledger.reconcile(db, player.id) !== 0) drifted += 1;
  }
  detail.reconciledDrift = drifted;

  return { at, ran: ['expiry', 'average_check', 'reconcile'], detail };
}

/** Runs weekly, on Monday. The leaderboard snapshot and the benchmarks. */
export function runWeekly(db: Db, at: Iso = now()): JobReport {
  const detail: Record<string, unknown> = {
    week: isoWeek(at),
    leaderboardRows: social.snapshotWeek(db, at),
    benchmarks: analytics.computeBenchmarks(db, { at }),
  };
  return { at, ran: ['leaderboard', 'benchmarks'], detail };
}

/**
 * The monthly summary email (B9): the three strongest findings per venue.
 *
 * Composed here and delivered to the partner's inbox with a `partner` mode tag,
 * so it obeys §9.3 — an owner in personal mode is not buzzed with business
 * alerts, but the item is still there when they switch.
 */
export function runMonthly(db: Db, at: Iso = now()): JobReport {
  let sent = 0;
  const venues = db.all<{ id: string; name: string; owner_user_id: string | null }>(
    `SELECT id, name, owner_user_id FROM venues WHERE status = 'live' AND owner_user_id IS NOT NULL`,
  );
  for (const venue of venues) {
    const found = analytics.findings(db, venue.id, { at });
    if (found.length === 0) continue;
    notifications.notify(db, {
      userId: venue.owner_user_id!,
      mode: 'partner',
      kind: 'monthly_summary',
      title: `${venue.name}: your month`,
      body: found.map((finding) => finding.key.replace(/_/g, ' ')).join(' · '),
      actionUrl: '#/dashboard',
      sourceKind: 'venue',
      sourceRef: venue.id,
      at,
    });
    sent += 1;
  }
  return { at, ran: ['monthly_summary'], detail: { sent } };
}

/**
 * Start the timers.
 *
 * `unref()` on every one of them: a process that cannot exit because a timer is
 * pending is a process that hangs a test run and a container shutdown. The work
 * is not important enough to keep the event loop alive on its own.
 */
export function startScheduler(db: Db): () => void {
  const timers = [
    setInterval(() => void runFrequent(db), 5 * 60_000),
    setInterval(() => void runHourly(db), 60 * 60_000),
    setInterval(() => void runDaily(db), 24 * 60 * 60_000),
    setInterval(() => void runWeekly(db), 7 * 24 * 60 * 60_000),
  ];
  for (const timer of timers) timer.unref();
  return () => timers.forEach(clearInterval);
}
