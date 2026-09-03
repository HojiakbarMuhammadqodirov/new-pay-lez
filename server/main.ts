/**
 * The entry point: open the database, migrate, seed, import if empty, serve.
 *
 * The import runs only when the database has no venues, so `npm run server` on a
 * fresh clone comes up with the old data in it and a restart does not do it
 * again. `--reimport` forces it; `--import-only` does it and exits.
 *
 * **Nothing else writes a venue, a deal or a voucher at boot.** There was a
 * demonstration set — seven invented Kraków and Warsaw cafés with deals,
 * campaigns, budgets and voucher tiers — written whenever the catalogue came up
 * empty, and later only when `PAYLEZ_DEMO_SEED=1` asked for it. It is gone. An
 * empty catalogue means no venue has signed up yet, which is a true and useful
 * thing for a screen to say, and every screen that reads one now says it.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CONFIG } from './config.ts';
import { openDb, type Db } from './db/db.ts';
import { openDb as openPgDb } from './db/pg.ts';
import { importLegacy } from './db/import.ts';
import { provisionAdmin } from './domain/accounts.ts';
import { seedPlatform } from './domain/settings.ts';
import { createApi } from './http/server.ts';
import { allRoutes } from './http/routes/index.ts';
import { startScheduler } from './jobs.ts';
import type { Route } from './http/router.ts';

export interface BootOptions {
  file?: string;
  legacyDir?: string;
  /** Where the three hand-delivered question banks live. See `db/import.ts` §8. */
  gamesDir?: string;
  /** A Postgres connection string. Overrides `PAYLEZ_PG_URL`; used by tests. */
  postgresUrl?: string;
  /** Import even when the database already has venues. */
  reimport?: boolean;
  quiet?: boolean;
}

export async function boot(options: BootOptions = {}): Promise<{ db: Db; routes: Route[] }> {
  const file = options.file ?? CONFIG.server.database;

  /*
   * **Which database, decided here and nowhere else.**
   *
   * `PAYLEZ_PG_URL` set means Postgres; unset means the SQLite file. Both
   * drivers implement the `Db` interface, so nothing past this line — not one
   * of the 29 files that import it — knows or can ask which one it got.
   *
   * A presence check rather than a `PAYLEZ_DB_DRIVER=postgres` flag, because a
   * flag and a connection string can disagree, and the failure when they do is
   * a server that starts happily against the wrong database. There is no
   * arrangement of one variable that is wrong.
   *
   * It is also the rollback: comment the line out of `/etc/paylez/paylez.env`,
   * restart, and the SQLite file is serving again, untouched and still there.
   */
  const postgres = options.postgresUrl ?? process.env.PAYLEZ_PG_URL;

  if (!postgres && file !== ':memory:') {
    const dir = dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  const db = postgres ? await openPgDb(postgres) : await openDb(file);
  if (!options.quiet) {
    console.log(postgres ? 'database: postgres' : `database: sqlite ${file}`);
  }
  await seedPlatform(db);

  const venues = (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM venues`))?.n ?? 0;
  if (options.reimport || venues === 0) {
    const summary = await db.tx(async () =>
      await importLegacy(db, options.legacyDir ?? 'new-data', options.gamesDir ?? 'updates'),
    );
    if (!options.quiet) {
      const total = Object.entries(summary.counts)
        .map(([key, value]) => `${key} ${value}`)
        .join(', ');
      console.log(`imported: ${total || 'nothing (new-data/ not found)'}`);
      for (const note of summary.notes) console.log(`  note: ${note}`);
    }
  }

  /*
   * **Nothing is invented here, and the absence is the feature.**
   *
   * Two things used to run at this point. First a demonstration set of seven
   * venues, written whenever the catalogue came up empty after the import —
   * which is every remote, because `new-data/` is the old app's live personal
   * data and is gitignored. Then, once that was plainly wrong on a box with
   * real people on it, the same thing behind `PAYLEZ_DEMO_SEED=1`.
   *
   * Both are deleted, along with `db/demo.ts` and the gift-card shelf
   * `seedPlatform` wrote beside them. The argument that finished them off is
   * the one `analytics.reach` is built on: a venue nobody has heard of and a
   * venue nobody has signed up are different findings, and a catalogue that
   * fills itself in cannot tell an operator which one they have. A demo row is
   * also immortal — delete it and the next restart writes it back.
   *
   * If a deployment needs something to look at, onboard a venue through the
   * partner API the way a real one arrives. That path is tested and it leaves
   * an audit trail; this one left rows nobody could tell from customer data.
   */

  return { db, routes: allRoutes };
}

/** The index endpoint, added last so it can list everything that came before. */
function indexRoute(routes: Route[]): Route {
  return {
    method: 'GET',
    pattern: '/v1',
    auth: 'none',
    handler: () => ({
      name: 'paylez-api',
      version: 1,
      /* An API that can list itself is one whose surface can be diffed against
         the spec without reading the source. */
      endpoints: routes.map((route) => `${route.method} ${route.pattern}`).sort(),
      billing: process.env.PAYLEZ_BILLING === 'live' ? 'live' : 'local',
      push: process.env.PAYLEZ_PUSH === 'live' ? 'live' : 'local',
    }),
  };
}

export async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const { db, routes } = await boot({ reimport: args.has('--reimport') });

  if (args.has('--import-only')) {
    await db.close();
    return;
  }

  if (CONFIG.server.secret === 'dev-only-insecure-secret') {
    /* Loud, and it should be: this key signs the QR payloads every venue's till
       accepts. With the default in place anybody can mint a scan for any venue,
       which is exactly the forgery §3.2 exists to reject. */
    console.warn(
      '\n  ⚠  PAYLEZ_SECRET is unset — QR codes and sessions are signed with a key that is in the repo.',
    );
    console.warn('     Set it before this points at anybody’s data.\n');
  }

  /* Part C's console is unreachable without this — see `provisionAdmin`. It is
     reported either way, because "the operations console has no way in" is not
     a thing to discover from a 403 three weeks later. */
  const admin = await provisionAdmin(
    db,
    process.env.PAYLEZ_ADMIN_EMAIL,
    process.env.PAYLEZ_ADMIN_PASSWORD,
  );
  if (admin === 'skipped') {
    console.warn(
      '  ⚠  PAYLEZ_ADMIN_EMAIL / PAYLEZ_ADMIN_PASSWORD are unset — the admin console has no account and /v1/admin/* is unreachable.',
    );
  } else {
    console.log(`admin account ${admin}: ${process.env.PAYLEZ_ADMIN_EMAIL}`);
  }

  const all = [...routes, indexRoute(routes)];
  const api = createApi({ db, routes: all });
  const server = await api.listen();
  const stopScheduler = startScheduler(db);

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : CONFIG.server.port;
  console.log(`paylez api on http://${CONFIG.server.host}:${port}/v1  (${all.length} endpoints)`);

  const shutdown = () => {
    stopScheduler();
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/* Only when run directly, so importing this from a test does not start a server.
   Compared as file URLs rather than as paths: on Windows the two differ by
   separator and drive-letter case, and a substring check gets it wrong. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void await main();
}
