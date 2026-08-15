import { memo, useEffect, useRef } from 'react';
import { useReducedMotion } from '../../components/GlobeHero/hooks/useReducedMotion';
import type { GlobeTone } from '../theme/context';
import { WEB } from './config';

/**
 * The Analytics page's background: a drifting field of neon nodes that wire
 * themselves to every neighbour within range, brightening under the pointer.
 *
 * It began life behind L-Earn as "a player base"; it moved here when L-Earn
 * got the arcade trail, and the picture is truer in this spot — every dot a
 * customer, every link a pattern the dashboards above it exist to surface.
 *
 * Canvas 2D rather than WebGL, deliberately. The page already holds a GL
 * context for the controller, browsers cap how many a document may keep alive,
 * and the whole effect is a few hundred lines and discs per frame — well inside
 * what the 2D rasteriser does without breathing hard, and it costs no shader
 * compile on first paint.
 *
 * Nothing here goes through React state: the field, the pointer and the frame
 * clock all live in refs inside one effect, the way the globe's scroll position
 * does. A mesh that re-rendered the tree sixty times a second would take the
 * rest of the page down with it.
 */

interface Node {
  x: number;
  y: number;
  /** Velocity in CSS px/s — see the note on units in `config.ts`. */
  vx: number;
  vy: number;
  r: number;
  /** Pointer proximity, 0..1, recomputed each frame. */
  heat: number;
}

/** One tone's alpha budget. Structural, so both entries in `WEB.tone` fit. */
interface TonePalette {
  link: number;
  dot: number;
  halo: number;
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

interface NetworkWebProps {
  primaryColor: string;
  /** `'ink'` on a light page: see the `tone` block in `config.ts`. */
  tone: GlobeTone;
  className?: string;
}

export const NetworkWeb = memo(function NetworkWeb({
  primaryColor,
  tone,
  className,
}: NetworkWebProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  /*
   * Colour is read *inside* the loop rather than closed over, so switching
   * theme repaints the existing web instead of tearing the effect down and
   * scattering a fresh field of nodes.
   */
  const skin = useRef({ rgb: toRgb(primaryColor), tone });

  /** Set by the main effect; lets the theme effect below repaint a frozen web. */
  const repaint = useRef<(() => void) | null>(null);

  useEffect(() => {
    const host = canvasRef.current;
    if (!host) return;
    const ctx = host.getContext('2d');
    if (!ctx) return;

    const nodes: Node[] = [];
    let width = 0;
    let height = 0;

    /*
     * Pointer state. `x/y` chase `tx/ty` (the real cursor) so the highlight
     * lags slightly; `strength` chases `target`, which is 1 while the pointer
     * is inside the window and 0 once it leaves.
     */
    const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, strength: 0, target: 0 };

    const between = (min: number, max: number) => min + Math.random() * (max - min);

    /** Grows or trims the field to `count`, keeping the nodes already in it. */
    const seed = (count: number) => {
      while (nodes.length > count) nodes.pop();
      while (nodes.length < count) {
        const heading = Math.random() * Math.PI * 2;
        const speed = between(WEB.speed.min, WEB.speed.max);
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: Math.cos(heading) * speed,
          vy: Math.sin(heading) * speed,
          r: between(WEB.radius.min, WEB.radius.max),
          heat: 0,
        });
      }
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
      // re-applied here — after it, everything below is in CSS pixels.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Nodes survive a resize; a rotated phone should not re-scatter the web.
      for (const node of nodes) {
        node.x = Math.min(node.x, width);
        node.y = Math.min(node.y, height);
      }

      const target = Math.round((width * height) / WEB.areaPerNode);
      seed(Math.max(WEB.minNodes, Math.min(WEB.maxNodes, target)));
    };

    /* ── spatial grid ─────────────────────────────────────────────────────
     * Cells are exactly `linkDistance` across, so every partner a node can
     * reach lies in its own cell or one of the eight around it. Only four of
     * those eight are visited — the forward half — because a pair found from
     * both ends would be drawn twice, at double alpha.
     */
    let cols = 0;
    let rows = 0;
    let cells: number[][] = [];

    const rebuildGrid = () => {
      const nextCols = Math.max(1, Math.ceil(width / WEB.linkDistance));
      const nextRows = Math.max(1, Math.ceil(height / WEB.linkDistance));

      if (nextCols !== cols || nextRows !== rows) {
        cols = nextCols;
        rows = nextRows;
        cells = Array.from({ length: cols * rows }, () => []);
      } else {
        // Emptied rather than reallocated: this runs every frame, and a fresh
        // array-of-arrays per frame is pure garbage for the collector.
        for (const cell of cells) cell.length = 0;
      }

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const cx = Math.min(cols - 1, Math.max(0, Math.floor(node.x / WEB.linkDistance)));
        const cy = Math.min(rows - 1, Math.max(0, Math.floor(node.y / WEB.linkDistance)));
        cells[cy * cols + cx].push(i);
      }
    };

    /* ── simulation ───────────────────────────────────────────────────────── */

