/**
 * What the console's analytics view is actually reading.
 *
 * React-free and pure, like `auth/business.ts` and `auth/player.ts`: one venue's
 * whole month is *derived* from its `scale`, so `npm run verify` can check that
 * the headline agrees with the cards under it, that a venue with no traffic
 * produces zeroes rather than a fraction of a customer, and that the date filters
 * on the tables mean what they say.
 *
 * Derivation rather than five hundred hand-written numbers is the point. The
 * original admin panel showed one venue at a time and every screen of it agreed
 * with every other; the only way to keep that true across five seeded venues is
 * to compute them from one seed. A quiet venue is then quiet *everywhere* — its
 * trend, its tables and its country comparison all fall together.
 *
 * `scale: 0` is not a special case, it is the same arithmetic: every count lands
 * on zero, every table empties, and the view falls back to the "nothing yet"
 * states — which is exactly the state the reference screenshots were taken in,
 * and the state the one real listing on this console is genuinely in.
 */
import type { SpokenLanguage } from './auth/business';
import {
  ADMIN_BASE,
  ADMIN_REDEMPTIONS,
  ADMIN_SCAN_ROWS,
  ADMIN_VOUCHER_ROWS,
} from './content';

/** Counts are whole; a venue does not get 0.6 of a phone call. */
const whole = (value: number, scale: number) => Math.round(value * scale);
/** Money keeps its cents until the formatter decides what to do with them. */
const money = (value: number, scale: number) => Math.round(value * scale * 100) / 100;

export interface ServiceMetrics {
  maps: number;
  website: number;
  phone: number;
  instagram: number;
  vouchersUsed: number;
  vouchersActive: number;
  loyaltyUsed: number;
  loyaltyActive: number;
  discount: number;
  scans: number;
  /**
   * Every interaction, and a sum rather than a seeded figure.
   *
   * The original shows this twice — once in the service header and once as the
   * ninth card — and two independently invented numbers would eventually
   * disagree. Adding the parts costs nothing and cannot.
   */
  engagement: number;
  vouchers: number;

  trend: number[];
  scanTrend: number[];
  salesTrend: number[];
  monthly: number[];

  loyalty: {
    perVisit: number;
    cooldown: number;
    active: boolean;
    campaigns: Array<{ visits: number; reward: number }>;
    awarded: number;
    sales: number;
    avg: number;
  };

  voucherCampaign: {
    budget: number;
    spent: number;
    issued: number;
    sales: number;
    basket: number;
    redemptions: number;
  };

  tiers: Array<{ pct: number; points: number; issued: number; cap: number }>;

  cities: Array<{ name: string; n: number }>;
  languages: Array<{ code: SpokenLanguage; n: number }>;
  country: { maps: number; website: number; phone: number };
}

/** The whole month for one venue. */
export function serviceMetrics(scale: number): ServiceMetrics {
  const b = ADMIN_BASE;

  const maps = whole(b.maps, scale);
  const website = whole(b.website, scale);
  const phone = whole(b.phone, scale);
  const instagram = whole(b.instagram, scale);
  const scans = whole(b.scans, scale);

  const vouchersUsed = whole(b.vouchersUsed, scale);
  const vouchersActive = whole(b.vouchersActive, scale);
  const loyaltyUsed = whole(b.loyaltyUsed, scale);
  const loyaltyActive = whole(b.loyaltyActive, scale);

  return {
    maps,
    website,
    phone,
    instagram,
    vouchersUsed,
    vouchersActive,
    loyaltyUsed,
    loyaltyActive,
    /* A percentage is a ratio, not a quantity: a quiet venue gives the same
       proportion away as a busy one. It only collapses when there is nothing to
       discount at all. */
    discount: scans === 0 && vouchersUsed === 0 ? 0 : b.discount,
    scans,
    engagement: maps + website + phone + instagram + scans,
    vouchers: vouchersUsed + vouchersActive + loyaltyUsed + loyaltyActive,

    trend: b.trend.map((value) => whole(value, scale)),
    scanTrend: b.scanTrend.map((value) => whole(value, scale)),
    salesTrend: b.salesTrend.map((value) => money(value, scale)),
    monthly: b.monthly.map((value) => money(value, scale)),

    loyalty: {
      perVisit: b.loyalty.perVisit,
      cooldown: b.loyalty.cooldown,
      /* Settings are settings. A venue with no scans yet still has a rule about
         what a scan is worth, and blanking it would read as "not configured". */
      active: b.loyalty.active,
      campaigns: scale > 0 ? b.loyalty.campaigns : [],
      awarded: scans * b.loyalty.perVisit,
      sales: money(b.loyalty.sales, scale),
      avg: scans === 0 ? 0 : b.loyalty.avg,
    },

    voucherCampaign: {
      budget: b.vouchers.budget,
      spent: money(b.vouchers.spent, scale),
      issued: whole(b.vouchers.issued, scale),
      sales: money(b.vouchers.sales, scale),
      basket: vouchersUsed === 0 ? 0 : b.vouchers.basket,
      redemptions: vouchersUsed + loyaltyUsed,
    },

    tiers: b.tiers.map((tier) => ({ ...tier, issued: whole(tier.issued, scale) })),

    cities: b.cities
      .map((city) => ({ ...city, n: whole(city.n, scale) }))
      .filter((city) => city.n > 0),
    languages: b.languages
      .map((language) => ({ ...language, n: whole(language.n, scale) }))
      .filter((language) => language.n > 0),
    country: b.country,
  };
}

/* ─────────────────────────────────────────────────────────────── tables ── */

/**
 * How many days back a filter reaches. `null` is "all time".
 *
 * Index-aligned with `copy.admin.analytics.ranges`, in the original's order.
 */
export const RANGES: Array<number | null> = [null, 7, 30, 90];

/** Rows a venue actually has: none at all when it has no traffic. */
function take<T>(rows: T[], scale: number): T[] {
  if (scale <= 0) return [];
  return rows.slice(0, Math.max(1, Math.min(rows.length, Math.round(rows.length * scale))));
}

export interface Redemption {
  ago: number;
  deal: string;
  user: string;
  code: string;
  points: number;
  discount: number;
  used: boolean;
  cheque: number;
}

export const redemptionsFor = (scale: number): Redemption[] =>
  take(ADMIN_REDEMPTIONS, scale).map((row) => ({ ...row, cheque: money(row.cheque, 1) }));

export const scanRowsFor = (scale: number) => take(ADMIN_SCAN_ROWS, scale);
export const voucherRowsFor = (scale: number) => take(ADMIN_VOUCHER_ROWS, scale);

/** Whether a row falls inside the chosen range. */
export const inRange = (ago: number, days: number | null): boolean =>
  days === null || ago <= days;

/**
 * The date a row happened, as `DD.MM`.
 *
 * Computed from "days ago" at render rather than stored, so a demo left open
 * over a weekend does not start showing last week as today. `now` is a parameter
 * for the same reason it is one in `player.ts`: so this is testable.
 */
export function dayLabel(ago: number, now: Date = new Date()): string {
  const day = new Date(now);
  day.setDate(day.getDate() - ago);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(day.getDate())}.${pad(day.getMonth() + 1)}`;
}

/* ────────────────────────────────────────────────────────────────── csv ── */

/**
 * One CSV, quoted the way a spreadsheet expects.
 *
 * Every value is quoted rather than only the ones that need it: the fields
 * carry names, cities and money in five locales, and deciding per value which
 * of those contains a comma or a quote is how a table that opens fine in English
 * arrives shifted by one column in Polish. Doubling `"` is the escape.
 */
export function toCsv(headers: string[], rows: string[][]): string {
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
}
