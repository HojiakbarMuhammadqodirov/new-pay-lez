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
import { FX } from './fx';

export interface Currency {
  /** Written before the number (`£25`) or after it (`25 zł`). */
  symbol: string;
  before: boolean;
  /** Thousands separator. A narrow no-break space where the locale wants one:
   *  a plain space would let a price wrap across two lines. */
  group: string;
  /**
   * Multiplier from the base unit, euros.
   *
   * Read from `fx.ts` rather than written here. The rate sheet behind the
   * Relocate converter covers all five of these, and two tables of pounds that
   * disagree by a percent is a converter quoting one number and the price tag
   * beside it another.
   */
  rate: number;
  /**
   * Shelf prices round to a multiple of this.
   *
   * A converted price is still a price — someone chose it — and £126.65 reads
   * as an exchange-rate artefact, which is precisely what it is. Rounding to a
   * step the currency actually uses puts the chosen-ness back.
   */
  step: number;
  /**
   * Minor units the currency actually has, for `unit` amounts.
   *
   * Read from `fx.ts` like the rate, and for the same reason: a soum has no
   * practical minor unit, and "0.67 so'm" would be as wrong there as "£1" is
   * for sixty-seven pence here.
   */
  decimals: number;
}

export const CURRENCIES: Record<LanguageCode, Currency> = {
  en: { symbol: FX.GBP.symbol, before: true, group: ',', rate: FX.GBP.rate, step: 5, decimals: FX.GBP.decimals },
  pl: { symbol: FX.PLN.symbol, before: false, group: ' ', rate: FX.PLN.rate, step: 10, decimals: FX.PLN.decimals },
  uz: { symbol: FX.UZS.symbol, before: false, group: ' ', rate: FX.UZS.rate, step: 10000, decimals: FX.UZS.decimals },
  ru: { symbol: FX.RUB.symbol, before: false, group: ' ', rate: FX.RUB.rate, step: 100, decimals: FX.RUB.decimals },
  uk: { symbol: FX.UAH.symbol, before: false, group: ' ', rate: FX.UAH.rate, step: 50, decimals: FX.UAH.decimals },
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
 * - `unit`  — a per-something cost ("£0.67 per claim"). Converted exactly and
 *   written to the currency's own minor units, because these are the figures
 *   the other three modes destroy: a cost per claim, per visit or per new
 *   customer is a couple of pounds at most, and rounding it to the pound turns
 *   three different numbers into "£1" and the panel comparing them into
 *   nothing. `decimals` is 0 where the currency has no minor unit.
 */
export type MoneyRound = 'price' | 'soft' | 'exact' | 'unit';

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

  if (round === 'unit') return raw;

  return Math.round(raw);
}

/** Digit grouping. `Intl` is not used: it would also impose the locale's own
 *  currency placement, and the placement here is a property of the pitch. */
export function group(value: number, currency: Currency, decimals = 0): string {
  const sign = value < 0 ? '-' : '';
  const fixed = Math.abs(value).toFixed(decimals);
  const [whole, fraction] = fixed.split('.');
  const digits = whole;
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += currency.group;
    out += digits[i];
  }
  return sign + out + (fraction ? `.${fraction}` : '');
}

/** The finished string — what almost every caller wants. */
export function money(
  eur: number,
  currency: Currency,
  round: MoneyRound = 'price',
): string {
  const amount = group(
    convert(eur, currency, round),
    currency,
    round === 'unit' ? currency.decimals : 0,
  );
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
