/**
 * Pico's Flight, drawn: the sky, the ranges, the town, the columns, the turf,
 * the weather and Pico — everything on the stage that is not the game.
 *
 * `FlightGame.tsx` owns the world (bird, columns, score, the loop) and hands
 * this a snapshot each frame; this owns how it looks and nothing else. It reads
 * no input, writes nothing back and decides nothing — the effects it plays (a
 * puff of feathers on a flap, sparks off a cleared gate, the crash) are
 * reactions to what the engine already did. That is the boundary that lets the
 * whole picture be redrawn without `npm run verify` having an opinion.
 *
 * **What is expensive happens once.** The sky, four parallax ranges, the turf
 * and three columns a side are painted into offscreen canvases when the stage
 * is sized or the theme changes, at the stage's own pixels-per-unit and
 * density, and every frame is then a few dozen `drawImage` calls plus Pico.
 * The ranges are tiles that close on themselves (`SCENE.period`), so a scroll
 * is an offset, never a repaint.
 *
 * **What moves per frame allocates nothing.** Particles live in fixed typed
 * arrays (a pool, not a list), positions that can be a function of time are
 * (stars, fireflies, clouds, wind, the flock — no state at all), and every
 * colour string is built at configure time. A game loop that makes garbage
 * hitches every few seconds on a phone, and a hitch here is a crash.
 *
 * All drawing is in CSS pixels on a context already scaled for the display —
 * `FlightGame` sets that transform — with world units converted at `ppu`.
 */
import { drawPico, picoSizeForBodyRadius, PICO_BRAND, type DrawPicoOptions, type PicoPose } from '../pico';
import { FLIGHT } from './config';
import type { Pipe } from './engine';
import { SCENE, type RidgePalette, type ScenePalette, type SceneTone } from './scene';

type Ctx = CanvasRenderingContext2D;

const TAU = Math.PI * 2;
const H = FLIGHT.worldHeight;
const COL = FLIGHT.pipe.width;
const CAP = FLIGHT.pipe.cap;

/* ── small pure helpers ─────────────────────────────────────────────────── */

/**
 * A seeded generator (mulberry32). The scene is procedural but must not be
 * random: the same stage has to come back identically after a resize or a
 * theme switch, or the town rebuilds itself under the player mid-flight. It
 * also keeps the game's own `Math.random` stream — which deals the course —
 * untouched by anything decorative.
 */
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

const mod = (v: number, m: number) => ((v % m) + m) % m;

/** `#rrggbb` at an alpha, for gradient stops. Configure-time only. */
function rgba(hex: string, a: number): string {
  const v = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

/** An offscreen canvas whose context draws in world units. */
interface Sheet {
  canvas: HTMLCanvasElement;
  /** Size in CSS pixels — what `drawImage` is given. */
  w: number;
  h: number;
}

function sheet(wUnits: number, hUnits: number, ppu: number, dpr: number): { s: Sheet; c: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(wUnits * ppu * dpr));
  canvas.height = Math.max(1, Math.round(hUnits * ppu * dpr));
  const c = canvas.getContext('2d') as Ctx;
  /*
   * Scaled to the *rounded* pixel size rather than `ppu × dpr`, so a tile is
   * exactly its period wide in device pixels. A tile a third of a pixel short
   * leaves a hairline seam that crawls across the sky at the layer's speed.
   */
  c.setTransform(canvas.width / wUnits, 0, 0, canvas.height / hUnits, 0, 0);
  return { s: { canvas, w: canvas.width / dpr, h: canvas.height / dpr }, c };
}

function circle(c: Ctx, x: number, y: number, r: number) {
  c.moveTo(x + r, y);
  c.arc(x, y, r, 0, TAU);
}

/** A leaf: a pointed oval from its stem at the origin along +x. */
function leaf(c: Ctx, len: number, wid: number) {
  c.moveTo(0, 0);
  c.quadraticCurveTo(len * 0.45, -wid, len, 0);
  c.quadraticCurveTo(len * 0.45, wid, 0, 0);
}

/** Five petals and an eye. */
function flower(c: Ctx, x: number, y: number, r: number, petal: string, eye: string) {
  c.fillStyle = petal;
  c.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU - Math.PI / 2;
    circle(c, x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.72);
  }
  c.fill();
  c.fillStyle = eye;
  c.beginPath();
  circle(c, x, y, r * 0.55);
  c.fill();
}

/**
 * Calls `draw(x)` at `x` and at its repeats either side of a tile, for any
 * shape that straddles the seam — so a house cut by the tile edge is finished
 * on the other side and the tile closes.
 */
function wrapped(x: number, half: number, period: number, draw: (x: number) => void) {
  draw(x);
  if (x - half < 0) draw(x + period);
  if (x + half > period) draw(x - period);
}

/* ── the static layers ──────────────────────────────────────────────────── */

function paintSky(c: Ctx, W: number, p: ScenePalette) {
  const g = c.createLinearGradient(0, 0, 0, H);
  for (let i = 0; i < 4; i++) g.addColorStop(p.skyAt[i], p.sky[i]);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);

  // The low band of light the far ranges stand against.
  const hz = c.createLinearGradient(0, 40, 0, 74);
  hz.addColorStop(0, rgba(p.horizon, 0));
  hz.addColorStop(0.65, rgba(p.horizon, p.horizonAlpha));
  hz.addColorStop(1, rgba(p.horizon, 0));
  c.fillStyle = hz;
  c.fillRect(0, 40, W, 34);

  // The orb: a soft glow, one faint flat ring inside it, then the disc. Three
  // stacked rings were tried first, for the flat look, and read as a target.
  const { x: ox, y: oy, r, halo } = SCENE.orb;
  const x = W * ox;
  const glow = c.createRadialGradient(x, oy, r * 0.9, x, oy, halo[2] * 1.3);
  glow.addColorStop(0, rgba(p.halo, p.haloAlpha * 3.2));
  glow.addColorStop(0.35, rgba(p.halo, p.haloAlpha * 1.3));
  glow.addColorStop(1, rgba(p.halo, 0));
  c.fillStyle = glow;
  c.beginPath();
  circle(c, x, oy, halo[2] * 1.3);
  c.fill();
  c.fillStyle = rgba(p.halo, p.haloAlpha);
  c.beginPath();
  circle(c, x, oy, halo[0]);
  c.fill();
  c.fillStyle = p.orb;
  c.beginPath();
  circle(c, x, oy, r);
  c.fill();
  c.fillStyle = p.orbShade;
  if (p.moteKind === 'firefly') {
    // The moon's seas: three soft discs on the side away from the light.
    c.beginPath();
    circle(c, x - 1.4, oy - 0.9, 1.05);
    circle(c, x + 0.9, oy + 1.5, 0.75);
    circle(c, x - 0.6, oy + 1.7, 0.45);
    c.fill();
  } else {
    // The sun's hot core.
    c.globalAlpha = 0.7;
    c.beginPath();
    circle(c, x, oy, r * 0.62);
    c.fill();
    c.globalAlpha = 1;
  }
}

/**
 * The aurora — night only, and the brand accent's one appearance in the sky.
 * A curtain of rays, each its own short gradient, under a slowly breathing
 * alpha applied at draw time.
 */
function paintAurora(c: Ctx, W: number, accent: string) {
  // Smooth in every term — a random length per ray read as rain, not light.
  // It sweeps down from the upper left and fades out before the moon.
  const step = 0.25;
  for (let x = 0; x < W; x += step) {
    const u = x / W;
    const fade = Math.max(0, Math.min(1, (0.78 - u) / 0.3)) * Math.min(1, u / 0.06 + 0.4);
    if (fade <= 0) continue;
    const base = 20 + u * 16 + Math.sin(x / 9 + 0.6) * 3.2 + Math.sin(x / 3.9) * 0.8;
    const len = 10 + Math.sin(x / 7.3 + 1.2) * 3.5 + Math.sin(x / 2.6) * 1.2;
    const a = fade * (0.6 + 0.4 * Math.sin(x / 5.5 + 2.1));
    const g = c.createLinearGradient(0, base - len, 0, base + 1.5);
    g.addColorStop(0, rgba(accent, 0));
    g.addColorStop(0.7, rgba(accent, 0.5 * a));
    g.addColorStop(0.86, rgba(accent, 0.8 * a));
    g.addColorStop(1, rgba(accent, 0));
    c.fillStyle = g;
    c.fillRect(x, base - len, step * 1.6, len + 1.5);
  }
}

