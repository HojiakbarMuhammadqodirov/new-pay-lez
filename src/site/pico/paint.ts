/**
 * Paints Pico into a 100×100 design box, facing right.  ── ART ──
 *
 * The app's `PicoPainter._side`, `_sideEye`, `_pupil` and `_badge`, in the same
 * order and with the same colours on the same paths. Placement — where on the
 * caller's canvas, how big, which way, how tilted — is not this file's business:
 * `draw.ts` sets the transform and calls `paintPico` with the context already in
 * design units, inside a `save()`. That split is what lets this file, with
 * `geometry.ts` and `palette.ts`, be replaced by the Claude Design drawing
 * without a caller noticing.
 *
 * **Per frame this allocates nothing.** Every path is cached (`picoPaths()`),
 * the colours derived from a palette are cached per palette object, and the
 * one shape that changes continuously — a half-closed lid — is traced on the
 * context's own path instead of a new `Path2D`. A game calls this sixty times a
 * second; garbage here is a hitch every few seconds.
 */
import {
  BADGE_EYE,
  BEAK_GAPE,
  BEAK_HINGE,
  BODY_SHADE_SHIFT,
  CROWN,
  HEAD_SHADE_SHIFT,
  PICO_BOX,
  SHOULDER,
  SAD_LID_TRAVEL,
  SIDE_EYE,
  STANCE,
  flapAngle,
  flapSquash,
  picoPaths,
  type PupilPaths,
} from './geometry';
import {
  PICO_BLUSH_ALPHA,
  PICO_GLINT,
  PICO_GLINT_SOFT,
  mixColour,
  type PicoPalette,
} from './palette';
import type { PicoContext, PicoPose } from './types';

/** One frame of the bird, already resolved by `draw.ts`. */
export interface PicoFrame {
  pose: PicoPose;
  /** Raw beat count; only the fractional part is read, by `flap` only. */
  flap: number;
  /** 0 open … 1 shut. */
  blink: number;
  palette: PicoPalette;
}

const TAU = Math.PI * 2;

/* ── colours the app derives with Color.lerp at paint time ──────────────── */

interface Derived {
  /** Tail feathers, far to near. */
  tail: readonly [string, string, string];
  /** Each feather's darkened tip. */
  tailTips: readonly [string, string, string];
  beakSheen: string;
  wingCovert: string;
}

/*
 * Keyed by the palette object. `PICO_BRAND` is one object and `picoMono`
 * memoises its results, so in practice this is a handful of entries computed
 * once each; a WeakMap means a caller's one-off palette is not kept alive by it.
 */
const DERIVED = new WeakMap<PicoPalette, Derived>();

function derive(p: PicoPalette): Derived {
  let d = DERIVED.get(p);
  if (!d) {
    // Far feather darkest.
    const tail = [p.wingTip, p.wing, p.shade] as const;
    d = {
      tail,
      tailTips: [
        mixColour(tail[0], p.wingTip, 0.7),
        mixColour(tail[1], p.wingTip, 0.7),
        mixColour(tail[2], p.wingTip, 0.7),
      ],
      beakSheen: mixColour(p.beak, p.mask, 0.45),
      wingCovert: mixColour(p.wing, p.body, 0.55),
    };
    DERIVED.set(p, d);
  }
  return d;
}

/* ── shared pieces ──────────────────────────────────────────────────────── */

function pupil(ctx: PicoContext, paths: PupilPaths, ink: string): void {
  ctx.fillStyle = ink;
  ctx.fill(paths.ink);
  ctx.fillStyle = PICO_GLINT;
  ctx.fill(paths.glint);
  ctx.fillStyle = PICO_GLINT_SOFT;
  ctx.fill(paths.soft);
}

/**
 * A lid partway down, for a blink between open (0) and shut (1).
 *
 * The app's blink is a switch; this is the one place the port goes past it,
 * because `AnimatedPico` and the games ease a blink over a few frames, and a
 * pupil that vanishes in one frame reads as a flicker at 120 Hz. The lid is the
 * same device the app's sad pose already uses — a mask-coloured disc a unit
 * wider than the pupil, clipped above an edge, with an ink line along that
 * edge — so a partly shut eye is drawn in the bird's own vocabulary. (Sad
 * already has a lid, and lowers that one instead; see `sideEye`.)
 */
