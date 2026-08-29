/**
 * Plans, entitlements and subscriptions — mobile §12a, desktop B7 and Part D.
 *
 * The rule that makes this small: **the rest of the system asks "what is this
 * account entitled to", never "what did it pay"** (D1). So there is exactly one
 * function anything else calls — `entitlementsFor` — and every tier difference
 * in the product is a key it reads. Moving a perk between tiers is then a row in
 * `plan_entitlements`, not a deploy (C6), and a feature flag scattered through
 * the code never gets the chance to exist.
 *
 * Two consequences of that shape are worth stating because they are easy to
 * break:
 *
 *   * **A lapse restricts, it never claws back** (§12a.3, D3). Nothing here
 *     touches the points ledger, the vouchers, or the venue's data when a
 *     subscription ends. It changes which plan answers the question, and that is
 *     all it may do.
 *   * **The free tier resolves to a real plan**, not to `null`. A missing
 *     subscription is not "no entitlements", it is the free plan's entitlements
 *     — otherwise every caller would need a fallback and they would disagree.
 */
import type { Db } from '../db/db.ts';
import { DomainError } from './errors.ts';
import { newId } from './ids.ts';
import { now, plusDays, type Iso } from './time.ts';

export type Audience = 'consumer' | 'partner';

/** Whose entitlements: a person's, or a venue's. Never both. */
export type Subject = { userId: string } | { venueId: string };

export interface Plan {
  id: string;
  audience: Audience;
  code: string;
  name: string;
  price_minor: number;
  currency: string;
  interval: string;
  trial_days: number;
  rank: number;
}

export interface Subscription {
  id: string;
  user_id: string | null;
  venue_id: string | null;
  plan_id: string;
  status: 'trialing' | 'active' | 'grace' | 'past_due' | 'cancelled' | 'expired';
  source: 'stripe' | 'apple' | 'google' | 'manual';
  external_ref: string | null;
  started_at: string;
  renews_at: string | null;
  cancel_at: string | null;
  ended_at: string | null;
}

/** The statuses that grant a plan's perks. `past_due` deliberately does not. */
const ENTITLED = new Set(['trialing', 'active', 'grace']);

/* ────────────────────────────────────────────── the commitment ladder ── */

/**
 * How long a plan may be bought for, and what the length takes off the price.
 *
 * A longer commitment is cheaper per month because it is worth more: the
 * discount is the price of the customer not leaving. Basis points rather than
 * percentages so the arithmetic stays in integers as far as the one rounding.
 *
 * This is the shape of the ladder; which plans are sold on it is
 * `domain/settings.ts`, and it is not every plan — a free tier has nothing to
 * commit to.
 */
export const TERM_LADDER: ReadonlyArray<{ months: number; discountBp: number }> = [
  { months: 1, discountBp: 0 },
  { months: 3, discountBp: 1000 },
  { months: 6, discountBp: 1800 },
  { months: 12, discountBp: 2500 },
];

export interface PlanTerm {
  months: number;
  discountBp: number;
  /** Per month, after the discount, in the plan's minor units. */
  priceMinor: number;
  /** What is actually charged for the term: `priceMinor * months`. */
  totalMinor: number;
}

/**
 * The one place a term's price is worked out — the seeder, the catalogue and
 * any checkout all come through here.
 *
 * **The monthly figure is rounded and the total is derived from it**, never the
 * other way round. The monthly price is what a customer compares plans by and
 * what the card prints; the total is what leaves their account. Rounding the
 * total and dividing back gives a monthly figure that does not multiply up, and
 * "16.39 a month" beside a charge of 98.35 is the kind of few-grosze
 * disagreement nobody can explain at the counter. Doing it in this order makes
 * the two agree by construction rather than by testing.
 *
 * Half-up to whole minor units (`Math.round`), because a discount that rounds
 * down for ever is a discount the customer never quite gets, and the unit is
 * already the smallest one the currency has.
 */
export function termPricing(monthlyMinor: number, months: number, discountBp: number): PlanTerm {
  const priceMinor = Math.round((monthlyMinor * (10_000 - discountBp)) / 10_000);
  return { months, discountBp, priceMinor, totalMinor: priceMinor * months };
}

