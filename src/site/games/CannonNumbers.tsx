import { useCallback, useEffect, useRef, useState } from 'react';
import { useCopy } from '../i18n/context';
import { fill } from '../i18n/currency';
import { usePalette } from '../theme/context';
import { arcadeMilestones, arcadePoints } from './arcade';
import {
  ASPECT,
  BALL,
  CANNON,
  CANNON_PERFECT,
  END_MS,
  FEEDBACK,
  LEVELS,
  ROUND_SECONDS,
  TARGET,
} from './cannon/config';
import {
  answerValue,
  answers,
  cannonPerformance,
  dealGoal,
  distractorValue,
  equationText,
  levelFor,
  levelIndex,
  netHits,
  type Goal,
} from './cannon/goals';

/**
 * Canon Numbers — a sum at the top, numbered targets drifting down, and a
 * cannon at the bottom. Tap a number (or aim with ← → and fire with Space) and
 * the cannon shoots at it. The number that answers the sum scores and deals a
 * new sum; a wrong number costs a point. Ninety seconds; the sums climb from
 * "3 + 4" to "42 ÷ 6" as the score does. Every tunable is in `cannon/config.ts`
 * and every rule of the maths is in `cannon/goals.ts`.
 *
 * ## What the server can know
 *
 * Whether a ball touched a disc is a fact about this screen — the limit Bird's
 * Flight, Food Ninja and Breakout already state. So on a server session the round
 * is **reported**: `{hits, wrong}` goes to `/finish`, and the server caps the
 * hits by what the round's own duration allows (`scoreCannon` in
 * `server/domain/games.ts`). The session's opening `board` is the held game the
 * Flutter app still plays; this screen does not read it.
 *
 * ## Per frame, nothing goes through React
 *
 * Targets, balls, the barrel and the feedback marks live in refs and are
 * stepped and drawn in one `requestAnimationFrame` loop. React hears the goal
 * when it changes, the score when it changes and the clock in whole seconds.
 *
 * ## Reduced motion
 *
 * The sway, the burst, the shake, the recoil and the rising "+1" are dropped,
 * and targets **hover where they appear** instead of falling, leaving after
 * `TARGET.stillLifeMs`. The shot still travels — it is the one movement the
 * game is made of, and it is short.
 */