    const step = (dt: number) => {
      for (const node of nodes) {
        node.x += node.vx * dt;
        node.y += node.vy * dt;

        // Bounced, not wrapped: a node that teleports across the viewport takes
        // all of its links with it, which reads as a glitch rather than motion.
        if (node.x < 0) {
          node.x = 0;
          node.vx = -node.vx;
        } else if (node.x > width) {
          node.x = width;
          node.vx = -node.vx;
        }
        if (node.y < 0) {
          node.y = 0;
          node.vy = -node.vy;
        } else if (node.y > height) {
          node.y = height;
          node.vy = -node.vy;
        }
      }

      pointer.x += (pointer.tx - pointer.x) * WEB.pointer.ease;
      pointer.y += (pointer.ty - pointer.y) * WEB.pointer.ease;

      const gap = pointer.target - pointer.strength;
      pointer.strength += Math.sign(gap) * Math.min(Math.abs(gap), WEB.pointer.fade * dt);
    };

    /** Per-node pointer proximity, squared so the lit patch has a soft edge. */
    const measureHeat = () => {
      for (const node of nodes) {
        if (pointer.strength <= 0) {
          node.heat = 0;
          continue;
        }
        const distance = Math.hypot(node.x - pointer.x, node.y - pointer.y);
        const falloff =
          distance >= WEB.pointer.radius ? 0 : 1 - distance / WEB.pointer.radius;
        node.heat = falloff * falloff * pointer.strength;
      }
    };

    /* ── drawing ──────────────────────────────────────────────────────────── */

    /**
     * One line, if the pair is close enough.
     *
     * The link takes the *hotter* of its two ends rather than its own distance
     * from the pointer: a line reaching out of the lit patch stays lit along its
     * length, which is what makes the highlight read as a region of the web
     * waking up instead of a circle stencilled over it.
     */
    const link = (a: Node, b: Node, palette: TonePalette) => {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq >= WEB.linkDistance * WEB.linkDistance) return;

      const proximity = 1 - Math.sqrt(distanceSq) / WEB.linkDistance;
      const heat = a.heat > b.heat ? a.heat : b.heat;

      ctx.globalAlpha = Math.min(palette.link * proximity * (1 + palette.boost * heat), 1);
      ctx.lineWidth = 1 + WEB.pointer.swell * heat;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };

    // Forward-half neighbourhood: E, SW, S, SE.
    const NEIGHBOURS = [
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ];

    const draw = () => {
      const palette: TonePalette = WEB.tone[skin.current.tone];
      const colour = `rgb(${skin.current.rgb})`;

      ctx.clearRect(0, 0, width, height);

      /*
       * Additive on the dark page, so crossings sum into brighter knots — that
       * summing *is* the neon. Plain source-over on the light one, where adding
       * light to a near-white ground means adding nothing.
       */
      ctx.globalCompositeOperation =
        skin.current.tone === 'glow' ? 'lighter' : 'source-over';
      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;
      ctx.lineCap = 'round';

      rebuildGrid();

      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const own = cells[cy * cols + cx];

          for (let a = 0; a < own.length; a++) {
            const node = nodes[own[a]];

            // Inside the cell, only forward — or each pair is drawn twice.
            for (let b = a + 1; b < own.length; b++) link(node, nodes[own[b]], palette);

            for (const [ox, oy] of NEIGHBOURS) {
              const nx = cx + ox;
              const ny = cy + oy;
              if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
              for (const index of cells[ny * cols + nx]) link(node, nodes[index], palette);
            }
          }
        }
      }

      for (const node of nodes) {
        const boost = 1 + palette.boost * node.heat;

        // Halo first, under the dot. Two flat discs stand in for a radial
        // gradient, which would mean a new gradient object per node per frame
        // for a difference nobody can see at this size.
        ctx.globalAlpha = Math.min(palette.halo * boost, 1);
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r * 3.4 * (1 + node.heat), 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = Math.min(palette.dot * boost, 1);
        ctx.beginPath();
        ctx.arc(
          node.x,
          node.y,
          node.r * (1 + WEB.pointer.swell * node.heat),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
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
     * Reduced motion: the field is drawn once and then holds still — no loop,
     * and no pointer highlight either. A mesh that lights up as the cursor
     * sweeps across it is motion too, however welcome it is otherwise.
     */
    if (reduced) {
      repaint.current();
      return () => {
        observer.disconnect();
        repaint.current = null;
      };
    }

    const onPointerMove = (event: PointerEvent) => {
      // First sighting: land the follower on the cursor rather than flying it
      // in from whatever corner the page started at.
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

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerout', onPointerOut, { passive: true });

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      // Clamped: a backgrounded tab resumes with a multi-second gap, and
      // integrating that in one step would fire every node into a wall.
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
      repaint.current = null;
    };
  }, [reduced]);

  // A theme change is a colour swap, not a rebuild. The frozen web needs the
  // repaint; the animated one would have picked it up on the next frame anyway.
  useEffect(() => {
    skin.current = { rgb: toRgb(primaryColor), tone };
    repaint.current?.();
  }, [primaryColor, tone]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
});
