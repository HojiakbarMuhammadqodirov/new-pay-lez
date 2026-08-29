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

/**
 * `ALTER TABLE … ADD COLUMN`, but only when the column is not already there.
 *
 * `schema.sql` is idempotent through `CREATE TABLE IF NOT EXISTS`, which makes
 * a *new* column invisible to every database that already exists — the create
 * is skipped and the column never arrives, so the first query naming it fails
 * at runtime on exactly the deployments that have data in them. SQLite has no
 * `ADD COLUMN IF NOT EXISTS`, so the check is `PRAGMA table_info`.
 *
 * Additive only, and deliberately so: adding a nullable column is the one schema
 * change that is safe to run unattended against a live file. Anything that
 * renames, drops or retypes needs a real migration with a version number behind
 * it, and `schema_meta` is where that would go.
 */
function addColumn(db: Db, table: string, column: string, definition: string): void {
  const columns = db.all<{ name: string }>(`PRAGMA table_info(${table})`);
  if (columns.some((row) => row.name === column)) return;
  db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/**
 * The reasons a points entry may carry, in the order `schema.sql` lists them.
 *
 * Two copies of one vocabulary, which is a thing this repo otherwise refuses —
 * but the CHECK constraint has to live in SQL (the ledger outlives every process
 * that writes to it) and the version-2 migration below has to *write* a CHECK,
 * so it needs the list in TypeScript. They are reconciled rather than trusted:
 * `assertLedgerReasons` reads the live constraint on every boot and throws if
 * the two disagree, which turns a silent drift into a server that will not
 * start.
 *
 * Fourteen ways up, four ways down. Adding one is a migration, not an edit —
 * see `widenLedgerReasons`.
 */
export const LEDGER_REASONS = [
  'game_win',
  'scan_earn',
  'spend_bonus',
  'venue_bonus',
  'stamp_complete',
  'review',
  'referral',
  'welcome_bonus',
  'profile_bonus',
  'check_in',
  'streak_milestone',
  'occasion',
  'stipend',
  'adjustment',
  'voucher_redeem',
  'gift_card_redeem',
  'expiry',
  'reversal',
] as const;

/**
 * What `schema_meta.version` reads once every migration below has run.
 *
 * 1 → 2 widened the ledger's reason vocabulary, which a CHECK constraint cannot
 * do in place.
 */
const SCHEMA_VERSION = 2;

const schemaVersion = (db: Db): number => {
  const row = db.get<{ value: string }>(`SELECT value FROM schema_meta WHERE key = 'version'`);
  const parsed = row ? Number(row.value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

/** The quoted values inside a table's `CHECK (reason IN (…))`, in file order. */
function reasonsInTable(sql: string): string[] {
  const clause = /CHECK \(reason IN \(([\s\S]*?)\)\)/.exec(sql);
  if (!clause) return [];
  return [...clause[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

const ledgerCounts = (db: Db): { entries: number; lots: number } => ({
  entries: db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM points_ledger`)?.n ?? 0,
  lots: db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM points_lots`)?.n ?? 0,
});

/**
 * Version 2: the ledger's reason vocabulary, nine values widened to eighteen.
 *
 * A SQLite CHECK cannot be altered in place, so this is the documented table
 * rebuild — new table, copy, drop, rename — and the dangerous part of it is
 * `points_lots`.
 *
 * **`points_lots.ledger_id` is `REFERENCES points_ledger (id) ON DELETE
 * CASCADE`.** With foreign keys enabled, `DROP TABLE` performs an implicit
 * `DELETE FROM` first and fires exactly that cascade — so the careless rebuild
 * takes every FIFO lot with it and leaves a ledger that still sums to the right
 * balance while none of it can be spent. `PRAGMA foreign_keys = OFF` around the
 * rebuild is what prevents that, and it sits *outside* the transaction because
 * the pragma is a no-op inside one. The rename afterwards re-points the
 * surviving `REFERENCES points_ledger` clause at the new table, because SQLite
 * rewrites references to a table it renames.
 *
 * **And it is proved rather than assumed.** Both tables are counted inside the
 * transaction, before and after; a difference throws, which rolls the whole
 * thing back and leaves the original table exactly as it was. `foreign_key_check`
 * runs before the commit for the same reason — a migration that cannot show its
 * work on a ledger with real rows in it is not one worth running.
 *
 * Guarded twice, so it runs once and never again: on the stored version, and on
 * the constraint already in the file, because a database created fresh from
 * `schema.sql` has the new vocabulary and nothing to rebuild.
 */
function widenLedgerReasons(db: Db): void {
  if (schemaVersion(db) >= 2) return;

  const table = db.get<{ sql: string }>(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'points_ledger'`,
  );
  if (!table) return;
  const present = new Set(reasonsInTable(table.sql));
  if (LEDGER_REASONS.every((reason) => present.has(reason))) return;

  const list = LEDGER_REASONS.map((reason) => `'${reason}'`).join(', ');

  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.tx(() => {
      const before = ledgerCounts(db);

      db.exec(`
        CREATE TABLE points_ledger_v2 (
          id         TEXT PRIMARY KEY,
          user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
          delta      INTEGER NOT NULL,
          reason     TEXT NOT NULL CHECK (reason IN (${list})),
          source_ref TEXT,
          source_kind TEXT,
          multiplier REAL NOT NULL DEFAULT 1.0,
          status     TEXT NOT NULL DEFAULT 'committed'
                     CHECK (status IN ('committed', 'reversed')),
          venue_id   TEXT REFERENCES venues (id) ON DELETE SET NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT
        )`);
      db.exec(`
        INSERT INTO points_ledger_v2
          (id, user_id, delta, reason, source_ref, source_kind, multiplier, status,
           venue_id, created_at, expires_at)
        SELECT id, user_id, delta, reason, source_ref, source_kind, multiplier, status,
               venue_id, created_at, expires_at
          FROM points_ledger`);
      db.exec('DROP TABLE points_ledger');
      db.exec('ALTER TABLE points_ledger_v2 RENAME TO points_ledger');
      /* The old table's indexes went down with it. */
      db.exec('CREATE INDEX IF NOT EXISTS idx_ledger_user ON points_ledger (user_id, created_at)');
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_ledger_source ON points_ledger (source_kind, source_ref)',
      );

      const after = ledgerCounts(db);
      if (after.entries !== before.entries || after.lots !== before.lots) {
        throw new Error(
          `ledger migration lost rows: entries ${before.entries} → ${after.entries}, ` +
            `lots ${before.lots} → ${after.lots}`,
        );
      }
      const orphans = db.all(`PRAGMA foreign_key_check`);
      if (orphans.length > 0) {
        throw new Error(`ledger migration left ${orphans.length} broken references`);
      }
    });
  } finally {
    /* Restored whether the rebuild committed or threw: the constructor turned
       them on and every other statement in the process assumes they are. */
    db.exec('PRAGMA foreign_keys = ON');
  }
}

/**
 * The SQL constraint and `LEDGER_REASONS` must be the same set, both ways.
 *
 * On every boot rather than in the test suite, because what it catches is a
 * reason the domain layer writes happily and the database rejects at 3am — or
 * worse, one the database accepts and no report knows how to name.
 */
function assertLedgerReasons(db: Db): void {
  const table = db.get<{ sql: string }>(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'points_ledger'`,
  );
  if (!table) return;
  const inTable = reasonsInTable(table.sql);
  const missing = LEDGER_REASONS.filter((reason) => !inTable.includes(reason));
  const extra = inTable.filter((reason) => !(LEDGER_REASONS as readonly string[]).includes(reason));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      'points_ledger.reason disagrees with LEDGER_REASONS ' +
        `(missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'})`,
    );
  }
}

/** Applied once, on an empty file. The schema is idempotent (`IF NOT EXISTS`). */
export function migrate(db: Db): void {
  const sql = readFileSync(join(here, 'schema.sql'), 'utf8');
  /* Not inside a transaction: `PRAGMA journal_mode = WAL` cannot run in one. */
  db.exec(sql);

  /* Columns added after the first release. See `addColumn` for why the schema
     file alone cannot deliver these. */
  addColumn(db, 'service_events', 'source', 'TEXT');
  addColumn(db, 'users', 'phone', 'TEXT');
  addColumn(db, 'users', 'phone_verified', 'INTEGER NOT NULL DEFAULT 0');
  /* Write-once, enforced in `domain/accounts.ts`. Nullable because "has not
     told us" is the state most accounts are in, and the *set* one is what pays
     `CONFIG.earn.birthday`. */
  addColumn(db, 'users', 'birth_date', 'TEXT');
  addColumn(db, 'users', 'birth_date_set_at', 'TEXT');
  addColumn(db, 'users', 'headline', 'TEXT');
  addColumn(db, 'users', 'onboarded_at', 'TEXT');

  /* Anything that renames, drops or retypes goes here instead, behind the
     version — which is the line `addColumn` above draws. */
  widenLedgerReasons(db);
  assertLedgerReasons(db);

  db.run(
    `INSERT INTO schema_meta (key, value) VALUES ('version', $v)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    { v: String(SCHEMA_VERSION) },
  );
}

export function openDb(file: string): Db {
  const db = new Db(file);
  migrate(db);
  return db;
}
