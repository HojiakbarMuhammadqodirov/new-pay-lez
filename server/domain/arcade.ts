/**
 * The five arcade games — Snake, Canon Numbers, Breakout, Doodle Jump and Zuma.
 *
 * ## Three ways of knowing a score, chosen per game
 *
 * Every game here answers one question for `games.finish` — what was this
 * round's performance, 0..100 — and they answer it as honestly as each game
 * allows, which is not equally:
 *
 * - **Snake is replayed.** It is a grid and a clock of whole ticks, so the
 *   round is a pure function of the seed's food list and the turns the player
 *   made. The client reports its turns; this file plays them again and counts
 *   what *that* game ate. A client cannot report a food it did not reach,
 *   because there is no food count in the report at all. The replay is also
 *   held to two clocks: it may not have played longer than the round lasted,
 *   and it stops at the round's own end — `roundMs` of ticks, the 90 seconds
 *   the screen counts down (`snakeOutOfTime`, the same rule on both sides).
 * - **Canon Numbers is held.** Turn-based, like 2048: the board lives in the
 *   session's secret, each shot is applied here, and the new row of blocks
 *   comes from a seed the client never sees.
 * - **Breakout, Doodle Jump and Zuma are bounded.** They are continuous
 *   physics, and whether a ball really touched a brick is a fact about the
 *   screen — the same limit Bird's Flight and Food Ninja state. The server
 *   fixes the level from the seed (which bricks, which platforms, which chain),
 *   so a report can only name things that exist, and caps the claim by what the
 *   round's own duration allows. That refuses the impossible; it does not
 *   referee the plausible, and the module says so rather than pretending.
 *
 * ## One random source, and it is the seed's
 *
 * `Rng` is `n → uint32`, an HMAC of the round's seed in `games.ts`. Nothing
 * here reads a clock or `Math.random`, so a seed always deals the same round
 * and `verify:api` can assert exact boards. The browser's copies in
 * `src/site/games/` are the same code written again (the two programs share
 * none); offline they draw from `Math.random` instead.
 */

export type Rng = (n: number) => number;

/* ══════════════════════════════════════════════════════════════════ Snake ══ */

export const SNAKE_COLS = 16;
export const SNAKE_ROWS = 16;
/** How many food cells the round's list holds; placement wraps past the end. */
export const SNAKE_FOOD_LIST = 512;
/** A turn report longer than this is not a game anybody played. */
export const SNAKE_MAX_TURNS = 5000;
export const SNAKE_MAX_TICKS = 20000;

/** 0 up, 1 right, 2 down, 3 left. */
export type Dir = 0 | 1 | 2 | 3;
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

/** A tick's length: the snake quickens as it eats, down to a floor. */
export const snakeTickMs = (eaten: number): number => Math.max(70, 140 - eaten * 3);

/**
 * Whether the round's clock has run out before the next tick: that tick would
 * end past `limitMs` of play. The round's clock is the **game's own** — the sum
 * of the ticks played, `state.ms` — not a wall clock, so the screen and this
 * replay stop on exactly the same tick however the frames fell, and a round
 * paused in a hidden tab loses none of its time. The website's copy is the
 * same line; both suites pin the tick a circling snake stops on.
 */
export const snakeOutOfTime = (state: { ms: number; eaten: number }, limitMs: number): boolean =>
  state.ms + snakeTickMs(state.eaten) > limitMs;

export const snakeFoods = (rng: Rng): number[] =>
  Array.from({ length: SNAKE_FOOD_LIST }, (_, n) => rng(n) % (SNAKE_COLS * SNAKE_ROWS));

