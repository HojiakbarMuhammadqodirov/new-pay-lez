import { useCallback, useEffect, useRef, useState } from 'react';
import { useCopy, useLanguage } from '../i18n/context';
import { useTheme } from '../theme/context';
import { useReducedMotion } from '../../components/GlobeHero/hooks/useReducedMotion';
import { fill, plural } from '../i18n/currency';
import { MERGE_BANDS, mergeMilestones, mergePoints } from '../auth/player';
import { PerfectBar } from './hud';
import { sendMove } from '../api/consumer';
import {
  SIZE,
  canMove,
  directionForKey,
  directionForSwipe,
  maxTile,
  newLocalBoard,
  slide,
  spawnLocal,
  type Board,
  type Direction,
} from './board2048';
import { BakeryScene } from './bakery/scene';
import { useSceneCanvas, type SceneHost } from './sceneStage';

/**
 * 2048.
 *
 * Swipe (or press an arrow key) and every tile slides that way; two equal tiles
 * that meet become one of twice the value. The round is scored on the **largest
 * tile** it made, and it has **no clock and no move limit** — it ends when no
 * swipe can change the board, or when the player banks it with the finish
 * button. One energy per finished round, however long it took; an abandoned
 * round (Quit) costs nothing, as everywhere else on this screen.
 *
 * ## Two boards, and only one of them is this file's
 *
 * With a `session` the board is the **server's** (`server/domain/merge2048.ts`):
 * it holds the board, applies each swipe, and places the new tile from a seed
 * this screen never sees, so a modified client cannot make a 2048 it did not
 * play for. Each swipe is predicted here first — the tiles slide at once — and
 * the board the server answers with replaces the prediction, new tile and all.
 * Input waits for that answer before the next swipe, because the next slide
 * depends on where the tile landed.
 *
 * Without one it deals and spawns its own board, which is the demo accounts and
 * anybody playing while the backend is down; those rounds pay into the local
 * mirror through `mergePoints` and are not ranked — the same arrangement Memory
 * Match has.
 *
 * ## The picture is a scene, and the scene decides nothing
 *
 * The board is drawn by `bakery/scene.ts` — Pico's counter, a wooden tray, and
 * glazed tiles whose glaze climbs with their value (see `bakery/config.ts` for
 * the ladder and why it is allowed colours). This component tells the scene
 * what happened — tiles slid, a tile arrived, the server answered, a swipe went
 * nowhere — at the same lines where it updates its own state, and the scene
 * animates it. The rules are untouched by it: the board, the score, the moves
 * and every request are exactly what they were when the board was sixteen
 * `<span>`s. Those spans are still here, visually hidden, so a screen reader
 * reads the same sixteen cells it always did.
 */

interface ServerView {
  board: number[];
  spawned: { index: number; value: number } | null;
  score: number;
  moves: number;
  best: number;
  over: boolean;
}

/** The `merge` block of a move reply, or `null` from a server that sent none. */
function viewIn(reply: Record<string, unknown>): ServerView | null {
  const view = reply.merge as Partial<ServerView> | undefined;
  if (!view || !Array.isArray(view.board) || view.board.length !== SIZE * SIZE) return null;
  return {
    board: view.board.map(Number),
    spawned: view.spawned ?? null,
    score: Number(view.score) || 0,
    moves: Number(view.moves) || 0,
    best: Number(view.best) || 0,
    over: Boolean(view.over),
  };
}

/** How long a finished board stays on screen before the result card. */
const OVER_MS = 1100;

