/**
 * The occasional bonuses — rulebook §7.3 rows that no other module owned.
 *
 * Four lines of the rulebook's one-off table had a figure in `CONFIG.earn` and
 * **no code that paid them**: `birthday`, `anniversary`, `reviewAfterVisit` and
 * `dealShared`. A config value nothing reads is a promise the product makes on
 * a screen and breaks in the ledger, which is the worst place to break one. So
 * they live here, together, because they share a shape: each is a small flat
 * amount, each is guarded by a key in the ledger rather than by a counter
 * beside it, and none of them belongs to a module that already writes points
 * (`deals.ts` is deliberately ledger-free, `social.ts` is referrals and boards).
 *
 * **Every guard is the ledger's own `source_kind` + `source_ref`**, which is
 * what `alreadyPaid` reads and what the missions module (`domain/missions.ts`)
 * reads back to show these as `autoPaid`. The keys, so nobody has to find them:
 *
 *   | bonus        | reason     | source_kind   | source_ref           |
 *   |--------------|------------|---------------|----------------------|
 *   | birthday     | `occasion` | `birthday`    | `birthday:<year>`    |
 *   | anniversary  | `occasion` | `anniversary` | `anniversary:<year>` |
 *   | review       | `review`   | `review`      | the review's id      |
 *   | deal shared  | `referral` | `deal_share`  | the deal's id        |
 *
 * `referral` for a share is the ledger's split at work — the *reason* is the
 * sentence a customer reads ("bringing people in"), the `source_kind` is what
 * the arithmetic keys on — and it is why this needed no migration: widening
 * `points_ledger.reason` is a table rebuild (`db.ts` version 2), and a new
 * bonus is not a reason to do one.
 */
import { CONFIG } from '../config.ts';
import type { Db } from '../db/db.ts';
import { getDeal } from './deals.ts';
import { DomainError } from './errors.ts';
import { newId } from './ids.ts';
import * as ledger from './ledger.ts';
import * as notifications from './notifications.ts';
import { now, plusDays, shiftDay, type Iso } from './time.ts';
import { getVenue } from './venues.ts';

/* ══════════════════════════════════════════════ birthdays and anniversaries ══ */

const isLeap = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * The day `monthDay` (`MM-DD`) falls on in `year`.
 *
 * The 29th of February is the 28th in a common year. Moving it to the 1st of
 * March would pay a leap-day birthday in a different *month* three years in
 * four, and "your birthday bonus arrived in March" is a support ticket.
 */
function occasionIn(year: number, monthDay: string): string {
  const day = monthDay === '02-29' && !isLeap(year) ? '02-28' : monthDay;
  return `${String(year).padStart(4, '0')}-${day}`;
}

/**
 * The occasion due inside the grace window ending `today`, if any.
 *
 * Checked in this year and the one before, so a birthday on the 30th of
 * December is still found by a run on the 2nd of January — the grace window
 * straddles the new year and the `<year>` in the key is the occasion's year,
 * not the run's.
 */
function dueIn(monthDay: string, today: string): { day: string; year: number } | null {
  const earliest = shiftDay(today, -CONFIG.earn.occasionGraceDays);
  const year = Number(today.slice(0, 4));
  for (const y of [year, year - 1]) {
    const day = occasionIn(y, monthDay);
    if (day <= today && day >= earliest) return { day, year: y };
  }
  return null;
}

export interface OccasionsPaid {
  birthdays: number;
  anniversaries: number;
}

/**
 * Pay every birthday and anniversary that has come round, once a year each.
 *
 * Run from the hourly job. The job runs on an interval rather than at midnight
 * and a restart resets its phase, so "is today the day" alone would lose the
 * occasion of anyone whose day fell in a gap — `occasionGraceDays` is what
 * makes a missed run cost nothing, and the `<year>` key is what stops the grace
 * from paying the same year twice.
 *
 * **Only active accounts.** A provisional guest has no birthday on file and no
 * anniversary worth the name; a banned or erased one is owed nothing.
 *
 * **A birthday must have been on file before the day came.** `birth_date_set_at`
 * earlier than the occasion — otherwise the cheapest 200 points in the product
 * is to type today's date into the picker. The one correction the profile
 * allows (`accounts.BIRTH_DATE_WRITES`) cannot be used for it either: the key is
 * the year, so a second date in the same year finds the year already paid.
 *
 * **An anniversary is whole years since `created_at`**, the first one year on.
 */
