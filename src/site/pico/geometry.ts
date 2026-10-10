/**
 * Pico's shapes: every path in the drawing, in a 100×100 design box, facing
 * right, y down.  ── ART ──
 *
 * A transcription of `_P` (side view) and `_B` (badge) in the app's
 * `lib/widgets/pico.dart`, coordinate for coordinate. The app's file was drawn
 * from a written brief rather than exported from the Claude Design original,
 * so this whole file — with `palette.ts` and `paint.ts` — is a stand-in that is
 * expected to be swapped. What a replacement must keep is the export surface
 * `draw.ts` reads: the design-box constants below, `picoPaths()` and the stance
 * table. Callers never import this file; they get the constants through
 * `pico/index.ts`.
 *
 * Literal shapes are SVG path strings because `Path2D` takes them directly and
 * because that is the form a design tool exports, so the swap is a paste rather
 * than a port. The parametric ones — the tail feathers, the rotated bands — are
 * built from the app's own formulas instead of frozen as numbers, so a tweak to
 * a root or a width still means what it meant there.
 *
 * Flutter combines paths with `Path.combine(union | difference)`. Canvas has no
 * boolean path operations, and does not need them here: a union of shapes
 * wound the same way fills and clips as their union under the default nonzero
 * rule, and both differences in the app ("everything but the body moved up a
 * little", the shading) are painted instead as *shade first, then the moved
 * body over it*, inside a clip — see `paint.ts`.
 */
import type { PicoPose } from './types';

/** The design box every coordinate is in. */
export const PICO_BOX = 100;

/**
 * Centre of the body in the side poses, in design units — where a game's hit
 * circle belongs. The body's x is the box's own centre, which is why mirroring
 * the bird does not move its body.
 */
export const PICO_BODY_CENTRE: Readonly<{ x: number; y: number }> = Object.freeze({ x: 50, y: 56 });

/**
 * Roughly the body's radius in design units; the beak, crest and tail stick out
 * past it, and should — a hit circle that covered the beak would kill the bird
 * for a feather.
 */
export const PICO_BODY_RADIUS = 23;

const TAU = Math.PI * 2;

/* ── fixed points the painter pivots on ─────────────────────────────────── */

/** The wing's pivot on the body. */
export const SHOULDER = { x: 52, y: 52 } as const;
/** The crest rotates about the crown, so a droop folds it back onto the head. */
export const CROWN = { x: 55, y: 22 } as const;
/** The lower bill hinges here when the beak opens. */
export const BEAK_HINGE = { x: 77, y: 44 } as const;
/** How far the lower bill drops, in radians, for joy and for the knock. */
export const BEAK_GAPE = 0.42;
/** The side view's eye. */
export const SIDE_EYE = { x: 67, y: 34, r: 6 } as const;
/**
 * How far sad's heavy lid travels when it blinks: from its resting edge
 * (`SIDE_EYE.y - 0.5`) to the bottom of the lid disc (`SIDE_EYE.y + 7`).
 */
export const SAD_LID_TRAVEL = 7.5;
/** The badge's two eyes. */
export const BADGE_EYE = { left: 35, right: 65, y: 52, r: 7.5 } as const;
/**
 * The shading offset: the body is drawn again this far up and right over its
 * shade colour, so a crescent shows along the back and belly.
 */
export const BODY_SHADE_SHIFT = { x: 1.5, y: -5 } as const;
/** The badge head's shading offset — straight up, so the crescent is the chin. */
export const HEAD_SHADE_SHIFT = { x: 0, y: -6 } as const;

/* ── how each pose holds itself ─────────────────────────────────────────── */

export interface Stance {
  /** Wing angle about the shoulder, radians; positive raises it. */
  wing: number;
  /** The wing's height scale — a beating wing foreshortens. */
  squash: number;
  /** Crest rotation about the crown, radians; negative droops it back. */
  crest: number;
  /** Lower bill dropped. */
  gape: boolean;
  /** Feet down. */
  feet: boolean;
}

/**
 * The app's switch on `pose`, as data. `flap` holds its wing in `flapWing`
 * below instead, because the angle there is a function of the beat; the badge
 * has no body to hold and is listed only so the table is total.
 */
