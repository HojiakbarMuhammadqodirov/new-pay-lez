import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useReducedMotion } from '../../components/GlobeHero/hooks/useReducedMotion';
import { useCopy, useLanguage } from '../i18n/context';
import { fill, plural } from '../i18n/currency';
import { AnimatedPico, picoBlinkAt } from '../pico';
import { usePalette } from '../theme/context';
import { FLIGHT } from './config';
import {
  crossed,
  flap,
  hits,
  hitsBounds,
  spawnPipe,
  speedAt,
  stepBird,
  tiltFor,
  type Bird,
  type Pipe,
} from './engine';
import { FlightPainter, type FlightFrame } from './painter';
import { SCENE, type SceneTone } from './scene';

/**
 * Pico's Flight — the one round in L-Earn that is played rather than answered.
 *
 * Canvas 2D, and structured like `site/network/NetworkWeb.tsx`: the world lives
 * in plain `let`s inside a single effect, never in React state, because a
 * physics loop that re-rendered the tree sixty times a second would take the
 * page down with it. Only three things cross back into React — the score, which
 * changes about once every one and a half seconds, and the two overlays. None of
 * those is per-frame work.
 *
 * **Two halves, and only one of them is the game.** The simulation — `step`,
 * `end`, the input handler and everything they touch — is exactly the engine's,
 * and nothing about the picture feeds back into it. The picture is
 * `painter.ts` (the art) and `scene.ts` (its palette and tunables), fed a
 * snapshot each frame by `dress` and `draw` below. Pico's body is drawn *on* the
 * hit circle (`anchor: 'body'`, sized from `FLIGHT.bird.radius`), so what
 * collides is what you see; everything else he does — the hover before the
 * first tap, the wing answering each press, the lean, the tumble after a crash —
 * is cosmetic state the engine never reads.
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
 *  3. The scene is drawn opaque, source-over, on both themes. The house pattern
 *     composites with `lighter` on the dark theme; here only the runes do, and
 *     only on night stone — Pico's eye and bill are dark and additive blending
 *     would erase them.
 *  4. A backgrounded tab pauses rather than continuing. The `dt` clamp already
 *     stops a five-second gap being integrated in one step, but flying on
 *     unwatched would cost a real life for something the player did not do.
 */

/** How long the crash or the finish is held on screen before the result card. */
const BEAT_MS = 1100;

const TAU = Math.PI * 2;

interface FlightGameProps {
  /** The row from `GAMES`; `questions` is the gap target. */
  game: { questions: number };
  /** `(gapsCleared, won)` — the same contract as `Round`'s `onDone`. */
  onDone: (cleared: number, won: boolean) => void;
  onQuit: () => void;
}

