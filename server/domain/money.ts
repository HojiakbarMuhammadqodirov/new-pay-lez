/**
 * Money, in integer minor units, everywhere.
 *
 * Mobile §3.4 and desktop Part E both say it: `142 zł` is stored as `14200` and
 * formatted by the client. Nothing in this backend holds an amount as a float,
 * because a 10% discount on 14 233 grosze is 1 423.3 and the third of a grosz
 * has to land somewhere on purpose rather than wherever binary floating point
 * leaves it.
 *
 * Where it lands is *down*, always, for anything the venue pays: a discount
 * rounds in the venue's favour by a fraction of a grosz, which is the direction
 * that can never make a budget pool overspend by rounding. `Math.round` would be
 * "fairer" and would also mean the sum of a thousand small discounts can exceed
 * the pool that authorised them.
 */

/** Percent of an amount, floored — see above. */
export const pctOf = (amountMinor: number, pct: number): number =>
  Math.floor((amountMinor * pct) / 100);

/**
 * What a voucher actually costs the venue: the percentage, capped (§4.2).
 *
 * The cap is the whole reason overspend is bounded. An estimate can be wrong —
 * it is built from a median check that moves — but the *actual* debit can never
 * exceed `max_discount_minor`, so the worst case of a wrong estimate is a
 * tolerance buffer, not an open tab.
 */
export const discountCost = (amountMinor: number, pct: number, capMinor: number): number =>
  Math.min(pctOf(amountMinor, pct), capMinor);

/**
 * The median of a list of amounts (§4.5).
 *
 * A median rather than a mean because one table of twelve on a Friday is worth
 * eight ordinary checks, and a mean lets that one bill move the estimate every
 * voucher is reserved against. Even-length lists take the lower of the two
 * middles rather than their average — the result stays an amount that was
 * actually charged, and it errs low, which is the safe direction for a reserve.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** Currencies with no minor unit, where a "grosz" would be a lie. */
const ZERO_DECIMAL = new Set(['UZS', 'JPY', 'KRW', 'VND', 'CLP', 'ISK']);

export const decimalsFor = (currency: string): number => (ZERO_DECIMAL.has(currency) ? 0 : 2);

/** Minor → major, for the few places that must emit a number (exports, JSON). */
export const toMajor = (minor: number, currency: string): number =>
  minor / 10 ** decimalsFor(currency);

export const fromMajor = (major: number, currency: string): number =>
  Math.round(major * 10 ** decimalsFor(currency));

/**
 * Is this a plausible amount for a transaction? (§3.4)
 *
 * Zero is rejected — a scan with no sale is not a visit — and so is anything
 * above the venue's configurable ceiling. The ceiling exists because a cashier's
 * fat finger turns 42 zł into 4200 zł, and a stamp card whose minimum spend is
 * met by a typo is the cheapest fraud in the building.
 */
export function plausibleAmount(
  amountMinor: number,
  ceilingMinor: number,
): { ok: true } | { ok: false; reason: 'zero' | 'negative' | 'ceiling' } {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) return { ok: false, reason: 'negative' };
  if (amountMinor === 0) return { ok: false, reason: 'zero' };
  if (amountMinor > ceilingMinor) return { ok: false, reason: 'ceiling' };
  return { ok: true };
}
