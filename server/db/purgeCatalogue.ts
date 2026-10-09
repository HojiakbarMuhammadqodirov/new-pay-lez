/**
 * `npm run catalogue:purge -- --yes` (= `node server/main.ts --purge-catalogue --yes`)
 * — delete every venue and every gift card, and retire the old catalogue so no
 * import ever writes it back.
 *
 * Written for one decision: start the partner side again with real partners.
 * The people stay exactly as they are — accounts, roles, the ledger and every
 * balance in it, game state, consents. What goes is everything a venue owns
 * (by `ON DELETE CASCADE`: links, hours, budgets and their movements, tiers,
 * vouchers, campaigns, stamp cards, rewards, visits, customers, transactions,
 * QR nonces, team members, passes, push quotas, venue subscriptions, partner
 * missions, moderation rows), every hot deal (including the ones the import
 * wrote with no venue), and the whole gift-card shelf: cards, codes and stock.
 *
 * **Why the marker is the point.** Without `CATALOGUE_RETIRED`, an empty
 * `venues` table is what `boot` used to read as a first boot, and every import
 * trigger — `--reimport`, a short question bank, a starved word bank — would
 * promote the eleven Base44 venues and their deals straight back out of
 * `new-data/`. The marker is written in the same transaction as the deletes,
 * so there is no moment where the catalogue is gone and the guard is not.
 *
 * What is deliberately left: `points_ledger` rows that name a venue (its
 * `venue_id` is `SET NULL` — the history and the balance survive), the
 * directory (`guidance_services`, unlinked by `SET NULL`), listing events,
 * fraud cases, NFC tags and the audit trail (all `SET NULL`), notifications in
 * people's inboxes, and the gift-card *rules* in `platform_config`, which are
 * the operator's settings rather than stock. A voucher or gift card somebody
 * is holding is deleted without a refund (balances are not touched either
 * way); how many is counted before the deletes and printed as a note.
 *
 * One transaction, and a residue check inside it: if any column named
 * `venue_id` anywhere in the schema still holds a value after the deletes —
 * which is how a table added later without a cascade would show up — the whole
 * purge rolls back rather than committing half of it.
 */
import type { Db } from './db.ts';
import { CATALOGUE_RETIRED, LEGACY_IMPORTED, readMarker, setMarker } from './import.ts';
import { record as audit } from '../domain/audit.ts';
import { now } from '../domain/time.ts';
import { Refusal, describeTarget, openTarget, rowCounts, tableNames, type Engine } from '../demo/shared.ts';

/** The tables printed whether or not they changed, so the report shows what was kept too. */
const HEADLINE = [
  'venues', 'hot_deals', 'campaigns', 'voucher_tiers', 'issued_vouchers', 'budgets', 'transactions',
  'team_members', 'subscription_passes', 'gift_card_stock', 'gift_cards', 'gift_card_codes',
  'users', 'user_roles', 'points_ledger', 'player_states',
] as const;

export interface CataloguePurge {
  before: Record<string, number>;
  after: Record<string, number>;
  /** Things worth knowing that the purge does not undo. */
  notes: string[];
}

const count = async (db: Db, sql: string): Promise<number> => Number((await db.get<{ n: number }>(sql))?.n ?? 0);

/** Every table with a column of this name, on either engine. */
async function tablesWithColumn(db: Db, engine: Engine, column: string): Promise<string[]> {
  if (engine === 'postgres') {
    return (
      await db.all<{ name: string }>(
        `SELECT table_name AS name FROM information_schema.columns
          WHERE table_schema = current_schema() AND column_name = $c ORDER BY table_name`,
        { c: column },
      )
    ).map((row) => row.name);
  }
  const out: string[] = [];
  for (const table of await tableNames(db, engine)) {
    const columns = await db.all<{ name: string }>(`PRAGMA table_info("${table}")`);
    if (columns.some((c) => c.name === column)) out.push(table);
  }
  return out;
}

