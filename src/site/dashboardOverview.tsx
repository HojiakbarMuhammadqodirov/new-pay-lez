/**
 * The Overview — "Partner analytics" — rebuilt to `Paylez Partner Dashboard
 * v3.dc.html` §3.1, section by section, on the real reports.
 *
 * It was the first screen in `dashboardScreens.tsx`; it moved here with the v3
 * rebuild so the redesign arrives in the unit it is drawn in, the screen. Every
 * figure is still what it was before the move — the same requests, the same
 * arithmetic in `partnerMetrics.ts`, the same demo stand-ins reached only by
 * `readyOr` under `?demo=1` — and only the dress changed, plus two sections v3
 * has and the old screen did not:
 *
 *  - **"Your subscriptions"**, off `GET …/passes`. Its four figures are the
 *    server's own stats; the MRR trend v3 draws beside them is **not drawn**,
 *    because no endpoint keeps a history of recurring revenue and a sparkline
 *    of one point is a decoration. A venue with no live pass gets v3's promo
 *    card, and which press it carries is the plan's `passes` entitlement —
 *    "Create a pass" when the plan has it, "See Growth" when it does not.
 *  - **The low-budget banner**, off `budget.rebalanceHint`. The server only
 *    sends a hint when one pool is genuinely running out *and* the other has
 *    room, which is exactly the condition v3's `lowBudget` state draws, so the
 *    banner is the hint and nothing else.
 *
 * Three things v3 draws are left out, each because nothing measures it:
 *
 *  - **"All branches / One branch"** — no endpoint aggregates venues, so the
 *    overview is always one venue's (the top bar's switcher picks which).
 *  - **The "thin" state** — the server sends no venue age to decide it from.
 *  - **The milestone insight** ("22 subscribers from 150") — a target nobody
 *    set is a number the screen would be inventing.
 *
 * And one section v3 lacks is **kept**: "Who saw you", the reach funnel. Every
 * other figure here starts at a visit, and without it a venue nobody has heard
 * of and a venue everybody scrolls past render identically — opposite problems
 * with opposite fixes. It sits under the chart, as the step before a visit.
 *
 * Classes are `dx-ov-*` (this file's) and the kit's `dx-*`. Nothing here
 * carries `data-reveal`: v3 fades the whole screen in once, which the frame's
 * `.dx-screen` already does.
 */
import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import './dashboard-overview.css';
import { ApiError, hasToken } from './api/client';
import {
  chain,
  exportCsv,
  isNoSession,
  minorToEuro,
  noSession,
  readyOr,
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
  usePartnerVenue,
  type InsightsResponse,
  type OverviewResponse,
  type RemindStatus,
  type SeriesDay,
  type SeriesTotals,
} from './api/partner';
import { setPassStatus, usePartnerPasses, type PassCard, type PassListResponse } from './api/passes';
import { useReach } from './api/reach';
import { useApi, type ApiResult, type ApiState } from './api/useApi';
import { AnalyticsChart } from './dashboardChart';
import {
  DEMO_ANALYTICS,
  DEMO_CAMPAIGNS,
  DEMO_DEALS,
  DEMO_INSIGHTS,
  DEMO_OVERVIEW,
  DEMO_PASSES,
  DEMO_QUOTA,
  DEMO_REACH,
  DEMO_REMIND,
  DEMO_VENUE,
  DEMO_VENUE_PLAN,
  demoSeries,
} from './dashboardDemo';
import { useMonthName, useNum } from './dashboardFormat';
import {
  Button,
  Card,
  CardHead,
  DxIcon,
  EmptyState,
  Eyebrow,
  Metric,
  PageHead,
  Pill,
} from './dashboardKit';
import { Figure, RemindNotes } from './dashboardScreens';
import { PD_SEED, SEED_REPEAT } from './dashboardSeed';
import { useDashboard } from './dashboardShell';
import { DEMO_MODE } from './demoMode';
import { useCopy, useLanguage, useMoney } from './i18n/context';
import { fill } from './i18n/currency';
import {
  PD_RANGES,
  campaignFromApi,
  campaignModel,
  dealFromApi,
  deltaOf,
  reachFromApi,
  totalsFrom,
  type PartnerDeal,
} from './partnerMetrics';

type DashboardCopy = ReturnType<typeof useCopy>['dashboard'];
type OverviewCopy = DashboardCopy['overview'];

/* ─────────────────────────────────────────────────────────────── shared ── */

/**
 * The sentence for a write that did not land — offline, signed out, or the
 * server's own refusal in its own words. The same three kinds the other
 * screens name, because an owner acts differently on each.
 */
function refusalText(cause: unknown, dashboard: DashboardCopy): string {
  if (cause instanceof ApiError && cause.status === 0) return dashboard.acts.offline;
  if (cause instanceof ApiError && cause.status === 401) return dashboard.unmeasured.noSession;
  return fill(dashboard.acts.refused, { why: cause instanceof Error ? cause.message : String(cause) });
}

/** What a section says in place of a figure it could not read. Never a zero. */
function stateNote(state: ApiState<unknown>, dashboard: DashboardCopy): string {
  if (state.status === 'loading') return dashboard.unmeasured.asking;
  if (state.status === 'error') {
    return isNoSession(state.error) ? dashboard.unmeasured.noSession : dashboard.unmeasured.serverSilent;
  }
  return '';
}

/**
 * A write, its two endings, and the re-read after it. `busy` is the key of the
 * control in flight so the row that was pressed is the row that shows it, and
 * success re-reads rather than patching: what a deal's status *became* is the
 * server's answer.
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
 * Dates from `Intl`, in the reader's language. `Intl` is kept off *numbers* on
 * this site (`currency.ts` says why); none of that applies to a date. A
 * notification's moment is written on the **venue's** clock, because that is
 * the clock it was scheduled against.
 */
