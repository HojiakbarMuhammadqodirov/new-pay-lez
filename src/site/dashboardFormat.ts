/**
 * Number formatting shared by the dashboard's screens.
 *
 * ── why this is its own module ────────────────────────────────────────────
 *
 * `useNum` lived in `dashboardScreens.tsx` and was private to it. Three screens
 * moved into their own files, so it had to be exported — and exporting a hook
 * from a file that also exports components breaks React fast refresh, which
 * `oxlint` flags as `react(only-export-components)`. It is the same split
 * `theme/` and `i18n/` already make for the same reason: a module that exports
 * both a component and a plain value loses fast refresh for the whole file.
 *
 * A re-export would not have helped — the rule is about what the *module*
 * exports, not where the binding came from.
 */
import { useMemo } from 'react';
import { useCopy, useCurrency, useGroupSeparator, useLanguage } from './i18n/context';
import { group as groupDigits } from './i18n/currency';
import { FX, formatFx, type FxCode } from './i18n/fx';

/**
 * Plain counts, grouped the reader's way.
 *
 * `groupDigits` is the money formatter's own separator logic, reused: the digit
 * grouping belongs to the language rather than to the currency (root
 * `CLAUDE.md`), so a count and a price on the same row have to break their
 * thousands identically or the screen looks like two products.
 *
 * **The separator is passed explicitly, and it has to be.** This read
 * `groupDigits(value, currency)` and relied on `CURRENCIES` being keyed by
 * language, so the currency's own separator *happened* to be the reader's. Once
 * the currency became a setting of its own that coincidence broke: a Polish
 * reader who chose pounds got counts grouped with commas beside prices grouped
 * with a narrow no-break space — two number formats on one row, which is the
 * exact thing the paragraph above says this function exists to prevent.
 * `useGroupSeparator` is the reader's answer and `useMoney` already passes it.
 *
 * Deliberately not `Intl.NumberFormat` — `currency.ts` gives the reason: it
 * would also impose the locale's own currency placement, and placement here is
 * a property of the currency being written rather than of the reader.
 */
export function useNum() {
  const currency = useCurrency();
  const separator = useGroupSeparator();
  return (value: number) => groupDigits(value, currency, 0, separator);
}

/**
 * `'2026-08'` as the name of a month, in the reader's language.
 *
 * Every period the server reports is an ISO year-month, and `monthNames` holds
 * the twelve names in all five dictionaries, so the label is looked up rather
 * than formatted — `Intl` would format it in the *browser's* locale, and this
 * site's language is the switcher's. Anything that does not parse is returned
 * as itself: the server's own word is better than a wrong one.
 */
export function useMonthName() {
  const names = useCopy().dashboard.customers.monthNames;
  return (period: string) => {
    const month = /^\d{4}-(\d{2})$/.exec(period);
    if (!month) return period;
    return names[Number(month[1]) - 1] ?? period;
  };
}

/**
 * An amount in the **venue's** currency, written the way its till writes it.
 *
 * Everything else on the dashboard is written in the reader's currency through
 * `useMoney`, and this is the deliberate exception with two users: the till's own
 * line under each receipt in the scan log, and the counter tool, whose figures
 * have to match the paper receipt in the customer's hand. The symbol and its
 * side come off `i18n/fx.ts` — never typed — and the digit grouping is still the
 * reader's, which is the rule the rate table states: grouping belongs to the
 * person reading, the symbol to the money.
 *
 * That last sentence was **true by accident and stopped being true**, the same
 * way `useNum` above did. It read `reader.group` off the chosen *currency*,
 * which was the reader's separator only while `CURRENCIES` was keyed by
 * language; once the currency became a setting of its own, a Polish reader who
 * chose pounds got a Warsaw till's złoty written with commas. The reader's
 * answer has its own hook.
 *
 * Minor units in, so nothing here re-rounds through the euro.
 */
export function useVenueMoney() {
  const separator = useGroupSeparator();
  return (minor: number, code: string) => {
    const fx = FX[code as FxCode] ?? FX.EUR;
    const amount = formatFx(minor / 10 ** fx.decimals, fx, separator);
    return fx.before ? `${fx.symbol}${amount}` : `${amount} ${fx.symbol}`;
  };
}

/**
 * Dates and times in the reader's language, on the venue's clock.
 *
 * `Intl` for dates, which `currency.ts` has no quarrel with — its objection is
 * to *number* formatting imposing a locale's currency placement, and a month
 * name has no placement. The zone is the venue's rather than the browser's: an
 * owner reading the till log from abroad still wants the hour the bill was rung
 * up. An unknown zone falls back to the device's clock rather than throwing,
 * because a formatter that throws takes the whole screen down with it.
 */
export function useVenueDates(timezone: string | null) {
  const [language] = useLanguage();
  return useMemo(() => {
    const make = (options: Intl.DateTimeFormatOptions) => {
      try {
        return new Intl.DateTimeFormat(language, {
          ...options,
          ...(timezone ? { timeZone: timezone } : {}),
        });
      } catch {
        return new Intl.DateTimeFormat(language, options);
      }
    };
    const day = make({ day: 'numeric', month: 'short' });
    const long = make({ day: 'numeric', month: 'long' });
    const time = make({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    return {
      day: (iso: string) => day.format(new Date(iso)),
      long: (iso: string) => long.format(new Date(iso)),
      time: (iso: string) => time.format(new Date(iso)),
    };
  }, [language, timezone]);
}
