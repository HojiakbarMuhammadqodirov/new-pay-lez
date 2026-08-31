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
  rebalanceHint: unknown;
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

/** A row of `partners.dealsFor` — the `hot_deals` row plus its funnel. */
export interface DealResponse {
  id: string;
  venue_id: string | null;
  discount_text: string | null;
  status: 'draft' | 'scheduled' | 'live' | 'paused' | 'expired' | 'ended';
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

interface PartnerVenueRow {
  id: string;
  name: string;
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
  const result = useApi<PartnerVenueRow[]>(hasToken() ? '/v1/partner/venues' : null);

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
  venue: ApiResult<string | null>,
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
