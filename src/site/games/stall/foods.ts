import { BOMB, COL, ROW } from '../foodBoard';
import { roundedRect } from '../sceneStage';
import { STALL, type FoodColours } from './config';

/**
 * Food Cross's six foods and its bomb, drawn in Pico's flat style.
 *
 * Every food is drawn in a 100-unit design box, the way Pico is: a body in its
 * base colour with the **underside in shade** (the shape filled dark, then a lit
 * copy of it nudged up and left on top, so a crescent of shade is left on the
 * lower right), a soft highlight and a glint — no outlines, the bird's
 * vocabulary. `paintFood` places one at any size; the scene caches each kind as
 * a sprite per cell size, and the hover preview draws the very same calls.
 *
 * **Shape first.** Each food has a silhouette no other shares — round with a
 * leaf, a crescent of lobes, a flat-bottomed wedge, a slice pointing down, a
 * ring, a long diagonal — so the board is playable in greyscale. Colour is the
 * second cue, not the first (see `config.ts`).
 *
 * The specials are marks laid **on** the food, never a different food: stripes
 * along the line a striped food clears (horizontal for a row, vertical for a
 * column), composited `source-atop` so they follow the food's own outline.
 */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const TAU = Math.PI * 2;

/** The arc the croissant's lobes sit on: its centre and radius, in design units. */
const CRESCENT = { x: 50, y: 86, r: 36 };

/* Built on first use: `Path2D` does not exist outside a browser, and this
   module is imported by components that type-check and test without one. */
let paths: ReturnType<typeof build> | null = null;

