/**
 * Tunables for the drifting stubs behind the Vouchers page.
 *
 * Everything here is in **CSS pixels and seconds** — see the unit note at the
 * top of `network/config.ts`, which this file follows exactly.
 *
 * The picture is the vouchers themselves: ticket outlines — notched sides,
 * dashed tear line — sinking slowly down the page, the way a handful of deals
 * settles into a wallet. It replaces the static CSS perforation, which said
 * "ticket" once; this says it with the actual object the page is selling, and
 * says it quietly enough to carry body copy.
 */
export const STUBS = {
  /**
   * One stub per this many square CSS pixels — a density, not a count, for the
   * reason the node web's is: fix the count and a phone drowns in tickets a
   * widescreen barely shows.
   */
  areaPerStub: 90000,
  minStubs: 6,
  maxStubs: 22,

  /** Ticket width, CSS px. Height follows at `aspect`. */
  size: { min: 46, max: 84 },
  aspect: 0.46,
  /** The semicircular notch at each side, as a fraction of the height. */
  notch: 0.18,
  /** The tear line sits this fraction in from the right edge. */
  tear: 0.3,

  /** Sink rate, CSS px/s. Slow enough to read as settling, not raining. */
  fall: { min: 8, max: 20 },
  /** Sideways sway: amplitude in CSS px, frequency in Hz. */
  sway: { amplitude: { min: 10, max: 26 }, hz: { min: 0.1, max: 0.22 } },
  /** Spin, rad/s, either direction up to this. */
  spin: 0.12,

  pointer: {
    /** Stubs inside this radius of the cursor brighten; falloff is squared. */
    radius: 240,
    /** Fade in/out of the highlight, per second. */
    fade: 3.2,
  },

  /**
   * Tearing one.
   *
   * A stub has a perforation down it and the page is about redeeming vouchers,
   * so the one gesture the backdrop owes a visitor is the one the object is
   * for: click a ticket and it comes apart along its own tear line. The two
   * halves are the same picture one step further on — a stub torn is a stub
   * spent.
   */
  torn: {
    /**
     * Slack around a stub's own rectangle that still counts as a hit, CSS px.
     * Set by the *smallest* ticket and a finger, not by a mouse: a 46 px stub
     * is 21 px tall, and a 21 px target is under every touch guideline there
     * is. Padding the rectangle is cheaper than a second hit shape and keeps
     * the test to a rotate and two compares.
     */
    hitPad: 10,
    /**
     * How much brighter the stub under the pointer is than the proximity
     * highlight around it. The backdrop cannot show a cursor — it is
     * `pointer-events: none` — so the only way it can say "this one" is with
     * the ink it already spends.
     */
    hover: 1.7,

    /**
     * Halves alive at once. Two per tear, and pooled rather than allocated:
     * this is the only object the loop would churn, and the ring pool in
     * `market/` exists for the same reason.
     */
    maxHalves: 16,

    /**
     * Outward speed along the ticket's own long axis, CSS px/s. Read with
     * `drag`: an exponential fall-off travels `impulse / drag`, so this pair
     * separates the halves by about 55 px each — a ticket's width, which is
     * what "came apart" has to look like at this size.
     */
    impulse: { min: 120, max: 175 },
    /** Velocity decay per second, exponential. See `impulse`. */
    drag: 2.6,
    /**
     * Vertical scatter added at the tear, CSS px/s. Asymmetric on purpose: a
     * torn half is more likely to be dropped than flicked upward.
     */
    lift: { min: -34, max: 12 },
    /** Downward pull on a loose half, CSS px/s². Paper, not gravel. */
    gravity: 110,
    /**
     * Tumble, rad/s — the halves take opposite signs, because the tear is what
     * spun them and it pushed them apart. Capped where a half still reads as a
     * ticket over its whole life rather than as a rotating streak.
     */
    spin: { min: 0.6, max: 1.9 },
    /** Seconds from tear to gone. Quick: this is a flick, not a leaf. */
    life: 1.1,

    /**
     * The torn edge: `teeth` segments, each offset by up to `ragged` of the
     * ticket's height. Both halves are cut from **one** profile, so they would
     * still fit back together — a tear is one event with two sides, and two
     * independently jittered edges read as two unrelated shreds.
     */
    teeth: 7,
    ragged: 0.1,
    /**
     * The fresh edge flashes: the accent at `boost`× the resting line alpha,
     * decaying over `life` seconds. It is the one place the accent is spent
     * loudly, and it is spent on the fibres — which is the whole gesture.
     */
    flash: { boost: 3.6, life: 0.24 },
  },

  /**
   * What separates a tap from a scroll. The listeners are passive and on the
   * window, so nothing can be prevented: the only defence against tearing a
   * ticket every time a phone starts a flick is to measure the gesture and let
   * a moved or held pointer through untouched.
   */
  tap: {
    /** Movement between down and up that is still a tap, CSS px. */
    slop: 10,
    /** And the longest a tap may take, ms. Past this it is a press. */
    holdMs: 500,
  },

  /**
   * Alpha budget per tone, and the pointer's boost on top — same shape and
   * same philosophy as `WEB.tone`: resting values below what looks best on an
   * empty canvas, because the page's copy sits straight on this.
   */
  tone: {
    glow: { line: 0.13, boost: 2.2 },
    ink: { line: 0.2, boost: 1.4 },
  },
} as const;
