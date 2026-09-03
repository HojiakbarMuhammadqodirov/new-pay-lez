/**
 * Vouchers — §4. Points in, a percentage off, bounded by money.
 *
 * The load-bearing sentence of the section is "**enforcement is on money, at
 * redemption — never a pre-computed voucher count**". A count is a lie the
 * moment two customers spend different amounts, and it is the lie that lets a
 * pool overspend: twenty 10% vouchers is between 40 zł and 500 zł depending on
 * who redeems them. So the count the dashboard shows is an *estimate* built from
 * the average check, and the thing that actually stops is the pool.
 *
 * The two-phase pattern lives here and in `budget.ts` together: issue reserves
 * an estimate, redemption releases it and debits the actual, expiry releases it
 * back. Nothing else may write a voucher's budget movements.
 */
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import * as budget from './budget.ts';
import * as entitlements from './entitlements.ts';
import { DomainError } from './errors.ts';
import { newId, voucherCode } from './ids.ts';
import * as ledger from './ledger.ts';
import { discountCost } from './money.ts';
import { now, plusDays, type Iso } from './time.ts';
import { averageCheck, getVenue, type Venue } from './venues.ts';

export interface Tier {
  id: string;
  venue_id: string;
  discount_pct: number;
  points_cost: number;
  max_discount_minor: number;
  active: number;
}

export interface IssuedVoucher {
  id: string;
  user_id: string;
  venue_id: string;
  tier_id: string;
  discount_pct: number;
  max_discount_minor: number;
  points_spent: number;
  reserved_minor: number;
  spent_minor: number;
  code: string;
  status: 'active' | 'redeemed' | 'expired' | 'cancelled';
  budget_id: string | null;
  transaction_id: string | null;
  issued_at: string;
  expires_at: string;
  redeemed_at: string | null;
}

export const tiersFor = async (db: Db, venueId: string): Promise<Tier[]> =>
  await db.all<Tier>(
    `SELECT * FROM voucher_tiers WHERE venue_id = $v AND active = 1 ORDER BY discount_pct`,
    { v: venueId },
  );

/**
 * §4.3. What a voucher is expected to cost when it is issued.
 *
 * `min(avg_check × discount%, max_per_voucher)` — the cap is what makes the
 * estimate safe to be wrong. If the median check doubles overnight the reserve
 * is still bounded by a number the partner set themselves.
 */
export const estimateCost = (avgCheckMinor: number, pct: number, capMinor: number): number =>
  discountCost(avgCheckMinor, pct, capMinor);

/**
 * The tier ladder as the app should see it: what it costs, what it is worth,
 * and whether it can be issued right now.
 *
 * `available` is the §4.4 degradation: as the pool empties the top of the ladder
 * closes first and the bottom rung stays open, so a customer is offered 5%
 * rather than nothing.
 */
export async function ladder(db: Db, venueId: string, at: Iso = now()) {
  const venue = await getVenue(db, venueId);
  const tiers = await tiersFor(db, venueId);
  const view = await budget.budgetFor(db, venueId, at);
  const open = new Set(budget.tiersAvailable(view, tiers));
  const check = await averageCheck(db, venue, at);

  return tiers.map((tier) => ({
    id: tier.id,
    discountPct: tier.discount_pct,
    pointsCost: tier.points_cost,
    maxDiscountMinor: tier.max_discount_minor,
    estimateMinor: estimateCost(check.minor, tier.discount_pct, tier.max_discount_minor),
    /* B6: an estimate of how many this pool could still fund. Explicitly not a
       cap — the label the API sends says so, and the client renders it that way. */
    estimatedRemaining: Math.max(
      0,
      Math.floor(
        view.voucher.available /
          Math.max(1, estimateCost(check.minor, tier.discount_pct, tier.max_discount_minor)),
      ),
    ),
    available: open.has(tier.discount_pct),
  }));
}

/**
 * Convert points into a voucher (§4.3, phase one).
 *
 * Order matters and is not arbitrary: reserve the money *first*, then spend the
 * points. Reversed, a customer whose venue has just run out of budget would lose
 * their points to a voucher that could not be issued — and the refund path for
 * that is a support ticket, not a rollback, once the two are in separate
 * transactions. They are not, here; the ordering is belt and braces.
 */
