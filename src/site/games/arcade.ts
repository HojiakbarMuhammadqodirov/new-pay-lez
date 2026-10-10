/**
 * The five arcade games' rules, written again for the browser.
 *
 * `server/domain/arcade.ts` is the authority and this is its copy — the two
 * programs share no code. What has to agree exactly is what the server checks:
 *
 * - **Snake's step** is replayed by the server from the turns this screen
 *   reports, so a tick here and a tick there must do the same thing to the
 *   same board, or the server would score a different game from the one the
 *   player saw. `npm run verify` and `verify:api` pin the same cases on both.
 * - **Canon Numbers is not here any more.** The web game is a real-time maths
 *   shooter whose rules are `cannon/config.ts` and `cannon/goals.ts`, and it is
 *   reported like the physics games. The server still holds the old turn-based
 *   board for the Flutter app (`cannonFire` in `server/domain/arcade.ts`); the
 *   browser never plays it, so its copy was removed rather than left to rot.
 * - **The three physics games** draw the level the server dealt (bricks,
 *   platforms, chain) and report what happened; their physics live in their
 *   components, except Doodle Jump's, which is here so `npm run verify` can fly
 *   it at any frame rate and get the same climb.
 *
 * ## Every round ends
 *
 * Each game's round has a definite end, and the latest it can come is
 * `roundSeconds` in the server's `ARCADE_ECONOMY` table — mirrored below as
 * `…_ROUND_…` and held to it by `npm run verify`. The clock is always the
 * **game's own** (ticks played, fixed steps taken), never the wall clock: it
 * stops with the game when the tab is hidden, the screen's countdown and the
 * game agree to the frame, and the server — which measures real elapsed time,
 * never less — has no reason to clamp a round for having paused.
 *
 * Offline — the demo accounts and a dead backend — the levels come from
 * `localRng` instead, which is `Math.random` behind the same `n → uint32` shape.
 */

export type Rng = (n: number) => number;

/** `Math.random` in the seeded generators' shape, for a round with no server. */
export const localRng: Rng = () => Math.floor(Math.random() * 0x1_0000_0000);

/* ══════════════════════════════════════════════════════════════════ Snake ══ */

export const SNAKE_COLS = 16;
export const SNAKE_ROWS = 16;
export const SNAKE_FOOD_LIST = 512;

/** 0 up, 1 right, 2 down, 3 left. */
export type Dir = 0 | 1 | 2 | 3;
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export const snakeTickMs = (eaten: number): number => Math.max(70, 140 - eaten * 3);

/**
 * The round: 90 seconds of the game's own clock — the ticks played, `ms` —
 * after which the next tick is not taken. `ARCADE_ECONOMY.snake.roundSeconds`
 * on the server, which sends it as `content.roundMs` and replays to it; this is
 * the offline round's copy and the fallback for a server that did not send one.
 */
export const SNAKE_ROUND_MS = 90_000;

/** Exactly the server's `snakeOutOfTime`: the next tick would end past the clock. */
export const snakeOutOfTime = (state: { ms: number; eaten: number }, limitMs: number): boolean =>
  state.ms + snakeTickMs(state.eaten) > limitMs;

export const snakeFoods = (rng: Rng): number[] =>
  Array.from({ length: SNAKE_FOOD_LIST }, (_, n) => rng(n) % (SNAKE_COLS * SNAKE_ROWS));

export interface SnakeState {
  body: number[];
  dir: Dir;
  food: number;
  next: number;
  eaten: number;
  tick: number;
  ms: number;
  dead: boolean;
}

function placeFood(list: number[], from: number, body: number[]): { food: number; next: number } {
  for (let k = 0; k < list.length; k += 1) {
    const cell = list[(from + k) % list.length];
    if (!body.includes(cell)) return { food: cell, next: from + k + 1 };
  }
  return { food: -1, next: from };
}