export async function payDue(db: Db, at: Iso = now()): Promise<OccasionsPaid> {
  const today = at.slice(0, 10);
  let birthdays = 0;
  let anniversaries = 0;

  const people = await db.all<{
    id: string;
    birth_date: string | null;
    birth_date_set_at: string | null;
    created_at: string;
  }>(
    `SELECT id, birth_date, birth_date_set_at, created_at FROM users
      WHERE status = 'active' AND deleted_at IS NULL`,
  );

  for (const person of people) {
    if (person.birth_date && /^\d{4}-\d{2}-\d{2}$/.test(person.birth_date)) {
      const due = dueIn(person.birth_date.slice(5), today);
      const knownInTime = !person.birth_date_set_at || person.birth_date_set_at.slice(0, 10) < (due?.day ?? '');
      if (due && knownInTime && (await pay(db, person.id, 'birthday', due.year, at))) birthdays += 1;
    }

    const joined = person.created_at.slice(0, 10);
    const due = dueIn(joined.slice(5), today);
    if (due && due.year > Number(joined.slice(0, 4)) && (await pay(db, person.id, 'anniversary', due.year, at))) {
      anniversaries += 1;
    }
  }
  return { birthdays, anniversaries };
}

async function pay(
  db: Db,
  userId: string,
  kind: 'birthday' | 'anniversary',
  year: number,
  at: Iso,
): Promise<boolean> {
  const ref = `${kind}:${year}`;
  return await db.tx(async () => {
    /* Read inside the transaction that writes, so two overlapping runs of the
       job serialise rather than both finding nothing and both paying. */
    if (await ledger.alreadyPaid(db, userId, kind, ref)) return false;
    const points = kind === 'birthday' ? CONFIG.earn.birthday : CONFIG.earn.anniversary;
    await ledger.earn(db, { userId, points, reason: 'occasion', sourceKind: kind, sourceRef: ref, at });
    /* An inbox row, not a push: 200 points arriving silently reads as a bug,
       and a push at whatever hour the job happened to run is a worse one. */
    await notifications.notify(db, {
      userId,
      mode: 'consumer',
      kind,
      title: kind === 'birthday' ? 'Happy birthday from Paylez' : 'A year with Paylez',
      body: `${points} points are in your balance.`,
      sourceKind: kind,
      sourceRef: ref,
      at,
    });
    return true;
  });
}

/* ═════════════════════════════════════════════════════════════ deal shared ══ */

export interface DealShared {
  /** True only when this call paid. A share that pays nothing is still a share. */
  granted: boolean;
  /** Why it did not pay: `already_shared`, `daily_cap` or `not_live`. Null when it did. */
  reason: 'already_shared' | 'daily_cap' | 'not_live' | null;
  points: number;
  /** Paid shares today, this one included. */
  sharedToday: number;
  perDay: number;
  balance: number;
}

/**
 * Rulebook §7.3 / §9.2: sharing a deal pays `dealShared`, **at most
 * `dealSharedPerDay` a day**, and **once per deal** for any one person.
 *
 * The server cannot see a share land — the share sheet is the phone's — so this
 * is the one bonus here paid on the client's word, and the two caps are what
 * make that safe: the daily one bounds what a script can take (75 points a
 * day), and the per-deal one means the three a day have to be three different
 * offers rather than one offer tapped three times.
 *
 * **Not an error when it does not pay.** Sharing an offer twice, or a fourth
 * one today, is a perfectly good thing to do; it answers `granted: false` with
 * the reason, and the share sheet has already opened either way.
 *
 * The day is the UTC slice — the same boundary the check-in, the energy tank
 * and every other daily count use.
 */
export async function shareDeal(
  db: Db,
  input: { userId: string; dealId: string; at?: Iso },
): Promise<DealShared> {
  const at = input.at ?? now();
  const day = at.slice(0, 10);
  const deal = await getDeal(db, input.dealId);
  const perDay = CONFIG.earn.dealSharedPerDay;

  return await db.tx(async () => {
    const counted = async () =>
      Number(
        (
          await db.get<{ n: number }>(
            `SELECT COUNT(*) AS n FROM points_ledger
              WHERE user_id = $u AND source_kind = 'deal_share' AND status = 'committed'
                AND substr(created_at, 1, 10) = $d`,
            { u: input.userId, d: day },
          )
        )?.n ?? 0,
      );
    const refuse = async (reason: DealShared['reason']): Promise<DealShared> => ({
      granted: false,
      reason,
      points: 0,
      sharedToday: await counted(),
      perDay,
      balance: await ledger.balance(db, input.userId),
    });

    if (deal.status !== 'live') return await refuse('not_live');
    if (await ledger.alreadyPaid(db, input.userId, 'deal_share', deal.id)) return await refuse('already_shared');
    if ((await counted()) >= perDay) return await refuse('daily_cap');

    await ledger.earn(db, {
      userId: input.userId,
      points: CONFIG.earn.dealShared,
      reason: 'referral',
      sourceKind: 'deal_share',
      sourceRef: deal.id,
      venueId: deal.venue_id,
      at,
    });
    return {
      granted: true,
      reason: null,
      points: CONFIG.earn.dealShared,
      sharedToday: await counted(),
      perDay,
      balance: await ledger.balance(db, input.userId),
    };
  });
}

