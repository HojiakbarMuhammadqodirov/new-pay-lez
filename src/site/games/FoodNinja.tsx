import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useCopy } from '../i18n/context';
import { fill } from '../i18n/currency';
import { usePalette } from '../theme/context';
import { ninjaMilestones, ninjaPoints, NINJA_PERFECT, NINJA_PER_FOOD } from '../auth/player';
import { PerfectBar } from './hud';
import { sendMove } from '../api/consumer';
import { FOODS } from '../content';
import { DURATION_MS, MAX_PER_SWIPE, RADIUS, localRng, positionAt, schedule, type Flyer } from './ninjaField';

/**
 * Food Ninja — foods are thrown up from the bottom of the field; swipe through
 * them to slice them. Sixty seconds, no bombs, and the waves grow and quicken as
 * the round goes on. Scored per food (see `ninjaField.ts` and the rulebook map
 * in `server/config.ts`).
 *
 * ## The server's round, drawn here
 *
 * With a `session` the schedule — every food, when it is thrown, from where and
 * how high — is the server's (`content.flyers`); this screen only moves the foods
 * along it. When the player presses Start, a `start` event stamps the server's
 * clock, and every swipe that cuts something sends the ids it cut as a `slice`
 * event. The server credits each one only while that food is really in the air
 * by its own clock, once, and never more than a swipe can cut; the finish is
 * scored on what it credited. The count on screen is this screen's own, for
 * immediate feedback — the result card names the server's.
 *
 * Without one the screen throws its own round with `localRng`: the demo
 * accounts and a dead backend, paid into the local mirror and not ranked.
 *
 * ## Per frame, nothing goes through React
 *
 * The root `CLAUDE.md`'s load-bearing rule. The foods, the blade and the halves
 * of a sliced food live in refs and are drawn in one `requestAnimationFrame`
 * loop; React state changes only when the count or the whole second on the clock
 * does. The canvas takes the theme's `primary` for the blade, through
 * `usePalette` as every canvas here does, because a canvas cannot read a CSS
 * custom property; the foods are emoji, the sanctioned exception.
 */

/** How long a sliced food's halves stay on screen. */
const HALVES_MS = 600;
/** How long a point of the blade trail lasts. */
const TRAIL_MS = 140;
/** A beat after the clock runs out before the result card. */
const END_MS = 900;

interface Slice {
  flyer: Flyer;
  at: number;
  x: number;
  y: number;
}

/** Whether the segment p→q passes within `r` of the point c. All in pixels. */
function crosses(px: number, py: number, qx: number, qy: number, cx: number, cy: number, r: number): boolean {
  const dx = qx - px;
  const dy = qy - py;
  const length = dx * dx + dy * dy;
  const k = length === 0 ? 0 : Math.max(0, Math.min(1, ((cx - px) * dx + (cy - py) * dy) / length));
  const ex = px + k * dx - cx;
  const ey = py + k * dy - cy;
  return ex * ex + ey * ey <= r * r;
}

