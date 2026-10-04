/**
 * Who may buy a gift card, and how much the platform spends on them — set by
 * an operator in the console's Gift cards tab, not in code.
 *
 * ## Two modes
 *
 * **Automatic** is the rulebook (§9.4): Pro and Premium only, one card per
 * person per `CONFIG.giftCards.perUserEveryDays`, and a monthly pool that is a
 * percentage of what the live Pro and Premium plans are worth. The operator
 * types the percentage and nothing else, and the pool grows by itself with the
 * number of members.
 *
 * **Manual** is every criterion by hand: who (everybody, Pro and Premium, or
 * Premium only), how much (a fixed amount, or a percentage of the same
 * figure), from when until when, whether that budget renews every month or is
 * one budget for the whole window, and how often one person may buy. Outside
 * its window a manual policy has no budget at all, so the shelf reads "sold out
 * this month" rather than selling against money nobody set aside.
 *
 * ## What "revenue" is here
 *
 * The live consumer Pro and Premium plans **at their list price**, whoever
 * granted them. Plans are given by an operator rather than sold today (the
 * owner's decision), and counting only paid ones would make the pool zero for
 * ever; once plans are sold, the same figure is the revenue. See
 * `vouchers.giftCardPool`.
 *
 * ## Stored once, read on every purchase
 *
 * One JSON row in `platform_config` (`gift_card_policy`), written only through
 * `setPolicy`, which validates and audits. A missing or unreadable row is the
 * rulebook's default, so a fresh database behaves exactly as §9.4 says.
 *
 * Nothing here imports `entitlements.ts`: that module reads `eligible` to
 * answer `gift_card_priority`, so the dependency runs one way.
 */
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import * as audit from './audit.ts';
import { DomainError } from './errors.ts';
import { now, type Iso } from './time.ts';

export const POLICY_KEY = 'gift_card_policy';

export type Audience = 'all' | 'paid' | 'premium';

export interface GiftPolicy {
  mode: 'auto' | 'manual';
  /** Automatic mode: the share of the plans' value spent on cards, 0–100. */
  autoPercent: number;
  manual: {
    audience: Audience;
    budgetKind: 'amount' | 'percent';
    /** Major units of `CONFIG.giftCards.anchorCurrency` (złoty). */
    amountMajor: number;
    percent: number;
    /** `YYYY-MM-DD`, inclusive; `null` is open on that side. */
    from: string | null;
    until: string | null;
    /** `monthly` renews the budget each calendar month inside the window. */
    repeat: 'monthly' | 'once';
    /** One card per this many days per person; 0 is no limit. */
    perUserEveryDays: number;
  };
  updatedAt: string | null;
}

export const DEFAULT_POLICY: GiftPolicy = {
  mode: 'auto',
  autoPercent: CONFIG.giftCards.poolShareBp / 100,
  manual: {
    audience: 'paid',
    budgetKind: 'amount',
    amountMajor: 0,
    percent: CONFIG.giftCards.poolShareBp / 100,
    from: null,
    until: null,
    repeat: 'monthly',
    perUserEveryDays: CONFIG.giftCards.perUserEveryDays,
  },
  updatedAt: null,
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const AUDIENCES: readonly Audience[] = ['all', 'paid', 'premium'];

function bad(field: string, message: string): never {
  throw new DomainError('validation_failed', message, { field });
}

/** Parse an operator's input (or a stored row) into a policy, refusing nonsense. */
export function parsePolicy(raw: unknown): Omit<GiftPolicy, 'updatedAt'> {
  const input = (raw ?? {}) as Record<string, unknown>;
  const manual = (input.manual ?? {}) as Record<string, unknown>;

  const mode = input.mode === 'manual' ? 'manual' : input.mode === 'auto' ? 'auto' : bad('mode', 'mode is auto or manual');
  const percentOf = (value: unknown, field: string): number => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 100) bad(field, 'a percentage is between 0 and 100');
    return Math.round(n * 100) / 100;
  };
  const autoPercent = percentOf(input.autoPercent ?? DEFAULT_POLICY.autoPercent, 'autoPercent');

  const audience = manual.audience ?? DEFAULT_POLICY.manual.audience;
  if (!AUDIENCES.includes(audience as Audience)) bad('manual.audience', 'audience is all, paid or premium');
  const budgetKind = manual.budgetKind === 'percent' ? 'percent' : manual.budgetKind === 'amount' || manual.budgetKind === undefined ? 'amount' : bad('manual.budgetKind', 'budget is an amount or a percent');
  const amountMajor = Number(manual.amountMajor ?? 0);
  if (!Number.isFinite(amountMajor) || amountMajor < 0 || amountMajor > 10_000_000) bad('manual.amountMajor', 'the amount is a sum of money, 0 or more');
  const percent = percentOf(manual.percent ?? DEFAULT_POLICY.manual.percent, 'manual.percent');

  const dayOf = (value: unknown, field: string): string | null => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string' || !DAY.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
      bad(field, 'a date is YYYY-MM-DD');
    }
    return value;
  };
  const from = dayOf(manual.from, 'manual.from');
  const until = dayOf(manual.until, 'manual.until');
  if (from && until && until < from) bad('manual.until', 'the window ends before it starts');

  const repeat = manual.repeat === 'once' ? 'once' : manual.repeat === 'monthly' || manual.repeat === undefined ? 'monthly' : bad('manual.repeat', 'repeat is monthly or once');
  const perUserEveryDays = Number(manual.perUserEveryDays ?? DEFAULT_POLICY.manual.perUserEveryDays);
  if (!Number.isInteger(perUserEveryDays) || perUserEveryDays < 0 || perUserEveryDays > 3650) {
    bad('manual.perUserEveryDays', 'days between cards is a whole number from 0 to 3650');
  }

  return {
    mode,
    autoPercent,
    manual: { audience: audience as Audience, budgetKind, amountMajor, percent, from, until, repeat, perUserEveryDays },
  };
}

