import { drawPico, picoBlinkAt, type DrawPicoOptions, type PicoPose } from '../../pico';
import { ASPECT, BALL, CANNON, FEEDBACK, TARGET } from './config';
import { BALLOONS, HARBOUR, LOOK, MOTION, SPENT, type BalloonMaterial, type HarbourPalette, type HarbourTheme } from './look';

/**
 * Canon Numbers' harbour — the painter behind the round.
 *
 * ## It only watches
 *
 * `CannonNumbers.tsx` keeps every rule where it was: targets, balls, the aim,
 * the sums, the clock and the score live in its refs and are stepped by its
 * loop exactly as before. Each frame it hands this painter those same objects,
 * read-only, and the painter draws them as a place — balloons over a bay, a
 * bronze cannon on a ship's deck, Pico at his post. Everything the picture adds
 * (a pop, confetti, smoke, a cheer) it works out for itself by watching what
 * changed: a target that was `live` last frame and is `hit` now was popped; a
 * newer `shotAt` was a shot. No call from the game's logic reaches in here, and
 * nothing here reaches back.
 *
 * ## Per frame, no garbage
 *
 * Sky, sea, shore and deck are painted once per size and theme into two layers;
 * the balloons, the barrel, the cannonball and the clouds are pre-rendered
 * sprites; particles live in a fixed pool; fonts and numerals are cached. Pico
 * is drawn live through `drawPico`, which allocates nothing.
 *
 * ## Reduced motion
 *
 * The game's own reduced mode is already calm (targets hover rather than
 * fall); the harbour follows it: clouds, waves, gulls, bunting, the beam, the
 * recoil, smoke and confetti all stand still or stay away. A pop still shows —
 * as a ring, held — because it is the answer, not decoration.
 */

const TAU = Math.PI * 2;

export interface HarbourTarget {
  readonly id: number;
  readonly value: number;
  readonly x: number;
  readonly y: number;
  readonly sway: number;
  readonly born: number;
  readonly state: 'live' | 'hit' | 'wrong' | 'gone';
  readonly endAt: number;
}

