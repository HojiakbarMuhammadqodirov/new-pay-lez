import { drawPico, picoBlinkAt, type DrawPicoOptions, type PicoPose } from '../../pico';
import { GRAVITY, RADIUS, positionAt, type Flyer } from '../ninjaField';
import { FOOD_BODY, FOOD_CUT, NINJA, NINJA_PALETTES, type NinjaPalette, type NinjaTheme } from './config';

/**
 * Pico Ninja — the picture of a Food Ninja round.
 *
 * A dojo's veranda at night, looking out over a market town: a moon over the
 * hills, a pagoda, roofs with lit windows, paper lanterns strung from the beam,
 * a shoji panel glowing at the left, blossom in the eaves. Pico stands on the
 * boards in the corner with a headband and a sword on his back; the foods are
 * thrown up past him, and a cut splits one into two halves with its juice
 * flying and a stain left behind.
 *
 * **It decides nothing.** `FoodNinja.tsx` keeps the schedule, the clock, the
 * cut and the reports exactly as they were — and `ninjaField.ts`, the server's
 * flight paths, is read here (`positionAt`) and nowhere changed. What this
 * reads each frame is the rules' own refs: the flyers, the set sliced, the
 * list of halves the cut pushes (which is how it notices a cut, without the
 * cut having to tell it), and the blade's trail.
 *
 * Painting is split by how often things change:
 *
 * - **the view** — sky, moon, hills, town, the veranda's timber and paper — is
 *   drawn once per size and theme into an offscreen canvas;
 * - **each food** is one cached sprite at the current size, cut in half at
 *   draw time by a clip along the blade's line;
 * - and **per frame** only what moves: lanterns, bokeh, embers or petals, Pico,
 *   the foods, the halves, the juice, the blade.
 *
 * Particles live in typed arrays and glows are pre-tinted sprites, so a frame
 * allocates nothing worth naming.
 */

type Ctx = CanvasRenderingContext2D;

const TAU = Math.PI * 2;
const MAX_RATIO = 2;
const FOOD_KINDS = 6;

export interface NinjaCut {
  flyer: Flyer;
  at: number;
  x: number;
  y: number;
}

/** What the scene reads from the round each frame. Nothing here is written. */
export interface NinjaView {
  flyers: readonly Flyer[];
  sliced: ReadonlySet<number>;
  /** The rules' list of halves — read only to notice a cut as it lands. */
  cuts: readonly NinjaCut[];
  trail: readonly { x: number; y: number; at: number }[];
  /** How long a trail point lives in the rules (their filter), for the fade. */
  trailMs: number;
  /** The round's clock in ms, or a negative number before it starts. */
  ms: number;
  phase: 'ready' | 'starting' | 'playing' | 'over';
}

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const easeOutBack = (t: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};
function hash(n: number): number {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 0xffffffff;
}
function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/* Pools. */
const HALVES = 32;
const DROPS = 320;
const SLASHES = 14;
const TRAIL_CAP = 64;

/** How fast food `id` turns, radians a second — a fixed mix of rates and both directions. */
const spinOf = (id: number) => (id % 2 === 0 ? 1 : -1) * NINJA.spin * (0.7 + hash(id * 3 + 1) * 0.6);

export class NinjaScene {
  private theme: NinjaTheme = 'dark';
  private pal: NinjaPalette = NINJA_PALETTES.dark;
  private reduced = false;
  private font = 'sans-serif';
  private comboText = '{n}';

  private back: HTMLCanvasElement | null = null;
  private builtFor = '';
  private w = 0;
  private h = 0;
  private ratio = 1;
  private R = 0;
  private foods: HTMLCanvasElement[] = [];
  private glow: Record<'lantern' | 'mint' | 'warm' | 'white', HTMLCanvasElement> | null = null;

  /* Cuts already seen, and the stroke they belong to. */
  private readonly seen = new WeakSet<NinjaCut>();
  private strokeCuts = 0;
  private combo = { x: 0, y: 0, t0: -1e9, n: 0 };

  /* Pico. */
  private happyUntil = 0;
  private hopT0 = -1e9;
  private readonly pico: DrawPicoOptions = { x: 0, y: 0, size: 0, anchor: 'body', facing: 1 };

  /* Halves. */
  private readonly hx = new Float32Array(HALVES);
  private readonly hy = new Float32Array(HALVES);
  private readonly hvx = new Float32Array(HALVES);
  private readonly hvy = new Float32Array(HALVES);
  private readonly ha = new Float32Array(HALVES);
  private readonly hrot = new Float32Array(HALVES);
  private readonly ht0 = new Float64Array(HALVES).fill(-1e9);
  private readonly hkind = new Uint8Array(HALVES);
  private half = 0;
  /* Juice. */
  private readonly dx = new Float32Array(DROPS);
  private readonly dy = new Float32Array(DROPS);
  private readonly dvx = new Float32Array(DROPS);
  private readonly dvy = new Float32Array(DROPS);
  private readonly dsize = new Float32Array(DROPS);
  private readonly dlife = new Float32Array(DROPS);
  private readonly dt0 = new Float64Array(DROPS).fill(-1e9);
  private readonly dkind = new Uint8Array(DROPS);
  private readonly dcol = new Uint8Array(DROPS);
  private drop = 0;
  /* The flash of each cut. */
  private readonly sx = new Float32Array(SLASHES);
  private readonly sy = new Float32Array(SLASHES);
  private readonly srot = new Float32Array(SLASHES);
  private readonly sscale = new Float32Array(SLASHES);
  private readonly st0 = new Float64Array(SLASHES).fill(-1e9);
  private slash = 0;
  /* The blade, smoothed into a ribbon. */
  private readonly tx = new Float32Array(TRAIL_CAP);
  private readonly ty = new Float32Array(TRAIL_CAP);
  private readonly tw = new Float32Array(TRAIL_CAP);

  setTheme(theme: NinjaTheme): void {
    this.theme = theme;
    this.pal = NINJA_PALETTES[theme];
  }

  setReduced(reduced: boolean): void {
    this.reduced = reduced;
  }

  /**
   * Which corner Pico stands in: `1` the left, facing into the field (the
   * round), `-1` the right, facing back (a card's miniature, whose lower left
   * is where the card sets its name).
   */
  private side: 1 | -1 = 1;

  setSide(side: 1 | -1): void {
    this.side = side;
  }

  setText(font: string, combo: string): void {
    this.font = font || 'sans-serif';
    this.comboText = combo;
  }

