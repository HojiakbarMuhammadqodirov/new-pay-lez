/**
 * Tunables for the market tape behind the B2B page.
 *
 * Same unit discipline as `network/config.ts`: **CSS pixels and seconds**, never
 * device pixels or frames. The canvas draws at whatever `devicePixelRatio` the
 * display has and the loop is driven by elapsed time, so a retina laptop and a
 * 60Hz monitor have to agree on what "a slow climb" means.
 *
 * What it is, and why it is not the node web again: the Analytics backdrop is
 * *drifting points that link to each other* — a network, which is what a
 * customer base is. This one is a **line that climbs, ticked up by the venues
 * under it**.
 * Every B2B claim on the page is a revenue claim, and the two halves say the
 * two halves of it: the venues are repeat custom (fixed points that fire again,
 * and fire when your cursor passes them), and the tape is what that repeat
 * compounds into. Neither half is decoration for the other — a venue firing is
 * the only thing that moves the line, which is the whole argument of the page
 * drawn as one picture.
 */
export const MARKET = {
  tape: {
    /**
     * Horizontal distance between samples, CSS px, and how fast the tape
     * scrolls, CSS px per second.
     *
     * Slow. This sits behind body copy for the length of a long page, and a
     * chart that visibly races is a chart the reader keeps looking back at.
     */
    spacing: 26,
    speed: 11,

    /**
     * The band the line lives in, as fractions of viewport height, bottom-up.
     *
     * It never leaves them: the drawn curve is a fixed rise across the width
     * plus a wiggle that scrolls through it, rather than an accumulating value
     * that would eventually walk off the top of the screen or flatline at the
     * bottom. The trend is a property of the drawing, not of the simulation, so
     * "up and to the right" is guaranteed on every frame of every session.
     */
    band: { from: 0.16, to: 0.66 },
    /** How much of the band the wiggle is allowed to spend, as a fraction. */
    wiggle: 0.17,

    /**
     * The random walk behind the wiggle.
     *
     * `drift` is how far one sample may move from the last, `pull` is how
     * strongly it is drawn back to zero. Without the pull the walk wanders to
     * one rail of the band and stays there; with too much of it the line is a
     * hairline ripple and reads as a heart monitor rather than a market.
     */
    drift: 0.42,
    pull: 0.16,

    /**
     * What one venue pulse adds to the newest sample.
     *
     * The tick is the point of the backdrop, so it is well above the noise
     * floor — a visit has to be visible as a visit, not as more wiggle.
     */
    tick: 0.5,
    /** A pointer-triggered pulse ticks harder, the way its ring is brighter. */
    tickBoost: 2.2,

    /** Scrolling gridlines, CSS px. Purely to give the scroll something to be
     *  measured against; at the alphas below they are barely there. */
    gridX: 132,
    gridY: 108,
  },

  venues: {
    /**
     * One venue per this many square CSS pixels.
     *
     * A density rather than a count, for the same reason the web uses one: the
     * ring radius below is absolute, so a fixed count would give a phone a solid
     * wall of overlapping rings and a widescreen a few lonely dots. Thinner than
     * the field was on its own — the tape is now the loud element, and the
     * venues under it are the reason it moves.
     */
    areaPer: 200000,
    min: 5,
    /** Past this the rings overlap into a wash and stop reading as separate. */
    max: 18,

    /**
     * Seconds between a venue's own pulses. Wide, and randomised per venue, so
     * the field never falls into step — a dozen venues pulsing together reads as
     * one throb rather than as many independent shops.
     */
    period: { min: 4.5, max: 11 },

    /** How long one ring lives, and how far it gets, in seconds and CSS px. */
    life: 4.6,
    maxRadius: 165,

    /** The venue itself, CSS px. */
    dotRadius: { min: 1.6, max: 2.8 },

    /**
     * Rings alive at once, across the whole field.
     *
     * A hard pool rather than an unbounded array: the oldest is recycled when a
     * new one will not fit. At the densities above roughly seven are alive at
     * any moment, so this is a backstop against a tab that was suspended
     * mid-frame, not a limit anything reaches in normal use.
     */
    maxRings: 64,

    pointer: {
      /**
       * Passing this close to a venue fires it — you make a visit by walking
       * past the shop, and the line above ticks up for it. That is the entire
       * pitch of the page rendered as a cursor interaction.
       */
      radius: 132,
      /**
       * Seconds before the same venue can be triggered again. Without it,
       * resting the cursor on a venue emits a ring per frame and drives the tape
       * straight into its rail.
       */
      cooldown: 1.1,
      /** A triggered ring is brighter than a scheduled one, as a fraction. */
      boost: 2.1,
    },
  },

  /**
   * Alpha budget per tone.
   *
   * Deliberately below what looks best on an empty canvas — the same lesson the
   * node web's alphas carry. Body copy sits directly on this with nothing in
   * between, and the tape is a continuous stroke that crosses the full width of
   * every paragraph rather than a mark that happens to land near one. `glow`
   * composites with `lighter` and gets the lower budget for exactly that reason;
   * `ink` draws source-over onto paper, where nothing accumulates and each mark
   * carries its own weight.
   *
   * `fill` is the area under the line, and it is the one number here that was
   * set by the worst frame rather than by the best: it is a wash the width of
   * the page, so at anything higher the lower half of every section reads as a
   * different colour of paper from the upper half.
   */
  tone: {
    glow: { line: 0.3, fill: 0.05, head: 0.55, grid: 0.035, ring: 0.12, dot: 0.3 },
    ink: { line: 0.34, fill: 0.06, head: 0.42, grid: 0.05, ring: 0.15, dot: 0.4 },
  },
} as const;