/** One mountain range, faceted: a lit face, a shaded face, snow on the tall ones. */
function paintRange(
  c: Ctx,
  P: number,
  bottom: number,
  ridge: readonly [number, number],
  peaks: number,
  pal: RidgePalette,
  rand: () => number,
) {
  const spacing = P / peaks;
  for (let i = 0; i < peaks; i++) {
    const cx = (i + 0.5 + (rand() - 0.5) * 0.55) * spacing;
    const ay = ridge[0] + rand() * (ridge[1] - ridge[0]);
    const half = spacing * (0.75 + rand() * 0.6);
    const base = bottom + 1;
    // Each slope bends twice, so a ridge reads as rock rather than a triangle.
    const l1x = -half * (0.32 + rand() * 0.08);
    const l1y = (base - ay) * (0.3 + rand() * 0.12);
    const l2x = -half * (0.66 + rand() * 0.1);
    const l2y = (base - ay) * (0.62 + rand() * 0.1);
    const r1x = half * (0.3 + rand() * 0.1);
    const r1y = (base - ay) * (0.28 + rand() * 0.14);
    const r2x = half * (0.64 + rand() * 0.1);
    const r2y = (base - ay) * (0.6 + rand() * 0.12);
    const kx = half * (0.04 + rand() * 0.1);
    const fx = half * (rand() * 0.22 - 0.06);
    const snowy = ay < ridge[0] + (ridge[1] - ridge[0]) * 0.55;
    const capT = 0.16 + rand() * 0.06;

    wrapped(cx, half, P, (x) => {
      // Silhouette, lit.
      c.fillStyle = pal.lit;
      c.beginPath();
      c.moveTo(x - half, base);
      c.lineTo(x + l2x, ay + l2y);
      c.lineTo(x + l1x, ay + l1y);
      c.lineTo(x, ay);
      c.lineTo(x + r1x, ay + r1y);
      c.lineTo(x + r2x, ay + r2y);
      c.lineTo(x + half, base);
      c.closePath();
      c.fill();
      // The face turned from the light: everything left of the crease.
      c.fillStyle = pal.shade;
      c.beginPath();
      c.moveTo(x - half, base);
      c.lineTo(x + l2x, ay + l2y);
      c.lineTo(x + l1x, ay + l1y);
      c.lineTo(x, ay);
      c.lineTo(x + kx, ay + (base - ay) * 0.45);
      c.lineTo(x + fx, base);
      c.closePath();
      c.fill();

      if (!snowy) return;
      // Snow down the first bend of each slope, with a ragged lower edge.
      const d = (base - ay) * capT;
      const lx = x + (l1x * d) / l1y;
      const rx = x + (r1x * d) / r1y;
      c.save();
      c.beginPath();
      c.moveTo(x, ay);
      c.lineTo(rx, ay + d);
      c.lineTo(rx - (rx - x) * 0.35, ay + d * 0.72);
      c.lineTo(x + (rx - x) * 0.25, ay + d * 1.12);
      c.lineTo(x - (x - lx) * 0.2, ay + d * 0.8);
      c.lineTo(lx + (x - lx) * 0.3, ay + d * 1.05);
      c.lineTo(lx, ay + d);
      c.closePath();
      c.fillStyle = pal.cap;
      c.fill();
      c.clip();
      c.fillStyle = pal.capShade;
      c.beginPath();
      c.moveTo(lx - 2, ay - 1);
      c.lineTo(x, ay - 0.2);
      c.lineTo(x + kx * (d / ((base - ay) * 0.45)), ay + d + 1);
      c.lineTo(lx - 2, ay + d + 1);
      c.closePath();
      c.fill();
      c.restore();
    });
  }
}

/** Valley fog laid over the foot of a range, so the next layer stands in front of air. */
function paintMist(c: Ctx, P: number, from: number, to: number, p: ScenePalette) {
  const g = c.createLinearGradient(0, from, 0, to);
  g.addColorStop(0, rgba(p.mist, 0));
  g.addColorStop(1, rgba(p.mist, p.mistAlpha));
  c.fillStyle = g;
  c.fillRect(0, from, P, to - from);
}

/** A smooth hill line that closes on itself over `P`. */
function hillLine(P: number, mid: number, a: number, b: number, phase: number) {
  return (x: number) =>
    mid + Math.sin((x / P) * TAU * 2 + phase) * a + Math.sin((x / P) * TAU * 5 + phase * 2.3) * b;
}

function fillHill(c: Ctx, P: number, bottom: number, y: (x: number) => number, dx = 0, dy = 0) {
  c.beginPath();
  c.moveTo(-1, bottom + 1);
  for (let x = -1; x <= P + 1; x += 0.5) c.lineTo(x + dx, y(x) + dy);
  c.lineTo(P + 1, bottom + 1);
  c.closePath();
  c.fill();
}

/** A round tree — three discs, lit from the right, on a short trunk. */
function roundTree(c: Ctx, x: number, ground: number, r: number, body: string, lit: string, trunk: string) {
  c.fillStyle = trunk;
  c.fillRect(x - r * 0.14, ground - r * 1.2, r * 0.28, r * 1.3);
  const cy = ground - r * 1.55;
  c.save();
  c.beginPath();
  circle(c, x, cy, r);
  circle(c, x - r * 0.62, cy + r * 0.35, r * 0.72);
  circle(c, x + r * 0.6, cy + r * 0.32, r * 0.7);
  c.fillStyle = body;
  c.fill();
  c.clip();
  c.fillStyle = lit;
  c.beginPath();
  circle(c, x + r * 0.42, cy - r * 0.38, r * 0.78);
  c.fill();
  c.restore();
}

/** A pine — three stacked tiers, the right half of each lit. */
function pine(c: Ctx, x: number, ground: number, h: number, body: string, lit: string, trunk: string) {
  const w = h * 0.42;
  c.fillStyle = trunk;
  c.fillRect(x - w * 0.08, ground - h * 0.2, w * 0.16, h * 0.22);
  for (let i = 0; i < 3; i++) {
    const top = ground - h + i * h * 0.24;
    const bot = ground - h * 0.16 - (2 - i) * h * 0.16;
    const half = w * (0.55 + i * 0.22);
    c.fillStyle = body;
    c.beginPath();
    c.moveTo(x, top);
    c.lineTo(x + half, bot);
    c.lineTo(x - half, bot);
    c.closePath();
    c.fill();
    c.fillStyle = lit;
    c.beginPath();
    c.moveTo(x, top);
    c.lineTo(x + half, bot);
    c.lineTo(x + half * 0.15, bot);
    c.closePath();
    c.fill();
  }
}

/** The town on its hill: houses, towers, a twin-spired church, lit panes at night. */
function paintTown(c: Ctx, P: number, bottom: number, p: ScenePalette, rand: () => number) {
  const [r0, r1] = SCENE.layers.town.ridge;
  const t = p.town;
  const hill = hillLine(P, (r0 + r1) / 2 + 2.6, 1.6, 0.7, rand() * TAU);

  c.fillStyle = t.hillLit;
  fillHill(c, P, bottom, hill);
  c.fillStyle = t.hill;
  fillHill(c, P, bottom, hill, -0.6, 0.5);

  interface Pane {
    x: number;
    y: number;
    lit: boolean;
  }
  const panes: Pane[] = [];

  const house = (x: number, w: number, h: number, kind: number) => {
    const base = hill(x + w / 2) + 0.9;
    const top = base - h;
    wrapped(x + w / 2, w / 2 + 0.6, P, (cx) => {
      const left = cx - w / 2;
      c.fillStyle = t.wall;
      c.fillRect(left, top, w, h + 0.2);
      c.fillStyle = t.wallShade;
      c.fillRect(left, top, w * 0.32, h + 0.2);
      if (kind === 0) {
        // Gable.
        const rh = w * 0.48;
        c.fillStyle = t.roof;
        c.beginPath();
        c.moveTo(left - 0.25, top + 0.05);
        c.lineTo(cx, top - rh);
        c.lineTo(left + w + 0.25, top + 0.05);
        c.closePath();
        c.fill();
        c.fillStyle = t.roofShade;
        c.beginPath();
        c.moveTo(left - 0.25, top + 0.05);
        c.lineTo(cx, top - rh);
        c.lineTo(cx, top + 0.05);
        c.closePath();
        c.fill();
      } else if (kind === 1) {
        // Flat, with a parapet.
        c.fillStyle = t.roof;
        c.fillRect(left - 0.15, top - 0.35, w + 0.3, 0.4);
      } else {
        // A tower: tall, narrow, with a spire.
        const sh = w * 1.9;
        c.fillStyle = t.roof;
        c.beginPath();
        c.moveTo(left - 0.15, top + 0.05);
        c.lineTo(cx, top - sh);
        c.lineTo(left + w + 0.15, top + 0.05);
        c.closePath();
        c.fill();
        c.fillStyle = t.roofShade;
        c.beginPath();
        c.moveTo(left - 0.15, top + 0.05);
        c.lineTo(cx, top - sh);
        c.lineTo(cx, top + 0.05);
        c.closePath();
        c.fill();
      }
    });
    // Panes on a grid, recorded so the glow can go down first.
    for (let py = top + 0.75; py < base - 1.2; py += 1.15) {
      for (let px = x + 0.45; px < x + w - 0.75; px += 0.85) {
        panes.push({ x: px, y: py, lit: rand() < t.litShare });
      }
    }
  };

  // Two settlements a period, and open hillside between them.
  const clusters: Array<[number, number]> = [
    [P * 0.08, P * 0.42],
    [P * 0.58, P * 0.86],
  ];
  for (const [from, to] of clusters) {
    let x = from;
    while (x < to) {
      const mid = 1 - Math.abs((x - from) / (to - from) - 0.5) * 2;
      const tower = rand() < 0.14;
      const w = tower ? 1.5 + rand() * 0.4 : 1.9 + rand() * 1.8;
      const h = tower ? 6 + rand() * 3 + mid * 2 : 2.2 + rand() * 2 + mid * 2.2;
      house(x, w, h, tower ? 2 : rand() < 0.68 ? 0 : 1);
      x += w + 0.15 + rand() * 0.7;
    }
  }
  // The landmark: a church with two unequal towers, which is what the old
  // town square these vouchers are spent around looks like from a hill.
  const ch = P * 0.25;
  house(ch - 1.8, 4.2, 4.6, 0);
  house(ch - 3.4, 1.7, 10.5, 2);
  house(ch + 2.5, 1.5, 8.6, 2);

  // Trees on the open slopes.
  for (let i = 0; i < 26; i++) {
    const x = rand() * P;
    const inTown = clusters.some(([a, b]) => x > a + 1 && x < b - 1);
    if (inTown && rand() < 0.7) continue;
    const r = 0.7 + rand() * 0.7;
    wrapped(x, r * 2, P, (cx) => roundTree(c, cx, hill(cx) + 0.6, r, t.hill, t.hillLit, t.hill));
  }

  // Glow first, then the panes on top of it.
  if (t.paneGlowAlpha > 0) {
    for (const pane of panes) {
      if (!pane.lit) continue;
      const g = c.createRadialGradient(pane.x + 0.2, pane.y + 0.28, 0, pane.x + 0.2, pane.y + 0.28, 1.5);
      g.addColorStop(0, rgba(t.paneGlow, t.paneGlowAlpha));
      g.addColorStop(1, rgba(t.paneGlow, 0));
      c.fillStyle = g;
      wrapped(pane.x, 1.6, P, (x) => c.fillRect(x - 1.3, pane.y - 1.2, 3, 3));
    }
  }
  for (const pane of panes) {
    c.fillStyle = pane.lit ? t.paneLit : t.pane;
    wrapped(pane.x, 0.5, P, (x) => c.fillRect(x, pane.y, 0.4, 0.55));
  }
}

