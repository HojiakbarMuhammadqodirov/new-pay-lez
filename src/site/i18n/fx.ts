/**
 * The exchange table.
 *
 * Nineteen currencies — the ones this audience actually moves money between:
 * the EU and UK currencies people earn in, and the post-Soviet ones they send
 * home to. Every figure is **units per one euro**, taken from the `EUR…` block
 * of the rate sheet handed over for the converter.
 *
 * Anchored to one currency rather than held as a matrix of pairs, for the same
 * reason `currency.ts` is: a cross rate is then `to.rate / from.rate` and is
 * exact for all 342 ordered pairs, where a matrix would be 342 numbers that
 * have to agree with each other by hand. The sheet's own cross rates are
 * derived the same way, which is why its `Check` column is `TRUE` throughout.
 *
 * This is the source the site's *prices* are anchored to as well — the five
 * pricing currencies in `currency.ts` read their `rate` from here, so the
 * converter on Relocate and the price on a voucher two pages over cannot quote
 * different pounds.
 *
 * The rates are a snapshot, not a feed. Nothing here settles a payment, and a
 * live FX call would be the third-party runtime request the whole site is built
 * to avoid. Replace the numbers when a new sheet lands.
 */
import type { LanguageCode } from './context';

export interface FxCurrency {
  /** ISO 4217, and the key. */
  code: string;
  /** How the amount is signed — `zł`, `£`, `so'm`. */
  symbol: string;
  /** Written before the number (`£25`) or after it (`25 zł`). */
  before: boolean;
  /**
   * How many decimals an amount in this currency is written to.
   *
   * Zero where the smallest note is worth a fraction of a euro cent: `13 748`
   * soum to the euro means the decimals carry no information a reader could
   * act on, and two of them make the number harder to read at a glance.
   */
  decimals: number;
  /** Units per one euro. */
  rate: number;
  /** For the picker. Flag emoji are the sanctioned exception to two colours. */
  flag: string;
}

/*
 * There is deliberately no `group` here: digit grouping is a property of the
 * *reader*, not of the currency. A Pole reading a dollar amount groups it with
 * spaces; an English reader reads the same dollars with commas. The separator
 * comes from `CURRENCIES[language]` at the call site.
 */
export const FX = {
  EUR: { code: 'EUR', symbol: '€', before: true, decimals: 2, rate: 1, flag: '🇪🇺' },
  USD: { code: 'USD', symbol: '$', before: true, decimals: 2, rate: 1.15297, flag: '🇺🇸' },
  GBP: { code: 'GBP', symbol: '£', before: true, decimals: 2, rate: 0.857355, flag: '🇬🇧' },
  PLN: { code: 'PLN', symbol: 'zł', before: false, decimals: 2, rate: 4.29461, flag: '🇵🇱' },
  UAH: { code: 'UAH', symbol: '₴', before: false, decimals: 2, rate: 51.4843, flag: '🇺🇦' },
  RUB: { code: 'RUB', symbol: '₽', before: false, decimals: 2, rate: 92.9586, flag: '🇷🇺' },
  UZS: { code: 'UZS', symbol: "so'm", before: false, decimals: 0, rate: 13748, flag: '🇺🇿' },
  KZT: { code: 'KZT', symbol: '₸', before: false, decimals: 0, rate: 542.41, flag: '🇰🇿' },
  TRY: { code: 'TRY', symbol: '₺', before: true, decimals: 2, rate: 54.89226, flag: '🇹🇷' },
  CZK: { code: 'CZK', symbol: 'Kč', before: false, decimals: 2, rate: 24.167, flag: '🇨🇿' },
  CHF: { code: 'CHF', symbol: 'CHF', before: true, decimals: 2, rate: 0.932575, flag: '🇨🇭' },
  BYN: { code: 'BYN', symbol: 'Br', before: false, decimals: 2, rate: 3.3935, flag: '🇧🇾' },
  MDL: { code: 'MDL', symbol: 'L', before: false, decimals: 2, rate: 20.155, flag: '🇲🇩' },
  GEL: { code: 'GEL', symbol: '₾', before: false, decimals: 2, rate: 3.01274, flag: '🇬🇪' },
  AMD: { code: 'AMD', symbol: '֏', before: false, decimals: 0, rate: 421.1, flag: '🇦🇲' },
  AZN: { code: 'AZN', symbol: '₼', before: false, decimals: 2, rate: 1.9566, flag: '🇦🇿' },
  TMT: { code: 'TMT', symbol: 'm', before: false, decimals: 2, rate: 4.035395, flag: '🇹🇲' },
  KGS: { code: 'KGS', symbol: 'с', before: false, decimals: 2, rate: 100.8272265, flag: '🇰🇬' },
  TJS: { code: 'TJS', symbol: 'SM', before: false, decimals: 2, rate: 10.6273, flag: '🇹🇯' },
} as const satisfies Record<string, FxCurrency>;

export type FxCode = keyof typeof FX;

/**
 * Picker order, and it is not alphabetical.
 *
 * A list of nineteen is long enough that the order is the difference between
 * finding your currency and searching for it, so it runs by how likely this
 * reader is to want it: the money the site is priced in first, then the
 * corridors the guide is written for, then the rest.
 */