export function snakeStart(list: number[]): SnakeState {
  const row = Math.floor(SNAKE_ROWS / 2);
  const body = [row * SNAKE_COLS + 6, row * SNAKE_COLS + 5, row * SNAKE_COLS + 4];
  const placed = placeFood(list, 0, body);
  return { body, dir: 1, food: placed.food, next: placed.next, eaten: 0, tick: 0, ms: 0, dead: false };
}

/** One tick — exactly the server's `snakeStep`. */
export function snakeStep(state: SnakeState, list: number[], turn?: Dir): SnakeState {
  if (state.dead) return state;
  let dir = state.dir;
  if (turn !== undefined && (turn + 2) % 4 !== state.dir) dir = turn;
  const head = state.body[0];
  const x = (head % SNAKE_COLS) + DX[dir];
  const y = Math.floor(head / SNAKE_COLS) + DY[dir];
  const ms = state.ms + snakeTickMs(state.eaten);
  if (x < 0 || y < 0 || x >= SNAKE_COLS || y >= SNAKE_ROWS) {
    return { ...state, dir, tick: state.tick + 1, ms, dead: true };
  }
  const cell = y * SNAKE_COLS + x;
  const eats = cell === state.food;
  const blocking = eats ? state.body : state.body.slice(0, -1);
  if (blocking.includes(cell)) return { ...state, dir, tick: state.tick + 1, ms, dead: true };
  const body = [cell, ...(eats ? state.body : state.body.slice(0, -1))];
  if (!eats) return { ...state, body, dir, tick: state.tick + 1, ms };
  const placed = placeFood(list, state.next, body);
  return {
    ...state,
    body,
    dir,
    food: placed.food,
    next: placed.next,
    eaten: state.eaten + 1,
    tick: state.tick + 1,
    ms,
    dead: placed.food === -1,
  };
}

/** Rulebook-scale performance for a snake round: 4 a food, so 25 is perfect. */
export const SNAKE_PER_FOOD = 4;
export const SNAKE_PERFECT = Math.ceil(100 / SNAKE_PER_FOOD);

/* ═══════════════════════════════════════════════════════════════ Breakout ══ */

export const BREAKOUT_COLS = 8;
export const BREAKOUT_ROWS = 5;

export function breakoutWall(rng: Rng): number[] {
  return Array.from({ length: BREAKOUT_COLS * BREAKOUT_ROWS }, (_, i) => {
    const row = Math.floor(i / BREAKOUT_COLS);
    return rng(i) % 100 < 50 - row * 10 ? 2 : 1;
  });
}

/**
 * Bounce Ball's clock, in seconds of play. The rulebook's ends stay — the one
 * ball lost, or the wall cleared — and this is the third, for a ball caught in
 * a loop that would otherwise never come down. Long because a whole wall is
 * slow: a flawless, aiming autopilot needs 108–150 s (see the `breakout` row).
 */
export const BREAKOUT_ROUND_SECONDS = 150;

/* ═════════════════════════════════════════════════════════════ Doodle Jump ══ */

export const DOODLE_PLATFORMS = 400;
export const DOODLE_PER_PLATFORM = 2;
export const DOODLE_PERFECT = Math.ceil(100 / DOODLE_PER_PLATFORM);
/**
 * The climb's clock, in seconds of play. The website's level ends at the
 * summit — platform `DOODLE_PERFECT`, the perfect round — and landing on it
 * ends the round won; a fall ends it as before, and this ends a climber who
 * stopped climbing (bouncing on one platform, or on the floor, for ever). An
 * autopilot reaches the summit in 36–42 s, so 90 leaves a careful hand room.
 */
export const DOODLE_ROUND_SECONDS = 90;

export const doodlePlatforms = (rng: Rng): number[] =>
  Array.from({ length: DOODLE_PLATFORMS }, (_, n) => (rng(n) % 1000) / 1000);

/**
 * Platform `n`'s height above the floor, in field heights. The gap widens with
 * height — 0.15 of the field at the bottom to 0.26 by the hundredth — so the
 * climb gets harder the way the original's does, without a second random draw.
 */