function lid(
  ctx: PicoContext,
  x: number, y: number, r: number,
  blink: number,
  mask: string, ink: string, width: number,
): void {
  const R = r + 1;
  const edge = y - R + 2 * R * blink;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - R - 1, y - R - 1, 2 * R + 2, edge - (y - R - 1));
  ctx.clip();
  ctx.beginPath();
  ctx.arc(x, y, R, 0, TAU);
  ctx.fillStyle = mask;
  ctx.fill();
  ctx.restore();
  // The edge follows the lid's chord, so it grows from a point as the lid
  // starts down instead of appearing full width above an open eye.
  const half = Math.sqrt(Math.max(0, R * R - (edge - y) * (edge - y))) * 0.9;
  if (half < 0.5) return;
  ctx.beginPath();
  ctx.moveTo(x - half, edge);
  ctx.lineTo(x + half, edge);
  ctx.strokeStyle = ink;
  ctx.lineWidth = width;
  ctx.stroke();
}

/* ── the side view ──────────────────────────────────────────────────────── */

function side(ctx: PicoContext, f: PicoFrame): void {
  const P = picoPaths().side;
  const p = f.palette;
  const d = derive(p);
  const stance = STANCE[f.pose];

  // Tail, behind everything.
  for (let i = 0; i < 3; i++) {
    const feather = P.tail[i];
    ctx.fillStyle = d.tail[i];
    ctx.fill(feather);
    ctx.save();
    ctx.clip(feather);
    ctx.fillStyle = d.tailTips[i];
    ctx.fill(P.tailTips);
    ctx.restore();
  }

  // Feet, under the body, when standing.
  if (stance.feet) {
    ctx.strokeStyle = p.beakLow;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.stroke(P.feet);
  }

  // Crest, behind the head: three feathers swept back.
  ctx.save();
  if (stance.crest !== 0) {
    ctx.translate(CROWN.x, CROWN.y);
    ctx.rotate(stance.crest);
    ctx.translate(-CROWN.x, -CROWN.y);
  }
  for (let i = 0; i < 3; i++) {
    const feather = P.crest[i];
    ctx.fillStyle = p.body;
    ctx.fill(feather);
    ctx.save();
    ctx.clip(feather);
    ctx.fillStyle = p.accent;
    ctx.fill(P.crestTips);
    ctx.restore();
  }
  ctx.restore();

  // Head and body as one silhouette, shaded underneath: shade everywhere
  // inside it, then the body again shifted up, which leaves the crescent.
  ctx.fillStyle = p.body;
  ctx.fill(P.body);
  ctx.save();
  ctx.clip(P.body);
  ctx.fillStyle = p.shade;
  ctx.fillRect(0, 0, PICO_BOX, PICO_BOX);
  ctx.translate(BODY_SHADE_SHIFT.x, BODY_SHADE_SHIFT.y);
  ctx.fillStyle = p.body;
  ctx.fill(P.body);
  ctx.translate(-BODY_SHADE_SHIFT.x, -BODY_SHADE_SHIFT.y);
  ctx.fillStyle = p.light;
  ctx.fill(P.belly);
  ctx.restore();

  // The face: a pale mask around the eye, then the cheek.
  ctx.fillStyle = p.mask;
  ctx.fill(P.mask);
  if (p.blush) {
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * (f.pose === 'happy' ? PICO_BLUSH_ALPHA.happy : PICO_BLUSH_ALPHA.rest);
    ctx.fillStyle = p.blush;
    ctx.fill(P.blush);
    ctx.globalAlpha = alpha;
  }

  // The bill. Open for joy and for the knock.
  ctx.fillStyle = p.beakLow;
  if (stance.gape) {
    ctx.save();
    ctx.translate(BEAK_HINGE.x, BEAK_HINGE.y);
    ctx.rotate(BEAK_GAPE);
    ctx.translate(-BEAK_HINGE.x, -BEAK_HINGE.y);
    ctx.fill(P.beakLower);
    ctx.restore();
  } else {
    ctx.fill(P.beakLower);
  }
  ctx.fillStyle = p.beak;
  ctx.fill(P.beakUpper);
  ctx.fillStyle = d.beakSheen;
  ctx.fill(P.beakSheen);

  sideEye(ctx, f);

  // The wing, last, over the body.
  let angle = stance.wing;
  let squash = stance.squash;
  if (f.pose === 'flap') {
    const phase = f.flap - Math.floor(f.flap);
    angle = flapAngle(phase);
    squash = flapSquash(phase);
  }
  ctx.save();
  ctx.translate(SHOULDER.x, SHOULDER.y);
  ctx.rotate(angle);
  ctx.scale(1, squash);
  ctx.fillStyle = p.wing;
  ctx.fill(P.wing);
  ctx.clip(P.wing);
  ctx.fillStyle = p.wingTip;
  ctx.fill(P.wingTips);
  ctx.fillStyle = d.wingCovert;
  ctx.fill(P.wingCovert);
  ctx.restore();
}

