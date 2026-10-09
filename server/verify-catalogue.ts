/**
 * The catalogue purge and the two import markers, checked end to end.
 *
 * Its own module so the section can be read in one place; `verify.ts` runs it
 * with its own harness (`describe` / `check` / `eq`) so the counts and the
 * failure list stay one report.
 *
 * Everything runs against throwaway SQLite files under the OS temp directory,
 * fed by a hand-written legacy export — never `new-data/`, which a checkout may
 * not have and whose contents would make the expected counts a guess.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Db } from './db/db.ts';
import { CATALOGUE_RETIRED, LEGACY_IMPORTED, readMarker } from './db/import.ts';
import { purgeCatalogue } from './db/purgeCatalogue.ts';
import * as ledger from './domain/ledger.ts';
import { boot } from './main.ts';

export interface Harness {
  describe: (name: string) => void;
  check: (what: string, condition: boolean, detail?: unknown) => void;
  eq: (what: string, actual: unknown, expected: unknown) => void;
}

const csv = (rows: Array<Record<string, string>>): string => {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [columns.map(cell).join(','), ...rows.map((row) => columns.map((c) => cell(row[c] ?? '')).join(','))].join('\n') + '\n';
};

/** Two directory listings, one of them a partner; two deals, one with no venue; one player. */
function writeExport(dir: string): void {
  mkdirSync(dir, { recursive: true });
  const at = '2026-08-01T10:00:00.000Z';
  writeFileSync(join(dir, 'GuidanceService_export.csv'), csv([
    { id: 'gsv_cat_partner', service_name: 'Fixture Café', city: 'Krakow', country_code: 'PL', category_key: 'places', accepts_vouchers: 'true', is_active: 'true', created_date: at, updated_date: at },
    { id: 'gsv_cat_listing', service_name: 'Fixture Listing', city: 'Krakow', country_code: 'PL', category_key: 'places', accepts_vouchers: 'false', is_active: 'true', created_date: at, updated_date: at },
  ]));
  writeFileSync(join(dir, 'DiscountVoucherCampaign_export.csv'), csv([
    { id: 'dvc_cat', service_id: 'gsv_cat_partner', currency: 'PLN', budget_total: '100', budget_consumed: '5', avg_check_amount: '50', is_active: 'true', created_by: 'owner@verify-catalogue.test', created_by_id: 'b44_owner', created_date: at, updated_date: at },
  ]));
  writeFileSync(join(dir, 'HotDeal_export.csv'), csv([
    { id: 'hd_cat_venue', service_id: 'gsv_cat_partner', title_en: 'Fixture deal', is_active: 'true', points_required: '10', country_code: 'PL', created_by: 'owner@verify-catalogue.test', created_by_id: 'b44_owner', created_date: at, updated_date: at },
    { id: 'hd_cat_free', service_id: '', partner_name: 'Nobody', title_en: 'Venue-less deal', is_active: 'true', points_required: '10', country_code: 'PL', created_date: at, updated_date: at },
  ]));
  writeFileSync(join(dir, 'GameProgress_export.csv'), csv([
    { id: 'gp_cat', created_by: 'player@verify-catalogue.test', created_by_id: 'b44_player', user_name: 'Legacy Player', current_streak: '4', longest_streak: '6', total_score: '120', questions_answered: '30', correct_answers: '20', created_date: at, updated_date: at },
  ]));
}

const n = async (db: Db, sql: string, params: Record<string, string> = {}): Promise<number> =>
  Number((await db.get<{ n: number }>(sql, params))?.n ?? 0);

