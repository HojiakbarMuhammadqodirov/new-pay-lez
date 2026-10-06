/**
 * Hot deals — v3 §3.2, rebuilt on the kit.
 *
 * Moved out of `dashboardScreens.tsx`, where it was the second of four screens
 * in one module. One white card: a toolbar (search, the state filter, the
 * month's notification allowance, the count), the one finding the server makes
 * about offers, and the table — each row opening into what happened to that
 * deal step by step.
 *
 * ── what is drawn, and what v3 draws that this does not ───────────────────
 *
 * Every figure is the server's: `GET …/deals` for the rows and their funnels,
 * `…/push-quota` for the allowance, `…/insights` for the finding, `…/audiences`
 * for how many people a deal's audience can be notified. Four v3 elements are
 * absent because nothing backs them, and each is absent rather than faked:
 *
 * - **"Stopped"** is not a state the server has. A deal at its claim limit stays
 *   `live`; the row says it reached its limit instead. The filter offers the
 *   states that exist — Draft and Ended among them.
 * - **"Change the time" / "Cancel it"** on a scheduled notification: a deal has
 *   one push, unique on the deal, and there is no endpoint to move or cancel it.
 * - **The branch chip and the branch card**: a venue here is one place. The top
 *   bar's switcher is how an owner with several moves between them.
 * - **"About a third of what your 15% deals average"**: no endpoint compares a
 *   finished deal with its siblings, so the retrospective says what it ran for
 *   and what it got, and stops.
 *
 * ── the writes ─────────────────────────────────────────────────────────────
 *
 * Publish, pause, resume, extend, end and the one notification are the same
 * calls the old table made. `useAction` owns the three things a write needs —
 * the lock while it is in flight, a failure named by kind, and a re-read of the
 * list rather than a patched row, because what a deal's status *became* is the
 * server's answer (extending an expired deal revives it; publishing may land on
 * `scheduled`). "Copy" opens the create drawer filled from the row, which is a
 * real new deal through the real create call — not a duplicate endpoint.
 */
import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { ApiError } from './api/client';
import {
  extendDeal,
  isNoSession,
  minorToEuro,
  publishDeal,
  readyOr,
  scheduleDealPush,
  setDealStatus,
  usePartnerAudiences,
  usePartnerDeals,
  usePartnerInsights,
  usePartnerPushQuota,
  venueInstant,
  type AudienceRow,
  type DealResponse,
  type DealStatus,
  type InsightsResponse,
  type PushQuotaResponse,
} from './api/partner';
import { DEMO_AUDIENCES, DEMO_DEALS, DEMO_INSIGHTS, DEMO_QUOTA, DEMO_VENUE } from './dashboardDemo';
import {
  clockOf,
  dayLabel,
  daysBetween,
  daysFromRow,
  localDay,
  pickOf,
  resetDate,
  segmentOf,
  weekdaysOf,
} from './dashboardDealsModel';
import { useNum } from './dashboardFormat';
import { Button, Card, ConfirmDialog, DxIcon, EmptyState, Pill, Segmented, Sparkline, type PillTone } from './dashboardKit';
import { useDashboard } from './dashboardShell';
import type { DrawerPrefill } from './dashboardShell';
import { DEMO_MODE } from './demoMode';
import { useCopy, useLanguage, useMoney } from './i18n/context';
import { fill } from './i18n/currency';
import { dealFromApi, metricValue, type PartnerDeal } from './partnerMetrics';
import './dashboard-deals.css';

type DashboardCopy = ReturnType<typeof useCopy>['dashboard'];
type Filter = 'all' | DealStatus;
type DealSort = 'name' | 'state' | 'seen' | 'opened' | 'claimed' | 'rate' | 'cost';

/** The filter row, in the order a deal moves through its life. */
const FILTERS: Filter[] = ['all', 'live', 'scheduled', 'paused', 'draft', 'expired', 'archived'];

/**
 * The columns, with v3's widths. `key: null` is a column with nothing to sort
 * by — the sparkline, whose order *is* the sort you would ask it for — and the
 * actions. Labels are `copy.dashboard.deals.columns`, index-aligned.
 */