export function FoodNinja({
  session,
  serverRound,
  onDone,
  onQuit,
}: {
  /** The server round in flight. Absent for a round this file throws itself. */
  session?: string;
  /** What `/v1/games/sessions` threw. Arrives with `session`. */
  serverRound?: { flyers: Flyer[]; durationMs?: number };
  /** Points (local reckoning), fifths of a perfect round, a perfect round, foods sliced. */
  onDone: (points: number, correct: number, won: boolean, sliced: number) => void;
  onQuit: () => void;
}) {
  const copy = useCopy().games;
  const palette = usePalette();
  const remote = session && Array.isArray(serverRound?.flyers) ? session : null;
  const duration = (remote && serverRound?.durationMs) || DURATION_MS;

  const flyers = useRef<Flyer[]>(remote ? serverRound!.flyers : schedule(localRng));
  const [phase, setPhase] = useState<'ready' | 'starting' | 'playing' | 'over'>('ready');
  const [count, setCount] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(duration / 1000));
  const [failed, setFailed] = useState(false);

  const canvas = useRef<HTMLCanvasElement | null>(null);
  const startedAt = useRef(0);
  const sliced = useRef(new Set<number>());
  const halves = useRef<Slice[]>([]);
  const trail = useRef<Array<{ x: number; y: number; at: number }>>([]);
  const stroke = useRef<number[]>([]);
  const seq = useRef(0);
  const confirmed = useRef(0);
  const inFlight = useRef<Promise<unknown>[]>([]);
  const finished = useRef(false);
  const blade = useRef(palette.primary);
  blade.current = palette.primary;

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /* Send what one swipe cut. A swipe through more than the server believes a
     swipe can cut is sent as consecutive swipes — rare, and every id is still
     checked against the schedule. */
  const report = useCallback(
    (ids: number[]) => {
      if (!remote || ids.length === 0) return;
      for (let i = 0; i < ids.length; i += MAX_PER_SWIPE) {
        const chunk = ids.slice(i, i + MAX_PER_SWIPE);
        const request = sendMove(remote, seq.current++, { ids: chunk }, 'slice')
          .then((reply) => {
            const view = reply.ninja as { sliced?: number } | undefined;
            if (typeof view?.sliced === 'number') confirmed.current = Math.max(confirmed.current, view.sliced);
          })
          .catch(() => {
            if (alive.current) setFailed(true);
          });
        inFlight.current.push(request);
      }
    },
    [remote],
  );

  const begin = useCallback(() => {
    if (phase !== 'ready') return;
    setFailed(false);
    const go = () => {
      if (!alive.current) return;
      startedAt.current = performance.now();
      setPhase('playing');
    };
    if (!remote) {
      go();
      return;
    }
    /* The server's clock starts with this event; the screen's starts when the
       reply lands, so a slow request makes the server's window early rather
       than late — the direction its slack covers. */
    setPhase('starting');
    sendMove(remote, seq.current++, {}, 'start')
      .then(go)
      .catch(() => {
        if (!alive.current) return;
        setFailed(true);
        setPhase('ready');
      });
  }, [phase, remote]);

  /* The loop: move, draw, and end the round on the clock. */
  useEffect(() => {
    if (phase !== 'playing') return;
    let frame = 0;
    let shownSecond = -1;
    const draw = () => {
      const element = canvas.current;
      if (!element) return;
      const context = element.getContext('2d');
      if (!context) return;
      const ratio = window.devicePixelRatio || 1;
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (element.width !== Math.round(width * ratio)) {
        element.width = Math.round(width * ratio);
        element.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const now = performance.now();
      const ms = now - startedAt.current;
      const left = Math.max(0, Math.ceil((duration - ms) / 1000));
      if (left !== shownSecond) {
        shownSecond = left;
        setSecondsLeft(left);
      }

      const radius = RADIUS * width;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = `${Math.round(radius * 1.7)}px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif`;

      /* The foods still in the air. */
      for (const flyer of flyers.current) {
        if (sliced.current.has(flyer.id)) continue;
        const at = positionAt(flyer, ms);
        if (!at) continue;
        context.fillText(FOODS[flyer.kind] ?? '', at.x * width, height - at.y * height);
      }

      /* The halves of what was sliced, parting and fading. */
      halves.current = halves.current.filter((half) => now - half.at < HALVES_MS);
      for (const half of halves.current) {
        const age = (now - half.at) / HALVES_MS;
        const spread = radius * 1.6 * age;
        const fall = radius * 2.5 * age * age;
        context.globalAlpha = 1 - age;
        for (const side of [-1, 1]) {
          context.save();
          context.beginPath();
          context.rect(
            half.x + (side < 0 ? -radius * 2 : 0) + side * spread,
            half.y - radius * 2 + fall,
            radius * 2,
            radius * 4,
          );
          context.clip();
          context.fillText(FOODS[half.flyer.kind] ?? '', half.x + side * spread, half.y + fall);
          context.restore();
        }
        context.globalAlpha = 1;
      }

      /* The blade. */
      trail.current = trail.current.filter((point) => now - point.at < TRAIL_MS);
      if (trail.current.length > 1) {
        context.strokeStyle = blade.current;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        for (let i = 1; i < trail.current.length; i += 1) {
          const point = trail.current[i];
          context.globalAlpha = 1 - (now - point.at) / TRAIL_MS;
          context.lineWidth = 2 + 4 * (i / trail.current.length);
          context.beginPath();
          context.moveTo(trail.current[i - 1].x, trail.current[i - 1].y);
          context.lineTo(point.x, point.y);
          context.stroke();
        }
        context.globalAlpha = 1;
      }

      if (ms >= duration) {
        setPhase('over');
        return;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [phase, duration]);

  /* Over: wait for any slice still on its way, then bank. */
  useEffect(() => {
    if (phase !== 'over' || finished.current) return;
    const local = sliced.current.size;
    const timer = window.setTimeout(() => {
      void Promise.allSettled(inFlight.current).then(() => {
        if (finished.current || !alive.current) return;
        finished.current = true;
        const shown = remote ? confirmed.current : local;
        onDone(ninjaPoints(local), ninjaMilestones(local), local >= NINJA_PERFECT, shown);
      });
    }, END_MS);
    return () => window.clearTimeout(timer);
  }, [phase, remote, onDone]);

  /* The swipe: every pointer move is a segment of the blade, tested against
     every food in the air at this instant. */
  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const cut = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (phase !== 'playing') return;
    const { x, y } = point(event);
    const now = performance.now();
    const last = trail.current[trail.current.length - 1];
    trail.current.push({ x, y, at: now });
    if (!last) return;
    const width = event.currentTarget.clientWidth;
    const height = event.currentTarget.clientHeight;
    const ms = now - startedAt.current;
    const radius = RADIUS * width;
    let hit = 0;
    for (const flyer of flyers.current) {
      if (sliced.current.has(flyer.id)) continue;
      const at = positionAt(flyer, ms);
      if (!at) continue;
      const cx = at.x * width;
      const cy = height - at.y * height;
      if (!crosses(last.x, last.y, x, y, cx, cy, radius)) continue;
      sliced.current.add(flyer.id);
      halves.current.push({ flyer, at: now, x: cx, y: cy });
      stroke.current.push(flyer.id);
      hit += 1;
    }
    if (hit > 0) setCount(sliced.current.size);
  };

  const release = () => {
    trail.current = [];
    const ids = stroke.current;
    stroke.current = [];
    report(ids);
  };

  return (
    <div className="round nj-round">
      <div className="round-top">
        <span className="round-count">{fill(copy.ninja.sliced, { n: `${count} / ${NINJA_PERFECT}` })}</span>
        <span className="round-clock" role="timer">
          {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
        </span>
      </div>
      <PerfectBar performance={count * NINJA_PER_FOOD} label={copy.perfectProgress} />

      <div className="nj-field">
        <canvas
          ref={canvas}
          className="nj-canvas"
          aria-label={copy.ninja.fieldLabel}
          onPointerDown={(event) => {
            if (phase !== 'playing') return;
            event.currentTarget.setPointerCapture(event.pointerId);
            trail.current = [{ ...point(event), at: performance.now() }];
            stroke.current = [];
          }}
          onPointerMove={(event) => {
            if (event.buttons === 0 && event.pointerType === 'mouse') return;
            cut(event);
          }}
          onPointerUp={release}
          onPointerCancel={release}
        />
        {(phase === 'ready' || phase === 'starting') && (
          <div className="nj-overlay">
            <p>{copy.ninja.intro}</p>
            <button type="button" className="btn btn-solid" onClick={begin} disabled={phase === 'starting'}>
              {phase === 'starting' ? copy.loading : copy.ninja.start}
            </button>
          </div>
        )}
        {phase === 'over' && (
          <div className="nj-overlay" role="status">
            <p>{copy.ninja.over}</p>
          </div>
        )}
      </div>

      {failed && <p className="field-error" role="alert">{copy.ninja.failed}</p>}

      <button type="button" className="link-btn round-quit" onClick={onQuit}>
        {copy.quit}
      </button>
    </div>
  );
}