function build() {
  const p = (d: string) => new Path2D(d);
  const ring = (cx: number, cy: number, outer: (a: number) => number, inner: (a: number) => number, steps = 72) => {
    const path = new Path2D();
    for (let k = 0; k <= steps; k += 1) {
      const a = (k / steps) * TAU;
      const r = outer(a);
      if (k === 0) path.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      else path.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    path.closePath();
    for (let k = steps; k >= 0; k -= 1) {
      const a = (k / steps) * TAU;
      const r = inner(a);
      if (k === steps) path.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      else path.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    path.closePath();
    return path;
  };
  const ellipse = (cx: number, cy: number, rx: number, ry: number, rot = 0) => {
    const path = new Path2D();
    path.ellipse(cx, cy, rx, ry, rot, 0, TAU);
    return path;
  };

  /* The croissant: five lobes along an arc, tips first so the middle sits on top. */
  const lobeAt = (deg: number, rx: number, ry: number) => {
    const a = (deg * Math.PI) / 180;
    return ellipse(CRESCENT.x + Math.cos(a) * CRESCENT.r, CRESCENT.y + Math.sin(a) * CRESCENT.r, rx, ry, a + Math.PI / 2);
  };

  /* Where the doughnut's drips hang: the bottom of the ring, a little left. */
  const drip = (a: number) => {
    const d = Math.atan2(Math.sin(a - 1.75), Math.cos(a - 1.75));
    return Math.max(0, 1 - Math.abs(d) / 0.5) * 4.5 + Math.max(0, 1 - Math.abs(d - 0.9) / 0.3) * 3.5;
  };

  return {
    apple: {
      body: p('M50 31 C42 22 20 21 16 43 C12 65 28 89 42 89 C46 89 47 86 50 86 C53 86 54 89 58 89 C72 89 88 65 84 43 C80 21 58 22 50 31 Z'),
      stem: p('M48.5 33 C48 25 50 19 54.5 13.5 L58 15.5 C54.5 20.5 53 26 53 33 Z'),
      leaf: p('M54 23 C58 12 70 8 82 12 C75 22 64 27 54 23 Z'),
      leafLow: p('M54 23 C64 22 73 18 82 12 C75 22 64 27 54 23 Z'),
      shine: ellipse(31, 46, 5.5, 10.5, 0.35),
    },
    croissant: {
      tips: [lobeAt(201, 10.5, 9), lobeAt(339, 10.5, 9)],
      mids: [lobeAt(236, 15.5, 14), lobeAt(304, 15.5, 14)],
      centre: lobeAt(270, 19.5, 18),
    },
    cheese: {
      top: p('M12 57 L79 29 L90 45 Z'),
      front: p('M12 57 L90 45 L90 79 C90 81 89 82 87 82 L15 76 C13 76 12 75 12 73 Z'),
      rind: p('M84 46 L90 45 L90 79 C90 81 89 82 87 82 L84 81.5 Z'),
      holes: [ellipse(33, 65, 5.5, 5), ellipse(57, 62, 6.5, 6), ellipse(76, 69, 4.5, 4.5), ellipse(45, 72.5, 3, 2.6), ellipse(48, 45, 4, 2)],
    },
    pizza: {
      sauce: p('M16 31 L84 31 L53 89 C51.5 92 48.5 92 47 89 Z'),
      cheese: p('M21 34 L79 34 L51.5 84 C50.5 86 49.5 86 48.5 84 Z'),
      crust: p('M11 32 C21 11 79 11 89 32 C90 36 87 38 84 37 C74 25 26 25 16 37 C13 38 10 36 11 32 Z'),
      pepperoni: [ellipse(39, 45, 7, 6.5), ellipse(61, 48, 6.5, 6), ellipse(50, 66, 5.5, 5.2)],
    },
    doughnut: {
      dough: ring(50, 55, () => 37, () => 11),
      frosting: ring(
        50,
        54,
        (a) => 31 + 1.6 * Math.sin(a * 7) + drip(a),
        (a) => 14 + 0.8 * Math.sin(a * 5),
      ),
    },
    carrot: {
      body: p('M57 21 C62 15 74 16 79 23 C83 29 82 36 79 39 C64 58 40 78 27 87 C22 90 18 86 21 81 C31 67 46 40 57 21 Z'),
      frond: (len: number) => p(`M0 0 C7 -8 6 ${-len * 0.7} 0 ${-len} C-6 ${-len * 0.7} -7 -8 0 0 Z`),
    },
    bomb: {
      body: ellipse(46, 58, 30, 30),
    },
  };
}

function shaded(ctx: Ctx, shape: Path2D, base: string, shade: string, dx = -4, dy = -5, rule: CanvasFillRule = 'nonzero'): void {
  ctx.fillStyle = shade;
  ctx.fill(shape, rule);
  ctx.save();
  ctx.clip(shape, rule);
  ctx.translate(dx, dy);
  ctx.fillStyle = base;
  ctx.fill(shape, rule);
  ctx.restore();
}

function glint(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot: number, alpha: number): void {
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  ctx.fill();
}

function apple(ctx: Ctx, c: FoodColours): void {
  const P = paths!.apple;
  ctx.fillStyle = c.detail;
  ctx.fill(P.stem);
  shaded(ctx, P.body, c.base, c.shade, -5, -5);
  ctx.strokeStyle = c.shade;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(44, 30.5);
  ctx.quadraticCurveTo(50, 35, 56, 30.5);
  ctx.stroke();
  ctx.fillStyle = c.extra;
  ctx.fill(P.leaf);
  ctx.fillStyle = c.extraLow;
  ctx.fill(P.leafLow);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fill(P.shine);
  glint(ctx, 28.5, 61, 2.3, 2.3, 0, 0.45);
}

function croissant(ctx: Ctx, c: FoodColours): void {
  const P = paths!.croissant;
  for (const tip of P.tips) shaded(ctx, tip, c.extra, c.extraLow, -2, -3);
  for (const mid of P.mids) shaded(ctx, mid, c.base, c.shade, -2.5, -3.5);
  shaded(ctx, P.centre, c.base, c.shade, -3, -4);
  /* Flaky layers: a lit stroke along the top of each lobe. */
  ctx.strokeStyle = c.lit;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (const [deg, r] of [[236, 10.5], [270, 13.5], [304, 10.5]] as const) {
    const a = (deg * Math.PI) / 180;
    const x = CRESCENT.x + Math.cos(a) * CRESCENT.r;
    const y = CRESCENT.y + Math.sin(a) * CRESCENT.r;
    ctx.beginPath();
    ctx.arc(x, y + 2, r, a - Math.PI * 0.42 + Math.PI, a + Math.PI * 0.22 + Math.PI);
    ctx.stroke();
  }
  glint(ctx, 42, 38, 5, 2.8, -0.4, 0.55);
  glint(ctx, 24, 54, 2.8, 1.7, -0.9, 0.4);
}

function cheese(ctx: Ctx, c: FoodColours): void {
  const P = paths!.cheese;
  shaded(ctx, P.front, c.base, c.shade, -2, -4);
  ctx.fillStyle = c.shade;
  ctx.fill(P.rind);
  ctx.fillStyle = c.extra;
  ctx.fill(P.top);
  for (const hole of P.holes) shaded(ctx, hole, c.detail, c.detailLow, 1.4, 1.4);
  /* The lit front edge of the top. */
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(16, 56);
  ctx.lineTo(84, 46.5);
  ctx.stroke();
  glint(ctx, 62, 37, 4, 1.8, -0.4, 0.5);
}

function pizza(ctx: Ctx, c: FoodColours): void {
  const P = paths!.pizza;
  ctx.fillStyle = c.detailLow;
  ctx.fill(P.sauce);
  shaded(ctx, P.cheese, c.base, c.shade, -2, -3);
  /* Cheese bubbles. */
  glint(ctx, 47, 55, 3, 2, 0.3, 0.45);
  glint(ctx, 62, 62, 2, 1.4, 0.3, 0.35);
  glint(ctx, 33, 39, 2.2, 1.5, 0.3, 0.35);
  for (const slice of P.pepperoni) shaded(ctx, slice, c.detail, c.detailLow, -1.2, -1.4);
  glint(ctx, 37, 43, 1.8, 1.2, -0.5, 0.5);
  glint(ctx, 59, 46, 1.7, 1.1, -0.5, 0.5);
  shaded(ctx, P.crust, c.extra, c.extraLow, 0, -2.5);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(24, 22);
  ctx.quadraticCurveTo(50, 11, 76, 22);
  ctx.stroke();
}

function doughnut(ctx: Ctx, c: FoodColours): void {
  const P = paths!.doughnut;
  shaded(ctx, P.dough, c.base, c.shade, -2, -3, 'evenodd');
  shaded(ctx, P.frosting, c.extra, c.extraLow, -2, -3, 'evenodd');
  /* Sprinkles round the ring, each at its own fixed angle. */
  const sprinkles = STALL.sprinkles;
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.4;
  for (let k = 0; k < 13; k += 1) {
    const a = (k / 13) * TAU + 0.3;
    const r = k % 2 ? 23 : 18.5;
    const x = 50 + Math.cos(a) * r;
    const y = 54 + Math.sin(a) * r;
    const turn = k * 2.3;
    ctx.strokeStyle = sprinkles[k % sprinkles.length];
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(turn) * 2.6, y - Math.sin(turn) * 2.6);
    ctx.lineTo(x + Math.cos(turn) * 2.6, y + Math.sin(turn) * 2.6);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.arc(50, 54, 25.5, Math.PI * 1.08, Math.PI * 1.36);
  ctx.stroke();
}

function carrot(ctx: Ctx, c: FoodColours): void {
  const P = paths!.carrot;
  for (const [angle, len, low] of [[-0.85, 18, true], [0.55, 20, true], [-0.15, 25, false]] as const) {
    ctx.save();
    ctx.translate(67, 22);
    ctx.rotate(angle);
    ctx.fillStyle = low ? c.extraLow : c.extra;
    ctx.fill(P.frond(len));
    ctx.restore();
  }
  shaded(ctx, P.body, c.base, c.shade, -3, -3);
  ctx.strokeStyle = c.detail;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (const [x, y, w] of [[64, 36, 7], [52, 52, 6], [41, 66, 5], [31, 77, 3.5]] as const) {
    ctx.beginPath();
    ctx.moveTo(x - w * 0.2, y - w * 0.7);
    ctx.quadraticCurveTo(x + w * 0.4, y - w * 0.1, x + w * 0.6, y + w * 0.6);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(60, 26);
  ctx.bezierCurveTo(54, 38, 44, 55, 33, 71);
  ctx.stroke();
}

function bomb(ctx: Ctx): void {
  const B = STALL.bomb;
  /* Fuse and cap first, so the truffle sits over their roots. */
  ctx.strokeStyle = B.fuse;
  ctx.lineWidth = 3.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(67, 28);
  ctx.bezierCurveTo(74, 18, 73, 12, 81, 9);
  ctx.stroke();
  ctx.save();
  ctx.translate(65, 33);
  ctx.rotate(0.72);
  ctx.fillStyle = B.capLow;
  ctx.beginPath();
  roundedRect(ctx, -8, -5, 16, 12, 3);
  ctx.fill();
  ctx.fillStyle = B.cap;
  ctx.beginPath();
  roundedRect(ctx, -8, -6, 16, 10, 3);
  ctx.fill();
  ctx.restore();
  shaded(ctx, paths!.bomb.body, B.base, B.shade, -4, -5);
  /* Sprinkles all over — every colour on the board. */
  const sprinkles = STALL.sprinkles;
  ctx.lineWidth = 2.6;
  for (let k = 0; k < 17; k += 1) {
    const a = k * 2.399;
    const r = 6 + ((k * 37) % 19);
    const x = 46 + Math.cos(a) * r;
    const y = 58 + Math.sin(a) * r * 0.92;
    const turn = k * 1.7;
    ctx.strokeStyle = sprinkles[k % sprinkles.length];
    ctx.beginPath();
    ctx.moveTo(x - Math.cos(turn) * 2.4, y - Math.sin(turn) * 2.4);
    ctx.lineTo(x + Math.cos(turn) * 2.4, y + Math.sin(turn) * 2.4);
    ctx.stroke();
  }
  glint(ctx, 33, 44, 6, 9.5, -0.65, 0.42);
  glint(ctx, 30, 60, 2.2, 2.2, 0, 0.35);
  ctx.fillStyle = B.spark;
  ctx.beginPath();
  ctx.arc(81.5, 8.5, 3, 0, TAU);
  ctx.fill();
}

/** Stripes along the line a striped food clears, laid over the food alone. */
function stripes(ctx: Ctx, special: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  for (let k = 0; k < 6; k += 1) {
    const at = 18 + k * 13;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    if (special === ROW) ctx.fillRect(0, at, 100, 5.5);
    else ctx.fillRect(at, 0, 5.5, 100);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    if (special === ROW) ctx.fillRect(0, at + 5.5, 100, 1.5);
    else ctx.fillRect(at + 5.5, 0, 1.5, 100);
  }
  ctx.restore();
}

/**
 * One food (or the bomb) centred on `(cx, cy)`, `size` across. `kind` is
 * `Piece.t` (-1 for the bomb) and `special` is `Piece.s`.
 *
 * Stripes composite `source-atop`, so on a canvas that already holds other
 * pixels under the food they would land on those too — draw a striped food
 * into its own (sprite) canvas, as the scene and the preview both do.
 */
export function paintFood(ctx: Ctx, kind: number, special: number, cx: number, cy: number, size: number): void {
  if (!paths) paths = build();
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / 100, size / 100);
  if (special === BOMB || kind < 0) {
    bomb(ctx);
  } else {
    const c = STALL.foods[kind] ?? STALL.foods[0];
    if (kind === 0) apple(ctx, c);
    else if (kind === 1) croissant(ctx, c);
    else if (kind === 2) cheese(ctx, c);
    else if (kind === 3) pizza(ctx, c);
    else if (kind === 4) doughnut(ctx, c);
    else carrot(ctx, c);
    if (special === ROW || special === COL) stripes(ctx, special);
  }
  ctx.restore();
}

/** What splashes when a food clears. */
export function juiceOf(kind: number): string {
  return kind >= 0 ? (STALL.foods[kind] ?? STALL.foods[0]).juice : STALL.bomb.spark;
}

/** A food's sprite: its own canvas, so stripes composite onto the food alone. */
export function foodSprite(kind: number, special: number, size: number, ratio: number): HTMLCanvasElement {
  const el = document.createElement('canvas');
  el.width = el.height = Math.max(1, Math.round(size * ratio));
  const ctx = el.getContext('2d')!;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  paintFood(ctx, kind, special, size / 2, size / 2, size);
  return el;
}
