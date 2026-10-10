import { SIZE, type Board, type Direction } from '../board2048';

/**
 * Where each tile **went** in a swipe — for the animation, and for nothing else.
 *
 * `slide` in `board2048.ts` answers what the board *is* after a swipe, which is
 * all the rules need; a screen that wants tiles to travel also needs to know
 * which tile ended up where. This walks the same lines in the same order with
 * the same "a tile merges at most once" rule and records the journeys instead
 * of the result. It decides nothing: the board the game keeps (and sends, and
 * banks) is still `slide`'s, and if the two ever disagreed the scene would
 * simply snap to the real one on the next reply. `board2048.ts` is a mirror of
 * the server pinned by both test suites, which is why this lives beside it
 * rather than in it.
 */
export interface Track {
  /** The cell the tile left. */
  from: number;
  /** The cell it slid to. */
  to: number;
  value: number;
  /** It met its twin at `to`; both halves of a merge carry this. */
  merged: boolean;
}

export interface Merge {
  /** The cell the merged tile sits in. */
  at: number;
  /** Its new value. */
  value: number;
}

/** The cells of each line, leading edge first — `lines()` in `board2048.ts`. */
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

export function tracksFor(board: Board, direction: Direction): { tracks: Track[]; merges: Merge[] } {
  const tracks: Track[] = [];
  const merges: Merge[] = [];
  for (const line of lines(direction)) {
    const tiles = line.filter((cell) => board[cell] !== 0);
    let slot = 0;
    for (let k = 0; k < tiles.length; k += 1) {
      const here = tiles[k];
      const next = tiles[k + 1];
      const to = line[slot];
      if (next !== undefined && board[here] === board[next]) {
        tracks.push({ from: here, to, value: board[here], merged: true });
        tracks.push({ from: next, to, value: board[next], merged: true });
        merges.push({ at: to, value: board[here] * 2 });
        k += 1;
      } else {
        tracks.push({ from: here, to, value: board[here], merged: false });
      }
      slot += 1;
    }
  }
  return { tracks, merges };
}
