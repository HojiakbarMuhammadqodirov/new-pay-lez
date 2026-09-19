/**
 * Writes `public/sitemap.xml` and `public/robots.txt`. `npm run sitemap`.
 *
 * The tables and the two formatters live in `sitemap.ts` beside this file,
 * which does nothing when imported — `verify-geo.ts` reads them to check the
 * committed sitemap still matches the route table, and a module that wrote two
 * files on import would have `npm run verify` quietly regenerating the thing it
 * was asked to check. The obvious guard for that is an entry-point test on
 * `process.argv[1]`, and it does not work here: `vite-node` consumes the script
 * path, so every script under it sees the same two-element argv.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE_ORIGIN, type Route } from '../src/site/router';
import { LISTED, lastCommit, listedRoutes, robotsTxt, sitemapXml } from './sitemap';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const dates: Partial<Record<Route, string>> = {};
let dated = 0;
for (const route of listedRoutes()) {
  const when = lastCommit(ROOT, LISTED[route] as string);
  if (when !== null) {
    dates[route] = when;
    dated += 1;
  }
}

/* All or nothing. A sitemap where three pages carry a date and five do not is a
   crawler being told those three are the ones that move. */
const listed = listedRoutes();
const complete = dated === listed.length;

mkdirSync(resolve(ROOT, 'public'), { recursive: true });
writeFileSync(resolve(ROOT, 'public/sitemap.xml'), sitemapXml(complete ? dates : {}), 'utf8');
writeFileSync(resolve(ROOT, 'public/robots.txt'), robotsTxt(), 'utf8');

console.log(
  `public/sitemap.xml — ${listed.length} URLs on ${SITE_ORIGIN}` +
    (complete ? '' : ' (no lastmod: git could not date every page)'),
);
console.log('public/robots.txt — written');
