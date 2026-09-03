/**
 * The same `Db`, over Postgres.
 *
 * `db.ts` wraps `node:sqlite` and is synchronous; this wraps `pg` and is not.
 * The method names, the parameter shape and the return shapes are deliberately
 * identical, so porting a call site is `await` and nothing else — the domain
 * layer never learns which database it is talking to.
 *
 * **This file is the one place the zero-runtime-dependency rule is broken**, and
 * it is broken knowingly. Postgres speaks a binary wire protocol; there is no
 * shipping it with `fetch`. The alternative was PostgREST over HTTP, which
 * cannot express a multi-statement transaction — and `tx()` below is
 * load-bearing (the gate's commit spans the ledger, the budget and the stamp
 * card, and §3.5 forbids applying half of it). One dependency, at the boundary,
 * is the smaller cost.
 *
 * Four things here are not obvious and all four are places a naive port breaks
 * quietly rather than loudly.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import type { Db } from './db.ts';

const here = dirname(fileURLToPath(import.meta.url));

export type Row = Record<string, unknown>;

/** What a bound parameter may be. `boolean` is widened to 0/1 on the way in. */
export type Param = string | number | bigint | null | Uint8Array | boolean;

/*
 * ── 1. Aggregates must come back as numbers ──────────────────────────────────
 *
 * `pg` returns `bigint` (oid 20) and `numeric` (oid 1700) as **strings**, on the
 * correct reasoning that neither fits in a JS double in general. The trap is
 * that `SUM(delta)` over an `integer` column is typed `bigint` by Postgres — so
 * `ledger.ts`'s balance reconciliation, which compares a sum against
 * `points_cache`, would compare `"1240"` to `1240` and disagree with itself on
 * every account. SQLite returned a number and every call site expects one.
 *
 * Parsed to Number here rather than at the call sites: the values are points,
 * minor-unit money and row counts, all far inside 2^53. A column that genuinely
 * needed 64 bits would need this revisited, and there is none.
 */
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

/*
 * ── 2. Named parameters ──────────────────────────────────────────────────────
 *
 * Every query in this repo binds `$name` (SQLite's named form). Postgres binds
 * `$1`, `$2` positionally. The translation happens here so no query has to be
 * rewritten, and it is cached because the same SQL string is issued thousands
 * of times.
 *
 * A name reused within one statement maps to the *same* position — Postgres
 * allows `$1` to appear repeatedly, and several queries here bind `$t` in both
 * a `VALUES` and an `ON CONFLICT DO UPDATE`.
 */
const translations = new Map<string, { text: string; names: string[] }>();

function translate(sql: string): { text: string; names: string[] } {
  const cached = translations.get(sql);
  if (cached) return cached;

  const names: string[] = [];
  const index = (name: string): number => {
    let at = names.indexOf(name);
    if (at === -1) at = names.push(name) - 1;
    return at + 1;
  };

  /*
   * **A parameter tested with `IS NULL` needs a cast, and this is not optional.**
   *
   * The optional-filter idiom this codebase uses everywhere —
   * `($city IS NULL OR city = $city)`, "filter by city unless no city was
   * asked for" — is fine in SQLite and is rejected outright by Postgres with
   * `42P08: could not determine data type of parameter $1`. Postgres resolves
   * parameter types at parse time and `IS NULL` tells it nothing, so it gives
   * up rather than taking the type from the other half of the OR. The whole
   * guidebook, the venue list and the deal board returned 500 on this.
   *
   * `::text` is right for all 26 occurrences in the codebase: every one filters
   * on a city, a country code, a category, a venue id or an ISO timestamp, and
   * all of those are TEXT columns. The cast goes on the `IS NULL` occurrence
   * only — the comparison beside it then resolves as text against a text
   * column, which is what it already was.
   *
   * If the idiom is ever used against a numeric column this throws on that
   * query rather than misbehaving, which is the failure worth having.
   */
  let text = sql.replace(
    /\$([a-zA-Z][a-zA-Z0-9_]*)(\s+IS\s+(?:NOT\s+)?NULL)/gi,
    (_m, name: string, tail: string) => `$${index(name)}::text${tail}`,
  );

  /* Everything else. `$1` from the pass above is left alone (a digit is not a
     letter), as is `$$` dollar-quoting, which has no letter after it. */
  text = text.replace(/\$([a-zA-Z][a-zA-Z0-9_]*)/g, (_m, name: string) => `$${index(name)}`);

  const out = { text, names };
  translations.set(sql, out);
  return out;
}

