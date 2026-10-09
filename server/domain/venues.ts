/**
 * Venues: reading one, and the two derived numbers that belong to it.
 *
 * The average check (§4.5) lives here rather than in `vouchers.ts` because both
 * mechanics read it — a voucher reserve is built from it, and the dashboard's
 * voucher-count *estimate* (B6) is too. One definition, one place, so the two
 * cannot quote different medians of the same tills.
 */
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import { DomainError } from './errors.ts';
import { newId } from './ids.ts';
import * as audit from './audit.ts';
import { median } from './money.ts';
import { local, now, plusDays, type Iso } from './time.ts';

export interface Venue {
  id: string;
  owner_user_id: string | null;
  name: string;
  category: string;
  subcategory: string | null;
  /** JSON array of taxonomy keys, or NULL — read it through `categories.tagsOf`. */
  tags: string | null;
  city: string;
  country_code: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  timezone: string;
  currency: string;
  price_range: string | null;
  image_url: string | null;
  rating: number | null;
  review_count: number;
  phone: string | null;
  email: string | null;
  status: string;
  verified_at: string | null;
  amount_entry: 'cashier' | 'customer';
  min_spend_minor: number;
  max_amount_minor: number;
  avg_check_minor: number | null;
  avg_check_source: 'category' | 'computed';
  /** The average transaction the owner typed, or NULL — see `averageCheck`. */
  avg_check_owner_minor: number | null;
  /** 1 once the owner has switched the average to their own sales. */
  avg_check_auto: number;
  /** "Most off one voucher": every rung's cap when set — see `voucherCapOf`. */
  voucher_cap_minor: number | null;
  accepts_vouchers: number;
  points_per_scan: number;
  scan_cooldown_hours: number;
  loyalty_active: number;
  created_at: string;
  updated_at: string;
}

export async function getVenue(db: Db, venueId: string): Promise<Venue> {
  const venue = await db.get<Venue>(`SELECT * FROM venues WHERE id = $v AND deleted_at IS NULL`, {
    v: venueId,
  });
  if (!venue) throw new DomainError('not_found', 'venue not found');
  return venue;
}

export const venuesOf = async (db: Db, ownerId: string): Promise<Venue[]> =>
  await db.all<Venue>(
    `SELECT * FROM venues WHERE owner_user_id = $o AND deleted_at IS NULL ORDER BY created_at`,
    { o: ownerId },
  );

/** B1: nothing publishes before verification. The one check every author calls. */
export function requireVerified(venue: Venue): void {
  if (venue.status !== 'live' || !venue.verified_at) {
    throw new DomainError('not_verified', 'venue is not verified', { status: venue.status });
  }
}

/** The venue's own clock, which is the only one its windows are evaluated in. */
export const venueLocal = (venue: Venue, at: Iso = now()) => local(at, venue.timezone);

/**
 * §4.5. The rolling median check, or the category default until there is enough
 * to compute one.
 *
 * Median, not mean: one table of twelve is worth eight ordinary bills, and a
 * mean lets that single Friday move every voucher reserve for a month. Thirty
 * confirmed transactions is the switch-over, and the switch fires a partner
 * notification (§4.5) because the estimate the dashboard shows will visibly
 * move on the day it happens — an unexplained jump reads as a bug.
 */
/**
 * The average transaction every voucher figure is multiplied by — and the
 * owner's say over it.
 *
 * The owner can type one (`avg_check_owner_minor`) and can switch to
 * **automatic** (`avg_check_auto`), which is the median of their own confirmed
 * sales over the window. Automatic is a switch the *owner* flips once they
 * judge there is enough of their own trading to stand on, so it uses whatever
 * sales there are and does not wait for `avgCheckMinSamples`; with none at all
 * it falls back to their typed figure, then the rule below. A venue that has
 * touched neither gets exactly the rule it always had (`measuredCheck`).
 *
 * Every voucher reserve and every dashboard estimate reads this, so the figure
 * an owner types is the figure the money is set aside by — not a label over
 * a number computed somewhere else.
 */
export async function averageCheck(
  db: Db,
  venue: Venue,
  at: Iso = now(),
): Promise<{
  minor: number;
  source: 'category' | 'computed' | 'owner';
  samples: number;
  /** Which of the owner's two settings is in force. */
  mode: 'manual' | 'automatic';
  /** What the owner typed, or null. */
  ownerMinor: number | null;
  /** The median of the window's confirmed sales, or null with none — what automatic would use. */
  salesMinor: number | null;
}> {
  const sales = await salesOf(db, venue, at);
  const mode = venue.avg_check_auto ? 'automatic' : 'manual';
  const ownerMinor = venue.avg_check_owner_minor ?? null;
  const salesMinor = sales.length > 0 ? (median(sales) ?? null) : null;
  const decorate = { samples: sales.length, mode, ownerMinor, salesMinor } as const;

  if (mode === 'automatic' && salesMinor !== null) return { minor: salesMinor, source: 'computed', ...decorate };
  if (ownerMinor !== null) return { minor: ownerMinor, source: 'owner', ...decorate };
  const measured = await measuredFrom(db, venue, sales);
  return { minor: measured.minor, source: measured.source, ...decorate };
}

