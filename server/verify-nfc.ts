/**
 * NFC taps end to end — `NFC.md`. The crypto has its own vectors in
 * `verify.ts`'s `crypto()`; this is the gate around it: the registry, the
 * counter, the per-tag ceiling, the website's resolve, and the routes.
 *
 * Its own module, like `verify-catalogue.ts`: `verify.ts` can run it with its
 * harness (`await nfcTaps({ describe, check, eq })`), and it runs alone too —
 *
 *   node server/verify-nfc.ts
 */
import { pathToFileURL } from 'node:url';
import { openDb } from './db/db.ts';
import { allRoutes } from './http/routes/index.ts';
import { createApi } from './http/server.ts';
import * as accounts from './domain/accounts.ts';
import * as gate from './domain/gate.ts';
import { DomainError } from './domain/errors.ts';
import { newId } from './domain/ids.ts';
import { seedPlatform } from './domain/settings.ts';
import { localMonth, now, plusDays, type Iso } from './domain/time.ts';
import { mintTap } from './crypto/nfc.ts';

export interface Harness {
  describe: (name: string) => void;
  check: (what: string, condition: boolean, detail?: unknown) => void;
  eq: (what: string, actual: unknown, expected: unknown) => void;
}

const SECRET = 'verify-nfc-secret';
const VENUE_TZ = 'Europe/Warsaw';
/** A documentation-range address, so the connection limits see one caller. */
const fakeAddress = (_label: string) => '198.51.100.201';

/** One owner, one customer, one live venue with a budget — `verify.ts`'s `world()`, trimmed. */
async function world() {
  const db = await openDb(':memory:');
  await seedPlatform(db);
  const at = now();
  const ownerId = newId('usr');
  const customerId = newId('usr');
  const venueId = newId('ven');
  await db.tx(async () => {
    for (const [id, email, name] of [
      [ownerId, 'owner@nfc.test', 'Owner'],
      [customerId, 'customer@nfc.test', 'Customer'],
    ]) {
      await db.run(
        `INSERT INTO users (id, email, email_norm, display_name, auth_provider, language, city,
                            status, email_verified_at, created_at, updated_at)
         VALUES ($i, $e, $e, $n, 'email', 'en', 'Krakow', 'active', $t, $t, $t)`,
        { i: id, e: email, n: name, t: at },
      );
      await db.run(`INSERT INTO user_roles (user_id, role, granted_at) VALUES ($u, 'consumer', $t)`, { u: id, t: at });
    }
    await db.run(`INSERT INTO user_roles (user_id, role, granted_at) VALUES ($u, 'partner_owner', $t)`, { u: ownerId, t: at });
    await db.run(
      `INSERT INTO venues (id, owner_user_id, name, category, city, country_code, timezone, currency,
                           status, verified_at, amount_entry, min_spend_minor, max_amount_minor,
                           avg_check_minor, avg_check_source, accepts_vouchers, points_per_scan,
                           scan_cooldown_hours, loyalty_active, created_at, updated_at)
       VALUES ($i, $o, 'Verify Café', 'cafe', 'Krakow', 'PL', $tz, 'PLN',
               'live', $t, 'cashier', 1500, 100000, 4000, 'category', 1, 5, 24, 1, $t, $t)`,
      { i: venueId, o: ownerId, tz: VENUE_TZ, t: at },
    );
    await db.run(
      `INSERT INTO budgets (id, venue_id, period, currency, total_minor, loyalty_bp, created_at, updated_at)
       VALUES ($i, $v, $p, 'PLN', 100000, 6000, $t, $t)`,
      { i: newId('bdg'), v: venueId, p: localMonth(at, VENUE_TZ), t: at },
    );
  });
  return { db, venueId, ownerId, customerId };
}

