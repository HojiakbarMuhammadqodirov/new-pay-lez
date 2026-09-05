import { memo, useEffect, useRef } from 'react';
import { useReducedMotion } from '../../components/GlobeHero/hooks/useReducedMotion';
import type { GlobeTone } from '../theme/context';
import { CITY } from './config';

/**
 * The Relocate page's backdrop: a city that builds itself around you, block by
 * block, and never runs out.
 *
 * That is the page's own sentence. Relocate is not a border being crossed — the
 * globe was, and left for exactly that reason. It is the guide to the place you
 * have already arrived in, where nothing has a name yet and the whole product is
 * the business of making it legible. So the ground opens ahead of the camera,
 * blocks stand up in a wave running outward, and the city keeps going, because
 * there is always more of it than you have learnt.
 *
 * **It is the third answer for this route and the first two are worth knowing.**
 * The globe went first. `.site__rings` — CSS contour rings meaning "distance
 * from where you are standing" — replaced it, and was true and never moved, on
 * the one page whose subject is something you are in the middle of doing. Then a
 * flat street map drew itself in plan, which said the right thing and looked
 * like a wiring diagram: hairlines on black, no depth, no mass, nothing a page
 * can stand on. The lesson is in `CITY.heights` and `CITY.tone` — a city is
 * **areas and volumes**, and a backdrop built only from lines is a sketch of one.
 *
 * It shares no vocabulary with the node web one route over. That is points that
 * drift and link, a population being measured; this has no population, no
 * proximity rule and no motion of its own — a fixed lattice the camera moves
 * through, which is a different picture in every respect that matters.
 *
 * Canvas 2D, one context, nothing per-frame through React state — the same
 * construction as `NetworkWeb`, `MarketTape` and `StubDrift`. Two wrinkles of
 * its own:
 *
 * - **Nothing is stored.** A block's height is a pure hash of its plan
 *   coordinates, so the lattice is generated fresh every frame from the camera
 *   alone and a block that leaves the view and comes back is the same building.
 *   There is no array of a thousand structures to keep, prune or reconcile.
 * - **Draw order is the depth buffer.** Painter's algorithm on `i + j`, which in
 *   this projection is exactly screen depth, so a near tower covers the one
 *   behind it with no sorting pass and no per-face test.
 */

