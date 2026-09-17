/**
 * One sentence, one line — the half of that rule CSS cannot know.
 *
 * Every hero on this site renders its headline as a `.ln` block per sentence,
 * so the sentences never share a line. What was not true is the other half: a
 * sentence too long for the measure wrapped *inside* its own block, and the
 * copy read
 *
 *     A hundred
 *     questions.
 *
 * `site.css` caps the headline's font size against the measure, the face's
 * character advance and **how many characters the longest sentence has** — and
 * that last number is the one a stylesheet cannot have. It is a different value
 * in each of five languages and on each of six heroes: 20 in English, 17 in
 * Uzbek and Polish, 18 in Russian, 14 in Ukrainian, on Relocate alone. A
 * constant in CSS would be wrong somewhere by construction, and wrong in the
 * direction that wraps.
 *
 * So the component measures its own copy and publishes it. Which makes this the
 * cheapest possible version of the repo's own rule that responsive is a
 * measurement rather than a breakpoint somebody liked: the measurement is the
 * string length, taken at render, of the strings about to be drawn.
 *
 * `[...line].length` rather than `.length`, because `.length` counts UTF-16
 * code units — an emoji or any astral character would count twice and shrink
 * the headline for a character that is one glyph wide. None of the current copy
 * has one; the next translation might.
 */
import type { CSSProperties } from 'react';

/** The longest sentence's length, in characters. */
export const longestLine = (lines: readonly string[]): number =>
  lines.reduce((most, line) => Math.max(most, [...line.trim()].length), 0);

/**
 * The style object for a hero's `<h1>`.
 *
 * A custom property rather than a `font-size`, so the *decision* stays in
 * `site.css` where the measure, the clamp and the advance already live — this
 * only supplies the one fact the sheet cannot see. The same division of labour
 * `heroFloor.ts` makes for the globe, and `pointer.ts` for the plan cards.
 *
 * Returns `undefined` for empty copy rather than `--ln-chars: 0`, which would
 * divide by zero and collapse the headline to nothing.
 */
export function lineCap(lines: readonly string[]): CSSProperties | undefined {
  const chars = longestLine(lines);
  return chars > 0 ? ({ '--ln-chars': chars } as CSSProperties) : undefined;
}
