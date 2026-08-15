/**
 * The amount-capture gate — §3. The most important flow in the backend.
 *
 * **Every** earning and redemption event goes through the same four steps in the
 * same order: trigger → PENDING → amount → confirm → commit. There are no
 * per-event-type flows; the event type only changes what step 5 grants. That is
 * not tidiness, it is the security model: a scan, a stamp and a voucher
 * redemption all involve a customer's phone claiming something, and exactly one
 * place in the code is allowed to believe it.
 *
 * The two sentences to keep in mind while reading:
 *
 *   * **Nothing of value exists before the commit.** There is no provisional
 *     points state, no half-stamped card, no discount applied "pending". The
 *     transaction is pending until it is committed or cancelled, and the grant
 *     happens in one database transaction with everything else (§3.5).
 *   * **The server decides.** The amount, the points, the discount, the
 *     eligibility and the cap are all computed here from stored configuration.
 *     Nothing a client sends is used as a value; it is only ever used as a
 *     *request* for one.
 */
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import * as budget from './budget.ts';
import * as campaigns from './campaigns.ts';
import * as entitlements from './entitlements.ts';
import * as fraud from './fraud.ts';
import * as ledger from './ledger.ts';
import * as notifications from './notifications.ts';
import * as vouchers from './vouchers.ts';
import { DomainError } from './errors.ts';
import { newId } from './ids.ts';
import { plausibleAmount } from './money.ts';
import { open as openToken, seal } from '../crypto/tokens.ts';
import { verifyTap } from '../crypto/nfc.ts';
import { local, minutesBetween, now, plusMinutes, type Iso } from './time.ts';
import { getVenue, type Venue } from './venues.ts';

export type Intent = 'earn' | 'voucher_redeem' | 'reward_redeem';

export interface Transaction {
  id: string;
  venue_id: string;
  user_id: string;
  trigger_type: 'qr' | 'nfc' | 'manual';
  trigger_ref: string | null;
  intent: Intent;
  intent_ref: string | null;
  status: 'pending' | 'committed' | 'cancelled' | 'reversed';
  amount_minor: number | null;
  currency: string;
  amount_entered_by: 'cashier' | 'customer' | null;
  confirmed_by: string | null;
  points_granted: number;
  discount_minor: number;
  stamp_granted: number;
  deal_id: string | null;
  opened_at: string;
  confirmed_at: string | null;
}

/* ══════════════════════════════════════════════ §3.2 the dynamic venue QR ══ */

interface QrPayload {
  v: string;
  jti: string;
  iat: number;
  exp: number;
}

/**
 * Mint a QR for a venue's screen or till roll.
 *
 * Short TTL *and* a single-use nonce, because they stop different attacks. The
 * TTL kills a photograph shared to a group chat; the nonce kills the customer
 * who scans the same code twice in the sixty seconds it is alive. Either alone
 * leaves a hole.
 */
export function mintQr(db: Db, venueId: string, secret: string, at: Iso = now()) {
  const jti = newId('evt');
  const expires = plusMinutes(at, CONFIG.gate.qrTtlSeconds / 60);
  db.run(
    `INSERT INTO qr_nonces (jti, venue_id, issued_at, expires_at) VALUES ($j, $v, $i, $e)`,
    { j: jti, v: venueId, i: at, e: expires },
  );
  const token = seal(secret, {
    v: venueId,
    jti,
    iat: Math.floor(new Date(at).getTime() / 1000),
    exp: Math.floor(new Date(expires).getTime() / 1000),
  } satisfies QrPayload);
  return { token, expiresAt: expires, ttlSeconds: CONFIG.gate.qrTtlSeconds };
}

/**
 * Verify and burn a QR.
 *
 * Signature, then expiry, then replay — and the replay check is a conditional
 * UPDATE rather than a SELECT followed by an UPDATE. Two phones scanning the
 * same code in the same millisecond both pass a SELECT; only one of them wins a
 * `WHERE used_at IS NULL`.
 */
