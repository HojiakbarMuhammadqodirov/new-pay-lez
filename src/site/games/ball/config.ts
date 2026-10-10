import type { ThemeName } from '../../theme/context';

/**
 * Pico's Ball's world — every colour and number the round is *drawn* with,
 * and nothing it is *played* with.
 *
 * The game is the paddle, the ball and the wall in `Breakout.tsx`: their sizes,
 * speeds and collisions are constants there, and the wall is the server's.
 * Nothing in this file is read by any of it. The bricks are drawn exactly in
 * their hit rectangles, the ball a touch larger than its hit circle (so a
 * 6 px ball reads) and the paddle exactly its bar, so what the eye sees
 * bounce is what the game bounces.
 *
 * ── A sandcastle by the sea ──
 *
 * The wall is a sandcastle's blocks: dry sand breaks at a touch, **wet sand is
 * darker and takes two** — the game's own rule ("darker bricks take two hits")
 * told by the material — and cracks after the first. The ball is a beach ball
 * in Pico's colours, the paddle is his surfboard, and Pico flies under it with
 * the board on his crest, over the shallows at the bottom of the field. Behind
 * it all a tropical sea runs to the horizon: a sunny afternoon on the light
 * page, a moonlit night on the dark one, with a lighthouse on the far island
 * and the surf glowing the page's mint where it breaks.
 *
 * ── Why this file carries hues ──
 *
 * The same exception as `LEVEL.palette`, the flight's scene and Pico Jump's
 * (`games/jump/config.ts`), under the same three constraints: **teal is the
 * key** (sky and sea are blue-green at the lightnesses depth needs), **the
 * warm notes are Pico's own** (sand, the sun, the shells, the ball's panels sit
 * in the range of his bill, crest and cheek), and **the brand accent is the
 * magic** (the bioluminescent surf and the sparkle of a cleared wall are
 * `THEMES[…].primary`, passed in). Nothing here may leak into `site.css`; the
 * hover miniature takes its few colours as inline custom properties
 * (`ballPreviewVars`).
 */

export const BALL_SCENE = {
  /**
   * The strip under the field where Pico flies, in field widths. The field is
   * 1 wide and `ASPECT` tall and its bottom edge is still where a ball is
   * lost; the strip is picture only — it gives the bird room under his board
   * and the ball somewhere to fall into.
   */
  strip: 0.13,
  /** Pico's body radius, in field widths. */
  picoR: 0.037,
  /** How far Pico's crest tucks up under the board, in body radii. */
  tuck: 0.2,
  /** Backing-store ceiling: broad flat shapes buy nothing past 2×. */
  maxRatio: 2,
  /** The beach ball is drawn this much larger than its hit circle, so it reads. */
  ballDraw: 1.2,
  /** Ball trail length, in frames. */
  trail: 9,
  /** Particle pool size. */
  particles: 160,
  /** How long a struck brick flashes and shakes, seconds. */
  flash: 0.16,
  /** Screen shake on a broken brick: px at a 360 px field, and seconds. */
  shake: { px: 1.6, seconds: 0.14 },
  /** Bricks broken without touching the board before Pico cheers. */
  cheerRun: 3,
  /** Seconds Pico grins after a run, or a cleared wall. */
  cheer: 0.7,
  /** Pico catching up with the board: the share of the gap closed per second. */
  follow: 16,
  /** Wing beats per second: normal, cheering, drooping. */
  beats: { normal: 2.8, cheer: 4.4, sad: 0.9 },
  /** Where the horizon sits, in field widths from the top. */
  horizon: 0.98,
} as const;

export interface BallPalette {
  /** Sky from the top of the field to the horizon. */
  sky: readonly [string, string, string];
  orb: string;
  orbShade: string;
  halo: string;
  haloAlpha: number;
  /** Stars (night only; 0 draws none). */
  stars: number;
  star: string;
  cloud: { body: string; shade: string; alpha: number };
  island: { far: string; near: string; palm: string };
  lighthouse: { body: string; band: string; lamp: string };
  /** The sea from the horizon down; the long glints of the orb on it. */
  sea: { horizon: string; deep: string; line: string; glint: string };
  foam: string;
  /** Surf glow at night is the accent; by day the foam is just white. */
  surfGlow: number;
  /** Dry sand, row by row from the top (a castle is a little sun-bleached on top). */
  sand: readonly [string, string, string, string, string];
  sandHi: string;
  sandLo: string;
  grain: string;
  grainLight: string;
  /** Wet, packed sand: the two-hit block. */
  wet: string;
  wetHi: string;
  wetLo: string;
  /** The arched window and finger-holes poked into a wet block. */
  castleDark: string;
  crack: string;
  /** Beach finds pressed into the blocks. */
  shell: string;
  shellLine: string;
  starfish: string;
  pebble: string;
  glass: string;
  /** The surfboard. */
  board: { deck: string; rail: string; stripe: string; stripe2: string; gloss: string; fin: string };
  /** The beach ball's panels, its white, and its shade. */
  ball: readonly [string, string, string];
  ballWhite: string;
  ballShade: string;
  ballRim: string;
  ballGlow: number;
  palmFrond: { dark: string; light: string; trunk: string };
  gull: string;
  shadow: string;
  confetti: readonly string[];
}

