/**
 * The flight game's maths, with no canvas and no React in it.
 *
 * Split out for the same reason `auth/player.ts` is: `npm run verify` can then
 * check the physics and the collisions headlessly, and the frame-rate
 * independence check in particular is one no amount of playing would catch —
 * a game that is subtly easier on a 144Hz monitor looks fine on every machine
 * you own.
 *
 * Units are world units and seconds throughout; see the header of `config.ts`.
 */
import { FLIGHT } from './config';

export interface Bird {
  /** Vertical position, 0 at the ceiling, `worldHeight` at the floor. */
  y: number;
  /** Vertical velocity, world units per second. Negative is upward. */
  vy: number;
}

export interface Pipe {
  /** Left edge of the column. Decreases as the world scrolls past. */
  x: number;
  /** Centre of the hole. */
  gapY: number;
  /** Whether this column has already paid out. */
  scored: boolean;
}

/**
 * Advance the bird by `dt`.
 *
 * The position uses `vy·dt + ½g·dt²` rather than the semi-implicit `vy += g·dt`
 * then `y += vy·dt` that the node web gets away with. For constant acceleration
 * the quadratic form is *exact* at any step size, and that is the whole point:
 * with the cheap form the apex of a flap depends on the frame rate — measurably
 * higher at 20fps than at 240fps — so the same numbers would produce a
 * different game on every machine. Drift in a drifting backdrop is invisible;
 * drift in a hitbox is the game.
 *
 * The terminal-velocity clamp is applied after the step, so it costs exactness
 * only while falling at full speed, which is nowhere near the apex the tuning
 * is set by.
 */
export function stepBird(bird: Bird, dt: number): Bird {
  const y = bird.y + bird.vy * dt + 0.5 * FLIGHT.gravity * dt * dt;
  const vy = Math.min(bird.vy + FLIGHT.gravity * dt, FLIGHT.maxFall);
  return { y, vy };
}

/** A flap replaces the vertical velocity rather than adding to it — otherwise
 *  a fast tapper accumulates upward speed and flies straight off the ceiling. */
export function flap(bird: Bird): Bird {
  return { y: bird.y, vy: FLIGHT.flap };
}

/** The band a gap's centre may sit in, clear of both rails. */
export function gapBand(): { min: number; max: number } {
  const half = FLIGHT.pipe.gap / 2;
  return {
    min: FLIGHT.pipe.margin + half,
    max: FLIGHT.worldHeight - FLIGHT.pipe.margin - half,
  };
}

/**
 * Where a new gap's centre may sit.
 *
 * `rand` is injected rather than reaching for `Math.random` so the generator can
 * be swept exhaustively in the verify pass.
 *
 * `previous` is the gap before this one, and passing it is what keeps a course
 * flyable: the new centre is drawn from the legal band narrowed to what a bird
 * can actually reach in one interval (`pipe.maxStep`). Without it the generator
 * eventually deals a full-band jump upward, which no amount of flapping answers
 * — a course that cannot be flown reads as the game cheating, not as a hard
 * course, and it is the difference between losing and being beaten.
 */
export function gapCentre(rand: number, previous?: number): number {
  const band = gapBand();
  let min = band.min;
  let max = band.max;

  if (previous !== undefined) {
    min = Math.max(min, previous - FLIGHT.pipe.maxStep);
    max = Math.min(max, previous + FLIGHT.pipe.maxStep);
  }

  return min + rand * (max - min);
}

/** A fresh column entering at `x`, reachable from the one before it. */
export function spawnPipe(x: number, rand: number, previous?: number): Pipe {
  return { x, gapY: gapCentre(rand, previous), scored: false };
}

/** Circle against axis-aligned rectangle, by closest point. */
function circleHitsRect(
  cx: number,
  cy: number,
  r: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  const nearestX = Math.max(rx, Math.min(cx, rx + rw));
  const nearestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy < r * r;
}

/**
 * Does the bird touch this column?
 *
 * A circle rather than a box, because the corner of a gap is where almost every
 * near miss happens: a box hitbox clips a corner the player can see daylight
 * through, and that single frame is what people mean when they call a game like
 * this unfair.
 */
export function hits(birdX: number, bird: Bird, pipe: Pipe): boolean {
  const { width, gap } = FLIGHT.pipe;
  const r = FLIGHT.bird.radius;
  const gapTop = pipe.gapY - gap / 2;
  const gapBottom = pipe.gapY + gap / 2;

  /* The two columns are extended past the rails so a bird clipping the ceiling
     inside a column registers against the column rather than slipping over it. */
  const over = FLIGHT.worldHeight;
  return (
    circleHitsRect(birdX, bird.y, r, pipe.x, -over, width, over + gapTop) ||
    circleHitsRect(birdX, bird.y, r, pipe.x, gapBottom, width, over)
  );
}

/** The floor and the ceiling, which end a run exactly as a column does. */
export function hitsBounds(bird: Bird): boolean {
  const r = FLIGHT.bird.radius;
  return bird.y - r <= 0 || bird.y + r >= FLIGHT.worldHeight;
}

/**
 * Has the bird passed this column?
 *
 * A one-way threshold, not a window: once the trailing edge is behind the bird
 * it stays behind, so paired with the `scored` flag this pays out exactly once
 * however large the step was. A window test ("the bird is level with the gap")
 * can be jumped clean over by one long frame after a tab switch, which is a
 * free pipe or a missing point depending on which way it misses.
 */
export function crossed(pipe: Pipe, birdX: number): boolean {
  return pipe.x + FLIGHT.pipe.width < birdX;
}

/**
 * Body angle for a given vertical speed, radians. Cosmetic only — nothing in
 * the collision test reads it, which is why the sprite may lean past its hitbox.
 */
export function tiltFor(vy: number): number {
  const { up, down } = FLIGHT.bird.tilt;
  const t = Math.max(0, Math.min(1, (vy + FLIGHT.maxFall) / (2 * FLIGHT.maxFall)));
  return up + (down - up) * t;
}
