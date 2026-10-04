/**
 * 2048 — rulebook §5.7, as a **deterministic** engine the server replays.
 *
 * The phone plays the round locally, from the seed `/start` handed it, and sends
 * the list of swipes with `/finish`. This module replays those swipes from the
 * same seed and computes the result itself — the highest tile, the score, and
 * so the performance. Whatever the client *says* it scored is never read.
 *
 * That only works if the phone and this file produce the same board after every
 * swipe, forever, in two languages. So everything here is integer arithmetic on
 * a flat array, every random draw goes through `Rng.pick` in an order the
 * document fixes, and nothing depends on iteration order of a `Map` or a `Set`.
 * **`server/GAMES-2048-FOODCROSS.md` is the normative description** — this file
 * is one implementation of it, the Dart port is the other, and the test vectors
 * in that document are what hold the two together (`verify.ts` replays every one
 * of them against this code).
 *
 * The game itself is the standard one: slide every tile as far as it goes, merge
 * two equal tiles that meet into their sum, at most once per tile per swipe, and
 * add one new tile after every swipe that changed the board. The one rule that
 * is *ours* rather than the game's is that **a swipe that changes nothing is not
 * a move**: the client must not send one, and a replay that contains one is
 * refused. A real player swiping into a wall sees nothing happen and nothing
 * happens here either — the client simply does not record it — so the only move
 * list that can contain one is one that did not come from playing this board.
 */
import { mulberry32, type Rng } from './prng.ts';
import { ReplayError } from './replay.ts';

export { ReplayError };

/** The four swipes, as the single letters the wire carries. */
export type Swipe = 'U' | 'D' | 'L' | 'R';
export const SWIPES: readonly Swipe[] = ['U', 'D', 'L', 'R'];

/**
 * Everything that shapes a round, frozen into the session's secret at `/start`.
 *
 * Carried with the round rather than read from `CONFIG` at replay time, so a
 * tunable changed while somebody is mid-game cannot change the board they are
 * being replayed on. The same object goes to the client as `content`.
 */
export interface Params2048 {
  /** Side of the square board. 4. */
  size: number;
  /** A new tile is a 4 when `pick(fourOneIn) === 0`, else a 2. 10 → 10% fours. */
  fourOneIn: number;
  /** How many tiles the board starts with. 2. */
  startTiles: number;
  /** The most swipes a replay will accept. A bound on work, not a game rule. */
  maxMoves: number;
}

export interface Result2048 {
  /** Row-major, `size × size`, 0 for an empty cell, else the tile's face value. */
  board: number[];
  /** The sum of every merged tile's new value, across the whole round. */
  score: number;
  /** The largest tile on the board at the end (tiles never shrink, so also the largest ever). */
  highestTile: number;
  /** Swipes replayed. */
  moves: number;
  /** No empty cell and no two equal neighbours: no swipe can change the board. */
  over: boolean;
  /** 32-bit draws taken from the stream — for the document's vectors. */
  draws: number;
}


/**
 * Place one new tile: two draws, **position first, then value**.
 *
 * The position is the `pick(empty)`-th empty cell counted in row-major order
 * (index 0 is the top-left, `size` the first cell of the second row). The value
 * is a 4 on `pick(fourOneIn) === 0` and a 2 otherwise. On a full board nothing is
 * drawn at all — which cannot happen after a legal swipe, because a swipe that
 * changed the board has always either emptied a cell by merging or moved a tile
 * off one — but the rule is stated so a port need not reason about it.
 */
function spawn(board: number[], rng: Rng, params: Params2048): void {
  const empty: number[] = [];
  for (let i = 0; i < board.length; i += 1) if (board[i] === 0) empty.push(i);
  if (empty.length === 0) return;
  const cell = empty[rng.pick(empty.length)];
  board[cell] = rng.pick(params.fourOneIn) === 0 ? 4 : 2;
}

/**
 * The cell indices of each line a swipe acts on, **in the order tiles travel
 * towards** — the first index of a line is the wall they pile up against.
 *
 * `L`: each row, left to right. `R`: each row, right to left. `U`: each column,
 * top to bottom. `D`: each column, bottom to top. Lines are independent, so the
 * order the lines are visited in cannot change the result.
 */
function lines(size: number, swipe: Swipe): number[][] {
  const out: number[][] = [];
  for (let a = 0; a < size; a += 1) {
    const line: number[] = [];
    for (let b = 0; b < size; b += 1) {
      switch (swipe) {
        case 'L': line.push(a * size + b); break;
        case 'R': line.push(a * size + (size - 1 - b)); break;
        case 'U': line.push(b * size + a); break;
        case 'D': line.push((size - 1 - b) * size + a); break;
      }
    }
    out.push(line);
  }
  return out;
}

