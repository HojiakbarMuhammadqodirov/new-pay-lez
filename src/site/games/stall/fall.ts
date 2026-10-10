import { BOMB, COL, ROW, SIZE, type Board, type Step } from '../foodBoard';

/**
 * How one cascade step **moved** — for the animation, and for nothing else.
 *
 * A `Step` says what cleared and what the board was after the fall, which is
 * all the rules (and the server) need. To *show* the fall the screen needs to
 * know which food landed where, and that follows from the one rule `collapse`
 * in `foodBoard.ts` applies: in each column the foods that survived keep their
 * order and drop to the bottom, and new food fills the top. This re-derives
 * that, and decides nothing — the board the game keeps is still the step's,
 * and the scene corrects itself to it after every step. `foodBoard.ts` is the
 * server's rules copied line for line and pinned by both suites, which is why
 * this lives beside it rather than in it.
 */
export interface Landing {
  /** The cell of the board before the step it came from, or -1 for new food. */
  was: number;
  /** The row it starts falling from — negative for new food, above the board. */
  fromRow: number;
}

export interface Fall {
  /** For every cell of the step's board, where its food came from. */
  landings: Landing[];
  /** Cells (of the step's board) whose food became a special in this step. */
  made: number[];
  /** Striped foods that went off, and the bomb if one did — the board's fireworks. */
  fired: { cell: number; kind: 'row' | 'col' | 'bomb' }[];
}

export function fallOf(before: Board, step: Step): Fall {
  const cleared = new Set(step.cleared);
  const landings: Landing[] = new Array(SIZE * SIZE);
  const made: number[] = [];
  for (let col = 0; col < SIZE; col += 1) {
    const kept: number[] = [];
    for (let row = SIZE - 1; row >= 0; row -= 1) {
      const cell = row * SIZE + col;
      if (!cleared.has(cell)) kept.push(cell);
    }
    const fresh = SIZE - kept.length;
    for (let row = SIZE - 1, k = 0; row >= 0; row -= 1, k += 1) {
      const cell = row * SIZE + col;
      if (k < kept.length) {
        const was = kept[k];
        landings[cell] = { was, fromRow: Math.floor(was / SIZE) };
        const a = before[was];
        const b = step.board[cell];
        if (a && b && (a.t !== b.t || a.s !== b.s)) made.push(cell);
      } else {
        /* New food keeps its order as it drops: the lowest new piece starts one
           row above the board, the next one above that, and so on. */
        landings[cell] = { was: -1, fromRow: row - fresh };
      }
    }
  }
  const fired: Fall['fired'] = [];
  for (const cell of step.cleared) {
    const piece = before[cell];
    if (!piece) continue;
    if (piece.s === ROW) fired.push({ cell, kind: 'row' });
    else if (piece.s === COL) fired.push({ cell, kind: 'col' });
    else if (piece.s === BOMB) fired.push({ cell, kind: 'bomb' });
  }
  return { landings, made, fired };
}
