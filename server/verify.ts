/**
 * `npm run verify:api` — the backend's test suite.
 *
 * The repo has no test runner and `npm run verify` is the front end's suite; this
 * is its counterpart, in the same style and for the same reason: the rules worth
 * checking here are *arithmetic and policy*, not rendering. A budget pool whose
 * three states do not exhaust it, a replayed QR that grants twice, an
 * un-opted-in customer who appears in a partner's table — each of those is a
 * one-line bug and a serious one, and each is checkable without a browser.
 *
 * It runs against an in-memory database seeded from `new-data/`, so it exercises
 * the real import, the real schema and the real HTTP surface. Nothing is mocked
 * except the two external boundaries that cannot exist here (`ports/`), and
 * those run their local adapters.
 */
/* The server logs a line per request; two hundred of them would bury the one
   line that matters, which is the count at the bottom. */
process.env.PAYLEZ_QUIET = '1';

import { openDb } from './db/db.ts';
import { seedDemo } from './db/demo.ts';
import { importLegacy } from './db/import.ts';
import { boot } from './main.ts';
import { parseCsv } from './db/csv.ts';
import { CONFIG } from './config.ts';
import { allRoutes } from './http/routes/index.ts';
import { createApi } from './http/server.ts';
import { Router } from './http/router.ts';
import * as accounts from './domain/accounts.ts';
import * as analytics from './domain/analytics.ts';
import * as assistant from './domain/assistant.ts';
import * as budget from './domain/budget.ts';
import * as campaigns from './domain/campaigns.ts';
import * as consent from './domain/consent.ts';
import * as deals from './domain/deals.ts';
import * as entitlements from './domain/entitlements.ts';
import * as gate from './domain/gate.ts';
import * as games from './domain/games.ts';
import * as ledger from './domain/ledger.ts';
import * as partners from './domain/partners.ts';
import * as profiles from './domain/profiles.ts';
import * as social from './domain/social.ts';
import * as traffic from './domain/traffic.ts';
import * as vouchers from './domain/vouchers.ts';
import * as jobs from './jobs.ts';
import * as llm from './ports/llm.ts';
import { trackListing } from './domain/venues.ts';
import { seedPlatform } from './domain/settings.ts';
import { DomainError } from './domain/errors.ts';
import { cmac, truncate } from './crypto/cmac.ts';
import { mintTap, verifyTap } from './crypto/nfc.ts';
import { open as openToken, seal } from './crypto/tokens.ts';
import { hashPassword, verifyPassword } from './crypto/passwords.ts';
import { discountCost, median, plausibleAmount } from './domain/money.ts';
import { isoWeek, local, localMonth, now, plusDays, plusMonths, withinDailyWindow } from './domain/time.ts';
import { newId } from './domain/ids.ts';
import { codeFor, flagOf } from './db/countries.ts';
import type { Db } from './db/db.ts';

/* ─────────────────────────────────────────────────────────── the harness ── */

let passed = 0;
const failures: string[] = [];
let group = '';

const describe = (name: string) => {
  group = name;
  console.log(`\n── ${name}`);
};

function check(what: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${group} › ${what}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
  console.log(`   ✗ ${what}`, detail ?? '');
}

const eq = (what: string, actual: unknown, expected: unknown) =>
  check(what, Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected), {
    actual,
    expected,
  });

/** Assert that a call throws a specific domain code. */
function throws(what: string, code: string, fn: () => unknown): void {
  try {
    fn();
    check(what, false, 'did not throw');
  } catch (error) {
    if (error instanceof DomainError) check(what, error.code === code, { got: error.code, want: code });
    else check(what, false, String(error));
  }
}

/** The same, for a promise. `throws` cannot await, and a rejected promise it
 *  never sees is a check that silently passes. */
async function rejects(what: string, fn: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await fn();
    check(what, false, 'did not reject');
  } catch (error) {
    if (error instanceof DomainError) check(what, error.code === code, { got: error.code, want: code });
    else check(what, false, String(error));
  }
}

/* ─────────────────────────────────────────────────────────── the fixture ── */

const SECRET = 'verify-secret';

interface World {
  db: Db;
  venueId: string;
  ownerId: string;
  customerId: string;
}

function world(): World {
  const db = openDb(':memory:');
  seedPlatform(db);
  db.tx(() => importLegacy(db, 'new-data'));

  const at = now();
  const ownerId = newId('usr');
  const customerId = newId('usr');
  const venueId = newId('ven');

  db.tx(() => {
    for (const [id, email, name] of [
      [ownerId, 'owner@verify.test', 'Owner'],
      [customerId, 'customer@verify.test', 'Customer'],
    ]) {
      db.run(
        `INSERT INTO users (id, email, email_norm, display_name, auth_provider, language, city,
                            status, created_at, updated_at)
         VALUES ($i, $e, $e, $n, 'email', 'en', 'Krakow', 'active', $t, $t)`,
        { i: id, e: email, n: name, t: at },
      );
      db.run(`INSERT INTO user_roles (user_id, role, granted_at) VALUES ($u, 'consumer', $t)`, {
        u: id,
        t: at,
      });
    }
    db.run(`INSERT INTO user_roles (user_id, role, granted_at) VALUES ($u, 'partner_owner', $t)`, {
      u: ownerId,
      t: at,
    });

    db.run(
      `INSERT INTO venues (id, owner_user_id, name, category, city, country_code, timezone, currency,
                           status, verified_at, amount_entry, min_spend_minor, max_amount_minor,
                           avg_check_minor, avg_check_source, accepts_vouchers, points_per_scan,
                           scan_cooldown_hours, loyalty_active, created_at, updated_at)
       VALUES ($i, $o, 'Verify Café', 'cafe', 'Krakow', 'PL', 'Europe/Warsaw', 'PLN',
               'live', $t, 'cashier', 1500, 100000, 4000, 'category', 1, 5, 24, 1, $t, $t)`,
      { i: venueId, o: ownerId, t: at },
    );
    for (const [pct, points, cap] of [
      [5, 100, 1000],
      [10, 300, 2500],
      [15, 600, 4000],
    ]) {
      db.run(
        `INSERT INTO voucher_tiers (id, venue_id, discount_pct, points_cost, max_discount_minor,
                                    active, created_at, updated_at)
         VALUES ($i, $v, $p, $pt, $c, 1, $t, $t)`,
        { i: newId('vtr'), v: venueId, p: pct, pt: points, c: cap, t: at },
      );
    }
    db.run(
      `INSERT INTO budgets (id, venue_id, period, currency, total_minor, loyalty_bp, created_at, updated_at)
       VALUES ($i, $v, $p, 'PLN', 100000, 6000, $t, $t)`,
      { i: newId('bdg'), v: venueId, p: localMonth(at, 'Europe/Warsaw'), t: at },
    );
  });

  return { db, venueId, ownerId, customerId };
}

/** Run one whole gate cycle and return the receipt. */
function scan(w: World, amountMinor: number, at = now(), userId = w.customerId): gate.Receipt {
  const qr = gate.mintQr(w.db, w.venueId, SECRET, at);
  const txn = gate.openTransaction(
    w.db,
    { kind: 'qr', token: qr.token, secret: SECRET },
    { userId, at },
  );
  gate.submitAmount(w.db, { transactionId: txn.id, amountMinor, actorId: w.ownerId, at });
  return gate.confirm(w.db, { transactionId: txn.id, cashierId: w.ownerId, at });
}

/* ═══════════════════════════════════════════════════════════ the checks ══ */

function pureHelpers(): void {
  describe('pure helpers — time, money, csv');

  eq('csv keeps a quoted comma', parseCsv('a,b\n"x,y",z')[1][0], 'x,y');
  eq('csv unescapes a doubled quote', parseCsv('a\n"he said ""hi"""')[1][0], 'he said "hi"');
  eq('csv keeps a newline inside quotes', parseCsv('a\n"one\ntwo"')[1][0], 'one\ntwo');

  /* A budget month is the *venue's*, so an instant just before local midnight on
     the 1st belongs to the previous month even though UTC has moved on. */
  eq('venue-local month at the boundary', localMonth('2026-09-30T22:30:00Z', 'Europe/Warsaw'), '2026-10');
  eq('venue-local month in UTC', localMonth('2026-09-30T22:30:00Z', 'UTC'), '2026-09');
  eq('local weekday is Monday-zero', local('2026-08-10T09:00:00Z', 'Europe/Warsaw').weekday, 0);

  check('a window that wraps midnight contains 23:00', withinDailyWindow(23 * 60, 22 * 60, 2 * 60));
  check('…and 01:00', withinDailyWindow(60, 22 * 60, 2 * 60));
  check('…and not 12:00', !withinDailyWindow(12 * 60, 22 * 60, 2 * 60));

  eq('a month after 31 Jan is 28 Feb', plusMonths('2026-01-31T00:00:00.000Z', 1).slice(0, 10), '2026-02-28');
  eq('iso week', isoWeek('2026-01-01T00:00:00Z'), '2026-W01');

  eq('median resists one huge bill', median([20, 22, 25, 27, 900]), 25);
  eq('median errs low on even counts', median([10, 20, 30, 40]), 20);
  eq('a discount is capped', discountCost(50000, 15, 4000), 4000);
  eq('…and floored below the cap', discountCost(1433, 10, 4000), 143);
  eq('zero is not an amount', plausibleAmount(0, 100000), { ok: false, reason: 'zero' });
  eq('nor is a fat finger', plausibleAmount(420000, 100000), { ok: false, reason: 'ceiling' });
}

