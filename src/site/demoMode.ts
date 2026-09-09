/**
 * The demo switch, for looking at screens that have no data behind them yet.
 *
 * ── why this exists ───────────────────────────────────────────────────────
 *
 * The partner dashboard draws a fortnight of visits, a sparkline on every tile
 * and a period delta beside every figure. The server answers none of those —
 * there is no daily-series endpoint and no previous-period comparison — so on a
 * real venue those panels say "not measured", which is the honest state and is
 * also a screen with nothing on it to look at. `dashboardSeed.ts` holds the
 * reference design's own numbers so the screen can be *seen* and compared
 * against the export it was ported from.
 *
 * The problem is who sees them. Shipping `PD_SEED = true` puts a sine-wave
 * fortnight and a "2.4× repeat multiple" in front of twelve real venue owners
 * with no way to tell those from their own takings, which is the thing the
 * repository's "nothing is seeded" rule exists to prevent. Shipping it `false`
 * means nobody — including us — can look at the screen on the deployed site.
 *
 * So the switch is **per browser and opt-in by URL**, which resolves both: a
 * person who has typed `?demo=1` has asked for demonstration figures and knows
 * what they are looking at, and a venue owner who has not is unaffected. That
 * is the same shape as the `PAYLEZ_DEMO_SEED` flag the server refuses to
 * have — with the difference that makes it acceptable here: this one writes no
 * rows. It changes what one browser draws, and nothing anybody else can read.
 *
 * ── using it ──────────────────────────────────────────────────────────────
 *
 *   …/?demo=1#/dashboard    turn it on for this browser and open the dashboard
 *   …/?demo=0               turn it off again
 *
 * The query goes **before** the hash, not inside it: `routeOf` looks the hash
 * up in `ROUTES` exactly, so `#/dashboard?demo=1` matches nothing and lands on
 * the landing page.
 */

const KEY = 'paylez-demo';

/**
 * Read once, at module load.
 *
 * The URL is checked first and, when it carries the flag, written to storage so
 * the setting survives every later navigation — the dashboard's own links do
 * not carry a query, and a demo that switched itself off on the first press
 * would be no use for looking around. Reading once rather than per call also
 * means the answer cannot change under a render: `PD_SEED` is a constant
 * derived from this, and a panel that decided halfway down that it was measured
 * after all would draw half of each.
 */
function read(): boolean {
  /* Not a browser (the check scripts import this transitively): demo is off,
     and `npm run verify` therefore walks the real route matrix rather than the
     demonstration one. */
  if (typeof window === 'undefined') return false;

  let stored = false;
  try {
    stored = window.localStorage.getItem(KEY) === '1';
  } catch {
    /* A private window with cookies blocked throws on read. The site's other
       three keys are wrapped for the same reason — see `auth/directory.ts`. */
  }

  const asked = new URLSearchParams(window.location.search).get('demo');
  if (asked === null) return stored;

  const on = asked === '1' || asked === 'true';
  try {
    if (on) window.localStorage.setItem(KEY, '1');
    else window.localStorage.removeItem(KEY);
  } catch {
    /* Storage refused. The flag still applies to this page load, which is the
       useful half — it simply will not survive a navigation. */
  }
  return on;
}

/**
 * Whether this browser is in demo mode.
 *
 * A `const` rather than a function so it is evaluated once and every reader
 * agrees. It is `false` everywhere it matters — a fresh browser, a venue
 * owner's phone, and Node — and only true where somebody typed the query.
 */
export const DEMO_MODE: boolean = read();
