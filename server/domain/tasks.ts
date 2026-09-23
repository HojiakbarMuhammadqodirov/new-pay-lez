/**
 * The daily-task prompts, and what each one is actually worth.
 *
 * ## Why the amounts are computed here rather than stored
 *
 * A task is an advertisement for a reward, and the one thing it must not do is
 * quote a figure the ledger will not pay. `daily_tasks.reward` therefore names
 * the earning *rule* and this file resolves it from the same place the grant
 * reads — `CONFIG.earn` for the fixed bonuses, `checkin.calendar` for today's
 * check-in (which is not fixed: it is the rung of the seven-day cycle the player
 * is standing on, so the honest answer to "what is turning up worth" changes
 * every day), and the plan's `points_multiplier` for a game round.
 *
 * A column holding `50` would be right on the day it was typed and wrong the
 * day somebody moved `CONFIG.earn.profileComplete`, and the failure is silent
 * and in the player's favour to notice: a promise of fifty paid as twenty-five.
 *
 * ## Why the copy is not here either
 *
 * `copy_key` names an entry in `copy.games.tasks`. The five dictionaries are
 * where user-visible strings live; a translated sentence in a database is a
 * sentence that is missing in Ukrainian with nothing to report it, where a
 * missing dictionary key is a build error. So the table chooses the prompt and
 * `src/site/i18n/` holds the words.
 *
 * ## `done`, and why it matters more than it looks
 *
 * "Completed tasks should not keep being advertised." A panel that goes on
 * offering fifty points for a profile somebody finished last month is not a
 * nudge, it is a bug the player can see — and worse, it is a promise that will
 * not be honoured, because every one of these grants is once-only and guarded
 * (`UPDATE … WHERE profile_completed_at IS NULL` and friends). So each task
 * carries whether *this* account has already had it, computed from the same
 * column the guard reads, and the client draws only the undone ones.
 *
 * The two recurring ones are done *for today* rather than for ever, which is
 * what makes them daily: the check-in resets when the day turns, and so does
 * "play a round".
 */
import { CONFIG } from '../config.ts';
import type { Db } from '../db/db.ts';
import * as checkin from './checkin.ts';
import * as entitlements from './entitlements.ts';
import { dailyGamePaid } from './games.ts';
import { now, type Iso } from './time.ts';

/**
 * How a task is priced. One of these per row of `daily_tasks.reward`.
 *
 * A closed set rather than free text, because a row naming a rule this file
 * does not implement is a task with no price — and the honest handling of that
 * is to leave the row out of the answer, which `resolve` below does.
 */
export type Reward = 'check_in' | 'play_round' | 'daily_game' | 'profile' | 'invite';

export interface Task {
  /** Stable id, for a client that wants to remember which it has shown. */
  key: string;
  /** The dictionary entry to render. `copy.games.tasks[copyKey]`. */
  copyKey: string;
  /**
   * What it pays this account, today.
   *
   * `exact: false` means the figure is a **ceiling** rather than a promise — a
   * game round pays what the round scores, so the task says "up to". The flag
   * travels rather than the copy key being different per case, because whether
   * a reward is exact is a property of the rule and not of the sentence.
   */
  points: number;
  exact: boolean;
  /** Already earned — for ever, or for today, depending on the rule. */
  done: boolean;
  sortOrder: number;
}

interface Row {
  key: string;
  copy_key: string;
  reward: string;
  sort_order: number;
}

/**
 * Every active task, in order, with this account's progress on each.
 *
 * One `calendar` call is made whatever the row set is, and only when a
 * check-in task is actually active — it is the heaviest thing here (a month of
 * ledger rows) and it is also the only source that can answer both halves of
 * the check-in task truthfully: what today pays, and whether today is taken.
 */