export function verifyQr(db: Db, token: string, secret: string, userId: string, at: Iso = now()): string {
  const payload = openToken<QrPayload>(secret, token);
  if (!payload?.v || !payload.jti) throw new DomainError('invalid_trigger', 'bad QR signature');
  if (payload.exp * 1000 < new Date(at).getTime()) throw new DomainError('expired', 'QR has expired');

  const claimed = db.run(
    `UPDATE qr_nonces SET used_at = $t, used_by = $u
      WHERE jti = $j AND used_at IS NULL AND expires_at > $t`,
    { t: at, u: userId, j: payload.jti },
  );
  if (claimed.changes === 0) {
    /* The fraud case is *not* opened here: this runs inside the transaction that
       is about to roll back, and a case written in it would roll back with it —
       leaving a replay that nobody can see afterwards. `openTransaction` catches
       the error and files it outside. */
    throw new DomainError('replay_detected', 'this QR has already been used', {
      venueId: payload.v,
      jti: payload.jti,
    });
  }
  return payload.v;
}

/**
 * §3.3. Verify an NFC tap and burn its counter.
 *
 * The counter check is the whole replay defence and it is `>`, never `>=`: a tap
 * that presents the counter we already saw is the same tap arriving twice.
 */
export function verifyNfc(
  db: Db,
  input: { piccHex: string; cmacHex: string; masterKey: Buffer; userId: string; at?: Iso },
): string {
  const at = input.at ?? now();
  const result = verifyTap(input.masterKey, input.piccHex, input.cmacHex);
  if (!result.ok) throw new DomainError('invalid_trigger', `NFC rejected: ${result.reason}`);

  const tag = db.get<{ venue_id: string | null; last_counter: number; status: string }>(
    `SELECT venue_id, last_counter, status FROM tag_registry WHERE tag_uid = $u`,
    { u: result.uid },
  );
  if (!tag) throw new DomainError('invalid_trigger', 'unknown tag');
  if (tag.status !== 'active' || !tag.venue_id) throw new DomainError('invalid_trigger', 'tag is not active');

  const advanced = db.run(
    `UPDATE tag_registry SET last_counter = $c WHERE tag_uid = $u AND last_counter < $c`,
    { c: result.counter, u: result.uid },
  );
  if (advanced.changes === 0) {
    /* Filed outside the transaction — see the note in `verifyQr`. */
    void at;
    throw new DomainError('replay_detected', 'this tap has already been seen', {
      venueId: tag.venue_id,
      counter: result.counter,
      lastCounter: tag.last_counter,
    });
  }
  return tag.venue_id;
}

/* ═══════════════════════════════════════════════════ step 2: open PENDING ══ */

export interface OpenInput {
  userId: string;
  intent?: Intent;
  /** A voucher id or an earned-reward id, for the two redemption intents. */
  intentRef?: string;
  dealId?: string;
  deviceId?: string;
  /** §15 offline tolerance: when the client says it happened. */
  clientTs?: string;
  at?: Iso;
}

export type Trigger =
  | { kind: 'qr'; token: string; secret: string }
  | { kind: 'nfc'; piccHex: string; cmacHex: string; masterKey: Buffer }
  /** Partner-initiated at the till, for a customer whose phone is flat. */
  | { kind: 'manual'; venueId: string; byUserId: string };

/**
 * Step 1–2: validate the trigger and open a PENDING transaction.
 *
 * Eligibility is checked here rather than at confirm time so a cashier is never
 * asked to type an amount into something that was going to be refused anyway —
 * but nothing is granted, reserved or decremented. A pending transaction is a
 * promise to decide, not a decision.
 */
export function openTransaction(db: Db, trigger: Trigger, input: OpenInput): Transaction {
  const at = input.at ?? now();
  const intent = input.intent ?? 'earn';

  try {
    return openInTransaction(db, trigger, input, intent, at);
  } catch (error) {
    /* A replay is the one failure worth a record of its own, and it has to be
       written *after* the rollback or it rolls back with the attempt it
       describes. §13: replays are rejected and surfaced, not silently dropped. */
    if (error instanceof DomainError && error.code === 'replay_detected') {
      fraud.openCase(db, {
        kind: 'replay',
        severity: 'high',
        userId: input.userId,
        venueId: (error.detail.venueId as string | undefined) ?? null,
        detail: error.message,
        at,
      });
    }
    throw error;
  }
}