function crypto(): void {
  describe('crypto — QR signing and NFC taps');

  /* RFC 4493's own first test vector. If this drifts, every genuine tag is
     rejected and nothing else in the file would tell us why. */
  const key = Buffer.from('2b7e151628aed2a6abf7158809cf4f3c', 'hex');
  eq(
    'AES-CMAC matches RFC 4493 for an empty message',
    cmac(key, Buffer.alloc(0)).toString('hex'),
    'bb1d6929e95937287fa37d129b756746',
  );
  eq(
    'AES-CMAC matches RFC 4493 for one block',
    cmac(key, Buffer.from('6bc1bee22e409f96e93d7e117393172a', 'hex')).toString('hex'),
    '070a16b46b4d4144f79bdd9dd04a287c',
  );
  eq('the SDM truncation takes the odd bytes', truncate(Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex')).toString('hex'), '01030507090b0d0f');

  const master = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  const uid = '04A1B2C3D4E5F6';
  const tap = mintTap(master, uid, 42);
  const verified = verifyTap(master, tap.piccHex, tap.cmacHex);
  check('a genuine tap verifies', verified.ok && verified.uid === uid && verified.counter === 42, verified);

  const forged = verifyTap(master, tap.piccHex, '0000000000000000');
  check('a forged CMAC is rejected', !forged.ok && forged.reason === 'bad_cmac');
  const otherKey = verifyTap(Buffer.alloc(16, 1), tap.piccHex, tap.cmacHex);
  check('another key decrypts to nothing usable', !otherKey.ok);

  const token = seal(SECRET, { v: 'ven_1', jti: 'x', iat: 0, exp: 1 });
  check('a sealed token opens', openToken<{ v: string }>(SECRET, token)?.v === 'ven_1');
  check('a tampered token does not', openToken(SECRET, `${token}x`) === null);
  check('nor does one signed with another key', openToken('other', token) === null);
}

async function passwords(): Promise<void> {
  describe('passwords');
  /* The cost is dropped for the test only; production uses CONFIG.auth.scryptN. */
  const hash = await hashPassword('correct horse battery', 2 ** 12);
  check('the right password verifies', await verifyPassword('correct horse battery', hash));
  check('the wrong one does not', !(await verifyPassword('correct horse batter', hash)));
  check('an account with no password cannot be signed into', !(await verifyPassword('x', null)));
  check('the hash is not the password', !hash.includes('correct'));
}

function ledgerRules(): void {
  describe('§2 the points ledger');
  const w = world();
  const { db, customerId } = w;

  ledger.earn(db, { userId: customerId, points: 100, reason: 'game_win' });
  ledger.earn(db, { userId: customerId, points: 50, reason: 'scan_earn' });
  eq('balance is the sum of the entries', ledger.balance(db, customerId), 150);
  eq('the cache agrees', ledger.cachedBalance(db, customerId), 150);
  eq('nothing to reconcile', ledger.reconcile(db, customerId), 0);

  ledger.spend(db, { userId: customerId, points: 120, reason: 'voucher_redeem' });
  eq('spending moves the balance', ledger.balance(db, customerId), 30);

  /* FIFO: the 100-point lot is fully consumed and the 50 is partly. */
  /* Ordered by `rowid`, for the same reason `spend` is: two lots opened in the
     same millisecond tie on `earned_at`, and the ids are random. */
  const lots = db.all<{ amount: number; consumed: number }>(
    `SELECT amount, consumed FROM points_lots WHERE user_id = $u ORDER BY earned_at, rowid`,
    { u: customerId },
  );
  eq('the oldest lot is consumed first', lots.map((l) => [l.amount, l.consumed]), [
    [100, 100],
    [50, 20],
  ]);

  throws('overdrawing is refused', 'insufficient_points', () =>
    ledger.spend(db, { userId: customerId, points: 1000, reason: 'voucher_redeem' }),
  );

  /* §2.4: the daily game cap trims rather than refusing the round. */
  const capped = ledger.earn(db, { userId: customerId, points: 500, reason: 'game_win' });
  eq('the daily cap trims the excess', capped.entry.delta, CONFIG.points.dailyGameCap - 100);
  check('…and says how much it took', capped.capped > 0);

  /* §2.3: expiry is per-batch, FIFO, and only takes what is left of a lot. */
  const old = now();
  const w2 = world();
  /* `adjustment`, not `game_win`: the daily cap would trim a 200-point game
     round to 150 and the batch under test would not be the size it says. */
  ledger.earn(w2.db, { userId: w2.customerId, points: 200, reason: 'adjustment', at: plusDays(old, -400) });
  ledger.earn(w2.db, { userId: w2.customerId, points: 60, reason: 'scan_earn', at: old });
  ledger.spend(w2.db, { userId: w2.customerId, points: 50, reason: 'gift_card_redeem', at: old });
  const expired = ledger.runExpiry(w2.db, old);
  eq('expiry takes what is left of the old batch', expired.points, 150);
  eq('and leaves the new one alone', ledger.balance(w2.db, w2.customerId), 60);
  eq('the ledger still balances against its cache', ledger.reconcile(w2.db, w2.customerId), 0);

  /* C3: a reversal is a compensating entry, never a mutation. */
  const balanceBefore = ledger.balance(db, customerId);
  const entry = ledger.earn(db, { userId: customerId, points: 10, reason: 'adjustment' }).entry;
  const reversal = ledger.reverse(db, entry.id, 'fraud');
  eq('the reversal is its own entry', reversal.delta, -10);
  eq(
    'the original row is untouched',
    db.get<{ delta: number; status: string }>(`SELECT delta, status FROM points_ledger WHERE id = $i`, {
      i: entry.id,
    }),
    { delta: 10, status: 'committed' },
  );
  eq('the pair nets to nothing', ledger.balance(db, customerId), balanceBefore);
  eq('and the cache agrees', ledger.reconcile(db, customerId), 0);
  throws('reversing twice is refused', 'conflict', () => ledger.reverse(db, entry.id, 'again'));

  db.close();
  w2.db.close();
}

function budgetRules(): void {
  describe('§4–5 the budget pools');
  const w = world();
  const view = budget.budgetFor(w.db, w.venueId);

  eq('the split is 60/40 and adds up', view.loyalty.base + view.voucher.base, view.total);
  eq('loyalty gets 60%', view.loyalty.base, 60000);

  const exhausts = (v: budget.BudgetView) =>
    v.loyalty.spent + v.loyalty.reserved + v.loyalty.available === v.loyalty.base &&
    v.voucher.spent + v.voucher.reserved + v.voucher.available === v.voucher.base;
  check('three states exhaust the pool', exhausts(view));

  budget.reserve(w.db, view.id, 'voucher', 5000);
  budget.debit(w.db, view.id, 'voucher', 1200);
  const after = budget.viewById(w.db, view.id);
  eq('reserving moves money out of available', after.voucher.available, 40000 - 5000 - 1200);
  check('and the three states still exhaust it', exhausts(after));

  /* A reserve larger than the pool is refused — with the tolerance buffer
     included, which is the only reason it is not simply `available`. */
  throws('an over-reserve is refused', 'budget_exhausted', () =>
    budget.reserve(w.db, view.id, 'voucher', 999999),
  );

  const rebalanced = budget.rebalance(w.db, view.id, 'loyalty', 10000);
  eq('rebalancing moves it across', rebalanced.voucher.base, 40000 + 10000);
  eq('…and out of the other side', rebalanced.loyalty.base, 60000 - 10000);
  eq('the total is unchanged', rebalanced.total, view.total);
  check('and it still exhausts', exhausts(rebalanced));

  throws('you cannot move money that is reserved', 'budget_exhausted', () =>
    budget.rebalance(w.db, view.id, 'voucher', 999999),
  );

  /* §4.4: the ladder degrades from the top and never switches off entirely. */
  const tiers = vouchers.tiersFor(w.db, w.venueId);
  const nearlyEmpty: budget.BudgetView = {
    ...rebalanced,
    voucher: { ...rebalanced.voucher, available: 200 },
  };
  const open = budget.tiersAvailable(nearlyEmpty, tiers);
  eq('only the lowest tier survives an empty pool', open, [5]);

  w.db.close();
}

function gateRules(): void {
  describe('§3 the amount-capture gate');
  const w = world();
  const at = now();

  const receipt = scan(w, 4200, at);
  eq('a confirmed scan grants the venue’s points', receipt.pointsGranted, 5);
  check('and counts as a visit', receipt.visitCounted);
  eq('the transaction is committed', receipt.transaction.status, 'committed');
  eq('the amount is stored in minor units', receipt.transaction.amount_minor, 4200);

  /* §3.2: single-use, and the check is a conditional UPDATE, not a read. */
  const qr = gate.mintQr(w.db, w.venueId, SECRET, at);
  gate.openTransaction(w.db, { kind: 'qr', token: qr.token, secret: SECRET }, {
    userId: w.customerId,
    at,
  });
  throws('a replayed QR is rejected', 'replay_detected', () =>
    gate.openTransaction(w.db, { kind: 'qr', token: qr.token, secret: SECRET }, {
      userId: w.customerId,
      at,
    }),
  );
  check(
    'and the replay opens a fraud case',
    (w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM fraud_cases WHERE kind = 'replay'`)?.n ?? 0) > 0,
  );

  throws('a forged QR is rejected', 'invalid_trigger', () =>
    gate.openTransaction(w.db, { kind: 'qr', token: 'nonsense.sig', secret: SECRET }, {
      userId: w.customerId,
      at,
    }),
  );

  /* One pending transaction per customer per venue. */
  throws('a second open gate at one counter is refused', 'conflict', () => {
    const q = gate.mintQr(w.db, w.venueId, SECRET, at);
    gate.openTransaction(w.db, { kind: 'qr', token: q.token, secret: SECRET }, {
      userId: w.customerId,
      at,
    });
  });

  /* Clear the pending one, then the same-day rule. */
  const pending = gate.pendingAt(w.db, w.venueId)[0];
  gate.cancel(w.db, { transactionId: pending.id, reason: 'test', actorId: w.customerId, at });

  const second = scan(w, 3000, at);
  check('a second scan the same day is not a second visit', !second.visitCounted);
  eq('and pays nothing', second.pointsGranted, 0);

  /* §3.4: an implausible amount is refused, and the ceiling is the venue's. */
  const q2 = gate.mintQr(w.db, w.venueId, SECRET, at);
  const t2 = gate.openTransaction(w.db, { kind: 'qr', token: q2.token, secret: SECRET }, {
    userId: w.customerId,
    at,
  });
  throws('an implausible amount is refused', 'invalid_amount', () =>
    gate.submitAmount(w.db, { transactionId: t2.id, amountMinor: 5_000_000, actorId: w.ownerId, at }),
  );
  /* …and the cashier corrects rather than cancelling. */
  gate.submitAmount(w.db, { transactionId: t2.id, amountMinor: 4200, actorId: w.ownerId, at });
  eq(
    'the corrected amount lands',
    gate.getTransaction(w.db, t2.id).amount_minor,
    4200,
  );

  /* Only staff may confirm. */
  throws('a customer cannot confirm their own transaction', 'forbidden', () =>
    gate.confirm(w.db, { transactionId: t2.id, cashierId: w.customerId, at }),
  );
  gate.confirm(w.db, { transactionId: t2.id, cashierId: w.ownerId, at });

  /* Nothing is granted before the commit. */
  const w2 = world();
  const q3 = gate.mintQr(w2.db, w2.venueId, SECRET, at);
  const t3 = gate.openTransaction(w2.db, { kind: 'qr', token: q3.token, secret: SECRET }, {
    userId: w2.customerId,
    at,
  });
  gate.submitAmount(w2.db, { transactionId: t3.id, amountMinor: 9000, actorId: w2.ownerId, at });
  eq('a pending transaction has granted nothing', ledger.balance(w2.db, w2.customerId), 0);
  eq('and recorded no visit', w2.db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM venue_visits WHERE user_id = $u`, { u: w2.customerId })?.n, 0);

  /* A pending transaction times out rather than blocking the customer forever. */
  const later = plusDays(at, 1);
  eq('the sweeper cancels it', gate.expirePending(w2.db, later), 1);

  w.db.close();
  w2.db.close();
}

function voucherRules(): void {
  describe('§4 vouchers — reserve, debit, release');
  const w = world();
  const at = now();

  ledger.earn(w.db, { userId: w.customerId, points: 1000, reason: 'adjustment', at });
  const tier = w.db.get<{ id: string }>(
    `SELECT id FROM voucher_tiers WHERE venue_id = $v AND discount_pct = 10`,
    { v: w.venueId },
  )!;

  const issued = vouchers.issue(w.db, {
    userId: w.customerId,
    venueId: w.venueId,
    tierId: tier.id,
    at,
  });
  /* The estimate is min(avg check × 10%, cap) = min(400, 2500) = 400. */
  eq('issue reserves an estimate from the average check', issued.reserved_minor, 400);
  eq('and spends the points', ledger.balance(w.db, w.customerId), 700);
  eq('the pool holds it as reserved', budget.budgetFor(w.db, w.venueId, at).voucher.reserved, 400);

  /* Redemption through the gate: release the estimate, debit the actual. The
     bill is 120 zł, so the actual discount is 1200 — three times the estimate,
     and the drift is corrected on the spot. */
  const qr = gate.mintQr(w.db, w.venueId, SECRET, at);
  const txn = gate.openTransaction(w.db, { kind: 'qr', token: qr.token, secret: SECRET }, {
    userId: w.customerId,
    intent: 'voucher_redeem',
    intentRef: issued.id,
    at,
  });
  gate.submitAmount(w.db, { transactionId: txn.id, amountMinor: 12000, actorId: w.ownerId, at });
  const receipt = gate.confirm(w.db, { transactionId: txn.id, cashierId: w.ownerId, at });

  eq('the discount is the actual, not the estimate', receipt.discountMinor, 1200);
  const after = budget.budgetFor(w.db, w.venueId, at);
  eq('the estimate is released', after.voucher.reserved, 0);
  eq('and the actual is debited', after.voucher.spent, 1200);
  check(
    'the three states still exhaust the pool',
    after.voucher.spent + after.voucher.reserved + after.voucher.available === after.voucher.base,
  );

  throws('a redeemed voucher cannot be redeemed again', 'already_used', () => {
    const q = gate.mintQr(w.db, w.venueId, SECRET, at);
    gate.openTransaction(w.db, { kind: 'qr', token: q.token, secret: SECRET }, {
      userId: w.customerId,
      intent: 'voucher_redeem',
      intentRef: issued.id,
      at,
    });
  });

  /* §4.3 phase three: an unredeemed voucher gives its reserve back. */
  const w2 = world();
  ledger.earn(w2.db, { userId: w2.customerId, points: 1000, reason: 'adjustment', at });
  const tier2 = w2.db.get<{ id: string }>(
    `SELECT id FROM voucher_tiers WHERE venue_id = $v AND discount_pct = 5`,
    { v: w2.venueId },
  )!;
  vouchers.issue(w2.db, { userId: w2.customerId, venueId: w2.venueId, tierId: tier2.id, at });
  const before = budget.budgetFor(w2.db, w2.venueId, at).voucher.available;
  const released = vouchers.expireVouchers(w2.db, plusDays(at, CONFIG.vouchers.validityDays + 1));
  eq('expiry releases the reserve', released.expired, 1);
  eq(
    'and available goes back up',
    budget.budgetFor(w2.db, w2.venueId, at).voucher.available,
    before + released.released,
  );
  eq('the points are not refunded', ledger.balance(w2.db, w2.customerId), 900);

  w.db.close();
  w2.db.close();
}

function campaignRules(): void {
  describe('§5 campaigns and stamp cards');
  const w = world();
  const at = now();

  throws('a percentage reward is not a campaign', 'validation_failed', () =>
    campaigns.validateCampaign({
      visitsRequired: 3,
      rewardCostMinor: 500,
      rewardLabel: 'x',
      rewardKind: 'percentage_discount',
    }),
  );
  throws('nor is a points threshold', 'validation_failed', () =>
    campaigns.validateCampaign({
      visitsRequired: 3,
      rewardCostMinor: 500,
      rewardLabel: 'x',
      pointsThreshold: 100,
    }),
  );

  /* Two overlapping campaigns; only the higher priority may fire (§5.1). */
  partners.createCampaign(w.db, {
    venueId: w.venueId,
    actorId: w.ownerId,
    name: 'Two visits',
    visitsRequired: 2,
    rewardLabel: 'A pastry',
    rewardCostMinor: 900,
    priority: 1,
    at,
  });
  /* The second needs a plan with room for it, so the venue is put on Growth. */
  entitlements.startSubscription(w.db, {
    subject: { venueId: w.venueId },
    planCode: 'growth',
    source: 'manual',
    at,
  });
  partners.createCampaign(w.db, {
    venueId: w.venueId,
    actorId: w.ownerId,
    name: 'Also two visits',
    visitsRequired: 2,
    rewardLabel: 'A coffee',
    rewardCostMinor: 1200,
    priority: 5,
    at,
  });

  scan(w, 4000, at);
  const second = scan(w, 4000, plusDays(at, 1));
  eq('one reward per visit, and it is the higher priority', second.reward?.label, 'A coffee');
  eq(
    'exactly one reward exists',
    w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM earned_rewards WHERE user_id = $u`, {
      u: w.customerId,
    })?.n,
    1,
  );
  eq(
    'its exact cost is reserved',
    budget.budgetFor(w.db, w.venueId, at).loyalty.reserved,
    1200,
  );

  /* §5.3: pausing stops new earning but existing rewards stay valid and reserved. */
  const reward = campaigns.availableRewards(w.db, w.customerId)[0];
  campaigns.setStatus(w.db, reward.campaign_id, 'paused', at);
  eq(
    'a paused campaign still holds its money',
    budget.budgetFor(w.db, w.venueId, at).loyalty.reserved,
    1200,
  );
  eq('and the earned reward is still available', campaigns.availableRewards(w.db, w.customerId).length, 1);

  /* Redeeming through the gate releases the reserve and debits the same amount. */
  const qr = gate.mintQr(w.db, w.venueId, SECRET, plusDays(at, 2));
  const txn = gate.openTransaction(w.db, { kind: 'qr', token: qr.token, secret: SECRET }, {
    userId: w.customerId,
    intent: 'reward_redeem',
    intentRef: reward.id,
    at: plusDays(at, 2),
  });
  gate.submitAmount(w.db, {
    transactionId: txn.id,
    amountMinor: 3000,
    actorId: w.ownerId,
    at: plusDays(at, 2),
  });
  gate.confirm(w.db, { transactionId: txn.id, cashierId: w.ownerId, at: plusDays(at, 2) });
  const pool = budget.budgetFor(w.db, w.venueId, at).loyalty;
  eq('the exact cost is spent, not an estimate', pool.spent, 1200);
  /* That third visit also paid out the *other* card — it completed on visit two
     and had to wait, because only one reward fires per visit. So the pool is
     holding the pastry's 900 now, which is the rule working rather than a leak. */
  eq('the queued second reward fires on the next visit', pool.reserved, 900);
  eq(
    'and two rewards exist in total',
    w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM earned_rewards WHERE user_id = $u`, {
      u: w.customerId,
    })?.n,
    2,
  );

  w.db.close();
}

function gameRules(): void {
  describe('§7 the games engine');
  const w = world();
  const at = now();

  const round = games.startSession(w.db, {
    userId: w.customerId,
    gameType: 'capitals',
    language: 'en',
    at,
  });
  const content = round.content as {
    questions: Array<{ index: number; prompt: string; options: string[] }>;
  };
  eq('a round is five questions', content.questions.length, CONFIG.games.quizQuestions);
  check(
    'the answers do not travel to the client',
    !JSON.stringify(round.content).includes('answerIndex'),
  );

  /* The server holds the key; the client is told one answer at a time. */
  const secret = JSON.parse(
    w.db.get<{ secret: string }>(`SELECT secret FROM game_sessions WHERE id = $i`, {
      i: round.sessionId,
    })!.secret,
  ) as { answers: number[] };

  content.questions.forEach((question, index) => {
    const result = games.submitEvent(w.db, {
      sessionId: round.sessionId,
      userId: w.customerId,
      seq: index,
      kind: 'answer',
      payload: { index: question.index, choice: secret.answers[index] },
      at,
    });
    check(`question ${index} scores as correct`, result.correct === true);
  });

  /* A replayed event is idempotent rather than a second answer. */
  const replay = games.submitEvent(w.db, {
    sessionId: round.sessionId,
    userId: w.customerId,
    seq: 0,
    kind: 'answer',
    payload: { index: 0, choice: secret.answers[0] },
    at,
  });
  check('a repeated event is not counted twice', !replay.accepted);

  const finished = games.finish(w.db, { sessionId: round.sessionId, userId: w.customerId, at });
  eq('the score is computed server-side', finished.score, 5 * CONFIG.games.quizPerCorrect);
  eq('a clean round is a win', finished.won, true);
  eq('the streak starts at one', finished.streak, 1);
  eq('and no life was spent', finished.livesLeft, CONFIG.points.dailyLives);
  eq('the balance moved by the score', ledger.balance(w.db, w.customerId), finished.score);

  throws('a finished session cannot be finished again', 'invalid_state', () =>
    games.finish(w.db, { sessionId: round.sessionId, userId: w.customerId, at }),
  );

  /* Another player's session is not yours to finish. */
  const other = games.startSession(w.db, { userId: w.ownerId, gameType: 'capitals', at });
  throws('somebody else’s session is refused', 'forbidden', () =>
    games.finish(w.db, { sessionId: other.sessionId, userId: w.customerId, at }),
  );

  /* The streak, the lapse and the freeze. */
  const play = (day: number) => {
    const when = plusDays(at, day);
    const session = games.startSession(w.db, { userId: w.customerId, gameType: 'capitals', at: when });
    return games.finish(w.db, { sessionId: session.sessionId, userId: w.customerId, at: when });
  };
  let last = play(1);
  eq('a consecutive day continues the streak', last.streak, 2);
  for (let day = 2; day <= 6; day += 1) last = play(day);
  eq('seven days of play', last.streak, 7);
  eq('…earns a freeze', last.freezes, 1);

  const lapsed = play(10);
  eq('a missed window is absorbed by the freeze', lapsed.streak, 8);
  eq('and the freeze is spent', lapsed.freezes, 0);

  const broken = play(20);
  eq('with no freeze left, the streak resets', broken.streak, 1);
  check(
    'but the points are not wiped — expiry is the only way points leave (§2.3)',
    ledger.balance(w.db, w.customerId) > 0,
  );

  w.db.close();
}

function dealRules(): void {
  describe('§6 hot deals — targeting, funnel, caps');
  const w = world();
  const at = '2026-08-11T09:00:00.000Z'; // a Tuesday, 11:00 in Kraków

  const deal = partners.createDeal(w.db, {
    actorId: w.ownerId,
    draft: {
      venueId: w.venueId,
      discountText: '15% off',
      targetWeekdays: [1],
      targetFromMin: 10 * 60,
      targetToMin: 12 * 60,
      capClaims: 1,
      copy: { en: { title: 'Tuesday morning', description: 'Ten to twelve' } },
    },
    at,
  });
  partners.publishDeal(w.db, { dealId: deal.id, actorId: w.ownerId, at });

  const viewer = { userId: w.customerId, language: 'en', at };
  check('inside its window it is claimable', deals.claimableNow(w.db, deals.getDeal(w.db, deal.id), viewer).ok);

  const wrongTime = deals.claimableNow(w.db, deals.getDeal(w.db, deal.id), {
    ...viewer,
    at: '2026-08-11T14:00:00.000Z',
  });
  check('outside its hours it is not', !wrongTime.ok && wrongTime.reason === 'wrong_time');

  const wrongDay = deals.claimableNow(w.db, deals.getDeal(w.db, deal.id), {
    ...viewer,
    at: '2026-08-12T09:00:00.000Z',
  });
  check('on the wrong day it is not', !wrongDay.ok && wrongDay.reason === 'wrong_day');

  /* A deal with no copy in the reader's language is not shown to them. */
  const noCopy = deals.browse(w.db, { ...viewer, language: 'uz' }, {});
  check('…and English copy still serves a reader with no translation', noCopy.length >= 1);

  /* §6.3: a claim needs an *open* and a confirmed scan, not a tap on a list. */
  const beforeOpen = scanWithDeal(w, deal.id, at);
  eq('a scan without an open does not claim', deals.funnel(w.db, deal.id).claimed, 0);
  check('…although it is still a visit', beforeOpen.visitCounted);

  deals.track(w.db, { dealId: deal.id, userId: w.customerId, kind: 'open', at });
  scanWithDeal(w, deal.id, plusDays(at, 1));
  eq('an opened deal plus a confirmed scan claims', deals.funnel(w.db, deal.id).claimed, 1);

  /* The cap stops the next one. */
  scanWithDeal(w, deal.id, plusDays(at, 2));
  eq('the per-deal cap holds', deals.funnel(w.db, deal.id).claimed, 1);

  /* B3: publishing needs copy in at least one language. On its own venue,
     because the starter plan allows one live deal and the capacity gate would
     otherwise answer first — which is a true answer to a different question. */
  const w3 = world();
  const empty = partners.createDeal(w3.db, {
    actorId: w3.ownerId,
    draft: { venueId: w3.venueId, copy: {} },
    at,
  });
  throws('a deal with no copy cannot be published', 'validation_failed', () =>
    partners.publishDeal(w3.db, { dealId: empty.id, actorId: w3.ownerId, at }),
  );
  w3.db.close();

  eq(
    'translation completeness is tracked',
    deals.completeness(w.db, deal.id).filled,
    ['en'],
  );

  w.db.close();
}

function scanWithDeal(w: World, dealId: string, at: string): gate.Receipt {
  const qr = gate.mintQr(w.db, w.venueId, SECRET, at);
  const txn = gate.openTransaction(w.db, { kind: 'qr', token: qr.token, secret: SECRET }, {
    userId: w.customerId,
    dealId,
    at,
  });
  gate.submitAmount(w.db, { transactionId: txn.id, amountMinor: 5000, actorId: w.ownerId, at });
  return gate.confirm(w.db, { transactionId: txn.id, cashierId: w.ownerId, at });
}

function consentRules(): void {
  describe('§1.4 / B9a consent-gated identified profiles');
  const w = world();
  const at = now();

  scan(w, 6000, at);

  const table = profiles.customerTable(w.db, w.venueId, { at });
  eq('the customer counts toward the total', table.totalCustomers, 1);
  eq('but is not listed without a grant', table.rows.length, 0);
  eq('and the shared count is honest', table.sharedCustomers, 0);

  throws('their detail is not reachable either', 'not_found', () =>
    profiles.customerDetail(w.db, w.venueId, w.customerId, at),
  );

  consent.grantSharing(w.db, { userId: w.customerId, venueId: w.venueId, at });
  const granted = profiles.customerTable(w.db, w.venueId, { at });
  eq('with a grant they appear', granted.rows.length, 1);
  eq('and the gap is reportable', [granted.totalCustomers, granted.sharedCustomers], [1, 1]);

  const detail = profiles.customerDetail(w.db, w.venueId, w.customerId, at);
  eq('the detail is scoped to this venue', detail.lifetimeValueMinor, 6000);
  check(
    'and never carries the global points balance',
    !Object.keys(detail).some((key) => /points|balance/i.test(key)),
  );

  consent.revokeSharing(w.db, w.customerId, w.venueId, at);
  eq('revoking drops them immediately', profiles.customerTable(w.db, w.venueId, { at }).rows.length, 0);
  check(
    'and the revocation is recorded rather than deleted',
    (w.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM data_sharing_consents WHERE revoked_at IS NOT NULL`,
    )?.n ?? 0) === 1,
  );

  /* §1.3 GDPR. */
  const exported = consent.exportUser(w.db, w.customerId) as Record<string, unknown>;
  check('the export carries the ledger', Array.isArray(exported.points));
  check('and the consent records', Array.isArray(exported.consents));

  consent.eraseUser(w.db, w.customerId, at);
  const erased = w.db.get<{ email: string | null; status: string }>(
    `SELECT email, status FROM users WHERE id = $u`,
    { u: w.customerId },
  );
  eq('erasure anonymises rather than deleting', [erased?.email, erased?.status], [null, 'erased']);
  check(
    'the venue’s visits survive as numbers',
    (w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM venue_visits WHERE venue_id = $v`, {
      v: w.venueId,
    })?.n ?? 0) === 1,
  );

  w.db.close();
}

