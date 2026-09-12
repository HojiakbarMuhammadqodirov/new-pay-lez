/**
 * One venue, as a player sees it — the listing, what points buy there, what the
 * player already holds there, and whether the venue may know who they are.
 *
 * Every shape below is a response the server already sends; nothing here needed
 * a new endpoint. They are transcribed rather than tidied, snake_case where the
 * server writes snake_case, for the reason `consumer.ts` gives: a mapper that
 * renamed fields on the way in is one more place for the two halves to drift.
 *
 * ── the one purchase, and its key ────────────────────────────────────────
 *
 * `issueVoucher` spends points. `POST /v1/vouchers` is `idempotent: true`, and
 * the server stores the *response* against the key — so a retry after a dropped
 * connection gets the voucher the first attempt issued, not a second one. That
 * only holds if the retry reuses the key, which is why the key is minted by the
 * caller per attempt and kept across "Try again" rather than generated in here
 * per request.
 *
 * ── what the venue may see ───────────────────────────────────────────────
 *
 * `POST|DELETE /v1/me/sharing/:venueId` is §1.4's per-venue consent: with it,
 * the venue's dashboard shows this person's name and photo beside their visits
 * there; without it, a visit is a row with nobody's name on it. The switch that
 * drives it says exactly that, in `wallet.sheet.shareWhat`.
 */
import { ApiError, call } from './client';
import type { BrowsedDeal } from './wallet';

/* ══════════════════════════════════════════════════════════════ opening ══ */

/**
 * What a screen knows about a venue at the moment it asks to open one.
 *
 * `name` is drawn while the detail is on its way, so the sheet's title is not a
 * blank for the length of a request. There was a `city` here too, sent so a
 * venue's deals were asked in the venue's own city; the server stopped filtering
 * one venue's deals by the reader's city, and the field went with the
 * workaround — see `venuePath`.
 */
export interface VenueRef {
  id: string;
  name?: string | null;
}

/* ═══════════════════════════════════════════════════════════════ the list ══ */

/** `GET /v1/venues` — live, not deleted, best rated first. */
export interface VenueListRow {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  city: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  price_range: string | null;
  image_url: string | null;
  rating: number | null;
  review_count: number;
  /** An integer column: `1` or `0`, never a boolean on the wire. */
  accepts_vouchers: number;
}

/**
 * The venues in one city.
 *
 * The server matches `venues.city = $city` literally, which is why the caller
 * passes the city **as the server stores it on the account** (`GET /v1/me`)
 * rather than whatever the profile form last showed: a spelling that is not the
 * stored one is a list with nothing in it.
 */
export const venuesPath = (city: string, limit = 50): string =>
  `/v1/venues?${new URLSearchParams({ city, limit: String(limit) }).toString()}`;

/* ═════════════════════════════════════════════════════════════ the detail ══ */

/** One rung of `vouchers.ladder`. */
export interface VenueTier {
  id: string;
  discountPct: number;
  pointsCost: number;
  /** Minor units of the **venue's** currency. The cap at the till. */
  maxDiscountMinor: number;
  estimateMinor: number;
  estimatedRemaining: number;
  /**
   * Whether the venue's voucher pool will issue this rung right now (§4.4).
   *
   * `false` is not "sold out" and is not the player's fault: as the pool empties
   * the top of the ladder closes first and the bottom rung stays open.
   */
  available: boolean;
}

/** `campaigns.progressFor` — every active card at the venue, touched or not. */
export interface VenueStampCard {
  campaign: {
    id: string;
    venue_id: string;
    name: string;
    visits_required: number;
    reward_label: string;
    reward_cost_minor: number;
    priority: number;
    recurring: number;
    min_spend_minor: number | null;
    reward_valid_days: number;
    status: string;
  };
  stamps: number;
  required: number;
  cycles: number;
}

/**
 * An earned reward — `SELECT * FROM earned_rewards`.
 *
 * The same row arrives on `GET /v1/wallet` (every venue) and on
 * `GET /v1/venues/:id` (this one), so one type serves both. `code` is what staff
 * type into the counter tool.
 */
export interface EarnedReward {
  id: string;
  user_id: string;
  venue_id: string;
  campaign_id: string;
  label: string;
  cost_minor: number;
  reserved_minor: number;
  status: string;
  code: string;
  budget_id: string | null;
  earned_at: string;
  expires_at: string;
  redeemed_at: string | null;
}

/** `venue_hours`. `weekday` 0 is **Monday**, minutes are venue-local. */
export interface VenueHoursRow {
  weekday: number;
  opens_min: number | null;
  closes_min: number | null;
  closed: number;
}