/** The near hills: two rolling lines, round trees and pines along the crest. */
function paintHills(c: Ctx, P: number, bottom: number, p: ScenePalette, rand: () => number) {
  const [r0, r1] = SCENE.layers.hills.ridge;
  const h = p.hills;
  const back = hillLine(P, r0 + 1, 2.2, 0.9, rand() * TAU);
  const front = hillLine(P, (r0 + r1) / 2 + 2, 2.6, 1.1, rand() * TAU);

  c.fillStyle = h.back;
  fillHill(c, P, bottom, back);

  // Trees on the back line, behind the front hill.
  for (let x = rand() * 3; x < P; x += 2.2 + rand() * 3.5) {
    const y = back(x) + 0.8;
    if (rand() < 0.5) {
      const hh = 4 + rand() * 3.5;
      wrapped(x, hh, P, (cx) => pine(c, cx, y, hh, h.back, h.lit, h.trunk));
    } else {
      const r = 1.2 + rand() * 1;
      wrapped(x, r * 2, P, (cx) => roundTree(c, cx, y, r, h.back, h.lit, h.trunk));
    }
  }

  c.fillStyle = h.lit;
  fillHill(c, P, bottom, front);
  c.fillStyle = h.base;
  fillHill(c, P, bottom, front, -0.8, 0.55);

  for (let x = rand() * 4; x < P; x += 3.2 + rand() * 6) {
    const y = front(x) + 1;
    const pick = rand();
    if (pick < 0.4) {
      const hh = 5 + rand() * 4;
      wrapped(x, hh, P, (cx) => pine(c, cx, y, hh, h.tree, h.treeLit, h.trunk));
    } else if (pick < 0.85) {
      const r = 1.5 + rand() * 1.3;
      wrapped(x, r * 2.2, P, (cx) => roundTree(c, cx, y, r, h.tree, h.treeLit, h.trunk));
    } else {
      // A bush.
      const r = 0.9 + rand() * 0.6;
      wrapped(x, r * 2, P, (cx) => {
        c.fillStyle = h.tree;
        c.beginPath();
        circle(c, cx, y - r * 0.4, r);
        circle(c, cx + r * 0.9, y - r * 0.2, r * 0.7);
        c.fill();
      });
    }
  }
}

/**
 * The turf. Soil with stones in it, a scalloped band of grass lit along its
 * top, blades and a few flowers. Kept under four units — see `SCENE.ground`.
 */
function paintGround(c: Ctx, P: number, p: ScenePalette, rand: () => number) {
  const g = p.ground;
  const { soil, turf, blades } = SCENE.ground;

  c.fillStyle = g.soil;
  c.fillRect(0, soil, P, H - soil + 1);
  c.fillStyle = g.soilDeep;
  c.fillRect(0, H - 0.55, P, 1);
  // Stones in the soil.
  for (let i = 0; i < 26; i++) {
    const x = rand() * P;
    const y = soil + 0.5 + rand() * (H - soil - 0.6);
    const r = 0.12 + rand() * 0.22;
    c.fillStyle = rand() < 0.5 ? g.pebble : g.soilDeep;
    wrapped(x, r, P, (cx) => {
      c.beginPath();
      c.ellipse(cx, y, r * 1.4, r, 0, 0, TAU);
      c.fill();
    });
  }

  // The turf band: scallops, lit along the top. Bump widths divide the period
  // so the band closes.
  const bumps = Math.round(P / 1.2);
  const bw = P / bumps;
  const scallop = (dy: number) => {
    c.beginPath();
    c.moveTo(0, soil + 0.6);
    for (let i = 0; i <= bumps; i++) {
      const x = i * bw;
      const lift = 0.18 + ((i * 7) % 5) * 0.06;
      c.quadraticCurveTo(x - bw / 2, turf - lift + dy, x, turf + 0.2 + dy);
    }
    c.lineTo(P, soil + 0.6);
    c.closePath();
    c.fill();
  };
  c.fillStyle = g.grassLit;
  scallop(0);
  c.fillStyle = g.grass;
  scallop(0.32);

  // Blades.
  for (let i = 0; i < P * 2.4; i++) {
    const x = rand() * P;
    const tall = blades + rand() * (turf - blades - 0.3);
    const lean = (rand() - 0.35) * 0.7;
    const w = 0.16 + rand() * 0.16;
    c.fillStyle = rand() < 0.45 ? g.grassLit : g.blade;
    wrapped(x, 1, P, (cx) => {
      c.beginPath();
      c.moveTo(cx - w, turf + 0.5);
      c.quadraticCurveTo(cx + lean * 0.3, (tall + turf) / 2, cx + lean, tall);
      c.quadraticCurveTo(cx + lean * 0.4 + w * 0.4, (tall + turf) / 2, cx + w, turf + 0.5);
      c.closePath();
      c.fill();
    });
  }

  // Flowers, sparse: one every few units, two colours.
  for (let i = 0; i < P / 7; i++) {
    const x = rand() * P;
    const top = blades - 0.2 + rand() * 0.7;
    const col = p.bloom[i % 2];
    wrapped(x, 1, P, (cx) => {
      c.strokeStyle = g.blade;
      c.lineWidth = 0.12;
      c.beginPath();
      c.moveTo(cx, turf + 0.3);
      c.quadraticCurveTo(cx + 0.25, (top + turf) / 2, cx, top);
      c.stroke();
      flower(c, cx, top, 0.24, col, g.grassLit);
    });
  }
}

/* ── the columns ────────────────────────────────────────────────────────── */

/** Room either side of the column in its sprite, for the overhang and the leaves. */
const SIDE = 1.4;
/** Room past the mouth: a standing column's moss and flowers, a hanging one's drips. */
const LIP = 2;

interface ColumnSprite extends Sheet {
  /** Where the mouth sits in the sprite, in world units from its top. */
  mouth: number;
}

/** The glyphs carved into a capital's neck. One set, so every gate spells the same word. */
const GLYPHS = [1.25, 2.85, 4.5, 6.15, 7.75] as const;

function glyphs(c: Ctx, y: number) {
  for (let i = 0; i < GLYPHS.length; i++) {
    const x = GLYPHS[i];
    c.beginPath();
    if (i % 3 === 0) {
      c.moveTo(x, y - 0.4);
      c.lineTo(x + 0.33, y);
      c.lineTo(x, y + 0.4);
      c.lineTo(x - 0.33, y);
      c.closePath();
      c.fill();
    } else if (i % 3 === 1) {
      c.rect(x - 0.1, y - 0.36, 0.2, 0.72);
      c.fill();
      c.rect(x - 0.32, y - 0.06, 0.64, 0.12);
      c.fill();
    } else {
      c.lineWidth = 0.13;
      c.arc(x, y, 0.27, 0, TAU);
      c.stroke();
    }
  }
}

/**
 * One column, standing (`bottom`) or hanging (`top`).
 *
 * Drawn in a local frame where the mouth is at y = 0 and the shaft runs toward
 * +y, away from the gap; a hanging column is the same frame flipped. Lighting
 * is not symmetric under that flip — the upper face of a ledge catches light
 * whichever way up the column is — so the capital is drawn per kind.
 *
 * The silhouette is the collision rectangle exactly: the shaft is `COL` wide
 * edge to edge, and every chip and crack is drawn *inside* it rather than cut
 * out of it, because a notch the bird can see daylight through and still die in
 * is the unfairness the engine's comments spend paragraphs avoiding.
 */
