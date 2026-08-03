import { memo, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../../components/GlobeHero/hooks/useReducedMotion';
import { useCopy } from '../i18n/context';
import { fill } from '../i18n/currency';
import { usePalette } from '../theme/context';
import { FLIGHT } from './config';
import {
  crossed,
  flap,
  hits,
  hitsBounds,
  spawnPipe,
  stepBird,
  tiltFor,
  type Bird,
  type Pipe,
} from './engine';
import { drawParrot, roundRect, wingFrame, type ParrotSkin } from './parrot';

/**
 * Squawk's Flight — the one round in L-Earn that is played rather than answered.
 *
 * Canvas 2D, and structured like `site/network/NetworkWeb.tsx`: the world lives
 * in plain `let`s inside a single effect, never in React state, because a
 * physics loop that re-rendered the tree sixty times a second would take the
 * page down with it. Only three things cross back into React — the score, which
 * changes about once every one and a half seconds, and the two overlays. None of
 * those is per-frame work.
 *
 * Four places where this deliberately departs from the backdrop next door, each
 * of which is a bug if it gets tidied away:
 *
 *  1. `onDone` is held in a ref and is *not* an effect dependency. It is
 *     recreated on every render of `GamesApp`, and `GamesApp` re-renders every
 *     time the score changes — listing it would restart the round continuously.
 *  2. Positions are world units, not CSS pixels (see `config.ts`). A backdrop
 *     may store pixels; a bird that stored pixels would be teleported into a
 *     column by a phone rotation.
 *  3. Nothing composites with `lighter`, even on the dark theme where the house
 *     pattern does. The parrot's beak, feet and eye are near-black in both
 *     themes and additive blending would erase them. `tone` picks the alpha
 *     budget in `FLIGHT.tone` and nothing else.
 *  4. A backgrounded tab pauses rather than continuing. The `dt` clamp already
 *     stops a five-second gap being integrated in one step, but flying on
 *     unwatched would cost a real life for something the player did not do.
 */

/** `#rgb` / `#rrggbb` to the `r,g,b` triplet canvas colour strings want. */
function toRgb(hex: string): string {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  const value = Number.parseInt(full, 16);
  return `${(value >> 16) & 255},${(value >> 8) & 255},${value & 255}`;
}

/** One tone's alpha budget. Structural, so both entries in `FLIGHT.tone` fit. */
interface ToneAlpha {
  stage: number;
  pipe: number;
  edge: number;
  cap: number;
}

interface Skin extends ParrotSkin {
  rgb: string;
  alpha: ToneAlpha;
}

/** `#rrggbb` to its three channels. */
function channels(hex: string): [number, number, number] {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  const value = Number.parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** `t` of the way from `from` to `to`, as an opaque colour string. */
function mix(from: string, to: string, t: number): string {
  const a = channels(from);
  const b = channels(to);
  const at = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${at(0)},${at(1)},${at(2)})`;
}

function makeSkin(primary: string, background: string, onPrimary: string, tone: 'glow' | 'ink'): Skin {
  const shade = FLIGHT.shade[tone];
  return {
    rgb: toRgb(primary),
    alpha: FLIGHT.tone[tone],
    body: primary,
    /*
     * Mixed toward the page rather than alpha'd over the body. These shapes sit
     * on top of a solid accent, and the accent at 30% over the accent is the
     * accent — the belly and the wing would composite to nothing at all. See the
     * note on `shade` in `config.ts`.
     */
    soft: mix(primary, background, shade.belly),
    wing: mix(primary, background, shade.wing),
    ink: onPrimary,
    eye: background,
  };
}

/** How long the crash or the finish is held on screen before the result card. */
const BEAT_MS = 1100;

interface FlightGameProps {
  /** The row from `GAMES`; `questions` is the gap target. */
  game: { questions: number };
  /** `(gapsCleared, won)` — the same contract as `Round`'s `onDone`. */
  onDone: (cleared: number, won: boolean) => void;
  onQuit: () => void;
}

export const FlightGame = memo(function FlightGame({ game, onDone, onQuit }: FlightGameProps) {
  const copy = useCopy().games;
  const palette = usePalette();
  const reduced = useReducedMotion();

  const canvasRef = useRef<HTMLCanvasElement>(null);

  /*
   * The reduced-motion gate is decided once, at mount, and then left alone.
   * `useReducedMotion` is live, and if the OS setting flipped mid-flight while
   * it was an effect dependency React would tear the loop down — costing the
   * player the run and a life for changing a system preference.
   */
  const gated = useRef(reduced);
  const [armed, setArmed] = useState(!reduced);

  const [score, setScore] = useState(0);
  const [started, setStarted] = useState(false);
  const [held, setHeld] = useState(false);
  const [outcome, setOutcome] = useState<{ won: boolean; cleared: number } | null>(null);

  /* Read inside `draw()` rather than closed over, so a theme switch mid-flight
     repaints the next frame instead of restarting the round. */
  const skin = useRef(makeSkin(palette.primary, palette.background, palette.onPrimary, palette.tone));
  useEffect(() => {
    skin.current = makeSkin(palette.primary, palette.background, palette.onPrimary, palette.tone);
  }, [palette.primary, palette.background, palette.onPrimary, palette.tone]);

  /* See note 1 in the header. */
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  /** Set by the effect; the button's handlers call through it. */
  const input = useRef<(() => void) | null>(null);

  const target = game.questions;
  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    if (!armed) return;
    const host = canvasRef.current;
    if (!host) return;
    const ctx = host.getContext('2d');
    if (!ctx) return;

    /* Motion that is not the game itself is switched off when the player got
       here through the reduced-motion gate. The columns still move; they are
       the game. Everything decorative holds still. */
    const calm = gated.current;
    const animateWing = !calm || FLIGHT.calm.wing;
    const animateTilt = !calm || FLIGHT.calm.tilt;

    /* ── the world, all in world units ──────────────────────────────────── */

    let bird: Bird = { y: FLIGHT.worldHeight / 2, vy: 0 };
    let pipes: Pipe[] = [];
    let mode: 'ready' | 'flying' | 'over' = 'ready';
    let cleared = 0;
    let spawnClock = 0;
    let elapsed = 0;
    let paused = false;
    /* The gap the last column offered, so the next one is drawn within reach of
       it. Seeded to mid-stage: the opening gate must be answerable from where
       the bird starts, and the first flap is the one a new player has no feel
       for yet. */
    let lastGap = FLIGHT.worldHeight / 2;

    /* ── canvas geometry ────────────────────────────────────────────────── */

    let width = 0;
    let height = 0;
    /** CSS pixels per world unit; the only thing a resize recomputes. */
    let ppu = 1;
    /* Right edge of the stage in world units — where columns enter. Annotated
       because `FLIGHT` is `as const`, so the seed value's type is `100`. */
    let stageWidth: number = FLIGHT.worldHeight;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      width = Math.max(rect.width, 1);
      height = Math.max(rect.height, 1);

      // Capped at 2, as everywhere else: past that the extra pixels are
      // invisible and the fill rate is not.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      host.width = Math.round(width * dpr);
      host.height = Math.round(height * dpr);
      // Resizing the backing store resets the context, so the scale is
      // re-applied here. Past this point everything is in CSS pixels.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      /* The stage is always `worldHeight` tall whatever the box measures, so a
         resize rescales the view and never moves the bird relative to a gap.
         `.fly-stage` is pinned to the world's aspect in CSS, so deriving the
         scale from height and clamping the width is belt and braces rather than
         two different answers. */
      ppu = height / FLIGHT.worldHeight;
      /* The measured width, not `worldWidth`. They agree to within a unit or
         two once the CSS aspect and its max-width/max-height have argued it
         out, and a column must enter at the real edge — clamp it to the design
         figure instead and the difference is a sliver of stage where columns
         pop into existence. `worldWidth` is what the tuning was reasoned
         against; this is where the glass actually ends. */
      stageWidth = width / ppu;
    };

    /* ── simulation ─────────────────────────────────────────────────────── */

    let beat = 0;

    const end = (won: boolean) => {
      if (mode === 'over') return;
      mode = 'over';
      setOutcome({ won, cleared });
      /* A beat before the result card, the way a quiz holds the right answer
         for a moment after a wrong pick. Cutting straight to a scoreboard reads
         as a glitch rather than as a crash. */
      beat = window.setTimeout(() => onDoneRef.current(cleared, won), BEAT_MS);
    };

    const step = (dt: number) => {
      elapsed += dt;
      if (mode !== 'flying') return;

      bird = stepBird(bird, dt);

      spawnClock += dt;
      if (spawnClock >= FLIGHT.pipe.interval) {
        spawnClock -= FLIGHT.pipe.interval;
        const pipe = spawnPipe(stageWidth, Math.random(), lastGap);
        lastGap = pipe.gapY;
        pipes.push(pipe);
      }

      for (const pipe of pipes) pipe.x -= FLIGHT.pipe.speed * dt;

      for (const pipe of pipes) {
        if (pipe.scored || !crossed(pipe, FLIGHT.bird.x)) continue;
        pipe.scored = true;
        cleared += 1;
        setScore(cleared);
        /* No stop at the target. The run is endless and ends where the original
           ends it — on the floor, the ceiling or a column. Passing the target
           only means the round is banked, which the HUD shows and `awardFlight`
           reads as the win. */
      }

      // Off the left rail and no longer scorable.
      pipes = pipes.filter((pipe) => pipe.x + FLIGHT.pipe.width > -1);

      if (hitsBounds(bird) || pipes.some((pipe) => hits(FLIGHT.bird.x, bird, pipe))) {
        end(cleared >= targetRef.current);
      }
    };

    /* ── drawing ────────────────────────────────────────────────────────── */

    const draw = () => {
      const s = skin.current;
      ctx.clearRect(0, 0, width, height);

      // The stage: a wash of the accent, so the canvas reads as a lit panel
      // rather than a hole cut in the page.
      ctx.fillStyle = `rgba(${s.rgb}, ${s.alpha.stage})`;
      ctx.fillRect(0, 0, width, height);

      const px = (u: number) => u * ppu;

      for (const pipe of pipes) {
        const x = px(pipe.x);
        const w = px(FLIGHT.pipe.width);
        const gapTop = px(pipe.gapY - FLIGHT.pipe.gap / 2);
        const gapBottom = px(pipe.gapY + FLIGHT.pipe.gap / 2);
        const r = px(FLIGHT.pipe.radius);
        const cap = px(FLIGHT.pipe.cap);

        ctx.fillStyle = `rgba(${s.rgb}, ${s.alpha.pipe})`;
        ctx.strokeStyle = `rgba(${s.rgb}, ${s.alpha.edge})`;
        ctx.lineWidth = 1;

        /* Both columns run past the rail so only the mouth shows a rounded end —
           a column with four rounded corners floats, and these are meant to be
           cut out of the frame. */
        for (const [top, bottom] of [
          [-r * 2, gapTop],
          [gapBottom, height + r * 2],
        ]) {
          roundRect(ctx, x, top, w, bottom - top, r);
          ctx.fill();
          ctx.stroke();
        }

        // The accent band across each mouth: the one solid mark on the stage,
        // and what makes the gap read as a gate rather than as absence.
        ctx.fillStyle = `rgba(${s.rgb}, ${s.alpha.cap})`;
        roundRect(ctx, x, gapTop - cap, w, cap, r * 0.6);
        ctx.fill();
        roundRect(ctx, x, gapBottom, w, cap, r * 0.6);
        ctx.fill();
      }

      drawParrot(ctx, s, {
        x: px(FLIGHT.bird.x),
        y: px(bird.y),
        size: px(FLIGHT.bird.size),
        tilt: animateTilt && mode === 'flying' ? tiltFor(bird.vy) : 0,
        frame: wingFrame(elapsed, !animateWing),
      });
    };

    /* ── input ──────────────────────────────────────────────────────────── */

    /* Declared up here rather than beside the loop because the resume path
       below writes to it, and a closure reading a `let` from its own TDZ is a
       trap waiting for whoever moves these blocks around next. */
    let last = performance.now();

    input.current = () => {
      if (mode === 'over') return;
      /* Coming back from another tab resumes rather than flapping: the first tap
         after a pause is the player finding the game again, not playing it. */
      if (paused) {
        paused = false;
        setHeld(false);
        last = performance.now();
        return;
      }
      if (mode === 'ready') {
        mode = 'flying';
        setStarted(true);
        /*
         * Put the first column on the stage with the first flap rather than one
         * interval later. The runway is then the time it takes that column to
         * cross — around three seconds on a wide stage, less on a narrow one —
         * instead of that plus an interval, which was long enough that an
         * unflapped bird reached the floor before the first gate existed.
         */
        spawnClock = FLIGHT.pipe.interval;
      }
      bird = flap(bird);
    };

    const onHide = () => {
      if (document.hidden && mode === 'flying' && !paused) {
        paused = true;
        setHeld(true);
      }
    };
    document.addEventListener('visibilitychange', onHide);

    /* ── the loop ───────────────────────────────────────────────────────── */

    resize();
    const observer = new ResizeObserver(() => {
      resize();
      draw();
    });
    observer.observe(host);

    let frame = 0;
    last = performance.now();

    const tick = (now: number) => {
      // Clamped: a backgrounded tab resumes with a multi-second gap, and
      // integrating that in one step would put the bird through a column.
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (!paused) {
        step(dt);
        draw();
      }

      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(beat);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onHide);
      input.current = null;
    };
  }, [armed]);

  /* ── the reduced-motion gate ──────────────────────────────────────────── */

  if (!armed) {
    return (
      <div className="round fly-ready">
        <h2>{copy.flight.motionTitle}</h2>
        <p>{copy.flight.motionBody}</p>
        <div className="fly-ready-actions">
          <button type="button" className="btn btn-solid" onClick={() => setArmed(true)}>
            {copy.flight.motionPlay}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onQuit}>
            {copy.flight.motionBack}
          </button>
        </div>
      </div>
    );
  }

  const flapNow = () => input.current?.();

  return (
    <div className="round fly">
      {/*
        The original shows a bare number and nothing else, and it is right to:
        mid-flight there is no attention spare for a fraction. The target lives
        under it as a goal line that disappears the moment it is met, and the
        pill fills to say the round is banked — from there on every gap is
        profit and a crash costs no life.
      */}
      <div className="fly-top">
        <span className="fly-hud" data-banked={score >= target ? 'true' : undefined}>
          {score}
        </span>
        {score < target && (
          <span className="fly-goal">
            {fill(copy.flight.goal, { target: String(target) })}
          </span>
        )}
      </div>

      {/*
        Touch is the control, and `pointerdown` is why: it fires the moment a
        finger lands, where `click` waits for it to lift. That gap is nothing on
        a form and everything on a game — a flap you have to release to spend
        reads as lag no amount of tuning fixes. One handler covers finger, mouse
        and pen, and because nothing listens for `click` a mouse press cannot
        flap twice.

        Still a real <button> rather than a div: it stays focusable and
        announced without any ARIA plumbing, and `data-playing` lets the
        stylesheet hand touch over to the game only while a round is running —
        see the `touch-action` pair in `site.css`.

        Space is deliberately swallowed rather than left alone. A focused button
        activates on Space by default, so ignoring it would not remove it as a
        control, only make it a laggy one that fires on key *up*. Enter stays,
        because taking the keyboard away entirely would leave this the one game
        on the page that cannot be played without a pointing device.
      */}
      <button
        type="button"
        className="fly-stage"
        data-playing={started && !outcome ? 'true' : undefined}
        aria-label={copy.flight.aria}
        onPointerDown={flapNow}
        onKeyDown={(event) => {
          if (event.key === ' ') {
            event.preventDefault();
            return;
          }
          if (event.key !== 'Enter') return;
          event.preventDefault();
          flapNow();
        }}
      >
        <canvas ref={canvasRef} />

        {!started && !outcome && <span className="fly-hint">{copy.flight.hint}</span>}
        {held && !outcome && <span className="fly-hint">{copy.flight.resume}</span>}

        {/*
          Every run ends in a column — that is what endless means — so the veil
          states the one fact and lets `data-won` carry whether the round was
          banked on the way. The result card behind it does the verdict.
        */}
        {outcome && (
          <span className="fly-over" data-won={outcome.won ? 'true' : undefined}>
            <b>{copy.flight.crashed}</b>
            <span>{fill(copy.flight.resultScore, { cleared: String(outcome.cleared) })}</span>
          </span>
        )}
      </button>

      <button type="button" className="link-btn round-quit" onClick={onQuit}>
        {copy.quit}
      </button>
    </div>
  );
});
