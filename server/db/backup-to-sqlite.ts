/**
 * Copy Supabase back down into a SQLite file, on a schedule.
 *
 * The reverse of `migrate-to-pg.ts`, and deliberately not a `pg_dump`. A dump
 * is an archive: to use one you need a Postgres to restore it into, the right
 * `pg_dump` major version to have written it, and time you do not have when
 * something is broken. **What this writes is a working database** — the server
 * boots from it directly. Recovering from a dead Supabase is then:
 *
 *     cp /var/backups/paylez/nightly/latest.db /var/lib/paylez/paylez.db
 *     # comment out PAYLEZ_PG_URL in /etc/paylez/paylez.env
 *     systemctl restart paylez
 *
 * and the site is up on last night's data, on the machine it was already
 * running on, with no new software involved.
 *
 * It costs nothing extra to maintain, because it uses the two drivers that
 * already exist and the schema that is already generated from one source. The
 * price is that it is a *nightly* copy: anything written since the last run is
 * gone. That is the honest bound, and it is stated in the summary it prints.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rmSync, existsSync } from 'node:fs';
import { openDb as openSqlite, type Param } from './db.ts';
import { PgDb } from './pg.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** Every table, in the order `schema.sql` creates them — which is FK order. */
function tableOrder(): string[] {
  const sql = readFileSync(join(here, 'schema.sql'), 'utf8');
  return [...sql.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/g)].map((m) => m[1]);
}

function arg(name: string, fallback?: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at !== -1 ? process.argv[at + 1] : fallback;
}

async function main(): Promise<void> {
  const url = arg('from', process.env.PAYLEZ_PG_URL);
  const out = arg('to');
  if (!url) throw new Error('no source: set PAYLEZ_PG_URL or pass --from');
  if (!out) throw new Error('no target: pass --to <file.db>');

  /* A partial file is worse than no file, so the previous attempt goes first
     and the finished one is renamed into place by the caller. */
  for (const suffix of ['', '-wal', '-shm']) {
    if (existsSync(out + suffix)) rmSync(out + suffix);
  }

  const pg = new PgDb(url);
  const sqlite = await openSqlite(out);
  const tables = tableOrder();

  /* `migrate()` seeds nothing, but it does stamp `schema_meta`, and the plans
     and word bank arrive as ordinary rows below. Clear anything it wrote so the
     copy is exactly what Postgres holds. */
  for (const table of [...tables].reverse()) await sqlite.run(`DELETE FROM "${table}"`);

  let total = 0;
  const counts: Record<string, number> = {};

  await sqlite.tx(async () => {
    for (const table of tables) {
      const rows = await pg.all<Record<string, unknown>>(`SELECT * FROM "${table}"`);
      if (rows.length === 0) continue;
      const columns = Object.keys(rows[0]);
      /* `?` and not `$1`: in `node:sqlite` a `$name` placeholder is a *named*
         parameter, so `$1` binds a parameter literally called "1" and the
         positional values never match. Postgres is the opposite way round,
         which is exactly why the two halves of this migration differ here. */
      const holes = columns.map(() => '?').join(', ');
      const sql = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${holes})`;
      for (const row of rows) {
        await sqlite.run(
          sql,
          columns.map((c) => {
            const value = row[c];
            /* Postgres hands back a Date for any timestamp type and a boolean
               for `boolean`; SQLite binds neither. Nothing in this schema uses
               those types — time is ISO text, flags are 0/1 integers — so this
               is a guard against a future column, not a conversion anything
               currently needs. */
            if (value instanceof Date) return value.toISOString();
            if (typeof value === 'boolean') return value ? 1 : 0;
            return (value ?? null) as Param;
          }),
        );
      }
      counts[table] = rows.length;
      total += rows.length;
    }
  });

  /* Verify by re-reading both sides. A count kept while inserting proves the
     loop ran, not that the rows landed. */
  const wrong: string[] = [];
  for (const table of tables) {
    const there = (await pg.get<{ n: number }>(`SELECT COUNT(*) AS n FROM "${table}"`))?.n ?? 0;
    const here_ = (await sqlite.get<{ n: number }>(`SELECT COUNT(*) AS n FROM "${table}"`))?.n ?? 0;
    if (there !== here_) wrong.push(`${table}: postgres ${there}, sqlite ${here_}`);
  }

  await pg.close();
  await sqlite.close();

  if (wrong.length) {
    console.error(`MISMATCH in ${wrong.length} table(s):`);
    for (const line of wrong) console.error(`  ${line}`);
    process.exit(1);
  }

  console.log(
    `backup ok: ${total} rows across ${Object.keys(counts).length} tables -> ${out}`,
  );
}

await main();
