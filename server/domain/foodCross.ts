/**
 * Food Cross — a match-three board, as the server plays it.
 *
 * ## The rules
 *
 * An 8×8 board of six foods. A move swaps two neighbours, and is only a move if
 * it lines up three or more of one food (or involves a bomb). Lined-up foods are
 * cleared, everything above falls, new foods drop in from the top, and anything
 * that lines up as a result clears too — a cascade — until the board settles.
 *
 * Two specials, made by the move that clears them:
 *
 * - **Four in a line** leaves a *line food* where the move was made (or in the
 *   middle of the line, in a cascade): striped along the line it came from, and
 *   when it is cleared it clears its whole row (`ROW`) or column (`COL`).
 * - **Five in a line** leaves a **bomb**, which has no food of its own. Swapped
 *   with a food it clears every food of that kind on the board; swapped with
 *   another bomb it clears the board.
 *
 * A round is **20 moves** and is scored on the board's **score** (rulebook
 * §5.8): every food cleared is worth `SCORE_PER_FOOD`, multiplied by the
 * cascade level and by a four- or five-match, and 2,000 is the perfect round
 * (`CONFIG.games.foodTargetScore`).
 *
 * ## Why the server plays it
 *
 * The same reason as 2048 (`merge2048.ts`): nothing on the board is hidden, so
 * what has to be kept secret is **what falls in next**. A client that knew it
 * could plan cascades nobody can see; a client that reported its own total could
 * report any total. So the board lives in `game_sessions.secret`, every swap is
 * applied here, and every new food comes from `rng(n)` — an HMAC of a seed that
 * never leaves the server (see `games.ts`). This file takes the random source as
 * a parameter and reads no clock, so the same seed and the same swaps always
 * give the same board and `verify:api` can pin exact outcomes.
 *
 * The browser has the same rules in `src/site/games/foodBoard.ts`, written again
 * because the two programs share no code; it plays the offline round and checks
 * a swap is legal before sending it. The board a server round shows is always
 * the one this file returned.
 */
export const SIZE = 8;
export const KINDS = 6;

/**
 * The score a cleared food is worth before multipliers (rulebook §5.8: "cascades
 * and 4+/5+ matches multiply score"). A step's score is its foods × this × the
 * cascade level (1 for the swap's own lines, 2 for what falls into place, …) ×2
 * when the step made a four (a striped food) or ×3 when it made a five (a bomb).
 * A bomb going off scores its foods at level 1 — it already clears a lot.
 *
 * Five, against the rulebook's target of 2,000, was set by simulating 300
 * rounds each way: a player choosing swaps at random averages ~820 (41%), one
 * always taking the best-scoring swap reaches 2,000 in about three rounds of
 * four. At ten, a random player averaged 83% — more than the quizzes pay a
 * perfect guesser, which breaks "no game pays better than another".
 */
export const SCORE_PER_FOOD = 5;

/** No special, a row-clearer, a column-clearer, a bomb. */
export const PLAIN = 0;
export const ROW = 1;
export const COL = 2;
export const BOMB = 3;

/** A food: its kind (0..5, or -1 for a bomb) and its special. */
export interface Piece {
  t: number;
  s: number;
}
export type Board = Piece[];

/** The `n`th random draw, as an unsigned 32-bit integer. */
export type Rng = (n: number) => number;

export interface Step {
  /** The cells cleared in this step, before anything fell. */
  cleared: number[];
  /** What this step scored — see `SCORE_PER_FOOD`. */
  score: number;
  /** The board after the fall and the refill. */
  board: Board;
}

const at = (row: number, col: number) => row * SIZE + col;
const rowOf = (index: number) => Math.floor(index / SIZE);
const colOf = (index: number) => index % SIZE;

export const adjacent = (a: number, b: number): boolean =>
  a >= 0 && b >= 0 && a < SIZE * SIZE && b < SIZE * SIZE &&
  ((rowOf(a) === rowOf(b) && Math.abs(a - b) === 1) || (colOf(a) === colOf(b) && Math.abs(a - b) === SIZE));

interface Run {
  cells: number[];
  dir: 'h' | 'v';
}

