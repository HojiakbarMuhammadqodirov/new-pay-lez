/**
 * The partner price list, read once and drawn in two places.
 *
 * `GET /v1/plans?audience=partner` is the single source: the plans, their
 * entitlement rows and their per-market `prices`, all seeded from the pricing
 * strategy (`server/domain/settings.ts`). The dashboard's plan sheet
 * (`dashboardPlan.tsx`) and the pitch page's pricing table (`business.tsx`)
 * both render this module's answers, so a price changed on the server changes
 * both, and neither can be edited into disagreeing with the other.
 *
 * ## Which currency a reader sees — and how that squares with the money rule
 *
 * Everywhere else on the site an amount is written in euros and converted on
 * the way out (`useMoney`). A plan price cannot be: the strategy sets each
 * market's figure against that market's own shelf, so Growth is **149 zł** in
 * Kraków and **149 000 so'm** in Tashkent — about 29% of the Polish price in
 * real terms, which no exchange rate would produce. So:
 *
 * - **A reader whose currency the price list quotes** (PLN, UZS) sees that
 *   market's own figure, exactly — no conversion, no rounding.
 * - **Any other currency** (GBP, RUB, UAH, EUR, USD) sees the home market's
 *   złoty price converted through `fx.ts` and snapped to a price step, the way
 *   every converted shelf price on the site is — and the sheet says so
 *   (`converted`), because that figure is an estimate rather than a price
 *   anyone is invoiced.
 *
 * The symbol is the currency's and the digit grouping is the reader's
 * language's (`GROUP_FOR_LANGUAGE`), the same split `useMoney` makes.
 */
import { useEffect, useState } from 'react';

import { call } from './api/client';
import {
  PARTNER_PLAN_ROWS,
  PLAN_UNLIMITED,
  type PartnerPlanKey,
  type PartnerPlanRow,
} from './content';
import { useCopy, useCurrencyCode, useGroupSeparator } from './i18n/context';
import {
  CURRENCIES,
  convert,
  fill,
  group,
  isCurrencyCode,
  type Currency,
  type CurrencyCode,
} from './i18n/currency';
import { FX, type FxCode } from './i18n/fx';

/** One row of a plan's per-market price list (`plan_prices`). */
export interface PlanPrice {
  currency: string;
  months: number;
  /** Per month on this commitment, in the currency's minor units. */
  priceMinor: number;
  /** What one invoice for the commitment charges. */
  totalMinor: number;
}

/** One plan, as `GET /v1/plans?audience=partner` returns it. */
export interface PartnerPlan {
  id: string;
  code: string;
  name: string;
  /** The home market's (PLN) monthly list price. */
  price_minor: number;
  currency: string;
  interval: string;
  rank: number;
  /** Absent from a server older than the price list; treated as empty. */
  prices?: PlanPrice[];
  entitlements: Array<{ key: string; value: string }>;
}

/** Monthly, or the annual commitment the strategy quotes beside it. */
export type PlanBilling = 1 | 12;

/**
 * The ladder, in the server's rank order, or why not.
 *
 * `null` while asking. `fallback` is what a failed call shows instead, and only
 * the dashboard passes one — `dashboardDemo.ts`'s ladder under `?demo=1`, after
 * the real call failed. The pitch page passes none: a marketing page quoting a
 * demo's prices would be quoting a copy.
 */
export function usePartnerPlans(fallback?: PartnerPlan[]): { plans: PartnerPlan[] | null; failed: boolean } {
  const [plans, setPlans] = useState<PartnerPlan[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    call<PartnerPlan[]>('/v1/plans?audience=partner')
      .then((ladder) => {
        if (live) setPlans([...ladder].sort((a, b) => a.rank - b.rank));
      })
      .catch(() => {
        if (!live) return;
        if (fallback) setPlans(fallback);
        else setFailed(true);
      });
    return () => {
      live = false;
    };
    /* Asked once per mount: the fallback is a module constant, and a ladder
       that refetched whenever a caller rebuilt it would ask on every render. */
  }, []);

  return { plans, failed };
}

