/**
 * The Passes screen's pure helpers and hooks — kept apart from the three
 * component modules (`dashboardPasses.tsx`, `dashboardPassDetail.tsx`,
 * `dashboardPassDrawer.tsx`) because a module that exports a hook beside a
 * component loses React fast refresh, the split `dashboardFormat.ts` makes.
 *
 * Three things here are mirrors of the server and must stay mirrors:
 *
 * - **`TEMPLATE_RULES` is `TEMPLATE_DEFAULTS` in `server/domain/passes.ts`.**
 *   A template prefills the *rule* — cap, days, discount, accent — and never a
 *   name, an item or a price, which are the venue's words and money. The
 *   drawer applies it on the press so the form shows what the server would
 *   have filled in; the server would fill the same values for a field not sent.
 * - **`missingFor` is `missingOf`**, so the drawer's footer refuses for the
 *   same reasons publishing would, before a round trip rather than after.
 * - **The plan read is `GET …/subscription`**, the same call the plan modal
 *   makes, because "Included in Growth" is a claim about this venue's plan and
 *   the only thing allowed to make it is that plan's own entitlement row.
 */
import { useCallback, useMemo, useState } from 'react';

import { ApiError, hasToken } from './api/client';
import { isNoSession, noSession, readyOr } from './api/partner';
import type {
  BillingPeriod,
  CapKind,
  Pass,
  PassAccent,
  PassMissing,
  PassTemplate,
  PassUpsell,
} from './api/passes';
import { useApi } from './api/useApi';
import { DEMO_VENUE_PLAN } from './dashboardDemo';
import type { DxIconName } from './dashboardIcons';
import { useDashboard } from './dashboardShell';
import { DEMO_MODE } from './demoMode';
import { useCopy, type Dictionary } from './i18n/context';
import { fill } from './i18n/currency';

export type PassCopy = Dictionary['dashboard']['passes'];

/* ─────────────────────────────────────────────────────────── templates ── */

export const TEMPLATE_ORDER: readonly PassTemplate[] = ['daily', 'bundle', 'vip', 'weekend', 'custom'];

export interface PassRule {
  accent: PassAccent;
  capKind: CapKind;
  capCount: number;
  allowedDays: number[] | null;
  discountPct: number | null;
}

/** `TEMPLATE_DEFAULTS` on the server, field for field. 0 = Monday. */
export const TEMPLATE_RULES: Record<PassTemplate, PassRule> = {
  daily: { accent: 'teal', capKind: 'per_day', capCount: 1, allowedDays: null, discountPct: null },
  bundle: { accent: 'deep_green', capKind: 'per_month', capCount: 10, allowedDays: null, discountPct: null },
  vip: { accent: 'purple', capKind: 'unlimited', capCount: 1, allowedDays: null, discountPct: 15 },
  weekend: { accent: 'terracotta', capKind: 'per_week', capCount: 2, allowedDays: [5, 6], discountPct: null },
  custom: { accent: 'ink', capKind: 'per_day', capCount: 1, allowedDays: null, discountPct: null },
};

export const TEMPLATE_ICON: Record<PassTemplate, DxIconName> = {
  daily: 'passDaily',
  bundle: 'passBundle',
  vip: 'campaigns',
  weekend: 'passSeasonal',
  custom: 'plus',
};

/**
 * The prices the template tiles quote as an *example*, in grosz — v3's own
 * Kraków figures. They describe what a template is for, not anything this venue
 * charges, and they reach the page through `useMoney` like every other amount,
 * so a reader in pounds is quoted pounds.
 */
export const TEMPLATE_EXAMPLE_PLN_MINOR: Record<PassTemplate, number | null> = {
  daily: 4900,
  bundle: 7900,
  vip: 3500,
  weekend: 2900,
  custom: null,
};

export const ACCENTS: readonly PassAccent[] = ['teal', 'deep_green', 'purple', 'terracotta', 'ink'];

/** Months per billing period — the server's `MONTHS`. */
export const PERIOD_MONTHS: Record<BillingPeriod, number> = { monthly: 1, quarterly: 3, annual: 12 };

/* ─────────────────────────────────────────────────────────────── phrases ── */

type RuleFields = Pick<Pass, 'benefitItem' | 'discountPct' | 'capKind' | 'capCount' | 'allowedDays'>;

export function benefitPhrase(copy: PassCopy, pass: RuleFields): string {
  const parts: string[] = [];
  if (pass.benefitItem) parts.push(pass.benefitItem);
  if (pass.discountPct) parts.push(fill(copy.rule.discount, { pct: String(pass.discountPct) }));
  return parts.join(' + ') || copy.rule.anyBenefit;
}

export function capPhrase(copy: PassCopy, pass: Pick<Pass, 'capKind' | 'capCount'>): string {
  const n = String(pass.capCount);
  switch (pass.capKind) {
    case 'per_day':
      return pass.capCount > 1 ? fill(copy.rule.perDayN, { n }) : copy.rule.perDay;
    case 'per_week':
      return fill(copy.rule.perWeek, { n });
    case 'per_month':
      return fill(copy.rule.perMonth, { n });
    default:
      return copy.rule.unlimited;
  }
}

export function daysPhrase(copy: PassCopy, days: number[] | null): string {
  if (!days || days.length === 0 || days.length === 7) return copy.rule.anyDay;
  if (days.length === 2 && days.includes(5) && days.includes(6)) return copy.rule.weekends;
  return days.map((d) => copy.drawer.dayNames[d] ?? '').join(', ');
}

