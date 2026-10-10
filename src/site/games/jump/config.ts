import type { ThemeName } from '../../theme/context';

/**
 * Pico Jump's world — every colour and every number the climb is *drawn* with,
 * and nothing it is *played* with.
 *
 * The game is `DOODLE` and `doodleAdvance` in `games/arcade.ts`, mirrored from
 * the server and pinned by both suites. Nothing in this file is read by them,
 * so no value below can make a climb easier, harder, longer or better paid:
 * the platforms land where the dealt numbers put them and are exactly
 * `DOODLE.platformW` wide however they are dressed, and Pico's body is exactly
 * `DOODLE.jumperW` across. Change anything here freely.
 *
 * ── The climb is a journey up through three skies ──
 *
 * The website's level is the first fifty platforms, so the picture can be
 * *authored* rather than tiled: the bottom third is a jungle (Pico's home —
 * branches to stand on, trunks and vines at the sides, fireflies or pollen in
 * the air), the middle third is the clouds (the canopy and the far mountains
 * sink away below), and the top is the high sky (stars, the moon or the sun,
 * floating rocks with crystals in them) up to the summit and its flag. Which
 * skin a platform wears is its *index*, so a platform is the same object on
 * every round and the zone a player has reached reads at a glance.
 *
 * ── Why this file carries hues ──
 *
 * The page is one accent on one ground; the stage is a picture of a place, the
 * same exception `LEVEL.palette` and the flight's scene take. It is held to the
 * same three constraints the flight states:
 *
 *  1. **Teal is the key.** Sky, foliage, clouds and stone are blue-green at the
 *     lightnesses depth needs. Wood is the one warm material, because a
 *     platform has to separate from the canopy behind it by hue as well as
 *     value.
 *  2. **The warm notes are Pico's own** — flowers, fireflies, the sun, the
 *     confetti — amber, coral and the crest's yellow, never a new family.
 *  3. **The brand accent is the goal.** The crystals in the high rocks and the
 *     summit's pennant are `THEMES[…].primary`, passed in rather than restated
 *     here: the thing at the top of the climb is drawn in the colour that means
 *     points everywhere else on the site.
 *
 * Nothing here may leak into `site.css`. The hover miniature sets the few
 * colours it needs as inline custom properties (`jumpPreviewVars`).
 */

/** Where each skin starts, by platform index (0-based). The last platform is the summit. */
export const JUMP_ZONES = {
  /** Platforms 0…cloud-1 are branches. */
  cloud: 16,
  /** cloud…rock-1 are clouds; rock…summit-1 are floating rocks. */
  rock: 33,
} as const;