function openInTransaction(
  db: Db,
  trigger: Trigger,
  input: OpenInput,
  intent: Intent,
  at: Iso,
): Transaction {
  return db.tx(() => {
    let venueId: string;
    let triggerRef: string | null = null;

    if (trigger.kind === 'qr') {
      venueId = verifyQr(db, trigger.token, trigger.secret, input.userId, at);
      triggerRef = 'qr';
    } else if (trigger.kind === 'nfc') {
      venueId = verifyNfc(db, {
        piccHex: trigger.piccHex,
        cmacHex: trigger.cmacHex,
        masterKey: trigger.masterKey,
        userId: input.userId,
        at,
      });
      triggerRef = 'nfc';
    } else {
      venueId = trigger.venueId;
      triggerRef = trigger.byUserId;
      requireStaff(db, venueId, trigger.byUserId);
    }

    const venue = getVenue(db, venueId);
    if (venue.status !== 'live') throw new DomainError('invalid_state', 'venue is not live');

    /* An account may hold exactly one pending transaction at a venue. Two open
       gates at one counter is how a customer ends up confirming the wrong one. */
    const existing = db.get<{ id: string }>(
      `SELECT id FROM transactions WHERE user_id = $u AND venue_id = $v AND status = 'pending'`,
      { u: input.userId, v: venueId },
    );
    if (existing) {
      throw new DomainError('conflict', 'a transaction is already open at this venue', {
        transactionId: existing.id,
      });
    }

    /* §3.4: any event involving a discount is cashier-entered, whatever the
       venue's default is. The customer's own phone must never originate the
       number a discount is computed from. */
    const entryBy: 'cashier' | 'customer' =
      intent === 'earn' ? venue.amount_entry : 'cashier';

    if (intent === 'voucher_redeem') {
      const voucher = db.get<vouchers.IssuedVoucher>(
        `SELECT * FROM issued_vouchers WHERE id = $i AND user_id = $u`,
        { i: input.intentRef ?? '', u: input.userId },
      );
      if (!voucher) throw new DomainError('not_found', 'voucher not found');
      if (voucher.status !== 'active') throw new DomainError('already_used', 'voucher is not active');
      if (voucher.venue_id !== venueId) throw new DomainError('forbidden', 'voucher is for another venue');
      if (voucher.expires_at <= at) throw new DomainError('expired', 'voucher has expired');
    }

    if (intent === 'reward_redeem') {
      const reward = db.get<campaigns.EarnedReward>(
        `SELECT * FROM earned_rewards WHERE id = $i AND user_id = $u`,
        { i: input.intentRef ?? '', u: input.userId },
      );
      if (!reward) throw new DomainError('not_found', 'reward not found');
      if (reward.status !== 'available') throw new DomainError('already_used', 'reward is not available');
      if (reward.venue_id !== venueId) throw new DomainError('forbidden', 'reward is for another venue');
      if (reward.expires_at <= at) throw new DomainError('expired', 'reward has expired');
    }

    const id = newId('txn');
    db.run(
      `INSERT INTO transactions
         (id, venue_id, user_id, trigger_type, trigger_ref, intent, intent_ref, status,
          currency, amount_entered_by, deal_id, client_ts, device_id, opened_at, created_at)
       VALUES ($i, $v, $u, $tk, $tr, $in, $ir, 'pending', $c, $by, $d, $cts, $dev, $at, $at)`,
      {
        i: id,
        v: venueId,
        u: input.userId,
        tk: trigger.kind,
        tr: triggerRef,
        in: intent,
        ir: input.intentRef ?? null,
        c: venue.currency,
        by: entryBy,
        d: input.dealId ?? null,
        cts: input.clientTs ?? null,
        dev: input.deviceId ?? null,
        at,
      },
    );
    return getTransaction(db, id);
  });
}

export function getTransaction(db: Db, id: string): Transaction {
  const txn = db.get<Transaction>(`SELECT * FROM transactions WHERE id = $i`, { i: id });
  if (!txn) throw new DomainError('not_found', 'transaction not found');
  return txn;
}

/* ══════════════════════════════════════════ step 3: the amount goes in ══ */

