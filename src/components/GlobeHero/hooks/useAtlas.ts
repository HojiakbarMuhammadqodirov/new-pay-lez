import { useEffect, useState } from 'react';
import type { Atlas } from '../types';
import { loadAtlas } from '../geo/atlas';

/**
 * Loads (and memoises, process-wide) the country atlas.
 *
 * The topology is a dynamic import so it code-splits out of the main bundle —
 * the hero paints immediately and the borders fade in a frame later. The other
 * side of that: it is a network fetch, so it can fail, and this hook is the one
 * place that failure has to be *handled*.
 */
export function useAtlas(): Atlas | null {
  const [atlas, setAtlas] = useState<Atlas | null>(null);

  useEffect(() => {
    let alive = true;
    loadAtlas().then(
      (result) => {
        if (alive) setAtlas(result);
      },
      (error: unknown) => {
        /*
         * There is nothing to show but the lit sphere — a hero section has no
         * room for an error state, and a globe without borders is a degraded
         * picture rather than a broken page. What the rejection handler is
         * actually for is that an *unhandled* rejection is a red console error
         * on a marketing page. `loadAtlas` has already dropped the failed
         * promise from its cache, so the next mount retries.
         */
        console.warn('[GlobeHero] country atlas failed to load', error);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  return atlas;
}
