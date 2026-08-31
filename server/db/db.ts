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
 * Every game a session may be started for, in the order `schema.sql` lists them.
 *
 * Here for the same reason `LEDGER_REASONS` is: `game_sessions.game_type` carries
 * a CHECK, a CHECK has to live in SQL, and the migration that widens one has to
 * *write* the list from TypeScript. `domain/games.ts` derives `GameType` from
 * this tuple, the route's `oneOf` validates against it and `openapi.ts` publishes
 * it, so there is one list and a SQL copy that `assertGameTypes` reconciles on
 * every boot rather than trusts.
 *
 * **Eight entries, seven cards.** `poland` and `uzbekistan` are one game to a
 * player — a local-knowledge quiz whose bank is chosen by the country on their
 * profile — and two entries here, because a question about the Sejm and a
 * question about Samarkand are not interchangeable. They score identically and
 * share every code path; only `quiz_items.bank` tells them apart.
 */
export const GAME_TYPES = [
  'flags',
  'capitals',
  'brain',
  'poland',
  'uzbekistan',
  'word_builder',
  'memory_match',
  'flight',
] as const;

/**
 * What `schema_meta.version` reads once every migration below has run.
 *
 * 1 → 2 widened the ledger's reason vocabulary, which a CHECK constraint cannot
 * do in place.
 * 2 → 3 retired contact verification — a column drop — and backfilled the
 * birthday's edit counter, which is a rewrite of existing rows. Neither is
 * additive, so neither can be an `addColumn`.
 * 3 → 4 retired the free-text `headline` in favour of the chosen `occupation`
 * beside it. Another drop.
 * 4 → 5 admitted the Uzbekistan quiz to `game_sessions.game_type`. A CHECK
 * again, and so a rebuild again.
 */
const SCHEMA_VERSION = 5;

