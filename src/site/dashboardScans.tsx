/**
 * Scan activity (v3 §3.8): the till log, and the counter tool behind a button.
 *
 * ── the till log is the server's ──────────────────────────────────────────
 *
 * `GET …/scans` returns the committed transactions at the venue inside the range
 * picker's window, newest first, twelve to a page, with the counts the
 * segmented control needs over the whole window. Paging, the segment and the
 * window are all the server's — a client that received six months of receipts
 * to page through twelve would have received six months of receipts.
 *
 * Three rules the log must not break, and all three are the server's first:
 *
 *  - **A name only where the customer shared it.** `who` is `null` for
 *    everybody without an unrevoked sharing consent for this venue, which is
 *    most people. The row says so in words and draws no initials — two letters
 *    are a hint at a name somebody chose not to give.
 *  - **A scan that did not count is still a row.** Under the minimum bill,
 *    inside the cooldown or a second that day: it happened at the till, and a
 *    log that hid it would disagree with the till roll the owner reconciles
 *    against.
 *  - **"Confirmed by" is a name or nothing.** The server records the owner as
 *    nobody (`null`) and so does every transaction from before teams existed,
 *    so a `null` cannot be printed as "you" — it would claim the owner rang up
 *    a year of scans they never touched. v3 draws no staff column; the name sits
 *    under the receipt mark it belongs to.
 *
 * ── what v3 draws that this screen does not ───────────────────────────────
 *
 * The **Pass** segment and the purple "Pass · Daily Brew" tag: a scan row
 * carries no subscription pass (the server's `intent` is earn, voucher or
 * reward, and `SCAN_SEGMENTS` is all / first / again), so a fourth button would
 * filter to nothing for ever. The "All branches" bar: no endpoint aggregates
 * venues, and the frame's switcher already says which one this is.
 *
 * ── the counter tool ──────────────────────────────────────────────────────
 *
 * v3 has no counter tool, and this one is real — a visit recorded here is
 * opened, priced and confirmed on the server in one press — so it is kept, as a
 * drawer behind "Record at the counter" rather than a panel above the log. The
 * log is what the screen is; the tool is a thing you open with a customer in
 * front of you. Today's three figures sit at the head of that drawer, where the
 * person at the till is looking.
 *
 * The bill is the one money input on the dashboard that is **not** in the
 * reader's currency: see the note on `CounterDrawer`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  chain,
  counterLookup,
  counterRecord,
  exportCsv,
  isNoSession,
  isNoVenue,
  majorToMinor,
  minorToEuro,
  usePartnerScans,
  usePartnerToday,
  usePartnerVenue,
  type CounterLookup,
  type CounterResult,
  type PartnerVenue,
  type ScanSegment,
  type ScansResponse,
  type TodayResponse,
} from './api/partner';
import { ApiError } from './api/client';
import type { ApiState } from './api/useApi';
import { DEMO_TODAY, DEMO_VENUE, demoScans } from './dashboardDemo';
import { useNum, useVenueDates, useVenueMoney } from './dashboardFormat';
import { Button, Card, DxIcon, Drawer, Field, PageHead, Pill, Segmented, Table } from './dashboardKit';
import { initialsOf } from './dashboardKitHooks';
import { useDashboard } from './dashboardShell';
import { DEMO_MODE } from './demoMode';
import { useCopy, useCurrencyCode, useMoney } from './i18n/context';
import { fill } from './i18n/currency';
import { FX, type FxCode } from './i18n/fx';
import { metricValue, PD_RANGES, PD_SCAN_PAGE, scanFromApi, type ScanRow } from './partnerMetrics';
import './dashboard-scans.css';

/** Which rows the segmented control is showing. Index-aligned with `copy.filters`. */
const SEGMENTS: ScanSegment[] = ['all', 'first', 'again'];

/* ═════════════════════════════════════════════════════════════ the screen ══ */

