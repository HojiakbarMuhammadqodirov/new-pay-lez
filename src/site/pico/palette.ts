/**
 * Pico's colours — the only place they live.  ── ART ──
 *
 * Pico is the fifth sanctioned exception to the two-colour rule (root
 * `CLAUDE.md`): a teal parrot with an orange bill, a yellow crest and a pink
 * cheek *is* those colours, the way a flag or the controller's face buttons
 * are. Nothing outside this directory may name any of them, and nothing in
 * `site.css` may reach for them — the page keeps one accent on one ground with
 * a bird standing on it.
 *
 * Transcribed from `PicoPalette` in the app's `lib/widgets/pico.dart`, value for
 * value, so the mascot is the same bird on a phone and in a browser. If the
 * drawing is ever replaced, this file is replaced with it: callers only ever
 * reach `PICO_BRAND` and `picoMono` (through `pico/index.ts`) and must not build
 * a `PicoPalette` field by field, because the fields are the parts of *this*
 * drawing.
 */

/** Every part of the bird, as a CSS colour. */
export interface PicoPalette {
  /** Head and body. */
  readonly body: string;
  /** The underside and the far-side shading of the body. */
  readonly shade: string;
  /** The belly. */
  readonly light: string;
  /** The face mask around the eye. */
  readonly mask: string;
  readonly wing: string;
  /** Wing and tail tips. */
  readonly wingTip: string;
  /** Upper bill. */
  readonly beak: string;
  /** Lower bill and feet. */
  readonly beakLow: string;
  /** Crest tips. */
  readonly accent: string;
  /**
   * The cheek, drawn translucent. `null` leaves it out — the app's mono palette
   * paints it fully transparent, which is the same picture without the call.
   */
  readonly blush: string | null;
  /** Pupils and eye lines. */
  readonly ink: string;
}

/**
 * The mascot. A teal a step deeper than the app's brand mint `#7DE9CE`, so Pico
 * stands out against mint columns and on both the near-black stage and a light
 * page — which on this site means it reads on `#0d0d0e` and on paper without a
 * per-theme variant.
 */
export const PICO_BRAND: PicoPalette = Object.freeze({
  body: '#22c3a1',
  shade: '#15a487',
  light: '#b6f5e2',
  mask: '#f4fffb',
  wing: '#119079',
  wingTip: '#0a5e54',
  beak: '#ffb534',
  beakLow: '#f07f22',
  accent: '#ffd45c',
  blush: '#ff9e8c',
  ink: '#08201b',
});

/**
 * The catch-lights in the pupil. Fixed rather than per-palette in the app too:
 * a tinted glint stops reading as light on a wet eye and starts reading as a
 * second pupil.
 */
export const PICO_GLINT = '#ffffff';
/** `0xCCFFFFFF` in the app — the small, softer second glint. */
export const PICO_GLINT_SOFT = 'rgba(255, 255, 255, 0.8)';

/** How opaque the cheek is, by mood. Happy flushes to full. */
export const PICO_BLUSH_ALPHA = { rest: 0.85, happy: 1 } as const;

/* ── colour arithmetic ──────────────────────────────────────────────────── */

type Rgba = readonly [number, number, number, number];

/**
 * `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` to 0..255 channels.
 *
 * Hex only, on purpose: every colour a caller has to hand on this site is one —
 * `THEMES[…].primary` included — and a full CSS colour parser to cover the
 * rest would weigh more than the bird. Anything else is a programming error and
 * says so rather than drawing a black parrot.
 */
function parseHex(colour: string): Rgba {
  const hex = colour.trim().replace(/^#/, '');
  const full =
    hex.length === 3 || hex.length === 4
      ? hex.replace(/./g, (c) => c + c)
      : hex;
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(full)) {
    throw new Error(`Pico: expected a hex colour, got "${colour}"`);
  }
  const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), full.length === 8 ? n(6) : 255];
}

function toHex([r, g, b, a]: Rgba): string {
  const h = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}${a >= 255 ? '' : h(a)}`;
}

/**
 * Flutter's `Color.lerp`: every channel, alpha included, straight-line in sRGB.
 * Not a perceptual mix, because the app's isn't, and the point of this file is
 * that the two birds match.
 */
function lerp(a: Rgba, b: Rgba, t: number): Rgba {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t,
  ];
}

/** `a` moved `t` of the way to `b`, as a hex string. */
export function mixColour(a: string, b: string, t: number): string {
  return toHex(lerp(parseHex(a), parseHex(b), t));
}

const BLACK: Rgba = [0, 0, 0, 255];
const WHITE: Rgba = [255, 255, 255, 255];

/*
 * Memoised so a game can call `picoMono(theme.primary)` inside its frame loop
 * without parsing and allocating eleven strings sixty times a second — and so
 * the derived colours `paint.ts` caches per palette object stay cached. Bounded
 * because a caller animating its tint would otherwise grow this forever; a
 * theme switch is two entries, a fade is the case the cap is for.
 */
const MONO = new Map<string, PicoPalette>();
const MONO_CAP = 32;

/**
 * Every part a shade of `tint`: a silhouette with just enough inside it to
 * still read as Pico. The cheek is left out. Same derivation as the app's
 * `PicoPalette.mono` — the mix amounts below are its numbers.
 */
export function picoMono(tint: string): PicoPalette {
  const hit = MONO.get(tint);
  if (hit) return hit;
  const base = parseHex(tint);
  const mix = (to: Rgba, t: number) => toHex(lerp(base, to, t));
  const palette: PicoPalette = Object.freeze({
    body: toHex(base),
    shade: mix(BLACK, 0.14),
    light: mix(WHITE, 0.45),
    mask: mix(WHITE, 0.75),
    wing: mix(BLACK, 0.26),
    wingTip: mix(BLACK, 0.45),
    beak: mix(WHITE, 0.3),
    beakLow: mix(BLACK, 0.1),
    accent: mix(WHITE, 0.5),
    blush: null,
    ink: mix(BLACK, 0.7),
  });
  if (MONO.size >= MONO_CAP) MONO.clear();
  MONO.set(tint, palette);
  return palette;
}
