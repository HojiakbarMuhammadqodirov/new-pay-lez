/**
 * Subscription passes — the monthly subscriptions a venue sells to its own
 * customers (dashboard v3 §3.5, the pass drawer §5.4). "A coffee a day for
 * 49 zł", "ten coffees a month", "15% off and perks", "two weekend coffees".
 *
 * Four tables, all owned here: `subscription_passes` (what the venue sells),
 * `pass_subscriptions` (one customer holding one), `pass_periods` (every period
 * a subscription has been in, at the price and terms it was locked at) and
 * `pass_redemptions` (a use at the counter). Not to be confused with
 * `redemption_passes` in `gate.ts`, which is the one-voucher code a phone shows
 * the gate and has nothing to do with this.
 *
 * Five rules, and every function below exists to keep one of them:
 *
 *   1. **There is no payment rail, and nothing here pretends otherwise.** A pass
 *      is sold venue-to-customer, which is Stripe Connect, which is not built
 *      (`ports/passPayments.ts`). Subscriptions are created by `subscribe`, which
 *      the test suite calls and the consumer route reaches only behind
 *      `CONFIG.passes.selfServeSubscribe` (off). Every period row carries
 *      `charge_status = 'not_charged'`, and every revenue figure below is the
 *      **contracted** price — what subscribers are on — never money collected.
 *   2. **A price is locked for the period it was bought for.** A new price
 *      reaches new subscribers at once and existing ones at their next
 *      renewal, when `runRenewals` writes the next `pass_periods` row from the
 *      pass as it then stands. The redemption *terms* are locked the same way,
 *      for the same reason: an owner who edits "once a day" down to "twice a
 *      week" mid-month has not given anybody less than they paid for.
 *   3. **The lifecycle is draft → live ⇄ paused → closed.** Paused stops
 *      sign-ups and nothing else — subscribers keep using it and keep renewing.
 *      Closed stops renewals: everybody keeps it to the end of the period they
 *      are in and then it expires. Sold out is *derived* (holders against
 *      `subscriber_cap`), never stored, because it stops being true the moment
 *      somebody's period ends.
 *   4. **The allowance is the server's, under a lock.** "Once a day" is counted
 *      in the venue's own day, a week is its ISO week, a month is anchored on
 *      the subscription's period start, and the count and the insert happen in
 *      one transaction behind a row lock on the subscription — two cashiers
 *      pressing at once cannot both spend the last coffee.
 *   5. **Only customers who agreed to share appear by name** — the same
 *      `data_sharing_consents` semi-join the Customers page runs, in SQL, so no
 *      code path reads a subscriber's name without it. Counts are counts and
 *      carry everybody; the min-cohort floor applies to findings about groups
 *      of people (`analytics.ts`), and nothing here is one.
 */
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import * as audit from './audit.ts';
import * as entitlements from './entitlements.ts';
import * as team from './team.ts';
import * as payments from '../ports/passPayments.ts';
import { DomainError } from './errors.ts';
import { newId, shortCode } from './ids.ts';
import { pctOf } from './money.ts';
import {
  isAfter,
  isoWeek,
  local,
  localMidnight,
  localMonth,
  monthStart,
  nextPeriod,
  now,
  plusDays,
  plusMonths,
  shiftDay,
  withinDailyWindow,
  type Iso,
} from './time.ts';
import { getVenue, requireVerified, type Venue } from './venues.ts';

/* ═══════════════════════════════════════════════════════ vocabularies ══ */

/** The drawer's five starting points (§5.4 "1 · A STARTING POINT"). */
export const PASS_TEMPLATES = ['daily', 'bundle', 'vip', 'weekend', 'custom'] as const;
export type PassTemplate = (typeof PASS_TEMPLATES)[number];

/**
 * The five swatches, as keys rather than hex: the colour a key draws in is the
 * client's decision (the web has a two-colour palette and will not draw these
 * as hues at all), and a stored hex would be one more place a palette lives.
 */
export const PASS_ACCENTS = ['teal', 'deep_green', 'purple', 'terracotta', 'ink'] as const;
export type PassAccent = (typeof PASS_ACCENTS)[number];

/** "Member perks" toggles. Words on a card — nothing in the gate grants them. */
export const PASS_PERKS = ['early_access', 'member_deals', 'skip_line', 'birthday'] as const;
export type PassPerk = (typeof PASS_PERKS)[number];

export const CAP_KINDS = ['per_day', 'per_week', 'per_month', 'unlimited'] as const;
export type CapKind = (typeof CAP_KINDS)[number];

export const BILLING_PERIODS = ['monthly', 'quarterly', 'annual'] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export const INTROS = ['none', 'trial_7', 'half_first'] as const;
export type Intro = (typeof INTROS)[number];

export type PassStatus = 'draft' | 'live' | 'paused' | 'closed';
export type SubscriptionStatus = 'trialing' | 'active' | 'cancelled' | 'expired';
export const PASS_ACTIONS = ['publish', 'pause', 'resume', 'close'] as const;
export type PassAction = (typeof PASS_ACTIONS)[number];

const MONTHS: Record<BillingPeriod, number> = { monthly: 1, quarterly: 3, annual: 12 };

/**
 * What a template fills in when the field was not sent. Only the *rule* —
 * never a name, an item or a price, which are the venue's words and money, and
 * a template that wrote "Filter coffee" into a bakery's pass would be a pass
 * nobody at the bakery wrote.
 */
const TEMPLATE_DEFAULTS: Record<
  PassTemplate,
  { accent: PassAccent; capKind: CapKind; capCount: number; allowedDays: number[] | null; discountPct: number | null }
> = {
  daily: { accent: 'teal', capKind: 'per_day', capCount: 1, allowedDays: null, discountPct: null },
  bundle: { accent: 'deep_green', capKind: 'per_month', capCount: 10, allowedDays: null, discountPct: null },
  vip: { accent: 'purple', capKind: 'unlimited', capCount: 1, allowedDays: null, discountPct: 15 },
  weekend: { accent: 'terracotta', capKind: 'per_week', capCount: 2, allowedDays: [5, 6], discountPct: null },
  custom: { accent: 'ink', capKind: 'per_day', capCount: 1, allowedDays: null, discountPct: null },
};

/* ═════════════════════════════════════════════════════════════ rows ══ */