/** v3's one-line rule: "Any filter coffee · once a day · any day". */
export function rulePhrase(copy: PassCopy, pass: RuleFields): string {
  return [benefitPhrase(copy, pass), capPhrase(copy, pass), daysPhrase(copy, pass.allowedDays)].join(' · ');
}

/* ───────────────────────────────────────────────────────────── publishing ── */

/** `missingOf` on the server — what publishing would refuse, in its order. */
export function missingFor(
  pass: Pick<Pass, 'name' | 'benefitItem' | 'discountPct' | 'priceMinor' | 'capKind' | 'unlimitedOk'>,
): PassMissing[] {
  const missing: PassMissing[] = [];
  if (!pass.name.trim()) missing.push('name');
  if (!pass.benefitItem?.trim() && pass.discountPct === null) missing.push('benefit');
  if (pass.priceMinor <= 0) missing.push('price');
  if (pass.capKind === 'unlimited' && pass.benefitItem?.trim() && !pass.unlimitedOk) missing.push('unlimitedOk');
  return missing;
}

/** The server's `missing` list as a phrase: "a name, a price". */
export function missingPhrase(copy: PassCopy, missing: readonly string[]): string {
  return missing
    .map((key) => (copy.missing as Record<string, string | undefined>)[key])
    .filter((word): word is string => word !== undefined)
    .join(', ');
}

/**
 * Why an upsell estimate is absent, in words — or `undefined` when the figure
 * exists. A reason the copy has no entry for falls back to the generic one,
 * never to its own key (the "a lookup that misses must not fall through" rule).
 */
export function upsellReason(copy: PassCopy, upsell: PassUpsell): string | undefined {
  if (upsell.minor !== null) return undefined;
  const reasons = copy.upsellWhy as Record<string, string | undefined>;
  return (upsell.reason && reasons[upsell.reason]) || reasons.unknown;
}

/* ──────────────────────────────────────────────────────────────── writing ── */

/** What a write with no venue to write to fails with — the shell's no-session state. */
export const NO_VENUE = () => noSession('This device has no partner session on the API.');

/**
 * A refusal, in the reader's words where the server named the gate and in the
 * server's own words otherwise. Publishing has three gates worth naming — the
 * pass is incomplete (`missing`), the venue is unverified, the plan does not
 * sell passes — and a generic "refused" would name none of them.
 */
export function refusalText(dashboard: Dictionary['dashboard'], cause: unknown): string {
  const copy = dashboard.passes;
  if (cause instanceof ApiError) {
    if (cause.status === 0 && !isNoSession(cause)) return dashboard.acts.offline;
    if (cause.status === 401 || isNoSession(cause)) return dashboard.unmeasured.noSession;
    const missing = cause.detail.missing;
    if (cause.code === 'validation_failed' && Array.isArray(missing) && missing.length) {
      const what = missingPhrase(copy, missing.map(String));
      if (what) return fill(copy.refusals.missing, { what });
    }
    if (cause.code === 'not_verified') return copy.refusals.notVerified;
    if (cause.code === 'entitlement_required') return copy.refusals.entitlement;
  }
  return fill(dashboard.acts.refused, { why: cause instanceof Error ? cause.message : String(cause) });
}

/**
 * A write, its two endings, and the re-read after it — the dashboard's
 * `useAction` shape: the pressed control is the one that locks, a failure is
 * named by kind, and success re-reads rather than patching a row in place.
 * `run` resolves to whether the write went through, so a drawer knows to close.
 */
export function usePassWrite(onDone: () => void) {
  const dashboard = useCopy().dashboard;
  const { toast } = useDashboard();
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(
    async (key: string, done: string, work: () => Promise<unknown>): Promise<boolean> => {
      setBusy((current) => current ?? key);
      try {
        await work();
        toast(done);
        onDone();
        return true;
      } catch (cause) {
        toast(refusalText(dashboard, cause));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [dashboard, onDone, toast],
  );

  return { busy, run };
}

/* ─────────────────────────────────────────────────────────────── the plan ── */

interface VenuePlanRead {
  plan: { code: string; name: string };
  entitlements: Record<string, string>;
}

/**
 * Whether this venue's plan sells passes, and the plan's name.
 *
 * `undefined` while unknown — loading, or the server did not answer — and the
 * screen then claims nothing either way: no "Included in" pill and no lock.
 * Locking a paying venue out because one read failed is the error worth
 * avoiding (`AuthValue.plan`'s rule); the server still refuses a create the
 * plan does not cover, and that refusal is printed.
 */
export function usePassEntitlement(venueId: string | null): { allowed: boolean; plan: string } | undefined {
  const path = venueId !== null && hasToken() ? `/v1/partner/venues/${encodeURIComponent(venueId)}/subscription` : null;
  const result = useApi<VenuePlanRead>(path);
  const state = useMemo(
    () =>
      path === null
        ? { status: 'error' as const, error: noSession('This device has no partner session on the API.') }
        : result.state,
    [path, result.state],
  );
  const plan = readyOr(state, DEMO_MODE ? DEMO_VENUE_PLAN : null);
  if (!plan) return undefined;
  return { allowed: plan.entitlements.passes === 'true', plan: plan.plan.name };
}
