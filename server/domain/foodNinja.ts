/**
 * Food Ninja — foods thrown up into the air, sliced with a swipe.
 *
 * ## What the server can and cannot know
 *
 * This is the one action game besides the flight, and it shares the flight's
 * limit: whether a finger *really* crossed a food is a fact about the screen,
 * which no server sees. So this file does what can be done honestly and says
 * where it stops:
 *
 * - **The round is the server's.** Which foods fly, when, from where and how
 *   high is `schedule(rng)` — a pure function of a seed that stays here (see
 *   `games.ts`). The client is given the schedule so it can draw it, and that is
 *   all it is given.
 * - **A slice is checked against it.** Each id may be sliced once, only while
 *   that food is actually in the air by the **server's** clock (measured from
 *   the round's `start` event, with slack for the network), and never more than
 *   `MAX_PER_SWIPE` in one swipe. Nothing a client sends can score a food that
 *   was never thrown, or one that had already fallen.
 * - **What it cannot stop** is a client claiming every food it was thrown. That
 *   is bounded by the schedule — the score can never exceed the foods in it — and
 *   it is the same bound the flight's `cleared` has. Stated here rather than
 *   discovered.
 *
 * ## The round
 *
 * Sixty seconds, no bombs. Foods come in waves of one to four, launched from the
 * bottom of the field on a parabola; waves get bigger and closer together as the
 * round goes on. Scored per the rulebook's single scale: two points of
 * performance a food, so 50 foods is a perfect round (`CONFIG.games`).
 *
 * The field is a unit square: `x` 0..1 left to right, `y` 0 at the bottom edge
 * and 1 at the top. A food is launched from just below the bottom (`LAUNCH_Y`)
 * and is in play until it falls back below `GONE_Y`.
 *
 * The browser has this file's schedule and physics copied in
 * `src/site/games/ninjaField.ts`, for the offline round and for drawing; the two
 * share no code, and `npm run verify` checks they deal the same round from the
 * same source.
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