/**
 * Write the amount onto a pending transaction.
 *
 * Who may do this is decided by the venue's configuration and the intent (§3.4).
 * A customer-entered amount is *held* — it does not confirm anything — which is
 * why this and `confirm` are separate calls even when the same person makes
 * both: the cashier's confirmation is a distinct act against a number they can
 * see.
 *
 * A wrong amount is corrected by calling this again, not by cancelling: "allow
 * the cashier to correct rather than cancel" is in the spec because cancelling
 * makes the customer re-scan, and re-scanning after a typo is how a queue turns
 * into a complaint.
 */
export function submitAmount(
  db: Db,
  input: { transactionId: string; amountMinor: number; actorId: string; at?: Iso },
): Transaction {
  const at = input.at ?? now();
  return db.tx(() => {
    const txn = getTransaction(db, input.transactionId);
    if (txn.status !== 'pending') throw new DomainError('invalid_state', 'transaction is not pending');

    const venue = getVenue(db, txn.venue_id);
    if (txn.amount_entered_by === 'cashier') requireStaff(db, venue.id, input.actorId);
    else if (input.actorId !== txn.user_id) requireStaff(db, venue.id, input.actorId);

    const check = plausibleAmount(input.amountMinor, venue.max_amount_minor);
    if (!check.ok) {
      throw new DomainError('invalid_amount', `amount rejected: ${check.reason}`, {
        reason: check.reason,
        ceiling: venue.max_amount_minor,
      });
    }

    db.run(`UPDATE transactions SET amount_minor = $a WHERE id = $i AND status = 'pending'`, {
      a: input.amountMinor,
      i: txn.id,
    });
    void at;
    return getTransaction(db, txn.id);
  });
}

/* ═══════════════════════════════════════════════ steps 4–5: confirm & commit ══ */

export interface Receipt {
  transaction: Transaction;
  pointsGranted: number;
  pointsCapped: number;
  discountMinor: number;
  stamped: boolean;
  reward: campaigns.EarnedReward | null;
  visitCounted: boolean;
  balance: number;
  /** §7.4-style reward connection: the nearest tier this balance now reaches. */
  nextTier: { discountPct: number; pointsNeeded: number } | null;
}

/**
 * The commit (§3.5), and the only place in the backend that grants anything.
 *
 * Everything below happens in one database transaction. If any part of it
 * throws, the whole thing rolls back and the transaction stays pending — never
 * partially applied. That is the entire reason the ledger, the budget and the
 * stamp card are separate modules with no side effects of their own: they can be
 * composed inside one `db.tx` because none of them commits on its own.
 */