/** The policy in force. A missing or unreadable row is the rulebook's default. */
export async function policy(db: Db): Promise<GiftPolicy> {
  const row = await db.get<{ value: string; updated_at: string }>(
    `SELECT value, updated_at FROM platform_config WHERE key = $k`,
    { k: POLICY_KEY },
  );
  if (!row) return DEFAULT_POLICY;
  try {
    return { ...parsePolicy(JSON.parse(row.value)), updatedAt: row.updated_at };
  } catch {
    return DEFAULT_POLICY;
  }
}

export async function setPolicy(db: Db, raw: unknown, actorId: string, at: Iso = now()): Promise<GiftPolicy> {
  const next = parsePolicy(raw);
  const before = await policy(db);
  await db.run(
    `INSERT INTO platform_config (key, value, updated_at) VALUES ($k, $v, $t)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    { k: POLICY_KEY, v: JSON.stringify(next), t: at },
  );
  await audit.record(db, {
    actorId,
    actorRole: 'admin',
    action: 'gift_card.policy',
    entity: 'platform_config',
    entityId: POLICY_KEY,
    before,
    after: next,
  });
  return { ...next, updatedAt: at };
}

/** Whether a plan may buy under this policy. Consumer plan codes: free, pro, premium. */
export function eligible(rules: GiftPolicy, planCode: string): boolean {
  const audience = rules.mode === 'auto' ? 'paid' : rules.manual.audience;
  if (audience === 'all') return true;
  if (audience === 'premium') return planCode === 'premium';
  return planCode === 'pro' || planCode === 'premium';
}

/** The days between one person's cards; 0 is no limit. */
export const perUserEveryDays = (rules: GiftPolicy): number =>
  rules.mode === 'auto' ? CONFIG.giftCards.perUserEveryDays : rules.manual.perUserEveryDays;

export interface Window {
  /** Cards issued at or after this instant count against the budget. */
  from: Iso;
  /** …and before this one. */
  until: Iso;
  /** Whether the policy has a budget at `at` at all. */
  open: boolean;
  /** The window's label for a screen: `YYYY-MM`, or `from…until`. */
  label: string;
}

const startOfDay = (day: string): Iso => `${day}T00:00:00.000Z` as Iso;
const dayAfter = (day: string): Iso => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString() as Iso;

/** The span whose cards are counted against the budget at `at`. */
export function windowAt(rules: GiftPolicy, at: Iso): Window {
  const month = at.slice(0, 7);
  const monthFrom = startOfDay(`${month}-01`);
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString() as Iso;
  if (rules.mode === 'auto') return { from: monthFrom, until: next, open: true, label: month };

  const { from, until, repeat } = rules.manual;
  const lo = from ? startOfDay(from) : null;
  const hi = until ? dayAfter(until) : null;
  const open = (!lo || at >= lo) && (!hi || at < hi);
  if (repeat === 'monthly') {
    return {
      from: lo && lo > monthFrom ? lo : monthFrom,
      until: hi && hi < next ? hi : next,
      open,
      label: month,
    };
  }
  return {
    from: lo ?? ('1970-01-01T00:00:00.000Z' as Iso),
    until: hi ?? ('9999-12-31T00:00:00.000Z' as Iso),
    open,
    label: `${from ?? '…'} – ${until ?? '…'}`,
  };
}

/**
 * The budget for the window, in minor units of the anchor currency, from the
 * plans' monthly value (also minor units).
 *
 * Automatic adds `CONFIG.giftCards.fixedMonthlyMajor` (the
 * `PAYLEZ_GIFT_POOL_MONTHLY` environment top-up, 0 by default) so a box that
 * was funded that way before this setting existed keeps its money.
 */
export function budgetMinor(rules: GiftPolicy, revenueMinor: number, window: Window, minorPerMajor: number): number {
  if (!window.open) return 0;
  if (rules.mode === 'auto') {
    const fixed = Math.max(0, Math.round(CONFIG.giftCards.fixedMonthlyMajor * minorPerMajor));
    return fixed + Math.floor((revenueMinor * rules.autoPercent) / 100);
  }
  return rules.manual.budgetKind === 'amount'
    ? Math.round(rules.manual.amountMajor * minorPerMajor)
    : Math.floor((revenueMinor * rules.manual.percent) / 100);
}
