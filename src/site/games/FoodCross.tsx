import { useCallback, useEffect, useRef, useState } from 'react';
import { useCopy } from '../i18n/context';
import { fill } from '../i18n/currency';
import { FOOD_MOVES, FOOD_TARGET, foodMilestones, foodPoints } from '../auth/player';
import { PerfectBar } from './hud';
import { sendMove } from '../api/consumer';
import { FOODS, FOOD_BOMB } from '../content';
import {
  BOMB,
  COL,
  ROW,
  SIZE,
  adjacent,
  canSwap,
  deal,
  localRng,
  play,
  type Board,
  type Step,
} from './foodBoard';

/**
 * Food Cross — swap two neighbouring foods to line up three or more.
 *
 * Twenty swaps a round, scored on the board's score (rulebook §5.8: every food
 * cleared, multiplied up by cascades and by four- and five-matches). Four in a line leaves a striped food that clears its row
 * or column when it goes; five leaves a bomb that, swapped with a food, clears
 * every food of that kind. The rules are `games/foodBoard.ts`.
 *
 * ## Two boards, and only one of them is this file's
 *
 * With a `session` the board is the **server's** (`server/domain/foodCross.ts`):
 * it applies each swap and chooses every food that falls in, from a seed this
 * screen never sees, so the total it scores is one a client cannot write. The
 * reply carries each stage of the move — what cleared, and the board after the
 * fall — and the screen plays those stages out in order, so a cascade is seen
 * as a cascade rather than as a board that changed. Without one it deals and
 * refills its own board with `localRng`: the demo accounts and a dead backend,
 * paid into the local mirror and not ranked, as Memory Match and 2048 are.
 *
 * ## Two ways to move, one rule
 *
 * Tap a food and then a neighbour, or drag a food towards the neighbour. A swap
 * that lines nothing up is checked here before it is sent (`canSwap` is the
 * server's own rule) and shakes in place: it is not a move and costs nothing.
 *
 * The foods are emoji, the sanctioned exception the memory cards and the flags
 * are; the specials are marked with the accent — stripes along the line a
 * striped food clears — so the palette rule holds for everything that is not a
 * picture of a food.
 */

interface ServerView {
  board: Board;
  steps: Step[];
  score: number;
  moves: number;
  movesLeft: number;
  over: boolean;
}

function viewIn(reply: Record<string, unknown>): ServerView | null {
  const view = reply.food as Partial<ServerView> | undefined;
  if (!view || !Array.isArray(view.board) || view.board.length !== SIZE * SIZE) return null;
  return {
    board: view.board,
    steps: Array.isArray(view.steps) ? view.steps : [],
    score: Number(view.score) || 0,
    moves: Number(view.moves) || 0,
    movesLeft: Number(view.movesLeft) || 0,
    over: Boolean(view.over),
  };
}

