import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useCopy, useLanguage, useMoney } from './i18n/context';
import { fill } from './i18n/currency';
import {
  PD_RANGES,
  campaignFromApi,
  campaignModel,
  dealFromApi,
  deltaOf,
  metricValue,
  reachFromApi,
  totalsFrom,
  type Delta,
  type PartnerDeal,
} from './partnerMetrics';
import {
  chain,
  extendDeal,
  isNoSession,
  minorToEuro,
  publishDeal,
  readyOr,
  scheduleDealPush,
  sendReminder,
  setCampaignStatus,
  setDealStatus,
  usePartnerAnalytics,
  usePartnerCampaigns,
  usePartnerDeals,
  usePartnerInsights,
  usePartnerOverview,
  usePartnerPushQuota,
  usePartnerRemind,
  usePartnerSeries,
  usePartnerToday,
  usePartnerVenue,
  venueInstant,
  type InsightsResponse,
  type Metric,
  type PartnerVenue,
  type PushQuotaResponse,
  type RemindStatus,
  type SeriesDay,
  type SeriesTotals,
} from './api/partner';
import { useReach } from './api/reach';
import { ApiError } from './api/client';
import type { ApiState } from './api/useApi';
import { useMonthName, useNum } from './dashboardFormat';
import { IssuedVouchers } from './dashboardVoucherList';
import { Vouchers as VouchersScreen } from './dashboardVouchers';
import { Customers as CustomersScreen } from './dashboardCustomers';
import { Campaigns as CampaignsScreen } from './dashboardLoyalty';
import { Counter, ScanLog } from './dashboardScans';
import { Icon } from './icons';
import { AnalyticsChart } from './dashboardChart';
import { Assistant } from './dashboardAssistant';
import { useDashboard } from './dashboardShell';
import { PD_SEED, SEED_REPEAT, sparkPath } from './dashboardSeed';
import { DEMO_MODE } from './demoMode';
import {
  DEMO_ANALYTICS,
  DEMO_CAMPAIGNS,
  DEMO_DEALS,
  DEMO_INSIGHTS,
  DEMO_OVERVIEW,
  DEMO_QUOTA,
  DEMO_REACH,
  DEMO_REMIND,
  DEMO_TODAY,
  DEMO_VENUE,
  demoSeries,
} from './dashboardDemo';

/**
 * The dashboard screens that are not the assistant, the profile form, or one
 * of the four that live in their own files.
 *
 * This was `b2b/Paylez Partner Dashboard v2.dc.html` rebuilt: the same panels
 * in the same order, filled with that file's own seeds run through that file's
 * own arithmetic. **Every one of those figures is gone.** What fills the panels
 * now is either a row the server counted or a sentence saying nobody has
 * counted anything yet — and since the series, insights, reminder, scan and
 * audience endpoints landed, the second kind is down to the genuinely
 * unmeasurable ("money returned", a customer's global balance).
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
 *
 * ── the live venue, and the demo one ──────────────────────────────────────
 *
 * Each screen reads the venue row once and keeps two names for it. `liveVenue`
 * is what the server said and is the only id a request is ever addressed to;
 * `venue` falls back to `DEMO_VENUE` under `?demo=1` and is used for what the
 * screen *draws* — its currency, its clock. Addressing requests to the demo id
 * fired a round of 401s at the API on every demo screen, which is noise in
 * somebody's server log and a request that could never have been answered.
 *
 * ── and they write, which changes what "honest" costs ────────────────────
 *
 * A deal is published, paused, extended, taken down or given its one
 * notification; a campaign is paused, ended or edited; a reminder goes out; a
 * visit is recorded at the counter. `useAction` below is the one place a write,
 * its two endings and the reload after it are written down — a screen that
 * invented its own would eventually forget one of the three.
 *
 * The rule that governed the read side governs this one too, pointed the other
 * way: **a press that could not reach the server must not look like a press
 * that worked.** Every ending is a sentence, the failed one names why, and the
 * list is re-read from the server afterwards rather than patched locally.
 *
 * Charts are divs and inline SVG paths, as everywhere else on this site.
 */

type DashboardCopy = ReturnType<typeof useCopy>['dashboard'];

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
      <b className="pd-withheld" title={dashboard.unmeasured.withheld}>
        —
      </b>
    );
  }
  return <b>{format ? format(value) : String(value)}</b>;
}

/**
 * The sentence for a write that did not land.
 *
 * Three kinds, with three fixes: the server is not there (try again), this
 * device is not signed in any more (sign in — a 401 is never "the server
 * refused this deal"), or the server looked and refused, in its own words.
 */
function refusalText(cause: unknown, dashboard: DashboardCopy): string {
  if (cause instanceof ApiError && cause.status === 0) return dashboard.acts.offline;
  if (cause instanceof ApiError && cause.status === 401) return dashboard.unmeasured.noSession;
  return fill(dashboard.acts.refused, {
    why: cause instanceof Error ? cause.message : String(cause),
  });
}

/** What a panel says in place of a figure it could not read. */
function stateNote(state: ApiState<unknown>, dashboard: DashboardCopy): string {
  if (state.status === 'loading') return dashboard.unmeasured.asking;
  if (state.status === 'error') {
    return isNoSession(state.error) ? dashboard.unmeasured.noSession : dashboard.unmeasured.serverSilent;
  }
  return '';
}

/**
 * A write, its two endings, and the re-read after it.
 *
 * One hook rather than a `try/catch` at each of the call sites, and the three
 * things it owns are the three that are easy to forget one of:
 *
 * - **A press is locked while it is in flight.** `busy` is the key of the
 *   control that is working, not a boolean, so the row that was pressed is the
 *   row that shows it.
 * - **A failure is named, and named by kind** — see `refusalText`.
 * - **Success re-reads rather than patches.** What a deal's status *became* is
 *   the server's answer, not this screen's guess: extending an expired deal
 *   also revives it, publishing may land on `scheduled` rather than `live`.
 */
