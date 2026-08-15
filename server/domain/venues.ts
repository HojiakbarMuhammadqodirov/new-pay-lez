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
import { median } from './money.ts';
import { local, now, plusDays, type Iso } from './time.ts';

export interface Venue {
  id: string;
  owner_user_id: string | null;
  name: string;
  category: string;
  subcategory: string | null;
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
  accepts_vouchers: number;
  points_per_scan: number;
  scan_cooldown_hours: number;
  loyalty_active: number;
  created_at: string;
  updated_at: string;
}

export function getVenue(db: Db, venueId: string): Venue {
  const venue = db.get<Venue>(`SELECT * FROM venues WHERE id = $v AND deleted_at IS NULL`, {
    v: venueId,
  });
  if (!venue) throw new DomainError('not_found', 'venue not found');
  return venue;
}

export const venuesOf = (db: Db, ownerId: string): Venue[] =>
  db.all<Venue>(
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
export function averageCheck(
  db: Db,
  venue: Venue,
  at: Iso = now(),
): { minor: number; source: 'category' | 'computed'; samples: number } {
  const since = plusDays(at, -CONFIG.vouchers.avgCheckWindowDays);
  const amounts = db
    .all<{ amount_minor: number }>(
      `SELECT amount_minor FROM transactions
        WHERE venue_id = $v AND status = 'committed' AND confirmed_at >= $s
          AND amount_minor IS NOT NULL`,
      { v: venue.id, s: since },
    )
    .map((row) => row.amount_minor);

  if (amounts.length >= CONFIG.vouchers.avgCheckMinSamples) {
    const value = median(amounts) ?? 0;
    return { minor: value, source: 'computed', samples: amounts.length };
  }

  /* The venue's own stored figure first, then the category default.
     That order matters for the imported venues: the old database carried a real
     average check per venue, and letting a category default overwrite it would
     throw away the better number in favour of a generic one. The category
     default is what a venue with *nothing* falls back to. */
  const fallback =
    venue.avg_check_minor ??
    db.get<{ avg_check_minor: number }>(
      `SELECT avg_check_minor FROM category_defaults WHERE category = $c`,
      { c: venue.category },
    )?.avg_check_minor ??
    6000;

  return { minor: fallback, source: 'category', samples: amounts.length };
}

/**
 * Recompute and store the average check, returning whether the source flipped.
 *
 * Stored as well as computed because the dashboard reads it on every page load
 * and the median is a scan of a month of transactions; the flip is what the
 * caller turns into a notification.
 */
export function refreshAverageCheck(db: Db, venue: Venue, at: Iso = now()): { flipped: boolean; minor: number } {
  const next = averageCheck(db, venue, at);
  const flipped = next.source !== venue.avg_check_source;
  db.run(
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
export function isOpen(db: Db, venue: Venue, at: Iso = now()): boolean {
  const l = local(at, venue.timezone);
  const row = db.get<{ opens_min: number | null; closes_min: number | null; closed: number }>(
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
