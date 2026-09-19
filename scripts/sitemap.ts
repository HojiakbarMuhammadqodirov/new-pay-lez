/**
 * What goes in `sitemap.xml` and `robots.txt`, and how the two are written.
 *
 * Read by `build-sitemap.ts`, which writes them, and by `verify-geo.ts`, which
 * checks the committed copies still match the route table. Nothing here touches
 * the disk on import, which is what lets `npm run verify` use it.
 *
 * Run `npm run sitemap` after adding or removing a route, and commit what it
 * writes — the same arrangement `npm run openapi` has with the API's route
 * table, and for the same reason: the output is a fact about the code rather
 * than a dependency of the build, so regenerating it on every `dev` and `build`
 * would rebuild a file nothing changed to read a table nothing moved. Verify
 * compares the two, so forgetting to run it is a failing check rather than a
 * silent hole in the index.
 *
 * The files land in `public/` rather than `dist/` because Vite copies that
 * directory verbatim and both are worth reading in the repository. They end up
 * at the site root, which is where nginx's `try_files $uri` finds them before
 * the SPA fallback gets a turn — no server change, and nothing to remember at
 * deploy time beyond shipping `dist/` as usual.
 *
 * **No `<priority>` and no `<changefreq>`.** Google has said for years that it
 * ignores both, and a number nobody reads is a number that goes stale and then
 * gets argued about. `<lastmod>` stays because it is the one Google does use,
 * and because it can be made true rather than guessed: it is the date of the
 * last commit touching the page's own module, read out of git. A sitemap that
 * stamps every page with today's date on every run tells a crawler that eight
 * pages changed when none did, which is worse than saying nothing — so if git
 * cannot date every page, every `<lastmod>` is dropped rather than filled in.
 */
import { execFileSync } from 'node:child_process';
import { SITE_ORIGIN, URL_PATHS, type Route } from '../src/site/router';

/**
 * Which routes a crawler is invited to fetch.
 *
 * Exhaustive in `Route`, so a sixteenth route does not compile until somebody
 * decides — the sitemap's half of the same decision `SEO_PAGE` in
 * `src/site/head.ts` makes for the document head. Two tables rather than one
 * because they answer different questions: this is what a crawler is *sent* to,
 * and that is what it is told when it arrives by some other road. A route could
 * honestly be in one and not the other; a route in neither is simply private.
 *
 * The value is the file whose history dates the page. The page's *words* live
 * in five dictionaries, and including those would stamp all eight entries with
 * one date every time any copy anywhere moved — a lastmod that changes for
 * every page at once tells a crawler nothing it can act on.
 */
export const LISTED: Record<Route, string | null> = {
  landing: 'src/site/sections.tsx',
  learn: 'src/site/learn.tsx',
  business: 'src/site/business.tsx',
  vouchers: 'src/site/vouchers.tsx',
  relocate: 'src/site/relocate.tsx',
  contact: 'src/site/contact.tsx',
  /* One module holds both documents, so both carry its date. */
  privacy: 'src/site/legal/en.tsx',
  terms: 'src/site/legal/en.tsx',
  /* The private seven. `resolveRoute` bounces a signed-out visitor off most of
     them, and `head.ts` puts `noindex` on all of them. */
  analytics: null,
  signin: null,
  profile: null,
  onboarding: null,
  'business-setup': null,
  dashboard: null,
  admin: null,
};

/** The last commit date for one file, as a bare `YYYY-MM-DD`, or `null` if git
    cannot say — an export of the tree, a shallow clone, no git on the box. */
export function lastCommit(root: string, file: string): string | null {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', file], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    /* An untracked file answers with an empty string rather than an error. */
    return /^\d{4}-\d{2}-\d{2}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

/** The listed routes, in the order `URL_PATHS` declares them. */
export function listedRoutes(): Route[] {
  return (Object.keys(URL_PATHS) as Route[]).filter((route) => LISTED[route] !== null);
}

/** The sitemap as text. */
export function sitemapXml(dates: Partial<Record<Route, string>> = {}): string {
  const entries = listedRoutes().map((route) => {
    const lastmod = dates[route];
    const when = lastmod === undefined ? '' : `\n    <lastmod>${lastmod}</lastmod>`;
    return `  <url>\n    <loc>${SITE_ORIGIN}${URL_PATHS[route]}</loc>${when}\n  </url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
}

/**
 * `robots.txt`, and the interesting half is what it does *not* say.
 *
 * The seven private routes are **not** disallowed, which looks backwards and is
 * the documented rule: a crawler forbidden to fetch a page never reads the
 * `noindex` on it, so the URL can still be listed — titleless, described by
 * whatever linked to it — and the one instruction that would have removed it is
 * the one the block prevented it from seeing. Crawlable plus `noindex` is what
 * actually keeps a page out. Blocking them here would also publish the admin
 * console's address in a file written for everybody.
 */
export function robotsTxt(): string {
  return [
    '# Paylez — generated by `npm run sitemap`. Do not edit by hand.',
    '#',
    '# The private routes (/admin, /dashboard, /profile, /welcome, /sign-in,',
    '# /analytics, /business/setup) are deliberately not disallowed here: they',
    '# carry <meta name="robots" content="noindex"> instead, and a crawler has',
    '# to be allowed to fetch a page in order to read that.',
    '',
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    '',
  ].join('\n');
}