/** One tone's alpha budget. Structural, so both entries in `CITY.tone` fit. */
interface TonePalette {
  edge: number;
  roof: number;
  left: number;
  right: number;
  ground: number;
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

/**
 * A block's own random number, from its plan coordinates alone.
 *
 * Integer hash rather than a stored seed, and it is what lets the whole city be
 * stateless: the same block is the same height every time it is drawn, so the
 * camera can leave a district and come back to it unchanged without anything
 * having remembered it. A `Math.random()` per block would rebuild the skyline
 * every frame, and a stored one would need a map the size of everywhere the
 * camera has ever been.
 *
 * `>>> 0` on the way out because the intermediate products overflow into
 * negatives, and a negative divided by 2^32 is not a probability.
 */
function hash(i: number, j: number, salt: number): number {
  let h = (i * 374761393 + j * 668265263 + salt * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Storeys for a block, from the distribution in `CITY.heights`. */
function storeysAt(i: number, j: number): number {
  const roll = hash(i, j, 1);
  for (const band of CITY.heights) if (roll <= band.upTo) return band.storeys;
  return 0;
}

interface CityRiseProps {
  primaryColor: string;
  /**
   * The page's own ground.
   *
   * Every other 2D backdrop here draws onto a transparent canvas and lets the
   * page show through. This one cannot: the buildings have to be **opaque**, or
   * a near tower does not cover the one behind it and the whole picture collapses
   * back into the wireframe it replaced. So each face is painted in this colour
   * and then tinted with the accent, which is what makes the city solid while
   * keeping the page to exactly two colours.
   */
  backgroundColor: string;
  /** `'ink'` on a light page: see the `tone` block in `config.ts`. */
  tone: GlobeTone;
  className?: string;
}

export const CityRise = memo(function CityRise({
  primaryColor,
  backgroundColor,
  tone,
  className,
}: CityRiseProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  /*
   * Colour is read *inside* the loop rather than closed over, so switching
   * theme repaints the city the camera is standing in instead of tearing the
   * effect down and rebuilding it somewhere else.
   */
  const skin = useRef({ rgb: toRgb(primaryColor), ground: backgroundColor, tone });

  /** Set by the main effect; lets the theme effect below repaint a frozen city. */
  const repaint = useRef<(() => void) | null>(null);

  useEffect(() => {
    const host = canvasRef.current;
    if (!host) return;
    const ctx = host.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let veil: CanvasGradient | null = null;

    /** Camera position in screen space; the lattice itself never moves. */
    const camera = { x: 0, y: 0 };
    /** Seconds since mount, which is what the build wave is measured against. */
    let clock = 0;

    const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, strength: 0, target: 0 };

    /**
     * Blocks a press has put a tower on, as `"i,j"`.
     *
     * The one piece of state the city keeps, and it is bounded by
     * `CITY.press.max` — the whole point of the hash above is that nothing else
     * needs storing, and a press is the one thing that is not a function of
     * where a block is.
     */
    const raised = new Set<string>();

    /* ── projection ───────────────────────────────────────────────────────── */

    const { w: tileW, h: tileH } = CITY.tile;

    /** Plan (i, j) to the block's ground centre on screen. */
    const projectX = (i: number, j: number) => (i - j) * (tileW / 2) + camera.x;
    const projectY = (i: number, j: number) => (i + j) * (tileH / 2) + camera.y;

    /**
     * The plan coordinates under a screen point — the projection, inverted.
     *
     * Needed only by the press. Solving the two projection equations for i and j
     * gives these two halves; rounding rather than flooring because the diamond
     * is centred on its coordinate, not cornered at it.
     */
    const planAt = (sx: number, sy: number) => {
      const ox = (sx - camera.x) / (tileW / 2);
      const oy = (sy - camera.y) / (tileH / 2);
      return { i: Math.round((oy + ox) / 2), j: Math.round((oy - ox) / 2) };
    };

    /* ── drawing ──────────────────────────────────────────────────────────── */

    /** The four corners of a block's diamond, inset by the street gap. */
    const inset = 1 - CITY.gap;
    const halfW = (tileW / 2) * inset;
    const halfH = (tileH / 2) * inset;

    /* Set once per frame by `draw` and read by `quad` — two strings, rather
       than two more arguments on each of the eight hundred calls a frame. */
    let accent = '';
    let ground = '';

    const quad = (
      ax: number, ay: number,
      bx: number, by: number,
      cx: number, cy: number,
      dx: number, dy: number,
      solid: number,
      fill: number,
      edge: number,
    ) => {
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.lineTo(cx, cy);
      ctx.lineTo(dx, dy);
      ctx.closePath();
      /*
       * Two passes, and the first is the whole reason this reads as a city.
       *
       * The page's own ground goes down opaque, so the face **occludes**
       * whatever is behind it; the accent then tints it. A single translucent
       * fill lets the far skyline through every near tower, which is a wireframe
       * with extra steps — and is exactly how the flat version of this backdrop
       * failed. `solid` drops below 1 only while a block is still fading in.
       */
      if (solid > 0) {
        ctx.globalAlpha = Math.min(solid, 1);
        ctx.fillStyle = ground;
        ctx.fill();
      }
      if (fill > 0) {
        ctx.globalAlpha = Math.min(fill, 1);
        ctx.fillStyle = accent;
        ctx.fill();
      }
      if (edge > 0) {
        ctx.globalAlpha = Math.min(edge, 1);
        ctx.stroke();
      }
    };

    const draw = () => {
      const palette: TonePalette = CITY.tone[skin.current.tone];
      const colour = `rgb(${skin.current.rgb})`;

      ctx.clearRect(0, 0, width, height);

      /* Source-over in both themes, unlike every other backdrop in `src/site/`:
         `lighter` cannot occlude, and occlusion is what this picture is made
         of. The two themes differ in which face carries the most accent, not in
         how the marks are composited — see the `tone` block in `config.ts`. */
      accent = colour;
      ground = skin.current.ground;
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1;
      ctx.lineJoin = 'round';

      /*
       * The visible span of the lattice.
       *
       * Derived from the four screen corners rather than guessed at: the
       * projection rotates the plan 45 degrees, so the (i, j) rectangle covering
       * a screen rectangle is *not* the one a naive divide gives, and the corner
       * that decides `iMax` is a different corner from the one that decides
       * `jMax`. The margin is in blocks and covers the tallest tower, which is
       * drawn from a plan position well below where its roof lands.
       */
      const margin = 2 + Math.ceil((CITY.storey * 9) / tileH);
      const corners = [
        planAt(0, 0),
        planAt(width, 0),
        planAt(0, height),
        planAt(width, height),
      ];
      const iMin = Math.min(...corners.map((c) => c.i)) - margin;
      const iMax = Math.max(...corners.map((c) => c.i)) + margin;
      const jMin = Math.min(...corners.map((c) => c.j)) - margin;
      const jMax = Math.max(...corners.map((c) => c.j)) + margin;

      /*
       * Painter's algorithm on `i + j`, which in this projection *is* screen
       * depth: a block's `sy` is `(i + j) * tileH / 2`, so ascending order draws
       * far to near and a tower simply covers what is behind it. That is the
       * whole depth solution — no sorting pass, no per-face test, no buffer.
       */
      let drawn = 0;
      for (let sum = iMin + jMin; sum <= iMax + jMax; sum++) {
        for (let i = Math.max(iMin, sum - jMax); i <= Math.min(iMax, sum - jMin); i++) {
          if (drawn >= CITY.maxBlocks) break;
          const j = sum - i;

          const cx = projectX(i, j);
          const cy = projectY(i, j);
          /* Cheap reject before any arithmetic per face. Generous on the top
             edge, where a tall building's roof is far above its ground plate. */
          if (cx < -tileW || cx > width + tileW) continue;
          if (cy < -tileH - CITY.storey * 9 || cy > height + tileH) continue;
          drawn++;

          /*
           * The build wave. `stagger` per block of distance from the camera's
           * own plan position, so the city stands up in a ring running outward
           * rather than the whole screen popping at once.
           */
          const origin = planAt(width / 2, height / 2);
          const distance = Math.abs(i - origin.i) + Math.abs(j - origin.j);
          const since = clock - distance * CITY.build.stagger;
          if (since <= 0) continue;

          const fade = Math.min(1, since / CITY.build.fade);
          /* Cubic ease-out: a building decelerates into its height instead of
             stopping dead, which is the difference between rising and snapping. */
          const t = Math.min(1, since / CITY.build.rise);
          const ease = 1 - (1 - t) * (1 - t) * (1 - t);

          let heat = 0;
          if (pointer.strength > 0) {
            const gap = Math.hypot(cx - pointer.x, cy - pointer.y);
            const falloff = gap >= CITY.pointer.radius ? 0 : 1 - gap / CITY.pointer.radius;
            heat = falloff * falloff * pointer.strength;
          }

          const boost = 1 + (CITY.pointer.boost - 1) * heat;
          const alpha = fade * boost;

          const base = raised.has(`${i},${j}`) ? CITY.press.storeys : storeysAt(i, j);
          const z = (base + CITY.pointer.lift * heat) * CITY.storey * ease;

          /* Ground plate. Drawn for every block, including the ones with nothing
             on them — the empty third of the city is what keeps it from being a
             solid mass of roofs, and its plate is what says the ground is still
             there. */
          if (z <= 0.5) {
            quad(
              cx, cy - halfH,
              cx + halfW, cy,
              cx, cy + halfH,
              cx - halfW, cy,
              fade,
              palette.ground * alpha,
              palette.edge * alpha * 0.55,
            );
            continue;
          }

          /* Two walls, then the roof on top of them. In this order because the
             roof's near edges have to sit over the walls rather than under. */
          quad(
            cx - halfW, cy,
            cx, cy + halfH,
            cx, cy + halfH - z,
            cx - halfW, cy - z,
            fade,
            palette.left * alpha,
            palette.edge * alpha,
          );
          quad(
            cx, cy + halfH,
            cx + halfW, cy,
            cx + halfW, cy - z,
            cx, cy + halfH - z,
            fade,
            palette.right * alpha,
            palette.edge * alpha,
          );
          quad(
            cx, cy - halfH - z,
            cx + halfW, cy - z,
            cx, cy + halfH - z,
            cx - halfW, cy - z,
            fade,
            palette.roof * alpha,
            palette.edge * alpha,
          );
        }
      }

      /* The horizon, painted back out. See the `veil` note in `config.ts`: the
         buildings are opaque, so distance cannot be an alpha on them — it is the
         page's own ground laid over the far half afterwards. It is also what
         keeps the top of the viewport quiet enough to carry a headline. */
      ctx.globalAlpha = 1;
      if (veil) {
        ctx.fillStyle = veil;
        ctx.fillRect(0, 0, width, height * CITY.veil.to);
      }
    };

    /* ── size ─────────────────────────────────────────────────────────────── */

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const previous = width;
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

      /* The camera keeps the same block under the middle of the view. A rotated
         phone should not teleport across town; the lattice is infinite, so
         "where we were" is the only thing a resize can get wrong. */
      if (previous === 0) {
        camera.x = width / 2;
        camera.y = height * 0.28;
      } else {
        camera.x += (width - previous) / 2;
      }

      buildVeil();
    };

    /* ── loop ─────────────────────────────────────────────────────────────── */

    /* Rebuilt on resize and on a theme change rather than per frame: a
       `CanvasGradient` is an object, and one a frame is pure garbage. */
    const buildVeil = () => {
      const gradient = ctx.createLinearGradient(0, 0, 0, height * CITY.veil.to);
      const rgb = toRgb(skin.current.ground);
      gradient.addColorStop(0, `rgba(${rgb},${CITY.veil.strength})`);
      gradient.addColorStop(1, `rgba(${rgb},0)`);
      veil = gradient;
    };

    repaint.current = () => {
      buildVeil();
      draw();
    };

    resize();

    const observer = new ResizeObserver(() => {
      resize();
      if (reduced) repaint.current?.();
    });
    observer.observe(host);

    /*
     * Reduced motion: the city stands finished and still — no drift, no build
     * wave, and no pointer either. A skyline that rises as the cursor sweeps
     * across it is motion too, however welcome it is otherwise.
     *
     * `clock` is set past the far corner's stagger rather than to a round
     * number, so every block on screen is fully up: the wave is measured in
     * blocks from the centre, and a large display has further corners.
     */
    if (reduced) {
      clock = CITY.build.rise + CITY.build.stagger * ((width + height) / CITY.tile.h + 8);
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

    /*
     * A press builds. Deliberately not `preventDefault`ed and deliberately on
     * `window`: the canvas is `pointer-events: none` under the whole page, so
     * this fires from presses on the content above it. Pressing a link puts a
     * tower up *and* follows the link, which is the correct order of importance.
     */
    const onPointerDown = (event: PointerEvent) => {
      const { i, j } = planAt(event.clientX, event.clientY);
      /* Bounded, and oldest-out: the set is the only thing this backdrop
         remembers, and a held button would otherwise grow it without limit. */
      if (raised.size >= CITY.press.max) {
        const oldest = raised.values().next().value;
        if (oldest !== undefined) raised.delete(oldest);
      }
      raised.add(`${i},${j}`);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerout', onPointerOut, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      // Clamped: a backgrounded tab resumes with a multi-second gap, and
      // integrating that in one step would fly the camera across the county.
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      clock += dt;

      camera.x += CITY.drift.x * dt;
      camera.y += CITY.drift.y * dt;

      pointer.x += (pointer.tx - pointer.x) * CITY.pointer.ease;
      pointer.y += (pointer.ty - pointer.y) * CITY.pointer.ease;
      const gap = pointer.target - pointer.strength;
      pointer.strength += Math.sign(gap) * Math.min(Math.abs(gap), CITY.pointer.fade * dt);

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

  // A theme change is a colour swap, not a rebuild. The frozen city needs the
  // repaint; the animated one would have picked it up on the next frame anyway.
  useEffect(() => {
    skin.current = { rgb: toRgb(primaryColor), ground: backgroundColor, tone };
    repaint.current?.();
  }, [primaryColor, backgroundColor, tone]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
});