interface PassRow {
  id: string;
  venue_id: string;
  template: PassTemplate;
  name: string;
  tagline: string | null;
  accent: PassAccent;
  benefit_item: string | null;
  discount_pct: number | null;
  perks: string | null;
  cap_kind: CapKind;
  cap_count: number;
  unlimited_ok: number;
  allowed_days: string | null;
  from_min: number | null;
  to_min: number | null;
  max_value_minor: number | null;
  seats: number;
  price_minor: number;
  currency: string;
  billing_period: BillingPeriod;
  intro: Intro;
  subscriber_cap: number | null;
  cost_per_use_minor: number | null;
  status: PassStatus;
  published_at: string | null;
  paused_at: string | null;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface SubscriptionRow {
  id: string;
  pass_id: string;
  venue_id: string;
  user_id: string | null;
  code: string;
  status: SubscriptionStatus;
  source: 'app' | 'manual';
  started_at: string;
  current_period_id: string | null;
  current_period_start: string;
  current_period_end: string;
  price_minor: number;
  currency: string;
  cancelled_at: string | null;
  ended_at: string | null;
}

/** The redemption rule, as locked onto a period. */
export interface PassTerms {
  benefitItem: string | null;
  discountPct: number | null;
  capKind: CapKind;
  capCount: number;
  /** Monday-zero; null is any day. */
  allowedDays: number[] | null;
  fromMin: number | null;
  toMin: number | null;
  maxValueMinor: number | null;
  seats: number;
  billingPeriod: BillingPeriod;
}

const daysOf = (csv: string | null): number[] | null =>
  csv === null || csv === '' ? null : csv.split(',').map(Number);

const perksOf = (csv: string | null): PassPerk[] =>
  csv ? (csv.split(',').filter((p) => (PASS_PERKS as readonly string[]).includes(p)) as PassPerk[]) : [];

const termsOf = (row: PassRow): PassTerms => ({
  benefitItem: row.benefit_item,
  discountPct: row.discount_pct,
  capKind: row.cap_kind,
  capCount: row.cap_count,
  allowedDays: daysOf(row.allowed_days),
  fromMin: row.from_min,
  toMin: row.to_min,
  maxValueMinor: row.max_value_minor,
  seats: row.seats,
  billingPeriod: row.billing_period,
});

/** A period's locked terms. A row that will not parse is a bug, and says so. */
function parseTerms(raw: string): PassTerms {
  try {
    return JSON.parse(raw) as PassTerms;
  } catch {
    throw new DomainError('internal', 'a pass period carries unreadable terms');
  }
}

/** The holding predicate: a subscription that may be used *now*. `$at` is bound by the caller. */
const HOLDING = `s.status IN ('trialing', 'active', 'cancelled') AND s.current_period_end > $at`;

/* ═══════════════════════════════════════════════════════════ the view ══ */

export interface PassView {
  id: string;
  venueId: string;
  template: PassTemplate;
  name: string;
  tagline: string | null;
  accent: PassAccent;
  benefitItem: string | null;
  discountPct: number | null;
  perks: PassPerk[];
  capKind: CapKind;
  capCount: number;
  unlimitedOk: boolean;
  allowedDays: number[] | null;
  fromMin: number | null;
  toMin: number | null;
  maxValueMinor: number | null;
  seats: number;
  priceMinor: number;
  currency: string;
  billingPeriod: BillingPeriod;
  intro: Intro;
  subscriberCap: number | null;
  costPerUseMinor: number | null;
  status: PassStatus;
  /** Derived: live and every seat under `subscriberCap` is held. */
  soldOut: boolean;
  /** Current holders (trialing, active, or cancelled inside their period). */
  holders: number;
  /** What publishing would still need, in field words. Empty when it would pass. */
  missing: string[];
  publishedAt: string | null;
  pausedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * What `publish` would refuse, without the venue and plan checks — those are
 * facts about the venue rather than about this pass, and the screen has its
 * own panels for them.
 */
function missingOf(row: PassRow): string[] {
  const missing: string[] = [];
  if (!row.name.trim()) missing.push('name');
  if (!row.benefit_item && row.discount_pct === null) missing.push('benefit');
  if (row.price_minor <= 0) missing.push('price');
  /* "Heavy users can cost more than the fee": an unlimited *item* is the case
     the drawer warns about, and it may only go live once somebody chose to keep
     it. A discount-only pass has no item to hand over, so nothing to warn of. */
  if (row.cap_kind === 'unlimited' && row.benefit_item && !row.unlimited_ok) missing.push('unlimitedOk');
  return missing;
}

async function holdersOf(db: Db, passId: string, at: Iso): Promise<number> {
  return (
    (await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM pass_subscriptions s WHERE s.pass_id = $p AND ${HOLDING}`,
      { p: passId, at },
    ))?.n ?? 0
  );
}

function viewOf(row: PassRow, holders: number): PassView {
  return {
    id: row.id,
    venueId: row.venue_id,
    template: row.template,
    name: row.name,
    tagline: row.tagline,
    accent: row.accent,
    benefitItem: row.benefit_item,
    discountPct: row.discount_pct,
    perks: perksOf(row.perks),
    capKind: row.cap_kind,
    capCount: row.cap_count,
    unlimitedOk: row.unlimited_ok === 1,
    allowedDays: daysOf(row.allowed_days),
    fromMin: row.from_min,
    toMin: row.to_min,
    maxValueMinor: row.max_value_minor,
    seats: row.seats,
    priceMinor: row.price_minor,
    currency: row.currency,
    billingPeriod: row.billing_period,
    intro: row.intro,
    subscriberCap: row.subscriber_cap,
    costPerUseMinor: row.cost_per_use_minor,
    status: row.status,
    soldOut: row.status === 'live' && row.subscriber_cap !== null && holders >= row.subscriber_cap,
    holders,
    missing: missingOf(row),
    publishedAt: row.published_at,
    pausedAt: row.paused_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function passRow(db: Db, passId: string): Promise<PassRow> {
  const row = await db.get<PassRow>(`SELECT * FROM subscription_passes WHERE id = $i`, { i: passId });
  if (!row) throw new DomainError('not_found', 'pass not found');
  return row;
}

/** A pass, checked to belong to the venue in the path — a pass id in another venue's URL is a 404. */
export async function passAt(db: Db, venueId: string, passId: string): Promise<PassRow> {
  const row = await passRow(db, passId);
  if (row.venue_id !== venueId) throw new DomainError('not_found', 'pass not found');
  return row;
}

export async function getPass(db: Db, venueId: string, passId: string, at: Iso = now()): Promise<PassView> {
  const row = await passAt(db, venueId, passId);
  return viewOf(row, await holdersOf(db, row.id, at));
}

/* ═══════════════════════════════════════════════════════ authoring ══ */

/**
 * A pass as the drawer sends it. Every field optional: create fills the gaps
 * from the template, a patch leaves them as they are. `null` is a value on the
 * nullable fields — it is how a cap, a discount or a day restriction is
 * *removed* — so callers must keep "not sent" (`undefined`) apart from it.
 */
export interface PassInput {
  template?: PassTemplate;
  name?: string;
  tagline?: string | null;
  accent?: PassAccent;
  benefitItem?: string | null;
  discountPct?: number | null;
  perks?: PassPerk[];
  capKind?: CapKind;
  capCount?: number;
  unlimitedOk?: boolean;
  allowedDays?: number[] | null;
  fromMin?: number | null;
  toMin?: number | null;
  maxValueMinor?: number | null;
  seats?: number;
  priceMinor?: number;
  billingPeriod?: BillingPeriod;
  intro?: Intro;
  /** 0 and null both mean "no limit" — the drawer's "0 means no limit". */
  subscriberCap?: number | null;
  costPerUseMinor?: number | null;
}

const bad = (field: string, message: string): never => {
  throw new DomainError('validation_failed', message, { field });
};

const wholeIn = (value: number, field: string, min: number, max: number): number => {
  if (!Number.isInteger(value) || value < min || value > max) bad(field, `${field} is a whole number from ${min} to ${max}`);
  return value;
};

const textUpTo = (value: string | null, field: string, max: number): string | null => {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length > max) bad(field, `${field} is at most ${max} characters`);
  return trimmed === '' ? null : trimmed;
};

/** Fold an input over a row (or the template's defaults) into the columns, validated. */
function columnsOf(base: PassRow | null, input: PassInput, template: PassTemplate) {
  const t = TEMPLATE_DEFAULTS[template];
  const pick = <K extends keyof PassInput, V>(key: K, fromRow: V, fromTemplate: V): PassInput[K] | V =>
    input[key] !== undefined ? input[key] : base ? fromRow : fromTemplate;

  const name = textUpTo((pick('name', base?.name ?? '', '') as string) ?? '', 'name', 60) ?? '';
  const tagline = textUpTo(pick('tagline', base?.tagline ?? null, null) as string | null, 'tagline', 120);
  const accent = pick('accent', base?.accent ?? t.accent, t.accent) as PassAccent;
  if (!PASS_ACCENTS.includes(accent)) bad('accent', `accent must be one of ${PASS_ACCENTS.join(', ')}`);

  const benefitItem = textUpTo(pick('benefitItem', base?.benefit_item ?? null, null) as string | null, 'benefitItem', 120);
  const discountRaw = pick('discountPct', base?.discount_pct ?? null, t.discountPct) as number | null;
  const discountPct = discountRaw === null ? null : wholeIn(discountRaw, 'discountPct', 1, 100);

  const perks = pick('perks', perksOf(base?.perks ?? null), []) as PassPerk[];
  for (const perk of perks) {
    if (!PASS_PERKS.includes(perk)) bad('perks', `perks are any of ${PASS_PERKS.join(', ')}`);
  }

  const capKind = pick('capKind', base?.cap_kind ?? t.capKind, t.capKind) as CapKind;
  if (!CAP_KINDS.includes(capKind)) bad('capKind', `capKind must be one of ${CAP_KINDS.join(', ')}`);
  const capCount = wholeIn(pick('capCount', base?.cap_count ?? t.capCount, t.capCount) as number, 'capCount', 1, 1000);
  const unlimitedOk = pick('unlimitedOk', base ? base.unlimited_ok === 1 : false, false) as boolean;

  const days = pick('allowedDays', daysOf(base?.allowed_days ?? null), t.allowedDays) as number[] | null;
  let allowedDays: string | null = null;
  if (days !== null) {
    if (!Array.isArray(days) || days.length === 0) {
      bad('allowedDays', 'allowedDays is a non-empty list of weekdays (0 = Monday), or null for any day');
    }
    const clean = [...new Set(days.map((d) => wholeIn(d, 'allowedDays', 0, 6)))].sort((a, b) => a - b);
    /* Every day is "any day", stored as such, so the card says one thing for it. */
    allowedDays = clean.length === 7 ? null : clean.join(',');
  }

  const fromMin = pick('fromMin', base?.from_min ?? null, null) as number | null;
  const toMin = pick('toMin', base?.to_min ?? null, null) as number | null;
  if ((fromMin === null) !== (toMin === null)) bad('fromMin', 'fromMin and toMin come together, or neither');
  if (fromMin !== null) wholeIn(fromMin, 'fromMin', 0, 1439);
  if (toMin !== null) wholeIn(toMin, 'toMin', 1, 1440);

  const maxRaw = pick('maxValueMinor', base?.max_value_minor ?? null, null) as number | null;
  const maxValueMinor = maxRaw === null ? null : wholeIn(maxRaw, 'maxValueMinor', 1, 100_000_000);
  const seats = wholeIn(pick('seats', base?.seats ?? 1, 1) as number, 'seats', 1, CONFIG.passes.maxSeats);
  const priceMinor = wholeIn(pick('priceMinor', base?.price_minor ?? 0, 0) as number, 'priceMinor', 0, 100_000_000);

  const billingPeriod = pick('billingPeriod', base?.billing_period ?? 'monthly', 'monthly') as BillingPeriod;
  if (!BILLING_PERIODS.includes(billingPeriod)) bad('billingPeriod', `billingPeriod must be one of ${BILLING_PERIODS.join(', ')}`);
  const intro = pick('intro', base?.intro ?? 'none', 'none') as Intro;
  if (!INTROS.includes(intro)) bad('intro', `intro must be one of ${INTROS.join(', ')}`);

  const capRaw = pick('subscriberCap', base?.subscriber_cap ?? null, null) as number | null;
  const subscriberCap = capRaw === null || capRaw === 0 ? null : wholeIn(capRaw, 'subscriberCap', 1, 1_000_000);
  const costRaw = pick('costPerUseMinor', base?.cost_per_use_minor ?? null, null) as number | null;
  const costPerUseMinor = costRaw === null ? null : wholeIn(costRaw, 'costPerUseMinor', 0, 100_000_000);

  return {
    template,
    name,
    tagline,
    accent,
    benefit_item: benefitItem,
    discount_pct: discountPct,
    perks: perks.length ? [...new Set(perks)].join(',') : null,
    cap_kind: capKind,
    cap_count: capCount,
    unlimited_ok: unlimitedOk ? 1 : 0,
    allowed_days: allowedDays,
    from_min: fromMin,
    to_min: toMin,
    max_value_minor: maxValueMinor,
    seats,
    price_minor: priceMinor,
    billing_period: billingPeriod,
    intro,
    subscriber_cap: subscriberCap,
    cost_per_use_minor: costPerUseMinor,
  };
}

type Columns = ReturnType<typeof columnsOf>;

const COLUMN_NAMES: Array<keyof Columns> = [
  'template', 'name', 'tagline', 'accent', 'benefit_item', 'discount_pct', 'perks', 'cap_kind', 'cap_count',
  'unlimited_ok', 'allowed_days', 'from_min', 'to_min', 'max_value_minor', 'seats', 'price_minor',
  'billing_period', 'intro', 'subscriber_cap', 'cost_per_use_minor',
];

/** Create a pass, as a draft. Publishing is a separate, checked press. */
export async function createPass(
  db: Db,
  input: { venueId: string; actorId: string; pass: PassInput; at?: Iso },
): Promise<PassView> {
  const at = input.at ?? now();
  const venue = await getVenue(db, input.venueId);
  const template = input.pass.template ?? 'custom';
  if (!PASS_TEMPLATES.includes(template)) bad('template', `template must be one of ${PASS_TEMPLATES.join(', ')}`);
  const columns = columnsOf(null, input.pass, template);

  const open =
    (await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM subscription_passes WHERE venue_id = $v AND status <> 'closed'`,
      { v: venue.id },
    ))?.n ?? 0;
  if (open >= CONFIG.passes.maxOpenPerVenue) {
    throw new DomainError('cap_reached', 'this venue has as many open passes as it may hold', {
      limit: CONFIG.passes.maxOpenPerVenue,
    });
  }

  const id = newId('spa');
  const params: Record<string, string | number | null> = { id, v: venue.id, cur: venue.currency, by: input.actorId, t: at };
  for (const name of COLUMN_NAMES) params[name] = columns[name];
  await db.run(
    `INSERT INTO subscription_passes
       (id, venue_id, ${COLUMN_NAMES.join(', ')}, currency, status, created_by, created_at, updated_at)
     VALUES ($id, $v, ${COLUMN_NAMES.map((n) => `$${n}`).join(', ')}, $cur, 'draft', $by, $t, $t)`,
    params,
  );
  await audit.record(db, {
    actorId: input.actorId,
    action: 'pass.create',
    entity: 'subscription_pass',
    entityId: id,
    venueId: venue.id,
    after: columns,
    at,
  });
  return await getPass(db, venue.id, id, at);
}

/**
 * Edit a pass. Any status but closed.
 *
 * **What changes, and for whom.** The row is the pass as it is sold *now*: a
 * new subscriber gets it at once. Somebody already holding it keeps the price
 * and the terms their current period was locked at (`pass_periods`) until
 * `runRenewals` writes their next one — "nobody is ever charged more
 * mid-term", and nobody is given less either.
 *
 * A live or paused pass may not be edited into something publishing would
 * refuse: it is in front of customers, and a blank name there is a broken card
 * in somebody's app rather than an unfinished draft.
 */
export async function updatePass(
  db: Db,
  input: { venueId: string; passId: string; actorId: string; patch: PassInput; at?: Iso },
): Promise<PassView> {
  const at = input.at ?? now();
  const row = await passAt(db, input.venueId, input.passId);
  if (row.status === 'closed') throw new DomainError('invalid_state', 'a closed pass cannot be edited');
  const template = input.patch.template ?? row.template;
  if (!PASS_TEMPLATES.includes(template)) bad('template', `template must be one of ${PASS_TEMPLATES.join(', ')}`);
  const columns = columnsOf(row, input.patch, template);

  if (row.status !== 'draft') {
    const missing = missingOf({ ...row, ...columns });
    if (missing.length) {
      throw new DomainError('validation_failed', 'a pass customers can see must stay complete', { missing });
    }
  }

  const params: Record<string, string | number | null> = { id: row.id, t: at };
  for (const name of COLUMN_NAMES) params[name] = columns[name];
  await db.run(
    `UPDATE subscription_passes SET ${COLUMN_NAMES.map((n) => `${n} = $${n}`).join(', ')}, updated_at = $t
      WHERE id = $id`,
    params,
  );
  await audit.record(db, {
    actorId: input.actorId,
    action: 'pass.update',
    entity: 'subscription_pass',
    entityId: row.id,
    venueId: row.venue_id,
    before: Object.fromEntries(COLUMN_NAMES.map((n) => [n, row[n]])),
    after: columns,
    at,
  });
  return await getPass(db, row.venue_id, row.id, at);
}

/**
 * Everything publishing (and resuming) asks: the venue is verified, its plan
 * includes passes, and the pass itself is complete. Resuming asks again
 * because a plan can lapse while a pass sits paused.
 */
async function assertPublishable(db: Db, row: PassRow): Promise<Venue> {
  const venue = await getVenue(db, row.venue_id);
  requireVerified(venue);
  entitlements.requireEntitlement(await entitlements.entitlementsFor(db, { venueId: venue.id }), 'passes');
  const missing = missingOf(row);
  if (missing.length) {
    throw new DomainError('validation_failed', 'the pass is not ready to publish', { missing });
  }
  return venue;
}

/**
 * The four presses: publish (draft → live), pause (live → paused: sign-ups
 * stop, subscribers keep it), resume (paused → live), close (live or paused →
 * closed: renewals stop, members keep it to the end of their period).
 *
 * Asking for the state a pass is already in is answered with the pass, not
 * refused — a double press on a slow connection is not an error.
 */
export async function setStatus(
  db: Db,
  input: { venueId: string; passId: string; action: PassAction; actorId: string; at?: Iso },
): Promise<PassView> {
  const at = input.at ?? now();
  const row = await passAt(db, input.venueId, input.passId);
  const to: Record<PassAction, PassStatus> = { publish: 'live', pause: 'paused', resume: 'live', close: 'closed' };
  const from: Record<PassAction, readonly PassStatus[]> = {
    publish: ['draft'],
    pause: ['live'],
    resume: ['paused'],
    close: ['live', 'paused'],
  };
  const target = to[input.action];
  if (row.status === target) {
    return await getPass(db, row.venue_id, row.id, at);
  }
  if (!from[input.action].includes(row.status)) {
    throw new DomainError(
      'invalid_state',
      row.status === 'draft' && input.action === 'close'
        ? 'a draft is deleted, not closed'
        : `a ${row.status} pass cannot be ${input.action === 'publish' ? 'published' : `${input.action}d`}`,
      { status: row.status },
    );
  }
  if (input.action === 'publish' || input.action === 'resume') await assertPublishable(db, row);

  const stamp =
    input.action === 'publish'
      ? `published_at = $t, paused_at = NULL`
      : input.action === 'pause'
        ? `paused_at = $t`
        : input.action === 'resume'
          ? `paused_at = NULL`
          : `closed_at = $t`;
  await db.run(`UPDATE subscription_passes SET status = $s, ${stamp}, updated_at = $t WHERE id = $i`, {
    s: target,
    t: at,
    i: row.id,
  });
  await audit.record(db, {
    actorId: input.actorId,
    action: `pass.${input.action}`,
    entity: 'subscription_pass',
    entityId: row.id,
    venueId: row.venue_id,
    before: { status: row.status },
    after: { status: target },
    at,
  });
  return await getPass(db, row.venue_id, row.id, at);
}

/** Delete a draft that nobody ever held. Anything else is closed, so its history survives. */
export async function deleteDraft(db: Db, input: { venueId: string; passId: string; actorId: string; at?: Iso }) {
  const at = input.at ?? now();
  const row = await passAt(db, input.venueId, input.passId);
  if (row.status !== 'draft') throw new DomainError('invalid_state', 'only a draft can be deleted; close a pass instead');
  const held = await db.get(`SELECT 1 FROM pass_subscriptions WHERE pass_id = $p`, { p: row.id });
  if (held) throw new DomainError('invalid_state', 'this pass has subscribers; close it instead');
  await db.run(`DELETE FROM subscription_passes WHERE id = $i`, { i: row.id });
  await audit.record(db, {
    actorId: input.actorId,
    action: 'pass.delete',
    entity: 'subscription_pass',
    entityId: row.id,
    venueId: row.venue_id,
    at,
  });
}

/* ═══════════════════════════════════════════════════ subscriptions ══ */

/** `PS-7K3M9Q`. The alphabet has no 0/O or 1/I — somebody reads it across a counter. */
async function freshCode(db: Db): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `PS-${shortCode(6)}`;
    if (!(await db.get(`SELECT 1 FROM pass_subscriptions WHERE code = $c`, { c: code }))) return code;
  }
  throw new DomainError('internal', 'could not mint a unique pass code');
}