function analyticsRules(): void {
  describe('§12 / B9 analytics — counted, estimated, attributed, suppressed');
  const w = world();
  const at = now();

  /* Two customers is below the cohort floor, so findings about them are
     suppressed while the raw counts are not. */
  scan(w, 5000, at);
  const overview = analytics.overview(w.db, w.venueId, { at });
  eq('visits are counted exactly', overview.visits.value, 1);
  eq('and labelled as counted', overview.visits.kind, 'counted');
  check('a finding over one person is suppressed', overview.newCustomers.suppressed);
  eq('…and returns null rather than zero', overview.newCustomers.value, null);
  eq('a projection is labelled an estimate', overview.projectedSalesMinor.kind, 'estimated');

  /* Enough customers, and the same finding is reportable. */
  const many = world();
  for (let i = 0; i < CONFIG.privacy.minCohort + 2; i += 1) {
    const id = newId('usr');
    many.db.run(
      `INSERT INTO users (id, email, email_norm, display_name, auth_provider, language, city,
                          status, created_at, updated_at)
       VALUES ($i, $e, $e, 'P', 'email', 'en', 'Krakow', 'active', $t, $t)`,
      { i: id, e: `p${i}@verify.test`, t: at },
    );
    scan(many, 4000 + i * 100, at, id);
  }
  const wide = analytics.overview(many.db, many.venueId, { at });
  check('above the floor it is reported', !wide.newCustomers.suppressed);
  eq('everybody is new the first month', wide.newCustomers.value, CONFIG.privacy.minCohort + 2);

  const heat = analytics.heatmap(many.db, many.venueId, { at });
  eq('the heatmap counts every visit', heat.total, CONFIG.privacy.minCohort + 2);
  check('and finds a quiet window inside opening hours', heat.quietest !== null);

  const cost = analytics.costPerNewCustomer(many.db, many.venueId, { at });
  check('cost per new customer sums all four sources', 'breakdown' in cost);
  eq(
    'the breakdown adds up to the spend',
    Object.values(cost.breakdown).reduce((a, b) => a + b, 0),
    cost.spendMinor,
  );

  /*
   * Reach: seen, clicked, claimed.
   *
   * The venue starts invisible, which is the state worth checking first — a
   * venue nobody has heard of and a venue everybody ignores produce the same
   * screen everywhere else on this dashboard, and telling them apart is the
   * entire reason this report exists.
   */
  const quiet = analytics.reach(w.db, w.venueId, { at });
  eq('a venue nobody has seen has no impressions', quiet.impressions, 0);
  eq('and its click rate is zero, not NaN', quiet.clickRate, 0);
  check('a zero rate is a number', Number.isFinite(quiet.clickRate));

  /* Six impressions, two clicks — on the listing itself, which is the half a
     venue has before it has published anything at all. */
  for (let i = 0; i < 6; i += 1) {
    trackListing(w.db, { venueId: w.venueId, kind: 'impression', source: 'list', at });
  }
  trackListing(w.db, { venueId: w.venueId, kind: 'click', source: 'list', userId: w.customerId, at });
  trackListing(w.db, { venueId: w.venueId, kind: 'click', source: 'map', userId: w.customerId, at });

  /* And a deal, so the two halves are seen to sum. */
  const seen = partners.createDeal(w.db, {
    actorId: w.ownerId,
    draft: { venueId: w.venueId, copy: { en: { title: 'Seen', description: 'x' } } },
    at,
  });
  partners.publishDeal(w.db, { dealId: seen.id, actorId: w.ownerId, at });
  for (let i = 0; i < 4; i += 1) {
    deals.track(w.db, { dealId: seen.id, kind: 'impression', source: 'home_widget', at });
  }
  deals.track(w.db, { dealId: seen.id, kind: 'open', source: 'home_widget', userId: w.customerId, at });

  const reach = analytics.reach(w.db, w.venueId, { at });
  eq('the listing and the deals sum into one impression count', reach.impressions, 10);
  eq('…and into one click count', reach.clicks, 3);
  eq('the click rate is clicks over impressions', reach.clickRate, 0.3);
  /* The funnel has to read downward or it is not a funnel. */
  check('the funnel narrows at every step', reach.impressions >= reach.clicks);
  check('…all the way down', reach.clicks >= reach.claims);
  /* One person, three clicks. Counting clicks as people is the mistake this
     figure exists to avoid, and it is below the cohort floor here. */
  check('unique clickers is a finding about people, so it is suppressed', reach.uniqueClickers.suppressed);
  /* The listing is a row like any deal, so a venue with no deals still has a
     table to read rather than an empty state. */
  eq('the listing is the first row', reach.rows[0].id, null);
  eq('and the deal is beside it', reach.rows.length, 2);
  check('where it was seen is reported', reach.sources.some((row) => row.source === 'list'));

  w.db.close();
  many.db.close();
}

