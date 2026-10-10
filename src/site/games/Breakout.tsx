import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../../components/GlobeHero/hooks/useReducedMotion';
import { useCopy } from '../i18n/context';
import { fill } from '../i18n/currency';
import { useTheme } from '../theme/context';
import {
  BREAKOUT_COLS,
  BREAKOUT_ROUND_SECONDS,
  BREAKOUT_ROWS,
  arcadeMilestones,
  arcadePoints,
  breakoutWall,
  localRng,
} from './arcade';
import { BALL_SCENE } from './ball/config';
import { BallScene, type BallFrame, type BallView } from './ball/scene';
import { EndVeil, PerfectBar, RoundClock } from './hud';

/**
 * Pico's Ball (`breakout`) — a paddle, a ball, and a wall of bricks to break.
 * One ball: losing it ends the round. Scored on the share of the wall broken.
 * The game the server calls `breakout`, under the name the app gives it.
 *
 * ## What the server can and cannot know
 *
 * With a `session` the wall is the server's (`content.wall` — which bricks take
 * one hit and which two). Whether the ball really touched a brick is a fact
 * about this screen, the limit Pico's Flight and Food Ninja already state; so
 * the report names the **ids** of the bricks broken, the server counts only
 * bricks its wall has, each once, and no more than the round's duration allows
 * (`server/domain/arcade.ts`). Without one the wall is `localRng`'s.
 *
 * ## The round ends: the ball lost, the wall cleared, or the clock
 *
 * The first two are the rulebook's (Pico's Ball, one ball). The third is
 * `BREAKOUT_ROUND_SECONDS` of play, counted down in the header, and it exists
 * because the first two can both fail to happen: the paddle can send the ball
 * straight up an emptied column and back on to the same spot, and a ball in
 * that loop never falls and never breaks anything. The clock is the game's —
 * the sub-steps actually simulated — so a hidden tab, which stops the frames,
 * stops it too.
 *
 * ## The picture is `ball/scene.ts`, and it only reads
 *
 * The round is drawn as a sandcastle by the sea — dry sand blocks that break
 * at a touch, darker wet ones that take two and crack after the first, a beach
 * ball, and Pico under his surfboard (the paddle) — by `BallScene`, which is
 * handed the wall, the paddle and the ball every frame and never writes to
 * them. It is given the constants below as `BallGeometry`, so every rectangle it
 * draws in is the one this file collides with. Below the field it draws a strip
 * for Pico to fly in; the field's own bottom edge is still where a ball is
 * lost. Between rounds a second, picture-only loop keeps the sea moving; it
 * steps nothing.
 *
 * ## Per frame, nothing goes through React
 *
 * Ball, paddle and wall live in refs and are stepped and drawn in one
 * `requestAnimationFrame` loop, in sub-steps of a few milliseconds so a fast
 * ball cannot pass through a brick between two frames. React hears only about
 * the count.
 */

