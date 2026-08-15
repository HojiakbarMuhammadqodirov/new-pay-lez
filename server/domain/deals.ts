/**
 * Hot deals — §6, and their authoring half in B3/B4.
 *
 * A deal is an open offer: no points, no threshold, claimable by anyone the
 * targeting lets through. That makes it the one mechanic with no ledger and no
 * budget pool — §6.3 is explicit that hot deals are *not* funded from the
 * loyalty/voucher allocations — so what has to be right here is the targeting
 * and the funnel, because those are what a partner is paying to see.
 *
 * Three rules shape the file:
 *
 *   * **Targeting is evaluated server-side, in venue-local time.** A client that
 *     decides for itself whether a deal is claimable is a client that claims a
 *     Tuesday deal on a Sunday.
 *   * **The audience segments are computed from data Paylez has** (§6.2): the
 *     app language the user chose, how long the account has existed, and their
 *     visit history with *this* venue. No nationality, no age, no time-in-country
 *     — those are not collected, so they cannot be targeted on.
 *   * **The consumer app never shows a language the deal lacks** (B3). The
 *     translation table knows which languages are filled, so `copyFor` either
 *     returns the reader's language or falls back explicitly — it never returns
 *     an empty string dressed as copy.
 */
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import { DomainError } from './errors.ts';
import { newId } from './ids.ts';
import { daysBetween, local, localMonth, now, withinDailyWindow, type Iso } from './time.ts';

export type DealStatus = 'draft' | 'scheduled' | 'live' | 'paused' | 'expired' | 'archived';
export type Segment = 'new' | 'returning' | 'lapsed' | 'newcomer';

export interface Deal {
  id: string;
  venue_id: string | null;
  partner_name: string | null;
  city: string | null;
  country_code: string;
  category: string | null;
  discount_text: string | null;
  promo_code: string | null;
  image_url: string | null;
  status: DealStatus;
  valid_from: string | null;
  valid_to: string | null;
  target_weekdays: string | null;
  target_from_min: number | null;
  target_to_min: number | null;
  target_languages: string | null;
  target_audience: string | null;
  cap_claims: number | null;
  cap_spend_minor: number | null;
  spend_minor: number;
  points_required: number;
  seen_count: number;
  opened_count: number;
  claimed_count: number;
}

/* ─────────────────────────────────────────────────── copy and completeness ── */

export interface Copy {
  title: string;
  description: string;
  terms: string;
  /** The language actually used, which may not be the one asked for. */
  language: string;
}

const FALLBACK_ORDER = ['en', 'pl', 'ru', 'uk', 'uz', 'tr', 'az'];

/**
 * The deal's copy in the reader's language, or the nearest filled one.
 *
 * Returns `null` rather than blanks when *nothing* is filled: a deal with no
 * title in any language is not a deal a customer should be shown, and the caller
 * filtering it out is better than a card that says nothing.
 */
export function copyFor(db: Db, dealId: string, language: string): Copy | null {
  const rows = db.all<{ field: string; language: string; value: string }>(
    `SELECT field, language, value FROM translations WHERE entity = 'hot_deal' AND entity_id = $i`,
    { i: dealId },
  );
  if (rows.length === 0) return null;

  const pick = (field: string, lang: string) =>
    rows.find((r) => r.field === field && r.language === lang)?.value ?? '';

  const order = [language, ...FALLBACK_ORDER.filter((l) => l !== language)];
  const chosen = order.find((lang) => pick('title', lang).trim() !== '');
  if (!chosen) return null;

  return {
    title: pick('title', chosen),
    description: pick('description', chosen) || pick('description', 'en'),
    terms: pick('terms', chosen) || pick('terms', 'en'),
    language: chosen,
  };
}

/** B3's translation-completeness tracking, as the dashboard needs to show it. */
export function completeness(db: Db, dealId: string, languages = ['en', 'pl', 'uz', 'ru', 'uk']) {
  const rows = db.all<{ field: string; language: string }>(
    `SELECT field, language FROM translations
      WHERE entity = 'hot_deal' AND entity_id = $i AND TRIM(value) != ''`,
    { i: dealId },
  );
  const filled = (lang: string) =>
    rows.some((r) => r.language === lang && r.field === 'title') &&
    rows.some((r) => r.language === lang && r.field === 'description');

  const done = languages.filter(filled);
  return { languages, filled: done, missing: languages.filter((l) => !done.includes(l)) };
}

/* ────────────────────────────────────────────────────────────── targeting ── */

/**
 * §6.2. Which segments this customer is in, for this venue.
 *
 * `newcomer` is derived from account age — how long they have been using Paylez
 * — because that is a fact the product measures. Anything about where somebody
 * came from is not collected and never will be by this function.
 */