export const doodleGap = (n: number): number => 0.15 + Math.min(0.11, n * 0.0011);
export function doodleHeights(count: number): number[] {
  const heights: number[] = [];
  let y = 0.12;
  for (let n = 0; n < count; n += 1) {
    heights.push(y);
    y += doodleGap(n);
  }
  return heights;
}

/**
 * Doodle Jump's physics, as a fixed-step integrator.
 *
 * It used to step once per animation frame, and that made the climb depend on
 * the screen: semi-implicit Euler at a frame's `dt` peaks lower the longer the
 * frame — 0.309 of the field at 60 Hz, 0.295 at 25 Hz, against the 0.32 the
 * constants promise — so a phone dropping frames jumped measurably lower than
 * a 144 Hz monitor, over gaps that open to 0.26. The Flutter app had already
 * fixed this (`pico_jump.dart` steps a fixed 1/120 s and carries the
 * remainder), and these are its numbers and its integrator, step for step, so
 * the two clients fly the same arc at any frame rate. A frame longer than
 * `maxFrame` is not integrated in one go: a tab coming back from the
 * background resumes rather than leaping.
 *
 * Field units: `x` in field widths (0..1, wrapping), `y` in field heights.
 */
export const DOODLE = {
  gravity: 2.6,
  /** A bounce rises this far — above the widest gap, so every platform is reachable. */
  peak: 0.32,
  platformW: 0.2,
  jumperW: 0.09,
  /** Sideways speed at full steer, field widths a second. */
  drift: 1.4,
  /** The camera keeps the jumper this far above the bottom of the view. */
  cameraLead: 0.45,
  /** How far below the view the jumper may drop before the round is over. */
  fallMargin: 0.08,
  step: 1 / 120,
  maxFrame: 0.04,
} as const;
export const DOODLE_JUMP_SPEED = Math.sqrt(2 * DOODLE.gravity * DOODLE.peak);

/** How a climb ended: off the bottom, on the summit, or out of time. */
export type DoodleEnd = 'fell' | 'summit' | 'time';

export interface DoodleState {
  x: number;
  y: number;
  vy: number;
  /** The bottom of the view, in field heights. It only rises. */
  camera: number;
  /** The highest platform stood on, as a count (index + 1) — the report. */
  reached: number;
  /** Fixed steps taken: the round's clock is `steps × DOODLE.step`. */
  steps: number;
  carry: number;
  end: DoodleEnd | null;
}

export const doodleStart = (): DoodleState => ({
  x: 0.5,
  y: 0,
  vy: DOODLE_JUMP_SPEED,
  camera: 0,
  reached: 0,
  steps: 0,
  carry: 0,
  end: null,
});

/** Platform `x` (0..1 as dealt) as the centre of a platform kept inside the field. */
export const doodleCentre = (x: number): number => DOODLE.platformW / 2 + x * (1 - DOODLE.platformW);

/** The finger rule: full steer toward `target`, proportional near it, still inside a dead zone. */
export function doodleSteerToward(x: number, target: number): number {
  const gap = target - x;
  return Math.abs(gap) < 0.01 ? 0 : Math.max(-1, Math.min(1, gap * 8));
}

/** Seconds of climbing so far. */
export const doodleTime = (state: DoodleState): number => state.steps * DOODLE.step;

/**
 * Advance the climb by a frame of `dt` seconds at `steer` (−1..1), in as many
 * fixed steps as are owed. `centres` and `heights` are the level — the website
 * passes the first `summit` platforms, so the level visibly ends at the top —
 * and `limits` the two ends that are not a fall. Mutates `state`: it is the
 * per-frame object a ref holds, and a loop at 120 steps a second should not
 * allocate.
 */
