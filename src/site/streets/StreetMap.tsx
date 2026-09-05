import { memo, useEffect, useRef } from 'react';
import { useReducedMotion } from '../../components/GlobeHero/hooks/useReducedMotion';
import type { GlobeTone } from '../theme/context';
import { STREETS } from './config';

/**
 * The Contact page's backdrop: a route drawing itself across the page.
 *
 * An avenue reaches out from a seed, side-streets come off it as the tip passes
 * them, lanes come off those, and landmarks light where the map arrives at
 * something. Then it holds, fades, and another starts from somewhere else —
 * because a contact page is asked the same question by a different person every
 * day, and the answer is always a way to get from where they are to us.
 *
 * **It was Relocate's, briefly, and was the wrong picture there** — not the
 * wrong drawing. Relocate's subject is a whole place becoming legible, which is
 * areas and volumes and now a city; a flat lattice of hairlines said the right
 * words and had no mass to say them with. Here the subject genuinely *is* lines:
 * getting in touch is a route, not a place, and the one thing this page has to
 * say is that there is a way through. See `city/CityRise` for the other half of
 * that argument.
 *
 * Contact had the globe before it had nothing, and the reason it lost the globe
 * does not apply to this. That was a scroll transition pinning a hero pose over
 * a one-section form — `scrollAnchorId` exists to retire the globe into an arc
 * and there is nothing below the fold here to retire it through. A flat canvas
 * has no hero pose and no transition; it is a layer, and a layer over one screen
 * is exactly what a layer is for.
 *
 * Canvas 2D, one context, nothing per-frame through React state — the same
 * construction as `NetworkWeb`, `MarketTape`, `StubDrift` and `CityRise`, for
 * the reasons in the header of each. Its own wrinkle is that the population
 * *grows*: every other backdrop seeds a fixed field and moves it, where this
 * starts at one segment and builds, which is why `maxStreets` is a hard cap
 * rather than a consequence of the numbers above it.
 */

/** E, S, W, N. Axis-aligned throughout: see the `block` note in `config.ts`. */
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

interface Street {
  /** Where it starts. The far end is `x + dx * len`, `y + dy * len`. */
  x: number;
  y: number;
  dir: number;
  /** How much of it has been drawn, in CSS px, and how much there will be. */
  len: number;
  target: number;
  /** Index into `STREETS.ranks` — avenue, street, lane, alley. */
  rank: number;
  /**
   * Distances along this street where a side-street comes off, ascending, and
   * how many have been taken. Consumed as the tip passes them rather than all
   * at once, which is what makes the side-streets appear *behind* the tip
   * instead of with it.
   */
  branches: number[];
  taken: number;
  /** Pointer proximity, 0..1, recomputed each frame. */
  heat: number;
}

interface Landmark {
  x: number;
  y: number;
  /** Seconds since it appeared, for the arrival ring. */
  age: number;
  heat: number;
}

/**
 * One map: a seed, everything grown from it, and where it is in its life.
 *
 * `phase` is not derived from `age` at the point of use because the growth has
 * to *stop* being fed at the same instant the next map is seeded, and a
 * comparison written in two places is a comparison that disagrees with itself
 * the first time either is edited.
 */
interface MapRun {
  streets: Street[];
  landmarks: Landmark[];
  /** Junctions, as a flat `x, y` pair list — the candidates a press grows from. */
  junctions: number[];
  age: number;
  phase: 'growing' | 'holding' | 'fading' | 'done';
  /** 0..1, multiplied into every mark this map draws. */
  alpha: number;
  /** Streets added by a press, capped so a held button cannot mat the screen. */
  pressed: number;
}

