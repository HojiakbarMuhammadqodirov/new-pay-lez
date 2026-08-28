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
 *
 * `key` is not enough on its own, though, and the gap had already shipped a
 * blank screen. A key covers the changes *React's caller* knows about — the
 * route, the language, the session. It cannot cover a panel that mounts when a
 * `fetch` resolves, because nothing re-keys then: the console's "who visited
 * the site" tab renders a placeholder while the request is in flight and mounts
 * its real `[data-reveal]` sections afterwards, by which time the scan is long
 * over. Every one of them stayed at `opacity: 0` — including, in the ordinary
 * no-server case, the panel whose entire job is to say the backend is not
 * answering. So a `MutationObserver` picks up whatever arrives late, which
 * closes the whole class rather than this one screen.
 */
export function useReveal(key?: unknown): void {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* Not yet revealed. `[data-shown]` is what the sheet reads, so an element
       that already carries it needs neither observing nor showing again. */
    const pending = () =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]:not([data-shown])'));

    if (reduced) {
      const show = () => {
        for (const node of pending()) node.dataset.shown = 'true';
      };
      show();
      /* Late arrivals need it too — under reduced motion there is no observer
         to catch them, and a permanently invisible panel is the worse failure
         of the two this setting is choosing between. */
      const watcher = new MutationObserver(show);
      watcher.observe(document.body, { childList: true, subtree: true });
      return () => watcher.disconnect();
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

    const scan = () => {
      /* `observe` on an element already being watched is a no-op, so re-scanning
         costs a `querySelectorAll` and nothing else — no bookkeeping set, and no
         way for the two paths to disagree about what is observed. */
      for (const node of pending()) observer.observe(node);
    };
    scan();

    /*
     * Coalesced to one scan per frame. A subtree mutation observer on the body
     * fires several times for a single React commit, and a game screen commits
     * constantly; doing the query per callback would put a document-wide
     * selector match on the hot path. One frame late is invisible — the element
     * has not been scrolled to yet — and it is the cheap end of the trade.
     */
    let frame = 0;
    const watcher = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        scan();
      });
    });
    watcher.observe(document.body, { childList: true, subtree: true });

    return () => {
      watcher.disconnect();
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
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

    /*
     * Every frame this scan has in flight.
     *
     * A count-up runs for 1.1s and the scan is torn down by a route or language
     * change, which is well inside that. Two things go wrong without this. The
     * cheap one is that a loop keeps ticking against a node React has already
     * detached. The one that shows: a `[data-count]` element that is *not*
     * remounted by the change — anything not keyed on a translated string —
     * gets a second loop started on it by the new scan while the old one is
     * still writing, and the two race for one `textContent`. On a money figure
     * that means it can settle on the previous currency's amount, which is the
     * one number on the page nobody would think to distrust.
     */
    const frames = new Set<number>();

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
      let frame = 0;
      const step = (now: number) => {
        frames.delete(frame);
        start ??= now;
        const t = Math.min(1, (now - start) / duration);
        // easeOutCubic: fast off the mark, gentle landing.
        const eased = 1 - (1 - t) ** 3;
        write(target * eased);
        if (t < 1) {
          frame = requestAnimationFrame(step);
          frames.add(frame);
        }
      };
      frame = requestAnimationFrame(step);
      frames.add(frame);
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
    return () => {
      observer.disconnect();
      for (const frame of frames) cancelAnimationFrame(frame);
      frames.clear();
    };
  }, [key]);
}
