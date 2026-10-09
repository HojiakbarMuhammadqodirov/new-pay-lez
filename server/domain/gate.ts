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
import * as reminders from './reminders.ts';
import * as vouchers from './vouchers.ts';
import * as consent from './consent.ts';
import * as team from './team.ts';
import { DomainError } from './errors.ts';
import { newId, shortCode } from './ids.ts';
import { plausibleAmount } from './money.ts';
import { open as openToken, seal } from '../crypto/tokens.ts';
import { verifyTap } from '../crypto/nfc.ts';
import { local, minutesBetween, now, plusDays, plusMinutes, type Iso } from './time.ts';
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
  /** The team member the confirmation is recorded against (server/TEAM.md); null for the owner. */
  confirmed_member_id: string | null;
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
export async function mintQr(db: Db, venueId: string, secret: string, at: Iso = now()) {
  const jti = newId('evt');
  const expires = plusMinutes(at, CONFIG.gate.qrTtlSeconds / 60);
  await db.run(
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
export async function verifyQr(db: Db, token: string, secret: string, userId: string, at: Iso = now()): Promise<string> {
  const payload = openToken<QrPayload>(secret, token);
  if (!payload?.v || !payload.jti) throw new DomainError('invalid_trigger', 'bad QR signature');
  if (payload.exp * 1000 < new Date(at).getTime()) throw new DomainError('expired', 'QR has expired');

  const claimed = await db.run(
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
 * §3.3 limits on taps, beside the per-account hourly bound the route declares
 * (`NFC_TAPS_PER_HOUR`, enforced by `http/server.ts`).
 *
 * One tag, one account, a rolling day. A tap opens a PENDING transaction and
 * grants nothing, and `recordVisit`'s cooldown already decides whether a
 * second scan the same day is a visit — so this is not an economy rule. It is
 * a ceiling on litter: a phone held against a sticker in a loop burns the
 * tag's counter and fills the counter's queue with gates nobody will confirm.
 * Six is a customer who paid, came back for a coffee, and tapped twice each
 * time because the first one did not seem to take.
 *
 * Both live here rather than in `config.ts` only because that file was being
 * edited by another session when they were added; moving them is a cut and a
 * paste.
 */
export const NFC_TAPS_PER_TAG_PER_DAY = 6;
export const NFC_TAPS_PER_HOUR = 20;

/** What a verified tap resolved to. */
export interface VerifiedTap {
  venueId: string;
  /** The tag's UID — what `trigger_ref` records as `nfc:<uid>`. */
  uid: string;
  counter: number;
}

/**
 * §3.3. Verify an NFC tap and burn its counter.
 *
 * The order is the defence: the MAC first (a forgery learns nothing about the
 * registry), then the registry (unknown and revoked tags), then the per-tag
 * ceiling, and the counter last — so a tap refused for any earlier reason does
 * not burn anything, and the transaction around it rolls back regardless.
 *
 * The counter check is `>`, never `>=`: a tap that presents the counter we
 * already saw is the same tap arriving twice. The one exception is a tag's
 * very first tap, which NTAG 424 DNA may number 0 — `last_tap_at IS NULL` is
 * what tells "never tapped" from "tapped at 0", because `last_counter`'s
 * default is also 0.
 */
export async function verifyNfc(
  db: Db,
  input: { piccHex: string; cmacHex: string; masterKey: Buffer; userId: string; at?: Iso },
): Promise<VerifiedTap> {
  const at = input.at ?? now();
  const result = verifyTap(input.masterKey, input.piccHex, input.cmacHex);
  if (!result.ok) throw new DomainError('invalid_trigger', `NFC rejected: ${result.reason}`, { reason: result.reason });

  const tag = await db.get<{ venue_id: string | null; last_counter: number; status: string }>(
    `SELECT venue_id, last_counter, status FROM tag_registry WHERE tag_uid = $u`,
    { u: result.uid },
  );
  /* A genuine MAC from a UID we never imported is our silicon on somebody
     else's registry — or a registry row deleted by hand. Either way nothing to
     open a gate at, and `not_found` says so more plainly than `invalid_trigger`. */
  if (!tag) throw new DomainError('not_found', 'this Paylez tag is not registered', { uid: result.uid });
  if (tag.status !== 'active' || !tag.venue_id) {
    throw new DomainError('invalid_trigger', 'this Paylez tag is not in use', { uid: result.uid, status: tag.status });
  }

  const today = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM transactions
      WHERE user_id = $u AND trigger_type = 'nfc' AND trigger_ref = $r AND opened_at >= $since`,
    { u: input.userId, r: `nfc:${result.uid}`, since: plusDays(at, -1) },
  );
  if ((today?.n ?? 0) >= NFC_TAPS_PER_TAG_PER_DAY) {
    throw new DomainError('rate_limited', 'this tag has been tapped enough times today', {
      retryAfterMinutes: 24 * 60,
      limit: NFC_TAPS_PER_TAG_PER_DAY,
    });
  }

  const advanced = await db.run(
    `UPDATE tag_registry SET last_counter = $c, last_tap_at = $t
      WHERE tag_uid = $u AND (last_counter < $c OR (last_tap_at IS NULL AND last_counter <= $c))`,
    { c: result.counter, t: at, u: result.uid },
  );
  if (advanced.changes === 0) {
    /* Filed outside the transaction — see the note in `verifyQr`. */
    throw new DomainError('replay_detected', 'this tap has already been seen', {
      venueId: tag.venue_id,
      counter: result.counter,
      lastCounter: tag.last_counter,
    });
  }
  return { venueId: tag.venue_id, uid: result.uid, counter: result.counter };
}

/**
 * Which venue a tap URL belongs to, **without** burning its counter.
 *
 * For the website's `/t` page, which a phone without the app lands on: it can
 * name the venue and offer the app, and it must not use the tap up — the app
 * opened from that page will need it. The MAC is still checked, so a made-up
 * URL names nothing. Nothing is opened or granted, and the answer is what the
 * venue's public page says anyway.
 */
export async function resolveTag(
  db: Db,
  input: { piccHex: string; cmacHex: string; masterKey: Buffer },
): Promise<{ venueId: string; venueName: string; label: string | null }> {
  const result = verifyTap(input.masterKey, input.piccHex, input.cmacHex);
  if (!result.ok) throw new DomainError('invalid_trigger', `NFC rejected: ${result.reason}`, { reason: result.reason });
  const tag = await db.get<{ venue_id: string | null; status: string; label: string | null; name: string | null; venue_status: string | null }>(
    `SELECT t.venue_id, t.status, t.label, v.name, v.status AS venue_status
       FROM tag_registry t LEFT JOIN venues v ON v.id = t.venue_id
      WHERE t.tag_uid = $u`,
    { u: result.uid },
  );
  if (!tag || tag.status !== 'active' || !tag.venue_id || tag.venue_status !== 'live') {
    throw new DomainError('not_found', 'this Paylez tag is not in use');
  }
  return { venueId: tag.venue_id, venueName: tag.name ?? '', label: tag.label };
}

/** A venue's own tags, for its owner or manager (`GET /v1/venues/:id/nfc-tags`). */
export async function tagsAt(db: Db, venueId: string) {
  return await db.all<{ uid: string; status: string; label: string | null; assigned_at: string | null; last_tap_at: string | null }>(
    `SELECT tag_uid AS uid, status, label, assigned_at, last_tap_at
       FROM tag_registry WHERE venue_id = $v ORDER BY assigned_at DESC`,
    { v: venueId },
  );
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
  | { kind: 'manual'; venueId: string; byUserId: string }
  /** §3b: the counter scanned the customer's pass. See `scanPass`. */
  | { kind: 'pass'; pass: PassRow; byUserId: string };

/**
 * Step 1–2: validate the trigger and open a PENDING transaction.
 *
 * Eligibility is checked here rather than at confirm time so a cashier is never
 * asked to type an amount into something that was going to be refused anyway —
 * but nothing is granted, reserved or decremented. A pending transaction is a
 * promise to decide, not a decision.
 */
export async function openTransaction(db: Db, trigger: Trigger, input: OpenInput): Promise<Transaction> {
  const at = input.at ?? now();
  const intent = input.intent ?? 'earn';

  try {
    return await openInTransaction(db, trigger, input, intent, at);
  } catch (error) {
    /* A replay is the one failure worth a record of its own, and it has to be
       written *after* the rollback or it rolls back with the attempt it
       describes. §13: replays are rejected and surfaced, not silently dropped. */
    if (error instanceof DomainError && error.code === 'replay_detected') {
      await fraud.openCase(db, {
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

async function openInTransaction(
  db: Db,
  trigger: Trigger,
  input: OpenInput,
  intent: Intent,
  at: Iso,
): Promise<Transaction> {
  return db.tx(async () => {
    let venueId: string;
    let triggerRef: string | null = null;

    if (trigger.kind === 'qr') {
      venueId = await verifyQr(db, trigger.token, trigger.secret, input.userId, at);
      triggerRef = 'qr';
    } else if (trigger.kind === 'nfc') {
      const tap = await verifyNfc(db, {
        piccHex: trigger.piccHex,
        cmacHex: trigger.cmacHex,
        masterKey: trigger.masterKey,
        userId: input.userId,
        at,
      });
      venueId = tap.venueId;
      /* Which tag, so a venue's taps can be told apart and counted per tag
         (`NFC_TAPS_PER_TAG_PER_DAY`). The UID is not a secret — the tag answers
         it to any reader. */
      triggerRef = `nfc:${tap.uid}`;
    } else if (trigger.kind === 'pass') {
      /* `scanPass` has already checked the counter's `redeem` at this venue. */
      venueId = await claimPass(db, trigger.pass, trigger.byUserId, at);
      triggerRef = `pass:${trigger.pass.id}`;
    } else {
      venueId = trigger.venueId;
      triggerRef = trigger.byUserId;
      /* Opening a gate for a customer standing at the till is the counter's
         "scan": a staff login needs that permission, the owner has it. */
      await team.requireCounter(db, venueId, trigger.byUserId, 'scan', { customerId: input.userId, at });
    }

    const venue = await getVenue(db, venueId);
    if (venue.status !== 'live') throw new DomainError('invalid_state', 'venue is not live');

    /* An account may hold exactly one pending transaction at a venue. Two open
       gates at one counter is how a customer ends up confirming the wrong one. */
    const existing = await db.get<{ id: string; opened_at: string }>(
      `SELECT id, opened_at FROM transactions WHERE user_id = $u AND venue_id = $v AND status = 'pending'`,
      { u: input.userId, v: venueId },
    );
    if (existing && minutesBetween(existing.opened_at, at) > CONFIG.gate.pendingTtlMinutes) {
      /* One past the time limit cannot be confirmed — `confirm` refuses it — so
         it is not an open gate, it is litter the five-minute sweep has not
         reached. Refusing a fresh scan over it told a customer standing at the
         counter that a transaction nobody could complete was "already open".
         It is cancelled as a timeout here, the way the sweep would. */
      await db.run(
        `UPDATE transactions SET status = 'cancelled', cancelled_at = $t, cancel_reason = 'timeout'
          WHERE id = $i AND status = 'pending'`,
        { t: at, i: existing.id },
      );
    } else if (existing) {
      throw new DomainError('conflict', 'a transaction is already open at this venue', {
        transactionId: existing.id,
      });
    }

    /* §3.4: any event involving a discount is cashier-entered, whatever the
       venue's default is. The customer's own phone must never originate the
       number a discount is computed from. */
    const entryBy: 'cashier' | 'customer' =
      intent === 'earn' ? venue.amount_entry : 'cashier';

    if (intent !== 'earn') {
      const heldAt = await heldVenue(db, intent, input.intentRef ?? '', input.userId, at);
      if (heldAt !== venueId) {
        throw new DomainError('forbidden', `${intent === 'voucher_redeem' ? 'voucher' : 'reward'} is for another venue`);
      }
    }

    const id = newId('txn');
    await db.run(
      `INSERT INTO transactions
         (id, venue_id, user_id, trigger_type, trigger_ref, intent, intent_ref, status,
          currency, amount_entered_by, deal_id, client_ts, device_id, opened_at, created_at)
       VALUES ($i, $v, $u, $tk, $tr, $in, $ir, 'pending', $c, $by, $d, $cts, $dev, $at, $at)`,
      {
        i: id,
        v: venueId,
        u: input.userId,
        /* A pass is opened by the counter against the customer's account, which
           is what `manual` already means; `trigger_ref` says which pass. */
        tk: trigger.kind === 'pass' ? 'manual' : trigger.kind,
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
    if (trigger.kind === 'pass') {
      /* The bill the customer typed, held on the row the cashier is about to
         read. A departure from §3.4's "cashier-entered", and a bounded one: it
         is still only a number on a pending transaction, the cashier confirms
         against it on their own screen, and corrects it first through
         `/amount` when the till says otherwise. `amount_entered_by` says so. */
      await db.run(
        `UPDATE transactions SET amount_minor = $a, amount_entered_by = 'customer' WHERE id = $i`,
        { a: trigger.pass.amount_minor, i: id },
      );
      await db.run(`UPDATE redemption_passes SET transaction_id = $x WHERE id = $p`, { x: id, p: trigger.pass.id });
    }
    return await getTransaction(db, id);
  });
}

/**
 * Where a held voucher or reward can be spent — after checking it is this
 * customer's, still usable and in date. The one definition both the gate's
 * open and the pass's mint use, so the two cannot drift on what "held" means.
 */
async function heldVenue(db: Db, intent: Exclude<Intent, 'earn'>, ref: string, userId: string, at: Iso): Promise<string> {
  if (intent === 'voucher_redeem') {
    const voucher = await db.get<vouchers.IssuedVoucher>(
      `SELECT * FROM issued_vouchers WHERE id = $i AND user_id = $u`,
      { i: ref, u: userId },
    );
    if (!voucher) throw new DomainError('not_found', 'voucher not found');
    if (voucher.status !== 'active') throw new DomainError('already_used', 'voucher is not active');
    if (voucher.expires_at <= at) throw new DomainError('expired', 'voucher has expired');
    return voucher.venue_id;
  }
  const reward = await db.get<campaigns.EarnedReward>(
    `SELECT * FROM earned_rewards WHERE id = $i AND user_id = $u`,
    { i: ref, u: userId },
  );
  if (!reward) throw new DomainError('not_found', 'reward not found');
  if (reward.status !== 'available') throw new DomainError('already_used', 'reward is not available');
  if (reward.expires_at <= at) throw new DomainError('expired', 'reward has expired');
  return reward.venue_id;
}

/* ═══════════════════════════════ §3b the pass: the gate the other way round ══ */

/*
 * The customer opens a voucher or reward they hold, types the bill, and their
 * phone shows a QR — or, when the camera cannot read the screen, a six-letter
 * code. The counter scans (or types) it, and that opens the same PENDING
 * transaction the venue's own QR would have, with the amount already on it.
 * The confirm is unchanged and is still the only grant.
 *
 * The pass is signed here and stored here, so the phone holds nothing it could
 * forge: the token names a row, and the row says which voucher, which venue
 * and how much. Single use (a conditional UPDATE, as `verifyQr`), short-lived,
 * and one live pass per voucher — making a new one retires the old.
 */

export interface PassRow {
  id: string;
  code: string;
  venue_id: string;
  user_id: string;
  intent: 'voucher_redeem' | 'reward_redeem';
  intent_ref: string;
  amount_minor: number;
  currency: string;
  issued_at: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  transaction_id: string | null;
}

interface PassPayload {
  p: string;
  v: string;
  exp: number;
}

/** What a pass token starts with, so a counter's scanner can tell it from any other QR. */
export const PASS_PREFIX = 'plzpass.';

export interface Pass {
  id: string;
  token: string;
  code: string;
  venueId: string;
  intent: PassRow['intent'];
  intentRef: string;
  amountMinor: number;
  currency: string;
  expiresAt: string;
  ttlSeconds: number;
}

export async function mintPass(
  db: Db,
  input: {
    userId: string;
    intent: PassRow['intent'];
    intentRef: string;
    amountMinor: number;
    secret: string;
    at?: Iso;
  },
): Promise<Pass> {
  const at = input.at ?? now();
  return db.tx(async () => {
    const venueId = await heldVenue(db, input.intent, input.intentRef, input.userId, at);
    const venue = await getVenue(db, venueId);
    if (venue.status !== 'live') throw new DomainError('invalid_state', 'venue is not live');

    const check = plausibleAmount(input.amountMinor, venue.max_amount_minor);
    if (!check.ok) {
      throw new DomainError('invalid_amount', `amount rejected: ${check.reason}`, {
        reason: check.reason,
        ceiling: venue.max_amount_minor,
      });
    }

    /* One live pass per voucher: the screen still showing an older amount stops working. */
    await db.run(
      `UPDATE redemption_passes SET expires_at = $t
        WHERE intent_ref = $r AND user_id = $u AND used_at IS NULL AND expires_at > $t`,
      { t: at, r: input.intentRef, u: input.userId },
    );

    /* Unique among the venue's live passes, which is all a typed code is looked up in. */
    let code = shortCode(6);
    for (let tries = 0; tries < 8; tries += 1) {
      const clash = await db.get<{ id: string }>(
        `SELECT id FROM redemption_passes
          WHERE venue_id = $v AND code = $c AND used_at IS NULL AND expires_at > $t`,
        { v: venueId, c: code, t: at },
      );
      if (!clash) break;
      code = shortCode(6);
    }

    const id = newId('pss');
    const expires = plusMinutes(at, CONFIG.gate.passTtlSeconds / 60);
    await db.run(
      `INSERT INTO redemption_passes
         (id, code, venue_id, user_id, intent, intent_ref, amount_minor, currency, issued_at, expires_at)
       VALUES ($i, $c, $v, $u, $in, $r, $a, $cur, $t, $e)`,
      {
        i: id,
        c: code,
        v: venueId,
        u: input.userId,
        in: input.intent,
        r: input.intentRef,
        a: input.amountMinor,
        cur: venue.currency,
        t: at,
        e: expires,
      },
    );
    const payload: PassPayload = { p: id, v: venueId, exp: Math.floor(new Date(expires).getTime() / 1000) };
    return {
      id,
      token: PASS_PREFIX + seal(input.secret, { ...payload }),
      code,
      venueId,
      intent: input.intent,
      intentRef: input.intentRef,
      amountMinor: input.amountMinor,
      currency: venue.currency,
      expiresAt: expires,
      ttlSeconds: CONFIG.gate.passTtlSeconds,
    };
  });
}

/** What the counter is shown before it confirms: whose, what, and for how much. */
export interface PassPreview {
  code: string;
  intent: PassRow['intent'];
  title: string;
  customerName: string;
  amountMinor: number;
  currency: string;
}

/**
 * The counter scans a pass (or types its code) and gets a PENDING transaction.
 *
 * Checked in the order that gives away least: the scanner must be on this
 * venue's counter with `redeem` before anything about the pass is said; then
 * which venue the pass is for; then whether it is spent or out of date. The
 * claim itself is inside the open's transaction, so a pass two counters scan
 * in the same moment opens one transaction, and the second is a replay.
 */
export async function scanPass(
  db: Db,
  input: {
    token?: string | null;
    code?: string | null;
    venueId: string;
    staffId: string;
    memberId?: string | null;
    secret: string;
    at?: Iso;
  },
): Promise<{ transaction: Transaction; pass: PassPreview }> {
  const at = input.at ?? now();
  await team.requireCounter(db, input.venueId, input.staffId, 'redeem', { memberId: input.memberId ?? null, at });

  let row: PassRow | undefined;
  if (input.token) {
    const raw = input.token.trim();
    const payload = raw.startsWith(PASS_PREFIX)
      ? openToken<PassPayload>(input.secret, raw.slice(PASS_PREFIX.length))
      : null;
    if (!payload?.p) throw new DomainError('invalid_trigger', 'this is not a Paylez deal pass');
    row = await db.get<PassRow>(`SELECT * FROM redemption_passes WHERE id = $i`, { i: payload.p });
  } else {
    const code = (input.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!code) throw new DomainError('bad_request', 'send the pass token or its code');
    row = await db.get<PassRow>(
      `SELECT * FROM redemption_passes WHERE venue_id = $v AND code = $c ORDER BY issued_at DESC LIMIT 1`,
      { v: input.venueId, c: code },
    );
  }
  if (!row) throw new DomainError('not_found', 'no deal pass with that code here');
  if (row.venue_id !== input.venueId) throw new DomainError('forbidden', 'this pass is for another venue');
  if (row.used_at) throw new DomainError('already_used', 'this pass has already been used');
  if (row.expires_at <= at) {
    throw new DomainError('expired', 'this pass has expired; ask the customer to open the deal again');
  }

  const transaction = await openTransaction(
    db,
    { kind: 'pass', pass: row, byUserId: input.staffId },
    { userId: row.user_id, intent: row.intent, intentRef: row.intent_ref, at },
  );
  return { transaction, pass: await previewOf(db, row) };
}

async function previewOf(db: Db, row: PassRow): Promise<PassPreview> {
  let title = 'A reward';
  if (row.intent === 'voucher_redeem') {
    const v = await db.get<{ discount_pct: number }>(`SELECT discount_pct FROM issued_vouchers WHERE id = $i`, {
      i: row.intent_ref,
    });
    if (v) title = `${v.discount_pct}% off this order`;
  } else {
    const r = await db.get<{ label: string }>(`SELECT label FROM earned_rewards WHERE id = $i`, { i: row.intent_ref });
    if (r?.label) title = r.label;
  }
  const user = await db.get<{ display_name: string }>(`SELECT display_name FROM users WHERE id = $i`, {
    i: row.user_id,
  });
  return {
    code: row.code,
    intent: row.intent,
    title,
    /* First name only: the cashier needs to say it, not to know who it is. */
    customerName: (user?.display_name ?? '').trim().split(/\s+/)[0] ?? '',
    amountMinor: row.amount_minor,
    currency: row.currency,
  };
}

/**
 * What became of a pass, for the customer's own phone — so the screen can say
 * "the counter is confirming" and then "used" without being refreshed.
 */
export async function passStatus(db: Db, passId: string, userId: string, at: Iso = now()) {
  const row = await db.get<PassRow>(`SELECT * FROM redemption_passes WHERE id = $i AND user_id = $u`, {
    i: passId,
    u: userId,
  });
  if (!row) throw new DomainError('not_found', 'pass not found');
  const txn = row.transaction_id ? await getTransaction(db, row.transaction_id) : null;
  const status =
    txn?.status === 'committed'
      ? 'used'
      : txn?.status === 'pending'
        ? 'scanned'
        : txn
          ? 'cancelled'
          : row.expires_at <= at
            ? 'expired'
            : 'live';
  return { id: row.id, status, code: row.code, expiresAt: row.expires_at, transaction: txn };
}

/** Burn a pass inside the open's transaction — the replay defence, as in `verifyQr`. */
async function claimPass(db: Db, pass: PassRow, byUserId: string, at: Iso): Promise<string> {
  const claimed = await db.run(
    `UPDATE redemption_passes SET used_at = $t, used_by = $u
      WHERE id = $i AND used_at IS NULL AND expires_at > $t`,
    { t: at, u: byUserId, i: pass.id },
  );
  if (claimed.changes === 0) {
    throw new DomainError('replay_detected', 'this pass has already been used', { venueId: pass.venue_id });
  }
  return pass.venue_id;
}

export async function getTransaction(db: Db, id: string): Promise<Transaction> {
  const txn = await db.get<Transaction>(`SELECT * FROM transactions WHERE id = $i`, { i: id });
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
export async function submitAmount(
  db: Db,
  input: { transactionId: string; amountMinor: number; actorId: string; at?: Iso },
): Promise<Transaction> {
  const at = input.at ?? now();
  return db.tx(async () => {
    const txn = await getTransaction(db, input.transactionId);
    if (txn.status !== 'pending') throw new DomainError('invalid_state', 'transaction is not pending');

    const venue = await getVenue(db, txn.venue_id);
    /* Typing the bill is part of confirming it, so it needs the same permission
       the confirm will: `earn` for a visit, `redeem` for a redemption. */
    if (txn.amount_entered_by === 'cashier' || input.actorId !== txn.user_id) {
      await team.requireCounter(db, venue.id, input.actorId, permForIntent(txn.intent), { at });
    }

    const check = plausibleAmount(input.amountMinor, venue.max_amount_minor);
    if (!check.ok) {
      throw new DomainError('invalid_amount', `amount rejected: ${check.reason}`, {
        reason: check.reason,
        ceiling: venue.max_amount_minor,
      });
    }

    await db.run(`UPDATE transactions SET amount_minor = $a WHERE id = $i AND status = 'pending'`, {
      a: input.amountMinor,
      i: txn.id,
    });
    void at;
    return await getTransaction(db, txn.id);
  });
}

/* ═══════════════════════════════════════════════ steps 4–5: confirm & commit ══ */

export interface Receipt {
  transaction: Transaction;
  /**
   * Every point this visit paid, across all four §2b venue lines. The ledger
   * holds them apart (see `grantEarnings`); a receipt is one number because a
   * cashier handing back a phone is reading it out loud.
   */
  pointsGranted: number;
  discountMinor: number;
  stamped: boolean;
  reward: campaigns.EarnedReward | null;
  visitCounted: boolean;
  balance: number;
  /** §7.4-style reward connection: the nearest tier this balance now reaches. */
  nextTier: { discountPct: number; pointsNeeded: number } | null;
  /** "Confirmed by <name>" — the team member it is recorded against, or null for the owner. */
  confirmedBy: { memberId: string; name: string } | null;
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
export async function confirm(
  db: Db,
  input: {
    transactionId: string;
    cashierId: string;
    /**
     * The owner's (or a manager's) shared counter device naming who is on
     * shift, so the confirmation is recorded against them. Checked in
     * `team.requireCounter`: an active member of this venue holding the
     * permission, or the call is refused. A staff login's own confirmations
     * are always its own and this is ignored for it.
     */
    memberId?: string | null;
    at?: Iso;
  },
): Promise<Receipt> {
  const at = input.at ?? now();
  /* Set inside the transaction, acted on outside it — see the `.catch` below. */
  let timedOut = false;

  const receipt = await db.tx(async (): Promise<Receipt> => {
    const txn = await getTransaction(db, input.transactionId);
    if (txn.status !== 'pending') throw new DomainError('invalid_state', 'transaction is not pending');
    if (txn.amount_minor === null) throw new DomainError('invalid_state', 'no amount has been entered');

    const venue = await getVenue(db, txn.venue_id);
    /* Inside the transaction, so a member revoked a millisecond ago is refused
       here rather than after the grant. Who it is recorded against comes back
       with the answer and is written onto the row below. */
    const counter = await team.requireCounter(db, venue.id, input.cashierId, permForIntent(txn.intent), {
      memberId: input.memberId ?? null,
      customerId: txn.user_id,
      at,
    });

    if (minutesBetween(txn.opened_at, at) > CONFIG.gate.pendingTtlMinutes) {
      timedOut = true;
      throw new DomainError('expired', 'this transaction timed out; scan again');
    }

    const amount = txn.amount_minor;
    let pointsGranted = 0;
    let discountMinor = 0;
    let reward: campaigns.EarnedReward | null = null;
    let stamped = false;

    /* ── the redemption intents ── */
    if (txn.intent === 'voucher_redeem' && txn.intent_ref) {
      const voucher = (await db.get<vouchers.IssuedVoucher>(`SELECT * FROM issued_vouchers WHERE id = $i`, {
        i: txn.intent_ref,
      }))!;
      discountMinor = (await vouchers.redeem(db, voucher, venue, amount, txn.id, at)).discountMinor;
    }

    if (txn.intent === 'reward_redeem' && txn.intent_ref) {
      const earned = (await db.get<campaigns.EarnedReward>(`SELECT * FROM earned_rewards WHERE id = $i`, {
        i: txn.intent_ref,
      }))!;
      discountMinor = (await campaigns.redeemReward(db, earned, txn.id, at)).costMinor;
    }

    /* ── the visit, which is what everything else keys off ── */
    const l = local(at, venue.timezone);
    const qualifies = amount >= venue.min_spend_minor;
    const visitCounted = qualifies && (await recordVisit(db, {
      userId: txn.user_id,
      venue,
      amountMinor: amount,
      transactionId: txn.id,
      day: l.day,
      hour: l.hour,
      weekday: l.weekday,
      at,
    }));

    /* ── earning ── */
    if (txn.intent === 'earn' && visitCounted && venue.loyalty_active) {
      pointsGranted = await grantEarnings(db, {
        txn,
        venue,
        ent: await entitlements.entitlementsFor(db, { userId: txn.user_id }),
        at,
      });
    }

    /* ── stamps ── */
    if (visitCounted) {
      /* A completed card pays points as well as a reward, and the grant lives
         where the completion is detected rather than here — the winner among
         several cards is decided in there, and a caller that re-derived it
         would be a second definition of "one reward per visit". They are added
         to the receipt's one number because the cashier reads one number out
         loud; the ledger keeps them apart. */
      const stamps = await campaigns.applyVisit(db, {
        userId: txn.user_id,
        venue,
        amountMinor: amount,
        transactionId: txn.id,
        at,
      });
      reward = stamps.reward;
      pointsGranted += stamps.points;
      stamped = true;
    }

    /* ── the deal funnel's third step (§6.3) ── */
    if (txn.deal_id && visitCounted) await claimDeal(db, txn.deal_id, txn.user_id, txn.id, discountMinor, at);

    /* ── §9.2: a push that brought somebody in ── */
    if (visitCounted) await creditPushVisit(db, txn, at);

    /* ── §8.1: the referral pays on the invited user's first *counted visit* ──
       Behind `visitCounted` like the stamp, the deal claim and the push credit
       above, and for their reason: a scan under the venue's minimum spend, or a
       second scan the same day, is not a visit — and was paying 200 points. */
    if (visitCounted) {
      await completeReferral(db, txn.user_id, at, {
        venueOwnerId: venue.owner_user_id,
        cashierId: input.cashierId,
      });
    }

    await db.run(
      `UPDATE transactions
          SET status = 'committed', confirmed_at = $t, confirmed_by = $c, confirmed_member_id = $cm,
              points_granted = $p, discount_minor = $d, stamp_granted = $s
        WHERE id = $i AND status = 'pending'`,
      {
        t: at,
        c: input.cashierId,
        cm: counter.memberId,
        p: pointsGranted,
        d: discountMinor,
        s: stamped ? 1 : 0,
        i: txn.id,
      },
    );

    const balance = await ledger.balance(db, txn.user_id);
    return {
      transaction: await getTransaction(db, txn.id),
      pointsGranted,
      discountMinor,
      stamped,
      reward,
      visitCounted,
      balance,
      nextTier: await nearestTier(db, venue.id, balance),
      confirmedBy: await team.confirmedByOf(db, counter.memberId),
    };
  }).catch(async (error: unknown): Promise<never> => {
    /*
     * **A timeout cancels the transaction, and the cancel has to land after the
     * rollback.** It used to be written inside the transaction a line before the
     * throw — so the throw rolled it straight back, the row stayed `pending`,
     * and the customer standing at the counter was refused a fresh scan
     * ("a transaction is already open") until the five-minute sweep came round.
     * The same shape as the replay case in `openTransaction`: a record of a
     * refusal is written outside the attempt it describes.
     */
    if (timedOut) {
      await db.run(
        `UPDATE transactions SET status = 'cancelled', cancelled_at = $t, cancel_reason = 'timeout'
          WHERE id = $i AND status = 'pending'`,
        { t: at, i: input.transactionId },
      );
    }
    throw error;
  });

  /* Outside the transaction on purpose: a fraud *case* is a note for a human and
     must never be able to roll back money that legitimately changed hands at a
     counter (§13, and the reasoning in `fraud.ts`). */
  await fraud.checkTransaction(db, {
    userId: receipt.transaction.user_id,
    venueId: receipt.transaction.venue_id,
    transactionId: receipt.transaction.id,
    at,
  });
  await fraud.refreshTrust(db, receipt.transaction.user_id);

  if (receipt.reward) {
    await notifications.notify(db, {
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

export async function cancel(
  db: Db,
  input: { transactionId: string; reason: string; actorId: string; at?: Iso },
): Promise<Transaction> {
  const at = input.at ?? now();
  const txn = await getTransaction(db, input.transactionId);
  if (txn.status !== 'pending') throw new DomainError('invalid_state', 'transaction is not pending');
  /* Either side may walk away from a pending gate: the customer changed their
     mind, or the cashier is closing the till. Nothing has been granted, so there
     is nothing to protect and no reason to make it hard. */
  if (input.actorId !== txn.user_id) {
    await team.requireCounter(db, txn.venue_id, input.actorId, ['earn', 'redeem', 'scan'], { at });
  }

  await db.run(
    `UPDATE transactions SET status = 'cancelled', cancelled_at = $t, cancel_reason = $r
      WHERE id = $i AND status = 'pending'`,
    { t: at, r: input.reason, i: input.transactionId },
  );
  return await getTransaction(db, input.transactionId);
}

/**
 * Sweep pending transactions nobody confirmed.
 *
 * Cheap to run and important: a pending row at a venue blocks that customer's
 * next scan there (see `openTransaction`), so a cashier who walked away without
 * confirming would otherwise lock a customer out until somebody noticed.
 */
export async function expirePending(db: Db, at: Iso = now()): Promise<number> {
  const cutoff = plusMinutes(at, -CONFIG.gate.pendingTtlMinutes);
  return (await db.run(
    `UPDATE transactions SET status = 'cancelled', cancelled_at = $t, cancel_reason = 'timeout'
      WHERE status = 'pending' AND opened_at < $c`,
    { t: at, c: cutoff },
  )).changes;
}

/**
 * Pending transactions at a venue — the partner app's confirmation queue.
 *
 * Only those still inside the time limit: one past it is refused at confirm,
 * so listing it puts a Confirm button on the queue whose only outcome is an
 * error.
 */
export const pendingAt = async (db: Db, venueId: string, at: Iso = now()): Promise<Transaction[]> =>
  await db.all<Transaction>(
    `SELECT * FROM transactions
      WHERE venue_id = $v AND status = 'pending' AND opened_at >= $cutoff
      ORDER BY opened_at`,
    { v: venueId, cutoff: plusMinutes(at, -CONFIG.gate.pendingTtlMinutes) },
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
async function recordVisit(
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
): Promise<boolean> {
  const last = await db.get<{ created_at: string }>(
    `SELECT created_at FROM venue_visits WHERE user_id = $u AND venue_id = $v
      ORDER BY created_at DESC LIMIT 1`,
    { u: input.userId, v: input.venue.id },
  );
  if (last && minutesBetween(last.created_at, input.at) / 60 < input.venue.scan_cooldown_hours) {
    return false;
  }

  try {
    await db.run(
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

  /* The two self-references are qualified with the table, and on Postgres they
     have to be: inside `DO UPDATE SET` both the target row and `excluded` are in
     scope, so a bare `visits` is ambiguous (42702) and the statement is refused
     at parse time — before any conflict, on *every* counted visit. SQLite
     resolves the bare name to the target row, which is why the suite never saw
     it; the qualified form means the same thing on both. `verify.ts` scans every
     upsert in `server/` for the bare form so the next one fails offline. */
  await db.run(
    `INSERT INTO venue_customers (venue_id, user_id, first_seen_at, last_seen_at, visits, spend_minor)
     VALUES ($v, $u, $t, $t, 1, $a)
     ON CONFLICT (venue_id, user_id) DO UPDATE
       SET last_seen_at = excluded.last_seen_at,
           visits = venue_customers.visits + 1,
           spend_minor = venue_customers.spend_minor + excluded.spend_minor`,
    { v: input.venue.id, u: input.userId, t: input.at, a: input.amountMinor },
  );

  /*
   * §1.4's grant, from the account's standing answer.
   *
   * **Here, and nowhere earlier**, because this is the moment a relationship
   * with this venue actually exists: a confirmed scan, at the till, with the
   * customer in front of the staff. Writing it at sign-up would hand every
   * venue in the catalogue a customer who has never been there.
   *
   * `grantSharingByDefault` does nothing when the account has switched the
   * default off, and nothing when there is already a row for the pair —
   * **including a revoked one**, so a player who withdrew is not re-granted on
   * their next visit. The gate `domain/profiles.ts` joins on is unchanged; what
   * changed is that it now has rows in it for people who never went looking for
   * a switch.
   */
  await consent.grantSharingByDefault(db, {
    userId: input.userId,
    venueId: input.venue.id,
    at: input.at,
  });

  return true;
}

/**
 * §2b. What a confirmed earn-intent visit pays.
 *
 * Three lines, and they are three ledger entries rather than one sum. An owner
 * reading a customer's history has to be able to see *which* of them fired:
 * "100 for a first visit here" is a sentence a venue can act on and "145" is
 * not, and the moment they are added together the information is gone for good —
 * a ledger row is the only place it was ever recorded. The receipt adds them
 * back up, because that is a different reader with a different question.
 *
 * **Every line is a named entitlement, and none of them is multiplied.** A paid
 * plan pays more by having a different number in `plan_entitlements`
 * (`scan_points`, `first_visit_points`, `new_category_points`) than by having
 * the free figure scaled at the counter: a table anybody can read beats an
 * arithmetic rule nobody can predict, and `points_multiplier` is now a *game
 * round* rule only — applying both would pay a subscriber twice for one visit.
 * `CONFIG.earn` is the fallback for a plan whose row is silent, which is also
 * exactly the free-plan figure.
 *
 * There is no spend bonus. Paying more over the venue minimum used to earn more
 * in steps, and it was the one line here that made the reward depend on the size
 * of the bill rather than on the visit — the wrong shape for a scheme whose
 * whole argument to a venue is repeat custom. The minimum still decides whether
 * the scan is a visit at all; that is upstream, in `confirm`.
 *
 * Every line is written inside the commit's transaction, so all three land or
 * none of them do; and the two once-ever lines each carry a guard that survives
 * the transaction, because "once, ever" is a claim about every scan this account
 * will ever make and not just about this one.
 */
async function grantEarnings(
  db: Db,
  input: { txn: Transaction; venue: Venue; ent: entitlements.Entitlements; at: Iso },
): Promise<number> {
  const { txn, venue, ent, at } = input;
  const user = txn.user_id;
  let total = 0;

  /* Two overrides on one number, and the venue's is the stronger of them.
     `points_per_scan` is what *this* venue decided a scan at its counter is
     worth, out of its own budget; `scan_points` is what the customer's plan pays
     where nobody has decided. A venue that typed a rate meant it, and a
     subscriber does not get to overrule it — the plan buys a better default, not
     a claim on a partner's money.

     `points_per_scan` is a NOT NULL column with a schema default, so "unset"
     cannot be read as null here — it is read as "not a positive number", which
     is also the right answer for a venue that has been zeroed out by hand and
     left `loyalty_active` on. */
  const perScan =
    venue.points_per_scan > 0
      ? venue.points_per_scan
      : entitlements.entNumber(ent, 'scan_points', CONFIG.earn.scan);
  total += (await ledger.earn(db, {
    userId: user,
    points: perScan,
    reason: 'scan_earn',
    sourceKind: 'transaction',
    sourceRef: txn.id,
    venueId: venue.id,
    at,
  })).entry.delta;

  /* First visit to *this* venue, ever — the line the whole discovery pitch rests
     on, and the one that must never pay twice.

     `recordVisit` has already upserted `venue_customers` by the time this runs,
     so the row exists and its `visits` is 1 on exactly the visit that created it
     (`first_seen_at` is that same moment). That is the trigger. `alreadyPaid` is
     the lock: the counter says "this is their first" and the ledger says "and we
     have not paid for it", and only both together spend anything. Either alone
     has a failure mode — a counter can be rebuilt, and a ledger with no trigger
     would pay a fiftieth visit for a bonus that was introduced after the first
     forty-nine. */
  const customer = await db.get<{ visits: number }>(
    `SELECT visits FROM venue_customers WHERE venue_id = $v AND user_id = $u`,
    { v: venue.id, u: user },
  );
  if ((customer?.visits ?? 0) <= 1 && !(await ledger.alreadyPaid(db, user, 'first_visit', venue.id))) {
    total += (await ledger.earn(db, {
      userId: user,
      points: entitlements.entNumber(ent, 'first_visit_points', CONFIG.earn.firstVisitToVenue),
      reason: 'venue_bonus',
      sourceKind: 'first_visit',
      sourceRef: venue.id,
      venueId: venue.id,
      at,
    })).entry.delta;
  }

  /* A category this account has never spent in. The visit for this scan is
     *already* in `venue_visits`, so it has to be excluded by its transaction id
     — counting it would make every category look visited and this line would
     pay nothing, ever, which is the sort of bug that reads as "the feature is
     off" rather than as a fault. */
  const seen = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM venue_visits vv JOIN venues v ON v.id = vv.venue_id
      WHERE vv.user_id = $u AND v.category = $c AND vv.transaction_id <> $x`,
    { u: user, c: venue.category, x: txn.id },
  );
  if ((seen?.n ?? 0) === 0 && !(await ledger.alreadyPaid(db, user, 'new_category', venue.category))) {
    total += (await ledger.earn(db, {
      userId: user,
      points: entitlements.entNumber(ent, 'new_category_points', CONFIG.earn.newCategory),
      reason: 'venue_bonus',
      sourceKind: 'new_category',
      sourceRef: venue.category,
      venueId: venue.id,
      at,
    })).entry.delta;
  }

  return total;
}

/**
 * §6.3. A claim is a user who *opened* a deal completing a qualifying scan
 * inside the window — not a tap on "claim" in a list.
 *
 * The per-deal cap stops further claims but never rolls one back: the customer
 * is standing at the counter and the offer was live when they walked in.
 */
async function claimDeal(
  db: Db,
  dealId: string,
  userId: string,
  transactionId: string,
  discountMinor: number,
  at: Iso,
): Promise<void> {
  const deal = await db.get<{
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
  const opened = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM deal_events
      WHERE deal_id = $d AND user_id = $u AND event_type = 'open'`,
    { d: dealId, u: userId },
  );
  if ((opened?.n ?? 0) === 0) return;

  await db.run(
    `INSERT INTO deal_events (id, deal_id, user_id, event_type, source, transaction_id, created_at)
     VALUES ($i, $d, $u, 'claim', 'gate', $x, $t)`,
    { i: newId('evt'), d: dealId, u: userId, x: transactionId, t: at },
  );
  await db.run(
    `UPDATE hot_deals SET claimed_count = claimed_count + 1, spend_minor = spend_minor + $s
      WHERE id = $i`,
    { s: discountMinor, i: dealId },
  );
}

/**
 * §9.2. Credit the pushes this visit answered — `deal_pushes.came_in`.
 *
 * A push counts somebody as having come in when it was actually **pushed** to
 * them (the inbox-only copies of a suppressed send are not an invitation anybody
 * received), it was sent in the last `CONFIG.deals.pushCameInDays`, and this is
 * their **first** counted visit here since it was sent. The last rule is the
 * `NOT EXISTS`: without it a regular's third visit of the week would be credited
 * three times to one notification, and `came_in` would count visits where the
 * dashboard reads it as people. The visit being recorded is already in
 * `venue_visits`, so it is excluded by its transaction.
 *
 * Inside the commit, so a confirm that rolls back credits nothing. A plain
 * `UPDATE … SET came_in = came_in + 1`, which Postgres resolves unambiguously —
 * the qualification an upsert needs is only for `DO UPDATE`.
 */
async function creditPushVisit(db: Db, txn: Transaction, at: Iso): Promise<void> {
  const pushes = await db.all<{ id: string }>(
    `SELECT DISTINCT p.id FROM deal_pushes p
       JOIN notifications n ON n.push_id = p.id
      WHERE p.venue_id = $v AND p.status = 'sent'
        AND p.sent_at <= $at AND p.sent_at > $since
        AND n.user_id = $u AND n.delivery IN ('queued', 'sent')
        AND NOT EXISTS (
          SELECT 1 FROM venue_visits vv
           WHERE vv.user_id = $u AND vv.venue_id = $v
             AND vv.created_at > p.sent_at AND vv.transaction_id <> $x)`,
    {
      v: txn.venue_id,
      u: txn.user_id,
      at,
      since: plusDays(at, -CONFIG.deals.pushCameInDays),
      x: txn.id,
    },
  );
  for (const push of pushes) {
    await db.run(`UPDATE deal_pushes SET came_in = came_in + 1 WHERE id = $p`, { p: push.id });
  }
}

/**
 * §8.1. Pay a referral on the invited user's first confirmed scan.
 *
 * Not on signup, which is the whole point: a referral that pays at signup is a
 * referral that pays for throwaway accounts, and paying for those is how a
 * points economy is farmed. Both parties are still paid at the same moment, out
 * of two rows in `CONFIG.earn` rather than one — the figures happen to be equal
 * today and are two settings because the two acts are not the same act, and an
 * operator tuning "what is an invite worth to us" should not be forced to change
 * what the invitee is welcomed with.
 *
 * The idempotency is the bond's own status. It is selected `pending` and set
 * `completed` inside the commit's transaction, so the second confirm for this
 * account finds nothing to pay — and a *retried* confirm never reaches here at
 * all, because `confirm` refuses a transaction that is no longer pending.
 */
async function completeReferral(
  db: Db,
  userId: string,
  at: Iso,
  till: { venueOwnerId: string | null; cashierId: string },
): Promise<void> {
  const bond = await db.get<{ id: string; referrer_id: string; referrer_status: string; referrer_deleted: string | null }>(
    `SELECT r.id, r.referrer_id, u.status AS referrer_status, u.deleted_at AS referrer_deleted
       FROM referrals r JOIN users u ON u.id = r.referrer_id
      WHERE r.referred_id = $u AND r.status = 'pending'`,
    { u: userId },
  );
  if (!bond) return;

  /*
   * **Not at the inviter's own till.** The farm this closes: a venue owner signs
   * up accounts with their own code and confirms a scan for each at their own
   * counter — 200 points a head, and the milestone at five. The bond is left
   * *pending* rather than voided, so a real visit somewhere else still pays it.
   */
  if (bond.referrer_id === till.venueOwnerId || bond.referrer_id === till.cashierId) return;

  /* Nor to an inviter who is suspended or gone. Pending again, not voided: a
     suspension can be lifted, and an operator voids with `rejectReferral`. */
  if (bond.referrer_status !== 'active' || bond.referrer_deleted !== null) return;

  /*
   * **Claimed before it is paid.** This read the bond, paid both sides, and
   * then marked it completed — so two scans for the same newcomer confirmed at
   * once (two venues, one minute) could both read `pending` and both pay, on
   * Postgres where transactions really do run side by side. The guarded UPDATE
   * is the claim: exactly one of them changes the row, and only that one pays.
   */
  const claimed = await db.run(
    `UPDATE referrals SET status = 'completed', points_awarded = $p, completed_at = $t
      WHERE id = $i AND status = 'pending'`,
    { p: CONFIG.earn.referrerFirstVisit + CONFIG.earn.inviteeJoin, t: at, i: bond.id },
  );
  if (claimed.changes !== 1) return;

  await ledger.earn(db, {
    userId: bond.referrer_id,
    points: CONFIG.earn.referrerFirstVisit,
    reason: 'referral',
    sourceKind: 'referral',
    sourceRef: bond.id,
    at,
  });
  await ledger.earn(db, {
    userId,
    points: CONFIG.earn.inviteeJoin,
    reason: 'referral',
    sourceKind: 'referral',
    sourceRef: bond.id,
    at,
  });
  /* Both sides are told; each is pushed only if they switched it on. */
  await reminders.referralReward(db, {
    userId: bond.referrer_id, points: CONFIG.earn.referrerFirstVisit, invitee: false, referralId: bond.id, at,
  });
  await reminders.referralReward(db, {
    userId, points: CONFIG.earn.inviteeJoin, invitee: true, referralId: bond.id, at,
  });
  /* `points_awarded` (written by the claim above) is what the bond *cost*, both
     sides together: now that the two sides can differ, the total is the only
     figure that answers the question an operator summing this column asks. */

  /* §8.1's milestone: bringing in five people who each actually turned up is a
     different achievement from bringing in five people, and it is paid once.
     Counted from `referrals.status`, which is only ever `completed` by the line
     above — so "invitees who have each made a first visit" is exactly what the
     count means and there is no second definition of it anywhere.

     The threshold is the idempotency key rather than a flag, so raising the bar
     to ten later adds a *new* milestone for everybody instead of silently
     re-paying the one they already have. */
  const milestone = String(CONFIG.earn.friendMilestoneAt);
  const completed = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM referrals WHERE referrer_id = $r AND status = 'completed'`,
    { r: bond.referrer_id },
  );
  if (
    (completed?.n ?? 0) >= CONFIG.earn.friendMilestoneAt &&
    !(await ledger.alreadyPaid(db, bond.referrer_id, 'friend_milestone', milestone))
  ) {
    await ledger.earn(db, {
      userId: bond.referrer_id,
      points: CONFIG.earn.friendMilestone,
      reason: 'referral',
      sourceKind: 'friend_milestone',
      sourceRef: milestone,
      at,
    });
  }
}

/** §7.4's "you're 60 from 10% off" — computed from the real balance and tiers. */
export async function nearestTier(
  db: Db,
  venueId: string,
  balance: number,
): Promise<{ discountPct: number; pointsNeeded: number } | null> {
  const tier = await db.get<{ discount_pct: number; points_cost: number }>(
    `SELECT discount_pct, points_cost FROM voucher_tiers
      WHERE venue_id = $v AND active = 1 AND points_cost > $b
      ORDER BY points_cost ASC LIMIT 1`,
    { v: venueId, b: balance },
  );
  if (!tier) return null;
  return { discountPct: tier.discount_pct, pointsNeeded: tier.points_cost - balance };
}

/**
 * Who may *run* this venue — the partner dashboard's gate, which every
 * `auth: 'partner'` route reaches through `mine()`.
 *
 * The owner, an admin, or **this venue's** active manager (`domain/team.ts`).
 *
 * It used to accept the global `manager` role from `user_roles` as well — "B1
 * future-proofing", so inviting one later would be a row rather than a code
 * change. The row it anticipated would have been a key to *every* venue on the
 * platform, because nothing tied the role to one. Managers are venue-scoped
 * rows in `team_members` now and the global role is not read here any more.
 *
 * The counter's own acts — scan, confirm, redeem — go through
 * `team.requireCounter` instead, which also admits staff with the matching
 * permission and says whom the act is recorded against.
 */
export async function requireStaff(db: Db, venueId: string, userId: string): Promise<void> {
  await team.requireManage(db, venueId, userId);
}

/** The counter permission a gate intent needs: a visit is `earn`, the two redemptions `redeem`. */
export const permForIntent = (intent: Intent): team.Perm => (intent === 'earn' ? 'earn' : 'redeem');

/** The pool position a partner app shows beside its confirmation queue. */
export const budgetSnapshot = async (db: Db, venueId: string, at: Iso = now()) =>
  await budget.budgetFor(db, venueId, at);