function useDates(timezone: string | null) {
  const [language] = useLanguage();
  return useMemo(() => {
    /* The chart's days are UTC-midnight dates, so they are read back in UTC. */
    const short = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const long = new Intl.DateTimeFormat(language, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    });
    const day = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long' });
    /* Day and clock formatted apart and joined, v3's "12 August, 07:30": one
       combined format inserts a locale's own glue ("at") between them. */
    const zone = timezone ? { timeZone: timezone } : {};
    const momentDay = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', ...zone });
    const momentTime = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit', ...zone });
    /* UTC midnight rather than local: a `YYYY-MM-DD` the server filed under one
       day must not land on the day before for anybody west of Greenwich. */
    const at = (iso: string) => new Date(`${iso}T00:00:00Z`);
    return {
      tick: (iso: string) => short.format(at(iso)),
      full: (iso: string) => long.format(at(iso)),
      instant: (iso: string) => day.format(new Date(iso)),
      moment: (iso: string) => `${momentDay.format(new Date(iso))}, ${momentTime.format(new Date(iso))}`,
      /** The first day of the month after a `YYYY-MM` period — when a monthly quota resets. */
      nextMonth: (period: string) => {
        const match = /^(\d{4})-(\d{2})$/.exec(period);
        if (!match) return null;
        return day.format(new Date(Date.UTC(Number(match[1]), Number(match[2]), 1, 12)));
      },
    };
  }, [language, timezone]);
}

