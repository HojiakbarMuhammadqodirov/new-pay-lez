import { drawPico, picoBlinkAt, type DrawPicoOptions, type PicoFacing, type PicoPose } from '../../pico';
import { PICUMA, PICUMA_PALETTES, type OrbStone, type PicumaPalette, type PicumaTheme } from './config';

/**
 * Picuma — the picture of a Zuma round.
 *
 * A temple courtyard seen from above: flagstones and moss, ferns at the edges,
 * a causeway of carved stone with a groove cut along it, a stone portal the
 * chain rolls out of and a golden sun-idol it rolls into. Across the bottom a
 * branch, and on it Pico with the next shot in his beak, a nest beside him with
 * the one after, a torch at either corner.
 *
 * **It decides nothing.** `Zuma.tsx` keeps the chain, the shot, the head and
 * the clock exactly as the rules move them, and this only reads them — plus
 * two notes the rules send it as they happen (`popRun` before a run is taken
 * out, `joined` after a shot is put in) so a pop can burst where the orbs were
 * and the chain can slide where the rules made it jump. If the picture and the
 * rules ever disagree, the rules win within a few frames: every offset this
 * keeps decays to nothing.
 *
 * Painting is split by how often things change:
 *
 * - **the courtyard** — floor, plants, causeway, portal, idol, branch, nest,
 *   torches' poles — is drawn once per size and theme into an offscreen canvas;
 * - **each kind of orb** is one cached sprite at the current size, because a
 *   polished, engraved stone is a gradient and a dozen fills and the chain is
 *   sixty of them;
 * - and **per frame** only what moves: torchlight and flames, fireflies, the
 *   vines, the hole's warning, the chain, the shot, Pico, and the bursts.
 *
 * Per frame it allocates nothing worth naming: the track is sampled into a
 * scratch point, particles live in typed arrays, glows are pre-tinted sprites.
 */

type Ctx = CanvasRenderingContext2D;
type Ctx2 = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const TAU = Math.PI * 2;
/** A scene is broad flat shapes; past 2× a phone shows nothing more. */
const MAX_RATIO = 2;

export interface PicumaTrack {
  pts: ReadonlyArray<readonly [number, number]>;
  at: readonly number[];
}

/** A chain orb, as the rules hold it. Its identity is what an offset is keyed by. */
export interface PicumaBall {
  readonly kind: number;
}

/** What the scene reads from the round each frame. Nothing here is written. */
export interface PicumaView {
  chain: readonly PicumaBall[];
  head: number;
  shot: { x: number; y: number; vx: number; vy: number; kind: number } | null;
  loaded: readonly [number, number];
  aim: { x: number; y: number };
  phase: 'ready' | 'playing' | 'over';
  end: 'cleared' | 'hole' | 'time' | null;
}

/** The rules' constants the picture has to agree with. */
export interface PicumaRules {
  track: PicumaTrack;
  /** A ball's diameter, in field widths. */
  ball: number;
  shooter: { x: number; y: number };
  /** The field's height in widths (4/3). */
  aspect: number;
  /**
   * `'miniature'` for a catalogue card: a short wide band with no room for the
   * torches, the canopy or the floor's calendar, so they are left out. The
   * round is `'full'` (the default).
   */
  dressing?: 'full' | 'miniature';
}

/* ── small maths ───────────────────────────────────────────────────────── */

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutBack = (t: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};
/** Deterministic 0..1 from an integer, for scenery that must not shimmer between rebuilds. */
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

/* ── particles: one pool, typed arrays ─────────────────────────────────── */

const SHARDS = 240;
const RINGS = 24;
const FLOATERS = 8;

/** Kinds of shard beyond the four orbs. */
const SPARK = 4;

export class PicumaScene {
  private readonly rules: PicumaRules;
  private readonly length: number;
  private theme: PicumaTheme = 'dark';
  private pal: PicumaPalette = PICUMA_PALETTES.dark;
  private reduced = false;
  private font = 'sans-serif';
  private comboText = '×{n}';

  /* The courtyard, and what it was built for. */
  private back: HTMLCanvasElement | null = null;
  private builtFor = '';
  private w = 0;
  private h = 0;
  private ratio = 1;
  private orbs: HTMLCanvasElement[] = [];
  private orbR = 0;
  private glow: Record<'torch' | 'danger' | 'mote' | 'flash', HTMLCanvasElement> | null = null;
  private rays: Path2D | null = null;

  /* Where the picture lags the rules. */
  private readonly offsets = new WeakMap<PicumaBall, number>();
  private readonly arrivals = new WeakMap<PicumaBall, { x: number; y: number; t0: number }>();

  /* Pico. */
  private facing: PicoFacing = 1;
  private lean = PICUMA.pico.leanUp;
  private hopT0 = -1e9;
  private hopFrom: PicoFacing = 1;
  private happyUntil = 0;
  private lastShot: object | null = null;
  private shotT0 = -1e9;
  private shotDx = 0;
  private shotDy = 0;
  private lastLoaded: readonly [number, number] | null = null;
  private loadT0 = -1e9;
  private swapT0 = -1e9;
  private lastPaint = 0;
  private lastPopAt = -1e9;
  private combo = 0;

  /* Bursts. */
  private readonly sx = new Float32Array(SHARDS);
  private readonly sy = new Float32Array(SHARDS);
  private readonly svx = new Float32Array(SHARDS);
  private readonly svy = new Float32Array(SHARDS);
  private readonly st0 = new Float64Array(SHARDS).fill(-1e9);
  private readonly slife = new Float32Array(SHARDS);
  private readonly ssize = new Float32Array(SHARDS);
  private readonly sspin = new Float32Array(SHARDS);
  private readonly skind = new Uint8Array(SHARDS);
  private shard = 0;
  private readonly rx = new Float32Array(RINGS);
  private readonly ry = new Float32Array(RINGS);
  private readonly rt0 = new Float64Array(RINGS).fill(-1e9);
  private readonly rkind = new Uint8Array(RINGS);
  private ring = 0;
  private readonly floaters: Array<{ x: number; y: number; t0: number; text: string; combo: boolean }> = [];

  /* Scratch. */
  private readonly pt = { x: 0, y: 0 };
  private readonly pico: DrawPicoOptions = { x: 0, y: 0, size: 0, anchor: 'body' };

  constructor(rules: PicumaRules) {
    this.rules = rules;
    const at = rules.track.at;
    this.length = at[at.length - 1];
    this.placeBodies();
  }

  setTheme(theme: PicumaTheme): void {
    this.theme = theme;
    this.pal = PICUMA_PALETTES[theme];
  }

  setReduced(reduced: boolean): void {
    this.reduced = reduced;
  }

  /** The page's display face, for the floaters, and the combo line in the reader's language. */
  setText(font: string, combo: string): void {
    this.font = font || 'sans-serif';
    this.comboText = combo;
  }

  /* ── notes from the rules ────────────────────────────────────────────── */

  /**
   * The rules are about to take orbs `a..b` out of `list`. Burst them where
   * they are drawn, and — when the run was not at the front — hold the orbs
   * behind it where they were, so the gap closes as a slide.
   */
  popRun(list: readonly PicumaBall[], a: number, b: number, head: number, counted: number): void {
    const now = performance.now();
    const D = this.rules.ball;
    let mx = 0;
    let my = 0;
    let n = 0;
    for (let i = a; i <= b; i += 1) {
      if (!this.where(list[i], head - i * D, now)) continue;
      mx += this.pt.x;
      my += this.pt.y;
      n += 1;
      if (!this.reduced) this.burst(this.pt.x, this.pt.y, list[i].kind % 4, now);
    }
    if (a > 0 && !this.reduced) {
      const gap = (b - a + 1) * D;
      for (let j = b + 1; j < list.length; j += 1) {
        this.offsets.set(list[j], (this.offsets.get(list[j]) ?? 0) - gap);
      }
    }
    this.combo = now - this.lastPopAt < 4 ? this.combo + 1 : 1;
    this.lastPopAt = now;
    this.happyUntil = now + (this.combo > 1 ? PICUMA.pico.comboHappyMs : PICUMA.pico.happyMs);
    if (n > 0) {
      const x = mx / n;
      const y = my / n;
      if (counted > 0) this.float(x, y - 0.01, `+${counted}`, false, now);
      if (this.combo > 1) this.float(x, y - 0.075, this.comboText.replace('{n}', String(this.combo)), true, now);
    }
  }

  /**
   * The rules have just put a shot into `list` at `index`. It travels from
   * where the shot was into its slot, and the orbs behind it — which the rules
   * moved back a place — slide there.
   */
  joined(list: readonly PicumaBall[], index: number, fromX: number, fromY: number): void {
    if (this.reduced) return;
    const now = performance.now();
    const x = fromX + this.shotDx * this.settle(now);
    const y = fromY + this.shotDy * this.settle(now);
    this.arrivals.set(list[index], { x, y, t0: now });
    if (index > 0) {
      const D = this.rules.ball;
      for (let j = index + 1; j < list.length; j += 1) {
        this.offsets.set(list[j], (this.offsets.get(list[j]) ?? 0) + D);
      }
    }
  }

  /* ── the frame ───────────────────────────────────────────────────────── */

