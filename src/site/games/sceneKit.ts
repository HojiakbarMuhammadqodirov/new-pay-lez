/**
 * The few drawing helpers Pico Jump's and Pico's Ball's scenes share
 * (`games/jump/scene.ts`, `games/ball/scene.ts`). Nothing here knows either
 * game: an offscreen sheet at the display's density, a seeded random so a
 * scene's scenery is the same on every round, and hex arithmetic for the
 * scene palettes.
 */

/** An offscreen canvas whose context draws in CSS pixels, `w × h` of them. */
export interface Sheet {
  c: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  w: number;
  h: number;
}

/**
 * A sheet `w × h` CSS pixels, backed at `ratio`. Pre-rendering is the whole
 * point: anything that does not move relative to itself (a ridge, a cloud, a
 * platform, a brick) is drawn once here and stamped with `drawImage` every
 * frame, which is the cheapest thing a 2D canvas does.
 */
export function sheet(w: number, h: number, ratio: number): Sheet {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * ratio));
  c.height = Math.max(1, Math.ceil(h * ratio));
  const g = c.getContext('2d')!;
  g.setTransform(c.width / Math.max(w, 1e-6), 0, 0, c.height / Math.max(h, 1e-6), 0, 0);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  return { c, g, w, h };
}

/** Stamp a sheet with its top-left at `(x, y)`, at its own CSS size times `scale`. */
export function stamp(ctx: CanvasRenderingContext2D, s: Sheet, x: number, y: number, scale = 1): void {
  ctx.drawImage(s.c, x, y, s.w * scale, s.h * scale);
}

/**
 * mulberry32: small, fast and good enough to scatter stars. Seeded so the
 * scenery is a place rather than a shuffle — the same tree stands in the same
 * spot on every round and in both themes.
 */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function channels(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `#rrggbb` at an alpha, as `rgba(…)`. Scene palettes are hex; only the alpha varies. */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** `a` moved `t` of the way to `b`, both hex — straight-line sRGB, as the palettes are authored. */
export function mix(a: string, b: string, t: number): string {
  const x = channels(a);
  const y = channels(b);
  const h = (i: number) => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0');
  return `#${h(0)}${h(1)}${h(2)}`;
}

/**
 * A leaf, base at the origin pointing along +x, `len` long and `wide` at its
 * widest — the one leaf every jungle thing in these scenes is made of.
 */
export function leafPath(g: CanvasRenderingContext2D, len: number, wide: number): void {
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.45, -wide, len, 0);
  g.quadraticCurveTo(len * 0.45, wide, 0, 0);
  g.closePath();
}

/** A four-point sparkle centred on the origin, `r` to its tips. */
export function sparklePath(g: CanvasRenderingContext2D, r: number): void {
  const k = r * 0.28;
  g.beginPath();
  g.moveTo(0, -r);
  g.quadraticCurveTo(k, -k, r, 0);
  g.quadraticCurveTo(k, k, 0, r);
  g.quadraticCurveTo(-k, k, -r, 0);
  g.quadraticCurveTo(-k, -k, 0, -r);
  g.closePath();
}

/** A five-point star centred on the origin. */
export function starPath(g: CanvasRenderingContext2D, r: number, inner = 0.45): void {
  g.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
    else g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  g.closePath();
}

/**
 * A soft round glow sprite, `r` CSS px in radius: `hex` at `alpha` in the
 * centre, fading to the *same* colour at zero. (Fading to transparent black
 * instead leaves a grey fringe, because canvas gradients interpolate
 * unpremultiplied.)
 */
export function glowSheet(r: number, hex: string, alpha: number, ratio: number): Sheet {
  const s = sheet(r * 2, r * 2, ratio);
  const grad = s.g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, rgba(hex, alpha));
  grad.addColorStop(0.35, rgba(hex, alpha * 0.55));
  grad.addColorStop(1, rgba(hex, 0));
  s.g.fillStyle = grad;
  s.g.fillRect(0, 0, r * 2, r * 2);
  return s;
}