async function writePeriod(
  db: Db,
  input: {
    subscriptionId: string;
    pass: PassRow;
    startsAt: Iso;
    endsAt: Iso;
    kind: 'trial' | 'intro' | 'full';
    priceMinor: number;
    at: Iso;
  },
): Promise<string> {
  const id = newId('ppr');
  /* TODO(passes-payments): this is where the money would be asked for. The port
     answers "not charged" until a payment rail exists — see its header. */
  const outcome = await payments.chargePeriod(db, {
    subscriptionId: input.subscriptionId,
    periodId: id,
    priceMinor: input.priceMinor,
    currency: input.pass.currency,
  });
  const chargeStatus = outcome.charged ? 'charged' : outcome.reason === 'free' ? 'free' : 'not_charged';
  await db.run(
    `INSERT INTO pass_periods
       (id, subscription_id, pass_id, starts_at, ends_at, kind, price_minor, currency, terms, charge_status, created_at)
     VALUES ($i, $s, $p, $from, $to, $k, $price, $cur, $terms, $charge, $t)`,
    {
      i: id,
      s: input.subscriptionId,
      p: input.pass.id,
      from: input.startsAt,
      to: input.endsAt,
      k: input.kind,
      price: input.priceMinor,
      cur: input.pass.currency,
      terms: JSON.stringify(termsOf(input.pass)),
      charge: chargeStatus,
      t: input.at,
    },
  );
  return id;
}

