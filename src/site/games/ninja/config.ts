/**
 * Pico Ninja's scene — a night market seen from a dojo's veranda — in one
 * place: its colours, the foods' colours, its proportions and its timings.
 * `scene.ts` paints from this and nothing else; `FoodNinja.tsx` keeps the rules
 * (the schedule, the clock, the cut, the reporting) exactly as they were, and
 * `ninjaField.ts` — the server's flight paths — is not touched by any of it.
 *
 * ## Why this file names colours at all
 *
 * Every piece of *chrome* on the screen — header, bar, veils, Quit — reads the
 * site's tokens. What is drawn **inside the field** is a place and things in
 * it, and both are allowed their own colours the way the platformer behind
 * L-Earn carries `LEVEL.palette`:
 *
 * - **the place** — sky, moon, roofs, lanterns, the veranda's boards — is chosen
 *   to sit around the brand's teal and Pico's own orange and yellow: deep teal
 *   night, amber lantern light, a cream moon; in the light theme, the same
 *   veranda at dusk-blue morning with paper lanterns unlit and blossom in the
 *   eaves. Two lightings of one place: every entry exists in both.
 * - **the foods are objects that are their colours** — an apple is red, a
 *   carrot orange — the same argument that lets a flag emoji be its colours.
 *   They were emoji; they are drawn now, in Pico's flat style, so they can be
 *   cut in half, and their colours live here with the scene's.
 *
 * The blade is the one thing in the field that is the **brand's** mint, on
 * purpose: it is the player's hand, and the player's hand on this site is the
 * accent.
 *
 * Nothing in `site.css` may read any of this; it reaches the canvas from
 * TypeScript only.
 */

export type NinjaTheme = 'dark' | 'light';

/** One food: its body, the face a cut shows, and what flies out. */
export interface FoodColours {
  /** The cut face. */
  flesh: string;
  /** A ring of skin around the cut face. */
  skin: string;
  /** Detail on the cut face: seeds, a core, a swirl. */
  core: string;
  /** Juice, crumbs or sprinkles — the splash. */
  juice: readonly string[];
}

export interface NinjaPalette {
  /** The sky, top to horizon. */
  skyTop: string;
  skyMid: string;
  skyLow: string;
  /** Moon (dark) or sun (light), its halo, and how strongly the halo glows. */
  orb: string;
  orbHalo: string;
  orbHaloAlpha: number;
  /** Cloud wisps. */
  cloud: string;
  cloudAlpha: number;
  star: string;
  /** Hills and roofs, far to near; the town's walls under the roofs. */
  hillFar: string;
  hillNear: string;
  roof: string;
  roofLit: string;
  wall: string;
  /** A lit window, and the town's glow on the horizon. */
  window: string;
  townGlow: string;
  townGlowAlpha: number;
  /** Timber: the veranda's posts, beam and boards. */
  wood: string;
  woodLit: string;
  woodLow: string;
  woodGrain: string;
  /** Paper: the shoji panel and the lanterns' bodies. */
  paper: string;
  paperLit: string;
  lattice: string;
  /** Lanterns: two kinds of paper, their caps, their light. */
  lanternA: string;
  lanternB: string;
  lanternRib: string;
  lanternCap: string;
  lanternGlow: string;
  lanternGlowAlpha: number;
  /** The string they hang from. */
  cord: string;
  /** Bokeh — soft out-of-focus lights — and their two colours. */
  bokeh: readonly [string, string];
  bokehAlpha: number;
  /** Embers rising at night, petals falling in the morning. */
  drift: string;
  driftAlpha: number;
  /** Blossom in the eaves (light) — and at night the same branch, darker. */
  blossom: string;
  blossomLit: string;
  branch: string;
  /** Pico's ninja kit: headband, its plate, the sword on his back. */
  band: string;
  bandLit: string;
  plate: string;
  plateLow: string;
  hilt: string;
  hiltWrap: string;
  sheath: string;
  sheathLit: string;
  /** The blade: a soft wide glow and a bright core, and whether light adds. */
  bladeGlow: string;
  bladeCore: string;
  /** The flash along a cut. */
  slash: string;
  shadow: string;
  vignette: string;
  /** "3 in one swipe!" — face and edge. */
  floater: string;
  floaterEdge: string;
  /** Whether glows add light (night) or lay a wash (day). */
  additive: boolean;
}

