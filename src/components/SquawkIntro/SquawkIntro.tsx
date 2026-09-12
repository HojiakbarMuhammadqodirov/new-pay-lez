import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { COLORS } from '../GlobeHero/config';
import { useReducedMotion } from '../GlobeHero/hooks/useReducedMotion';
import type { GlobeTone } from '../../site/theme/context';
import { FLIGHT } from '../../site/flight/config';
import {
  drawParrot,
  PARROT_PARTS,
  roundRect,
  wingFrame,
  type ParrotSkin,
} from '../../site/flight/parrot';
import { SQUAWK } from './config';
import './SquawkIntro.css';

export interface SquawkIntroProps {
  /** Fires once the sequence has finished (or was skipped). */
  onComplete?: () => void;
  primaryColor?: string;
  backgroundColor?: string;
  /** The ink that pairs with an accent fill — the beak, the feet, the note's rule. */
  onPrimaryColor?: string;
  /**
   * How the accent composites over the ground, exactly as the globe and the six
   * 2D backdrops take it. `'glow'` adds — correct on near-black, where a light
   * is supposed to brighten what it falls on. `'ink'` lays the accent over the
   * page instead, because additive blending has no headroom above a near-white
   * ground: a light on paper is a *mark*, not a glow.
   */
  tone?: GlobeTone;
  /**
   * Play only on the first visit of a browser session. Off by default so the
   * sequence is easy to iterate on; turn it on for production.
   */
  oncePerSession?: boolean;
  /** Draw the Skip control, and let a click or Esc end it early. */
  skippable?: boolean;
}

/*
 * The same key the previous cold-open used, and deliberately so: the two are
 * alternative screens for one moment, and a visitor who has already sat through
 * whichever one is wired up has seen the intro.
 */
const SESSION_KEY = 'paylez-intro-played';

/**
 * The wordmark's face, as `document.fonts` and the canvas want it named.
 *
 * The same family `--font-brand` names in `site.css`, with the same fallbacks.
 * A canvas cannot read a custom property, so this is the second of the two
 * places the wordmark's face is written down — the way `THEMES` is the second
 * place the palette is.
 */
const FACE = "'Onest', ui-sans-serif, system-ui, sans-serif";

const TAU = Math.PI * 2;

/**
 * How much of the parrot is actually parrot, measured off the sprite itself.
 *
 * `drawParrot` centres the **unit box**, and the bird does not fill it evenly:
 * the crest stands 0.22 above the box and the feet hang 0.08 below it, so the
 * drawn shape is 1.14 boxes tall and its middle sits an eighth of a box above
 * the point you asked for. Both of those matter here and neither did in the
 * game, which cheats generously — `FLIGHT.bird.radius` is well under half the
 * sprite on the explicit argument that being killed by the tip of a feather
 * reads as a bug.
 *
 * This screen cannot cheat, because nothing is being judged: the bird has to
 * *visibly* thread every gate, and a crest clipping a column is the one frame
 * that says the animation is not in control of itself. So `bias` puts the drawn
 * shape where it was asked for and `half` is what a hole has to clear —
 * **derived from the parts table**, so moving the crest moves both rather than
 * quietly invalidating a number somebody wrote down once.
 */
const SPRITE = (() => {
  let top = Infinity;
  let bottom = -Infinity;
  for (const part of PARROT_PARTS) {
    top = Math.min(top, part.y);
    bottom = Math.max(bottom, part.y + part.h);
  }
  return { bias: 0.5 - (top + bottom) / 2, half: (bottom - top) / 2 };
})();

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Slow release, hard middle, gentle arrival — the shape of something crossing. */
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Arrives fast and settles; for anything that is *revealed* rather than moved. */
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

/** `#rgb` / `#rrggbb` to its three channels. */
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

/** …and to the `r,g,b` triplet canvas colour strings want. */
const toRgb = (hex: string) => channels(hex).join(',');