export interface VenueDetail {
  venue: {
    id: string;
    name: string;
    category: string;
    subcategory: string | null;
    city: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    currency: string;
    priceRange: string | null;
    imageUrl: string | null;
    rating: number | null;
    reviewCount: number;
    phone: string | null;
    acceptsVouchers: boolean;
    pointsPerScan: number;
    /**
     * The IANA zone the venue's hours are written in — whose "today" it is.
     *
     * Optional because it arrived after the rest of this shape: a server from
     * before it answers without one, and `hoursForToday` then names the
     * reader's weekday instead of claiming to know the venue's.
     */
    timezone?: string;
  };
  links: Array<{ kind: string; value: string }>;
  hours: VenueHoursRow[];
  /** In the reader's language, English filling a hole, or `null`. */
  description: string | null;
  tiers: VenueTier[];
  deals: BrowsedDeal[];
  /** Empty when nobody is signed in — never "no cards at this venue". */
  stampCards: VenueStampCard[];
  rewards: EarnedReward[];
}

/**
 * The detail path — the id, and deliberately nothing else.
 *
 * It carried the venue's city for a while. `deals.browse` used to filter one
 * venue's deals by the *reader's* city, so a player whose profile says Warsaw
 * opening a Kraków café was told it had no live deals, and sending the venue's
 * own city was the workaround. The server now drops the city filter whenever the
 * list is scoped to a venue, so "live deals here" means here without help — and
 * a query parameter that no longer changes the answer is one the next reader
 * would have to go and check.
 */
export const venuePath = (id: string): string => `/v1/venues/${encodeURIComponent(id)}`;

/* ═══════════════════════════════════════════════════════════ the purchase ══ */

/** `SELECT * FROM issued_vouchers` — what `POST /v1/vouchers` returns. */
export interface IssuedVoucher {
  id: string;
  user_id: string;
  venue_id: string;
  tier_id: string;
  discount_pct: number;
  max_discount_minor: number;
  points_spent: number;
  reserved_minor: number;
  spent_minor: number;
  code: string;
  status: string;
  budget_id: string | null;
  transaction_id: string | null;
  issued_at: string;
  expires_at: string;
  redeemed_at: string | null;
}

/** A fresh key for one attempt at one rung. Reused by that attempt's retry. */
export const voucherAttemptKey = (venueId: string, tierId: string): string =>
  `voucher:${venueId}:${tierId}:${Date.now()}`;

/** Points in, a code out. See the header for why the key is the caller's. */
export const issueVoucher = (venueId: string, tierId: string, idempotencyKey: string) =>
  call<IssuedVoucher>('/v1/vouchers', {
    method: 'POST',
    body: { venueId, tierId },
    idempotencyKey,
  });

/**
 * Which sentence a failed purchase gets.
 *
 * Read off the server's error **code**, which is a closed list
 * (`server/domain/errors.ts`) — never off the message, which is English prose
 * for a log. Four of them are refusals that charged nothing and say why; `0` is
 * the one case where the outcome is genuinely unknown, and it is the only one
 * that offers a retry on the same key.
 */
export type PurchaseFailure =
  | 'insufficient'
  | 'exhausted'
  | 'closed'
  | 'gone'
  | 'signedOut'
  | 'unreachable'
  | 'other';

export function purchaseFailure(error: unknown): PurchaseFailure {
  if (!(error instanceof ApiError)) return 'other';
  if (error.status === 0) return 'unreachable';
  if (error.status === 401) return 'signedOut';
  switch (error.code) {
    case 'insufficient_points':
      return 'insufficient';
    case 'budget_exhausted':
      return 'exhausted';
    /* `vouchers.issue` throws `invalid_state` for exactly one thing: a venue
       that has switched vouchers off since the ladder was drawn. */
    case 'invalid_state':
      return 'closed';
    case 'not_found':
      return 'gone';
    default:
      return 'other';
  }
}

/**
 * How many points a refused purchase was short, when the refusal said so.
 *
 * `ledger.spend` refuses with `required` and `available` beside the code, and
 * `ApiError` keeps that detail — so the sentence can say "40 more points" rather
 * than only "not enough", which is the half of a refusal somebody can act on.
 * `null` when either figure is missing or not a number: a shortfall nobody
 * reported is not printed as zero, or as anything.
 */
export function pointsMissing(error: unknown): number | null {
  if (!(error instanceof ApiError) || error.code !== 'insufficient_points') return null;
  const { required, available } = error.detail;
  if (typeof required !== 'number' || typeof available !== 'number') return null;
  const missing = required - available;
  return missing > 0 ? missing : null;
}