/**
 * TLS against Supabase, verified rather than trusted blindly.
 *
 * Their pooler presents a chain rooted in **`Supabase Root 2021 CA`**, a
 * private root that is not in any public trust store — so a plain
 * `rejectUnauthorized: true` fails with `SELF_SIGNED_CERT_IN_CHAIN` and the
 * tempting fix is to set it to `false`. That would leave the connection
 * encrypted but unauthenticated: anything that can answer for
 * `*.pooler.supabase.com` gets the password and every row behind it. This
 * database holds names, emails, phone numbers and a payments ledger.
 *
 * So the root is pinned instead (`supabase-ca.crt`, committed beside this
 * file), which is *stronger* than the public store rather than weaker: exactly
 * one CA can vouch for this host, so a mis-issued certificate from any public
 * authority is rejected too.
 *
 * `PAYLEZ_PG_SSL=off` is for a Postgres on localhost, where there is no
 * transport to protect and no certificate to check.
 */
function tlsOptions(): { ca: string; rejectUnauthorized: true } | undefined {
  if (process.env.PAYLEZ_PG_SSL === 'off') return undefined;
  return {
    ca: readFileSync(join(here, 'supabase-ca.crt'), 'utf8'),
    rejectUnauthorized: true,
  };
}

const widen = (value: Param): unknown => (typeof value === 'boolean' ? (value ? 1 : 0) : value);

function bind(sql: string, params: Record<string, Param> | Param[]): { text: string; values: unknown[] } {
  const { text, names } = translate(sql);
  if (Array.isArray(params)) return { text, values: params.map(widen) };

  const values = names.map((name) => {
    if (!(name in params)) throw new Error(`no value bound for $${name}`);
    return widen(params[name] as Param);
  });
  return { text, values };
}

/*
 * ── 3. `INSERT OR REPLACE` / `INSERT OR IGNORE` ──────────────────────────────
 *
 * SQLite's upsert forms have no Postgres equivalent that can be written without
 * naming the conflicting columns, so the translation needs to know each table's
 * conflict target. `CONFLICT_TARGETS` is generated from the schema by
 * `npm run pg:schema` for exactly that reason — a hand-kept copy would be wrong
 * the first time a primary key changed, and wrong in the direction of writing a
 * duplicate row rather than failing.
 *
 * `OR REPLACE` becomes `DO UPDATE SET` every non-key column to the excluded
 * value; `OR IGNORE` becomes `DO NOTHING`. The `changes` count then means what
 * it meant in SQLite — `import.ts` branches on it (`inserted === 0`) to avoid
 * paying a legacy balance twice, and that has to keep working.
 *
 * A table this map does not cover throws rather than guessing. Guessing is how
 * an upsert silently picks the wrong unique index and overwrites a stranger's
 * row.
 */
import { CONFLICT_TARGETS } from './conflicts.ts';

/**
 * The two SQLite spellings that have no Postgres equivalent by that name.
 *
 * `GROUP_CONCAT(x)` joins a column with commas; Postgres calls it
 * `STRING_AGG(x, ',')` and requires the delimiter to be given, which SQLite
 * defaults. There is one call site (the console's user list, building a roles
 * string) and no form that both engines accept, so the translation lives here
 * beside the upsert one rather than forking the query.
 *
 * `MAX(a, b)` — SQLite's *scalar* two-argument form, which Postgres has only as
 * `GREATEST` — is deliberately **not** handled here. Both of its uses were
 * rewritten as `CASE WHEN … END`, which every engine accepts, because a
 * two-argument `MAX` next to a genuine one-argument aggregate `MAX` is the kind
 * of thing a regex gets wrong eventually.
 */
const dialect = new Map<string, string>();

function rewriteDialect(sql: string): string {
  const cached = dialect.get(sql);
  if (cached !== undefined) return cached;
  const out = sql.replace(
    /GROUP_CONCAT\(([^(),]+)\)/gi,
    (_m, expr: string) => `STRING_AGG(${expr.trim()}, ',')`,
  );
  dialect.set(sql, out);
  return out;
}

const upserts = new Map<string, string>();

