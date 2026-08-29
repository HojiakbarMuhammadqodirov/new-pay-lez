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
 * And it can be torn. A stub carries a perforation, the page is about
 * redeeming vouchers, and tearing one is what the object is *for* — so a click
 * splits the ticket along its own tear line and the two halves come apart,
 * tumble, and go. Every other backdrop in `src/site/` answers the pointer with
 * a brightness; this one answers with the gesture the picture is already
 * about.
 *
 * Canvas 2D, one context, nothing through React state — the same construction
 * as `NetworkWeb` and `MarketTape`, for the reasons in the header there. The
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

/**
 * One half of a torn ticket.
 *
 * Pooled and recycled rather than allocated per tear, for the reason the
 * market tape's rings are: a handful of short-lived objects a second is
 * exactly the shape that lands a GC pause in the middle of a scroll. `edge` is
 * allocated once with the pool and overwritten, so a tear costs no memory at
 * all.
 */
interface Half {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  /** This piece's own width, and the parent ticket's height. */
  w: number;
  h: number;
  /** -1 for the long piece (notch on its left), +1 for the stub end. */
  side: number;
  /** The torn edge, as `teeth + 1` offsets along the parent's x axis. */
  edge: number[];
  /** Seconds since the tear. `age < 0` marks a free slot. */
  age: number;
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
 * A tap that starts inside one of these belongs to the page, not the backdrop.
 *
 * The canvas is `pointer-events: none` and stays that way — see the note on
 * the listeners below — so nothing here *consumes* a click. This list is the
 * other half of that bargain: the backdrop hears every tap on the document and
 * declines the ones that were aimed at something.
 */
const CONTROLS =
  'a, button, input, select, textarea, label, summary, [role="button"], [role="tab"], [contenteditable]';

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

    const torn = STUBS.torn;
    const TAU = Math.PI * 2;

