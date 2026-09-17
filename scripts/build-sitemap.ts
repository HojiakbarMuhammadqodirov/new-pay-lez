/**
 * `public/sitemap.xml` and `public/robots.txt`, generated from the route table.
 *
 * ## Read this before trusting the output
 *
 * **Paylez is hash-routed, and Google does not index fragments.** `PATHS` in
 * `src/site/router.ts` maps every page to a `#/…` hash, so from a crawler's
 * point of view this whole site is *one* document at `/`. A sitemap listing
 * `https://new.pay-lez.com/#/business` does not get that page indexed
 * separately: the fragment is stripped before the URL is fetched, and what
 * comes back is the same HTML shell every other entry returns.
 *
 * That is stated here rather than quietly worked around because the fix is not
 * a sitemap. Getting these pages into Search Console as pages needs one of:
 *
 *   1. **History routing** — `/business` instead of `#/business`, with the host
 *      rewriting unknown paths to `index.html`. `router.ts` already says the day
 *      a route needs a real segment is the day its matching has to change, and
 *      this is that day arriving from the other side.
 *   2. **Prerendering** — one static HTML file per route with its own `<title>`,
 *      description and canonical, which is what actually makes a result in a
 *      search listing look like the page.
 *
 * Neither is a sitemap's job and neither is in this file's scope. What the
 * sitemap *does* buy today is real: `/` is submitted with an honest `lastmod`,
 * Search Console has a file to verify rather than a 404, and the inventory of
 * public routes exists in one place that cannot drift from `router.ts` — so the
 * day either change above lands, the URLs are already written down.
 *
 * ## What it contains, and what it leaves out
 *
 * Only what a signed-out visitor may see. `resolveRoute` is the authority on
 * that and it is *imported* rather than restated: a route that sends an
 * anonymous visitor somewhere else is not a public page, whatever a list here
 * might claim. That keeps `#/dashboard`, `#/admin`, `#/profile`, `#/welcome`,
 * `#/business/setup` and `#/analytics` out of it without anybody maintaining a
 * second list — and `#/analytics` is the one that proves the point, because it
 * is *not* in `PRIVATE`; it resolves to `landing` for its own reason.
 *
 * `#/sign-in` is public and is deliberately still excluded: a login form is not
 * a page anybody should arrive at from a search result, and submitting one asks
 * Google to index a screen whose only content is a password field.
 *
 * ## `lastmod`
 *
 * From **git**, per route, not from the clock. `lastmod` is a claim about when
 * the page last changed, and a build-time timestamp makes that claim false on
 * every deploy — it tells Search Console that nine pages changed because one
 * did, and a crawler that learns a sitemap's `lastmod` is noise starts ignoring
 * it. The route's own source file plus the dictionaries it reads is the closest
 * honest answer available here; where git cannot answer (a shallow clone, an
 * export), the field is omitted rather than guessed, because no `lastmod` is a
 * smaller lie than a wrong one.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATHS, resolveRoute, type Route } from '../src/site/router';

/**
 * Every route, from `PATHS` rather than from a list of its own.
 *
 * `PATHS` is `Record<Route, string>`, so its keys *are* the union and a route
 * added to `router.ts` without a line in `SOURCE` below fails this script
 * rather than arriving here undated. The hash→route table in `router.ts` is not
 * exported and is not the right source anyway: it is keyed the other way round.
 */
const ROUTES = Object.keys(PATHS) as Route[];

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/**
 * The canonical origin.
 *
 * Overridable because a staging host that submits production URLs is asking
 * Google to index a site it cannot see, and the default is the one the product
 * actually lives at. No trailing slash: every URL below adds its own.
 */
const ORIGIN = (process.env.PAYLEZ_SITE_URL ?? 'https://new.pay-lez.com').replace(/\/+$/, '');

/**
 * The source file behind each route, for `lastmod`.
 *
 * Checked against `ROUTES` below, so a new route fails this script rather than
 * silently arriving with no date — which is the failure worth catching, because
 * a missing `lastmod` looks like a deliberate omission and reads as one.
 */
const SOURCE: Record<Route, string> = {
  landing: 'src/site/sections.tsx',
  learn: 'src/site/learn.tsx',
  analytics: 'src/site/analytics.tsx',
  business: 'src/site/business.tsx',
  vouchers: 'src/site/vouchers.tsx',
  relocate: 'src/site/relocate.tsx',
  contact: 'src/site/contact.tsx',
  privacy: 'src/site/legal/en.tsx',
  terms: 'src/site/legal/en.tsx',
  signin: 'src/site/signin.tsx',
  profile: 'src/site/profile.tsx',
  onboarding: 'src/site/onboarding.tsx',
  'business-setup': 'src/site/businessSetup.tsx',
  dashboard: 'src/site/dashboard.tsx',
  admin: 'src/site/admin.tsx',
};

