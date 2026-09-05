import { useEffect, useRef } from 'react';

/**
 * The cursor's position on an element, written as two custom properties.
 *
 * A pointer crossing a surface is exactly the continuous stream the root
 * `CLAUDE.md` forbids routing through React — a card or a section re-rendering
 * per pointer event would drag its whole subtree through the reconciler several
 * times a second — so the listener is passive, writes `--sub-x` and `--sub-y` on
 * the element it is attached to, and the stylesheet reads them.
 *
 * Nothing it drives animates on its own: what it lights exists only where a
 * hand has put it, which is why it needs no reduced-motion branch of its own
 * beyond whatever fade the sheet damps.
 *
 * The element's box is measured on the way in and dropped when anything can
 * have moved it, rather than read per event: the property written on the
 * previous move dirties style, so a `getBoundingClientRect` on the next one
 * forces a synchronous layout — a hundred times a second, for a light. Scroll
 * and resize are the only two things that move an element under a stationary
 * cursor, and both simply throw the measurement away.
 *
 * It lives in its own module rather than beside its first caller because the
 * second one is a different route: `sections.tsx` is the landing page and
 * `onboarding.tsx` is the welcome gate, and importing one page's module into
 * another to reach twenty lines would put the whole landing page in the
 * welcome chunk.
 */
export function useSpotlight<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let box: DOMRect | null = null;
    const drop = () => {
      box = null;
    };

    const move = (event: PointerEvent) => {
      if (!box) box = el.getBoundingClientRect();
      el.style.setProperty('--sub-x', `${event.clientX - box.left}px`);
      el.style.setProperty('--sub-y', `${event.clientY - box.top}px`);
    };

    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerleave', drop, { passive: true });
    window.addEventListener('scroll', drop, { passive: true });
    window.addEventListener('resize', drop, { passive: true });

    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', drop);
      window.removeEventListener('scroll', drop);
      window.removeEventListener('resize', drop);
    };
  }, []);

  return ref;
}