function paintColumn(
  ppu: number,
  dpr: number,
  kind: 'top' | 'bottom',
  p: ScenePalette,
  accent: string,
  rand: () => number,
): ColumnSprite {
  const L = SCENE.column.length;
  const ov = SCENE.column.overhang;
  const { s, c } = sheet(COL + SIDE * 2, L + LIP, ppu, dpr);
  const st = p.stone;
  const top = kind === 'top';
  const mouth = top ? L : LIP;

  c.translate(SIDE, mouth);
  if (top) c.scale(1, -1);
  // From here: x 0..COL across the shaft, y 0 at the mouth, + away from it.

  // The shaft: a square pier of dressed stone seen a little from the left — a
  // narrow side face in shade, then the front face laid in courses. Courses,
  // not flutes: fluting in a warm stone read as planks of wood by daylight,
  // and a pier of blocks says "ruin" in both lights.
  const runFrom = CAP - 0.05;
  const run = L - runFrom + 1;
  const side = 1.5;
  c.fillStyle = st.face;
  c.fillRect(0, runFrom, COL, run);
  c.fillStyle = st.lit;
  c.globalAlpha = 0.5;
  c.fillRect(6.4, runFrom, COL - 6.4, run);
  c.globalAlpha = 1;
  c.fillStyle = st.shade;
  c.fillRect(0, runFrom, side, run);
  c.fillStyle = st.deep;
  c.fillRect(0, runFrom, 0.28, run);
  c.fillRect(side - 0.12, runFrom, 0.16, run);

  // Courses of blocks, each a touch lighter or darker than its neighbours,
  // with the bed joints lit along the edge that faces up in the world.
  const course = SCENE.column.course;
  const joints: number[] = [];
  let row = 0;
  for (let y = runFrom + 0.6 + rand() * 1.4; y < L; y += course, row++) {
    joints.push(y);
    const head = side + (row % 2 === 0 ? 2.7 : 5.1) + (rand() - 0.5) * 0.8;
    for (const [from, to] of [
      [side, head],
      [head, COL],
    ] as const) {
      const tone = rand();
      if (tone < 0.3 || tone > 0.78) {
        c.fillStyle = tone < 0.3 ? st.shade : st.lit;
        c.globalAlpha = 0.28;
        c.fillRect(from + 0.1, y, to - from - 0.2, course);
        c.globalAlpha = 1;
      }
    }
    c.fillStyle = st.seam;
    c.fillRect(side, y - 0.1, COL - side, 0.2);
    c.fillRect(head - 0.09, y, 0.18, course);
    c.fillStyle = st.deep;
    c.fillRect(0, y - 0.1, side, 0.2);
    // The block below a joint catches light along its top in the world, which
    // is the far side of the joint on a standing pier and the near side on a
    // hanging one.
    c.fillStyle = st.lit;
    c.globalAlpha = 0.7;
    c.fillRect(side, top ? y - 0.32 : y + 0.1, COL - side, 0.2);
    c.globalAlpha = 1;
    // A chipped corner, painted in rather than cut out.
    if (rand() < 0.3) {
      const left = rand() < 0.5;
      const cw = 0.45 + rand() * 0.5;
      const ch = 0.5 + rand() * 0.6;
      c.fillStyle = st.deep;
      c.globalAlpha = 0.8;
      c.beginPath();
      if (left) {
        c.moveTo(side, y);
        c.lineTo(side + cw, y);
        c.lineTo(side, y + ch);
      } else {
        c.moveTo(COL, y);
        c.lineTo(COL - cw, y);
        c.lineTo(COL, y + ch);
      }
      c.closePath();
      c.fill();
      c.globalAlpha = 1;
    }
  }

  // Weathering: soft darker blots.
  c.fillStyle = st.shade;
  for (let i = 0; i < 8; i++) {
    c.globalAlpha = 0.16 + rand() * 0.16;
    c.beginPath();
    c.ellipse(side + 0.6 + rand() * 6.2, runFrom + 2 + rand() * (L - 6), 0.35 + rand() * 0.5, 0.5 + rand() * 1, 0, 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;

  // A crack or two.
  c.strokeStyle = st.seam;
  c.lineWidth = 0.17;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (let k = 0; k < 2; k++) {
    let x = 1.5 + rand() * 6;
    let y = CAP + 3 + rand() * 30;
    c.beginPath();
    c.moveTo(x, y);
    for (let i = 0; i < 4; i++) {
      x = Math.max(0.5, Math.min(COL - 0.5, x + (rand() - 0.5) * 1.6));
      y += 0.8 + rand() * 1.2;
      c.lineTo(x, y);
    }
    c.stroke();
  }

  // Moss along some joints, heaped on the joint's upper side.
  const moss = (cx: number, cy: number, w: number) => {
    const n = Math.round(w * 2.2);
    for (const [col, dy, k] of [
      [p.moss.deep, 0.18, 1],
      [p.moss.base, 0, 0.9],
      [p.moss.lit, -0.22, 0.6],
    ] as const) {
      c.fillStyle = col;
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const x = cx - w / 2 + (i + 0.5) * (w / n);
        const r = (0.35 + ((i * 37) % 7) * 0.07) * k;
        circle(c, x + (k < 1 ? 0.12 : 0), cy + dy, r);
      }
      c.fill();
    }
  };
  // Sparse: a cushion on one joint in a dozen, tucked into a corner. More
  // than that and the patches line up down the edge and read as brackets.
  for (const j of joints) {
    if (rand() < 0.08) {
      const w = 1.4 + rand() * 1.4;
      const cx = rand() < 0.6 ? 1.5 + w / 2 : COL - w / 2 - 0.05;
      moss(cx, j + (top ? 0.3 : -0.3), w);
    }
  }

  // A vine: a stem wandering across the shaft from the far end toward the
  // mouth, with leaves alternating sides and the odd flower.
  const vines = 1 + (rand() < 0.5 ? 1 : 0);
  for (let v = 0; v < vines; v++) {
    const x0 = 1.5 + rand() * 6;
    const amp = 1.4 + rand() * 1.8;
    const wave = 3.5 + rand() * 2.5;
    const phase = rand() * TAU;
    const end = top ? CAP + 0.2 : CAP + 3 + rand() * 10;
    // Kept off the edges, so its leaves lie on the stone instead of jutting
    // past it like ledges.
    const at = (y: number) => Math.max(2.2, Math.min(COL - 1.3, x0 + Math.sin(y / wave + phase) * amp));
    c.strokeStyle = p.vine;
    c.lineWidth = 0.3;
    c.beginPath();
    c.moveTo(at(L), L);
    for (let y = L; y >= end; y -= 0.5) c.lineTo(at(y), y);
    c.stroke();
    let side = 1;
    for (let y = end + 0.6; y < L; y += 1.5 + rand() * 0.8) {
      const x = at(y);
      side = -side;
      c.save();
      c.translate(x, y);
      c.rotate(side > 0 ? -0.5 - rand() * 0.5 : Math.PI + 0.5 + rand() * 0.5);
      const len = 1.05 + rand() * 0.45;
      c.fillStyle = p.leaf;
      c.beginPath();
      leaf(c, len, 0.36);
      c.fill();
      c.fillStyle = p.leafLit;
      c.beginPath();
      c.moveTo(0, 0);
      c.quadraticCurveTo(len * 0.45, -0.36, len, 0);
      c.closePath();
      c.fill();
      c.restore();
      if (rand() < 0.12) flower(c, x + side * 0.5, y + 0.3, 0.2, p.bloom[v % 2], st.lit);
    }
  }

  // The capital: a slab at the mouth, a recessed neck carrying the glyphs.
  const slab = 1.25;
  c.fillStyle = st.shade;
  c.fillRect(-0.15, slab, COL + 0.3, CAP - slab);
  c.fillStyle = st.deep;
  c.fillRect(-0.15, CAP - 0.16, COL + 0.3, 0.2);
  c.fillStyle = accent;
  c.strokeStyle = accent;
  c.globalAlpha = 0.85;
  glyphs(c, (slab + CAP) / 2);
  c.globalAlpha = 1;

  c.fillStyle = st.face;
  c.beginPath();
  c.roundRect(-ov, 0, COL + ov * 2, slab, 0.3);
  c.fill();
  c.fillStyle = st.shade;
  c.fillRect(-ov, 0.05, 1.1, slab - 0.1);
  c.fillStyle = st.lit;
  c.fillRect(6.2, 0.05, 1.9, slab - 0.1);
  if (top) {
    // Hanging: the slab's underside is in shadow, its upper ledge catches light.
    c.fillStyle = st.deep;
    c.fillRect(-ov + 0.1, 0, COL + ov * 2 - 0.2, 0.22);
    c.fillStyle = st.lit;
    c.fillRect(-ov, slab - 0.2, COL + ov * 2, 0.2);
  } else {
    // Standing: the top face is lit, and the slab throws a shadow on the neck.
    c.fillStyle = st.lit;
    c.fillRect(-ov + 0.1, 0, COL + ov * 2 - 0.2, 0.22);
    c.fillStyle = st.deep;
    c.globalAlpha = 0.6;
    c.fillRect(-0.15, slab, COL + 0.3, 0.2);
    c.globalAlpha = 1;
  }

  if (!top) {
    // Moss heaped on the mouth, a little proud of it, with flowers — soft
    // things above a gap read as soft, which is why they may sit outside the
    // rectangle when stone may not.
    const h = SCENE.column.moss;
    for (const [col, lift, k] of [
      [p.moss.deep, 0, 1],
      [p.moss.base, 0.16, 0.86],
      [p.moss.lit, 0.4, 0.55],
    ] as const) {
      c.fillStyle = col;
      c.beginPath();
      const n = 11;
      for (let i = 0; i < n; i++) {
        const x = -0.25 + (i + 0.5) * ((COL + 0.5) / n) + (k < 0.6 ? 0.2 : 0);
        const r = (0.42 + ((i * 53) % 9) * 0.06) * k;
        const peak = Math.min(h - r, 0.4 + ((i * 29) % 5) * 0.08);
        circle(c, x, -(peak - r * 0.2) * k - lift * 0.3 + r * 0.55, r);
      }
      c.fill();
    }
    const blooms = 1 + Math.floor(rand() * 3);
    for (let i = 0; i < blooms; i++) {
      const x = 0.9 + rand() * 7.2;
      c.strokeStyle = p.moss.deep;
      c.lineWidth = 0.12;
      c.beginPath();
      c.moveTo(x, -0.3);
      c.lineTo(x + 0.15, -1.2);
      c.stroke();
      flower(c, x + 0.15, -1.25, 0.22, p.bloom[i % 2], st.lit);
    }
  } else {
    // A hanging column's ledge gathers a little moss at its corners.
    for (const cx of [-ov + 0.6, COL + ov - 0.6]) {
      c.fillStyle = p.moss.base;
      c.beginPath();
      circle(c, cx, slab + 0.15, 0.42);
      circle(c, cx + (cx < 1 ? 0.5 : -0.5), slab + 0.25, 0.32);
      c.fill();
      c.fillStyle = p.moss.lit;
      c.beginPath();
      circle(c, cx + 0.12, slab + 0.32, 0.22);
      c.fill();
    }
  }

  return { ...s, mouth };
}

/**
 * The glyphs again, alone and glowing — laid over a capital at an alpha that
 * says whether Pico has flown that gate yet. The blur is baked here, once, not
 * asked of the frame loop.
 */
function paintRunes(ppu: number, dpr: number, kind: 'top' | 'bottom', accent: string): ColumnSprite {
  const h = 4;
  const { s, c } = sheet(COL + SIDE * 2, h, ppu, dpr);
  const top = kind === 'top';
  // The neck's centre, from the sprite's top.
  const at = top ? h - 1 - 1.825 : 1 + 1.825;
  c.translate(SIDE, at);
  c.shadowColor = accent;
  c.shadowBlur = 0.9 * ppu * dpr;
  c.fillStyle = accent;
  c.strokeStyle = accent;
  glyphs(c, 0);
  // Twice: one pass for the halo, one for the bright core of each stroke.
  c.shadowBlur = 0.35 * ppu * dpr;
  glyphs(c, 0);
  return { ...s, mouth: top ? h - 1 : 1 };
}

/* ── small sprites drawn many times a frame ─────────────────────────────── */

function glowSprite(colour: string, core: number): HTMLCanvasElement {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d') as Ctx;
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, rgba(colour, 1));
  g.addColorStop(core, rgba(colour, 0.55));
  g.addColorStop(1, rgba(colour, 0));
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  return canvas;
}