export interface SubscriptionView {
  id: string;
  passId: string;
  venueId: string;
  code: string;
  status: SubscriptionStatus;
  startedAt: string;
  periodStart: string;
  periodEnd: string;
  /** The price this period is locked at, and what kind of period it is. */
  priceMinor: number;
  currency: string;
  periodKind: 'trial' | 'intro' | 'full';
  /** Always false today: no payment rail (`ports/passPayments.ts`). */
  charged: boolean;
  cancelledAt: string | null;
  terms: PassTerms;
}

/* A module-level constructor rather than an inline `new DomainError(` — the
   `sqliteOnlySql` scan reads the lines after one for a `code:` key, and the
   view built just below it has one that is not a refusal detail. */
const noCurrentPeriod = () => new DomainError('internal', 'a pass subscription has no current period');

async function subscriptionView(db: Db, sub: SubscriptionRow): Promise<SubscriptionView> {
  const period = sub.current_period_id
    ? await db.get<{ kind: 'trial' | 'intro' | 'full'; terms: string; charge_status: string }>(
        `SELECT kind, terms, charge_status FROM pass_periods WHERE id = $i`,
        { i: sub.current_period_id },
      )
    : undefined;
  if (!period) throw noCurrentPeriod();
  return {
    id: sub.id,
    passId: sub.pass_id,
    venueId: sub.venue_id,
    code: sub.code,
    status: sub.status,
    startedAt: sub.started_at,
    periodStart: sub.current_period_start,
    periodEnd: sub.current_period_end,
    priceMinor: sub.price_minor,
    currency: sub.currency,
    periodKind: period.kind,
    charged: period.charge_status === 'charged',
    cancelledAt: sub.cancelled_at,
    terms: parseTerms(period.terms),
  };
}

async function subscriptionRow(db: Db, id: string): Promise<SubscriptionRow> {
  const row = await db.get<SubscriptionRow>(`SELECT * FROM pass_subscriptions WHERE id = $i`, { i: id });
  if (!row) throw new DomainError('not_found', 'subscription not found');
  return row;
}

/**
 * Put a customer on a pass.
 *
 * **Nothing here takes money**, and that is why the consumer route that calls
 * this is switched off (`CONFIG.passes.selfServeSubscribe`). The suite calls it
 * directly; a payment rail, when it exists, calls it from the webhook that says
 * the money moved — never from the press that starts a checkout.
 *
 * The capacity check and the insert share a transaction behind a row lock on
 * the pass, so the last seat cannot be sold twice. A trial is offered once per
 * person per pass: a customer who held it before starts on the full price.
 */
