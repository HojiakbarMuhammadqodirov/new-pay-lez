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
  /**
   * Accent for every 3D layer. Mirrors `--accent` — the *fill* step of the
   * ramp, in both themes.
   *
   * Not `--accent-ink`, which is what this used to say and is only true in
   * dark, where all three steps are one mint. On paper `--accent-ink` is
   * `#007a78`, two stops down, and these layers are shapes rather than
   * hairlines: they want the fill. (Light's `--accent` and `--accent-lit` are
   * the same value, so either name is honest; `--accent` is the one that also
   * holds in dark.)
   */
  primary: string;
  /** What the 3D layers treat as "the page". Mirrors `--bg`. */
  background: string;
  /**
   * Legible against `primary`, for the few places something sits *on* the
   * accent — the parrot's beak and feet in the flight game, for one. (It used
   * to say "the intro's brand mark"; the intro is pure type now and takes no
   * palette beyond `primaryColor` / `backgroundColor`.)
   *
   * The counterpart of CSS `--on-accent`, but **not a copy of it**, and light
   * is where that bites: `--on-accent` there is `#ffffff` and this is
   * `#04201f`. Both sit on the same `#089b99`, so this is not the two of them
   * pairing with different colours — it is the two of them answering different
   * questions about the same one. Near-black wins on contrast (4.2:1 against
   * white's 3.4:1) and white wins on *looking like a button you press*, which
   * `site.css` argues for at the point of use. A canvas has no buttons, so a
   * shape drawn on a filled accent takes the contrast. Kept as its own field
   * precisely so nobody "fixes" one to match the other.
   */
  onPrimary: string;
  /**
   * The brand mark for this theme, as a URL. Mirrors the `--logo` token in
   * `site.css`; change one and change the other.
   *
   * **Nothing reads this today.** It was here because `PaylezIntro` lives under
   * `components/`, is driven entirely by props, and could not reach into the
   * site's stylesheet for a tile — but the intro dropped the tile, for the same
   * reason the header, the footer and the dashboard rail never had one: the
   * product has never put a mark beside the word. The files and the `--logo`
   * token survive that decision, so the field survives with them, and a
   * canvas-side surface that ever wants the mark still has nowhere else to get
   * it. Delete it only together with the token.
   */
  logo: string;
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
    logo: '/logo/logo-dark.jpg',
    tone: 'glow',
    glow: 1,
  },
  light: {
    /*
     * `--accent-lit` — the middle step of the light ramp, and now also `--accent`
     * itself: the fill and the strokes landed on one value.
     *
     * These layers are shapes, so they want the fill — but `tone: 'ink'`
     * alpha-blends them onto near-white and the globe is mostly one-pixel
     * coastlines. At the neon the light theme used to fill with (1.3:1 against
     * the page) the sphere survived as a pale disc and every coastline, route
     * and link disappeared: not a softer globe, an empty one. At this step every
     * icon on the page and every line on the globe are literally one colour,
     * which is the point.
     */
    primary: '#089b99',
    background: '#f5f9f8',
    /*
     * Near-black, not the page: whatever sits here is drawn *on* a `primary`
     * fill, and a page-coloured mark on it is 1.3:1.
     *
     * Mirrors `--ink-rgb`, **not** `--on-accent` — which is what this used to
     * claim and is the one pairing in the file that inverts between the two
     * systems. Light's `--on-accent` is `#ffffff`; see the note on `onPrimary`
     * in `ThemePalette` for why both are right.
     */
    onPrimary: '#04201f',
    logo: '/logo/logo-light.png',
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