export async function issue(
  db: Db,
  input: { userId: string; venueId: string; tierId: string; at?: Iso },
): Promise<IssuedVoucher> {
  const at = input.at ?? now();

  return db.tx(async () => {
    const venue = await getVenue(db, input.venueId);
    if (!venue.accepts_vouchers) {
      throw new DomainError('invalid_state', 'venue does not accept vouchers');
    }

    const tier = await db.get<Tier>(`SELECT * FROM voucher_tiers WHERE id = $t AND venue_id = $v`, {
      t: input.tierId,
      v: input.venueId,
    });
    if (!tier || !tier.active) throw new DomainError('not_found', 'tier not found');

    const view = await budget.budgetFor(db, input.venueId, at);
    if (!budget.tiersAvailable(view, await tiersFor(db, input.venueId)).includes(tier.discount_pct)) {
      throw new DomainError('budget_exhausted', 'this tier is not being issued right now', {
        available: view.voucher.available,
      });
    }

    const check = await averageCheck(db, venue, at);
    const reserved = estimateCost(check.minor, tier.discount_pct, tier.max_discount_minor);
    await budget.reserve(db, view.id, 'voucher', reserved, { kind: 'issued_voucher' }, at);

    const points = await ledger.spend(db, {
      userId: input.userId,
      points: tier.points_cost,
      reason: 'voucher_redeem',
      sourceKind: 'voucher_issue',
      venueId: input.venueId,
      at,
    });

    const id = newId('ivc');
    /*
     * §4.3 + §12a: how long the voucher lives is the **buyer's** entitlement —
     * 14 days free, 30 on Pro, 60 on Premium — with `CONFIG.vouchers` as the
     * floor for a database whose plan rows predate the key.
     *
     * Read here rather than handed in by the caller, the way
     * `gift_card_priority` is: this is the only place a voucher is issued, and
     * an entitlement a caller has to remember to look up is one that eventually
     * is not applied.
     *
     * **Stamped, not derived.** The date goes on the row now and every later
     * reader — `redeem`'s expiry check, `expireVouchers`' sweep, the wallet —
     * reads that column and never recomputes it. A plan is a thing people
     * leave, and recomputing would quietly shorten a voucher somebody bought
     * with sixty days on it the moment their subscription lapsed: a clawback of
     * something already paid for, which is the one thing §12a.3 says a lapse may
     * never do. It cuts the other way too — a voucher bought on the free plan
     * does not grow a month because the buyer upgraded the next day.
     */
    const validityDays = entitlements.entNumber(
      await entitlements.entitlementsFor(db, { userId: input.userId }),
      'voucher_validity_days',
      CONFIG.vouchers.validityDays,
    );
    const expires = plusDays(at, validityDays);
    await db.run(
      `INSERT INTO issued_vouchers
         (id, user_id, venue_id, tier_id, discount_pct, max_discount_minor, points_spent,
          reserved_minor, code, status, budget_id, issued_at, expires_at)
       VALUES ($i, $u, $v, $t, $p, $m, $pts, $r, $c, 'active', $b, $at, $e)`,
      {
        i: id,
        u: input.userId,
        v: input.venueId,
        t: tier.id,
        p: tier.discount_pct,
        m: tier.max_discount_minor,
        pts: tier.points_cost,
        r: reserved,
        c: voucherCode(),
        b: view.id,
        at,
        e: expires,
      },
    );
    /* The ledger entry is written before the voucher exists, so its `source_ref`
       is filled once the id does. The entry is still immutable — this is the
       first and only write of a column that was NULL. */
    await db.run(`UPDATE points_ledger SET source_ref = $r WHERE id = $i`, { r: id, i: points.id });

    return (await db.get<IssuedVoucher>(`SELECT * FROM issued_vouchers WHERE id = $i`, { i: id }))!;
  });
}

export const activeVouchers = async (db: Db, userId: string): Promise<IssuedVoucher[]> =>
  await db.all<IssuedVoucher>(
    `SELECT * FROM issued_vouchers WHERE user_id = $u AND status = 'active' ORDER BY expires_at`,
    { u: userId },
  );

export const voucherByCode = async (db: Db, code: string): Promise<IssuedVoucher | undefined> =>
  await db.get<IssuedVoucher>(`SELECT * FROM issued_vouchers WHERE code = $c`, { c: code });

/**
 * Phase two, called from inside the gate's commit (§3.5) and nowhere else.
 *
 * Release the estimate, debit the actual. Doing both is what corrects the drift:
 * however wrong the average check was when this voucher was issued, the pool
 * ends up holding the amount that was really discounted. That is why a bad
 * estimate can never accumulate into overspend — every redemption resets it.
 */
