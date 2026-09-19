/**
 * The document head, per route.
 *
 * Until now there was one `<title>` in `index.html` and nothing else — no
 * description, no canonical, no Open Graph. That is the right amount of head
 * for a site whose pages all share one URL, and the wrong amount for one whose
 * pages have their own (see `URL_PATHS` in `router.ts`): eight pages that are
 * indexable but identically titled and undescribed are eight results that look
 * like the same result, and a crawler reaching `new.pay-lez.com` has nothing
 * telling it that `www.` is the copy to keep.
 *
 * A hook rather than a component, so it can be called beside `resolveRoute` in
 * `Site` with the *resolved* route in hand. The head describes the page that is
 * actually drawn, never the one that was asked for — a visitor bounced off
 * `/dashboard` to the sign-in form must not leave a dashboard title behind.
 *
 * **What this cannot do, and the static tags in `index.html` are why.** Google
 * renders JavaScript, so everything set here is seen. Facebook, Slack, X and
 * every other unfurler do *not* — they read the HTML as served. So `index.html`
 * carries a full default set for the site as a whole, and these overwrite it
 * per route for the reader that runs scripts. A shared link to any page
 * therefore unfurls as Paylez rather than as nothing, which is the honest
 * ceiling without server-side rendering.
 *
 * No `hreflang`. It needs one URL per language and this site has one URL per
 * *page*, with the five languages chosen in the header and remembered per
 * browser. Emitting the tag anyway would point all five at the same address,
 * which says nothing and is a thing to get wrong later — the fix is a language
 * segment in the path, not a tag.
 */
import { useEffect } from 'react';
import { useCopy, type Dictionary } from './i18n/context';
import { SITE_ORIGIN, canonicalUrl, type Route } from './router';

type SeoPage = keyof Dictionary['seo']['pages'];

/**
 * Which routes a search engine is told about, and under which block of copy.
 *
 * Exhaustive in `Route`, so a sixteenth route is a build error here until
 * somebody says whether it has a public page or not — the same construction
 * `scripts/build-sitemap.ts` uses for the sitemap, and deliberately a second
 * decision rather than a shared list: the sitemap is what a crawler is *invited*
 * to fetch, and this is what it is told when it arrives by some other road.
 * The seven `null`s are the private screens, and they get `noindex` below.
 *
 * `learn` and `vouchers` describe the marketing pages rather than the signed-in
 * ones they swap for (`useIsPlayer`), which is not an oversight: a crawler is
 * never signed in, so the marketing page is the only one it can ever see.
 */
const SEO_PAGE: Record<Route, SeoPage | null> = {
  landing: 'landing',
  learn: 'learn',
  business: 'business',
  vouchers: 'vouchers',
  relocate: 'relocate',
  contact: 'contact',
  privacy: 'privacy',
  terms: 'terms',
  /* A month of somebody's takings, a password form, and five screens that
     belong to one account. None of them is a page to arrive on from a search,
     and `resolveRoute` would bounce the visitor off most of them anyway. */
  analytics: null,
  signin: null,
  profile: null,
  onboarding: null,
  'business-setup': null,
  dashboard: null,
  admin: null,
};

/** Upsert one `<meta>`. Keyed on the attribute it is identified by, because
    Open Graph uses `property` and everything else uses `name`, and a tag
    written under the wrong one is ignored in silence. */
function meta(key: 'name' | 'property', value: string, content: string): void {
  const existing = document.head.querySelector<HTMLMetaElement>(`meta[${key}="${value}"]`);
  const el = existing ?? document.createElement('meta');
  if (existing === null) {
    el.setAttribute(key, value);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/** Upsert one `<link rel>`. */
function link(rel: string, href: string): void {
  const existing = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  const el = existing ?? document.createElement('link');
  if (existing === null) {
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function useHead(route: Route): void {
  const copy = useCopy();

  useEffect(() => {
    const page = SEO_PAGE[route];
    const title = page === null ? copy.seo.site : copy.seo.pages[page].title;
    const description = page === null ? copy.seo.description : copy.seo.pages[page].description;
    const url = canonicalUrl(route);

    document.title = title;
    /*
     * `index.html` hardcodes `lang="en"`, which is a promise the site breaks
     * the moment the switcher is used — and one a screen reader acts on, by
     * reading Polish copy with English phonetics.
     */
    document.documentElement.lang = copy.code;

    meta('name', 'description', description);
    link('canonical', url);
    /*
     * `follow` on both branches. A private screen should not be *listed*, and
     * the links on it are still the way a crawler reaches the pages that
     * should be — `noindex, nofollow` on the sign-in form would wall off every
     * marketing page linked from its header.
     */
    meta('name', 'robots', page === null ? 'noindex, follow' : 'index, follow');

    meta('property', 'og:title', title);
    meta('property', 'og:description', description);
    meta('property', 'og:url', url);
    meta('property', 'og:type', 'website');
    meta('property', 'og:site_name', 'Paylez');
    meta('property', 'og:locale', `${copy.code}_${copy.region}`);
    /*
     * The app icon, which is the only image this repo ships — see "no
     * third-party runtime requests" and the note on the intro's cold-open. It
     * is square, so the card is `summary` rather than `summary_large_image`:
     * the wide card would letterbox a logo into a grey band and look broken.
     */
    meta('property', 'og:image', `${SITE_ORIGIN}/logo/logo-dark.jpg`);
    meta('name', 'twitter:card', 'summary');
  }, [route, copy]);
}
