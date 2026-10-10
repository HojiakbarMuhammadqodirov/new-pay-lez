/**
 * Picuma's scene — the jungle temple a Zuma round is played in — in one place:
 * its colours, its proportions and its timings. `scene.ts` paints from this and
 * nothing else; `Zuma.tsx` keeps the rules exactly as they were.
 *
 * ## Why this file names colours at all
 *
 * The page is two colours (root `CLAUDE.md`), and every piece of *chrome* on
 * this screen still is: the header, the bar, the swap press and the veils read
 * the site's tokens. What is drawn **inside the field** is a place — a mossy
 * temple courtyard with a carved causeway, a golden idol for the hole, a branch
 * for Pico to stand on — and a place drawn in one mint on one ground is a
 * diagram of a place. So the field carries a scene palette the way the
 * platformer behind L-Earn carries `LEVEL.palette`: stone, moss, leaf, gold and
 * firelight chosen to sit **around** the brand's teal and Pico's own orange and
 * yellow, never beside them as a new accent. Nothing in `site.css` may read
 * these; they reach the canvas from TypeScript only.
 *
 * `dark` is the courtyard at night — moon over the canopy, torches lit — and
 * `light` is it in the morning sun. Two lightings of one place: every entry
 * exists in both and names the same object.
 *
 * ## The four kinds are marks first
 *
 * `.claude/rules/games.md`: Zuma's four kinds are four **marks** — dot, ring,
 * bar, cross — and that is still what tells them apart. Each orb now also has a
 * material, and the materials are the app's (`picuma_view.dart` paints the same
 * four kinds jade, amber, coral and deep teal), so a player moving between the
 * phone and the browser meets the same four stones. The hue is a second,
 * redundant cue, never the only one:
 *
 * - every mark is drawn bold, in a near-black or near-white ink chosen against
 *   its own stone, and engraved (a lit lip under it) so it reads as cut into
 *   the stone rather than printed on it;
 * - the four materials are also four **lightnesses** — jade and gold light,
 *   coral middling, teal dark — so a greyscale screenshot still sorts them;
 * - and none of them is the page's accent: the mint on the page is the UI, the
 *   jade in the field is a stone.
 */

export type PicumaTheme = 'dark' | 'light';

/** One kind of orb: a polished stone and the mark cut into it. */
export interface OrbStone {
  /** The lit cap, top left. */
  lit: string;
  /** The body of the stone. */
  base: string;
  /** Its shadowed side, bottom right. */
  shade: string;
  /** A hairline at the silhouette, so the orb parts from the groove. */
  rim: string;
  /** The mark. */
  ink: string;
  /** The lit lip under an engraved mark. */
  lip: string;
}

