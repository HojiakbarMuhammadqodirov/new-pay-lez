/**
 * Pico's Flock — the Snake screen's scene, in one place: its colours, its
 * proportions, its timings and how much is alive in it.
 *
 * ## What the scene is
 *
 * The rules are Snake's, untouched (`games/arcade.ts`, replayed by the server):
 * a 16 × 16 board, one cell a tick, the wall and your own body end it. What is
 * *drawn* is Pico leading a conga line of chicks across a garden lawn — Pico is
 * the head, every chick is a body segment, every treat eaten brings one more
 * chick hopping into the back of the line. The lawn is mown in a checker,
 * which is how a real lawn shows the grid a player counts turns against, and
 * the hedge round it is the wall, so the edge that ends a round is an object
 * you can see rather than the end of the canvas.
 *
 * ## Why this file names colours at all
 *
 * The page is two colours (root `CLAUDE.md`), and every piece of *chrome* on
 * the screen still is — the header, the bar, the pad, the veils. What is drawn
 * **inside the field** is a place, and a place drawn in one mint on one ground
 * is a diagram of one. So, like the platformer's `LEVEL.palette` and the board
 * games' scenes, this game carries a scene palette: grass, hedge, berries and
 * chicks, chosen to sit around Pico's teal and his orange-and-yellow rather
 * than beside them as a new accent. Nothing in `site.css` reads these; they
 * reach the canvas from TypeScript only.
 *
 * `light` is the lawn at golden hour and `dark` the same lawn under the moon,
 * with fireflies where the butterflies were — two lightings of one garden, so
 * every entry exists in both and means the same object. The chicks and the
 * treats are the same in both: they are things, and Pico (whose own palette
 * reads on both grounds) sets the precedent.
 */

export type FlockTheme = 'dark' | 'light';

/** One chick's plumage. Three of them, cycled down the line. */
export interface ChickPlumage {
  body: string;
  /** The underside crescent. */
  shade: string;
  belly: string;
  wing: string;
  /** The tuft on the crown. */
  tuft: string;
}

export interface FlockPalette {
  /** The mown checker, two passes of the mower. */
  lawnA: string;
  lawnB: string;
  /** Tufts and clover: the dark blade and the lit one. */
  blade: string;
  bladeLit: string;
  clover: string;
  /** Daisies: petals and eye. */
  petal: string;
  petalEye: string;
  pebble: string;
  pebbleShade: string;
  /** The hedge, three values and the soil line under it. */
  hedge: string;
  hedgeShade: string;
  hedgeLit: string;
  hedgeDeep: string;
  /** Blossom dotted over the hedge. */
  blossom: readonly string[];
  /** The shadow the hedge throws onto the lawn's edge. */
  hedgeCast: string;
  /** The low light: sun from the top left by day, moon from the top right by night. */
  wash: string;
  washAlpha: number;
  /** The far corner the light does not reach — cooler, so the lawn has a direction. */
  shade: string;
  /**
   * A tree just out of frame: its canopy's shadow over one corner of the lawn
   * (with coins of light through it), laid on once at `canopyAlpha`.
   */
  canopy: string;
  canopyAlpha: number;
  /** The corners going down. */
  vignette: string;
  /** Ground shadows under birds and treats. */
  shadow: string;
  /** Drifting cloud shadows (day) — `null` where there is no sun to cast them. */
  cloud: string | null;
  /** Butterflies (day): wing colours, cycled. Empty at night. */
  butterflies: readonly string[];
  butterflyBody: string;
  /** Fireflies (night): core and halo. `null` by day. */
  firefly: string | null;
  fireflyHalo: string | null;
  /** Dandelion fluff on the air (day) — `null` at night. */
  fluff: string | null;
  /** The warm halo a treat sits in, and its twinkle. */
  treatGlow: string;
  sparkle: string;
  /** Leaves knocked off the hedge by a crash, and the puff of the bump. */
  leaf: string;
  puff: string;
}

/* ── the birds and the treats: objects, so one set for both lights ───────── */

