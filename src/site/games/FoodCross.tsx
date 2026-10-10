import { useCallback, useEffect, useRef, useState } from 'react';
import { useCopy, useLanguage } from '../i18n/context';
import { fill, plural } from '../i18n/currency';
import { useTheme } from '../theme/context';
import { useReducedMotion } from '../../components/GlobeHero/hooks/useReducedMotion';
import { FOOD_MOVES, FOOD_TARGET, foodMilestones, foodPoints } from '../auth/player';
import { PerfectBar } from './hud';
import { sendMove } from '../api/consumer';
import {
  BOMB,
  SIZE,
  adjacent,
  canSwap,
  deal,
  localRng,
  play,
  type Board,
  type Step,
} from './foodBoard';
import { StallScene } from './stall/scene';
import { useSceneCanvas, type SceneHost } from './sceneStage';

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
 * server's own rule) and the two foods lean toward each other and back: it is
 * not a move and costs nothing.
 *
 * ## The picture is a scene, and the scene decides nothing
 *
 * `stall/scene.ts` draws Pico's market stall and the foods (`stall/foods.ts`,
 * illustrated rather than emoji, each with a silhouette of its own so the board
 * reads without colour). This component tells it what happened — at the same
 * lines that update the rules' state — and awaits it between cascade steps, the
 * way it used to await a fixed delay. A valid swap is shown the moment it is
 * made, before the server answers, because `canSwap` already proved it is a
 * move; a reply that never arrives swaps the two back in sight. The board,
 * the score, the move count and every request are exactly what they were. The
 * sixty-four buttons are still the board for the keyboard and a screen reader,
 * laid transparently over the picture of it.
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

/** How long a finished board stays up before the result card. */
const OVER_MS = 1000;
/** A drag shorter than this is a tap. */
const DRAG_PX = 18;

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
  const [language] = useLanguage();
  const remote = session && serverBoard?.board?.length === SIZE * SIZE ? session : null;
  const limit = remote ? serverBoard?.moves ?? FOOD_MOVES : FOOD_MOVES;

  const [board, setBoard] = useState<Board>(() => (remote ? serverBoard!.board : deal(localRng, 0).board));
  const [moves, setMoves] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  /* ── the scene ── */
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const canvas = useRef<HTMLCanvasElement>(null);
  const boardEl = useRef<HTMLDivElement>(null);
  const scene = useRef<StallScene | null>(null);
  const host = useRef<SceneHost | null>(null);
  if (scene.current === null) {
    /* Made on the first render, before there is an element: it reads the
       board's box through this getter when the stage first measures. */
    scene.current = new StallScene(() => boardEl.current);
    host.current = scene.current;
  }
  scene.current.setTheme(theme);
  scene.current.setReduced(reduced);
  const stage = useSceneCanvas(canvas, host, reduced);
  /* The opening deal drops onto the cloth — once, on mount. */
  const opening = useRef(board);
  useEffect(() => {
    scene.current?.intro(opening.current);
    stage.invalidate();
  }, [stage]);
  useEffect(() => stage.invalidate(), [theme, stage]);
  useEffect(() => {
    scene.current?.select(selected);
    stage.invalidate();
  }, [selected, stage]);
  useEffect(() => {
    scene.current?.setBusy(busy);
  }, [busy]);

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

  /* Play a move's stages out: the scene shows what clears and the fall, and
     resolves when the step has settled (at once under reduced motion). */
  const animate = useCallback(
    async (steps: Step[]) => {
      for (const step of steps) {
        if (!alive.current) return;
        await scene.current?.step(step);
        stage.invalidate();
        if (!alive.current) return;
        setBoard(step.board);
      }
    },
    [stage],
  );

  const swap = useCallback(
    (a: number, b: number) => {
      if (busy || over || finished.current) return;
      setSelected(null);
      if (!canSwap(board, a, b)) {
        /* Not a move: the two lean toward each other and back, and everything
           stays as it was. */
        scene.current?.refuse(a, b);
        stage.invalidate();
        return;
      }
      setFailed(false);
      setBusy(true);
      /* Shown at once: `canSwap` is the server's own rule, so this is a move. */
      const swapped = scene.current ? scene.current.swap(a, b) : Promise.resolve();
      stage.invalidate();

      if (!remote) {
        const played = play(board, a, b, localRng, 0)!;
        void swapped
          .then(() => animate(played.steps))
          .then(() => {
            if (!alive.current) return;
            setBoard(played.board);
            setScore((value) => value + played.score);
            setMoves((value) => value + 1);
            scene.current?.sync(played.board);
            setBusy(false);
          });
        return;
      }

      void sendMove(remote, seq.current++, { a, b, from: moves }, 'swap')
        .then(async (reply) => {
          const view = viewIn(reply);
          if (!view) throw new Error('no board in reply');
          await swapped;
          await animate(view.steps);
          if (!alive.current) return;
          setBoard(view.board);
          setScore(view.score);
          setMoves(view.moves);
          scene.current?.sync(view.board);
          stage.invalidate();
        })
        .catch(() => {
          /* The rules' board is still the last one the server confirmed — only
             the picture moved ahead of the reply — so the two foods swap back
             in sight and the swap can simply be made again. If the server did
             apply it and only the reply was lost, the retry's `from` is behind
             and it answers with the current board. */
          if (!alive.current) return;
          setFailed(true);
          void swapped.then(() => {
            scene.current?.restore(board, a, b);
            stage.invalidate();
          });
        })
        .finally(() => alive.current && setBusy(false));
    },
    [animate, board, busy, moves, over, remote, stage],
  );

  /* Pico celebrates the round once its last cascade has landed — every round
     ends this way, and nothing that can be lost, is. */
  const settled = over && !busy;
  const perfect = foodMilestones(score) >= 5;
  useEffect(() => {
    scene.current?.setOver(settled, perfect);
    stage.invalidate();
  }, [settled, perfect, stage]);

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
        <span className="round-clock">{fill(plural(language, Math.max(0, limit - moves), copy.food.movesLeft), { n: String(Math.max(0, limit - moves)) })}</span>
      </div>
      <PerfectBar performance={(score / FOOD_TARGET) * 100} label={copy.perfectProgress} />

      <div className="fc-stage" data-busy={busy ? 'true' : undefined}>
        <canvas ref={canvas} className="fc-canvas" aria-hidden />
        <div
          ref={boardEl}
          className="fc-board"
          role="group"
          aria-label={copy.food.boardLabel}
          onPointerDown={(event) => {
            scene.current?.touch();
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
          /* A mouse gets a hover ring on the food under it; a finger has no hover. */
          onPointerMove={(event) => {
            if (event.pointerType === 'mouse') scene.current?.hover(cellAt(event.target));
          }}
          onPointerLeave={() => scene.current?.hover(null)}
        >
          <div className="fc-grid">
            {board.map((piece, index) => (
              <button
                key={index}
                type="button"
                className="fc-cell"
                data-i={index}
                aria-label={piece.s === BOMB ? copy.food.bomb : copy.food.kinds[piece.t] ?? ''}
                aria-pressed={selected === index}
                /* Keyboard: Enter/Space selects and swaps exactly like a tap. */
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  if (selected !== null && adjacent(selected, index)) swap(selected, index);
                  else setSelected(selected === index ? null : index);
                }}
              />
            ))}
          </div>
        </div>
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
