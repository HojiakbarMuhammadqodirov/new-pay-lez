/**
 * Intro sequence timings, in milliseconds.
 *
 * The whole sequence is one idea: the mark lands, the name unfolds out of it,
 * and a bar underneath carries the wait. Stages overlap deliberately — the name
 * starts opening while the mark is still settling, which is what makes it read
 * as one move rather than three.
 *
 * The mark is never explicitly moved left. The brand row is centred and the
 * name grows from zero width beside it, so the mark is *pushed* left by exactly
 * half the name's final width. One animation drives both, and they cannot fall
 * out of sync.
 */
export const INTRO = {
  /** Mark pops in. */
  markIn: { delay: 80, duration: 420 },
  /** Name unfolds; the mark slides left as it does. */
  nameOpen: { delay: 420, duration: 720 },
  /** Loading bar appears, then fills. */
  barIn: { delay: 780, duration: 260 },
  barFill: { delay: 900, duration: 1350 },
  /** Everything fades out and the site is revealed. */
  outro: { delay: 2320, duration: 460 },

  /** Total run time; `onComplete` fires here. */
  duration: 2780,

  /** Final width of the name, in `ch` units — drives how far the mark travels. */
  nameWidthCh: 7.4,
} as const;
