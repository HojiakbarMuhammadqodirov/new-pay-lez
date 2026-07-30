/**
 * Single source of truth for every tunable constant in the globe hero.
 * Props on <GlobeHero /> override the `DEFAULTS` block; everything else here is
 * a design/perf constant you can safely edit in one place.
 */

/* ------------------------------------------------------------------ palette */

export const COLORS = {
  background: '#0d0d0e',
  primary: '#58e9d4',
} as const;

/* ----------------------------------------------------------------- defaults */

export const SECONDS_PER_REVOLUTION = 5;

export const DEFAULTS = {
  rotationSpeed: 1 / SECONDS_PER_REVOLUTION, // revolutions per second
  primaryColor: COLORS.primary,
  backgroundColor: COLORS.background,
  showRoutes: true,
  showLabels: true,
  routeCount: 16,
  glowStrength: 1,
  offsetX: 0.12, // +12% of viewport width
  heightCoverage: 0.8, // globe diameter = 80% of viewport height
  scrollTransition: true,
} as const;

/* -------------------------------------------------------------------- globe */

export const GLOBE = {
  /** World-space radius. Everything else is expressed relative to this. */
  radius: 1,
  /** Sphere tessellation — 64x48 is visually smooth at hero scale. */
  widthSegments: 64,
  heightSegments: 48,
  /** Borders float just above the surface to avoid z-fighting. */
  borderAltitude: 0.0025,
  /** Great-circle subdivision threshold, in degrees, for border edges. */
  maxEdgeDegrees: 1.5,
  /** Rim light. */
  rimPower: 3.2,
  rimStrength: 0.42,
  /** Soft ambient wash on the lit hemisphere. */
  ambientStrength: 0.06,
  /** Direction the soft key light comes from (view space, normalised in shader). */
  lightDirection: [-0.45, 0.35, 0.82] as [number, number, number],
  /** Border opacity — kept low so the wireframe reads as a hairline. */
  borderOpacity: 0.55,
} as const;

/* ------------------------------------------------------------------- routes */

export const ROUTES = {
  maxCount: 48,
  /** Points sampled per arc. Each becomes a pair of ribbon vertices. */
  segments: 96,
  /**
   * Ribbon half-width is applied in world units (globe radius = 1) and expanded
   * toward the camera in the vertex shader — WebGL ignores `linewidth`, so real
   * thickness has to be built into the geometry.
   *
   * At the default 80vh framing on a 1080p viewport, 0.0075 ≈ 3.2 device px.
   */
  width: 0.0075,
  /**
   * Fraction of the half-width spent feathering the ribbon's long edges.
   * Without it a thick line reads as a hard-edged rectangle rather than a
   * stroke; 0 gives crisp edges, 1 is pure falloff with no solid core.
   */
  edgeSoftness: 0.45,
  /**
   * Peak arc altitude, as a fraction of globe radius:
   *   altitude = minAltitude + (arc / 180°) · altitudeFactor,  capped at max.
   */
  altitudeFactor: 0.16,
  minAltitude: 0.035,
  maxAltitude: 0.1,
  /** Head travel speed, in route-lengths per second. */
  speed: 0.18,
  speedJitter: 0.55,
  /** Trail length as a fraction of the route (exponential falloff scale). */
  trailLength: 0.16,
  /** Hard cutoff so the trail never wraps around the whole arc. */
  trailCutoff: 0.55,
  /**
   * Angular size of the bright head, as a fraction of the route.
   * Intensities are tuned so `base + trail + head` peaks at ~1.0: the shader
   * clamps there, which keeps the accent hue exact (no clipping to white) and
   * lets bloom — not saturation — carry the perceived brightness.
   */
  headSize: 0.012,
  headIntensity: 0.28,
  trailIntensity: 0.85,
  /** Faint always-on line so the flight path stays legible. */
  baseOpacity: 0.07,
  /** Reject endpoint pairs that are too close/too antipodal to look good. */
  minArcDegrees: 22,
  maxArcDegrees: 150,
  /** Deterministic seed — keeps routes identical across re-mounts. */
  seed: 0x5eed_1234,
} as const;

/* --------------------------------------------------------------------- post */