  paint(canvas: HTMLCanvasElement, view: NinjaView, now: number): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!(w > 0 && h > 0)) return;
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO);
    const bw = Math.round(w * ratio);
    const bh = Math.round(h * ratio);
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    this.render(ctx, w, h, ratio, view, now);
  }

  /**
   * One frame into a context whose backing store is `w × h` CSS pixels at
   * `ratio` — the round's canvas through `paint`, or a catalogue card's
   * miniature directly.
   */
  render(ctx: Ctx, w: number, h: number, ratio: number, view: NinjaView, now: number): void {
    const key = `${w}x${h}@${ratio}:${this.theme}`;
    if (key !== this.builtFor) {
      this.w = w;
      this.h = h;
      this.ratio = ratio;
      this.build();
      this.builtFor = key;
    }
    const t = this.reduced ? 0 : now / 1000;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.back!, 0, 0);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    this.notice(view, now);
    this.stars(ctx, t);
    this.bokeh(ctx, t);
    this.lanterns(ctx, t);
    this.drift(ctx, t);
    this.picoNinja(ctx, now, t);
    if (view.ms >= 0 && view.phase !== 'ready' && view.phase !== 'starting') this.flying(ctx, view);
    this.halves(ctx, now);
    this.juice(ctx, now);
    this.slashes(ctx, now);
    this.blade(ctx, view, now);
    this.floater(ctx, now);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ── what the rules just did ─────────────────────────────────────────── */

  /** Find cuts not seen yet: split them, splash them, and count the stroke. */
  private notice(view: NinjaView, now: number): void {
    if (view.trail.length === 0) this.strokeCuts = 0;
    let fresh = 0;
    let lx = 0;
    let ly = 0;
    for (const cut of view.cuts) {
      if (this.seen.has(cut)) continue;
      this.seen.add(cut);
      fresh += 1;
      lx = cut.x;
      ly = cut.y;
      /* The blade's line at the cut: its last stroke. */
      const n = view.trail.length;
      const angle =
        n >= 2
          ? Math.atan2(view.trail[n - 1].y - view.trail[n - 2].y, view.trail[n - 1].x - view.trail[n - 2].x)
          : hash(cut.flyer.id) * Math.PI;
      this.split(cut, angle, view.ms, now);
    }
    if (fresh === 0) return;
    this.happyUntil = now + NINJA.pico.happyMs;
    if (now - this.hopT0 > NINJA.pico.hopMs) this.hopT0 = now;
    this.strokeCuts += fresh;
    if (this.strokeCuts >= NINJA.comboAt) {
      const c = this.combo;
      if (now - c.t0 > NINJA.comboMs || c.n === 0 || this.strokeCuts < c.n) {
        c.x = lx;
        c.y = ly;
      }
      c.n = this.strokeCuts;
      c.t0 = now;
    }
  }

  private split(cut: NinjaCut, angle: number, ms: number, now: number): void {
    const { w, h } = this;
    const f = cut.flyer;
    const kind = f.kind % FOOD_KINDS;
    const s = Math.max(0, (ms - f.t) / 1000);
    /* The food's own velocity, in px/s, so the halves carry on along its arc. */
    const vx = f.vx * w;
    const vy = -(f.vy - GRAVITY * s) * h;
    const rot = s * spinOf(f.id) + f.id;
    for (let side = 0; side < 2; side += 1) {
      const j = this.half;
      this.half = (j + 1) % HALVES;
      this.hx[j] = cut.x;
      this.hy[j] = cut.y;
      this.hvx[j] = vx * 0.6;
      this.hvy[j] = vy * 0.6;
      this.ha[j] = angle;
      this.hrot[j] = rot;
      this.ht0[j] = now;
      this.hkind[j] = kind + (side === 0 ? 0 : 8);
    }
    if (this.reduced) return;
    /* Juice: mostly out to either side of the blade, some along it. */
    const J = NINJA.juice;
    const palette = FOOD_CUT[kind].juice;
    for (let i = 0; i < J.drops; i += 1) {
      const j = this.drop;
      this.drop = (j + 1) % DROPS;
      const side = i % 2 === 0 ? 1 : -1;
      const a = angle + side * (Math.PI / 2) + (Math.random() - 0.5) * 1.6;
      const v = (0.25 + Math.random() * 0.75) * J.speed * w;
      this.dx[j] = cut.x;
      this.dy[j] = cut.y;
      this.dvx[j] = Math.cos(a) * v + vx * 0.3;
      this.dvy[j] = Math.sin(a) * v + vy * 0.3 - 0.15 * w;
      this.dsize[j] = (0.4 + Math.random() * 0.8) * J.size * w;
      this.dlife[j] = J.ms * (0.6 + Math.random() * 0.6);
      this.dt0[j] = now;
      this.dkind[j] = kind;
      this.dcol[j] = Math.floor(Math.random() * palette.length);
    }
    /* The flash along the cut. */
    const j = this.slash;
    this.slash = (j + 1) % SLASHES;
    this.sx[j] = cut.x;
    this.sy[j] = cut.y;
    this.srot[j] = angle;
    this.sscale[j] = 0.9 + Math.random() * 0.3;
    this.st0[j] = now;
  }

  /* ── foods ───────────────────────────────────────────────────────────── */

  private flying(ctx: Ctx, view: NinjaView): void {
    const { w, h } = this;
    for (const flyer of view.flyers) {
      if (view.sliced.has(flyer.id)) continue;
      const at = positionAt(flyer, view.ms);
      if (!at) continue;
      const rot = ((view.ms - flyer.t) / 1000) * spinOf(flyer.id) + flyer.id;
      this.food(ctx, flyer.kind % FOOD_KINDS, at.x * w, h - at.y * h, rot, 1);
    }
  }

  private food(ctx: Ctx, kind: number, x: number, y: number, rot: number, scale: number): void {
    const sprite = this.foods[kind];
    if (!sprite) return;
    const sw = (sprite.width / this.ratio) * scale;
    const sh = (sprite.height / this.ratio) * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.drawImage(sprite, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  }

  /** The two halves of each cut: parted along the blade, tumbling, falling, fading. */
  private halves(ctx: Ctx, now: number): void {
    const R = this.R;
    const H = NINJA.halves;
    const g = GRAVITY * this.h;
    for (let i = 0; i < HALVES; i += 1) {
      const age = (now - this.ht0[i]) / 1000;
      if (age < 0 || age * 1000 >= H.ms) continue;
      const kind = this.hkind[i] & 7;
      const side = this.hkind[i] & 8 ? 1 : -1;
      const a = this.ha[i];
      const nx = -Math.sin(a);
      const ny = Math.cos(a);
      const part = H.part * this.w * (this.reduced ? 0.4 : 1);
      const x = this.hx[i] + this.hvx[i] * age + nx * side * part * age;
      const y = this.hy[i] + this.hvy[i] * age + 0.5 * g * age * age + ny * side * part * age;
      const tumble = this.reduced ? 0 : side * H.spin * age;
      ctx.save();
      ctx.globalAlpha = 1 - clamp01((age * 1000 - H.ms * 0.65) / (H.ms * 0.35));
      ctx.translate(x, y);
      ctx.rotate(a + tumble);
      /* Keep only this side of the blade's line. */
      ctx.beginPath();
      ctx.rect(-R * 1.6, side < 0 ? -R * 1.6 : 0, R * 3.2, R * 1.6);
      ctx.clip();
      const sprite = this.foods[kind];
      ctx.rotate(this.hrot[i] - a);
      const sw = sprite.width / this.ratio;
      const sh = sprite.height / this.ratio;
      ctx.drawImage(sprite, -sw / 2, -sh / 2, sw, sh);
      ctx.rotate(a - this.hrot[i]);
      /* The cut face. */
      const cut = FOOD_CUT[kind];
      ctx.fillStyle = cut.skin;
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 0.86, R * 0.22, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = cut.flesh;
      ctx.beginPath();
      ctx.ellipse(0, side * R * 0.015, R * 0.78, R * 0.17, 0, 0, TAU);
      ctx.fill();
      this.face(ctx, kind, R, side);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** What a cut shows of each food: seeds, layers, holes, sauce, a ring, a core. */
  private face(ctx: Ctx, kind: number, R: number, side: number): void {
    const cut = FOOD_CUT[kind];
    const y = side * R * 0.02;
    ctx.fillStyle = cut.core;
    ctx.strokeStyle = cut.core;
    if (kind === 0) {
      for (const sx of [-0.14, 0.14]) {
        ctx.beginPath();
        ctx.ellipse(sx * R, y, R * 0.06, R * 0.035, sx > 0 ? 0.4 : -0.4, 0, TAU);
        ctx.fill();
      }
    } else if (kind === 1) {
      ctx.lineWidth = Math.max(1, R * 0.03);
      for (let i = -2; i <= 2; i += 1) {
        ctx.beginPath();
        ctx.ellipse(i * R * 0.24, y, R * 0.1, R * 0.07, 0, 0, Math.PI);
        ctx.stroke();
      }
    } else if (kind === 2) {
      for (const [hx, r] of [
        [-0.42, 0.06],
        [0.05, 0.08],
        [0.45, 0.05],
      ] as const) {
        ctx.beginPath();
        ctx.ellipse(hx * R, y, r * R, r * R * 0.5, 0, 0, TAU);
        ctx.fill();
      }
    } else if (kind === 3) {
      ctx.fillRect(-R * 0.72, y - R * 0.025, R * 1.44, R * 0.05);
    } else if (kind === 4) {
      ctx.fillStyle = this.pal.shadow;
      ctx.beginPath();
      ctx.ellipse(0, y, R * 0.22, R * 0.11, 0, 0, TAU);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(0, y, R * 0.36, R * 0.09, 0, 0, TAU);
      ctx.fill();
    }
  }

  private juice(ctx: Ctx, now: number): void {
    const g = 1.5 * this.h;
    for (let i = 0; i < DROPS; i += 1) {
      const age = (now - this.dt0[i]) / 1000;
      const life = this.dlife[i] / 1000;
      if (age < 0 || age >= life) continue;
      const f = age / life;
      const x = this.dx[i] + this.dvx[i] * age;
      const y = this.dy[i] + this.dvy[i] * age + 0.5 * g * age * age;
      ctx.globalAlpha = 1 - f * f;
      ctx.fillStyle = FOOD_CUT[this.dkind[i]].juice[this.dcol[i]];
      const r = this.dsize[i] * (1 - f * 0.4);
      if (this.dkind[i] === 4) {
        /* Sprinkles are little rods, tumbling. */
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(i + age * 9);
        ctx.fillRect(-r, -r * 0.35, r * 2, r * 0.7);
        ctx.restore();
      } else {
        /* A drop, stretched along its flight. */
        const vy = this.dvy[i] + g * age;
        const speed = Math.hypot(this.dvx[i], vy) || 1;
        ctx.beginPath();
        ctx.ellipse(x, y, r * (1 + Math.min(1.2, speed / (this.w * 1.6))), r, Math.atan2(vy, this.dvx[i]), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The flash of the cut itself: a bright streak along the blade's line
   * through the food, drawn over the halves and gone in a sixth of a second.
   *
   * It was a stain first — a splash of juice left where the food was — and the
   * view is open sky: a stain hanging in the air read as dirt on the screen,
   * and a dark-red blot on a night sky as a bruise. The juice is the drops.
   */
  private slashes(ctx: Ctx, now: number): void {
    const pal = this.pal;
    const R = this.R;
    for (let i = 0; i < SLASHES; i += 1) {
      const e = (now - this.st0[i]) / NINJA.slashMs;
      if (e < 0 || e >= 1) continue;
      const reach = R * (this.reduced ? 1.6 : 0.9 + 1.1 * (1 - (1 - e) ** 3)) * this.sscale[i];
      const fade = (1 - e) * (1 - e);
      const a = this.srot[i];
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const x = this.sx[i];
      const y = this.sy[i];
      for (const [colour, width, alpha] of [
        [pal.bladeGlow, 0.42, pal.additive ? 0.65 : 0.4],
        [pal.slash, 0.13, 1],
      ] as const) {
        if (pal.additive) ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha * fade;
        ctx.fillStyle = colour === pal.slash && !pal.additive ? pal.bladeCore : colour;
        const half = width * R * (1 - e * 0.5);
        ctx.beginPath();
        ctx.moveTo(x - ux * reach, y - uy * reach);
        ctx.quadraticCurveTo(x - uy * half, y + ux * half, x + ux * reach, y + uy * reach);
        ctx.quadraticCurveTo(x + uy * half, y - ux * half, x - ux * reach, y - uy * reach);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ── the blade ───────────────────────────────────────────────────────── */

  /**
   * The trail as one tapered ribbon — thin and fading at its tail, full at the
   * blade's tip — drawn twice: a wide soft glow, then a bright core.
   */
  private blade(ctx: Ctx, view: NinjaView, now: number): void {
    const trail = view.trail;
    const start = Math.max(0, trail.length - TRAIL_CAP);
    const n = trail.length - start;
    if (n < 2) return;
    for (let i = 0; i < n; i += 1) {
      const p = trail[start + i];
      this.tx[i] = p.x;
      this.ty[i] = p.y;
      const life = 1 - clamp01((now - p.at) / view.trailMs);
      this.tw[i] = life * (0.15 + 0.85 * (i / (n - 1)));
    }
    const pal = this.pal;
    const W = this.w;
    if (pal.additive) ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = pal.additive ? 0.5 : 0.32;
    ctx.fillStyle = pal.bladeGlow;
    this.ribbon(ctx, n, NINJA.blade.glow * W);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = pal.bladeCore;
    this.ribbon(ctx, n, NINJA.blade.core * W);
    ctx.globalAlpha = 1;
  }

  private ribbon(ctx: Ctx, n: number, width: number): void {
    const { tx, ty, tw } = this;
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      let nx = -(ty[b] - ty[a]);
      let ny = tx[b] - tx[a];
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      const half = (tw[i] * width) / 2;
      if (i === 0) ctx.moveTo(tx[i] + nx * half, ty[i] + ny * half);
      else ctx.lineTo(tx[i] + nx * half, ty[i] + ny * half);
    }
    for (let i = n - 1; i >= 0; i -= 1) {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      let nx = -(ty[b] - ty[a]);
      let ny = tx[b] - tx[a];
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      const half = (tw[i] * width) / 2;
      ctx.lineTo(tx[i] - nx * half, ty[i] - ny * half);
    }
    ctx.closePath();
    ctx.fill();
    /* A round tip where the blade is now. */
    const r = (tw[n - 1] * width) / 2;
    if (r > 0.3) {
      ctx.beginPath();
      ctx.arc(tx[n - 1], ty[n - 1], r, 0, TAU);
      ctx.fill();
    }
  }

  private floater(ctx: Ctx, now: number): void {
    const c = this.combo;
    const e = (now - c.t0) / NINJA.comboMs;
    if (e < 0 || e >= 1 || c.n < NINJA.comboAt) return;
    const W = this.w;
    const pop = this.reduced ? 1 : easeOutBack(clamp01(e / 0.18));
    const size = 0.066 * W * pop;
    if (size < 1) return;
    const text = this.comboText.replace('{n}', String(c.n));
    ctx.font = `800 ${Math.round(size)}px ${this.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const half = ctx.measureText(text).width / 2 + size * 0.3;
    const x = Math.min(Math.max(c.x, half), W - half);
    const y = Math.max(size * 1.4, c.y - this.R * 1.8 - (this.reduced ? 0 : e * 0.05 * W));
    ctx.globalAlpha = e > 0.7 ? 1 - (e - 0.7) / 0.3 : 1;
    ctx.strokeStyle = this.pal.floaterEdge;
    ctx.lineWidth = Math.max(2, size * 0.2);
    ctx.strokeText(text, x, y);
    ctx.fillStyle = this.pal.plate;
    ctx.fillText(text, x, y);
    ctx.globalAlpha = 1;
  }

  /* ── Pico, the ninja ─────────────────────────────────────────────────── */

  private picoNinja(ctx: Ctx, now: number, t: number): void {
    const P = NINJA.pico;
    /* Never under `minPx` in a round; a card's short band caps him by its height instead. */
    const size = Math.min(Math.max(P.minPx, Math.min(P.maxPx, P.size * this.w)), this.h * 0.62);
    const s = size / 100;
    const foot = NINJA.deck * this.h;
    const hop = clamp01((now - this.hopT0) / P.hopMs);
    const lift = this.reduced || hop >= 1 ? 0 : Math.sin(Math.PI * hop);
    const x = (this.side === 1 ? P.x : 1 - P.x) * this.w;
    const y = foot - 30 * s - 1 - lift * P.hop * this.w;
    const happy = now < this.happyUntil;
    const pose: PicoPose = lift > 0.05 ? 'happy' : happy ? 'happy' : 'idle';
    const tilt = -0.12 * lift;

    /* His shadow on the boards. */
    ctx.globalAlpha = 1 - lift * 0.5;
    ctx.fillStyle = this.pal.shadow;
    ctx.beginPath();
    ctx.ellipse(x, foot + 1, size * 0.26 * (1 - lift * 0.3), size * 0.05, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    /* Behind him: the sword on his back. */
    this.inPicoSpace(ctx, x, y, size, tilt, () => this.sword(ctx));
    const o = this.pico;
    o.x = x;
    o.y = y;
    o.size = size;
    o.pose = pose;
    o.tilt = tilt;
    o.facing = this.side;
    o.blink = pose === 'idle' ? picoBlinkAt(t) : 0;
    drawPico(ctx, o);
    /* Over him: the headband's tails streaming back across his shoulders,
       then the band, its knot and its plate. Over rather than behind, because
       behind they vanish into the crest and the band stops reading as tied. */
    this.inPicoSpace(ctx, x, y, size, tilt, () => {
      this.tails(ctx, t, happy || lift > 0);
      this.band(ctx);
    });
  }

  /**
   * Runs `draw` in Pico's 100-unit design box, placed exactly as `drawPico`
   * places him (body anchor, turned by `tilt` about the body, mirrored when he
   * faces left), so his kit sits on him whatever he is doing.
   */
  private inPicoSpace(ctx: Ctx, x: number, y: number, size: number, tilt: number, draw: () => void): void {
    const k = size / 100;
    ctx.save();
    ctx.translate(x, y - 6 * k);
    ctx.scale(k, k);
    ctx.translate(0, 6);
    if (tilt) ctx.rotate(this.side === 1 ? tilt : -tilt);
    if (this.side === -1) ctx.scale(-1, 1);
    ctx.translate(-50, -56);
    draw();
    ctx.restore();
  }

  /** A sword across his back: the hilt over his shoulder, the scabbard down past his tail. */
  private sword(ctx: Ctx): void {
    const pal = this.pal;
    const ux = -0.42;
    const uy = 0.91;
    const px = -uy;
    const py = ux;
    const at = (d: number, side: number) => [42 + ux * d + px * side, 2 + uy * d + py * side] as const;
    /* Scabbard. */
    ctx.fillStyle = pal.sheath;
    ctx.beginPath();
    let p = at(16, -2.6);
    ctx.moveTo(p[0], p[1]);
    p = at(66, -2.2);
    ctx.lineTo(p[0], p[1]);
    p = at(68, 0);
    ctx.lineTo(p[0], p[1]);
    p = at(66, 2.2);
    ctx.lineTo(p[0], p[1]);
    p = at(16, 2.6);
    ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = pal.sheathLit;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    p = at(18, -1.4);
    ctx.moveTo(p[0], p[1]);
    p = at(64, -1.2);
    ctx.lineTo(p[0], p[1]);
    ctx.stroke();
    /* Its gold fittings. */
    ctx.fillStyle = pal.plate;
    for (const d of [19, 62]) {
      ctx.beginPath();
      p = at(d, -2.8);
      ctx.moveTo(p[0], p[1]);
      p = at(d + 2.4, -2.8);
      ctx.lineTo(p[0], p[1]);
      p = at(d + 2.4, 2.8);
      ctx.lineTo(p[0], p[1]);
      p = at(d, 2.8);
      ctx.lineTo(p[0], p[1]);
      ctx.closePath();
      ctx.fill();
    }
    /* The guard. */
    p = at(15, 0);
    ctx.fillStyle = pal.plateLow;
    ctx.beginPath();
    ctx.ellipse(p[0], p[1], 5.2, 1.8, Math.atan2(py, px), 0, TAU);
    ctx.fill();
    ctx.fillStyle = pal.plate;
    ctx.beginPath();
    ctx.ellipse(p[0] - 0.3, p[1] - 0.3, 4.6, 1.4, Math.atan2(py, px), 0, TAU);
    ctx.fill();
    /* The hilt, wrapped. */
    ctx.fillStyle = pal.hilt;
    ctx.beginPath();
    p = at(0, -2.2);
    ctx.moveTo(p[0], p[1]);
    p = at(14, -2.4);
    ctx.lineTo(p[0], p[1]);
    p = at(14, 2.4);
    ctx.lineTo(p[0], p[1]);
    p = at(0, 2.2);
    ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = pal.hiltWrap;
    ctx.lineWidth = 0.9;
    for (let d = 2; d < 13; d += 3) {
      ctx.beginPath();
      p = at(d, -2.1);
      ctx.moveTo(p[0], p[1]);
      p = at(d + 1.6, 2.1);
      ctx.lineTo(p[0], p[1]);
      p = at(d + 3.2, -2.1);
      ctx.lineTo(p[0], p[1]);
      ctx.stroke();
    }
    p = at(-0.6, 0);
    ctx.fillStyle = pal.plate;
    ctx.beginPath();
    ctx.arc(p[0], p[1], 2.3, 0, TAU);
    ctx.fill();
  }

  /** The headband's two tails, streaming back from the knot and fluttering. */
  private tails(ctx: Ctx, t: number, fast: boolean): void {
    const pal = this.pal;
    const kx = 40.5;
    const ky = 27.5;
    const rate = fast ? 16 : 6;
    for (let i = 1; i >= 0; i -= 1) {
      const len = i === 0 ? 34 : 27;
      const drop = i === 0 ? 4 : 14;
      const ph = t * rate + i * 1.7;
      const w1 = Math.sin(ph) * 3;
      const w2 = Math.sin(ph + 1.4) * (fast ? 6 : 4);
      ctx.fillStyle = i === 0 ? pal.band : pal.bandLit;
      ctx.beginPath();
      ctx.moveTo(kx, ky - 1.8);
      ctx.bezierCurveTo(kx - len * 0.35, ky - 2 + w1, kx - len * 0.7, ky + drop * 0.5 + w2 - 1.5, kx - len, ky + drop + w2);
      ctx.lineTo(kx - len + 1.2, ky + drop + w2 + 3.2);
      ctx.bezierCurveTo(kx - len * 0.7, ky + drop * 0.5 + w2 + 2.5, kx - len * 0.35, ky + 2.2 + w1, kx, ky + 2.4);
      ctx.closePath();
      ctx.fill();
    }
  }

  /** The band round his head, the knot behind, the gold plate on his brow. */
  private band(ctx: Ctx): void {
    const pal = this.pal;
    ctx.save();
    ctx.beginPath();
    ctx.arc(61, 35, 22.6, 0, TAU);
    ctx.clip();
    ctx.translate(61, 25);
    ctx.rotate(-0.16);
    ctx.fillStyle = pal.band;
    ctx.fillRect(-26, -3.6, 52, 7.2);
    ctx.fillStyle = pal.bandLit;
    ctx.fillRect(-26, -3.6, 52, 1.6);
    ctx.restore();
    /* The knot. */
    ctx.fillStyle = pal.band;
    ctx.beginPath();
    ctx.ellipse(40.6, 27.6, 3.2, 3.8, 0.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = pal.bandLit;
    ctx.beginPath();
    ctx.ellipse(40, 26.6, 1.4, 1.6, 0.3, 0, TAU);
    ctx.fill();
    /* The plate. */
    ctx.save();
    ctx.translate(72.5, 22.4);
    ctx.rotate(-0.16);
    ctx.fillStyle = pal.plateLow;
    roundRect(ctx, -5.6, -3.4, 11.2, 6.8, 1.6);
    ctx.fill();
    ctx.fillStyle = pal.plate;
    roundRect(ctx, -5.2, -3.2, 10.4, 6, 1.4);
    ctx.fill();
    /* A leaf engraved on it — Pico's crest, three strokes. */
    ctx.strokeStyle = pal.plateLow;
    ctx.lineWidth = 0.9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-2.2, 1.6);
    ctx.lineTo(0, -1.6);
    ctx.moveTo(0, 1.6);
    ctx.lineTo(0, -2);
    ctx.moveTo(2.2, 1.6);
    ctx.lineTo(0, -1.6);
    ctx.stroke();
    ctx.restore();
  }

  /* ── ambient ─────────────────────────────────────────────────────────── */

  private stars(ctx: Ctx, t: number): void {
    if (this.theme !== 'dark' || this.reduced) return;
    const { w, h } = this;
    ctx.fillStyle = this.pal.star;
    for (let i = 0; i < 10; i += 1) {
      const tw = Math.max(0, Math.sin(t * (1.2 + hash(i + 900)) + i * 2.3));
      if (tw < 0.2) continue;
      const x = (0.12 + hash(i + 910) * 0.76) * w;
      const y = (0.05 + hash(i + 920) * 0.38) * h;
      ctx.globalAlpha = tw * 0.9;
      const r = 0.8 + tw * 1.1;
      ctx.beginPath();
      ctx.moveTo(x - r * 2.2, y);
      ctx.lineTo(x + r * 2.2, y);
      ctx.moveTo(x, y - r * 2.2);
      ctx.lineTo(x, y + r * 2.2);
      ctx.strokeStyle = this.pal.star;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, r * 0.6, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private bokeh(ctx: Ctx, t: number): void {
    if (!this.glow) return;
    const { w, h } = this;
    const pal = this.pal;
    if (pal.additive) ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < NINJA.bokeh; i += 1) {
      const r = (0.03 + hash(i + 500) * 0.05) * w;
      const x = (hash(i + 510) + Math.sin(t * 0.07 + i) * 0.02) * w;
      const y = (0.4 + hash(i + 520) * 0.45 + Math.sin(t * 0.11 + i * 2) * 0.01) * h;
      ctx.globalAlpha = pal.bokehAlpha * (0.6 + 0.4 * Math.sin(t * 0.5 + i * 1.3));
      ctx.drawImage(i % 2 === 0 ? this.glow.warm : this.glow.mint, x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Paper lanterns on a cord along the beam, each on its own slow swing. */
  private lanterns(ctx: Ctx, t: number): void {
    const { w, h } = this;
    const pal = this.pal;
    const n = NINJA.lanterns;
    ctx.strokeStyle = pal.cord;
    ctx.lineWidth = Math.max(1, 0.004 * w);
    ctx.beginPath();
    for (let i = 0; i <= 24; i += 1) {
      const u = i / 24;
      const x = (-0.02 + u * 1.04) * w;
      const y = (0.045 + 0.05 * 4 * u * (1 - u)) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (let i = 0; i < n; i += 1) {
      const u = (i + 0.5) / n;
      const ax = (-0.02 + u * 1.04) * w;
      const ay = (0.045 + 0.05 * 4 * u * (1 - u)) * h;
      const swing = Math.sin(t * (1.1 + hash(i + 40) * 0.5) + i * 1.9) * 0.09;
      const size = (0.026 + (i % 2) * 0.006) * w;
      const drop = size * 0.9;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(swing);
      ctx.strokeStyle = pal.cord;
      ctx.lineWidth = Math.max(1, 0.0025 * w);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, drop - size * 0.2);
      ctx.stroke();
      const cy = drop + size * 0.9;
      if (this.glow && pal.lanternGlowAlpha > 0) {
        if (pal.additive) ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = pal.lanternGlowAlpha * (0.85 + 0.15 * Math.sin(t * 6 + i * 2));
        const g = size * 3.4;
        ctx.drawImage(this.glow.lantern, -g, cy - g, g * 2, g * 2);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
      const body = i % 2 === 0 ? pal.lanternA : pal.lanternB;
      const lg = ctx.createRadialGradient(-size * 0.25, cy - size * 0.3, size * 0.1, 0, cy, size * 1.1);
      lg.addColorStop(0, pal.paperLit);
      lg.addColorStop(0.35, body);
      lg.addColorStop(1, pal.lanternRib);
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.ellipse(0, cy, size * 0.78, size * 0.95, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = pal.lanternRib;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = Math.max(0.8, size * 0.06);
      for (const k of [-0.45, 0, 0.45]) {
        ctx.beginPath();
        ctx.ellipse(0, cy, size * 0.78 * Math.abs(k) + 0.01, size * 0.95, 0, -Math.PI / 2, Math.PI / 2, k < 0);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = pal.lanternCap;
      ctx.fillRect(-size * 0.42, cy - size * 1.05, size * 0.84, size * 0.2);
      ctx.fillRect(-size * 0.42, cy + size * 0.86, size * 0.84, size * 0.2);
      /* The tassel. */
      ctx.strokeStyle = body;
      ctx.lineWidth = Math.max(1, size * 0.1);
      ctx.beginPath();
      ctx.moveTo(0, cy + size * 1.06);
      ctx.lineTo(Math.sin(t * 3 + i) * size * 0.06, cy + size * 1.5);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Embers rising at night, blossom petals falling in the morning. */
  private drift(ctx: Ctx, t: number): void {
    if (this.reduced) return;
    const { w, h } = this;
    const pal = this.pal;
    const night = this.theme === 'dark';
    if (night && pal.additive) ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = pal.drift;
    for (let i = 0; i < NINJA.drift; i += 1) {
      const speed = 0.025 + hash(i + 700) * 0.035;
      const phase = hash(i + 710);
      const u = (phase + t * speed) % 1;
      const y = (night ? 1 - u : u) * h * 1.1 - h * 0.05;
      const x = (hash(i + 720) + Math.sin(t * (0.6 + hash(i + 730)) + i) * 0.03) * w;
      const fade = Math.min(1, u * 6, (1 - u) * 6);
      ctx.globalAlpha = pal.driftAlpha * fade * (night ? 0.5 + 0.5 * Math.sin(t * 5 + i * 3) : 1);
      if (night) {
        ctx.beginPath();
        ctx.arc(x, y, 0.0028 * w, 0, TAU);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * (1 + hash(i + 740)) + i);
        ctx.scale(1, 0.55 + 0.45 * Math.sin(t * 2.3 + i));
        ctx.beginPath();
        ctx.ellipse(0, 0, 0.009 * w, 0.0055 * w, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ── building the view ───────────────────────────────────────────────── */

  private build(): void {
    const { w, h, ratio } = this;
    const pal = this.pal;
    const back = makeCanvas(w * ratio, h * ratio);
    const ctx = back.getContext('2d')!;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    paintView(ctx, w, h, pal, this.theme);
    this.back = back;
    this.R = RADIUS * w;
    this.foods = Array.from({ length: FOOD_KINDS }, (_, kind) => foodSprite(kind, this.R, ratio, pal.shadow));
    this.glow = {
      lantern: glowSprite(pal.lanternGlow),
      mint: glowSprite(pal.bokeh[1]),
      warm: glowSprite(pal.bokeh[0]),
      white: glowSprite('#ffffff'),
    };
  }
}

/* ── the view ──────────────────────────────────────────────────────────── */

function paintView(ctx: Ctx, w: number, h: number, pal: NinjaPalette, theme: NinjaTheme): void {
  const night = theme === 'dark';
  /* Sky. */
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.8);
  sky.addColorStop(0, pal.skyTop);
  sky.addColorStop(0.55, pal.skyMid);
  sky.addColorStop(1, pal.skyLow);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  /* Stars. */
  if (night) {
    ctx.fillStyle = pal.star;
    for (let i = 0; i < NINJA.stars; i += 1) {
      ctx.globalAlpha = 0.25 + hash(i + 100) * 0.6;
      ctx.beginPath();
      ctx.arc(hash(i + 110) * w, hash(i + 120) * h * 0.55, 0.4 + hash(i + 130) * 1.1, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* Moon, or sun. */
  const mx = w * 0.76;
  const my = h * 0.2;
  const mr = Math.min(w * (night ? 0.1 : 0.085), h * 0.13);
  const halo = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4.2);
  halo.addColorStop(0, withAlpha(pal.orbHalo, pal.orbHaloAlpha));
  halo.addColorStop(1, withAlpha(pal.orbHalo, 0));
  if (night) ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  const disc = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
  disc.addColorStop(0, pal.paperLit);
  disc.addColorStop(1, pal.orb);
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(mx, my, mr, 0, TAU);
  ctx.fill();
  if (night) {
    ctx.fillStyle = pal.cloud;
    for (const [cx, cy, r] of [
      [-0.3, -0.2, 0.22],
      [0.25, 0.3, 0.16],
      [0.4, -0.35, 0.1],
      [-0.1, 0.45, 0.09],
    ] as const) {
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      ctx.arc(mx + cx * mr, my + cy * mr, r * mr, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* Cloud wisps. */
  ctx.fillStyle = pal.cloud;
  for (const [cx, cy, cw] of [
    [0.7, 0.27, 0.34],
    [0.2, 0.18, 0.26],
    [0.48, 0.36, 0.22],
  ] as const) {
    ctx.globalAlpha = pal.cloudAlpha * 0.6;
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.ellipse((cx + (i - 2) * cw * 0.18) * w, (cy + (i % 2) * 0.008) * h, cw * w * (0.16 + 0.05 * (i % 3)), 0.012 * h * (1.4 - Math.abs(i - 2) * 0.3), 0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  /* Far hills, a pagoda on them; near hills. */
  ridge(ctx, w, h, 0.66, 0.06, 3.1, 1.3, pal.hillFar);
  pagoda(ctx, w * 0.3, h * 0.645, w * 0.12, pal);
  ridge(ctx, w, h, 0.75, 0.04, 4.3, 2.1, pal.hillNear);

  /* The town on the horizon, its glow above the roofs. */
  if (pal.townGlowAlpha > 0) {
    const tg = ctx.createLinearGradient(0, h * 0.7, 0, h * 0.86);
    tg.addColorStop(0, withAlpha(pal.townGlow, 0));
    tg.addColorStop(1, withAlpha(pal.townGlow, pal.townGlowAlpha));
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = tg;
    ctx.fillRect(0, h * 0.7, w, h * 0.16);
    ctx.globalCompositeOperation = 'source-over';
  }
  town(ctx, w, h, pal, night);

  /* The veranda: posts, the beam, a shoji panel, blossom in the eaves, the boards. */
  veranda(ctx, w, h, pal, night);

  /* Vignette. */
  const v = ctx.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.45, w / 2, h * 0.5, Math.hypot(w, h) * 0.62);
  v.addColorStop(0, withAlpha(pal.vignette, 0));
  v.addColorStop(1, pal.vignette);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/** A soft ridge line across the view at `y` (share of height), filled down to the bottom. */
function ridge(ctx: Ctx, w: number, h: number, y: number, amp: number, f1: number, f2: number, colour: string): void {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i <= 40; i += 1) {
    const u = i / 40;
    const yy = y - amp * (0.55 * Math.sin(u * f1 + 0.6) + 0.45 * Math.sin(u * f2 * 2.3 + 2.1));
    ctx.lineTo(u * w, yy * h);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

/** A three-tier pagoda silhouette with lit windows. */
function pagoda(ctx: Ctx, x: number, base: number, width: number, pal: NinjaPalette): void {
  ctx.fillStyle = pal.roof;
  let y = base;
  let tierW = width;
  for (let i = 0; i < 3; i += 1) {
    const bodyH = width * 0.32;
    const bodyW = tierW * 0.62;
    ctx.fillRect(x - bodyW / 2, y - bodyH, bodyW, bodyH);
    if (pal.townGlowAlpha > 0 || i < 2) {
      ctx.fillStyle = pal.window;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x - bodyW * 0.2, y - bodyH * 0.72, bodyW * 0.14, bodyH * 0.38);
      ctx.fillRect(x + bodyW * 0.06, y - bodyH * 0.72, bodyW * 0.14, bodyH * 0.38);
      ctx.globalAlpha = 1;
      ctx.fillStyle = pal.roof;
    }
    y -= bodyH;
    /* The roof, its eaves curling up. */
    const eave = tierW * 0.62;
    ctx.beginPath();
    ctx.moveTo(x - eave, y + width * 0.02);
    ctx.quadraticCurveTo(x - eave * 0.55, y + width * 0.02, x - eave * 0.4, y - width * 0.1);
    ctx.lineTo(x + eave * 0.4, y - width * 0.1);
    ctx.quadraticCurveTo(x + eave * 0.55, y + width * 0.02, x + eave, y + width * 0.02);
    ctx.quadraticCurveTo(x + eave * 0.7, y - width * 0.02, x + eave * 0.62, y - width * 0.03);
    ctx.lineTo(x - eave * 0.62, y - width * 0.03);
    ctx.quadraticCurveTo(x - eave * 0.7, y - width * 0.02, x - eave, y + width * 0.02);
    ctx.fill();
    y -= width * 0.1;
    tierW *= 0.78;
  }
  ctx.fillRect(x - width * 0.012, y - width * 0.3, width * 0.024, width * 0.3);
  for (let i = 0; i < 4; i += 1) {
    ctx.beginPath();
    ctx.arc(x, y - width * (0.06 + i * 0.06), width * 0.022, 0, TAU);
    ctx.fill();
  }
}

/** Rooftops along the horizon, eaves curling, windows lit. */
function town(ctx: Ctx, w: number, h: number, pal: NinjaPalette, night: boolean): void {
  let x = -0.03;
  let i = 0;
  while (x < 1.03) {
    const bw = 0.08 + hash(i + 200) * 0.09;
    const top = 0.79 + hash(i + 210) * 0.045;
    const x0 = x * w;
    const x1 = (x + bw) * w;
    const y0 = top * h;
    const bwPx = bw * w;
    /* The wall, with a band of shadow under the eaves. */
    ctx.fillStyle = pal.wall;
    ctx.fillRect(x0 + bwPx * 0.08, y0, bwPx * 0.84, h - y0);
    ctx.fillStyle = pal.shadow;
    ctx.fillRect(x0 + bwPx * 0.08, y0, bwPx * 0.84, 0.008 * h);
    /* The roof: dark underside, tiled face, a ridge, eaves curling up. */
    ctx.fillStyle = pal.roof;
    ctx.beginPath();
    ctx.moveTo(x0 - bwPx * 0.08, y0 + 0.006 * h);
    ctx.quadraticCurveTo(x0 + bwPx * 0.2, y0, x0 + bwPx * 0.3, y0 - 0.032 * h);
    ctx.lineTo(x1 - bwPx * 0.3, y0 - 0.032 * h);
    ctx.quadraticCurveTo(x1 - bwPx * 0.2, y0, x1 + bwPx * 0.08, y0 + 0.006 * h);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = pal.roofLit;
    ctx.lineWidth = Math.max(1, 0.0025 * w);
    for (let r = 1; r <= 2; r += 1) {
      const yy = y0 - 0.032 * h + r * 0.011 * h;
      ctx.beginPath();
      ctx.moveTo(x0 + bwPx * (0.3 - r * 0.1), yy);
      ctx.lineTo(x1 - bwPx * (0.3 - r * 0.1), yy);
      ctx.stroke();
    }
    ctx.fillStyle = pal.roofLit;
    ctx.fillRect(x0 + bwPx * 0.28, y0 - 0.036 * h, bwPx * 0.44, 0.005 * h);
    /* Paper windows, lit at night, a lattice across each. */
    for (let j = 0; j < 2; j += 1) {
      if (hash(i * 7 + j + 240) < (night ? 0.3 : 0.45)) continue;
      const wx = x0 + bwPx * (0.24 + j * 0.34);
      const wy = y0 + 0.02 * h;
      const ww = bwPx * 0.2;
      const wh = 0.026 * h;
      ctx.globalAlpha = night ? 0.92 : 0.85;
      ctx.fillStyle = night ? pal.window : pal.paper;
      ctx.fillRect(wx, wy, ww, wh);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = night ? pal.roofLit : pal.lattice;
      ctx.lineWidth = Math.max(0.7, 0.0018 * w);
      ctx.beginPath();
      ctx.moveTo(wx + ww / 2, wy);
      ctx.lineTo(wx + ww / 2, wy + wh);
      ctx.moveTo(wx, wy + wh / 2);
      ctx.lineTo(wx + ww, wy + wh / 2);
      ctx.stroke();
    }
    /* Now and then a lantern under the eaves. */
    if (hash(i + 260) < 0.35) {
      const lx = x0 + bwPx * 0.86;
      const ly = y0 + 0.016 * h;
      ctx.fillStyle = pal.lanternA;
      ctx.beginPath();
      ctx.ellipse(lx, ly, 0.008 * w, 0.011 * w, 0, 0, TAU);
      ctx.fill();
    }
    x += bw * 0.92;
    i += 1;
  }
}

/** The veranda the view is seen from. */
function veranda(ctx: Ctx, w: number, h: number, pal: NinjaPalette, night: boolean): void {
  const post = 0.034 * w;
  const deck = NINJA.deck * h;
  /* The shoji panel at the left, lit from inside at night. */
  const sx = post;
  const sw = 0.075 * w;
  const sy = 0.2 * h;
  const sh = deck - sy;
  const paper = ctx.createLinearGradient(sx, 0, sx + sw, 0);
  paper.addColorStop(0, pal.paperLit);
  paper.addColorStop(1, pal.paper);
  ctx.fillStyle = paper;
  ctx.globalAlpha = night ? 0.85 : 0.95;
  ctx.fillRect(sx, sy, sw, sh);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = pal.lattice;
  ctx.lineWidth = Math.max(1, 0.004 * w);
  ctx.strokeRect(sx, sy, sw, sh);
  ctx.lineWidth = Math.max(1, 0.0025 * w);
  for (let i = 1; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(sx + (sw * i) / 3, sy);
    ctx.lineTo(sx + (sw * i) / 3, sy + sh);
    ctx.stroke();
  }
  for (let y = sy + sh / 9; y < sy + sh - 2; y += sh / 9) {
    ctx.beginPath();
    ctx.moveTo(sx, y);
    ctx.lineTo(sx + sw, y);
    ctx.stroke();
  }
  /* Posts. */
  for (const x0 of [0, w - post]) {
    const g = ctx.createLinearGradient(x0, 0, x0 + post, 0);
    g.addColorStop(0, x0 === 0 ? pal.woodLow : pal.woodLit);
    g.addColorStop(1, x0 === 0 ? pal.woodLit : pal.woodLow);
    ctx.fillStyle = g;
    ctx.fillRect(x0, 0, post, h);
    ctx.strokeStyle = pal.woodGrain;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.moveTo(x0 + post * (0.3 + i * 0.2), 0);
      ctx.lineTo(x0 + post * (0.3 + i * 0.2) + Math.sin(i) * 2, h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  /* The beam. */
  const beam = 0.032 * h;
  const bg = ctx.createLinearGradient(0, 0, 0, beam);
  bg.addColorStop(0, pal.woodLow);
  bg.addColorStop(0.6, pal.wood);
  bg.addColorStop(1, pal.woodLit);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, beam);
  ctx.fillStyle = pal.shadow;
  ctx.fillRect(0, beam, w, 0.006 * h);
  /* Blossom along the beam on the right. */
  ctx.strokeStyle = pal.branch;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, 0.008 * w);
  ctx.beginPath();
  ctx.moveTo(w * 1.02, beam * 1.1);
  ctx.quadraticCurveTo(w * 0.82, beam * 2.2, w * 0.64, beam * 1.6);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, 0.004 * w);
  ctx.beginPath();
  ctx.moveTo(w * 0.8, beam * 2);
  ctx.quadraticCurveTo(w * 0.76, beam * 3, w * 0.71, beam * 3.4);
  ctx.stroke();
  for (let i = 0; i < 16; i += 1) {
    const u = hash(i + 300);
    const bx = w * (0.64 + u * 0.38);
    const by = beam * (1.4 + 0.9 * Math.sin(u * 3) + hash(i + 310) * 1.6);
    const r = w * (0.008 + hash(i + 320) * 0.006);
    for (let p = 0; p < 5; p += 1) {
      const a = (p / 5) * TAU + i;
      ctx.fillStyle = p % 2 === 0 ? pal.blossom : pal.blossomLit;
      ctx.beginPath();
      ctx.ellipse(bx + Math.cos(a) * r * 0.9, by + Math.sin(a) * r * 0.9, r * 0.75, r * 0.5, a, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = pal.plate;
    ctx.beginPath();
    ctx.arc(bx, by, r * 0.35, 0, TAU);
    ctx.fill();
  }
  /* The boards. */
  ctx.fillStyle = pal.shadow;
  ctx.fillRect(0, deck - 0.01 * h, w, 0.01 * h);
  const dg = ctx.createLinearGradient(0, deck, 0, h);
  dg.addColorStop(0, pal.woodLit);
  dg.addColorStop(0.18, pal.wood);
  dg.addColorStop(1, pal.woodLow);
  ctx.fillStyle = dg;
  ctx.fillRect(0, deck, w, h - deck);
  ctx.strokeStyle = pal.woodGrain;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(1, 0.003 * w);
  for (let x = 0.07; x < 1; x += 0.11 + hash(Math.round(x * 100)) * 0.05) {
    ctx.beginPath();
    ctx.moveTo(x * w, deck + 0.012 * h);
    ctx.lineTo(x * w, h);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = pal.woodLit;
  ctx.lineWidth = Math.max(1, 0.004 * w);
  ctx.beginPath();
  ctx.moveTo(0, deck + 1);
  ctx.lineTo(w, deck + 1);
  ctx.stroke();
}

/* ── foods ─────────────────────────────────────────────────────────────── */

/** One food, whole, in Pico's flat style: a body lit from the top left, a shade, a shine. */
function foodSprite(kind: number, R: number, ratio: number, shadow: string): HTMLCanvasElement {
  const size = R * 2.9;
  /* The food alone first… */
  const art = makeCanvas(size * ratio, size * ratio);
  const a = art.getContext('2d')!;
  a.setTransform(ratio, 0, 0, ratio, (size / 2) * ratio, (size / 2) * ratio);
  a.lineCap = 'round';
  a.lineJoin = 'round';
  if (kind === 0) apple(a, R);
  else if (kind === 1) croissant(a, R);
  else if (kind === 2) cheese(a, R);
  else if (kind === 3) pizza(a, R);
  else if (kind === 4) doughnut(a, R);
  else carrot(a, R);
  /* …then laid down with a soft shadow of its own shape, so a food parts from
     whatever it crosses. Done once here: `shadowBlur` per frame would be the
     most expensive thing on the screen. */
  const c = makeCanvas(size * ratio, size * ratio);
  const ctx = c.getContext('2d')!;
  ctx.shadowColor = shadow;
  ctx.shadowBlur = R * 0.22 * ratio;
  ctx.shadowOffsetX = R * 0.04 * ratio;
  ctx.shadowOffsetY = R * 0.1 * ratio;
  ctx.drawImage(art, 0, 0);
  return c;
}

function shine(ctx: Ctx, x: number, y: number, rx: number, ry: number, a: number, alpha = 0.6): void {
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, a, 0, TAU);
  ctx.fill();
}

function apple(ctx: Ctx, R: number): void {
  const C = FOOD_BODY.apple;
  const body = new Path2D();
  body.moveTo(0, -0.6 * R);
  body.bezierCurveTo(0.32 * R, -0.95 * R, 0.98 * R, -0.8 * R, 0.94 * R, -0.08 * R);
  body.bezierCurveTo(0.9 * R, 0.55 * R, 0.5 * R, 0.92 * R, 0.24 * R, 0.88 * R);
  body.bezierCurveTo(0.12 * R, 0.86 * R, -0.12 * R, 0.86 * R, -0.24 * R, 0.88 * R);
  body.bezierCurveTo(-0.5 * R, 0.92 * R, -0.9 * R, 0.55 * R, -0.94 * R, -0.08 * R);
  body.bezierCurveTo(-0.98 * R, -0.8 * R, -0.32 * R, -0.95 * R, 0, -0.6 * R);
  const g = ctx.createRadialGradient(-0.35 * R, -0.35 * R, 0.05 * R, -0.1 * R, 0, 1.1 * R);
  g.addColorStop(0, C.lit);
  g.addColorStop(0.45, C.base);
  g.addColorStop(1, C.shade);
  ctx.fillStyle = g;
  ctx.fill(body);
  /* A darker cheek round the lower right. */
  ctx.save();
  ctx.clip(body);
  ctx.fillStyle = C.shade;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.arc(0.25 * R, 0.25 * R, 0.85 * R, -0.3, 1.9);
  ctx.arc(0.05 * R, 0.05 * R, 0.82 * R, 1.9, -0.3, true);
  ctx.fill();
  ctx.restore();
  /* Stem and leaf. */
  ctx.strokeStyle = C.stem;
  ctx.lineWidth = 0.09 * R;
  ctx.beginPath();
  ctx.moveTo(0, -0.58 * R);
  ctx.quadraticCurveTo(0.02 * R, -0.85 * R, 0.12 * R, -1.0 * R);
  ctx.stroke();
  leaf(ctx, 0.08 * R, -0.86 * R, 0.42 * R, 0.16 * R, -0.45, C.leaf, C.leafLow);
  shine(ctx, -0.45 * R, -0.3 * R, 0.13 * R, 0.24 * R, 0.5, 0.55);
  shine(ctx, -0.3 * R, -0.62 * R, 0.06 * R, 0.04 * R, 0, 0.5);
}

function croissant(ctx: Ctx, R: number): void {
  const C = FOOD_BODY.croissant;
  /* A fat crescent, horns down… */
  const body = new Path2D();
  body.moveTo(-0.95 * R, 0.42 * R);
  body.bezierCurveTo(-1.0 * R, -0.3 * R, -0.5 * R, -0.72 * R, 0, -0.7 * R);
  body.bezierCurveTo(0.5 * R, -0.72 * R, 1.0 * R, -0.3 * R, 0.95 * R, 0.42 * R);
  body.bezierCurveTo(0.8 * R, 0.5 * R, 0.62 * R, 0.2 * R, 0.4 * R, 0.24 * R);
  body.bezierCurveTo(0.22 * R, 0.4 * R, -0.22 * R, 0.4 * R, -0.4 * R, 0.24 * R);
  body.bezierCurveTo(-0.62 * R, 0.2 * R, -0.8 * R, 0.5 * R, -0.95 * R, 0.42 * R);
  body.closePath();
  const g = ctx.createRadialGradient(-0.2 * R, -0.45 * R, 0.05 * R, 0, 0, 1.05 * R);
  g.addColorStop(0, C.lit);
  g.addColorStop(0.5, C.base);
  g.addColorStop(1, C.shade);
  ctx.fillStyle = g;
  ctx.fill(body);
  ctx.save();
  ctx.clip(body);
  /* …rolled in five turns: each turn's lower edge in shadow, its top lit. */
  const turns: Array<[number, number, number]> = [
    [-0.62, -0.3, -0.75],
    [-0.24, -0.62, -0.2],
    [0.24, -0.62, 0.2],
    [0.62, -0.3, 0.75],
  ];
  for (const [x, y, lean] of turns) {
    ctx.strokeStyle = C.line;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 0.07 * R;
    ctx.beginPath();
    ctx.moveTo(x * R + lean * 0.1 * R, y * R - 0.1 * R);
    ctx.quadraticCurveTo(x * R + lean * 0.22 * R, (y + 0.4) * R, x * R + lean * 0.42 * R, (y + 0.95) * R);
    ctx.stroke();
    ctx.strokeStyle = C.lit;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 0.05 * R;
    ctx.beginPath();
    ctx.moveTo(x * R + lean * 0.1 * R - 0.07 * R * Math.sign(x), y * R - 0.06 * R);
    ctx.quadraticCurveTo(x * R + lean * 0.22 * R - 0.08 * R * Math.sign(x), (y + 0.4) * R, x * R + lean * 0.42 * R - 0.09 * R * Math.sign(x), (y + 0.95) * R);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  /* The horns, browner where they baked longest. */
  ctx.fillStyle = C.shade;
  ctx.globalAlpha = 0.5;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 0.9 * R, 0.32 * R, 0.24 * R, 0.2 * R, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  shine(ctx, -0.12 * R, -0.5 * R, 0.24 * R, 0.07 * R, 0, 0.5);
  shine(ctx, -0.58 * R, -0.24 * R, 0.12 * R, 0.05 * R, -0.9, 0.35);
}

function cheese(ctx: Ctx, R: number): void {
  const C = FOOD_BODY.cheese;
  /* A wedge: the cut front face, the top running back, the rind side. */
  const front = new Path2D();
  front.moveTo(-0.9 * R, -0.12 * R);
  front.lineTo(0.92 * R, 0.3 * R);
  front.lineTo(0.92 * R, 0.62 * R);
  front.quadraticCurveTo(0.92 * R, 0.7 * R, 0.84 * R, 0.7 * R);
  front.lineTo(-0.82 * R, 0.7 * R);
  front.quadraticCurveTo(-0.9 * R, 0.7 * R, -0.9 * R, 0.62 * R);
  front.closePath();
  const top = new Path2D();
  top.moveTo(-0.9 * R, -0.12 * R);
  top.lineTo(-0.5 * R, -0.62 * R);
  top.lineTo(0.95 * R, 0.24 * R);
  top.lineTo(0.92 * R, 0.3 * R);
  top.closePath();
  ctx.fillStyle = C.front;
  ctx.fill(front);
  const tg = ctx.createLinearGradient(-0.6 * R, -0.6 * R, 0.6 * R, 0.3 * R);
  tg.addColorStop(0, C.topLit);
  tg.addColorStop(1, C.top);
  ctx.fillStyle = tg;
  ctx.fill(top);
  /* Rind along the back edge. */
  ctx.strokeStyle = C.side;
  ctx.lineWidth = 0.09 * R;
  ctx.beginPath();
  ctx.moveTo(-0.9 * R, -0.08 * R);
  ctx.lineTo(-0.5 * R, -0.58 * R);
  ctx.stroke();
  /* Holes. */
  ctx.save();
  ctx.clip(front);
  for (const [x, y, r] of [
    [-0.5, 0.35, 0.16],
    [0.05, 0.45, 0.12],
    [0.5, 0.52, 0.09],
    [-0.15, 0.12, 0.07],
    [0.82, 0.62, 0.1],
  ] as const) {
    ctx.fillStyle = C.holeLow;
    ctx.beginPath();
    ctx.arc(x * R, y * R, r * R, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.hole;
    ctx.beginPath();
    ctx.arc(x * R + r * R * 0.18, y * R + r * R * 0.2, r * R * 0.8, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.save();
  ctx.clip(top);
  for (const [x, y, r] of [
    [-0.4, -0.3, 0.09],
    [0.2, 0.05, 0.07],
  ] as const) {
    ctx.fillStyle = C.hole;
    ctx.beginPath();
    ctx.ellipse(x * R, y * R, r * R, r * R * 0.55, 0.5, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  shine(ctx, -0.3 * R, -0.32 * R, 0.24 * R, 0.05 * R, 0.85, 0.5);
}

function pizza(ctx: Ctx, R: number): void {
  const C = FOOD_BODY.pizza;
  /* The slice, tip down. */
  const slice = new Path2D();
  slice.moveTo(-0.8 * R, -0.46 * R);
  slice.quadraticCurveTo(0, -0.66 * R, 0.8 * R, -0.46 * R);
  slice.quadraticCurveTo(0.42 * R, 0.25 * R, 0.04 * R, 0.95 * R);
  slice.quadraticCurveTo(-0.02 * R, 0.99 * R, -0.06 * R, 0.93 * R);
  slice.quadraticCurveTo(-0.42 * R, 0.25 * R, -0.8 * R, -0.46 * R);
  ctx.fillStyle = C.sauce;
  ctx.save();
  ctx.translate(0, -0.03 * R);
  ctx.scale(1.04, 1.02);
  ctx.fill(slice);
  ctx.restore();
  const g = ctx.createLinearGradient(-0.4 * R, -0.5 * R, 0.3 * R, 0.8 * R);
  g.addColorStop(0, C.cheeseLit);
  g.addColorStop(0.5, C.cheese);
  g.addColorStop(1, C.cheeseLow);
  ctx.fillStyle = g;
  ctx.fill(slice);
  /* Pepperoni. */
  for (const [x, y, r] of [
    [-0.32, -0.18, 0.17],
    [0.3, -0.12, 0.16],
    [0, 0.38, 0.14],
  ] as const) {
    ctx.fillStyle = C.pepperoniLow;
    ctx.beginPath();
    ctx.arc(x * R + 0.02 * R, y * R + 0.03 * R, r * R, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.pepperoni;
    ctx.beginPath();
    ctx.arc(x * R, y * R, r * R, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.pepperoniLow;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.arc(x * R + Math.cos(i * 2.1) * r * R * 0.5, y * R + Math.sin(i * 2.1) * r * R * 0.5, r * R * 0.12, 0, TAU);
      ctx.fill();
    }
    shine(ctx, x * R - r * R * 0.35, y * R - r * R * 0.4, r * R * 0.3, r * R * 0.15, -0.5, 0.35);
  }
  leaf(ctx, -0.1 * R, 0.05 * R, 0.3 * R, 0.12 * R, 0.6, C.basil, C.basilVein);
  /* The crust. */
  ctx.lineCap = 'round';
  ctx.strokeStyle = C.crustLow;
  ctx.lineWidth = 0.28 * R;
  ctx.beginPath();
  ctx.moveTo(-0.8 * R, -0.46 * R);
  ctx.quadraticCurveTo(0, -0.7 * R, 0.8 * R, -0.46 * R);
  ctx.stroke();
  ctx.strokeStyle = C.crust;
  ctx.lineWidth = 0.24 * R;
  ctx.beginPath();
  ctx.moveTo(-0.8 * R, -0.5 * R);
  ctx.quadraticCurveTo(0, -0.74 * R, 0.8 * R, -0.5 * R);
  ctx.stroke();
  ctx.strokeStyle = C.crustLit;
  ctx.lineWidth = 0.07 * R;
  ctx.beginPath();
  ctx.moveTo(-0.66 * R, -0.58 * R);
  ctx.quadraticCurveTo(0, -0.8 * R, 0.66 * R, -0.58 * R);
  ctx.stroke();
}

function doughnut(ctx: Ctx, R: number): void {
  const C = FOOD_BODY.doughnut;
  const g = ctx.createRadialGradient(-0.3 * R, -0.35 * R, 0.1 * R, 0, 0, R);
  g.addColorStop(0, C.doughLit);
  g.addColorStop(0.6, C.dough);
  g.addColorStop(1, C.doughLow);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 0.9 * R, 0, TAU);
  ctx.fill();
  /* Icing, wavy at its edge. */
  const icing = new Path2D();
  for (let i = 0; i <= 48; i += 1) {
    const a = (i / 48) * TAU;
    const r = (0.74 + 0.05 * Math.sin(a * 7) + 0.03 * Math.sin(a * 3 + 1)) * R;
    if (i === 0) icing.moveTo(Math.cos(a) * r, Math.sin(a) * r - 0.04 * R);
    else icing.lineTo(Math.cos(a) * r, Math.sin(a) * r - 0.04 * R);
  }
  icing.closePath();
  const ig = ctx.createRadialGradient(-0.3 * R, -0.4 * R, 0.05 * R, 0, 0, 0.8 * R);
  ig.addColorStop(0, C.icingLit);
  ig.addColorStop(0.5, C.icing);
  ig.addColorStop(1, C.icingLow);
  ctx.fillStyle = ig;
  ctx.fill(icing);
  /* Sprinkles. */
  for (let i = 0; i < 14; i += 1) {
    const a = (i / 14) * TAU + 0.3;
    const d = (0.44 + (i % 3) * 0.08) * R;
    ctx.save();
    ctx.translate(Math.cos(a) * d, Math.sin(a) * d - 0.04 * R);
    ctx.rotate(a * 2.3 + i);
    ctx.fillStyle = C.sprinkles[i % C.sprinkles.length];
    ctx.fillRect(-0.07 * R, -0.022 * R, 0.14 * R, 0.044 * R);
    ctx.restore();
  }
  /* The hole, cut clean through. */
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(0, -0.02 * R, 0.25 * R, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = C.doughLow;
  ctx.lineWidth = 0.06 * R;
  ctx.beginPath();
  ctx.arc(0, -0.02 * R, 0.27 * R, 0.2, Math.PI - 0.2, true);
  ctx.stroke();
  shine(ctx, -0.38 * R, -0.42 * R, 0.18 * R, 0.08 * R, -0.7, 0.55);
}

function carrot(ctx: Ctx, R: number): void {
  const C = FOOD_BODY.carrot;
  ctx.save();
  ctx.rotate(-0.55);
  /* Leaves first, behind. */
  for (const [a, l, c] of [
    [-0.45, 0.42, C.leafLow],
    [0, 0.5, C.leaf],
    [0.45, 0.4, C.leafLow],
  ] as const) {
    leaf(ctx, 0, -0.62 * R, l * R, 0.11 * R, -Math.PI / 2 + a, c, C.leafLow);
  }
  const body = new Path2D();
  body.moveTo(-0.34 * R, -0.62 * R);
  body.quadraticCurveTo(0, -0.74 * R, 0.34 * R, -0.62 * R);
  body.quadraticCurveTo(0.3 * R, 0.2 * R, 0.04 * R, 0.98 * R);
  body.quadraticCurveTo(0, 1.02 * R, -0.04 * R, 0.98 * R);
  body.quadraticCurveTo(-0.3 * R, 0.2 * R, -0.34 * R, -0.62 * R);
  const g = ctx.createLinearGradient(-0.34 * R, 0, 0.34 * R, 0);
  g.addColorStop(0, C.lit);
  g.addColorStop(0.45, C.base);
  g.addColorStop(1, C.shade);
  ctx.fillStyle = g;
  ctx.fill(body);
  ctx.strokeStyle = C.ridge;
  ctx.lineWidth = 0.045 * R;
  for (const [y, wd, side] of [
    [-0.3, 0.16, 1],
    [-0.05, 0.14, -1],
    [0.22, 0.12, 1],
    [0.48, 0.08, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(side * 0.05 * R, y * R);
    ctx.quadraticCurveTo(side * (wd + 0.05) * R * 0.6, (y + 0.03) * R, side * (wd + 0.06) * R, (y - 0.01) * R);
    ctx.stroke();
  }
  shine(ctx, -0.15 * R, -0.2 * R, 0.05 * R, 0.3 * R, 0.05, 0.4);
  ctx.restore();
}

function leaf(ctx: Ctx, x: number, y: number, len: number, wid: number, angle: number, colour: string, vein: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -wid * 1.3, len, 0);
  ctx.quadraticCurveTo(len * 0.5, wid * 1.3, 0, 0);
  ctx.fill();
  ctx.strokeStyle = vein;
  ctx.lineWidth = Math.max(0.6, wid * 0.18);
  ctx.beginPath();
  ctx.moveTo(len * 0.08, 0);
  ctx.lineTo(len * 0.85, 0);
  ctx.stroke();
  ctx.restore();
}

function glowSprite(colour: string): HTMLCanvasElement {
  const size = 128;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, withAlpha(colour, 1));
  g.addColorStop(0.4, withAlpha(colour, 0.45));
  g.addColorStop(1, withAlpha(colour, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function withAlpha(colour: string, alpha: number): string {
  if (colour.startsWith('#')) {
    const hex = colour.slice(1);
    const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex.slice(0, 6);
    const n = parseInt(full, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const m = colour.match(/rgba?\(([^)]+)\)/);
  if (!m) return colour;
  const [r, g, b, a0] = m[1].split(',').map((v) => parseFloat(v));
  return `rgba(${r}, ${g}, ${b}, ${(a0 === undefined || Number.isNaN(a0) ? 1 : a0) * alpha})`;
}