const COLUMNS: Array<{ key: DealSort | null; align: 'left' | 'right'; width: string }> = [
  { key: 'name', align: 'left', width: '28%' },
  { key: 'state', align: 'left', width: '9%' },
  { key: 'seen', align: 'right', width: '7%' },
  { key: 'opened', align: 'right', width: '7%' },
  { key: 'claimed', align: 'right', width: '10%' },
  { key: 'rate', align: 'right', width: '9%' },
  { key: 'cost', align: 'right', width: '8%' },
  { key: null, align: 'left', width: '9%' },
];

const PILL: Record<DealStatus, PillTone> = {
  live: 'live',
  scheduled: 'scheduled',
  paused: 'paused',
  draft: 'draft',
  expired: 'ended',
  archived: 'ended',
};

/** A deal that has never been in front of anybody — its funnel is "not started", not zero. */
const notStarted = (state: DealStatus) => state === 'draft' || state === 'scheduled';

/** Claims over impressions, in percent: whether the offer converted the people who saw it. */
const claimRate = (deal: PartnerDeal) => (deal.seen === 0 ? 0 : (deal.claimed / deal.seen) * 100);

/* ─────────────────────────────────────────────────────────────── writing ── */

/** The sentence for a write that did not land, by kind. */
function refusalText(cause: unknown, dashboard: DashboardCopy): string {
  if (cause instanceof ApiError && cause.status === 0) return dashboard.acts.offline;
  if (cause instanceof ApiError && cause.status === 401) return dashboard.unmeasured.noSession;
  return fill(dashboard.acts.refused, { why: cause instanceof Error ? cause.message : String(cause) });
}

/** A write, its two endings, and the re-read after it — see the file header. */
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

/* ───────────────────────────────────────────────────────────────── dates ── */

/**
 * Localised dates, from `Intl`. A bare `YYYY-MM-DD` is pinned to UTC and read
 * in UTC, so a window is not filed a day early west of Greenwich; an instant is
 * read on the **venue's** clock, because "07:30" on a notification is the
 * café's half past seven, not the reader's.
 */
function useDealDates(timezone: string) {
  const [language] = useLanguage();
  return useMemo(() => {
    const make = (options: Intl.DateTimeFormatOptions, zone: string) => {
      try {
        return new Intl.DateTimeFormat(language, { ...options, timeZone: zone });
      } catch {
        return new Intl.DateTimeFormat(language, options);
      }
    };
    const shortDay = make({ day: 'numeric', month: 'short' }, 'UTC');
    const shortAt = make({ day: 'numeric', month: 'short' }, timezone);
    const longDay = make({ day: 'numeric', month: 'long' }, 'UTC');
    const moment = make({ day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, timezone);
    const bare = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso);
    return {
      /** A deal's start or end, short. */
      edge: (iso: string) =>
        bare(iso) ? shortDay.format(new Date(`${iso}T00:00:00Z`)) : shortAt.format(new Date(iso)),
      /** An instant, as a day and a clock on the venue's own time. */
      moment: (iso: string) => moment.format(new Date(iso)),
      /** A calendar day held as a UTC midnight. */
      day: (date: Date) => longDay.format(date),
    };
  }, [language, timezone]);
}

/* ═══════════════════════════════════════════════════════════════ screen ══ */