/** How long cleared foods show as clearing before everything falls. */
const CLEAR_MS = 230;
/** How long a finished board stays up before the result card. */
const OVER_MS = 1000;
/** A drag shorter than this is a tap. */
const DRAG_PX = 18;

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export function FoodCross({
  session,
  serverBoard,
  onDone,
  onQuit,
}: {
  /** The server round in flight. Absent for a board this file deals itself. */
  session?: string;
  /** What `/v1/games/sessions` dealt. Arrives with `session`. */
  serverBoard?: { board: Board; moves?: number };
  /** Points (local reckoning), fifths of the target reached, a perfect round, the board's score. */
  onDone: (points: number, correct: number, won: boolean, score: number) => void;
  onQuit: () => void;
}) {
  const copy = useCopy().games;
  const remote = session && serverBoard?.board?.length === SIZE * SIZE ? session : null;
  const limit = remote ? serverBoard?.moves ?? FOOD_MOVES : FOOD_MOVES;

  const [board, setBoard] = useState<Board>(() => (remote ? serverBoard!.board : deal(localRng, 0).board));
  const [moves, setMoves] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [clearing, setClearing] = useState<Set<number>>(new Set());
  const [shaking, setShaking] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const seq = useRef(0);
  const finished = useRef(false);
  /* Whether this screen is still mounted, for replies and timers that land
     after Quit. Set **on mount** as well as cleared on unmount: StrictMode runs
     every effect, tears it down and runs it again, and a flag only ever cleared
     would read "gone" on a screen that is still there — every reply ignored and
     the board stuck busy. */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const over = moves >= limit;

  /* Play a move's stages out: show what clears, then the board after the fall. */
  const animate = useCallback(async (steps: Step[]) => {
    const quick = reducedMotion();
    for (const step of steps) {
      if (!alive.current) return;
      if (step.cleared.length > 0 && !quick) {
        setClearing(new Set(step.cleared));
        await wait(CLEAR_MS);
      }
      if (!alive.current) return;
      setClearing(new Set());
      setBoard(step.board);
    }
  }, []);

  const swap = useCallback(
    (a: number, b: number) => {
      if (busy || over || finished.current) return;
      setSelected(null);
      if (!canSwap(board, a, b)) {
        /* Not a move: shake both and leave everything as it was. */
        setShaking([a, b]);
        window.setTimeout(() => alive.current && setShaking([]), 360);
        return;
      }
      setFailed(false);
      setBusy(true);

      if (!remote) {
        const played = play(board, a, b, localRng, 0)!;
        void animate(played.steps).then(() => {
          if (!alive.current) return;
          setBoard(played.board);
          setScore((value) => value + played.score);
          setMoves((value) => value + 1);
          setBusy(false);
        });
        return;
      }

      void sendMove(remote, seq.current++, { a, b, from: moves }, 'swap')
        .then(async (reply) => {
          const view = viewIn(reply);
          if (!view) throw new Error('no board in reply');
          await animate(view.steps);
          if (!alive.current) return;
          setBoard(view.board);
          setScore(view.score);
          setMoves(view.moves);
        })
        .catch(() => {
          /* The board on screen is still the last one the server confirmed —
             nothing was drawn before the reply — so the swap can simply be made
             again. If the server did apply it and only the reply was lost, the
             retry's `from` is behind and it answers with the current board. */
          if (alive.current) setFailed(true);
        })
        .finally(() => alive.current && setBusy(false));
    },
    [animate, board, busy, moves, over, remote],
  );

  /* Twenty swaps and the round is over: let the last cascade be seen, then bank. */
  useEffect(() => {
    if (!over || busy || finished.current) return;
    const timer = window.setTimeout(() => {
      if (finished.current) return;
      finished.current = true;
      onDone(foodPoints(score, moves), foodMilestones(score), foodMilestones(score) >= 5, score);
    }, OVER_MS);
    return () => window.clearTimeout(timer);
  }, [over, busy, score, moves, onDone]);

  /* Taps and drags. A drag picks the neighbour in the direction it went; a tap
     selects, and a second tap on a neighbour swaps. */
  const press = useRef<{ index: number; x: number; y: number } | null>(null);
  const cellAt = (target: EventTarget | null): number | null => {
    const cell = (target as HTMLElement | null)?.closest?.('[data-i]') as HTMLElement | null;
    return cell ? Number(cell.dataset.i) : null;
  };

  return (
    <div className="round fc-round">
      <div className="round-top">
        <span className="round-count">{fill(copy.food.score, { n: `${score} / ${FOOD_TARGET}` })}</span>
        {/* The moves left take the clock slot: they are this round's
            countdown, the way the seconds are a quiz's. */}
        <span className="round-clock">{fill(copy.food.movesLeft, { n: String(Math.max(0, limit - moves)) })}</span>
      </div>
      <PerfectBar performance={(score / FOOD_TARGET) * 100} label={copy.perfectProgress} />

      <div
        className="fc-board"
        role="group"
        aria-label={copy.food.boardLabel}
        data-busy={busy ? 'true' : undefined}
        onPointerDown={(event) => {
          const index = cellAt(event.target);
          if (index === null) return;
          press.current = { index, x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = press.current;
          press.current = null;
          if (!start) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (Math.max(Math.abs(dx), Math.abs(dy)) >= DRAG_PX) {
            const step = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : -1) : dy > 0 ? SIZE : -SIZE;
            const target = start.index + step;
            if (adjacent(start.index, target)) swap(start.index, target);
            return;
          }
          if (selected !== null && adjacent(selected, start.index)) swap(selected, start.index);
          else setSelected(selected === start.index ? null : start.index);
        }}
        onPointerCancel={() => {
          press.current = null;
        }}
      >
        {board.map((piece, index) => (
          <button
            key={index}
            type="button"
            className="fc-cell"
            data-i={index}
            data-special={piece.s === ROW ? 'row' : piece.s === COL ? 'col' : piece.s === BOMB ? 'bomb' : undefined}
            data-selected={selected === index ? 'true' : undefined}
            data-clearing={clearing.has(index) ? 'true' : undefined}
            data-shake={shaking.includes(index) ? 'true' : undefined}
            aria-label={piece.s === BOMB ? copy.food.bomb : copy.food.kinds[piece.t] ?? ''}
            aria-pressed={selected === index}
            /* Keyboard: Enter/Space selects and swaps exactly like a tap. */
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              if (selected !== null && adjacent(selected, index)) swap(selected, index);
              else setSelected(selected === index ? null : index);
            }}
          >
            <span aria-hidden>{piece.s === BOMB ? FOOD_BOMB : FOODS[piece.t] ?? ''}</span>
          </button>
        ))}
      </div>

      {over ? (
        <p className="fc-note" role="status">{copy.food.over}</p>
      ) : failed ? (
        <p className="field-error" role="alert">{copy.food.failed}</p>
      ) : (
        <p className="fc-note">{copy.food.hint}</p>
      )}

      <button type="button" className="link-btn round-quit" onClick={onQuit}>
        {copy.quit}
      </button>
    </div>
  );
}