function rewriteUpsert(sql: string): string {
  const cached = upserts.get(sql);
  if (cached !== undefined) return cached;

  const match = /^\s*INSERT\s+OR\s+(REPLACE|IGNORE)\s+INTO\s+([a-z_]+)\s*\(([^)]*)\)/i.exec(sql);
  if (!match) {
    upserts.set(sql, sql);
    return sql;
  }

  const [, mode, table, columnList] = match;
  const target = CONFLICT_TARGETS[table];
  if (!target) {
    throw new Error(
      `INSERT OR ${mode} INTO ${table}: no conflict target known. ` +
        `Add it to the schema's primary key or handle the statement explicitly.`,
    );
  }

  const columns = columnList.split(',').map((c) => c.trim());
  const keys = new Set(target);
  const updatable = columns.filter((c) => !keys.has(c));

  const action =
    mode.toUpperCase() === 'IGNORE' || updatable.length === 0
      ? 'DO NOTHING'
      : `DO UPDATE SET ${updatable.map((c) => `${c} = excluded.${c}`).join(', ')}`;

  /* The `OR REPLACE|IGNORE` is stripped from the head and the conflict clause
     appended. Appending is safe because none of these statements carries a
     RETURNING or a trailing clause of its own. */
  const head = sql.replace(/^(\s*)INSERT\s+OR\s+(?:REPLACE|IGNORE)\s+INTO/i, '$1INSERT INTO');
  const out = `${head.trimEnd()}\n ON CONFLICT (${target.join(', ')}) ${action}`;
  upserts.set(sql, out);
  return out;
}

/*
 * ── 4. A transaction must stay on one connection ─────────────────────────────
 *
 * With a pool, every query takes whichever connection is free — so a `BEGIN`
 * issued on one and an `INSERT` on another are unrelated, and the commit covers
 * nothing. The client in flight is carried in `AsyncLocalStorage` rather than
 * threaded through every signature, which is what lets `tx(fn)` keep taking a
 * plain callback that calls `db.get(...)` the way it always did.
 *
 * This is the one part of the port that is not mechanical, and the one to
 * suspect if a transaction ever appears to half-apply: an `await` missing
 * *inside* a `tx` callback lets the block escape the storage context, and the
 * stray query lands outside the transaction.
 */
