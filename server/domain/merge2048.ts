/**
 * 2048, as the server plays it.
 *
 * ## Why the server holds the board
 *
 * Every other game here is judged against something the client is not shown:
 * the quiz's answers, the word, the deck's layout. 2048 has no answer key — the
 * board is in plain view — so the thing to keep secret is **where the next tile
 * lands**. A client that knew that could search the game tree for the perfect
 * line; a client that reported its own board could report a 2048 tile it never
 * made. So the board lives in `game_sessions.secret`, every move is applied
 * here, and the spawn comes from a seed that never leaves this process.
 *
 * ## Why the board is stored, not replayed
 *
 * Memory Match re-derives its state from the event rows on every move. That is
 * right for a twelve-card board and wrong here: a round has no length limit, a
 * long one runs to well over a thousand moves, and replaying the whole history
 * on every swipe is quadratic in the length of the game. The board after each
 * move is written back to the secret instead, beside the move count — which is
 * also what makes a retried move recognisable (see `from` in `games.ts`).
 *
 * ## Deterministic, so it can be checked
 *
 * The *n*th spawn is a pure function of the seed and *n*: an HMAC, read as two
 * numbers, picks the empty cell and the value (a 4 one time in ten, the
 * original game's odds). Nothing here reads a clock or `Math.random`, so the
 * same seed and the same moves always produce the same board, and
 * `npm run verify:api` can assert exact positions.
 *
 * The slide itself is duplicated in `src/site/games/board2048.ts` so a swipe
 * moves the tiles at once instead of waiting a round trip. The two share no
 * code — `server/` and `src/` never import each other — and do not need to: the
 * browser's copy only *predicts*, and the board this file returns is the one
 * the screen then shows.
 */
import { createHmac } from 'node:crypto';

export const SIZE = 4;
export type Board = number[];
export type Direction = 'up' | 'down' | 'left' | 'right';
export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

/** The cell indices of each line, in the order tiles slide *towards*. */
function lines(direction: Direction): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < SIZE; i += 1) {
    const line: number[] = [];
    for (let j = 0; j < SIZE; j += 1) {
      if (direction === 'left') line.push(i * SIZE + j);
      else if (direction === 'right') line.push(i * SIZE + (SIZE - 1 - j));
      else if (direction === 'up') line.push(j * SIZE + i);
      else line.push((SIZE - 1 - j) * SIZE + i);
    }
    out.push(line);
  }
  return out;
}

/**
 * One swipe, without the spawn.
 *
 * The original game's rule, and the one detail people get wrong: a tile merges
 * **at most once per move**, so `2 2 4 0` sliding left is `4 4 0 0`, not `8`.
 * `gained` is the sum of the tiles that merges made — the game's own score.
 */
export function slide(board: Board, direction: Direction): { board: Board; gained: number; moved: boolean } {
  const next = board.slice();
  let gained = 0;
  for (const line of lines(direction)) {
    const values = line.map((cell) => board[cell]).filter((value) => value !== 0);
    const merged: number[] = [];
    for (let k = 0; k < values.length; k += 1) {
      if (k + 1 < values.length && values[k] === values[k + 1]) {
        merged.push(values[k] * 2);
        gained += values[k] * 2;
        k += 1;
      } else {
        merged.push(values[k]);
      }
    }
    line.forEach((cell, k) => {
      next[cell] = merged[k] ?? 0;
    });
  }
  const moved = next.some((value, i) => value !== board[i]);
  return { board: next, gained, moved };
}

/** The *n*th spawn for this seed: which empty cell, and a 2 or a 4. */
export function spawn(board: Board, seed: string, n: number): { board: Board; index: number; value: number } {
  const empties = board.flatMap((value, i) => (value === 0 ? [i] : []));
  if (empties.length === 0) return { board, index: -1, value: 0 };
  const digest = createHmac('sha256', seed).update(`spawn:${n}`).digest();
  const index = empties[digest.readUInt32BE(0) % empties.length];
  const value = digest.readUInt32BE(4) % 10 === 0 ? 4 : 2;
  const next = board.slice();
  next[index] = value;
  return { board: next, index, value };
}

/** A fresh board: two tiles, the first two spawns of the seed. */
export function newBoard(seed: string): Board {
  const first = spawn(new Array<number>(SIZE * SIZE).fill(0), seed, 0);
  return spawn(first.board, seed, 1).board;
}

/** Whether any swipe would change the board — the game's only ending. */
export function canMove(board: Board): boolean {
  return DIRECTIONS.some((direction) => slide(board, direction).moved);
}

export const maxTile = (board: Board): number => board.reduce((top, value) => Math.max(top, value), 0);

/** The round's whole server-side state, as it sits in `game_sessions.secret`. */
export interface MergeSecret {
  kind: 'merge';
  seed: string;
  board: Board;
  /** Moves applied so far. A move must name this number to be applied. */
  moves: number;
  /** Spawns drawn so far — two for the opening board, one per move after. */
  spawns: number;
  score: number;
  /** The largest tile ever on the board, which is what the round is scored on. */
  best: number;
  over: boolean;
}

export function start(seed: string): MergeSecret {
  const board = newBoard(seed);
  return { kind: 'merge', seed, board, moves: 0, spawns: 2, score: 0, best: maxTile(board), over: !canMove(board) };
}

/**
 * Apply one swipe to a round: slide, spawn, and note whether it is over.
 * `null` when the swipe changes nothing, which is not a move.
 */
export function play(state: MergeSecret, direction: Direction): { state: MergeSecret; spawned: { index: number; value: number } } | null {
  const slid = slide(state.board, direction);
  if (!slid.moved) return null;
  const placed = spawn(slid.board, state.seed, state.spawns);
  const board = placed.board;
  return {
    state: {
      ...state,
      board,
      moves: state.moves + 1,
      spawns: state.spawns + 1,
      score: state.score + slid.gained,
      best: Math.max(state.best, maxTile(board)),
      over: !canMove(board),
    },
    spawned: { index: placed.index, value: placed.value },
  };
}
