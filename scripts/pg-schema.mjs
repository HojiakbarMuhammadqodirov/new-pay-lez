/**
 * `server/db/schema.sql` → `server/db/schema.pg.sql`.
 *
 * The Supabase (Postgres) schema is *generated* rather than hand-kept, because
 * two schemas maintained side by side disagree the first time either is edited
 * alone — and the one that disagrees silently is the one nobody runs locally.
 * `npm run pg:schema` regenerates it and the output is committed; `verify:api`
 * checks the committed file is current, so a column added to the SQLite schema
 * without regenerating fails there rather than on the first query in production.
 *
 * The translation is small, which is the whole reason this migration is
 * tractable. Postgres accepts `TEXT` and `INTEGER` verbatim, there are no
 * triggers, no `AUTOINCREMENT`, no rowid aliases, no `COLLATE NOCASE` and no
 * `WITHOUT ROWID` in the source. Three things actually differ:
 *
 *   1. **The pragmas go.** `journal_mode` and `foreign_keys` are SQLite's
 *      settings for a file it owns alone. Postgres enforces foreign keys
 *      always, and its WAL is not ours to configure per connection.
 *   2. **`REAL` becomes `double precision`.** Postgres *has* a `real`, and that
 *      is exactly the trap: it is 4-byte float, while SQLite's `REAL` is
 *      8-byte. Eleven columns take it and four of them are `lat`, `lng` and
 *      exchange rates — a silent halving of precision on a coordinate puts a
 *      venue in the wrong street.
 *   3. **`interval` is quoted.** It is a type name in Postgres. `"interval"` is
 *      a valid quoted identifier in *both* engines, so the one INSERT that
 *      names the column (`domain/settings.ts`) is written quoted and stays
 *      correct against either database rather than forking.
 *
 * Everything else — CHECK, UNIQUE, DEFAULT, REFERENCES … ON DELETE
 * CASCADE/SET NULL/RESTRICT, partial-free indexes — is standard SQL and passes
 * through untouched. If that stops being true, this file is where it is stated.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const SOURCE = join(root, 'server/db/schema.sql');
const TARGET = join(root, 'server/db/schema.pg.sql');
const CONFLICTS = join(root, 'server/db/conflicts.ts');

const HEADER = `-- ─────────────────────────────────────────────────────────────────────────────
-- GENERATED FILE — do not edit.
--
-- Produced from \`server/db/schema.sql\` by \`npm run pg:schema\`. Edit the SQLite
-- schema and regenerate; an edit made here is lost the next time anybody runs
-- the generator, and \`verify:api\` fails while the two disagree.
-- ─────────────────────────────────────────────────────────────────────────────

`;

/**
 * Split a line into the SQL half and its trailing `--` comment.
 *
 * Rewriting has to happen on the SQL half only: the source is heavily
 * commented, and the words `REAL` and `interval` appear in prose several times
 * ("the stricter of the two", "all three intervals were cut"). A naive
 * whole-line replace edits the documentation and, worse, would rewrite a word
 * inside a comment into something that reads as a type.
 *
 * A `--` inside a string literal would break this. There is none in the source
 * and the assertion below is what keeps it that way.
 */