export function Scans() {
  const dashboard = useCopy().dashboard;
  const { openDrawer, toast } = useDashboard();

  const venueApi = usePartnerVenue();
  const liveVenue = venueApi.state.status === 'ready' ? venueApi.state.data : null;
  const venue = liveVenue ?? (DEMO_MODE ? DEMO_VENUE : null);
  const todayApi = usePartnerToday(liveVenue?.id ?? null);
  const todayState = chain(venueApi, todayApi);

  const [counterOpen, setCounterOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  /* Bumped after a visit is recorded, so the log re-reads the page it is on. */
  const [logSignal, setLogSignal] = useState(0);

  const reloadToday = todayApi.reload;
  const recorded = useCallback(() => {
    reloadToday();
    setLogSignal((n) => n + 1);
  }, [reloadToday]);

  /* The same download the frame's head does: a blob and a synthetic click,
     because the CSV arrives in the body rather than at a URL. */
  const download = async () => {
    if (exporting) return;
    if (liveVenue === null) {
      toast(dashboard.drawer.deal.needsSession);
      return;
    }
    setExporting(true);
    try {
      const file = await exportCsv(liveVenue.id);
      const url = URL.createObjectURL(new Blob([file.csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
      toast(dashboard.actions.exported);
    } catch (cause) {
      toast(
        cause instanceof ApiError && cause.status === 403
          ? dashboard.acts.exportLocked
          : cause instanceof ApiError && cause.status === 0
            ? dashboard.acts.offline
            : fill(dashboard.acts.refused, { why: cause instanceof Error ? cause.message : String(cause) }),
      );
    } finally {
      setExporting(false);
    }
  };

  const screen = dashboard.screens.scans;

  return (
    <>
      <PageHead
        title={screen.name}
        subtitle={screen.lede}
        actions={
          <>
            <Button variant="secondary" icon="download" disabled={exporting} onClick={() => void download()}>
              {dashboard.actions.exportCsv}
            </Button>
            <Button variant="secondary" icon="scans" onClick={() => setCounterOpen(true)}>
              {dashboard.scans.counter.title}
            </Button>
            <Button variant="primary" icon="plus" onClick={() => openDrawer('campaign')}>
              {dashboard.actions.newCampaign}
            </Button>
          </>
        }
      />

      <ScanLog venue={venue} live={liveVenue !== null} reloadSignal={logSignal} />

      {counterOpen && (
        <CounterDrawer
          venue={liveVenue}
          demo={liveVenue === null && venue !== null}
          today={todayState}
          onRecorded={recorded}
          onClose={() => setCounterOpen(false)}
        />
      )}
    </>
  );
}

/* ═════════════════════════════════════════════════════════════════ the log ══ */

function ScanLog({
  venue,
  live,
  reloadSignal,
}: {
  /** The venue whose money and clock the rows are written in — the demo one under `?demo=1`. */
  venue: PartnerVenue | null;
  /** Whether `venue` is the server's, and so whether there is anybody to ask. */
  live: boolean;
  /** Changes when a visit was just recorded, so the page on screen is re-read. */
  reloadSignal: number;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.scans;
  const num = useNum();
  const { range } = useDashboard();

  const [segment, setSegment] = useState<ScanSegment>('all');
  const [page, setPage] = useState(0);

  /* A new window or a new segment starts at the first page — page four of the
     last seven days is not a page of the last quarter. Setting state during
     render against the last value is the supported form, and it costs one
     render rather than an effect and a flash of the wrong page. */
  const key = `${range}:${segment}`;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setPage(0);
  }

  const query = { days: range, segment, limit: PD_SCAN_PAGE, offset: page * PD_SCAN_PAGE };
  const scansApi = usePartnerScans(live ? (venue?.id ?? null) : null, query);

  const reload = scansApi.reload;
  useEffect(() => {
    if (reloadSignal > 0) reload();
  }, [reloadSignal, reload]);

  /* The demo pages its own till roll through the same shape. Memoised on the
     query, because building a page walks a few thousand rows. */
  const demo = useMemo(
    () =>
      !live && DEMO_MODE
        ? demoScans({ days: range, segment, limit: PD_SCAN_PAGE, offset: page * PD_SCAN_PAGE })
        : null,
    [live, range, segment, page],
  );

  /* The last page the server answered, held while the next one is on its way:
     a pager whose table blinks out between pages reads as broken, and the
     previous rows are still true for the moment they are shown. */
  const ready = scansApi.state.status === 'ready' ? scansApi.state.data : null;
  const [held, setHeld] = useState<ScansResponse | null>(null);
  if (ready !== null && ready !== held) setHeld(ready);

  const response: ScansResponse | null = live
    ? ready ?? (scansApi.state.status === 'loading' ? held : null)
    : demo;

  const currency = response?.currency ?? venue?.currency ?? 'EUR';
  const timezone = response?.timezone ?? venue?.timezone ?? null;
  const toEuro = (minor: number) => minorToEuro(minor, currency);
  const rows: ScanRow[] = (response?.rows ?? []).map((row) => scanFromApi(row, toEuro));

  const counts = response
    ? { all: response.total, first: response.firstCount, again: response.againCount }
    : null;
  const shownTotal = counts ? counts[segment] : 0;
  const pages = Math.max(1, Math.ceil(shownTotal / PD_SCAN_PAGE));
  const at = Math.min(page, pages - 1);
  const rangeIndex = PD_RANGES.indexOf(range);
  const rangeLabel = rangeIndex >= 0 ? dashboard.rangeLabels[rangeIndex] : '';

  return (
    <Card pad="none" className="dx-scans">
      <div className="dx-scans-bar">
        <Segmented
          label={copy.columns[2]}
          value={segment}
          onChange={setSegment}
          options={SEGMENTS.map((value, index) => ({ value, label: copy.filters[index] }))}
        />
        <span className="dx-scans-count">
          {counts ? fill(copy.count, { n: num(shownTotal) }) : ''}
          {counts && rangeLabel ? ` · ${rangeLabel}` : ''}
        </span>
      </div>

      {response === null ? (
        <p className="dx-fine dx-scans-note">
          {scansApi.state.status === 'error'
            ? isNoVenue(scansApi.state.error)
              ? dashboard.unmeasured.noVenue
              : isNoSession(scansApi.state.error)
              ? dashboard.unmeasured.noSession
              : dashboard.unmeasured.serverSilent
            : dashboard.unmeasured.asking}
        </p>
      ) : shownTotal === 0 ? (
        <div className="dx-scans-empty">
          <span className="dx-scans-empty-ico" aria-hidden>
            <DxIcon name="scans" size={20} />
          </span>
          <h2>{segment === 'all' ? dashboard.empty.scans.title : copy.emptySegment}</h2>
          {segment === 'all' && <p className="dx-fine">{dashboard.empty.scans.body}</p>}
        </div>
      ) : (
        <>
          <div aria-busy={scansApi.state.status === 'loading' || undefined}>
            <Table minWidth={1080} label={dashboard.screens.scans.name}>
              <thead>
                <tr>
                  {copy.columns.map((label, index) => (
                    <th key={label} data-align={index === 3 || index === 4 ? 'right' : undefined}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Row key={row.id} row={row} currency={currency} timezone={timezone} />
                ))}
              </tbody>
            </Table>
          </div>

          <div className="dx-scans-foot">
            <span>
              {fill(copy.page, {
                from: num(at * PD_SCAN_PAGE + 1),
                to: num(at * PD_SCAN_PAGE + rows.length),
                total: num(shownTotal),
              })}
            </span>
            <div className="dx-scans-pager">
              <Button variant="secondary" disabled={at === 0} onClick={() => setPage(at - 1)}>
                {copy.prev}
              </Button>
              <Button variant="secondary" disabled={at >= pages - 1} onClick={() => setPage(at + 1)}>
                {copy.next}
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

/**
 * One scan: eight cells, each a decision.
 *
 * The date and time are the **venue's** clock, from the response's own zone —
 * an owner reading the log from abroad wants the hour the bill was rung up.
 */
function Row({ row, currency, timezone }: { row: ScanRow; currency: string; timezone: string | null }) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.scans;
  const money = useMoney();
  const num = useNum();
  const venueMoney = useVenueMoney();
  const dates = useVenueDates(timezone);
  /* The till's line is a second reading only when it is a second currency;
     reading złoty in złoty printed every bill twice, one under the other. */
  const [reader] = useCurrencyCode();
  const tillLine = reader !== currency;

  return (
    <tr data-uncounted={row.counted ? undefined : 'true'}>
      <td>
        <b className="dx-scans-day">{dates.day(row.at)}</b>
        <span className="dx-scans-sub">{dates.time(row.at)}</span>
      </td>

      <td>
        {row.who === null ? (
          <span className="dx-scans-who" data-anon="true" title={copy.anonymousNote}>
            {copy.anonymous}
          </span>
        ) : (
          <span className="dx-scans-who">
            <i aria-hidden="true">{initialsOf(row.who)}</i>
            {row.who}
          </span>
        )}
      </td>

      <td>
        {/* A scan that did not count created no visit, so it is neither a first
            visit nor a return — it is the third thing, and says which rules can
            stop a scan counting. */}
        {row.counted ? (
          <Pill tone={row.first ? 'live' : 'neutral'}>{row.first ? copy.first : copy.again}</Pill>
        ) : (
          <span title={copy.notCountedNote}>
            <Pill tone="paused">{copy.notCounted}</Pill>
          </span>
        )}
      </td>

      {/* The reader's currency on top, the till's own figure underneath, in
          `'unit'` rather than `'exact'`: a till line is the one place on this
          dashboard where the minor units are the point. A redemption carries
          what it took off, named by what it was. */}
      <td data-align="right" className="dx-scans-money">
        <b>{money(row.spent, 'unit')}</b>
        {tillLine && <span className="dx-scans-sub">{venueMoney(row.spentMinor, currency)}</span>}
        {row.discount > 0 && (
          <span className="dx-scans-sub">
            {row.intent === 'earn' ? '' : `${dashboard.acts.intents[row.intent]} · `}
            {fill(copy.discount, { amount: money(row.discount, 'unit') })}
          </span>
        )}
      </td>

      <td data-align="right">
        <span className="dx-scans-points" data-zero={row.points === 0 ? 'true' : undefined}>
          {row.points > 0 ? `+${num(row.points)}` : '0'}
        </span>
      </td>

      <td>
        <span className="dx-scans-receipt">{row.receipt}</span>
        {row.confirmedBy ? (
          <span className="dx-scans-sub dx-scans-by">{fill(copy.confirmedBy, { name: row.confirmedBy })}</span>
        ) : null}
      </td>

      <td>
        <span className="dx-scans-site">
          <DxIcon name="pin" size={12} strokeWidth={2} />
          {row.site.name}
        </span>
        {/* The site's own coordinates when it has them, its address when it
            does not, and nothing when it has neither — per-scan GPS is not
            collected anywhere. */}
        {row.site.lat !== null && row.site.lng !== null ? (
          <span className="dx-scans-sub dx-scans-mono">
            {row.site.lat.toFixed(4)}, {row.site.lng.toFixed(4)}
          </span>
        ) : row.site.address ? (
          <span className="dx-scans-sub">{row.site.address}</span>
        ) : null}
      </td>

      <td className="dx-scans-progress">
        {row.progress === null ? (
          <>
            <span className="dx-scans-sub">{copy.noCampaign}</span>
            <b>—</b>
          </>
        ) : (
          <>
            <span className="dx-scans-sub">{row.progress.campaign}</span>
            <span className="dx-scans-progress-row">
              <b>
                {fill(copy.progress, {
                  done: num(row.progress.done),
                  need: num(row.progress.need),
                })}
              </b>
              <em>
                {row.progress.rewardEarned
                  ? copy.ready
                  : fill(copy.toGo, { n: num(Math.max(0, row.progress.need - row.progress.done)) })}
              </em>
            </span>
            <span className="dx-scans-bar-track" aria-hidden>
              <i
                data-done={row.progress.rewardEarned || row.progress.done >= row.progress.need ? 'true' : undefined}
                style={{
                  width: `${Math.min(100, (row.progress.done / Math.max(1, row.progress.need)) * 100)}%`,
                }}
              />
            </span>
          </>
        )}
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════ the counter tool ══ */

/** One of today's figures: a number, or the withheld dash — never a zero for "not told". */
function TodayFigure({ label, value }: { label: string; value: string | null }) {
  const dashboard = useCopy().dashboard;
  return (
    <div className="dx-scans-today-cell">
      <span>{label}</span>
      {value === null ? (
        <b data-withheld="true" title={dashboard.unmeasured.withheld}>
          —
        </b>
      ) : (
        <b>{value}</b>
      )}
    </div>
  );
}

/**
 * Record a visit from the dashboard: who, the bill, confirm.
 *
 * ── the bill is in the venue's currency, and only this bill ───────────────
 *
 * Every other money control here holds the reader's currency, because it is a
 * figure being read. This one is copied off a paper receipt, and the receipt
 * says złoty whatever language the person at the till reads the dashboard in —
 * converting it would ask them to do exchange-rate arithmetic with a queue
 * behind the customer, and the one figure that must match the till would stop
 * matching it. So the field's unit is the venue currency's own symbol, off
 * `i18n/fx.ts`, and the amount goes to the server as that currency's minor
 * units with no euro in between (`majorToMinor`).
 *
 * ── two presses, and nothing is opened by the first ───────────────────────
 *
 * Look up is read-only: a wrong code costs nothing and leaves no pending row
 * that would lock the customer out of their own next scan. Confirm is the one
 * write — open, amount and confirm in one call — with an idempotency key per
 * press, so a retry after a dropped response returns the stored receipt rather
 * than granting twice.
 *
 * ── the keyboard is the whole flow ────────────────────────────────────────
 *
 * Enter in the code looks up and moves the caret to the bill; Enter in the bill
 * records the visit and moves the caret back to the code for the next customer.
 * Somebody at a till does not reach for a mouse between two customers.
 */
function CounterDrawer({
  venue,
  demo,
  today,
  onRecorded,
  onClose,
}: {
  /** The live venue. `null` when there is no session to record against. */
  venue: PartnerVenue | null;
  /** Under `?demo=1`, where the drawer explains why it cannot record. */
  demo: boolean;
  today: ApiState<TodayResponse>;
  onRecorded: () => void;
  onClose: () => void;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.scans.counter;
  const money = useMoney();
  const num = useNum();
  const venueMoney = useVenueMoney();
  const dates = useVenueDates(venue?.timezone ?? null);

  const [code, setCode] = useState('');
  /* The code the preview belongs to, which is what Confirm sends. Editing the
     field after a lookup clears the preview rather than recording against a
     code nobody looked at. */
  const [looked, setLooked] = useState('');
  const [lookup, setLookup] = useState<CounterLookup | null>(null);
  const [bill, setBill] = useState('');
  const [phase, setPhase] = useState<'idle' | 'looking' | 'recording'>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<CounterResult | null>(null);

  const codeRef = useRef<HTMLInputElement>(null);
  const billRef = useRef<HTMLInputElement>(null);

  /* The caret follows the flow, after the render that drew the field it moves
     to — a focus call in the handler would land before the bill exists. */
  useEffect(() => {
    if (lookup) billRef.current?.focus();
  }, [lookup]);
  useEffect(() => {
    if (receipt) codeRef.current?.focus();
  }, [receipt]);

  /* Today's figures: the server's, or the demo's under `?demo=1` with no
     session, or nothing at all — a row of dashes is not drawn for a state
     that was never asked. */
  const todayData =
    today.status === 'ready'
      ? today.data
      : today.status === 'error' && DEMO_MODE && isNoSession(today.error)
        ? DEMO_TODAY
        : null;
  const todayCurrency = venue?.currency ?? DEMO_VENUE.currency;
  const figure = (value: number | null, format: (n: number) => string) =>
    value === null ? null : format(value);

  const todayRow = todayData ? (
    <section className="dx-scans-today" aria-label={dashboard.scans.todayTitle}>
      <span className="dx-eyebrow" data-tone="faint">
        {dashboard.scans.todayTitle}
      </span>
      <div>
        <TodayFigure label={dashboard.scans.todayLabels[0]} value={figure(metricValue(todayData.visits), num)} />
        <TodayFigure label={dashboard.scans.todayLabels[1]} value={figure(metricValue(todayData.customers), num)} />
        <TodayFigure
          label={dashboard.scans.todayLabels[2]}
          value={figure(metricValue(todayData.salesMinor), (minor) =>
            money(minorToEuro(minor, todayCurrency), 'exact'),
          )}
        />
      </div>
    </section>
  ) : null;

  if (venue === null) {
    /* No session to record against. Under the demo that is the honest state
       too: a till tool that pretended to record a visit would teach somebody
       that it had. */
    return (
      <Drawer title={copy.title} sub={copy.lede} onClose={onClose}>
        <div className="dx-sections">
          {todayRow}
          <p className="dx-fine">{demo ? copy.needsVenue : dashboard.unmeasured.noSession}</p>
        </div>
      </Drawer>
    );
  }

  const currency = venue.currency;
  const fx = FX[currency as FxCode] ?? FX.EUR;
  const ceiling = venue.max_amount_minor;

  /** Each refusal as the sentence with the fix for it at the till. */
  const refusal = (cause: unknown): string => {
    if (!(cause instanceof ApiError)) {
      return fill(dashboard.acts.refused, { why: cause instanceof Error ? cause.message : String(cause) });
    }
    if (cause.status === 0) return dashboard.acts.offline;
    if (cause.status === 401) return copy.needsVenue;
    const detail = cause.detail;
    switch (cause.code) {
      case 'not_found':
        return copy.notFound;
      case 'conflict':
        return copy.pending;
      case 'invalid_amount': {
        const limit = typeof detail.ceiling === 'number' ? detail.ceiling : ceiling;
        return detail.reason === 'ceiling' && typeof limit === 'number'
          ? fill(copy.tooHigh, { amount: venueMoney(limit, currency) })
          : copy.badAmount;
      }
      case 'validation_failed':
        return copy.badAmount;
      case 'budget_exhausted':
        return copy.budget;
      case 'expired':
        return copy.expired;
      case 'already_used':
        return copy.used;
      case 'forbidden':
        return copy.notStaff;
      case 'invalid_state':
        return /live/i.test(cause.message)
          ? copy.notLive
          : fill(dashboard.acts.refused, { why: cause.message });
      default:
        return fill(dashboard.acts.refused, { why: cause.message });
    }
  };

  const clear = () => {
    setLookup(null);
    setLooked('');
    setBill('');
    setProblem(null);
    codeRef.current?.focus();
  };

  const find = async () => {
    const typed = code.trim();
    if (typed === '' || phase !== 'idle') return;
    setPhase('looking');
    setProblem(null);
    setReceipt(null);
    try {
      const found = await counterLookup(venue.id, typed);
      setLooked(typed);
      setBill('');
      setLookup(found);
    } catch (cause) {
      setLookup(null);
      setProblem(refusal(cause));
    } finally {
      setPhase('idle');
    }
  };

  const record = async () => {
    if (lookup === null || phase !== 'idle') return;
    const value = Number(bill.replace(',', '.'));
    if (bill.trim() === '' || !Number.isFinite(value) || !(value > 0)) {
      setProblem(copy.badAmount);
      return;
    }
    setPhase('recording');
    setProblem(null);
    try {
      const result = await counterRecord(venue.id, looked, majorToMinor(value, currency), crypto.randomUUID());
      setReceipt(result);
      setLookup(null);
      setLooked('');
      setCode('');
      setBill('');
      onRecorded();
    } catch (cause) {
      setProblem(refusal(cause));
    } finally {
      setPhase('idle');
    }
  };

  const customer = lookup?.customer ?? null;

  return (
    <Drawer title={copy.title} sub={copy.lede} onClose={onClose}>
      <div className="dx-sections">
        {todayRow}

        <form
          className="dx-scans-find"
          onSubmit={(event) => {
            event.preventDefault();
            void find();
          }}
        >
          <Field label={copy.codeLabel}>
            {/* A bare `input` with the kit's class rather than `Input`: the kit's
                props type carries no `ref`, and the caret has to come back here. */}
            <input
              className="dx-input"
              ref={codeRef}
              value={code}
              placeholder={copy.codePlaceholder}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              onChange={(event) => {
                setCode(event.target.value);
                if (lookup !== null && event.target.value.trim() !== looked) {
                  setLookup(null);
                  setBill('');
                }
              }}
            />
          </Field>
          <Button type="submit" variant="secondary" disabled={phase !== 'idle' || code.trim() === ''}>
            {phase === 'looking' ? copy.looking : copy.lookup}
          </Button>
        </form>

        {lookup !== null && customer !== null && (
          <section className="dx-scans-card">
            <div className="dx-scans-card-who">
              {/* Initials only for a name the customer shared; otherwise the
                  handle mark, which says "an account" and nothing about a person. */}
              <i aria-hidden="true">{customer.name ? initialsOf(customer.name) : '@'}</i>
              <span>
                <b>{customer.handle ?? copy.noHandle}</b>
                <em data-quiet={customer.name ? undefined : 'true'}>{customer.name ?? copy.notShared}</em>
              </span>
              <Pill tone={customer.firstVisit ? 'live' : 'neutral'}>
                {customer.firstVisit ? copy.firstVisit : copy.returning}
              </Pill>
            </div>

            {lookup.kind === 'voucher' && (
              <div className="dx-scans-offer">
                <span className="dx-eyebrow">{copy.voucherTitle}</span>
                <b>
                  {fill(copy.voucher, {
                    pct: num(lookup.voucher.discountPct),
                    cap: venueMoney(lookup.voucher.maxDiscountMinor, currency),
                  })}
                </b>
                <em>{fill(copy.expires, { date: dates.long(lookup.voucher.expiresAt) })}</em>
                <code>{lookup.voucher.code}</code>
              </div>
            )}

            {lookup.kind === 'reward' && (
              <div className="dx-scans-offer">
                <span className="dx-eyebrow">{copy.rewardTitle}</span>
                <b>{lookup.reward.label}</b>
                <em>
                  {fill(copy.rewardWorth, { amount: venueMoney(lookup.reward.costMinor, currency) })}
                  {' · '}
                  {fill(copy.expires, { date: dates.long(lookup.reward.expiresAt) })}
                </em>
                <code>{lookup.reward.code}</code>
              </div>
            )}

            <div className="dx-scans-stamps">
              {customer.stamps.length === 0 ? (
                <p className="dx-fine">{copy.noCampaigns}</p>
              ) : (
                customer.stamps.map((card) => (
                  <div key={card.campaignId}>
                    <span>{card.campaign}</span>
                    <b>{fill(copy.stamps, { done: num(card.done), need: num(card.need) })}</b>
                    <span className="dx-scans-bar-track" aria-hidden>
                      <i
                        data-done={card.done >= card.need ? 'true' : undefined}
                        style={{ width: `${Math.min(100, (card.done / Math.max(1, card.need)) * 100)}%` }}
                      />
                    </span>
                  </div>
                ))
              )}
            </div>

            <form
              className="dx-scans-bill"
              onSubmit={(event) => {
                event.preventDefault();
                void record();
              }}
            >
              <Field
                label={copy.billLabel}
                help={
                  <>
                    {fill(copy.billNote, { currency: fx.code })}
                    {typeof ceiling === 'number' &&
                      ` ${fill(copy.billCeiling, { amount: venueMoney(ceiling, currency) })}`}
                  </>
                }
              >
                {/* The kit's unit well, drawn by hand for the same `ref` reason. */}
                <span className="dx-input dx-unit">
                  <input
                    ref={billRef}
                    type="number"
                    inputMode="decimal"
                    value={bill}
                    min={0}
                    step={1 / 10 ** fx.decimals}
                    enterKeyHint="done"
                    onChange={(event) => setBill(event.target.value)}
                  />
                  <span>{fx.symbol}</span>
                </span>
              </Field>
              <div className="dx-scans-acts">
                <Button type="submit" variant="primary" disabled={phase !== 'idle'}>
                  {phase === 'recording' ? copy.recording : copy.confirm}
                </Button>
                <Button variant="secondary" onClick={clear}>
                  {copy.clear}
                </Button>
              </div>
            </form>
          </section>
        )}

        {/* Polite, because every change here answers a press the person just made. */}
        <div aria-live="polite">
          {problem && (
            <p className="dx-field-error" role="alert">
              {problem}
            </p>
          )}
          {receipt && (
            <div className="dx-scans-receipt-card">
              <span className="dx-eyebrow">
                {copy.receiptTitle}
                {receipt.lookup.customer.handle && ` · ${receipt.lookup.customer.handle}`}
              </span>
              <ul>
                <li>
                  {fill(copy.receiptBill, {
                    amount: venueMoney(receipt.receipt.amountMinor, receipt.receipt.currency),
                  })}
                </li>
                <li>
                  {receipt.receipt.pointsGranted > 0
                    ? fill(copy.points, { n: num(receipt.receipt.pointsGranted) })
                    : copy.noPoints}
                </li>
                {receipt.receipt.discountMinor > 0 && (
                  <li>
                    {fill(copy.discount, {
                      amount: venueMoney(receipt.receipt.discountMinor, receipt.receipt.currency),
                    })}
                  </li>
                )}
                {receipt.receipt.stamped && <li>{copy.stamped}</li>}
                {receipt.receipt.rewardEarned && (
                  <li>
                    <b>
                      {fill(copy.rewardEarned, {
                        label: receipt.receipt.rewardEarned.label,
                        code: receipt.receipt.rewardEarned.code,
                      })}
                    </b>
                  </li>
                )}
                {!receipt.receipt.visitCounted && <li>{copy.notCounted}</li>}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}