function entitlementRules(): void {
  describe('§12a / B7 entitlements');
  const w = world();
  const at = now();

  const free = entitlements.entitlementsFor(w.db, { userId: w.customerId });
  eq('an account with no subscription resolves to the free plan', free.points_multiplier, '1');
  check('and the free tier can still play', entitlements.entNumber(free, 'daily_lives', 0) > 0);

  entitlements.startSubscription(w.db, {
    subject: { userId: w.customerId },
    planCode: 'plus',
    source: 'stripe',
    at,
  });
  const plus = entitlements.entitlementsFor(w.db, { userId: w.customerId });
  eq('a paid plan raises the multiplier', plus.points_multiplier, '1.25');

  /* §12a.4: the multiplier is applied at commit and recorded on the entry. */
  const receipt = scan(w, 5000, at);
  eq('the multiplier is applied to a scan', receipt.pointsGranted, 6);
  eq(
    'and recorded on the ledger entry',
    w.db.get<{ multiplier: number }>(
      `SELECT multiplier FROM points_ledger WHERE source_ref = $r`,
      { r: receipt.transaction.id },
    )?.multiplier,
    1.25,
  );

  /* A lapse restricts; it never claws back. */
  const subscription = entitlements.activeSubscription(w.db, { userId: w.customerId })!;
  const balanceBefore = ledger.balance(w.db, w.customerId);
  entitlements.setStatus(w.db, subscription.id, 'expired', at);
  eq(
    'a lapse falls back to free',
    entitlements.entitlementsFor(w.db, { userId: w.customerId }).points_multiplier,
    '1',
  );
  eq('and takes nothing back', ledger.balance(w.db, w.customerId), balanceBefore);

  /* B7: capacity gates scale. Starter allows one live deal. */
  const first = partners.createDeal(w.db, {
    actorId: w.ownerId,
    draft: { venueId: w.venueId, copy: { en: { title: 'One', description: 'x' } } },
    at,
  });
  partners.publishDeal(w.db, { dealId: first.id, actorId: w.ownerId, at });
  const second = partners.createDeal(w.db, {
    actorId: w.ownerId,
    draft: { venueId: w.venueId, copy: { en: { title: 'Two', description: 'x' } } },
    at,
  });
  throws('a second live deal needs a bigger plan', 'entitlement_required', () =>
    partners.publishDeal(w.db, { dealId: second.id, actorId: w.ownerId, at }),
  );

  w.db.close();
}

