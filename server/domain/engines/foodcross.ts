/**
 * Food Cross — rulebook §5.8, a match-3 the server replays.
 *
 * **Seeded server-side per round** (§5.8: "so a board cannot be rerolled for an
 * easy start"): `/start` hands the phone a 32-bit seed, the phone builds the
 * board and every refill from it, and `/finish` sends back the swaps. This module
 * replays them from the same seed and scores the round itself. A swap that would
 * not have matched on the board as it stood is refused, so the only move list
 * that replays is one that was playable.
 *
 * Deliberately the plainest match-3 there is — no striped sweets, no bombs, no
 * special tiles — because every rule here has to be reproduced bit-for-bit by a
 * Dart port reading a document, and each special tile is a page of edge cases.
 * What the rulebook asks for is that **4+ and 5+ matches and cascades multiply
 * the score** so a skilled player reaches the 2,000 target well inside twenty
 * moves; the run-length multiplier and the cascade-step multiplier below are
 * those two levers, and nothing else is needed for them.
 *
 * **`server/GAMES-2048-FOODCROSS.md` is the normative description**; the test
 * vectors in it were produced by running this file, and `verify.ts` replays them.
 */
import { mulberry32, type Rng } from './prng.ts';
import { ReplayError } from './replay.ts';

export { ReplayError };

/**
 * Everything that shapes a round, frozen into the session's secret at `/start`
 * and sent to the client as `content`. See `game2048.ts` for why it travels with
 * the round rather than being re-read from `CONFIG` at replay time.
 */
export interface ParamsFoodCross {
  rows: number;
  cols: number;
  /** How many kinds of food. Tiles are the integers `0..kinds-1`. */
  kinds: number;
  /** Swaps in a round. 20. */
  moves: number;
  /** The score that is performance 100. 2,000. */
  target: number;
  /** Points per tile in a run, before the run-length multiplier. */
  tilePoints: number;
  /**
   * The run-length multiplier: index 0 is a run of 3, index 1 a run of 4, and the
   * last entry applies to every longer run. `[1, 2, 3]` → 3:×1, 4:×2, 5+:×3.
   */
  runMultiplier: number[];
  /** The cascade multiplier for step `k` (1-based) is `min(k, cascadeCap)`. */
  cascadeCap: number;
}

/** One swap: the cell at (row, col) and its neighbour to the right (dir 0) or below (dir 1). */
export interface Swap {
  row: number;
  col: number;
  dir: 0 | 1;
}

export interface ResultFoodCross {
  /** Row-major, `rows × cols`, each a kind `0..kinds-1`. Row 0 is the top. */
  board: number[];
  score: number;
  moves: number;
  /** How many times a board with no legal swap was regenerated (including at the start). */
  reshuffles: number;
  /** The longest cascade any one swap produced (1 = the swap's own matches only). */
  bestCascade: number;
  draws: number;
}


/** A maximal straight line of three or more equal tiles. */
interface Run {
  cells: number[];
}

/**
 * Every run on the board: **horizontal runs first**, row by row from the top,
 * each row scanned left to right; **then vertical runs**, column by column from
 * the left, each scanned top to bottom. A run is maximal — `AAAA` is one run of
 * four, never two of three. A tile may belong to one horizontal and one vertical
 * run at once (an L, T or + shape), and then both runs score.
 *
 * Empty cells (`-1`) never form a run; the board is full whenever this is called
 * during play, so that only matters to the rule's statement.
 */
function findRuns(board: number[], p: ParamsFoodCross): Run[] {
  const runs: Run[] = [];
  for (let r = 0; r < p.rows; r += 1) {
    let c = 0;
    while (c < p.cols) {
      const v = board[r * p.cols + c];
      let end = c + 1;
      while (end < p.cols && board[r * p.cols + end] === v) end += 1;
      if (v >= 0 && end - c >= 3) {
        const cells: number[] = [];
        for (let k = c; k < end; k += 1) cells.push(r * p.cols + k);
        runs.push({ cells });
      }
      c = end;
    }
  }
  for (let c = 0; c < p.cols; c += 1) {
    let r = 0;
    while (r < p.rows) {
      const v = board[r * p.cols + c];
      let end = r + 1;
      while (end < p.rows && board[end * p.cols + c] === v) end += 1;
      if (v >= 0 && end - r >= 3) {
        const cells: number[] = [];
        for (let k = r; k < end; k += 1) cells.push(k * p.cols + c);
        runs.push({ cells });
      }
      r = end;
    }
  }
  return runs;
}

