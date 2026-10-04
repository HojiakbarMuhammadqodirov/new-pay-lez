/**
 * The console's write half.
 *
 * Every read on `#/admin` goes through `useApi`, which is right for a read: it
 * returns `loading | ready | error` as a union so "the backend is not answering"
 * and "connected, and the answer is none" cannot render as the same screen.
 * A *write* is a different shape — it happens because somebody pressed
 * something, it succeeds or it does not, and what follows is a re-read rather
 * than a state of its own. So the writes are plain calls here and the pressing
 * is `useWrite` in `adminControls.tsx`.
 *
 * ## What is deliberately not in this file
 *
 * Anything that edits a measurement. The server draws that line and
 * `server/http/routes/admin.ts` explains it at length; this file only reaches
 * for the routes on the correct side of it, and the shape of the set is the
 * argument: **remove, restore, and let somebody back in.** There is no function
 * here that sets a balance, a visit count or a funnel figure, because there is
 * no endpoint that does, because a number a partner argues from that a third
 * party can quietly change is a number nobody can defend.
 *
 * ## The two removals that take a typed answer
 *
 * `removeVenue` and `removeUser` take a `confirm` string and the server folds it
 * against the venue's name and the account's address. That is not belt and
 * braces for the button beside them — it is the same construction
 * `DELETE /v1/me` uses to make somebody type their own address before being
 * forgotten, and it is here for the same reason: both are irreversible, and the
 * screen has to make an operator read the row before acting on it. Removing an
 * offer takes no answer, because an offer is re-created in a minute from the
 * drawer it was made in and a confirmation people learn to type without reading
 * is worse than none.
 */
import { call } from './client';

/* ═══════════════════════════════════════════════════════════════ offers ══ */

/**
 * One offer, as `GET /v1/admin/deals` returns it.
 *
 * **Not `BrowsedDeal`**, and the difference is the whole reason the route
 * exists. `/v1/deals` is the customer's board: `status = 'live'`, every row put
 * through the targeting and cap checks, copy already fallen back. An operator
 * needs the ones that are *not* live — a paused offer cannot be resumed from a
 * list that cannot show it — so this carries the stored status and lets `copy`
 * be `null` for a deal nobody has written a title for yet.
 */
export interface AdminDeal {
  id: string;
  venue_id: string | null;
  partner_name: string | null;
  city: string | null;
  /** `draft` | `scheduled` | `live` | `paused` | `expired`. Archived rows never arrive. */
  status: string;
  valid_to: string | null;
  points_required: number;
  seen_count: number;
  claimed_count: number;
  copy: { title: string; description: string; terms: string; language: string } | null;
}

export const ADMIN_DEALS_PATH = '/v1/admin/deals?limit=200';

/** Take an offer off the board, or put it back. Resuming clears the same three
 *  gates the owner's own publish button does — a refusal here is the server
 *  saying the venue is unverified, the plan is full, or the deal has no copy. */
export const setDealStatus = (id: string, status: 'live' | 'paused') =>
  call<AdminDeal>(`/v1/admin/deals/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { status },
  });

/**
 * The words on the card, and the window it runs in.
 *
 * The same PATCH the status press uses, told apart by which keys are sent — so
 * a form that changed only a title sends only a title. The copy lands in the
 * **request's** language, which is the one the operator is reading the row in;
 * the server says why.
 */
export interface DealEdit {
  title?: string;
  description?: string;
  terms?: string;
  validTo?: string;
}

export const updateDeal = (id: string, patch: DealEdit) =>
  call<AdminDeal>(`/v1/admin/deals/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });

/** Remove an offer — the row, and the funnel events that cascade off it. */
export const removeDeal = (id: string) =>
  call<{ id: string; deleted: true }>(`/v1/admin/deals/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

/**
 * Take a gift card off the shelf.
 *
 * `outcome` is the server telling you which of two things happened, and they
 * are different facts: a brand nobody has bought from is `deleted`, one
 * somebody holds a card from is `delisted` — hidden from the shelf with the
 * row left in place, because the code in their wallet has to go on naming a
 * brand. The screen says which.
 */
export const removeGiftCard = (id: string) =>
  call<{ id: string; outcome: 'deleted' | 'delisted'; issued: number }>(
    `/v1/admin/gift-cards/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );

