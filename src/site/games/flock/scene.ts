import { PICO_BRAND, drawPico, picoBlinkAt, picoSizeForBodyRadius, type DrawPicoOptions, type PicoPose } from '../../pico';
import { SNAKE_COLS, SNAKE_ROWS, type Dir } from '../arcade';
import {
  CHICKS,
  CHICK_PARTS,
  DIZZY,
  FLOCK,
  FLOCK_PALETTE,
  TREATS,
  TREAT_ORDER,
  type ChickPlumage,
  type FlockPalette,
  type FlockTheme,
  type TreatKind,
} from './config';

/**
 * Pico's Flock — the painter behind the Snake screen.
 *
 * ## Rules in, picture out
 *
 * `Snake.tsx` keeps the game exactly as it was: the state is `SnakeState`, a
 * tick is `snakeStep`, and nothing here can change either. This object only
 * *watches*: the screen tells it each tick that happened (`step`), the crash or
 * the clock (`crash`, `timeUp`), and every display frame hands it the board as
 * it stands plus how far through the current tick the frame is (`paint`). From
 * that it draws Pico gliding between cells rather than jumping, the chicks
 * hopping after him, a treat being gulped, a new chick joining — all of it a
 * picture of the one tick-based game, never a second simulation of it.
 *
 * **The glide is drawn one tick behind the rules**, and that is the standard
 * trade: a segment is painted between where it was before the last tick and
 * where the tick put it, so motion is continuous and nothing is guessed. A
 * guess (painting toward the *next* cell) would have to know the next turn,
 * and a wrong guess snaps back. One tick is 70–140 ms; a turn pressed now is
 * applied on the next tick anyway.
 *
 * ## Per frame, no garbage
 *
 * The lawn and the hedge are painted once per size and theme into two layers
 * (`ground` under the birds, `front` — the near hedge — over them); every chick
 * and treat is a pre-rendered sprite; particles live in a fixed pool; the
 * birds' positions go into typed arrays sized for the whole board. Pico is the
 * one bird drawn live, through `drawPico`, which allocates nothing.
 *
 * ## Reduced motion
 *
 * The glide stays — it is the game, and it is gentler than a jump — and
 * everything ambient goes: no hop, no bob, no butterflies or fireflies, no
 * cloud shadows, no shake, no particles. Poses still change, because a pose is
 * a state, not a motion.
 */

const TAU = Math.PI * 2;
const CELLS = SNAKE_COLS * SNAKE_ROWS;

/** What the screen hands over every frame. All read-only here. */
export interface FlockView {
  body: readonly number[];
  /** The body before the last tick — where the glide starts. */
  from: readonly number[];
  /** How far through the current tick, 0..1. */
  p: number;
  food: number;
  eaten: number;
  phase: 'ready' | 'playing' | 'over';
  end: 'crash' | 'time' | null;
}

export interface FlockScene {
  /** The board is `size` CSS px square, drawn at `ratio`. Cheap when nothing changed. */
  resize(size: number, ratio: number, theme: FlockTheme): void;
  /** One tick was taken: `from` → `to`, and whether it ate. */
  step(from: readonly number[], to: readonly number[], ate: boolean, eaten: number, now: number, tickMs: number): void;
  crash(dir: Dir, wall: boolean, now: number): void;
  timeUp(now: number): void;
  paint(ctx: CanvasRenderingContext2D, now: number, view: FlockView): void;
}

/* ── small helpers ──────────────────────────────────────────────────────── */

/** mulberry32 — the lawn's decoration comes from a fixed seed, so it never reshuffles. */
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

function makeLayer(w: number, h: number, ratio: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * ratio));
  canvas.height = Math.max(1, Math.round(h * ratio));
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return [canvas, ctx];
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * `colour` at alpha 0 — what a gradient fades *to*. Fading to transparent
 * black passes through grey wherever stops are interpolated unpremultiplied,
 * which is how a warm glow on grass came out as a grey smudge.
 */
function transparent(colour: string): string {
  if (colour.startsWith('#')) return `${colour.slice(0, 7)}00`;
  const parts = colour.slice(colour.indexOf('(') + 1, colour.indexOf(')')).split(',');
  return `rgba(${parts[0]},${parts[1]},${parts[2]},0)`;
}
const easeOutBack = (t: number) => {
  const c = 1.9;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
};

/** A body-coloured disc with its underside in shade — the crescent every round thing here wears. */
function shadedDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, shade: string, sx = 0.07, sy = -0.12) {
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x + r * sx, y + r * sy, r * 0.97, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number, points: number, rot: number) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / points;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/* ── the sprites ────────────────────────────────────────────────────────── */

/**
 * A chick at the origin, facing right, radius `R`. `wing` is -1 (down) … 1
 * (up). Baby Pico: his bill, his ink, his blush and a tuft for a crest, on a
 * ball of fluff — so a line of them reads as his family, not as beads.
 */
