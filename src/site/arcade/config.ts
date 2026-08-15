/**
 * Tunables for the arcade trail behind the L-Earn page.
 *
 * Everything here is in **CSS pixels and seconds**, like `network/config.ts`
 * and unlike `flight/config.ts` — the distinction matters and is worth
 * restating: the real game works in world units because it has to *play* the
 * same at every size, and this is not a game. It is a picture of one, a
 * backdrop, and a backdrop has to *look* the same at every size, which is the
 * job CSS pixels already do.
 *
 * The picture is Squawk's Flight, the arcade round in the L-Earn app: gate
 * columns drifting past and a trail threading the gaps. It is deliberately the
 * product's own game rather than an invented motif — the page sells the
 * arcade, so the backdrop is the arcade, the same way the B2B tape is that
 * page's own revenue claim drawn out.
 */
export const ARCADE = {
  /** How fast the world scrolls past, CSS px/s. A drift, not a chase. */
  scroll: 30,

  gates: {
    /** Horizontal distance between one gate and the next, CSS px. */
    spacing: 380,
    /** The opening, CSS px — clamped to half the viewport so a short window
     *  still has pillars worth the name. */
    gap: 200,
    /** The gap centre keeps this fraction of the height clear at each end. */
    margin: 0.18,
    /** The lip at each gap mouth, CSS px — the short horizontal stroke that
     *  turns a dangling line into a pipe end. */
    lip: 14,
  },

  flyer: {
    /** Where the flyer holds station, as a fraction of the width. */
    x: 0.3,
    /**
     * Autopilot stiffness, 1/s. The flyer's `y` closes this fraction of the
     * distance to the next gap centre per second (exponentially) — high enough
     * to make every gate, low enough that the approach reads as a swoop rather
     * than a snap.
     */
    chase: 2.6,
    /** Idle bob, so a long straight between gates still looks flown. */
    bob: { amplitude: 7, hz: 0.45 },
    /** Dot radius, CSS px. */
    radius: 3.2,
  },

  trail: {
    /** How far behind the flyer the trail survives, CSS px. */
    length: 520,
    /** Stroke width at the head. It thins toward the tail. */
    width: 2,
  },

  /** The score pulse — an expanding ring where a gate is cleared. */
  pulse: {
    /** Lifetime, seconds. */
    life: 0.9,
    /** Radius at birth and at death, CSS px. */
    from: 6,
    to: 46,
  },

  pointer: {
    /**
     * The cursor steers the flyer: while the pointer is over the page the
     * autopilot's target is the cursor's height instead of the next gap. The
     * ease/fade pair works exactly like the node web's — the hand-over in and
     * out is gradual, so the flyer banks toward your cursor rather than
     * teleporting to it.
     */
    fade: 1.6,
  },

  /**
   * Alpha budget per tone — the same shape as `WEB.tone`, and the same
   * philosophy: this is a backdrop with body copy sitting directly on it, so
   * everything rests quiet. The trail is the brightest thing on it because the
   * trail is the point — it is the line the player would have flown.
   */
  tone: {
    glow: { gate: 0.14, trail: 0.4, dot: 0.85, pulse: 0.35 },
    ink: { gate: 0.2, trail: 0.42, dot: 0.7, pulse: 0.3 },
  },
} as const;
