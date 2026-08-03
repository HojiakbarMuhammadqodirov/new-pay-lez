/**
 * Tunables for Squawk's Flight, the arcade round in the L-Earn app.
 *
 * Everything here is in **world units and seconds**, and that is the one place
 * this file departs from its neighbour `network/config.ts`, which works in CSS
 * pixels. The difference is not style, it is the difference between a backdrop
 * and a game: a backdrop has to *look* the same at every size, a game has to
 * *play* the same. The stage is always `worldHeight` tall whatever the canvas
 * measures, and `pxPerUnit = canvasHeightCss / worldHeight` is recomputed on
 * resize. Fix the physics in pixels instead and the gap is a third of a phone's
 * stage and a sixth of a desktop's — the same numbers, a different game.
 *
 * Seconds are still seconds, for the same reason they are next door: the loop
 * is driven by elapsed time, so a 144Hz monitor and a throttled phone have to
 * agree on how fast a pipe crosses.
 */
export const FLIGHT = {
  /**
   * The stage, in world units. Portrait, and that is not a style choice.
   *
   * Every number below is the original game's, normalised to a 100-unit-tall
   * world from the reference implementation in pgzero's `flappybird.py`
   * (WIDTH 400, HEIGHT 708, GAP 130, GRAVITY 0.3/frame², FLAP 6.5/frame,
   * SPEED 3/frame at 60fps). Those constants only mean anything together with
   * the *shape* they were tuned in: 400x708 is an aspect of 0.565, so a screen
   * that is 100 units tall is about 57 wide.
   *
   * Build this on a landscape stage instead and the playfield is 148 units
   * across — nearly three times the track — so a column takes three times as
   * long to arrive, and the only way to make that feel like anything is to
   * double the scroll speed and widen the gap to catch up. Which is a different
   * game. 71 is a little roomier than the original's 57, because a browser card
   * is read further from the eye than a phone held at arm's length, and it is
   * the one number here deliberately off the original.
   *
   * `site.css` pins `.fly-stage` to this exact ratio, so `pxPerUnit` derived
   * from height and from width agree.
   */
  worldHeight: 100,
  worldWidth: 71,

  bird: {
    /** Fixed distance from the left rail. The world moves; the parrot does not. */
    x: 16,
    /** Sprite box. The parrot is drawn in a unit square scaled to this. */
    size: 5,
    /**
     * Collision radius, deliberately well under half the sprite. The beak, the
     * crest and the tail all stick out past the body, and being killed by the
     * tip of a feather reads as a bug rather than as a mistake. Every game in
     * this genre cheats here; the ones that do not are the ones nobody finishes.
     */
    radius: 2.2,
    /** Nose-up at full climb, nose-down at terminal, and how fast it gets there. */
    tilt: { up: -0.38, down: 0.95, rate: 5.5 },
  },

  /**
   * Gravity and the flap: 1080 px/s² and 390 px/s over a 708px screen.
   *
   * What makes them *these* numbers rather than any other pair with the same
   * ratio is the arc they cut against the gap. apex = flap²/2·gravity = 55²/304
   * ≈ 9.9 units against a gap of 18.4 — **one flap covers 54% of the hole.**
   *
   * That number is the game. Tune the apex down to a third of the gap and every
   * hole becomes a comfortable two-flap glide; the tension of the original is
   * that a single flap nearly overshoots, so you are always correcting rather
   * than steering. `verify-geo.ts` holds the ratio in a band for exactly this
   * reason — an earlier build of this file asserted apex < 0.6·gap as a *safety*
   * rule and in doing so asserted the real game out of existence.
   */
  gravity: 152,
  flap: -55,
  /**
   * Terminal fall, ~600 px/s. Without it a long dive arrives at a speed no
   * single flap can arrest, so a moment's inattention is unrecoverable rather
   * than expensive.
   */
  maxFall: 85,

  pipe: {
    /** Column width — the original's 52px of a 288px-wide screen. */
    width: 13,
    /** The hole: 130px of 708. Roughly three and a half birds. */
    gap: 19,
    /** Seconds between spawns — at `speed` that is 35 units apart, two on screen. */
    interval: 1.38,
    /** World units per second: 180 px/s over 708. */
    speed: 25.4,
    /**
     * How close a gap edge may come to the ceiling or the floor.
     *
     * Without it the generator eventually asks for a gap flush against the roof,
     * which is only reachable from a climb you had no way to know you needed —
     * unfair in the specific sense that no play of the previous second could
     * have prepared for it.
     */
    margin: 12,
    /**
     * How far a gap may move from the one before it.
     *
     * Not a difficulty dial — a solvability one. Between two columns there are
     * `interval` seconds, and a bird flapping as fast as it usefully can climbs
     * about 27 units/s sustained, so roughly 37 units of altitude are available
     * before the next gate arrives. Leave the generator free to swing the full
     * 57-unit band and it will periodically deal a course no flying can answer,
     * which reads to the player as the game cheating rather than as a hard
     * course. Twenty-six leaves a third of the climb in hand.
     *
     * Falling is cheaper than climbing, but the limit is symmetric: an
     * asymmetric one produces courses that drift steadily downward.
     */
    maxStep: 26,
    /** The accent band across the mouth of each column. */
    cap: 2.4,
    /** Corner radius on the column mouths. */
    radius: 1.8,
  },

  /**
   * The run is endless, the way the original is — you fly until you crash.
   * `target` is only where the round *banks*: clear that many and the flight
   * counts as a win, so it costs no life, and every gap past it still pays.
   *
   * Five, and not the twelve this shipped with, because the original is *hard*:
   * the simulated pilot in `verify-geo.ts` clears somewhere between two and
   * seventeen gaps depending on the course, and a real beginner is worse. A
   * bank line above a typical run means the flight quietly becomes a life
   * shredder — three crashes and the whole L-Earn page is closed for the day,
   * on the one game where crashing is the entire mechanic. Five matches the
   * quizzes' five questions, so a round costs the same either way, and skill is
   * paid for past it rather than gated behind it.
   */
  target: 5,
  perGap: 2,
  /** Ceiling on a single flight's payout, against a score that cannot be trusted. */
  maxGaps: 99,

  /** Wing beats per second. Two frames, so this is also the flap-cycle rate. */
  wingHz: 5.5,

  /**
   * What still animates once a player has come through the reduced-motion gate.
   *
   * The columns are absent from this list because the columns *are* the game —
   * there is no version of this without them. Everything that is decoration is
   * off: the wing pins to one frame and the body holds level. See the long note
   * in `FlightGame.tsx` for why this game offers an opt-in rather than freezing
   * the way the backdrops do.
   */
  calm: { wing: false, tilt: false },

  /**
   * How the stage and the columns are tinted, per tone.
   *
   * These are alphas of the accent over the *page*, which is the one place on
   * this canvas where alpha does what it looks like it does: nothing opaque has
   * been painted underneath them. The distinction matters, because a pipe that
   * borrowed the CSS tokens instead would be `--surface-2` over `--surface` —
   * about 1.05:1 on the light theme, which is not a faint pipe but no pipe.
   */
  tone: {
    glow: { stage: 0.03, pipe: 0.1, edge: 0.34, cap: 1 },
    ink: { stage: 0.05, pipe: 0.2, edge: 0.52, cap: 1 },
  },

  /**
   * The parrot's interior shading, as a fraction of the way from the accent to
   * the page's own ground.
   *
   * A *mix*, not an alpha, and that is the whole point: the wing and the belly
   * are drawn on top of a solid accent body, so the accent at 30% alpha over the
   * accent composites to exactly the accent and the shape disappears. Stepping
   * toward the ground instead gives one hue at three lightnesses — which is the
   * same thing the light theme does with `--accent` / `--accent-lit` /
   * `--accent-ink`, arrived at for the same reason.
   *
   * Dark takes the larger step: its accent starts eleven stops clear of the page
   * and can afford to give some back.
   */
  shade: {
    glow: { wing: 0.3, belly: 0.44 },
    ink: { wing: 0.24, belly: 0.36 },
  },
} as const;