export function segmentsFor(db: Db, userId: string, venueId: string | null, at: Iso = now()): Segment[] {
  const out: Segment[] = [];
  const user = db.get<{ created_at: string }>(`SELECT created_at FROM users WHERE id = $u`, {
    u: userId,
  });
  if (user && daysBetween(user.created_at, at) <= CONFIG.deals.newcomerDays) out.push('newcomer');

  if (!venueId) {
    out.push('new');
    return out;
  }

  const relation = db.get<{ visits: number; last_seen_at: string }>(
    `SELECT visits, last_seen_at FROM venue_customers WHERE venue_id = $v AND user_id = $u`,
    { v: venueId, u: userId },
  );
  if (!relation || relation.visits === 0) out.push('new');
  else if (daysBetween(relation.last_seen_at, at) > CONFIG.deals.lapsedDays) out.push('lapsed');
  else out.push('returning');

  return out;
}

export interface Viewer {
  userId?: string;
  language: string;
  city?: string;
  at?: Iso;
}

/**
 * Is the deal claimable *right now* for this viewer?
 *
 * Split from the list query on purpose: the same predicate answers "should this
 * appear" and "may this claim", and two copies of a targeting rule is how a deal
 * ends up visible but unclaimable.
 */
export function claimableNow(
  db: Db,
  deal: Deal,
  viewer: Viewer,
): { ok: true } | { ok: false; reason: string } {
  const at = viewer.at ?? now();
  if (deal.status !== 'live') return { ok: false, reason: 'not_live' };
  if (deal.valid_from && deal.valid_from > at) return { ok: false, reason: 'not_started' };
  if (deal.valid_to && deal.valid_to < at) return { ok: false, reason: 'ended' };
  if (deal.cap_claims !== null && deal.claimed_count >= deal.cap_claims) {
    return { ok: false, reason: 'cap_reached' };
  }
  if (deal.cap_spend_minor !== null && deal.spend_minor >= deal.cap_spend_minor) {
    return { ok: false, reason: 'cap_reached' };
  }

  const timezone = deal.venue_id
    ? db.get<{ timezone: string }>(`SELECT timezone FROM venues WHERE id = $v`, { v: deal.venue_id })
        ?.timezone ?? 'Europe/Warsaw'
    : 'Europe/Warsaw';
  const l = local(at, timezone);

  if (deal.target_weekdays) {
    const days = deal.target_weekdays.split(',').map(Number);
    if (!days.includes(l.weekday)) return { ok: false, reason: 'wrong_day' };
  }
  if (deal.target_from_min !== null && deal.target_to_min !== null) {
    if (!withinDailyWindow(l.minutes, deal.target_from_min, deal.target_to_min)) {
      return { ok: false, reason: 'wrong_time' };
    }
  }
  if (deal.target_languages) {
    const langs = deal.target_languages.split(',');
    if (!langs.includes(viewer.language)) return { ok: false, reason: 'wrong_language' };
  }
  if (deal.target_audience && viewer.userId) {
    const wanted = deal.target_audience.split(',') as Segment[];
    const has = segmentsFor(db, viewer.userId, deal.venue_id, at);
    if (!wanted.some((segment) => has.includes(segment))) {
      return { ok: false, reason: 'wrong_audience' };
    }
  }
  return { ok: true };
}

export interface DealCard {
  id: string;
  venueId: string | null;
  partnerName: string | null;
  city: string | null;
  category: string | null;
  discountText: string | null;
  imageUrl: string | null;
  validTo: string | null;
  pointsRequired: number;
  copy: Copy;
  claimable: boolean;
  reason?: string;
}

/**
 * The browsable list (§6.1), filtered by the requesting user's context.
 *
 * Deals that fail targeting are *not* returned rather than returned greyed out.
 * A deal that says "not for you" is worse than one that was never mentioned, and
 * the funnel would count an impression for an audience the partner did not buy.
 */
export function browse(
  db: Db,
  viewer: Viewer,
  filter: { city?: string; category?: string; venueId?: string; limit?: number } = {},
): DealCard[] {
  const rows = db.all<Deal>(
    `SELECT * FROM hot_deals
      WHERE status = 'live'
        AND ($city IS NULL OR city IS NULL OR city = $city)
        AND ($cat IS NULL OR category = $cat)
        AND ($ven IS NULL OR venue_id = $ven)
      ORDER BY COALESCE(valid_to, '9999') ASC
      LIMIT $lim`,
    {
      city: filter.city ?? viewer.city ?? null,
      cat: filter.category ?? null,
      ven: filter.venueId ?? null,
      lim: filter.limit ?? 50,
    },
  );

  const out: DealCard[] = [];
  for (const deal of rows) {
    const verdict = claimableNow(db, deal, viewer);
    if (!verdict.ok) continue;
    const copy = copyFor(db, deal.id, viewer.language);
    if (!copy) continue;
    out.push({
      id: deal.id,
      venueId: deal.venue_id,
      partnerName: deal.partner_name,
      city: deal.city,
      category: deal.category,
      discountText: deal.discount_text,
      imageUrl: deal.image_url,
      validTo: deal.valid_to,
      pointsRequired: deal.points_required,
      copy,
      claimable: true,
    });
  }
  return out;
}