/** `tilePoints × length × runMultiplier[min(length - 3, runMultiplier.length - 1)]`. */
function runPoints(length: number, p: ParamsFoodCross): number {
  const index = Math.min(length - 3, p.runMultiplier.length - 1);
  return p.tilePoints * length * p.runMultiplier[index];
}

/** The neighbour a swap names, or -1 when it is off the board. */
function partner(s: Swap, p: ParamsFoodCross): number {
  const r = s.dir === 1 ? s.row + 1 : s.row;
  const c = s.dir === 0 ? s.col + 1 : s.col;
  if (r >= p.rows || c >= p.cols) return -1;
  return r * p.cols + c;
}

/**
 * Whether any swap on this board would match. Every cell, row-major; for each,
 * the swap right then the swap down. Swapping two equal tiles changes nothing
 * and is never legal.
 */
export function hasLegalMove(board: number[], p: ParamsFoodCross): boolean {
  for (let row = 0; row < p.rows; row += 1) {
    for (let col = 0; col < p.cols; col += 1) {
      for (const dir of [0, 1] as const) {
        const a = row * p.cols + col;
        const b = partner({ row, col, dir }, p);
        if (b < 0 || board[a] === board[b]) continue;
        [board[a], board[b]] = [board[b], board[a]];
        const matches = findRuns(board, p).length > 0;
        [board[a], board[b]] = [board[b], board[a]];
        if (matches) return true;
      }
    }
  }
  return false;
}

/**
 * Fill every cell with no ready-made match: row-major from the top-left, each
 * cell drawn with `pick(kinds)` and **redrawn** while it equals both of the two
 * cells to its left, or both of the two cells above it. Only cells already
 * placed in this fill are looked at, so the rule never peeks at the old board.
 *
 * Then, if the result has no legal swap, the **whole board is filled again the
 * same way, continuing the same stream**, until it has one. Used for the opening
 * board and for a reshuffle alike.
 */
function fillPlayable(board: number[], rng: Rng, p: ParamsFoodCross): number {
  let fills = 0;
  for (;;) {
    fills += 1;
    for (let r = 0; r < p.rows; r += 1) {
      for (let c = 0; c < p.cols; c += 1) {
        const i = r * p.cols + c;
        let v: number;
        do {
          v = rng.pick(p.kinds);
        } while (
          (c >= 2 && board[i - 1] === v && board[i - 2] === v) ||
          (r >= 2 && board[i - p.cols] === v && board[i - 2 * p.cols] === v)
        );
        board[i] = v;
      }
    }
    if (hasLegalMove(board, p)) return fills;
  }
}

/**
 * Resolve a board after a swap: clear, drop, refill, repeat until stable.
 *
 * Step `k` (1 for the swap's own matches, 2 for the first cascade, …):
 *   1. find every run; if none, stop;
 *   2. step points = the sum of `runPoints` over **every run** (an L scores both
 *      of its arms), times the cascade multiplier `min(k, cascadeCap)`;
 *   3. clear every cell in any run (a shared corner is cleared once);
 *   4. **gravity**: in each column the surviving tiles fall straight down,
 *      keeping their order, so the empties collect at the top;
 *   5. **refill**: columns left to right, and in each column the empty cells top
 *      to bottom, each drawn with `pick(kinds)` — no redraw, so a refill may
 *      itself match, and that is what a cascade is.
 */
function resolve(board: number[], rng: Rng, p: ParamsFoodCross): { gained: number; steps: number } {
  let gained = 0;
  let step = 0;
  for (;;) {
    const runs = findRuns(board, p);
    if (runs.length === 0) break;
    step += 1;
    let points = 0;
    for (const run of runs) points += runPoints(run.cells.length, p);
    gained += points * Math.min(step, p.cascadeCap);
    for (const run of runs) for (const cell of run.cells) board[cell] = -1;

    for (let c = 0; c < p.cols; c += 1) {
      let write = p.rows - 1;
      for (let r = p.rows - 1; r >= 0; r -= 1) {
        const v = board[r * p.cols + c];
        if (v >= 0) {
          board[write * p.cols + c] = v;
          write -= 1;
        }
      }
      for (let r = write; r >= 0; r -= 1) board[r * p.cols + c] = -1;
    }
    for (let c = 0; c < p.cols; c += 1) {
      for (let r = 0; r < p.rows; r += 1) {
        if (board[r * p.cols + c] < 0) board[r * p.cols + c] = rng.pick(p.kinds);
      }
    }
  }
  return { gained, steps: step };
}

