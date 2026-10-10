import { useCallback, useEffect, useRef, useState } from 'react';
import { useCopy } from '../i18n/context';
import { fill } from '../i18n/currency';
import { useTheme } from '../theme/context';
import {
  SNAKE_COLS,
  SNAKE_PER_FOOD,
  SNAKE_PERFECT,
  SNAKE_ROUND_MS,
  SNAKE_ROWS,
  arcadeMilestones,
  arcadePoints,
  localRng,
  snakeFoods,
  snakeOutOfTime,
  snakeStart,
  snakeStep,
  snakeTickMs,
  type Dir,
  type SnakeState,
} from './arcade';
import { PerfectBar, RoundClock } from './hud';
import { FLOCK } from './flock/config';
import { createFlockScene, type FlockScene, type FlockView } from './flock/scene';

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
 * ## The round ends: a crash, or the clock
 *
 * Ninety seconds (`content.roundMs`, else `SNAKE_ROUND_MS`) of the game's own
 * clock — the ticks played, `state.ms` — counted down in the header. When the
 * next tick would run past it the round is over, and the server's replay stops
 * on the very same tick (`snakeOutOfTime`, one line on each side), so a turn
 * this screen never played is a turn the server never plays either. A clock of
 * ticks rather than of the wall is also what makes a hidden tab harmless: the
 * frames stop, the ticks stop, and the round resumes with the time it had.
 *
 * ## Per frame, nothing goes through React
 *
 * The board lives in a ref and is drawn in one `requestAnimationFrame` loop that
 * advances a tick whenever enough time has passed; React hears only about the
 * count when it changes.
 *
 * ## What it looks like: Pico's Flock
 *
 * The rules are a snake's; the picture is Pico leading a line of chicks across
 * a garden lawn, a chick for every treat (`flock/scene.ts`, palette and
 * proportions in `flock/config.ts`). The scene only watches — this file tells it
 * each tick that happened and hands it the board every frame, with how far
 * through the current tick the frame is, so the birds glide between cells while
 * the game stays a grid of ticks. Nothing the scene does reaches `snakeStep`,
 * the turns or the clock. Between rounds (the ready veil, the end) a second,
 * ambient loop keeps the garden alive; it runs only while the field is on
 * screen, and not at all under reduced motion.
 */

const END_MS = 900;
/** Turns pressed faster than the ticks wait here, two deep, so a quick double
    turn is not lost — and is applied one per tick, which is what is recorded. */
const QUEUE = 2;
/**
 * The most one frame may advance the board, in ms. A frame is ~16 ms and a tick
 * 70–140, so this only ever bites on a stall — and the one that mattered was a
 * tab coming back from the background, whose first frame carried every second
 * it had been hidden and ran the snake that many ticks blind into a wall.
 */
const MAX_FRAME_MS = 100;

/**
 * Whether the move that ended the round went into the hedge (rather than into
 * the flock) — for the picture only: leaves fly off a hedge, not off a chick.
 */
