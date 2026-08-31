/**
 * The owner's dashboard, read from the server that measures it.
 *
 * Every figure `#/dashboard` used to show was invented. `partnerMetrics.ts`
 * carried the `b2b/` prototype's seeds and derived a whole month from them —
 * six deals with claim counts, four campaigns, sixteen named customers,
 * forty-eight till receipts, a heat map from three gaussians — and none of it
 * was a measurement of anything. This module is what replaced it: one hook per
 * endpoint `server/http/routes/partner.ts` actually serves, typed to the shapes
 * `server/domain/` actually returns.
 *
 * ── three states, and the middle one is not zero ──────────────────────────
 *
 * Everything here returns `useApi`'s `loading | ready | error` union unchanged,
 * because the whole point of this rewrite is the distinction that union carries:
 * **a failed request is a state, not a zero.** A dashboard that renders 0 visits
 * when it could not reach the server tells an owner their venue is dead. A
 * dashboard that renders 0 visits because the server counted zero visits tells
 * them something true and useful. The two must never look the same, and a
 * `?? 0` anywhere below would collapse them.
 *
 * ── most of the time there is no session, and that is the honest answer ───
 *
 * The site's own auth is still `localStorage` (`src/site/auth/users.ts` says so
 * at the top). A venue owner signed in on `#/signin` has no API token, so
 * `usePartnerVenueId` resolves to `null` and every hook below reports
 * `no-partner-session` rather than firing a request that would 401. That is not
 * a failure mode to paper over with seeds — it is the true state of the
 * product, and the screens say so in words. The wiring is already the right
 * shape for the day `auth/` moves to the server; nothing here changes then
 * except that the token exists.
 *
 * ── money arrives in minor units of the *venue's* currency ────────────────
 *
 * The server stores and sends `…Minor` in `venue.currency` — grosz for a Kraków
 * café. The site stores euros everywhere and converts on the way out through
 * `useMoney` (root `CLAUDE.md`). `minorToEuro` is the one seam between those two
 * conventions, and it reads its divisor from `i18n/fx.ts` like everything else
 * that touches a rate, so a złoty figure round-trips to the same złoty figure.
 */
import { useMemo } from 'react';
import { ApiError, call, hasToken } from './client';
import { useApi, type ApiResult, type ApiState } from './useApi';
import { FX, type FxCode } from '../i18n/fx';

/* ═══════════════════════════════════════════════════════ money at the seam ══ */

/**
 * A server amount in euros.
 *
 * Two divisions, and both have to be right: the currency's minor units
 * (`decimals`, 0 for a soum and 2 for a złoty — reading it off the table rather
 * than assuming 100 is what stops a Tashkent venue's budget being shown a
 * hundred times too small), and the rate to the euro the rest of the site
 * stores in. An unknown code falls back to the euro rather than guessing, which
 * makes a mis-typed currency a wrong *scale* rather than silent nonsense.
 */
export function minorToEuro(minor: number, currency: string): number {
  const fx = FX[currency as FxCode] ?? FX.EUR;
  return minor / 10 ** fx.decimals / fx.rate;
}

/**
 * The same seam, in the direction a *write* crosses it.
 *
 * Every money control on this dashboard holds the **reader's** currency, and
 * every money field the server takes is minor units of the **venue's** — two
 * conversions, not one, and the euro in the middle is the site's own unit. A
 * Polish owner reading in English types 400, `useMoney` said £, and what the
 * budget endpoint has to receive is 187 000 grosz.
 *
 * Rounded rather than truncated, and rounded once: `int()` on the server refuses
 * a fraction outright rather than silently flooring it, so a value that arrives
 * as 39999.999999 is a 400 and not a penny lost.
 */
export function euroToMinor(euro: number, currency: string): number {
  const fx = FX[currency as FxCode] ?? FX.EUR;
  return Math.round(euro * fx.rate * 10 ** fx.decimals);
}

/* ═══════════════════════════════════════════════════ the server's shapes ══ */

/**
 * `server/domain/analytics.ts`'s `Metric`, verbatim.
 *
 * `value` is `null` when `suppressed` is true — the min-cohort floor, which is
 * the server refusing to report a finding about too few people. **It must never
 * be rendered as 0.** Null here means "we are not telling you"; zero means
 * "nothing happened", and they have opposite meanings to an owner deciding what
 * to do next.
 */
export interface Metric {
  value: number | null;
  kind: 'counted' | 'estimated' | 'attributed';
  suppressed: boolean;
  cohort?: number;
}

