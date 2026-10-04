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
import * as giftCards from './giftCards.ts';
import * as ledger from './ledger.ts';
import { convertMinor } from './analytics.ts';
import { decimalsFor, discountCost } from './money.ts';
import { now, plusDays, type Iso } from './time.ts';
import { averageCheck, getVenue, type Venue } from './venues.ts';

export interface Tier {
  id: string;
  venue_id: string;
  discount_pct: number;
  points_cost: number;
  max_discount_minor: number;
  /** How many of this rung may ever be issued. `null` is no cap. */
  redeem_limit: number | null;
  /** How many one account may ever take off this rung. `null` is no cap. */
  per_user_limit: number | null;
  /** The atomic gate the total cap is enforced through — see `claimSlot`. */
  issued_count: number;
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
 *
 * ## It is also where a redemption cap becomes visible, and to whom
 *
 * A rung that has given out its `redeem_limit` closes, and so does one this
 * *viewer* has taken their `per_user_limit` of. Both are folded into the one
 * boolean rather than sent as extra keys, which is deliberate on a body
 * `GET /v1/venues/:id` serves to anybody: how many vouchers a venue has handed
 * out is that venue's own trading, and it belongs in `partnerLadder`. What a
 * customer needs is whether the button works.
 *
 * `userId` is optional because this route is readable signed out — the guide is
 * readable with no account at all, which is that page's whole pitch. Without
 * one only the total cap can be applied, which is correct: there is nobody to
 * have a personal count. The signed-in caller passes `ctx.actor?.user.id`, the
 * same thing the stamp cards and rewards on that body are keyed on.
 *
 * Without this the personal cap would still be enforced — `issue` is the only
 * thing that grants a voucher and `claimSlot` is unconditional — but it would
 * be enforced *on the press*, which is a button that looks live and refuses.
 * That is the picture-of-a-control rule this repo states for the converter's
 * amount field, one layer up.
 */
export async function ladder(db: Db, venueId: string, at: Iso = now(), userId?: string) {
  const venue = await getVenue(db, venueId);
  const tiers = await tiersFor(db, venueId);
  const view = await budget.budgetFor(db, venueId, at);
  const open = new Set(budget.tiersAvailable(view, tiers));
  const check = await averageCheck(db, venue, at);

  /* One query for the viewer's whole ladder rather than one per rung, and only
     when there is both a viewer and a rung that caps them. */
  const mine = new Map<string, number>();
  if (userId !== undefined && tiers.some((tier) => tier.per_user_limit !== null)) {
    for (const row of await db.all<{ tier_id: string; n: number }>(
      `SELECT tier_id, COUNT(*) AS n FROM issued_vouchers
        WHERE venue_id = $v AND user_id = $u AND status <> 'cancelled'
        GROUP BY tier_id`,
      { v: venueId, u: userId },
    )) {
      mine.set(row.tier_id, row.n);
    }
  }
  const capped = (tier: Tier): boolean =>
    (tier.redeem_limit !== null && tier.issued_count >= tier.redeem_limit) ||
    (tier.per_user_limit !== null && (mine.get(tier.id) ?? 0) >= tier.per_user_limit);

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
    available: open.has(tier.discount_pct) && !capped(tier),
  }));
}

/**
 * The ladder as its **owner** reads it: every rung `ladder` shows, what each
 * one actually did against this month's budget, and any rung that has been
 * switched off while vouchers bought on it are still out.
 *
 * **Never on a public route.** `ladder` feeds `GET /v1/venues/:id`, which
 * anybody can open, and how many vouchers a venue gave out and what they cost
 * it is that venue's own trading. So the counts live in a second function
 * rather than as extra keys on the first: a key added to a shared shape is a
 * key every reader of that shape receives.
 *
 * Counted over vouchers issued against the **current** budget, because the
 * figure it sits beside is that budget's pool. `redeem` debits the budget a
 * voucher was issued against and writes the same amount to the voucher, so
 * Σ `spentMinor` over the rungs is the pool's `voucher.spent` — `verify.ts`
 * holds it to that.
 *
 * A retired rung is listed only while it has vouchers against this budget,
 * with `available: false` and nothing left to fund: it cannot be bought, but
 * the money it moved is part of the month, and leaving it off would make the
 * rungs disagree with the pool they are printed under.
 *
 * ## Two counts, and they answer different questions
 *
 * `issuedCount` is **this month's** — the figure that sits beside this month's
 * pool, and the reason it is computed from `issued_vouchers` and not from the
 * counter. `issuedTotal` is the rung's whole life, which is what a cap is
 * measured against: a redemption cap is not a monthly allowance, and printing
 * "18 of 20" from a monthly count would show 20 left on a rung that had
 * finished. `redeemLimit` / `perUserLimit` are `null` where no cap is set, and
 * the screen renders that as "no limit" rather than as a number.
 */