/* ══════════════════════════════════════════════════════════════════ reviews ══ */

export interface Review {
  id: string;
  venueId: string;
  rating: number;
  body: string | null;
  createdAt: Iso;
}

/** Longest review body accepted, in characters. A review, not an essay. */
const REVIEW_MAX_CHARS = 1000;

/**
 * Rulebook §7.3 / §9.2: a review **after a visit** pays `reviewAfterVisit`,
 * **once per venue per `reviewEveryDays`**.
 *
 * "After a visit" is a confirmed one — a row in `venue_visits`, which only the
 * gate writes — so a review cannot be bought by somebody who never walked in.
 * The window is enforced on the *review*, not only on the payment: a second
 * review of the same place inside it is refused (409, naming when the next is
 * possible) rather than accepted unpaid, because a review nobody is paid for is
 * still a review the venue reads, and one person writing ten of them about one
 * place in a month is not ten opinions.
 *
 * The window is rolling, not a grid, and `config.ts` says why: it bounds one
 * person re-reviewing one place, and a grid would let the 29th and the 31st
 * both pay.
 */
export async function review(
  db: Db,
  input: { userId: string; venueId: string; rating: unknown; body?: unknown; at?: Iso },
): Promise<{ review: Review; points: number; balance: number }> {
  const at = input.at ?? now();
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new DomainError('validation_failed', 'a rating is a whole number from 1 to 5', { field: 'rating' });
  }
  let body: string | null = null;
  if (input.body !== undefined && input.body !== null) {
    if (typeof input.body !== 'string') {
      throw new DomainError('validation_failed', 'a review is text', { field: 'body' });
    }
    body = input.body.trim() || null;
    if (body && body.length > REVIEW_MAX_CHARS) {
      throw new DomainError('validation_failed', `a review is at most ${REVIEW_MAX_CHARS} characters`, {
        field: 'body',
        max: REVIEW_MAX_CHARS,
      });
    }
  }
  const venue = await getVenue(db, input.venueId);

  return await db.tx(async () => {
    const visited = await db.get<{ id: string }>(
      `SELECT id FROM venue_visits WHERE user_id = $u AND venue_id = $v LIMIT 1`,
      { u: input.userId, v: venue.id },
    );
    if (!visited) {
      throw new DomainError('forbidden', 'a review follows a confirmed visit', { reason: 'no_visit' });
    }

    const last = await db.get<{ created_at: string }>(
      `SELECT created_at FROM venue_reviews
        WHERE user_id = $u AND venue_id = $v AND created_at > $s
        ORDER BY created_at DESC LIMIT 1`,
      { u: input.userId, v: venue.id, s: plusDays(at, -CONFIG.earn.reviewEveryDays) },
    );
    if (last) {
      throw new DomainError('conflict', 'one review per venue per 30 days', {
        reason: 'review_window',
        everyDays: CONFIG.earn.reviewEveryDays,
        nextAt: plusDays(last.created_at as Iso, CONFIG.earn.reviewEveryDays),
      });
    }

    const id = newId('vrv');
    await db.run(
      `INSERT INTO venue_reviews (id, user_id, venue_id, rating, body, created_at)
       VALUES ($i, $u, $v, $r, $b, $t)`,
      { i: id, u: input.userId, v: venue.id, r: rating, b: body, t: at },
    );
    await ledger.earn(db, {
      userId: input.userId,
      points: CONFIG.earn.reviewAfterVisit,
      reason: 'review',
      sourceKind: 'review',
      sourceRef: id,
      venueId: venue.id,
      at,
    });
    return {
      review: { id, venueId: venue.id, rating, body, createdAt: at },
      points: CONFIG.earn.reviewAfterVisit,
      balance: await ledger.balance(db, input.userId),
    };
  });
}
