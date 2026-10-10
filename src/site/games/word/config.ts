import type { ThemeName } from '../../theme/context';

/**
 * Word Builder's world: Pico's study, at night in dark and in the morning in
 * light.
 *
 * **This is a scene palette, the same kind of exception as `LEVEL.palette`.**
 * The page's chrome — the header row, the buttons, the verdict, every word of
 * copy — stays on the site's tokens and its one accent. What is drawn here is
 * *things*: a teal-stained desk, ivory letter tiles, a paper note, a window.
 * A thing is its material, and a desk drawn in `--accent` at 8% is a tint, not a
 * desk. So the materials have colours of their own, chosen to sit inside the
 * brand rather than beside it: the wood is the accent's hue taken dark and
 * desaturated (stained, not painted), the tiles and the paper are the warm
 * off-white of the bird's belly and the moon, and the only warm light is Pico's
 * own crest yellow, at low alpha, as lamplight. Nothing here is a new hue a
 * player could mistake for a state — right is still the accent, and it is the
 * only mint on the desk when it lands.
 *
 * **Applied from TypeScript, never named in `site.css`.** `wordSceneStyle`
 * turns the palette into `--wb-*` custom properties on the round, and the sheet
 * only ever reads them — which keeps the rule that nothing below the `:root`
 * blocks names a colour, and keeps both themes' materials in this one file.
 * The canvas half (`desk.ts`) reads the same object.
 *
 * Light is not dark with the lights on. Paper sets a different bar: a tile
 * needs its silhouette from a *darker* side and a shadow, because ivory on a
 * pale desk has no value difference to stand on, and the wood goes to a sage
 * that is still the accent's hue — a honey oak would have been the one warm
 * slab on an otherwise cyan page.
 */
export interface WordScene {
  /* ── the room (canvas) ── */
  wallTop: string;
  wallBottom: string;
  /** The lettered wallpaper — glyphs at a whisper. */
  wallGlyph: string;
  windowFrame: string;
  windowShade: string;
  skyTop: string;
  skyBottom: string;
  /** The moon in dark, the sun in light. */
  orb: string;
  orbGlow: string;
  /** Stars in dark, clouds in light. */
  speck: string;
  /** The lamp's warm light on the wall. */
  glow: string;
  /** Dust in the light. */
  mote: string;
  vignette: string;

  /* ── the furniture (DOM, through custom properties) ── */
  shelf: string;
  shelfHi: string;
  shelfLo: string;
  deskFar: string;
  deskNear: string;
  /** The far edge where the desk meets the wall, catching the light. */
  deskLip: string;
  /** The lamp's pool on the desk. */
  pool: string;
  grain: string;
  rack: string;
  rackHi: string;
  rackLo: string;
  groove: string;
  grooveShade: string;
  tile: string;
  tileHi: string;
  tileSide: string;
  tileInk: string;
  tileGlint: string;
  /** A tile on a wrong row: the same ivory, a step greyer. */
  tileDim: string;
  /** Where a spent tile stood. */
  socket: string;
  socketInk: string;
  /** The darker edge a *right* tile stands on — the accent's own side. */
  rightSide: string;
  paper: string;
  paperInk: string;
  paperMut: string;
  tape: string;
  shadow: string;
  lampShade: string;
  lampShadeHi: string;
  bulb: string;
  bookA: string;
  bookB: string;
  bookC: string;
  pot: string;
  potHi: string;
  leaf: string;
  leafHi: string;
  /** The tea's steam on the desk. */
  steam: string;
}

