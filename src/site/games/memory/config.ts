import type { ThemeName } from '../../theme/context';

/**
 * Memory Match's world: a card table under a low lamp, with Pico dealing.
 *
 * **A scene palette, the same kind of exception as `LEVEL.palette`** and as
 * Word Builder's study (`games/word/config.ts`). The chrome — the header, the
 * stopwatch, the quit link — stays on the site's tokens; what is coloured here
 * is *things*: baize, a stained-wood rim, card stock, the printed backs. The
 * baize is the accent's own hue taken deep, which is what a card table is
 * anyway, so the room is the brand at table height rather than beside it; the
 * card faces are the warm off-white of Pico's belly; the backs are the teal of
 * his wing with a pale-gold ring round his badge — the one warm accent, lifted
 * from his crest.
 *
 * **The verdict is not in here.** Up is lifted and ringed in `--accent-lit`, a
 * match is the accent's fill on the label and the ring, exactly as before the
 * table existed. A player who learned the board's states on the old flat cards
 * reads them the same way on the new ones.
 *
 * Applied from TypeScript as `--mm-*` custom properties (`tableSceneStyle` in
 * `table.ts`) and read by the canvas through the same object; `site.css` never
 * names one of these colours. Light keeps the baize deep rather than pale: a
 * pale felt under ivory cards has no value step to stand them on, and the
 * whole point of a card table is that the cards jump off it.
 */
export interface MemoryScene {
  /* ── the room (canvas) ── */
  wallTop: string;
  wallBottom: string;
  /** The trellis on the wall — a card back's own lattice, at a whisper. */
  trellis: string;
  /** The lamp's light from above the table. */
  glow: string;
  mote: string;
  vignette: string;

  /* ── the table (DOM, through custom properties) ── */
  rim: string;
  rimHi: string;
  rimLo: string;
  felt: string;
  feltEdge: string;
  /** The specks the baize texture is made of. */
  nap: string;
  napLight: string;
  stitch: string;
  /** The lamp's pool on the baize. */
  pool: string;

  /* ── the cards ── */
  back: string;
  backDeep: string;
  backLine: string;
  backEdge: string;
  medal: string;
  medalRing: string;
  face: string;
  faceHi: string;
  faceEdge: string;
  /** A server board's symbols — they are marks, so they take ink. */
  glyph: string;
  /** The light that runs across a pair once as it is matched. */
  sheen: string;
  shadow: string;

  /* ── Pico's corner ── */
  paper: string;
  paperInk: string;
  paperMut: string;
}

export const MEMORY_SCENE: Record<ThemeName, MemoryScene> = {
  dark: {
    wallTop: '#0b1617',
    wallBottom: '#0c1213',
    trellis: 'rgba(88, 233, 212, 0.035)',
    glow: 'rgba(255, 220, 150, 0.1)',
    mote: 'rgba(255, 236, 196, 0.5)',
    vignette: 'rgba(0, 0, 0, 0.45)',

    rim: '#26443f',
    rimHi: '#3b6760',
    rimLo: '#10211f',
    felt: '#11564b',
    feltEdge: '#0a3631',
    nap: 'rgba(0, 0, 0, 0.16)',
    napLight: 'rgba(255, 255, 255, 0.045)',
    stitch: 'rgba(232, 255, 248, 0.16)',
    pool: 'rgba(255, 226, 160, 0.12)',

    back: '#137363',
    backDeep: '#0b463e',
    backLine: 'rgba(255, 255, 255, 0.075)',
    backEdge: 'rgba(241, 230, 200, 0.6)',
    medal: '#f2ead6',
    medalRing: '#e2c26a',
    face: '#eee6d2',
    faceHi: '#fbf7ec',
    faceEdge: '#b9aa8a',
    glyph: '#0f5a50',
    sheen: 'rgba(255, 255, 255, 0.55)',
    shadow: 'rgba(0, 0, 0, 0.5)',

    paper: '#ece5d1',
    paperInk: '#172d2a',
    paperMut: '#5f6d68',
  },
  light: {
    wallTop: '#f5f9f8',
    wallBottom: '#e3eeeb',
    trellis: 'rgba(0, 122, 120, 0.055)',
    glow: 'rgba(255, 236, 180, 0.32)',
    mote: 'rgba(214, 160, 40, 0.3)',
    vignette: 'rgba(4, 32, 31, 0.07)',

    rim: '#a7cbc1',
    rimHi: '#d3e8e2',
    rimLo: '#77a296',
    felt: '#1f8a78',
    feltEdge: '#156a5d',
    nap: 'rgba(0, 0, 0, 0.1)',
    napLight: 'rgba(255, 255, 255, 0.06)',
    stitch: 'rgba(255, 255, 255, 0.3)',
    pool: 'rgba(255, 246, 210, 0.18)',

    back: '#0f7466',
    backDeep: '#0a4d44',
    backLine: 'rgba(255, 255, 255, 0.09)',
    backEdge: 'rgba(255, 248, 228, 0.7)',
    medal: '#fffaf0',
    medalRing: '#e2c26a',
    face: '#fffaf0',
    faceHi: '#ffffff',
    faceEdge: '#d2c3a2',
    glyph: '#0b5e55',
    sheen: 'rgba(255, 255, 255, 0.75)',
    shadow: 'rgba(4, 32, 31, 0.3)',

    paper: '#fffdf6',
    paperInk: '#0f2b28',
    paperMut: '#56706a',
  },
};

/** How the room moves. Distances in CSS pixels, times in seconds. */
export const MEMORY_MOTION = {
  /** Dust in the lamp light over the table. */
  motes: 14,
  moteRise: 4,
  moteSway: 8,
  moteSwayPeriod: 8,
  /**
   * How long Pico stays pleased after a pair, in milliseconds — long enough to
   * be seen with the eyes still on the cards, short enough that he is idle
   * again before the next pair is turned.
   */
  cheerMs: 1500,
  /** And how long he stays downcast once a missed pair has gone back down. */
  sulkMs: 450,
} as const;

/** The wall's lattice: diagonal lines this far apart. */
export const MEMORY_TRELLIS = { pitch: 34 } as const;
