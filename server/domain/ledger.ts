/**
 * The points ledger — §2, and the spine of the product.
 *
 * The rule that shapes every function here: **the balance is not a number that
 * is edited, it is a sum that is derived.** `users.points_cache` exists so a
 * read does not scan a thousand rows, and it is written only by this module,
 * only alongside the entry that justifies it, and `reconcile()` proves it right
 * from the ledger whenever anyone asks. Nothing outside this file may touch it.
 *
 * **Points do not expire.** They used to — twelve months FIFO, with a longer
 * window sold on the paid plans and none at all on the top one — and the whole
 * apparatus is gone: `CONFIG.points` has no window left to read, nothing writes
 * an `expires_at` on an entry, and no job collects. A balance that quietly
 * drains is the thing a loyalty scheme is least forgiven for.
 *
 * The second rule survives that, and it is FIFO. `points_lots` is still one lot
 * per positive entry, consumed oldest-first, because a *spend* has to come out
 * of something: the lots are what make "you have 300 points" and "these are the
 * 300 points" the same claim, which is what a support ticket about a redemption
 * is asking. Expiry was a consumer of that ordering, never its reason.
 *
 * The ledger table itself is append-only. There is no UPDATE in this file
 * against `points_ledger` — a reversal is a compensating entry (§C3), because a
 * ledger you can edit is not evidence of anything.
 */
import type { Db } from '../db/db.ts';
import { newId } from './ids.ts';
import { DomainError } from './errors.ts';
import { now, type Iso } from './time.ts';

/**
 * Why a points entry exists, in the ledger's own words.
 *
 * One reason per *kind* of thing that pays, and `source_kind` carries the finer
 * detail underneath it — `venue_bonus` + `first_visit`, `venue_bonus` +
 * `new_category`, `occasion` + `birthday`. The split matters because the reason
 * is what a customer reads in their history and what the schema's CHECK
 * constrains, while `source_kind` is what the arithmetic keys off; inventing a
 * top-level reason per bonus would mean a migration every time §2b grows a row.
 *
 * This union and the CHECK on `points_ledger.reason` are one list written twice.
 * They must agree, or the insert fails at the counter rather than in a test.
 */
export type EarnReason =
  | 'game_win'
  | 'scan_earn'
  | 'spend_bonus'
  | 'venue_bonus'
  | 'stamp_complete'
  | 'review'
  | 'referral'
  | 'welcome_bonus'
  | 'profile_bonus'
  | 'check_in'
  | 'streak_milestone'
  | 'occasion'
  | 'stipend'
  | 'adjustment';
export type SpendReason = 'voucher_redeem' | 'gift_card_redeem';

export interface EarnInput {
  userId: string;
  points: number;
  reason: EarnReason;
  sourceKind?: string;
  sourceRef?: string;
  venueId?: string | null;
  /** §12a.4. A paid tier's earn multiplier, recorded on the entry. */
  multiplier?: number;
  at?: Iso;
}

export interface LedgerEntry {
  id: string;
  user_id: string;
  delta: number;
  reason: string;
  source_kind: string | null;
  source_ref: string | null;
  venue_id: string | null;
  multiplier: number;
  status: string;
  created_at: string;
  expires_at: string | null;
}

/** The balance, from the ledger. The cache is never consulted here. */
export async function balance(db: Db, userId: string): Promise<number> {
  const row = await db.get<{ total: number | null }>(
    `SELECT SUM(delta) AS total FROM points_ledger
      WHERE user_id = $u AND status = 'committed'`,
    { u: userId },
  );
  return row?.total ?? 0;
}

/** The fast read. Equal to `balance()` or the database is broken — see `reconcile`. */
export async function cachedBalance(db: Db, userId: string): Promise<number> {
  return (await db.get<{ points_cache: number }>(`SELECT points_cache FROM users WHERE id = $u`, {
    u: userId,
  }))?.points_cache ?? 0;
}

/** Recompute the cache from the ledger. Returns the drift it corrected. */
export async function reconcile(db: Db, userId: string): Promise<number> {
  const truth = await balance(db, userId);
  const cached = await cachedBalance(db, userId);
  if (truth !== cached) {
    await db.run(`UPDATE users SET points_cache = $b WHERE id = $u`, { b: truth, u: userId });
  }
  return truth - cached;
}