export interface HarbourBall {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

export interface HarbourFloat {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly at: number;
}

/** What the screen hands over every frame. */
export interface HarbourView {
  targets: readonly HarbourTarget[];
  balls: readonly HarbourBall[];
  floats: readonly HarbourFloat[];
  /** The barrel's angle, radians from straight up. */
  angle: number;
  /** When the last shot left, for the recoil, the flash and the smoke. */
  shotAt: number;
  phase: 'ready' | 'playing' | 'over';
  score: number;
}

export interface HarbourScene {
  /** The field is `width` CSS px wide (and `width × ASPECT` tall), at `ratio`. */
  resize(width: number, ratio: number, theme: HarbourTheme, font: string): void;
  paint(ctx: CanvasRenderingContext2D, now: number, view: HarbourView): void;
}

/* ── helpers ────────────────────────────────────────────────────────────── */

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

function star(ctx: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number, points: number, rot: number) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / points;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
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

/* ── particles ──────────────────────────────────────────────────────────── */

const CONFETTI = 0;
const SCRAP = 1;
const SMOKE = 2;
const SPARK = 3;
type Kind = typeof CONFETTI | typeof SCRAP | typeof SMOKE | typeof SPARK;

interface Particle {
  on: boolean;
  kind: Kind;
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

/* ── the scene ──────────────────────────────────────────────────────────── */

export function createHarbourScene(reduced: boolean): HarbourScene {
  let width = 0;
  let ratio = 1;
  let theme: HarbourTheme = 'dark';
  let family = 'sans-serif';
  let pal: HarbourPalette = HARBOUR.dark;
  let sky: HTMLCanvasElement | null = null;
  let deck: HTMLCanvasElement | null = null;
  let barrel: HTMLCanvasElement | null = null;
  let barrelW = 0;
  let barrelH = 0;
  let barrelPivot = 0;
  let ballSprite: HTMLCanvasElement | null = null;
  let ballSide = 0;
  let balloons: HTMLCanvasElement[] = [];
  let spent: HTMLCanvasElement | null = null;
  let balloonSide = 0;
  let clouds: HTMLCanvasElement[] = [];
  let cloudW = 0;
  let glowSprite: HTMLCanvasElement | null = null;
  let lanternSprite: HTMLCanvasElement | null = null;
  let beamSprite: HTMLCanvasElement | null = null;
  let fontShort = '';
  let fontLong = '';
  let fontFloat = '';

  const pool: Particle[] = Array.from({ length: MOTION.particles }, () => ({
    on: false,
    kind: CONFETTI as Kind,
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
  /* What each target was last frame, so a change of state is seen once. */
  const seen = new WeakMap<object, HarbourTarget['state']>();
  const numerals: string[] = [];
  const numeral = (n: number) => numerals[n] ?? (numerals[n] = String(n));
  let lastShot = -Infinity;
  let mood: PicoPose = 'idle';
  let moodUntil = 0;
  let facing: 1 | -1 = 1;
  let lastNow = 0;

  const pico: DrawPicoOptions = { x: 0, y: 0, size: 1, anchor: 'body', pose: 'idle', facing: 1, tilt: 0, blink: 0 };

  function emit(kind: Kind, x: number, y: number, vx: number, vy: number, g: number, size: number, colour: string, born: number, life: number, vr = 0) {
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
      p.size = size;
      p.colour = colour;
      p.born = born;
      p.life = life;
      return;
    }
  }

  const materialOf = (id: number): BalloonMaterial => BALLOONS[id % BALLOONS.length];

  /* ── building the layers ── */

  function paintBalloon(ctx: CanvasRenderingContext2D, r: number, m: BalloonMaterial) {
    const B = LOOK.balloon;
    const rx = r * B.rx;
    const ry = r * B.ry;
    const cy = -r * B.rise;
    // Knot.
    ctx.fillStyle = m.shade;
    ctx.beginPath();
    ctx.moveTo(-r * 0.12, cy + ry + r * 0.13);
    ctx.lineTo(r * 0.12, cy + ry + r * 0.13);
    ctx.lineTo(0, cy + ry - r * 0.04);
    ctx.closePath();
    ctx.fill();
    // Body, its shaded side, its glaze.
    ctx.fillStyle = m.shade;
    ctx.beginPath();
    ctx.ellipse(0, cy, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, cy, rx, ry, 0, 0, TAU);
    ctx.clip();
    ctx.fillStyle = m.fill;
    ctx.beginPath();
    ctx.ellipse(-rx * 0.1, cy - ry * 0.08, rx * 0.95, ry * 0.95, 0, 0, TAU);
    ctx.fill();
    // A rim of reflected light along the shaded edge.
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = r * 0.08;
    ctx.beginPath();
    ctx.ellipse(0, cy, rx * 0.93, ry * 0.93, 0, 0.1, 1.3);
    ctx.stroke();
    ctx.restore();
    // The shine: a long soft highlight and a hard little glint.
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.beginPath();
    ctx.ellipse(-rx * 0.48, cy - ry * 0.42, rx * 0.17, ry * 0.3, 0.55, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(-rx * 0.36, cy - ry * 0.66, rx * 0.07, ry * 0.06, 0.5, 0, TAU);
    ctx.fill();
  }

  function paintCloud(ctx: CanvasRenderingContext2D, w: number, rand: () => number) {
    const h = w * 0.42;
    const base = h * 0.82;
    const bumps: Array<[number, number, number]> = [];
    const n = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i += 1) {
      const x = w * (0.18 + (0.64 * i) / (n - 1)) + (rand() - 0.5) * w * 0.06;
      const r = h * (0.26 + rand() * 0.22) * (i === 0 || i === n - 1 ? 0.75 : 1);
      bumps.push([x, base - r * 0.55, r]);
    }
    const shape = () => {
      ctx.beginPath();
      for (const [x, y, r] of bumps) {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      }
      ctx.rect(w * 0.12, base - h * 0.2, w * 0.76, h * 0.2);
    };
    ctx.fillStyle = pal.cloud;
    shape();
    ctx.fill();
    /* The underside in shade, faded in rather than cut, so the cloud is a
       volume lit from above and not two flat colours stacked. */
    ctx.save();
    shape();
    ctx.clip();
    const under = ctx.createLinearGradient(0, base - h * 0.42, 0, base);
    under.addColorStop(0, transparent(pal.cloudShade));
    under.addColorStop(0.55, pal.cloudShade);
    under.addColorStop(1, pal.cloudShade);
    ctx.fillStyle = under;
    ctx.fillRect(0, base - h * 0.42, w, h);
    ctx.restore();
  }

  function build() {
    const k = width;
    const H = k * ASPECT;
    const rand = seeded(1010);

    /* ── the sky layer: sky, orb, stars, shore, sea ── */
    const [s, sc] = makeLayer(k, H, ratio);
    const horizon = LOOK.horizon * k;
    const skyGrad = sc.createLinearGradient(0, 0, 0, horizon);
    for (const [at, colour] of pal.sky) skyGrad.addColorStop(at, colour);
    sc.fillStyle = skyGrad;
    sc.fillRect(0, 0, k, horizon + 1);
    const ox = pal.orb.x * k;
    const oy = pal.orb.y * k;
    const glow = sc.createRadialGradient(ox, oy, 0, ox, oy, pal.orb.glowR * k);
    glow.addColorStop(0, pal.orb.glow);
    glow.addColorStop(1, transparent(pal.orb.glow));
    sc.fillStyle = glow;
    sc.fillRect(0, 0, k, horizon);
    if (pal.stars) {
      sc.fillStyle = pal.stars;
      for (let i = 0; i < 90; i += 1) {
        const x = rand() * k;
        const y = rand() * horizon * 0.88;
        sc.globalAlpha = 0.25 + rand() * 0.55;
        sc.beginPath();
        sc.arc(x, y, k * (0.0012 + rand() * 0.0022), 0, TAU);
        sc.fill();
      }
      sc.globalAlpha = 1;
    }
    /* The orb: a disc with a rim, clipped by the horizon (a setting sun). */
    sc.save();
    sc.beginPath();
    sc.rect(0, 0, k, horizon);
    sc.clip();
    sc.fillStyle = pal.orb.rim;
    sc.beginPath();
    sc.arc(ox, oy, pal.orb.r * k, 0, TAU);
    sc.fill();
    sc.fillStyle = pal.orb.core;
    sc.beginPath();
    sc.arc(ox - pal.orb.r * k * 0.06, oy - pal.orb.r * k * 0.06, pal.orb.r * k * 0.86, 0, TAU);
    sc.fill();
    if (theme === 'dark') {
      /* A crescent, not a full moon: a pale disc the size of a balloon, high
         in the sky the balloons fall through, read as one more target. The
         sky is painted back over the shadowed side with the sky's own
         gradient, so the cut matches whatever is behind it. */
      sc.beginPath();
      sc.arc(ox + pal.orb.r * k * 0.42, oy - pal.orb.r * k * 0.22, pal.orb.r * k * 0.86, 0, TAU);
      sc.fillStyle = skyGrad;
      sc.fill();
      /* …and the moon's own glow over it, as over the rest of the sky. */
      sc.fillStyle = glow;
      sc.fill();
    }
    sc.restore();
    /* Haze along the horizon. */
    const haze = sc.createLinearGradient(0, horizon - k * 0.12, 0, horizon);
    haze.addColorStop(0, transparent(pal.haze));
    haze.addColorStop(1, pal.haze);
    sc.fillStyle = haze;
    sc.fillRect(0, horizon - k * 0.12, k, k * 0.12);
    /* The far shore: low hills with two palms on the left, the lighthouse rock on the right. */
    sc.fillStyle = pal.shore;
    sc.beginPath();
    sc.moveTo(-k * 0.02, horizon + 1);
    sc.bezierCurveTo(k * 0.06, horizon - k * 0.05, k * 0.16, horizon - k * 0.065, k * 0.24, horizon - k * 0.03);
    sc.bezierCurveTo(k * 0.3, horizon - k * 0.01, k * 0.36, horizon - k * 0.02, k * 0.44, horizon + 1);
    sc.closePath();
    sc.fill();
    sc.fillStyle = pal.shoreNear;
    sc.beginPath();
    sc.moveTo(k * 0.02, horizon + 1);
    sc.bezierCurveTo(k * 0.08, horizon - k * 0.025, k * 0.18, horizon - k * 0.03, k * 0.26, horizon + 1);
    sc.closePath();
    sc.fill();
    for (const [px, lean, hgt] of [[0.12, 0.25, 0.07], [0.18, -0.15, 0.055]] as const) {
      const bx = px * k;
      const by = horizon - k * 0.035;
      const tx = bx + lean * k * 0.03;
      const ty = by - hgt * k;
      sc.strokeStyle = pal.shore;
      sc.lineWidth = k * 0.006;
      sc.lineCap = 'round';
      sc.beginPath();
      sc.moveTo(bx, by);
      sc.quadraticCurveTo(bx + lean * k * 0.01, by - hgt * k * 0.5, tx, ty);
      sc.stroke();
      sc.fillStyle = pal.shore;
      for (let f = 0; f < 6; f += 1) {
        const a = -Math.PI / 2 + (f - 2.5) * 0.55;
        sc.save();
        sc.translate(tx, ty);
        sc.rotate(a + Math.PI / 2);
        sc.beginPath();
        sc.ellipse(0, -k * 0.016, k * 0.006, k * 0.02, 0, 0, TAU);
        sc.fill();
        sc.restore();
      }
    }
    {
      const lx = 0.925 * k;
      sc.fillStyle = pal.shore;
      sc.beginPath();
      sc.moveTo(k * 0.86, horizon + 1);
      sc.quadraticCurveTo(k * 0.9, horizon - k * 0.03, k * 0.95, horizon - k * 0.025);
      sc.quadraticCurveTo(k * 1.0, horizon - k * 0.02, k * 1.02, horizon + 1);
      sc.closePath();
      sc.fill();
      const base = horizon - k * 0.024;
      const top = base - k * 0.085;
      const tower = () => {
        sc.beginPath();
        sc.moveTo(lx - k * 0.014, base);
        sc.lineTo(lx - k * 0.009, top);
        sc.lineTo(lx + k * 0.009, top);
        sc.lineTo(lx + k * 0.014, base);
        sc.closePath();
      };
      sc.fillStyle = pal.lighthouse;
      tower();
      sc.fill();
      sc.save();
      tower();
      sc.clip();
      sc.fillStyle = pal.lighthouseStripe;
      for (let i = 0; i < 3; i += 1) sc.fillRect(lx - k * 0.02, top + k * (0.012 + i * 0.026), k * 0.04, k * 0.012);
      sc.restore();
      sc.fillStyle = pal.lamp;
      sc.fillRect(lx - k * 0.008, top - k * 0.014, k * 0.016, k * 0.014);
      sc.fillStyle = pal.lighthouseStripe;
      sc.beginPath();
      sc.moveTo(lx - k * 0.012, top - k * 0.014);
      sc.lineTo(lx, top - k * 0.026);
      sc.lineTo(lx + k * 0.012, top - k * 0.014);
      sc.closePath();
      sc.fill();
    }
    /* The sea, from the horizon to the rail. */
    const railTop = LOOK.railTop * k;
    const seaGrad = sc.createLinearGradient(0, horizon, 0, railTop + k * 0.03);
    for (const [at, colour] of pal.sea) seaGrad.addColorStop(at, colour);
    sc.fillStyle = seaGrad;
    sc.fillRect(0, horizon, k, railTop - horizon + k * 0.05);
    /* Swell lines, longer and further apart toward the viewer. */
    sc.strokeStyle = 'rgba(255,255,255,0.12)';
    sc.lineCap = 'round';
    for (let i = 0; i < 26; i += 1) {
      const depth = rand();
      const y = horizon + (railTop - horizon) * (0.08 + depth * 0.9);
      const x = rand() * k;
      const len = k * (0.02 + depth * 0.07);
      sc.lineWidth = Math.max(0.7, k * (0.002 + depth * 0.003));
      sc.beginPath();
      sc.moveTo(x - len / 2, y);
      sc.quadraticCurveTo(x, y - k * 0.004, x + len / 2, y);
      sc.stroke();
    }
    sky = s;

    /* ── the deck layer: rail, planks, props, the carriage ── */
    const [d, dc] = makeLayer(k, H, ratio);
    const deckTop = LOOK.deckTop * k;
    const bottom = H;
    /* Planks. */
    const plank = k * 0.032;
    for (let row = 0, y = deckTop; y < bottom; row += 1, y += plank) {
      dc.fillStyle = row % 2 ? pal.plankA : pal.plankB;
      dc.fillRect(0, y, k, plank + 0.5);
      dc.fillStyle = pal.seam;
      dc.globalAlpha = 0.55;
      dc.fillRect(0, y, k, Math.max(0.8, k * 0.0025));
      /* Butt joints, staggered by row, with their nails. */
      for (let x = (row % 3) * k * 0.11 - k * 0.05; x < k; x += k * 0.33) {
        dc.fillRect(x, y, Math.max(0.8, k * 0.0025), plank);
        dc.beginPath();
        dc.arc(x + k * 0.008, y + plank * 0.5, k * 0.0028, 0, TAU);
        dc.arc(x - k * 0.008, y + plank * 0.5, k * 0.0028, 0, TAU);
        dc.fill();
      }
      dc.globalAlpha = 1;
    }
    /* The rail's shadow on the deck. */
    const railShadow = dc.createLinearGradient(0, deckTop, 0, deckTop + k * 0.04);
    railShadow.addColorStop(0, pal.shadow);
    railShadow.addColorStop(1, transparent(pal.shadow));
    dc.fillStyle = railShadow;
    dc.fillRect(0, deckTop, k, k * 0.04);
    /* Balusters between the cap and the deck: the sea shows between them. */
    const capB = railTop + LOOK.railCap * k;
    for (let x = k * 0.02; x < k; x += k * 0.064) {
      const w = k * 0.022;
      dc.fillStyle = pal.woodLow;
      dc.beginPath();
      dc.roundRect(x - w / 2, capB - 1, w, deckTop - capB + 2, w * 0.3);
      dc.fill();
      dc.fillStyle = pal.wood;
      dc.beginPath();
      dc.roundRect(x - w / 2, capB - 1, w * 0.7, deckTop - capB + 2, w * 0.3);
      dc.fill();
      dc.fillStyle = pal.woodLit;
      dc.fillRect(x - w / 2 + w * 0.12, capB, w * 0.14, deckTop - capB);
    }
    /* The rail cap. */
    dc.fillStyle = pal.woodLow;
    dc.fillRect(0, railTop, k, LOOK.railCap * k);
    dc.fillStyle = pal.wood;
    dc.fillRect(0, railTop, k, LOOK.railCap * k * 0.62);
    dc.fillStyle = pal.woodLit;
    dc.fillRect(0, railTop, k, Math.max(1, LOOK.railCap * k * 0.18));
    /* A rope swagged along the rail on the right. */
    dc.strokeStyle = pal.ropeShade;
    dc.lineWidth = k * 0.008;
    dc.lineCap = 'round';
    dc.beginPath();
    dc.moveTo(k * 0.66, railTop + k * 0.01);
    dc.quadraticCurveTo(k * 0.78, railTop + k * 0.05, k * 0.9, railTop + k * 0.01);
    dc.stroke();
    dc.strokeStyle = pal.rope;
    dc.lineWidth = k * 0.0045;
    dc.setLineDash([k * 0.006, k * 0.006]);
    dc.beginPath();
    dc.moveTo(k * 0.66, railTop + k * 0.009);
    dc.quadraticCurveTo(k * 0.78, railTop + k * 0.049, k * 0.9, railTop + k * 0.009);
    dc.stroke();
    dc.setLineDash([]);
    /* Soft shadows under the props. */
    const blob = (x: number, w: number) => {
      dc.fillStyle = pal.shadow;
      dc.beginPath();
      dc.ellipse(x * k, bottom - k * 0.012, w * k, k * 0.014, 0, 0, TAU);
      dc.fill();
    };
    /* The powder keg Pico stands on. */
    {
      const K = LOOK.keg;
      blob(K.x, K.w * 0.62);
      const x0 = (K.x - K.w / 2) * k;
      const x1 = (K.x + K.w / 2) * k;
      const top = bottom - K.h * k - k * 0.012;
      const bot = bottom - k * 0.012;
      const bulge = k * 0.012;
      const body = () => {
        dc.beginPath();
        dc.moveTo(x0 + bulge, top);
        dc.quadraticCurveTo(x0 - bulge * 0.5, (top + bot) / 2, x0 + bulge, bot);
        dc.lineTo(x1 - bulge, bot);
        dc.quadraticCurveTo(x1 + bulge * 0.5, (top + bot) / 2, x1 - bulge, top);
        dc.closePath();
      };
      dc.fillStyle = pal.woodLow;
      body();
      dc.fill();
      dc.save();
      body();
      dc.clip();
      dc.fillStyle = pal.wood;
      dc.fillRect(x0 - bulge, top, (x1 - x0) * 0.7, bot - top);
      dc.fillStyle = pal.seam;
      for (let i = 1; i < 5; i += 1) dc.fillRect(x0 + ((x1 - x0) * i) / 5, top, Math.max(0.8, k * 0.002), bot - top);
      for (const f of [0.22, 0.78]) {
        dc.fillStyle = pal.iron;
        dc.fillRect(x0 - bulge, top + (bot - top) * f - k * 0.005, x1 - x0 + bulge * 2, k * 0.01);
        dc.fillStyle = pal.ironLit;
        dc.fillRect(x0 - bulge, top + (bot - top) * f - k * 0.005, x1 - x0 + bulge * 2, Math.max(0.8, k * 0.002));
      }
      dc.restore();
      dc.fillStyle = pal.woodLit;
      dc.beginPath();
      dc.ellipse(K.x * k, top, (x1 - x0) / 2 - bulge, k * 0.009, 0, 0, TAU);
      dc.fill();
    }
    /* A pyramid of shot on the right. */
    {
      const r = k * 0.022;
      const cx = 0.79 * k;
      blob(0.79, 0.085);
      const rows = [3, 2, 1];
      rows.forEach((count, row) => {
        for (let i = 0; i < count; i += 1) {
          const x = cx + (i - (count - 1) / 2) * r * 2.02;
          const y = bottom - k * 0.012 - r - row * r * 1.72;
          dc.fillStyle = pal.iron;
          dc.beginPath();
          dc.arc(x, y, r, 0, TAU);
          dc.fill();
          dc.fillStyle = pal.ironLit;
          dc.globalAlpha = 0.7;
          dc.beginPath();
          dc.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, TAU);
          dc.fill();
          dc.globalAlpha = 1;
        }
      });
    }
    /* The lantern post in the corner. */
    {
      const x = 0.935 * k;
      const top = railTop - k * 0.035;
      dc.fillStyle = pal.woodLow;
      dc.fillRect(x - k * 0.006, top, k * 0.012, bottom - top);
      dc.fillStyle = pal.wood;
      dc.fillRect(x - k * 0.006, top, k * 0.006, bottom - top);
      dc.fillStyle = pal.lanternFrame;
      dc.fillRect(x - k * 0.02, top - k * 0.006, k * 0.04, k * 0.008);
      dc.fillStyle = pal.lanternGlass;
      dc.beginPath();
      dc.roundRect(x - k * 0.015, top - k * 0.05, k * 0.03, k * 0.044, k * 0.006);
      dc.fill();
      dc.strokeStyle = pal.lanternFrame;
      dc.lineWidth = Math.max(1, k * 0.004);
      dc.stroke();
      dc.beginPath();
      dc.moveTo(x, top - k * 0.05);
      dc.lineTo(x, top - k * 0.006);
      dc.stroke();
      dc.fillStyle = pal.lanternFrame;
      dc.beginPath();
      dc.moveTo(x - k * 0.02, top - k * 0.05);
      dc.lineTo(x, top - k * 0.066);
      dc.lineTo(x + k * 0.02, top - k * 0.05);
      dc.closePath();
      dc.fill();
    }
    /* The carriage: two spoked wheels and the bed between them. */
    {
      const W = LOOK.wheel;
      const cx = CANNON.x * k;
      blob(CANNON.x, 0.13);
      /* The bed: a stepped timber block, two cheeks rising either side of the
         pivot to hold the trunnions — the silhouette that says gun carriage. */
      const top = CANNON.y * k - k * 0.01;
      const foot = bottom - k * 0.018;
      const block = (x0: number, x1: number, y0: number, y1: number) => {
        dc.fillStyle = pal.woodLow;
        dc.beginPath();
        dc.roundRect(x0, y0, x1 - x0, y1 - y0, k * 0.006);
        dc.fill();
        dc.fillStyle = pal.wood;
        dc.beginPath();
        dc.roundRect(x0, y0, (x1 - x0) * 0.82, (y1 - y0) * 0.86, k * 0.006);
        dc.fill();
        dc.fillStyle = pal.woodLit;
        dc.fillRect(x0 + k * 0.004, y0 + k * 0.002, x1 - x0 - k * 0.012, Math.max(1, k * 0.004));
      };
      block(cx - k * 0.068, cx + k * 0.068, top + k * 0.028, foot);
      dc.fillStyle = pal.seam;
      dc.globalAlpha = 0.6;
      dc.fillRect(cx - k * 0.068, top + k * 0.05, k * 0.136, Math.max(0.8, k * 0.0025));
      dc.globalAlpha = 1;
      for (const bx of [-0.055, 0.055]) {
        dc.fillStyle = pal.iron;
        dc.beginPath();
        dc.arc(cx + bx * k, top + k * 0.04, k * 0.004, 0, TAU);
        dc.fill();
      }
      for (const side of [-1, 1]) {
        const wx = cx + side * W.dx * k;
        const wy = W.y * k;
        const r = W.r * k;
        dc.fillStyle = pal.woodLow;
        dc.beginPath();
        dc.arc(wx, wy, r, 0, TAU);
        dc.fill();
        dc.fillStyle = pal.wood;
        dc.beginPath();
        dc.arc(wx, wy, r * 0.78, 0, TAU);
        dc.fill();
        dc.strokeStyle = pal.woodLow;
        dc.lineWidth = Math.max(1, r * 0.14);
        for (let sp = 0; sp < 6; sp += 1) {
          const a = (sp * TAU) / 6 + 0.3;
          dc.beginPath();
          dc.moveTo(wx, wy);
          dc.lineTo(wx + Math.cos(a) * r * 0.78, wy + Math.sin(a) * r * 0.78);
          dc.stroke();
        }
        dc.strokeStyle = pal.iron;
        dc.lineWidth = Math.max(1, r * 0.16);
        dc.beginPath();
        dc.arc(wx, wy, r * 0.92, 0, TAU);
        dc.stroke();
        dc.fillStyle = pal.bronzeLit;
        dc.beginPath();
        dc.arc(wx, wy, r * 0.2, 0, TAU);
        dc.fill();
      }
    }
    deck = d;

    /* ── sprites ── */
    /* The barrel, pointing up, its pivot at (barrelW / 2, barrelPivot). */
    {
      const L = CANNON.barrelLength * k;
      const bw = CANNON.barrelWidth * k;
      const Bz = LOOK.barrel;
      const breech = Bz.breech * k;
      barrelW = Math.ceil(bw * Bz.flare + 4);
      barrelH = Math.ceil(L + breech + bw * 0.4 + 4);
      barrelPivot = L + 2;
      const [b, bc] = makeLayer(barrelW, barrelH, ratio);
      bc.translate(barrelW / 2, barrelPivot);
      const half = (w: number) => (w * bw) / 2;
      const shape = () => {
        bc.beginPath();
        bc.moveTo(-half(Bz.wide), breech);
        bc.lineTo(-half(Bz.narrow), -L + Bz.flareLen * k);
        bc.lineTo(-half(Bz.flare), -L + Bz.flareLen * k * 0.4);
        bc.lineTo(-half(Bz.flare), -L);
        bc.lineTo(half(Bz.flare), -L);
        bc.lineTo(half(Bz.flare), -L + Bz.flareLen * k * 0.4);
        bc.lineTo(half(Bz.narrow), -L + Bz.flareLen * k);
        bc.lineTo(half(Bz.wide), breech);
        bc.quadraticCurveTo(0, breech + bw * 0.35, -half(Bz.wide), breech);
        bc.closePath();
      };
      const metal = bc.createLinearGradient(-half(Bz.flare), 0, half(Bz.flare), 0);
      metal.addColorStop(0, pal.bronzeLow);
      metal.addColorStop(0.22, pal.bronzeLit);
      metal.addColorStop(0.45, pal.bronze);
      metal.addColorStop(1, pal.bronzeLow);
      bc.fillStyle = metal;
      shape();
      bc.fill();
      /* Reinforcing bands. */
      bc.save();
      shape();
      bc.clip();
      for (const f of [0.08, 0.42, 0.7]) {
        const y = breech - (L + breech) * f;
        bc.fillStyle = pal.bronzeBand;
        bc.fillRect(-bw, y - bw * 0.1, bw * 2, bw * 0.2);
        bc.fillStyle = pal.bronzeLit;
        bc.globalAlpha = 0.6;
        bc.fillRect(-bw, y - bw * 0.1, bw * 2, Math.max(0.8, bw * 0.05));
        bc.globalAlpha = 1;
      }
      bc.restore();
      /* The cascabel knob behind the breech. */
      bc.fillStyle = pal.bronzeLow;
      bc.beginPath();
      bc.arc(0, breech + bw * 0.3, bw * 0.16, 0, TAU);
      bc.fill();
      /* The bore, as an ellipse at the mouth. */
      bc.fillStyle = pal.bore;
      bc.beginPath();
      bc.ellipse(0, -L + bw * 0.02, half(Bz.narrow) * 0.62, bw * 0.12, 0, 0, TAU);
      bc.fill();
      barrel = b;
    }
    {
      const r = BALL.radius * k;
      ballSide = Math.ceil(r * 2 + 4);
      const [b, bc] = makeLayer(ballSide, ballSide, ratio);
      bc.translate(ballSide / 2, ballSide / 2);
      bc.fillStyle = pal.iron;
      bc.beginPath();
      bc.arc(0, 0, r, 0, TAU);
      bc.fill();
      bc.fillStyle = pal.ironLit;
      bc.beginPath();
      bc.arc(-r * 0.32, -r * 0.32, r * 0.36, 0, TAU);
      bc.fill();
      ballSprite = b;
    }
    {
      const r = TARGET.radius * k;
      balloonSide = Math.ceil(r * 2.9);
      const make = (m: BalloonMaterial) => {
        const [b, bc] = makeLayer(balloonSide, balloonSide, ratio);
        bc.translate(balloonSide / 2, balloonSide / 2);
        paintBalloon(bc, r, m);
        return b;
      };
      balloons = BALLOONS.map(make);
      spent = make(SPENT);
    }
    {
      cloudW = k * 0.34;
      const crand = seeded(77);
      clouds = [0, 1, 2].map(() => {
        const [c, cc] = makeLayer(cloudW, cloudW * 0.42, ratio);
        paintCloud(cc, cloudW, crand);
        return c;
      });
    }
    {
      const side = Math.ceil(k * 0.3);
      const [g, gc] = makeLayer(side, side, ratio);
      const grad = gc.createRadialGradient(side / 2, side / 2, 0, side / 2, side / 2, side / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      gc.fillStyle = grad;
      gc.fillRect(0, 0, side, side);
      glowSprite = g;
    }
    if (pal.beam) {
      /* The beam as a wedge that fades with distance, drawn once and scaled
         to its length each frame — a hard-edged grey bar otherwise. */
      const bw = Math.ceil(k * 0.7);
      const bh = Math.ceil(k * 0.06);
      const [g, gc] = makeLayer(bw, bh, ratio);
      const fade = gc.createLinearGradient(bw, 0, 0, 0);
      fade.addColorStop(0, pal.beam);
      fade.addColorStop(1, transparent(pal.beam));
      gc.fillStyle = fade;
      gc.beginPath();
      gc.moveTo(bw, bh * 0.52);
      gc.lineTo(0, 0);
      gc.lineTo(0, bh);
      gc.lineTo(bw, bh * 0.62);
      gc.closePath();
      gc.fill();
      beamSprite = g;
    } else beamSprite = null;
    if (pal.lanternGlow) {
      const side = Math.ceil(k * 0.3);
      const [g, gc] = makeLayer(side, side, ratio);
      const grad = gc.createRadialGradient(side / 2, side / 2, 0, side / 2, side / 2, side / 2);
      grad.addColorStop(0, pal.lanternGlow);
      grad.addColorStop(1, transparent(pal.lanternGlow));
      gc.fillStyle = grad;
      gc.fillRect(0, 0, side, side);
      lanternSprite = g;
    } else lanternSprite = null;
    const r = TARGET.radius * k;
    fontShort = `600 ${Math.round(r * LOOK.numeral.short)}px ${family}`;
    fontLong = `600 ${Math.round(r * LOOK.numeral.long)}px ${family}`;
    fontFloat = `600 ${Math.round(0.062 * k)}px ${family}`;
  }

  /* ── frame pieces ── */

  function drawSkyLife(ctx: CanvasRenderingContext2D, t: number) {
    const k = width;
    const horizon = LOOK.horizon * k;
    const railTop = LOOK.railTop * k;
    /* Twinkling stars. */
    if (pal.stars && !reduced) {
      ctx.fillStyle = pal.stars;
      for (let i = 0; i < MOTION.twinklers; i += 1) {
        const x = ((i * 0.6180339 + 0.13) % 1) * k;
        const y = ((i * 0.381966 + 0.07) % 0.8) * horizon;
        const a = Math.max(0, Math.sin(t * (0.9 + (i % 5) * 0.23) + i * 2.1));
        if (a < 0.05) continue;
        ctx.globalAlpha = a;
        star(ctx, x, y, k * 0.008 * a, k * 0.002, 4, 0);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    /* Clouds, drifting right. */
    ctx.globalAlpha = pal.cloudAlpha;
    for (let i = 0; i < MOTION.clouds; i += 1) {
      const sprite = clouds[i % clouds.length];
      if (!sprite) continue;
      const scale = 0.7 + ((i * 0.37) % 0.6);
      const w = cloudW * scale;
      const span = k + w;
      const drift = reduced ? 0 : t * k * 0.008 * (0.6 + i * 0.25);
      const x = ((i * 0.31 * span + drift) % span) - w;
      const y = (0.1 + ((i * 0.23) % 0.62)) * k;
      ctx.drawImage(sprite, x, y, w, w * 0.42);
    }
    ctx.globalAlpha = 1;
    /* The lighthouse beam, seen side-on: its length swings as it turns. */
    if (pal.beam) {
      const turn = reduced ? 0.15 : (t / MOTION.beamTurn) % 1;
      const c = Math.cos(turn * TAU);
      const lx = 0.925 * k;
      const ly = horizon - k * 0.024 - k * 0.085 - k * 0.007;
      const len = k * 0.7 * Math.abs(c);
      if (beamSprite && len > 1) {
        ctx.save();
        ctx.translate(lx, ly);
        if (c < 0) ctx.scale(-1, 1);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.abs(c);
        ctx.drawImage(beamSprite, -len, -k * 0.035, len, k * 0.06);
        ctx.restore();
      }
    }
    /* A sailboat crossing the horizon. */
    {
      const x = (((reduced ? 0.3 : t * MOTION.sail + 0.3) % 1.2) - 0.1) * k;
      const y = horizon - k * 0.003;
      ctx.fillStyle = pal.hull;
      ctx.beginPath();
      ctx.moveTo(x - k * 0.022, y - k * 0.006);
      ctx.lineTo(x + k * 0.024, y - k * 0.006);
      ctx.lineTo(x + k * 0.016, y + k * 0.002);
      ctx.lineTo(x - k * 0.016, y + k * 0.002);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = pal.sail;
      ctx.beginPath();
      ctx.moveTo(x, y - k * 0.008);
      ctx.lineTo(x, y - k * 0.05);
      ctx.lineTo(x + k * 0.02, y - k * 0.008);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - k * 0.003, y - k * 0.008);
      ctx.lineTo(x - k * 0.003, y - k * 0.04);
      ctx.lineTo(x - k * 0.018, y - k * 0.008);
      ctx.closePath();
      ctx.fill();
    }
    /* Gulls, far off. */
    if (pal.gull && !reduced) {
      ctx.strokeStyle = pal.gull;
      ctx.lineWidth = Math.max(1, k * 0.003);
      ctx.lineCap = 'round';
      for (let i = 0; i < 2; i += 1) {
        const x = (((t * 0.018 * (1 + i * 0.4) + i * 0.55) % 1.3) - 0.15) * k;
        const y = (0.62 + i * 0.1 + Math.sin(t * 0.4 + i) * 0.02) * k;
        const f = Math.sin(t * 5.5 + i * 2) * k * 0.006;
        const s = k * (0.014 - i * 0.003);
        ctx.beginPath();
        ctx.moveTo(x - s, y - f);
        ctx.quadraticCurveTo(x - s * 0.5, y - s * 0.5 - f * 0.5, x, y);
        ctx.quadraticCurveTo(x + s * 0.5, y - s * 0.5 - f * 0.5, x + s, y - f);
        ctx.stroke();
      }
    }
    /* Glints on the water and the column of light under the orb. */
    if (!reduced) {
      ctx.fillStyle = pal.glint;
      for (let i = 0; i < MOTION.glints; i += 1) {
        const depth = (i * 0.618034) % 1;
        const y = horizon + (railTop - horizon) * (0.1 + depth * 0.85);
        const x = ((i * 0.381966 + t * 0.004 * (1 + depth)) % 1) * k;
        const a = Math.max(0, Math.sin(t * (1.4 + depth) + i * 1.9));
        if (a < 0.1) continue;
        ctx.globalAlpha = a * 0.8;
        ctx.fillRect(x, y, k * (0.01 + depth * 0.02) * a, Math.max(1, k * 0.0025));
      }
    }
    ctx.fillStyle = pal.path;
    const px = pal.orb.x * k;
    for (let i = 0; i < 9; i += 1) {
      const f = i / 8;
      const y = horizon + (railTop - horizon) * (0.04 + f * 0.9);
      const w = k * (0.04 + f * 0.07) * (reduced ? 1 : 0.7 + 0.3 * Math.sin(t * 2.2 + i * 1.3));
      ctx.globalAlpha = 0.55 - f * 0.25;
      ctx.fillRect(px - w / 2 + (reduced ? 0 : Math.sin(t * 1.3 + i) * k * 0.008), y, w, Math.max(1, k * 0.004));
    }
    ctx.globalAlpha = 1;
  }

  function drawBunting(ctx: CanvasRenderingContext2D, t: number) {
    const k = width;
    const B = LOOK.bunting;
    const y0 = B.y * k;
    const sag = B.sag * k;
    ctx.strokeStyle = pal.line;
    ctx.lineWidth = Math.max(1, k * 0.0035);
    ctx.beginPath();
    ctx.moveTo(-k * 0.02, y0 - sag * 0.3);
    ctx.quadraticCurveTo(k * 0.5, y0 + sag * 1.7, k * 1.02, y0 - sag * 0.3);
    ctx.stroke();
    for (let i = 0; i < B.pennants; i += 1) {
      const u = (i + 0.5) / B.pennants;
      const x = -k * 0.02 + u * k * 1.04;
      /* The point on the quadratic at u. */
      const y = (1 - u) * (1 - u) * (y0 - sag * 0.3) + 2 * (1 - u) * u * (y0 + sag * 1.7) + u * u * (y0 - sag * 0.3);
      const sway = reduced ? 0 : Math.sin(t * 1.7 + i * 0.9) * 0.12;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sway);
      ctx.fillStyle = pal.pennants[i % pal.pennants.length];
      ctx.beginPath();
      ctx.moveTo(-k * 0.022, 0);
      ctx.lineTo(k * 0.022, 0);
      ctx.lineTo(0, k * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(k * 0.022, 0);
      ctx.lineTo(0, k * 0.05);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawNumber(ctx: CanvasRenderingContext2D, value: number, x: number, y: number, m: BalloonMaterial) {
    const text = numeral(value);
    const long = text.length >= 3;
    const r = TARGET.radius * width;
    const size = r * (long ? LOOK.numeral.long : LOOK.numeral.short);
    ctx.font = long ? fontLong : fontShort;
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * LOOK.numeral.stroke;
    ctx.strokeStyle = m.edge;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = m.ink;
    ctx.fillText(text, x, y);
  }

  function drawTarget(ctx: CanvasRenderingContext2D, tg: HarbourTarget, now: number, t: number) {
    const k = width;
    const r = TARGET.radius * k;
    const age = now - tg.born;
    const m = materialOf(tg.id);
    let x = tg.x * k;
    const y = tg.y * k;
    let alpha = 1;
    let scale = 1;
    let sprite = balloons[tg.id % balloons.length];
    let material = m;
    let cross = 0;
    if (tg.state === 'live') {
      const fade = reduced ? 1 : clamp01(age / TARGET.fadeMs);
      alpha = fade;
      scale = (reduced ? 1 : 0.82 + 0.18 * fade) * (1 + (reduced ? 0 : Math.sin(t * 2.1 + tg.sway) * MOTION.breathe));
    } else if (tg.state === 'hit') {
      /* Popped: the balloon is gone the instant it is struck; what is left is the burst. */
      const p = clamp01((now - (tg.endAt - FEEDBACK.burstMs)) / FEEDBACK.burstMs);
      ctx.strokeStyle = pal.confettiWhite;
      ctx.globalAlpha = 1 - p;
      ctx.lineWidth = Math.max(1.5, r * 0.16 * (1 - p));
      ctx.beginPath();
      ctx.arc(x, y, r * (0.7 + (reduced ? 0.3 : 1.1 * p)), 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = m.fill;
      ctx.lineWidth = Math.max(1, r * 0.1 * (1 - p));
      for (let i = 0; i < 8; i += 1) {
        const a = (i * TAU) / 8 + tg.id;
        const r0 = r * (0.9 + p * 0.9);
        const r1 = r * (1.15 + p * 1.2);
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
        ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      return;
    } else if (tg.state === 'wrong') {
      /* Struck with the wrong number: the air goes out of it, it shakes, it is crossed. */
      const since = now - (tg.endAt - FEEDBACK.wrongMs);
      const shake = clamp01(since / FEEDBACK.shakeMs);
      if (!reduced) x += Math.sin(shake * Math.PI * 6) * FEEDBACK.shakeAmplitude * (1 - shake) * k;
      alpha = 1 - clamp01(since / FEEDBACK.wrongMs) * 0.75;
      scale = 1 - 0.14 * clamp01(since / 220);
      sprite = spent ?? sprite;
      material = SPENT;
      cross = 1;
    } else {
      alpha = 1 - clamp01((now - (tg.endAt - TARGET.fadeMs)) / TARGET.fadeMs);
      scale = 1;
    }
    if (alpha <= 0.01 || !sprite) return;
    ctx.globalAlpha = alpha;
    /* The string, swinging a little behind the sway. */
    const knotY = y + r * (LOOK.balloon.ry - LOOK.balloon.rise + 0.12) * scale;
    const swing = reduced ? 0 : Math.sin(t * 1.3 + tg.sway - 0.6) * r * 0.35;
    ctx.strokeStyle = material.deep;
    ctx.lineWidth = Math.max(1, k * 0.0028);
    ctx.beginPath();
    ctx.moveTo(x, knotY);
    ctx.bezierCurveTo(x - swing, knotY + LOOK.balloon.string * k * 0.35, x + swing, knotY + LOOK.balloon.string * k * 0.7, x - swing * 0.5, knotY + LOOK.balloon.string * k);
    ctx.stroke();
    if (pal.balloonHalo && glowSprite && tg.state === 'live') {
      const gs = r * 3.4 * scale;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.22;
      ctx.drawImage(glowSprite, x - gs / 2, y - gs / 2, gs, gs);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;
    }
    const s = balloonSide * scale;
    ctx.drawImage(sprite, x - s / 2, y - s / 2, s, s);
    if (cross) {
      const c = r * 0.62;
      ctx.lineCap = 'round';
      ctx.strokeStyle = material.deep;
      ctx.lineWidth = r * 0.17;
      ctx.beginPath();
      ctx.moveTo(x - c, y - c);
      ctx.lineTo(x + c, y + c);
      ctx.moveTo(x + c, y - c);
      ctx.lineTo(x - c, y + c);
      ctx.stroke();
    }
    drawNumber(ctx, tg.value, x, y + r * 0.04, material);
    ctx.globalAlpha = 1;
  }

  function drawParticles(ctx: CanvasRenderingContext2D, now: number, dt: number) {
    const k = width;
    for (const p of pool) {
      if (!p.on) continue;
      const age = now - p.born;
      if (age < 0) continue;
      if (age > p.life) {
        p.on = false;
        continue;
      }
      const q = age / p.life;
      p.vy += p.g * dt;
      if (p.kind === CONFETTI || p.kind === SCRAP) {
        p.vx *= 1 - Math.min(1, dt * 1.8);
        p.vy = Math.min(p.vy, p.kind === CONFETTI ? 0.35 : 0.6);
      } else if (p.kind === SMOKE) {
        p.vx *= 1 - Math.min(1, dt * 2.5);
        p.vy *= 1 - Math.min(1, dt * 2.5);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const x = p.x * k;
      const y = p.y * k;
      const s = p.size * k;
      if (p.kind === SMOKE) {
        ctx.globalAlpha = (1 - q) * 0.75;
        ctx.fillStyle = pal.smokeShade;
        ctx.beginPath();
        ctx.arc(x, y + s * 0.25 * (1 + q), s * (0.6 + q * 1.1), 0, TAU);
        ctx.fill();
        ctx.fillStyle = p.colour;
        ctx.beginPath();
        ctx.arc(x - s * 0.1, y, s * (0.55 + q), 0, TAU);
        ctx.fill();
        continue;
      }
      ctx.globalAlpha = q < 0.75 ? 1 : 1 - (q - 0.75) / 0.25;
      ctx.fillStyle = p.colour;
      if (p.kind === SPARK) {
        star(ctx, x, y, s * Math.sin(Math.PI * q), s * 0.3 * Math.sin(Math.PI * q), 4, p.rot);
        ctx.fill();
        continue;
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.rot);
      /* Confetti flutters: its width turns edge-on and back. */
      const turn = p.kind === CONFETTI ? Math.cos(age / 90 + p.born) : 1;
      ctx.scale(turn, 1);
      if (p.kind === CONFETTI) ctx.fillRect(-s / 2, -s * 0.3, s, s * 0.6);
      else {
        ctx.beginPath();
        ctx.ellipse(0, 0, s, s * 0.45, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /* ── the API ── */

  return {
    resize(nextWidth, nextRatio, nextTheme, nextFont) {
      if (nextWidth === width && nextRatio === ratio && nextTheme === theme && nextFont === family && sky) return;
      width = nextWidth;
      ratio = nextRatio;
      theme = nextTheme;
      family = nextFont;
      pal = HARBOUR[theme];
      if (width > 0) build();
    },

    paint(ctx, now, v) {
      if (!sky || !deck) return;
      const k = width;
      const t = now / 1000;
      const dt = lastNow ? Math.min(0.1, Math.max(0, (now - lastNow) / 1000)) : 0;
      lastNow = now;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      /* What changed since the last frame: a shot, a pop, a wrong strike. */
      if (v.shotAt !== lastShot) {
        const fresh = v.shotAt > lastShot && now - v.shotAt < 200;
        lastShot = v.shotAt;
        if (fresh) {
          const a = v.angle;
          const mx = CANNON.x + Math.sin(a) * CANNON.barrelLength;
          const my = CANNON.y - Math.cos(a) * CANNON.barrelLength;
          for (let i = 0; i < MOTION.smokePuffs; i += 1) {
            const sp = 0.05 + Math.random() * 0.12;
            const spread = (Math.random() - 0.5) * 1.2;
            emit(SMOKE, mx, my, Math.sin(a + spread) * sp, -Math.cos(a + spread) * sp - 0.03, -0.04, 0.018 + Math.random() * 0.012, pal.smoke, now + i * 18, MOTION.smokeMs * (0.7 + Math.random() * 0.5));
          }
          if (now >= moodUntil) {
            mood = 'flap';
            moodUntil = now + MOTION.flapMs;
          }
        }
      }
      for (const tg of v.targets) {
        const was = seen.get(tg);
        if (was === tg.state) continue;
        seen.set(tg, tg.state);
        if (was !== 'live') continue;
        if (tg.state === 'hit') {
          const m = materialOf(tg.id);
          for (let i = 0; i < MOTION.confetti; i += 1) {
            const a = Math.random() * TAU;
            const sp = 0.25 + Math.random() * 0.45;
            emit(CONFETTI, tg.x, tg.y, Math.cos(a) * sp, Math.sin(a) * sp - 0.2, 0.9, 0.012 + Math.random() * 0.01, i % 3 === 0 ? pal.confettiWhite : i % 3 === 1 ? m.fill : pal.pennants[i % pal.pennants.length], now, MOTION.confettiMs * (0.7 + Math.random() * 0.5), (Math.random() - 0.5) * 14);
          }
          for (let i = 0; i < 4; i += 1) {
            const a = (i / 4) * TAU + 0.4;
            emit(SPARK, tg.x + Math.cos(a) * 0.08, tg.y + Math.sin(a) * 0.08, Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0, 0.022, pal.flash, now + i * 30, 420);
          }
          mood = 'happy';
          moodUntil = now + MOTION.happyMs;
        } else if (tg.state === 'wrong') {
          for (let i = 0; i < MOTION.scraps; i += 1) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
            const sp = 0.1 + Math.random() * 0.15;
            emit(SCRAP, tg.x, tg.y + TARGET.radius * 0.6, Math.cos(a) * sp, Math.sin(a) * sp, 0.5, 0.008 + Math.random() * 0.006, SPENT.shade, now, 700, (Math.random() - 0.5) * 6);
          }
          mood = 'sad';
          moodUntil = now + MOTION.sadMs;
        }
      }

      ctx.drawImage(sky, 0, 0, k, k * ASPECT);
      drawSkyLife(ctx, t);
      drawBunting(ctx, t);

      for (const tg of v.targets) drawTarget(ctx, tg, now, t);

      /* The aim: a dotted line out of the muzzle, so a keyboard player sees where a shot goes. */
      const a = v.angle;
      const kick = reduced ? 0 : Math.max(0, 1 - (now - v.shotAt) / CANNON.recoilMs) * CANNON.recoil;
      if (v.phase !== 'over') {
        const tipX = CANNON.x + Math.sin(a) * CANNON.barrelLength;
        const tipY = CANNON.y - Math.cos(a) * CANNON.barrelLength;
        ctx.fillStyle = pal.aim;
        for (let i = 1; i <= 9; i += 1) {
          const d = i * 0.055;
          ctx.globalAlpha = 1 - i / 10;
          ctx.beginPath();
          ctx.arc((tipX + Math.sin(a) * d) * k, (tipY - Math.cos(a) * d) * k, k * 0.0055, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      ctx.drawImage(deck, 0, 0, k, k * ASPECT);

      /* The barrel, kicking back along its own axis. */
      if (barrel) {
        ctx.save();
        ctx.translate(CANNON.x * k, CANNON.y * k);
        ctx.rotate(a);
        ctx.translate(0, kick * k);
        ctx.drawImage(barrel, -barrelW / 2, -barrelPivot, barrelW, barrelH);
        ctx.restore();
        /* The carriage's cheeks rise either side of the breech, in front of
           it — so the barrel sits *in* the carriage at every angle. */
        const cx = CANNON.x * k;
        const top = CANNON.y * k - k * 0.01;
        for (const side of [-1, 1]) {
          const w = k * 0.036;
          const x0 = side < 0 ? cx - k * 0.022 - w : cx + k * 0.022;
          const y0 = top - k * 0.018;
          const h = k * 0.058;
          ctx.fillStyle = pal.woodLow;
          ctx.beginPath();
          ctx.roundRect(x0, y0, w, h, [k * 0.016, k * 0.016, k * 0.004, k * 0.004]);
          ctx.fill();
          ctx.fillStyle = pal.wood;
          ctx.beginPath();
          ctx.roundRect(x0, y0, w * 0.78, h * 0.9, [k * 0.016, k * 0.016, k * 0.004, k * 0.004]);
          ctx.fill();
          ctx.fillStyle = pal.woodLit;
          ctx.fillRect(x0 + k * 0.007, y0 + k * 0.003, w - k * 0.02, Math.max(1, k * 0.004));
          ctx.fillStyle = pal.iron;
          ctx.beginPath();
          ctx.arc(x0 + w / 2, y0 + h * 0.62, k * 0.004, 0, TAU);
          ctx.fill();
        }
        /* Trunnion cap over the pivot. */
        ctx.fillStyle = pal.iron;
        ctx.beginPath();
        ctx.arc(CANNON.x * k, CANNON.y * k, k * 0.014, 0, TAU);
        ctx.fill();
        ctx.fillStyle = pal.ironLit;
        ctx.beginPath();
        ctx.arc(CANNON.x * k - k * 0.004, CANNON.y * k - k * 0.004, k * 0.005, 0, TAU);
        ctx.fill();
      }
      /* The flash at the muzzle. */
      const since = now - v.shotAt;
      if (!reduced && since >= 0 && since < MOTION.flashMs) {
        const q = since / MOTION.flashMs;
        const mx = (CANNON.x + Math.sin(a) * (CANNON.barrelLength - kick + 0.02)) * k;
        const my = (CANNON.y - Math.cos(a) * (CANNON.barrelLength - kick + 0.02)) * k;
        ctx.fillStyle = pal.flash;
        ctx.globalAlpha = 1 - q;
        star(ctx, mx, my, k * (0.045 + q * 0.03), k * 0.018, 7, a + q);
        ctx.fill();
        ctx.fillStyle = pal.flashCore;
        ctx.beginPath();
        ctx.arc(mx, my, k * 0.016 * (1 - q * 0.5), 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      /* Pico at his post: he turns to watch where the barrel points, cheers a
         right answer, slumps at a wrong one, beats a wing at every shot. */
      if (a < -0.3) facing = -1;
      else if (a > 0.3) facing = 1;
      if (now >= moodUntil) mood = 'idle';
      let pose: PicoPose = mood;
      if (v.phase === 'over') pose = v.score > 0 ? 'happy' : 'idle';
      const P = LOOK.pico;
      const size = P.size * k;
      pico.x = P.x * k;
      pico.y = P.feet * k - size * 0.38;
      pico.size = size;
      pico.pose = pose;
      pico.flap = pose === 'flap' ? (now - v.shotAt) / 120 : 0.5;
      pico.facing = facing;
      pico.tilt = pose === 'flap' ? -0.2 : pose === 'sad' ? 0.12 : -0.08;
      pico.blink = reduced ? 0 : picoBlinkAt(t);
      drawPico(ctx, pico);

      /* Cannonballs, each with a trail of smoke back to the muzzle. */
      if (ballSprite) {
        for (const b of v.balls) {
          const speed = Math.hypot(b.vx, b.vy) || 1;
          const ux = b.vx / speed;
          const uy = b.vy / speed;
          const mx = CANNON.x + ux * CANNON.barrelLength;
          const my = CANNON.y + uy * CANNON.barrelLength;
          const travelled = Math.hypot(b.x - mx, b.y - my);
          if (!reduced) {
            ctx.fillStyle = pal.smoke;
            for (let i = MOTION.trail; i >= 1; i -= 1) {
              const back = i * MOTION.trailStep * speed;
              if (back > travelled) continue;
              ctx.globalAlpha = 0.5 * (1 - i / (MOTION.trail + 1));
              ctx.beginPath();
              ctx.arc((b.x - ux * back) * k, (b.y - uy * back) * k, BALL.radius * k * (0.55 + i * 0.12), 0, TAU);
              ctx.fill();
            }
            ctx.globalAlpha = 1;
          }
          ctx.drawImage(ballSprite, b.x * k - ballSide / 2, b.y * k - ballSide / 2, ballSide, ballSide);
        }
      }

      drawParticles(ctx, now, dt);

      /* "+1" / "−1" over the balloon they belong to. */
      if (v.floats.length) {
        ctx.font = fontFloat;
        ctx.lineJoin = 'round';
        for (const f of v.floats) {
          const p = clamp01((now - f.at) / FEEDBACK.floatMs);
          const plus = f.text.charCodeAt(0) === 43;
          const look = plus ? pal.plus : pal.minus;
          ctx.globalAlpha = 1 - p * p;
          const fx = f.x * k;
          const fy = (f.y - (reduced ? 0 : 0.07 * p)) * k;
          ctx.lineWidth = k * 0.014;
          ctx.strokeStyle = look.edge;
          ctx.strokeText(f.text, fx, fy);
          ctx.fillStyle = look.fill;
          ctx.fillText(f.text, fx, fy);
        }
        ctx.globalAlpha = 1;
      }

      /* The lantern's light, last, over everything near it. */
      if (lanternSprite) {
        const x = 0.935 * k;
        const y = (LOOK.railTop - 0.035 - 0.028) * k;
        const flicker = reduced ? 1 : 0.85 + 0.1 * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 13.1);
        const gs = k * 0.36 * flicker;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = flicker;
        ctx.drawImage(lanternSprite, x - gs / 2, y - gs / 2, gs, gs);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    },
  };
}
