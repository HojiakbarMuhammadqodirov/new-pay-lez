/**
 * Language context, the dictionaries, and the hooks that read them.
 *
 * Split from the provider component so the module exports no components — a
 * file mixing the two breaks React fast refresh.
 */
import { createContext, useContext } from 'react';
import {
  CURRENCIES,
  GROUP_FOR_LANGUAGE,
  money,
  moneyParts,
  type Currency,
  type CurrencyCode,
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
  /**
   * The currency prices are written in — **a separate setting from the
   * language**.
   *
   * They used to be one: `CURRENCIES[language]` decided the currency, so
   * somebody who wanted prices in złoty had to read the site in Polish. They
   * were never the same question — a Russian speaker in Kraków is paid in
   * złoty, an English speaker may be in Tashkent — and the language is now only
   * the *default*, which is `CURRENCY_FOR_LANGUAGE`.
   *
   * Held here rather than in a provider of its own because the default is a
   * function of the language and the two have to be read together: a second
   * context would need this one anyway, and the `[language, currency]` pair is
   * what every money figure on the site is a function of.
   */
  currency: CurrencyCode;
  setCurrency: (next: CurrencyCode) => void;
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

/**
 * The active currency's own table — the symbol, the grouping, the rounding step.
 *
 * For the callers that need the symbol on its own (the dashboard's currency
 * chip, the wallet's balance) rather than a formatted amount. It reads the
 * *chosen* currency now rather than deriving one from the language, which is
 * what makes the two settings independent — and it is the reason this hook
 * exists at all: four screens were indexing `CURRENCIES[language]` directly,
 * and every one of them was a place the separation would have been lost.
 */
export function useCurrency(): Currency {
  return CURRENCIES[useLanguageContext().currency];
}

/** The active code plus its setter, for the switcher itself. */
export function useCurrencyCode(): [CurrencyCode, (next: CurrencyCode) => void] {
  const { currency, setCurrency } = useLanguageContext();
  return [currency, setCurrency];
}

/**
 * The reader's thousands separator.
 *
 * A hook of its own because grouping is a property of the **language** and not
 * of the currency — fx.ts has always said so and four screens quote it — and
 * because that was true only by accident until the two settings came apart:
 * CURRENCIES was keyed by language, so its group happened to be the reader's.
 * Those four screens want nothing but this, and should not have to reach into a
 * currency table to get it.
 */
export function useGroupSeparator(): string {
  return GROUP_FOR_LANGUAGE[useLanguageContext().language];
}

/**
 * Euros in, a finished price in the reader's currency out.
 *
 * Every money figure on the site goes through this or through `useMoneyParts`.
 * See `currency.ts` for why the currency is now a setting of its own and why
 * the base unit is euros everywhere else.
 */
export function useMoney(): (eur: number, round?: MoneyRound) => string {
  const { currency: code, language } = useLanguageContext();
  const currency = CURRENCIES[code];
  /* The symbol is the currency's and the grouping is the reader's. Two
     settings, two sources — see GROUP_FOR_LANGUAGE. */
  const separator = GROUP_FOR_LANGUAGE[language];
  return (eur, round) => money(eur, currency, round, separator);
}

/** The same conversion, taken apart for `[data-count]` to animate. */
export function useMoneyParts(): (
  eur: number,
  round?: MoneyRound,
) => ReturnType<typeof moneyParts> {
  const { currency: code, language } = useLanguageContext();
  const currency = CURRENCIES[code];
  const separator = GROUP_FOR_LANGUAGE[language];
  return (eur, round) => moneyParts(eur, currency, round, separator);
}

export type { Dictionary };