export async function partnerLadder(db: Db, venueId: string, at: Iso = now()) {
  const venue = await getVenue(db, venueId);
  const view = await budget.budgetFor(db, venueId, at);
  const counts = await db.all<{ tier_id: string; issued: number; redeemed: number; live: number; spent: number }>(
    `SELECT tier_id,
            SUM(CASE WHEN status <> 'cancelled' THEN 1 ELSE 0 END) AS issued,
            SUM(CASE WHEN status = 'redeemed' THEN 1 ELSE 0 END) AS redeemed,
            SUM(CASE WHEN status = 'active' AND expires_at > $at THEN 1 ELSE 0 END) AS live,
            SUM(CASE WHEN status = 'redeemed' THEN spent_minor ELSE 0 END) AS spent
       FROM issued_vouchers WHERE budget_id = $b
      GROUP BY tier_id`,
    { b: view.id, at },
  );
  const byTier = new Map(counts.map((row) => [row.tier_id, row]));
  const takeUp = (tierId: string) => {
    const row = byTier.get(tierId);
    return {
      issuedCount: row?.issued ?? 0,
      redeemedCount: row?.redeemed ?? 0,
      activeCount: row?.live ?? 0,
      spentMinor: row?.spent ?? 0,
    };
  };

  /* The rungs' own rows, for the two caps and the lifetime counter. `ladder`
     folds those into one boolean on purpose (it feeds a public body); the owner
     gets the figures. */
  const limitsOf = (tier: Tier) => ({
    redeemLimit: tier.redeem_limit,
    perUserLimit: tier.per_user_limit,
    issuedTotal: tier.issued_count,
  });
  const byId = new Map((await tiersFor(db, venueId)).map((tier) => [tier.id, tier]));

  const rungs = (await ladder(db, venueId, at)).map((rung) => ({
    ...rung,
    ...takeUp(rung.id),
    ...limitsOf(byId.get(rung.id)!),
    active: true,
  }));

  const retired = await db.all<Tier>(
    `SELECT * FROM voucher_tiers WHERE venue_id = $v AND active = 0 ORDER BY discount_pct`,
    { v: venueId },
  );
  if (retired.length > 0) {
    const check = await averageCheck(db, venue, at);
    for (const tier of retired) {
      const counted = takeUp(tier.id);
      if (counted.issuedCount === 0) continue;
      rungs.push({
        id: tier.id,
        discountPct: tier.discount_pct,
        pointsCost: tier.points_cost,
        maxDiscountMinor: tier.max_discount_minor,
        estimateMinor: estimateCost(check.minor, tier.discount_pct, tier.max_discount_minor),
        estimatedRemaining: 0,
        available: false,
        ...counted,
        ...limitsOf(tier),
        active: false,
      });
    }
  }
  return rungs.sort((a, b) => a.discountPct - b.discountPct);
}

/**
 * Take one slot off a rung, or refuse — **the whole of the redemption cap**.
 *
 * ## Why it is one UPDATE and not a count
 *
 * The obvious implementation is `SELECT COUNT(*) … ; if (count < cap) INSERT`,
 * and it is wrong in a way that only shows under load. Both statements run at
 * READ COMMITTED inside `db.tx`, so two requests arriving together both read
 * the same count, both find room, and both insert — a cap of one hands out two
 * vouchers. Raising the isolation level would turn it into a serialisation
 * failure the caller has to retry, which is a second mechanism to get right.
 *
 * A conditional UPDATE needs neither. The statement takes the rung's row lock,
 * and the second transaction then re-evaluates **its own** `WHERE` against the
 * committed row rather than the one it read earlier — so exactly one of the two
 * sees `changes === 1`. That is the same construction `ledger.earn` uses to
 * assign `seq` inside its insert, for the same reason: the guard has to be part
 * of the write, not a question asked before it.
 *
 * ## Why the lock is also what makes the per-user cap safe
 *
 * The per-user count has no counter of its own and does not need one. Every
 * issue of this rung passes through the UPDATE above first, so by the time the
 * `COUNT` below runs, every other issue of the same rung is either committed or
 * waiting — a serial section, bought with a lock this function was taking
 * anyway. A second counter table would have been a second thing to reconcile.
 *
 * Counting `issued_vouchers` also makes it the **right** count: a person who
 * let a voucher expire has still taken one off the rung, and a per-user cap
 * that only counted live vouchers would be a per-user cap on *holding* rather
 * than on taking, which somebody can cycle through forever.
 *
 * ## Order inside the transaction
 *
 * Called first, before `budget.reserve` and `ledger.spend`, so every issue
 * takes its locks in the order rung → budget → account. Two rungs of one venue
 * bought at the same instant would otherwise be able to take the budget and the
 * rung in opposite orders, which is a deadlock rather than a refusal.
 */
