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
 * - **Canon Numbers' shot** only *predicts* here; the board the server answers
 *   with replaces it, new row and all.
 * - **The three physics games** draw the level the server dealt (bricks,
 *   platforms, chain) and report what happened; their physics live in their
 *   components.
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

/* ═══════════════════════════════════════════════════════════ Canon Numbers ══ */

export const CANNON_COLS = 6;
export const CANNON_ROWS = 8;
export const CANNON_TURNS = 30;
export const CANNON_PER_BLOCK = 4;
export const CANNON_PERFECT = Math.ceil(100 / CANNON_PER_BLOCK);

export const cannonShots = (turn: number): number => 3 + Math.floor(turn / 5);

export function cannonRow(rng: Rng, n: number): number[] {
  return Array.from({ length: CANNON_COLS }, (_, c) => {
    const r = rng(n * CANNON_COLS + c);
    const present = r % 100 < 45 + Math.min(30, n * 2);
    return present ? 1 + ((r >>> 8) % (2 + Math.floor(n / 3))) : 0;
  });
}

export interface CannonState {
  board: number[];
  turn: number;
  spawns: number;
  destroyed: number;
  over: boolean;
}

function spawnTop(board: number[], row: number[]): number[] {
  const next = board.slice();
  for (let c = 0; c < CANNON_COLS; c += 1) next[c] = row[c];
  return next;
}

export function cannonStart(rng: Rng): CannonState {
  let board = new Array<number>(CANNON_COLS * CANNON_ROWS).fill(0);
  board = spawnTop(board, cannonRow(rng, 0));
  board = [...new Array<number>(CANNON_COLS).fill(0), ...board.slice(0, -CANNON_COLS)];
  board = spawnTop(board, cannonRow(rng, 1));
  return { board, turn: 0, spawns: 2, destroyed: 0, over: false };
}

/** The cells each ball of a shot up `col` would hit, without moving anything. */
export function cannonHits(board: number[], col: number, turn: number): number[] {
  const scratch = board.slice();
  const hits: number[] = [];
  for (let shot = 0; shot < cannonShots(turn); shot += 1) {
    let target = -1;
    for (let r = CANNON_ROWS - 1; r >= 0; r -= 1) {
      if (scratch[r * CANNON_COLS + col] > 0) {
        target = r * CANNON_COLS + col;
        break;
      }
    }
    if (target < 0) break;
    scratch[target] -= 1;
    hits.push(target);
  }
  return hits;
}

/** One shot — exactly the server's `cannonFire`. */
export function cannonFire(state: CannonState, col: number, rng: Rng): { state: CannonState; hits: number[] } {
  const board = state.board.slice();
  const hits = cannonHits(board, col, state.turn);
  let destroyed = state.destroyed;
  for (const target of hits) {
    board[target] -= 1;
    if (board[target] === 0) destroyed += 1;
  }
  const moved = [...new Array<number>(CANNON_COLS).fill(0), ...board.slice(0, -CANNON_COLS)];
  const bottom = moved.slice(-CANNON_COLS).some((value) => value > 0);
  const lost = board.slice(-CANNON_COLS).some((value) => value > 0);
  const turn = state.turn + 1;
  const over = bottom || lost || turn >= CANNON_TURNS;
  const next = over ? moved : spawnTop(moved, cannonRow(rng, state.spawns));
  return {
    state: { board: next, turn, spawns: over ? state.spawns : state.spawns + 1, destroyed, over },
    hits,
  };
}

/* ═══════════════════════════════════════════════════════════════ Breakout ══ */

export const BREAKOUT_COLS = 8;
export const BREAKOUT_ROWS = 5;

export function breakoutWall(rng: Rng): number[] {
  return Array.from({ length: BREAKOUT_COLS * BREAKOUT_ROWS }, (_, i) => {
    const row = Math.floor(i / BREAKOUT_COLS);
    return rng(i) % 100 < 50 - row * 10 ? 2 : 1;
  });
}

/* ═════════════════════════════════════════════════════════════ Doodle Jump ══ */

export const DOODLE_PLATFORMS = 400;
export const DOODLE_PER_PLATFORM = 2;
export const DOODLE_PERFECT = Math.ceil(100 / DOODLE_PER_PLATFORM);

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
