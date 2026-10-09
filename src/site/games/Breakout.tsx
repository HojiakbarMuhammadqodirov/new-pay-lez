import { useCallback, useEffect, useRef, useState } from 'react';
import { useCopy } from '../i18n/context';
import { fill } from '../i18n/currency';
import { usePalette } from '../theme/context';
import { BREAKOUT_COLS, BREAKOUT_ROWS, arcadeMilestones, arcadePoints, breakoutWall, localRng } from './arcade';
import { PerfectBar, RoundClock } from './hud';

/**
 * Breakout — a paddle, a ball, and a wall of bricks to break. One ball: losing
 * it ends the round. Scored on the share of the wall broken.
 *
 * ## What the server can and cannot know
 *
 * With a `session` the wall is the server's (`content.wall` — which bricks take
 * one hit and which two). Whether the ball really touched a brick is a fact
 * about this screen, the limit Bird's Flight and Food Ninja already state; so
 * the report names the **ids** of the bricks broken, the server counts only
 * bricks its wall has, each once, and no more than the round's duration allows
 * (`server/domain/arcade.ts`). Without one the wall is `localRng`'s.
 *
 * ## Per frame, nothing goes through React
 *
 * Ball, paddle and wall live in refs and are stepped and drawn in one
 * `requestAnimationFrame` loop, in sub-steps of a few milliseconds so a fast
 * ball cannot pass through a brick between two frames. React hears only about
 * the count. Everything is the theme's `primary`, at alphas: a two-hit brick is
 * the heavier one.
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
  const palette = usePalette();
  const remote = Boolean(session && serverRound?.wall?.length === BREAKOUT_COLS * BREAKOUT_ROWS);

  const wall = useRef<number[]>(remote ? serverRound!.wall.slice() : breakoutWall(localRng));
  const total = wall.current.length;
  const broken = useRef<number[]>([]);
  const paddle = useRef(0.5);
  const ball = useRef<Ball>({ x: 0.5, y: PADDLE_Y - BALL_R * 2, vx: 0, vy: 0 });
  const keys = useRef({ left: false, right: false });
  const canvas = useRef<HTMLCanvasElement>(null);
  const colors = useRef(palette);
  colors.current = palette;

  const [phase, setPhase] = useState<'ready' | 'playing' | 'over'>('ready');
  const [count, setCount] = useState(0);
  const finished = useRef(false);

  const brickRect = (i: number) => {
    const col = i % BREAKOUT_COLS;
    const row = Math.floor(i / BREAKOUT_COLS);
    const w = (1 - GAP * (BREAKOUT_COLS + 1)) / BREAKOUT_COLS;
    return { x: GAP + col * (w + GAP), y: WALL_TOP + row * (BRICK_H + GAP), w, h: BRICK_H };
  };

  const paint = useCallback(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const ratio = window.devicePixelRatio || 1;
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (element.width !== Math.round(width * ratio)) {
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
    }
    const k = width;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = colors.current.primary;

    wall.current.forEach((hp, i) => {
      if (hp <= 0) return;
      const r = brickRect(i);
      context.globalAlpha = hp >= 2 ? 0.95 : 0.45;
      context.beginPath();
      context.roundRect(r.x * k, r.y * k, r.w * k, r.h * k, 4);
      context.fill();
    });
    context.globalAlpha = 1;

    context.beginPath();
    context.roundRect((paddle.current - PADDLE_W / 2) * k, PADDLE_Y * k, PADDLE_W * k, PADDLE_H * k, PADDLE_H * k);
    context.fill();

    context.beginPath();
    context.arc(ball.current.x * k, ball.current.y * k, BALL_R * k, 0, Math.PI * 2);
    context.fill();
  }, []);

  useEffect(() => {
    paint();
  }, [paint, palette]);

  const launch = () => {
    const angle = (-Math.PI / 2) + (Math.random() - 0.5) * 0.6;
    ball.current = { x: paddle.current, y: PADDLE_Y - BALL_R * 2, vx: Math.cos(angle) * SPEED, vy: Math.sin(angle) * SPEED };
    setPhase('playing');
  };

  useEffect(() => {
    if (phase !== 'playing') return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      let left = Math.min(50, now - last);
      last = now;
      let ended = false;
      while (left > 0 && !ended) {
        const dt = Math.min(STEP_MS, left) / 1000;
        left -= STEP_MS;
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

        if (b.y - BALL_R > ASPECT || broken.current.length === total) ended = true;
      }
      paint();
      if (ended) {
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
      onDone(arcadePoints(performance), arcadeMilestones(performance), n === total, n, { broken: broken.current.slice() });
    }, END_MS);
    return () => window.clearTimeout(timer);
  }, [phase, onDone, total]);

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

  return (
    <div className="round ar-round">
      <div className="round-top">
        <span className="round-count">{fill(copy.breakout.broken, { n: String(count), total: String(total) })}</span>
        <RoundClock running={phase === 'playing'} />
      </div>
      <PerfectBar performance={total === 0 ? 0 : (count / total) * 100} label={copy.perfectProgress} />

      <div className="ar-field ar-tall">
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
          <div className="ar-overlay" role="status">
            <p>{count === total ? copy.breakout.cleared : copy.breakout.over}</p>
          </div>
        )}
      </div>

      <button type="button" className="link-btn round-quit" onClick={onQuit}>
        {copy.quit}
      </button>
    </div>
  );
}
