/**
 * Tunables for the market tape behind the Business page.
 *
 * Same unit discipline as `network/config.ts`: **CSS pixels and seconds**, never
 * device pixels or frames. The canvas draws at whatever `devicePixelRatio` the
 * display has and the loop is driven by elapsed time, so a retina laptop and a
 * 60Hz monitor have to agree on what "a slow climb" means.
 *
 * What it is, and why it is not the node web again: the Analytics backdrop is
 * *drifting points that link to each other* — a network, which is what a
 * customer base is. This one is a **market being printed, candle by candle, and
 * ticked up by the venues under it**.
 * Every Business claim on the page is a revenue claim, and the two halves say
 * the two halves of it: the venues are repeat custom (fixed points that fire
 * again, and fire when your cursor passes them), and the tape is what that
 * repeat compounds into. Neither half is decoration for the other — a venue
 * firing is the only thing that moves the print, which is the whole argument of
 * the page drawn as one picture.
 *
 * **Candles rather than a line, and the reason is legibility rather than
 * fashion.** A smoothed line says "it went up"; a candle says *how* — a session
 * that opened low and closed high is a different shape from one that gave it
 * back, and a venue firing now visibly extends a body rather than nudging a
 * curve. It is also the form the audience for this page already reads.
 *
 * **Direction is drawn, not coloured.** The palette has one accent, so the
 * green-and-red every trading screen uses is not available — an up candle is
 * **filled** and a down candle is **hollow**, which is what a chart printed in
 * one ink has always done and is still the fastest tell on the screen.
 */
export const MARKET = {
  tape: {
    /**
     * Horizontal distance between candle centres, CSS px, and how fast the tape
     * scrolls, CSS px per second.
     *
     * Slow. This sits behind body copy for the length of a long page, and a
     * chart that visibly races is a chart the reader keeps looking back at. The
     * speed is one candle every two and a bit seconds, which is a print rate a
     * real tape would have — fast enough to be alive, slow enough to ignore.
     */
    spacing: 26,
    speed: 11,

    /** Body width, CSS px. Under the spacing by enough to leave a clear gutter:
     *  candles that touch read as a bar chart, which is a different picture. */
    width: 13,

    /**
     * The band the tape lives in, as fractions of viewport height, bottom-up.
     *
     * It never leaves them: the drawn level is a fixed rise across the width
     * plus a walk that scrolls through it, rather than an accumulating value
     * that would eventually leave the top of the screen or flatline at the
     * bottom. The trend is a property of the drawing, not of the simulation, so
     * "up and to the right" is guaranteed on every frame of every session.
     */
    band: { from: 0.16, to: 0.66 },
    /** How much of the band the walk is allowed to spend, as a fraction. */
    wiggle: 0.17,

    /**
     * The random walk behind the closes.
     *
     * `drift` is how far one close may move from the last, `pull` is how
     * strongly it is drawn back to zero. Without the pull the walk wanders to
     * one rail of the band and stays there; with too much of it every candle is
     * a doji and the tape reads as a ruler.
     */
    drift: 0.42,
    pull: 0.16,

    /**
     * The wick, as a multiple of the body's own height plus a floor.
     *
     * Both terms are needed. Proportional alone gives a flat candle no wick at
     * all, which is the one thing a real session never is; a floor alone gives
     * every candle the same whiskers regardless of its range, which reads as a
     * pattern rather than as a market. The floor is in the same normalised units
     * as the walk, not in pixels.
     */
    wickSpread: 0.55,
    wickFloor: 0.16,

    /** A body this short is a doji, and it still has to be visible. CSS px. */
    minBody: 1.6,

    /**
     * What one venue pulse adds to the open candle's close.
     *
     * The tick is the point of the backdrop, so it is well above the noise
     * floor — a visit has to be visible as a visit, not as more walk.
     */
    tick: 0.5,
    /** A pointer-triggered pulse ticks harder, the way its ring is brighter. */
    tickBoost: 2.2,

    /** Scrolling gridlines, CSS px. Purely to give the scroll something to be
     *  measured against; at the alphas below they are barely there. */
    gridX: 132,
    gridY: 108,

    /** The last-price rule at the head: dash and gap, CSS px. */
    rule: [6, 7],
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
       * past the shop, and the candle above it prints for you. That is the
       * entire pitch of the page rendered as a cursor interaction.
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
   * between, and the tape crosses the full width of every paragraph rather than
   * being a mark that happens to land near one. `glow` composites with `lighter`
   * and gets the lower budget for exactly that reason; `ink` draws source-over
   * onto paper, where nothing accumulates and each mark carries its own weight.
   *
   * `body` is the filled up-candle and is the one number here set by the worst
   * frame rather than the best: a screen of solid blocks under a paragraph is a
   * different colour of paper from the paragraph above it, however good one
   * candle looks on its own. `hollow` is the down candle's outline, and it runs
   * a little *hotter* than the fill on purpose — a 1px rectangle at the fill's
   * alpha disappears next to a solid one, and the two have to weigh the same or
   * the tape looks like it is missing candles.
   */
  tone: {
    glow: { body: 0.26, hollow: 0.38, wick: 0.3, head: 0.55, grid: 0.035, ring: 0.12, dot: 0.3 },
    ink: { body: 0.3, hollow: 0.44, wick: 0.34, head: 0.42, grid: 0.05, ring: 0.15, dot: 0.4 },
  },
} as const;
