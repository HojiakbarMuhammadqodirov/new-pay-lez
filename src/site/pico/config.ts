/**
 * How `AnimatedPico` lives: blink, bob and beat.  ── API ──
 *
 * Behaviour, not art — these hold whichever drawing is behind `paint.ts`. All
 * distances are design units (the 100-unit box), so the motion scales with the
 * bird instead of being a fixed number of pixels that is a tremor at 200px and
 * a leap at 24.
 */
export const PICO_MOTION = {
  /**
   * One loop of idle life, in seconds — the app's `AnimatedPico` runs a
   * four-second controller and blinks once per turn, which is about how often a
   * bird that is not asleep does.
   */
  loop: 4,

  /**
   * The blink, as fractions of `loop`. The app shuts the eye for 0.95–0.98 (120
   * ms) as a switch; here the lid takes 40 ms down and 40 ms up either side of
   * an 80 ms shut, because a switch at 120 Hz is one frame of pupil and then
   * none — it reads as a flicker, not a blink.
   */
  blink: { from: 0.945, shut: 0.955, open: 0.975, to: 0.985 },

  /** Wing beats a second in the `'flap'` pose — the app's default. */
  beatsPerSecond: 3,

  /**
   * Standing poses sink and rise by `depth` units over `period` seconds.
   *
   * Downward only, from rest: the crest already reaches within two units of
   * the box's top (and within one in `'hit'`), the tail within 2.4 of its
   * bottom, so a bob centred on rest would clip the crest and a canvas sized to
   * the box has no room above. `period` divides `loop` so the bob and the blink
   * keep the same phase relation every turn.
   */
  bob: { depth: 1.5, period: 2 },

  /**
   * In `'flap'` the body rides the beat: highest as the downstroke finishes,
   * lowest at the top of the upstroke, by this many units. Smaller than the
   * bob, because it runs three times a second.
   */
  lift: 1.2,

  /**
   * How far outside the viewport a Pico keeps animating. A little, so one
   * scrolled into view is already moving rather than starting as it arrives.
   */
  rootMargin: '10% 0px',
} as const;
