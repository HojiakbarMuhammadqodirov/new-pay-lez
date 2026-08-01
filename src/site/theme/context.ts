/**
 * Theme context and the palettes the 3D layers read.
 *
 * Split from the provider component so the module exports no components — a
 * file mixing the two breaks React fast refresh. Same shape as `i18n/context`.
 *
 * CSS gets its colours from custom properties in `site.css`; WebGL cannot, so
 * the handful of values the canvases need are duplicated here. They are the
 * *only* place the two systems have to agree, and the comments on `THEMES` say
 * which CSS token each one mirrors.
 */
import { createContext, useContext } from 'react';

export type ThemeName = 'dark' | 'light';

/**
 * How the globe composites its accent over the page colour.
 *
 * `glow` — additive, the neon original: the accent is *added* to the
 * background, so it can only brighten. Correct on near-black, useless on paper.
 *
 * `ink`  — alpha-blended: the accent is laid *over* the background, so it
 * darkens. The same geometry, drawn as ink on a light ground.
 */
export type GlobeTone = 'glow' | 'ink';

export interface ThemePalette {
  /** Accent for every 3D layer. Mirrors `--accent-ink`. */
  primary: string;
  /** What the 3D layers treat as "the page". Mirrors `--bg`. */
  background: string;
  /**
   * Legible against `primary`, for the few places something sits *on* the
   * accent — the intro's brand mark, for one.
   *
   * The counterpart of CSS `--on-accent`, but **not a copy of it**, and this is
   * the field where that matters: `--on-accent` pairs with `--accent`, the mint
   * fill, and is near-black on it. This one pairs with `primary` above, which is
   * `--accent-ink` — the darker teal the canvases need — and is the page colour
   * on it. The two are opposite in light for the same reason both are correct:
   * they sit on different colours. Kept as its own field precisely so nobody
   * "fixes" one to match the other.
   */
  onPrimary: string;
  tone: GlobeTone;
  /**
   * Bloom multiplier. Zero on light: bloom adds light, and there is no headroom
   * left above a near-white page — every flare would clip to flat white and eat
   * the borders with it.
   */
  glow: number;
}

export const THEMES: Record<ThemeName, ThemePalette> = {
  dark: {
    primary: '#58e9d4',
    background: '#0d0d0e',
    onPrimary: '#05201c',
    tone: 'glow',
    glow: 1,
  },
  light: {
    /*
     * `--accent-lit` — the middle step of the light ramp, and the same hex.
     *
     * These layers are shapes, so they want `--accent`, not the text ink — but
     * `tone: 'ink'` alpha-blends them onto near-white, and the globe is mostly
     * one-pixel coastlines. At the full `#2af3d1` (1.3:1 against the page) the
     * sphere survives as a pale disc and every coastline, route and link
     * disappears: not a softer globe, an empty one. So it lands on exactly the
     * step CSS uses for its own strokes — every icon on the page and every line
     * on the globe are then literally one colour, which is the point.
     *
     * The globe's country label is a word, not a shape, and is handled where it
     * belongs: `CountryCard.css` colours it from `--accent-ink` and falls back
     * to this only when the site stylesheet is absent.
     */
    primary: '#089b99',
    background: '#f5f9f8',
    /* Near-black, not the page: the mark is *filled* with `primary` now, and a
       page-coloured letter on neon is 1.3:1. Mirrors `--on-accent`. */
    onPrimary: '#04201f',
    tone: 'ink',
    glow: 0,
  },
};

export interface ThemeValue {
  theme: ThemeName;
  setTheme: (next: ThemeName) => void;
  toggle: () => void;
  palette: ThemePalette;
}

export const ThemeContext = createContext<ThemeValue | null>(null);

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}

/** Just the 3D palette, for the canvases. */
export function usePalette(): ThemePalette {
  return useTheme().palette;
}