/** A four-pointed glint: the brightest stars, and the sparks off a gate. */
function glintSprite(colour: string): HTMLCanvasElement {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d') as Ctx;
  const m = size / 2;
  const g = c.createRadialGradient(m, m, 0, m, m, m * 0.5);
  g.addColorStop(0, rgba(colour, 0.9));
  g.addColorStop(1, rgba(colour, 0));
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  c.fillStyle = colour;
  c.beginPath();
  c.moveTo(m, 0);
  c.quadraticCurveTo(m + 2, m - 2, size, m);
  c.quadraticCurveTo(m + 2, m + 2, m, size);
  c.quadraticCurveTo(m - 2, m + 2, 0, m);
  c.quadraticCurveTo(m - 2, m - 2, m, 0);
  c.fill();
  return canvas;
}

/** A soft horizontal streak of wind, faded at both ends. */
function streakSprite(colour: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 4;
  const c = canvas.getContext('2d') as Ctx;
  const g = c.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, rgba(colour, 0));
  g.addColorStop(0.3, rgba(colour, 1));
  g.addColorStop(1, rgba(colour, 0));
  c.fillStyle = g;
  c.beginPath();
  c.roundRect(0, 0.5, 128, 3, 1.5);
  c.fill();
  return canvas;
}

/** A cloud: discs on a flat base, shaded underneath and rimmed toward the light. */
function cloudSprite(ppu: number, dpr: number, p: ScenePalette, rand: () => number): Sheet {
  const n = 4 + Math.floor(rand() * 3);
  const discs: Array<[number, number, number]> = [];
  let x = 0;
  for (let i = 0; i < n; i++) {
    const mid = 1 - Math.abs(i / (n - 1) - 0.5) * 2;
    const r = 1.3 + mid * 1.7 + rand() * 0.8;
    discs.push([x + r, -r * (0.5 + rand() * 0.25), r]);
    x += r * (1 + rand() * 0.3);
  }
  const w = x + discs[n - 1][2] + 0.8;
  const h = 6.5;
  const { s, c } = sheet(w, h, ppu, dpr);
  c.translate(0.2, h - 0.3);
  const shape = (dx: number, dy: number) => {
    c.beginPath();
    for (const [cx, cy, r] of discs) circle(c, cx + dx, Math.min(cy, -0.01) + dy, r);
    c.rect(discs[0][0] + dx, -0.9 + dy, discs[n - 1][0] - discs[0][0], 0.9);
  };
  shape(0, 0);
  c.fillStyle = p.cloud.rim;
  c.fill();
  c.save();
  shape(0, 0);
  c.clip();
  c.fillStyle = p.cloud.shade;
  shape(-0.3, 0.25);
  c.fill();
  c.fillStyle = p.cloud.body;
  shape(-0.3, -0.75);
  c.fill();
  c.restore();
  // Trim the flat underside so nothing paints below the base line.
  c.clearRect(-1, 0, w + 2, 2);
  return s;
}

/* ── the painter ────────────────────────────────────────────────────────── */

/** What the game hands over each frame. Reused by the caller — nothing here keeps it. */
export interface FlightFrame {
  /** Seconds of ambient life: twinkle, drift, fireflies. Frozen under reduced motion. */
  clock: number;
  /** How far the game plane — columns and turf — has travelled, in world units. */
  plane: number;
  /** Whether anything that is not the game may move. */
  ambient: boolean;
  pipes: readonly Pipe[];
  bird: {
    /** Centre of the hit circle, world units. */
    x: number;
    y: number;
    /** Radians, positive nose-down. */
    tilt: number;
    pose: PicoPose;
    flap: number;
    blink: number;
  };
}

interface Columns {
  tops: ColumnSprite[];
  bottoms: ColumnSprite[];
  runeTop: ColumnSprite;
  runeBottom: ColumnSprite;
}

interface Built {
  key: string;
  ppu: number;
  dpr: number;
  width: number;
  height: number;
  tone: SceneTone;
  p: ScenePalette;
  night: boolean;
  sky: Sheet;
  aurora: Sheet | null;
  far: Sheet;
  mid: Sheet;
  town: Sheet;
  hills: Sheet;
  ground: Sheet;
  /** Built on first use: a still of the backdrop (the hover miniature) never needs them. */
  columns: Columns | null;
  accent: string;
  clouds: Sheet[];
  star: HTMLCanvasElement;
  glint: HTMLCanvasElement;
  spark: HTMLCanvasElement;
  mote: HTMLCanvasElement;
  streak: HTMLCanvasElement;
}

/* Layer bands, world units from the top: where each tile starts. */
const BAND = {
  far: SCENE.layers.far.ridge[0] - 1,
  mid: SCENE.layers.mid.ridge[0] - 1,
  town: SCENE.layers.town.ridge[0] - 12,
  hills: SCENE.layers.hills.ridge[0] - 10,
  ground: SCENE.ground.blades - 1.6,
} as const;

/** Per-instance numbers for things that are a pure function of time. */
const STAR_SEED = 11;
const CLOUD_SEED = 23;

export class FlightPainter {
  private built: Built | null = null;

  /* Stars, fixed at construction: x as a fraction of the width, y in units. */
  private readonly sx = new Float32Array(80);
  private readonly sy = new Float32Array(80);
  private readonly sr = new Float32Array(80);
  private readonly sp = new Float32Array(80);
  private readonly sf = new Float32Array(80);

  /* Clouds: which sprite, where, how fast, how far. */
  private readonly cs = new Uint8Array(SCENE.clouds.count);
  private readonly cx = new Float32Array(SCENE.clouds.count);
  private readonly cy = new Float32Array(SCENE.clouds.count);
  private readonly cd = new Float32Array(SCENE.clouds.count);
  private readonly cf = new Float32Array(SCENE.clouds.count);
  private readonly ck = new Float32Array(SCENE.clouds.count);