export interface OverviewBody {
  period: string;
  currency: string;
  visits: Metric;
  customers: Metric;
  newCustomers: Metric;
  returningCustomers: Metric;
  salesMinor: Metric;
  projectedSalesMinor: Metric;
  averageCheckMinor: Metric;
  attributedVisits: Metric;
  attributedCustomers: Metric;
  pointsIssued: number;
  discountGivenMinor: number;
}

/** One of the two pools. `base − spent − reserved` exhausts it, by construction. */
export interface Pool {
  allocation: 'loyalty' | 'voucher';
  base: number;
  spent: number;
  reserved: number;
  available: number;
}

export interface BudgetBody {
  id: string;
  venueId: string;
  period: string;
  currency: string;
  total: number;
  loyalty: Pool;
  voucher: Pool;
  tiers: Array<{
    id: string;
    discountPct: number;
    pointsCost: number;
    maxDiscountMinor: number;
    estimateMinor: number;
    estimatedRemaining: number;
    available: boolean;
  }>;
  averageCheck: { minor: number; currency: string };
  /**
   * `budget.rebalanceHint` — the server's own opinion on whether one pool is
   * near empty while the other has room, or `null` for "do not ask".
   *
   * Typed rather than left `unknown` because the null is the whole value of it:
   * the hint only appears when one side is genuinely running out *and* the
   * other has three times the threshold spare, precisely so an owner does not
   * learn to dismiss it and then miss it on the day it matters.
   */
  rebalanceHint: {
    from: 'loyalty' | 'voucher';
    to: 'loyalty' | 'voucher';
    suggested: number;
  } | null;
  tolerance: unknown;
}

/** `GET /v1/partner/venues/:id/overview` — the three panels, one request. */
export interface OverviewResponse {
  overview: OverviewBody;
  budget: BudgetBody;
  findings: Array<{ key: string; weight: number; detail: Record<string, unknown> }>;
  floors: { minCohort: number; minVenues: number };
}

export interface HeatmapBody {
  period: string;
  /** `[weekday][hour]`, 7 × 24. Venue-local, which is what makes it readable. */
  grid: number[][];
  total: number;
  quietest: { weekday: number; hour: number; visits: number } | null;
  busiest: { weekday: number; hour: number; visits: number } | null;
}

export interface CostPerNewCustomerBody {
  period: string;
  spendMinor: number;
  breakdown: { subscription: number; loyalty: number; vouchers: number; deals: number };
  newCustomers: number;
  costPerNewCustomerMinor: Metric;
}

/**
 * `GET /v1/partner/venues/:id/analytics`.
 *
 * The last four keys are **absent rather than null** on a plan without
 * `deep_analytics` — the server's own note says the shape does not change, the
 * keys simply do not arrive. Optional properties are the honest type for that,
 * and a screen has to treat "not on this plan" as a third thing beside "zero"
 * and "could not ask".
 */
export interface AnalyticsResponse {
  overview: OverviewBody;
  heatmap: HeatmapBody;
  languageMix:
    | { suppressed: true; total: number; rows: [] }
    | { suppressed: false; total: number; rows: Array<{ language: string; share: number }> };
  costPerNewCustomer: CostPerNewCustomerBody;
  cohorts?: Array<{ cohort: string; size: number; returned: Metric }>;
  repeatMultiple?: Metric;
  roi?: Array<{
    feature: 'loyalty' | 'vouchers' | 'deals';
    spendMinor: number;
    outcome: number;
    outcomeLabel: string;
    costPerOutcomeMinor: number | null;
  }>;
  benchmarks?: Array<{ metric: string; value: number; venue_count: number }>;
}

/**
 * A deal's lifecycle, in the server's own words.
 *
 * The last member is `archived` and not `ended`, which is worth saying because
 * this file claimed `ended` for a while and nothing caught it:
 * `copy.deals.states` is keyed by this union, so an archived deal drew a blank
 * where its state should have been — the one cell on that table whose missing
 * word is the answer to "why is this offer not in the app any more".
 */
export type DealStatus =
  | 'draft'
  | 'scheduled'
  | 'live'
  | 'paused'
  | 'expired'
  | 'archived';

/**
 * The three a partner may *set*, which is a smaller set than the six above.
 *
 * `draft` and `expired` are not on it because neither is a decision: a deal is
 * born a draft and expires by its own end date. `scheduled` is not either — it
 * is what publishing a deal whose window has not opened produces. What is left
 * is resume, pause, and take it down for good.
 */
export type DealAction = 'live' | 'paused' | 'archived';