/* ═════════════════════════════════════════════════════════════ consent ══ */

/** `GET /v1/me/consents`. Only `dataSharing` is read here. */
export interface Consents {
  account: Array<{ kind: string; granted: boolean }>;
  /** Unrevoked grants only — a venue absent from this list is not shared with. */
  dataSharing: Array<{ venue_id: string; name: string; granted_at: string }>;
}

export const CONSENTS_PATH = '/v1/me/consents';

/** Idempotent on the server: an existing grant is returned, not duplicated. */
export const shareProfileWith = (venueId: string) =>
  call<{ id: string; granted: true }>(`/v1/me/sharing/${encodeURIComponent(venueId)}`, {
    method: 'POST',
  });

/** `revoked: false` means there was nothing to revoke — still not shared. */
export const stopSharingWith = (venueId: string) =>
  call<{ revoked: boolean }>(`/v1/me/sharing/${encodeURIComponent(venueId)}`, {
    method: 'DELETE',
  });

/* ═════════════════════════════════════════════════════════════ helpers ══ */

/** `auth: 'user'`. The username is the counter code; the city picks the list. */
export const ME_PATH = '/v1/me';

/**
 * A venue's picture, only when drawing it costs no request.
 *
 * `image_url` is free text. A `data:` URL is bytes already in the response; any
 * other URL is somebody else's server, and nothing in `src/` makes a
 * third-party runtime request. So anything but an inline image is `null`, and
 * the caller draws the name's initial on the accent instead.
 */
export const inlineImage = (url: string | null | undefined): string | null =>
  url && /^data:image\/(png|jpe?g|gif|webp|avif);/i.test(url) ? url : null;

/**
 * A date the server wrote, in the reader's locale — day and month.
 *
 * Every expiry on these cards is within a year of today, so the year would be
 * noise; `wallet.tsx`'s `on()` makes the same call for the same rows.
 */
export const dayMonth = (iso: string, locale: string): string =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(iso));

/** `Intl`'s short English weekday names, in the table's 0 = Monday order. */
const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Today's hours row, and whose today it is — or `null` when the venue has not
 * published one.
 *
 * **On the venue's clock whenever the server says what that is.** `venue_hours`
 * minutes are venue-local, and so is its weekday: at half past eleven on a
 * Sunday night in London it is already Monday in Tashkent, and a Tashkent café's
 * Sunday row would be the wrong one. With `timezone` the weekday is read in that
 * zone, `venueClock` is true, and the sheet can honestly say "today".
 *
 * Without one — a server from before the field, or a zone name `Intl` does not
 * know — it falls back to the reader's weekday with `venueClock` false, and the
 * sheet names the day instead ("Thursday: 09:00–18:00"), which stays true
 * whichever day it is at the venue.
 *
 * A row with neither time and no `closed` flag says nothing, and is treated as
 * absent rather than as "closed".
 */
export function hoursForToday(
  rows: VenueHoursRow[],
  timezone?: string,
  now: Date = new Date(),
): { weekday: number; row: VenueHoursRow; venueClock: boolean } | null {
  /* `getDay()` is 0 = Sunday; the table is 0 = Monday. */
  let weekday = (now.getDay() + 6) % 7;
  let venueClock = false;

  if (timezone) {
    try {
      const index = WEEKDAY_SHORT.indexOf(
        new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: timezone }).format(now),
      );
      if (index >= 0) {
        weekday = index;
        venueClock = true;
      }
    } catch {
      /* An unknown zone throws a RangeError. The reader's weekday, named, is
         still a true line; a sheet that failed to render is not. */
    }
  }

  const row = rows.find((candidate) => candidate.weekday === weekday);
  if (!row) return null;
  if (!row.closed && (row.opens_min === null || row.closes_min === null)) return null;
  return { weekday, row, venueClock };
}

/** Minutes past midnight as a clock time in the reader's locale. */
export const clockTime = (minutes: number, locale: string): string =>
  new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(
    new Date(Date.UTC(1970, 0, 1, 0, ((minutes % 1440) + 1440) % 1440)),
  );

/**
 * A weekday's name in the reader's locale, from the table's 0 = Monday index.
 *
 * 5 January 1970 was a Monday, so `weekday` days after it is the right day of
 * the week in every locale without a table of names in five dictionaries.
 */
export const weekdayName = (weekday: number, locale: string): string =>
  new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(1970, 0, 5 + weekday)),
  );