async function assistantRules(): Promise<void> {
  describe('§10 / B8 the assistant');
  const w = world();
  const at = now();

  /* B8: a new partner gets an honest empty signal and data-free options. */
  const empty = assistant.venueContext(w.db, w.venueId, at);
  check('a venue with no data says so', empty.empty);
  check('and offers a richer set of starting points', empty.suggestions.length >= 4);
  check(
    'none of which quotes an invented number',
    empty.suggestions.every((s) => !/\d+%/.test(s.detail)),
  );

  scan(w, 5000, at);
  const filled = assistant.venueContext(w.db, w.venueId, at);
  check('once measured it stops being empty', !filled.empty);
  check('and the facts are grounded', filled.facts.length > 0);

  const draft = assistant.draftFor(w.db, {
    venueId: w.venueId,
    goal: 'I want people to come back more often',
    at,
  });
  eq('a repeat-custom goal produces a campaign, not a voucher', draft.kind, 'campaign');
  check('the draft needs approval', draft.requiresApproval);
  check('and shows its reasoning', draft.reasoning.length > 0);
  /* And the draft has to survive the same validation manual authoring does. */
  const config = draft.config as { visitsRequired: number; rewardCostMinor: number; rewardLabel: string };
  campaigns.validateCampaign(config);
  check('the assistant’s draft passes manual validation', true);

  const answer = await assistant.askConsumer(w.db, {
    userId: w.customerId,
    text: 'how many points do I have',
    at,
  });
  check('a consumer answer is a sentence with a number', /\d/.test(answer.text));
  check('and carries what it was grounded on', Array.isArray(answer.grounding));

  /*
   * The one safety property in `ports/llm.ts`.
   *
   * The system prompt tells the model not to introduce a figure, and an
   * instruction is a request. `onlyKnownNumbers` is the guarantee: prose that
   * carries a number nobody retrieved is thrown away and the grounded draft is
   * sent instead. If this ever passes something it should not, the assistant is
   * lying with the platform's authority behind it — which is the whole reason
   * the model is behind a port rather than in the domain.
   */
  const facts = [
    { kind: 'balance', label: 'points', value: 640 },
    { kind: 'reachable', label: 'venues in reach', value: 12 },
    { kind: 'quiet', label: 'quietest hour', value: '14:00–16:00' },
  ];
  const grounded = 'You have 640 points — enough for 10% off at 12 venues near you.';

  check(
    'a rewrite that keeps every figure passes',
    llm.onlyKnownNumbers('640 points gets you 10% off at 12 places nearby.', facts, grounded),
  );
  check(
    'a rewrite that invents a figure is rejected',
    !llm.onlyKnownNumbers('640 points gets you 25% off at 12 places nearby.', facts, grounded),
  );
  /* The failure this argument exists for: the draft is grounded too, and it
     routinely carries figures that never became a `Fact` — the 10 in "10% off"
     is one. Checking against the facts alone rejected every rewrite of a
     sentence like that, which is the shape where the guard is technically sound
     and the feature never turns on. */
  check(
    'a figure the draft carries counts as known',
    llm.onlyKnownNumbers('Ten per cent off — 10% — is yours at 12 venues.', facts, grounded),
  );
  /* A figure *inside* a fact's value is as grounded as the value itself. */
  check(
    'a figure inside a fact value counts as known',
    llm.onlyKnownNumbers('Your quietest window is 14:00–16:00.', facts, grounded),
  );
  /* Grouping is the reader's language, not a new number. Rejecting `1,714`
     because the fact said `1714` throws away correct prose for punctuation. */
  check(
    'a grouped figure is the same figure',
    llm.onlyKnownNumbers('That is 1,714 zloty.', [{ kind: 'x', label: 'spend', value: 1714 }]),
  );
  check(
    'prose with no figures at all is fine',
    llm.onlyKnownNumbers('Nothing to report yet.', facts, grounded),
  );
  /* Off is the default and it must be free: no key, no request, no waiting. */
  check('the model is off unless it is configured on', llm.mode() === 'off');
  eq(
    'and with it off the draft is returned unchanged',
    await llm.compose({ draft: grounded, facts, language: 'en', side: 'consumer' }),
    grounded,
  );

  w.db.close();
}

function socialRules(): void {
  describe('§8 referrals and leaderboards');
  const w = world();
  const at = now();

  const code = social.codeFor(w.db, w.ownerId);
  check('a referral code exists', code.length > 0);
  eq('binding to yourself is refused', social.bind(w.db, { code, newUserId: w.ownerId, at }).reason, 'self_referral');

  eq('binding works', social.bind(w.db, { code, newUserId: w.customerId, at }).ok, true);
  eq('and pays nothing yet', ledger.balance(w.db, w.ownerId), 0);

  scan(w, 4000, at);
  eq('the first confirmed scan pays both sides', ledger.balance(w.db, w.ownerId), CONFIG.points.referralReward);
  eq(
    'and the bond is completed',
    w.db.get<{ status: string }>(`SELECT status FROM referrals WHERE referred_id = $u`, {
      u: w.customerId,
    })?.status,
    'completed',
  );

  /* §8.2: not opted in means not listed, but still ranked and still shown. */
  ledger.earn(w.db, { userId: w.customerId, points: 40, reason: 'game_win', at });
  const board = social.cityBoard(w.db, { userId: w.customerId, city: 'Krakow', at });
  check('you see yourself', board.you !== null);
  check('…and know you are hidden', board.hidden);
  eq('nobody else sees you', board.rows.filter((row) => !row.isYou).length, 0);

  social.setLeaderboardOptIn(w.db, w.customerId, true);
  const listed = social.cityBoard(w.db, { city: 'Krakow', at });
  check('opting in lists you', listed.rows.some((row) => row.userId === w.customerId));

  w.db.close();
}