export const CHICKS: readonly ChickPlumage[] = [
  /* Mint — Pico's own family, a shade lighter, so the line reads as his. */
  { body: '#7fe3c6', shade: '#4cc4a3', belly: '#dcfbf0', wing: '#36ad8d', tuft: '#ffd45c' },
  /* Sun — his crest's yellow, the chick everyone draws. */
  { body: '#ffd866', shade: '#f0b43a', belly: '#fff4c8', wing: '#e39c22', tuft: '#ffb534' },
  /* Sky — the teal leaning blue, the third step that keeps a long line from striping. */
  { body: '#86d6f0', shade: '#55b5d8', belly: '#e4f7fd', wing: '#3d9cc2', tuft: '#ffd45c' },
];

/** What every chick shares with Pico: his bill, his ink, his blush. */
export const CHICK_PARTS = {
  beak: '#ffb534',
  beakLow: '#f07f22',
  ink: '#08201b',
  glint: '#ffffff',
  blush: '#ff9e8c',
  feet: '#f07f22',
} as const;

/**
 * The treats, cycled by how many have been eaten so a round is a little menu
 * rather than the same berry 25 times: cherries, a strawberry, blueberries and
 * a sunflower head (bird food is seeds as much as fruit).
 */
export const TREATS = {
  cherry: { fruit: '#e5414e', shade: '#b32838', shine: '#ff9fa6', stem: '#6f8f3a', leaf: '#5aa846', leafShade: '#3f8a35' },
  strawberry: { fruit: '#ef4b5a', shade: '#c0303f', seed: '#ffe08a', calyx: '#4fa64a', calyxShade: '#36863a' },
  blueberry: { fruit: '#5a74e0', shade: '#3c52b3', crown: '#283a84', shine: '#c3cfff' },
  sunflower: { petal: '#ffcc33', petalShade: '#f0a51c', centre: '#7a4a1f', seed: '#b07533' },
} as const;

export type TreatKind = keyof typeof TREATS;
export const TREAT_ORDER: readonly TreatKind[] = ['cherry', 'strawberry', 'blueberry', 'sunflower'];

/** The dizzy stars over a knocked-out Pico — his crest's yellow, so they read as his. */
export const DIZZY = { star: '#ffd45c', edge: '#e89a1c' } as const;

/* ── the two lightings ──────────────────────────────────────────────────── */

export const FLOCK_PALETTE: Record<FlockTheme, FlockPalette> = {
  light: {
    lawnA: '#97d27c',
    lawnB: '#8bc972',
    blade: '#6fae5c',
    bladeLit: '#c6ec9c',
    clover: '#79bb65',
    petal: '#fffaf0',
    petalEye: '#ffc93d',
    pebble: '#ddd5c0',
    pebbleShade: '#b8ae96',
    hedge: '#4c9c5b',
    hedgeShade: '#377f48',
    hedgeLit: '#6dbb6f',
    hedgeDeep: '#2b663b',
    blossom: ['#fff6e6', '#ffc2cf', '#ffd45c'],
    hedgeCast: 'rgba(38, 78, 30, 0.26)',
    wash: '#ffd27a',
    washAlpha: 0.42,
    shade: 'rgba(16, 92, 84, 0.2)',
    canopy: '#1d5a35',
    canopyAlpha: 0.2,
    vignette: 'rgba(58, 74, 20, 0.16)',
    shadow: 'rgba(36, 66, 26, 0.3)',
    cloud: 'rgba(40, 74, 32, 0.09)',
    butterflies: ['#ffe07a', '#fff3ef', '#c7b4ff'],
    butterflyBody: '#4b3b2a',
    firefly: null,
    fireflyHalo: null,
    fluff: 'rgba(255, 255, 255, 0.9)',
    treatGlow: 'rgba(255, 238, 150, 0.55)',
    sparkle: '#fffbe6',
    leaf: '#4c9c5b',
    puff: '#fffdf4',
  },
  dark: {
    lawnA: '#1f4a3d',
    lawnB: '#1b4236',
    blade: '#163a30',
    bladeLit: '#2f6654',
    clover: '#24543f',
    petal: '#cfe9df',
    petalEye: '#e3bd52',
    pebble: '#2d4a42',
    pebbleShade: '#1e3730',
    hedge: '#123b2d',
    hedgeShade: '#0b2a20',
    hedgeLit: '#1f5543',
    hedgeDeep: '#061a13',
    blossom: ['#d8f3ea', '#d99bb6', '#e3bd52'],
    hedgeCast: 'rgba(0, 0, 0, 0.36)',
    wash: '#a6f2de',
    washAlpha: 0.2,
    shade: 'rgba(2, 10, 18, 0.3)',
    canopy: '#020a08',
    canopyAlpha: 0.22,
    vignette: 'rgba(0, 0, 0, 0.42)',
    shadow: 'rgba(0, 0, 0, 0.42)',
    cloud: null,
    butterflies: [],
    butterflyBody: '#000000',
    firefly: '#f4ffb4',
    fireflyHalo: 'rgba(196, 255, 140, 0.32)',
    fluff: null,
    treatGlow: 'rgba(255, 226, 150, 0.5)',
    sparkle: '#fff6d0',
    leaf: '#1f5543',
    puff: '#cfe9df',
  },
};