export function Deals() {
  const dashboard = useCopy().dashboard;
  const { venueId, venue: chosen } = useDashboard();
  const venue = chosen ?? (DEMO_MODE ? DEMO_VENUE : null);

  const dealsApi = usePartnerDeals(venueId);
  /* Their own requests, so a venue whose deals load while one of these fails
     still gets its table — each panel then says nothing rather than a zero. */
  const quotaApi = usePartnerPushQuota(venueId);
  const insightsApi = usePartnerInsights(venueId);
  const audiencesApi = usePartnerAudiences(venueId);
  const quota = readyOr(quotaApi.state, DEMO_MODE ? DEMO_QUOTA : null);
  const insights = readyOr(insightsApi.state, DEMO_MODE ? DEMO_INSIGHTS : null);
  const audiences = readyOr(audiencesApi.state, DEMO_MODE ? DEMO_AUDIENCES : null);

  const state = dealsApi.state;
  if (state.status === 'loading') {
    return (
      <Card>
        <p className="dx-fine">{dashboard.unmeasured.asking}</p>
      </Card>
    );
  }

  let rows: DealResponse[];
  if (state.status === 'error') {
    if (!(DEMO_MODE && isNoSession(state.error))) {
      /* "We could not ask" — never an empty table, which would say the venue
         has no deals. The reason is the second paragraph's job. */
      return (
        <EmptyState
          icon="deals"
          title={dashboard.empty.deals.title}
          body={isNoSession(state.error) ? dashboard.unmeasured.noSession : dashboard.unmeasured.serverSilent}
        />
      );
    }
    rows = DEMO_DEALS;
  } else {
    rows = state.data;
  }

  return (
    <DealsBoard
      rows={rows}
      currency={venue?.currency ?? 'EUR'}
      timezone={venue?.timezone ?? 'Europe/Warsaw'}
      quota={quota}
      insights={insights}
      audiences={audiences}
      reload={dealsApi.reload}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════ board ══ */

function DealsBoard({
  rows,
  currency,
  timezone,
  quota,
  insights,
  audiences,
  reload,
}: {
  rows: DealResponse[];
  currency: string;
  timezone: string;
  quota: PushQuotaResponse | null;
  insights: InsightsResponse | null;
  audiences: AudienceRow[] | null;
  reload: () => void;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.deals;
  const num = useNum();
  const dates = useDealDates(timezone);
  const { openDrawer } = useDashboard();

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  /* Claim rate, best first: the only column that says whether a deal *worked*. */
  const [sort, setSort] = useState<DealSort>('rate');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [open, setOpen] = useState<string | null>(null);

  const deals = rows.map((row) => ({ row, deal: dealFromApi(row, (minor) => minorToEuro(minor, currency)) }));

  const q = search.trim().toLowerCase();
  const shown = deals
    .filter(({ deal }) => filter === 'all' || deal.state === filter)
    .filter(({ deal }) => q === '' || `${deal.name} ${deal.badge} ${deal.terms}`.toLowerCase().includes(q))
    .sort((a, b) => {
      /* Live and scheduled first, whatever the sort — the two an owner can
         still do something about. */
      const rank = (d: PartnerDeal) => (d.state === 'live' || d.state === 'scheduled' ? 0 : 1);
      if (rank(a.deal) !== rank(b.deal)) return rank(a.deal) - rank(b.deal);
      const value = (d: PartnerDeal): string | number =>
        sort === 'name'
          ? (d.name || d.badge).toLowerCase()
          : sort === 'state'
            ? d.state
            : sort === 'seen'
              ? d.seen
              : sort === 'opened'
                ? d.opened
                : sort === 'claimed'
                  ? d.claimed
                  : sort === 'cost'
                    ? d.cost
                    : claimRate(d);
      const va = value(a.deal);
      const vb = value(b.deal);
      if (va === vb) return 0;
      return (va > vb ? 1 : -1) * (dir === 'asc' ? 1 : -1);
    });

  const onSort = (key: DealSort) => {
    if (key === sort) setDir((was) => (was === 'desc' ? 'asc' : 'desc'));
    else {
      setSort(key);
      setDir('desc');
    }
  };

  const finding = insights?.itemVsPercent ? offerSentence(insights.itemVsPercent, dashboard.overview.insights) : null;
  const reset = dates.day(resetDate(quota?.period));

  return (
    <Card pad="none" className="dx-deals">
      <div className="dx-deals-toolbar">
        <label className="dx-deals-search">
          <DxIcon name="search" size={15} strokeWidth={2} />
          <input
            type="search"
            value={search}
            placeholder={copy.search}
            aria-label={copy.search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <Segmented
          label={copy.columns[1]}
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((value) => ({ value, label: copy.stateFilters[value] }))}
        />
        <span className="dx-deals-spacer" />
        {quota && (
          <span className="dx-deals-quota" data-out={quota.remaining === 0 ? 'true' : undefined}>
            <DxIcon name="bell" size={14} strokeWidth={1.9} />
            {quota.remaining > 0
              ? fill(copy.quotaLine, { n: num(quota.remaining), total: num(quota.quota), date: reset })
              : fill(copy.quotaNone, { date: reset })}
          </span>
        )}
        <span className="dx-deals-count">{fill(copy.count, { n: num(shown.length), total: num(deals.length) })}</span>
      </div>

      {shown.length === 0 ? (
        <div className="dx-deals-none">
          <span className="dx-deals-none-ico">
            <DxIcon name="deals" size={21} />
          </span>
          <b>
            {deals.length === 0
              ? copy.emptyTitle
              : q
                ? fill(copy.searchTitle, { q: search.trim() })
                : fill(copy.filterTitle, { filter: copy.stateFilters[filter] })}
          </b>
          <p>
            {deals.length === 0
              ? copy.emptyBody
              : q
                ? fill(copy.searchBody, { n: num(deals.length) })
                : copy.filterBody}
          </p>
          <div className="dx-deals-none-acts">
            <Button variant="primary" onClick={() => openDrawer('deal')}>
              {dashboard.actions.newDeal}
            </Button>
            {deals.length > 0 && (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setFilter('all');
                }}
              >
                {copy.clearFilters}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          {finding && (
            <p className="dx-deals-insight">
              <DxIcon name="bulb" size={15} strokeWidth={1.9} />
              <span>{finding}</span>
            </p>
          )}
          <p className="dx-deals-sortnote">{copy.sortNote}</p>
          <div className="dx-table-wrap">
            <table className="dx-table dx-deals-table">
              <thead>
                <tr>
                  {COLUMNS.map((column, index) => {
                    const key = column.key;
                    return (
                      <th
                        key={copy.columns[index]}
                        style={{ width: column.width }}
                        data-align={column.align}
                        aria-sort={key === sort ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
                      >
                        {key ? (
                          <button type="button" onClick={() => onSort(key)}>
                            {copy.columns[index]}
                            <i aria-hidden>{key === sort ? (dir === 'asc' ? '▲' : '▼') : ''}</i>
                          </button>
                        ) : (
                          copy.columns[index]
                        )}
                      </th>
                    );
                  })}
                  <th data-align="right" style={{ width: '13%' }}>
                    <span className="visually-hidden">{dashboard.acts.column}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ row, deal }) => (
                  <DealRow
                    key={deal.id}
                    row={row}
                    deal={deal}
                    open={open === deal.id}
                    onToggle={() => setOpen((was) => (was === deal.id ? null : deal.id))}
                    dates={dates}
                    timezone={timezone}
                    quota={quota}
                    audiences={audiences}
                    reload={reload}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

/**
 * The finding about offers, as one sentence — or `null` when there is no
 * honest one. The server sends item-over-percent; when percent wins the
 * sentence turns round and its multiple is recomputed from the four counts
 * rather than inverted from a figure already rounded.
 */
function offerSentence(
  finding: NonNullable<InsightsResponse['itemVsPercent']>,
  copy: DashboardCopy['overview']['insights'],
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

/* ═════════════════════════════════════════════════════════════════ row ══ */

type Dates = ReturnType<typeof useDealDates>;

/** Who a stored deal is shown to, as the picker's word for it — or null for a segment it has none for. */
function useAudienceLabel() {
  const copy = useCopy().dashboard.deals;
  return (row: DealResponse): string | null => {
    const pick = pickOf(row.target_audience, row.target_languages);
    if (pick >= 0) return copy.audiences[pick];
    return segmentOf(row.target_audience, row.target_languages) === 'returning' ? copy.audienceReturning : null;
  };
}

/** The days and hours, as one line in the reader's language. */
function useWhen() {
  const dashboard = useCopy().dashboard;
  return (row: DealResponse): string => {
    const days = dayLabel(
      daysFromRow(row.target_weekdays),
      dashboard.customers.days,
      dashboard.deals.anytime,
      dashboard.drawer.deal.noDays,
    );
    return row.target_from_min !== null && row.target_to_min !== null
      ? `${days}, ${clockOf(row.target_from_min)}–${clockOf(row.target_to_min)}`
      : days;
  };
}

/** What a deal's row would pre-fill as a new one — the "Copy" press. Dates are left to the form's own. */
function prefillOf(row: DealResponse): DrawerPrefill {
  return {
    deal: {
      title: row.copy?.title,
      description: row.copy?.description,
      discountText: row.discount_text ?? undefined,
      targetWeekdays: weekdaysOf(daysFromRow(row.target_weekdays)),
      targetFromMin: row.target_from_min ?? undefined,
      targetToMin: row.target_to_min ?? undefined,
      capClaims: row.cap_claims ?? undefined,
    },
  };
}

function DealRow({
  row,
  deal,
  open,
  onToggle,
  dates,
  timezone,
  quota,
  audiences,
  reload,
}: {
  row: DealResponse;
  deal: PartnerDeal;
  open: boolean;
  onToggle: () => void;
  dates: Dates;
  timezone: string;
  quota: PushQuotaResponse | null;
  audiences: AudienceRow[] | null;
  reload: () => void;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.deals;
  const acts = dashboard.acts;
  const num = useNum();
  const money = useMoney();
  const audienceLabel = useAudienceLabel();
  const when = useWhen();
  const { openDrawer, toast } = useDashboard();
  const { busy, run } = useAction(reload);
  const working = busy !== null;

  const fresh = notStarted(deal.state);
  const dim = deal.state === 'expired' || deal.state === 'archived';
  const limitPct = deal.limit > 0 ? Math.min(100, (deal.claimed / deal.limit) * 100) : 0;
  const range = deal.from || deal.to ? [deal.from, deal.to].filter(Boolean).map((iso) => dates.edge(iso as string)).join(' – ') : null;
  const audience = audienceLabel(row);

  /* The row's second button, by state. Copy is a new deal filled from this
     one, because a finished deal's dates are gone and resuming it is not a
     thing the server does. */
  const second: ReactNode =
    deal.state === 'draft' ? (
      <Button variant="small" disabled={working} onClick={() => void run('publish', acts.published, () => publishDeal(deal.id))}>
        {acts.publish}
      </Button>
    ) : deal.state === 'live' || deal.state === 'scheduled' ? (
      <Button variant="small" disabled={working} onClick={() => void run('pause', acts.paused, () => setDealStatus(deal.id, 'paused'))}>
        {acts.pause}
      </Button>
    ) : deal.state === 'paused' ? (
      <Button variant="small" disabled={working} onClick={() => void run('resume', acts.resumed, () => setDealStatus(deal.id, 'live'))}>
        {acts.resume}
      </Button>
    ) : (
      <Button
        variant="small"
        disabled={working}
        onClick={() => {
          openDrawer('deal', undefined, prefillOf(row));
          toast(copy.copied);
        }}
      >
        {copy.copy}
      </Button>
    );

  return (
    <>
      {/*
        The row opens itself. The toggle ignores presses that land inside a
        control, and the deal's name is the keyboard's way in — a `<button>`
        cannot wrap nine cells, so the name carries `aria-expanded`.
      */}
      <tr
        className="dx-deals-row"
        data-dim={dim ? 'true' : undefined}
        data-open={open ? 'true' : undefined}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('button, a, input, label')) return;
          onToggle();
        }}
      >
        <td>
          <div className="dx-deals-cell">
            <span className="dx-deals-badge" data-live={deal.state === 'live' ? 'true' : undefined}>
              {deal.badge || copy.form.previewBadge}
            </span>
            <div className="dx-deals-what">
              <button type="button" className="dx-deals-name" aria-expanded={open} onClick={onToggle}>
                {deal.name || copy.untitled}
              </button>
              <div className="dx-deals-meta">
                {range && <span>{range}</span>}
                {range && <i aria-hidden>·</i>}
                <b>{when(row)}</b>
                {audience && <i aria-hidden>·</i>}
                {audience && <span>{audience}</span>}
              </div>
              <div className="dx-deals-chips">
                <span className="dx-deals-chip" data-kind={deal.push?.kind ?? 'none'}>
                  {deal.push === null
                    ? copy.notify.none
                    : deal.push.kind === 'sent'
                      ? fill(copy.chipSent, { n: num(deal.push.cameIn) })
                      : deal.push.kind === 'scheduled' && deal.push.at
                        ? fill(copy.chipScheduled, { at: dates.moment(deal.push.at) })
                        : copy.notify.stopped}
                </span>
              </div>
            </div>
          </div>
        </td>
        <td>
          <Pill tone={PILL[deal.state]}>{copy.states[deal.state]}</Pill>
        </td>
        {/* A deal nobody has been shown is "not started" — a dash. A live deal
            that nobody opened is a measured zero, and is drawn as one. */}
        <td data-align="right" className="dx-deals-quiet">{fresh ? '—' : num(deal.seen)}</td>
        <td data-align="right" className="dx-deals-quiet">{fresh ? '—' : num(deal.opened)}</td>
        <td data-align="right">
          <div className="dx-deals-claimed" data-fresh={fresh ? 'true' : undefined}>
            {fresh ? '—' : num(deal.claimed)}
          </div>
          {deal.limit > 0 && (
            <div className="dx-deals-limit">
              <span>
                <i
                  data-tone={limitPct >= 100 ? 'down' : limitPct > 70 ? 'amber' : undefined}
                  style={{ width: `${limitPct.toFixed(1)}%` }}
                />
              </span>
              <em>{fill(copy.limitAllowed, { limit: num(deal.limit) })}</em>
            </div>
          )}
        </td>
        {/* A rate over nothing is not a rate: 0% would read as a deal that failed. */}
        <td data-align="right" className="dx-deals-rate">
          {deal.seen === 0 ? '—' : `${claimRate(deal).toFixed(1)}%`}
        </td>
        <td data-align="right" className="dx-deals-cost">
          {fresh ? '—' : money(deal.cost, 'exact')}
        </td>
        <td>
          {fresh || deal.series.length < 2 ? (
            <span className="dx-deals-faint">{copy.notStartedCell}</span>
          ) : (
            <Sparkline points={deal.series} tone={dim ? 'ink' : 'deep'} />
          )}
        </td>
        <td data-align="right" className="dx-deals-acts">
          <Button variant="small" disabled={working} onClick={() => openDrawer('deal', deal.id)}>
            {acts.edit}
          </Button>
          {second}
        </td>
      </tr>
      {open && (
        <tr className="dx-deals-panel-row">
          <td colSpan={9}>
            <DealPanel
              row={row}
              deal={deal}
              dates={dates}
              timezone={timezone}
              quota={quota}
              audiences={audiences}
              reload={reload}
              when={when(row)}
              audience={audience}
            />
          </td>
        </tr>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════ panel ══ */

/**
 * One deal, opened: the funnel, what its notification did, and the controls
 * that need a value or a second thought (extend, notify, end).
 */
function DealPanel({
  row,
  deal,
  dates,
  timezone,
  quota,
  audiences,
  reload,
  when,
  audience,
}: {
  row: DealResponse;
  deal: PartnerDeal;
  dates: Dates;
  timezone: string;
  quota: PushQuotaResponse | null;
  audiences: AudienceRow[] | null;
  reload: () => void;
  when: string;
  audience: string | null;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.deals;
  const acts = dashboard.acts;
  const num = useNum();
  const { busy, run } = useAction(reload);
  const working = busy !== null;

  const [form, setForm] = useState<'extend' | 'notify' | null>(null);
  const [ending, setEnding] = useState(false);
  const [until, setUntil] = useState(() => deal.to?.slice(0, 10) ?? localDay(14));
  const [pushDay, setPushDay] = useState(() => localDay());
  const [pushTime, setPushTime] = useState('09:00');

  const fresh = notStarted(deal.state);
  const started = !fresh && deal.seen > 0;
  const openRate = started ? (deal.opened / deal.seen) * 100 : 0;
  const useRate = deal.opened > 0 ? (deal.claimed / deal.opened) * 100 : 0;
  const rate = claimRate(deal);
  const reachable = deal.state === 'live' || deal.state === 'scheduled';

  /* The audience this deal is aimed at, sized by the server — null when the
     deal is aimed at a language (nothing sizes one) or the read failed. */
  const segment = segmentOf(row.target_audience, row.target_languages);
  const sized = segment === null ? null : (audiences?.find((a) => a.segment === segment) ?? null);
  const reach = sized ? metricValue(sized.reach) : null;
  const notifiable = sized ? metricValue(sized.notifiable) : null;

  const push = deal.push;
  const justSent =
    push?.kind === 'sent' && push.at !== null && Date.now() - Date.parse(push.at) < 86_400_000;

  /* When the claim limit falls, at the pace of the last seven days. Derived,
     and only drawn while the deal is live and the pace is not zero. */
  const perDay = deal.series.reduce((sum, n) => sum + n, 0) / Math.max(1, deal.series.length);
  const left = deal.limit - deal.claimed;
  const hitsOn =
    deal.state === 'live' && deal.limit > 0 && left > 0 && perDay > 0
      ? new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + Math.ceil(left / perDay)))
      : null;
  const weeks =
    deal.state === 'expired' && deal.from && deal.to ? daysBetween(deal.from, deal.to) : null;

  const steps = [
    { label: copy.funnel[0], value: deal.seen, note: copy.funnelNotes[0], width: 100, tone: 'soft' },
    {
      label: copy.funnel[1],
      value: deal.opened,
      note: started ? fill(copy.funnelNotes[1], { pct: openRate.toFixed(1) }) : copy.notStarted,
      width: openRate,
      tone: 'mid',
    },
    {
      label: copy.funnel[2],
      value: deal.claimed,
      note: started ? fill(copy.funnelNotes[2], { pct: useRate.toFixed(0) }) : copy.notStarted,
      width: rate,
      tone: 'fill',
    },
  ];

  return (
    <div className="dx-deals-panel">
      <div className="dx-deals-panel-main">
        <span className="dx-deals-label">{copy.funnelTitle}</span>
        <div className="dx-deals-steps">
          {steps.map((step, index) => (
            <div className="dx-deals-step" key={step.label}>
              <span>{step.label}</span>
              <b data-last={index === 2 ? 'true' : undefined}>{started ? num(step.value) : '—'}</b>
              <i data-tone={step.tone} style={{ width: `${Math.max(3, started ? step.width : 0)}%` }} />
              <em>{step.note}</em>
            </div>
          ))}
        </div>
        <p className="dx-deals-drop">
          {started
            ? fill(copy.drop, { seen: num(deal.seen - deal.opened), opened: num(deal.opened - deal.claimed) })
            : copy.dropNone}
        </p>

        {push?.kind === 'sent' && !justSent && push.delivered > 0 && (
          <div className="dx-deals-notified">
            <span className="dx-deals-label">{copy.notifyTitle}</span>
            <div className="dx-deals-steps">
              {[push.delivered, push.opened, push.cameIn].map((value, index) => (
                <div className="dx-deals-step" key={copy.notifySteps[index]}>
                  <span>{copy.notifySteps[index]}</span>
                  <b data-last={index === 2 ? 'true' : undefined}>{num(value)}</b>
                  <em>
                    {index === 0
                      ? copy.notifyStepNotes[0]
                      : index === 1
                        ? fill(copy.notifyStepNotes[1], { pct: ((push.opened / push.delivered) * 100).toFixed(0) })
                        : push.opened > 0
                          ? fill(copy.notifyStepNotes[2], { pct: ((push.cameIn / push.opened) * 100).toFixed(0) })
                          : copy.notStarted}
                  </em>
                </div>
              ))}
            </div>
            {push.cameIn <= deal.claimed && (
              <p className="dx-deals-drop">
                {fill(copy.notifySplit, {
                  camein: num(push.cameIn),
                  claims: num(deal.claimed),
                  alone: num(deal.claimed - push.cameIn),
                })}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="dx-deals-panel-side">
        {hitsOn && (
          <p className="dx-deals-forecast">
            <DxIcon name="clock" size={15} strokeWidth={2} />
            {fill(copy.limitForecast, { limit: num(deal.limit), date: dates.day(hitsOn) })}
          </p>
        )}
        {deal.limit > 0 && left <= 0 && (
          <p className="dx-deals-forecast" data-tone="down">
            <DxIcon name="clock" size={15} strokeWidth={2} />
            {fill(copy.limitReached, { limit: num(deal.limit) })}
          </p>
        )}

        {push?.kind === 'scheduled' && push.at && (
          <div className="dx-deals-note" data-tone="blue">
            <DxIcon name="bell" size={16} strokeWidth={1.9} />
            <span>
              {notifiable !== null
                ? fill(copy.notifyScheduled, { at: dates.moment(push.at), n: num(notifiable) })
                : fill(copy.notifyScheduledBare, { at: dates.moment(push.at) })}
            </span>
          </div>
        )}
        {justSent && push?.at && (
          <div className="dx-deals-note" data-tone="mint">
            <DxIcon name="check" size={16} strokeWidth={2} />
            <span>{fill(copy.notifyJust, { at: dates.moment(push.at), n: num(push.delivered) })}</span>
          </div>
        )}
        {push === null && deal.state !== 'expired' && deal.state !== 'archived' && (
          <div className="dx-deals-note" data-tone="plain">
            <span>
              {notifiable !== null && reach !== null
                ? fill(copy.notifyNone, { n: num(notifiable), total: num(reach) })
                : copy.notifyNoneBare}
            </span>
            {/* The one notification a deal may carry, scheduled from here —
                offered only while there is a send left to spend on it. */}
            {reachable && quota !== null && quota.remaining > 0 && form !== 'notify' && (
              <Button variant="small" icon="bell" disabled={working} onClick={() => setForm('notify')}>
                {copy.notifyAdd}
              </Button>
            )}
          </div>
        )}
        {weeks !== null && (
          <div className="dx-deals-note" data-tone="retro">
            <span>{fill(copy.ranFor, { weeks: num(Math.max(1, Math.round(weeks / 7))), claims: num(deal.claimed) })}</span>
          </div>
        )}

        <div className="dx-deals-who">
          <span className="dx-deals-label">{copy.whoTitle}</span>
          <b>{when}</b>
          {audience && <p>{audience}</p>}
          <p>
            {deal.langs >= 5
              ? copy.langsAll
              : fill(copy.langsSome, {
                  n: num(deal.langs),
                  pct: num(Math.round((deal.missing.length / 5) * 100)),
                })}
          </p>
          {deal.terms && <p className="dx-deals-terms">{deal.terms}</p>}
        </div>

        {form === 'extend' && (
          <div className="dx-deals-inline">
            <label>
              <span>{acts.until}</span>
              <input className="dx-input" type="date" value={until} onChange={(event) => setUntil(event.target.value)} />
            </label>
            <Button
              variant="primary"
              disabled={working}
              onClick={() =>
                void run('extend', acts.extended, async () => {
                  await extendDeal(deal.id, until);
                  setForm(null);
                })
              }
            >
              {acts.save}
            </Button>
            <Button variant="secondary" onClick={() => setForm(null)}>
              {acts.close}
            </Button>
          </div>
        )}
        {form === 'notify' && (
          <div className="dx-deals-inline">
            <label>
              <span>{acts.sendAt}</span>
              <span className="dx-deals-inline-pair">
                <input className="dx-input" type="date" value={pushDay} onChange={(event) => setPushDay(event.target.value)} />
                <input
                  className="dx-input"
                  type="time"
                  aria-label={acts.sendAt}
                  value={pushTime}
                  onChange={(event) => setPushTime(event.target.value)}
                />
              </span>
            </label>
            <Button
              variant="primary"
              disabled={working}
              onClick={() =>
                void run('notify', acts.notified, async () => {
                  /* The venue's clock — the server refuses a send outside
                     07:00–21:00 venue-local. */
                  await scheduleDealPush(deal.id, venueInstant(pushDay, pushTime, timezone));
                  setForm(null);
                })
              }
            >
              {acts.send}
            </Button>
            <Button variant="secondary" onClick={() => setForm(null)}>
              {acts.close}
            </Button>
            <p className="dx-fine">{dashboard.drawer.deal.quietNote}</p>
          </div>
        )}

        {deal.state !== 'draft' && deal.state !== 'archived' && form === null && (
          <div className="dx-deals-manage">
            <Button variant="small" disabled={working} onClick={() => setForm('extend')}>
              {acts.extend}
            </Button>
            <Button variant="small" disabled={working} onClick={() => setEnding(true)}>
              {acts.end}
            </Button>
          </div>
        )}
      </div>

      {ending && (
        <ConfirmDialog
          title={fill(copy.endTitle, { name: deal.name || deal.badge || copy.untitled })}
          body={copy.endBody}
          confirmLabel={copy.endConfirm}
          busy={working}
          onCancel={() => setEnding(false)}
          onConfirm={() => {
            setEnding(false);
            void run('end', acts.ended, () => setDealStatus(deal.id, 'archived'));
          }}
        />
      )}
    </div>
  );
}