export async function subscribe(
  db: Db,
  input: { passId: string; userId: string; source?: 'app' | 'manual'; at?: Iso },
): Promise<SubscriptionView> {
  const at = input.at ?? now();
  const id = await db.tx(async () => {
    /* The lock. Writing a column to itself is a row lock on Postgres and a
       no-op on SQLite, whose transactions are already serialised. */
    await db.run(`UPDATE subscription_passes SET updated_at = updated_at WHERE id = $i`, { i: input.passId });
    const pass = await passRow(db, input.passId);
    if (pass.status !== 'live') {
      throw new DomainError(
        'invalid_state',
        pass.status === 'paused' ? 'sign-ups to this pass are paused' : 'this pass is not on sale',
        { status: pass.status },
      );
    }
    const user = await db.get<{ status: string }>(
      `SELECT status FROM users WHERE id = $u AND deleted_at IS NULL`,
      { u: input.userId },
    );
    if (!user) throw new DomainError('not_found', 'account not found');
    if (user.status !== 'active') throw new DomainError('forbidden', 'sign up before subscribing to a pass');

    const holding = await db.get(
      `SELECT 1 FROM pass_subscriptions s WHERE s.pass_id = $p AND s.user_id = $u AND ${HOLDING}`,
      { p: pass.id, u: input.userId, at },
    );
    if (holding) throw new DomainError('conflict', 'you already hold this pass');
    if (pass.subscriber_cap !== null && (await holdersOf(db, pass.id, at)) >= pass.subscriber_cap) {
      throw new DomainError('cap_reached', 'this pass is sold out', { subscriberCap: pass.subscriber_cap });
    }

    const heldBefore = await db.get(`SELECT 1 FROM pass_subscriptions WHERE pass_id = $p AND user_id = $u`, {
      p: pass.id,
      u: input.userId,
    });
    const intro: Intro = heldBefore ? 'none' : pass.intro;
    const months = MONTHS[pass.billing_period];
    const first =
      intro === 'trial_7'
        ? { kind: 'trial' as const, end: plusDays(at, CONFIG.passes.trialDays), price: 0, status: 'trialing' as const }
        : intro === 'half_first'
          ? { kind: 'intro' as const, end: plusMonths(at, months), price: Math.floor(pass.price_minor / 2), status: 'active' as const }
          : { kind: 'full' as const, end: plusMonths(at, months), price: pass.price_minor, status: 'active' as const };

    const subId = newId('psb');
    await db.run(
      `INSERT INTO pass_subscriptions
         (id, pass_id, venue_id, user_id, code, status, source, started_at, current_period_start,
          current_period_end, price_minor, currency, created_at, updated_at)
       VALUES ($i, $p, $v, $u, $c, $s, $src, $t, $t, $end, $price, $cur, $t, $t)`,
      {
        i: subId,
        p: pass.id,
        v: pass.venue_id,
        u: input.userId,
        c: await freshCode(db),
        s: first.status,
        src: input.source ?? 'app',
        t: at,
        end: first.end,
        price: first.price,
        cur: pass.currency,
      },
    );
    const periodId = await writePeriod(db, {
      subscriptionId: subId,
      pass,
      startsAt: at,
      endsAt: first.end,
      kind: first.kind,
      priceMinor: first.price,
      at,
    });
    await db.run(`UPDATE pass_subscriptions SET current_period_id = $pp WHERE id = $i`, { pp: periodId, i: subId });
    return subId;
  });
  return await subscriptionView(db, await subscriptionRow(db, id));
}

/**
 * The customer stops renewing. They keep the pass to the end of the period
 * they are in — trial included — and `runRenewals` expires it then.
 */
export async function cancel(
  db: Db,
  input: { subscriptionId: string; userId: string; at?: Iso },
): Promise<SubscriptionView> {
  const at = input.at ?? now();
  const sub = await subscriptionRow(db, input.subscriptionId);
  if (sub.user_id !== input.userId) throw new DomainError('not_found', 'subscription not found');
  if (sub.status === 'cancelled') return await subscriptionView(db, sub);
  if (sub.status === 'expired') throw new DomainError('invalid_state', 'this subscription has already ended');
  await db.run(
    `UPDATE pass_subscriptions SET status = 'cancelled', cancelled_at = $t, updated_at = $t WHERE id = $i`,
    { t: at, i: sub.id },
  );
  return await subscriptionView(db, await subscriptionRow(db, sub.id));
}

/**
 * The renewal clock (hourly, `jobs.runHourly`).
 *
 * Every subscription whose period has ended is either **expired** — it was
 * cancelled, the pass was closed, or the account is gone — or **rolled** into
 * its next period at the pass's price and terms *as they stand now*, which is
 * the moment a new price reaches an existing subscriber. Paused passes roll:
 * pausing stops sign-ups, not members. A subscription the job missed for
 * several periods catches up period by period, so its history has no hole.
 *
 * Idempotent: a rolled subscription's period ends in the future and is not
 * picked again, and `UNIQUE (subscription_id, starts_at)` refuses a second copy
 * of one period from a racing run.
 */
export async function runRenewals(db: Db, at: Iso = now()): Promise<{ renewed: number; expired: number }> {
  const due = await db.all<SubscriptionRow & { pass_status: PassStatus }>(
    `SELECT s.*, p.status AS pass_status FROM pass_subscriptions s
       JOIN subscription_passes p ON p.id = s.pass_id
      WHERE s.status IN ('trialing', 'active', 'cancelled') AND s.current_period_end <= $at
      ORDER BY s.current_period_end`,
    { at },
  );
  let renewed = 0;
  let expired = 0;
  for (const sub of due) {
    await db.tx(async () => {
      if (sub.status === 'cancelled' || sub.pass_status === 'closed' || sub.user_id === null) {
        await db.run(
          `UPDATE pass_subscriptions SET status = 'expired', ended_at = current_period_end, updated_at = $t
            WHERE id = $i AND status IN ('trialing', 'active', 'cancelled')`,
          { t: at, i: sub.id },
        );
        expired += 1;
        return;
      }
      const pass = await passRow(db, sub.pass_id);
      let start = sub.current_period_end;
      let periodId = sub.current_period_id;
      let end = start;
      for (let step = 0; step < 36 && !isAfter(end, at); step += 1) {
        end = plusMonths(start, MONTHS[pass.billing_period]);
        const exists = await db.get<{ id: string }>(
          `SELECT id FROM pass_periods WHERE subscription_id = $s AND starts_at = $from`,
          { s: sub.id, from: start },
        );
        periodId =
          exists?.id ??
          (await writePeriod(db, {
            subscriptionId: sub.id,
            pass,
            startsAt: start,
            endsAt: end,
            kind: 'full',
            priceMinor: pass.price_minor,
            at,
          }));
        if (!isAfter(end, at)) start = end;
      }
      await db.run(
        `UPDATE pass_subscriptions
            SET status = 'active', current_period_id = $pp, current_period_start = $from,
                current_period_end = $to, price_minor = $price, updated_at = $t
          WHERE id = $i`,
        { pp: periodId, from: start, to: end, price: pass.price_minor, t: at, i: sub.id },
      );
      renewed += 1;
    });
  }
  return { renewed, expired };
}

/* ═════════════════════════════════════════════════════ the allowance ══ */

export interface Allowance {
  capKind: CapKind;
  /** The window this use counts in, as the server keys it. */
  window: string;
  used: number;
  /** Null on an unlimited pass. */
  allowance: number | null;
  remaining: number | null;
  /** When the window turns over, or null when it never does (unlimited). */
  resetsAt: string | null;
}

/**
 * The allowance window an instant falls in.
 *
 * A day is the **venue's** day and a week its ISO week — a café's "once a day"
 * turns over at the café's midnight. A month is anchored on the subscription's
 * period start rather than the calendar: somebody who subscribes on the 25th
 * gets ten coffees for the month they paid for, not ten in six days and ten
 * more on the 1st.
 */
function windowOf(terms: PassTerms, at: Iso, timezone: string, periodStart: Iso): { key: string; resetsAt: Iso | null } {
  const day = local(at, timezone).day;
  switch (terms.capKind) {
    case 'per_day':
      return { key: `d:${day}`, resetsAt: localMidnight(shiftDay(day, 1), timezone) };
    case 'per_week': {
      const weekday = local(at, timezone).weekday;
      /* Noon UTC on the local date names that date's ISO week in every zone. */
      return { key: `w:${isoWeek(`${day}T12:00:00.000Z`)}`, resetsAt: localMidnight(shiftDay(day, 7 - weekday), timezone) };
    }
    case 'per_month': {
      let k = 0;
      while (k < 36 && !isAfter(plusMonths(periodStart, k + 1), at)) k += 1;
      return { key: `m:${plusMonths(periodStart, k)}`, resetsAt: plusMonths(periodStart, k + 1) };
    }
    default:
      return { key: 'u', resetsAt: null };
  }
}

async function usedIn(db: Db, subscriptionId: string, key: string): Promise<number> {
  return (
    (await db.get<{ n: number | null }>(
      `SELECT COALESCE(SUM(quantity), 0) AS n FROM pass_redemptions WHERE subscription_id = $s AND window_key = $k`,
      { s: subscriptionId, k: key },
    ))?.n ?? 0
  );
}

async function allowanceOf(db: Db, sub: SubscriptionRow, terms: PassTerms, timezone: string, at: Iso): Promise<Allowance> {
  const window = windowOf(terms, at, timezone, sub.current_period_start);
  const used = await usedIn(db, sub.id, window.key);
  const allowance = terms.capKind === 'unlimited' ? null : terms.capCount;
  return {
    capKind: terms.capKind,
    window: window.key,
    used,
    allowance,
    remaining: allowance === null ? null : Math.max(0, allowance - used),
    resetsAt: window.resetsAt,
  };
}

