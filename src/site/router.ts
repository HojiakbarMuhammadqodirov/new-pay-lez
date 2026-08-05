import { useEffect, useState } from 'react';
import type { Account } from './auth/context';

/**
 * The whole router.
 *
 * Hash-based, and deliberately about forty lines rather than a dependency: the
 * site is a handful of pages on static hosting, where a history router would
 * need a server rewrite to survive a refresh and a hash router needs nothing at
 * all. Ten routes have not changed that; the day one of them needs a real URL
 * for sharing or SEO is the day this is worth replacing, and not before.
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
  | 'b2b'
  | 'vouchers'
  | 'relocate'
  | 'contact'
  | 'signin'
  | 'business-setup'
  | 'dashboard'
  | 'admin';

const ROUTES: Record<string, Route> = {
  '#/l-earn': 'learn',
  '#/analytics': 'analytics',
  '#/b2b': 'b2b',
  '#/vouchers': 'vouchers',
  '#/relocate': 'relocate',
  '#/contact': 'contact',
  '#/sign-in': 'signin',
  '#/business/setup': 'business-setup',
  '#/dashboard': 'dashboard',
  '#/admin': 'admin',
};

export const PATHS: Record<Route, string> = {
  landing: '#top',
  learn: '#/l-earn',
  analytics: '#/analytics',
  b2b: '#/b2b',
  vouchers: '#/vouchers',
  relocate: '#/relocate',
  contact: '#/contact',
  signin: '#/sign-in',
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
 * Which page a bare section anchor belongs to.
 *
 * This used to be answered "the landing page, always", and every in-page link on
 * every other page was broken by it: `#analytics-reports` is not in `ROUTES`, so
 * following "Open the dashboard" from Analytics read as a miss and dropped the
 * visitor on Home. Same for `#b2b-cta`, `#learn-games`, `#vouchers-catalogue`
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
  ['b2b-', 'b2b'],
  ['vouchers-', 'vouchers'],
  ['relocate-', 'relocate'],
  ['contact-', 'contact'],
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

function readRoute(): Route {
  return routeOf(window.location.hash);
}

/**
 * Go somewhere without a link.
 *
 * Every navigation on the site until now was an `<a href="#/x">`, which is still
 * the right thing for anything a visitor clicks. This is for the handful that
 * are consequences rather than clicks: landing after a successful sign-in,
 * being sent to setup because the listing is not finished, being bounced off a
 * page this account cannot see.
 */
export function navigate(route: Route): void {
  window.location.hash = PATHS[route];
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
const PRIVATE: Route[] = ['business-setup', 'dashboard', 'admin'];

export function resolveRoute(route: Route, account: Account | null): Route {
  if (account === null) {
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
    return PRIVATE.includes(route) || route === 'signin' ? 'admin' : route;
  }

  /* Nobody else has a console. Checked before the sign-in clause below so the
     answer does not depend on which of the two the address bar happens to say. */
  if (route === 'admin') return 'landing';

  /*
   * Signing in when you already are. Where that lands is the *whole* of the
   * post-sign-in routing, on purpose: an owner who has not described their
   * venue yet goes to setup, everyone else goes home.
   *
   * Doing it here rather than calling `navigate` from the sign-in form is what
   * keeps it correct. A handler that sets the account and navigates in the same
   * tick sets the hash *before* React has re-rendered, so the guard runs once
   * against the new account and the old route — reads `signin` for a business
   * owner, answers `landing`, and stomps on the navigation that was already in
   * flight. Deriving the destination instead means there is only ever one.
   */
  if (route === 'signin') {
    return account.type === 'business' && account.business === null
      ? 'business-setup'
      : 'landing';
  }

  if (account.type === 'individual') {
    /*
     * The consumer site is everything except what belongs to a venue: the two
     * pages that sell to one, and the two that *are* one. `business-setup` is in
     * that list now and was not before — an individual who typed the address in
     * reached the listing form, filled it in, and had it saved onto an account
     * with no dashboard to show it on.
     */
    return route === 'b2b' || route === 'analytics' || PRIVATE.includes(route)
      ? 'landing'
      : route;
  }

  // A dashboard with nothing behind it is a form nobody filled in.
  if (route === 'dashboard' && account.business === null) return 'business-setup';
  return route;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onHashChange = () => {
      const next = readRoute();
      setRoute(next);

      /*
       * A section anchor is left to the browser, which has already scrolled to
       * it — but only if that section exists, and coming *from* the other page
       * it does not yet. So re-run it after the render that mounts it.
       */
      const { hash } = window.location;
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

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}
