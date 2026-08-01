import { useEffect } from 'react';

/**
 * Reveals `[data-reveal]` elements as they enter the viewport.
 *
 * One shared `IntersectionObserver` for the whole page rather than a hook per
 * component: dozens of individual observers would each cost their own callback
 * on every scroll frame. Elements unobserve once shown, so the work only ever
 * shrinks.
 *
 * `key` re-runs the scan. The observer is built from one `querySelectorAll` at
 * mount, so nodes that appear later are invisible to it — and a route change
 * replaces the entire page. Without re-scanning, every element on the second
 * page would sit at `opacity: 0` for good. Pass the route.
 */
export function useReveal(key?: unknown): void {
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
  }, [key]);
}

/**
 * Counts `[data-count]` elements up to their target once revealed.
 * Mirrors the original design's animated hero stats.
 *
 * Four data attributes, all optional: `data-suffix` and `data-prefix` are
 * written either side of the number, and `data-group` is the thousands
 * separator. The last two exist for money — the currency the page prices in
 * follows the language (see `i18n/currency.ts`), so a figure may need a symbol
 * in front of it in one language and behind it in another, and six unseparated
 * digits are unreadable in every one.
 *
 * `key` re-scans, for the same reason it does in `useReveal`.
 */
export function useCountUp(key?: unknown): void {
  useEffect(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-count]'),
    );
    if (!nodes.length) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /** Rounds to whole units, then groups. Anything wanting a decimal place
     *  needs this changed first. */
    const format = (value: number, separator: string) => {
      const digits = String(Math.round(Math.abs(value)));
      if (!separator) return (value < 0 ? '-' : '') + digits;

      let out = '';
      for (let i = 0; i < digits.length; i++) {
        if (i > 0 && (digits.length - i) % 3 === 0) out += separator;
        out += digits[i];
      }
      return (value < 0 ? '-' : '') + out;
    };

    const run = (node: HTMLElement) => {
      const target = Number(node.dataset.count ?? '0');
      const prefix = node.dataset.prefix ?? '';
      const suffix = node.dataset.suffix ?? '';
      const separator = node.dataset.group ?? '';
      const write = (value: number) => {
        node.textContent = `${prefix}${format(value, separator)}${suffix}`;
      };

      if (reduced) {
        write(target);
        return;
      }

      const duration = 1100;
      let start: number | null = null;
      const step = (now: number) => {
        start ??= now;
        const t = Math.min(1, (now - start) / duration);
        // easeOutCubic: fast off the mark, gentle landing.
        const eased = 1 - (1 - t) ** 3;
        write(target * eased);
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
  }, [key]);
}