function splitComment(line) {
  const at = line.indexOf('--');
  if (at === -1) return [line, ''];
  const before = line.slice(0, at);
  const quotes = (before.match(/'/g) ?? []).length;
  if (quotes % 2 !== 0) {
    throw new Error(`a '--' inside a string literal is not handled: ${line.trim()}`);
  }
  return [before, line.slice(at)];
}

/**
 * Foreign keys that point at a table declared further down the file.
 *
 * SQLite resolves a foreign key when the row is written, so a `REFERENCES` may
 * name a table that does not exist yet and `schema.sql` has two that do.
 * Postgres resolves it at `CREATE TABLE` and fails with
 * `relation "venues" does not exist`.
 *
 * Rather than reordering `schema.sql` — which is the SQLite source of truth and
 * whose order is documented as dependency order — those constraints are lifted
 * out of the column and re-added as `ALTER TABLE` after every table exists.
 * The constraint is identical either way; only the moment it is declared moves.
 * Detected rather than hard-coded, so a third one added later is handled
 * without anybody remembering this exists.
 */
function forwardRefs(sql) {
  const lines = sql.split(/\r?\n/).map((l) => splitComment(l)[0]);

  const created = new Map();
  lines.forEach((l, i) => {
    const m = /CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/.exec(l);
    if (m) created.set(m[1], i);
  });

  let current = null;
  const found = new Map();
  lines.forEach((l, i) => {
    const start = /CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/.exec(l);
    if (start) current = start[1];
    if (/^\);/.test(l)) current = null;
    if (!current) return;

    const ref = /^\s+([a-z_]+)\s+.*?REFERENCES\s+([a-z_]+)\s*\(\s*([a-z_]+)\s*\)/.exec(l);
    if (!ref) return;
    const [, column, target] = ref;
    if (!created.has(target)) throw new Error(`${current}.${column} references unknown ${target}`);
    if (created.get(target) > created.get(current)) found.set(`${current}.${column}`, current);
  });

  return found;
}

function translate(sql) {
  const out = [];
  const lifted = [];
  const forward = forwardRefs(sql);
  let dropped = 0;
  let reals = 0;
  let quoted = 0;
  let table = null;

  for (const line of sql.split(/\r?\n/)) {
    if (/^\s*PRAGMA\b/i.test(line)) {
      dropped += 1;
      continue;
    }

    let [code, comment] = splitComment(line);

    const opens = /CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/.exec(code);
    if (opens) table = opens[1];
    else if (/^\);/.test(code)) table = null;

    /* Lift a forward-referencing foreign key out of the column definition. The
       column keeps its type, its NOT NULL and its trailing comma; only the
       REFERENCES clause moves to the ALTER TABLE emitted at the end. */
    if (table) {
      const ref =
        /^(\s+)([a-z_]+)(\s+.*?)\s+REFERENCES\s+([a-z_]+)\s*\(\s*([a-z_]+)\s*\)(\s+ON DELETE (?:CASCADE|SET NULL|RESTRICT|NO ACTION))?(,?)\s*$/.exec(
          code,
        );
      if (ref && forward.has(`${table}.${ref[2]}`)) {
        const [, indent, column, rest, target, targetColumn, onDelete = '', comma] = ref;
        lifted.push(
          `ALTER TABLE ${table} ADD CONSTRAINT ${table}_${column}_fkey\n` +
            `  FOREIGN KEY (${column}) REFERENCES ${target} (${targetColumn})${onDelete};`,
        );
        code = `${indent}${column}${rest}${comma}`;
      }
    }

    /* `REAL` only ever appears as a column type in this schema — always as the
       second token of a column definition — so anchoring on that shape rather
       than on the bare word keeps it away from anything else. */
    code = code.replace(/^(\s+[a-z_]+\s+)REAL\b/, (_m, head) => {
      reals += 1;
      return `${head}double precision`;
    });

    /* The column definition, and the CHECK on the same line that names it. */
    code = code.replace(/^(\s+)interval(\s+)/, (_m, indent, gap) => {
      quoted += 1;
      return `${indent}"interval"${gap}`;
    });
    code = code.replace(/\bCHECK \(interval\b/g, () => {
      quoted += 1;
      return 'CHECK ("interval"';
    });

    out.push(code + comment);
  }

  return { text: out.join('\n'), dropped, reals, quoted, lifted };
}

const source = readFileSync(SOURCE, 'utf8');
const { text, dropped, reals, quoted, lifted } = translate(source);

/* The lifted foreign keys, after every table exists.
   Wrapped individually because Postgres has no `ADD CONSTRAINT IF NOT EXISTS`
   and `migrate()` runs on every boot — the second run must be a no-op rather
   than an error, exactly as `CREATE TABLE IF NOT EXISTS` is for the rest. */
const tail = lifted.length
  ? `\n\n-- ══════════════════════════════════════════ forward foreign keys ══\n` +
    `-- Lifted out of their column definitions because they point at tables\n` +
    `-- declared further down. See \`scripts/pg-schema.mjs\`.\n\n` +
    lifted
      .map((statement) => `DO $$ BEGIN\n  ${statement}\nEXCEPTION WHEN duplicate_object THEN NULL;\nEND $$;`)
      .join('\n\n') +
    '\n'
  : '';

const result = HEADER + text + tail;

/* The guard. A translation that silently did nothing is the failure mode worth
   catching: it produces a file that looks right, applies cleanly against
   Postgres, and stores coordinates at half the precision they were written
   with. These counts are facts about the current schema, so a change to it
   trips this rather than passing quietly. */
if (dropped !== 2) throw new Error(`expected 2 PRAGMA lines, dropped ${dropped}`);
if (reals !== 11) throw new Error(`expected 11 REAL columns, rewrote ${reals}`);
if (quoted !== 2) throw new Error(`expected 2 'interval' identifiers, quoted ${quoted}`);
if (lifted.length !== 2) throw new Error(`expected 2 forward foreign keys, lifted ${lifted.length}`);
if (/\bREAL\b/.test(result.replace(/--.*$/gm, ''))) {
  throw new Error('a REAL survived outside a comment');
}

writeFileSync(TARGET, result);
console.log(
  `schema.pg.sql written: ${dropped} pragmas dropped, ${reals} REAL → double precision, ${quoted} interval quoted`,
);

/* ─────────────────────────────────────────────── the conflict-target table ── */

/**
 * Every table's primary key, for `pg.ts`'s `INSERT OR REPLACE` translation.
 *
 * SQLite's upsert names no columns; Postgres's `ON CONFLICT` must. Deriving the
 * target from the schema rather than writing it by hand is the difference
 * between a primary-key change breaking the build and it silently changing
 * which row an upsert overwrites.
 */
function primaryKeys(sql) {
  /* Comments first: the schema explains several primary keys in prose, and
     `-- … PRIMARY KEY …` in a note would otherwise be read as a declaration. */
  const bare = sql
    .split(/\r?\n/)
    .map((line) => splitComment(line)[0])
    .join('\n');

  const keys = {};
  const table = /CREATE TABLE IF NOT EXISTS\s+([a-z_]+)\s*\(([\s\S]*?)\n\);/g;

  for (const [, name, body] of bare.matchAll(table)) {
    /* Table-level `PRIMARY KEY (a, b)` wins when present — a composite key is
       never also declared inline. */
    const composite = /\n\s*PRIMARY KEY\s*\(([^)]*)\)/.exec(body);
    if (composite) {
      keys[name] = composite[1].split(',').map((c) => c.trim());
      continue;
    }
    const inline = /\n\s*([a-z_]+)\s+[A-Za-z ]*?PRIMARY KEY/.exec(body);
    if (inline) {
      keys[name] = [inline[1]];
      continue;
    }
    /* A table with no primary key cannot be an upsert target. Recorded as such
       rather than omitted, so `pg.ts` can say which and why. */
    keys[name] = null;
  }

  return keys;
}

