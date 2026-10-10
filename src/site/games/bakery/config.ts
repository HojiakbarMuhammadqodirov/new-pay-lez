/**
 * 2048's scene — Pico's bakery counter — in one place: its colours, its tile
 * ladder, its timings and its proportions.
 *
 * ## Why this file names colours at all
 *
 * The page is two colours (root `CLAUDE.md`), and every piece of *chrome* on the
 * 2048 screen still is: the header, the bar, the notes and the buttons read the
 * site's tokens. What is drawn **inside the stage** is a place — a counter, a
 * wall, a tray, the tiles on it — and a place drawn in one mint on one ground is
 * a diagram of a place. So this game carries a scene palette the way the
 * platformer behind L-Earn carries `LEVEL.palette`: materials (wood, glaze,
 * enamel, brass) chosen to sit **around** the brand's teal and Pico's own
 * orange-and-yellow, never beside them as a new accent. Nothing in `site.css`
 * may read these; they reach the canvas from TypeScript only.
 *
 * `dark` is the same counter after closing — lamps on, wall in the ink — and
 * `light` is it in the morning. They are two lightings of one room, not two
 * rooms: every entry exists in both and means the same object.
 *
 * ## The tile ladder
 *
 * The classic game gives every value its own hue. Here a value is a **glaze**,
 * and the glazes climb through the bird: porcelain and cream at 2 and 4, mint
 * and Pico's own teals from 8 to 256, then his crest yellow, his bill orange,
 * and gold at 2048 — so a board's biggest tile *looks* like the expensive one
 * and the run toward it reads as "getting closer to Pico". Colour is never the
 * only signal: the number is always on the face, and the ornaments climb too
 * (a rim from 8, sparkles from 256, a crown at 2048), so the ladder survives a
 * player who cannot tell mint from yellow.
 *
 * Every `ink` was chosen against its own `face` for large bold text (WCAG 3:1
 * for ≥ 19px bold; all clear 4:1, most clear 6:1).
 */

export type BakeryTheme = 'dark' | 'light';

/** One glaze. */
export interface TileGlaze {
  /** The top of the face. */
  face: string;
  /** The bottom of the face — a glaze pools darker where it runs down. */
  faceLow: string;
  /** The tile's thickness, seen below the face. */
  lip: string;
  /** The number. */
  ink: string;
  /** A gold inlay around the face (256, and 2048 up). */
  gilt?: boolean;
  /** Twinkles at the corners (256 up). */
  sparkle?: boolean;
  /** A small crown over the number (2048 up). */
  crown?: boolean;
  /**
   * The crown takes the number's own colour instead of brass — for a tile whose
   * number is already gold, where a brass crown over it would read as a second,
   * duller metal. Stated here rather than tested against a hex in the painter.
   */
  crownInInk?: boolean;
}

export interface BakeryPalette {
  /** The wall, top to bottom. */
  wallTop: string;
  wallLow: string;
  /** The subway tiles under the shelf, as hairlines over the wall. */
  tileLine: string;
  /** The wall's soft vignette, at the edges of the stage. */
  vignette: string;
  /** Light pooling under each lamp (drawn additively in dark, as a wash in light). */
  lampPool: string;
  lampPoolAlpha: number;
  /** The garland. */
  string: string;
  pennants: readonly string[];
  /** Lamps. */
  cord: string;
  shade: string;
  shadeLow: string;
  shadeLit: string;
  bulb: string;
  /** Wood — the shelf, the counter, the tray's frame — in three values. */
  wood: string;
  woodLow: string;
  woodLit: string;
  /** The tray's corner rivets and the gilt inlay on the top tiles. */
  brass: string;
  brassLow: string;
  /** The counter's front, below its top edge. */
  counterFront: string;
  counterFrontLow: string;
  /** The tray's enamel bed and its sixteen sockets. */
  bed: string;
  bedLow: string;
  socket: string;
  socketShade: string;
  /** Glass jars, and what is in them. */
  glass: string;
  glassEdge: string;
  sweets: readonly string[];
  /** The cup on the counter, and its saucer. */
  cup: string;
  cupLow: string;
  coffee: string;
  steam: string;
  /** The plant on the shelf. */
  leaf: string;
  leafLow: string;
  pot: string;
  potLow: string;
  /** The chalkboard menu: its slate and the chalk on it. */
  slate: string;
  chalk: string;
  /** The wall clock's hands (the second hand is a pennant colour). */
  hand: string;
  /** Behind Pico's framed portrait. */
  portrait: string;
  /** Motes in the lamplight. */
  mote: string;
  /** Shadows the scene casts on itself. */
  shadow: string;
  /** "+16" over a merge: the digits and the edge that lifts them off any tile. */
  floater: string;
  floaterEdge: string;
  /** Confetti for a new best tile. */
  confetti: readonly string[];
  /** Tiles. Same objects in both lights, a touch quieter at night. */
  tiles: Readonly<Record<number, TileGlaze>>;
  /** Anything past the table (4096, 8192, …). */
  tileBeyond: TileGlaze;
}

