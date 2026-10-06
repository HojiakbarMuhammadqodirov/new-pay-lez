import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useCopy, useLanguage } from './i18n/context';
import { fill } from './i18n/currency';
import { metricValue } from './partnerMetrics';
import { isNoSession, type Metric, type RemindStatus } from './api/partner';
import type { ApiError } from './api/client';
import type { ApiState } from './api/useApi';
import { useNum } from './dashboardFormat';
import { useDashboard } from './dashboardShell';
import { DASH_SCREENS, type DashScreenId } from './content';
import { Card, EmptyState } from './dashboardKit';

/** Every screen but the profile has an empty state; the profile is a form. */
export type EmptyId = Exclude<DashScreenId, 'profile'>;
import { DEMO_MODE } from './demoMode';

/**
 * The vocabulary every dashboard screen shares, and nothing else.
 *
 * Each screen lives in its own module (`dashboardRegistry.tsx` maps the ids);
 * what stays here is the three things more than one of them draws: `Screen`,
 * which folds an `ApiState` into its three states, `Figure`, the one place a
 * withheld metric becomes text, and `RemindNotes`.
 *
 * ── three states, and one of them is not a number ─────────────────────────
 *
 * Every screen resolves an `ApiState` — `loading | ready | error` — and renders
 * one of three things:
 *
 *  - **ready** → the measured figures, from `api/partner.ts`.
 *  - **loading** → "still asking". Not a skeleton full of zeros.
 *  - **error** → a panel that says *what would put a number here*, and, when the
 *    reason is that this device has no partner session at all, says that too.
 *
 * **A failed request is never a zero.** The whole reason `useApi` returns a
 * discriminated union rather than `{ data, error, loading }` is that "we could
 * not ask" and "we asked and the answer is nothing" are opposite findings, and
 * a venue owner acts differently on each. Anything below that writes `?? 0` on
 * a metric has undone the rewrite.
 */

/* ─────────────────────────────────────────────────────────────── shared ── */

/**
 * A metric that may have been withheld.
 *
 * The single place a `Metric` becomes text, so there is one opinion about what
 * `suppressed` looks like. It is **not** a zero and not a blank: a blank reads
 * as a rendering bug, and a zero reads as a finding.
 */
export function Figure({ metric, format }: { metric: Metric | undefined; format?: (n: number) => string }) {
  const dashboard = useCopy().dashboard;
  const value = metricValue(metric);
  if (value === null) {
    return (
      <b className="dx-withheld" title={dashboard.unmeasured.withheld}>
        —
      </b>
    );
  }
  return <b>{format ? format(value) : String(value)}</b>;
}

/**
 * The screens whose empty state has something to press, and what it opens.
 *
 * Three of the eight, and the button is **absent** on the other five. Where the
 * next step is not a press — the Customers and Scan screens fill in when a QR
 * code goes on a counter, which is a thing that happens in a café — the panel
 * says what to do and offers nothing to click, which is the true shape of it.
 *
 * The register is one of the five, and for a third reason: what would fill it
 * is a customer buying a voucher, and the press that makes that possible is on
 * the ladder screen before it rather than in a drawer.
 */
const EMPTY_ACTION: Partial<Record<DashScreenId, 'deal' | 'campaign'>> = {
  overview: 'deal',
  deals: 'deal',
  campaigns: 'campaign',
};

/**
 * The panel an owner sees when there is nothing measured.
 *
 * Deliberately not a blank card: `copy.dashboard.empty` is one entry per
 * screen — a title, what this screen is for, and the single action that would
 * start filling it. The second paragraph is the *reason*, and it distinguishes
 * "this device has no session" from "the server did not answer", because an
 * owner about to conclude that nobody has visited them needs to know it is
 * neither.
 */
function Unmeasured({ id, error }: { id: EmptyId; error?: ApiError }) {
  const dashboard = useCopy().dashboard;
  const { openDrawer } = useDashboard();
  const copy = dashboard.empty[id];
  const opens = EMPTY_ACTION[id];

  const reason = error === undefined
    ? null
    : isNoSession(error)
      ? dashboard.unmeasured.noSession
      : dashboard.unmeasured.serverSilent;

  return (
    <EmptyState
      icon={DASH_SCREENS.find((entry) => entry.id === id)?.icon}
      title={copy.title}
      body={
        <>
          {copy.body}
          {reason && (
            <>
              <br />
              {reason}
            </>
          )}
        </>
      }
      action={opens ? { label: copy.action, onClick: () => openDrawer(opens) } : undefined}
    />
  );
}

