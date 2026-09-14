/**
 * Turning up — the daily check-in, and the calendar that says where a month's
 * points came from.
 *
 * Two things live here because they are one screen. The **check-in** is the
 * smallest earning there is: open the app, tap once, take `CONFIG.earn.dailyCheckIn`
 * through a seven-day shape that pays the seventh day four times the first. The
 * **calendar** is the month that check-in sits in, and it is not a list of
 * check-ins — it is every point the account earned that month, grouped by day
 * and by where it came from, because a customer asking "where is this balance
 * from" is asking about all of it and not about the five points they tapped for.
 *
 * **Nothing here keeps a second copy of anything.** There is no check-in table,
 * no streak column, no per-day counter. A check-in *is* its ledger entry —
 * `reason: 'check_in'`, `source_ref` the day — and the streak is those entries
 * read back. That is the same move `consumer.ts` makes when it counts the
 * assistant's daily allowance off the transcript rather than off a tally, and
 * for the same reason: a counter beside the record is a second thing that can
 * drift, and the one that drifts is always the one nobody reconciles. It is also
 * why this feature needed no migration — `'check_in'` and `'streak_milestone'`
 * have been legal `points_ledger.reason` values since the table was written.
 *
 * **The streak here is not the streak in `games.ts`.** That one counts days
 * *played* and is moved by `applyStreak` when a round finishes; this one counts
 * days *opened*. They are deliberately separate rules about separate behaviour,
 * and the two screens name them differently — "play streak" on Play, "check-in
 * streak" here — because one number that meant either would be a number that
 * means neither.
 */
import { CONFIG } from '../config.ts';
import type { Db } from '../db/db.ts';
import { DomainError } from './errors.ts';
import * as ledger from './ledger.ts';
import * as notifications from './notifications.ts';
import { type Iso, now, shiftDay } from './time.ts';

/**
 * The day a check-in is keyed on.
 *
 * `at.slice(0, 10)` — the same slice `games.ts` counts a day by and the word-hint
 * allowance resets on. It is one boundary for every daily thing in the product,
 * which matters more than which boundary it is: two daily resets an hour apart
 * is a bug report nobody can reproduce.
 */
const dayOf = (at: Iso): string => at.slice(0, 10);

/**
 * When the day turns.
 *
 * Sent so nothing on a phone has to work it out. A client computing its own
 * local midnight is a client that disagrees with the server about whether a
 * streak is still alive — which is `design-gaps.md`'s "streak expiry" row, and
 * this is the field that closes it for this screen.
 */
const dayTurnsAt = (day: string): Iso => `${shiftDay(day, 1)}T00:00:00.000Z`;

/** `YYYY-MM` of a `YYYY-MM-DD`. */
const monthOf = (day: string): string => day.slice(0, 7);

/* ───────────────────────────────────────────────────────── what a day pays ── */

/**
 * What the `n`th consecutive day is worth.
 *
 * The cycle repeats every seven days, so the eighth day of a streak pays what
 * the first did. `CONFIG.earn.checkInCycle` holds the shape as multiples and
 * `CONFIG.earn.dailyCheckIn` holds the amount; this is the one place the two are
 * multiplied, so a screen quoting a figure and the ledger writing one cannot
 * come from different arithmetic.
 */
export function dayValue(streakDay: number): number {
  const cycle = CONFIG.earn.checkInCycle;
  if (cycle.length === 0) return CONFIG.earn.dailyCheckIn;
  const index = (Math.max(1, streakDay) - 1) % cycle.length;
  return CONFIG.earn.dailyCheckIn * (cycle[index] ?? 1);
}

/** The seven-day shape, with the points already worked out. */
export function ladder(): Array<{ day: number; points: number; milestone: number }> {
  return CONFIG.earn.checkInCycle.map((_, index) => ({
    day: index + 1,
    points: dayValue(index + 1),
    /* A milestone that happens to land on a cycle day is drawn on that rung
       rather than mentioned separately. Zero where none does. */
    milestone: CONFIG.earn.streakMilestones[index + 1] ?? 0,
  }));
}

