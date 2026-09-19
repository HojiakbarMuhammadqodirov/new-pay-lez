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
import {
  CURRENCY_FOR_LANGUAGE,
  isCurrencyCode,
  type CurrencyCode,
} from './currency';

const STORAGE_KEY = 'paylez-language';

/**
 * The currency, and it is **its own key**.
 *
 * A fifth storage key beside the theme, the language, the session and the saved
 * pairs — and the reason it is separate rather than folded into the language's
 * is the whole of what makes the two settings independent: one value cannot be
 * two answers. A reader who picks Russian and złoty has told us two things, and
 * a single key would make the second one a function of the first again the next
 * time either was written.
 *
 * Absent means "not chosen", which is not the same as any particular currency —
 * see `initialCurrency`.
 */
const CURRENCY_KEY = 'paylez-currency';

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

/**
 * The currency to start in, and the distinction that matters: **chosen** versus
 * **not chosen yet**.
 *
 * A stored value is a choice and wins. Nothing stored means nobody has decided,
 * and the language is then the best guess available — it is the one thing a
 * visitor tells us before they have told us anything else.
 *
 * `null` rather than a default, so the caller can tell the two apart: a chosen
 * currency must survive a language switch, and a guessed one must follow it.
 * Collapsing them here would make the first language switch overwrite a real
 * choice or freeze a guess, and there is no way to pick which without knowing
 * which it was.
 */
function storedCurrency(): CurrencyCode | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(CURRENCY_KEY);
    return stored && isCurrencyCode(stored) ? stored : null;
  } catch {
    /* Private mode. Nothing stored is the same as nothing chosen. */
    return null;
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(initialLanguage);
  /*
   * `null` until somebody chooses, and that is not laziness — it is what lets
   * the currency follow the language *until* it has been decided and stop
   * following it afterwards. Which is exactly the behaviour asked for: the
   * language may supply the default, and the language switch must not change a
   * currency somebody has set.
   */
  const [chosen, setChosen] = useState<CurrencyCode | null>(storedCurrency);

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

  const setCurrency = useCallback((next: CurrencyCode) => {
    /* No transition: nothing fetches anything per currency — every price is a
       multiplication of a euro figure already in the bundle. */
    setChosen(next);
    try {
      window.localStorage.setItem(CURRENCY_KEY, next);
    } catch {
      // Same as the language: not remembering is not worth failing over.
    }
  }, []);

  // Keep the document in sync: screen readers and hyphenation both key off it.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LanguageValue>(
    () => ({
      language,
      setLanguage,
      copy: LANGUAGES[language],
      /* The chosen one, or the language's default while nothing is chosen. */
      currency: chosen ?? CURRENCY_FOR_LANGUAGE[language],
      setCurrency,
    }),
    [language, setLanguage, chosen, setCurrency],
  );

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}