/** Why a held pass cannot be used at this instant, or null when it can. */
function blockedNow(terms: PassTerms, at: Iso, timezone: string): 'wrong_day' | 'outside_hours' | null {
  const l = local(at, timezone);
  if (terms.allowedDays && !terms.allowedDays.includes(l.weekday)) return 'wrong_day';
  if (terms.fromMin !== null && terms.toMin !== null && !withinDailyWindow(l.minutes, terms.fromMin, terms.toMin)) {
    return 'outside_hours';
  }
  return null;
}

/** What the pass gave on one visit, or null when nobody said what its item is worth. */
function coveredOf(terms: PassTerms, billMinor: number, quantity: number): number | null {
  let item = 0;
  if (terms.benefitItem) {
    if (terms.maxValueMinor === null) return null;
    item = Math.min(billMinor, terms.maxValueMinor * quantity);
  }
  let discount = terms.discountPct ? pctOf(billMinor - item, terms.discountPct) : 0;
  /* "Most off one visit" caps a discount-only pass's discount too. */
  if (!terms.benefitItem && terms.maxValueMinor !== null) discount = Math.min(discount, terms.maxValueMinor);
  return item + discount;
}

async function bySubscriptionCode(db: Db, venueId: string, code: string): Promise<SubscriptionRow> {
  const sub = await db.get<SubscriptionRow>(
    `SELECT * FROM pass_subscriptions WHERE venue_id = $v AND UPPER(code) = $c`,
    { v: venueId, c: code.trim().toUpperCase() },
  );
  /* One message for every miss: a counter is not told whether a code exists at
     another venue, or existed here once. */
  if (!sub) throw new DomainError('not_found', 'no pass with that code here');
  return sub;
}

export interface PassLookup {
  subscription: { id: string; code: string; status: SubscriptionStatus; periodEnd: string };
  pass: { id: string; name: string; benefitItem: string | null; discountPct: number | null; seats: number };
  /** The customer's name only when they share with this venue; a staff login sees first name and initial. */
  customer: { name: string | null };
  allowance: Allowance;
  /** Whether a redeem pressed now would pass, and if not, the word for why. */
  usable: { ok: boolean; reason: 'expired' | 'wrong_day' | 'outside_hours' | 'used_up' | null };
}

async function customerName(db: Db, venueId: string, userId: string | null, via: team.Via): Promise<string | null> {
  if (!userId) return null;
  const row = await db.get<{ name: string }>(
    `SELECT u.display_name AS name FROM users u
      WHERE u.id = $u AND u.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM data_sharing_consents d
                     WHERE d.user_id = u.id AND d.venue_id = $v AND d.revoked_at IS NULL)`,
    { u: userId, v: venueId },
  );
  if (!row) return null;
  return via === 'staff' ? team.shortName(row.name) : row.name;
}

const usableAt = (sub: SubscriptionRow, at: Iso): boolean =>
  sub.status !== 'expired' && !isAfter(sub.current_period_start, at) && isAfter(sub.current_period_end, at);

/** The counter's first half: what this code is and what is left on it. Writes nothing. */
export async function lookup(
  db: Db,
  input: { venueId: string; code: string; via: team.Via; at?: Iso },
): Promise<PassLookup> {
  const at = input.at ?? now();
  const venue = await getVenue(db, input.venueId);
  const sub = await bySubscriptionCode(db, venue.id, input.code);
  const pass = await passRow(db, sub.pass_id);
  const view = await subscriptionView(db, sub);
  const allowance = await allowanceOf(db, sub, view.terms, venue.timezone, at);
  const reason = !usableAt(sub, at)
    ? 'expired'
    : (blockedNow(view.terms, at, venue.timezone) ?? (allowance.remaining === 0 ? 'used_up' : null));
  return {
    subscription: { id: sub.id, code: sub.code, status: sub.status, periodEnd: sub.current_period_end },
    pass: { id: pass.id, name: pass.name, benefitItem: view.terms.benefitItem, discountPct: view.terms.discountPct, seats: view.terms.seats },
    customer: { name: await customerName(db, venue.id, sub.user_id, input.via) },
    allowance,
    usable: { ok: reason === null, reason },
  };
}

export interface RedeemResult {
  redemption: {
    id: string;
    subscriptionId: string;
    passId: string;
    quantity: number;
    billMinor: number | null;
    coveredMinor: number | null;
    transactionId: string | null;
    redeemedAt: string;
    /** As every counter receipt: who it is recorded against, null for the owner as themselves. */
    confirmedBy: { memberId: string; name: string } | null;
  };
  allowance: Allowance;
}

/**
 * A use of a pass at the till — `redeem` permission (server/TEAM.md: the bit
 * that already confirms voucher and reward redemptions, because handing over
 * something already paid for is the same act).
 *
 * The count and the write share one transaction behind a lock on the
 * subscription row, so two tills cannot both spend the last of an allowance.
 * `billMinor` (or a linked, committed `transactionId` at this venue for this
 * customer) is optional and is the only input the upsell estimate has.
 */
export async function redeem(
  db: Db,
  input: {
    venueId: string;
    actorId: string;
    code: string;
    quantity?: number;
    billMinor?: number;
    transactionId?: string;
    memberId?: string | null;
    at?: Iso;
  },
): Promise<RedeemResult> {
  const at = input.at ?? now();
  const venue = await getVenue(db, input.venueId);
  const quantity = input.quantity ?? 1;
  wholeIn(quantity, 'quantity', 1, CONFIG.passes.maxPerRedeem);

  const result = await db.tx(async () => {
    const found = await bySubscriptionCode(db, venue.id, input.code);
    /* Re-checked with the customer named: a team member may not redeem their
       own pass on their own till (`team.requireCounter`'s self-serve rule). */
    const access = await team.requireCounter(db, venue.id, input.actorId, 'redeem', {
      memberId: input.memberId ?? null,
      customerId: found.user_id,
      at,
    });
    await db.run(`UPDATE pass_subscriptions SET updated_at = $t WHERE id = $i`, { t: at, i: found.id });
    const sub = await subscriptionRow(db, found.id);
    if (!usableAt(sub, at)) throw new DomainError('expired', 'this pass is not active', { status: sub.status });

    const view = await subscriptionView(db, sub);
    const terms = view.terms;
    const blocked = blockedNow(terms, at, venue.timezone);
    if (blocked) {
      throw new DomainError('conflict', blocked === 'wrong_day' ? 'this pass is not valid today' : 'this pass is not valid at this hour', {
        reason: blocked,
        allowedDays: terms.allowedDays,
        fromMin: terms.fromMin,
        toMin: terms.toMin,
      });
    }
    if (quantity > terms.seats) {
      throw new DomainError('validation_failed', `this pass covers ${terms.seats} at a time`, { field: 'quantity' });
    }
    const window = windowOf(terms, at, venue.timezone, sub.current_period_start);
    const used = await usedIn(db, sub.id, window.key);
    if (terms.capKind !== 'unlimited' && used + quantity > terms.capCount) {
      throw new DomainError('cap_reached', 'this pass has been used up for now', {
        used,
        allowance: terms.capCount,
        window: window.key,
        resetsAt: window.resetsAt,
      });
    }

    let bill: number | null = input.billMinor ?? null;
    let transactionId: string | null = null;
    if (input.transactionId) {
      const txn = await db.get<{ amount_minor: number | null; user_id: string; status: string }>(
        `SELECT amount_minor, user_id, status FROM transactions WHERE id = $i AND venue_id = $v`,
        { i: input.transactionId, v: venue.id },
      );
      if (!txn || txn.user_id !== sub.user_id || txn.status !== 'committed' || txn.amount_minor === null) {
        throw new DomainError('validation_failed', 'transactionId is not a confirmed sale to this customer here', {
          field: 'transactionId',
        });
      }
      if (bill !== null && bill !== txn.amount_minor) {
        throw new DomainError('validation_failed', 'billMinor disagrees with the linked transaction', { field: 'billMinor' });
      }
      if (await db.get(`SELECT 1 FROM pass_redemptions WHERE transaction_id = $i`, { i: input.transactionId })) {
        throw new DomainError('already_used', 'that sale is already linked to a pass use');
      }
      bill = txn.amount_minor;
      transactionId = input.transactionId;
    }
    if (bill !== null) wholeIn(bill, 'billMinor', 1, 100_000_000);
    const covered = bill === null ? null : coveredOf(terms, bill, quantity);

    const id = newId('prd');
    await db.run(
      `INSERT INTO pass_redemptions
         (id, subscription_id, period_id, pass_id, venue_id, user_id, window_key, quantity, bill_minor,
          covered_minor, transaction_id, confirmed_by, confirmed_member_id, redeemed_at, created_at)
       VALUES ($i, $s, $pp, $p, $v, $u, $k, $q, $b, $c, $x, $by, $m, $t, $t)`,
      {
        i: id,
        s: sub.id,
        pp: sub.current_period_id,
        p: sub.pass_id,
        v: venue.id,
        u: sub.user_id,
        k: window.key,
        q: quantity,
        b: bill,
        c: covered,
        x: transactionId,
        by: input.actorId,
        m: access.memberId,
        t: at,
      },
    );
    return { id, sub, terms, bill, covered, transactionId, memberId: access.memberId };
  });

  const member = result.memberId
    ? await db.get<{ name: string }>(`SELECT name FROM team_members WHERE id = $m`, { m: result.memberId })
    : undefined;
  return {
    redemption: {
      id: result.id,
      subscriptionId: result.sub.id,
      passId: result.sub.pass_id,
      quantity,
      billMinor: result.bill,
      coveredMinor: result.covered,
      transactionId: result.transactionId,
      redeemedAt: at,
      confirmedBy: result.memberId && member ? { memberId: result.memberId, name: member.name } : null,
    },
    allowance: await allowanceOf(db, result.sub, result.terms, venue.timezone, at),
  };
}