    const stubs: Stub[] = [];
    const halves: Half[] = Array.from({ length: torn.maxHalves }, () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      angle: 0,
      spin: 0,
      w: 0,
      h: 0,
      side: 1,
      edge: new Array<number>(torn.teeth + 1).fill(0),
      age: -1,
    }));
    /** The tear profile, cut once and handed to both halves. */
    const profile = new Array<number>(torn.teeth + 1).fill(0);

    let width = 0;
    let height = 0;
    let clock = 0;

    const pointer = { x: -9999, y: -9999, strength: 0, target: 0 };
    /**
     * A tap waiting to be spent, in client coordinates. The handler writes;
     * the loop reads and clears — the same arrangement the market tape uses
     * for the cursor, and the reason no part of this touches React state.
     */
    const tap = { x: 0, y: 0, pending: false };

    const between = (min: number, max: number) => min + Math.random() * (max - min);

    /**
     * Re-deals a stub. `y === null` starts it just above the top edge, which
     * is where a replacement has to come from.
     */
    const deal = (stub: Stub, y: number | null) => {
      stub.x = Math.random() * width;
      stub.w = between(STUBS.size.min, STUBS.size.max);
      stub.y = y ?? -stub.w;
      stub.fall = between(STUBS.fall.min, STUBS.fall.max);
      stub.phase = Math.random() * TAU;
      stub.amplitude = between(STUBS.sway.amplitude.min, STUBS.sway.amplitude.max);
      stub.hz = between(STUBS.sway.hz.min, STUBS.sway.hz.max);
      stub.angle = Math.random() * TAU;
      stub.spin = between(-STUBS.spin, STUBS.spin);
      stub.heat = 0;
    };

    const makeStub = (y: number): Stub => {
      const stub: Stub = {
        x: 0,
        y: 0,
        w: 0,
        fall: 0,
        phase: 0,
        amplitude: 0,
        hz: 0,
        angle: 0,
        spin: 0,
        heat: 0,
      };
      deal(stub, y);
      return stub;
    };

    /** Grows or trims the fall to `count`, keeping the stubs already in it. */
    const seed = (count: number) => {
      while (stubs.length > count) stubs.pop();
      while (stubs.length < count) stubs.push(makeStub(Math.random() * height));
    };

    /**
     * The stub's sideways offset this instant. One definition, read by the hit
     * test, the highlight and the draw — a hit test that disagreed with the
     * frame it is testing against is a ticket that dodges the cursor.
     */
    const swayOf = (stub: Stub) =>
      Math.sin(stub.phase + clock * TAU * stub.hz) * stub.amplitude;

    /** And its rate of change, which is momentum a torn half inherits. */
    const swaySpeed = (stub: Stub) =>
      Math.cos(stub.phase + clock * TAU * stub.hz) * stub.amplitude * TAU * stub.hz;

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

    /* ── hit test ───────────────────────────────────────────────────────── */

    /**
     * The topmost stub under a point, or -1.
     *
     * Backwards through the array, because drawing order *is* array order and
     * the last one drawn is the one you can see. The test itself is a rotate
     * into the ticket's own frame and two compares against a padded
     * rectangle — no path building, no `isPointInPath`, nothing that needs the
     * context or the DOM — so running it every frame for the highlight costs
     * about what the highlight already did.
     */
    const stubAt = (px: number, py: number) => {
      for (let i = stubs.length - 1; i >= 0; i--) {
        const stub = stubs[i];
        const dx = px - (stub.x + swayOf(stub));
        const dy = py - stub.y;
        const cos = Math.cos(stub.angle);
        const sin = Math.sin(stub.angle);
        const lx = dx * cos + dy * sin;
        const ly = dy * cos - dx * sin;
        const h = stub.w * STUBS.aspect;
        if (
          Math.abs(lx) <= stub.w / 2 + torn.hitPad &&
          Math.abs(ly) <= h / 2 + torn.hitPad
        ) {
          return i;
        }
      }
      return -1;
    };

    /* ── tearing ────────────────────────────────────────────────────────── */

    /** Takes a free slot, or the oldest half if the pool is full. */
    const freeHalf = () => {
      let slot = 0;
      let oldest = -1;
      for (let i = 0; i < halves.length; i++) {
        if (halves[i].age < 0) return halves[i];
        if (halves[i].age > oldest) {
          oldest = halves[i].age;
          slot = i;
        }
      }
      return halves[slot];
    };

    /**
     * Splits one stub along its perforation and re-deals it above the top.
     *
     * The two pieces are the ticket's real geometry, not two rectangles: the
     * long piece keeps the left notch and the stub end keeps the right one, so
     * what comes apart is recognisably what was there. They are pushed apart
     * along the ticket's **own** long axis rather than along the screen's, and
     * they carry the fall and the sway they already had — a tear that ignored
     * the ticket's rotation reads as two pieces sliding sideways under a
     * tilted outline.
     */
    const tearStub = (index: number) => {
      const stub = stubs[index];
      const h = stub.w * STUBS.aspect;
      const tearX = stub.w / 2 - stub.w * STUBS.tear;

      // One profile, two sides: the halves would still fit back together. See
      // the note on `torn.teeth`.
      const reach = h * torn.ragged;
      for (let i = 0; i <= torn.teeth; i++) profile[i] = between(-reach, reach);

      const cos = Math.cos(stub.angle);
      const sin = Math.sin(stub.angle);
      const originX = stub.x + swayOf(stub);
      const carryX = swaySpeed(stub);
      const spin = between(torn.spin.min, torn.spin.max);

      for (let s = 0; s < 2; s++) {
        // -1 is the long piece, +1 the stub end.
        const side = s === 0 ? -1 : 1;
        const from = side < 0 ? -stub.w / 2 : tearX;
        const to = side < 0 ? tearX : stub.w / 2;
        const centre = (from + to) / 2;
        const push = between(torn.impulse.min, torn.impulse.max);

        const piece = freeHalf();
        piece.w = to - from;
        piece.h = h;
        piece.side = side;
        for (let i = 0; i <= torn.teeth; i++) piece.edge[i] = profile[i];
        // Both halves live in a pure translation of the parent's frame, so an
        // offset measured along the parent's x axis means the same thing in
        // either — which is what lets one profile cut both.
        piece.x = originX + cos * centre;
        piece.y = stub.y + sin * centre;
        piece.vx = cos * side * push + carryX;
        piece.vy = sin * side * push + stub.fall + between(torn.lift.min, torn.lift.max);
        piece.angle = stub.angle;
        // Opposite signs: one tear spun them, and it spun them apart.
        piece.spin = spin * side;
        piece.age = 0;
      }

      // Replaced immediately, above the top edge. The field is a density and
      // has to stay one — a page you can empty by clicking rewards clicking
      // with nothing.
      deal(stub, null);
    };

    /* ── simulation ─────────────────────────────────────────────────────── */

    const step = (dt: number) => {
      clock += dt;

      // The tap is spent here rather than in the handler, so the geometry it
      // is tested against is the geometry the next frame draws.
      if (tap.pending) {
        tap.pending = false;
        const index = stubAt(tap.x, tap.y);
        if (index >= 0) tearStub(index);
      }

      for (const stub of stubs) {
        stub.y += stub.fall * dt;
        stub.angle += stub.spin * dt;

        // Off the bottom → back in above the top, re-dealt sideways. The
        // margin is the stub's own size so it never pops into view mid-shape.
        if (stub.y > height + stub.w) {
          stub.x = Math.random() * width;
          stub.y = -stub.w;
          stub.phase = Math.random() * TAU;
        }
      }

      // Exponential drag, so the separation is all in the first quarter of a
      // second and the rest of the life is a drift. A linear decay reads as a
      // machine slowing down.
      const decay = Math.exp(-torn.drag * dt);
      for (const piece of halves) {
        if (piece.age < 0) continue;
        piece.age += dt;
        if (piece.age >= torn.life) {
          piece.age = -1;
          continue;
        }
        piece.vx *= decay;
        piece.vy = piece.vy * decay + torn.gravity * dt;
        piece.x += piece.vx * dt;
        piece.y += piece.vy * dt;
        piece.angle += piece.spin * dt;
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
        const distance = Math.hypot(stub.x + swayOf(stub) - pointer.x, stub.y - pointer.y);
        const falloff =
          distance >= STUBS.pointer.radius ? 0 : 1 - distance / STUBS.pointer.radius;
        stub.heat = falloff * falloff * pointer.strength;
      }

      // The one under the cursor is lifted clear of the ones merely near it.
      // A backdrop cannot set a cursor — it is `pointer-events: none` — so the
      // only affordance available to it is the ink it is already spending, and
      // without it the gesture is undiscoverable.
      if (pointer.strength > 0) {
        const index = stubAt(pointer.x, pointer.y);
        if (index >= 0) stubs[index].heat *= torn.hover;
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

    /**
     * The ragged side of a half, on its own — it is stroked twice, once as
     * part of the outline and once as the flash.
     */
    const tornEdge = (piece: Half) => {
      const tx = (-piece.side * piece.w) / 2;
      const stepY = piece.h / torn.teeth;
      ctx.beginPath();
      ctx.moveTo(tx + piece.edge[0], -piece.h / 2);
      for (let i = 1; i <= torn.teeth; i++) {
        ctx.lineTo(tx + piece.edge[i], -piece.h / 2 + i * stepY);
      }
      ctx.stroke();
    };

    /**
     * One half, centred on the origin: three straight edges, the notch it
     * inherited from whichever end of the ticket it came off, and the torn
     * one. The notch is what says which piece this is; without it a half is a
     * scrap of paper rather than most of a voucher.
     */
    const outline = (piece: Half) => {
      const { w, h, side, edge } = piece;
      const nx = (side * w) / 2;
      const tx = (-side * w) / 2;
      const r = h * STUBS.notch;
      const stepY = h / torn.teeth;

      ctx.beginPath();
      ctx.moveTo(nx, -h / 2);
      ctx.lineTo(tx + edge[0], -h / 2);
      for (let i = 1; i <= torn.teeth; i++) {
        ctx.lineTo(tx + edge[i], -h / 2 + i * stepY);
      }
      ctx.lineTo(nx, h / 2);
      ctx.lineTo(nx, r);
      // Bulging inward whichever end it is: the sweep has to run through
      // angle 0 for a left notch and through PI for a right one, which is one
      // flag rather than two paths.
      ctx.arc(nx, 0, r, Math.PI / 2, -Math.PI / 2, side < 0);
      ctx.closePath();
      ctx.stroke();
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
        ctx.save();
        ctx.translate(stub.x + swayOf(stub), stub.y);
        ctx.rotate(stub.angle);
        ctx.globalAlpha = Math.min(palette.line * (1 + palette.boost * stub.heat), 1);
        ticket(stub.w);
        ctx.restore();
      }

      // Halves last: they are the thing that just happened, and the only part
      // of this backdrop a visitor caused.
      for (const piece of halves) {
        if (piece.age < 0) continue;
        const left = 1 - piece.age / torn.life;

        ctx.save();
        ctx.translate(piece.x, piece.y);
        ctx.rotate(piece.angle);

        // Brighter than the fall it came out of, fading to nothing over its
        // life — the boost decays with the same `left` the fade does, so a
        // half is never brighter than the stub the pointer was holding.
        ctx.globalAlpha = Math.min(palette.line * left * (1 + palette.boost * left), 1);
        outline(piece);

        // The fresh fibres, for a fifth of a second. This is the accent at
        // alpha over the ground: a tear has no colour of its own to spend.
        const flash = 1 - piece.age / torn.flash.life;
        if (flash > 0) {
          ctx.globalAlpha = Math.min(palette.line * torn.flash.boost * flash, 1);
          tornEdge(piece);
        }

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

    // Reduced motion: the fall is dealt once and holds still — no loop, no
    // pointer highlight, and no tear, all three of which are motion. The
    // listeners live inside the branch below, so a click here is not ignored,
    // it is never heard: there is nothing to animate a tear with.
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

    /**
     * The gesture in progress, so a tap can be told from a scroll.
     *
     * Every listener here is passive and on the window, and the canvas keeps
     * `pointer-events: none`: the backdrop sits *under* the page and must not
     * take a click off anything, so it never calls `preventDefault` and never
     * receives an event of its own. That leaves it hearing every tap on the
     * document, which is why a tap has to be qualified three ways — primary
     * button, no travel (a drag on a desktop is a selection, on a phone it is
     * a scroll), and not aimed at a control. A stub read through the glass of
     * a card is still a stub, so the guard is a list of controls rather than
     * "is anything on top of it".
     */
    const gesture = { id: -1, x: 0, y: 0, at: 0 };

    const onPointerDown = (event: PointerEvent) => {
      gesture.id = event.pointerId;
      gesture.x = event.clientX;
      gesture.y = event.clientY;
      gesture.at = event.timeStamp;
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== gesture.id) return;
      gesture.id = -1;

      if (event.button !== 0) return;
      if (event.timeStamp - gesture.at > STUBS.tap.holdMs) return;
      if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > STUBS.tap.slop) {
        return;
      }

      const target = event.target;
      if (target instanceof Element && target.closest(CONTROLS)) return;
      // A click that ends a selection is a reader finishing a drag across
      // copy, not asking for anything.
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;

      tap.x = event.clientX;
      tap.y = event.clientY;
      tap.pending = true;
    };

    const onPointerCancel = () => {
      gesture.id = -1;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerout', onPointerOut, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerCancel, { passive: true });

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
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      repaint.current = null;
    };
  }, [reduced]);

  useEffect(() => {
    skin.current = { rgb: toRgb(primaryColor), tone };
    repaint.current?.();
  }, [primaryColor, tone]);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
});