/** Milestone days, ascending. */
const milestoneDays = (): number[] =>
  Object.keys(CONFIG.earn.streakMilestones)
    .map(Number)
    .filter((day) => Number.isFinite(day) && day > 0)
    .sort((a, b) => a - b);

/* ──────────────────────────────────────────────────── where points came from ── */

/**
 * The bucket a ledger reason is shown in.
 *
 * Fewer buckets than reasons, on purpose. `reason` is the ledger's closed
 * vocabulary and has to stay fine-grained enough to attribute a row years later;
 * this is a *legend*, and a legend with fourteen entries is one nobody reads. A
 * scan, the venue bonus that rode in with it and the review left afterwards are
 * one thing to the person who earned them — they went somewhere.
 *
 * The label travels with the bucket rather than being looked up on the client,
 * because a client with its own table of reason names is a client that renders
 * "streak milestone" the day the server adds one it has never heard of.
 */
export type SourceKind = 'check_in' | 'streak' | 'games' | 'visits' | 'stamps' | 'invites' | 'bonus';

const BUCKETS: Record<string, { kind: SourceKind; label: string }> = {
  check_in: { kind: 'check_in', label: 'Daily check-in' },
  streak_milestone: { kind: 'streak', label: 'Streak bonus' },
  game_win: { kind: 'games', label: 'Games' },
  scan_earn: { kind: 'visits', label: 'Visits' },
  spend_bonus: { kind: 'visits', label: 'Visits' },
  venue_bonus: { kind: 'visits', label: 'Visits' },
  review: { kind: 'visits', label: 'Visits' },
  stamp_complete: { kind: 'stamps', label: 'Stamp cards' },
  referral: { kind: 'invites', label: 'Invites' },
  welcome_bonus: { kind: 'bonus', label: 'Bonuses' },
  profile_bonus: { kind: 'bonus', label: 'Bonuses' },
  occasion: { kind: 'bonus', label: 'Bonuses' },
  stipend: { kind: 'bonus', label: 'Bonuses' },
  adjustment: { kind: 'bonus', label: 'Bonuses' },
};

/* A reason this file has not been taught lands in `bonus` rather than being
   dropped. A month total that does not equal the sum of its own legend is worse
   than a legend with a vague row in it: one is untidy, the other is wrong. */
const bucketFor = (reason: string) => BUCKETS[reason] ?? { kind: 'bonus' as SourceKind, label: 'Bonuses' };

export interface Source {
  kind: SourceKind;
  label: string;
  points: number;
}

export interface CalendarDay {
  /** `YYYY-MM-DD`. */
  day: string;
  /** Whether the check-in was claimed on this day. */
  checkedIn: boolean;
  /** Everything earned that day, from every source. Spends are not here. */
  points: number;
  /** The same total, split by where it came from. Ordered by size. */
  sources: Source[];
}

export interface Milestone {
  day: number;
  points: number;
  /** Whether it has ever been paid. Milestones pay once, not once per streak. */
  paid: boolean;
}

export interface Calendar {
  /** The server's day. Nothing on the client works this out for itself. */
  today: string;
  /** When `today` becomes tomorrow, so a countdown has something true to count to. */
  dayTurnsAt: Iso;

  /** Whether today's check-in is still there to take. */
  claimable: boolean;
  claimedToday: boolean;
  /** What today's check-in paid, or would pay. */
  todayPoints: number;
  /** The milestone landing with it, or 0. */
  todayBonus: number;

  /** Consecutive days checked in, ending today or yesterday. */
  streak: number;
  /** The best run this account has ever had. */
  longestStreak: number;
  /** A live streak with today unclaimed — the only state a reminder is honest about. */
  atRisk: boolean;
  /** Which rung of the seven-day cycle today is. */
  cycleDay: number;
  ladder: Array<{ day: number; points: number; milestone: number }>;
  milestones: Milestone[];
  /** The next unpaid milestone, and how far off it is. Null when all are paid. */
  nextMilestone: { day: number; points: number; daysAway: number } | null;