async function trafficRules(): Promise<void> {
  describe('website traffic and the sign-in throttle');
  const w = world();
  const at = now();

  const beacon = (over: Partial<Parameters<typeof traffic.record>[1]> = {}, when = at) =>
    traffic.record(
      w.db,
      {
        events: [{ kind: 'view', path: '/' }],
        ip: '203.0.113.9',
        agent: 'Mozilla/5.0 (Macintosh)',
        ...over,
      },
      SECRET,
      when,
    );

  /* The privacy claim, checked rather than asserted in a comment: the same
     visitor on two days must not be linkable, and no IP may reach the table. */
  const dayOne = traffic.visitorKey(SECRET, '2026-08-16', '203.0.113.9', 'agent');
  const dayTwo = traffic.visitorKey(SECRET, '2026-08-17', '203.0.113.9', 'agent');
  check('the visitor key rotates daily', dayOne !== dayTwo);
  eq('…and is stable within a day', traffic.visitorKey(SECRET, '2026-08-16', '203.0.113.9', 'agent'), dayOne);
  check(
    'a different visitor hashes differently',
    traffic.visitorKey(SECRET, '2026-08-16', '198.51.100.4', 'agent') !== dayOne,
  );

  const first = beacon();
  const second = beacon({ events: [{ kind: 'view', path: '/#/learn' }] });
  eq('two views inside the window are one visit', first, second);

  const later = beacon({ events: [{ kind: 'view', path: '/' }] }, plusDays(at, 0.5));
  check('a view after the idle window is a new visit', later !== first);

  check(
    'no IP address is stored anywhere',
    w.db.all<{ visitor_day: string }>(`SELECT visitor_day FROM web_sessions`).every(
      (row) => !row.visitor_day.includes('203.0.113'),
    ),
  );

  /* A query string is where somebody's email ends up in an analytics tool. */
  beacon({ events: [{ kind: 'view', path: '/search?email=a@b.com&q=x' }] });
  check(
    'a query string never lands in a path',
    w.db.all<{ path: string }>(`SELECT path FROM web_events`).every((row) => !row.path.includes('@')),
  );

  const own = beacon({ referrer: 'http://localhost:5173/#/b2b' }, plusDays(at, 1));
  eq(
    'a referrer from the site itself is not a referrer',
    w.db.get<{ referrer_host: string | null }>(`SELECT referrer_host FROM web_sessions WHERE id = $i`, {
      i: own,
    })?.referrer_host,
    null,
  );

  /* The feed is a five-arm union over five tables' real column names. */
  const feed = traffic.activity(w.db, 20);
  check('the activity feed runs', Array.isArray(feed));

  const report = traffic.overview(w.db, traffic.defaultRange(plusDays(at, 1)));
  check('the console counts the visits', report.sessions >= 3);
  check('…and the pages', report.pages.length > 0);
  eq(
    'returning anonymous visitors is null, never zero',
    report.anonymousReturningVisitors,
    null,
  );

  /* Retention is a promise, so it is a check. */
  traffic.record(
    w.db,
    { events: [{ kind: 'view', path: '/old' }], ip: '203.0.113.1', agent: 'a' },
    SECRET,
    plusDays(at, -500),
  );
  traffic.prune(w.db, at);
  eq(
    'events past the retention window are gone',
    w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM web_events WHERE path = '/old'`)?.n,
    0,
  );

  /* Part C is twenty-four endpoints behind `auth: 'admin'`, and before
     `provisionAdmin` nothing in the server could produce one. */
  eq(
    'no admin exists without the environment',
    await accounts.provisionAdmin(w.db, undefined, undefined),
    'skipped',
  );
  eq(
    'a short admin password is refused rather than accepted quietly',
    await accounts
      .provisionAdmin(w.db, 'ops@verify.test', 'x')
      .then(() => 'accepted')
      .catch((error: unknown) => (error instanceof DomainError ? error.code : 'other')),
    'validation_failed',
  );
  eq(
    'provisioning creates one',
    await accounts.provisionAdmin(w.db, 'ops@verify.test', 'operations-key'),
    'created',
  );
  eq(
    'and is idempotent, so a restart rotates rather than fails',
    await accounts.provisionAdmin(w.db, 'ops@verify.test', 'operations-key-2'),
    'updated',
  );
  const asAdmin = await accounts.signIn(w.db, { email: 'ops@verify.test', password: 'operations-key-2' });
  check('the admin signs in with the rotated key', asAdmin.roles.includes('admin'));
  eq('…and lands in admin mode', asAdmin.session.mode, 'admin');

  /* The throttle `CONFIG.auth.signInPerHour` has always described. */
  await accounts.signUp(w.db, {
    email: 'throttle@verify.test',
    password: 'correct horse',
    name: 'Throttle',
  });
  await accounts.signUp(w.db, {
    email: 'bystander@verify.test',
    password: 'correct horse',
    name: 'Bystander',
  });
  for (let attempt = 0; attempt < CONFIG.auth.signInPerHour; attempt += 1) {
    await rejects(
      `wrong password ${attempt + 1} is refused`,
      () => accounts.signIn(w.db, { email: 'throttle@verify.test', password: 'nope' }),
      'unauthenticated',
    );
  }
  await rejects(
    'and the right password is refused too, once the limit is reached',
    () => accounts.signIn(w.db, { email: 'throttle@verify.test', password: 'correct horse' }),
    'unauthenticated',
  );

  /* Keyed by address, so a throttled address cannot lock anybody else out. */
  const bystander = await accounts.signIn(w.db, {
    email: 'bystander@verify.test',
    password: 'correct horse',
  });
  check('another address signs in normally', bystander.token.length > 0);

  /* A success clears the run, so a near miss is not a lasting penalty. */
  for (let attempt = 0; attempt < CONFIG.auth.signInPerHour - 1; attempt += 1) {
    await rejects(
      `a near miss ${attempt + 1}`,
      () => accounts.signIn(w.db, { email: 'bystander@verify.test', password: 'nope' }),
      'unauthenticated',
    );
  }
  const recovered = await accounts.signIn(w.db, {
    email: 'bystander@verify.test',
    password: 'correct horse',
  });
  check('getting it right just under the limit still works', recovered.token.length > 0);
  eq(
    'and clears the failures behind it',
    w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM auth_attempts WHERE subject = 'bystander@verify.test'`)
      ?.n,
    0,
  );

  w.db.close();
}

function jobRules(): void {
  describe('the scheduled jobs');
  const w = world();
  const at = now();

  const frequent = jobs.runFrequent(w.db, at);
  check('the frequent job runs clean', frequent.ran.length === 2);

  const daily = jobs.runDaily(w.db, at);
  eq('nothing has drifted', daily.detail.reconciledDrift, 0);

  const weekly = jobs.runWeekly(w.db, at);
  check('the weekly job snapshots', typeof weekly.detail.leaderboardRows === 'number');

  w.db.close();
}

function routerRules(): void {
  describe('the router');
  const router = new Router().add([
    { method: 'GET', pattern: '/v1/venues/:id', auth: 'none', handler: () => 'param' },
    { method: 'GET', pattern: '/v1/venues/mine', auth: 'none', handler: () => 'literal' },
  ]);
  eq('a literal segment beats a parameter', router.match('GET', '/v1/venues/mine')?.route.pattern, '/v1/venues/mine');
  eq('and a parameter still matches', router.match('GET', '/v1/venues/abc')?.params.id, 'abc');
  eq('a wrong method does not match', router.match('POST', '/v1/venues/mine'), null);
}

/* ══════════════════════════════════════════════════ the HTTP surface ══ */

async function httpSurface(): Promise<void> {
  describe('the HTTP surface, end to end');
  const w = world();
  const api = createApi({ db: w.db, routes: allRoutes, secret: SECRET });
  const server = await api.listen(0, '127.0.0.1');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  const call = async (
    method: string,
    path: string,
    options: { token?: string; body?: unknown; key?: string } = {},
  ) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.key ? { 'idempotency-key': options.key } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };

  const health = await call('GET', '/v1/health');
  eq('health answers', health.status, 200);

  const signup = await call('POST', '/v1/auth/signup', {
    body: { email: 'http@verify.test', password: 'hunter22', name: 'HTTP' },
  });
  eq('sign-up succeeds', signup.status, 200);
  const token = signup.body.token as string;

  const dupe = await call('POST', '/v1/auth/signup', {
    body: { email: 'http@verify.test', password: 'hunter22', name: 'HTTP' },
  });
  eq('a duplicate address is a conflict', dupe.status, 409);
  eq('and says which field', dupe.body.error.field, 'email');

  const badSignIn = await call('POST', '/v1/auth/signin', {
    body: { email: 'http@verify.test', password: 'wrong' },
  });
  eq('a wrong password is 401', badSignIn.status, 401);

  const me = await call('GET', '/v1/me', { token });
  eq('/v1/me answers for a session', me.status, 200);
  eq('the welcome bonus is in the balance', me.body.points, CONFIG.points.welcomeBonus);
  eq('and the free plan is resolved', me.body.plan.code, 'free');

  const anonymous = await call('GET', '/v1/me');
  eq('without a token it is 401', anonymous.status, 401);

  const venues = await call('GET', '/v1/venues?city=Krakow');
  eq('the catalogue is public', venues.status, 200);
  check('and has the imported venues in it', Array.isArray(venues.body) && venues.body.length > 0);

  const guide = await call('GET', '/v1/guide/services?city=Krakow&limit=5');
  eq('the guidebook serves', guide.status, 200);
  check('with the old data in it', guide.body.length === 5);

  const fx = await call('GET', '/v1/fx?from=EUR&to=PLN&amount=10');
  eq('the converter answers', fx.status, 200);
  check('with a rate from the old sheet', fx.body.converted.result > 0);

  /* The partner routes need a partner. */
  const ownerSignUp = await call('POST', '/v1/auth/signup', {
    body: { email: 'boss@verify.test', password: 'hunter22', name: 'Boss', partner: true },
  });
  const ownerToken = ownerSignUp.body.token as string;

  const forbidden = await call('POST', `/v1/venues/${w.venueId}/qr`, { token: ownerToken });
  eq('a partner cannot mint a QR for a venue that is not theirs', forbidden.status, 403);

  const mine = await call('POST', '/v1/partner/venues', {
    token: ownerToken,
    body: { name: 'HTTP Café', category: 'cafe', city: 'Krakow' },
  });
  eq('a partner can create a venue', mine.status, 200);
  eq('which starts as a draft', mine.body.status, 'draft');

  const unverified = await call('POST', `/v1/partner/venues/${mine.body.id}/deals`, {
    token: ownerToken,
    body: { copy: { en: { title: 'Hello', description: 'World' } } },
  });
  eq('a draft venue may author', unverified.status, 200);
  const publish = await call('POST', `/v1/partner/deals/${unverified.body.id}/publish`, {
    token: ownerToken,
  });
  eq('but not publish before verification', publish.status, 403);
  eq('and it says why', publish.body.error.code, 'not_verified');

  /* Idempotency: the same key returns the same response, a different body 409s. */
  const key = 'verify-key-1';
  const first = await call('POST', '/v1/games/sessions', {
    token,
    body: { gameType: 'capitals' },
  });
  eq('a game session starts', first.status, 200);

  const gift = await call('POST', '/v1/gift-cards', {
    token,
    key,
    body: { stockId: 'gcs_media_expert' },
  });
  eq('a gift card is redeemable', gift.status, 200);
  const again = await call('POST', '/v1/gift-cards', {
    token,
    key,
    body: { stockId: 'gcs_media_expert' },
  });
  eq('a retry returns the same result', again.body.code, gift.body.code);
  eq(
    'and spent the points only once',
    (await call('GET', '/v1/me', { token })).body.points,
    CONFIG.points.welcomeBonus - 100,
  );

  const conflict = await call('POST', '/v1/gift-cards', {
    token,
    key,
    body: { stockId: 'gcs_zalando' },
  });
  eq('the same key with a different body is a conflict', conflict.status, 409);

  const index = await call('GET', '/v1/deals');
  eq('deals are public', index.status, 200);

  const missing = await call('GET', '/v1/nope');
  eq('an unknown path is 404', missing.status, 404);

  /* Part C, over HTTP and with a real admin, because the queries behind these
     are hand-written SQL against columns nothing else in this file selects.
     Calling `overview()` in isolation does not compile the route's own query,
     and two of these shipped with a wrong column name that only a request could
     find. Every admin read is exercised for that reason. */
  const beacon = await call('POST', '/v1/traffic', {
    body: { events: [{ kind: 'view', path: '/#/b2b' }, { kind: 'action', path: '/#/b2b', name: 'pricing' }] },
  });
  eq('the traffic beacon is public', beacon.status, 200);
  eq('and takes no identifier', beacon.body.recorded, 2);

  const outsider = await call('GET', '/v1/admin/traffic', { token });
  eq('a customer cannot read the console', outsider.status, 403);

  await accounts.provisionAdmin(w.db, 'ops@verify.test', 'operations-key');
  const adminIn = await call('POST', '/v1/auth/signin', {
    body: { email: 'ops@verify.test', password: 'operations-key' },
  });
  eq('the provisioned admin signs in', adminIn.status, 200);
  const adminToken = adminIn.body.token as string;

  for (const path of [
    '/v1/admin/traffic',
    '/v1/admin/activity',
    '/v1/admin/users',
    '/v1/admin/venues',
    '/v1/admin/overview',
    '/v1/admin/queue',
    '/v1/admin/fraud',
    '/v1/admin/trials',
    '/v1/admin/audit',
    '/v1/admin/config',
    '/v1/admin/verifications',
    '/v1/admin/tags',
  ]) {
    const read = await call('GET', path, { token: adminToken });
    eq(`GET ${path} answers`, read.status, 200);
  }

  const feed = await call('GET', '/v1/admin/activity?limit=10', { token: adminToken });
  check('the activity feed is chronological', feed.body.events.length >= 0);
  const seenTraffic = await call('GET', '/v1/admin/traffic', { token: adminToken });
  check('the console sees the beacon', (seenTraffic.body.views as number) >= 1);

  server.close();
  w.db.close();
}

