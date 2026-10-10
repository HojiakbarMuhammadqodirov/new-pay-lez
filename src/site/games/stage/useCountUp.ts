import { useLayoutEffect, type RefObject } from 'react';
import { COUNT_UP } from './config';

/**
 * Counts `ref`'s text up from nothing to `value`, by writing `textContent`
 * from a `requestAnimationFrame` loop — a figure changing sixty times a second
 * is exactly what must not go through React state (root `CLAUDE.md`).
 *
 * The element is rendered with the **final** text, and this replaces it with
 * the zero before the first paint (a layout effect), so a card mounted without
 * scripts, or under reduced motion, simply shows the number. When the count
 * lands it sets `data-landed` on the element, which is what `site.css` hangs
 * the figure's little pop on.
 */
export function useCountUp(
  ref: RefObject<HTMLElement | null>,
  value: number,
  format: (n: number) => string,
  reduced: boolean,
): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced || value <= 0) {
      el.textContent = format(value);
      el.dataset.landed = 'true';
      return;
    }
    delete el.dataset.landed;
    el.textContent = format(0);
    const duration = Math.min(COUNT_UP.maxMs, Math.max(COUNT_UP.minMs, value * COUNT_UP.perPointMs));
    const start = performance.now() + COUNT_UP.delayMs;
    let raf = 0;
    let shown = 0;
    const tick = (now: number) => {
      const u = Math.min(1, Math.max(0, (now - start) / duration));
      const n = Math.round(value * (1 - (1 - u) ** 3));
      if (n !== shown) {
        shown = n;
        el.textContent = format(n);
      }
      if (u < 1) raf = requestAnimationFrame(tick);
      else el.dataset.landed = 'true';
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.textContent = format(value);
    };
    // `format` is a pure formatter rebuilt each render; the count restarts on the value, not on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, value, reduced]);
}
