import { useEffect, useState } from 'react';
import type { Account } from './auth/context';
import { DEMO_MODE } from './demoMode';

/**
 * The whole router.
 *
 * Hash-based, and deliberately about forty lines rather than a dependency: the
 * site is a handful of pages on static hosting, where a history router would
 * need a server rewrite to survive a refresh and a hash router needs nothing at
 * all. Ten routes have not changed that; the day one of them needs a real URL
 * for sharing or SEO is the day this is worth replacing, and not before.
 *
 * **That day came, and the answer was smaller than replacing it.** A sitemap
 * for Search Console is worth nothing while every page shares one URL — Google
 * strips everything from `#` onwards before it fetches anything, so eight
 * entries are one page in the index. What that needed was a real *address*, not
 * a real *router*: `URL_PATHS` below gives each route a path, `readRoute` reads
 * one on the way in, and `normalizeAddress` writes one into the bar on the way
 * out. The hash stays the link form and every `<a href="#/x">` on the site is
 * untouched, so none of the reasons above stopped being true — nginx's SPA
 * fallback was already answering unknown paths with `index.html` for refreshes,
 * which is the whole of the "server rewrite" this was avoiding.
 *
 * Routes are the hashes that start with `#/`. Everything else — `#value`,
 * `#guide`, `#top` — is a section anchor on the landing page, which means the
 * header's existing links keep working from any page: following `#value`
 * from L-Earn lands on the landing page *and* scrolls to the section, with no
 * special handling at the link.
 */

export type Route =
  | 'landing'
  | 'learn'
  | 'analytics'
  | 'business'
  | 'vouchers'
  | 'relocate'
  | 'contact'
  | 'privacy'
  | 'terms'
  | 'signin'
  | 'profile'
  | 'onboarding'
  | 'business-setup'
  | 'dashboard'
  | 'admin';

const ROUTES: Record<string, Route> = {
  '#/l-earn': 'learn',
  '#/analytics': 'analytics',
  '#/business': 'business',
  '#/vouchers': 'vouchers',
  '#/relocate': 'relocate',
  '#/contact': 'contact',
  '#/privacy': 'privacy',
  '#/terms': 'terms',
  '#/sign-in': 'signin',
  '#/profile': 'profile',
  '#/welcome': 'onboarding',
  '#/business/setup': 'business-setup',
  '#/dashboard': 'dashboard',
  '#/admin': 'admin',
};

export const PATHS: Record<Route, string> = {
  landing: '#top',
  learn: '#/l-earn',
  analytics: '#/analytics',
  business: '#/business',
  vouchers: '#/vouchers',
  relocate: '#/relocate',
  contact: '#/contact',
  privacy: '#/privacy',
  terms: '#/terms',
  signin: '#/sign-in',
  profile: '#/profile',
  onboarding: '#/welcome',
  'business-setup': '#/business/setup',
  dashboard: '#/dashboard',
  admin: '#/admin',
};

/*
 * `#/business/setup` has a slash in it and still matches, because matching is
 * whole-string equality rather than a path parse. That is not a nested route —
 * it is a flat name that happens to read like one, and the day something here
 * needs a real segment or a parameter is the day the note above applies.
 */

/**
 * The host every canonical URL is written against.
 *
 * `www.pay-lez.com` rather than the apex, which still resolves to the retired
 * Base44 deployment and answers **402**, and rather than `new.pay-lez.com`,
 * which serves the identical build from the same nginx root — two hosts with
 * one site on them is duplicate content, and the `<link rel="canonical">` this
 * feeds tells a crawler which of the two to keep. A constant rather than a
 * `VITE_` variable on purpose: an origin absent from the file Vite actually
 * reads is an empty string baked into the bundle, and a canonical tag pointing
 * at `/business` with no host is a worse failure than a wrong host, because it
 * is silent. It changes when the domain does, which is roughly never.
 */
export const SITE_ORIGIN = 'https://www.pay-lez.com';

