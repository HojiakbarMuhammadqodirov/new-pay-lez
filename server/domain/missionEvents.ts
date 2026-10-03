/**
 * The facts a mission needs that no other table writes down — rulebook §8.
 *
 * Almost every mission is *derived*: a finished round, a confirmed visit, a
 * ledger entry, a profile field. `domain/missions.ts` reads those rows and
 * stores nothing of its own, for the same reason the balance and the energy
 * tank are sums rather than counters. This module is the exception, and it is
 * deliberately small: it records the handful of facts that are computed at the
 * moment something happens and then thrown away, so that a mission asked about
 * later still has something to read.
 *
 * Today that is one kind, `round`: **a paid round's performance**, 0–100.
 * `games.finish` computes it from the round's events, prices the round from it
 * and discards it — `game_sessions.score` is the points banked, which carries
 * the decay, the featured ×1.5 and the plan, and so is a different number for
 * two identical performances. "Flawless" (100% today) and "Quiz master" (100%
 * in every quiz this week) are questions about performance *in a period*, and
 * `player_game_bests` only knows the best ever.
 *
 * **It imports nothing from the domain layer**, on purpose. It is called from
 * inside `games.finish`, and `missions.ts` imports `games.ts` to read the
 * featured rotation and the tank; a recorder living in `missions.ts` would make
 * the two modules import each other. A leaf module has no cycle to get wrong.
 *
 * One call site per kind, each a single line inside the transaction that did
 * the thing — so the event commits or rolls back with the fact it describes.
 */
import type { Db } from '../db/db.ts';
import { newId } from './ids.ts';
import { now, type Iso } from './time.ts';

/** The kinds a mission reads. A union rather than a string so a typo at a call
 *  site is a type error rather than a mission that never completes. */
export type MissionEventKind = 'round';

export async function record(
  db: Db,
  input: {
    userId: string;
    kind: MissionEventKind;
    /** What it is about — for `round`, the game session id. */
    ref?: string | null;
    /** A category of the thing — for `round`, the game type. */
    subject?: string | null;
    /** The measurement — for `round`, the performance 0..100. */
    value?: number;
    at?: Iso;
  },
): Promise<void> {
  await db.run(
    `INSERT INTO mission_events (id, user_id, kind, ref, subject, value, created_at)
     VALUES ($i, $u, $k, $r, $s, $v, $t)`,
    {
      i: newId('mev'),
      u: input.userId,
      k: input.kind,
      r: input.ref ?? null,
      s: input.subject ?? null,
      /* Rounded because the column is an integer and a performance can carry a
         fraction (Food Cross is `score / 2000 × 100`); floored rather than
         rounded so 99.6 is never recorded as the 100 "Flawless" asks for. */
      v: Math.floor(input.value ?? 0),
      t: input.at ?? now(),
    },
  );
}
