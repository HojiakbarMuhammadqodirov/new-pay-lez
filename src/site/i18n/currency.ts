/**
 * Money, per language.
 *
 * The site is one product sold into several places, and the language switch is
 * the only thing a visitor tells us about where they are — so it is what picks
 * the currency. English is the UK pitch and prices in pounds; Polish in złoty;
 * Uzbek, Russian and Ukrainian in their own.
 *
 * **Every amount in `content.ts` and in the dictionaries is euros.** That is the
 * base unit and nothing else may be written anywhere: a page with a hardcoded
 * `£` in one string and a converted figure in the next is the exact failure this
 * module exists to prevent. Amounts reach the page through `useMoney()` (a
 * finished string) or `useMoneyParts()` (the pieces the count-up animates).
 *
 * The rates are marketing rates, not a feed. Nothing here settles a payment —
 * these numbers illustrate a pitch, and a live FX call to price a landing page
 * would be a third-party runtime request for a figure that is rounded to the
 * nearest 50 anyway.
 */
import type { LanguageCode } from './context';

export interface Currency {
  /** Written before the number (`£25`) or after it (`25 zł`). */
  symbol: string;
  before: boolean;
  /** Thousands separator. A narrow no-break space where the locale wants one:
   *  a plain space would let a price wrap across two lines. */
  group: string;
  /** Multiplier from the base unit, euros. */
  rate: number;
  /**
   * Shelf prices round to a multiple of this.
   *
   * A converted price is still a price — someone chose it — and £126.65 reads
   * as an exchange-rate artefact, which is precisely what it is. Rounding to a
   * step the currency actually uses puts the chosen-ness back.
   */
  step: number;
}

export const CURRENCIES: Record<LanguageCode, Currency> = {
  en: { symbol: '£', before: true, group: ',', rate: 0.85, step: 5 },
  pl: { symbol: 'zł', before: false, group: ' ', rate: 4.3, step: 10 },
  uz: { symbol: "so'm", before: false, group: ' ', rate: 13600, step: 10000 },
  ru: { symbol: '₽', before: false, group: ' ', rate: 98, step: 100 },
  uk: { symbol: '₴', before: false, group: ' ', rate: 44, step: 50 },
};

/**
 * How hard a converted figure is rounded.
 *
 * - `price` — a number on a price tag. Snaps to the currency's `step`.
 * - `soft`  — a number in a sentence ("about £9,700 recovered"). Snaps to two
 *   significant figures, because the claim is an estimate and writing it to the
 *   pound would be claiming a precision the forecast does not have.
 * - `exact` — converted and rounded to the unit, nothing more. For figures that
 *   are counted rather than estimated.
 */
export type MoneyRound = 'price' | 'soft' | 'exact';

/** Euros to the currency's own units, rounded as the context asks. */
export function convert(eur: number, currency: Currency, round: MoneyRound): number {
  const raw = eur * currency.rate;
  if (raw === 0) return 0;

  if (round === 'price') {
    return Math.round(raw / currency.step) * currency.step;
  }

  if (round === 'soft') {
    // Two significant figures: 9 690 → 9 700, 126 → 130, 2 026 400 → 2 000 000.
    const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(Math.abs(raw))) - 1);
    return Math.round(raw / magnitude) * magnitude;
  }

  return Math.round(raw);
}

/** Digit grouping. `Intl` is not used: it would also impose the locale's own
 *  currency placement, and the placement here is a property of the pitch. */
export function group(value: number, currency: Currency): string {
  const sign = value < 0 ? '-' : '';
  const digits = String(Math.abs(Math.round(value)));
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += currency.group;
    out += digits[i];
  }
  return sign + out;
}

/** The finished string — what almost every caller wants. */
export function money(
  eur: number,
  currency: Currency,
  round: MoneyRound = 'price',
): string {
  const amount = group(convert(eur, currency, round), currency);
  // No-break space on the trailing form: "1 299 zł" must never break between
  // the number and its unit, and the leading form has no space at all.
  return currency.before ? `${currency.symbol}${amount}` : `${amount} ${currency.symbol}`;
}

/**
 * The same figure taken apart, for `[data-count]`.
 *
 * The count-up animates a number and re-writes `textContent` every frame, so it
 * needs the target as a number and the symbol as an affix it can re-apply —
 * a formatted string would be parsed back out on the first frame.
 */
export function moneyParts(
  eur: number,
  currency: Currency,
  round: MoneyRound = 'price',
): { value: number; prefix: string; suffix: string; group: string } {
  return {
    value: convert(eur, currency, round),
    prefix: currency.before ? currency.symbol : '',
    suffix: currency.before ? '' : ` ${currency.symbol}`,
    group: currency.group,
  };
}

/**
 * Substitutes `{amount}`-style placeholders in a translated string.
 *
 * Copy that quotes a figure has to keep the figure *inside* the sentence — word
 * order around a price is not the same in Polish as in English, and a sentence
 * split into "before" and "after" halves in the dictionary cannot be reordered
 * by a translator. One template string with a named hole can.
 */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