  /** `YYYY-MM` — the month the days below belong to. */
  month: string;
  /** Everything earned in it. */
  monthTotal: number;
  /** That total, split by source. The legend the screen draws. */
  monthSources: Source[];
  /**
   * The days of `month` that have anything to say — a check-in, points, or both.
   * Empty days are left out rather than sent as zeroes: the client knows
   * `today`, so a day that is not here is "nothing happened" before it and
   * "not yet" after it, and those two are not the same cell.
   */
  days: CalendarDay[];
}

export interface CheckIn {
  /** True only for the call that actually claimed the day. */
  granted: boolean;
  day: string;
  dayTurnsAt: Iso;
  /** What the check-in itself paid. `0` on a repeat. */
  points: number;
  /** The milestone that landed with it. `0` when none did. */
  bonus: number;
  /** `points + bonus` — what the balance moved by. */
  total: number;
  /** The milestone this call paid, for the screen that wants to celebrate it. */
  milestone: { day: number; points: number } | null;
  streak: number;
  longestStreak: number;
  cycleDay: number;
  /** What tomorrow will pay, if tomorrow is claimed. The reason to come back. */
  tomorrowPoints: number;
  balance: number;
}

/* ────────────────────────────────────────────────────────────── the streak ── */

/**
 * Every day this account has checked in, most recent first.
 *
 * Read whole rather than windowed. The rows are one short string each and there
 * is at most one per day the account has existed, so even a three-year habit is
 * a thousand of them — and the alternative, a window, is a `longestStreak` that
 * silently forgets the best run somebody ever had the moment it falls off the
 * end. `source_ref` is the plain `YYYY-MM-DD`, which sorts chronologically as
 * text, so the ordering is the index's and not a parse.
 */
async function checkedInDays(db: Db, userId: string): Promise<string[]> {
  const rows = await db.all<{ source_ref: string | null }>(
    `SELECT source_ref FROM points_ledger
      WHERE user_id = $u AND reason = 'check_in' AND status = 'committed'
      ORDER BY source_ref DESC`,
    { u: userId },
  );
  return rows.map((row) => row.source_ref ?? '').filter((day) => day !== '');
}

/**
 * The run ending today, or ending yesterday.
 *
 * Yesterday counts because a streak is not broken until the day it was owed has
 * gone by: somebody who checked in last night and has not opened the app yet
 * this morning has a six-day streak and a decision to make, not a five-day
 * streak and a fait accompli. That is the whole of `atRisk`.
 */