function useAction(reload: () => void) {
  const dashboard = useCopy().dashboard;
  const { toast } = useDashboard();
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(
    async (key: string, done: string, work: () => Promise<unknown>) => {
      setBusy((current) => current ?? key);
      try {
        await work();
        toast(done);
        reload();
      } catch (cause) {
        toast(refusalText(cause, dashboard));
      } finally {
        setBusy(null);
      }
    },
    [dashboard, reload, toast],
  );

  return { busy, run };
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
const EMPTY_ACTION: Record<number, 'deal' | 'campaign'> = {
  0: 'deal',
  1: 'deal',
  2: 'campaign',
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
function Unmeasured({ index, error }: { index: number; error?: ApiError }) {
  const dashboard = useCopy().dashboard;
  const { openDrawer } = useDashboard();
  const copy = dashboard.empty[index];
  const opens = EMPTY_ACTION[index];

  const reason = error === undefined
    ? null
    : isNoSession(error)
      ? dashboard.unmeasured.noSession
      : dashboard.unmeasured.serverSilent;

  return (
    <div className="pd-glass pd-panel pd-empty" data-reveal>
      <h3>{copy.title}</h3>
      <p className="pd-fine">{copy.body}</p>
      {reason && <p className="pd-fine">{reason}</p>}
      {opens && (
        <button type="button" className="btn btn-solid" onClick={() => openDrawer(opens)}>
          {copy.action}
        </button>
      )}
    </div>
  );
}

/** In flight. One line, and never a zero standing in for an answer. */
function Asking() {
  const dashboard = useCopy().dashboard;

  return (
    <div className="pd-glass pd-panel pd-empty" data-reveal>
      <p className="pd-fine">{dashboard.unmeasured.asking}</p>
    </div>
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
  index,
  demo,
  children,
}: {
  state: ApiState<T>;
  index: number;
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
  if (state.status === 'loading') return <div className="pd-stack"><Asking /></div>;
  if (state.status === 'error') {
    if (DEMO_MODE && demo !== undefined && isNoSession(state.error)) return <>{children(demo)}</>;
    return (
      <div className="pd-stack">
        <Unmeasured index={index} error={state.error} />
      </div>
    );
  }
  return <>{children(state.data)}</>;
}

/** A panel whose question could not be answered. Says why, and stops. */
function NoSource({ title, detail }: { title: string; detail?: string }) {
  const dashboard = useCopy().dashboard;

  return (
    <div className="pd-glass pd-panel" data-reveal>
      <div className="pd-panel-head">
        <span className="console-label">{title}</span>
      </div>
      <p className="pd-fine">{detail ?? dashboard.unmeasured.noSource}</p>
    </div>
  );
}

/**
 * A chip marking a panel whose figures are the reference design's rather than
 * the venue's. Drawn *inside* the panel head, because a label somewhere else on
 * the page does not travel with the figure it qualifies.
 */
function SampleTag() {
  const dashboard = useCopy().dashboard;
  return <span className="pd-chip" data-sample="true">{dashboard.unmeasured.sample}</span>;
}

/**
 * The deals table's sortable columns, in the order the reference design draws
 * them. `key: null` is a column there is nothing sensible to sort by — the
 * sparkline, whose order *is* the sort you would ask it for.
 *
 * Index-aligned with `copy.dashboard.deals.columns`, which is where the labels
 * live: this table is structure, and the eight words are translated.
 */
type DealSort = 'name' | 'state' | 'seen' | 'opened' | 'claimed' | 'rate' | 'cost';

const DEAL_COLUMNS: { key: DealSort | null; align: 'left' | 'right'; width: string }[] = [
  { key: 'name', align: 'left', width: '24%' },
  { key: 'state', align: 'left', width: '8%' },
  { key: 'seen', align: 'right', width: '6%' },
  { key: 'opened', align: 'right', width: '7%' },
  { key: 'claimed', align: 'right', width: '11%' },
  { key: 'rate', align: 'right', width: '10%' },
  { key: 'cost', align: 'right', width: '8%' },
  { key: null, align: 'left', width: '10%' },
];

/* The last column is not in the table above because it has no label of its own
   and nothing to sort by — but it still needs a width, or `table-layout: fixed`
   gives it whatever is left and the two buttons in it overflow across the cost
   cells. */
const DEAL_ACTS_WIDTH = '17%';

/**
 * Claims as a share of the people who *saw* the deal, in percent — the column
 * an owner reads asks how much of the audience the offer converted, which is
 * claims over impressions.
 */
const claimRate = (deal: PartnerDeal) =>
  deal.seen === 0 ? 0 : (deal.claimed / deal.seen) * 100;

/** The dates a deal runs between, as one short line, or null when it has none. */
function dealWindow(deal: PartnerDeal): string | null {
  if (!deal.from && !deal.to) return null;
  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
      : '';
  const from = fmt(deal.from);
  const to = fmt(deal.to);
  if (from && to) return `${from} – ${to}`;
  return from || to || null;
}

/** The mock's 76 × 30 sparkline, in whichever of the two inks it is handed. */
function Spark({ values, ink }: { values: number[]; ink: 'accent' | 'text' }) {
  const path = sparkPath(values);
  if (!path) return null;
  return (
    <svg className="pd-spark" viewBox="0 0 76 30" role="presentation" data-ink={ink}>
      <path d={path.area} className="pd-spark-fill" />
      <path d={path.line} className="pd-spark-line" />
    </svg>
  );
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
 * "Remind {n} customers" → "Reminded".
 *
 * ── it sends now, and the state is the server's ───────────────────────────
 *
 * `POST …/remind` sends one notification per person holding an unused reward
 * or voucher, through the same frequency cap and quiet hours as every other
 * push. The server allows one a week and says when the next may go, so the
 * "Reminded" face is `nextAllowedAt` being in the future — read from
 * `GET …/remind` — rather than a flag this component set. A reload, a second
 * tab and the phone all agree, which a local `sent` state never could.
 *
 * ── and it is not drawn when there is nothing behind it ───────────────────
 *
 * No status (the request failed, or this device has no session) is no button:
 * a control that could only fail is a picture of one. Nobody to remind is no
 * button either — the server would refuse, and the count on the label would be
 * a zero. Both labels stay in the DOM and cross-fade, so the box does not jump
 * to the other word's width mid-press.
 */
export function RemindButton({
  venueId,
  remind,
  reload,
  className,
}: {
  /** The live venue's id. `null` under the demo, where a press says why it cannot. */
  venueId: string | null;
  remind: RemindStatus | null;
  reload: () => void;
  className?: string;
}) {
  const dashboard = useCopy().dashboard;
  const num = useNum();
  const dates = useDates();
  const { toast } = useDashboard();
  const [busy, setBusy] = useState(false);

  if (remind === null) return null;
  const waiting = remindWaiting(remind);
  if (!waiting && remind.audience === 0) return null;

  const press = async () => {
    if (busy || waiting) return;
    if (venueId === null) {
      toast(dashboard.unmeasured.noSession);
      return;
    }
    setBusy(true);
    try {
      const sent = await sendReminder(venueId);
      toast(
        fill(dashboard.campaigns.remindSent, {
          n: num(sent.audience),
          queued: num(sent.queued),
        }),
      );
      reload();
    } catch (cause) {
      /* The two refusals that are about the week and the audience have their own
         sentences, and both re-read the status so the button stops offering a
         press the server has just turned down. */
      if (cause instanceof ApiError && cause.code === 'conflict') {
        const next = cause.detail.nextAllowedAt;
        toast(
          typeof next === 'string'
            ? fill(dashboard.campaigns.remindTooSoon, { date: dates.instant(next) })
            : refusalText(cause, dashboard),
        );
        reload();
      } else if (cause instanceof ApiError && cause.code === 'invalid_state') {
        toast(dashboard.campaigns.remindNobody);
        reload();
      } else {
        toast(refusalText(cause, dashboard));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`btn pd-remind${className ? ` ${className}` : ''}`}
      data-sent={waiting ? 'true' : undefined}
      aria-busy={busy || undefined}
      disabled={waiting || busy}
      onClick={() => void press()}
    >
      <span className="pd-remind-face" aria-hidden={waiting ? 'true' : undefined}>
        <Icon name="bell" size={15} />
        {fill(dashboard.campaigns.remindLabel, { n: num(remind.audience) })}
      </span>
      <span className="pd-remind-face" data-done="true" aria-hidden={waiting ? undefined : 'true'}>
        <Icon name="check" size={15} strokeWidth={2.6} />
        {dashboard.overview.reminded}
      </span>
    </button>
  );
}

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
        <p className={className ?? 'pd-fine pd-remind-note'} key={line}>
          {line}
        </p>
      ))}
    </>
  );
}

/* ─────────────────────────────────────────────────────── running right now ── */

/**
 * Edit, Pause or Resume, End — on every row of "Running right now".
 *
 * All three write now. Edit opens the one create panel on this row (a deal by
 * `dealId`, a campaign in edit mode by `campaignId`); Pause and Resume are the
 * same status calls the Deals and Campaigns screens make; End archives a deal or
 * ends a campaign — both keep their history, which is why the word is "End it"
 * and not "Delete": nothing on this dashboard removes a row, and a button that
 * promised to would describe something that does not happen.
 *
 * ── the red, and why it is allowed here ───────────────────────────────────
 *
 * This repository has one accent on one ground, and the standing consequence
 * is that a destructive control asks in words. It still does — the first press
 * turns the label into a question and only the second ends anything, and
 * leaving the button disarms it. The scoped red is there because this row
 * carries *three* controls, and the thing a hand needs to know before it moves
 * is which of the three not to hit.
 */
