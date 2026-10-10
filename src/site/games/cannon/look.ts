/**
 * Canon Numbers — how the round *looks*: the harbour, the balloons, the cannon
 * and Pico at his post. Every rule of the game stays in `config.ts` (tunables)
 * and `goals.ts` (the maths); nothing in this file can change what scores.
 *
 * ## The scene
 *
 * A ship's deck at golden hour, Pico the cannoneer on a powder keg beside his
 * cannon, and the sums' numbers coming down over the bay on balloons. The
 * targets' slow fall and their side-to-side sway were already the game's; a
 * balloon is the thing that moves like that, and it pops. The ship's rail sits
 * exactly on `TARGET.floorY`, the line past which a target is gone — so a
 * balloon leaves the round by sinking behind the rail, which is what the rule
 * always said.
 *
 * ## Why this file names colours at all
 *
 * The page is two colours (root `CLAUDE.md`), and every piece of *chrome* on
 * the screen still is — the header, the goal banner, the veils, the Quit link.
 * What is drawn **inside the field** is a place, and a harbour in one mint on
 * one ground is a diagram of one. So, like the platformer's `LEVEL.palette`
 * and the board games' scenes, this game carries a scene palette: sea, sky,
 * timber, bronze and balloons, chosen around Pico's teal and his
 * orange-and-yellow. Nothing in `site.css` reads these; they reach the canvas
 * from TypeScript only.
 *
 * `light` is the bay at golden hour and `dark` the same bay at night, under a
 * moon and a lighthouse — two lightings of one place, so every entry exists in
 * both and means the same object.
 *
 * ## Readability is the rule the art obeys
 *
 * A balloon is a coloured ground for a number, so its colour is chosen for the
 * number first: every fill is dark enough to carry white numerals, and each
 * numeral is stroked in its own balloon's deep shade as well, so a digit holds
 * its shape over any part of the sky it drifts across. The colours mean
 * nothing — right and wrong are told by the pop and by the cross, never by hue.
 */
import { ASPECT, TARGET } from './config';

export type HarbourTheme = 'dark' | 'light';

/** One balloon's rubber. `ink` and `edge` are the numeral and its outline. */
export interface BalloonMaterial {
  fill: string;
  shade: string;
  deep: string;
  ink: string;
  edge: string;
}

/**
 * Six balloons, cycled by target id. Each fill holds white numerals at 3:1 or
 * better on its own, and the stroke in `edge` takes every one well past that.
 */
export const BALLOONS: readonly BalloonMaterial[] = [
  { fill: '#ee5a52', shade: '#c63d3a', deep: '#7e1f22', ink: '#ffffff', edge: '#7e1f22' },
  { fill: '#2f86de', shade: '#1f68b8', deep: '#123f73', ink: '#ffffff', edge: '#123f73' },
  { fill: '#8a5fe0', shade: '#6c44c2', deep: '#3a2275', ink: '#ffffff', edge: '#3a2275' },
  { fill: '#13a58c', shade: '#0b8270', deep: '#064a40', ink: '#ffffff', edge: '#064a40' },
  { fill: '#e9772a', shade: '#c85b16', deep: '#7a3306', ink: '#ffffff', edge: '#7a3306' },
  { fill: '#de4d8e', shade: '#ba3270', deep: '#701941', ink: '#ffffff', edge: '#701941' },
];

/** A balloon struck with the wrong number: the air goes out of it and the colour with it. */
export const SPENT: BalloonMaterial = { fill: '#a3aaad', shade: '#868e91', deep: '#40474a', ink: '#ffffff', edge: '#40474a' };

