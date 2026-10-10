import type { CSSProperties } from 'react';
import type { ThemeName } from '../../theme/context';
import type { DioramaPainter } from '../diorama';
import { WORD_MOTION, WORD_SCENE, WORD_WALLPAPER, type WordScene } from './config';

/**
 * Pico's study, painted: the wall behind the shelf and the desk, a window,
 * the lamp's warmth, and the dust in it.
 *
 * Only scenery lives here. The shelf Pico stands on, the desk, the rack and
 * every tile are DOM (`WordBuilder.tsx`, `.wb-*` in `site.css`), because they
 * have to sit exactly where the layout puts them in five languages and two
 * widths; a canvas would have to measure the page to know where its own desk
 * was. What a canvas is for is the soft stuff — gradients, a few hundred faint
 * glyphs, specks — and none of that has to line up with anything.
 */

const TAU = Math.PI * 2;

/** A fixed, cheap hash: the same wallpaper and the same stars every paint. */
function noise(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

interface Pane {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where the window is. A function of the box alone, so the still and the live
 * layer agree without sharing state: the right-hand side of the wall, high
 * enough that the desk only ever covers its sill, small enough on a phone that
 * the note in front of it is still the thing being read.
 */
function windowOf(w: number, h: number) {
  const width = Math.max(76, Math.min(112, w * 0.135));
  const height = width * 1.28;
  const x = w - width - Math.max(18, w * 0.06);
  /* Below the header row's right-hand figure, and with the sill clear of the
     shelf, which stands about 220px down on a desktop panel. */
  const y = Math.max(60, Math.min(h * 0.11, 70));
  const bar = Math.max(4, width * 0.05);
  const inset = Math.max(6, width * 0.075);
  const inner: Pane = { x: x + inset, y: y + inset, w: width - inset * 2, h: height - inset * 2 };
  /* Four panes: the inner rectangle split by one vertical and one horizontal
     bar. The live layer clips each one separately, so a cloud passes *behind*
     the bars rather than over them. */
  const halfW = (inner.w - bar) / 2;
  const halfH = (inner.h - bar) / 2;
  const panes: Pane[] = [
    { x: inner.x, y: inner.y, w: halfW, h: halfH },
    { x: inner.x + halfW + bar, y: inner.y, w: halfW, h: halfH },
    { x: inner.x, y: inner.y + halfH + bar, w: halfW, h: halfH },
    { x: inner.x + halfW + bar, y: inner.y + halfH + bar, w: halfW, h: halfH },
  ];
  return { x, y, width, height, inner, panes, bar };
}

/** Where the lamp's light comes from — above the shelf's left end, where Pico is. */
function lampOf(w: number, h: number) {
  return { x: Math.max(70, w * 0.22), y: Math.min(h * 0.12, 90) };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function paintWindow(ctx: CanvasRenderingContext2D, w: number, h: number, p: WordScene, night: boolean) {
  const win = windowOf(w, h);
  const { x, y, width, height, inner } = win;

  /* The recess's shadow, then the frame, then the sky — back to front. */
  ctx.fillStyle = p.windowShade;
  roundRect(ctx, x + 3, y + 5, width, height, width * 0.12);
  ctx.fill();
  ctx.fillStyle = p.windowFrame;
  roundRect(ctx, x, y, width, height, width * 0.12);
  ctx.fill();

  const sky = ctx.createLinearGradient(0, inner.y, 0, inner.y + inner.h);
  sky.addColorStop(0, p.skyTop);
  sky.addColorStop(1, p.skyBottom);
  ctx.fillStyle = sky;
  for (const pane of win.panes) {
    roundRect(ctx, pane.x, pane.y, pane.w, pane.h, 3);
    ctx.fill();
  }

  /* The moon (or the sun) sits in the top-right pane and its halo spills into
     the others — clipped to the glass, so it never paints the frame. */
  ctx.save();
  ctx.beginPath();
  for (const pane of win.panes) ctx.rect(pane.x, pane.y, pane.w, pane.h);
  ctx.clip();
  const ox = win.panes[1].x + win.panes[1].w * 0.55;
  const oy = win.panes[1].y + win.panes[1].h * 0.45;
  const r = inner.w * (night ? 0.13 : 0.17);
  const halo = ctx.createRadialGradient(ox, oy, r * 0.5, ox, oy, r * 4.2);
  halo.addColorStop(0, p.orbGlow);
  halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
  ctx.fillStyle = p.orb;
  ctx.beginPath();
  ctx.arc(ox, oy, r, 0, TAU);
  ctx.fill();
  if (night) {
    /* A crescent's shadow: the sky colour bitten out of one side. */
    ctx.fillStyle = p.skyTop;
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.arc(ox + r * 0.55, oy - r * 0.3, r * 0.92, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  /* The sill: a lighter ledge under the frame, where the light lands. */
  ctx.fillStyle = p.windowFrame;
  roundRect(ctx, x - width * 0.08, y + height - 2, width * 1.16, Math.max(6, width * 0.07), 3);
  ctx.fill();
  ctx.fillStyle = p.windowShade;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(x - width * 0.06, y + height - 2 + Math.max(6, width * 0.07), width * 1.12, 3);
  ctx.globalAlpha = 1;
}

function paintWallpaper(ctx: CanvasRenderingContext2D, w: number, h: number, p: WordScene) {
  const { cell, glyphs, turn } = WORD_WALLPAPER;
  const chars = [...glyphs];
  ctx.fillStyle = p.wallGlyph;
  ctx.font = `600 ${Math.round(cell * 0.34)}px Poppins, Manrope, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cols = Math.ceil(w / cell) + 1;
  const rows = Math.ceil(h / cell) + 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * 131 + c * 7;
      /* Every other row is offset half a cell — the brick lay a printed paper
         uses — and a share of the cells are left empty so it reads as a
         pattern rather than as text. */
      if (noise(i + 3) < 0.28) continue;
      const x = c * cell + (r % 2 ? cell / 2 : 0) + (noise(i) - 0.5) * cell * 0.3;
      const y = r * cell + (noise(i + 1) - 0.5) * cell * 0.3;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((noise(i + 2) - 0.5) * 2 * turn);
      ctx.fillText(chars[Math.floor(noise(i + 4) * chars.length)], 0, 0);
      ctx.restore();
    }
  }
}

export const DESK_ROOM: DioramaPainter<Room> = {
  still(ctx, w, h, p) {
    const wall = ctx.createLinearGradient(0, 0, 0, h);
    wall.addColorStop(0, p.wallTop);
    wall.addColorStop(1, p.wallBottom);
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, h);

    paintWallpaper(ctx, w, h, p);

    /* The lamp's warmth on the wall, under the window so the window's own
       light reads as cooler. */
    const lamp = lampOf(w, h);
    const glow = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, Math.max(w, h) * 0.55);
    glow.addColorStop(0, p.glow);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    /* On a phone the note is the width of the wall, and a window half behind it
       is clutter round the one thing being read. */
    if (w >= WINDOW_MIN_WIDTH) paintWindow(ctx, w, h, p, p.night);

    /* The corners fall off, so the light reads as a lamp's and the eye lands
       on the middle of the desk rather than on the panel's edge. */
    const v = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.35, w / 2, h * 0.45, Math.max(w, h) * 0.85);
    v.addColorStop(0, 'rgba(0, 0, 0, 0)');
    v.addColorStop(1, p.vignette);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  },

  live(ctx, w, h, seconds, p) {
    const win = windowOf(w, h);

    if (w >= WINDOW_MIN_WIDTH) paintSky(ctx, win, seconds, p);
    paintMotes(ctx, w, h, seconds, p);
  },
};

/** The narrowest panel that gets a window; see `still`. */
const WINDOW_MIN_WIDTH = 520;

/** What moves behind the glass: stars by night, clouds by day. */
function paintSky(ctx: CanvasRenderingContext2D, win: ReturnType<typeof windowOf>, seconds: number, p: Room) {
  ctx.save();
  ctx.beginPath();
  for (const pane of win.panes) ctx.rect(pane.x, pane.y, pane.w, pane.h);
  ctx.clip();
  if (p.night) {
    /* Stars, each on its own phase, so the window is never all lit or all
       dark at once. */
    ctx.fillStyle = p.speck;
    for (let i = 0; i < WORD_MOTION.stars; i++) {
      const pane = win.panes[i % 4];
      const sx = pane.x + noise(i * 9 + 1) * pane.w;
      const sy = pane.y + noise(i * 9 + 2) * pane.h;
      const phase = (seconds / WORD_MOTION.twinklePeriod + noise(i * 9 + 3)) * TAU;
      ctx.globalAlpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(phase));
      const r = 0.6 + noise(i * 9 + 4) * 0.9;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, TAU);
      ctx.fill();
    }
  } else {
    /* Two clouds crossing, wrapping round the glass. */
    ctx.fillStyle = p.speck;
    ctx.globalAlpha = 0.9;
    const span = win.inner.w + 60;
    for (let i = 0; i < 2; i++) {
      const cx = win.inner.x - 30 + ((seconds * WORD_MOTION.cloudDrift * (1 + i * 0.4) + i * span * 0.55) % span);
      const cy = win.inner.y + win.inner.h * (0.3 + i * 0.38);
      const s = win.inner.w * (0.16 - i * 0.03);
      ctx.beginPath();
      ctx.ellipse(cx, cy, s * 1.6, s * 0.55, 0, 0, TAU);
      ctx.ellipse(cx - s * 0.5, cy - s * 0.3, s * 0.7, s * 0.6, 0, 0, TAU);
      ctx.ellipse(cx + s * 0.45, cy - s * 0.4, s * 0.85, s * 0.7, 0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/**
 * Dust turning in the lamp light. Each mote rises, sways and wraps; the band
 * is the wall's, because below it the desk is in front.
 */
function paintMotes(ctx: CanvasRenderingContext2D, w: number, h: number, seconds: number, p: Room) {
  const lamp = lampOf(w, h);
  const band = h * 0.62;
  ctx.fillStyle = p.mote;
  for (let i = 0; i < WORD_MOTION.motes; i++) {
    const spread = w * 0.42;
    const baseX = lamp.x + (noise(i * 5 + 11) - 0.35) * spread;
    const rise = WORD_MOTION.moteRise * (0.5 + noise(i * 5 + 12));
    const y = band - ((noise(i * 5 + 13) * band + seconds * rise) % band);
    const sway = Math.sin((seconds / WORD_MOTION.moteSwayPeriod + noise(i * 5 + 14)) * TAU);
    const x = baseX + sway * WORD_MOTION.moteSway;
    /* Brightest near the lamp, gone at the band's edges. */
    const near = 1 - Math.min(1, Math.hypot(x - lamp.x, y - lamp.y) / (w * 0.5));
    const edge = Math.min(1, y / 40, (band - y) / 40);
    ctx.globalAlpha = Math.max(0, near * edge * (0.5 + 0.5 * Math.sin(seconds * 1.3 + i)));
    ctx.beginPath();
    ctx.arc(x, y, 0.7 + noise(i * 5 + 15) * 1.2, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* ── the wood ─────────────────────────────────────────────────────────────── */

const GRAIN = new Map<string, string>();

/**
 * A strip of wood grain as a data URL, in `scene.grain` over transparency, for
 * the desk, the shelf and the rack to lay over their own gradients.
 *
 * Generated rather than shipped: it is a dozen wavering lines and two knots,
 * and an image file for that would be the only asset this game had to load.
 * Once per palette; the string is what `--wb-grain-img` carries.
 */
export function grainUrl(p: WordScene): string {
  const hit = GRAIN.get(p.grain);
  if (hit) return hit;
  if (typeof document === 'undefined') return 'none';
  const w = 420;
  const h = 120;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return 'none';
  ctx.strokeStyle = p.grain;
  ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const y0 = (i / 26) * h + noise(i + 40) * 4;
    ctx.globalAlpha = 0.35 + noise(i + 41) * 0.65;
    ctx.lineWidth = 0.6 + noise(i + 42) * 1.4;
    ctx.beginPath();
    /* The ends meet the same height so the strip tiles left to right. */
    for (let x = 0; x <= w; x += 6) {
      const y =
        y0 +
        Math.sin((x / w) * TAU * 2 + noise(i + 43) * TAU) * 2.2 +
        Math.sin((x / w) * TAU * 5 + i) * 0.7;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  /* Two knots, the grain bending round them. */
  ctx.globalAlpha = 0.5;
  for (const [kx, ky] of [
    [w * 0.3, h * 0.55],
    [w * 0.78, h * 0.25],
  ]) {
    for (let k = 0; k < 4; k++) {
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(kx, ky, 4 + k * 4, 1.6 + k * 1.7, 0, 0, TAU);
      ctx.stroke();
    }
  }
  const url = `url(${c.toDataURL('image/png')})`;
  GRAIN.set(p.grain, url);
  return url;
}

/* ── into the page ────────────────────────────────────────────────────────── */

type Room = WordScene & { night: boolean };

/**
 * The palette the painter is handed, one stable object per theme — the
 * diorama repaints its still whenever this identity changes, so it must change
 * on a theme switch and on nothing else.
 */
export const DESK_PALETTE: Record<ThemeName, Room> = {
  dark: { ...WORD_SCENE.dark, night: true },
  light: { ...WORD_SCENE.light, night: false },
};

/* `--wb-*` per palette field, built once per theme rather than per render. */
const STYLE = new Map<ThemeName, CSSProperties>();

/**
 * The palette as custom properties, for `style` on the round and on the
 * catalogue's preview — the only route a scene colour has into the sheet.
 * `--wb-grain-img` rides along: the wood's texture is generated from the same
 * palette, and a property is the only way a generated image reaches a rule.
 */
export function wordSceneStyle(theme: ThemeName): CSSProperties {
  let style = STYLE.get(theme);
  if (!style) {
    const scene = WORD_SCENE[theme];
    const vars: Record<string, string> = {};
    for (const [key, value] of Object.entries(scene)) {
      vars[`--wb-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`] = value;
    }
    vars['--wb-grain-img'] = grainUrl(scene);
    style = vars as CSSProperties;
    STYLE.set(theme, style);
  }
  return style;
}
