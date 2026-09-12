import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { COLORS } from '../GlobeHero/config';
import { useReducedMotion } from '../GlobeHero/hooks/useReducedMotion';
import type { GlobeTone } from '../../site/theme/context';
import { INTRO } from './config';
import './PaylezIntro.css';

export interface PaylezIntroProps {
  /** Fires once the sequence has finished (or was skipped). */
  onComplete?: () => void;
  primaryColor?: string;
  backgroundColor?: string;
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

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Slow release, hard middle, gentle arrival — the shape of something crossing. */
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Arrives fast and settles; for anything that is *revealed* rather than moved. */
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

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

/**
 * Resolves once the wordmark's face is usable, or once we have waited long
 * enough to stop caring. See `INTRO.fontWait` for why this sequence cannot
 * afford to start in the fallback face and swap out of it.
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
    window.setTimeout(done, INTRO.fontWait);
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

/** Where a run of type sits and how it is set, all in CSS pixels on screen. */
interface Box {
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

/** The lockup: the wordmark, and the mark that turns into its first letter. */
interface Layout {
  word: Box;
  /** The p, standing alone and oversized, before the unfold. */
  mark: Box;
  /** The p's place *inside* the wordmark — where the mark is travelling to. */
  markHome: Box;
}

/** The tight ink box of `text` at a reference size, or null if it has none. */
function inkOf(probe: CanvasRenderingContext2D, text: string, reference: number) {
  probe.font = `900 ${reference}px ${FACE}`;
  const m = probe.measureText(text);
  /* `actualBoundingBox*` is the tight ink box, which is what has to be centred —
     the em box carries side bearings and leading that are not the word. Older
     engines omit it; the fallbacks are loose enough to leave a margin rather
     than to clip. */
  const left = m.actualBoundingBoxLeft ?? 0;
  const right = m.actualBoundingBoxRight ?? m.width;
  const asc = m.actualBoundingBoxAscent ?? reference * 0.74;
  const desc = m.actualBoundingBoxDescent ?? reference * 0.2;
  const w = left + right;
  const h = asc + desc;
  return w > 0 && h > 0 ? { left, asc, w, h } : null;
}

/**
 * Fits the lockup to the viewport and returns where every part of it lands.
 *
 * The size is **fitted, not clamped**: the type is measured once at a reference
 * size and scaled, because text metrics are linear in the size and one
 * `measureText` therefore answers every candidate. A CSS `clamp()` with a floor
 * — which an earlier version of this screen used — stops being fluid below the
 * width where the floor wins, so a 360px phone and a 460px one get the same
 * type. This is a measurement.
 *
 * **`markHome` is the load-bearing one.** It is the p at the *wordmark's* size
 * and the wordmark's own origin — which, because the p is the word's first
 * glyph, is exactly where `fillText('paylez')` puts its p. So the travelling
 * mark lands on the word's own first letter to the pixel, and the crossfade at
 * the end of the unfold has nothing to reconcile.
 */
function measureLayout(width: number, height: number): Layout | null {
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return null;

  const { text, mark, word, markScale } = INTRO;
  const reference = 100;
  const wordInk = inkOf(probe, text, reference);
  const markInk = inkOf(probe, mark, reference);
  if (!wordInk || !markInk) return null;

  const size = Math.max(
    word.minSize,
    Math.min(
      word.maxSize,
      ((width * word.widthFraction) / wordInk.w) * reference,
      ((height * word.heightFraction) / wordInk.h) * reference,
    ),
  );

  /** A run of type at `px`, with its ink box's top-left put where asked. */
  const place = (
    ink: { left: number; asc: number; w: number; h: number },
    px: number,
    boxLeft: number,
    boxTop: number,
  ): Box => {
    const k = px / reference;
    return {
      font: `900 ${px}px ${FACE}`,
      size: px,
      left: boxLeft,
      top: boxTop,
      width: ink.w * k,
      height: ink.h * k,
      originX: boxLeft + ink.left * k,
      originY: boxTop + ink.asc * k,
    };
  };

  const k = size / reference;
  const wordLeft = (width - wordInk.w * k) / 2;
  const wordTop = height * word.centreY - (wordInk.h * k) / 2;
  const wordBox = place(wordInk, size, wordLeft, wordTop);

  /* The p where the *word* puts it: same origin, because it is the first glyph.
     Expressed as a box so the unfold can interpolate between two of the same
     shape. */
  const markHome = place(markInk, size, wordBox.originX - markInk.left * k, 0);
  markHome.top = wordBox.originY - markInk.asc * k;
  markHome.originY = wordBox.originY;

  /* …and the p standing alone: the same glyph, larger, centred on the lockup. */
  const big = size * markScale;
  const bk = big / reference;
  const markBox = place(
    markInk,
    big,
    (width - markInk.w * bk) / 2,
    height * word.centreY - (markInk.h * bk) / 2,
  );

  return { word: wordBox, mark: markBox, markHome };
}

/**
 * Brand cold-open: one light crosses a dark surface, and everything visible is
 * a consequence of where it is — the engraving it falls on, the word it
 * uncovers, the specular that rides across the type. Move the pointer and the
 * light is yours.
 *
 * The design argument is in `config.ts`, which is where it belongs. What
 * matters here is the construction, and it is the same one the six 2D backdrops
 * in `src/site/` use:
 *
 * - **Canvas 2D, not WebGL.** This renders *over* the landing page, and the
 *   landing page already spends the document's WebGL context on the globe. A
 *   second context for two seconds is not worth it.
 * - **Nothing per frame goes through React.** One `requestAnimationFrame` owns
 *   the clock, the light and the compositing; the pointer is written to a ref by
 *   a passive listener and read in the loop. React renders two elements and gets
 *   out of the way.
 * - **The clock starts when the brand face resolves, not at mount**, because the
 *   caller hides the entire page behind `onComplete` and a wordmark that changes
 *   shape mid-sweep is the one failure a brand screen cannot have.
 * - **The exit is a fade on the wrapper, never a transform.** This canvas
 *   measures the window; an ancestor transform lands in `getBoundingClientRect`
 *   and compounds into the measurement, which is the trap `CLAUDE.md` names for
 *   R3F and which costs a 2D canvas exactly as much.
 */
export const PaylezIntro = memo(function PaylezIntro({
  onComplete,
  primaryColor = COLORS.primary,
  backgroundColor = COLORS.background,
  tone = 'glow',
  oncePerSession = false,
  skippable = true,
}: PaylezIntroProps) {
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
   * element is mounted and painting its ground from the first frame; the light
   * waits for the brand face. Everything visual keys off this attribute, so the
   * stylesheet has one thing to look at.
   */
  const [running, setRunning] = useState(false);

  /*
   * **Revealing the site and leaving are two moments, not one.**
   *
   * They were one, and it cost the hand-off: this ground is the *page's* ground
   * — `--bg` in both themes — so an overlay fading off a page still hidden
   * behind `data-intro='running'` fades onto a rectangle of exactly the colour
   * it just removed, and the page then rises into an empty screen afterwards.
   * Two events in a row with a dead frame between them.
   *
   * `onComplete` fires when the exit *starts* instead, so the page's own 700ms
   * rise begins underneath and this fades off it in progress.
   */
  /*
   * **`onComplete` is held in a ref, and that is not a style choice.**
   *
   * The caller passes an inline arrow (`onComplete={() => setIntroDone(true)}`
   * in `Site.tsx`), so it is a new function on every render of the page shell —
   * and the shell re-renders during the intro for perfectly ordinary reasons.
   * Depending on it made `reveal` and `finish` change identity, which put them
   * in the draw effect's dependency array, which **tore the effect down and ran
   * it again mid-sequence**: `began` back to -1, the light back to the left
   * edge, the reveal back to nothing, and both timers rescheduled. The visible
   * symptom was a screen that never got as far as the wordmark.
   *
   * Reading it through a ref keeps both callbacks stable, so the effect mounts
   * exactly once and the sequence is the only thing that owns the clock.
   */
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

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

  /* ── the light ──────────────────────────────────────────────────────────── */

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

    const { light, lattice, word, rule, exit, unfold } = INTRO;
    const rgb = toRgb(primaryColor);
    const accent = `rgb(${rgb})`;
    const additive = tone === 'glow';
    /* One tone's light budget — the same shape `CityRise` reads out of
       `CITY.tone`, and read once rather than per bucket per frame. */
    const skin = INTRO.tone[tone];

    let width = 0;
    let height = 0;
    let diag = 0;
    let radius = 0;
    let box: Layout | null = null;

    /** The soft pool, stamped once per resize and blitted per frame. */
    let pool: HTMLCanvasElement | null = null;

    /*
     * The lattice's nodes for this frame, sized on resize.
     *
     * Written in **one** pass that computes each node's distance to the light,
     * then read by the bucket passes, which only compare a byte. Doing it the
     * other way — a `Math.hypot` per node per bucket — is eight times the
     * distance work for a picture that has one distance in it.
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
     * How far the word has ever been uncovered, in screen x.
     *
     * **A high-water mark, and it is what makes the pointer safe.** The light is
     * a blend of the scripted crossing and the cursor, so a hand sweeping right
     * and then left would drag the reveal backwards and un-write the wordmark —
     * the one thing a brand screen must not let you do. Tracking the furthest
     * the light has ever reached means a letter that has been lit stays lit, and
     * with nothing left to protect the pointer can have the light from the first
     * frame rather than waiting for the script to finish.
     */
    let uncovered = -Infinity;

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
        Math.sqrt(INTRO.maxPixels / (width * height)),
      );
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      // Resizing the backing store resets the context, so the scale has to be
      // re-applied here — after it, everything below is in CSS pixels.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      box = measureLayout(width, height);

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
       * The pool, as a sprite.
       *
       * A `createRadialGradient` is an object, and one a frame is pure garbage
       * — the same reason `CityRise` builds its veil on resize. Stamped once
       * into a small offscreen canvas and blitted, it is one `drawImage`.
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

    /* ── the loop ─────────────────────────────────────────────────────────── */

    let frame = 0;
    let opening = 0;
    let closing = 0;
    let began = -1;

    const alphaAt = (b: number) => ((b + 0.5) / lattice.buckets) * skin.lattice;

    const draw = () => {
      const t = began < 0 ? -1 : performance.now() - began;

      /* How far the mark is through becoming the word. */
      const open = clamp01(t < 0 ? 0 : (t - unfold.delay) / unfold.duration);
      const opened = easeInOutCubic(open);
      const wordY = box ? box.word.top + box.word.height / 2 : height * word.centreY;

      /*
       * The pointer's authority ramps in rather than snapping on, so the light
       * does not jump the first time the mouse twitches. It applies to both axes
       * from the first frame — see `uncovered` for why that is safe.
       */
      pointer.weight += ((pointer.seen ? 1 : 0) - pointer.weight) * 0.06;
      const hand = light.pull * pointer.weight;

      /*
       * The light's scripted path: in from outside the frame onto the mark, a
       * beat there, then on out the other side taking the reveal with it. The
       * beat is not idle time — it is the only thing that makes the p read as a
       * mark rather than as a letter the sweep happened to pass.
       *
       * Once the second leg is spent the light comes to rest on the lockup
       * rather than sitting off the right edge where it left the frame.
       */
      const arrive = clamp01(t < 0 ? 0 : (t - light.arrive.delay) / light.arrive.duration);
      const restX = width / 2;
      const scriptX =
        open > 0
          ? open >= 1
            ? restX
            : width * (0.5 + (light.to - 0.5) * opened)
          : width * (light.from + (0.5 - light.from) * easeOutQuart(arrive));
      const wantX = scriptX + (pointer.x - scriptX) * hand;
      const wantY = wordY + (pointer.y - wordY) * hand;

      if (!at.placed) {
        at.x = wantX;
        at.y = wantY;
        at.placed = true;
      } else {
        /* One easing for both axes and for the whole sequence. The script used
           to own `x` exactly on the argument that easing would lag the reveal
           behind the light causing it — which stopped being true once the reveal
           became a high-water mark that the light only ever pushes forward. */
        at.x += (wantX - at.x) * light.follow;
        at.y += (wantY - at.y) * light.follow;
      }
      if (t >= 0) uncovered = Math.max(uncovered, at.x);

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

      /*
       * The clearing the lockup sits in, following it as it changes shape: the
       * p's box while the mark stands alone, the wordmark's once it has
       * unfolded. Everything here is composited additively on black, so the
       * brand cannot occlude the engraving — the engraving has to stop instead,
       * or the lattice reads as graph paper laid over the brand rather than as
       * the surface it is cut into.
       */
      const hero = box
        ? {
            left: box.mark.left + (box.word.left - box.mark.left) * opened,
            top: box.mark.top + (box.word.top - box.mark.top) * opened,
            width: box.mark.width + (box.word.width - box.mark.width) * opened,
            height: box.mark.height + (box.word.height - box.mark.height) * opened,
            size: box.mark.size + (box.word.size - box.mark.size) * opened,
          }
        : null;
      const margin = hero ? hero.size * lattice.clear : 0;
      const clipL = hero ? hero.left : 0;
      const clipR = hero ? hero.left + hero.width : 0;
      const clipT = hero ? hero.top : 0;
      const clipB = hero ? hero.top + hero.height : 0;

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
          if (margin > 0) {
            /* Distance *outside* the ink box, faded over the margin rather than
               clipped at it — a hard edge here is a rectangular hole somebody
               punched in the surface. */
            const ox = Math.max(clipL - px, px - clipR, 0);
            const oy = Math.max(clipT - py, py - clipB, 0);
            const out = Math.min(1, Math.sqrt(ox * ox + oy * oy) / margin);
            k *= out * out;
          }
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

      if (box) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.globalAlpha = 1;

        /*
         * The wordmark, uncovered by the light rather than by a timeline of its
         * own: the fill is a gradient whose soft edge sits at the high-water
         * mark, so the word is lit behind it and absent in front. One gradient
         * object per frame, which is two orders of magnitude fewer than the
         * per-node alternative.
         *
         * It is also gated on the unfold, and that gate is what lets the mark
         * stand alone first. Without it the light's arrival on the centre would
         * have already uncovered the word's own left half — including the very
         * p that is still standing oversized above it.
         */
        const feather = radius * word.feather;
        const lit = word.base * opened;
        if (lit > 0) {
          const base = ctx.createLinearGradient(
            uncovered - feather,
            0,
            uncovered + feather * 0.25,
            0,
          );
          base.addColorStop(0, `rgba(${rgb},${lit})`);
          base.addColorStop(1, `rgba(${rgb},0)`);
          ctx.font = box.word.font;
          ctx.fillStyle = base;
          ctx.fillText(INTRO.text, box.word.originX, box.word.originY);

          /* The specular rides the *live* light rather than the high-water mark,
             because it is a reflection and not a state — it is what makes the
             type read as a cut surface instead of as flat ink being unmasked,
             and it keeps answering the pointer long after the word is fully
             uncovered. */
          const gw = radius * word.glint;
          const glint = ctx.createLinearGradient(at.x - gw, 0, at.x + gw, 0);
          glint.addColorStop(0, `rgba(${rgb},0)`);
          glint.addColorStop(0.5, `rgba(${rgb},${skin.spark * opened})`);
          glint.addColorStop(1, `rgba(${rgb},0)`);
          ctx.fillStyle = glint;
          ctx.fillText(INTRO.text, box.word.originX, box.word.originY);
        }

        /* ── the mark ────────────────────────────────────────────────────── */

        /*
         * The p, standing alone and then travelling into the word.
         *
         * Both ends of the interpolation are measured — `mark` is the glyph
         * centred and oversized, `markHome` is the same glyph at the word's size
         * and the word's own origin — so at `opened === 1` the travelling mark
         * is sitting exactly on the wordmark's first letter. That is the whole
         * reason the hand-off can be a plain crossfade with nothing to
         * reconcile: the last `markFade` milliseconds dissolve one p into an
         * identical one, and what is left is a single `fillText` of the word.
         */
        const handOff = clamp01(
          (t - (unfold.delay + unfold.duration - INTRO.markFade)) / INTRO.markFade,
        );
        const markAlpha = (1 - handOff) * word.base;
        if (markAlpha > 0) {
          const m = box.mark;
          const h = box.markHome;
          const size = m.size + (h.size - m.size) * opened;
          const ox = m.originX + (h.originX - m.originX) * opened;
          const oy = m.originY + (h.originY - m.originY) * opened;

          ctx.font = `900 ${size}px ${FACE}`;
          /* Lit by the same light as everything else, so the mark is part of the
             surface rather than a logo pasted on it. */
          const gw = radius * word.glint;
          const markLight = ctx.createLinearGradient(at.x - gw * 1.6, 0, at.x + gw * 1.6, 0);
          markLight.addColorStop(0, `rgba(${rgb},${markAlpha * 0.45})`);
          markLight.addColorStop(0.5, `rgba(${rgb},${Math.min(1, markAlpha + skin.spark)})`);
          markLight.addColorStop(1, `rgba(${rgb},${markAlpha * 0.45})`);
          ctx.fillStyle = markLight;
          ctx.fillText(INTRO.mark, ox, oy);
        }

        /* ── the hairline ────────────────────────────────────────────────── */

        if (t >= rule.delay) {
          const r = easeOutQuart(clamp01((t - rule.delay) / rule.duration));
          const w = box.word.width * rule.widthFraction * r;
          const y = box.word.top + box.word.height + box.word.size * rule.gap;
          ctx.globalAlpha = rule.alpha * r;
          ctx.fillStyle = accent;
          ctx.fillRect(width / 2 - w / 2, y, w, 1);
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
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
    pointer.y = height * word.centreY;
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointer, { passive: true });
    frame = window.requestAnimationFrame(draw);

    let cancelled = false;
    void brandFaceReady().then(() => {
      if (cancelled) return;
      /* Re-measure: the metrics taken during `resize` may have come from the
         fallback stack, and a box measured in one face is the wrong box for
         another. */
      box = measureLayout(width, height);
      began = performance.now();
      setRunning(true);
      opening = window.setTimeout(reveal, exit.delay);
      closing = window.setTimeout(finish, INTRO.duration);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(opening);
      window.clearTimeout(closing);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
    };
  }, [active, primaryColor, tone, reveal, finish]);

  if (!active) return null;

  return (
    <div
      className="pz-intro"
      data-running={running ? 'true' : undefined}
      style={
        {
          background: backgroundColor,
          '--pz-accent': primaryColor,
          '--pz-exit': `${INTRO.exit.duration}ms`,
          '--pz-exit-delay': `${INTRO.exit.delay}ms`,
          /* The Skip's own rule runs the full length of the sequence, because
             what it reports is how much of *this* is left. */
          '--pz-total': `${INTRO.duration}ms`,
          '--pz-skip-delay': `${INTRO.skip.delay}ms`,
        } as CSSProperties
      }
      onClick={skippable ? finish : undefined}
    >
      <canvas ref={canvasRef} className="pz-canvas" aria-hidden />

      {/*
        A real button, and the one thing on this screen that is not decoration.

        It was a `<span>` with a hover rule on an overlay that swallowed the
        click — which worked for a mouse and for nothing else, and is exactly
        the "picture of a control" rule `site.css` states.
      */}
      {skippable && (
        <button type="button" className="pz-skip" onClick={finish}>
          Skip
        </button>
      )}
    </div>
  );
});
