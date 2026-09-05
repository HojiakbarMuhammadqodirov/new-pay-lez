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
  tone: 'glow' as 'glow' | 'ink',
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

/* --------------------------------------------------------------------- tone */

/**
 * How the accent meets the background.
 *
 * `glow` is the original: emissive neon on near-black, additive, carried by
 * bloom. `ink` is the same geometry drawn on a light page — alpha-blended, so
 * every layer *darkens* the ground instead of lighting it. Addition has no
 * headroom above white, which is why the light theme needs its own entry here
 * rather than just a different pair of colours.
 *
 * The differences are only ever a matter of degree: ink needs a little more
 * body tint to read as a sphere at all, and a little less border weight,
 * because a dark hairline on paper is already louder than a lit one on black.
 */
export const TONE = {
  glow: {
    ambientStrength: GLOBE.ambientStrength,
    rimStrength: GLOBE.rimStrength,
    borderOpacity: GLOBE.borderOpacity,
  },
  ink: {
    ambientStrength: 0.1,
    rimStrength: 0.5,
    borderOpacity: 0.42,
  },
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

    /*
     * The same cap once the page has stacked, and why it has to be smaller.
     *
     * The end pose is framed by viewport *height* alone — diameter is
     * `heightCoverage / visibleFraction` of it, or 133%. On a wide screen that
     * is a sphere a little narrower than the window and it reads as a horizon
     * the page sits above. On a narrow one the same rule gives:
     *
     *     1440 x 900   diameter 1200px on a 1440 screen   a horizon
     *      768 x 1024  diameter 1365px on a  768 screen   a wall
     *      360 x 780   diameter 1040px on a  360 screen   a wall
     *
     * — and a cap 40% of the viewport tall means the globe is behind the
     * bottom two fifths of every screenful for the whole scroll. The carousel
     * rides on it, and its unselected cards are drawn dimmed, so on a tablet
     * they end up dim text on a bright sphere.
     *
     * A shorter cap is the fix rather than a smaller globe: keep
     * `visibleFraction` — the sphere still shows the same slice of itself, so
     * the geometry and the rotation are untouched — and take the cap down to
     * 22% of the viewport, which is a band along the foot of the screen with
     * the content above it. That is the same judgement the market tape makes
     * one directory over: on a phone a backdrop stays out of the copy.
     */
    /**
     * How much of the globe shows, and how far it spills past the screen,
     * once a narrow page has stacked.
     *
     * Neither number is a taste. The diameter is capped near the viewport
     * *width* so the disc stops being a wall three screens across; 30% of
     * something that small is a 14%-tall smear, so more of it shows. 0.42
     * puts the cap back around a quarter of the height and stays under a
     * half — past a half the widest point of the disc is on screen and the
     * silhouette curls back in at the bottom, which reads as a ball resting
     * on the edge rather than as a horizon. The 1.3 does the same job from
     * the other side: an edge that runs off both sides of the screen is a
     * curve, an edge that stops short of them is an object.
     */
    visibleFractionNarrow: 0.42,
    widthOverhang: 1.3,

    /**
     * Widest viewport that gets the shorter cap, CSS px. 820 is the
     * stylesheet's own hero-stacking step and `RESPONSIVE.portraitStackWidth`,
     * for the same reason those two agree: the globe is being reframed because
     * the page went to one column, so both have to change on the same pixel.
     */
    narrowWidth: 820,
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

  /*
   * ---- the portrait sink -------------------------------------------------
   *
   * Portrait stacks the hero: the copy goes above and the page reserves a slot
   * under it for the globe (`.hero-visual { min-height: 46vh }` in the site's
   * stylesheet). The globe is mounted `position: fixed`, so it does not *fill*
   * that slot by being in the flow — it has to be aimed at it. Until it was,
   * it drew dead centre on a phone, straight through the h1, the lede and the
   * CTA, while 46vh of reserved air sat empty underneath.
   *
   * `portraitCopyDepth` is where the copy's floor sits, as a fraction of the
   * viewport measured from the top. The stylesheet puts it at 100 − 46 = 54%;
   * this is that plus a viewport-percent of clearance, so the disc's top edge
   * still misses the last line of the CTA on a viewport where the copy runs a
   * little long — a translation with a third headline line, say.
   *
   * Two numbers fall out of it and neither is separately tunable:
   *
   *   • the offset, −copyDepth/2, which is the centre of the slot [depth, 1];
   *   • the vertical coverage cap, 2·(0.5 − |offset|) = 1 − copyDepth, which is
   *     the slot's own height.
   *
   * That identity is the reason for centring the disc in the slot rather than
   * resting it on the bottom edge: "clears the copy" and "stays on screen"
   * become the same constraint, so the vertical clamp in `resolveLayout` is
   * the horizontal one with the margin term dropped.
   */
  portraitCopyDepth: 0.55,
  /**
   * Aspect at which the sink reaches full strength, ramping from nothing at
   * `portraitAspect`. Switching hard at 1.0 would jerk the globe a third of a
   * viewport the instant a tablet crossed square; 0.8 is below every portrait
   * tablet in circulation, so the ramp is travel nobody sees rather than a
   * step everybody does.
   */
  portraitSinkAspect: 0.8,
  /**
   * Widest viewport whose hero actually stacks — this mirrors the
   * `max-width: 820px` query in the site's stylesheet that collapses the hero
   * grid to one column and reserves the slot.
   *
   * It is a step rather than a ramp *because the stylesheet is a step*. A
   * 1024×1366 tablet is portrait by aspect but still two columns, and a globe
   * sunk under a copy column that has not moved is worse than either end of a
   * ramp — the two have to jump on the same pixel or not at all.
   */
  portraitStackWidth: 820,

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