export const WORD_SCENE: Record<ThemeName, WordScene> = {
  dark: {
    wallTop: '#0b1719',
    wallBottom: '#11272a',
    wallGlyph: 'rgba(88, 233, 212, 0.04)',
    windowFrame: '#1f3d3b',
    windowShade: '#0a1516',
    skyTop: '#06121c',
    skyBottom: '#0e3039',
    orb: '#f1ead0',
    orbGlow: 'rgba(241, 234, 208, 0.16)',
    speck: '#e4fff8',
    glow: 'rgba(255, 212, 92, 0.11)',
    mote: 'rgba(255, 236, 196, 0.5)',
    vignette: 'rgba(0, 0, 0, 0.42)',

    shelf: '#2b4744',
    shelfHi: '#3d625c',
    shelfLo: '#132625',
    deskFar: '#1c3633',
    deskNear: '#132624',
    deskLip: '#3a625b',
    pool: 'rgba(255, 214, 128, 0.09)',
    grain: 'rgba(0, 0, 0, 0.2)',
    rack: '#29504a',
    rackHi: '#3a6b63',
    rackLo: '#11231f',
    groove: '#11231f',
    grooveShade: 'rgba(0, 0, 0, 0.6)',
    tile: '#eee6d2',
    tileHi: '#fbf6ea',
    tileSide: '#b3a383',
    tileInk: '#14302c',
    tileGlint: 'rgba(255, 255, 255, 0.8)',
    tileDim: '#c9c1ae',
    socket: 'rgba(0, 0, 0, 0.24)',
    socketInk: 'rgba(238, 230, 210, 0.2)',
    rightSide: '#2a9c8c',
    paper: '#ece5d1',
    paperInk: '#172d2a',
    paperMut: '#5f6d68',
    tape: 'rgba(88, 233, 212, 0.42)',
    shadow: 'rgba(0, 0, 0, 0.5)',
    lampShade: '#1f5a52',
    lampShadeHi: '#2f8074',
    bulb: '#fff0c2',
    bookA: '#1d7a6c',
    bookB: '#e6dabd',
    bookC: '#0f4c46',
    pot: '#d9cdb1',
    potHi: '#efe6d0',
    leaf: '#2e9e83',
    leafHi: '#4fc4a3',
    steam: 'rgba(240, 236, 220, 0.3)',
  },
  light: {
    wallTop: '#f6faf8',
    wallBottom: '#e3efeb',
    wallGlyph: 'rgba(0, 122, 120, 0.065)',
    windowFrame: '#ffffff',
    windowShade: '#c4d9d3',
    skyTop: '#a9dde6',
    skyBottom: '#e6f7f4',
    orb: '#fff4c8',
    orbGlow: 'rgba(255, 236, 170, 0.55)',
    speck: '#ffffff',
    glow: 'rgba(255, 226, 150, 0.2)',
    mote: 'rgba(214, 160, 40, 0.35)',
    vignette: 'rgba(4, 32, 31, 0.08)',

    shelf: '#c3dbd4',
    shelfHi: '#f2f8f6',
    shelfLo: '#8fb3a9',
    deskFar: '#cbe1da',
    deskNear: '#b6d3cb',
    deskLip: '#eff7f4',
    pool: 'rgba(255, 240, 190, 0.38)',
    grain: 'rgba(4, 32, 31, 0.07)',
    rack: '#9cc4ba',
    rackHi: '#bcdad2',
    rackLo: '#6f9d92',
    groove: '#86ada3',
    grooveShade: 'rgba(4, 32, 31, 0.32)',
    tile: '#fffaf0',
    tileHi: '#ffffff',
    tileSide: '#d2c3a2',
    tileInk: '#0e3431',
    tileGlint: '#ffffff',
    tileDim: '#e6e0d3',
    socket: 'rgba(4, 32, 31, 0.1)',
    socketInk: 'rgba(4, 32, 31, 0.2)',
    rightSide: '#05706e',
    paper: '#fffdf6',
    paperInk: '#0f2b28',
    paperMut: '#56706a',
    tape: 'rgba(8, 155, 153, 0.32)',
    shadow: 'rgba(4, 32, 31, 0.2)',
    lampShade: '#0f8a80',
    lampShadeHi: '#27a898',
    bulb: '#fff6d6',
    bookA: '#178a7b',
    bookB: '#f3ead2',
    bookC: '#0d5d56',
    pot: '#f4ede0',
    potHi: '#ffffff',
    leaf: '#239a80',
    leafHi: '#49bf9e',
    steam: 'rgba(4, 32, 31, 0.16)',
  },
};

/** How the room moves. Distances in CSS pixels, times in seconds. */
export const WORD_MOTION = {
  /** Dust in the lamp light. Enough to read as air, few enough not to read as snow. */
  motes: 18,
  /** Pixels a second a mote drifts upward — warm air rising off the lamp. */
  moteRise: 5,
  /** How far a mote wanders side to side, and how slowly. */
  moteSway: 9,
  moteSwayPeriod: 7,
  /** Stars in the window: how many, and how long one twinkle takes. */
  stars: 9,
  twinklePeriod: 3.4,
  /** Clouds crossing the morning window, in pixels a second. */
  cloudDrift: 3,
} as const;

/**
 * How the lettered wallpaper is set: one glyph per cell, at this size, from
 * the three alphabets the lists are in — the room is papered with what the
 * game is made of.
 */
export const WORD_WALLPAPER = {
  cell: 46,
  glyphs: 'AĄBCĆDEĘŁMNŃOÓSŚZŻЖДЯФЮ',
  /** Each glyph turns by up to this many radians, so the paper is not a grid of type. */
  turn: 0.35,
} as const;