/**
 * The landing page's own sections, in document order.
 *
 * These are `id`s in `sections.tsx` and they are the "tabs" the header's
 * section links point at. They are listed because they are the only inventory
 * of them that exists — and they are listed **last and lowest** because every
 * one of them is the same document as `/`. See the fragment note at the top: a
 * crawler is not going to treat these as nine pages, and the value of writing
 * them down is that the day this site serves real paths, the list is here.
 */
const LANDING_SECTIONS = [
  'hero',
  'proof',
  'guide',
  'features',
  'value',
  'subscription',
  'voices',
  'cta',
] as const;

/** Public routes never worth a search result, whatever `resolveRoute` allows. */
const EXCLUDED: readonly Route[] = ['signin'];

/**
 * When a file last changed, as an ISO date, or null.
 *
 * `%cI` is the committer date in strict ISO — `%aI`, the author date, survives
 * a rebase and can therefore predate the commit that actually shipped the
 * change. Trimmed to the day: `lastmod` is read at day resolution and a
 * timestamp implies a precision about content changes that a commit does not
 * have.
 */
function lastModified(file: string): string | null {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', file], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out ? out.slice(0, 10) : null;
  } catch {
    /* No git, a shallow clone, or a file that has never been committed. */
    return null;
  }
}

const entry = (loc: string, priority: string, lastmod: string | null): string =>
  [
    '  <url>',
    `    <loc>${loc}</loc>`,
    ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].join('\n');

/*
 * The public routes, in `ROUTES` order so the file is stable between runs —
 * a sitemap that reorders itself makes every deploy look like a content change
 * to anything diffing it.
 */
const isPublic = (route: Route): boolean =>
  resolveRoute(route, null) === route && !EXCLUDED.includes(route);

const routes = ROUTES.filter(isPublic);

const urls: string[] = [
  /* The document itself, without a fragment. This is the only URL on the list
     that a crawler can actually fetch as its own page, which is why it is the
     only one at priority 1.0. `landing`'s own hash is `#top`, an anchor rather
     than a route, so it is not repeated below. */
  entry(`${ORIGIN}/`, '1.0', lastModified(SOURCE.landing)),
  ...routes
    .filter((route) => route !== 'landing')
    .map((route) => entry(`${ORIGIN}/${PATHS[route]}`, '0.8', lastModified(SOURCE[route]))),
  ...LANDING_SECTIONS.map((id) =>
    entry(`${ORIGIN}/#${id}`, '0.4', lastModified(SOURCE.landing)),
  ),
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  GENERATED FILE — do not edit. Run \`npm run sitemap\` (and \`npm run build\`
  does) after adding a public route; \`scripts/build-sitemap.ts\` is the source
  and carries the reasoning, including why a hash-routed site cannot have its
  pages indexed separately by a sitemap alone.
-->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;

/*
 * `robots.txt`.
 *
 * **There is no per-route `Disallow` and there cannot be.** `robots.txt` matches
 * paths, and every private screen on this site is a *fragment* of `/` — so a
 * line disallowing `#/admin` matches nothing, and one disallowing `/` would
 * de-list the entire product. The console and the dashboard are kept out of
 * search the way they are kept out of a stranger's browser: `resolveRoute`
 * refuses them without a session, and there is no HTML for a crawler to read.
 *
 * What is here is the `Sitemap:` line, which is the half that does work, and an
 * explicit `Allow: /` so the file cannot be read as a restriction.
 */
const robots = `# GENERATED FILE — do not edit. See \`scripts/build-sitemap.ts\`.
#
# No per-route Disallow: this site is hash-routed, robots.txt matches paths, and
# every private screen is a fragment of "/". A rule naming one would match
# nothing; a rule naming "/" would de-list the product. Access control is
# \`resolveRoute\` and the API's own \`auth:\` field, not this file.

User-agent: *
Allow: /

Sitemap: ${ORIGIN}/sitemap.xml
`;

mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(join(root, 'public', 'sitemap.xml'), sitemap);
writeFileSync(join(root, 'public', 'robots.txt'), robots);

/* The guard. A generator that silently emitted one URL would produce a file
   that validates, uploads and says nothing. */
const missing = ROUTES.filter((route) => !SOURCE[route]);
if (missing.length) throw new Error(`no source file for route(s): ${missing.join(', ')}`);
if (routes.length < 5) throw new Error(`only ${routes.length} public routes found — check resolveRoute`);

console.log(
  `sitemap.xml written: ${routes.length} public routes, ` +
    `${LANDING_SECTIONS.length} landing sections, origin ${ORIGIN}`,
);
