/**
 * Food Cross's scene — Pico's market stall — in one place: the stall's colours,
 * the foods' colours, the timings of a swap and a cascade, and the proportions.
 *
 * ## Why this file names colours
 *
 * The same reason as 2048's `bakery/config.ts`, and the same footing as the
 * platformer's `LEVEL.palette`: everything **inside the stage** is a place — a
 * striped awning, string lights, a crate with a gingham cloth — and the page's
 * one mint on one ground cannot draw a place. The chrome round the stage (the
 * header, the bar, the note, Quit) still reads the site's tokens, and nothing
 * in `site.css` may read these.
 *
 * **The foods are the fourth exception's reason exactly**: the root `CLAUDE.md`
 * sanctions colour for things that *are* their colours (flags, the controller's
 * buttons, Pico), and an apple is red. They stopped being emoji so they could be
 * drawn in Pico's own flat style — and so that **shape carries as much as hue**:
 * a round apple with a leaf, a crescent croissant, a flat-bottomed cheese
 * wedge, a pizza slice pointing down, a ring doughnut, a long diagonal carrot.
 * No two share a silhouette, so the board reads in greyscale and to every
 * common colour-blindness; `games/stall/foods.ts` draws them.
 *
 * `dark` is the stall at dusk with the lights on; `light` is the same stall at
 * noon. Same objects, two lightings.
 */

export type StallTheme = 'dark' | 'light';

export interface StallPalette {
  /** Sky, top to bottom, and what stands against it. */
  skyTop: string;
  skyLow: string;
  /** The sun by day, the moon at night. */
  orb: string;
  orbGlow: string;
  /** Clouds by day, stars at night. */
  cloud: string;
  /** Rooftops far off, then trees nearer. */
  far: string;
  near: string;
  /** The awning's two stripes, their shaded undersides, and its rolled top. */
  stripeA: string;
  stripeB: string;
  stripeALow: string;
  stripeBLow: string;
  /** String lights: the wire, the bulbs, and their glow (dusk only, really). */
  wire: string;
  bulbs: readonly string[];
  glow: string;
  glowAlpha: number;
  /** Wood — posts, crate, counter — in three values. */
  wood: string;
  woodLow: string;
  woodLit: string;
  /** Nail heads in the crate. */
  nail: string;
  /** The gingham: plain, one band, both bands, and the weave over it. */
  cloth: string;
  clothBand: string;
  clothCross: string;
  weave: string;
  /** A food's contact shadow on the cloth. */
  shadow: string;
  /** Pennant flags on the posts. */
  flags: readonly string[];
  /** "+45" over a clear: the digits and the edge that lifts them off the cloth. */
  floater: string;
  floaterEdge: string;
  /** Pico's speech bubble for a combo, and its ink. */
  bubble: string;
  bubbleInk: string;
  /** Confetti at the end of a perfect round. */
  confetti: readonly string[];
}

/** One food's colours. `juice` is what splashes when it clears. */
export interface FoodColours {
  base: string;
  shade: string;
  lit: string;
  juice: string;
  /** A second material: a leaf, a stem, a crust, frosting, sauce… */
  extra: string;
  extraLow: string;
  /** A third, where the food has one (toppings, sprinkles, holes). */
  detail: string;
  detailLow: string;
}

