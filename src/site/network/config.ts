/**
 * Tunables for the neon web behind the Analytics page.
 *
 * Everything here is in **CSS pixels and seconds**, never in device pixels or
 * frames: the canvas is drawn at whatever `devicePixelRatio` the display has,
 * and the loop is driven by elapsed time, so a retina laptop and a 60Hz monitor
 * have to agree on what "a slow drift" and "close enough to link" mean.
 */
export const WEB = {
  /**
   * One node per this many square CSS pixels of viewport.
   *
   * A density rather than a count: `linkDistance` below is an absolute pixel
   * radius, so the *look* of the web — how many neighbours a node has — is
   * `count x radius² / area`. Fix the count instead and a phone gets a solid
   * mat of lines while a widescreen gets unconnected dust.
   */
  areaPerNode: 17000,
  minNodes: 24,
  /** Ceiling for very large displays: past this the web reads as noise. */
  maxNodes: 150,

  /** Drift, CSS px/s. Slow enough that the web re-wires rather than swarms. */
  speed: { min: 5, max: 17 },

  /** Dot radius, CSS px, before the pointer's boost. */
  radius: { min: 1, max: 2.1 },

  /**
   * Two nodes link when they are closer than this, in CSS px. It is also the
   * spatial grid's cell size, which is what keeps the pass linear-ish: a node
   * only tests the four half-neighbour cells around its own, not all 150.
   */
  linkDistance: 152,

  pointer: {
    /** Nodes inside this radius brighten. The falloff is squared. */
    radius: 230,
    /**
     * Per-frame follow toward the real cursor. A little lag is deliberate — the
     * lit patch trails the pointer like a wake instead of being welded to it.
     */
    ease: 0.16,
    /** Fade in/out of the whole highlight, per second, as the pointer arrives
     *  and leaves. Without it the web snaps dark the moment the cursor exits. */
    fade: 3.2,
    /** Extra dot radius and line width at full heat, as a fraction. */
    swell: 0.55,
  },

  /**
   * Alpha budget per tone, and how much the pointer adds on top.
   *
   * `glow` composites with `lighter`, so overlapping lines *sum* — the base
   * alphas are low because a busy patch of web adds up to bright on its own.
   * `ink` draws source-over on a light page, where nothing accumulates and
   * every mark has to carry its own weight, so the dots start higher and the
   * boost is smaller (there is no headroom above the page to bloom into).
   *
   * The resting alphas are deliberately below what looks best on an empty
   * canvas. This is a *backdrop*: the page's body copy sits directly on it with
   * nothing in between, and a web bright enough to admire is a web that competes
   * with the sentence in front of it. The pointer boosts carry the extra weight
   * instead — the web is quiet until you go looking for it, and the peak under
   * the cursor is roughly what the old resting state was.
   */
  tone: {
    glow: { link: 0.17, dot: 0.32, halo: 0.075, boost: 2.4 },
    ink: { link: 0.17, dot: 0.38, halo: 0.042, boost: 1.7 },
  },
} as const;