/**
 * The same fifteen routes as real URLs, which is what a crawler can index.
 *
 * The note at the top of this file said the day a route needed a real URL for
 * sharing or SEO was the day the hash router was worth replacing. This is a
 * third answer, and it is smaller than replacing it: the hash stays the *link*
 * form — every `<a href="#/x">` on the site is untouched — and the path is the
 * *address* form, written into the bar by `normalizeAddress` after every
 * navigation and read back by `readRoute` on entry. A hash is invisible to
 * Google, which strips everything from `#` onwards before it fetches anything;
 * eight pages sharing one URL are one page in the index however many entries a
 * sitemap lists.
 *
 * It costs nothing on the server because nginx already answers any unknown
 * path with `index.html` — the SPA fallback that was there for refreshes.
 *
 * All fifteen, not just the eight public ones: the bar is normalised on every
 * route, so `/dashboard` has to survive a refresh like the rest. Which of them
 * a crawler is *told* about is a separate decision and lives in
 * `scripts/build-sitemap.ts`, where the answer is an exhaustive map that a new
 * route fails to compile against until somebody classifies it.
 */
export const URL_PATHS: Record<Route, string> = {
  landing: '/',
  learn: '/l-earn',
  analytics: '/analytics',
  business: '/business',
  vouchers: '/vouchers',
  relocate: '/relocate',
  contact: '/contact',
  privacy: '/privacy',
  terms: '/terms',
  signin: '/sign-in',
  profile: '/profile',
  onboarding: '/welcome',
  'business-setup': '/business/setup',
  dashboard: '/dashboard',
  admin: '/admin',
};

/** `URL_PATHS` read the other way. Two routes sharing a path would lose one of
    them silently here, so `npm run verify` checks the table is injective. */
const PATH_ROUTES: Record<string, Route> = Object.fromEntries(
  (Object.entries(URL_PATHS) as Array<[Route, string]>).map(([route, path]) => [path, route]),
);

/**
 * Every hash `PATHS` can produce — including `#top`, which is a section anchor
 * by spelling and the landing *route* by use.
 *
 * That distinction is the whole of it: `normalizeAddress` strips a route hash
 * out of the bar and keeps a section anchor, and without this entry "Home"
 * pressed from L-Earn would leave `/l-earn#top` in the bar and `readRoute`
 * would go on reading the path and answering `learn`.
 */
const ROUTE_HASHES: Record<string, Route> = { ...ROUTES, '#top': 'landing' };

/** The route a real path names, or `null` for anything not in the table. A
    trailing slash is tolerated because a person typing a URL adds one. */
export function pathRoute(pathname: string): Route | null {
  const trimmed =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  return PATH_ROUTES[trimmed] ?? null;
}

/** The page a bare section anchor belongs to, or `null` if no prefix claims it.
    `routeOf` answers the same question with `landing` as its fallback; this one
    has to be able to say "no", so the pathname gets a turn before that. */
function anchorRoute(hash: string): Route | null {
  if (!hash.startsWith('#') || hash.startsWith('#/')) return null;
  const id = hash.slice(1);
  for (const [prefix, route] of ANCHOR_ROUTES) {
    if (id.startsWith(prefix)) return route;
  }
  return null;
}

/** The absolute URL a crawler should be told to keep for a route. */
export function canonicalUrl(route: Route): string {
  return `${SITE_ORIGIN}${URL_PATHS[route]}`;
}

/**
 * Which page a bare section anchor belongs to.
 *
 * This used to be answered "the landing page, always", and every in-page link on
 * every other page was broken by it: `#analytics-reports` is not in `ROUTES`, so
 * following "Open the dashboard" from Analytics read as a miss and dropped the
 * visitor on Home. Same for `#business-cta`, `#learn-games`, `#vouchers-catalogue`
 * and `#relocate-guide` — six pages' worth of anchors that all went Home.
 *
 * Every page already prefixes its section ids with its own name, so the prefix
 * *is* the answer; the landing page owns the unprefixed ones (`#value`, `#top`)
 * and stays the fallback, which is what keeps the header's section links working
 * from anywhere. Add a page, add a prefix here — `npm run verify` walks this
 * table against `PATHS`.
 */