/** Every line of three or more of one kind. Bombs (kind -1) never match. */
export function findRuns(board: Board): Run[] {
  const runs: Run[] = [];
  for (let row = 0; row < SIZE; row += 1) {
    let start = 0;
    for (let col = 1; col <= SIZE; col += 1) {
      const same =
        col < SIZE && board[at(row, col)].t >= 0 && board[at(row, col)].t === board[at(row, start)].t;
      if (!same) {
        if (col - start >= 3 && board[at(row, start)].t >= 0) {
          runs.push({ cells: Array.from({ length: col - start }, (_, k) => at(row, start + k)), dir: 'h' });
        }
        start = col;
      }
    }
  }
  for (let col = 0; col < SIZE; col += 1) {
    let start = 0;
    for (let row = 1; row <= SIZE; row += 1) {
      const same =
        row < SIZE && board[at(row, col)].t >= 0 && board[at(row, col)].t === board[at(start, col)].t;
      if (!same) {
        if (row - start >= 3 && board[at(start, col)].t >= 0) {
          runs.push({ cells: Array.from({ length: row - start }, (_, k) => at(start + k, col)), dir: 'v' });
        }
        start = row;
      }
    }
  }
  return runs;
}

const swapped = (board: Board, a: number, b: number): Board => {
  const next = board.slice();
  next[a] = board[b];
  next[b] = board[a];
  return next;
};

/** Whether swapping two cells is a move: neighbours, and it matches or fires a bomb. */
export function canSwap(board: Board, a: number, b: number): boolean {
  if (!adjacent(a, b)) return false;
  if (board[a].s === BOMB || board[b].s === BOMB) return true;
  return findRuns(swapped(board, a, b)).length > 0;
}

/** Whether the board has any move at all. */
export function hasMove(board: Board): boolean {
  for (let index = 0; index < SIZE * SIZE; index += 1) {
    if (colOf(index) < SIZE - 1 && canSwap(board, index, index + 1)) return true;
    if (rowOf(index) < SIZE - 1 && canSwap(board, index, index + SIZE)) return true;
  }
  return false;
}

/**
 * A fresh board from draw `from` onwards: no line already made, and at least
 * one move. Each cell avoids completing a line with the two before it, which
 * guarantees the first; a board without a move (rare) is dealt again.
 */
export function deal(rng: Rng, from: number): { board: Board; draws: number } {
  let draws = from;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const board: Board = [];
    for (let index = 0; index < SIZE * SIZE; index += 1) {
      let t = rng(draws) % KINDS;
      draws += 1;
      for (let tries = 0; tries < KINDS; tries += 1) {
        const row = rowOf(index);
        const col = colOf(index);
        const left = col >= 2 && board[index - 1].t === t && board[index - 2].t === t;
        const up = row >= 2 && board[index - SIZE].t === t && board[index - 2 * SIZE].t === t;
        if (!left && !up) break;
        t = (t + 1) % KINDS;
      }
      board.push({ t, s: PLAIN });
    }
    if (hasMove(board)) return { board, draws };
  }
  /* Fifty dead deals in a row does not happen with six kinds on 64 cells; if it
     ever did, the last board is still a legal one to look at. */
  throw new Error('food cross: could not deal a playable board');
}

/** Clear, fall, refill. Returns the new board and the draw counter after it. */
function collapse(board: (Piece | null)[], rng: Rng, from: number): { board: Board; draws: number } {
  let draws = from;
  const next: (Piece | null)[] = board.slice();
  for (let col = 0; col < SIZE; col += 1) {
    const kept: Piece[] = [];
    for (let row = SIZE - 1; row >= 0; row -= 1) {
      const piece = next[at(row, col)];
      if (piece) kept.push(piece);
    }
    for (let row = SIZE - 1, k = 0; row >= 0; row -= 1, k += 1) {
      if (k < kept.length) {
        next[at(row, col)] = kept[k];
      } else {
        next[at(row, col)] = { t: rng(draws) % KINDS, s: PLAIN };
        draws += 1;
      }
    }
  }
  return { board: next as Board, draws };
}

/**
 * Widen a set of cells to be cleared by the line foods inside it, transitively:
 * a row-clearer clears its row, which may hold a column-clearer, and so on.
 * Cells in `keep` (specials being made this step) are never cleared.
 */
