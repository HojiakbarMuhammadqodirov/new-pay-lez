import { memo, useEffect, useRef } from 'react';
import { useReducedMotion } from '../../components/GlobeHero/hooks/useReducedMotion';
import type { GlobeTone } from '../theme/context';
import { STUBS } from './config';

/**
 * The Vouchers page's backdrop: ticket stubs — notched sides, dashed tear
 * line — drifting slowly down the page and swaying as they go, brightening
 * under the pointer. The page sells a thing you tear off and hand over; the
 * backdrop is a slow fall of exactly that thing.
 *
 * Canvas 2D, one context, nothing through React state — the same construction
 * as `NetworkWeb` and `ArcadeTrail`, for the reasons in the header there. The
 * one wrinkle of its own: each stub is drawn through a save/translate/rotate,
 * which is fine at this population (a couple of dozen) and would not be at the
 * node web's hundred and a half.
 */

interface Stub {
  x: number;
  y: number;
  /** Ticket width; height is `width * STUBS.aspect`. */
  w: number;
  /** Sink rate, CSS px/s. */
  fall: number;
  /** Sway phase, amplitude and frequency — x oscillates around `x`. */
  phase: number;
  amplitude: number;
  hz: number;
  /** Base angle and spin, radians and rad/s. */
  angle: number;
  spin: number;
  /** Pointer proximity, 0..1, recomputed each frame. */
  heat: number;
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

interface StubDriftProps {
  primaryColor: string;
  /** `'ink'` on a light page: see the `tone` block in `config.ts`. */
  tone: GlobeTone;
  className?: string;
}

export const StubDrift = memo(function StubDrift({
  primaryColor,
  tone,
  className,
}: StubDriftProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  const skin = useRef({ rgb: toRgb(primaryColor), tone });
  const repaint = useRef<(() => void) | null>(null);

  useEffect(() => {
    const host = canvasRef.current;
    if (!host) return;
    const ctx = host.getContext('2d');
    if (!ctx) return;

    const stubs: Stub[] = [];
    let width = 0;
    let height = 0;
    let clock = 0;

    const pointer = { x: -9999, y: -9999, strength: 0, target: 0 };

    const between = (min: number, max: number) => min + Math.random() * (max - min);

    const makeStub = (y: number): Stub => ({
      x: Math.random() * width,
      y,
      w: between(STUBS.size.min, STUBS.size.max),
      fall: between(STUBS.fall.min, STUBS.fall.max),
      phase: Math.random() * Math.PI * 2,
      amplitude: between(STUBS.sway.amplitude.min, STUBS.sway.amplitude.max),
      hz: between(STUBS.sway.hz.min, STUBS.sway.hz.max),
      angle: Math.random() * Math.PI * 2,
      spin: between(-STUBS.spin, STUBS.spin),
      heat: 0,
    });

    /** Grows or trims the fall to `count`, keeping the stubs already in it. */
    const seed = (count: number) => {
      while (stubs.length > count) stubs.pop();
      while (stubs.length < count) stubs.push(makeStub(Math.random() * height));
    };

    const resize = () => {
      const rect = host.getBoundingClientRect();
      width = Math.max(rect.width, 1);
      height = Math.max(rect.height, 1);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      host.width = Math.round(width * dpr);
      host.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Stubs survive a resize; a rotated phone should not re-deal the fall.
      for (const stub of stubs) {
        stub.x = Math.min(stub.x, width);
        stub.y = Math.min(stub.y, height + stub.w);
      }

      const target = Math.round((width * height) / STUBS.areaPerStub);
      seed(Math.max(STUBS.minStubs, Math.min(STUBS.maxStubs, target)));
    };

    /* ── simulation ─────────────────────────────────────────────────────── */

    const step = (dt: number) => {
      clock += dt;

      for (const stub of stubs) {
        stub.y += stub.fall * dt;
        stub.angle += stub.spin * dt;

        // Off the bottom → back in above the top, re-dealt sideways. The
        // margin is the stub's own size so it never pops into view mid-shape.
        if (stub.y > height + stub.w) {
          stub.x = Math.random() * width;
          stub.y = -stub.w;
          stub.phase = Math.random() * Math.PI * 2;
        }
      }

      const gap = pointer.target - pointer.strength;
      pointer.strength += Math.sign(gap) * Math.min(Math.abs(gap), STUBS.pointer.fade * dt);
    };

    const measureHeat = () => {
      for (const stub of stubs) {
        if (pointer.strength <= 0) {
          stub.heat = 0;
          continue;
        }
        const sway = Math.sin(stub.phase + clock * Math.PI * 2 * stub.hz) * stub.amplitude;
        const distance = Math.hypot(stub.x + sway - pointer.x, stub.y - pointer.y);
        const falloff =
          distance >= STUBS.pointer.radius ? 0 : 1 - distance / STUBS.pointer.radius;
        stub.heat = falloff * falloff * pointer.strength;
      }
    };

    /* ── drawing ────────────────────────────────────────────────────────── */

    /**
     * One ticket, centred on the origin: a rectangle whose left and right
     * edges each carry an inward semicircular notch, plus the dashed tear
     * line. Drawn as an outline only — a filled ticket would be a solid slab
     * of accent behind somebody's paragraph.
     */
    const ticket = (w: number) => {
      const h = w * STUBS.aspect;
      const r = h * STUBS.notch;

      ctx.beginPath();
      ctx.moveTo(-w / 2, -h / 2);
      ctx.lineTo(w / 2, -h / 2);
      ctx.lineTo(w / 2, -r);
      // Inward bulges: counterclockwise sweeps whose midpoints sit inside the
      // rectangle, which is what makes the edge read as torn around a rivet.
      ctx.arc(w / 2, 0, r, -Math.PI / 2, Math.PI / 2, true);
      ctx.lineTo(w / 2, h / 2);
      ctx.lineTo(-w / 2, h / 2);
      ctx.lineTo(-w / 2, r);
      ctx.arc(-w / 2, 0, r, Math.PI / 2, -Math.PI / 2, true);
      ctx.closePath();
      ctx.stroke();

      const tearX = w / 2 - w * STUBS.tear;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(tearX, -h / 2 + 2);
      ctx.lineTo(tearX, h / 2 - 2);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const draw = () => {
      const palette = STUBS.tone[skin.current.tone];

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation =
        skin.current.tone === 'glow' ? 'lighter' : 'source-over';
      ctx.strokeStyle = `rgb(${skin.current.rgb})`;
      ctx.lineWidth = 1.2;
      ctx.lineJoin = 'round';

      for (const stub of stubs) {
        const sway = Math.sin(stub.phase + clock * Math.PI * 2 * stub.hz) * stub.amplitude;

        ctx.save();
        ctx.translate(stub.x + sway, stub.y);
        ctx.rotate(stub.angle);
        ctx.globalAlpha = Math.min(palette.line * (1 + palette.boost * stub.heat), 1);
        ticket(stub.w);
        ctx.restore();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    /* ── loop ───────────────────────────────────────────────────────────── */

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

    // Reduced motion: the fall is dealt once and holds still — no loop and no
    // pointer highlight, which is motion too.
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
      pointer.target = 1;
    };
    const onPointerOut = (event: PointerEvent) => {
      if (!event.relatedTarget) pointer.target = 0;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerout', onPointerOut, { passive: true });

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
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

  useEffect(() => {
    skin.current = { rgb: toRgb(primaryColor), tone };
    repaint.current?.();
  }, [primaryColor, tone]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
});
