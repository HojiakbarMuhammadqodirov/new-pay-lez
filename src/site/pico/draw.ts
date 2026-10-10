/**
 * `drawPico` — Pico on any 2D canvas, at any size, every frame.  ── API ──
 *
 * This is the call a canvas game makes, and the stable half of the module: it
 * owns *placement* (where, how big, which way, how tilted) and hands the
 * drawing itself to `paint.ts` in a 100×100 design box. The art behind it
 * (`palette.ts`, `geometry.ts`, `paint.ts`) is a port of the app's
 * `pico.dart` standing in for the Claude Design original, and can be swapped
 * without a caller changing a line — so long as the replacement keeps the
 * exports this file and `index.ts` read: `paintPico`, `PICO_BOX`,
 * `PICO_BODY_CENTRE`, `PICO_BODY_RADIUS`, `PICO_BRAND`, `picoMono`.
 *
 * ```ts
 * import { drawPico, picoSizeForBodyRadius } from '../pico';
 *
 * const size = picoSizeForBodyRadius(bird.r);          // body circle = hit circle
 * drawPico(ctx, { x: bird.x, y: bird.y, size, anchor: 'body',
 *                 pose: crashed ? 'hit' : 'flap', flap: clock * 3, tilt });
 * ```
 *
 * Per call it allocates nothing: the options object is the caller's (reuse
 * one if you like), and the frame handed to the painter is a module-level
 * scratch, safe because painting is synchronous.
 */
import { PICO_BODY_CENTRE, PICO_BODY_RADIUS, PICO_BOX } from './geometry';
import { paintPico, type PicoFrame } from './paint';
import { PICO_BRAND, type PicoPalette } from './palette';
import type { PicoContext, PicoFacing, PicoPose } from './types';

export { PICO_BODY_CENTRE, PICO_BODY_RADIUS, PICO_BOX };

export interface DrawPicoOptions {
  /** Where Pico goes, in the context's current units; `anchor` says which point this is. */
  x: number;
  y: number;
  /**
   * The side of the square design box, in the context's units. Everything
   * scales from it — the body's radius is `size × PICO_BODY_RADIUS / PICO_BOX`
   * (0.23 of it). `picoSizeForBodyRadius` goes the other way.
   */
  size: number;
  /**
   * What `(x, y)` names:
   * - `'box'` (default) — the centre of the square box, as the app's widget
   *   does; right for icons, cards and anything laid out by its box.
   * - `'body'` — the centre of the body, `PICO_BODY_CENTRE`; right for a game,
   *   where `(x, y)` is the hit circle's centre and the bird should sit on it
   *   whatever its pose, facing or tilt. The badge has no body and treats this
   *   as `'box'`.
   */
  anchor?: 'box' | 'body';
  /** Default `'idle'`. */
  pose?: PicoPose;
  /**
   * Wing beats, read by `'flap'` only. Only the fractional part matters, so a
   * raw `seconds × beatsPerSecond` can be passed as it is. 0.75 is the top of
   * the stroke, 0.25 the bottom; default 0.5 (mid-stroke).
   */
  flap?: number;
  /**
   * 0 open … 1 shut; `true` is 1. Between the two a lid comes down partway, so
   * a blink can be eased over a few frames. Ignored by `'happy'` and `'hit'`,
   * whose eyes are already closed or crossed.
   */
  blink?: number | boolean;
  /** `1` (default) faces right; `-1` mirrors to face left, about the body. */
  facing?: PicoFacing;
  /**
   * Radians about the body's centre (the box's, for the badge); positive is
   * nose down in *either* facing, so a game can pass its pitch without caring
   * which way the bird looks.
   */
  tilt?: number;
  /** Default `PICO_BRAND`; `picoMono(colour)` for a one-colour silhouette. */
  palette?: PicoPalette;
}

const scratch: PicoFrame = { pose: 'idle', flap: 0.5, blink: 0, palette: PICO_BRAND };

function blinkOf(blink: number | boolean | undefined): number {
  if (blink === true) return 1;
  if (typeof blink !== 'number' || !(blink > 0)) return 0;
  return blink >= 1 ? 1 : blink;
}

/**
 * Draws one frame of Pico. Leaves the context's state exactly as it found it
 * (everything happens inside one `save()`/`restore()`), so it can sit in the
 * middle of a game's own draw without disturbing its styles or transform.
 *
 * Draws in the context's current units: a game that has already scaled its
 * context for `devicePixelRatio` passes CSS pixels, and Pico is crisp.
 */
export function drawPico(ctx: PicoContext, o: DrawPicoOptions): void {
  const size = o.size;
  if (!(size > 0)) return;
  const pose = o.pose ?? 'idle';
  const mirror = o.facing === -1;
  const tilt = o.tilt ?? 0;
  const k = size / PICO_BOX;
  const half = PICO_BOX / 2;

  // The pivot, in design units from the box centre: the body in the side
  // poses, so a tilting bird turns on its weight rather than its wing (the
  // app's reasoning), and so mirroring leaves the body where it was.
  const px = pose === 'badge' ? 0 : PICO_BODY_CENTRE.x - half;
  const py = pose === 'badge' ? 0 : PICO_BODY_CENTRE.y - half;
  let cx = o.x;
  let cy = o.y;
  if (o.anchor === 'body') {
    cx -= px * k;
    cy -= py * k;
  }

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  ctx.translate(px, py);
  if (tilt !== 0 && Number.isFinite(tilt)) ctx.rotate(mirror ? -tilt : tilt);
  if (mirror) ctx.scale(-1, 1);
  ctx.translate(-px - half, -py - half);

  scratch.pose = pose;
  scratch.flap = Number.isFinite(o.flap) ? (o.flap as number) : 0.5;
  scratch.blink = blinkOf(o.blink);
  scratch.palette = o.palette ?? PICO_BRAND;
  paintPico(ctx, scratch);
  ctx.restore();
}

/**
 * The `size` whose body circle has radius `bodyRadius` — how a game makes the
 * drawn body *be* its hit circle (the app's `radius / bodyRadius × box`).
 */
export function picoSizeForBodyRadius(bodyRadius: number): number {
  return (bodyRadius / PICO_BODY_RADIUS) * PICO_BOX;
}

/** The body's radius when Pico is drawn at `size` — the inverse of the above. */
export function picoBodyRadiusAt(size: number): number {
  return (size * PICO_BODY_RADIUS) / PICO_BOX;
}