/* ═══════════════════════════════════════════════════════════ stats ══ */

/**
 * "Est. upsell" — extra spend beyond the pass, and an **estimate** in the
 * plainest sense: it is measured only on the uses where the till entered the
 * bill *and* the pass's covered value is known (an item pass needs "Most off
 * one visit" for that). Summed over those as `bill − covered`, and never
 * scaled up to the uses that were not measured: `measured` of `redemptions`
 * says how much of the month it stands on.
 *
 * Null, with the reason, when nothing could be measured — never 0, which would
 * say the subscribers bought nothing else.
 */
export interface Upsell {
  minor: number | null;
  measured: number;
  redemptions: number;
  reason: null | 'no_redemptions' | 'no_bills_recorded' | 'no_covered_value';
}

interface MonthWindow {
  month: string;
  from: Iso;
  to: Iso;
}

const monthOf = (venue: Venue, at: Iso): MonthWindow => {
  const month = localMonth(at, venue.timezone);
  return { month, from: monthStart(month, venue.timezone), to: monthStart(nextPeriod(month), venue.timezone) };
};

async function upsellOf(db: Db, where: { venueId: string; passId?: string }, window: MonthWindow): Promise<Upsell> {
  const rows = await db.all<{ quantity: number; bill_minor: number | null; covered_minor: number | null }>(
    `SELECT quantity, bill_minor, covered_minor FROM pass_redemptions
      WHERE venue_id = $v AND (pass_id = $p OR $p IS NULL) AND redeemed_at >= $from AND redeemed_at < $to`,
    { v: where.venueId, p: where.passId ?? null, from: window.from, to: window.to },
  );
  const redemptions = rows.length;
  const billed = rows.filter((r) => r.bill_minor !== null);
  const measured = billed.filter((r) => r.covered_minor !== null);
  if (redemptions === 0) return { minor: null, measured: 0, redemptions, reason: 'no_redemptions' };
  if (billed.length === 0) return { minor: null, measured: 0, redemptions, reason: 'no_bills_recorded' };
  if (measured.length === 0) return { minor: null, measured: 0, redemptions, reason: 'no_covered_value' };
  return {
    minor: measured.reduce((sum, r) => sum + Math.max(0, r.bill_minor! - r.covered_minor!), 0),
    measured: measured.length,
    redemptions,
    reason: null,
  };
}

/**
 * Recurring revenue a month: every **active** subscription (not trialing, not
 * cancelled, on a pass that is not closed — the three that will not renew)
 * at the price its current period is locked at, spread over its billing
 * period. An intro month counts at its intro price, because that is what that
 * subscriber is on. Contracted, not collected: no payment rail exists.
 */
async function recurringOf(db: Db, where: { venueId: string; passId?: string }, at: Iso): Promise<number> {
  const rows = await db.all<{ price_minor: number; terms: string | null }>(
    `SELECT s.price_minor, pp.terms FROM pass_subscriptions s
       JOIN subscription_passes p ON p.id = s.pass_id
       LEFT JOIN pass_periods pp ON pp.id = s.current_period_id
      WHERE s.venue_id = $v AND (s.pass_id = $p OR $p IS NULL)
        AND s.status = 'active' AND s.current_period_end > $at AND p.status <> 'closed'`,
    { v: where.venueId, p: where.passId ?? null, at },
  );
  return rows.reduce((sum, row) => {
    const months = MONTHS[row.terms ? parseTerms(row.terms).billingPeriod : 'monthly'] ?? 1;
    return sum + Math.round(row.price_minor / months);
  }, 0);
}

async function usesOf(db: Db, where: { venueId: string; passId?: string }, window: MonthWindow): Promise<number> {
  return (
    (await db.get<{ n: number | null }>(
      `SELECT COALESCE(SUM(quantity), 0) AS n FROM pass_redemptions
        WHERE venue_id = $v AND (pass_id = $p OR $p IS NULL) AND redeemed_at >= $from AND redeemed_at < $to`,
      { v: where.venueId, p: where.passId ?? null, from: window.from, to: window.to },
    ))?.n ?? 0
  );
}

async function holdingCount(db: Db, where: { venueId: string; passId?: string }, at: Iso): Promise<number> {
  return (
    (await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM pass_subscriptions s
        WHERE s.venue_id = $v AND (s.pass_id = $p OR $p IS NULL) AND ${HOLDING}`,
      { v: where.venueId, p: where.passId ?? null, at },
    ))?.n ?? 0
  );
}

export interface PassCard extends PassView {
  stats: { subscribers: number; usedThisMonth: number; recurringMinor: number };
}

export interface PassList {
  /** The venue-local month every "this month" figure is cut on, `YYYY-MM`. */
  month: string;
  currency: string;
  stats: {
    /** Holders across every pass, closed ones' members included until their period ends. */
    activeSubscribers: number;
    livePasses: number;
    recurringMinor: number;
    redemptionsThisMonth: number;
    upsell: Upsell;
  };
  /** No payment rail: a venue cannot connect payouts, and customers cannot subscribe in the app. */
  payouts: { connected: boolean; available: boolean };
  subscribeAvailable: boolean;
  passes: PassCard[];
}

/** The Passes screen's list view (§3.5): the four stat cards and one card per pass. */
export async function listForVenue(db: Db, venueId: string, at: Iso = now()): Promise<PassList> {
  const venue = await getVenue(db, venueId);
  const window = monthOf(venue, at);
  const rows = await db.all<PassRow>(
    `SELECT * FROM subscription_passes WHERE venue_id = $v
      ORDER BY CASE status WHEN 'live' THEN 0 WHEN 'paused' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END, created_at DESC`,
    { v: venue.id },
  );
  const passes: PassCard[] = [];
  for (const row of rows) {
    const holders = await holdersOf(db, row.id, at);
    passes.push({
      ...viewOf(row, holders),
      stats: {
        subscribers: holders,
        usedThisMonth: await usesOf(db, { venueId: venue.id, passId: row.id }, window),
        recurringMinor: await recurringOf(db, { venueId: venue.id, passId: row.id }, at),
      },
    });
  }
  return {
    month: window.month,
    currency: venue.currency,
    stats: {
      activeSubscribers: await holdingCount(db, { venueId: venue.id }, at),
      livePasses: rows.filter((r) => r.status === 'live').length,
      recurringMinor: await recurringOf(db, { venueId: venue.id }, at),
      redemptionsThisMonth: await usesOf(db, { venueId: venue.id }, window),
      upsell: await upsellOf(db, { venueId: venue.id }, window),
    },
    payouts: { connected: false, available: payments.paymentsAvailable() },
    subscribeAvailable: CONFIG.passes.selfServeSubscribe,
    passes,
  };
}

export interface PassDetail {
  month: string;
  pass: PassView;
  stats: {
    subscribers: number;
    newThisMonth: number;
    cancelledThisMonth: number;
    recurringMinor: number;
    redemptionsThisMonth: number;
    /** Uses this month per current holder, one decimal. 0 with nobody holding — a rate over nothing is 0. */
    perActiveSubscriber: number;
    upsell: Upsell;
  };
}

/** The detail view's four stats (§3.5). */
export async function detail(db: Db, venueId: string, passId: string, at: Iso = now()): Promise<PassDetail> {
  const venue = await getVenue(db, venueId);
  const pass = await getPass(db, venue.id, passId, at);
  const window = monthOf(venue, at);
  const where = { venueId: venue.id, passId: pass.id };
  const countWhere = async (column: 'started_at' | 'cancelled_at') =>
    (await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM pass_subscriptions
        WHERE pass_id = $p AND ${column} >= $from AND ${column} < $to`,
      { p: pass.id, from: window.from, to: window.to },
    ))?.n ?? 0;
  const uses = await usesOf(db, where, window);
  return {
    month: window.month,
    pass,
    stats: {
      subscribers: pass.holders,
      newThisMonth: await countWhere('started_at'),
      cancelledThisMonth: await countWhere('cancelled_at'),
      recurringMinor: await recurringOf(db, where, at),
      redemptionsThisMonth: uses,
      perActiveSubscriber: pass.holders === 0 ? 0 : Math.round((uses / pass.holders) * 10) / 10,
      upsell: await upsellOf(db, where, window),
    },
  };
}