const keys = primaryKeys(source);
const tables = Object.keys(keys);
const keyed = tables.filter((t) => keys[t]);

if (tables.length !== 85) throw new Error(`expected 85 tables, parsed ${tables.length}`);

/* Every table an `INSERT OR REPLACE|IGNORE` actually targets must have a key,
   or the translation in `pg.ts` throws at runtime — which is correct behaviour
   but a poor time to find out. */
const targeted = [
  ...new Set(
    [...readFileSync(join(root, 'server/db/import.ts'), 'utf8').matchAll(
      /INSERT OR (?:REPLACE|IGNORE) INTO\s+([a-z_]+)/g,
    )].map((m) => m[1]),
  ),
];
const unkeyed = targeted.filter((t) => !keys[t]);
if (unkeyed.length) throw new Error(`upsert targets with no primary key: ${unkeyed.join(', ')}`);

/**
 * Upsert targets carrying a *second* unique constraint.
 *
 * This is the one place the translation is not semantics-preserving, so it is
 * named rather than left to be discovered. SQLite's `INSERT OR REPLACE` deletes
 * whatever row conflicts on **any** unique constraint; Postgres's
 * `ON CONFLICT (…)` handles the one target it is given. For these tables a row
 * that collides on the secondary key while carrying a *different* primary key
 * now raises a unique violation instead of silently replacing.
 *
 * That is the safer of the two failures — loud beats silent, and a silent
 * replace here would destroy a row nobody named — and every statement that
 * reaches them derives its id deterministically (`bdg_legacy_<venue>_<period>`
 * and friends in `db/import.ts`), so the primary key already moves in lockstep
 * with the secondary one. If that ever stops being true, this list is where to
 * look.
 */