/** A row of `partners.dealsFor` — the `hot_deals` row plus its funnel. */
export interface DealResponse {
  id: string;
  venue_id: string | null;
  discount_text: string | null;
  status: DealStatus;
  valid_from: string | null;
  valid_to: string | null;
  target_audience: string | null;
  cap_claims: number | null;
  spend_minor: number;
  seen_count: number;
  opened_count: number;
  claimed_count: number;
  funnel: {
    seen: number;
    opened: number;
    claimed: number;
    openRate: number;
    claimRate: number;
    spendMinor: number;
    capClaims: number | null;
    capSpendMinor: number | null;
  };
  translations: { languages: string[]; filled: string[]; missing: string[] };
}

/** A row of `GET /v1/partner/venues/:id/campaigns` — `campaigns.*` plus counts. */
export interface CampaignResponse {
  id: string;
  name: string;
  visits_required: number;
  reward_label: string;
  reward_cost_minor: number;
  priority: number;
  status: 'draft' | 'active' | 'paused' | 'ended';
  members: number;
  earned: number;
  redeemed: number;
}

export interface CustomerRowResponse {
  userId: string;
  name: string;
  avatar: string | null;
  spendMinor: number;
  visits: number;
  firstSeenAt: string;
  lastSeenAt: string;
  daysSince: number;
  status: string;
  stamps: number;
  vouchersHeld: number;
}

export interface CustomersResponse {
  totalCustomers: number;
  sharedCustomers: number;
  rows: CustomerRowResponse[];
}

export interface TodayResponse {
  period: string;
  customers: Metric;
  visits: Metric;
  salesMinor: Metric;
  pendingConfirmations: number;
}

export interface PushQuotaResponse {
  period: string;
  quota: number;
  used: number;
  remaining: number;
}

/* ═══════════════════════════════════════════════════════════ the session ══ */

/**
 * "We never asked" is an error, not a perpetual load.
 *
 * `useApi` given a `null` path sits at `loading` for ever, and on a dashboard
 * that reads as "your numbers are on their way" when in fact nothing was sent
 * and nothing is coming. This is the honest member of the union: we cannot ask.
 *
 * The code is checked by callers (`isNoSession`) so a screen can tell "there is
 * no partner session on this device" — the normal case, worth explaining once —
 * apart from "the server refused or is not there", which is worth explaining
 * differently.
 */
export const NO_SESSION = 'no-partner-session';

export const noSession = (why: string): ApiError => new ApiError(0, NO_SESSION, why);

export const isNoSession = (error: ApiError): boolean => error.code === NO_SESSION;

/**
 * `GET /v1/partner/venues`, which is `SELECT *` on the venue row.
 *
 * Four columns beyond the name are load-bearing on this dashboard and none of
 * them can be guessed from the site's own `BusinessProfile`:
 *
 * - **`currency`** is what every `…Minor` on every other response is counted in.
 *   The screens used to read it off the budget, which meant a screen that could
 *   not reach `/budget` silently priced a Kraków café in euros.
 * - **`timezone`** is the clock a push is scheduled against. The server refuses
 *   a send outside 07:00–21:00 *venue-local*, so an owner reading in London who
 *   picks 07:30 for their Warsaw café is refused for a reason nothing on the
 *   screen could explain without this.
 * - **`status` / `verified_at`** are the gate between a draft and a live offer.
 *   Publishing fails with `not_verified` until an operator has looked, and a
 *   screen that knows this can say so *before* the press rather than after it.
 */
export interface PartnerVenue {
  id: string;
  name: string;
  city: string | null;
  currency: string;
  timezone: string;
  status: string;
  verified_at: string | null;
}

/**
 * The venue this device's API token owns, or `null`.
 *
 * The site's `BusinessProfile` carries no server id at all, so there is nothing
 * to hand down from the session — the API has to be asked whose venue this
 * token is. With no token, or with one that is not a partner's (the console's
 * admin, for instance), this is `null` and every hook below reports
 * `no-partner-session`.
 *
 * `hasToken()` is read once per render rather than subscribed to, because
 * nothing in this app grants a partner token while the dashboard is mounted:
 * the only way to acquire one is the console's sign-in panel, which is a
 * different route. When `auth/` moves to the server this becomes a subscription
 * to the session, and nothing else here changes.
 */
export function usePartnerVenueId(): ApiResult<string | null> {
  const result = useApi<PartnerVenue[]>(hasToken() ? '/v1/partner/venues' : null);

  const anonymous = useMemo<ApiResult<string | null>>(
    () => ({
      state: {
        status: 'error',
        error: noSession('This device has no partner session on the API.'),
      },
      reload: () => undefined,
    }),
    [],
  );

  const mapped = useMemo<ApiResult<string | null>>(() => {
    if (result.state.status !== 'ready') {
      return { state: result.state as ApiState<string | null>, reload: result.reload };
    }
    return {
      state: { status: 'ready', data: result.state.data[0]?.id ?? null },
      reload: result.reload,
    };
  }, [result.state, result.reload]);

  return hasToken() ? mapped : anonymous;
}