export interface PicumaPalette {
  /** The courtyard floor, top to bottom (light falls from the top in both lightings). */
  groundTop: string;
  groundLow: string;
  /** Flagstones: two faces, their lit edge, and the joints between them. */
  slab: string;
  slabAlt: string;
  slabLit: string;
  joint: string;
  /** Moss in the joints and on the causeway. */
  moss: string;
  mossLit: string;
  /** The carved sun-calendar in the floor under the shooter. */
  inlay: string;
  inlayAlpha: number;
  /** Ground plants at the edges, deep to lit, and their veins. */
  leafDeep: string;
  leaf: string;
  leafLit: string;
  vein: string;
  /** Hanging vines across the top. */
  vine: string;
  vineLeaf: string;
  /** The causeway the chain rolls on: top face, lit edge, dark side, outline. */
  stone: string;
  stoneLit: string;
  stoneLow: string;
  stoneEdge: string;
  /** The groove cut into it. */
  groove: string;
  grooveLow: string;
  grooveLit: string;
  /** The idol around the hole, and the branch's brass-free cousin — gold leaf. */
  gold: string;
  goldLit: string;
  goldLow: string;
  goldDeep: string;
  /** Into the dark: the hole, and the entrance portal. */
  pit: string;
  pitRim: string;
  /** The branch Pico stands on, and the nest that holds the next orb. */
  bark: string;
  barkLit: string;
  barkLow: string;
  nest: string;
  nestLit: string;
  /** Torches. */
  pole: string;
  poleLow: string;
  flameOuter: string;
  flameMid: string;
  flameCore: string;
  /** Light the torches throw on the floor, and how strongly (additive in dark). */
  torchPool: string;
  torchPoolAlpha: number;
  /** The moon (dark) or sun (light) over the canopy. */
  sky: string;
  skyAlpha: number;
  /** Fireflies at night, pollen in the sun. */
  mote: string;
  moteAlpha: number;
  /** The warning the hole gives as the chain comes close. */
  danger: string;
  /** Shadows the scene casts on itself, and the vignette at its edge. */
  shadow: string;
  vignette: string;
  /** "+3" and "Combo ×2" over a pop: the face and the edge that lifts it off anything. */
  floater: string;
  floaterEdge: string;
  combo: string;
  /** The four kinds, index-aligned with the rules' kinds and with `copy.games.zuma.kinds`. */
  orbs: readonly [OrbStone, OrbStone, OrbStone, OrbStone];
  /** Whether glows add light (night) or lay a wash (day) — additive light has no headroom on a pale floor. */
  additive: boolean;
}

/*
 * The orbs barely change between the two lightings — they are the same four
 * stones — but the night set is a step deeper so they do not glow against a
 * dark floor, and the day set a step brighter so they do not go muddy on a
 * pale one.
 */
const ORBS_NIGHT: PicumaPalette['orbs'] = [
  // Jade — the dot.
  { lit: '#c9fff0', base: '#55dcbb', shade: '#178d76', rim: '#0c5c4d', ink: '#062e26', lip: '#b6ffe9' },
  // Gold — the ring.
  { lit: '#fff3c2', base: '#f7c03d', shade: '#c27d0d', rim: '#7f4f05', ink: '#3b2200', lip: '#fff0b0' },
  // Coral — the bar.
  { lit: '#ffd2c2', base: '#f6724c', shade: '#c03b23', rim: '#7d2012', ink: '#3f0d04', lip: '#ffc7b4' },
  // Deep teal — the cross, inked pale because the stone is dark.
  { lit: '#8ee2ea', base: '#1b8e98', shade: '#0d5862', rim: '#06363d', ink: '#effffd', lip: '#04282d' },
];

const ORBS_DAY: PicumaPalette['orbs'] = [
  { lit: '#d6fff3', base: '#5fe3c2', shade: '#1c9a80', rim: '#0f6655', ink: '#06352b', lip: '#c4fff0' },
  { lit: '#fff6cf', base: '#ffc93f', shade: '#cc8611', rim: '#8a5606', ink: '#402500', lip: '#fff3be' },
  { lit: '#ffdacb', base: '#ff7b53', shade: '#c9432a', rim: '#862414', ink: '#430e04', lip: '#ffd0bf' },
  { lit: '#9be8ef', base: '#1d939d', shade: '#0f5f69', rim: '#083c44', ink: '#f2fffe', lip: '#052c31' },
];

