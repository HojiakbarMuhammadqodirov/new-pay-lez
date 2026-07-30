import { CAMERA, GLOBE, RESPONSIVE, SCROLL } from '../config';
import { DEG2RAD } from './math';

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
  const heroCoverage = Math.max(0.2, Math.min(heightCoverage, maxCoverage));
  const heroVisibleHeight = (2 * R) / heroCoverage;

  const hero: GlobeState = {
    distance: R / (heroCoverage * tanHalfFov),
    x: heroOffset * heroVisibleHeight * aspect,
    y: 0,
    tilt: CAMERA.tiltDegrees * DEG2RAD,
    coverage: heroCoverage,
    visibleHeight: heroVisibleHeight,
  };

  /* ---- end: sunk below the fold, only a cap showing ---------------------- */

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