export const ANCHOR_ROUTES: Array<[prefix: string, route: Route]> = [
  ['learn-', 'learn'],
  /* The signed-in L-Earn screen is the same route under a different component,
     so its one anchor files under `learn` too. */
  ['games-', 'learn'],
  ['analytics-', 'analytics'],
  ['business-', 'business'],
  ['vouchers-', 'vouchers'],
  ['relocate-', 'relocate'],
  ['contact-', 'contact'],
  /* The two legal documents. Each is one long page whose headings are its own
     numbered sections, so the prefixes buy real in-document links — and without
     them, a table-of-contents jump from inside the Privacy Policy would resolve
     to `landing` and throw the reader onto the marketing page mid-clause, which
     is the exact failure the note above describes. */
  ['privacy-', 'privacy'],
  ['terms-', 'terms'],
  /*
   * The three signed-in / one-card screens. Nothing links to them *yet*, which
   * is exactly why they were missing and why `verify` could not tell: the check
   * walks the entries that are in this table, and an id with no entry is
   * invisible to it. So the first in-page link added to the wallet would have
   * gone Home — the precise bug this table was written to end — and the person
   * adding it would have had no failing test to read.
   *
   * `wallet-` files under `vouchers` because the wallet *is* `#/vouchers` seen
   * by a signed-in player; the route is the same one either way.
   *
   * The listing form's prefix is `setup-` rather than `business-`, and that is
   * forced rather than chosen: the page that sells to a venue is `#/business`
   * now, so `business-` belongs to it. Two routes cannot share a prefix here —
   * matching is first-hit on the string, so the loser's anchors would all
   * resolve to the winner's page.
   */
  ['wallet-', 'vouchers'],
  ['signin-', 'signin'],
  ['setup-', 'business-setup'],
  /*
   * The two personal routes, registered before either has a second section to
   * link to — which is the point. An id with no entry in this table is
   * invisible to `verify`, so the first in-page link somebody adds to the
   * profile form would silently go Home and there would be no failing test to
   * read. The prefixes follow the *hash* rather than the class namespace:
   * `#/profile` and `#/welcome`, not `prof-` and `onb-`.
   */
  ['profile-', 'profile'],
  ['welcome-', 'onboarding'],
];

/** The route a hash names, section anchors included. Exported for `verify`. */
export function routeOf(hash: string): Route {
  if (hash.startsWith('#/')) return ROUTES[hash] ?? 'landing';
  const id = hash.slice(1);
  for (const [prefix, route] of ANCHOR_ROUTES) {
    if (id.startsWith(prefix)) return route;
  }
  return 'landing';
}

/**
 * The route the address bar names, in the order the three forms outrank one
 * another — and the order is the whole of it:
 *
 * 1. **A route hash wins.** It is what every link on the site sets, and it is
 *    always the most recent thing to have happened.
 * 2. **Then a section anchor**, because `ANCHOR_ROUTES` is how `#learn-games`
 *    followed from the landing page reaches L-Earn. Reading the path first
 *    would answer `landing` for it and break every cross-page section link on
 *    the site — the exact bug that table was written to end.
 * 3. **Then the real path**, which is how a crawler, a shared link or a refresh
 *    arrives, since none of those carries a hash at all.
 */
function readRoute(): Route {
  const { hash, pathname } = window.location;
  /*
   * A route hash wins **outright, an unrecognised one included** — the path
   * never gets a turn once one is present, which is `routeOf`'s old behaviour
   * kept rather than a new rule. `ErrorBoundary`'s way out of a crashed screen
   * is a literal `href="#/"`, deliberately a plain anchor because the router is
   * in the tree that just threw; `#/` is in no table, and letting it fall
   * through to the path would answer `dashboard` on the dashboard and leave the
   * one button out of a broken page pointing at the broken page.
   */
  if (hash.startsWith('#/')) return ROUTES[hash] ?? 'landing';
  return ROUTE_HASHES[hash] ?? anchorRoute(hash) ?? pathRoute(pathname) ?? 'landing';
}

/** The same answer for the handful of callers outside the hook — `AuthProvider`
    reads it once at boot to decide whether the first page has to wait for the
    server. It used to call `routeOf(location.hash)` directly, which now reads
    `landing` for every visitor who arrived on a real path. */
export function currentRoute(): Route {
  return readRoute();
}

/**
 * Put the route's real URL in the address bar.
 *
 * `replaceState` rather than a navigation, for the opposite of the reason
 * `navigate` gives below: this must *not* fire `hashchange`, because the
 * handler that calls it is the `hashchange` handler and a navigation here would
 * be a loop.
 *
 * A route hash is removed and a section anchor is kept, which is the
 * distinction `ROUTE_HASHES` exists to draw: `#/l-earn` is the link form of a
 * page that now has a URL of its own, while `#features` is a place on that page
 * and still belongs in a URL somebody copies.
 *
 * `search` survives both — `?demo=1` is read out of it on every render of the
 * dashboard, and dropping it here would turn the demo flag off one navigation
 * after it was switched on.
 *
 * **One cosmetic cost, written down rather than hidden.** Pressing the nav link
 * for the page you are already on used to be a no-op — the URL was identical,
 * so the browser did nothing at all. Now the bar says `/vouchers` and the link
 * says `#/vouchers`, so the browser pushes an entry and this replaces it with
 * the path it already had: two identical entries, and one press of Back that
 * appears to do nothing. Undoing it means making every `<a>` on the site set a
 * path and cancel its own default, which is the history router the note at the
 * top of this file declined — a click that lands on the page it is already on
 * is not worth it.
 */