export const PICUMA_PALETTES: Readonly<Record<PicumaTheme, PicumaPalette>> = {
  dark: {
    groundTop: '#123a33',
    groundLow: '#0a211d',
    slab: '#173f37',
    slabAlt: '#143831',
    slabLit: '#215247',
    joint: '#071613',
    moss: '#2f8a57',
    mossLit: '#55b874',
    inlay: '#7fe0c4',
    inlayAlpha: 0.07,
    leafDeep: '#0b3f31',
    leaf: '#17654a',
    leafLit: '#2a8f62',
    vein: '#0a3328',
    vine: '#1b5a40',
    vineLeaf: '#2b8a5c',
    stone: '#5d786d',
    stoneLit: '#86a497',
    stoneLow: '#3a5148',
    stoneEdge: '#1d2d27',
    groove: '#132823',
    grooveLow: '#07120f',
    grooveLit: '#33524a',
    gold: '#e2b043',
    goldLit: '#ffe39a',
    goldLow: '#a8761c',
    goldDeep: '#5e3f0c',
    pit: '#020504',
    pitRim: '#1c1408',
    bark: '#5b4130',
    barkLit: '#87634a',
    barkLow: '#38271c',
    nest: '#8a6a3f',
    nestLit: '#b99260',
    pole: '#5a4030',
    poleLow: '#33241a',
    flameOuter: '#ff7f36',
    flameMid: '#ffbe45',
    flameCore: '#fff4c8',
    torchPool: '#ffb453',
    torchPoolAlpha: 0.2,
    sky: '#c6fbe9',
    skyAlpha: 0.16,
    mote: '#d9ffb0',
    moteAlpha: 0.9,
    danger: '#ff5f3a',
    shadow: 'rgba(0, 0, 0, 0.42)',
    vignette: 'rgba(2, 10, 8, 0.62)',
    floater: '#fff6dc',
    floaterEdge: '#2b1a05',
    combo: '#ffd45c',
    orbs: ORBS_NIGHT,
    additive: true,
  },
  light: {
    /* Sandstone in the morning sun: warm, so the jungle's greens and the
       bird's teal stand off it instead of melting into a mint-white floor. */
    groundTop: '#e3d6b6',
    groundLow: '#cdbd98',
    slab: '#eadfc4',
    slabAlt: '#e1d3b4',
    slabLit: '#fbf5e4',
    joint: '#b29f78',
    moss: '#6fa86a',
    mossLit: '#a4d18f',
    inlay: '#7a6236',
    inlayAlpha: 0.14,
    leafDeep: '#25805a',
    leaf: '#3ea06f',
    leafLit: '#76cf97',
    vein: '#226d4c',
    vine: '#3a8a5f',
    vineLeaf: '#5cb77f',
    stone: '#b9b7a5',
    stoneLit: '#ecebe0',
    stoneLow: '#8e8b74',
    stoneEdge: '#6c6955',
    groove: '#5f5b4b',
    grooveLow: '#433f32',
    grooveLit: '#948e76',
    gold: '#e6b343',
    goldLit: '#ffe7a3',
    goldLow: '#ad7a1d',
    goldDeep: '#6b480f',
    pit: '#0f1916',
    pitRim: '#2a1e0c',
    bark: '#80603f',
    barkLit: '#b08a63',
    barkLow: '#5a4129',
    nest: '#b38d55',
    nestLit: '#dcbb85',
    pole: '#7b5a3e',
    poleLow: '#55402b',
    flameOuter: '#ff8a3d',
    flameMid: '#ffc556',
    flameCore: '#fff6d2',
    torchPool: '#ffcf7a',
    torchPoolAlpha: 0.22,
    sky: '#fff3cf',
    skyAlpha: 0.6,
    mote: '#fffbe6',
    moteAlpha: 0.85,
    danger: '#f04a28',
    shadow: 'rgba(66, 48, 18, 0.26)',
    vignette: 'rgba(72, 82, 46, 0.3)',
    floater: '#fffaf0',
    floaterEdge: '#3a2406',
    combo: '#ffcf4a',
    orbs: ORBS_DAY,
    additive: false,
  },
};

/**
 * Proportions and timings. Distances are in **field widths** (the rules'
 * unit: the field is 1 wide and 4/3 tall), times in milliseconds unless named.
 */
