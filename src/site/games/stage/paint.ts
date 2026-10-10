/**
 * The five sets a round is played in front of, as `Diorama` painters.
 *
 * Each set is a **still** — gradients, silhouettes, everything that does not
 * move, painted once per size and theme — and a **live** layer of the few things
 * that do: bunting swaying, a globe turning, a plane flying its route, gears,
 * a skyline's windows, the spotlight answering a verdict. `diorama.tsx` owns the
 * canvas, the half-rate loop, the off-screen pause and reduced motion; this
 * file only draws. Nothing in it reads React state: the verdict and the mood
 * arrive through refs (`StageHooks`) that the painter reads when it paints.
 *
 * Flat vector in Pico's own manner — rounded shapes, a darker underside, a
 * soft highlight, small glints, no outlines — with depth from three silhouette
 * values rather than from detail. Colours come from `STAGE_PALETTE` and only
 * from there (see `config.ts` for why a set may carry hues at all).
 *
 * Coordinates are CSS pixels of the round's card. Every set is composed around
 * the same two facts about the card's layout: the host (Pico) and the question
 * sit in the upper half, and the options cover the lower half with glass — so
 * the set's horizon is a little above the middle, its landmarks rise behind
 * the host band, and its ground runs on under the options where only a hint of
 * it shows.
 */
import type { DioramaPainter } from '../diorama';
import { STAGE_ALPHA, STAGE_REACT, type ScenePalette, type StageMotif } from './config';

export interface StageLook {
  pal: ScenePalette;
  tone: 'glow' | 'ink';
}

/** The last verdict, for the set to answer: kind and when (`performance.now()`). */
export interface StageCue {
  kind: 'none' | 'right' | 'wrong';
  at: number;
}

/** Pico's face on the result card, which the set lights to match. */
export type StageMood = 'party' | 'happy' | 'idle' | 'sad';

export interface StageHooks {
  /**
   * Where the host stands, in the set's pixels: the centre of Pico's box and
   * its side. Measured when the still is painted (on mount and on resize), so
   * the spotlight and the podium sit under the bird the layout actually placed.
   * `fresh` asks for a new measurement; without it the last one is returned,
   * which is what the live layer wants — a layout read thirty times a second
   * for a bird that has not moved is a layout read for nothing.
   */
  anchor: (fresh?: boolean) => { x: number; y: number; size: number } | null;
  cue?: { current: StageCue };
  mood?: { current: StageMood };
  /** The local quiz's country (`quizCountryFor`), for the city's skyline. */
  country?: string;
}

/**
 * Where `host` sits inside `root`, in the coordinates of a canvas laid at
 * `inset: 0` — the root's padding box, hence the border taken off.
 *
 * Rects rather than offsets because Pico's box may sit several positioned
 * ancestors deep; both rects move together under a translate, which is the only
 * transform a round's entrance uses (a scale would distort the difference).
 */
export function measureHost(root: HTMLElement | null, host: HTMLElement | null) {
  if (!root || !host) return null;
  const a = root.getBoundingClientRect();
  const b = host.getBoundingClientRect();
  if (!(b.width > 0)) return null;
  return {
    x: b.left - a.left - root.clientLeft + b.width / 2,
    y: b.top - a.top - root.clientTop + b.height / 2,
    size: Math.min(b.width, b.height),
  };
}

type Ctx = CanvasRenderingContext2D;
type Painter = DioramaPainter<StageLook>;

const TAU = Math.PI * 2;

/* ── colour and noise ───────────────────────────────────────────────────── */

const RGB = new Map<string, string>();