export class PgDb implements Db {
  readonly pool: pg.Pool;
  private readonly current = new AsyncLocalStorage<pg.PoolClient>();

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      /* Supabase's pooler terminates idle connections; a small pool with a
         short idle timeout keeps us from holding ones it has already dropped. */
      max: Number(process.env.PAYLEZ_PG_POOL ?? 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: tlsOptions(),
    });

  }

  /*
   * ── 5. Floats must round-trip ──────────────────────────────────────────
   *
   * Supabase's pooler hands out connections with `extra_float_digits = 0`,
   * which formats a `double precision` to 15 significant digits on the way
   * out. The stored value is the full 8 bytes — this is a *text encoding*
   * setting — so nothing is lost at rest, and it would be easy to dismiss.
   *
   * It is not safe to dismiss, because a read-modify-write makes the
   * truncation permanent: read a venue's `lat` at 15 digits, write the row
   * back, and the sixteenth digit is gone from storage too. `3` asks for the
   * shortest text that reparses to the identical double.
   *
   * It has to be a `SET` on the connection. Passing `options=-c
   * extra_float_digits=3` at startup is accepted by the pooler and then
   * ignored — verified against this project, which still reported `0`.
   *
   * Once per physical connection, tracked in a `WeakSet` because the pool
   * reuses client objects and reopens them over the life of the process.
   * Doing it in the pool's `connect` event instead issues a query while the
   * client is still completing its own startup, which node-postgres deprecates
   * and removes in v9.
   */
  private readonly configured = new WeakSet<pg.PoolClient>();

  private async ready(client: pg.PoolClient): Promise<pg.PoolClient> {
    if (this.configured.has(client)) return client;
    await client.query('SET extra_float_digits = 3');
    this.configured.add(client);
    return client;
  }

  /**
   * The connection this call must use: the transaction's, or one checked out
   * for the duration.
   *
   * `pool.query()` would be shorter, and it gives no chance to configure the
   * connection before the first statement runs on it — see `ready` above.
   */
  private async query(sql: string, params: Record<string, Param> | Param[]) {
    const { text, values } = bind(rewriteUpsert(rewriteDialect(sql)), params);

    const inTransaction = this.current.getStore();
    if (inTransaction) return inTransaction.query(text, values);

    const client = await this.ready(await this.pool.connect());
    try {
      return await client.query(text, values);
    } finally {
      client.release();
    }
  }

  async all<T = Row>(sql: string, params: Record<string, Param> | Param[] = []): Promise<T[]> {
    return (await this.query(sql, params)).rows as T[];
  }

  async get<T = Row>(
    sql: string,
    params: Record<string, Param> | Param[] = [],
  ): Promise<T | undefined> {
    return (await this.query(sql, params)).rows[0] as T | undefined;
  }

  async run(
    sql: string,
    params: Record<string, Param> | Param[] = [],
  ): Promise<{ changes: number }> {
    return { changes: (await this.query(sql, params)).rowCount ?? 0 };
  }

  async exec(sql: string): Promise<void> {
    const inTransaction = this.current.getStore();
    if (inTransaction) {
      await inTransaction.query(sql);
      return;
    }
    const client = await this.ready(await this.pool.connect());
    try {
      await client.query(sql);
    } finally {
      client.release();
    }
  }

  /**
   * Run `fn` inside a transaction, nesting with savepoints.
   *
   * The nesting is the same construction `db.ts` documents and exists for the
   * same reason: the gate's commit calls into the ledger, the budget and the
   * stamp card, each independently transactional on its own, and without
   * savepoints the inner COMMIT would end the outer transaction.
   */
  async tx<T>(fn: () => Promise<T> | T): Promise<T> {
    const existing = this.current.getStore();

    if (existing) {
      const name = `sp_${Math.random().toString(36).slice(2, 10)}`;
      await existing.query(`SAVEPOINT ${name}`);
      try {
        const out = await fn();
        await existing.query(`RELEASE SAVEPOINT ${name}`);
        return out;
      } catch (error) {
        await existing.query(`ROLLBACK TO SAVEPOINT ${name}`);
        await existing.query(`RELEASE SAVEPOINT ${name}`);
        throw error;
      }
    }

    const client = await this.ready(await this.pool.connect());
    try {
      await client.query('BEGIN');
      const out = await this.current.run(client, async () => {
        const value = await fn();
        await client.query('COMMIT');
        return value;
      });
      return out;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* the server may have rolled it back already */
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Apply the schema and stamp the version.
 *
 * Deliberately shorter than the SQLite `migrate()`, and the difference is worth
 * stating: that one carries four historical migrations (`widenLedgerReasons`,
 * `retireContactVerification`, `retireTheHeadline`, `widenGameTypes`) which
 * rebuild tables to change a CHECK constraint, because SQLite cannot alter one
 * in place. **A Postgres database here is born at the current version**, so
 * none of them has anything to do — there is no v1 Postgres file anywhere to
 * upgrade. Re-implementing them would be writing migrations from a state that
 * has never existed.
 *
 * What survives is the pair of *assertions*, because those check a live fact
 * rather than replay history: that the CHECK constraints on `points_ledger`
 * and `game_sessions` still admit every value the code can write.
 */
export async function migrate(db: PgDb): Promise<void> {
  const sql = readFileSync(join(here, 'schema.pg.sql'), 'utf8');
  await db.exec(sql);

  /* Postgres has `ADD COLUMN IF NOT EXISTS`, so the `PRAGMA table_info` dance
     `db.ts` needs is one statement here. They are no-ops on a database created
     from the schema above and matter only for one created by an older build. */
  const add = async (table: string, column: string, definition: string) =>
    db.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);

  await add('service_events', 'source', 'TEXT');
  await add('users', 'phone', 'TEXT');
  await add('users', 'birth_date', 'TEXT');
  await add('users', 'birth_date_set_at', 'TEXT');
  await add('users', 'birth_date_changes', 'INTEGER NOT NULL DEFAULT 0');
  await add('users', 'occupation', 'TEXT');
  await add('users', 'onboarded_at', 'TEXT');
  await add('users', 'profile_completed_at', 'TEXT');
  await add('users', 'username', 'TEXT');
  await add('users', 'username_norm', 'TEXT');

  await db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_norm ON users (username_norm)',
  );

  await db.run(
    `INSERT INTO schema_meta (key, value) VALUES ('version', $v)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    { v: String(SCHEMA_VERSION) },
  );
}

/** Mirrors `SCHEMA_VERSION` in `db.ts`; the two schemas are one schema. */
const SCHEMA_VERSION = 5;

export async function openDb(connectionString: string): Promise<Db> {
  const db = new PgDb(connectionString);
  await migrate(db);
  return db;
}
