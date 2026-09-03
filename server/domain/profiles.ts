/**
 * Identified customer profiles — B9a. The consent-gated half of the dashboard.
 *
 * "**Two populations, one page**": the aggregate findings in `analytics.ts` are
 * computed across *all* customers and protected by the minimum cohort; the table
 * and detail here cover *only* customers who granted this venue an active
 * data-sharing consent. The API returns both counts so the UI can show the gap
 * honestly — "275 total · 92 shared" — rather than implying the shared 92 are
 * the whole customer base.
 *
 * Two invariants, and every function in the file is built to make them hard to
 * break:
 *
 *   * **No grant → absent entirely.** Not greyed out, not anonymised, not
 *     present with nulls. The `JOIN data_sharing_consents` is in the query, so
 *     there is no code path that reads a customer row without it.
 *   * **Scoped to `(venue_id, user_id)`.** An identified profile exposes this
 *     customer's relationship with *this* venue: spend here, visits here, deals
 *     here. Never their activity at other venues and never their global points
 *     balance. Every query below filters on `venue_id`, including the ones where
 *     it would be tempting not to.
 */
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import { DomainError } from './errors.ts';
import { hasSharingGrant } from './consent.ts';
import { daysBetween, now, type Iso } from './time.ts';

export type CustomerStatus = 'new' | 'regular' | 'lapsed' | 'at_risk' | 'high_value';

export interface CustomerRow {
  userId: string;
  name: string;
  avatar: string | null;
  /** At this venue. Never a global figure. */
  spendMinor: number;
  visits: number;
  firstSeenAt: string;
  lastSeenAt: string;
  daysSince: number;
  status: CustomerStatus;
  /** Stamps toward this venue's campaigns, and vouchers held for this venue. */
  stamps: number;
  vouchersHeld: number;
}

export interface CustomerTable {
  /** Everyone who has ever visited — the denominator the UI shows the gap against. */
  totalCustomers: number;
  /** How many of them share their profile with this venue. */
  sharedCustomers: number;
  rows: CustomerRow[];
}

/**
 * B9a status derivation, from this venue's own history for this customer.
 *
 * The order is the priority: high value beats regular, at-risk beats lapsed,
 * because the action a partner should take is different and only one of them
 * fits on a chip. A customer who spent a lot and has stopped coming is "at
 * risk", not "lapsed" — the word decides whether anybody does anything.
 */
export function deriveStatus(
  row: { visits: number; spendMinor: number; lastSeenAt: string; firstSeenAt: string },
  averageSpendMinor: number,
  at: Iso,
): CustomerStatus {
  const idle = daysBetween(row.lastSeenAt, at);
  const valuable = averageSpendMinor > 0 && row.spendMinor >= averageSpendMinor * 2;

  if (valuable && idle > CONFIG.deals.lapsedDays / 2) return 'at_risk';
  if (valuable) return 'high_value';
  if (idle > CONFIG.deals.lapsedDays) return 'lapsed';
  if (row.visits <= 1) return 'new';
  return 'regular';
}

export interface TableQuery {
  sort?: 'spend' | 'visits' | 'recent';
  status?: CustomerStatus;
  limit?: number;
  offset?: number;
  at?: Iso;
}

/**
 * The customer table.
 *
 * Sorting and filtering are server-side (B9a) rather than done in the browser,
 * which is not a performance decision: a client that receives the whole list to
 * sort it has received the whole list, and "filtered in the UI" is how an
 * un-opted-in customer ends up in a network response nobody looked at.
 */
export async function customerTable(db: Db, venueId: string, query: TableQuery = {}): Promise<CustomerTable> {
  const at = query.at ?? now();

  const total =
    (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM venue_customers WHERE venue_id = $v`, {
      v: venueId,
    }))?.n ?? 0;

  const rows = await db.all<{
    user_id: string;
    name: string;
    avatar: string | null;
    spend_minor: number;
    visits: number;
    first_seen_at: string;
    last_seen_at: string;
  }>(
    `SELECT vc.user_id, u.display_name AS name, u.display_avatar AS avatar,
            vc.spend_minor, vc.visits, vc.first_seen_at, vc.last_seen_at
       FROM venue_customers vc
       JOIN data_sharing_consents d
         ON d.user_id = vc.user_id AND d.venue_id = vc.venue_id AND d.revoked_at IS NULL
       JOIN users u ON u.id = vc.user_id
      WHERE vc.venue_id = $v AND u.deleted_at IS NULL
      ORDER BY
        CASE $sort WHEN 'visits' THEN vc.visits WHEN 'recent' THEN 0 ELSE vc.spend_minor END DESC,
        vc.last_seen_at DESC
      LIMIT $lim OFFSET $off`,
    {
      v: venueId,
      sort: query.sort ?? 'spend',
      lim: query.limit ?? 50,
      off: query.offset ?? 0,
    },
  );

  const averageSpend =
    (await db.get<{ avg: number | null }>(
      `SELECT AVG(spend_minor) AS avg FROM venue_customers WHERE venue_id = $v AND visits > 0`,
      { v: venueId },
    ))?.avg ?? 0;

  const mapped: CustomerRow[] = await Promise.all(rows.map(async (row) => {
    const base = {
      spendMinor: row.spend_minor,
      visits: row.visits,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
    };
    return {
      userId: row.user_id,
      name: row.name || 'Customer',
      avatar: row.avatar,
      ...base,
      daysSince: Math.floor(daysBetween(row.last_seen_at, at)),
      status: deriveStatus(base, averageSpend, at),
      stamps:
        (await db.get<{ n: number | null }>(
          `SELECT SUM(s.stamps) AS n FROM stamp_cards s WHERE s.user_id = $u AND s.venue_id = $v`,
          { u: row.user_id, v: venueId },
        ))?.n ?? 0,
      vouchersHeld:
        (await db.get<{ n: number }>(
          `SELECT COUNT(*) AS n FROM issued_vouchers
            WHERE user_id = $u AND venue_id = $v AND status = 'active'`,
          { u: row.user_id, v: venueId },
        ))?.n ?? 0,
    };
  }));

  const shared =
    (await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM data_sharing_consents d
        JOIN venue_customers vc ON vc.user_id = d.user_id AND vc.venue_id = d.venue_id
       WHERE d.venue_id = $v AND d.revoked_at IS NULL`,
      { v: venueId },
    ))?.n ?? 0;

  return {
    totalCustomers: total,
    sharedCustomers: shared,
    rows: query.status ? mapped.filter((row) => row.status === query.status) : mapped,
  };
}