export const STANCE: Readonly<Record<PicoPose, Stance>> = {
  idle: { wing: -0.22, squash: 1, crest: 0, gape: false, feet: true },
  flap: { wing: 0, squash: 1, crest: 0, gape: false, feet: false },
  happy: { wing: 1.05, squash: 1, crest: 0, gape: true, feet: true },
  sad: { wing: -0.45, squash: 1, crest: -0.55, gape: false, feet: true },
  hit: { wing: 1.4, squash: 0.9, crest: 0.35, gape: true, feet: false },
  badge: { wing: -0.22, squash: 1, crest: 0, gape: false, feet: false },
};

/**
 * The wing on one beat. `phase` is 0..1; `sin` makes 0.25 the bottom of the
 * stroke and 0.75 the top, as the app documents, and the wing foreshortens most
 * at the two ends where it is edge-on to the viewer.
 */
export function flapAngle(phase: number): number {
  const k = (Math.sin(phase * TAU) + 1) / 2;
  return 1.15 + (-0.55 - 1.15) * k;
}
export function flapSquash(phase: number): number {
  return 0.72 + 0.28 * (1 - Math.abs(Math.sin(phase * TAU)) * 0.4);
}

/* ── builders ───────────────────────────────────────────────────────────── */

/** `(x, y)` rotated `radians` about `(ax, ay)` — the app's `_rotated`, for a point. */
function rotated(x: number, y: number, ax: number, ay: number, radians: number): [number, number] {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return [ax + c * (x - ax) - s * (y - ay), ay + s * (x - ax) + c * (y - ay)];
}

/**
 * An ellipse as its own clockwise subpath. The explicit `moveTo` matters: an
 * `ellipse()` on a path with a current point joins it with a line, which would
 * draw a sliver from the previous shape to this one.
 */
function oval(path: Path2D, cx: number, cy: number, rx: number, ry: number, rotation = 0): Path2D {
  path.moveTo(cx + rx * Math.cos(rotation), cy + rx * Math.sin(rotation));
  path.ellipse(cx, cy, rx, ry, rotation, 0, TAU);
  return path;
}

/**
 * A feather from `root` to `tip`, `width` across at its widest, with a rounded
 * end — the app's `_feather`, line for line.
 */
function feather(rx: number, ry: number, tx: number, ty: number, width: number): Path2D {
  const dx = tx - rx;
  const dy = ty - ry;
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * (width / 2);
  const ny = (dx / len) * (width / 2);
  const ax = rx + dx * 0.55;
  const ay = ry + dy * 0.55;
  const p = new Path2D();
  p.moveTo(rx + nx * 0.6, ry + ny * 0.6);
  p.quadraticCurveTo(ax + nx, ay + ny, tx + nx * 0.5, ty + ny * 0.5);
  p.quadraticCurveTo(
    tx + (dx / len) * width * 0.6,
    ty + (dy / len) * width * 0.6,
    tx - nx * 0.5,
    ty - ny * 0.5,
  );
  p.quadraticCurveTo(ax - nx, ay - ny, rx - nx * 0.6, ry - ny * 0.6);
  p.closePath();
  return p;
}

/** A rectangle rotated about a point, as a closed polygon. */
function rotatedRect(
  x: number, y: number, w: number, h: number,
  ax: number, ay: number, radians: number,
): Path2D {
  const p = new Path2D();
  const corners: [number, number][] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  corners.forEach(([cx, cy], i) => {
    const [px, py] = rotated(cx, cy, ax, ay, radians);
    if (i === 0) p.moveTo(px, py);
    else p.lineTo(px, py);
  });
  p.closePath();
  return p;
}

/** A pupil and its two glints, as three paths so each takes one fill. */
export interface PupilPaths {
  ink: Path2D;
  glint: Path2D;
  soft: Path2D;
}

