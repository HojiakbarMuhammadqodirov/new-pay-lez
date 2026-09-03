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
export const foldConfirm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');
