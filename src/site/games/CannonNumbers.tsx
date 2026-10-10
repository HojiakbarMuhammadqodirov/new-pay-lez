import { useCallback, useEffect, useRef, useState } from 'react';
import { useCopy, useLanguage } from '../i18n/context';
import { fill, plural } from '../i18n/currency';
import { useTheme } from '../theme/context';
import { arcadeMilestones, arcadePoints } from './arcade';
import {
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
import { MOTION } from './cannon/look';
import { createHarbourScene, type HarbourScene, type HarbourView } from './cannon/scene';

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
 * ## Two rules about time
 *
 * - **The ninety seconds are the game's own**, summed from the frames it
 *   simulated, not read off the wall. The loop already capped a frame at 50 ms,
 *   so a hidden tab froze the field — but the clock was wall time, and a player
 *   who glanced at another tab came back to a round that had run out under a
 *   field that had not moved. Now both stop together.
 * - **A shot is judged by the sum it was fired at.** A hit deals a new sum at
 *   once, so on "any multiple of 5" a quick second shot at another multiple —
 *   right when it left the barrel — used to land on the *new* sum and cost a
 *   point. A ball that strikes a number which answered the sum it was fired
 *   at, after that sum has gone, is neither a hit nor a miss: the disc fades
 *   and nothing is scored. It cannot score twice from one sum, so it is no
 *   way to farm one.
 *
 * ## Per frame, nothing goes through React
 *
 * Targets, balls, the barrel and the feedback marks live in refs and are
 * stepped and drawn in one `requestAnimationFrame` loop. React hears the goal
 * when it changes, the score when it changes and the clock in whole seconds.
 *
 * ## What it looks like
 *
 * A harbour at golden hour (the bay under a moon in dark): the numbers come
 * down on balloons, the cannon is bronze on a ship's deck, and Pico is the
 * cannoneer on a powder keg beside it — a beat of wing at every shot, a cheer
 * for a right answer, a slump for a wrong one. `cannon/scene.ts` paints it and
 * `cannon/look.ts` holds its palette and proportions. The painter only reads
 * the refs below; every rule above is untouched by it. Between rounds a second,
 * ambient loop keeps the harbour moving while the field is on screen.
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
  /** The sum on the banner when this ball was fired, and which deal it was. */
  goal: Goal;
  deal: number;
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
  const [language] = useLanguage();
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;

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
  /* Which sum is on the banner: one more on every correct hit. */
  const deal = useRef(0);
  const font = useRef('sans-serif');
  const finished = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;

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

  /* The picture: the harbour painter watches these refs and draws them as a
     place (`cannon/scene.ts`); it never steps, scores or deals anything. */
  const sceneRef = useRef<HarbourScene | null>(null);
  if (!sceneRef.current) sceneRef.current = createHarbourScene(still.current);
  const view = useRef<HarbourView>({ targets: [], balls: [], floats: [], angle: 0, shotAt: -Infinity, phase: 'ready', score: 0 });
  const phaseRef = useRef<'ready' | 'playing' | 'over'>('ready');
  phaseRef.current = phase;

  const paint = useCallback((now: number) => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    const scene = sceneRef.current;
    if (!element || !context || !scene) return;
    const ratio = Math.min(window.devicePixelRatio || 1, MOTION.maxRatio);
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (!(width > 0)) return;
    if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
    }
    scene.resize(width, ratio, themeRef.current === 'light' ? 'light' : 'dark', font.current);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const v = view.current;
    v.targets = targets.current;
    v.balls = balls.current;
    v.floats = floats.current;
    v.angle = angle.current;
    v.shotAt = lastShot.current;
    v.phase = phaseRef.current;
    v.score = netHits(hits.current, wrong.current);
    scene.paint(context, now, v);
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
  }, [paint, theme]);

  /* Between rounds the harbour stays alive — clouds, gulls, the beam, Pico
     blinking — but only while the field is on screen, and not at all under
     reduced motion, where the paints above are the whole picture. */
  useEffect(() => {
    if (phase === 'playing') return;
    if (still.current) {
      paint(performance.now());
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
      if (visible) paint(now);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [phase, paint]);

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
      goal: goalRef.current,
      deal: deal.current,
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
    let last = performance.now();
    /* Seconds of play simulated: the round's clock (see the header). */
    let played = 0;
    let shownLeft = ROUND_SECONDS;

    const strike = (t: Target, now: number, ball: Ball) => {
      const right = answers(goalRef.current, t.value);
      if (!right && ball.deal !== deal.current && answers(ball.goal, t.value)) {
        /* Fired at the sum before this one, and right for it: forgiven. */
        t.state = 'gone';
        t.endAt = now + TARGET.fadeMs;
        return;
      }
      if (right) {
        hits.current += 1;
        t.state = 'hit';
        t.endAt = now + FEEDBACK.burstMs;
        floats.current.push({ x: t.x, y: t.y - TARGET.radius, text: '+1', at: now });
        const net = netHits(hits.current, wrong.current);
        const next = dealGoal(levelIndex(net), Math.random, goalRef.current);
        goalRef.current = next;
        deal.current += 1;
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
      const dt = Math.min(50, Math.max(0, now - last)) / 1000;
      last = now;
      played += dt;
      const elapsed = played;
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
          strike(target, now, b);
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
      done.current(arcadePoints(performance), arcadeMilestones(performance), net >= CANNON_PERFECT, net, {
        hits: hits.current,
        wrong: wrong.current,
      });
    }, END_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

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
          aria-label={fill(plural(language, left, copy.cannon.timeLabel), { n: String(left) })}
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
          <div className="ar-overlay ar-over-late" role="status">
            <p>{copy.cannon.over}</p>
          </div>
        )}
      </div>

      {/* Off once the round is over: it is being banked (see Snake). */}
      <button type="button" className="link-btn round-quit" onClick={onQuit} disabled={phase === 'over'}>
        {copy.quit}
      </button>
    </div>
  );
}