/* ═══════════════════════════════════════════════════════════ gift cards ══ */

/**
 * One shelf row as the console's Gift cards tab reads it — every row, live or
 * paused, with what has happened to its codes. The public `/v1/gift-cards` is
 * filtered to the reader's country and would hide half the shelf from an
 * operator, which is why this tab and the Offers list both read this one.
 */
export interface AdminGiftCard {
  id: string;
  brand: string;
  logo: string;
  face_minor: number;
  currency: string;
  points_cost: number;
  /** Codes nobody has been handed. */
  stock: number;
  priority_only: number;
  active: number;
  country_code: string;
  kind: 'brand' | 'venue';
  venue_id: string | null;
  venue_name: string | null;
  validity_days: number;
  how_to_use: string;
  codes_total: number;
  issued: number;
  active_cards: number;
  used_cards: number;
  expired_cards: number;
  cancelled_cards: number;
}

export const ADMIN_GIFT_CARDS_PATH = '/v1/admin/gift-cards';

/**
 * Who may buy a gift card and how much the platform spends — `giftPolicy.ts`
 * on the server. Answered with the pool it produces right now.
 */
export interface GiftPolicy {
  mode: 'auto' | 'manual';
  autoPercent: number;
  manual: {
    audience: 'all' | 'paid' | 'premium';
    budgetKind: 'amount' | 'percent';
    amountMajor: number;
    percent: number;
    from: string | null;
    until: string | null;
    repeat: 'monthly' | 'once';
    perUserEveryDays: number;
  };
  updatedAt: string | null;
}

export interface GiftPool {
  month: string;
  currency: string;
  revenueMinor: number;
  budgetMinor: number;
  spentMinor: number;
  remainingMinor: number;
  mode: 'auto' | 'manual';
  open: boolean;
}

export const GIFT_POLICY_PATH = `${ADMIN_GIFT_CARDS_PATH}/policy`;

export const saveGiftPolicy = (policy: Omit<GiftPolicy, 'updatedAt'>) =>
  call<{ policy: GiftPolicy; pool: GiftPool }>(GIFT_POLICY_PATH, { method: 'PATCH', body: policy });

export interface GiftCardInput {
  brand: string;
  logo: string;
  faceMinor: number;
  currency: string;
  pointsCost: number;
  priorityOnly: boolean;
  countryCode: string;
  kind: 'brand' | 'venue';
  venueId: string | null;
  validityDays: number;
  howToUse: string;
}

export const createGiftCard = (input: GiftCardInput) =>
  call<{ id: string }>(ADMIN_GIFT_CARDS_PATH, { method: 'POST', body: input });

