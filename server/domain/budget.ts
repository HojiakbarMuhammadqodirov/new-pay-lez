/**
 * The budget pools — §4.2–4.4 and §5.4.
 *
 * **A pool has exactly three states and they exhaust it**: spent, reserved,
 * available. That sentence is the whole module. `available` is never stored,
 * because a stored available is a fourth number that can disagree with the other
 * three — and a bar that disagrees is how an owner commits the same złoty twice.
 * It is computed, every time, as `base − spent − reserved`.
 *
 * The two-phase pattern (§4.3) is why `reserved` exists at all. A voucher is
 * issued long before it is redeemed, and between those two moments the venue is
 * *committed* to a discount whose exact size is not yet known — it depends on a
 * bill nobody has rung up. So issue reserves an estimate built from the average
 * check, redemption releases the estimate and debits the actual, and expiry
 * releases it back. Drift between estimate and actual is corrected on every
 * redemption, which is what stops a wrong average check from compounding into
 * overspend.
 *
 * Every function here takes a `Db` and expects to be inside a transaction when
 * it is called as part of a larger commit. `db.tx` nests, so calling one on its
 * own is also safe.
 */
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import { DomainError } from './errors.ts';
import { newId } from './ids.ts';
import { localMonth, now, type Iso } from './time.ts';

export type Allocation = 'loyalty' | 'voucher';

export interface Pool {
  allocation: Allocation;
  /** The allocation's share of the budget, plus top-ups, plus rebalances. */
  base: number;
  spent: number;
  reserved: number;
  /** `base − spent − reserved`. Can go slightly negative — see `toleranceOf`. */
  available: number;
}

export interface BudgetView {
  id: string;
  venueId: string;
  period: string;
  currency: string;
  /** The sum of both bases. Not `budgets.total_minor`, which excludes top-ups. */
  total: number;
  loyalty: Pool;
  voucher: Pool;
}

interface BudgetRow {
  id: string;
  venue_id: string;
  period: string;
  currency: string;
  total_minor: number;
  loyalty_bp: number;
}

/**
 * The venue's budget for the period that contains `at`, created if absent.
 *
 * Periods are calendar months in *venue-local* time (§15), so a Kraków venue's
 * October budget starts at 23:00 UTC on 30 September and a Tashkent one's starts
 * five hours earlier. Reading the period off the server's clock would put the
 * first hour of every month in the wrong pool.
 */
export function budgetFor(db: Db, venueId: string, at: Iso = now()): BudgetView {
  const venue = db.get<{ timezone: string; currency: string }>(
    `SELECT timezone, currency FROM venues WHERE id = $v`,
    { v: venueId },
  );
  if (!venue) throw new DomainError('not_found', 'venue not found');

  const period = localMonth(at, venue.timezone);
  let row = db.get<BudgetRow>(`SELECT * FROM budgets WHERE venue_id = $v AND period = $p`, {
    v: venueId,
    p: period,
  });

  if (!row) {
    /* A new month inherits last month's size and split rather than starting at
       zero: a budget that silently becomes zero on the 1st turns every voucher
       in the app off overnight, which reads to customers as the program ending.
       An owner who wants zero has to say so. */
    const previous = db.get<BudgetRow>(
      `SELECT * FROM budgets WHERE venue_id = $v ORDER BY period DESC LIMIT 1`,
      { v: venueId },
    );
    const id = newId('bdg');
    db.run(
      `INSERT INTO budgets (id, venue_id, period, currency, total_minor, loyalty_bp, created_at, updated_at)
       VALUES ($i, $v, $p, $c, $t, $l, $at, $at)`,
      {
        i: id,
        v: venueId,
        p: period,
        c: previous?.currency ?? venue.currency,
        t: previous?.total_minor ?? 0,
        l: previous?.loyalty_bp ?? CONFIG.loyalty.defaultLoyaltyBp,
        at,
      },
    );
    row = db.get<BudgetRow>(`SELECT * FROM budgets WHERE id = $i`, { i: id })!;
  }

  return viewOf(db, row);
}

export function viewById(db: Db, budgetId: string): BudgetView {
  const row = db.get<BudgetRow>(`SELECT * FROM budgets WHERE id = $i`, { i: budgetId });
  if (!row) throw new DomainError('not_found', 'budget not found');
  return viewOf(db, row);
}

