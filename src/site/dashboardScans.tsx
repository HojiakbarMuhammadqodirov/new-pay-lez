/**
 * The Scan activity screen's two working panels: the counter tool and the till
 * log.
 *
 * ── the till log is the server's now ──────────────────────────────────────
 *
 * `GET …/scans` returns the committed transactions at the venue inside the range
 * picker's window, newest first, twelve to a page, with the three counts the
 * segmented control needs over the whole window. Paging, the segment and the
 * window are all the server's — a client that received six months of receipts
 * to page through twelve would have received six months of receipts.
 *
 * Two rules the log must not break, and both are the server's first:
 *
 *  - **A name only where the customer shared it.** `who` is `null` for
 *    everybody without an unrevoked sharing consent for this venue, which is
 *    most people. The row says so in words and draws no initials — two letters
 *    are a hint at a name somebody chose not to give.
 *  - **A scan that did not count is still a row.** Under the minimum bill,
 *    inside the cooldown or a second that day: it happened at the till, and a
 *    log that hid it would disagree with the till roll the owner reconciles
 *    against.
 *
 * `DEMO_SCANS` is gone; the demo pages `dashboardDemo.ts`'s own till roll
 * through the same response shape, so both paths render through `scanFromApi`.
 *
 * ── the counter tool ──────────────────────────────────────────────────────
 *
 * The one money input on the dashboard that is **not** in the reader's currency:
 * see the note on `Counter`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  counterLookup,
  counterRecord,
  isNoSession,
  majorToMinor,
  minorToEuro,
  usePartnerScans,
  type CounterLookup,
  type CounterResult,
  type PartnerVenue,
  type ScanSegment,
  type ScansResponse,
} from './api/partner';
import { ApiError } from './api/client';
import { NumberWell } from './dashboardControls';
import { demoScans } from './dashboardDemo';
import { useNum, useVenueDates, useVenueMoney } from './dashboardFormat';
import { useDashboard } from './dashboardShell';
import { DEMO_MODE } from './demoMode';
import { Icon } from './icons';
import { useCopy, useMoney } from './i18n/context';
import { fill } from './i18n/currency';
import { FX, type FxCode } from './i18n/fx';
import { PD_RANGES, PD_SCAN_PAGE, scanFromApi, type ScanRow } from './partnerMetrics';

/** Which rows the segmented control is showing. Index-aligned with `copy.filters`. */
const SEGMENTS: ScanSegment[] = ['all', 'first', 'again'];

/**
 * Initials for the avatar disc — for a *shared* name only.
 *
 * Two words at most, because three initials in a 28px circle is a texture
 * rather than a name.
 */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => [...word][0] ?? '')
    .join('')
    .toUpperCase();
}

/* ══════════════════════════════════════════════════════════════ the log ══ */

