/**
 * The world Pico flies through — every colour and every number the scene is
 * drawn with, and nothing the game is *played* with.
 *
 * `config.ts` next door is the game: gravity, the gap, the scroll, the hit
 * circle. This file is the picture around it, and the split is the whole of
 * the rule that keeps a redesign honest: nothing in here is read by
 * `engine.ts`, so no value below can make a run easier, harder, longer or
 * better paid. Change any of it freely; change `config.ts` only with
 * `npm run verify` watching.
 *
 * Units are the game's — world units, 100 to the stage's height — so the scene
 * scales with the stage exactly as the columns do, and a ridge that sits under
 * the gap band on a phone sits under it on a monitor.
 *
 * ── Why this file carries hues ──
 *
 * The page is one accent on one ground, and the stage is not the page: it is a
 * picture of a place, the way `LEVEL.palette` is a picture of a level. A sky,
 * stone and grass drawn in mint at five alphas read as a wiring diagram, and a
 * mascot with an orange bill and a yellow crest standing in that is a sticker
 * on a blueprint. So the scene gets its own palette — **and it is held to
 * three constraints that keep it inside the brand rather than beside it**:
 *
 *  1. **Teal is the key.** Sky, mountains, hills, moss and grass are all the
 *     same blue-green family as `#58e9d4` / `#089b99`, at the lightnesses depth
 *     needs. The one warm material is the stone, and it is warm for a reason:
 *     a column has to separate from the sky by *hue* as well as value, or a
 *     pale column on a pale day sky is a ghost (Flappy Bird's green pipes on
 *     its blue sky are the same trick).
 *  2. **The warm notes are Pico's own.** Lit windows, the sun and the few
 *     flowers sit in the amber/coral range of his bill, crest and cheek — never
 *     a new hue, so the picture reads as his world and not as a second brand.
 *  3. **The brand accent is the magic.** The runes carved into every gate are
 *     the page's own accent (`THEMES[…].primary`, passed in, not restated
 *     here), and they light up as Pico flies through. The one thing on the
 *     stage that means "points" is drawn in the colour that means points
 *     everywhere else on the site.
 *
 * Nothing here may leak into `site.css`. The DOM never needs a scene colour
 * except in the hover miniature, and that sets the few it needs as inline
 * custom properties from this file (see `games/preview.tsx`).
 *
 * Keyed by `tone` — `glow` is the dark page (a moonlit night), `ink` the light
 * one (a clear day) — the same key `FLIGHT.tone` and `LEVEL.palette` use.
 */

/** One ridge of mountains: the face turned to the light, the face away, the snow. */
export interface RidgePalette {
  lit: string;
  shade: string;
  cap: string;
  capShade: string;
}

export interface ScenePalette {
  /** Top of the sky to the horizon, with where each stop sits (0..1 of the stage). */
  sky: readonly [string, string, string, string];
  skyAt: readonly [number, number, number, number];
  /** The low band of light behind the far mountains. */
  horizon: string;
  horizonAlpha: number;
  /** The moon or the sun. `shade` is its craters or its inner disc. */
  orb: string;
  orbShade: string;
  halo: string;
  haloAlpha: number;
  /** Night only: how many stars, and their two temperatures. */
  stars: number;
  star: string;
  starWarm: string;
  /** Night only: the aurora ribbon's alpha; 0 draws none. */
  aurora: number;
  cloud: { body: string; shade: string; rim: string; alpha: number };
  far: RidgePalette;
  mid: RidgePalette;
  /** Valley fog laid over the foot of each mountain layer. */
  mist: string;
  mistAlpha: number;
  town: {
    hill: string;
    hillLit: string;
    wall: string;
    wallShade: string;
    roof: string;
    roofShade: string;
    /** A dark pane, and a lit one. By day both are the sky in the glass. */
    pane: string;
    paneLit: string;
    /** The halo around a lit pane; alpha 0 by day. */
    paneGlow: string;
    paneGlowAlpha: number;
    /** Share of panes that are lit. */
    litShare: number;
  };
  hills: { back: string; base: string; lit: string; tree: string; treeLit: string; trunk: string };
  stone: { lit: string; face: string; shade: string; deep: string; seam: string };
  moss: { deep: string; base: string; lit: string };
  vine: string;
  leaf: string;
  leafLit: string;
  /** The two flower colours, after Pico's cheek and crest. */
  bloom: readonly [string, string];
  ground: { soil: string; soilDeep: string; pebble: string; grass: string; grassLit: string; blade: string };
  /** Fireflies at night, drifting pollen by day. */
  mote: string;
  moteKind: 'firefly' | 'pollen';
  /** Distant birds crossing the sky — the one thing the scene says about Pico's kind. */
  flock: string;
  wind: string;
  windAlpha: number;
  /** The impact star when a run ends. */
  flash: string;
  /** How bright a gate's runes sit before Pico has flown through it, and after. */
  rune: { rest: number; lit: number };
}