/**
 * Points earned today from games.
 *
 * Games only, and it no longer gates anything: it is the *record* of a day's
 * play, which the streak, the profile screen and the console all read. A scan, a
 * referral and a welcome bonus are each gated by something a client cannot forge
 * (a cashier's confirmation, another human signing up), so they were never
 * counted here and still are not.
 */
export async function gamePointsToday(db: Db, userId: string, day: string): Promise<number> {
  return (
    (await db.get<{ total: number | null }>(
      `SELECT game_points AS total FROM daily_counters WHERE user_id = $u AND day = $d`,
      { u: userId, d: day },
    ))?.total ?? 0
  );
}

/**
 * Grant points.
 *
 * Writes the entry, opens its FIFO lot, and moves the cache — all three or none
 * of them, which is why it must be called inside a transaction (the gate's
 * commit already is one; `db.tx` nests).
 *
 * **Nothing is trimmed here any more.** There used to be a daily points ceiling
 * that this function applied to `game_win` by cutting the last round of the day
 * down to whatever was left, and it is gone: a flat ceiling can only say "no
 * more today" to a player who has done nothing wrong, and it says it identically
 * to somebody grinding one game and somebody enjoying seven.
 *
 * A per-game decay curve replaced it for a day and is gone too, for the
 * opposite reason: once every finished round cost energy, a free player got
 * six rounds and the curve never reached the rung that bit. **Energy is the
 * whole bound now** — one per finished round, refilling on a clock — and it
 * sits in `games.ts` where the round is scored. `earn` grants what it is
 * handed; deciding how much that should be belongs to the caller.
 */
export async function earn(db: Db, input: EarnInput): Promise<{ entry: LedgerEntry }> {
  const at = input.at ?? now();
  const multiplier = input.multiplier ?? 1;
  const points = Math.floor(input.points * multiplier);

  if (points < 0) throw new DomainError('bad_request', 'earn takes a positive amount');
  /* `points < 0` is false for NaN, and a NaN delta reaches SQLite as a NOT NULL
     violation two frames deeper — which reads as a corrupt schema rather than as
     the missing config row that actually caused it. The ledger is evidence; it
     refuses to write something that is not a number at the door. */
  if (!Number.isFinite(points)) {
    throw new DomainError('bad_request', 'earn takes a finite amount', { points: input.points });
  }

  /* The counter is written *before* the zero check, because a round that scored
     nothing is still a round played and `plays` is what says so — a quiz where
     every answer was wrong pays zero and cost a full energy. Skipping it, which
     is what the old early return for a zero-point entry did, undercounts exactly
     the days somebody had a bad run. */
  if (input.reason === 'game_win') {
    await db.run(
      `INSERT INTO daily_counters (user_id, day, game_points, plays)
       VALUES ($u, $d, $p, 1)
       ON CONFLICT (user_id, day) DO UPDATE
         SET game_points = daily_counters.game_points + $p, plays = daily_counters.plays + 1`,
      { u: input.userId, d: at.slice(0, 10), p: points },
    );
  }

  const entry = await writeEntry(db, input.userId, points, input.reason, input, at, multiplier);

  if (points > 0) {
    await db.run(
      `INSERT INTO points_lots (ledger_id, user_id, earned_at, expires_at, amount)
       VALUES ($i, $u, $e, $x, $a)`,
      /* The entry's `expires_at` is NULL — nothing expires any more — and the
         lot's column is NOT NULL, so "never" is written there as the sentinel
         instead. The lot has to exist whatever its date: a spend consumes lots,
         and a lot that is not there is a balance that cannot be spent. */
      { i: entry.id, u: input.userId, e: at, x: NEVER, a: points },
    );
    await db.run(`UPDATE users SET points_cache = points_cache + $p WHERE id = $u`, {
      p: points,
      u: input.userId,
    });
  }

  return { entry };
}

/**
 * Spend points, oldest lot first.
 *
 * Throws `insufficient_points` rather than going negative — there is no credit
 * in a loyalty balance, and a redemption that overdraws is the one bug that
 * would let somebody spend the same points twice by racing two requests. The
 * transaction plus the lot arithmetic is what makes that race lose.
 */
