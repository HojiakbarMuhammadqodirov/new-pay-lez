import { useEffect } from 'react';

/**
 * Reveals `[data-reveal]` elements as they enter the viewport.
 *
 * One shared `IntersectionObserver` for the whole page rather than a hook per
 * component: dozens of individual observers would each cost their own callback
 * on every scroll frame. Elements unobserve once shown, so the work only ever
 * shrinks.
 */
export function useReveal(): void {
  useEffect(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-reveal]'),
    );
    if (!nodes.length) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      for (const node of nodes) node.dataset.shown = 'true';
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.shown = 'true';
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, []);
}

/**
 * Counts `[data-count]` elements up to their target once revealed.
 * Mirrors the original design's animated hero stats.
 */
export function useCountUp(): void {
  useEffect(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-count]'),
    );
    if (!nodes.length) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const run = (node: HTMLElement) => {
      const target = Number(node.dataset.count ?? '0');
      const suffix = node.dataset.suffix ?? '';
      if (reduced) {
        node.textContent = `${target}${suffix}`;
        return;
      }

      const duration = 1100;
      let start: number | null = null;
      const step = (now: number) => {
        start ??= now;
        const t = Math.min(1, (now - start) / duration);
        // easeOutCubic: fast off the mark, gentle landing.
        const eased = 1 - (1 - t) ** 3;
        node.textContent = `${Math.round(target * eased)}${suffix}`;
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          run(entry.target as HTMLElement);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.4 },
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, []);
}