/**
 * The same request, kept whole.
 *
 * A second hook rather than a second field on the first, because most callers
 * genuinely only want the id and threading a row they ignore through six
 * screens is how a shape ends up being read for something it does not carry.
 * `useApi` holds no cache, so the two fire two requests — which is already true
 * of `usePartnerVenueId` itself, called once by the rail, once by the screen and
 * once by the drawer. One more GET of one row is the cheaper of the two costs.
 */
export function usePartnerVenue(): ApiResult<PartnerVenue | null> {
  const result = useApi<PartnerVenue[]>(hasToken() ? '/v1/partner/venues' : null);

  const anonymous = useMemo<ApiResult<PartnerVenue | null>>(
    () => ({
      state: {
        status: 'error',
        error: noSession('This device has no partner session on the API.'),
      },
      reload: () => undefined,
    }),
    [],
  );

  const mapped = useMemo<ApiResult<PartnerVenue | null>>(() => {
    if (result.state.status !== 'ready') {
      return { state: result.state as ApiState<PartnerVenue | null>, reload: result.reload };
    }
    return {
      state: { status: 'ready', data: result.state.data[0] ?? null },
      reload: result.reload,
    };
  }, [result.state, result.reload]);

  return hasToken() ? mapped : anonymous;
}

/**
 * One venue-scoped GET, or the `no-partner-session` state.
 *
 * Every hook below is this function with a suffix, which is deliberate: the
 * "there is nobody to ask on behalf of" branch is written once, so a screen
 * added later cannot forget it and fall back to a plausible number.
 */
function useVenueApi<T>(venueId: string | null, suffix: string): ApiResult<T> {
  const path = venueId === null ? null : `/v1/partner/venues/${encodeURIComponent(venueId)}${suffix}`;
  const result = useApi<T>(path);

  /* Memoised so the substituted state is referentially stable — the screens
     read it inside `useMemo`, and a fresh object every render would re-run
     every derivation and restart every count-up animation. */
  const unavailable = useMemo<ApiResult<T>>(
    () => ({
      state: {
        status: 'error',
        error: noSession('This device has no partner session on the API.'),
      },
      reload: () => undefined,
    }),
    [],
  );

  return path === null ? unavailable : result;
}

/* A calendar month, `YYYY-MM`, which is the server's own window. It is *not*
   the dashboard's 7/14/30/90-day picker: a rolling day count and a calendar
   month are different windows, and quoting one under the other's label is the
   mismatch that made the old seeded screens quadruple their own click rate
   when somebody narrowed the range. */
const periodQuery = (period?: string) =>
  period ? `?period=${encodeURIComponent(period)}` : '';

export const usePartnerOverview = (venueId: string | null, period?: string) =>
  useVenueApi<OverviewResponse>(venueId, `/overview${periodQuery(period)}`);

export const usePartnerAnalytics = (venueId: string | null, period?: string) =>
  useVenueApi<AnalyticsResponse>(venueId, `/analytics${periodQuery(period)}`);

export const usePartnerDeals = (venueId: string | null) =>
  useVenueApi<DealResponse[]>(venueId, '/deals');

export const usePartnerCampaigns = (venueId: string | null) =>
  useVenueApi<CampaignResponse[]>(venueId, '/campaigns');

export const usePartnerBudget = (venueId: string | null) =>
  useVenueApi<BudgetBody>(venueId, '/budget');

export const usePartnerCustomers = (venueId: string | null) =>
  useVenueApi<CustomersResponse>(venueId, '/customers');

export const usePartnerToday = (venueId: string | null) =>
  useVenueApi<TodayResponse>(venueId, '/today');

export const usePartnerPushQuota = (venueId: string | null) =>
  useVenueApi<PushQuotaResponse>(venueId, '/push-quota');

/* ═════════════════════════════════════════════════ chaining the two calls ══ */

/**
 * The venue id, then the report — as one state.
 *
 * Two requests in sequence produce four combinations and only one of them is
 * "ready"; folding them here means a screen writes one `if` rather than a
 * truth table, and cannot accidentally treat "still resolving which venue this
 * is" as "this venue has no data".
 */