  paint(canvas: HTMLCanvasElement, view: PicumaView, now: number): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!(w > 0 && h > 0)) return;
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_RATIO);
    const bw = Math.round(w * ratio);
    const bh = Math.round(h * ratio);
    /* Assigning a size clears and reallocates even at the same value. */
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    this.render(ctx, w, h, ratio, view, now);
  }

  /**
   * One frame into a context whose backing store is `w × h` CSS pixels at
   * `ratio` — the round's canvas through `paint`, or a catalogue card's
   * miniature directly.
   */
  render(ctx: Ctx, w: number, h: number, ratio: number, view: PicumaView, now: number): void {
    const key = `${w}x${h}@${ratio}:${this.theme}`;
    if (key !== this.builtFor) {
      this.w = w;
      this.h = h;
      this.ratio = ratio;
      this.build();
      this.builtFor = key;
    }

    const dt = this.lastPaint > 0 ? Math.min(0.1, Math.max(0, (now - this.lastPaint) / 1000)) : 0;
    this.lastPaint = now;
    const t = this.reduced ? 0 : now / 1000;
    const k = w;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.back!, 0, 0);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const danger = this.dangerOf(view);
    this.torchlight(ctx, k, t);
    this.vines(ctx, k, t);
    if (danger > 0) this.warn(ctx, k, now, danger);

    this.slide(view, dt);
    if (view.phase === 'playing' && !view.shot) this.guide(ctx, k, view);
    this.chain(ctx, k, view, now);
    this.pico_(ctx, k, view, now, dt, danger);
    this.shot(ctx, k, view, now);
    this.flames(ctx, k, t);
    this.bursts(ctx, k, now);
    this.motes(ctx, k, t);
    if (danger > 0) this.edgeWarn(ctx, w, h, now, danger);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ── reading the rules' state ────────────────────────────────────────── */

  /** 0 until the front is `danger.span` from the hole, 1 at it. */
  private dangerOf(view: PicumaView): number {
    /* A card's miniature folds the track up short; its chain is never in danger. */
    if (!this.dressed || view.phase === 'ready' || view.chain.length === 0) return 0;
    const span = PICUMA.danger.span;
    return clamp01((view.head - (this.length - span)) / span);
  }

  /** The rules' `pointAt`, into `this.pt`. Same arithmetic, without an array per call. */
  private sample(s: number): boolean {
    if (s < 0) return false;
    const { pts, at } = this.rules.track;
    if (s >= this.length) {
      const p = pts[pts.length - 1];
      this.pt.x = p[0];
      this.pt.y = p[1];
      return true;
    }
    let i = 1;
    while (at[i] < s) i += 1;
    const u = (s - at[i - 1]) / (at[i] - at[i - 1]);
    const a = pts[i - 1];
    const b = pts[i];
    this.pt.x = a[0] + (b[0] - a[0]) * u;
    this.pt.y = a[1] + (b[1] - a[1]) * u;
    return true;
  }

  /** Where `ball`, whose place on the track is `s`, is drawn now — offsets and arrivals included. */
  private where(ball: PicumaBall, s: number, now: number): boolean {
    const off = this.offsets.get(ball) ?? 0;
    if (!this.sample(s + off)) return false;
    const arrival = this.arrivals.get(ball);
    if (arrival) {
      const e = clamp01((now - arrival.t0) / PICUMA.joinMs);
      if (e >= 1) this.arrivals.delete(ball);
      else {
        const k = easeOut(e);
        this.pt.x = lerp(arrival.x, this.pt.x, k);
        this.pt.y = lerp(arrival.y, this.pt.y, k);
      }
    }
    return true;
  }

  /** Let every offset decay toward the rules' positions. */
  private slide(view: PicumaView, dt: number): void {
    if (dt <= 0) return;
    const decay = Math.exp(-dt / PICUMA.slideTau);
    for (const ball of view.chain) {
      const off = this.offsets.get(ball);
      if (off === undefined) continue;
      const next = off * decay;
      if (Math.abs(next) < 1e-4) this.offsets.delete(ball);
      else this.offsets.set(ball, next);
    }
  }

  /** How far a fresh shot still is from its real line (1 at the beak, 0 on it). */
  private settle(now: number): number {
    const e = clamp01((now - this.shotT0) / PICUMA.shotSettleMs);
    return (1 - e) * (1 - e);
  }

  /* ── Pico ─────────────────────────────────────────────────────────────── */

  /**
   * Pico's body centre facing right and facing left, in field units: placed
   * so that at his resting lean the orb in his beak *is* the shooter. Fixed,
   * so worked out once.
   */
  private readonly right = { x: 0, y: 0 };
  private readonly left = { x: 0, y: 0 };

  private bodyAt(facing: PicoFacing): { x: number; y: number } {
    return facing === 1 ? this.right : this.left;
  }

  /* The bottom of the field, placed from its bottom edge (see `PICUMA.branch`). */
  private branchY = 0;
  private nestY = 0;
  private torchY = 0;
  private dressed = true;

  private placeBodies(): void {
    const A = this.rules.aspect;
    this.branchY = A - PICUMA.branch.fromBottom;
    this.nestY = A - PICUMA.nest.fromBottom;
    this.torchY = A - PICUMA.torches[0].fromBottom;
    this.dressed = this.rules.dressing !== 'miniature';
    const s = PICUMA.pico.size / 100;
    const { hold, restLean } = PICUMA.pico;
    for (const facing of [1, -1] as const) {
      const vx = facing * (hold.x - 50) * s;
      const vy = (hold.y - 56) * s;
      const a = facing * restLean;
      const body = this.bodyAt(facing);
      body.x = this.rules.shooter.x - (vx * Math.cos(a) - vy * Math.sin(a));
      body.y = this.rules.shooter.y - (vx * Math.sin(a) + vy * Math.cos(a));
    }
  }

  private pico_(ctx: Ctx, k: number, view: PicumaView, now: number, dt: number, danger: number): void {
    const P = PICUMA.pico;
    const shooter = this.rules.shooter;

    /* Which way: toward the pointer, with a dead band around straight up so
       a pointer held overhead does not flip him back and forth. */
    const dx = view.aim.x - shooter.x;
    const dy = view.aim.y - shooter.y;
    const want: PicoFacing = dx > P.turnDeadband ? 1 : dx < -P.turnDeadband ? -1 : this.facing;
    const hopping = now - this.hopT0 < P.hopMs;
    if (want !== this.facing && !hopping) {
      this.hopFrom = this.facing;
      this.facing = want;
      this.hopT0 = this.reduced ? -1e9 : now;
    }

    /* The lean: nose up for a shot overhead, level for a flat one. */
    const steep = clamp01((Math.atan2(dy, Math.abs(dx) + 1e-6) + Math.PI / 2) / (Math.PI / 2));
    const target = lerp(P.leanUp, P.leanFlat, steep);
    this.lean += (target - this.lean) * (this.reduced ? 1 : 1 - Math.exp(-P.leanRate * dt));

    /* A fresh shot or a fresh load. */
    if (view.shot && view.shot !== this.lastShot) {
      this.lastShot = view.shot;
      const beak = this.beak(this.facing, this.lean);
      this.shotT0 = now;
      this.shotDx = beak.x - shooter.x;
      this.shotDy = beak.y - shooter.y;
    }
    if (!view.shot) this.lastShot = null;
    if (view.loaded !== this.lastLoaded) {
      if (this.lastLoaded) {
        if (now - this.shotT0 < 40) this.loadT0 = now;
        else this.swapT0 = now;
      }
      this.lastLoaded = view.loaded;
    }

    /* The pose. */
    const hopT = clamp01((now - this.hopT0) / P.hopMs);
    const inHop = hopT < 1;
    let pose: PicoPose = 'idle';
    if (view.phase === 'over') pose = view.end === 'cleared' ? 'happy' : view.end === 'hole' ? 'sad' : 'idle';
    else if (inHop) pose = 'flap';
    else if (now < this.happyUntil) pose = 'happy';
    else if (danger >= P.worryAt) pose = 'sad';

    /* Where: across the orb on a hop, else standing on the branch. */
    const from = this.bodyAt(this.hopFrom);
    const to = this.bodyAt(this.facing);
    const e = inHop ? easeInOut(hopT) : 1;
    let bx = lerp(from.x, to.x, e);
    let by = lerp(from.y, to.y, e) - (inHop ? Math.sin(Math.PI * hopT) * P.hopHeight : 0);
    const facing: PicoFacing = inHop && hopT < 0.5 ? this.hopFrom : this.facing;
    const tilt = inHop ? 0 : view.phase === 'over' ? 0 : this.lean;

    /* Recoil, back along the line of fire. */
    const kick = clamp01((now - this.shotT0) / P.recoilMs);
    if (kick < 1 && !this.reduced) {
      const len = Math.hypot(this.shotDx, this.shotDy + 0.001) || 1;
      const back = (1 - kick) * (1 - kick) * P.recoil;
      bx -= ((this.shotDx / len) * back) / 2;
      by -= (((this.shotDy + 0.001) / len) * back) / 2;
    }

    /* A soft shadow on the branch. */
    const feetY = this.branchY;
    const lift = inHop ? Math.sin(Math.PI * hopT) : 0;
    ctx.globalAlpha = 1 - lift * 0.6;
    ctx.fillStyle = this.pal.shadow;
    ctx.beginPath();
    ctx.ellipse(bx * k, (feetY + 0.004) * k, 0.05 * k * (1 - lift * 0.3), 0.009 * k, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    /* The orb in the beak — drawn first, so the bill closes over it. */
    const r = this.orbR;
    const held = view.loaded[0] % 4;
    if (view.phase !== 'over' || view.end !== 'cleared') {
      const grow = this.reduced ? 1 : Math.min(easeOutBack(clamp01((now - this.loadT0) / 200)), swapScale(now - this.swapT0));
      let hx = shooter.x;
      let hy = shooter.y;
      if (!inHop) {
        const beak = this.beakFrom(bx, by, facing, tilt);
        hx = beak.x;
        hy = beak.y;
      }
      if (grow > 0.04) this.orb(ctx, held, hx * k, hy * k, r * grow);
    }

    const opts = this.pico;
    opts.x = bx * k;
    opts.y = by * k;
    opts.size = P.size * k;
    opts.pose = pose;
    opts.flap = (now - this.hopT0) / 1000 * 7;
    opts.blink = pose === 'idle' || pose === 'sad' ? picoBlinkAt(this.reduced ? 0 : now / 1000) : 0;
    opts.facing = facing;
    opts.tilt = tilt;
    drawPico(ctx, opts);

    /* The next orb, in the nest. */
    const nest = PICUMA.nest;
    const next = view.loaded[1] % 4;
    const settle = this.reduced ? 1 : Math.min(easeOutBack(clamp01((now - this.loadT0 - 90) / 220)), swapScale(now - this.swapT0));
    if (settle > 0.04) this.orb(ctx, next, (shooter.x - nest.dx) * k, (this.nestY - 0.012) * k, r * nest.orbScale * settle);
    this.nestFront(ctx, k);
  }

  /** The orb's centre for a body at (bx, by), facing and tilt — the hold point turned with him. */
  private beakFrom(bx: number, by: number, facing: PicoFacing, tilt: number): { x: number; y: number } {
    const s = PICUMA.pico.size / 100;
    const { hold } = PICUMA.pico;
    const vx = facing * (hold.x - 50) * s;
    const vy = (hold.y - 56) * s;
    const a = facing * tilt;
    const c = Math.cos(a);
    const n = Math.sin(a);
    this.pt.x = bx + vx * c - vy * n;
    this.pt.y = by + vx * n + vy * c;
    return this.pt;
  }

  private beak(facing: PicoFacing, tilt: number): { x: number; y: number } {
    const body = this.bodyAt(facing);
    return this.beakFrom(body.x, body.y, facing, tilt);
  }

  /** The nest's front rim, over the orb sitting in it. */
  private nestFront(ctx: Ctx, k: number): void {
    const nest = PICUMA.nest;
    const x = (this.rules.shooter.x - nest.dx) * k;
    const y = this.nestY * k;
    const R = nest.r * k;
    ctx.fillStyle = this.pal.nest;
    ctx.beginPath();
    ctx.ellipse(x, y, R * 1.05, R * 0.42, 0, 0, Math.PI);
    ctx.lineTo(x - R * 1.05, y);
    ctx.fill();
    ctx.strokeStyle = this.pal.nestLit;
    ctx.lineWidth = Math.max(1, R * 0.07);
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i += 1) {
      const a = 0.25 + i * 0.45;
      ctx.beginPath();
      ctx.ellipse(x + (i - 2.5) * R * 0.16, y + R * 0.08, R * (0.62 + 0.05 * (i % 2)), R * 0.26, 0.05 * (i - 2.5), a * 0.3, Math.PI - a * 0.25);
      ctx.stroke();
    }
    ctx.strokeStyle = this.pal.barkLow;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.ellipse(x, y + R * 0.05, R * 1.02, R * 0.38, 0, 0.15, Math.PI - 0.15);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* ── the chain and the shot ──────────────────────────────────────────── */

  private chain(ctx: Ctx, k: number, view: PicumaView, now: number): void {
    const D = this.rules.ball;
    const list = view.chain;
    const r = this.orbR;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const ball = list[i];
      if (!this.where(ball, view.head - i * D, now)) continue;
      this.orb(ctx, ball.kind % 4, this.pt.x * k, this.pt.y * k, r);
    }
  }

  private shot(ctx: Ctx, k: number, view: PicumaView, now: number): void {
    const shot = view.shot;
    if (!shot) return;
    const settle = this.settle(now);
    const x = shot.x + this.shotDx * settle;
    const y = shot.y + this.shotDy * settle;
    const r = this.orbR;
    const kind = shot.kind % 4;
    /*
     * The streak: a tapering wake back along its line, never longer than the
     * way it has come. A wake from the velocity rather than copies of the orb
     * at its last few frames, because copies are spaced by the frame rate — at
     * 30 Hz they read as a second and third ball following the first.
     */
    if (!this.reduced) {
      const speed = Math.hypot(shot.vx, shot.vy) || 1;
      const ux = shot.vx / speed;
      const uy = shot.vy / speed;
      const travelled = Math.hypot(x - this.rules.shooter.x, y - this.rules.shooter.y);
      const stone = this.pal.orbs[kind];
      ctx.fillStyle = stone.lit;
      for (const [len, alpha, wide] of PICUMA.shotWake) {
        const L = Math.min(len, travelled) * k;
        const half = r * wide;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(x * k - uy * half, y * k + ux * half);
        ctx.lineTo(x * k - ux * L, y * k - uy * L);
        ctx.lineTo(x * k + uy * half, y * k - ux * half);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    this.orb(ctx, kind, x * k, y * k, r);
  }

  /** Dots from the beak toward the pointer, in the colour of what is loaded. */
  private guide(ctx: Ctx, k: number, view: PicumaView): void {
    const G = PICUMA.guide;
    const sh = this.rules.shooter;
    let dx = view.aim.x - sh.x;
    let dy = view.aim.y - sh.y;
    const span = Math.hypot(dx, dy);
    if (span < 0.04) return;
    dx /= span;
    dy /= span;
    /* The loaded stone's colour: its lit face on the night floor, its shaded
       one on the sandstone, where the lit face is nearly the floor's own. */
    const stone = this.pal.orbs[view.loaded[0] % 4];
    const ink = this.pal.additive ? stone.lit : stone.shade;
    ctx.fillStyle = ink;
    const dots = Math.floor((span - G.first) / G.gap);
    for (let n = 0; n <= dots; n += 1) {
      const d = G.first + n * G.gap;
      const x = sh.x + dx * d;
      const y = sh.y + dy * d;
      if (x < 0 || x > 1 || y < 0 || y > this.rules.aspect) break;
      ctx.globalAlpha = 0.85 * (1 - (n / (dots + 2)) * 0.6);
      ctx.beginPath();
      ctx.arc(x * k, y * k, G.dot * k * (1 - (n / (dots + 2)) * 0.35), 0, TAU);
      ctx.fill();
    }
    /* A reticle where the pointer is. */
    if (view.aim.y < sh.y - 0.05) {
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1.2, 0.0035 * k);
      ctx.beginPath();
      ctx.arc(view.aim.x * k, view.aim.y * k, G.reticle * k, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** One orb from its sprite, centred, at radius `R`. */
  private orb(ctx: Ctx, kind: number, x: number, y: number, R: number): void {
    const sprite = this.orbs[kind];
    if (!sprite || R <= 0.3) return;
    const scale = R / (this.orbR * ORB_SPRITE_SCALE);
    const sw = (sprite.width / this.ratio) * scale;
    const sh = (sprite.height / this.ratio) * scale;
    ctx.drawImage(sprite, x - sw / 2, y - sh / 2, sw, sh);
  }

  /* ── bursts ──────────────────────────────────────────────────────────── */

  private burst(x: number, y: number, kind: number, now: number): void {
    const n = PICUMA.pop.shards;
    for (let i = 0; i < n; i += 1) {
      const j = this.shard;
      this.shard = (j + 1) % SHARDS;
      const a = Math.random() * TAU;
      const v = 0.18 + Math.random() * 0.42;
      this.sx[j] = x;
      this.sy[j] = y;
      this.svx[j] = Math.cos(a) * v;
      this.svy[j] = Math.sin(a) * v - 0.22;
      this.st0[j] = now;
      this.slife[j] = PICUMA.pop.life * (0.6 + Math.random() * 0.5);
      this.ssize[j] = 0.005 + Math.random() * 0.007;
      this.sspin[j] = (Math.random() - 0.5) * 14;
      this.skind[j] = i < 3 ? SPARK : kind;
    }
    const j = this.ring;
    this.ring = (j + 1) % RINGS;
    this.rx[j] = x;
    this.ry[j] = y;
    this.rt0[j] = now;
    this.rkind[j] = kind;
  }

  private float(x: number, y: number, text: string, combo: boolean, now: number): void {
    if (this.floaters.length >= FLOATERS) this.floaters.shift();
    this.floaters.push({ x, y, t0: now, text, combo });
  }

  private bursts(ctx: Ctx, k: number, now: number): void {
    const pal = this.pal;
    const r = this.orbR;
    /* Rings, then a flash at their heart. */
    for (let i = 0; i < RINGS; i += 1) {
      const e = (now - this.rt0[i]) / PICUMA.pop.ringMs;
      if (e < 0 || e >= 1) continue;
      const stone = pal.orbs[this.rkind[i]];
      ctx.globalAlpha = (1 - e) * 0.9;
      ctx.strokeStyle = stone.lit;
      ctx.lineWidth = Math.max(1, r * 0.3 * (1 - e));
      ctx.beginPath();
      ctx.arc(this.rx[i] * k, this.ry[i] * k, r * (0.8 + easeOut(e) * 1.4), 0, TAU);
      ctx.stroke();
      if (e < 0.35 && this.glow) {
        const f = 1 - e / 0.35;
        const g = r * (1.6 + 1.2 * e);
        ctx.globalAlpha = f * 0.8;
        if (pal.additive) ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(this.glow.flash, this.rx[i] * k - g, this.ry[i] * k - g, g * 2, g * 2);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    /* Shards: chips of the stone, tumbling, and a few sparks. */
    for (let i = 0; i < SHARDS; i += 1) {
      const age = (now - this.st0[i]) / 1000;
      const life = this.slife[i];
      if (age < 0 || age >= life) continue;
      const f = age / life;
      const x = (this.sx[i] + this.svx[i] * age) * k;
      const y = (this.sy[i] + this.svy[i] * age + 0.75 * age * age) * k;
      const size = this.ssize[i] * k * (1 - f * 0.5);
      ctx.globalAlpha = 1 - f * f;
      const kind = this.skind[i];
      if (kind === SPARK) {
        ctx.fillStyle = pal.combo;
        ctx.beginPath();
        ctx.arc(x, y, size * 0.55, 0, TAU);
        ctx.fill();
      } else {
        const stone = pal.orbs[kind];
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.sspin[i] * age);
        ctx.fillStyle = stone.base;
        ctx.beginPath();
        ctx.moveTo(-size, -size * 0.6);
        ctx.lineTo(size * 0.9, -size * 0.8);
        ctx.lineTo(size * 0.4, size * 0.9);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = stone.lit;
        ctx.beginPath();
        ctx.moveTo(-size, -size * 0.6);
        ctx.lineTo(size * 0.9, -size * 0.8);
        ctx.lineTo(0, -size * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;

    /* Floaters: "+3", and "Combo ×2" over it. */
    if (this.floaters.length === 0) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (let i = this.floaters.length - 1; i >= 0; i -= 1) {
      const f = this.floaters[i];
      const span = f.combo ? PICUMA.pop.comboMs : PICUMA.pop.floaterMs;
      const e = (now - f.t0) / span;
      if (e >= 1) {
        this.floaters.splice(i, 1);
        continue;
      }
      if (e < 0) continue;
      const rise = this.reduced ? 0 : easeOut(e) * 0.06;
      const pop = this.reduced ? 1 : easeOutBack(clamp01(e / 0.22));
      const size = (f.combo ? 0.062 : 0.048) * k * pop;
      if (size < 1) continue;
      ctx.globalAlpha = e > 0.6 ? 1 - (e - 0.6) / 0.4 : 1;
      ctx.font = `800 ${Math.round(size)}px ${this.font}`;
      /* Kept inside the field: a pop on a turn is half off its edge. */
      const half = ctx.measureText(f.text).width / 2 + size * 0.3;
      const x = Math.min(Math.max(f.x * k, half), k - half);
      const y = (f.y - rise) * k;
      ctx.strokeStyle = pal.floaterEdge;
      ctx.lineWidth = Math.max(2, size * 0.2);
      ctx.strokeText(f.text, x, y);
      ctx.fillStyle = f.combo ? pal.combo : pal.floater;
      ctx.fillText(f.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  /* ── ambient ─────────────────────────────────────────────────────────── */

  private torchlight(ctx: Ctx, k: number, t: number): void {
    if (!this.glow || !this.dressed) return;
    const pal = this.pal;
    if (pal.additive) ctx.globalCompositeOperation = 'lighter';
    PICUMA.torches.forEach((torch, i) => {
      const flicker = 0.85 + 0.1 * Math.sin(t * 9.1 + i * 2) + 0.05 * Math.sin(t * 23.3 + i);
      const R = 0.3 * k * flicker;
      ctx.globalAlpha = pal.torchPoolAlpha * 2.2 * flicker;
      ctx.drawImage(this.glow!.torch, torch.x * k - R, (this.torchY + 0.02) * k - R, R * 2, R * 2);
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private flames(ctx: Ctx, k: number, t: number): void {
    if (!this.dressed) return;
    const pal = this.pal;
    PICUMA.torches.forEach((torch, i) => {
      const x = torch.x * k;
      const y = this.torchY * k;
      const s = 0.03 * k;
      const sway = Math.sin(t * 5.3 + i * 1.7) * 0.18 + Math.sin(t * 13.7 + i) * 0.08;
      const tall = 1 + 0.12 * Math.sin(t * 11.1 + i * 3) + 0.06 * Math.sin(t * 27 + i);
      if (this.glow) {
        if (pal.additive) ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = pal.additive ? 0.55 : 0.35;
        const g = s * 3.2;
        ctx.drawImage(this.glow.torch, x - g, y - s * 0.9 - g, g * 2, g * 2);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
      flame(ctx, x, y, s * 1.0, s * 2.1 * tall, sway, pal.flameOuter);
      flame(ctx, x, y + s * 0.05, s * 0.72, s * 1.55 * tall, sway * 1.2, pal.flameMid);
      flame(ctx, x, y + s * 0.1, s * 0.38, s * 0.9 * tall, sway * 1.4, pal.flameCore);
    });
  }

  private vines(ctx: Ctx, k: number, t: number): void {
    if (!this.dressed) return;
    const pal = this.pal;
    ctx.lineCap = 'round';
    for (let i = 0; i < PICUMA.vines; i += 1) {
      const x0 = (0.04 + (i / PICUMA.vines) * 0.95 + hash(i * 7 + 1) * 0.05) * k;
      const len = (0.05 + hash(i * 7 + 2) * 0.06) * k;
      const sway = Math.sin(t * (0.7 + hash(i * 7 + 3) * 0.5) + i * 1.9) * 0.012 * k;
      const x1 = x0 + sway;
      const y1 = len;
      ctx.strokeStyle = pal.vine;
      ctx.lineWidth = Math.max(1, 0.0035 * k);
      ctx.beginPath();
      ctx.moveTo(x0, -2);
      ctx.quadraticCurveTo(x0 + sway * 0.2, len * 0.5, x1, y1);
      ctx.stroke();
      ctx.fillStyle = pal.vineLeaf;
      const leaves = 3 + Math.floor(hash(i * 7 + 4) * 3);
      for (let j = 1; j <= leaves; j += 1) {
        const f = j / (leaves + 0.5);
        const lx = lerp(x0, x1, f * f);
        const ly = len * f;
        const side = j % 2 === 0 ? 1 : -1;
        ctx.beginPath();
        ctx.ellipse(lx + side * 0.009 * k, ly, 0.0085 * k, 0.0042 * k, side * 0.6 + sway * 0.02, 0, TAU);
        ctx.fill();
      }
    }
  }

  private motes(ctx: Ctx, k: number, t: number): void {
    if (!this.glow) return;
    const pal = this.pal;
    if (pal.additive) ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < PICUMA.motes; i += 1) {
      const bx = hash(i * 13 + 5);
      const by = 0.06 + hash(i * 13 + 6) * (this.rules.aspect - 0.2);
      const sp = 0.25 + hash(i * 13 + 7) * 0.35;
      const x = bx + Math.sin(t * sp + i * 2.1) * 0.035 + Math.sin(t * sp * 2.3 + i) * 0.01;
      const y = by + Math.sin(t * sp * 0.8 + i * 1.3) * 0.025 - (this.theme === 'light' ? ((t * 0.006 + hash(i)) % 0.05) : 0);
      const tw = this.reduced ? 0.6 : Math.max(0, Math.sin(t * (0.9 + hash(i * 13 + 8)) + i * 3.3));
      const a = pal.moteAlpha * (0.25 + 0.75 * tw * tw);
      const g = (0.016 + 0.01 * tw) * k;
      ctx.globalAlpha = a * 0.7;
      ctx.drawImage(this.glow.mote, x * k - g, y * k - g, g * 2, g * 2);
      ctx.globalAlpha = a;
      ctx.fillStyle = pal.mote;
      ctx.beginPath();
      ctx.arc(x * k, y * k, Math.max(0.8, 0.0024 * k), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** The hole's warning: the pit breathes the danger colour, the rays catch it. */
  private warn(ctx: Ctx, k: number, now: number, danger: number): void {
    if (!this.glow) return;
    const end = this.rules.track.pts[this.rules.track.pts.length - 1];
    const t = this.reduced ? 0 : now / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * (5 + danger * 8));
    const R = (0.14 + 0.05 * pulse * danger) * k;
    if (this.pal.additive) ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = danger * (0.45 + 0.45 * pulse);
    ctx.drawImage(this.glow.danger, end[0] * k - R, end[1] * k - R, R * 2, R * 2);
    ctx.globalCompositeOperation = 'source-over';
    if (this.rays) {
      ctx.globalAlpha = danger * (0.25 + 0.55 * pulse);
      ctx.strokeStyle = this.pal.danger;
      ctx.lineWidth = Math.max(1.2, 0.004 * k);
      ctx.stroke(this.rays);
    }
    ctx.globalAlpha = 1;
  }

  private edgeWarn(ctx: Ctx, w: number, h: number, now: number, danger: number): void {
    if (!this.glow) return;
    const t = this.reduced ? 0 : now / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * (4 + danger * 6));
    ctx.globalAlpha = danger * danger * (0.18 + 0.14 * pulse);
    ctx.drawImage(this.glow.danger, -w * 0.6, h * 0.1, w * 0.9, h * 0.9);
    ctx.drawImage(this.glow.danger, w * 0.7, h * 0.15, w * 0.9, h * 0.9);
    ctx.globalAlpha = 1;
  }

  /* ── building the courtyard ──────────────────────────────────────────── */

  private build(): void {
    const { w, h, ratio } = this;
    const k = w;
    const pal = this.pal;
    const back = makeCanvas(w * ratio, h * ratio);
    const ctx = back.getContext('2d')!;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    paintFloor(ctx, w, h, k, pal, this.theme);
    if (this.dressed) {
      paintInlay(ctx, k, pal, this.rules.shooter.x, this.rules.aspect - 1 / 3);
      paintPlantsBack(ctx, k, h, pal);
    }
    this.paintCauseway(ctx, k);
    this.paintPortal(ctx, k);
    this.rays = this.paintIdol(ctx, k);
    if (this.dressed) paintCanopy(ctx, k, pal);
    paintBranch(ctx, k, h, pal, this.rules.shooter.x, this.branchY);
    if (this.dressed) paintTorches(ctx, k, h, pal, this.torchY);
    this.paintNestBack(ctx, k);
    paintVignette(ctx, w, h, pal);

    this.back = back;
    this.orbR = (this.rules.ball * k) / 2 - 0.5;
    this.orbs = [0, 1, 2, 3].map((kind) => orbSprite(pal.orbs[kind], kind, this.orbR * ORB_SPRITE_SCALE, ratio, pal.shadow));
    this.glow = {
      torch: glowSprite(pal.torchPool),
      danger: glowSprite(pal.danger),
      mote: glowSprite(pal.mote),
      flash: glowSprite('#ffffff'),
    };
  }

  private paintCauseway(ctx: Ctx, k: number): void {
    const pal = this.pal;
    const D = this.rules.ball;
    const pts = this.rules.track.pts;
    const path = new Path2D();
    pts.forEach(([x, y], i) => (i === 0 ? path.moveTo(x * k, y * k) : path.lineTo(x * k, y * k)));

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const band = (width: number, colour: string, dy: number, alpha = 1) => {
      ctx.save();
      ctx.translate(0, dy * k);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = colour;
      ctx.lineWidth = width * D * k;
      ctx.stroke(path);
      ctx.restore();
    };
    /* The causeway: a shadow on the floor, its dark flank, its lit edge, its face. */
    band(2.05, pal.shadow, 0.009);
    band(1.9, pal.stoneEdge, 0.002);
    band(1.8, pal.stoneLow, 0.004);
    band(1.8, pal.stoneLit, -0.003);
    band(1.7, pal.stone, 0);

    /* Masonry: joints across the rim every block, a chisel-lit edge beside each. */
    const step = 0.082;
    const len = this.length;
    let n = 0;
    for (let s = step * 0.5; s < len; s += step, n += 1) {
      if (!this.sample(s)) continue;
      const x = this.pt.x;
      const y = this.pt.y;
      this.sample(Math.min(len, s + 0.004));
      let tx = this.pt.x - x;
      let ty = this.pt.y - y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const nx = -ty;
      const ny = tx;
      for (const side of [-1, 1]) {
        const a0 = 0.6 * D * side;
        const a1 = 0.86 * D * side;
        ctx.strokeStyle = pal.stoneEdge;
        ctx.globalAlpha = 0.75;
        ctx.lineWidth = Math.max(1, 0.0028 * k);
        ctx.beginPath();
        ctx.moveTo((x + nx * a0) * k, (y + ny * a0) * k);
        ctx.lineTo((x + nx * a1) * k, (y + ny * a1) * k);
        ctx.stroke();
        ctx.strokeStyle = pal.stoneLit;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = Math.max(0.8, 0.0018 * k);
        ctx.beginPath();
        ctx.moveTo((x + nx * a0 + tx * 0.003) * k, (y + ny * a0 + ty * 0.003) * k);
        ctx.lineTo((x + nx * a1 + tx * 0.003) * k, (y + ny * a1 + ty * 0.003) * k);
        ctx.stroke();
        /* Carved studs on every third block, and moss on some. */
        if ((n + (side > 0 ? 1 : 0)) % 3 === 0) {
          const m = 0.73 * D * side;
          const cx = (x + nx * m + tx * step * 0.5) * k;
          const cy = (y + ny * m + ty * step * 0.5) * k;
          ctx.globalAlpha = 0.6;
          ctx.fillStyle = pal.stoneLow;
          ctx.beginPath();
          ctx.arc(cx, cy, 0.0052 * k, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = pal.stoneLit;
          ctx.beginPath();
          ctx.arc(cx - 0.0012 * k, cy - 0.0014 * k, 0.0026 * k, 0, TAU);
          ctx.fill();
        }
        if (hash(n * 5 + (side > 0 ? 2 : 0)) < 0.34) {
          const m = 0.78 * D * side;
          const along = hash(n * 5 + 9) * step;
          mossBlob(ctx, (x + nx * m + tx * along) * k, (y + ny * m + ty * along) * k, 0.013 * k, pal, n * 3 + side);
        }
      }
    }
    ctx.globalAlpha = 1;

    /* The groove: a lit lower lip, the shadowed upper wall, the floor. */
    band(1.18, pal.grooveLit, 0.0045);
    band(1.18, pal.grooveLow, -0.0015);
    band(1.02, pal.groove, 0.003);
    /* Grit on the groove floor. */
    ctx.fillStyle = pal.grooveLow;
    for (let i = 0; i < 160; i += 1) {
      if (!this.sample(hash(i * 3 + 11) * len)) continue;
      const off = (hash(i * 3 + 12) - 0.5) * D * 0.8;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(this.pt.x * k + off * k * 0.3, this.pt.y * k + off * k, 0.0014 * k, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** The portal the chain rolls out of: a carved stone ring around the dark. */
  private paintPortal(ctx: Ctx, k: number): void {
    const pal = this.pal;
    const [px, py] = this.rules.track.pts[0];
    const x = px * k;
    const y = py * k;
    const R = 0.066 * k;
    ctx.fillStyle = pal.shadow;
    ctx.beginPath();
    ctx.arc(x + 0.004 * k, y + 0.008 * k, R * 1.06, 0, TAU);
    ctx.fill();
    ctx.fillStyle = pal.stoneEdge;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, TAU);
    ctx.fill();
    const g = ctx.createRadialGradient(x - R * 0.4, y - R * 0.5, R * 0.1, x, y, R);
    g.addColorStop(0, pal.stoneLit);
    g.addColorStop(0.6, pal.stone);
    g.addColorStop(1, pal.stoneLow);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, R * 0.95, 0, TAU);
    ctx.fill();
    /* Ten teeth carved round it. */
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * TAU + 0.3;
      ctx.save();
      ctx.translate(x + Math.cos(a) * R * 0.8, y + Math.sin(a) * R * 0.8);
      ctx.rotate(a);
      ctx.fillStyle = pal.stoneLow;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(-R * 0.09, -R * 0.07, R * 0.18, R * 0.14);
      ctx.fillStyle = pal.stoneLit;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(-R * 0.09, -R * 0.07, R * 0.18, R * 0.035);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    /* A thread of gold, and the dark. */
    ctx.strokeStyle = pal.gold;
    ctx.lineWidth = Math.max(1, 0.003 * k);
    ctx.beginPath();
    ctx.arc(x, y, R * 0.66, 0, TAU);
    ctx.stroke();
    const d = ctx.createRadialGradient(x + R * 0.05, y + R * 0.08, 0, x, y, R * 0.6);
    d.addColorStop(0, pal.pit);
    d.addColorStop(0.75, pal.pit);
    d.addColorStop(1, pal.stoneEdge);
    ctx.fillStyle = d;
    ctx.beginPath();
    ctx.arc(x, y, R * 0.6, 0, TAU);
    ctx.fill();
    mossBlob(ctx, x - R * 0.7, y + R * 0.55, 0.016 * k, pal, 77);
    mossBlob(ctx, x + R * 0.2, y - R * 0.85, 0.012 * k, pal, 78);
  }

  /** The sun-idol the chain rolls into. Returns its rays, for the warning to trace. */
  private paintIdol(ctx: Ctx, k: number): Path2D {
    const pal = this.pal;
    const end = this.rules.track.pts[this.rules.track.pts.length - 1];
    const x = end[0] * k;
    const y = end[1] * k;
    const R = 0.07 * k;
    /* Shadow. */
    ctx.fillStyle = pal.shadow;
    ctx.beginPath();
    ctx.arc(x + 0.005 * k, y + 0.01 * k, R * 1.55, 0, TAU);
    ctx.fill();
    /* Rays: sixteen, long and short. */
    const rays = new Path2D();
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * TAU - Math.PI / 2;
      const long = i % 2 === 0;
      const tip = R * (long ? 1.62 : 1.36);
      const half = long ? 0.14 : 0.11;
      rays.moveTo(x + Math.cos(a - half) * R * 0.9, y + Math.sin(a - half) * R * 0.9);
      rays.lineTo(x + Math.cos(a) * tip, y + Math.sin(a) * tip);
      rays.lineTo(x + Math.cos(a + half) * R * 0.9, y + Math.sin(a + half) * R * 0.9);
      rays.closePath();
    }
    ctx.fillStyle = pal.goldLow;
    ctx.save();
    ctx.translate(0.0025 * k, 0.003 * k);
    ctx.fill(rays);
    ctx.restore();
    const rg = ctx.createRadialGradient(x - R * 0.6, y - R * 0.7, R * 0.2, x, y, R * 1.7);
    rg.addColorStop(0, pal.goldLit);
    rg.addColorStop(0.55, pal.gold);
    rg.addColorStop(1, pal.goldLow);
    ctx.fillStyle = rg;
    ctx.fill(rays);
    /* Pico's crest, carved over the disc: three feathers, the temple's mark. */
    ctx.save();
    ctx.translate(x, y - R * 0.98);
    for (const [a, l] of [
      [-0.55, 0.62],
      [0, 0.78],
      [0.55, 0.62],
    ] as const) {
      ctx.save();
      ctx.rotate(a);
      ctx.fillStyle = pal.goldLow;
      ctx.beginPath();
      ctx.ellipse(0.002 * k, -R * l * 0.5 + 0.003 * k, R * 0.16, R * l * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = pal.gold;
      ctx.beginPath();
      ctx.ellipse(0, -R * l * 0.5, R * 0.15, R * l * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = pal.goldLit;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.ellipse(-R * 0.04, -R * l * 0.62, R * 0.05, R * l * 0.3, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    ctx.restore();
    /* The disc: a rim, a bevel, twelve studs. */
    ctx.fillStyle = pal.goldDeep;
    ctx.beginPath();
    ctx.arc(x, y, R * 1.02, 0, TAU);
    ctx.fill();
    const dg = ctx.createRadialGradient(x - R * 0.45, y - R * 0.55, R * 0.1, x, y, R);
    dg.addColorStop(0, pal.goldLit);
    dg.addColorStop(0.5, pal.gold);
    dg.addColorStop(1, pal.goldLow);
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.arc(x, y, R * 0.94, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = pal.goldDeep;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = Math.max(1, 0.0035 * k);
    ctx.beginPath();
    ctx.arc(x, y, R * 0.8, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * TAU;
      const sx = x + Math.cos(a) * R * 0.87;
      const sy = y + Math.sin(a) * R * 0.87;
      ctx.fillStyle = pal.goldDeep;
      ctx.beginPath();
      ctx.arc(sx + 0.001 * k, sy + 0.0012 * k, R * 0.055, 0, TAU);
      ctx.fill();
      ctx.fillStyle = pal.goldLit;
      ctx.beginPath();
      ctx.arc(sx, sy, R * 0.045, 0, TAU);
      ctx.fill();
    }
    /* The pit. */
    const pg = ctx.createRadialGradient(x + R * 0.06, y + R * 0.12, 0, x, y, R * 0.72);
    pg.addColorStop(0, pal.pit);
    pg.addColorStop(0.7, pal.pit);
    pg.addColorStop(1, pal.pitRim);
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(x, y, R * 0.72, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = pal.goldLit;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(1, 0.002 * k);
    ctx.beginPath();
    ctx.arc(x, y, R * 0.72, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return rays;
  }

  private paintNestBack(ctx: Ctx, k: number): void {
    const nest = PICUMA.nest;
    const x = (this.rules.shooter.x - nest.dx) * k;
    const y = this.nestY * k;
    const R = nest.r * k;
    ctx.fillStyle = this.pal.shadow;
    ctx.beginPath();
    ctx.ellipse(x + R * 0.1, y + R * 0.35, R * 1.2, R * 0.45, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.pal.barkLow;
    ctx.beginPath();
    ctx.ellipse(x, y - R * 0.02, R * 1.02, R * 0.4, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.pal.nest;
    ctx.beginPath();
    ctx.ellipse(x, y - R * 0.08, R * 0.82, R * 0.26, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = this.pal.barkLow;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.ellipse(x, y - R * 0.04, R * 0.7, R * 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* ── the courtyard's pieces ────────────────────────────────────────────── */

function paintFloor(ctx: Ctx, w: number, h: number, k: number, pal: PicumaPalette, theme: PicumaTheme): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, pal.groundTop);
  g.addColorStop(1, pal.groundLow);
  ctx.fillStyle = pal.joint;
  ctx.fillRect(0, 0, w, h);

  /*
   * Flagstones laid as random ashlar: columns of their own widths, each cut
   * into stones of their own heights, so no joint runs right across the floor.
   * Courses that line up read as a brick **wall**, and this is a floor seen
   * from above.
   */
  const gap = 0.0042;
  const H = h / k;
  let col = 0;
  for (let x = -0.04; x < 1.02; col += 1) {
    const cw = 0.13 + hash(col * 53 + 1) * 0.12;
    let y = -0.02 - hash(col * 53 + 2) * 0.1;
    let r = 0;
    while (y < H + 0.02) {
      const ch = 0.09 + hash(col * 53 + r * 7 + 3) * 0.11;
      const seed = col * 211 + r * 17;
      const x0 = (x + gap) * k;
      const y0 = (y + gap) * k;
      const ww = (cw - gap * 2) * k;
      const hh = (ch - gap * 2) * k;
      const tone = hash(seed + 2);
      const radius = (0.006 + hash(seed + 8) * 0.01) * k;
      ctx.fillStyle = g;
      roundRect(ctx, x0, y0, ww, hh, radius);
      ctx.fill();
      ctx.fillStyle = tone < 0.5 ? pal.slab : pal.slabAlt;
      ctx.globalAlpha = 0.5 + tone * 0.4;
      ctx.fill();
      /* Lit from the top left: a pale wash in that corner of every stone. */
      const lg = ctx.createLinearGradient(x0, y0, x0 + ww * 0.6, y0 + hh * 0.8);
      lg.addColorStop(0, withAlpha(pal.slabLit, 0.55));
      lg.addColorStop(1, withAlpha(pal.slabLit, 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = lg;
      ctx.fill();
      /* Pores and grit. */
      for (let i = 0; i < 7; i += 1) {
        ctx.globalAlpha = 0.18 + hash(seed + 30 + i) * 0.2;
        ctx.fillStyle = i < 5 ? pal.joint : pal.slabLit;
        ctx.beginPath();
        ctx.arc(x0 + ww * hash(seed + 40 + i), y0 + hh * hash(seed + 50 + i), (0.0014 + hash(seed + 60 + i) * 0.0022) * k, 0, TAU);
        ctx.fill();
      }
      /* The odd crack. */
      if (hash(seed + 3) < 0.22) {
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = pal.joint;
        ctx.lineWidth = Math.max(0.8, 0.0016 * k);
        ctx.beginPath();
        let cx = x0 + ww * (0.2 + hash(seed + 4) * 0.6);
        let cy = y0;
        ctx.moveTo(cx, cy);
        for (let s = 0; s < 4; s += 1) {
          cx += (hash(seed + 10 + s) - 0.5) * ww * 0.3;
          cy += hh * 0.26;
          ctx.lineTo(cx, cy);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      /* Moss creeping out of a joint. */
      if (hash(seed + 5) < 0.32) {
        const corner = hash(seed + 6);
        mossBlob(ctx, corner < 0.5 ? x0 : x0 + ww, y0 + hh * (corner < 0.25 || corner > 0.75 ? 1 : 0), 0.018 * k, pal, seed);
      }
      y += ch;
      r += 1;
    }
    x += cw;
  }

  /* The light over the canopy: the moon at night, the sun in the morning. */
  const sx = theme === 'dark' ? 0.86 * k : 0.12 * k;
  const sy = -0.12 * k;
  const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 1.1 * k);
  sg.addColorStop(0, withAlpha(pal.sky, pal.skyAlpha));
  sg.addColorStop(1, withAlpha(pal.sky, 0));
  if (theme === 'dark') ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  if (theme === 'light') {
    /* Shafts of morning light through the canopy. */
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = pal.sky;
    for (let i = 0; i < 4; i += 1) {
      const x0 = (0.02 + i * 0.22 + hash(i + 40) * 0.08) * k;
      const wd = (0.05 + hash(i + 50) * 0.06) * k;
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.lineTo(x0 + wd, 0);
      ctx.lineTo(x0 + wd + 0.55 * k, h);
      ctx.lineTo(x0 + 0.55 * k - wd * 0.3, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

/** The sun-calendar cut into the floor under the shooter. */
function paintInlay(ctx: Ctx, k: number, pal: PicumaPalette, cx: number, cy: number): void {
  const x = cx * k;
  const y = cy * k;
  ctx.save();
  ctx.globalAlpha = pal.inlayAlpha;
  ctx.strokeStyle = pal.inlay;
  ctx.fillStyle = pal.inlay;
  ctx.lineWidth = Math.max(1, 0.004 * k);
  for (const r of [0.235, 0.205, 0.125, 0.058]) {
    ctx.beginPath();
    ctx.arc(x, y, r * k, 0, TAU);
    ctx.stroke();
  }
  for (let i = 0; i < 40; i += 1) {
    const a = (i / 40) * TAU;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * 0.205 * k, y + Math.sin(a) * 0.205 * k);
    ctx.lineTo(x + Math.cos(a) * (i % 5 === 0 ? 0.235 : 0.222) * k, y + Math.sin(a) * (i % 5 === 0 ? 0.235 : 0.222) * k);
    ctx.stroke();
  }
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU + Math.PI / 8;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a - 0.2) * 0.07 * k, y + Math.sin(a - 0.2) * 0.07 * k);
    ctx.lineTo(x + Math.cos(a) * 0.118 * k, y + Math.sin(a) * 0.118 * k);
    ctx.lineTo(x + Math.cos(a + 0.2) * 0.07 * k, y + Math.sin(a + 0.2) * 0.07 * k);
    ctx.closePath();
    ctx.stroke();
  }
  /* Glyphs in the band: little squares and dots. */
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * TAU;
    const gx = x + Math.cos(a) * 0.165 * k;
    const gy = y + Math.sin(a) * 0.165 * k;
    if (i % 2 === 0) ctx.strokeRect(gx - 0.008 * k, gy - 0.008 * k, 0.016 * k, 0.016 * k);
    else {
      ctx.beginPath();
      ctx.arc(gx, gy, 0.005 * k, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Ferns and big leaves where the courtyard meets the jungle. */
function paintPlantsBack(ctx: Ctx, k: number, h: number, pal: PicumaPalette): void {
  const H = h / k;
  /* Left flank, below the turn. */
  fern(ctx, -0.02 * k, (H - 0.36) * k, 0.2 * k, -0.35, pal, 1);
  bigLeaf(ctx, -0.03 * k, (H - 0.47) * k, 0.15 * k, 0.07 * k, -0.15, pal, 2);
  bigLeaf(ctx, -0.02 * k, (H - 0.28) * k, 0.13 * k, 0.06 * k, 0.25, pal, 1);
  /* Right flank, below the idol. */
  fern(ctx, 1.02 * k, (H - 0.4) * k, 0.2 * k, Math.PI + 0.35, pal, 2);
  bigLeaf(ctx, 1.03 * k, (H - 0.5) * k, 0.14 * k, 0.065 * k, Math.PI + 0.12, pal, 1);
  bigLeaf(ctx, 1.02 * k, (H - 0.3) * k, 0.13 * k, 0.06 * k, Math.PI - 0.3, pal, 2);
  /* Between the right turn and the idol. */
  bigLeaf(ctx, 1.02 * k, 0.5 * k, 0.09 * k, 0.04 * k, Math.PI + 0.2, pal, 0);
  /* Top left, above the portal. */
  fern(ctx, -0.02 * k, 0.04 * k, 0.15 * k, 0.15, pal, 0);
}

/** The jungle's edge along the top: big leaves reaching in. */
function paintCanopy(ctx: Ctx, k: number, pal: PicumaPalette): void {
  const leaves: Array<[number, number, number, number, number]> = [
    // x, y, length, angle, tone
    [0.18, -0.03, 0.11, 1.9, 0],
    [0.3, -0.04, 0.12, 1.4, 1],
    [0.45, -0.035, 0.1, 1.75, 0],
    [0.58, -0.04, 0.12, 1.3, 2],
    [0.7, -0.03, 0.1, 1.85, 1],
    [0.82, -0.04, 0.12, 1.45, 0],
    [0.95, -0.03, 0.11, 2.1, 2],
    [0.38, -0.02, 0.08, 1.15, 2],
    [0.64, -0.02, 0.08, 2.0, 1],
  ];
  for (const [x, y, len, a, tone] of leaves) {
    bigLeaf(ctx, x * k, y * k, len * k, len * 0.42 * k, a, pal, tone);
  }
}

/** The branch across the bottom, with moss, a knot and a few leaves. */
function paintBranch(ctx: Ctx, k: number, h: number, pal: PicumaPalette, cx: number, y: number): void {
  const B = { y };
  const top = (x: number) => B.y + 0.02 * ((x - cx) / 0.5) ** 4 + 0.002 * Math.sin(x * 23);
  const path = new Path2D();
  path.moveTo(-0.05 * k, h + 4);
  for (let i = 0; i <= 40; i += 1) {
    const x = -0.05 + (i / 40) * 1.1;
    path.lineTo(x * k, top(x) * k);
  }
  path.lineTo(1.05 * k, h + 4);
  path.closePath();
  ctx.save();
  ctx.translate(0, 0.006 * k);
  ctx.fillStyle = pal.shadow;
  ctx.fill(path);
  ctx.restore();
  const g = ctx.createLinearGradient(0, (B.y - 0.005) * k, 0, h);
  g.addColorStop(0, pal.barkLit);
  g.addColorStop(0.35, pal.bark);
  g.addColorStop(1, pal.barkLow);
  ctx.fillStyle = g;
  ctx.fill(path);
  /* Grain. */
  ctx.save();
  ctx.clip(path);
  ctx.strokeStyle = pal.barkLow;
  ctx.lineWidth = Math.max(1, 0.0025 * k);
  for (let i = 0; i < 9; i += 1) {
    const y0 = B.y + 0.006 + i * 0.004;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    for (let j = 0; j <= 30; j += 1) {
      const x = -0.05 + (j / 30) * 1.1;
      const y = top(x) - B.y + y0 + 0.0025 * Math.sin(x * (9 + i) + i * 2);
      if (j === 0) ctx.moveTo(x * k, y * k);
      else ctx.lineTo(x * k, y * k);
    }
    ctx.stroke();
  }
  /* Knots. */
  for (const kx of [0.16, 0.86]) {
    const ky = top(kx) + 0.014;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = pal.barkLow;
    ctx.beginPath();
    ctx.ellipse(kx * k, ky * k, 0.018 * k, 0.008 * k, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = pal.barkLit;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.ellipse(kx * k, ky * k, 0.012 * k, 0.005 * k, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  /* A lit upper edge. */
  ctx.strokeStyle = pal.barkLit;
  ctx.lineWidth = Math.max(1, 0.003 * k);
  ctx.beginPath();
  for (let i = 0; i <= 40; i += 1) {
    const x = -0.05 + (i / 40) * 1.1;
    if (i === 0) ctx.moveTo(x * k, (top(x) + 0.0015) * k);
    else ctx.lineTo(x * k, (top(x) + 0.0015) * k);
  }
  ctx.stroke();
  /* Moss along the top, and leaves sprouting. */
  for (let i = 0; i < 14; i += 1) {
    const x = 0.03 + hash(i * 17 + 300) * 0.94;
    if (Math.abs(x - cx) < 0.15) continue;
    mossBlob(ctx, x * k, (top(x) + 0.003) * k, 0.016 * k, pal, i + 300);
  }
  bigLeaf(ctx, 0.84 * k, (top(0.84) + 0.002) * k, 0.07 * k, 0.03 * k, -2.2, pal, 1);
  bigLeaf(ctx, 0.86 * k, (top(0.86) + 0.002) * k, 0.06 * k, 0.026 * k, -0.9, pal, 2);
  bigLeaf(ctx, 0.12 * k, (top(0.12) + 0.002) * k, 0.06 * k, 0.026 * k, -2.3, pal, 2);
}

/** The torches' poles and bowls; the flames are live. */
function paintTorches(ctx: Ctx, k: number, h: number, pal: PicumaPalette, top: number): void {
  for (const torch of PICUMA.torches) {
    const x = torch.x * k;
    const y = top * k;
    const pw = 0.012 * k;
    /* The pole, bound in three places. */
    ctx.fillStyle = pal.shadow;
    ctx.fillRect(x - pw / 2 + 0.006 * k, y + 0.02 * k, pw, h - y);
    const g = ctx.createLinearGradient(x - pw / 2, 0, x + pw / 2, 0);
    g.addColorStop(0, pal.pole);
    g.addColorStop(1, pal.poleLow);
    ctx.fillStyle = g;
    ctx.fillRect(x - pw / 2, y + 0.015 * k, pw, h - y);
    ctx.fillStyle = pal.nest;
    for (const by of [0.055, 0.12, 0.2]) {
      ctx.fillRect(x - pw * 0.7, y + by * k, pw * 1.4, 0.006 * k);
    }
    /* The bowl. */
    ctx.fillStyle = pal.poleLow;
    ctx.beginPath();
    ctx.moveTo(x - 0.03 * k, y - 0.004 * k);
    ctx.lineTo(x + 0.03 * k, y - 0.004 * k);
    ctx.lineTo(x + 0.014 * k, y + 0.024 * k);
    ctx.lineTo(x - 0.014 * k, y + 0.024 * k);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pal.nest;
    ctx.beginPath();
    ctx.ellipse(x, y - 0.004 * k, 0.03 * k, 0.007 * k, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = pal.goldDeep;
    ctx.beginPath();
    ctx.ellipse(x, y - 0.004 * k, 0.024 * k, 0.0045 * k, 0, 0, TAU);
    ctx.fill();
  }
}

function paintVignette(ctx: Ctx, w: number, h: number, pal: PicumaPalette): void {
  const g = ctx.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.42, w / 2, h * 0.5, Math.hypot(w, h) * 0.62);
  g.addColorStop(0, withAlpha(pal.vignette, 0));
  g.addColorStop(1, pal.vignette);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/* ── shapes ────────────────────────────────────────────────────────────── */

function roundRect(ctx: Ctx2, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/** A soft clump of moss: a few overlapping discs, a lit speck or two. */
function mossBlob(ctx: Ctx, x: number, y: number, r: number, pal: PicumaPalette, seed: number): void {
  ctx.save();
  ctx.fillStyle = pal.moss;
  for (let i = 0; i < 5; i += 1) {
    const a = hash(seed * 11 + i) * TAU;
    const d = hash(seed * 11 + i + 5) * r * 0.7;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, r * (0.35 + hash(seed * 11 + i + 9) * 0.35), 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = pal.mossLit;
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < 3; i += 1) {
    const a = hash(seed * 13 + i) * TAU;
    const d = hash(seed * 13 + i + 3) * r * 0.6;
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6 - r * 0.1, r * 0.14, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** A broad leaf from (x, y) along `angle`: shaded underside, midrib, side veins. */
function bigLeaf(ctx: Ctx, x: number, y: number, len: number, wid: number, angle: number, pal: PicumaPalette, tone: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const outline = new Path2D();
  outline.moveTo(0, 0);
  outline.bezierCurveTo(len * 0.25, -wid * 1.05, len * 0.75, -wid * 0.9, len, 0);
  outline.bezierCurveTo(len * 0.72, wid * 0.85, len * 0.25, wid * 1.0, 0, 0);
  ctx.fillStyle = pal.shadow;
  ctx.save();
  ctx.translate(len * 0.03, len * 0.05);
  ctx.fill(outline);
  ctx.restore();
  ctx.fillStyle = tone === 0 ? pal.leafDeep : tone === 1 ? pal.leaf : pal.leafLit;
  ctx.fill(outline);
  ctx.save();
  ctx.clip(outline);
  ctx.fillStyle = pal.leafDeep;
  ctx.globalAlpha = 0.45;
  ctx.fillRect(0, 0, len, wid * 1.2);
  ctx.restore();
  ctx.strokeStyle = pal.vein;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = Math.max(1, wid * 0.08);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(len * 0.02, 0);
  ctx.quadraticCurveTo(len * 0.5, -wid * 0.08, len * 0.92, 0);
  ctx.stroke();
  ctx.lineWidth = Math.max(0.7, wid * 0.04);
  ctx.globalAlpha = 0.5;
  for (let i = 1; i <= 4; i += 1) {
    const f = i / 5;
    const bx = len * f;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.quadraticCurveTo(bx + len * 0.08, side * wid * 0.4, bx + len * 0.14, side * wid * 0.62 * (1 - f * 0.4));
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** A fern frond: a curving stem with leaflets shrinking toward the tip. */
function fern(ctx: Ctx, x: number, y: number, len: number, angle: number, pal: PicumaPalette, tone: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const colour = tone === 0 ? pal.leafDeep : tone === 1 ? pal.leaf : pal.leafLit;
  ctx.strokeStyle = pal.vein;
  ctx.lineWidth = Math.max(1, len * 0.02);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.12, len, len * 0.05);
  ctx.stroke();
  const n = 11;
  for (let i = 1; i <= n; i += 1) {
    const f = i / (n + 1);
    const px = len * f;
    const py = -len * 0.12 * 4 * f * (1 - f) * 0.5 + len * 0.05 * f * f;
    const size = len * 0.2 * (1 - f * 0.75);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(side * 1.05 + 0.25);
      ctx.fillStyle = pal.shadow;
      ctx.beginPath();
      ctx.ellipse(size * 0.5 + len * 0.006, len * 0.008, size * 0.5, size * 0.17, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.ellipse(size * 0.5, 0, size * 0.5, size * 0.17, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

/** A teardrop flame with its base at (x, y), leaning by `sway`. */
function flame(ctx: Ctx, x: number, y: number, wid: number, tall: number, sway: number, colour: string): void {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(x - wid, y);
  ctx.bezierCurveTo(x - wid, y - tall * 0.45, x - wid * 0.2 + sway * wid, y - tall * 0.7, x + sway * wid * 1.6, y - tall);
  ctx.bezierCurveTo(x + wid * 0.25 + sway * wid, y - tall * 0.65, x + wid, y - tall * 0.45, x + wid, y);
  ctx.quadraticCurveTo(x, y + wid * 0.45, x - wid, y);
  ctx.fill();
}

/* ── sprites ───────────────────────────────────────────────────────────── */

/** Orb sprites are drawn this much larger than the chain's orb, so the held one can grow without blurring. */
const ORB_SPRITE_SCALE = 1.2;

/**
 * One polished stone with its mark engraved: a contact shadow, a body lit
 * from the top left, a rim, the mark with a lit lip under it, a specular.
 */
function orbSprite(stone: OrbStone, kind: number, R: number, ratio: number, shadow: string): HTMLCanvasElement {
  const pad = R * 0.45;
  const size = (R + pad) * 2;
  const c = makeCanvas(size * ratio, size * ratio);
  const ctx = c.getContext('2d')!;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const x = size / 2;
  const y = size / 2;

  /* Contact shadow, down and a little right. */
  const sg = ctx.createRadialGradient(x + R * 0.1, y + R * 0.34, 0, x + R * 0.1, y + R * 0.34, R * 1.05);
  sg.addColorStop(0, shadow);
  sg.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.ellipse(x + R * 0.1, y + R * 0.34, R * 1.05, R * 0.8, 0, 0, TAU);
  ctx.fill();

  /* The stone. */
  const g = ctx.createRadialGradient(x - R * 0.38, y - R * 0.42, R * 0.05, x - R * 0.08, y - R * 0.1, R * 1.22);
  g.addColorStop(0, stone.lit);
  g.addColorStop(0.42, stone.base);
  g.addColorStop(1, stone.shade);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.fill();

  /* Light bounced back up from the floor, along the lower right. */
  ctx.strokeStyle = stone.lit;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = R * 0.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, R * 0.8, Math.PI * 0.08, Math.PI * 0.55);
  ctx.stroke();
  ctx.globalAlpha = 1;

  /* Rim. */
  ctx.strokeStyle = stone.rim;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = Math.max(0.8, R * 0.075);
  ctx.beginPath();
  ctx.arc(x, y, R - ctx.lineWidth / 2, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;

  /* The mark, engraved: its lip first, a hair down and right, then the cut. */
  ctx.globalAlpha = 0.6;
  markPath(ctx, kind, x + R * 0.05, y + R * 0.065, R, stone.lip);
  ctx.globalAlpha = 0.95;
  markPath(ctx, kind, x, y, R, stone.ink);
  ctx.globalAlpha = 1;

  /* The shine. */
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
  ctx.beginPath();
  ctx.ellipse(x - R * 0.36, y - R * 0.48, R * 0.3, R * 0.16, -0.55, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.beginPath();
  ctx.arc(x - R * 0.6, y - R * 0.12, R * 0.06, 0, TAU);
  ctx.fill();
  return c;
}

/** The four marks: dot, ring, bar, cross. Bold, because they carry the kind. */
function markPath(ctx: Ctx2, kind: number, x: number, y: number, R: number, colour: string): void {
  const lw = R * 0.22;
  ctx.fillStyle = colour;
  ctx.strokeStyle = colour;
  ctx.lineCap = 'round';
  ctx.lineWidth = lw;
  ctx.beginPath();
  if (kind === 0) {
    ctx.arc(x, y, R * 0.3, 0, TAU);
    ctx.fill();
  } else if (kind === 1) {
    ctx.arc(x, y, R * 0.43, 0, TAU);
    ctx.stroke();
  } else if (kind === 2) {
    ctx.lineWidth = lw * 1.15;
    ctx.moveTo(x - R * 0.48, y);
    ctx.lineTo(x + R * 0.48, y);
    ctx.stroke();
  } else {
    const d = R * 0.35;
    ctx.moveTo(x - d, y - d);
    ctx.lineTo(x + d, y + d);
    ctx.moveTo(x + d, y - d);
    ctx.lineTo(x - d, y + d);
    ctx.stroke();
  }
}

/** A soft round glow in one colour, drawn once and scaled for every use. */
function glowSprite(colour: string): HTMLCanvasElement {
  const size = 128;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, withAlpha(colour, 1));
  g.addColorStop(0.35, withAlpha(colour, 0.45));
  g.addColorStop(1, withAlpha(colour, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** A swap: both orbs dip and come back. 1 when no swap is running. */
function swapScale(ms: number): number {
  if (ms < 0 || ms >= 240) return 1;
  const t = ms / 240;
  return t < 0.4 ? 1 - (t / 0.4) * 0.75 : 0.25 + 0.75 * easeOutBack((t - 0.4) / 0.6);
}

/** `#rrggbb` or `rgba(r, g, b, a)` at a new alpha. */
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