export async function tasksFor(db: Db, userId: string, at: Iso = now()): Promise<Task[]> {
  const rows = await db.all<Row>(
    `SELECT key, copy_key, reward, sort_order FROM daily_tasks
      WHERE active = 1 ORDER BY sort_order, key`,
  );
  if (rows.length === 0) return [];

  const needs = (reward: Reward) => rows.some((row) => row.reward === reward);

  const day = at.slice(0, 10);
  const calendar = needs('check_in') ? await checkin.calendar(db, { userId, at }) : null;

  const playedToday = needs('play_round')
    ? ((
        await db.get<{ n: number }>(
          `SELECT COUNT(*) AS n FROM game_sessions
            WHERE user_id = $u AND finished_at IS NOT NULL AND finished_at >= $from`,
          { u: userId, from: `${day}T00:00:00.000Z` },
        )
      )?.n ?? 0) > 0
    : false;

  /* The multiplier prices a game round and nothing else — `entitlements.ts`
     says so at the top and `gate.ts` must not apply it. A ceiling quoted
     without it would under-sell the round to a subscriber, which is the wrong
     direction for the one figure they are paying for. */
  const multiplier = needs('play_round')
    ? entitlements.entNumber(
        await entitlements.entitlementsFor(db, { userId }),
        'points_multiplier',
        1,
      )
    : 1;

  const profileDone = needs('profile')
    ? Boolean(
        (
          await db.get<{ profile_completed_at: string | null }>(
            `SELECT profile_completed_at FROM users WHERE id = $u`,
            { u: userId },
          )
        )?.profile_completed_at,
      )
    : false;

  const dailyGameDone = needs('daily_game') ? await dailyGamePaid(db, userId, at) : false;

  /**
   * The ceiling on one quiz round: five right, the clean-sweep bonus, and the
   * fastest speed band, through the plan multiplier and floored once — the same
   * order `games.finish` applies them in, which is what stops this figure and
   * the ledger's disagreeing by a point.
   */
  const roundCeiling = Math.floor(
    (CONFIG.games.quizQuestions * CONFIG.games.quizPerCorrect +
      CONFIG.games.quizPerfectBonus +
      (CONFIG.games.quizSpeedBands[0]?.points ?? 0)) *
      multiplier,
  );

  const resolve = (reward: string): { points: number; exact: boolean; done: boolean } | null => {
    switch (reward as Reward) {
      case 'check_in':
        /* Today's rung, plus the milestone if one lands on it — a player who is
           told "5 points" on the day that actually pays 20 plus a 100-point
           milestone has been under-sold their own streak. */
        return {
          points: (calendar?.todayPoints ?? CONFIG.earn.dailyCheckIn) + (calendar?.todayBonus ?? 0),
          exact: true,
          done: calendar?.claimedToday ?? false,
        };
      case 'play_round':
        return { points: roundCeiling, exact: false, done: playedToday };
      case 'daily_game':
        return { points: CONFIG.earn.dailyGame, exact: true, done: dailyGameDone };
      case 'profile':
        return { points: CONFIG.earn.profileComplete, exact: true, done: profileDone };
      case 'invite':
        /* Never done: §8.1 pays the referrer for **every** invited friend's
           first confirmed visit, so a second friend is worth what the first
           was. It used to hide once one referral had completed, which told a
           player the offer was over when it was not. Priced from the
           referrer's own row — the figure this prompt promises is what the
           person reading it is paid. */
        return { points: CONFIG.earn.referrerFirstVisit, exact: true, done: false };
      default:
        /* A row naming a rule this file does not implement has no price, and a
           task with no price is not shown. Left out rather than sent with a
           zero, because "0 points" is a thing the panel would render. */
        return null;
    }
  };

  return rows.flatMap((row) => {
    const resolved = resolve(row.reward);
    if (!resolved) return [];
    return [
      {
        key: row.key,
        copyKey: row.copy_key,
        points: resolved.points,
        exact: resolved.exact,
        done: resolved.done,
        sortOrder: row.sort_order,
      },
    ];
  });
}