export const getDeal = (db: Db, id: string): Deal => {
  const deal = db.get<Deal>(`SELECT * FROM hot_deals WHERE id = $i`, { i: id });
  if (!deal) throw new DomainError('not_found', 'deal not found');
  return deal;
};

/* ─────────────────────────────────────────────────────────────── the funnel ── */

/**
 * Record a funnel event. Seen → Opened → Claimed (§6.3).
 *
 * The claim step is *not* recordable here: it is written by the gate, from a
 * confirmed scan. A "claim" a client can post is a claim rate a client can
 * inflate, and the claim rate is the number the whole dashboard argues from.
 */
export function track(
  db: Db,
  input: {
    dealId: string;
    userId?: string | null;
    kind: 'impression' | 'open';
    source?: string;
    pushId?: string;
    at?: Iso;
  },
): void {
  const at = input.at ?? now();
  db.tx(() => {
    db.run(
      `INSERT INTO deal_events (id, deal_id, user_id, event_type, source, push_id, created_at)
       VALUES ($i, $d, $u, $e, $s, $p, $t)`,
      {
        i: newId('evt'),
        d: input.dealId,
        u: input.userId ?? null,
        e: input.kind,
        s: input.source ?? null,
        p: input.pushId ?? null,
        t: at,
      },
    );
    const column = input.kind === 'impression' ? 'seen_count' : 'opened_count';
    db.run(`UPDATE hot_deals SET ${column} = ${column} + 1 WHERE id = $i`, { i: input.dealId });

    /* §9.2 attribution: a push-sourced open is what "Notified → Opened" counts,
       and it is distinguished from an organic one by the push id travelling with
       the event rather than by a guess from timing. */
    if (input.pushId && input.kind === 'open') {
      db.run(`UPDATE deal_pushes SET opened = opened + 1 WHERE id = $p`, { p: input.pushId });
    }
  });
}

export const funnel = (db: Db, dealId: string) => {
  const deal = getDeal(db, dealId);
  return {
    seen: deal.seen_count,
    opened: deal.opened_count,
    claimed: deal.claimed_count,
    openRate: deal.seen_count ? deal.opened_count / deal.seen_count : 0,
    claimRate: deal.opened_count ? deal.claimed_count / deal.opened_count : 0,
    spendMinor: deal.spend_minor,
    capClaims: deal.cap_claims,
    capSpendMinor: deal.cap_spend_minor,
  };
};

/* ───────────────────────────────────────────────────────────── the lifecycle ── */

/**
 * B3. Draft → scheduled → live → expired, moved by the clock rather than by a
 * human remembering.
 *
 * `paused` is untouched by this job, which is the whole point of storing the
 * partner's intent separately from the window: a paused deal whose window is
 * still open must not come back to life on its own.
 */
export function runLifecycle(db: Db, at: Iso = now()): { started: number; ended: number } {
  const started = db.run(
    `UPDATE hot_deals SET status = 'live', published_at = COALESCE(published_at, $t), updated_at = $t
      WHERE status = 'scheduled' AND (valid_from IS NULL OR valid_from <= $t)
        AND (valid_to IS NULL OR valid_to > $t)`,
    { t: at },
  ).changes;

  const ended = db.run(
    `UPDATE hot_deals SET status = 'expired', updated_at = $t
      WHERE status IN ('live', 'scheduled') AND valid_to IS NOT NULL AND valid_to <= $t`,
    { t: at },
  ).changes;

  return { started, ended };
}

/** §11.2. The partner's urgent levers, each one a single guarded action. */
export function setStatus(db: Db, dealId: string, status: DealStatus, at: Iso = now()): Deal {
  db.run(`UPDATE hot_deals SET status = $s, updated_at = $t WHERE id = $i`, {
    s: status,
    t: at,
    i: dealId,
  });
  return getDeal(db, dealId);
}

export function extend(db: Db, dealId: string, validTo: Iso, at: Iso = now()): Deal {
  const deal = getDeal(db, dealId);
  if (deal.valid_to && validTo <= deal.valid_to) {
    throw new DomainError('bad_request', 'extending means a later end date');
  }
  db.run(
    `UPDATE hot_deals SET valid_to = $v, status = CASE WHEN status = 'expired' THEN 'live' ELSE status END,
            updated_at = $t
      WHERE id = $i`,
    { v: validTo, t: at, i: dealId },
  );
  return getDeal(db, dealId);
}