const TILES_DAY: Record<number, TileGlaze> = {
  2: { face: '#fffaf0', faceLow: '#f5ead3', lip: '#d8c6a2', ink: '#1d564c' },
  4: { face: '#fbedcc', faceLow: '#f2deb0', lip: '#cfb181', ink: '#1d564c' },
  8: { face: '#d8f6ea', faceLow: '#bdeedb', lip: '#86cbb3', ink: '#0d4a40' },
  16: { face: '#a3ecd7', faceLow: '#86e0c5', lip: '#4cb597', ink: '#0a4037' },
  32: { face: '#6ddcc2', faceLow: '#4fd0b2', lip: '#25a487', ink: '#06382f' },
  64: { face: '#25bf9e', faceLow: '#1aac8d', lip: '#0f7f68', ink: '#03231d' },
  128: { face: '#11927a', faceLow: '#0c7f69', lip: '#065546', ink: '#ffffff' },
  256: { face: '#0b6157', faceLow: '#085048', lip: '#03332e', ink: '#ffffff', gilt: true, sparkle: true },
  512: { face: '#ffe07a', faceLow: '#ffd04c', lip: '#d39f28', ink: '#4a3000', sparkle: true },
  1024: { face: '#ffbe55', faceLow: '#ffa733', lip: '#cf7816', ink: '#422100', sparkle: true },
  2048: { face: '#ffe995', faceLow: '#f7b733', lip: '#c48214', ink: '#3d2200', gilt: true, sparkle: true, crown: true },
};

/*
 * Night keeps the glazes and takes the porcelain down a step: a near-white tile
 * under a lamp on a dark wall is the brightest thing on the page by a distance,
 * and the 2 is the tile there are most of.
 */
const TILES_NIGHT: Record<number, TileGlaze> = {
  ...TILES_DAY,
  2: { face: '#efe6d2', faceLow: '#e2d4b8', lip: '#a8946f', ink: '#1d564c' },
  4: { face: '#ecd9ae', faceLow: '#dfc68f', lip: '#a88a57', ink: '#1d564c' },
  8: { face: '#c6eddd', faceLow: '#aee3cd', lip: '#6fb39b', ink: '#0d4a40' },
};

const BEYOND: TileGlaze = {
  face: '#183f3a',
  faceLow: '#0d2a26',
  lip: '#04140f',
  ink: '#ffd45c',
  gilt: true,
  sparkle: true,
  crown: true,
  crownInInk: true,
};