export const FX_ORDER = Object.keys(FX) as FxCode[];

/**
 * The currency behind each language.
 *
 * The language switch is the only thing a visitor tells us about where they
 * are (see `currency.ts`), so it also seeds which side of the converter they
 * start on — a Ukrainian reader opens the card already converting hryvnia.
 */
export const FX_FOR_LANGUAGE: Record<LanguageCode, FxCode> = {
  en: 'GBP',
  pl: 'PLN',
  uz: 'UZS',
  ru: 'RUB',
  uk: 'UAH',
};


/**
 * What money is spent where.
 *
 * ISO-3166 alpha-2 to a row of the table above, and it exists for one screen:
 * the streak row on L-Earn puts a **currency mark** in the circle of every day
 * kept, so a week of showing up reads as a week of earning rather than as seven
 * ticks. The mark has to be the one this player actually holds in their hand,
 * and the only thing the account knows about that is the country their **city**
 * is in (`UserProfile.countryCode`) — not the language they read the site in,
 * which is a different question with a different answer for most of the people
 * this product is for. A Ukrainian in Kraków spends złoty.
 *
 * Partial on purpose, and the gap is the design. It covers the nineteen
 * currencies `FX` carries plus the euro area, which is every country this
 * audience moves between; anywhere else resolves to `null` and the screen draws
 * a dollar sign. That is the honest fallback — a `$` is read as "money" almost
 * everywhere, where guessing at a currency we do not carry a rate for would be
 * inventing a fact about somebody's wallet.
 *
 * The euro area is written out rather than folded into a default, because
 * "unknown" and "euro" are the two answers that must not merge: a default of
 * EUR would silently price a Brazilian's streak in euros and there would be
 * nothing on the screen to notice it by.
 */
const EURO_AREA = [
  'AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE', 'IT',
  'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES',
] as const;

export const FX_FOR_COUNTRY: Record<string, FxCode> = {
  PL: 'PLN',
  GB: 'GBP',
  UA: 'UAH',
  RU: 'RUB',
  UZ: 'UZS',
  KZ: 'KZT',
  TR: 'TRY',
  CZ: 'CZK',
  CH: 'CHF',
  BY: 'BYN',
  MD: 'MDL',
  GE: 'GEL',
  AM: 'AMD',
  AZ: 'AZN',
  TM: 'TMT',
  KG: 'KGS',
  TJ: 'TJS',
  US: 'USD',
  ...Object.fromEntries(EURO_AREA.map((code) => [code, 'EUR' as FxCode])),
};

/**
 * The mark to draw for a country, or `null` when we do not know it.
 *
 * Case-folded and trimmed because `countryCode` is only *usually* a code: the
 * profile accepts a typed country when the city was not on the served list (see
 * `UserProfile.countryCode`), so what arrives here can be `'pl'`, `'PL '`, or
 * the word "Poland". The first two are the same country and are folded; the
 * third is not a code and correctly falls through to `null`.
 */
export function fxForCountry(countryCode: string | undefined): FxCurrency | null {
  const code = (countryCode ?? '').trim().toUpperCase();
  const key = FX_FOR_COUNTRY[code];
  return key ? FX[key] : null;
}

/** Digit grouping, with the reader's separator and the currency's decimals. */
export function formatFx(value: number, currency: FxCurrency, separator: string): string {
  return formatDigits(value, currency.decimals, separator);
}

/**
 * How many decimals a *rate* needs, which is not how many an amount needs.
 *
 * One soum is €0.0000727. Writing that to the currency's own two decimals
 * gives `0.00`, which is not a rounding error so much as a different claim —
 * so the rate line scales its precision to the magnitude and always keeps
 * four significant figures of it.
 */
export function rateDecimals(value: number): number {
  if (!Number.isFinite(value) || value === 0) return 2;
  const magnitude = Math.floor(Math.log10(Math.abs(value)));
  return Math.min(8, Math.max(2, 3 - magnitude));
}

/** The rate itself, at the precision above. */
export function formatRate(value: number, separator: string): string {
  return formatDigits(value, rateDecimals(value), separator);
}

/**
 * Grouped integer part, fixed fractional part.
 *
 * `Intl.NumberFormat` is not used for the reason `group()` in `currency.ts`
 * gives: it would also impose the locale's own currency placement, and the
 * placement here is a property of the currency being written, not of the
 * reader. The decimal mark stays `.` in every language — the field accepts
 * both marks on the way in, and a converter whose answer and whose input
 * disagree about the separator is worse than one that picks one.
 */
function formatDigits(value: number, decimals: number, separator: string): string {
  if (!Number.isFinite(value)) return '—';

  const sign = value < 0 ? '-' : '';
  const fixed = Math.abs(value).toFixed(decimals);
  const [whole, fraction] = fixed.split('.');

  let grouped = '';
  for (let i = 0; i < whole.length; i++) {
    if (i > 0 && (whole.length - i) % 3 === 0) grouped += separator;
    grouped += whole[i];
  }

  return sign + grouped + (fraction ? `.${fraction}` : '');
}
