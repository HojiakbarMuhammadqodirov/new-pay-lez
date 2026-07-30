/**
 * Public type surface for <GlobeHero />.
 */

/**
 * How the accent is composited over the background.
 *
 * `glow` — additive neon, for a dark page. `ink` — alpha-blended, for a light
 * one, where addition has no headroom left above white. See the `TONE` block in
 * `config.ts`.
 */
export type GlobeTone = 'glow' | 'ink';

export interface GlobeHeroProps {
  /**
   * Rotation rate in **revolutions per second**.
   * Default `1 / 5` — exactly one revolution every 5 seconds.
   */
  rotationSpeed?: number;

  /** Single accent colour used by borders, routes, atmosphere, glow and lighting. */
  primaryColor?: string;

  /** Scene / page background colour. */
  backgroundColor?: string;

  /**
   * Compositing mode for the accent. Default `'glow'`.
   *
   * Set `'ink'` whenever `backgroundColor` is light: `'glow'` would render an
   * almost invisible globe, since additive blending cannot darken. `'ink'` also
   * forces bloom off — see `glowStrength`.
   */
  tone?: GlobeTone;

  /** Render the animated great-circle routes. */
  showRoutes?: boolean;

  /** Render the Apple-Maps-style country label overlay. */
  showLabels?: boolean;

  /** Number of great-circle routes to generate. Clamped to `ROUTES.maxCount`. */
  routeCount?: number;

  /**
   * Master multiplier for atmosphere + bloom intensity.
   * `0` disables post-processing entirely (cheapest path).
   */
  glowStrength?: number;

  /**
   * Horizontal offset of the globe as a fraction of viewport width.
   * `0.12` puts the globe centre 12% right of screen centre.
   */
  offsetX?: number;

  /** Fraction of viewport height the globe diameter should occupy. */
  heightCoverage?: number;

  /**
   * Scroll the globe from its hero pose into the large, tilted, mostly
   * off-screen footer pose. See the `SCROLL` block in `config.ts` for the end
   * state. No effect on a page that does not scroll.
   */
  scrollTransition?: boolean;

  /**
   * `id` of the element the transition is timed to. The globe reaches its end
   * pose as this section arrives and retires as it leaves. Preferred over the
   * fixed `SCROLL.rangeVh` distance, which drifts whenever copy above it
   * changes length.
   */
  scrollAnchorId?: string;

  /** Extra class name on the root element. */
  className?: string;

  /** Inline style overrides on the root element. */
  style?: React.CSSProperties;
}

/** A country ready for rendering + hit-testing. */
export interface CountryFeature {
  /** ISO 3166-1 numeric code (as found in the atlas). */
  id: string;
  /** ISO 3166-1 alpha-2 code, or `null` when unmapped. */
  iso2: string | null;
  name: string;
  /** Area-weighted centroid in degrees, `[lon, lat]`. */
  centroid: [number, number];
  /** `[minLon, minLat, maxLon, maxLat]` in degrees. */
  bbox: [number, number, number, number];
  /** Outer + inner rings, each a flat `[lon, lat, lon, lat, …]` array. */
  rings: Float64Array[];
}

/** Parsed atlas: features plus a pre-merged border line buffer. */
export interface Atlas {
  features: CountryFeature[];
  /** Flat XYZ pairs for `THREE.LineSegments` on the unit sphere. */
  borderPositions: Float32Array;
}

/** What the overlay renders. `null` means "nothing is centred" (open ocean). */
export interface FocusedCountry {
  id: string;
  iso2: string | null;
  name: string;
}
