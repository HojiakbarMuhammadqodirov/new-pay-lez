import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useCopy } from '../i18n/context';
import { fill } from '../i18n/currency';
import { usePalette } from '../theme/context';
import { ZUMA_CHAIN, ZUMA_COLORS, arcadeMilestones, arcadePoints, localRng, zumaChain, zumaShots } from './arcade';
import { PerfectBar, RoundClock } from './hud';

/**
 * Zuma — a chain of balls rolls along a winding track towards a hole; shoot a
 * ball into it, and three or more of one kind touching are gone. When a gap
 * closes and the two sides match, they go too. The round ends when the chain is
 * cleared or its front reaches the hole, and it is scored on the share of the
 * chain cleared.
 *
 * ## What the server can and cannot know
 *
 * With a `session` the chain and the shooter's balls are the server's
 * (`content.chain`, `content.shots`). Whether a shot met the chain where the
 * screen says is a fact about the screen, so the report is the number of
 * **chain** balls cleared — shot balls never count — held by the server to what
 * the chain holds and what the round's duration allows. Without one both come
 * from `localRng`.
 *
 * ## Four kinds on one accent
 *
 * The original paints each kind its own colour, which this palette cannot. A
 * kind here is a **mark** inside the ball — a dot, a ring, a bar, a cross —
 * drawn in the page's ground on the accent, the texture-not-hue rule the root
 * `CLAUDE.md` gives for exactly this case. The marks differ in shape, not
 * shade, so they stay apart in both themes.
 *
 * ## Per frame, nothing goes through React
 *
 * The chain, the shot in flight and the track live in refs; React hears about
 * the count when it moves.
 */

const END_MS = 900;
const ASPECT = 4 / 3;
/** A ball's diameter, in field widths. */
const D = 0.06;
/** How fast the chain rolls on, and how fast it rolls in at the start. */
const CRAWL = 0.03;
const ENTRY = 0.5;
const ENTRY_UNTIL = 1.1;
const SHOT_SPEED = 1.7;
const SHOOTER = { x: 0.5, y: ASPECT - 0.1 };

interface Ball {
  kind: number;
  /** A chain ball (counts) or a shot that joined it (does not). */
  chain: boolean;
}

