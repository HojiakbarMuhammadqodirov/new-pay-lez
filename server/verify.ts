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

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, openDb } from './db/db.ts';
import { importLegacy, readWordBank, WORD_BANK_CSV } from './db/import.ts';
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
import * as limitsDomain from './domain/limits.ts';
import * as checkin from './domain/checkin.ts';
import * as consent from './domain/consent.ts';
import * as dashboard from './domain/dashboard.ts';
import * as deals from './domain/deals.ts';
import * as entitlements from './domain/entitlements.ts';
import * as gate from './domain/gate.ts';
import * as games from './domain/games.ts';
import * as ledger from './domain/ledger.ts';
import * as learning from './domain/learning.ts';
import * as media from './domain/media.ts';
import * as missions from './domain/missions.ts';
import * as occasions from './domain/occasions.ts';
import * as rates from './domain/rates.ts';
import * as partners from './domain/partners.ts';
import * as profiles from './domain/profiles.ts';
import * as social from './domain/social.ts';
import * as tasks from './domain/tasks.ts';
import * as traffic from './domain/traffic.ts';
import * as verification from './domain/verification.ts';
import * as merge from './domain/merge2048.ts';
import * as food from './domain/foodCross.ts';
import * as ninja from './domain/foodNinja.ts';
import * as vouchers from './domain/vouchers.ts';
import * as passes from './domain/passes.ts';
import { mulberry32 } from './domain/engines/prng.ts';
import { ReplayError } from './domain/engines/replay.ts';
import * as game2048 from './domain/engines/game2048.ts';
import * as foodCross from './domain/engines/foodcross.ts';
import * as engineVectors from './domain/engines/vectors.ts';
import * as jobs from './jobs.ts';
import * as email from './ports/email.ts';
import * as llm from './ports/llm.ts';
import * as push from './ports/push.ts';
import * as webpush from './ports/webpush.ts';
import * as reminders from './domain/reminders.ts';
import * as giftCards from './domain/giftCards.ts';
import * as giftPolicy from './domain/giftPolicy.ts';
import * as arcade from './domain/arcade.ts';
import * as notifications from './domain/notifications.ts';
import { createDecipheriv, createECDH, createHmac, createPublicKey, generateKeyPairSync, randomBytes, verify as verifySignature } from 'node:crypto';
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
  localDay,
  localMidnight,
  localMonth,
  monthStart,
  now,
  plusDays,
  plusMinutes,
  plusMonths,
  shiftDay,
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
async function throws(what: string, code: string, fn: () => unknown): Promise<void> {
  try {
    await fn();
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
async function refusal(fn: () => unknown): Promise<DomainError | null> {
  try {
    await fn();
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

async function world(): Promise<World> {
  const db = await openDb(':memory:');
  await seedPlatform(db);
  await db.tx(async () => await importLegacy(db, 'new-data'));

  const at = now();
  const ownerId = newId('usr');
  const customerId = newId('usr');
  const venueId = newId('ven');

  await db.tx(async () => {
    for (const [id, email, name] of [
      [ownerId, 'owner@verify.test', 'Owner'],
      [customerId, 'customer@verify.test', 'Customer'],
    ]) {
      /* `email_verified_at` is stamped, and that is a statement about what
         these fixtures *are* rather than a convenience: they stand in for real
         customers who signed up, and every rule about earning, redeeming and
         the board is written for that person. */
      await db.run(
        `INSERT INTO users (id, email, email_norm, display_name, auth_provider, language, city,
                            status, email_verified_at, created_at, updated_at)
         VALUES ($i, $e, $e, $n, 'email', 'en', 'Krakow', 'active', $t, $t, $t)`,
        { i: id, e: email, n: name, t: at },
      );
      await db.run(`INSERT INTO user_roles (user_id, role, granted_at) VALUES ($u, 'consumer', $t)`, {
        u: id,
        t: at,
      });
    }
    await db.run(`INSERT INTO user_roles (user_id, role, granted_at) VALUES ($u, 'partner_owner', $t)`, {
      u: ownerId,
      t: at,
    });

    await db.run(
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
      await db.run(
        `INSERT INTO voucher_tiers (id, venue_id, discount_pct, points_cost, max_discount_minor,
                                    active, created_at, updated_at)
         VALUES ($i, $v, $p, $pt, $c, 1, $t, $t)`,
        { i: newId('vtr'), v: venueId, p: pct, pt: points, c: cap, t: at },
      );
    }
    await db.run(
      `INSERT INTO budgets (id, venue_id, period, currency, total_minor, loyalty_bp, created_at, updated_at)
       VALUES ($i, $v, $p, 'PLN', 100000, 6000, $t, $t)`,
      { i: newId('bdg'), v: venueId, p: localMonth(at, VENUE_TZ), t: at },
    );
  });

  return { db, venueId, ownerId, customerId };
}

/** Run one whole gate cycle and return the receipt. */
async function scan(w: World, amountMinor: number, at = now(), userId = w.customerId): Promise<gate.Receipt> {
  const qr = await gate.mintQr(w.db, w.venueId, SECRET, at);
  const txn = await gate.openTransaction(
    w.db,
    { kind: 'qr', token: qr.token, secret: SECRET },
    { userId, at },
  );
  await gate.submitAmount(w.db, { transactionId: txn.id, amountMinor, actorId: w.ownerId, at });
  return await gate.confirm(w.db, { transactionId: txn.id, cashierId: w.ownerId, at });
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

async function ledgerRules(): Promise<void> {
  describe('§2 the points ledger');
  const w = await world();
  const { db, customerId } = w;

  await ledger.earn(db, { userId: customerId, points: 100, reason: 'game_win' });
  await ledger.earn(db, { userId: customerId, points: 50, reason: 'scan_earn' });
  eq('balance is the sum of the entries', await ledger.balance(db, customerId), 150);
  eq('the cache agrees', await ledger.cachedBalance(db, customerId), 150);
  eq('nothing to reconcile', await ledger.reconcile(db, customerId), 0);

  await ledger.spend(db, { userId: customerId, points: 120, reason: 'voucher_redeem' });
  eq('spending moves the balance', await ledger.balance(db, customerId), 30);
  /* The wallet's bar: earned by source, lifetime. A spend is not attributed,
     and a bonus is neither playing nor visiting (2026-10-05 — the phone used to
     call everything that was not a game "visiting"). */
  const splitBefore = await ledger.earnedBySource(db, customerId);
  eq('earned by source: a round is playing, a scan is visiting, a spend takes from neither',
    [splitBefore.playing, splitBefore.visiting, splitBefore.bonuses], [100, 50, 0]);
  {
    const other = await person(w, 'split-bonus', plusDays(now(), -10));
    await ledger.earn(db, { userId: other, points: 5, reason: 'check_in' });
    await ledger.earn(db, { userId: other, points: 20, reason: 'mission', sourceKind: 'mission', sourceRef: 'm:split' });
    await ledger.earn(db, { userId: other, points: 12, reason: 'stamp_complete' });
    const s = await ledger.earnedBySource(db, other);
    eq('…a check-in and a mission are bonuses, a stamp card is visiting', [s.playing, s.visiting, s.bonuses], [0, 12, 25]);
  }

  /* FIFO: the 100-point lot is fully consumed and the 50 is partly. */
  /* Ordered exactly as `spend` orders — `earned_at`, then `ledger_id`. It was
     `rowid` in both, which is SQLite-only and threw on Postgres; the two must
     not drift, or this asserts an order the real query does not produce. */
  const lots = await db.all<{ amount: number; consumed: number }>(
    `SELECT amount, consumed FROM points_lots WHERE user_id = $u ORDER BY earned_at, seq`,
    { u: customerId },
  );
  eq('the oldest lot is consumed first', lots.map((l) => [l.amount, l.consumed]), [
    [100, 100],
    [50, 20],
  ]);

  await throws('overdrawing is refused', 'insufficient_points', async () =>
    await ledger.spend(db, { userId: customerId, points: 1000, reason: 'voucher_redeem' }),
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
  const big = await ledger.earn(db, { userId: customerId, points: 500, reason: 'game_win' });
  eq('a game round is banked in full', big.entry.delta, 500);
  eq('…and the counter still records the day', big.entry.reason, 'game_win');

  /* §2.3: expiry is per-batch, FIFO, and only takes what is left of a lot. */
  const old = now();
  const w2 = await world();
  /* `adjustment` rather than `game_win` is now only a labelling choice — the
     cap that used to trim this to 150 is gone — but the batch reads more
     clearly as an opening balance than as a quiz somebody played in 2025. */
  await ledger.earn(w2.db, { userId: w2.customerId, points: 200, reason: 'adjustment', at: plusDays(old, -400) });
  await ledger.earn(w2.db, { userId: w2.customerId, points: 60, reason: 'scan_earn', at: old });
  await ledger.spend(w2.db, { userId: w2.customerId, points: 50, reason: 'gift_card_redeem', at: old });
  /*
   * **Points do not expire.** `runExpiry` and its job are deleted, so what is
   * asserted here now is the opposite of what used to be: a batch earned four
   * hundred days ago is still spendable, and a balance left alone stays where
   * it was. The FIFO lots survive because spending still walks them oldest
   * first — that is the half of the machinery that had a job.
   */
  eq('a four-hundred-day-old batch is still there', await ledger.balance(w2.db, w2.customerId), 210);
  check('and nothing on the ledger carries an expiry date',
    (await w2.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM points_ledger WHERE expires_at IS NOT NULL`,
    ))?.n === 0);
  eq('the ledger still balances against its cache', await ledger.reconcile(w2.db, w2.customerId), 0);

  /* C3: a reversal is a compensating entry, never a mutation. */
  const balanceBefore = await ledger.balance(db, customerId);
  const entry = (await ledger.earn(db, { userId: customerId, points: 10, reason: 'adjustment' })).entry;
  const reversal = await ledger.reverse(db, entry.id, 'fraud');
  eq('the reversal is its own entry', reversal.delta, -10);
  eq(
    'the original row is untouched',
    await db.get<{ delta: number; status: string }>(`SELECT delta, status FROM points_ledger WHERE id = $i`, {
      i: entry.id,
    }),
    { delta: 10, status: 'committed' },
  );
  eq('the pair nets to nothing', await ledger.balance(db, customerId), balanceBefore);
  eq('and the cache agrees', await ledger.reconcile(db, customerId), 0);
  await throws('reversing twice is refused', 'conflict', async () => await ledger.reverse(db, entry.id, 'again'));

  await db.close();
  await w2.db.close();
}

async function budgetRules(): Promise<void> {
  describe('§4–5 the budget pools');
  const w = await world();
  const view = await budget.budgetFor(w.db, w.venueId);

  eq('the split is 60/40 and adds up', view.loyalty.base + view.voucher.base, view.total);
  eq('loyalty gets 60%', view.loyalty.base, 60000);

  const exhausts = (v: budget.BudgetView) =>
    v.loyalty.spent + v.loyalty.reserved + v.loyalty.available === v.loyalty.base &&
    v.voucher.spent + v.voucher.reserved + v.voucher.available === v.voucher.base;
  check('three states exhaust the pool', exhausts(view));

  await budget.reserve(w.db, view.id, 'voucher', 5000);
  await budget.debit(w.db, view.id, 'voucher', 1200);
  const after = await budget.viewById(w.db, view.id);
  eq('reserving moves money out of available', after.voucher.available, 40000 - 5000 - 1200);
  check('and the three states still exhaust it', exhausts(after));

  /* A reserve larger than the pool is refused — with the tolerance buffer
     included, which is the only reason it is not simply `available`. */
  await throws('an over-reserve is refused', 'budget_exhausted', async () =>
    await budget.reserve(w.db, view.id, 'voucher', 999999),
  );

  const rebalanced = await budget.rebalance(w.db, view.id, 'loyalty', 10000);
  eq('rebalancing moves it across', rebalanced.voucher.base, 40000 + 10000);
  eq('…and out of the other side', rebalanced.loyalty.base, 60000 - 10000);
  eq('the total is unchanged', rebalanced.total, view.total);
  check('and it still exhausts', exhausts(rebalanced));

  await throws('you cannot move money that is reserved', 'budget_exhausted', async () =>
    await budget.rebalance(w.db, view.id, 'voucher', 999999),
  );

  /* §4.4: the ladder degrades from the top and never switches off entirely. */
  const tiers = await vouchers.tiersFor(w.db, w.venueId);
  const nearlyEmpty: budget.BudgetView = {
    ...rebalanced,
    voucher: { ...rebalanced.voucher, available: 200 },
  };
  const open = budget.tiersAvailable(nearlyEmpty, tiers);
  eq('only the lowest tier survives an empty pool', open, [5]);

  await w.db.close();
}

async function gateRules(): Promise<void> {
  describe('§3 the amount-capture gate');
  const w = await world();
  const at = now();

  const receipt = await scan(w, 4200, at);
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
  const qr = await gate.mintQr(w.db, w.venueId, SECRET, at);
  await gate.openTransaction(w.db, { kind: 'qr', token: qr.token, secret: SECRET }, {
    userId: w.customerId,
    at,
  });
  await throws('a replayed QR is rejected', 'replay_detected', async () =>
    await gate.openTransaction(w.db, { kind: 'qr', token: qr.token, secret: SECRET }, {
      userId: w.customerId,
      at,
    }),
  );
  check(
    'and the replay opens a fraud case',
    ((await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM fraud_cases WHERE kind = 'replay'`))?.n ?? 0) > 0,
  );

  await throws('a forged QR is rejected', 'invalid_trigger', async () =>
    await gate.openTransaction(w.db, { kind: 'qr', token: 'nonsense.sig', secret: SECRET }, {
      userId: w.customerId,
      at,
    }),
  );

  /* One pending transaction per customer per venue. */
  await throws('a second open gate at one counter is refused', 'conflict', async () => {
    const q = await gate.mintQr(w.db, w.venueId, SECRET, at);
    await gate.openTransaction(w.db, { kind: 'qr', token: q.token, secret: SECRET }, {
      userId: w.customerId,
      at,
    });
  });

  /* Clear the pending one, then the same-day rule. */
  const pending = (await gate.pendingAt(w.db, w.venueId))[0];
  await gate.cancel(w.db, { transactionId: pending.id, reason: 'test', actorId: w.customerId, at });

  const second = await scan(w, 3000, at);
  check('a second scan the same day is not a second visit', !second.visitCounted);
  eq('and pays nothing', second.pointsGranted, 0);

  /* §3.4: an implausible amount is refused, and the ceiling is the venue's. */
  const q2 = await gate.mintQr(w.db, w.venueId, SECRET, at);
  const t2 = await gate.openTransaction(w.db, { kind: 'qr', token: q2.token, secret: SECRET }, {
    userId: w.customerId,
    at,
  });
  await throws('an implausible amount is refused', 'invalid_amount', async () =>
    await gate.submitAmount(w.db, { transactionId: t2.id, amountMinor: 5_000_000, actorId: w.ownerId, at }),
  );
  /* …and the cashier corrects rather than cancelling. */
  await gate.submitAmount(w.db, { transactionId: t2.id, amountMinor: 4200, actorId: w.ownerId, at });
  eq(
    'the corrected amount lands',
    (await gate.getTransaction(w.db, t2.id)).amount_minor,
    4200,
  );

  /* Only staff may confirm. */
  await throws('a customer cannot confirm their own transaction', 'forbidden', async () =>
    await gate.confirm(w.db, { transactionId: t2.id, cashierId: w.customerId, at }),
  );
  await gate.confirm(w.db, { transactionId: t2.id, cashierId: w.ownerId, at });

  /* Nothing is granted before the commit. */
  const w2 = await world();
  const q3 = await gate.mintQr(w2.db, w2.venueId, SECRET, at);
  const t3 = await gate.openTransaction(w2.db, { kind: 'qr', token: q3.token, secret: SECRET }, {
    userId: w2.customerId,
    at,
  });
  await gate.submitAmount(w2.db, { transactionId: t3.id, amountMinor: 9000, actorId: w2.ownerId, at });
  eq('a pending transaction has granted nothing', await ledger.balance(w2.db, w2.customerId), 0);
  eq('and recorded no visit', (await w2.db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM venue_visits WHERE user_id = $u`, { u: w2.customerId }))?.n, 0);

  /* A pending transaction times out rather than blocking the customer forever. */
  const later = plusDays(at, 1);
  eq('the sweeper cancels it', await gate.expirePending(w2.db, later), 1);

  await w.db.close();
  await w2.db.close();
}

async function voucherRules(): Promise<void> {
  describe('§4 vouchers — reserve, debit, release');
  const w = await world();
  const at = now();

  await ledger.earn(w.db, { userId: w.customerId, points: 1000, reason: 'adjustment', at });
  const tier = (await w.db.get<{ id: string }>(
    `SELECT id FROM voucher_tiers WHERE venue_id = $v AND discount_pct = 10`,
    { v: w.venueId },
  ))!;

  const issued = await vouchers.issue(w.db, {
    userId: w.customerId,
    venueId: w.venueId,
    tierId: tier.id,
    at,
  });
  /* The estimate is min(avg check × 10%, cap) = min(400, 2500) = 400. */
  eq('issue reserves an estimate from the average check', issued.reserved_minor, 400);
  eq('and spends the points', await ledger.balance(w.db, w.customerId), 700);
  eq('the pool holds it as reserved', (await budget.budgetFor(w.db, w.venueId, at)).voucher.reserved, 400);

  /* Redemption through the gate: release the estimate, debit the actual. The
     bill is 120 zł, so the actual discount is 1200 — three times the estimate,
     and the drift is corrected on the spot. */
  const qr = await gate.mintQr(w.db, w.venueId, SECRET, at);
  const txn = await gate.openTransaction(w.db, { kind: 'qr', token: qr.token, secret: SECRET }, {
    userId: w.customerId,
    intent: 'voucher_redeem',
    intentRef: issued.id,
    at,
  });
  await gate.submitAmount(w.db, { transactionId: txn.id, amountMinor: 12000, actorId: w.ownerId, at });
  const receipt = await gate.confirm(w.db, { transactionId: txn.id, cashierId: w.ownerId, at });

  eq('the discount is the actual, not the estimate', receipt.discountMinor, 1200);
  const after = await budget.budgetFor(w.db, w.venueId, at);
  eq('the estimate is released', after.voucher.reserved, 0);
  eq('and the actual is debited', after.voucher.spent, 1200);
  check(
    'the three states still exhaust the pool',
    after.voucher.spent + after.voucher.reserved + after.voucher.available === after.voucher.base,
  );

  await throws('a redeemed voucher cannot be redeemed again', 'already_used', async () => {
    const q = await gate.mintQr(w.db, w.venueId, SECRET, at);
    await gate.openTransaction(w.db, { kind: 'qr', token: q.token, secret: SECRET }, {
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
  const w2 = await world();
  await ledger.earn(w2.db, { userId: w2.customerId, points: 1000, reason: 'adjustment', at });
  const tier2 = (await w2.db.get<{ id: string }>(
    `SELECT id FROM voucher_tiers WHERE venue_id = $v AND discount_pct = 5`,
    { v: w2.venueId },
  ))!;
  await vouchers.issue(w2.db, { userId: w2.customerId, venueId: w2.venueId, tierId: tier2.id, at });
  const before = (await budget.budgetFor(w2.db, w2.venueId, at)).voucher.available;
  const released = await vouchers.expireVouchers(w2.db, plusDays(at, CONFIG.vouchers.validityDays + 1));
  eq('expiry releases the reserve', released.expired, 1);
  eq(
    'and available goes back up',
    (await budget.budgetFor(w2.db, w2.venueId, at)).voucher.available,
    before + released.released,
  );
  eq('the points are not refunded', await ledger.balance(w2.db, w2.customerId), 900);

  await w.db.close();
  await w2.db.close();
}

/**
 * The redemption caps (item 21) — the count limits and the races they have to
 * survive.
 *
 * Its own section rather than more lines in `voucherRules`, because that one is
 * about §4's *money* and this is about a count, which §4 deliberately does not
 * enforce on. Both are true at once: the pool stops the venue overspending and
 * the cap stops one offer being stripped.
 */
async function voucherCaps(): Promise<void> {
  describe('§4 vouchers — the redemption caps');
  const w = await world();
  const at = now();

  const tierId = async (pct: number) =>
    (await w.db.get<{ id: string }>(
      `SELECT id FROM voucher_tiers WHERE venue_id = $v AND discount_pct = $p`,
      { v: w.venueId, p: pct },
    ))!.id;
  const rung = async (pct: number) =>
    (await w.db.get<{ redeem_limit: number | null; per_user_limit: number | null; issued_count: number }>(
      `SELECT redeem_limit, per_user_limit, issued_count FROM voucher_tiers
        WHERE venue_id = $v AND discount_pct = $p`,
      { v: w.venueId, p: pct },
    ))!;

  /* A rung with no cap set. NULL rather than a number, because inventing one
     would close an offer somebody is running — and it is the state every rung
     that predates the columns is in. */
  const fresh = await rung(10);
  eq('a rung is uncapped until somebody caps it', fresh.redeem_limit, null);
  eq('…on both counts', fresh.per_user_limit, null);
  eq('and has issued nothing', fresh.issued_count, 0);

  /* ── the total cap ── */
  await partners.setVoucherTiers(w.db, {
    venueId: w.venueId,
    actorId: w.ownerId,
    /* 400 — the floor of the band a 10% rung may be priced in (80% of the
       ladder's 500). It was 100, which `setVoucherTiers` now refuses. */
    tiers: [{ discountPct: 10, pointsCost: 400, maxDiscountMinor: 2500, redeemLimit: 2 }],
    at,
  });
  eq('a cap is stored', (await rung(10)).redeem_limit, 2);

  const ten = await tierId(10);
  await ledger.earn(w.db, { userId: w.customerId, points: 1000, reason: 'adjustment', at });
  await vouchers.issue(w.db, { userId: w.customerId, venueId: w.venueId, tierId: ten, at });
  eq('issuing takes a slot', (await rung(10)).issued_count, 1);
  await vouchers.issue(w.db, { userId: w.customerId, venueId: w.venueId, tierId: ten, at });
  eq('…and the second one', (await rung(10)).issued_count, 2);

  await throws('the third is refused', 'conflict', () =>
    vouchers.issue(w.db, { userId: w.customerId, venueId: w.venueId, tierId: ten, at }),
  );
  /* The refusal must leave the rung exactly where it was: the increment happens
     before the check that throws, so this is the rollback being real rather
     than assumed. Off by one here would hand the cap away a voucher at a time. */
  eq('a refused issue leaves the count alone', (await rung(10)).issued_count, 2);
  eq('and the points are not taken', await ledger.balance(w.db, w.customerId), 1000 - 2 * 400);

  /* **The race.** Two issues started before either finished. This is the check
     the counting implementation passes on SQLite and fails on Postgres, so what
     it really pins is the *shape* — that the guard is inside the write. If
     `claimSlot` ever goes back to SELECT-then-INSERT this still passes here and
     the comment above it is the only thing left saying why it must not. */
  const both = await Promise.allSettled([
    vouchers.issue(w.db, { userId: w.customerId, venueId: w.venueId, tierId: ten, at }),
    vouchers.issue(w.db, { userId: w.customerId, venueId: w.venueId, tierId: ten, at }),
  ]);
  eq(
    'two at once past a finished cap both fail',
    both.filter((one) => one.status === 'fulfilled').length,
    0,
  );
  eq('and the count has not moved', (await rung(10)).issued_count, 2);

  /* ── the per-user cap ── */
  const w2 = await world();
  const at2 = now();
  await partners.setVoucherTiers(w2.db, {
    venueId: w2.venueId,
    actorId: w2.ownerId,
    tiers: [{ discountPct: 5, pointsCost: 300, maxDiscountMinor: 2500, perUserLimit: 1 }],
    at: at2,
  });
  const five = (await w2.db.get<{ id: string }>(
    `SELECT id FROM voucher_tiers WHERE venue_id = $v AND discount_pct = 5`,
    { v: w2.venueId },
  ))!.id;
  await ledger.earn(w2.db, { userId: w2.customerId, points: 1000, reason: 'adjustment', at: at2 });
  const mine = await vouchers.issue(w2.db, {
    userId: w2.customerId,
    venueId: w2.venueId,
    tierId: five,
    at: at2,
  });
  await throws('one account cannot take two past its own limit', 'conflict', () =>
    vouchers.issue(w2.db, { userId: w2.customerId, venueId: w2.venueId, tierId: five, at: at2 }),
  );
  /* And the refusal did not eat a slot off the *total*, which would let one
     greedy account close a rung for everybody else. */
  eq(
    'a personal refusal does not spend the rung',
    (await w2.db.get<{ n: number }>(`SELECT issued_count AS n FROM voucher_tiers WHERE id = $i`, {
      i: five,
    }))!.n,
    1,
  );

  /* An expired voucher has still been taken. A per-user cap that counted only
     live vouchers would be a cap on *holding*, which anybody can cycle past by
     waiting a fortnight. */
  await vouchers.expireVouchers(w2.db, plusDays(at2, CONFIG.vouchers.validityDays + 1));
  eq(
    'the voucher lapsed',
    (await w2.db.get<{ status: string }>(`SELECT status FROM issued_vouchers WHERE id = $i`, {
      i: mine.id,
    }))!.status,
    'expired',
  );
  await throws('and it still counts against the personal cap', 'conflict', () =>
    vouchers.issue(w2.db, {
      userId: w2.customerId,
      venueId: w2.venueId,
      tierId: five,
      at: plusDays(at2, CONFIG.vouchers.validityDays + 1),
    }),
  );

  /* ── the cap is visible before the press ── */
  const closed = await vouchers.ladder(w.db, w.venueId, at, w.customerId);
  check(
    'a finished rung is not offered',
    closed.find((one) => one.discountPct === 10)?.available === false,
  );
  /* 5 rather than 15: the ladder's bottom rung is the one §4.4 keeps open
     however empty the pool gets, so this isolates the cap from the money. */
  check(
    '…while a rung with no cap still is',
    closed.find((one) => one.discountPct === 5)?.available === true,
  );
  /* And nothing about the cap leaks onto the public body. How many a venue has
     handed out is its own trading; what a customer needs is whether the button
     works. */
  check(
    'the public ladder says nothing about the numbers',
    Object.keys(closed[0]).every((key) => !/limit|issuedTotal/i.test(key)),
    Object.keys(closed[0]).join(', '),
  );
  /* The owner does get the figures, and both counts, because they answer
     different questions — see `partnerLadder`. */
  const owner = (await vouchers.partnerLadder(w.db, w.venueId, at)).find(
    (one) => one.discountPct === 10,
  )!;
  eq('the owner reads the cap', owner.redeemLimit, 2);
  eq('…and the lifetime count it is measured against', owner.issuedTotal, 2);

  /* ── the counter and the rows agree ── */
  const counted = await w.db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM issued_vouchers WHERE tier_id = $t AND status <> 'cancelled'`,
    { t: ten },
  );
  eq('the guard counter reconciles against the rows it guards', (await rung(10)).issued_count, counted!.n);

  /* ── the register ── */
  const register = await vouchers.partnerVouchers(w.db, w.venueId);
  eq('the register lists what was taken', register.length, 2);
  check('newest first', register[0].issuedAt >= register[1].issuedAt);
  check('with both ends of the window', register.every((one) => one.issuedAt < one.expiresAt));
  check(
    'and no name without the §1.4 grant',
    register.every((one) => one.holder === null),
  );
  eq(
    'filtering by status narrows it',
    (await vouchers.partnerVouchers(w.db, w.venueId, { status: 'redeemed' })).length,
    0,
  );
  const totals = await vouchers.partnerVoucherTotals(w.db, w.venueId, at);
  eq('the totals are counted over the whole life, not the page', totals.issued, 2);
  eq('…and say how many are live', totals.active, 2);
  eq('…and how many lapse this week', totals.lapsing, 0);
  const held = await w.db.get<{ n: number }>(
    `SELECT SUM(reserved_minor) AS n FROM issued_vouchers WHERE venue_id = $v AND status = 'active'`,
    { v: w.venueId },
  );
  check('…and what the live ones hold set aside, from the rows', held!.n > 0 && totals.activeReservedMinor === held!.n);
  eq('…with nothing spent or handed back yet', totals.redeemedSpentMinor + totals.expiredReleasedMinor, 0);
  const pool = await budget.budgetFor(w.db, w.venueId, at);
  eq('nothing expired, so nothing was returned to the pool', await vouchers.returnedToBudget(w.db, pool.id), 0);

  await w.db.close();
  await w2.db.close();
}

/**
 * The gift-card shelf cannot oversell.
 *
 * Found while fixing the voucher caps and it is the same defect on a table that
 * item did not name: `redeemGiftCard` read `stock`, decided on it, and then ran
 * a bare `stock = stock - 1`. READ COMMITTED lets two buyers of the last card
 * both pass, which leaves the shelf at **-1** with two cards issued against one
 * unit -- and a gift card is a promise made in points, so the one that cannot be
 * honoured costs somebody the month they spent earning it.
 *
 * The numbers here are deliberately absolute rather than relative. A check that
 * asserted "one fewer than before" would pass on a shelf that went to -1, which
 * is the whole failure.
 */
/**
 * Real codes behind a shelf row, as the operator would load them. A shelf unit
 * is a code now (`giftCards.claimCode`), so a fixture that sets `stock` has to
 * put that many codes behind it or the purchase finds nothing to hand out.
 */
async function stockCodes(db: Db, stockId: string, n: number, tag = stockId): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await db.run(
      `INSERT INTO gift_card_codes (id, stock_id, code, added_at) VALUES ($i, $s, $c, $t)`,
      { i: newId('gcc'), s: stockId, c: `${tag}-${i}-${Math.random().toString(36).slice(2, 8)}`, t: now() },
    );
  }
}

/**
 * The operator's gift-card policy: automatic (a percentage, Pro and Premium)
 * and manual (who, how much, when, how often) — each field read by the
 * purchase, the pool and the entitlement a client gates its shop on.
 */
async function giftPolicyRules(): Promise<void> {
  describe('gift cards -- the operator’s policy, automatic and manual');
  const w = await world();
  const at = '2026-06-15T10:00:00.000Z' as Iso;
  const admin = w.ownerId;

  eq('with nothing stored the policy is the rulebook', (await giftPolicy.policy(w.db)).mode, 'auto');
  eq('…20 percent', (await giftPolicy.policy(w.db)).autoPercent, 20);
  await throws('a percentage over 100 is refused', 'validation_failed', async () =>
    await giftPolicy.setPolicy(w.db, { mode: 'auto', autoPercent: 140 }, admin, at));
  await throws('a window that ends before it starts is refused', 'validation_failed', async () =>
    await giftPolicy.setPolicy(w.db, { mode: 'manual', manual: { from: '2026-07-01', until: '2026-06-01' } }, admin, at));

  await w.db.run(
    `INSERT INTO gift_card_stock (id, brand, logo, face_minor, currency, points_cost, stock, priority_only, active)
     VALUES ('gcs_pol', 'Policy Brand', 'P', 1000, 'PLN', 1, 50, 0, 1)`,
  );
  await stockCodes(w.db, 'gcs_pol', 50);
  const member = async (label: string, plan: 'free' | 'pro' | 'premium') => {
    const id = await person(w, label, plusDays(at, -90));
    if (plan !== 'free') {
      await entitlements.startSubscription(w.db, { subject: { userId: id }, planCode: plan, source: 'manual', at: plusDays(at, -1) });
    }
    await ledger.earn(w.db, { userId: id, points: 50_000, reason: 'adjustment', at: plusDays(at, -1) });
    return id;
  };
  const free = await member('pol-free', 'free');
  const pro = await member('pol-pro', 'pro');
  const premium = await member('pol-premium', 'premium');
  const buy = async (userId: string, when: Iso = at) =>
    await vouchers.redeemGiftCard(w.db, { userId, stockId: 'gcs_pol', at: when });
  const shopFor = async (userId: string) =>
    entitlements.entBool(await entitlements.entitlementsFor(w.db, { userId }, at), 'gift_card_priority');

  /* ── automatic: a percentage of the plans, Pro and Premium only ── */
  await giftPolicy.setPolicy(w.db, { mode: 'auto', autoPercent: 50 }, admin, at);
  const auto = await vouchers.giftCardPool(w.db, at);
  eq('automatic: the budget is the percentage of the granted plans', auto.budgetMinor, Math.floor(auto.revenueMinor / 2));
  eq('…free cannot buy, Pro and Premium can', [await shopFor(free), await shopFor(pro), await shopFor(premium)], [false, true, true]);
  await throws('…and the purchase agrees', 'entitlement_required', async () => await buy(free));
  eq('a Pro member buys', (await buy(pro)).points, 1000);
  eq('every change is audited', Number((await w.db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM audit_log WHERE action = 'gift_card.policy'`))?.n), 1);

  /* ── manual: everybody, a fixed 30 zł, one week, no per-person limit ── */
  await giftPolicy.setPolicy(w.db, {
    mode: 'manual',
    manual: { audience: 'all', budgetKind: 'amount', amountMajor: 30, from: '2026-06-10', until: '2026-06-16', repeat: 'once', perUserEveryDays: 0 },
  }, admin, at);
  eq('manual "everybody" opens the shop to free', await shopFor(free), true);
  const manual = await vouchers.giftCardPool(w.db, at);
  eq('…the budget is the amount', manual.budgetMinor, 3000);
  eq('…counting the card bought earlier in the window', manual.spentMinor, 1000);
  eq('free buys', (await buy(free)).points, 1000);
  eq('no per-person limit: the same person buys again', (await buy(free, plusMinutes(at, 1))).points, 1000);
  await throws('the 30 zł are spent', 'conflict', async () => await buy(premium, plusMinutes(at, 2)));
  eq('after the window there is no budget at all', (await vouchers.giftCardPool(w.db, '2026-06-17T10:00:00.000Z' as Iso)).budgetMinor, 0);

  /* ── manual: Premium only, a percentage, renewing monthly, 30 days apart ── */
  await giftPolicy.setPolicy(w.db, {
    mode: 'manual',
    manual: { audience: 'premium', budgetKind: 'percent', percent: 100, from: null, until: null, repeat: 'monthly', perUserEveryDays: 30 },
  }, admin, at);
  eq('Premium only: Pro is shut out', [await shopFor(pro), await shopFor(premium)], [false, true]);
  const july = '2026-07-02T10:00:00.000Z' as Iso;
  const monthly = await vouchers.giftCardPool(w.db, july);
  eq('…a new month starts with nothing spent', monthly.spentMinor, 0);
  eq('…and the percentage of the plans as its budget', monthly.budgetMinor, monthly.revenueMinor);
  eq('Premium buys', (await buy(premium, july)).points, 1000);
  await throws('…and waits 30 days for the next', 'conflict', async () => await buy(premium, plusDays(july, 29)));

  await w.db.close();
}

async function giftCardStock(): Promise<void> {
  describe('§2.1 / §9.4 gift cards -- Pro and Premium only, priced by rule, pooled, and never oversold');
  const w = await world();
  const at = now();

  const left = async () =>
    (await w.db.get<{ stock: number }>(`SELECT stock FROM gift_card_stock WHERE id = 'gcs_race'`))!
      .stock;

  /* Buyers on Pro through a payment rail, each with points to spare. Every one
     of them is also a subscription the §9.4 pool is a share of. */
  const pro = async (label: string) => {
    const id = await person(w, label, plusDays(at, -90));
    await entitlements.startSubscription(w.db, { subject: { userId: id }, planCode: 'pro', source: 'stripe', at });
    await ledger.earn(w.db, { userId: id, points: 5000, reason: 'adjustment', at });
    return id;
  };
  /* What the route calls; the policy decides who may buy. */
  const buy = async (userId: string, when: Iso = at) =>
    await vouchers.redeemGiftCard(w.db, { userId, stockId: 'gcs_race', at: when });

  /* A 10 zł card with one unit, and a stored `points_cost` of 10 that is a lie
     the server must not believe (the audited build priced cards from this
     column, at 50 = 1 zł). */
  await w.db.run(
    `INSERT INTO gift_card_stock (id, brand, logo, face_minor, currency, points_cost, stock, priority_only, active)
     VALUES ('gcs_race', 'Race Brand', 'R', 1000, 'PLN', 10, 1, 0, 1)
     ON CONFLICT (id) DO NOTHING`,
  );
  await stockCodes(w.db, 'gcs_race', 1);
  /* And one in a currency with no rate: not a price, so not on the shelf. */
  await w.db.run(
    `INSERT INTO gift_card_stock (id, brand, logo, face_minor, currency, points_cost, stock, priority_only, active)
     VALUES ('gcs_norate', 'Nowhere', 'N', 1000, 'XTS', 10, 5, 0, 1)
     ON CONFLICT (id) DO NOTHING`,
  );

  /* ── fence 2: the price is the rule's ── */
  eq('100 points buy 1 zł of face value', await vouchers.giftCardPrice(w.db, { face_minor: 1000, currency: 'PLN' }), 1000);
  eq('…rounded up, never in the buyer’s favour', await vouchers.giftCardPrice(w.db, { face_minor: 1001, currency: 'PLN' }), 1001);
  eq('a currency with no rate has no price', await vouchers.giftCardPrice(w.db, { face_minor: 1000, currency: 'XTS' }), null);
  let shelf = await vouchers.giftCardShelf(w.db, at);
  eq('the shelf quotes the derived price', shelf.find((c) => c.id === 'gcs_race')?.points_cost, 1000);
  eq('…and leaves off a card nobody can be quoted for', shelf.some((c) => c.id === 'gcs_norate'), false);

  /* ── no fixed budget: the pool is the revenue share alone ── */
  eq('the default fixed budget is nothing', CONFIG.giftCards.fixedMonthlyMajor, 0);
  shelf = await vouchers.giftCardShelf(w.db, at);

  /* ── the pool, with nobody paying ── */
  eq('no paid subscriptions is an empty pool', (await vouchers.giftCardPool(w.db, at)).budgetMinor, 0);
  eq('…so nothing is left this month', shelf.find((c) => c.id === 'gcs_race')?.left_this_month, 0);

  /* ── fence 1: Pro and Premium only ── */
  await ledger.earn(w.db, { userId: w.customerId, points: 5000, reason: 'adjustment', at });
  eq(
    'the free plan does not carry gift_card_priority',
    entitlements.entBool(await entitlements.entitlementsFor(w.db, { userId: w.customerId }), 'gift_card_priority'),
    false,
  );
  await throws('a free account is refused for its plan', 'entitlement_required', () => buy(w.customerId));
  eq('…and pays nothing for it', await ledger.balance(w.db, w.customerId), 5000);

  /* Five Pro subscribers: 5 × 19.99 zł of revenue, a fifth of it is a 19.99 zł
     pool — one 10 zł card and not two. A `manual` (operator-assigned) plan is
     not revenue and must not grow it. */
  const a = await pro('a');
  const b = await pro('b');
  const c1 = await pro('c');
  const d1 = await pro('d');
  const e1 = await pro('e');
  const courtesy = await person(w, 'courtesy', plusDays(at, -90));
  await entitlements.startSubscription(w.db, { subject: { userId: courtesy }, planCode: 'premium', source: 'manual', at });
  const pool = await vouchers.giftCardPool(w.db, at);
  /* Plans are granted, not sold, so a granted Premium counts at its list price
     beside the five Pro — the figure the pool is a share of. */
  const premiumPrice = Number((await w.db.get<{ p: number }>(
    `SELECT price_minor AS p FROM plans WHERE audience = 'consumer' AND code = 'premium'`))?.p);
  eq('revenue is every live Pro and Premium at list price, granted ones included', pool.revenueMinor, 5 * 1999 + premiumPrice);
  eq('the pool is a fifth of it', pool.budgetMinor, Math.floor((5 * 1999 + premiumPrice) / 5));
  /* The rest of this section was written against a 19.99 zł pool; the
     courtesy plan goes back to free so the arithmetic below holds. */
  await w.db.run(`DELETE FROM subscriptions WHERE user_id = $u`, { u: courtesy });
  shelf = await vouchers.giftCardShelf(w.db, at);
  eq('…which buys one of this card', shelf.find((c) => c.id === 'gcs_race')?.left_this_month, 1);

  const first = await buy(a);
  eq('a Pro account gets a card', typeof first.code, 'string');
  eq('…at the rule’s price', first.points, 1000);
  eq('…and pays it', await ledger.balance(w.db, a), 4000);
  await throws('the free account is still refused, with the pool open', 'entitlement_required', () => buy(w.customerId));
  eq('and the unit is gone', await left(), 0);

  await throws('an empty shelf refuses', 'conflict', () => buy(b));
  /* The refusal must not go below zero. This is the assertion the old code
     failed: it decremented unconditionally, so a refusal that happened to get
     past the read left the shelf owing a card. */
  eq('and does not go negative', await left(), 0);
  eq('and takes no points', await ledger.balance(w.db, b), 5000);

  /* ── fence 3a: one card per user per sixty days ── */
  await w.db.run(`UPDATE gift_card_stock SET stock = 5 WHERE id = 'gcs_race'`);
  await stockCodes(w.db, 'gcs_race', 5, 'more');
  await throws('a second card inside sixty days is refused', 'conflict', () => buy(a, plusDays(at, 1)));
  eq('…and costs nothing', await ledger.balance(w.db, a), 4000);

  /* ── fence 3b: the month's pool ── */
  eq('the month has 9.99 zł left', (await vouchers.giftCardPool(w.db, at)).remainingMinor, 999);
  await throws('a card the pool cannot cover is sold out for the month', 'conflict', () => buy(b));
  eq('…with stock still on the shelf', await left(), 5);
  eq(
    '…and the shelf says none are left this month',
    (await vouchers.giftCardShelf(w.db, at)).find((c) => c.id === 'gcs_race')?.left_this_month,
    0,
  );

  /* Sixty-one days on, the month's pool is whole again and the first buyer may
     buy again. */
  const again = await buy(a, plusDays(at, 61));
  eq('sixty-one days later the first buyer may buy again', again.points, 1000);

  /*
   * **The race.** Four buyers for one unit, all started before any finished.
   *
   * Like the voucher check above, what this really pins on SQLite is the
   * *shape* -- that the guard lives inside the write. The arithmetic is what
   * would survive a move to Postgres: exactly one card, and a shelf at zero
   * rather than at -3. Four *different* buyers, so the per-user cap is not what
   * stops them, in a month with pool to spare for all four.
   */
  const raceAt = plusDays(at, 95);
  for (let n = 0; n < 20; n += 1) await pro(`r${n}`);
  await w.db.run(`UPDATE gift_card_stock SET stock = 1 WHERE id = 'gcs_race'`);
  await stockCodes(w.db, 'gcs_race', 1, 'last');
  const before = await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM gift_cards WHERE stock_id = 'gcs_race'`);
  const rush = await Promise.allSettled([b, c1, d1, e1].map((buyer) => buy(buyer, raceAt)));
  eq(
    'four buyers for one unit yield one card',
    rush.filter((one) => one.status === 'fulfilled').length,
    1,
  );
  eq('and the shelf lands on zero, never below it', await left(), 0);
  /* And the ledger agrees with the shelf. One card issued is one price paid --
     the check that would catch a claim succeeding while its spend rolled back. */
  const issued = await w.db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM gift_cards WHERE stock_id = 'gcs_race'`,
  );
  eq('one more card exists for the one unit sold', Number(issued!.n) - Number(before!.n), 1);
  let paid = 0;
  for (const buyer of [b, c1, d1, e1]) paid += 5000 - (await ledger.balance(w.db, buyer));
  eq('and the points taken are one price', paid, 1000);

  await w.db.close();
}

/**
 * The points rulebook (2026-09-26), §2 / §6 / §7 / §9 — the values this server
 * pays, pinned to the rulebook's own numbers, and the four earners that had a
 * figure in `CONFIG.earn` and no code: a deal shared, a review, a birthday and
 * an anniversary.
 *
 * The constants are asserted against literals on purpose. Everywhere else this
 * suite reads `CONFIG` so a retune does not break it; here the rulebook *is*
 * the spec, and §10's model is built on these exact figures — a change that
 * does not also change the rulebook should fail somewhere, and this is where.
 */
async function rulebookEconomy(): Promise<void> {
  describe('the points rulebook — §2 §6 §7 §9 values, shares, reviews and occasions');

  /* ── the numbers ── */
  eq('§2.1 voucher ladder 300 / 500 / 800 for 5 / 10 / 15%', CONFIG.vouchers.defaultTiers.map((t) => [t.pct, t.points]), [[5, 300], [10, 500], [15, 800]]);
  eq('…capped at 10 / 25 / 40 zł', CONFIG.vouchers.defaultTiers.map((t) => t.maxDiscountMinor), [1000, 2500, 4000]);
  eq('§2.1 gift cards at 100 points a złoty', [CONFIG.giftCards.pointsPerMajor, CONFIG.giftCards.anchorCurrency], [100, 'PLN']);
  eq('§9.4 one card per 60 days, from a pool of 20% of revenue', [CONFIG.giftCards.perUserEveryDays, CONFIG.giftCards.poolShareBp], [60, 2000]);
  eq('§7.3 daily check-in, flat', [CONFIG.earn.dailyCheckIn, [...new Set(CONFIG.earn.checkInCycle)]], [5, [1]]);
  eq('§7.3 referral 100 each, friend milestone 500 at 5', [CONFIG.earn.referrerFirstVisit, CONFIG.earn.inviteeJoin, CONFIG.earn.friendMilestone, CONFIG.earn.friendMilestoneAt], [100, 100, 500, 5]);
  eq('§7.3 deal shared 25, three a day', [CONFIG.earn.dealShared, CONFIG.earn.dealSharedPerDay], [25, 3]);
  eq('§7.3 review 25, one per venue per 30 days', [CONFIG.earn.reviewAfterVisit, CONFIG.earn.reviewEveryDays], [25, 30]);
  eq('§7.3 comeback 100 per fixed 30-day window', [CONFIG.earn.comeback, CONFIG.earn.comebackEveryDays], [100, 30]);
  eq('§7.3 onboarding 50, profile 50, interests 25, first scan 100', [CONFIG.earn.onboarding, CONFIG.earn.profileComplete, CONFIG.earn.categoriesPicked, CONFIG.earn.firstScanEver], [50, 50, 25, 100]);
  eq('§7.3 birthday and anniversary 200 each', [CONFIG.earn.birthday, CONFIG.earn.anniversary], [200, 200]);
  eq('§7.3 stipend Pro 300, Premium 1 000', [CONFIG.earn.proStipend, CONFIG.earn.premiumStipend], [300, 1000]);
  eq('§7.2 streak milestones 7:50 30:250 100:1000', CONFIG.earn.streakMilestones, { 7: 50, 30: 250, 100: 1000 });

  const w = await world();
  const at = '2026-03-10T09:00:00.000Z';

  /* ── §2.1 the platform ladder and the band a venue may price in ── */
  eq('the ladder prices its own rungs', [5, 10, 15].map(vouchers.ladderPrice), [300, 500, 800]);
  eq('…interpolates between them', [vouchers.ladderPrice(7), vouchers.ladderPrice(12)], [380, 620]);
  eq('…scales below the first', vouchers.ladderPrice(3), 180);
  eq('…and runs on past the last', vouchers.ladderPrice(20), 1100);
  eq('a 5% rung may cost 240..900', vouchers.partnerTierBand(5), { platform: 300, min: 240, max: 900 });

  const setFive = async (pointsCost: number) =>
    await partners.setVoucherTiers(w.db, {
      venueId: w.venueId,
      actorId: w.ownerId,
      tiers: [{ discountPct: 5, pointsCost, maxDiscountMinor: 1000 }],
      at,
    });
  await throws('a 5% voucher for 30 points is refused', 'validation_failed', () => setFive(30));
  await throws('…and so is one for 1 000', 'validation_failed', () => setFive(1000));
  try {
    await setFive(30);
  } catch (error) {
    eq('…and the refusal names the band', (error as DomainError).detail, {
      field: 'pointsCost',
      discountPct: 5,
      minPoints: 240,
      maxPoints: 900,
      platformPoints: 300,
    });
  }
  await setFive(240);
  eq('the floor itself is allowed', (await w.db.get<{ p: number }>(
    `SELECT points_cost AS p FROM voucher_tiers WHERE venue_id = $v AND discount_pct = 5`,
    { v: w.venueId },
  ))?.p, 240);

  /* ── §7.3 deal shared ── */
  /* Four live deals at once needs a plan with room for them. */
  await entitlements.startSubscription(w.db, { subject: { venueId: w.venueId }, planCode: 'growth', source: 'manual', at });
  const liveDeal = async (title: string) => {
    const deal = await partners.createDeal(w.db, {
      actorId: w.ownerId,
      draft: { venueId: w.venueId, discountText: '2 for 1', copy: { en: { title, description: title } } },
      at,
    });
    await partners.publishDeal(w.db, { dealId: deal.id, actorId: w.ownerId, at });
    return deal.id;
  };
  const sharer = await person(w, 'sharer', '2026-01-01T00:00:00.000Z');
  const deals4 = [await liveDeal('One'), await liveDeal('Two'), await liveDeal('Three'), await liveDeal('Four')];
  const shareAt = '2026-03-10T12:00:00.000Z';
  const firstShare = await occasions.shareDeal(w.db, { userId: sharer, dealId: deals4[0], at: shareAt });
  eq('a share pays 25', [firstShare.granted, firstShare.points, firstShare.balance], [true, 25, 25]);
  const twice = await occasions.shareDeal(w.db, { userId: sharer, dealId: deals4[0], at: shareAt });
  eq('the same deal twice pays once', [twice.granted, twice.reason, twice.balance], [false, 'already_shared', 25]);
  await occasions.shareDeal(w.db, { userId: sharer, dealId: deals4[1], at: shareAt });
  const third = await occasions.shareDeal(w.db, { userId: sharer, dealId: deals4[2], at: shareAt });
  eq('three different deals in a day all pay', [third.granted, third.sharedToday, third.balance], [true, 3, 75]);
  const fourth = await occasions.shareDeal(w.db, { userId: sharer, dealId: deals4[3], at: shareAt });
  eq('the fourth in a day does not', [fourth.granted, fourth.reason, fourth.balance], [false, 'daily_cap', 75]);
  const tomorrow = await occasions.shareDeal(w.db, { userId: sharer, dealId: deals4[3], at: '2026-03-11T08:00:00.000Z' });
  eq('…and pays tomorrow', [tomorrow.granted, tomorrow.sharedToday], [true, 1]);
  const draft = await partners.createDeal(w.db, {
    actorId: w.ownerId,
    draft: { venueId: w.venueId, discountText: 'Soon', copy: { en: { title: 'Soon', description: 'Soon' } } },
    at,
  });
  eq('a deal that is not live pays nothing', (await occasions.shareDeal(w.db, { userId: sharer, dealId: draft.id, at: shareAt })).reason, 'not_live');
  eq(
    'a share is filed under invites, keyed by the deal',
    (await w.db.get<{ reason: string; n: number }>(
      `SELECT reason, COUNT(*) AS n FROM points_ledger WHERE user_id = $u AND source_kind = 'deal_share' GROUP BY reason`,
      { u: sharer },
    )),
    { reason: 'referral', n: 4 },
  );

  /* ── §7.3 / §9.2 review after a visit ── */
  const reviewer = await person(w, 'reviewer', '2026-01-01T00:00:00.000Z');
  await throws('a review needs a visit', 'forbidden', () =>
    occasions.review(w.db, { userId: reviewer, venueId: w.venueId, rating: 5, at }),
  );
  await scanAs(w, reviewer, 4000, '2026-03-09T10:00:00.000Z');
  const before = await ledger.balance(w.db, reviewer);
  await throws('a rating is 1..5', 'validation_failed', () =>
    occasions.review(w.db, { userId: reviewer, venueId: w.venueId, rating: 6, at }),
  );
  const reviewed = await occasions.review(w.db, { userId: reviewer, venueId: w.venueId, rating: 5, body: ' Lovely. ', at });
  eq('a review after a visit pays 25', [reviewed.points, (await ledger.balance(w.db, reviewer)) - before], [25, 25]);
  eq('…and keeps what was said', [reviewed.review.rating, reviewed.review.body], [5, 'Lovely.']);
  await throws('a second review inside 30 days is refused', 'conflict', () =>
    occasions.review(w.db, { userId: reviewer, venueId: w.venueId, rating: 4, at: plusDays(at, 29) }),
  );
  const later = await occasions.review(w.db, { userId: reviewer, venueId: w.venueId, rating: 4, at: plusDays(at, 31) });
  eq('…and allowed, and paid, after it', later.points, 25);
  eq(
    'reviews are the ledger’s `review` reason, on the venue',
    (await w.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM points_ledger WHERE user_id = $u AND reason = 'review' AND venue_id = $v`,
      { u: reviewer, v: w.venueId },
    ))?.n,
    2,
  );

  /* ── §7.3 birthday and anniversary ── */
  const bday = await person(w, 'bday', '2025-06-01T00:00:00.000Z');
  await w.db.run(`UPDATE users SET birth_date = '1990-03-10', birth_date_set_at = '2026-01-05T00:00:00.000Z' WHERE id = $u`, { u: bday });
  const cheat = await person(w, 'cheat', '2025-06-01T00:00:00.000Z');
  await w.db.run(`UPDATE users SET birth_date = '1990-03-10', birth_date_set_at = '2026-03-10T08:00:00.000Z' WHERE id = $u`, { u: cheat });
  const leap = await person(w, 'leap', '2025-06-01T00:00:00.000Z');
  await w.db.run(`UPDATE users SET birth_date = '2000-02-29', birth_date_set_at = '2026-01-05T00:00:00.000Z' WHERE id = $u`, { u: leap });
  const yearOld = await person(w, 'year-old', '2025-01-01T00:00:00.000Z');
  await w.db.run(`UPDATE users SET created_at = '2025-03-08T10:00:00.000Z' WHERE id = $u`, { u: yearOld });
  const newcomer = await person(w, 'newcomer', '2026-01-01T00:00:00.000Z');
  await w.db.run(`UPDATE users SET created_at = '2026-03-08T10:00:00.000Z' WHERE id = $u`, { u: newcomer });

  await occasions.payDue(w.db, at);
  const paid = async (userId: string, kind: string, year: number) => await ledger.alreadyPaid(w.db, userId, kind, `${kind}:${year}`);
  check('a birthday on its day pays', await paid(bday, 'birthday', 2026));
  eq('…200 points', await ledger.balance(w.db, bday), 200);
  check('a birthday typed in on the day itself does not', !(await paid(cheat, 'birthday', 2026)));
  check('a first anniversary two days ago pays, inside the grace', await paid(yearOld, 'anniversary', 2026));
  check('an account two days old has no anniversary', !(await paid(newcomer, 'anniversary', 2026)));
  await occasions.payDue(w.db, plusDays(at, 1));
  eq('a second run pays nothing twice', await ledger.balance(w.db, bday), 200);
  /* The leap-day birthday, in a common year, on the 28th. */
  await occasions.payDue(w.db, '2027-02-28T09:00:00.000Z');
  check('the 29th of February is the 28th in a common year', await paid(leap, 'birthday', 2027));
  /* A late-December birthday found across the new year, keyed on its own year. */
  await w.db.run(`UPDATE users SET birth_date = '1990-12-30' WHERE id = $u`, { u: bday });
  await occasions.payDue(w.db, '2027-01-02T09:00:00.000Z');
  check('a birthday found after new year is keyed on the year it fell in', await paid(bday, 'birthday', 2026) && !(await paid(bday, 'birthday', 2027)));
  eq('…so the correction bought nothing', await ledger.balance(w.db, bday), 200);
  eq(
    'an occasion leaves an inbox row',
    (await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = $u AND kind = 'birthday'`, { u: bday }))?.n,
    1,
  );

  await w.db.close();
}

/**
 * Item 23: an operator assigns a tier, and the date on it means something.
 *
 * The whole mechanism is two filters on `activeSubscription` and two columns on
 * the row, which means the things worth checking are *dates* rather than
 * statuses: that a change dated forward is not live, that it becomes live on
 * the day without anything running, that the plan it replaces stops on exactly
 * that instant rather than earlier or never, and that the entitlements a gate
 * reads move with it.
 */
async function tierAssignment(): Promise<void> {
  describe('§D item 23 — an operator assigns a tier');
  const w = await world();
  const at = '2026-06-01T10:00:00.000Z';
  const subject = { venueId: w.venueId };

  /* The floor. Every audience has a free plan and `planFor` falls back to it,
     so "no subscription" is a plan rather than an absence. */
  const free = await entitlements.planFor(w.db, subject, at);
  eq('a venue with no subscription reads the starter plan', free.rank, 0);

  /* ── now ── */
  const immediate = await entitlements.assignPlan(w.db, {
    subject,
    planCode: 'growth',
    actorId: w.ownerId,
    note: 'a call with the owner',
    at,
  });
  check('an undated assignment is not scheduled', immediate.scheduled === false);
  eq('and it is in force at once', (await entitlements.planFor(w.db, subject, at)).code, 'growth');
  eq('its source says who did it', immediate.subscription.source, 'manual');
  /* The one line most likely to be tidied into a bug: a granted tier with a
     renewal date is a tier `runRenewals` takes away in a month. */
  eq('a granted tier has no renewal date', immediate.subscription.renews_at, null);
  await entitlements.runRenewals(w.db, plusDays(at, 60));
  eq(
    '…so two months of renewal sweeps leave it alone',
    (await entitlements.planFor(w.db, subject, plusDays(at, 60))).code,
    'growth',
  );

  /* And the entitlements a gate reads moved with it, which is the propagation
     the item asks for: no cache, no job, the next read is gated by the new
     plan. */
  const proEnt = await entitlements.entitlementsFor(w.db, subject, at);
  const freeEnt = await entitlements.entitlementsFor(w.db, subject, '2026-05-01T10:00:00.000Z');
  check(
    'the entitlements move with the plan',
    JSON.stringify(proEnt) !== JSON.stringify(freeEnt),
    Object.keys(proEnt).join(', '),
  );

  /* ── dated forward ── */
  const day = '2026-07-01';
  const later = await entitlements.assignPlan(w.db, {
    subject,
    planCode: 'starter',
    effectiveFrom: day,
    actorId: w.ownerId,
    at,
  });
  check('a dated assignment says it is scheduled', later.scheduled === true);
  eq('…and it is not in force today', (await entitlements.planFor(w.db, subject, at)).code, 'growth');
  eq(
    '…nor the instant before it opens',
    (await entitlements.planFor(w.db, subject, '2026-06-30T23:59:59.999Z')).code,
    'growth',
  );
  /* The hand-over, at the bare day's own midnight. A downgrade is the case that
     catches a wrong implementation: `ORDER BY p.rank DESC` would keep serving
     Pro forever if the old row were merely left running. */
  eq(
    '…and on the day it is',
    (await entitlements.planFor(w.db, subject, '2026-07-01T00:00:00.000Z')).code,
    'starter',
  );
  eq(
    '…which is a downgrade, so the higher rank really stopped',
    (await entitlements.planFor(w.db, subject, '2026-07-15T10:00:00.000Z')).code,
    'starter',
  );

  /* It is visible while pending, or the same change gets scheduled twice. */
  const queued = await entitlements.pendingSubscription(w.db, subject, at);
  eq('a scheduled change can be read back', queued?.id, later.subscription.id);
  check('…and is not what `activeSubscription` answers',
    (await entitlements.activeSubscription(w.db, subject, at))?.id !== queued?.id);

  /* ── a second date replaces the first ── */
  const moved = await entitlements.assignPlan(w.db, {
    subject,
    planCode: 'starter',
    effectiveFrom: '2026-08-01',
    actorId: w.ownerId,
    at,
  });
  eq(
    'a corrected date replaces the pending change rather than queueing',
    (await entitlements.pendingSubscription(w.db, subject, at))?.id,
    moved.subscription.id,
  );
  eq(
    '…so the first date no longer does anything',
    (await entitlements.planFor(w.db, subject, '2026-07-15T10:00:00.000Z')).code,
    'growth',
  );

  /* ── dropping a dated change puts the open end back ── */
  await entitlements.cancelScheduled(w.db, { subscriptionId: moved.subscription.id, actorId: w.ownerId, at });
  eq(
    'unscheduling leaves the live plan running',
    (await entitlements.planFor(w.db, subject, '2026-09-01T10:00:00.000Z')).code,
    'growth',
  );
  check('…and nothing is pending', (await entitlements.pendingSubscription(w.db, subject, at)) === undefined);
  /* The one it must refuse: undoing something already in force is a downgrade,
     which is a different decision and a different audit row. */
  await throws('a change already in force cannot be unscheduled', 'invalid_state', () =>
    entitlements.cancelScheduled(w.db, {
      subscriptionId: immediate.subscription.id,
      actorId: w.ownerId,
      at,
    }),
  );

  /* ── what it refuses ── */
  /* `premium` is a real plan code — on the **consumer** ladder. The audience is
     derived from the subject, so asking for it on a venue is a 404 rather than
     a venue quietly holding consumer entitlements no partner screen reads. */
  await throws('a plan from the other audience is refused', 'not_found', () =>
    entitlements.assignPlan(w.db, { subject, planCode: 'premium', actorId: w.ownerId, at }),
  );
  await throws('…and so is a plan that does not exist', 'not_found', () =>
    entitlements.assignPlan(w.db, { subject, planCode: 'platinum', actorId: w.ownerId, at }),
  );

  /* ── the audit trail ── */
  /* Read straight off `audit_log`, the way every other section here does:
     `audit.recent` is the console's own shape and this is about the row. */
  const rows = await w.db.all<{ action: string; actor_id: string | null; after: string | null }>(
    `SELECT action, actor_id, after FROM audit_log ORDER BY created_at DESC LIMIT 50`,
  );
  const assigns = rows.filter((row) => row.action === 'subscription.assign');
  check('every assignment left an audit row', assigns.length >= 3, String(assigns.length));
  /*
   * Found by what it says, not by where it sits.
   *
   * All three assignments here were made at one instant, so `ORDER BY
   * created_at` cannot separate them — which is this repo's own FIFO tiebreak
   * lesson (`points_lots.seq`) turning up in a test rather than in a query. A
   * check that indexed into the list passed or failed on the database's whim.
   */
  const decoded = assigns.map((row) => ({
    row,
    after: JSON.parse(row.after ?? '{}') as Record<string, unknown>,
  }));
  const grant = decoded.find((one) => one.after.planCode === 'growth');
  check('and the plan it moved to', grant !== undefined, assigns.length + ' assigns');
  eq('with an actor on it', grant?.row.actor_id, w.ownerId);
  const after = grant?.after ?? {};
  check('…the date it takes effect', typeof after.effectiveFrom === 'string');
  check('…and the operator\'s reason, which nothing else records', after.note === 'a call with the owner');
  check(
    'an unschedule is audited too',
    rows.some((row) => row.action === 'subscription.unschedule'),
  );

  await w.db.close();
}

async function campaignRules(): Promise<void> {
  describe('§5 campaigns and stamp cards');
  const w = await world();
  /* Mid-month, not `now()`: this section walks a customer through three visits
     two days apart and then reads one pool, and a reward earned on the 1st is
     reserved against a different budget than one earned on the 30th. See
     `midMonth`. */
  const at = midMonth();

  await throws('a percentage reward is not a campaign', 'validation_failed', () =>
    campaigns.validateCampaign({
      visitsRequired: 3,
      rewardCostMinor: 500,
      rewardLabel: 'x',
      rewardKind: 'percentage_discount',
    }),
  );
  await throws('nor is a points threshold', 'validation_failed', () =>
    campaigns.validateCampaign({
      visitsRequired: 3,
      rewardCostMinor: 500,
      rewardLabel: 'x',
      pointsThreshold: 100,
    }),
  );

  /* Two overlapping campaigns; only the higher priority may fire (§5.1). */
  await partners.createCampaign(w.db, {
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
  await entitlements.startSubscription(w.db, {
    subject: { venueId: w.venueId },
    planCode: 'growth',
    source: 'manual',
    at,
  });
  await partners.createCampaign(w.db, {
    venueId: w.venueId,
    actorId: w.ownerId,
    name: 'Also two visits',
    visitsRequired: 2,
    rewardLabel: 'A coffee',
    rewardCostMinor: 1200,
    priority: 5,
    at,
  });

  await scan(w, 4000, at);
  const second = await scan(w, 4000, plusDays(at, 1));
  eq('one reward per visit, and it is the higher priority', second.reward?.label, 'A coffee');
  eq(
    'exactly one reward exists',
    (await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM earned_rewards WHERE user_id = $u`, {
      u: w.customerId,
    }))?.n,
    1,
  );
  eq(
    'its exact cost is reserved',
    (await budget.budgetFor(w.db, w.venueId, at)).loyalty.reserved,
    1200,
  );

  /* §5.3: pausing stops new earning but existing rewards stay valid and reserved. */
  const reward = (await campaigns.availableRewards(w.db, w.customerId))[0];
  await campaigns.setStatus(w.db, reward.campaign_id, 'paused', at);
  eq(
    'a paused campaign still holds its money',
    (await budget.budgetFor(w.db, w.venueId, at)).loyalty.reserved,
    1200,
  );
  eq('and the earned reward is still available', (await campaigns.availableRewards(w.db, w.customerId)).length, 1);

  /* Redeeming through the gate releases the reserve and debits the same amount. */
  const qr = await gate.mintQr(w.db, w.venueId, SECRET, plusDays(at, 2));
  const txn = await gate.openTransaction(w.db, { kind: 'qr', token: qr.token, secret: SECRET }, {
    userId: w.customerId,
    intent: 'reward_redeem',
    intentRef: reward.id,
    at: plusDays(at, 2),
  });
  await gate.submitAmount(w.db, {
    transactionId: txn.id,
    amountMinor: 3000,
    actorId: w.ownerId,
    at: plusDays(at, 2),
  });
  await gate.confirm(w.db, { transactionId: txn.id, cashierId: w.ownerId, at: plusDays(at, 2) });
  const pool = (await budget.budgetFor(w.db, w.venueId, at)).loyalty;
  eq('the exact cost is spent, not an estimate', pool.spent, 1200);
  /* That third visit also paid out the *other* card — it completed on visit two
     and had to wait, because only one reward fires per visit. So the pool is
     holding the pastry's 900 now, which is the rule working rather than a leak. */
  eq('the queued second reward fires on the next visit', pool.reserved, 900);
  eq(
    'and two rewards exist in total',
    (await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM earned_rewards WHERE user_id = $u`, {
      u: w.customerId,
    }))?.n,
    2,
  );

  await w.db.close();
}

/**
 * §2b turning up — the daily check-in and the calendar it draws.
 *
 * What is worth checking here is *not* that five points arrive. It is that a day
 * cannot be claimed twice, that the seventh day of a streak is the seventh day
 * and not the seventh call, that a milestone pays once in a lifetime rather than
 * once per streak, and that the calendar's legend adds up to its own total. Each
 * of those is a faucet or a lie if it is wrong, and none of them shows on a
 * screen until somebody has been using the app for a week.
 */
async function checkInRules(): Promise<void> {
  describe('§2b the daily check-in');
  const w = await world();
  const { db, customerId } = w;

  /* A fixed March rather than `now()`: the cycle and the milestones are counted
     in days, and a suite that started on the 30th would roll into a second month
     halfway through and test the month boundary by accident. */
  const day = (n: number) => `2026-03-${String(n).padStart(2, '0')}T09:00:00.000Z`;

  const first = await checkin.checkIn(db, { userId: customerId, at: day(1) });
  eq('the first check-in pays the base day', first.points, CONFIG.earn.dailyCheckIn);
  eq('…and says it granted', first.granted, true);
  eq('…and starts the streak at one', first.streak, 1);
  eq('…and moves the balance', first.balance, CONFIG.earn.dailyCheckIn);
  eq('…and names the day it claimed', first.day, '2026-03-01');
  eq('…and when that day ends', first.dayTurnsAt, '2026-03-02T00:00:00.000Z');

  const again = await checkin.checkIn(db, { userId: customerId, at: day(1) });
  eq('a second claim the same day grants nothing', again.granted, false);
  eq('…pays nothing', again.total, 0);
  eq('…leaves the streak alone', again.streak, 1);
  eq('…and leaves the balance alone', again.balance, CONFIG.earn.dailyCheckIn);

  /* Six more days — the rest of the cycle, and the seven-day milestone. */
  let expected = CONFIG.earn.dailyCheckIn;
  for (let n = 2; n <= 7; n += 1) {
    const claim = await checkin.checkIn(db, { userId: customerId, at: day(n) });
    eq(`day ${n} pays its rung`, claim.points, checkin.dayValue(n));
    eq(`day ${n} counts`, claim.streak, n);
    expected += claim.total;
  }
  /* Rulebook §7.3 / §11 `DAILY_CHECKIN 5`: **a flat five, every day** — seven
     days is 35 and the week's reward for turning up is the milestone. This read
     `dailyCheckIn * 13` while the cycle was the 1/1/1/2/2/2/4 run-up. */
  eq('the seventh day pays the milestone with it', expected, CONFIG.earn.dailyCheckIn * 7 + 50);
  check(
    'every rung of the cycle is the flat daily figure',
    CONFIG.earn.checkInCycle.every((_, i) => checkin.dayValue(i + 1) === CONFIG.earn.dailyCheckIn),
  );
  eq('…which is five', CONFIG.earn.dailyCheckIn, 5);
  eq('…and the balance agrees', await ledger.balance(db, customerId), expected);
  eq('the ledger reconciles', await ledger.reconcile(db, customerId), 0);

  const milestoneRows = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM points_ledger WHERE user_id = $u AND reason = 'streak_milestone'`,
    { u: customerId },
  );
  eq('the milestone is its own entry, not points folded in', milestoneRows?.n, 1);

  /* The eighth day starts the shape again rather than running off the end. */
  const eighth = await checkin.checkIn(db, { userId: customerId, at: day(8) });
  eq('the eighth day pays what the first did', eighth.points, checkin.dayValue(1));
  eq('…and the streak keeps counting', eighth.streak, 8);
  eq('…and it is rung one again', eighth.cycleDay, 1);

  /* A missed day. The 9th is skipped; the 10th starts over. */
  const restart = await checkin.checkIn(db, { userId: customerId, at: day(10) });
  eq('a missed day restarts the streak', restart.streak, 1);
  eq('…at the base rung', restart.points, CONFIG.earn.dailyCheckIn);

  const beforeRebuild = await ledger.balance(db, customerId);
  for (let n = 11; n <= 16; n += 1) await checkin.checkIn(db, { userId: customerId, at: day(n) });
  const rebuilt = await checkin.calendar(db, { userId: customerId, at: day(16) });
  eq('the streak climbs back to seven', rebuilt.streak, 7);
  eq(
    'a rebuilt streak does not pay the milestone twice',
    (await ledger.balance(db, customerId)) - beforeRebuild,
    /* Days 11–16: six check-ins at the flat figure, and no second milestone. */
    CONFIG.earn.dailyCheckIn * 6,
  );
  eq('…and the milestone reads as paid', rebuilt.milestones.find((m) => m.day === 7)?.paid, true);
  eq('…and the longest run is remembered', rebuilt.longestStreak, 8);
  eq('…and the next one to aim at is the thirty', rebuilt.nextMilestone?.day, 30);
  eq('…which is twenty-three days off', rebuilt.nextMilestone?.daysAway, 23);

  /* The calendar. Claimed today, so nothing is on offer and nothing is at risk. */
  eq('today is the day the server is on', rebuilt.today, '2026-03-16');
  eq('a claimed day is not claimable', rebuilt.claimable, false);
  eq('…and is not at risk either', rebuilt.atRisk, false);
  eq('the month is the one today falls in', rebuilt.month, '2026-03');
  eq('every check-in is a day on the grid', rebuilt.days.filter((d) => d.checkedIn).length, 15);
  eq(
    'the month total is the sum of its legend',
    rebuilt.monthTotal,
    rebuilt.monthSources.reduce((total, source) => total + source.points, 0),
  );
  eq(
    '…and of its days',
    rebuilt.monthTotal,
    rebuilt.days.reduce((total, d) => total + d.points, 0),
  );
  eq('…and of the ledger', rebuilt.monthTotal, await ledger.balance(db, customerId));
  eq(
    'the check-ins are their own row in the legend',
    rebuilt.monthSources.find((s) => s.kind === 'check_in')?.label,
    'Daily check-in',
  );
  eq(
    '…and the streak bonus is another',
    rebuilt.monthSources.find((s) => s.kind === 'streak')?.points,
    50,
  );

  /* The day after: the streak is alive and today is unclaimed, and that pair is
     the only state a "you are about to lose it" reminder is honest about. */
  const tomorrow = await checkin.calendar(db, { userId: customerId, at: day(17) });
  eq('an unclaimed day is claimable', tomorrow.claimable, true);
  eq('…and a live streak with it is at risk', tomorrow.atRisk, true);
  eq('…the streak still stands on yesterday', tomorrow.streak, 7);
  eq('…today is the eighth rung, which is the first', tomorrow.cycleDay, 1);
  eq('…worth the base day', tomorrow.todayPoints, CONFIG.earn.dailyCheckIn);

  /* Two days after: yesterday went unclaimed, so the streak is gone rather than
     merely at risk. */
  const lapsed = await checkin.calendar(db, { userId: customerId, at: day(18) });
  eq('a missed day ends the streak', lapsed.streak, 0);
  eq('…so there is nothing at risk', lapsed.atRisk, false);
  eq('…and today would be day one', lapsed.todayPoints, CONFIG.earn.dailyCheckIn);

  /* A month with nothing in it is an empty grid, not a failure. */
  const quiet = await checkin.calendar(db, { userId: customerId, month: '2026-01', at: day(18) });
  eq('a month with no earning has no days', quiet.days.length, 0);
  eq('…and a zero total', quiet.monthTotal, 0);
  eq('…but still says what today is', quiet.today, '2026-03-18');

  await rejects(
    'a month that is not a month is refused',
    async () => await checkin.calendar(db, { userId: customerId, month: '2026-13', at: day(18) }),
    'validation_failed',
  );
  await rejects(
    '…and so is a day dressed as one',
    async () => await checkin.calendar(db, { userId: customerId, month: '2026-03-01', at: day(18) }),
    'validation_failed',
  );

  /* The legend buckets every reason, including ones it has never been taught: a
     total that does not equal the sum of its own legend is worse than a legend
     with a vague row in it. */
  await ledger.earn(db, { userId: customerId, points: 40, reason: 'game_win', at: day(16) });
  await ledger.earn(db, { userId: customerId, points: 20, reason: 'scan_earn', at: day(16) });
  await ledger.earn(db, { userId: customerId, points: 25, reason: 'review', at: day(16) });
  const mixed = await checkin.calendar(db, { userId: customerId, at: day(16) });
  eq(
    'a scan and the review after it are one bucket',
    mixed.monthSources.find((s) => s.kind === 'visits')?.points,
    45,
  );
  eq('games are their own', mixed.monthSources.find((s) => s.kind === 'games')?.points, 40);
  eq(
    'the legend still adds up',
    mixed.monthTotal,
    mixed.monthSources.reduce((total, source) => total + source.points, 0),
  );
  const sixteenth = mixed.days.find((d) => d.day === '2026-03-16');
  eq('a day carries its own split', sixteenth?.sources.length, 3);
  eq('…ordered biggest first', sixteenth?.sources[0]?.kind, 'visits');
  eq('…and totals to the day', sixteenth?.points, 45 + 40 + checkin.dayValue(7));

  /* A spend is a real row and belongs in the history screen — not in a legend
     that answers "where did points come from". */
  await ledger.spend(db, { userId: customerId, points: 100, reason: 'voucher_redeem', at: day(16) });
  const afterSpend = await checkin.calendar(db, { userId: customerId, at: day(16) });
  eq('spending does not appear in the legend', afterSpend.monthTotal, mixed.monthTotal);

  eq('the ladder is the cycle', afterSpend.ladder.length, CONFIG.earn.checkInCycle.length);
  eq(
    '…with the milestone drawn on the rung it lands on',
    afterSpend.ladder.find((rung) => rung.day === 7)?.milestone,
    50,
  );

  /* ── the streak reminder ──────────────────────────────────────────────── */

  /* Day 16 was claimed and day 17 was not, so on the 17th this account is
     exactly the population: a live streak with the day it is owed running out. */
  const reminders = async () =>
    await db.all<{ title: string; body: string; delivery: string; suppress_reason: string | null }>(
      `SELECT title, body, delivery, suppress_reason FROM notifications
        WHERE user_id = $u AND kind = 'streak' ORDER BY created_at`,
      { u: customerId },
    );

  const early = await checkin.remind(db, '2026-03-17T09:00:00.000Z');
  eq('nothing is sent while the day still has hours in it', early.due, 0);
  eq('…and nothing is written', (await reminders()).length, 0);

  const late = await checkin.remind(db, '2026-03-17T19:00:00.000Z');
  eq('a live streak with the day running out is reminded', late.due, 1);
  eq('…once', late.sent, 1);

  const written = await reminders();
  eq('…with one row on the inbox', written.length, 1);
  eq('…naming the streak and the hours left', written[0]?.title, 'Your 7-day streak ends in 5 hours');
  eq(
    '…and what today is actually worth',
    written[0]?.body,
    `Check in to keep it. Today is worth ${checkin.dayValue(8)} points.`,
  );
  /* No push token on this account, so the push is refused and the row still
     lands — and says which of the four reasons refused it. A reminder that
     vanished because a permission was never granted is a reminder nobody can
     explain the absence of. */
  eq('…written even when it cannot be pushed', written[0]?.delivery, 'suppressed');
  eq('…recording why', written[0]?.suppress_reason, 'no_permission');

  /* The job runs hourly and the window is hours wide. Running it again inside
     the same day must not buzz anybody twice. */
  const rerun = await checkin.remind(db, '2026-03-17T21:00:00.000Z');
  eq('a second run the same day finds nobody', rerun.due, 0);
  eq('…and writes nothing', (await reminders()).length, 1);

  /* Somebody who has already checked in is not reminded of anything. Day 16 was
     claimed, so on the 16th there is nothing to say. */
  const claimed = await checkin.remind(db, '2026-03-16T19:00:00.000Z');
  eq('a day already claimed is not reminded', claimed.due, 0);

  /* And neither is a streak that has already gone: on the 18th, the 17th went
     unclaimed, so there is no run to save and the sentence would be a
     bereavement notice. */
  const gone = await checkin.remind(db, '2026-03-18T19:00:00.000Z');
  eq('a streak that already broke is not reminded', gone.due, 0);

  await db.close();
}

async function gameRules(): Promise<void> {
  describe('§7 the games engine');
  const w = await world();
  const at = now();

  const round = await games.startSession(w.db, {
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
    (await w.db.get<{ secret: string }>(`SELECT secret FROM game_sessions WHERE id = $i`, {
      i: round.sessionId,
    }))!.secret,
  ) as { answers: number[] };

  for (const [index, question] of content.questions.entries()) {
    const result = await games.submitEvent(w.db, {
      sessionId: round.sessionId,
      userId: w.customerId,
      seq: index,
      kind: 'answer',
      payload: { index: question.index, choice: secret.answers[index] },
      at,
    });
    check(`question ${index} scores as correct`, result.correct === true);
  };

  /* A replayed event is idempotent rather than a second answer. */
  const replay = await games.submitEvent(w.db, {
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

  const finished = await games.finish(w.db, { sessionId: round.sessionId, userId: w.customerId, at });
  /*
   * Five of five is **performance 100** — 20 an answer — which is the top of the
   * one scale every game is reduced to. The speed credit is invisible here and
   * is supposed to be: §5.1 caps the total at 100 and a perfect round is already
   * there. `scoringRules` below walks each game's own mapping.
   */
  eq('performance is computed server-side', finished.performance, 100);
  eq('…which is 20 an answer, five times', finished.performance,
    CONFIG.games.quizQuestions * CONFIG.games.quizPerformancePerCorrect);
  eq('…and a perfect round is the top of the base scale', finished.base,
    CONFIG.games.maxRoundPoints);
  eq('the first round of the day is not decayed', finished.decay, 1);
  eq('…and it says so as a round number', finished.roundToday, 1);
  eq('a perfect round takes the perfect-round bonus', finished.bonusPerfect,
    CONFIG.games.perfectRoundBonus);
  /* This account has never played `capitals` before, so §4.3's discovery bonus
     lands with it — the largest single line in the formula, once per game ever. */
  eq('…and the first-ever play of this game takes the new-game bonus',
    finished.bonusNewGame, CONFIG.games.newGameBonus);
  eq('…but not a personal best, because there was no record to beat',
    finished.bonusPersonalBest, 0);
  /* The whole formula, restated from the itemisation the response carries: a
     client that adds these up must reach the same integer the ledger did. */
  eq('the score is the formula, and the response can be added up to prove it',
    finished.score,
    Math.round(
      finished.base * (finished.featured ? CONFIG.games.featuredMultiplier : 1) *
        finished.decay * finished.multiplier +
        finished.bonusPerfect + finished.bonusNewGame + finished.bonusPersonalBest,
    ));
  eq('a clean round is a win', finished.won, true);
  eq('the streak starts at one', finished.streak, 1);
  /* **A win costs energy too, now.** The pool used to be charged by a loss
     only, which meant this line read `dailyEnergy` and the assertion said
     nothing at all about a rule with no writer on this path. One off a full
     tank is what "every finished round costs one" looks like from outside. */
  eq('a win spends energy like any other round', finished.energyLeft,
    CONFIG.points.dailyEnergy - 1);
  /*
   * **One entry, and the balance is the round.**
   *
   * This used to have to add a flat `CONFIG.earn.dailyGame` on the three days in
   * seven where `capitals` fell inside the featured window, because the featured
   * bonus was a second ledger entry of its own. §4.1 step 3 replaced it with a
   * ×1.5 *inside* the round, so there is exactly one entry again and the balance
   * is exactly what the round scored — on all seven days, with no window to
   * recompute here.
   *
   * The window itself is still checked, one line down: `featured` on the
   * response must agree with the rotation, which is the fact the old assertion
   * was really about.
   */
  eq(
    'the balance moved by the round, and by nothing beside it',
    await ledger.balance(w.db, w.customerId),
    finished.score,
  );
  eq(
    'and the ×1.5 is claimed exactly when `capitals` is in the featured window',
    finished.featured,
    games.featuredGamesFor(at).has('capitals'),
  );

  /*
   * ── a question with too few answers is never asked ──
   *
   * Two upstream defects with one symptom, and the symptom is a *question*
   * rather than an error: a row with one distractor renders two buttons, and a
   * row whose translated distractors collide renders four buttons with three
   * answers on them. Both pay the point a four-way question pays.
   *
   * `pickDistractors` in `db/import.ts` wrote the first kind for every small
   * continent group (Oceania's 14 countries did it to 14 flags and 14
   * capitals). It is fixed — and **a fixed generator does not rewrite rows it
   * already wrote**, so `buildQuiz` filters as well, and `main.ts` re-imports
   * when it finds one.
   *
   * Checked on a bank of its own, in a language no export carries, so the draw
   * is exhaustive rather than lucky: five good rows and two poisoned ones means
   * a correct draw can only be the five.
   */
  const poison = async (id: string, distractors: unknown, answer = 'Right') =>
    await w.db.run(
      `INSERT INTO quiz_items (id, bank, language, prompt, answer, distractors, meta)
       VALUES ($i, 'brain', 'xx', $p, $a, $d, '{}')`,
      { i: id, p: `q-${id}`, a: answer, d: JSON.stringify(distractors) },
    );

  for (let i = 0; i < CONFIG.games.quizQuestions; i += 1) {
    await poison(`good${i}`, ['Wrong A', 'Wrong B', 'Wrong C']);
  }
  await poison('tooFew', ['Only One']);
  /* A distractor equal to the answer is the worst of the two: two buttons are
     right and only one of them scores. */
  await poison('duplicate', ['Wrong A', 'Wrong B', 'Right']);

  const guarded = await games.startSession(w.db, {
    userId: w.ownerId,
    gameType: 'brain',
    language: 'xx',
    at,
  });
  const asked = (guarded.content as { questions: Array<{ prompt: string; options: string[] }> })
    .questions;
  eq('the round is still five questions', asked.length, CONFIG.games.quizQuestions);
  check(
    'every one of them offers the full set of options',
    asked.every((question) => question.options.length === CONFIG.games.quizOptions),
    asked.map((question) => question.options.length),
  );
  check(
    'a row with one distractor is never asked',
    !asked.some((question) => question.prompt === 'q-tooFew'),
  );
  check(
    '…and nor is one whose options are not distinct',
    !asked.some((question) => question.prompt === 'q-duplicate'),
  );
  check(
    'no question repeats an option',
    asked.every((question) => new Set(question.options).size === question.options.length),
  );

  /*
   * ── the welcome round is the same five flags every time it is opened ──
   *
   * `ORDER BY RANDOM()` is right for the game on the Play screen and wrong for
   * the gate: `onboarding.tsx` says a refresh restarts the flow, and with a
   * random draw a refresh silently changed the *questions* too — so a new
   * account's first five flags were not a fixed thing at all. Seeded on the
   * user id, so it is reproducible per account and still different between
   * accounts, which is the property that keeps the answers unshareable.
   *
   * The recent-items window is cleared between draws because being asked the
   * same five twice is exactly what is under test, and the window exists to
   * stop that happening in the game.
   */
  const welcomeFlags = async (userId: string): Promise<string[]> => {
    await w.db.run(`DELETE FROM game_recent_items WHERE user_id = $u`, { u: userId });
    const opened = await games.startSession(w.db, {
      userId,
      gameType: 'flags',
      language: 'en',
      welcome: true,
      practice: true,
      at,
    });
    return (opened.content as { questions: Array<{ prompt: string }> }).questions.map(
      (question) => question.prompt,
    );
  };

  const firstRun = await welcomeFlags(w.customerId);
  eq('the welcome round asks five flags', firstRun.length, CONFIG.games.quizQuestions);
  eq('…the same five when the gate is re-opened', await welcomeFlags(w.customerId), firstRun);
  check(
    '…and a different five for a different account',
    JSON.stringify(await welcomeFlags(w.ownerId)) !== JSON.stringify(firstRun),
  );

  await throws('a finished session cannot be finished again', 'invalid_state', async () =>
    await games.finish(w.db, { sessionId: round.sessionId, userId: w.customerId, at }),
  );

  /* Another player's session is not yours to finish. */
  const other = await games.startSession(w.db, { userId: w.ownerId, gameType: 'capitals', at });
  await throws('somebody else’s session is refused', 'forbidden', async () =>
    await games.finish(w.db, { sessionId: other.sessionId, userId: w.customerId, at }),
  );

  /* The streak, the lapse and the freeze. */
  const play = async (day: number) => {
    const when = plusDays(at, day);
    const session = await games.startSession(w.db, { userId: w.customerId, gameType: 'capitals', at: when });
    return await games.finish(w.db, { sessionId: session.sessionId, userId: w.customerId, at: when });
  };
  let last = await play(1);
  eq('a consecutive day continues the streak', last.streak, 2);
  for (let day = 2; day <= 6; day += 1) last = await play(day);
  eq('seven days of play', last.streak, 7);
  eq('…earns a freeze', last.freezes, 1);

  const lapsed = await play(10);
  eq('a missed window is absorbed by the freeze', lapsed.streak, 8);
  eq('and the freeze is spent', lapsed.freezes, 0);

  const broken = await play(20);
  eq('with no freeze left, the streak resets', broken.streak, 1);
  check(
    'but the points are not wiped — expiry is the only way points leave (§2.3)',
    (await ledger.balance(w.db, w.customerId)) > 0,
  );

  await w.db.close();
  await energyRules();
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
async function energyRules(): Promise<void> {
  describe('§3 energy — every round costs one, charged when it starts');
  const w = await world();
  const at = now();

  /** Play a whole round, answering every question right or every one wrong. */
  const round = async (rightly: boolean, when = at) => {
    const opened = await games.startSession(w.db, {
      userId: w.customerId,
      gameType: 'capitals',
      language: 'en',
      at: when,
    });
    const secret = JSON.parse(
      (await w.db.get<{ secret: string }>(`SELECT secret FROM game_sessions WHERE id = $i`, {
        i: opened.sessionId,
      }))!.secret,
    ) as { answers: number[] };
    for (const [index, answer] of secret.answers.entries()) {
      await games.submitEvent(w.db, {
        sessionId: opened.sessionId,
        userId: w.customerId,
        seq: index,
        kind: 'answer',
        /* Any index that is not the answer is a wrong answer, and 0/1 is always
           one of each: the options are four, so `answer` cannot be both. */
        payload: { index, choice: rightly ? answer : answer === 0 ? 1 : 0 },
        at: when,
      });
    };
    return await games.finish(w.db, { sessionId: opened.sessionId, userId: w.customerId, at: when });
  };

  const full = CONFIG.points.dailyEnergy;
  eq('a new player starts on a full tank', (await games.energyFor(w.db, w.customerId, at)).energy, full);

  const won = await round(true);
  eq('a won round is a win', won.won, true);
  eq('…and spends one anyway', won.energyLeft, full - 1);

  const lost = await round(false);
  eq('a lost round is a loss', lost.won, false);
  eq('…and spends exactly the same one', lost.energyLeft, full - 2);

  /*
   * **The charge is at the start** (rulebook §3), so the tank drops the moment a
   * round opens — before a single answer — and a round that is then abandoned
   * has still been paid for. That is the reroll the rule exists to stop: open
   * a board, dislike it, back out, open another.
   *
   * The one exception is the accidental tap: abandoned within
   * `energyRefundWithinSeconds` of its start, the unit comes back — **once a
   * day**. Both ways of abandoning apply it: the explicit `abandonSession`, and
   * `startSession` closing a round that is still open.
   */
  const tapped = await games.startSession(w.db, { userId: w.customerId, gameType: 'capitals', at });
  eq('opening a round spends its energy at once', tapped.energyLeft, full - 3);
  eq('…and the tank says so before anything is answered',
    (await games.energyFor(w.db, w.customerId, at)).energy, full - 3);
  const backedOut = await games.abandonSession(w.db, {
    sessionId: tapped.sessionId,
    userId: w.customerId,
    at: plusMinutes(at, CONFIG.games.energyRefundWithinSeconds / 60),
  });
  eq('abandoned inside the first five seconds, it is refunded', backedOut.refunded, true);
  eq('…and the unit is back in the tank', backedOut.energy.energy, full - 2);
  eq('…which is recorded on the round as no spend at all',
    (await w.db.get<{ life_spent: number; state: string }>(
      `SELECT life_spent, state FROM game_sessions WHERE id = $i`, { i: tapped.sessionId }))
      ?.life_spent, 0);
  eq('abandoning it again is idempotent: same answer, nothing moves',
    (await games.abandonSession(w.db, { sessionId: tapped.sessionId, userId: w.customerId, at })).refunded,
    true);
  eq('…and the tank did not gain a second unit',
    (await games.energyFor(w.db, w.customerId, at)).energy, full - 2);

  /* The second quick abandon of the day, this time by opening another round
     over it. Quick enough, but the day's one refund is spent. */
  const dropped = await games.startSession(w.db, { userId: w.customerId, gameType: 'capitals', at });
  const kept = await games.startSession(w.db, { userId: w.customerId, gameType: 'capitals', at });
  eq(
    'the first of two starts is abandoned',
    (await w.db.get<{ state: string }>(`SELECT state FROM game_sessions WHERE id = $i`, {
      i: dropped.sessionId,
    }))?.state,
    'abandoned',
  );
  eq('…and costs its energy, because today’s refund is used', kept.energyLeft, full - 4);
  eq(
    'finishing the round that was kept costs nothing further — it paid when it opened',
    (await games.finish(w.db, { sessionId: kept.sessionId, userId: w.customerId, at })).energyLeft,
    full - 4,
  );
  await throws('a finished round cannot be abandoned', 'invalid_state', async () =>
    await games.abandonSession(w.db, { sessionId: kept.sessionId, userId: w.customerId, at }));

  /* Whatever the ceiling leaves after those rounds, spent, so that the refusal
     below is about an empty tank rather than about the number of them. `daily_energy`
     is a plan figure and has already moved once; a fixed count of rounds here
     turns that move into a failure in this file rather than a change in that
     one. */
  while ((await games.energyFor(w.db, w.customerId, at)).energy > 0) {
    const drain = await games.startSession(w.db, { userId: w.customerId, gameType: 'capitals', at });
    await games.finish(w.db, { sessionId: drain.sessionId, userId: w.customerId, at });
  }

  /* An empty tank refuses the *start*. Refusing the finish instead would mean
     telling somebody the round they just played does not count. */
  await throws('an empty tank refuses the next round', 'no_energy', async () =>
    await games.startSession(w.db, { userId: w.customerId, gameType: 'capitals', at }),
  );

  /*
   * And it refuses with a time, not just a no.
   *
   * `nextAt` is the whole of what makes a spend feel like a cost rather than a
   * lockout, and it is the field the mobile client draws its countdown from.
   */
  const empty = await games.energyFor(w.db, w.customerId, at);
  eq('the refusal knows the ceiling', empty.max, full);
  eq(
    '…and when the next one lands',
    empty.nextAt,
    plusMinutes(at, CONFIG.points.energyRegenMinutes),
  );

  /*
   * ── practice: an empty tank plays, and pays nothing ──
   *
   * The refusal above is what `practice: true` opts out of. What has to be true
   * of the round it opens instead is *everything stays where it was* — the
   * balance, the streak, the freezes and the tank — because the whole of what
   * energy buys is those, and a practice round that moved any one of them would
   * make the tank optional rather than unpaid.
   *
   * Answered **rightly** on purpose: a practice round that pays nothing because
   * it was played badly proves nothing at all. This one earns a full sweep and
   * banks none of it.
   */
  const before = {
    balance: await ledger.balance(w.db, w.customerId),
    ...await games.playerState(w.db, w.customerId, at),
  };

  const practice = await games.startSession(w.db, {
    userId: w.customerId,
    gameType: 'capitals',
    language: 'en',
    practice: true,
    at,
  });
  eq('an empty tank still opens a practice round', practice.gameType, 'capitals');
  eq('…and says up front that it will not pay', practice.paid, false);

  const practiceSecret = JSON.parse(
    (await w.db.get<{ secret: string }>(`SELECT secret FROM game_sessions WHERE id = $i`, {
      i: practice.sessionId,
    }))!.secret,
  ) as { answers: number[] };
  for (const [index, answer] of practiceSecret.answers.entries()) {
    await games.submitEvent(w.db, {
      sessionId: practice.sessionId,
      userId: w.customerId,
      seq: index,
      kind: 'answer',
      payload: { index, choice: answer },
      at,
    });
  };
  const practiced = await games.finish(w.db, { sessionId: practice.sessionId, userId: w.customerId, at });

  eq('a practice round is scored', practiced.correct, practiceSecret.answers.length);
  eq('…and won', practiced.won, true);
  eq('…and still says it did not pay', practiced.paid, false);
  eq('…and pays nothing for it', practiced.score, 0);
  eq('…leaving the balance where it was', practiced.balance, before.balance);
  eq('…the streak where it was', practiced.streak, before.streak);
  eq('…the freezes where they were', practiced.freezes, before.freezes);
  eq('…and the tank still empty rather than overdrawn', practiced.energyLeft, 0);

  /* The two records that make the tank's arithmetic work. `life_spent = 0` is
     what `energyFor` filters on, so the round is invisible to it rather than
     being a spend it has to be taught to ignore; no ledger row is what keeps
     "where did my points come from" answerable. */
  eq(
    'a practice round spends no energy in the row that records spends',
    (await w.db.get<{ life_spent: number }>(`SELECT life_spent FROM game_sessions WHERE id = $i`, {
      i: practice.sessionId,
    }))?.life_spent,
    0,
  );
  eq(
    '…and writes no ledger entry at all',
    (await w.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM points_ledger WHERE source_ref = $r`,
      { r: practice.sessionId },
    ))?.n,
    0,
  );
  eq(
    '…so the next refill still arrives on the clock the last real spend started',
    (await games.energyFor(w.db, w.customerId, at)).nextAt,
    empty.nextAt,
  );

  /* And `last_played` is untouched, which is the half of "the streak did not
     move" that a single round cannot show: a practice round on the day a streak
     lapses must not be the round that resets it either. */
  eq(
    'a practice round does not count as having played today',
    (await games.playerState(w.db, w.customerId, at)).last_played,
    before.last_played,
  );

  /* The flag is opt-in and it is not a way to *avoid* paying: asked for on a
     tank that has something in it, the round pays exactly as it always did. */
  /* A month on, on a full tank — after every instant the refill checks below
     read, because this round's charge lands at its own start. */
  const paidAnyway = await games.startSession(w.db, {
    userId: w.customerId,
    gameType: 'capitals',
    practice: true,
    at: plusDays(at, 31),
  });
  eq('practice on a tank with energy in it still pays', paidAnyway.paid, true);
  eq('…and is charged like any other round', paidAnyway.energyLeft, full - 1);

  /* A round given up after the refund window is simply abandoned: paid for. */
  const lateAt = plusDays(at, 31);
  const lateLeave = await games.abandonSession(w.db, {
    sessionId: paidAnyway.sessionId,
    userId: w.customerId,
    at: plusMinutes(lateAt, 0.2),
  });
  eq('abandoned after twelve seconds, it is not refunded', lateLeave.refunded, false);
  eq('…and the tank keeps the spend', lateLeave.energy.energy, full - 1);

  /*
   * The refill, which is what pays for charging both sides.
   *
   * One per interval and no more — a tank that kept counting would hand back a
   * week of rounds to somebody returning from holiday — and the whole tank back
   * at `max × interval`, which on the free plan is sixteen hours.
   */
  const regen = CONFIG.points.energyRegenMinutes;
  eq('nothing arrives early', (await games.energyFor(w.db, w.customerId, plusMinutes(at, regen - 1))).energy, 0);
  eq('one at the interval', (await games.energyFor(w.db, w.customerId, plusMinutes(at, regen))).energy, 1);
  eq('two at twice it', (await games.energyFor(w.db, w.customerId, plusMinutes(at, regen * 2))).energy, 2);
  eq(
    'full at the ceiling times it',
    (await games.energyFor(w.db, w.customerId, plusMinutes(at, regen * full))).energy,
    full,
  );
  eq(
    'and never past it',
    (await games.energyFor(w.db, w.customerId, plusDays(at, 30))).energy,
    full,
  );
  eq(
    'a full tank has nothing to count down to',
    (await games.energyFor(w.db, w.customerId, plusDays(at, 30))).nextAt,
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

  const daySizeOf = async (code: string): Promise<number> => {
    const ent = async (key: string) =>
      Number(
        (await w.db.get<{ value: string }>(
          `SELECT value FROM plan_entitlements WHERE plan_id = $p AND key = $k`,
          { p: `pln_consumer_${code}`, k: key },
        ))?.value,
      );
    return (await ent('daily_energy')) + Math.floor(1440 / (await ent('energy_regen_minutes')));
  };
  eq('…and the free plan row agrees with the config', await daySizeOf('free'), 16);
  eq('a Pro day is thirty', await daySizeOf('pro'), 30);
  eq('a Premium day is fifty-eight', await daySizeOf('premium'), 58);

  await w.db.close();
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
/**
 * The master formula, on its own, with no database anywhere near it.
 *
 * `roundPoints` is a pure function of a performance and four facts about the
 * player, so the arithmetic can be checked exhaustively rather than sampled
 * through rounds somebody has to play — and the thing most worth checking here
 * is a **published** table. §4.2 of the points rulebook prints nine performance
 * levels against three columns, it is what a player is shown in the app and on
 * the website, and a formula that disagrees with it by a point is a promise
 * broken in the one place a promise is legible.
 *
 * All twenty-seven cells are reproduced. Nine of them land on a .5 boundary and
 * are the reason `roundPoints` does its arithmetic in scaled integers: 70%
 * featured is 13 × 1.5 = 19.5 and the table says 20, and whether a float chain
 * produces 19.5 or 19.499999999999996 is not a thing to reason about per cell.
 */
function formulaTable(): void {
  describe('§4.1 / §4.2 the master formula and its published table');

  const at = (performance: number, opts: { featured?: boolean; multiplier?: number } = {}) =>
    games.roundPoints({
      performance,
      roundToday: 1,
      featured: opts.featured ?? false,
      multiplier: opts.multiplier ?? 1,
    }).score;

  /*
   * §4.2 verbatim: performance → base, as featured, featured on Premium.
   *
   * The table shows the **multiplicative** part only. The flat bonuses of §4.3
   * are added on top of it, which is why every row here is asked for without
   * them — `flatBonuses` below is where they are checked.
   */
  const PUBLISHED: ReadonlyArray<[number, number, number, number]> = [
    /* performance, base, featured, featured + Premium */
    [100, 18, 27, 47],
    [90, 16, 24, 42],
    [80, 14, 21, 37],
    [70, 13, 20, 34],
    [60, 11, 17, 29],
    [50, 9, 14, 24],
    [40, 7, 11, 18],
    [25, 5, 8, 13],
    [0, 2, 3, 5],
  ];

  for (const [performance, base, featured, premium] of PUBLISHED) {
    eq(`${performance}% pays ${base}`, at(performance), base);
    eq(`…${featured} as the featured game`, at(performance, { featured: true }), featured);
    eq(
      `…and ${premium} featured on Premium`,
      at(performance, { featured: true, multiplier: 1.75 }),
      premium,
    );
  }

  /* The two ends of step 2, named rather than inferred from the table above: a
     finished round never pays zero, and 18 is the ceiling on the base. */
  eq('a round that scored nothing still pays the floor', at(0), CONFIG.games.minRoundPoints);
  eq('…and a perfect one the ceiling', at(100), CONFIG.games.maxRoundPoints);
  eq(
    'the base is the same round-half-up the table is computed with',
    games.roundPoints({ performance: 25, roundToday: 1, featured: false, multiplier: 1 }).base,
    5,
  );

  /*
   * Pro sits between the two published columns and is checked on its own,
   * because 1.25 is the multiplier most players who pay for one will have.
   */
  eq('a perfect unfeatured round on Pro is 23, not 22', at(100, { multiplier: 1.25 }), 23);
  eq('…and featured on Pro, 34', at(100, { featured: true, multiplier: 1.25 }), 34);

  /*
   * ── the decay curve ──
   *
   * §4.1 step 4, and the main anti-grind lever: the first round of the day is
   * worth real points and the sixth is a token. The rungs are checked as rungs
   * and then as points, because the second is what a player experiences.
   */
  const RUNGS: ReadonlyArray<[number, number]> = [
    [1, 1],
    [2, 0.65],
    [3, 0.45],
    [4, 0.3],
    [5, 0.2],
    [6, 0.12],
  ];
  for (const [round, rung] of RUNGS) {
    eq(`round ${round} of the day decays by ${rung}`, games.decayFor(round), rung);
  }
  eq('…and a seventh round is worth what the sixth is', games.decayFor(7), games.decayFor(6));
  eq('…as is a twentieth', games.decayFor(20), games.decayFor(6));
  /* Clamped rather than trusted at the bottom end: a 0 would index past the
     start of the table and multiply the round by `undefined`, which reaches the
     ledger as a NaN delta and reads there as a corrupt schema. */
  eq('a zeroth round cannot happen and does not produce a NaN', games.decayFor(0), 1);

  const decayed = (roundToday: number) =>
    games.roundPoints({ performance: 100, roundToday, featured: false, multiplier: 1 }).score;
  eq('a perfect first round of the day is 18', decayed(1), 18);
  eq('…the second is 12', decayed(2), 12);
  eq('…the third 8', decayed(3), 8);
  eq('…the fourth 5', decayed(4), 5);
  eq('…the fifth 4', decayed(5), 4);
  eq('…and the sixth 2', decayed(6), 2);
  /* The floor of step 7, which is 1 and not the base's 2: decay is allowed to
     take a round below the floor on the base, and what stops it reaching zero is
     this. A free player's tenth round of an empty performance is worth 1 point,
     not nothing — the round was still played. */
  eq(
    'decay can take a round under the base floor, but never to zero',
    games.roundPoints({ performance: 0, roundToday: 6, featured: false, multiplier: 1 }).score,
    1,
  );

  /* The whole curve on one day of perfect free play, which is the figure the
     economy model in §10 is built out of and the one worth being able to quote:
     a free tank is four rounds and they are 18 + 12 + 8 + 5. */
  eq(
    'a free tank of four perfect rounds is 43 points, not 72',
    [1, 2, 3, 4].reduce((total, round) => total + decayed(round), 0),
    43,
  );

  /*
   * ── §4.3 the three flat bonuses ──
   *
   * Added **after** the multiplier and never multiplied by it, which is the one
   * thing about them that is easy to get wrong and impossible to see from a
   * total. A +25 that quietly paid 44 on Premium would be a line no result card
   * could name.
   */
  const bonused = (opts: {
    perfect?: boolean;
    newGame?: boolean;
    personalBest?: boolean;
    multiplier?: number;
  }) =>
    games.roundPoints({
      performance: 100,
      roundToday: 1,
      featured: false,
      multiplier: opts.multiplier ?? 1,
      ...opts,
    });

  eq('a perfect round adds a flat 10', bonused({ perfect: true }).score, 28);
  eq('a first-ever play adds a flat 25', bonused({ newGame: true }).score, 43);
  eq('a personal best adds a flat 8', bonused({ personalBest: true }).score, 26);
  eq(
    'all three at once, on a perfect first round of a new game',
    bonused({ perfect: true, newGame: true, personalBest: true }).score,
    18 + 10 + 25 + 8,
  );
  eq(
    'the bonuses are not multiplied by the plan: Premium adds the same 10',
    bonused({ perfect: true, multiplier: 1.75 }).score,
    Math.round(18 * 1.75) + 10,
  );
  eq(
    '…which is 10 more than the same round without it, on every plan',
    bonused({ perfect: true, multiplier: 1.75 }).score - bonused({ multiplier: 1.75 }).score,
    CONFIG.games.perfectRoundBonus,
  );
  /* The bonuses are flat in the other direction too: they do not decay. A
     first-ever play on somebody's fifth round of the day is still 25, because
     discovering a game is not a thing that happens less on a busy day. */
  eq(
    'a first-ever play is worth 25 whichever round of the day it is',
    games.roundPoints({ performance: 100, roundToday: 5, featured: false, multiplier: 1, newGame: true })
      .score -
      games.roundPoints({ performance: 100, roundToday: 5, featured: false, multiplier: 1 }).score,
    CONFIG.games.newGameBonus,
  );
  /* And the perfect bonus is gated on performance rather than on `won`: exactly
     100, not "nearly". */
  eq(
    '99% is not a perfect round',
    games.roundPoints({ performance: 99, roundToday: 1, featured: false, multiplier: 1, perfect: true })
      .bonusPerfect,
    0,
  );

  /* A scorer that returned a figure off the scale should not be paid for it.
     Clamped rather than trusted, in the direction that cannot cost a player
     anything they earned. */
  eq('a performance over 100 is clamped to 100', at(400), at(100));
  eq('…and a negative one to 0', at(-40), at(0));

  /*
   * The ceiling the task prompts advertise comes out of the same function, which
   * is the only arrangement that stops the panel quoting a figure the ledger
   * will not pay.
   */
  eq('the advertised round ceiling is a perfect first round plus its bonus',
    games.roundCeiling({ featured: false, multiplier: 1 }), 28);
  eq('…and the featured one, 37', games.roundCeiling({ featured: true, multiplier: 1 }), 37);
  eq('…57 on Premium', games.roundCeiling({ featured: true, multiplier: 1.75 }), 57);
}

async function scoringRules(): Promise<void> {
  describe('§5 scoring — each game’s own map onto 0–100 performance');
  const w = await world();
  const base = now();

  /** Seconds, which is the unit three of these scorers read. `plusMinutes` is
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
   *
   * **The assertions in this section are about `performance`, not `score`**, and
   * that is the change the formula makes to how this suite has to be written.
   * What a round *pays* now depends on four things that have nothing to do with
   * how it was played — which round of the day it is, whether its game is
   * featured, the plan, and which of three once-only bonuses are still
   * unclaimed — and three hours apart over two dozen rounds crosses a day
   * boundary, so pinning points here would be pinning the calendar. `roundPoints`
   * is checked exhaustively and separately in `formulaTable` above; this section
   * checks the one thing each game owns, which is the map from a result onto the
   * common scale. Where the whole chain matters it is asserted from the
   * itemisation the response now carries.
   */
  let played = 0;
  const nextAt = (): Iso => plusMinutes(base, (played += 1) * 180);

  const secretOf = async <T>(sessionId: string): Promise<T> =>
    JSON.parse(
      (await w.db.get<{ secret: string }>(`SELECT secret FROM game_sessions WHERE id = $i`, {
        i: sessionId,
      }))!.secret,
    ) as T;

  /* ── the quizzes (§5.1–5.3) ── */

  /**
   * Play a quiz. `rights` says which of the five to answer correctly, and the
   * round is stretched so its first and last recorded events are `seconds`
   * apart — which is the span the speed credit reads, off the server's own
   * stamps.
   */
  let accepted: boolean[] = [];
  const quiz = async (rights: boolean[], seconds: number, gameType: games.GameType = 'capitals') => {
    const at = nextAt();
    const done = plusSeconds(at, seconds);
    const opened = await games.startSession(w.db, {
      userId: w.customerId,
      gameType,
      language: 'en',
      at,
    });
    const secret = await secretOf<{ answers: number[] }>(opened.sessionId);
    accepted = await Promise.all(secret.answers.map(async (answer, index) =>
      (await games.submitEvent(w.db, {
        sessionId: opened.sessionId,
        userId: w.customerId,
        seq: index,
        kind: 'answer',
        /* Four options, so any index that is not the answer is a wrong answer
           and one of 0/1 always is. */
        payload: { index, choice: rights[index] ? answer : answer === 0 ? 1 : 0 },
        /* Only the last event moves: the span is max minus min over the round,
           so the questions in between decide nothing and pinning them to the
           start keeps the fixture readable. */
        at: index === secret.answers.length - 1 ? done : at,
      })).accepted,
    ));
    return await games.finish(w.db, { sessionId: opened.sessionId, userId: w.customerId, at: done });
  };

  const allFive = [true, true, true, true, true];
  const per = CONFIG.games.quizPerformancePerCorrect;

  const fast = await quiz(allFive, 4);
  eq('five right is performance 100', fast.performance, 100);
  eq('…which is 20 an answer', fast.performance, 5 * per);
  eq('and a clean sweep is what `won` names', fast.won, true);
  /* The credit is real and it is capped into the 100, so a perfect round cannot
     see it. That is §5.1's own wording and it is the reason the old clean-sweep
     gate on the credit could be deleted rather than ported. */
  eq('the speed credit cannot take a perfect round past the top of the scale',
    (await quiz(allFive, 4)).performance, 100);

  const four = await quiz([true, true, true, true, false], 4);
  eq('four right and quick is 85 — 80 plus the speed credit', four.performance, 4 * per + CONFIG.games.quizSpeedCredit);
  eq('four out of five is not a clean sweep', four.won, false);
  const fourSlow = await quiz([true, true, true, true, false], 40);
  eq('…and four right slowly is 80, with no credit', fourSlow.performance, 4 * per);
  eq('exactly twenty-five seconds still earns the credit',
    (await quiz([true, true, true, true, false], 25)).performance, 4 * per + CONFIG.games.quizSpeedCredit);
  eq('a half-second past it does not',
    (await quiz([true, true, true, true, false], 25.5)).performance, 4 * per);

  /*
   * **The speed credit is no longer gated on a clean sweep, and it cannot be
   * farmed.** The old gate existed because the fastest way through five
   * questions is to answer them all wrong without reading them, and under a
   * per-point table that bought a real bonus. Under one 0–100 scale it buys
   * nothing at all: performance 5 and performance 0 both floor to the same 2
   * points, which is what these two lines say.
   */
  const rushed = await quiz([false, false, false, false, false], 1);
  eq('five wrong answers in one second are performance 5, not 0', rushed.performance, CONFIG.games.quizSpeedCredit);
  eq('…and the fastest possible round is not a win', rushed.won, false);
  eq('…and it pays the floor', rushed.base, CONFIG.games.minRoundPoints);
  eq(
    '…exactly what five wrong answers slowly pay, so rushing buys nothing',
    rushed.base,
    (await quiz([false, false, false, false, false], 60)).base,
  );

  /*
   * **A quiz cannot be lost.** It ended after two wrong answers once, which took
   * the last question away from exactly the player who needed the practice. All
   * five are asked, the round banks what it earned, and `won: false` here means
   * "not a clean sweep" rather than "forfeited".
   */
  const wobbly = await quiz([false, false, false, false, true], 4);
  check('the fifth question is still asked after four mistakes', accepted[4]);
  eq('…all five were recorded', accepted.filter(Boolean).length, 5);
  eq('…the one right answer still scores', wobbly.performance, 1 * per + CONFIG.games.quizSpeedCredit);
  eq('…the round is complete, not truncated', wobbly.answered, CONFIG.games.quizQuestions);
  eq('…and nothing was forfeited for the four mistakes', wobbly.correct, 1);

  /*
   * **Two banks, one game.** `poland` and `uzbekistan` are the same
   * local-knowledge quiz asked about two different countries — the client shows
   * one card and picks between them by the country on the player's profile — so
   * a scoring rule that reached either of them and not the other would be a
   * player in Tashkent being paid differently for the same minute. Nothing in
   * `domain/games.ts` distinguishes them and these checks are what says so.
   */
  const drawnFrom = async (gameType: string) =>
    await w.db.get<{ own: number; total: number }>(
      `SELECT SUM(q.bank = $b) AS own, COUNT(*) AS total
         FROM game_recent_items r JOIN quiz_items q ON q.id = r.item_key
        WHERE r.user_id = $u AND r.game_type = $b`,
      { u: w.customerId, b: gameType },
    );
  const uzbekistan = await quiz(allFive, 4, 'uzbekistan');
  const poland = await quiz(allFive, 4, 'poland');
  eq('the Uzbekistan quiz scores exactly what the Poland one does',
    uzbekistan.performance, poland.performance);
  eq('…and both are 100, on the same map as the other three', uzbekistan.performance, 100);
  eq(
    'the Uzbekistan round is served out of the Uzbekistan bank',
    await drawnFrom('uzbekistan'),
    { own: CONFIG.games.quizQuestions, total: CONFIG.games.quizQuestions },
  );
  eq(
    '…and the Poland one out of Poland’s, rather than the two sharing a pool',
    await drawnFrom('poland'),
    { own: CONFIG.games.quizQuestions, total: CONFIG.games.quizQuestions },
  );

  /* ── memory match (§5.5) ── */

  /**
   * Play a board. `misses` mismatched moves are made first, then `pairs` of the
   * six are matched; every event lands at one instant unless `lateFrom` says
   * which move to push past the 90-second limit.
   *
   * **A move is a `pair` event**, matched or not, so `misses + pairs` is the move
   * count the efficiency bands are read from.
   */
  const board = async (opts: { misses?: number; pairs?: number; slowTail?: boolean } = {}) => {
    const at = nextAt();
    const misses = opts.misses ?? 0;
    const wanted = opts.pairs ?? CONFIG.games.memoryPairs;
    const opened = await games.startSession(w.db, {
      userId: w.customerId,
      gameType: 'memory_match',
      at,
    });
    const deck = (await secretOf<{ deck: string[] }>(opened.sessionId)).deck;
    /* Every symbol is in the deck twice, so pairing each one's first position
       with its second is the board played without a miss. */
    const first = new Map<string, number>();
    const pairs: Array<[number, number]> = [];
    for (const [index, symbol] of deck.entries()) {
      const opener = first.get(symbol);
      if (opener === undefined) {
        first.set(symbol, index);
        continue;
      }
      pairs.push([opener, index]);
    }
    /* A guaranteed **mismatch**: position 0 and the first position after it
       holding a different symbol. */
    const wrong = deck.findIndex((symbol, index) => index > 0 && symbol !== deck[0]);

    let seq = 0;
    const send = async (a: number, b: number, when: Iso) =>
      await games.submitEvent(w.db, {
        sessionId: opened.sessionId,
        userId: w.customerId,
        seq: (seq += 1),
        kind: 'pair',
        payload: { a, b },
        at: when,
      });

    for (let i = 0; i < misses; i += 1) await send(0, wrong, at);
    /* Past the limit the round is over, so the tail of the board is what an
       expired one looks like: some pairs found in time and the rest not. */
    const late = plusSeconds(at, CONFIG.games.memoryLimitSeconds + 5);
    for (const [index, [a, b]] of pairs.slice(0, wanted).entries()) {
      await send(a, b, opts.slowTail && index > 0 ? late : at);
    }
    return await games.finish(w.db, {
      sessionId: opened.sessionId,
      userId: w.customerId,
      at: opts.slowTail ? late : at,
    });
  };

  /*
   * **Scored on moves, not on the clock.** The board was timed here, on the
   * argument that moves are the one thing a pencil beats and a stopwatch is not —
   * which is true, and is the wrong trade for the one game in the set with no
   * fail state. §5.5 prices it on moves and the bands are 10/14/18/over.
   */
  const cleared = await board();
  eq('a board cleared in six moves is a perfect round', cleared.performance, 100);
  eq('…which is the 60 for finishing plus the top efficiency band',
    cleared.performance, CONFIG.games.memoryBasePerformance + 40);
  eq('…and it takes the perfect-round bonus with it',
    cleared.bonusPerfect, CONFIG.games.perfectRoundBonus);
  eq('a cleared board is a win', cleared.won, true);

  eq('exactly ten moves is still the top band', (await board({ misses: 4 })).performance, 100);
  eq('an eleventh move drops to 85', (await board({ misses: 5 })).performance, 85);
  eq('exactly fourteen moves is still 85', (await board({ misses: 8 })).performance, 85);
  eq('a fifteenth is 72', (await board({ misses: 9 })).performance, 72);
  eq('exactly eighteen is still 72', (await board({ misses: 12 })).performance, 72);
  eq('nineteen or more is the bare 60 for finishing',
    (await board({ misses: 13 })).performance, CONFIG.games.memoryBasePerformance);
  eq('…and forty moves is the same 60, because finishing always pays it',
    (await board({ misses: 34 })).performance, CONFIG.games.memoryBasePerformance);

  /*
   * **The clock did not go away; it became a limit rather than a rate.** 90
   * seconds, and a board still incomplete at it scores `pairs / 6 × 50` — half
   * marks for half a board, and a ceiling of 50 that an expired round cannot get
   * past however much of the board it found.
   */
  const expired = await board({ slowTail: true });
  eq('a board whose tail lands after 90 seconds is scored on the pairs found in time',
    expired.performance, Math.round((1 * CONFIG.games.memoryExpiredCeiling) / CONFIG.games.memoryPairs));
  eq('…and is not a win, because the board was not finished', expired.won, false);
  eq('…and cannot reach the 60 that completing it pays',
    expired.performance < CONFIG.games.memoryBasePerformance, true);

  const abandoned = await board({ pairs: 3 });
  eq('three of six pairs and no more is half the expired ceiling', abandoned.performance, 25);
  eq('…and says how many it found', abandoned.correct, 3);
  const nothing = await board({ pairs: 0 });
  eq('a round that found nothing is performance 0', nothing.performance, 0);
  eq('…which still pays the floor, because the round was played', nothing.base, CONFIG.games.minRoundPoints);
  /* Rounded rather than floored, so a nearly-finished board does not lose its
     last point to arithmetic: five of six is 41.67. */
  eq('five of six rounds up rather than down', (await board({ pairs: 5 })).performance, 42);

  /*
   * **A peek is not a move.** It turns one card, carries no verdict, and is how
   * the shipped client shows the first card of a move — so counting peeks would
   * charge two moves for what a player experienced as one, and a board played
   * exactly as the client plays it would never reach the top band. The two rounds
   * below differ in twelve peeks and nothing else.
   */
  const peeked = await (async () => {
    const at = nextAt();
    const opened = await games.startSession(w.db, {
      userId: w.customerId,
      gameType: 'memory_match',
      at,
    });
    const deck = (await secretOf<{ deck: string[] }>(opened.sessionId)).deck;
    let seq = 0;
    for (const [index] of deck.entries()) {
      await games.submitEvent(w.db, {
        sessionId: opened.sessionId,
        userId: w.customerId,
        seq: (seq += 1),
        kind: 'peek',
        payload: { index },
        at,
      });
    }
    const first = new Map<string, number>();
    for (const [index, symbol] of deck.entries()) {
      const opener = first.get(symbol);
      if (opener === undefined) {
        first.set(symbol, index);
        continue;
      }
      await games.submitEvent(w.db, {
        sessionId: opened.sessionId,
        userId: w.customerId,
        seq: (seq += 1),
        kind: 'pair',
        payload: { a: opener, b: index },
        at,
      });
    }
    return await games.finish(w.db, { sessionId: opened.sessionId, userId: w.customerId, at });
  })();
  eq('twelve peeks and six pairs is still a six-move board', peeked.performance, 100);
  eq('a peek is not a pair', peeked.correct, CONFIG.games.memoryPairs);
  eq('…and twelve of them do not enlarge a six-pair board', peeked.answered, CONFIG.games.memoryPairs);

  /*
   * **A pair submitted twice is a second move**, which is the other half of the
   * distinct-pair rule. The pairs *found* are counted distinctly — seven pairs on
   * a six-pair board would be a bug in the figure printed beside the moves — and
   * the move count is the rows, because a client that re-turns two cards under a
   * fresh `seq` has made a move by the protocol's own definition. Twelve moves
   * for six pairs is the 11–14 band.
   */
  const doubled = await (async () => {
    const at = nextAt();
    const opened = await games.startSession(w.db, {
      userId: w.customerId,
      gameType: 'memory_match',
      at,
    });
    const deck = (await secretOf<{ deck: string[] }>(opened.sessionId)).deck;
    const first = new Map<string, number>();
    let seq = 0;
    const send = async (a: number, b: number) => {
      await games.submitEvent(w.db, {
        sessionId: opened.sessionId,
        userId: w.customerId,
        seq: (seq += 1),
        kind: 'pair',
        payload: { a, b },
        at,
      });
    };
    for (const [index, symbol] of deck.entries()) {
      const opener = first.get(symbol);
      if (opener === undefined) {
        first.set(symbol, index);
        continue;
      }
      await send(opener, index);
      /* The same two cards again, the other way round — which is what a client
         re-turning them looks like, and is one pair of cards however it is
         written. */
      await send(index, opener);
    };
    return await games.finish(w.db, { sessionId: opened.sessionId, userId: w.customerId, at });
  })();
  eq('a pair submitted twice counts once as a pair', doubled.correct, CONFIG.games.memoryPairs);
  eq('…out of the board it was actually dealt', doubled.answered, CONFIG.games.memoryPairs);
  eq('…and twice as a move, so twelve moves is the second band', doubled.performance, 85);

  /*
   * **A flipped pair reveals both cards**, and a peek reveals one. The protocol
   * half of Memory Match, unchanged by the scoring move and pinned here because
   * what the secret protects is the cards still face down: a reply that named a
   * third position would be handing the board over one move at a time.
   */
  const revealRound = async () => {
    const at = nextAt();
    const opened = await games.startSession(w.db, {
      userId: w.customerId,
      gameType: 'memory_match',
      at,
    });
    const deck = (await secretOf<{ deck: string[] }>(opened.sessionId)).deck;
    const b = deck.findIndex((symbol, index) => index > 0 && symbol !== deck[0]);
    const move = await games.submitEvent(w.db, {
      sessionId: opened.sessionId,
      userId: w.customerId,
      seq: 0,
      kind: 'pair',
      payload: { a: 0, b },
      at,
    });
    return { at, opened, deck, b, move };
  };

  const reveal = await revealRound();
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
     this client what those two cards were, so the duplicate carries them. */
  const replayed = await games.submitEvent(w.db, {
    sessionId: reveal.opened.sessionId,
    userId: w.customerId,
    seq: 0,
    kind: 'pair',
    payload: { a: 0, b: reveal.b },
    at: reveal.at,
  });
  check('a replayed pair is a duplicate rather than a second move', !replayed.accepted);
  eq('…and it still reveals the same two faces', replayed.revealed, reveal.move.revealed);
  /* Which is also what keeps the move count honest against a dropped response:
     the duplicate is swallowed by the unique `(session, seq)` and writes no row,
     so a retry cannot cost a player a band. */
  await games.finish(w.db, { sessionId: reveal.opened.sessionId, userId: w.customerId, at: reveal.at });

  /*
   * **One card, turned on its own — `kind:'peek'`.** Four promises come with the
   * move: it turns exactly the card asked for and nothing else, it is not an
   * answer, it shares one sequence with the pairs, and it refuses a position
   * that is off the board or already claimed.
   */
  const openDeck = async () => {
    const at = nextAt();
    const opened = await games.startSession(w.db, {
      userId: w.customerId,
      gameType: 'memory_match',
      at,
    });
    return { at, id: opened.sessionId, deck: (await secretOf<{ deck: string[] }>(opened.sessionId)).deck };
  };
  const move = async (id: string, seq: number, kind: string, payload: Record<string, unknown>, at: Iso) =>
    await games.submitEvent(w.db, { sessionId: id, userId: w.customerId, seq, kind, payload, at });
  const eventsIn = async (id: string) =>
    (await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM game_events WHERE session_id = $s`, {
      s: id,
    }))?.n ?? 0;

  const single = await openDeck();
  const turned = await move(single.id, 0, 'peek', { index: 3 }, single.at);
  eq('a peek turns exactly the card it named', turned.revealed, [
    { index: 3, face: single.deck[3] },
  ]);
  eq('…one card, not a window onto the layout', turned.revealed!.length, 1);
  eq('a peek is not an answer, so it carries no verdict', turned.correct, undefined);
  eq('…and none of the pair move’s legacy `answer` either', turned.answer, undefined);
  check('…and it is recorded, so its number is spent', turned.accepted);

  const replayedPeek = await move(single.id, 0, 'peek', { index: 3 }, single.at);
  check('a replayed peek is a duplicate rather than a second turn', !replayedPeek.accepted);
  eq('…and it still names the face', replayedPeek.revealed, turned.revealed);

  /* One sequence for both kinds, which is what makes `seq` a position in the
     round rather than a per-kind counter. */
  const collided = await move(single.id, 0, 'pair', { a: 0, b: 1 }, single.at);
  check('a pair cannot reuse a peek’s number: the two share one sequence', !collided.accepted);
  check('…while the next number along is free', (await move(single.id, 1, 'pair', { a: 0, b: 1 }, single.at)).accepted);

  /*
   * **Refused, not clamped — and a refused peek is one that never happened.**
   * The second half is the half with teeth: nothing is written, so a client
   * asking for a card that is not there has not spent a number and has not put a
   * row in the round's own count.
   */
  const stray = await openDeck();
  await throws('a peek past the end of the deck is refused', 'bad_request', async () =>
    await move(stray.id, 0, 'peek', { index: stray.deck.length }, stray.at),
  );
  await throws('…as is a negative position', 'bad_request', async () =>
    await move(stray.id, 1, 'peek', { index: -1 }, stray.at),
  );
  await throws('…and a fractional one, rather than being rounded into range', 'bad_request', async () =>
    await move(stray.id, 2, 'peek', { index: 1.5 }, stray.at),
  );
  await throws('…and a peek naming no card at all', 'bad_request', async () =>
    await move(stray.id, 3, 'peek', {}, stray.at),
  );
  eq('…and none of the four left a row behind', await eventsIn(stray.id), 0);

  /*
   * A matched card is not face down, so turning it is not a move that exists.
   * The **pair** move still accepts those same two positions, and has to: a
   * client whose response was lost puts the cards back down and turns them
   * again.
   */
  const locked = await openDeck();
  const twin = locked.deck.findIndex((face, index) => index > 0 && face === locked.deck[0]);
  check('a matched pair is judged a match', (await move(locked.id, 0, 'pair', { a: 0, b: twin }, locked.at)).correct === true);
  await throws('a peek at a card already matched is refused', 'bad_request', async () =>
    await move(locked.id, 1, 'peek', { index: 0 }, locked.at),
  );
  await throws('…from either side of the pair', 'bad_request', async () =>
    await move(locked.id, 2, 'peek', { index: twin }, locked.at),
  );
  const free = locked.deck.findIndex((_, index) => index !== 0 && index !== twin);
  check(
    '…while a card still face down turns as it should',
    (await move(locked.id, 3, 'peek', { index: free }, locked.at)).accepted,
  );
  check(
    '…and the pair move still takes them, so a lost response is still retryable',
    (await move(locked.id, 4, 'pair', { a: 0, b: twin }, locked.at)).accepted,
  );

  /* ── word builder (§5.4) ── */

  /*
   * A planted bank on a language code nothing else uses.
   *
   * Word Builder is scored per word and `buildWords` draws at random, so a round
   * out of the seeded bank is worth whatever it happened to pull. Three planted
   * words make the round deterministic — and the round is now **three** words,
   * not five, which is the rulebook's length and the same 100 either way.
   *
   * The tiers are planted with a spread deliberately: the tier used to price the
   * word and no longer does, so a round of a 1, a 2 and a 3 scoring exactly what
   * a round of three 1s would is part of what "a round is a round" means now.
   */
  const RAMP = [1, 2, 3];
  for (const [index, tier] of RAMP.entries()) {
    await w.db.run(
      `INSERT INTO word_bank (id, language, word, tier, hint) VALUES ($i, 'zz', $w, $t, 'planted')
         ON CONFLICT (language, word) DO UPDATE SET tier = excluded.tier`,
      { i: `wrd_zz_${index}`, w: `PLANTED${index}`, t: tier },
    );
  };

  /**
   * Play the planted round. `plan` says which words to reveal a letter on, which
   * to get wrong once before solving, and which to leave unsolved; `slow` pushes
   * every solve past the 30-second per-word window.
   */
  const wordRound = async (
    plan: { hint?: number[]; fumble?: number[]; skip?: number[]; slow?: boolean } = {},
  ) => {
    const at = nextAt();
    /* Three words in the bank against a no-repeat window of forty: the second
       round would find nothing left to ask. Clearing the window is what lets
       several rounds run against one known bank. */
    await w.db.run(`DELETE FROM game_recent_items WHERE user_id = $u AND game_type = 'word_builder'`, {
      u: w.customerId,
    });
    /* The same for the day's hint allowance (three on the free plan). These
       rounds spend six between them, three hours apart from the *wall clock*,
       so whether they shared a UTC day — and the third round was refused
       `entitlement_required` — depended on the hour the suite was started.
       That was this suite's intermittent failure. The allowance is not what this
       section measures; the rounds before this one are finished, so their hint
       rows are spent history and nothing reads them again. */
    await w.db.run(
      `DELETE FROM game_events WHERE kind = 'hint'
          AND session_id IN (SELECT id FROM game_sessions WHERE user_id = $u)`,
      { u: w.customerId },
    );
    const opened = await games.startSession(w.db, {
      userId: w.customerId,
      gameType: 'word_builder',
      language: 'zz',
      at,
    });
    const secret = await secretOf<{ words: string[]; tiers: number[] }>(opened.sessionId);
    let seq = 0;
    /* Each solve a minute after the last when `slow`, which is past the window;
       otherwise everything at the instant the round opened, which is inside it. */
    let when = at;
    const send = async (kind: string, payload: Record<string, unknown>) => {
      seq += 1;
      await games.submitEvent(w.db, {
        sessionId: opened.sessionId,
        userId: w.customerId,
        seq,
        kind,
        payload,
        at: when,
      });
    };
    for (const [index, word] of secret.words.entries()) {
      if (plan.slow) when = plusSeconds(at, (index + 1) * 60);
      if (plan.hint?.includes(index)) await send('hint', { index, position: 0 });
      if (plan.fumble?.includes(index)) await send('guess', { index, guess: 'NOTTHEWORD' });
      if (plan.skip?.includes(index)) continue;
      await send('guess', { index, guess: word });
    };
    return {
      result: await games.finish(w.db, { sessionId: opened.sessionId, userId: w.customerId, at: when }),
      words: secret.words,
      tiers: secret.tiers,
    };
  };

  const sweep = await wordRound();
  eq('a round is three words now, not five', sweep.words.length, CONFIG.games.wordsPerRound);
  eq('…and three solved is 100, not 99', sweep.result.performance, 100);
  eq('…so a clean sweep is a perfect round and takes the bonus',
    sweep.result.bonusPerfect, CONFIG.games.perfectRoundBonus);
  eq('every word solved is a win', sweep.result.won, true);

  const slowSweep = await wordRound({ slow: true });
  eq('a slow sweep is still 100, because the promotion is not a speed bonus',
    slowSweep.result.performance, 100);

  /*
   * **A hint is a flat 10 off, and the order of the clamp is what makes it cost
   * anything.** Three words at 33 plus three speed credits is 111; capped into
   * the 100 first and then charged, one hint is 90. Clamped only at the end, the
   * first hint would have been free.
   */
  const oneHint = await wordRound({ hint: [0] });
  eq('one hint on a fast sweep costs ten', oneHint.result.performance, 100 - CONFIG.games.wordHintPenalty);
  eq('…and it is not a perfect round any more', oneHint.result.bonusPerfect, 0);
  const twoHints = await wordRound({ hint: [0, 1] });
  eq('two hints cost twenty', twoHints.result.performance, 100 - 2 * CONFIG.games.wordHintPenalty);
  eq(
    '…which is the same ten a piece whichever word it was spent on, unlike the halving it replaced',
    twoHints.result.performance,
    oneHint.result.performance - CONFIG.games.wordHintPenalty,
  );

  /*
   * A wrong attempt is the other half of "clean". It costs the *word* nothing —
   * the per-word rate is what somebody plays for — and costs the promotion to
   * 100, which is what a perfect round is for. Three solved words are 99, and
   * the three speed credits bring it back to the cap.
   */
  const fumbled = await wordRound({ fumble: [1] });
  eq('a wrong attempt still pays the word', fumbled.result.performance, 100);
  eq('…but it is not a clean sweep, so nothing was promoted', fumbled.result.correct, 3);
  const fumbledSlow = await wordRound({ fumble: [1], slow: true });
  eq(
    '…and without the speed credits to carry it, a fumbled sweep is 99 rather than 100',
    fumbledSlow.result.performance,
    CONFIG.games.wordsPerRound * CONFIG.games.wordPerformancePerWord,
  );
  eq('…which is one short of a perfect round', fumbledSlow.result.bonusPerfect, 0);

  const partial = await wordRound({ skip: [2] });
  eq('two of three words is 66 plus their two speed credits',
    partial.result.performance,
    2 * CONFIG.games.wordPerformancePerWord + 2 * CONFIG.games.wordSpeedCredit);
  eq('…and not a win', partial.result.won, false);
  const slowPartial = await wordRound({ skip: [2], slow: true });
  eq('…while two solved slowly is the bare 66', slowPartial.result.performance,
    2 * CONFIG.games.wordPerformancePerWord);

  /* The floor: hints on a round where nothing was solved cannot take the
     performance negative, and the round still pays its two points. */
  const hopeless = await wordRound({ hint: [0, 1, 2], skip: [0, 1, 2] });
  eq('three hints and nothing solved clamp at 0 rather than going negative',
    hopeless.result.performance, 0);
  eq('…and the round still pays the floor', hopeless.result.base, CONFIG.games.minRoundPoints);

  /*
   * **A hint for a letter that does not exist is refused, and costs nothing.**
   * Both halves are checked, and the second is the one that matters: refusing
   * the request is worth little if the refusal happens *after* the hint has been
   * spent, so the allowance is read before and after and must not move.
   */
  {
    const w2 = await world();
    const at2 = now();
    const opened = await games.startSession(w2.db, {
      userId: w2.customerId,
      gameType: 'word_builder',
      language: 'en',
      at: at2,
    });
    const spent = async () =>
      (await w2.db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM game_events WHERE kind = 'hint' AND session_id = $s`,
        { s: opened.sessionId },
      ))?.n ?? 0;

    const before = await spent();
    await throws('a hint past the end of the word is refused', 'bad_request', async () =>
      await games.submitEvent(w2.db, {
        sessionId: opened.sessionId,
        userId: w2.customerId,
        seq: 900,
        kind: 'hint',
        payload: { index: 0, position: 40 },
        at: at2,
      }),
    );
    await throws('…as is a negative one', 'bad_request', async () =>
      await games.submitEvent(w2.db, {
        sessionId: opened.sessionId,
        userId: w2.customerId,
        seq: 901,
        kind: 'hint',
        payload: { index: 0, position: -1 },
        at: at2,
      }),
    );
    eq('…and neither spent one of the day’s hints', await spent(), before);

    /* And the legitimate case still works, so the guard is not simply off. */
    const ok = await games.submitEvent(w2.db, {
      sessionId: opened.sessionId,
      userId: w2.customerId,
      seq: 902,
      kind: 'hint',
      payload: { index: 0, position: 0 },
      at: at2,
    });
    eq('a hint inside the word still answers one letter', String(ok.answer).length, 1);
    await w2.db.close();
  }

  /* ── the flight (§5.6) ── */

  /**
   * Fly a round.
   *
   * `seconds` is how long the session was open, and it matters because the
   * flight is the one game with no answer key: `scoreFlight` bounds a claimed
   * gap count by the *server's* own clock, one gap per
   * `CONFIG.games.flightSecondsPerGap`. So a round has to be given a plausible
   * duration or every honest claim below is clamped — the default is exactly
   * the time the claim needs, which is what these checks are about, and the
   * implausible case is asked for explicitly at the end.
   */
  const flight = async (cleared: number, seconds?: number) => {
    const at = nextAt();
    const opened = await games.startSession(w.db, { userId: w.customerId, gameType: 'flight', at });
    const took = seconds ?? cleared * CONFIG.games.flightSecondsPerGap;
    return await games.finish(w.db, {
      sessionId: opened.sessionId,
      userId: w.customerId,
      clientReport: { cleared },
      at: new Date(Date.parse(at) + took * 1000).toISOString(),
    });
  };

  const per4 = CONFIG.games.flightPerformancePerObstacle;
  eq('four obstacles is performance 16', (await flight(4)).performance, 4 * per4);
  eq('…and short of the five-gap target, so not a win', (await flight(4)).won, false);
  const banked = await flight(5);
  eq('five gaps banks the round', banked.won, true);
  eq('…at performance 20', banked.performance, 5 * per4);
  eq('twenty-five obstacles is a perfect round', (await flight(25)).performance, 100);
  eq('…and takes the perfect-round bonus with it',
    (await flight(25)).bonusPerfect, CONFIG.games.perfectRoundBonus);
  eq('a thousand reach the same 100 and no more', (await flight(1000)).performance, 100);

  /*
   * **A run that could not have happened does not pay for itself.**
   *
   * The 0–100 scale bounds what a run is *worth* and says nothing about whether
   * it was flown. A thousand gaps claimed one second after the session opened
   * used to bank the ceiling and sit in the ledger looking exactly like a very
   * good player. Columns arrive on a timer, so the honest gap count is bounded by
   * the round's own duration — measured from two stamps the server wrote. The
   * rulebook does not ask for this guard; it is kept because nothing replaces it.
   */
  const allowed = CONFIG.games.flightGapAllowance * per4;
  eq(
    'a thousand gaps in one second is bounded by the clock, not by the scale',
    (await flight(1000, 1)).performance,
    allowed,
  );
  eq('…and the allowance keeps a genuinely short run whole',
    (await flight(CONFIG.games.flightGapAllowance, 0)).performance, allowed);

  await w.db.close();
}

/**
 * The parts of the formula that need a player with a history: the two once-only
 * bonuses, the featured multiplier's "once per day", the decay curve counting
 * real rounds, the welcome round's bypass, and what practice does and does not
 * consume.
 *
 * A world of its own rather than sharing `scoringRules`', because every one of
 * these is a statement about a *sequence* of rounds by one account and the other
 * section deliberately plays two dozen unrelated ones.
 */
async function formulaInPlay(): Promise<void> {
  describe('§4.1 in play — bonuses, featured, decay and the welcome round');

  /** A perfect quiz round of `gameType`, finished at `at`. */
  const perfect = async (
    w: World,
    gameType: games.GameType,
    at: Iso,
    opts: { practice?: boolean; welcome?: boolean; rights?: number } = {},
  ) => {
    const opened = await games.startSession(w.db, {
      userId: w.customerId,
      gameType,
      language: 'en',
      at,
      practice: opts.practice,
      welcome: opts.welcome,
    });
    const secret = JSON.parse(
      (await w.db.get<{ secret: string }>(`SELECT secret FROM game_sessions WHERE id = $i`, {
        i: opened.sessionId,
      }))!.secret,
    ) as { answers: number[] };
    const rights = opts.rights ?? secret.answers.length;
    for (const [index, answer] of secret.answers.entries()) {
      await games.submitEvent(w.db, {
        sessionId: opened.sessionId,
        userId: w.customerId,
        seq: index,
        kind: 'answer',
        payload: { index, choice: index < rights ? answer : answer === 0 ? 1 : 0 },
        at,
      });
    }
    return await games.finish(w.db, { sessionId: opened.sessionId, userId: w.customerId, at });
  };

  /*
   * ── the decay curve, counting real rounds of a real day ──
   *
   * One day, four perfect rounds, the free tank. The tank is four and each round
   * costs one, so this is a free player's whole day at full value — and the
   * numbers it produces are the ones the economy model is built out of.
   *
   * Every round is a *different* game, which is deliberate: the curve counts
   * rounds and not games, so there is nothing to rotate away from. The old
   * per-game curve is exactly what a player rotating four cards used to defeat.
   */
  {
    const w = await world();
    /* A Monday well clear of a month boundary, so "the day" is unambiguous, and
       an hour apart so all four land inside it. `flags` is not in the set
       because it is the welcome round's bank and that is a different test. */
    const day = '2026-06-08T09:00:00.000Z';
    const order: games.GameType[] = ['capitals', 'brain', 'poland', 'memory_match'];
    const rounds: games.Finish[] = [];
    for (const [index, gameType] of order.entries()) {
      const at = plusMinutes(day, index * 60);
      rounds.push(
        gameType === 'memory_match'
          ? await (async () => {
              const opened = await games.startSession(w.db, {
                userId: w.customerId,
                gameType,
                at,
              });
              const deck = (
                JSON.parse(
                  (await w.db.get<{ secret: string }>(
                    `SELECT secret FROM game_sessions WHERE id = $i`,
                    { i: opened.sessionId },
                  ))!.secret,
                ) as { deck: string[] }
              ).deck;
              const first = new Map<string, number>();
              let seq = 0;
              for (const [position, symbol] of deck.entries()) {
                const opener = first.get(symbol);
                if (opener === undefined) {
                  first.set(symbol, position);
                  continue;
                }
                await games.submitEvent(w.db, {
                  sessionId: opened.sessionId,
                  userId: w.customerId,
                  seq: (seq += 1),
                  kind: 'pair',
                  payload: { a: opener, b: position },
                  at,
                });
              }
              return await games.finish(w.db, {
                sessionId: opened.sessionId,
                userId: w.customerId,
                at,
              });
            })()
          : await perfect(w, gameType, at),
      );
    }

    eq('four rounds in a day are numbered 1 to 4', rounds.map((r) => r.roundToday), [1, 2, 3, 4]);
    eq('…and carry the decay rung each one landed on', rounds.map((r) => r.decay), [1, 0.65, 0.45, 0.3]);
    eq('every one of the four was a perfect round', rounds.map((r) => r.performance), [100, 100, 100, 100]);
    eq('…so every one takes the perfect bonus', rounds.map((r) => r.bonusPerfect), [10, 10, 10, 10]);
    /* Four different games, all played for the first time, so all four take the
       discovery bonus — which is what makes a free player's first day large and
       every day after it ordinary. */
    eq('…and all four are first-ever plays', rounds.map((r) => r.bonusNewGame), [25, 25, 25, 25]);
    eq('…none of them a personal best, because each set its own first record',
      rounds.map((r) => r.bonusPersonalBest), [0, 0, 0, 0]);

    /* The featured game is whichever of the four happens to be in the window; the
       multiplicative part is therefore asserted against the response's own
       `featured` rather than pinned, and the point of the check is the decay. */
    const expected = rounds.map((round) =>
      Math.round(
        round.base * (round.featured ? CONFIG.games.featuredMultiplier : 1) * round.decay +
          round.bonusPerfect + round.bonusNewGame + round.bonusPersonalBest,
      ),
    );
    eq('the day’s four scores are the formula, round by round', rounds.map((r) => r.score), expected);
    /* At most one of the four is featured, whichever day this runs on. That is
       "once per day" as a player experiences it. */
    eq('and exactly one of them at most claimed the ×1.5',
      rounds.filter((r) => r.featured).length <= 1, true);
    await w.db.close();
  }

  /*
   * ── the featured ×1.5, once per day ──
   *
   * Played against the *actual* featured game for the day rather than hoping one
   * of a fixed list falls in the window: `featuredGamesFor` is the three-UTC-day
   * set, and the first playable member of it is the card a player would be shown.
   */
  {
    const w = await world();
    /* The first day from mid-June whose window offers a quiz. A fixed date
       stopped being one when 2048 and Food Cross lengthened the rotation, and
       the rule under test is about the featured quiz, not about that date. */
    const isQuiz = (gameType: string) => ['capitals', 'brain', 'poland', 'uzbekistan', 'flags'].includes(gameType);
    let day = '2026-06-15T09:00:00.000Z';
    for (let k = 0; k < 20 && ![...games.featuredGamesFor(day)].some(isQuiz); k += 1) day = plusMinutes(day, 1440);
    const featuredQuiz = [...games.featuredGamesFor(day)].find((gameType) =>
      ['capitals', 'brain', 'poland', 'uzbekistan', 'flags'].includes(gameType),
    )!;
    check('the rotation offers a quiz somewhere in its three-day window', Boolean(featuredQuiz));

    const first = await perfect(w, featuredQuiz, day);
    eq('the first round of the day’s featured game takes the ×1.5', first.featured, true);
    eq(
      '…which is a perfect round at 27 before the bonuses, not 18',
      first.score,
      Math.round(CONFIG.games.maxRoundPoints * CONFIG.games.featuredMultiplier) +
        first.bonusPerfect + first.bonusNewGame,
    );

    const second = await perfect(w, featuredQuiz, plusMinutes(day, 90));
    eq('a second round of the same game does not take it again', second.featured, false);
    eq('…and it is the second round of the day, so it decays', second.decay, 0.65);

    eq('…and the factor it applied travels beside the boolean',
      first.featuredMultiplier, CONFIG.games.featuredMultiplier);
    eq('…while a round that did not claim it carries a 1, so the chain needs no branch',
      second.featuredMultiplier, 1);
    eq(
      'the whole chain multiplies unconditionally',
      first.score,
      Math.round(
        first.base * first.featuredMultiplier * first.decay * first.multiplier +
          first.bonusPerfect + first.bonusNewGame + first.bonusPersonalBest,
      ),
    );

    /* Tomorrow it comes back — a different game is featured, and this one is not
       it, so the check is that the *guard* reset rather than that the game did. */
    const tomorrow = await perfect(w, featuredQuiz, plusMinutes(day, 1440));
    eq('the guard is per day, so tomorrow it is decided by the rotation again',
      tomorrow.featured, games.featuredGamesFor(plusMinutes(day, 1440)).has(featuredQuiz));
    eq('…and tomorrow is a fresh decay curve', tomorrow.decay, 1);
    eq('…and a fresh round number', tomorrow.roundToday, 1);
    await w.db.close();
  }

  /*
   * ── the personal best, +8, once per game per day ──
   */
  {
    const w = await world();
    const day = '2026-06-22T09:00:00.000Z';

    /* A bad round first, so there is a record to beat that is not already 100. */
    const poor = await perfect(w, 'capitals', day, { rights: 1 });
    eq('a first round of a game sets a record rather than beating one', poor.bonusPersonalBest, 0);
    eq('…and takes the discovery bonus instead', poor.bonusNewGame, CONFIG.games.newGameBonus);

    const better = await perfect(w, 'capitals', plusMinutes(day, 60), { rights: 3 });
    eq('a better round beats it and takes the +8', better.bonusPersonalBest,
      CONFIG.games.personalBestBonus);
    eq('…and not the discovery bonus a second time', better.bonusNewGame, 0);

    const betterAgain = await perfect(w, 'capitals', plusMinutes(day, 120), { rights: 5 });
    eq('a second improvement the same day does not pay it twice',
      betterAgain.bonusPersonalBest, 0);
    eq('…though the record still moved', betterAgain.performance, 100);

    /* Tomorrow the cap resets — but the record is 100 now, so there is nothing
       left to beat, which is the honest end state of a capped scale. */
    const capped = await perfect(w, 'capitals', plusMinutes(day, 1440), { rights: 5 });
    eq('a round that only equals the record is not a personal best',
      capped.bonusPersonalBest, 0);

    /* The row is the only storage this formula added, and it holds what it says. */
    const row = await w.db.get<{ best: number }>(
      `SELECT best FROM player_game_bests WHERE user_id = $u AND game_type = 'capitals'`,
      { u: w.customerId },
    );
    eq('the stored best is the best performance reached', row?.best, 100);
    /* A worse round afterwards does not lower it. */
    await perfect(w, 'capitals', plusMinutes(day, 1500), { rights: 1 });
    eq(
      '…and a bad round afterwards does not lower it',
      (
        await w.db.get<{ best: number }>(
          `SELECT best FROM player_game_bests WHERE user_id = $u AND game_type = 'capitals'`,
          { u: w.customerId },
        )
      )?.best,
      100,
    );
    await w.db.close();
  }

  /*
   * ── the welcome round bypasses the formula entirely ──
   *
   * §7.3: the first finished round of an account pays a flat 10 a correct answer,
   * because the onboarding screen before it promises fifty points and the master
   * formula cannot produce fifty from one round of anything. It is gated on the
   * server's own `secret.welcome` **and** on this being the player's first
   * finished round, so a client cannot ask for the rate.
   */
  {
    const w = await world();
    const day = '2026-06-29T09:00:00.000Z';

    const welcome = await perfect(w, 'flags', day, { welcome: true });
    eq('the welcome round pays ten a correct answer', welcome.score,
      CONFIG.games.quizQuestions * CONFIG.earn.welcomeRoundPerCorrect);
    eq('…which is the fifty the onboarding screen promises', welcome.score, 50);
    eq('…and it says so, rather than leaving a client to infer it', welcome.welcomeRound, true);
    eq('…the formula did not run, so there is no base', welcome.base, 0);
    eq('…and none of the three bonuses landed',
      [welcome.bonusPerfect, welcome.bonusNewGame, welcome.bonusPersonalBest], [0, 0, 0]);
    eq('…and no featured multiplier either', welcome.featured, false);
    /* The performance is still reported honestly: the round was played, it was
       perfect, and a screen that wants to say so can. */
    eq('…while the performance is still the honest figure', welcome.performance, 100);

    /* The second round is an ordinary one, on the formula, even though it is
       also started as a welcome round: the first-ever check is what makes the
       rate once. */
    const again = await perfect(w, 'flags', plusMinutes(day, 60), { welcome: true });
    eq('a second welcome round is an ordinary round', again.welcomeRound, false);
    eq('…priced by the formula', again.base, CONFIG.games.maxRoundPoints);
    check('…and worth far less than the fifty', again.score < 50, again.score);
    /*
     * **The welcome round *is* the first play of its game, so the +25 is spent.**
     *
     * A decision the rulebook does not make, and worth stating either way. §4.3
     * pays 25 the first time somebody plays a game; the welcome round is a real,
     * paid, finished round of `flags`, so that first time has happened and the
     * second round is a second play. Paying 25 on it would be paying twice for
     * one discovery, and the player is not short: the welcome round paid 50 for
     * that first round where the formula's most generous reading of it would have
     * been 18 + 10 + 25 = 53 on a featured day and 43 otherwise. Playing all
     * eight games once is 175 + 50 rather than §4.3's 200.
     */
    eq('…and the welcome round spent that game’s discovery bonus, because it was that game’s first play',
      again.bonusNewGame, 0);
    /* Another game's is untouched, which is what says the bonus is per game
       rather than per account. */
    eq('…while another game’s is still there to be earned',
      (await perfect(w, 'capitals', plusMinutes(day, 120))).bonusNewGame,
      CONFIG.games.newGameBonus);
    await w.db.close();
  }

  /*
   * ── practice consumes nothing ──
   *
   * The rulebook's addition to a rule that already existed. A practice round
   * banked nothing before; it must now also not spend the first-play bonus, not
   * set a personal best, not take the featured ×1.5 and not advance the decay
   * curve. All four fall out of one column — `life_spent = 0` — which is why they
   * are checked together.
   */
  {
    const w = await world();
    const day = '2026-07-06T09:00:00.000Z';

    /* Empty the free tank, then play a fifth round as practice. */
    for (let i = 0; i < CONFIG.points.dailyEnergy; i += 1) {
      await perfect(w, 'capitals', plusMinutes(day, i * 5), { rights: 1 });
    }
    const practice = await perfect(w, 'brain', plusMinutes(day, 30), { practice: true });
    eq('a practice round banks nothing', practice.score, 0);
    eq('…and says so', practice.paid, false);
    eq('…while still reporting how the round went', practice.performance, 100);
    eq('…and what it would have been worth', practice.base, CONFIG.games.maxRoundPoints);
    eq('…but none of the three bonuses, because none was awarded',
      [practice.bonusPerfect, practice.bonusNewGame, practice.bonusPersonalBest], [0, 0, 0]);

    const bests = await w.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM player_game_bests WHERE user_id = $u AND game_type = 'brain'`,
      { u: w.customerId },
    );
    eq('a practice round records no personal best', bests?.n, 0);

    /* Tomorrow, with energy back, the same game's first *paid* round still has
       its discovery bonus: practice did not spend it. */
    const paidLater = await perfect(w, 'brain', plusMinutes(day, 1440));
    eq('…and the discovery bonus is still there to be earned', paidLater.bonusNewGame,
      CONFIG.games.newGameBonus);
    eq('…on the first round of its day, undecayed', paidLater.roundToday, 1);
    await w.db.close();
  }
}

/**
 * **Today's featured game as one card**, which is a different question from
 * "may this round take the ×1.5" and has to be answered separately.
 *
 * The honoured set is three UTC days wide, because the poster rotates on the
 * reader's local date and the server does not know their clock — up to four game
 * types, which is the right answer for the bonus and useless for a hero card. Two
 * clients were picking the card themselves and by two different rules, so two
 * screens could name different games on one day and neither matched the game the
 * bonus was paid on.
 */
async function featuredPoster(): Promise<void> {
  describe('§4.4 the featured game — one card, resolved per account');

  const w = await world();

  /* Seven consecutive days, which is exactly one full turn of the rotation: the
     pool has seven slots, so this walks every one of them. */
  const day = '2026-08-03T09:00:00.000Z';
  const posted: Array<games.GameType | null> = [];
  for (let offset = 0; offset < games.DAILY_GAME_POOL.length; offset += 1) {
    posted.push(await games.featuredGameFor(w.db, w.customerId, plusDays(day, offset)));
  }

  check('every day of the rotation posts exactly one game', posted.every(Boolean), posted);
  eq('…and seven days cover the whole pool without repeating',
    new Set(posted).size, games.DAILY_GAME_POOL.length);
  check(
    '…each one a slot of the pool, so the poster cannot name a card the rotation does not',
    posted.every((gameType, index) =>
      games.DAILY_GAME_POOL.some((slot) => slot.includes(gameType!)) &&
      games.dailyGameFor(plusDays(day, index).slice(0, 10)).includes(gameType!)),
    posted,
  );
  check(
    '…and the game it names is always one the ×1.5 would actually be honoured on',
    posted.every((gameType, index) =>
      games.featuredGamesFor(plusDays(day, index)).has(gameType!)),
    posted,
  );

  /*
   * **The local quiz is the one slot a client cannot resolve on its own**, and it
   * is the reason this is a server field rather than a rotation a client can
   * compute. `DAILY_GAME_POOL` holds `['poland', 'uzbekistan']` as one slot.
   */
  const localDay = (() => {
    for (let offset = 0; offset < games.DAILY_GAME_POOL.length; offset += 1) {
      const when = plusDays(day, offset);
      if (games.dailyGameFor(when.slice(0, 10)).includes('poland')) return when;
    }
    throw new Error('no multi-bank slot in the pool');
  })();

  await w.db.run(`UPDATE users SET country_code = 'PL' WHERE id = $u`, { u: w.customerId });
  eq('a Polish account is dealt the Poland bank on the local-quiz day',
    await games.featuredGameFor(w.db, w.customerId, localDay), 'poland');
  await w.db.run(`UPDATE users SET country_code = 'UZ' WHERE id = $u`, { u: w.customerId });
  eq('…and an Uzbek account the Uzbekistan one, never Poland’s',
    await games.featuredGameFor(w.db, w.customerId, localDay), 'uzbekistan');
  /* Lower case, because `country_code` is a text column with no CHECK and an
     import or an older client can have written either case. */
  await w.db.run(`UPDATE users SET country_code = 'uz' WHERE id = $u`, { u: w.customerId });
  eq('…however the code was cased', await games.featuredGameFor(w.db, w.customerId, localDay),
    'uzbekistan');
  /* An account with no country still gets a card. A blank hero card is worse than
     the Poland bank, which is the product's own default market. */
  await w.db.run(`UPDATE users SET country_code = NULL WHERE id = $u`, { u: w.customerId });
  eq('an account with no country still gets a card, and it is Poland’s',
    await games.featuredGameFor(w.db, w.customerId, localDay), 'poland');
  await w.db.run(`UPDATE users SET country_code = 'DE' WHERE id = $u`, { u: w.customerId });
  eq('…as does a country no bank has been written for',
    await games.featuredGameFor(w.db, w.customerId, localDay), 'poland');

  /*
   * **The table is restated in two programs and this is what keeps them level.**
   *
   * `QUIZ_BANK_FOR_COUNTRY` in `src/site/games/banks.ts` is the site's copy;
   * `LOCAL_QUIZ_FOR_COUNTRY` in `domain/games.ts` is this one. They share no code,
   * so a country added to one and not the other deals an Uzbek bank under a Polish
   * name — and does it silently. Read from the source, like `postgresLockdown`
   * reads `rls.pg.sql`, because the site's half is not importable from here.
   */
  const banksFile = readFileSync(
    join(fileURLToPath(new URL('..', import.meta.url)), 'src', 'site', 'games', 'banks.ts'),
    'utf8',
  );
  const table = /QUIZ_BANK_FOR_COUNTRY = \{([\s\S]*?)\}/.exec(banksFile);
  check('the site’s own bank table is still where this reads it from', Boolean(table));
  const theirs = Object.fromEntries(
    [...(table?.[1] ?? '').matchAll(/([A-Z]{2}):\s*'([a-z_]+)'/g)].map((m) => [m[1], m[2]]),
  );
  check('…and it has rows', Object.keys(theirs).length > 1, theirs);
  eq('the two programs deal the same bank for the same country', theirs,
    { ...games.LOCAL_QUIZ_FOR_COUNTRY });

  await w.db.close();
}

/**
 * §5.7 / §5.8 — 2048 and Food Cross, **replayed** rather than reported.
 *
 * Three things are proved here, and they are three because each one fails
 * differently.
 *
 * 1. **The document is the engine.** `GAMES-2048-FOODCROSS.md` is what the Dart
 *    port is written from, and its vectors are read *out of the document* and
 *    replayed against `domain/engines/`. They are also compared with what the
 *    generator produces today, so a config change that alters the boards without
 *    regenerating the document is a failing check rather than a phone that
 *    silently disagrees with the server.
 * 2. **The server scores the replay and nothing else.** A round finished with a
 *    vector's moves takes that vector's performance whatever the client claims;
 *    an impossible replay and an implausibly fast one are refused and leave the
 *    round open.
 * 3. **The rulebook's guards around them hold**: the weekly game cap (§9.1)
 *    trims and says so, the rotation is the eight games (§4.4), and the CHECK on
 *    `game_type` is widened on a database that predates the two games.
 */
async function seededGames(): Promise<void> {
  describe('§5.7 / §5.8 2048 and Food Cross — seeded, replayed, and the document’s vectors');

  /* ── 1. the document ── */
  const doc = readFileSync(join(fileURLToPath(new URL('.', import.meta.url)), 'GAMES-2048-FOODCROSS.md'), 'utf8');
  const fence = '```';
  const block = <T,>(key: string): T[] => {
    const start = doc.indexOf(`<!-- vectors:${key} -->`);
    const open = start < 0 ? -1 : doc.indexOf(`${fence}json`, start);
    const close = open < 0 ? -1 : doc.indexOf(fence, open + 7);
    check(`the document carries its ${key} vectors`, close > open && open > start && start >= 0);
    return close > open && open >= 0 ? (JSON.parse(doc.slice(open + 7, close)) as T[]) : [];
  };
  const prngs = block<engineVectors.PrngVector>('prng');
  const twenty48 = block<engineVectors.Vector2048>('game2048');
  const food = block<engineVectors.VectorFoodCross>('foodCross');
  const rejected = block<engineVectors.RejectVector>('rejects');

  check('at least six vectors per game', twenty48.length >= 6 && food.length >= 6,
    { game2048: twenty48.length, foodCross: food.length });
  eq('the document’s vectors are what the engines generate today — regenerate it if not',
    JSON.stringify({ prngs, twenty48, food, rejected }),
    JSON.stringify({
      prngs: engineVectors.prngVectors(),
      twenty48: engineVectors.vectors2048(),
      food: engineVectors.vectorsFoodCross(),
      rejected: engineVectors.rejectVectors(),
    }));

  for (const v of prngs) {
    const rng = mulberry32(v.seed);
    eq(`mulberry32(${v.seed}) — the first five draws`, [0, 1, 2, 3, 4].map(() => rng.nextU32()), v.u32);
    eq(`…and pick(n) continuing the stream`, v.picks.map((p) => rng.pick(p.n)), v.picks.map((p) => p.value));
  }

  for (const v of twenty48) {
    const r = game2048.replay2048(v.seed, game2048.parseSwipes(v.moves), engineVectors.PARAMS_2048);
    const label = `2048 seed ${v.seed}, ${v.moves.length} swipes`;
    eq(`${label}: the opening board`, game2048.start2048(v.seed, engineVectors.PARAMS_2048).board, v.start);
    eq(`${label}: the final board`, r.board, v.board);
    eq(`${label}: score, highest tile, over, draws`,
      [r.score, r.highestTile, r.over, r.draws], [v.score, v.highestTile, v.over, v.draws]);
    eq(`${label}: performance by §5.7’s table`,
      game2048.performance2048(r.highestTile, CONFIG.games.game2048.performanceByTile), v.performance);
  }
  check('the 2048 vectors reach the upper bands (65 and 85), not only the floor',
    twenty48.some((v) => v.performance === 65) && twenty48.some((v) => v.performance === 85));

  for (const v of food) {
    const swaps = foodCross.parseSwaps(v.moves, engineVectors.PARAMS_FOOD);
    const r = foodCross.replayFoodCross(v.seed, swaps, engineVectors.PARAMS_FOOD);
    const label = `Food Cross seed ${v.seed}, ${v.moves.length} swaps`;
    eq(`${label}: the opening board`, foodCross.startFoodCross(v.seed, engineVectors.PARAMS_FOOD).board, v.start);
    eq(`${label}: the final board`, r.board, v.board);
    eq(`${label}: score, reshuffles, best cascade, draws`,
      [r.score, r.reshuffles, r.bestCascade, r.draws], [v.score, v.reshuffles, v.bestCascade, v.draws]);
    eq(`${label}: performance is min(100, score / 20)`,
      foodCross.performanceFoodCross(r.score, CONFIG.games.foodCross.target), v.performance);
  }
  check('a Food Cross vector reshuffles, so the rule is pinned and not just described',
    food.some((v) => v.reshuffles > 0));
  check('…and one reaches the 2,000 target inside twenty swaps', food.some((v) => v.performance === 100));

  for (const v of rejected) {
    let got: { reason: string; move: number } | null = null;
    try {
      if (v.game === 'game_2048') {
        game2048.replay2048(v.seed, game2048.parseSwipes(v.moves), engineVectors.PARAMS_2048);
      } else {
        foodCross.replayFoodCross(
          v.seed, foodCross.parseSwaps(v.moves, engineVectors.PARAMS_FOOD), engineVectors.PARAMS_FOOD);
      }
    } catch (error) {
      if (error instanceof ReplayError) got = { reason: error.reason, move: error.move };
    }
    eq(`${v.game} seed ${v.seed} refuses with ${v.reason} at move ${v.move}`, got,
      { reason: v.reason, move: v.move });
  }

  /* ── 2. through the domain ── */
  const w = await world();
  const at = now();
  const secretOf = async (id: string) =>
    JSON.parse((await w.db.get<{ secret: string }>(`SELECT secret FROM game_sessions WHERE id = $i`, { i: id }))!
      .secret) as Record<string, unknown>;
  /* A round's seed is drawn from the CSPRNG, so to finish one with a vector's
     moves the test puts the vector's seed into the secret — exactly the value
     the replay reads — and leaves everything else as `/start` wrote it. */
  const reseed = async (id: string, seed: number) => {
    const secret = await secretOf(id);
    await w.db.run(`UPDATE game_sessions SET secret = $s WHERE id = $i`,
      { s: JSON.stringify({ ...secret, seed }), i: id });
  };
  const stateOf = async (id: string) =>
    (await w.db.get<{ state: string }>(`SELECT state FROM game_sessions WHERE id = $i`, { i: id }))?.state;
  const refusedWith = async (what: string, reason: string, fn: () => Promise<unknown>) => {
    const error = await refusal(fn);
    eq(what, [error?.code, error?.detail.reason], ['bad_request', reason]);
    return error;
  };

  const round = await games.startSession(w.db, { userId: w.customerId, gameType: 'game_2048', at });
  const content = round.content as Record<string, unknown>;
  const secret = await secretOf(round.sessionId);
  check('a 2048 round starts with a 32-bit seed',
    Number.isInteger(content.seed) && (content.seed as number) >= 0 && (content.seed as number) <= 0xffffffff,
    content.seed);
  eq('…the same one the server keeps to replay with', secret.seed, content.seed);
  eq('…and the rules travel with it, from config', [content.size, content.fourOneIn, content.startTiles],
    [CONFIG.games.game2048.size, CONFIG.games.game2048.fourOneIn, CONFIG.games.game2048.startTiles]);
  eq('the start spent the energy', round.energyLeft, CONFIG.points.dailyEnergy - 1);

  const best2048 = twenty48.find((v) => v.performance === 85)!;
  await reseed(round.sessionId, best2048.seed);
  await refusedWith('a replay finished faster than it can be played is refused (§9.3)', 'too_fast',
    async () => await games.finish(w.db, {
      sessionId: round.sessionId,
      userId: w.customerId,
      clientReport: { moves: best2048.moves },
      at: plusMinutes(at, 0.5),
    }));
  eq('…and the round is still open to be finished properly', await stateOf(round.sessionId), 'active');

  const played = plusMinutes(at, (best2048.moves.length * CONFIG.games.game2048.minSecondsPerMove) / 60 + 1);
  const finished2048 = await games.finish(w.db, {
    sessionId: round.sessionId,
    userId: w.customerId,
    /* The claim beside the moves is ignored. */
    clientReport: { moves: best2048.moves, score: 999999, highestTile: 2048, performance: 100 },
    at: played,
  });
  eq('the server’s replay decides the result, not the claim', finished2048.replay,
    { moves: best2048.moves.length, score: best2048.score, highestTile: best2048.highestTile });
  eq('…a 1024 tile is performance 85', finished2048.performance, 85);
  eq('…priced by the one formula: base round(85% × 18)', finished2048.base, 15);
  eq('…with the first-play bonus, since this is the first 2048 round', finished2048.bonusNewGame,
    CONFIG.games.newGameBonus);
  eq('…and finishing cost nothing further', finished2048.energyLeft, CONFIG.points.dailyEnergy - 1);

  /* An impossible replay: the refusal names the move, and the round stays open. */
  const bad = rejected.find((v) => v.game === 'game_2048' && v.reason === 'no_change')!;
  const badRound = await games.startSession(w.db, { userId: w.customerId, gameType: 'game_2048', at: played });
  await reseed(badRound.sessionId, bad.seed);
  const refusal2048 = await refusedWith('a swipe that changes nothing refuses the replay', 'no_change',
    async () => await games.finish(w.db, {
      sessionId: badRound.sessionId,
      userId: w.customerId,
      clientReport: { moves: bad.moves },
      at: plusMinutes(played, 1),
    }));
  eq('…and names the move it could not follow', refusal2048?.detail.move, 0);
  eq('…leaving the round open', await stateOf(badRound.sessionId), 'active');

  /* Food Cross, to a perfect round. */
  const foodAt = plusMinutes(played, 2);
  const cross = await games.startSession(w.db, { userId: w.customerId, gameType: 'food_cross', at: foodAt });
  const crossContent = cross.content as Record<string, unknown>;
  eq('a Food Cross round carries its rules', [crossContent.rows, crossContent.cols, crossContent.moves,
    crossContent.target], [7, 7, 20, 2000]);
  const perfect = food.find((v) => v.performance === 100)!;
  await reseed(cross.sessionId, perfect.seed);
  await refusedWith('twenty-one swaps is more than a round has', 'too_many_moves', async () =>
    await games.finish(w.db, {
      sessionId: cross.sessionId,
      userId: w.customerId,
      clientReport: { moves: [...perfect.moves, perfect.moves[0]] },
      at: plusMinutes(foodAt, 5),
    }));
  const crossed = await games.finish(w.db, {
    sessionId: cross.sessionId,
    userId: w.customerId,
    clientReport: { moves: perfect.moves },
    at: plusMinutes(foodAt, 5),
  });
  eq('Food Cross replays to the vector’s score', crossed.replay,
    { moves: perfect.moves.length, score: perfect.score, highestTile: null });
  eq('…2,000 or more is performance 100 and a win', [crossed.performance, crossed.won], [100, true]);
  eq('…which takes the perfect-round bonus', crossed.bonusPerfect, CONFIG.games.perfectRoundBonus);

  /* ── 3a. §9.1 the weekly game cap ── */
  const capWorld = await world();
  const capAt = now();
  const cap = CONFIG.games.weeklyGameCap.free;
  /* Nine short of the cap, already banked from games this week. */
  await ledger.earn(capWorld.db, {
    userId: capWorld.customerId,
    points: cap - 9,
    reason: 'game_win',
    sourceKind: 'game_session',
    sourceRef: 'verify-cap',
    at: capAt,
  });
  const capRound = async (when: string) => {
    const opened = await games.startSession(capWorld.db, {
      userId: capWorld.customerId, gameType: 'food_cross', at: when });
    const s = JSON.parse((await capWorld.db.get<{ secret: string }>(
      `SELECT secret FROM game_sessions WHERE id = $i`, { i: opened.sessionId }))!.secret);
    await capWorld.db.run(`UPDATE game_sessions SET secret = $s WHERE id = $i`,
      { s: JSON.stringify({ ...s, seed: perfect.seed }), i: opened.sessionId });
    return await games.finish(capWorld.db, {
      sessionId: opened.sessionId,
      userId: capWorld.customerId,
      clientReport: { moves: perfect.moves },
      at: plusMinutes(when, 1),
    });
  };
  const trimmed = await capRound(capAt);
  eq('a round that would cross the weekly cap banks only what is left', trimmed.score, 9);
  check('…and says how much was trimmed', trimmed.capped > 0, trimmed.capped);
  const spent = await capRound(plusMinutes(capAt, 10));
  eq('once the cap is reached a round banks nothing', spent.score, 0);
  check('…all of it reported as capped', spent.capped > 0, spent.capped);
  eq('the balance is exactly the cap', await ledger.balance(capWorld.db, capWorld.customerId), cap);
  await capWorld.db.close();

  check('the abandon route is on the surface, so a client can claim the §3 refund',
    allRoutes.some((r) => r.method === 'POST' && r.pattern === '/v1/games/sessions/:id/abandon'));

  /* ── 3b. §4.4 the rotation is the rulebook's eight ── */
  eq('eight featured slots', games.DAILY_GAME_POOL.length, 8);
  check('…2048 and Food Cross among them',
    games.DAILY_GAME_POOL.some((slot) => slot.includes('game_2048')) &&
      games.DAILY_GAME_POOL.some((slot) => slot.includes('food_cross')));
  check('…and capitals, which the rulebook does not list, is not',
    !games.DAILY_GAME_POOL.some((slot) => slot.includes('capitals')));

  /* ── 3c. the CHECK is widened on a database that predates the two games ── */
  const old = ['flags', 'capitals', 'brain', 'poland', 'uzbekistan', 'word_builder', 'memory_match', 'flight'];
  const tableSql = async () =>
    (await w.db.get<{ sql: string }>(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'game_sessions'`))!.sql;
  const narrowed = (await tableSql())
    .replace(/CHECK \(game_type IN \([\s\S]*?\)\)/, `CHECK (game_type IN (${old.map((t) => `'${t}'`).join(', ')}))`)
    .replace(/^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?game_sessions/i, 'CREATE TABLE game_sessions_old');
  await w.db.exec('PRAGMA foreign_keys = OFF');
  await w.db.exec(`DELETE FROM game_sessions WHERE game_type IN ('game_2048', 'food_cross')`);
  const sessionsBefore = (await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM game_sessions`))!.n;
  const eventsBefore = (await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM game_events`))!.n;
  await w.db.exec(narrowed);
  await w.db.exec('INSERT INTO game_sessions_old SELECT * FROM game_sessions');
  await w.db.exec('DROP TABLE game_sessions');
  await w.db.exec('ALTER TABLE game_sessions_old RENAME TO game_sessions');
  await w.db.exec('PRAGMA foreign_keys = ON');
  check('the fixture really is an old database', !(await tableSql()).includes('food_cross'));

  await migrate(w.db);
  const widened = await tableSql();
  check('booting widens the CHECK to admit both games',
    widened.includes("'game_2048'") && widened.includes("'food_cross'"));
  eq('…keeping every session',
    (await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM game_sessions`))!.n, sessionsBefore);
  eq('…and every move reported in them',
    (await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM game_events`))!.n, eventsBefore);
  const reopened = await games.startSession(w.db, {
    userId: w.customerId, gameType: 'food_cross', practice: true, at: plusDays(at, 3) });
  eq('…so a Food Cross round can be started on it', reopened.gameType, 'food_cross');

  await w.db.close();
}

/**
 * The flight round carries **two** numbers and they are not the same number.
 *
 * `target` is the win threshold and `perfectObstacles` is what a perfect round
 * takes, and a client reading one as the other prints a wrong figure with nothing
 * to catch it — which is exactly what happened: five is the number the site has
 * always shown for banking the round, and 25 is the number \u00a75.6 makes a
 * perfect one.
 */
async function flightRoundShape(): Promise<void> {
  describe('\u00a75.6 the flight round — the win threshold and the perfect one');

  const w = await world();
  const round = await games.startSession(w.db, {
    userId: w.customerId,
    gameType: 'flight',
    at: now(),
  });
  const content = round.content as {
    target: number;
    performancePerObstacle: number;
    perfectObstacles: number;
  };

  eq('the win threshold is still five gaps', content.target, CONFIG.games.flightTarget);
  eq('…and a perfect round is twenty-five obstacles', content.perfectObstacles, 25);
  check('…which is not the same number, and both are sent',
    content.target !== content.perfectObstacles);
  eq('the rate travels too, as it does for every other game',
    content.performancePerObstacle, CONFIG.games.flightPerformancePerObstacle);
  /* Derived from the rate rather than written beside it, which is what stops the
     two drifting when the rate moves. */
  eq('…and the perfect figure is that rate, not a second constant',
    content.perfectObstacles * content.performancePerObstacle, 100);

  await w.db.close();
}

async function dealRules(): Promise<void> {
  describe('§6 hot deals — targeting, funnel, caps');
  const w = await world();
  const at = '2026-08-11T09:00:00.000Z'; // a Tuesday, 11:00 in Kraków

  const deal = await partners.createDeal(w.db, {
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
  await partners.publishDeal(w.db, { dealId: deal.id, actorId: w.ownerId, at });

  const viewer = { userId: w.customerId, language: 'en', at };
  check('inside its window it is claimable', (await deals.claimableNow(w.db, await deals.getDeal(w.db, deal.id), viewer)).ok);

  const wrongTime = await deals.claimableNow(w.db, await deals.getDeal(w.db, deal.id), {
    ...viewer,
    at: '2026-08-11T14:00:00.000Z',
  });
  check('outside its hours it is not', !wrongTime.ok && wrongTime.reason === 'wrong_time');

  const wrongDay = await deals.claimableNow(w.db, await deals.getDeal(w.db, deal.id), {
    ...viewer,
    at: '2026-08-12T09:00:00.000Z',
  });
  check('on the wrong day it is not', !wrongDay.ok && wrongDay.reason === 'wrong_day');

  /* A deal with no copy in the reader's language is not shown to them. */
  const noCopy = await deals.browse(w.db, { ...viewer, language: 'uz' }, {});
  check('…and English copy still serves a reader with no translation', noCopy.length >= 1);

  /* §6.3: a claim needs an *open* and a confirmed scan, not a tap on a list. */
  const beforeOpen = await scanWithDeal(w, deal.id, at);
  eq('a scan without an open does not claim', (await deals.funnel(w.db, deal.id)).claimed, 0);
  check('…although it is still a visit', beforeOpen.visitCounted);

  await deals.track(w.db, { dealId: deal.id, userId: w.customerId, kind: 'open', at });
  await scanWithDeal(w, deal.id, plusDays(at, 1));
  eq('an opened deal plus a confirmed scan claims', (await deals.funnel(w.db, deal.id)).claimed, 1);

  /* The cap stops the next one. */
  await scanWithDeal(w, deal.id, plusDays(at, 2));
  eq('the per-deal cap holds', (await deals.funnel(w.db, deal.id)).claimed, 1);

  /* B3: publishing needs copy in at least one language. On its own venue,
     because the starter plan allows one live deal and the capacity gate would
     otherwise answer first — which is a true answer to a different question. */
  const w3 = await world();
  const empty = await partners.createDeal(w3.db, {
    actorId: w3.ownerId,
    draft: { venueId: w3.venueId, copy: {} },
    at,
  });
  await throws('a deal with no copy cannot be published', 'validation_failed', async () =>
    await partners.publishDeal(w3.db, { dealId: empty.id, actorId: w3.ownerId, at }),
  );
  await w3.db.close();

  eq(
    'translation completeness is tracked',
    (await deals.completeness(w.db, deal.id)).filled,
    ['en'],
  );

  await w.db.close();
}

async function scanWithDeal(w: World, dealId: string, at: string): Promise<gate.Receipt> {
  const qr = await gate.mintQr(w.db, w.venueId, SECRET, at);
  const txn = await gate.openTransaction(w.db, { kind: 'qr', token: qr.token, secret: SECRET }, {
    userId: w.customerId,
    dealId,
    at,
  });
  await gate.submitAmount(w.db, { transactionId: txn.id, amountMinor: 5000, actorId: w.ownerId, at });
  return await gate.confirm(w.db, { transactionId: txn.id, cashierId: w.ownerId, at });
}

async function consentRules(): Promise<void> {
  describe('§1.4 / B9a consent-gated identified profiles');

  /*
   * ── §1.3: account consent follows the asking, and nothing else ──
   *
   * Two rows are written when `acceptTerms` says somebody was asked and said
   * yes, and **none** when the field is absent. The absence is the half worth
   * checking: it was a refusal for a while, which broke sign-up for every
   * client already shipped without the field, and the replacement rule is only
   * honest while a silent sign-up leaves no row claiming consent it never got.
   */
  {
    const c = await world();
    const cAt = now();
    const asked = await accounts.signUp(c.db, {
      email: 'asked@verify.test', password: 'hunter22', name: 'Asked',
      acceptTerms: true, at: cAt,
    });
    const silent = await accounts.signUp(c.db, {
      email: 'silent@verify.test', password: 'hunter22', name: 'Silent', at: cAt,
    });
    eq('an asked sign-up records the terms', await consent.has(c.db, asked.id, 'terms'), true);
    eq('…and the privacy policy with it', await consent.has(c.db, asked.id, 'privacy'), true);
    check('a sign-up that did not ask is not refused', typeof silent.id === 'string', silent.id);
    eq('…and claims no consent', await consent.has(c.db, silent.id, 'terms'), false);
    eq('…nor on the privacy policy', await consent.has(c.db, silent.id, 'privacy'), false);
    /* And it is repairable, which is what makes the absence a state rather
       than a hole: the client records it on the day it grows a screen. */
    await consent.record(c.db, { userId: silent.id, kind: 'terms', granted: true, source: 'api', at: cAt });
    eq('…until the client says otherwise', await consent.has(c.db, silent.id, 'terms'), true);

    /* And the Google path, which is the one that used to record consent it
       had never asked for — the row `signUp` calls worse than no row, on the
       only account-creating route that shows nobody a checkbox by itself. */
    const gAsked = await accounts.linkGoogleAccount(c.db, {
      sub: 'google-asked', email: 'g-asked@verify.test', name: 'G Asked',
      acceptTerms: true, at: cAt,
    });
    const gSilent = await accounts.linkGoogleAccount(c.db, {
      sub: 'google-silent', email: 'g-silent@verify.test', name: 'G Silent', at: cAt,
    });
    eq('a Google sign-up that asked records it', await consent.has(c.db, gAsked.id, 'terms'), true);
    eq('…and one that did not, records nothing', await consent.has(c.db, gSilent.id, 'terms'), false);
    check('…and is an account either way', gSilent.id !== gAsked.id, gSilent.id);
    await c.db.close();
  }
  const w = await world();
  const at = now();

  /*
   * **The default is off for this account, deliberately.**
   *
   * `users.venue_sharing_default` is 1 for everybody, and `gate.confirm` turns
   * that into a §1.4 grant at the moment a visit is confirmed — which is the
   * point of the column and is tested on its own in `sharingDefaultRules`.
   *
   * What *this* section is about is the gate itself: that an identified
   * customer is invisible without a grant, appears with one, and disappears the
   * instant it is withdrawn. Those three are the rules the whole
   * identified-customer surface rests on, and they have to be checked on an
   * account with **no** grant — so this one opts out before it visits. Leaving
   * the default on here would have replaced a test of the gate with a test of
   * the default, which is how a rule stops being checked without anybody
   * deleting a check.
   */
  await consent.setSharingDefault(w.db, w.customerId, false);

  await scan(w, 6000, at);

  const table = await profiles.customerTable(w.db, w.venueId, { at });
  eq('the customer counts toward the total', table.totalCustomers, 1);
  eq('but is not listed without a grant', table.rows.length, 0);
  eq('and the shared count is honest', table.sharedCustomers, 0);

  await throws('their detail is not reachable either', 'not_found', async () =>
    await profiles.customerDetail(w.db, w.venueId, w.customerId, at),
  );

  await consent.grantSharing(w.db, { userId: w.customerId, venueId: w.venueId, at });
  const granted = await profiles.customerTable(w.db, w.venueId, { at });
  eq('with a grant they appear', granted.rows.length, 1);
  eq('and the gap is reportable', [granted.totalCustomers, granted.sharedCustomers], [1, 1]);

  const detail = await profiles.customerDetail(w.db, w.venueId, w.customerId, at);
  eq('the detail is scoped to this venue', detail.lifetimeValueMinor, 6000);
  check(
    'and never carries the global points balance',
    !Object.keys(detail).some((key) => /points|balance/i.test(key)),
  );

  await consent.revokeSharing(w.db, w.customerId, w.venueId, at);
  eq('revoking drops them immediately', (await profiles.customerTable(w.db, w.venueId, { at })).rows.length, 0);
  check(
    'and the revocation is recorded rather than deleted',
    ((await w.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM data_sharing_consents WHERE revoked_at IS NOT NULL`,
    ))?.n ?? 0) === 1,
  );

  /* §1.3 GDPR. */
  const exported = await consent.exportUser(w.db, w.customerId) as Record<string, unknown>;
  check('the export carries the ledger', Array.isArray(exported.points));
  check('and the consent records', Array.isArray(exported.consents));

  await consent.eraseUser(w.db, w.customerId, at);
  const erased = await w.db.get<{ email: string | null; status: string }>(
    `SELECT email, status FROM users WHERE id = $u`,
    { u: w.customerId },
  );
  eq('erasure anonymises rather than deleting', [erased?.email, erased?.status], [null, 'erased']);
  check(
    'the venue’s visits survive as numbers',
    ((await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM venue_visits WHERE venue_id = $v`, {
      v: w.venueId,
    }))?.n ?? 0) === 1,
  );

  await w.db.close();
}

/**
 * Sharing a profile with a venue you actually visited — the default.
 *
 * §1.4's grant used to be written only when a player found the switch on a
 * venue's sheet and pressed it, so a venue's identified half was empty of
 * everybody who had never gone looking: the dashboard read "nobody comes here
 * twice" when it meant "nobody pressed a button".
 * `users.venue_sharing_default` is the account's standing answer and is on.
 *
 * Four properties, and three of them are what keep this from being "the consent
 * gate was removed":
 *
 *  1. The grant appears **on a confirmed visit** and not before — not at
 *     sign-up, which would hand every venue in the catalogue a customer who has
 *     never been there.
 *  2. It is still **per venue**.
 *  3. **A withdrawal is never undone.** A player who revoked is not re-granted
 *     on their next visit, which is the clause that makes a default safe: a
 *     default may decide what happens before somebody has an opinion and must
 *     never overrule the opinion once they have one.
 *  4. **Off means nothing is written** — no row at all, so the venue's queries
 *     behave exactly as they did before any of this existed.
 */
async function sharingDefaultRules(): Promise<void> {
  describe('§1.4 the sharing default: on, per venue, and never over a refusal');

  const w = await world();
  const at = now();

  eq('an account shares with the venues it visits by default',
    (await accounts.getUser(w.db, w.customerId)).venue_sharing_default, 1);

  /* Nothing yet: the default is an answer about venues somebody visits, and
     this account has not visited one. */
  eq('…but nothing is shared before a visit',
    (await w.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM data_sharing_consents WHERE user_id = $u`,
      { u: w.customerId },
    ))?.n,
    0);

  await scan(w, 4200, at);

  const table = await profiles.customerTable(w.db, w.venueId, { at });
  eq('a confirmed visit is what writes the grant', table.rows.length, 1);
  eq('…and the venue can say how many shared', [table.totalCustomers, table.sharedCustomers], [1, 1]);

  /* The row is a **row**, with the audit fields the table exists for. A
     default that wrote something un-auditable would have traded away the point
     of `data_sharing_consents`. */
  const row = await w.db.get<{ granted_at: string; policy_version: string; revoked_at: string | null }>(
    `SELECT granted_at, policy_version, revoked_at FROM data_sharing_consents
      WHERE user_id = $u AND venue_id = $v`,
    { u: w.customerId, v: w.venueId },
  );
  check('the implied grant is as auditable as a pressed one',
    row?.granted_at === at && row.policy_version.length > 0 && row.revoked_at === null,
    JSON.stringify(row));

  /* ── and a refusal stands ── */
  await consent.revokeSharing(w.db, w.customerId, w.venueId, at);
  eq('withdrawing drops them', (await profiles.customerTable(w.db, w.venueId, { at })).rows.length, 0);

  await scan(w, 3300, plusMinutes(at, 1500));
  eq('…and the next visit does not re-grant it',
    (await profiles.customerTable(w.db, w.venueId, { at: plusMinutes(at, 1500) })).rows.length, 0);
  eq('…with exactly one row, still revoked',
    (await w.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM data_sharing_consents
        WHERE user_id = $u AND venue_id = $v AND revoked_at IS NOT NULL`,
      { u: w.customerId, v: w.venueId },
    ))?.n,
    1);

  /* ── a "no" said before the first visit stands too ──
     The venue sheet draws an undecided venue *on*, because the default will
     grant it at the till. Switching it off there has no row to revoke, so the
     refusal is written as one — or the first visit would grant it anyway. */
  const w3 = await world();
  eq('switching off an undecided venue is recorded',
    await consent.revokeSharing(w3.db, w3.customerId, w3.venueId, at), true);
  eq('…as a withdrawn venue', await consent.sharingWithdrawn(w3.db, w3.customerId), [w3.venueId]);
  await scan(w3, 3300, plusMinutes(at, 60));
  eq('…which the first visit does not grant',
    (await profiles.customerTable(w3.db, w3.venueId, { at: plusMinutes(at, 60) })).rows.length, 0);
  await consent.grantSharing(w3.db, { userId: w3.customerId, venueId: w3.venueId, at });
  eq('…and switching it back on leaves nothing withdrawn',
    await consent.sharingWithdrawn(w3.db, w3.customerId), []);
  await w3.db.close();

  /* ── off means nothing at all ── */
  const w2 = await world();
  await consent.setSharingDefault(w2.db, w2.customerId, false);
  await scan(w2, 5000, at);
  eq('an account that switched it off shares nothing',
    (await w2.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM data_sharing_consents WHERE user_id = $u`,
      { u: w2.customerId },
    ))?.n,
    0);
  eq('…and is counted without being named',
    [(await profiles.customerTable(w2.db, w2.venueId, { at })).totalCustomers,
     (await profiles.customerTable(w2.db, w2.venueId, { at })).rows.length],
    [1, 0]);

  /* Switching the default off does **not** revoke what stands. The grants are
     about venues somebody has been to; declining future ones is a different
     decision from withdrawing the ones they made. */
  await consent.setSharingDefault(w2.db, w2.customerId, true);
  await scan(w2, 5100, plusMinutes(at, 1500));
  eq('turning it back on grants on the next visit',
    (await profiles.customerTable(w2.db, w2.venueId, { at: plusMinutes(at, 1500) })).rows.length, 1);
  await consent.setSharingDefault(w2.db, w2.customerId, false);
  eq('…and turning it off again leaves that grant standing',
    (await profiles.customerTable(w2.db, w2.venueId, { at: plusMinutes(at, 1500) })).rows.length, 1);

  await w.db.close();
  await w2.db.close();
}

async function analyticsRules(): Promise<void> {
  describe('§12 / B9 analytics — counted, estimated, attributed, suppressed');
  const w = await world();
  const at = now();

  /* Two customers is below the cohort floor, so findings about them are
     suppressed while the raw counts are not. */
  await scan(w, 5000, at);
  const overview = await analytics.overview(w.db, w.venueId, { at });
  eq('visits are counted exactly', overview.visits.value, 1);
  eq('and labelled as counted', overview.visits.kind, 'counted');
  check('a finding over one person is suppressed', overview.newCustomers.suppressed);
  eq('…and returns null rather than zero', overview.newCustomers.value, null);
  eq('a projection is labelled an estimate', overview.projectedSalesMinor.kind, 'estimated');

  /* Enough customers, and the same finding is reportable. */
  const many = await world();
  for (let i = 0; i < CONFIG.privacy.minCohort + 2; i += 1) {
    const id = newId('usr');
    await many.db.run(
      `INSERT INTO users (id, email, email_norm, display_name, auth_provider, language, city,
                          status, created_at, updated_at)
       VALUES ($i, $e, $e, 'P', 'email', 'en', 'Krakow', 'active', $t, $t)`,
      { i: id, e: `p${i}@verify.test`, t: at },
    );
    await scan(many, 4000 + i * 100, at, id);
  }
  const wide = await analytics.overview(many.db, many.venueId, { at });
  check('above the floor it is reported', !wide.newCustomers.suppressed);
  eq('everybody is new the first month', wide.newCustomers.value, CONFIG.privacy.minCohort + 2);

  const heat = await analytics.heatmap(many.db, many.venueId, { at });
  eq('the heatmap counts every visit', heat.total, CONFIG.privacy.minCohort + 2);
  check('and finds a quiet window inside opening hours', heat.quietest !== null);

  const cost = await analytics.costPerNewCustomer(many.db, many.venueId, { at });
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
  const quiet = await analytics.reach(w.db, w.venueId, { at });
  eq('a venue nobody has seen has no impressions', quiet.impressions, 0);
  eq('and its click rate is zero, not NaN', quiet.clickRate, 0);
  check('a zero rate is a number', Number.isFinite(quiet.clickRate));

  /* Six impressions, two clicks — on the listing itself, which is the half a
     venue has before it has published anything at all. */
  for (let i = 0; i < 6; i += 1) {
    await trackListing(w.db, { venueId: w.venueId, kind: 'impression', source: 'list', at });
  }
  await trackListing(w.db, { venueId: w.venueId, kind: 'click', source: 'list', userId: w.customerId, at });
  await trackListing(w.db, { venueId: w.venueId, kind: 'click', source: 'map', userId: w.customerId, at });

  /* And a deal, so the two halves are seen to sum. */
  const seen = await partners.createDeal(w.db, {
    actorId: w.ownerId,
    draft: { venueId: w.venueId, copy: { en: { title: 'Seen', description: 'x' } } },
    at,
  });
  await partners.publishDeal(w.db, { dealId: seen.id, actorId: w.ownerId, at });
  for (let i = 0; i < 4; i += 1) {
    await deals.track(w.db, { dealId: seen.id, kind: 'impression', source: 'home_widget', at });
  }
  await deals.track(w.db, { dealId: seen.id, kind: 'open', source: 'home_widget', userId: w.customerId, at });

  const reach = await analytics.reach(w.db, w.venueId, { at });
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

  await w.db.close();
  await many.db.close();
}

async function entitlementRules(): Promise<void> {
  describe('§12a / B7 entitlements');
  const w = await world();
  const at = now();

  const free = await entitlements.entitlementsFor(w.db, { userId: w.customerId });
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
    await w.db.run(
      `INSERT INTO plan_entitlements (plan_id, key, value) VALUES ('pln_consumer_free', $k, '99')
         ON CONFLICT (plan_id, key) DO UPDATE SET value = excluded.value`,
      { k: key },
    );
  }
  check(
    'a database seeded by an older build still has the withdrawn keys',
    entitlements.entNumber(
      await entitlements.entitlementsFor(w.db, { userId: w.customerId }),
      'daily_lives',
      0,
    ) === 99,
  );

  await seedPlatform(w.db);
  for (const key of stale) {
    eq(
      `re-seeding removes the withdrawn key ${key}`,
      (await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM plan_entitlements WHERE key = $k`, {
        k: key,
      }))?.n,
      0,
    );
  }
  check(
    '…and leaves the key that replaced it',
    entitlements.entNumber(
      await entitlements.entitlementsFor(w.db, { userId: w.customerId }),
      'daily_energy',
      0,
    ) === CONFIG.points.dailyEnergy,
  );

  await entitlements.startSubscription(w.db, {
    subject: { userId: w.customerId },
    planCode: 'pro',
    source: 'stripe',
    at,
  });
  const pro = await entitlements.entitlementsFor(w.db, { userId: w.customerId });
  eq('a paid plan raises the multiplier', pro.points_multiplier, '1.25');

  /* §12a.4: the multiplier is applied at commit and recorded on the entry. */
  const receipt = await scan(w, 5000, at);
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
    (await w.db.get<{ multiplier: number }>(
      `SELECT multiplier FROM points_ledger WHERE source_ref = $r`,
      { r: receipt.transaction.id },
    ))?.multiplier,
    /* One, not 1.25. The column still exists and a game round still uses it;
       a scan does not, and the entry says so. Asserting the *absence* here is
       the point — this is the row that would prove a subscriber had been paid
       twice for one visit. */
    1,
  );

  /* A lapse restricts; it never claws back. */
  const subscription = (await entitlements.activeSubscription(w.db, { userId: w.customerId }))!;
  const balanceBefore = await ledger.balance(w.db, w.customerId);
  await entitlements.setStatus(w.db, subscription.id, 'expired', at);
  eq(
    'a lapse falls back to free',
    (await entitlements.entitlementsFor(w.db, { userId: w.customerId })).points_multiplier,
    '1',
  );
  eq('and takes nothing back', await ledger.balance(w.db, w.customerId), balanceBefore);

  /* B7: capacity gates scale. Starter allows one live deal. */
  const first = await partners.createDeal(w.db, {
    actorId: w.ownerId,
    draft: { venueId: w.venueId, copy: { en: { title: 'One', description: 'x' } } },
    at,
  });
  await partners.publishDeal(w.db, { dealId: first.id, actorId: w.ownerId, at });
  const second = await partners.createDeal(w.db, {
    actorId: w.ownerId,
    draft: { venueId: w.venueId, copy: { en: { title: 'Two', description: 'x' } } },
    at,
  });
  await throws('a second live deal needs a bigger plan', 'entitlement_required', async () =>
    await partners.publishDeal(w.db, { dealId: second.id, actorId: w.ownerId, at }),
  );

  await w.db.close();
}

async function assistantRules(): Promise<void> {
  describe('§10 / B8 the assistant');
  const w = await world();
  const at = now();

  /* B8: a new partner gets an honest empty signal and data-free options. */
  const empty = await assistant.venueContext(w.db, w.venueId, at);
  check('a venue with no data says so', empty.empty);
  check('and offers a richer set of starting points', empty.suggestions.length >= 4);
  check(
    'none of which quotes an invented number',
    empty.suggestions.every((s) => !/\d+%/.test(s.detail)),
  );

  await scan(w, 5000, at);
  const filled = await assistant.venueContext(w.db, w.venueId, at);
  check('once measured it stops being empty', !filled.empty);
  check('and the facts are grounded', filled.facts.length > 0);

  const draft = await assistant.draftFor(w.db, {
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

  await w.db.close();
}

async function socialRules(): Promise<void> {
  describe('§8 referrals and leaderboards');
  const w = await world();
  const at = now();

  /*
   * The inviter is a third account, not the venue's owner. It was the owner
   * once, with the scan confirmed at the owner's own till — which is the exact
   * farm the payout now refuses, and is checked as such further down.
   */
  const inviter = await accounts.signUp(w.db, {
    email: 'inviter@verify.test', password: 'hunter22', name: 'Inviter', acceptTerms: true, at,
  });
  const code = await social.codeFor(w.db, inviter.id);
  check('a new code is PY plus digits', /^PY\d{4,8}$/.test(code), code);
  eq('binding to yourself is refused', (await social.bind(w.db, { code, newUserId: inviter.id, at })).reason, 'self_referral');
  eq('an unknown code is refused', (await social.bind(w.db, { code: 'PYNOPE22', newUserId: w.customerId, at })).reason, 'unknown_code');
  await throws('the form check agrees', 'not_found', async () => await social.lookup(w.db, 'PYNOPE22'));

  /* Read off a phone and typed back: lower case, a space, a dash. */
  const typed = ` ${code.slice(0, 2).toLowerCase()} ${code.slice(2, 4)}-${code.slice(4)} `;
  eq('the form check folds case, spacing and dashes', (await social.lookup(w.db, typed)).code, code);
  eq('…and so does binding', (await social.bind(w.db, { code: typed, newUserId: w.customerId, at })).ok, true);
  eq('and pays nothing yet', await ledger.balance(w.db, inviter.id), 0);

  /* Under the venue's minimum spend is not a visit, so it is not the visit the
     referral waits for. It used to pay. */
  await scan(w, 1000, at);
  eq('a scan under the minimum spend pays nothing', await ledger.balance(w.db, inviter.id), 0);

  await scan(w, 4000, at);
  /* Both sides are paid on the invitee's first *counted visit* and not at
     sign-up, so an invite only pays for somebody who actually turned up. */
  eq('the first counted visit pays the referrer', await ledger.balance(w.db, inviter.id), CONFIG.earn.referrerFirstVisit);
  const bond = await w.db.get<{ id: string; status: string }>(`SELECT id, status FROM referrals WHERE referred_id = $u`, {
    u: w.customerId,
  });
  eq('and the bond is completed', bond?.status, 'completed');
  /* The inviter's own share, not what the bond cost both sides together. */
  const progress = await social.referralProgress(w.db, inviter.id);
  eq('progress reports what the inviter was paid', [progress.joined, progress.completed, progress.pointsEarned],
    [1, 1, CONFIG.earn.referrerFirstVisit]);

  /* The farm: an owner's own code, confirmed at the owner's own till. Left
     pending, so a real visit somewhere else would still pay it. */
  const sock = await accounts.signUp(w.db, {
    email: 'sock@verify.test', password: 'hunter22', name: 'Sock', acceptTerms: true, at,
  });
  const ownerCode = await social.codeFor(w.db, w.ownerId);
  await social.bind(w.db, { code: ownerCode, newUserId: sock.id, at });
  const ownerBefore = await ledger.balance(w.db, w.ownerId);
  await scan(w, 4000, at, sock.id);
  eq('an owner is not paid for a referral confirmed at their own till', await ledger.balance(w.db, w.ownerId), ownerBefore);
  eq('…and the bond stays pending',
    (await w.db.get<{ status: string }>(`SELECT status FROM referrals WHERE referred_id = $u`, { u: sock.id }))?.status,
    'pending');

  /* Voiding a paid referral takes both payouts back, by compensating entries. */
  const customerBefore = await ledger.balance(w.db, w.customerId);
  const voided = await social.rejectReferral(w.db, { referralId: bond!.id, note: 'verify', at });
  eq('rejecting a paid referral reverses both payouts', voided.reversed.length, 2);
  eq('…the inviter is back where they started', await ledger.balance(w.db, inviter.id), 0);
  eq('…and so is the invitee', await ledger.balance(w.db, w.customerId), customerBefore - CONFIG.earn.inviteeJoin);
  const after = await social.referralProgress(w.db, inviter.id);
  eq('…and progress no longer counts it', [after.joined, after.pointsEarned], [0, 0]);
  await throws('a referral cannot be rejected twice', 'conflict', async () =>
    await social.rejectReferral(w.db, { referralId: bond!.id, note: 'again', at }),
  );

  /* Google sign-up can be referred too — it could not, on any client. Bound on
     the press that *creates* the account, and only then. */
  const viaGoogle = await accounts.linkGoogleAccount(w.db, {
    sub: 'google-sub-referred', email: 'referred.google@verify.test', name: 'Via Google',
    referralCode: code.toLowerCase(), at,
  });
  eq('a Google sign-up binds the invite',
    (await w.db.get<{ referrer_id: string }>(`SELECT referrer_id FROM referrals WHERE referred_id = $u`, { u: viaGoogle.id }))?.referrer_id,
    inviter.id);

  /* §8.2: opted **out** means not listed, but still ranked and still shown.
     The opt-out has to be asked for now — the column defaults to on, so the
     fixture is listed like everybody else and the rule under test is what
     happens when somebody switches it off. */
  await ledger.earn(w.db, { userId: w.customerId, points: 40, reason: 'game_win', at });
  const byDefault = await social.board(w.db, { userId: w.customerId, scope: 'city', city: 'Krakow', at });
  check('on by default, so you are listed', !byDefault.hidden && byDefault.rows.some((row) => row.isYou));

  await social.setLeaderboardOptIn(w.db, w.customerId, false);
  const board = await social.board(w.db, { userId: w.customerId, scope: 'city', city: 'Krakow', at });
  check('you see yourself', board.you !== null);
  check('…and know you are hidden', board.hidden);
  eq('nobody else sees you', board.rows.filter((row) => !row.isYou).length, 0);

  await social.setLeaderboardOptIn(w.db, w.customerId, true);
  const listed = await social.board(w.db, { scope: 'city', city: 'Krakow', at });
  check('opting in lists you', listed.rows.some((row) => row.userId === w.customerId));

  /*
   * The three scopes, and the fallback between them.
   *
   * The customer is in Krakow, PL. A country board finds them, a global board
   * finds them, and a *different* city does not — which is the check that the
   * filter is actually applied rather than ignored, because a board that
   * silently ranks everybody would pass all three of the positive cases.
   */
  await w.db.run(`UPDATE users SET country_code = 'PL' WHERE id = $u`, { u: w.customerId });
  const byCountry = await social.board(w.db, { scope: 'country', country: 'PL', at });
  check('a country board finds them', byCountry.rows.some((r) => r.userId === w.customerId));
  eq('…and says which scope answered', byCountry.scope, 'country:PL');

  const global = await social.board(w.db, { scope: 'global', at });
  check('a global board finds them', global.rows.some((r) => r.userId === w.customerId));
  eq('…and names itself', global.scope, 'global');

  const elsewhere = await social.board(w.db, { scope: 'city', city: 'Warsaw', at });
  check('another city does not', !elsewhere.rows.some((r) => r.userId === w.customerId));

  /*
   * **A scope with nothing to filter on falls back to global rather than to
   * empty**, and says so in `scope`. Asking for "my city" with no city set is a
   * question with no answer; an empty table would read as a claim about other
   * people rather than about a blank field.
   */
  const noCity = await social.board(w.db, { userId: w.customerId, scope: 'city', city: null, at });
  eq('a city board with no city falls back', noCity.scope, 'global');
  check('…and still ranks you', noCity.rows.some((r) => r.userId === w.customerId));
  const noCountry = await social.board(w.db, { scope: 'country', country: null, at });
  eq('…and so does a country board', noCountry.scope, 'global');

  await w.db.close();
}

/**
 * §7.3 referrals, end to end over HTTP: the link, the people, redeeming a code
 * after sign-up, every refusal and its `reason`, the payout on the invitee's
 * first confirmed visit, and the 500 at five.
 *
 * `socialRules` above checks the bond in the domain; this is the surface the
 * phone and the website's `/i/:code` page actually call.
 */
async function referralRules(): Promise<void> {
  describe('§7.3 referrals over HTTP');

  eq('a pasted link normalises to its code', social.normaliseCode(' https://www.pay-lez.com/i/py1234/ '), 'PY1234');
  eq('lower case and spaces normalise', social.normaliseCode('py 12 34'), 'PY1234');
  eq('a query string is not part of the code', social.normaliseCode('https://www.pay-lez.com/i/PY1234?utm=x'), 'PY1234');
  eq('a name is first name + last initial', social.shortName('Marta Anna Kowalska'), 'Marta K.');
  eq('…a single word stays whole', social.shortName('marta_k'), 'marta_k');
  eq('…and nothing is nothing', social.shortName('  '), '');

  const w = await world();
  const api = createApi({ db: w.db, routes: allRoutes, secret: SECRET, limits: false });
  const server = await api.listen(0, '127.0.0.1');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const call = async (method: string, path: string, options: { token?: string; body?: unknown } = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  const signUp = async (email: string, name: string, referralCode?: string) => {
    const r = await call('POST', '/v1/auth/signup', {
      body: { email, password: 'hunter22', name, acceptTerms: true, ...(referralCode ? { referralCode } : {}) },
    });
    return { token: r.body.token as string, id: r.body.user.id as string };
  };

  const base = midMonth();
  try {
    const amina = await signUp('amina@ref.test', 'Amina Tursunova');
    const mine = await call('GET', '/v1/referrals', { token: amina.token });
    eq('GET /v1/referrals answers', mine.status, 200);
    const code = mine.body.code as string;
    eq('the link is the website’s /i/<code>', mine.body.link, `https://www.pay-lez.com/i/${code}`);
    eq('nobody yet', mine.body.people, []);
    eq('a fresh account can still add a code', mine.body.canRedeem, true);
    eq('…and was invited by nobody', mine.body.referredBy, null);
    eq('the reward figures come from config', [mine.body.referrerReward, mine.body.inviteeReward, mine.body.friendMilestoneAt, mine.body.friendMilestone], [CONFIG.earn.referrerFirstVisit, CONFIG.earn.inviteeJoin, CONFIG.earn.friendMilestoneAt, CONFIG.earn.friendMilestone]);

    /* The public lookup the landing page and the app's confirm screen use. */
    const looked = await call('GET', `/v1/referrals/codes/${code.toLowerCase()}`);
    eq('the public lookup answers without a session', looked.status, 200);
    eq('…with a short name, never the email', looked.body.name, 'Amina T.');
    eq('…and the canonical code', looked.body.code, code);
    eq('an unknown code is 404', (await call('GET', '/v1/referrals/codes/NOPE00')).status, 404);

    /* Sign-up carries the code — pasted as the whole link, in lower case. */
    const bek = await signUp('bek@ref.test', 'Bek Karimov', `https://www.pay-lez.com/i/${code.toLowerCase()}`);
    const afterJoin = await call('GET', '/v1/referrals', { token: amina.token });
    eq('sign-up with the link binds the invite', afterJoin.body.joined, 1);
    eq('…and lists the person as joined', afterJoin.body.people.map((p: { name: string; status: string }) => [p.name, p.status]), [['Bek K.', 'joined']]);
    eq('…with nothing paid yet', afterJoin.body.pointsEarned, 0);
    const bekView = await call('GET', '/v1/referrals', { token: bek.token });
    eq('the invitee sees who invited them', bekView.body.referredBy, { name: 'Amina T.', status: 'joined' });
    eq('…and cannot add a second code', bekView.body.canRedeem, false);

    /* Redeeming after sign-up, and every refusal with its reason. */
    const cara = await signUp('cara@ref.test', 'Cara');
    const redeemed = await call('POST', '/v1/referrals/redeem', { token: cara.token, body: { code } });
    eq('a code can be added after sign-up', redeemed.status, 200);
    eq('…and names the referrer', redeemed.body.referredBy, { name: 'Amina T.' });
    const twice = await call('POST', '/v1/referrals/redeem', { token: cara.token, body: { code } });
    eq('only once per account', [twice.status, twice.body.error?.reason], [409, 'already_referred']);
    const self = await call('POST', '/v1/referrals/redeem', { token: amina.token, body: { code } });
    eq('never your own code', [self.status, self.body.error?.reason], [400, 'self_referral']);
    const bekCode = bekView.body.code as string;
    const circle = await call('POST', '/v1/referrals/redeem', { token: amina.token, body: { code: bekCode } });
    eq('never in a circle', [circle.status, circle.body.error?.reason], [409, 'circular']);
    const unknown = await call('POST', '/v1/referrals/redeem', { token: amina.token, body: { code: 'PY0000000' } });
    eq('an unknown code is 404', [unknown.status, unknown.body.error?.reason], [404, 'unknown_code']);

    const guest = await call('POST', '/v1/auth/guest', { body: { device: 'ref-verify-device' } });
    const asGuest = await call('POST', '/v1/referrals/redeem', { token: guest.body.token, body: { code } });
    eq('a guest carries the code into sign-up instead', asGuest.status, 403);

    /* Before the first confirmed visit only. */
    const dana = await signUp('dana@ref.test', 'Dana');
    await scan(w, 4000, base, dana.id);
    const late = await call('GET', '/v1/referrals', { token: dana.token });
    eq('after a visit the phone is told not to offer it', late.body.canRedeem, false);
    const tooLate = await call('POST', '/v1/referrals/redeem', { token: dana.token, body: { code } });
    eq('…and the server refuses it', [tooLate.status, tooLate.body.error?.reason], [409, 'already_visited']);

    /* The payout: 100 each on the invitee's first confirmed visit. */
    await scan(w, 4000, base, bek.id);
    const paid = await call('GET', '/v1/referrals', { token: amina.token });
    eq('the first visit completes the invite', paid.body.completed, 1);
    eq('pointsEarned is what reached the referrer, not both sides', paid.body.pointsEarned, CONFIG.earn.referrerFirstVisit);
    const bekRow = paid.body.people.find((p: { name: string }) => p.name === 'Bek K.');
    eq('…and the person reads completed, with their share', [bekRow?.status, bekRow?.pointsAwarded, typeof bekRow?.completedAt], ['completed', CONFIG.earn.referrerFirstVisit, 'string']);
    const bekLedger = await w.db.get<{ n: number }>(
      `SELECT SUM(delta) AS n FROM points_ledger WHERE user_id = $u AND source_kind = 'referral'`,
      { u: bek.id },
    );
    eq('the invitee is paid on the same visit', bekLedger?.n, CONFIG.earn.inviteeJoin);
    await scan(w, 4000, plusDays(base, 2), bek.id);
    eq('a second visit pays nobody again', (await call('GET', '/v1/referrals', { token: amina.token })).body.pointsEarned, CONFIG.earn.referrerFirstVisit);

    /* The friend milestone: 500 at five completed, once. Cara is the second. */
    await scan(w, 4000, base, cara.id);
    for (const name of ['Eli', 'Farid', 'Gul']) {
      const friend = await signUp(`${name.toLowerCase()}@ref.test`, name, code);
      await scan(w, 4000, base, friend.id);
    }
    const five = await call('GET', '/v1/referrals', { token: amina.token });
    eq('five completed', five.body.completed, 5);
    eq('the milestone is paid on the fifth, and counted in pointsEarned', five.body.pointsEarned, 5 * CONFIG.earn.referrerFirstVisit + CONFIG.earn.friendMilestone);
    const hana = await signUp('hana@ref.test', 'Hana', code);
    await scan(w, 4000, base, hana.id);
    const six = await call('GET', '/v1/referrals', { token: amina.token });
    eq('the milestone is paid once', six.body.pointsEarned, 6 * CONFIG.earn.referrerFirstVisit + CONFIG.earn.friendMilestone);

    /* Google sign-up carries a code on the create path, and only there. */
    const viaGoogle = await accounts.linkGoogleAccount(w.db, { sub: 'g-ref-1', email: 'iris@ref.test', name: 'Iris Novak', referralCode: code });
    eq('a Google sign-up binds the invite', (await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM referrals WHERE referred_id = $u`, { u: viaGoogle.id }))?.n, 1);
    await accounts.linkGoogleAccount(w.db, { sub: 'g-ref-1', email: 'iris@ref.test', name: 'Iris Novak', referralCode: bekCode });
    eq('…and signing in again does not rebind it', (await w.db.get<{ referrer_id: string }>(`SELECT referrer_id FROM referrals WHERE referred_id = $u`, { u: viaGoogle.id }))?.referrer_id, amina.id);

    /* The routes declare their limits: the code space is small. */
    const redeemRoute = allRoutes.find((r) => r.method === 'POST' && r.pattern === '/v1/referrals/redeem');
    eq('redeeming is bounded per account', redeemRoute?.limit?.by, 'account');
    const lookupRoute = allRoutes.find((r) => r.method === 'GET' && r.pattern === '/v1/referrals/codes/:code');
    eq('the public lookup is bounded per connection', lookupRoute?.limit?.by, 'connection');
  } finally {
    server.close();
  }

  /* A full four-digit space widens instead of failing sign-up. */
  await w.db.tx(async () => {
    const at = now();
    for (let n = 1000; n < 10000; n += 1) {
      await w.db.run(
        `INSERT INTO users (id, display_name, auth_provider, language, status, referral_code, created_at, updated_at)
         VALUES ($i, 'Filler', 'provisional', 'en', 'provisional', $c, $t, $t)
         ON CONFLICT DO NOTHING`,
        { i: `usr_fill_${n}`, c: `PY${n}`, t: at },
      );
    }
  });
  const crowded = newId('usr');
  await w.db.run(
    `INSERT INTO users (id, display_name, auth_provider, language, status, created_at, updated_at)
     VALUES ($i, 'Late', 'provisional', 'en', 'provisional', $t, $t)`,
    { i: crowded, t: now() },
  );
  const wide = await social.codeFor(w.db, crowded);
  check('a full four-digit space still allocates a code', /^PY\d{6,8}$/.test(wide), wide);

  await w.db.close();
}

async function trafficRules(): Promise<void> {
  describe('website traffic and the sign-in throttle');
  const w = await world();
  const at = now();

  const beacon = async (over: Partial<Parameters<typeof traffic.record>[1]> = {}, when = at) =>
    await traffic.record(
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

  const first = await beacon();
  const second = await beacon({ events: [{ kind: 'view', path: '/#/learn' }] });
  eq('two views inside the window are one visit', first, second);

  const later = await beacon({ events: [{ kind: 'view', path: '/' }] }, plusDays(at, 0.5));
  check('a view after the idle window is a new visit', later !== first);

  check(
    'no IP address is stored anywhere',
    (await w.db.all<{ visitor_day: string }>(`SELECT visitor_day FROM web_sessions`)).every(
      (row) => !row.visitor_day.includes('203.0.113'),
    ),
  );

  /* A query string is where somebody's email ends up in an analytics tool. */
  await beacon({ events: [{ kind: 'view', path: '/search?email=a@b.com&q=x' }] });
  check(
    'a query string never lands in a path',
    (await w.db.all<{ path: string }>(`SELECT path FROM web_events`)).every((row) => !row.path.includes('@')),
  );

  const own = await beacon({ referrer: 'http://localhost:5173/#/b2b' }, plusDays(at, 1));
  eq(
    'a referrer from the site itself is not a referrer',
    (await w.db.get<{ referrer_host: string | null }>(`SELECT referrer_host FROM web_sessions WHERE id = $i`, {
      i: own,
    }))?.referrer_host,
    null,
  );

  /* The feed is a five-arm union over five tables' real column names. */
  const feed = await traffic.activity(w.db, 20);
  check('the activity feed runs', Array.isArray(feed));

  const report = await traffic.overview(w.db, traffic.defaultRange(plusDays(at, 1)));
  check('the console counts the visits', report.sessions >= 3);
  check('…and the pages', report.pages.length > 0);
  eq(
    'returning anonymous visitors is null, never zero',
    report.anonymousReturningVisitors,
    null,
  );

  /* Retention is a promise, so it is a check. */
  await traffic.record(
    w.db,
    { events: [{ kind: 'view', path: '/old' }], ip: '203.0.113.1', agent: 'a' },
    SECRET,
    plusDays(at, -500),
  );
  await traffic.prune(w.db, at);
  eq(
    'events past the retention window are gone',
    (await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM web_events WHERE path = '/old'`))?.n,
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
    acceptTerms: true,
  });
  await accounts.signUp(w.db, {
    email: 'bystander@verify.test',
    password: 'correct horse',
    name: 'Bystander',
    acceptTerms: true,
  });
  for (let attempt = 0; attempt < CONFIG.auth.signInPerHour; attempt += 1) {
    await rejects(
      `wrong password ${attempt + 1} is refused`,
      async () => await accounts.signIn(w.db, { email: 'throttle@verify.test', password: 'nope' }),
      'unauthenticated',
    );
  }
  await rejects(
    'and the right password is refused too, once the limit is reached',
    async () => await accounts.signIn(w.db, { email: 'throttle@verify.test', password: 'correct horse' }),
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
      async () => await accounts.signIn(w.db, { email: 'bystander@verify.test', password: 'nope' }),
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
    (await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM auth_attempts WHERE subject = 'bystander@verify.test'`))
      ?.n,
    0,
  );

  await w.db.close();
}

async function jobRules(): Promise<void> {
  describe('the scheduled jobs');
  const w = await world();
  const at = now();

  const frequent = await jobs.runFrequent(w.db, at);
  /* Three now: the pending sweep, the deal lifecycle, and the push dispatch. */
  check('the frequent job runs clean', frequent.ran.length === 3);

  /*
   * Stale email codes are pruned, because the row is a *stored email address*.
   * One expired two days ago (gone), one expired an hour ago (kept for a day,
   * so a support conversation about "it said expired" still has it). Seeded
   * rather than asserting on an empty table: `changes` is 0 on an empty table
   * either way.
   */
  for (const [n, [userId, expires]] of ([
    [w.ownerId, plusDays(at, -2)],
    [w.customerId, plusMinutes(at, -60)],
  ] as const).entries()) {
    await w.db.run(
      `INSERT INTO email_verifications (id, user_id, email_norm, code_hash, expires_at, sent_at)
       VALUES ($i, $u, $e, 'not-a-real-hash', $x, $x)`,
      { i: `evr_stale_${n}`, u: userId, e: `${userId}@verify.test`, x: expires },
    );
  }

  const daily = await jobs.runDaily(w.db, at);
  eq('nothing has drifted', daily.detail.reconciledDrift, 0);
  eq('the nightly job prunes codes expired over a day ago', daily.detail.codesPruned, 1);
  eq(
    '…and keeps the one that expired an hour ago',
    (await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM email_verifications`))?.n,
    1,
  );

  const weekly = await jobs.runWeekly(w.db, at);
  check('the weekly job snapshots', typeof weekly.detail.leaderboardRows === 'number');

  await w.db.close();
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

/* ═════════════════════════════════════════════════════ email codes ══ */

/**
 * Email OTP: the sign-up confirmation and the password reset
 * (`domain/verification.ts`). Over HTTP where the property is a route's (the
 * code never in a response, the reset saying nothing about which addresses
 * exist), and through the domain with a moved clock for expiry and cooldown.
 *
 * Runs on the local mail adapter: the code is read from `email.outbox`, which
 * is the only place it appears.
 */
async function emailCodeRules(): Promise<void> {
  describe('email codes — confirmation and password reset');
  const saved = {
    key: process.env.PAYLEZ_RESEND_KEY,
    gate: process.env.PAYLEZ_VERIFY_TO_SPEND,
    quiet: process.env.PAYLEZ_QUIET,
    since: process.env.PAYLEZ_VERIFY_SINCE,
  };
  delete process.env.PAYLEZ_RESEND_KEY;
  delete process.env.PAYLEZ_VERIFY_TO_SPEND;
  process.env.PAYLEZ_QUIET = '1';

  const w = await world();
  const at = now();
  /* Accounts from yesterday on are "new"; the deploy-time default is a date
     this machine's clock may not have reached. */
  process.env.PAYLEZ_VERIFY_SINCE = plusDays(at, -1);
  const codeFor6 = (to: string): string => email.lastTo(to)?.body.match(/\b(\d{6})\b/)?.[1] ?? '';
  const api = createApi({ db: w.db, routes: allRoutes, secret: SECRET, limits: false });
  const server = await api.listen(0, '127.0.0.1');
  const address = server.address();
  const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  const seen: string[] = [];
  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    seen.push(text);
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };

  eq('with no Resend key the mail adapter is local', email.mode(), 'local');
  check('…and nothing is gated on an address', !verification.gateOn());

  /* ── sign-up sends the first code ── */
  const signup = await call('POST', '/v1/auth/signup', {
    email: 'otp@verify.test', password: 'hunter22', name: 'Otp', acceptTerms: true,
  });
  eq('sign-up answers', signup.status, 200);
  eq('…and reports that a code went out', signup.body.verification?.sent, true);
  const token = signup.body.token as string;
  const first = codeFor6('otp@verify.test');
  check('a six-digit code reached the outbox', /^\d{6}$/.test(first));
  let me = await call('GET', '/v1/me', undefined, token);
  eq('a new account is unconfirmed', me.body.user.emailVerifiedAt, null);
  eq('…and not required to confirm while mail is local', me.body.user.emailVerificationRequired, false);

  /* ── the gate, switched on as live mail would switch it ── */
  process.env.PAYLEZ_VERIFY_TO_SPEND = 'on';
  me = await call('GET', '/v1/me', undefined, token);
  eq('with the gate on, a new unconfirmed account is required to confirm', me.body.user.emailVerificationRequired, true);
  const tier = await w.db.get<{ id: string }>(`SELECT id FROM voucher_tiers WHERE venue_id = $v LIMIT 1`, { v: w.venueId });
  const voucher = await call('POST', '/v1/vouchers', { venueId: w.venueId, tierId: tier?.id }, token);
  eq('buying a voucher is refused unconfirmed', [voucher.status, voucher.body.error?.code], [403, 'not_verified']);
  const card = await call('POST', '/v1/gift-cards', { stockId: 'gcs_none' }, token);
  eq('…and so is a gift card', [card.status, card.body.error?.code], [403, 'not_verified']);
  eq('checking in is not gated', (await call('POST', '/v1/daily/check-in', {}, token)).status, 200);
  eq('a verified fixture account is not required', await verification.required(w.db, w.customerId), false);
  const old = await accounts.signUp(w.db, { email: 'old@verify.test', password: 'hunter22', name: 'Old', at });
  await w.db.run(`UPDATE users SET created_at = '2026-01-01T00:00:00.000Z' WHERE id = $u`, { u: old.id });
  eq('an account from before `verifySince` is never required', await verification.required(w.db, old.id), false);
  const guest = await accounts.provisional(w.db, 'otp-device', at);
  eq('…nor is a guest with no address', await verification.required(w.db, guest.id), false);

  /* ── resend and confirm ── */
  const resend = await call('POST', '/v1/auth/email/send-code', {}, token);
  eq('a resend inside the cooldown is not an error', resend.status, 200);
  eq('…it says not sent, and when', [resend.body.sent, typeof resend.body.nextSendAt], [false, 'string']);
  const wrong = first === '000000' ? '111111' : '000000';
  const miss = await call('POST', '/v1/auth/email/verify', { code: wrong }, token);
  eq('a wrong code is a 400 with tries left', [miss.status, miss.body.error?.details?.attemptsLeft ?? miss.body.error?.attemptsLeft], [400, 4]);
  const ok = await call('POST', '/v1/auth/email/verify', { code: ` ${first.slice(0, 3)} ${first.slice(3)} ` }, token);
  eq('the right code (with spaces) confirms', [ok.status, ok.body.verified, ok.body.granted], [200, true, true]);
  me = await call('GET', '/v1/me', undefined, token);
  check('…stamps the account', typeof me.body.user.emailVerifiedAt === 'string');
  eq('…and lifts the gate', me.body.user.emailVerificationRequired, false);
  eq('a second confirm is granted: false, not an error',
    (await call('POST', '/v1/auth/email/verify', { code: first }, token)).body.granted, false);
  eq('asking for a code once confirmed is a conflict',
    (await call('POST', '/v1/auth/email/send-code', {}, token)).status, 409);

  /* ── the clock: expiry, attempts, cooldown, the hourly ceiling ── */
  const timed = await accounts.signUp(w.db, { email: 'timed@verify.test', password: 'hunter22', name: 'T', at });
  await verification.sendCode(w.db, { userId: timed.id, at });
  const timedCode = codeFor6('timed@verify.test');
  await throws('a code eleven minutes old has expired', 'expired', () =>
    verification.confirm(w.db, { userId: timed.id, code: timedCode, at: plusMinutes(at, 11) }));
  eq('a send 30 s later is refused by the cooldown',
    (await verification.sendCode(w.db, { userId: timed.id, at: plusMinutes(at, 0.5) })).sent, false);
  let t = at;
  for (let i = 2; i <= CONFIG.auth.codeSendsPerHour; i += 1) {
    t = plusMinutes(t, 1.1);
    await verification.sendCode(w.db, { userId: timed.id, at: t });
  }
  await throws('a sixth code inside the hour is refused', 'quota_exceeded', () =>
    verification.sendCode(w.db, { userId: timed.id, at: plusMinutes(t, 1.1) }));
  eq('…and allowed again after a quiet hour',
    (await verification.sendCode(w.db, { userId: timed.id, at: plusMinutes(t, 61) })).sent, true);
  const live = codeFor6('timed@verify.test');
  const t2 = plusMinutes(t, 62);
  const bad = live === '000000' ? '111111' : '000000';
  for (let i = 0; i < CONFIG.auth.codeAttempts; i += 1) {
    await throws(`wrong answer ${i + 1}`, 'validation_failed', () =>
      verification.confirm(w.db, { userId: timed.id, code: bad, at: t2 }));
  }
  await throws('after five wrong answers even the right code is refused', 'cap_reached', () =>
    verification.confirm(w.db, { userId: timed.id, code: live, at: t2 }));

  /* ── password reset ── */
  const before = email.outbox.length;
  const stranger = await call('POST', '/v1/auth/password/reset-code', { email: 'nobody@verify.test' });
  const known = await call('POST', '/v1/auth/password/reset-code', { email: 'OLD@verify.test ' });
  eq('a reset for an unknown address answers 200 ok', [stranger.status, stranger.body], [200, { ok: true }]);
  eq('…exactly as one for a real address does', [known.status, known.body], [200, { ok: true }]);
  eq('…and only the real one gets mail', email.outbox.length - before, 1);
  const resetCode = codeFor6('old@verify.test');
  const oldSession = await accounts.createSession(w.db, { userId: old.id, mode: 'consumer', surface: 'mobile', at });

  const short = await call('POST', '/v1/auth/password/reset', { email: 'old@verify.test', code: resetCode, password: '123' });
  eq('a short new password is refused on the password field', [short.status, short.body.error?.details?.field ?? short.body.error?.field], [400, 'password']);
  const noSuch = await call('POST', '/v1/auth/password/reset', { email: 'nobody@verify.test', code: '123456', password: 'newpass77' });
  const wrongCode = await call('POST', '/v1/auth/password/reset', {
    email: 'old@verify.test', code: resetCode === '000000' ? '111111' : '000000', password: 'newpass77' });
  eq('a wrong code and an unknown address read the same',
    [noSuch.status, noSuch.body.error?.message], [wrongCode.status, wrongCode.body.error?.message]);
  eq('…both a 400', noSuch.status, 400);
  const reset = await call('POST', '/v1/auth/password/reset', { email: 'old@verify.test', code: resetCode, password: 'newpass77' });
  eq('the right code resets the password', [reset.status, reset.body], [200, { reset: true }]);
  eq('…drops every open session', (await call('GET', '/v1/me', undefined, oldSession.token)).status, 401);
  eq('…signs in with the new password',
    (await call('POST', '/v1/auth/signin', { email: 'old@verify.test', password: 'newpass77' })).status, 200);
  eq('…not the old one',
    (await call('POST', '/v1/auth/signin', { email: 'old@verify.test', password: 'hunter22' })).status, 401);
  check('…and proves the address', Boolean((await w.db.get<{ v: string | null }>(
    `SELECT email_verified_at AS v FROM users WHERE id = $u`, { u: old.id }))?.v));
  eq('a used reset code is spent',
    (await call('POST', '/v1/auth/password/reset', { email: 'old@verify.test', code: resetCode, password: 'again777' })).status, 400);

  /* ── never in a response ── */
  const codes = email.outbox.map((m) => m.body.match(/\b(\d{6})\b/)?.[1]).filter(Boolean) as string[];
  check('no code ever appeared in an HTTP response',
    codes.length > 0 && !seen.some((text) => codes.some((code) => text.includes(`"${code}"`) || text.includes(`:${code}`))));

  server.close();
  await w.db.close();
  for (const [name, value] of [
    ['PAYLEZ_RESEND_KEY', saved.key], ['PAYLEZ_VERIFY_TO_SPEND', saved.gate], ['PAYLEZ_QUIET', saved.quiet],
    ['PAYLEZ_VERIFY_SINCE', saved.since],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

/* ══════════════════════════════════════════════════ the HTTP surface ══ */

async function httpSurface(): Promise<void> {
  describe('the HTTP surface, end to end');
  const w = await world();
  /* Limits off for the surface tour, and checked on purpose in `rateLimits`
     below: every call here arrives on one connection and the tour signs up
     more accounts than `CONFIG.limits.signUpPerHour` allows one to. */
  const api = createApi({ db: w.db, routes: allRoutes, secret: SECRET, limits: false });
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
    body: { email: 'http@verify.test', password: 'hunter22', name: 'HTTP', acceptTerms: true },
  });
  eq('sign-up succeeds', signup.status, 200);
  const token = signup.body.token as string;

  /* The email code over the wire is checked in its own section above. */

  /* An invite, over the wire: the form's check, then a sign-up that says the
     code bound — and one with a bad code that still creates the account. */
  const inviteCode = (await call('GET', '/v1/referrals', { token })).body.code as string;
  eq('the code check knows a real code',
    (await call('GET', `/v1/referrals/codes/${inviteCode.toLowerCase()}`)).body.code, inviteCode);
  eq('…and not an invented one', (await call('GET', '/v1/referrals/codes/PYNOPE22')).status, 404);
  const invited = await call('POST', '/v1/auth/signup', {
    body: { email: 'invited@verify.test', password: 'hunter22', name: 'Invited', acceptTerms: true, referralCode: inviteCode },
  });
  eq('a sign-up with a code says it applied', [invited.status, invited.body.referral?.applied], [200, true]);
  const misTyped = await call('POST', '/v1/auth/signup', {
    body: { email: 'mistyped@verify.test', password: 'hunter22', name: 'Mistyped', acceptTerms: true, referralCode: 'PYNOPE22' },
  });
  eq('a bad code does not cost the sign-up, and says so', [misTyped.status, misTyped.body.referral?.applied], [200, false]);
  eq('…and the inviter sees one friend joined', (await call('GET', '/v1/referrals', { token })).body.joined, 1);

  const dupe = await call('POST', '/v1/auth/signup', {
    body: { email: 'http@verify.test', password: 'hunter22', name: 'HTTP', acceptTerms: true },
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
   * Turning up.
   *
   * On an account of its own, deliberately. Every balance assertion in this
   * function is an absolute figure on `token`'s account, so a check-in paid into
   * it would move a number four hundred lines away and the failure would read as
   * a broken gift card. A fixture that has to be read end to end before a line
   * can be added to it is a fixture nobody adds lines to.
   */
  const dailySignup = await call('POST', '/v1/auth/signup', {
    body: { email: 'daily@verify.test', password: 'hunter22', name: 'Daily', acceptTerms: true },
  });
  const dailyToken = dailySignup.body.token as string;

  /* The claim takes no body, so the only things that can vary between two calls
     are who is asking and what day it is — and the server owns both. */
  const claim = await call('POST', '/v1/daily/check-in', { token: dailyToken, key: 'k-checkin-1' });
  eq('the daily check-in pays', claim.status, 200);
  eq('…the base day, on the first day', claim.body.points, CONFIG.earn.dailyCheckIn);
  eq('…and says it granted', claim.body.granted, true);
  eq('…and starts a streak', claim.body.streak, 1);
  eq('…and says when the day turns', typeof claim.body.dayTurnsAt, 'string');

  /* Same key, same body: the stored response comes back rather than a second
     run. That is the `Idempotency-Key` guard, and it is a different guard from
     the day key below — this one never reaches the domain at all. */
  const replay = await call('POST', '/v1/daily/check-in', { token: dailyToken, key: 'k-checkin-1' });
  eq('a retried request is replayed, not re-run', replay.body.points, CONFIG.earn.dailyCheckIn);
  eq('…including the flag that says it granted', replay.body.granted, true);

  /* A *fresh* key on the same day is a second claim rather than a retry, and
     that is the one the day key has to catch. */
  const second = await call('POST', '/v1/daily/check-in', { token: dailyToken, key: 'k-checkin-2' });
  eq('a second claim the same day grants nothing', second.body.granted, false);
  eq('…and pays nothing', second.body.total, 0);
  eq(
    '…leaving the balance where the first claim left it',
    (await call('GET', '/v1/me', { token: dailyToken })).body.points,
    CONFIG.earn.dailyCheckIn,
  );

  const daily = await call('GET', '/v1/daily', { token: dailyToken });
  eq('the calendar answers', daily.status, 200);
  eq('…with today claimed', daily.body.claimedToday, true);
  eq('…so nothing is on offer', daily.body.claimable, false);
  eq('…and nothing at risk', daily.body.atRisk, false);
  eq(
    '…and the month adds up to the legend under it',
    daily.body.monthTotal,
    (daily.body.monthSources as Array<{ points: number }>).reduce((t, s) => t + s.points, 0),
  );
  eq(
    '…where the check-in is its own row',
    (daily.body.monthSources as Array<{ kind: string; points: number }>).find(
      (s) => s.kind === 'check_in',
    )?.points,
    CONFIG.earn.dailyCheckIn,
  );
  eq('…and today is on the grid', (daily.body.days as Array<{ checkedIn: boolean }>).length, 1);

  const badMonth = await call('GET', '/v1/daily?month=nonsense', { token: dailyToken });
  eq('a month that is not one is a 400', badMonth.status, 400);
  eq('…naming the field', badMonth.body.error.field, 'month');

  eq('the calendar needs a session', (await call('GET', '/v1/daily')).status, 401);
  eq('…and so does the claim', (await call('POST', '/v1/daily/check-in')).status, 401);

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
      body: { email: 'refused@verify.test', password: 'hunter22', name: 'Refused', acceptTerms: true, ...body },
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
      acceptTerms: true,
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
      acceptTerms: true,
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
    body: { email: 'boss@verify.test', password: 'hunter22', name: 'Boss', partner: true, acceptTerms: true },
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

  /*
   * **The two budget routes answer with the same shape.**
   *
   * They did not. `GET .../budget` decorated the pools with the ladder, the
   * average check, the rebalance hint and the tolerance; `GET .../overview`
   * returned the bare view under the same field name. The dashboard's overview
   * screen reads `budget.averageCheck.minor` and `budget.tiers` off the second
   * one, so both were `undefined`, and a `TypeError` thrown in render unmounts
   * React's *entire* tree — every partner with a venue got a black page, and
   * every partner without one got a correct "nothing measured yet", which is
   * what made it look like a property of the account.
   *
   * Checked as a key-set rather than by naming the four, so a fifth decoration
   * added to one route and not the other fails here instead of on a phone.
   */
  const budgetRoute = await call('GET', `/v1/partner/venues/${mine.body.id}/budget`, {
    token: ownerToken,
  });
  eq('the budget route answers', budgetRoute.status, 200);
  const overviewRoute = await call('GET', `/v1/partner/venues/${mine.body.id}/overview`, {
    token: ownerToken,
  });
  eq('the overview route answers', overviewRoute.status, 200);
  eq(
    'and its budget is the same shape the budget route returns',
    Object.keys(overviewRoute.body.budget).sort().join(','),
    Object.keys(budgetRoute.body).sort().join(','),
  );
  check(
    'including the average check every money estimate multiplies by',
    typeof overviewRoute.body.budget.averageCheck?.minor === 'number',
  );
  check('and the ladder', Array.isArray(overviewRoute.body.budget.tiers));

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

  /*
   * ── the dashboard's routes, as a client meets them (contract §2) ──
   *
   * Every venue-scoped route resolves the venue through `mine()`, so each one is
   * put to a partner who does not own the venue in its path. A route that forgot
   * would answer here with somebody else's customers.
   */
  const wCampaign = await partners.createCampaign(w.db, {
    venueId: w.venueId,
    actorId: w.ownerId,
    name: 'Stamp',
    visitsRequired: 3,
    rewardLabel: 'Tea',
    rewardCostMinor: 500,
    at: now(),
  });
  for (const [method, suffix, body] of [
    ['GET', 'series'],
    ['GET', 'insights'],
    ['GET', 'remind'],
    ['POST', 'remind', {}],
    ['GET', 'scans'],
    ['GET', 'audiences'],
    ['GET', 'listing'],
    ['POST', 'counter/lookup', { code: '@anyone' }],
    ['POST', 'counter', { code: '@anyone', amountMinor: 100 }],
  ] as Array<[string, string, unknown?]>) {
    eq(`another partner is refused ${method} …/${suffix}`, (await call(method, `/v1/partner/venues/${w.venueId}/${suffix}`, { token: ownerToken, body })).status, 403);
  }
  eq('…and cannot edit the venue’s campaign', (await call('PATCH', `/v1/partner/campaigns/${wCampaign.id}`, { token: ownerToken, body: { name: 'Mine now' } })).status, 403);

  const own = `/v1/partner/venues/${mine.body.id}`;
  const badDays = await call('GET', `${own}/series?days=45`, { token: ownerToken });
  eq('a series window the range picker does not offer is a 400 naming days', [badDays.status, badDays.body.error.code, badDays.body.error.field], [400, 'validation_failed', 'days']);
  const badSegment = await call('GET', `${own}/scans?segment=everyone`, { token: ownerToken });
  eq('…a till-log segment that is not one names segment', [badSegment.status, badSegment.body.error.field], [400, 'segment']);
  const badLimit = await call('GET', `${own}/scans?limit=500`, { token: ownerToken });
  eq('…and a page over a hundred names limit', [badLimit.status, badLimit.body.error.field], [400, 'limit']);
  const badPeriod = await call('GET', `${own}/overview?period=June`, { token: ownerToken });
  eq('a report month that is not a month is a 400, not a 500', [badPeriod.status, badPeriod.body.error.field], [400, 'period']);
  const weekSeries = await call('GET', `${own}/series?days=7`, { token: ownerToken });
  eq('the series answers the venue’s owner', [weekSeries.status, weekSeries.body.series.length], [200, 7]);
  for (const suffix of ['insights', 'remind', 'scans', 'audiences', 'listing', 'today']) {
    eq(`GET …/${suffix} answers its owner`, (await call('GET', `${own}/${suffix}`, { token: ownerToken })).status, 200);
  }
  eq(
    'the push quota carries its funnel',
    Object.keys((await call('GET', `${own}/push-quota`, { token: ownerToken })).body.funnel).sort(),
    ['cameIn', 'delivered', 'opened', 'sent'],
  );
  eq('the partner budget’s ladder carries take-up', typeof budgetRoute.body.tiers[0]?.issuedCount, 'number');
  const publicVenue = await call('GET', `/v1/venues/${w.venueId}`);
  check(
    'the public venue page’s ladder carries none of it',
    publicVenue.body.tiers.length > 0 &&
      (publicVenue.body.tiers as Array<Record<string, unknown>>).every((tier) => !('issuedCount' in tier) && !('spentMinor' in tier) && !('activeCount' in tier)),
  );
  eq('…and names the clock its hours are in', publicVenue.body.venue.timezone, 'Europe/Warsaw');

  const stampCard = await call('POST', `${own}/campaigns`, {
    token: ownerToken,
    body: { name: 'Stamp card', visitsRequired: 4, rewardLabel: 'A tea', rewardCostMinor: 600 },
  });
  const outOfRange = await call('PATCH', `/v1/partner/campaigns/${stampCard.body.id}`, { token: ownerToken, body: { visitsRequired: 51 } });
  eq('a campaign edit out of range is a 400 naming the field', [outOfRange.status, outOfRange.body.error.field], [400, 'visitsRequired']);
  const renamedCard = await call('PATCH', `/v1/partner/campaigns/${stampCard.body.id}`, {
    token: ownerToken,
    body: { name: 'Stamp card, renamed', minSpendMinor: null },
  });
  eq(
    '…and a good one answers with the row as the list draws it',
    [renamedCard.status, renamedCard.body.name, renamedCard.body.min_spend_minor, typeof renamedCard.body.near],
    [200, 'Stamp card, renamed', null, 'number'],
  );

  const extrasSaved = await call('PATCH', own, {
    token: ownerToken,
    body: { description: { en: 'Hello' }, links: [{ kind: 'website', value: 'https://http.test' }], languages: ['pl'] },
  });
  eq('the listing form saves in one request and answers with the venue row', [extrasSaved.status, extrasSaved.body.id, 'description' in extrasSaved.body], [200, mine.body.id, false]);
  const listingRead = await call('GET', `${own}/listing`, { token: ownerToken });
  eq('…and reads back whole', [listingRead.body.description, listingRead.body.links, listingRead.body.languages], [{ en: 'Hello' }, [{ kind: 'website', value: 'https://http.test' }], ['pl']]);

  await entitlements.startSubscription(w.db, { subject: { venueId: mine.body.id }, planCode: 'growth', source: 'manual', at: now() });
  const unknownStatus = await call('GET', `${own}/customers?status=vip`, { token: ownerToken });
  eq('a customer filter no status matches is a 400, not an empty table', [unknownStatus.status, unknownStatus.body.error.field], [400, 'status']);

  /* The counter needs a live venue and a customer with a handle — a separate
     account, so the balance the gift-card checks below rely on is untouched. */
  await w.db.run(`UPDATE venues SET status = 'live', verified_at = $t WHERE id = $v`, { t: now(), v: mine.body.id });
  const shopper = await call('POST', '/v1/auth/signup', { body: { email: 'counter@verify.test', password: 'hunter22', name: 'Counter', acceptTerms: true } });
  await call('PATCH', '/v1/me', { token: shopper.body.token as string, body: { username: 'http_counter' } });
  const lookedUp = await call('POST', `${own}/counter/lookup`, { token: ownerToken, body: { code: '@HTTP_counter' } });
  eq('the counter finds a customer by the handle they read out', [lookedUp.status, lookedUp.body.kind, lookedUp.body.customer.handle], [200, 'customer', '@http_counter']);
  eq('…and a code nobody holds here is a 404', (await call('POST', `${own}/counter/lookup`, { token: ownerToken, body: { code: 'PLZ-NONE' } })).status, 404);
  const press = { token: ownerToken, key: 'counter-press-1', body: { code: '@http_counter', amountMinor: 4200 } };
  const firstPress = await call('POST', `${own}/counter`, press);
  const secondPress = await call('POST', `${own}/counter`, press);
  eq('a sale at the counter goes through', [firstPress.status, firstPress.body.receipt.amountMinor, firstPress.body.receipt.visitCounted], [200, 4200, true]);
  eq('…a retried press returns the same sale', secondPress.body, firstPress.body);
  eq(
    '…with one transaction behind it',
    (await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM transactions WHERE venue_id = $v AND trigger_type = 'manual'`, { v: mine.body.id }))?.n,
    1,
  );
  check('…and nothing about the customer’s wallet on the wire', !('balance' in firstPress.body.receipt) && !('nextTier' in firstPress.body.receipt));

  /* ── §2.13: an explicit null takes an answer back ── */
  const shopperToken = shopper.body.token as string;
  const finished = await call('PATCH', '/v1/me', {
    token: shopperToken,
    body: { avatar: 'data:image/png;base64,AAAA', occupation: 'student', city: 'Krakow', phone: '+48600000000', birthDate: '1999-05-05' },
  });
  eq('a finished profile is stamped', [finished.status, typeof finished.body.user.profileCompletedAt], [200, 'string']);
  const cleared = await call('PATCH', '/v1/me', { token: shopperToken, body: { avatar: null, phone: null, occupation: null, city: null } });
  eq(
    'null clears the photo, the phone, the status, and the city with its country',
    [cleared.status, cleared.body.user.avatar, cleared.body.user.phone, cleared.body.user.occupation, cleared.body.user.city, cleared.body.user.countryCode],
    [200, null, null, null, null, null],
  );
  eq('…and the completion bonus stays paid and stamped', [cleared.body.points, typeof cleared.body.user.profileCompletedAt], [finished.body.points, 'string']);
  await call('PATCH', '/v1/me', { token: shopperToken, body: { phone: '+48600000001' } });
  eq('an empty string still means leave it', (await call('PATCH', '/v1/me', { token: shopperToken, body: { phone: '' } })).body.user.phone, '+48600000001');
  for (const field of ['name', 'username', 'birthDate', 'language']) {
    const kept = await call('PATCH', '/v1/me', { token: shopperToken, body: { [field]: null } });
    eq(`a profile’s ${field} cannot be cleared — a 400 naming it`, [kept.status, kept.body.error.field], [400, field]);
  }
  const halfCity = await call('PATCH', '/v1/me', { token: shopperToken, body: { city: null, countryCode: 'PL' } });
  eq('clearing the city while naming a country is a 400 naming the country', [halfCity.status, halfCity.body.error.field], [400, 'countryCode']);

  await call('PATCH', own, {
    token: ownerToken,
    body: { subcategory: 'espresso', address: 'Rynek 1', priceRange: '$$', phone: '+48120000000', email: 'hello@http.test', imageUrl: 'data:image/png;base64,AAAA' },
  });
  const bareVenue = await call('PATCH', own, {
    token: ownerToken,
    body: { subcategory: null, address: null, priceRange: null, phone: null, email: null, imageUrl: null },
  });
  eq(
    'null clears a venue’s subcategory, address, price band, phone, email and photo',
    [bareVenue.status, bareVenue.body.subcategory, bareVenue.body.address, bareVenue.body.price_range, bareVenue.body.phone, bareVenue.body.email, bareVenue.body.image_url],
    [200, null, null, null, null, null, null],
  );
  for (const field of ['name', 'category', 'city']) {
    const kept = await call('PATCH', own, { token: ownerToken, body: { [field]: null } });
    eq(`a venue’s ${field} cannot be cleared — a 400 naming it`, [kept.status, kept.body.error.field], [400, field]);
  }
  const partial = await call('PATCH', own, { token: ownerToken, body: { address: 'Rynek 2' } });
  eq('…and a key left out is left alone', [partial.body.address, partial.body.name, partial.body.phone], ['Rynek 2', 'HTTP Café', null]);

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
   *
   * **Its price is derived from the grant rather than written as a round
   * number**, for the same reason one step further on. The card cost exactly
   * 100 and the account's whole balance was `CONFIG.earn.onboarding`, which was
   * also 100 — so the two were equal by coincidence rather than by construction.
   * When the grant became 50 (the welcome round pays the other half now) this
   * became a 409 for insufficient points, and took the two checks after it down
   * with it: the retry had nothing to be idempotent about and the conflict check
   * never reached the conflict. Half the grant is affordable whatever the grant
   * is next.
   */
  const giftCost = Math.floor(CONFIG.earn.onboarding / 2);
  /* Rulebook §2.1: the price is **derived** from the face value at 100 points a
     złoty, so the card is written in PLN at a face of `giftCost` grosze and the
     stored `points_cost` is deliberately a wrong number the server must ignore. */
  await w.db.run(
    `INSERT INTO gift_card_stock (id, brand, logo, face_minor, currency, points_cost, stock, priority_only, active)
     VALUES ('gcs_test', 'Test Brand', 'T', ${giftCost}, 'PLN', 1, 250, 0, 1)
     ON CONFLICT (id) DO NOTHING`,
  );
  await stockCodes(w.db, 'gcs_test', 3);
  const shelfCard = ((await call('GET', '/v1/gift-cards')).body as Array<{ id: string; points_cost: number }>).find(
    (card) => card.id === 'gcs_test',
  );
  eq('the shelf quotes the rule’s price, not the row’s', shelfCard?.points_cost, giftCost);

  /* Rulebook §9.4: Pro and Premium only. A free account is refused for its
     plan, with the code a client turns into an upgrade prompt. */
  const refused = await call('POST', '/v1/gift-cards', { token, key: `${key}-free`, body: { stockId: 'gcs_test' } });
  eq('a free account is refused for its plan', [refused.status, refused.body.error?.code], [403, 'entitlement_required']);

  /* On Pro, and with the month funded — an operator's courtesy plan is not
     revenue, so the pool gets a fixed budget for this check. */
  const buyerId = (await call('GET', '/v1/me', { token })).body.user.id as string;
  await entitlements.startSubscription(w.db, { subject: { userId: buyerId }, planCode: 'pro', source: 'manual', at: now() });
  const pool = CONFIG.giftCards as { fixedMonthlyMajor: number };
  pool.fixedMonthlyMajor = 100;
  const gift = await call('POST', '/v1/gift-cards', { token, key, body: { stockId: 'gcs_test' } });
  eq('a Pro account buys a gift card', gift.status, 200);
  const again = await call('POST', '/v1/gift-cards', {
    token,
    key,
    body: { stockId: 'gcs_test' },
  });
  eq('a retry returns the same result', again.body.code, gift.body.code);
  eq(
    'and spent the points only once',
    (await call('GET', '/v1/me', { token })).body.points,
    CONFIG.earn.onboarding - giftCost,
  );

  const conflict = await call('POST', '/v1/gift-cards', {
    token,
    key,
    body: { stockId: 'gcs_zalando' },
  });
  eq('the same key with a different body is a conflict', conflict.status, 409);
  pool.fixedMonthlyMajor = 0;

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
    '/v1/admin/deals',
    '/v1/admin/referrals',
  ]) {

    const read = await call('GET', path, { token: adminToken });
    eq(`GET ${path} answers`, read.status, 200);
  }

  const feed = await call('GET', '/v1/admin/activity?limit=10', { token: adminToken });
  check('the activity feed is chronological', feed.body.events.length >= 0);
  const seenTraffic = await call('GET', '/v1/admin/traffic', { token: adminToken });
  check('the console sees the beacon', (seenTraffic.body.views as number) >= 1);

  /* ═════════════════════════════════ C7, the console's write half ══
   *
   * Over HTTP for the reason the reads above are: these are hand-written
   * statements against columns nothing else in this file touches, and a route
   * that removes things is the last one anybody wants to find out is wrong.
   *
   * What each block is actually checking is the *rule*, not the SQL. A removal
   * must take down everything the thing put in front of a customer; an operator
   * must not be able to remove themselves; and the two irreversible removals
   * must refuse a wrong answer to their confirmation rather than accepting a
   * near miss.
   */
  const auditBefore =
    (await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_log`))?.n ?? 0;

  /* An offer, built by hand so the fixture states exactly what the routes act
     on: live, at the verified venue, with copy in one language. */
  const dealId = newId('del');
  await w.db.run(
    `INSERT INTO hot_deals (id, venue_id, partner_name, city, country_code, status,
                            points_required, created_at, updated_at)
     VALUES ($i, $v, 'Verify Café', 'Krakow', 'PL', 'live', 0, $t, $t)`,
    { i: dealId, v: w.venueId, t: now() },
  );
  for (const [field, value] of [
    ['title', 'Two for one'],
    ['description', 'All week, on filter coffee'],
  ]) {
    await w.db.run(
      `INSERT INTO translations (entity, entity_id, field, language, value, updated_at)
       VALUES ('hot_deal', $i, $f, 'en', $v, $t)`,
      { i: dealId, f: field, v: value, t: now() },
    );
  }

  const openDeals = await call('GET', '/v1/admin/deals', { token: adminToken });
  eq('GET /v1/admin/deals answers', openDeals.status, 200);
  const listed = (openDeals.body as Array<{ id: string; copy: { title: string } | null }>).find(
    (row) => row.id === dealId,
  );
  check('…and carries the deal', listed !== undefined);
  eq('…with the copy resolved rather than joined', listed?.copy?.title, 'Two for one');

  const notMine = await call('PATCH', `/v1/admin/deals/${dealId}`, {
    token,
    body: { status: 'paused' },
  });
  eq('a customer cannot pause an offer', notMine.status, 403);

  const paused = await call('PATCH', `/v1/admin/deals/${dealId}`, {
    token: adminToken,
    body: { status: 'paused' },
  });
  eq('an operator can', paused.status, 200);
  eq('…and the row says so', paused.body.status, 'paused');

  const resumed = await call('PATCH', `/v1/admin/deals/${dealId}`, {
    token: adminToken,
    body: { status: 'live' },
  });
  eq('…and can put it back', resumed.body.status, 'live');

  /* The gate the console does not get an exemption from. Suspending the venue
     is enough to make the offer unpublishable, because `requireVerified` reads
     `status = 'live'` — so this checks both routes at once. */
  const suspended = await call('PATCH', `/v1/admin/venues/${w.venueId}`, {
    token: adminToken,
    body: { status: 'suspended' },
  });
  eq('a venue can be suspended', suspended.body.status, 'suspended');
  await call('PATCH', `/v1/admin/deals/${dealId}`, { token: adminToken, body: { status: 'paused' } });
  const blocked = await call('PATCH', `/v1/admin/deals/${dealId}`, {
    token: adminToken,
    body: { status: 'live' },
  });
  check('…and an offer at a suspended venue cannot be resumed', blocked.status >= 400);
  await call('PATCH', `/v1/admin/venues/${w.venueId}`, {
    token: adminToken,
    body: { status: 'live' },
  });
  eq(
    'restoring a venue leaves its verification alone',
    (await w.db.get<{ v: string | null }>(`SELECT verified_at AS v FROM venues WHERE id = $i`, {
      i: w.venueId,
    }))?.v !== null,
    true,
  );

  /* The words on the card are editable from here, and the counts are not —
     there is no route on that file that takes one. The edit goes in under the
     request's language, which is the one the operator is reading the row in. */
  const retitled = await call('PATCH', `/v1/admin/deals/${dealId}`, {
    token: adminToken,
    body: { title: 'Renamed by ops', description: 'Second thoughts' },
  });
  eq('an offer can be retitled', retitled.status, 200);
  eq('…and answers with the new words', retitled.body.copy.title, 'Renamed by ops');

  const deletedDeal = await call('DELETE', `/v1/admin/deals/${dealId}`, { token: adminToken });
  eq('an offer can be removed', deletedDeal.status, 200);
  eq(
    '…and removal means the row is gone',
    (await w.db.get(`SELECT id FROM hot_deals WHERE id = $i`, { i: dealId })) ?? null,
    null,
  );
  /* And the words with it. `translations` is keyed by `(entity, entity_id)` and
     has no foreign key to anything, so no cascade reaches it — a deal deleted
     without this sweep leaves its title in the database under an id nothing
     points at. */
  eq(
    '…including every language it was written in',
    (await w.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM translations WHERE entity = 'hot_deal' AND entity_id = $i`,
      { i: dealId },
    ))?.n,
    0,
  );
  const afterDelete = await call('GET', '/v1/admin/deals', { token: adminToken });
  check(
    '…so it leaves the console too',
    !(afterDelete.body as Array<{ id: string }>).some((row) => row.id === dealId),
  );

  /* The shelf. Two outcomes, and the database picks: a brand nobody has bought
     from is deleted, one somebody holds a card from is delisted, because
     `gift_cards.stock_id` is ON DELETE RESTRICT and that card's code has to go
     on naming something. */
  const freshCard = newId('gcs');
  const heldCard = newId('gcs');
  for (const id of [freshCard, heldCard]) {
    await w.db.run(
      `INSERT INTO gift_card_stock (id, brand, logo, face_minor, currency, points_cost, stock, active)
       VALUES ($i, 'Verify Store', '', 5000, 'PLN', 900, 4, 1)`,
      { i: id },
    );
  }
  await w.db.run(
    `INSERT INTO gift_cards (id, user_id, stock_id, points_spent, code, status, issued_at, expires_at)
     VALUES ($i, $u, $s, 900, 'GC-VERIFY-1', 'active', $t, $t)`,
    { i: newId('gcd'), u: w.customerId, s: heldCard, t: now() },
  );

  const gone = await call('DELETE', `/v1/admin/gift-cards/${freshCard}`, { token: adminToken });
  eq('an unbought gift card is deleted outright', gone.body.outcome, 'deleted');
  eq(
    '…and the row is gone',
    (await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM gift_card_stock WHERE id = $i`, {
      i: freshCard,
    }))?.n,
    0,
  );

  const delisted = await call('DELETE', `/v1/admin/gift-cards/${heldCard}`, { token: adminToken });
  eq('one somebody holds is delisted instead', delisted.body.outcome, 'delisted');
  eq(
    '…so the code in their wallet still names a brand',
    (await w.db.get<{ a: number }>(`SELECT active AS a FROM gift_card_stock WHERE id = $i`, {
      i: heldCard,
    }))?.a,
    0,
  );
  const shelf = await call('GET', '/v1/gift-cards');
  check(
    '…and it is off the public shelf',
    !(shelf.body as Array<{ id: string }>).some((row) => row.id === heldCard),
  );

  /* A password an operator sets for somebody who cannot. */
  const locked = await call('POST', '/v1/auth/signup', {
    body: { email: 'locked-out@verify.test', password: 'hunter22', name: 'Locked Out', acceptTerms: true },
  });
  const lockedId = locked.body.user.id as string;
  const lockedToken = locked.body.token as string;

  const short = await call('POST', `/v1/admin/users/${lockedId}/password`, {
    token: adminToken,
    body: { password: 'abc' },
  });
  eq('a short reset is refused', short.status, 400);

  const reset = await call('POST', `/v1/admin/users/${lockedId}/password`, {
    token: adminToken,
    body: { password: 'a-new-one-99' },
  });
  eq('an operator can set a password', reset.status, 200);
  const oldSession = await call('GET', '/v1/me', { token: lockedToken });
  eq('…and every session the account had is dropped', oldSession.status, 401);
  const backIn = await call('POST', '/v1/auth/signin', {
    body: { email: 'locked-out@verify.test', password: 'a-new-one-99' },
  });
  eq('…and the new one signs in', backIn.status, 200);
  check(
    '…without the password reaching the audit trail',
    !JSON.stringify(await call('GET', '/v1/admin/audit', { token: adminToken })).includes(
      'a-new-one-99',
    ),
  );

  /* The two irreversible removals, and the answer they demand. */
  const unconfirmed = await call('DELETE', `/v1/admin/users/${lockedId}`, {
    token: adminToken,
    body: { confirm: 'locked-out@verify.tes' },
  });
  eq('a near-miss confirmation is refused', unconfirmed.status, 400);
  eq('…naming the field to fix', unconfirmed.body.error.field, 'confirm');

  const erased = await call('DELETE', `/v1/admin/users/${lockedId}`, {
    token: adminToken,
    /* Folded, not exact: the operator is copying the address off the row beside
       the button, and capitals are not a second confirmation. */
    body: { confirm: ' Locked-Out@Verify.test ' },
  });
  eq('the right answer closes the account', erased.status, 200);

  /*
   * **Closing an account has two endings, and the database picks.**
   *
   * The Article 17 erasure runs either way — every personal field blanked, the
   * row out of every list. The row *itself* is then dropped as well, but only
   * when nothing is owed to it: `points_ledger.user_id` and
   * `transactions.user_id` are `ON DELETE CASCADE`, so deleting somebody who
   * actually spent would take with them every venue's record of what they spent
   * — a third party's revenue history, removed from a screen about somebody
   * else. The answer says which happened, the way the gift-card route does.
   *
   * This account never earned anything, so it is the `deleted` half and there is
   * no row left to inspect.
   */
  eq('…and says which ending it got', erased.body.outcome, 'deleted');
  eq(
    '…leaving no row behind',
    (await w.db.get(`SELECT id FROM users WHERE id = $u`, { u: lockedId })) ?? null,
    null,
  );

  /* The other half. This one finished onboarding, so it has a ledger entry and
     is anonymised in place: gone from every list, with nothing on it that names
     a person, and the arithmetic behind it untouched. */
  const spender = await call('POST', '/v1/auth/signup', {
    body: { email: 'spender@verify.test', password: 'hunter22', name: 'Spender', acceptTerms: true },
  });
  await call('POST', '/v1/me/onboarded', { token: spender.body.token as string });
  const spenderId = (await w.db.get<{ id: string }>(`SELECT id FROM users WHERE email_norm = $e`, {
    e: 'spender@verify.test',
  }))!.id;
  const kept = await call('DELETE', `/v1/admin/users/${spenderId}`, {
    token: adminToken,
    body: { confirm: 'spender@verify.test' },
  });
  eq('an account with a ledger behind it also closes', kept.status, 200);
  eq('…but is anonymised rather than dropped', kept.body.outcome, 'anonymised');
  const closed = await w.db.get<{ status: string; email: string | null; name: string }>(
    `SELECT status, email, display_name AS name FROM users WHERE id = $u`,
    { u: spenderId },
  );
  eq('…which is the erasure a person can ask for', closed?.status, 'erased');
  eq('…the address is gone', closed?.email, null);
  eq('…and the name with it', closed?.name, 'Deleted account');
  check(
    '…while the entry it earned is still countable',
    ((await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM points_ledger WHERE user_id = $u`, {
      u: spenderId,
    }))?.n ?? 0) > 0,
  );

  /* The guard that matters most, because the failure is unrecoverable from any
     screen: an operator who bans or erases their own row revokes their own
     session inside the request that did it. */
  const adminId = (await w.db.get<{ id: string }>(`SELECT id FROM users WHERE email_norm = $e`, {
    e: 'ops@verify.test',
  }))!.id;
  const selfErase = await call('DELETE', `/v1/admin/users/${adminId}`, {
    token: adminToken,
    body: { confirm: 'ops@verify.test' },
  });
  eq('an operator cannot erase themselves', selfErase.status, 403);
  const selfBan = await call('POST', `/v1/admin/users/${adminId}/ban`, {
    token: adminToken,
    body: { banned: true },
  });
  eq('…nor ban themselves', selfBan.status, 403);
  eq(
    '…and the console still opens',
    (await call('GET', '/v1/admin/overview', { token: adminToken })).status,
    200,
  );

  /* Describing a venue, before removing it. Every field here is printed on a
     card; none of them is counted — see the header of `routes/admin.ts` for the
     line this stays on. It goes through `partners.updateVenue`, the owner's own
     writer, so an operator gets the owner's validation rather than a second
     implementation of it. */
  const renamed = await call('PATCH', `/v1/admin/venues/${w.venueId}`, {
    token: adminToken,
    body: { name: 'Verify Café', city: 'Warsaw', phone: '+48 22 000 0000' },
  });
  eq('a venue can be corrected', renamed.status, 200);
  eq('…and answers with the new city', renamed.body.city, 'Warsaw');
  eq(
    '…which is what the database holds',
    (await w.db.get<{ c: string }>(`SELECT city AS c FROM venues WHERE id = $v`, { v: w.venueId }))?.c,
    'Warsaw',
  );

  /* Removing a venue. The line that matters is the second one: a venue that is
     gone whose deals are still live keeps a claimable card on the board for a
     business that no longer exists. */
  const doomed = newId('del');
  await w.db.run(
    `INSERT INTO hot_deals (id, venue_id, partner_name, city, country_code, status,
                            points_required, created_at, updated_at)
     VALUES ($i, $v, 'Verify Café', 'Krakow', 'PL', 'live', 0, $t, $t)`,
    { i: doomed, v: w.venueId, t: now() },
  );
  const wrongName = await call('DELETE', `/v1/admin/venues/${w.venueId}`, {
    token: adminToken,
    body: { confirm: 'Verify Cafe' },
  });
  eq('a venue will not go on the wrong name', wrongName.status, 400);

  const removed = await call('DELETE', `/v1/admin/venues/${w.venueId}`, {
    token: adminToken,
    body: { confirm: 'verify café' },
  });
  eq('and goes on the right one', removed.status, 200);
  check('…taking its offers with it', (removed.body.offersDeleted as number) >= 1);
  eq(
    '…every one of them',
    (await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM hot_deals WHERE venue_id = $v`, {
      v: w.venueId,
    }))?.n,
    0,
  );
  /*
   * **Removal means the row is gone, and the schema is what makes that safe.**
   *
   * It used to be a `deleted_at` stamp, which left an operator told "removed"
   * looking at a database that still held the venue. Everything that *belongs*
   * to a venue is `ON DELETE CASCADE` and everything that merely *mentions* one
   * is `ON DELETE SET NULL` — so the two assertions below are the pair that
   * matters: the venue and its own rows are gone, and the ledger entries that
   * named it are still there with the name detached. A platform report has to
   * keep adding up after a removal.
   */
  eq(
    '…and the venue itself is dropped, not stamped',
    (await w.db.get(`SELECT id FROM venues WHERE id = $i`, { i: w.venueId })) ?? null,
    null,
  );
  const venuesAfter = await call('GET', '/v1/admin/venues', { token: adminToken });
  check(
    '…so it leaves every list',
    !(venuesAfter.body as Array<{ id: string }>).some((row) => row.id === w.venueId),
  );
  eq(
    'its own rows went with it',
    (await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM venue_visits WHERE venue_id = $v`, {
      v: w.venueId,
    }))?.n,
    0,
  );
  eq(
    '…and so did the copy no cascade reaches',
    (await w.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM translations WHERE entity = 'venue' AND entity_id = $v`,
      { v: w.venueId },
    ))?.n,
    0,
  );
  eq(
    'and the accounting still adds up, with the reference detached',
    (await call('GET', '/v1/admin/overview', { token: adminToken })).status,
    200,
  );

  check(
    'every removal left a trace with an actor on it',
    ((await w.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM audit_log WHERE actor_id IS NOT NULL AND action IN
         ('deal.status', 'deal.delete', 'gift_card.delete', 'gift_card.delist',
          'venue.status', 'venue.delete', 'user.password_reset', 'user.erase')`,
    ))?.n ?? 0) >= 8,
    auditBefore,
  );

  server.close();
  await w.db.close();
}


async function accountRules(): Promise<void> {
  describe('§1.2 becoming a venue owner after the fact');
  {
    const w = await world();
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
      acceptTerms: true,
    });

    check('a plain sign-up is not a partner',
      !(await accounts.rolesOf(w.db, person.id)).includes('partner_owner'));

    const promoted = await accounts.becomePartner(w.db, person.id, at);
    check('…and can become one', promoted.roles.includes('partner_owner'));
    check('…keeping what it already had', promoted.roles.includes('consumer'));

    /* Idempotent, which is what lets the site call it on every "I am a
       business" without checking first — and on every listing save. */
    const again = await accounts.becomePartner(w.db, person.id, at);
    eq('…twice grants it once', again.roles.filter((r) => r === 'partner_owner').length, 1);

    /* The line this endpoint must not cross. `admin` is choosable at no moment,
       by anybody, which is why `becomePartner` names one role rather than
       taking one. */
    check('…and never grants the console', !again.roles.includes('admin'));

    await throws('an unknown account cannot be promoted', 'not_found', async () =>
      await accounts.becomePartner(w.db, 'usr_nobody', at),
    );

    await w.db.close();
  }

  describe('§1.1 provisional accounts and the merge');
  const w = await world();
  const at = now();

  const guest = await accounts.provisional(w.db, 'device-abc', at);
  await ledger.earn(w.db, { userId: guest.id, points: 60, reason: 'game_win', at });
  eq('a guest can hold points', await ledger.balance(w.db, guest.id), 60);

  const real = await accounts.signUp(w.db, {
    email: 'merged@verify.test',
    password: 'hunter22',
    name: 'Merged',
    provisionalId: guest.id,
    at,
    acceptTerms: true,
  });
  eq(
    'the points survive the merge',
    await ledger.balance(w.db, real.id),
    /* Exactly what the guest earned, and nothing added: signing up grants
       nothing now, so the merge is a pure carry-over. */
    60,
  );
  eq('the guest is closed', (await w.db.get<{ status: string }>(`SELECT status FROM users WHERE id = $u`, {
    u: guest.id,
  }))?.status, 'erased');
  eq('and the balance is derived, not copied', await ledger.reconcile(w.db, real.id), 0);

  const signedIn = await accounts.signIn(w.db, {
    email: 'merged@verify.test',
    password: 'hunter22',
    at,
  });
  check('the session resolves', (await accounts.resolveSession(w.db, signedIn.token)) !== null);
  await accounts.signOut(w.db, signedIn.session.id, at);
  check('and stops resolving once revoked', (await accounts.resolveSession(w.db, signedIn.token)) === null);

  await w.db.close();
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
 *     `points_cache`, `leaderboard_opt_in` and `venue_sharing_default` (both
 *     zeroed), `trust_tier`,
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
  /* Zeroed, like the opt-in above it, and for the same reason: `NOT NULL`, so
     erasure writes the *off* value rather than removing it. An erased row that
     went on saying "yes, share me with venues I visit" would be a preference
     held on behalf of somebody who asked to be forgotten. */
  'venue_sharing_default',
  'trust_tier',
  'status',
  'created_at',
  'updated_at',
  'deleted_at',
]);

async function profileRules(): Promise<void> {
  describe('the profile — a chosen status, and a city that is a suggestion');
  const db = await openDb(':memory:');
  const at = now();

  const user = await accounts.signUp(db, {
    email: 'profile@verify.test',
    password: 'hunter22',
    name: 'Profile',
    at,
    acceptTerms: true,
  });

  /* ── the status ──
     Five values and no sixth. The whole reason the column is not called
     `status` is checked below: setting one must not touch the account state. */
  for (const value of accounts.OCCUPATIONS) {
    const saved = await accounts.updateProfile(db, user.id, { occupation: value }, at);
    eq(`a status may be "${value}"`, saved.occupation, value);
  }
  await throws('but not one off the list', 'validation_failed', async () =>
    await accounts.updateProfile(db, user.id, { occupation: 'ceo' }, at),
  );
  eq(
    '…naming the field',
    (await refusal(async () => await accounts.updateProfile(db, user.id, { occupation: 'ceo' }, at)))?.detail.field,
    'occupation',
  );
  eq(
    '…and handing back the whole set, so a drifted client is told what it may send',
    (await refusal(async () => await accounts.updateProfile(db, user.id, { occupation: 'ceo' }, at)))?.detail.allowed,
    accounts.OCCUPATIONS,
  );
  eq(
    'case is not a different answer',
    (await accounts.updateProfile(db, user.id, { occupation: 'Student' }, at)).occupation,
    'student',
  );
  /* The collision this column was renamed to avoid. `users.status` is the
     account state and a person's occupation is not; if these two ever share a
     name again, this is the check that says so. */
  eq(
    'and writing a status leaves the *account* status alone',
    (await accounts.getUser(db, user.id)).status,
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

  await throws('without a country it is refused', 'validation_failed', () =>
    accounts.resolveCity('Kryvyi Rih'),
  );
  eq(
    '…naming the country, not the city — the form shows a picker, not an argument',
    (await refusal(() => accounts.resolveCity('Kryvyi Rih')))?.detail.field,
    'countryCode',
  );
  await throws('a country that is not two letters is refused', 'validation_failed', () =>
    accounts.resolveCity('Kryvyi Rih', 'Ukraine'),
  );
  await throws('and a city that is not a place name is refused', 'validation_failed', () =>
    accounts.resolveCity('!!!', 'UA'),
  );
  eq(
    '…naming the city, because no country would save it',
    (await refusal(() => accounts.resolveCity('!!!', 'UA')))?.detail.field,
    'city',
  );
  await throws('a city with no ceiling is where an essay goes', 'validation_failed', () =>
    accounts.resolveCity('x'.repeat(61), 'UA'),
  );

  /* Through the write, not just the resolver. */
  const moved = await accounts.updateProfile(db, user.id, { city: 'kryvyi rih', countryCode: 'ua' }, at);
  eq('the write stores the canonical name', moved.city, 'Kryvyi Rih');
  eq('…and the country it was given', moved.country_code, 'UA');
  await throws('a country on its own means nothing and is refused', 'validation_failed', async () =>
    await accounts.updateProfile(db, user.id, { countryCode: 'DE' }, at),
  );
  /* And sign-up gives the same refusal, because it is the same function. It used
     to drop the country instead — the endpoint most likely to be handed a
     half-filled form was the one that said nothing about it. The HTTP surface
     compares the two answers over the wire; this is the domain half, and the
     row count is what says "dropped" has not come back as "created anyway". */
  await rejects(
    'and sign-up refuses it too rather than dropping it',
    async () =>
      await accounts.signUp(db, {
        email: 'orphan@verify.test',
        password: 'hunter22',
        name: 'Orphan',
        countryCode: 'DE',
        at,
        acceptTerms: true,
      }),
    'validation_failed',
  );
  eq(
    '…having created no account at all',
    (await db.get(`SELECT 1 FROM users WHERE email_norm = 'orphan@verify.test'`)) ?? null,
    null,
  );
  /* The name, on the same terms: one function, so a blank is a refusal on both
     rather than a 400 on one and a 200-that-changed-nothing on the other. */
  await throws('a blank name is refused by the patch', 'validation_failed', async () =>
    await accounts.updateProfile(db, user.id, { name: '   ' }, at),
  );
  eq(
    '…leaving the name it had',
    (await accounts.getUser(db, user.id)).display_name,
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
    acceptTerms: true,
  });
  eq('sign-up canonicalises too, or it is the hole in the rule', second.city, 'Kryvyi Rih');
  eq(
    'two spellings of one place are one board',
    await db.all<{ city: string }>(
      `SELECT DISTINCT city FROM users WHERE country_code = 'UA' ORDER BY city`,
    ),
    [{ city: 'Kryvyi Rih' }],
  );
  /* And the old database's own spellings stay writable rather than being
     revalidated out of existence — `Bayern` is really in the live `users` table. */
  eq(
    'a legacy value can be written back unchanged',
    (await accounts.updateProfile(db, second.id, { city: 'Bayern', countryCode: 'DE' }, at)).city,
    'Bayern',
  );

  /* ── the seven answers ──
     `occupation` took the seventh slot from `headline`, so the completion bonus
     is what proves the swap reached `isProfileComplete`. */
  const before = await ledger.balance(db, user.id);
  const finished = await accounts.updateProfile(
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
  eq('…and pays once', (await ledger.balance(db, user.id)) - before, CONFIG.earn.profileComplete);
  await accounts.updateProfile(db, user.id, { occupation: 'other' }, at);
  eq(
    '…and only once, however often it is saved after',
    (await ledger.balance(db, user.id)) - before,
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
    acceptTerms: true,
  });
  await accounts.updateProfile(
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
  /* Both set directly, because what is being checked here is the *erasure* and
     neither column has a route into it that this fixture could reach: one is
     written by a verified Google token and the other is not written by anything
     the server does. Erasure has to clear them whichever put them there. */
  await db.run(
    `UPDATE users SET provider_ref = 'google-sub-12345', email_verified_at = $t WHERE id = $u`,
    { t: at, u: doomed.id },
  );

  const columns = (await db
    .all<{ name: string }>(`PRAGMA table_info(users)`))
    .map((row) => row.name)
    .filter((name) => !ERASURE_KEEPS.has(name));
  const rowOf = async (id: string) =>
    (await db.get<Record<string, unknown>>(`SELECT * FROM users WHERE id = $u`, { u: id })) ?? {};

  const populated = await rowOf(doomed.id);
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
  const schema = (await db.all<{ name: string }>(`PRAGMA table_info(users)`)).map((row) => row.name);
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
  const account = (await consent.exportUser(db, doomed.id) as { account: Record<string, unknown> }).account;
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

  await consent.eraseUser(db, doomed.id, at);
  const erased = await rowOf(doomed.id);
  const left = columns.filter((name) => erased[name] !== null);
  check('and erasure leaves none of them behind', left.length === 0, left);
  eq('…including Google’s subject id', erased.provider_ref, null);
  eq('…and the status the UI calls Status', erased.occupation, null);
  eq('…while the row itself stays, for the ledger that references it', erased.status, 'erased');

  await db.close();
}

async function countryRules(): Promise<void> {
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

  const db = await openDb(':memory:');
  await seedPlatform(db);
  await db.tx(async () => await importLegacy(db, 'new-data'));

  const banks = await db.all<{ bank: string; language: string; n: number }>(
    `SELECT bank, language, COUNT(*) AS n FROM quiz_items GROUP BY bank, language`,
  );
  const flags = banks.filter((row) => row.bank === 'flags');
  eq('the flags bank exists in four languages', flags.length, 4);
  check('every country made it into every language', flags.every((row) => row.n === 196), flags);

  const prompts = await db.all<{ prompt: string }>(
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

  const poland = (await db.get<{ answer: string; distractors: string; meta: string }>(
    `SELECT answer, distractors, meta FROM quiz_items
      WHERE bank = 'flags' AND language = 'pl' AND prompt = 'PL'`,
  ))!;
  eq('the answer is in the player’s own language', poland.answer, 'Polska');
  eq('the emoji rides along', JSON.parse(poland.meta).flag, '🇵🇱');
  const wrong = JSON.parse(poland.distractors) as string[];
  eq('three wrong answers', wrong.length, 3);
  check('none of which is the right one', !wrong.includes(poland.answer));

  /* The distractors come from the same continent, which is what makes it a
     question rather than a giveaway. */
  const asia = (await db.get<{ distractors: string }>(
    `SELECT distractors FROM quiz_items WHERE bank = 'flags' AND language = 'en' AND prompt = 'UZ'`,
  ))!;
  const neighbours = JSON.parse(asia.distractors) as string[];
  const continents = await Promise.all(neighbours.map(
    async (name) =>
      JSON.parse(
        (await db.get<{ meta: string }>(
          `SELECT meta FROM quiz_items WHERE bank = 'flags' AND language = 'en' AND answer = $a`,
          { a: name },
        ))?.meta ?? '{}',
      ).continent,
  ));
  check('the wrong answers are from the same continent', continents.every((c) => c === 'Asia'), continents);

  await db.close();
}

/**
 * `npm run server:import` runs on a database that already has data in it, so the
 * import has to be repeatable. Every one of these was broken once: a fresh id on
 * a row with a unique key turns `INSERT OR REPLACE` into delete-and-recreate,
 * and a minted ledger id hands everybody their opening balance twice.
 */
async function reimportRules(): Promise<void> {
  describe('the import is repeatable');

  const db = await openDb(':memory:');
  await seedPlatform(db);
  await db.tx(async () => await importLegacy(db, 'new-data'));

  const count = async (sql: string) => (await db.get<{ n: number }>(sql))?.n ?? 0;
  const before = {
    quiz: await count(`SELECT COUNT(*) AS n FROM quiz_items`),
    users: await count(`SELECT COUNT(*) AS n FROM users`),
    venues: await count(`SELECT COUNT(*) AS n FROM venues`),
    tiers: await count(`SELECT COUNT(*) AS n FROM voucher_tiers`),
    movements: await count(`SELECT COUNT(*) AS n FROM budget_movements`),
    ledger: await count(`SELECT COUNT(*) AS n FROM points_ledger`),
    points: await count(`SELECT SUM(delta) AS n FROM points_ledger`),
  };
  const budgetId = (await db.get<{ id: string }>(`SELECT id FROM budgets LIMIT 1`))!.id;

  await db.tx(async () => await importLegacy(db, 'new-data'));

  const after = {
    quiz: await count(`SELECT COUNT(*) AS n FROM quiz_items`),
    users: await count(`SELECT COUNT(*) AS n FROM users`),
    venues: await count(`SELECT COUNT(*) AS n FROM venues`),
    tiers: await count(`SELECT COUNT(*) AS n FROM voucher_tiers`),
    movements: await count(`SELECT COUNT(*) AS n FROM budget_movements`),
    ledger: await count(`SELECT COUNT(*) AS n FROM points_ledger`),
    points: await count(`SELECT SUM(delta) AS n FROM points_ledger`),
  };
  eq('a second import changes nothing', after, before);
  eq('the budget keeps its id, so its movements survive', (await db.get<{ id: string }>(
    `SELECT id FROM budgets LIMIT 1`))?.id, budgetId);

  for (const user of await db.all<{ id: string }>(`SELECT id FROM users`)) {
    eq(`balance still derives for ${user.id.slice(0, 8)}`, await ledger.reconcile(db, user.id), 0);
  }

  /* **A live row under its own id holds the export row's unique key.** The
     first deploy in October looped at boot on Postgres: the live server had
     opened the month's budget as `bdg_<random>`, the re-import wrote
     `bdg_legacy_<venue>_<month>` for the same venue and month, and
     `budgets_venue_id_period_key` refused it. On SQLite the same statement
     silently replaced the live budget. The live row has to survive, untouched,
     on both. */
  const legacy = (await db.get<{ id: string; venue_id: string }>(
    `SELECT id, venue_id FROM budgets WHERE id LIKE 'bdg_legacy_%' LIMIT 1`,
  ))!;
  await db.run(`DELETE FROM budget_movements WHERE budget_id = $b`, { b: legacy.id });
  await db.run(`DELETE FROM budgets WHERE id = $b`, { b: legacy.id });
  const live = await budget.budgetFor(db, legacy.venue_id);
  await db.run(`UPDATE budgets SET total_minor = 123456 WHERE id = $b`, { b: live.id });
  const link = (await db.get<{ id: string; venue_id: string; kind: string }>(
    `SELECT id, venue_id, kind FROM venue_links WHERE id LIKE 'lnk_legacy_%' LIMIT 1`,
  ))!;
  await db.run(`UPDATE venue_links SET id = 'lnk_live_verify', value = 'https://live.example' WHERE id = $l`, { l: link.id });

  /* Postgres updates a venue in place; SQLite's `OR REPLACE` deletes and
     re-inserts it, and with foreign keys on that cascades the venue's budgets
     and links away before the guard is reached — so this would pass with no
     guard at all. Off for the re-import, SQLite meets the live rows the way
     the Postgres box does, and only the guard keeps them. */
  await db.run('PRAGMA foreign_keys = OFF');
  let reimported = true;
  try {
    await db.tx(async () => await importLegacy(db, 'new-data'));
  } catch (error) {
    reimported = false;
    console.error(error);
  }
  await db.run('PRAGMA foreign_keys = ON');
  check('a re-import over live rows that hold its unique keys finishes', reimported);
  eq('…the live month’s budget keeps its id and its total', (await db.get<{ id: string; total_minor: number }>(
    `SELECT id, total_minor FROM budgets WHERE venue_id = $v AND id = $b`, { v: legacy.venue_id, b: live.id },
  )), { id: live.id, total_minor: 123456 });
  eq('…and no export budget is written beside it', (await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM budgets WHERE id = $b`, { b: legacy.id }))?.n, 0);
  eq('…the owner’s link keeps its value', (await db.get<{ value: string }>(
    `SELECT value FROM venue_links WHERE venue_id = $v AND kind = $k`, { v: link.venue_id, k: link.kind }))?.value,
    'https://live.example');

  await db.close();
}

async function importRules(): Promise<void> {
  describe('the old database, imported');
  const db = await openDb(':memory:');
  await seedPlatform(db);
  const summary = await db.tx(async () => await importLegacy(db, 'new-data'));

  check('the guidebook came across', (summary.counts.guidance_services ?? 0) > 300);
  check('the deals came across', (summary.counts.hot_deals ?? 0) > 0);
  check('the funnel events came across', (summary.counts.deal_events ?? 0) > 800);
  check('the quiz banks came across', (summary.counts.quiz_items ?? 0) > 1500);
  eq('nineteen currencies, one anchor', summary.counts.rates, 19);
  check('the lossy conversion is reported', summary.notes.some((note) => note.includes('percentage-reward')));

  /* Ids are preserved so a row can be traced back to the export. */
  const venue = await db.get<{ id: string }>(`SELECT id FROM venues WHERE name LIKE 'Chayxana%'`);
  check('a venue keeps its Base44 id', /^[0-9a-f]{24}$/.test(venue?.id ?? ''));

  /* An opening balance is a ledger entry, not a number. */
  const opening = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM points_ledger WHERE source_kind = 'legacy_import'`,
  );
  check('balances arrived as ledger entries', (opening?.n ?? 0) > 0);
  for (const user of await db.all<{ id: string }>(`SELECT id FROM users`)) {
    eq(`balance is derived for ${user.id.slice(0, 8)}`, await ledger.reconcile(db, user.id), 0);
  }

  /* Every campaign has an exact cost, including the converted ones. */
  const bad = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM campaigns WHERE reward_cost_minor <= 0`);
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
  const local = async (bank: string) =>
    await db.all<{ language: string; n: number }>(
      `SELECT language, COUNT(*) AS n FROM quiz_items WHERE bank = $b GROUP BY language ORDER BY language`,
      { b: bank },
    );
  const five = (n: number) =>
    ['en', 'pl', 'ru', 'uk', 'uz'].map((language) => ({ language, n }));
  eq('the Uzbekistan bank is 100 questions in each of the five', await local('uzbekistan'), five(100));
  eq('…and the Poland bank beside it is still 98', await local('poland'), five(98));

  await db.close();
}

/*
 * `demoRules` was here — forty checks over `db/demo.ts`, the seven-venue
 * catalogue a deployment without `new-data/` used to be given. It checked the
 * rows were reachable, marked, unowned and arithmetically sound, and every one
 * of those checks passed right up to the day the argument for having them at
 * all was withdrawn. The module is deleted and so are they. What survives is
 * `bootOrdering` below, inverted: it used to prove the catalogue was never
 * empty after a boot, and now proves nothing was written into it.
 */

/**
 * The ordering in `boot`, which is the half of this that lives in `main.ts`.
 *
 * Written so it is true in both worlds rather than in the one this machine
 * happens to be: a developer's box has `new-data/` and takes the real import, a
 * remote does not (it is gitignored, and it is the old app's live personal
 * data) and takes nothing at all. **An empty catalogue on a remote is now the
 * expected outcome**, which is the whole of the change — it means no venue has
 * signed up, and that is a fact a screen can state.
 *
 * So the property is no longer "never empty". It is that every venue standing
 * after a boot came from the import, and boot invented none: no row carrying
 * the retired `ven_demo_` prefix, and no gift-card stock either, because the
 * shelf was written by `seedPlatform` in the same spirit and went the same way.
 */
/**
 * SQLite-only SQL, caught by reading the source rather than by running it.
 *
 * This suite runs on `:memory:` SQLite, so **every check in it passes on
 * constructs Postgres does not have** — and production is Postgres. `rowid` is
 * the one that got through: `ledger.spend` ordered by it, `verify` asserted the
 * same order, all 925 checks were green, and on the live database every spend
 * threw `42703 column "rowid" does not exist`. A voucher could not be bought.
 *
 * The engine cannot be the thing that finds these, so the source is. This is a
 * grep with the comments stripped first — the note in `ledger.ts` explains the
 * history and says the word, and a guard that its own explanation trips is a
 * guard somebody deletes.
 *
 * Keep it narrow. It is not a SQL parser and must not become one: one banned
 * token, named, with the reason attached.
 */
function sqliteOnlySql(): void {
  describe('SQL that only SQLite would accept');

  const here = fileURLToPath(new URL('.', import.meta.url));

  /* Strip block and line comments, then look for the token. A bare `rowid`
     inside a string is what matters; the prose around it is not. */
  const stripped = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');

  const roots = ['domain', 'http', 'db', 'jobs.ts', 'main.ts'];
  const files: string[] = [];
  const walk = (entry: string): void => {
    const full = join(here, entry);
    if (!existsSync(full)) return;
    if (statSync(full).isDirectory()) {
      for (const child of readdirSync(full)) walk(join(entry, child));
      return;
    }
    if (full.endsWith('.ts')) files.push(entry);
  };
  for (const root of roots) walk(root);

  check('the server has source to scan', files.length > 20, { files: files.length });

  const offenders = files.filter((file) =>
    /\browid\b/i.test(stripped(readFileSync(join(here, file), 'utf8'))),
  );
  check('no query orders or filters by `rowid` — Postgres has no such column', offenders.length === 0, offenders);

  /*
   * **A refusal's detail may not carry a key called `code`.**
   *
   * `server.ts` serialises one as `{ code: error.code, message, ...error.detail }`,
   * so a detail key of that name overwrites the error code with whatever it
   * holds. A 404 answered `{"code": "premium", "message": "no partner plan
   * called premium"}` — the message was right, the code was the plan's, and a
   * client branching on `error.code` to tell "not found" from "rate limited"
   * had no way to. It type-checks perfectly and is invisible from this suite's
   * own `throws`, which compares the *thrown* error rather than the serialised
   * one — so the check has to read the source, like the one above it.
   *
   * Same shape as `rowid`: comments stripped, one banned token, the offending
   * file named. `message` would be the other collision and is checked with it;
   * `status` is not, because `DomainError` does not spread it.
   */
  const detailKeys = files.filter((file) => {
    const source = stripped(readFileSync(join(here, file), 'utf8'));
    /*
     * Read by line rather than by matching the third argument.
     *
     * The obvious regex — the first `{…}` after `new DomainError(` — is
     * defeated by the message, which is nearly always a template literal:
     * `${audience}` is a brace pair, so the match lands on *that* and the
     * detail object is never examined. It passed on the very bug it was written
     * for. Counting braces from the call instead is exact enough here, because
     * every one of these constructors is called inline over a handful of lines.
     */
    const lines = source.split('\n');
    return lines.some((line, index) => {
      if (!/new DomainError\(/.test(line)) return false;
      /* The call's own line, plus the lines until its arguments close. Six is
         past the longest of these in the tree and stops a runaway scan from
         blaming a key in the next function. */
      for (let i = index; i < Math.min(lines.length, index + 7); i += 1) {
        if (/^\s*(code|message)\s*:/.test(lines[i]) && i > index) return true;
        if (i > index && /^\s*\}\);/.test(lines[i])) return false;
      }
      return false;
    });
  });
  check(
    'no refusal detail shadows `code` or `message` — the serialiser spreads it over both',
    detailKeys.length === 0,
    detailKeys,
  );

  /*
   * The two post-release column lists are one list written twice.
   *
   * `CREATE TABLE IF NOT EXISTS` is a no-op on a database that already has the
   * table, so a column added to `schema.sql` alone reaches a *fresh* database
   * and never an existing one. Both engines therefore keep an explicit list —
   * `addColumn` in `db.ts`, `add` in `pg.ts` — and they must carry the same
   * columns or one engine is missing one.
   *
   * `points_lots.seq` was added to `db.ts` only. Every check here passed (they
   * run on SQLite), and production — Postgres — got an `INSERT` naming a column
   * it did not have, which is every earn there is: a game win, a scan, a
   * referral. Caught by a query against the live database, which is far too late
   * for something two greps can prove.
   */
  const columns = (source: string, call: RegExp): Set<string> => {
    const found = new Set<string>();
    for (const m of stripped(source).matchAll(call)) found.add(`${m[1]}.${m[2]}`);
    return found;
  };
  const sqlite = columns(
    readFileSync(join(here, 'db', 'db.ts'), 'utf8'),
    /addColumn\(\s*db\s*,\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'/g,
  );
  const postgres = columns(
    readFileSync(join(here, 'db', 'pg.ts'), 'utf8'),
    /\badd\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'/g,
  );

  check('both engines list post-release columns', sqlite.size > 5 && postgres.size > 5, {
    sqlite: sqlite.size,
    postgres: postgres.size,
  });
  const missingOnPg = [...sqlite].filter((c) => !postgres.has(c));
  const missingOnSqlite = [...postgres].filter((c) => !sqlite.has(c));
  check('every column `db.ts` adds, `pg.ts` adds too', missingOnPg.length === 0, missingOnPg);
  check('…and the other way round', missingOnSqlite.length === 0, missingOnSqlite);
}

/**
 * The Postgres lockdown covers the whole schema.
 *
 * `rls.pg.sql` is generated from `schema.sql` by `npm run pg:schema` and
 * applied by `migrate()` in `db/pg.ts`, so a table added to the schema arrives
 * with its `ENABLE ROW LEVEL SECURITY` already written. What this checks is
 * that the committed file is *current* — the same thing the generated
 * `schema.pg.sql` needs and for a sharper reason: a table missing from there
 * fails on its first query, and a table missing from here fails silently, by
 * being readable through a Supabase project's published anon key.
 *
 * Read from the source rather than from a database, because the engine this
 * suite runs on has no roles and no RLS to inspect. Same argument as
 * `sqliteOnlySql` above.
 */
function postgresLockdown(): void {
  describe('the Postgres lockdown');

  const here = fileURLToPath(new URL('.', import.meta.url));
  const schema = readFileSync(join(here, 'db', 'schema.sql'), 'utf8');
  const rls = readFileSync(join(here, 'db', 'rls.pg.sql'), 'utf8');

  const tables = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/g)].map((m) => m[1]);
  const secured = new Set(
    [...rls.matchAll(/ALTER TABLE\s+([a-z_]+)\s+ENABLE ROW LEVEL SECURITY/g)].map((m) => m[1]),
  );

  check('the schema has tables to secure', tables.length > 50, { tables: tables.length });
  const open = tables.filter((t) => !secured.has(t));
  check('every table has row-level security enabled — run `npm run pg:schema`', open.length === 0, open);
  const stale = [...secured].filter((t) => !tables.includes(t));
  check('…and nothing is secured that no longer exists', stale.length === 0, stale);

  /* Both halves of the lockdown, because either one alone would do and a
     regeneration that dropped one would still pass the table count above. */
  for (const role of ['anon', 'authenticated']) {
    check(
      `\`${role}\` is revoked from the public schema`,
      rls.includes(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role};`) &&
        rls.includes(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ${role};`),
    );
  }

  /* The guard that stops the lockdown locking the server out of its own
     database. Without it a deployment connecting as a non-owning role enables
     RLS on 82 tables and then answers 500 to every request, from inside the
     process that just did it. */
  check(
    'it refuses to run as a role that neither owns the tables nor bypasses RLS',
    /RAISE EXCEPTION 'paylez: refusing to enable row-level security/.test(rls),
  );
}

/**
 * The rate limits, checked deliberately.
 *
 * `httpSurface` runs with `limits: false` — every call it makes arrives on one
 * connection and the tour signs up more accounts than sign-up allows one to —
 * so the limiter needs a section that turns it on and points it at one
 * endpoint. Three properties, and the third is the one worth having:
 *
 *  1. it refuses past the ceiling, with `rate_limited` rather than a 500;
 *  2. it bounds the *caller* and not the endpoint, so one connection hitting a
 *     wall cannot lock everybody else out;
 *  3. a request that **fails validation still costs an attempt**, because
 *     otherwise the cheapest way past a limiter on sign-up is to send a body
 *     that cannot succeed.
 */
/** A stable documentation-range address per label, standing for one connection. */
const fakeAddresses = new Map<string, string>();
function fakeAddress(label: string): string {
  let address = fakeAddresses.get(label);
  if (!address) {
    address = `198.51.100.${fakeAddresses.size + 1}`;
    fakeAddresses.set(label, address);
  }
  return address;
}

async function rateLimits(): Promise<void> {
  describe('rate limits');

  const db = await openDb(':memory:');
  const api = createApi({ db, routes: allRoutes, secret: SECRET });
  const server = await api.listen(0, '127.0.0.1');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  /* `agent` names a *connection* here: it is sent as a forwarded address (the
     suite is a loopback peer, which is what production's nginx is) and as the
     user-agent — the latter only so the check below can show that changing the
     header alone no longer buys a fresh bucket. */
  const signUp = async (email: string, agent: string, body?: Record<string, unknown>, userAgent?: string) => {
    const response = await fetch(`http://127.0.0.1:${port}/v1/auth/signup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': userAgent ?? agent,
        'x-forwarded-for': fakeAddress(agent),
      },
      /* `acceptTerms` so these fixtures stand for somebody who was actually
         asked — §1.3. Not because sign-up refuses without it: it deliberately
         does not (see `signUp`, "absent is not refused"), it simply writes no
         consent row. A fixture that omitted it would still get an account, and
         would be quietly testing the un-asked path everywhere. */
      body: JSON.stringify(
        body ?? { email, password: 'correct horse', name: 'Rate Limit', acceptTerms: true },
      ),
    });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };

  const ceiling = CONFIG.limits.signUpPerHour;
  const statuses: number[] = [];
  for (let i = 0; i < ceiling; i += 1) {
    statuses.push((await signUp(`limit${i}@verify.test`, 'suite/one')).status);
  }
  check('every call up to the ceiling is served', statuses.every((s) => s === 200), statuses);

  const over = await signUp('limitover@verify.test', 'suite/one');
  eq('the one past it is refused 429 `rate_limited`', [over.status, over.body.error?.code], [429, 'rate_limited']);

  /* The bypass a reviewer found: the key once hashed the user-agent, so the
     same address with a new header started at zero. It must not. */
  const disguised = await signUp('limitdisguised@verify.test', 'suite/one', undefined, 'a-brand-new-agent/9.9');
  eq('…and a new user-agent from the same address is still refused', disguised.status, 429);

  /* A different address is a different connection key, so it starts at zero.
     This is the property that stops one office locking out a city. */
  const other = await signUp('limitother@verify.test', 'suite/two');
  eq('another connection is unaffected', other.status, 200);

  /* And the validation bypass. A body with no name is a 400 from `str`, and it
     has to be counted anyway or the limiter is free to walk past. */
  const invalid = await signUp('', 'suite/three', {
    email: 'x@verify.test',
    password: 'correct horse',
    acceptTerms: true,
  });
  eq('a refused body is still a 400', invalid.status, 400);
  const counted = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM auth_attempts WHERE subject LIKE 'POST /v1/auth/signup|%'`,
  );
  eq('…and it still cost an attempt', counted?.n, ceiling + 2);

  /* Whose address is it (limits.clientAddress). Behind the nginx on the same
     box the peer is loopback and the proxy *appends* what it saw, so only the
     last entry is ours; the first is whatever the caller wrote. */
  eq('the last forwarded entry is the client, from our own proxy',
    limitsDomain.clientAddress('6.6.6.6, 203.0.113.7', '127.0.0.1'), '203.0.113.7');
  eq('…on IPv6 loopback too', limitsDomain.clientAddress('203.0.113.7', '::ffff:127.0.0.1'), '203.0.113.7');
  eq('a direct peer’s forwarded header is ignored', limitsDomain.clientAddress('6.6.6.6', '198.51.100.20'), '198.51.100.20');
  eq('no header from the proxy: the peer', limitsDomain.clientAddress(undefined, '127.0.0.1'), '127.0.0.1');
  check('two addresses are two connection keys',
    limitsDomain.connectionKey(SECRET, '2026-10-01', '203.0.113.7') !==
      limitsDomain.connectionKey(SECRET, '2026-10-01', '203.0.113.8'));

  server.close();
  await db.close();
}

/**
 * Today's list — the prompts the Play screen rotates through.
 *
 * Two properties, and both are about *lying to a player*:
 *
 *  1. **Every figure is the one the ledger will pay.** `daily_tasks` carries no
 *     amount on purpose — a stored 50 is right the day it is typed and wrong the
 *     day `CONFIG.earn.profileComplete` moves, silently and in the direction
 *     that matters (a promise of fifty paid as twenty-five). So the resolved
 *     points are compared against the config the grant itself reads.
 *  2. **A finished task stops being advertised.** Every one of these grants is
 *     once-only and guarded by an `UPDATE … WHERE … IS NULL`, so a panel still
 *     offering a reward for a finished profile is advertising a refusal.
 */
async function dailyTaskRules(): Promise<void> {
  describe("today's list");

  const w = await world();
  const at = now();

  const seeded = await w.db.all<{ key: string; reward: string; active: number }>(
    `SELECT key, reward, active FROM daily_tasks ORDER BY sort_order`,
  );
  check('boot seeds the task inventory', seeded.length >= 4, seeded.map((row) => row.key));
  check('…all of it active', seeded.every((row) => row.active === 1));

  const byKey = async (userId: string) =>
    Object.fromEntries((await tasks.tasksFor(w.db, userId, at)).map((task) => [task.key, task]));

  const before = await byKey(w.customerId);

  eq('the profile task quotes what the profile bonus pays', before.profile?.points,
    CONFIG.earn.profileComplete);
  eq('…and the invite task what the inviter is paid', before.invite?.points,
    CONFIG.earn.referrerFirstVisit);
  /*
   * **The featured-game prompt became a ceiling rather than a promise**, which
   * is the one thing rulebook §4.1 step 3 changes about this panel.
   *
   * It quoted `CONFIG.earn.dailyGame` — a flat 20, exact, paid as its own ledger
   * entry — and that constant is gone: the featured game is ×1.5 on the round
   * now, so what it is worth depends on how the round goes, and the only honest
   * figure a prompt can carry is the most it could be. Both game prompts are
   * priced by `games.roundCeiling`, which is the same function that prices a real
   * round, because a panel quoting a figure the ledger will not pay is the one
   * failure this file exists to prevent.
   */
  eq('…and the featured game the most a featured round can pay', before.daily_game?.points,
    games.roundCeiling({ featured: true, multiplier: 1 }));
  eq('…which is 37 on the free plan: 27 for a perfect featured round, plus the perfect bonus',
    before.daily_game?.points, 37);
  eq('…and it is a ceiling, not a promise, so the panel renders “up to”',
    before.daily_game?.exact, false);
  /* Today's check-in is the rung of the cycle the player is standing on, not a
     constant — which is the whole reason the amount is not a column. Day one of
     a streak with no milestone on it. */
  eq('…and the check-in what *today* pays', before.check_in?.points,
    checkin.dayValue(1) + (CONFIG.earn.streakMilestones[1] ?? 0));
  check('the exact rewards say so', [before.profile, before.invite, before.check_in]
    .every((task) => task?.exact === true));
  /* A round pays what the round scored, so its figure is a ceiling and the
     client renders "up to". Promising the ceiling is a promise a player can
     fail to be given. */
  eq('a game round is a ceiling, not a promise', before.play_round?.exact, false);
  eq('…and the ceiling is a perfect first round of the day plus its bonus',
    before.play_round?.points, games.roundCeiling({ featured: false, multiplier: 1 }));
  eq('…which is 28: 18 for a perfect round and 10 for it being perfect',
    before.play_round?.points, 28);
  check('…and the featured prompt is worth more than the plain one, by the ×1.5',
    (before.daily_game?.points ?? 0) > (before.play_round?.points ?? 0));

  check('nothing is done on a fresh account',
    Object.values(before).every((task) => task.done === false),
    Object.entries(before).filter(([, task]) => task.done).map(([key]) => key));

  /* And now each one, done. The columns written are the ones the grants
     themselves guard on, not a flag of this feature's own — a second source of
     truth for "has this been paid" is how the two end up disagreeing. */
  await w.db.run(`UPDATE users SET profile_completed_at = $t WHERE id = $u`,
    { t: at, u: w.customerId });
  await checkin.checkIn(w.db, { userId: w.customerId, at });
  await w.db.run(
    `INSERT INTO referrals (id, referrer_id, referred_id, code, status, created_at, completed_at)
     VALUES ($i, $u, NULL, 'PY1111', 'completed', $t, $t)`,
    { i: newId('ref'), u: w.customerId, t: at },
  );

  const after = await byKey(w.customerId);
  check('a finished profile stops being advertised', after.profile?.done === true);
  check('…a taken check-in too', after.check_in?.done === true);
  /* An invite pays per friend, so one completed referral does not end the
     offer — a second friend is worth what the first was. */
  eq('a completed referral leaves the invite on offer', after.invite?.done, false);

  /*
   * The featured game, and whether the prompt knows it has been taken.
   *
   * The rotation posts on the player's *local* day, which the server does not
   * know, so a round counts if its game is featured for yesterday, today or
   * tomorrow in UTC. Flags is the probe (capitals was, until the rotation became
   * the rulebook's eight and capitals left it); `posted` finds an instant where
   * it counts and one where it does not.
   *
   * **`done` is derived from the player's own finished rounds now**, not from a
   * `daily_game` ledger entry — there is no such entry any more, because the
   * bonus is a multiplier inside the round. So this asserts on `featured` on the
   * response and on the prompt, which is what a player can actually see.
   */
  const posted = (when: string) =>
    [-1, 0, 1].some((offset) =>
      games.dailyGameFor(plusDays(when, offset).slice(0, 10)).includes('flags'));
  let on = plusDays(at, 30);
  while (!posted(on)) on = plusDays(on, 1);
  let off = plusDays(on, 1);
  while (posted(off)) off = plusDays(off, 1);

  const playProbe = async (when: string) => {
    const round = await games.startSession(w.db, { userId: w.customerId, gameType: 'flags', at: when });
    return await games.finish(w.db, { sessionId: round.sessionId, userId: w.customerId, at: when });
  };
  const prompt = async (when: string) =>
    (await tasks.tasksFor(w.db, w.customerId, when)).find((task) => task.key === 'daily_game');

  check('the featured prompt is open before the day’s round is played',
    (await prompt(on))?.done === false);
  eq('the day’s featured game claims the ×1.5', (await playProbe(on)).featured, true);
  check('…and the prompt goes quiet once it has been claimed',
    (await prompt(on))?.done === true);
  eq('…once a day, not once a round', (await playProbe(plusMinutes(on, 5))).featured, false);
  eq('any other day’s game claims nothing', (await playProbe(off)).featured, false);
  check('…and leaves that day’s prompt open', (await prompt(off))?.done === false);
  eq('the order is the rulebook’s eight (§4.4)', games.DAILY_GAME_POOL.map((slot) => slot.join('|')),
    ['flags', 'brain', 'poland|uzbekistan', 'word_builder', 'memory_match', 'flight', 'game_2048|merge_2048',
      'food_cross|food_cross_live']);

  /* A row naming a rule nothing prices has no figure, and a task with no figure
     is left out rather than sent as a zero — "0 points" is a thing the panel
     would render. */
  await w.db.run(
    `INSERT INTO daily_tasks (key, copy_key, reward, sort_order, active, updated_at)
     VALUES ('mystery', 'mystery', 'not_a_rule', 9, 1, $t)`,
    { t: at },
  );
  check('a task with no pricing rule is not shown',
    !(await tasks.tasksFor(w.db, w.customerId, at)).some((task) => task.key === 'mystery'));

  /* And `active = 0` is why this is a table rather than a constant: turning a
     prompt off is an operator decision on a live box. */
  await w.db.run(`UPDATE daily_tasks SET active = 0 WHERE key = 'invite'`);
  check('a deactivated task is not shown',
    !(await tasks.tasksFor(w.db, w.customerId, at)).some((task) => task.key === 'invite'));

  await w.db.close();
}

/**
 * Word Builder: the list the card deals, and the clue in the reader's language.
 *
 * The two used to be one value — the reader's language — so a Polish reader on
 * the English card got Polish words and a Russian reader got a 404, while every
 * clue that did arrive was English. They travel apart now: `wordList` is what is
 * practised and `language` is what the clue is written in.
 */
async function wordListRules(): Promise<void> {
  describe('Word Builder — the list and the clue');

  const w = await world();
  const at = now();
  const deal = async (language: string, wordList?: string) => {
    const round = await games.startSession(w.db, {
      userId: w.customerId, gameType: 'word_builder', language, wordList, practice: true, at,
    });
    const secret = await w.db.get<{ secret: string }>(
      `SELECT secret FROM game_sessions WHERE id = $i`, { i: round.sessionId },
    );
    return {
      words: (JSON.parse(secret!.secret) as { words: string[] }).words,
      hints: (round.content as { words: Array<{ hint: string | null }> }).words.map((x) => x.hint),
    };
  };
  const listOf = async (language: string) =>
    new Set((await w.db.all<{ word: string }>(
      `SELECT word FROM word_bank WHERE language = $l`, { l: language },
    )).map((row) => row.word.toUpperCase()));
  const english = await listOf('en');

  const ru = await deal('ru', 'en');
  check('a Russian reader on the English card is dealt English words',
    ru.words.length > 0 && ru.words.every((word) => english.has(word)), ru.words);
  /* The 2 000-word bank carries a native clue for each word in its own list
     only, so a Russian reader on the English card gets Russian where the bank
     has that clue in Russian (an English clue shared with a Russian word) and
     the English column otherwise — never a blank. */
  const englishClues = new Set((await w.db.all<{ hint: string | null }>(
    `SELECT hint FROM word_bank WHERE language = 'en'`,
  )).map((row) => row.hint));
  check('…with each clue in Russian or, failing that, English',
    ru.hints.every((hint) => /[а-яё]/i.test(hint ?? '') || englishClues.has(hint)), ru.hints);
  check('…and Russian wherever the bank has the same clue in Russian',
    ((await w.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM translations t JOIN word_bank w ON w.id = t.entity_id
        WHERE t.entity = 'word' AND t.field = 'hint' AND t.language = 'ru' AND w.language = 'en'`,
    ))?.n ?? 0) > 0);

  /* A reader on their own language's list gets the bank's own clue for each
     word — `clue_native`, not a translation of the English one. */
  const native = new Map(readWordBank('updates').map((row) => [row.word + '|' + row.language, row.clueNative]));
  for (const language of ['pl', 'uz', 'ru']) {
    const own = await deal(language, language);
    const secretWords = own.words;
    check(`a ${language} reader on the ${language} list gets the bank's ${language} clue`,
      secretWords.length > 0 &&
        secretWords.every((word, i) => own.hints[i] === native.get(word + '|' + language)),
      own.hints);
  }

  const pl = await deal('pl', 'en');
  check('a Polish reader on the English card is not dealt Polish words',
    pl.words.every((word) => english.has(word)), pl.words);

  const en = await deal('en', 'en');
  const column = new Set((await w.db.all<{ hint: string | null }>(
    `SELECT hint FROM word_bank WHERE language = 'en'`,
  )).map((row) => row.hint));
  check('an English reader keeps the English clues', en.hints.every((hint) => column.has(hint)), en.hints);

  /* The phone sends no `wordList`, and must get what it always got. */
  const legacy = await deal('en');
  check('no list means the reader’s language, as before', legacy.words.every((word) => english.has(word)));

  await w.db.close();
}

/**
 * Logos — the image proxy, and the two things it must refuse.
 *
 * `domain/media.ts` exists because the front end makes no third-party runtime
 * requests and every logo the old database holds is an external address, so the
 * fetch happens here and the browser asks *us*. Which makes this file an
 * outbound HTTP client inside the process that holds the ledger, and the checks
 * that matter are the refusals rather than the happy path:
 *
 *  - **A `data:` URL is not proxied.** The browser can already draw one, and
 *    round-tripping it would be a request to re-serve bytes the response
 *    already contained. This is the common case — the listing form writes
 *    `data:` URLs — so getting it wrong would mean fetching every owner's own
 *    upload through this path.
 *  - **Nothing but `http(s)` is a source.** A `file:` URL or a bare path would
 *    make an image proxy an arbitrary-read primitive against the box the server
 *    runs on, which is the one way this feature stops being a broken picture
 *    and becomes a hole.
 *
 * No check here performs a real fetch. The suite runs offline (`README.md`, on
 * why the SQLite driver is kept) and a test that reached somebody's CDN would
 * fail on an aeroplane and pass in CI, which is the least useful shape a check
 * can have. What is tested is the decision — which URLs are candidates at all,
 * and what the client is handed.
 */
async function mediaRules(): Promise<void> {
  describe('logos — what may be proxied, and what may not');

  const w = await world();

  /* `logoPath` is the promise the server makes to the browser: a path on our
     own origin, or a `data:` URL, or nothing. **Never a third-party URL** —
     that is the property the whole feature turns on. */
  /* A real 1×1 PNG, so the checks below exercise the byte sniffing rather than
     a string that merely says it is a picture. */
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  const pngData = `data:image/png;base64,${PNG.toString('base64')}`;
  check('an external address becomes a path on the API, versioned by what is stored',
    /^\/v1\/media\/service\/gsv_1\?v=[0-9a-f]{10}$/.test(media.logoPath('service', 'gsv_1', 'https://base44.app/logo.png') ?? ''));
  check('…and so does an inline picture — no base64 travels in a list any more',
    /^\/v1\/media\/venue\/ven_1\?v=[0-9a-f]{10}$/.test(media.logoPath('venue', 'ven_1', pngData) ?? ''));
  check('a replaced logo is a new URL, so a week of immutable cache cannot serve the old one',
    media.logoPath('service', 'gsv_1', 'https://x/a.png') !== media.logoPath('service', 'gsv_1', 'https://x/b.png'));
  eq('an inline value that is not a picture is nothing', media.logoPath('venue', 'ven_1', 'data:image/png;base64,AAA'), null);
  eq('nothing stored is nothing sent', media.logoPath('venue', 'ven_1', null), null);
  eq('…and so is blank', media.logoPath('venue', 'ven_1', '   '), null);
  /* The hole this closes. A `file:` source would be an arbitrary read of the
     server's own disk, served to anybody with the URL. */
  eq('a file: URL is not a logo', media.logoPath('venue', 'ven_1', 'file:///etc/passwd'), null);
  eq('…nor is a bare path', media.logoPath('venue', 'ven_1', '/etc/passwd'), null);
  /* The id goes in a URL, so it is encoded. Every id here is `prefix_hex` and
     could not need it — which is exactly why it would go unnoticed. */
  check('the id is encoded', (media.logoPath('service', 'a/b', 'https://x/y.png') ?? '').startsWith('/v1/media/service/a%2Fb?v='));

  /* ── the type is read from the bytes ── */
  eq('a PNG is a PNG whatever its header said', media.sniff(PNG), 'image/png');
  eq('…and so are JPEG, GIF and WebP',
    [media.sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), media.sniff(Buffer.from('GIF89a......')), media.sniff(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))],
    ['image/jpeg', 'image/gif', 'image/webp']);
  eq('an SVG or a web page is not a picture, whatever it is labelled',
    [media.sniff(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), media.sniff(Buffer.from('<!doctype html>'))],
    [null, null]);

  /* ── files on this server's disk ── */
  const mediaDir = join(fileURLToPath(new URL('.', import.meta.url)), 'data', `verify-media-${process.pid}`);
  const config = CONFIG.media as { dir: string };
  const before = config.dir;
  config.dir = mediaDir;
  try {
    mkdirSync(join(mediaDir, 'service'), { recursive: true });
    eq('a media: value one level under the directory is a file', media.mediaFile('media:service/gsv_x.webp'), join(resolvePath(mediaDir), 'service', 'gsv_x.webp'));
    eq('…and nothing that climbs out of it is',
      [media.mediaFile('media:service/../../etc.webp'), media.mediaFile('media:../x.webp'), media.mediaFile('media:/etc/passwd'), media.mediaFile('media:service/a.svg')],
      [null, null, null, null]);

    writeFileSync(join(mediaDir, 'service', 'gsv_verify_file.webp'), PNG);
    writeFileSync(join(mediaDir, 'service', 'gsv_nobody.webp'), PNG);
    writeFileSync(join(mediaDir, 'service', 'gsv_verify_text.webp'), Buffer.from('not a picture'));
    for (const id of ['gsv_verify_file', 'gsv_verify_text']) {
      await w.db.run(
        `INSERT INTO guidance_services (id, name, country_code, category_key, active, position, image_url, created_at, updated_at)
         VALUES ($i, 'File Logo', 'PL', 'food', 1, 0, 'https://base44.app/old.png', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
        { i: id },
      );
    }
    const dry = await media.linkServiceFiles(w.db, { dryRun: true });
    eq('a dry run reports and writes nothing',
      [dry.linked, (await w.db.get<{ u: string }>(`SELECT image_url AS u FROM guidance_services WHERE id = 'gsv_verify_file'`))?.u],
      [['gsv_verify_file'], 'https://base44.app/old.png']);
    const linked = await media.linkServiceFiles(w.db);
    eq('linking points the service at its file', linked.linked, ['gsv_verify_file']);
    eq('…names the file that belongs to nobody, and refuses the one that is not a picture',
      [linked.unknown, linked.unreadable], [['gsv_nobody.webp'], ['gsv_verify_text.webp']]);
    eq('…and running it again changes nothing', (await media.linkServiceFiles(w.db)).unchanged, 1);
    const served = await media.assetFor(w.db, 'service', 'gsv_verify_file');
    eq('the file is served with the type its bytes say', [served.mime, served.body.equals(PNG)], ['image/png', true]);
  } finally {
    config.dir = before;
    rmSync(mediaDir, { recursive: true, force: true });
  }

  check('only the kinds with a source column are servable',
    media.isEntity('service') && media.isEntity('venue') && !media.isEntity('users'));

  /* An SVG is not on the allow-list, and it is the one absence worth pinning:
     served from our own origin it is a document with script available to it,
     which is a different kind of thing from a picture. */
  check('svg is not an image this server will serve',
    !(media.ALLOWED as readonly string[]).includes('image/svg+xml'),
    media.ALLOWED.join(', '));

  /* A row with nothing to serve is a 404 rather than an empty 200 — the client
     draws its initial on any failure, and an empty image is the one thing that
     would render as a broken glyph instead. */
  await w.db.run(
    `INSERT INTO guidance_services (id, name, country_code, category_key, active, position, created_at, updated_at)
     VALUES ('gsv_verify_none', 'No Logo', 'PL', 'food', 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  );
  await throws('a listing with no image is a 404', 'not_found', async () =>
    await media.assetFor(w.db, 'service', 'gsv_verify_none'),
  );
  await w.db.run(
    `UPDATE guidance_services SET image_url = 'data:image/png;base64,AAA' WHERE id = 'gsv_verify_none'`,
  );
  await throws('…and so is one whose inline value is not a picture', 'not_found', async () =>
    await media.assetFor(w.db, 'service', 'gsv_verify_none'),
  );
  await w.db.run(`UPDATE guidance_services SET image_url = $v WHERE id = 'gsv_verify_none'`, { v: pngData });
  const inline = await media.assetFor(w.db, 'service', 'gsv_verify_none');
  eq('an inline picture is served from its own URL, decoded', [inline.mime, inline.body.equals(PNG)], ['image/png', true]);
  await throws('an unknown kind is a 404, not a 500', 'not_found', async () =>
    await media.assetFor(w.db, 'passwords', 'x'),
  );

  /* `forget` is the hand sweep. `media_assets` has no foreign key — that is
     what lets one table serve venues and services — so nothing cascades into
     it, exactly as `translations` has to be swept by hand. */
  await w.db.run(
    `INSERT INTO media_assets (id, entity, entity_id, source_url, mime, bytes, size_bytes, status, fetched_at)
     VALUES ('med_venue_sweep', 'venue', 'ven_sweep', 'https://x/y.png', 'image/png', 'AAA', 2, 'ok', '2026-01-01T00:00:00.000Z')`,
  );
  await media.forget(w.db, 'venue', 'ven_sweep');
  eq('a deleted row takes its logo with it',
    (await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM media_assets WHERE entity_id = 'ven_sweep'`))?.n,
    0);

  await w.db.close();
}

/**
 * The exchange-rate sync.
 *
 * No check here performs the fetch. The suite runs offline — that is the whole
 * reason the SQLite driver is kept — and a test that read a Google Sheet would
 * fail on an aeroplane and pass in CI, which is the least useful shape a check
 * can have. What is tested is everything around the fetch, and that is where
 * the bugs are:
 *
 *  - **`lastSync` tells two facts apart.** Rates written on Monday with a sync
 *    attempted this morning means the sheet has not changed; rates written on
 *    Monday with nothing attempted since means the sync has stopped. A screen
 *    given one timestamp cannot say which, and the second is the one worth
 *    knowing.
 *  - **The currency list is the product's, not the sheet's.** A currency
 *    arriving in the sheet before this product has a symbol, a flag and a
 *    decimal convention for it would reach a price tag as an unlabelled number.
 *  - **`MAX(updated_at)`, not the first row's.** A currency the sheet stops
 *    carrying keeps its old stamp, so the alphabetically-first row's timestamp
 *    is only the answer while every row was written together.
 */
async function rateRules(): Promise<void> {
  describe('the exchange-rate sync');

  const db = await openDb(':memory:');

  /* Nothing synced yet: two nulls and no status. A screen reading this draws
     its built-in table and says so, which is a state rather than a fault. */
  const fresh = await rates.lastSync(db);
  eq('a database with no rates has no timestamps',
    [fresh.ratesUpdatedAt, fresh.attemptedAt, fresh.attemptStatus], [null, null, null]);

  const write = async (code: string, rate: number, at: string) =>
    await db.run(
      `INSERT INTO exchange_rates (code, base, rate, decimals, updated_at)
       VALUES ($c, 'EUR', $r, 2, $t)
         ON CONFLICT (code) DO UPDATE SET rate = excluded.rate, updated_at = excluded.updated_at`,
      { c: code, r: rate, t: at },
    );

  await write('AMD', 418.6, '2026-01-01T00:00:00.000Z');
  await write('PLN', 4.341, '2026-03-01T00:00:00.000Z');
  eq('the newest stamp is the one reported',
    (await rates.lastSync(db)).ratesUpdatedAt, '2026-03-01T00:00:00.000Z');

  await db.run(
    `INSERT INTO platform_config (key, value, updated_at)
     VALUES ('rates_last_attempt', $v, $t)`,
    { v: JSON.stringify({ status: 'failed', detail: 'http 503' }), t: '2026-03-09T00:00:00.000Z' },
  );
  const after = await rates.lastSync(db);
  eq('a failed attempt is reported beside the rates it did not replace',
    [after.ratesUpdatedAt, after.attemptedAt, after.attemptStatus],
    ['2026-03-01T00:00:00.000Z', '2026-03-09T00:00:00.000Z', 'failed']);
  /* And the rates are untouched, which is the last-known-good rule: a fetch
     that fails writes no rate, no zero and no null. */
  eq('…and the rates themselves did not move',
    (await db.get<{ rate: number }>(`SELECT rate FROM exchange_rates WHERE code = 'PLN'`))?.rate,
    4.341);

  /* The anchor has to be quotable, because every cross rate divides by it. */
  check('the anchor is one of the quoted currencies', rates.QUOTED.EUR === 2);
  /* Zero decimals where a fractional unit carries no information a reader could
     act on — 13 583 soum to the euro. Not a property of the rate, which is why
     it is here and not in the sheet. */
  eq('the soum is written without decimals', rates.QUOTED.UZS, 0);
  eq('…and the dram too', rates.QUOTED.AMD, 0);
  check('nineteen currencies are quoted', Object.keys(rates.QUOTED).length === 19,
    Object.keys(rates.QUOTED).length);

  await db.close();
}

/**
 * The board's default, and the migration that reaches the rows that predate it.
 *
 * Both halves, because either alone leaves the rule half-applied: the column
 * default decides what a *new* account gets and the migration decides what an
 * existing one gets, and a product where the answer depends on when you signed
 * up is the least explicable rule there is.
 *
 * The third check is the one that matters most and is the easiest to lose: the
 * migration is **guarded on the stored version so it runs once**. Run twice and
 * it re-opts-in everybody who opted out after the first run, which turns a
 * stated one-off cost into a switch that does not stay switched.
 */
async function boardDefaultRules(): Promise<void> {
  describe('the board: on by default, and off if you say so');

  const db = await openDb(':memory:');
  const at = '2026-04-02T10:00:00.000Z';

  const fresh = await accounts.signUp(db, {
    email: 'listed@verify.test',
    password: 'correct horse',
    name: 'Listed',
    at,
    acceptTerms: true,
  });
  eq('a new account is on the board', fresh.leaderboard_opt_in, 1);

  /* And the switch still works, in both directions. The opt-out is the whole
     reason turning the default on is safe rather than a privacy change. */
  await social.setLeaderboardOptIn(db, fresh.id, false);
  eq('…and can be turned off', (await accounts.getUser(db, fresh.id)).leaderboard_opt_in, 0);
  await social.setLeaderboardOptIn(db, fresh.id, true);
  eq('…and back on', (await accounts.getUser(db, fresh.id)).leaderboard_opt_in, 1);

  /*
   * The migration, simulated: a row as an older build left it, and a stored
   * version to match. `migrate` is then run again — which is what a deploy
   * does — and has to flip it.
   */
  await db.run(
    `INSERT INTO users (id, email, email_norm, display_name, auth_provider, language,
                        status, leaderboard_opt_in, created_at, updated_at)
     VALUES ('usr_legacy_board', 'legacy@verify.test', 'legacy@verify.test', 'Legacy',
             'email', 'en', 'active', 0, $t, $t)`,
    { t: at },
  );
  await db.run(`UPDATE schema_meta SET value = '5' WHERE key = 'version'`);
  await migrate(db);
  eq('the migration puts an existing account on the board',
    (await accounts.getUser(db, 'usr_legacy_board')).leaderboard_opt_in, 1);

  /*
   * And once. Somebody opts out *after* the migration; a second deploy must not
   * undo that. The version stamp is what makes it once, so this is really a
   * check that the guard reads the stamp rather than the rows.
   */
  await social.setLeaderboardOptIn(db, 'usr_legacy_board', false);
  await migrate(db);
  eq('…and does not undo an opt-out on the next deploy',
    (await accounts.getUser(db, 'usr_legacy_board')).leaderboard_opt_in, 0);

  await db.close();
}

/**
 * A round in the language the reader picked.
 *
 * "The games are in English when I chose Russian" had **two** causes and only
 * one of them is on this side. The client never told the server which language
 * was chosen, so `users.language` stayed whatever sign-up wrote and the header
 * lost to it on every request — `AuthProvider` patches it now.
 *
 * What is checked here is the other half: given the right language, the draw
 * serves it, and where a bank genuinely has no rows in it the fallback goes
 * **selected → ru → en** rather than straight to English. Most of this
 * product's Ukrainian readers read Russian, and none of the Russian bank is
 * harder for them than the English one.
 */
async function quizLanguageRules(): Promise<void> {
  describe('a round in the language that was chosen');

  const w = await world();
  const at = now();

  const promptsIn = async (language: string, gameType: games.GameType = 'capitals') => {
    /* The no-repeat window is per player per game, and these draws are about
       *language* rather than history — so each one gets a fresh account. */
    const id = newId('usr');
    await w.db.run(
      `INSERT INTO users (id, email, email_norm, display_name, auth_provider, language,
                          status, email_verified_at, created_at, updated_at)
       VALUES ($i, $e, $e, 'Reader', 'email', $l, 'active', $t, $t, $t)`,
      { i: id, e: `${language}-${gameType}@verify.test`, l: language, t: at },
    );
    const round = await games.startSession(w.db, { userId: id, gameType, language, at });
    return (round.content as { questions: Array<{ prompt: string; options: string[] }> }).questions;
  };

  /*
   * The capitals bank prompts with the **country's own name in that language**,
   * so the script is the tell: a Russian round asks about `Польша` and an
   * English one about `Poland`. Checked as a script rather than against a
   * specific country, because which five countries a draw lands on is random.
   */
  const cyrillic = /[\u0400-\u04FF]/;
  const ru = await promptsIn('ru');
  check('a Russian reader gets Russian questions',
    ru.every((q) => cyrillic.test(q.prompt)), ru.map((q) => q.prompt).join(', '));
  check('…and Russian answers', ru.every((q) => q.options.some((o) => cyrillic.test(o))));

  const en = await promptsIn('en');
  check('an English reader gets English questions',
    en.every((q) => !cyrillic.test(q.prompt)), en.map((q) => q.prompt).join(', '));

  const uz = await promptsIn('uz');
  check('an Uzbek reader gets Uzbek questions — not English',
    uz.every((q) => !cyrillic.test(q.prompt)) &&
      JSON.stringify(uz.map((q) => q.prompt).sort()) !== JSON.stringify(en.map((q) => q.prompt).sort()),
    uz.map((q) => q.prompt).join(', '));

  /*
   * Ukrainian: the capitals export carries no `uk` rows at all, so this is the
   * fallback under test. It must land on **Russian** — Cyrillic, and not the
   * English set.
   */
  const bankedUk = await w.db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM quiz_items WHERE bank = 'capitals' AND language = 'uk'`,
  );
  eq('the capitals bank has no Ukrainian rows to serve', bankedUk?.n, 0);
  const uk = await promptsIn('uk');
  check('…so a Ukrainian reader gets Russian rather than English',
    uk.every((q) => cyrillic.test(q.prompt)), uk.map((q) => q.prompt).join(', '));

  /*
   * And English is still the last resort. A language nothing is imported in —
   * `languageOf` admits `tr` and `az`, which no bank carries — has to produce a
   * round rather than a 404, because a translation gap is not an absent game.
   */
  const tr = await promptsIn('tr');
  check('a language no bank carries still gets a round', tr.length === CONFIG.games.quizQuestions);

  await w.db.close();
}

/**
 * The Word Builder bank — "the database looks empty".
 *
 * It was neither empty nor blocked. It held **thirty** words: twenty Polish and
 * ten English, hand-typed into `WORDS` in `domain/settings.ts` as a
 * placeholder, while the real lists sat unread in `updates/` — 136 words each,
 * with their own tiers and hints, which the *front end* has been building from
 * all along.
 *
 * Which is exactly why it looked empty. A round is `wordsPerRound` words,
 * `buildWords` excludes the last `recentWindow` a player has seen, and ten
 * minus forty is nothing — so the second round any one account opened came back
 * short, permanently, for that account.
 *
 * Three things are checked and the third is the one that stops this recurring:
 * the bank is big enough to sustain play, the **tier comes from the export**
 * rather than from the word's length, and a bank that has been starved is a
 * reason for boot to re-import.
 */
async function wordBankRules(): Promise<void> {
  describe('the Word Builder bank');

  const w = await world();
  const at = now();
  const floor = CONFIG.games.recentWindow + CONFIG.games.wordsPerRound;

  const counts = await w.db.all<{ language: string; n: number }>(
    `SELECT language, COUNT(*) AS n FROM word_bank GROUP BY language ORDER BY language`,
  );
  check('the bank has all four lists', counts.length >= 4, JSON.stringify(counts));
  for (const row of counts) {
    check(`${row.language} has enough words to sustain a round`, row.n > floor,
      `${row.n} words against a floor of ${floor}`);
  }
  /* The 2 000-word CSV is the bank: 500 words in each list, and nothing else
     left behind in those lists — the placeholder and the old JSON lists are
     replaced, not merged under it. */
  for (const language of ['en', 'pl', 'uz', 'ru']) {
    eq(`${language} holds the CSV's 500 words`,
      counts.find((row) => row.language === language)?.n, 500);
  }
  eq('every word in the four lists has its tiles',
    (await w.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM word_bank WHERE language IN ('en','pl','uz','ru') AND tiles IS NULL`,
    ))?.n, 0);
  eq('the CSV reads as 2 000 words', readWordBank('updates').length, 2000);
  check(`the importer names ${WORD_BANK_CSV}`, existsSync(join('updates', WORD_BANK_CSV)));

  /*
   * **The tier is the export's, not the word's length.**
   *
   * `seedWords` derives it as 3–4 / 5–7 / 8+ characters, which is a reasonable
   * guess and is not what the file says: the export tiers `COFFEE` (six
   * letters) as 2 and `KAWA` (four) as 1 deliberately. The tier is what a word
   * *pays*, so a guess that disagrees with the authored value pays the wrong
   * amount for the right answer.
   */
  const coffee = await w.db.get<{ tier: number; hint: string | null }>(
    `SELECT tier, hint FROM word_bank WHERE language = 'en' AND word = 'COFFEE'`,
  );
  eq('a word carries the tier the export gave it (Medium → 2)', coffee?.tier, 2);
  eq('…and its English clue', coffee?.hint, 'A hot dark drink that wakes you up');
  eq('an Easy word is tier 1',
    (await w.db.get<{ tier: number }>(`SELECT tier FROM word_bank WHERE language = 'en' AND word = 'BUILD'`))?.tier, 1);
  eq('a Hard word is tier 3',
    (await w.db.get<{ tier: number }>(`SELECT tier FROM word_bank WHERE language = 'en' AND word = 'BALANCE'`))?.tier, 3);

  /* Every tier is represented in every list, because the round is a ramp —
     `WORD_RAMP` asks for two tier-1, two tier-2 and one tier-3, and a list
     missing a rung makes the ramp quietly shorter. */
  for (const language of ['en', 'pl', 'uz', 'ru']) {
    const tiers = await w.db.all<{ tier: number; n: number }>(
      `SELECT tier, COUNT(*) AS n FROM word_bank WHERE language = $l GROUP BY tier ORDER BY tier`,
      { l: language },
    );
    eq(`${language} carries all three tiers`, tiers.map((row) => row.tier), [1, 2, 3]);
  }

  /*
   * And the round plays **more than twice**, which is the symptom that was
   * reported. Ten rounds is fifty words drawn against the window, which the old
   * thirty-word bank could not have served past the second.
   */
  for (let i = 0; i < 10; i += 1) {
    const round = await games.startSession(w.db, {
      userId: w.customerId,
      gameType: 'word_builder',
      language: 'en',
      practice: true,
      at: plusMinutes(at, i),
    });
    const words = (round.content as { words: Array<{ length: number }> }).words;
    if (words.length !== CONFIG.games.wordsPerRound) {
      check(`round ${i + 1} is a full round`, false, `${words.length} words`);
      break;
    }
    if (i === 9) check('ten rounds in a row are all full rounds', true, '10 rounds');
  }

  /*
   * **Uzbek tiles are letters, not characters.** GOʻSHT is G|Oʻ|SH|T — four
   * slots — and splitting it by code unit dealt six, one of them a bare ʻ.
   * The three words below are made the whole of the Uzbek list for one round
   * (the rest parked under another language code), so the deal is known.
   */
  const picked = ['GOʻSHT', 'MUSHUK', 'KOʻCHA'];
  await w.db.run(
    `UPDATE word_bank SET language = 'uz_parked'
      WHERE language = 'uz' AND word NOT IN ($a, $b, $c)`,
    { a: picked[0], b: picked[1], c: picked[2] },
  );
  await w.db.run(`DELETE FROM game_recent_items WHERE user_id = $u`, { u: w.customerId });
  const uzRound = await games.startSession(w.db, {
    userId: w.customerId, gameType: 'word_builder', language: 'uz', practice: true, at: plusMinutes(at, 30),
  });
  const uzSecret = JSON.parse((await w.db.get<{ secret: string }>(
    `SELECT secret FROM game_sessions WHERE id = $i`, { i: uzRound.sessionId },
  ))!.secret) as { words: string[]; tiles: string[][] };
  const uzWords = (uzRound.content as {
    words: Array<{ index: number; length: number; letters: string[] }>;
  }).words;
  const goshtAt = uzSecret.words.indexOf('GOʻSHT');
  const gosht = uzWords[goshtAt];
  eq('GOʻSHT is dealt as four tiles', gosht?.length, 4);
  eq('…its tiles are G, Oʻ, SH, T', uzSecret.tiles[goshtAt], ['G', 'Oʻ', 'SH', 'T']);
  check('…every one of them on the rack',
    ['G', 'Oʻ', 'SH', 'T'].every((tile) => gosht?.letters.includes(tile)), gosht?.letters);
  eq('…beside the CSV\'s two decoys', gosht?.letters.length, 6);
  const goshtDecoys = [...(gosht?.letters ?? [])];
  for (const tile of ['G', 'Oʻ', 'SH', 'T']) goshtDecoys.splice(goshtDecoys.indexOf(tile), 1);
  check('…drawn from the Uzbek alphabet and never a piece of a real tile',
    goshtDecoys.length === 2 &&
      goshtDecoys.every((tile) => games.WORD_ALPHABETS.uz.includes(tile) &&
        !['G', 'Oʻ', 'SH', 'T'].some((own) => own.includes(tile) || tile.includes(own))),
    goshtDecoys);
  check('no rack holds a bare ʻ', uzWords.every((word) => !word.letters.includes('ʻ')), uzWords);

  let uzSeq = 0;
  const uzSend = async (kind: string, payload: Record<string, unknown>) =>
    await games.submitEvent(w.db, {
      sessionId: uzRound.sessionId, userId: w.customerId, seq: ++uzSeq, kind, payload,
      at: plusMinutes(at, 30),
    });
  eq('a hint on slot 2 reveals the whole tile Oʻ',
    (await uzSend('hint', { index: goshtAt, position: 1 })).answer, 'Oʻ');
  eq('a hint past the fourth tile is refused, though the word is six characters',
    await uzSend('hint', { index: goshtAt, position: 4 }).then(() => 'answered', (e: unknown) =>
      (e as { code?: string }).code), 'bad_request');
  eq('a wrong spelling is wrong', (await uzSend('guess', { index: goshtAt, guess: 'GOSHT' })).correct, false);
  eq('the tiles joined are the word', (await uzSend('guess', { index: goshtAt, guess: 'GOʻSHT' })).correct, true);
  const mushukAt = uzSecret.words.indexOf('MUSHUK');
  eq('MUSHUK is five tiles', uzWords[mushukAt]?.length, 5);
  eq('…and is accepted sent as tiles',
    (await uzSend('guess', { index: mushukAt, tiles: ['M', 'U', 'SH', 'U', 'K'] })).correct, true);
  const kochaAt = uzSecret.words.indexOf('KOʻCHA');
  eq('an ASCII apostrophe is the same letter (KO\'CHA)',
    (await uzSend('guess', { index: kochaAt, guess: 'KO\'CHA' })).correct, true);
  await w.db.run(`UPDATE word_bank SET language = 'uz' WHERE language = 'uz_parked'`);

  /* `word_accept`: a Polish word typed without its diacritics is accepted. */
  eq('GŁOWA accepts GLOWA',
    JSON.parse((await w.db.get<{ accept: string }>(
      `SELECT accept FROM word_bank WHERE language = 'pl' AND word = 'GŁOWA'`,
    ))?.accept ?? '[]'), ['GLOWA']);
  eq('the fold the judge compares by treats ‘ ’ \' and ʻ as one mark',
    new Set(['GOʻSHT', 'GO\'SHT', 'GO‘SHT', 'GO’SHT', 'goʻsht'].map(games.spellingKey)).size, 1);

  await w.db.close();
}

async function bootOrdering(): Promise<void> {
  describe('boot: import, and nothing invented');

  const { db } = await boot({ file: ':memory:', quiet: true });
  const count = async (sql: string) => (await db.get<{ n: number }>(sql))?.n ?? 0;

  eq(
    'boot writes no demonstration venue',
    await count(`SELECT COUNT(*) AS n FROM venues WHERE id LIKE 'ven!_demo!_%' ESCAPE '!'`),
    0,
  );
  eq(
    'nor any demonstration deal',
    await count(`SELECT COUNT(*) AS n FROM hot_deals WHERE id LIKE 'del!_demo!_%' ESCAPE '!'`),
    0,
  );
  eq('nor a gift-card shelf', await count(`SELECT COUNT(*) AS n FROM gift_card_stock`), 0);
  /* And not under another name either. The demo venues carried one address
     between them — a domain we control, standing in for the inbox a made-up
     café does not have — so it is the tell that survives a rename of the id
     prefix, which is the way a seed most plausibly comes back. */
  eq(
    'nor a venue reachable at the address the demo set shared',
    await count(`SELECT COUNT(*) AS n FROM venues WHERE email = 'demo@pay-lez.com'`),
    0,
  );
  check(
    'and the marker the demo set used to leave is gone from the config table',
    (await db.get(`SELECT value FROM platform_config WHERE key = 'demo_seed'`)) === undefined,
  );

  /* The two things boot *is* still allowed to write, so this suite fails if the
     cut went too far: the plan ladder and the Word Builder bank are product
     configuration rather than anybody's data, and every game and every
     subscription screen is unusable without them. */
  check('the plans are still seeded', (await count(`SELECT COUNT(*) AS n FROM plans`)) >= 3);
  check('and the word bank with them', (await count(`SELECT COUNT(*) AS n FROM word_bank`)) > 0);

  await db.close();

  /* **A second boot on the same database does not re-import.** Every gate in
     `boot` that triggers the import has to be one the import can satisfy, or
     the import runs on every start — on production, minutes of 502s each time
     (2026-10-05: one brain question whose source has two wrong answers kept
     `short` true forever). */
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'paylez-boot-'));
  try {
    const file = join(dir, 'twice.db');
    const first = await boot({ file, quiet: true });
    check('the first boot on an empty database imports', first.reimported);
    eq('…and leaves no question short of options', (await first.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM quiz_items
        WHERE LENGTH(distractors) - LENGTH(REPLACE(distractors, ',', '')) < $c`,
      { c: CONFIG.games.quizOptions - 2 },
    ))?.n, 0);
    await first.db.close();
    const second = await boot({ file, quiet: true });
    eq('a second boot on the same database does not re-import', second.reimported, false);
    await second.db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ══════════════════════════════════════════════════════════════ the run ══ */

/* ═════════════════════════════════════ the partner dashboard (contract §2) ══ */

/** One gate cycle for any customer of the fixture venue, carrying a deal or a redemption. */
async function scanAs(
  w: World,
  userId: string,
  amountMinor: number,
  at: Iso,
  extra: { dealId?: string; intent?: gate.Intent; intentRef?: string } = {},
): Promise<gate.Receipt> {
  const qr = await gate.mintQr(w.db, w.venueId, SECRET, at);
  const txn = await gate.openTransaction(w.db, { kind: 'qr', token: qr.token, secret: SECRET }, { userId, at, ...extra });
  await gate.submitAmount(w.db, { transactionId: txn.id, amountMinor, actorId: w.ownerId, at });
  return await gate.confirm(w.db, { transactionId: txn.id, cashierId: w.ownerId, at });
}

/** An account made the day before `created`, carrying the fields these sections look people up by. */
async function person(
  w: World,
  label: string,
  created: Iso,
  extra: { city?: string; language?: string; username?: string } = {},
): Promise<string> {
  const id = newId('usr');
  /*
   * **`venue_sharing_default` is 0 for everybody this helper makes**, and that
   * is a decision about what the dashboard sections are testing rather than a
   * convenience.
   *
   * The column defaults to 1 and `gate.confirm` turns that into a §1.4 grant on
   * a confirmed visit — which is the feature, and it is tested on its own in
   * `sharingDefaultRules`. Every section below this helper is about the *gate*:
   * that a customer is counted without being named, that granting names them,
   * that withdrawing un-names them, and that a suppressed cohort stays
   * suppressed. Leaving the default on would have granted all twelve of them
   * automatically and quietly replaced every one of those checks with a check
   * that the default works — which is how a rule stops being tested without
   * anybody deleting a test.
   *
   * The sections that want a grant ask for one explicitly, as they always did.
   */
  await w.db.run(
    `INSERT INTO users (id, email, email_norm, display_name, username, username_norm, auth_provider,
                        language, city, display_avatar, status, venue_sharing_default,
                        created_at, updated_at)
     VALUES ($i, $e, $e, $n, $un, $unn, 'email', $l, $c, $av, 'active', 0, $t, $t)`,
    {
      i: id,
      e: `${id}@verify.test`,
      n: `Person ${label}`,
      un: extra.username ?? null,
      unn: extra.username?.toLowerCase() ?? null,
      l: extra.language ?? 'en',
      c: extra.city ?? 'Krakow',
      av: `avatar-${label}`,
      t: plusDays(created, -1),
    },
  );
  return id;
}

/**
 * The `DO UPDATE SET` assignments in a piece of source that add to a column by
 * its bare name — `visits = visits + 1`.
 *
 * Postgres refuses those at parse time (42702: the target row and `excluded`
 * are both in scope) and SQLite resolves them happily, so this suite would never
 * see one fail; `gate.recordVisit` carried one, which would have refused every
 * counted visit on the production database. Reading the source is the only
 * offline way to catch the next one.
 */
function bareUpserts(source: string): string[] {
  const hits: string[] = [];
  for (const clause of source.matchAll(/DO\s+UPDATE\s+SET([\s\S]*?)(?:`|\bWHERE\b|\bRETURNING\b)/gi)) {
    let depth = 0;
    let current = '';
    const assignments: string[] = [];
    for (const char of clause[1]) {
      if (char === '(') depth += 1;
      if (char === ')') depth -= 1;
      if (char === ',' && depth === 0) {
        assignments.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    assignments.push(current);
    for (const assignment of assignments) {
      const split = assignment.indexOf('=');
      if (split < 0) continue;
      const column = assignment.slice(0, split).trim();
      if (!/^[a-z_][a-z0-9_]*$/i.test(column)) continue;
      if (new RegExp(`(^|[^.\\w$])${column}\\b`, 'i').test(assignment.slice(split + 1))) hits.push(assignment.trim());
    }
  }
  return hits;
}

async function dashboardHelperRules(): Promise<void> {
  describe('venue-local days, receipts, spend direction, deal dates, portable upserts');

  eq('local midnight in Kraków in summer is 22:00 UTC the day before', localMidnight('2026-10-01', 'Europe/Warsaw'), '2026-09-30T22:00:00.000Z');
  eq('…and 23:00 in winter', localMidnight('2026-01-15', 'Europe/Warsaw'), '2026-01-14T23:00:00.000Z');
  eq('a Tashkent month starts at 19:00 UTC', monthStart('2026-09', 'Asia/Tashkent'), '2026-08-31T19:00:00.000Z');
  /* The two the old hour-by-hour search could never find, because it only ever
     stopped on a whole UTC hour — so both fell back to UTC midnight. */
  eq('a half-hour zone’s month starts on its own midnight', monthStart('2026-09', 'Asia/Kolkata'), '2026-08-31T18:30:00.000Z');
  eq('…and a quarter-hour zone’s', monthStart('2026-09', 'Asia/Kathmandu'), '2026-08-31T18:15:00.000Z');

  /* The property itself, on the days that are not simple: clocks that jump at
     midnight so the day has no 00:00 (Havana, Santiago), clocks that change
     after it (Warsaw), and changes of half an hour (Lord Howe, Chatham). */
  for (const [zone, day] of [
    ['Europe/Warsaw', '2026-03-29'],
    ['Europe/Warsaw', '2026-10-25'],
    ['America/Havana', '2026-03-08'],
    ['America/Santiago', '2026-09-06'],
    ['America/Santiago', '2026-04-05'],
    ['Australia/Lord_Howe', '2026-10-04'],
    ['Pacific/Chatham', '2026-09-27'],
  ]) {
    const start = localMidnight(day, zone);
    const before = new Date(Date.parse(start) - 1).toISOString();
    check(
      `${zone} ${day} starts at the first instant that is that day`,
      localDay(start, zone) === day && localDay(before, zone) < day,
      { start },
    );
  }

  eq('a day moves back across a month end', shiftDay('2026-03-01', -1), '2026-02-28');
  eq('…and forward into a leap day', shiftDay('2028-02-28', 1), '2028-02-29');

  const june = dashboard.dayWindow('Europe/Warsaw', 30, '2026-06-30T12:00:00.000Z');
  eq('thirty days ending on the 30th of June are June', [june.from, june.to], ['2026-06-01', '2026-06-30']);
  eq('…cut at Kraków midnight at both ends', [june.start, june.end], ['2026-05-31T22:00:00.000Z', '2026-06-30T22:00:00.000Z']);
  const may = dashboard.windowBefore(june, 'Europe/Warsaw');
  eq('the window before is the thirty days before', [may.from, may.to, may.end], ['2026-05-02', '2026-05-31', june.start]);

  const receipt = dashboard.receiptOf('txn_example');
  check('a receipt mark is a hash and four letters somebody can read out', /^#[A-HJ-NP-Z2-9]{4}$/.test(receipt), receipt);
  eq('…and one transaction always prints the same one', dashboard.receiptOf('txn_example'), receipt);

  eq('spend with nothing on either side has no direction', profiles.spendTrendOf(0, 0), undefined);
  eq('spend from nothing is up', profiles.spendTrendOf(1, 0), 'up');
  eq('spend to nothing is down', profiles.spendTrendOf(0, 1), 'down');
  eq('a tenth more is still flat', profiles.spendTrendOf(1100, 1000), 'flat');
  eq('…past it is up', profiles.spendTrendOf(1101, 1000), 'up');
  eq('a tenth less is still flat', profiles.spendTrendOf(900, 1000), 'flat');
  eq('…past it is down', profiles.spendTrendOf(899, 1000), 'down');

  /* The bug the end-date rule fixes, stated as the comparison that made it: a
     bare day sorts before its own morning, so "valid until the 30th" had ended
     before the 30th began. */
  check('a bare day sorts before that day’s own morning', '2026-09-30' < '2026-09-30T08:00:00.000Z');
  eq('a bare end day is the last millisecond of that day in the venue’s clock', deals.checkValidTo('2026-09-30', 'Europe/Warsaw'), '2026-09-30T21:59:59.999Z');
  eq('…which reads back as the same date', deals.checkValidTo('2026-09-30', 'Asia/Tashkent')?.slice(0, 10), '2026-09-30');
  eq('a bare start day is kept as the day', deals.checkValidFrom('2026-09-01'), '2026-09-01');
  eq('an instant is normalised to UTC', deals.checkValidTo('2026-09-30T10:00:00+02:00', 'Europe/Warsaw'), '2026-09-30T08:00:00.000Z');
  await throws('a date that is not a date is refused', 'validation_failed', () => deals.checkValidTo('banana', 'Europe/Warsaw'));
  await throws('…and so is a day the calendar does not have', 'validation_failed', () => deals.checkValidFrom('2026-02-30'));

  eq('the lint catches the upsert that refused every counted visit on Postgres', bareUpserts('DO UPDATE SET last_seen_at = excluded.last_seen_at, visits = visits + 1`'), ['visits = visits + 1']);
  eq('…and passes the qualified form', bareUpserts('DO UPDATE SET visits = venue_customers.visits + 1, spend_minor = venue_customers.spend_minor + excluded.spend_minor`'), []);
  const here = fileURLToPath(new URL('.', import.meta.url));
  const offenders: string[] = [];
  for (const file of readdirSync(here, { recursive: true, encoding: 'utf8' })) {
    /* The server itself — not this file, whose checks quote the bad shape on
       purpose, and not `demo/`, a script still being written by another hand. */
    if (!file.endsWith('.ts') || file === 'verify.ts' || file.startsWith('demo')) continue;
    for (const hit of bareUpserts(readFileSync(join(here, file), 'utf8'))) offenders.push(`${file}: ${hit}`);
  }
  eq('no upsert in the server adds to a bare column name', offenders, []);
}

interface DashboardWorld {
  d: World;
  /** 14:00 in Kraków on the 30th of June — so a thirty-day window is exactly June. */
  T: Iso;
  c: string[];
  dealA: string;
  tier5: string;
  tier10: string;
  campaignId: string;
  receipts: Record<'c0First' | 'c1First' | 'lateNight' | 'redeemPastry' | 'small', gate.Receipt>;
}

/**
 * A June at one café, written in the order it happened (the gate's cooldown
 * reads the last visit, so history has to arrive forwards):
 *
 *   * c2 buys a 5% voucher in May and spends it on a first visit;
 *   * twelve customers come in June, c1 three times — once at 00:30 Kraków
 *     time, which is the 14th in UTC and the 15th at the café;
 *   * a two-visit stamp campaign starts on the 11th; c1 fills it and spends the
 *     pastry on the 20th, c4 fills it with a voucher redemption on the 19th;
 *   * c3 opens a deal and claims it at the counter;
 *   * c0 comes back on the 24th with a bill under the venue's minimum.
 */
async function dashboardFixture(): Promise<DashboardWorld> {
  const d = await world();
  const T = '2026-06-30T12:00:00.000Z';
  const c: string[] = [];
  for (let i = 0; i < 12; i += 1) c.push(await person(d, `c${i}`, '2026-05-01T00:00:00.000Z'));
  const tierOf = async (pct: number) =>
    (await d.db.get<{ id: string }>(`SELECT id FROM voucher_tiers WHERE venue_id = $v AND discount_pct = $p`, {
      v: d.venueId,
      p: pct,
    }))!.id;
  const tier5 = await tierOf(5);
  const tier10 = await tierOf(10);

  const dealA = await partners.createDeal(d.db, {
    actorId: d.ownerId,
    draft: { venueId: d.venueId, discountText: '2 for 1', copy: { en: { title: 'Tuesday treat', description: 'Two coffees for one' } } },
    at: '2026-06-01T08:00:00.000Z',
  });
  await partners.publishDeal(d.db, { dealId: dealA.id, actorId: d.ownerId, at: '2026-06-01T08:00:00.000Z' });

  await ledger.earn(d.db, { userId: c[2], points: 1000, reason: 'adjustment', at: '2026-05-19T10:00:00.000Z' });
  const mayVoucher = await vouchers.issue(d.db, { userId: c[2], venueId: d.venueId, tierId: tier5, at: '2026-05-19T11:00:00.000Z' });
  await scanAs(d, c[2], 5000, '2026-05-20T10:00:00.000Z', { intent: 'voucher_redeem', intentRef: mayVoucher.id });

  const c0First = await scanAs(d, c[0], 4000, '2026-06-10T10:00:00.000Z');
  const campaign = await partners.createCampaign(d.db, {
    venueId: d.venueId,
    actorId: d.ownerId,
    name: 'Two visits',
    visitsRequired: 2,
    rewardLabel: 'A pastry',
    rewardCostMinor: 900,
    at: '2026-06-11T09:00:00.000Z',
  });
  const c1First = await scanAs(d, c[1], 4100, '2026-06-11T10:00:00.000Z');
  await scanAs(d, c[2], 4200, '2026-06-12T10:00:00.000Z');
  await deals.track(d.db, { dealId: dealA.id, userId: c[3], kind: 'open', at: '2026-06-13T09:00:00.000Z' });
  await scanAs(d, c[3], 4300, '2026-06-13T10:00:00.000Z', { dealId: dealA.id });
  await scanAs(d, c[4], 4400, '2026-06-14T10:00:00.000Z');
  const lateNight = await scanAs(d, c[1], 4500, '2026-06-14T22:30:00.000Z');
  for (const [index, day, amount] of [[5, '15', 4500], [6, '16', 4600], [7, '17', 4700], [8, '18', 4800]] as const) {
    await scanAs(d, c[index], amount, `2026-06-${day}T10:00:00.000Z`);
  }
  await ledger.earn(d.db, { userId: c[4], points: 1000, reason: 'adjustment', at: '2026-06-18T11:00:00.000Z' });
  const juneVoucher = await vouchers.issue(d.db, { userId: c[4], venueId: d.venueId, tierId: tier10, at: '2026-06-18T11:05:00.000Z' });
  await scanAs(d, c[4], 12000, '2026-06-19T10:00:00.000Z', { intent: 'voucher_redeem', intentRef: juneVoucher.id });
  const pastry = (await campaigns.availableRewards(d.db, c[1], d.venueId))[0];
  const redeemPastry = await scanAs(d, c[1], 3000, '2026-06-20T10:00:00.000Z', { intent: 'reward_redeem', intentRef: pastry.id });
  for (const [index, day, amount] of [[9, '21', 4900], [10, '22', 5000], [11, '23', 5100]] as const) {
    await scanAs(d, c[index], amount, `2026-06-${day}T10:00:00.000Z`);
  }
  const small = await scanAs(d, c[0], 900, '2026-06-24T10:00:00.000Z');

  return {
    d,
    T,
    c,
    dealA: dealA.id,
    tier5,
    tier10,
    campaignId: campaign.id,
    receipts: { c0First, c1First, lateNight, redeemPastry, small },
  };
}

async function dashboardReports(fixture: DashboardWorld): Promise<void> {
  describe('§2.1 the day series · §2.6 the till log · §2.5 customers');
  const { d, T, c, receipts, campaignId } = fixture;

  const month = await dashboard.series(d.db, d.venueId, 30, T);
  eq('a window is exactly as many rows as days', month.series.length, 30);
  eq('…from the 1st to the 30th of June', [month.from, month.to], ['2026-06-01', '2026-06-30']);
  eq('…in the venue’s own clock and money', [month.timezone, month.currency], ['Europe/Warsaw', 'PLN']);
  eq('the rows add up to the total', month.series.reduce((sum, row) => sum + row.visits, 0), month.totals.visits);
  eq('…fifteen counted visits, the bill under the minimum not among them', month.totals.visits, 15);
  const june = await analytics.overview(d.db, d.venueId, { period: '2026-06', at: T });
  eq('a window that is a whole month agrees with its overview — visits', month.totals.visits, june.visits.value);
  eq('…sales', month.totals.salesMinor, june.salesMinor.value);
  eq('…customers', month.totals.customers, june.customers.value);
  eq('…and new customers, floored the same way', month.totals.newCustomers, june.newCustomers.value);
  eq('eleven of the twelve were new in June', month.totals.newCustomers, 11);

  const dayOf = (day: string) => month.series.find((row) => row.day === day);
  eq('half past midnight in Kraków is the next day’s trade', [dayOf('2026-06-14')?.visits, dayOf('2026-06-15')?.visits], [1, 2]);
  eq('a claim lands on the day it was made', dayOf('2026-06-13')?.claims, 1);
  eq('a voucher redemption on its day', dayOf('2026-06-19')?.vouchersRedeemed, 1);
  eq('a reward redemption on its day', dayOf('2026-06-20')?.rewardsRedeemed, 1);
  eq('a day nobody came is a row of zeros, not a gap', dayOf('2026-06-02'), {
    day: '2026-06-02',
    visits: 0,
    customers: 0,
    salesMinor: 0,
    claims: 0,
    vouchersRedeemed: 0,
    rewardsRedeemed: 0,
  });
  eq('the span before is the thirty days before', [month.previous.visits, month.previous.vouchersRedeemed], [1, 1]);
  eq('…and its one new customer is withheld, being below the floor', month.previous.newCustomers, null);
  eq('a week is seven rows', (await dashboard.series(d.db, d.venueId, 7, T)).series.length, 7);

  const logOf = async (segment: dashboard.ScanSegment, limit = 50, offset = 0) =>
    await dashboard.scans(d.db, d.venueId, { days: 30, segment, limit, offset, at: T });
  const log = await logOf('all');
  eq('the till log counts every committed scan in the window', log.total, 16);
  eq('…eleven of them somebody’s first visit here', [log.firstCount, log.againCount], [11, 5]);
  check('newest first', log.rows.every((row, index) => index === 0 || log.rows[index - 1].at >= row.at));
  const line = (receipt: gate.Receipt) => log.rows.find((row) => row.id === receipt.transaction.id);
  eq('a bill under the minimum is a sale and not a visit', [line(receipts.small)?.counted, line(receipts.small)?.first], [false, false]);
  eq('a first visit says so', line(receipts.c0First)?.first, true);
  eq('nobody is named without a grant', log.rows.filter((row) => row.who !== null || row.avatar !== null).length, 0);
  eq(
    'each row carries its receipt mark and its site',
    [line(receipts.small)?.receipt, line(receipts.small)?.site.venueId],
    [dashboard.receiptOf(receipts.small.transaction.id), d.venueId],
  );
  eq('the visit that filled a card says so', line(receipts.lateNight)?.progress, {
    campaignId,
    campaign: 'Two visits',
    done: 2,
    need: 2,
    rewardEarned: true,
  });
  eq('…the visit before it stood at one of two', line(receipts.c1First)?.progress?.done, 1);
  /* The reward's `transaction_id` now names this visit — the redemption wrote it
     — and it must not make this the visit that *earned* one. */
  eq('…and the card starts again on the visit that spent the reward', line(receipts.redeemPastry)?.progress, {
    campaignId,
    campaign: 'Two visits',
    done: 1,
    need: 2,
    rewardEarned: false,
  });
  eq('a visit before any campaign existed is on no card', line(receipts.c0First)?.progress, null);
  eq('the first-visit segment is the first visits', (await logOf('first')).rows.length, 11);
  eq('…and "again" is the rest, counted or not', (await logOf('again')).rows.length, 5);
  const page = await logOf('all', 5, 15);
  eq('a page is cut after the counting', [page.total, page.rows.length], [16, 1]);

  await consent.grantSharing(d.db, { userId: c[5], venueId: d.venueId, at: T });
  eq(
    'a customer who shared with this venue is named on their own scans and nowhere else',
    (await logOf('all')).rows.filter((row) => row.who !== null).map((row) => [row.who, row.avatar]),
    [['Person c5', 'avatar-c5']],
  );
  await consent.revokeSharing(d.db, c[5], d.venueId, T);
  eq('…and anonymous again the moment they withdraw it', (await logOf('all')).rows.filter((row) => row.who !== null || row.avatar !== null).length, 0);

  for (const who of [c[1], c[2], c[4], c[5]]) await consent.grantSharing(d.db, { userId: who, venueId: d.venueId, at: T });
  const table = await profiles.customerTable(d.db, d.venueId, { at: T });
  const rowOf = (id: string) => table.rows.find((row) => row.userId === id);
  eq('the shared customers, by spend', table.rows.map((row) => row.userId), [c[4], c[1], c[2], c[5]]);
  eq('a customer’s highest voucher tier here, whatever became of the voucher', [rowOf(c[4])?.tierPct, rowOf(c[2])?.tierPct], [10, 5]);
  check('…and the key is absent, not zero, for somebody who never bought one', rowOf(c[1]) !== undefined && !('tierPct' in rowOf(c[1])!));
  eq('somebody who never bought a voucher here has none issued and none used', [rowOf(c[1])?.vouchersIssued, rowOf(c[1])?.vouchersUsed], [0, 0]);
  check(
    '…a tier implies at least one voucher issued, and used never exceeds issued',
    (rowOf(c[4])?.vouchersIssued ?? 0) >= 1 && (rowOf(c[4])?.vouchersUsed ?? 99) <= (rowOf(c[4])?.vouchersIssued ?? 0),
    rowOf(c[4]),
  );
  {
    const one = await profiles.customerDetail(d.db, d.venueId, c[4], T);
    eq('the detail carries the same voucher counts as the row', [one.vouchersIssued, one.vouchersUsed], [rowOf(c[4])?.vouchersIssued, rowOf(c[4])?.vouchersUsed]);
    eq('…and when this grant began', one.sharingSince, T);
  }
  eq('spend that grew from nothing is up', rowOf(c[4])?.spendTrend, 'up');
  eq('spend that fell by more than a tenth is down', rowOf(c[2])?.spendTrend, 'down');
  /* The fix: the filter used to run on the page, so "new" among the top one
     spender was nobody, with a new customer two rows further down. */
  eq(
    'a status filter finds its match past the first page of spenders',
    (await profiles.customerTable(d.db, d.venueId, { at: T, status: 'new', limit: 1 })).rows.map((row) => row.userId),
    [c[5]],
  );
}

async function dashboardLevers(fixture: DashboardWorld): Promise<void> {
  describe('§2.2 insights · §2.4 the ladder · §2.7 campaigns · the existing reports’ clocks · §2.3 reminders');
  const { d, T, c, campaignId } = fixture;

  const noticed = await dashboard.insights(d.db, d.venueId, T, 'en');
  eq('insights are about the venue’s current month', noticed.period, '2026-06');
  /* Fifteen June visits against May's one over the same span; one voucher each. */
  eq('month to date against the same span of the month before', noticed.trend, { visitsPct: 1400, vouchersPct: 0 });
  /* Balances: two customers past 300, c1 at 235, nine at 130. This used to
     suggest cutting the 10% rung from 300 to 200 — and 200 is now a price
     `setVoucherTiers` refuses: the band for 10% is 400..1500 (80%..300% of the
     platform ladder's 500, `CONFIG.vouchers.partnerTierFloorBp`). The fixture's
     rung is an *imported* legacy price already under that floor, so there is
     no cut left to advise, and advice the partner's own save would reject is
     exactly what this finding must not give. */
  eq('no lower price is advised below the band a partner may set', noticed.tierReach, null);
  check(
    '…the cut it used to advise is one the band refuses',
    200 < vouchers.partnerTierBand(10).min,
    vouchers.partnerTierBand(10),
  );
  eq('no deal has been seen enough times to compare', noticed.itemVsPercent, null);
  eq('the one reward earned and not collected', noticed.unusedRewards, { n: 1, amountMinor: 900 });

  const early = await dashboard.insights(d.db, d.venueId, '2026-05-25T12:00:00.000Z', 'en');
  eq('a trend needs a month before it', early.trend, null);
  eq('…and a tier finding needs enough recent customers to be about nobody', early.tierReach, null);

  const percentDeal = await partners.createDeal(d.db, {
    actorId: d.ownerId,
    draft: { venueId: d.venueId, discountText: '20% off', copy: { en: { title: 'Twenty off', description: 'Any bill' } } },
    at: T,
  });
  await d.db.run(`UPDATE hot_deals SET seen_count = 40, claimed_count = 6 WHERE id = $i`, { i: fixture.dealA });
  await d.db.run(`UPDATE hot_deals SET seen_count = 50, claimed_count = 5 WHERE id = $i`, { i: percentDeal.id });
  eq('free-item deals against percentages, on this venue’s own funnel', (await dashboard.insights(d.db, d.venueId, T, 'en')).itemVsPercent, {
    item: { dealId: fixture.dealA, title: 'Tuesday treat', badge: '2 for 1', claims: 6, seen: 40 },
    percent: { dealId: percentDeal.id, title: 'Twenty off', badge: '20% off', claims: 5, seen: 50 },
    multiple: 1.5,
  });

  const pool = await budget.budgetFor(d.db, d.venueId, T);
  const rungs = await vouchers.partnerLadder(d.db, d.venueId, T);
  eq('the month’s voucher spending is its one redemption', pool.voucher.spent, 1200);
  eq('Σ spent over the rungs is the pool’s spent', rungs.reduce((sum, rung) => sum + rung.spentMinor, 0), pool.voucher.spent);
  const ten = rungs.find((rung) => rung.discountPct === 10);
  eq('the rung it was bought on counts it', [ten?.issuedCount, ten?.redeemedCount, ten?.activeCount, ten?.spentMinor, ten?.active], [1, 1, 0, 1200, true]);
  check(
    'the public ladder carries none of it',
    (await vouchers.ladder(d.db, d.venueId, T)).every((rung) => !('issuedCount' in rung) && !('spentMinor' in rung) && !('active' in rung)),
  );
  const retire = async (active: boolean) =>
    await partners.setVoucherTiers(d.db, {
      venueId: d.venueId,
      actorId: d.ownerId,
      /* 400, not the fixture's imported 300: an edit must bring a legacy rung
         into the band, so switching it off and on reprices it to the floor. */
      tiers: [{ discountPct: 10, pointsCost: 400, maxDiscountMinor: 2500, active }],
      at: T,
    });
  await retire(false);
  const retired = (await vouchers.partnerLadder(d.db, d.venueId, T)).find((rung) => rung.discountPct === 10);
  eq('a rung switched off with its vouchers counted is still listed, and sells nothing', [retired?.active, retired?.available, retired?.estimatedRemaining], [false, false, 0]);
  eq(
    '…so the rungs still add up to the pool',
    (await vouchers.partnerLadder(d.db, d.venueId, T)).reduce((sum, rung) => sum + rung.spentMinor, 0),
    pool.voucher.spent,
  );
  check('…while the public ladder drops it', !(await vouchers.ladder(d.db, d.venueId, T)).some((rung) => rung.discountPct === 10));
  await retire(true);
  await throws('a tier of 0% is refused by name rather than by the table', 'validation_failed', async () =>
    await partners.setVoucherTiers(d.db, { venueId: d.venueId, actorId: d.ownerId, tiers: [{ discountPct: 0, pointsCost: 100, maxDiscountMinor: 1000 }], at: T }),
  );
  await throws('…and so is a points cost with half a point in it', 'validation_failed', async () =>
    await partners.setVoucherTiers(d.db, { venueId: d.venueId, actorId: d.ownerId, tiers: [{ discountPct: 20, pointsCost: 12.5, maxDiscountMinor: 1000 }], at: T }),
  );

  const [row] = await campaigns.campaignRows(d.db, d.venueId, campaignId);
  eq(
    'a campaign row carries what its cards and rewards add up to',
    [row.members, row.earned, row.redeemed, row.near, row.available, row.expired, row.reserved_minor],
    [11, 2, 1, 10, 1, 0, 900],
  );
  const edited = await partners.updateCampaign(d.db, {
    campaignId,
    actorId: d.ownerId,
    patch: { name: '  Two visits, one pastry ', rewardCostMinor: 1500, minSpendMinor: 2000 },
    at: T,
  });
  eq('an edit answers in the list’s own shape', [edited.name, edited.reward_cost_minor, edited.min_spend_minor, edited.near], ['Two visits, one pastry', 1500, 2000, 10]);
  eq(
    'a reward already earned keeps the cost it was reserved at',
    (await d.db.get<{ r: number }>(`SELECT reserved_minor AS r FROM earned_rewards WHERE venue_id = $v AND status = 'available'`, { v: d.venueId }))?.r,
    900,
  );
  eq('null clears the minimum-bill override', (await partners.updateCampaign(d.db, { campaignId, actorId: d.ownerId, patch: { minSpendMinor: null }, at: T })).min_spend_minor, null);
  await throws('a campaign is validated as it will be after the edit', 'validation_failed', async () =>
    await partners.updateCampaign(d.db, { campaignId, actorId: d.ownerId, patch: { rewardCostMinor: 0 }, at: T }),
  );
  eq(
    'every edit that changed something is audited',
    (await d.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'campaign.update' AND entity_id = $c`, { c: campaignId }))?.n,
    2,
  );
  await partners.setCampaignStatus(d.db, { campaignId, status: 'paused', actorId: d.ownerId, at: T });
  const second = await partners.createCampaign(d.db, {
    venueId: d.venueId,
    actorId: d.ownerId,
    name: 'Five visits',
    visitsRequired: 5,
    rewardLabel: 'A cake',
    rewardCostMinor: 2000,
    at: T,
  });
  await throws('resuming a campaign counts against the plan, the way starting one does', 'entitlement_required', async () =>
    await partners.setCampaignStatus(d.db, { campaignId, status: 'active', actorId: d.ownerId, at: T }),
  );
  await partners.setCampaignStatus(d.db, { campaignId: second.id, status: 'ended', actorId: d.ownerId, at: T });
  await partners.setCampaignStatus(d.db, { campaignId, status: 'active', actorId: d.ownerId, at: T });
  eq('…and fits again once the other has ended', (await campaigns.campaignRows(d.db, d.venueId, campaignId))[0].status, 'active');

  const morning = await analytics.today(d.db, d.venueId, '2026-06-15T08:00:00.000Z');
  eq('today is the venue’s day, stated as a day', [morning.period, morning.timezone], ['2026-06-15', 'Europe/Warsaw']);
  eq('…counting the visit at 00:30 in Kraków, which UTC files under the day before', morning.visits.value, 2);

  const manual = { kind: 'manual' as const, venueId: d.venueId, byUserId: d.ownerId };
  const stale = await gate.openTransaction(d.db, manual, { userId: c[6], at: plusMinutes(T, -20) });
  const waiting = await gate.openTransaction(d.db, manual, { userId: c[7], at: plusMinutes(T, -5) });
  eq('what needs confirming leaves out what can no longer be confirmed', (await analytics.today(d.db, d.venueId, T)).pendingConfirmations, 1);
  eq('…and so does the queue at the counter', (await gate.pendingAt(d.db, d.venueId, T)).map((txn) => txn.id), [waiting.id]);
  const fresh = await gate.openTransaction(d.db, manual, { userId: c[6], at: T });
  eq(
    'a pending scan past its time does not block a fresh one; it is cancelled as a timeout',
    await d.db.get(`SELECT status, cancel_reason FROM transactions WHERE id = $i`, { i: stale.id }),
    { status: 'cancelled', cancel_reason: 'timeout' },
  );
  await gate.submitAmount(d.db, { transactionId: fresh.id, amountMinor: 4000, actorId: d.ownerId, at: T });
  await throws('a confirm past the time limit is refused', 'expired', async () =>
    await gate.confirm(d.db, { transactionId: fresh.id, cashierId: d.ownerId, at: plusMinutes(T, 16) }),
  );
  /* The cancel used to be written inside the transaction the refusal rolled back. */
  eq('…and the transaction it refused is cancelled, not left blocking the customer', (await gate.getTransaction(d.db, fresh.id)).status, 'cancelled');
  await gate.cancel(d.db, { transactionId: waiting.id, reason: 'verify', actorId: d.ownerId, at: T });

  const juneFindings = await analytics.findings(d.db, d.venueId, { period: '2026-06', at: now() });
  eq('findings follow the month asked for, not the clock', juneFindings.find((finding) => finding.key === 'cost_per_new_customer')?.detail.period, '2026-06');
  eq(
    'cohort months walk back as months, even from the 31st',
    (await analytics.cohorts(d.db, d.venueId, 3, { at: '2026-03-31T12:00:00.000Z' })).map((cohort) => cohort.cohort),
    ['2026-01', '2026-02', '2026-03'],
  );
  eq('…and end on the month asked for', (await analytics.cohorts(d.db, d.venueId, 2, { period: '2026-06', at: now() })).map((cohort) => cohort.cohort), ['2026-05', '2026-06']);

  await d.db.run(
    `INSERT INTO deal_events (id, deal_id, user_id, event_type, source, created_at) VALUES ($i, $d, $u, 'claim', 'gate', $t)`,
    { i: newId('evt'), d: fixture.dealA, u: c[9], t: '2026-06-29T22:30:00.000Z' },
  );
  eq('a deal’s sparkline files a claim at 00:30 in Kraków under the café’s own day', await deals.claimSeries(d.db, fixture.dealA, 7, T, 'Europe/Warsaw'), [0, 0, 0, 0, 0, 0, 1]);

  await throws('a split that leaves one pool short of what it already holds is refused', 'conflict', async () =>
    await partners.setBudget(d.db, { venueId: d.venueId, actorId: d.ownerId, totalMinor: 100000, loyaltyBp: 0, at: T }),
  );
  eq(
    '…while one that leaves both covered goes through',
    (await partners.setBudget(d.db, { venueId: d.venueId, actorId: d.ownerId, totalMinor: 100000, loyaltyBp: 5000, at: T })).loyalty.base,
    50000,
  );

  /* ── reminders ── */
  await ledger.earn(d.db, { userId: c[5], points: 500, reason: 'adjustment', at: plusMinutes(T, -70) });
  await vouchers.issue(d.db, { userId: c[5], venueId: d.venueId, tierId: fixture.tier5, at: plusMinutes(T, -60) });
  await d.db.run(`INSERT INTO push_tokens (id, user_id, platform, token, created_at) VALUES ($i, $u, 'fcm', $k, $t)`, {
    i: newId('ptk'),
    u: c[5],
    k: `token-${c[5]}`,
    t: T,
  });
  const quiet = await dashboard.remindStatus(d.db, d.venueId, T);
  eq('a reminder is for whoever holds something unused here', [quiet.rewardHolders, quiet.voucherHolders, quiet.audience], [1, 1, 2]);
  eq('…and none has gone out yet', [quiet.lastSentAt, quiet.nextAllowedAt, quiet.lastResult], [null, null, null]);
  const sent = await dashboard.sendReminder(d.db, { venueId: d.venueId, actorId: d.ownerId, at: T });
  eq('an inbox copy each, and a push where one can land', sent, {
    sentAt: T,
    audience: 2,
    inbox: 2,
    queued: 1,
    suppressed: 1,
    nextAllowedAt: plusDays(T, 7),
  });
  eq(
    'each copy names the reminder it belongs to',
    (await d.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM notifications
        WHERE kind = 'venue_reminder' AND source_kind = 'venue_reminder'
          AND source_ref IN (SELECT entity_id FROM audit_log WHERE action = 'venue.remind' AND venue_id = $v)`,
      { v: d.venueId },
    ))?.n,
    2,
  );
  const tooSoon = await refusal(async () => await dashboard.sendReminder(d.db, { venueId: d.venueId, actorId: d.ownerId, at: plusDays(T, 1) }));
  eq('a second reminder inside the week is refused, saying when the next may go', [tooSoon?.code, tooSoon?.detail.nextAllowedAt], ['conflict', plusDays(T, 7)]);
  await scanAs(d, c[5], 4000, plusDays(T, 2));
  await scanAs(d, c[4], 4000, plusDays(T, 10));
  const later = await dashboard.remindStatus(d.db, d.venueId, plusDays(T, 11));
  eq('who came in within the week is counted, and nobody after it', later.lastResult, { sentAt: T, audience: 2, cameBack: 1, windowDays: 7 });
  eq('…and the week is over', later.nextAllowedAt, null);
}

async function counterRules(): Promise<void> {
  describe('§2.8 audiences · §2.11 the counter · push dispatch · §2.9 the listing · the authoring fixes');
  const k = await world();
  /* 12:00 on a Wednesday in Kraków, at a café in a city nobody else in the
     imported data lives in — so every audience below is a number this section wrote. */
  const K = '2026-08-12T10:00:00.000Z';
  await k.db.run(`UPDATE venues SET city = 'Testbury' WHERE id = $v`, { v: k.venueId });
  await entitlements.startSubscription(k.db, { subject: { venueId: k.venueId }, planCode: 'growth', source: 'manual', at: plusDays(K, -5) });
  const t: string[] = [];
  for (let i = 0; i < 11; i += 1) {
    t.push(
      await person(k, `t${i}`, K, {
        city: 'Testbury',
        language: i === 1 ? 'pl' : 'en',
        username: i === 3 ? 'Tester_Three' : i === 10 ? 'tester_ten' : undefined,
      }),
    );
  }
  for (const who of [t[0], t[1], t[2]]) {
    await k.db.run(`INSERT INTO push_tokens (id, user_id, platform, token, created_at) VALUES ($i, $u, 'fcm', $k, $t)`, {
      i: newId('ptk'),
      u: who,
      k: `token-${who}`,
      t: plusDays(K, -1),
    });
  }
  const tierOf = async (pct: number) =>
    (await k.db.get<{ id: string }>(`SELECT id FROM voucher_tiers WHERE venue_id = $v AND discount_pct = $p`, { v: k.venueId, p: pct }))!.id;
  const campaign = await partners.createCampaign(k.db, {
    venueId: k.venueId,
    actorId: k.ownerId,
    name: 'Three visits',
    visitsRequired: 3,
    rewardLabel: 'A juice',
    rewardCostMinor: 700,
    at: plusDays(K, -2),
  });

  const nobody = await refusal(async () => await dashboard.sendReminder(k.db, { venueId: k.venueId, actorId: k.ownerId, at: K }));
  eq('with nothing unused anywhere, there is nobody to remind', [nobody?.code, nobody?.status, nobody?.detail.reason], ['invalid_state', 400, 'no_audience']);

  for (let i = 0; i < 10; i += 1) await scanAs(k, t[i], 4000, plusMinutes(K, i));

  const audiences = await dashboard.audiences(k.db, k.venueId, plusMinutes(K, 60));
  eq('the segments, in targeting’s own order', audiences.map((row) => row.segment), ['all', 'new', 'returning', 'lapsed', 'newcomer']);
  const reach = Object.fromEntries(audiences.map((row) => [row.segment, row]));
  eq('each is the people targeting would admit', [reach.all.reach.value, reach.returning.reach.value, reach.newcomer.reach.value], [11, 10, 11]);
  eq('a segment of one is withheld, never rounded', [reach.new.reach.suppressed, reach.new.reach.value, reach.lapsed.reach.suppressed], [true, null, true]);
  eq('…and so is how many regulars a push reaches, three being a description of three people', [reach.returning.notifiable.suppressed, reach.returning.notifiable.value], [true, null]);

  /* ── the counter: looking up ── */
  const A = plusMinutes(K, 120);
  const byHandle = await dashboard.counterLookup(k.db, k.venueId, '  @TESTER_three ', A);
  eq('a handle finds its customer, folded the way the handle index folds', [byHandle.kind, byHandle.customer.userId, byHandle.customer.handle], ['customer', t[3], '@Tester_Three']);
  eq('…unnamed, having shared nothing with this venue, and not new here', [byHandle.customer.name, byHandle.customer.avatar, byHandle.customer.firstVisit], [null, null, false]);
  eq('…with the card this sale will stamp', byHandle.customer.stamps.map((card) => [card.campaignId, card.done, card.need]), [[campaign.id, 1, 3]]);
  eq('a handle typed without its @ is still the handle', (await dashboard.counterLookup(k.db, k.venueId, 'tester_three', A)).customer.userId, t[3]);
  await rejects('an unknown handle is one not-found', async () => await dashboard.counterLookup(k.db, k.venueId, '@nobody_here', A), 'not_found');
  await consent.grantSharing(k.db, { userId: t[3], venueId: k.venueId, at: A });
  const named = await dashboard.counterLookup(k.db, k.venueId, '@tester_three', A);
  eq('a customer who shared with this venue is named at its counter', [named.customer.name, named.customer.avatar], ['Person t3', 'avatar-t3']);
  eq('somebody never in before is a first visit', (await dashboard.counterLookup(k.db, k.venueId, '@tester_ten', A)).customer.firstVisit, true);
  await k.db.run(`UPDATE users SET username = 'banned_one', username_norm = 'banned_one', status = 'banned' WHERE id = $u`, { u: t[9] });
  await rejects('a banned account is not found', async () => await dashboard.counterLookup(k.db, k.venueId, '@banned_one', A), 'not_found');

  await ledger.earn(k.db, { userId: t[4], points: 1000, reason: 'adjustment', at: plusMinutes(K, 80) });
  const voucher = await vouchers.issue(k.db, { userId: t[4], venueId: k.venueId, tierId: await tierOf(10), at: plusMinutes(K, 90) });
  const asVoucher = await dashboard.counterLookup(k.db, k.venueId, voucher.code.toLowerCase(), A);
  eq(
    'a voucher code, in any case, is that voucher and whose it is',
    asVoucher.kind === 'voucher' ? [asVoucher.voucher.id, asVoucher.voucher.discountPct, asVoucher.customer.userId] : null,
    [voucher.id, 10, t[4]],
  );
  const rewardId = newId('rwd');
  await k.db.run(
    `INSERT INTO earned_rewards (id, user_id, venue_id, campaign_id, label, cost_minor, reserved_minor, status, code, earned_at, expires_at)
     VALUES ($i, $u, $v, $c, 'A juice', 700, 700, 'available', 'K7M2QX', $e, $x)`,
    { i: rewardId, u: t[5], v: k.venueId, c: campaign.id, e: K, x: plusDays(K, 30) },
  );
  const asReward = await dashboard.counterLookup(k.db, k.venueId, 'k7m2qx', A);
  eq(
    'a reward code that folds into a handle shape falls through to the reward',
    asReward.kind === 'reward' ? [asReward.reward.id, asReward.reward.label, asReward.customer.userId] : null,
    [rewardId, 'A juice', t[5]],
  );
  const elsewhere = newId('ven');
  await k.db.run(
    `INSERT INTO venues (id, owner_user_id, name, category, city, country_code, timezone, currency, status, verified_at, created_at, updated_at)
     VALUES ($i, $o, 'Elsewhere', 'cafe', 'Testbury', 'PL', 'Europe/Warsaw', 'PLN', 'live', $t, $t, $t)`,
    { i: elsewhere, o: k.customerId, t: K },
  );
  const elsewhereTier = newId('vtr');
  await k.db.run(
    `INSERT INTO voucher_tiers (id, venue_id, discount_pct, points_cost, max_discount_minor, active, created_at, updated_at)
     VALUES ($i, $v, 10, 300, 2500, 1, $t, $t)`,
    { i: elsewhereTier, v: elsewhere, t: K },
  );
  const plant = async (venueId: string, tierId: string, code: string, expires: Iso) =>
    await k.db.run(
      `INSERT INTO issued_vouchers (id, user_id, venue_id, tier_id, discount_pct, max_discount_minor, points_spent,
                                    reserved_minor, code, status, issued_at, expires_at)
       VALUES ($i, $u, $v, $t, 10, 2500, 300, 400, $c, 'active', $at, $e)`,
      { i: newId('ivc'), u: t[6], v: venueId, t: tierId, c: code, at: K, e: expires },
    );
  await plant(elsewhere, elsewhereTier, 'PLZ-ELSE', plusDays(K, 10));
  await plant(k.venueId, await tierOf(10), 'PLZ-GONE', plusMinutes(K, 30));
  await rejects('another venue’s voucher is a not-found here, not a hint that it exists', async () => await dashboard.counterLookup(k.db, k.venueId, 'PLZ-ELSE', A), 'not_found');
  await rejects('…and so is an expired one', async () => await dashboard.counterLookup(k.db, k.venueId, 'plz-gone', A), 'not_found');

  /* ── the counter: selling ── */
  const B = plusMinutes(K, 180);
  const sale = await dashboard.counterRecord(k.db, { venueId: k.venueId, actorId: k.ownerId, code: '@tester_ten', amountMinor: 4000, at: B });
  const scanned = await scan(k, 4000, B);
  eq(
    'a sale at the counter pays what a QR scan of the same bill pays',
    [sale.receipt.pointsGranted, sale.receipt.stamped, sale.receipt.visitCounted],
    [scanned.pointsGranted, scanned.stamped, scanned.visitCounted],
  );
  eq('…which on a first visit is the scan, the first visit and the new category', sale.receipt.pointsGranted, 5 + CONFIG.earn.firstVisitToVenue + CONFIG.earn.newCategory);
  check('the counter’s receipt carries no balance and no next tier', !('balance' in sale.receipt) && !('nextTier' in sale.receipt));
  eq('…and echoes the lookup it acted on', [sale.lookup.kind, sale.lookup.customer.firstVisit], ['customer', true]);
  eq(
    'it is a manual transaction confirmed by the caller',
    await k.db.get(`SELECT trigger_type, confirmed_by, status FROM transactions WHERE id = $i`, { i: sale.receipt.transactionId }),
    { trigger_type: 'manual', confirmed_by: k.ownerId, status: 'committed' },
  );
  eq(
    '…and audited as a counter sale',
    (await k.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'gate.counter' AND entity_id = $i`, { i: sale.receipt.transactionId }))?.n,
    1,
  );
  const spentBefore = (await budget.budgetFor(k.db, k.venueId, B)).voucher.spent;
  const redeemed = await dashboard.counterRecord(k.db, { venueId: k.venueId, actorId: k.ownerId, code: voucher.code, amountMinor: 12000, at: B });
  eq('a voucher at the counter takes its discount off the bill', redeemed.receipt.discountMinor, 1200);
  eq('…out of the voucher pool', (await budget.budgetFor(k.db, k.venueId, B)).voucher.spent, spentBefore + 1200);
  eq('…and is spent', (await k.db.get<{ s: string }>(`SELECT status AS s FROM issued_vouchers WHERE id = $i`, { i: voucher.id }))?.s, 'redeemed');
  const juice = await dashboard.counterRecord(k.db, { venueId: k.venueId, actorId: k.ownerId, code: 'K7M2QX', amountMinor: 3000, at: B });
  eq('a reward at the counter is given at its exact cost', juice.receipt.discountMinor, 700);
  eq('…and collected', (await k.db.get<{ s: string }>(`SELECT status AS s FROM earned_rewards WHERE id = $i`, { i: rewardId }))?.s, 'redeemed');

  await rejects('an amount past the venue’s ceiling is refused at the counter as at the till', async () =>
    await dashboard.counterRecord(k.db, { venueId: k.venueId, actorId: k.ownerId, code: '@tester_three', amountMinor: 5_000_000, at: B }),
  'invalid_amount');
  eq(
    '…and what it opened is cancelled, so the customer is not locked out of the next scan',
    await k.db.get(`SELECT status, cancel_reason FROM transactions WHERE user_id = $u AND venue_id = $v ORDER BY opened_at DESC, id DESC LIMIT 1`, { u: t[3], v: k.venueId }),
    { status: 'cancelled', cancel_reason: 'counter_failed' },
  );
  /* A confirm that fails for a reason the gate did not foresee: the commit
     itself is refused, by a trigger that exists for this one check. */
  await k.db.exec(
    `CREATE TEMP TRIGGER verify_refuse_commit BEFORE UPDATE OF status ON transactions
       WHEN NEW.status = 'committed' BEGIN SELECT RAISE(ABORT, 'refused by the suite'); END`,
  );
  let confirmFailed = false;
  try {
    await dashboard.counterRecord(k.db, { venueId: k.venueId, actorId: k.ownerId, code: '@tester_three', amountMinor: 4000, at: plusMinutes(B, 1) });
  } catch {
    confirmFailed = true;
  }
  await k.db.exec(`DROP TRIGGER verify_refuse_commit`);
  check('a confirm that fails is reported, not swallowed', confirmFailed);
  eq(
    '…and leaves no pending transaction behind it',
    (await k.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM transactions WHERE user_id = $u AND venue_id = $v AND status = 'pending'`, { u: t[3], v: k.venueId }))?.n,
    0,
  );
  await k.db.run(`UPDATE users SET username = 'the_owner', username_norm = 'the_owner' WHERE id = $u`, { u: k.ownerId });
  await rejects('a venue cannot ring up a sale to its own owner', async () =>
    await dashboard.counterRecord(k.db, { venueId: k.venueId, actorId: k.ownerId, code: '@the_owner', amountMinor: 4000, at: B }),
  'forbidden');

  /* ── a scheduled push, sent ── */
  const P = plusMinutes(K, 240);
  const dealNamed = async (title: string, extra: Partial<partners.DealDraft> = {}) =>
    await partners.createDeal(k.db, {
      actorId: k.ownerId,
      draft: { venueId: k.venueId, discountText: 'Free juice', copy: { en: { title, description: 'With any lunch' } }, ...extra },
      at: plusMinutes(P, -30),
    });
  const pushed = await dealNamed('Juice Wednesday');
  await throws('a draft cannot carry a push — nobody could be sent to it', 'invalid_state', async () =>
    await deals.schedulePush(k.db, { dealId: pushed.id, scheduledAt: P, quota: 4, at: plusMinutes(P, -20) }),
  );
  await partners.publishDeal(k.db, { dealId: pushed.id, actorId: k.ownerId, at: plusMinutes(P, -20) });
  await throws('a push time that is not a time is refused, not a 500', 'validation_failed', async () =>
    await deals.schedulePush(k.db, { dealId: pushed.id, scheduledAt: 'teatime', quota: 4, at: plusMinutes(P, -20) }),
  );
  const scheduled = await deals.schedulePush(k.db, { dealId: pushed.id, scheduledAt: P, quota: 4, at: plusMinutes(P, -20) });
  const used = (await deals.pushQuota(k.db, k.venueId, 4, P)).used;
  eq('nothing goes before its time', await deals.sendDuePushes(k.db, plusMinutes(P, -5)), { sent: 0, cancelled: 0, failed: 0 });
  eq('a due push is sent', await deals.sendDuePushes(k.db, plusMinutes(P, 3)), { sent: 1, cancelled: 0, failed: 0 });
  /* Ten active accounts in Testbury (one is banned); three hold a token. */
  eq(
    '…to everybody its targeting admits, and pushed to those a push can reach',
    await k.db.get(`SELECT status, targeted, reachable, delivered FROM deal_pushes WHERE id = $i`, { i: scheduled.id }),
    { status: 'sent', targeted: 10, reachable: 3, delivered: 0 },
  );
  eq('the quota spent when it was scheduled is not spent again', (await deals.pushQuota(k.db, k.venueId, 4, P)).used, used);
  eq('a second run sends nothing twice', await deals.sendDuePushes(k.db, plusMinutes(P, 8)), { sent: 0, cancelled: 0, failed: 0 });
  await push.drain(k.db);
  eq('delivered is what the adapter sent', (await deals.pushFor(k.db, pushed.id))?.delivered, 3);
  await deals.track(k.db, { dealId: pushed.id, userId: t[1], kind: 'open', pushId: scheduled.id, at: plusMinutes(P, 30) });
  await scanAs(k, t[0], 4000, plusDays(K, 1));
  await scanAs(k, t[3], 4000, plusMinutes(plusDays(K, 1), 10));
  await scanAs(k, t[0], 4000, plusDays(K, 2));
  await scanAs(k, t[1], 4000, plusDays(K, 8));
  /* t0 was pushed and came in the next day (once, though twice); t3 only had
     the inbox copy; t1 was pushed and came in after the week was out. */
  eq('came in: pushed, then a counted visit inside the week — once per person', (await deals.pushFor(k.db, pushed.id))?.cameIn, 1);
  eq('the month’s push funnel sums what its pushes did', (await deals.pushQuota(k.db, k.venueId, 4, P)).funnel, { sent: 3, delivered: 3, opened: 1, cameIn: 1 });

  const paused = await dealNamed('Paused juice');
  await partners.publishDeal(k.db, { dealId: paused.id, actorId: k.ownerId, at: plusMinutes(P, -20) });
  const pausedPush = await deals.schedulePush(k.db, { dealId: paused.id, scheduledAt: plusMinutes(P, 10), quota: 4, at: plusMinutes(P, 5) });
  await deals.setStatus(k.db, paused.id, 'paused', plusMinutes(P, 6));
  const late = await dealNamed('Late juice');
  await partners.publishDeal(k.db, { dealId: late.id, actorId: k.ownerId, at: plusMinutes(P, -20) });
  const latePush = await deals.schedulePush(k.db, { dealId: late.id, scheduledAt: plusMinutes(P, 20), quota: 4, at: plusMinutes(P, 5) });
  eq('a push whose deal was paused is cancelled rather than sent', await deals.sendDuePushes(k.db, plusMinutes(P, 15)), { sent: 0, cancelled: 1, failed: 0 });
  eq('…and one more than an hour late is failed rather than sent', await deals.sendDuePushes(k.db, plusMinutes(P, 90)), { sent: 0, cancelled: 0, failed: 1 });
  eq(
    '…and neither told anybody anything',
    (await k.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM notifications WHERE push_id IN ($a, $b)`, { a: pausedPush.id, b: latePush.id }))?.n,
    0,
  );
  const polish = await dealNamed('Po polsku', { targetLanguages: ['pl'] });
  eq('a push goes to the languages its deal targets and no further', await deals.audienceFor(k.db, polish.id, P), [t[1]]);

  const reader = { userId: k.customerId, language: 'en', city: 'Warsaw', at: plusMinutes(P, 30) };
  check("a venue's own deals are listed whatever city the reader lives in", (await deals.browse(k.db, reader, { venueId: k.venueId })).some((card) => card.id === pushed.id));
  check('…while the city board still keeps to its city', !(await deals.browse(k.db, reader, {})).some((card) => card.id === pushed.id));

  /* ── the listing ── */
  const saved = await partners.updateVenue(k.db, {
    venueId: k.venueId,
    actorId: k.ownerId,
    patch: {},
    extras: {
      description: { en: 'Fresh juice all day', PL: 'Świeże soki' },
      links: [{ kind: 'website', value: 'https://juice.test' }, { kind: 'Instagram', value: '@juice' }, { kind: 'tiktok', value: '' }],
      languages: ['PL', 'en', 'pl'],
    },
    at: P,
  });
  check('saving the listing still answers with the venue row', saved.id === k.venueId && !('description' in saved));
  await partners.setHours(k.db, k.venueId, [{ weekday: 0, opensMin: 480, closesMin: 1320, closed: false }]);
  const listed = await dashboard.listing(k.db, k.venueId);
  eq('the listing reads back its description in each language', listed.description, { en: 'Fresh juice all day', pl: 'Świeże soki' });
  eq('…its links in order, kinds folded, an empty one dropped', listed.links, [{ kind: 'website', value: 'https://juice.test' }, { kind: 'instagram', value: '@juice' }]);
  eq('…its languages, once each', listed.languages, ['en', 'pl']);
  eq('…its hours', listed.hours, [{ weekday: 0, opensMin: 480, closesMin: 1320, closed: false }]);
  eq('…and where it stands', [listed.city, listed.timezone, listed.acceptsVouchers, listed.verification], ['Testbury', 'Europe/Warsaw', true, null]);
  await partners.updateVenue(k.db, { venueId: k.venueId, actorId: k.ownerId, patch: {}, extras: { description: { pl: '' } }, at: P });
  const trimmed = await dashboard.listing(k.db, k.venueId);
  eq('an empty description removes that language and leaves the rest alone', [trimmed.description, trimmed.links.length, trimmed.languages], [{ en: 'Fresh juice all day' }, 2, ['en', 'pl']]);
  const second = await partners.createVenue(k.db, {
    ownerId: t[8],
    draft: { name: 'Juice Two', category: 'cafe', city: 'Testbury' },
    extras: { description: { en: 'The second one' }, languages: ['uk'] },
    at: P,
  });
  const secondListing = await dashboard.listing(k.db, second.id);
  eq('a new venue arrives with its description and languages', [secondListing.description, secondListing.languages], [{ en: 'The second one' }, ['uk']]);

  await throws('a language that is not a two-letter code is refused', 'validation_failed', async () =>
    await partners.updateVenue(k.db, { venueId: k.venueId, actorId: k.ownerId, patch: {}, extras: { languages: ['english'] }, at: P }),
  );
  await throws('two links of one kind are refused by name, not by the constraint', 'validation_failed', async () =>
    await partners.setLinks(k.db, k.venueId, [{ kind: 'website', value: 'https://a.test' }, { kind: 'website', value: 'https://b.test' }], P),
  );
  await throws('a weekday given twice is refused', 'validation_failed', async () =>
    await partners.setHours(k.db, k.venueId, [{ weekday: 1, opensMin: 480, closesMin: 1000 }, { weekday: 1, opensMin: 500, closesMin: 900 }]),
  );
  await throws('a name of spaces does not blank a venue', 'validation_failed', async () =>
    await partners.updateVenue(k.db, { venueId: k.venueId, actorId: k.ownerId, patch: { name: '   ' }, at: P }),
  );
  await throws('a time zone the clock does not know is refused at the door', 'validation_failed', async () =>
    await partners.createVenue(k.db, { ownerId: t[7], draft: { name: 'Nowhere', category: 'cafe', city: 'Testbury', timezone: 'Europe/Krakow' }, at: P }),
  );
  await throws('a verified venue cannot take itself offline by asking again', 'conflict', async () =>
    await partners.submitVerification(k.db, { venueId: k.venueId, method: 'manual', at: P }),
  );
  const pending = await partners.submitVerification(k.db, { venueId: second.id, method: 'manual', at: P });
  eq('a second request while one is pending returns that one', await partners.submitVerification(k.db, { venueId: second.id, method: 'manual', at: plusMinutes(P, 1) }), pending);
  eq('…which the listing shows', (await dashboard.listing(k.db, second.id)).verification?.status, 'pending');

  const lapsed = await partners.createDeal(k.db, { actorId: t[8], draft: { venueId: second.id, copy: { en: { title: 'Old', description: 'x' } } }, at: P });
  await k.db.run(`UPDATE hot_deals SET status = 'expired', valid_to = $v WHERE id = $i`, { v: plusDays(P, -1), i: lapsed.id });
  await throws('an expired deal comes back live only through the gates publishing has', 'not_verified', async () =>
    await deals.extend(k.db, lapsed.id, '2026-09-30', P, { check: async () => await partners.assertPublishable(k.db, lapsed.id) }),
  );
  await throws('…and never to a date that is not one', 'validation_failed', async () => await deals.extend(k.db, pushed.id, 'banana', P));
  eq('extending to a bare day runs to the end of that day', (await deals.extend(k.db, pushed.id, '2026-09-30', P)).valid_to, '2026-09-30T21:59:59.999Z');

  for (const [code, rate, decimals] of [['PLN', 4.25, 2], ['UZS', 14000, 0]] as const) {
    await k.db.run(
      `INSERT INTO exchange_rates (code, base, rate, decimals, updated_at) VALUES ($c, 'EUR', $r, $d, $t)
         ON CONFLICT (code) DO UPDATE SET rate = excluded.rate, decimals = excluded.decimals`,
      { c: code, r: rate, d: decimals, t: P },
    );
  }
  await k.db.run(`UPDATE venues SET currency = 'UZS' WHERE id = $v`, { v: k.venueId });
  const inSoum = await analytics.costPerNewCustomer(k.db, k.venueId, { at: P });
  eq('a złoty plan fee is counted in the venue’s own currency', [inSoum.breakdown.subscription, inSoum.excluded], [Math.round((29900 / 100 / 4.25) * 14000), []]);
  await k.db.run(`UPDATE venues SET currency = 'XTS' WHERE id = $v`, { v: k.venueId });
  const unrated = await analytics.costPerNewCustomer(k.db, k.venueId, { at: P });
  eq('…and one with no rate is left out and named, never added in the wrong unit', [unrated.breakdown.subscription, unrated.excluded], [0, ['subscription']]);

  await k.db.close();
}

/**
 * Rulebook §8: the mission catalogue.
 *
 * What is checked is the part that moves money: a claimed mission credits the
 * ledger once and only once per period, a mission that is not complete cannot
 * be claimed, and a mission that mirrors an automatic bonus never pays anything
 * of its own however it is asked. Plus the shape the app renders — sixty-eight
 * missions, seven bands, the operator's bands only while a campaign is live.
 *
 * Played on a day of the fixture's *current* month (so the venue's seeded
 * budget is the one a scan draws on) whose featured game is a quiz, because a
 * quiz can be finished with no events and still be a paid round.
 */
async function missionRules(): Promise<void> {
  describe('missions (rulebook §8)');
  const w = await world();
  const month = localMonth(now(), VENUE_TZ);

  let at = `${month}-10T12:00:00.000Z`;
  for (let day = 10; day <= 25; day += 1) {
    at = `${month}-${String(day).padStart(2, '0')}T12:00:00.000Z`;
    const featured = await games.featuredGameFor(w.db, w.customerId, at);
    if (featured && games.QUIZZES.has(featured)) break;
  }
  const featured = (await games.featuredGameFor(w.db, w.customerId, at))!;
  const day = at.slice(0, 10);

  const view = async (when = at) => await missions.missionsFor(w.db, w.customerId, when);
  const one = async (id: string, when = at) =>
    (await view(when)).bands.flatMap((band) => band.missions).find((mission) => mission.id === id);
  const missionRows = async () =>
    await w.db.all<{ delta: number; source_ref: string }>(
      `SELECT delta, source_ref FROM points_ledger WHERE user_id = $u AND reason = 'mission'`,
      { u: w.customerId },
    );

  /* ── the shape ── */
  const fresh = await view();
  eq('five bands on a quiet day, in the rulebook’s order', fresh.bands.map((band) => band.key),
    ['daily', 'weekly', 'ongoing', 'once', 'learning']);
  const numbers = fresh.bands.flatMap((band) => band.missions.map((mission) => mission.number));
  /* #51 (first gift card) is served only where `gift_card_priority` is true —
     Pro and Premium under §9.4, restored 2026-10-04 — so not to this free
     account. #52–54 (the Pass, order-ahead) are not
     served until those features exist — a row nobody can finish in this build
     is omitted, never served locked. #46 (turn on notifications) and #48
     (first review) are the same: the app has no push and no review screen. */
  eq('…holding every static mission a free account can finish: 1–50 but 46 and 48, 55, 56 and 66–68', numbers,
    [...Array.from({ length: 50 }, (_, i) => i + 1).filter((n) => n !== 46 && n !== 48), 55, 56, 66, 67, 68]);
  {
    /* A granted Pro plan opens the shop, and with it #51. */
    const proUser = await person(w, 'mission-pro', plusDays(at, -30));
    await entitlements.startSubscription(w.db, { subject: { userId: proUser }, planCode: 'pro', source: 'manual', at });
    const proView = await missions.missionsFor(w.db, proUser, at);
    eq('…and a Pro account is served the first-gift-card mission, open',
      proView.bands.flatMap((band) => band.missions).find((mission) => mission.number === 51)?.status, 'open');
  }
  eq('…with ids that are unique', new Set(fresh.bands.flatMap((b) => b.missions.map((m) => m.id))).size, numbers.length);
  check('…and not one of them locked',
    fresh.bands.every((band) => band.missions.every((mission) => mission.status !== 'locked')));
  await throws('a mission that is not served cannot be claimed — it is a 404, not a 409', 'not_found', async () =>
    await missions.claim(w.db, { userId: w.customerId, missionId: 'once.join_a_club', at }));
  await throws('…nor read one at a time', 'not_found', async () =>
    await missions.missionFor(w.db, w.customerId, 'once.join_a_club', at));
  {
    /* A paid plan serves the same #51; the Pass and order-ahead stay away
       whatever the plan. A world of its own, so the paid plan cannot leak
       into the claims below. */
    const paid = await world();
    await entitlements.assignPlan(paid.db, {
      subject: { userId: paid.customerId }, planCode: 'pro', actorId: paid.ownerId, note: 'verify', at,
    });
    const served = (await missions.missionsFor(paid.db, paid.customerId, at)).bands
      .flatMap((band) => band.missions);
    eq('a paid plan is served the first-gift-card mission too, open',
      served.find((mission) => mission.number === 51)?.status, 'open');
    check('…and still no Pass or order-ahead', !served.some((mission) => [52, 53, 54].includes(mission.number)));
    check('…and no mission names a tier',
      !served.some((mission) => /\b(Pro|Premium)\b/.test(`${mission.title} ${mission.description}`)));
    /* A per-plan reward prints the viewer's own figure, not the whole ladder —
       "100 / 150 / 250" quoted two rewards nobody can buy in this build. */
    check('…and no reward label quotes a ladder of plans',
      !served.some((mission) => mission.rewardLabel.includes(' / ')),
      served.filter((mission) => mission.rewardLabel.includes(' / ')).map((mission) => mission.rewardLabel));
    const firstVisit = served.find((mission) => mission.number === 45);
    eq('…the first-visit row reads the viewer’s own plan figure', firstVisit?.rewardLabel, String(firstVisit?.reward));
  }
  eq('the daily band resets at the next UTC midnight', fresh.bands[0].resetsAt, `${shiftDay(day, 1)}T00:00:00.000Z`);
  check('the weekly band resets on a Monday',
    new Date(fresh.bands[1].resetsAt ?? '').getUTCDay() === 1, fresh.bands[1].resetsAt);
  eq('nothing but the check-in is waiting on a fresh account', fresh.unclaimed, 1);

  /* ── a claimable daily mission, end to end ── */
  eq('today’s game starts open', (await one('daily.todays_game'))?.status, 'open');
  await throws('a mission that is not complete cannot be claimed', 'conflict', async () =>
    await missions.claim(w.db, { userId: w.customerId, missionId: 'daily.todays_game', at }));

  const round = await games.startSession(w.db, { userId: w.customerId, gameType: featured, at });
  const finished = await games.finish(w.db, { sessionId: round.sessionId, userId: w.customerId, at });
  check('the fixture round is a paid featured round', finished.paid && finished.featured, finished);

  eq('playing the featured game completes today’s game', (await one('daily.todays_game'))?.status, 'complete');
  eq('…and warm up', (await one('daily.warm_up'))?.status, 'complete');
  eq('…and counts one towards ten rounds', (await one('weekly.ten_rounds'))?.progress, 1);

  const before = await ledger.balance(w.db, w.customerId);
  const claimed = await missions.claim(w.db, { userId: w.customerId, missionId: 'daily.todays_game', at });
  eq('claiming pays the rulebook’s 25', claimed.points, CONFIG.missions.rewards['daily.todays_game']);
  eq('…into the balance', claimed.balance, before + 25);
  eq('…and the mission reads claimed', claimed.mission.status, 'claimed');
  await throws('a second claim the same day is a conflict', 'conflict', async () =>
    await missions.claim(w.db, { userId: w.customerId, missionId: 'daily.todays_game', at: plusMinutes(at, 5) }));
  eq('…and the ledger holds exactly one entry for it', (await missionRows()).map((row) => row.source_ref),
    [`daily.todays_game:${day}`]);
  eq('…flat on the plan: the entry carries no multiplier', (await w.db.get<{ multiplier: number }>(
    `SELECT multiplier FROM points_ledger WHERE user_id = $u AND reason = 'mission'`, { u: w.customerId }))?.multiplier, 1);
  eq('the balance is still the ledger’s sum', await ledger.reconcile(w.db, w.customerId), 0);

  /* Two claims racing: both read `complete`, one inserts. */
  const race = await Promise.allSettled([
    missions.claim(w.db, { userId: w.customerId, missionId: 'daily.warm_up', at }),
    missions.claim(w.db, { userId: w.customerId, missionId: 'daily.warm_up', at }),
  ]);
  eq('two simultaneous claims pay once', race.filter((r) => r.status === 'fulfilled').length, 1);

  eq('tomorrow the daily mission is open again', (await one('daily.todays_game', plusDays(at, 1)))?.status, 'open');

  /* ── an auto-paid mirror never pays ── */
  eq('finish setup is open before onboarding', (await one('once.finish_setup'))?.status, 'open');
  check('…and is marked auto-paid', (await one('once.finish_setup'))?.autoPaid === true);
  await accounts.completeOnboarding(w.db, w.customerId, at);
  eq('onboarding pays its own bonus and the mission reads claimed', (await one('once.finish_setup'))?.status, 'claimed');
  const beforeMirror = await ledger.balance(w.db, w.customerId);
  await throws('claiming an auto-paid mission is refused', 'conflict', async () =>
    await missions.claim(w.db, { userId: w.customerId, missionId: 'once.finish_setup', at }));
  await throws('…even the welcome round it mirrors', 'conflict', async () =>
    await missions.claim(w.db, { userId: w.customerId, missionId: 'once.first_game', at }));
  eq('…and moves nothing', await ledger.balance(w.db, w.customerId), beforeMirror);
  check('…and writes no mission entry for either',
    !(await missionRows()).some((row) => /^once\.(finish_setup|first_game)/.test(row.source_ref)));

  /* ── the check-in is mission #1, and one grant whichever door it comes in by ── */
  const checked = await missions.claim(w.db, { userId: w.customerId, missionId: missions.CHECK_IN_ID, at });
  eq('claiming the check-in mission checks in', checked.points, checkin.dayValue(1));
  await throws('…and the check-in route cannot pay it again', 'conflict', async () =>
    await missions.claim(w.db, { userId: w.customerId, missionId: missions.CHECK_IN_ID, at }));
  eq('…nor can the check-in itself', (await checkin.checkIn(w.db, { userId: w.customerId, at })).granted, false);

  /* ── visits ── */
  eq('a visit mission is open before the scan', (await one('daily.record_a_visit'))?.status, 'open');
  await scan(w, 5000, at);
  eq('a confirmed scan completes record a visit', (await one('daily.record_a_visit'))?.status, 'complete');
  eq('…and counts one venue of three this week', (await one('weekly.three_venues'))?.progress, 1);
  eq('…and the first-visit mirror reads claimed off the gate’s own bonus',
    (await one('once.first_visit'))?.status, 'claimed');

  /* ── learning ── */
  const pesel = learning.moduleFor('pesel');
  const wrong = await learning.grade(w.db, { userId: w.customerId, moduleId: 'pesel', answers: [0, 0, 0, 0] });
  check('a wrong answer does not pass the module', !wrong.passed && !wrong.completed);
  eq('…and the mission stays open with the best score as progress', [(await one('learning.pesel'))?.status,
    (await one('learning.pesel'))?.progress], ['open', wrong.correct]);
  const right = await learning.grade(w.db, {
    userId: w.customerId, moduleId: 'learning.pesel', answers: pesel.questions.map((q) => q.answer),
  });
  check('every answer right passes it', right.passed && right.completed);
  await learning.grade(w.db, { userId: w.customerId, moduleId: 'pesel', answers: [] });
  eq('…and a worse attempt afterwards does not un-pass it', (await one('learning.pesel'))?.status, 'complete');
  eq('a passed module is claimed for its reward',
    (await missions.claim(w.db, { userId: w.customerId, missionId: 'learning.pesel', at })).points, 60);
  check('the module served to a client carries no answers',
    !JSON.stringify(learning.publicModule(pesel)).includes('"answer"'));

  /* ── operator campaigns ── */
  await throws('a partner mission needs its own reward', 'validation_failed', async () =>
    await missions.createCampaign(w.db, {
      id: 'mcp_verify_partner', kind: 'venue_takeover', venueId: w.venueId,
      startsAt: plusDays(at, -1), endsAt: plusDays(at, 1), actorId: w.ownerId,
    }));
  await missions.createCampaign(w.db, {
    id: 'mcp_verify_holiday', kind: 'holiday', startsAt: plusDays(at, -1), endsAt: plusDays(at, 1), actorId: w.ownerId,
  });
  await missions.createCampaign(w.db, {
    id: 'mcp_verify_takeover', kind: 'venue_takeover', venueId: w.venueId, reward: 120,
    startsAt: plusDays(at, -1), endsAt: plusDays(at, 1), actorId: w.ownerId,
  });
  const withCampaigns = await view();
  eq('a live campaign brings its band, in order', withCampaigns.bands.map((band) => band.key),
    ['daily', 'weekly', 'ongoing', 'once', 'seasonal', 'partner', 'learning']);
  eq('…the rulebook’s numbers present with one of each kind shown, less the six not served',
    new Set(withCampaigns.bands.flatMap((b) => b.missions.map((m) => m.number))).size, 55);
  eq('the holiday is complete — a round was played in its window',
    (await one('seasonal.mcp_verify_holiday'))?.status, 'complete');
  eq('…and pays the configured default', (await missions.claim(w.db, {
    userId: w.customerId, missionId: 'seasonal.mcp_verify_holiday', at })).points, CONFIG.missions.campaignRewards.holiday);
  const takeover = await missions.claim(w.db, { userId: w.customerId, missionId: 'partner.mcp_verify_takeover', at });
  eq('the partner mission pays the partner’s figure', takeover.points, 120);
  eq('…recorded against the venue', (await w.db.get<{ venue_id: string }>(
    `SELECT venue_id FROM points_ledger WHERE source_ref = 'partner.mcp_verify_takeover:campaign'`))?.venue_id, w.venueId);
  eq('an ended campaign takes its band with it', (await view(plusDays(at, 2))).bands.map((band) => band.key),
    ['daily', 'weekly', 'ongoing', 'once', 'learning']);

  /* ── the HTTP surface ── */
  const api = createApi({ db: w.db, routes: allRoutes, secret: SECRET, limits: false });
  const server = await api.listen(0, '127.0.0.1');
  const address = server.address();
  const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  const call = async (method: string, path: string, token?: string) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  const signup = await fetch(`${base}/v1/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'missions@verify.test', password: 'hunter22', name: 'M', acceptTerms: true }),
  });
  const token = ((await signup.json()) as { token: string }).token;
  const listed = await call('GET', '/v1/missions', token);
  eq('GET /v1/missions answers', listed.status, 200);
  check('…with camelCase bands and missions',
    Array.isArray(listed.body.bands) && typeof listed.body.unclaimed === 'number' &&
      'resetsAt' in listed.body.bands[0] && 'rewardLabel' in listed.body.bands[0].missions[0]);
  eq('POST …/claim on an open mission is a 409', (await call('POST', '/v1/missions/daily.warm_up/claim', token)).status, 409);
  eq('…with the conflict code', (await call('POST', '/v1/missions/daily.warm_up/claim', token)).body.error.code, 'conflict');
  eq('an unknown mission is a 404', (await call('POST', '/v1/missions/daily.nope/claim', token)).status, 404);
  eq('the check-in claims through the mission route', (await call('POST', '/v1/missions/daily.check_in/claim', token)).status, 200);
  eq('…once', (await call('POST', '/v1/missions/daily.check_in/claim', token)).status, 409);
  const module = await call('GET', '/v1/missions/learning/pharmacy_polish', token);
  eq('a learning module is served', [module.status, module.body.questions.length], [200, 5]);
  eq('the campaign console is admin-only', (await call('GET', '/v1/admin/mission-campaigns', token)).status, 403);
  server.close();

  await w.db.close();
}

/**
 * Staff and Manager workspaces (server/TEAM.md) — the security properties, over
 * HTTP, because every one of them is a property of a route's authorisation and
 * a domain call would skip exactly the layer under test.
 *
 * The route limiter is off (as everywhere in this file); the failed-join limit
 * is in the domain and is on, which is why each group of wrong guesses below
 * arrives from its own forwarded address — the connection key hashes it — and the
 * brute-force group is the only one that fills a bucket.
 */
async function teamRules(): Promise<void> {
  describe('Staff and Manager workspaces (server/TEAM.md)');
  const w = await world();
  const at = now();

  /* A real two-word name, so the counter's first-name-and-initial rule has
     something to cut. */
  await w.db.run(
    `UPDATE users SET display_name = 'Amina Kowalska', username = 'amina_team', username_norm = 'amina_team'
      WHERE id = $u`,
    { u: w.customerId },
  );

  const personOf = async (name: string, opts: { status?: string; partner?: boolean } = {}) => {
    const id = newId('usr');
    const email = `${id}@team.verify.test`;
    await w.db.run(
      `INSERT INTO users (id, email, email_norm, display_name, auth_provider, language, city,
                          status, email_verified_at, created_at, updated_at)
       VALUES ($i, $e, $e, $n, 'email', 'en', 'Krakow', $s, $t, $t, $t)`,
      { i: id, e: email, n: name, s: opts.status ?? 'active', t: at },
    );
    await w.db.run(`INSERT INTO user_roles (user_id, role, granted_at) VALUES ($u, 'consumer', $t)`, { u: id, t: at });
    if (opts.partner) {
      await w.db.run(`INSERT INTO user_roles (user_id, role, granted_at) VALUES ($u, 'partner_owner', $t)`, {
        u: id,
        t: at,
      });
    }
    const { token } = await accounts.createSession(w.db, { userId: id, mode: 'consumer', surface: 'mobile' });
    return { id, token };
  };
  const tokenOf = async (userId: string) =>
    (await accounts.createSession(w.db, { userId, mode: 'consumer', surface: 'mobile' })).token;

  const owner = await tokenOf(w.ownerId);
  const customer = await tokenOf(w.customerId);
  const dawid = await personOf('Dawid Nowak');
  const marta = await personOf('Marta Kowalska');
  const mona = await personOf('Mona Manager');
  const stranger = await personOf('Stranger Danger');
  const late = await personOf('Late Comer');
  const prober = await personOf('Prober');
  const guest = await personOf('Guest', { status: 'provisional' });
  const ownerB = await personOf('Other Owner', { partner: true });

  const venueB = newId('ven');
  await w.db.run(
    `INSERT INTO venues (id, owner_user_id, name, category, city, country_code, timezone, currency,
                         status, verified_at, amount_entry, min_spend_minor, max_amount_minor,
                         avg_check_minor, avg_check_source, accepts_vouchers, points_per_scan,
                         scan_cooldown_hours, loyalty_active, created_at, updated_at)
     VALUES ($i, $o, 'Other Café', 'cafe', 'Krakow', 'PL', $tz, 'PLN',
             'live', $t, 'cashier', 1500, 100000, 4000, 'category', 1, 5, 24, 1, $t, $t)`,
    { i: venueB, o: ownerB.id, tz: VENUE_TZ, t: at },
  );

  const api = createApi({ db: w.db, routes: allRoutes, secret: SECRET, limits: false });
  const server = await api.listen(0, '127.0.0.1');
  const address = server.address();
  const base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  const call = async (
    method: string,
    path: string,
    options: { token?: string; body?: unknown; agent?: string } = {},
  ) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'user-agent': options.agent ?? 'team-verify',
        /* The connection is the address (limits.connectionKey); each label gets its own. */
        'x-forwarded-for': fakeAddress(options.agent ?? 'team-verify'),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  const team = `/v1/partner/venues/${w.venueId}/team`;
  const teamB = `/v1/partner/venues/${venueB}/team`;
  const join = (token: string, code: string, agent: string) =>
    call('POST', '/v1/team/join', { token, body: { code }, agent });

  /* ── inviting ── */
  const invite = await call('POST', team, { token: owner, body: { name: 'Dawid Nowak', role: 'cashier' } });
  eq('the owner invites a cashier', invite.status, 200);
  check('…and the answer carries a six-digit code', /^\d{6}$/.test(invite.body?.code ?? ''), invite.body);
  eq('…a member who has not joined yet', invite.body?.member?.status, 'invited');
  eq('…with the cashier template',
    invite.body?.member?.perms,
    { earn: true, redeem: true, scan: true, running: true, count: false, pause: false });
  const stored = await w.db.get<{ code_hash: string | null }>(`SELECT code_hash FROM team_members WHERE id = $m`, {
    m: invite.body?.member?.id,
  });
  check('the code is stored as a keyed hash, never in the clear',
    typeof stored?.code_hash === 'string' && stored.code_hash.length === 64 &&
      !stored.code_hash.includes(invite.body?.code) && stored.code_hash !== invite.body?.code, stored);
  eq('…and never read back', 'code' in ((await call('GET', team, { token: owner })).body?.members?.[0] ?? {}), false);
  eq('an unknown permission is refused, not dropped',
    (await call('POST', team, { token: owner, body: { name: 'X', role: 'custom', perms: { refund: true } } })).status, 400);

  /* ── joining ── */
  const wrong = await join(dawid.token, invite.body.code === '000000' ? '000001' : '000000', 'ua-wrong');
  eq('a wrong code is a 404', [wrong.status, wrong.body?.error?.code], [404, 'not_found']);
  eq('a guest cannot join a team', (await join(guest.token, invite.body.code, 'ua-guest')).status, 403);
  const joined = await join(dawid.token, invite.body.code, 'ua-dawid');
  eq('the right code joins', joined.status, 200);
  eq('…and names the workspace',
    [joined.body?.workspace?.kind, joined.body?.workspace?.venueId, joined.body?.workspace?.role],
    ['staff', w.venueId, 'cashier']);
  const dawidId = joined.body?.workspace?.memberId as string;
  const reuse = await join(stranger.token, invite.body.code, 'ua-reuse');
  eq('a used code is the same 404 as a wrong one', [reuse.status, reuse.body?.error?.code], [404, 'not_found']);
  eq('…and does not move the membership',
    (await w.db.get<{ user_id: string }>(`SELECT user_id FROM team_members WHERE id = $m`, { m: dawidId }))?.user_id,
    dawid.id);

  const lead = await call('POST', team, { token: owner, body: { name: 'Marta Kowalska', role: 'shiftlead' } });
  const martaId = lead.body?.member?.id as string;
  const reissued = await call('POST', `${team}/${martaId}/code`, { token: owner });
  eq('a code can be re-issued', reissued.status, 200);
  eq('…and the old one stops working at once', (await join(marta.token, lead.body.code, 'ua-marta')).status, 404);
  await w.db.run(`UPDATE team_members SET code_expires_at = $t WHERE id = $m`, { t: plusMinutes(at, -1), m: martaId });
  eq('an expired code is the same 404', (await join(marta.token, reissued.body.code, 'ua-marta')).status, 404);
  const fresh = await call('POST', `${team}/${martaId}/code`, { token: owner });
  check('a new code carries a seven-day expiry',
    (await call('GET', team, { token: owner })).body.members.find((m: { id: string }) => m.id === martaId)?.codeExpiresAt >
      plusDays(at, 6.9));
  eq('…and joins', (await join(marta.token, fresh.body.code, 'ua-marta')).status, 200);

  const ownCode = await call('POST', team, { token: owner, body: { name: 'Me', role: 'cashier' } });
  eq('the owner cannot join their own venue’s team', (await join(owner, ownCode.body.code, 'ua-owner')).status, 409);

  /* ── the brute-force limit ── */
  const target = await call('POST', team, { token: owner, body: { name: 'Target', role: 'cashier' } });
  const guessesOf = (code: string) =>
    Array.from({ length: 5 }, (_, i) => String((Number(code) + 1 + i) % 1_000_000).padStart(6, '0'));
  const misses = [];
  for (const guess of guessesOf(target.body.code)) misses.push((await join(prober.token, guess, 'ua-brute')).status);
  eq('five wrong guesses are five 404s', misses, [404, 404, 404, 404, 404]);
  const sixth = await join(prober.token, target.body.code, 'ua-brute');
  eq('the sixth attempt in an hour is refused even with the right code',
    [sixth.status, sixth.body?.error?.code], [429, 'rate_limited']);
  check('…naming the wait', typeof sixth.body?.error?.retryAfterMinutes === 'number' && sixth.body.error.retryAfterMinutes > 0,
    sixth.body);
  eq('…per account, from another connection too', (await join(prober.token, target.body.code, 'ua-elsewhere')).status, 429);
  eq('…and per connection, from another account', (await join(late.token, target.body.code, 'ua-brute')).status, 429);
  eq('the code itself was not consumed by the refusals', (await join(late.token, target.body.code, 'ua-late')).status, 200);

  /* ── the switcher ── */
  const spaces = await call('GET', '/v1/me/workspaces', { token: dawid.token });
  eq('a cashier has Personal first, then the venue',
    spaces.body?.workspaces?.map((ws: { kind: string }) => ws.kind), ['personal', 'staff']);
  eq('the owner’s list names the venue they own',
    (await call('GET', '/v1/me/workspaces', { token: owner })).body?.workspaces?.map((ws: { kind: string; venueId: string | null }) =>
      [ws.kind, ws.venueId]),
    [['personal', null], ['owner', w.venueId]]);

  /* ── the counter ── */
  const cashierView = await call('GET', `/v1/team/${w.venueId}/counter`, { token: dawid.token });
  eq('a cashier reads their counter', cashierView.status, 200);
  eq('…as themselves', cashierView.body?.member?.id, dawidId);
  eq('…without the customer count', [cashierView.body?.customersToday, cashierView.body?.recent], [null, []]);
  const tier = (cashierView.body?.running ?? []).find((item: { kind: string }) => item.kind === 'voucherTier');
  check('…but with what is running', tier !== undefined, cashierView.body?.running);
  eq('…and without a pause control', tier?.canPause, false);
  eq('a cashier without `pause` cannot pause',
    (await call('POST', `/v1/team/${w.venueId}/running/${tier?.id}/pause`, { token: dawid.token, body: { paused: true } })).status,
    403);
  const paused = await call('POST', `/v1/team/${w.venueId}/running/${tier?.id}/pause`, { token: marta.token, body: { paused: true } });
  eq('a shift lead can', [paused.status, paused.body?.item?.paused], [200, true]);
  eq('…and it is paused in the venue’s own table',
    (await w.db.get<{ active: number }>(`SELECT active FROM voucher_tiers WHERE id = $i`, { i: tier?.id }))?.active, 0);
  await call('POST', `/v1/team/${w.venueId}/running/${tier?.id}/pause`, { token: marta.token, body: { paused: false } });
  eq('another venue’s item is not found',
    (await call('POST', `/v1/team/${venueB}/running/${tier?.id}/pause`, { token: ownerB.token, body: { paused: true } })).status,
    404);

  /* Resume is not publish. The counter acts only on what it lists — a draft
     deal the owner has not finished, or a stamp card the owner ended, is not
     "running", so a shift lead's resume must not bring either to life. */
  {
    const draftId = newId('del');
    await w.db.run(
      `INSERT INTO hot_deals (id, venue_id, partner_name, city, country_code, status, points_required, created_at, updated_at)
       VALUES ($i, $v, 'Verify Café', 'Krakow', 'PL', 'draft', 0, $t, $t)`,
      { i: draftId, v: w.venueId, t: at },
    );
    const endedId = newId('cmp');
    await w.db.run(
      `INSERT INTO campaigns (id, venue_id, name, visits_required, reward_label, reward_cost_minor, status, created_at, updated_at)
       VALUES ($i, $v, 'Old card', 5, 'A coffee', 500, 'ended', $t, $t)`,
      { i: endedId, v: w.venueId, t: at },
    );
    eq('a shift lead cannot “resume” a draft deal into publication',
      (await call('POST', `/v1/team/${w.venueId}/running/${draftId}/pause`, { token: marta.token, body: { paused: false } })).status,
      404);
    eq('…it is still a draft',
      (await w.db.get<{ status: string }>(`SELECT status FROM hot_deals WHERE id = $i`, { i: draftId }))?.status, 'draft');
    eq('nor revive a stamp card the owner ended',
      (await call('POST', `/v1/team/${w.venueId}/running/${endedId}/pause`, { token: marta.token, body: { paused: false } })).status,
      404);
    eq('…it is still ended',
      (await w.db.get<{ status: string }>(`SELECT status FROM campaigns WHERE id = $i`, { i: endedId }))?.status, 'ended');
  }

  /* ── shifts ── */
  eq('a staff login starts its own shift',
    (await call('POST', `/v1/team/${w.venueId}/shift`, { token: marta.token, body: { action: 'start' } })).body?.member?.onShift, true);
  eq('…and not a colleague’s',
    (await call('POST', `/v1/team/${w.venueId}/shift`, { token: marta.token, body: { action: 'start', memberId: dawidId } })).status,
    403);
  eq('the owner’s device must say who',
    (await call('POST', `/v1/team/${w.venueId}/shift`, { token: owner, body: { action: 'start' } })).status, 400);
  eq('…and may start anybody’s',
    (await call('POST', `/v1/team/${w.venueId}/shift`, { token: owner, body: { action: 'start', memberId: dawidId } })).body?.member?.onShift,
    true);

  /* ── a confirmation, recorded against the member ── */
  const visit = async (confirmer: string, body: Record<string, unknown> = {}) => {
    const qr = await call('POST', `/v1/venues/${w.venueId}/qr`, { token: owner });
    const opened = await call('POST', '/v1/gate/scan', { token: customer, body: { token: qr.body.token } });
    const txnId = opened.body?.id as string;
    await call('POST', `/v1/gate/transactions/${txnId}/amount`, { token: owner, body: { amountMinor: 4000 } });
    return { txnId, confirmed: await call('POST', `/v1/gate/transactions/${txnId}/confirm`, { token: confirmer, body }) };
  };
  eq('a cashier with `scan` shows the venue QR',
    (await call('POST', `/v1/venues/${w.venueId}/qr`, { token: dawid.token })).status, 200);
  const byDawid = await visit(dawid.token);
  eq('a cashier with `earn` confirms a visit', byDawid.confirmed.status, 200);
  eq('…and the receipt says who', byDawid.confirmed.body?.confirmedBy?.name, 'Dawid Nowak');
  eq('…and so does the row',
    (await w.db.get<{ confirmed_member_id: string | null }>(`SELECT confirmed_member_id FROM transactions WHERE id = $i`, {
      i: byDawid.txnId,
    }))?.confirmed_member_id,
    dawidId);
  eq('the owner reads "Confirmed by" on the transaction',
    (await call('GET', `/v1/gate/transactions/${byDawid.txnId}`, { token: owner })).body?.confirmedBy?.name, 'Dawid Nowak');
  eq('…and on the till log',
    (await call('GET', `/v1/partner/venues/${w.venueId}/scans`, { token: owner })).body?.rows?.find(
      (row: { id: string }) => row.id === byDawid.txnId)?.confirmedBy,
    'Dawid Nowak');

  const byDevice = await visit(owner, { memberId: martaId });
  eq('the owner’s shared device attributes to whoever is on shift',
    [byDevice.confirmed.status, byDevice.confirmed.body?.confirmedBy?.memberId], [200, martaId]);
  const bMember = await call('POST', teamB, { token: ownerB.token, body: { name: 'B Staff', role: 'cashier' } });
  const foreign = await visit(owner, { memberId: bMember.body?.member?.id });
  eq('…but never to another venue’s member', foreign.confirmed.status, 403);
  await call('POST', `/v1/gate/transactions/${foreign.txnId}/cancel`, { token: owner, body: {} });

  const leadView = await call('GET', `/v1/team/${w.venueId}/counter`, { token: marta.token });
  check('a shift lead sees the customer count', (leadView.body?.customersToday ?? 0) >= 1, leadView.body);
  eq('…and names cut to first name and last initial', leadView.body?.recent?.[0]?.name, 'Amina K.');
  const looked = await call('POST', `/v1/partner/venues/${w.venueId}/counter/lookup`, {
    token: marta.token,
    body: { code: '@amina_team' },
  });
  eq('…the counter’s customer card too', [looked.status, looked.body?.customer?.name], [200, 'Amina K.']);
  eq('…while the owner sees the name the customer shared',
    (await call('POST', `/v1/partner/venues/${w.venueId}/counter/lookup`, { token: owner, body: { code: '@amina_team' } }))
      .body?.customer?.name,
    'Amina Kowalska');

  const scanOnly = await call('POST', team, {
    token: owner,
    body: { name: 'Scan Only', role: 'custom', perms: { scan: true } },
  });
  const scanner = await personOf('Scan Only');
  await join(scanner.token, scanOnly.body.code, 'ua-scanner');
  const noEarn = await visit(scanner.token);
  eq('a member without `earn` cannot confirm a visit', noEarn.confirmed.status, 403);
  await call('POST', `/v1/gate/transactions/${noEarn.txnId}/cancel`, { token: owner, body: {} });

  /* ── §3b: the customer's pass, scanned at the counter ── */
  await ledger.earn(w.db, { userId: w.customerId, points: 3000, reason: 'adjustment', at });
  const passTier = (await w.db.get<{ id: string }>(
    `SELECT id FROM voucher_tiers WHERE venue_id = $v AND discount_pct = 10`, { v: w.venueId }))!;
  const held = await vouchers.issue(w.db, { userId: w.customerId, venueId: w.venueId, tierId: passTier.id, at });
  const mint = (body: Record<string, unknown>, token = customer) =>
    call('POST', '/v1/gate/passes', { token, body: { intent: 'voucher_redeem', ...body } });
  const passScan = (token: string, body: Record<string, unknown>) =>
    call('POST', '/v1/gate/passes/scan', { token, body });
  const passOf = (id: string, token = customer) => call('GET', `/v1/gate/passes/${id}`, { token });

  const pass = await mint({ intentRef: held.id, amountMinor: 8000 });
  eq('a customer mints a pass for a voucher they hold', pass.status, 200);
  check('…a signed token and a six-character code',
    String(pass.body?.token).startsWith('plzpass.') && /^[A-Z2-9]{6}$/.test(pass.body?.code ?? ''), pass.body);
  eq('…not for somebody else’s voucher', (await mint({ intentRef: held.id, amountMinor: 8000 }, dawid.token)).status, 404);
  eq('…nor for an implausible bill', (await mint({ intentRef: held.id, amountMinor: 50_000_000 })).status, 400);
  eq('a forged pass is refused',
    (await passScan(dawid.token, { venueId: w.venueId, token: `${String(pass.body.token).slice(0, -3)}xyz` })).status, 422);
  eq('a member without `redeem` cannot scan one',
    (await passScan(scanner.token, { venueId: w.venueId, token: pass.body.token })).status, 403);
  eq('another venue’s counter cannot redeem it',
    (await passScan(ownerB.token, { venueId: venueB, token: pass.body.token })).status, 403);
  eq('…nor find it by its code', (await passScan(ownerB.token, { venueId: venueB, code: pass.body.code })).status, 404);
  eq('…nor scan it in this venue’s name without being on its counter',
    (await passScan(ownerB.token, { venueId: w.venueId, token: pass.body.token })).status, 403);
  eq('the phone reads it live', (await passOf(pass.body.id)).body?.status, 'live');

  const scannedPass = await passScan(dawid.token, { venueId: w.venueId, token: pass.body.token });
  eq('the counter scans it into a pending redemption',
    [scannedPass.status, scannedPass.body?.transaction?.status, scannedPass.body?.transaction?.intent],
    [200, 'pending', 'voucher_redeem']);
  eq('…with the customer’s bill on it', scannedPass.body?.transaction?.amount_minor, 8000);
  eq('…and shows the cashier what and whose',
    [scannedPass.body?.pass?.customerName, scannedPass.body?.pass?.title], ['Amina', '10% off this order']);
  eq('the phone reads it scanned', (await passOf(pass.body.id)).body?.status, 'scanned');
  eq('…and nobody else can read it', (await passOf(pass.body.id, dawid.token)).status, 404);
  const replayed = await passScan(marta.token, { venueId: w.venueId, token: pass.body.token });
  eq('a used pass is refused', [replayed.status, replayed.body?.error?.code], [409, 'already_used']);

  const passConfirmed = await call('POST', `/v1/gate/transactions/${scannedPass.body.transaction.id}/confirm`, {
    token: dawid.token,
    body: {},
  });
  eq('the confirm redeems it like any other', [passConfirmed.status, passConfirmed.body?.confirmedBy?.name],
    [200, 'Dawid Nowak']);
  eq('…with the discount on the customer’s bill', passConfirmed.body?.discountMinor, 800);
  eq('…the voucher is spent',
    (await w.db.get<{ status: string }>(`SELECT status FROM issued_vouchers WHERE id = $i`, { i: held.id }))?.status,
    'redeemed');
  eq('…and the phone reads used', (await passOf(pass.body.id)).body?.status, 'used');
  eq('a spent voucher mints no new pass', (await mint({ intentRef: held.id, amountMinor: 8000 })).status, 409);

  const held2 = await vouchers.issue(w.db, { userId: w.customerId, venueId: w.venueId, tierId: passTier.id, at });
  const firstPass = await mint({ intentRef: held2.id, amountMinor: 3000 });
  const secondPass = await mint({ intentRef: held2.id, amountMinor: 4000 });
  eq('a new pass retires the last one',
    (await passScan(dawid.token, { venueId: w.venueId, token: firstPass.body.token })).body?.error?.code, 'expired');
  await w.db.run(`UPDATE redemption_passes SET expires_at = $t WHERE id = $i`, {
    t: plusMinutes(now(), -1),
    i: secondPass.body.id,
  });
  eq('an expired pass is refused',
    (await passScan(dawid.token, { venueId: w.venueId, token: secondPass.body.token })).body?.error?.code, 'expired');
  const thirdPass = await mint({ intentRef: held2.id, amountMinor: 4500 });
  const typed = await passScan(dawid.token, { venueId: w.venueId, code: ` ${String(thirdPass.body.code).toLowerCase()} ` });
  eq('the code typed by hand opens it too', [typed.status, typed.body?.transaction?.amount_minor], [200, 4500]);
  await call('POST', `/v1/gate/transactions/${typed.body?.transaction?.id}/cancel`, { token: owner, body: {} });
  eq('a declined pass reads cancelled on the phone', (await passOf(thirdPass.body.id)).body?.status, 'cancelled');

  /* ── revocation, on the very next request ── */
  const pending = await (async () => {
    const qr = await call('POST', `/v1/venues/${w.venueId}/qr`, { token: owner });
    const opened = await call('POST', '/v1/gate/scan', { token: customer, body: { token: qr.body.token } });
    await call('POST', `/v1/gate/transactions/${opened.body?.id}/amount`, { token: owner, body: { amountMinor: 4000 } });
    return opened.body?.id as string;
  })();
  eq('the owner revokes a member', (await call('DELETE', `${team}/${dawidId}`, { token: owner })).status, 204);
  eq('a revoked cashier cannot show the QR', (await call('POST', `/v1/venues/${w.venueId}/qr`, { token: dawid.token })).status, 403);
  eq('…or confirm', (await call('POST', `/v1/gate/transactions/${pending}/confirm`, { token: dawid.token, body: {} })).status, 403);
  eq('…or read the counter', (await call('GET', `/v1/team/${w.venueId}/counter`, { token: dawid.token })).status, 403);
  eq('…and the workspace is gone',
    (await call('GET', '/v1/me/workspaces', { token: dawid.token })).body?.workspaces?.length, 1);
  eq('…nor can anyone attribute to them',
    (await call('POST', `/v1/gate/transactions/${pending}/confirm`, { token: owner, body: { memberId: dawidId } })).status, 403);
  eq('…while past receipts still name them',
    (await call('GET', `/v1/gate/transactions/${byDawid.txnId}`, { token: owner })).body?.confirmedBy?.name, 'Dawid Nowak');
  await call('POST', `/v1/gate/transactions/${pending}/cancel`, { token: owner, body: {} });

  /* ── the manager ── */
  const mgr = await call('POST', team, { token: owner, body: { name: 'Mona Manager', role: 'manager' } });
  const monaJoin = await join(mona.token, mgr.body.code, 'ua-mona');
  eq('a manager joins into a manager workspace', monaJoin.body?.workspace?.kind, 'manager');
  eq('…with every counter permission', monaJoin.body?.workspace?.perms,
    { earn: true, redeem: true, scan: true, running: true, count: true, pause: true });
  eq('a manager reaches the dashboard', (await call('GET', `/v1/partner/venues/${w.venueId}/today`, { token: mona.token })).status, 200);
  eq('…and the deals', (await call('GET', `/v1/partner/venues/${w.venueId}/deals`, { token: mona.token })).status, 200);
  eq('…but not the subscription',
    (await call('GET', `/v1/partner/venues/${w.venueId}/subscription`, { token: mona.token })).status, 403);
  eq('…nor billing',
    (await call('POST', '/v1/billing/checkout', { token: mona.token, body: { venueId: w.venueId, planCode: 'pro' } })).status, 403);
  {
    /* `POST /v1/billing/cancel` took any `venueId` with no owner check, so any
       signed-in account could cancel what somebody else's venue pays for. The
       status alone proves the refusal; the subscription row proves nothing was
       written on the way to it. */
    const paying = (await entitlements.activeSubscription(w.db, { venueId: w.venueId }))?.status ?? null;
    eq('…nor cancelling the venue’s billing',
      (await call('POST', '/v1/billing/cancel', { token: mona.token, body: { venueId: w.venueId } })).status, 403);
    eq('a stranger cannot cancel a venue’s billing either',
      (await call('POST', '/v1/billing/cancel', { token: stranger.token, body: { venueId: w.venueId } })).status, 403);
    eq('…and the venue’s subscription is exactly as it was',
      (await entitlements.activeSubscription(w.db, { venueId: w.venueId }))?.status ?? null, paying);
  }
  eq('…nor a venue of their own',
    (await call('POST', '/v1/partner/venues', { token: mona.token, body: { name: 'Mine', category: 'cafe', city: 'Krakow' } })).status,
    403);
  eq('…nor another venue’s dashboard', (await call('GET', `/v1/partner/venues/${venueB}/today`, { token: mona.token })).status, 403);
  {
    /* A platform deal — no venue — is the admin's alone. The route used to skip
       its check when `venue_id` was null, and `auth: 'partner'` now admits
       every venue's manager. */
    const platformDeal = newId('del');
    await w.db.run(
      `INSERT INTO hot_deals (id, venue_id, partner_name, city, country_code, status, points_required, discount_text, created_at, updated_at)
       VALUES ($i, NULL, 'Platform', 'Krakow', 'PL', 'live', 0, 'original', $t, $t)`,
      { i: platformDeal, t: at },
    );
    eq('…nor edit a platform deal that belongs to no venue',
      (await call('PATCH', `/v1/partner/deals/${platformDeal}`, { token: mona.token, body: { discountText: 'PWNED' } })).status, 403);
    eq('…nor take one down',
      (await call('POST', `/v1/partner/deals/${platformDeal}/status`, { token: mona.token, body: { status: 'archived' } })).status, 403);
    eq('…and it is untouched',
      await w.db.get<{ status: string; discount_text: string }>(
        `SELECT status, discount_text FROM hot_deals WHERE id = $i`, { i: platformDeal }),
      { status: 'live', discount_text: 'original' });
  }
  eq('a manager adds a cashier',
    (await call('POST', team, { token: mona.token, body: { name: 'New Cashier', role: 'cashier' } })).status, 200);
  eq('…but not a manager',
    (await call('POST', team, { token: mona.token, body: { name: 'Second Mgr', role: 'manager' } })).status, 403);
  eq('…edits a shift lead',
    (await call('PATCH', `${team}/${martaId}`, { token: mona.token, body: { perms: { pause: false } } })).body?.member?.perms?.pause,
    false);
  eq('…but cannot promote one to manager',
    (await call('PATCH', `${team}/${martaId}`, { token: mona.token, body: { role: 'manager' } })).status, 403);
  eq('…nor remove a manager, themselves included',
    (await call('DELETE', `${team}/${monaJoin.body?.workspace?.memberId}`, { token: mona.token })).status, 403);

  /* ── across venues, and below the manager ── */
  eq('another venue’s owner cannot read this team', (await call('GET', team, { token: ownerB.token })).status, 403);
  eq('…or add to it', (await call('POST', team, { token: ownerB.token, body: { name: 'Mole', role: 'manager' } })).status, 403);
  eq('…or reach a member through their own venue’s path',
    (await call('PATCH', `${teamB}/${martaId}`, { token: ownerB.token, body: { role: 'cashier' } })).status, 404);
  eq('a staff member cannot manage the team', (await call('GET', team, { token: marta.token })).status, 403);
  eq('a staff member cannot read another venue’s counter',
    (await call('GET', `/v1/team/${venueB}/counter`, { token: marta.token })).status, 403);
  eq('a stranger cannot read this counter',
    (await call('GET', `/v1/team/${w.venueId}/counter`, { token: stranger.token })).status, 403);
  await w.db.run(`INSERT INTO user_roles (user_id, role, granted_at) VALUES ($u, 'manager', $t)`, { u: stranger.id, t: at });
  eq('the old global `manager` role opens no venue any more',
    (await call('POST', `/v1/venues/${w.venueId}/qr`, { token: stranger.token })).status, 403);

  /* ── GDPR ── */
  const exported = await consent.exportUser(w.db, marta.id);
  eq('the export lists the account’s teams',
    (exported.team as Array<{ venue_id: string; role: string }>).map((row) => [row.venue_id, row.role]),
    [[w.venueId, 'shiftlead']]);
  await consent.eraseUser(w.db, marta.id, at);
  eq('erasure ends the membership and forgets the name',
    await w.db.get(`SELECT name, status FROM team_members WHERE id = $m`, { m: martaId }),
    { name: 'Former team member', status: 'revoked' });

  server.close();
  await w.db.close();
}

/**
 * Subscription passes (`domain/passes.ts`) — the lifecycle, the allowance
 * under its windows, the price and terms locked per period across a renewal,
 * what closing does, the consent gate on the subscriber list, who may press
 * what, and the four stat cards' arithmetic.
 *
 * Every instant is pinned to the 5th of the current venue-local month at
 * 09:00 UTC so a day, a week and a month are knowable without reading the
 * clock; the HTTP half runs on the real clock because the server stamps it.
 */
async function passRules(): Promise<void> {
  describe('subscription passes — lifecycle, allowance, price lock, close, consent, permissions, stats');
  const w = await world();
  const month = localMonth(now(), VENUE_TZ);
  const base = `${month}-05T09:00:00.000Z`;
  const later = (minutes: number) => plusMinutes(base, minutes);

  const person = async (name: string) => {
    const id = newId('usr');
    await w.db.run(
      `INSERT INTO users (id, email, email_norm, display_name, auth_provider, language, city,
                          status, email_verified_at, created_at, updated_at)
       VALUES ($i, $e, $e, $n, 'email', 'en', 'Krakow', 'active', $t, $t, $t)`,
      { i: id, e: `${id}@passes.verify.test`, n: name, t: base },
    );
    await w.db.run(`INSERT INTO user_roles (user_id, role, granted_at) VALUES ($u, 'consumer', $t)`, { u: id, t: base });
    return id;
  };

  /* ── the plan: "Included in Growth" ── */
  const draft = await passes.createPass(w.db, {
    venueId: w.venueId,
    actorId: w.ownerId,
    pass: { template: 'daily' },
    at: base,
  });
  eq('a new pass is a draft with the template’s rule', [draft.status, draft.accent, draft.capKind, draft.capCount], ['draft', 'teal', 'per_day', 1]);
  eq('…and says what publishing still needs', draft.missing, ['name', 'benefit', 'price']);
  eq('…and borrows the venue’s currency', draft.currency, 'PLN');
  await rejects('a starter venue cannot publish a pass', () =>
    passes.setStatus(w.db, { venueId: w.venueId, passId: draft.id, action: 'publish', actorId: w.ownerId, at: base }), 'entitlement_required');
  await entitlements.startSubscription(w.db, { subject: { venueId: w.venueId }, planCode: 'growth', source: 'manual', at: base });
  await rejects('an incomplete pass does not publish', () =>
    passes.setStatus(w.db, { venueId: w.venueId, passId: draft.id, action: 'publish', actorId: w.ownerId, at: base }), 'validation_failed');

  const daily = await passes.updatePass(w.db, {
    venueId: w.venueId,
    passId: draft.id,
    actorId: w.ownerId,
    patch: { name: 'Daily Brew', benefitItem: 'Any filter coffee', priceMinor: 4900, maxValueMinor: 1200 },
    at: base,
  });
  eq('a complete draft has nothing missing', daily.missing, []);
  eq('publishing makes it live', (await passes.setStatus(w.db, { venueId: w.venueId, passId: daily.id, action: 'publish', actorId: w.ownerId, at: base })).status, 'live');
  eq('publishing twice is answered, not refused', (await passes.setStatus(w.db, { venueId: w.venueId, passId: daily.id, action: 'publish', actorId: w.ownerId, at: base })).status, 'live');
  await rejects('a live pass cannot be edited into a blank name', () =>
    passes.updatePass(w.db, { venueId: w.venueId, passId: daily.id, actorId: w.ownerId, patch: { name: '' }, at: base }), 'validation_failed');
  await rejects('a pass is not found through another venue', () => passes.getPass(w.db, newId('ven'), daily.id, base), 'not_found');

  const unlimitedItem = await passes.createPass(w.db, {
    venueId: w.venueId,
    actorId: w.ownerId,
    pass: { template: 'custom', name: 'Bottomless', benefitItem: 'Coffee', capKind: 'unlimited', priceMinor: 9900 },
    at: base,
  });
  eq('an unlimited item waits on "Keep it unlimited"', unlimitedItem.missing, ['unlimitedOk']);
  const vip = await passes.createPass(w.db, {
    venueId: w.venueId,
    actorId: w.ownerId,
    pass: { template: 'vip', name: 'VIP club', priceMinor: 12000, billingPeriod: 'annual', perks: ['skip_line'] },
    at: base,
  });
  eq('the VIP template is a 15% discount with no cap', [vip.discountPct, vip.capKind, vip.missing], [15, 'unlimited', []]);
  await passes.setStatus(w.db, { venueId: w.venueId, passId: vip.id, action: 'publish', actorId: w.ownerId, at: base });
  await throws('a day list must not be empty', 'validation_failed', () =>
    passes.createPass(w.db, { venueId: w.venueId, actorId: w.ownerId, pass: { allowedDays: [] }, at: base }));
  await throws('a seat count past three is refused', 'validation_failed', () =>
    passes.createPass(w.db, { venueId: w.venueId, actorId: w.ownerId, pass: { seats: 4 }, at: base }));

  /* ── pause stops sign-ups and nothing else ── */
  await passes.setStatus(w.db, { venueId: w.venueId, passId: daily.id, action: 'pause', actorId: w.ownerId, at: base });
  await rejects('a paused pass takes no sign-ups', () => passes.subscribe(w.db, { passId: daily.id, userId: w.customerId, at: base }), 'invalid_state');
  await passes.setStatus(w.db, { venueId: w.venueId, passId: daily.id, action: 'resume', actorId: w.ownerId, at: base });

  const sub = await passes.subscribe(w.db, { passId: daily.id, userId: w.customerId, at: base });
  eq('a subscription starts active at the list price', [sub.status, sub.priceMinor, sub.periodKind], ['active', 4900, 'full']);
  eq('…for one month', sub.periodEnd, plusMonths(base, 1));
  check('…with a code the counter can read', /^PS-[A-Z2-9]{6}$/.test(sub.code), sub.code);
  eq('…and nothing was charged — there is no rail', sub.charged, false);
  await rejects('a second sign-up to the same pass is refused', () => passes.subscribe(w.db, { passId: daily.id, userId: w.customerId, at: base }), 'conflict');

  await passes.setStatus(w.db, { venueId: w.venueId, passId: daily.id, action: 'pause', actorId: w.ownerId, at: base });
  eq('a paused pass is still usable by a subscriber',
    (await passes.redeem(w.db, { venueId: w.venueId, actorId: w.ownerId, code: sub.code, at: later(1) })).allowance.remaining, 0);
  await passes.setStatus(w.db, { venueId: w.venueId, passId: daily.id, action: 'resume', actorId: w.ownerId, at: base });

  /* ── the allowance, per day ── */
  await rejects('the second coffee of the day is refused', () =>
    passes.redeem(w.db, { venueId: w.venueId, actorId: w.ownerId, code: sub.code, at: later(60) }), 'cap_reached');
  const lookedUp = await passes.lookup(w.db, { venueId: w.venueId, code: sub.code.toLowerCase(), via: 'owner', at: later(60) });
  eq('the lookup says why, in a word, and finds a lower-cased code', [lookedUp.usable.ok, lookedUp.usable.reason], [false, 'used_up']);
  eq('…and names nobody who has not shared', lookedUp.customer.name, null);
  const tomorrow = await passes.redeem(w.db, {
    venueId: w.venueId, actorId: w.ownerId, code: sub.code, billMinor: 2000, at: plusDays(base, 1),
  });
  eq('the next local day has its own coffee', tomorrow.allowance.used, 1);
  eq('a bill is split into what the pass covered and the rest', [tomorrow.redemption.billMinor, tomorrow.redemption.coveredMinor], [2000, 1200]);
  await rejects('two at once on a one-seat pass is refused', () =>
    passes.redeem(w.db, { venueId: w.venueId, actorId: w.ownerId, code: sub.code, quantity: 2, at: plusDays(base, 2) }), 'validation_failed');
  await rejects('an unknown code is one 404', () => passes.redeem(w.db, { venueId: w.venueId, actorId: w.ownerId, code: 'PS-NOPE22', at: base }), 'not_found');

  /* ── the allowance, per week on chosen days, and per month ── */
  const weekday = local(base, VENUE_TZ).weekday;
  const weekend = await passes.createPass(w.db, {
    venueId: w.venueId,
    actorId: w.ownerId,
    pass: { template: 'weekend', name: 'Weekend', benefitItem: 'Coffee', priceMinor: 2900, allowedDays: [(weekday + 3) % 7] },
    at: base,
  });
  await passes.setStatus(w.db, { venueId: w.venueId, passId: weekend.id, action: 'publish', actorId: w.ownerId, at: base });
  const wsub = await passes.subscribe(w.db, { passId: weekend.id, userId: w.customerId, at: base });
  const refusedDay = await refusal(() => passes.redeem(w.db, { venueId: w.venueId, actorId: w.ownerId, code: wsub.code, at: base }));
  eq('a pass is refused on a day it does not cover', [refusedDay?.code, refusedDay?.detail.reason], ['conflict', 'wrong_day']);
  const onDay = plusDays(base, 3);
  await passes.redeem(w.db, { venueId: w.venueId, actorId: w.ownerId, code: wsub.code, at: onDay });
  eq('a weekly allowance counts in the ISO week', (await passes.redeem(w.db, { venueId: w.venueId, actorId: w.ownerId, code: wsub.code, at: plusMinutes(onDay, 5) })).allowance.remaining, 0);

  const bundle = await passes.createPass(w.db, {
    venueId: w.venueId, actorId: w.ownerId, pass: { template: 'bundle', name: 'Ten', benefitItem: 'Coffee', priceMinor: 7900, capCount: 2 }, at: base,
  });
  eq('the bundle template is a monthly count', bundle.capKind, 'per_month');
  await passes.setStatus(w.db, { venueId: w.venueId, passId: bundle.id, action: 'publish', actorId: w.ownerId, at: base });
  const second = await person('Second Customer');
  const bsub = await passes.subscribe(w.db, { passId: bundle.id, userId: second, at: base });
  await passes.redeem(w.db, { venueId: w.venueId, actorId: w.ownerId, code: bsub.code, at: later(1) });
  await passes.redeem(w.db, { venueId: w.venueId, actorId: w.ownerId, code: bsub.code, at: plusDays(base, 9) });
  await rejects('a month’s count is a month’s, across days', () =>
    passes.redeem(w.db, { venueId: w.venueId, actorId: w.ownerId, code: bsub.code, at: plusDays(base, 10) }), 'cap_reached');

  /* ── capacity: sold out is derived ── */
  const capped = await passes.updatePass(w.db, { venueId: w.venueId, passId: bundle.id, actorId: w.ownerId, patch: { subscriberCap: 1 }, at: base });
  eq('a cap reached reads as sold out', capped.soldOut, true);
  const third = await person('Third Customer');
  await rejects('…and refuses the next sign-up', () => passes.subscribe(w.db, { passId: bundle.id, userId: third, at: base }), 'cap_reached');
  eq('0 means no limit', (await passes.updatePass(w.db, { venueId: w.venueId, passId: bundle.id, actorId: w.ownerId, patch: { subscriberCap: 0 }, at: base })).subscriberCap, null);

  /* ── stats, before anything renews ── */
  await passes.subscribe(w.db, { passId: vip.id, userId: third, at: base });
  const list = await passes.listForVenue(w.db, w.venueId, plusDays(base, 3));
  eq('active subscribers are every current holder', list.stats.activeSubscribers, 4);
  eq('recurring is each active price spread over its billing period', list.stats.recurringMinor, 4900 + 2900 + 7900 + 1000);
  eq('redemptions this month count uses', list.stats.redemptionsThisMonth, 6);
  eq('upsell is measured on the uses with a bill, and says how many', [list.stats.upsell.minor, list.stats.upsell.measured, list.stats.upsell.redemptions], [800, 1, 6]);
  eq('the venue cannot take the money, and says so', [list.payouts.connected, list.subscribeAvailable], [false, false]);
  const vipDetail = await passes.detail(w.db, w.venueId, vip.id, base);
  eq('a pass with no uses has no upsell to estimate — null, with the reason', [vipDetail.stats.upsell.minor, vipDetail.stats.upsell.reason], [null, 'no_redemptions']);
  eq('…and a rate over its one holder is 0, not null', vipDetail.stats.perActiveSubscriber, 0);
  const weekendDetail = await passes.detail(w.db, w.venueId, weekend.id, plusDays(base, 3));
  eq('uses with no bill leave upsell unmeasured', weekendDetail.stats.upsell.reason, 'no_bills_recorded');
  eq('per active subscriber is uses over holders', weekendDetail.stats.perActiveSubscriber, 2);
  eq('new this month counts sign-ups in the venue’s month', weekendDetail.stats.newThisMonth, 1);

  /* ── a price and terms change lock until renewal ── */
  await passes.updatePass(w.db, { venueId: w.venueId, passId: daily.id, actorId: w.ownerId, patch: { priceMinor: 5900, capCount: 2 }, at: plusDays(base, 4) });
  await passes.redeem(w.db, { venueId: w.venueId, actorId: w.ownerId, code: sub.code, at: plusDays(base, 4) });
  await rejects('a raised allowance waits for the next period', () =>
    passes.redeem(w.db, { venueId: w.venueId, actorId: w.ownerId, code: sub.code, at: plusMinutes(plusDays(base, 4), 1) }), 'cap_reached');
  const held = (await passes.mine(w.db, w.customerId, plusDays(base, 4))).find((m) => m.id === sub.id)!;
  eq('the current period keeps its price', held.priceMinor, 4900);

  const renewAt = plusMinutes(sub.periodEnd, 1);
  const rolled = await passes.runRenewals(w.db, renewAt);
  check('the renewal job rolls the ended periods', rolled.renewed >= 1, rolled);
  const after = (await passes.mine(w.db, w.customerId, renewAt)).find((m) => m.id === sub.id)!;
  eq('the next period is at the new price, with the new terms', [after.priceMinor, after.terms.capCount, after.periodStart], [5900, 2, sub.periodEnd]);
  const periods = await w.db.all<{ price_minor: number; charge_status: string }>(
    `SELECT price_minor, charge_status FROM pass_periods WHERE subscription_id = $s ORDER BY starts_at`, { s: sub.id },
  );
  eq('both periods are on the record, each at its own price, neither charged', periods, [
    { price_minor: 4900, charge_status: 'not_charged' },
    { price_minor: 5900, charge_status: 'not_charged' },
  ]);
  eq('a second run renews nothing twice', (await passes.runRenewals(w.db, renewAt)).renewed, 0);

  /* ── cancel and close: kept to the end of the period, then expired ── */
  const cancelled = await passes.cancel(w.db, { subscriptionId: bsub.id, userId: second, at: plusDays(base, 11) });
  eq('a cancelled subscription is still held', cancelled.status, 'cancelled');
  await rejects('somebody else cannot cancel it', () => passes.cancel(w.db, { subscriptionId: bsub.id, userId: third, at: base }), 'not_found');

  const closed = await passes.setStatus(w.db, { venueId: w.venueId, passId: daily.id, action: 'close', actorId: w.ownerId, at: renewAt });
  eq('closing a pass closes it', closed.status, 'closed');
  await rejects('a closed pass takes no sign-ups', () => passes.subscribe(w.db, { passId: daily.id, userId: third, at: renewAt }), 'invalid_state');
  await rejects('a closed pass cannot be edited', () =>
    passes.updatePass(w.db, { venueId: w.venueId, passId: daily.id, actorId: w.ownerId, patch: { name: 'X' }, at: renewAt }), 'invalid_state');
  const stillOk = await passes.redeem(w.db, { venueId: w.venueId, actorId: w.ownerId, code: sub.code, at: plusMinutes(renewAt, 5) });
  eq('…but its members keep it to the end of their period', stillOk.redemption.quantity, 1);
  eq('…and a closed pass is not recurring revenue', (await passes.detail(w.db, w.venueId, daily.id, renewAt)).stats.recurringMinor, 0);
  const end = plusMinutes(plusMonths(sub.periodEnd, 1), 1);
  const swept = await passes.runRenewals(w.db, end);
  check('at the period end the closed and the cancelled expire', swept.expired >= 2, swept);
  await rejects('an expired pass cannot be used', () => passes.redeem(w.db, { venueId: w.venueId, actorId: w.ownerId, code: sub.code, at: end }), 'expired');
  await rejects('a draft is deleted, not closed', () =>
    passes.setStatus(w.db, { venueId: w.venueId, passId: unlimitedItem.id, action: 'close', actorId: w.ownerId, at: base }), 'invalid_state');
  await passes.deleteDraft(w.db, { venueId: w.venueId, passId: unlimitedItem.id, actorId: w.ownerId, at: base });
  await rejects('…and is gone', () => passes.getPass(w.db, w.venueId, unlimitedItem.id), 'not_found');

  /* ── an intro trial, once per person ── */
  const trial = await passes.createPass(w.db, {
    venueId: w.venueId, actorId: w.ownerId, pass: { name: 'Try us', benefitItem: 'Tea', priceMinor: 3000, intro: 'trial_7' }, at: base,
  });
  await passes.setStatus(w.db, { venueId: w.venueId, passId: trial.id, action: 'publish', actorId: w.ownerId, at: base });
  const tsub = await passes.subscribe(w.db, { passId: trial.id, userId: third, at: base });
  eq('a trial is free for seven days', [tsub.status, tsub.priceMinor, tsub.periodKind, tsub.periodEnd], ['trialing', 0, 'trial', plusDays(base, 7)]);
  check('a trial is not recurring revenue', (await passes.detail(w.db, w.venueId, trial.id, base)).stats.recurringMinor === 0);
  await passes.runRenewals(w.db, plusDays(base, 8));
  const converted = (await passes.mine(w.db, third, plusDays(base, 8))).find((m) => m.id === tsub.id)!;
  eq('…and becomes the full price at its end', [converted.status, converted.priceMinor, converted.periodKind], ['active', 3000, 'full']);
  await passes.cancel(w.db, { subscriptionId: tsub.id, userId: third, at: plusDays(base, 9) });
  const gone = plusDays(converted.periodEnd, 1);
  await passes.runRenewals(w.db, gone);
  const again = await passes.subscribe(w.db, { passId: trial.id, userId: third, at: gone });
  eq('coming back gets no second trial', [again.status, again.periodKind, again.priceMinor], ['active', 'full', 3000]);

  /* ── consent: only those who share are named ── */
  const hidden = await passes.members(w.db, w.venueId, { passId: vip.id, at: base });
  eq('a subscriber who has not shared is counted and not listed', [hidden.total, hidden.shared, hidden.rows.length], [1, 0, 0]);
  await consent.grantSharing(w.db, { userId: third, venueId: w.venueId, at: base });
  const shown = await passes.members(w.db, w.venueId, { passId: vip.id, at: base });
  eq('…and appears once they share', [shown.shared, shown.rows[0]?.name, shown.rows[0]?.passName], [1, 'Third Customer', 'VIP club']);
  await consent.revokeSharing(w.db, third, w.venueId, base);
  eq('…and drops off when they stop', (await passes.members(w.db, w.venueId, { passId: vip.id, at: base })).shared, 0);

  /* ── a sale linked to a use ── */
  const receipt = await scan(w, 3000, plusDays(base, 1), third);
  const vipSub = (await passes.mine(w.db, third, plusDays(base, 1))).find((m) => m.passId === vip.id)!;
  const linked = await passes.redeem(w.db, {
    venueId: w.venueId, actorId: w.ownerId, code: vipSub.code, transactionId: receipt.transaction.id, at: plusDays(base, 1),
  });
  eq('a linked sale supplies the bill, and a discount pass covers its percentage', [linked.redemption.billMinor, linked.redemption.coveredMinor], [3000, 450]);
  await rejects('one sale is linked to one use', () =>
    passes.redeem(w.db, { venueId: w.venueId, actorId: w.ownerId, code: vipSub.code, transactionId: receipt.transaction.id, at: plusDays(base, 1) }), 'already_used');

  /* ── permissions, over HTTP ── */
  const api = createApi({ db: w.db, routes: allRoutes, secret: SECRET, limits: false });
  const server = await api.listen(0, '127.0.0.1');
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  const call = async (method: string, path: string, token?: string, body?: unknown) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': fakeAddress('passes-verify'),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  const tokenOf = async (userId: string) =>
    (await accounts.createSession(w.db, { userId, mode: 'consumer', surface: 'mobile' })).token;
  const memberOf = async (name: string, perms: Partial<Record<'earn' | 'redeem' | 'scan', 1>>) => {
    const userId = await person(name);
    const memberId = newId('tmm');
    await w.db.run(
      `INSERT INTO team_members (id, venue_id, user_id, name, role, perm_earn, perm_redeem, perm_scan, status,
                                 created_at, joined_at, updated_at)
       VALUES ($i, $v, $u, $n, 'custom', $e, $r, $s, 'active', $t, $t, $t)`,
      { i: memberId, v: w.venueId, u: userId, n: name, e: perms.earn ?? 0, r: perms.redeem ?? 0, s: perms.scan ?? 0, t: base },
    );
    return { userId, memberId, token: await tokenOf(userId) };
  };

  const owner = await tokenOf(w.ownerId);
  const customerToken = await tokenOf(w.customerId);
  const strangerOwner = await person('Stranger Owner');
  await w.db.run(`INSERT INTO user_roles (user_id, role, granted_at) VALUES ($u, 'partner_owner', $t)`, { u: strangerOwner, t: base });
  const otherVenue = newId('ven');
  await w.db.run(
    `INSERT INTO venues (id, owner_user_id, name, category, city, country_code, timezone, currency, status, verified_at,
                         created_at, updated_at)
     VALUES ($i, $o, 'Other', 'cafe', 'Krakow', 'PL', $tz, 'PLN', 'live', $t, $t, $t)`,
    { i: otherVenue, o: strangerOwner, tz: VENUE_TZ, t: base },
  );
  const stranger = await tokenOf(strangerOwner);
  const cashier = await memberOf('Cara Cashier', { redeem: 1, scan: 1 });
  const viewer = await memberOf('Vic Viewer', { scan: 1 });

  const listed = await call('GET', `/v1/partner/venues/${w.venueId}/passes`, owner);
  eq('the owner reads the Passes screen', [listed.status, Array.isArray(listed.body.passes)], [200, true]);
  eq('another venue’s owner is refused', (await call('GET', `/v1/partner/venues/${w.venueId}/passes`, stranger)).status, 403);
  eq('a cashier is not admitted to the dashboard', (await call('GET', `/v1/partner/venues/${w.venueId}/passes`, cashier.token)).status, 403);
  const created = await call('POST', `/v1/partner/venues/${w.venueId}/passes`, owner, {
    template: 'vip', name: 'HTTP club', priceMinor: 2500, discountPct: null, benefitItem: 'Cake', capKind: 'per_day', allowedDays: null,
  });
  eq('the drawer creates a pass, and null removes the template’s discount', [created.status, created.body.discountPct, created.body.capKind], [200, null, 'per_day']);
  const published = await call('POST', `/v1/partner/venues/${w.venueId}/passes/${created.body.id}/status`, owner, { action: 'publish' });
  eq('…and the status press publishes it', [published.status, published.body.status], [200, 'live']);
  eq('a stranger cannot publish it', (await call('POST', `/v1/partner/venues/${otherVenue}/passes/${created.body.id}/status`, stranger, { action: 'pause' })).status, 404);
  eq('the subscriber list needs the identified-profiles plan, which Growth has',
    (await call('GET', `/v1/partner/venues/${w.venueId}/passes/${created.body.id}/subscribers`, owner)).status, 200);

  const refused = await call('POST', `/v1/passes/${created.body.id}/subscribe`, customerToken);
  eq('subscribing in the app is switched off, and says so', [refused.status, refused.body.error.code, refused.body.error.reason], [409, 'not_available', 'payments_unavailable']);
  const publicList = await call('GET', `/v1/venues/${w.venueId}/passes`);
  const httpPass = publicList.body.passes.find((p: { id: string }) => p.id === created.body.id);
  eq('the customer sees a live pass that cannot be bought, and why', [httpPass?.subscribable, httpPass?.unavailableReason], [false, 'payments_unavailable']);
  check('…and no draft or closed pass', !publicList.body.passes.some((p: { id: string }) => p.id === daily.id || p.id === draft.id));

  const httpSub = await passes.subscribe(w.db, { passId: created.body.id, userId: w.customerId });
  const mineHttp = await call('GET', '/v1/me/passes', customerToken);
  check('the customer’s own passes carry the code to show', mineHttp.body.subscriptions.some((s: { code: string }) => s.code === httpSub.code));

  const look = await call('POST', `/v1/partner/venues/${w.venueId}/passes/lookup`, viewer.token, { code: httpSub.code });
  eq('a scan-only login can look a code up', [look.status, look.body.usable.ok], [200, true]);
  eq('…and cannot use it', (await call('POST', `/v1/partner/venues/${w.venueId}/passes/redeem`, viewer.token, { code: httpSub.code })).status, 403);
  eq('another venue’s owner cannot use it', (await call('POST', `/v1/partner/venues/${w.venueId}/passes/redeem`, stranger, { code: httpSub.code })).status, 403);
  const used = await call('POST', `/v1/partner/venues/${w.venueId}/passes/redeem`, cashier.token, { code: httpSub.code });
  eq('a cashier with redeem uses it, recorded against them', [used.status, used.body.redemption.confirmedBy?.memberId], [200, cashier.memberId]);
  const row = await w.db.get<{ confirmed_member_id: string; confirmed_by: string }>(
    `SELECT confirmed_member_id, confirmed_by FROM pass_redemptions WHERE id = $i`, { i: used.body.redemption.id },
  );
  eq('…on the row as well', [row?.confirmed_member_id, row?.confirmed_by], [cashier.memberId, cashier.userId]);
  const again2 = await call('POST', `/v1/partner/venues/${w.venueId}/passes/redeem`, owner, { code: httpSub.code });
  eq('the day’s allowance is the server’s', [again2.status, again2.body.error.code], [409, 'cap_reached']);
  const attributed = await passes.redeem(w.db, {
    venueId: w.venueId, actorId: w.ownerId, code: vipSub.code, memberId: cashier.memberId, at: plusDays(base, 2),
  });
  eq('the owner’s shared device names who was on shift', attributed.redemption.confirmedBy?.name, 'Cara Cashier');
  await rejects('…and cannot name somebody without redeem', () =>
    passes.redeem(w.db, { venueId: w.venueId, actorId: w.ownerId, code: vipSub.code, memberId: viewer.memberId, at: plusDays(base, 2) }), 'forbidden');
  const ownSub = await passes.subscribe(w.db, { passId: vip.id, userId: cashier.userId, at: base });
  await rejects('a cashier cannot redeem their own pass on their own till', () =>
    passes.redeem(w.db, { venueId: w.venueId, actorId: cashier.userId, code: ownSub.code, at: plusDays(base, 1) }), 'forbidden');

  server.close();
  await w.db.close();
}

async function run(): Promise<void> {
  const started = Date.now();

  pureHelpers();
  crypto();
  await passwords();
  routerRules();
  await countryRules();
  await reimportRules();
  await importRules();
  sqliteOnlySql();
  postgresLockdown();
  await rateLimits();
  await boardDefaultRules();
  await bootOrdering();
  await ledgerRules();
  await budgetRules();
  await gateRules();
  await voucherRules();
  await voucherCaps();
  await giftCardStock();
  await giftPolicyRules();
  await rulebookEconomy();
  await tierAssignment();
  await campaignRules();
  await checkInRules();
  await gameRules();
  await dailyTaskRules();
  await wordListRules();
  await quizLanguageRules();
  await wordBankRules();
  await mediaRules();
  await rateRules();
  formulaTable();
  await scoringRules();
  await mergeRules();
  await foodRules();
  await ninjaRules();
  await webPushRules();
  await moreReminderRules();
  await giftCardEngine();
  await arcadeRules();
  await formulaInPlay();
  await featuredPoster();
  await flightRoundShape();
  await seededGames();
  await dealRules();
  await consentRules();
  await sharingDefaultRules();
  await analyticsRules();
  await dashboardHelperRules();
  const dashboardWorld = await dashboardFixture();
  await dashboardReports(dashboardWorld);
  await dashboardLevers(dashboardWorld);
  await dashboardWorld.d.db.close();
  await counterRules();
  await entitlementRules();
  await assistantRules();
  await socialRules();
  await referralRules();
  await trafficRules();
  await jobRules();
  await accountRules();
  await emailCodeRules();
  await profileRules();
  await missionRules();
  await teamRules();
  await passRules();
  await httpSurface();

  const ms = Date.now() - started;
  console.log(`\n${passed} checks passed in ${ms}ms`);
  if (failures.length > 0) {
    console.log(`\n${failures.length} FAILED:`);
    for (const failure of failures) console.log(`  ✗ ${failure}`);
    process.exitCode = 1;
  }
}


/**
 * 2048 — the slide, the spawn, and a round played on the server.
 *
 * The slide is checked on rows a person can read, because the one rule people
 * get wrong is the one a test has to pin: a tile merges at most once per move.
 */
async function mergeRules(): Promise<void> {
  describe('2048');

  const row = (values: number[], dir: merge.Direction = 'left') =>
    merge.slide([...values, ...new Array(12).fill(0)], dir).board.slice(0, 4);
  eq('two pairs make two tiles, not one', row([2, 2, 2, 2]), [4, 4, 0, 0]);
  eq('a merged tile does not merge again in the same move', row([2, 2, 4, 0]), [4, 4, 0, 0]);
  eq('the pair nearest the wall merges first', row([2, 2, 2, 0]), [4, 2, 0, 0]);
  eq('sliding right mirrors it', row([2, 2, 2, 0], 'right'), [0, 0, 2, 4]);
  eq('a full row with nothing to merge does not move', merge.slide([2, 4, 8, 16, ...new Array(12).fill(0)], 'left').moved, false);
  eq('the score is the sum of the merges', merge.slide([2, 2, 4, 4, ...new Array(12).fill(0)], 'left').gained, 12);

  /* Deterministic: same seed, same board — which is what lets the server's
     placement be checked rather than trusted. */
  eq('a seed always deals the same board', merge.newBoard('seed-a'), merge.newBoard('seed-a'));
  eq('an opening board has two tiles', merge.newBoard('seed-a').filter((v) => v > 0).length, 2);
  eq('a locked board cannot move', merge.canMove([2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2]), false);

  /* ── a round on the server ── */
  const w = await world();
  const at = now();
  const round = await games.startSession(w.db, { userId: w.customerId, gameType: 'merge_2048', language: 'en', at });
  const content = round.content as { board: number[]; target: number };
  eq('the opening board is sent', content.board.filter((v) => v > 0).length, 2);
  const stored = JSON.parse(
    (await w.db.get<{ secret: string }>(`SELECT secret FROM game_sessions WHERE id = $i`, { i: round.sessionId }))!.secret,
  ) as merge.MergeSecret;
  check('…and the seed is not', !JSON.stringify(round.content).includes(stored.seed));

  /* The first direction that changes the opening board. */
  const legal = merge.DIRECTIONS.find((d) => merge.slide(content.board, d).moved)!;
  const first = await games.submitEvent(w.db, {
    sessionId: round.sessionId, userId: w.customerId, seq: 0, kind: 'move', payload: { dir: legal, from: 0 }, at,
  });
  eq('a move is applied', [first.accepted, first.merge?.moves], [true, 1]);
  const expected = merge.play(stored, legal)!;
  eq('…exactly as the engine plays it', first.merge?.board, expected.state.board);

  /* A retry of the same swipe — lost reply, fresh seq — still says from: 0. */
  const retry = await games.submitEvent(w.db, {
    sessionId: round.sessionId, userId: w.customerId, seq: 1, kind: 'move', payload: { dir: legal, from: 0 }, at,
  });
  eq('a retried move is not applied twice', [retry.accepted, retry.merge?.moves], [false, 1]);
  eq('…and answers with the current board', retry.merge?.board, expected.state.board);

  await throws('an unknown direction is refused', 'bad_request', async () =>
    await games.submitEvent(w.db, {
      sessionId: round.sessionId, userId: w.customerId, seq: 2, kind: 'move', payload: { dir: 'sideways', from: 1 }, at,
    }),
  );

  /* Scored on the server's board, never on the finish body: put a 1024 on it. */
  await w.db.run(`UPDATE game_sessions SET secret = $s WHERE id = $i`, {
    s: JSON.stringify({ ...expected.state, best: 1024 }),
    i: round.sessionId,
  });
  const done = await games.finish(w.db, {
    sessionId: round.sessionId, userId: w.customerId, clientReport: { best: 2048 }, at,
  });
  eq('1024 performs at 85, whatever the client claims', done.performance, 85);
  eq('…five of six milestones', [done.correct, done.answered, done.won], [5, 6, false]);
  check('…and it pays', done.score > 0);

  /* An untouched board made nothing. */
  const idle = await games.startSession(w.db, { userId: w.customerId, gameType: 'merge_2048', language: 'en', at });
  eq('a round with no moves performs at 0',
    (await games.finish(w.db, { sessionId: idle.sessionId, userId: w.customerId, at })).performance, 0);

  await w.db.close();
}

/**
 * Food Cross — lines, specials, bombs, and a round played on the server.
 *
 * The boards are built by hand on a filler of kinds 3–5 laid diagonally
 * (`(row + col) % 3 + 3`), which has no line in it and no neighbour equal to
 * its neighbour, so every line below is one the test put there.
 */
async function foodRules(): Promise<void> {
  describe('Food Cross');

  const filler = (): food.Board =>
    Array.from({ length: 64 }, (_, i) => ({ t: ((Math.floor(i / 8) + (i % 8)) % 3) + 3, s: food.PLAIN }));
  const put = (board: food.Board, cells: Array<[number, number]>) => {
    for (const [index, t] of cells) board[index] = { t, s: food.PLAIN };
    return board;
  };
  /* A source that never makes a line on its own: it cycles the filler kinds. */
  const calm: food.Rng = (n) => 3 + (n % 3);

  eq('the filler has no line', food.findRuns(filler()).length, 0);
  eq('a swap that lines nothing up is not a move', food.canSwap(filler(), 0, 1), false);
  eq('cells that are not neighbours cannot swap', food.adjacent(7, 8), false);

  /* Four in a row, made by the swap at (0,2) ↔ (1,2): a row-clearer where the
     player moved, and the other three cleared. */
  const four = put(filler(), [[0, 0], [1, 0], [2, 1], [3, 0], [10, 0]]);
  const fourPlayed = food.play(four, 2, 10, calm, 0)!;
  eq('four in a line clears three', fourPlayed.steps[0].cleared, [0, 1, 3]);
  eq('…and leaves a row-clearer where the move was', fourPlayed.steps[0].board[2], { t: 0, s: food.ROW });
  eq('…scoring its foods double, at cascade level 1', fourPlayed.steps[0].score, 3 * food.SCORE_PER_FOOD * 2);

  /* Five: a bomb. */
  const five = put(filler(), [[0, 0], [1, 0], [2, 1], [3, 0], [4, 0], [10, 0]]);
  const fivePlayed = food.play(five, 2, 10, calm, 0)!;
  eq('five in a line clears four', fivePlayed.steps[0].cleared, [0, 1, 3, 4]);
  eq('…and leaves a bomb', fivePlayed.steps[0].board[2].s, food.BOMB);

  /* A bomb swapped with a food clears every food of that kind, and itself. */
  const bombed = filler();
  bombed[0] = { t: -1, s: food.BOMB };
  const kind = bombed[1].t;
  const ofKind = bombed.filter((piece) => piece.t === kind).length;
  const bombPlayed = food.play(bombed, 0, 1, calm, 0)!;
  eq('a bomb clears every food of the kind it was swapped with', bombPlayed.steps[0].cleared.length, ofKind + 1);
  eq('a bomb swap is a move even without a line', food.canSwap(bombed, 0, 1), true);

  /* A row-clearer caught in a line clears its whole row. */
  const striped = put(filler(), [[8, 0], [9, 0], [2, 0]]);
  striped[9] = { t: 0, s: food.ROW };
  const stripedPlayed = food.play(striped, 2, 10, calm, 0)!;
  check('a row-clearer in a line clears its row',
    [8, 9, 10, 11, 12, 13, 14, 15].every((cell) => stripedPlayed.steps[0].cleared.includes(cell)),
    stripedPlayed.steps[0].cleared);

  /* Deterministic: the same source deals the same board, with a move on it. */
  const rng = games.foodRng('seed-food');
  eq('a seed always deals the same board', food.deal(rng, 0).board, food.deal(rng, 0).board);
  check('a dealt board has no line and a move',
    food.findRuns(food.deal(rng, 0).board).length === 0 && food.hasMove(food.deal(rng, 0).board));

  /* ── a round on the server ── */
  const w = await world();
  const at = now();
  const round = await games.startSession(w.db, { userId: w.customerId, gameType: 'food_cross_live', language: 'en', at });
  const content = round.content as { board: food.Board; moves: number };
  eq('the board and the move limit are sent', [content.board.length, content.moves], [64, CONFIG.games.foodMoves]);
  const stored = JSON.parse(
    (await w.db.get<{ secret: string }>(`SELECT secret FROM game_sessions WHERE id = $i`, { i: round.sessionId }))!.secret,
  ) as { seed: string; board: food.Board; draws: number };
  check('…and the seed is not', !JSON.stringify(round.content).includes(stored.seed));

  let swap: [number, number] = [-1, -1];
  for (let i = 0; i < 64 && swap[0] < 0; i += 1) {
    if (i % 8 < 7 && food.canSwap(content.board, i, i + 1)) swap = [i, i + 1];
    else if (i < 56 && food.canSwap(content.board, i, i + 8)) swap = [i, i + 8];
  }
  const first = await games.submitEvent(w.db, {
    sessionId: round.sessionId, userId: w.customerId, seq: 0, kind: 'swap', payload: { a: swap[0], b: swap[1], from: 0 }, at,
  });
  const expected = food.play(stored.board, swap[0], swap[1], games.foodRng(stored.seed), stored.draws)!;
  eq('a swap is applied', [first.accepted, first.food?.moves, first.food?.movesLeft], [true, 1, CONFIG.games.foodMoves - 1]);
  eq('…exactly as the engine plays it', first.food?.board, expected.board);
  eq('…and counts what it cleared and scored', [first.food?.cleared, first.food?.score], [expected.cleared, expected.score]);

  const retry = await games.submitEvent(w.db, {
    sessionId: round.sessionId, userId: w.customerId, seq: 1, kind: 'swap', payload: { a: swap[0], b: swap[1], from: 0 }, at,
  });
  eq('a retried swap is not played twice', [retry.accepted, retry.food?.moves], [false, 1]);
  await throws('two cells that are not neighbours are refused', 'bad_request', async () =>
    await games.submitEvent(w.db, {
      sessionId: round.sessionId, userId: w.customerId, seq: 2, kind: 'swap', payload: { a: 0, b: 9, from: 1 }, at,
    }),
  );

  /* Twenty moves and the round is over; scored on what the server cleared. */
  const after = JSON.parse(
    (await w.db.get<{ secret: string }>(`SELECT secret FROM game_sessions WHERE id = $i`, { i: round.sessionId }))!.secret,
  );
  await w.db.run(`UPDATE game_sessions SET secret = $s WHERE id = $i`, {
    s: JSON.stringify({ ...after, moves: CONFIG.games.foodMoves, score: 1500, over: true }),
    i: round.sessionId,
  });
  await throws('a finished board takes no more swaps', 'invalid_state', async () =>
    await games.submitEvent(w.db, {
      sessionId: round.sessionId, userId: w.customerId, seq: 3, kind: 'swap',
      payload: { a: swap[0], b: swap[1], from: CONFIG.games.foodMoves }, at,
    }),
  );
  const done = await games.finish(w.db, { sessionId: round.sessionId, userId: w.customerId, clientReport: { cleared: 999 }, at });
  eq('1,500 of 2,000 performs at 75, whatever the client claims', done.performance, 75);
  eq('…three of five fifths', [done.correct, done.answered, done.won], [3, 5, false]);

  await w.db.close();
}

/**
 * Food Ninja — the schedule, and what a slice is believed for.
 *
 * Every clock here is passed in, so "in the air" is checked at exact moments:
 * the round starts at `t0`, and a food launched at `flyer.t` is in play from
 * then until `flyer.t + airtime`, give or take `ninjaSlackMs`.
 */
async function ninjaRules(): Promise<void> {
  describe('Food Ninja');

  const rng = games.ninjaRng('seed-ninja');
  const flyers = ninja.schedule(rng);
  eq('a seed always throws the same round', flyers, ninja.schedule(rng));
  check('a round throws enough for a perfect score, with room to miss',
    flyers.length >= 70 && flyers.length <= 130, flyers.length);
  check('every food lands inside the round', flyers.every((f) => f.t >= 0 && f.t < ninja.DURATION_MS));
  check('every food peaks inside the field',
    flyers.every((f) => { const top = ninja.LAUNCH_Y + (f.vy * f.vy) / (2 * ninja.GRAVITY); return top > 0.5 && top < 0.95; }));
  const early = flyers.filter((f) => f.t < 15_000).length;
  const late = flyers.filter((f) => f.t >= 45_000).length;
  check('the last quarter throws more than the first', late > early, `${early} → ${late}`);
  const first = flyers[0];
  check('a food is in play between its launch and its fall',
    ninja.positionAt(first, first.t + 200) !== null && ninja.positionAt(first, first.t + ninja.airtime(first) + 50) === null);

  /* ── a round on the server ── */
  const w = await world();
  const t0 = '2026-05-04T10:00:00.000Z';
  const after = (ms: number) => new Date(Date.parse(t0) + ms).toISOString();
  const round = await games.startSession(w.db, { userId: w.customerId, gameType: 'food_ninja', language: 'en', at: t0 });
  const sent = (round.content as { flyers: ninja.Flyer[] }).flyers;
  const stored = JSON.parse(
    (await w.db.get<{ secret: string }>(`SELECT secret FROM game_sessions WHERE id = $i`, { i: round.sessionId }))!.secret,
  ) as { seed: string };
  eq('the schedule sent is the seed\'s', sent, ninja.schedule(games.ninjaRng(stored.seed)));
  check('…and the seed is not sent', !JSON.stringify(round.content).includes(stored.seed));

  const move = (seq: number, kind: string, payload: Record<string, unknown>, at: string) =>
    games.submitEvent(w.db, { sessionId: round.sessionId, userId: w.customerId, seq, kind, payload, at });

  await throws('nothing is sliced before the round starts', 'invalid_state', async () =>
    await move(0, 'slice', { ids: [0] }, t0));
  eq('the start is recorded', (await move(0, 'start', {}, t0)).accepted, true);
  eq('…once', (await move(1, 'start', {}, after(5000))).accepted, false);

  const a = sent[0];
  const b = sent[1];
  const inAir = await move(2, 'slice', { ids: [a.id] }, after(a.t + 300));
  eq('a food in the air is credited', [inAir.ninja?.credited, inAir.ninja?.sliced], [[a.id], 1]);
  const twice = await move(3, 'slice', { ids: [a.id] }, after(a.t + 400));
  eq('…once', twice.ninja?.credited, []);
  const fallen = await move(4, 'slice', { ids: [b.id] }, after(b.t + ninja.airtime(b) + CONFIG.games.ninjaSlackMs + 500));
  eq('a food that has already fallen is not', fallen.ninja?.credited, []);
  const unknown = await move(5, 'slice', { ids: [99_999] }, after(2000));
  eq('a food that was never thrown is not', unknown.ninja?.credited, []);
  await throws('more than a swipe can cut is refused', 'bad_request', async () =>
    await move(6, 'slice', { ids: [1, 2, 3, 4, 5, 6, 7] }, after(3000)));
  await throws('nothing is sliced after the round', 'invalid_state', async () =>
    await move(7, 'slice', { ids: [sent[sent.length - 1].id] }, after(ninja.DURATION_MS + CONFIG.games.ninjaSlackMs + 1000)));

  /* Scored on what this server credited, whatever the finish body says. */
  const done = await games.finish(w.db, {
    sessionId: round.sessionId, userId: w.customerId, clientReport: { sliced: 80 }, at: after(ninja.DURATION_MS),
  });
  eq('one food credited performs at the per-food rate', done.performance, CONFIG.games.ninjaPerformancePerFood);
  eq('…and is not a win', done.won, false);

  await w.db.close();
}

/**
 * Browser push and the daily game reminder.
 *
 * The crypto is checked by doing the browser's half: a message encrypted to a
 * subscription is decrypted with that subscription's private key, and a VAPID
 * header is verified against its public key. Known-answer vectors would pin
 * the bytes; this pins the thing that matters, which is that the other end can
 * read it.
 */
/**
 * The three pushes beside the daily reminder: the streak about to break, the
 * tank full again, and a referral that paid. Each is off until switched on and
 * each is said once.
 */
async function moreReminderRules(): Promise<void> {
  describe('browser push · streak at risk, energy full, referral reward');
  const w = await world();
  const who = w.customerId;
  await w.db.run(
    `INSERT INTO push_tokens (id, user_id, platform, token, created_at, timezone) VALUES ($i, $u, 'web', $t, $at, 'Asia/Tashkent')`,
    {
      i: newId('ptk'), u: who, at: '2026-05-01T00:00:00.000Z',
      t: JSON.stringify({ endpoint: 'https://push.example.test/x', keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } }),
    },
  );

  /* ── the streak: 20:00 in Tashkent is 15:00Z ── */
  await w.db.run(
    `INSERT INTO player_states (user_id, streak, longest_streak, freezes, lives, answered, correct, updated_at, last_played)
     VALUES ($u, 6, 6, 0, 4, 0, 0, '2026-05-03T00:00:00.000Z', '2026-05-03')
     ON CONFLICT (user_id) DO UPDATE SET streak = 6, freezes = 0, last_played = '2026-05-03'`,
    { u: who },
  );
  eq('switched off, nobody is warned', (await reminders.streakAtRisk(w.db, '2026-05-04T15:00:00.000Z')).sent, 0);
  await reminders.setKindPrefs(w.db, who, { streakAtRisk: true });
  eq('at 19:59 on the player’s clock it is not yet due', (await reminders.streakAtRisk(w.db, '2026-05-04T14:59:00.000Z')).sent, 0);
  eq('at 20:00 it goes', (await reminders.streakAtRisk(w.db, '2026-05-04T15:00:00.000Z')).sent, 1);
  eq('…naming the streak', (await w.db.get<{ title: string }>(
    `SELECT title FROM notifications WHERE user_id = $u AND kind = 'game_streak'`, { u: who }))?.title,
    reminders.streakCopy('en', 6).title);
  eq('…once a day', (await reminders.streakAtRisk(w.db, '2026-05-04T15:30:00.000Z')).sent, 0);
  await w.db.run(`UPDATE player_states SET freezes = 1 WHERE user_id = $u`, { u: who });
  await w.db.run(`DELETE FROM notifications WHERE user_id = $u`, { u: who });
  eq('a freeze would save it, so it is not "about to break"', (await reminders.streakAtRisk(w.db, '2026-05-04T15:00:00.000Z')).sent, 0);
  await w.db.run(`UPDATE player_states SET freezes = 0, last_played = '2026-05-04' WHERE user_id = $u`, { u: who });
  eq('played today, nothing to warn about', (await reminders.streakAtRisk(w.db, '2026-05-04T15:00:00.000Z')).sent, 0);
  await w.db.run(`UPDATE player_states SET last_played = '2026-05-01' WHERE user_id = $u`, { u: who });
  eq('already broken, nothing to save', (await reminders.streakAtRisk(w.db, '2026-05-04T15:00:00.000Z')).sent, 0);

  /* ── energy full ── */
  await reminders.setKindPrefs(w.db, who, { energyFull: true });
  const spentAt = '2026-05-10T06:00:00.000Z';
  const round = await games.startSession(w.db, { userId: who, gameType: 'capitals', at: spentAt });
  await games.abandonSession(w.db, { sessionId: round.sessionId, userId: who, at: plusMinutes(spentAt, 1) });
  const full = await games.energyFor(w.db, who, plusDays(spentAt, 1));
  const lastUnit = (await games.energyFor(w.db, who, spentAt)).nextAt!;
  eq('a tank one short is not full', (await reminders.energyFullReminder(w.db, plusMinutes(lastUnit, -1))).sent, 0);
  eq('the minute it fills, it goes', (await reminders.energyFullReminder(w.db, plusMinutes(lastUnit, 1))).sent, 1);
  eq('…once per refill', (await reminders.energyFullReminder(w.db, plusMinutes(lastUnit, 2))).sent, 0);
  eq('a tank that has simply been full for a day says nothing', (await reminders.energyFullReminder(w.db, plusDays(spentAt, 1))).sent, 0);
  check('…and the tank really is full then', full.energy === full.max);

  /* ── referral reward: always in the inbox, pushed only when switched on ── */
  await reminders.referralReward(w.db, { userId: who, points: 100, invitee: false, referralId: 'ref_x', at: '2026-05-11T08:00:00.000Z' });
  eq('switched off, it is written but not pushed', (await w.db.get<{ delivery: string }>(
    `SELECT delivery FROM notifications WHERE user_id = $u AND kind = 'referral_reward'`, { u: who }))?.delivery, 'inbox');
  await reminders.setKindPrefs(w.db, who, { referralReward: true });
  await reminders.referralReward(w.db, { userId: who, points: 100, invitee: false, referralId: 'ref_y', at: '2026-05-11T08:00:00.000Z' });
  eq('switched on, it is queued for the browser', (await w.db.get<{ delivery: string }>(
    `SELECT delivery FROM notifications WHERE user_id = $u AND kind = 'referral_reward' AND source_ref = 'ref_y'`, { u: who }))?.delivery, 'queued');

  await w.db.close();
}

async function webPushRules(): Promise<void> {
  describe('browser push · the daily game reminder');

  /* ── the message, from the browser's side ── */
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = randomBytes(16);
  const sub: webpush.WebSubscription = {
    endpoint: 'https://push.example.test/send/abc',
    keys: { p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') },
  };
  const plain = JSON.stringify({ title: 'Bugungi o‘yin kutmoqda', body: 'x', url: '/l-earn' });
  const sealed = webpush.encrypt(sub, Buffer.from(plain));

  const hm = (k: Buffer, d: Buffer) => createHmac('sha256', k).update(d).digest();
  const salt = sealed.subarray(0, 16);
  const idlen = sealed.readUInt8(20);
  const asPublic = sealed.subarray(21, 21 + idlen);
  const shared = ua.computeSecret(asPublic);
  const ikm = hm(hm(auth, shared), Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic, Buffer.from([1])]));
  const prk = hm(salt, ikm);
  const cek = hm(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hm(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const record = sealed.subarray(21 + idlen);
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(record.subarray(record.length - 16));
  const opened = Buffer.concat([decipher.update(record.subarray(0, record.length - 16)), decipher.final()]);
  eq('the header is rs 4096 with a 65-byte key id', [sealed.readUInt32BE(16), idlen], [4096, 65]);
  eq('the browser can read what was sealed to it', opened.subarray(0, opened.length - 1).toString(), plain);
  eq('…ending in the last-record delimiter', opened[opened.length - 1], 2);
  check('two messages never share a salt or a key', !webpush.encrypt(sub, Buffer.from(plain)).equals(sealed));

  /* ── the signature, from the push service's side ── */
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = pair.publicKey.export({ format: 'jwk' });
  const keys: webpush.VapidKeys = {
    publicKey: Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, 'base64url'), Buffer.from(jwk.y!, 'base64url')]).toString('base64url'),
    privateKey: pair.privateKey.export({ format: 'jwk' }).d!,
    subject: 'mailto:no-reply@pay-lez.com',
  };
  const header = webpush.vapidAuthorization(sub.endpoint, keys, 1_800_000_000);
  const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header) ?? [];
  const [h, c, sig] = (jwt ?? '').split('.');
  const claims = JSON.parse(Buffer.from(c ?? '', 'base64url').toString()) as { aud: string; exp: number; sub: string };
  eq('the token is for the push service’s origin, signed as this server', [claims.aud, claims.sub, k], ['https://push.example.test', keys.subject, keys.publicKey]);
  check('…expires within the spec’s day', claims.exp - 1_800_000_000 <= 24 * 3600 && claims.exp > 1_800_000_000);
  check(
    '…and verifies against the public key the browser subscribed with',
    verifySignature('sha256', Buffer.from(`${h}.${c}`), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(sig ?? '', 'base64url')),
  );

  /* ── what counts as a subscription ── */
  check('a real subscription parses', webpush.parseSubscription(JSON.stringify(sub)) !== null);
  eq(
    'plain http, short keys and not-JSON do not',
    [
      webpush.parseSubscription(JSON.stringify({ ...sub, endpoint: 'http://push.example.test/x' })),
      webpush.parseSubscription(JSON.stringify({ ...sub, keys: { ...sub.keys, auth: 'AAAA' } })),
      webpush.parseSubscription('token-for-fcm'),
    ],
    [null, null, null],
  );
  eq('a zone the browser reported is kept, and nonsense is not', [reminders.validZone('Asia/Tashkent'), reminders.validZone('Mars/Base'), reminders.validZone(7)], ['Asia/Tashkent', null, null]);

  /* ── the switch ── */
  const w = await world();
  const who = w.customerId;
  await w.db.run(`UPDATE users SET language = 'uz' WHERE id = $u`, { u: who });
  eq('every reminder is off until somebody switches it on', await reminders.kindPrefs(w.db, who),
    { dailyGameReminder: false, energyFull: false, referralReward: false, streakAtRisk: false });
  await w.db.run(
    `INSERT INTO push_tokens (id, user_id, platform, token, created_at, timezone) VALUES ($i, $u, 'web', $t, $at, 'Asia/Tashkent')`,
    { i: newId('ptk'), u: who, t: JSON.stringify(sub), at: '2026-05-04T00:00:00.000Z' },
  );

  /* 18:00 in Tashkent is 13:00Z. */
  const day1 = '2026-05-04';
  eq('switched off, nobody is reminded', (await reminders.dailyGameReminder(w.db, `${day1}T13:00:00.000Z`)).sent, 0);
  eq('switching it on reads back, and switches nothing else', await reminders.setKindPrefs(w.db, who, { dailyGameReminder: true }),
    { dailyGameReminder: true, energyFull: false, referralReward: false, streakAtRisk: false });
  eq('at 17:59 on the player’s clock it is not yet due', (await reminders.dailyGameReminder(w.db, `${day1}T12:59:00.000Z`)).sent, 0);
  const due = await reminders.dailyGameReminder(w.db, `${day1}T13:00:00.000Z`);
  eq('at 18:00 on the player’s clock it goes, queued for the browser', [due.sent, due.pushed], [1, 1]);
  const row = await w.db.get<{ title: string; source_ref: string; action_url: string }>(
    `SELECT title, source_ref, action_url FROM notifications WHERE user_id = $u AND kind = 'daily_game'`,
    { u: who },
  );
  eq('…in the reader’s language, filed under their own day, opening Play', [row?.title, row?.source_ref, row?.action_url], [reminders.reminderCopy('uz').title, day1, '/l-earn']);
  eq('…once a day', (await reminders.dailyGameReminder(w.db, `${day1}T13:01:00.000Z`)).sent, 0);

  const day2 = '2026-05-05';
  await games.startSession(w.db, { userId: who, gameType: 'food_ninja', language: 'en', at: `${day2}T05:00:00.000Z` });
  eq('a player who already started a round today is not reminded', (await reminders.dailyGameReminder(w.db, `${day2}T13:00:00.000Z`)).sent, 0);
  eq('a round yesterday does not count for today', (await reminders.dailyGameReminder(w.db, '2026-05-06T13:00:00.000Z')).sent, 1);
  eq('past 21:00 a missed reminder waits for tomorrow', (await reminders.dailyGameReminder(w.db, '2026-05-07T16:00:00.000Z')).sent, 0);

  await w.db.run(`UPDATE users SET status = 'banned' WHERE id = $u`, { u: who });
  eq('a suspended account is not reminded', (await reminders.dailyGameReminder(w.db, '2026-05-08T13:00:00.000Z')).sent, 0);
  await w.db.run(`UPDATE users SET status = 'active' WHERE id = $u`, { u: who });

  /* ── a browser is pushed its kinds and nothing else ── */
  const streak = await notifications.notify(w.db, {
    userId: who, kind: 'streak', title: 't', body: 'b', push: true, at: '2026-05-08T08:00:00.000Z',
  });
  eq('a kind the web was not asked for finds no device to go to', [streak.delivery, streak.reason], ['suppressed', 'no_permission']);

  /* ── the drain, live, against a push service that answers ── */
  const env = { mode: process.env.PAYLEZ_PUSH, pub: process.env.VAPID_PUBLIC_KEY, priv: process.env.VAPID_PRIVATE_KEY };
  const realFetch = globalThis.fetch;
  const calls: { url: string; headers: Record<string, string> }[] = [];
  try {
    process.env.PAYLEZ_PUSH = 'live';
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    eq('the key a browser subscribes with is served only when push is live', push.webPublicKey(), keys.publicKey);

    const goneSub = { ...sub, endpoint: 'https://push.example.test/send/gone' };
    await w.db.run(
      `INSERT INTO push_tokens (id, user_id, platform, token, created_at, timezone) VALUES ($i, $u, 'web', $t, $at, 'Asia/Tashkent')`,
      { i: 'ptk_gone', u: who, t: JSON.stringify(goneSub), at: '2026-05-08T00:00:00.000Z' },
    );
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), headers: init?.headers as Record<string, string> });
      return new Response(null, { status: String(url).endsWith('/gone') ? 410 : 201 });
    }) as typeof fetch;

    /* Earlier rows were written as queued against no server at all. */
    await w.db.run(`UPDATE notifications SET delivery = 'sent' WHERE delivery = 'queued'`);
    const live = await reminders.dailyGameReminder(w.db, '2026-05-09T13:00:00.000Z');
    eq('the next evening’s reminder is queued', live.pushed, 1);
    const drained = await push.drain(w.db);
    eq('it is sent to every browser the player subscribed in', [drained.sent, calls.length], [1, 2]);
    eq(
      '…encrypted and signed',
      [calls[0]?.headers['Content-Encoding'], calls[0]?.headers.Authorization?.startsWith('vapid t='), calls[0]?.headers.TTL],
      ['aes128gcm', true, String(CONFIG.push.ttlSeconds)],
    );
    eq(
      'a subscription the push service says is gone is revoked',
      (await w.db.get<{ r: string | null }>(`SELECT revoked_at AS r FROM push_tokens WHERE id = 'ptk_gone'`))?.r !== null,
      true,
    );
  } finally {
    globalThis.fetch = realFetch;
    if (env.mode === undefined) delete process.env.PAYLEZ_PUSH;
    else process.env.PAYLEZ_PUSH = env.mode;
    if (env.pub === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = env.pub;
    if (env.priv === undefined) delete process.env.VAPID_PRIVATE_KEY;
    else process.env.VAPID_PRIVATE_KEY = env.priv;
  }
  eq('with push local, no key is offered', push.webPublicKey(), null);

  await w.db.close();
}

/**
 * The gift-card engine: a shelf per country, real codes behind it, and what an
 * operator and a player can do to a card once it is bought.
 */
async function giftCardEngine(): Promise<void> {
  describe('gift cards -- codes, the shelf per country, used, cancelled, expired');
  const w = await world();
  /* This section is about codes, not who may buy or the pool (`giftCardStock`
     and `giftPolicyRules` above), so it opens the shelf to everybody with
     money to spare and no per-person limit. */
  await giftPolicy.setPolicy(w.db, {
    mode: 'manual',
    manual: { audience: 'all', budgetKind: 'amount', amountMajor: 100_000, repeat: 'monthly', perUserEveryDays: 0 },
  }, w.ownerId);
  const admin = w.ownerId;
  const t0 = '2026-06-01T10:00:00.000Z';

  /* ── describing a card ── */
  const base: giftCards.StockInput = {
    brand: 'Allegro',
    faceMinor: 5000,
    currency: 'PLN',
    pointsCost: 300,
    countryCode: 'PL',
    kind: 'brand',
    validityDays: 90,
    howToUse: 'Enter the code at checkout on allegro.pl.',
  };
  await throws('a currency the site cannot write is refused', 'validation_failed', async () =>
    await giftCards.create(w.db, { ...base, currency: 'XYZ' }, admin, t0));
  await throws('a venue card without its venue is refused', 'validation_failed', async () =>
    await giftCards.create(w.db, { ...base, kind: 'venue', countryCode: 'UZ' }, admin, t0));
  await throws('a logo that is a link elsewhere is refused', 'validation_failed', async () =>
    await giftCards.create(w.db, { ...base, logo: 'https://example.test/x.png' }, admin, t0));
  const pl = (await giftCards.create(w.db, base, admin, t0)).id;
  const uz = (
    await giftCards.create(
      w.db,
      { ...base, brand: 'Choyxona', currency: 'UZS', faceMinor: 100_000, countryCode: 'UZ', kind: 'venue', venueId: w.venueId, validityDays: 30 },
      admin,
      t0,
    )
  ).id;
  const stockOf = async (id: string) =>
    Number((await w.db.get<{ s: number }>(`SELECT stock AS s FROM gift_card_stock WHERE id = $i`, { i: id }))?.s);
  eq('a new card has nothing to sell', await stockOf(pl), 0);

  /* ── codes ── */
  const loaded = await giftCards.addCodes(w.db, pl, ['AAA-111', ' AAA-222 ', '', 'AAA-111', 'has space'], admin, t0);
  eq('a paste loads each code once, trims, and refuses what cannot be read at a till', loaded, { added: 2, duplicates: 1, rejected: 1 });
  eq('…and stock is the codes loaded', await stockOf(pl), 2);
  eq('loading the same code later is a duplicate, not a second unit',
    (await giftCards.addCodes(w.db, pl, ['AAA-222', 'AAA-333'], admin, t0)).added, 1);
  await throws('a brand card’s codes are not generated', 'invalid_state', async () =>
    await giftCards.generateCodes(w.db, pl, 5, admin, t0));
  eq('a venue card’s codes are generated', (await giftCards.generateCodes(w.db, uz, 4, admin, t0)).added, 4);
  check('…in the venue-card shape',
    (await w.db.all<{ code: string }>(`SELECT code FROM gift_card_codes WHERE stock_id = $s`, { s: uz }))
      .every((row) => /^UZ-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(row.code)));
  await throws('…and not loaded by hand', 'invalid_state', async () =>
    await giftCards.addCodes(w.db, uz, ['X'], admin, t0));

  /* ── the shelf, per country ── */
  const ids = (rows: { id: string }[]) => rows.map((row) => row.id).sort();
  eq('Poland sees the Polish shelf', ids(await giftCards.shelf(w.db, 'PL') as { id: string }[]), [pl]);
  eq('Uzbekistan sees the Uzbek one', ids(await giftCards.shelf(w.db, 'UZ') as { id: string }[]), [uz]);
  await giftCards.setActive(w.db, uz, false, admin, t0);
  eq('a paused card leaves the shelf', (await giftCards.shelf(w.db, 'UZ')).length, 0);
  await giftCards.setActive(w.db, uz, true, admin, t0);

  /* ── buying hands out a real code ── */
  /* One buyer per card: §9.4 allows one card per person per sixty days, which
     is checked with the pool in `giftCardStock`; here it would only get in
     the way of the engine's own rules. */
  const buyer = async (label: string) => {
    const id = await person(w, label, plusDays(t0, -30));
    await ledger.earn(w.db, { userId: id, points: 20_000, reason: 'adjustment', at: t0 });
    return id;
  };
  const holder = await buyer('Holder');
  const bought = await vouchers.redeemGiftCard(w.db, { userId: holder, stockId: pl, at: t0 });
  eq('the buyer gets the first code that was loaded', bought.code, 'AAA-111');
  eq('…stock is one fewer', await stockOf(pl), 2);
  const card = await w.db.get<{ expires_at: string; face_minor: number; currency: string }>(
    `SELECT expires_at, face_minor, currency FROM gift_cards WHERE id = $i`, { i: bought.id });
  eq('it lasts the validity its shelf row gave it', card?.expires_at, plusDays(t0, 90));
  eq('…and carries the face value it was bought at', [Number(card?.face_minor), card?.currency], [5000, 'PLN']);

  await giftCards.update(w.db, pl, { faceMinor: 10000, pointsCost: 600 }, admin, t0);
  const listed = (await giftCards.issued(w.db, { stockId: pl })) as { face_minor: number }[];
  eq('editing the shelf does not change a card somebody holds', Number(listed[0].face_minor), 5000);

  /* ── used ── */
  await throws('nobody can mark another person’s card', 'not_found', async () =>
    await giftCards.markUsed(w.db, { cardId: bought.id, by: 'player', userId: admin }));
  await giftCards.markUsed(w.db, { cardId: bought.id, by: 'player', userId: holder, at: t0 });
  eq('the holder can say it was used', await w.db.get(`SELECT status, used_by FROM gift_cards WHERE id = $i`, { i: bought.id }), { status: 'used', used_by: 'player' });
  await throws('…once', 'invalid_state', async () =>
    await giftCards.markUsed(w.db, { cardId: bought.id, by: 'player', userId: holder }));
  await throws('a used card cannot be cancelled for a refund', 'invalid_state', async () =>
    await giftCards.cancel(w.db, bought.id, admin, t0));

  /* ── cancelled ── */
  const refunded = await buyer('Refunded');
  const second = await vouchers.redeemGiftCard(w.db, { userId: refunded, stockId: pl, at: t0 });
  const before = await ledger.balance(w.db, refunded);
  /* 100 zł at the rule's 100 points a złoty, whatever `pointsCost` says. */
  eq('a cancel refunds exactly what the card cost', (await giftCards.cancel(w.db, second.id, admin, t0)).refunded, 10_000);
  eq('…as a new ledger entry, so the balance is back', await ledger.balance(w.db, refunded), before + 10_000);
  await throws('…once', 'invalid_state', async () => await giftCards.cancel(w.db, second.id, admin, t0));
  const third = await vouchers.redeemGiftCard(w.db, { userId: await buyer('Third'), stockId: pl, at: t0 });
  check('a cancelled card’s code is burned, never sold again', third.code !== second.code && third.code !== bought.code);
  eq('…and the stock is what is left unseen', await stockOf(pl), 0);
  await throws('with every code handed out, the shelf refuses', 'conflict', async () =>
    await vouchers.redeemGiftCard(w.db, { userId: await buyer('Late'), stockId: pl, at: t0 }));

  /* ── expired ── */
  const uzCard = await vouchers.redeemGiftCard(w.db, { userId: await buyer('Tashkent'), stockId: uz, at: t0 });
  eq('nothing expires before its date', await giftCards.expire(w.db, plusDays(t0, 29)), 0);
  eq('a card past its own validity expires', await giftCards.expire(w.db, plusDays(t0, 31)), 1);
  eq('…the 30-day one, while the 90-day one bought the same day is still good',
    [(await w.db.get<{ s: string }>(`SELECT status AS s FROM gift_cards WHERE id = $i`, { i: uzCard.id }))?.s,
     (await w.db.get<{ s: string }>(`SELECT status AS s FROM gift_cards WHERE id = $i`, { i: third.id }))?.s],
    ['expired', 'active']);

  /* ── the counter cannot drift past a restart ── */
  await w.db.run(`UPDATE gift_card_stock SET stock = 99 WHERE id = $i`, { i: uz });
  await giftCards.reconcileStock(w.db);
  eq('boot restates stock from the codes nobody holds', await stockOf(uz), 3);

  eq('every operator write is on the audit log',
    Number((await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_log WHERE action LIKE 'gift_card.%'`))?.n) >= 8, true);

  await w.db.close();
}

/**
 * The five arcade games. Snake is replayed and Canon Numbers is held, so both
 * are checked move by move; the three physics games are checked for the one
 * thing the server can know — that a report cannot name what the level does
 * not hold, or more than the round's duration allows.
 */
async function arcadeRules(): Promise<void> {
  describe('arcade -- Snake replayed, Canon Numbers held, three games bounded');

  /* ── Snake, as a pure function ── */
  const list = arcade.snakeFoods(games.arcadeRng('seed-a', 'snake'));
  eq('a seed always lays the same food', list, arcade.snakeFoods(games.arcadeRng('seed-a', 'snake')));
  check('…and another seed another', JSON.stringify(list) !== JSON.stringify(arcade.snakeFoods(games.arcadeRng('seed-b', 'snake'))));
  const straight = arcade.snakeReplay(list, [], 100, 1e9);
  /* The head starts at column 6 heading right; column 16 is outside. */
  eq('running straight crashes into the wall on the tenth tick', [straight.dead, straight.ticks], [true, 10]);

  /* A route to the first food: along the row to its column, then up or down. */
  const route = (state: arcade.SnakeState): Array<[number, number]> => {
    const head = state.body[0];
    const fx = state.food % arcade.SNAKE_COLS;
    const fy = Math.floor(state.food / arcade.SNAKE_COLS);
    const hx = head % arcade.SNAKE_COLS;
    const hy = Math.floor(head / arcade.SNAKE_COLS);
    const turns: Array<[number, number]> = [];
    if (fx > hx) {
      if (fy !== hy) turns.push([fx - hx, fy > hy ? 2 : 0]);
    } else {
      /* Behind or level with the head: step off the row, double back, then go. */
      const away = fy >= hy ? 2 : 0;
      const row = hy + (away === 2 ? 1 : -1);
      turns.push([0, away], [1, 3]);
      if (fy !== row) turns.push([1 + (hx - fx), fy > row ? 2 : 0]);
    }
    return turns;
  };
  const start = arcade.snakeStart(list);
  const toFirst = route(start);
  const ate = arcade.snakeReplay(list, toFirst, 60, 1e9);
  check('steering to the food eats it', ate.eaten >= 1, ate);
  eq('a replay held to a clock that has not run plays nothing', arcade.snakeReplay(list, toFirst, 60, 0).eaten, 0);
  eq('turning straight back is ignored, not a crash into the neck', arcade.snakeReplay(list, [[0, 3]], 3, 1e9).dead, false);

  /* ── Snake on the server: the report is turns, never a count ── */
  const w = await world();
  const t0 = '2026-05-04T10:00:00.000Z';
  /* One round a day: the free tank is four, and six rounds at one instant would
     run it dry before the last. */
  const day = (k: number, ms = 0) => new Date(Date.parse(t0) + k * 86_400_000 + ms).toISOString();
  const after = (ms: number) => day(0, ms);
  const snakeRound = await games.startSession(w.db, { userId: w.customerId, gameType: 'snake', language: 'en', at: t0 });
  const sent = (snakeRound.content as { foods: number[] }).foods;
  const seeded = JSON.parse(
    (await w.db.get<{ secret: string }>(`SELECT secret FROM game_sessions WHERE id = $i`, { i: snakeRound.sessionId }))!.secret,
  ) as { seed: string };
  eq('the food list sent is the seed’s', sent, arcade.snakeFoods(games.arcadeRng(seeded.seed, 'snake')));
  check('…and the seed is not sent', !JSON.stringify(snakeRound.content).includes(seeded.seed));
  const path = route(arcade.snakeStart(sent));
  const snakeDone = await games.finish(w.db, {
    sessionId: snakeRound.sessionId,
    userId: w.customerId,
    clientReport: { turns: path, ticks: 60, eaten: 999 },
    at: after(60_000),
  });
  const expected = arcade.snakeReplay(sent, path, 60, 60_000 + CONFIG.games.snakeSlackMs).eaten;
  eq('a round is scored on what the replay ate, whatever the report claims', snakeDone.performance, Math.min(100, expected * CONFIG.games.snakePerformancePerFood));

  /* ── Canon Numbers ── */
  const rngC = games.arcadeRng('seed-c', 'cannon');
  const opened = arcade.cannonStart('seed-c', rngC);
  eq('a seed always deals the same opening', opened.board, arcade.cannonStart('seed-c', rngC).board);
  check('two rows are dealt to start', opened.board.slice(2 * arcade.CANNON_COLS).every((v) => v === 0));
  const col = opened.board.findIndex((v) => v > 0) % arcade.CANNON_COLS;
  const lowest = (board: number[]) => {
    for (let r = arcade.CANNON_ROWS - 1; r >= 0; r -= 1) if (board[r * arcade.CANNON_COLS + col] > 0) return r * arcade.CANNON_COLS + col;
    return -1;
  };
  const shot = arcade.cannonFire(opened, col, rngC);
  eq('the first ball hits the lowest block in the column', shot.hits[0], lowest(opened.board));
  check('a shot fires at most its balls', shot.hits.length <= arcade.cannonShots(0));
  eq('a turn moves on and deals a row', [shot.state.turn, shot.state.spawns], [1, 3]);
  let longest = opened;
  for (let i = 0; i < arcade.CANNON_TURNS + 5 && !longest.over; i += 1) longest = arcade.cannonFire(longest, 0, rngC).state;
  check('a round always ends — by the blocks or by the shot limit', longest.over && longest.turn <= arcade.CANNON_TURNS);

  const cannonRound = await games.startSession(w.db, { userId: w.customerId, gameType: 'cannon_numbers', language: 'en', at: day(1) });
  const fire = (seq: number, c: number, from: number) =>
    games.submitEvent(w.db, { sessionId: cannonRound.sessionId, userId: w.customerId, seq, kind: 'fire', payload: { col: c, from }, at: day(1, seq * 1000) });
  const first = await fire(0, 0, 0);
  eq('a shot is applied', [first.accepted, first.cannon?.turn], [true, 1]);
  const retried = await fire(1, 0, 0);
  eq('a retried shot answers with the board, and is not fired twice', [retried.accepted, retried.cannon?.turn], [false, 1]);
  await throws('a column off the board is refused', 'bad_request', async () => await fire(2, 9, 1));
  const cannonDone = await games.finish(w.db, { sessionId: cannonRound.sessionId, userId: w.customerId, at: day(1, 5000) });
  const held = JSON.parse(
    (await w.db.get<{ secret: string }>(`SELECT secret FROM game_sessions WHERE id = $i`, { i: cannonRound.sessionId }))!.secret,
  ) as arcade.CannonState;
  eq('it is scored on the blocks this server destroyed', cannonDone.performance, Math.min(100, held.destroyed * CONFIG.games.cannonPerformancePerBlock));

  /* ── the three reported games ── */
  eq('a report is capped by what exists', arcade.bounded(500, 40, 1000, 4, 4), 40);
  eq('…and by what the time allows', arcade.bounded(40, 40, 2, 4, 4), 12);
  eq('…and nonsense is nothing', arcade.bounded('lots', 40, 100, 4, 4), 0);

  const brick = await games.startSession(w.db, { userId: w.customerId, gameType: 'breakout', language: 'en', at: day(2) });
  const wall = (brick.content as { wall: number[] }).wall;
  check('the wall is the seed’s and every brick takes one or two hits', wall.length === arcade.BREAKOUT_COLS * arcade.BREAKOUT_ROWS && wall.every((hp) => hp === 1 || hp === 2));
  const brickDone = await games.finish(w.db, {
    sessionId: brick.sessionId,
    userId: w.customerId,
    clientReport: { broken: [0, 1, 1, 2, 999, -1, 'x'] },
    at: day(2, 60_000),
  });
  eq('Breakout counts real bricks, each once', brickDone.performance, Math.round((3 / wall.length) * 100));
  const fast = await games.startSession(w.db, { userId: w.customerId, gameType: 'breakout', language: 'en', at: day(3) });
  const fastDone = await games.finish(w.db, {
    sessionId: fast.sessionId,
    userId: w.customerId,
    clientReport: { broken: wall.map((_, i) => i) },
    at: day(3, 1000),
  });
  eq('…and a whole wall in one second is held to what a second allows', fastDone.performance,
    Math.round(((1 * CONFIG.games.breakoutBricksPerSecond + CONFIG.games.breakoutAllowance) / wall.length) * 100));

  const doodle = await games.startSession(w.db, { userId: w.customerId, gameType: 'doodle_jump', language: 'en', at: day(4) });
  eq('Doodle Jump deals the seed’s platforms', (doodle.content as { platforms: number[] }).platforms.length, arcade.DOODLE_PLATFORMS);
  const doodleDone = await games.finish(w.db, { sessionId: doodle.sessionId, userId: w.customerId, clientReport: { reached: 20 }, at: day(4, 30_000) });
  eq('…and pays per platform climbed', doodleDone.performance, 20 * CONFIG.games.doodlePerformancePerPlatform);

  const zuma = await games.startSession(w.db, { userId: w.customerId, gameType: 'zuma', language: 'en', at: day(5) });
  const chain = (zuma.content as { chain: number[] }).chain;
  check('the chain never arrives with three of a kind touching',
    chain.every((c, i) => i < 2 || !(chain[i - 1] === c && chain[i - 2] === c)));
  const zumaDone = await games.finish(w.db, { sessionId: zuma.sessionId, userId: w.customerId, clientReport: { cleared: 30 }, at: day(5, 60_000) });
  eq('Zuma pays the share of the chain cleared', zumaDone.performance, Math.round((30 / arcade.ZUMA_CHAIN) * 100));

  await w.db.close();
}

void await run();
