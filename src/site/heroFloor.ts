import { useEffect, useSyncExternalStore, type RefObject } from 'react';
import { RESPONSIVE } from '../components/GlobeHero/config';

/**
 * Where the landing hero's copy ends, as a fraction of viewport height.
 *
 * ── why this exists ───────────────────────────────────────────────────────
 *
 * On a phone the hero stacks and the globe is aimed at the slot underneath it
 * (`RESPONSIVE.portraitCopyDepth`, and the long note beside it in the globe's
 * `config.ts`). That constant is 0.55 — "the copy's floor is 55% down the
 * viewport" — and it is right for exactly one phone:
 *
 *     390 x 844   copy ends at 54.0%   ✓
 *     414 x 896   copy ends at 51.3%   ✓
 *     360 x 780   copy ends at 66.7%   ✗   globe drawn 90px into the stats
 *     360 x 640   copy ends at 79.5%   ✗
 *
 * The copy is a headline, a lede, two stacked buttons and a stat row: that is a
 * roughly *fixed pixel height*, so the fraction it occupies moves with the
 * screen it is on. A constant fraction cannot model a constant height, which is
 * why tuning the constant only moves which phones are wrong — and short phones
 * are the ones that most need the globe to stay out of the words.
 *
 * So the page measures its own copy and the globe is told. The store is the
 * `focusStore` construction one directory over, for the same reason: the value
 * is written by one component and read by another that is not its parent, and
 * threading a prop from `Site` down into `Hero` and back out would be a
 * round trip through the tree to carry a number the DOM already knows.
 *
 * Resize-only, never per-frame — this is not on the path the "per-frame work
 * does not go through React state" rule is about.
 */

/**
 * The globe is centred in the slot [depth, 1], so its diameter is 1 − depth.
 * A copy block that runs most of the way down a short phone would leave a disc
 * the size of a coin, which is worse than a small overlap: the backdrop stops
 * reading as a globe at all. The cap is the point where it still does.
 */
const MAX_DEPTH = 0.74;

/** Clearance below the last line, so the disc's edge does not graze it. */
const CLEARANCE = 0.02;

let depth: number = RESPONSIVE.portraitCopyDepth;
const listeners = new Set<() => void>();

function publish(next: number) {
  /* A change too small to see is a re-render of the Canvas subtree for nothing;
     the globe moves by less than a pixel for a thousandth of a viewport. */
  if (Math.abs(next - depth) < 0.005) return;
  depth = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const read = () => depth;

/** The measured floor, for whoever is aiming something at the space below it. */
export function useHeroCopyDepth(): number {
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * Publishes `element`'s floor for as long as it is mounted, and hands the value
 * back to the constant on unmount.
 *
 * The reset is the half that is easy to forget: the globe outlives the hero —
 * it is a fixed backdrop and `Site` keeps it across routes — so a stale
 * measurement from the landing page would go on aiming the globe on a route
 * whose hero is a different shape, or gone.
 */
export function useReportHeroFloor(element: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const node = element.current;
    if (!node) return;

    const measure = () => {
      const bottom = node.getBoundingClientRect().bottom + window.scrollY;
      const viewport = window.innerHeight;
      if (viewport <= 0) return;
      publish(Math.min(MAX_DEPTH, bottom / viewport + CLEARANCE));
    };

    measure();

    /* Two sources, because they are two different events: the box changing
       (a translation with a longer headline, a font finally loading) and the
       viewport changing under a box that did not (a rotation, the URL bar
       retracting). Watching only the first misses every one of the second. */
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      publish(RESPONSIVE.portraitCopyDepth);
    };
  }, [element]);
}
