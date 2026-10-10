import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useReducedMotion } from '../../components/GlobeHero/hooks/useReducedMotion';
import { useCopy } from '../i18n/context';
import { fill } from '../i18n/currency';
import { useTheme } from '../theme/context';
import {
  DOODLE_PER_PLATFORM,
  DOODLE_PERFECT,
  DOODLE_ROUND_SECONDS,
  arcadeMilestones,
  arcadePoints,
  doodleAdvance,
  doodleCentre,
  doodleHeights,
  doodlePlatforms,
  doodleStart,
  doodleSteerToward,
  doodleTime,
  localRng,
  type DoodleEnd,
  type DoodleState,
} from './arcade';
import { EndVeil, PerfectBar, RoundClock } from './hud';
import { JUMP_SCENE } from './jump/config';
import { JumpScene, type JumpView } from './jump/scene';

/**
 * Pico Jump (`doodle`) — Pico bounces from platform to platform up to the
 * summit; falling off the bottom ends the round. Scored on the highest
 * platform stood on. The game the server calls `doodle_jump`, under the name
 * the app gives it.
 *
 * ## What the server can and cannot know
 *
 * With a `session` the platforms are the server's (`content.platforms`, each
 * one's place across the field; their heights are `doodleHeights`, the same
 * arithmetic on both sides). Whether the player really landed is a fact about
 * this screen, so the report is the highest platform reached, and the server
 * holds it to what the round's duration allows (`server/domain/arcade.ts`).
 * Without one the platforms are `localRng`'s.
 *
 * ## The round ends: a fall, the summit, or the clock
 *
 * The server deals 400 platforms and the app climbs them without end; the
 * website's level is the first `DOODLE_PERFECT` (50) — the height that is a
 * perfect round — and the 50th is the **summit**: landing on it ends the round,
 * won. It carries a flag and nothing is drawn above it, so the goal is plain
 * the moment it scrolls into view. A fall still ends a round, as the
 * rulebook has it, and `DOODLE_ROUND_SECONDS` of climbing ends one that has
 * stopped going up — the jumper bounces on its own, so a player who never
 * steered used to bounce on the floor for ever.
 *
 * ## The picture is `jump/scene.ts`, and it only reads
 *
 * The climb is drawn as a journey — jungle branches, then clouds, then
 * floating rocks under the stars, to a flag on a snowy crag — by `JumpScene`,
 * which is handed the jumper every frame and never writes to it. This file is
 * the game exactly as it was: the same integrator, the same inputs, the same
 * report. Between rounds (the ready veil, the beat after the end) a second,
 * picture-only loop keeps the scene breathing; it steps nothing.
 *
 * ## Per frame, nothing goes through React
 *
 * The jumper and the camera live in a ref and are stepped by `doodleAdvance`
 * in fixed 1/120 s steps — the app's integrator, so a 60 Hz phone and a 144 Hz
 * monitor fly the same arc — and drawn once a frame; React hears about the
 * height when it rises and the clock when its whole second changes.
 */

const END_MS = 900;
const ASPECT = 4 / 3;