/** `#rrggbb` → `r, g, b`, memoised: the live layers ask for the same few every frame. */
function channels(hex: string): string {
  let hit = RGB.get(hex);
  if (!hit) {
    const n = parseInt(hex.slice(1), 16);
    hit = `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
    RGB.set(hex, hit);
  }
  return hit;
}

const rgba = (hex: string, a: number) => `rgba(${channels(hex)}, ${Math.max(0, Math.min(1, a))})`;

/** mulberry32 — seeded, so a still repaints identically on resize instead of reshuffling. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── shared pieces ──────────────────────────────────────────────────────── */

/** The sky, and the spotlight on the host. */
function backdrop(ctx: Ctx, w: number, h: number, look: StageLook, spot: { x: number; y: number }) {
  const { pal, tone } = look;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, pal.skyTop);
  sky.addColorStop(1, pal.skyLow);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  spotlight(ctx, w, h, spot, pal.accent, STAGE_ALPHA[tone].spot);
}

function spotlight(ctx: Ctx, w: number, h: number, at: { x: number; y: number }, hex: string, a: number) {
  const r = Math.max(w, h) * 0.55;
  const g = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, r);
  g.addColorStop(0, rgba(hex, a));
  g.addColorStop(0.45, rgba(hex, a * 0.35));
  g.addColorStop(1, rgba(hex, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Darkens the corners so the set sits *in* the card rather than being cut by it. */
function edges(ctx: Ctx, w: number, h: number, look: StageLook) {
  const a = STAGE_ALPHA[look.tone].edge;
  const g = ctx.createRadialGradient(w / 2, h * 0.42, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.78);
  g.addColorStop(0, rgba(look.pal.shade, 0));
  g.addColorStop(1, rgba(look.pal.shade, a));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** A cloud: four puffs on a flat base, `s` wide. */
function cloud(ctx: Ctx, x: number, y: number, s: number) {
  const r = s * 0.2;
  ctx.beginPath();
  const puff = (cx: number, cy: number, rr: number) => {
    ctx.moveTo(cx + rr, cy);
    ctx.arc(cx, cy, rr, 0, TAU);
  };
  puff(x - s * 0.3, y, r * 0.95);
  puff(x - s * 0.06, y - r * 0.6, r * 1.25);
  puff(x + s * 0.2, y - r * 0.25, r * 1.05);
  puff(x + s * 0.36, y + r * 0.1, r * 0.75);
  ctx.rect(x - s * 0.3, y, s * 0.66, r * 0.95);
  ctx.fill();
}

/** A four-point glint. */
function glint(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

/** Glints that come and go on their own phases; `pts` are fractions of the card. */
function twinkles(ctx: Ctx, w: number, h: number, t: number, look: StageLook, pts: readonly (readonly number[])[], scale = 1) {
  ctx.fillStyle = look.pal.spark;
  for (const [fx, fy, phase, size] of pts) {
    const k = Math.pow(Math.max(0, Math.sin(t * 1.3 + phase * TAU)), 6);
    if (k < 0.02) continue;
    ctx.globalAlpha = k * STAGE_ALPHA[look.tone].spark;
    glint(ctx, fx * w, fy * h, (2.5 + size * 4) * k * scale);
  }
  ctx.globalAlpha = 1;
}

/** Rolling ground from x 0 to w around `y`, filled to the bottom. */
function hills(ctx: Ctx, w: number, h: number, y: number, amp: number, seed: number) {
  const r = seeded(seed);
  const a1 = r() * TAU;
  const a2 = r() * TAU;
  const f1 = 1.4 + r() * 1.2;
  const f2 = 3.1 + r() * 1.5;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i <= 48; i++) {
    const x = (i / 48) * w;
    const u = (i / 48) * TAU;
    ctx.lineTo(x, y - amp * (0.6 * Math.sin(u * f1 * 0.5 + a1) + 0.4 * Math.sin(u * f2 * 0.5 + a2)));
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

/**
 * The verdict, answered by the set: a right answer brightens the spotlight and
 * throws sparks off the host; a wrong one dims the whole set for a beat.
 */
function react(ctx: Ctx, w: number, h: number, look: StageLook, hooks: StageHooks, host: { x: number; y: number; size: number }) {
  const cue = hooks.cue?.current;
  if (!cue || cue.kind === 'none') return;
  const age = performance.now() - cue.at;
  if (cue.kind === 'right') {
    if (age > STAGE_REACT.rightMs) return;
    const k = 1 - age / STAGE_REACT.rightMs;
    spotlight(ctx, w, h, host, look.pal.warm, 0.22 * k * (look.tone === 'glow' ? 1 : 1.3));
    const n = STAGE_REACT.sparks;
    const reach = host.size * (0.55 + (age / STAGE_REACT.rightMs) * 0.9);
    ctx.fillStyle = look.pal.warm;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + i * 0.37;
      const d = reach * (0.75 + ((i * 7) % 5) * 0.08);
      ctx.globalAlpha = k;
      glint(ctx, host.x + Math.cos(a) * d, host.y + Math.sin(a) * d * 0.8, (3 + (i % 3) * 1.6) * k);
    }
    ctx.globalAlpha = 1;
    return;
  }
  if (age > STAGE_REACT.wrongMs) return;
  const k = Math.sin(Math.PI * Math.min(1, age / STAGE_REACT.wrongMs));
  ctx.fillStyle = rgba(look.pal.shade, STAGE_REACT.wrongDim * k * (look.tone === 'glow' ? 1 : 0.6));
  ctx.fillRect(0, 0, w, h);
}

/** Where the host is when nothing has been measured — upper left, as the layout puts him. */
function hostOf(hooks: StageHooks, w: number, h: number, fresh = false) {
  return hooks.anchor(fresh) ?? { x: Math.min(w * 0.18, 150), y: h * 0.3, size: Math.min(118, w * 0.2) };
}

/* ── parade: Guess the Flag ─────────────────────────────────────────────── */

/** A string of pennants hung between two points with `sag`. */
function bunting(
  ctx: Ctx,
  look: StageLook,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  sag: number,
  size: number,
  t: number,
  alpha: number,
  offset: number,
) {
  const { pal, tone } = look;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2 + sag * 2;
  ctx.strokeStyle = rgba(pal.line, STAGE_ALPHA[tone].line * 2.4 * alpha);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.stroke();
  const n = Math.max(3, Math.floor(Math.hypot(x1 - x0, y1 - y0) / (size * 2.1)));
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const v = 1 - u;
    const px = v * v * x0 + 2 * v * u * cx + u * u * x1;
    const py = v * v * y0 + 2 * v * u * cy + u * u * y1;
    const dx = 2 * v * (cx - x0) + 2 * u * (x1 - cx);
    const dy = 2 * v * (cy - y0) + 2 * u * (y1 - cy);
    const sway = Math.sin(t * 1.7 + i * 0.8 + offset) * 0.1;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(dy, dx) + sway);
    ctx.globalAlpha = STAGE_ALPHA[tone].hue * alpha;
    ctx.fillStyle = pal.hues[(i + offset) % 4];
    ctx.beginPath();
    ctx.moveTo(-size / 2, 0);
    ctx.lineTo(size / 2, 0);
    ctx.lineTo(0, size * 1.2);
    ctx.closePath();
    ctx.fill();
    /* The far half in shade — the underside the art direction asks of every shape. */
    ctx.fillStyle = rgba(pal.shade, 0.22);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size / 2, 0);
    ctx.lineTo(0, size * 1.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/** A tricolour on a pole, waving: three stripes whose edges ride one travelling wave. */
function pennant(ctx: Ctx, look: StageLook, x: number, y: number, fw: number, fh: number, t: number, phase: number, stripes: readonly string[]) {
  const steps = 10;
  const at = (i: number) => Math.sin((i / steps) * 3.4 - t * 3.2 + phase) * fh * 0.13 * (i / steps);
  ctx.globalAlpha = STAGE_ALPHA[look.tone].hue;
  for (let k = 0; k < 3; k++) {
    const top = y + (fh * k) / 3;
    const low = y + (fh * (k + 1)) / 3;
    ctx.fillStyle = stripes[k];
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) ctx.lineTo(x + (fw * i) / steps, top + at(i));
    for (let i = steps; i >= 0; i--) ctx.lineTo(x + (fw * i) / steps, low + at(i));
    ctx.closePath();
    ctx.fill();
  }
  /* Folds: a shade on every trough of the wave. */
  ctx.fillStyle = rgba(look.pal.shade, 0.25);
  for (let i = 0; i < steps; i++) {
    const slope = at(i + 1) - at(i);
    if (slope <= 0) continue;
    ctx.globalAlpha = Math.min(1, slope / (fh * 0.04)) * 0.8;
    const x0 = x + (fw * i) / steps;
    ctx.beginPath();
    ctx.moveTo(x0, y + at(i));
    ctx.lineTo(x0 + fw / steps, y + at(i + 1));
    ctx.lineTo(x0 + fw / steps, y + fh + at(i + 1));
    ctx.lineTo(x0, y + fh + at(i));
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const PARADE_GLINTS = [
  [0.08, 0.3, 0.1, 0.6],
  [0.22, 0.16, 0.55, 0.2],
  [0.93, 0.22, 0.3, 0.8],
  [0.7, 0.32, 0.8, 0.3],
  [0.4, 0.42, 0.2, 0.4],
  [0.82, 0.48, 0.65, 0.5],
  [0.05, 0.55, 0.9, 0.2],
] as const;

/** City lights on the globe: longitude, latitude, in radians. */
const GLOBE_LIGHTS = [
  [0.3, 0.6], [1.1, 0.35], [1.9, 0.75], [2.6, -0.2], [3.3, 0.45], [4.1, 0.15], [4.8, -0.5], [5.5, 0.62], [0.9, -0.35], [2.2, 0.1],
] as const;

function parade(hooks: StageHooks): Painter {
  let globe = { x: 0, y: 0, r: 0 };
  let poles: { x: number; top: number; dir: 1 | -1 }[] = [];
  return {
    still(ctx, w, h, look) {
      const { pal, tone } = look;
      const a = STAGE_ALPHA[tone];
      const host = hostOf(hooks, w, h, true);
      backdrop(ctx, w, h, look, { x: host.x, y: host.y });
      const horizon = Math.max(host.y + host.size * 0.6, h * 0.5);

      ctx.fillStyle = pal.far;
      ctx.globalAlpha = a.far;
      hills(ctx, w, h, horizon, h * 0.03, 11);
      ctx.fillStyle = pal.mid;
      ctx.globalAlpha = a.mid;
      hills(ctx, w, h, horizon + h * 0.12, h * 0.025, 23);
      ctx.globalAlpha = 1;

      /*
       * The world, rising at the foot of the set: its cap shows under the
       * answers and around the way out, turning (the meridians are the live
       * layer's). Big on purpose — a globe you can see the curve of is the
       * subject; a small one is a ball.
       */
      const r = Math.min(Math.max(w * 0.42, 150), 300, h * 0.62);
      globe = { x: w / 2, y: h + r * 0.36, r };
      const sea = ctx.createLinearGradient(0, globe.y - r, 0, globe.y);
      sea.addColorStop(0, pal.near);
      sea.addColorStop(1, pal.mid);
      ctx.fillStyle = sea;
      ctx.globalAlpha = a.near;
      ctx.beginPath();
      ctx.arc(globe.x, globe.y, r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      const lit = ctx.createRadialGradient(globe.x - r * 0.35, globe.y - r * 0.7, r * 0.05, globe.x, globe.y, r);
      lit.addColorStop(0, rgba(pal.spark, tone === 'glow' ? 0.16 : 0.5));
      lit.addColorStop(0.5, rgba(pal.spark, 0));
      lit.addColorStop(1, rgba(pal.shade, tone === 'glow' ? 0.3 : 0.12));
      ctx.fillStyle = lit;
      ctx.beginPath();
      ctx.arc(globe.x, globe.y, r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba(pal.line, a.line * 1.8);
      ctx.lineWidth = 1;
      for (let k = 0; k <= 3; k++) {
        const lat = (k * Math.PI) / 8;
        const y = globe.y - Math.sin(lat) * r;
        const half = Math.cos(lat) * r;
        ctx.beginPath();
        ctx.ellipse(globe.x, y, half, half * 0.09, 0, Math.PI, TAU);
        ctx.stroke();
      }
      /* The lit limb, and a halo off it. */
      const halo = ctx.createRadialGradient(globe.x, globe.y, r * 0.96, globe.x, globe.y, r * 1.12);
      halo.addColorStop(0, rgba(pal.accent, tone === 'glow' ? 0.22 : 0.18));
      halo.addColorStop(1, rgba(pal.accent, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(0, globe.y - r * 1.2, w, r * 1.2);
      ctx.strokeStyle = rgba(pal.accent, tone === 'glow' ? 0.6 : 0.6);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(globe.x, globe.y, r - 1, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();

      /* Flagpoles in the two lower corners, flying toward the middle. */
      const pair = w > 640 ? 2 : 1;
      const inset = Math.min(w * 0.025, 20);
      const tall = Math.min(h * 0.36, 180);
      poles = [];
      for (let i = 0; i < pair; i++) {
        const top = h - tall * (1 - i * 0.22);
        poles.push({ x: inset + i * 26, top, dir: 1 }, { x: w - inset - i * 26, top, dir: -1 });
      }
      for (const p of poles) {
        const base = h - 6;
        const pole = ctx.createLinearGradient(p.x - 2, 0, p.x + 2, 0);
        pole.addColorStop(0, rgba(pal.spark, tone === 'glow' ? 0.6 : 0.95));
        pole.addColorStop(1, rgba(pal.line, tone === 'glow' ? 0.35 : 0.55));
        ctx.fillStyle = pole;
        ctx.fillRect(p.x - 1.5, p.top, 3, base - p.top);
        ctx.fillStyle = pal.warm;
        ctx.beginPath();
        ctx.arc(p.x, p.top - 3, 3.6, 0, TAU);
        ctx.fill();
      }
      edges(ctx, w, h, look);
    },
    live(ctx, w, h, t, look) {
      const { pal, tone } = look;
      const host = hostOf(hooks, w, h);

      /* Clouds, drifting high. */
      ctx.fillStyle = tone === 'glow' ? rgba(pal.far, 0.7) : rgba(pal.spark, 0.85);
      for (let i = 0; i < 3; i++) {
        const span = w + 240;
        const x = ((t * (6 + i * 3) + i * span * 0.37) % span) - 120;
        cloud(ctx, x, h * (0.22 + i * 0.09), 64 + i * 24);
      }

      /* The globe turns: meridians as half-ellipses, and its city lights. */
      const spin = t * 0.16;
      ctx.save();
      ctx.beginPath();
      ctx.arc(globe.x, globe.y, globe.r, 0, TAU);
      ctx.clip();
      ctx.strokeStyle = rgba(pal.line, STAGE_ALPHA[tone].line * 1.8);
      ctx.lineWidth = 1;
      for (let k = 0; k < 8; k++) {
        const lon = (k * Math.PI) / 8 + spin;
        const s = Math.sin(lon);
        if (Math.cos(lon) < 0) continue;
        ctx.beginPath();
        ctx.ellipse(globe.x, globe.y, Math.abs(s) * globe.r, globe.r, 0, s >= 0 ? -Math.PI / 2 : Math.PI / 2, s >= 0 ? Math.PI / 2 : Math.PI * 1.5);
        ctx.stroke();
      }
      ctx.fillStyle = pal.warm;
      for (const [lon0, lat0] of GLOBE_LIGHTS) {
        const lat = Math.abs(lat0) + 0.12;
        const lon = lon0 + spin;
        const depth = Math.cos(lon) * Math.cos(lat);
        if (depth <= 0.05) continue;
        ctx.globalAlpha = Math.min(1, depth * 1.6) * 0.9;
        ctx.beginPath();
        ctx.arc(globe.x + Math.sin(lon) * Math.cos(lat) * globe.r, globe.y - Math.sin(lat) * globe.r, 1.8 + depth * 1.6, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;

      /* Bunting: two swags from the top corners, meeting over the middle. */
      const s = Math.min(20, Math.max(12, w * 0.024));
      bunting(ctx, look, -10, -2, w / 2, 0, h * 0.045, s, t, 1, 0);
      bunting(ctx, look, w / 2, 0, w + 10, -2, h * 0.045, s, t, 1, 2);

      for (let i = 0; i < poles.length; i++) {
        const p = poles[i];
        const fw = Math.min(44, Math.max(28, w * 0.05)) * (i < 2 ? 1 : 0.82);
        const stripes = [pal.hues[i % 4], pal.spark, pal.hues[(i + 2) % 4]];
        pennant(ctx, look, p.x + p.dir * 1.5, p.top, fw * p.dir, fw * 0.64, t, i * 1.3, stripes);
      }

      twinkles(ctx, w, h, t, look, PARADE_GLINTS);
      react(ctx, w, h, look, hooks, host);
    },
  };
}

/* ── atlas: Country & Capital ───────────────────────────────────────────── */

/** An island: a seeded wobbly circle, smoothed through its midpoints. */
function landPath(ctx: Ctx, cx: number, cy: number, r: number, seed: number, squash = 0.72) {
  const rand = seeded(seed);
  const n = 26;
  const pts: [number, number][] = [];
  const p1 = rand() * TAU;
  const p2 = rand() * TAU;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + 0.18 * Math.sin(a * 3 + p1) + 0.1 * Math.sin(a * 5 + p2) + (rand() - 0.5) * 0.12;
    pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k * squash]);
  }
  ctx.beginPath();
  const mid = (i: number) => {
    const a = pts[i % n];
    const b = pts[(i + 1) % n];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
  };
  const start = mid(0);
  ctx.moveTo(start[0], start[1]);
  for (let i = 1; i <= n; i++) {
    const m = mid(i);
    ctx.quadraticCurveTo(pts[i % n][0], pts[i % n][1], m[0], m[1]);
  }
  ctx.closePath();
}

interface Pin {
  x: number;
  y: number;
}

function routePoint(a: Pin, b: Pin, lift: number, u: number) {
  const cx = (a.x + b.x) / 2;
  const cy = Math.min(a.y, b.y) - lift;
  const v = 1 - u;
  return {
    x: v * v * a.x + 2 * v * u * cx + u * u * b.x,
    y: v * v * a.y + 2 * v * u * cy + u * u * b.y,
    dx: 2 * v * (cx - a.x) + 2 * u * (b.x - cx),
    dy: 2 * v * (cy - a.y) + 2 * u * (b.y - cy),
    cx,
    cy,
  };
}

/** A landmark beside a capital: a dome on a drum, or a tower with a spire. */
function landmark(ctx: Ctx, look: StageLook, x: number, y: number, s: number, kind: 'dome' | 'tower') {
  const { pal } = look;
  ctx.fillStyle = pal.near;
  if (kind === 'dome') {
    ctx.fillRect(x - s * 0.9, y - s * 0.7, s * 1.8, s * 0.7);
    ctx.fillRect(x - s * 0.5, y - s * 1.0, s, s * 0.32);
    ctx.beginPath();
    ctx.arc(x, y - s * 1.0, s * 0.5, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(x - s * 0.06, y - s * 1.75, s * 0.12, s * 0.3);
    ctx.fillStyle = rgba(pal.warm, 0.8);
    for (let i = -1; i <= 1; i++) ctx.fillRect(x + i * s * 0.5 - s * 0.08, y - s * 0.5, s * 0.16, s * 0.24);
  } else {
    ctx.beginPath();
    ctx.moveTo(x - s * 0.55, y);
    ctx.lineTo(x - s * 0.22, y - s * 1.6);
    ctx.lineTo(x, y - s * 2.5);
    ctx.lineTo(x + s * 0.22, y - s * 1.6);
    ctx.lineTo(x + s * 0.55, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(pal.warm, 0.8);
    ctx.fillRect(x - s * 0.08, y - s * 1.2, s * 0.16, s * 0.22);
  }
}

const ATLAS_GLINTS = [
  [0.12, 0.2, 0.2, 0.4],
  [0.62, 0.12, 0.7, 0.3],
  [0.9, 0.62, 0.45, 0.6],
  [0.35, 0.36, 0.9, 0.2],
] as const;

function atlas(hooks: StageHooks): Painter {
  let pins: Pin[] = [];
  let routes: [number, number, number][] = [];
  return {
    still(ctx, w, h, look) {
      const { pal, tone } = look;
      const a = STAGE_ALPHA[tone];
      const host = hostOf(hooks, w, h, true);
      backdrop(ctx, w, h, look, { x: host.x, y: host.y });

      /* The graticule, bowed a little so the chart reads as a projection. */
      ctx.strokeStyle = rgba(pal.line, a.line * 0.8);
      ctx.lineWidth = 1;
      const cols = Math.max(5, Math.round(w / 110));
      for (let i = 1; i < cols; i++) {
        const x = (i / cols) * w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.quadraticCurveTo(x + (x - w / 2) * 0.12, h / 2, x, h);
        ctx.stroke();
      }
      const rows = Math.max(4, Math.round(h / 90));
      for (let i = 1; i < rows; i++) {
        const y = (i / rows) * h;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.quadraticCurveTo(w / 2, y - (y - h / 2) * 0.1 - 8, w, y);
        ctx.stroke();
      }

      const m = Math.min(w, h);
      const lands = [
        { x: w * 0.13, y: h * 0.6, r: m * 0.3, seed: 5 },
        { x: w * 0.86, y: h * 0.36, r: m * 0.25, seed: 9 },
        { x: w * 0.6, y: h * 0.92, r: m * 0.2, seed: 14 },
        { x: w * 0.42, y: h * 0.1, r: m * 0.11, seed: 21 },
      ];
      for (const land of lands) {
        /* Shallows, the coast, the land, a contour inside it. */
        ctx.globalAlpha = 1;
        ctx.strokeStyle = rgba(pal.accent, tone === 'glow' ? 0.08 : 0.12);
        ctx.lineWidth = 14;
        landPath(ctx, land.x, land.y, land.r, land.seed);
        ctx.stroke();
        ctx.fillStyle = pal.mid;
        ctx.globalAlpha = a.mid;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = rgba(pal.near, 1);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = pal.near;
        ctx.globalAlpha = a.near * 0.7;
        landPath(ctx, land.x - land.r * 0.08, land.y + land.r * 0.06, land.r * 0.6, land.seed + 1);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = rgba(pal.line, a.line * 1.3);
        ctx.lineWidth = 1;
        landPath(ctx, land.x, land.y, land.r * 0.8, land.seed);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      pins = [
        { x: w * 0.1, y: h * 0.55 },
        { x: w * 0.84, y: h * 0.32 },
        { x: w * 0.62, y: h * 0.86 },
        { x: w * 0.22, y: h * 0.74 },
      ];
      routes = [
        [0, 1, h * 0.38],
        [1, 2, h * 0.08],
        [0, 3, h * 0.06],
      ];
      const s = Math.max(9, Math.min(16, m * 0.03));
      landmark(ctx, look, pins[0].x + s * 2.2, pins[0].y + s * 0.4, s, 'tower');
      landmark(ctx, look, pins[1].x - s * 2.4, pins[1].y + s * 0.5, s, 'dome');
      landmark(ctx, look, pins[2].x + s * 2.4, pins[2].y + s * 0.3, s, 'dome');

      /* A compass rose in the open water. */
      const cr = Math.max(18, Math.min(38, m * 0.08));
      const cx = w * 0.93;
      const cy = h * 0.82;
      ctx.strokeStyle = rgba(pal.line, a.line * 2.2);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, cr * 0.72, 0, TAU);
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * TAU - Math.PI / 2;
        const len = i % 2 === 0 ? cr * 1.15 : cr * 0.62;
        ctx.fillStyle = i === 0 ? pal.warm : i % 2 === 0 ? rgba(pal.line, 0.55) : rgba(pal.line, 0.3);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
        ctx.lineTo(cx + Math.cos(ang + 0.5) * cr * 0.16, cy + Math.sin(ang + 0.5) * cr * 0.16);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang - 0.5) * cr * 0.16, cy + Math.sin(ang - 0.5) * cr * 0.16);
        ctx.closePath();
        ctx.fill();
      }
      edges(ctx, w, h, look);
    },
    live(ctx, w, h, t, look) {
      const { pal, tone } = look;
      const host = hostOf(hooks, w, h);

      /* Routes, flowing. */
      ctx.setLineDash([5, 7]);
      ctx.lineDashOffset = -t * 16;
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(pal.warm, tone === 'glow' ? 0.6 : 0.8);
      for (const [i, j, lift] of routes) {
        const a = pins[i];
        const b = pins[j];
        if (!a || !b) continue;
        const mid = routePoint(a, b, lift, 0.5);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mid.cx, mid.cy, b.x, b.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;

      /* The capitals: a ripple on the ground, a pin that bobs. */
      pins.forEach((p, i) => {
        const phase = (t * 0.6 + i * 0.27) % 1;
        ctx.strokeStyle = rgba(pal.hues[0], (1 - phase) * 0.7);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 4 + phase * 16, (4 + phase * 16) * 0.4, 0, 0, TAU);
        ctx.stroke();
        const bob = Math.sin(t * 2.2 + i) * 2.5;
        const y = p.y - 6 + bob;
        ctx.fillStyle = rgba(pal.shade, 0.3);
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 4, 1.6, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = pal.hues[0];
        ctx.beginPath();
        ctx.arc(p.x, y - 9, 7, Math.PI * 0.85, Math.PI * 2.15);
        ctx.lineTo(p.x, y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = rgba(pal.shade, 0.22);
        ctx.beginPath();
        ctx.arc(p.x, y - 9, 7, Math.PI * 1.5, Math.PI * 2.15);
        ctx.lineTo(p.x, y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = pal.spark;
        ctx.beginPath();
        ctx.arc(p.x, y - 9.5, 2.6, 0, TAU);
        ctx.fill();
      });

      /* A paper plane flying the long route, out and back. */
      const [i0, i1, lift] = routes[0] ?? [0, 1, 0];
      if (pins[i0] && pins[i1]) {
        const cyc = (t * 0.06) % 2;
        const u = cyc < 1 ? cyc : 2 - cyc;
        const at = routePoint(pins[i0], pins[i1], lift, u);
        const dir = Math.atan2(at.dy, at.dx) + (cyc < 1 ? 0 : Math.PI);
        const s = Math.max(9, Math.min(15, w * 0.018));
        ctx.save();
        ctx.translate(at.x, at.y - 10);
        ctx.fillStyle = rgba(pal.shade, 0.25);
        ctx.beginPath();
        ctx.ellipse(0, 22, s * 0.8, s * 0.25, 0, 0, TAU);
        ctx.fill();
        ctx.rotate(dir);
        ctx.fillStyle = pal.spark;
        ctx.beginPath();
        ctx.moveTo(s * 1.2, 0);
        ctx.lineTo(-s, -s * 0.75);
        ctx.lineTo(-s * 0.45, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = tone === 'glow' ? rgba(pal.line, 0.75) : rgba(pal.line, 0.45);
        ctx.beginPath();
        ctx.moveTo(s * 1.2, 0);
        ctx.lineTo(-s, s * 0.6);
        ctx.lineTo(-s * 0.45, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      /* Clouds over the chart, each with its shadow on the sea. */
      for (let i = 0; i < 2; i++) {
        const span = w + 260;
        const x = ((t * (9 + i * 4) + i * span * 0.55) % span) - 130;
        const y = h * (0.22 + i * 0.4);
        ctx.fillStyle = rgba(pal.shade, tone === 'glow' ? 0.35 : 0.08);
        cloud(ctx, x + 18, y + 26, 80 + i * 20);
        ctx.fillStyle = tone === 'glow' ? rgba(pal.far, 0.9) : rgba(pal.spark, 0.9);
        cloud(ctx, x, y, 80 + i * 20);
      }
      twinkles(ctx, w, h, t, look, ATLAS_GLINTS);
      react(ctx, w, h, look, hooks, host);
    },
  };
}

/* ── lab: Brain Games ───────────────────────────────────────────────────── */

function gear(ctx: Ctx, x: number, y: number, r: number, teeth: number, angle: number) {
  const inner = r * 0.82;
  ctx.beginPath();
  for (let i = 0; i < teeth; i++) {
    const a0 = angle + (i / teeth) * TAU;
    const step = TAU / teeth;
    ctx.lineTo(x + Math.cos(a0) * inner, y + Math.sin(a0) * inner);
    ctx.lineTo(x + Math.cos(a0 + step * 0.12) * r, y + Math.sin(a0 + step * 0.12) * r);
    ctx.lineTo(x + Math.cos(a0 + step * 0.42) * r, y + Math.sin(a0 + step * 0.42) * r);
    ctx.lineTo(x + Math.cos(a0 + step * 0.54) * inner, y + Math.sin(a0 + step * 0.54) * inner);
  }
  ctx.closePath();
  ctx.moveTo(x + r * 0.3, y);
  ctx.arc(x, y, r * 0.3, 0, TAU, true);
  ctx.fill('evenodd');
}

/** A jigsaw piece, `s` square, with a tab out on the right and the top and a blank on the left. */
function piece(ctx: Ctx, s: number) {
  const h = s / 2;
  const k = s * 0.17;
  ctx.beginPath();
  ctx.moveTo(-h, -h);
  ctx.lineTo(-k, -h);
  ctx.arc(0, -h - k * 0.55, k, Math.PI * 0.75, Math.PI * 0.25, false);
  ctx.lineTo(h, -h);
  ctx.lineTo(h, -k);
  ctx.arc(h + k * 0.55, 0, k, Math.PI * 1.25, Math.PI * 0.75, false);
  ctx.lineTo(h, h);
  ctx.lineTo(-h, h);
  ctx.lineTo(-h, k);
  ctx.arc(-h + k * 0.55, 0, k, Math.PI * 0.75, Math.PI * 1.25, true);
  ctx.closePath();
}

/** Where the floating puzzle pieces drift, as fractions of the card, and their hue. */
const PIECES = [
  [0.06, 0.34, 0, 0.0],
  [0.95, 0.58, 1, 0.3],
  [0.95, 0.85, 3, 0.6],
  [0.13, 0.9, 2, 0.15],
  [0.34, 0.97, 0, 0.8],
  [0.74, 0.95, 1, 0.45],
] as const;

const SYMBOLS = ['?', '+', '×', '÷', '=', '%', '?', 'π'] as const;

function lab(hooks: StageHooks): Painter {
  let font = 'sans-serif';
  return {
    still(ctx, w, h, look) {
      const { pal, tone } = look;
      const a = STAGE_ALPHA[tone];
      const host = hostOf(hooks, w, h, true);
      backdrop(ctx, w, h, look, { x: host.x, y: host.y });
      font = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || 'sans-serif';

      /* Graph paper. */
      const cell = 22;
      ctx.lineWidth = 1;
      for (let x = 0.5; x < w; x += cell) {
        ctx.strokeStyle = rgba(pal.line, Math.round((x - 0.5) / cell) % 5 === 0 ? a.line * 0.9 : a.line * 0.4);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0.5; y < h; y += cell) {
        ctx.strokeStyle = rgba(pal.line, Math.round((y - 0.5) / cell) % 5 === 0 ? a.line * 0.9 : a.line * 0.4);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      /* A wash so the paper fades out under the host. */
      const wash = ctx.createRadialGradient(host.x, host.y, 0, host.x, host.y, Math.max(w, h) * 0.5);
      wash.addColorStop(0, rgba(pal.skyLow, 0.7));
      wash.addColorStop(1, rgba(pal.skyLow, 0));
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, w, h);
      edges(ctx, w, h, look);
    },
    live(ctx, w, h, t, look) {
      const { pal, tone } = look;
      const a = STAGE_ALPHA[tone];
      const host = hostOf(hooks, w, h);
      const m = Math.min(w, h);

      /* Two meshing gears low on the left, one turning in the top right. */
      const r1 = m * 0.17;
      const r2 = r1 * 0.62;
      const g1 = { x: w * 0.035, y: h * 0.97 };
      const g2 = { x: g1.x + (r1 + r2) * 0.93 * Math.cos(-0.55), y: g1.y + (r1 + r2) * 0.93 * Math.sin(-0.55) };
      ctx.fillStyle = pal.far;
      ctx.globalAlpha = a.far;
      gear(ctx, g1.x, g1.y, r1, 14, t * 0.25);
      ctx.fillStyle = pal.mid;
      ctx.globalAlpha = a.mid;
      gear(ctx, g2.x, g2.y, r2, 9, -t * 0.25 * (14 / 9) + 0.2);
      ctx.fillStyle = pal.far;
      ctx.globalAlpha = a.far;
      gear(ctx, w * 0.985, h * 0.04, m * 0.15, 12, -t * 0.18);
      ctx.globalAlpha = 1;

      /* The lamp having an idea, high on the right. */
      const bx = w * 0.9;
      const by = h * 0.36;
      const br = Math.max(11, Math.min(20, m * 0.04));
      const pulse = 0.65 + 0.35 * Math.sin(t * 1.6);
      const glow = ctx.createRadialGradient(bx, by, 0, bx, by, br * 4.5);
      glow.addColorStop(0, rgba(pal.warm, 0.32 * pulse));
      glow.addColorStop(1, rgba(pal.warm, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(bx - br * 5, by - br * 5, br * 10, br * 10);
      ctx.fillStyle = rgba(pal.warm, 0.55 + 0.4 * pulse);
      ctx.beginPath();
      ctx.arc(bx, by, br, Math.PI * 0.8, Math.PI * 2.2);
      ctx.lineTo(bx + br * 0.45, by + br * 1.25);
      ctx.lineTo(bx - br * 0.45, by + br * 1.25);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = rgba(pal.spark, 0.8);
      ctx.beginPath();
      ctx.arc(bx - br * 0.38, by - br * 0.35, br * 0.22, 0, TAU);
      ctx.fill();
      ctx.fillStyle = tone === 'glow' ? rgba(pal.line, 0.5) : rgba(pal.line, 0.6);
      ctx.fillRect(bx - br * 0.48, by + br * 1.3, br * 0.96, br * 0.22);
      ctx.fillRect(bx - br * 0.4, by + br * 1.6, br * 0.8, br * 0.22);

      /* Puzzle pieces adrift. */
      const s = Math.max(20, Math.min(40, m * 0.075));
      PIECES.forEach(([fx, fy, hue, ph], i) => {
        const x = fx * w + Math.sin(t * 0.5 + ph * TAU) * 6;
        const y = fy * h + Math.cos(t * 0.7 + ph * TAU) * 7;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(t * 0.3 + i) * 0.5 + ph * 2);
        ctx.globalAlpha = a.hue;
        ctx.fillStyle = pal.hues[hue];
        piece(ctx, s);
        ctx.fill();
        /* The lower half in shade, clipped to the piece. */
        ctx.save();
        piece(ctx, s);
        ctx.clip();
        ctx.fillStyle = rgba(pal.shade, 0.22);
        ctx.fillRect(-s, s * 0.12, s * 2, s);
        ctx.restore();
        ctx.fillStyle = rgba(pal.spark, 0.35);
        ctx.fillRect(-s * 0.36, -s * 0.36, s * 0.22, s * 0.07);
        ctx.restore();
      });
      ctx.globalAlpha = 1;

      /* Symbols rising like bubbles, fading at both ends. */
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      SYMBOLS.forEach((sym, i) => {
        const period = 9 + (i % 3) * 2;
        const u = ((t + i * 1.7) % period) / period;
        const x = (i % 2 === 0 ? 0.03 + (i / SYMBOLS.length) * 0.16 : 0.97 - (i / SYMBOLS.length) * 0.16) * w;
        const y = h * (0.95 - u * 0.85);
        ctx.globalAlpha = Math.sin(Math.PI * u) * (tone === 'glow' ? 0.4 : 0.5);
        ctx.fillStyle = pal.hues[(i + 1) % 4];
        ctx.font = `700 ${Math.round(16 + (i % 3) * 6)}px ${font}`;
        ctx.fillText(sym, x + Math.sin(t + i) * 5, y);
      });
      ctx.globalAlpha = 1;
      react(ctx, w, h, look, hooks, host);
    },
  };
}

/* ── city: the local quiz ───────────────────────────────────────────────── */

type Window = [number, number, number, number, number];

/**
 * A skyline in design units — 900 wide, ground at 0, up negative — painted in
 * one fill, with the lit windows handed back so the live layer can make a few
 * of them come and go.
 */
type Skyline = (ctx: Ctx, look: StageLook, windows: Window[]) => void;

function arched(ctx: Ctx, x: number, y: number, w: number, h: number) {
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - h + w / 2);
  ctx.quadraticCurveTo(x, y - h, x + w / 2, y - h - w * 0.15);
  ctx.quadraticCurveTo(x + w, y - h, x + w, y - h + w / 2);
  ctx.lineTo(x + w, y);
  ctx.closePath();
}

/** Kraków: Wawel on its hill, the Cloth Hall, St Mary's two towers, the Town Hall tower. */
const krakow: Skyline = (ctx, look, windows) => {
  const { pal } = look;
  ctx.fillStyle = pal.near;
  ctx.beginPath();
  /* Wawel hill and its walls. */
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(20, -30, 40, -52, 70, -56);
  ctx.lineTo(225, -58);
  ctx.bezierCurveTo(245, -50, 258, -24, 275, 0);
  ctx.closePath();
  ctx.rect(70, -96, 150, 42);
  for (let x = 72; x < 220; x += 12) ctx.rect(x, -103, 7, 8);
  /* The cathedral's tower and the chapel drum. */
  ctx.rect(92, -150, 26, 56);
  ctx.moveTo(92, -150);
  ctx.quadraticCurveTo(105, -178, 118, -150);
  ctx.rect(103.5, -196, 3, 30);
  ctx.rect(144, -122, 30, 28);
  ctx.rect(188, -136, 22, 42);
  ctx.moveTo(186, -136);
  ctx.lineTo(199, -162);
  ctx.lineTo(212, -136);
  /* Townhouses with gables. */
  for (let i = 0; i < 6; i++) {
    const x = 282 + i * 26;
    const top = -52 - ((i * 37) % 22);
    ctx.rect(x, top, 24, -top);
    ctx.moveTo(x - 1, top);
    ctx.lineTo(x + 12, top - 16);
    ctx.lineTo(x + 25, top);
    windows.push([x + 6, top + 14, 4, 6, i]);
    windows.push([x + 14, top + 26, 4, 6, i + 3]);
  }
  /* Sukiennice: the long hall, its parapet of little pinnacles, the attic. */
  ctx.rect(444, -54, 196, 54);
  ctx.rect(450, -64, 184, 10);
  for (let x = 452; x <= 630; x += 12) {
    ctx.moveTo(x, -64);
    ctx.lineTo(x + 3, -76);
    ctx.lineTo(x + 6, -64);
  }
  ctx.rect(526, -88, 32, 26);
  ctx.moveTo(526, -88);
  ctx.lineTo(542, -104);
  ctx.lineTo(558, -88);
  /* St Mary's: the nave, the tall tower with its crown and spire, the shorter one with its helmet. */
  ctx.rect(668, -78, 104, 78);
  ctx.moveTo(668, -78);
  ctx.lineTo(720, -104);
  ctx.lineTo(772, -78);
  ctx.rect(674, -214, 32, 214);
  for (let k = 0; k < 4; k++) {
    const x = 672 + k * 10.5;
    ctx.moveTo(x, -214);
    ctx.lineTo(x + 2.5, -232);
    ctx.lineTo(x + 5, -214);
  }
  ctx.moveTo(680, -214);
  ctx.lineTo(690, -268);
  ctx.lineTo(700, -214);
  ctx.rect(744, -166, 28, 166);
  ctx.moveTo(744, -166);
  ctx.quadraticCurveTo(758, -192, 772, -166);
  ctx.rect(755, -200, 6, 22);
  ctx.moveTo(753, -200);
  ctx.lineTo(758, -214);
  ctx.lineTo(763, -200);
  /* The Town Hall tower. */
  ctx.rect(814, -156, 30, 156);
  ctx.moveTo(812, -156);
  ctx.lineTo(829, -204);
  ctx.lineTo(846, -156);
  for (let i = 0; i < 2; i++) {
    const x = 852 + i * 24;
    ctx.rect(x, -58 + i * 8, 22, 58 - i * 8);
  }
  ctx.fill();

  /* The Sigismund Chapel's gilded dome is the one warm surface on the hill. */
  ctx.fillStyle = pal.warm;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(159, -122, 15, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(157.5, -146, 3, 10);
  ctx.globalAlpha = 1;

  /* The hall's arcade, cut darker, and St Mary's tall window. */
  ctx.fillStyle = pal.far;
  ctx.beginPath();
  for (let x = 452; x < 632; x += 22) arched(ctx, x, 0, 14, 26);
  arched(ctx, 708, -14, 24, 48);
  ctx.fill();
  windows.push([684, -150, 6, 12, 2], [688, -120, 6, 12, 5], [752, -120, 6, 10, 1], [824, -120, 6, 10, 4], [100, -84, 5, 8, 6], [196, -84, 5, 8, 7], [540, -82, 6, 8, 3]);
};

/** Samarkand's Registan: three madrasas, their portals and turquoise ribbed domes, minarets, poplars. */
const registan: Skyline = (ctx, look, windows) => {
  const { pal } = look;
  const madrasa = (x: number, wide: number, portal: number) => {
    ctx.rect(x, -64, wide, 64);
    const px = x + (wide - portal) / 2;
    ctx.rect(px, -126, portal, 126);
    ctx.rect(x - 8, -170, 14, 170);
    ctx.rect(x + wide - 6, -170, 14, 170);
    ctx.rect(x - 11, -150, 20, 6);
    ctx.rect(x + wide - 9, -150, 20, 6);
  };
  ctx.fillStyle = pal.near;
  ctx.beginPath();
  madrasa(40, 230, 110);
  madrasa(330, 220, 100);
  madrasa(620, 230, 110);
  for (let x = 0; x < 900; x += 60) ctx.rect(x, -24, 46, 24);
  ctx.fill();

  /* Minaret caps and ribbed domes, in the tilework's blue. */
  const dome = (x: number, base: number, r: number) => {
    ctx.fillStyle = pal.near;
    ctx.fillRect(x - r * 0.75, base - r * 0.6, r * 1.5, r * 0.6);
    ctx.fillStyle = pal.hues[3];
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(x - r, base - r * 0.6);
    ctx.bezierCurveTo(x - r * 1.05, base - r * 1.9, x - r * 0.2, base - r * 2.1, x, base - r * 2.35);
    ctx.bezierCurveTo(x + r * 0.2, base - r * 2.1, x + r * 1.05, base - r * 1.9, x + r, base - r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = rgba(pal.shade, 0.35);
    ctx.lineWidth = 1.2;
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(x + k * r * 0.38, base - r * 0.6);
      ctx.quadraticCurveTo(x + k * r * 0.3, base - r * 1.8, x, base - r * 2.3);
      ctx.stroke();
    }
    ctx.fillStyle = rgba(pal.spark, 0.25);
    ctx.beginPath();
    ctx.ellipse(x - r * 0.45, base - r * 1.4, r * 0.15, r * 0.45, -0.3, 0, TAU);
    ctx.fill();
  };
  dome(300, -64, 30);
  dome(600, -64, 34);
  dome(870, -64, 24);
  for (const x of [39, 277, 329, 557, 619, 857]) {
    ctx.fillStyle = pal.hues[3];
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(x, -170, 9, Math.PI, 0);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* The portals' great arched niches, cut back, with a lit door in each. */
  ctx.fillStyle = pal.far;
  ctx.beginPath();
  arched(ctx, 120, 0, 70, 96);
  arched(ctx, 405, 0, 70, 88);
  arched(ctx, 700, 0, 70, 96);
  for (const x of [56, 86, 222, 252, 344, 374, 498, 528, 636, 666, 802, 832]) arched(ctx, x, -12, 16, 30);
  ctx.fill();
  windows.push([147, -40, 16, 26, 0], [432, -36, 16, 24, 3], [727, -40, 16, 26, 6], [60, -32, 8, 12, 1], [226, -32, 8, 12, 4], [502, -32, 8, 12, 2], [806, -32, 8, 12, 5]);

  /* Poplars. */
  ctx.fillStyle = pal.mid;
  for (const x of [8, 312, 590, 890]) {
    ctx.beginPath();
    ctx.ellipse(x, -42, 10, 44, 0, 0, TAU);
    ctx.fill();
  }
};

const CITY_GLINTS = [
  [0.1, 0.1, 0.1, 0.4],
  [0.3, 0.06, 0.6, 0.2],
  [0.55, 0.14, 0.3, 0.3],
  [0.75, 0.05, 0.85, 0.5],
  [0.92, 0.16, 0.45, 0.2],
  [0.44, 0.24, 0.7, 0.2],
] as const;

function city(hooks: StageHooks): Painter {
  const skyline = hooks.country === 'UZ' ? registan : krakow;
  let windows: Window[] = [];
  let place = { x: 0, y: 0, k: 1 };
  return {
    still(ctx, w, h, look) {
      const { pal, tone } = look;
      const a = STAGE_ALPHA[tone];
      const host = hostOf(hooks, w, h, true);
      backdrop(ctx, w, h, look, { x: host.x, y: host.y });
      /*
       * The city stands at the foot of the card and rises behind the answers,
       * seen through their glass the way a city is seen through a window — the
       * band above the question is its sky. Standing it behind the host
       * instead hid the whole skyline behind the one card a player reads.
       */
      const horizon = h - Math.max(16, h * 0.06);

      /* Moon by night, sun by day. */
      const mr = Math.max(14, Math.min(28, w * 0.035));
      const mx = w - Math.max(mr * 2.2, w * 0.08);
      const my = h * 0.3;
      const halo = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4);
      halo.addColorStop(0, rgba(tone === 'glow' ? pal.spark : pal.warm, tone === 'glow' ? 0.14 : 0.35));
      halo.addColorStop(1, rgba(pal.warm, 0));
      ctx.fillStyle = halo;
      ctx.fillRect(mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
      ctx.fillStyle = tone === 'glow' ? rgba(pal.spark, 0.85) : pal.warm;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, TAU);
      ctx.fill();
      if (tone === 'glow') {
        ctx.fillStyle = rgba(pal.skyTop, 0.9);
        ctx.beginPath();
        ctx.arc(mx + mr * 0.45, my - mr * 0.25, mr * 0.85, 0, TAU);
        ctx.fill();
        const r = seeded(77);
        ctx.fillStyle = pal.spark;
        for (let i = 0; i < 40; i++) {
          ctx.globalAlpha = 0.2 + r() * 0.5;
          ctx.fillRect(r() * w, r() * horizon * 0.7, 1.2, 1.2);
        }
        ctx.globalAlpha = 1;
      }

      /* The far city: blocks without names. */
      const r = seeded(31);
      ctx.fillStyle = pal.far;
      ctx.globalAlpha = a.far;
      ctx.beginPath();
      for (let x = -10; x < w; ) {
        const bw = 14 + r() * 26;
        const bh = h * (0.06 + r() * 0.12);
        ctx.rect(x, horizon - bh, bw, bh + 4);
        x += bw + 2;
      }
      ctx.fill();
      ctx.globalAlpha = 1;

      /* The landmarks, scaled to fit the band between the HUD and the horizon. */
      const k = Math.min(w / 900, (horizon - h * 0.28) / 270);
      place = { x: (w - 900 * k) / 2, y: horizon, k };
      windows = [];
      ctx.save();
      ctx.translate(place.x, place.y);
      ctx.scale(k, k);
      ctx.globalAlpha = a.near;
      skyline(ctx, look, windows);
      ctx.globalAlpha = 1;
      /* Lit windows. */
      ctx.fillStyle = rgba(pal.warm, tone === 'glow' ? 0.55 : 0.75);
      for (const [x, y, ww, wh] of windows) ctx.fillRect(x, y, ww, wh);
      ctx.restore();

      /* The ground the city stands on — a river under Kraków, a square under the Registan. */
      ctx.fillStyle = pal.mid;
      ctx.globalAlpha = a.mid;
      ctx.fillRect(0, horizon, w, h - horizon);
      ctx.globalAlpha = 1;
      ctx.fillStyle = rgba(pal.accent, tone === 'glow' ? 0.22 : 0.3);
      ctx.fillRect(0, horizon, w, 1.5);
      ctx.fillStyle = rgba(pal.warm, tone === 'glow' ? 0.35 : 0.45);
      for (const [x, , ww] of windows) {
        const gx = place.x + (x + ww / 2) * place.k;
        ctx.fillRect(gx - 4, horizon + 5 + ((x * 7) % 5), 8, 1.4);
      }
      edges(ctx, w, h, look);
    },
    live(ctx, w, h, t, look) {
      const { pal, tone } = look;
      const host = hostOf(hooks, w, h);

      ctx.fillStyle = tone === 'glow' ? rgba(pal.far, 0.7) : rgba(pal.spark, 0.9);
      for (let i = 0; i < 3; i++) {
        const span = w + 240;
        const x = ((t * (5 + i * 2.5) + i * span * 0.41) % span) - 120;
        cloud(ctx, x, h * (0.12 + i * 0.09), 64 + i * 22);
      }

      /* A few windows going on and off, as windows do. */
      ctx.save();
      ctx.translate(place.x, place.y);
      ctx.scale(place.k, place.k);
      for (const [x, y, ww, wh, phase] of windows) {
        const on = Math.sin(t * 0.35 + phase * 1.9);
        if (on > 0.55) continue;
        ctx.fillStyle = rgba(pal.far, Math.min(1, (0.55 - on) * 1.5));
        ctx.fillRect(x, y, ww, wh);
      }
      ctx.restore();

      /* Birds crossing — Pico's neighbours. */
      ctx.strokeStyle = tone === 'glow' ? rgba(pal.spark, 0.55) : rgba(pal.line, 0.55);
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const span = w + 160;
        const x = ((t * (26 + i * 6) + i * 140) % span) - 80;
        const y = h * (0.22 + i * 0.05) + Math.sin(t * 0.9 + i) * 6;
        const flap = Math.sin(t * 9 + i * 2) * 4;
        const s = 6 - i;
        ctx.beginPath();
        ctx.moveTo(x - s, y - flap);
        ctx.quadraticCurveTo(x - s * 0.4, y - 2, x, y);
        ctx.quadraticCurveTo(x + s * 0.4, y - 2, x + s, y - flap);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      twinkles(ctx, w, h, t, look, CITY_GLINTS, tone === 'glow' ? 0.8 : 0.6);
      react(ctx, w, h, look, hooks, host);
    },
  };
}

/* ── stage: the result card ─────────────────────────────────────────────── */

const STAGE_GLINTS = [
  [0.2, 0.18, 0.1, 0.6],
  [0.8, 0.14, 0.4, 0.4],
  [0.3, 0.38, 0.75, 0.3],
  [0.72, 0.36, 0.2, 0.7],
  [0.12, 0.5, 0.55, 0.3],
  [0.9, 0.48, 0.85, 0.4],
] as const;

function stage(hooks: StageHooks): Painter {
  let host = { x: 0, y: 0, size: 0 };
  return {
    still(ctx, w, h, look) {
      const { pal, tone } = look;
      const a = STAGE_ALPHA[tone];
      host = hostOf(hooks, w, h, true);
      backdrop(ctx, w, h, look, { x: host.x, y: host.y });

      /* The podium Pico stands on: a drum with a lit rim, and its shadow. */
      const feet = host.y + host.size * 0.46;
      const rx = host.size * 0.62;
      const ry = rx * 0.2;
      const depth = host.size * 0.2;
      ctx.fillStyle = rgba(pal.shade, tone === 'glow' ? 0.55 : 0.14);
      ctx.beginPath();
      ctx.ellipse(host.x, feet + depth + ry * 0.6, rx * 1.3, ry * 1.4, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = a.near;
      ctx.fillStyle = pal.near;
      ctx.beginPath();
      ctx.ellipse(host.x, feet + depth, rx, ry, 0, 0, Math.PI);
      ctx.lineTo(host.x - rx, feet);
      ctx.ellipse(host.x, feet, rx, ry, 0, Math.PI, 0, true);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = a.mid;
      ctx.fillStyle = pal.mid;
      ctx.beginPath();
      ctx.ellipse(host.x, feet, rx, ry, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = rgba(pal.accent, tone === 'glow' ? 0.7 : 0.75);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(host.x, feet, rx, ry, 0, Math.PI * 0.05, Math.PI * 0.95);
      ctx.stroke();
      ctx.fillStyle = rgba(pal.warm, 0.7);
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(host.x + i * rx * 0.36, feet + depth * 0.55 + ry * (1 - Math.abs(i) * 0.25) * 0.5, 1.6, 0, TAU);
        ctx.fill();
      }
      edges(ctx, w, h, look);
    },
    live(ctx, w, h, t, look) {
      const { pal, tone } = look;
      const mood = hooks.mood?.current ?? 'idle';
      const cx = host.x;
      const cy = host.y;

      /* Rays from behind the bird: gold for a good round, faint mint for a quiet one, none for a bad one. */
      const strength = { party: 1, happy: 0.7, idle: 0.22, sad: 0 }[mood];
      if (strength > 0) {
        /*
         * The rays are pale light, not gold: gold laid thin over teal mixes to
         * olive. The warmth is a halo close behind the bird instead, where it
         * is dense enough to stay gold.
         */
        if (mood !== 'idle') {
          const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, host.size * 1.3);
          halo.addColorStop(0, rgba(pal.warm, (tone === 'glow' ? 0.3 : 0.4) * strength));
          halo.addColorStop(1, rgba(pal.warm, 0));
          ctx.fillStyle = halo;
          ctx.fillRect(cx - host.size * 1.4, cy - host.size * 1.4, host.size * 2.8, host.size * 2.8);
        }
        const hue = mood === 'idle' ? pal.accent : pal.spark;
        const reach = Math.max(w, h) * 0.62;
        const g = ctx.createRadialGradient(cx, cy, host.size * 0.2, cx, cy, reach);
        const peak = (tone === 'glow' ? 0.16 : 0.55) * strength;
        g.addColorStop(0, rgba(hue, peak));
        g.addColorStop(0.45, rgba(hue, peak * 0.3));
        g.addColorStop(1, rgba(hue, 0));
        ctx.fillStyle = g;
        const n = 14;
        const turn = t * 0.12;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const a0 = turn + (i / n) * TAU;
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, reach, a0, a0 + (TAU / n) * 0.42);
          ctx.closePath();
        }
        ctx.fill();
        twinkles(ctx, w, h, t, look, STAGE_GLINTS, 0.6 + strength * 0.6);
      }

      if (mood === 'sad') {
        /* A small cloud of its own, raining on the podium. */
        const top = cy - host.size * 0.78;
        const s = host.size * 1.05;
        ctx.strokeStyle = tone === 'glow' ? rgba(pal.line, 0.45) : rgba(pal.line, 0.5);
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        const fall = host.size * 1.05;
        for (let i = 0; i < 9; i++) {
          const x = cx - s * 0.4 + (i / 8) * s * 0.8;
          const u = (t * 0.9 + i * 0.37) % 1;
          const y = top + 6 + u * fall;
          ctx.globalAlpha = 1 - u;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - 1.5, y + 7);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.lineCap = 'butt';
        ctx.fillStyle = tone === 'glow' ? rgba(pal.mid, 1) : rgba(pal.far, 1);
        cloud(ctx, cx + Math.sin(t * 0.6) * 4, top, s);
      }
    },
  };
}

/* ── the table ──────────────────────────────────────────────────────────── */

const PAINTERS: Record<StageMotif, (hooks: StageHooks) => Painter> = {
  parade,
  atlas,
  lab,
  city,
  stage,
};

/** A fresh painter for one mounted set; it keeps its measured layout in its own closure. */
export function stagePainter(motif: StageMotif, hooks: StageHooks): Painter {
  return PAINTERS[motif](hooks);
}