function RowActs({
  kind,
  id,
  live,
  reload,
}: {
  kind: 'deal' | 'campaign';
  id: string;
  live: boolean;
  reload: () => void;
}) {
  const acts = useCopy().dashboard.acts;
  const { openDrawer } = useDashboard();
  const { busy, run } = useAction(reload);
  const [sure, setSure] = useState(false);
  const working = busy !== null;

  return (
    <div className="pd-row-acts">
      <button
        type="button"
        className="btn btn-solid"
        disabled={working}
        onClick={() =>
          kind === 'deal' ? openDrawer('deal', id) : openDrawer('campaign', undefined, undefined, id)
        }
      >
        {acts.edit}
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={working}
        onClick={() =>
          void run('status', live ? acts.paused : acts.resumed, () =>
            kind === 'deal'
              ? setDealStatus(id, live ? 'paused' : 'live')
              : setCampaignStatus(id, live ? 'paused' : 'active'),
          )
        }
      >
        {live ? acts.pause : acts.resume}
      </button>
      <button
        type="button"
        className="btn btn-ghost pd-danger"
        disabled={working}
        aria-pressed={sure}
        onBlur={() => setSure(false)}
        onClick={() => {
          if (!sure) {
            setSure(true);
            return;
          }
          setSure(false);
          void run('end', acts.ended, () =>
            kind === 'deal' ? setDealStatus(id, 'archived') : setCampaignStatus(id, 'ended'),
          );
        }}
      >
        {sure ? acts.endSure : acts.end}
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── findings ── */

/**
 * The finding about offers, as one sentence — or `null` when there is no honest
 * one to say.
 *
 * The server sends the multiple one way round (item over percent). When the
 * percentage discount is the one that wins, the sentence turns round too and its
 * multiple is recomputed from the four counts rather than inverted from a figure
 * already rounded to one decimal. An item side with no claims at all has no
 * sentence: "your best percentage discount gets ∞× the claims" is arithmetic,
 * not a finding.
 */
function itemSentence(
  finding: NonNullable<InsightsResponse['itemVsPercent']>,
  copy: DashboardCopy['overview']['insights'],
): string | null {
  const itemRate = finding.item.seen > 0 ? finding.item.claims / finding.item.seen : 0;
  const pctRate = finding.percent.seen > 0 ? finding.percent.claims / finding.percent.seen : 0;
  if (itemRate <= 0 || pctRate <= 0) return null;

  const itemOver = itemRate / pctRate;
  if (Math.round(itemOver * 10) / 10 >= 1.1) {
    return fill(copy.itemText, { multiple: (Math.round(itemOver * 10) / 10).toFixed(1) });
  }
  const pctOver = pctRate / itemRate;
  if (Math.round(pctOver * 10) / 10 >= 1.1) {
    return fill(copy.percentText, { multiple: (Math.round(pctOver * 10) / 10).toFixed(1) });
  }
  return copy.sameText;
}

interface NoticeRow {
  key: string;
  lead: string;
  detail: string | null;
  action: ReactNode;
}

/* ───────────────────────────────────────────────────────────── overview ── */

/** The four tiles, in the mock's order, and what each reads off the series. */
const TILES: Array<{
  pick: (totals: SeriesTotals) => number;
  day: (day: SeriesDay) => number;
  ink: 'accent' | 'text';
}> = [
  { pick: (t) => t.visits, day: (d) => d.visits, ink: 'accent' },
  { pick: (t) => t.claims, day: (d) => d.claims, ink: 'accent' },
  { pick: (t) => t.vouchersRedeemed, day: (d) => d.vouchersRedeemed, ink: 'text' },
  { pick: (t) => t.rewardsRedeemed, day: (d) => d.rewardsRedeemed, ink: 'text' },
];

function Overview() {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.overview;
  const money = useMoney();
  const num = useNum();
  const dates = useDates();
  const monthName = useMonthName();
  /* The assistant and the other screens are screens on this frame rather than
     routes, so a finding's press moves the rail rather than navigating. */
  const { goTo, range } = useDashboard();

  const venueApi = usePartnerVenue();
  const liveVenue = venueApi.state.status === 'ready' ? venueApi.state.data : null;
  const venue = liveVenue ?? (DEMO_MODE ? DEMO_VENUE : null);
  const venueId = liveVenue?.id ?? null;

  const overviewApi = usePartnerOverview(venueId);
  const analyticsApi = usePartnerAnalytics(venueId);
  const dealsApi = usePartnerDeals(venueId);
  const campaignsApi = usePartnerCampaigns(venueId);
  const reachApi = useReach(venueId);
  /* The one report here keyed on the range picker: a rolling window of days is
     the series' own unit, so the picker finally moves something it names. */
  const seriesApi = usePartnerSeries(venueId, range);
  const insightsApi = usePartnerInsights(venueId);
  const remindApi = usePartnerRemind(venueId);

  const state = chain(venueApi, overviewApi);

  /* Each of these is its own request and its own state, with the demo stand-in
     stated where it is read — and `readyOr` is the same rule everywhere: the
     real answer wins, and the demonstration data is reached only when there was
     no session to ask with, and only under `?demo=1`. */
  const reachRaw = readyOr(reachApi.state, DEMO_MODE ? DEMO_REACH : null);
  const reach = reachRaw ? reachFromApi(reachRaw) : null;
  const reachPeriod = reachRaw?.period ?? null;
  const analytics = readyOr(analyticsApi.state, DEMO_MODE ? DEMO_ANALYTICS : null);
  const deals = readyOr(dealsApi.state, DEMO_MODE ? DEMO_DEALS : null);
  const campaigns = readyOr(campaignsApi.state, DEMO_MODE ? DEMO_CAMPAIGNS : null);
  const series = readyOr(seriesApi.state, DEMO_MODE ? demoSeries(range) : null);
  const insights = readyOr(insightsApi.state, DEMO_MODE ? DEMO_INSIGHTS : null);
  const remind = readyOr(remindApi.state, DEMO_MODE ? DEMO_REMIND : null);

  const rangeIndex = PD_RANGES.indexOf(range);

  return (
    <Screen state={state} index={0} demo={DEMO_OVERVIEW}>
      {(data) => {
        const toEuro = (minor: number) => minorToEuro(minor, data.budget.currency);
        /* The venue's *own* average transaction, from `budget.averageCheck` —
           the median of its own confirmed scans. */
        const avgSpend = toEuro(data.budget.averageCheck.minor);
        const redeemed = series?.totals.vouchersRedeemed ?? 0;
        const totals = totalsFrom(data.overview, reach?.claims ?? 0, redeemed, avgSpend);

        const loyalty = campaignModel(
          (campaigns ?? []).map((row) =>
            campaignFromApi(row, toEuro, venue?.scan_cooldown_hours ?? null),
          ),
          data.budget.loyalty,
        );

        /*
         * The vouchers still out, off the ladder's own count.
         *
         * Every rung has to report it for the sum to mean anything; a ladder
         * with no rungs has no vouchers, which is a real zero. An older API that
         * sends no `activeCount` gets the dash — the version before this printed
         * "0 vouchers" there on every venue, because it derived the count from
         * take-up fields nothing sent.
         */
        const vouchersHeld = data.budget.tiers.every((tier) => tier.activeCount !== undefined)
          ? data.budget.tiers.reduce((sum, tier) => sum + (tier.activeCount ?? 0), 0)
          : null;

        const liveDeals = (deals ?? [])
          .map((row) => dealFromApi(row, toEuro))
          .filter((deal) => deal.state === 'live');

        /* What the month cost, from the server's own four-way breakdown. */
        const cost = analytics?.costPerNewCustomer ?? null;
        const costRows = cost
          ? [
              toEuro(cost.breakdown.subscription),
              toEuro(cost.breakdown.loyalty),
              toEuro(cost.breakdown.vouchers),
              toEuro(cost.breakdown.deals),
            ]
          : null;
        const costTotal = cost ? toEuro(cost.spendMinor) : null;
        /* A ratio nobody has both terms for is null, not zero — and never
           "Paylez lost you money", which is what a 0 in this slot reads as. */
        const roi =
          costTotal !== null && costTotal > 0 ? totals.attributedMoney / costTotal : null;
        const month = monthName(data.overview.period);

        /*
         * "What we noticed", one row per finding that exists.
         *
         * The trend and the tier are one row when both are there, because the
         * reference design argues them as one story — visits up, the tier out of
         * reach — and two rows when only one is: a trend with no tier finding
         * has nothing to press but the assistant, and a tier finding with no
         * trend leads with its own sentence rather than borrowing a direction.
         */
        const ins = copy.insights;
        const rows: NoticeRow[] = [];
        if (insights) {
          const { trend, tierReach: tier, itemVsPercent, unusedRewards } = insights;
          if (trend || tier) {
            const direction = (pct: number, up: string, down: string, flat: string) =>
              pct > 0 ? fill(up, { pct: num(pct) }) : pct < 0 ? fill(down, { pct: num(-pct) }) : flat;
            const lead = trend
              ? [
                  direction(trend.visitsPct, ins.visitsUp, ins.visitsDown, ins.visitsFlat),
                  direction(trend.vouchersPct, ins.vouchersUp, ins.vouchersDown, ins.vouchersFlat),
                  trend.visitsPct > 0 && trend.vouchersPct < 0 ? ins.pulling : '',
                ]
                  .filter(Boolean)
                  .join(' ')
              : fill(ins.tierText, { pct: num(tier!.pct) });
            rows.push({
              key: 'trend',
              lead,
              detail: tier
                ? fill(ins.tierDetail, {
                    reached: num(tier.reached),
                    eligible: num(tier.eligible),
                    points: num(tier.points),
                    lower: num(tier.lower),
                    more: num(tier.more),
                  })
                : null,
              action: tier ? (
                <button type="button" className="btn btn-solid" onClick={() => goTo('vouchers')}>
                  {fill(ins.tierAction, { pct: num(tier.pct) })}
                </button>
              ) : null,
            });
          }
          const items = itemVsPercent ? itemSentence(itemVsPercent, ins) : null;
          if (itemVsPercent && items) {
            rows.push({
              key: 'items',
              lead: items,
              detail: fill(ins.itemDetail, {
                itemTitle: itemVsPercent.item.title || itemVsPercent.item.badge,
                itemBadge: itemVsPercent.item.badge,
                itemClaims: num(itemVsPercent.item.claims),
                itemSeen: num(itemVsPercent.item.seen),
                pctTitle: itemVsPercent.percent.title || itemVsPercent.percent.badge,
                pctBadge: itemVsPercent.percent.badge,
                pctClaims: num(itemVsPercent.percent.claims),
                pctSeen: num(itemVsPercent.percent.seen),
              }),
              action: (
                <button type="button" className="btn btn-solid" onClick={() => goTo('deals')}>
                  {ins.itemAction}
                </button>
              ),
            });
          }
          if (unusedRewards) {
            rows.push({
              key: 'unused',
              lead: fill(ins.unusedText, {
                n: num(unusedRewards.n),
                amount: money(toEuro(unusedRewards.amountMinor), 'exact'),
              }),
              detail: ins.unusedDetail,
              action: <RemindButton venueId={venueId} remind={remind} reload={remindApi.reload} />,
            });
          }
        }

        return (
          <div className="pd-stack">
            {/* The headline. Three claims at three strengths, in descending
                order of how much we can stand behind them: counted, estimated,
                and the subset we would defend. The server counts these over a
                calendar month, and the kicker names the month. */}
            <div className="pd-glass pd-hero" data-ink="paper" data-reveal>
              <div className="pd-hero-main">
                <span className="console-label pd-kicker">
                  {fill(copy.kicker, { range: month })}
                </span>

                <span className="pd-hero-eyebrow">{copy.countedLabel}</span>
                <p className="pd-counted">
                  <b>{num(totals.visits)}</b>
                  <span>{copy.counted}</span>
                </p>
                {/* The count goes in the accent, inside the sentence: splitting
                    the template on its own placeholder is what lets one
                    translated string carry a styled span. */}
                <p className="pd-fine pd-counted-new">
                  {data.overview.newCustomers.suppressed
                    ? dashboard.unmeasured.withheld
                    : (() => {
                        const [head = '', tail = ''] = copy.countedNew.split('{n}');
                        return (
                          <>
                            {head}
                            <b className="pd-counted-n">{num(totals.newCustomers)}</b>
                            {tail}
                          </>
                        );
                      })()}
                </p>

                <div className="pd-estimate">
                  <span className="pd-tag">{copy.estimateTag}</span>
                  <b>{fill(copy.estimate, { amount: money(totals.estimate, 'soft') })}</b>
                  <p className="pd-fine">
                    {fill(copy.estimateNote, { avg: money(avgSpend, 'unit') })}
                  </p>
                </div>

                <div className="pd-claim">
                  <span className="console-label">{copy.claimTitle}</span>
                  <b>
                    {fill(copy.claim, {
                      visits: num(totals.attributed),
                      amount: money(totals.attributedMoney, 'soft'),
                    })}
                  </b>
                  <p className="pd-fine">{copy.claimNote}</p>
                </div>
              </div>

              <div className="pd-support">
                <div>
                  <span className="pd-support-name">
                    <b>{copy.support[0].label}</b>
                    <i>{copy.support[0].note}</i>
                  </span>
                  <b>{num(totals.visits)}</b>
                </div>
                <div>
                  <span className="pd-support-name">
                    <b>{copy.support[1].label}</b>
                    <i>{copy.support[1].note}</i>
                  </span>
                  <b>{money(avgSpend, 'unit')}</b>
                </div>
                <div>
                  <span className="pd-support-name">
                    <b>{copy.support[2].label}</b>
                    <i>{copy.support[2].note}</i>
                  </span>
                  <Figure metric={data.overview.newCustomers} format={num} />
                </div>
              </div>
            </div>

            {/* What it cost, and the verdict — only when both halves are known. */}
            <div className="pd-glass pd-panel" data-reveal>
              <div className="pd-panel-head">
                <h2 className="pd-title">{copy.costTitle}</h2>
                <span className="pd-chip">{month}</span>
              </div>

              {costRows === null || costTotal === null ? (
                <p className="pd-fine">{stateNote(analyticsApi.state, dashboard) || dashboard.unmeasured.serverSilent}</p>
              ) : (
                <div className="pd-cost-grid">
                  <div className="pd-rows">
                    {copy.costRows.map((label, index) => (
                      <div key={label}>
                        <span>{label}</span>
                        <b>{money(costRows[index], 'exact')}</b>
                      </div>
                    ))}
                    <div data-total="true">
                      <span>{copy.costTotal}</span>
                      <b>{money(costTotal, 'exact')}</b>
                    </div>
                  </div>

                  <div className="pd-return">
                    <span>{copy.returnLabel}</span>
                    <b>{money(totals.attributedMoney, 'soft')}</b>
                    {roi !== null && (
                      <p className="pd-verdict" data-good={roi >= 1 ? 'true' : 'false'}>
                        {roi >= 1
                          ? fill(copy.roiGood, {
                              cost: money(costTotal, 'exact'),
                              month,
                              revenue: money(totals.attributedMoney, 'soft'),
                              n: roi.toFixed(1),
                            })
                          : fill(copy.roiBad, {
                              cost: money(costTotal, 'exact'),
                              month,
                              revenue: money(totals.attributedMoney, 'soft'),
                              gap: money(costTotal - totals.attributedMoney, 'exact'),
                            })}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/*
              Four counts over the picker's window, each against the same length
              of window before it.

              The values are `series.totals`, the sparklines are the days, and
              the delta is `totals` against `previous` — so all three move with
              the range picker together. A window whose previous figure was zero
              gets no percentage: "new" when something happened, and a plain
              sentence when nothing did either time.
            */}
            <div className="pd-tiles">
              {TILES.map((tile, index) => {
                const value = series ? tile.pick(series.totals) : null;
                const delta: Delta | null = series
                  ? deltaOf(tile.pick(series.totals), tile.pick(series.previous))
                  : null;
                return (
                  <div className="pd-glass pd-tile" data-reveal key={copy.tiles[index]}>
                    <span>{copy.tiles[index]}</span>
                    <div className="pd-tile-body">
                      <div>
                        {value === null ? (
                          <b className="pd-withheld" title={stateNote(seriesApi.state, dashboard)}>
                            —
                          </b>
                        ) : (
                          <b>{num(value)}</b>
                        )}
                        <span
                          className="pd-delta"
                          data-dir={
                            delta === null || delta.kind === 'none'
                              ? 'flat'
                              : delta.kind === 'new'
                                ? 'up'
                                : delta.kind
                          }
                        >
                          {delta !== null && (delta.kind === 'up' || delta.kind === 'down') && (
                            <em>
                              {delta.kind === 'up' ? '↑' : '↓'} {num(delta.pct)}%
                            </em>
                          )}
                          {delta?.kind === 'flat' && <em>±0%</em>}
                          {delta?.kind === 'new' && <em>{copy.deltaNew}</em>}
                          <i>
                            {delta === null
                              ? rangeIndex >= 0
                                ? dashboard.rangeLabels[rangeIndex]
                                : ''
                              : delta.kind === 'none'
                                ? copy.quietBoth
                                : delta.kind === 'new'
                                  ? copy.sinceNone
                                  : copy.since}
                          </i>
                        </span>
                      </div>
                      {series && (
                        <Spark values={series.series.map(tile.day)} ink={tile.ink} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/*
              The one claim on this screen that is counted rather than modelled:
              every campaign member's own visit rate before and after they
              joined, averaged. Cohort-suppressed, because it is a finding about
              people, and absent on a plan without deep analytics.
            */}
            {(() => {
              const measured =
                analytics?.repeatMultiple && !analytics.repeatMultiple.suppressed
                  ? analytics.repeatMultiple.value ?? null
                  : null;

              if (measured === null && !PD_SEED) {
                if (analytics === undefined || analytics === null) return null;
                return (
                  <NoSource
                    title={copy.proofTitle}
                    detail={
                      analytics.repeatMultiple === undefined
                        ? dashboard.unmeasured.planLocked
                        : dashboard.unmeasured.withheld
                    }
                  />
                );
              }

              /* The server answers with a *ratio*, so its baseline is 1 by
                 construction. The seeded pair is a rate, with the mock's 1.5. */
              const now = measured ?? SEED_REPEAT.now;
              const before = measured === null ? SEED_REPEAT.before : 1;

              return (
                <div className="pd-glass pd-panel pd-proof-panel" data-reveal>
                  <div>
                    <div className="pd-panel-head">
                      <span className="console-label pd-proof-title">
                        {copy.proofTitle}
                      </span>
                      {measured === null && <SampleTag />}
                    </div>
                    <p className="pd-proof">
                      {fill(copy.proof, { n: (now / before).toFixed(1) })}
                    </p>
                    <p className="pd-fine">{copy.proofNote}</p>
                  </div>
                  <div className="pd-columns">
                    <span>
                      <i style={{ height: `${(before / Math.max(now, 0.01)) * 100}%` }} />
                      <b>{before.toFixed(1)}</b>
                      {copy.before}
                    </span>
                    <span data-on="true">
                      <i style={{ height: '100%' }} />
                      <b>{now.toFixed(1)}</b>
                      {copy.now}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/*
              Visits against voucher redemptions, day by day, over the picker's
              window — `GET …/series`, zero-filled by the server, so a quiet
              Tuesday is a point on the line rather than a gap in it.
            */}
            {series !== null ? (
              <div className="pd-glass pd-panel" data-reveal>
                <div className="pd-panel-head pd-chart-head">
                  <div>
                    <h2 className="pd-title">{copy.chartTitle}</h2>
                    <p className="pd-fine">{copy.chartNote}</p>
                  </div>
                  <div className="pd-chart-key">
                    <span data-series="visits">
                      <i aria-hidden="true" />
                      {copy.chartVisits}
                    </span>
                    <span data-series="redeemed">
                      <i aria-hidden="true" />
                      {copy.chartRedeemed}
                    </span>
                  </div>
                </div>
                <AnalyticsChart
                  points={series.series.map((day) => ({
                    day: day.day,
                    visits: day.visits,
                    redemptions: day.vouchersRedeemed,
                  }))}
                  formatTick={dates.tick}
                  formatFull={dates.full}
                  formatNumber={num}
                  labelVisits={copy.chartVisits}
                  labelRedeemed={copy.chartRedeemed}
                  emptyText={dashboard.unmeasured.noSource}
                />
              </div>
            ) : (
              <NoSource title={copy.chartTitle} detail={stateNote(seriesApi.state, dashboard)} />
            )}

            <div className="pd-glass pd-panel pd-holding" data-reveal>
              <div>
                <h2 className="pd-title">{copy.holdingTitle}</h2>
                <p className="pd-proof">
                  {fill(copy.holding, {
                    rewards: campaigns === null ? '—' : num(loyalty.holding),
                    vouchers: vouchersHeld === null ? '—' : num(vouchersHeld),
                    amount: money(
                      toEuro(data.budget.loyalty.reserved + data.budget.voucher.reserved),
                      'exact',
                    ),
                  })}
                </p>
                <p className="pd-fine">{copy.holdingNote}</p>
                <RemindNotes remind={remind} />
              </div>
              <RemindButton venueId={venueId} remind={remind} reload={remindApi.reload} />
            </div>

            {/* What the month noticed — the server's findings, and nothing else. */}
            <div className="pd-glass pd-notices" data-reveal>
              <div className="pd-notice-head">
                <h2 className="pd-notice-title">{copy.noticed}</h2>
              </div>
              {insights === null ? (
                <p className="pd-fine">{stateNote(insightsApi.state, dashboard)}</p>
              ) : rows.length === 0 ? (
                <p className="pd-fine">{dashboard.unmeasured.noFindings}</p>
              ) : (
                rows.map((row) => (
                  <div className="pd-notice" key={row.key}>
                    <div>
                      <p className="pd-notice-lead">{row.lead}</p>
                      {row.detail && <p className="pd-fine">{row.detail}</p>}
                    </div>
                    <div className="pd-notice-acts">
                      {row.action}
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => goTo('assistant')}
                      >
                        {copy.askAssistant}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Everything a customer could walk in and use today. */}
            <div className="pd-glass pd-running" data-reveal>
              <div className="pd-panel-head">
                <div>
                  <h2 className="pd-title pd-title-lg">{copy.runningTitle}</h2>
                  <p className="pd-fine">{copy.runningNote}</p>
                </div>
              </div>

              {liveDeals.length === 0 && loyalty.list.every((c) => !c.live) ? (
                <p className="pd-fine">{dashboard.empty[0].body}</p>
              ) : (
                <>
                  {liveDeals.map((deal) => (
                    <div className="pd-run-row" key={deal.id}>
                      <span className="pd-kind" data-kind="deal">
                        {copy.kinds.deal}
                      </span>
                      <div className="pd-run-name">
                        <b>{deal.name || deal.badge}</b>
                        <span className="pd-fine">
                          {[deal.badge, deal.schedule].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                      <div className="pd-run-stat">
                        <b>{num(deal.claimed)}</b>
                        <i>{copy.claims}</i>
                      </div>
                      <RowActs kind="deal" id={deal.id} live reload={dealsApi.reload} />
                    </div>
                  ))}
                  {loyalty.list.filter((c) => c.live).map((campaign) => (
                    <div className="pd-run-row" key={campaign.id}>
                      <span className="pd-kind" data-kind="campaign">
                        {copy.kinds.campaign}
                      </span>
                      <div className="pd-run-name">
                        <b>{campaign.name}</b>
                        <span className="pd-fine">
                          {fill(dashboard.campaigns.rule, {
                            visits: num(campaign.visits),
                            reward: campaign.reward,
                          })}{' '}
                          · {fill(dashboard.words.each, { amount: money(campaign.cost, 'unit') })}
                        </span>
                      </div>
                      <div className="pd-run-stat">
                        <b>
                          {num(campaign.used)} / {num(campaign.earned)}
                        </b>
                        <i>{copy.usedEarned}</i>
                      </div>
                      <RowActs kind="campaign" id={campaign.id} live reload={campaignsApi.reload} />
                    </div>
                  ))}
                </>
              )}
            </div>

            {/*
              Who saw you — the one report worth reading for a venue with no
              visits yet, because without it a venue nobody has heard of and a
              venue everybody scrolls past render identically.
            */}
            <div className="pd-glass pd-panel pd-reach" data-reveal>
              <div className="pd-panel-head">
                <h2 className="pd-title pd-title-lg">{copy.reachTitle}</h2>
                {reachPeriod && <span className="pd-chip">{monthName(reachPeriod)}</span>}
              </div>

              {reach === null ? (
                <p className="pd-fine">{stateNote(reachApi.state, dashboard)}</p>
              ) : reach.seen === 0 && reach.clicks === 0 ? (
                <p className="pd-fine">{copy.reachEmpty}</p>
              ) : (
                <>
                  <p className="pd-reach-live">{copy.reachLive}</p>
                  <div className="pd-reach-figures">
                    <div>
                      <b>{num(reach.seen)}</b>
                      <span>{copy.reachSeen}</span>
                      <i>{copy.reachSeenNote}</i>
                    </div>
                    <div>
                      <b>{num(reach.clicks)}</b>
                      <span>{copy.reachClicks}</span>
                      <i>{copy.reachClicksNote}</i>
                    </div>
                    <div>
                      <b>{reach.clickRate.toFixed(1)}%</b>
                      <span>{copy.reachRate}</span>
                      <i>{copy.reachRateNote}</i>
                    </div>
                    <div>
                      <b>{num(reach.claims)}</b>
                      <span>{copy.reachClaims}</span>
                      <i>{copy.reachClaimsNote}</i>
                    </div>
                  </div>

                  <div className="pd-panel-head pd-reach-split-head">
                    <h2 className="pd-title">{copy.reachSplit}</h2>
                  </div>
                  <div className="pd-rows pd-reach-rows">
                    <div className="pd-reach-rowhead">
                      <span />
                      <b>{copy.reachSeen}</b>
                      <b>{copy.reachClicks}</b>
                    </div>
                    <div>
                      <span>{copy.reachListing}</span>
                      <b>{num(reach.listingSeen)}</b>
                      <b>{num(reach.listingClicks)}</b>
                    </div>
                    <div>
                      <span>{copy.reachDeals}</span>
                      <b>{num(reach.dealSeen)}</b>
                      <b>{num(reach.dealClicks)}</b>
                    </div>
                    {(reachRaw?.sources ?? []).map((source) => {
                      /* The server's own source keys through the dictionary. A
                         surface the dictionary does not name reads as "somewhere
                         else" rather than as its raw key. */
                      const label =
                        copy.reachSources[source.source as keyof typeof copy.reachSources] ??
                        copy.reachSources.unknown;
                      return (
                        <div key={source.source} data-sub="true">
                          <span>{label}</span>
                          <b>{num(source.impressions)}</b>
                          <b>{num(source.clicks)}</b>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      }}
    </Screen>
  );
}

/* ──────────────────────────────────────────────────────────────── deals ── */

/**
 * Today, or `offsetDays` from it, as the local `YYYY-MM-DD` a date input speaks.
 *
 * Local rather than `toISOString`, which is UTC and opens the picker on
 * yesterday for an owner east of Greenwich late at night.
 */
const isoDay = (offsetDays = 0): string => {
  const at = new Date();
  at.setDate(at.getDate() + offsetDays);
  return `${at.getFullYear()}-${`${at.getMonth() + 1}`.padStart(2, '0')}-${`${at.getDate()}`.padStart(2, '0')}`;
};

/**
 * One deal, and everything an owner can do to it after it exists.
 *
 * Which controls appear is decided by the state rather than by taste:
 *
 * - **Publish** only on a `draft`, because publishing is what a draft is for.
 * - **Pause** on anything customers can currently reach, **Resume** on what was
 *   paused. Reversible, no confirmation, deliberately.
 * - **Extend** wherever there is a window to push out — the correct control on
 *   an *expired* deal, because the server revives it in the same statement.
 * - **End** everywhere except a draft, and it is the one that asks twice.
 * - **Notify** on a deal customers can reach. One per deal, ever.
 *
 * The two that need a value open a second row underneath rather than a dialog:
 * a modal over a table the owner is comparing rows in hides what they were
 * reading.
 */
function DealRow({
  deal,
  venue,
  reload,
  onEdit,
  children,
}: {
  deal: PartnerDeal;
  venue: PartnerVenue | null;
  reload: () => void;
  onEdit: (deal: PartnerDeal) => void;
  children: ReactNode;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.acts;
  const { busy, run } = useAction(reload);
  const [open, setOpen] = useState<'extend' | 'notify' | 'detail' | null>(null);
  const [sure, setSure] = useState(false);
  const [until, setUntil] = useState(() => deal.to?.slice(0, 10) ?? isoDay(14));
  const [pushDay, setPushDay] = useState(() => isoDay());
  const [pushTime, setPushTime] = useState('09:00');

  const reachable = deal.state === 'live' || deal.state === 'scheduled';
  const working = busy !== null;

  return (
    <>
      {/*
        The row opens itself. A `<tr>` with a handler rather than a button,
        because a button cannot wrap nine cells — so the affordance is carried
        by the cursor, the hover and `aria-expanded`, and the toggle ignores
        presses that land inside a control.
      */}
      <tr
        data-dim={deal.state === 'expired' || deal.state === 'archived' ? 'true' : undefined}
        data-open={open === 'detail' ? 'true' : undefined}
        className="pd-deal-row"
        tabIndex={0}
        role="button"
        aria-expanded={open === 'detail'}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('button, a, input, label')) return;
          setOpen((was) => (was === 'detail' ? null : 'detail'));
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          if ((event.target as HTMLElement).closest('button, a, input, label')) return;
          event.preventDefault();
          setOpen((was) => (was === 'detail' ? null : 'detail'));
        }}
      >
        {children}
        <td>
          <span className="pd-row-acts">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={working}
              onClick={() => onEdit(deal)}
            >
              {copy.edit}
            </button>

            {deal.state === 'draft' ? (
              <button
                type="button"
                className="btn btn-solid"
                disabled={working}
                onClick={() => void run('publish', copy.published, () => publishDeal(deal.id))}
              >
                {copy.publish}
              </button>
            ) : reachable ? (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={working}
                onClick={() =>
                  void run('pause', copy.paused, () => setDealStatus(deal.id, 'paused'))
                }
              >
                {copy.pause}
              </button>
            ) : deal.state === 'paused' ? (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={working}
                onClick={() =>
                  void run('resume', copy.resumed, () => setDealStatus(deal.id, 'live'))
                }
              >
                {copy.resume}
              </button>
            ) : null}
          </span>
        </td>
      </tr>

      {open !== null && (
        <tr className="pd-drawer-row">
          <td colSpan={9}>
            {open === 'detail' ? (
              <>
                <DealDetail deal={deal} />
                <div className="pd-detail-acts">
                  {deal.state !== 'draft' && deal.state !== 'archived' && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={working}
                      onClick={() => setOpen('extend')}
                    >
                      {copy.extend}
                    </button>
                  )}
                  {reachable && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={working}
                      onClick={() => setOpen('notify')}
                    >
                      {copy.notify}
                    </button>
                  )}
                  {deal.state !== 'draft' && deal.state !== 'archived' && (
                    /* Two presses, because this is the one status change the
                       screen cannot take back. */
                    <button
                      type="button"
                      className="btn btn-ghost pd-end"
                      disabled={working}
                      onClick={() => {
                        if (!sure) {
                          setSure(true);
                          return;
                        }
                        setSure(false);
                        void run('end', copy.ended, () => setDealStatus(deal.id, 'archived'));
                      }}
                    >
                      {sure ? copy.endSure : copy.end}
                    </button>
                  )}
                </div>
              </>
            ) : (
            <div className="pd-inline-form">
              {open === 'extend' ? (
                <>
                  <label className="field">
                    <span className="field-label">{copy.until}</span>
                    <input
                      type="date"
                      value={until}
                      onChange={(event) => setUntil(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-solid"
                    disabled={working}
                    onClick={() =>
                      void run('extend', copy.extended, async () => {
                        await extendDeal(deal.id, until);
                        setOpen(null);
                      })
                    }
                  >
                    {copy.save}
                  </button>
                </>
              ) : (
                <>
                  <label className="field">
                    <span className="field-label">{copy.sendAt}</span>
                    <input
                      type="date"
                      value={pushDay}
                      onChange={(event) => setPushDay(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span className="visually-hidden">{copy.sendAt}</span>
                    <input
                      type="time"
                      value={pushTime}
                      onChange={(event) => setPushTime(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-solid"
                    disabled={working}
                    onClick={() =>
                      void run('notify', copy.notified, async () => {
                        await scheduleDealPush(
                          deal.id,
                          /* The venue's clock, not the reader's — the server
                             refuses a send outside 07:00–21:00 venue-local. */
                          venueInstant(pushDay, pushTime, venue?.timezone ?? 'Europe/Warsaw'),
                        );
                        setOpen(null);
                      })
                    }
                  >
                    {copy.send}
                  </button>
                  <p className="pd-fine">{dashboard.drawer.deal.quietNote}</p>
                </>
              )}
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(null)}>
                {copy.close}
              </button>
            </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * What happened to one deal, step by step: the three funnel stages as cards,
 * the notification's own funnel when one went out, and who the deal is shown to.
 */
function DealDetail({ deal }: { deal: PartnerDeal }) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.deals;

  const stages = [deal.seen, deal.opened, deal.claimed];
  const pct = [
    null,
    deal.seen === 0 ? null : (deal.opened / deal.seen) * 100,
    deal.opened === 0 ? null : (deal.claimed / deal.opened) * 100,
  ];

  /* Only for a `sent` push: a scheduled one has three zeroes on it, and drawing
     them would say the notification reached nobody rather than that it has not
     been sent. */
  const push = deal.push?.kind === 'sent' ? deal.push : null;

  return (
    <div className="pd-detail">
      <DealFunnel
        title={copy.funnelTitle}
        labels={copy.funnel}
        values={stages}
        base={deal.seen}
        notes={stages.map((_, index) =>
          index === 0
            ? copy.funnelNotes[0]
            : pct[index] === null
              ? copy.notStarted
              : fill(copy.funnelNotes[index], { pct: (pct[index] ?? 0).toFixed(1) }),
        )}
      />

      {push && (
        <DealFunnel
          title={copy.notifyTitle}
          labels={copy.notifySteps}
          values={[push.delivered, push.opened, push.cameIn]}
          base={push.delivered}
          notes={notifyNotes(copy, push.delivered, push.opened, push.cameIn)}
        />
      )}

      <div className="pd-detail-who">
        <span className="console-label">{copy.whoTitle}</span>
        <b>{deal.schedule ?? copy.anytime}</b>
        <p className="pd-fine">{deal.audience ?? copy.everyone}</p>
        {deal.terms && <p className="pd-fine pd-detail-terms">{deal.terms}</p>}
      </div>
    </div>
  );
}

/** The grey notes under a notification funnel's three cards — shared by one deal's and the venue's. */
function notifyNotes(
  copy: DashboardCopy['deals'],
  delivered: number,
  opened: number,
  cameIn: number,
): string[] {
  return [
    copy.notifyStepNotes[0],
    delivered === 0
      ? copy.notStarted
      : fill(copy.notifyStepNotes[1], { pct: ((opened / delivered) * 100).toFixed(1) }),
    opened === 0
      ? copy.notStarted
      : fill(copy.notifyStepNotes[2], { pct: ((cameIn / opened) * 100).toFixed(1) }),
  ];
}

/**
 * One three-stage funnel: a heading, and three cards with a figure, a bar and a
 * grey note under it. `base` is the first stage, so the three bars draw a shape
 * rather than three unrelated facts.
 */
function DealFunnel({
  title,
  labels,
  values,
  base,
  notes,
}: {
  title: string;
  labels: readonly string[];
  values: number[];
  base: number;
  notes: string[];
}) {
  const num = useNum();

  return (
    <section className="pd-detail-main">
      <h3 className="pd-detail-head">{title}</h3>
      <div className="pd-detail-steps">
        {labels.map((label, index) => (
          <div key={label}>
            <span>{label}</span>
            {/* An em dash rather than a 0: a stage nobody reached and a stage
                that has not happened are different, and this panel cannot tell
                them apart, so it declines to claim either. */}
            <b>{values[index] === 0 ? '—' : num(values[index])}</b>
            <i>
              <em
                style={{
                  width:
                    base === 0 ? '0%' : Math.max(2, (values[index] / base) * 100) + '%',
                }}
              />
            </i>
            <p className="pd-fine">{notes[index]}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The venue's notifications this month, as one funnel under the deals table.
 *
 * `push-quota.funnel` sums the pushes that actually went out. Three answers
 * before the funnel, each its own sentence: the quota could not be read, the API
 * does not send the funnel yet, and nothing has gone out this month — which is a
 * true zero, but three dashes in a funnel read as a failure rather than as a
 * month with no sends.
 */
function VenueNotifications({
  quota,
  state,
}: {
  quota: PushQuotaResponse | null;
  state: ApiState<unknown>;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.deals;
  const num = useNum();

  if (quota === null) {
    return <NoSource title={copy.notifyVenueTitle} detail={stateNote(state, dashboard)} />;
  }
  if (quota.funnel === undefined) return <NoSource title={copy.notifyVenueTitle} />;

  const funnel = quota.funnel;
  if (funnel.sent === 0) {
    return <NoSource title={copy.notifyVenueTitle} detail={copy.notifyVenueNone} />;
  }

  return (
    <div className="pd-glass pd-panel pd-venue-notify" data-reveal>
      <DealFunnel
        title={copy.notifyVenueTitle}
        labels={copy.notifySteps}
        values={[funnel.delivered, funnel.opened, funnel.cameIn]}
        base={funnel.delivered}
        notes={notifyNotes(copy, funnel.delivered, funnel.opened, funnel.cameIn)}
      />
      <p className="pd-fine">{fill(copy.notifyVenueSent, { n: num(funnel.sent) })}</p>
    </div>
  );
}

/**
 * The venue's hot deals, as the server has them — seen, opened, claimed, what
 * the discounts cost, the claim cap, and how many of the five languages the
 * deal is written in.
 */
function Deals() {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.deals;
  const money = useMoney();
  const num = useNum();
  const [filter, setFilter] = useState(0);
  const [search, setSearch] = useState('');
  /* Claim rate, best first: the only column that says whether a deal *worked*. */
  const [sort, setSort] = useState<DealSort>('rate');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const venueApi = usePartnerVenue();
  const liveVenue = venueApi.state.status === 'ready' ? venueApi.state.data : null;
  const venue = liveVenue ?? (DEMO_MODE ? DEMO_VENUE : null);
  const liveId = liveVenue?.id ?? null;
  const dealsApi = usePartnerDeals(liveId);
  /* The month's notification allowance and funnel — its own request, so a venue
     whose deals load while the quota call fails still gets its table. */
  const quotaApi = usePartnerPushQuota(liveId);
  const quota = readyOr(quotaApi.state, DEMO_MODE ? DEMO_QUOTA : null);
  /* The one finding about offers, from the same report the overview reads. */
  const insightsApi = usePartnerInsights(liveId);
  const insights = readyOr(insightsApi.state, DEMO_MODE ? DEMO_INSIGHTS : null);
  const state = chain(venueApi, dealsApi);

  /* The venue's own currency, off the venue row rather than off the budget. */
  const currency = venue?.currency ?? 'EUR';
  const reload = dealsApi.reload;

  const { openDrawer } = useDashboard();
  const editDeal = (deal: PartnerDeal) => openDrawer('deal', deal.id);

  const onSort = (key: DealSort) => {
    if (key === sort) setDir((was) => (was === 'desc' ? 'asc' : 'desc'));
    else {
      setSort(key);
      setDir('desc');
    }
  };

  return (
    <Screen state={state} index={1} demo={DEMO_DEALS}>
      {(rows) => {
        const deals: PartnerDeal[] = rows.map((row) =>
          dealFromApi(row, (minor) => minorToEuro(minor, currency)),
        );

        if (deals.length === 0) {
          return (
            <div className="pd-stack">
              <Unmeasured index={1} />
            </div>
          );
        }

        const states: Array<PartnerDeal['state'] | null> = [
          null,
          'live',
          'scheduled',
          'paused',
          'archived',
          'expired',
        ];
        const q = search.trim().toLowerCase();
        const shown = deals
          .filter((deal) => states[filter] === null || deal.state === states[filter])
          .filter(
            (deal) =>
              q === '' ||
              (deal.name + ' ' + deal.badge + ' ' + (deal.audience ?? '') + ' ' + deal.state)
                .toLowerCase()
                .includes(q),
          )
          .sort((a, b) => {
            /* Live and scheduled first, whatever the sort — the two an owner can
               still do something about. */
            const rank = (d: PartnerDeal) =>
              d.state === 'live' || d.state === 'scheduled' ? 0 : 1;
            if (rank(a) !== rank(b)) return rank(a) - rank(b);
            const value = (d: PartnerDeal): string | number => {
              if (sort === 'name') return (d.name || d.badge).toLowerCase();
              if (sort === 'state') return d.state;
              if (sort === 'seen') return d.seen;
              if (sort === 'opened') return d.opened;
              if (sort === 'claimed') return d.claimed;
              if (sort === 'cost') return d.cost;
              return claimRate(d);
            };
            const va = value(a);
            const vb = value(b);
            if (va === vb) return 0;
            return (va > vb ? 1 : -1) * (dir === 'asc' ? 1 : -1);
          });

        const offerFinding = insights?.itemVsPercent
          ? itemSentence(insights.itemVsPercent, dashboard.overview.insights)
          : null;

        return (
          <div className="pd-stack">
            <div className="pd-glass pd-panel pd-deals" data-solid="true" data-reveal>
              <div className="pd-toolbar">
                <label className="pd-search">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <input
                    type="search"
                    value={search}
                    placeholder={copy.search}
                    aria-label={copy.search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>

                <div className="pd-seg">
                  {copy.filters.map((label, index) => (
                    <button
                      key={label}
                      type="button"
                      data-on={index === filter ? 'true' : undefined}
                      onClick={() => setFilter(index)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {quota && (
                  <span className="pd-quota" data-out={quota.remaining === 0 ? 'true' : undefined}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" />
                      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                    </svg>
                    {quota.remaining === 0
                      ? dashboard.overview.quotaOut
                      : fill(dashboard.overview.quota, {
                          n: num(quota.remaining),
                          total: num(quota.quota),
                        })}
                  </span>
                )}

                <span className="pd-count">
                  {fill(copy.count, { n: num(shown.length), total: num(deals.length) })}
                </span>
              </div>

              {/* What this venue's offers have in common, from the server's own
                  comparison — measured, so it carries no sample chip. */}
              {offerFinding && (
                <p className="pd-deal-insight">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                    <path d="M9 18h6M10 21h4" />
                    <path d="M12 3a6 6 0 0 1 3.6 10.8c-.5.4-.6 1-.6 1.5H9c0-.5-.1-1.1-.6-1.5A6 6 0 0 1 12 3Z" />
                  </svg>
                  <span>{offerFinding}</span>
                </p>
              )}

              <p className="pd-sort-note">{copy.sortNote}</p>

              {shown.length === 0 ? (
                <p className="pd-fine">{copy.emptyFiltered}</p>
              ) : (
                <div className="pd-table-wrap">
                  <table className="pd-table pd-table-deals">
                    <thead>
                      <tr>
                        {DEAL_COLUMNS.map((column, index) => {
                          const key = column.key;
                          return (
                          <th
                            key={copy.columns[index]}
                            style={{ width: column.width }}
                            data-align={column.align}
                            aria-sort={
                              column.key === sort
                                ? dir === 'asc'
                                  ? 'ascending'
                                  : 'descending'
                                : undefined
                            }
                          >
                            {key ? (
                              <button type="button" onClick={() => onSort(key)}>
                                {copy.columns[index]}
                                <i aria-hidden="true">
                                  {key === sort ? (dir === 'asc' ? '▲' : '▼') : ''}
                                </i>
                              </button>
                            ) : (
                              copy.columns[index]
                            )}
                          </th>
                          );
                        })}
                        <th data-align="right" style={{ width: DEAL_ACTS_WIDTH }}>
                          {dashboard.acts.column}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((deal) => (
                        <DealRow key={deal.id} deal={deal} venue={venue} reload={reload} onEdit={editDeal}>
                          <td>
                            <div className="pd-deal-cell">
                              {deal.badge && (
                                <span className="pd-deal-badge">{deal.badge}</span>
                              )}
                              <div>
                                <b>{deal.name || deal.badge || copy.untitled}</b>
                                <span className="pd-deal-meta">
                                  {dealWindow(deal) && <span>{dealWindow(deal)}</span>}
                                  {deal.schedule && <em>{deal.schedule}</em>}
                                  {deal.audience && deal.audience !== 'all' && (
                                    <span>{deal.audience}</span>
                                  )}
                                </span>
                                <span className="pd-deal-chips">
                                  <span className="pd-notif" data-kind={deal.push?.kind ?? 'none'}>
                                    {deal.push === null
                                      ? copy.notify.none
                                      : deal.push.kind === 'sent'
                                        ? copy.notify.sent +
                                          ' · ' +
                                          fill(copy.cameIn, { n: num(deal.push.cameIn) })
                                        : deal.push.kind === 'scheduled'
                                          ? copy.notify.scheduled
                                          : copy.notify.stopped}
                                  </span>
                                  {deal.langs < 5 && (
                                    <span
                                      className="pd-langs"
                                      title={fill(copy.langsSome, {
                                        n: String(deal.langs),
                                        pct: String(Math.round((deal.missing.length / 5) * 100)),
                                      })}
                                    >
                                      {deal.langs}/5
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td>
                            <span className="pd-state-pill" data-state={deal.state}>
                              {copy.states[deal.state]}
                            </span>
                          </td>

                          <td data-align="right" data-quiet="true">
                            {deal.seen === 0 ? '—' : num(deal.seen)}
                          </td>
                          <td data-align="right" data-quiet="true">
                            {deal.opened === 0 ? '—' : num(deal.opened)}
                          </td>

                          <td data-align="right">
                            <b>{deal.claimed === 0 ? '—' : num(deal.claimed)}</b>
                            {deal.limit > 0 && (
                              <span className="pd-limit">
                                <i>
                                  <em
                                    style={{
                                      width:
                                        Math.min(100, (deal.claimed / deal.limit) * 100) + '%',
                                    }}
                                  />
                                </i>
                                <span className="pd-fine">
                                  {fill(copy.limitAllowed, { limit: num(deal.limit) })}
                                </span>
                              </span>
                            )}
                          </td>

                          <td data-align="right">
                            {/* A rate over nothing is not a rate, and 0% reads as
                                a deal that failed rather than one not started. */}
                            <b>{deal.seen === 0 ? '—' : claimRate(deal).toFixed(1) + '%'}</b>
                          </td>

                          <td data-align="right">
                            <b>{deal.cost === 0 ? '—' : money(deal.cost, 'exact')}</b>
                          </td>

                          <td>
                            {deal.series.some((n) => n > 0) ? (
                              <Spark values={deal.series} ink="accent" />
                            ) : (
                              <span className="pd-fine">{copy.notStarted}</span>
                            )}
                          </td>
                        </DealRow>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <VenueNotifications quota={quota} state={quotaApi.state} />
          </div>
        );
      }}
    </Screen>
  );
}

/* ──────────────────────────────────────────────────────────────── scans ── */

/**
 * The counter: record a visit, today's three figures, and the till log.
 *
 * Three panels, in the order somebody at the till reaches for them. The counter
 * tool is first because it is the one that *does* something while a customer
 * waits; today's figures are how the shift is going; the log is the record, a
 * page at a time.
 *
 * The confirmation queue that used to live here is still gone — a scan opened
 * from the customer's phone is confirmed from the counter's own device — but
 * the counter tool is the other half of that: a visit the owner records from
 * here is opened, priced and confirmed in one press on the server, so nothing is
 * left pending for anybody to confirm.
 */
function Scans() {
  const dashboard = useCopy().dashboard;
  const money = useMoney();
  const num = useNum();

  const venueApi = usePartnerVenue();
  const liveVenue = venueApi.state.status === 'ready' ? venueApi.state.data : null;
  const venue = liveVenue ?? (DEMO_MODE ? DEMO_VENUE : null);
  const todayApi = usePartnerToday(liveVenue?.id ?? null);
  const state = chain(venueApi, todayApi);
  /* Bumped after a visit is recorded, so the log re-reads the page it is on. */
  const [logSignal, setLogSignal] = useState(0);

  const currency = venue?.currency ?? 'EUR';
  const reloadToday = todayApi.reload;
  const recorded = useCallback(() => {
    reloadToday();
    setLogSignal((n) => n + 1);
  }, [reloadToday]);

  return (
    <Screen state={state} index={7} demo={DEMO_TODAY}>
      {(today) => (
        <div className="pd-stack">
          <Counter venue={liveVenue} demoVenue={liveVenue === null ? venue : null} onRecorded={recorded} />

          <span className="console-label ps-today">{dashboard.scans.todayTitle}</span>
          <div className="pd-tiles">
            <div className="pd-glass pd-tile" data-reveal>
              <span>{dashboard.overview.tiles[0]}</span>
              <div className="pd-tile-body">
                <div>
                  <Figure metric={today.visits} format={num} />
                </div>
              </div>
            </div>
            <div className="pd-glass pd-tile" data-reveal>
              <span>{dashboard.customers.rosterTitle}</span>
              <div className="pd-tile-body">
                <div>
                  <Figure metric={today.customers} format={num} />
                </div>
              </div>
            </div>
            <div className="pd-glass pd-tile" data-reveal>
              <span>{dashboard.overview.returnLabel}</span>
              <div className="pd-tile-body">
                <div>
                  <Figure
                    metric={today.salesMinor}
                    format={(minor) => money(minorToEuro(minor, currency), 'exact')}
                  />
                </div>
              </div>
            </div>
          </div>

          <ScanLog venue={venue} live={liveVenue !== null} reloadSignal={logSignal} />
        </div>
      )}
    </Screen>
  );
}

/* ───────────────────────────────────────────────────────────────── index ── */

/*
 * Index-aligned with `DASH_SCREENS` in `content.ts`, minus the profile — which
 * `DashboardPage` renders itself, because it is a form rather than a report.
 *
 * `IssuedVouchers` sits where the rail puts it, immediately after the ladder it
 * is the other half of. A screen inserted here has to be inserted in
 * `DASH_SCREENS` and in `copy.dashboard.screens` and `copy.dashboard.empty` at
 * the same index, and any hard-coded read of `empty[n]` past it has to move —
 * `npm run verify` pins the two array lengths against each other, which catches
 * the first of those and not the last.
 */
const SCREENS = [
  Overview,
  Deals,
  CampaignsScreen,
  VouchersScreen,
  IssuedVouchers,
  CustomersScreen,
  Assistant,
  Scans,
];

/**
 * The screen the rail is pointing at.
 *
 * Memoised on the index so switching screens does not re-run every hook in the
 * one being left — each screen owns its own requests, and remounting is what
 * fires them.
 */
export function DashboardScreen({ index }: { index: number }) {
  const Body = useMemo(() => SCREENS[index] ?? SCREENS[0], [index]);
  return <Body />;
}
