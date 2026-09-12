import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  LANGUAGE_ORDER,
  LANGUAGES,
  LanguageContext,
  type LanguageCode,
  type LanguageValue,
} from './context';

const STORAGE_KEY = 'paylez-language';

/** Derived from `LANGUAGE_ORDER`, so adding a language cannot miss this guard. */
function isLanguage(value: string | null): value is LanguageCode {
  return LANGUAGE_ORDER.includes(value as LanguageCode);
}

/**
 * Reads the stored choice, falling back to the browser's preference and then
 * English. Resolved lazily in `useState` so the first paint is already in the
 * right language — deciding in an effect would flash English first.
 */
function initialLanguage(): LanguageCode {
  if (typeof window === 'undefined') return 'en';

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // Private mode: fall through to the browser preference.
  }

  const preferred = navigator.language.slice(0, 2).toLowerCase();
  return isLanguage(preferred) ? preferred : 'en';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(initialLanguage);

  const setLanguage = useCallback((next: LanguageCode) => {
    /*
     * A transition, because one thing on this site fetches its text per language
     * rather than holding it in the bundle: the two legal documents. Marked
     * urgent, switching language on one of them unmounts the text and shows the
     * loading line until the new chunk lands; marked as a transition, React
     * holds the document the reader is looking at until it has the next one.
     * Every other screen reads `copy` synchronously and cannot tell the
     * difference.
     */
    startTransition(() => setLanguageState(next));
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not being able to remember the choice is not worth failing over.
    }
  }, []);

  // Keep the document in sync: screen readers and hyphenation both key off it.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LanguageValue>(
    () => ({ language, setLanguage, copy: LANGUAGES[language] }),
    [language, setLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}