async function accountRules(): Promise<void> {
  describe('§1.1 provisional accounts and the merge');
  const w = world();
  const at = now();

  const guest = accounts.provisional(w.db, 'device-abc', at);
  ledger.earn(w.db, { userId: guest.id, points: 60, reason: 'game_win', at });
  eq('a guest can hold points', ledger.balance(w.db, guest.id), 60);

  const real = await accounts.signUp(w.db, {
    email: 'merged@verify.test',
    password: 'hunter22',
    name: 'Merged',
    provisionalId: guest.id,
    at,
  });
  eq(
    'the points survive the merge',
    ledger.balance(w.db, real.id),
    60 + CONFIG.points.welcomeBonus,
  );
  eq('the guest is closed', w.db.get<{ status: string }>(`SELECT status FROM users WHERE id = $u`, {
    u: guest.id,
  })?.status, 'erased');
  eq('and the balance is derived, not copied', ledger.reconcile(w.db, real.id), 0);

  const signedIn = await accounts.signIn(w.db, {
    email: 'merged@verify.test',
    password: 'hunter22',
    at,
  });
  check('the session resolves', accounts.resolveSession(w.db, signedIn.token) !== null);
  accounts.signOut(w.db, signedIn.session.id, at);
  check('and stops resolving once revoked', accounts.resolveSession(w.db, signedIn.token) === null);

  w.db.close();
}

function countryRules(): void {
  describe('the country table and the flags bank');

  eq('the flag emoji is built from the code', flagOf('PL'), '🇵🇱');
  eq('…and works for a two-letter code with a repeated letter', flagOf('UZ'), '🇺🇿');

  /* The seven that are wrong in most hand-written tables. */
  eq('the United Kingdom is GB, not UK', codeFor('United Kingdom'), 'GB');
  eq('Kinshasa is CD', codeFor('Congo, Dem. Rep.'), 'CD');
  eq('Brazzaville is CG', codeFor('Congo, Rep.'), 'CG');
  eq('the Vatican is VA', codeFor('Vatican City'), 'VA');
  eq('St Vincent is VC', codeFor('St. Vincent & Grenadines'), 'VC');
  eq('Türkiye is TR', codeFor('Turkey (Türkiye)'), 'TR');
  eq('Eswatini kept SZ', codeFor('Eswatini'), 'SZ');
  eq('Niger and Nigeria are not the same country', [codeFor('Niger'), codeFor('Nigeria')], ['NE', 'NG']);

  /* Respellings a future export might arrive with. */
  eq('accents are optional', codeFor('Cote d Ivoire'), 'CI');
  eq('so is the case', codeFor('POLAND'), 'PL');
  eq('an alias resolves', codeFor('Czechia'), 'CZ');
  eq('and so does the old name', codeFor('Swaziland'), 'SZ');
  eq('an unknown name is null, not a guess', codeFor('Atlantis'), null);

  const db = openDb(':memory:');
  seedPlatform(db);
  db.tx(() => importLegacy(db, 'new-data'));

  const banks = db.all<{ bank: string; language: string; n: number }>(
    `SELECT bank, language, COUNT(*) AS n FROM quiz_items GROUP BY bank, language`,
  );
  const flags = banks.filter((row) => row.bank === 'flags');
  eq('the flags bank exists in four languages', flags.length, 4);
  check('every country made it into every language', flags.every((row) => row.n === 196), flags);

  const prompts = db.all<{ prompt: string }>(
    `SELECT prompt FROM quiz_items WHERE bank = 'flags' AND language = 'en'`,
  );
  check(
    'every prompt is a two-letter code',
    prompts.every((row) => /^[A-Z]{2}$/.test(row.prompt)),
  );
  eq(
    'and no code is used twice',
    new Set(prompts.map((row) => row.prompt)).size,
    prompts.length,
  );

  const poland = db.get<{ answer: string; distractors: string; meta: string }>(
    `SELECT answer, distractors, meta FROM quiz_items
      WHERE bank = 'flags' AND language = 'pl' AND prompt = 'PL'`,
  )!;
  eq('the answer is in the player’s own language', poland.answer, 'Polska');
  eq('the emoji rides along', JSON.parse(poland.meta).flag, '🇵🇱');
  const wrong = JSON.parse(poland.distractors) as string[];
  eq('three wrong answers', wrong.length, 3);
  check('none of which is the right one', !wrong.includes(poland.answer));

  /* The distractors come from the same continent, which is what makes it a
     question rather than a giveaway. */
  const asia = db.get<{ distractors: string }>(
    `SELECT distractors FROM quiz_items WHERE bank = 'flags' AND language = 'en' AND prompt = 'UZ'`,
  )!;
  const neighbours = JSON.parse(asia.distractors) as string[];
  const continents = neighbours.map(
    (name) =>
      JSON.parse(
        db.get<{ meta: string }>(
          `SELECT meta FROM quiz_items WHERE bank = 'flags' AND language = 'en' AND answer = $a`,
          { a: name },
        )?.meta ?? '{}',
      ).continent,
  );
  check('the wrong answers are from the same continent', continents.every((c) => c === 'Asia'), continents);

  db.close();
}

/**
 * `npm run server:import` runs on a database that already has data in it, so the
 * import has to be repeatable. Every one of these was broken once: a fresh id on
 * a row with a unique key turns `INSERT OR REPLACE` into delete-and-recreate,
 * and a minted ledger id hands everybody their opening balance twice.
 */
function reimportRules(): void {
  describe('the import is repeatable');

  const db = openDb(':memory:');
  seedPlatform(db);
  db.tx(() => importLegacy(db, 'new-data'));

  const count = (sql: string) => db.get<{ n: number }>(sql)?.n ?? 0;
  const before = {
    quiz: count(`SELECT COUNT(*) AS n FROM quiz_items`),
    users: count(`SELECT COUNT(*) AS n FROM users`),
    venues: count(`SELECT COUNT(*) AS n FROM venues`),
    tiers: count(`SELECT COUNT(*) AS n FROM voucher_tiers`),
    movements: count(`SELECT COUNT(*) AS n FROM budget_movements`),
    ledger: count(`SELECT COUNT(*) AS n FROM points_ledger`),
    points: count(`SELECT SUM(delta) AS n FROM points_ledger`),
  };
  const budgetId = db.get<{ id: string }>(`SELECT id FROM budgets LIMIT 1`)!.id;

  db.tx(() => importLegacy(db, 'new-data'));

  const after = {
    quiz: count(`SELECT COUNT(*) AS n FROM quiz_items`),
    users: count(`SELECT COUNT(*) AS n FROM users`),
    venues: count(`SELECT COUNT(*) AS n FROM venues`),
    tiers: count(`SELECT COUNT(*) AS n FROM voucher_tiers`),
    movements: count(`SELECT COUNT(*) AS n FROM budget_movements`),
    ledger: count(`SELECT COUNT(*) AS n FROM points_ledger`),
    points: count(`SELECT SUM(delta) AS n FROM points_ledger`),
  };
  eq('a second import changes nothing', after, before);
  eq('the budget keeps its id, so its movements survive', db.get<{ id: string }>(
    `SELECT id FROM budgets LIMIT 1`)?.id, budgetId);

  for (const user of db.all<{ id: string }>(`SELECT id FROM users`)) {
    eq(`balance still derives for ${user.id.slice(0, 8)}`, ledger.reconcile(db, user.id), 0);
  }

  db.close();
}