/** The terms a plan is sold on, cheapest commitment first. Empty means monthly only. */
export const termsFor = (db: Db, planId: string): PlanTerm[] =>
  db
    .all<{ months: number; discount_bp: number; price_minor: number; total_minor: number }>(
      `SELECT months, discount_bp, price_minor, total_minor FROM plan_terms
        WHERE plan_id = $p ORDER BY months`,
      { p: planId },
    )
    .map((row) => ({
      months: row.months,
      discountBp: row.discount_bp,
      priceMinor: row.price_minor,
      totalMinor: row.total_minor,
    }));

/**
 * The catalogue.
 *
 * Terms come with the plan rather than from a second endpoint: a price with no
 * term beside it is only one of the four prices this plan has, and a client
 * that has to ask twice will eventually render the first answer on its own.
 */
export const plansFor = (db: Db, audience: Audience): Array<Plan & { terms: PlanTerm[] }> =>
  db
    .all<Plan>(`SELECT * FROM plans WHERE audience = $a AND active = 1 ORDER BY rank`, {
      a: audience,
    })
    .map((plan) => ({ ...plan, terms: termsFor(db, plan.id) }));

export const freePlan = (db: Db, audience: Audience): Plan => {
  const plan = db.get<Plan>(
    `SELECT * FROM plans WHERE audience = $a AND active = 1 ORDER BY rank LIMIT 1`,
    { a: audience },
  );
  if (!plan) throw new DomainError('internal', `no plans configured for ${audience}`);
  return plan;
};

/**
 * The account's live subscription, or nothing.
 *
 * D2 requires a single active state per account regardless of billing source, so
 * this takes the highest-ranked entitled subscription rather than the newest: if
 * a double-subscription slips through (web *and* the App Store), the customer
 * gets the better of the two while the reconciliation job sorts it out. The
 * alternative — refusing to answer — would take perks away from somebody who
 * paid twice.
 */
export function activeSubscription(db: Db, subject: Subject): Subscription | undefined {
  const clause = 'userId' in subject ? 'user_id = $s' : 'venue_id = $s';
  const value = 'userId' in subject ? subject.userId : subject.venueId;
  return db.get<Subscription>(
    `SELECT s.* FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE ${clause} AND s.status IN ('trialing', 'active', 'grace')
      ORDER BY p.rank DESC, s.started_at DESC LIMIT 1`,
    { s: value },
  );
}

export function planFor(db: Db, subject: Subject): Plan {
  const audience: Audience = 'userId' in subject ? 'consumer' : 'partner';
  const subscription = activeSubscription(db, subject);
  if (!subscription) return freePlan(db, audience);
  return (
    db.get<Plan>(`SELECT * FROM plans WHERE id = $p`, { p: subscription.plan_id }) ??
    freePlan(db, audience)
  );
}

export type Entitlements = Record<string, string>;

/** Every entitlement the account currently has, keyed. */
export function entitlementsFor(db: Db, subject: Subject): Entitlements {
  const plan = planFor(db, subject);
  const rows = db.all<{ key: string; value: string }>(
    `SELECT key, value FROM plan_entitlements WHERE plan_id = $p`,
    { p: plan.id },
  );
  const out: Entitlements = {};
  for (const row of rows) out[row.key] = row.value;
  return out;
}

export const entNumber = (ent: Entitlements, key: string, fallback: number): number => {
  const value = Number(ent[key]);
  return Number.isFinite(value) ? value : fallback;
};

export const entBool = (ent: Entitlements, key: string): boolean => ent[key] === 'true';

/** Throw the 403 the client can act on, with the key it needs named. */
export function requireEntitlement(ent: Entitlements, key: string): void {
  if (!entBool(ent, key)) {
    throw new DomainError('entitlement_required', `this needs the ${key} entitlement`, {
      entitlement: key,
    });
  }
}

/**
 * A numeric limit, checked against what already exists (B7: "entitlements gate
 * dashboard capability and scale" — live deals, campaigns, venues, seats).
 */
export function requireCapacity(ent: Entitlements, key: string, used: number, fallback: number): void {
  const limit = entNumber(ent, key, fallback);
  if (used >= limit) {
    throw new DomainError('entitlement_required', `plan allows ${limit}`, {
      entitlement: key,
      limit,
      used,
    });
  }
}

/* ─────────────────────────────────────────────────────────── the lifecycle ── */

