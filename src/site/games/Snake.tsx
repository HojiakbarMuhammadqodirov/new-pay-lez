import { useCallback, useEffect, useRef, useState } from 'react';
import { useCopy } from '../i18n/context';
import { fill } from '../i18n/currency';
import { usePalette } from '../theme/context';
import { FOODS } from '../content';
import {
  SNAKE_COLS,
  SNAKE_PER_FOOD,
  SNAKE_PERFECT,
  SNAKE_ROWS,
  arcadeMilestones,
  arcadePoints,
  localRng,
  snakeFoods,
  snakeStart,
  snakeStep,
  snakeTickMs,
  type Dir,
  type SnakeState,
} from './arcade';
import { PerfectBar, RoundClock } from './hud';

/**
 * Snake — eat, grow, and do not hit the wall or yourself.
 *
 * ## The server replays this game
 *
 * With a `session` the food list is the server's (`content.foods`), and what
 * this screen sends at the end is not a score but the **turns** it applied,
 * each with the tick it was applied on. The server plays those turns again on
 * the same list with the same rules (`server/domain/arcade.ts`) and counts what
 * that game ate, held to the round's own duration. So the step below must stay
 * the server's step exactly — `games/arcade.ts` says so, and both test suites
 * pin the same cases.
 *
 * Without one it lays its own food with `localRng`: the demo accounts and a dead
 * backend, paid into the local mirror and not ranked.
 *
 * ## Per frame, nothing goes through React
 *
 * The board lives in a ref and is drawn in one `requestAnimationFrame` loop that
 * advances a tick whenever enough time has passed; React hears only about the
 * count when it changes. The snake takes the theme's `primary`, through
 * `usePalette`, because a canvas cannot read a CSS custom property; the food is
 * an emoji, the sanctioned exception.
 */

const END_MS = 900;
/** Turns pressed faster than the ticks wait here, two deep, so a quick double
    turn is not lost — and is applied one per tick, which is what is recorded. */
const QUEUE = 2;

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 0, w: 0, W: 0,
  ArrowRight: 1, d: 1, D: 1,
  ArrowDown: 2, s: 2, S: 2,
  ArrowLeft: 3, a: 3, A: 3,
};

