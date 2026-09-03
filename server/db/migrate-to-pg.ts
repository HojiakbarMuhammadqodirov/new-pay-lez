/**
 * Copy a SQLite database into Postgres, once.
 *
 * `npm run pg:migrate -- --from <file> --to <connection string>`, or with
 * `PAYLEZ_DB` and `PAYLEZ_PG_URL` in the environment. It reads every table in
 * `schema.sql`'s own order and writes it to the Postgres database `pg.ts`
 * created, then compares the two row by row and refuses to report success on a
 * table whose counts disagree.
 *
 * Three decisions, each of which is a way this goes wrong quietly otherwise:
 *
 * 1. **Table order comes from `schema.sql`, not from `sqlite_master`.** That
 *    file is written in dependency order and says so in its header, so parents
 *    land before children and every foreign key is satisfiable as it is
 *    written. `sqlite_master` returns creation order, which is the same today
 *    and is not a promise. Deferring the constraints instead needs
 *    `session_replication_role`, which Supabase does not grant.
 *
 * 2. **It is not idempotent and does not pretend to be.** It refuses to run
 *    against a target that already has rows. A migration that "helpfully"
 *    merges into a half-populated database is how you get one venue's ledger
 *    written twice; the recovery is to drop the schema and run it again, which
 *    is cheap and obvious.
 *
 * 3. **The verification is a second pass, not a running total.** Counting what
 *    you inserted proves the loop ran, not that the rows arrived — a batch that
 *    conflicted away silently still increments a counter. The check re-reads
 *    both databases at the end.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PgDb, type Param } from './pg.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** Every table, in the order `schema.sql` creates them — which is FK order. */
function tableOrder(): string[] {
  const sql = readFileSync(join(here, 'schema.sql'), 'utf8');
  return [...sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/g)].map((m) => m[1]);
}

function arg(name: string, fallback: string | undefined): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at !== -1 ? process.argv[at + 1] : fallback;
}

/**
 * One table's rows, in batches.
 *
 * Batched because a table here reaches ten thousand rows (`quiz_items`) and a
 * round trip per row over a pooler is minutes rather than seconds; capped
 * because Postgres refuses a statement with more than 65535 bound parameters,
 * and a wide table hits that long before the row count looks large.
 */
async function copyTable(sqlite: DatabaseSync, pg: PgDb, table: string): Promise<number> {
  const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all() as Record<string, unknown>[];
  if (rows.length === 0) return 0;

  const columns = Object.keys(rows[0]);
  const perRow = columns.length;
  const maxRows = Math.max(1, Math.floor(60000 / perRow));
  const quoted = columns.map((c) => `"${c}"`).join(', ');

  let written = 0;
  for (let i = 0; i < rows.length; i += maxRows) {
    const batch = rows.slice(i, i + maxRows);
    const values: unknown[] = [];
    const tuples = batch.map((row) => {
      const holes = columns.map((column) => {
        values.push(row[column] ?? null);
        return `$${values.length}`;
      });
      return `(${holes.join(', ')})`;
    });

    /* Through `pg.run`, never `pg.pool.query`. The pool hands out whichever
       connection is free, so a direct call would land *outside* the transaction
       this runs in — and a failure half way would then leave exactly the
       partly-populated database the guard above exists to reject. `$1`-style
       holes pass through the named-parameter translation untouched, because it
       only rewrites a `$` followed by a letter. */
    const result = await pg.run(
      `INSERT INTO "${table}" (${quoted}) VALUES ${tuples.join(', ')}`,
      values as Param[],
    );
    written += result.changes;
  }
  return written;
}

async function main(): Promise<void> {
  const from = arg('from', process.env.PAYLEZ_DB ?? 'server/data/paylez.db');
  const to = arg('to', process.env.PAYLEZ_PG_URL);
  if (!to) {
    console.error(
      'no target: pass --to <postgres connection string> or set PAYLEZ_PG_URL.\n' +
        'Supabase gives you one under Project Settings → Database → Connection string → URI.',
    );
    process.exit(1);
  }

  const sqlite = new DatabaseSync(from!, { readOnly: true });
  const pg = new PgDb(to);
  const tables = tableOrder();

  /* The refusal. A target with rows in it is either a half-finished run or a
     live database, and there is no reading of "copy everything in" that is
     correct against either. */
  const occupied: string[] = [];
  for (const table of tables) {
    const row = await pg.get<{ n: number }>(`SELECT COUNT(*) AS n FROM "${table}"`);
    if ((row?.n ?? 0) > 0) occupied.push(`${table} (${row?.n})`);
  }
  /* `schema_meta` is written by `migrate()` before this ever runs, and the
     plans and word bank are product configuration `seedPlatform` writes. Those
     three are expected and are replaced rather than treated as occupancy. */
  const expected = new Set(['schema_meta', 'plans', 'plan_terms', 'plan_entitlements',
                            'word_bank', 'category_defaults']);
  const unexpected = occupied.filter((o) => !expected.has(o.split(' ')[0]));
  if (unexpected.length) {
    console.error(`the target already has rows: ${unexpected.join(', ')}`);
    console.error('drop and recreate the schema, then run this again.');
    process.exit(1);
  }
  /* Reversed, so children go before parents: `plan_terms` and
     `plan_entitlements` reference `plans` with ON DELETE RESTRICT, and clearing
     the parent first fails the moment these are not empty — which is exactly
     the cutover re-run, where the server has already booted and seeded them. */
  for (const table of [...expected].reverse()) await pg.run(`DELETE FROM "${table}"`);

  console.log(`copying ${tables.length} tables from ${from}`);
  const counts: Record<string, number> = {};

  /* One transaction for the whole copy: a migration that fails half way and
     leaves a partially populated database is the state the refusal above is
     there to reject, so it must not be able to create one. */
  await pg.tx(async () => {
    for (const table of tables) {
      const n = await copyTable(sqlite, pg, table);
      if (n) {
        counts[table] = n;
        console.log(`  ${String(n).padStart(7)} ${table}`);
      }
    }
  });

  /* The second pass. Re-read both sides rather than trusting the tally above. */
  console.log('verifying…');
  const bad: string[] = [];
  for (const table of tables) {
    const before = (
      sqlite.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }
    ).n;
    const after = (await pg.get<{ n: number }>(`SELECT COUNT(*) AS n FROM "${table}"`))?.n ?? 0;
    if (before !== after) bad.push(`${table}: sqlite ${before}, postgres ${after}`);
  }

  sqlite.close();
  await pg.close();

  if (bad.length) {
    console.error(`\nMISMATCH in ${bad.length} table(s):`);
    for (const line of bad) console.error(`  ${line}`);
    process.exit(1);
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`\nok: ${total} rows across ${Object.keys(counts).length} tables, counts match.`);
}

await main();