/**
 * The scene's tunables. All positions are world units (the stage is 100 tall
 * and about 71 wide); all speeds are world units per second; all parallax
 * factors are fractions of the game plane's own scroll.
 */
export const SCENE = {
  palette: {
    /*
     * A moonlit night. Every layer is a step lighter and bluer than the one in
     * front of it — atmospheric perspective, and the only depth cue a flat
     * illustration has — and the columns are moonlit limestone, the lightest
     * mass below the sky, so the gate reads before anything else does.
     */
    glow: {
      sky: ['#030c14', '#072230', '#0d3a46', '#1b5c62'],
      skyAt: [0, 0.34, 0.6, 0.8],
      horizon: '#58e9d4',
      horizonAlpha: 0.1,
      orb: '#eafbf4',
      orbShade: '#cfe8df',
      halo: '#bdf6e8',
      haloAlpha: 0.05,
      stars: 64,
      star: '#e8fff9',
      starWarm: '#ffe2a6',
      aurora: 0.36,
      cloud: { body: '#143745', shade: '#0e2c38', rim: '#2b6470', alpha: 0.9 },
      far: { lit: '#1d5560', shade: '#164651', cap: '#7fb7b0', capShade: '#5d9592' },
      mid: { lit: '#123f4a', shade: '#0e333d', cap: '#4f8b88', capShade: '#3d7370' },
      mist: '#2a6e72',
      mistAlpha: 0.32,
      town: {
        hill: '#0a2a33',
        hillLit: '#0e333d',
        wall: '#0d3039',
        wallShade: '#09242c',
        roof: '#103a44',
        roofShade: '#0a2a33',
        pane: '#143a44',
        paneLit: '#ffcf73',
        paneGlow: '#ffbf5a',
        paneGlowAlpha: 0.2,
        litShare: 0.55,
      },
      hills: {
        back: '#08232b',
        base: '#061d24',
        lit: '#0b2b33',
        tree: '#05171d',
        treeLit: '#0c2f37',
        trunk: '#04131a',
      },
      stone: { lit: '#a7c3bb', face: '#809d97', shade: '#5f7b77', deep: '#465f5c', seam: '#3b5250' },
      moss: { deep: '#1b6b55', base: '#28896b', lit: '#43ad86' },
      vine: '#1b6450',
      leaf: '#2f9474',
      leafLit: '#4dbb92',
      bloom: ['#ff9d88', '#ffd36a'],
      ground: {
        soil: '#0f2a2f',
        soilDeep: '#0a1e23',
        pebble: '#23434a',
        grass: '#1c6b56',
        grassLit: '#2f8f71',
        blade: '#258066',
      },
      mote: '#ffe08a',
      moteKind: 'firefly',
      flock: '#0b2730',
      wind: '#c6fbef',
      windAlpha: 0.13,
      flash: '#f4fffb',
      rune: { rest: 0.4, lit: 1 },
    },
    /*
     * A clear day. The sky is the light theme's own cyan opened up to air, the
     * far ridges fade into it, and the columns are warm sandstone — mid-value
     * and the one warm mass on the stage, so they part from a pale sky by hue
     * where they cannot by lightness.
     */
    ink: {
      sky: ['#2fa6c6', '#69c6da', '#ace3e6', '#e6f7ef'],
      skyAt: [0, 0.34, 0.6, 0.8],
      horizon: '#fff4d2',
      horizonAlpha: 0.5,
      orb: '#fff8dc',
      orbShade: '#ffe9a6',
      halo: '#fff3c4',
      haloAlpha: 0.16,
      stars: 0,
      star: '#ffffff',
      starWarm: '#ffffff',
      aurora: 0,
      cloud: { body: '#ffffff', shade: '#d4ecee', rim: '#ffffff', alpha: 0.96 },
      far: { lit: '#a9d9da', shade: '#92c8cc', cap: '#f6fcfb', capShade: '#d9eeef' },
      mid: { lit: '#80bfbc', shade: '#6aadac', cap: '#e8f7f4', capShade: '#c6e3e1' },
      mist: '#eef9f4',
      mistAlpha: 0.55,
      town: {
        hill: '#5aa596',
        hillLit: '#6cb5a5',
        wall: '#e9f2ea',
        wallShade: '#c7ddd4',
        roof: '#2f8f87',
        roofShade: '#237670',
        pane: '#7fb3b2',
        paneLit: '#a9d6d6',
        paneGlow: '#ffffff',
        paneGlowAlpha: 0,
        litShare: 0.3,
      },
      hills: {
        back: '#58a68f',
        base: '#3f927b',
        lit: '#55a98e',
        tree: '#2c7a66',
        treeLit: '#4a9f84',
        trunk: '#5b4a3c',
      },
      stone: { lit: '#f1dcb4', face: '#ddbf8f', shade: '#c09d6e', deep: '#a3805a', seam: '#8f6e4c' },
      moss: { deep: '#2e8462', base: '#44a477', lit: '#6cc795' },
      vine: '#2d7f5f',
      leaf: '#3f9f73',
      leafLit: '#69c493',
      bloom: ['#ff8b78', '#ffc94a'],
      ground: {
        soil: '#8a6a4c',
        soilDeep: '#6c513b',
        pebble: '#b08d68',
        grass: '#3c9e72',
        grassLit: '#62bf8d',
        blade: '#4cae7f',
      },
      mote: '#ffffff',
      moteKind: 'pollen',
      flock: '#2d6d72',
      wind: '#ffffff',
      windAlpha: 0.42,
      flash: '#ffffff',
      rune: { rest: 0.5, lit: 1 },
    },
  } satisfies Record<'glow' | 'ink', ScenePalette>,

  /**
   * The moon or the sun, as fractions of the stage's width and world units
   * down. Upper right, ahead of Pico, so he is always flying toward the light
   * and every lit face in the picture is the one turned to the right.
   */
  orb: { x: 0.76, y: 15, r: 4.4, halo: [6.2, 8.4, 11.2] as const },

  /**
   * How far apart a layer repeats, in world units. Wider than any stage the
   * game makes (71) so a repeat is never on screen twice, and an even number of
   * every period below divides it, so each ridge closes on itself seamlessly.
   */
  period: 168,

  /**
   * The parallax layers, far to near. `factor` is the share of the game
   * plane's scroll each one moves by — the far range barely creeps, the hills
   * in front of the town move at half the columns' speed — and `ridge` is the
   * band (world units from the top) its skyline wanders in.
   *
   * The skyline bands are set by the gap band, not by taste: a gap's centre
   * sits between 26 and 74, so the busy town lives below 66 and the far peaks
   * above it, and Pico — who spends his life in that band — is always seen
   * against open sky or the soft, low-contrast far range, never against the
   * lit windows that would hide him.
   */
  layers: {
    far: { factor: 0.05, ridge: [40, 58] as const, peaks: 9 },
    mid: { factor: 0.12, ridge: [52, 68] as const, peaks: 12 },
    town: { factor: 0.24, ridge: [68, 76] as const },
    hills: { factor: 0.48, ridge: [80, 88] as const },
  },

  /** Clouds: how many, the band they drift in, and how fast the wind carries them. */
  clouds: { count: 6, band: [8, 46] as const, drift: [0.5, 1.4] as const, factor: [0.04, 0.12] as const },

  /**
   * The ground strip. **Thin on purpose**, and the reason is the floor: the run
   * ends when the hit circle touches `worldHeight`, so every unit of ground
   * drawn above it is a unit Pico visibly sinks into the turf before the game
   * calls it. The soil starts 1.6 units up and the grass tops out under four —
   * enough to read as the ground he will hit, little enough that the crash
   * lands where the eye already expects it.
   */
  ground: { soil: 98.4, turf: 97.7, blades: 95.8, period: 48 },

  /**
   * The columns' dress, all of it inside the collision rectangle except where
   * it is softer than stone: the capital overhangs by `overhang` (a lenient
   * lie — the bird may brush it and live), moss heaps up to `moss` above a
   * standing column's mouth, and a few vine tips hang `drip` below a hanging
   * one. Nothing solid-looking is drawn *outside* the rectangle the engine
   * tests, which is the line between decoration and a hitbox that lies.
   */
  column: { variants: 3, overhang: 0.45, moss: 0.9, drip: 1.5, length: 106, course: 3.2 },

  /** Ambient life. Counts are per stage; positions are deterministic in time, so nothing here is stateful. */
  motes: 12,
  wind: { count: 6, speed: 1.9, length: [5, 11] as const },
  flock: { every: 17, birds: 4, speed: 7, y: [14, 30] as const },

  /** Feathers: a fixed pool, a couple on every flap, a burst on the crash. */
  feathers: { pool: 40, perFlap: 2, burst: 14, life: [0.55, 1.05] as const, size: [1.1, 1.8] as const },

  /** Sparks off a gate as Pico clears it — the brand accent, the colour of points. */
  sparks: { pool: 24, perGate: 7, life: 0.7 },

  /**
   * Pico at rest and on the wing.
   *
   * `ready` is the hover before the first tap: a slow bob and an unhurried
   * beat, so the stage is alive while it waits. `beats` is the cruising wing
   * rate; a tap snaps the wing to the top of its stroke and drives it through
   * the downstroke at `burst`, easing back to `beats` over `settle` seconds, so
   * every press is answered by a visible stroke — the wing is the flap.
   */
  pico: {
    ready: { bob: 1.1, hz: 0.75, beats: 1.8 },
    beats: 2.6,
    burst: 7,
    settle: 0.32,
  },

  /**
   * The crash, all of it cosmetic: the engine has already stopped the world.
   * Pico is knocked up and back, tumbles under the game's own gravity until he
   * meets the turf, and the stage shakes once. `veilAfter` is how long the
   * tumble plays before the end veil fades over it — see `.fly-over`.
   */
  crash: { knock: -24, drift: -6, spin: 8.5, shake: 0.8, shakeFor: 0.38, flashFor: 0.26 },
} as const;

export type SceneTone = keyof typeof SCENE.palette;