export async function catalogueRetirement({ describe, check, eq }: Harness): Promise<void> {
  describe('catalogue purge: venues and gift cards go, people and points stay, and nothing comes back');

  const root = mkdtempSync(join(tmpdir(), 'paylez-catalogue-'));
  const legacyDir = join(root, 'legacy');
  writeExport(legacyDir);
  const gamesDir = 'updates';
  const file = join(root, 'catalogue.db');

  try {
    /* ── a fresh database imports, as it always has, and is stamped ── */
    const first = await boot({ file, legacyDir, gamesDir, quiet: true });
    let db = first.db;
    check('the first boot on a fresh database imports', first.reimported);
    eq('…and promotes the one partner listing to a venue', await n(db, `SELECT COUNT(*) AS n FROM venues`), 1);
    eq('…with both deals, the venue-less one included', await n(db, `SELECT COUNT(*) AS n FROM hot_deals`), 2);
    check('…and its tiers and budget', (await n(db, `SELECT COUNT(*) AS n FROM voucher_tiers`)) === 3
      && (await n(db, `SELECT COUNT(*) AS n FROM budgets`)) === 1);
    check('the import stamps legacy_import', (await readMarker(db, LEGACY_IMPORTED)) !== null);
    eq('and the catalogue is not retired', await readMarker(db, CATALOGUE_RETIRED), null);

    /* ── live data on top: points, a game state, a held voucher, a gift shelf ── */
    const player = (await db.get<{ id: string }>(
      `SELECT id FROM users WHERE email_norm = 'player@verify-catalogue.test'`,
    ))!.id;
    const at = '2026-10-01T12:00:00.000Z';
    await ledger.earn(db, { userId: player, points: 500, reason: 'game_win', venueId: 'gsv_cat_partner', at });
    await db.run(`UPDATE player_states SET streak = 9, updated_at = $t WHERE user_id = $u`, { t: at, u: player });
    const tier = (await db.get<{ id: string }>(`SELECT id FROM voucher_tiers ORDER BY discount_pct LIMIT 1`))!.id;
    await db.run(
      `INSERT INTO issued_vouchers (id, user_id, venue_id, tier_id, discount_pct, max_discount_minor, points_spent,
                                    reserved_minor, code, issued_at, expires_at)
       VALUES ('ivo_cat', $u, 'gsv_cat_partner', $t, 5, 1000, 50, 1000, 'CATCODE1', $a, '2026-12-01T00:00:00.000Z')`,
      { u: player, t: tier, a: at },
    );
    await db.run(
      `INSERT INTO gift_card_stock (id, brand, face_minor, points_cost, stock, kind, venue_id, created_at, updated_at)
       VALUES ('gcs_cat', 'Fixture Brand', 5000, 900, 1, 'venue', 'gsv_cat_partner', $a, $a)`,
      { a: at },
    );
    await db.run(
      `INSERT INTO gift_cards (id, user_id, stock_id, points_spent, code, issued_at, expires_at)
       VALUES ('gcd_cat', $u, 'gcs_cat', 900, 'GIFT-1', $a, '2027-01-01T00:00:00.000Z')`,
      { u: player, a: at },
    );
    await db.run(
      `INSERT INTO gift_card_codes (id, stock_id, code, added_at, card_id, issued_at) VALUES
         ('gcc_cat_1', 'gcs_cat', 'GIFT-1', $a, 'gcd_cat', $a),
         ('gcc_cat_2', 'gcs_cat', 'GIFT-2', $a, NULL, NULL)`,
      { a: at },
    );

    const users = await n(db, `SELECT COUNT(*) AS n FROM users`);
    const roles = await n(db, `SELECT COUNT(*) AS n FROM user_roles`);
    const balance = await ledger.balance(db, player);
    const ledgerRows = await n(db, `SELECT COUNT(*) AS n FROM points_ledger`);

    /* ── the purge ── */
    const result = await purgeCatalogue(db, 'sqlite');
    eq('the report counts the venue before', result.before.venues, 1);
    eq('…and none after', result.after.venues, 0);
    for (const table of ['venues', 'hot_deals', 'campaigns', 'voucher_tiers', 'budgets', 'budget_movements',
      'issued_vouchers', 'venue_links', 'gift_card_stock', 'gift_cards', 'gift_card_codes']) {
      eq(`purge empties ${table}`, await n(db, `SELECT COUNT(*) AS n FROM ${table}`), 0);
    }
    eq('…and the copy no foreign key reaches',
      await n(db, `SELECT COUNT(*) AS n FROM translations WHERE entity IN ('venue', 'hot_deal', 'campaign')`), 0);
    eq('the directory stays, unlinked from the venue',
      await n(db, `SELECT COUNT(*) AS n FROM guidance_services WHERE venue_id IS NULL`), 2);
    eq('no user is removed', await n(db, `SELECT COUNT(*) AS n FROM users`), users);
    eq('no role is touched', await n(db, `SELECT COUNT(*) AS n FROM user_roles`), roles);
    eq('no ledger entry is removed', await n(db, `SELECT COUNT(*) AS n FROM points_ledger`), ledgerRows);
    eq('and the balance is what it was', await ledger.balance(db, player), balance);
    eq('the cached balance agrees with the ledger', await ledger.cachedBalance(db, player), balance);
    eq('the entry that named the venue keeps its points with the venue nulled',
      await n(db, `SELECT COUNT(*) AS n FROM points_ledger WHERE user_id = $u AND delta = 500 AND venue_id IS NULL`, { u: player }), 1);
    check('the catalogue is retired', (await readMarker(db, CATALOGUE_RETIRED)) !== null);
    eq('and the purge is in the audit trail',
      await n(db, `SELECT COUNT(*) AS n FROM audit_log WHERE action = 'catalogue.purge'`), 1);
    check('the notes name the voucher and the card a player was holding',
      result.notes.some((note) => note.includes('voucher')) && result.notes.some((note) => note.includes('gift card')),
      result.notes);
    await db.close();

    /* ── a restart with the export still there does not bring it back ── */
    const second = await boot({ file, legacyDir, gamesDir, quiet: true });
    db = second.db;
    eq('a boot after the purge does not re-import', second.reimported, false);
    eq('…and writes no venue', await n(db, `SELECT COUNT(*) AS n FROM venues`), 0);
    await db.run(`DELETE FROM quiz_items WHERE bank = 'brain'`);
    await db.close();

    /* ── a missing bank still re-imports, and only the bank comes back ── */
    const banks = await boot({ file, legacyDir, gamesDir, quiet: true });
    db = banks.db;
    check('an emptied question bank still triggers the import', banks.reimported);
    check('…which refills it', (await n(db, `SELECT COUNT(*) AS n FROM quiz_items WHERE bank = 'brain'`)) > 0);
    eq('…and writes no venue', await n(db, `SELECT COUNT(*) AS n FROM venues`), 0);
    eq('…and no deal', await n(db, `SELECT COUNT(*) AS n FROM hot_deals`), 0);
    eq('…and leaves the live streak over the export\'s',
      await n(db, `SELECT streak AS n FROM player_states WHERE user_id = $u`, { u: player }), 9);
    eq('…and pays no opening balance twice', await ledger.balance(db, player), balance);
    await db.close();

    /* ── --reimport too ── */
    const forced = await boot({ file, legacyDir, gamesDir, reimport: true, quiet: true });
    db = forced.db;
    check('--reimport runs the import', forced.reimported);
    eq('…without a venue', await n(db, `SELECT COUNT(*) AS n FROM venues`), 0);
    eq('…a deal', await n(db, `SELECT COUNT(*) AS n FROM hot_deals`), 0);
    eq('…a tier', await n(db, `SELECT COUNT(*) AS n FROM voucher_tiers`), 0);
    eq('…or a partner_owner grant beyond the ones that were there',
      await n(db, `SELECT COUNT(*) AS n FROM user_roles`), roles);
    eq('…while the directory is still imported', await n(db, `SELECT COUNT(*) AS n FROM guidance_services`), 2);
    eq('…and stays unlinked', await n(db, `SELECT COUNT(*) AS n FROM guidance_services WHERE venue_id IS NOT NULL`), 0);
    await db.close();

    /* ── a database filled before the marker existed is stamped, not re-imported ── */
    const old = join(root, 'old.db');
    const filled = await boot({ file: old, legacyDir, gamesDir, quiet: true });
    await filled.db.run(`DELETE FROM schema_meta WHERE key = $k`, { k: LEGACY_IMPORTED });
    await filled.db.close();
    const backfilled = await boot({ file: old, legacyDir, gamesDir, quiet: true });
    eq('a pre-marker database with venues does not re-import', backfilled.reimported, false);
    check('…and is stamped on the way past',
      (await readMarker(backfilled.db, LEGACY_IMPORTED))?.startsWith('backfilled') === true);
    await backfilled.db.close();

    /* ── the command: refuses without --yes, purges with it ── */
    const env: NodeJS.ProcessEnv = { ...process.env, PAYLEZ_DB: old };
    delete env.PAYLEZ_PG_URL;
    const refused = spawnSync(process.execPath, ['server/main.ts', '--purge-catalogue'], { env, encoding: 'utf8' });
    eq('the command refuses without --yes', refused.status, 1);
    const kept = await boot({ file: old, legacyDir, gamesDir, quiet: true });
    eq('…and deletes nothing', await n(kept.db, `SELECT COUNT(*) AS n FROM venues`), 1);
    await kept.db.close();
    const ran = spawnSync(process.execPath, ['server/main.ts', '--purge-catalogue', '--yes'], { env, encoding: 'utf8' });
    eq('with --yes it succeeds', ran.status, 0);
    check('…and prints the table of counts', /venues\s+1\s+0/.test(ran.stdout), ran.stdout + ran.stderr);
    const after = await boot({ file: old, legacyDir, gamesDir, quiet: true });
    eq('…and the venue is gone for good', await n(after.db, `SELECT COUNT(*) AS n FROM venues`), 0);
    eq('…without a re-import on the next boot', after.reimported, false);
    await after.db.close();

    /* ── a checkout with no export behaves exactly as before ── */
    const bare = join(root, 'bare.db');
    const none = await boot({ file: bare, legacyDir: join(root, 'no-such-dir'), gamesDir, quiet: true });
    check('a fresh database with no export still runs the import', none.reimported);
    eq('…and is not stamped, so the next boot tries again', await readMarker(none.db, LEGACY_IMPORTED), null);
    await none.db.close();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
