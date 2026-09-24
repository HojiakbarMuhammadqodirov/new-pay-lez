/**
 * The scheduled work.
 *
 * Five of the specs' rules only exist if something runs on a clock, and one
 * rule that neither spec asked for: the exchange rates, which came from a
 * one-off import and a hand-typed table and therefore refreshed **never** until
 * `runTwiceDaily` below. That is also the only job here that makes an outbound
 * request, which is why it has a cadence of its own rather than a line in the
 * daily one — its failures are routine rather than a bug, and worth seeing
 * separately.
 *
 * The five: unredeemed
 * vouchers and rewards release their reserves (§4.3, §5.3), deals go live and
 * expire on their window (B3), pending transactions time out (§3.1),
 * subscriptions renew and lapse (D3), and the weekly leaderboard is snapshotted
 * and reset (§8.2). Without them the system is subtly wrong in the direction
 * nobody notices: budgets that look exhausted while nothing was ever discounted.
 *
 * There were six. **Points expiry is gone** — the job that collected them and
 * the notification that warned about them both — because points do not expire
 * any more; `CONFIG.points` has no window left for either to read. Nothing is
 * kept inert in its place: a job that runs and collects nothing is a job that
 * starts collecting again the day somebody puts a number back.
 *
 * Each job is idempotent and safe to run at any cadence — they all work from
 * "what is due at this instant" rather than from a cursor — so a missed run
 * catches up on the next one and a double run does nothing twice.
 */
import type { Db } from './db/db.ts';
import * as analytics from './domain/analytics.ts';
import * as deals from './domain/deals.ts';
import * as campaigns from './domain/campaigns.ts';
import * as checkin from './domain/checkin.ts';
import * as entitlements from './domain/entitlements.ts';
import * as gate from './domain/gate.ts';
import * as ledger from './domain/ledger.ts';
import * as notifications from './domain/notifications.ts';
import * as rates from './domain/rates.ts';
import * as social from './domain/social.ts';
import * as traffic from './domain/traffic.ts';
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
export async function runFrequent(db: Db, at: Iso = now()): Promise<JobReport> {
  const detail: Record<string, unknown> = {};

  detail.pendingExpired = await gate.expirePending(db, at);
  detail.dealLifecycle = await deals.runLifecycle(db, at);
  /* After the lifecycle, so a deal that expired this minute is expired before
     its push is weighed — and every few minutes rather than hourly, because a
     push has a time on it and a partner chose that time. */
  detail.dealPushes = await deals.sendDuePushes(db, at);

  return { at, ran: ['pending', 'deals', 'pushes'], detail };
}

/** Runs hourly. Everything with money in it. */
export async function runHourly(db: Db, at: Iso = now()): Promise<JobReport> {
  const detail: Record<string, unknown> = {};

  detail.vouchers = await vouchers.expireVouchers(db, at);
  detail.rewards = await campaigns.expireRewards(db, at);
  detail.subscriptions = await entitlements.runRenewals(db, at);
  /* Before the drain, so a reminder written this hour goes out on this hour's
     push rather than waiting for the next one — the window it is sent in is
     only an hour or two wide once quiet hours have had their say. */
  detail.streakReminders = await checkin.remind(db, at);
  detail.push = await push.drain(db);

  return { at, ran: ['vouchers', 'rewards', 'subscriptions', 'check-ins', 'push'], detail };
}

/**
 * Runs daily. Retention, the averages, and the reconciliation.
 *
 * It used to open with an expiry warning and close with the collection it warned
 * about — in that order, which was the only order that made it a warning. Both
 * are gone with the window they read.
 */