export function chain<T>(
  /* `unknown` rather than `string | null`, so the venue half may be either
     hook: some screens need the id and some need the whole row, and the only
     thing this function reads out of it is whether it is `null`. */
  venue: ApiResult<unknown>,
  report: ApiResult<T>,
): ApiState<T> {
  if (venue.state.status === 'loading') return { status: 'loading' };
  if (venue.state.status === 'error') return { status: 'error', error: venue.state.error };
  if (venue.state.data === null) {
    return {
      status: 'error',
      error: noSession('This API session owns no venue.'),
    };
  }
  return report.state;
}

/* ══════════════════════════════════════════════════════════ writing a deal ══ */

/**
 * What the create drawer sends, in the API's own words.
 *
 * The drawer's state is a form — a title, a badge, seven checkboxes, two clock
 * faces — and none of those are what the endpoint takes. Translating between
 * them belongs here rather than in the component for the reason every other
 * mapping in this file lives here: the shape the server accepts is a fact about
 * the API, and a component that knows it is a component that has to be edited
 * when the API moves.
 */
export interface DealDraft {
  /** Per language, keyed by the site's own two-letter codes. */
  copy: Record<string, { title: string; description: string }>;
  /** The badge — "20%", "2+1". Free text on the server, and rightly so. */
  discountText: string;
  category?: string;
  /** `YYYY-MM-DD`, both inclusive. */
  validFrom: string;
  validTo: string;
  /** 0 = Monday, matching `LocalTime.weekday`. An empty list means every day. */
  targetWeekdays: number[];
  /** Minutes past local midnight. */
  targetFromMin: number;
  targetToMin: number;
  targetLanguages: string[];
  targetAudience: string[];
  capClaims?: number;
  /** Minor units of the **venue's** currency, which is not the reader's. */
  capSpendMinor?: number;
}

export interface CreatedDeal {
  id: string;
  status: string;
}

/**
 * Create a deal. It arrives as a draft — publishing is a second call.
 *
 * Two calls and not one because they are two decisions on the server, and the
 * drawer offers them as two buttons: "save for later" is a draft that exists,
 * and "publish" is that draft going live. Collapsing them into a `published`
 * flag would make the failure mode worse, not better — a deal that was created
 * and then failed to publish is a real state, and the owner needs to be told
 * which half happened.
 */
export const createDeal = (venueId: string, draft: DealDraft): Promise<CreatedDeal> =>
  call<CreatedDeal>(`/v1/partner/venues/${encodeURIComponent(venueId)}/deals`, {
    method: 'POST',
    body: draft,
  });

export const publishDeal = (dealId: string): Promise<CreatedDeal> =>
  call<CreatedDeal>(`/v1/partner/deals/${encodeURIComponent(dealId)}/publish`, {
    method: 'POST',
  });

/* ═════════════════════════════════════════════════════ the venue itself ══ */

/**
 * The listing, as the server models a venue.
 *
 * A subset of `BusinessProfile` and deliberately not a mapping of all of it:
 * the site's form collects things the venue table has no column for — the app
 * store links, the Instagram handle, the spoken-language chips — and inventing
 * columns to hold them here would be designing the server from the form. What
 * goes over is what both halves already agree exists.
 */
export interface VenueDraft {
  name: string;
  category: string;
  subcategory?: string;
  city: string;
  countryCode?: string;
  address?: string;
  timezone?: string;
  currency?: string;
  priceRange?: string;
  phone?: string;
  email?: string;
  /**
   * The venue's mark, as the small square data URL the listing form stores.
   *
   * A data URL and not a filename, for the reason `imageFile.ts` gives: there
   * is nowhere to upload to, and the picture is downscaled to `LOGO_PX` before
   * it is ever kept, which is a few kilobytes. Sending it matters because a
   * logo that lives in one browser is a logo the app cannot draw — and the app
   * is where a customer sees the venue.
   *
   * If a real object store ever appears, this becomes a URL and nothing else
   * about the flow changes; the column is already `TEXT`.
   */
  imageUrl?: string;
}

export interface Venue {
  id: string;
  name: string;
  city: string | null;
  verified_at: string | null;
}

export const createVenue = (draft: VenueDraft) =>
  call<Venue>('/v1/partner/venues', { method: 'POST', body: draft });

export const updateVenue = (venueId: string, draft: VenueDraft) =>
  call<Venue>(`/v1/partner/venues/${encodeURIComponent(venueId)}`, {
    method: 'PATCH',
    body: draft,
  });

/** The venues this token owns. Empty for an account that has not listed one. */
export const myVenues = () => call<Venue[]>('/v1/partner/venues');