export async function spend(
  db: Db,
  input: { userId: string; points: number; reason: SpendReason; sourceKind?: string; sourceRef?: string; venueId?: string | null; at?: Iso },
): Promise<LedgerEntry> {
  const at = input.at ?? now();
  if (input.points <= 0) throw new DomainError('bad_request', 'spend takes a positive amount');

  const available = await balance(db, input.userId);
  if (available < input.points) {
    throw new DomainError('insufficient_points', 'not enough points', {
      required: input.points,
      available,
    });
  }

  let remaining = input.points;
  /* Oldest first, and `rowid` is the tiebreak rather than the id: two entries
     written in the same millisecond have the same `earned_at`, and the ids are
     random, so ordering by id would consume them in an arbitrary order — which
     is not FIFO and quietly changes which batch expires when. `rowid` is
     insertion order, which is what "oldest" means when the clock cannot tell. */
  const lots = await db.all<{ ledger_id: string; amount: number; consumed: number }>(
    `SELECT ledger_id, amount, consumed FROM points_lots
      WHERE user_id = $u AND expired = 0 AND consumed < amount
      ORDER BY earned_at ASC, rowid ASC`,
    { u: input.userId },
  );

  for (const lot of lots) {
    if (remaining === 0) break;
    const take = Math.min(remaining, lot.amount - lot.consumed);
    await db.run(`UPDATE points_lots SET consumed = consumed + $t WHERE ledger_id = $i`, {
      t: take,
      i: lot.ledger_id,
    });
    remaining -= take;
  }

  /* The balance said yes and the lots said no. That is a corrupted ledger, not
     a user error, and it must not be papered over with a partial spend. */
  if (remaining > 0) {
    throw new DomainError('internal', 'points lots do not cover a balance that says they do', {
      shortfall: remaining,
    });
  }

  const entry = await writeEntry(
    db,
    input.userId,
    -input.points,
    input.reason,
    { sourceKind: input.sourceKind, sourceRef: input.sourceRef, venueId: input.venueId },
    at,
    1,
  );
  await db.run(`UPDATE users SET points_cache = points_cache - $p WHERE id = $u`, {
    p: input.points,
    u: input.userId,
  });
  return entry;
}

/**
 * Has this account already been paid a once-ever bonus of this kind?
 *
 * The ledger is the record of what was paid, so it is also the lock on paying it
 * again — the same move `reverse()` makes when it refuses to write a second
 * compensating entry against one original. For these grants `source_ref` carries
 * **the thing that must be unique** (the venue, the category, the milestone, the
 * completed card) rather than the transaction that happened to trigger it; that
 * is what makes this one indexed lookup on `idx_ledger_source` instead of a
 * scan, and it is why the transaction id is deliberately not there. Which visit
 * paid a first-visit bonus is answerable from `venue_id` and `created_at`;
 * whether one was ever paid has to be answerable in a single row.
 *
 * It lives here rather than beside any one caller because two modules now hold
 * once-ever grants — the gate's visit bonuses and the stamp-card completion in
 * `campaigns.ts` — and a guard against double payment written twice is a guard
 * that eventually disagrees with itself.
 */
export async function alreadyPaid(db: Db, userId: string, sourceKind: string, sourceRef: string): Promise<boolean> {
  return (
    (await db.get<{ id: string }>(
      `SELECT id FROM points_ledger
        WHERE user_id = $u AND source_kind = $k AND source_ref = $r LIMIT 1`,
      { u: userId, k: sourceKind, r: sourceRef },
    )) !== undefined
  );
}

/**
 * Reverse an entry (C3: fraud review, or a partner dispute).
 *
 * A compensating entry, and **only** a compensating entry. The original row is
 * left exactly as it was written — not marked, not flagged, not touched — which
 * is what "never mutating history" has to mean for a ledger whose balance is the
 * sum of its rows. Flagging the original *and* writing the compensation would
 * subtract the amount twice; that bug is why this comment is here.
 *
 * The lots are consumed alongside, so the FIFO pool stays equal to the balance
 * it is supposed to explain. If the points were already spent there is nothing
 * left to consume and the balance goes negative — which is the correct answer:
 * the account received value it was not entitled to, and the next earning pays
 * it back before anything else.
 */
