/**
 * The DOM side of Pico: one small canvas per bird, and the clock that keeps
 * `AnimatedPico` alive.  ── API (internal) ──
 *
 * Split from `Pico.tsx` so that file exports only components (a module mixing
 * components with anything else breaks React fast refresh — see
 * `theme/context.ts`), and so `picoBlinkAt` can be handed to canvas games,
 * which want the same blink without a component.
 */
import { PICO_MOTION } from './config';
import { drawPico, type DrawPicoOptions } from './draw';
import { PICO_BOX } from './geometry';
import type { PicoPose } from './types';

/** Everything about a DOM Pico except where it goes — the stage centres it. */
export type PicoLook = Required<Pick<DrawPicoOptions, 'pose' | 'flap' | 'blink' | 'facing' | 'tilt' | 'palette'>>;

const TAU = Math.PI * 2;

/*
 * Backing-store ceiling. Pico is flat colour with curved edges, which is the
 * case where 3× is still visibly sharper than 2× on a phone; past that it is
 * memory for nothing, and a 200px card at 4× is a 640k-pixel canvas.
 */
const MAX_RATIO = 3;

const place: DrawPicoOptions = { x: 0, y: 0, size: 0, anchor: 'box' };

/**
 * Clears `canvas` and draws one Pico letter-boxed in its `w × h` CSS box, the
 * way the app's widget letter-boxes into whatever it is given. `sink` lowers
 * the bird by that many design units (the bob).
 *
 * The backing store is resized only when the box or the display's density has
 * changed, because assigning `canvas.width` — even to its current value —
 * reallocates and clears it.
 */
export function paintStage(
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  look: PicoLook,
  sink = 0,
): void {
  if (!(w > 0 && h > 0)) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO);
  const bw = Math.max(1, Math.round(w * ratio));
  const bh = Math.max(1, Math.round(h * ratio));
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
  ctx.setTransform(bw / w, 0, 0, bh / h, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const size = Math.min(w, h);
  place.x = w / 2;
  place.y = h / 2 + (sink * size) / PICO_BOX;
  place.size = size;
  place.pose = look.pose;
  place.flap = look.flap;
  place.blink = look.blink;
  place.facing = look.facing;
  place.tilt = look.tilt;
  place.palette = look.palette;
  drawPico(ctx, place);
}

/**
 * How shut the eyes are at `seconds` on Pico's idle clock: 0 nearly always,
 * easing to 1 and back once per `PICO_MOTION.loop`. A canvas game that wants
 * its bird to blink while it waits passes `blink: picoBlinkAt(clock)`.
 */
export function picoBlinkAt(seconds: number): number {
  const { loop, blink: b } = PICO_MOTION;
  const t = ((((seconds % loop) + loop) % loop) / loop);
  if (t <= b.from || t >= b.to) return 0;
  if (t < b.shut) return (t - b.from) / (b.shut - b.from);
  if (t <= b.open) return 1;
  return (b.to - t) / (b.to - b.open);
}

/** How far the body has sunk, in design units, at `seconds` (see `PICO_MOTION`). */
export function picoSinkAt(seconds: number, pose: PicoPose, flap: number): number {
  if (pose === 'flap') {
    const phase = flap - Math.floor(flap);
    return (PICO_MOTION.lift * (1 - Math.sin(phase * TAU))) / 2;
  }
  if (pose === 'idle' || pose === 'happy' || pose === 'sad') {
    const { depth, period } = PICO_MOTION.bob;
    return (depth * (1 - Math.cos((TAU * seconds) / period))) / 2;
  }
  // A knocked-out bird does not breathe for the camera, and a badge is an icon.
  return 0;
}

/* ── one clock for every animated Pico ──────────────────────────────────── */

/*
 * A page can show a dozen Picos (a result list, a leaderboard), and a dozen
 * `requestAnimationFrame` loops are a dozen callbacks the browser schedules
 * separately. One loop, started by the first subscriber and stopped by the
 * last, costs the same for one bird as for twelve. A hidden tab needs no
 * handling: the browser stops calling `requestAnimationFrame` there itself.
 */
const subscribers = new Set<(now: number) => void>();
let raf = 0;

function tick(now: number): void {
  raf = 0;
  subscribers.forEach((fn) => fn(now));
  if (subscribers.size > 0 && raf === 0) raf = requestAnimationFrame(tick);
}

/** Calls `fn` once per display frame until the returned function is called. */
export function onEveryFrame(fn: (now: number) => void): () => void {
  subscribers.add(fn);
  if (raf === 0) raf = requestAnimationFrame(tick);
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0 && raf !== 0) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}