export function normalizeAddress(route: Route): void {
  const { pathname, search, hash } = window.location;
  /* The same test `readRoute` applies, and it has to be: anything shaped like a
     route hash is one, recognised or not. Stripping only the entries in the
     table left `ErrorBoundary`'s `#/` sitting in the bar as `/#/` — the right
     page under a URL that looks like a typo. */
  const keep = hash.startsWith('#/') || ROUTE_HASHES[hash] !== undefined ? '' : hash;
  const next = `${URL_PATHS[route]}${search}${keep}`;
  if (`${pathname}${search}${hash}` === next) return;
  window.history.replaceState(null, '', next);
}

/**
 * Go somewhere without a link.
 *
 * Every navigation on the site until now was an `<a href="#/x">`, which is still
 * the right thing for anything a visitor clicks. This is for the handful that
 * are consequences rather than clicks: landing after a successful sign-in,
 * being sent to setup because the listing is not finished, being bounced off a
 * page this account cannot see.
 *
 * Both halves still move the *hash*, and they still work now that the bar holds
 * a real path, because a hash set on whatever path is current is a same-document
 * change: it fires `hashchange`, `useRoute` reads the route out of it — a route
 * hash outranks the path, which is the first clause of `readRoute` — and
 * `normalizeAddress` then takes the hash back out and writes the new path over
 * the old one. Setting the path here directly would be a page load.
 */
export function navigate(route: Route, replace = false): void {
  if (!replace) {
    window.location.hash = PATHS[route];
    return;
  }

  /*
   * A *correction* is not a destination, and must not become one.
   *
   * `resolveRoute` is pure in `(hash, account)`, so a pushed correction is a
   * trap: the visitor signs in at `#/sign-in`, the guard pushes `#top`, and
   * pressing Back returns to `#/sign-in` — where the same function gives the
   * same answer and pushes `#top` again. Back stops working for the rest of the
   * tab's life, and it is the primary control on a hash-routed site. The same
   * loop catches every other bounce: a signed-out visitor following a link to
   * `#/dashboard`, an individual on `#/business`, a new owner sent to setup.
   *
   * `location.replace` rather than `history.replaceState`, because only the
   * former fires `hashchange` — and `useRoute` listens to nothing else, so the
   * state variant would leave the address bar and the page disagreeing.
   */
  const { pathname, search } = window.location;
  window.location.replace(`${pathname}${search}${PATHS[route]}`);
}

/**
 * The access rule, as one pure function.
 *
 * Guarding in an effect would render the forbidden page first and then replace
 * it — a frame of someone else's dashboard is exactly the frame not to show.
 * Resolving the route *before* the render means the wrong page never mounts,
 * and being pure means `npm run verify` can walk the whole account × route
 * matrix without a browser.
 *
 * Returning a different route than it was given is a redirect; the caller is
 * expected to correct the address bar to match, or the URL and the page
 * disagree on a refresh.
 */
/** The three routes that only exist for somebody in particular. */
const PRIVATE: Route[] = ['business-setup', 'dashboard', 'admin', 'profile', 'onboarding'];

