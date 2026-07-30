import { useEffect, useState } from 'react';
import type { Atlas } from '../types';
import { loadAtlas } from '../geo/atlas';

/**
 * Loads (and memoises, process-wide) the country atlas.
 *
 * The topology is a dynamic import so it code-splits out of the main bundle —
 * the hero paints immediately and the borders fade in a frame later.
 */
export function useAtlas(): Atlas | null {
  const [atlas, setAtlas] = useState<Atlas | null>(null);

  useEffect(() => {
    let alive = true;
    loadAtlas().then((result) => {
      if (alive) setAtlas(result);
    });
    return () => {
      alive = false;
    };
  }, []);

  return atlas;
}
