import { memo, useEffect, useRef } from 'react';
import { useReducedMotion } from '../../components/GlobeHero/hooks/useReducedMotion';
import type { GlobeTone } from '../theme/context';
import { MARKET } from './config';

/**
 * The B2B page's background: a revenue line climbing left to right, scrolling
 * slowly, ticked upward by a field of venues under it — each of which fires on
 * its own rhythm, and fires again when the pointer passes it.
 *
 * Canvas 2D, for the reason the node web is: the page already holds a WebGL
 * context for the controller on another route, browsers cap how many a document
 * may keep alive, and this is one polyline and a few stroked arcs a frame —
 * nothing the 2D rasteriser notices, and no shader compile on first paint.
 *
 * Nothing goes through React state. The tape buffer, the field, the ring pool,
 * the pointer and the clock all live in refs inside one effect, the way the
 * globe's scroll position and the web's node field do.
 */

interface Venue {
  x: number;
  y: number;
  r: number;
  /** Seconds between this venue's own pulses; randomised so the field never
   *  falls into step. */
  period: number;
  /** Clock time of its next scheduled pulse. */
  next: number;
  /** Clock time it was last fired by the pointer, for the cooldown. */
  triggered: number;
}

/**
 * One ring. Pooled and recycled rather than allocated per pulse — this is the
 * only object the loop would otherwise churn, and a few hundred short-lived
 * allocations a minute is exactly the shape that makes a GC pause land in the
 * middle of a scroll.
 */
interface Ring {
  x: number;
  y: number;
  /** Clock time it was emitted. `born < 0` marks a free slot. */
  born: number;
  /** 1 for a scheduled pulse, `pointer.boost` for one the cursor caused. */
  strength: number;
}

interface TonePalette {
  line: number;
  fill: number;
  head: number;
  grid: number;
  ring: number;
  dot: number;
}

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

interface MarketTapeProps {
  primaryColor: string;
  /** `'ink'` on a light page: see the `tone` block in `config.ts`. */
  tone: GlobeTone;
  className?: string;
}

