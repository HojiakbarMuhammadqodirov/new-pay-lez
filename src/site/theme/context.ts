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
   * accent — the intro's brand mark, for one. Note this is not the CSS
   * `--on-accent`: that pairs with `--accent`, the bright fill, and this pairs
   * with the deeper `primary` the canvases draw with.
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
    // Deep enough to hold 5.4:1 against the light page, so the country label
    // over the globe stays readable at its small uppercase size.
    primary: '#0a7266',
    background: '#f4f7f6',
    onPrimary: '#f4f7f6',
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
