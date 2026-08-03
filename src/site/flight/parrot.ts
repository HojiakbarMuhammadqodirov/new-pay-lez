/**
 * Squawk, drawn as a table of rounded rectangles rather than a path.
 *
 * The whole sprite lives in a unit square — x and y in roughly 0..1, y down —
 * and is scaled to whatever the stage asks for at draw time. Scaling the
 * *context* rather than the numbers means the corner radii scale with the
 * shape, which is what keeps a blocky parrot blocky at every size instead of
 * turning into a pill on a phone and a brick on a monitor.
 *
 * There are exactly four style slots and they map onto the site's two colours:
 * a body, the same accent held back for soft interior shapes, the ink that
 * already pairs with an accent fill, and the page itself for the eye. Adding a
 * fifth would be adding a third hue to a two-colour site, so `verify-geo.ts`
 * asserts the set — this is the sort of rule that erodes one innocent commit at
 * a time.
 */
import { FLIGHT } from './config';

export type PartStyle = 'body' | 'soft' | 'ink' | 'eye';

/** The sanctioned set, exported so the verify pass can hold the line on it. */
export const PART_STYLES: readonly PartStyle[] = ['body', 'soft', 'ink', 'eye'];

export interface ParrotPart {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Corner radius, clamped to half the shorter side at draw time. */
  r: number;
  style: PartStyle;
}

/**
 * Back to front. The wing is not in here — it is one rect rotated about a
 * shoulder, below — and it is drawn after index `WING.after`.
 */
export const PARROT_PARTS: readonly ParrotPart[] = [
  { x: -0.28, y: 0.4, w: 0.32, h: 0.22, r: 0.05, style: 'body' }, // tail block
  { x: 0.02, y: 0.22, w: 0.66, h: 0.64, r: 0.1, style: 'body' }, // body
  { x: 0.1, y: 0.52, w: 0.5, h: 0.32, r: 0.08, style: 'soft' }, // belly
  { x: 0.3, y: 0.84, w: 0.22, h: 0.08, r: 0.02, style: 'ink' }, // feet
  { x: 0.46, y: 0.02, w: 0.46, h: 0.44, r: 0.11, style: 'body' }, // head
  { x: 0.56, y: -0.16, w: 0.09, h: 0.2, r: 0.02, style: 'body' }, // crest, back
  { x: 0.7, y: -0.22, w: 0.09, h: 0.26, r: 0.02, style: 'body' }, // crest, front
  { x: 0.66, y: 0.14, w: 0.24, h: 0.22, r: 0.06, style: 'soft' }, // cheek patch
  { x: 0.88, y: 0.18, w: 0.2, h: 0.15, r: 0.03, style: 'ink' }, // beak, upper
  { x: 0.88, y: 0.31, w: 0.13, h: 0.08, r: 0.02, style: 'ink' }, // beak, lower
  { x: 0.72, y: 0.12, w: 0.1, h: 0.1, r: 0.02, style: 'eye' }, // eye
];

/**
 * The wing: one rectangle, two angles.
 *
 * Two frames as two rect lists would let a tuning change leave the up-stroke a
 * different size from the down-stroke, and nobody would notice until the
 * animation started breathing. One rect pivoted twice cannot drift.
 */
export const WING = {
  /** Shoulder, in unit space — the wing swings its far tip, not its root. */
  pivot: { x: 0.5, y: 0.36 },
  rect: { x: 0.14, y: 0.34, w: 0.38, h: 0.26, r: 0.07 },
  /** Radians about the pivot: up-stroke, then down-stroke. */
  frames: [-0.42, 0.3] as const,
  /** Drawn after this index of `PARROT_PARTS` — over the belly, under the head. */
  after: 3,
} as const;

export interface ParrotSkin {
  /** Solid accent. */
  body: string;
  /** Accent at the tone's belly alpha. */
  soft: string;
  /** Accent at the tone's wing alpha. */
  wing: string;
  /** The ink that pairs with an accent fill — beak and feet. */
  ink: string;
  /** The page's own ground, so the eye reads as a hole rather than a dot. */
  eye: string;
}

/**
 * `roundRect` by hand.
 *
 * `CanvasRenderingContext2D.roundRect` only landed in Safari 16.4, and the site
 * ships no polyfills and no third-party runtime code at all. Six lines of
 * `arcTo` is cheaper than the question.
 */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

interface DrawOptions {
  /** Centre of the sprite, in CSS pixels. */
  x: number;
  y: number;
  /** Edge of the sprite's box, in CSS pixels. */
  size: number;
  /** Body angle, radians. Pass 0 to hold level. */
  tilt: number;
  /** Which wing frame. */
  frame: 0 | 1;
}

/**
 * Paint one parrot.
 *
 * Always `source-over`, and deliberately so — the caller may be compositing the
 * rest of the scene with `lighter` on the dark theme, which is the house
 * pattern next door in `network/`. It must not apply here: the ink and the eye
 * are near-black in *both* themes, and near-black adds nothing under additive
 * blending, so the beak, the feet and the eye would simply cease to exist and
 * leave a mint blob with no face. Tone selects the alpha budget in `FLIGHT.tone`
 * and nothing else.
 */
export function drawParrot(
  ctx: CanvasRenderingContext2D,
  skin: ParrotSkin,
  { x, y, size, tilt, frame }: DrawOptions,
): void {
  const fill: Record<PartStyle, string> = {
    body: skin.body,
    soft: skin.soft,
    ink: skin.ink,
    eye: skin.eye,
  };

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(size, size);
  ctx.translate(-0.5, -0.5);

  const paint = (part: ParrotPart) => {
    ctx.fillStyle = fill[part.style];
    roundRect(ctx, part.x, part.y, part.w, part.h, part.r);
    ctx.fill();
  };

  for (let i = 0; i < PARROT_PARTS.length; i++) {
    paint(PARROT_PARTS[i]);

    if (i === WING.after) {
      ctx.save();
      ctx.translate(WING.pivot.x, WING.pivot.y);
      ctx.rotate(WING.frames[frame]);
      ctx.translate(-WING.pivot.x, -WING.pivot.y);
      ctx.fillStyle = skin.wing;
      roundRect(ctx, WING.rect.x, WING.rect.y, WING.rect.w, WING.rect.h, WING.rect.r);
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.restore();
}

/** Which wing frame at time `t` seconds; pinned to the resting stroke when calm. */
export function wingFrame(t: number, calm: boolean): 0 | 1 {
  if (calm) return 1;
  return (Math.floor(t * FLIGHT.wingHz) % 2) as 0 | 1;
}
