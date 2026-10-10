import { useEffect, useRef, type RefObject } from 'react';

/**
 * The canvas behind a board game's scene — 2048's bakery and Food Cross's
 * market stall — and the clock that paints it.
 *
 * Both games keep the **rules** in React state (the board, the score, the move
 * count, all exactly as before) and the **picture** in a scene object that the
 * component drives imperatively: "these tiles slid left", "this step cleared
 * those cells". The scene turns that into motion against `performance.now()`
 * and this hook calls its `paint` once a display frame. Nothing per frame goes
 * through React — the load-bearing rule in the root `CLAUDE.md` — and a move
 * re-renders the component once, as it always has.
 *
 * Three things the hook owns so neither scene has to:
 *
 * - **The backing store follows the box at the display's density**, capped at
 *   2×: a scene is mostly broad flat shapes, where 3× buys nothing a phone can
 *   show and costs 2.25× the fill of every frame.
 * - **It only runs while it can be seen.** An `IntersectionObserver` stops the
 *   loop when the stage scrolls away, and the browser already stops
 *   `requestAnimationFrame` in a hidden tab. A scene's *timers* (the promises a
 *   game awaits between cascade steps) are `setTimeout`s for that reason — a
 *   paused painter must never be able to stall a round.
 * - **Reduced motion paints on demand.** No loop at all: `invalidate()` paints
 *   the next frame and stops, and the scene itself is told to skip its tweens
 *   (every animation resolves at its end state).
 */
export interface SceneHost {
  /** The stage's box changed, in CSS pixels, drawn at `ratio` device pixels to one. */
  resize(width: number, height: number, ratio: number): void;
  /** Paint one frame. The context is already scaled to CSS pixels and cleared. */
  paint(ctx: CanvasRenderingContext2D, now: number): void;
}

/** Backing-store ceiling; see the note above. */
const MAX_RATIO = 2;

export function useSceneCanvas(
  canvas: RefObject<HTMLCanvasElement | null>,
  host: RefObject<SceneHost | null>,
  reduced: boolean,
): { invalidate: () => void } {
  const box = useRef({ w: 0, h: 0, ratio: 1 });
  const frame = useRef(0);
  const running = useRef(false);
  /* Kept in a ref so `invalidate` is one stable function for the component's
     whole life, whatever `reduced` does. */
  const paintOnce = useRef<() => void>(() => {});
  const api = useRef({ invalidate: () => paintOnce.current() });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;

    const paint = (now: number) => {
      const { w, h, ratio } = box.current;
      const scene = host.current;
      if (!scene || !(w > 0 && h > 0)) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, w, h);
      scene.paint(ctx, now);
    };

    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO);
      const bw = Math.max(1, Math.round(w * ratio));
      const bh = Math.max(1, Math.round(h * ratio));
      /* Assigning `width` reallocates and clears even at the same value. */
      if (el.width !== bw) el.width = bw;
      if (el.height !== bh) el.height = bh;
      box.current = { w, h, ratio: bw / Math.max(1, w) };
      host.current?.resize(w, h, box.current.ratio);
    };

    const loop = (now: number) => {
      frame.current = 0;
      paint(now);
      if (running.current) frame.current = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running.current || reduced) return;
      running.current = true;
      frame.current = requestAnimationFrame(loop);
    };
    const stop = () => {
      running.current = false;
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
    };

    paintOnce.current = () => {
      if (running.current || frame.current) return;
      frame.current = requestAnimationFrame((now) => {
        frame.current = 0;
        paint(now);
      });
    };

    measure();
    paint(performance.now());

    const resize = new ResizeObserver(() => {
      measure();
      paint(performance.now());
    });
    resize.observe(el);

    let seen: IntersectionObserver | null = null;
    if (reduced) {
      /* Painted on demand only — see the header. */
    } else if (typeof IntersectionObserver === 'undefined') {
      start();
    } else {
      seen = new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop()), {
        rootMargin: '10% 0px',
      });
      seen.observe(el);
    }

    return () => {
      resize.disconnect();
      seen?.disconnect();
      stop();
      paintOnce.current = () => {};
    };
  }, [canvas, host, reduced]);

  return api.current;
}

/** The family `--font-display` names, for canvas text that should match the page. */
export function displayFont(): string {
  if (typeof document === 'undefined') return 'sans-serif';
  const family = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim();
  return family || 'sans-serif';
}

/* ── small maths every scene uses ─────────────────────────────────────────── */

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;
export const easeInCubic = (t: number): number => t * t * t;
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
/** Overshoots by about 10% and settles — a piece arriving with some weight. */
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/** A promise that resolves after `ms`, on a timer rather than on the painter. */
export const after = (ms: number): Promise<void> =>
  new Promise((resolve) => (ms > 0 ? window.setTimeout(resolve, ms) : resolve()));

/** Deterministic 0..1 noise from an integer, for scenery that must not shimmer between frames. */
export function hash01(n: number): number {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 0xffffffff;
}

const ALPHA = new Map<string, string>();

/** `#rrggbb` (or `#rrggbbaa`) at `a`, as an `rgba()` string — memoised, since frames ask for the same few. */
export function withAlpha(hex: string, a: number): string {
  const key = `${hex}|${a.toFixed(3)}`;
  const hit = ALPHA.get(key);
  if (hit) return hit;
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const base = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  const out = `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a * base)).toFixed(3)})`;
  if (ALPHA.size > 512) ALPHA.clear();
  ALPHA.set(key, out);
  return out;
}

/** A rounded rectangle on the current path (`roundRect` without the browser check). */
export function roundedRect(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}
