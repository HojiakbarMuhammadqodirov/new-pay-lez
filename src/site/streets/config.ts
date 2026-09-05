/**
 * Tunables for the street map behind the Contact page.
 *
 * Everything here is in **CSS pixels and seconds**, never in device pixels or
 * frames — the same unit rule the other 2D backdrops state, and for the same
 * reason: the canvas is drawn at whatever `devicePixelRatio` the display has,
 * and the loop is driven by elapsed time, so a retina laptop and a 60Hz monitor
 * have to agree on what "a road reaching across the screen" means.
 */
export const STREETS = {
  /**
   * The block, in CSS px — the unit every length and every branch offset is a
   * multiple of.
   *
   * This one number is what makes the drawing read as a *map* rather than as a
   * heap of axis-aligned sticks. Real cities are not on a perfect lattice, so
   * the multiples are jittered (`jitter` below) — but they share a rhythm, and
   * a viewer reads that rhythm as "streets" long before they read any single
   * line as one.
   */
  block: 46,

  /** How far a length or an offset may drift off its multiple, as a fraction of
   *  a block. Zero is graph paper; past ~0.3 the rhythm stops being legible. */
  jitter: 0.22,

  /**
   * One rank per depth, coarsest first: an avenue, a street, a lane, an alley.
   *
   * `blocks` is the length in blocks, `branches` how many side-streets come off
   * it, and `speed` how fast it draws in CSS px/s. Speed **falls** with depth on
   * purpose. The eye follows the fastest thing on screen, and if an alley drew
   * as quickly as an avenue the picture would be a scatter of equal marks
   * appearing at once instead of a route working outward from a road.
   *
   * Four ranks and not five: the fifth is a mark two pixels long that costs a
   * branch point and reads as dust.
   */
  ranks: [
    { blocks: [7, 12], branches: [3, 5], speed: 260, width: 2.0 },
    { blocks: [4, 7], branches: [2, 4], speed: 190, width: 1.4 },
    { blocks: [2, 4], branches: [1, 2], speed: 140, width: 0.9 },
    { blocks: [1, 2], branches: [0, 0], speed: 110, width: 0.7 },
  ],

  /**
   * How often a side-street continues through its parent instead of stopping
   * at it — a crossroads rather than a T.
   *
   * With this at 0 every junction on the map is a T, nothing ever encloses a
   * block, and the picture reads as a comb. At 1 it is graph paper. A third is
   * where it starts looking like somewhere people live, and it is the single
   * change that made this stop looking like a wiring diagram.
   */
  crossChance: 0.34,

  /**
   * Ceiling on the streets one map may grow.
   *
   * A hard cap rather than a depth limit doing the work by itself: the branch
   * counts above are ranges, and four ranks of a lucky roll compound to several
   * hundred segments. The cap is what stops one map in a thousand from being a
   * solid mat while every other one is a sketch.
   */
  maxStreets: 78,

  /**
   * A junction becomes a landmark with this probability — the small squares
   * that are the only thing here that is not a line.
   *
   * Low on purpose. They are the payoff of the whole picture ("the map reached
   * something"), and a payoff on every corner is decoration.
   */
  landmarkChance: 0.13,

  /** Landmark half-size in CSS px, and how long its arrival ring takes to
   *  expand and fade. */
  landmarkSize: 2.6,
  landmarkRing: { seconds: 1.1, radius: 15 },

  /**
   * The life of one map, in seconds: draw itself, stand, then go.
   *
   * The fade and the reseed are the point rather than a way of cleaning up. A
   * contact page is asked the same question by a different person every day, so
   * the map finishes, holds long enough to be read, and then the next route
   * starts from somewhere else.
   */
  life: { grow: 13, hold: 5, fade: 3.4 },

  /**
   * Two maps at a time, staggered.
   *
   * One would leave the page briefly empty at every reseed, which on a backdrop
   * reads as a flicker rather than as a beat. The second is seeded the moment
   * the first stops growing, so there is always one being drawn and one being
   * read. Three would be a mat — see `maxStreets`.
   */
  maps: 2,

  /**
   * How far apart two maps are seeded, as a fraction of the viewport's
   * diagonal. Without it the reseed lands on top of the one still fading and
   * the two read as one confused place.
   */
  minSeparation: 0.42,

  pointer: {
    /**
     * The torch. Streets and landmarks inside this radius brighten — the one
     * hover, and it is the page's own argument: the part of the map you are
     * looking at is the part you know the way through.
     */
    radius: 210,
    /** Per-frame follow toward the real cursor, so the lit patch trails rather
     *  than being welded to it. */
    ease: 0.16,
    /** Fade in/out of the whole highlight per second, as the pointer enters and
     *  leaves the window. */
    fade: 3.2,
    /** Extra line width at full heat, as a fraction. */
    swell: 0.7,
  },

  /**
   * A press grows a road toward it.
   *
   * Every backdrop here answers the pointer with something the picture is
   * already about: the market fires a venue, the stubs tear along their own
   * perforation, the city builds. A map answers by **going somewhere** — the
   * nearest junction to the press puts out a street toward it. `reach` is that
   * street's length in blocks; it is longer than an ordinary lane because the
   * gesture should visibly cross ground.
   */
  press: { reach: [4, 8], rank: 1, maxPerMap: 14 },

  /**
   * Alpha budget per tone, and how much the pointer adds on top.
   *
   * `glow` composites with `lighter`, so crossings *sum* — a junction is
   * brighter than the two streets that make it without anything drawing it. On
   * `ink` nothing accumulates, so the marks start higher and there is no
   * headroom above the page to boost into.
   *
   * The resting alphas are deliberately below what looks best on an empty
   * canvas, and lower here than they would be anywhere else on the site: this
   * backdrop sits under a **form**, and a field a visitor is typing an address
   * into is the least forgiving thing a moving layer can sit behind. The torch
   * carries the extra weight instead.
   */
  tone: {
    glow: { street: 0.15, junction: 0.24, landmark: 0.4, ring: 0.28, boost: 2.6 },
    ink: { street: 0.18, junction: 0.27, landmark: 0.42, ring: 0.24, boost: 1.8 },
  },
} as const;