export const STALL = {
  palette: {
    dark: {
      skyTop: '#0a1820',
      skyLow: '#163536',
      orb: '#f4ecd6',
      orbGlow: '#f4ecd6',
      cloud: '#d9f3ec',
      far: '#10282b',
      near: '#0e2223',
      stripeA: '#1f8c7b',
      stripeB: '#d8cfb6',
      stripeALow: '#13594f',
      stripeBLow: '#9f977f',
      wire: '#2f4644',
      bulbs: ['#ffd98a', '#ffe9b8', '#ffc65c'],
      glow: '#ffcf7a',
      glowAlpha: 0.32,
      wood: '#7d5232',
      woodLow: '#4f321d',
      woodLit: '#a06d43',
      nail: '#2c1b10',
      cloth: '#173b3a',
      clothBand: '#1d4847',
      clothCross: '#245553',
      weave: '#ffffff08',
      shadow: '#000000',
      flags: ['#58e9d4', '#ffc65c', '#ff9e8c', '#d8cfb6'],
      floater: '#ffe08a',
      floaterEdge: '#05201c',
      bubble: '#f4ecd6',
      bubbleInk: '#0b3a33',
      confetti: ['#58e9d4', '#ffd45c', '#ff9e8c', '#f4ecd6', '#22c3a1'],
    },
    light: {
      skyTop: '#bfe9ea',
      skyLow: '#eef8f3',
      orb: '#fff3c4',
      orbGlow: '#fff6d8',
      cloud: '#ffffff',
      far: '#cfe7df',
      near: '#b4dccd',
      stripeA: '#22a68a',
      stripeB: '#fff6e3',
      stripeALow: '#167a66',
      stripeBLow: '#e3d5b8',
      wire: '#7d958f',
      bulbs: ['#fff1c9', '#ffe7a8', '#ffffff'],
      glow: '#fff1c9',
      glowAlpha: 0.0,
      wood: '#dcab74',
      woodLow: '#b07a45',
      woodLit: '#efc893',
      nail: '#8c6238',
      cloth: '#fffaf0',
      clothBand: '#dcf2e9',
      clothCross: '#bfe6d8',
      weave: '#0e5a4d0c',
      shadow: '#0b3a33',
      flags: ['#22a68a', '#ffb534', '#ff9e8c', '#58cfb8'],
      floater: '#0b5f55',
      floaterEdge: '#ffffff',
      bubble: '#ffffff',
      bubbleInk: '#0b3a33',
      confetti: ['#22a68a', '#ffb534', '#ff9e8c', '#58cfb8', '#ffd45c'],
    },
  } satisfies Record<StallTheme, StallPalette>,

  /**
   * The six foods by kind (`Piece.t`), index-aligned with `copy.games.food.kinds`
   * and `FOODS` in `content.ts`: apple, croissant, cheese, pizza, doughnut,
   * carrot. One set for both lightings — they are objects, not chrome.
   */
  foods: [
    /* Apple. */
    { base: '#f2484b', shade: '#c22f3b', lit: '#ff7a72', juice: '#ff5a5a', extra: '#4cc46a', extraLow: '#2f9a4d', detail: '#7a4a26', detailLow: '#5a3418' },
    /* Croissant. */
    { base: '#efa64b', shade: '#c4762a', lit: '#ffd88d', juice: '#ffcf7a', extra: '#c06d24', extraLow: '#9a5219', detail: '#ffe2a8', detailLow: '#e09a45' },
    /* Cheese. */
    { base: '#ffcd3c', shade: '#e8a91f', lit: '#ffe58a', juice: '#ffe066', extra: '#ffe27a', extraLow: '#f0bb2c', detail: '#e3a51f', detailLow: '#c98a12' },
    /* Pizza: the slice's cheese, its crust (extra) and its pepperoni (detail). */
    { base: '#ffd15e', shade: '#f0a93a', lit: '#ffe9a0', juice: '#ff7a4a', extra: '#e6a45a', extraLow: '#c3833f', detail: '#d8433a', detailLow: '#a92e2a' },
    /* Doughnut: the dough, its frosting (extra) and the sprinkles (detail). */
    { base: '#e8a55c', shade: '#c27f3c', lit: '#f8c98a', juice: '#ff8db8', extra: '#ff8fbb', extraLow: '#e5679a', detail: '#fff7e0', detailLow: '#58e9d4' },
    /* Carrot. */
    { base: '#ff8a2b', shade: '#e0641a', lit: '#ffb36a', juice: '#ff9a3c', extra: '#4cc46a', extraLow: '#2f9a4d', detail: '#d65b16', detailLow: '#b84a10' },
  ] satisfies readonly FoodColours[],

  /**
   * The bomb — five in a line, and it clears every food of one kind — is a
   * chocolate truffle with a fuse: a dessert in a market of foods, and brown
   * reads against both cloths where the ink it used to be vanished into the
   * night one. Its sprinkles are every colour on the board, which is what it
   * does.
   */
  bomb: { base: '#74412a', shade: '#4a2514', lit: '#9a5d3c', cap: '#e0b964', capLow: '#a8822f', fuse: '#a8814f', spark: '#ffd45c', sparkHot: '#ff9a3a' },

  /** Sprinkle colours, on the doughnut and the truffle, in order. */
  sprinkles: ['#fff7e0', '#58e9d4', '#ffd45c', '#ff9ec0', '#7fe0c4'],

  /**
   * Motion, in milliseconds. The clear is a beat longer than the screen's old
   * 230ms because it now carries the pop *and* the juice — under ~220ms the
   * pop reads as a flicker. The fall is gravity: `fallBase` plus `fallPerCell`
   * per row dropped, eased in, with a squash on landing.
   */
  motion: {
    swap: 170,
    /** A swap that lines nothing up goes 40% of the way and comes back. */
    refuse: 300,
    clear: 270,
    fallBase: 140,
    fallPerCell: 42,
    /** The squash a landing food does. */
    land: 140,
    /** How long a striped food's beam crosses the board and fades. */
    beam: 440,
    /** A reshuffle: the old board out, the new one in. */
    shuffleOut: 220,
    shuffleIn: 320,
    floater: 820,
    cheer: 1300,
    /** Idle this long and Pico points out a move. */
    hintAfter: 8000,
  },

  /**
   * Proportions, as fractions of the board's side. **`frame` must match
   * `.fc-grid`'s inset in `site.css` (3.5cqi)** — the canvas draws the cells
   * where the buttons are, and the buttons are where that inset puts them.
   */
  layout: {
    frame: 0.035,
    /** A food's drawn size, of a cell — the drawings keep their own margin inside it. */
    food: 0.92,
    /** Pico's box, of the board — clamped in px. */
    pico: 0.19,
    picoMin: 58,
    picoMax: 96,
  },
} as const;
