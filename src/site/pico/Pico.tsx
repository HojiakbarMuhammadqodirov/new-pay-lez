/**
 * Pico in the DOM — result cards, headers, empty states, panels.  ── API ──
 *
 * Both components render one small `<canvas>` and draw it with `drawPico`, the
 * same call a canvas game makes, so the bird in a card and the bird in a game
 * are one drawing at two sizes rather than two drawings that have to be kept
 * alike. (An inline SVG would have been the other honest choice; it would also
 * have been a second renderer of the same paths.)
 *
 * ```tsx
 * import { AnimatedPico, Pico } from '../pico';
 *
 * <Pico size={64} />                                // standing, side view
 * <Pico size={24} pose="badge" />                   // front head, for icons
 * <Pico size={96} pose="sad" facing={-1} />         // facing left
 * <Pico size={90} tint={theme.primary} />           // one-colour silhouette
 * <AnimatedPico size={120} pose="happy" label="Pico" />
 * ```
 *
 * `Pico` holds no animation: it repaints when a prop changes and not
 * otherwise, which is what a static card wants. `AnimatedPico` looks after
 * itself — it blinks every few seconds, bobs while standing and beats its wing
 * in `'flap'` — and none of that goes through React state: one shared
 * `requestAnimationFrame` clock (`stage.ts`) paints the canvas directly, the
 * load-bearing rule in the root `CLAUDE.md`. It stops when scrolled out of
 * view, and under `prefers-reduced-motion` it draws its pose once and holds.
 *
 * Leave `size` out to fill the parent's box instead (letter-boxed, as the
 * app's widget does with a null size); the canvas then follows the box with a
 * `ResizeObserver`.
 */
import { memo, useLayoutEffect, useRef, type CSSProperties, type RefObject } from 'react';
import { useReducedMotion } from '../../components/GlobeHero/hooks/useReducedMotion';
import { PICO_MOTION } from './config';
import { PICO_BRAND, picoMono, type PicoPalette } from './palette';
import { onEveryFrame, paintStage, picoBlinkAt, picoSinkAt, type PicoLook } from './stage';
import type { PicoFacing, PicoPose } from './types';

interface PicoBaseProps {
  /** The square box in CSS pixels. Omit to fill the parent's box. */
  size?: number;
  /** Default `'idle'`. */
  pose?: PicoPose;
  /** `1` (default) faces right, `-1` left. */
  facing?: PicoFacing;
  /** Radians about the body; positive is nose down in either facing. */
  tilt?: number;
  /** Draw Pico in shades of this one hex colour (`picoMono`). Wins over `palette`, as in the app. */
  tint?: string;
  /** Default `PICO_BRAND`. */
  palette?: PicoPalette;
  /** Announced by a screen reader. Omit and Pico is decorative (`aria-hidden`). */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

export interface PicoProps extends PicoBaseProps {
  /** Wing beats, read by `'flap'` only; see `DrawPicoOptions.flap`. Default 0.5. */
  flap?: number;
  /** 0 open … 1 shut (`true` is 1). Default open. */
  blink?: number | boolean;
}

export interface AnimatedPicoProps extends PicoBaseProps {
  /** Wing beats a second in `'flap'`. Default `PICO_MOTION.beatsPerSecond` (3). */
  beatsPerSecond?: number;
}

interface Box {
  w: number;
  h: number;
}

/**
 * The CSS box the canvas is drawn for, kept in a ref: a fixed `size`, or the
 * measured box when filling the parent. A resize calls `repaint` directly —
 * re-rendering React to redraw a canvas would be the long way round.
 */
function useBox(
  canvas: RefObject<HTMLCanvasElement | null>,
  size: number | undefined,
  repaint: RefObject<() => void>,
): RefObject<Box> {
  const box = useRef<Box>({ w: size ?? 0, h: size ?? 0 });
  useLayoutEffect(() => {
    const el = canvas.current;
    if (size !== undefined || !el) {
      box.current.w = box.current.h = size ?? 0;
      return;
    }
    box.current.w = el.clientWidth;
    box.current.h = el.clientHeight;
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      box.current.w = entry.contentRect.width;
      box.current.h = entry.contentRect.height;
      repaint.current();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [canvas, size, repaint]);
  return box;
}

function canvasStyle(size: number | undefined, style: CSSProperties | undefined): CSSProperties {
  const side = size ?? '100%';
  return { display: 'block', width: side, height: side, ...style };
}

function a11y(label: string | undefined) {
  return label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true };
}

/** Pico, drawn once per change of its props. */
export const Pico = memo(function Pico({
  size,
  pose = 'idle',
  flap = 0.5,
  blink = 0,
  facing = 1,
  tilt = 0,
  tint,
  palette,
  label,
  className,
  style,
}: PicoProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const repaint = useRef<() => void>(() => {});
  const box = useBox(canvas, size, repaint);
  const colours = tint ? picoMono(tint) : (palette ?? PICO_BRAND);

  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const look: PicoLook = { pose, flap, blink, facing, tilt, palette: colours };
    repaint.current = () => paintStage(el, box.current.w, box.current.h, look);
    repaint.current();
    // `size` is listed though the closure reads `box`: the box is a ref, so a
    // new size would otherwise leave the old drawing at the new dimensions.
  }, [box, size, pose, flap, blink, facing, tilt, colours]);

