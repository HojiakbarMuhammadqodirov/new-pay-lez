/**
 * The round's stage — the painted set behind every quiz and behind the result
 * card — and the one file its numbers and colours live in.
 *
 * ── colour ──
 *
 * **The scenery carries hues of its own, and this is the one place they are
 * named.** Same exception, same reasoning, as the platformer's `LEVEL.palette`
 * (`level/config.ts`): a set is *objects* — bunting, a globe, a map, gears, a
 * skyline — and on a two-colour page the only thing left to tell a pennant from
 * the rope it hangs on is a label, which scenery cannot have. The hues are that
 * palette's own family (coral, gold, the mint, sky blue) so the Play screen's
 * backdrop and the round played over it read as one world, with Pico's crest
 * gold as the warm light.
 *
 * What stays on the two-colour tokens is **everything a player reads or
 * presses**: the HUD pills, the question card, the option buttons, the result
 * figures — all DOM, all `site.css` tokens, all sitting on `--glass`. Nothing in
 * `site.css` may reach for a value below; the canvas is the only reader.
 *
 * Two rows, by tone rather than by theme name, because that is the axis that
 * matters to a painter: `glow` is drawn on near-black and can be bright, `ink`
 * on paper and has to be taken down to where a pale hue still has a silhouette.
 */

export interface ScenePalette {
  /** The backdrop, top to bottom. */
  skyTop: string;
  skyLow: string;
  /** Three silhouette depths, farthest first. */
  far: string;
  mid: string;
  near: string;
  /** Thin marks drawn over the set: meridians, grid, rope, outlines. */
  line: string;
  /** Warm light — lamps, lit windows, the sun, the spotlight's core. */
  warm: string;
  /** The page's accent, restated for the canvas (`THEMES[…].primary`). */
  accent: string;
  /** The festive four, cycled by bunting, confetti, puzzle pieces. */
  hues: readonly [string, string, string, string];
  /** A dot of light: stars, sparkles, glints. */
  spark: string;
  /** What the set is shaded toward at its edges. */
  shade: string;
}

export const STAGE_PALETTE: Record<'glow' | 'ink', ScenePalette> = {
  glow: {
    skyTop: '#07161a',
    skyLow: '#0d2a2c',
    far: '#10303a',
    mid: '#143f45',
    near: '#195056',
    line: '#58e9d4',
    warm: '#ffd45c',
    accent: '#58e9d4',
    hues: ['#ff7e6b', '#ffc65c', '#58e9d4', '#6fb4ff'],
    spark: '#e6fffb',
    shade: '#030a0b',
  },
  ink: {
    skyTop: '#dff2ee',
    skyLow: '#f5fbfa',
    far: '#c7e5df',
    mid: '#a9d6cf',
    near: '#8cc6bd',
    line: '#007a78',
    warm: '#f2b632',
    accent: '#089b99',
    hues: ['#e0604a', '#e0a526', '#0bb3ae', '#3d86d8'],
    spark: '#ffffff',
    shade: '#5f8f88',
  },
};

/** How strongly each layer is laid down, per tone — the set is scenery, the cards are the page. */
export const STAGE_ALPHA = {
  glow: { far: 0.85, mid: 0.9, near: 1, line: 0.14, spot: 0.16, hue: 0.78, spark: 0.9, edge: 0.55 },
  ink: { far: 0.75, mid: 0.8, near: 0.85, line: 0.16, spot: 0.2, hue: 0.72, spark: 0.95, edge: 0.18 },
} as const;

/**
 * What each round's set is, by the quiz it is behind.
 *
 * - `parade` — Guess the Flag: bunting over a fair, a globe rising, pennants on
 *   poles. The subject is every country's colours at once.
 * - `atlas` — Country & Capital: a sea chart, land, capitals pinned and joined
 *   by routes, a paper plane flying one.
 * - `lab` — Brain Games: graph paper, gears, puzzle pieces, a lamp having an idea.
 * - `city` — the local quiz: the skyline of the country the player lives in,
 *   because the quiz is about that place (`quizCountryFor`).
 * - `stage` — the result card, for every game: a podium under a spotlight.
 */
export type StageMotif = 'parade' | 'atlas' | 'lab' | 'city' | 'stage';

/** How the set answers a verdict, in milliseconds. */
export const STAGE_REACT = {
  /** A right answer brightens the spotlight and throws sparks off the host. */
  rightMs: 1100,
  /** A wrong one dims the set for a beat — no colour to reach for, so less light. */
  wrongMs: 800,
  /** Peak darkening of a wrong answer, 0..1. */
  wrongDim: 0.28,
  /** Sparks thrown off the host on a right answer. */
  sparks: 14,
} as const;

/**
 * The quiz clock's last seconds, drawn by weight and a pulse rather than a hue.
 * Three, as the quiz always had (`.round-clock[data-low]`).
 */
export const QUIZ_LOW_SECONDS = 3;

/**
 * The result figure counting up from nothing.
 *
 * `delayMs` lets the card land before the number moves — a count that starts
 * while the card is still fading in is spent before anybody looks at it.
 * `durationMs` scales with the figure up to a cap: +3 should not crawl for a
 * second and a half, and +180 should not blur past in 400ms.
 */
export const COUNT_UP = { delayMs: 260, minMs: 520, maxMs: 1300, perPointMs: 9 } as const;

/**
 * The celebration, by mood. Confetti for a perfect round; a puff of Pico's own
 * feathers for a good one; a small rain cloud for a round that went badly.
 * Counts are particles; `ms` is how long the burst lives before the canvas
 * stops and clears.
 */
export const BURST = {
  confetti: { count: 84, feathers: 10, ms: 2600, gravity: 900, spread: 1.15 },
  puff: { count: 0, feathers: 12, ms: 1700, gravity: 260, spread: 1.5 },
  /** Drizzle is drawn by the stage itself, not the burst — it lasts as long as the card. */
} as const;

/**
 * Who counts as having had a good round, for Pico's face on the card.
 *
 * `correct / total` because every game reports both — five questions, five
 * fifths of a perfect arcade round, gaps of a flight against its target — so one
 * ratio covers all sixteen without a game teaching the card its rules.
 */
export const MOOD = { happyAt: 0.6, sadBelow: 0.3 } as const;