async function claimSlot(
  db: Db,
  tier: Tier,
  userId: string,
): Promise<void> {
  const claimed = await db.run(
    `UPDATE voucher_tiers SET issued_count = issued_count + 1
      WHERE id = $t AND (redeem_limit IS NULL OR issued_count < redeem_limit)`,
    { t: tier.id },
  );
  if (claimed.changes !== 1) {
    /* `conflict` (409) rather than `budget_exhausted`: the pool is untouched and
       may be full, and an owner reading "budget exhausted" would go and look at
       a budget that is fine. This is the rung being finished. */
    throw new DomainError('conflict', 'this voucher has all been claimed', {
      limit: tier.redeem_limit,
      issued: tier.issued_count,
    });
  }

  if (tier.per_user_limit !== null) {
    const mine = await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM issued_vouchers
        WHERE tier_id = $t AND user_id = $u AND status <> 'cancelled'`,
      { t: tier.id, u: userId },
    );
    /* The row this call is about has not been inserted yet, so `n` is what this
       account already holds and the cap is reached at equality. */
    if ((mine?.n ?? 0) >= tier.per_user_limit) {
      throw new DomainError('conflict', 'you have taken all of these you can', {
        perUserLimit: tier.per_user_limit,
        yours: mine?.n ?? 0,
      });
    }
  }
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

    /* The count caps, first — see `claimSlot` for why the order of the three
       locks this transaction takes is not a preference. Throwing here rolls the
       increment back with everything else, which is what makes a refused issue
       leave no trace on the rung. */
    await claimSlot(db, tier, input.userId);

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
 *
 * ## The claim is first, and it used to be last
 *
 * A voucher is single-use, and the check for that was `voucher.status !==
 * 'active'` read off a row the caller had already fetched, with the guarded
 * `UPDATE … WHERE status = 'active'` at the *end*. Two tills confirming the
 * same code at the same instant both passed the in-memory check, both released
 * and debited the pool, and only one UPDATE took — so the venue paid the
 * discount twice and one of the two transactions carried a discount against a
 * voucher that says it was redeemed by the other. A cap of one, exceeded.
 *
 * So the state change is the first thing that happens, and its own row count is
 * the gate: whichever transaction gets the row lock writes it, and the other
 * re-evaluates `status = 'active'` against the committed row, changes nothing
 * and throws before it can move a single grosz. `claimSlot` is the same
 * construction one function up — the guard is part of the write.
 *
 * `spent_minor` therefore has to be computed before the UPDATE rather than
 * after, which is fine: it is a pure function of the amount, the percentage and
 * the cap, none of which the lock affects.
 */
export async function redeem(
  db: Db,
  voucher: IssuedVoucher,
  venue: Venue,
  amountMinor: number,
  transactionId: string,
  at: Iso = now(),
): Promise<{ discountMinor: number }> {
  /* The two that are not a race — a venue and a date, neither of which another
     transaction can change under this one — are checked first, because their
     refusals are the ones a cashier can act on. */
  if (voucher.venue_id !== venue.id) throw new DomainError('forbidden', 'voucher is for another venue');
  if (voucher.expires_at <= at) throw new DomainError('expired', 'voucher has expired');

  const actual = discountCost(amountMinor, voucher.discount_pct, voucher.max_discount_minor);

  const claimed = await db.run(
    `UPDATE issued_vouchers
        SET status = 'redeemed', spent_minor = $s, redeemed_at = $t, transaction_id = $x
      WHERE id = $i AND status = 'active'`,
    { s: actual, t: at, x: transactionId, i: voucher.id },
  );
  if (claimed.changes !== 1) throw new DomainError('already_used', 'voucher is not active');

  const budgetId = voucher.budget_id ?? (await budget.budgetFor(db, venue.id, at)).id;
  await budget.release(db, budgetId, 'voucher', voucher.reserved_minor, {
    kind: 'issued_voucher',
    ref: voucher.id,
  }, at);
  await budget.debit(db, budgetId, 'voucher', actual, { kind: 'issued_voucher', ref: voucher.id }, at);

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
  let expired = 0;
  await db.tx(async () => {
    for (const voucher of due) {
      /* **Claimed before anything is released**, for the reason `redeem` gives
         at length: the row was selected outside this transaction, and a till
         confirming that same voucher in between would have redeemed it. An
         unguarded `SET status = 'expired'` would then overwrite a redeemed
         voucher *and* release its reserve a second time — the pool would be
         handed back money it had already spent. Whichever of the two gets the
         row lock wins, and the other changes nothing. */
      const claimed = await db.run(
        `UPDATE issued_vouchers SET status = 'expired' WHERE id = $i AND status = 'active'`,
        { i: voucher.id },
      );
      if (claimed.changes !== 1) continue;
      expired += 1;
      if (voucher.budget_id) {
        await budget.release(db, voucher.budget_id, 'voucher', voucher.reserved_minor, {
          kind: 'issued_voucher',
          ref: voucher.id,
        }, at);
        released += voucher.reserved_minor;
      }
      /* §12a.3 in spirit: the *points* are not given back. A voucher is a
         purchase, and an unredeemed one is a purchase that went unused — the
         alternative is a free option on the venue's budget.

         And the rung's `issued_count` is **not** given back either: the cap is
         on how many of this offer were handed out, not on how many are still in
         somebody's wallet. Decrementing it would make an expiry hand out a
         fresh slot, which is a cap anybody can walk past by waiting. */
    }
  });
  return { expired, released };
}

/* ──────────────────────────────────────────────── what the partner can see ── */

/** One row of the partner's voucher register. */
export interface PartnerVoucher {
  id: string;
  code: string;
  discountPct: number;
  pointsSpent: number;
  /** What was reserved when it was issued, and what it actually cost. */
  reservedMinor: number;
  spentMinor: number;
  status: IssuedVoucher['status'];
  /** The validity window, both ends, as stamped on the row. */
  issuedAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  /**
   * Who holds it — **only when they have said the venue may know**.
   *
   * `null` is not "anonymous customer", it is "we are not telling you", and the
   * two must not render the same way. It is the §1.4 gate — the
   * `data_sharing_consents` `EXISTS` that `dashboard.ts` states at the top of
   * its own file — and it is a lookup rather than a column because a voucher's
   * `user_id` is always there while permission to read a name beside it is a
   * separate fact that can be withdrawn after the voucher was bought.
   */
  holder: string | null;
}

/**
 * The partner's own voucher register — status, the window, and the history.
 *
 * ## Why this exists at all
 *
 * The dashboard could see the **ladder** (what is on offer) and never the
 * vouchers (what was taken), so the one question an owner has after setting a
 * cap — who has it, is it used, when does it lapse — had no screen. Everything
 * here is already on the row; nothing is derived and nothing is estimated.
 *
 * ## Three decisions worth naming
 *
 * - **Not scoped to a budget month.** `partnerLadder` is, because it is printed
 *   under a month's pool. A register is a register: a voucher issued in August
 *   and redeemed in September is one row, and dropping it out of August's view
 *   would lose the redemption. `since` narrows it when a screen wants a window.
 * - **Ordered by when it was issued, newest first.** A ledger reads backwards.
 *   Redemption order would bury every live voucher under the used ones, which
 *   are the rows nothing can be done about.
 * - **`status` is the row's own**, so an `active` voucher past `expiresAt` is
 *   possible: `expireVouchers` is a scheduled sweep, not a read-time
 *   derivation. The screen shows the stored status and the date beside it, and
 *   does not silently reinterpret one against the other — that is the
 *   distinction between "expired" (swept, reserve released) and "lapsed but not
 *   yet swept" (the money is still set aside), and the pool disagrees with
 *   anybody who collapses them.
 */
export async function partnerVouchers(
  db: Db,
  venueId: string,
  options: { tierId?: string; status?: IssuedVoucher['status']; since?: Iso; limit?: number } = {},
): Promise<PartnerVoucher[]> {
  const rows = await db.all<{
    id: string;
    code: string;
    discount_pct: number;
    points_spent: number;
    reserved_minor: number;
    spent_minor: number;
    status: IssuedVoucher['status'];
    issued_at: string;
    expires_at: string;
    redeemed_at: string | null;
    holder: string | null;
  }>(
    `SELECT i.id, i.code, i.discount_pct, i.points_spent, i.reserved_minor, i.spent_minor,
            i.status, i.issued_at, i.expires_at, i.redeemed_at,
            CASE WHEN EXISTS (SELECT 1 FROM data_sharing_consents d
                               WHERE d.user_id = i.user_id AND d.venue_id = i.venue_id
                                 AND d.revoked_at IS NULL)
                 THEN u.display_name ELSE NULL END AS holder
       FROM issued_vouchers i
       JOIN users u ON u.id = i.user_id
      WHERE i.venue_id = $v
        AND ($t IS NULL OR i.tier_id = $t)
        AND ($s IS NULL OR i.status = $s)
        AND ($since IS NULL OR i.issued_at >= $since)
      ORDER BY i.issued_at DESC
      LIMIT $n`,
    {
      v: venueId,
      t: options.tierId ?? null,
      s: options.status ?? null,
      since: options.since ?? null,
      n: options.limit ?? 200,
    },
  );

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    discountPct: row.discount_pct,
    pointsSpent: row.points_spent,
    reservedMinor: row.reserved_minor,
    spentMinor: row.spent_minor,
    status: row.status,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    redeemedAt: row.redeemed_at,
    holder: row.holder,
  }));
}

/**
 * The register's own totals, over the venue's whole life.
 *
 * Counted in one query rather than by summing the page above, because the page
 * is capped at `limit` and a total computed from a page is a total that changes
 * when somebody scrolls.
 */
export async function partnerVoucherTotals(
  db: Db,
  venueId: string,
  at: Iso = now(),
): Promise<{ issued: number; active: number; redeemed: number; expired: number; lapsing: number }> {
  const row = await db.get<{
    issued: number;
    active: number;
    redeemed: number;
    expired: number;
    lapsing: number;
  }>(
    `SELECT SUM(CASE WHEN status <> 'cancelled' THEN 1 ELSE 0 END) AS issued,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
            SUM(CASE WHEN status = 'redeemed' THEN 1 ELSE 0 END) AS redeemed,
            SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired,
            /* Live now and gone within the week — the one figure here that is
               actionable, because it is the set a reminder can still reach. */
            SUM(CASE WHEN status = 'active' AND expires_at > $at AND expires_at <= $soon
                     THEN 1 ELSE 0 END) AS lapsing
       FROM issued_vouchers WHERE venue_id = $v`,
    { v: venueId, at, soon: plusDays(at, 7) },
  );
  return {
    issued: row?.issued ?? 0,
    active: row?.active ?? 0,
    redeemed: row?.redeemed ?? 0,
    expired: row?.expired ?? 0,
    lapsing: row?.lapsing ?? 0,
  };
}

/* ─────────────────────────────────────────────────────────────── gift cards ── */

/*
 * The other redemption path (§2.2): points out, no venue money involved.
 *
 * Kept in this file because it is the same rule — points are redeemable only for
 * discounts and gift cards, never withdrawable — and putting it anywhere else
 * would make that rule look like two rules.
 *
 * **Rulebook §2.1 / §9.4 fence it, and every fence is here.** A voucher costs
 * Paylez nothing; a gift card is face value the platform buys. So:
 *
 *   1. **The plan gate is the `gift_card_priority` entitlement.** §9.4 made it
 *      Pro and Premium; on 2026-10-03 the owner opened cards to every account,
 *      which is now `true` on every plan in `settings.ts` rather than a gate
 *      deleted here — so closing it again is one value per plan, not code. The
 *      route resolves it and passes `entitled`.
 *   2. **100 points = 1 zł**, *derived* from the card's face value on every read
 *      and every sale (`giftCardPrice`). `gift_card_stock.points_cost` is no
 *      longer the price: the audited build had cards at 50 = 1 zł there, which
 *      made the Paylez-funded reward twice as generous as the partner-funded
 *      voucher. The column is left in place and ignored rather than dropped,
 *      because dropping it is a migration and nothing is gained by one.
 *   3. **A monthly pool** of `poolShareBp` of consumer subscription revenue
 *      (`giftCardPool`), and **one card per user per `perUserEveryDays`**.
 */

/** A card on the shelf, priced by the rule rather than by the row. */
export interface GiftCardOffer {
  id: string;
  brand: string;
  logo: string;
  face_minor: number;
  currency: string;
  /** The derived price. Named as the column was so no reader has to change. */
  points_cost: number;
  stock: number;
  priority_only: number;
  country_code: string | null;
  kind: string;
  venue_id: string | null;
  venue_name: string | null;
  validity_days: number;
  how_to_use: string | null;
  /**
   * How many more of *this* card the month's pool can still buy, capped by the
   * physical stock — the "5 left this month" the rulebook calls a financial
   * control. 0 is sold out for the month, whatever `stock` says.
   */
  left_this_month: number;
}

/** Minor units of the anchor currency (grosze), and the points they cost. */
const anchorDecimals = (): number => decimalsFor(CONFIG.giftCards.anchorCurrency);

/**
 * A card's face value in the anchor currency, minor units, or null when there is
 * no rate to convert it through. Null means "not offered", never "same number".
 */
async function faceInAnchor(db: Db, faceMinor: number, currency: string): Promise<number | null> {
  return await convertMinor(db, faceMinor, currency, CONFIG.giftCards.anchorCurrency);
}

/**
 * §2.1 `GIFT_CARD_RATE`: what a card costs, in points.
 *
 * `ceil`, not `round`: a card whose face converts to 46.504 zł costs 4 651, so
 * the rate is never beaten by a fraction of a grosz in the player's favour — the
 * Paylez-funded reward is the one that must not drift above its anchor.
 */
export async function giftCardPrice(
  db: Db,
  card: { face_minor: number; currency: string },
): Promise<number | null> {
  const anchor = await faceInAnchor(db, card.face_minor, card.currency);
  if (anchor === null || anchor <= 0) return null;
  return Math.ceil((anchor * CONFIG.giftCards.pointsPerMajor) / 10 ** anchorDecimals());
}

export interface GiftCardPool {
  /** `YYYY-MM`, the calendar month the pool belongs to (UTC). */
  month: string;
  currency: string;
  /** Live paid consumer subscriptions, at their monthly list price. */
  revenueMinor: number;
  /** `CONFIG.giftCards.fixedMonthlyMajor`, in minor units. */
  fixedMinor: number;
  /** `fixedMinor + revenueMinor × poolShareBp`. */
  budgetMinor: number;
  /** Face value of every card issued this month. */
  spentMinor: number;
  remainingMinor: number;
}

/**
 * §9.4 the month's pool: `POOL_SHARE_OF_REVENUE` of consumer subscription revenue.
 *
 * **Revenue is what is live now, at list price.** Every consumer subscription in
 * `active` or `grace` whose `source` is a payment rail — `manual` is an operator
 * courtesy and `trialing` has not paid — at its plan's monthly `price_minor`,
 * converted to the anchor. List price rather than a longer term's discounted
 * monthly figure because `subscriptions` does not record which term was bought;
 * the error is at most the term discount and it errs generous by that much,
 * which is the direction a pool sized at a fifth of revenue can afford.
 *
 * **Spend is the face value of this month's cards**, converted the same way. A
 * card whose currency has lost its rate since it was sold is counted from the
 * points paid for it instead (points ÷ rate), which is the same number for any
 * card sold under this rule — so the pool can only be over-counted, never
 * under-counted, by a missing rate.
 *
 * Derived on every call and stored nowhere, for the reason the balance is: the
 * rows that say it are already written.
 */
export async function giftCardPool(db: Db, at: Iso = now()): Promise<GiftCardPool> {
  const month = at.slice(0, 7);
  const currency = CONFIG.giftCards.anchorCurrency;

  const plans = await db.all<{ price: number; currency: string; n: number }>(
    `SELECT p.price_minor AS price, p.currency AS currency, COUNT(*) AS n
       FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE s.user_id IS NOT NULL AND p.audience = 'consumer'
        AND s.status IN ('active', 'grace') AND s.source <> 'manual'
        AND p.price_minor > 0
      GROUP BY p.price_minor, p.currency`,
  );
  let revenueMinor = 0;
  for (const row of plans) {
    const each = await convertMinor(db, row.price, row.currency, currency);
    /* A plan priced in a currency with no rate is left out rather than added in
       the wrong unit — the pool shrinks, which is the safe direction. */
    if (each !== null) revenueMinor += each * Number(row.n);
  }

  const issued = await db.all<{ face: number; currency: string; points: number }>(
    /* The card's own snapshot of what it was worth, when it has one: the shelf
       row can be edited after the sale. A cancelled card was refunded, so it
       spent nothing from the pool. */
    `SELECT COALESCE(g.face_minor, k.face_minor) AS face,
            COALESCE(g.currency, k.currency) AS currency, g.points_spent AS points
       FROM gift_cards g JOIN gift_card_stock k ON k.id = g.stock_id
      WHERE substr(g.issued_at, 1, 7) = $m AND g.status <> 'cancelled'`,
    { m: month },
  );
  let spentMinor = 0;
  for (const card of issued) {
    const face = await faceInAnchor(db, card.face, card.currency);
    spentMinor +=
      face ?? Math.ceil((card.points * 10 ** anchorDecimals()) / CONFIG.giftCards.pointsPerMajor);
  }

  const fixedMinor = Math.max(0, Math.round(CONFIG.giftCards.fixedMonthlyMajor * 10 ** anchorDecimals()));
  const budgetMinor = fixedMinor + Math.floor((revenueMinor * CONFIG.giftCards.poolShareBp) / 10_000);
  return {
    month,
    currency,
    revenueMinor,
    fixedMinor,
    budgetMinor,
    spentMinor,
    remainingMinor: Math.max(0, budgetMinor - spentMinor),
  };
}

/**
 * The shelf `GET /v1/gift-cards` serves: active cards, priced by the rule,
 * with what the month's pool can still buy of each.
 *
 * A card whose currency cannot be converted is **left off** — "the same number
 * in a different currency" is not a price, and a card nobody can be quoted for
 * is not on sale.
 */
export async function giftCardShelf(
  db: Db,
  at: Iso = now(),
  options: { country?: string | null } = {},
): Promise<GiftCardOffer[]> {
  /* `country` narrows the shelf only when a client asks for it; absent is
     every country, which is what a client that predates the column sees. */
  const rows = (await giftCards.shelf(db, options.country ?? null)) as Omit<
    GiftCardOffer,
    'points_cost' | 'left_this_month'
  >[];
  const pool = await giftCardPool(db, at);

  const offers: GiftCardOffer[] = [];
  for (const row of rows) {
    const face = await faceInAnchor(db, row.face_minor, row.currency);
    const price = await giftCardPrice(db, row);
    if (face === null || price === null) continue;
    offers.push({
      ...row,
      points_cost: price,
      left_this_month: Math.max(0, Math.min(row.stock, Math.floor(pool.remainingMinor / face))),
    });
  }
  return offers.sort((a, b) => a.points_cost - b.points_cost || a.id.localeCompare(b.id));
}

/**
 * Buy a card: on a plan that grants it (fence 1), at the derived price, one per
 * `perUserEveryDays`, out of the month's pool.
 */
export async function redeemGiftCard(
  db: Db,
  input: { userId: string; stockId: string; at?: Iso; entitled?: boolean },
): Promise<{ id: string; code: string; points: number }> {
  const at = input.at ?? now();
  return db.tx(async () => {
    const stock = await db.get<{
      id: string;
      face_minor: number;
      currency: string;
      stock: number;
      active: number;
      priority_only: number;
      validity_days: number;
    }>(`SELECT * FROM gift_card_stock WHERE id = $i`, { i: input.stockId });
    if (!stock || !stock.active) throw new DomainError('not_found', 'gift card not available');

    /* Fence 1: the plan's `gift_card_priority`, which the route resolves.
       Absent is a caller that did not ask (a script, a check), not a refusal. */
    if (input.entitled === false) {
      throw new DomainError('entitlement_required', 'gift cards are not on this plan', {
        entitlement: 'gift_card_priority',
      });
    }

    /* Fence 2, §2.1: the price is the rule's, whatever the row says. */
    const points = await giftCardPrice(db, stock);
    const face = await faceInAnchor(db, stock.face_minor, stock.currency);
    if (points === null || face === null) {
      throw new DomainError('not_found', 'gift card not available');
    }

    /* Not the gate -- see the claim below. This is the cheap refusal for the
       ordinary case, somebody opening a card that is already sold out, and it
       answers without taking a row lock. */
    if (stock.stock <= 0) throw new DomainError('conflict', 'out of stock');

    /* Fence 3a, §9.4 `PER_USER_CAP`: one card per `perUserEveryDays`, rolling.
       The refusal names when the next one is possible, so a screen can say so
       instead of guessing. */
    const since = plusDays(at, -CONFIG.giftCards.perUserEveryDays);
    const last = await db.get<{ issued_at: string }>(
      `SELECT issued_at FROM gift_cards WHERE user_id = $u AND issued_at > $s
        ORDER BY issued_at DESC LIMIT 1`,
      { u: input.userId, s: since },
    );
    if (last) {
      throw new DomainError('conflict', 'one gift card per 60 days', {
        reason: 'per_user_cap',
        everyDays: CONFIG.giftCards.perUserEveryDays,
        nextAt: plusDays(last.issued_at as Iso, CONFIG.giftCards.perUserEveryDays),
      });
    }

    /* Fence 3b, §9.4 the pool. Read inside the transaction that writes the card:
       on SQLite the write lock serialises two buyers; on Postgres at READ
       COMMITTED two buyers of the month's last card can both pass, and the
       overrun is bounded by one card's face value — the stock claim below is the
       hard gate, this is the budget one. */
    const pool = await giftCardPool(db, at);
    if (pool.remainingMinor < face) {
      throw new DomainError('conflict', 'this month’s gift cards are sold out', {
        reason: 'pool_exhausted',
        month: pool.month,
      });
    }

    /*
     * Claim the unit before the points move, by the same construction the
     * voucher caps use one file over: a conditional UPDATE with a row-count
     * guard, never a SELECT that decides and an UPDATE that trusts it.
     *
     * The read above cannot be the gate. READ COMMITTED lets two buyers of the
     * last card both see `stock: 1` and both pass, and `stock = stock - 1` then
     * leaves the shelf at **-1** with two cards issued against one unit -- and a
     * gift card is a promise made in points, which people spend a month
     * earning, so the one that cannot be honoured is somebody's month. Putting
     * `stock > 0` in the WHERE makes the decrement itself the decision, and the
     * row lock it takes is what serialises the pair.
     *
     * It claims *before* `ledger.spend` rather than after, which holds that lock
     * for the length of the spend. That cost is the correct one: two people
     * buying the last card genuinely have to queue, and a gate that runs after
     * the money has moved is a gate relying on the rollback to undo it.
     */
    const claimed = await db.run(
      `UPDATE gift_card_stock SET stock = stock - 1 WHERE id = $i AND stock > 0`,
      { i: stock.id },
    );
    if (claimed.changes !== 1) throw new DomainError('conflict', 'out of stock');

    await ledger.spend(db, {
      userId: input.userId,
      points,
      reason: 'gift_card_redeem',
      sourceKind: 'gift_card_stock',
      sourceRef: stock.id,
      at,
    });

    /* The code is one the operator loaded (a brand's) or generated (a
       venue's) — never one made up here, which no brand would honour. The unit
       claimed above holds the row lock, so this is the only buyer looking. */
    const free = await giftCards.claimCode(db, stock.id);
    const id = newId('gcd');
    /* The face value and currency are copied onto the card: the shelf row can
       be edited later, and the wallet must still say what was bought. */
    await db.run(
      `INSERT INTO gift_cards
         (id, user_id, stock_id, points_spent, code, status, issued_at, expires_at, face_minor, currency)
       VALUES ($i, $u, $s, $p, $c, 'active', $at, $e, $f, $cur)`,
      {
        i: id,
        u: input.userId,
        s: stock.id,
        p: points,
        c: free.code,
        at,
        e: giftCards.expiresAt(at, Number(stock.validity_days) || 365),
        f: stock.face_minor,
        cur: stock.currency,
      },
    );
    await giftCards.bindCode(db, free.id, id, at);
    return { id, code: free.code, points };
  });
}

/* ─────────────────────────────────────────────────── the platform ladder ── */

/**
 * What the platform's own ladder charges for `pct` off, in points.
 *
 * `CONFIG.vouchers.defaultTiers` names three rungs (rulebook §2.1: 5% → 300,
 * 10% → 500, 15% → 800). A venue may name any whole percentage, so a price for
 * the ones in between is **interpolated** along the ladder, below the first rung
 * along the line from nothing to it (3% of a 300-point 5% is 180), and above the
 * last along the last rung's slope (20% continues 10 → 15 to 1 100). Linear
 * because the rulebook's own rungs are near enough linear (~60, 40, 60 points a
 * percent) that anything cleverer would be precision the ladder does not have.
 */
export function ladderPrice(pct: number): number {
  const rungs = [...CONFIG.vouchers.defaultTiers].sort((a, b) => a.pct - b.pct);
  if (rungs.length === 0) return 0;
  const first = rungs[0];
  if (pct <= first.pct) return Math.round((first.points * pct) / first.pct);
  for (let i = 1; i < rungs.length; i += 1) {
    const lo = rungs[i - 1];
    const hi = rungs[i];
    if (pct <= hi.pct) {
      return Math.round(lo.points + ((hi.points - lo.points) * (pct - lo.pct)) / (hi.pct - lo.pct));
    }
  }
  const last = rungs[rungs.length - 1];
  const prev = rungs.length > 1 ? rungs[rungs.length - 2] : { pct: 0, points: 0 };
  const slope = (last.points - prev.points) / (last.pct - prev.pct);
  return Math.round(last.points + slope * (pct - last.pct));
}

/**
 * The band a venue's own price for `pct` must sit in — `partnerTierFloorBp` to
 * `partnerTierCeilingBp` of `ladderPrice(pct)`. `ceil` on the floor and `floor`
 * on the ceiling, so a rounding never lets a rung out of the band it was meant
 * to stay inside.
 */
export function partnerTierBand(pct: number): { min: number; max: number; platform: number } {
  const platform = ladderPrice(pct);
  return {
    platform,
    min: Math.max(1, Math.ceil((platform * CONFIG.vouchers.partnerTierFloorBp) / 10_000)),
    max: Math.floor((platform * CONFIG.vouchers.partnerTierCeilingBp) / 10_000),
  };
}
