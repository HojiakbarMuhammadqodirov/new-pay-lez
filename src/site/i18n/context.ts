/**
 * Language context, the dictionaries, and the hooks that read them.
 *
 * Split from the provider component so the module exports no components — a
 * file mixing the two breaks React fast refresh.
 */
import { createContext, useContext } from 'react';
import {
  CURRENCIES,
  money,
  moneyParts,
  type Currency,
  type MoneyRound,
} from './currency';
import { en, type Dictionary } from './en';
import { pl } from './pl';
import { ru } from './ru';
import { uk } from './uk';
import { uz } from './uz';

export type LanguageCode = 'en' | 'pl' | 'uz' | 'ru' | 'uk';

/**
 * Ordered as the brief asks: English, Polish, Uzbek, Russian, Ukrainian.
 *
 * `LANGUAGE_ORDER` is the single source of truth for both the menu order and
 * the runtime guard in `LanguageProvider` — a language is added here and
 * nowhere else.
 */
export const LANGUAGE_ORDER: LanguageCode[] = ['en', 'pl', 'uz', 'ru', 'uk'];
export const LANGUAGES: Record<LanguageCode, Dictionary> = { en, pl, uz, ru, uk };

export interface LanguageValue {
  language: LanguageCode;
  setLanguage: (next: LanguageCode) => void;
  copy: Dictionary;
}

export const LanguageContext = createContext<LanguageValue | null>(null);

function useLanguageContext(): LanguageValue {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error('useLanguage must be used inside <LanguageProvider>');
  }
  return value;
}

/** The active dictionary. */
export function useCopy(): Dictionary {
  return useLanguageContext().copy;
}

/** The active code plus the setter, for the switcher itself. */
export function useLanguage(): [LanguageCode, (next: LanguageCode) => void] {
  const { language, setLanguage } = useLanguageContext();
  return [language, setLanguage];
}

/** The active currency. For the few callers that need the symbol on its own —
 *  the dashboard's currency chip — rather than a formatted amount. */
export function useCurrency(): Currency {
  return CURRENCIES[useLanguageContext().language];
}

/**
 * Euros in, a finished price in the reader's currency out.
 *
 * Every money figure on the site goes through this or through `useMoneyParts`.
 * See `currency.ts` for why the language picks the currency and why the base
 * unit is euros everywhere else.
 */
export function useMoney(): (eur: number, round?: MoneyRound) => string {
  const currency = CURRENCIES[useLanguageContext().language];
  return (eur, round) => money(eur, currency, round);
}

/** The same conversion, taken apart for `[data-count]` to animate. */
export function useMoneyParts(): (
  eur: number,
  round?: MoneyRound,
) => ReturnType<typeof moneyParts> {
  const currency = CURRENCIES[useLanguageContext().language];
  return (eur, round) => moneyParts(eur, currency, round);
}

export type { Dictionary };
