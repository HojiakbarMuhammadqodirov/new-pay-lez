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
   * Alpha budget per tone, and the pointer's boost on top — same shape and
   * same philosophy as `WEB.tone`: resting values below what looks best on an
   * empty canvas, because the page's copy sits straight on this.
   */
  tone: {
    glow: { line: 0.13, boost: 2.2 },
    ink: { line: 0.2, boost: 1.4 },
  },
} as const;