/** The window's confirmed amounts, in minor units of the venue's currency. */
async function salesOf(db: Db, venue: Venue, at: Iso): Promise<number[]> {
  const since = plusDays(at, -CONFIG.vouchers.avgCheckWindowDays);
  return (await db
    .all<{ amount_minor: number }>(
      `SELECT amount_minor FROM transactions
        WHERE venue_id = $v AND status = 'committed' AND confirmed_at >= $s
          AND amount_minor IS NOT NULL`,
      { v: venue.id, s: since },
    ))
    .map((row) => row.amount_minor);
}

/**
 * The rule with no owner in it: the median once there are enough sales, the
 * stored figure or the category's before that. What `refreshAverageCheck`
 * stores, because `avg_check_source` can only say `category` or `computed`.
 */
export async function measuredCheck(
  db: Db,
  venue: Venue,
  at: Iso = now(),
): Promise<{ minor: number; source: 'category' | 'computed'; samples: number }> {
  const sales = await salesOf(db, venue, at);
  return { ...(await measuredFrom(db, venue, sales)), samples: sales.length };
}

async function measuredFrom(
  db: Db,
  venue: Venue,
  amounts: number[],
): Promise<{ minor: number; source: 'category' | 'computed' }> {
  if (amounts.length >= CONFIG.vouchers.avgCheckMinSamples) {
    const value = median(amounts) ?? 0;
    return { minor: value, source: 'computed' };
  }

  /* The venue's own stored figure first, then the category default.
     That order matters for the imported venues: the old database carried a real
     average check per venue, and letting a category default overwrite it would
     throw away the better number in favour of a generic one. The category
     default is what a venue with *nothing* falls back to. */
  const fallback =
    venue.avg_check_minor ??
    (await db.get<{ avg_check_minor: number }>(
      `SELECT avg_check_minor FROM category_defaults WHERE category = $c`,
      { c: venue.category },
    ))?.avg_check_minor ??
    6000;

  return { minor: fallback, source: 'category' };
}

/**
 * The cap a rung actually applies: the owner's "most off one voucher" when they
 * have set one, the rung's own `max_discount_minor` when they have not.
 *
 * One number over every rung rather than a ceiling on top of three, because
 * the owner typed it as *the* most a voucher takes off — a ceiling that only
 * lowered caps would make a figure above the rungs' own a field that does
 * nothing. The rung's own value is kept, not overwritten, so clearing the
 * field puts each rung back where it was.
 */
export const voucherCapOf = (venue: Pick<Venue, 'voucher_cap_minor'>, rungCapMinor: number): number =>
  venue.voucher_cap_minor ?? rungCapMinor;

/**
 * The owner's voucher economics, from the Vouchers screen: the average
 * transaction they type, the switch to their own sales, and the most one
 * voucher takes off. Each key is optional and `null` clears the figure — absent
 * leaves it as it is, the same rule as every patch on this surface.
 */
export async function setVoucherEconomics(
  db: Db,
  input: {
    venueId: string;
    actorId: string;
    averageCheckMinor?: number | null;
    averageCheckAuto?: boolean;
    maxVoucherMinor?: number | null;
    at?: Iso;
  },
): Promise<Venue> {
  const at = input.at ?? now();
  const venue = await getVenue(db, input.venueId);
  const positive = (value: number | null | undefined, field: string) => {
    if (value === undefined || value === null) return;
    if (!Number.isInteger(value) || value < 1) {
      throw new DomainError('validation_failed', `${field} is a whole number of minor units of at least 1, or null`, {
        field,
      });
    }
  };
  positive(input.averageCheckMinor, 'averageCheckMinor');
  positive(input.maxVoucherMinor, 'maxVoucherMinor');

  const next = {
    owner: input.averageCheckMinor === undefined ? venue.avg_check_owner_minor : input.averageCheckMinor,
    auto: input.averageCheckAuto === undefined ? venue.avg_check_auto : input.averageCheckAuto ? 1 : 0,
    cap: input.maxVoucherMinor === undefined ? venue.voucher_cap_minor : input.maxVoucherMinor,
  };
  await db.tx(async () => {
    await db.run(
      `UPDATE venues SET avg_check_owner_minor = $o, avg_check_auto = $a, voucher_cap_minor = $c, updated_at = $t
        WHERE id = $v`,
      { o: next.owner, a: next.auto, c: next.cap, t: at, v: venue.id },
    );
    await audit.record(db, {
      actorId: input.actorId,
      action: 'venue.voucher_economics',
      entity: 'venue',
      entityId: venue.id,
      venueId: venue.id,
      before: {
        averageCheckMinor: venue.avg_check_owner_minor,
        averageCheckAuto: Boolean(venue.avg_check_auto),
        maxVoucherMinor: venue.voucher_cap_minor,
      },
      after: { averageCheckMinor: next.owner, averageCheckAuto: Boolean(next.auto), maxVoucherMinor: next.cap },
      at,
    });
  });
  return await getVenue(db, venue.id);
}