export function startSubscription(
  db: Db,
  input: {
    subject: Subject;
    planCode: string;
    source: Subscription['source'];
    externalRef?: string;
    at?: Iso;
  },
): Subscription {
  const at = input.at ?? now();
  const audience: Audience = 'userId' in input.subject ? 'consumer' : 'partner';
  const plan = db.get<Plan>(`SELECT * FROM plans WHERE audience = $a AND code = $c`, {
    a: audience,
    c: input.planCode,
  });
  if (!plan) throw new DomainError('not_found', 'plan not found');

  return db.tx(() => {
    /* D2's "guard against double-billing": an existing entitled subscription is
       superseded rather than left running, and the supersession is visible in
       the row's `ended_at` rather than being a silent delete. */
    const existing = activeSubscription(db, input.subject);
    if (existing) {
      db.run(
        `UPDATE subscriptions SET status = 'cancelled', ended_at = $t, updated_at = $t WHERE id = $i`,
        { t: at, i: existing.id },
      );
    }

    const id = newId('sub');
    const trialing = plan.trial_days > 0;
    db.run(
      `INSERT INTO subscriptions
         (id, user_id, venue_id, plan_id, status, source, external_ref, started_at,
          renews_at, created_at, updated_at)
       VALUES ($i, $u, $v, $p, $s, $src, $ref, $at, $r, $at, $at)`,
      {
        i: id,
        u: 'userId' in input.subject ? input.subject.userId : null,
        v: 'venueId' in input.subject ? input.subject.venueId : null,
        p: plan.id,
        s: trialing ? 'trialing' : 'active',
        src: input.source,
        ref: input.externalRef ?? null,
        at,
        r: plusDays(at, trialing ? plan.trial_days : plan.interval === 'year' ? 365 : 30),
      },
    );
    return db.get<Subscription>(`SELECT * FROM subscriptions WHERE id = $i`, { i: id })!;
  });
}

/**
 * Move a subscription to a new status, from a store notification or a webhook.
 *
 * The transitions are not policed as a state machine on purpose: a store can and
 * does send them out of order (a refund after a cancellation, a renewal after a
 * grace period), and rejecting an "impossible" transition would leave the
 * backend disagreeing with the payment processor — which is the one party whose
 * view of whether money arrived is authoritative.
 */
export function setStatus(
  db: Db,
  subscriptionId: string,
  status: Subscription['status'],
  at: Iso = now(),
  renewsAt?: Iso | null,
): void {
  const ends = ENTITLED.has(status) ? null : at;
  db.run(
    `UPDATE subscriptions
        SET status = $s, ended_at = $e, renews_at = COALESCE($r, renews_at), updated_at = $t
      WHERE id = $i`,
    { s: status, e: ends, r: renewsAt ?? null, t: at, i: subscriptionId },
  );
}

/**
 * Subscriptions whose renewal date has passed, moved on by the scheduled job.
 *
 * `trialing`/`active` → `grace` first, never straight to `expired`: a card that
 * fails on a Sunday is a card that works on a Monday, and a program that cuts a
 * paying customer off at the first decline loses more than the dunning costs.
 */
export function runRenewals(db: Db, at: Iso = now(), graceDays = 7): { moved: number } {
  const due = db.all<Subscription>(
    `SELECT * FROM subscriptions
      WHERE status IN ('trialing', 'active', 'grace') AND renews_at IS NOT NULL AND renews_at <= $t`,
    { t: at },
  );
  let moved = 0;
  db.tx(() => {
    for (const sub of due) {
      if (sub.status === 'grace') {
        setStatus(db, sub.id, 'expired', at);
      } else {
        db.run(
          `UPDATE subscriptions SET status = 'grace', renews_at = $r, updated_at = $t WHERE id = $i`,
          { r: plusDays(at, graceDays), t: at, i: sub.id },
        );
      }
      moved += 1;
    }
  });
  return { moved };
}

/**
 * Record a store or processor event before applying it.
 *
 * Idempotent by `(source, external_id)`: stores retry, and a retried renewal
 * that extends the subscription twice is a month of free service. Returns
 * `false` when the event has already been seen.
 */
export function recordBillingEvent(
  db: Db,
  input: { source: string; eventType: string; externalId: string; payload: unknown; at?: Iso },
): boolean {
  const at = input.at ?? now();
  const existing = db.get<{ id: string }>(
    `SELECT id FROM billing_events WHERE source = $s AND external_id = $e`,
    { s: input.source, e: input.externalId },
  );
  if (existing) return false;
  db.run(
    `INSERT INTO billing_events (id, source, event_type, external_id, payload, received_at)
     VALUES ($i, $s, $t, $e, $p, $at)`,
    {
      i: newId('bev'),
      s: input.source,
      t: input.eventType,
      e: input.externalId,
      p: JSON.stringify(input.payload),
      at,
    },
  );
  return true;
}