export function confirm(
  db: Db,
  input: { transactionId: string; cashierId: string; at?: Iso },
): Receipt {
  const at = input.at ?? now();

  const receipt = db.tx((): Receipt => {
    const txn = getTransaction(db, input.transactionId);
    if (txn.status !== 'pending') throw new DomainError('invalid_state', 'transaction is not pending');
    if (txn.amount_minor === null) throw new DomainError('invalid_state', 'no amount has been entered');

    const venue = getVenue(db, txn.venue_id);
    requireStaff(db, venue.id, input.cashierId);

    if (minutesBetween(txn.opened_at, at) > CONFIG.gate.pendingTtlMinutes) {
      db.run(
        `UPDATE transactions SET status = 'cancelled', cancelled_at = $t, cancel_reason = 'timeout'
          WHERE id = $i`,
        { t: at, i: txn.id },
      );
      throw new DomainError('expired', 'this transaction timed out; scan again');
    }

    const amount = txn.amount_minor;
    let pointsGranted = 0;
    let pointsCapped = 0;
    let discountMinor = 0;
    let reward: campaigns.EarnedReward | null = null;
    let stamped = false;

    /* ── the redemption intents ── */
    if (txn.intent === 'voucher_redeem' && txn.intent_ref) {
      const voucher = db.get<vouchers.IssuedVoucher>(`SELECT * FROM issued_vouchers WHERE id = $i`, {
        i: txn.intent_ref,
      })!;
      discountMinor = vouchers.redeem(db, voucher, venue, amount, txn.id, at).discountMinor;
    }

    if (txn.intent === 'reward_redeem' && txn.intent_ref) {
      const earned = db.get<campaigns.EarnedReward>(`SELECT * FROM earned_rewards WHERE id = $i`, {
        i: txn.intent_ref,
      })!;
      discountMinor = campaigns.redeemReward(db, earned, txn.id, at).costMinor;
    }

    /* ── the visit, which is what everything else keys off ── */
    const l = local(at, venue.timezone);
    const qualifies = amount >= venue.min_spend_minor;
    const visitCounted = qualifies && recordVisit(db, {
      userId: txn.user_id,
      venue,
      amountMinor: amount,
      transactionId: txn.id,
      day: l.day,
      hour: l.hour,
      weekday: l.weekday,
      at,
    });

    /* ── earning ── */
    if (txn.intent === 'earn' && visitCounted && venue.loyalty_active) {
      const ent = entitlements.entitlementsFor(db, { userId: txn.user_id });
      const multiplier = entitlements.entNumber(ent, 'points_multiplier', 1);
      const result = ledger.earn(db, {
        userId: txn.user_id,
        points: venue.points_per_scan,
        reason: 'scan_earn',
        sourceKind: 'transaction',
        sourceRef: txn.id,
        venueId: venue.id,
        multiplier,
        at,
      });
      pointsGranted = result.entry.delta;
      pointsCapped = result.capped;
    }

    /* ── stamps ── */
    if (visitCounted) {
      reward = campaigns.applyVisit(db, {
        userId: txn.user_id,
        venue,
        amountMinor: amount,
        transactionId: txn.id,
        at,
      });
      stamped = true;
    }

    /* ── the deal funnel's third step (§6.3) ── */
    if (txn.deal_id && visitCounted) claimDeal(db, txn.deal_id, txn.user_id, txn.id, discountMinor, at);

    /* ── §8.1: the referral pays on the invited user's *first* confirmed scan ── */
    completeReferral(db, txn.user_id, at);

    db.run(
      `UPDATE transactions
          SET status = 'committed', confirmed_at = $t, confirmed_by = $c,
              points_granted = $p, discount_minor = $d, stamp_granted = $s
        WHERE id = $i AND status = 'pending'`,
      {
        t: at,
        c: input.cashierId,
        p: pointsGranted,
        d: discountMinor,
        s: stamped ? 1 : 0,
        i: txn.id,
      },
    );

    const balance = ledger.balance(db, txn.user_id);
    return {
      transaction: getTransaction(db, txn.id),
      pointsGranted,
      pointsCapped,
      discountMinor,
      stamped,
      reward,
      visitCounted,
      balance,
      nextTier: nearestTier(db, venue.id, balance),
    };
  });

  /* Outside the transaction on purpose: a fraud *case* is a note for a human and
     must never be able to roll back money that legitimately changed hands at a
     counter (§13, and the reasoning in `fraud.ts`). */
  fraud.checkTransaction(db, {
    userId: receipt.transaction.user_id,
    venueId: receipt.transaction.venue_id,
    transactionId: receipt.transaction.id,
    at,
  });
  fraud.refreshTrust(db, receipt.transaction.user_id);

  if (receipt.reward) {
    notifications.notify(db, {
      userId: receipt.transaction.user_id,
      kind: 'reward_earned',
      title: receipt.reward.label,
      body: 'Your stamp card is complete — the reward is in your wallet.',
      sourceKind: 'earned_reward',
      sourceRef: receipt.reward.id,
      venueId: receipt.transaction.venue_id,
      push: true,
      at,
    });
  }

  return receipt;
}

export function cancel(
  db: Db,
  input: { transactionId: string; reason: string; actorId: string; at?: Iso },
): Transaction {
  const at = input.at ?? now();
  const txn = getTransaction(db, input.transactionId);
  if (txn.status !== 'pending') throw new DomainError('invalid_state', 'transaction is not pending');
  /* Either side may walk away from a pending gate: the customer changed their
     mind, or the cashier is closing the till. Nothing has been granted, so there
     is nothing to protect and no reason to make it hard. */
  if (input.actorId !== txn.user_id) requireStaff(db, txn.venue_id, input.actorId);

  db.run(
    `UPDATE transactions SET status = 'cancelled', cancelled_at = $t, cancel_reason = $r
      WHERE id = $i AND status = 'pending'`,
    { t: at, r: input.reason, i: input.transactionId },
  );
  return getTransaction(db, input.transactionId);
}

