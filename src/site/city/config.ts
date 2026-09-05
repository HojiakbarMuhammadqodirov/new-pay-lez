/**
 * Tunables for the city rising behind the Relocate page.
 *
 * Everything here is in **CSS pixels and seconds**, never in device pixels or
 * frames — the same unit rule the other 2D backdrops state, and for the same
 * reason: the canvas is drawn at whatever `devicePixelRatio` the display has,
 * and the loop is driven by elapsed time, so a retina laptop and a 60Hz monitor
 * have to agree on what "a block rising" means.
 */
export const CITY = {
  /**
   * One block, in CSS px, as a 2:1 diamond — the projection's whole geometry.
   *
   * 2:1 and not a true 30° isometric (1.732:1) on purpose: it is the ratio every
   * pixel-art city has used since tiles were invented, because the diagonals
   * land on whole pixels and the drawing stays crisp instead of stair-stepping.
   * Bigger than it wants to be, too — see `maxBlocks`, which this number is what
   * actually controls.
   */
  tile: { w: 124, h: 62 },

  /** Height of one storey, CSS px. The whole sense of scale hangs off the ratio
   *  between this and `tile.h`; much past a half and the towers read as pillars
   *  rather than as buildings. */
  storey: 23,

  /**
   * The street, as a fraction of the block inset on every side.
   *
   * There are no street objects in this backdrop, which is the trick that makes
   * it cheap: the roads are the *gaps* between blocks, so a lattice of quads
   * draws a grid of streets for free and the two can never disagree about where
   * a corner is.
   */
  gap: 0.16,

  /**
   * How the storeys are distributed, as cumulative probability.
   *
   * The first entry is the important one: **half the city is empty ground** —
   * squares, yards, car parks, the gaps a real place is full of. It was a third
   * and that was already too dense: this is a backdrop with body copy directly
   * on it, and a skyline packed edge to edge is a texture rather than a place.
   * The empty blocks are what let the towers read as towers, and what leaves the
   * page somewhere to put a sentence.
   */
  heights: [
    { upTo: 0.52, storeys: 0 },
    { upTo: 0.79, storeys: 1 },
    { upTo: 0.93, storeys: 2 },
    { upTo: 0.985, storeys: 4 },
    { upTo: 1, storeys: 8 },
  ],

  /**
   * Ceiling on blocks drawn per frame.
   *
   * Three quads and four strokes each, so this is the real cost of the whole
   * effect and the number to move if a phone struggles. A 1440x900 viewport
   * wants about 230 at the tile size above; the cap is the guard for an
   * ultrawide, where the visible lattice grows faster than anybody expects.
   */
  maxBlocks: 620,

  /**
   * The camera, drifting through the city in CSS px/s.
   *
   * Slow, and diagonal rather than along an axis: travelling straight down a
   * street means the whole lattice slides in lockstep and the picture reads as
   * a texture being scrolled. Off-axis, the rows shear past each other at
   * different rates and it reads as movement *through* somewhere.
   */
  drift: { x: -7.5, y: 4.2 },

  /**
   * A block appears, then rises.
   *
   * `stagger` is how much later a block starts for each step of distance from
   * the camera, which is what makes the city build in a wave running outward
   * instead of the whole screen popping up at once. `rise` is the climb itself,
   * eased so a building decelerates into its height rather than stopping dead.
   */
  build: { stagger: 0.06, rise: 1.5, fade: 0.9 },

  pointer: {
    /**
     * Blocks inside this radius brighten and lift.
     *
     * The lift is the point rather than the brightness: this is a *city*, and
     * the one thing a city does that a diagram cannot is stand up. Following the
     * cursor with a patch of it standing taller is the page's own argument —
     * the part you are looking at is the part you know.
     */
    radius: 260,
    /** Extra storeys at full heat, and the extra alpha as a multiplier. */
    lift: 0.9,
    boost: 1.9,
    /** Per-frame follow toward the real cursor, so the lit patch trails. */
    ease: 0.16,
    /** Fade in/out of the whole highlight per second, as the pointer enters and
     *  leaves the window. */
    fade: 3.2,
  },

  /**
   * A press puts a tower up where you pressed.
   *
   * Every backdrop here answers the pointer with something its picture is
   * already about: the market fires a venue, the stubs tear along their own
   * perforation. A city answers by **building** — the block under the press
   * grows to `storeys` and stays that way while it is on screen.
   */
  press: { storeys: 9, max: 24 },

  /**
   * Alpha per face, per tone — and the ordering **inverts** between them.
   *
   * This is the one thing here that cannot be shared between the two themes, and
   * it is the trap the runner sprite's header warns about one directory over.
   * Every face is painted as the page's own background first and then tinted, so
   * alpha here means *how much accent* — which on black is lighter and on paper
   * is darker. Same numbers, opposite lighting: on dark the roof is the brightest
   * face and the light reads as coming from above; on paper those numbers would
   * light the city from underneath. So light gives the roof the least ink and the
   * shaded wall the most, which is what a pencil does.
   *
   * `edge` is the outline every face carries and is what actually draws the
   * city; the fills are there to stop it being a wireframe, which is the whole
   * reason this replaced a lattice of hairlines. `ground` is a block with
   * nothing on it.
   */
  tone: {
    glow: { edge: 0.28, roof: 0.14, left: 0.045, right: 0.085, ground: 0.03 },
    ink: { edge: 0.24, roof: 0.035, left: 0.115, right: 0.07, ground: 0.022 },
  },

  /**
   * The horizon veil: a band of the page's own background laid back over the
   * city, opaque at the top and clear by `to`.
   *
   * This is the distance fog, and it is one `fillRect` rather than a per-block
   * alpha because the buildings are **opaque** — a near tower has to cover the
   * one behind it or the whole picture goes back to being a wireframe, and an
   * alpha that varies by depth cannot occlude. Painting the far half back out
   * afterwards is both cheaper and truer: it dissolves the lattice into the page
   * instead of ending it at a hard line, and it is what leaves the top of the
   * viewport quiet enough to put a headline on.
   */
  veil: { to: 0.72, strength: 0.97 },
} as const;
