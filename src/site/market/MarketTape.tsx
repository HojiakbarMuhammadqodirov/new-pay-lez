import { memo, useEffect, useRef } from 'react';
import { useReducedMotion } from '../../components/GlobeHero/hooks/useReducedMotion';
import type { GlobeTone } from '../theme/context';
import { MARKET } from './config';

/**
 * The Business page's background: a candlestick tape printing left to right,
 * scrolling slowly, ticked upward by a field of venues under it — each of which
 * fires on its own rhythm, and fires again when the pointer passes it.
 *
 * It was a smoothed line, and candles say more with the same ink: a line says
 * "it went up", a candle says whether the session opened low and closed high or
 * gave it all back, and a venue firing now visibly *extends a body* instead of
 * nudging a curve. **Direction is drawn, not coloured** — the palette has one
 * accent, so up is a filled body and down is a hollow one, which is what a chart
 * printed in a single ink has always done.
 *
 * Canvas 2D, for the reason the node web is: the page already holds a WebGL
 * context for the controller on another route, browsers cap how many a document
 * may keep alive, and this is a few dozen rectangles and a few stroked arcs a
 * frame — nothing the 2D rasteriser notices, and no shader compile on first
 * paint.
 *
 * Nothing goes through React state. The candle buffer, the field, the ring pool,
 * the pointer and the clock all live in refs inside one effect, the way the
 * globe's scroll position and the web's node field do.
 */

/**
 * One session.
 *
 * All four are **departures from the trend**, not levels: the climb is added at
 * draw time from the candle's position across the width. Keeping the walk
 * centred on zero is what lets the tape rise forever without the buffer
 * accumulating a value that would eventually leave the band.
 */