export const MarketTape = memo(function MarketTape({
  primaryColor,
  tone,
  className,
}: MarketTapeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  /*
   * Colour is read *inside* the loop rather than closed over, so switching
   * theme repaints the running tape instead of tearing the effect down and
   * starting the line again from a flat buffer.
   */
  const skin = useRef({ rgb: toRgb(primaryColor), tone });

  /** Set by the main effect; lets the theme effect below repaint a frozen tape. */
  const repaint = useRef<(() => void) | null>(null);

  useEffect(() => {
    const host = canvasRef.current;
    if (!host) return;
    const ctx = host.getContext('2d');
    if (!ctx) return;

    const { tape, venues: field } = MARKET;

    const venues: Venue[] = [];
    const rings: Ring[] = Array.from({ length: field.maxRings }, () => ({
      x: 0,
      y: 0,
      born: -1,
      strength: 1,
    }));

    /**
     * The tape, oldest sample first.
     *
     * These are *departures* from the trend, not levels: the climb is added at
     * draw time from each sample's position across the width. Keeping the walk
     * centred on zero is what lets the line rise forever without the buffer
     * accumulating a value that would eventually leave the band.
     */
    let samples: number[] = [];
    /** How far the tape has scrolled since the last sample was appended, px. */
    let phase = 0;

    let width = 0;
    let height = 0;
    /** Seconds since the effect started. The one clock everything reads. */
    let clock = 0;

    const pointer = { x: -9999, y: -9999, inside: false };

    const between = (min: number, max: number) => min + Math.random() * (max - min);

    /** The last sample still on screen — where the leading dot sits and where a
     *  venue's tick lands. */
    const headIndex = () =>
      Math.max(
        0,
        Math.min(samples.length - 1, Math.floor((width + phase) / tape.spacing)),
      );

    /** One more sample, mean-reverting so the walk cannot camp on a rail. */
    const advance = () => {
      const last = samples[samples.length - 1] ?? 0;
      const next = last * (1 - tape.pull) + (Math.random() * 2 - 1) * tape.drift;
      samples.push(Math.max(-1, Math.min(1, next)));
      samples.shift();
    };

    /**
     * Places `count` venues on a jittered grid.
     *
     * Not pure `Math.random()` for both axes: uniform random points clump, and a
     * clump of venues is a bright knot of overlapping rings sitting over
     * whatever paragraph happens to be under it. The grid guarantees spread and
     * the jitter takes the grid back out of it.
     */
    const seed = (count: number) => {
      venues.length = 0;
      const cols = Math.max(1, Math.round(Math.sqrt((count * width) / height)));
      const rows = Math.max(1, Math.ceil(count / cols));
      const cellW = width / cols;
      const cellH = height / rows;

      for (let i = 0; i < count; i++) {
        const cx = i % cols;
        const cy = Math.floor(i / cols);
        venues.push({
          x: (cx + between(0.2, 0.8)) * cellW,
          y: (cy + between(0.2, 0.8)) * cellH,
          r: between(field.dotRadius.min, field.dotRadius.max),
          period: between(field.period.min, field.period.max),
          // Staggered into the past as well as the future, so the field is
          // already mid-rhythm on the first frame rather than firing all at
          // once a few seconds in.
          next: clock + Math.random() * field.period.max,
          triggered: -field.pointer.cooldown,
        });
      }
    };

    /** Takes a free slot, or the oldest ring if the pool is full. */
    const emit = (venue: Venue, strength: number) => {
      let slot = -1;
      let oldest = Number.POSITIVE_INFINITY;
      for (let i = 0; i < rings.length; i++) {
        if (rings[i].born < 0) {
          slot = i;
          break;
        }
        if (rings[i].born < oldest) {
          oldest = rings[i].born;
          slot = i;
        }
      }
      rings[slot].x = venue.x;
      rings[slot].y = venue.y;
      rings[slot].born = clock;
      rings[slot].strength = strength;

      /*
       * The tick, and the reason the two halves are one picture: a visit lands
       * on the sample under the leading dot, so the ring and the uptick are the
       * same event drawn in two places rather than two effects that happen to
       * run at once.
       *
       * On the *visible* head rather than on the newest sample: the newest one
       * is off the right edge by design — that is where a tape's new data comes
       * from — and a tick that only appeared seven seconds later, once it had
       * scrolled in, would not read as caused by anything. Bumping a sample
       * already on screen puts a spike at the edge the instant the venue fires,
       * which is what a live tape does. Clamped, because a burst under the
       * cursor would otherwise drive the line through the top of the band.
       */
      const head = headIndex();
      samples[head] = Math.max(-1, Math.min(1, samples[head] + tape.tick * strength));
    };

    const resize = () => {
      const rect = host.getBoundingClientRect();
      width = Math.max(rect.width, 1);
      height = Math.max(rect.height, 1);

      // Capped at 2: past that the extra pixels are invisible and the fill rate
      // is not, and this layer covers the entire viewport.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      host.width = Math.round(width * dpr);
      host.height = Math.round(height * dpr);
      // Resizing the backing store resets the context, so the scale has to be
      // re-applied — after it, everything below is in CSS pixels.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Two spare samples: one off each end, so the polyline is already drawn
      // past both edges and the scroll never reveals a stub.
      const count = Math.ceil(width / tape.spacing) + 3;
      const previous = samples;
      samples = Array.from({ length: count }, (_, i) => previous[i] ?? 0);
      // A fresh buffer of zeroes is a perfectly straight line, which is the one
      // shape a market never has. Walk it forward before the first paint.
      if (!previous.length) for (let i = 0; i < count * 2; i++) advance();

      const target = Math.round((width * height) / field.areaPer);
      seed(Math.max(field.min, Math.min(field.max, target)));

      // Rings belong to positions that no longer exist. Clearing them is the
      // honest reset; letting them finish would leave circles expanding around
      // nothing.
      for (const ring of rings) ring.born = -1;
    };

    /* ── simulation ───────────────────────────────────────────────────────── */

    const step = (dt: number) => {
      clock += dt;

      phase += tape.speed * dt;
      while (phase >= tape.spacing) {
        phase -= tape.spacing;
        advance();
      }

      for (const venue of venues) {
        if (clock >= venue.next) {
          emit(venue, 1);
          venue.next = clock + venue.period;
        }

        if (!pointer.inside) continue;
        if (clock - venue.triggered < field.pointer.cooldown) continue;

        const distance = Math.hypot(venue.x - pointer.x, venue.y - pointer.y);
        if (distance > field.pointer.radius) continue;

        emit(venue, field.pointer.boost);
        venue.triggered = clock;
        /*
         * The scheduled pulse is pushed back a full period too. Without it a
         * venue you just triggered fires again a moment later on its own clock,
         * which reads as a double-tap rather than as a visit.
         */
        venue.next = clock + venue.period;
      }
    };

    /* ── drawing ──────────────────────────────────────────────────────────── */

    /** Screen position of sample `i`. The climb is applied here, not stored. */
    const pointAt = (i: number) => {
      const span = Math.max(samples.length - 1, 1);
      const t = i / span;
      const level =
        tape.band.from +
        t * (tape.band.to - tape.band.from) +
        samples[i] * tape.wiggle * (tape.band.to - tape.band.from);
      return { x: i * tape.spacing - phase, y: height * (1 - level) };
    };

    /**
     * Traces the line into the current path.
     *
     * Catmull-Rom-ish midpoint smoothing: each segment is a quadratic through
     * the midpoint of two samples, with the sample itself as the control. A
     * polyline of straight segments reads as a sawtooth at this spacing, and a
     * true spline would need a second pass to stay inside the band.
     */
    const trace = () => {
      const first = pointAt(0);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < samples.length - 1; i++) {
        const a = pointAt(i);
        const b = pointAt(i + 1);
        ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
      const last = pointAt(samples.length - 1);
      ctx.lineTo(last.x, last.y);
    };

    const draw = () => {
      const palette: TonePalette = MARKET.tone[skin.current.tone];
      const colour = `rgb(${skin.current.rgb})`;

      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;

      /*
       * The grid is drawn source-over in both tones, before the composite mode
       * is set. Under `lighter` a full-width hairline crossing the tape's own
       * fill would brighten it along every rule, and a plot grid that is
       * brighter where the data is is a grid drawn on top of the reading.
       */
      ctx.globalAlpha = palette.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      // Off the clock, not off `phase`: `phase` resets to zero every time a
      // sample is appended, and a grid keyed to it would snap back twice a
      // second. Half speed, so it reads as a scale the tape moves across rather
      // than as a second thing scrolling at the same rate.
      const gridShift = (clock * tape.speed * 0.5) % tape.gridX;
      for (let x = -gridShift; x < width; x += tape.gridX) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, height);
      }
      for (let y = 0; y < height; y += tape.gridY) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(width, Math.round(y) + 0.5);
      }
      ctx.stroke();

      /*
       * Additive on the dark page, so two rings crossing sum into a brighter
       * arc — that summing is what makes overlapping ripples read as light
       * rather than as line art. Source-over on paper, where adding light to a
       * near-white ground adds nothing.
       */
      ctx.globalCompositeOperation =
        skin.current.tone === 'glow' ? 'lighter' : 'source-over';

      // The area under the line. Faded to nothing at the bottom of the screen
      // rather than filled flat: the fill is there to give the line a side to
      // belong to, and a flat wash to the page edge reads as a second ground.
      const wash = ctx.createLinearGradient(0, height * (1 - tape.band.to), 0, height);
      wash.addColorStop(0, `rgba(${skin.current.rgb},${palette.fill})`);
      wash.addColorStop(1, `rgba(${skin.current.rgb},0)`);
      ctx.globalAlpha = 1;
      ctx.fillStyle = wash;
      ctx.beginPath();
      trace();
      ctx.lineTo(width, height);
      ctx.lineTo(pointAt(0).x, height);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = colour;

      ctx.globalAlpha = palette.line;
      ctx.lineWidth = 1.6;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      trace();
      ctx.stroke();

      // The head: where the next tick will land, and the only part of the tape
      // bright enough to find at a glance.
      const head = pointAt(headIndex());
      ctx.globalAlpha = palette.head * 0.28;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = palette.head;
      ctx.beginPath();
      ctx.arc(head.x, head.y, 2.6, 0, Math.PI * 2);
      ctx.fill();

      for (const ring of rings) {
        if (ring.born < 0) continue;

        const t = (clock - ring.born) / field.life;
        if (t >= 1) {
          ring.born = -1;
          continue;
        }

        /*
         * Radius eases *out* and alpha falls off squared. A ring at constant
         * speed with linear fade reads as a mechanical sweep; slowing as it
         * widens and dimming faster than it slows is what a ripple does, and it
         * also puts the brightest part of the animation nearest the venue,
         * where the eye already is.
         */
        const eased = 1 - (1 - t) ** 2.2;
        const radius = eased * field.maxRadius;
        const alpha = palette.ring * ring.strength * (1 - t) ** 2;

        ctx.globalAlpha = Math.min(alpha, 1);
        // Thinning as it expands keeps the ring's total ink roughly constant,
        // so a wide ring does not out-weigh the venue that emitted it.
        ctx.lineWidth = 1.5 * (1 - t * 0.55);
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      for (const venue of venues) {
        ctx.globalAlpha = Math.min(palette.dot, 1);
        ctx.beginPath();
        ctx.arc(venue.x, venue.y, venue.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    /* ── loop ─────────────────────────────────────────────────────────────── */

    repaint.current = draw;

    resize();

    const observer = new ResizeObserver(() => {
      resize();
      if (reduced) repaint.current?.();
    });
    observer.observe(host);

    /*
     * Reduced motion: one static frame — the tape as it stands, the venues, and
     * no rings at all. Not a slowed-down version: an expanding circle and a
     * scrolling chart are both entirely motion, and there is no gentle version
     * of either. What is left is a line that has climbed and the venues that
     * did it, which is still the right picture for the page.
     */
    if (reduced) {
      repaint.current();
      return () => {
        observer.disconnect();
        repaint.current = null;
      };
    }

    const onPointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.inside = true;
    };

    const onPointerOut = (event: PointerEvent) => {
      // `relatedTarget` is null only when the pointer has left the window
      // itself, not when it crosses between elements inside it.
      if (!event.relatedTarget) pointer.inside = false;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerout', onPointerOut, { passive: true });

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      // Clamped: a backgrounded tab resumes with a multi-second gap, and
      // integrating that in one step would fire every venue at once, expire
      // every ring in the pool, and scroll the tape a screen and a half.
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      step(dt);
      draw();

      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerout', onPointerOut);
      repaint.current = null;
    };
  }, [reduced]);

  // A theme change is a colour swap, not a rebuild. The frozen tape needs the
  // repaint; the running one would have picked it up on the next frame anyway.
  useEffect(() => {
    skin.current = { rgb: toRgb(primaryColor), tone };
    repaint.current?.();
  }, [primaryColor, tone]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
});