export interface HarbourPalette {
  /** Sky, top to the horizon, as stops over 0..1 of that span. */
  sky: readonly (readonly [number, string])[];
  /** The sun by day, the moon by night: where (field units), how big, its glow. */
  orb: { x: number; y: number; r: number; core: string; rim: string; glow: string; glowR: number };
  /** Static stars and the twinklers (night only). */
  stars: string | null;
  cloud: string;
  cloudShade: string;
  cloudAlpha: number;
  /** The haze band along the horizon. */
  haze: string;
  /** The far shore: hills, palms, the lighthouse rock. */
  shore: string;
  shoreNear: string;
  lighthouse: string;
  lighthouseStripe: string;
  lamp: string;
  /** The lighthouse's sweeping beam; `null` by day. */
  beam: string | null;
  sail: string;
  hull: string;
  sea: readonly (readonly [number, string])[];
  /** Glints on the water, and the column of light under the orb. */
  glint: string;
  path: string;
  gull: string | null;
  /** Bunting across the top of the field. */
  line: string;
  pennants: readonly string[];
  /** Timber: the rail, the deck, the keg. */
  wood: string;
  woodLow: string;
  woodLit: string;
  seam: string;
  plankA: string;
  plankB: string;
  rope: string;
  ropeShade: string;
  iron: string;
  ironLit: string;
  bronze: string;
  bronzeLow: string;
  bronzeLit: string;
  bronzeBand: string;
  bore: string;
  /** Lantern on the post: frame, glass, and the light it throws (night). */
  lanternFrame: string;
  lanternGlass: string;
  lanternGlow: string | null;
  smoke: string;
  smokeShade: string;
  flash: string;
  flashCore: string;
  shadow: string;
  /** The aim dots from the muzzle. */
  aim: string;
  /** "+1" and "−1": fill and outline. Told apart by the sign, not the hue. */
  plus: { fill: string; edge: string };
  minus: { fill: string; edge: string };
  /** A soft halo round each balloon at night, as if the moon were behind it. */
  balloonHalo: string | null;
  confettiWhite: string;
}

export const HARBOUR: Record<HarbourTheme, HarbourPalette> = {
  light: {
    sky: [
      [0, '#6fc6dd'],
      [0.5, '#bfe7e4'],
      [0.82, '#ffe2b6'],
      [1, '#ffc896'],
    ],
    orb: { x: 0.8, y: 0.915, r: 0.07, core: '#fff3c2', rim: '#ffc861', glow: 'rgba(255, 196, 100, 0.62)', glowR: 0.5 },
    stars: null,
    cloud: '#fffaf0',
    cloudShade: '#f6d9c2',
    cloudAlpha: 0.92,
    haze: 'rgba(255, 226, 190, 0.7)',
    shore: '#8cbcb6',
    shoreNear: '#6ea7a1',
    lighthouse: '#fff7ec',
    lighthouseStripe: '#e8655c',
    lamp: '#ffd76a',
    beam: null,
    sail: '#fffaf0',
    hull: '#3d6f78',
    sea: [
      [0, '#46c0b2'],
      [0.45, '#25a69c'],
      [1, '#148a87'],
    ],
    glint: '#fff7dc',
    path: '#ffe7ad',
    gull: '#3e5d66',
    line: '#7b5b3d',
    pennants: ['#ee5a52', '#ffcf4a', '#2f86de', '#13a58c', '#8a5fe0'],
    wood: '#b9804e',
    woodLow: '#8e5a32',
    woodLit: '#dca46c',
    seam: '#704424',
    plankA: '#c58c58',
    plankB: '#b9804e',
    rope: '#e2c48c',
    ropeShade: '#b6935c',
    iron: '#2f353c',
    ironLit: '#7d8893',
    bronze: '#c98b3c',
    bronzeLow: '#8c5a1e',
    bronzeLit: '#f2c97f',
    bronzeBand: '#7a4a17',
    bore: '#2a1a0c',
    lanternFrame: '#3b2f27',
    lanternGlass: '#ffe9a8',
    lanternGlow: null,
    smoke: '#f6f1e8',
    smokeShade: '#d9d0c3',
    flash: '#ffd45c',
    flashCore: '#fffbea',
    shadow: 'rgba(70, 40, 16, 0.28)',
    aim: 'rgba(30, 72, 82, 0.4)',
    plus: { fill: '#ffffff', edge: '#0b6f62' },
    minus: { fill: '#ffffff', edge: '#40474a' },
    balloonHalo: null,
    confettiWhite: '#ffffff',
  },
  dark: {
    sky: [
      [0, '#08182a'],
      [0.55, '#0f2c44'],
      [0.85, '#17455a'],
      [1, '#22606a'],
    ],
    orb: { x: 0.8, y: 0.2, r: 0.05, core: '#f4fbf3', rim: '#cfeee2', glow: 'rgba(170, 245, 225, 0.26)', glowR: 0.32 },
    stars: '#e9fbff',
    cloud: '#2a4d63',
    cloudShade: '#1b3649',
    cloudAlpha: 0.55,
    haze: 'rgba(60, 120, 130, 0.45)',
    shore: '#0f2e3a',
    shoreNear: '#0b2530',
    lighthouse: '#cdd8d5',
    lighthouseStripe: '#a9524c',
    lamp: '#ffe9a0',
    beam: 'rgba(255, 240, 190, 0.24)',
    sail: '#c9d6d2',
    hull: '#16323a',
    sea: [
      [0, '#16505b'],
      [0.45, '#0f3d48'],
      [1, '#0a2c36'],
    ],
    glint: '#d6fff2',
    path: '#c4f6e6',
    gull: null,
    line: '#5d4632',
    pennants: ['#c9524c', '#d8b04a', '#3b78b8', '#1f8f7c', '#7656c0'],
    wood: '#6e4c32',
    woodLow: '#4a3120',
    woodLit: '#93674a',
    seam: '#33221a',
    plankA: '#65452e',
    plankB: '#5c3f2a',
    rope: '#a8916a',
    ropeShade: '#7b6849',
    iron: '#262b31',
    ironLit: '#6f7a85',
    bronze: '#a87339',
    bronzeLow: '#6e4618',
    bronzeLit: '#e2b46c',
    bronzeBand: '#5b3610',
    bore: '#140c06',
    lanternFrame: '#2a221d',
    lanternGlass: '#ffd987',
    lanternGlow: 'rgba(255, 190, 96, 0.34)',
    smoke: '#a9bcc0',
    smokeShade: '#7d9094',
    flash: '#ffd45c',
    flashCore: '#fffbea',
    shadow: 'rgba(0, 0, 0, 0.4)',
    aim: 'rgba(210, 245, 238, 0.42)',
    plus: { fill: '#ffffff', edge: '#0b6f62' },
    minus: { fill: '#ffffff', edge: '#2b3134' },
    balloonHalo: 'rgba(190, 245, 230, 0.18)',
    confettiWhite: '#f2fbf8',
  },
};

