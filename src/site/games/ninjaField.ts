/**
 * Food Ninja, as the browser plays it.
 *
 * The schedule and the physics of `server/domain/foodNinja.ts`, copied line
 * for line because `server/` and `src/` share no code — that file's header
 * has the rules and says plainly what the server can and cannot check. Here it
 * draws the round (a server round's schedule arrives in `content.flyers`; this
 * file only moves the foods along it) and deals the offline round with
 * `localRng`, which pays into the local mirror and is not ranked.
 */
export const DURATION_MS = 60_000;
/** Field heights per second², downwards. */
export const GRAVITY = 1.7;
export const LAUNCH_Y = -0.08;
export const GONE_Y = -0.16;
/** A food's radius, as a fraction of the field's width. */
export const RADIUS = 0.06;
export const KINDS = 6;
/** More than this many foods in one swipe is not a swipe. */
export const MAX_PER_SWIPE = 6;

/** The `n`th random draw, as an unsigned 32-bit integer. */
export type Rng = (n: number) => number;

export interface Flyer {
  id: number;
  kind: number;
  /** Launch time, ms from the start of the round. */
  t: number;
  x: number;
  vx: number;
  vy: number;
}

/**
 * The whole round, in launch order.
 *
 * `p` is how far through the round a wave is (0..1), and it drives both ramps:
 * a wave is 1 food at the start and up to 4 at the end, and the gap to the next
 * wave shrinks from about 1.85s to about 0.95s. Peaks are 55–90% of the field's
 * height and the drift always leans back towards the middle, so a food is never
 * thrown off the side where nobody could reach it.
 */
export function schedule(rng: Rng): Flyer[] {
  let draw = 0;
  const unit = () => rng(draw++) / 0x100000000;
  const out: Flyer[] = [];
  let t = 800;
  while (t < DURATION_MS - 1500) {
    const p = t / DURATION_MS;
    const size = 1 + Math.floor(unit() * (1 + p * 3));
    for (let k = 0; k < size; k += 1) {
      const x = 0.15 + unit() * 0.7;
      const peak = 0.55 + unit() * 0.35;
      out.push({
        id: out.length,
        kind: Math.floor(unit() * KINDS),
        t: Math.round(t + k * 140),
        x: round4(x),
        vx: round4((0.5 - x) * 0.5 + (unit() - 0.5) * 0.15),
        vy: round4(Math.sqrt(2 * GRAVITY * (peak - LAUNCH_Y))),
      });
    }
    t += 1700 - p * 900 + unit() * 300;
  }
  return out;
}

/** Four decimals: enough for a 4K screen, and a schedule that reads the same everywhere. */
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/** How long a food stays in play, in ms: from launch until it falls below `GONE_Y`. */
export function airtime(flyer: Flyer): number {
  const drop = LAUNCH_Y - GONE_Y;
  return ((flyer.vy + Math.sqrt(flyer.vy * flyer.vy + 2 * GRAVITY * drop)) / GRAVITY) * 1000;
}

/** Where a food is `ms` after the round started, or `null` when it is not in play. */
export function positionAt(flyer: Flyer, ms: number): { x: number; y: number } | null {
  const s = (ms - flyer.t) / 1000;
  if (s < 0) return null;
  const y = LAUNCH_Y + flyer.vy * s - 0.5 * GRAVITY * s * s;
  if (y < GONE_Y) return null;
  return { x: flyer.x + flyer.vx * s, y };
}

/** The offline random source: `Math.random`, as an unsigned 32-bit draw. */
export const localRng: Rng = () => Math.floor(Math.random() * 0x100000000);
