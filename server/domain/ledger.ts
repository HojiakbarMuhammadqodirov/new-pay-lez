/**
 * The points ledger — §2, and the spine of the product.
 *
 * The rule that shapes every function here: **the balance is not a number that
 * is edited, it is a sum that is derived.** `users.points_cache` exists so a
 * read does not scan a thousand rows, and it is written only by this module,
 * only alongside the entry that justifies it, and `reconcile()` proves it right
 * from the ledger whenever anyone asks. Nothing outside this file may touch it.
 *
 * The second rule is FIFO (§2.3). Points expire a fixed window after they are
 * *earned*, so a spend has to know which earning it came out of; otherwise a
 * player who earns 100 in January and 100 in June, then spends 100, has a
 * balance that expires on a date nobody can name. `points_lots` is that
 * bookkeeping: one lot per positive entry, consumed oldest-first, so a spend
 * leaves the newest points standing and the expiry job knows exactly what is
 * left of each batch.
 *
 * The window is the *plan's*, not this file's — see `expiryFor` at the bottom.
 * §12a sells a longer one, and on the top tier sells none at all.
 *
 * The ledger table itself is append-only. There is no UPDATE in this file
 * against `points_ledger` — a reversal is a compensating entry (§C3), because a
 * ledger you can edit is not evidence of anything.
 */
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import * as entitlements from './entitlements.ts';
import { newId } from './ids.ts';
import { DomainError } from './errors.ts';
import { now, plusMonths, type Iso } from './time.ts';

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
export function balance(db: Db, userId: string): number {
  const row = db.get<{ total: number | null }>(
    `SELECT SUM(delta) AS total FROM points_ledger
      WHERE user_id = $u AND status = 'committed'`,
    { u: userId },
  );
  return row?.total ?? 0;
}

/** The fast read. Equal to `balance()` or the database is broken — see `reconcile`. */
export function cachedBalance(db: Db, userId: string): number {
  return db.get<{ points_cache: number }>(`SELECT points_cache FROM users WHERE id = $u`, {
    u: userId,
  })?.points_cache ?? 0;
}