export const JUMP_SCENE = {
  /**
   * How far above the canvas's bottom edge the floor is drawn, as a share of
   * the field's height. Drawing only: the physics' camera and its fall margin
   * are untouched, so the fall still ends just past the bottom edge — but
   * Pico is seen whole standing on the grass at the start, and the last
   * sliver below the camera (where a falling Pico can still be caught by a
   * platform) is on screen instead of hidden.
   */
  lift: 0.06,
  /**
   * Before Start the view sits this much lower (field heights), so Pico and
   * the jungle floor stand clear above the ready veil's intro and button; the
   * view eases up to the camera in the first instant of the round. Drawing
   * only — the camera itself starts at 0 as it always has.
   */
  readyDrop: 0.5,
  /**
   * Pico's feet below the body's centre, in body radii. The drawing's toes
   * sit 31 design units under its body centre (radius 23), so 1.3 puts the
   * toes *on* a platform's top rather than through it.
   */
  feet: 1.3,
  /** Backing-store ceiling: a scene of broad flat shapes buys nothing past 2×. */
  maxRatio: 2,
  /** The world the sky ribbon spans, in field heights (the summit is ≈ 8.8). */
  sky: { from: -0.6, to: 10.6 },

  /** Parallax: how fast each layer climbs relative to the platforms (1). */
  parallax: {
    stars: 0.06,
    orb: 0.1,
    mountains: 0.13,
    farClouds: 0.3,
    canopy: 0.38,
    nearClouds: 0.62,
    trunks: 0.78,
  },

  /** Background clouds: how many, and the band of camera heights they belong to. */
  clouds: { far: 14, near: 10, from: 2.1, to: 8.2 },
  /**
   * The cloud sea, in field heights: the altitude its top sits at (between the
   * last branch and the first cloud platform) and how fast it scrolls. Pico
   * climbs up out of the jungle through it and sees it below him after.
   */
  bank: { at: 2.75, parallax: 0.92 },
  /**
   * Things adrift in the cloud band, behind everything that can be stood on:
   * sky lanterns rising by night, hot-air balloons and a flock by day. Their
   * band of camera heights, how many, and how fast they scroll.
   */
  drifters: { count: 6, from: 2.6, to: 6.6, parallax: 0.5 },
  /** The moon/sun rises into view around this camera height. */
  orbAt: 7.6,
  /** Fireflies (night) or pollen (day) in the jungle band. */
  motes: { count: 26, top: 3.2 },

  /** Platforms: drawn thickness as a share of the field's height. */
  slab: 0.022,
  /** Climbed platforms recede: the next one up is the one to look at. */
  climbedAlpha: 0.58,
  /** The landing dip, in CSS px at a 360px field, and how long it lasts. */
  dip: { depth: 4, seconds: 0.24 },
  /** Squash on landing: how much, and for how long. */
  squash: { amount: 0.2, seconds: 0.13 },
  /** Stretch while rising fast, at take-off speed. */
  stretch: 0.07,
  /** Seconds Pico grins after a tenth platform. */
  cheer: 0.8,
  /** Wing beats per second: rising at take-off speed, and gliding down. */
  beats: { rising: 4.4, gliding: 1.4 },
  /**
   * After a fall, Pico pops back up into view knocked out and tumbles off the
   * bottom — the beat before the end veil. The hop's speed (field heights/s),
   * gravity (field heights/s²) and the spin (turns/s). Picture only: the
   * round ended on the frame the fall did.
   */
  tumble: { hop: 1.05, gravity: 3.4, spin: 0.9 },
  /** Particle pool size. */
  particles: 96,
} as const;

/** One theme's colours. Every field is a CSS colour (hex, or rgba where alpha is the point). */
export interface JumpPalette {
  /** The sky, by altitude in field heights, bottom to top. */
  sky: readonly (readonly [number, string])[];
  /** The haze laid over the foot of the view in the jungle, and its strength. */
  haze: string;
  hazeAlpha: number;
  star: string;
  starWarm: string;
  /** The band of camera heights the stars fade in over, and how bright they get. */
  starsIn: readonly [number, number];
  starMax: number;
  /** The few big four-point stars that twinkle; 0 leaves them out (a day sky). */
  twinkleMax: number;
  /** High wisps of cloud across the top of the climb; 0 draws none. */
  cirrus: number;
  /** Aurora alpha at full height; 0 draws none. */
  aurora: number;
  /** The moon (night) or the sun (day). */
  orb: string;
  orbShade: string;
  halo: string;
  haloAlpha: number;

  mountains: { far: string; near: string; snow: string; mist: string; mistAlpha: number };
  /** The clouds Pico stands on: solid, lit, with a clear underside. */
  cloud: { body: string; shade: string; rim: string };
  /**
   * The clouds behind: a gradient that sits close to the sky, and a rim of
   * light. Deliberately softer than `cloud` — a background cloud that reads as
   * solid is a platform that isn't there.
   */
  backCloud: { top: string; bottom: string; rim: string };
  cloudAlphaFar: number;
  cloudAlphaNear: number;
  /** The sea of cloud Pico climbs up through between the jungle and the sky. */
  bank: { top: string; body: string; rim: string; alpha: number };
  /** Moonbeams by night, sunbeams by day, slanting into the jungle. */
  beam: string;
  beamAlpha: number;
  /** Night's drifters are sky lanterns: paper, the lit core, the glow. */
  lantern: { paper: string; light: string; glow: string };
  /** Day's are balloons: three stripe colours, the basket; and the flock. */
  balloon: readonly [string, string, string];
  basket: string;
  bird: string;