  return (
    <canvas ref={canvas} className={className} style={canvasStyle(size, style)} {...a11y(label)} />
  );
});

/** Pico that blinks, bobs and beats on its own. */
export const AnimatedPico = memo(function AnimatedPico({
  size,
  pose = 'idle',
  beatsPerSecond = PICO_MOTION.beatsPerSecond,
  facing = 1,
  tilt = 0,
  tint,
  palette,
  label,
  className,
  style,
}: AnimatedPicoProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const repaint = useRef<() => void>(() => {});
  const box = useBox(canvas, size, repaint);
  const reduced = useReducedMotion();
  const colours = tint ? picoMono(tint) : (palette ?? PICO_BRAND);
  /*
   * When this bird's clock started, set back by a random share of the loop so
   * a row of them mounted together does not blink in unison — a dozen eyes
   * shutting on the same frame reads as a glitch, not as birds. Kept across
   * prop changes so a pose change does not restart the bob mid-sink.
   */
  const epoch = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    if (epoch.current === null) {
      epoch.current = performance.now() - Math.random() * PICO_MOTION.loop * 1000;
    }
    const born = epoch.current;
    const look: PicoLook = { pose, flap: 0, blink: 0, facing, tilt, palette: colours };

    if (reduced) {
      // The pose stays and the life stops: eyes open, wing mid-stroke (the
      // app's stopped controller), standing at rest.
      repaint.current = () => paintStage(el, box.current.w, box.current.h, look);
      repaint.current();
      return;
    }

    const frame = (now: number) => {
      const seconds = (now - born) / 1000;
      look.flap = seconds * beatsPerSecond;
      look.blink = picoBlinkAt(seconds);
      paintStage(el, box.current.w, box.current.h, look, picoSinkAt(seconds, pose, look.flap));
    };
    repaint.current = () => frame(performance.now());
    repaint.current();

    let stop: (() => void) | null = null;
    const run = (on: boolean) => {
      if (on && !stop) stop = onEveryFrame(frame);
      else if (!on && stop) {
        stop();
        stop = null;
      }
    };
    if (typeof IntersectionObserver === 'undefined') {
      run(true);
      return () => run(false);
    }
    const observer = new IntersectionObserver(([entry]) => run(entry.isIntersecting), {
      rootMargin: PICO_MOTION.rootMargin,
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      run(false);
    };
  }, [box, size, pose, beatsPerSecond, facing, tilt, colours, reduced]);

  return (
    <canvas ref={canvas} className={className} style={canvasStyle(size, style)} {...a11y(label)} />
  );
});