export async function reverse(db: Db, ledgerId: string, note: string, at: Iso = now()): Promise<LedgerEntry> {
  const original = await db.get<LedgerEntry>(`SELECT * FROM points_ledger WHERE id = $i`, { i: ledgerId });
  if (!original) throw new DomainError('not_found', 'ledger entry not found');

  const already = await db.get<{ id: string }>(
    `SELECT id FROM points_ledger WHERE reason = 'reversal' AND source_ref = $i`,
    { i: ledgerId },
  );
  if (already) throw new DomainError('conflict', 'already reversed');

  return db.tx(async () => {
    let remaining = original.delta;
    /* Close the reversed batch first, then take the rest oldest-first — the
       points being clawed back are that batch's, wherever the arithmetic lands. */
    const own = await db.get<{ amount: number; consumed: number }>(
      `SELECT amount, consumed FROM points_lots WHERE ledger_id = $i AND expired = 0`,
      { i: ledgerId },
    );
    if (own) {
      remaining -= own.amount - own.consumed;
      await db.run(`UPDATE points_lots SET expired = 1 WHERE ledger_id = $i`, { i: ledgerId });
    }
    if (remaining > 0) {
      const lots = await db.all<{ ledger_id: string; amount: number; consumed: number }>(
        `SELECT ledger_id, amount, consumed FROM points_lots
          WHERE user_id = $u AND expired = 0 AND consumed < amount
          ORDER BY earned_at ASC, rowid ASC`,
        { u: original.user_id },
      );
      for (const lot of lots) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, lot.amount - lot.consumed);
        await db.run(`UPDATE points_lots SET consumed = consumed + $t WHERE ledger_id = $i`, {
          t: take,
          i: lot.ledger_id,
        });
        remaining -= take;
      }
    }

    const entry = await writeEntry(
      db,
      original.user_id,
      -original.delta,
      'reversal',
      { sourceKind: 'points_ledger', sourceRef: ledgerId, venueId: original.venue_id },
      at,
      1,
      note,
    );
    await db.run(`UPDATE users SET points_cache = points_cache - $d WHERE id = $u`, {
      d: original.delta,
      u: original.user_id,
    });
    return entry;
  });
}

export async function history(db: Db, userId: string, limit = 50, before?: string): Promise<LedgerEntry[]> {
  return await db.all<LedgerEntry>(
    `SELECT * FROM points_ledger
      WHERE user_id = $u AND ($b IS NULL OR created_at < $b)
      ORDER BY created_at DESC, id DESC LIMIT $l`,
    { u: userId, b: before ?? null, l: limit },
  );
}

/* ───────────────────────────────────────────────────────────────── private ── */

/**
 * The far end of time, for a lot — which is now every lot.
 *
 * `points_lots.expires_at` is NOT NULL and the lot has to be in the FIFO pool
 * regardless, because a spend consumes lots and a lot that is not there is a
 * balance that cannot be spent. So "never" cannot be written as the NULL the
 * ledger entry carries, and this sentinel is the same statement in a column that
 * will not hold the honest one. It is kept rather than removed with the expiry
 * job: the column outlives this process, the rows the old job left behind still
 * carry real dates, and a sentinel is what tells a reader of the table which
 * batches predate the change.
 */
const NEVER: Iso = '9999-12-31T23:59:59.999Z';

async function writeEntry(
  db: Db,
  userId: string,
  delta: number,
  reason: string,
  source: { sourceKind?: string; sourceRef?: string; venueId?: string | null },
  at: Iso,
  multiplier: number,
  _note?: string,
): Promise<LedgerEntry> {
  const id = newId('led');
  /* Always NULL. Points do not expire, and NULL is the only value that says so
     in a column whose other rows carry dates: a far-future date would read as a
     window somebody chose, and would come back to life the moment anything
     started asking `expires_at <= now` again. The column stays because the rows
     the old twelve-month rule wrote are still in the live database and a ledger
     is not rewritten to match a new policy. */
  const expires = null;
  await db.run(
    `INSERT INTO points_ledger
       (id, user_id, delta, reason, source_ref, source_kind, multiplier, status, venue_id,
        created_at, expires_at)
     VALUES ($i, $u, $d, $r, $sr, $sk, $m, 'committed', $v, $c, $e)`,
    {
      i: id,
      u: userId,
      d: delta,
      r: reason,
      sr: source.sourceRef ?? null,
      sk: source.sourceKind ?? null,
      m: multiplier,
      v: source.venueId ?? null,
      c: at,
      e: expires,
    },
  );
  return {
    id,
    user_id: userId,
    delta,
    reason,
    source_kind: source.sourceKind ?? null,
    source_ref: source.sourceRef ?? null,
    venue_id: source.venueId ?? null,
    multiplier,
    status: 'committed',
    created_at: at,
    expires_at: expires,
  };
}