/* ── where things are, in field units (1 wide, ASPECT tall) ──────────────── */

export const LOOK = {
  /** The sea meets the sky here. */
  horizon: 0.96,
  /** The ship's rail: its top *is* the floor line, so a balloon is gone as it sinks behind it. */
  railTop: TARGET.floorY,
  railCap: 0.024,
  deckTop: TARGET.floorY + 0.05,
  bottom: ASPECT,

  /** Pico on his powder keg, left of the cannon. Box size and where his feet land. */
  pico: { x: 0.135, feet: ASPECT - 0.062, size: 0.25 },
  keg: { x: 0.135, w: 0.12, h: 0.07 },

  /** The cannon's carriage: wheel centres either side of the pivot, and their radius. */
  wheel: { dx: 0.082, y: ASPECT - 0.035, r: 0.042 },
  /**
   * The barrel's breech reaches this far behind the pivot, and its widths
   * against `CANNON.barrelWidth`. Drawn broader than that width — a cannon
   * reads by its bulk — while its length is the rule's own, so the ball still
   * leaves exactly where the muzzle is drawn.
   */
  barrel: { breech: 0.04, wide: 1.62, narrow: 1.16, flare: 1.6, flareLen: 0.024 },

  /** A balloon is a touch taller than its hit circle, and its string hangs this far. */
  balloon: { rx: 1.03, ry: 1.16, rise: 0.07, string: 0.1 },
  /** Numerals: size against the hit radius, for one-two digits and for three. */
  numeral: { short: 1.02, long: 0.8, stroke: 0.2 },

  /** Bunting along the top: how far down it sags, and how many pennants. */
  bunting: { y: 0.035, sag: 0.04, pennants: 11 },
} as const;

/* ── timings and counts ─────────────────────────────────────────────────── */

export const MOTION = {
  /** Pico's moods, ms: a cheer on a right answer, a slump on a wrong one, a beat of wing on a shot. */
  happyMs: 750,
  sadMs: 900,
  flapMs: 260,
  /** The muzzle flash, and how long a puff of smoke lives. */
  flashMs: 90,
  smokeMs: 900,
  smokePuffs: 5,
  /** A pop: confetti pieces and how long they fly. */
  confetti: 16,
  confettiMs: 900,
  /** A wrong strike: limp scraps. */
  scraps: 6,
  /** The trail behind a ball: puffs, and their spacing in seconds of flight. */
  trail: 6,
  trailStep: 0.011,
  /** Balloons breathe a little as they drift. */
  breathe: 0.025,
  clouds: 4,
  twinklers: 14,
  glints: 20,
  /** The sailboat crossing the horizon, field widths a second. */
  sail: 0.006,
  /** One turn of the lighthouse, seconds. */
  beamTurn: 9,
  particles: 140,
  /** Backing-store ceiling (see `flock/config.ts`). */
  maxRatio: 2,
} as const;