export async function runDaily(db: Db, at: Iso = now()): Promise<JobReport> {
  const detail: Record<string, unknown> = {};

  /* Retention is a job rather than a query filter: rows nobody deletes are rows
     that eventually have to be explained to a regulator. */
  detail.trafficPruned = await traffic.prune(db, at);
  /* Email verification was removed, so every code left in its table is dead —
     and the rows carry an address, which is a reason to empty the table rather
     than keep it. The table itself stays until a migration drops it. */
  detail.codesPruned = (await db.run(`DELETE FROM email_verifications`)).changes;

  /* §4.5: recompute the median check, and tell the partner when the source flips
     from the category default to their own tills — the estimate they read every
     day will visibly move, and an unexplained jump reads as a bug. */
  let flipped = 0;
  const venues = await db.all<{ id: string; owner_user_id: string | null }>(
    `SELECT id, owner_user_id FROM venues WHERE status = 'live' AND deleted_at IS NULL`,
  );
  for (const venue of venues) {
    const full = await db.get<Parameters<typeof refreshAverageCheck>[1]>(
      `SELECT * FROM venues WHERE id = $v`,
      { v: venue.id },
    );
    if (!full) continue;
    const result = await refreshAverageCheck(db, full, at);
    if (result.flipped && venue.owner_user_id) {
      flipped += 1;
      await notifications.notify(db, {
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
  for (const player of await db.all<{ id: string }>(`SELECT id FROM users`)) {
    if ((await ledger.reconcile(db, player.id)) !== 0) drifted += 1;
  }
  detail.reconciledDrift = drifted;

  return { at, ran: ['traffic', 'codes', 'average_check', 'reconcile'], detail };
}

/**
 * Runs twice a day. The exchange rates, and nothing else.
 *
 * Its own cadence rather than a line in `runDaily`, because "at least twice a
 * day" is the requirement and a daily job cannot meet it — and because this is
 * the only job here that makes an **outbound request**. Everything else on this
 * clock works from rows in our own database; this one reads somebody else's
 * document, which means it is the one job whose failure is routine rather than
 * a bug, and it is worth being able to see that on its own line.
 *
 * Idempotent like the rest: it upserts on the currency code and works from what
 * the sheet says right now, so a missed run is caught by the next one and a
 * double run writes the same numbers twice.
 *
 * **A failure here changes nothing.** `rates.sync` writes no rate unless it has
 * a full answer, so the previous ones stay and go on being served — see the
 * last-known-good rule in `domain/rates.ts`. That is what makes it safe for
 * this job to depend on a third party at all.
 */
export async function runTwiceDaily(db: Db, at: Iso = now()): Promise<JobReport> {
  const detail: Record<string, unknown> = {};

  detail.rates = await rates.sync(db, at);

  return { at, ran: ['rates'], detail };
}

/** Runs weekly, on Monday. The leaderboard snapshot and the benchmarks. */
export async function runWeekly(db: Db, at: Iso = now()): Promise<JobReport> {
  const detail: Record<string, unknown> = {
    week: isoWeek(at),
    leaderboardRows: await social.snapshotWeek(db, at),
    benchmarks: await analytics.computeBenchmarks(db, { at }),
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
export async function runMonthly(db: Db, at: Iso = now()): Promise<JobReport> {
  let sent = 0;
  const venues = await db.all<{ id: string; name: string; owner_user_id: string | null }>(
    `SELECT id, name, owner_user_id FROM venues WHERE status = 'live' AND owner_user_id IS NOT NULL`,
  );
  for (const venue of venues) {
    const found = await analytics.findings(db, venue.id, { at });
    if (found.length === 0) continue;
    await notifications.notify(db, {
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
    setInterval(async () => void await runFrequent(db), 5 * 60_000),
    setInterval(async () => void await runHourly(db), 60 * 60_000),
    /* Twelve hours, which is the "at least twice a day" the rate sync has to
       meet. `setInterval` rather than a wall-clock schedule because every job
       here works from what is due *now* rather than from a cursor, so which
       twelve hours it lands in does not matter and a restart simply resets the
       phase. */
    setInterval(async () => void await runTwiceDaily(db), 12 * 60 * 60_000),
    setInterval(async () => void await runDaily(db), 24 * 60 * 60_000),
    setInterval(async () => void await runWeekly(db), 7 * 24 * 60 * 60_000),
  ];
  for (const timer of timers) timer.unref();
  return () => timers.forEach(clearInterval);
}