function viewOf(db: Db, row: BudgetRow): BudgetView {
  const sums = db.all<{ allocation: Allocation; kind: string; total: number }>(
    `SELECT allocation, kind, SUM(amount_minor) AS total
       FROM budget_movements WHERE budget_id = $b GROUP BY allocation, kind`,
    { b: row.id },
  );

  const sum = (allocation: Allocation, kind: string) =>
    sums.find((s) => s.allocation === allocation && s.kind === kind)?.total ?? 0;

  /* The split is applied to the loyalty side and the voucher side takes the
     remainder, so the two always add up to the total exactly. Splitting both by
     percentage would lose a grosz to rounding on most budgets, and a pool that
     is a grosz short is a pool whose three states do not exhaust it. */
  const loyaltyShare = Math.floor((row.total_minor * row.loyalty_bp) / 10_000);
  const shares: Record<Allocation, number> = {
    loyalty: loyaltyShare,
    voucher: row.total_minor - loyaltyShare,
  };

  const pool = (allocation: Allocation): Pool => {
    const base =
      shares[allocation] +
      sum(allocation, 'topup') +
      sum(allocation, 'rebalance_in') -
      sum(allocation, 'rebalance_out');
    const spent = sum(allocation, 'debit');
    const reserved = sum(allocation, 'reserve') - sum(allocation, 'release');
    return { allocation, base, spent, reserved, available: base - spent - reserved };
  };

  const loyalty = pool('loyalty');
  const voucher = pool('voucher');
  return {
    id: row.id,
    venueId: row.venue_id,
    period: row.period,
    currency: row.currency,
    total: loyalty.base + voucher.base,
    loyalty,
    voucher,
  };
}

/**
 * §4.4. The tolerance buffer, in money.
 *
 * It is a share of the *budget*, not a flat number, because a 200 zł pool and a
 * 20 000 zł pool are wrong by different amounts when an estimate misses. The
 * buffer exists so a customer who legitimately earned a voucher is not refused
 * at the counter over a few złoty of estimation error; the per-voucher cap is
 * what keeps the worst case bounded.
 */
export const toleranceOf = (view: BudgetView): number =>
  Math.floor((view.total * CONFIG.vouchers.toleranceBp) / 10_000);

export const canSpend = (pool: Pool, amount: number, tolerance: number): boolean =>
  pool.available + tolerance >= amount;

function move(
  db: Db,
  budgetId: string,
  allocation: Allocation,
  kind: 'reserve' | 'release' | 'debit' | 'topup' | 'rebalance_in' | 'rebalance_out',
  amount: number,
  source: { kind?: string; ref?: string; note?: string } = {},
  at: Iso = now(),
): void {
  if (amount <= 0) return;
  db.run(
    `INSERT INTO budget_movements
       (id, budget_id, allocation, kind, amount_minor, source_kind, source_ref, note, created_at)
     VALUES ($i, $b, $a, $k, $m, $sk, $sr, $n, $t)`,
    {
      i: newId('mov'),
      b: budgetId,
      a: allocation,
      k: kind,
      m: amount,
      sk: source.kind ?? null,
      sr: source.ref ?? null,
      n: source.note ?? null,
      t: at,
    },
  );
}

/**
 * Commit money to something not yet redeemed.
 *
 * Refuses when the pool cannot carry it *including* the tolerance buffer, and
 * says how far short it was — the caller (voucher issue, reward earn) turns that
 * into either a degraded tier (§4.4) or a refusal.
 */
export function reserve(
  db: Db,
  budgetId: string,
  allocation: Allocation,
  amount: number,
  source: { kind?: string; ref?: string } = {},
  at: Iso = now(),
): void {
  const view = viewById(db, budgetId);
  const pool = allocation === 'loyalty' ? view.loyalty : view.voucher;
  if (!canSpend(pool, amount, toleranceOf(view))) {
    throw new DomainError('budget_exhausted', 'allocation cannot cover this reserve', {
      allocation,
      available: pool.available,
      requested: amount,
    });
  }
  move(db, budgetId, allocation, 'reserve', amount, source, at);
}

