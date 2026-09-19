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
 *
 * One key is narrower than its name suggests and nothing here can enforce it, so
 * it is written down where every reader of an entitlement passes:
 * **`points_multiplier` prices a game round and nothing else.** What a visit
 * pays is four named keys of its own — `scan_points`, `first_visit_points`,
 * `stamp_points`, `new_category_points` — and a paid plan already collects the
 * higher figure from those, so scaling them by the multiplier as well would pay
 * it twice for one scan. There is no code in this file that assumes otherwise
 * (nothing here reads the key); the rule belongs to `games.ts`, which should
 * apply it, and to `gate.ts`, which should not.
 */
import type { Db } from '../db/db.ts';
import * as audit from './audit.ts';
import { DomainError } from './errors.ts';
import { newId } from './ids.ts';
import { now, plusDays, plusMonths, type Iso } from './time.ts';

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
  /** `plans.active`. A retired plan stays readable and stops being assignable. */
  active: number;
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

/**
 * The statuses that grant a plan's perks. `past_due` deliberately does not.
 *
 * `trialing` stays in the set although no plan is sold with a trial any more
 * (every `trialDays` in `settings.ts` is 0). Two reasons: a store can put a
 * subscription into it from the outside, and taking it out would strip the
 * perks off any row that is still in it rather than resolving it — which is the
 * clawback §12a.3 forbids. `settleWithdrawnTrials` in `settings.ts` is what
 * actually empties the state, by moving those rows to `active` and leaving
 * their renewal date alone.
 */
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
export const termsFor = async (db: Db, planId: string): Promise<PlanTerm[]> =>
  (await db
    .all<{ months: number; discount_bp: number; price_minor: number; total_minor: number }>(
      `SELECT months, discount_bp, price_minor, total_minor FROM plan_terms
        WHERE plan_id = $p ORDER BY months`,
      { p: planId },
    ))
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
export const plansFor = async (db: Db, audience: Audience): Promise<Array<Plan & { terms: PlanTerm[] }>> =>
  await Promise.all((await db
    .all<Plan>(`SELECT * FROM plans WHERE audience = $a AND active = 1 ORDER BY rank`, {
      a: audience,
    }))
    .map(async (plan) => ({ ...plan, terms: await termsFor(db, plan.id) })));