export async function purgeCatalogue(
  db: Db,
  engine: Engine,
  options: { actor?: string } = {},
): Promise<CataloguePurge> {
  const at = now();
  const notes: string[] = [];

  /* Told, not refused: these are value people hold, and the owner's decision
     already covers them — but nobody should learn the number afterwards. */
  const heldVouchers = await count(db, `SELECT COUNT(*) AS n FROM issued_vouchers WHERE status = 'active'`);
  if (heldVouchers > 0) notes.push(`${heldVouchers} active voucher(s) held by players are deleted without a points refund`);
  const heldCards = await count(db, `SELECT COUNT(*) AS n FROM gift_cards WHERE status = 'active'`);
  if (heldCards > 0) notes.push(`${heldCards} active gift card(s) held by players are deleted without a points refund`);
  const stripe = await count(
    db,
    `SELECT COUNT(*) AS n FROM subscriptions WHERE venue_id IS NOT NULL AND source = 'stripe'`,
  );
  if (stripe > 0) notes.push(`${stripe} Stripe subscription(s) on venues are deleted here but NOT cancelled in Stripe`);

  const before = await rowCounts(db, engine);
  const venueTables = await tablesWithColumn(db, engine, 'venue_id');

  const after = await db.tx(async () => {
    /* No foreign key reaches these — one table holds copy (or pictures) for
       several kinds of row — so no cascade does either. Swept first. */
    await db.run(`DELETE FROM translations WHERE entity IN ('venue', 'hot_deal', 'campaign')`);
    await db.run(`DELETE FROM media_assets WHERE entity = 'venue'`);
    await db.run(`DELETE FROM moderation_queue WHERE entity IN ('venue', 'hot_deal', 'campaign')`);

    /* The shelf. `gift_cards.stock_id` is RESTRICT, so the cards go before the
       stock; the codes cascade from the stock (and their `card_id` is SET NULL,
       so the order between those two does not matter). */
    await db.run(`DELETE FROM gift_card_codes`);
    await db.run(`DELETE FROM gift_cards`);
    await db.run(`DELETE FROM gift_card_stock`);

    /* `issued_vouchers.tier_id` is RESTRICT and the tiers cascade from the
       venue in the same statement, so the vouchers go first. */
    await db.run(`DELETE FROM issued_vouchers`);
    /* All of them, not only the ones with a venue: the import wrote deals for
       listings that were never promoted, and those have `venue_id` NULL. */
    await db.run(`DELETE FROM hot_deals`);
    await db.run(`DELETE FROM venues`);
    /* Cross-venue aggregates: every figure in it is about venues that are gone. */
    await db.run(`DELETE FROM benchmarks`);

    /* The residue check. Every `venue_id` in the schema — with a foreign key or
       without — must now be empty, or this is rolled back. */
    const residue: string[] = [];
    for (const table of venueTables) {
      const n = await count(db, `SELECT COUNT(*) AS n FROM "${table}" WHERE venue_id IS NOT NULL`);
      if (n > 0) residue.push(`${table}.venue_id: ${n}`);
    }
    for (const table of ['venues', 'hot_deals', 'campaigns', 'voucher_tiers', 'budgets', 'gift_cards', 'gift_card_stock', 'gift_card_codes']) {
      const n = await count(db, `SELECT COUNT(*) AS n FROM ${table}`);
      if (n > 0) residue.push(`${table}: ${n}`);
    }
    if (residue.length > 0) {
      throw new Refusal(`the purge was rolled back: rows still reference a venue after deleting — ${residue.join(', ')}`);
    }

    if ((await readMarker(db, LEGACY_IMPORTED)) === null) await setMarker(db, LEGACY_IMPORTED, at);
    await setMarker(db, CATALOGUE_RETIRED, at);

    const counted = await rowCounts(db, engine);
    const changed = Object.fromEntries(
      Object.keys(before)
        .filter((table) => before[table] !== counted[table])
        .map((table) => [table, before[table]]),
    );
    await audit(db, {
      actorId: null,
      actorRole: options.actor ?? 'operator_cli',
      action: 'catalogue.purge',
      entity: 'platform',
      entityId: CATALOGUE_RETIRED,
      before: changed,
      after: Object.fromEntries(Object.keys(changed).map((table) => [table, counted[table]])),
      at,
    });
    return counted;
  });

  return { before, after, notes };
}

/** The table the CLI prints: every table that changed, plus the headline ones. */
export function purgeReport(result: CataloguePurge): string[] {
  const tables = Object.keys(result.before)
    .filter((table) => (HEADLINE as readonly string[]).includes(table) || result.before[table] !== result.after[table])
    .sort();
  const width = Math.max(...tables.map((t) => t.length), 5);
  return [
    `${'table'.padEnd(width)}  ${'before'.padStart(8)}  ${'after'.padStart(8)}`,
    ...tables.map(
      (table) =>
        `${table.padEnd(width)}  ${String(result.before[table]).padStart(8)}  ${String(result.after[table] ?? 0).padStart(8)}`,
    ),
  ];
}

/**
 * The command. Refuses without `--yes` on any engine — there is no database
 * this is a casual thing to do to — and opens the target exactly the way
 * `boot` would (`PAYLEZ_PG_URL`, else `PAYLEZ_DB`), without running any of
 * `boot`'s import or seeding. Returns the exit code.
 */
export async function purgeCatalogueCli(options: { yes: boolean }): Promise<number> {
  try {
    const target = describeTarget();
    console.log(`catalogue:purge: database ${target.label}`);
    if (!options.yes) {
      throw new Refusal(
        'this deletes every venue, deal, voucher, campaign and gift card, and retires the legacy ' +
          'catalogue. Take a backup, then re-run with --yes.',
      );
    }
    const db = await openTarget(target);
    try {
      if ((await readMarker(db, CATALOGUE_RETIRED)) !== null) {
        console.log(`catalogue:purge: already retired (${await readMarker(db, CATALOGUE_RETIRED)}) — purging again`);
      }
      const result = await purgeCatalogue(db, target.engine);
      for (const line of purgeReport(result)) console.log(`  ${line}`);
      for (const note of result.notes) console.log(`note: ${note}`);
      console.log(`catalogue:purge: done; ${CATALOGUE_RETIRED} = ${await readMarker(db, CATALOGUE_RETIRED)}`);
    } finally {
      await db.close();
    }
    return 0;
  } catch (error) {
    if (error instanceof Refusal) {
      console.error(`catalogue:purge: ${error.message}`);
      return 1;
    }
    throw error;
  }
}