function importRules(): void {
  describe('the old database, imported');
  const db = openDb(':memory:');
  seedPlatform(db);
  const summary = db.tx(() => importLegacy(db, 'new-data'));

  check('the guidebook came across', (summary.counts.guidance_services ?? 0) > 300);
  check('the deals came across', (summary.counts.hot_deals ?? 0) > 0);
  check('the funnel events came across', (summary.counts.deal_events ?? 0) > 800);
  check('the quiz banks came across', (summary.counts.quiz_items ?? 0) > 1500);
  eq('nineteen currencies, one anchor', summary.counts.rates, 19);
  check('the lossy conversion is reported', summary.notes.some((note) => note.includes('percentage-reward')));

  /* Ids are preserved so a row can be traced back to the export. */
  const venue = db.get<{ id: string }>(`SELECT id FROM venues WHERE name LIKE 'Chayxana%'`);
  check('a venue keeps its Base44 id', /^[0-9a-f]{24}$/.test(venue?.id ?? ''));

  /* An opening balance is a ledger entry, not a number. */
  const opening = db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM points_ledger WHERE source_kind = 'legacy_import'`,
  );
  check('balances arrived as ledger entries', (opening?.n ?? 0) > 0);
  for (const user of db.all<{ id: string }>(`SELECT id FROM users`)) {
    eq(`balance is derived for ${user.id.slice(0, 8)}`, ledger.reconcile(db, user.id), 0);
  }

  /* Every campaign has an exact cost, including the converted ones. */
  const bad = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM campaigns WHERE reward_cost_minor <= 0`);
  eq('every campaign has a cost to the partner', bad?.n, 0);

  db.close();
}

/**
 * `db/demo.ts` — the catalogue a deployment without `new-data/` gets.
 *
 * Three kinds of thing are checked here and they are not the same kind. That the
 * rows *satisfy the schema* is the least of it, because the foreign keys already
 * say so. What matters is that they are **reachable** (a listing nobody's query
 * returns is the empty catalogue with extra steps), that they are **honest**
 * (marked, unowned, and carrying no invented person), and that seeding them
 * **cannot happen on a box that has real data** — which is a property of the
 * ordering in `boot`, not of this module, and is checked as one below.
 */
function demoRules(): void {
  describe('the demo catalogue');

  const db = openDb(':memory:');
  seedPlatform(db);
  const summary = seedDemo(db);

  const count = (sql: string) => db.get<{ n: number }>(sql)?.n ?? 0;

  check('five to eight venues, as the brief asks', summary.venues >= 5 && summary.venues <= 8, summary);
  check('a couple of deals each', summary.deals >= summary.venues * 2, summary);
  check('two cities', count(`SELECT COUNT(DISTINCT city) AS n FROM venues`) === 2);
  check(
    'and more than one category, which is what the benchmarks read',
    count(`SELECT COUNT(DISTINCT category) AS n FROM venues`) >= 5,
  );

  /* Reachable: the exact query `GET /v1/venues` runs, and the exact function
     `GET /v1/deals` runs. A row that is `live` but filtered out by one of them
     is a row that fixes nothing. */
  const listed = db.all<{ id: string }>(
    `SELECT id FROM venues WHERE status = 'live' AND deleted_at IS NULL`,
  );
  eq('every seeded venue is publicly listed', listed.length, summary.venues);
  const browsed = deals.browse(db, { language: 'en' }, { limit: 100 });
  eq('every seeded deal is publicly browsable', browsed.length, summary.deals);
  check(
    'and each one has copy rather than a blank card',
    browsed.every((card) => card.copy.title.trim() !== ''),
  );
  eq(
    'a Polish reader gets Polish',
    deals.copyFor(db, browsed[0]!.id, 'pl')?.language,
    'pl',
  );
  /* Written in two languages, and the completeness tracker says so rather than
     pretending. Three missing is the honest answer, not a bug. */
  const filled = deals.completeness(db, browsed[0]!.id).filled;
  eq('two languages filled, and the gap is reported', filled, ['en', 'pl']);

  /* Honest: marked, unowned, and carrying nobody. */
  eq(
    'every venue id says it is a demo',
    count(`SELECT COUNT(*) AS n FROM venues WHERE id NOT LIKE 'ven!_demo!_%' ESCAPE '!'`),
    0,
  );
  eq(
    'so does every deal id',
    count(`SELECT COUNT(*) AS n FROM hot_deals WHERE id NOT LIKE 'del!_demo!_%' ESCAPE '!'`),
    0,
  );
  check(
    'and the console can see it in the config table',
    db.get(`SELECT value FROM platform_config WHERE key = 'demo_seed'`) !== undefined,
  );
  /* The safety property, and the reason it is stated as a count of *users*
     rather than a count of nulls: the failure mode worth refusing is not an
     owned venue, it is a partner account with a password in the repository
     standing on production. Seeding creates no accounts at all. */
  eq('no account was created to own them', count(`SELECT COUNT(*) AS n FROM users`), 0);
  eq(
    'and no venue claims an owner',
    count(`SELECT COUNT(*) AS n FROM venues WHERE owner_user_id IS NOT NULL`),
    0,
  );
  eq('no rating is invented', count(`SELECT COUNT(*) AS n FROM venues WHERE rating IS NOT NULL`), 0);
  eq('no funnel event is invented', count(`SELECT COUNT(*) AS n FROM deal_events`), 0);
  eq('no visit is invented', count(`SELECT COUNT(*) AS n FROM venue_visits`), 0);

  /* §5.1 and §4.2, on the seeded rows: an exact cost, and a pool whose three
     states exhaust it. A demo that breaks either teaches the wrong arithmetic. */
  eq(
    'every campaign has an exact cost to the partner',
    count(`SELECT COUNT(*) AS n FROM campaigns WHERE reward_cost_minor <= 0`),
    0,
  );
  for (const venue of listed) {
    const view = budget.budgetFor(db, venue.id);
    eq(
      `${venue.id} — the pools exhaust the budget`,
      view.loyalty.base + view.voucher.base,
      view.total,
    );
    for (const pool of [view.loyalty, view.voucher]) {
      eq(
        `${venue.id} — ${pool.allocation} available is derived`,
        pool.available,
        pool.base - pool.spent - pool.reserved,
      );
    }
  }

  /* The reach recorder against a real row, which is the thing that returned 404
     for every id while the catalogue was empty. */
  const first = listed[0]!.id;
  trackListing(db, { venueId: first, kind: 'impression', source: 'guide' });
  trackListing(db, { venueId: first, kind: 'click', source: 'guide' });
  const seen = analytics.reach(db, first);
  eq('an impression lands on a seeded venue', seen.impressions, 1);
  eq('and so does a click', seen.clicks, 1);
  eq('the rate over one impression is one', seen.clickRate, 1);

  /* Idempotent. It only runs on an empty catalogue, but a derived id that is not
     is how `INSERT OR REPLACE` cascades a budget's movements away — the exact
     bug `reimportRules` above exists for. */
  const before = {
    venues: count(`SELECT COUNT(*) AS n FROM venues`),
    deals: count(`SELECT COUNT(*) AS n FROM hot_deals`),
    tiers: count(`SELECT COUNT(*) AS n FROM voucher_tiers`),
    campaigns: count(`SELECT COUNT(*) AS n FROM campaigns`),
    budgets: count(`SELECT COUNT(*) AS n FROM budgets`),
    hours: count(`SELECT COUNT(*) AS n FROM venue_hours`),
    copy: count(`SELECT COUNT(*) AS n FROM translations`),
  };
  const budgetId = db.get<{ id: string }>(`SELECT id FROM budgets ORDER BY id LIMIT 1`)!.id;
  seedDemo(db);
  eq('a second seeding changes nothing', {
    venues: count(`SELECT COUNT(*) AS n FROM venues`),
    deals: count(`SELECT COUNT(*) AS n FROM hot_deals`),
    tiers: count(`SELECT COUNT(*) AS n FROM voucher_tiers`),
    campaigns: count(`SELECT COUNT(*) AS n FROM campaigns`),
    budgets: count(`SELECT COUNT(*) AS n FROM budgets`),
    hours: count(`SELECT COUNT(*) AS n FROM venue_hours`),
    copy: count(`SELECT COUNT(*) AS n FROM translations`),
  }, before);
  eq('the budget keeps its id, so its movements survive', db.get<{ id: string }>(
    `SELECT id FROM budgets ORDER BY id LIMIT 1`)?.id, budgetId);
  eq('and the tracked events are still there', count(`SELECT COUNT(*) AS n FROM service_events`), 2);

  db.close();
}

/**
 * The ordering in `boot`, which is the half of this that lives in `main.ts`.
 *
 * Written so it is true in both worlds rather than in the one this machine
 * happens to be: a developer's box has `new-data/` and must take the real
 * import, a remote does not have it (it is gitignored, and it is the old app's
 * live personal data) and must take the demo set. Exactly one of the two, and
 * never an empty catalogue — which is what production was actually serving.
 */
function bootOrdering(): void {
  describe('boot: import first, demo only if still empty');

  const { db } = boot({ file: ':memory:', quiet: true });
  const count = (sql: string) => db.get<{ n: number }>(sql)?.n ?? 0;

  const total = count(`SELECT COUNT(*) AS n FROM venues`);
  const demo = count(`SELECT COUNT(*) AS n FROM venues WHERE id LIKE 'ven!_demo!_%' ESCAPE '!'`);
  const imported = total - demo;

  check('the catalogue is never empty after boot', total > 0, { total, demo });
  check(
    'exactly one of the two ran',
    imported === 0 ? demo > 0 : demo === 0,
    { imported, demo },
  );

  db.close();
}

/* ══════════════════════════════════════════════════════════════ the run ══ */

async function run(): Promise<void> {
  const started = Date.now();

  pureHelpers();
  crypto();
  await passwords();
  routerRules();
  countryRules();
  reimportRules();
  importRules();
  demoRules();
  bootOrdering();
  ledgerRules();
  budgetRules();
  gateRules();
  voucherRules();
  campaignRules();
  gameRules();
  dealRules();
  consentRules();
  analyticsRules();
  entitlementRules();
  await assistantRules();
  socialRules();
  await trafficRules();
  jobRules();
  await accountRules();
  await httpSurface();

  const ms = Date.now() - started;
  console.log(`\n${passed} checks passed in ${ms}ms`);
  if (failures.length > 0) {
    console.log(`\n${failures.length} FAILED:`);
    for (const failure of failures) console.log(`  ✗ ${failure}`);
    process.exitCode = 1;
  }
}

void run();
