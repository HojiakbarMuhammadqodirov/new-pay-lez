import { memo, useEffect, useRef } from 'react';
import { useReducedMotion } from '../../components/GlobeHero/hooks/useReducedMotion';
import type { GlobeTone } from '../theme/context';
import { ARCADE } from './config';

/**
 * The L-Earn page's backdrop: Squawk's Flight, played endlessly behind the
 * copy. Gate columns drift right to left, a flyer threads the gaps on
 * autopilot leaving a trail, and clearing a gate rings a score pulse — which
 * is the page's whole pitch (play, and every gap pays) drawn as a picture.
 *
 * Move the cursor and the autopilot hands over: the flyer chases the cursor's
 * height instead of the next gap, so the backdrop is *playable* in the
 * smallest possible way. It never dies — there are no collisions, because a
 * backdrop that punished the reader for resting their hand would be a game
 * demanding attention the page needs elsewhere.
 *
 * Canvas 2D, one context, nothing through React state — the same construction
 * as `NetworkWeb`, and for the same reasons; see the header there. The scene
 * is pre-simulated for a few seconds before first paint so the page never
 * shows an empty sky with no trail, and that same pre-roll is what the
 * reduced-motion still frame is made of.
 */

interface Gate {
  x: number;
  /** Centre of the opening. */
  gapY: number;
  /** Whether the flyer has already passed this gate (and pulsed). */
  cleared: boolean;
}

interface Pulse {
  x: number;
  y: number;
  age: number;
}