export interface PassMember {
  subscriptionId: string;
  passId: string;
  passName: string;
  accent: PassAccent;
  userId: string;
  name: string;
  avatar: string | null;
  since: string;
  usedThisPeriod: number;
  status: 'trialing' | 'active' | 'cancelled';
}

export interface PassMembers {
  /** Everybody holding, whether or not they share — the "N total" half. */
  total: number;
  /** The ones listed below. */
  shared: number;
  rows: PassMember[];
}

/**
 * The subscribers list (§3.5) and the Customers page's subscriber chip:
 * current holders who **share their profile with this venue**, and nobody
 * else. The grant is an `EXISTS` in the query, exactly as `profiles.customerTable`
 * reads it — no code path reads a name without it.
 */
export async function members(
  db: Db,
  venueId: string,
  opts: { passId?: string; at?: Iso } = {},
): Promise<PassMembers> {
  const at = opts.at ?? now();
  if (opts.passId) await passAt(db, venueId, opts.passId);
  const total = await holdingCount(db, { venueId, passId: opts.passId }, at);
  const rows = await db.all<{
    id: string;
    pass_id: string;
    pass_name: string;
    accent: PassAccent;
    user_id: string;
    name: string;
    avatar: string | null;
    started_at: string;
    status: 'trialing' | 'active' | 'cancelled';
    used: number | null;
  }>(
    `SELECT s.id, s.pass_id, p.name AS pass_name, p.accent, s.user_id, u.display_name AS name,
            u.display_avatar AS avatar, s.started_at, s.status,
            (SELECT COALESCE(SUM(r.quantity), 0) FROM pass_redemptions r
              WHERE r.subscription_id = s.id AND r.period_id = s.current_period_id) AS used
       FROM pass_subscriptions s
       JOIN subscription_passes p ON p.id = s.pass_id
       JOIN users u ON u.id = s.user_id
      WHERE s.venue_id = $v AND (s.pass_id = $p OR $p IS NULL) AND ${HOLDING} AND u.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM data_sharing_consents d
                     WHERE d.user_id = s.user_id AND d.venue_id = s.venue_id AND d.revoked_at IS NULL)
      ORDER BY s.started_at DESC`,
    { v: venueId, p: opts.passId ?? null, at },
  );
  return {
    total,
    shared: rows.length,
    rows: rows.map((row) => ({
      subscriptionId: row.id,
      passId: row.pass_id,
      passName: row.pass_name,
      accent: row.accent,
      userId: row.user_id,
      name: row.name,
      avatar: row.avatar,
      since: row.started_at,
      usedThisPeriod: row.used ?? 0,
      status: row.status,
    })),
  };
}

/* ═══════════════════════════════════════════════════════ the customer ══ */

export interface PublicPass {
  id: string;
  venueId: string;
  template: PassTemplate;
  name: string;
  tagline: string | null;
  accent: PassAccent;
  benefitItem: string | null;
  discountPct: number | null;
  perks: PassPerk[];
  capKind: CapKind;
  capCount: number;
  allowedDays: number[] | null;
  fromMin: number | null;
  toMin: number | null;
  maxValueMinor: number | null;
  seats: number;
  priceMinor: number;
  currency: string;
  billingPeriod: BillingPeriod;
  intro: Intro;
  soldOut: boolean;
  /** Whether `POST /v1/passes/:id/subscribe` would be accepted for this pass now. */
  subscribable: boolean;
  /** Why not, when it would not. */
  unavailableReason: null | 'payments_unavailable' | 'sold_out';
  /** The caller's own current subscription to it, when signed in and holding. */
  mine: { subscriptionId: string; status: SubscriptionStatus } | null;
}

/** A venue's passes as a customer sees them: live ones only — paused is "sign-ups paused". */
export async function publicForVenue(db: Db, venueId: string, userId: string | null, at: Iso = now()): Promise<PublicPass[]> {
  await getVenue(db, venueId);
  const rows = await db.all<PassRow>(
    `SELECT * FROM subscription_passes WHERE venue_id = $v AND status = 'live' ORDER BY published_at`,
    { v: venueId },
  );
  const out: PublicPass[] = [];
  for (const row of rows) {
    const view = viewOf(row, await holdersOf(db, row.id, at));
    const mine = userId
      ? await db.get<{ id: string; status: SubscriptionStatus }>(
          `SELECT s.id, s.status FROM pass_subscriptions s WHERE s.pass_id = $p AND s.user_id = $u AND ${HOLDING}`,
          { p: row.id, u: userId, at },
        )
      : undefined;
    const reason = view.soldOut ? 'sold_out' : CONFIG.passes.selfServeSubscribe ? null : 'payments_unavailable';
    out.push({
      id: view.id,
      venueId: view.venueId,
      template: view.template,
      name: view.name,
      tagline: view.tagline,
      accent: view.accent,
      benefitItem: view.benefitItem,
      discountPct: view.discountPct,
      perks: view.perks,
      capKind: view.capKind,
      capCount: view.capCount,
      allowedDays: view.allowedDays,
      fromMin: view.fromMin,
      toMin: view.toMin,
      maxValueMinor: view.maxValueMinor,
      seats: view.seats,
      priceMinor: view.priceMinor,
      currency: view.currency,
      billingPeriod: view.billingPeriod,
      intro: view.intro,
      soldOut: view.soldOut,
      subscribable: reason === null && !mine,
      unavailableReason: reason,
      mine: mine ? { subscriptionId: mine.id, status: mine.status } : null,
    });
  }
  return out;
}

export interface MyPass extends SubscriptionView {
  pass: { id: string; name: string; tagline: string | null; accent: PassAccent; venueId: string; venueName: string };
  allowance: Allowance;
}

/** "My passes": what the customer holds now, plus anything that ended in the last 90 days. */
export async function mine(db: Db, userId: string, at: Iso = now()): Promise<MyPass[]> {
  const rows = await db.all<SubscriptionRow & { venue_name: string; timezone: string; pass_name: string; tagline: string | null; accent: PassAccent }>(
    `SELECT s.*, v.name AS venue_name, v.timezone, p.name AS pass_name, p.tagline, p.accent
       FROM pass_subscriptions s
       JOIN subscription_passes p ON p.id = s.pass_id
       JOIN venues v ON v.id = s.venue_id
      WHERE s.user_id = $u AND (s.status <> 'expired' OR s.ended_at >= $since)
      ORDER BY s.current_period_end DESC`,
    { u: userId, since: plusDays(at, -90) },
  );
  const out: MyPass[] = [];
  for (const row of rows) {
    const view = await subscriptionView(db, row);
    out.push({
      ...view,
      pass: { id: row.pass_id, name: row.pass_name, tagline: row.tagline, accent: row.accent, venueId: row.venue_id, venueName: row.venue_name },
      allowance: await allowanceOf(db, row, view.terms, row.timezone, at),
    });
  }
  return out;
}