/** The track: three runs across the field joined by half-turns, ending in the hole. */
function track(): { pts: Array<[number, number]>; at: number[] } {
  const pts: Array<[number, number]> = [];
  const rows = [0.16, 0.42, 0.68];
  const left = 0.1;
  const right = 0.9;
  const turn = (rows[1] - rows[0]) / 2;
  for (let r = 0; r < rows.length; r += 1) {
    const forward = r % 2 === 0;
    for (let i = 0; i <= 20; i += 1) {
      const t = i / 20;
      pts.push([forward ? left + (right - left) * t : right - (right - left) * t, rows[r]]);
    }
    if (r < rows.length - 1) {
      const cx = forward ? right : left;
      const cy = rows[r] + turn;
      for (let i = 1; i < 16; i += 1) {
        const a = -Math.PI / 2 + (Math.PI * i) / 16;
        pts.push([cx + (forward ? 1 : -1) * Math.cos(a) * turn, cy + Math.sin(a) * turn]);
      }
    }
  }
  const at = [0];
  for (let i = 1; i < pts.length; i += 1) {
    at.push(at[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return { pts, at };
}

export function Zuma({
  session,
  serverRound,
  onDone,
  onQuit,
}: {
  session?: string;
  serverRound?: { chain: number[]; shots: number[] };
  /** Points (local reckoning), fifths of a perfect round, a perfect round, chain balls cleared, the report. */
  onDone: (points: number, correct: number, won: boolean, cleared: number, report: Record<string, unknown>) => void;
  onQuit: () => void;
}) {
  const copy = useCopy().games;
  const palette = usePalette();
  const remote = Boolean(session && serverRound?.chain?.length);
  const path = useMemo(track, []);
  const length = path.at[path.at.length - 1];

  const shots = useRef<number[]>(remote ? serverRound!.shots : zumaShots(localRng));
  const chain = useRef<Ball[]>((remote ? serverRound!.chain : zumaChain(localRng)).map((kind) => ({ kind, chain: true })));
  /** Where the front ball is along the track. Balls behind sit `D` apart. */
  const head = useRef(0);
  const shotIndex = useRef(0);
  const loaded = useRef<[number, number]>([shots.current[0] ?? 0, shots.current[1] ?? 0]);
  const flying = useRef<{ x: number; y: number; vx: number; vy: number; kind: number } | null>(null);
  const aimAt = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.4 });
  const clearedRef = useRef(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const colors = useRef(palette);
  colors.current = palette;

  const [phase, setPhase] = useState<'ready' | 'playing' | 'over'>('ready');
  const [cleared, setCleared] = useState(0);
  const [next, setNext] = useState<[number, number]>(loaded.current);
  const finished = useRef(false);

  /** A point `s` along the track, or null before its start. */
  const pointAt = useCallback(
    (s: number): [number, number] | null => {
      if (s < 0) return null;
      if (s >= length) return path.pts[path.pts.length - 1];
      let i = 1;
      while (path.at[i] < s) i += 1;
      const t = (s - path.at[i - 1]) / (path.at[i] - path.at[i - 1]);
      const a = path.pts[i - 1];
      const b = path.pts[i];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    },
    [length, path],
  );

  const drawBall = (context: CanvasRenderingContext2D, x: number, y: number, r: number, kind: number) => {
    context.fillStyle = colors.current.primary;
    context.beginPath();
    context.arc(x, y, r, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = colors.current.background;
    context.strokeStyle = colors.current.background;
    context.lineWidth = Math.max(1.5, r * 0.22);
    context.beginPath();
    if (kind === 0) {
      context.arc(x, y, r * 0.28, 0, Math.PI * 2);
      context.fill();
    } else if (kind === 1) {
      context.arc(x, y, r * 0.45, 0, Math.PI * 2);
      context.stroke();
    } else if (kind === 2) {
      context.moveTo(x - r * 0.5, y);
      context.lineTo(x + r * 0.5, y);
      context.stroke();
    } else {
      context.moveTo(x - r * 0.4, y - r * 0.4);
      context.lineTo(x + r * 0.4, y + r * 0.4);
      context.moveTo(x + r * 0.4, y - r * 0.4);
      context.lineTo(x - r * 0.4, y + r * 0.4);
      context.stroke();
    }
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

    /* The track, faint, and the hole at its end. */
    context.strokeStyle = colors.current.primary;
    context.globalAlpha = 0.18;
    context.lineWidth = D * k * 1.1;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    path.pts.forEach(([x, y], i) => (i === 0 ? context.moveTo(x * k, y * k) : context.lineTo(x * k, y * k)));
    context.stroke();
    context.globalAlpha = 0.6;
    const end = path.pts[path.pts.length - 1];
    context.beginPath();
    context.arc(end[0] * k, end[1] * k, D * k * 0.75, 0, Math.PI * 2);
    context.lineWidth = 3;
    context.stroke();
    context.globalAlpha = 1;

    const r = (D * k) / 2 - 1;
    chain.current.forEach((ball, i) => {
      const at = pointAt(head.current - i * D);
      if (at) drawBall(context, at[0] * k, at[1] * k, r, ball.kind);
    });

    /* The aim line, the shooter and what it holds. */
    context.strokeStyle = colors.current.primary;
    context.globalAlpha = 0.25;
    context.lineWidth = 2;
    context.setLineDash([4, 6]);
    context.beginPath();
    context.moveTo(SHOOTER.x * k, SHOOTER.y * k);
    context.lineTo(aimAt.current.x * k, aimAt.current.y * k);
    context.stroke();
    context.setLineDash([]);
    context.globalAlpha = 1;
    drawBall(context, SHOOTER.x * k, SHOOTER.y * k, r * 1.15, loaded.current[0]);
    context.globalAlpha = 0.6;
    drawBall(context, (SHOOTER.x + 0.1) * k, (SHOOTER.y + 0.03) * k, r * 0.7, loaded.current[1]);
    context.globalAlpha = 1;

    const shot = flying.current;
    if (shot) drawBall(context, shot.x * k, shot.y * k, r, shot.kind);
  }, [path, pointAt]);

  useEffect(() => {
    paint();
  }, [paint, palette]);

  /** Pop a run of three or more around `index`, then keep closing gaps that match. */
  const settle = useCallback((index: number) => {
    let at = index;
    for (;;) {
      const list = chain.current;
      if (at < 0 || at >= list.length) return;
      const kind = list[at].kind;
      let a = at;
      let b = at;
      while (a > 0 && list[a - 1].kind === kind) a -= 1;
      while (b < list.length - 1 && list[b + 1].kind === kind) b += 1;
      if (b - a + 1 < 3) return;
      const gone = list.slice(a, b + 1).filter((ball) => ball.chain).length;
      chain.current = [...list.slice(0, a), ...list.slice(b + 1)];
      /* The front of the chain stays put; a run removed at the front pulls it back. */
      if (a === 0) head.current -= (b + 1) * D;
      clearedRef.current += gone;
      setCleared(clearedRef.current);
      /* The gap closes: the ball now at `a` meets the one before it. */
      at = a > 0 ? a - 1 : -1;
      if (at >= 0 && at + 1 < chain.current.length && chain.current[at + 1].kind !== chain.current[at].kind) return;
    }
  }, []);

  useEffect(() => {
    if (phase !== 'playing') return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      head.current += (head.current < ENTRY_UNTIL ? ENTRY : CRAWL) * dt;

      const shot = flying.current;
      if (shot) {
        shot.x += shot.vx * dt;
        shot.y += shot.vy * dt;
        let hit = -1;
        let nearest = Infinity;
        chain.current.forEach((_, i) => {
          const at = pointAt(head.current - i * D);
          if (!at) return;
          const gap = Math.hypot(at[0] - shot.x, at[1] - shot.y);
          if (gap < D && gap < nearest) {
            nearest = gap;
            hit = i;
          }
        });
        if (hit >= 0) {
          /* In front of the ball it hit, or behind it — whichever side of it the
             shot is on along the track. */
          const ahead = pointAt(head.current - (hit - 0.5) * D);
          const behind = pointAt(head.current - (hit + 0.5) * D);
          const toAhead = ahead ? Math.hypot(ahead[0] - shot.x, ahead[1] - shot.y) : Infinity;
          const toBehind = behind ? Math.hypot(behind[0] - shot.x, behind[1] - shot.y) : Infinity;
          const index = toAhead < toBehind ? hit : hit + 1;
          chain.current = [...chain.current.slice(0, index), { kind: shot.kind, chain: false }, ...chain.current.slice(index)];
          if (index === 0) head.current += D;
          flying.current = null;
          settle(index);
        } else if (shot.x < -0.1 || shot.x > 1.1 || shot.y < -0.1 || shot.y > ASPECT + 0.1) {
          flying.current = null;
        }
      }

      paint();
      const done = clearedRef.current >= ZUMA_CHAIN || chain.current.length === 0 || head.current >= length;
      if (done) {
        setPhase('over');
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase, paint, pointAt, settle, length]);

  useEffect(() => {
    if (phase !== 'over' || finished.current) return;
    const timer = window.setTimeout(() => {
      if (finished.current) return;
      finished.current = true;
      const n = Math.min(ZUMA_CHAIN, clearedRef.current);
      const performance = Math.round((n / ZUMA_CHAIN) * 100);
      onDone(arcadePoints(performance), arcadeMilestones(performance), n >= ZUMA_CHAIN, n, { cleared: n });
    }, END_MS);
    return () => window.clearTimeout(timer);
  }, [phase, onDone]);

  const field = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - box.left) / box.width, y: ((event.clientY - box.top) / box.height) * ASPECT };
  };

  const shoot = (to: { x: number; y: number }) => {
    if (phase !== 'playing' || flying.current) return;
    const dx = to.x - SHOOTER.x;
    const dy = to.y - SHOOTER.y;
    const span = Math.hypot(dx, dy) || 1;
    flying.current = { x: SHOOTER.x, y: SHOOTER.y, vx: (dx / span) * SHOT_SPEED, vy: (dy / span) * SHOT_SPEED, kind: loaded.current[0] };
    shotIndex.current += 1;
    loaded.current = [loaded.current[1], shots.current[(shotIndex.current + 1) % shots.current.length] ?? 0];
    setNext(loaded.current);
  };

  const swap = () => {
    if (phase !== 'playing') return;
    loaded.current = [loaded.current[1], loaded.current[0]];
    setNext(loaded.current);
    paint();
  };

  return (
    <div className="round ar-round">
      <div className="round-top">
        <span className="round-count">{fill(copy.zuma.cleared, { n: String(cleared), total: String(ZUMA_CHAIN) })}</span>
        <RoundClock running={phase === 'playing'} />
      </div>
      <PerfectBar performance={(cleared / ZUMA_CHAIN) * 100} label={copy.perfectProgress} />

      <div className="ar-field ar-tall">
        <canvas
          ref={canvas}
          className="ar-canvas"
          role="img"
          aria-label={copy.zuma.fieldLabel}
          onPointerMove={(event) => {
            aimAt.current = field(event);
            if (phase !== 'playing') paint();
          }}
          onPointerUp={(event) => {
            aimAt.current = field(event);
            shoot(aimAt.current);
          }}
        />
        {phase === 'ready' && (
          <div className="ar-overlay">
            <p>{copy.zuma.intro}</p>
            <button type="button" className="btn btn-solid" onClick={() => setPhase('playing')}>
              {copy.zuma.start}
            </button>
          </div>
        )}
        {phase === 'over' && (
          <div className="ar-overlay" role="status">
            <p>{cleared >= ZUMA_CHAIN ? copy.zuma.won : copy.zuma.over}</p>
          </div>
        )}
      </div>

      <div className="ar-acts">
        {/* The ball in hand and the next one, swappable — the one decision the
            original gives a player besides where to aim. The kind is named for
            a screen reader, since the mark that tells them apart is drawn. */}
        <button type="button" className="btn btn-ghost" onClick={swap} disabled={phase !== 'playing'}>
          {fill(copy.zuma.swap, { now: copy.zuma.kinds[next[0] % ZUMA_COLORS], next: copy.zuma.kinds[next[1] % ZUMA_COLORS] })}
        </button>
        <button type="button" className="link-btn round-quit" onClick={onQuit}>
          {copy.quit}
        </button>
      </div>
    </div>
  );
}
