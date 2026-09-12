/**
 * `npm run demo:purge` — remove the demo café, the demo accounts, and every row
 * that belongs to either of them.
 *
 * "Belongs" is decided by **who and where**, never by which script wrote a row.
 * The seed is not the only writer: the owner signs in as these accounts, the
 * counter tool opens manual transactions for them, the wallet buys vouchers and
 * toggles sharing, pushes land in their inboxes. All of that hangs off a demo
 * user or the demo venue, so selecting on those two covers it — and the residue
 * scan at the end is what proves it rather than hoping it.
 *
 * What it will not do is reach into anybody else's records. If a real account
 * has spent, earned or been stamped at the demo café, or a demo account has at a
 * real venue, deleting the demo side would cascade away the other side's history
 * (a real venue's pool still holding a reserve for a voucher that no longer
 * exists is the concrete failure). So those cases are **refused before anything
 * is deleted**, with the counts, and a person decides.
 *
 * Everything else happens in one transaction, and the residue scan runs inside
 * it: a purge that leaves an id behind rolls itself back rather than committing
 * half a clean-up.
 */
import { pathToFileURL } from 'node:url';
import type { Db, Param } from '../db/db.ts';
import {
  DEMO_ADDRESS_LIKE,
  Refusal,
  confirmTarget,
  describeTarget,
  findDemo,
  inSet,
  openTarget,
  residueScan,
  rowCounts,
  type DemoSet,
  type Engine,
} from './shared.ts';

export interface PurgeReport {
  demo: DemoSet;
  /** Rows removed per table, from counts taken either side of the commit. */
  removed: Record<string, number>;
  warnings: string[];
}

/**
 * References that may legitimately survive, because they sit in somebody
 * else's history rather than in a demo row.
 *
 * The consumer assistant stores the ids an answer was grounded on (§10.2). A
 * real person who asked where their points work may have been told about the
 * demo café, and that transcript is theirs: rewriting it would be editing a
 * record, deleting it would be deleting their conversation. Demo accounts' own
 * transcripts cascade away with them, so anything left here is someone else's.
 */
const OTHER_PEOPLES_HISTORY = new Set(['assistant_messages.grounding', 'assistant_messages.text']);

const count = async (db: Db, sql: string, params: Record<string, Param>): Promise<number> =>
  Number((await db.get<{ n: number }>(sql, params))?.n ?? 0);

