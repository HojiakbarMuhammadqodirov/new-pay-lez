/**
 * Helper for `scripts/pg-boot-test.sh` — recreates production's boot hazard on
 * a scratch Postgres, and checks the result after a reboot.
 *
 *   node scripts/pg-boot-collide.ts make  <pg-url> <state.json>
 *   node scripts/pg-boot-collide.ts check <pg-url> <state.json>
 *
 * `make` writes rows the way the *live* server does — under ids of its own —
 * on the second unique keys the legacy import also writes (budgets on
 * venue+month through the real `budgetFor`, venue links on venue+kind, voucher
 * tiers on venue+percentage), then deletes the `uz` word bank, which is what
 * made production re-import at boot on 2026-10-05. `check` asserts those live
 * rows survived the re-import unchanged.
 *
 * Never point it at a real database: it deletes and rewrites rows.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { openDb } from '../server/db/pg.ts';
import * as budget from '../server/domain/budget.ts';

const [mode, url, statePath] = process.argv.slice(2);
if (!mode || !url || !statePath || !/127\.0\.0\.1|localhost/.test(url)) {
  console.error('usage: pg-boot-collide.ts make|check <local pg url> <state.json>');
  process.exit(2);
}

type State = {
  budgets: { venueId: string; id: string; legacyId: string; total: number }[];
  links: { venueId: string; kind: string; id: string; value: string }[];
  tiers: { venueId: string; pct: number; id: string; points: number }[];
};

const db = await openDb(url);
let failed = 0;
const ok = (label: string, pass: boolean, detail?: unknown) => {
  if (!pass) failed += 1;
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${label}${pass || detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
};

if (mode === 'make') {
  const state: State = { budgets: [], links: [], tiers: [] };

  for (const legacy of await db.all<{ id: string; venue_id: string }>(
    `SELECT id, venue_id FROM budgets WHERE id LIKE 'bdg_legacy_%' ORDER BY id LIMIT 3`,
  )) {
    await db.run(`DELETE FROM budget_movements WHERE budget_id = $b`, { b: legacy.id });
    await db.run(`UPDATE issued_vouchers SET budget_id = NULL WHERE budget_id = $b`, { b: legacy.id });
    await db.run(`UPDATE earned_rewards SET budget_id = NULL WHERE budget_id = $b`, { b: legacy.id });
    await db.run(`DELETE FROM budgets WHERE id = $b`, { b: legacy.id });
    const view = await budget.budgetFor(db, legacy.venue_id);
    const total = 424_200 + state.budgets.length;
    await db.run(`UPDATE budgets SET total_minor = $t WHERE id = $b`, { t: total, b: view.id });
    state.budgets.push({ venueId: legacy.venue_id, id: view.id, legacyId: legacy.id, total });
  }

  for (const [n, link] of (await db.all<{ id: string; venue_id: string; kind: string }>(
    `SELECT id, venue_id, kind FROM venue_links WHERE id LIKE 'lnk_legacy_%' ORDER BY id LIMIT 3`,
  )).entries()) {
    const id = `lnk_live_boottest_${n}`;
    const value = `https://live.example/${n}`;
    await db.run(`UPDATE venue_links SET id = $n, value = $v WHERE id = $o`, { n: id, v: value, o: link.id });
    state.links.push({ venueId: link.venue_id, kind: link.kind, id, value });
  }

  for (const [n, tier] of (await db.all<{ id: string; venue_id: string; discount_pct: number }>(
    `SELECT t.id, t.venue_id, t.discount_pct FROM voucher_tiers t
      WHERE t.id LIKE 'vtr_legacy_%' AND NOT EXISTS (SELECT 1 FROM issued_vouchers v WHERE v.tier_id = t.id)
      ORDER BY t.id LIMIT 3`,
  )).entries()) {
    const id = `vtr_live_boottest_${n}`;
    const points = 777 + n;
    await db.run(`UPDATE voucher_tiers SET id = $n, points_cost = $p WHERE id = $o`, { n: id, p: points, o: tier.id });
    state.tiers.push({ venueId: tier.venue_id, pct: Number(tier.discount_pct), id, points });
  }

  await db.run(
    `DELETE FROM translations WHERE entity = 'word' AND entity_id IN (SELECT id FROM word_bank WHERE language = 'uz')`,
  );
  const removed = await db.run(`DELETE FROM word_bank WHERE language = 'uz'`);
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log(
    `  made ${state.budgets.length} live budgets, ${state.links.length} links, ${state.tiers.length} tiers; ` +
      `uz word bank emptied (${JSON.stringify(removed)})`,
  );
  ok('there was something to collide with', state.budgets.length > 0 && state.links.length > 0 && state.tiers.length > 0);
} else {
  const state = JSON.parse(readFileSync(statePath, 'utf8')) as State;
  for (const b of state.budgets) {
    const row = await db.get<{ total_minor: number }>(`SELECT total_minor FROM budgets WHERE id = $b`, { b: b.id });
    ok(`live budget ${b.id} kept, total intact`, Number(row?.total_minor) === b.total, row);
    const legacy = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM budgets WHERE id = $b`, { b: b.legacyId });
    ok(`no export budget beside it`, Number(legacy?.n) === 0, legacy);
  }
  for (const l of state.links) {
    const row = await db.get<{ id: string; value: string }>(
      `SELECT id, value FROM venue_links WHERE venue_id = $v AND kind = $k`, { v: l.venueId, k: l.kind },
    );
    ok(`live link ${l.id} kept`, row?.id === l.id && row?.value === l.value, row);
  }
  for (const t of state.tiers) {
    const row = await db.get<{ id: string; points_cost: number }>(
      `SELECT id, points_cost FROM voucher_tiers WHERE venue_id = $v AND discount_pct = $p`, { v: t.venueId, p: t.pct },
    );
    ok(`live tier ${t.id} kept`, row?.id === t.id && Number(row?.points_cost) === t.points, row);
  }
  const uz = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM word_bank WHERE language = 'uz'`);
  ok('the uz word bank was refilled by the re-import', Number(uz?.n) > 0, uz);
}

await db.close();
process.exit(failed ? 1 : 0);