export interface SnakeState {
  /** Cell indices, head first. */
  body: number[];
  dir: Dir;
  food: number;
  /** The next index into the food list to try. */
  next: number;
  eaten: number;
  tick: number;
  /** Milliseconds of play the ticks so far took. */
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

/**
 * One tick: turn (unless the turn is straight back), move, eat or die.
 *
 * The tail moves out of its cell in the same tick the head moves in, so
 * chasing your own tail is legal — the original game's rule — and the collision
 * test excludes the tail exactly when the snake is not about to grow.
 */
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

/**
 * Play the reported turns again.
 *
 * `turns` are `[tick, dir]` pairs — the tick a turn was applied *before*. The
 * replay stops at the first of: a crash, the reported end tick, or the point
 * where the ticks played would run past `maxMs`. The caller passes the smaller
 * of two limits there — the round's real duration plus slack, which stops a
 * client replaying a perfect run at a pace no hand could keep, and the round's
 * own clock (`roundMs`), which is where the screen's countdown ended it — so a
 * turn reported after the end is simply never played.
 */
export function snakeReplay(
  list: number[],
  turns: Array<[number, number]>,
  endTick: number,
  maxMs: number,
): { eaten: number; ticks: number; dead: boolean; ms: number } {
  const byTick = new Map<number, Dir[]>();
  for (const [tick, dir] of turns.slice(0, SNAKE_MAX_TURNS)) {
    if (!Number.isInteger(tick) || tick < 0 || ![0, 1, 2, 3].includes(dir)) continue;
    const at = byTick.get(tick) ?? [];
    at.push(dir as Dir);
    byTick.set(tick, at);
  }
  let state = snakeStart(list);
  const last = Math.min(Math.max(0, Math.floor(endTick)), SNAKE_MAX_TICKS);
  while (!state.dead && state.tick < last) {
    if (snakeOutOfTime(state, maxMs)) break;
    const asked = byTick.get(state.tick);
    /* Several turns on one tick: each is checked against the direction the one
       before it left, and the last that is legal is the one taken. */
    let turn: Dir | undefined;
    let facing = state.dir;
    for (const dir of asked ?? []) {
      if ((dir + 2) % 4 !== facing) {
        turn = dir;
        facing = dir;
      }
    }
    state = snakeStep(state, list, turn);
  }
  return { eaten: state.eaten, ticks: state.tick, dead: state.dead, ms: state.ms };
}

/* ═══════════════════════════════════════════════════════════ Canon Numbers ══ */

export const CANNON_COLS = 6;
export const CANNON_ROWS = 8;
/** A round is at most this many shots. */
export const CANNON_TURNS = 30;

/** Balls per shot: three, one more every five turns. */
export const cannonShots = (turn: number): number => 3 + Math.floor(turn / 5);

/**
 * The *n*th row of blocks. Busier and heavier as the round goes on: a block's
 * chance climbs from 45% to 75% a column, and its number's ceiling with it.
 */
export function cannonRow(rng: Rng, n: number): number[] {
  return Array.from({ length: CANNON_COLS }, (_, c) => {
    const r = rng(n * CANNON_COLS + c);
    const present = r % 100 < 45 + Math.min(30, n * 2);
    return present ? 1 + ((r >>> 8) % (2 + Math.floor(n / 3))) : 0;
  });
}

export interface CannonState {
  kind: 'cannon';
  seed: string;
  /** Row-major, row 0 at the top; 0 is an empty cell. */
  board: number[];
  /** Shots fired so far. A shot must name this number to be applied. */
  turn: number;
  /** Rows spawned so far — the next row is `cannonRow(rng, spawns)`. */
  spawns: number;
  destroyed: number;
  over: boolean;
}

function spawnTop(board: number[], row: number[]): number[] {
  const next = board.slice();
  for (let c = 0; c < CANNON_COLS; c += 1) next[c] = row[c];
  return next;
}

export function cannonStart(seed: string, rng: Rng): CannonState {
  let board = new Array<number>(CANNON_COLS * CANNON_ROWS).fill(0);
  board = spawnTop(board, cannonRow(rng, 0));
  board = [...new Array<number>(CANNON_COLS).fill(0), ...board.slice(0, -CANNON_COLS)];
  board = spawnTop(board, cannonRow(rng, 1));
  return { kind: 'cannon', seed, board, turn: 0, spawns: 2, destroyed: 0, over: false };
}

/**
 * One shot up one column, then the blocks advance and a new row arrives.
 *
 * Each ball hits the **lowest** block in the column and takes one off its
 * number; a block at zero is gone and the next ball goes on to the one above.
 * Then every block moves down a row — a block landing in the bottom row ends the
 * round — and a new row is dealt at the top.
 */
export function cannonFire(
  state: CannonState,
  col: number,
  rng: Rng,
): { state: CannonState; hits: number[] } {
  const board = state.board.slice();
  const hits: number[] = [];
  let destroyed = state.destroyed;
  for (let shot = 0; shot < cannonShots(state.turn); shot += 1) {
    let target = -1;
    for (let r = CANNON_ROWS - 1; r >= 0; r -= 1) {
      if (board[r * CANNON_COLS + col] > 0) {
        target = r * CANNON_COLS + col;
        break;
      }
    }
    if (target < 0) break;
    board[target] -= 1;
    hits.push(target);
    if (board[target] === 0) destroyed += 1;
  }
  const moved = [...new Array<number>(CANNON_COLS).fill(0), ...board.slice(0, -CANNON_COLS)];
  const bottom = moved.slice(-CANNON_COLS).some((value) => value > 0);
  /* Anything shifted past the last row is a block that reached the cannon. */
  const lost = board.slice(-CANNON_COLS).some((value) => value > 0);
  const turn = state.turn + 1;
  const over = bottom || lost || turn >= CANNON_TURNS;
  const next = over ? moved : spawnTop(moved, cannonRow(rng, state.spawns));
  return {
    state: { ...state, board: next, turn, spawns: over ? state.spawns : state.spawns + 1, destroyed, over },
    hits,
  };
}

/* ═══════════════════════════════════════════════════════════════ Breakout ══ */

export const BREAKOUT_COLS = 8;
export const BREAKOUT_ROWS = 5;

/** The wall: hit points per brick, 1 or 2, the top rows tougher. */
export function breakoutWall(rng: Rng): number[] {
  return Array.from({ length: BREAKOUT_COLS * BREAKOUT_ROWS }, (_, i) => {
    const row = Math.floor(i / BREAKOUT_COLS);
    return rng(i) % 100 < 50 - row * 10 ? 2 : 1;
  });
}

/* ═════════════════════════════════════════════════════════════ Doodle Jump ══ */

export const DOODLE_PLATFORMS = 400;

/**
 * The platforms, bottom up: each one's horizontal position, 0..1 across the
 * field. Their spacing is the client's arithmetic (it widens with height), and
 * the report is the index of the highest one the player stood on.
 */
export const doodlePlatforms = (rng: Rng): number[] =>
  Array.from({ length: DOODLE_PLATFORMS }, (_, n) => (rng(n) % 1000) / 1000);

/* ════════════════════════════════════════════════════════════════════ Zuma ══ */

export const ZUMA_COLORS = 4;
export const ZUMA_CHAIN = 60;
export const ZUMA_SHOTS = 300;

/**
 * The chain, front first, in `ZUMA_COLORS` colours, with no run longer than two
 * — a chain that arrived with three of a kind already touching would pop itself.
 */
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

/** The shooter's balls, in order. */
export const zumaShots = (rng: Rng): number[] =>
  Array.from({ length: ZUMA_SHOTS }, (_, n) => rng(10_000 + n) % ZUMA_COLORS);

/* ═════════════════════════════════════════════════════════ the report bound ══ */

/**
 * What a continuous-physics round may claim: no more than exists, and no more
 * than its duration could have produced at the fastest honest rate, plus a
 * fixed allowance for clocks and the opening seconds. Lenient on purpose — it
 * refuses the impossible rather than refereeing the plausible.
 */
export function bounded(claimed: unknown, exists: number, elapsedSeconds: number, perSecond: number, allowance: number): number {
  const asked = Math.max(0, Math.floor(Number(claimed) || 0));
  const possible = Math.floor(Math.max(0, elapsedSeconds) * perSecond) + allowance;
  return Math.min(asked, exists, possible);
}