  /* Feathers — a pool. `fa` is age, `fl` life; a slot is free when age ≥ life. */
  private readonly fx = new Float32Array(SCENE.feathers.pool);
  private readonly fy = new Float32Array(SCENE.feathers.pool);
  private readonly fvx = new Float32Array(SCENE.feathers.pool);
  private readonly fvy = new Float32Array(SCENE.feathers.pool);
  private readonly fr = new Float32Array(SCENE.feathers.pool);
  private readonly fvr = new Float32Array(SCENE.feathers.pool);
  private readonly fa = new Float32Array(SCENE.feathers.pool).fill(1);
  private readonly fl = new Float32Array(SCENE.feathers.pool).fill(1);
  private readonly fs = new Float32Array(SCENE.feathers.pool);
  private readonly fc = new Uint8Array(SCENE.feathers.pool);
  private readonly ff = new Uint8Array(SCENE.feathers.pool);
  private nextFeather = 0;

  /* Sparks off a cleared gate. */
  private readonly kx = new Float32Array(SCENE.sparks.pool);
  private readonly ky = new Float32Array(SCENE.sparks.pool);
  private readonly kvx = new Float32Array(SCENE.sparks.pool);
  private readonly kvy = new Float32Array(SCENE.sparks.pool);
  private readonly ka = new Float32Array(SCENE.sparks.pool).fill(1);
  private readonly ks = new Float32Array(SCENE.sparks.pool);
  private nextSpark = 0;

  /** When each gate was cleared, on this painter's clock — for the rune flare. */
  private readonly cleared = new WeakMap<Pipe, number>();

  /** The painter's own clock, for effects; it runs even when ambient life is frozen. */
  private t = 0;
  private crashAt = -1;
  /**
   * The columns' depth shade: a hanging shaft darkens toward the frame it
   * leaves by, a standing one toward the turf it is planted in, so the capital
   * is the brightest stone on every column and the gate reads first. Tied to
   * the stage's edges rather than baked into the sprite, because only the
   * stretch nearest the mouth is ever on screen. Built once per configure.
   */
  private fades: { key: string; top: CanvasGradient; bottom: CanvasGradient } | null = null;
  private crashX = 0;
  private crashY = 0;
  private readonly rand = seeded(91);

  private readonly pico: DrawPicoOptions = { x: 0, y: 0, size: 0, anchor: 'body', pose: 'flap' };
  private readonly feather: Path2D;
  private readonly quill: Path2D;
  private readonly featherInk: readonly string[] = [PICO_BRAND.wing, PICO_BRAND.body, PICO_BRAND.light];

  constructor() {
    const r = seeded(STAR_SEED);
    const { x: ox, y: oy } = SCENE.orb;
    for (let i = 0; i < this.sx.length; i++) {
      let x = 0;
      let y = 0;
      // Not behind the moon.
      do {
        x = r();
        y = 2 + r() * 46;
      } while (Math.abs(x - ox) < 0.12 && Math.abs(y - oy) < 8);
      this.sx[i] = x;
      this.sy[i] = y;
      this.sr[i] = 0.18 + r() * r() * 0.5;
      this.sp[i] = r() * TAU;
      this.sf[i] = 0.6 + r() * 2.2;
    }
    const q = seeded(CLOUD_SEED);
    const [b0, b1] = SCENE.clouds.band;
    for (let i = 0; i < SCENE.clouds.count; i++) {
      this.cs[i] = i % 3;
      this.cx[i] = q();
      this.cy[i] = b0 + ((i + q() * 0.8) / SCENE.clouds.count) * (b1 - b0);
      this.cd[i] = SCENE.clouds.drift[0] + q() * (SCENE.clouds.drift[1] - SCENE.clouds.drift[0]);
      this.cf[i] = SCENE.clouds.factor[0] + q() * (SCENE.clouds.factor[1] - SCENE.clouds.factor[0]);
      this.ck[i] = 0.7 + q() * 0.5;
    }

    this.feather = new Path2D();
    this.feather.moveTo(-1, 0);
    this.feather.quadraticCurveTo(-0.1, -0.5, 1, -0.05);
    this.feather.quadraticCurveTo(0.1, 0.38, -1, 0);
    this.quill = new Path2D();
    this.quill.moveTo(-1.2, 0.04);
    this.quill.quadraticCurveTo(0, -0.06, 0.85, -0.05);
  }

  /**
   * Builds the offscreen art for a stage of `width × height` CSS pixels at
   * `dpr`, in `tone`, with the page's `accent`. Cheap to call every frame:
   * nothing is rebuilt unless one of those changed.
   */
  configure(width: number, height: number, dpr: number, tone: SceneTone, accent: string): void {
    // Compared field by field, not through a key string, so the every-frame
    // call allocates nothing when nothing changed.
    const was = this.built;
    if (was && was.width === width && was.height === height && was.dpr === dpr && was.tone === tone && was.accent === accent) {
      return;
    }
    const key = `${Math.round(width)}x${Math.round(height)}@${dpr}/${tone}/${accent}`;
    const ppu = height / H;
    const W = width / ppu;
    const p = SCENE.palette[tone];
    const night = p.moteKind === 'firefly';
    const P = SCENE.period;

    const sky = sheet(W, H, ppu, dpr);
    paintSky(sky.c, W, p);

    let aurora: Sheet | null = null;
    if (p.aurora > 0) {
      const a = sheet(W, 42, ppu, dpr);
      paintAurora(a.c, W, accent);
      aurora = a.s;
    }

    const range = (band: number, layer: 'far' | 'mid', seed: number) => {
      const r = seeded(seed);
      const { s, c } = sheet(P, H - band, ppu, dpr);
      c.translate(0, -band);
      const spec = SCENE.layers[layer];
      paintRange(c, P, H, spec.ridge, spec.peaks, p[layer], r);
      paintMist(c, P, spec.ridge[1] - 3, spec.ridge[1] + 12, p);
      return s;
    };
    const far = range(BAND.far, 'far', 3);
    const mid = range(BAND.mid, 'mid', 5);

    const townSheet = sheet(P, H - BAND.town, ppu, dpr);
    townSheet.c.translate(0, -BAND.town);
    paintTown(townSheet.c, P, H, p, seeded(7));
    paintMist(townSheet.c, P, SCENE.layers.town.ridge[1] + 2, H - 6, p);

    const hillSheet = sheet(P, H - BAND.hills, ppu, dpr);
    hillSheet.c.translate(0, -BAND.hills);
    paintHills(hillSheet.c, P, H, p, seeded(13));

    const G = SCENE.ground.period;
    const groundSheet = sheet(G, H - BAND.ground, ppu, dpr);
    groundSheet.c.translate(0, -BAND.ground);
    paintGround(groundSheet.c, G, p, seeded(17));

    const cr = seeded(CLOUD_SEED + 1);
    const clouds = [cloudSprite(ppu, dpr, p, cr), cloudSprite(ppu, dpr, p, cr), cloudSprite(ppu, dpr, p, cr)];

    this.built = {
      key,
      ppu,
      dpr,
      width,
      height,
      tone,
      p,
      night,
      sky: sky.s,
      aurora,
      far,
      mid,
      town: townSheet.s,
      hills: hillSheet.s,
      ground: groundSheet.s,
      columns: null,
      accent,
      clouds,
      star: glowSprite(p.star, 0.22),
      glint: glintSprite(p.star),
      spark: glintSprite(accent),
      mote: glowSprite(p.mote, night ? 0.25 : 0.5),
      streak: streakSprite(p.wind),
    };
  }

  private columns(b: Built): Columns {
    if (!b.columns) {
      const tops: ColumnSprite[] = [];
      const bottoms: ColumnSprite[] = [];
      for (let v = 0; v < SCENE.column.variants; v++) {
        tops.push(paintColumn(b.ppu, b.dpr, 'top', b.p, b.accent, seeded(101 + v * 7)));
        bottoms.push(paintColumn(b.ppu, b.dpr, 'bottom', b.p, b.accent, seeded(211 + v * 7)));
      }
      b.columns = {
        tops,
        bottoms,
        runeTop: paintRunes(b.ppu, b.dpr, 'top', b.accent),
        runeBottom: paintRunes(b.ppu, b.dpr, 'bottom', b.accent),
      };
    }
    return b.columns;
  }

  /**
   * The backdrop alone, held still — sky, ranges, town, hills and turf, no
   * columns, no Pico, no weather. What the hover miniature stands its CSS
   * columns in front of, so the card and the round are one picture.
   */
  still(ctx: Ctx, plane: number): void {
    const b = this.built;
    if (!b) return;
    ctx.clearRect(0, 0, b.width, b.height);
    this.backdrop(ctx, b, 0, plane, false);
    this.tile(ctx, b.ground, BAND.ground, plane, b.width, b.ppu);
  }

  /** Forget every particle and flare — a new run. */
  reset(): void {
    this.fa.fill(1);
    this.ka.fill(1);
    this.crashAt = -1;
  }

  /** A puff of feathers off Pico's back on a flap. */
  flap(x: number, y: number): void {
    const { perFlap, life, size } = SCENE.feathers;
    for (let i = 0; i < perFlap; i++) {
      this.emitFeather(
        x - 1.5 + this.rand(),
        y + 0.5 + this.rand() * 1.2,
        -4 - this.rand() * 6,
        6 + this.rand() * 6,
        life[0] + this.rand() * (life[1] - life[0]),
        size[0] + this.rand() * (size[1] - size[0]),
        false,
      );
    }
  }