function paintChick(ctx: CanvasRenderingContext2D, R: number, plume: ChickPlumage, wing: number) {
  const P = CHICK_PARTS;
  // Feet first, behind the body.
  ctx.strokeStyle = P.feet;
  ctx.lineCap = 'round';
  ctx.lineWidth = R * 0.13;
  ctx.beginPath();
  ctx.moveTo(-R * 0.18, R * 0.8);
  ctx.lineTo(-R * 0.22, R * 1.08);
  ctx.moveTo(R * 0.2, R * 0.8);
  ctx.lineTo(R * 0.22, R * 1.08);
  ctx.stroke();
  // A stub of a tail.
  ctx.fillStyle = plume.wing;
  ctx.save();
  ctx.translate(-R * 0.92, R * 0.05);
  ctx.rotate(-0.5);
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 0.34, R * 0.16, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
  // The tuft: three feathers on the crown, the middle one tallest.
  ctx.fillStyle = plume.tuft;
  for (let i = 0; i < 3; i += 1) {
    ctx.save();
    ctx.translate(R * (-0.12 + i * 0.16), -R * 0.86);
    ctx.rotate(-0.55 + i * 0.5);
    ctx.beginPath();
    ctx.ellipse(0, -R * 0.14, R * 0.09, R * (i === 1 ? 0.24 : 0.18), 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  // Body, underside, belly.
  shadedDisc(ctx, 0, 0, R, plume.body, plume.shade);
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.clip();
  ctx.fillStyle = plume.belly;
  ctx.beginPath();
  ctx.ellipse(R * 0.26, R * 0.42, R * 0.55, R * 0.42, -0.2, 0, TAU);
  ctx.fill();
  // A soft sheen on the crown.
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-R * 0.22, -R * 0.5, R * 0.32, R * 0.16, -0.5, 0, TAU);
  ctx.fill();
  ctx.restore();
  // Cheek.
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = P.blush;
  ctx.beginPath();
  ctx.ellipse(R * 0.5, R * 0.14, R * 0.15, R * 0.09, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  // Eye and its catch-light.
  ctx.fillStyle = P.ink;
  ctx.beginPath();
  ctx.arc(R * 0.42, -R * 0.2, R * 0.15, 0, TAU);
  ctx.fill();
  ctx.fillStyle = P.glint;
  ctx.beginPath();
  ctx.arc(R * 0.47, -R * 0.26, R * 0.055, 0, TAU);
  ctx.fill();
  // Bill: upper and lower.
  ctx.fillStyle = P.beak;
  ctx.beginPath();
  ctx.moveTo(R * 0.78, -R * 0.16);
  ctx.quadraticCurveTo(R * 1.18, -R * 0.12, R * 1.22, R * 0.02);
  ctx.quadraticCurveTo(R * 1.0, R * 0.06, R * 0.8, R * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = P.beakLow;
  ctx.beginPath();
  ctx.moveTo(R * 0.82, R * 0.04);
  ctx.quadraticCurveTo(R * 1.04, R * 0.06, R * 1.06, R * 0.12);
  ctx.quadraticCurveTo(R * 0.94, R * 0.2, R * 0.82, R * 0.14);
  ctx.closePath();
  ctx.fill();
  // The wing, pivoting at the shoulder.
  ctx.save();
  ctx.translate(-R * 0.02, R * 0.02);
  ctx.rotate(-0.2 - wing * 0.65);
  ctx.fillStyle = plume.wing;
  ctx.beginPath();
  ctx.ellipse(-R * 0.26, R * 0.04, R * 0.46, R * 0.27, 0.15, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = plume.shade;
  ctx.beginPath();
  ctx.ellipse(-R * 0.42, R * 0.1, R * 0.24, R * 0.13, 0.15, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function paintTreat(ctx: CanvasRenderingContext2D, R: number, kind: TreatKind) {
  if (kind === 'cherry') {
    const T = TREATS.cherry;
    ctx.strokeStyle = T.stem;
    ctx.lineWidth = R * 0.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-R * 0.36, R * 0.0);
    ctx.quadraticCurveTo(-R * 0.25, -R * 0.55, R * 0.08, -R * 0.82);
    ctx.moveTo(R * 0.4, R * 0.08);
    ctx.quadraticCurveTo(R * 0.32, -R * 0.45, R * 0.08, -R * 0.82);
    ctx.stroke();
    ctx.save();
    ctx.translate(R * 0.3, -R * 0.82);
    ctx.rotate(-0.35);
    ctx.fillStyle = T.leaf;
    ctx.beginPath();
    ctx.ellipse(R * 0.22, 0, R * 0.26, R * 0.12, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = T.leafShade;
    ctx.lineWidth = R * 0.04;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(R * 0.44, 0);
    ctx.stroke();
    ctx.restore();
    for (const [x, y] of [[-R * 0.38, R * 0.3], [R * 0.4, R * 0.38]] as const) {
      shadedDisc(ctx, x, y, R * 0.48, T.fruit, T.shade);
      ctx.fillStyle = T.shine;
      ctx.beginPath();
      ctx.ellipse(x - R * 0.17, y - R * 0.17, R * 0.12, R * 0.07, -0.7, 0, TAU);
      ctx.fill();
    }
  } else if (kind === 'strawberry') {
    const T = TREATS.strawberry;
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(0, R * 0.98);
      ctx.bezierCurveTo(-R * 0.55, R * 0.78, -R * 0.95, R * 0.16, -R * 0.78, -R * 0.32);
      ctx.bezierCurveTo(-R * 0.62, -R * 0.72, R * 0.62, -R * 0.72, R * 0.78, -R * 0.32);
      ctx.bezierCurveTo(R * 0.95, R * 0.16, R * 0.55, R * 0.78, 0, R * 0.98);
      ctx.closePath();
    };
    ctx.fillStyle = T.shade;
    shape();
    ctx.fill();
    ctx.save();
    shape();
    ctx.clip();
    ctx.fillStyle = T.fruit;
    ctx.beginPath();
    ctx.ellipse(-R * 0.1, -R * 0.12, R * 0.82, R * 0.95, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = T.seed;
    for (let row = 0; row < 4; row += 1) {
      const y = -R * 0.25 + row * R * 0.3;
      const half = (0.62 - row * 0.12) * R;
      for (let x = -half; x <= half + 0.01; x += R * 0.3) {
        ctx.beginPath();
        ctx.ellipse(x + (row % 2) * R * 0.08, y, R * 0.045, R * 0.07, 0, 0, TAU);
        ctx.fill();
      }
    }
    // Calyx: five leaves fanned over the shoulders.
    ctx.fillStyle = T.calyx;
    for (let i = 0; i < 5; i += 1) {
      ctx.save();
      ctx.translate(0, -R * 0.56);
      ctx.rotate(-1.25 + i * 0.62);
      ctx.beginPath();
      ctx.ellipse(0, -R * 0.2, R * 0.11, R * 0.26, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = T.calyxShade;
    ctx.beginPath();
    ctx.ellipse(0, -R * 0.58, R * 0.2, R * 0.1, 0, 0, TAU);
    ctx.fill();
  } else if (kind === 'blueberry') {
    const T = TREATS.blueberry;
    for (const [x, y] of [[0, -R * 0.3], [-R * 0.42, R * 0.26], [R * 0.42, R * 0.3]] as const) {
      shadedDisc(ctx, x, y, R * 0.44, T.fruit, T.shade);
      ctx.fillStyle = T.crown;
      star(ctx, x + R * 0.06, y - R * 0.16, R * 0.12, R * 0.05, 5, -Math.PI / 2);
      ctx.fill();
      ctx.fillStyle = T.shine;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.ellipse(x - R * 0.18, y - R * 0.04, R * 0.08, R * 0.05, -0.6, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  } else {
    const T = TREATS.sunflower;
    for (let i = 0; i < 12; i += 1) {
      ctx.save();
      ctx.rotate((i * TAU) / 12);
      ctx.fillStyle = i % 2 ? T.petalShade : T.petal;
      ctx.beginPath();
      ctx.ellipse(R * 0.62, 0, R * 0.34, R * 0.15, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = T.centre;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.46, 0, TAU);
    ctx.fill();
    ctx.fillStyle = T.seed;
    for (let i = 0; i < 22; i += 1) {
      const a = i * 2.39996;
      const r = R * 0.075 * Math.sqrt(i + 0.5) * 1.3;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r, Math.sin(a) * r, R * 0.045, 0, TAU);
      ctx.fill();
    }
  }
}

const TREAT_BITS: Record<TreatKind, string> = {
  cherry: TREATS.cherry.fruit,
  strawberry: TREATS.strawberry.fruit,
  blueberry: TREATS.blueberry.fruit,
  sunflower: TREATS.sunflower.petal,
};

/* ── particles: a fixed pool ────────────────────────────────────────────── */

/* Plain numbers rather than an enum: `erasableSyntaxOnly` is on. */
const BIT = 0;
const SPARK = 1;
const FEATHER = 2;
const LEAF = 3;
const RING = 4;
const PUFF = 5;
type Kind = typeof BIT | typeof SPARK | typeof FEATHER | typeof LEAF | typeof RING | typeof PUFF;

interface Particle {
  on: boolean;
  kind: Kind;
  /** Position and velocity in cells and cells a second. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  rot: number;
  vr: number;
  size: number;
  colour: string;
  born: number;
  life: number;
}

const POOL = 120;

/* ── the scene ──────────────────────────────────────────────────────────── */

export function createFlockScene(reduced: boolean): FlockScene {
  let size = 0;
  let ratio = 1;
  let theme: FlockTheme = 'dark';
  let pal: FlockPalette = FLOCK_PALETTE.dark;
  let cell = 1;
  let ox = 0;
  let ground: HTMLCanvasElement | null = null;
  let front: HTMLCanvasElement | null = null;
  let chickSprites: HTMLCanvasElement[][] = [];
  let chickSide = 0;
  const treatSprites = new Map<TreatKind, HTMLCanvasElement>();
  let treatSide = 0;
  let glow: HTMLCanvasElement | null = null;
  let cloudBlob: HTMLCanvasElement | null = null;
  let halo: HTMLCanvasElement | null = null;

  /* Per segment, by index from the head — a segment keeps its identity as the
     line moves (segment i always steps into segment i-1's cell). */
  const facing = new Int8Array(CELLS + 1).fill(1);
  const flipAt = new Float64Array(CELLS + 1).fill(-1e9);
  const joinAt = new Float64Array(CELLS + 1).fill(-1e9);
  const tilt = new Float32Array(CELLS + 1);
  const tiltTo = new Float32Array(CELLS + 1);
  /* This frame's birds, by index: ground point in px, and the draw order. */
  const gx = new Float32Array(CELLS + 1);
  const gy = new Float32Array(CELLS + 1);
  const order = new Int16Array(CELLS + 1);

  const pool: Particle[] = Array.from({ length: POOL }, () => ({
    on: false,
    kind: BIT,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    g: 0,
    rot: 0,
    vr: 0,
    size: 0,
    colour: '',
    born: 0,
    life: 0,
  }));

  let munchCell = -1;
  let munchKind: TreatKind = 'cherry';
  let munchAt = 0;
  let munchMs = 140;
  let munchBurst = false;
  let treatBorn = -1e9;
  let crashAt = 0;
  let crashDir: Dir = 1;
  let doneAt = 0;
  let lastNow = 0;

  const pico: DrawPicoOptions = { x: 0, y: 0, size: 1, anchor: 'body', pose: 'idle', facing: 1, tilt: 0, blink: 0 };

  const colOf = (c: number) => c % SNAKE_COLS;
  const rowOf = (c: number) => Math.floor(c / SNAKE_COLS);

  function emit(
    kind: Kind,
    x: number,
    y: number,
    vx: number,
    vy: number,
    g: number,
    sizeCells: number,
    colour: string,
    born: number,
    life: number,
    vr = 0,
  ) {
    if (reduced) return;
    for (const p of pool) {
      if (p.on) continue;
      p.on = true;
      p.kind = kind;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.g = g;
      p.rot = Math.random() * TAU;
      p.vr = vr;
      p.size = sizeCells;
      p.colour = colour;
      p.born = born;
      p.life = life;
      return;
    }
  }

  /* ── the static layers ── */

  function build() {
    const c = cell;
    const m = FLOCK.margin * c;
    const lawn = SNAKE_COLS * c;
    const rand = seeded(FLOCK.decor.seed);

    /* Ground: margin soil, the mown lawn, its decoration, the far hedge. */
    const [g, gc] = makeLayer(size, size, ratio);
    gc.fillStyle = pal.hedgeDeep;
    gc.fillRect(0, 0, size, size);
    for (let y = 0; y < SNAKE_ROWS; y += 1) {
      for (let x = 0; x < SNAKE_COLS; x += 1) {
        gc.fillStyle = (x + y) % 2 ? pal.lawnB : pal.lawnA;
        gc.fillRect(m + x * c, m + y * c, c + 0.5, c + 0.5);
      }
    }
    /* The mower's sheen: each pass lays the blades one way, so a square catches
       the light at one end and not the other, and its neighbour the reverse. */
    for (let y = 0; y < SNAKE_ROWS; y += 1) {
      for (let x = 0; x < SNAKE_COLS; x += 1) {
        const up = (x + y) % 2 === 0;
        const sheen = gc.createLinearGradient(0, m + y * c, 0, m + (y + 1) * c);
        sheen.addColorStop(0, up ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)');
        sheen.addColorStop(1, up ? 'rgba(255,255,255,0)' : 'rgba(0,0,0,0)');
        gc.fillStyle = sheen;
        gc.fillRect(m + x * c, m + y * c, c + 0.5, c + 0.5);
      }
    }
    /* Blade texture: short strokes over every cell, so the checker is grass
       rather than paint, kept faint enough that the checker still counts. */
    gc.lineCap = 'round';
    gc.lineWidth = Math.max(0.6, c * 0.045);
    for (let i = 0; i < SNAKE_COLS * SNAKE_ROWS * 5; i += 1) {
      const x = m + rand() * lawn;
      const y = m + rand() * lawn;
      const len = c * (0.1 + rand() * 0.12);
      const a = -Math.PI / 2 + (rand() - 0.5) * 0.9;
      gc.globalAlpha = 0.22 + rand() * 0.18;
      gc.strokeStyle = rand() < 0.55 ? pal.blade : pal.bladeLit;
      gc.beginPath();
      gc.moveTo(x, y);
      gc.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      gc.stroke();
    }
    gc.globalAlpha = 1;
    /* Clover patches. */
    for (let i = 0; i < FLOCK.decor.clovers; i += 1) {
      const cx = m + (0.5 + rand() * (SNAKE_COLS - 1)) * c;
      const cy = m + (0.5 + rand() * (SNAKE_ROWS - 1)) * c;
      for (let k = 0; k < 3 + Math.floor(rand() * 3); k += 1) {
        const x = cx + (rand() - 0.5) * c * 0.9;
        const y = cy + (rand() - 0.5) * c * 0.9;
        gc.fillStyle = pal.clover;
        for (let leaf = 0; leaf < 3; leaf += 1) {
          const a = (leaf * TAU) / 3 - Math.PI / 2;
          gc.beginPath();
          gc.arc(x + Math.cos(a) * c * 0.07, y + Math.sin(a) * c * 0.07, c * 0.075, 0, TAU);
          gc.fill();
        }
      }
    }
    /* Flower patches near the hedge — low, so a bird walks over them. */
    for (const [px, py] of [[1.4, 14.2], [14.3, 1.6], [0.9, 6.5]] as const) {
      for (let k = 0; k < 4; k += 1) {
        const x = m + (px + (rand() - 0.5) * 1.4) * c;
        const y = m + (py + (rand() - 0.5) * 1.0) * c;
        const r = c * (0.13 + rand() * 0.04);
        const colour = pal.blossom[Math.floor(rand() * pal.blossom.length)];
        gc.strokeStyle = pal.blade;
        gc.lineWidth = Math.max(0.6, c * 0.04);
        gc.beginPath();
        gc.moveTo(x, y);
        gc.lineTo(x + c * 0.02, y + c * 0.22);
        gc.stroke();
        gc.fillStyle = colour;
        for (let leaf = 0; leaf < 5; leaf += 1) {
          const a = (leaf * TAU) / 5 + k;
          gc.beginPath();
          gc.ellipse(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.55, r * 0.36, a, 0, TAU);
          gc.fill();
        }
        gc.fillStyle = pal.petalEye;
        gc.beginPath();
        gc.arc(x, y, r * 0.32, 0, TAU);
        gc.fill();
      }
    }
    /* Pebbles. */
    for (let i = 0; i < FLOCK.decor.pebbles; i += 1) {
      const x = m + (0.3 + rand() * (SNAKE_COLS - 0.6)) * c;
      const y = m + (0.3 + rand() * (SNAKE_ROWS - 0.6)) * c;
      const r = c * (0.08 + rand() * 0.06);
      gc.fillStyle = pal.pebbleShade;
      gc.beginPath();
      gc.ellipse(x, y + r * 0.25, r * 1.35, r, 0, 0, TAU);
      gc.fill();
      gc.fillStyle = pal.pebble;
      gc.beginPath();
      gc.ellipse(x - r * 0.1, y, r * 1.2, r * 0.8, 0, 0, TAU);
      gc.fill();
    }
    /* Tufts: a fan of blades from one root, the near blade lit. */
    for (let i = 0; i < FLOCK.decor.tufts; i += 1) {
      const x = m + rand() * lawn;
      const y = m + rand() * lawn;
      const blades = 3 + Math.floor(rand() * 3);
      const h = c * (0.22 + rand() * 0.16);
      gc.lineWidth = Math.max(0.8, c * 0.06);
      for (let b = 0; b < blades; b += 1) {
        const lean = (b - (blades - 1) / 2) * 0.32 + (rand() - 0.5) * 0.2;
        gc.strokeStyle = b === blades - 1 ? pal.bladeLit : pal.blade;
        gc.globalAlpha = b === blades - 1 ? 0.6 : 0.4;
        gc.beginPath();
        gc.moveTo(x, y);
        gc.quadraticCurveTo(x + lean * h * 0.3, y - h * 0.6, x + lean * h, y - h);
        gc.stroke();
      }
    }
    gc.globalAlpha = 1;
    /* Daisies, with a pin of shadow so they sit in the grass. */
    for (let i = 0; i < FLOCK.decor.daisies; i += 1) {
      const x = m + (0.4 + rand() * (SNAKE_COLS - 0.8)) * c;
      const y = m + (0.4 + rand() * (SNAKE_ROWS - 0.8)) * c;
      const r = c * (0.13 + rand() * 0.04);
      gc.fillStyle = pal.shadow;
      gc.globalAlpha = 0.5;
      gc.beginPath();
      gc.ellipse(x, y + r * 0.6, r, r * 0.35, 0, 0, TAU);
      gc.fill();
      gc.globalAlpha = 1;
      gc.fillStyle = pal.petal;
      for (let k = 0; k < 7; k += 1) {
        const a = (k * TAU) / 7;
        gc.beginPath();
        gc.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.45, r * 0.42, r * 0.2, a, 0, TAU);
        gc.fill();
      }
      gc.fillStyle = pal.petalEye;
      gc.beginPath();
      gc.arc(x, y, r * 0.3, 0, TAU);
      gc.fill();
    }
    /* The low light across the lawn. */
    const wash = gc.createRadialGradient(
      theme === 'light' ? 0 : size,
      0,
      0,
      theme === 'light' ? 0 : size,
      0,
      size * 1.25,
    );
    wash.addColorStop(0, pal.wash);
    wash.addColorStop(1, transparent(pal.wash));
    gc.globalAlpha = pal.washAlpha;
    gc.fillStyle = wash;
    gc.fillRect(m, m, lawn, lawn);
    gc.globalAlpha = 1;
    const away = gc.createRadialGradient(
      theme === 'light' ? size : 0,
      size,
      0,
      theme === 'light' ? size : 0,
      size,
      size * 1.1,
    );
    away.addColorStop(0, pal.shade);
    away.addColorStop(1, transparent(pal.shade));
    gc.fillStyle = away;
    gc.fillRect(m, m, lawn, lawn);
    /* The canopy of a tree just out of frame, over the corner the light does
       not reach, with coins of light through it. The leaves are a union of
       discs drawn opaque on a canvas a tenth the size and laid on once at the
       canopy's alpha: overlapping translucent discs would darken where they
       overlap and read as a stain, and the tenfold upscale is what makes the
       edge as soft as a real shadow's, in every browser (no filter needed). */
    {
      const k = 10;
      const small = document.createElement('canvas');
      small.width = Math.max(1, Math.ceil(size / k));
      small.height = small.width;
      const sc = small.getContext('2d')!;
      const right = theme === 'light';
      const cx = right ? size : 0;
      sc.fillStyle = pal.canopy;
      for (let i = 0; i < 11; i += 1) {
        const a = 0.12 + (i / 10) * 1.35;
        const d = c * (2.6 + rand() * 2.8);
        const lx = cx + (right ? -1 : 1) * Math.cos(a) * d;
        const ly = size - Math.sin(a) * d;
        sc.beginPath();
        sc.arc(lx / k, ly / k, (c * (1.3 + rand() * 1.1)) / k, 0, TAU);
        sc.fill();
      }
      /* Coins of light: holes in the leaves. */
      sc.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 9; i += 1) {
        const a = 0.15 + rand() * 1.3;
        const d = c * (1.2 + rand() * 4.2);
        sc.beginPath();
        sc.ellipse((cx + (right ? -1 : 1) * Math.cos(a) * d) / k, (size - Math.sin(a) * d) / k, (c * (0.3 + rand() * 0.3)) / k, (c * 0.22) / k, 0.4, 0, TAU);
        sc.fill();
      }
      gc.save();
      gc.beginPath();
      gc.rect(m, m, lawn, lawn);
      gc.clip();
      gc.imageSmoothingEnabled = true;
      gc.imageSmoothingQuality = 'high';
      gc.globalAlpha = pal.canopyAlpha;
      gc.drawImage(small, 0, 0, small.width * k, small.height * k);
      gc.globalAlpha = 1;
      gc.restore();
    }
    /* The hedge's shadow on the lawn's edge: deepest along the top, where the
       light comes over it. */
    const cast = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
      const grad = gc.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, pal.hedgeCast);
      grad.addColorStop(1, transparent(pal.hedgeCast));
      gc.fillStyle = grad;
      gc.fillRect(rx, ry, rw, rh);
    };
    cast(0, m, 0, m + c * 0.6, m, m, lawn, c * 0.6);
    cast(m, 0, m + c * 0.4, 0, m, m, c * 0.4, lawn);
    cast(m + lawn, 0, m + lawn - c * 0.4, 0, m + lawn - c * 0.4, m, c * 0.4, lawn);
    cast(0, m + lawn, 0, m + lawn - c * 0.25, m, m + lawn - c * 0.25, lawn, c * 0.25);
    /* The vignette, on the ground only — the birds stay crisp at the edges. */
    const vig = gc.createRadialGradient(size / 2, size / 2, size * 0.38, size / 2, size / 2, size * 0.78);
    vig.addColorStop(0, transparent(pal.vignette));
    vig.addColorStop(1, pal.vignette);
    gc.fillStyle = vig;
    gc.fillRect(0, 0, size, size);
    hedge(gc, 'top', rand);
    hedge(gc, 'left', rand);
    hedge(gc, 'right', rand);
    ground = g;

    /* Front: the near hedge, drawn over the birds in the bottom row. */
    const [f, fc] = makeLayer(size, size, ratio);
    hedge(fc, 'bottom', rand);
    front = f;

    /* Sprites. */
    const R = FLOCK.chick.radius * c;
    chickSide = Math.ceil(R * 3.2);
    chickSprites = CHICKS.map((plume) =>
      [-1, 0, 1].map((wing) => {
        const [s, sc] = makeLayer(chickSide, chickSide, ratio);
        sc.translate(chickSide / 2, chickSide / 2);
        paintChick(sc, R, plume, wing);
        return s;
      }),
    );
    const Rt = FLOCK.treat.radius * c;
    treatSide = Math.ceil(Rt * 2.8);
    treatSprites.clear();
    for (const kind of TREAT_ORDER) {
      const [s, sc] = makeLayer(treatSide, treatSide, ratio);
      sc.translate(treatSide / 2, treatSide / 2);
      paintTreat(sc, Rt, kind);
      treatSprites.set(kind, s);
    }
    const glowSide = Math.ceil(c * 2.4);
    {
      const [s, sc] = makeLayer(glowSide, glowSide, ratio);
      const grad = sc.createRadialGradient(glowSide / 2, glowSide / 2, 0, glowSide / 2, glowSide / 2, glowSide / 2);
      grad.addColorStop(0, pal.treatGlow);
      grad.addColorStop(1, transparent(pal.treatGlow));
      sc.fillStyle = grad;
      sc.fillRect(0, 0, glowSide, glowSide);
      glow = s;
    }
    if (pal.cloud) {
      const side = Math.ceil(c * 9);
      const [s, sc] = makeLayer(side, side * 0.6, ratio);
      /* A cloud's shadow: three soft lobes, not one disc. */
      for (const [x, y, r] of [[0.32, 0.55, 0.26], [0.55, 0.42, 0.3], [0.74, 0.58, 0.22]] as const) {
        const grad = sc.createRadialGradient(side * x, side * 0.6 * y, 0, side * x, side * 0.6 * y, side * r);
        grad.addColorStop(0, pal.cloud);
        grad.addColorStop(1, transparent(pal.cloud));
        sc.fillStyle = grad;
        sc.fillRect(0, 0, side, side * 0.6);
      }
      cloudBlob = s;
    } else cloudBlob = null;
    if (pal.fireflyHalo) {
      const side = Math.ceil(c * 1.2);
      const [s, sc] = makeLayer(side, side, ratio);
      const grad = sc.createRadialGradient(side / 2, side / 2, 0, side / 2, side / 2, side / 2);
      grad.addColorStop(0, pal.fireflyHalo);
      grad.addColorStop(1, transparent(pal.fireflyHalo));
      sc.fillStyle = grad;
      sc.fillRect(0, 0, side, side);
      halo = s;
    } else halo = null;
  }

  /** One side of the hedge: shade lobes, lit lobes, highlights, leaves, blossom. */
  function hedge(ctx: CanvasRenderingContext2D, side: 'top' | 'left' | 'right' | 'bottom', rand: () => number) {
    const c = cell;
    const m = FLOCK.margin * c;
    const rb = c * 0.36;
    /* Lobe centres sit so the hedge bulges a hair over the lawn's edge — a
       wall you can see, that never covers a playable cell. */
    const inset = m - rb + c * 0.06;
    const along = side === 'top' || side === 'bottom';
    const step = c * 0.46;
    const count = Math.ceil(size / step) + 2;
    const at = (i: number, out: number): [number, number] => {
      const t = -step + i * step;
      if (side === 'top') return [t, inset - out];
      if (side === 'bottom') return [t, size - inset + out];
      if (side === 'left') return [inset - out, t];
      return [size - inset + out, t];
    };
    const jitter: number[] = [];
    for (let i = 0; i < count; i += 1) jitter.push((rand() - 0.5) * c * 0.12);
    /* Shade lobes, dropped toward the lawn; the lit body; the highlights. */
    for (const [colour, drop, scale, dx, dy] of [
      [pal.hedgeShade, 0.08, 1.05, 0, 0.08],
      [pal.hedge, 0, 0.92, 0, -0.02],
      [pal.hedgeLit, 0, 0.42, -0.13, -0.15],
    ] as const) {
      ctx.fillStyle = colour;
      for (let i = 0; i < count; i += 1) {
        const [x, y] = at(i, along ? jitter[i] * 0.5 : 0);
        const jx = along ? 0 : jitter[i] * 0.5;
        ctx.beginPath();
        ctx.arc(x + jx + dx * c, y + (drop + dy) * c, rb * scale * (1 + (jitter[i] / c) * 0.6), 0, TAU);
        ctx.fill();
      }
    }
    /* Corner bushes, bigger and rounder, on the two corners this side owns. */
    if (side === 'top' || side === 'bottom') {
      const y = side === 'top' ? inset - c * 0.05 : size - inset + c * 0.05;
      for (const x of [inset - c * 0.05, size - inset + c * 0.05]) {
        ctx.fillStyle = pal.hedgeShade;
        ctx.beginPath();
        ctx.arc(x, y + c * 0.08, c * 0.56, 0, TAU);
        ctx.fill();
        ctx.fillStyle = pal.hedge;
        ctx.beginPath();
        ctx.arc(x, y - c * 0.02, c * 0.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = pal.hedgeLit;
        ctx.beginPath();
        ctx.arc(x - c * 0.17, y - c * 0.2, c * 0.22, 0, TAU);
        ctx.fill();
      }
    }
    /* Leaf texture and blossom. */
    for (let i = 0; i < Math.round(size / c) * 7; i += 1) {
      const t = rand() * size;
      const out = rand() * m * 0.9;
      const x = side === 'top' || side === 'bottom' ? t : side === 'left' ? out : size - out;
      const y = side === 'top' ? out : side === 'bottom' ? size - out : t;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = rand() < 0.5 ? pal.hedgeShade : pal.hedgeLit;
      ctx.beginPath();
      ctx.ellipse(x, y, c * 0.08, c * 0.045, rand() * Math.PI, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < Math.round(size / c) * 0.45; i += 1) {
      const t = rand() * size;
      const out = c * 0.1 + rand() * m * 0.6;
      const x = along ? t : side === 'left' ? out : size - out;
      const y = side === 'top' ? out : side === 'bottom' ? size - out : t;
      const colour = pal.blossom[Math.floor(rand() * pal.blossom.length)];
      const r = c * 0.065;
      ctx.fillStyle = colour;
      for (let k = 0; k < 5; k += 1) {
        const a = (k * TAU) / 5;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = pal.petalEye;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.55, 0, TAU);
      ctx.fill();
    }
  }

  /* ── frame pieces ── */

  const centreX = (c: number) => ox + (colOf(c) + 0.5) * cell;
  const centreY = (c: number) => ox + (rowOf(c) + 0.5) * cell;

  function drawTreat(ctx: CanvasRenderingContext2D, x: number, y: number, kind: TreatKind, scale: number, t: number) {
    if (scale <= 0.01) return;
    const c = cell;
    const bob = reduced ? 0 : Math.sin((t * TAU) / FLOCK.treat.bobPeriod) * FLOCK.treat.bob * c;
    /* The shadow stays on the grass and shrinks as the treat rises. */
    ctx.fillStyle = pal.shadow;
    ctx.globalAlpha = 0.7 * scale;
    ctx.beginPath();
    ctx.ellipse(x, y + c * 0.3, c * 0.26 * scale * (1 - bob / c), c * 0.09 * scale, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (glow) {
      const pulse = reduced ? 0.9 : 0.78 + 0.22 * Math.sin(t * 2.6);
      const gs = c * 2.4 * scale;
      ctx.globalAlpha = pulse * scale;
      ctx.drawImage(glow, x - gs / 2, y - c * 0.08 - gs / 2 - bob, gs, gs);
      ctx.globalAlpha = 1;
    }
    const sprite = treatSprites.get(kind);
    if (sprite) {
      const s = treatSide * scale;
      ctx.drawImage(sprite, x - s / 2, y - c * 0.08 - bob - s / 2, s, s);
    }
  }

  function drawParticles(ctx: CanvasRenderingContext2D, now: number, dt: number) {
    const c = cell;
    for (const p of pool) {
      if (!p.on) continue;
      const age = now - p.born;
      if (age < 0) continue;
      if (age > p.life) {
        p.on = false;
        continue;
      }
      const k = age / p.life;
      p.vy += p.g * dt;
      if (p.kind === FEATHER || p.kind === LEAF) {
        /* Drag: a feather falls at a drifting crawl, not like a stone. */
        p.vx *= 1 - Math.min(1, dt * 2.6);
        p.vy = Math.min(p.vy, 0.9);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const x = ox + p.x * c;
      const y = ox + p.y * c;
      const s = p.size * c;
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.fillStyle = p.colour;
      if (p.kind === BIT) {
        ctx.beginPath();
        ctx.arc(x, y, s * (1 - k * 0.5), 0, TAU);
        ctx.fill();
      } else if (p.kind === SPARK) {
        const pop = Math.sin(Math.PI * k);
        star(ctx, x, y, s * pop, s * pop * 0.32, 4, p.rot * 0.2);
        ctx.fill();
      } else if (p.kind === PUFF) {
        /* The cartoon "poof" of an impact: a soft disc swelling and thinning. */
        ctx.globalAlpha = (1 - k) * 0.85;
        ctx.beginPath();
        ctx.arc(x, y, s * (0.5 + k * 0.9), 0, TAU);
        ctx.fill();
      } else if (p.kind === RING) {
        ctx.strokeStyle = p.colour;
        ctx.lineWidth = Math.max(1, c * 0.08 * (1 - k));
        ctx.globalAlpha = 1 - k;
        ctx.beginPath();
        ctx.arc(x, y, s * (0.4 + k), 0, TAU);
        ctx.stroke();
      } else {
        const sway = Math.sin(age / 140 + p.born) * 0.5;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rot + sway);
        ctx.beginPath();
        ctx.ellipse(0, 0, s, s * 0.38, 0, 0, TAU);
        ctx.fill();
        if (p.kind === FEATHER) {
          ctx.strokeStyle = PICO_BRAND.light;
          ctx.lineWidth = Math.max(0.5, s * 0.08);
          ctx.beginPath();
          ctx.moveTo(-s * 0.9, 0);
          ctx.lineTo(s * 0.9, 0);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawAmbient(ctx: CanvasRenderingContext2D, t: number) {
    const c = cell;
    if (pal.butterflies.length) {
      for (let i = 0; i < FLOCK.ambient.butterflies; i += 1) {
        const k = 1 + i * 0.37;
        const x = size * (0.5 + 0.44 * Math.sin(t * 0.11 * k + i * 2.1));
        const y = size * (0.5 + 0.42 * Math.sin(t * 0.083 * k + i * 4.3)) + Math.sin(t * 5 + i) * c * 0.12;
        const heading = Math.cos(t * 0.11 * k + i * 2.1) >= 0 ? 1 : -1;
        const flap = Math.abs(Math.sin(t * 13 + i * 1.7));
        const colour = pal.butterflies[i % pal.butterflies.length];
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(heading * 1.6, 1.6);
        ctx.rotate(-0.25);
        ctx.fillStyle = pal.shadow;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.ellipse(c * 0.1, c * 0.55, c * 0.16 * (0.4 + flap * 0.6), c * 0.05, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = colour;
        for (const sx of [-1, 1]) {
          const w = 0.25 + 0.75 * flap;
          ctx.beginPath();
          ctx.ellipse(sx * c * 0.13 * w, -c * 0.05, c * 0.14 * w, c * 0.11, sx * 0.5, 0, TAU);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(sx * c * 0.1 * w, c * 0.08, c * 0.09 * w, c * 0.07, -sx * 0.4, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = pal.butterflyBody;
        ctx.beginPath();
        ctx.ellipse(0, 0.01 * c, c * 0.03, c * 0.12, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
    if (pal.fluff) {
      ctx.strokeStyle = pal.fluff;
      ctx.fillStyle = pal.fluff;
      ctx.lineWidth = Math.max(0.5, c * 0.025);
      for (let i = 0; i < FLOCK.ambient.fluff; i += 1) {
        const span = size + c * 2;
        const x = ((t * c * 0.32 * (1 + i * 0.12) + (i * span) / FLOCK.ambient.fluff) % span) - c;
        const y = size * ((i * 0.618 + 0.1) % 1) + Math.sin(t * 0.7 + i) * c * 0.8;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        for (let k = 0; k < 6; k += 1) {
          const a = (k * TAU) / 6 + t * 0.4 + i;
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a) * c * 0.13, y + Math.sin(a) * c * 0.13);
        }
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, c * 0.03, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (pal.firefly && halo) {
      const hs = c * 1.2;
      for (let i = 0; i < FLOCK.ambient.fireflies; i += 1) {
        const x = size * (0.5 + 0.46 * Math.sin(t * 0.07 * (1 + i * 0.13) + i * 1.7));
        const y = size * (0.5 + 0.46 * Math.sin(t * 0.09 * (1 + i * 0.11) + i * 2.3));
        const pulse = Math.max(0, Math.sin(t * (1.1 + i * 0.17) + i * 0.9));
        const a = pulse * pulse;
        if (a < 0.02) continue;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a;
        ctx.drawImage(halo, x - hs / 2, y - hs / 2, hs, hs);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = pal.firefly;
        ctx.beginPath();
        ctx.arc(x, y, c * 0.055, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  /* ── the API ── */

  return {
    resize(nextSize, nextRatio, nextTheme) {
      if (nextSize === size && nextRatio === ratio && nextTheme === theme && ground) return;
      size = nextSize;
      ratio = nextRatio;
      theme = nextTheme;
      pal = FLOCK_PALETTE[theme];
      cell = size / (SNAKE_COLS + FLOCK.margin * 2);
      ox = FLOCK.margin * cell;
      if (size > 0) build();
    },

    step(from, to, ate, eaten, now, tickMs) {
      for (let i = 0; i < to.length; i += 1) {
        if (i >= from.length) {
          /* The new chick at the back takes the facing of the one ahead of it. */
          facing[i] = facing[i - 1] ?? 1;
          flipAt[i] = -1e9;
          tilt[i] = 0;
          tiltTo[i] = 0;
          joinAt[i] = now;
          continue;
        }
        const dx = colOf(to[i]) - colOf(from[i]);
        const dy = rowOf(to[i]) - rowOf(from[i]);
        if (dx !== 0) {
          const f = dx > 0 ? 1 : -1;
          if (f !== facing[i]) {
            facing[i] = f;
            flipAt[i] = now;
          }
        }
        /* Up the board is nose-up whichever way the bird faces. */
        tiltTo[i] = dy === 0 ? 0 : (dy < 0 ? -1 : 1) * (i === 0 ? FLOCK.pico.climb : FLOCK.pico.climb * 0.6);
      }
      if (ate) {
        munchCell = to[0];
        munchKind = TREAT_ORDER[(eaten - 1) % TREAT_ORDER.length];
        munchAt = now;
        munchMs = tickMs;
        munchBurst = false;
        treatBorn = now;
      }
    },

    crash(dir, wall, now) {
      crashAt = now;
      crashDir = dir;
      doneAt = now;
      /* The impact lands halfway through the lunge. */
      const hit = now + FLOCK.crash.lungeMs * 0.45;
      const head = gx[0];
      const hx = (head - ox) / cell;
      const hy = (gy[0] - ox) / cell - FLOCK.pico.lift - 0.3;
      const feathers = [PICO_BRAND.body, PICO_BRAND.shade, PICO_BRAND.wing, PICO_BRAND.light];
      for (let i = 0; i < FLOCK.crash.feathers; i += 1) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6;
        const v = 1.6 + Math.random() * 2;
        emit(FEATHER, hx, hy, Math.cos(a) * v, Math.sin(a) * v, 2.2, 0.22 + Math.random() * 0.1, feathers[i % feathers.length], hit, 1300 + Math.random() * 500, (Math.random() - 0.5) * 5);
      }
      /* Where the beak met the hedge (or the flock): a puff of dust. */
      const DXp = [0, 1, 0, -1][dir];
      const DYp = [-1, 0, 1, 0][dir];
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * TAU;
        emit(PUFF, hx + DXp * 0.55 + Math.cos(a) * 0.12, hy + 0.25 + DYp * 0.55 + Math.sin(a) * 0.1, Math.cos(a) * 0.7, Math.sin(a) * 0.5, 0, 0.26, pal.puff, hit, 520);
      }
      if (wall) {
        const DX = [0, 1, 0, -1][dir];
        const DY = [-1, 0, 1, 0][dir];
        const wx = hx + DX * 0.75;
        const wy = hy + 0.3 + DY * 0.75;
        for (let i = 0; i < FLOCK.crash.leaves; i += 1) {
          const v = 0.8 + Math.random() * 1.6;
          const a = Math.atan2(-DY, -DX) + (Math.random() - 0.5) * 2.2;
          emit(LEAF, wx, wy, Math.cos(a) * v, Math.sin(a) * v - 1, 2, 0.13 + Math.random() * 0.06, Math.random() < 0.5 ? pal.leaf : pal.hedgeLit, hit, 1100 + Math.random() * 400, (Math.random() - 0.5) * 6);
        }
      }
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * TAU + 0.4;
        emit(SPARK, hx + Math.cos(a) * 0.55, hy + Math.sin(a) * 0.45, 0, 0, 0, 0.26, DIZZY.star, hit, 420);
      }
    },

    timeUp(now) {
      doneAt = now;
    },

    paint(ctx, now, v) {
      if (!ground || !front) return;
      const c = cell;
      const t = now / 1000;
      const dt = lastNow ? Math.min(0.1, Math.max(0, (now - lastNow) / 1000)) : 0;
      lastNow = now;
      const playing = v.phase === 'playing';
      const crashed = v.end === 'crash';
      const timeIsUp = v.end === 'time';
      const p = clamp01(v.p);

      ctx.drawImage(ground, 0, 0, size, size);

      /* Cloud shadows sliding over the lawn, under everything that stands on it. */
      if (cloudBlob && !reduced) {
        const w = c * 9;
        const h = w * 0.6;
        for (let i = 0; i < FLOCK.ambient.clouds; i += 1) {
          const span = size + w;
          const x = ((t * c * 0.22 * (1 + i * 0.35) + i * span * 0.55) % span) - w;
          const y = size * (0.18 + i * 0.42) + Math.sin(t * 0.05 + i) * c;
          ctx.drawImage(cloudBlob, x, y - h / 2, w, h);
        }
      }

      /* Shake: the birds and the treats, never the lawn, so no edge shows. */
      let sx = 0;
      let sy = 0;
      if (crashed && !reduced) {
        const k = 1 - (now - crashAt - FLOCK.crash.lungeMs * 0.45) / FLOCK.crash.shakeMs;
        if (k > 0 && k <= 1) {
          sx = Math.sin(now * 0.12) * FLOCK.crash.shake * k;
          sy = Math.cos(now * 0.15) * FLOCK.crash.shake * k * 0.6;
        }
      }
      ctx.save();
      ctx.translate(sx, sy);

      /* The treat, and the one being gulped. */
      if (v.food >= 0) {
        const grow = reduced ? 1 : easeOutBack(clamp01((now - treatBorn) / FLOCK.treatInMs));
        drawTreat(ctx, centreX(v.food), centreY(v.food), TREAT_ORDER[v.eaten % TREAT_ORDER.length], grow, t);
        /* A twinkle that hops round it, so the eye finds it on a busy lawn. */
        if (!reduced) {
          const beat = t / 1.3;
          const n = Math.floor(beat);
          const k = beat - n;
          const a = n * 2.4;
          ctx.fillStyle = pal.sparkle;
          ctx.globalAlpha = Math.sin(Math.PI * k);
          star(ctx, centreX(v.food) + Math.cos(a) * c * 0.38, centreY(v.food) - c * 0.12 + Math.sin(a) * c * 0.32, c * 0.13 * Math.sin(Math.PI * k), c * 0.04, 4, 0);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      if (munchCell >= 0) {
        const q = (now - munchAt) / munchMs;
        const mx = centreX(munchCell);
        const my = centreY(munchCell);
        if (q < 1) drawTreat(ctx, mx, my, munchKind, q < 0.5 ? 1 : 1 - (q - 0.5) / 0.5, t);
        if (q >= 0.7 && !munchBurst) {
          munchBurst = true;
          const hx = (mx - ox) / c;
          const hy = (my - ox) / c - 0.15;
          const colour = TREAT_BITS[munchKind];
          for (let i = 0; i < FLOCK.munch.bits; i += 1) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 3;
            const sp = 1.4 + Math.random() * 1.8;
            emit(BIT, hx, hy, Math.cos(a) * sp, Math.sin(a) * sp, 6, 0.05 + Math.random() * 0.04, colour, now, FLOCK.munch.ms);
          }
          for (let i = 0; i < FLOCK.munch.sparkles; i += 1) {
            const a = (i / FLOCK.munch.sparkles) * TAU + Math.random();
            emit(SPARK, hx + Math.cos(a) * 0.45, hy + Math.sin(a) * 0.4, Math.cos(a) * 0.4, Math.sin(a) * 0.4 - 0.3, 0, 0.2, pal.sparkle, now + i * 40, 480);
          }
          emit(RING, hx, hy, 0, 0, 0, 0.55, pal.sparkle, now, 420);
        }
        if (q >= 1.6) munchCell = -1;
      }

      /* Where every bird stands this frame — the glide from the cell before the
         last tick to the cell it put the bird in. */
      const n = v.body.length;
      for (let i = 0; i < n; i += 1) {
        const to = v.body[i];
        const fr = i < v.from.length ? v.from[i] : to;
        gx[i] = ox + (colOf(fr) + (colOf(to) - colOf(fr)) * p + 0.5) * c;
        gy[i] = ox + (rowOf(fr) + (rowOf(to) - rowOf(fr)) * p + 0.5) * c;
        order[i] = i;
        /* The tilt eases toward the way the bird is going. */
        tilt[i] += (tiltTo[i] - tilt[i]) * (reduced ? 1 : 1 - Math.exp(-dt * 16));
      }
      if (!playing && !crashed) for (let i = 0; i < n; i += 1) tiltTo[i] = 0;
      /* Paint far to near; on one row, the back of the line first so Pico is on top. */
      for (let i = 1; i < n; i += 1) {
        const k = order[i];
        let j = i - 1;
        while (j >= 0 && (gy[order[j]] > gy[k] + 0.5 || (Math.abs(gy[order[j]] - gy[k]) <= 0.5 && order[j] < k))) {
          order[j + 1] = order[j];
          j -= 1;
        }
        order[j + 1] = k;
      }

      /* Shadows first, all of them, so no bird stands on another's shadow. */
      ctx.fillStyle = pal.shadow;
      for (let i = 0; i < n; i += 1) {
        const r = i === 0 ? 0.36 : 0.27;
        ctx.beginPath();
        ctx.ellipse(gx[i], gy[i] + c * (i === 0 ? 0.4 : 0.3), c * r, c * r * 0.34, 0, 0, TAU);
        ctx.fill();
      }

      const sinceDone = now - doneAt;
      for (let o = 0; o < n; o += 1) {
        const i = order[o];
        /* The hop: one a tick, odd and even chicks half a beat apart — a waddle. */
        let hop = 0;
        let squashX = 1;
        let squashY = 1;
        if (!reduced) {
          if (playing) hop = Math.abs(Math.sin(Math.PI * (p + (i % 2) * 0.5)));
          else if (timeIsUp) hop = Math.max(0, Math.sin(sinceDone / 190 - i * 0.55)) * (sinceDone < 3200 ? 1 : 0.4);
          else if (crashed) {
            const tb = now - crashAt - FLOCK.crash.lungeMs * 0.4 - i * FLOCK.crash.rippleMs;
            if (i > 0 && tb > 0 && tb < FLOCK.crash.bumpMs) {
              const s = Math.sin((Math.PI * tb) / FLOCK.crash.bumpMs);
              squashX = 1 + 0.22 * s;
              squashY = 1 - 0.2 * s;
            }
          } else {
            /* Waiting: breathing, and a hop now and then down the line. */
            const beat = (t * 0.6 + i * 0.13) % 3;
            hop = beat < 0.3 ? Math.sin((Math.PI * beat) / 0.3) * 0.6 : 0;
          }
        }
        const f = facing[i] as 1 | -1;
        const flipT = (now - flipAt[i]) / FLOCK.flipMs;
        const flipScale = !reduced && flipT >= 0 && flipT < 1 ? Math.max(0.4, Math.abs(1 - 2 * flipT)) : 1;
        const shown = flipT >= 0 && flipT < 0.5 && !reduced ? (-f as 1 | -1) : f;
        if (i === 0) {
          const P = FLOCK.pico;
          let x = gx[0];
          let y = gy[0] - (P.lift + hop * P.hop) * c;
          if (crashed && !reduced) {
            const k = clamp01((now - crashAt) / FLOCK.crash.lungeMs);
            const l = Math.sin(Math.PI * k) * FLOCK.crash.lunge * c;
            x += [0, 1, 0, -1][crashDir] * l;
            y += [-1, 0, 1, 0][crashDir] * l;
          }
          const gulp = munchCell >= 0 && now - munchAt > munchMs * 0.55 && now - munchAt < munchMs * 0.55 + 260;
          const pose: PicoPose = crashed ? 'hit' : timeIsUp ? 'happy' : gulp ? 'happy' : 'idle';
          pico.x = 0;
          pico.y = 0;
          pico.size = picoSizeForBodyRadius(P.bodyRadius * c);
          pico.pose = pose;
          pico.facing = shown;
          pico.tilt = crashed ? -0.2 : tilt[0];
          pico.blink = reduced ? 0 : picoBlinkAt(t);
          ctx.save();
          ctx.translate(x, y);
          if (flipScale !== 1) ctx.scale(flipScale, 1);
          drawPico(ctx, pico);
          ctx.restore();
          if (crashed && now - crashAt > FLOCK.crash.lungeMs * 0.5) {
            /* Dizzy stars, circling where his crest was. */
            const sx2 = x + shown * c * 0.15;
            const sy2 = y - c * 0.95;
            for (let s = 0; s < FLOCK.crash.stars; s += 1) {
              const a = (reduced ? 0 : t * 3.2) + (s * TAU) / FLOCK.crash.stars;
              const px = sx2 + Math.cos(a) * c * 0.5;
              const py = sy2 + Math.sin(a) * c * 0.16;
              ctx.fillStyle = DIZZY.edge;
              star(ctx, px, py + c * 0.02, c * 0.17, c * 0.072, 5, a);
              ctx.fill();
              ctx.fillStyle = DIZZY.star;
              star(ctx, px, py, c * 0.16, c * 0.066, 5, a);
              ctx.fill();
            }
          }
          continue;
        }
        const C = FLOCK.chick;
        const variant = (i - 1) % CHICKS.length;
        let frame = 1;
        if (!reduced) {
          if (playing || timeIsUp) {
            const beat = Math.floor((t * C.beats + i * 0.37) * 4) % 4;
            frame = beat === 0 ? 0 : beat === 2 ? 2 : 1;
          } else if (!crashed && hop > 0) frame = 2;
        }
        const sprite = chickSprites[variant]?.[frame];
        if (!sprite) continue;
        const join = clamp01((now - joinAt[i]) / FLOCK.joinMs);
        const pop = join < 1 && !reduced ? easeOutBack(join) : 1;
        const joinHop = join < 1 && !reduced ? Math.sin(Math.PI * join) * 0.5 : 0;
        ctx.save();
        ctx.translate(gx[i], gy[i] - (C.lift + (hop + joinHop) * C.hop) * c);
        ctx.rotate(shown * tilt[i]);
        ctx.scale(shown * flipScale * squashX * pop, squashY * pop);
        ctx.drawImage(sprite, -chickSide / 2, -chickSide / 2, chickSide, chickSide);
        ctx.restore();
      }

      ctx.restore();
      ctx.drawImage(front, 0, 0, size, size);
      drawParticles(ctx, now, dt);
      if (!reduced) drawAmbient(ctx, t);
    },
  };
}