export const BAKERY = {
  palette: {
    dark: {
      wallTop: '#0e2324',
      wallLow: '#0b1a1b',
      tileLine: '#ffffff0b',
      vignette: '#000000',
      lampPool: '#ffcf7a',
      lampPoolAlpha: 0.13,
      string: '#3d5755',
      pennants: ['#58e9d4', '#efe6d2', '#ffc65c', '#22a68a'],
      cord: '#253a39',
      shade: '#1d7a6b',
      shadeLow: '#0f4e44',
      shadeLit: '#38a893',
      bulb: '#ffe7ad',
      wood: '#6b442a',
      woodLow: '#432918',
      woodLit: '#8d5e3b',
      brass: '#e2b45a',
      brassLow: '#9c7228',
      counterFront: '#3e2716',
      counterFrontLow: '#2a190d',
      bed: '#173634',
      bedLow: '#112927',
      socket: '#12302d',
      socketShade: '#0a1d1b',
      glass: '#bdeee4',
      glassEdge: '#e7fffa',
      sweets: ['#ff9e8c', '#ffd45c', '#58e9d4', '#efe6d2'],
      cup: '#e8e0cc',
      cupLow: '#b9ad92',
      coffee: '#3a2416',
      steam: '#e7fffa',
      leaf: '#2fa37a',
      leafLow: '#1d7656',
      pot: '#c0643a',
      potLow: '#8f4528',
      slate: '#1f2b29',
      chalk: '#e9f3ef',
      hand: '#203330',
      portrait: '#cdeee6',
      mote: '#ffe7ad',
      shadow: '#000000',
      floater: '#ffe08a',
      floaterEdge: '#05201c',
      confetti: ['#58e9d4', '#ffd45c', '#ff9e8c', '#efe6d2', '#22c3a1'],
      tiles: TILES_NIGHT,
      tileBeyond: BEYOND,
    },
    light: {
      wallTop: '#eef7f2',
      wallLow: '#e1efe8',
      tileLine: '#0e5a4d14',
      vignette: '#0e5a4d',
      lampPool: '#fff4d6',
      lampPoolAlpha: 0.5,
      string: '#9db8b0',
      pennants: ['#22a68a', '#ffb534', '#ff9e8c', '#58cfb8'],
      cord: '#6f8a84',
      shade: '#22a68a',
      shadeLow: '#13806a',
      shadeLit: '#58cfb8',
      bulb: '#fff4d6',
      wood: '#d49e66',
      woodLow: '#a8723f',
      woodLit: '#ebc08d',
      brass: '#f0c56a',
      brassLow: '#b58a35',
      counterFront: '#b8834f',
      counterFrontLow: '#986535',
      bed: '#2b6a61',
      bedLow: '#225850',
      socket: '#245c54',
      socketShade: '#173f39',
      glass: '#d9f5ee',
      glassEdge: '#ffffff',
      sweets: ['#ff9e8c', '#ffc94a', '#22c3a1', '#fff6e0'],
      cup: '#fffaf0',
      cupLow: '#d8c6a2',
      coffee: '#5a3a22',
      steam: '#ffffff',
      leaf: '#3fb98a',
      leafLow: '#258a63',
      pot: '#e07a4a',
      potLow: '#b85a30',
      slate: '#2c3b37',
      chalk: '#f4faf7',
      hand: '#203330',
      portrait: '#d9f5ee',
      mote: '#ffffff',
      shadow: '#0b3a33',
      floater: '#0b5f55',
      floaterEdge: '#ffffff',
      confetti: ['#22a68a', '#ffb534', '#ff9e8c', '#58cfb8', '#ffd45c'],
      tiles: TILES_DAY,
      tileBeyond: BEYOND,
    },
  } satisfies Record<BakeryTheme, BakeryPalette>,

  /**
   * Motion, in milliseconds. The slide is the classic game's tempo: under
   * ~100ms a swipe looks like a jump cut, over ~150ms a fast player is swiping
   * into a board that has not finished moving — and input is not held for the
   * animation, only for the server's reply, so a long slide would be a lie
   * about where the tiles are.
   */
  motion: {
    slide: 115,
    /** The merged tile swells and settles, starting as the slide lands. */
    merge: 190,
    /** A new tile grows in once the slide has finished. */
    spawn: 190,
    /** "+16" rising off a merge. */
    floater: 720,
    /** A swipe that moves nothing nudges the tray that way and springs back. */
    nudge: 220,
    /** How long Pico celebrates a new best tile, or a big merge. */
    cheer: 1500,
    /** …and the little hop he does on any merge of `hopFrom` or more. */
    hop: 380,
  },

  /** Pico jumps on a merge that makes at least this, and cheers on a new best from `cheerFrom`. */
  hopFrom: 32,
  cheerFrom: 64,

  /**
   * Proportions, as fractions of the board's side so the scene is one drawing
   * at every width.
   */
  layout: {
    /** The wooden frame around the bed. */
    frame: 0.045,
    /** Gap between sockets (and between a socket and the frame). */
    gap: 0.028,
    /** Tile corner radius, of a tile. */
    tileRadius: 0.17,
    /** Tile thickness (the lip), of a tile. */
    lip: 0.075,
    /** Pico's box, of the board — clamped by `picoMin` / `picoMax` in px. */
    pico: 0.27,
    picoMin: 66,
    picoMax: 120,
  },

  /** Particles. */
  crumbs: {
    /** Per merge, plus one per doubling of the value. */
    base: 6,
    /** Seconds of life. */
    life: 0.65,
    gravity: 900,
    /** At most this many in the air; a new swipe drops the oldest past it. */
    cap: 90,
  },
} as const;

export type BakeryConfig = typeof BAKERY;