function runEndingAt(days: string[], today: string): number {
  const yesterday = shiftDay(today, -1);
  const first = days[0];
  if (first !== today && first !== yesterday) return 0;

  let streak = 0;
  let cursor = first;
  for (const day of days) {
    if (day !== cursor) break;
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

/** The best run in the whole history, however long ago it was. */
function longestRun(days: string[]): number {
  let best = 0;
  let run = 0;
  let expected: string | null = null;
  for (const day of days) {
    run = expected === null || day === expected ? run + 1 : 1;
    if (run > best) best = run;
    expected = shiftDay(day, -1);
  }
  return best;
}

/* ────────────────────────────────────────────────────────────── the month ── */

/**
 * A month's earnings, by day and by source.
 *
 * `substr(created_at, 1, 7)` rather than a date range, because `created_at` is
 * UTC ISO text on both engines and the prefix is the month — no casts, no
 * BETWEEN whose upper bound is one of the two things everybody gets wrong.
 * `delta > 0` because this answers "where did points come from"; a redemption is
 * a real row and belongs in the history screen, not in a legend about earning.
 */
async function monthRows(db: Db, userId: string, month: string) {
  return await db.all<{ day: string; reason: string; points: number }>(
    `SELECT substr(created_at, 1, 10) AS day, reason, SUM(delta) AS points
       FROM points_ledger
      WHERE user_id = $u AND status = 'committed' AND delta > 0
        AND substr(created_at, 1, 7) = $m
      GROUP BY substr(created_at, 1, 10), reason
      ORDER BY day ASC`,
    { u: userId, m: month },
  );
}

/** Collapse `{reason → points}` into the legend's buckets, biggest first. */
function toSources(byReason: Map<string, number>): Source[] {
  const byKind = new Map<SourceKind, Source>();
  for (const [reason, points] of byReason) {
    if (points <= 0) continue;
    const bucket = bucketFor(reason);
    const existing = byKind.get(bucket.kind);
    if (existing) existing.points += points;
    else byKind.set(bucket.kind, { kind: bucket.kind, label: bucket.label, points });
  }
  /* Biggest first, and ties broken by name so the legend does not reorder
     itself between two reads that mean the same thing. */
  return [...byKind.values()].sort((a, b) => b.points - a.points || a.kind.localeCompare(b.kind));
}

/* ──────────────────────────────────────────────────────────────── the reads ── */

/**
 * Everything the daily-rewards screen draws, in one response.
 *
 * One call rather than three because the screen is one screen: the streak, the
 * seven-day run-up, this month's grid and the legend under it are all answers to
 * "should I open this tomorrow", and fetching them separately means drawing a
 * calendar next to a streak that was read a second earlier and might disagree.
 */
export async function calendar(
  db: Db,
  input: { userId: string; month?: string; at?: Iso },
): Promise<Calendar> {
  const at = input.at ?? now();
  const today = dayOf(at);
  const month = input.month ?? monthOf(today);

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new DomainError('validation_failed', 'month must be YYYY-MM', { field: 'month' });
  }

  const days = await checkedInDays(db, input.userId);
  const claimedToday = days[0] === today;
  const streak = runEndingAt(days, today);
  const longestStreak = longestRun(days);

  /* The rung today sits on. Already claimed and it is the streak's last day;
     not yet and it is the day the streak is about to become — which is also 1
     when there is no streak, because `runEndingAt` answered 0. */
  const streakDay = claimedToday ? Math.max(1, streak) : streak + 1;
  const todayPoints = dayValue(streakDay);

  const paidMilestones = new Set<number>();
  for (const day of milestoneDays()) {
    if (await ledger.alreadyPaid(db, input.userId, 'streak', `streak:${day}`)) paidMilestones.add(day);
  }

  const milestones: Milestone[] = milestoneDays().map((day) => ({
    day,
    points: CONFIG.earn.streakMilestones[day] ?? 0,
    paid: paidMilestones.has(day),
  }));

  const todayBonus =
    !claimedToday && !paidMilestones.has(streakDay) ? (CONFIG.earn.streakMilestones[streakDay] ?? 0) : 0;

  const upcoming = milestones.find((m) => !m.paid && m.day > streak);

  const rows = await monthRows(db, input.userId, month);
  const perDay = new Map<string, Map<string, number>>();
  const perMonth = new Map<string, number>();
  for (const row of rows) {
    const points = Number(row.points ?? 0);
    if (points <= 0) continue;
    const bucket = perDay.get(row.day) ?? new Map<string, number>();
    bucket.set(row.reason, (bucket.get(row.reason) ?? 0) + points);
    perDay.set(row.day, bucket);
    perMonth.set(row.reason, (perMonth.get(row.reason) ?? 0) + points);
  }

  const checkedInThisMonth = new Set(days.filter((day) => monthOf(day) === month));
  const everyDay = [...new Set([...perDay.keys(), ...checkedInThisMonth])].sort();

  const calendarDays: CalendarDay[] = everyDay.map((day) => {
    const byReason = perDay.get(day) ?? new Map<string, number>();
    const sources = toSources(byReason);
    return {
      day,
      checkedIn: checkedInThisMonth.has(day),
      points: sources.reduce((total, source) => total + source.points, 0),
      sources,
    };
  });

  const monthSources = toSources(perMonth);

  return {
    today,
    dayTurnsAt: dayTurnsAt(today),
    claimable: !claimedToday,
    claimedToday,
    todayPoints,
    todayBonus,
    streak,
    longestStreak,
    atRisk: streak > 0 && !claimedToday,
    cycleDay: ((streakDay - 1) % Math.max(1, CONFIG.earn.checkInCycle.length)) + 1,
    ladder: ladder(),
    milestones,
    nextMilestone: upcoming
      ? { day: upcoming.day, points: upcoming.points, daysAway: upcoming.day - streak }
      : null,
    month,
    monthTotal: monthSources.reduce((total, source) => total + source.points, 0),
    monthSources,
    days: calendarDays,
  };
}

/* ─────────────────────────────────────────────────────────────── the write ── */

/**
 * Take today's check-in.
 *
 * **Safe to send twice**, and it has to be: this is a button on a screen a flaky
 * connection can show twice and a tab a person can leave open overnight. The
 * guard is the ledger's own uniqueness — `alreadyPaid(userId, 'daily', day)` —
 * read inside the transaction that writes, so two taps that arrive together
 * serialise behind one another rather than both finding nothing and both paying.
 * A repeat answers `granted: false` with the day's real figures rather than
 * failing, because "already done" is a success from the caller's side.
 *
 * `source_ref` is the bare `YYYY-MM-DD` with no prefix, unlike `payComeback`'s
 * `comeback:<window>`. The prefix there earns its place because a bare window
 * index means nothing in a log line; a date does not need telling what it is,
 * and keeping it bare is what lets the streak read the column back as days
 * without parsing anything off the front.
 *
 * The milestone is **its own entry**, not points folded into the check-in. A
 * balance that jumped by 70 with one row saying `+70` is a number the customer
 * cannot check, and §2.1 makes the ledger the thing that answers where points
 * came from. It is also the only way the calendar's legend can show a streak
 * bonus as a thing of its own.
 */
export async function checkIn(db: Db, input: { userId: string; at?: Iso }): Promise<CheckIn> {
  const at = input.at ?? now();
  const day = dayOf(at);

  return db.tx(async () => {
    const days = await checkedInDays(db, input.userId);
    const already = days[0] === day;

    /* The streak as it stands before this call, and the rung this day is. On a
       repeat the day is already in `days`, so the run *is* the streak and the
       rung is its last; on a fresh claim the run ends yesterday and this day is
       the next one. */
    const streakBefore = runEndingAt(days, day);
    const streakDay = already ? Math.max(1, streakBefore) : streakBefore + 1;
    const points = dayValue(streakDay);

    let bonus = 0;
    let milestone: { day: number; points: number } | null = null;

    if (!already) {
      await ledger.earn(db, {
        userId: input.userId,
        points,
        reason: 'check_in',
        sourceKind: 'daily',
        sourceRef: day,
        at,
      });

      const worth = CONFIG.earn.streakMilestones[streakDay] ?? 0;
      /* Once ever, not once per streak: the key is the milestone, so a streak
         that breaks at ninety and climbs back to seven does not pay again. */
      if (worth > 0 && !(await ledger.alreadyPaid(db, input.userId, 'streak', `streak:${streakDay}`))) {
        await ledger.earn(db, {
          userId: input.userId,
          points: worth,
          reason: 'streak_milestone',
          sourceKind: 'streak',
          sourceRef: `streak:${streakDay}`,
          at,
        });
        bonus = worth;
        milestone = { day: streakDay, points: worth };
      }
    }

    const after = already ? days : [day, ...days];
    const streak = runEndingAt(after, day);

    return {
      granted: !already,
      day,
      dayTurnsAt: dayTurnsAt(day),
      points: already ? 0 : points,
      bonus,
      total: already ? 0 : points + bonus,
      milestone,
      streak,
      longestStreak: longestRun(after),
      cycleDay: ((streakDay - 1) % Math.max(1, CONFIG.earn.checkInCycle.length)) + 1,
      tomorrowPoints: dayValue(streakDay + 1),
      balance: await ledger.balance(db, input.userId),
    };
  });
}

/* ─────────────────────────────────────────────────────────── the reminder ── */

/**
 * How much of the server's day is left, in whole hours.
 *
 * The same boundary a check-in is keyed on, so "your day is nearly over" is
 * literally true rather than nearly true. It is a UTC slice, which for this
 * product lands well: six hours left is 18:00 UTC, an evening in Warsaw.
 */
function hoursLeftIn(day: string, at: Iso): number {
  const left = Date.parse(dayTurnsAt(day)) - Date.parse(at);
  return Math.max(0, Math.floor(left / 3_600_000));
}

export interface Reminded {
  /** Accounts with a live streak and an unclaimed day, inside the window. */
  due: number;
  /** Rows written. Equal to `due` unless something threw. */
  sent: number;
  /** Of those, the ones a push was actually queued for. */
  pushed: number;
}

/**
 * "Your streak ends in N hours."
 *
 * A daily reward with nothing to bring anybody back is half a mechanic, and
 * this is the other half. It runs hourly and does nothing for most of the day:
 * a streak is only worth mentioning once the day it is owed is running out, and
 * a prompt sent at ten in the morning is a nag about something with fourteen
 * hours left on it.
 *
 * **Only a live streak is reminded.** Somebody who has never checked in is not
 * missing anything, and somebody whose streak broke last week is being told
 * about a loss rather than offered a save — both of those are notifications
 * that teach people to turn notifications off. The population is exactly
 * "checked in yesterday, has not checked in today", which is also the only
 * group for whom the sentence is true.
 *
 * **The guard is the notification itself.** One row per account per day, keyed
 * `kind = 'streak'` and `source_ref = <day>`, checked in the same statement
 * that selects the population — so an hourly job that runs twelve times in the
 * window sends once, and a job that is run twice by accident sends nothing the
 * second time. `notify` does not deduplicate; nothing in this file may assume
 * it does.
 *
 * **Push is asked for, not taken.** `push: true` goes through `canPush`, which
 * owns permission, preference, quiet hours and the platform frequency cap. A
 * reminder suppressed by any of those still writes its inbox row, because
 * somebody who opens the app tomorrow should be able to see what they missed —
 * and `suppress_reason` records which of the four it was, so "why didn't I get
 * this" stays answerable.
 */
export async function remind(db: Db, at: Iso = now()): Promise<Reminded> {
  const today = dayOf(at);
  if (hoursLeftIn(today, at) > CONFIG.earn.checkInRemindHoursLeft) {
    return { due: 0, sent: 0, pushed: 0 };
  }

  const yesterday = shiftDay(today, -1);
  const rows = await db.all<{ user_id: string }>(
    /* One statement rather than a read-then-filter: the "already told them"
       guard has to be evaluated with the population, or two runs of the job
       that overlap both see an empty inbox and both write a row. */
    `SELECT DISTINCT y.user_id FROM points_ledger y
      WHERE y.reason = 'check_in' AND y.status = 'committed' AND y.source_ref = $yesterday
        AND NOT EXISTS (
          SELECT 1 FROM points_ledger t
           WHERE t.user_id = y.user_id AND t.reason = 'check_in'
             AND t.status = 'committed' AND t.source_ref = $today)
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
           WHERE n.user_id = y.user_id AND n.kind = 'streak'
             AND n.source_kind = 'check_in' AND n.source_ref = $today)`,
    { yesterday, today },
  );

  let sent = 0;
  let pushed = 0;

  for (const row of rows) {
    const days = await checkedInDays(db, row.user_id);
    const streak = runEndingAt(days, today);
    /* Zero would mean the streak died between the statement above and this
       line, which cannot happen inside one run — but a reminder about a streak
       of none is the one sentence this function must never send. */
    if (streak <= 0) continue;

    const hours = hoursLeftIn(today, at);
    const worth = dayValue(streak + 1);

    const delivery = await notifications.notify(db, {
      userId: row.user_id,
      mode: 'consumer',
      kind: 'streak',
      title:
        hours < 1
          ? `Your ${streak}-day streak ends within the hour`
          : `Your ${streak}-day streak ends in ${hours} ${hours === 1 ? 'hour' : 'hours'}`,
      /* The figure, because it is the reason to open the app and because the
         screen will show the same one: `dayValue(streak + 1)` is what the claim
         will pay, not a round number chosen to sound generous. */
      body: `Check in to keep it. Today is worth ${worth} points.`,
      /* A route hint the client resolves against its own destinations, never a
         URL it follows. */
      actionUrl: '#/daily',
      sourceKind: 'check_in',
      sourceRef: today,
      push: true,
      at,
    });

    sent += 1;
    if (delivery.delivery === 'queued') pushed += 1;
  }

  return { due: rows.length, sent, pushed };
}