/* ── proportions, in cells ──────────────────────────────────────────────── */

export const FLOCK = {
  /**
   * The hedge round the lawn, in cells. The board needs a wall the player can
   * see, and a hedge drawn *over* the outer cells would hide a playable row,
   * so the lawn is inset by this much and the hedge lives in the margin. 0.62
   * costs a phone's cell about 3% of its width — the trade for an edge that is
   * a thing rather than the end of the picture.
   */
  margin: 0.62,

  pico: {
    /**
     * Pico's body radius, in cells. His box is ~2.2× his body, so at 0.4 he is
     * about two cells tall — taller than his cell, as a character in a
     * top-down garden is, and his shadow says which cell is his.
     */
    bodyRadius: 0.42,
    /** How far above the cell centre his body sits, so his feet land on the cell's lower edge. */
    lift: 0.24,
    /** Tilt going up or down the board, radians (nose up / nose down). */
    climb: 0.42,
    /** One hop a tick, this high, in cells. */
    hop: 0.14,
  },

  chick: {
    /** A chick's radius in cells — a round ball, so most of its cell. */
    radius: 0.37,
    /** Body centre above the cell centre, so the feet sit on the cell. */
    lift: 0.1,
    hop: 0.13,
    /** Wing beats a second while marching; idle chicks flutter now and then. */
    beats: 7,
  },

  treat: {
    /** The treat's drawn radius, in cells. */
    radius: 0.42,
    /** A slow bob, cells and seconds. */
    bob: 0.06,
    bobPeriod: 1.6,
  },

  /** Ms a facing flip takes — a quick squash through edge-on, not a snap. */
  flipMs: 110,
  /** Ms a new chick takes to hop into the line. */
  joinMs: 360,
  /** A treat appearing: grows from nothing, ms. */
  treatInMs: 260,

  crash: {
    /** The lunge into whatever was hit and back, ms, and how far, in cells. */
    lungeMs: 200,
    lunge: 0.3,
    /** The line bumping into the bird ahead, ms between chicks and per bump. */
    rippleMs: 38,
    bumpMs: 170,
    /** The whole field shudders, px, over ms. */
    shake: 3,
    shakeMs: 260,
    feathers: 9,
    leaves: 7,
    /** Dizzy stars over Pico's head. */
    stars: 3,
  },

  /** Particles on a treat eaten. */
  munch: { bits: 9, sparkles: 4, ms: 620 },

  ambient: {
    butterflies: 3,
    fireflies: 16,
    fluff: 5,
    clouds: 2,
  },

  /** Decoration scattered on the lawn, from a fixed seed so it never reshuffles. */
  decor: { seed: 20261010, tufts: 50, daisies: 6, clovers: 6, pebbles: 4 },

  /**
   * Backing-store ceiling. The scene is broad flat shapes; 3× buys nothing a
   * phone can show and costs 2.25× the fill of every frame (the board games'
   * `sceneStage.ts` makes the same call).
   */
  maxRatio: 2,
} as const;
