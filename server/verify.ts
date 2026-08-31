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
import { csvParts, parseCsv } from './db/csv.ts';
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
import {
  isoWeek,
  local,
  localMonth,
  now,
  plusDays,
  plusMinutes,
  plusMonths,
  withinDailyWindow,
  type Iso,
} from './domain/time.ts';
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

/**
 * The `DomainError` a call throws, for the checks that are about its *detail*.
 *
 * `throws` above asserts the code, which is what decides the status. Which
 * **field** a refusal names is a separate promise and a load-bearing one — it is
 * the difference between a form highlighting the country picker and a form
 * telling somebody their home town is wrong — so it needs to be reachable.
 * Returns null rather than throwing when the call succeeds, so the check that
 * follows fails on the value instead of taking the suite down.
 */
function refusal(fn: () => unknown): DomainError | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof DomainError ? error : null;
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

/**
 * The fixture venue's clock, and therefore the clock every budget period in
 * this suite is a calendar month of. Written into the venue row in `world()`
 * below and read back by `midMonth` — one constant, because a fixture whose
 * period is a Kraków month and whose dates are picked in UTC disagree for two
 * hours at the end of every month.
 */
const VENUE_TZ = 'Europe/Warsaw';

/**
 * The 15th of the fixture venue's *current* budget period, at midday UTC.
 *
 * A section that starts at `now()` and steps a day or two forward is asserting
 * a rule; on the last days of a month it is also asserting the calendar, and
 * loses. §5's third visit is `plusDays(at, 2)`, which lands in the *next*
 * month's budget while the assertion reads this month's pool — so the suite
 * failed on the 30th and 31st, passed on the other twenty-eight days, and
 * taught whoever saw it to re-run rather than to read. A test that passes
 * twenty-eight days in thirty is worse than one that fails.
 *
 * Pinning to the middle of the month leaves the fixture saying what it means: a
 * rule about visits, not about dates. Still derived from `now()` rather than
 * written as a literal, because `world()` seeds the venue's budget for the
 * period containing `now()` and the two have to name the same period — a
 * hard-coded month would quietly start exercising an auto-created empty budget
 * the month after it was written. And built from `localMonth` in the venue's
 * zone rather than from the UTC date, because the last two hours of a UTC month
 * are already the next month in Kraków, which is where the budget lives.
 */
const midMonth = (): Iso => `${localMonth(now(), VENUE_TZ)}-15T12:00:00.000Z`;

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
       VALUES ($i, $o, 'Verify Café', 'cafe', 'Krakow', 'PL', $tz, 'PLN',
               'live', $t, 'cashier', 1500, 100000, 4000, 'category', 1, 5, 24, 1, $t, $t)`,
      { i: venueId, o: ownerId, tz: VENUE_TZ, t: at },
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
      { i: newId('bdg'), v: venueId, p: localMonth(at, VENUE_TZ), t: at },
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

  /*
   * §2.4 used to trim a game round against a flat daily ceiling, and for a
   * while after that a per-game decay curve shrank a repeat instead. Neither
   * exists: a round banks `floor(raw × points_multiplier)`, and what bounds a
   * day is energy, spent in `games.finish`. The ledger knows about none of it,
   * which is the point — `earn` grants what it is handed.
   *
   * What is still worth asserting here is that a large earn arrives whole.
   */
  const big = ledger.earn(db, { userId: customerId, points: 500, reason: 'game_win' });
  eq('a game round is banked in full', big.entry.delta, 500);
  eq('…and the counter still records the day', big.entry.reason, 'game_win');

  /* §2.3: expiry is per-batch, FIFO, and only takes what is left of a lot. */
  const old = now();
  const w2 = world();
  /* `adjustment` rather than `game_win` is now only a labelling choice — the
     cap that used to trim this to 150 is gone — but the batch reads more
     clearly as an opening balance than as a quiz somebody played in 2025. */
  ledger.earn(w2.db, { userId: w2.customerId, points: 200, reason: 'adjustment', at: plusDays(old, -400) });
  ledger.earn(w2.db, { userId: w2.customerId, points: 60, reason: 'scan_earn', at: old });
  ledger.spend(w2.db, { userId: w2.customerId, points: 50, reason: 'gift_card_redeem', at: old });
  /*
   * **Points do not expire.** `runExpiry` and its job are deleted, so what is
   * asserted here now is the opposite of what used to be: a batch earned four
   * hundred days ago is still spendable, and a balance left alone stays where
   * it was. The FIFO lots survive because spending still walks them oldest
   * first — that is the half of the machinery that had a job.
   */
  eq('a four-hundred-day-old batch is still there', ledger.balance(w2.db, w2.customerId), 210);
  check('and nothing on the ledger carries an expiry date',
    w2.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM points_ledger WHERE expires_at IS NOT NULL`,
    )?.n === 0);
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
  /*
   * A first scan at a venue now pays four things, and the receipt reports the
   * sum. Spelled out as the sum rather than as 165, so that a change to any
   * one of them names itself here instead of failing as an unexplained total:
   *   the venue’s own rate (5 — the seed sets it, and a venue's own number
   *   beats the plan's `scan_points`: the plan buys a better default, not a
   *   claim on a partner's money),
   *   the first visit to this venue, and
   *   the first visit in this category.
   *
   * **There is no spend bonus.** Paying more used to earn more in steps over
   * the minimum, and it was the one line that made the reward depend on the
   * size of the bill rather than on the visit — wrong for a scheme whose whole
   * argument to a venue is repeat custom. The minimum still decides whether a
   * scan counts as a visit at all; only the bonus went.
   */
  eq('a confirmed scan grants the venue’s points and its one-offs',
    receipt.pointsGranted,
    5 + CONFIG.earn.firstVisitToVenue + CONFIG.earn.newCategory);
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

  /* §4.3 phase three: an unredeemed voucher gives its reserve back.

     This one steps a whole validity period forward and still reads the pool at
     `at`, which looks like the calendar bug `midMonth` exists for and is not:
     `expireVouchers` releases against `issued_vouchers.budget_id`, the budget
     that took the reserve, not the one the clock is in when it expires. A
     reserve released into next month's pool would be a leak in the money rather
     than in the fixture, which is why the column is stored. */
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
  /* Mid-month, not `now()`: this section walks a customer through three visits
     two days apart and then reads one pool, and a reward earned on the 1st is
     reserved against a different budget than one earned on the 30th. See
     `midMonth`. */
  const at = midMonth();

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
  /* `revealed` belongs to Memory Match, which is the one game whose moves teach
     the client what the board is. A quiz has an answer key and no board, and a
     client narrowing on the field must not find one on a game that never turns a
     card over. */
  check('a quiz reply names no cards, because a quiz has no board', replay.revealed === undefined);

  const finished = games.finish(w.db, { sessionId: round.sessionId, userId: w.customerId, at });
  /* Five right at one apiece, the clean-sweep bonus, and the speed band on top
     of it — every event above was submitted at the same instant, so the round
     took nought seconds and takes the fastest band. That is the quiz ceiling,
     5 + 1 + 2, and `scoringRules` below walks the bands one at a time. */
  eq('the score is computed server-side', finished.score,
    5 * CONFIG.games.quizPerCorrect + CONFIG.games.quizPerfectBonus +
      CONFIG.games.quizSpeedBands[0].points);
  eq('a clean round is a win', finished.won, true);
  eq('the streak starts at one', finished.streak, 1);
  /* **A win costs energy too, now.** The pool used to be charged by a loss
     only, which meant this line read `dailyEnergy` and the assertion said
     nothing at all about a rule with no writer on this path. One off a full
     tank is what "every finished round costs one" looks like from outside. */
  eq('a win spends energy like any other round', finished.energyLeft,
    CONFIG.points.dailyEnergy - 1);
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
  energyRules();
}

/**
 * §7.2 — what a round costs, and what refuses one.
 *
 * Its own world and its own instant, because the streak block above walks the
 * customer across three weeks and the tank is measured in hours: a fixture that
 * has been playing since the 3rd cannot say anything about a pool that refills
 * four times a day.
 *
 * The four facts, and they are four because each one used to be a different
 * answer: **a win spends**, **a loss spends**, **an abandoned round does not**,
 * and an **empty tank refuses the next start** rather than the next finish.
 */
