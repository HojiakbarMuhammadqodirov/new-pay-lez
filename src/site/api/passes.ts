/**
 * Subscription passes, read from and written to the server that holds them
 * (`server/domain/passes.ts`, `server/http/routes/passes.ts`).
 *
 * Typed to the shapes those files return, field for field. Three things about
 * them are load-bearing for any screen built on this module:
 *
 *   * **Money is minor units of the venue's currency** (`…Minor` + `currency`),
 *     like everything else from the partner API. Cross into the site's euros
 *     through `minorToEuro` / `euroToMinor` in `partner.ts`, never by dividing
 *     by 100.
 *   * **Revenue is contracted, not collected.** There is no payment rail for a
 *     venue-direct subscription, so `recurringMinor` is what subscribers are on
 *     and `payouts.connected` is always false. And in-app subscribing answers
 *     `409 not_available` (`subscribe` below) — do not draw a working buy
 *     button; `subscribeAvailable` says whether one would work.
 *   * **`upsell.minor` may be null, and null is not 0.** It comes with a
 *     `reason`; a screen that prints 0 for it claims subscribers bought nothing
 *     else, which nobody measured.
 *
 * `accent` is a key, not a hex — the palette rule (one accent on one ground)
 * is the screen's to apply, and the server deliberately does not carry colours.
 */
import { useMemo } from 'react';
import { call, hasToken } from './client';
import { useApi, type ApiResult } from './useApi';
import { noSession } from './partner';

/* ═════════════════════════════════════════════════════════ vocabularies ══ */

export type PassTemplate = 'daily' | 'bundle' | 'vip' | 'weekend' | 'custom';
export type PassAccent = 'teal' | 'deep_green' | 'purple' | 'terracotta' | 'ink';
export type PassPerk = 'early_access' | 'member_deals' | 'skip_line' | 'birthday';
export type CapKind = 'per_day' | 'per_week' | 'per_month' | 'unlimited';
export type BillingPeriod = 'monthly' | 'quarterly' | 'annual';
export type PassIntro = 'none' | 'trial_7' | 'half_first';
export type PassStatus = 'draft' | 'live' | 'paused' | 'closed';
export type PassAction = 'publish' | 'pause' | 'resume' | 'close';
export type PassSubscriptionStatus = 'trialing' | 'active' | 'cancelled' | 'expired';
/** What `missing` may name — what publishing would still refuse. */
export type PassMissing = 'name' | 'benefit' | 'price' | 'unlimitedOk';

/* ═══════════════════════════════════════════════════════════ responses ══ */