  /** The crash: a burst of feathers, an impact star, a shake. */
  crash(x: number, y: number): void {
    this.crashAt = this.t;
    this.crashX = x;
    this.crashY = y;
    const { burst, life, size } = SCENE.feathers;
    for (let i = 0; i < burst; i++) {
      const a = (i / burst) * TAU + this.rand() * 0.4;
      const v = 12 + this.rand() * 18;
      this.emitFeather(
        x,
        y,
        Math.cos(a) * v,
        Math.sin(a) * v - 8,
        life[1] * (1 + this.rand() * 0.6),
        size[0] + this.rand() * (size[1] - size[0]) * 1.3,
        true,
      );
    }
  }

  private emitFeather(x: number, y: number, vx: number, vy: number, life: number, size: number, front: boolean) {
    const i = this.nextFeather;
    this.nextFeather = (i + 1) % this.fx.length;
    this.fx[i] = x;
    this.fy[i] = y;
    this.fvx[i] = vx;
    this.fvy[i] = vy;
    this.fr[i] = this.rand() * TAU;
    this.fvr[i] = (this.rand() - 0.5) * 9;
    this.fa[i] = 0;
    this.fl[i] = life;
    this.fs[i] = size;
    this.fc[i] = Math.floor(this.rand() * this.featherInk.length);
    this.ff[i] = front ? 1 : 0;
  }

  private gate(x: number, y: number) {
    const { perGate } = SCENE.sparks;
    for (let n = 0; n < perGate; n++) {
      const i = this.nextSpark;
      this.nextSpark = (i + 1) % this.kx.length;
      const a = -Math.PI / 2 + (this.rand() - 0.5) * 2.4;
      const v = 6 + this.rand() * 10;
      this.kx[i] = x + (this.rand() - 0.5) * 2;
      this.ky[i] = y + (this.rand() - 0.5) * 3;
      this.kvx[i] = Math.cos(a) * v - 4;
      this.kvy[i] = Math.sin(a) * v;
      this.ka[i] = 0;
      this.ks[i] = (0.7 + this.rand() * 0.8) * (n === 0 ? 1.6 : 1);
    }
  }

  /**
   * One frame. `dt` advances the effects; pass 0 to repaint a still (a resize
   * while paused). The context must be scaled to CSS pixels already.
   */
  draw(ctx: Ctx, f: FlightFrame, dt: number): void {
    const b = this.built;
    if (!b) return;
    this.t += dt;
    const { ppu, width: Wpx, height: Hpx, p } = b;
    const W = Wpx / ppu;
    const clock = f.clock;

    ctx.clearRect(0, 0, Wpx, Hpx);
    this.backdrop(ctx, b, clock, f.plane, f.ambient);

    /* ── motes behind the columns ── */
    if (f.ambient) this.drawMotes(ctx, b, clock, f.plane, W, ppu);

    /* ── the foreground shakes on impact; the backdrop does not ── */
    const since = this.crashAt < 0 ? Infinity : this.t - this.crashAt;
    let shx = 0;
    let shy = 0;
    if (f.ambient && since < SCENE.crash.shakeFor) {
      const k = 1 - since / SCENE.crash.shakeFor;
      const a = SCENE.crash.shake * k * k * ppu;
      shx = Math.sin(since * 83) * a;
      shy = Math.cos(since * 67) * a;
    }
    ctx.save();
    ctx.translate(shx, shy);

    this.drawColumns(ctx, b, f, W, ppu);

    // The turf, locked to the columns' plane.
    this.tile(ctx, b.ground, BAND.ground, f.plane, Wpx, ppu);

    if (f.ambient) this.drawWind(ctx, b, clock, f.plane, Wpx, ppu);

    this.stepFeathers(dt);
    this.drawFeathers(ctx, ppu, 0);

    /* ── Pico ── */
    const o = this.pico;
    o.x = f.bird.x * ppu;
    o.y = f.bird.y * ppu;
    o.size = picoSizeForBodyRadius(FLIGHT.bird.radius) * ppu;
    o.pose = f.bird.pose;
    o.flap = f.bird.flap;
    o.blink = f.bird.blink;
    o.tilt = f.bird.tilt;
    drawPico(ctx, o);

    this.drawFeathers(ctx, ppu, 1);
    this.drawSparks(ctx, b, dt, ppu);
    if (since < SCENE.crash.flashFor) this.drawFlash(ctx, p.flash, since, ppu);

    ctx.restore();
  }