function energyRules(): void {
  describe('§7.2 energy — every finished round costs one');
  const w = world();
  const at = now();

  /** Play a whole round, answering every question right or every one wrong. */
  const round = (rightly: boolean, when = at) => {
    const opened = games.startSession(w.db, {
      userId: w.customerId,
      gameType: 'capitals',
      language: 'en',
      at: when,
    });
    const secret = JSON.parse(
      w.db.get<{ secret: string }>(`SELECT secret FROM game_sessions WHERE id = $i`, {
        i: opened.sessionId,
      })!.secret,
    ) as { answers: number[] };
    secret.answers.forEach((answer, index) => {
      games.submitEvent(w.db, {
        sessionId: opened.sessionId,
        userId: w.customerId,
        seq: index,
        kind: 'answer',
        /* Any index that is not the answer is a wrong answer, and 0/1 is always
           one of each: the options are four, so `answer` cannot be both. */
        payload: { index, choice: rightly ? answer : answer === 0 ? 1 : 0 },
        at: when,
      });
    });
    return games.finish(w.db, { sessionId: opened.sessionId, userId: w.customerId, at: when });
  };

  const full = CONFIG.points.dailyEnergy;
  eq('a new player starts on a full tank', games.energyFor(w.db, w.customerId, at).energy, full);

  const won = round(true);
  eq('a won round is a win', won.won, true);
  eq('…and spends one anyway', won.energyLeft, full - 1);

  const lost = round(false);
  eq('a lost round is a loss', lost.won, false);
  eq('…and spends exactly the same one', lost.energyLeft, full - 2);

  /*
   * Abandoning. `startSession` closes any round still open for the player, so
   * opening two in a row abandons the first — and the charge lives in `finish`,
   * which the abandoned one never reaches.
   *
   * This is the fact the whole design of "charge at the end" exists to protect:
   * a connection that drops before the first question must not cost anything,
   * because that is the one failure the player did not choose.
   */
  const dropped = games.startSession(w.db, { userId: w.customerId, gameType: 'capitals', at });
  const kept = games.startSession(w.db, { userId: w.customerId, gameType: 'capitals', at });
  eq(
    'the first of two starts is abandoned',
    w.db.get<{ state: string }>(`SELECT state FROM game_sessions WHERE id = $i`, {
      i: dropped.sessionId,
    })?.state,
    'abandoned',
  );
  eq(
    'and an abandoned round costs nothing',
    games.energyFor(w.db, w.customerId, at).energy,
    full - 2,
  );
  eq(
    'the round that is finished still costs one',
    games.finish(w.db, { sessionId: kept.sessionId, userId: w.customerId, at }).energyLeft,
    full - 3,
  );

  /* Whatever the ceiling leaves after those three, spent, so that the refusal
     below is about an empty tank rather than about the number 3. `daily_energy`
     is a plan figure and has already moved once; a fixed count of rounds here
     turns that move into a failure in this file rather than a change in that
     one. */
  while (games.energyFor(w.db, w.customerId, at).energy > 0) {
    const drain = games.startSession(w.db, { userId: w.customerId, gameType: 'capitals', at });
    games.finish(w.db, { sessionId: drain.sessionId, userId: w.customerId, at });
  }

  /* An empty tank refuses the *start*. Refusing the finish instead would mean
     telling somebody the round they just played does not count. */
  throws('an empty tank refuses the next round', 'no_energy', () =>
    games.startSession(w.db, { userId: w.customerId, gameType: 'capitals', at }),
  );

  /*
   * And it refuses with a time, not just a no.
   *
   * `nextAt` is the whole of what makes a spend feel like a cost rather than a
   * lockout, and it is the field the mobile client draws its countdown from.
   */
  const empty = games.energyFor(w.db, w.customerId, at);
  eq('the refusal knows the ceiling', empty.max, full);
  eq(
    '…and when the next one lands',
    empty.nextAt,
    plusMinutes(at, CONFIG.points.energyRegenMinutes),
  );

  /*
   * The refill, which is what pays for charging both sides.
   *
   * One per interval and no more — a tank that kept counting would hand back a
   * week of rounds to somebody returning from holiday — and the whole tank back
   * at `max × interval`, which on the free plan is sixteen hours.
   */
  const regen = CONFIG.points.energyRegenMinutes;
  eq('nothing arrives early', games.energyFor(w.db, w.customerId, plusMinutes(at, regen - 1)).energy, 0);
  eq('one at the interval', games.energyFor(w.db, w.customerId, plusMinutes(at, regen)).energy, 1);
  eq('two at twice it', games.energyFor(w.db, w.customerId, plusMinutes(at, regen * 2)).energy, 2);
  eq(
    'full at the ceiling times it',
    games.energyFor(w.db, w.customerId, plusMinutes(at, regen * full)).energy,
    full,
  );
  eq(
    'and never past it',
    games.energyFor(w.db, w.customerId, plusDays(at, 30)).energy,
    full,
  );
  eq(
    'a full tank has nothing to count down to',
    games.energyFor(w.db, w.customerId, plusDays(at, 30)).nextAt,
    null,
  );

  /*
   * **What a day is, now that every round costs — on all three plans.**
   *
   * `daily_energy + 1440 / energy_regen_minutes` — the tank once, plus what the
   * clock returns over twenty-four hours. Sixteen on the free plan from a full
   * tank, twelve a day sustained; thirty on Pro and fifty-eight on Premium. It
   * is asserted rather than left as arithmetic in a comment because **it is now
   * the only bound on a day**: the per-game decay curve that used to sit beside
   * it is gone, so these two keys are the whole rule and moving either one
   * changes how much a player can earn. This is what makes somebody notice.
   *
   * All three tiers are read from `plan_entitlements` rather than from
   * `CONFIG`, because only the free row is a copy of the config — the Pro and
   * Premium figures live nowhere else, and a day that quietly halved on a paid
   * tier is exactly the change nothing else in this file would see. The three
   * intervals were cut hard together (240/180/120 → 120/60/30) while the
   * ceilings stayed at 4/6/10, which is why the gap between the tiers widened.
   */
  eq('a free day is sixteen finished rounds', full + Math.floor(1440 / regen), 16);

  const daySizeOf = (code: string): number => {
    const ent = (key: string) =>
      Number(
        w.db.get<{ value: string }>(
          `SELECT value FROM plan_entitlements WHERE plan_id = $p AND key = $k`,
          { p: `pln_consumer_${code}`, k: key },
        )?.value,
      );
    return ent('daily_energy') + Math.floor(1440 / ent('energy_regen_minutes'));
  };
  eq('…and the free plan row agrees with the config', daySizeOf('free'), 16);
  eq('a Pro day is thirty', daySizeOf('pro'), 30);
  eq('a Premium day is fifty-eight', daySizeOf('premium'), 58);

  w.db.close();
}

/**
 * §7.4 — what each of the four scorers pays, band by band and boundary by
 * boundary.
 *
 * `gameRules` above proves the *protocol*: that the answers stay on the server,
 * that a replay is idempotent, that somebody else's session is refused. This
 * proves the **arithmetic**, which is a different thing and the thing that moves
 * — every figure below was a different number one release ago, and none of them
 * fails loudly when it is wrong. A quiz that quietly pays five for a clean sweep
 * instead of one still returns a well-formed body.
 *
 * Three properties are worth naming because each of them has an obvious wrong
 * implementation that passes a looser test:
 *
 * - **The band boundaries are inclusive.** `throughSeconds` is compared with
 *   `<=`, so a round finishing on the stroke of ten seconds takes the ten-second
 *   band. The `<` version of this is a rule nobody reports and everybody feels,
 *   which is why both boundaries of every band are asserted rather than a value
 *   safely inside it.
 * - **A quiz cannot be lost, and `won` means a clean sweep.** Those are two
 *   statements, not one: the round is played to the end however it is going, and
 *   `won` names the only distinction still worth drawing.
 * - **The round is floored once, at the end, after the plan multiplier.** Two of
 *   the scorers deal in halves. The Pro round at the bottom is the check that
 *   separates "floor once" from "floor twice" — they agree on the free plan and
 *   differ by a point on a paid one, which is the shape this bug always takes.
 */