/** The opening board. */
export function startFoodCross(seed: number, p: ParamsFoodCross): { board: number[]; rng: Rng; fills: number } {
  const rng = mulberry32(seed);
  const board = new Array<number>(p.rows * p.cols).fill(-1);
  const fills = fillPlayable(board, rng, p);
  return { board, rng, fills };
}

/**
 * Normalise the wire's move list: an array of `[row, col, dir]` triples, `dir` 0
 * for the right-hand neighbour and 1 for the one below. Anything else — a
 * non-integer, a cell off the board, a neighbour off the board — is a `bad_move`
 * at its index.
 */
export function parseSwaps(raw: unknown, p: ParamsFoodCross): Swap[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ReplayError(-1, 'bad_move');
  return raw.map((item, index) => {
    if (!Array.isArray(item) || item.length !== 3 || !item.every((n) => Number.isInteger(n))) {
      throw new ReplayError(index, 'bad_move');
    }
    const [row, col, dir] = item as number[];
    if (row < 0 || col < 0 || row >= p.rows || col >= p.cols || (dir !== 0 && dir !== 1)) {
      throw new ReplayError(index, 'bad_move');
    }
    const swap: Swap = { row, col, dir };
    if (partner(swap, p) < 0) throw new ReplayError(index, 'bad_move');
    return swap;
  });
}

/**
 * Replay a round. For each swap, in order: exchange the two tiles; if the board
 * now has no run, the replay is refused (`no_match`) — a real board snaps an
 * unmatched swap back and the client must not record it; otherwise resolve it
 * (above) and add the points; then, **if no legal swap remains, reshuffle** by
 * `fillPlayable`, continuing the stream.
 */
export function replayFoodCross(seed: number, swaps: readonly Swap[], p: ParamsFoodCross): ResultFoodCross {
  if (swaps.length > p.moves) throw new ReplayError(-1, 'too_many_moves');
  const { board, rng, fills } = startFoodCross(seed, p);
  let reshuffles = fills - 1;
  let score = 0;
  let bestCascade = 0;
  swaps.forEach((swap, index) => {
    const a = swap.row * p.cols + swap.col;
    const b = partner(swap, p);
    if (b < 0) throw new ReplayError(index, 'bad_move');
    [board[a], board[b]] = [board[b], board[a]];
    if (findRuns(board, p).length === 0) throw new ReplayError(index, 'no_match');
    const { gained, steps } = resolve(board, rng, p);
    score += gained;
    bestCascade = Math.max(bestCascade, steps);
    if (!hasLegalMove(board, p)) reshuffles += fillPlayable(board, rng, p);
  });
  return { board, score, moves: swaps.length, reshuffles, bestCascade, draws: rng.draws };
}

/** §5.8: `min(100, floor(score × 100 / target))`. Integer, so a port cannot round differently. */
export function performanceFoodCross(score: number, target: number): number {
  return Math.min(100, Math.floor((Math.max(0, score) * 100) / Math.max(1, target)));
}

/** Every legal swap on a board, in `hasLegalMove`'s order. For tests and the doc's vectors. */
export function legalSwaps(board: number[], p: ParamsFoodCross): Swap[] {
  const out: Swap[] = [];
  for (let row = 0; row < p.rows; row += 1) {
    for (let col = 0; col < p.cols; col += 1) {
      for (const dir of [0, 1] as const) {
        const a = row * p.cols + col;
        const b = partner({ row, col, dir }, p);
        if (b < 0 || board[a] === board[b]) continue;
        [board[a], board[b]] = [board[b], board[a]];
        if (findRuns(board, p).length > 0) out.push({ row, col, dir });
        [board[a], board[b]] = [board[b], board[a]];
      }
    }
  }
  return out;
}

/**
 * Step a live board by one swap — the same rules as `replayFoodCross`, exposed
 * so a test or a simulation can play move by move and choose each swap from
 * the board it is looking at.
 */
export function playSwap(
  board: number[],
  rng: Rng,
  swap: Swap,
  p: ParamsFoodCross,
): { gained: number; steps: number; reshuffled: number } {
  const a = swap.row * p.cols + swap.col;
  const b = partner(swap, p);
  if (b < 0) throw new ReplayError(0, 'bad_move');
  [board[a], board[b]] = [board[b], board[a]];
  if (findRuns(board, p).length === 0) {
    [board[a], board[b]] = [board[b], board[a]];
    throw new ReplayError(0, 'no_match');
  }
  const { gained, steps } = resolve(board, rng, p);
  const reshuffled = hasLegalMove(board, p) ? 0 : fillPlayable(board, rng, p);
  return { gained, steps, reshuffled };
}