const END_MS = 900;
/** The field's own units: 1 wide, `ASPECT` tall. */
const ASPECT = 4 / 3;
const PADDLE_W = 0.2;
const PADDLE_H = 0.022;
const PADDLE_Y = ASPECT - 0.08;
const BALL_R = 0.016;
const WALL_TOP = 0.12;
const BRICK_H = 0.05;
const GAP = 0.008;
/** Field widths per second, rising a little with every brick. */
const SPEED = 0.62;
const SPEED_STEP = 0.008;
const STEP_MS = 4;

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export function Breakout({
  session,
  serverRound,
  onDone,
  onQuit,
}: {
  session?: string;
  serverRound?: { wall: number[] };
  /** Points (local reckoning), fifths of a perfect round, a perfect round, bricks broken, the report. */
  onDone: (points: number, correct: number, won: boolean, broken: number, report: Record<string, unknown>) => void;
  onQuit: () => void;
}) {
  const copy = useCopy().games;
  const { theme, palette } = useTheme();
  const reduced = useReducedMotion();
  const remote = Boolean(session && serverRound?.wall?.length === BREAKOUT_COLS * BREAKOUT_ROWS);

  const wall = useRef<number[]>(remote ? serverRound!.wall.slice() : breakoutWall(localRng));
  const total = wall.current.length;
  const broken = useRef<number[]>([]);
  const paddle = useRef(0.5);
  const ball = useRef<Ball>({ x: 0.5, y: PADDLE_Y - BALL_R * 2, vx: 0, vy: 0 });
  const keys = useRef({ left: false, right: false });
  const canvas = useRef<HTMLCanvasElement>(null);
  const look = useRef({ theme, accent: palette.primary });
  look.current = { theme, accent: palette.primary };

  const [phase, setPhase] = useState<'ready' | 'playing' | 'over'>('ready');
  const [count, setCount] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(BREAKOUT_ROUND_SECONDS);
  const [end, setEnd] = useState<'lost' | 'cleared' | 'time'>('lost');
  /* Seconds of play simulated so far: the round's clock. */
  const played = useRef(0);
  const finished = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;

  const brickRect = (i: number) => {
    const col = i % BREAKOUT_COLS;
    const row = Math.floor(i / BREAKOUT_COLS);
    const w = (1 - GAP * (BREAKOUT_COLS + 1)) / BREAKOUT_COLS;
    return { x: GAP + col * (w + GAP), y: WALL_TOP + row * (BRICK_H + GAP), w, h: BRICK_H };
  };

  /* The picture: one scene for the round's life, handed this file's geometry. */
  const scene = useRef<BallScene | null>(null);
  if (scene.current === null) {
    scene.current = new BallScene(
      {
        aspect: ASPECT,
        paddleW: PADDLE_W,
        paddleH: PADDLE_H,
        paddleY: PADDLE_Y,
        ballR: BALL_R,
        horizon: BALL_SCENE.horizon,
        brick: brickRect,
      },
      wall.current,
    );
  }
  const view = useRef<BallView>({ phase: 'ready', end: null, reduced });
  view.current.phase = phase;
  view.current.reduced = reduced;
  const frameOf = useRef<BallFrame>({ wall: wall.current, paddle: 0.5, ball: ball.current });

  const paint = useCallback(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, BALL_SCENE.maxRatio);
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
    }
    const s = scene.current!;
    s.configure(width, height, ratio, look.current.theme, look.current.accent);
    const f = frameOf.current;
    f.wall = wall.current;
    f.paddle = paddle.current;
    f.ball = ball.current;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    s.paint(context, f, view.current, performance.now());
  }, []);

  useEffect(() => {
    paint();
  }, [paint, theme, palette]);

  /* A resized field rebuilds the scene's sheets; between frames, nothing else would. */
  useEffect(() => {
    const element = canvas.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => paint());
    observer.observe(element);
    return () => observer.disconnect();
  }, [paint]);

  /* Between rounds the sea still moves and Pico still flaps — and after the
     end the ball drops on into the water. Picture only: this loop steps
     nothing. */
  useEffect(() => {
    if (phase === 'playing' || reduced) return;
    let frame = 0;
    const loop = () => {
      paint();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase, reduced, paint]);

  const launch = () => {
    const angle = (-Math.PI / 2) + (Math.random() - 0.5) * 0.6;
    ball.current = { x: paddle.current, y: PADDLE_Y - BALL_R * 2, vx: Math.cos(angle) * SPEED, vy: Math.sin(angle) * SPEED };
    setPhase('playing');
  };

  useEffect(() => {
    if (phase !== 'playing') return;
    let frame = 0;
    let last = performance.now();
    let shown = -1;
    const loop = (now: number) => {
      let left = Math.min(50, now - last);
      last = now;
      let ended: 'lost' | 'cleared' | 'time' | null = null;
      while (left > 0 && !ended) {
        const dt = Math.min(STEP_MS, left) / 1000;
        left -= STEP_MS;
        played.current += dt;
        const move = (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0);
        paddle.current = Math.min(1 - PADDLE_W / 2, Math.max(PADDLE_W / 2, paddle.current + move * 1.2 * dt));

        const b = ball.current;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); }
        if (b.x > 1 - BALL_R) { b.x = 1 - BALL_R; b.vx = -Math.abs(b.vx); }
        if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy); }

        /* The paddle sends the ball off at an angle set by where it landed —
           the one thing a player steers with — never flatter than 25°. */
        if (b.vy > 0 && b.y + BALL_R >= PADDLE_Y && b.y + BALL_R <= PADDLE_Y + PADDLE_H + 0.02 &&
            Math.abs(b.x - paddle.current) <= PADDLE_W / 2 + BALL_R) {
          const offset = Math.max(-1, Math.min(1, (b.x - paddle.current) / (PADDLE_W / 2)));
          const speed = Math.hypot(b.vx, b.vy);
          const angle = offset * (Math.PI / 2 - 0.44);
          b.vx = Math.sin(angle) * speed;
          b.vy = -Math.cos(angle) * speed;
          b.y = PADDLE_Y - BALL_R;
        }

        for (let i = 0; i < wall.current.length; i += 1) {
          if (wall.current[i] <= 0) continue;
          const r = brickRect(i);
          const nx = Math.max(r.x, Math.min(b.x, r.x + r.w));
          const ny = Math.max(r.y, Math.min(b.y, r.y + r.h));
          if ((b.x - nx) ** 2 + (b.y - ny) ** 2 > BALL_R * BALL_R) continue;
          /* Reflect on the axis of least overlap: a side hit turns the ball
             back sideways, a face hit turns it back vertically. */
          const overlapX = Math.min(b.x + BALL_R - r.x, r.x + r.w - (b.x - BALL_R));
          const overlapY = Math.min(b.y + BALL_R - r.y, r.y + r.h - (b.y - BALL_R));
          if (overlapX < overlapY) b.vx = -b.vx;
          else b.vy = -b.vy;
          wall.current[i] -= 1;
          if (wall.current[i] === 0) {
            broken.current.push(i);
            setCount(broken.current.length);
            const speed = Math.hypot(b.vx, b.vy);
            const scale = (speed + SPEED_STEP) / speed;
            b.vx *= scale;
            b.vy *= scale;
          }
          break;
        }

        if (broken.current.length === total) ended = 'cleared';
        else if (b.y - BALL_R > ASPECT) ended = 'lost';
        else if (played.current >= BREAKOUT_ROUND_SECONDS) ended = 'time';
      }
      const remaining = Math.max(0, Math.ceil(BREAKOUT_ROUND_SECONDS - played.current));
      if (remaining !== shown) {
        shown = remaining;
        setSecondsLeft(remaining);
      }
      view.current.end = ended;
      paint();
      if (ended) {
        setEnd(ended);
        setPhase('over');
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase, paint, total]);

  useEffect(() => {
    const set = (event: KeyboardEvent, on: boolean) => {
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') keys.current.left = on;
      else if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') keys.current.right = on;
      else return;
      event.preventDefault();
    };
    const down = (event: KeyboardEvent) => set(event, true);
    const up = (event: KeyboardEvent) => set(event, false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'over' || finished.current) return;
    const timer = window.setTimeout(() => {
      if (finished.current) return;
      finished.current = true;
      const n = broken.current.length;
      const performance = Math.round((n / total) * 100);
      done.current(arcadePoints(performance), arcadeMilestones(performance), n === total, n, { broken: broken.current.slice() });
    }, END_MS);
    return () => window.clearTimeout(timer);
  }, [phase, total]);

  /* The paddle follows the pointer across the field — mouse or finger. */
  const follow = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    paddle.current = Math.min(1 - PADDLE_W / 2, Math.max(PADDLE_W / 2, x));
    if (phase === 'ready') {
      ball.current = { ...ball.current, x: paddle.current };
      paint();
    }
  };

  const bricks = fill(copy.breakout.broken, { n: String(count), total: String(total) });
  /* The field plus Pico's strip under it, kept within the same share of the
     viewport's height as the other tall fields. */
  const tall = ASPECT + BALL_SCENE.strip;

  return (
    <div className="round ar-round">
      <div className="round-top">
        <span className="round-count">{bricks}</span>
        <RoundClock left={secondsLeft} />
      </div>
      <PerfectBar performance={total === 0 ? 0 : (count / total) * 100} label={copy.perfectProgress} />

      <div
        className="ar-field ar-tall pb-field"
        style={{ aspectRatio: `1 / ${tall}`, maxWidth: `min(26rem, calc(66svh / ${tall}))` }}
      >
        <canvas
          ref={canvas}
          className="ar-canvas"
          role="img"
          aria-label={copy.breakout.fieldLabel}
          onPointerMove={follow}
          onPointerDown={follow}
        />
        {phase === 'ready' && (
          <div className="ar-overlay">
            <p>{copy.breakout.intro}</p>
            <button type="button" className="btn btn-solid" onClick={launch}>
              {copy.breakout.start}
            </button>
          </div>
        )}
        {phase === 'over' && (
          <EndVeil
            title={end === 'cleared' ? copy.breakout.cleared : end === 'time' ? copy.roundTime : copy.breakout.over}
            detail={bricks}
            pose={end === 'cleared' ? 'happy' : end === 'time' ? 'idle' : 'sad'}
          />
        )}
      </div>

      {/* Off once the round is over: it is being banked (see Snake). */}
      <button type="button" className="link-btn round-quit" onClick={onQuit} disabled={phase === 'over'}>
        {copy.quit}
      </button>
    </div>
  );
}