export interface Pass {
  id: string;
  venueId: string;
  template: PassTemplate;
  name: string;
  tagline: string | null;
  accent: PassAccent;
  benefitItem: string | null;
  discountPct: number | null;
  perks: PassPerk[];
  capKind: CapKind;
  capCount: number;
  unlimitedOk: boolean;
  /** 0 = Monday. Null is any day. */
  allowedDays: number[] | null;
  /** Minutes past local midnight, both or neither. */
  fromMin: number | null;
  toMin: number | null;
  /** "Most off one visit". */
  maxValueMinor: number | null;
  /** 1, or 3 for "Friends and family". */
  seats: number;
  /** Per billing period. */
  priceMinor: number;
  currency: string;
  billingPeriod: BillingPeriod;
  intro: PassIntro;
  /** Null is no limit. */
  subscriberCap: number | null;
  costPerUseMinor: number | null;
  status: PassStatus;
  /** Derived: live and every seat under the cap is held. Draw "Sold out" off this, not off `status`. */
  soldOut: boolean;
  holders: number;
  missing: PassMissing[];
  publishedAt: string | null;
  pausedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PassUpsell {
  /** Null when nothing could be measured — see `reason`. Never read as 0. */
  minor: number | null;
  /** Uses the estimate stands on, out of `redemptions` this month. */
  measured: number;
  redemptions: number;
  reason: null | 'no_redemptions' | 'no_bills_recorded' | 'no_covered_value';
}

export interface PassCard extends Pass {
  stats: { subscribers: number; usedThisMonth: number; recurringMinor: number };
}

export interface PassListResponse {
  /** The venue-local month every "this month" figure is cut on, `YYYY-MM`. */
  month: string;
  currency: string;
  stats: {
    activeSubscribers: number;
    livePasses: number;
    /** Contracted recurring revenue a month, minor units. */
    recurringMinor: number;
    redemptionsThisMonth: number;
    upsell: PassUpsell;
  };
  /** Always `{connected: false, available: false}` until a payment rail exists. */
  payouts: { connected: boolean; available: boolean };
  /** Whether customers can subscribe in the app. False by default. */
  subscribeAvailable: boolean;
  passes: PassCard[];
}

export interface PassDetailResponse {
  month: string;
  pass: Pass;
  stats: {
    subscribers: number;
    newThisMonth: number;
    cancelledThisMonth: number;
    recurringMinor: number;
    redemptionsThisMonth: number;
    /** One decimal; 0 with nobody holding. */
    perActiveSubscriber: number;
    upsell: PassUpsell;
  };
}

export interface PassMember {
  subscriptionId: string;
  passId: string;
  passName: string;
  accent: PassAccent;
  userId: string;
  name: string;
  avatar: string | null;
  since: string;
  usedThisPeriod: number;
  status: 'trialing' | 'active' | 'cancelled';
}

/** "Only customers who agreed to share appear here": `total` holds, `shared` are listed. */
export interface PassMembersResponse {
  total: number;
  shared: number;
  rows: PassMember[];
}

export interface PassTerms {
  benefitItem: string | null;
  discountPct: number | null;
  capKind: CapKind;
  capCount: number;
  allowedDays: number[] | null;
  fromMin: number | null;
  toMin: number | null;
  maxValueMinor: number | null;
  seats: number;
  billingPeriod: BillingPeriod;
}

export interface PassAllowance {
  capKind: CapKind;
  window: string;
  used: number;
  allowance: number | null;
  remaining: number | null;
  resetsAt: string | null;
}

export interface PassSubscription {
  id: string;
  passId: string;
  venueId: string;
  /** `PS-XXXXXX` — what the customer shows the counter. */
  code: string;
  status: PassSubscriptionStatus;
  startedAt: string;
  periodStart: string;
  periodEnd: string;
  /** The price this period is locked at. */
  priceMinor: number;
  currency: string;
  periodKind: 'trial' | 'intro' | 'full';
  /** Always false today. */
  charged: boolean;
  cancelledAt: string | null;
  terms: PassTerms;
}

export interface PassLookupResponse {
  subscription: { id: string; code: string; status: PassSubscriptionStatus; periodEnd: string };
  pass: { id: string; name: string; benefitItem: string | null; discountPct: number | null; seats: number };
  /** Null unless the customer shares with this venue. */
  customer: { name: string | null };
  allowance: PassAllowance;
  usable: { ok: boolean; reason: 'expired' | 'wrong_day' | 'outside_hours' | 'used_up' | null };
}

export interface PassRedeemResponse {
  redemption: {
    id: string;
    subscriptionId: string;
    passId: string;
    quantity: number;
    billMinor: number | null;
    coveredMinor: number | null;
    transactionId: string | null;
    redeemedAt: string;
    confirmedBy: { memberId: string; name: string } | null;
  };
  allowance: PassAllowance;
}

/* ════════════════════════════════════════════════════════════════ input ══ */

/**
 * The drawer's body. Every field optional on both create and edit; `null`
 * **removes** a nullable field (a discount, a day list, a cap), so keep "not
 * sent" (leave the key out) apart from it. `subscriberCap: 0` is "no limit".
 */
export interface PassInput {
  template?: PassTemplate;
  name?: string;
  tagline?: string | null;
  accent?: PassAccent;
  benefitItem?: string | null;
  discountPct?: number | null;
  perks?: PassPerk[];
  capKind?: CapKind;
  capCount?: number;
  unlimitedOk?: boolean;
  allowedDays?: number[] | null;
  fromMin?: number | null;
  toMin?: number | null;
  maxValueMinor?: number | null;
  seats?: number;
  priceMinor?: number;
  billingPeriod?: BillingPeriod;
  intro?: PassIntro;
  subscriberCap?: number | null;
  costPerUseMinor?: number | null;
}

/* ═════════════════════════════════════════════════════════════════ reads ══ */

const venuePath = (venueId: string) => `/v1/partner/venues/${encodeURIComponent(venueId)}/passes`;

/** `useApi` for a venue path, with "no partner session" as its own state rather than a request that 401s. */
function useVenuePasses<T>(venueId: string | null, suffix: string): ApiResult<T> {
  const path = venueId !== null && hasToken() ? `${venuePath(venueId)}${suffix}` : null;
  const result = useApi<T>(path);
  const unavailable = useMemo<ApiResult<T>>(
    () => ({
      state: { status: 'error', error: noSession('This device has no partner session on the API.') },
      reload: () => undefined,
    }),
    [],
  );
  return path === null ? unavailable : result;
}

export const usePartnerPasses = (venueId: string | null) => useVenuePasses<PassListResponse>(venueId, '');

export const usePartnerPass = (venueId: string | null, passId: string | null) =>
  useVenuePasses<PassDetailResponse>(passId === null ? null : venueId, passId === null ? '' : `/${encodeURIComponent(passId)}`);

/** A pass's subscribers. 403 `entitlement_required` (`identified_profiles`) on Starter. */
export const usePassSubscribers = (venueId: string | null, passId: string | null) =>
  useVenuePasses<PassMembersResponse>(
    passId === null ? null : venueId,
    passId === null ? '' : `/${encodeURIComponent(passId)}/subscribers`,
  );

/** Every sharing holder across passes — the Customers page's subscriber chip. */
export const usePassMembers = (venueId: string | null) => useVenuePasses<PassMembersResponse>(venueId, '/members');

/* ════════════════════════════════════════════════════════════════ writes ══ */

/** Always a draft. 403 `entitlement_required` (`passes`) below Growth. */
export const createPass = (venueId: string, input: PassInput) =>
  call<Pass>(venuePath(venueId), { method: 'POST', body: input });

/** A new price or rule reaches existing subscribers at their next renewal, not now. */
export const updatePass = (venueId: string, passId: string, patch: PassInput) =>
  call<Pass>(`${venuePath(venueId)}/${encodeURIComponent(passId)}`, { method: 'PATCH', body: patch });

/** Only a draft nobody ever held; anything else is closed instead. */
export const deletePassDraft = (venueId: string, passId: string) =>
  call<{ deleted: true }>(`${venuePath(venueId)}/${encodeURIComponent(passId)}`, { method: 'DELETE' });

/**
 * publish (draft → live), pause (sign-ups stop; subscribers keep it), resume,
 * close (renewals stop; members keep it to their period end). A refusal on
 * publish is `validation_failed` with `missing`, `not_verified`, or
 * `entitlement_required`.
 */
export const setPassStatus = (venueId: string, passId: string, action: PassAction) =>
  call<Pass>(`${venuePath(venueId)}/${encodeURIComponent(passId)}/status`, { method: 'POST', body: { action } });

/* ═══════════════════════════════════════════════════════════ the counter ══ */

/** Needs `scan`. Writes nothing. */
export const lookupPass = (venueId: string, code: string) =>
  call<PassLookupResponse>(`${venuePath(venueId)}/lookup`, { method: 'POST', body: { code } });

/**
 * Needs `redeem`. Idempotent — pass one key per press and reuse it on retry, or
 * a retried press spends a second use. `memberId` names who is on shift.
 */
export const redeemPass = (
  venueId: string,
  body: { code: string; quantity?: number; billMinor?: number; transactionId?: string; memberId?: string },
  idempotencyKey: string,
) => call<PassRedeemResponse>(`${venuePath(venueId)}/redeem`, { method: 'POST', body, idempotencyKey });

/* ══════════════════════════════════════════════════════════ the customer ══ */

export interface PublicPass {
  id: string;
  venueId: string;
  template: PassTemplate;
  name: string;
  tagline: string | null;
  accent: PassAccent;
  benefitItem: string | null;
  discountPct: number | null;
  perks: PassPerk[];
  capKind: CapKind;
  capCount: number;
  allowedDays: number[] | null;
  fromMin: number | null;
  toMin: number | null;
  maxValueMinor: number | null;
  seats: number;
  priceMinor: number;
  currency: string;
  billingPeriod: BillingPeriod;
  intro: PassIntro;
  soldOut: boolean;
  subscribable: boolean;
  unavailableReason: null | 'payments_unavailable' | 'sold_out';
  mine: { subscriptionId: string; status: PassSubscriptionStatus } | null;
}

export interface MyPass extends PassSubscription {
  pass: { id: string; name: string; tagline: string | null; accent: PassAccent; venueId: string; venueName: string };
  allowance: PassAllowance;
}

export const venuePasses = (venueId: string) =>
  call<{ passes: PublicPass[]; subscribeAvailable: boolean }>(`/v1/venues/${encodeURIComponent(venueId)}/passes`);

export const useMyPasses = () => useApi<{ subscriptions: MyPass[] }>(hasToken() ? '/v1/me/passes' : null);

/** `409 not_available` (`reason: payments_unavailable`) while there is no payment rail. */
export const subscribeToPass = (passId: string, idempotencyKey: string) =>
  call<PassSubscription>(`/v1/passes/${encodeURIComponent(passId)}/subscribe`, { method: 'POST', idempotencyKey });

export const cancelPass = (subscriptionId: string) =>
  call<PassSubscription>(`/v1/me/passes/${encodeURIComponent(subscriptionId)}/cancel`, { method: 'POST' });