export function Snake({
  session,
  serverRound,
  onDone,
  onQuit,
}: {
  session?: string;
  serverRound?: { foods: number[] };
  /** Points (local reckoning), fifths of a perfect round, a perfect round, foods eaten, the report. */
  onDone: (points: number, correct: number, won: boolean, eaten: number, report: Record<string, unknown>) => void;
  onQuit: () => void;
}) {
  const copy = useCopy().games;
  const palette = usePalette();
  const remote = Boolean(session && serverRound?.foods?.length);

  const list = useRef<number[]>(remote ? serverRound!.foods : snakeFoods(localRng));
  const state = useRef<SnakeState>(snakeStart(list.current));
  const queue = useRef<Dir[]>([]);
  const turns = useRef<Array<[number, number]>>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const colors = useRef(palette);
  colors.current = palette;

  const [phase, setPhase] = useState<'ready' | 'playing' | 'over'>('ready');
  const [eaten, setEaten] = useState(0);
  const finished = useRef(false);

  const press = useCallback(
    (dir: Dir) => {
      if (phase !== 'playing') return;
      if (queue.current.length < QUEUE) queue.current.push(dir);
    },
    [phase],
  );

  /* Draw the board as it stands. Called by the loop and once before it starts. */
  const paint = useCallback(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const ratio = window.devicePixelRatio || 1;
    const size = element.clientWidth;
    if (element.width !== Math.round(size * ratio)) {
      element.width = Math.round(size * ratio);
      element.height = Math.round(size * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size, size);
    const cell = size / SNAKE_COLS;
    const s = state.current;
    const primary = colors.current.primary;

    /* The grid, faint, so the turns have something to be counted against. */
    context.globalAlpha = 0.07;
    context.fillStyle = primary;
    for (let y = 0; y < SNAKE_ROWS; y += 1) {
      for (let x = (y % 2); x < SNAKE_COLS; x += 2) context.fillRect(x * cell, y * cell, cell, cell);
    }
    context.globalAlpha = 1;

    if (s.food >= 0) {
      context.font = `${Math.round(cell * 0.85)}px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(FOODS[0], (s.food % SNAKE_COLS + 0.5) * cell, (Math.floor(s.food / SNAKE_COLS) + 0.5) * cell + 1);
    }

    s.body.forEach((part, i) => {
      const x = part % SNAKE_COLS;
      const y = Math.floor(part / SNAKE_COLS);
      /* The body fades toward the tail, by alpha of the one accent — the head
         is the solid one, which is where the eye has to be. */
      context.globalAlpha = i === 0 ? 1 : Math.max(0.35, 0.85 - i * 0.02);
      context.fillStyle = primary;
      const inset = i === 0 ? 1 : 2;
      context.beginPath();
      context.roundRect(x * cell + inset, y * cell + inset, cell - inset * 2, cell - inset * 2, cell * 0.28);
      context.fill();
    });
    context.globalAlpha = 1;
  }, []);

  useEffect(() => {
    paint();
  }, [paint, palette]);

  /* The loop: a tick whenever its time is up. */
  useEffect(() => {
    if (phase !== 'playing') return;
    let frame = 0;
    let last = performance.now();
    let pending = 0;
    const loop = (now: number) => {
      pending += now - last;
      last = now;
      let s = state.current;
      while (!s.dead && pending >= snakeTickMs(s.eaten)) {
        pending -= snakeTickMs(s.eaten);
        const dir = queue.current.shift();
        if (dir !== undefined) turns.current.push([s.tick, dir]);
        const before = s.eaten;
        s = snakeStep(s, list.current, dir);
        if (s.eaten !== before) setEaten(s.eaten);
      }
      state.current = s;
      paint();
      if (s.dead) {
        setPhase('over');
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase, paint]);

  /* Keys while the round is on screen; default prevented so the page holds still. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const dir = KEY_DIR[event.key];
      if (dir === undefined || event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      press(dir);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  /* Over: a beat to see the crash, then bank — with the turns as the report. */
  useEffect(() => {
    if (phase !== 'over' || finished.current) return;
    const timer = window.setTimeout(() => {
      if (finished.current) return;
      finished.current = true;
      const s = state.current;
      const performance = Math.min(100, s.eaten * SNAKE_PER_FOOD);
      onDone(arcadePoints(performance), arcadeMilestones(performance), s.eaten >= SNAKE_PERFECT, s.eaten, {
        turns: turns.current,
        ticks: s.tick,
      });
    }, END_MS);
    return () => window.clearTimeout(timer);
  }, [phase, onDone]);

  const origin = useRef<{ x: number; y: number } | null>(null);

  return (
    <div className="round ar-round">
      <div className="round-top">
        <span className="round-count">{fill(copy.snake.eaten, { n: `${eaten} / ${SNAKE_PERFECT}` })}</span>
        <RoundClock running={phase === 'playing'} />
      </div>
      <PerfectBar performance={eaten * SNAKE_PER_FOOD} label={copy.perfectProgress} />

      <div className="ar-field ar-square">
        <canvas
          ref={canvas}
          className="ar-canvas"
          role="img"
          aria-label={copy.snake.fieldLabel}
          onPointerDown={(event) => {
            origin.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerUp={(event) => {
            const from = origin.current;
            origin.current = null;
            if (!from) return;
            const dx = event.clientX - from.x;
            const dy = event.clientY - from.y;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) return;
            press(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
          }}
        />
        {phase === 'ready' && (
          <div className="ar-overlay">
            <p>{copy.snake.intro}</p>
            <button type="button" className="btn btn-solid" onClick={() => setPhase('playing')}>
              {copy.snake.start}
            </button>
          </div>
        )}
        {phase === 'over' && (
          <div className="ar-overlay" role="status">
            <p>{copy.snake.over}</p>
          </div>
        )}
      </div>

      {/* A pad for a phone, where a swipe on a 16-cell board is easy to fumble.
          Real buttons, so a keyboard and a screen reader can drive it too. */}
      <div className="ar-pad" role="group" aria-label={copy.snake.padLabel}>
        {([
          [0, '↑', copy.snake.dirs[0]],
          [3, '←', copy.snake.dirs[3]],
          [1, '→', copy.snake.dirs[1]],
          [2, '↓', copy.snake.dirs[2]],
        ] as Array<[Dir, string, string]>).map(([dir, glyph, label]) => (
          <button
            key={dir}
            type="button"
            className="ar-pad-btn"
            data-dir={dir}
            aria-label={label}
            disabled={phase !== 'playing'}
            onPointerDown={(event) => {
              event.preventDefault();
              press(dir);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                press(dir);
              }
            }}
          >
            <span aria-hidden>{glyph}</span>
          </button>
        ))}
      </div>

      <button type="button" className="link-btn round-quit" onClick={onQuit}>
        {copy.quit}
      </button>
    </div>
  );
}