export async function nfcTaps(h: Harness): Promise<void> {
  const { describe, check, eq } = h;
  const rejects = async (what: string, fn: () => Promise<unknown>, code: string) => {
    try {
      await fn();
      check(what, false, 'did not reject');
    } catch (error) {
      if (error instanceof DomainError) check(what, error.code === code, { got: error.code, want: code });
      else check(what, false, String(error));
    }
  };
  describe('§3.3 NFC taps — registry, counter, limits');
  const w = await world();
  const at = now();
  const master = Buffer.from('0f1e2d3c4b5a69788796a5b4c3d2e1f0', 'hex');
  const live = '04AA0000000001';
  const spare = '04AA0000000002';
  const lost = '04AA0000000003';
  const stranger = '04AA00000000FF';
  await w.db.run(
    `INSERT INTO tag_registry (tag_uid, venue_id, status, batch, registered_at, assigned_at, label)
     VALUES ($a, $v, 'active', 't', $t, $t, 'Counter'), ($b, NULL, 'unassigned', 't', $t, NULL, NULL),
            ($c, $v, 'revoked', 't', $t, $t, NULL)`,
    { a: live, b: spare, c: lost, v: w.venueId, t: at },
  );

  const tap = (uid: string, counter: number, when: Iso = at, userId = w.customerId) => {
    const { piccHex, cmacHex } = mintTap(master, uid, counter);
    return gate.openTransaction(w.db, { kind: 'nfc', piccHex, cmacHex, masterKey: master }, { userId, at: when });
  };
  const lastCounter = async () =>
    (await w.db.get<{ last_counter: number }>(`SELECT last_counter FROM tag_registry WHERE tag_uid = $u`, { u: live }))!
      .last_counter;
  const close = (id: string, when: Iso = at) =>
    gate.cancel(w.db, { transactionId: id, reason: 'verify', actorId: w.customerId, at: when });

  /* A fresh NTAG 424 DNA may number its first tap 0, and `last_counter`
     defaults to 0 too — `last_tap_at` is what tells them apart. */
  const first = await tap(live, 0);
  eq('a genuine first tap at counter 0 opens a pending gate at the tag’s venue',
    [first.status, first.venue_id, first.trigger_type], ['pending', w.venueId, 'nfc']);
  eq('…and records which tag it was', first.trigger_ref, `nfc:${live}`);
  await close(first.id);

  const replays = async () =>
    (await w.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM fraud_cases WHERE kind = 'replay'`))?.n ?? 0;
  const before = await replays();
  await rejects('the same tap URL again is a replay', () => tap(live, 0), 'replay_detected');
  check('…and the replay opens a fraud case', (await replays()) === before + 1);

  const second = await tap(live, 5);
  eq('a higher counter is a fresh tap', second.status, 'pending');
  await close(second.id);
  await rejects('a lower counter than the last one is a replay', () => tap(live, 4), 'replay_detected');

  const { piccHex } = mintTap(master, live, 9);
  await rejects('a forged CMAC is refused', () =>
    gate.openTransaction(w.db, { kind: 'nfc', piccHex, cmacHex: '0123456789ABCDEF', masterKey: master },
      { userId: w.customerId, at }), 'invalid_trigger');
  await rejects('a tap made with another key is refused', async () => {
    const other = mintTap(Buffer.alloc(16, 7), live, 9);
    await gate.openTransaction(w.db, { kind: 'nfc', piccHex: other.piccHex, cmacHex: other.cmacHex, masterKey: master },
      { userId: w.customerId, at });
  }, 'invalid_trigger');
  eq('…and neither burned the counter', await lastCounter(), 5);

  await rejects('a genuine tag nobody registered is not found', () => tap(stranger, 1), 'not_found');
  await rejects('an unassigned tag opens nothing', () => tap(spare, 1), 'invalid_trigger');
  await rejects('a revoked tag opens nothing', () => tap(lost, 1), 'invalid_trigger');

  /* The per-tag ceiling: two taps so far today on this tag by this account. */
  let counter = 5;
  for (let i = 2; i < gate.NFC_TAPS_PER_TAG_PER_DAY; i += 1) {
    counter += 1;
    await close((await tap(live, counter)).id);
  }
  await rejects(`tap ${gate.NFC_TAPS_PER_TAG_PER_DAY + 1} on one tag in a day is refused`, () => tap(live, counter + 1),
    'rate_limited');
  eq('…without burning the counter', await lastCounter(), counter);
  const otherPerson = newId('usr');
  await w.db.run(
    `INSERT INTO users (id, email, email_norm, display_name, auth_provider, language, city, status,
                        email_verified_at, created_at, updated_at)
     VALUES ($i, 'nfc2@verify.test', 'nfc2@verify.test', 'Nfc Two', 'email', 'en', 'Krakow', 'active', $t, $t, $t)`,
    { i: otherPerson, t: at },
  );
  const theirs = await tap(live, counter + 1, at, otherPerson);
  eq('…which is per account: somebody else’s tap on it still opens', theirs.status, 'pending');

  /* The tap is only the trigger: the same amount and confirm as a QR. */
  await gate.submitAmount(w.db, { transactionId: theirs.id, amountMinor: 4200, actorId: w.ownerId, at });
  const receipt = await gate.confirm(w.db, { transactionId: theirs.id, cashierId: w.ownerId, at });
  check('a confirmed tap commits and grants what the venue grants', receipt.transaction.status === 'committed' &&
    receipt.pointsGranted > 0, receipt.pointsGranted);

  const tomorrow = plusDays(at, 1.05);
  const nextDay = await tap(live, counter + 2, tomorrow);
  eq('…and the per-tag ceiling is a rolling day', nextDay.status, 'pending');
  await close(nextDay.id, tomorrow);

  /* The website's `/t` page. */
  const fresh = mintTap(master, live, counter + 50);
  const resolved = await gate.resolveTag(w.db, { piccHex: fresh.piccHex, cmacHex: fresh.cmacHex, masterKey: master });
  eq('resolve names the tag’s venue and place', [resolved.venueId, resolved.venueName, resolved.label],
    [w.venueId, 'Verify Café', 'Counter']);
  eq('…without burning the counter', await lastCounter(), counter + 2);
  await rejects('…and a forged URL names nothing', () =>
    gate.resolveTag(w.db, { piccHex: fresh.piccHex, cmacHex: '0000000000000000', masterKey: master }), 'invalid_trigger');
  await rejects('…nor does a revoked tag', async () => {
    const t = mintTap(master, lost, 1);
    await gate.resolveTag(w.db, { piccHex: t.piccHex, cmacHex: t.cmacHex, masterKey: master });
  }, 'not_found');

  /* ── over HTTP ── */
  const tapRoute = allRoutes.find((r) => r.method === 'POST' && r.pattern === '/v1/gate/tap');
  eq('the tap route is bounded per account per hour', tapRoute?.limit, { perHour: gate.NFC_TAPS_PER_HOUR, by: 'account' });

  const savedKey = process.env.PAYLEZ_NFC_KEY;
  process.env.PAYLEZ_NFC_KEY = master.toString('hex');
  const api = createApi({ db: w.db, routes: allRoutes, secret: SECRET, limits: false });
  const server = await api.listen(0, '127.0.0.1');
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  const call = async (method: string, path: string, token?: string, body?: unknown) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': fakeAddress('nfc-verify'),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  try {
    const customer = (await accounts.createSession(w.db, { userId: otherPerson, mode: 'consumer', surface: 'mobile' })).token;
    const owner = (await accounts.createSession(w.db, { userId: w.ownerId, mode: 'consumer', surface: 'mobile' })).token;
    const good = mintTap(master, live, counter + 60);
    const opened = await call('POST', '/v1/gate/tap', customer, { picc: good.piccHex, cmac: good.cmacHex });
    eq('POST /v1/gate/tap opens a gate', [opened.status, opened.body?.status, opened.body?.venue_id], [200, 'pending', w.venueId]);
    const again = await call('POST', '/v1/gate/tap', customer, { picc: good.piccHex, cmac: good.cmacHex });
    eq('…the same URL twice is refused as a replay', [again.status, again.body?.error?.code], [422, 'replay_detected']);
    const unknown = mintTap(master, stranger, 3);
    eq('…an unregistered tag is 404', (await call('POST', '/v1/gate/tap', customer, { picc: unknown.piccHex, cmac: unknown.cmacHex })).status, 404);
    eq('…a forged one 422', (await call('POST', '/v1/gate/tap', customer, { picc: good.piccHex, cmac: 'ABCDEFABCDEFABCD' })).status, 422);
    const page = mintTap(master, live, counter + 70);
    const named = await call('GET', `/v1/gate/tags/resolve?picc_data=${page.piccHex}&cmac=${page.cmacHex}`);
    eq('GET /v1/gate/tags/resolve answers without a session', [named.status, named.body?.venueName], [200, 'Verify Café']);
    const list = await call('GET', `/v1/venues/${w.venueId}/nfc-tags`, owner);
    eq('the owner lists the venue’s tags', [list.status, Array.isArray(list.body) ? list.body.length : -1], [200, 2]);
    eq('…a customer may not', (await call('GET', `/v1/venues/${w.venueId}/nfc-tags`, customer)).status, 403);
  } finally {
    if (savedKey === undefined) delete process.env.PAYLEZ_NFC_KEY;
    else process.env.PAYLEZ_NFC_KEY = savedKey;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/* Run alone: `node server/verify-nfc.ts`. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let passed = 0;
  const failures: string[] = [];
  let group = '';
  const check = (what: string, condition: boolean, detail?: unknown) => {
    if (condition) {
      passed += 1;
      return;
    }
    failures.push(`${group} › ${what}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
    console.log(`   ✗ ${what}`, detail ?? '');
  };
  const harness: Harness = {
    describe: (name) => {
      group = name;
      console.log(`\n${name}`);
    },
    check,
    eq: (what, actual, expected) =>
      check(what, JSON.stringify(actual) === JSON.stringify(expected), { actual, expected }),
  };
  await nfcTaps(harness);
  console.log(`\n${passed} checks passed, ${failures.length} failed`);
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  process.exit(failures.length === 0 ? 0 : 1);
}