function secondaryUniques(sql) {
  const bare = sql
    .split(/\r?\n/)
    .map((line) => splitComment(line)[0])
    .join('\n');
  const out = {};
  for (const [, name, body] of bare.matchAll(
    /CREATE TABLE IF NOT EXISTS\s+([a-z_]+)\s*\(([\s\S]*?)\n\);/g,
  )) {
    const found = [...body.matchAll(/\n\s*UNIQUE\s*\(([^)]*)\)/g)].map((m) =>
      m[1].split(',').map((c) => c.trim()),
    );
    if (found.length) out[name] = found;
  }
  return out;
}

const secondary = secondaryUniques(source);
const overlap = targeted.filter((t) => secondary[t]);

const body = keyed
  .map((t) => {
    const note = secondary[t]
      ? ` // also UNIQUE ${secondary[t].map((c) => `(${c.join(', ')})`).join(' ')}`
      : '';
    return `  ${t}: [${keys[t].map((c) => `'${c}'`).join(', ')}],${note}`;
  })
  .join('\n');

writeFileSync(
  CONFLICTS,
  `/**
 * GENERATED FILE — do not edit. See \`scripts/pg-schema.mjs\`.
 *
 * Each table's primary key, which is the \`ON CONFLICT\` target \`db/pg.ts\` needs
 * to express SQLite's \`INSERT OR REPLACE\` / \`INSERT OR IGNORE\` against
 * Postgres. Generated from \`schema.sql\` so a primary key cannot change without
 * this changing with it.
 *
 * ${tables.length - keyed.length} of ${tables.length} tables have no primary key and are absent: an upsert
 * naming one throws rather than guessing a unique index to overwrite on.
 *
 * **${overlap.length} upsert targets carry a second unique constraint** and are marked inline
 * below: ${overlap.join(', ')}.
 * SQLite replaces on *any* unique constraint; \`ON CONFLICT\` handles the one it
 * is given. A row colliding on the secondary key with a different primary key
 * now raises a unique violation rather than silently replacing — the safer
 * failure, and one no current statement can reach, because every id that
 * reaches these tables is derived from the same columns the secondary key is
 * built from (see \`db/import.ts\`).
 */
export const CONFLICT_TARGETS: Record<string, readonly string[] | undefined> = {
${body}
};
`,
);

console.log(`conflicts.ts written: ${keyed.length} of ${tables.length} tables keyed`);

/* ───────────────────────────────────────────────── the Postgres lockdown ── */

/**
 * `server/db/rls.pg.sql` — row-level security on every table, and no grant to
 * Supabase's two public roles.
 *
 * **Why this file exists at all, when nothing in `src/` speaks to Postgres.**
 * The front end talks to `server/`, which holds the only connection string, so
 * the access control that matters is `http/router.ts`'s `auth:` field. That is
 * true of *this* repository and says nothing about the project the database
 * lives in. A Supabase project serves PostgREST over the `public` schema on an
 * **anon key that is published by design** — it is in the project's API
 * settings and in every client Supabase's own quickstart writes — and the
 * default grants to `anon` and `authenticated` are what make that endpoint
 * answer. A table with no RLS behind it is therefore readable by anybody who
 * has the URL, whether or not a single line of our code ever asks it to be.
 *
 * So the lockdown is two independent halves, and either one alone would do:
 *
 *   1. **No grants.** `anon` and `authenticated` lose every privilege on the
 *      schema, its tables, sequences and functions, and the default privileges
 *      that would hand them one on the next table created.
 *   2. **RLS enabled, with no policies.** A table with RLS on and zero policies
 *      denies every row to every role that is not the owner and does not
 *      carry `BYPASSRLS`. Belt and braces on purpose: a `GRANT` restored by
 *      hand in the dashboard — which is one click — re-opens half one and
 *      reaches nothing.
 *
 * Generated rather than hand-kept for the same reason `schema.pg.sql` is: a
 * table added to `schema.sql` without a line here is a table that is open, and
 * that is precisely the kind of omission nobody notices. It is the whole table
 * list or nothing.
 *
 * **The server is unaffected, and the guard at the top is what proves it.**
 * `PgDb` connects as the role that created these tables, and an owner bypasses
 * RLS. A deployment whose connection string is some *other* role would be
 * locked out of its own database by half 2 — so the file refuses to run in that
 * case and says which role it was and what to do, rather than enabling RLS and
 * leaving the server answering 500 to everything.
 */