export async function purgeDemo(db: Db, engine: Engine, log: (line: string) => void): Promise<PurgeReport> {
  const demo = await findDemo(db);
  const U = demo.users;
  const V = demo.venues;
  const warnings: string[] = [];

  if (U.length === 0 && V.length === 0) {
    log('no demo accounts or venues found — nothing to purge');
    return { demo, removed: {}, warnings };
  }
  log(`found ${U.length} demo account(s) and ${V.length} demo venue(s)`);
  if (demo.erased.length > 0) {
    log(`  including ${demo.erased.length} erased account(s) recognised by their history at the demo venue`);
  }

  /* ── refusals: other people's value at the demo venue, or demo value elsewhere ── */
  const crossings: Array<{ label: string; sql: string }> = [];
  const atDemoByOthers = (table: string, label: string) =>
    crossings.push({ label, sql: `SELECT COUNT(*) AS n FROM ${table} WHERE $$V AND $$notU` });
  const byDemoElsewhere = (table: string, label: string) =>
    crossings.push({ label, sql: `SELECT COUNT(*) AS n FROM ${table} WHERE $$U AND $$notV` });

  atDemoByOthers('transactions', 'transactions at the demo venue by other accounts');
  atDemoByOthers('venue_customers', 'customer records at the demo venue for other accounts');
  atDemoByOthers('issued_vouchers', 'vouchers for the demo venue held by other accounts');
  atDemoByOthers('earned_rewards', 'rewards at the demo venue held by other accounts');
  atDemoByOthers('stamp_cards', 'stamp cards at the demo venue held by other accounts');
  atDemoByOthers('points_ledger', 'points entries tied to the demo venue on other accounts');
  byDemoElsewhere('transactions', 'transactions by demo accounts at other venues');
  byDemoElsewhere('venue_customers', 'customer records for demo accounts at other venues');
  byDemoElsewhere('issued_vouchers', 'vouchers for other venues held by demo accounts');
  byDemoElsewhere('earned_rewards', 'rewards at other venues held by demo accounts');
  byDemoElsewhere('stamp_cards', 'stamp cards at other venues held by demo accounts');

  const problems: string[] = [];
  for (const crossing of crossings) {
    const p: Record<string, Param> = {};
    /* Function replacers, because a replacement *string* treats `$&`, `$'`
       and friends as patterns, and these fragments are full of `$`. */
    const sql = crossing.sql
      .replace('$$V', () => inSet('venue_id', V, 'v', p))
      .replace('$$notU', () => inSet('user_id', U, 'u', p, true))
      .replace('$$U', () => inSet('user_id', U, 'u', p))
      .replace('$$notV', () => inSet('venue_id', V, 'v', p, true));
    const n = await count(db, sql, p);
    if (n > 0) problems.push(`${n} ${crossing.label}`);
  }
  {
    const p: Record<string, Param> = {};
    const n = await count(db, `SELECT COUNT(*) AS n FROM gift_cards WHERE ${inSet('user_id', U, 'u', p)}`, p);
    /* A gift card came off the platform's real shelf; deleting the card does not
       put the stock back, so it is a decision rather than a clean-up. */
    if (n > 0) problems.push(`${n} gift card(s) bought from the real shelf by demo accounts`);
  }
  {
    const p: Record<string, Param> = {};
    const n = await count(
      db,
      `SELECT COUNT(*) AS n FROM referrals
        WHERE status = 'completed'
          AND ((${inSet('referrer_id', U, 'a', p)} AND (referred_id IS NULL OR ${inSet('referred_id', U, 'b', p, true)}))
               OR (${inSet('referred_id', U, 'c', p)} AND ${inSet('referrer_id', U, 'd', p, true)}))`,
      p,
    );
    if (n > 0) problems.push(`${n} completed referral(s) that paid points across the demo boundary`);
  }
  if (problems.length > 0) {
    throw new Refusal(
      [
        'nothing was deleted, because the demo data is entangled with other accounts:',
        ...problems.map((line) => `  - ${line}`),
        'Deleting the demo side would cascade away the other side of these records. Resolve them',
        'deliberately first (for example, close a real test account from the console), then purge again.',
      ].join('\n'),
    );
  }

  {
    const p: Record<string, Param> = {};
    const n = await count(
      db,
      `SELECT COUNT(*) AS n FROM data_sharing_consents WHERE ${inSet('venue_id', V, 'v', p)} AND ${inSet('user_id', U, 'u', p, true)}`,
      p,
    );
    if (n > 0) warnings.push(`${n} sharing consent(s) other accounts gave the demo venue go with it`);
  }
  {
    const p: Record<string, Param> = {};
    const n = await count(
      db,
      `SELECT COUNT(*) AS n FROM subscriptions WHERE source = 'stripe' AND (${inSet('user_id', U, 'u', p)} OR ${inSet('venue_id', V, 'v', p)})`,
      p,
    );
    if (n > 0) warnings.push(`${n} Stripe subscription(s) on demo accounts are deleted here but not cancelled in Stripe`);
  }

  /* ── the ids the residue scan looks for, collected while the rows still exist ── */
  const ids = async (sql: string, p: Record<string, Param>) =>
    (await db.all<{ id: string }>(sql, p)).map((row) => row.id);
  const byVenue = async (table: string) => {
    const p: Record<string, Param> = {};
    return await ids(`SELECT id FROM ${table} WHERE ${inSet('venue_id', V, 'v', p)}`, p);
  };
  const byEither = async (table: string) => {
    const p: Record<string, Param> = {};
    return await ids(`SELECT id FROM ${table} WHERE ${inSet('venue_id', V, 'v', p)} OR ${inSet('user_id', U, 'u', p)}`, p);
  };
  const contains = [
    ...U,
    ...V,
    ...(await byVenue('hot_deals')),
    ...(await byVenue('campaigns')),
    ...(await byVenue('budgets')),
    ...(await byVenue('voucher_tiers')),
    ...(await byVenue('deal_pushes')),
    ...(await byVenue('verification_records')),
    ...(await byEither('subscriptions')),
  ];
  const ledgerParams: Record<string, Param> = {};
  const equals = [
    ...(await byEither('transactions')),
    ...(await byEither('issued_vouchers')),
    ...(await byEither('earned_rewards')),
    ...(await ids(`SELECT id FROM points_ledger WHERE ${inSet('user_id', U, 'u', ledgerParams)}`, ledgerParams)),
  ];

  const before = await rowCounts(db, engine);

  const residueWarnings = await db.tx(async () => {
    const del = async (sql: string, build: (p: Record<string, Param>) => string) => {
      const p: Record<string, Param> = {};
      await db.run(sql.replace('$$WHERE', () => build(p)), p);
    };

    /* `translations` has no foreign key to anything — one table holds copy for
       venues, deals and campaigns — so no cascade reaches it. Swept first, while
       the deals and campaigns it describes can still be listed. */
    await del(
      `DELETE FROM translations WHERE $$WHERE`,
      (p) => `(entity = 'venue' AND ${inSet('entity_id', V, 'a', p)})
        OR (entity = 'hot_deal' AND entity_id IN (SELECT id FROM hot_deals WHERE ${inSet('venue_id', V, 'b', p)}))
        OR (entity = 'campaign' AND entity_id IN (SELECT id FROM campaigns WHERE ${inSet('venue_id', V, 'c', p)}))`,
    );

    /* The audit trail's references are `SET NULL`, which would leave entries
       saying something happened to nothing. Rows about the demo venue, by a demo
       account, or about a demo account or anything the venue owned, all go. */
    await del(
      `DELETE FROM audit_log WHERE $$WHERE`,
      (p) => `${inSet('venue_id', V, 'a', p)} OR ${inSet('actor_id', U, 'b', p)}
        OR ${inSet('entity_id', U, 'c', p)} OR ${inSet('entity_id', V, 'd', p)}
        OR entity_id IN (SELECT id FROM hot_deals WHERE ${inSet('venue_id', V, 'e', p)})
        OR entity_id IN (SELECT id FROM campaigns WHERE ${inSet('venue_id', V, 'f', p)})
        OR entity_id IN (SELECT id FROM budgets WHERE ${inSet('venue_id', V, 'g', p)})
        OR entity_id IN (SELECT id FROM transactions WHERE ${inSet('venue_id', V, 'h', p)} OR ${inSet('user_id', U, 'i', p)})`,
    );
    await del(
      `DELETE FROM fraud_cases WHERE $$WHERE`,
      (p) => `${inSet('user_id', U, 'a', p)} OR ${inSet('venue_id', V, 'b', p)}
        OR transaction_id IN (SELECT id FROM transactions WHERE ${inSet('venue_id', V, 'c', p)} OR ${inSet('user_id', U, 'd', p)})`,
    );
    /* The listing's own funnel. `SET NULL` would keep the events as reach that
       belongs to no venue at all. A demo account's events on *real* listings are
       left to that same `SET NULL`: they become anonymous, and the real venue's
       counts do not move. */
    await del(`DELETE FROM service_events WHERE $$WHERE`, (p) => inSet('venue_id', V, 'a', p));
    /* No foreign key on `user_id`, so it would outlive the account with the
       stored responses — which quote vouchers and receipts — inside it. */
    await del(`DELETE FROM idempotency_keys WHERE $$WHERE`, (p) => inSet('user_id', U, 'a', p));
    await db.run(`DELETE FROM auth_attempts WHERE LOWER(subject) LIKE $d`, { d: DEMO_ADDRESS_LIKE });
    await db.run(`DELETE FROM contact_messages WHERE LOWER(email_norm) LIKE $d`, { d: DEMO_ADDRESS_LIKE });
    {
      const matches =
        engine === 'sqlite'
          ? `EXISTS (SELECT 1 FROM json_each($ids) WHERE instr(payload, value) > 0)`
          : `EXISTS (SELECT 1 FROM jsonb_array_elements_text(CAST($ids AS jsonb)) AS x(v) WHERE strpos(payload, x.v) > 0)`;
      await db.run(`DELETE FROM billing_events WHERE ${matches}`, { ids: JSON.stringify([...U, ...V]) });
    }
    /* Before the venue, because `issued_vouchers.tier_id` is `ON DELETE
       RESTRICT` and the tiers cascade from the venue in the same statement. */
    await del(
      `DELETE FROM issued_vouchers WHERE $$WHERE`,
      (p) => `${inSet('venue_id', V, 'a', p)} OR ${inSet('user_id', U, 'b', p)}`,
    );
    /* Everything the venue owns cascades: links, hours, languages,
       verification, budgets and their movements, tiers, campaigns, stamp cards,
       rewards, visits, customers, transactions, QR nonces, deals and their
       events and pushes, quotas, the subscription, moderation rows. */
    await del(`DELETE FROM venues WHERE $$WHERE`, (p) => inSet('id', V, 'a', p));
    /* And everything an account owns: roles, sessions, consents, the ledger and
       its lots, games, notifications, push tokens, cards, the assistant. */
    await del(`DELETE FROM users WHERE $$WHERE`, (p) => inSet('id', U, 'a', p));

    const residue = await residueScan(db, engine, { contains, equals });
    const fatal = residue.filter((row) => !OTHER_PEOPLES_HISTORY.has(`${row.table}.${row.column}`));
    if (fatal.length > 0) {
      throw new Refusal(
        [
          'the purge was rolled back: demo ids are still referenced after deleting:',
          ...fatal.map((row) => `  - ${row.table}.${row.column}: ${row.rows} row(s), e.g. ${row.sample.join(' | ')}`),
        ].join('\n'),
      );
    }
    return residue.map(
      (row) => `${row.rows} ${row.table}.${row.column} row(s) in other people's assistant history still mention a demo id`,
    );
  });
  warnings.push(...residueWarnings);

  const after = await rowCounts(db, engine);
  const removed: Record<string, number> = {};
  for (const [table, n] of Object.entries(before)) {
    const gone = n - (after[table] ?? 0);
    if (gone !== 0) removed[table] = gone;
  }
  return { demo, removed, warnings };
}

async function main(): Promise<void> {
  const target = describeTarget();
  confirmTarget(target, 'demo:purge');
  const db = await openTarget(target);
  try {
    const report = await purgeDemo(db, target.engine, (line) => console.log(line));
    const tables = Object.entries(report.removed).sort((a, b) => b[1] - a[1]);
    if (tables.length > 0) {
      console.log(`removed ${tables.reduce((sum, [, n]) => sum + n, 0)} rows:`);
      for (const [table, n] of tables) console.log(`  ${table.padEnd(26)} ${n}`);
    }
    for (const warning of report.warnings) console.log(`note: ${warning}`);
    if (report.demo.users.length > 0 || report.demo.venues.length > 0) {
      console.log('residue scan: no demo id is left in any text column of any table');
    }
  } finally {
    await db.close();
  }
}

/* Only when run directly, so `seed.ts --reset` can import `purgeDemo`. Compared
   as file URLs for the reason `server/main.ts` gives. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    if (error instanceof Refusal) {
      console.error(`demo:purge: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}