/** Everything but the kind, which a card keeps for life. */
export const updateGiftCard = (id: string, patch: Partial<Omit<GiftCardInput, 'kind'>>) =>
  call<{ ok: true }>(`${ADMIN_GIFT_CARDS_PATH}/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });

export const setGiftCardActive = (id: string, active: boolean) =>
  call<{ ok: true }>(`${ADMIN_GIFT_CARDS_PATH}/${encodeURIComponent(id)}/active`, {
    method: 'POST',
    body: { active },
  });

/** A brand's real codes, one per entry. Duplicates are counted, not loaded. */
export const loadGiftCodes = (id: string, codes: string[]) =>
  call<{ added: number; duplicates: number; rejected: number }>(
    `${ADMIN_GIFT_CARDS_PATH}/${encodeURIComponent(id)}/codes`,
    { method: 'POST', body: { codes } },
  );

/** A venue card's own codes, made by the server. */
export const generateGiftCodes = (id: string, count: number) =>
  call<{ added: number }>(`${ADMIN_GIFT_CARDS_PATH}/${encodeURIComponent(id)}/codes`, {
    method: 'POST',
    body: { generate: count },
  });

/** A card somebody bought, as the usage list shows it. */
export interface IssuedGiftCard {
  id: string;
  code: string;
  status: 'active' | 'used' | 'expired' | 'cancelled';
  points_spent: number;
  issued_at: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
  cancelled_at: string | null;
  face_minor: number;
  currency: string;
  stock_id: string;
  brand: string;
  country_code: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
}

export const issuedGiftCardsPath = (stockId: string | null, status: string | null) => {
  const query = new URLSearchParams({ limit: '300' });
  if (stockId) query.set('stockId', stockId);
  if (status) query.set('status', status);
  return `${ADMIN_GIFT_CARDS_PATH}/issued?${query}`;
};

export const markIssuedUsed = (id: string) =>
  call<{ ok: true }>(`${ADMIN_GIFT_CARDS_PATH}/issued/${encodeURIComponent(id)}/used`, { method: 'POST' });

/**
 * Void a card and give its points back. The one console write that reaches the
 * ledger, and only as a new compensating entry — the code stays burned.
 */
export const cancelIssued = (id: string) =>
  call<{ refunded: number }>(`${ADMIN_GIFT_CARDS_PATH}/issued/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  });

/* ═══════════════════════════════════════════════════════════════ venues ══ */

/**
 * Suspend a venue, or bring it back.
 *
 * Reversible, and it does more than the one column suggests: everything that
 * authors or scans runs through `requireVerified`, which wants `status = 'live'`
 * — so a suspended venue publishes nothing and takes no scan at the counter.
 * Restoring does not re-open verification.
 */
export const setVenueStatus = (id: string, status: 'live' | 'suspended') =>
  call<{ id: string; status: string }>(`/v1/admin/venues/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { status },
  });

/**
 * Correct what a venue *says*, never what it measured.
 *
 * Six descriptive fields and no counter among them — the server draws that line
 * and this file only reaches for the routes on the correct side of it. It goes
 * through `partners.updateVenue` there, the owner's own writer, so an operator
 * gets the owner's validation rather than a second copy of it.
 */
export interface VenueEdit {
  name?: string;
  city?: string;
  category?: string;
  address?: string;
  phone?: string;
  email?: string;
}

export const updateVenue = (id: string, patch: VenueEdit) =>
  call<{ id: string; name: string; city: string | null; category: string }>(
    `/v1/admin/venues/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: patch },
  );

/** Remove a venue, and every offer it had on the board with it. `confirm` is
 *  the venue's name, folded for case and spacing by the server. */
export const removeVenue = (id: string, confirm: string) =>
  call<{ id: string; deleted: true; offersDeleted: number }>(
    `/v1/admin/venues/${encodeURIComponent(id)}`,
    { method: 'DELETE', body: { confirm } },
  );

/* ═══════════════════════════════════════════════════════════════ people ══ */

/** Suspend an account, or let it back in. Nothing is lost either way. */
export const setUserBanned = (id: string, banned: boolean) =>
  call<{ ok: true }>(`/v1/admin/users/${encodeURIComponent(id)}/ban`, {
    method: 'POST',
    body: { banned },
  });

/**
 * Set somebody's password for them.
 *
 * The support action the console existed without. It does not ask for the
 * current one — that is the point, the person cannot supply it — and it drops
 * every session the account has open, so anybody signed in as them is signed
 * out by the same press.
 */
export const setUserPassword = (id: string, password: string) =>
  call<{ ok: true; sessionsRevoked: true }>(
    `/v1/admin/users/${encodeURIComponent(id)}/password`,
    { method: 'POST', body: { password } },
  );

/**
 * Correct somebody's details. Not their address — that is the credential they
 * sign in with, and the tool for a person locked out is `setUserPassword`.
 */
export interface UserEdit {
  name?: string;
  city?: string;
  countryCode?: string;
  phone?: string;
  occupation?: string;
}

