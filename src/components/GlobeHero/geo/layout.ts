import { CAMERA, GLOBE, RESPONSIVE, SCROLL } from '../config';
import { DEG2RAD, smoothstep } from './math';

/** One resolved layout state: where the globe sits and how far the camera is. */
export interface GlobeState {
  /** Camera distance that gives this state its on-screen size. */
  distance: number;
  /** World-space centre of the globe. */
  x: number;
  y: number;
  /** Axial tilt, in radians. */
  tilt: number;
  /** Globe diameter as a fraction of viewport height. */
  coverage: number;
  /** Viewport height in world units at the globe's depth. */
  visibleHeight: number;
}

export interface GlobeLayout {
  hero: GlobeState;
  end: GlobeState;
  portrait: boolean;
}

/**
 * Resolves both layout endpoints for a viewport.
 *
 * Pure and framework-free so the framing maths can be checked headlessly —
 * see `npm run verify`. `useGlobeLayout` is just the React wrapper.
 *
 * On-screen size is driven by camera distance rather than by scaling the mesh,
 * so world-space units (arc altitude, ribbon width, border offset) stay
 * constant across both states and never need retuning:
 *
 *   visibleHeight(d) = 2·d·tan(fov/2)
 *   2R = coverage · visibleHeight   ⇒   d = R / (coverage · tan(fov/2))
 */
export function resolveLayout(
  width: number,
  height: number,
  offsetX: number,
  heightCoverage: number,
): GlobeLayout {
  const aspect = width / Math.max(height, 1);
  const portrait = aspect < RESPONSIVE.portraitAspect;
  const tanHalfFov = Math.tan((CAMERA.fov / 2) * DEG2RAD);
  const R = GLOBE.radius;

  /* ---- hero: framed by height, pushed off-centre horizontally ------------ */

  const heroOffset = offsetX * (portrait ? RESPONSIVE.portraitOffsetScale : 1);

  // Keep the whole disc on screen once the offset is applied:
  //   |offset|·W + R + margin·W <= W/2
  //   ⇒ coverage <= 2·aspect·(0.5 - |offset| - margin)
  const maxCoverage =
    2 * aspect * (0.5 - Math.abs(heroOffset) - RESPONSIVE.horizontalMargin);

  /*
   * Portrait stacks the copy above the globe and reserves a slot underneath
   * it, so the globe sinks out of the text and into that slot instead of
   * sitting on top of it. See the portrait block in `config.ts` for where the
   * two constants come from; the two gates here are:
   *
   *   • aspect, ramped — 0 at `portraitAspect` and full at `portraitSinkAspect`
   *     so a tablet rotating glides rather than jumping. `smoothstep` clamps,
   *     which is what makes every landscape and desktop aspect exactly 0 and
   *     leaves everything above phone width byte-for-byte unchanged;
   *   • width, stepped — the slot only exists below the width the stylesheet
   *     stacks at, and a half-sunk globe under an unmoved copy column is worse
   *     than either end of a ramp.
   */
  const sink =
    width <= RESPONSIVE.portraitStackWidth
      ? smoothstep(
          (RESPONSIVE.portraitAspect - aspect) /
            (RESPONSIVE.portraitAspect - RESPONSIVE.portraitSinkAspect),
        )
      : 0;

  // Negative is down. Half the copy's depth puts the centre in the middle of
  // what the copy left over, in viewport heights.
  const heroOffsetY = -(RESPONSIVE.portraitCopyDepth / 2) * sink;

  /*
   * The vertical twin of the clamp above, with no margin term and no aspect
   * factor — the offset is already in viewport heights, which is the unit
   * `coverage` is in.
   *
   *   |offsetY| + coverage/2 <= 0.5   ⇒   coverage <= 2·(0.5 - |offsetY|)
   *
   * Because the disc is centred in the slot, that one inequality is both
   * "the top edge clears the copy" and "the bottom edge stays on screen", and
   * at full sink it resolves to the slot's own height (1 − copyDepth). It is
   * not redundant with the horizontal clamp: on a phone the horizontal one
   * binds first, but on a portrait tablet (~0.7 aspect) this is the only thing
   * stopping the globe from growing back out of the slot.
   */
  const maxCoverageY = 2 * (0.5 - Math.abs(heroOffsetY));

  const heroCoverage = Math.max(
    0.2,
    Math.min(heightCoverage, maxCoverage, maxCoverageY),
  );
  const heroVisibleHeight = (2 * R) / heroCoverage;

  const hero: GlobeState = {
    distance: R / (heroCoverage * tanHalfFov),
    // `x` picks up an `aspect` factor because its offset is in viewport
    // *widths*; `y`'s is in heights, which is what `visibleHeight` already is.
    x: heroOffset * heroVisibleHeight * aspect,
    y: heroOffsetY * heroVisibleHeight,
    tilt: CAMERA.tiltDegrees * DEG2RAD,
    coverage: heroCoverage,
    visibleHeight: heroVisibleHeight,
  };

  /* ---- end: sunk below the fold, only a cap showing ---------------------- */

  /*
   * Deliberately *not* clamped against aspect the way the hero is — the 30%/40%
   * framing is honoured exactly at every viewport, which README.md argues for
   * at length. The portrait sink above changes nothing here: `y` was already
   * the one axis this pose moved on, so a hero pose that now starts partway
   * down simply shortens the journey. `useGlobeTransition` lerps the two, and
   * a lerp between two finite numbers stays continuous however they are set.
   */
  const { visibleFraction, heightCoverage: capHeight } = SCROLL.end;

  // Diameter follows from the two numbers that define the end state, so
  // "30% of the globe" and "40% of the screen" can never drift apart.
  const endCoverage = capHeight / visibleFraction;
  const endVisibleHeight = (2 * R) / endCoverage;

  // Sink the centre until exactly `visibleFraction` of the diameter clears the
  // bottom edge:
  //   (y + R) - (-visibleHeight/2) = visibleFraction · 2R
  const endY = 2 * visibleFraction * R - R - endVisibleHeight / 2;

  const end: GlobeState = {
    distance: R / (endCoverage * tanHalfFov),
    x: SCROLL.end.offsetX * endVisibleHeight * aspect,
    y: endY,
    tilt: SCROLL.end.tiltDegrees * DEG2RAD,
    coverage: endCoverage,
    visibleHeight: endVisibleHeight,
  };

  return { hero, end, portrait };
}