export function Merge2048({
  session,
  serverBoard,
  onDone,
  onQuit,
}: {
  /** The server round in flight. Absent for a board this file deals itself. */
  session?: string;
  /** The opening board `/v1/games/sessions` sent. Arrives with `session`. */
  serverBoard?: { board: number[] };
  /** Points (local reckoning), milestones reached, whether 2048 was made, and the largest tile. */
  onDone: (points: number, correct: number, won: boolean, best: number) => void;
  onQuit: () => void;
}) {
  const copy = useCopy().games;
  const [language] = useLanguage();
  const remote = session && serverBoard?.board?.length === SIZE * SIZE ? session : null;

  const [board, setBoard] = useState<Board>(() => (remote ? serverBoard!.board.slice() : newLocalBoard()));
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [best, setBest] = useState(() => maxTile(board));
  const [over, setOver] = useState(() => !canMove(board));
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  /* ── the scene ── */
  const { theme } = useTheme();
  const reduced = useReducedMotion();
  const canvas = useRef<HTMLCanvasElement>(null);
  const boardEl = useRef<HTMLDivElement>(null);
  const scene = useRef<BakeryScene | null>(null);
  const host = useRef<SceneHost | null>(null);
  if (scene.current === null) {
    /* Made on the first render, before there is an element: it reads the
       board's box through this getter when the stage first measures, and
       nothing paints before that. */
    scene.current = new BakeryScene(() => boardEl.current);
    host.current = scene.current;
  }
  scene.current.setTheme(theme);
  scene.current.setReduced(reduced);
  const stage = useSceneCanvas(canvas, host, reduced);
  /* The opening board grows into its sockets — once, on mount. The board read
     here is the first render's, which is the dealt one. */
  const opening = useRef(board);
  useEffect(() => {
    scene.current?.intro(opening.current);
    stage.invalidate();
  }, [stage]);
  useEffect(() => stage.invalidate(), [theme, stage]);

  /* The server's last word, for putting the board back when a move fails. */
  const confirmed = useRef<ServerView>({ board, spawned: null, score: 0, moves: 0, best, over });
  const seq = useRef(0);
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onDone(mergePoints(best, moves), mergeMilestones(best), best >= 2048, best);
  }, [best, moves, onDone]);

  const move = useCallback(
    (direction: Direction) => {
      if (pending || over || finished.current) return;
      const slid = slide(board, direction);
      /* Not a move in 2048 — and not sent, since the server would refuse it. */
      if (!slid.moved) {
        scene.current?.refuse(direction);
        stage.invalidate();
        return;
      }
      setFailed(false);
      scene.current?.slide(board, direction);
      stage.invalidate();

      if (!remote) {
        const placed = spawnLocal(slid.board);
        const nextMoves = moves + 1;
        setBoard(placed.board);
        setScore((value) => value + slid.gained);
        setMoves(nextMoves);
        setBest((value) => Math.max(value, maxTile(placed.board)));
        scene.current?.spawn(placed.index, placed.board[placed.index] ?? 0);
        setOver(!canMove(placed.board));
        return;
      }

      /* Predicted now, confirmed by the reply. */
      setBoard(slid.board);
      setScore((value) => value + slid.gained);
      setPending(true);
      void sendMove(remote, seq.current++, { dir: direction, from: confirmed.current.moves }, 'move')
        .then((reply) => {
          const view = viewIn(reply);
          if (!view) throw new Error('no board in reply');
          confirmed.current = view;
          setBoard(view.board);
          setScore(view.score);
          setMoves(view.moves);
          setBest(view.best);
          setOver(view.over);
          scene.current?.settle(view.board, view.spawned);
          stage.invalidate();
        })
        .catch(() => {
          /* Back to the last board the server confirmed. The swipe can simply
             be made again; if the server did apply it and only the reply was
             lost, the next move's `from` puts this screen back in step. */
          const last = confirmed.current;
          setBoard(last.board);
          setScore(last.score);
          setMoves(last.moves);
          setFailed(true);
          scene.current?.snap(last.board);
          stage.invalidate();
        })
        .finally(() => setPending(false));
    },
    [board, moves, over, pending, remote, stage],
  );

  /* The arrow keys and WASD, while the round is on screen. Default prevented so
     the page does not scroll under the board on every press. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const direction = directionForKey(event.key);
      if (!direction) return;
      event.preventDefault();
      move(direction);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move]);

  /* Pico's face follows the board: downcast once no swipe can move it. */
  useEffect(() => {
    scene.current?.setOver(over);
    stage.invalidate();
  }, [over, stage]);

  /* A finished board stays up for a beat, so the last merge is seen. */
  useEffect(() => {
    if (!over) return;
    const timer = window.setTimeout(finish, OVER_MS);
    return () => window.clearTimeout(timer);
  }, [over, finish]);

  /* Swipes: where the pointer went down, to where it came up. The board takes
     `touch-action: none`, so a swipe on it moves tiles rather than the page. */
  const origin = useRef<{ x: number; y: number } | null>(null);

  return (
    <div className="round mg-round">
      <div className="round-top">
        <span className="round-count">
          {fill(copy.merge.score, { n: String(score) })}
          <span aria-hidden> · </span>
          {fill(copy.merge.best, { tile: String(best) })}
        </span>
        <span className="round-clock mg-moves">{fill(plural(language, moves, copy.merge.moves), { n: String(moves) })}</span>
      </div>
      {/* 2048 is priced on its largest tile through the rulebook's bands, so
          the bar steps band to band rather than creeping — the honest picture
          of a game where a merge either reaches the next tile or does not. */}
      <PerfectBar
        performance={MERGE_BANDS.find((band) => best >= band.tile)?.performance ?? 0}
        label={copy.perfectProgress}
      />

      {/* The stage takes the swipes, not only the tray: on a phone the scene
          round the board is where a thumb lands as often as not. */}
      <div
        className="mg-stage"
        data-pending={pending ? 'true' : undefined}
        onPointerDown={(event) => {
          origin.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const from = origin.current;
          origin.current = null;
          if (!from) return;
          const direction = directionForSwipe(event.clientX - from.x, event.clientY - from.y);
          if (direction) move(direction);
        }}
        onPointerCancel={() => {
          origin.current = null;
        }}
      >
        <canvas ref={canvas} className="mg-canvas" aria-hidden />
        <div ref={boardEl} className="mg-board" role="group" aria-label={copy.merge.boardLabel}>
          {board.map((value, index) => (
            <span key={index} className="visually-hidden">
              {value > 0 ? value : ''}
            </span>
          ))}
        </div>
      </div>

      {/* The score, for a screen reader, without reading out sixteen cells a move. */}
      <p className="visually-hidden" aria-live="polite">
        {fill(copy.merge.score, { n: String(score) })}
      </p>

      {over ? (
        <p className="mg-note" role="status">{copy.merge.over}</p>
      ) : failed ? (
        <p className="field-error" role="alert">{copy.merge.failed}</p>
      ) : (
        <p className="mg-note">{copy.merge.hint}</p>
      )}

      <div className="mg-acts">
        {/* Banking ends the round and spends its energy, so it waits for a move:
            finishing an untouched board would pay nothing for a whole energy. */}
        <button type="button" className="btn btn-solid" onClick={finish} disabled={moves === 0 || pending}>
          {copy.merge.finish}
        </button>
        <button type="button" className="link-btn round-quit" onClick={onQuit}>
          {copy.quit}
        </button>
      </div>
    </div>
  );
}