export const NINJA_PALETTES: Readonly<Record<NinjaTheme, NinjaPalette>> = {
  dark: {
    skyTop: '#061620',
    skyMid: '#0b2a33',
    skyLow: '#164043',
    orb: '#f4f0d6',
    orbHalo: '#d8fff1',
    orbHaloAlpha: 0.22,
    cloud: '#2b5257',
    cloudAlpha: 0.55,
    star: '#e8fff8',
    hillFar: '#0f3236',
    hillNear: '#0b2629',
    roof: '#081d20',
    roofLit: '#1a3d3e',
    wall: '#0b2427',
    window: '#ffc867',
    townGlow: '#ff9f4a',
    townGlowAlpha: 0.16,
    wood: '#4a3226',
    woodLit: '#7a5741',
    woodLow: '#2c1d16',
    woodGrain: '#23170f',
    paper: '#f3d9a4',
    paperLit: '#fff1cf',
    lattice: '#5a3d2a',
    lanternA: '#ff7a45',
    lanternB: '#ffc24f',
    lanternRib: '#a8401e',
    lanternCap: '#2a1d16',
    lanternGlow: '#ffb35c',
    lanternGlowAlpha: 0.42,
    cord: '#1d140f',
    bokeh: ['#ffb45c', '#7ff2d8'],
    bokehAlpha: 0.14,
    drift: '#ffc46b',
    driftAlpha: 0.85,
    blossom: '#c4687a',
    blossomLit: '#f3a6b4',
    branch: '#2b1c16',
    band: '#1c2a33',
    bandLit: '#3d5260',
    plate: '#ffd45c',
    plateLow: '#b58a1c',
    hilt: '#2a2228',
    hiltWrap: '#d9c08e',
    sheath: '#3b1f2b',
    sheathLit: '#6c3b4f',
    bladeGlow: '#58e9d4',
    bladeCore: '#f2fffc',
    slash: '#ffffff',
    shadow: 'rgba(0, 0, 0, 0.35)',
    vignette: 'rgba(2, 10, 14, 0.6)',
    floater: '#fff6dc',
    floaterEdge: '#2b1a05',
    additive: true,
  },
  light: {
    skyTop: '#bfe3e4',
    skyMid: '#e3f1e8',
    skyLow: '#fbecd2',
    orb: '#fff6dc',
    orbHalo: '#fff1c4',
    orbHaloAlpha: 0.55,
    cloud: '#ffffff',
    cloudAlpha: 0.75,
    star: '#ffffff',
    hillFar: '#a9cdc8',
    hillNear: '#86b5ae',
    roof: '#5e8e88',
    roofLit: '#7aa7a0',
    wall: '#e4ece3',
    window: '#ffd98a',
    townGlow: '#ffd59a',
    townGlowAlpha: 0.0,
    wood: '#9a6a46',
    woodLit: '#c99a70',
    woodLow: '#6c4a31',
    woodGrain: '#5a3c27',
    paper: '#fbf1dc',
    paperLit: '#ffffff',
    lattice: '#7d5638',
    lanternA: '#f2643e',
    lanternB: '#f6b53e',
    lanternRib: '#a8401e',
    lanternCap: '#3a2a20',
    lanternGlow: '#ffd27a',
    lanternGlowAlpha: 0.0,
    cord: '#4a3324',
    bokeh: ['#ffffff', '#ffe7b3'],
    bokehAlpha: 0.22,
    drift: '#f7a3b2',
    driftAlpha: 0.9,
    blossom: '#f59aab',
    blossomLit: '#ffd0d8',
    branch: '#5b3b2a',
    band: '#1f2d36',
    bandLit: '#44596a',
    plate: '#ffd45c',
    plateLow: '#b58a1c',
    hilt: '#2a2228',
    hiltWrap: '#d9c08e',
    sheath: '#4a2534',
    sheathLit: '#7d4760',
    bladeGlow: '#13b8b2',
    bladeCore: '#05615e',
    slash: '#ffffff',
    shadow: 'rgba(40, 30, 20, 0.22)',
    vignette: 'rgba(60, 90, 80, 0.2)',
    floater: '#fffaf0',
    floaterEdge: '#3a2406',
    additive: false,
  },
};