/**
 * One customer, scoped hard to this venue.
 *
 * The grant is re-checked here rather than trusted from the table that produced
 * the link: a revocation between the table load and the click is exactly the
 * moment the rule has to hold, and it is the moment a "we already checked"
 * shortcut would miss.
 */
export async function customerDetail(db: Db, venueId: string, userId: string, at: Iso = now()) {
  if (!(await hasSharingGrant(db, userId, venueId))) {
    /* 404, not 403: telling a partner "that customer exists but has not shared
       with you" is itself a disclosure about a specific person. */
    throw new DomainError('not_found', 'customer not found');
  }

  const relation = await db.get<{
    spend_minor: number;
    visits: number;
    first_seen_at: string;
    last_seen_at: string;
  }>(`SELECT * FROM venue_customers WHERE venue_id = $v AND user_id = $u`, {
    v: venueId,
    u: userId,
  });
  if (!relation) throw new DomainError('not_found', 'customer not found');

  const identity = await db.get<{ name: string; avatar: string | null; language: string }>(
    `SELECT display_name AS name, display_avatar AS avatar, language FROM users WHERE id = $u`,
    { u: userId },
  );

  const trend = await db.all<{ month: string; visits: number; spend: number }>(
    `SELECT SUBSTR(local_day, 1, 7) AS month, COUNT(*) AS visits, SUM(amount_minor) AS spend
       FROM venue_visits WHERE venue_id = $v AND user_id = $u
      GROUP BY month ORDER BY month`,
    { v: venueId, u: userId },
  );

  const pattern = await db.all<{ local_weekday: number; local_hour: number; n: number }>(
    `SELECT local_weekday, local_hour, COUNT(*) AS n FROM venue_visits
      WHERE venue_id = $v AND user_id = $u GROUP BY local_weekday, local_hour ORDER BY n DESC LIMIT 5`,
    { v: venueId, u: userId },
  );

  const deals = await db.all<{ deal_id: string; event_type: string; created_at: string }>(
    `SELECT e.deal_id, e.event_type, e.created_at FROM deal_events e
       JOIN hot_deals d ON d.id = e.deal_id
      WHERE d.venue_id = $v AND e.user_id = $u AND e.event_type != 'impression'
      ORDER BY e.created_at DESC LIMIT 20`,
    { v: venueId, u: userId },
  );

  const stamps = await db.all<{ campaign_id: string; name: string; stamps: number; required: number }>(
    `SELECT s.campaign_id, c.name, s.stamps, c.visits_required AS required
       FROM stamp_cards s JOIN campaigns c ON c.id = s.campaign_id
      WHERE s.user_id = $u AND s.venue_id = $v`,
    { u: userId, v: venueId },
  );

  const averageSpend =
    (await db.get<{ avg: number | null }>(
      `SELECT AVG(spend_minor) AS avg FROM venue_customers WHERE venue_id = $v AND visits > 0`,
      { v: venueId },
    ))?.avg ?? 0;

  return {
    userId,
    name: identity?.name || 'Customer',
    avatar: identity?.avatar ?? null,
    /* The app language, which is the only demographic signal collected (B9). */
    language: identity?.language ?? 'en',
    lifetimeValueMinor: relation.spend_minor,
    visits: relation.visits,
    firstSeenAt: relation.first_seen_at,
    lastSeenAt: relation.last_seen_at,
    status: deriveStatus(
      {
        visits: relation.visits,
        spendMinor: relation.spend_minor,
        lastSeenAt: relation.last_seen_at,
        firstSeenAt: relation.first_seen_at,
      },
      averageSpend,
      at,
    ),
    trend,
    visitPattern: pattern,
    deals,
    stamps,
    /* Deliberately absent, and this comment is the reason: the customer's global
       points balance and their activity at other venues are out of scope for
       this grant (§1.4, "scope is per-venue"). Adding them here would be a
       one-line change and a serious breach, so the absence is documented. */
  };
}

/**
 * B9a's targeting handoff.
 *
 * The action on a customer detail is "reward or target this customer's segment",
 * and it goes through the normal deal/campaign machinery — the partner authors,
 * Paylez delivers. This returns the segment description a draft would be built
 * from rather than messaging anybody, because a partner writing directly to a
 * named customer is not a thing this platform does.
 */
export async function segmentFor(db: Db, venueId: string, userId: string, at: Iso = now()) {
  const detail = await customerDetail(db, venueId, userId, at);
  const peers = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM venue_customers vc
      WHERE vc.venue_id = $v AND vc.visits >= $min AND vc.visits <= $max`,
    {
      v: venueId,
      min: Math.max(1, detail.visits - 2),
      max: detail.visits + 2,
    },
  );
  return {
    status: detail.status,
    language: detail.language,
    similarCustomers: peers?.n ?? 0,
    /* The segment is only usable as a target if it is big enough to be a
       segment; below the floor, targeting it is targeting one person. */
    targetable: (peers?.n ?? 0) >= CONFIG.privacy.minCohort,
  };
}