/**
 * Recompute and store the average check, returning whether the source flipped.
 *
 * Stored as well as computed because the dashboard reads it on every page load
 * and the median is a scan of a month of transactions; the flip is what the
 * caller turns into a notification.
 */
export async function refreshAverageCheck(db: Db, venue: Venue, at: Iso = now()): Promise<{ flipped: boolean; minor: number }> {
  /* The owner-free rule: this column is the fallback `measuredFrom` reads and
     its source can only be `category` or `computed`. */
  const next = await measuredCheck(db, venue, at);
  const flipped = next.source !== venue.avg_check_source;
  await db.run(
    `UPDATE venues SET avg_check_minor = $a, avg_check_source = $s, updated_at = $t WHERE id = $v`,
    { a: next.minor, s: next.source, t: at, v: venue.id },
  );
  return { flipped, minor: next.minor };
}

/**
 * Is the venue open right now, in its own time?
 *
 * Absence of hours means "no opening hours recorded", which is treated as open —
 * a listing with no hours is incomplete, not shut, and hiding it would punish
 * the venue for a missing field rather than tell anyone anything true.
 */
export async function isOpen(db: Db, venue: Venue, at: Iso = now()): Promise<boolean> {
  const l = local(at, venue.timezone);
  const row = await db.get<{ opens_min: number | null; closes_min: number | null; closed: number }>(
    `SELECT opens_min, closes_min, closed FROM venue_hours WHERE venue_id = $v AND weekday = $d`,
    { v: venue.id, d: l.weekday },
  );
  if (!row) return true;
  if (row.closed) return false;
  if (row.opens_min === null || row.closes_min === null) return true;
  return row.opens_min < row.closes_min
    ? l.minutes >= row.opens_min && l.minutes < row.closes_min
    : l.minutes >= row.opens_min || l.minutes < row.closes_min;
}

/**
 * A listing being seen, and a listing being opened.
 *
 * The counterpart of `deals.track`, one level up: that one counts what happened
 * to an *offer*, this counts what happened to the *venue*. An owner asking "is
 * anybody seeing us" is asking this question, and until now the only answer the
 * system could give was about the deals they had published — which says nothing
 * at all about a venue that has not published one.
 *
 * Three rules it inherits from the deal funnel and one it does not:
 *
 * - **Impression and click only.** A visit is written by the gate from a
 *   confirmed scan. A "visit" a client could post is footfall a client could
 *   invent, and footfall is the number the whole dashboard argues from.
 * - **`user_id` is optional and stays that way.** Most impressions happen to
 *   somebody who is not signed in; that is a real impression and it counts. The
 *   column is nullable for exactly this.
 * - **`source` is where it happened** — a list, a search result, a map pin, the
 *   guidebook — because "seen 900 times" and "seen 900 times, 850 of them in
 *   one list nobody scrolls" are different findings.
 * - Unlike a deal, there is **no counter column to maintain**. `hot_deals` keeps
 *   `seen_count`/`opened_count` because a deal card renders its own funnel; a
 *   venue's reach is only ever read through `analytics.reach`, which aggregates
 *   the rows. One source of truth, and no cache to drift.
 */
export async function trackListing(
  db: Db,
  input: {
    venueId: string;
    userId?: string | null;
    kind: 'impression' | 'click';
    source?: string;
    city?: string;
    language?: string;
    at?: Iso;
  },
): Promise<void> {
  /* Reads the venue first so a bad id is a 404 rather than a row pointing at
     nothing: `service_events.venue_id` is `ON DELETE SET NULL`, so an unchecked
     insert against a missing venue would be accepted and then be unattributable
     forever. */
  const venue = await getVenue(db, input.venueId);

  await db.run(
    `INSERT INTO service_events
       (id, service_id, venue_id, user_id, event_type, source, city, country_code, language, created_at)
     VALUES ($i, NULL, $v, $u, $e, $s, $c, $cc, $l, $t)`,
    {
      i: newId('sev'),
      v: venue.id,
      u: input.userId ?? null,
      e: input.kind,
      s: input.source ?? null,
      c: input.city ?? venue.city ?? null,
      cc: venue.country_code ?? null,
      l: input.language ?? null,
      t: input.at ?? now(),
    },
  );
}

/** Great-circle distance in km — what impossible-travel detection measures. */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