function hitsWall(s: SnakeState): boolean {
  const x = (s.body[0] % SNAKE_COLS) + [0, 1, 0, -1][s.dir];
  const y = Math.floor(s.body[0] / SNAKE_COLS) + [-1, 0, 1, 0][s.dir];
  return x < 0 || y < 0 || x >= SNAKE_COLS || y >= SNAKE_ROWS;
}

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
  serverRound?: { foods: number[]; roundMs?: number };
  /** Points (local reckoning), fifths of a perfect round, a perfect round, foods eaten, the report. */
  onDone: (points: number, correct: number, won: boolean, eaten: number, report: Record<string, unknown>) => void;
  onQuit: () => void;
}) {
  const copy = useCopy().games;
  const { theme } = useTheme();
  const remote = Boolean(session && serverRound?.foods?.length);
  /* The server's clock when it sent one — it replays to that figure, so the
     screen must stop on it — and the mirror's otherwise. */
  const sent = Number(serverRound?.roundMs);
  const roundMs = remote && Number.isFinite(sent) && sent > 0 ? sent : SNAKE_ROUND_MS;

  const list = useRef<number[]>(remote ? serverRound!.foods : snakeFoods(localRng));
  const state = useRef<SnakeState>(snakeStart(list.current));
  const queue = useRef<Dir[]>([]);
  const turns = useRef<Array<[number, number]>>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  /* The picture: a painter that watches the ticks, never takes one. */
  const reduced = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  /* Made once: a `useRef(create…())` would build a scene on every render and throw it away. */
  const sceneRef = useRef<FlockScene | null>(null);
  if (!sceneRef.current) sceneRef.current = createFlockScene(reduced.current);
  const scene = sceneRef as { current: FlockScene };
  const themeRef = useRef(theme);
  themeRef.current = theme;
  /* The body before the last tick, where the glide starts — drawing only. */
  const from = useRef<readonly number[]>(state.current.body);
  const view = useRef<FlockView>({ body: [], from: [], p: 1, food: -1, eaten: 0, phase: 'ready', end: null });

  const [phase, setPhase] = useState<'ready' | 'playing' | 'over'>('ready');
  const [eaten, setEaten] = useState(0);
  const [left, setLeft] = useState(Math.ceil(roundMs / 1000));
  /* How the round ended, for the end veil's line: the wall or tail, or the clock. */
  const [end, setEnd] = useState<'crash' | 'time'>('crash');
  /* The same two, as the painter reads them — refs, so a frame never waits on a render. */
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const endRef = useRef<'crash' | 'time' | null>(null);
  const finished = useRef(false);
  /* The parent hands a fresh `onDone` on every render; the timer that banks the
     round must not be re-armed by each one, or a busy parent postpones it. */
  const done = useRef(onDone);
  done.current = onDone;

  const press = useCallback(
    (dir: Dir) => {
      if (phase !== 'playing') return;
      if (queue.current.length < QUEUE) queue.current.push(dir);
    },
    [phase],
  );

  /* Draw the board as it stands, `p` of the way through the current tick.
     Called by the loop, by the ambient loop between rounds, and at rest. */
  const paint = useCallback((now: number, p: number) => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, FLOCK.maxRatio);
    const size = element.clientWidth;
    if (!(size > 0)) return;
    if (element.width !== Math.round(size * ratio)) {
      element.width = Math.round(size * ratio);
      element.height = Math.round(size * ratio);
    }
    scene.current.resize(size, ratio, themeRef.current === 'light' ? 'light' : 'dark');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, size, size);
    const s = state.current;
    const v = view.current;
    v.body = s.body;
    v.from = from.current;
    v.p = p;
    v.food = s.food;
    v.eaten = s.eaten;
    v.phase = phaseRef.current;
    v.end = endRef.current;
    scene.current.paint(context, now, v);
  }, []);

  /* At rest: on mount, a theme switch, a resize. */
  useEffect(() => {
    paint(performance.now(), 1);
    const onResize = () => paint(performance.now(), 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [paint, theme]);

  /* Between rounds the garden stays alive — the ready veil and the end beat —
     but only while the field is on screen, and never under reduced motion,
     where the one paint above (and one on the end) is the whole picture. */
  useEffect(() => {
    if (phase === 'playing') return;
    if (reduced.current) {
      paint(performance.now(), 1);
      return;
    }
    const element = canvas.current;
    let visible = true;
    const observer =
      element && 'IntersectionObserver' in window
        ? new IntersectionObserver(([entry]) => {
            visible = entry?.isIntersecting ?? true;
          })
        : null;
    if (element) observer?.observe(element);
    let frame = 0;
    const loop = (now: number) => {
      if (visible) paint(now, 1);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [phase, paint]);

  /* The loop: a tick whenever its time is up, until a crash or the clock. */
  useEffect(() => {
    if (phase !== 'playing') return;
    let frame = 0;
    let last = performance.now();
    let pending = 0;
    let shown = -1;
    const loop = (now: number) => {
      pending += Math.min(MAX_FRAME_MS, Math.max(0, now - last));
      last = now;
      let s = state.current;
      let timeUp = false;
      while (!s.dead && pending >= snakeTickMs(s.eaten)) {
        /* The clock, before the tick: exactly where the replay stops. */
        if (snakeOutOfTime(s, roundMs)) {
          timeUp = true;
          break;
        }
        pending -= snakeTickMs(s.eaten);
        const dir = queue.current.shift();
        if (dir !== undefined) turns.current.push([s.tick, dir]);
        const before = s.eaten;
        const prev = s;
        s = snakeStep(s, list.current, dir);
        if (s.eaten !== before) setEaten(s.eaten);
        /* Drawing only, after the tick is taken: where the glide starts, and
           what the tick did. A crash moves nothing, so it glides nowhere. */
        from.current = s.dead ? s.body : prev.body;
        if (!s.dead) scene.current.step(prev.body, s.body, s.eaten !== before, s.eaten, now, snakeTickMs(s.eaten));
      }
      state.current = s;
      const remaining = Math.max(0, Math.ceil((roundMs - s.ms) / 1000));
      if (remaining !== shown) {
        shown = remaining;
        setLeft(remaining);
      }
      if (s.dead || timeUp) {
        endRef.current = timeUp ? 'time' : 'crash';
        if (timeUp) scene.current.timeUp(now);
        else scene.current.crash(s.dir, hitsWall(s), now);
      }
      paint(now, s.dead || timeUp ? 1 : pending / snakeTickMs(s.eaten));
      if (s.dead || timeUp) {
        setEnd(timeUp ? 'time' : 'crash');
        if (timeUp) setLeft(0);
        setPhase('over');
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase, paint, roundMs]);

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
      done.current(arcadePoints(performance), arcadeMilestones(performance), s.eaten >= SNAKE_PERFECT, s.eaten, {
        turns: turns.current,
        ticks: s.tick,
      });
    }, END_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const origin = useRef<{ x: number; y: number } | null>(null);

  return (
    <div className="round ar-round">
      <div className="round-top">
        <span className="round-count">{fill(copy.snake.eaten, { n: `${eaten} / ${SNAKE_PERFECT}` })}</span>
        <RoundClock left={left} />
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
          <div className="ar-overlay ar-ready-snug">
            <p>{copy.snake.intro}</p>
            <button type="button" className="btn btn-solid" onClick={() => setPhase('playing')}>
              {copy.snake.start}
            </button>
          </div>
        )}
        {phase === 'over' && (
          <div className="ar-overlay ar-over-late" role="status">
            <p>{end === 'time' ? copy.roundTime : copy.snake.over}</p>
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

      {/* Off once the round is over: it is being banked, and a Quit pressed in
          that beat would abandon a finished round and lose what it scored. */}
      <button type="button" className="link-btn round-quit" onClick={onQuit} disabled={phase === 'over'}>
        {copy.quit}
      </button>
    </div>
  );
}
