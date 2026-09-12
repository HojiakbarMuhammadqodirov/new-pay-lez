/**
 * What `seed.ts` and `purge.ts` share: which database they are pointed at,
 * whether they may write to it, and how a demonstration row is recognised.
 *
 * **Neither script is reachable from `boot()`, and neither may ever be.** The
 * repository's rule is that nothing is seeded — `bootOrdering` in
 * `server/verify.ts` proves a boot invents no venue — because a row a boot
 * writes is immortal: delete it and the next restart puts it back. These two are
 * the opposite construction. A person runs the seed by hand, once, and the purge
 * beside it removes every row that belongs to the demo accounts and the demo
 * venue, including rows written later by somebody testing with them.
 *
 * The selector is the address, and only the address: every demo account signs
 * in at `@demo.paylez.test`, a reserved `.test` domain that can never deliver a
 * message to anybody. No marker row is written anywhere, because a marker in
 * `platform_config` is exactly the kind of leftover the boot guard exists to
 * catch.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG } from '../config.ts';
import { openDb, type Db, type Param } from '../db/db.ts';
import { openDb as openPgDb } from '../db/pg.ts';
import { local } from '../domain/time.ts';

export const DEMO_DOMAIN = 'demo.paylez.test';
/** For `LIKE` against a lower-cased address. `.` is literal in `LIKE`. */
export const DEMO_ADDRESS_LIKE = `%@${DEMO_DOMAIN}`;

export type Engine = 'sqlite' | 'postgres';

/** A refusal the script explains and exits on, rather than a stack trace. */
export class Refusal extends Error {}

/* ─────────────────────────────────────────────────────────── arguments ── */

export const flag = (name: string): boolean => process.argv.slice(2).includes(`--${name}`);

export function option(name: string): string | undefined {
  const args = process.argv.slice(2);
  const at = args.indexOf(`--${name}`);
  if (at === -1) return undefined;
  const value = args[at + 1];
  if (value === undefined || value.startsWith('--')) throw new Refusal(`--${name} needs a value`);
  return value;
}

/* ──────────────────────────────────────────────────────────── the target ── */

export interface Target {
  engine: Engine;
  /** What is printed: a file path, or host/port/database — never credentials. */
  label: string;
  file?: string;
  url?: string;
}

/**
 * The database, decided exactly the way `boot()` in `server/main.ts` decides it:
 * `PAYLEZ_PG_URL` present means Postgres, absent means the SQLite file at
 * `PAYLEZ_DB`. A second switch here could disagree with the server's, and the
 * failure when they disagree is a demo set written into a database the server
 * is not reading.
 */