export async function redeem(
  db: Db,
  voucher: IssuedVoucher,
  venue: Venue,
  amountMinor: number,
  transactionId: string,
  at: Iso = now(),
): Promise<{ discountMinor: number }> {
  if (voucher.status !== 'active') throw new DomainError('already_used', 'voucher is not active');
  if (voucher.expires_at <= at) throw new DomainError('expired', 'voucher has expired');
  if (voucher.venue_id !== venue.id) throw new DomainError('forbidden', 'voucher is for another venue');

  const actual = discountCost(amountMinor, voucher.discount_pct, voucher.max_discount_minor);
  const budgetId = voucher.budget_id ?? (await budget.budgetFor(db, venue.id, at)).id;

  await budget.release(db, budgetId, 'voucher', voucher.reserved_minor, {
    kind: 'issued_voucher',
    ref: voucher.id,
  }, at);
  await budget.debit(db, budgetId, 'voucher', actual, { kind: 'issued_voucher', ref: voucher.id }, at);

  await db.run(
    `UPDATE issued_vouchers
        SET status = 'redeemed', spent_minor = $s, redeemed_at = $t, transaction_id = $x
      WHERE id = $i AND status = 'active'`,
    { s: actual, t: at, x: transactionId, i: voucher.id },
  );
  return { discountMinor: actual };
}

/**
 * §4.3, phase three: the voucher nobody used.
 *
 * Its reserve goes back to available. Not doing this is the slow leak that makes
 * a pool look exhausted while nothing was ever discounted — the failure mode is
 * invisible from the outside, which is why it gets its own scheduled job rather
 * than being folded into a read.
 */
export async function expireVouchers(db: Db, at: Iso = now()): Promise<{ expired: number; released: number }> {
  const due = await db.all<IssuedVoucher>(
    `SELECT * FROM issued_vouchers WHERE status = 'active' AND expires_at <= $t`,
    { t: at },
  );
  let released = 0;
  await db.tx(async () => {
    for (const voucher of due) {
      if (voucher.budget_id) {
        await budget.release(db, voucher.budget_id, 'voucher', voucher.reserved_minor, {
          kind: 'issued_voucher',
          ref: voucher.id,
        }, at);
        released += voucher.reserved_minor;
      }
      await db.run(`UPDATE issued_vouchers SET status = 'expired' WHERE id = $i`, { i: voucher.id });
      /* §12a.3 in spirit: the *points* are not given back. A voucher is a
         purchase, and an unredeemed one is a purchase that went unused — the
         alternative is a free option on the venue's budget. */
    }
  });
  return { expired: due.length, released };
}

/* ─────────────────────────────────────────────────────────────── gift cards ── */

/**
 * The other redemption path (§2.2): points out, no venue money involved.
 *
 * Kept in this file because it is the same rule — points are redeemable only for
 * discounts and gift cards, never withdrawable — and putting it anywhere else
 * would make that rule look like two rules.
 */
export async function redeemGiftCard(
  db: Db,
  input: { userId: string; stockId: string; at?: Iso; entitled?: boolean },
): Promise<{ id: string; code: string; points: number }> {
  const at = input.at ?? now();
  return db.tx(async () => {
    const stock = await db.get<{
      id: string;
      points_cost: number;
      stock: number;
      active: number;
      priority_only: number;
    }>(`SELECT * FROM gift_card_stock WHERE id = $i`, { i: input.stockId });
    if (!stock || !stock.active) throw new DomainError('not_found', 'gift card not available');
    if (stock.stock <= 0) throw new DomainError('conflict', 'out of stock');
    if (stock.priority_only && !input.entitled) {
      throw new DomainError('entitlement_required', 'priority stock is a paid-tier perk', {
        entitlement: 'gift_card_priority',
      });
    }

    await ledger.spend(db, {
      userId: input.userId,
      points: stock.points_cost,
      reason: 'gift_card_redeem',
      sourceKind: 'gift_card_stock',
      sourceRef: stock.id,
      at,
    });

    const id = newId('gcd');
    const code = voucherCode();
    await db.run(`UPDATE gift_card_stock SET stock = stock - 1 WHERE id = $i`, { i: stock.id });
    await db.run(
      `INSERT INTO gift_cards (id, user_id, stock_id, points_spent, code, status, issued_at, expires_at)
       VALUES ($i, $u, $s, $p, $c, 'active', $at, $e)`,
      { i: id, u: input.userId, s: stock.id, p: stock.points_cost, c: code, at, e: plusDays(at, 365) },
    );
    return { id, code, points: stock.points_cost };
  });
}
