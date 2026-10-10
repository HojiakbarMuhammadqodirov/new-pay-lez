import type { CSSProperties } from 'react';
import { drawPico } from '../../pico';
import type { ThemeName } from '../../theme/context';
import type { DioramaPainter } from '../diorama';
import { MEMORY_MOTION, MEMORY_SCENE, MEMORY_TRELLIS, type MemoryScene } from './config';

/**
 * The card room, painted, and the two images the table is dressed with.
 *
 * As in Word Builder's study, only scenery is painted: the wall, its lattice,
 * the lamplight and the dust in it. The table, its baize and every card are
 * DOM (`MemoryMatch.tsx`, `.mm-*` in `site.css`), because a grid of buttons
 * has to be a grid of buttons — focusable, labelled, laid out by the sheet.
 */

const TAU = Math.PI * 2;

function noise(i: number): number {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Where the lamp hangs: over the middle of the table, above the panel. */
function lampOf(w: number) {
  return { x: w * 0.5, y: -40 };
}

export const TABLE_ROOM: DioramaPainter<MemoryScene> = {
  still(ctx, w, h, p) {
    const wall = ctx.createLinearGradient(0, 0, 0, h);
    wall.addColorStop(0, p.wallTop);
    wall.addColorStop(1, p.wallBottom);
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, h);

    /* A lattice of diagonals both ways — the pattern printed on the card backs,
       blown up into wallpaper, so the room and the deck are one design. */
    const pitch = MEMORY_TRELLIS.pitch;
    ctx.strokeStyle = p.trellis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -h; x < w + h; x += pitch) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
      ctx.moveTo(x + h, 0);
      ctx.lineTo(x, h);
    }
    ctx.stroke();
    /* A dot where the lines cross, every other crossing. */
    ctx.fillStyle = p.trellis;
    for (let y = 0, r = 0; y < h + pitch; y += pitch / 2, r++) {
      for (let x = (r % 2) * (pitch / 2); x < w + pitch; x += pitch) {
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, TAU);
        ctx.fill();
      }
    }

    const lamp = lampOf(w);
    const glow = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, Math.max(w, h) * 0.75);
    glow.addColorStop(0, p.glow);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);


    const v = ctx.createRadialGradient(w / 2, h * 0.42, Math.min(w, h) * 0.3, w / 2, h * 0.42, Math.max(w, h) * 0.8);
    v.addColorStop(0, 'rgba(0, 0, 0, 0)');
    v.addColorStop(1, p.vignette);
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  },

  live(ctx, w, h, seconds, p) {
    /* Dust falling slowly through the lamp's cone and turning — only ever
       seen against the wall either side of the table, which is where a player
       looking at the cards would catch it moving. */
    const lamp = lampOf(w);
    ctx.fillStyle = p.mote;
    for (let i = 0; i < MEMORY_MOTION.motes; i++) {
      const rise = MEMORY_MOTION.moteRise * (0.5 + noise(i * 7 + 2));
      const y = h - ((noise(i * 7 + 3) * h + seconds * rise) % h);
      const sway = Math.sin((seconds / MEMORY_MOTION.moteSwayPeriod + noise(i * 7 + 4)) * TAU);
      const x = noise(i * 7 + 1) * w + sway * MEMORY_MOTION.moteSway;
      const near = 1 - Math.min(1, Math.abs(x - lamp.x) / (w * 0.6));
      const edge = Math.min(1, y / 50, (h - y) / 50);
      ctx.globalAlpha = Math.max(0, near * edge * (0.45 + 0.55 * Math.sin(seconds * 1.1 + i * 1.7)));
      ctx.beginPath();
      ctx.arc(x, y, 0.7 + noise(i * 7 + 5) * 1.1, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
};

/* ── generated images ─────────────────────────────────────────────────────── */

/**
 * Pico's front-facing badge as a data URL, for the middle of every card back.
 *
 * One image drawn once, at 192px — enough for a medallion of about 45px at a
 * phone's 3× — rather than a `<Pico>` per card: twelve cards on the board and
 * six in the catalogue's preview would be eighteen canvases holding the same
 * picture. It is the real bird — `drawPico`
 * with `pose: 'badge'`, the module's own icon pose — so a new drawing of Pico
 * reaches the deck without anything here changing.
 */
let badge: string | null = null;

export function picoBadgeUrl(): string {
  if (badge) return badge;
  if (typeof document === 'undefined') return 'none';
  const side = 192;
  const c = document.createElement('canvas');
  c.width = side;
  c.height = side;
  const ctx = c.getContext('2d');
  if (!ctx) return 'none';
  drawPico(ctx, { x: side / 2, y: side / 2, size: side, pose: 'badge' });
  badge = `url(${c.toDataURL('image/png')})`;
  return badge;
}

const NAP = new Map<string, string>();

/**
 * Baize, as a tile of specks: darker and lighter fibres at random over
 * transparency, for the felt to lay over its own gradient. Once per palette.
 */
function napUrl(p: MemoryScene): string {
  const key = p.nap + p.napLight;
  const hit = NAP.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return 'none';
  const side = 160;
  const c = document.createElement('canvas');
  c.width = side;
  c.height = side;
  const ctx = c.getContext('2d');
  if (!ctx) return 'none';
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = i % 3 === 0 ? p.napLight : p.nap;
    const x = noise(i * 3 + 1) * side;
    const y = noise(i * 3 + 2) * side;
    /* Fibres, not dots: a short stroke at a random angle. */
    const a = noise(i * 3 + 3) * TAU;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillRect(0, 0, 1.6, 0.7);
    ctx.restore();
  }
  const url = `url(${c.toDataURL('image/png')})`;
  NAP.set(key, url);
  return url;
}

/* ── into the page ────────────────────────────────────────────────────────── */

/** The painter's palette per theme, stable so the still repaints only on a switch. */
export const TABLE_PALETTE: Record<ThemeName, MemoryScene> = MEMORY_SCENE;

const STYLE = new Map<ThemeName, CSSProperties>();

/**
 * The palette as `--mm-*` custom properties, plus the two generated images —
 * the baize's nap and Pico's badge — which a property is the only way to hand
 * a rule. On the round and on the catalogue's preview, so the miniature is
 * dealt from the same deck.
 */
export function tableSceneStyle(theme: ThemeName): CSSProperties {
  let style = STYLE.get(theme);
  if (!style) {
    const scene = MEMORY_SCENE[theme];
    const vars: Record<string, string> = {};
    for (const [key, value] of Object.entries(scene)) {
      vars[`--mm-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`] = value;
    }
    vars['--mm-nap-img'] = napUrl(scene);
    vars['--mm-badge-img'] = picoBadgeUrl();
    style = vars as CSSProperties;
    STYLE.set(theme, style);
  }
  return style;
}
