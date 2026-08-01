import { useEffect, useState } from 'react';

/**
 * The whole router.
 *
 * Hash-based, and deliberately about forty lines rather than a dependency: the
 * site is a handful of pages on static hosting, where a history router would
 * need a server rewrite to survive a refresh and a hash router needs nothing at
 * all. Six routes have not changed that; the day one of them needs a real URL
 * for sharing or SEO is the day this is worth replacing, and not before.
 *
 * Routes are the hashes that start with `#/`. Everything else — `#value`,
 * `#guide`, `#top` — is a section anchor on the landing page, which means the
 * header's existing links keep working from any page: following `#value`
 * from L-Earn lands on the landing page *and* scrolls to the section, with no
 * special handling at the link.
 */

export type Route = 'landing' | 'learn' | 'analytics' | 'b2b' | 'vouchers' | 'relocate';

const ROUTES: Record<string, Route> = {
  '#/l-earn': 'learn',
  '#/analytics': 'analytics',
  '#/b2b': 'b2b',
  '#/vouchers': 'vouchers',
  '#/relocate': 'relocate',
};

export const PATHS: Record<Route, string> = {
  landing: '#top',
  learn: '#/l-earn',
  analytics: '#/analytics',
  b2b: '#/b2b',
  vouchers: '#/vouchers',
  relocate: '#/relocate',
};

function readRoute(): Route {
  return ROUTES[window.location.hash] ?? 'landing';
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