/** `{n}` inside a translated sentence, set in its own span — one string, one styled figure. */
function withFigure(template: string, hole: string, figure: ReactNode): ReactNode {
  const [head = '', tail = ''] = template.split(hole);
  return (
    <>
      {head}
      {figure}
      {tail}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────── head ── */

/**
 * The page head. The overview draws its own (`head: 'own'`) because v3's
 * subtitle is the venue — name, street, city, window — rather than a lede, and
 * only the screen knows which venue it is reading. The two buttons are the
 * frame's pair: Export CSV (the month, as the server writes it) and Create hot
 * deal.
 */
function OverviewHead({ subtitle }: { subtitle: string }) {
  const dashboard = useCopy().dashboard;
  const { openDrawer, toast, venueId } = useDashboard();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (busy) return;
    if (venueId === null) {
      toast(dashboard.drawer.deal.needsSession);
      return;
    }
    setBusy(true);
    try {
      const file = await exportCsv(venueId);
      /* A blob and a synthetic click: the CSV arrives in the body, not at a URL. */
      const url = URL.createObjectURL(new Blob([file.csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
      toast(dashboard.actions.exported);
    } catch (cause) {
      toast(cause instanceof ApiError && cause.status === 403 ? dashboard.acts.exportLocked : refusalText(cause, dashboard));
    } finally {
      setBusy(false);
    }
  };

  const entry = dashboard.screens.overview;
  return (
    <PageHead
      title={entry.title}
      subtitle={subtitle}
      actions={
        <>
          <Button variant="secondary" icon="download" disabled={busy} onClick={() => void download()}>
            {dashboard.actions.exportCsv}
          </Button>
          <Button variant="primary" icon="plus" onClick={() => openDrawer('deal')}>
            {dashboard.actions.newDeal}
          </Button>
        </>
      }
    />
  );
}

/* ──────────────────────────────────────────────────────────── reminding ── */

const remindWaiting = (remind: RemindStatus) =>
  remind.nextAllowedAt !== null && Date.parse(remind.nextAllowedAt) > Date.now();

/**
 * v3's "Remind them" — `POST …/remind`, one notification to everybody holding
 * an unused reward or voucher, at most once a week.
 *
 * The state is the server's: "Reminded" is `nextAllowedAt` in the future, read
 * from `GET …/remind`, so a reload, a second tab and the phone agree. No status
 * (the read failed) is no button, and nobody to remind is no button — a
 * control that could only fail is a picture of one.
 */
function RemindPress({
  venueId,
  remind,
  reload,
}: {
  venueId: string | null;
  remind: RemindStatus | null;
  reload: () => void;
}) {
  const dashboard = useCopy().dashboard;
  const num = useNum();
  const dates = useDates(null);
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
      toast(fill(dashboard.campaigns.remindSent, { n: num(sent.audience), queued: num(sent.queued) }));
      reload();
    } catch (cause) {
      /* The week and the audience have their own sentences, and both re-read so
         the button stops offering a press the server has just turned down. */
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
    <Button
      variant="primary"
      icon={waiting ? 'check' : 'bell'}
      disabled={waiting || busy}
      aria-busy={busy || undefined}
      onClick={() => void press()}
    >
      {waiting ? dashboard.overview.reminded : fill(dashboard.campaigns.remindLabel, { n: num(remind.audience) })}
    </Button>
  );
}

/* ─────────────────────────────────────────────────── running right now ── */

/**
 * Edit, Pause, End on a deal or campaign row — the same writes the Deals and
 * Campaigns screens make. End archives a deal or ends a campaign (both keep
 * their history) and asks in words: the first press turns the label into the
 * question, leaving the button disarms it.
 */
function RowActs({ kind, id, reload }: { kind: 'deal' | 'campaign'; id: string; reload: () => void }) {
  const acts = useCopy().dashboard.acts;
  const { openDrawer } = useDashboard();
  const { busy, run } = useAction(reload);
  const [sure, setSure] = useState(false);
  const working = busy !== null;

  return (
    <div className="dx-ov-acts">
      <Button
        variant="small"
        disabled={working}
        onClick={() => (kind === 'deal' ? openDrawer('deal', id) : openDrawer('campaign', undefined, undefined, id))}
      >
        {acts.edit}
      </Button>
      <Button
        variant="small"
        disabled={working}
        onClick={() =>
          void run('status', acts.paused, () =>
            kind === 'deal' ? setDealStatus(id, 'paused') : setCampaignStatus(id, 'paused'),
          )
        }
      >
        {acts.pause}
      </Button>
      <Button
        variant="small"
        data-end="true"
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
      </Button>
    </div>
  );
}

/** A live pass's row actions: Edit is on the Passes screen; Pause stops sign-ups (`POST …/status`). */
function PassActs({ venueId, id, reload }: { venueId: string | null; id: string; reload: () => void }) {
  const dashboard = useCopy().dashboard;
  const { goTo, toast } = useDashboard();
  const { busy, run } = useAction(reload);

  return (
    <div className="dx-ov-acts">
      <Button variant="small" onClick={() => goTo('passes')}>
        {dashboard.acts.edit}
      </Button>
      <Button
        variant="small"
        disabled={busy !== null}
        onClick={() =>
          venueId === null
            ? toast(dashboard.unmeasured.noSession)
            : void run('pause', dashboard.acts.paused, () => setPassStatus(venueId, id, 'pause'))
        }
      >
        {dashboard.acts.pause}
      </Button>
    </div>
  );
}

/** One "Running right now" row: kind chip, name and rule, the figure, the presses. */
function RunRow({
  kind,
  accent,
  name,
  rule,
  tag,
  stat,
  statLabel,
  acts,
}: {
  kind: 'deal' | 'campaign' | 'vouchers' | 'pass';
  accent?: string;
  name: string;
  rule: ReactNode;
  tag?: { tone: 'sent' | 'set'; text: string } | null;
  stat: ReactNode;
  statLabel: string;
  acts: ReactNode;
}) {
  const copy = useCopy().dashboard.overview;
  return (
    <div className="dx-ov-run">
      <span className="dx-ov-kind" data-kind={kind} data-accent={accent}>
        {copy.kinds[kind]}
      </span>
      <div className="dx-ov-run-name">
        <b>{name}</b>
        <span>
          {rule}
          {tag && (
            <em className="dx-ov-tag" data-tone={tag.tone}>
              {tag.text}
            </em>
          )}
        </span>
      </div>
      <div className="dx-ov-run-stat">
        <b>{stat}</b>
        <i>{statLabel}</i>
      </div>
      {acts}
    </div>
  );
}

/** "Any filter coffee · once a day · 49 zł/mo" — what the pass gives, how often, for how much. */
function passRule(
  pass: PassCard,
  copy: OverviewCopy,
  num: (n: number) => string,
  price: string,
): string {
  const benefit =
    pass.benefitItem ?? (pass.discountPct !== null ? fill(copy.passDiscount, { pct: num(pass.discountPct) }) : null);
  const cap =
    pass.capKind === 'unlimited'
      ? copy.passCaps.unlimited
      : pass.capCount === 1
        ? copy.passCapsOnce[pass.capKind]
        : fill(copy.passCaps[pass.capKind], { n: num(pass.capCount) });
  return [benefit, cap, fill(copy.passPrice[pass.billingPeriod], { amount: price })].filter(Boolean).join(' · ');
}

/* ──────────────────────────────────────────────────────────── findings ── */

/**
 * The finding about offers as one sentence, or `null` when there is no honest
 * one. The multiple turns round when the percentage discount is the winner and
 * is recomputed from the four counts rather than inverted from a rounded
 * figure; an item side with no claims has no sentence ("∞×" is arithmetic, not
 * a finding).
 */
function itemSentence(
  finding: NonNullable<InsightsResponse['itemVsPercent']>,
  copy: OverviewCopy['insights'],
): string | null {
  const itemRate = finding.item.seen > 0 ? finding.item.claims / finding.item.seen : 0;
  const pctRate = finding.percent.seen > 0 ? finding.percent.claims / finding.percent.seen : 0;
  if (itemRate <= 0 || pctRate <= 0) return null;

  const itemOver = Math.round((itemRate / pctRate) * 10) / 10;
  if (itemOver >= 1.1) return fill(copy.itemText, { multiple: itemOver.toFixed(1) });
  const pctOver = Math.round((pctRate / itemRate) * 10) / 10;
  if (pctOver >= 1.1) return fill(copy.percentText, { multiple: pctOver.toFixed(1) });
  return copy.sameText;
}

interface NoticeRow {
  key: string;
  /** v3's left rail: mint by default, amber for a warning, purple for subscription money. */
  rail: 'mint' | 'warn' | 'good';
  lead: string;
  detail: string | null;
  action: ReactNode;
}

/* ───────────────────────────────────────────────────────────── the plan ── */

/** The two fields of `GET …/subscription` this screen reads. */
interface VenuePlanLite {
  plan: { code: string; name: string };
  entitlements: Record<string, string>;
}

/** The venue's plan, or the no-session state — the `useVenueApi` construction, for a read `partner.ts` has no hook for. */
function useVenuePlan(venueId: string | null): ApiResult<VenuePlanLite> {
  const path =
    venueId !== null && hasToken() ? `/v1/partner/venues/${encodeURIComponent(venueId)}/subscription` : null;
  const result = useApi<VenuePlanLite>(path);
  const unavailable = useMemo<ApiResult<VenuePlanLite>>(
    () => ({
      state: { status: 'error', error: noSession('This device has no partner session on the API.') },
      reload: () => undefined,
    }),
    [],
  );
  return path === null ? unavailable : result;
}

/* ────────────────────────────────────────────────────────────── tiles ── */

/** The four tiles, in v3's order, and what each reads off the series. */
const TILES: Array<{
  pick: (totals: SeriesTotals) => number;
  day: (day: SeriesDay) => number;
  tone: 'deep' | 'ink';
}> = [
  { pick: (t) => t.visits, day: (d) => d.visits, tone: 'deep' },
  { pick: (t) => t.claims, day: (d) => d.claims, tone: 'deep' },
  { pick: (t) => t.vouchersRedeemed, day: (d) => d.vouchersRedeemed, tone: 'ink' },
  { pick: (t) => t.rewardsRedeemed, day: (d) => d.rewardsRedeemed, tone: 'ink' },
];

/**
 * A day series as the daily mean of at most eight equal runs, for a 76px sparkline.
 *
 * Thirty daily points in 76px is a weekly sawtooth — every Sunday a spike —
 * which says "the week has a shape" and nothing about the trend the tile is
 * asking about. A mean per run keeps every day in the line and invents nothing
 * (a shorter last run is still a mean, so it does not read as a fall); only the
 * resolution drops. The tile's figure beside it is still the exact total.
 */
function buckets(values: readonly number[], most = 8): number[] {
  if (values.length <= most) return [...values];
  const size = Math.ceil(values.length / most);
  const out: number[] = [];
  for (let start = 0; start < values.length; start += size) {
    const run = values.slice(start, start + size);
    out.push(run.reduce((sum, v) => sum + v, 0) / run.length);
  }
  return out;
}

/* ───────────────────────────────────────────────────────────── screen ── */

export function Overview() {
  const dashboard = useCopy().dashboard;
  const { openDrawer, range } = useDashboard();

  const venueApi = usePartnerVenue();
  const liveVenue = venueApi.state.status === 'ready' ? venueApi.state.data : null;
  const venue = liveVenue ?? (DEMO_MODE ? DEMO_VENUE : null);
  const venueId = liveVenue?.id ?? null;

  const overviewApi = usePartnerOverview(venueId);
  const state = chain(venueApi, overviewApi);

  const rangeIndex = PD_RANGES.indexOf(range);
  const subtitle = [
    venue?.name,
    [venue?.address, venue?.city].filter(Boolean).join(', '),
    rangeIndex >= 0 ? dashboard.rangeLabels[rangeIndex] : null,
  ]
    .filter(Boolean)
    .join(' · ');

  /* The fold every screen makes: asking, a failure that says why, or the
     answer — with the demo stand-in only when there was nobody to ask. */
  const data: OverviewResponse | null =
    state.status === 'ready'
      ? state.data
      : state.status === 'error' && DEMO_MODE && isNoSession(state.error)
        ? DEMO_OVERVIEW
        : null;

  return (
    <>
      <OverviewHead subtitle={subtitle} />
      {data !== null ? (
        <OverviewBody data={data} venueId={venueId} timezone={venue?.timezone ?? null} scanCooldown={venue?.scan_cooldown_hours ?? null} />
      ) : state.status === 'error' ? (
        <EmptyState
          icon="overview"
          title={dashboard.empty.overview.title}
          body={stateNote(state, dashboard)}
          action={
            isNoSession(state.error)
              ? undefined
              : { label: dashboard.empty.overview.action, onClick: () => openDrawer('deal') }
          }
        />
      ) : (
        <Card>
          <p className="dx-fine">{dashboard.unmeasured.asking}</p>
        </Card>
      )}
    </>
  );
}

function OverviewBody({
  data,
  venueId,
  timezone,
  scanCooldown,
}: {
  data: OverviewResponse;
  venueId: string | null;
  timezone: string | null;
  scanCooldown: number | null;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.overview;
  const money = useMoney();
  const num = useNum();
  const dates = useDates(timezone);
  const monthName = useMonthName();
  /* The other screens are screens on this frame, not routes, so a finding's
     press moves the rail rather than navigating. */
  const { goTo, openDrawer, range } = useDashboard();

  const analyticsApi = usePartnerAnalytics(venueId);
  const dealsApi = usePartnerDeals(venueId);
  const campaignsApi = usePartnerCampaigns(venueId);
  const reachApi = useReach(venueId);
  /* The one report here keyed on the range picker: a rolling window of days is
     the series' own unit. */
  const seriesApi = usePartnerSeries(venueId, range);
  const insightsApi = usePartnerInsights(venueId);
  const remindApi = usePartnerRemind(venueId);
  const quotaApi = usePartnerPushQuota(venueId);
  const passesApi = usePartnerPasses(venueId);
  const planApi = useVenuePlan(venueId);

  /* `readyOr` everywhere: the real answer wins, and a demo stand-in is reached
     only when there was no session to ask with, and only under `?demo=1`. */
  const reachRaw = readyOr(reachApi.state, DEMO_MODE ? DEMO_REACH : null);
  const reach = reachRaw ? reachFromApi(reachRaw) : null;
  const analytics = readyOr(analyticsApi.state, DEMO_MODE ? DEMO_ANALYTICS : null);
  const deals = readyOr(dealsApi.state, DEMO_MODE ? DEMO_DEALS : null);
  const campaigns = readyOr(campaignsApi.state, DEMO_MODE ? DEMO_CAMPAIGNS : null);
  const series = readyOr(seriesApi.state, DEMO_MODE ? demoSeries(range) : null);
  const insights = readyOr(insightsApi.state, DEMO_MODE ? DEMO_INSIGHTS : null);
  const remind = readyOr(remindApi.state, DEMO_MODE ? DEMO_REMIND : null);
  const quota = readyOr(quotaApi.state, DEMO_MODE ? DEMO_QUOTA : null);
  const passes: PassListResponse | null = readyOr(passesApi.state, DEMO_MODE ? DEMO_PASSES : null);
  const plan = readyOr(planApi.state, DEMO_MODE ? DEMO_VENUE_PLAN : null);

  const toEuro = (minor: number) => minorToEuro(minor, data.budget.currency);
  /* The venue's own average transaction — the median of its own confirmed scans. */
  const avgSpend = toEuro(data.budget.averageCheck.minor);
  const redeemed = series?.totals.vouchersRedeemed ?? 0;
  const totals = totalsFrom(data.overview, reach?.claims ?? 0, redeemed, avgSpend);
  const month = monthName(data.overview.period);

  const loyalty = campaignModel(
    (campaigns ?? []).map((row) => campaignFromApi(row, toEuro, scanCooldown)),
    data.budget.loyalty,
  );
  const liveCampaigns = loyalty.list.filter((campaign) => campaign.live);

  /* The vouchers still out, off the ladder's own count — every rung has to
     report it for the sum to mean anything; an older API that sends no
     `activeCount` gets the dash, never "0 vouchers". */
  const vouchersHeld = data.budget.tiers.every((tier) => tier.activeCount !== undefined)
    ? data.budget.tiers.reduce((sum, tier) => sum + (tier.activeCount ?? 0), 0)
    : null;
  const liveTiers = data.budget.tiers.filter((tier) => tier.active !== false);

  const liveDeals: PartnerDeal[] = (deals ?? [])
    .map((row) => dealFromApi(row, toEuro))
    .filter((deal) => deal.state === 'live');
  const livePasses = (passes?.passes ?? []).filter((pass) => pass.status === 'live');

  /* Nothing a customer can see or earn, and nobody has come: v3's idle state,
     which replaces the report rather than drawing a page of zeros. Only when
     every list was actually read — a list that failed is not an empty one. */
  const idle =
    deals !== null &&
    campaigns !== null &&
    liveDeals.length === 0 &&
    liveCampaigns.length === 0 &&
    livePasses.length === 0 &&
    totals.visits === 0;
  if (idle) {
    return (
      <EmptyState
        icon="deals"
        title={dashboard.empty.overview.title}
        body={dashboard.empty.overview.body}
        action={{ label: dashboard.empty.overview.action, onClick: () => openDrawer('deal') }}
      />
    );
  }

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
  /* A ratio nobody has both terms for is null, not zero — and never "Paylez
     lost you money", which is what a 0 in this slot reads as. */
  const roi = costTotal !== null && costTotal > 0 ? totals.attributedMoney / costTotal : null;

  /* ── what we noticed ── */
  const ins = copy.insights;
  const rows: NoticeRow[] = [];
  if (passes) {
    /* The pass findings lead, as v3 orders them. A draft is real (it exists and
       nobody can see it); the upsell only when the server made an estimate. */
    const draft = passes.passes.find((pass) => pass.status === 'draft');
    if (draft) {
      rows.push({
        key: 'pass-draft',
        rail: 'mint',
        lead: fill(copy.passDraft, { name: draft.name }),
        detail: copy.passDraftDetail,
        action: (
          <Button variant="primary" onClick={() => goTo('passes')}>
            {copy.passDraftAction}
          </Button>
        ),
      });
    }
    const upsell = passes.stats.upsell;
    if (upsell.minor !== null && upsell.minor > 0) {
      rows.push({
        key: 'pass-upsell',
        rail: 'good',
        lead: fill(copy.passUpsell, { amount: money(minorToEuro(upsell.minor, passes.currency), 'soft') }),
        detail: fill(copy.passUpsellDetail, { measured: num(upsell.measured), redemptions: num(upsell.redemptions) }),
        action: (
          <Button variant="primary" onClick={() => goTo('passes')}>
            {copy.passUpsellAction}
          </Button>
        ),
      });
    }
  }
  if (insights) {
    const { trend, tierReach: tier, itemVsPercent, unusedRewards } = insights;
    /* The trend and the tier are one row when both exist, because v3 argues
       them as one story — visits up, the tier out of reach. */
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
        rail: 'mint',
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
          <Button variant="primary" onClick={() => goTo('vouchers')}>
            {fill(ins.tierAction, { pct: num(tier.pct) })}
          </Button>
        ) : null,
      });
    }
    const items = itemVsPercent ? itemSentence(itemVsPercent, ins) : null;
    if (itemVsPercent && items) {
      rows.push({
        key: 'items',
        rail: 'mint',
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
          <Button variant="primary" onClick={() => goTo('deals')}>
            {ins.itemAction}
          </Button>
        ),
      });
    }
    if (unusedRewards) {
      rows.push({
        key: 'unused',
        rail: 'mint',
        lead: fill(ins.unusedText, {
          n: num(unusedRewards.n),
          amount: money(toEuro(unusedRewards.amountMinor), 'exact'),
        }),
        detail: ins.unusedDetail,
        action: <RemindPress venueId={venueId} remind={remind} reload={remindApi.reload} />,
      });
    }
  }

  /* ── the low-budget banner ── the server's own hint, loyalty side only, the
     way v3 draws it: loyalty running out while vouchers sit unused. */
  const hint = data.budget.rebalanceHint;
  const lowBudget = hint !== null && hint.to === 'loyalty';

  /* ── the measured repeat-visit multiple ── */
  const measured =
    analytics?.repeatMultiple && !analytics.repeatMultiple.suppressed ? analytics.repeatMultiple.value ?? null : null;

  const quotaChip = quota ? (
    <span className="dx-ov-quota" data-out={quota.remaining <= 0 ? 'true' : undefined}>
      <DxIcon name="bell" size={14} />
      {[
        quota.remaining > 0
          ? fill(copy.quota, { n: num(quota.remaining), total: num(quota.quota) })
          : copy.quotaOut,
        dates.nextMonth(quota.period) ? fill(copy.quotaResets, { date: dates.nextMonth(quota.period)! }) : null,
      ]
        .filter(Boolean)
        .join(' · ')}
    </span>
  ) : null;

  const nothingRunning =
    liveDeals.length === 0 && liveCampaigns.length === 0 && liveTiers.length === 0 && livePasses.length === 0;

  return (
    <div className="dx-ov">
      {lowBudget && (
        <div className="dx-ov-banner" role="status">
          <DxIcon name="swap" size={20} />
          <p>
            {fill(copy.budgetAlert, {
              month,
              amount: money(toEuro(data.budget.voucher.available), 'exact'),
            })}
          </p>
          <Button variant="primary" onClick={() => goTo('campaigns')}>
            {copy.budgetAction}
          </Button>
        </div>
      )}

      {/* The headline: three claims at three strengths — counted, estimated,
          and the subset we would defend. The server counts these over a
          calendar month, and the kicker names the month. */}
      <Card tone="ink" className="dx-ov-hero">
        <div className="dx-ov-hero-main">
          <Eyebrow tone="mint">{fill(copy.kicker, { range: month })}</Eyebrow>
          <span className="dx-ov-hero-label">{copy.countedLabel}</span>
          <p className="dx-ov-counted">
            <b>{num(totals.visits)}</b>
            <span>{copy.counted}</span>
          </p>
          <p className="dx-ov-counted-new">
            {data.overview.newCustomers.suppressed
              ? dashboard.unmeasured.withheld
              : withFigure(copy.countedNew, '{n}', <b>{num(totals.newCustomers)}</b>)}
          </p>

          <div className="dx-ov-estimate">
            <span className="dx-ov-chip">{copy.estimateTag}</span>
            <b>{fill(copy.estimate, { amount: money(totals.estimate, 'soft') })}</b>
            <p>{fill(copy.estimateNote, { avg: money(avgSpend, 'unit') })}</p>
          </div>

          <div className="dx-ov-claim">
            <Eyebrow tone="mint">{copy.claimTitle}</Eyebrow>
            <b>
              {fill(copy.claim, {
                visits: num(totals.attributed),
                amount: money(totals.attributedMoney, 'soft'),
              })}
            </b>
            <p>{copy.claimNote}</p>
          </div>
        </div>

        <div className="dx-ov-support">
          <div>
            <span>
              <b>{copy.support[0].label}</b>
              <i>{copy.support[0].note}</i>
            </span>
            <strong>{num(totals.visits)}</strong>
          </div>
          <div>
            <span>
              <b>{copy.support[1].label}</b>
              <i>{copy.support[1].note}</i>
            </span>
            <strong>{money(avgSpend, 'unit')}</strong>
          </div>
          <div>
            <span>
              <b>{copy.support[2].label}</b>
              <i>{copy.support[2].note}</i>
            </span>
            <strong>
              <Figure metric={data.overview.newCustomers} format={num} />
            </strong>
          </div>
        </div>
      </Card>

      {/* What it cost, and the verdict — only when both halves are known. */}
      <Card className="dx-ov-cost">
        <div className="dx-ov-cost-rows">
          <div className="dx-ov-cost-head">
            <h2>{copy.costTitle}</h2>
            <span className="dx-ov-month">{month}</span>
          </div>
          {costRows === null || costTotal === null ? (
            <p className="dx-fine">{stateNote(analyticsApi.state, dashboard) || dashboard.unmeasured.serverSilent}</p>
          ) : (
            <>
              {copy.costRows.map((label, index) => (
                <div className="dx-ov-cost-row" key={label}>
                  <span>{label}</span>
                  <b>{money(costRows[index], 'exact')}</b>
                </div>
              ))}
              <div className="dx-ov-cost-row" data-total="true">
                <span>{copy.costTotal}</span>
                <b>{money(costTotal, 'exact')}</b>
              </div>
            </>
          )}
        </div>
        {costTotal !== null && (
          <div className="dx-ov-return">
            <span>{copy.returnLabel}</span>
            <b>{money(totals.attributedMoney, 'soft')}</b>
            {roi !== null && (
              <p className="dx-ov-verdict" data-good={roi >= 1 ? 'true' : 'false'}>
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
        )}
      </Card>

      {/* Four counts over the picker's window, each against the same length of
          window before it: values, sparklines and deltas all off `series`, so
          they move with the range picker together. A window whose previous
          figure was zero gets no percentage — "new" or a plain sentence. */}
      <div className="dx-metrics">
        {TILES.map((tile, index) => {
          const value = series ? tile.pick(series.totals) : null;
          const delta = series ? deltaOf(tile.pick(series.totals), tile.pick(series.previous)) : null;
          const note =
            delta === null
              ? stateNote(seriesApi.state, dashboard)
              : delta.kind === 'none'
                ? copy.quietBoth
                : delta.kind === 'new'
                  ? `${copy.deltaNew} · ${copy.sinceNone}`
                  : delta.kind === 'flat'
                    ? `±0% ${copy.since}`
                    : copy.since;
          return (
            <Metric
              key={copy.tiles[index]}
              label={copy.tiles[index]}
              value={
                value === null ? (
                  <span className="dx-ov-withheld" title={stateNote(seriesApi.state, dashboard)}>
                    —
                  </span>
                ) : (
                  num(value)
                )
              }
              delta={
                delta && (delta.kind === 'up' || delta.kind === 'down')
                  ? { text: `${num(delta.pct)}%`, dir: delta.kind }
                  : undefined
              }
              note={note}
              spark={series ? buckets(series.series.map(tile.day)) : undefined}
              sparkTone={tile.tone}
            />
          );
        })}
      </div>

      {/* The one claim here that is counted rather than modelled: every
          campaign member's visit rate after joining over their rate before,
          averaged. Cohort-suppressed, and absent on a plan without deep
          analytics — each of which says so instead of drawing bars. */}
      {(() => {
        if (measured === null && !PD_SEED) {
          if (analytics === null) return null;
          return (
            <Card className="dx-ov-proof">
              <div>
                <Eyebrow>{copy.proofTitle}</Eyebrow>
                <p className="dx-fine">
                  {analytics.repeatMultiple === undefined
                    ? dashboard.unmeasured.planLocked
                    : dashboard.unmeasured.withheld}
                </p>
              </div>
            </Card>
          );
        }
        /* The server answers with a ratio, so its baseline is 1 by construction;
           the seeded pair (demo only, and tagged so) is the mock's rate. */
        const now = measured ?? SEED_REPEAT.now;
        const before = measured === null ? SEED_REPEAT.before : 1;
        return (
          <Card className="dx-ov-proof">
            <div>
              <div className="dx-ov-proof-kick">
                <Eyebrow>{copy.proofTitle}</Eyebrow>
                {measured === null && <Pill tone="neutral" size="sm">{dashboard.unmeasured.sample}</Pill>}
              </div>
              <p className="dx-ov-statement">
                {withFigure(copy.proof, '{n}', <b>{(now / before).toFixed(1)}</b>)}
              </p>
              <p className="dx-fine">{copy.proofNote}</p>
            </div>
            <div className="dx-ov-bars" aria-hidden>
              <span>
                <i style={{ height: `${Math.round((before / Math.max(now, 0.01)) * 102)}px` }} />
                <b>{before.toFixed(1)}</b>
                {copy.before}
              </span>
              <span data-on="true">
                <i style={{ height: '102px' }} />
                <b>{now.toFixed(1)}</b>
                {copy.now}
              </span>
            </div>
          </Card>
        );
      })()}

      {/* Visits against voucher redemptions, day by day, over the picker's
          window — zero-filled by the server, so a quiet Tuesday is a point on
          the line rather than a gap in it. */}
      <Card className="dx-ov-chart-card">
        <CardHead
          title={copy.chartTitle}
          sub={copy.chartNote}
          aside={
            <div className="dx-ov-key">
              <span data-series="visits">
                <i aria-hidden />
                {copy.chartVisits}
              </span>
              <span data-series="redeemed">
                <i aria-hidden />
                {copy.chartRedeemed}
              </span>
            </div>
          }
        />
        {series !== null ? (
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
        ) : (
          <p className="dx-fine">{stateNote(seriesApi.state, dashboard)}</p>
        )}
      </Card>

      {/* Who saw you — kept from the screen before v3 (see the header). */}
      <Card className="dx-ov-reach">
        <CardHead
          title={copy.reachTitle}
          sub={reach && (reach.seen > 0 || reach.clicks > 0) ? copy.reachLive : undefined}
          aside={reachRaw?.period ? <span className="dx-ov-month">{monthName(reachRaw.period)}</span> : undefined}
        />
        {reach === null ? (
          <p className="dx-fine">{stateNote(reachApi.state, dashboard)}</p>
        ) : reach.seen === 0 && reach.clicks === 0 ? (
          <p className="dx-fine">{copy.reachEmpty}</p>
        ) : (
          <>
            <div className="dx-ov-stats">
              {[
                { value: num(reach.seen), label: copy.reachSeen, note: copy.reachSeenNote },
                { value: num(reach.clicks), label: copy.reachClicks, note: copy.reachClicksNote },
                { value: `${reach.clickRate.toFixed(1)}%`, label: copy.reachRate, note: copy.reachRateNote },
                { value: num(reach.claims), label: copy.reachClaims, note: copy.reachClaimsNote },
              ].map((stat) => (
                <div key={stat.label}>
                  <span className="dx-ov-stat-label">{stat.label}</span>
                  <b>{stat.value}</b>
                  <i>{stat.note}</i>
                </div>
              ))}
            </div>
            <div className="dx-ov-split">
              <div className="dx-ov-split-row" data-head="true">
                <span>{copy.reachSplit}</span>
                <b>{copy.reachSeen}</b>
                <b>{copy.reachClicks}</b>
              </div>
              <div className="dx-ov-split-row">
                <span>{copy.reachListing}</span>
                <b>{num(reach.listingSeen)}</b>
                <b>{num(reach.listingClicks)}</b>
              </div>
              <div className="dx-ov-split-row">
                <span>{copy.reachDeals}</span>
                <b>{num(reach.dealSeen)}</b>
                <b>{num(reach.dealClicks)}</b>
              </div>
              {(reachRaw?.sources ?? []).map((source) => {
                /* A surface the dictionary does not name reads "somewhere else",
                   never its raw key. */
                const label =
                  copy.reachSources[source.source as keyof typeof copy.reachSources] ?? copy.reachSources.unknown;
                return (
                  <div className="dx-ov-split-row" data-sub="true" key={source.source}>
                    <span>{label}</span>
                    <b>{num(source.impressions)}</b>
                    <b>{num(source.clicks)}</b>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <Card className="dx-ov-holding">
        <div>
          <h2>{copy.holdingTitle}</h2>
          <p className="dx-ov-holding-line">
            {fill(copy.holding, {
              rewards: campaigns === null ? '—' : num(loyalty.holding),
              vouchers: vouchersHeld === null ? '—' : num(vouchersHeld),
              amount: money(toEuro(data.budget.loyalty.reserved + data.budget.voucher.reserved), 'exact'),
            })}
          </p>
          <p className="dx-fine">{copy.holdingNote}</p>
          <RemindNotes remind={remind} className="dx-fine" />
        </div>
        <RemindPress venueId={venueId} remind={remind} reload={remindApi.reload} />
      </Card>

      {/* What the month noticed — the server's findings, and nothing else. */}
      <Card pad="none" className="dx-ov-notices">
        <div className="dx-ov-notices-head">
          <i aria-hidden />
          <Eyebrow>{copy.noticed}</Eyebrow>
        </div>
        {insights === null && passes === null ? (
          <p className="dx-fine dx-ov-notices-empty">{stateNote(insightsApi.state, dashboard)}</p>
        ) : rows.length === 0 ? (
          <p className="dx-fine dx-ov-notices-empty">{dashboard.unmeasured.noFindings}</p>
        ) : (
          rows.map((row) => (
            <div className="dx-ov-notice" data-rail={row.rail} key={row.key}>
              <div>
                <p className="dx-ov-notice-lead">{row.lead}</p>
                {row.detail && <p className="dx-ov-notice-detail">{row.detail}</p>}
              </div>
              <div className="dx-ov-acts">
                {row.action}
                <Button variant="secondary" onClick={() => goTo('assistant')}>
                  {copy.askAssistant}
                </Button>
              </div>
            </div>
          ))
        )}
      </Card>

      <Subscriptions passes={passes} state={passesApi.state} plan={plan} />

      {/* Everything a customer could walk in and use today. */}
      <Card pad="none" className="dx-ov-running">
        <div className="dx-ov-running-head">
          <CardHead title={copy.runningTitle} sub={copy.runningNote} aside={quotaChip} />
        </div>
        {nothingRunning ? (
          <p className="dx-fine dx-ov-notices-empty">{dashboard.empty.overview.body}</p>
        ) : (
          <>
            {liveDeals.map((deal) => {
              const push = deal.push;
              const tag =
                push && push.at && push.kind !== 'stopped'
                  ? {
                      tone: push.kind === 'sent' ? ('sent' as const) : ('set' as const),
                      text: fill(push.kind === 'sent' ? copy.notifySentAt : copy.notifyAt, {
                        when: dates.moment(push.at),
                      }),
                    }
                  : null;
              return (
                <RunRow
                  key={deal.id}
                  kind="deal"
                  name={deal.name || deal.badge}
                  rule={[deal.schedule, deal.to ? fill(copy.ends, { date: dates.instant(deal.to) }) : null]
                    .filter(Boolean)
                    .join(' · ')}
                  tag={tag}
                  stat={num(deal.claimed)}
                  statLabel={copy.claims}
                  acts={<RowActs kind="deal" id={deal.id} reload={dealsApi.reload} />}
                />
              );
            })}
            {liveCampaigns.map((campaign) => (
              <RunRow
                key={campaign.id}
                kind="campaign"
                name={campaign.name}
                rule={`${fill(dashboard.campaigns.rule, {
                  visits: num(campaign.visits),
                  reward: campaign.reward,
                })} · ${fill(dashboard.words.each, { amount: money(campaign.cost, 'unit') })}`}
                stat={`${num(campaign.used)} / ${num(campaign.earned)}`}
                statLabel={copy.usedEarned}
                acts={<RowActs kind="campaign" id={campaign.id} reload={campaignsApi.reload} />}
              />
            ))}
            {liveTiers.length > 0 && (
              <RunRow
                kind="vouchers"
                name={liveTiers.length === 3 ? copy.tierBundle : copy.tierLadder}
                rule={fill(copy.tierRule, {
                  tiers: liveTiers.map((tier) => `${num(tier.discountPct)}%`).join(' · '),
                })}
                stat={money(toEuro(data.budget.voucher.spent), 'exact')}
                statLabel={copy.givenAway}
                acts={
                  <div className="dx-ov-acts">
                    {/* The ladder is edited on its own screen; there is no
                        endpoint that pauses a ladder, so no Pause is drawn. */}
                    <Button variant="small" onClick={() => goTo('vouchers')}>
                      {dashboard.acts.edit}
                    </Button>
                  </div>
                }
              />
            )}
            {livePasses.map((pass) => (
              <RunRow
                key={pass.id}
                kind="pass"
                accent={pass.accent}
                name={pass.name}
                rule={passRule(pass, copy, num, money(minorToEuro(pass.priceMinor, pass.currency), 'exact'))}
                stat={num(pass.stats.subscribers)}
                statLabel={copy.subscribers}
                acts={<PassActs venueId={venueId} id={pass.id} reload={passesApi.reload} />}
              />
            ))}
          </>
        )}
      </Card>
    </div>
  );
}

/* ───────────────────────────────────────────────────── subscriptions ── */

/**
 * "Your subscriptions" — the passes' four headline figures with a way to the
 * Passes screen, or v3's promo when there is no live pass.
 *
 * Which promo is the plan's `passes` entitlement: on it, "Create a pass"; off
 * it, "See Growth", which opens the frame's plan sheet ("Create a pass" leads to
 * the Passes screen, which owns the drawer). A plan that could not be read draws the promo with
 * no badge rather than guessing which plan the venue is on.
 */
function Subscriptions({
  passes,
  state,
  plan,
}: {
  passes: PassListResponse | null;
  state: ApiState<PassListResponse>;
  plan: VenuePlanLite | null;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.overview.subs;
  const money = useMoney();
  const num = useNum();
  const { goTo, openPlan } = useDashboard();

  if (passes === null) {
    if (state.status === 'error' && isNoSession(state.error)) return null;
    return (
      <Card>
        <CardHead title={copy.title} />
        <p className="dx-fine">{stateNote(state, dashboard)}</p>
      </Card>
    );
  }

  const entitled = plan === null ? null : plan.entitlements.passes === 'true';

  if (passes.stats.livePasses === 0) {
    return (
      <Card tone="ink" className="dx-ov-promo">
        <div>
          <div className="dx-ov-promo-kick">
            <Eyebrow tone="mint">{copy.kicker}</Eyebrow>
            {entitled !== null && (
              <span className="dx-ov-promo-badge" data-locked={entitled ? undefined : 'true'}>
                {copy.included}
              </span>
            )}
          </div>
          <p className="dx-ov-promo-title">{copy.promoTitle}</p>
          <p className="dx-ov-promo-body">{copy.promoBody}</p>
        </div>
        <Button variant="mint" onClick={entitled === false ? openPlan : () => goTo('passes')}>
          {entitled === false ? copy.seeGrowth : copy.create}
        </Button>
      </Card>
    );
  }

  const { stats } = passes;
  const toEuro = (minor: number) => minorToEuro(minor, passes.currency);
  const recurring = money(toEuro(stats.recurringMinor), 'exact');

  return (
    <Card className="dx-ov-subs">
      <div className="dx-ov-subs-head">
        <div>
          <div className="dx-ov-subs-title">
            <h2>{copy.title}</h2>
            {entitled && <span className="dx-ov-included">{copy.included}</span>}
          </div>
          <p className="dx-card-sub">{fill(copy.framing, { amount: recurring })}</p>
        </div>
        <Button variant="secondary" onClick={() => goTo('passes')}>
          {copy.manage}
          <DxIcon name="chevronRight" size={14} />
        </Button>
      </div>
      <div className="dx-ov-stats">
        <div data-dot="deep">
          <span className="dx-ov-stat-label">{copy.active}</span>
          <b>{num(stats.activeSubscribers)}</b>
          <i>{copy.activeNote}</i>
        </div>
        <div data-dot="ink">
          <span className="dx-ov-stat-label">{copy.recurring}</span>
          <b>{recurring}</b>
          <i>{copy.recurringNote}</i>
        </div>
        <div data-dot="amber">
          <span className="dx-ov-stat-label">{copy.redemptions}</span>
          <b>{num(stats.redemptionsThisMonth)}</b>
          <i>{copy.redemptionsNote}</i>
        </div>
        <div data-dot="purple">
          <span className="dx-ov-stat-label">{copy.upsell}</span>
          {stats.upsell.minor === null ? (
            <>
              <b className="dx-ov-withheld">—</b>
              <i>{stats.upsell.reason ? copy.upsellWhy[stats.upsell.reason] : copy.upsellNote}</i>
            </>
          ) : (
            <>
              <b data-tone="purple">{money(toEuro(stats.upsell.minor), 'soft')}</b>
              <i>{copy.upsellNote}</i>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