/** In flight. One line, and never a zero standing in for an answer. */
function Asking() {
  const dashboard = useCopy().dashboard;

  return (
    <Card>
      <p className="dx-fine">{dashboard.unmeasured.asking}</p>
    </Card>
  );
}

/**
 * A screen, folded over its state.
 *
 * Every screen below is `<Screen state={…} index={…}>{(data) => …}</Screen>`,
 * which means the "we could not ask" branch is written once. A screen added
 * later cannot forget it and quietly render zeros.
 */
export function Screen<T>({
  state,
  id,
  demo,
  children,
}: {
  state: ApiState<T>;
  /** Which screen this is — picks its entry in `copy.dashboard.empty`. */
  id: EmptyId;
  /*
   * What to draw instead of "we could not ask", in demo mode only.
   *
   * Three conditions, and each is part of the safety of it: the real call is
   * made and allowed to fail first, so a venue with a listing whose report
   * loads never reaches this; the failure has to be *no session* — a real
   * venue's 500 is the honest error panel, even in a browser that once opened
   * the demo; and `DEMO_MODE` is off unless this browser was sent `?demo=1`.
   */
  demo?: T;
  children: (data: T) => ReactNode;
}) {
  if (state.status === 'loading') return <Asking />;
  if (state.status === 'error') {
    if (DEMO_MODE && demo !== undefined && isNoSession(state.error)) return <>{children(demo)}</>;
    return <Unmeasured id={id} error={state.error} />;
  }
  return <>{children(state.data)}</>;
}

/**
 * Localised dates, from `Intl`.
 *
 * `Intl` is deliberately not used for *numbers* on this site — `currency.ts`
 * says why — and none of that applies to a date.
 */
function useDates() {
  const [language] = useLanguage();
  return useMemo(() => {
    const short = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' });
    const long = new Intl.DateTimeFormat(language, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    });
    const day = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long' });
    /* Parsed as UTC midnight rather than local: `new Date('2026-09-11T00:00:00')`
       is local, and lands on a different day for anybody west of Greenwich.
       Pinning the suffix keeps a label on the day the server filed it under. */
    const at = (iso: string) => new Date(`${iso}T00:00:00Z`);
    return {
      tick: (iso: string) => short.format(at(iso)),
      full: (iso: string) => long.format(at(iso)),
      /** An instant, as the day it falls on in the reader's zone. */
      instant: (iso: string) => day.format(new Date(iso)),
    };
  }, [language]);
}

/* ───────────────────────────────────────────────────────────── reminders ── */

/** Whether a reminder is still inside the week the server makes owners wait. */
const remindWaiting = (remind: RemindStatus) =>
  remind.nextAllowedAt !== null && Date.parse(remind.nextAllowedAt) > Date.now();

/**
 * What the last reminder did, and when the next may go — the two facts the
 * server returns beside the audience, as sentences under the button's panel.
 * Nothing at all when there is neither, rather than an empty paragraph.
 */
export function RemindNotes({ remind, className }: { remind: RemindStatus | null; className?: string }) {
  const campaigns = useCopy().dashboard.campaigns;
  const num = useNum();
  const dates = useDates();
  if (remind === null) return null;

  const lines: string[] = [];
  if (remind.lastResult) {
    lines.push(
      fill(campaigns.remindResult, {
        back: num(remind.lastResult.cameBack),
        of: num(remind.lastResult.audience),
      }),
    );
  }
  if (remind.nextAllowedAt !== null && remindWaiting(remind)) {
    lines.push(fill(campaigns.remindNext, { date: dates.instant(remind.nextAllowedAt) }));
  }
  if (lines.length === 0) return null;

  return (
    <>
      {lines.map((line) => (
        <p className={className ?? 'dx-fine'} key={line}>
          {line}
        </p>
      ))}
    </>
  );
}

/* The Overview and its row actions moved to `dashboardOverview.tsx` with the v3 rebuild. */

/* Hot deals moved to `dashboardDeals.tsx` with the v3 rebuild. */

/* Scan activity lives in `dashboardScans.tsx` — the v3 rebuild moved its frame
   there beside the till log and the counter tool it holds. */