/**
 * Put a newly listed venue in the operator's review queue.
 *
 * **Verification is the gate between a draft and a live offer**, and until this
 * was called nothing ever entered the queue: a venue was created unverified,
 * its deals could be saved but never published, and no screen anywhere could
 * approve it because there was nothing pending to approve. An owner filled in
 * their listing and hit a wall with no visible cause.
 *
 * `manual` is the honest method of the three the server offers. `email_domain`
 * proves a venue by the address that registered it and `business_details` by a
 * tax id; the listing form asks for neither, so claiming either would be
 * naming evidence that was never collected. What actually happens is that a
 * person looks — which is what `manual` means.
 */
export const submitVerification = (venueId: string) =>
  call<{ id: string }>(
    `/v1/partner/venues/${encodeURIComponent(venueId)}/verification`,
    { method: 'POST', body: { method: 'manual' } },
  );

/* ══════════════════════════════════════════════ a wall clock, as an instant ══ */

/**
 * How far ahead of UTC a zone is at a given instant, in milliseconds.
 *
 * Formatting the instant *in* the zone and reading the result back as though it
 * were UTC is the standard way to get an offset out of `Intl` without a table
 * of them — the difference between the two is the offset, DST included, because
 * the formatter already applied it.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const at: Record<string, number> = {};
  for (const part of parts) if (part.type !== 'literal') at[part.type] = Number(part.value);

  return (
    Date.UTC(at.year, at.month - 1, at.day, at.hour, at.minute, at.second) - instant.getTime()
  );
}

/**
 * `2026-08-04` + `07:30` at a venue's own clock, as the instant the server wants.
 *
 * The owner types a wall clock — half past seven, at their café — and the API
 * takes an ISO instant. Between the two sits the venue's zone, and it has to be
 * the *venue's* rather than the device's: `deals.schedulePush` rejects anything
 * outside 07:00–21:00 **venue-local**, so a Warsaw owner reading in London who
 * asks for 07:30 is refused with `quiet_hours` for a reason nothing on the
 * screen could otherwise explain.
 *
 * Two passes, because one is wrong twice a year. The first offset is read at
 * the naive instant, which is up to an hour off across a DST boundary; the
 * second is read at the corrected one, which is the instant that actually
 * exists. An unknown zone falls back to the device's own clock rather than
 * throwing — a slightly wrong hour is recoverable and a dead button is not.
 */
export function venueInstant(date: string, time: string, timezone: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const naive = Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0);

  try {
    const once = naive - zoneOffsetMs(new Date(naive), timezone);
    return new Date(naive - zoneOffsetMs(new Date(once), timezone)).toISOString();
  } catch {
    return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0).toISOString();
  }
}

/* ═════════════════════════════════════════════ a deal after it is published ══ */

/**
 * Pause it, resume it, or take it down.
 *
 * §11.2's urgent levers, and the reason they are urgent is worth keeping in
 * mind: an owner who has run out of the thing they are giving away needs the
 * offer off the feed in seconds, not at the end of a support ticket. There is
 * no confirmation step for that reason, and `paused` is reversible.
 *
 * `archived` is not reversible from this screen, which is why it is the only one
 * of the three the UI asks twice about.
 */
export const setDealStatus = (dealId: string, status: DealAction) =>
  call<DealResponse>(`/v1/partner/deals/${encodeURIComponent(dealId)}/status`, {
    method: 'POST',
    body: { status },
  });

/**
 * Push the end date out.
 *
 * The server refuses a date that is not *later* than the one already stored —
 * "extend" means extend — and it revives an `expired` deal in the same
 * statement, which is what makes this the correct control on an offer that has
 * already run out rather than a second "publish".
 */
export const extendDeal = (dealId: string, validTo: string) =>
  call<DealResponse>(`/v1/partner/deals/${encodeURIComponent(dealId)}/extend`, {
    method: 'POST',
    body: { validTo },
  });

/**
 * The one notification a deal may carry.
 *
 * One, not many: `deal_pushes` is unique on the deal, so a second attempt is a
 * `conflict` rather than a second send. The quota is checked here too and the
 * refusal is `quota_exceeded`, which is a different sentence from "you have
 * none left" read off `push-quota` before the press — the first is what
 * happened, the second is what the screen predicted.
 */
export const scheduleDealPush = (dealId: string, scheduledAt: string) =>
  call<{ id: string; remaining: number }>(
    `/v1/partner/deals/${encodeURIComponent(dealId)}/push`,
    { method: 'POST', body: { scheduledAt } },
  );

/* ═══════════════════════════════════════════════════════════════ campaigns ══ */