/** An entitlement's raw value, or undefined when the plan does not carry it. */
export const rawOf = (plan: PartnerPlan, key: string): string | undefined =>
  plan.entitlements.find((row) => row.key === key)?.value;

/** A price as the reader sees it. */
export interface PlanPriceView {
  /** Per month, finished. */
  amount: string;
  /** One invoice for the commitment, finished; null on the monthly price. */
  total: string | null;
  /** True when this is the złoty price converted, not a market's own figure. */
  converted: boolean;
  /**
   * Only on a converted price: each market's own figure for the same period,
   * finished in that market's currency ("149 zł", "149 000 so'm") — so a
   * reader quoted an estimate still sees the prices anybody is actually
   * invoiced, the strategy's own numbers.
   */
  markets: Array<{ currency: CurrencyCode; amount: string }>;
}

/** A figure finished in a currency: its symbol, the reader's grouping. */
function writeIn(currency: Currency, value: number, decimals: number, separator: string): string {
  const digits = group(value, currency, decimals, separator);
  return currency.before ? `${currency.symbol}${digits}` : `${digits} ${currency.symbol}`;
}

/** A price-list amount, exactly: whole units drop their decimals. */
function exactIn(code: CurrencyCode, minor: number, separator: string): string {
  const currency = CURRENCIES[code];
  const value = minor / 10 ** currency.decimals;
  return writeIn(currency, value, Number.isInteger(value) ? 0 : currency.decimals, separator);
}

/**
 * The formatter: a plan and a billing period in, the reader's price out.
 *
 * Null for a free plan, and for a period the price list does not quote — the
 * card then says "Free" or draws the monthly price only, rather than inventing
 * an annual figure.
 */
export function usePlanPrice(): (plan: PartnerPlan, months: PlanBilling) => PlanPriceView | null {
  const [code] = useCurrencyCode();
  const separator = useGroupSeparator();
  const currency = CURRENCIES[code];

  return (plan, months) => {
    const prices = plan.prices ?? [];
    if (plan.price_minor === 0 && prices.every((row) => row.priceMinor === 0)) return null;

    /* The reader's own market first, exactly as listed. */
    const own = prices.find((row) => row.currency === code && row.months === months);
    if (own) {
      return {
        amount: exactIn(code, own.priceMinor, separator),
        total: months > 1 ? exactIn(code, own.totalMinor, separator) : null,
        converted: false,
        markets: [],
      };
    }

    /* Otherwise the home market's figure, converted and snapped to a step. */
    const home =
      prices.find((row) => row.currency === plan.currency && row.months === months) ??
      (months === 1 ? { priceMinor: plan.price_minor } : undefined);
    const fx = FX[plan.currency as FxCode];
    if (!home || !fx) return null;
    const monthly = convert(home.priceMinor / 10 ** fx.decimals / fx.rate, currency, 'price');
    return {
      amount: writeIn(currency, monthly, 0, separator),
      total: months > 1 ? writeIn(currency, monthly * months, 0, separator) : null,
      converted: true,
      markets: prices.flatMap((row) =>
        row.months === months && isCurrencyCode(row.currency)
          ? [{ currency: row.currency, amount: exactIn(row.currency, row.priceMinor, separator) }]
          : [],
      ),
    };
  };
}

/**
 * Whole percent the annual commitment takes off the monthly price, from the
 * reader's market if it quotes both and the home market's otherwise. Null when
 * either half is missing. The strategy's figures make it 20 on both tiers.
 */
export function annualSaving(plan: PartnerPlan, code: CurrencyCode): number | null {
  const prices = plan.prices ?? [];
  const pair = (currency: string) => {
    const one = prices.find((row) => row.currency === currency && row.months === 1);
    const twelve = prices.find((row) => row.currency === currency && row.months === 12);
    return one && twelve && one.priceMinor > 0 ? Math.round((1 - twelve.priceMinor / one.priceMinor) * 100) : null;
  };
  return pair(code) ?? pair(plan.currency);
}