export function resolveRoute(route: Route, account: Account | null): Route {
  if (account === null) {
    /*
     * Analytics is a venue owner's tool, not a public page.
     *
     * It used to be in the signed-out nav on the argument that the reporting
     * was part of the pitch — but the screen is a month of somebody's takings,
     * and a visitor reading it is reading numbers that either belong to a real
     * venue or are invented. Neither is a good answer, so the page now exists
     * only for the person whose venue it describes. Sent to `landing` rather
     * than `signin`, because signing in does not get a *player* there either;
     * it is not locked, it is not theirs.
     */
    if (route === 'analytics') return 'landing';

    /*
     * Onboarding, for somebody who is not signed in, is the landing page.
     *
     * It sat with `profile` in `PRIVATE` and resolved to `signin`, which reads
     * correctly — the welcome flow belongs to an account — and made the flow's
     * own Back button do the opposite of what it says. That button signs out
     * and asks for `#top`; the guard then runs once against the *new* account
     * and the *old* route, resolves `onboarding` for a null account, and
     * `location.replace`s `#/sign-in` over the top of it. Pressing "Back" on
     * the welcome screen landed on the sign-in form.
     *
     * The note further down this file says the remedy is to derive the
     * destination here rather than to set the hash in a handler that also
     * changes the session, and this is that: signing out of onboarding now
     * resolves to `landing`, so the guard agrees with the button instead of
     * overruling it, and the handler needs no navigation at all.
     *
     * `analytics` is the precedent one line up — a private route whose
     * signed-out answer is the marketing page rather than a login, because a
     * login would not get an anonymous visitor there either. Nobody can sign
     * *in* to somebody else's welcome flow; there is nothing to offer them but
     * the front page.
     */
    if (route === 'onboarding') return 'landing';

    return PRIVATE.includes(route) ? 'signin' : route;
  }

  /*
   * Signed in but the individual-or-business question is unanswered. The
   * sign-in route owns that step, so every route resolves to it — including
   * `signin` itself, and that clause has to come **before** the
   * already-signed-in redirect below or the two chase each other: `signin`
   * would send an undecided account to `landing`, which sends it back to
   * `signin`, and the effect in `Site` navigates between them forever.
   * `npm run verify` checks that every resolution is a fixed point precisely
   * because this is easy to reintroduce.
   */
  if (account.type === null) return 'signin';

  /*
   * The operator.
   *
   * Handled before everything below because the console *replaces* the two
   * partner routes for them rather than sitting alongside: an admin has no venue
   * to set up and no dashboard of their own, so both point at the one screen
   * that is theirs, and so does signing in. The rest of the site is left exactly
   * as written — an admin reading the marketing pages should see what everyone
   * else sees.
   */
  if (account.type === 'admin') {
    /* The one private route an operator keeps. The console replaces the
       partner screens because an admin has no venue; it does not replace
       their own name and city. Onboarding is not theirs — it is the new
       player's first minute, and an operator provisioned by the server never
       had one. */
    if (route === 'profile') return 'profile';
    if (route === 'onboarding') return 'admin';
    return PRIVATE.includes(route) || route === 'signin' ? 'admin' : route;
  }

  /*
   * A new player finishes onboarding before anything else.
   *
   * Held here the same way an undecided account is held at sign-in, and for
   * the same reason: it is one step, it is short, and every other screen
   * reads better once the language is chosen and there are points on the
   * balance. The welcome gift is paid at the *end* of it rather than at
   * sign-up, which is a rule about farming rather than about generosity — an
   * address and a password can be produced in bulk, and a bonus attached to
   * producing them funds a farm. Skippable onboarding would be a gift nobody
   * ever collects.
   *
   * Business owners and operators are exempt: onboarding is the player app's
   * first minute and neither of them has one. The operator is already handled
   * above; an owner falls past this clause because of the `type` test.
   *
   * **"Before anything else" is load-bearing, and it has already been wrong
   * once.** This clause sat below the two redirects underneath it, and the
   * `admin` one is not conditional on the account — so a new player who typed
   * `#/admin` got `landing`, which resolves to `onboarding`, which is a
   * resolution that is not a fixed point and an effect in `Site` that
   * navigates twice. `npm run verify` walks the whole account × route matrix
   * against exactly that and caught it.
   */
  if (account.type === 'individual' && account.onboardedAt === null) return 'onboarding';

  /* Nobody else has a console. Checked before the sign-in clause below so the
     answer does not depend on which of the two the address bar happens to say. */
  if (route === 'admin') return 'landing';

  /*
   * Signing in when you already are. Where that lands is the *whole* of the
   * post-sign-in routing, on purpose: an owner goes to their own screen — setup
   * if the venue has not been described yet, the dashboard if it has — and
   * everyone else goes home.
   *
   * The dashboard, and not the landing page, for an owner whose listing
   * exists: that is the operator's console one kind of account over, and a
   * venue owner signing in has come to run the venue, not to be sold it. It is
   * also the case sign-in used to get wrong on a second device, where the
   * listing was not yet known and the owner was dropped on setup — now that the
   * listing is brought home before the session is published, "has a listing" is
   * true here whenever it is true on the server.
   *
   * Doing it here rather than calling `navigate` from the sign-in form is what
   * keeps it correct. A handler that sets the account and navigates in the same
   * tick sets the hash *before* React has re-rendered, so the guard runs once
   * against the new account and the old route — reads `signin` for a business
   * owner, answers `landing`, and stomps on the navigation that was already in
   * flight. Deriving the destination instead means there is only ever one.
   */
  if (route === 'signin') {
    if (account.type !== 'business') return 'landing';
    return account.business === null ? 'business-setup' : 'dashboard';
  }

  /* Everyone past the clause above has finished it, or was never asked to. */
  if (route === 'onboarding') return 'landing';

  if (account.type === 'individual') {
    /*
     * The consumer site is everything except what belongs to a venue: the two
     * pages that sell to one, and the two that *are* one. `business-setup` is in
     * that list now and was not before — an individual who typed the address in
     * reached the listing form, filled it in, and had it saved onto an account
     * with no dashboard to show it on.
     */
    if (route === 'profile') return 'profile';
    /*
     * The demo switch reaches this branch too, and only for `dashboard`.
     *
     * "See the full dashboard from any account" is the whole point of the flag,
     * and most accounts anybody has to hand are consumer ones. It is safe here
     * for a reason worth writing down rather than assuming: no screen in
     * `dashboard*.tsx` dereferences `account.business` — every figure is read
     * from the partner API or, where the server has nothing, from
     * `dashboardSeed`. So an account with no venue draws the demonstration
     * numbers and empty states rather than throwing, and never draws somebody
     * else's business, because the API answers a token that owns no venue with
     * nothing.
     *
     * `business-setup` is deliberately *not* opened up: that form writes, and a
     * consumer account filling it in is the exact bug the note above records.
     */
    if (route === 'dashboard' && DEMO_MODE) return 'dashboard';
    return route === 'business' || route === 'analytics' || PRIVATE.includes(route)
      ? 'landing'
      : route;
  }

  /*
   * A dashboard with nothing behind it is a form nobody filled in.
   *
   * `DEMO_MODE` is the one way past that, and it is past *this* check only —
   * the individual/owner split above still holds, because a consumer account
   * has no venue for any of these screens to be about and sending one here
   * would draw somebody else's business. What it lets through is the case the
   * flag exists for: an owner account that has not been through setup, which is
   * every account somebody makes to look at the screen.
   *
   * Still a fixed point, which is the rule this function lives under: with the
   * flag on, `dashboard` resolves to `dashboard`, and `npm run verify` walks
   * the whole matrix with the flag off, because Node has no `window`.
   */
  if (route === 'dashboard' && account.business === null && !DEMO_MODE) {
    return 'business-setup';
  }
  return route;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onHashChange = () => {
      const next = readRoute();
      setRoute(next);

      /*
       * Read before normalising, not after: `normalizeAddress` takes the route
       * hash back out of the bar, so asking `window.location` for it below
       * would find an empty string and skip the scroll to the top.
       */
      const { hash } = window.location;
      normalizeAddress(next);

      /*
       * A section anchor is left to the browser, which has already scrolled to
       * it — but only if that section exists, and coming *from* the other page
       * it does not yet. So re-run it after the render that mounts it.
       */
      if (hash.startsWith('#/') || hash === '' || hash === '#top') {
        /*
         * Explicitly instant. `html` carries `scroll-behavior: smooth` for the
         * section anchors, which would otherwise animate this too — and a page
         * that has just been replaced scrolling itself back to the top reads as
         * a glitch rather than as motion.
         */
        window.scrollTo({ top: 0, behavior: 'instant' });
        return;
      }

      requestAnimationFrame(() => {
        document.getElementById(hash.slice(1))?.scrollIntoView();
      });
    };

    /*
     * `popstate` as well as `hashchange`, and it is `normalizeAddress` that
     * makes it necessary rather than a belt-and-braces addition.
     *
     * Two history entries that have both been normalised differ in their
     * *path* and not in their fragment — `/l-earn` and `/business` — so the
     * traversal between them is a same-document one that fires `popstate`
     * only. Listening for `hashchange` alone left Back and Forward changing
     * the URL and not the page, which on a hash-routed site is the primary
     * control. Where both fire, the handler runs twice and the second is a
     * no-op: `setRoute` to the value it already holds is a React bail-out and
     * `normalizeAddress` compares before it writes.
     */
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('popstate', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('popstate', onHashChange);
    };
  }, []);

  /* The first load fires neither event, so the entry URL — `/business`, or
     `/#/business` out of somebody's bookmarks — is normalised here instead. */
  useEffect(() => {
    normalizeAddress(route);
  }, [route]);

  return route;
}