/** Pupils at `centres`, radius `r`; the glints sit where the app puts them. */
function pupils(centres: readonly (readonly [number, number])[], r: number): PupilPaths {
  const ink = new Path2D();
  const glint = new Path2D();
  const soft = new Path2D();
  for (const [x, y] of centres) {
    oval(ink, x, y, r, r);
    oval(glint, x + r * 0.32, y - r * 0.36, r * 0.36, r * 0.36);
    oval(soft, x - r * 0.38, y + r * 0.4, r * 0.15, r * 0.15);
  }
  return { ink, glint, soft };
}

/* ── the paths ──────────────────────────────────────────────────────────── */

export interface PicoPaths {
  side: {
    /** Head and body as one silhouette, so the neck has no seam. */
    body: Path2D;
    belly: Path2D;
    /** Three tail feathers fanning down and back, far one first. */
    tail: readonly [Path2D, Path2D, Path2D];
    /** The disc around the far end of the fan each feather's tip is clipped to. */
    tailTips: Path2D;
    /** Feet and toes, for one stroke. */
    feet: Path2D;
    /** Back, middle, front. */
    crest: readonly [Path2D, Path2D, Path2D];
    /** The band each crest feather's tip is clipped to. */
    crestTips: Path2D;
    mask: Path2D;
    blush: Path2D;
    beakUpper: Path2D;
    beakSheen: Path2D;
    beakLower: Path2D;
    /** In shoulder coordinates, folded along the body pointing back. */
    wing: Path2D;
    wingTips: Path2D;
    wingCovert: Path2D;
    pupil: PupilPaths;
    /** ^ — a smiling, closed eye. */
    eyeSmile: Path2D;
    /** A shut eye, bowed down. */
    eyeShut: Path2D;
    /** Knocked out. */
    eyeCross: Path2D;
    /** Sad's heavy lid: the clip, the mask-coloured disc, and its edge. */
    sadLidClip: Path2D;
    sadLid: Path2D;
    sadLidEdge: Path2D;
  };
  badge: {
    head: Path2D;
    crest: readonly [Path2D, Path2D, Path2D];
    crestTips: Path2D;
    /** Two pale eye patches meeting over the bill. */
    mask: Path2D;
    blush: Path2D;
    pupils: PupilPaths;
    eyesShut: Path2D;
    beakUpper: Path2D;
    beakSheen: Path2D;
    beakLower: Path2D;
  };
}