export const POST = {
  bloomIntensity: 0.42,
  /**
   * Sits just above the border stroke's luminance so frontiers stay crisp and
   * only route heads flare. Scale this with the accent: #58e9d4 is ~1.5x
   * brighter than a mid blue, so its threshold is ~1.5x higher.
   */
  bloomThreshold: 0.35,
  bloomSmoothing: 0.25,
  bloomRadius: 0.72,
  /** MSAA samples inside the composer. 0 disables (falls back to SMAA-less). */
  multisampling: 4,
} as const;

/* ------------------------------------------------------------------- scroll */

/**
 * The globe has two layout states and scroll interpolates between them.
 *
 *   progress 0 — hero:   `DEFAULTS.heightCoverage` tall, offset right, 14° tilt
 *   progress 1 — footer: much larger, sunk below the fold, axis turned to face
 *                        the camera so the pole side is what you see
 *
 * `visibleFraction` and `heightCoverage` below are the two numbers that define
 * the end state; the globe's full diameter follows from them:
 *
 *   diameter = heightCoverage / visibleFraction  (= 1.33 viewport heights)
 *
 * so "30% of the globe visible" and "filling 40% of the screen" stay consistent
 * with each other no matter which one you edit.
 */
export const SCROLL = {
  /** Scroll distance that completes the transition, in viewport heights. */
  rangeVh: 1,
  /**
   * Exponential smoothing rate (per second). Scroll position is a target, not
   * a direct binding — the globe eases toward it so flicks and trackpad
   * momentum never make it snap.
   */
  damping: 5.5,
  end: {
    /** Fraction of the globe's *diameter* still above the bottom edge. */
    visibleFraction: 0.3,
    /** Height of that visible cap, as a fraction of the viewport. */
    heightCoverage: 0.4,
    /** Axial tilt at rest. 90° turns the spin axis to face the camera. */
    tiltDegrees: 90,
    /** Horizontal offset at rest; 0 centres the arc. */
    offsetX: 0,
  },
} as const;

/* ------------------------------------------------------------------- camera */

export const CAMERA = {
  fov: 30,
  near: 0.1,
  far: 100,
  /** Slight tilt so the poles are not perfectly edge-on. */
  tiltDegrees: 14,
} as const;

/* --------------------------------------------------------------- responsive */

export const RESPONSIVE = {
  /** Below this aspect ratio the layout switches to its portrait variant. */
  portraitAspect: 1,
  /** Portrait shrinks the horizontal offset so the globe stays on screen. */
  portraitOffsetScale: 0.35,
  /** Minimum empty margin on the globe's outer edge, in viewport widths. */
  horizontalMargin: 0.02,
  /** Device pixel ratio clamp. */
  dpr: [1, 1.75] as [number, number],
} as const;

/* ---------------------------------------------------------------- detection */

export const DETECTION = {
  /**
   * Only these countries get a label. Empty means every country.
   *
   * They sit in a 76° band of longitude, so at one revolution per 5 s the whole
   * set sweeps the centre in about 1.6 s and then the label rests until the
   * band comes round again. The cadence below is tuned for that burst — a
   * quarter-second reveal cannot survive a quarter-second debounce.
   */
  spotlight: ['PL', 'UA', 'AZ', 'UZ', 'RU'] as string[],
  /** How often the centred-country test runs, in milliseconds. */
  intervalMs: 50,
  /** A new country must win for this long before the label switches. */
  debounceMs: 80,
  /** Over open water, show the nearest country only within this arc distance. */
  maxOceanDegrees: 11,
  /**
   * Wider fallback when a spotlight is set: with only a handful of countries in
   * play, neighbours are far apart, so each needs a broader catchment or the
   * label flickers off between them.
   */
  spotlightFallbackDegrees: 22,
  /** Coarse pre-filter before the per-vertex distance scan. */
  centroidSearchDegrees: 45,
} as const;

/* ----------------------------------------------------------------------- ui */

export const UI = {
  /** `'color'` = native flag emoji. `'mono'` tints flags to the primary colour. */
  flagRendering: 'color' as 'color' | 'mono',
  /** Enter/exit duration in ms — must match `CountryCard.css`. */
  transitionMs: 150,
  /** Self-hosted Twemoji flag font (Windows has no native flag glyphs). */
  loadFlagFont: true,
} as const;

/* -------------------------------------------------------------------- misc */

export const MOTION = {
  /** Frame delta clamp — stops a rotation jump after the tab is backgrounded. */
  maxDelta: 1 / 20,
} as const;