/**
 * Sweep pending transactions nobody confirmed.
 *
 * Cheap to run and important: a pending row at a venue blocks that customer's
 * next scan there (see `openTransaction`), so a cashier who walked away without
 * confirming would otherwise lock a customer out until somebody noticed.
 */
export function expirePending(db: Db, at: Iso = now()): number {
  const cutoff = plusMinutes(at, -CONFIG.gate.pendingTtlMinutes);
  return db.run(
    `UPDATE transactions SET status = 'cancelled', cancelled_at = $t, cancel_reason = 'timeout'
      WHERE status = 'pending' AND opened_at < $c`,
    { t: at, c: cutoff },
  ).changes;
}

/** Pending transactions at a venue — the partner app's confirmation queue. */
export const pendingAt = (db: Db, venueId: string): Transaction[] =>
  db.all<Transaction>(
    `SELECT * FROM transactions WHERE venue_id = $v AND status = 'pending' ORDER BY opened_at`,
    { v: venueId },
  );

/* ───────────────────────────────────────────────────────────────── private ── */

/**
 * §5.2. Record the visit, if it is one.
 *
 * "One qualifying scan per customer per venue per day, with a minimum spend."
 * The uniqueness is enforced by the index rather than by a check-then-insert,
 * because two scans a second apart both pass a check. The insert that loses
 * returns false and the transaction still commits — the customer bought
 * something, it just does not count twice.
 *
 * The venue's own `scan_cooldown_hours` (from the old database's LoyaltyConfig)
 * is applied on top as the stricter of the two: a venue that set 48 hours meant
 * it, and the daily rule alone would ignore them.
 */
function recordVisit(
  db: Db,
  input: {
    userId: string;
    venue: Venue;
    amountMinor: number;
    transactionId: string;
    day: string;
    hour: number;
    weekday: number;
    at: Iso;
  },
): boolean {
  const last = db.get<{ created_at: string }>(
    `SELECT created_at FROM venue_visits WHERE user_id = $u AND venue_id = $v
      ORDER BY created_at DESC LIMIT 1`,
    { u: input.userId, v: input.venue.id },
  );
  if (last && minutesBetween(last.created_at, input.at) / 60 < input.venue.scan_cooldown_hours) {
    return false;
  }

  try {
    db.run(
      `INSERT INTO venue_visits
         (id, user_id, venue_id, local_day, transaction_id, amount_minor, local_hour,
          local_weekday, created_at)
       VALUES ($i, $u, $v, $d, $x, $a, $h, $w, $t)`,
      {
        i: newId('vis'),
        u: input.userId,
        v: input.venue.id,
        d: input.day,
        x: input.transactionId,
        a: input.amountMinor,
        h: input.hour,
        w: input.weekday,
        t: input.at,
      },
    );
  } catch {
    /* The unique index fired: a visit is already recorded for this day. */
    return false;
  }

  db.run(
    `INSERT INTO venue_customers (venue_id, user_id, first_seen_at, last_seen_at, visits, spend_minor)
     VALUES ($v, $u, $t, $t, 1, $a)
     ON CONFLICT (venue_id, user_id) DO UPDATE
       SET last_seen_at = excluded.last_seen_at,
           visits = visits + 1,
           spend_minor = spend_minor + excluded.spend_minor`,
    { v: input.venue.id, u: input.userId, t: input.at, a: input.amountMinor },
  );
  return true;
}

/**
 * §6.3. A claim is a user who *opened* a deal completing a qualifying scan
 * inside the window — not a tap on "claim" in a list.
 *
 * The per-deal cap stops further claims but never rolls one back: the customer
 * is standing at the counter and the offer was live when they walked in.
 */
