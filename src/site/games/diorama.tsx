import { memo, useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from '../../components/GlobeHero/hooks/useReducedMotion';

/**
 * The room a board is played in — a painted canvas behind a round's markup.
 *
 * Word Builder's study and Memory Match's card room are both this: a still
 * picture (wall, window, lamp, light) and a little life on top of it (dust in
 * the lamp's light, a star coming and going). The *objects* a player touches —
 * the shelf, the desk, the rack, the table, every tile and card — are DOM, so
 * they line up with the layout by construction and inherit the theme; only the
 * scenery behind them is painted, because scenery is gradients and specks and
 * a canvas is the cheap way to have a lot of both.
 *
 * Two layers, because they cost different amounts:
 *
 * - **`still`** is painted once per size and palette into an offscreen canvas
 *   — the gradients, the window frame, the wallpaper — and copied onto the
 *   visible canvas each frame with one `drawImage`.
 * - **`live`** is what moves, painted over that copy every frame.
 *
 * **Per-frame work never touches React** (the root `CLAUDE.md` rule): the loop
 * is one `requestAnimationFrame` owned by this component, its clock is a local,
 * and the only things React ever hands it are the painter and the palette —
 * which change on a theme switch, not on a frame. It runs at half rate
 * (`FRAME_MS`), because the slowest thing that moves here drifts a few pixels a
 * second and a backdrop has no business spending a frame budget the board
 * might want. It **stops off-screen** (an `IntersectionObserver`), and under
 * `prefers-reduced-motion` it paints the still and one live frame at t = 0 and
 * never starts — the room is all there, it just does not breathe.
 */
export interface DioramaPainter<P> {
  /** Everything that does not move. Called on mount, on resize and on a palette change. */
  still: (ctx: CanvasRenderingContext2D, w: number, h: number, palette: P) => void;
  /** What moves, over the still, at `seconds` since the room was mounted. */
  live?: (ctx: CanvasRenderingContext2D, w: number, h: number, seconds: number, palette: P) => void;
}

/** A backdrop is soft; 2× is already sharper than the eye resolves it. */
const MAX_RATIO = 2;
/** ~30 fps. Dust and twinkles at 60 are the same picture at twice the cost. */
const FRAME_MS = 32;

function DioramaCanvas<P>({
  painter,
  palette,
  className,
}: {
  painter: DioramaPainter<P>;
  palette: P;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;

    const still = document.createElement('canvas');
    const stillCtx = still.getContext('2d');
    if (!stillCtx) return;

    let w = 0;
    let h = 0;
    let ratio = 1;
    const born = performance.now();

    const layout = () => {
      w = el.clientWidth;
      h = el.clientHeight;
      if (!(w > 0 && h > 0)) return false;
      ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO);
      const bw = Math.max(1, Math.round(w * ratio));
      const bh = Math.max(1, Math.round(h * ratio));
      /* Assigning a canvas's size clears and reallocates it even when the value
         is unchanged, so only on a real change. */
      if (el.width !== bw) el.width = bw;
      if (el.height !== bh) el.height = bh;
      still.width = bw;
      still.height = bh;
      stillCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
      stillCtx.clearRect(0, 0, w, h);
      painter.still(stillCtx, w, h, palette);
      return true;
    };

    const paint = (seconds: number) => {
      if (!(w > 0 && h > 0)) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.drawImage(still, 0, 0);
      if (painter.live) {
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        painter.live(ctx, w, h, seconds, palette);
      }
    };

    const now = () => (reduced ? 0 : (performance.now() - born) / 1000);

    layout();
    paint(now());

    /* A still that letters its wallpaper is painted before the bundled face has
       necessarily arrived, and nothing else would ever repaint it — so once,
       when the fonts settle. */
    let gone = false;
    void document.fonts?.ready.then(() => {
      if (!gone && layout()) paint(now());
    });

    const resize =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            if (layout()) paint(now());
          });
    resize?.observe(el);

    if (reduced || !painter.live) {
      return () => {
        gone = true;
        resize?.disconnect();
      };
    }

    let raf = 0;
    let last = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (t - last < FRAME_MS) return;
      last = t;
      paint((t - born) / 1000);
    };
    const run = (on: boolean) => {
      if (on && raf === 0) raf = requestAnimationFrame(frame);
      else if (!on && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const seen =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => run(entry.isIntersecting));
    if (seen) seen.observe(el);
    else run(true);

    return () => {
      gone = true;
      resize?.disconnect();
      seen?.disconnect();
      run(false);
    };
  }, [painter, palette, reduced]);

  return <canvas ref={canvas} className={className} aria-hidden />;
}

/** `memo` loses the generic; this puts it back. */
export const Diorama = memo(DioramaCanvas) as typeof DioramaCanvas;
