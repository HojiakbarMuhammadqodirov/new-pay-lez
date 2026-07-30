import { useEffect, useRef, type RefObject } from 'react';
import { clamp01 } from '../geo/math';

interface ScrollProgressOptions {
  enabled: boolean;
  /** Fallback range, in viewport heights, when no anchor is given. */
  rangeVh: number;
  /**
   * Element the transition is timed to. The globe reaches its end pose as this
   * element arrives, and fades out as it leaves. Far more robust than a fixed
   * scroll distance, which drifts the moment any copy above it changes length.
   */
  anchorId?: string;
  /** Called whenever either value changes — for DOM side effects, not state. */
  onChange?: (progress: number, exit: number) => void;
}

export interface ScrollTracking {
  /** 0 -> 1 as the globe travels from its hero pose to its end pose. */
  progress: RefObject<number>;
  /** 0 -> 1 as the anchor section leaves and the globe should retire. */
  exit: RefObject<number>;
}

/**
 * Tracks page scroll as two 0..1 values **in refs**.
 *
 * Deliberately not React state: scrolling would otherwise re-render the entire
 * Canvas subtree on every wheel tick. The render loop reads the refs, and the
 * DOM overlays are updated through `onChange` writing CSS custom properties —
 * so a full-page scroll costs zero React renders.
 */
export function useScrollProgress({
  enabled,
  rangeVh,
  anchorId,
  onChange,
}: ScrollProgressOptions): ScrollTracking {
  const progress = useRef(0);
  const exit = useRef(0);

  // Kept in a ref so re-creating the callback never re-binds the listener.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled) {
      progress.current = 0;
      exit.current = 0;
      onChangeRef.current?.(0, 0);
      return;
    }

    const read = () => {
      const viewport = window.innerHeight;
      const scrolled = window.scrollY;

      const anchor = anchorId ? document.getElementById(anchorId) : null;

      let travel = Math.max(1, viewport * rangeVh);
      let exitStart = Infinity;

      if (anchor) {
        const top = anchor.getBoundingClientRect().top + scrolled;
        // Settle a little before the section actually arrives, so it is already
        // in place rather than still moving when the reader gets there.
        travel = Math.max(1, top - viewport * 0.15);
        // Retire once the section has nearly finished passing.
        exitStart = top + anchor.offsetHeight - viewport * 0.8;
      }

      const nextProgress = clamp01(scrolled / travel);
      const nextExit = clamp01((scrolled - exitStart) / (viewport * 0.6));

      if (nextProgress === progress.current && nextExit === exit.current) return;
      progress.current = nextProgress;
      exit.current = nextExit;
      onChangeRef.current?.(nextProgress, nextExit);
    };

    read();
    window.addEventListener('scroll', read, { passive: true });
    window.addEventListener('resize', read);
    // Section heights settle after fonts and images land; re-measure then.
    const settle = window.setTimeout(read, 400);

    return () => {
      window.removeEventListener('scroll', read);
      window.removeEventListener('resize', read);
      window.clearTimeout(settle);
    };
  }, [enabled, rangeVh, anchorId]);

  return { progress, exit };
}