/** Give a reserve back — the voucher expired, or the redemption is now known. */
export function release(
  db: Db,
  budgetId: string,
  allocation: Allocation,
  amount: number,
  source: { kind?: string; ref?: string } = {},
  at: Iso = now(),
): void {
  move(db, budgetId, allocation, 'release', amount, source, at);
}

/**
 * Spend, for real.
 *
 * Not guarded by `canSpend`: a debit only happens after the discount has already
 * been applied at a counter, and refusing it here would mean the money left the
 * venue without the pool recording it. The guard belongs at *reserve* time,
 * which is why reserve is the phase that can fail.
 */
export function debit(
  db: Db,
  budgetId: string,
  allocation: Allocation,
  amount: number,
  source: { kind?: string; ref?: string } = {},
  at: Iso = now(),
): void {
  move(db, budgetId, allocation, 'debit', amount, source, at);
}

/** §11.2. The partner's urgent lever: more money in the pool, right now. */
export function topUp(
  db: Db,
  budgetId: string,
  allocation: Allocation,
  amount: number,
  note: string,
  at: Iso = now(),
): BudgetView {
  if (amount <= 0) throw new DomainError('bad_request', 'top-up must be positive');
  move(db, budgetId, allocation, 'topup', amount, { kind: 'admin', note }, at);
  return viewById(db, budgetId);
}

/**
 * B6. Move money between the two allocations, atomically.
 *
 * The source must have the money *available* — not merely allocated. Moving
 * reserved money would break the promise that every reserve is honoured, which
 * is what a customer holding an unredeemed voucher is relying on.
 */
export function rebalance(
  db: Db,
  budgetId: string,
  from: Allocation,
  amount: number,
  at: Iso = now(),
): BudgetView {
  const to: Allocation = from === 'loyalty' ? 'voucher' : 'loyalty';
  return db.tx(() => {
    const view = viewById(db, budgetId);
    const source = from === 'loyalty' ? view.loyalty : view.voucher;
    if (amount <= 0) throw new DomainError('bad_request', 'rebalance must be positive');
    if (source.available < amount) {
      throw new DomainError('budget_exhausted', 'not enough available to move', {
        available: source.available,
        requested: amount,
      });
    }
    move(db, budgetId, from, 'rebalance_out', amount, { kind: 'admin' }, at);
    move(db, budgetId, to, 'rebalance_in', amount, { kind: 'admin' }, at);
    return viewById(db, budgetId);
  });
}

/**
 * B6 / §5.4. Should the dashboard offer a rebalance?
 *
 * Only when one side is genuinely near empty *and* the other has enough to be
 * worth moving. Prompting when both are healthy trains an owner to dismiss the
 * prompt, and then it is not there on the day it matters.
 */
export function rebalanceHint(view: BudgetView): { from: Allocation; to: Allocation; suggested: number } | null {
  const threshold = (view.total * CONFIG.loyalty.rebalancePromptBp) / 10_000;
  const pairs: Array<[Pool, Pool]> = [
    [view.loyalty, view.voucher],
    [view.voucher, view.loyalty],
  ];
  for (const [low, high] of pairs) {
    if (low.available < threshold && high.available > threshold * 3) {
      return {
        from: high.allocation,
        to: low.allocation,
        suggested: Math.floor(high.available / 2),
      };
    }
  }
  return null;
}

/**
 * §4.4. Which voucher tiers a venue may still issue.
 *
 * As the pool nears zero the *highest* tier stops first and the ladder degrades
 * downward, and the lowest tier never switches off. A program that vanishes
 * entirely when a budget runs low is a program customers stop trusting; one that
 * quietly offers 5% instead of 15% is one they keep using.
 */
export function tiersAvailable(view: BudgetView, tiers: Array<{ discount_pct: number; max_discount_minor: number }>): number[] {
  const pool = view.voucher;
  const floorBp = (view.total * CONFIG.vouchers.degradeAtBp) / 10_000;
  const ordered = [...tiers].sort((a, b) => a.discount_pct - b.discount_pct);
  if (ordered.length === 0) return [];

  const allowed = ordered.filter((tier) => tier.max_discount_minor <= pool.available);
  if (pool.available >= floorBp) return allowed.map((t) => t.discount_pct);

  /* Below the floor, only the cheapest tier survives — and it survives even if
     the pool cannot strictly cover it, because the tolerance buffer exists for
     exactly this customer. */
  return [ordered[0].discount_pct];
}