export function doodleAdvance(
  state: DoodleState,
  dt: number,
  steer: number,
  centres: readonly number[],
  heights: readonly number[],
  limits: { summit: number; seconds: number },
): void {
  if (state.end) return;
  state.carry += Math.min(DOODLE.maxFrame, Math.max(0, dt));
  const lastStep = Math.round(limits.seconds / DOODLE.step);
  while (state.carry >= DOODLE.step && !state.end) {
    state.carry -= DOODLE.step;
    doodleStep(state, steer, centres, heights);
    if (state.reached >= limits.summit) state.end = 'summit';
    else if (state.y < state.camera - DOODLE.fallMargin) state.end = 'fell';
    else if (state.steps >= lastStep) state.end = 'time';
  }
}

/** One fixed step — `pico_jump.dart`'s `step`, line for line. */
function doodleStep(state: DoodleState, steer: number, centres: readonly number[], heights: readonly number[]): void {
  const h = DOODLE.step;
  state.steps += 1;
  const dx = Math.max(-1, Math.min(1, steer));
  state.x += dx * DOODLE.drift * h;
  /* Off one edge is on at the other. */
  if (state.x < 0) state.x += 1;
  if (state.x > 1) state.x -= 1;

  const before = state.y;
  state.vy -= DOODLE.gravity * h;
  state.y += state.vy * h;

  /* Landing: only on the way down, through a platform's top, inside its width. */
  if (state.vy < 0) {
    if (before >= 0 && state.y <= 0 && state.camera < 0.05) {
      state.y = 0;
      state.vy = DOODLE_JUMP_SPEED;
    }
    const reach = (DOODLE.platformW + DOODLE.jumperW) / 2;
    for (let n = 0; n < heights.length; n += 1) {
      const top = heights[n];
      if (top > before) break;
      if (state.y > top || before < top) continue;
      if (Math.abs(state.x - centres[n]) > reach) continue;
      state.y = top;
      state.vy = DOODLE_JUMP_SPEED;
      if (n + 1 > state.reached) state.reached = n + 1;
      break;
    }
  }
  state.camera = Math.max(state.camera, state.y - DOODLE.cameraLead);
}

/* ════════════════════════════════════════════════════════════════════ Zuma ══ */

export const ZUMA_COLORS = 4;
export const ZUMA_CHAIN = 60;
export const ZUMA_SHOTS = 300;

export function zumaChain(rng: Rng): number[] {
  const chain: number[] = [];
  for (let n = 0; chain.length < ZUMA_CHAIN; n += 1) {
    const color = rng(n) % ZUMA_COLORS;
    const k = chain.length;
    if (k >= 2 && chain[k - 1] === color && chain[k - 2] === color) continue;
    chain.push(color);
  }
  return chain;
}

export const zumaShots = (rng: Rng): number[] =>
  Array.from({ length: ZUMA_SHOTS }, (_, n) => rng(10_000 + n) % ZUMA_COLORS);

/**
 * Zuma's clock, in seconds of play — a backstop rather than the end. The hole is
 * the end (~73 s for a chain left alone); but clearing the front pulls the chain
 * back, and nothing else stops a player doing that for ever. Two minutes is past
 * every round an aiming autopilot played to the hole (60–92 s).
 */
export const ZUMA_ROUND_SECONDS = 120;
/** The fixed step the chain and the shot move in — the app's (`picuma.dart`). */
export const ZUMA_STEP = 1 / 60;

/* ═══════════════════════════════════════════════════════════ the scale ══ */

/**
 * The rulebook's points for a performance, for a round played with no server —
 * the master formula's base, with nothing on top (the server adds the bonuses
 * it can vouch for). A server round's points are the server's.
 */
export function arcadePoints(performance: number): number {
  if (performance <= 0) return 0;
  return Math.max(2, Math.round((Math.min(100, performance) / 100) * 18));
}

/** Fifths of a perfect round, out of five — the result card's `correct`. */
export const arcadeMilestones = (performance: number): number =>
  Math.min(5, Math.floor((Math.max(0, performance) / 100) * 5));