function build(): PicoPaths {
  /* The body ellipse is rotated about (50, 58) while centred on (50, 59), so
     its centre moves as well as its axes — computed, not rounded, to keep the
     silhouette exactly the app's. */
  const [ecx, ecy] = rotated(50, 59, 50, 58, -0.5);
  const body = oval(new Path2D(), 61, 35, 22, 22);
  oval(body, ecx, ecy, 22, 20, -0.5);

  const feet = new Path2D();
  for (const x of [44, 54]) {
    feet.moveTo(x, 76);
    feet.lineTo(x - 1, 84);
    feet.moveTo(x - 1, 84);
    feet.lineTo(x - 6, 86);
    feet.moveTo(x - 1, 84);
    feet.lineTo(x + 4, 86);
  }

  const { x: ex, y: ey } = SIDE_EYE;
  const sadLidClip = new Path2D();
  sadLidClip.rect(ex - 8, ey - 9, 16, 8.5);

  const [bl, br, by] = [BADGE_EYE.left, BADGE_EYE.right, BADGE_EYE.y];
  const eyesShut = new Path2D(
    `M${bl - 6} ${by} Q${bl} ${by + 5} ${bl + 6} ${by} M${br - 6} ${by} Q${br} ${by + 5} ${br + 6} ${by}`,
  );

  const badgeMask = oval(new Path2D(), 35, 53, 14, 15);
  oval(badgeMask, 65, 53, 14, 15);
  const badgeBlush = oval(new Path2D(), 22, 68, 5.5, 3.25);
  oval(badgeBlush, 78, 68, 5.5, 3.25);

  return {
    side: {
      body,
      belly: oval(new Path2D(), 55, 68, 16, 13),
      tail: [
        feather(38, 70, 14, 95, 12),
        feather(36, 66, 6, 88, 13),
        feather(36, 61, 3, 77, 12),
      ],
      tailTips: oval(new Path2D(), 0, 96, 20, 20),
      feet,
      crest: [
        new Path2D('M48 26 C40 22 34 14 33 8 C42 10 50 16 55 22 Z'),
        new Path2D('M52 22 C48 15 46 8 48 2 C54 7 58 13 59 19 Z'),
        new Path2D('M57 19 C57 13 59 8 63 4 C65 10 65 15 63 19 Z'),
      ],
      crestTips: rotatedRect(20, -10, 60, 20.5, 50, 10, -0.28),
      mask: oval(new Path2D(), 68, 35, 10.5, 11),
      blush: oval(new Path2D(), 66.5, 47.5, 4.5, 2.5),
      beakUpper: new Path2D(
        'M75 27 C84 23 94 28 95 39 C95.6 45 93 50 89 52 C89.5 47 87 43.5 82 43 C79 42.8 77 43.5 75.5 44.5 Z',
      ),
      beakSheen: new Path2D('M78 28.5 C84 26.5 89 28.5 91 32 C86 30.5 82 30.5 78 31.5 Z'),
      beakLower: new Path2D('M75.5 44 C80 42.5 87 43.5 89.5 49.5 C86 52.5 80 53 76.5 50 Z'),
      wing: new Path2D(
        'M6 -6 C-6 -11 -24 -6 -36 10 Q-29 9 -27 13 Q-21 10 -18 15 Q-12 11 -8 15 C0 14 9 8 10 1 C10.5 -3 9 -5 6 -6 Z',
      ),
      wingTips: oval(new Path2D(), -38, 12, 19, 19),
      wingCovert: new Path2D('M7 -4.5 C0 -8 -10 -6 -16 -1 C-10 2 -2 3 9 1 Z'),
      pupil: pupils([[ex, ey]], SIDE_EYE.r),
      eyeSmile: new Path2D(`M${ex - 5} ${ey + 2} Q${ex} ${ey - 6} ${ex + 5} ${ey + 2}`),
      eyeShut: new Path2D(`M${ex - 5} ${ey} Q${ex} ${ey + 4} ${ex + 5} ${ey}`),
      eyeCross: new Path2D(
        `M${ex - 4} ${ey - 4} L${ex + 4} ${ey + 4} M${ex + 4} ${ey - 4} L${ex - 4} ${ey + 4}`,
      ),
      sadLidClip,
      sadLid: oval(new Path2D(), ex, ey, 7, 7),
      sadLidEdge: new Path2D(`M${ex - 6.5} ${ey - 2.2} L${ex + 6} ${ey + 0.4}`),
    },
    badge: {
      head: oval(new Path2D(), 50, 58, 40, 38),
      crest: [
        new Path2D('M40 24 C32 18 26 12 24 4 C34 6 42 12 47 22 Z'),
        new Path2D('M45 22 C44 14 46 6 51 0 C56 6 57 14 55 22 Z'),
        new Path2D('M53 22 C58 12 66 6 76 4 C74 12 68 18 60 24 Z'),
      ],
      crestTips: new Path2D('M0 0 H100 V9 H0 Z'),
      mask: badgeMask,
      blush: badgeBlush,
      pupils: pupils([[bl, by], [br, by]], BADGE_EYE.r),
      eyesShut,
      beakUpper: new Path2D('M41 60 C43 53 57 53 59 60 C60.5 67 56 76 50 81 C44 76 39.5 67 41 60 Z'),
      beakSheen: new Path2D('M44.5 58.5 C47 55.5 53 55.5 55.5 58.5 C52 57.8 48 57.8 44.5 58.5 Z'),
      beakLower: new Path2D('M43 70 C46 74 54 74 57 70 C56 77 53 81 50 82 C47 81 44 77 43 70 Z'),
    },
  };
}

let cache: PicoPaths | null = null;

/**
 * Every path, built on first use and shared by every Pico on the page — the
 * app's "built once per process". Lazy rather than at import because `Path2D`
 * is a browser global: a module that built paths on load would throw the
 * moment `vite-node` (the verify suite) or anything else without a DOM
 * imported a file that imports Pico.
 */
export function picoPaths(): PicoPaths {
  if (!cache) cache = build();
  return cache;
}