/** One tone's alpha budget. Structural, so both entries in `STREETS.tone` fit. */
interface TonePalette {
  street: number;
  junction: number;
  landmark: number;
  ring: number;
  boost: number;
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

interface StreetMapProps {
  primaryColor: string;
  /** `'ink'` on a light page: see the `tone` block in `config.ts`. */
  tone: GlobeTone;
  className?: string;
}

export const StreetMap = memo(function StreetMap({
  primaryColor,
  tone,
  className,
}: StreetMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  /*
   * Colour is read *inside* the loop rather than closed over, so switching
   * theme repaints the map that is standing instead of tearing the effect down
   * and starting a different one halfway through its life.
   */
  const skin = useRef({ rgb: toRgb(primaryColor), tone });

  /** Set by the main effect; lets the theme effect below repaint a frozen map. */
  const repaint = useRef<(() => void) | null>(null);

  useEffect(() => {
    const host = canvasRef.current;
    if (!host) return;
    const ctx = host.getContext('2d');
    if (!ctx) return;

    const maps: MapRun[] = [];
    let width = 0;
    let height = 0;

    const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, strength: 0, target: 0 };

    const between = (min: number, max: number) => min + Math.random() * (max - min);
    const pick = (range: readonly number[]) => Math.round(between(range[0], range[1]));

    /** A length in blocks, jittered off the lattice — see `jitter` in config. */
    const blocks = (count: number) =>
      count * STREETS.block * (1 + between(-STREETS.jitter, STREETS.jitter));

    /* ── growing ──────────────────────────────────────────────────────────── */

    /**
     * One street, if the map has room and the start is on the page.
     *
     * The bounds test is on the **start** rather than on the whole segment, on
     * purpose: a road that runs off the edge is what a road does, and clipping
     * every street to the viewport would draw a map with a rectangular wall
     * around it. What is refused is a street that begins outside, which draws
     * nothing anybody can see and spends a slot in `maxStreets` doing it.
     */
    const grow = (run: MapRun, x: number, y: number, dir: number, rank: number) => {
      if (run.streets.length >= STREETS.maxStreets) return;
      const margin = STREETS.block * 2;
      if (x < -margin || y < -margin || x > width + margin || y > height + margin) return;

      const spec = STREETS.ranks[rank];
      const target = blocks(pick(spec.blocks));

      /* Branch points on the lattice and in order. Ascending because the tip
         consumes them in a single forward pass — an unsorted list would skip
         the ones behind whichever it met first. */
      const count = pick(spec.branches);
      const branches: number[] = [];
      for (let i = 0; i < count; i++) {
        const at = blocks(1 + Math.floor(Math.random() * Math.max(1, spec.blocks[1] - 1)));
        if (at < target) branches.push(at);
      }
      branches.sort((a, b) => a - b);

      run.streets.push({ x, y, dir, len: 0, target, rank, branches, taken: 0, heat: 0 });
    };

    /** A junction, and sometimes something worth marking on the map. */
    const junction = (run: MapRun, x: number, y: number) => {
      run.junctions.push(x, y);
      if (Math.random() < STREETS.landmarkChance) {
        run.landmarks.push({ x, y, age: 0, heat: 0 });
      }
    };

    const seedMap = (run: MapRun) => {
      run.streets.length = 0;
      run.landmarks.length = 0;
      run.junctions.length = 0;
      run.age = 0;
      run.phase = 'growing';
      run.alpha = 0;
      run.pressed = 0;

      /* Placed away from every map still on screen, or the reseed lands on top
         of the one still fading and the two read as one confused place. */
      const gap = Math.hypot(width, height) * STREETS.minSeparation;
      let x = 0;
      let y = 0;
      for (let attempt = 0; attempt < 12; attempt++) {
        x = between(width * 0.15, width * 0.85);
        y = between(height * 0.15, height * 0.85);
        const clash = maps.some(
          (other) =>
            other !== run &&
            other.phase !== 'done' &&
            other.streets.length > 0 &&
            Math.hypot(other.streets[0].x - x, other.streets[0].y - y) < gap,
        );
        if (!clash) break;
      }

      /* Two avenues from the seed, crossing. One is a line; the crossing is the
         first thing on the canvas that reads as a *place*. */
      const axis = Math.floor(Math.random() * 4);
      grow(run, x, y, axis, 0);
      grow(run, x, y, (axis + 1) % 4, 0);
      junction(run, x, y);
    };

    /* ── simulation ───────────────────────────────────────────────────────── */

    const advance = (run: MapRun, dt: number) => {
      /* Snapshot the length: streets appended during this pass are the ones the
         tip has only just reached, and stepping them in the same frame would
         let a whole branch tree appear in one go. */
      const count = run.streets.length;

      for (let i = 0; i < count; i++) {
        const street = run.streets[i];
        if (street.len >= street.target) continue;

        street.len = Math.min(street.target, street.len + STREETS.ranks[street.rank].speed * dt);

        /* Side-streets, as the tip passes them. Growth is fed only while the map
           is growing — one in `holding` keeps the streets it has and finishes
           drawing them, which is what "the route is complete" looks like. */
        if (run.phase !== 'growing') continue;

        const [dx, dy] = DIRS[street.dir];
        while (
          street.taken < street.branches.length &&
          street.branches[street.taken] <= street.len
        ) {
          const at = street.branches[street.taken];
          street.taken++;
          const bx = street.x + dx * at;
          const by = street.y + dy * at;
          /* Perpendicular, either hand. `+1` or `+3` mod 4 — never `+2`, which
             is the street it came from, drawn backwards over itself. */
          const turn = (street.dir + (Math.random() < 0.5 ? 1 : 3)) % 4;
          const rank = Math.min(street.rank + 1, STREETS.ranks.length - 1);
          grow(run, bx, by, turn, rank);
          /*
           * Sometimes both hands, which makes it a crossroads instead of a T.
           *
           * Worth its two lines: with one hand only, every junction on the map
           * is a T and the picture reads as a comb rather than as a network —
           * nothing ever encloses a block. A crossing is also the shape a person
           * pictures when they picture a street map at all.
           */
          if (Math.random() < STREETS.crossChance) grow(run, bx, by, (turn + 2) % 4, rank);
          junction(run, bx, by);
        }
      }

      /*
       * The map keeps reaching while it is growing.
       *
       * Without this it stops early and stands still for most of its life: the
       * branch tree runs itself out in about four seconds and the remaining nine
       * of the grow window are a finished picture pretending to be a growing
       * one. So when nothing is still extending, a fresh road sets off from a
       * junction already on the map — which is also what spends the street
       * budget. Half of `maxStreets` went unused before it.
       *
       * From a junction rather than from a new seed, because a second
       * disconnected sketch beside the first is two half-maps, not one that got
       * further.
       */
      if (run.phase === 'growing' && run.streets.length < STREETS.maxStreets) {
        const stillDrawing = run.streets.some((street) => street.len < street.target);
        if (!stillDrawing && run.junctions.length >= 2) {
          const at = Math.floor(Math.random() * (run.junctions.length / 2)) * 2;
          grow(run, run.junctions[at], run.junctions[at + 1], Math.floor(Math.random() * 4), 1);
        }
      }
    };

    const step = (dt: number) => {
      pointer.x += (pointer.tx - pointer.x) * STREETS.pointer.ease;
      pointer.y += (pointer.ty - pointer.y) * STREETS.pointer.ease;
      const gap = pointer.target - pointer.strength;
      pointer.strength += Math.sign(gap) * Math.min(Math.abs(gap), STREETS.pointer.fade * dt);

      for (const run of maps) {
        if (run.phase === 'done') {
          seedMap(run);
          continue;
        }

        run.age += dt;
        advance(run, dt);
        for (const landmark of run.landmarks) landmark.age += dt;

        const { grow: growFor, hold, fade } = STREETS.life;

        if (run.phase === 'growing') {
          /* Fading *in* is not in `life`: it is the first second of growing, and
             it exists so a reseed does not punch a finished-looking avenue onto
             the page at full weight. */
          run.alpha = Math.min(1, run.alpha + dt * 1.6);
          if (run.age >= growFor) run.phase = 'holding';
        } else if (run.phase === 'holding') {
          run.alpha = Math.min(1, run.alpha + dt * 1.6);
          if (run.age >= growFor + hold) run.phase = 'fading';
        } else {
          run.alpha -= dt / fade;
          if (run.alpha <= 0) {
            run.alpha = 0;
            run.phase = 'done';
          }
        }
      }

      /* The stagger: the moment one map stops growing, the next is seeded, so
         there is always one being drawn and one being read. Without it the page
         is briefly empty at every reseed, which on a backdrop reads as a flicker
         rather than as a beat. */
      if (maps.length < STREETS.maps) return;
      if (!maps.some((run) => run.phase === 'growing')) {
        seedMap(maps.reduce((a, b) => (a.age > b.age ? a : b)));
      }
    };

    /* ── heat ─────────────────────────────────────────────────────────────── */

    /**
     * Distance from the pointer to a street, not to its start.
     *
     * The segments are axis-aligned, so this is a clamp on one axis and an
     * absolute difference on the other — no projection, no square roots beyond
     * the final one. Measuring to the start instead would light a long avenue
     * only when the cursor was near the end it happened to begin at.
     */
    const measureHeat = () => {
      const { radius } = STREETS.pointer;

      for (const run of maps) {
        for (const street of run.streets) {
          if (pointer.strength <= 0) {
            street.heat = 0;
            continue;
          }
          const [dx, dy] = DIRS[street.dir];
          const ex = street.x + dx * street.len;
          const ey = street.y + dy * street.len;
          const px = Math.max(Math.min(street.x, ex), Math.min(Math.max(street.x, ex), pointer.x));
          const py = Math.max(Math.min(street.y, ey), Math.min(Math.max(street.y, ey), pointer.y));
          const distance = Math.hypot(px - pointer.x, py - pointer.y);
          const falloff = distance >= radius ? 0 : 1 - distance / radius;
          street.heat = falloff * falloff * pointer.strength;
        }

        for (const landmark of run.landmarks) {
          if (pointer.strength <= 0) {
            landmark.heat = 0;
            continue;
          }
          const distance = Math.hypot(landmark.x - pointer.x, landmark.y - pointer.y);
          const falloff = distance >= radius ? 0 : 1 - distance / radius;
          landmark.heat = falloff * falloff * pointer.strength;
        }
      }
    };

    /* ── drawing ──────────────────────────────────────────────────────────── */

    const draw = () => {
      const palette: TonePalette = STREETS.tone[skin.current.tone];
      const colour = `rgb(${skin.current.rgb})`;

      ctx.clearRect(0, 0, width, height);

      /*
       * Additive on the dark page, so a crossing sums into a brighter knot
       * without anything drawing one — the junctions light themselves. Plain
       * source-over on the light one, where adding light to a near-white ground
       * means adding nothing.
       */
      ctx.globalCompositeOperation = skin.current.tone === 'glow' ? 'lighter' : 'source-over';
      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;
      ctx.lineCap = 'square';

      for (const run of maps) {
        if (run.alpha <= 0) continue;

        for (const street of run.streets) {
          if (street.len <= 0) continue;
          const [dx, dy] = DIRS[street.dir];
          const spec = STREETS.ranks[street.rank];

          ctx.globalAlpha = Math.min(
            palette.street * run.alpha * (1 + palette.boost * street.heat),
            1,
          );
          ctx.lineWidth = spec.width * (1 + STREETS.pointer.swell * street.heat);
          ctx.beginPath();
          ctx.moveTo(street.x, street.y);
          ctx.lineTo(street.x + dx * street.len, street.y + dy * street.len);
          ctx.stroke();
        }

        /* Junctions are drawn from the flat pair list rather than as objects:
           there are a couple of hundred of them, they never move, and they carry
           no state — an object each would be allocation for nothing. */
        ctx.globalAlpha = Math.min(palette.junction * run.alpha, 1);
        for (let i = 0; i < run.junctions.length; i += 2) {
          ctx.beginPath();
          ctx.arc(run.junctions[i], run.junctions[i + 1], 1.15, 0, Math.PI * 2);
          ctx.fill();
        }

        for (const landmark of run.landmarks) {
          const boost = 1 + palette.boost * landmark.heat;

          /* The arrival ring: one expanding circle, once, on the frame the map
             reached this place. It is the only thing here that happens *to* the
             map rather than being part of it, which is why it gets the one
             gesture — everything else is a line being drawn. */
          const ring = landmark.age / STREETS.landmarkRing.seconds;
          if (ring < 1) {
            ctx.globalAlpha = Math.min(palette.ring * run.alpha * (1 - ring), 1);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(landmark.x, landmark.y, ring * STREETS.landmarkRing.radius, 0, Math.PI * 2);
            ctx.stroke();
          }

          /* A square, not a disc. Every junction on this map is already a dot,
             and a landmark that is a slightly larger dot is a junction somebody
             has to squint at. */
          const size = STREETS.landmarkSize * (1 + 0.5 * landmark.heat);
          ctx.globalAlpha = Math.min(palette.landmark * run.alpha * boost, 1);
          ctx.fillRect(landmark.x - size, landmark.y - size, size * 2, size * 2);
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    /* ── size ─────────────────────────────────────────────────────────────── */

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
      // re-applied here — after it, everything below is in CSS pixels.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      /* Maps survive a resize. A rotated phone should not throw away the route
         being read; the block size is absolute, so the same map is simply seen
         through a different window. */
      while (maps.length < STREETS.maps) {
        const run: MapRun = {
          streets: [],
          landmarks: [],
          junctions: [],
          age: 0,
          phase: 'done',
          alpha: 0,
          pressed: 0,
        };
        maps.push(run);
        seedMap(run);
        /* Staggered at birth by the same interval the loop keeps them at, so the
           pair does not spend its first cycle in lockstep and reseed together. */
        run.age = maps.length === 1 ? 0 : STREETS.life.grow * 0.55;
      }
    };

    /* ── loop ─────────────────────────────────────────────────────────────── */

    repaint.current = () => {
      measureHeat();
      draw();
    };

    resize();

    const observer = new ResizeObserver(() => {
      resize();
      if (reduced) repaint.current?.();
    });
    observer.observe(host);

    /*
     * Reduced motion: one finished map, drawn once, holding still — and no
     * pointer torch either. A map that lights up as the cursor sweeps across it
     * is motion too, however welcome it is otherwise.
     *
     * It is grown by running the simulation in fixed steps rather than by
     * setting every `len` to its `target`, because the branches are spawned *by*
     * the growth: skipping it would leave two avenues and nothing else.
     */
    if (reduced) {
      for (const run of maps) {
        if (run !== maps[0]) {
          run.phase = 'done';
          run.alpha = 0;
          continue;
        }
        run.age = 0;
        run.phase = 'growing';
        for (let i = 0; i < 400; i++) advance(run, 1 / 60);
        run.phase = 'holding';
        run.alpha = 1;
        for (const landmark of run.landmarks) landmark.age = STREETS.landmarkRing.seconds;
      }
      repaint.current();
      return () => {
        observer.disconnect();
        repaint.current = null;
      };
    }

    const onPointerMove = (event: PointerEvent) => {
      // First sighting: land the follower on the cursor rather than flying it in
      // from whatever corner the page started at.
      if (pointer.strength <= 0) {
        pointer.x = event.clientX;
        pointer.y = event.clientY;
      }
      pointer.tx = event.clientX;
      pointer.ty = event.clientY;
      pointer.target = 1;
    };

    const onPointerOut = (event: PointerEvent) => {
      // `relatedTarget` is null only when the pointer has left the window
      // itself, not when it crosses between elements inside it.
      if (!event.relatedTarget) pointer.target = 0;
    };

    /**
     * A press grows a road toward it, from the junction already nearest.
     *
     * From a junction and not from the press itself, because a street that
     * starts where you clicked is a mark on top of the map rather than part of
     * it — the whole picture is a network, and a segment joined to nothing says
     * the opposite of what the page does. The direction is whichever of the four
     * axes points most nearly at the press, so the road visibly sets off toward
     * it without the map giving up being rectilinear.
     *
     * Deliberately not `preventDefault`ed and deliberately on `window`: the
     * canvas is `pointer-events: none` under the whole page, so this fires from
     * presses on the content above it. Pressing "Send" grows a street *and*
     * submits the form, which is the correct order of importance.
     */
    const onPointerDown = (event: PointerEvent) => {
      const target = maps.find((run) => run.phase === 'growing' || run.phase === 'holding');
      if (!target || target.junctions.length === 0) return;
      if (target.pressed >= STREETS.press.maxPerMap) return;

      let best = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < target.junctions.length; i += 2) {
        const distance = Math.hypot(
          target.junctions[i] - event.clientX,
          target.junctions[i + 1] - event.clientY,
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          best = i;
        }
      }

      const jx = target.junctions[best];
      const jy = target.junctions[best + 1];
      const dx = event.clientX - jx;
      const dy = event.clientY - jy;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx >= 0 ? 0 : 2) : dy >= 0 ? 1 : 3;

      const before = target.streets.length;
      grow(target, jx, jy, dir, STREETS.press.rank);
      if (target.streets.length === before) return;

      /* Longer than the rank would give it: the gesture has to visibly cross
         ground, or a click reads as nothing having happened. */
      target.streets[target.streets.length - 1].target = blocks(pick(STREETS.press.reach));
      target.pressed++;
      junction(target, jx, jy);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerout', onPointerOut, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      // Clamped: a backgrounded tab resumes with a multi-second gap, and
      // integrating that in one step would build an entire map between frames.
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      step(dt);
      measureHeat();
      draw();

      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerout', onPointerOut);
      window.removeEventListener('pointerdown', onPointerDown);
      repaint.current = null;
    };
  }, [reduced]);

  // A theme change is a colour swap, not a rebuild. The frozen map needs the
  // repaint; the animated one would have picked it up on the next frame anyway.
  useEffect(() => {
    skin.current = { rgb: toRgb(primaryColor), tone };
    repaint.current?.();
  }, [primaryColor, tone]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
});