/** `t` of the way from `from` to `to`, as an opaque colour string. */
function mix(from: string, to: string, t: number): string {
  const a = channels(from);
  const b = channels(to);
  const at = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${at(0)},${at(1)},${at(2)})`;
}

/**
 * The parrot's skin, built exactly the way `FlightGame` builds it.
 *
 * The belly and the wing are **mixed toward the page**, never alpha'd over the
 * body: these shapes sit on top of a solid accent, and the accent at 30% over
 * the accent is the accent — they would composite to nothing at all. See the
 * note on `FLIGHT.shade`.
 */
function makeSkin(primary: string, background: string, onPrimary: string, tone: GlobeTone): ParrotSkin {
  const shade = FLIGHT.shade[tone];
  return {
    body: primary,
    soft: mix(primary, background, shade.belly),
    wing: mix(primary, background, shade.wing),
    ink: onPrimary,
    eye: background,
  };
}

/**
 * Resolves once the wordmark's face is usable, or once we have waited long
 * enough to stop caring. See `SQUAWK.fontWait`.
 *
 * Memoised at module scope rather than per mount, because the answer cannot
 * change back and a remount — the dashboard and the console unmount the whole
 * site shell — must not re-pay the wait. Deliberately not `document.fonts.ready`,
 * which waits for *every* face the document has asked for.
 */
let facePromise: Promise<void> | null = null;

function brandFaceReady(): Promise<void> {
  if (facePromise) return facePromise;
  facePromise = new Promise<void>((resolve) => {
    if (typeof document === 'undefined' || !document.fonts) {
      resolve();
      return;
    }
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    window.setTimeout(done, SQUAWK.fontWait);
    /*
     * Wrapped, and this one is load-bearing rather than tidy.
     *
     * `document.fonts.load` is specified to *reject* on a font it cannot parse,
     * but engines have thrown synchronously for it — and a throw here escapes
     * the executor, which rejects this promise before the timeout above can
     * resolve it. The caller has no rejection handler by design (there is
     * nothing to recover), so the sequence would never start: no timers, no
     * `onComplete`. The site hides its header, main and footer until that
     * fires, so the failure is not a worse-looking intro — it is a permanently
     * black page with nothing on it to press.
     */
    try {
      document.fonts.load(`900 100px ${FACE}`).then(done, done);
    } catch {
      done();
    }
  });
  return facePromise;
}

/** Where the wordmark sits, in the stage's own 400 × 200 design units. */
interface WordBox {
  font: string;
  size: number;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Where `fillText` has to be called to put the ink box exactly there. */
  originX: number;
  originY: number;
}

/**
 * Fits the wordmark to the stage.
 *
 * The size is **fitted, not clamped**: the type is measured once at a reference
 * size and scaled, because text metrics are linear in the size and one
 * `measureText` therefore answers every candidate. A CSS `clamp()` with a floor
 * stops being fluid below the width where the floor wins, so a 360px phone and
 * a 460px one get the same type. This is a measurement.
 *
 * It answers in design units, so it does not depend on the viewport at all —
 * the stage is scaled once, afterwards, and the word scales with it.
 */
function measureWord(): WordBox | null {
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return null;

  const reference = 100;
  probe.font = `900 ${reference}px ${FACE}`;
  const m = probe.measureText(SQUAWK.text);
  /* `actualBoundingBox*` is the tight ink box, which is what has to be centred —
     the em box carries side bearings and leading that are not the word. Older
     engines omit it; the fallbacks are loose enough to leave a margin rather
     than to clip. */
  const inkLeft = m.actualBoundingBoxLeft ?? 0;
  const inkRight = m.actualBoundingBoxRight ?? m.width;
  const asc = m.actualBoundingBoxAscent ?? reference * 0.74;
  const desc = m.actualBoundingBoxDescent ?? reference * 0.2;
  const w = inkLeft + inkRight;
  const h = asc + desc;
  if (w <= 0 || h <= 0) return null;

  const { stage, word } = SQUAWK;
  const size = Math.min(
    ((stage.width * word.widthFraction) / w) * reference,
    ((stage.height * word.heightFraction) / h) * reference,
  );
  const k = size / reference;
  const left = (stage.width - w * k) / 2;
  const top = stage.height / 2 - (h * k) / 2;

  return {
    font: `900 ${size}px ${FACE}`,
    size,
    left,
    top,
    width: w * k,
    height: h * k,
    originX: left + inkLeft * k,
    originY: top + asc * k,
  };
}

/**
 * One scattered thing — a feather, or a banknote.
 *
 * Its position is a **closed form of elapsed time** rather than an integration:
 * no `dt` anywhere, so a tab that is throttled for two frames cannot leave a
 * feather stranded in mid-air, and the burst looks the same on a 144Hz monitor
 * as on a phone dropping frames.
 */
interface Speck {
  angle: number;
  speed: number;
  spin: number;
  /** Size jitter, so a burst is not one shape sixteen times. */
  scale: number;
}

function makeBurst(count: number, min: number, max: number, spin: number): Speck[] {
  const out: Speck[] = [];
  for (let i = 0; i < count; i++) {
    /* Evenly spread and then jittered: pure randomness clumps, and a burst with
       a bald patch reads as a mistake rather than as chance. */
    const angle = (i / count) * TAU + (Math.random() - 0.5) * (TAU / count);
    out.push({
      angle,
      speed: min + Math.random() * (max - min),
      spin: (Math.random() - 0.5) * 2 * spin,
      scale: 0.7 + Math.random() * 0.6,
    });
  }
  return out;
}

/**
 * Brand cold-open: Squawk flies a short course, becomes the money, and writes
 * the name on the way back.
 *
 * The design argument is in `config.ts`, which is where it belongs. What
 * matters here is the construction, and it is the same one the six 2D backdrops
 * in `src/site/` use:
 *
 * - **Canvas 2D, not WebGL.** This renders *over* the landing page, and the
 *   landing page already spends the document's WebGL context on the globe.
 * - **Nothing per frame goes through React.** One `requestAnimationFrame` owns
 *   the clock, the light and the compositing; the pointer is written to a ref by
 *   a passive listener and read in the loop. React renders two elements and gets
 *   out of the way.
 * - **The clock starts when the brand face resolves, not at mount**, because the
 *   reveal is a gradient fitted to the word's own measured box and a face that
 *   changes width mid-sweep uncovers the wrong letters.
 * - **The exit is a fade on the wrapper, never a transform.** This canvas
 *   measures the window; an ancestor transform lands in `getBoundingClientRect`
 *   and compounds into the measurement, which is the trap `CLAUDE.md` names for
 *   R3F and which costs a 2D canvas exactly as much.
 */
export const SquawkIntro = memo(function SquawkIntro({
  onComplete,
  primaryColor = COLORS.primary,
  backgroundColor = COLORS.background,
  onPrimaryColor = '#05201c',
  tone = 'glow',
  oncePerSession = false,
  skippable = true,
}: SquawkIntroProps) {
  const reducedMotion = useReducedMotion();
  const doneRef = useRef(false);
  const revealedRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /* Whether the sequence is on screen at all. */
  const [active, setActive] = useState(() => {
    if (typeof window === 'undefined') return false;
    /*
     * Wrapped because `sessionStorage.getItem` does not return null when site
     * data is blocked (a sandboxed iframe, Chrome with cookies off, some
     * enterprise policies) — *accessing the object throws*. This runs inside a
     * state initialiser, so an unguarded read takes the whole app down during
     * render rather than costing one replayed intro.
     */
    try {
      if (oncePerSession && sessionStorage.getItem(SESSION_KEY)) return false;
    } catch {
      // Storage is unreadable, so "has it played?" is unanswerable. Play it.
    }
    return true;
  });

  /*
   * Whether the sequence has *started*, which is not the same question. The
   * element is mounted and painting its ground from the first frame; the clock
   * waits for the brand face. Everything visual keys off this attribute, so the
   * stylesheet has one thing to look at.
   */
  const [running, setRunning] = useState(false);

  /*
   * **`onComplete` is held in a ref, and that is not a style choice.**
   *
   * The caller passes an inline arrow, so it is a new function on every render
   * of the page shell — and the shell re-renders during the intro for perfectly
   * ordinary reasons. Depending on it made `reveal` and `finish` change
   * identity, which put them in the draw effect's dependency array, which **tore
   * the effect down and ran it again mid-sequence**: the clock back to -1, the
   * bird back to nothing. The symptom was a screen that never got as far as the
   * wordmark.
   */
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  /*
   * **Revealing the site and leaving are two moments, not one.** This ground is
   * the *page's* ground — `--bg` in both themes — so an overlay fading off a
   * page still hidden behind `data-intro='running'` fades onto a rectangle of
   * exactly the colour it just removed, and the page then rises into an empty
   * screen afterwards. `onComplete` fires when the exit *starts* instead.
   */
  const reveal = useCallback(() => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    onCompleteRef.current?.();
  }, []);

  /** Take the overlay away. Always implies the site is already revealed. */
  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (oncePerSession) {
      try {
        sessionStorage.setItem(SESSION_KEY, '1');
      } catch {
        // Private mode — replaying the intro is a better failure than crashing.
      }
    }
    reveal();
    setActive(false);
  }, [oncePerSession, reveal]);

  // Reduced motion skips straight to the site rather than playing it faster.
  useEffect(() => {
    if (reducedMotion && active) finish();
  }, [reducedMotion, active, finish]);

  /*
   * A sequence that never started is over, which is what the `onComplete` prop
   * promises and what the initialiser above would otherwise quietly break: the
   * site hides its header, main and footer behind `.site[data-intro='running']`
   * until this fires. `finish` is idempotent, so this costs the run that did
   * play nothing.
   */
  useEffect(() => {
    if (!active) finish();
  }, [active, finish]);

  // The intro owns the viewport while it runs.
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);

  useEffect(() => {
    if (!active || !skippable) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === ' ' || event.key === 'Enter') {
        finish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, skippable, finish]);

  /* ── the sequence ───────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    /* No canvas is not a reason to trap the visitor behind a blank overlay: the
       page is hidden until `onComplete` fires, so the failure path is to let
       them in, not to keep drawing nothing. */
    if (!canvas || !ctx) {
      finish();
      return;
    }

    const { stage, bird, pop, feathers, notes, columns, morph, note, word, rule, light, lattice, halo, exit } =
      SQUAWK;
    const rgb = toRgb(primaryColor);
    const accent = `rgb(${rgb})`;
    const additive = tone === 'glow';
    /* One tone's budget, read once rather than per bucket per frame. */
    const skin = SQUAWK.tone[tone];
    const parrot = makeSkin(primaryColor, backgroundColor, onPrimaryColor, tone);

    /* ── the course, solved once ──────────────────────────────────────────── */

    /*
     * The scroll speed is **derived from when the columns have to be gone**,
     * not set beside it. Tuning the spacing or the count then moves the speed
     * rather than leaving a column stranded on screen when the morph starts.
     */
    const runway =
      stage.width + columns.lead + (columns.count - 1) * columns.spacing + columns.width;
    const speed = runway / (columns.end - columns.start);

    /** Where gate `i`'s left edge is at `t`. */
    const columnX = (i: number, t: number) =>
      stage.width + columns.lead + i * columns.spacing - speed * (t - columns.start);

    const mid = stage.height / 2;

    /** The hover — a sine about the midline, rising first. */
    const birdY = (t: number) => mid - bird.bob * Math.sin((TAU * t) / bird.bobPeriod);
    /** …and its slope, normalised, which is the whole of the tilt. */
    const birdSlope = (t: number) => -Math.cos((TAU * t) / bird.bobPeriod);

    /*
     * Each gate's hole is centred on wherever the bird **will be** when that
     * gate reaches it. Solving it here rather than simulating a collision is
     * what makes the thread exact: a backdrop bird that can clip a column is a
     * bird that eventually does, in front of somebody's first visit.
     */
    /*
     * The gap, floored by what the bird actually measures.
     *
     * `columns.gap` is a *look* — how much air a gate shows — and the sprite is
     * a fact. Taking the larger of the two means a future tightening of the look
     * cannot produce a course the bird flies through rather than along, which is
     * exactly what the first cut of this screen did at a gap of 56.
     */
    const gap = Math.max(columns.gap, SPRITE.half * 2 * bird.size + columns.clearance * 2);

    const holes = Array.from({ length: columns.count }, (_, i) => {
      const passT =
        columns.start +
        (stage.width + columns.lead + i * columns.spacing + columns.width / 2 - bird.x) / speed;
      const floor = gap / 2 + columns.margin;
      return Math.max(floor, Math.min(stage.height - floor, birdY(passT)));
    });

    /* ── the two bursts, dealt once ───────────────────────────────────────── */

    const feathery = makeBurst(feathers.count, feathers.speed.min, feathers.speed.max, 0.8);
    const money = makeBurst(notes.count, notes.speed.min, notes.speed.max, notes.spin);

    /* ── the note's path ──────────────────────────────────────────────────── */

    const outX = bird.x + note.travel;
    const backEnd = note.back.delay + note.back.duration;

    const noteX = (t: number) => {
      if (t < note.out.delay) return bird.x;
      if (t < note.back.delay) {
        const p = clamp01((t - note.out.delay) / note.out.duration);
        return bird.x + (outX - bird.x) * easeInOutCubic(p);
      }
      const p = clamp01((t - note.back.delay) / note.back.duration);
      return outX + (note.exitX - outX) * easeInOutCubic(p);
    };

    /* ── the frame ────────────────────────────────────────────────────────── */

    let width = 0;
    let height = 0;
    let diag = 0;
    let radius = 0;
    /** The stage's place on screen: origin, and one scale for everything in it. */
    let originX = 0;
    let originY = 0;
    let scale = 1;
    let box: WordBox | null = measureWord();

    /** The soft pool, stamped once per resize and blitted per frame. */
    let pool: HTMLCanvasElement | null = null;
    /** …and the tight one that travels with the subject. */
    let glow: HTMLCanvasElement | null = null;

    /*
     * The lattice's nodes for this frame, sized on resize. Written in **one**
     * pass that computes each node's distance to the light, then read by the
     * bucket passes, which only compare a byte.
     */
    let nodeX = new Float32Array(0);
    let nodeY = new Float32Array(0);
    let nodeBucket = new Uint8Array(0);
    /** Effective spacing, widened on a large screen — see `lattice.maxSpan`. */
    let cell: number = lattice.cell;

    /*
     * The pointer, written by a passive listener and read in the loop — never
     * through React state, which would re-render the tree several times a
     * second for a value only the canvas uses.
     */
    const pointer = { x: 0, y: 0, seen: false, weight: 0 };

    /** Where the light actually is, eased toward wherever it is being told. */
    const at = { x: 0, y: 0, placed: false };

    /*
     * How far *left* the note has ever carried the reveal, in design units.
     *
     * A high-water mark, and it is what makes the pointer safe: the light is a
     * blend of the note and the cursor, and without this a hand sweeping back
     * across the screen would drag the reveal with it and un-write the wordmark
     * — the one thing a brand screen must not let you do. The note only ever
     * pushes it further left.
     */
    let uncovered = Infinity;

    const resize = () => {
      /*
       * Measured off the window rather than the element. This layer is
       * `position: fixed; inset: 0`, so the two agree — and the window keeps
       * agreeing even if an ancestor is ever transformed, which an element
       * measurement would fold into the backing store and compound.
       */
      width = Math.max(window.innerWidth, 1);
      height = Math.max(window.innerHeight, 1);
      diag = Math.hypot(width, height);
      radius = Math.min(diag * light.radius, light.maxRadius);

      const dpr = Math.min(
        window.devicePixelRatio || 1,
        2,
        Math.sqrt(SQUAWK.maxPixels / (width * height)),
      );
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      // Resizing the backing store resets the context, so the scale has to be
      // re-applied here — after it, everything below is in CSS pixels.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      /* One fit for the whole sequence: the stage keeps its 2:1 shape and takes
         as much width as it is allowed, so a phone gets the whole animation at
         a smaller size rather than a cropped one at full size. */
      const stageW = Math.min(stage.width, width * stage.widthFraction);
      scale = stageW / stage.width;
      originX = (width - stageW) / 2;
      originY = height * stage.centreY - (stage.height * scale) / 2;

      /* The node grid, bounded by count rather than by pitch. */
      cell = Math.max(lattice.cell, (radius * 2) / lattice.maxSpan);
      const span = Math.ceil((radius * 2) / cell) + 2;
      const capacity = span * span;
      if (nodeX.length < capacity) {
        nodeX = new Float32Array(capacity);
        nodeY = new Float32Array(capacity);
        nodeBucket = new Uint8Array(capacity);
      }

      /*
       * The subject's own light, as a sprite on the same argument as the pool
       * below — and stamped in *design* units, because it travels inside the
       * stage's transform and has to scale with it.
       */
      {
        const size = Math.max(2, Math.ceil(halo.radius * 2 * scale));
        const sprite = document.createElement('canvas');
        sprite.width = size;
        sprite.height = size;
        const hctx = sprite.getContext('2d');
        if (hctx) {
          const r = size / 2;
          const grad = hctx.createRadialGradient(r, r, 0, r, r, r);
          grad.addColorStop(0, `rgba(${rgb},${skin.halo})`);
          grad.addColorStop(0.45, `rgba(${rgb},${skin.halo * 0.4})`);
          grad.addColorStop(1, `rgba(${rgb},0)`);
          hctx.fillStyle = grad;
          hctx.fillRect(0, 0, size, size);
          glow = sprite;
        }
      }

      /*
       * The pool, as a sprite. A `createRadialGradient` is an object, and one a
       * frame is pure garbage — the same reason `CityRise` builds its veil on
       * resize. Stamped once and blitted, it is one `drawImage`.
       */
      const size = Math.max(2, Math.ceil(radius * 2));
      const sprite = document.createElement('canvas');
      sprite.width = size;
      sprite.height = size;
      const sctx = sprite.getContext('2d');
      if (sctx) {
        const r = size / 2;
        const grad = sctx.createRadialGradient(r, r, 0, r, r, r);
        grad.addColorStop(0, `rgba(${rgb},${skin.pool})`);
        grad.addColorStop(0.55, `rgba(${rgb},${skin.pool * 0.28})`);
        grad.addColorStop(1, `rgba(${rgb},0)`);
        sctx.fillStyle = grad;
        sctx.fillRect(0, 0, size, size);
        pool = sprite;
      }
    };

    /* ── the pieces ───────────────────────────────────────────────────────── */

    /**
     * The ceiling and the floor, faded out at both ends.
     *
     * Without them the columns stop in mid-air: the stage is 200 units of a
     * viewport several times that, so a gate that ends at the stage's edge ends
     * nowhere. A rule that stopped *abruptly* would be worse than none — it
     * draws the invisible box rather than the corridor inside it — so both ends
     * run out into the dark.
     */
    const drawRails = (alpha: number) => {
      if (alpha <= 0) return;
      const { fade } = columns.rail;
      const grad = ctx.createLinearGradient(0, 0, stage.width, 0);
      grad.addColorStop(0, `rgba(${rgb},0)`);
      grad.addColorStop(fade, `rgba(${rgb},${columns.rail.alpha * alpha})`);
      grad.addColorStop(1 - fade, `rgba(${rgb},${columns.rail.alpha * alpha})`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = grad;
      const line = 1 / scale;
      ctx.fillRect(0, -line, stage.width, line);
      ctx.fillRect(0, stage.height, stage.width, line);
    };

    /** One gate: two columns with a hole between them, drawn in design units. */
    const drawGate = (x: number, holeY: number) => {
      const over = 10; // past the stage's edges, so no column has a visible end
      const topH = holeY - gap / 2 + over;
      const botY = holeY + gap / 2;
      const botH = stage.height + over - botY;

      ctx.lineWidth = 1.4;
      for (const [y, h, mouthY] of [
        [-over, topH, holeY - gap / 2 - columns.cap],
        [botY, botH, botY],
      ] as const) {
        if (h <= 0) continue;
        roundRect(ctx, x, y, columns.width, h, columns.radius);
        ctx.globalAlpha = skin.pipe;
        ctx.fillStyle = accent;
        ctx.fill();
        ctx.globalAlpha = skin.edge;
        ctx.strokeStyle = accent;
        ctx.stroke();

        /* The band across the mouth, solid: it is the one part of a column a
           player reads at speed, which is exactly what this screen is asking
           of a visitor. */
        ctx.globalAlpha = 1;
        roundRect(
          ctx,
          x - columns.capOverhang / 2,
          mouthY,
          columns.width + columns.capOverhang,
          columns.cap,
          columns.radius * 0.5,
        );
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    /**
     * The banknote.
     *
     * Two colours and nothing else: an accent bill with its rule, its corner
     * pips and its `$` **knocked out in the page's own ground**, exactly the way
     * the parrot's eye is a hole rather than a dot. A note drawn with a third
     * hue would be the one object on this screen the palette does not cover.
     */
    const drawNote = (x: number, y: number, squash: number, tilt: number, ghost = false) => {
      const w = note.width;
      const h = note.height;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tilt);
      ctx.scale(squash, 1);

      ctx.fillStyle = parrot.body;
      roundRect(ctx, -w / 2, -h / 2, w, h, note.radius);
      ctx.fill();

      /* A ghost is the body and nothing else. Four notes' worth of rule and `$`
         overlapping is a printing error, not a trail — what a trail carries is
         where the *shape* has been. */
      if (ghost) {
        ctx.restore();
        return;
      }

      ctx.strokeStyle = parrot.eye;
      ctx.lineWidth = 1.3;
      roundRect(ctx, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, note.radius * 0.55);
      ctx.stroke();

      ctx.fillStyle = parrot.eye;
      ctx.font = `900 ${h * 0.56}px ${FACE}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, h * 0.03);
      /* Two pips, which is what stops the middle of the bill reading as a
         button: a note has corners that say what it is worth. */
      ctx.fillRect(-w / 2 + 7.5, -2, 3, 4);
      ctx.fillRect(w / 2 - 10.5, -2, 3, 4);

      ctx.restore();
    };

    /** One burst, at `e` of the way through its life. */
    const drawBurst = (
      specks: Speck[],
      cfg: typeof feathers | typeof notes,
      ox: number,
      oy: number,
      e: number,
      bill: boolean,
    ) => {
      const ts = (e * cfg.life) / 1000;
      const travel = 1 - cfg.drag * e;
      ctx.globalAlpha = 1 - e;
      for (const s of specks) {
        const d = s.speed * ts * travel;
        const x = ox + Math.cos(s.angle) * d;
        const y = oy + Math.sin(s.angle) * d + 0.5 * cfg.gravity * ts * ts;
        const w = cfg.size.w * s.scale;
        const h = cfg.size.h * s.scale;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(s.angle + s.spin * ts * TAU);
        /* Both bursts take the solid accent. `parrot.wing` is mixed *toward the
           page*, which is correct for a shape sitting on a solid accent body
           and wrong for an 8-unit fleck on the page itself — against that
           ground it is very nearly invisible. */
        ctx.fillStyle = parrot.body;
        roundRect(ctx, -w / 2, -h / 2, w, h, bill ? 1.4 : h / 2);
        ctx.fill();
        if (bill) {
          /* The same knock-out as the note itself, at a size where one rule is
             all that survives — which is enough, because the shape is already
             a bill and the eye only has to agree. */
          ctx.fillStyle = parrot.eye;
          ctx.fillRect(-w / 2 + 1.6, -0.5, w - 3.2, 1);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    };

    /* ── the loop ─────────────────────────────────────────────────────────── */

    let frame = 0;
    let opening = 0;
    let closing = 0;
    let began = -1;

    const alphaAt = (b: number) => ((b + 0.5) / lattice.buckets) * skin.lattice;

    const draw = () => {
      const t = began < 0 ? -1 : performance.now() - began;

      /* ── where the subject is, which is where the light wants to be ────── */

      /*
       * One answer for the whole sequence: the bird, then the note, then the
       * word it has just written. The light follows *it* rather than running a
       * path of its own, which is what makes the surface read as lit by what is
       * happening on it.
       */
      const subjectX = t < note.out.delay ? bird.x : t >= backEnd ? stage.width / 2 : noteX(t);
      const subjectY = t >= 0 && t < morph.start ? birdY(t) : mid;

      const screenX = originX + subjectX * scale;
      const screenY = originY + subjectY * scale;

      /*
       * The pointer's authority ramps in rather than snapping on, so the light
       * does not jump the first time the mouse twitches. It applies from the
       * first frame — see `uncovered` for why that is safe.
       */
      pointer.weight += ((pointer.seen ? 1 : 0) - pointer.weight) * 0.06;
      const hand = light.pull * pointer.weight;

      /* In from outside the frame, and onto the subject. */
      const arrive = t < 0 ? 0 : easeOutQuart(clamp01(t / light.arrive));
      const fromX = width * light.from;
      const scriptX = fromX + (screenX - fromX) * arrive;
      const wantX = scriptX + (pointer.x - scriptX) * hand;
      const wantY = screenY + (pointer.y - screenY) * hand;

      if (!at.placed) {
        at.x = wantX;
        at.y = wantY;
        at.placed = true;
      } else {
        at.x += (wantX - at.x) * light.follow;
        at.y += (wantY - at.y) * light.follow;
      }

      ctx.clearRect(0, 0, width, height);
      if (t < 0) {
        frame = window.requestAnimationFrame(draw);
        return;
      }

      ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';

      /* ── the engraving ─────────────────────────────────────────────────── */

      /*
       * Only the nodes inside the light are considered at all, so the cost is a
       * function of the radius and not of the viewport. The parallax slides the
       * lattice against the pointer, which is what gives the surface depth —
       * without it the ticks look painted onto the light rather than lit by it.
       */
      const slide = pointer.weight * lattice.parallax;
      const offX = (pointer.x - width / 2) * -slide;
      const offY = (pointer.y - height / 2) * -slide;
      const arm = cell * lattice.tick;
      const first = (v: number) => Math.ceil((v - radius) / cell) * cell;
      const maxBucket = lattice.buckets - 1;

      /* The clearing the animation happens in, faded rather than clipped: this
         is composited additively on black, so the stage cannot occlude the
         engraving — the engraving has to stop instead, or the lattice reads as
         graph paper laid over the animation. */
      const clipL = originX;
      const clipR = originX + stage.width * scale;
      const clipT = originY;
      const clipB = originY + stage.height * scale;
      const margin = stage.height * scale * lattice.clear;

      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.lineCap = 'butt';

      /* One pass: every node's distance to the light, computed once. */
      let count = 0;
      const capacity = nodeX.length;
      for (let gy = first(at.y - offY); gy <= at.y - offY + radius; gy += cell) {
        for (let gx = first(at.x - offX); gx <= at.x - offX + radius; gx += cell) {
          if (count >= capacity) break;
          const px = gx + offX;
          const py = gy + offY;
          const dx = px - at.x;
          const dy = py - at.y;
          const d = Math.sqrt(dx * dx + dy * dy) / radius;
          if (d >= 1) continue;
          /* `k` is how lit this node is. */
          let k = 1 - d;
          const ox = Math.max(clipL - px, px - clipR, 0);
          const oy = Math.max(clipT - py, py - clipB, 0);
          const out = Math.min(1, Math.sqrt(ox * ox + oy * oy) / margin);
          k *= out * out;
          if (k <= 0) continue;
          /* Bucketed on `k` squared, so the bright core gets as many layers as
             the faint rim — which is where banding would otherwise show. */
          nodeX[count] = px;
          nodeY[count] = py;
          nodeBucket[count] = Math.min(maxBucket, (k * k * lattice.buckets) | 0);
          count++;
        }
      }

      /* Then one stroke per bucket, reading a byte rather than a distance. */
      for (let b = 0; b <= maxBucket; b++) {
        ctx.globalAlpha = alphaAt(b);
        ctx.beginPath();
        let any = false;
        for (let i = 0; i < count; i++) {
          if (nodeBucket[i] !== b) continue;
          const px = nodeX[i];
          const py = nodeY[i];
          ctx.moveTo(px - arm, py);
          ctx.lineTo(px + arm, py);
          ctx.moveTo(px, py - arm);
          ctx.lineTo(px, py + arm);
          any = true;
        }
        if (any) ctx.stroke();
      }

      /* ── the pool ──────────────────────────────────────────────────────── */

      ctx.globalAlpha = 1;
      if (pool) ctx.drawImage(pool, at.x - radius, at.y - radius);

      /* ── the word ──────────────────────────────────────────────────────── */

      /*
       * Additive on black like everything above it, and drawn *under* the note
       * rather than over it: the note is the pen, and a pen the ink is on top of
       * is not writing anything.
       */
      ctx.save();
      ctx.translate(originX, originY);
      ctx.scale(scale, scale);

      if (t >= note.back.delay) uncovered = Math.min(uncovered, noteX(t));
      /* The note's own presence, which the specular borrows: a reflection of
         something that has left the screen is a bright patch on the `p` that
         nothing accounts for. */
      const present = 1 - clamp01((t - (backEnd - note.fade)) / note.fade);

      /*
       * The subject's own light, under it rather than on it — and it leaves
       * with the note, because a light with nothing under it is a smudge. The
       * pool goes on lighting the word after this; that is the surface's job.
       */
      if (glow) {
        const lit = t < note.out.delay ? 1 : present;
        if (lit > 0) {
          const hx = t < note.out.delay ? bird.x : noteX(Math.min(t, backEnd));
          const hy = t < morph.start ? birdY(t) : mid;
          ctx.globalAlpha = lit;
          ctx.drawImage(glow, hx - halo.radius, hy - halo.radius, halo.radius * 2, halo.radius * 2);
          ctx.globalAlpha = 1;
        }
      }

      if (box && uncovered < Infinity) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        /*
         * The wordmark, uncovered by the note rather than by a timeline of its
         * own: the fill is a gradient whose soft edge sits at the high-water
         * mark, so the letters behind the note are lit and the ones in front of
         * it are absent. It travels right to left, so the word arrives from its
         * own end — the `z` first and the `p` last.
         */
        const grad = ctx.createLinearGradient(uncovered - word.feather * 0.25, 0, uncovered + word.feather, 0);
        grad.addColorStop(0, `rgba(${rgb},0)`);
        grad.addColorStop(1, `rgba(${rgb},${word.base})`);
        ctx.font = box.font;
        ctx.fillStyle = grad;
        ctx.fillText(SQUAWK.text, box.originX, box.originY);

        /* The specular rides the note itself rather than the high-water mark,
           because it is a reflection and not a state — it is what makes the
           type read as a cut surface instead of as flat ink being unmasked. */
        if (present > 0) {
          const gx = noteX(t);
          const glint = ctx.createLinearGradient(gx - word.glint, 0, gx + word.glint, 0);
          glint.addColorStop(0, `rgba(${rgb},0)`);
          glint.addColorStop(0.5, `rgba(${rgb},${skin.spark * present})`);
          glint.addColorStop(1, `rgba(${rgb},0)`);
          ctx.fillStyle = glint;
          ctx.fillText(SQUAWK.text, box.originX, box.originY);
        }

        /*
         * …and one more pass after the note has gone.
         *
         * The specular above was a consequence of the note, so when the note
         * leaves the brand is lit from nowhere for the last half second — which
         * is the half second the screen ends on. This is the light coming back
         * for the word alone. `sin` on the alpha so it arrives and leaves
         * rather than switching on at the frame edge.
         */
        const finish = clamp01((t - word.finish.delay) / word.finish.duration);
        if (finish > 0 && finish < 1) {
          const half = word.finish.width / 2;
          const fx =
            box.left - half + (box.width + word.finish.width) * easeInOutCubic(finish);
          const sweep = ctx.createLinearGradient(fx - half, 0, fx + half, 0);
          sweep.addColorStop(0, `rgba(${rgb},0)`);
          sweep.addColorStop(0.5, `rgba(${rgb},${skin.spark * Math.sin(Math.PI * finish)})`);
          sweep.addColorStop(1, `rgba(${rgb},0)`);
          ctx.fillStyle = sweep;
          ctx.fillText(SQUAWK.text, box.originX, box.originY);
        }
      }

      /* ── the hairline ──────────────────────────────────────────────────── */

      if (box && t >= rule.delay) {
        const r = easeOutQuart(clamp01((t - rule.delay) / rule.duration));
        const w = box.width * rule.widthFraction * r;
        const y = box.top + box.height + box.size * rule.gap;
        ctx.globalAlpha = rule.alpha * r;
        ctx.fillStyle = accent;
        ctx.fillRect(stage.width / 2 - w / 2, y, w, 1 / scale);
        ctx.globalAlpha = 1;
      }

      ctx.restore();

      /* ── the course, the bird and the money ────────────────────────────── */

      /*
       * Source-over from here down, and that is load-bearing rather than tidy:
       * the parrot's beak, feet and eye are near-black in **both** themes, and
       * near-black adds nothing under additive blending — the bird would be a
       * mint blob with no face. `parrot.ts` says the same thing at the top.
       */
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.translate(originX, originY);
      ctx.scale(scale, scale);

      /* The columns are clipped to the stage and nothing else is: a gate half
         off the edge is a gate arriving, and a feather cut off at a boundary
         nobody can see is a bug. */
      if (t < morph.sliver) {
        /* In with the first gate and out through the morph, because what they
           are the edges *of* is the course rather than the screen. */
        drawRails(
          easeOutQuart(clamp01(t / columns.start)) *
            (1 - clamp01((t - morph.start) / (morph.sliver - morph.start))),
        );
      }

      if (t < morph.start) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, stage.width, stage.height);
        ctx.clip();
        for (let i = 0; i < columns.count; i++) {
          const x = columnX(i, t);
          if (x > stage.width || x < -columns.width - 10) continue;
          drawGate(x, holes[i]);
        }
        ctx.restore();
      }

      /* The feathers, from the moment it arrives. */
      const featherAge = clamp01(t / feathers.life);
      if (featherAge < 1) drawBurst(feathery, feathers, bird.x, mid, featherAge, false);

      /* The bird: in, flying, then edge-on. */
      if (t < morph.sliver) {
        const grow = clamp01(t / pop.duration);
        const scaleUp = easeOutQuart(grow) * (1 + (pop.overshoot - 1) * Math.sin(Math.PI * grow));
        /* Settling onto the midline through the collapse, so the note opens out
           on the line the word is written on. */
        const toward = clamp01((t - morph.start) / (morph.sliver - morph.start));
        const settle = easeInOutCubic(toward);
        const y = birdY(t) + (mid - birdY(t)) * settle;
        const squash = 1 - 0.94 * settle;

        /*
         * The beat before the turn: for the last moment of the flight the wing
         * pins to one frame and the body draws itself up. A gesture with no
         * preparation is a jump cut — the bird was flying and then it was money
         * — and 130ms of stillness is what makes the collapse read as something
         * the bird *did* rather than something done to it.
         */
        const brace = clamp01((t - (morph.start - morph.anticipate)) / morph.anticipate);
        const stretch = 1 + (morph.stretch - 1) * easeOutQuart(brace) * (1 - settle);

        const size = bird.size * scaleUp * stretch;
        if (size > 0.5) {
          ctx.save();
          ctx.translate(bird.x, y);
          ctx.scale(squash, 1);
          ctx.translate(-bird.x, -y);
          drawParrot(ctx, parrot, {
            x: bird.x,
            /* The unit box, offset so the *bird* is centred on `y` — which is
               the line this gate's hole was dealt to, and the line the note
               opens out on. See `SPRITE`. */
            y: y + SPRITE.bias * size,
            size,
            tilt: birdSlope(t) * bird.tilt * (1 - settle),
            /* `calm` pins the wing to its resting stroke, which is exactly
               what the brace needs and is already what the game does under
               reduced motion. */
            frame: wingFrame(t / 1000, brace > 0),
          });
          ctx.restore();
        }
      }

      /* The money, from the sliver on. */
      if (t >= morph.sliver) {
        const open = clamp01((t - morph.sliver) / (morph.done - morph.sliver));
        const squash = 0.06 + easeOutQuart(open) * 0.94;
        const x = noteX(t);
        /* A lean out and a lean back, so the note reads as thrown rather than
           as slid along a rail. */
        const lean =
          t < note.out.delay
            ? 0
            : t < note.back.delay
              ? note.tilt * Math.sin(Math.PI * clamp01((t - note.out.delay) / note.out.duration))
              : -note.tilt * Math.sin(Math.PI * clamp01((t - note.back.delay) / note.back.duration));
        /*
         * The trail, in milliseconds of the note's own path rather than in
         * pixels: long where it is fast and gone where it turns, which is what
         * speed actually looks like. Free, because `noteX` is a pure function
         * of time and can simply be asked where the note was.
         */
        if (present > 0 && open >= 1) {
          for (let i = note.trail.count; i >= 1; i--) {
            const was = t - i * note.trail.step;
            if (was <= note.out.delay) continue;
            const gx = noteX(was);
            if (Math.abs(gx - x) < 1) continue;
            /* Linear falloff rather than `1/i`: a reciprocal drops almost all
               of its weight in the first two samples, which is the stack of
               boxes again with extra steps. */
            ctx.globalAlpha = present * note.trail.alpha * (1 - i / (note.trail.count + 1));
            /* Tapered about its own middle: the wedge is the thing that reads
               as speed, and a stack of full-height ghosts is a bar. */
            const k = 1 - note.trail.taper * i;
            ctx.save();
            ctx.translate(gx, mid);
            ctx.scale(1, k);
            ctx.translate(-gx, -mid);
            drawNote(gx, mid, 1, lean, true);
            ctx.restore();
          }
        }

        ctx.globalAlpha = present;
        if (present > 0) drawNote(x, mid, squash, lean);
        ctx.globalAlpha = 1;

        /* The burst, at the frame with nothing in it to hide. */
        const age = clamp01((t - morph.sliver) / notes.life);
        if (age < 1) drawBurst(money, notes, bird.x, mid, age, true);

        /*
         * …and the shockwave, over the top of it.
         *
         * Two rings at different speeds rather than one: a single expanding
         * circle is a ripple, and two is something breaking open. Added rather
         * than laid over wherever the ground can take it — this is a light, and
         * it is the one frame on this screen that is allowed to be loud.
         */
        const wave = clamp01((t - morph.sliver) / morph.flash.duration);
        if (wave > 0 && wave < 1) {
          ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
          ctx.strokeStyle = accent;
          const fade = (1 - wave) * (1 - wave);
          for (let ring = 0; ring < 2; ring++) {
            const e = easeOutQuart(ring === 0 ? wave : wave * morph.flash.lag);
            const r = morph.flash.from + (morph.flash.to - morph.flash.from) * e;
            ctx.globalAlpha = skin.flash * fade * (ring === 0 ? 1 : 0.5);
            ctx.lineWidth = Math.max(0.6, morph.flash.line * (1 - e));
            ctx.beginPath();
            ctx.arc(bird.x, mid, r, 0, TAU);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }
      }

      ctx.restore();
      ctx.globalAlpha = 1;
      frame = window.requestAnimationFrame(draw);
    };

    /* ── wiring ───────────────────────────────────────────────────────────── */

    const onPointer = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      /* A tap reports a position once and then nothing; letting that claim the
         light would park it wherever a finger last touched. Only a pointer that
         can hover takes it. */
      if (event.pointerType !== 'touch') pointer.seen = true;
    };

    resize();
    pointer.x = width / 2;
    pointer.y = height * stage.centreY;
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointer, { passive: true });
    frame = window.requestAnimationFrame(draw);

    let cancelled = false;
    void brandFaceReady().then(() => {
      if (cancelled) return;
      /* Re-measure: the metrics taken above may have come from the fallback
         stack, and a box measured in one face is the wrong box for another. */
      box = measureWord();
      began = performance.now();
      setRunning(true);
      opening = window.setTimeout(reveal, exit.delay);
      closing = window.setTimeout(finish, SQUAWK.duration);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(opening);
      window.clearTimeout(closing);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
    };
  }, [active, primaryColor, backgroundColor, onPrimaryColor, tone, reveal, finish]);

  if (!active) return null;

  return (
    <div
      className="sq-intro"
      data-running={running ? 'true' : undefined}
      style={
        {
          background: backgroundColor,
          '--sq-accent': primaryColor,
          '--sq-exit': `${SQUAWK.exit.duration}ms`,
          '--sq-exit-delay': `${SQUAWK.exit.delay}ms`,
          /* The Skip's own rule runs the full length of the sequence, because
             what it reports is how much of *this* is left. */
          '--sq-total': `${SQUAWK.duration}ms`,
          '--sq-skip-delay': `${SQUAWK.skip.delay}ms`,
        } as CSSProperties
      }
      onClick={skippable ? finish : undefined}
    >
      <canvas ref={canvasRef} className="sq-canvas" aria-hidden />

      {/*
        A real button, and the one thing on this screen that is not decoration.
        A `<span>` with a hover rule on an overlay that swallows the click works
        for a mouse and for nothing else, which is exactly the "picture of a
        control" rule `site.css` states.
      */}
      {skippable && (
        <button type="button" className="sq-skip" onClick={finish}>
          Skip
        </button>
      )}
    </div>
  );
});