const RLS = join(root, 'server/db/rls.pg.sql');

const guarded = (role, statements) =>
  `DO $$\nBEGIN\n  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN\n` +
  statements.map((s) => `    ${s}\n`).join('') +
  `  END IF;\nEND $$;`;

/* Supabase's two request roles. `service_role` is deliberately *not* here: it
   is the key a trusted backend uses and it carries BYPASSRLS, so revoking from
   it would neither help (the key is a secret, not a published one) nor hold
   (the bypass is a role attribute, not a grant). What protects it is that it
   never leaves the server — see `.env.example` on the `VITE_` rule. */
const PUBLIC_ROLES = ['anon', 'authenticated'];

const rlsBody =
  PUBLIC_ROLES.map((role) =>
    guarded(role, [
      `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role};`,
      `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${role};`,
      `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM ${role};`,
      `REVOKE ALL ON SCHEMA public FROM ${role};`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ${role};`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${role};`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM ${role};`,
    ]),
  ).join('\n\n') +
  '\n\n' +
  `-- ══════════════════════════════════════════════════ row-level security ══
--
-- ${tables.length} tables, every one of them. RLS with no policy is a closed door: the
-- owner and any role with BYPASSRLS read normally, everybody else — which is
-- what a published anon key authenticates as — reads nothing.
--
-- The guard first. Enabling RLS as a role that neither owns these tables nor
-- bypasses it locks *this server* out of its own database, which is a worse
-- outcome than an open PostgREST endpoint and is not recoverable from inside
-- the process that just did it. So it refuses, loudly, naming the role.
DO $$
DECLARE
  bypasses boolean;
  owns     boolean;
BEGIN
  SELECT rolbypassrls INTO bypasses FROM pg_roles WHERE rolname = current_user;
  SELECT COALESCE(bool_and(tableowner = current_user), true) INTO owns
    FROM pg_tables WHERE schemaname = 'public';
  IF NOT COALESCE(bypasses, false) AND NOT owns THEN
    RAISE EXCEPTION 'paylez: refusing to enable row-level security as %, which neither owns the public tables nor has BYPASSRLS. Connect as the owning role (Supabase: postgres) or grant it, then restart.', current_user;
  END IF;
END $$;

` +
  tables.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join('\n') +
  '\n';

writeFileSync(
  RLS,
  `-- ─────────────────────────────────────────────────────────────────────────────
-- GENERATED FILE — do not edit.
--
-- Produced from \`server/db/schema.sql\` by \`npm run pg:schema\`, and applied by
-- \`migrate()\` in \`server/db/pg.ts\` on every boot. Idempotent: every statement
-- here is safe to run against a database it has already run against.
--
-- What it does and why is documented in \`scripts/pg-schema.mjs\`. The short
-- version: a Supabase project publishes its anon key and serves PostgREST over
-- the \`public\` schema, so a table with no RLS is readable by anybody holding a
-- URL this repo never uses. This closes that, twice.
-- ─────────────────────────────────────────────────────────────────────────────

${rlsBody}`,
);

console.log(`rls.pg.sql written: ${tables.length} tables secured, ${PUBLIC_ROLES.length} public roles revoked`);