export const updateUser = (id: string, patch: UserEdit) =>
  call<{ id: string; display_name: string }>(`/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: patch,
  });

/**
 * Close an account. `confirm` is the address on the row.
 *
 * The same Article 17 routine somebody can run on themselves. `outcome` is the
 * server telling you which of two things happened, and they are different
 * facts: an account that never earned or spent anything is `deleted` outright,
 * and one that did is `anonymised` — the row kept with every personal field
 * blank, because `points_ledger` and `transactions` cascade on the user and a
 * venue's receipts are derived from them. Irreversible either way.
 */
export const removeUser = (id: string, confirm: string) =>
  call<{ erased: true; outcome: 'deleted' | 'anonymised' }>(
    `/v1/admin/users/${encodeURIComponent(id)}`,
    { method: 'DELETE', body: { confirm } },
  );

/**
 * The fold the server applies to a typed confirmation, repeated here for one
 * job only: deciding whether the button is enabled yet.
 *
 * The server is the authority and rejects a wrong answer whatever this says.
 * What this buys is a button that stops being greyed out at the moment the
 * operator has finished typing, rather than one that looks ready and returns a
 * 400 — and the two have to fold the same way or the screen and the server
 * disagree about a trailing space.
 */
/* ═══════════════════════════════════════════════════ subscription tiers ══ */

/**
 * One subscription, as `GET /v1/admin/subscriptions` returns it.
 *
 * Exactly one of `user_id` / `venue_id` is set, which is how the row knows its
 * own audience — and why the console never has to be told: a plan is offered to
 * whichever of the two the row names.
 */
export interface AdminSubscription {
  id: string;
  user_id: string | null;
  venue_id: string | null;
  plan_id: string;
  plan_code: string;
  plan_name: string;
  audience: 'consumer' | 'partner';
  status: string;
  source: string;
  started_at: string;
  /** When it stops, set by a dated change that supersedes it. `null` is open. */
  cancel_at: string | null;
  renews_at: string | null;
  /**
   * The venue's name or the person's display name, or `null`.
   *
   * `null` here is an account the join could not name — a provisional identity
   * with no display name — and it is drawn as the id rather than as a blank,
   * because an operator about to change somebody's tier has to be able to tell
   * which row they are on.
   */
  subject_name: string | null;
}

/**
 * The two halves, split by the server on the same comparison the gate makes.
 *
 * Read together and never merged: a list showing only `live` would have the
 * same change scheduled twice, and one that merged them would say a venue is on
 * Growth when it is on Starter until Tuesday.
 */
export interface AdminSubscriptions {
  live: AdminSubscription[];
  scheduled: AdminSubscription[];
}

export const ADMIN_SUBSCRIPTIONS_PATH = '/v1/admin/subscriptions?limit=300';

/**
 * Put an account or a venue on a tier, optionally from a date.
 *
 * `effectiveFrom` is a **bare day** (`YYYY-MM-DD`) and is meant to stay one: the
 * server keeps it as typed, so a tier dated to the first goes live at the
 * first's own midnight rather than at whatever time of day the button was
 * pressed. Sending an instant works and starts it at that instant.
 *
 * Exactly one of `userId` / `venueId`; the server refuses both and neither by
 * name rather than resolving it by precedence.
 */
export const assignPlan = (input: {
  userId?: string;
  venueId?: string;
  planCode: string;
  effectiveFrom?: string;
  note?: string;
}) =>
  call<{
    scheduled: boolean;
    effectiveFrom: string;
    subscription: AdminSubscription;
    /** The plan as it will be **read**, which for a dated change is still today's. */
    plan: { id: string; code: string; name: string; rank: number };
    entitlements: Record<string, string>;
  }>('/v1/admin/subscriptions', { method: 'POST', body: input });

/** Drop a dated change before it lands. Refused once it is in force. */
export const cancelScheduledPlan = (id: string) =>
  call<{ cancelled: boolean }>(`/v1/admin/subscriptions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

export const foldConfirm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