/** Recompute the cache from the ledger. Returns the drift it corrected. */
export function reconcile(db: Db, userId: string): number {
  const truth = balance(db, userId);
  const cached = cachedBalance(db, userId);
  if (truth !== cached) {
    db.run(`UPDATE users SET points_cache = $b WHERE id = $u`, { b: truth, u: userId });
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
export function gamePointsToday(db: Db, userId: string, day: string): number {
  return (
    db.get<{ total: number | null }>(
      `SELECT game_points AS total FROM daily_counters WHERE user_id = $u AND day = $d`,
      { u: userId, d: day },
    )?.total ?? 0
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
 * to somebody grinding one game and somebody enjoying seven. The bound moved to
 * where it can see what is being played — the per-game decay curve in `games.ts`
 * (`CONFIG.games.decay`), which pays a fourth round of the *same* game less than
 * the first and leaves the rest of the day alone. `earn` grants what it is
 * handed; deciding how much that should be belongs to the caller.
 */
export function earn(db: Db, input: EarnInput): { entry: LedgerEntry } {
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

  /* The counter is still written, and it is written *before* the zero check: a
     round the decay curve paid nothing for is still a round played, and `plays`
     is what says so. Skipping it — which is what the old early return for a
     zero-point entry did — was harmless while zero was an edge case and is a
     miscount now that it is the fifth round of anything. */
  if (input.reason === 'game_win') {
    db.run(
      `INSERT INTO daily_counters (user_id, day, game_points, plays)
       VALUES ($u, $d, $p, 1)
       ON CONFLICT (user_id, day) DO UPDATE
         SET game_points = game_points + $p, plays = plays + 1`,
      { u: input.userId, d: at.slice(0, 10), p: points },
    );
  }

  const entry = writeEntry(db, input.userId, points, input.reason, input, at, multiplier);

  if (points > 0) {
    db.run(
      `INSERT INTO points_lots (ledger_id, user_id, earned_at, expires_at, amount)
       VALUES ($i, $u, $e, $x, $a)`,
      /* The entry's `expires_at` is NULL when the plan says these points never
         expire; the lot's column is NOT NULL, and the lot has to exist anyway or
         a spend could not consume points the balance says are there. So a
         never-expiring lot carries the sentinel instead: `runExpiry` asks for
         `expires_at <= now` and a date eight thousand years out never answers. */
      { i: entry.id, u: input.userId, e: at, x: entry.expires_at ?? NEVER, a: points },
    );
    db.run(`UPDATE users SET points_cache = points_cache + $p WHERE id = $u`, {
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
export function spend(
  db: Db,
  input: { userId: string; points: number; reason: SpendReason; sourceKind?: string; sourceRef?: string; venueId?: string | null; at?: Iso },
): LedgerEntry {
  const at = input.at ?? now();
  if (input.points <= 0) throw new DomainError('bad_request', 'spend takes a positive amount');

  const available = balance(db, input.userId);
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
  const lots = db.all<{ ledger_id: string; amount: number; consumed: number }>(
    `SELECT ledger_id, amount, consumed FROM points_lots
      WHERE user_id = $u AND expired = 0 AND consumed < amount
      ORDER BY earned_at ASC, rowid ASC`,
    { u: input.userId },
  );

  for (const lot of lots) {
    if (remaining === 0) break;
    const take = Math.min(remaining, lot.amount - lot.consumed);
    db.run(`UPDATE points_lots SET consumed = consumed + $t WHERE ledger_id = $i`, {
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

  const entry = writeEntry(
    db,
    input.userId,
    -input.points,
    input.reason,
    { sourceKind: input.sourceKind, sourceRef: input.sourceRef, venueId: input.venueId },
    at,
    1,
  );
  db.run(`UPDATE users SET points_cache = points_cache - $p WHERE id = $u`, {
    p: input.points,
    u: input.userId,
  });
  return entry;
}

/**
 * The expiry job (§2.3).
 *
 * Runs over every lot past its anniversary, writes one negative `expiry` entry
 * per lot for what is left of it, and marks the lot closed. One entry per lot
 * rather than one per user, because "which points expired" is a question a
 * support ticket asks and a summed entry cannot answer.
 */
export function runExpiry(db: Db, at: Iso = now()): { entries: number; points: number } {
  const due = db.all<{ ledger_id: string; user_id: string; amount: number; consumed: number }>(
    `SELECT ledger_id, user_id, amount, consumed FROM points_lots
      WHERE expired = 0 AND expires_at <= $t`,
    { t: at },
  );

  let entries = 0;
  let points = 0;
  db.tx(() => {
    for (const lot of due) {
      const left = lot.amount - lot.consumed;
      db.run(`UPDATE points_lots SET expired = 1 WHERE ledger_id = $i`, { i: lot.ledger_id });
      if (left <= 0) continue;
      writeEntry(
        db,
        lot.user_id,
        -left,
        'expiry',
        { sourceKind: 'points_lot', sourceRef: lot.ledger_id },
        at,
        1,
      );
      db.run(`UPDATE users SET points_cache = points_cache - $p WHERE id = $u`, {
        p: left,
        u: lot.user_id,
      });
      entries += 1;
      points += left;
    }
  });
  return { entries, points };
}

/** Lots expiring inside the warning window, for the §9.1 notification. */
export function expiringSoon(db: Db, userId: string, at: Iso = now()) {
  const horizon = plusMonths(at, 0);
  const until = new Date(
    new Date(horizon).getTime() + CONFIG.points.expiryWarningDays * 86_400_000,
  ).toISOString();
  return db.all<{ expires_at: string; points: number }>(
    `SELECT expires_at, SUM(amount - consumed) AS points FROM points_lots
      WHERE user_id = $u AND expired = 0 AND consumed < amount
        AND expires_at > $now AND expires_at <= $until
      GROUP BY expires_at ORDER BY expires_at`,
    { u: userId, now: at, until },
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
export function reverse(db: Db, ledgerId: string, note: string, at: Iso = now()): LedgerEntry {
  const original = db.get<LedgerEntry>(`SELECT * FROM points_ledger WHERE id = $i`, { i: ledgerId });
  if (!original) throw new DomainError('not_found', 'ledger entry not found');

  const already = db.get<{ id: string }>(
    `SELECT id FROM points_ledger WHERE reason = 'reversal' AND source_ref = $i`,
    { i: ledgerId },
  );
  if (already) throw new DomainError('conflict', 'already reversed');

  return db.tx(() => {
    let remaining = original.delta;
    /* Close the reversed batch first, then take the rest oldest-first — the
       points being clawed back are that batch's, wherever the arithmetic lands. */
    const own = db.get<{ amount: number; consumed: number }>(
      `SELECT amount, consumed FROM points_lots WHERE ledger_id = $i AND expired = 0`,
      { i: ledgerId },
    );
    if (own) {
      remaining -= own.amount - own.consumed;
      db.run(`UPDATE points_lots SET expired = 1 WHERE ledger_id = $i`, { i: ledgerId });
    }
    if (remaining > 0) {
      const lots = db.all<{ ledger_id: string; amount: number; consumed: number }>(
        `SELECT ledger_id, amount, consumed FROM points_lots
          WHERE user_id = $u AND expired = 0 AND consumed < amount
          ORDER BY earned_at ASC, rowid ASC`,
        { u: original.user_id },
      );
      for (const lot of lots) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, lot.amount - lot.consumed);
        db.run(`UPDATE points_lots SET consumed = consumed + $t WHERE ledger_id = $i`, {
          t: take,
          i: lot.ledger_id,
        });
        remaining -= take;
      }
    }

    const entry = writeEntry(
      db,
      original.user_id,
      -original.delta,
      'reversal',
      { sourceKind: 'points_ledger', sourceRef: ledgerId, venueId: original.venue_id },
      at,
      1,
      note,
    );
    db.run(`UPDATE users SET points_cache = points_cache - $d WHERE id = $u`, {
      d: original.delta,
      u: original.user_id,
    });
    return entry;
  });
}

export function history(db: Db, userId: string, limit = 50, before?: string): LedgerEntry[] {
  return db.all<LedgerEntry>(
    `SELECT * FROM points_ledger
      WHERE user_id = $u AND ($b IS NULL OR created_at < $b)
      ORDER BY created_at DESC, id DESC LIMIT $l`,
    { u: userId, b: before ?? null, l: limit },
  );
}

/* ───────────────────────────────────────────────────────────────── private ── */

/**
 * The far end of time, for a lot that never expires.
 *
 * `points_lots.expires_at` is NOT NULL and the lot has to be in the FIFO pool
 * whatever its expiry — a spend consumes lots, so a lot that is not there is a
 * balance that cannot be spent. "Never" therefore cannot be written as NULL the
 * way it can on the ledger entry, and a sentinel is the same statement in a
 * column that will not hold the honest one. Every query that collects or warns
 * about a lot asks for a date at or before some real moment (`runExpiry`,
 * `expiringSoon`), and this answers none of them; FIFO order is `earned_at`, so
 * it does not disturb which points a spend takes either.
 */
const NEVER: Iso = '9999-12-31T23:59:59.999Z';

/**
 * When this earning expires — §2.3 crossed with §12a.
 *
 * The window is a *plan entitlement* (`points_expiry_months`), not a constant.
 * This file used to read `CONFIG.points.expiryMonths` and stop there, which
 * meant a subscriber who was sold a longer window did not get one: the config
 * value is the floor the free plan sits on, and the fallback for an account
 * whose plan is silent about it.
 *
 * **Zero months means never**, and it is written as a NULL `expires_at` rather
 * than as a distant date, because NULL is the only value the expiry job cannot
 * misread. That is what the top tier buys.
 */
function expiryFor(db: Db, userId: string, at: Iso): Iso | null {
  const months = entitlements.entNumber(
    entitlements.entitlementsFor(db, { userId }),
    'points_expiry_months',
    CONFIG.points.expiryMonths,
  );
  /* `<= 0` rather than `=== 0`: a negative window is a typo in a config row, and
     the safe reading of a typo is "do not collect somebody's points", not "they
     expired before they were earned". */
  return months <= 0 ? null : plusMonths(at, months);
}

function writeEntry(
  db: Db,
  userId: string,
  delta: number,
  reason: string,
  source: { sourceKind?: string; sourceRef?: string; venueId?: string | null },
  at: Iso,
  multiplier: number,
  _note?: string,
): LedgerEntry {
  const id = newId('led');
  /* §2.3: the expiry date belongs to the *earning*. A spend has none, and a
     negative entry with one would be a lot that could expire twice. The plan is
     only consulted for a positive delta, so a reversal or an expiry entry costs
     no extra reads. */
  const expires = delta > 0 ? expiryFor(db, userId, at) : null;
  db.run(
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