const schemaVersion = (db: Db): number => {
  const row = db.get<{ value: string }>(`SELECT value FROM schema_meta WHERE key = 'version'`);
  const parsed = row ? Number(row.value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * The quoted values inside one column's `CHECK (<column> IN (…))`, in file
 * order.
 *
 * Read from `sqlite_master.sql`, which is the statement as it was typed — so the
 * newline `schema.sql` wraps a long list on is inside the match, and the lazy
 * `[\s\S]*?` is what stops it running on into the next column's own CHECK.
 */
function checkedValues(sql: string, column: string): string[] {
  const clause = new RegExp(`CHECK \\(${column} IN \\(([\\s\\S]*?)\\)\\)`).exec(sql);
  if (!clause) return [];
  return [...clause[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

/** The `CREATE TABLE` statement a table was made with, or null if it is absent. */
const tableSql = (db: Db, name: string): string | null =>
  db.get<{ sql: string }>(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = $n`, {
    n: name,
  })?.sql ?? null;

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

  const table = tableSql(db, 'points_ledger');
  if (!table) return;
  const present = new Set(checkedValues(table, 'reason'));
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

const userCount = (db: Db): number =>
  db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM users`)?.n ?? 0;

/**
 * Version 3: nothing is verified any more, and a birthday may be corrected once.
 *
 * Two changes to `users` that `addColumn` cannot make, which is the whole reason
 * they are down here behind a version rather than up there with the additions.
 *
 * **The drop.** `phone_verified` recorded a fact — "a code was sent to *this*
 * number and came back" — that nothing produces any more: there is no
 * verification flow, no earn for one, and no route to start one. Leaving the
 * column would leave every row saying `0` and a reader with no way to tell "not
 * verified" from "we stopped asking", which is the same lie `suppressed` exists
 * to prevent one layer up. `ALTER TABLE … DROP COLUMN` is safe here precisely
 * because the column carries nothing else: it is in no index, no CHECK, no view
 * and no foreign key, which are the four things SQLite refuses the drop for.
 *
 * **The backfill.** `birth_date_changes` counts accepted writes, and its default
 * is 0 — which on a live database would hand every account that *already* has a
 * birthday two more edits instead of one. Rows with a birthday have spent their
 * first write by definition, so they start at 1. This is the whole argument for
 * keeping a count rather than reading `birth_date_set_at`: the timestamp is
 * equally true after one write and after two, and the rule needs to tell them
 * apart.
 *
 * Guarded the way version 2 is — on the stored version *and* on what is actually
 * in the file, so a database created fresh from `schema.sql` (which never had
 * the column, and whose `birth_date_changes` is already right because it has no
 * rows) does nothing. And proved rather than assumed: `users` is counted inside
 * the transaction, before and after, and a difference throws and rolls the whole
 * thing back. A drop is a table rewrite, and a rewrite that cannot show it kept
 * every row is not one worth running against production.
 */
function retireContactVerification(db: Db): void {
  if (schemaVersion(db) >= 3) return;
  if (!db.get(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'`)) return;

  const columns = db.all<{ name: string }>(`PRAGMA table_info(users)`).map((row) => row.name);
  const hasVerified = columns.includes('phone_verified');
  /* `addColumn` above has already added the counter, so the only question is
     whether any row is still sitting on its default with a birthday in place.
     Asking that rather than assuming it keeps the migration a no-op on the
     fresh file, where there are no rows at all. */
  const needsBackfill =
    columns.includes('birth_date_changes') &&
    Boolean(db.get(`SELECT 1 FROM users WHERE birth_date IS NOT NULL AND birth_date_changes = 0`));
  if (!hasVerified && !needsBackfill) return;

  db.tx(() => {
    const before = userCount(db);

    if (needsBackfill) {
      /* Only where the counter is still at its default: re-running this after a
         player has already used their correction must not walk it backwards. */
      db.run(
        `UPDATE users SET birth_date_changes = 1
          WHERE birth_date IS NOT NULL AND birth_date_changes = 0`,
      );
    }
    if (hasVerified) db.exec('ALTER TABLE users DROP COLUMN phone_verified');

    const after = userCount(db);
    if (after !== before) {
      throw new Error(`profile migration lost rows: users ${before} → ${after}`);
    }
    const orphans = db.all(`PRAGMA foreign_key_check`);
    if (orphans.length > 0) {
      throw new Error(`profile migration left ${orphans.length} broken references`);
    }
  });
}

/**
 * Version 4: the free-text line about yourself becomes a chosen status.
 *
 * `headline` held whatever somebody typed; `occupation` — added by the
 * `addColumn` above — holds one of five values the picker offers. The product
 * decided the second replaces the first, so the column goes rather than sitting
 * there written by nothing: a column nobody writes and nobody reads is a column
 * the next reader has to work out the status of, which is the same argument the
 * version-3 migration makes for `phone_verified`.
 *
 * **A drop is data loss, so it is counted out loud rather than performed
 * quietly.** Row counts are asserted identical the way both migrations above do
 * theirs — that is the invariant that actually matters, and a rewrite that
 * cannot show it kept every row is not one worth running against production.
 * But rows are not the only thing a `DROP COLUMN` can lose, so the non-empty
 * headlines are counted first and reported. It is a warning and not a refusal
 * on purpose: a server that will not boot because one person wrote "hi about
 * me" is a worse outcome than losing "hi about me", and there is nowhere honest
 * to put a sentence in a five-value picker. What must not happen is losing them
 * *silently*.
 *
 * Guarded the way the other two are — on the stored version *and* on what is
 * actually in the file, so a database created fresh from `schema.sql` (which no
 * longer declares the column) does nothing at all. `ALTER TABLE … DROP COLUMN`
 * is available here for the same reason it was for `phone_verified`: the column
 * is in no index, no CHECK, no view and no foreign key, which are the four
 * things SQLite refuses a drop for.
 */
function retireTheHeadline(db: Db): void {
  if (schemaVersion(db) >= 4) return;
  if (!db.get(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'`)) return;
  const columns = db.all<{ name: string }>(`PRAGMA table_info(users)`).map((row) => row.name);
  if (!columns.includes('headline')) return;

  const written =
    db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM users WHERE headline IS NOT NULL AND TRIM(headline) <> ''`,
    )?.n ?? 0;
  if (written > 0) {
    console.warn(
      `migration 4: dropping users.headline discards ${written} written line(s) — ` +
        'the product replaced it with the chosen `occupation`, and a sentence has ' +
        'nowhere to go in a five-value picker.',
    );
  }

  db.tx(() => {
    const before = userCount(db);
    db.exec('ALTER TABLE users DROP COLUMN headline');
    const after = userCount(db);
    if (after !== before) {
      throw new Error(`headline migration lost rows: users ${before} → ${after}`);
    }
    const orphans = db.all(`PRAGMA foreign_key_check`);
    if (orphans.length > 0) {
      throw new Error(`headline migration left ${orphans.length} broken references`);
    }
  });
}

const gameCounts = (db: Db): { sessions: number; events: number } => ({
  sessions: db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM game_sessions`)?.n ?? 0,
  events: db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM game_events`)?.n ?? 0,
});

/**
 * Version 5: the local-knowledge quiz gained a second country.
 *
 * `game_sessions.game_type` carries a CHECK, and a CHECK cannot be altered in
 * place, so admitting `uzbekistan` to it is the documented table rebuild — new
 * table, copy, drop, rename — for the same reason version 2 was. Without it a
 * fresh database plays the game and every database that already exists refuses
 * the insert, which is the worst shape a schema change can take: it passes every
 * test and fails only where there is data.
 *
 * **`game_events.session_id` is `REFERENCES game_sessions (id) ON DELETE
 * CASCADE`**, so this has version 2's trap exactly: with foreign keys on,
 * `DROP TABLE` runs an implicit `DELETE FROM` first and takes every move a
 * player ever reported with it — and the sessions would survive, scored, with
 * nothing left to show how they were scored. `PRAGMA foreign_keys = OFF` around
 * the rebuild is what prevents that, and it sits outside the transaction because
 * the pragma is a no-op inside one.
 *
 * Proved rather than assumed, again: both tables are counted inside the
 * transaction, before and after, and `foreign_key_check` runs before the commit.
 * A difference throws, which rolls the rebuild back and leaves the original
 * table as it was.
 *
 * Guarded twice so it runs once and never again — on the stored version, and on
 * the constraint already in the file, because a database created fresh from
 * `schema.sql` has the new vocabulary and nothing to rebuild.
 */
function widenGameTypes(db: Db): void {
  if (schemaVersion(db) >= 5) return;

  const table = tableSql(db, 'game_sessions');
  if (!table) return;
  const present = new Set(checkedValues(table, 'game_type'));
  if (GAME_TYPES.every((type) => present.has(type))) return;

  const list = GAME_TYPES.map((type) => `'${type}'`).join(', ');

  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.tx(() => {
      const before = gameCounts(db);

      db.exec(`
        CREATE TABLE game_sessions_v5 (
          id          TEXT PRIMARY KEY,
          user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
          game_type   TEXT NOT NULL CHECK (game_type IN (${list})),
          language    TEXT NOT NULL DEFAULT 'en',
          seed        TEXT NOT NULL,
          secret      TEXT NOT NULL,
          state       TEXT NOT NULL DEFAULT 'active'
                      CHECK (state IN ('active', 'finished', 'abandoned', 'invalidated')),
          score       INTEGER NOT NULL DEFAULT 0,
          answered    INTEGER NOT NULL DEFAULT 0,
          correct     INTEGER NOT NULL DEFAULT 0,
          life_spent  INTEGER NOT NULL DEFAULT 0,
          started_at  TEXT NOT NULL,
          finished_at TEXT,
          ledger_id   TEXT REFERENCES points_ledger (id) ON DELETE SET NULL
        )`);
      db.exec(`
        INSERT INTO game_sessions_v5
          (id, user_id, game_type, language, seed, secret, state, score, answered,
           correct, life_spent, started_at, finished_at, ledger_id)
        SELECT id, user_id, game_type, language, seed, secret, state, score, answered,
               correct, life_spent, started_at, finished_at, ledger_id
          FROM game_sessions`);
      db.exec('DROP TABLE game_sessions');
      db.exec('ALTER TABLE game_sessions_v5 RENAME TO game_sessions');
      /* The old table's index went down with it. */
      db.exec(
        'CREATE INDEX IF NOT EXISTS idx_sessions_game ON game_sessions (user_id, started_at)',
      );

      const after = gameCounts(db);
      if (after.sessions !== before.sessions || after.events !== before.events) {
        throw new Error(
          `game type migration lost rows: sessions ${before.sessions} → ${after.sessions}, ` +
            `events ${before.events} → ${after.events}`,
        );
      }
      const orphans = db.all(`PRAGMA foreign_key_check`);
      if (orphans.length > 0) {
        throw new Error(`game type migration left ${orphans.length} broken references`);
      }
    });
  } finally {
    /* Restored whether the rebuild committed or threw, exactly as version 2
       restores it: the constructor turned them on and every other statement in
       the process assumes they are. */
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
  const table = tableSql(db, 'points_ledger');
  if (!table) return;
  const inTable = checkedValues(table, 'reason');
  const missing = LEDGER_REASONS.filter((reason) => !inTable.includes(reason));
  const extra = inTable.filter((reason) => !(LEDGER_REASONS as readonly string[]).includes(reason));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      'points_ledger.reason disagrees with LEDGER_REASONS ' +
        `(missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'})`,
    );
  }
}

/**
 * The same reconciliation for `game_sessions.game_type` and `GAME_TYPES`.
 *
 * A game the enum offers and the CHECK refuses is a card the client renders, the
 * player taps, and the server rejects with a constraint error rather than a
 * refusal anyone designed — and it happens only on databases that predate the
 * change, which is every deployed one. A game the CHECK allows and the enum has
 * forgotten is the quieter half: rows accumulate under a type nothing can name.
 * Checked on every boot for the same reason the ledger's vocabulary is, and
 * against the live constraint rather than a copy of it.
 */
function assertGameTypes(db: Db): void {
  const table = tableSql(db, 'game_sessions');
  if (!table) return;
  const inTable = checkedValues(table, 'game_type');
  const missing = GAME_TYPES.filter((type) => !inTable.includes(type));
  const extra = inTable.filter((type) => !(GAME_TYPES as readonly string[]).includes(type));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      'game_sessions.game_type disagrees with GAME_TYPES ' +
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
  /* Nullable because "has not told us" is the state most accounts are in, and
     the *set* one is what pays `CONFIG.earn.birthday`. One correction is
     allowed; `birth_date_changes` counts, and the version-3 migration below is
     what stops its `DEFAULT 0` handing an existing birthday a second one. */
  addColumn(db, 'users', 'birth_date', 'TEXT');
  addColumn(db, 'users', 'birth_date_set_at', 'TEXT');
  addColumn(db, 'users', 'birth_date_changes', 'INTEGER NOT NULL DEFAULT 0');
  /* One of `OCCUPATIONS` in `domain/accounts.ts`, and nullable because "has not
     said" is the state every account starts in. No CHECK: see the column's own
     note in `schema.sql` for why a vocabulary that is a product decision does
     not get one on the busiest table in the schema. The free-text `headline`
     this replaced is dropped by the version-4 migration below — and the
     `addColumn` for it had to go with it, or every boot would re-add the column
     the migration had just removed. */
  addColumn(db, 'users', 'occupation', 'TEXT');
  addColumn(db, 'users', 'onboarded_at', 'TEXT');
  /* The once-only guard on `CONFIG.earn.profileComplete`, claimed by an
     `UPDATE … WHERE profile_completed_at IS NULL` the way `onboarded_at` is. */
  addColumn(db, 'users', 'profile_completed_at', 'TEXT');
  addColumn(db, 'users', 'username', 'TEXT');
  addColumn(db, 'users', 'username_norm', 'TEXT');

  /* The handle's uniqueness, and it lives here rather than as a `UNIQUE` in
     `schema.sql` because `ALTER TABLE … ADD COLUMN` cannot carry one — so an
     existing database can only be given the rule as an index, and writing it
     inline as well would leave fresh and migrated files with two different
     schemas. It must run *after* the `addColumn` above: on a database that
     already exists `CREATE TABLE IF NOT EXISTS` is a no-op, so at the top of
     this function the column it indexes does not exist yet.

     Case-insensitivity is the *stored* value's job, not the index's: the domain
     layer writes `username_norm` folded, exactly as `email_norm` is, rather than
     this being `COLLATE NOCASE`. One pattern for one problem — and a column
     holding the answer is a column every lookup, export and report can compare
     on, where a collation is a rule each of them has to remember to repeat. */
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_norm ON users (username_norm)');

  /* Anything that renames, drops or retypes goes here instead, behind the
     version — which is the line `addColumn` above draws. */
  widenLedgerReasons(db);
  assertLedgerReasons(db);
  retireContactVerification(db);
  retireTheHeadline(db);
  widenGameTypes(db);
  assertGameTypes(db);

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