function expand(board: Board, cells: Set<number>, keep: Set<number>): Set<number> {
  const queue = [...cells];
  const fired = new Set<number>();
  while (queue.length > 0) {
    const cell = queue.pop()!;
    const piece = board[cell];
    if (fired.has(cell) || (piece.s !== ROW && piece.s !== COL)) continue;
    fired.add(cell);
    for (let k = 0; k < SIZE; k += 1) {
      const target = piece.s === ROW ? at(rowOf(cell), k) : at(k, colOf(cell));
      if (keep.has(target) || cells.has(target)) continue;
      cells.add(target);
      queue.push(target);
    }
  }
  return cells;
}

/**
 * Play one swap to the end: the swap, every cascade, and a fresh deal if the
 * board settles with no move left. `null` when the swap is not a move.
 *
 * `cleared` counts every food removed, the specials' sweeps included; a cell
 * that *becomes* a special is not counted, because it is still on the board.
 */
export function play(
  board: Board,
  a: number,
  b: number,
  rng: Rng,
  from: number,
): { board: Board; draws: number; cleared: number; score: number; steps: Step[]; reshuffled: boolean } | null {
  if (!canSwap(board, a, b)) return null;
  let current = swapped(board, a, b);
  let draws = from;
  let cleared = 0;
  let score = 0;
  const steps: Step[] = [];

  /* ── a bomb fires on the swap itself ── */
  const bombAt = current[a].s === BOMB ? a : current[b].s === BOMB ? b : -1;
  if (bombAt >= 0) {
    const other = bombAt === a ? b : a;
    const cells = new Set<number>();
    if (current[other].s === BOMB) {
      for (let index = 0; index < SIZE * SIZE; index += 1) cells.add(index);
    } else {
      const kind = current[other].t;
      cells.add(bombAt);
      current.forEach((piece, index) => {
        if (piece.t === kind) cells.add(index);
      });
    }
    expand(current, cells, new Set());
    cleared += cells.size;
    const gained = cells.size * SCORE_PER_FOOD;
    score += gained;
    const holes: (Piece | null)[] = current.map((piece, index) => (cells.has(index) ? null : piece));
    const fell = collapse(holes, rng, draws);
    current = fell.board;
    draws = fell.draws;
    steps.push({ cleared: [...cells].sort((x, y) => x - y), score: gained, board: current });
  }

  /* ── lines, and the cascades they cause ── */
  let first = bombAt < 0;
  let level = 0;
  for (let guard = 0; guard < 100; guard += 1) {
    const runs = findRuns(current);
    if (runs.length === 0) break;
    const cells = new Set<number>();
    const made = new Map<number, Piece>();
    for (const run of runs) {
      for (const cell of run.cells) cells.add(cell);
      if (run.cells.length < 4) continue;
      /* Where the special lands: the cell the player moved, if this line is
         theirs; otherwise the middle of the line. First claim wins a cell. */
      const moved = first ? run.cells.find((cell) => cell === a || cell === b) : undefined;
      const spot = moved ?? run.cells[Math.floor(run.cells.length / 2)];
      if (made.has(spot)) continue;
      made.set(
        spot,
        run.cells.length >= 5
          ? { t: -1, s: BOMB }
          : { t: current[spot].t, s: run.dir === 'h' ? ROW : COL },
      );
    }
    const keep = new Set(made.keys());
    for (const spot of keep) cells.delete(spot);
    expand(current, cells, keep);
    cleared += cells.size;
    level += 1;
    const longest = Math.max(...runs.map((run) => run.cells.length));
    const gained = cells.size * SCORE_PER_FOOD * level * (longest >= 5 ? 3 : longest === 4 ? 2 : 1);
    score += gained;
    const holes: (Piece | null)[] = current.map((piece, index) =>
      made.has(index) ? made.get(index)! : cells.has(index) ? null : piece,
    );
    const fell = collapse(holes, rng, draws);
    current = fell.board;
    draws = fell.draws;
    steps.push({ cleared: [...cells].sort((x, y) => x - y), score: gained, board: current });
    first = false;
  }

  /* ── a settled board with no move is dealt again ── */
  let reshuffled = false;
  if (!hasMove(current)) {
    const fresh = deal(rng, draws);
    current = fresh.board;
    draws = fresh.draws;
    reshuffled = true;
    steps.push({ cleared: [], score: 0, board: current });
  }

  return { board: current, draws, cleared, score, steps, reshuffled };
}
