import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useCopy } from '../i18n/context';
import { fill } from '../i18n/currency';
import { usePalette } from '../theme/context';
import {
  DOODLE_PER_PLATFORM,
  DOODLE_PERFECT,
  arcadeMilestones,
  arcadePoints,
  doodleHeights,
  doodlePlatforms,
  localRng,
} from './arcade';

/**
 * Doodle Jump — bounce from platform to platform, as high as you can; falling
 * off the bottom ends the round. Scored on the highest platform stood on.
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
 * ## Per frame, nothing goes through React
 *
 * The jumper, the camera and the platforms live in refs and are stepped and
 * drawn in one loop; React hears about the height only when it rises.
 */

const END_MS = 900;
/** Field heights per second squared, and the take-off speed it implies. */
const GRAVITY = 2.6;
/** Rises 0.32 of the field — above the widest gap, so every platform is reachable. */
const JUMP = Math.sqrt(2 * GRAVITY * 0.32);
/** Platform and jumper widths, as fractions of the field's width. */
const PLATFORM_W = 0.2;
const JUMPER_W = 0.09;
/** How far a jumper may drift sideways, in field widths a second. */
const DRIFT = 1.4;
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
  const palette = usePalette();
  const remote = Boolean(session && serverRound?.platforms?.length);

  const xs = useRef<number[]>(remote ? serverRound!.platforms : doodlePlatforms(localRng));
  const ys = useRef<number[]>(doodleHeights(xs.current.length));
  /* Where each platform sits across the field — its centre — kept inside it. */
  const centre = (n: number) => PLATFORM_W / 2 + xs.current[n] * (1 - PLATFORM_W);
  const jumper = useRef({ x: 0.5, y: 0, vy: JUMP });
  const target = useRef<number | null>(null);
  const keys = useRef({ left: false, right: false });
  const camera = useRef(0);
  const reachedRef = useRef(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const colors = useRef(palette);
  colors.current = palette;

  const [phase, setPhase] = useState<'ready' | 'playing' | 'over'>('ready');
  const [reached, setReached] = useState(0);
  const finished = useRef(false);

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
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = colors.current.primary;
    const toY = (y: number) => height - (y - camera.current) * height;

    /* The floor, while it is still on screen. */
    if (camera.current < 0.05) {
      context.globalAlpha = 0.35;
      context.fillRect(0, toY(0), width, 3);
    }
    for (let n = 0; n < ys.current.length; n += 1) {
      const y = ys.current[n];
      if (y < camera.current - 0.05) continue;
      if (y > camera.current + 1.05) break;
      /* Climbed platforms are fainter: the next one up is the one to look at. */
      context.globalAlpha = n < reachedRef.current ? 0.35 : 0.85;
      context.beginPath();
      context.roundRect((centre(n) - PLATFORM_W / 2) * width, toY(y), PLATFORM_W * width, height * 0.018, 4);
      context.fill();
    }
    context.globalAlpha = 1;

    /* The jumper: a rounded block with two eyes cut out, in the accent. */
    const j = jumper.current;
    const size = JUMPER_W * width;
    const px = j.x * width - size / 2;
    const py = toY(j.y) - size;
    context.beginPath();
    context.roundRect(px, py, size, size, size * 0.3);
    context.fill();
    context.fillStyle = colors.current.background;
    context.fillRect(px + size * 0.25, py + size * 0.3, size * 0.14, size * 0.18);
    context.fillRect(px + size * 0.61, py + size * 0.3, size * 0.14, size * 0.18);
  }, []);

  useEffect(() => {
    paint();
  }, [paint, palette]);

  useEffect(() => {
    if (phase !== 'playing') return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      const j = jumper.current;

      /* Sideways: towards the finger, or by the keys; off one edge is on at the other. */
      let dx = (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0);
      if (target.current !== null) {
        const gap = target.current - j.x;
        dx = Math.abs(gap) < 0.01 ? 0 : Math.max(-1, Math.min(1, gap * 8));
      }
      j.x += dx * DRIFT * dt;
      if (j.x < 0) j.x += 1;
      if (j.x > 1) j.x -= 1;

      const before = j.y;
      j.vy -= GRAVITY * dt;
      j.y += j.vy * dt;

      /* Landing: only on the way down, through a platform's top, inside its width. */
      if (j.vy < 0) {
        if (before >= 0 && j.y <= 0 && camera.current < 0.05) {
          j.y = 0;
          j.vy = JUMP;
        }
        for (let n = 0; n < ys.current.length; n += 1) {
          const y = ys.current[n];
          if (y > before) break;
          if (j.y > y || before < y) continue;
          if (Math.abs(j.x - centre(n)) > (PLATFORM_W + JUMPER_W) / 2) continue;
          j.y = y;
          j.vy = JUMP;
          if (n + 1 > reachedRef.current) {
            reachedRef.current = n + 1;
            setReached(n + 1);
          }
          break;
        }
      }

      camera.current = Math.max(camera.current, j.y - 0.45);
      paint();
      if (j.y < camera.current - 0.08) {
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
      const n = reachedRef.current;
      const performance = Math.min(100, n * DOODLE_PER_PLATFORM);
      onDone(arcadePoints(performance), arcadeMilestones(performance), n >= DOODLE_PERFECT, n, { reached: n });
    }, END_MS);
    return () => window.clearTimeout(timer);
  }, [phase, onDone]);

  const aim = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    target.current = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
  };

  return (
    <div className="round ar-round">
      <div className="round-top">
        <span className="round-count">{fill(copy.doodle.height, { n: String(reached) })}</span>
      </div>

      <div className="ar-field ar-tall" style={{ aspectRatio: `${1} / ${ASPECT}` }}>
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
        {phase === 'ready' && (
          <div className="ar-overlay">
            <p>{copy.doodle.intro}</p>
            <button type="button" className="btn btn-solid" onClick={() => setPhase('playing')}>
              {copy.doodle.start}
            </button>
          </div>
        )}
        {phase === 'over' && (
          <div className="ar-overlay" role="status">
            <p>{copy.doodle.over}</p>
          </div>
        )}
      </div>

      <button type="button" className="link-btn round-quit" onClick={onQuit}>
        {copy.quit}
      </button>
    </div>
  );
}