/** One tone's alpha budget. Structural, so both entries in `ARCADE.tone` fit. */
interface TonePalette {
  gate: number;
  trail: number;
  dot: number;
  pulse: number;
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

interface ArcadeTrailProps {
  primaryColor: string;
  /** `'ink'` on a light page: see the `tone` block in `config.ts`. */
  tone: GlobeTone;
  className?: string;
}

export const ArcadeTrail = memo(function ArcadeTrail({
  primaryColor,
  tone,
  className,
}: ArcadeTrailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  // Colour is read inside the loop rather than closed over, so a theme change
  // repaints the scene in flight instead of tearing it down mid-glide.
  const skin = useRef({ rgb: toRgb(primaryColor), tone });
  const repaint = useRef<(() => void) | null>(null);

  useEffect(() => {
    const host = canvasRef.current;
    if (!host) return;
    const ctx = host.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;

    const gates: Gate[] = [];
    const pulses: Pulse[] = [];
    /** The flown line, oldest first. Points scroll left with the world. */
    const trail: Array<{ x: number; y: number }> = [];

    const flyer = { y: 0, targetY: 0 };
    let clock = 0;

    /** Cursor steering: `y` is where the cursor is, `strength` fades 0..1. */
    const pointer = { y: 0, strength: 0, target: 0 };

    const gapHalf = () => Math.min(ARCADE.gates.gap, height * 0.5) / 2;

    const randomGapY = () => {
      const margin = height * ARCADE.gates.margin + gapHalf();
      return margin + Math.random() * Math.max(height - margin * 2, 1);
    };

    /** Keeps the runway populated: always a gate coming, never one long gone. */
    const topUpGates = () => {
      while (gates.length > 0 && gates[0].x < -ARCADE.gates.lip) gates.shift();
      const lastX = gates.length > 0 ? gates[gates.length - 1].x : width * 0.55;
      for (let x = lastX + ARCADE.gates.spacing; x < width + ARCADE.gates.spacing; ) {
        gates.push({ x, gapY: randomGapY(), cleared: false });
        x += ARCADE.gates.spacing;
      }
      if (gates.length === 0) {
        gates.push({ x: width * 0.55, gapY: randomGapY(), cleared: false });
        topUpGates();
      }
    };

    const resize = () => {
      const rect = host.getBoundingClientRect();
      width = Math.max(rect.width, 1);
      height = Math.max(rect.height, 1);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      host.width = Math.round(width * dpr);
      host.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // A resize clamps rather than re-deals: the gates keep their order and
      // the flyer keeps its height, so rotating a phone does not restart the
      // flight.
      for (const gate of gates) gate.gapY = Math.min(gate.gapY, height - gapHalf());
      flyer.y = Math.min(flyer.y, height);
      topUpGates();
    };

    /* ── simulation ─────────────────────────────────────────────────────── */

    const flyerX = () => width * ARCADE.flyer.x;

    const step = (dt: number) => {
      clock += dt;

      for (const gate of gates) gate.x -= ARCADE.scroll * dt;
      for (const point of trail) point.x -= ARCADE.scroll * dt;
      while (trail.length > 0 && trail[0].x < flyerX() - ARCADE.trail.length) {
        trail.shift();
      }

      // The pointer hand-over fades rather than switches; mid-fade the flyer
      // aims at a blend of the two targets, which is what makes the bank.
      const gap = pointer.target - pointer.strength;
      pointer.strength += Math.sign(gap) * Math.min(Math.abs(gap), ARCADE.pointer.fade * dt);

      const next = gates.find((gate) => gate.x >= flyerX());
      const autoTarget = next ? next.gapY : height / 2;
      const steered =
        autoTarget + (pointer.y - autoTarget) * pointer.strength;
      flyer.targetY = Math.min(Math.max(steered, 8), height - 8);

      // Exponential chase, framerate-independent — the standard closed form
      // rather than `* dt` on the fraction, which overshoots at low fps.
      const ease = 1 - Math.exp(-ARCADE.flyer.chase * dt);
      flyer.y += (flyer.targetY - flyer.y) * ease;

      const bob =
        Math.sin(clock * Math.PI * 2 * ARCADE.flyer.bob.hz) * ARCADE.flyer.bob.amplitude;

      trail.push({ x: flyerX(), y: flyer.y + bob });

      for (const gate of gates) {
        if (!gate.cleared && gate.x < flyerX()) {
          gate.cleared = true;
          pulses.push({ x: gate.x, y: gate.gapY, age: 0 });
        }
      }

      for (const pulse of pulses) pulse.age += dt;
      while (pulses.length > 0 && pulses[0].age > ARCADE.pulse.life) pulses.shift();

      topUpGates();
    };

    /* ── drawing ────────────────────────────────────────────────────────── */

    const draw = () => {
      const palette: TonePalette = ARCADE.tone[skin.current.tone];
      const colour = `rgb(${skin.current.rgb})`;

      ctx.clearRect(0, 0, width, height);
      // Additive on the dark page so the dot burns over its own trail; plain
      // over on paper, where there is no headroom to add into.
      ctx.globalCompositeOperation =
        skin.current.tone === 'glow' ? 'lighter' : 'source-over';
      ctx.strokeStyle = colour;
      ctx.fillStyle = colour;
      ctx.lineCap = 'round';

      // Gates: a pillar above the gap and one below, each with a lip — the
      // short horizontal stroke that makes a line read as a pipe mouth.
      ctx.globalAlpha = palette.gate;
      ctx.lineWidth = 2;
      const half = gapHalf();
      for (const gate of gates) {
        const top = gate.gapY - half;
        const bottom = gate.gapY + half;
        ctx.beginPath();
        ctx.moveTo(gate.x, 0);
        ctx.lineTo(gate.x, top);
        ctx.moveTo(gate.x - ARCADE.gates.lip / 2, top);
        ctx.lineTo(gate.x + ARCADE.gates.lip / 2, top);
        ctx.moveTo(gate.x, bottom);
        ctx.lineTo(gate.x, height);
        ctx.moveTo(gate.x - ARCADE.gates.lip / 2, bottom);
        ctx.lineTo(gate.x + ARCADE.gates.lip / 2, bottom);
        ctx.stroke();
      }

      /*
       * The trail, in a handful of segments rather than one path: alpha is per
       * stroke, and the fade toward the tail is what says "this has been
       * flown" rather than "there is a wire here". Eight buckets are plenty —
       * the eye reads the ramp, not the seams.
       */
      const buckets = 8;
      if (trail.length > buckets) {
        const per = Math.ceil(trail.length / buckets);
        for (let b = 0; b < buckets; b++) {
          const start = b * per;
          const end = Math.min(start + per + 1, trail.length);
          if (end - start < 2) continue;
          ctx.globalAlpha = palette.trail * ((b + 1) / buckets);
          ctx.lineWidth = ARCADE.trail.width * (0.4 + (0.6 * (b + 1)) / buckets);
          ctx.beginPath();
          ctx.moveTo(trail[start].x, trail[start].y);
          for (let i = start + 1; i < end; i++) ctx.lineTo(trail[i].x, trail[i].y);
          ctx.stroke();
        }
      }

      // Score pulses: a ring growing out of a cleared gate, fading as it goes.
      ctx.lineWidth = 1.5;
      for (const pulse of pulses) {
        const t = pulse.age / ARCADE.pulse.life;
        ctx.globalAlpha = palette.pulse * (1 - t) * (1 - t);
        ctx.beginPath();
        ctx.arc(
          pulse.x,
          pulse.y,
          ARCADE.pulse.from + (ARCADE.pulse.to - ARCADE.pulse.from) * t,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }

      // The flyer: a halo disc under a solid dot, same two-disc stand-in for a
      // gradient the node web uses.
      const head = trail[trail.length - 1];
      if (head) {
        ctx.globalAlpha = palette.dot * 0.25;
        ctx.beginPath();
        ctx.arc(head.x, head.y, ARCADE.flyer.radius * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = palette.dot;
        ctx.beginPath();
        ctx.arc(head.x, head.y, ARCADE.flyer.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    /* ── loop ───────────────────────────────────────────────────────────── */

    repaint.current = draw;

    resize();
    flyer.y = gates[0]?.gapY ?? height / 2;

    // Pre-roll: a few seconds of flight before anyone sees it, so the first
    // paint already has a trail and a cleared gate behind the flyer. This is
    // also the whole of the reduced-motion scene.
    for (let i = 0; i < 600; i++) step(1 / 60);
    pulses.length = 0;

    const observer = new ResizeObserver(() => {
      resize();
      if (reduced) repaint.current?.();
    });
    observer.observe(host);

    if (reduced) {
      draw();
      return () => {
        observer.disconnect();
        repaint.current = null;
      };
    }

    const onPointerMove = (event: PointerEvent) => {
      pointer.y = event.clientY;
      pointer.target = 1;
    };
    const onPointerOut = (event: PointerEvent) => {
      // Null only when the pointer leaves the window, not an element.
      if (!event.relatedTarget) pointer.target = 0;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerout', onPointerOut, { passive: true });

    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      // Clamped: a backgrounded tab resumes with a multi-second gap, and one
      // giant step would drag the whole gate field off the left edge.
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

  // A theme change is a colour swap, not a rebuild — the frozen frame needs
  // the repaint, the animated one would catch it next frame anyway.
  useEffect(() => {
    skin.current = { rgb: toRgb(primaryColor), tone };
    repaint.current?.();
  }, [primaryColor, tone]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
});
