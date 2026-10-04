import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useCopy } from '../i18n/context';
import { fill } from '../i18n/currency';
import { sendMove } from '../api/consumer';
import {
  CANNON_COLS,
  CANNON_PER_BLOCK,
  CANNON_PERFECT,
  CANNON_ROWS,
  CANNON_TURNS,
  arcadeMilestones,
  arcadePoints,
  cannonFire,
  cannonHits,
  cannonShots,
  cannonStart,
  localRng,
  type CannonState,
} from './arcade';

/**
 * Canon Numbers — numbered blocks march down; a cannon under each column fires
 * a volley straight up it, and every ball takes one off the lowest block it
 * meets. A block at zero is gone. After each volley every block moves down a
 * row and a new row arrives; a block reaching the bottom ends the round, and so
 * does the thirtieth volley. Scored on the blocks destroyed.
 *
 * ## The server holds the board
 *
 * Turn-based, so it is 2048's arrangement (`server/domain/arcade.ts`): with a
 * `session` each volley is sent as `fire {col, from}`, the server applies it and
 * deals the next row from a seed this screen never sees, and its board replaces
 * the prediction. `from` is the turn the volley was aimed at, so a retry after
 * a lost reply is answered with the current board instead of firing twice.
 * Without one the screen deals its own rows with `localRng`.
 *
 * A block's number is carried by the accent's **strength**, the way 2048 carries
 * a tile's value — one accent, read heavier as the number climbs.
 */

interface ServerView {
  board: number[];
  hits: number[];
  turn: number;
  destroyed: number;
  over: boolean;
}

function viewIn(reply: Record<string, unknown>): ServerView | null {
  const view = reply.cannon as Partial<ServerView> | undefined;
  if (!view || !Array.isArray(view.board) || view.board.length !== CANNON_COLS * CANNON_ROWS) return null;
  return {
    board: view.board.map(Number),
    hits: Array.isArray(view.hits) ? view.hits.map(Number) : [],
    turn: Number(view.turn) || 0,
    destroyed: Number(view.destroyed) || 0,
    over: Boolean(view.over),
  };
}

const HIT_MS = 380;
const OVER_MS = 1100;

export function CannonNumbers({
  session,
  serverBoard,
  onDone,
  onQuit,
}: {
  session?: string;
  serverBoard?: { board: number[] };
  /** Points (local reckoning), fifths of a perfect round, a perfect round, blocks destroyed. */
  onDone: (points: number, correct: number, won: boolean, destroyed: number) => void;
  onQuit: () => void;
}) {
  const copy = useCopy().games;
  const remote = session && serverBoard?.board?.length === CANNON_COLS * CANNON_ROWS ? session : null;

  const [state, setState] = useState<CannonState>(() =>
    remote
      ? { board: serverBoard!.board.slice(), turn: 0, spawns: 2, destroyed: 0, over: false }
      : cannonStart(localRng),
  );
  const [hits, setHits] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);
  const finished = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const flash = (cells: number[]) => {
    setHits(new Set(cells));
    window.setTimeout(() => alive.current && setHits(new Set()), HIT_MS);
  };

  const fire = useCallback(
    (col: number) => {
      if (busy || state.over || finished.current) return;
      setFailed(false);
      if (!remote) {
        const fired = cannonFire(state, col, localRng);
        flash(fired.hits);
        setState(fired.state);
        return;
      }
      /* The volley is predicted at once — the hits are a pure function of the
         board — and the server's board, with its new row, replaces it. */
      flash(cannonHits(state.board, col, state.turn));
      setBusy(true);
      void sendMove(remote, seq.current++, { col, from: state.turn }, 'fire')
        .then((reply) => {
          const view = viewIn(reply);
          if (!view) throw new Error('no board in reply');
          if (!alive.current) return;
          setState((was) => ({ ...was, board: view.board, turn: view.turn, destroyed: view.destroyed, over: view.over }));
        })
        .catch(() => alive.current && setFailed(true))
        .finally(() => alive.current && setBusy(false));
    },
    [busy, remote, state],
  );

  useEffect(() => {
    if (!state.over || finished.current) return;
    const timer = window.setTimeout(() => {
      if (finished.current) return;
      finished.current = true;
      const performance = Math.min(100, state.destroyed * CANNON_PER_BLOCK);
      onDone(arcadePoints(performance), arcadeMilestones(performance), state.destroyed >= CANNON_PERFECT, state.destroyed);
    }, OVER_MS);
    return () => window.clearTimeout(timer);
  }, [state, onDone]);

  /* The digit keys fire a column, for a keyboard. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const n = Number(event.key);
      if (!Number.isInteger(n) || n < 1 || n > CANNON_COLS) return;
      event.preventDefault();
      fire(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fire]);

  return (
    <div className="round ar-round">
      <div className="round-top">
        <span className="round-count">{fill(copy.cannon.destroyed, { n: String(state.destroyed) })}</span>
        <span className="round-count">
          {fill(copy.cannon.turn, { n: String(Math.min(state.turn + 1, CANNON_TURNS)), total: String(CANNON_TURNS) })}
        </span>
      </div>

      <div className="cn-board" role="group" aria-label={copy.cannon.boardLabel} data-busy={busy ? 'true' : undefined}>
        {state.board.map((value, index) => (
          <span
            key={index}
            className="cn-cell"
            data-value={value || undefined}
            data-hit={hits.has(index) ? 'true' : undefined}
            data-danger={value > 0 && Math.floor(index / CANNON_COLS) >= CANNON_ROWS - 2 ? 'true' : undefined}
            style={{ '--cn-level': Math.min(6, value) } as CSSProperties}
          >
            {value > 0 ? value : ''}
          </span>
        ))}
      </div>

      <div className="cn-guns">
        {Array.from({ length: CANNON_COLS }, (_, col) => (
          <button
            key={col}
            type="button"
            className="cn-gun"
            disabled={busy || state.over}
            aria-label={fill(copy.cannon.fireLabel, { n: String(col + 1) })}
            onClick={() => fire(col)}
          >
            <span aria-hidden>▲</span>
          </button>
        ))}
      </div>

      {state.over ? (
        <p className="ar-note" role="status">{copy.cannon.over}</p>
      ) : failed ? (
        <p className="field-error" role="alert">{copy.cannon.failed}</p>
      ) : (
        <p className="ar-note">{fill(copy.cannon.hint, { n: String(cannonShots(state.turn)) })}</p>
      )}

      <button type="button" className="link-btn round-quit" onClick={onQuit}>
        {copy.quit}
      </button>
    </div>
  );
}
