/**
 * What the console's analytics view is actually reading — which, for most of it,
 * is nothing.
 *
 * This file used to derive a venue's whole month from one seed. `ADMIN_SERVICES`
 * gave each listing a `scale`, and `serviceMetrics(scale)` multiplied a table of
 * invented base figures by it: map opens, website clicks, phone calls, Instagram
 * taps, scans, vouchers issued and used, a thirty-day trend, a sales curve, a
 * city split, a language split and a country comparison. It was internally
 * consistent — a quiet venue was quiet everywhere, which was the whole argument
 * for deriving rather than transcribing — and none of it had been measured. An
 * operator reading "Sultan Barbers · 1,284 engagements" was reading `0.62`
 * multiplied by a number somebody typed in `content.ts`.
 *
 * ── what is actually available ───────────────────────────────────────────
 *
 * One endpoint answers anything about a specific venue to an operator:
 * `GET /v1/admin/venues` returns, per venue, a **visit count** and a **customer
 * count**, both `COUNT`s over `venue_visits` and `venue_customers`. That is the
 * whole of it. Everything else this screen showed — the four link channels, the
 * voucher and loyalty splits, the trends, the tables, the city and language
 * breakdowns — is either partner-scoped (`/v1/partner/venues/:id/analytics`,
 * which an admin token cannot call: `requireStaff` gates it on ownership) or is
 * not collected at all.
 *
 * So `serviceMetrics()` returns the **unmeasured month** and
 * `serviceMetricsFrom()` fills in the two figures that exist. `measured` is the
 * field every panel branches on, and it is `false` by construction rather than
 * by a value happening to be zero — because "nobody has counted this" and "the
 * count is zero" are different findings and the console is the screen that
 * exists to tell an operator things they cannot see from anywhere else.
 *
 * React-free and pure, like `auth/business.ts` and `auth/player.ts`, so
 * `npm run verify` can hold it to its invariants outside a browser.
 */
import type { SpokenLanguage } from './auth/business';

export interface ServiceMetrics {
  /**
   * Whether any figure below was counted by anything.
   *
   * The one field that is not a number, and the reason the rest are safe to be
   * numbers. A panel that prints a zero from an unmeasured month has told an
   * operator that a venue had no visitors, which is a different claim from "we
   * have not asked".
   */
  measured: boolean;

  /* ── the two that a real source answers ── */
  scans: number;
  customers: number;

  /* ── the rest: no source, kept so the panels have a shape to render ── */
  maps: number;
  website: number;
  phone: number;
  instagram: number;
  vouchersUsed: number;
  vouchersActive: number;
  loyaltyUsed: number;
  loyaltyActive: number;
  discount: number;
  /**
   * Every interaction, and a sum rather than a seeded figure.
   *
   * The console shows this twice — once in the service header and once as a
   * card — and two independently invented numbers would eventually disagree.
   * Adding the parts costs nothing and cannot.
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

/** A month of nothing measured. Thirty days long, so a chart still has a shape. */
const MONTH_DAYS = 30;
const flat = (days = MONTH_DAYS) => Array.from({ length: days }, () => 0);

/**
 * The whole month for one venue, with no source behind it.
 *
 * Deliberately takes no argument. It used to take a `scale`, and the whole
 * point of the rewrite is that a venue's month is not a function of a number
 * somebody typed beside its name. Every count is 0 and `measured` is `false`;
 * the view reads the flag, not the zeros.
 */
export function serviceMetrics(): ServiceMetrics {
  return {
    measured: false,
    scans: 0,
    customers: 0,
    maps: 0,
    website: 0,
    phone: 0,
    instagram: 0,
    vouchersUsed: 0,
    vouchersActive: 0,
    loyaltyUsed: 0,
    loyaltyActive: 0,
    discount: 0,
    engagement: 0,
    vouchers: 0,

    trend: flat(),
    scanTrend: flat(),
    salesTrend: flat(),
    monthly: flat(12),

    loyalty: {
      /* Settings, not measurements — but they are the *venue's* settings, held
         in `venue_settings` on the server, and nothing an operator can reach
         returns them. Zero with `measured: false` beside it is honest; a
         plausible "1 point per visit" is not. */
      perVisit: 0,
      cooldown: 0,
      active: false,
      campaigns: [],
      awarded: 0,
      sales: 0,
      avg: 0,
    },

    voucherCampaign: {
      budget: 0,
      spent: 0,
      issued: 0,
      sales: 0,
      basket: 0,
      redemptions: 0,
    },

    tiers: [],
    cities: [],
    languages: [],
    country: { maps: 0, website: 0, phone: 0 },
  };
}

/** One row of `GET /v1/admin/venues`, as far as this view uses it. */
export interface AdminVenueRow {
  id: string;
  name: string;
  city: string;
  category: string;
  status: string;
  verified_at: string | null;
  created_at: string;
  owner: string | null;
  visits: number;
  customers: number;
}

/**
 * The two figures an operator can actually get, folded into the same shape.
 *
 * `engagement` stays the sum of its parts, which now means it is the scan count
 * — the three other channels it used to include (map opens, website clicks,
 * phone taps) are not collected, and adding zeros for them would make a total
 * that quietly under-reports itself the day they are. It is a sum either way,
 * which is the property that stops the header and the card disagreeing.
 *
 * `measured` is `true` here and only here: these two came off a `COUNT`.
 */
export function serviceMetricsFrom(row: AdminVenueRow): ServiceMetrics {
  const base = serviceMetrics();
  return {
    ...base,
    measured: true,
    scans: row.visits,
    customers: row.customers,
    engagement: row.visits,
  };
}

/* ─────────────────────────────────────────────────────────────── tables ── */

/**
 * How many days back a filter reaches. `null` is "all time".
 *
 * Index-aligned with `copy.admin.analytics.ranges`, in the original's order.
 * Structure, not data — the control keeps its four choices whether or not there
 * is a row to apply them to.
 */
export const RANGES: Array<number | null> = [null, 7, 30, 90];

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

/**
 * The three tables, and all three are empty.
 *
 * They were slices of hand-written row sets in `content.ts`, cut to
 * `rows.length × scale` — so a venue with `scale: 0.62` showed the first
 * eighteen of thirty invented redemptions, under a real venue's name, with
 * invented customer names in them.
 *
 * There is no operator-facing endpoint for any of the three. Voucher
 * redemptions, scans and issued vouchers are all venue-scoped and live behind
 * `/v1/partner/…`, which an admin token cannot call — `requireStaff` gates
 * those on ownership, deliberately, and widening that gate so a console could
 * fill a table is not a rendering decision.
 */
export const redemptionsFor = (): Redemption[] => [];
export const scanRowsFor = (): Array<{
  ago: number;
  user: string;
  points: number;
  spent: number;
  receipt: string;
  city: string;
  progress: [number, number];
}> => [];
export const voucherRowsFor = (): Array<{
  ago: number;
  code: string;
  loyalty: boolean;
  user: string;
  pct: number;
  points: number;
  used: boolean;
  cheque: number;
}> => [];

/** Whether a row falls inside the chosen range. */
export const inRange = (ago: number, days: number | null): boolean =>
  days === null || ago <= days;

/**
 * The date a row happened, as `DD.MM`.
 *
 * Computed from "days ago" at render rather than stored, so a screen left open
 * over a weekend does not start showing last week as today. `now` is a
 * parameter for the same reason it is one in `player.ts`: so this is testable.
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