interface Candle {
  o: number;
  c: number;
  h: number;
  l: number;
}

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
  body: number;
  hollow: number;
  wick: number;
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
   * starting the print again from a flat buffer.
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

    /** The tape, oldest candle first. */
    let candles: Candle[] = [];
    /** How far the tape has scrolled since the last candle was printed, px. */
    let phase = 0;

    let width = 0;
    let height = 0;
    /** Seconds since the effect started. The one clock everything reads. */
    let clock = 0;

    const pointer = { x: -9999, y: -9999, inside: false };

    const between = (min: number, max: number) => min + Math.random() * (max - min);
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));

    /** The last candle still on screen — where the head rule sits and where a
     *  venue's tick lands. */
    const headIndex = () =>
      Math.max(
        0,
        Math.min(candles.length - 1, Math.floor((width + phase) / tape.spacing)),
      );

    /**
     * Print one more session.
     *
     * The open is the previous close, which is the only rule that makes a tape
     * a tape rather than a row of unrelated bars — a gap between two candles is
     * a thing that means something on a real chart, and one that appeared every
     * two seconds for no reason would mean nothing.
     */
    const print = () => {
      const previous = candles[candles.length - 1];
      const o = previous ? previous.c : 0;
      const c = clamp(o * (1 - tape.pull) + (Math.random() * 2 - 1) * tape.drift);
      const spread = Math.abs(c - o) * tape.wickSpread + tape.wickFloor;
      candles.push({
        o,
        c,
        h: Math.max(o, c) + Math.random() * spread,
        l: Math.min(o, c) - Math.random() * spread,
      });
      candles.shift();
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
       * on the candle under the head rule, so the ring and the uptick are the
       * same event drawn in two places rather than two effects that happen to
       * run at once.
       *
       * On the *visible* head rather than on the newest candle: the newest one
       * is off the right edge by design — that is where a tape's new data comes
       * from — and a tick that only appeared seven seconds later, once it had
       * scrolled in, would not read as caused by anything. Raising a candle
       * already on screen extends a body at the edge the instant the venue
       * fires, which is what a live tape does.
       *
       * The high follows the close, because a session cannot close above its
       * own high. Getting that wrong is not a rounding error to anybody who
       * reads these for a living — it is a candle that cannot exist.
       */
      const candle = candles[headIndex()];
      candle.c = clamp(candle.c + tape.tick * strength);
      candle.h = Math.max(candle.h, candle.c);
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

      // Two spare candles: one off each end, so the tape is already printed
      // past both edges and the scroll never reveals a stub.
      const count = Math.ceil(width / tape.spacing) + 3;
      const previous = candles;
      candles = Array.from(
        { length: count },
        (_, i) => previous[i] ?? { o: 0, c: 0, h: 0, l: 0 },
      );
      // A fresh buffer of zeroes is a row of flat lines, which is the one shape
      // a market never has. Print it forward before the first paint.
      if (!previous.length) for (let i = 0; i < count * 2; i++) print();

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
        print();
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

    /** Centre x of candle `i`. */
    const xAt = (i: number) => i * tape.spacing - phase;

    /**
     * Screen y of one value on candle `i`. The climb is applied here, not
     * stored — see the note on `Candle`.
     */
    const yAt = (i: number, value: number) => {
      const span = Math.max(candles.length - 1, 1);
      const t = i / span;
      /* Read per call rather than hoisted: `width` is reassigned by the resize
         handler, and a band captured once would keep a rotated phone drawing
         the desktop tape until something else forced a re-run. */
      const band = width <= tape.narrowWidth ? tape.bandNarrow : tape.band;
      const reach = band.to - band.from;
      const level = band.from + t * reach + value * tape.wiggle * reach;
      return height * (1 - level);
    };

    const draw = () => {
      const palette: TonePalette = MARKET.tone[skin.current.tone];
      const colour = `rgb(${skin.current.rgb})`;

      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;

      /*
       * The grid is drawn source-over in both tones, before the composite mode
       * is set. Under `lighter` a full-width hairline crossing a candle body
       * would brighten it along every rule, and a plot grid that is brighter
       * where the data is is a grid drawn on top of the reading.
       */
      ctx.globalAlpha = palette.grid;
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      // Off the clock, not off `phase`: `phase` resets to zero every time a
      // candle is printed, and a grid keyed to it would snap back twice a
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

      /*
       * The candles.
       *
       * Wicks first, in one path for the whole tape: they are all the same
       * colour at the same alpha and the same width, so batching them is one
       * `stroke()` instead of one per candle — and it also puts every wick
       * *under* every body, which is where the join has to be or a hollow
       * candle shows the wick crossing its own middle.
       */
      const half = tape.width / 2;
      const left = Math.max(0, Math.floor(phase / tape.spacing) - 1);
      const right = Math.min(candles.length - 1, headIndex() + 1);

      ctx.globalAlpha = palette.wick;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = left; i <= right; i++) {
        // Half-pixel so a 1px wick lands on a pixel rather than across two,
        // which at this alpha is the difference between a line and a smudge.
        const x = Math.round(xAt(i)) + 0.5;
        ctx.moveTo(x, yAt(i, candles[i].h));
        ctx.lineTo(x, yAt(i, candles[i].l));
      }
      ctx.stroke();

      for (let i = left; i <= right; i++) {
        const candle = candles[i];
        const up = candle.c >= candle.o;
        const top = yAt(i, Math.max(candle.o, candle.c));
        const bottom = yAt(i, Math.min(candle.o, candle.c));
        const x = Math.round(xAt(i) - half);
        const y = Math.round(top);
        // A doji is a real session and has to be visible; without the floor it
        // is a zero-height rectangle and simply is not drawn.
        const h = Math.max(Math.round(bottom - top), tape.minBody);

        if (up) {
          ctx.globalAlpha = palette.body;
          ctx.fillRect(x, y, tape.width, h);
        } else {
          // Hollow: the page shows through, which is exactly what "down" has to
          // read as when there is no second colour to say it with. Inset by
          // half a line width so the 1px outline sits inside the body's own
          // bounds and an up and a down candle measure the same.
          ctx.globalAlpha = palette.hollow;
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, tape.width - 1, Math.max(h - 1, 1));
        }
      }

      /*
       * The head: the last close, as the dashed rule every trading screen puts
       * there, plus the dot. It is the only part of the tape bright enough to
       * find at a glance, and it is where the next tick will land.
       */
      const head = headIndex();
      const headY = Math.round(yAt(head, candles[head].c)) + 0.5;
      ctx.globalAlpha = palette.head * 0.4;
      ctx.lineWidth = 1;
      // Spread, because `as const` in the config makes it a readonly tuple and
      // `setLineDash` wants a mutable array.
      ctx.setLineDash([...tape.rule]);
      ctx.beginPath();
      ctx.moveTo(0, headY);
      ctx.lineTo(xAt(head), headY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.globalAlpha = palette.head * 0.28;
      ctx.beginPath();
      ctx.arc(xAt(head), headY, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = palette.head;
      ctx.beginPath();
      ctx.arc(xAt(head), headY, 2.6, 0, Math.PI * 2);
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
     * of either. What is left is a market that has climbed and the venues that
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