/* ─────────────────────────────────────────────────────────── pushes (B4/§9.2) ── */

/**
 * Schedule the one push a deal may carry.
 *
 * Everything that can be checked at authoring time is checked at authoring time
 * — quota, quiet hours, the deal having copy to send — because a push that fails
 * silently at 07:00 is a partner who thinks they ran a campaign and did not. The
 * per-*user* frequency cap is the one thing that cannot be settled here: it
 * depends on what every other venue does between now and the send.
 */
export function schedulePush(
  db: Db,
  input: { dealId: string; scheduledAt: Iso; quota: number; at?: Iso },
): { id: string; remaining: number } {
  const at = input.at ?? now();
  const deal = getDeal(db, input.dealId);
  if (!deal.venue_id) throw new DomainError('invalid_state', 'deal has no venue');

  const timezone =
    db.get<{ timezone: string }>(`SELECT timezone FROM venues WHERE id = $v`, { v: deal.venue_id })
      ?.timezone ?? 'Europe/Warsaw';
  const l = local(input.scheduledAt, timezone);
  if (!withinDailyWindow(l.minutes, CONFIG.deals.quietFromMin, CONFIG.deals.quietToMin)) {
    throw new DomainError('quiet_hours', 'pushes are only delivered between 07:00 and 21:00 local');
  }

  const period = localMonth(input.scheduledAt, timezone);
  const used =
    db.get<{ used: number }>(`SELECT used FROM push_quotas WHERE venue_id = $v AND period = $p`, {
      v: deal.venue_id,
      p: period,
    })?.used ?? 0;
  if (used >= input.quota) {
    throw new DomainError('quota_exceeded', 'monthly push quota is used up', {
      quota: input.quota,
      used,
    });
  }

  const existing = db.get<{ id: string }>(`SELECT id FROM deal_pushes WHERE deal_id = $d`, {
    d: input.dealId,
  });
  if (existing) throw new DomainError('conflict', 'this deal already has a push');

  const id = newId('psh');
  db.tx(() => {
    db.run(
      `INSERT INTO deal_pushes (id, deal_id, venue_id, scheduled_at, status, created_at)
       VALUES ($i, $d, $v, $s, 'scheduled', $t)`,
      { i: id, d: input.dealId, v: deal.venue_id, s: input.scheduledAt, t: at },
    );
    db.run(
      `INSERT INTO push_quotas (venue_id, period, used) VALUES ($v, $p, 1)
         ON CONFLICT (venue_id, period) DO UPDATE SET used = used + 1`,
      { v: deal.venue_id, p: period },
    );
  });
  return { id, remaining: input.quota - used - 1 };
}

export const pushQuota = (db: Db, venueId: string, quota: number, at: Iso = now()) => {
  const timezone =
    db.get<{ timezone: string }>(`SELECT timezone FROM venues WHERE id = $v`, { v: venueId })
      ?.timezone ?? 'Europe/Warsaw';
  const period = localMonth(at, timezone);
  const used =
    db.get<{ used: number }>(`SELECT used FROM push_quotas WHERE venue_id = $v AND period = $p`, {
      v: venueId,
      p: period,
    })?.used ?? 0;
  return { period, quota, used, remaining: Math.max(0, quota - used) };
};

/**
 * Who a scheduled push should reach, and who it will actually reach.
 *
 * The gap between the two is the honest reach figure §9.1 asks for: a partner
 * targeting 300 people whose push lands with 190 of them should be told 190,
 * because the other 110 were over a platform-level cap that has nothing to do
 * with this venue and everything to do with the customer's inbox.
 */
export function audienceFor(db: Db, dealId: string, at: Iso = now()): string[] {
  const deal = getDeal(db, dealId);
  const candidates = db.all<{ id: string }>(
    `SELECT DISTINCT u.id FROM users u
       LEFT JOIN venue_customers vc ON vc.user_id = u.id AND vc.venue_id = $v
      WHERE u.status = 'active' AND u.deleted_at IS NULL
        AND ($city IS NULL OR u.city = $city)`,
    { v: deal.venue_id ?? '', city: deal.city ?? null },
  );

  return candidates
    .filter((row) => {
      const language =
        db.get<{ language: string }>(`SELECT language FROM users WHERE id = $u`, { u: row.id })
          ?.language ?? 'en';
      /* Never send a language the deal lacks (§9.2). */
      if (!copyFor(db, dealId, language)) return false;
      return claimableNow(db, deal, { userId: row.id, language, at }).ok;
    })
    .map((row) => row.id);
}