/**
 * What the campaign drawer sends.
 *
 * `rewardCostMinor` is the field the whole of §5.1 turns on: a campaign pays a
 * *fixed item at an exact cost*, and the exact cost is what lets the loyalty
 * pool reserve the right amount the moment somebody qualifies. A percentage
 * would make the reserve a guess, which is why the server has no field for one
 * — see the note in `server/README.md` about the three imported campaigns that
 * had to be converted.
 */
export interface CampaignDraft {
  name: string;
  visitsRequired: number;
  rewardLabel: string;
  /** Minor units of the **venue's** currency. */
  rewardCostMinor: number;
  priority?: number;
  minSpendMinor?: number;
  rewardValidDays?: number;
}

/**
 * Create a campaign. Unlike a deal there is no second call.
 *
 * `partners.createCampaign` inserts it `active`, because a stamp card has no
 * feed placement to review and nothing to schedule — it starts counting the
 * next visit. The drawer's button says "Start the campaign" for that reason and
 * has no "publish" twin.
 */
export const createCampaign = (venueId: string, draft: CampaignDraft) =>
  call<CampaignResponse>(`/v1/partner/venues/${encodeURIComponent(venueId)}/campaigns`, {
    method: 'POST',
    body: draft,
  });

/**
 * Pause or end a campaign.
 *
 * §5.3, and the half that is easy to get wrong: pausing stops new *earning* and
 * touches nothing already earned. A reward somebody has qualified for stays
 * valid and stays reserved out of the pool, which is why the Campaigns screen
 * keeps showing an outstanding count for a paused row rather than zeroing it.
 */
export const setCampaignStatus = (
  campaignId: string,
  status: 'active' | 'paused' | 'ended',
) =>
  call<{ status: string }>(`/v1/partner/campaigns/${encodeURIComponent(campaignId)}/status`, {
    method: 'POST',
    body: { status },
  });

/* ════════════════════════════════════════════ what points buy, and the pool ══ */

/** One rung of the ladder, as `PUT /v1/partner/venues/:id/tiers` takes it. */
export interface TierDraft {
  discountPct: number;
  pointsCost: number;
  /** Minor units of the venue's currency: the most one voucher may take off. */
  maxDiscountMinor: number;
  active?: boolean;
}

/**
 * Set the ladder.
 *
 * An upsert on `(venue_id, discount_pct)`, so the percentage is the identity of
 * a rung and sending a shorter list does **not** delete the rungs left out. A
 * tier is retired by sending it with `active: false`, which is also the honest
 * model: `issued_vouchers` already refers to it, and a row with history behind
 * it is switched off rather than removed.
 */
export const setVoucherTiers = (venueId: string, tiers: TierDraft[]) =>
  call<BudgetBody['tiers']>(`/v1/partner/venues/${encodeURIComponent(venueId)}/tiers`, {
    method: 'PUT',
    body: { tiers },
  });

/**
 * Set the month's budget, and the split between the two pools.
 *
 * The split is basis points of one total rather than two amounts, and that is
 * the whole design: two fields beside each other can be set to a pair that does
 * not add up, and the first person to try it commits the same money twice. The
 * server refuses a total below what is already spent or reserved — a pool that
 * cannot honour the vouchers customers are holding is a promise already broken —
 * and reports the committed figure with the refusal so the screen can say what
 * the floor is.
 */
export const setBudget = (venueId: string, totalMinor: number, loyaltyBp?: number) =>
  call<BudgetBody>(`/v1/partner/venues/${encodeURIComponent(venueId)}/budget`, {
    method: 'PUT',
    body: loyaltyBp === undefined ? { totalMinor } : { totalMinor, loyaltyBp },
  });

/**
 * Move available money from one pool to the other.
 *
 * Two compensating movements inside one transaction, which is what keeps
 * `base − spent − reserved` exhausting both sides afterwards. Only what is
 * *available* moves: reserved money belongs to a customer who has already
 * qualified, and the refusal names how much there was.
 */
export const rebalanceBudget = (
  venueId: string,
  from: 'loyalty' | 'voucher',
  amountMinor: number,
) =>
  call<BudgetBody>(`/v1/partner/venues/${encodeURIComponent(venueId)}/budget/rebalance`, {
    method: 'POST',
    body: { from, amountMinor },
  });

/* ════════════════════════════════════════════════════════════════ the month ══ */

/**
 * The venue's own month as a CSV, from the server that counted it.
 *
 * B10, and gated behind the plan's `export_csv` entitlement — so a 403 here is
 * "not on this plan" and not "something broke", which are different sentences.
 * The body is the file rather than a download URL because there is no object
 * store behind this and there does not need to be: it is a day-by-day roll-up
 * with no user column in it, measured in kilobytes.
 */
