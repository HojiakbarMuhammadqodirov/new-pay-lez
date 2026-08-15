/**
 * The database handle, and the three things every caller needs from it.
 *
 * `node:sqlite` rather than a driver from npm, for the same reason the front end
 * self-hosts its fonts: this repo has no runtime dependencies and adding a
 * native module to get `INSERT` would be the first. It ships with Node 22, it is
 * synchronous, and synchronous is what a transaction wants — the whole
 * "atomically or not at all" rule of §3.5 is one `BEGIN`/`COMMIT` with no
 * interleaving await in between, which is exactly what an async driver cannot
 * promise you without a connection pool and a lot of care.
 *
 * SQLite is not the deployment target forever; it is the one that lets the whole
 * backend be checked out and run. Every query here is plain SQL against a schema
 * that is Postgres-shaped (no SQLite-only types, no `rowid` tricks), so the port
 * is a driver swap rather than a rewrite.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export type Row = Record<string, unknown>;

/** What a bound parameter may be. `boolean` is widened to 0/1 on the way in. */
export type Param = string | number | bigint | null | Uint8Array | boolean;

export class Db {
  readonly raw: DatabaseSync;
  /** Prepared statements are cached: the same SQL string is prepared once. */
  private readonly cache = new Map<string, ReturnType<DatabaseSync['prepare']>>();
  private depth = 0;

  constructor(file: string) {
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA journal_mode = WAL');
    this.raw.exec('PRAGMA foreign_keys = ON');
    /* NORMAL rather than FULL: a lost transaction on power failure is
       acceptable here in a way a corrupt file is not, and this is the
       difference between ~200 and ~20,000 commits a second. */
    this.raw.exec('PRAGMA synchronous = NORMAL');
    this.raw.exec('PRAGMA busy_timeout = 5000');
  }

  private stmt(sql: string) {
    let s = this.cache.get(sql);
    if (!s) {
      s = this.raw.prepare(sql);
      this.cache.set(sql, s);
    }
    return s;
  }

  all<T = Row>(sql: string, params: Record<string, Param> | Param[] = []): T[] {
    return this.stmt(sql).all(...bound(params)) as T[];
  }

  get<T = Row>(sql: string, params: Record<string, Param> | Param[] = []): T | undefined {
    return this.stmt(sql).get(...bound(params)) as T | undefined;
  }

  run(sql: string, params: Record<string, Param> | Param[] = []): { changes: number } {
    const result = this.stmt(sql).run(...bound(params));
    return { changes: Number(result.changes) };
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  /**
   * Run `fn` inside a transaction, nesting with savepoints.
   *
   * Nesting matters more than it looks: the gate's commit (§3.5) calls into the
   * ledger, the budget and the stamp card, each of which is independently
   * transactional when called on its own. Without savepoints the inner `COMMIT`
   * would end the outer transaction and a later failure would leave the grant
   * half-applied — the exact thing §3.5 forbids.
   */
  tx<T>(fn: () => T): T {
    if (this.depth === 0) {
      this.raw.exec('BEGIN IMMEDIATE');
      this.depth = 1;
      try {
        const out = fn();
        this.raw.exec('COMMIT');
        return out;
      } catch (error) {
        try {
          this.raw.exec('ROLLBACK');
        } catch {
          /* already rolled back by SQLite on some errors */
        }
        throw error;
      } finally {
        this.depth = 0;
      }
    }

    const name = `sp_${this.depth}`;
    this.depth += 1;
    this.raw.exec(`SAVEPOINT ${name}`);
    try {
      const out = fn();
      this.raw.exec(`RELEASE ${name}`);
      return out;
    } catch (error) {
      this.raw.exec(`ROLLBACK TO ${name}`);
      this.raw.exec(`RELEASE ${name}`);
      throw error;
    } finally {
      this.depth -= 1;
    }
  }

  close(): void {
    this.cache.clear();
    this.raw.close();
  }
}

/**
 * Bind values, with booleans widened.
 *
 * SQLite has no boolean and `node:sqlite` refuses one rather than guessing, so
 * every `active: true` in the domain layer would otherwise have to be written
 * `active ? 1 : 0` at the call site. Doing it once here is the difference
 * between a rule and a habit.
 */
function bind(params: Record<string, Param> | Param[]): unknown[] {
  if (Array.isArray(params)) return params.map(widen);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) out[key] = widen(value);
  return [out];
}

/**
 * The same, typed the way `node:sqlite` wants its rest parameter.
 *
 * Its signature is `(...values: SQLInputValue[])` and does not describe the
 * named-parameter object form it also accepts, so the object arm cannot be
 * expressed without this cast. One cast in one place, rather than at every call
 * site — and the `Param` union above is what actually constrains what may be
 * bound.
 */
const bound = (params: Record<string, Param> | Param[]) =>
  bind(params) as Parameters<ReturnType<DatabaseSync['prepare']>['all']>;

const widen = (value: Param): unknown => (typeof value === 'boolean' ? (value ? 1 : 0) : value);

/** Applied once, on an empty file. The schema is idempotent (`IF NOT EXISTS`). */
export function migrate(db: Db): void {
  const sql = readFileSync(join(here, 'schema.sql'), 'utf8');
  /* Not inside a transaction: `PRAGMA journal_mode = WAL` cannot run in one. */
  db.exec(sql);
  db.run(
    `INSERT INTO schema_meta (key, value) VALUES ('version', '1')
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  );
}

export function openDb(file: string): Db {
  const db = new Db(file);
  migrate(db);
  return db;
}