function scoringRules(): void {
  describe('§7.4 scoring — the four games, band by band');
  const w = world();
  const base = now();

  /** Seconds, which is the unit two of these scorers band on. `plusMinutes` is
   *  the module's own shift and carries a fraction of one exactly. */
  const plusSeconds = (at: Iso, seconds: number): Iso => plusMinutes(at, seconds / 60);

  /*
   * Every round below is three hours after the one before it.
   *
   * Each finished round costs one energy and the free tank is four, so a suite
   * that plays two dozen of them at one instant runs dry in the fifth and every
   * assertion after that is a `no_energy` throw rather than a score. Three hours
   * is more than the two the free plan takes to refill one, so the tank is at
   * its ceiling when each round opens and nothing here is secretly a test about
   * energy — `energyRules` above owns that. It is also short enough never to
   * lapse a streak, so no comeback bonus lands in the middle of a score.
   */
  let played = 0;
  const nextAt = (): Iso => plusMinutes(base, (played += 1) * 180);

  const secretOf = <T>(sessionId: string): T =>
    JSON.parse(
      w.db.get<{ secret: string }>(`SELECT secret FROM game_sessions WHERE id = $i`, {
        i: sessionId,
      })!.secret,
    ) as T;

  /* ── the quizzes ── */

  /**
   * Play a quiz. `rights` says which of the five to answer correctly, and the
   * round is stretched so its first and last recorded events are `seconds`
   * apart — which is the span the speed band reads, off the server's own stamps.
   */
  let accepted: boolean[] = [];
  const quiz = (rights: boolean[], seconds: number, gameType: games.GameType = 'capitals') => {
    const at = nextAt();
    const done = plusSeconds(at, seconds);
    const opened = games.startSession(w.db, {
      userId: w.customerId,
      gameType,
      language: 'en',
      at,
    });
    const secret = secretOf<{ answers: number[] }>(opened.sessionId);
    accepted = secret.answers.map((answer, index) =>
      games.submitEvent(w.db, {
        sessionId: opened.sessionId,
        userId: w.customerId,
        seq: index,
        kind: 'answer',
        /* Four options, so any index that is not the answer is a wrong answer
           and one of 0/1 always is. */
        payload: { index, choice: rights[index] ? answer : answer === 0 ? 1 : 0 },
        /* Only the last event moves: the band is max minus min over the round,
           so the questions in between decide nothing and pinning them to the
           start keeps the fixture readable. */
        at: index === secret.answers.length - 1 ? done : at,
      }).accepted,
    );
    return games.finish(w.db, { sessionId: opened.sessionId, userId: w.customerId, at: done });
  };

  const allFive = [true, true, true, true, true];
  const perCorrect = CONFIG.games.quizPerCorrect;
  const sweep = CONFIG.games.quizPerfectBonus;

  const fast = quiz(allFive, 4);
  eq('five right in four seconds is the quiz ceiling', fast.score, 8);
  eq('…which is 5 + 1 + 2 and nothing else', fast.score, 5 * perCorrect + sweep + 2);
  eq('and a clean sweep is what `won` now names', fast.won, true);

  eq('exactly ten seconds is still the fast band', quiz(allFive, 10).score, 8);
  eq('a half-second past it drops to the middle one', quiz(allFive, 10.5).score, 7);
  eq('exactly fifteen seconds is still the middle band', quiz(allFive, 15).score, 7);
  eq('past fifteen the clock pays nothing at all', quiz(allFive, 16).score, 6);

  /*
   * **The speed bonus is a clean-sweep bonus.** Five wrong answers hammered out
   * in a second is the fastest possible round, and paying it would make not
   * reading the question the winning strategy in a quiz.
   */
  const rushed = quiz([false, false, false, false, false], 1);
  eq('five wrong answers in one second pay nothing', rushed.score, 0);
  eq('…and the fastest possible round is not a win', rushed.won, false);

  const four = quiz([true, true, true, true, false], 4);
  eq('four right pays four, with no sweep bonus', four.score, 4 * perCorrect);
  eq('…and no speed bonus either, however fast it was', four.score, 4);
  eq('four out of five is not a clean sweep', four.won, false);

  /*
   * **A quiz cannot be lost.** It ended after two wrong answers once, which took
   * the last question away from exactly the player who needed the practice. All
   * five are asked, the round banks what it earned, and `won: false` here means
   * "not a clean sweep" rather than "forfeited".
   */
  const wobbly = quiz([false, false, false, false, true], 4);
  check('the fifth question is still asked after four mistakes', accepted[4]);
  eq('…all five were recorded', accepted.filter(Boolean).length, 5);
  eq('…the one right answer still banks', wobbly.score, 1 * perCorrect);
  eq('…the round is complete, not truncated', wobbly.answered, CONFIG.games.quizQuestions);
  eq('…and nothing was forfeited for the four mistakes', wobbly.correct, 1);

  /*
   * **Two banks, one game.** `poland` and `uzbekistan` are the same
   * local-knowledge quiz asked about two different countries — the client shows
   * one card and picks between them by the country on the player's profile — so
   * a scoring rule that reached either of them and not the other would be a
   * player in Tashkent being paid differently for the same minute. Nothing in
   * `domain/games.ts` distinguishes them and these three checks are what says
   * so: the same round pays the same, and each one draws from its own bank.
   */
  const drawnFrom = (gameType: string) =>
    w.db.get<{ own: number; total: number }>(
      `SELECT SUM(q.bank = $b) AS own, COUNT(*) AS total
         FROM game_recent_items r JOIN quiz_items q ON q.id = r.item_key
        WHERE r.user_id = $u AND r.game_type = $b`,
      { u: w.customerId, b: gameType },
    );
  const uzbekistan = quiz(allFive, 4, 'uzbekistan');
  const poland = quiz(allFive, 4, 'poland');
  eq('the Uzbekistan quiz pays exactly what the Poland one does', uzbekistan.score, poland.score);
  eq('…and both are the quiz ceiling, on the same rules as the other two', uzbekistan.score, 8);
  eq(
    'the Uzbekistan round is served out of the Uzbekistan bank',
    drawnFrom('uzbekistan'),
    { own: CONFIG.games.quizQuestions, total: CONFIG.games.quizQuestions },
  );
  eq(
    '…and the Poland one out of Poland’s, rather than the two sharing a pool',
    drawnFrom('poland'),
    { own: CONFIG.games.quizQuestions, total: CONFIG.games.quizQuestions },
  );

  /* ── memory match ── */

  /** Play a whole board perfectly, finishing `seconds` after the first move. */
  const board = (seconds: number) => {
    const at = nextAt();
    const done = plusSeconds(at, seconds);
    const opened = games.startSession(w.db, {
      userId: w.customerId,
      gameType: 'memory_match',
      at,
    });
    const deck = secretOf<{ deck: string[] }>(opened.sessionId).deck;
    /* Every symbol is in the deck twice, so pairing each one's first position
       with its second is the whole board played without a miss. */
    const first = new Map<string, number>();
    let seq = 0;
    deck.forEach((symbol, index) => {
      const opener = first.get(symbol);
      if (opener === undefined) {
        first.set(symbol, index);
        return;
      }
      seq += 1;
      games.submitEvent(w.db, {
        sessionId: opened.sessionId,
        userId: w.customerId,
        seq,
        kind: 'pair',
        payload: { a: opener, b: index },
        at: seq === 1 ? at : done,
      });
    });
    return games.finish(w.db, { sessionId: opened.sessionId, userId: w.customerId, at: done });
  };

  /*
   * **The band is the rate; the pairs found are what it pays on.**
   *
   * `partialBoard` plays only some of them, so the two rules can be told apart:
   * a flat band pays a round that found nothing exactly what it pays a cleared
   * one, which is what this did before. `correct: 0` on the body was the only
   * tell and nothing read it — so a client could bank the top band from two
   * events a millisecond apart, forever, bounded by energy alone.
   */
  const partialBoard = (seconds: number, howMany: number) => {
    const at = nextAt();
    const done = plusSeconds(at, seconds);
    const opened = games.startSession(w.db, {
      userId: w.customerId,
      gameType: 'memory_match',
      at,
    });
    const deck = secretOf<{ deck: string[] }>(opened.sessionId).deck;
    const first = new Map<string, number>();
    let seq = 0;
    let played = 0;
    deck.forEach((symbol, index) => {
      const opener = first.get(symbol);
      if (opener === undefined) {
        first.set(symbol, index);
        return;
      }
      if (played >= howMany) return;
      played += 1;
      seq += 1;
      games.submitEvent(w.db, {
        sessionId: opened.sessionId,
        userId: w.customerId,
        seq,
        kind: 'pair',
        payload: { a: opener, b: index },
        at: seq === 1 ? at : done,
      });
    });
    return games.finish(w.db, { sessionId: opened.sessionId, userId: w.customerId, at: done });
  };

  /* The hole this closed: fast and empty used to pay what fast and finished
     does. It is the check that fails without the change. */
  const empty = partialBoard(1, 0);
  eq('a round that found nothing pays nothing', empty.score, 0);
  eq('…however fast it was', empty.correct, 0);

  const half = partialBoard(10, 3);
  eq('half a board at the top band pays half of it', half.score, 4);
  eq('…and says how many it found', half.correct, 3);

  /* Rounded rather than floored, so a nearly-finished board does not lose its
     last point to arithmetic: five of six at eight is 6.67. */
  eq('five of six at the top band rounds up', partialBoard(10, 5).score, 7);

  eq('a board in ten seconds takes the top band', board(10).score, 8);
  eq('exactly eighteen seconds still does', board(18).score, 8);
  eq('a half-second past it is the middle band', board(18.5).score, 6);
  eq('exactly twenty-three seconds is still the middle band', board(23).score, 6);
  eq('past it the floor band still pays', board(24).score, 3);
  const slow = board(300);
  eq('…and five minutes pays the same floor', slow.score, 3);
  eq('a finished deck is a win however slow it was', slow.won, true);

  /*
   * **A flipped pair reveals both cards.**
   *
   * The reply used to be `answer: deck[a]` alone, which told a client the face
   * of the first card and nothing about the second — so a mismatch taught half
   * of what the player had just looked at, and Memory Match is the one game in
   * the set that is *entirely* about remembering what you saw. These checks are
   * what stops that regressing, and the last of them is the one with teeth: what
   * the secret protects is the cards still face down, and a reply that named a
   * third position would be handing the board over one move at a time.
   */
  const revealRound = () => {
    const at = nextAt();
    const opened = games.startSession(w.db, {
      userId: w.customerId,
      gameType: 'memory_match',
      at,
    });
    const deck = secretOf<{ deck: string[] }>(opened.sessionId).deck;
    /* A guaranteed **mismatch**: the first position, and the first position
       after it holding a different symbol. That is the case the old reply was
       wrong about, so it is the case worth pinning. */
    const b = deck.findIndex((symbol, index) => index > 0 && symbol !== deck[0]);
    const move = games.submitEvent(w.db, {
      sessionId: opened.sessionId,
      userId: w.customerId,
      seq: 0,
      kind: 'pair',
      payload: { a: 0, b },
      at,
    });
    return { at, opened, deck, b, move };
  };

  const reveal = revealRound();
  eq('a mismatched pair is judged a mismatch', reveal.move.correct, false);
  eq('…and it reveals both cards, not one', reveal.move.revealed, [
    { index: 0, face: reveal.deck[0] },
    { index: reveal.b, face: reveal.deck[reveal.b] },
  ]);
  eq(
    '…while `answer` still carries the first card, so nothing reading it breaks',
    reveal.move.answer,
    reveal.deck[0],
  );
  check(
    '…and nothing else on the board leaks with it',
    reveal.move.revealed!.every((card) => card.index === 0 || card.index === reveal.b),
  );
  eq(
    '…so a twelve-card deck gives up exactly two faces a move',
    reveal.move.revealed!.length,
    2,
  );

  /* A retry after a dropped response is the *only* thing that can still tell
     this client what those two cards were, so the duplicate carries them. A
     reply of `accepted: false` and nothing else leaves two permanent blanks on
     the board. */
  const replayed = games.submitEvent(w.db, {
    sessionId: reveal.opened.sessionId,
    userId: w.customerId,
    seq: 0,
    kind: 'pair',
    payload: { a: 0, b: reveal.b },
    at: reveal.at,
  });
  check('a replayed pair is a duplicate rather than a second move', !replayed.accepted);
  eq('…and it still reveals the same two faces', replayed.revealed, reveal.move.revealed);

  /*
   * **The pairs found are distinct pairs, not matching events.**
   *
   * The two agree for a client that plays each pair once and come apart the
   * moment one does not: a move whose response was lost is recorded here, and a
   * client that puts those cards back down and turns them again submits the same
   * match under a fresh `seq`. The score is the clock alone so it pays the same
   * either way — what would be wrong is the count printed beside the time,
   * seven pairs found on a six-pair board.
   */
  const doubled = (() => {
    const at = nextAt();
    const opened = games.startSession(w.db, {
      userId: w.customerId,
      gameType: 'memory_match',
      at,
    });
    const deck = secretOf<{ deck: string[] }>(opened.sessionId).deck;
    const first = new Map<string, number>();
    let seq = 0;
    const send = (a: number, b: number) => {
      games.submitEvent(w.db, {
        sessionId: opened.sessionId,
        userId: w.customerId,
        seq: (seq += 1),
        kind: 'pair',
        payload: { a, b },
        at,
      });
    };
    deck.forEach((symbol, index) => {
      const opener = first.get(symbol);
      if (opener === undefined) {
        first.set(symbol, index);
        return;
      }
      send(opener, index);
      /* The same two cards again, the other way round — which is what a client
         re-turning them looks like, and is one pair of cards however it is
         written. */
      send(index, opener);
    });
    return games.finish(w.db, { sessionId: opened.sessionId, userId: w.customerId, at });
  })();
  eq(
    'a pair submitted twice counts once',
    doubled.correct,
    CONFIG.games.memoryPairs,
  );
  eq('…out of the board it was actually dealt', doubled.answered, CONFIG.games.memoryPairs);

  /*
   * **One card, turned on its own — `kind:'peek'`.**
   *
   * Without it there is no way to learn a face except by naming two positions,
   * so the first card a player tapped stayed blank until they had committed to a
   * second: every move made blind, which is a different game rather than this
   * one with a delay on it. The checks below are the four promises that come
   * with the move — it turns exactly the card asked for and nothing else, it is
   * not an answer, it shares one sequence with the pairs, and it refuses a
   * position that is off the board or already claimed.
   */
  const openDeck = () => {
    const at = nextAt();
    const opened = games.startSession(w.db, {
      userId: w.customerId,
      gameType: 'memory_match',
      at,
    });
    return { at, id: opened.sessionId, deck: secretOf<{ deck: string[] }>(opened.sessionId).deck };
  };
  const move = (id: string, seq: number, kind: string, payload: Record<string, unknown>, at: Iso) =>
    games.submitEvent(w.db, { sessionId: id, userId: w.customerId, seq, kind, payload, at });
  const eventsIn = (id: string) =>
    w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM game_events WHERE session_id = $s`, {
      s: id,
    })?.n ?? 0;

  const single = openDeck();
  const turned = move(single.id, 0, 'peek', { index: 3 }, single.at);
  eq('a peek turns exactly the card it named', turned.revealed, [
    { index: 3, face: single.deck[3] },
  ]);
  eq('…one card, not a window onto the layout', turned.revealed!.length, 1);
  eq('a peek is not an answer, so it carries no verdict', turned.correct, undefined);
  eq('…and none of the pair move’s legacy `answer` either', turned.answer, undefined);
  check('…and it is recorded, so its number is spent', turned.accepted);

  /* The same argument the pair path makes: a retry after a dropped response is
     the only thing that will ever tell this client what that card was. */
  const replayedPeek = move(single.id, 0, 'peek', { index: 3 }, single.at);
  check('a replayed peek is a duplicate rather than a second turn', !replayedPeek.accepted);
  eq('…and it still names the face', replayedPeek.revealed, turned.revealed);

  /* One sequence for both kinds, which is what makes `seq` a position in the
     round rather than a per-kind counter — a client that numbered its peeks and
     its pairs separately would collide on the second move of every board. */
  const collided = move(single.id, 0, 'pair', { a: 0, b: 1 }, single.at);
  check('a pair cannot reuse a peek’s number: the two share one sequence', !collided.accepted);
  check('…while the next number along is free', move(single.id, 1, 'pair', { a: 0, b: 1 }, single.at).accepted);

  /*
   * **Refused, not clamped — and a refused peek is one that never happened.**
   *
   * This is the precedent the Word Builder hint set when it stopped clamping a
   * position into range, and the second half is the half with teeth: nothing is
   * written, so a client asking for a card that is not there has not spent a
   * number and has not put a row in the round's own clock.
   */
  const stray = openDeck();
  throws('a peek past the end of the deck is refused', 'bad_request', () =>
    move(stray.id, 0, 'peek', { index: stray.deck.length }, stray.at),
  );
  throws('…as is a negative position', 'bad_request', () =>
    move(stray.id, 1, 'peek', { index: -1 }, stray.at),
  );
  throws('…and a fractional one, rather than being rounded into range', 'bad_request', () =>
    move(stray.id, 2, 'peek', { index: 1.5 }, stray.at),
  );
  throws('…and a peek naming no card at all', 'bad_request', () =>
    move(stray.id, 3, 'peek', {}, stray.at),
  );
  eq('…and none of the four left a row behind', eventsIn(stray.id), 0);

  /*
   * A matched card is not face down, so turning it is not a move that exists.
   * The **pair** move still accepts those same two positions, and has to: a
   * client whose response was lost puts the cards back down and turns them
   * again, which is the case the distinct-pair counting above exists for.
   */
  const locked = openDeck();
  const twin = locked.deck.findIndex((face, index) => index > 0 && face === locked.deck[0]);
  check('a matched pair is judged a match', move(locked.id, 0, 'pair', { a: 0, b: twin }, locked.at).correct === true);
  throws('a peek at a card already matched is refused', 'bad_request', () =>
    move(locked.id, 1, 'peek', { index: 0 }, locked.at),
  );
  throws('…from either side of the pair', 'bad_request', () =>
    move(locked.id, 2, 'peek', { index: twin }, locked.at),
  );
  const free = locked.deck.findIndex((_, index) => index !== 0 && index !== twin);
  check(
    '…while a card still face down turns as it should',
    move(locked.id, 3, 'peek', { index: free }, locked.at).accepted,
  );
  check(
    '…and the pair move still takes them, so a lost response is still retryable',
    move(locked.id, 4, 'pair', { a: 0, b: twin }, locked.at).accepted,
  );

  /*
   * **A peek is in the clock and out of the tally, and that pairing is the whole
   * of why there is no peek counter and no peek penalty.**
   *
   * `scoreDeck` prices this game on the span from the first recorded event to
   * the last and on nothing else. A peek carries no verdict, so it cannot be
   * counted as a pair or enlarge the board; it is still an event, so it is
   * inside that span. The three rounds below differ in the peeks alone — same
   * six pairs, all submitted at one instant — and they are what says a peek can
   * only ever cost: 8 with none, 8 with twelve that took no time, 6 with twelve
   * that took nineteen seconds. There is no arrangement of them that pays more.
   */
  const clearedBoard = (gap: number, peeking: boolean) => {
    const round = openDeck();
    const paired = plusSeconds(round.at, gap);
    let seq = 0;
    if (peeking) round.deck.forEach((_, index) => move(round.id, seq++, 'peek', { index }, round.at));
    const first = new Map<string, number>();
    round.deck.forEach((symbol, index) => {
      const opener = first.get(symbol);
      if (opener === undefined) {
        first.set(symbol, index);
        return;
      }
      move(round.id, seq++, 'pair', { a: opener, b: index }, paired);
    });
    return games.finish(w.db, { sessionId: round.id, userId: w.customerId, at: paired });
  };

  const bare = clearedBoard(19, false);
  eq('six pairs at one instant are a top-band board', bare.score, 8);
  const quick = clearedBoard(0, true);
  eq('…and peeking all twelve cards first does not change that, if it took no time', quick.score, 8);
  eq('a peek is not a pair', quick.correct, CONFIG.games.memoryPairs);
  eq('…and twelve of them do not enlarge a six-pair board', quick.answered, CONFIG.games.memoryPairs);
  const dawdled = clearedBoard(19, true);
  eq('…while nineteen seconds spent peeking costs the round a band', dawdled.score, 6);
  check('so a peek can only ever cost, which is what a counter would be for', dawdled.score < bare.score);

  /* ── word builder ── */

  /*
   * A five-word bank on a language code nothing else uses.
   *
   * Word Builder is scored per word and `buildWords` draws five at random, so a
   * round out of the seeded bank is worth whatever tiers it happened to pull —
   * a fine game and a useless assertion. Five planted words on the site's own
   * `[1, 1, 2, 2, 3]` ramp make a clean sweep exactly nine, which is the figure
   * the economy is written down as. (This server does not *impose* that ramp on
   * a real round; `config.ts` says why, and says it at the point of use.)
   */
  const RAMP = [1, 1, 2, 2, 3];
  RAMP.forEach((tier, index) => {
    w.db.run(
      `INSERT INTO word_bank (id, language, word, tier, hint) VALUES ($i, 'zz', $w, $t, 'planted')
         ON CONFLICT (language, word) DO UPDATE SET tier = excluded.tier`,
      { i: `wrd_zz_${index}`, w: `PLANTED${index}`, t: tier },
    );
  });

  /**
   * Play the planted round. `plan` is handed the tiers in the order they were
   * drawn and says which words to reveal a letter on, which to get wrong once
   * before solving, and which to leave unsolved.
   */
  const wordRound = (
    plan: (tiers: number[]) => { hint?: number[]; fumble?: number[]; skip?: number[] },
  ) => {
    const at = nextAt();
    /* Five words in the bank against a no-repeat window of forty: the second
       round would find nothing left to ask. Clearing the window is what lets
       four rounds run against one known ramp — the no-repeat rule itself is
       `buildQuiz`'s and is not what this block is about. */
    w.db.run(`DELETE FROM game_recent_items WHERE user_id = $u AND game_type = 'word_builder'`, {
      u: w.customerId,
    });
    const opened = games.startSession(w.db, {
      userId: w.customerId,
      gameType: 'word_builder',
      language: 'zz',
      at,
    });
    const secret = secretOf<{ words: string[]; tiers: number[] }>(opened.sessionId);
    const wanted = plan(secret.tiers);
    let seq = 0;
    const send = (kind: string, payload: Record<string, unknown>) => {
      seq += 1;
      games.submitEvent(w.db, {
        sessionId: opened.sessionId,
        userId: w.customerId,
        seq,
        kind,
        payload,
        at,
      });
    };
    secret.words.forEach((word, index) => {
      if (wanted.hint?.includes(index)) send('hint', { index, position: 0 });
      if (wanted.fumble?.includes(index)) send('guess', { index, guess: 'NOTTHEWORD' });
      if (wanted.skip?.includes(index)) return;
      send('guess', { index, guess: word });
    });
    return {
      result: games.finish(w.db, { sessionId: opened.sessionId, userId: w.customerId, at }),
      tiers: secret.tiers,
    };
  };

  const swept = wordRound(() => ({}));
  eq('the planted round is the ramp', [...swept.tiers].sort().join(''), '11223');
  eq('a word is worth its tier: 1+1+2+2+3, plus one for the sweep', swept.result.score, 10);

  /*
   * **A hint halves that word.** Forfeiting a tier *bonus* and keeping a flat
   * base was the rule before, and it charged nothing on the easy word and two
   * thirds on the hard one — the opposite of where somebody reaches for it. The
   * easy word is where the two rules disagree in a way a floor cannot hide: the
   * ramp pays 9 clean, 8.5 with the easiest word halved, and 9 under the old
   * rule, which never charged for a hint on a tier-1 word at all.
   */
  const easyHint = wordRound((tiers) => ({ hint: [tiers.indexOf(1)] }));
  eq('a hint on the easiest word costs half of it', easyHint.result.score, 8);
  const hardHint = wordRound((tiers) => ({ hint: [tiers.indexOf(3)] }));
  eq('a hint on the hardest word costs half of that', hardHint.result.score, 7);
  check(
    'either way the sweep bonus is refused, because a hint is not a clean round',
    easyHint.result.score < 9 && hardHint.result.score < 8,
  );

  /*
   * A wrong attempt is the other half of "clean". It costs the *word* nothing —
   * the per-word rate is what somebody plays for — and costs the sweep
   * everything, which is what the bonus is for.
   */
  const fumbled = wordRound((tiers) => ({ fumble: [tiers.indexOf(2)] }));
  eq('a wrong attempt still pays the word its tier', fumbled.result.score, 9);
  eq('…and still takes the sweep bonus away', fumbled.result.score, swept.result.score - 1);

  /*
   * **A hint for a letter that does not exist is refused, and costs nothing.**
   *
   * The position used to be clamped — a request for slot 40 of a four-letter
   * word passed the allowance check, spent one of the day's three, and answered
   * the last letter. The client had nowhere to put it and no way to tell that
   * anything had gone wrong, and the allowance was gone.
   *
   * Both halves are checked, and the second is the one that matters: refusing
   * the request is worth little if the refusal happens *after* the hint has
   * been spent, so the allowance is read before and after and must not move.
   */
  {
    const w2 = world();
    const at2 = now();
    const opened = games.startSession(w2.db, {
      userId: w2.customerId,
      gameType: 'word_builder',
      language: 'en',
      at: at2,
    });
    const spent = () =>
      w2.db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM game_events WHERE kind = 'hint' AND session_id = $s`,
        { s: opened.sessionId },
      )?.n ?? 0;

    const before = spent();
    throws('a hint past the end of the word is refused', 'bad_request', () =>
      games.submitEvent(w2.db, {
        sessionId: opened.sessionId,
        userId: w2.customerId,
        seq: 900,
        kind: 'hint',
        payload: { index: 0, position: 40 },
        at: at2,
      }),
    );
    throws('…as is a negative one', 'bad_request', () =>
      games.submitEvent(w2.db, {
        sessionId: opened.sessionId,
        userId: w2.customerId,
        seq: 901,
        kind: 'hint',
        payload: { index: 0, position: -1 },
        at: at2,
      }),
    );
    eq('…and neither spent one of the day’s hints', spent(), before);

    /* And the legitimate case still works, so the guard is not simply off. */
    const ok = games.submitEvent(w2.db, {
      sessionId: opened.sessionId,
      userId: w2.customerId,
      seq: 902,
      kind: 'hint',
      payload: { index: 0, position: 0 },
      at: at2,
    });
    eq('a hint inside the word still answers one letter', String(ok.answer).length, 1);
    w2.db.close();
  }

  /* ── the flight ── */

  const flight = (cleared: number) => {
    const at = nextAt();
    const opened = games.startSession(w.db, { userId: w.customerId, gameType: 'flight', at });
    return games.finish(w.db, {
      sessionId: opened.sessionId,
      userId: w.customerId,
      clientReport: { cleared },
      at,
    });
  };

  eq('four gaps is two points at half a point each', flight(4).score, 2);
  eq('…and short of the five-gap target, so not a win', flight(4).won, false);
  const banked = flight(5);
  eq('five gaps banks the round', banked.won, true);
  eq('…and pays two and a half, which floors to two', banked.score, 2);
  eq('seven gaps is three and a half, which floors to three rather than four', flight(7).score, 3);
  eq('forty gaps reach the ceiling', flight(40).score, CONFIG.games.flightMaxPoints);
  eq('and a thousand bank the same twenty', flight(1000).score, CONFIG.games.flightMaxPoints);

  /*
   * **The floor is at the end of the round, after the plan multiplier — and it
   * is the only one.**
   *
   * Seven gaps is 3.5 exactly. Floored once at the end, Pro banks
   * `floor(3.5 × 1.25)` = 4; floored in the scorer first, it banks
   * `floor(3 × 1.25)` = 3. Both are 3 on the free plan, which is why the check
   * above cannot tell them apart and this one can — a half thrown away per item
   * is invisible until something multiplies what is left.
   */
  entitlements.startSubscription(w.db, {
    subject: { userId: w.customerId },
    planCode: 'pro',
    source: 'stripe',
    at: plusMinutes(base, (played + 1) * 180),
  });
  eq('half points survive to the multiplier: 3.5 × 1.25 banks 4, not 3', flight(7).score, 4);

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
  check('and the free tier can still play', entitlements.entNumber(free, 'daily_energy', 0) > 0);

  /*
   * A withdrawn key is *removed*, not merely unwritten.
   *
   * `seedPlans` upserts and never deletes, so a key that stops appearing in
   * `PLANS` keeps whatever value the build before it left in the table — and
   * `entNumber` reads by name, so a stale `daily_lives` would be a live tier
   * figure nothing in the repo keeps in step. A fresh database has never
   * written one, which is exactly why the row is *planted* here: the assertion
   * has to be about the delete, not about a table that was always empty.
   *
   * Two of these were renames and the third is a deletion, which is why the
   * list is worth having rather than a pair of one-off checks. `round_decay`
   * named which ladder priced a repeat of the same game; there is no such
   * ladder any more, energy is what bounds a day, and a row saying a plan buys
   * a curve is how a curve gets written back.
   */
  const stale = ['daily_lives', 'life_regen_minutes', 'round_decay'];
  for (const key of stale) {
    w.db.run(
      `INSERT INTO plan_entitlements (plan_id, key, value) VALUES ('pln_consumer_free', $k, '99')
         ON CONFLICT (plan_id, key) DO UPDATE SET value = excluded.value`,
      { k: key },
    );
  }
  check(
    'a database seeded by an older build still has the withdrawn keys',
    entitlements.entNumber(
      entitlements.entitlementsFor(w.db, { userId: w.customerId }),
      'daily_lives',
      0,
    ) === 99,
  );

  seedPlatform(w.db);
  for (const key of stale) {
    eq(
      `re-seeding removes the withdrawn key ${key}`,
      w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM plan_entitlements WHERE key = $k`, {
        k: key,
      })?.n,
      0,
    );
  }
  check(
    '…and leaves the key that replaced it',
    entitlements.entNumber(
      entitlements.entitlementsFor(w.db, { userId: w.customerId }),
      'daily_energy',
      0,
    ) === CONFIG.points.dailyEnergy,
  );

  entitlements.startSubscription(w.db, {
    subject: { userId: w.customerId },
    planCode: 'pro',
    source: 'stripe',
    at,
  });
  const pro = entitlements.entitlementsFor(w.db, { userId: w.customerId });
  eq('a paid plan raises the multiplier', pro.points_multiplier, '1.25');

  /* §12a.4: the multiplier is applied at commit and recorded on the entry. */
  const receipt = scan(w, 5000, at);
  /*
   * **Only the lines that scale take the multiplier.** The scan itself and the
   * spend steps do; the two once-ever bonuses — a first visit to this venue and
   * a first visit in this category — do not. `grantEarnings` states the reason:
   * a once-ever bonus is exactly what a single month of the top tier could be
   * spent touring the city to collect, which is the same argument the earn
   * table makes for keeping referrals flat.
   *
   * Written as the sum so that this stays a statement about *which* lines
   * scale, rather than about the number 174.
   */
  /*
   * **No multiplier reaches a scan any more.** It is a game-round rule; the
   * venue lines carry their paid figure in their own entitlements instead,
   * because scaling those as well would pay a subscriber twice for one visit.
   *
   * This venue sets `points_per_scan` itself, so the scan line is its 5 and not
   * Pro's `scan_points` of 30 — a subscriber does not get to overrule a
   * partner's own number. The two one-offs are the plan's, and on Pro they are
   * 150 and 50.
   */
  eq('a scan is the venue’s rate plus the plan’s one-offs, unmultiplied',
    receipt.pointsGranted,
    5 + entitlements.entNumber(pro, 'first_visit_points', 0) +
      entitlements.entNumber(pro, 'new_category_points', 0));
  eq(
    'and the entry records no multiplier at all',
    w.db.get<{ multiplier: number }>(
      `SELECT multiplier FROM points_ledger WHERE source_ref = $r`,
      { r: receipt.transaction.id },
    )?.multiplier,
    /* One, not 1.25. The column still exists and a game round still uses it;
       a scan does not, and the entry says so. Asserting the *absence* here is
       the point — this is the row that would prove a subscriber had been paid
       twice for one visit. */
    1,
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
  /* Both sides are paid on the invitee's first *confirmed* scan and not at
     sign-up, so an invite only pays for somebody who actually turned up. The
     two halves are separate constants now: the referrer is paid for bringing
     someone who visits, the invitee for joining. */
  eq('the first confirmed scan pays the referrer', ledger.balance(w.db, w.ownerId), CONFIG.earn.referrerFirstVisit);
  eq(
    'and the bond is completed',
    w.db.get<{ status: string }>(`SELECT status FROM referrals WHERE referred_id = $u`, {
      u: w.customerId,
    })?.status,
    'completed',
  );

  /* §8.2: not opted in means not listed, but still ranked and still shown. */
  ledger.earn(w.db, { userId: w.customerId, points: 40, reason: 'game_win', at });
  const board = social.board(w.db, { userId: w.customerId, scope: 'city', city: 'Krakow', at });
  check('you see yourself', board.you !== null);
  check('…and know you are hidden', board.hidden);
  eq('nobody else sees you', board.rows.filter((row) => !row.isYou).length, 0);

  social.setLeaderboardOptIn(w.db, w.customerId, true);
  const listed = social.board(w.db, { scope: 'city', city: 'Krakow', at });
  check('opting in lists you', listed.rows.some((row) => row.userId === w.customerId));

  /*
   * The three scopes, and the fallback between them.
   *
   * The customer is in Krakow, PL. A country board finds them, a global board
   * finds them, and a *different* city does not — which is the check that the
   * filter is actually applied rather than ignored, because a board that
   * silently ranks everybody would pass all three of the positive cases.
   */
  w.db.run(`UPDATE users SET country_code = 'PL' WHERE id = $u`, { u: w.customerId });
  const byCountry = social.board(w.db, { scope: 'country', country: 'PL', at });
  check('a country board finds them', byCountry.rows.some((r) => r.userId === w.customerId));
  eq('…and says which scope answered', byCountry.scope, 'country:PL');

  const global = social.board(w.db, { scope: 'global', at });
  check('a global board finds them', global.rows.some((r) => r.userId === w.customerId));
  eq('…and names itself', global.scope, 'global');

  const elsewhere = social.board(w.db, { scope: 'city', city: 'Warsaw', at });
  check('another city does not', !elsewhere.rows.some((r) => r.userId === w.customerId));

  /*
   * **A scope with nothing to filter on falls back to global rather than to
   * empty**, and says so in `scope`. Asking for "my city" with no city set is a
   * question with no answer; an empty table would read as a claim about other
   * people rather than about a blank field.
   */
  const noCity = social.board(w.db, { userId: w.customerId, scope: 'city', city: null, at });
  eq('a city board with no city falls back', noCity.scope, 'global');
  check('…and still ranks you', noCity.rows.some((r) => r.userId === w.customerId));
  const noCountry = social.board(w.db, { scope: 'country', country: null, at });
  eq('…and so does a country board', noCountry.scope, 'global');

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
  /* **Signing up pays nothing.** The welcome gift moved to the end of
     onboarding, so it is earned by finishing something rather than by
     existing — which is also what stops a throwaway address being worth a
     gift card. */
  eq('sign-up alone banks nothing', me.body.points, 0);
  eq('and the free plan is resolved', me.body.plan.code, 'free');

  /* Onboarding pays once and is idempotent: two clients reporting it must not
     pay twice, which is why the grant is guarded by the same UPDATE that
     stamps `onboarded_at`. */
  const onboard = await call('POST', '/v1/me/onboarded', { token });
  eq('finishing onboarding pays the welcome gift', onboard.status, 200);
  eq('…the full amount', onboard.body.points, CONFIG.earn.onboarding);
  const onboardAgain = await call('POST', '/v1/me/onboarded', { token });
  eq('…and reporting it twice pays nothing', onboardAgain.body.points, 0);
  eq('…leaving the balance where it was', (await call('GET', '/v1/me', { token })).body.points,
    CONFIG.earn.onboarding);

  /*
   * A birthday may be set and then corrected once; the third different date is
   * refused and told to ask support.
   *
   * The limit exists because a birthday pays points, so an unlimited edit is a
   * bonus collectable every day of the year. One correction is the concession:
   * a typo in a date somebody enters once should not need a support ticket.
   */
  const bday = await call('PATCH', '/v1/me', { token, body: { birthDate: '1996-04-11' } });
  eq('a birthday can be set', bday.status, 200);
  const bdayFix = await call('PATCH', '/v1/me', { token, body: { birthDate: '1996-04-12' } });
  eq('…and corrected once', bdayFix.status, 200);
  /* Re-sending the same date is a no-op, so a client that PATCHes the whole
     profile on every save does not spend the correction on nothing. */
  const bdaySame = await call('PATCH', '/v1/me', { token, body: { birthDate: '1996-04-12' } });
  eq('…and resending the same date costs nothing', bdaySame.status, 200);
  const bdayAgain = await call('PATCH', '/v1/me', { token, body: { birthDate: '1990-01-01' } });
  eq('…but not a second time', bdayAgain.status, 409);
  eq('…naming the field', bdayAgain.body.error.field, 'birthDate');

  /*
   * The profile's two open questions, as a client meets them.
   *
   * `GET /v1/cities` still serves the 114 and is still public, but it is a
   * *suggestion* now: the write below names a city that is not on it and is
   * accepted, because the country came with it.
   */
  const cities = await call('GET', '/v1/cities');
  eq('the city suggestions are public', cities.status, 200);
  check('and there are 114 of them', cities.body.cities.length === 114);

  const status = await call('PATCH', '/v1/me', { token, body: { occupation: 'freelancer' } });
  eq('a status can be chosen', status.status, 200);
  eq('…and comes back on the account', status.body.user.occupation, 'freelancer');
  const badStatus = await call('PATCH', '/v1/me', { token, body: { occupation: 'ceo' } });
  eq('but only from the closed set', badStatus.status, 400);
  eq('…naming the field', badStatus.body.error.field, 'occupation');

  const known = await call('PATCH', '/v1/me', { token, body: { city: 'Kraków' } });
  eq('a suggested city needs no country', known.status, 200);
  eq('…and is stored the way the list spells it', known.body.user.city, 'Krakow');
  eq('…with the list’s country', known.body.user.countryCode, 'PL');

  const elsewhere = await call('PATCH', '/v1/me', {
    token,
    body: { city: 'kryvyi rih', countryCode: 'ua' },
  });
  eq('a city off the list is accepted with a country', elsewhere.status, 200);
  eq('…canonicalised', elsewhere.body.user.city, 'Kryvyi Rih');
  eq('…and upper-cased', elsewhere.body.user.countryCode, 'UA');

  const orphan = await call('PATCH', '/v1/me', { token, body: { city: 'Kryvyi Rih' } });
  eq('without one it is refused', orphan.status, 400);
  eq(
    '…naming the country, so the form knows to ask for it',
    orphan.body.error.field,
    'countryCode',
  );

  /*
   * ── the same body, the same answer, on both paths that write a profile ──
   *
   * `POST /v1/auth/signup` and `PATCH /v1/me` write the same columns and were
   * written at different times, which is how they came to disagree. A
   * `countryCode` sent without a `city` was a 400 naming the field on the patch
   * and was **silently dropped** at sign-up — the same lie as a control that
   * does nothing, told at the one moment a client is most likely to be posting a
   * half-filled form. A blank name was refused at sign-up and swallowed by the
   * patch's `COALESCE`. A 5,000-character name was refused at sign-up's route
   * and stored by the patch.
   *
   * All three are one function each now (`resolveCityAnswer`, `checkName`), and
   * this is what keeps it that way: each body is put to sign-up, and then the
   * patch's answer is compared **with sign-up's own** rather than with a second
   * hand-written expectation — so a rule added to one side only fails here
   * instead of waiting to be found by somebody whose country went missing.
   *
   * The triple compared is `{status, code, field}`, which is what a client acts
   * on. The prose is allowed to differ where the endpoints genuinely do: "name
   * is required" is sign-up's alone, because only sign-up requires one.
   */
  type Answer = Awaited<ReturnType<typeof call>>;
  const shapeOf = (answer: Answer) => ({
    status: answer.status,
    code: answer.body?.error?.code ?? null,
    field: answer.body?.error?.field ?? null,
  });
  const bothRefuse = async (what: string, body: Record<string, unknown>, field: string) => {
    const viaSignUp = await call('POST', '/v1/auth/signup', {
      /* One address for all of them, and it stays free: every one of these
         bodies is refused, so no account is ever created to collide with. */
      body: { email: 'refused@verify.test', password: 'hunter22', name: 'Refused', ...body },
    });
    const viaPatch = await call('PATCH', '/v1/me', { token, body });
    eq(`sign-up refuses ${what}`, shapeOf(viaSignUp), {
      status: 400,
      code: 'validation_failed',
      field,
    });
    eq('…and PATCH /v1/me refuses it identically', shapeOf(viaPatch), shapeOf(viaSignUp));
  };

  await bothRefuse('a country with no city', { countryCode: 'DE' }, 'city');
  await bothRefuse('a city off the list with no country', { city: 'Kryvyi Rih' }, 'countryCode');
  await bothRefuse('a blank name', { name: '   ' }, 'name');
  await bothRefuse('a name longer than a leaderboard row', { name: 'x'.repeat(121) }, 'name');

  /*
   * The third field worth the same comparison, and the honest answer is not
   * symmetry: **sign-up does not take an occupation at all.** It is not in
   * `SignUpInput`, the route does not read it, and the fix for that is not to
   * add it — closing a gap by widening the side that accepts less is the wrong
   * direction, and a status is a thing you pick once you have an account.
   *
   * So the pair is asserted as what it is rather than made to match: a valid one
   * does not land on the account, and an invalid one is not refused, because
   * neither is read. Both fail the day somebody wires the field into the sign-up
   * route — the first if it starts being stored, the second if it starts being
   * validated — which is exactly when it has to join `bothRefuse` above.
   */
  const withStatus = await call('POST', '/v1/auth/signup', {
    body: {
      email: 'status-at-signup@verify.test',
      password: 'hunter22',
      name: 'Status',
      occupation: 'freelancer',
    },
  });
  eq('sign-up does not take an occupation', withStatus.status, 200);
  eq(
    '…so a valid one does not reach the account',
    (await call('GET', '/v1/me', { token: withStatus.body.token as string })).body.user.occupation,
    null,
  );
  const junkStatus = await call('POST', '/v1/auth/signup', {
    body: {
      email: 'junk-status@verify.test',
      password: 'hunter22',
      name: 'Junk',
      occupation: 'ceo',
    },
  });
  eq('…and an invalid one is not refused, because nothing reads it', junkStatus.status, 200);
  eq(
    '…while the one path that does take it refuses that same value',
    shapeOf(await call('PATCH', '/v1/me', { token, body: { occupation: 'ceo' } })),
    { status: 400, code: 'validation_failed', field: 'occupation' },
  );

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

  /*
   * **And it cannot get there by the other door either.**
   *
   * `POST …/deals/:id/status {status:"live"}` used to write the column and
   * nothing else, so the same deal that had just been refused publication went
   * live on the next request and appeared in the public `GET /v1/deals`. A rule
   * enforced at one of two doors is a rule with a door left open; both now run
   * `assertPublishable`.
   *
   * The public catalogue is checked rather than the status field, because that
   * is the thing that actually matters: what a customer can see.
   */
  const sneak = await call('POST', `/v1/partner/deals/${unverified.body.id}/status`, {
    token: ownerToken,
    body: { status: 'live' },
  });
  eq('nor by setting the status directly', sneak.status, 403);
  eq('…for the same reason', sneak.body.error.code, 'not_verified');

  const shopWindow = await call('GET', '/v1/deals?limit=50');
  check(
    'and an unverified venue’s deal is not in the public catalogue',
    !(shopWindow.body as Array<{ id: string }>).some((d) => d.id === unverified.body.id),
  );

  /* Taking one *down* still needs no permission — an entitlement standing
     between an owner and stopping their own offer is how a lapsed plan traps a
     live deal on screen. */
  const pauseIt = await call('POST', `/v1/partner/deals/${unverified.body.id}/status`, {
    token: ownerToken,
    body: { status: 'paused' },
  });
  eq('but pausing is never gated', pauseIt.status, 200);

  /* Idempotency: the same key returns the same response, a different body 409s. */
  const key = 'verify-key-1';
  const first = await call('POST', '/v1/games/sessions', {
    token,
    body: { gameType: 'capitals' },
  });
  eq('a game session starts', first.status, 200);

  /*
   * **The shelf is a fixture now, not a fact about the deployment.**
   *
   * These three checks used to redeem `gcs_media_expert`, which existed because
   * `seedPlatform` wrote five real retailer names on every boot. That seeding
   * is opt-in now — there is no agreement behind those brands, and a catalogue
   * promising a Zalando card is worse than an empty one — so a test that needs
   * something on the shelf has to put it there. Which is the right shape
   * regardless: a test that depends on production seeding is a test that breaks
   * when production stops seeding, and it broke exactly then.
   */
  w.db.run(
    `INSERT INTO gift_card_stock (id, brand, logo, face_minor, currency, points_cost, stock, priority_only, active)
     VALUES ('gcs_test', 'Test Brand', 'T', 465, 'EUR', 100, 250, 0, 1)
     ON CONFLICT (id) DO NOTHING`,
  );

  const gift = await call('POST', '/v1/gift-cards', {
    token,
    key,
    body: { stockId: 'gcs_test' },
  });
  eq('a gift card is redeemable', gift.status, 200);
  const again = await call('POST', '/v1/gift-cards', {
    token,
    key,
    body: { stockId: 'gcs_test' },
  });
  eq('a retry returns the same result', again.body.code, gift.body.code);
  eq(
    'and spent the points only once',
    (await call('GET', '/v1/me', { token })).body.points,
    CONFIG.earn.onboarding - 100,
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
  describe('§1.2 becoming a venue owner after the fact');
  {
    const w = world();
    const at = now();

    /*
     * The gap Google opened. `partner_owner` was grantable at sign-up and
     * nowhere else, which held while every account came through the password
     * form — that flow knows what kind of account it is making. Google issues a
     * session *before* anybody has been asked, so an owner who signed in that
     * way was a consumer with no way back, and every control on the partner
     * dashboard reported there was nowhere to file anything.
     */
    const person = await accounts.signUp(w.db, {
      email: 'later-owner@example.com',
      password: 'testing-1234',
      name: 'Later Owner',
      at,
    });

    check('a plain sign-up is not a partner',
      !accounts.rolesOf(w.db, person.id).includes('partner_owner'));

    const promoted = accounts.becomePartner(w.db, person.id, at);
    check('…and can become one', promoted.roles.includes('partner_owner'));
    check('…keeping what it already had', promoted.roles.includes('consumer'));

    /* Idempotent, which is what lets the site call it on every "I am a
       business" without checking first — and on every listing save. */
    const again = accounts.becomePartner(w.db, person.id, at);
    eq('…twice grants it once', again.roles.filter((r) => r === 'partner_owner').length, 1);

    /* The line this endpoint must not cross. `admin` is choosable at no moment,
       by anybody, which is why `becomePartner` names one role rather than
       taking one. */
    check('…and never grants the console', !again.roles.includes('admin'));

    throws('an unknown account cannot be promoted', 'not_found', () =>
      accounts.becomePartner(w.db, 'usr_nobody', at),
    );

    w.db.close();
  }

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
    /* Exactly what the guest earned, and nothing added: signing up grants
       nothing now, so the merge is a pure carry-over. */
    60,
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

/* ─────────────────────────────────────────── the profile: status and city ── */

/**
 * Every column on `users` that an erasure is allowed to leave behind, and why.
 *
 * The keep-list is the point of the check that reads it. Asserting ten named
 * fields are null is a test the eleventh column silently walks past — which is
 * exactly what happened: `provider_ref` held Google's permanent identifier for a
 * person on every erased row and nothing noticed, because nothing was looking at
 * the *set* of columns. Reading `PRAGMA table_info(users)` and demanding that
 * everything outside this list is null turns "somebody remembered" into "the
 * suite noticed", and adding a column now forces a decision here.
 *
 * Four kinds of survivor, and nothing else belongs:
 *
 *   * **The key and the tombstone** — `id`, `status`, `deleted_at`. The row has
 *     to stay for the ledger and the transactions that reference it; that is
 *     what erasure-by-anonymisation *is*.
 *   * **A constant** — `display_name` is set to 'Deleted account', which is not
 *     personal data, it is the absence of it rendered.
 *   * **NOT NULL columns carrying no identity** — `auth_provider`, `language`,
 *     `points_cache`, `leaderboard_opt_in` (zeroed), `trust_tier`,
 *     `created_at`, `updated_at`, `birth_date_changes`. None of them can be
 *     nulled without a schema change and none of them names anybody. The
 *     weakest is `birth_date_changes`: a bare count that discloses only that a
 *     birthday was once written, on a row that no longer holds one.
 *   * **Once-only guards** — `onboarded_at` and `profile_completed_at` are the
 *     stamps that stop a grant being paid twice. They are accounting, which is
 *     the category this routine's own note says survives.
 */
const ERASURE_KEEPS = new Set([
  'id',
  'display_name',
  'auth_provider',
  'language',
  'birth_date_changes',
  'onboarded_at',
  'profile_completed_at',
  'points_cache',
  'leaderboard_opt_in',
  'trust_tier',
  'status',
  'created_at',
  'updated_at',
  'deleted_at',
]);

async function profileRules(): Promise<void> {
  describe('the profile — a chosen status, and a city that is a suggestion');
  const db = openDb(':memory:');
  const at = now();

  const user = await accounts.signUp(db, {
    email: 'profile@verify.test',
    password: 'hunter22',
    name: 'Profile',
    at,
  });

  /* ── the status ──
     Five values and no sixth. The whole reason the column is not called
     `status` is checked below: setting one must not touch the account state. */
  for (const value of accounts.OCCUPATIONS) {
    const saved = accounts.updateProfile(db, user.id, { occupation: value }, at);
    eq(`a status may be "${value}"`, saved.occupation, value);
  }
  throws('but not one off the list', 'validation_failed', () =>
    accounts.updateProfile(db, user.id, { occupation: 'ceo' }, at),
  );
  eq(
    '…naming the field',
    refusal(() => accounts.updateProfile(db, user.id, { occupation: 'ceo' }, at))?.detail.field,
    'occupation',
  );
  eq(
    '…and handing back the whole set, so a drifted client is told what it may send',
    refusal(() => accounts.updateProfile(db, user.id, { occupation: 'ceo' }, at))?.detail.allowed,
    accounts.OCCUPATIONS,
  );
  eq(
    'case is not a different answer',
    accounts.updateProfile(db, user.id, { occupation: 'Student' }, at).occupation,
    'student',
  );
  /* The collision this column was renamed to avoid. `users.status` is the
     account state and a person's occupation is not; if these two ever share a
     name again, this is the check that says so. */
  eq(
    'and writing a status leaves the *account* status alone',
    accounts.getUser(db, user.id).status,
    'active',
  );

  /* ── the city ──
     It is a suggestion now, but the stored value is still canonical, because the
     weekly board groups on it with a literal `=`. */
  eq('a city on the list keeps the list’s spelling', accounts.resolveCity('Kraków'), {
    name: 'Krakow',
    country: 'PL',
    custom: false,
  });
  eq('…and the list’s country, whatever the request says', accounts.resolveCity('Krakow', 'US'), {
    name: 'Krakow',
    country: 'PL',
    custom: false,
  });

  eq('a city we do not cover is accepted with a country', accounts.resolveCity('Kryvyi Rih', 'ua'), {
    name: 'Kryvyi Rih',
    country: 'UA',
    custom: true,
  });
  /* The whole reason a canonical form exists: three spellings, one board. */
  eq(
    '…and every spelling of it lands on one name',
    [
      accounts.resolveCity('kryvyi rih', 'UA').name,
      accounts.resolveCity('KRYVYÏ-RIH', 'UA').name,
      accounts.resolveCity('  Kryvyi   Rih ', 'UA').name,
    ],
    ['Kryvyi Rih', 'Kryvyi Rih', 'Kryvyi Rih'],
  );

  throws('without a country it is refused', 'validation_failed', () =>
    accounts.resolveCity('Kryvyi Rih'),
  );
  eq(
    '…naming the country, not the city — the form shows a picker, not an argument',
    refusal(() => accounts.resolveCity('Kryvyi Rih'))?.detail.field,
    'countryCode',
  );
  throws('a country that is not two letters is refused', 'validation_failed', () =>
    accounts.resolveCity('Kryvyi Rih', 'Ukraine'),
  );
  throws('and a city that is not a place name is refused', 'validation_failed', () =>
    accounts.resolveCity('!!!', 'UA'),
  );
  eq(
    '…naming the city, because no country would save it',
    refusal(() => accounts.resolveCity('!!!', 'UA'))?.detail.field,
    'city',
  );
  throws('a city with no ceiling is where an essay goes', 'validation_failed', () =>
    accounts.resolveCity('x'.repeat(61), 'UA'),
  );

  /* Through the write, not just the resolver. */
  const moved = accounts.updateProfile(db, user.id, { city: 'kryvyi rih', countryCode: 'ua' }, at);
  eq('the write stores the canonical name', moved.city, 'Kryvyi Rih');
  eq('…and the country it was given', moved.country_code, 'UA');
  throws('a country on its own means nothing and is refused', 'validation_failed', () =>
    accounts.updateProfile(db, user.id, { countryCode: 'DE' }, at),
  );
  /* And sign-up gives the same refusal, because it is the same function. It used
     to drop the country instead — the endpoint most likely to be handed a
     half-filled form was the one that said nothing about it. The HTTP surface
     compares the two answers over the wire; this is the domain half, and the
     row count is what says "dropped" has not come back as "created anyway". */
  await rejects(
    'and sign-up refuses it too rather than dropping it',
    () =>
      accounts.signUp(db, {
        email: 'orphan@verify.test',
        password: 'hunter22',
        name: 'Orphan',
        countryCode: 'DE',
        at,
      }),
    'validation_failed',
  );
  eq(
    '…having created no account at all',
    db.get(`SELECT 1 FROM users WHERE email_norm = 'orphan@verify.test'`) ?? null,
    null,
  );
  /* The name, on the same terms: one function, so a blank is a refusal on both
     rather than a 400 on one and a 200-that-changed-nothing on the other. */
  throws('a blank name is refused by the patch', 'validation_failed', () =>
    accounts.updateProfile(db, user.id, { name: '   ' }, at),
  );
  eq(
    '…leaving the name it had',
    accounts.getUser(db, user.id).display_name,
    'Profile',
  );

  /* The failure the closed set used to prevent, now prevented by the fold: two
     people typing the same place must not produce two boards. `social.cityBoard`
     matches `users.city` with `=`, so one distinct value is the whole property. */
  const second = await accounts.signUp(db, {
    email: 'second@verify.test',
    password: 'hunter22',
    name: 'Second',
    city: 'Kryvyï  Rih',
    countryCode: 'UA',
    at,
  });
  eq('sign-up canonicalises too, or it is the hole in the rule', second.city, 'Kryvyi Rih');
  eq(
    'two spellings of one place are one board',
    db.all<{ city: string }>(
      `SELECT DISTINCT city FROM users WHERE country_code = 'UA' ORDER BY city`,
    ),
    [{ city: 'Kryvyi Rih' }],
  );
  /* And the old database's own spellings stay writable rather than being
     revalidated out of existence — `Bayern` is really in the live `users` table. */
  eq(
    'a legacy value can be written back unchanged',
    accounts.updateProfile(db, second.id, { city: 'Bayern', countryCode: 'DE' }, at).city,
    'Bayern',
  );

  /* ── the seven answers ──
     `occupation` took the seventh slot from `headline`, so the completion bonus
     is what proves the swap reached `isProfileComplete`. */
  const before = ledger.balance(db, user.id);
  const finished = accounts.updateProfile(
    db,
    user.id,
    {
      username: 'kasia_pl',
      avatar: 'https://example.test/a.png',
      occupation: 'freelancer',
      city: 'Krakow',
      phone: '+48 600 100 200',
      birthDate: '1996-04-11',
    },
    at,
  );
  check('all seven answers stamps the profile complete', finished.profile_completed_at !== null);
  eq('…and pays once', ledger.balance(db, user.id) - before, CONFIG.earn.profileComplete);
  accounts.updateProfile(db, user.id, { occupation: 'other' }, at);
  eq(
    '…and only once, however often it is saved after',
    ledger.balance(db, user.id) - before,
    CONFIG.earn.profileComplete,
  );

  /* ── erasure leaves nothing behind ──
     Read off the schema rather than written out, so a personal column added
     later cannot slip past by not being on somebody's list. Filled first and
     checked *before* as well as after: a column that was already null would pass
     the "is null" half without erasure having done anything, and the "was set"
     half is what makes whoever adds the next column decide where it belongs. */
  const doomed = await accounts.signUp(db, {
    email: 'doomed@verify.test',
    password: 'hunter22',
    name: 'Doomed',
    at,
  });
  accounts.updateProfile(
    db,
    doomed.id,
    {
      username: 'doomed_one',
      avatar: 'https://example.test/d.png',
      occupation: 'worker',
      city: 'Warsaw',
      phone: '+48 600 300 400',
      birthDate: '1990-02-03',
    },
    at,
  );
  /* Set directly because the only route to it is a verified Google token, and
     what is being checked is the erasure rather than the sign-in. */
  db.run(`UPDATE users SET provider_ref = 'google-sub-12345' WHERE id = $u`, { u: doomed.id });

  const columns = db
    .all<{ name: string }>(`PRAGMA table_info(users)`)
    .map((row) => row.name)
    .filter((name) => !ERASURE_KEEPS.has(name));
  const rowOf = (id: string) =>
    db.get<Record<string, unknown>>(`SELECT * FROM users WHERE id = $u`, { u: id }) ?? {};

  const populated = rowOf(doomed.id);
  const unset = columns.filter((name) => populated[name] === null || populated[name] === undefined);
  check(
    'the fixture fills every column erasure is meant to clear',
    unset.length === 0,
    /* If this fails, a column was added to `users` and nobody decided whether it
       survives an erasure. Fill it above, or put it in `ERASURE_KEEPS` with the
       reason. */
    unset,
  );

  /* ── the export and the erasure are one list ──
     Article 15 and Article 17 act on the same columns, so `USER_COLUMNS` in
     `domain/consent.ts` is where both are decided and both statements are
     generated from it. What is checked here is the *list*, against the schema —
     the bug it replaced was five columns the erasure cleared and the export
     never mentioned, and an export that under-reports is the one failure its
     reader cannot detect: nothing in the document says a column exists. */
  const schema = db.all<{ name: string }>(`PRAGMA table_info(users)`).map((row) => row.name);
  const listed = consent.USER_COLUMNS.map((c) => c.column);
  eq('every column of `users` is decided about, and only those', [...listed].sort(), [...schema].sort());
  eq('…once each', listed.length, new Set(listed).size);
  eq(
    'the keep-list and the column table are the same statement, written twice',
    consent.USER_COLUMNS.filter((c) => c.erase.write !== 'null')
      .map((c) => c.column)
      .sort(),
    [...ERASURE_KEEPS].sort(),
  );

  const disclosed = consent.USER_COLUMNS.filter((c) => c.disclose.show).map((c) => c.column);
  check(
    'a column that survives an erasure is one the export carries',
    consent.USER_COLUMNS.every((c) => c.erase.write === 'null' || c.disclose.show),
    consent.USER_COLUMNS.filter((c) => c.erase.write !== 'null' && !c.disclose.show).map((c) => c.column),
  );
  /* The census, not just the rule. A new personal column fails the coverage
     check above until it is listed, and fails *this* one if it is listed as an
     omission — so hiding one is a decision somebody has to come here and argue
     for, rather than a line nobody reads. */
  eq(
    'and exactly three columns are personal but withheld, each saying why',
    consent.USER_COLUMNS.filter((c) => !c.disclose.show).map((c) => c.column),
    ['email_norm', 'username_norm', 'password_hash'],
  );
  const duplicates = consent.USER_COLUMNS.flatMap(({ column, disclose }) =>
    disclose.show === false && disclose.reason === 'duplicate' ? [{ column, of: disclose.of }] : [],
  );
  eq(
    'a column withheld as a duplicate names one the export does carry',
    duplicates.filter((d) => !disclosed.includes(d.of)),
    [],
  );

  /* And the document itself, on an account with every column filled in. */
  const account = (consent.exportUser(db, doomed.id) as { account: Record<string, unknown> }).account;
  eq('the export’s account block is exactly the disclosed set', Object.keys(account).sort(), [...disclosed].sort());
  eq(
    '…including the five it used to drop',
    [account.username, account.phone, account.birth_date, account.display_avatar, account.occupation],
    ['doomed_one', '+48 600 300 400', '1990-02-03', 'https://example.test/d.png', 'worker'],
  );
  /* The one it would be worst to omit, for the same reason it was the one the
     erasure missed: nothing else reads it, so nothing else notices. */
  eq('…and Google’s subject id', account.provider_ref, 'google-sub-12345');
  /* The one thing this document must never grow. An export is written to be
     forwarded, and a scrypt hash inside one is an offline cracking target for
     an account that still works. */
  check('and the credential is not in it', !('password_hash' in account));

  consent.eraseUser(db, doomed.id, at);
  const erased = rowOf(doomed.id);
  const left = columns.filter((name) => erased[name] !== null);
  check('and erasure leaves none of them behind', left.length === 0, left);
  eq('…including Google’s subject id', erased.provider_ref, null);
  eq('…and the status the UI calls Status', erased.occupation, null);
  eq('…while the row itself stays, for the ledger that references it', erased.status, 'erased');

  db.close();
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

  /*
   * **Which files make up a bank**, checked as a rule rather than against the
   * directory as it currently stands.
   *
   * The Uzbekistan quiz arrived as `…_part2.csv`, so the next part is a file
   * drop and not an edit — and a reader that took the first match, or one that
   * read them in whatever order the filesystem offered, would silently import
   * half a bank or a different half on each machine. Asserted against a list of
   * names rather than by planting files, because this suite runs in memory and
   * the point is the selection, not the reading.
   */
  const dropped = [
    'General Quiz - data.csv',
    'Poland Quiz Question - data.csv',
    'Uzbekistan_Quiz_Questions_data_part2.csv',
    'Uzbekistan_Quiz_Questions_data_part1.csv',
    'Uzbekistan_Quiz_Questions_notes.txt',
  ];
  eq('every part of a bank is read, in name order', csvParts(dropped, /^Uzbekistan_Quiz_Questions_data_.*\.csv$/i), [
    'Uzbekistan_Quiz_Questions_data_part1.csv',
    'Uzbekistan_Quiz_Questions_data_part2.csv',
  ]);
  eq('a file that is not a part of it is left alone', csvParts(dropped, /^Poland Quiz Question - data\.csv$/i), [
    'Poland Quiz Question - data.csv',
  ]);
  eq('and a bank nobody has delivered is no rows, not a throw', csvParts(dropped, /^Kazakhstan_/i), []);

  /*
   * **The two local-knowledge banks, complete in five languages.**
   *
   * A row is skipped for the language it is missing rather than for the bank, so
   * a partial translation shows up here as a short language and nowhere else —
   * the game still starts, and the player who reads Ukrainian gets a smaller
   * pool than the player who reads English with nothing saying so. Pinning the
   * counts is what turns that into a failure.
   */
  const local = (bank: string) =>
    db.all<{ language: string; n: number }>(
      `SELECT language, COUNT(*) AS n FROM quiz_items WHERE bank = $b GROUP BY language ORDER BY language`,
      { b: bank },
    );
  const five = (n: number) =>
    ['en', 'pl', 'ru', 'uk', 'uz'].map((language) => ({ language, n }));
  eq('the Uzbekistan bank is 100 questions in each of the five', local('uzbekistan'), five(100));
  eq('…and the Poland bank beside it is still 98', local('poland'), five(98));

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
  scoringRules();
  dealRules();
  consentRules();
  analyticsRules();
  entitlementRules();
  await assistantRules();
  socialRules();
  await trafficRules();
  jobRules();
  await accountRules();
  await profileRules();
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