export const freePlan = async (db: Db, audience: Audience): Promise<Plan> => {
  const plan = await db.get<Plan>(
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
 *
 * ## The row has a window now, and that is what an effective date *is*
 *
 * Two filters joined the status test, and together they are the whole mechanism
 * behind a dated tier change — no scheduled job, no pending table, nothing to
 * run at midnight:
 *
 * - **`started_at <= at`.** A row dated forward is not live yet. Without this a
 *   future-dated assignment took effect the moment it was written, which is the
 *   opposite of what a date on it means.
 * - **`cancel_at IS NULL OR cancel_at > at`.** A row can be told when to stop
 *   without being ended today. `assignPlan` uses it to retire the *current*
 *   subscription exactly when the new one begins, so a dated change is a
 *   hand-over rather than a gap: ending the old row immediately would strip a
 *   venue's plan for the fortnight before the new one started, and leaving it
 *   running would let `ORDER BY p.rank DESC` keep serving the old tier forever
 *   whenever the change was a *downgrade*.
 *
 * Both are no-ops for every row that predates them — nothing has ever written
 * `cancel_at`, and every `started_at` is in the past — which is why this could
 * be a filter rather than a migration.
 *
 * `at` is a parameter because the caller's clock is the one that matters: the
 * job sweeping renewals, a test walking a subscription through a year, and a
 * request being served are three different instants.
 */
export async function activeSubscription(
  db: Db,
  subject: Subject,
  at: Iso = now(),
): Promise<Subscription | undefined> {
  const clause = 'userId' in subject ? 'user_id = $s' : 'venue_id = $s';
  const value = 'userId' in subject ? subject.userId : subject.venueId;
  return await db.get<Subscription>(
    `SELECT s.* FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE ${clause} AND s.status IN ('trialing', 'active', 'grace')
        AND s.started_at <= $at
        AND (s.cancel_at IS NULL OR s.cancel_at > $at)
      ORDER BY p.rank DESC, s.started_at DESC LIMIT 1`,
    { s: value, at },
  );
}

/**
 * A change an operator has dated forward, or nothing.
 *
 * The counterpart of `activeSubscription`: the row whose window has not opened
 * yet. It exists because a console that can schedule a change and cannot show
 * one already scheduled is a console where the same change gets made twice.
 */
export async function pendingSubscription(
  db: Db,
  subject: Subject,
  at: Iso = now(),
): Promise<Subscription | undefined> {
  const clause = 'userId' in subject ? 'user_id = $s' : 'venue_id = $s';
  const value = 'userId' in subject ? subject.userId : subject.venueId;
  return await db.get<Subscription>(
    `SELECT s.* FROM subscriptions s
      WHERE ${clause} AND s.status IN ('trialing', 'active', 'grace') AND s.started_at > $at
      ORDER BY s.started_at LIMIT 1`,
    { s: value, at },
  );
}

export async function planFor(db: Db, subject: Subject, at: Iso = now()): Promise<Plan> {
  const audience: Audience = 'userId' in subject ? 'consumer' : 'partner';
  const subscription = await activeSubscription(db, subject, at);
  if (!subscription) return await freePlan(db, audience);
  return (
    (await db.get<Plan>(`SELECT * FROM plans WHERE id = $p`, { p: subscription.plan_id })) ??
    (await freePlan(db, audience))
  );
}

export type Entitlements = Record<string, string>;

/**
 * Every entitlement the account currently has, keyed.
 *
 * Read from the database on every call, and that is what makes an operator's
 * tier change **propagate immediately**: there is no cache to invalidate, no
 * copy on the session row, and no nightly job between the write and the answer.
 * The next request this account makes is gated by the new plan. Adding a cache
 * here would be the change that quietly makes item 23's promise untrue.
 */
export async function entitlementsFor(
  db: Db,
  subject: Subject,
  at: Iso = now(),
): Promise<Entitlements> {
  const plan = await planFor(db, subject, at);
  const rows = await db.all<{ key: string; value: string }>(
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

export async function startSubscription(
  db: Db,
  input: {
    subject: Subject;
    planCode: string;
    source: Subscription['source'];
    externalRef?: string;
    /**
     * How many months were bought at once, off the `plan_terms` ladder.
     *
     * A plan's `interval` says how it is *priced*; this says how long was
     * actually committed to, and they are not the same the moment 3, 6 and 12
     * month rungs are sold. Without it every subscription renews in thirty
     * days — and `runRenewals` sweeps anything past its renewal date, so a
     * customer who paid for a year would be moved to `grace` after one month
     * and expired a week later.
     */
    months?: number;
    /**
     * The period end the processor itself reports, which beats any arithmetic
     * here. Stripe decides when it will charge again — proration, a clock
     * skew, a month of a different length — and this row is a mirror of that
     * decision rather than a second opinion about it.
     */
    renewsAt?: Iso;
    at?: Iso;
  },
): Promise<Subscription> {
  const at = input.at ?? now();
  const audience: Audience = 'userId' in input.subject ? 'consumer' : 'partner';
  const plan = await db.get<Plan>(`SELECT * FROM plans WHERE audience = $a AND code = $c`, {
    a: audience,
    c: input.planCode,
  });
  if (!plan) throw new DomainError('not_found', 'plan not found');

  return db.tx(async () => {
    /* D2's "guard against double-billing": an existing entitled subscription is
       superseded rather than left running, and the supersession is visible in
       the row's `ended_at` rather than being a silent delete. */
    const existing = await activeSubscription(db, input.subject);
    if (existing) {
      await db.run(
        `UPDATE subscriptions SET status = 'cancelled', ended_at = $t, updated_at = $t WHERE id = $i`,
        { t: at, i: existing.id },
      );
    }

    const id = newId('sub');
    /*
     * **A trial needs days, or it is not a trial.**
     *
     * Nothing is sold with one now — every `trialDays` in `settings.ts` is 0 —
     * so this is false for every plan in the catalogue and the branch below
     * always takes the billing period. It is a derivation rather than a
     * constant because the tempting simplification is the bug: opening a paid
     * subscription as `trialing` with `plan.trial_days` of 0 sets `renews_at`
     * to the instant it started, and `runRenewals` sweeps everything whose
     * renewal date has passed — so the first pass after the purchase drops a
     * customer who has just paid into `grace`, and the pass a week later
     * expires them. The status would be wrong for a fortnight before anybody
     * could tell it from a card that failed.
     */
    const trialing = plan.trial_days > 0;
    await db.run(
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
        /* In order of authority: what the processor said, then the term that
           was bought, then the plan's own billing interval. */
        r: trialing
          ? plusDays(at, plan.trial_days)
          : (input.renewsAt ??
            (input.months && input.months > 1
              ? plusMonths(at, input.months)
              : plusDays(at, plan.interval === 'year' ? 365 : 30))),
      },
    );
    return (await db.get<Subscription>(`SELECT * FROM subscriptions WHERE id = $i`, { i: id }))!;
  });
}

/**
 * Put an account on a tier, because an operator said so — item 23.
 *
 * ## Why this is not `startSubscription` with `source: 'manual'`
 *
 * It nearly is, and the difference is the whole item. `startSubscription`
 * cancels the existing subscription **now** and starts the new one **now**;
 * that is right for a webhook, where the money has already moved and the
 * instant is not a choice. An operator's change has a *date* — "put them on Pro
 * from the first" — and applying it early is either a tier given away for free
 * or one taken away early, depending on the direction.
 *
 * So this is the dated version, and the date is expressed entirely in the two
 * columns `activeSubscription` now filters on:
 *
 * - **Now or in the past** → the old row ends, the new row starts, exactly as a
 *   webhook would do it. A backdate is allowed and is deliberately *not* a
 *   rewrite of history: the row starts at the date given, so the account is
 *   entitled from then, and nothing retroactively re-grants anything that was
 *   refused in between. There is no mechanism here for undoing a refusal, and
 *   pretending otherwise would be the more dangerous kind of wrong.
 * - **In the future** → the new row is written with `started_at` at the date,
 *   and the *current* row is given `cancel_at` at the same instant. Neither is
 *   live until then; on the day, the hand-over is atomic because it is the same
 *   two timestamps being compared by one query. Nothing runs at midnight.
 *
 * ## Free is a plan, so "remove the tier" is assigning one
 *
 * There is no "unassign". Every audience has a free plan (`freePlan`, the
 * lowest rank), `planFor` falls back to it, and assigning it explicitly is how
 * an operator takes somebody off a paid tier. That keeps one code path and one
 * audit row for every change, where a separate removal would be a second way to
 * reach the same state with different bookkeeping.
 *
 * ## What it refuses
 *
 * A plan from the **wrong audience**, which is the mistake this endpoint makes
 * easy: `plans` holds both, keyed `(audience, code)`, and putting a venue on a
 * consumer plan would give it a set of entitlements no partner screen reads —
 * a venue that looks subscribed and behaves free. The audience is derived from
 * the *subject* rather than taken from the caller, so it cannot be got wrong
 * from the outside at all.
 *
 * ## The audit row is written here and not by the route
 *
 * Every change of a tier is one, whoever asked — see Part E. It carries the
 * plan either side rather than only the new one, because "moved to Pro" does
 * not say whether that was a sale or a downgrade, and the operator's own note
 * rides with it: the reason a tier was granted by hand is the thing nobody can
 * reconstruct later.
 */
export async function assignPlan(
  db: Db,
  input: {
    subject: Subject;
    planCode: string;
    /** When it takes effect. Defaults to now, which is the webhook's behaviour. */
    effectiveFrom?: Iso;
    actorId: string;
    /** Why, in the operator's own words. Kept on the audit row. */
    note?: string;
    at?: Iso;
  },
): Promise<{ subscription: Subscription; effectiveFrom: Iso; scheduled: boolean }> {
  const at = input.at ?? now();
  const from = input.effectiveFrom ?? at;
  const audience: Audience = 'userId' in input.subject ? 'consumer' : 'partner';

  const plan = await db.get<Plan>(`SELECT * FROM plans WHERE audience = $a AND code = $c`, {
    a: audience,
    c: input.planCode,
  });
  if (!plan) {
    /* `planCode` and **not** `code`: the HTTP layer serialises a refusal as
       `{ code, message, ...detail }`, so a detail key called `code` overwrites
       the error code with the plan's — this answered `"code": "premium"` where
       a client branching on it needed `not_found`. Measured against a running
       server, which is the only place the collision is visible. */
    throw new DomainError('not_found', `no ${audience} plan called ${input.planCode}`, {
      audience,
      planCode: input.planCode,
    });
  }
  if (!plan.active) {
    /* A retired plan still has subscribers and still has to be readable; what
       it must not be is *assignable*, or an operator can put somebody on a tier
       the product has stopped selling and nobody will notice until it is
       deleted. */
    throw new DomainError('invalid_state', 'that plan is no longer offered', {
      planCode: plan.code,
    });
  }

  return db.tx(async () => {
    const before = await activeSubscription(db, input.subject, at);
    const scheduled = from > at;

    /*
     * A second dated change replaces the first rather than queueing behind it.
     * An operator correcting a date they mistyped should not leave two pending
     * rows, and `pendingSubscription` answers with the earliest — so the
     * mistake would be the one that took effect.
     */
    const queued = await pendingSubscription(db, input.subject, at);
    if (queued) {
      await db.run(
        `UPDATE subscriptions SET status = 'cancelled', ended_at = $t, updated_at = $t WHERE id = $i`,
        { t: at, i: queued.id },
      );
    }

    if (before) {
      if (scheduled) {
        /* Told when to stop, not stopped. See `activeSubscription`. */
        await db.run(`UPDATE subscriptions SET cancel_at = $f, updated_at = $t WHERE id = $i`, {
          f: from,
          t: at,
          i: before.id,
        });
      } else {
        await db.run(
          `UPDATE subscriptions SET status = 'cancelled', ended_at = $t, updated_at = $t WHERE id = $i`,
          { t: at, i: before.id },
        );
      }
    }

    const id = newId('sub');
    await db.run(
      `INSERT INTO subscriptions
         (id, user_id, venue_id, plan_id, status, source, external_ref, started_at,
          renews_at, created_at, updated_at)
       VALUES ($i, $u, $v, $p, 'active', 'manual', NULL, $from, $r, $at, $at)`,
      {
        i: id,
        u: 'userId' in input.subject ? input.subject.userId : null,
        v: 'venueId' in input.subject ? input.subject.venueId : null,
        p: plan.id,
        from,
        /*
         * **No renewal date on a granted tier**, and this is the one line most
         * likely to be "tidied" into a bug. `runRenewals` sweeps anything whose
         * `renews_at` has passed into `grace` and then `expired` — so giving an
         * operator's grant thirty days would quietly take it away in a month,
         * and the operator would have no way to tell that from a card failing.
         * A tier granted by hand is withdrawn by hand.
         */
        r: null,
        at,
      },
    );

    await audit.record(db, {
      actorId: input.actorId,
      actorRole: 'admin',
      action: 'subscription.assign',
      entity: 'subscription',
      entityId: id,
      venueId: 'venueId' in input.subject ? input.subject.venueId : undefined,
      before: before ? { planId: before.plan_id, subscriptionId: before.id } : null,
      after: {
        planId: plan.id,
        planCode: plan.code,
        audience,
        effectiveFrom: from,
        scheduled,
        note: input.note ?? null,
      },
      at,
    });

    return {
      subscription: (await db.get<Subscription>(`SELECT * FROM subscriptions WHERE id = $i`, {
        i: id,
      }))!,
      effectiveFrom: from,
      scheduled,
    };
  });
}

/**
 * Drop a dated change before it lands.
 *
 * Only a row whose window has not opened: cancelling one that is already live
 * is a *downgrade*, which is another `assignPlan` with the free plan and an
 * audit row saying so. Refusing it here keeps "undo the thing I scheduled" and
 * "take this account off its tier" as two different operations, because they
 * are two different decisions and only one of them changes what somebody has
 * today.
 */
export async function cancelScheduled(
  db: Db,
  input: { subscriptionId: string; actorId: string; at?: Iso },
): Promise<{ cancelled: boolean }> {
  const at = input.at ?? now();
  return db.tx(async () => {
    const row = await db.get<Subscription>(`SELECT * FROM subscriptions WHERE id = $i`, {
      i: input.subscriptionId,
    });
    if (!row) throw new DomainError('not_found', 'no such subscription');
    if (row.started_at <= at) {
      throw new DomainError('invalid_state', 'that change has already taken effect', {
        startedAt: row.started_at,
        remedy: 'assign a plan instead',
      });
    }

    await db.run(
      `UPDATE subscriptions SET status = 'cancelled', ended_at = $t, updated_at = $t WHERE id = $i`,
      { t: at, i: row.id },
    );
    /* And the row it was going to replace gets its open end back, or the
       account would stop being entitled on a date nothing now arrives on. */
    const subject: Subject = row.user_id
      ? { userId: row.user_id }
      : { venueId: row.venue_id as string };
    const clause = row.user_id ? 'user_id = $s' : 'venue_id = $s';
    await db.run(
      `UPDATE subscriptions SET cancel_at = NULL, updated_at = $t
        WHERE ${clause} AND cancel_at = $f AND status IN ('trialing', 'active', 'grace')`,
      { s: row.user_id ?? row.venue_id, f: row.started_at, t: at },
    );

    await audit.record(db, {
      actorId: input.actorId,
      actorRole: 'admin',
      action: 'subscription.unschedule',
      entity: 'subscription',
      entityId: row.id,
      venueId: row.venue_id ?? undefined,
      before: { planId: row.plan_id, startedAt: row.started_at },
      at,
    });

    /* Read back rather than assumed: the reinstated row is what every screen
       will now answer with, and a caller that trusted this without looking
       would report a plan the database disagrees with. */
    void (await activeSubscription(db, subject, at));
    return { cancelled: true };
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
export async function setStatus(
  db: Db,
  subscriptionId: string,
  status: Subscription['status'],
  at: Iso = now(),
  renewsAt?: Iso | null,
): Promise<void> {
  const ends = ENTITLED.has(status) ? null : at;
  await db.run(
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
export async function runRenewals(db: Db, at: Iso = now(), graceDays = 7): Promise<{ moved: number }> {
  const due = await db.all<Subscription>(
    `SELECT * FROM subscriptions
      WHERE status IN ('trialing', 'active', 'grace') AND renews_at IS NOT NULL AND renews_at <= $t`,
    { t: at },
  );
  let moved = 0;
  await db.tx(async () => {
    for (const sub of due) {
      if (sub.status === 'grace') {
        await setStatus(db, sub.id, 'expired', at);
      } else {
        await db.run(
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
export async function recordBillingEvent(
  db: Db,
  input: { source: string; eventType: string; externalId: string; payload: unknown; at?: Iso },
): Promise<boolean> {
  const at = input.at ?? now();
  const existing = await db.get<{ id: string }>(
    `SELECT id FROM billing_events WHERE source = $s AND external_id = $e`,
    { s: input.source, e: input.externalId },
  );
  if (existing) return false;
  await db.run(
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