export const PICUMA = {
  /**
   * Pico, the shooter.
   *
   * The rules fire every shot from one point (`SHOOTER` in `Zuma.tsx`, a tenth
   * of a field above the bottom edge), so the bird is placed **around** that
   * point rather than the point around the bird: the orb in his beak *is* the
   * shot's origin. `hold` is where that orb's centre sits in Pico's 100-unit
   * design box, just past the tip of the upper bill, so the bill overlaps the
   * orb and reads as gripping it.
   */
  pico: {
    /** Design-box side, in field widths. */
    size: 0.18,
    hold: { x: 99, y: 47 },
    /**
     * The lean he is placed for: at this lean the orb in his beak is exactly
     * the shooter. Most shots go up and ahead, so it sits in the middle of the
     * range below, and the drawn orb strays from the true origin by half as
     * much as it would if he were placed standing straight.
     */
    restLean: -0.04,
    /**
     * How far he leans toward the aim, radians about his body: nose up for a
     * shot straight overhead, a touch nose down for a flat one. Small on
     * purpose — the orb in his beak swings with the lean, and a shot leaves
     * from the rules' point, so the bigger the lean the further the drawn orb
     * strays from where the shot really starts.
     */
    leanUp: -0.2,
    leanFlat: 0.06,
    /** How quickly the lean follows the pointer (per second, exponential). */
    leanRate: 16,
    /** Pointer this far either side of straight up before he turns round. */
    turnDeadband: 0.035,
    /** Turning round is a hop across the orb, wings out. */
    hopMs: 190,
    hopHeight: 0.034,
    /** A pop makes him happy for this long; a combo for longer. */
    happyMs: 750,
    comboHappyMs: 1500,
    /** Danger at which he starts to worry (0..1, see `danger`). */
    worryAt: 0.35,
    /** A small kick back along the line of fire. */
    recoil: 0.012,
    recoilMs: 160,
  },

  /** The next orb rests in a nest on the branch, behind Pico. */
  nest: { dx: 0.205, fromBottom: 0.0423, r: 0.034, orbScale: 0.78 },

  /**
   * The branch across the bottom of the field that Pico stands on. Measured up
   * from the field's bottom edge, like everything down there, because the
   * shooter is (a tenth of a field above it) — and so a card's miniature, a
   * much shorter field, can stand him on the same branch.
   */
  branch: { fromBottom: 0.0263 },

  /** Two torches, standing at the bottom corners (x, flame's height above the bottom). */
  torches: [
    { x: 0.075, fromBottom: 0.273 },
    { x: 0.925, fromBottom: 0.273 },
  ],

  /**
   * The hole's warning: 0 until the chain's front is this far (track units)
   * from the hole, then rising to 1 at the hole.
   */
  danger: { span: 0.55 },

  /**
   * The shot leaves the drawn beak and joins its real line within this long —
   * the two differ by the lean, a couple of hundredths of a field at most, and
   * a shot is a third of a second from the nearest chain ball.
   */
  shotSettleMs: 110,
  /**
   * The wake behind a shot: three tapering layers, each [length in field
   * widths, alpha, half-width in orb radii] — long and faint to short and
   * bright, so it reads as one soft streak.
   */
  shotWake: [
    [0.16, 0.12, 0.85],
    [0.1, 0.18, 0.7],
    [0.055, 0.28, 0.55],
  ] as ReadonlyArray<readonly [number, number, number]>,
  /** A shot joining the chain travels into its slot over this long. */
  joinMs: 85,
  /**
   * The chain closing a gap (or making room for a shot) slides rather than
   * jumps: an offset that decays with this time constant, in seconds. Short,
   * because the rules have already moved the balls — this is the picture
   * catching up, and a shot aimed at the picture during it should not miss by
   * much.
   */
  slideTau: 0.055,

  /** A pop: shards per orb, their life (s), the ring, and the floaters. */
  pop: { shards: 9, life: 0.75, ringMs: 420, floaterMs: 950, comboMs: 1400 },

  /** The aim guide: dots from the beak toward the pointer. */
  guide: { first: 0.07, gap: 0.042, dot: 0.0062, reticle: 0.024 },

  /** Ambient life. */
  motes: 18,
  vines: 7,
} as const;