/**
 * The foods, index-aligned with `FOODS` in `content.ts` and with the rules'
 * kinds: apple, croissant, cheese, pizza, doughnut, carrot. Their bodies are
 * painted in `scene.ts` (each is a shape, not a colour swatch); these are the
 * colours, the same in both lightings because an apple is red at night too.
 */
export const FOOD_BODY = {
  apple: { lit: '#ff8b6c', base: '#e8443a', shade: '#a92a24', stem: '#6b4226', leaf: '#5bbf5c', leafLow: '#2f8a4a' },
  croissant: { lit: '#ffd88a', base: '#eaa443', shade: '#b56c1e', line: '#9a5a18' },
  cheese: { topLit: '#fff2a6', top: '#ffe372', front: '#ffc93a', side: '#f0ac25', hole: '#dd9a17', holeLow: '#b97a0e' },
  pizza: { crust: '#dc8e3c', crustLit: '#f5bf72', crustLow: '#a9612a', cheese: '#ffd157', cheeseLit: '#ffe9a1', cheeseLow: '#f2b53a', sauce: '#e4472f', pepperoni: '#c4362a', pepperoniLow: '#8e2219', basil: '#3f9a4f', basilVein: '#2b7a3a' },
  doughnut: { dough: '#e7a259', doughLit: '#f8c88a', doughLow: '#b26c2c', icing: '#ff8fae', icingLit: '#ffc6d6', icingLow: '#e0628a', sprinkles: ['#5fe3c2', '#ffd45c', '#ffffff', '#1d939d', '#ff7b53'] },
  carrot: { lit: '#ffb15c', base: '#ff8a2a', shade: '#d0601a', ridge: '#c4561a', leaf: '#5bbf5c', leafLow: '#2f8a4a' },
} as const;

export const FOOD_CUT: readonly FoodColours[] = [
  { flesh: '#fff3d4', skin: '#e8443a', core: '#6b4226', juice: ['#fff4c4', '#ffe58f'] },
  { flesh: '#fde5ad', skin: '#d98d34', core: '#dca35b', juice: ['#f0b85c', '#ffd88a', '#c98330'] },
  { flesh: '#ffe17a', skin: '#f0ac25', core: '#e7a51c', juice: ['#ffd84a', '#ffe98f'] },
  { flesh: '#ffd65c', skin: '#dc8e3c', core: '#e4472f', juice: ['#e4472f', '#ffd157', '#c4362a'] },
  { flesh: '#f8d8a0', skin: '#ff8fae', core: '#e7a259', juice: ['#5fe3c2', '#ffd45c', '#ffffff', '#ff8fae', '#1d939d'] },
  { flesh: '#ff9c40', skin: '#ff8a2a', core: '#ffc27a', juice: ['#ff8a2a', '#ffb15c'] },
];

/**
 * Proportions and timings. Distances are in field **widths** unless named,
 * times in milliseconds.
 */
export const NINJA = {
  /** Pico, the ninja, in the bottom-left corner — drawn behind the food, so he never hides one. */
  pico: { x: 0.13, size: 0.22, minPx: 62, maxPx: 110, hopMs: 360, hop: 0.045, happyMs: 520 },
  /** The veranda's top edge, as a share of the field's height from the top. */
  deck: 0.935,
  /** How fast a food turns in the air, radians a second, before the per-food variation. */
  spin: 1.6,
  /** Halves: how long they last, how hard they part (widths/s), how fast they tumble. */
  halves: { ms: 1300, part: 0.32, spin: 2.6 },
  /** Juice: drops per cut, their speed (widths/s), size (widths) and life. */
  juice: { drops: 16, speed: 0.75, size: 0.008, ms: 650 },
  /** The flash along a cut. */
  slashMs: 190,
  /** The blade: its widest point (widths) and its glow's. */
  blade: { core: 0.012, glow: 0.034 },
  /** A stroke that cuts this many or more says so. */
  comboAt: 3,
  comboMs: 1300,
  /** Ambient life. */
  lanterns: 7,
  bokeh: 12,
  drift: 22,
  stars: 46,
} as const;
