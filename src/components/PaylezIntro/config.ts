/**
 * Intro sequence timings, in milliseconds.
 *
 * The sequence used to be three moves — a tile popped in, the name unfolded
 * beside it, a bar filled. It is one move now, because the brand is one thing:
 * the word. The tile is gone from the whole site (see `.brand` in `site.css`),
 * and an intro that opened on a logo the header does not have was introducing
 * the wrong mark.
 *
 * What replaces it is the name arriving a letter at a time — each one rising
 * out of focus into focus — with a hairline drawing itself underneath as the
 * last letters land. Nothing pops, nothing bounces, and there is no progress bar
 * pretending to measure a load that finished before the first frame.
 *
 * Stages overlap deliberately: the rule starts while the middle letters are
 * still arriving, which is what makes it read as one gesture rather than two.
 */
export const INTRO = {
  /**
   * The letters.
   *
   * `stagger` is the gap between neighbours, so the last letter starts at
   * `delay + (letters - 1) * stagger` and the run finishes `duration` later.
   * Six letters at 62ms is a little over a third of a second of arrival — fast
   * enough to read as one word, slow enough to see it being written.
   */
  letterIn: { delay: 140, duration: 760, stagger: 62 },

  /** The hairline under the name, drawn from the centre out. */
  ruleIn: { delay: 620, duration: 900 },

  /**
   * The whole lockup easing down from a hair oversize.
   *
   * A single slow scale across the entire sequence, which is what stops six
   * separately-animated letters from reading as six separate events: they all
   * sit on one surface that is still moving.
   */
  settle: { delay: 0, duration: 1900 },

  /** Everything fades out and the site is revealed. */
  outro: { delay: 2150, duration: 620 },

  /** Total run time; `onComplete` fires here. */
  duration: 2770,

  /** How many letters the word has — the CSS needs it for the last delay. */
  letters: 6,
} as const;