function sideEye(ctx: PicoContext, f: PicoFrame): void {
  const P = picoPaths().side;
  const p = f.palette;
  ctx.strokeStyle = p.ink;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';

  if (f.pose === 'hit') {
    ctx.stroke(P.eyeCross);
    return;
  }
  if (f.pose === 'happy') {
    ctx.stroke(P.eyeSmile);
    return;
  }
  if (f.blink >= 1) {
    ctx.stroke(P.eyeShut);
    return;
  }
  pupil(ctx, P.pupil, p.ink);

  if (f.pose === 'sad') {
    // A heavy lid: the mask colour over the top of the eye, and its edge.
    // A blink brings this same lid down, slant and all, rather than drawing a
    // second, level lid across it — two edges on one eye read as a wince, and
    // the level one would paint out half of the slanted one on the way past.
    const drop = f.blink > 0 ? f.blink * SAD_LID_TRAVEL : 0;
    ctx.save();
    if (drop > 0) {
      ctx.beginPath();
      ctx.rect(SIDE_EYE.x - 8, SIDE_EYE.y - 9, 16, 8.5 + drop);
      ctx.clip();
    } else {
      ctx.clip(P.sadLidClip);
    }
    ctx.fillStyle = p.mask;
    ctx.fill(P.sadLid);
    ctx.restore();
    ctx.lineWidth = 2.2;
    if (drop > 0) {
      ctx.save();
      ctx.translate(0, drop);
      ctx.stroke(P.sadLidEdge);
      ctx.restore();
    } else {
      ctx.stroke(P.sadLidEdge);
    }
    return;
  }
  if (f.blink > 0) {
    lid(ctx, SIDE_EYE.x, SIDE_EYE.y, SIDE_EYE.r, f.blink, p.mask, p.ink, 2.2);
  }
}

/* ── the badge ──────────────────────────────────────────────────────────── */

function badge(ctx: PicoContext, f: PicoFrame): void {
  const B = picoPaths().badge;
  const p = f.palette;
  const d = derive(p);

  for (let i = 0; i < 3; i++) {
    const feather = B.crest[i];
    ctx.fillStyle = p.body;
    ctx.fill(feather);
    ctx.save();
    ctx.clip(feather);
    ctx.fillStyle = p.accent;
    ctx.fill(B.crestTips);
    ctx.restore();
  }

  ctx.fillStyle = p.body;
  ctx.fill(B.head);
  ctx.save();
  ctx.clip(B.head);
  ctx.fillStyle = p.shade;
  ctx.fillRect(0, 0, PICO_BOX, PICO_BOX);
  ctx.translate(HEAD_SHADE_SHIFT.x, HEAD_SHADE_SHIFT.y);
  ctx.fillStyle = p.body;
  ctx.fill(B.head);
  ctx.restore();

  ctx.fillStyle = p.mask;
  ctx.fill(B.mask);
  if (p.blush) {
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * PICO_BLUSH_ALPHA.rest;
    ctx.fillStyle = p.blush;
    ctx.fill(B.blush);
    ctx.globalAlpha = alpha;
  }

  if (f.blink >= 1) {
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.stroke(B.eyesShut);
  } else {
    pupil(ctx, B.pupils, p.ink);
    if (f.blink > 0) {
      ctx.lineCap = 'round';
      lid(ctx, BADGE_EYE.left, BADGE_EYE.y, BADGE_EYE.r, f.blink, p.mask, p.ink, 2.8);
      lid(ctx, BADGE_EYE.right, BADGE_EYE.y, BADGE_EYE.r, f.blink, p.mask, p.ink, 2.8);
    }
  }

  ctx.fillStyle = p.beakLow;
  ctx.fill(B.beakLower);
  ctx.fillStyle = p.beak;
  ctx.fill(B.beakUpper);
  ctx.fillStyle = d.beakSheen;
  ctx.fill(B.beakSheen);
}

/**
 * One frame of Pico in design units. The context must already be transformed
 * so that (0, 0)–(100, 100) is the box, and wrapped in `save()`/`restore()` by
 * the caller (`drawPico` does both) — this sets fill, stroke, line width and cap
 * freely and does not put them back.
 */
export function paintPico(ctx: PicoContext, frame: PicoFrame): void {
  if (frame.pose === 'badge') badge(ctx, frame);
  else side(ctx, frame);
}