function claimDeal(
  db: Db,
  dealId: string,
  userId: string,
  transactionId: string,
  discountMinor: number,
  at: Iso,
): void {
  const deal = db.get<{
    status: string;
    valid_from: string | null;
    valid_to: string | null;
    cap_claims: number | null;
    cap_spend_minor: number | null;
    claimed_count: number;
    spend_minor: number;
  }>(`SELECT * FROM hot_deals WHERE id = $i`, { i: dealId });
  if (!deal || deal.status !== 'live') return;
  if (deal.valid_from && deal.valid_from > at) return;
  if (deal.valid_to && deal.valid_to < at) return;
  if (deal.cap_claims !== null && deal.claimed_count >= deal.cap_claims) return;
  if (deal.cap_spend_minor !== null && deal.spend_minor >= deal.cap_spend_minor) return;

  /* Opened first: an impression is not intent, and counting a claim against a
     deal the customer never opened would flatter every funnel on the platform. */
  const opened = db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM deal_events
      WHERE deal_id = $d AND user_id = $u AND event_type = 'open'`,
    { d: dealId, u: userId },
  );
  if ((opened?.n ?? 0) === 0) return;

  db.run(
    `INSERT INTO deal_events (id, deal_id, user_id, event_type, source, transaction_id, created_at)
     VALUES ($i, $d, $u, 'claim', 'gate', $x, $t)`,
    { i: newId('evt'), d: dealId, u: userId, x: transactionId, t: at },
  );
  db.run(
    `UPDATE hot_deals SET claimed_count = claimed_count + 1, spend_minor = spend_minor + $s
      WHERE id = $i`,
    { s: discountMinor, i: dealId },
  );
}

/**
 * §8.1. Pay a referral on the invited user's first confirmed scan.
 *
 * Not on signup, which is the whole point: a referral that pays at signup is a
 * referral that pays for throwaway accounts, and paying for those is how a
 * points economy is farmed. Both parties are paid at the same moment.
 */
function completeReferral(db: Db, userId: string, at: Iso): void {
  const bond = db.get<{ id: string; referrer_id: string }>(
    `SELECT id, referrer_id FROM referrals WHERE referred_id = $u AND status = 'pending'`,
    { u: userId },
  );
  if (!bond) return;

  const reward = CONFIG.points.referralReward;
  ledger.earn(db, {
    userId: bond.referrer_id,
    points: reward,
    reason: 'referral',
    sourceKind: 'referral',
    sourceRef: bond.id,
    at,
  });
  ledger.earn(db, {
    userId,
    points: reward,
    reason: 'referral',
    sourceKind: 'referral',
    sourceRef: bond.id,
    at,
  });
  db.run(
    `UPDATE referrals SET status = 'completed', points_awarded = $p, completed_at = $t WHERE id = $i`,
    { p: reward, t: at, i: bond.id },
  );
}

/** §7.4's "you're 60 from 10% off" — computed from the real balance and tiers. */
export function nearestTier(
  db: Db,
  venueId: string,
  balance: number,
): { discountPct: number; pointsNeeded: number } | null {
  const tier = db.get<{ discount_pct: number; points_cost: number }>(
    `SELECT discount_pct, points_cost FROM voucher_tiers
      WHERE venue_id = $v AND active = 1 AND points_cost > $b
      ORDER BY points_cost ASC LIMIT 1`,
    { v: venueId, b: balance },
  );
  if (!tier) return null;
  return { discountPct: tier.discount_pct, pointsNeeded: tier.points_cost - balance };
}

/**
 * Who may confirm at this venue.
 *
 * The owner, or an admin. `manager` is in the role table already (B1
 * future-proofing) and is accepted here so inviting one later is a row rather
 * than a code change — which is exactly what "without schema migration" was
 * asking for.
 */
export function requireStaff(db: Db, venueId: string, userId: string): void {
  const owner = db.get<{ owner_user_id: string | null }>(
    `SELECT owner_user_id FROM venues WHERE id = $v`,
    { v: venueId },
  );
  if (owner?.owner_user_id === userId) return;

  const role = db.get<{ role: string }>(
    `SELECT role FROM user_roles WHERE user_id = $u AND role IN ('admin', 'manager')`,
    { u: userId },
  );
  if (role) return;

  throw new DomainError('forbidden', 'only venue staff may confirm at this venue');
}

/** The pool position a partner app shows beside its confirmation queue. */
export const budgetSnapshot = (db: Db, venueId: string, at: Iso = now()) =>
  budget.budgetFor(db, venueId, at);
