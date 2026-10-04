/**
 * 2048, as the browser plays it.
 *
 * The same slide as `server/domain/merge2048.ts`, written twice because the
 * two programs share no code. It has two jobs, and neither is to decide
 * anything a point depends on:
 *
 * - **Prediction.** On a server round the swipe moves the tiles here at once,
 *   and the board the server sends back (with the new tile it placed) replaces
 *   this one. Waiting a round trip before anything moved would make a game that
 *   is all about rhythm feel broken.
 * - **The offline round**, played with no API session — the demo accounts and a
 *   dead backend. Its spawns use `Math.random`, and like every other local round
 *   it pays into the local mirror and is not ranked.
 *
 * `npm run verify` checks the slide against the cases the server's own suite
 * pins, so the two copies cannot quietly disagree about the merge rule.
 */
export const SIZE = 4;
export type Board = number[];
export type Direction = 'up' | 'down' | 'left' | 'right';
export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

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

/** One swipe, without the spawn. A tile merges at most once per move. */
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
  return { board: next, gained, moved: next.some((value, i) => value !== board[i]) };
}

export const canMove = (board: Board): boolean => DIRECTIONS.some((d) => slide(board, d).moved);

export const maxTile = (board: Board): number => board.reduce((top, value) => Math.max(top, value), 0);

/** The offline spawn: a random empty cell, a 4 one time in ten. */
export function spawnLocal(board: Board): { board: Board; index: number } {
  const empties = board.flatMap((value, i) => (value === 0 ? [i] : []));
  if (empties.length === 0) return { board, index: -1 };
  const index = empties[Math.floor(Math.random() * empties.length)];
  const next = board.slice();
  next[index] = Math.random() < 0.1 ? 4 : 2;
  return { board: next, index };
}

export function newLocalBoard(): Board {
  return spawnLocal(spawnLocal(new Array<number>(SIZE * SIZE).fill(0)).board).board;
}

/** The arrow keys and WASD, to a direction. */
export function directionForKey(key: string): Direction | null {
  switch (key) {
    case 'ArrowUp': case 'w': case 'W': return 'up';
    case 'ArrowDown': case 's': case 'S': return 'down';
    case 'ArrowLeft': case 'a': case 'A': return 'left';
    case 'ArrowRight': case 'd': case 'D': return 'right';
    default: return null;
  }
}

/**
 * A swipe, from where a finger went down to where it came up — or `null` for a
 * tap. 24px is under a third of a tile on the smallest phone, so a deliberate
 * swipe always clears it and a tap never does.
 */
export function directionForSwipe(dx: number, dy: number, threshold = 24): Direction | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return null;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}