interface Target {
  id: number;
  value: number;
  x: number;
  baseX: number;
  y: number;
  sway: number;
  born: number;
  /** `live` can be hit; the other three are on their way out. */
  state: 'live' | 'hit' | 'wrong' | 'gone';
  endAt: number;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Float {
  x: number;
  y: number;
  text: string;
  at: number;
}

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clampAngle = (a: number) => Math.max(-CANNON.maxTilt, Math.min(CANNON.maxTilt, a));

export function CannonNumbers({
  onDone,
  onQuit,
}: {
  /** Points (local reckoning), fifths of a perfect round, a perfect round, net hits, the report. */
  onDone: (points: number, correct: number, won: boolean, net: number, report: Record<string, unknown>) => void;
  onQuit: () => void;
}) {
  const copy = useCopy().games;
  const palette = usePalette();
  const colors = useRef(palette);
  colors.current = palette;

  const canvas = useRef<HTMLCanvasElement>(null);
  const still = useRef(reducedMotion());
  const targets = useRef<Target[]>([]);
  const balls = useRef<Ball[]>([]);
  const floats = useRef<Float[]>([]);
  const angle = useRef(0);
  const keys = useRef({ left: false, right: false });
  const lastShot = useRef(-Infinity);
  const nextId = useRef(1);
  const lastSpawn = useRef(0);
  const hits = useRef(0);
  const wrong = useRef(0);
  const goalRef = useRef<Goal>(dealGoal(0, Math.random));
  const font = useRef('sans-serif');
  const finished = useRef(false);

  const [phase, setPhase] = useState<'ready' | 'playing' | 'over'>('ready');
  const [goal, setGoal] = useState<Goal>(goalRef.current);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(ROUND_SECONDS);
  /* Bumped on every hit so the banner's pulse restarts; the sign says which. */
  const [pulse, setPulse] = useState<{ n: number; kind: 'hit' | 'miss' } | null>(null);

  /* ── spawning ── */

  const overlaps = (x: number, y: number) =>
    targets.current.some(
      (t) => t.state === 'live' && Math.hypot(t.x - x, t.y - y) < TARGET.radius * 2 + TARGET.spacing,
    );

  /**
   * One new target. `inside` places it in `TARGET.entryBand`, fading in where it
   * is needed now (an answer just dealt, a field running thin); otherwise it
   * enters from above the top edge. Still-life targets (reduced motion) are
   * scattered over the whole upper field, since they never move down.
   */
  const spawn = (now: number, asAnswer: boolean, inside = false) => {
    const r = TARGET.radius;
    const g = goalRef.current;
    /* Two discs carrying one number read as a glitch, so a repeat is redrawn. */
    const showing = new Set(targets.current.filter((t) => t.state === 'live').map((t) => t.value));
    let value = 0;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      value = asAnswer ? answerValue(g, Math.random) : distractorValue(g, Math.random);
      if (!showing.has(value)) break;
    }
    const [top, bottom] = still.current ? [r + 0.04, TARGET.floorY - r * 2.5] : TARGET.entryBand;
    const placeY = () => (still.current || inside ? top + Math.random() * (bottom - top) : -r);
    let x = 0.5;
    let y0 = placeY();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      x = r + 0.02 + Math.random() * (1 - 2 * (r + 0.02));
      if (!overlaps(x, y0)) break;
      y0 = placeY();
    }
    targets.current.push({
      id: nextId.current++,
      value,
      x,
      baseX: x,
      y: y0,
      sway: Math.random() * Math.PI * 2,
      born: now,
      state: 'live',
      endAt: 0,
    });
  };

  const liveAnswer = () => targets.current.some((t) => t.state === 'live' && answers(goalRef.current, t.value));

  /* ── drawing ── */

  const paint = useCallback((now: number) => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const ratio = window.devicePixelRatio || 1;
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
    }
    const k = width;
    const { primary, onPrimary } = colors.current;
    const calm = still.current;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    /* The ground line: below it is the cannon's, and a target that reaches it is gone. */
    context.globalAlpha = 0.25;
    context.strokeStyle = primary;
    context.lineWidth = 1;
    context.setLineDash([4, 6]);
    context.beginPath();
    context.moveTo(0, TARGET.floorY * k);
    context.lineTo(k, TARGET.floorY * k);
    context.stroke();
    context.setLineDash([]);

    /* The aim line, so a keyboard player can see where a shot will go. */
    const a = angle.current;
    const tipX = CANNON.x + Math.sin(a) * CANNON.barrelLength;
    const tipY = CANNON.y - Math.cos(a) * CANNON.barrelLength;
    context.globalAlpha = 0.22;
    context.setLineDash([2, 7]);
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(tipX * k, tipY * k);
    context.lineTo((tipX + Math.sin(a) * 0.55) * k, (tipY - Math.cos(a) * 0.55) * k);
    context.stroke();
    context.setLineDash([]);

    /* Targets. */
    const r = TARGET.radius;
    for (const t of targets.current) {
      const age = now - t.born;
      const fadeIn = calm ? 1 : Math.min(1, age / TARGET.fadeMs);
      if (t.state === 'live') {
        context.globalAlpha = fadeIn;
        context.fillStyle = primary;
        context.beginPath();
        context.arc(t.x * k, t.y * k, r * k, 0, Math.PI * 2);
        context.fill();
        const digits = String(t.value).length;
        context.fillStyle = onPrimary;
        context.font = `800 ${Math.round(r * k * (digits >= 3 ? 0.78 : 0.98))}px ${font.current}`;
        context.fillText(String(t.value), t.x * k, t.y * k + 1);
      } else if (t.state === 'hit') {
        /* A correct hit: a ring that grows and fades — the accent saying yes. */
        const p = Math.min(1, (now - (t.endAt - FEEDBACK.burstMs)) / FEEDBACK.burstMs);
        context.globalAlpha = 1 - p;
        context.strokeStyle = primary;
        context.lineWidth = 4 * (1 - p) + 1;
        context.beginPath();
        context.arc(t.x * k, t.y * k, (r + (calm ? 0 : FEEDBACK.burstGrow * p)) * k, 0, Math.PI * 2);
        context.stroke();
      } else if (t.state === 'wrong') {
        /* A wrong hit: the disc empties to an outline, crossed out, shakes, and
           stays as long as its "−1" so the two are read together. */
        const since = now - (t.endAt - FEEDBACK.wrongMs);
        const shake = Math.min(1, since / FEEDBACK.shakeMs);
        const dx = calm ? 0 : Math.sin(shake * Math.PI * 6) * FEEDBACK.shakeAmplitude * (1 - shake);
        const cx = (t.x + dx) * k;
        const cy = t.y * k;
        context.globalAlpha = 1 - Math.min(1, since / FEEDBACK.wrongMs) * 0.8;
        context.strokeStyle = primary;
        context.lineWidth = 2.5;
        context.beginPath();
        context.arc(cx, cy, r * k, 0, Math.PI * 2);
        context.stroke();
        context.fillStyle = primary;
        context.font = `800 ${Math.round(r * k * 0.9)}px ${font.current}`;
        context.fillText(String(t.value), cx, cy + 1);
        const s = r * k * 0.72;
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(cx - s, cy - s);
        context.lineTo(cx + s, cy + s);
        context.moveTo(cx + s, cy - s);
        context.lineTo(cx - s, cy + s);
        context.stroke();
      } else {
        const p = Math.min(1, (now - (t.endAt - TARGET.fadeMs)) / TARGET.fadeMs);
        context.globalAlpha = 1 - p;
        context.fillStyle = primary;
        context.beginPath();
        context.arc(t.x * k, t.y * k, r * k, 0, Math.PI * 2);
        context.fill();
      }
    }

    /* Balls. */
    context.globalAlpha = 1;
    context.fillStyle = primary;
    for (const b of balls.current) {
      context.beginPath();
      context.arc(b.x * k, b.y * k, BALL.radius * k, 0, Math.PI * 2);
      context.fill();
    }

    /* The cannon: a barrel on a domed carriage, kicking back on a shot. */
    const kick = calm ? 0 : Math.max(0, 1 - (now - lastShot.current) / CANNON.recoilMs) * CANNON.recoil;
    context.save();
    context.translate(CANNON.x * k, CANNON.y * k);
    context.rotate(a);
    context.fillStyle = primary;
    const bw = CANNON.barrelWidth * k;
    const reach = (CANNON.barrelLength - kick) * k;
    context.beginPath();
    context.roundRect(-bw / 2, -reach, bw, reach, bw * 0.3);
    context.fill();
    /* The muzzle band, a little wider than the barrel: the shape that says cannon. */
    context.beginPath();
    context.roundRect(-bw * 0.66, -reach, bw * 1.32, bw * 0.5, bw * 0.2);
    context.fill();
    context.restore();
    context.beginPath();
    context.arc(CANNON.x * k, CANNON.y * k, CANNON.baseRadius * k, Math.PI, 0);
    context.closePath();
    context.fill();
    /* The plinth, rounded on top so the carriage reads as one piece. */
    context.beginPath();
    context.roundRect(
      (CANNON.x - CANNON.baseRadius * 1.6) * k,
      (CANNON.y - 0.004) * k,
      CANNON.baseRadius * 3.2 * k,
      (ASPECT - CANNON.y + 0.01) * k,
      [CANNON.baseRadius * 0.5 * k, CANNON.baseRadius * 0.5 * k, 0, 0],
    );
    context.fill();

    /* "+1" / "−1" over the target it belongs to. */
    context.font = `800 ${Math.round(0.055 * k)}px ${font.current}`;
    for (const f of floats.current) {
      const p = Math.min(1, (now - f.at) / FEEDBACK.floatMs);
      context.globalAlpha = 1 - p;
      context.fillStyle = primary;
      context.fillText(f.text, f.x * k, (f.y - (calm ? 0 : 0.06 * p)) * k);
    }
    context.globalAlpha = 1;
  }, []);

  /* Repaint at rest (ready screen, theme switch, resize) — the loop owns play. */
  useEffect(() => {
    const element = canvas.current;
    if (element) {
      const root = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim();
      font.current = root || getComputedStyle(element).fontFamily || 'sans-serif';
    }
    paint(performance.now());
    const onResize = () => paint(performance.now());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [paint, palette]);

  /* ── firing ── */

  const fire = useCallback(() => {
    const now = performance.now();
    if (now - lastShot.current < BALL.cooldownMs || balls.current.length >= BALL.maxInFlight) return;
    lastShot.current = now;
    const a = angle.current;
    balls.current.push({
      x: CANNON.x + Math.sin(a) * CANNON.barrelLength,
      y: CANNON.y - Math.cos(a) * CANNON.barrelLength,
      vx: Math.sin(a) * BALL.speed,
      vy: -Math.cos(a) * BALL.speed,
    });
  }, []);

  const begin = () => {
    const now = performance.now();
    targets.current = [];
    balls.current = [];
    floats.current = [];
    hits.current = 0;
    wrong.current = 0;
    lastSpawn.current = now;
    /* Open with the answer and its near misses already on the field: the first
       thing a player sees is the whole game, not an empty sky. */
    spawn(now, true, true);
    for (let i = 1; i < LEVELS[0].minTargets; i += 1) spawn(now, false, true);
    setPhase('playing');
  };

  /* ── the loop ── */

  useEffect(() => {
    if (phase !== 'playing') return;
    let frame = 0;
    const started = performance.now();
    let last = started;
    let shownLeft = ROUND_SECONDS;

    const strike = (t: Target, now: number) => {
      const right = answers(goalRef.current, t.value);
      if (right) {
        hits.current += 1;
        t.state = 'hit';
        t.endAt = now + FEEDBACK.burstMs;
        floats.current.push({ x: t.x, y: t.y - TARGET.radius, text: '+1', at: now });
        const net = netHits(hits.current, wrong.current);
        const next = dealGoal(levelIndex(net), Math.random, goalRef.current);
        goalRef.current = next;
        setGoal(next);
        setScore(net);
        setPulse((p) => ({ n: (p?.n ?? 0) + 1, kind: 'hit' }));
        if (!liveAnswer()) {
          spawn(now, true, true);
          lastSpawn.current = now;
        }
      } else {
        wrong.current += 1;
        t.state = 'wrong';
        t.endAt = now + FEEDBACK.wrongMs;
        floats.current.push({ x: t.x, y: t.y - TARGET.radius, text: '−1', at: now });
        setScore(netHits(hits.current, wrong.current));
        setPulse((p) => ({ n: (p?.n ?? 0) + 1, kind: 'miss' }));
      }
    };

    const loop = (now: number) => {
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      const elapsed = (now - started) / 1000;
      const level = levelFor(netHits(hits.current, wrong.current));
      const calm = still.current;

      /* Aim. */
      const turn = (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0);
      if (turn) angle.current = clampAngle(angle.current + turn * CANNON.turnSpeed * dt);

      /* Arrivals. A thin field is topped up at once with near misses (or the
         answer, if it has gone); otherwise one drifts in from the top every
         `spawnMs`, the answer by share — and always, if none is showing. */
      let live = targets.current.filter((t) => t.state === 'live').length;
      while (live < level.minTargets) {
        spawn(now, !liveAnswer(), true);
        live += 1;
      }
      if (now - lastSpawn.current >= level.spawnMs && live < level.maxTargets) {
        lastSpawn.current = now;
        spawn(now, !liveAnswer() || Math.random() < level.answerShare);
      }

      /* Targets fall (or, reduced, wait out their time). */
      for (const t of targets.current) {
        if (t.state !== 'live') continue;
        if (calm) {
          if (now - t.born > TARGET.stillLifeMs) {
            t.state = 'gone';
            t.endAt = now + TARGET.fadeMs;
          }
          continue;
        }
        t.y += level.fall * dt;
        t.x = t.baseX + Math.sin(elapsed * TARGET.swaySpeed + t.sway) * TARGET.swayAmplitude;
        if (t.y - TARGET.radius > TARGET.floorY) {
          t.state = 'gone';
          t.endAt = now + TARGET.fadeMs;
        }
      }

      /* Balls fly; the first live target one touches takes the shot. */
      const flying: Ball[] = [];
      for (const b of balls.current) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        const target = targets.current.find(
          (t) => t.state === 'live' && Math.hypot(t.x - b.x, t.y - b.y) <= TARGET.radius + BALL.radius,
        );
        if (target) {
          strike(target, now);
          continue;
        }
        if (b.y > -BALL.radius && b.x > -BALL.radius && b.x < 1 + BALL.radius) flying.push(b);
      }
      balls.current = flying;

      targets.current = targets.current.filter((t) => t.state === 'live' || now < t.endAt);
      floats.current = floats.current.filter((f) => now - f.at < FEEDBACK.floatMs);

      const remaining = Math.max(0, Math.ceil(ROUND_SECONDS - elapsed));
      if (remaining !== shownLeft) {
        shownLeft = remaining;
        setLeft(remaining);
      }

      paint(now);
      if (elapsed >= ROUND_SECONDS) {
        balls.current = [];
        paint(now);
        setPhase('over');
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
    /* `spawn` and `liveAnswer` read only refs, so they are not dependencies. */
  }, [phase, paint]);

  /* ── the end ── */

  useEffect(() => {
    if (phase !== 'over' || finished.current) return;
    const timer = window.setTimeout(() => {
      if (finished.current) return;
      finished.current = true;
      const net = netHits(hits.current, wrong.current);
      const performance = cannonPerformance(hits.current, wrong.current);
      onDone(arcadePoints(performance), arcadeMilestones(performance), net >= CANNON_PERFECT, net, {
        hits: hits.current,
        wrong: wrong.current,
      });
    }, END_MS);
    return () => window.clearTimeout(timer);
  }, [phase, onDone]);

  /* ── keyboard: ← → (or A D) aim, Space / ↑ / W fires ── */

  useEffect(() => {
    const set = (event: KeyboardEvent, on: boolean) => {
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') keys.current.left = on;
      else if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') keys.current.right = on;
      else if (event.key === ' ' || event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
        if (phase !== 'playing') return;
        if (on && !event.repeat) fire();
      } else return;
      if (phase === 'playing') event.preventDefault();
    };
    const down = (event: KeyboardEvent) => set(event, true);
    const up = (event: KeyboardEvent) => set(event, false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [phase, fire]);

  /* ── pointer: the barrel follows a mouse; a tap or click aims and fires ── */

  const aimAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.width;
    angle.current = clampAngle(Math.atan2(x - CANNON.x, Math.max(0.001, CANNON.y - y)));
  };

  const onMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType !== 'mouse') return;
    aimAt(event);
    if (phase !== 'playing') paint(performance.now());
  };

  const onDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (phase !== 'playing') return;
    aimAt(event);
    fire();
  };

  const minutes = Math.floor(left / 60);
  const clock = `${minutes}:${String(left % 60).padStart(2, '0')}`;
  const goalText = equationText(goal) ?? fill(copy.cannon.multiple, { n: String(goal.kind === 'multiple' ? goal.n : 0) });

  return (
    <div className="round ar-round cn-round">
      <div className="round-top">
        <span className="round-count">{fill(copy.cannon.score, { n: String(score) })}</span>
        <span
          className="round-count cn-clock"
          data-warn={phase === 'playing' && left <= FEEDBACK.warnSeconds ? 'true' : undefined}
          aria-label={fill(copy.cannon.timeLabel, { n: String(left) })}
        >
          {clock}
        </span>
      </div>

      <div
        key={pulse?.n ?? 0}
        className="cn-goal"
        data-pulse={pulse?.kind}
        data-idle={phase === 'ready' ? 'true' : undefined}
        aria-live="polite"
      >
        <span className="cn-goal-label">{copy.cannon.goalLabel}</span>
        <span className="cn-goal-sum">{goalText}</span>
      </div>

      <div className="ar-field ar-tall cn-field">
        <canvas
          ref={canvas}
          className="ar-canvas"
          role="img"
          aria-label={copy.cannon.fieldLabel}
          onPointerMove={onMove}
          onPointerDown={onDown}
        />
        {phase === 'ready' && (
          <div className="ar-overlay">
            <p>{copy.cannon.intro}</p>
            <p className="cn-keys">{copy.cannon.keys}</p>
            <button type="button" className="btn btn-solid" onClick={begin}>
              {copy.cannon.start}
            </button>
          </div>
        )}
        {phase === 'over' && (
          <div className="ar-overlay" role="status">
            <p>{copy.cannon.over}</p>
          </div>
        )}
      </div>

      <button type="button" className="link-btn round-quit" onClick={onQuit}>
        {copy.quit}
      </button>
    </div>
  );
}