export function DoodleJump({
  session,
  serverRound,
  onDone,
  onQuit,
}: {
  session?: string;
  serverRound?: { platforms: number[] };
  /** Points (local reckoning), fifths of a perfect round, a perfect round, platforms climbed, the report. */
  onDone: (points: number, correct: number, won: boolean, reached: number, report: Record<string, unknown>) => void;
  onQuit: () => void;
}) {
  const copy = useCopy().games;
  const { theme, palette } = useTheme();
  const reduced = useReducedMotion();
  const remote = Boolean(session && serverRound?.platforms?.length);

  /* The level: the dealt platforms up to the summit, and no further. */
  const level = useRef<{ centres: number[]; heights: number[] } | null>(null);
  if (level.current === null) {
    const xs = (remote ? serverRound!.platforms : doodlePlatforms(localRng)).slice(0, DOODLE_PERFECT);
    level.current = { centres: xs.map(doodleCentre), heights: doodleHeights(xs.length) };
  }
  const jumper = useRef<DoodleState>(doodleStart());
  const target = useRef<number | null>(null);
  const keys = useRef({ left: false, right: false });
  const canvas = useRef<HTMLCanvasElement>(null);

  /* The picture: one scene for the round's life, told the theme and the phase. */
  const scene = useRef<JumpScene | null>(null);
  if (scene.current === null) {
    scene.current = new JumpScene();
    scene.current.setLevel(level.current.centres, level.current.heights);
  }
  const view = useRef<JumpView>({ phase: 'ready', end: null, steer: 0, reduced });
  const look = useRef({ theme, accent: palette.primary });
  look.current = { theme, accent: palette.primary };
  view.current.reduced = reduced;

  const [phase, setPhase] = useState<'ready' | 'playing' | 'over'>('ready');
  const [reached, setReached] = useState(0);
  const [left, setLeft] = useState(DOODLE_ROUND_SECONDS);
  const [end, setEnd] = useState<DoodleEnd>('fell');
  const finished = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;
  view.current.phase = phase;

  const paint = useCallback(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, JUMP_SCENE.maxRatio);
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
      element.width = Math.round(width * ratio);
      element.height = Math.round(height * ratio);
    }
    const j = jumper.current;
    const v = view.current;
    v.end = j.end;
    /* The lean reads the steer the loop applies — the same pure rule, asked again. */
    v.steer =
      target.current !== null
        ? doodleSteerToward(j.x, target.current)
        : (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0);
    const s = scene.current!;
    s.configure(width, height, ratio, look.current.theme, look.current.accent);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    s.paint(context, j, v, performance.now());
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

  /* Between rounds the scene still breathes — fireflies, clouds, a blink, the
     tumble after a fall. Picture only: this loop steps nothing. */
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

  useEffect(() => {
    if (phase !== 'playing') return;
    let frame = 0;
    let last = performance.now();
    let shown = -1;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const j = jumper.current;
      const { centres, heights } = level.current!;

      /* Sideways: towards the finger, or by the keys. */
      const steer =
        target.current !== null
          ? doodleSteerToward(j.x, target.current)
          : (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0);
      const before = j.reached;
      doodleAdvance(j, dt, steer, centres, heights, { summit: centres.length, seconds: DOODLE_ROUND_SECONDS });
      if (j.reached !== before) setReached(j.reached);
      const remaining = Math.max(0, Math.ceil(DOODLE_ROUND_SECONDS - doodleTime(j)));
      if (remaining !== shown) {
        shown = remaining;
        setLeft(remaining);
      }

      paint();
      if (j.end) {
        setEnd(j.end);
        setPhase('over');
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase, paint]);

  useEffect(() => {
    const set = (event: KeyboardEvent, on: boolean) => {
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') keys.current.left = on;
      else if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') keys.current.right = on;
      else return;
      target.current = null;
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
      const n = jumper.current.reached;
      const performance = Math.min(100, n * DOODLE_PER_PLATFORM);
      done.current(arcadePoints(performance), arcadeMilestones(performance), n >= DOODLE_PERFECT, n, { reached: n });
    }, END_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const aim = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    target.current = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
  };

  const height = fill(copy.doodle.height, { n: `${reached} / ${DOODLE_PERFECT}` });

  return (
    <div className="round ar-round">
      <div className="round-top">
        <span className="round-count">{height}</span>
        <RoundClock left={left} />
      </div>
      <PerfectBar performance={reached * DOODLE_PER_PLATFORM} label={copy.perfectProgress} />

      <div className="ar-field ar-tall pj-field" style={{ aspectRatio: `${1} / ${ASPECT}` }}>
        <canvas
          ref={canvas}
          className="ar-canvas"
          role="img"
          aria-label={copy.doodle.fieldLabel}
          onPointerDown={aim}
          onPointerMove={(event) => {
            if (event.buttons > 0 || event.pointerType === 'mouse') aim(event);
          }}
          onPointerUp={() => {
            target.current = null;
          }}
          onPointerLeave={() => {
            target.current = null;
          }}
        />
        {/* No host in this veil: Pico is already standing in the scene above it. */}
        {phase === 'ready' && (
          <div className="ar-overlay">
            <p>{copy.doodle.intro}</p>
            <button type="button" className="btn btn-solid" onClick={() => setPhase('playing')}>
              {copy.doodle.start}
            </button>
          </div>
        )}
        {phase === 'over' && (
          <EndVeil
            title={end === 'summit' ? copy.doodle.summit : end === 'time' ? copy.roundTime : copy.doodle.over}
            detail={height}
            pose={end === 'summit' ? 'happy' : end === 'time' ? 'idle' : 'sad'}
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