export const BALL_PALETTE: Record<ThemeName, BallPalette> = {
  /* A moonlit night: a pale moon over the sea, its path glittering, the surf glowing. */
  dark: {
    sky: ['#05111b', '#0a2230', '#174552'],
    orb: '#f4fbf6',
    orbShade: '#cfe3dc',
    halo: '#c8fff0',
    haloAlpha: 0.2,
    stars: 70,
    star: '#e9fbff',
    cloud: { body: '#2b5260', shade: '#183642', alpha: 0.55 },
    island: { far: '#0d2a33', near: '#081d24', palm: '#06161c' },
    lighthouse: { body: '#c9d8d6', band: '#2a4a52', lamp: '#ffe9a0' },
    sea: { horizon: '#1a4a55', deep: '#06171e', line: '#3d7f88', glint: '#e6fff9' },
    foam: '#bff7ec',
    surfGlow: 0.55,
    sand: ['#d8c39a', '#d2bb90', '#cbb387', '#c4ab7f', '#bea478'],
    sandHi: '#efe0bd',
    sandLo: '#9c8662',
    grain: '#8f7a57',
    grainLight: '#f3e6c8',
    wet: '#8c7350',
    wetHi: '#b39a72',
    wetLo: '#5e4b33',
    castleDark: '#2e2216',
    crack: '#33261a',
    shell: '#ffb9a8',
    shellLine: '#c7766a',
    starfish: '#ff9e6e',
    pebble: '#6f8c8f',
    glass: '#7fe9d3',
    board: { deck: '#f2f7f4', rail: '#9fb4b0', stripe: '#22c3a1', stripe2: '#ffb534', gloss: '#ffffff', fin: '#119079' },
    ball: ['#22c3a1', '#ffb534', '#ff8f7a'],
    ballWhite: '#fbfbf6',
    ballShade: '#0a2a2a',
    ballRim: '#0b1d1d',
    ballGlow: 0.35,
    palmFrond: { dark: '#0b2a27', light: '#14473f', trunk: '#0e2622' },
    gull: '#cfe3e0',
    shadow: 'rgba(0, 0, 0, 0.35)',
    confetti: ['#ffd45c', '#ffb534', '#ff9e8c', '#58e9d4', '#b6f5e2', '#22c3a1'],
  },
  /* A clear afternoon: the sun low over a turquoise sea, gulls, a far island. */
  light: {
    sky: ['#7fcfe4', '#bfe9f0', '#ffe9c9'],
    orb: '#fff6d6',
    orbShade: '#ffd977',
    halo: '#ffe4a3',
    haloAlpha: 0.6,
    stars: 0,
    star: '#ffffff',
    cloud: { body: '#ffffff', shade: '#d3ecf2', alpha: 0.85 },
    island: { far: '#7fbfb6', near: '#4f9f93', palm: '#3a8577' },
    lighthouse: { body: '#ffffff', band: '#ff8f7a', lamp: '#ffd45c' },
    sea: { horizon: '#7fd7d0', deep: '#178e98', line: '#b9f0ea', glint: '#ffffff' },
    foam: '#ffffff',
    surfGlow: 0,
    sand: ['#f6e2b6', '#f2dcae', '#eed6a6', '#e9cf9d', '#e4c894'],
    sandHi: '#fff4da',
    sandLo: '#c9a971',
    grain: '#c4a26c',
    grainLight: '#fffaf0',
    wet: '#c49b64',
    wetHi: '#dcb985',
    wetLo: '#946f42',
    castleDark: '#5d4228',
    crack: '#5a4128',
    shell: '#ffb3a1',
    shellLine: '#d7786a',
    starfish: '#ff8a5c',
    pebble: '#8aa9ab',
    glass: '#4fd1bb',
    board: { deck: '#fffdf6', rail: '#6f9c96', stripe: '#22c3a1', stripe2: '#ffb534', gloss: '#ffffff', fin: '#119079' },
    ball: ['#22c3a1', '#ffb534', '#ff8f7a'],
    ballWhite: '#ffffff',
    ballShade: '#0e4a4a',
    ballRim: '#0f3d3a',
    ballGlow: 0,
    palmFrond: { dark: '#2f8f6b', light: '#5bbf8f', trunk: '#9a7a5a' },
    gull: '#ffffff',
    shadow: 'rgba(14, 60, 60, 0.22)',
    confetti: ['#ffd45c', '#ffb534', '#ff8f7a', '#089b99', '#22c3a1', '#ffffff'],
  },
};