/**
 * One cell, decided: `true` is a tick, `null` is "not included", a string is
 * the finished words or figure. Shared so the card's feature list and the
 * comparison table can never describe one tier two ways.
 */
export type PlanCell = true | string | null;

export function usePlanCell(): (plan: PartnerPlan, row: PartnerPlanRow) => PlanCell {
  const copy = useCopy().partnerPlans;
  const [code] = useCurrencyCode();
  const separator = useGroupSeparator();
  const currency = CURRENCIES[code];

  return (plan, row) => {
    const raw = rawOf(plan, row.key);
    if (raw === undefined) return null;

    if (row.kind === 'flag') return raw === 'true' ? true : null;

    if (row.kind === 'level') {
      const level =
        raw === 'true' ? row.on : raw === 'false' ? row.off : (raw as keyof typeof copy.levels);
      if (!level) return null;
      /* A word the dictionary does not have is not drawn — never the raw key. */
      return (copy.levels as Record<string, string | undefined>)[level] ?? null;
    }

    if (row.kind === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) return null;
      if (n >= PLAN_UNLIMITED) return row.unlimited ? copy.levels[row.unlimited] : copy.unlimited;
      if (n <= 0) return row.zero ? copy.levels[row.zero] : null;
      return group(n, currency, 0, separator);
    }

    /* money: the reader's market's own figure, or the złoty one converted. */
    let map: Record<string, number>;
    try {
      map = JSON.parse(raw) as Record<string, number>;
    } catch {
      return null;
    }
    if (typeof map[code] === 'number') return exactIn(code, map[code], separator);
    const fx = FX[plan.currency as FxCode];
    const home = map[plan.currency];
    if (!fx || typeof home !== 'number') return null;
    /* Two significant figures: an estimate of a budget, not a price tag. */
    return writeIn(currency, convert(home / 10 ** fx.decimals / fx.rate, currency, 'soft'), 0, separator);
  };
}

/**
 * A tier's feature lines, as the cards list them.
 *
 * The first tier lists everything it includes; every later tier lists only
 * what it adds or raises over the tier before it, under "Everything in …,
 * plus" — eighteen rows on three cards is a wall, and the difference is what a
 * card is for. The full grid is the comparison table.
 */
export function usePlanFeatures(): (
  plans: PartnerPlan[],
  index: number,
) => { heading: string | null; lines: string[] } {
  const copy = useCopy().partnerPlans;
  const cell = usePlanCell();

  return (plans, index) => {
    const plan = plans[index];
    const previous = index > 0 ? plans[index - 1] : null;
    const lines = PARTNER_PLAN_ROWS.flatMap((row) => {
      const mine = cell(plan, row);
      if (mine === null) return [];
      if (previous && cell(previous, row) === mine) return [];
      const label = copy.rows[row.key as PartnerPlanKey];
      return [mine === true ? label : fill(copy.line, { label, value: mine })];
    });
    return {
      heading: previous ? fill(copy.everythingIn, { plan: previous.name }) : null,
      lines,
    };
  };
}

/**
 * Under a converted price, the markets' own figures in one line —
 * "149 zł in Poland · 149 000 so'm in Uzbekistan". Null when the price is a
 * market's own, which needs no gloss.
 */
export function useMarketLine(): (view: PlanPriceView | null) => string | null {
  const copy = useCopy().partnerPlans;
  return (view) => {
    if (!view?.converted) return null;
    const parts = view.markets.flatMap(({ currency, amount }) => {
      const template = (copy.markets as Record<string, string | undefined>)[currency];
      return template ? [fill(template, { amount })] : [];
    });
    return parts.length ? parts.join(' · ') : null;
  };
}