/**
 * Apply one swipe in place. Returns the points it scored and whether any cell changed.
 *
 * Per line: take the non-empty tiles in travel order, then walk them — if a tile
 * equals the next one, the pair becomes one tile of double the value (and the
 * score gains that value) and the walk skips past both; otherwise the tile is
 * kept as it is. The results are written back from the wall outward and the rest
 * of the line is emptied. So `2 2 2 2` swiped left is `4 4 _ _` (+8), `2 2 2 _`
 * is `4 2 _ _`, and `4 4 8 _` is `8 8 _ _` — a merged tile never merges again in
 * the same swipe.
 */
export function slide(board: number[], size: number, swipe: Swipe): { gained: number; changed: boolean } {
  let gained = 0;
  let changed = false;
  for (const line of lines(size, swipe)) {
    const tiles = line.map((i) => board[i]).filter((v) => v !== 0);
    const merged: number[] = [];
    for (let i = 0; i < tiles.length; ) {
      if (i + 1 < tiles.length && tiles[i] === tiles[i + 1]) {
        merged.push(tiles[i] * 2);
        gained += tiles[i] * 2;
        i += 2;
      } else {
        merged.push(tiles[i]);
        i += 1;
      }
    }
    for (let k = 0; k < line.length; k += 1) {
      const next = merged[k] ?? 0;
      if (board[line[k]] !== next) changed = true;
      board[line[k]] = next;
    }
  }
  return { gained, changed };
}

/** Whether any swipe could change the board: an empty cell, or two equal neighbours. */
export function canMove(board: number[], size: number): boolean {
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const v = board[r * size + c];
      if (v === 0) return true;
      if (c + 1 < size && board[r * size + c + 1] === v) return true;
      if (r + 1 < size && board[(r + 1) * size + c] === v) return true;
    }
  }
  return false;
}

/** The opening board: `startTiles` spawns on an empty board, drawn in order. */
export function start2048(seed: number, params: Params2048): { board: number[]; rng: Rng } {
  const rng = mulberry32(seed);
  const board = new Array<number>(params.size * params.size).fill(0);
  for (let i = 0; i < params.startTiles; i += 1) spawn(board, rng, params);
  return { board, rng };
}

/**
 * Normalise what arrived on the wire into a list of swipes.
 *
 * A string of `U`/`D`/`L`/`R` is the canonical form (`"LLURD"`), and an array of
 * the same single letters is accepted as well because it is the same fact. Any
 * other character is a `bad_move` at its position — never skipped, because a
 * skipped move is a different board.
 */
export function parseSwipes(raw: unknown): Swipe[] {
  let items: unknown[];
  if (typeof raw === 'string') items = [...raw];
  else if (Array.isArray(raw)) items = raw;
  else if (raw === undefined || raw === null) items = [];
  else throw new ReplayError(-1, 'bad_move');
  return items.map((item, index) => {
    if (typeof item !== 'string' || !(SWIPES as readonly string[]).includes(item)) {
      throw new ReplayError(index, 'bad_move');
    }
    return item as Swipe;
  });
}

/**
 * Replay a whole round from its seed. Throws `ReplayError` on any move list that
 * could not have been produced by playing this board.
 *
 * For every swipe, in order: slide; if nothing changed, the replay is refused
 * (`no_change`); otherwise add the points and spawn one tile. A swipe sent after
 * the board is over is necessarily a `no_change`, so "the game has ended" needs
 * no rule of its own.
 */
export function replay2048(seed: number, swipes: readonly Swipe[], params: Params2048): Result2048 {
  if (swipes.length > params.maxMoves) throw new ReplayError(-1, 'too_many_moves');
  const { board, rng } = start2048(seed, params);
  let score = 0;
  swipes.forEach((swipe, index) => {
    const { gained, changed } = slide(board, params.size, swipe);
    if (!changed) throw new ReplayError(index, 'no_change');
    score += gained;
    spawn(board, rng, params);
  });
  return {
    board,
    score,
    highestTile: Math.max(0, ...board),
    moves: swipes.length,
    over: !canMove(board, params.size),
    draws: rng.draws,
  };
}

/**
 * §5.7: performance by the highest tile reached — the largest band whose `tile`
 * the round reached, and 0 below the lowest band.
 *
 * The rulebook's table starts at 64 (20). A round that never made a 64 is a round
 * of a few swipes, and it takes the floor every finished round takes (base 2
 * points, §4.2) rather than a band the rulebook does not print.
 */
export function performance2048(
  highestTile: number,
  bands: ReadonlyArray<{ tile: number; performance: number }>,
): number {
  let best = 0;
  for (const band of bands) {
    if (highestTile >= band.tile && band.performance > best) best = band.performance;
  }
  return Math.min(100, best);
}