  /** Everything behind the game plane: sky, stars, aurora, flock, clouds, ranges. */
  private backdrop(ctx: Ctx, b: Built, clock: number, plane: number, ambient: boolean) {
    const { ppu, width: Wpx, p } = b;
    const W = Wpx / ppu;
    ctx.drawImage(b.sky.canvas, 0, 0, b.sky.w, b.sky.h);

    /* ── the sky's life ── */
    if (b.night) {
      for (let i = 0; i < p.stars && i < this.sx.length; i++) {
        const tw = ambient ? 0.6 + 0.4 * Math.sin(clock * this.sf[i] + this.sp[i]) : 0.85;
        const r = this.sr[i] * (i < 5 ? 2.2 : 1.6) * ppu;
        ctx.globalAlpha = tw * (i < 5 ? 1 : 0.85);
        ctx.drawImage(i < 5 ? b.glint : b.star, this.sx[i] * Wpx - r, this.sy[i] * ppu - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      if (b.aurora) {
        ctx.globalAlpha = p.aurora * (ambient ? 0.75 + 0.25 * Math.sin(clock * 0.35) : 0.9);
        ctx.drawImage(b.aurora.canvas, 0, 0, b.aurora.w, b.aurora.h);
        ctx.globalAlpha = 1;
      }
    }

    // The flock: a few birds crossing high up every so often.
    if (ambient) this.drawFlock(ctx, clock, W, ppu, p.flock);

    /* ── clouds, then the ranges far to near ── */
    const span = W + 24;
    ctx.globalAlpha = p.cloud.alpha;
    for (let i = 0; i < this.cs.length; i++) {
      const s = b.clouds[this.cs[i]];
      const k = this.ck[i];
      const x = mod(this.cx[i] * span - clock * this.cd[i] - plane * this.cf[i], span) - 20;
      ctx.drawImage(s.canvas, x * ppu, this.cy[i] * ppu - s.h * k, s.w * k, s.h * k);
    }
    ctx.globalAlpha = 1;

    this.tile(ctx, b.far, BAND.far, plane * SCENE.layers.far.factor, Wpx, ppu);
    this.tile(ctx, b.mid, BAND.mid, plane * SCENE.layers.mid.factor, Wpx, ppu);
    this.tile(ctx, b.town, BAND.town, plane * SCENE.layers.town.factor, Wpx, ppu);
    this.tile(ctx, b.hills, BAND.hills, plane * SCENE.layers.hills.factor, Wpx, ppu);
  }

  /** A tile laid edge to edge across the stage at a parallax offset. */
  private tile(ctx: Ctx, s: Sheet, band: number, offset: number, Wpx: number, ppu: number) {
    const ox = mod(offset * ppu, s.w);
    for (let x = -ox; x < Wpx; x += s.w) ctx.drawImage(s.canvas, x, band * ppu, s.w, s.h);
  }

  private drawColumns(ctx: Ctx, b: Built, f: FlightFrame, W: number, ppu: number) {
    const gap = FLIGHT.pipe.gap;
    const drip = SCENE.column.drip;
    if (this.fades?.key !== b.key) {
      const deep = b.p.stone.deep;
      const top = ctx.createLinearGradient(0, 0, 0, 18 * ppu);
      top.addColorStop(0, rgba(deep, 0.62));
      top.addColorStop(1, rgba(deep, 0));
      const bottom = ctx.createLinearGradient(0, 82 * ppu, 0, H * ppu);
      bottom.addColorStop(0, rgba(deep, 0));
      bottom.addColorStop(1, rgba(deep, 0.55));
      this.fades = { key: b.key, top, bottom };
    }
    const fades = this.fades;
    const cols = this.columns(b);
    for (const pipe of f.pipes) {
      if (pipe.x > W + 1 || pipe.x + COL < -SIDE) continue;
      // A variant per column from its own gap, so a column keeps its dress
      // across frames without the engine having to carry an id for us.
      const v = Math.floor(pipe.gapY * 997) % cols.tops.length;
      const top = cols.tops[v];
      const bottom = cols.bottoms[v];
      const x = (pipe.x - SIDE) * ppu;
      const gapTop = pipe.gapY - gap / 2;
      const gapBottom = pipe.gapY + gap / 2;
      ctx.drawImage(top.canvas, x, (gapTop - top.mouth) * ppu, top.w, top.h);
      ctx.drawImage(bottom.canvas, x, (gapBottom - bottom.mouth) * ppu, bottom.w, bottom.h);
      const shaftX = pipe.x * ppu;
      const shaftW = COL * ppu;
      const topRun = Math.min(18, gapTop - CAP - 0.5);
      if (topRun > 0) {
        ctx.fillStyle = fades.top;
        ctx.fillRect(shaftX, 0, shaftW, topRun * ppu);
      }
      const lowFrom = Math.max(82, gapBottom + CAP + 0.5);
      if (lowFrom < H) {
        ctx.fillStyle = fades.bottom;
        ctx.fillRect(shaftX, lowFrom * ppu, shaftW, (H - lowFrom) * ppu);
      }

      // Vine tips hanging off the hanging column's lip, swaying.
      ctx.strokeStyle = b.p.vine;
      ctx.lineWidth = 0.22 * ppu;
      ctx.lineCap = 'round';
      for (let k = 0; k < 2; k++) {
        const ax = pipe.x + (k === 0 ? 1.4 + v * 0.9 : 6.6 - v * 0.6);
        const len = drip * (k === 0 ? 1 : 0.7);
        const sway = f.ambient ? Math.sin(f.clock * 1.7 + v * 2 + k * 1.3) * 0.35 : 0;
        const ex = ax + sway;
        const ey = gapTop + len;
        ctx.beginPath();
        ctx.moveTo(ax * ppu, gapTop * ppu);
        ctx.quadraticCurveTo(ax * ppu, (gapTop + len * 0.6) * ppu, ex * ppu, ey * ppu);
        ctx.stroke();
        ctx.save();
        ctx.translate(ex * ppu, ey * ppu);
        ctx.rotate(Math.PI / 2 + sway * 0.6 + (k === 0 ? 0.35 : -0.35));
        ctx.scale(ppu, ppu);
        ctx.fillStyle = b.p.leafLit;
        ctx.beginPath();
        leaf(ctx, 0.95, 0.34);
        ctx.fill();
        ctx.restore();
      }

      // The runes: dim until the gate is flown, then a flare that settles lit.
      let at = this.cleared.get(pipe);
      if (pipe.scored && at === undefined) {
        at = this.t;
        this.cleared.set(pipe, at);
        this.gate(f.bird.x, pipe.gapY);
      }
      const { rest, lit } = b.p.rune;
      let a = rest + (f.ambient ? Math.sin(f.clock * 2.2 + v) * 0.08 : 0);
      if (at !== undefined) {
        const s = this.t - at;
        a = lit * (0.82 + 0.18 * Math.max(0, 1 - s / 0.5)) + Math.max(0, 0.6 - s) * 0.6;
      }
      ctx.globalAlpha = Math.min(1, Math.max(0, a));
      if (b.night) ctx.globalCompositeOperation = 'lighter';
      const rt = cols.runeTop;
      const rb = cols.runeBottom;
      ctx.drawImage(rt.canvas, x, (gapTop - rt.mouth) * ppu, rt.w, rt.h);
      ctx.drawImage(rb.canvas, x, (gapBottom - rb.mouth) * ppu, rb.w, rb.h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  private drawMotes(ctx: Ctx, b: Built, clock: number, plane: number, W: number, ppu: number) {
    const n = SCENE.motes;
    const span = W + 10;
    const s = b.night ? 1.5 * ppu : 0.75 * ppu;
    for (let i = 0; i < n; i++) {
      const seed = (i * 0.618034) % 1;
      const drift = b.night ? 0.6 : 1.8;
      const x = mod(seed * span * 3 - plane * 0.6 - clock * drift, span) - 5;
      const baseY = b.night ? 60 + ((i * 37) % 33) : 22 + ((i * 41) % 60);
      const y = baseY + Math.sin(clock * (0.6 + seed) + i) * 2.2 - (b.night ? 0 : (clock * 0.8 + i * 7) % 6);
      const glow = b.night ? 0.35 + 0.65 * Math.max(0, Math.sin(clock * (1.1 + seed * 1.7) + i * 2.3)) : 0.55;
      ctx.globalAlpha = glow;
      ctx.drawImage(b.mote, x * ppu - s, y * ppu - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
  }

  private drawWind(ctx: Ctx, b: Built, clock: number, plane: number, Wpx: number, ppu: number) {
    const { count, speed, length } = SCENE.wind;
    const span = Wpx + 40 * ppu;
    for (let i = 0; i < count; i++) {
      const seed = ((i + 1) * 0.754877) % 1;
      const len = (length[0] + seed * (length[1] - length[0])) * ppu;
      const x = span - mod(seed * span * 5 + (plane * speed + clock * 9) * ppu, span) - len * 0.5;
      const y = (8 + ((i * 53) % 78)) * ppu;
      ctx.globalAlpha = b.p.windAlpha * (0.5 + seed * 0.5);
      ctx.drawImage(b.streak, x, y, len, Math.max(1, 0.32 * ppu));
    }
    ctx.globalAlpha = 1;
  }

  private drawFlock(ctx: Ctx, clock: number, W: number, ppu: number, colour: string) {
    const { every, birds, speed, y } = SCENE.flock;
    const lap = Math.floor(clock / every);
    const t = clock - lap * every;
    const x0 = W + 6 - t * speed;
    if (x0 < -12) return;
    const y0 = y[0] + ((lap * 7919) % 100) / 100 * (y[1] - y[0]);
    ctx.strokeStyle = colour;
    ctx.lineWidth = 0.22 * ppu;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < birds; i++) {
      const bx = x0 + i * 2.1 + (i % 2) * 0.6;
      const by = y0 + Math.abs(i - 1.5) * 1.2;
      const w = 0.55 + Math.sin(clock * 9 + i * 1.7) * 0.35;
      ctx.moveTo((bx - 0.75) * ppu, (by - w) * ppu);
      ctx.quadraticCurveTo((bx - 0.3) * ppu, by * ppu - 0.1 * ppu, bx * ppu, by * ppu);
      ctx.quadraticCurveTo((bx + 0.3) * ppu, by * ppu - 0.1 * ppu, (bx + 0.75) * ppu, (by - w) * ppu);
    }
    ctx.stroke();
  }

  private stepFeathers(dt: number) {
    if (dt <= 0) return;
    for (let i = 0; i < this.fx.length; i++) {
      if (this.fa[i] >= this.fl[i]) continue;
      this.fa[i] += dt;
      // Air drag pulls a feather toward the air's own drift (backward and
      // down), so it tumbles away rather than flying like a stone.
      const drag = Math.min(1, dt * 3.2);
      this.fvx[i] += (-7 - this.fvx[i]) * drag;
      this.fvy[i] += (9 - this.fvy[i]) * drag;
      this.fx[i] += this.fvx[i] * dt;
      this.fy[i] += this.fvy[i] * dt;
      this.fr[i] += this.fvr[i] * dt;
    }
  }

  private drawFeathers(ctx: Ctx, ppu: number, front: 0 | 1) {
    for (let i = 0; i < this.fx.length; i++) {
      if (this.fa[i] >= this.fl[i] || this.ff[i] !== front) continue;
      const k = this.fa[i] / this.fl[i];
      ctx.globalAlpha = k < 0.7 ? 1 : (1 - k) / 0.3;
      ctx.save();
      ctx.translate(this.fx[i] * ppu, this.fy[i] * ppu);
      ctx.rotate(this.fr[i] + Math.sin(this.fa[i] * 7 + i) * 0.4);
      const s = this.fs[i] * ppu;
      ctx.scale(s, s);
      ctx.fillStyle = this.featherInk[this.fc[i]];
      ctx.fill(this.feather);
      ctx.strokeStyle = PICO_BRAND.wingTip;
      ctx.lineWidth = 0.09;
      ctx.stroke(this.quill);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  private drawSparks(ctx: Ctx, b: Built, dt: number, ppu: number) {
    const life = SCENE.sparks.life;
    for (let i = 0; i < this.kx.length; i++) {
      if (this.ka[i] >= life) continue;
      this.ka[i] += dt;
      this.kvy[i] += 14 * dt;
      this.kx[i] += this.kvx[i] * dt;
      this.ky[i] += this.kvy[i] * dt;
      const k = this.ka[i] / life;
      const s = this.ks[i] * (1 - k * 0.6) * 1.6 * ppu;
      ctx.globalAlpha = k < 0.5 ? 1 : (1 - k) * 2;
      ctx.drawImage(b.spark, this.kx[i] * ppu - s, this.ky[i] * ppu - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
  }

  /** The impact: an eight-pointed star that bursts and fades in a quarter second. */
  private drawFlash(ctx: Ctx, colour: string, since: number, ppu: number) {
    const k = since / SCENE.crash.flashFor;
    const r = (2.4 + k * 4.2) * ppu;
    ctx.globalAlpha = (1 - k) * 0.95;
    ctx.fillStyle = colour;
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + 0.2;
      const rr = i % 2 === 0 ? r : r * 0.42;
      const x = this.crashX * ppu + Math.cos(a) * rr;
      const y = this.crashY * ppu + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/**
 * The few scene colours the hover miniature's DOM columns are dressed in, as
 * custom properties to set inline on its stage. The miniature is CSS — its
 * columns slide on a keyframe, not a frame loop — and `site.css` may not name
 * a scene colour, so the colours travel from `scene.ts` to the sheet this way
 * and nowhere else.
 */
export function previewVars(tone: SceneTone): Record<`--${string}`, string> {
  const p = SCENE.palette[tone];
  return {
    '--fs-face': p.stone.face,
    '--fs-lit': rgba(p.stone.lit, 0.6),
    '--fs-shade': p.stone.shade,
    '--fs-deep': p.stone.deep,
    '--fs-seam': rgba(p.stone.seam, 0.55),
    '--fs-moss': p.moss.base,
    '--fs-moss-lit': p.moss.lit,
  };
}