export function ScanLog({
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
    <div className="pd-glass pd-panel ps-panel" data-solid="true" data-reveal>
      <div className="ps-head">
        {/* One of three and always one, which is what a `radiogroup` is. The
            count on each is the server's, over the whole window. */}
        <div className="ps-seg" role="radiogroup" aria-label={copy.columns[2]}>
          {SEGMENTS.map((value, index) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={segment === value}
              data-on={segment === value ? 'true' : undefined}
              onClick={() => setSegment(value)}
            >
              {copy.filters[index]}
              {counts && <i>{num(counts[value])}</i>}
            </button>
          ))}
        </div>
        <span className="ps-count">
          {counts ? fill(copy.count, { n: num(shownTotal) }) : ''}
          {rangeLabel && ` · ${rangeLabel}`}
        </span>
      </div>

      {response === null ? (
        <p className="pd-fine">
          {scansApi.state.status === 'error'
            ? isNoSession(scansApi.state.error)
              ? dashboard.unmeasured.noSession
              : dashboard.unmeasured.serverSilent
            : dashboard.unmeasured.asking}
        </p>
      ) : shownTotal === 0 ? (
        <div className="ps-empty">
          <p className="pd-fine">{segment === 'all' ? copy.emptyWindow : copy.emptySegment}</p>
          {segment === 'all' && <p className="pd-fine">{dashboard.empty[7].body}</p>}
        </div>
      ) : (
        <>
          <div className="ps-scroll" aria-busy={scansApi.state.status === 'loading' || undefined}>
            <table className="ps-table">
              <thead>
                <tr>
                  {copy.columns.map((label, index) => (
                    <th key={label} data-col={index}>
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
            </table>
          </div>

          <div className="ps-foot">
            <span>
              {fill(copy.page, {
                from: num(at * PD_SCAN_PAGE + 1),
                to: num(at * PD_SCAN_PAGE + rows.length),
                total: num(shownTotal),
              })}
            </span>
            <div className="ps-pager">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={at === 0}
                onClick={() => setPage(at - 1)}
              >
                {copy.prev}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={at >= pages - 1}
                onClick={() => setPage(at + 1)}
              >
                {copy.next}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
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

  return (
    <tr data-uncounted={row.counted ? undefined : 'true'}>
      <td data-col="0">
        <b>{dates.day(row.at)}</b>
        <i>{dates.time(row.at)}</i>
      </td>

      <td data-col="1">
        {row.who === null ? (
          <span className="ps-who" data-anon="true" title={copy.anonymousNote}>
            {copy.anonymous}
          </span>
        ) : (
          <span className="ps-who">
            <i aria-hidden="true">{initials(row.who)}</i>
            {row.who}
          </span>
        )}
      </td>

      <td data-col="2">
        {/* A scan that did not count created no visit, so it is neither a first
            visit nor a return — it is the third thing, and says which rules can
            stop a scan counting. */}
        {row.counted ? (
          <span className="ps-first" data-on={row.first ? 'true' : undefined}>
            {row.first ? copy.first : copy.again}
          </span>
        ) : (
          <span className="ps-first" data-off="true" title={copy.notCountedNote}>
            {copy.notCounted}
          </span>
        )}
      </td>

      {/* The reader's currency on top, the till's own figure underneath, in
          `'unit'` rather than `'exact'`: a till line is the one place on this
          dashboard where the minor units are the point. A redemption carries
          what it took off, named by what it was. */}
      <td data-col="3" className="ps-money">
        <b>{money(row.spent, 'unit')}</b>
        <i>{venueMoney(row.spentMinor, currency)}</i>
        {row.discount > 0 && (
          <i className="ps-discount">
            {row.intent === 'earn' ? '' : `${dashboard.acts.intents[row.intent]} · `}
            {fill(copy.discount, { amount: money(row.discount, 'unit') })}
          </i>
        )}
      </td>

      <td data-col="4">
        <span className="ps-points" data-zero={row.points === 0 ? 'true' : undefined}>
          {row.points > 0 ? `+${num(row.points)}` : '0'}
        </span>
      </td>

      <td data-col="5">
        <span className="ps-receipt">{row.receipt}</span>
      </td>

      <td data-col="6">
        <span className="ps-site">
          <b>
            <Icon name="pin" size={12} />
            {row.site.name}
          </b>
          {/* The site's own coordinates when it has them, its address when it
              does not, and nothing when it has neither — per-scan GPS is not
              collected anywhere. */}
          {row.site.lat !== null && row.site.lng !== null ? (
            <i>
              {row.site.lat.toFixed(4)}, {row.site.lng.toFixed(4)}
            </i>
          ) : row.site.address ? (
            <i>{row.site.address}</i>
          ) : null}
        </span>
      </td>

      <td data-col="7">
        {row.progress === null ? (
          <span className="ps-progress">
            <i>{copy.noCampaign}</i>
            <b className="ps-none">—</b>
          </span>
        ) : (
          <span className="ps-progress">
            <i>{row.progress.campaign}</i>
            <span className="ps-progress-row">
              <b>
                {fill(copy.progress, {
                  done: num(row.progress.done),
                  need: num(row.progress.need),
                })}
              </b>
              <em data-ready={row.progress.rewardEarned ? 'true' : undefined}>
                {row.progress.rewardEarned
                  ? copy.ready
                  : fill(copy.toGo, { n: num(Math.max(0, row.progress.need - row.progress.done)) })}
              </em>
            </span>
            <s>
              <u
                style={{
                  width: `${Math.min(100, (row.progress.done / Math.max(1, row.progress.need)) * 100)}%`,
                }}
              />
            </s>
          </span>
        )}
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════ the counter tool ══ */

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
export function Counter({
  venue,
  demoVenue,
  onRecorded,
}: {
  /** The live venue. `null` when there is no session to record against. */
  venue: PartnerVenue | null;
  /** Set only under `?demo=1`, where the panel explains why it cannot record. */
  demoVenue: PartnerVenue | null;
  onRecorded: () => void;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.scans.counter;
  const num = useNum();
  const venueMoney = useVenueMoney();
  const dates = useVenueDates(venue?.timezone ?? null);

  const [code, setCode] = useState('');
  /* The code the preview belongs to, which is what Confirm sends. Editing the
     field after a lookup clears the preview rather than recording against a
     code nobody looked at. */
  const [looked, setLooked] = useState('');
  const [lookup, setLookup] = useState<CounterLookup | null>(null);
  const [bill, setBill] = useState<number | null>(null);
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

  if (venue === null) {
    /* No session to record against. Under the demo that is the honest state
       too: a till tool that pretended to record a visit would teach somebody
       that it had. */
    return (
      <section className="pd-glass pd-panel ps-counter" data-reveal>
        <div className="ps-counter-head">
          <h2 className="pd-title">{copy.title}</h2>
        </div>
        <p className="pd-fine">{demoVenue ? copy.needsVenue : dashboard.unmeasured.noSession}</p>
      </section>
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
    setBill(null);
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
      setBill(null);
      setLookup(found);
    } catch (cause) {
      setLookup(null);
      setProblem(refusal(cause));
    } finally {
      setPhase('idle');
    }
  };

  const record = async (typed: number | null) => {
    if (lookup === null || phase !== 'idle') return;
    const value = typed ?? bill;
    if (value === null || !(value > 0)) {
      setProblem(copy.badAmount);
      return;
    }
    setPhase('recording');
    setProblem(null);
    try {
      const result = await counterRecord(
        venue.id,
        looked,
        majorToMinor(value, currency),
        crypto.randomUUID(),
      );
      setReceipt(result);
      setLookup(null);
      setLooked('');
      setCode('');
      setBill(null);
      onRecorded();
    } catch (cause) {
      setProblem(refusal(cause));
    } finally {
      setPhase('idle');
    }
  };

  const customer = lookup?.customer ?? null;

  return (
    <section className="pd-glass pd-panel ps-counter" data-reveal aria-labelledby="ps-counter-title">
      <div className="ps-counter-head">
        <h2 className="pd-title" id="ps-counter-title">
          {copy.title}
        </h2>
        <p className="pd-fine">{copy.lede}</p>
      </div>

      <form
        className="ps-counter-find"
        onSubmit={(event) => {
          event.preventDefault();
          void find();
        }}
      >
        <label className="field ps-counter-code">
          <span className="field-label">{copy.codeLabel}</span>
          <input
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
                setBill(null);
              }
            }}
          />
        </label>
        <button
          type="submit"
          className="btn btn-ghost"
          disabled={phase !== 'idle' || code.trim() === ''}
        >
          {phase === 'looking' ? copy.looking : copy.lookup}
        </button>
      </form>

      {lookup !== null && customer !== null && (
        <div className="ps-counter-card">
          <div className="ps-counter-who">
            {/* Initials only for a name the customer shared; otherwise the handle
                mark, which says "an account" and nothing about a person. */}
            <i aria-hidden="true">{customer.name ? initials(customer.name) : '@'}</i>
            <span>
              <b>{customer.handle ?? copy.noHandle}</b>
              <em data-quiet={customer.name ? undefined : 'true'}>{customer.name ?? copy.notShared}</em>
            </span>
            <span className="ps-first" data-on={customer.firstVisit ? 'true' : undefined}>
              {customer.firstVisit ? copy.firstVisit : copy.returning}
            </span>
          </div>

          {lookup.kind === 'voucher' && (
            <div className="ps-counter-offer">
              <span className="console-label">{copy.voucherTitle}</span>
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
            <div className="ps-counter-offer">
              <span className="console-label">{copy.rewardTitle}</span>
              <b>{lookup.reward.label}</b>
              <em>
                {fill(copy.rewardWorth, { amount: venueMoney(lookup.reward.costMinor, currency) })}
                {' · '}
                {fill(copy.expires, { date: dates.long(lookup.reward.expiresAt) })}
              </em>
              <code>{lookup.reward.code}</code>
            </div>
          )}

          <div className="ps-counter-stamps">
            {customer.stamps.length === 0 ? (
              <p className="pd-fine">{copy.noCampaigns}</p>
            ) : (
              customer.stamps.map((card) => (
                <div key={card.campaignId}>
                  <span>{card.campaign}</span>
                  <b>{fill(copy.stamps, { done: num(card.done), need: num(card.need) })}</b>
                  <s aria-hidden="true">
                    <u style={{ width: `${Math.min(100, (card.done / Math.max(1, card.need)) * 100)}%` }} />
                  </s>
                </div>
              ))
            )}
          </div>

          <form
            className="ps-counter-bill"
            onSubmit={(event) => {
              event.preventDefault();
              void record(null);
            }}
          >
            <div className="field">
              <span className="field-label">{copy.billLabel}</span>
              <NumberWell
                inputRef={billRef}
                value={bill}
                onChange={setBill}
                unit={fx.symbol}
                label={copy.billLabel}
                step={1 / 10 ** fx.decimals}
                min={0}
                wide
                describedBy="ps-counter-bill-note"
                onEnter={(typed) => void record(typed)}
              />
              <span className="field-help" id="ps-counter-bill-note">
                {fill(copy.billNote, { currency: fx.code })}
                {typeof ceiling === 'number' && ` ${fill(copy.billCeiling, { amount: venueMoney(ceiling, currency) })}`}
              </span>
            </div>
            <div className="ps-counter-acts">
              <button type="submit" className="btn btn-solid" disabled={phase !== 'idle'}>
                {phase === 'recording' ? copy.recording : copy.confirm}
              </button>
              <button type="button" className="btn btn-ghost" onClick={clear}>
                {copy.clear}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Polite, because every change here answers a press the person just made. */}
      <div className="ps-counter-live" aria-live="polite">
        {problem && (
          <p className="field-error" role="alert">
            {problem}
          </p>
        )}
        {receipt && (
          <div className="ps-counter-receipt">
            <span className="console-label">
              <Icon name="check" size={14} strokeWidth={2.6} />
              {copy.receiptTitle}
              {receipt.lookup.customer.handle && ` · ${receipt.lookup.customer.handle}`}
            </span>
            <ul>
              <li>{fill(copy.receiptBill, { amount: venueMoney(receipt.receipt.amountMinor, receipt.receipt.currency) })}</li>
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
    </section>
  );
}