  canopy: { back: string; mid: string; front: string; light: string };
  trunk: { bark: string; shade: string; light: string };
  leaf: { dark: string; mid: string; light: string; vein: string };
  ground: { soil: string; deep: string; root: string; grass: string; grassLight: string; rock: string };
  /** Flowers and berries: Pico's warm notes. */
  bloom: readonly [string, string, string];
  /** Fireflies by night, pollen by day: the core and its glow. */
  mote: string;
  moteGlow: string;
  moteGlowAlpha: number;
  /** The mushrooms by the left bush: stalk, and the spots on the cap (the cap is a bloom). */
  stalk: string;
  spot: string;
  /** Neutral light and shade laid over a surface (crystal facets, the pennant's fold). */
  glint: string;
  fold: string;

  branch: { bark: string; shade: string; rim: string; knot: string };
  rock: { face: string; shade: string; rim: string; moss: string; mossLight: string };
  /** The summit's snow cap. */
  snow: string;
  snowShade: string;
  /** Milestone signs: wood and ink. */
  sign: string;
  signInk: string;
  pole: string;
  /** The soft shadow Pico casts on the platform under him. */
  shadow: string;
  /** How strong the summit's sunburst is: a glow by night, a hint by day. */
  rays: number;
  confetti: readonly string[];
}

