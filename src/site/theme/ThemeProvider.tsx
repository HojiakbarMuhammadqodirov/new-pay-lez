import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  THEMES,
  ThemeContext,
  type ThemeName,
  type ThemeValue,
} from './context';

const STORAGE_KEY = 'paylez-theme';
const QUERY = '(prefers-color-scheme: light)';

function isTheme(value: string | null): value is ThemeName {
  return value === 'dark' || value === 'light';
}

function stored(): ThemeName | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    // Private mode: fall through to the system preference.
    return null;
  }
}

function systemTheme(): ThemeName {
  return window.matchMedia(QUERY).matches ? 'light' : 'dark';
}

/**
 * Dark/light theme.
 *
 * Resolution order is the conventional one: an explicit choice the visitor has
 * made before, else the operating system's preference, else dark — this site's
 * native state.
 *
 * The attribute is written to `<html>`, not to a wrapper element, for two
 * reasons: the inline script in `index.html` sets the same attribute before
 * React exists (so there is no flash of the wrong theme on load), and `<html>`
 * is where the page background and `color-scheme` actually have to change —
 * scroll overshoot on iOS paints the root element, not the app.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // Resolved lazily so the first render is already correct; deciding in an
  // effect would render once in the wrong theme first.
  const [theme, setThemeState] = useState<ThemeName>(
    () => stored() ?? systemTheme(),
  );

  // Whether the visitor has overridden the system. Only while they have *not*
  // do we keep following it.
  const [explicit, setExplicit] = useState(() => stored() !== null);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    setExplicit(true);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not being able to remember the choice is not worth failing over.
    }
  }, []);

  const toggle = useCallback(() => {
    setThemeState((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      setExplicit(true);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // As above.
      }
      return next;
    });
  }, []);

  // Layout effect, not effect: the attribute has to land before the browser
  // paints, or the first frame shows the previous theme's background.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Follow the OS while the visitor has expressed no preference of their own.
  useEffect(() => {
    if (explicit) return;
    const media = window.matchMedia(QUERY);
    const onChange = () => setThemeState(media.matches ? 'light' : 'dark');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [explicit]);

  const value = useMemo<ThemeValue>(
    () => ({ theme, setTheme, toggle, palette: THEMES[theme] }),
    [theme, setTheme, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