export const FlightGame = memo(function FlightGame({ game, onDone, onQuit }: FlightGameProps) {
  const copy = useCopy().games;
  const [language] = useLanguage();
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
     repaints the next frame — the painter rebuilds its art once — instead of
     restarting the round. */
  const look = useRef<{ tone: SceneTone; accent: string }>({ tone: palette.tone, accent: palette.primary });
  useEffect(() => {
    look.current = { tone: palette.tone, accent: palette.primary };
  }, [palette.tone, palette.primary]);

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
       the game. Everything decorative holds still — the sky, the turf, the
       weather, the feathers and Pico's wing and lean. */
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
    let dpr = 1;
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
      dpr = Math.min(window.devicePixelRatio || 1, 2);
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

      /* The scroll speed is a function of how long this run has lasted, not a
         constant — see `speedAt`. Read fresh every frame rather than latched at
         a step boundary, so a long frame after a tab switch moves the columns by
         what they were owed rather than by the old rate. */
      const scroll = speedAt(elapsed);
      for (const pipe of pipes) pipe.x -= scroll * dt;

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

    /* ── the picture ────────────────────────────────────────────────────────
       Cosmetic state only. Nothing below is read by `step` or `end`; it reads
       them. If a line here ever writes to `bird`, `pipes`, `cleared` or `mode`,
       it has stopped being decoration. */

    const painter = new FlightPainter();
    const frame: FlightFrame = {
      clock: 0,
      plane: 0,
      ambient: !calm,
      pipes,
      bird: { x: FLIGHT.bird.x, y: bird.y, tilt: 0, pose: 'flap', flap: 0.5, blink: 0 },
    };
    /** Ambient seconds — frozen under the gate. */
    let clock = 0;
    /** How far the turf has rolled, world units. Locked to the columns once flying. */
    let plane = 0;
    /** Wing beats, and how fast they are coming; see `SCENE.pico`. */
    let wing = 0.5;
    let wingRate: number = SCENE.pico.ready.beats;
    /** Pico's lean, eased toward `tiltFor` at `FLIGHT.bird.tilt.rate`. */
    let tilt = 0;
    /** The waiting hover's offset; it settles to nothing once the run starts. */
    let hover = 0;
    /** The tumble after a crash: where Pico is, how fast he falls, his spin. */
    let seen: 'ready' | 'flying' | 'over' = 'ready';
    let fallX = 0;
    let fallY = 0;
    let fallVy = 0;
    let spin = 0;
    let resting = false;

    const dress = (dt: number) => {
      if (!calm) clock += dt;

      if (seen !== mode) {
        if (mode === 'over') {
          fallX = FLIGHT.bird.x;
          fallY = bird.y;
          fallVy = SCENE.crash.knock;
          spin = tilt;
          resting = false;
          if (!calm) painter.crash(FLIGHT.bird.x, bird.y);
        }
        seen = mode;
      }

      if (mode === 'ready') {
        if (!calm) {
          // The world rolls past at the opening speed while Pico holds his
          // place, so the stage reads as flight before the first tap.
          plane += FLIGHT.pipe.speed * dt;
          hover = Math.sin(clock * TAU * SCENE.pico.ready.hz) * SCENE.pico.ready.bob;
        }
        if (animateWing) wing += dt * SCENE.pico.ready.beats;
        return;
      }

      if (mode === 'flying') {
        if (!calm) plane += speedAt(elapsed) * dt;
        hover *= Math.exp(-dt * 12);
        if (animateWing) {
          wingRate += (SCENE.pico.beats - wingRate) * Math.min(1, dt / SCENE.pico.settle);
          wing += dt * wingRate;
        }
        if (animateTilt) tilt += (tiltFor(bird.vy) - tilt) * Math.min(1, dt * FLIGHT.bird.tilt.rate);
        return;
      }

      // Over: the knocked-out tumble, under the game's own gravity, onto the turf.
      if (calm || resting) return;
      const floor = SCENE.ground.soil - FLIGHT.bird.radius * 0.55;
      fallVy = Math.min(fallVy + FLIGHT.gravity * dt, FLIGHT.maxFall);
      fallY += fallVy * dt;
      fallX += SCENE.crash.drift * dt;
      spin += SCENE.crash.spin * dt;
      if (fallY >= floor) {
        fallY = floor;
        if (fallVy > 30) {
          fallVy *= -0.32;
        } else {
          resting = true;
          // Settle on his back at whatever quarter-turn is nearest, not mid-roll.
          spin = Math.round(spin / (Math.PI / 2)) * (Math.PI / 2);
        }
      }
    };

    const draw = (dt = 0) => {
      const l = look.current;
      painter.configure(width, height, dpr, l.tone, l.accent);
      frame.clock = clock;
      frame.plane = plane;
      frame.pipes = pipes;
      const b = frame.bird;
      if (mode === 'over') {
        b.x = calm ? FLIGHT.bird.x : fallX;
        b.y = calm ? bird.y : fallY;
        b.tilt = calm ? 0 : spin;
        b.pose = 'hit';
      } else {
        b.x = FLIGHT.bird.x;
        b.y = bird.y + hover;
        b.tilt = animateTilt && mode === 'flying' ? tilt : 0;
        b.pose = 'flap';
      }
      b.flap = animateWing ? wing : 0.5;
      b.blink = calm ? 0 : picoBlinkAt(clock);
      painter.draw(ctx, frame, dt);
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

      /* The picture's answer to the press: the wing snaps to the top of its
         stroke and drives down, and a couple of feathers come loose. */
      wing = Math.floor(wing) + 0.75;
      wingRate = SCENE.pico.burst;
      if (!calm) painter.flap(FLIGHT.bird.x, bird.y);
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

    let raf = 0;
    last = performance.now();

    const tick = (now: number) => {
      // Clamped: a backgrounded tab resumes with a multi-second gap, and
      // integrating that in one step would put the bird through a column.
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      if (!paused) {
        step(dt);
        dress(dt);
        draw(dt);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
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
        <AnimatedPico size={96} pose="idle" className="fly-ready-pico" />
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
  const banked = score >= target;

  return (
    <div className="round fly">
      {/*
        The original shows a bare number and nothing else, and it is right to:
        mid-flight there is no attention spare for a fraction. The target lives
        under it as a goal line — one pip a gap — that disappears the moment it
        is met, and the pill fills to say the round is banked: from there on
        every gap is profit and a crash costs no life.

        Keyed on the score so each gap re-mounts the pill and its pop plays
        once; the score is React state already, so this costs nothing per frame.
      */}
      <div className="fly-top">
        <span className="fly-hud" key={score} data-banked={banked ? 'true' : undefined}>
          {score}
        </span>
        {!banked && (
          <span className="fly-goal">
            <span className="fly-pips" aria-hidden>
              {Array.from({ length: target }, (_, i) => (
                <i key={i} data-on={i < score ? 'true' : undefined} />
              ))}
            </span>
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

        {!started && !outcome && (
          <span className="fly-hint">
            <i className="fly-tap" aria-hidden />
            {copy.flight.hint}
          </span>
        )}
        {held && !outcome && <span className="fly-hint">{copy.flight.resume}</span>}

        {/*
          Every run ends in a column — that is what endless means — so the veil
          states the one fact and lets `data-won` carry whether the round was
          banked on the way. It waits a beat (`.fly-over` in the sheet) so the
          crash itself — the burst, the tumble — is seen before it is covered.
          Pico on the veil takes the verdict the text leaves to the result card:
          cheering for a banked round, downcast for one that fell short.
        */}
        {outcome && (
          <span className="fly-over" data-won={outcome.won ? 'true' : undefined}>
            <span className="fly-over-pico">
              {outcome.won && (
                <span className="fly-burst" aria-hidden>
                  {Array.from({ length: 10 }, (_, i) => (
                    <i key={i} style={{ '--i': i } as CSSProperties} />
                  ))}
                </span>
              )}
              <AnimatedPico size={88} pose={outcome.won ? 'happy' : 'sad'} />
            </span>
            <b>{copy.flight.crashed}</b>
            <span>{fill(plural(language, outcome.cleared, copy.flight.resultScore), { cleared: String(outcome.cleared) })}</span>
          </span>
        )}
      </button>

      <button type="button" className="link-btn round-quit" onClick={onQuit}>
        {copy.quit}
      </button>
    </div>
  );
});