export const exportCsv = (venueId: string) =>
  call<{ filename: string; csv: string }>(
    `/v1/partner/venues/${encodeURIComponent(venueId)}/export`,
  );

/* ═══════════════════════════════════════════════════════════════ the counter ══ */

/**
 * A transaction as the gate holds it — the row `GET /v1/venues/:id/pending`
 * returns, narrowed to what the queue draws.
 *
 * `amount_minor` is **null until step three of the gate**, which is not a
 * missing value: it is the state where a customer has scanned and nobody has
 * entered the bill yet. Rendering it as 0 would tell an owner somebody bought
 * nothing.
 *
 * `amount_entered_by` is what decides **who** may fill it in, and it is on this
 * shape because the queue is unusable without it: at a venue set to `cashier`
 * — which is the default — the *owner* types the bill, and a Confirm button
 * with no field beside it fails with `invalid_state: no amount has been
 * entered` every single time. At a venue set to `customer` the owner must not
 * offer a field at all; they are waiting on a phone.
 */
export interface PendingScan {
  id: string;
  venue_id: string;
  user_id: string;
  trigger_type: 'qr' | 'nfc' | 'manual';
  intent: 'earn' | 'voucher_redeem' | 'reward_redeem';
  amount_minor: number | null;
  amount_entered_by: 'cashier' | 'customer' | null;
  currency: string;
  opened_at: string;
}

/**
 * The confirmation queue.
 *
 * Its own hook rather than `useVenueApi` because it is *not* under
 * `/v1/partner/` — the gate owns it, and the partner companion app reads the
 * same path (§11.1). Copying the "nobody to ask on behalf of" branch is the
 * price of that, and it is copied rather than generalised because the two
 * prefixes are two different route modules and folding them would hide which.
 */
export function usePartnerPending(venueId: string | null): ApiResult<PendingScan[]> {
  const path = venueId === null ? null : `/v1/venues/${encodeURIComponent(venueId)}/pending`;
  const result = useApi<PendingScan[]>(path);

  const unavailable = useMemo<ApiResult<PendingScan[]>>(
    () => ({
      state: {
        status: 'error',
        error: noSession('This device has no partner session on the API.'),
      },
      reload: () => undefined,
    }),
    [],
  );

  return path === null ? unavailable : result;
}

/**
 * A fresh counter QR, and the second it stops working.
 *
 * Short-lived and single-use by design (§3.2): the token carries its own expiry
 * and burns on the first scan, so the screen showing it has to ask again on a
 * timer rather than print one code and walk away. That is the whole reason a
 * venue's QR is an endpoint and not a sticker.
 */
export const mintQr = (venueId: string) =>
  call<{ token: string; expiresAt: string; ttlSeconds: number }>(
    `/v1/venues/${encodeURIComponent(venueId)}/qr`,
    { method: 'POST' },
  );

/**
 * Step three: the bill.
 *
 * Minor units of the venue's currency, and an **integer** — the server's `int()`
 * refuses a fraction outright rather than rounding one, on the principle that a
 * client sending 42.50 has the wrong unit rather than a rounding problem.
 *
 * Who may call it is `venues.amount_entry`: at `cashier` (the default) only
 * staff, at `customer` only the customer or staff. The queue reads that off the
 * transaction rather than assuming, because assuming is how an owner ends up
 * typing a bill into a field the server will not accept it from.
 */
export const enterScanAmount = (transactionId: string, amountMinor: number) =>
  call<PendingScan>(`/v1/gate/transactions/${encodeURIComponent(transactionId)}/amount`, {
    method: 'POST',
    body: { amountMinor },
  });

/**
 * Commit a pending scan. This is the one call on the dashboard that moves money.
 *
 * Step four of the gate, in one database transaction: the points are granted,
 * the discount is taken, the stamp is added, the budget is debited. Nothing of
 * value existed before it (§3.1) and everything does after, which is exactly why
 * it carries an idempotency key — a double press on a slow connection must not
 * pay a customer twice, and the server settles that by storing the first
 * response against the key rather than by trusting the button to be disabled.
 */
export const confirmScan = (transactionId: string) =>
  call<{ transaction: { id: string }; pointsGranted: number; discountMinor: number }>(
    `/v1/gate/transactions/${encodeURIComponent(transactionId)}/confirm`,
    { method: 'POST', idempotencyKey: crypto.randomUUID() },
  );

/** Turn one away — a mis-scan, a customer who changed their mind, a wrong bill. */
export const cancelScan = (transactionId: string, reason: string) =>
  call<{ id: string }>(
    `/v1/gate/transactions/${encodeURIComponent(transactionId)}/cancel`,
    { method: 'POST', body: { reason } },
  );