export const JUMP_PALETTE: Record<ThemeName, JumpPalette> = {
  /* A moonlit jungle, a silver sea of cloud, then deep night and the aurora. */
  dark: {
    sky: [
      [-0.6, '#061412'],
      [0.6, '#0a201d'],
      [2.2, '#0c2a2b'],
      [3.6, '#11323b'],
      [5.2, '#102a3c'],
      [6.8, '#0c1d35'],
      [8.4, '#08132b'],
      [10.6, '#050a1c'],
    ],
    haze: '#58e9d4',
    hazeAlpha: 0.07,
    star: '#e9fbff',
    starWarm: '#ffe7b0',
    starsIn: [1.4, 5.2],
    starMax: 1,
    twinkleMax: 1,
    cirrus: 0,
    aurora: 0.32,
    orb: '#f4fbf6',
    orbShade: '#cfe3dc',
    halo: '#c8fff0',
    haloAlpha: 0.16,
    mountains: { far: '#0f2b32', near: '#0c2327', snow: '#5d8a8f', mist: '#58e9d4', mistAlpha: 0.05 },
    cloud: { body: '#cfe3ea', shade: '#7d9db0', rim: '#f4feff' },
    backCloud: { top: '#3e6470', bottom: '#14323b', rim: '#8fbcc4' },
    cloudAlphaFar: 0.36,
    cloudAlphaNear: 0.5,
    bank: { top: '#4d7581', body: '#1d4049', rim: '#a9d2d8', alpha: 0.92 },
    beam: '#9ff5e6',
    beamAlpha: 0.07,
    lantern: { paper: '#ffb534', light: '#fff1c4', glow: '#ffc861' },
    balloon: ['#ff9e8c', '#ffd45c', '#f4fbf6'],
    basket: '#8a6a4c',
    bird: '#0a1a1c',
    canopy: { back: '#0b2622', mid: '#0e302a', front: '#123a31', light: '#1c5546' },
    trunk: { bark: '#1b2f29', shade: '#132420', light: '#2d4a40' },
    leaf: { dark: '#14523f', mid: '#1f7a5c', light: '#3fbf90', vein: '#0d3a2d' },
    ground: { soil: '#0e221c', deep: '#07130f', root: '#1a2d26', grass: '#17503d', grassLight: '#2c8a66', rock: '#22332f' },
    bloom: ['#ffb534', '#ff9e8c', '#ffd45c'],
    mote: '#ffe9a0',
    moteGlow: '#ffe28c',
    moteGlowAlpha: 0.45,
    stalk: '#d9d2c4',
    spot: '#fff1e6',
    glint: 'rgba(255, 255, 255, 0.45)',
    fold: 'rgba(0, 0, 0, 0.16)',
    branch: { bark: '#7a5c43', shade: '#4e3a2b', rim: '#b08b67', knot: '#5d4532' },
    rock: { face: '#3f5d68', shade: '#273d47', rim: '#7da3ad', moss: '#1f7a5c', mossLight: '#43c495' },
    snow: '#e8f6f7',
    snowShade: '#a9c7cc',
    sign: '#a58462',
    signInk: '#2a1e15',
    pole: '#d9e6e3',
    shadow: 'rgba(0, 0, 0, 0.32)',
    rays: 1,
    confetti: ['#ffd45c', '#ffb534', '#ff9e8c', '#58e9d4', '#b6f5e2', '#22c3a1'],
  },
  /* A misty morning jungle, a bright sky of cloud, then the deep blue up high. */
  light: {
    sky: [
      [-0.6, '#cbead9'],
      [0.6, '#d8f1e4'],
      [2.2, '#d0f0ee'],
      [3.6, '#bfe8f2'],
      [5.2, '#a5dbef'],
      [6.8, '#7fc0e3'],
      [8.4, '#5a9fd0'],
      [10.6, '#3f7cb4'],
    ],
    haze: '#ffffff',
    hazeAlpha: 0.4,
    star: '#ffffff',
    starWarm: '#fff1c9',
    starsIn: [6.2, 8.4],
    starMax: 0.55,
    twinkleMax: 0,
    cirrus: 0.5,
    aurora: 0,
    orb: '#fff6d6',
    orbShade: '#ffe08a',
    halo: '#ffecaa',
    haloAlpha: 0.45,
    mountains: { far: '#9fd3cf', near: '#7dbfb5', snow: '#f4fbfa', mist: '#ffffff', mistAlpha: 0.45 },
    cloud: { body: '#ffffff', shade: '#a9cbd9', rim: '#ffffff' },
    backCloud: { top: '#f4fbfd', bottom: '#c4e4ef', rim: '#ffffff' },
    cloudAlphaFar: 0.45,
    cloudAlphaNear: 0.62,
    bank: { top: '#ffffff', body: '#d6eef4', rim: '#ffffff', alpha: 0.95 },
    beam: '#fffbe6',
    beamAlpha: 0.32,
    lantern: { paper: '#ffb534', light: '#fff1c4', glow: '#ffc861' },
    balloon: ['#ff8f7a', '#ffd45c', '#ffffff'],
    basket: '#8c6748',
    bird: '#2f5f66',
    canopy: { back: '#a3d9bf', mid: '#7cc6a2', front: '#5bb38a', light: '#9fe0bd' },
    trunk: { bark: '#8f7258', shade: '#735a44', light: '#b39678' },
    leaf: { dark: '#2f8f6b', mid: '#3fae84', light: '#7fd9ae', vein: '#25765a' },
    ground: { soil: '#7f644b', deep: '#5c4634', root: '#94775b', grass: '#4daa7c', grassLight: '#86d6a7', rock: '#a9b9b2' },
    bloom: ['#ffb534', '#ff8f7a', '#ffd45c'],
    mote: '#fff7d1',
    moteGlow: '#fff6c8',
    moteGlowAlpha: 0.6,
    stalk: '#f4efe6',
    spot: '#fff6ec',
    glint: 'rgba(255, 255, 255, 0.5)',
    fold: 'rgba(0, 0, 0, 0.12)',
    branch: { bark: '#8c6748', shade: '#644733', rim: '#c39c74', knot: '#6e5039' },
    rock: { face: '#7d9ba3', shade: '#5b7880', rim: '#bcd4d8', moss: '#3fae84', mossLight: '#86dcb1' },
    snow: '#ffffff',
    snowShade: '#cfe4e8',
    sign: '#b48f69',
    signInk: '#3b2a1c',
    pole: '#f4f8f7',
    shadow: 'rgba(16, 60, 52, 0.2)',
    rays: 0.45,
    confetti: ['#ffd45c', '#ffb534', '#ff8f7a', '#089b99', '#22c3a1', '#ffffff'],
  },
};