export function describeTarget(): Target {
  const url = process.env.PAYLEZ_PG_URL;
  if (url) {
    let label = 'postgres (the connection string could not be parsed for display)';
    try {
      const parsed = new URL(url);
      const database = decodeURIComponent(parsed.pathname.replace(/^\//, '')) || '(default database)';
      label = `postgres ${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}/${database}`;
    } catch {
      /* The label is for a human; the driver still gets the string itself. */
    }
    return { engine: 'postgres', label, url };
  }
  const file = CONFIG.server.database;
  return { engine: 'sqlite', label: `sqlite ${file === ':memory:' ? file : resolve(file)}`, file };
}

/**
 * Print the target, and refuse a shared database without `--yes`.
 *
 * Printed *before* anything is opened, because opening is already a write —
 * `openDb` migrates. Postgres is production here (a developer's checkout runs on
 * the SQLite file), and `NODE_ENV=production` is the other way a box says so;
 * either one needs the person at the keyboard to have typed that they mean it.
 */
export function confirmTarget(target: Target, script: string): void {
  console.log(`${script}: database ${target.label}`);
  const production = process.env.NODE_ENV === 'production';
  if ((target.engine === 'postgres' || production) && !flag('yes')) {
    throw new Refusal(
      `${script} will write to ${target.engine === 'postgres' ? 'a Postgres database' : 'a production database'}. ` +
        'Re-run with --yes once you have taken a backup (see server/demo/README.md).',
    );
  }
}

/**
 * Open it — the same two drivers `boot()` opens, and nothing else of `boot()`.
 *
 * `boot()` itself is not called because it also runs the legacy import whenever
 * the catalogue is empty, and a demo script importing an export is a side
 * effect nobody asked for. A SQLite path that does not exist is refused rather
 * than created: a mistyped `PAYLEZ_DB` would otherwise produce a fresh file,
 * seed it, and leave the real one untouched while reporting success.
 */
export async function openTarget(target: Target): Promise<Db> {
  if (target.engine === 'postgres') return await openPgDb(target.url!);
  const file = target.file!;
  if (file !== ':memory:' && !existsSync(file)) {
    throw new Refusal(`there is no database at ${resolve(file)} — check PAYLEZ_DB, or start the server once`);
  }
  return await openDb(file);
}

/* ─────────────────────────────────────────────────────────── selecting ── */

/**
 * `column IN ($p0, $p1, …)`, with the values added to `params`.
 *
 * Named parameters because both drivers accept them (`pg.ts` renumbers), and an
 * empty set becomes a constant rather than `IN ()`, which neither engine parses.
 * The negated form matters most: `x NOT IN (NULL)` is never true, so an empty
 * exclusion has to be written as "everything".
 */
export function inSet(
  column: string,
  ids: readonly string[],
  prefix: string,
  params: Record<string, Param>,
  negate = false,
): string {
  if (ids.length === 0) return negate ? '1 = 1' : '1 = 0';
  const holes = ids.map((id, index) => {
    params[`${prefix}${index}`] = id;
    return `$${prefix}${index}`;
  });
  return `${column} ${negate ? 'NOT IN' : 'IN'} (${holes.join(', ')})`;
}

export interface DemoSet {
  /** Every account the purge treats as demo, including `erased` below. */
  users: string[];
  venues: string[];
  /**
   * Accounts that were demo accounts and were then erased through
   * `DELETE /v1/me` or the console while somebody tested with them. Erasure
   * nulls the address, so they can no longer be found by it; they are found by
   * footprint instead — an erased row whose only venue history is a demo venue.
   */
  erased: string[];
}

export async function findDemo(db: Db): Promise<DemoSet> {
  const byAddress = (
    await db.all<{ id: string }>(`SELECT id FROM users WHERE LOWER(email_norm) LIKE $d ORDER BY created_at, id`, {
      d: DEMO_ADDRESS_LIKE,
    })
  ).map((row) => row.id);

  const ownerParams: Record<string, Param> = { d: DEMO_ADDRESS_LIKE };
  const venues = (
    await db.all<{ id: string }>(
      `SELECT id FROM venues
        WHERE LOWER(COALESCE(email, '')) LIKE $d OR ${inSet('owner_user_id', byAddress, 'o', ownerParams)}
        ORDER BY created_at, id`,
      ownerParams,
    )
  ).map((row) => row.id);

  let erased: string[] = [];
  if (venues.length > 0) {
    const p: Record<string, Param> = {};
    const owns = inSet('v.id', venues, 'a', p);
    const here = inSet('vc.venue_id', venues, 'b', p);
    const elsewhere = inSet('vc2.venue_id', venues, 'c', p, true);
    const txElsewhere = inSet('t.venue_id', venues, 'e', p, true);
    erased = (
      await db.all<{ id: string }>(
        `SELECT u.id FROM users u
          WHERE u.status = 'erased' AND u.email_norm IS NULL
            AND (EXISTS (SELECT 1 FROM venues v WHERE v.owner_user_id = u.id AND ${owns})
                 OR (EXISTS (SELECT 1 FROM venue_customers vc WHERE vc.user_id = u.id AND ${here})
                     AND NOT EXISTS (SELECT 1 FROM venue_customers vc2 WHERE vc2.user_id = u.id AND ${elsewhere})
                     AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.user_id = u.id AND ${txElsewhere})))`,
        p,
      )
    ).map((row) => row.id);
  }

  return { users: [...byAddress, ...erased.filter((id) => !byAddress.includes(id))], venues, erased };
}

/* ─────────────────────────────────────────────────────────── inspecting ── */

const SAFE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export async function tableNames(db: Db, engine: Engine): Promise<string[]> {
  const rows =
    engine === 'sqlite'
      ? await db.all<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite%' ORDER BY name`,
        )
      : await db.all<{ name: string }>(
          `SELECT table_name AS name FROM information_schema.tables
            WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name`,
        );
  /* Interpolated into SQL below, so a name that is not an identifier stops the
     script rather than being quoted into a statement. */
  return rows.map((row) => row.name).filter((name) => SAFE_NAME.test(name));
}

export async function rowCounts(db: Db, engine: Engine): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of await tableNames(db, engine)) {
    out[table] = Number((await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM "${table}"`))?.n ?? 0);
  }
  return out;
}

async function textColumns(db: Db, engine: Engine): Promise<Array<{ table: string; columns: string[] }>> {
  const out: Array<{ table: string; columns: string[] }> = [];
  if (engine === 'sqlite') {
    for (const table of await tableNames(db, engine)) {
      const columns = (await db.all<{ name: string; type: string }>(`PRAGMA table_info("${table}")`))
        .filter((column) => /TEXT|CHAR|CLOB/i.test(column.type) && SAFE_NAME.test(column.name))
        .map((column) => column.name);
      if (columns.length > 0) out.push({ table, columns });
    }
    return out;
  }
  const rows = await db.all<{ table_name: string; column_name: string }>(
    `SELECT c.table_name, c.column_name
       FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = current_schema() AND t.table_type = 'BASE TABLE'
        AND c.data_type IN ('text', 'character varying', 'character')
      ORDER BY c.table_name, c.ordinal_position`,
  );
  for (const row of rows) {
    if (!SAFE_NAME.test(row.table_name) || !SAFE_NAME.test(row.column_name)) continue;
    const last = out.at(-1);
    if (last?.table === row.table_name) last.columns.push(row.column_name);
    else out.push({ table: row.table_name, columns: [row.column_name] });
  }
  return out;
}

export interface Residue {
  table: string;
  column: string;
  rows: number;
  sample: string[];
}

/**
 * Every TEXT column of every table, searched for ids that should be gone.
 *
 * Two lists because they are two kinds of reference. `contains` is searched as
 * a substring — the accounts, the venue, its deals and campaigns — since those
 * are the ids that turn up *inside* other text: an audit entry's JSON, a
 * stamp-card completion key (`cmp_…:3`), a billing payload. `equals` is the long
 * tail (every transaction, voucher, reward and ledger entry), matched exactly,
 * because a substring search over thousands of ids is the one part of this that
 * would not finish on a real database.
 *
 * The ids travel as one JSON array per list rather than as thousands of bound
 * parameters, which is the only form both engines take at that size.
 */
export async function residueScan(
  db: Db,
  engine: Engine,
  ids: { contains: readonly string[]; equals: readonly string[] },
): Promise<Residue[]> {
  if (ids.contains.length === 0 && ids.equals.length === 0) return [];
  const list = (param: string) =>
    engine === 'sqlite'
      ? `SELECT value AS v FROM json_each($${param})`
      : `SELECT jsonb_array_elements_text(CAST($${param} AS jsonb)) AS v`;
  const within = (column: string) =>
    engine === 'sqlite' ? `instr("${column}", s.v) > 0` : `strpos("${column}", s.v) > 0`;
  const params = { s: JSON.stringify(ids.contains), e: JSON.stringify(ids.equals) };
  const predicate = (column: string) =>
    `(EXISTS (SELECT 1 FROM (${list('s')}) s WHERE ${within(column)}) OR "${column}" IN (${list('e')}))`;

  const found: Residue[] = [];
  for (const { table, columns } of await textColumns(db, engine)) {
    const any = Number(
      (await db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM "${table}" WHERE ${columns.map(predicate).join(' OR ')}`,
        params,
      ))?.n ?? 0,
    );
    if (any === 0) continue;
    for (const column of columns) {
      const rows = Number(
        (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM "${table}" WHERE ${predicate(column)}`, params))?.n ?? 0,
      );
      if (rows === 0) continue;
      const sample = (
        await db.all<{ value: string }>(
          `SELECT "${column}" AS value FROM "${table}" WHERE ${predicate(column)} LIMIT 3`,
          params,
        )
      ).map((row) => String(row.value).slice(0, 120));
      found.push({ table, column, rows, sample });
    }
  }
  return found;
}

/* ─────────────────────────────────────────────────────── time and chance ── */

/**
 * A small seeded generator (mulberry32).
 *
 * Seeded rather than `Math.random` so two runs of the seed describe the same
 * café: the same customers on the same days at the same hours, with the same
 * bills. Ids and the password stay random — they are identifiers and a secret,
 * and neither should be predictable from this file.
 */
export function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `YYYY-MM-DD` plus whole calendar days, independent of any zone. */
export function shiftDay(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * The UTC instant of a wall-clock time in a zone.
 *
 * Found by correcting a naive guess by the offset `local()` reports — twice,
 * because the offset at the guess and at the answer differ on the two nights a
 * year the clocks change. Nothing here is scheduled inside that missing hour.
 */
export function zoned(day: string, minutes: number, timezone: string, seconds = 0): string {
  const [y, m, d] = day.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, seconds);
  let instant = target;
  for (let step = 0; step < 3; step += 1) {
    const l = local(new Date(instant).toISOString(), timezone);
    const [ly, lm, ld] = l.day.split('-').map(Number);
    const seen = Date.UTC(ly, lm - 1, ld, l.hour, l.minute, seconds);
    if (seen === target) break;
    instant -= seen - target;
  }
  return new Date(instant).toISOString();
}
