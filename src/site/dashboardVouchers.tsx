/**
 * The partner dashboard's Vouchers screen, in v3's dress (spec §3.4,
 * `b2b/dashboard-design/Paylez Partner Dashboard v3.dc.html`).
 *
 * Top to bottom: the alert (only when the pool runs dry before the month ends,
 * or already has), the ink budget card, the ladder, where the money went beside
 * what came back, and the caps. Styles are `dashboard-vouchers.css`, `dx-vch-*`
 * plus the kit; nothing here names a colour.
 *
 * ── three states, and none of them is a zero ──────────────────────────────
 *
 * `Screen` folds `loading | ready | error` the same way every other screen
 * does. Inside `ready` there is a second kind of missing, and it is the one
 * this screen is full of: a field an older API does not return. **Those are em
 * dashes, never 0** — "nobody has counted this" and "the count is zero" are
 * different findings and a venue owner acts differently on each. Every take-up
 * field on a rung, `returnedMinor` and `averageCheck.source` are optional for
 * that reason, and every cell reading one branches on `undefined`.
 *
 * ── what is a field and what is a fact ────────────────────────────────────
 *
 * v3 draws four wells, and all four are fields:
 *
 *  - **Total discount budget**. `PUT …/budget` takes it, and the loyalty
 *    split rides along so resizing the total cannot silently reallocate the
 *    other pool.
 *  - **Points needed**, per rung. `PUT …/tiers` upserts on the percentage, so
 *    one rung is sent and the others are left alone.
 *  - **Average transaction** — the owner's own figure, with a switch to
 *    **automatic**, which is the median of their own confirmed sales over the
 *    last 30 days. The owner flips it once *they* think enough sales are in;
 *    until then the figure they typed is the one every reserve and estimate is
 *    built from (`PATCH …/voucher-economics`, `venues.averageCheck`).
 *  - **Most off one voucher** — one figure that, when set, is every rung's cap.
 *    The rungs keep their own caps underneath (`tierMaxDiscountMinor`), so a
 *    save of a rung sends those back and clearing the field restores them;
 *    sending the applied cap instead would write the owner's figure into every
 *    rung for good.
 *
 * Money typed into a field is in the **reader's** currency and goes back
 * through the rate on the way out, because the site stores euros and converts
 * on the way out — right for a figure being shown, wrong for one being typed.
 * Every `…Minor` crossing into `partnerMetrics.ts` goes through `toEuro`, the
 * seam whose absence once printed "about 192,847 more vouchers".
 */

import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';

import { ApiError } from './api/client';
import {
  chain,
  euroToMinor,
  minorToEuro,
  setBudget,
  setVoucherEconomics,
  setVoucherTiers,
  usePartnerBudget,
  usePartnerVenue,
  type BudgetBody,
  type TierDraft,
} from './api/partner';
import { DEMO_BUDGET } from './dashboardDemo';
import { rescaledText, useNum, useRescaleOnCurrency } from './dashboardFormat';
import { Button, Card, CardHead, DxIcon, EmptyState, Eyebrow, Progress, Toggle, UnitField } from './dashboardKit';
import { Screen } from './dashboardScreens';
import { useDashboard } from './dashboardShell';
import { useCopy, useCurrency, useLanguage, useMoney } from './i18n/context';
import { fill } from './i18n/currency';
import { voucherModelFrom, type TierRow } from './partnerMetrics';

import './dashboard-vouchers.css';

/* ─────────────────────────────────────────────────────────────── the data ── */

/**
 * One rung of the ladder. An alias and **not** a second declaration: the
 * take-up fields are optional on `BudgetBody['tiers']` for older APIs, and
 * restating them here would be two places to keep in step.
 */
type Rung = BudgetBody['tiers'][number];

/**
 * v3's three tier tints — 5% the mint at a third, 10% the mint, 15% the deep
 * green — keyed by the percentage as v3 keys them, so a ladder of 5/10/15 draws
 * exactly the mock and a ladder of 8/12/20 still reads shallow-to-deep. One
 * hue at three strengths, never three hues.
 */
const stepOf = (pct: number): 1 | 2 | 3 => (pct >= 15 ? 3 : pct >= 10 ? 2 : 1);

/** Rungs in the order the table draws them: shallowest discount first. */
const byDepth = (rungs: readonly Rung[]) => [...rungs].sort((a, b) => a.discountPct - b.discountPct);

/* ──────────────────────────────────────────────────────────────── writing ── */

/**
 * A write, its two endings, and the re-read after it.
 *
 * Lock the control that is working, name a failure by *kind*, and re-read
 * rather than patch. A press that could not reach the server must not look like
 * a press that worked, and "the server is not there" and "the server looked at
 * this and refused" have different fixes — the second is printed in its own
 * words, because the budget's refusal names the committed floor.
 */
function useCommit(reload: () => void) {
  const acts = useCopy().dashboard.acts;
  const { toast } = useDashboard();
  const [busy, setBusy] = useState(false);

  const commit = useCallback(
    async (done: string, work: () => Promise<unknown>): Promise<boolean> => {
      setBusy(true);
      try {
        await work();
        toast(done);
        reload();
        return true;
      } catch (cause) {
        toast(
          cause instanceof ApiError && cause.status === 0
            ? acts.offline
            : fill(acts.refused, { why: cause instanceof Error ? cause.message : String(cause) }),
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [acts, reload, toast],
  );

  return { busy, commit };
}

/** Enter commits a well the way leaving it does — by leaving it. */
const blurOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key === 'Enter') event.currentTarget.blur();
};

/* ─────────────────────────────────────────────────────────────── the maths ── */

/** The budget period's month, given `YYYY-MM` — or the reader's own month if it is not. */
function monthOf(period: string, now: Date): { year: number; month: number; own: boolean } {
  const parsed = /^(\d{4})-(\d{2})$/.exec(period);
  if (parsed === null) {
    /* The server's period is a month (`localMonth`); a payload that carried
       anything else would make the screen unviewable if this threw. */
    return { year: now.getUTCFullYear(), month: now.getUTCMonth(), own: true };
  }
  const year = Number(parsed[1]);
  const month = Number(parsed[2]) - 1;
  return { year, month, own: now.getUTCFullYear() === year && now.getUTCMonth() === month };
}

/**
 * When the pool runs dry, at the rate it has been going out.
 *
 *  - `out` — nothing is available now.
 *  - `low` — it runs out on a day *inside* the period: the alert's case.
 *  - `ok` with a date — it outlasts the month, and v3 still names the day.
 *  - `ok` with `null` — nothing has gone out yet, so there is no rate to
 *    extrapolate and no day to name; the sentence says the month instead.
 *
 * Straight-line from the spend so far over the days of the period that have
 * actually happened — which is why `own` matters: a month that has ended has
 * all of its days behind it, and dividing by today's date would price a
 * finished month as though it were a fortnight in.
 */
type Forecast = { kind: 'out' } | { kind: 'low'; at: Date } | { kind: 'ok'; at: Date | null; last: Date };

function forecastOf(period: string, spent: number, available: number, now: Date): Forecast {
  const { year, month, own } = monthOf(period, now);
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, month, days));
  if (available <= 0) return { kind: 'out' };

  const elapsed = own ? Math.max(1, now.getUTCDate()) : days;
  const perDay = spent / elapsed;
  if (perDay <= 0) return { kind: 'ok', at: null, last };

  const lasts = elapsed + available / perDay;
  const at = new Date(Date.UTC(year, month, Math.max(1, Math.ceil(lasts))));
  return lasts >= days ? { kind: 'ok', at, last } : { kind: 'low', at };
}

/**
 * A day written out in full — "3 September". Long because it sits in prose;
 * the register's table uses the short month. Not `useVenueDates`: a forecast is
 * computed from `new Date()` and a budget period is a calendar month, neither
 * of which happened at the venue's till.
 */
const dayFormatOf = (language: string) => new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long' });

/* ─────────────────────────────────────────────────────────────── the parts ── */

/** A figure the server has not reported — the dash, with the true sentence behind it. */
function Missing() {
  const unmeasured = useCopy().dashboard.unmeasured;
  return (
    <b className="dx-vch-missing" title={unmeasured.noSource}>
      —
    </b>
  );
}

/** The tier chip: "10% off" on its own strength of the one accent. */
function TierChip({ pct, size }: { pct: number; size?: 'sm' }) {
  const copy = useCopy().dashboard.vouchers;
  return (
    <span className="dx-vch-chip" data-step={stepOf(pct)} data-size={size}>
      {fill(copy.tier, { n: String(pct) })}
    </span>
  );
}

/**
 * The alert above the ink card, in its two v3 readings: amber when the pool
 * runs out before the month does, red when it already has.
 *
 * "Increase the budget" is a real destination rather than v3's fixed +500: the
 * total is a field one card down, and this scrolls to it and puts the caret in
 * it. Adding an amount nobody chose would be the screen spending money.
 */
function Alert({ forecast, onRaise }: { forecast: Forecast; onRaise: () => void }) {
  const copy = useCopy().dashboard.vouchers;
  const [language] = useLanguage();
  if (forecast.kind === 'ok') return null;
  const out = forecast.kind === 'out';

  return (
    <div className="dx-vch-alert" data-tone={out ? 'down' : 'warn'} role="status">
      <DxIcon name="warn" size={20} strokeWidth={1.9} />
      <div>
        <b>{out ? copy.outTitle : fill(copy.alertTitle, { date: dayFormatOf(language).format(forecast.at) })}</b>
        <p>{out ? copy.outBody : copy.alertBody}</p>
      </div>
      <Button variant="primary" onClick={onRaise}>
        {copy.alertAction}
      </Button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────── the ink card ── */

function BudgetCard({
  budget,
  forecast,
  moreVouchers,
  totalRef,
  autoFocus,
  reload,
}: {
  budget: BudgetBody;
  forecast: Forecast;
  /** Null when no rung reports a take-up, which is what a dash is drawn for. */
  moreVouchers: number | null;
  totalRef: RefObject<HTMLInputElement | null>;
  autoFocus: boolean;
  reload: () => void;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.vouchers;
  const [language] = useLanguage();
  const currency = useCurrency();
  const money = useMoney();
  const num = useNum();
  const { busy, commit } = useCommit(reload);

  const toEuro = (minor: number) => minorToEuro(minor, budget.currency);
  const toReader = (minor: number) => toEuro(minor) * currency.rate;

  /* `null` is "nobody has typed", which is what lets the well fall back to the
     server's figure after a reload without an effect to copy it across. A
     failed save keeps the draft: the number on screen is the one asked for. */
  const [draft, setDraft] = useState<string | null>(null);
  useRescaleOnCurrency((ratio) => setDraft((typed) => (typed === null ? null : rescaledText(typed, ratio))));
  const server = Math.round(toReader(budget.total));

  const save = () => {
    if (draft === null) return;
    const next = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(next) || next < 0 || Math.round(next) === server) {
      setDraft(null);
      return;
    }
    void commit(dashboard.acts.budgetSaved, async () => {
      /* The split rides along. `PUT …/budget` takes a total and a share of it,
         and omitting the share lets the server keep whatever default it had —
         so resizing the pool would quietly move money between the two. */
      await setBudget(
        budget.venueId,
        euroToMinor(Math.round(next) / currency.rate, budget.currency),
        budget.total > 0 ? Math.round((budget.loyalty.base / budget.total) * 10_000) : undefined,
      );
      setDraft(null);
    });
  };

  const pool = budget.voucher;
  const day = dayFormatOf(language);
  const monthName = new Intl.DateTimeFormat(language, { month: 'long' });

  /* v3's forecast chip. With no spend yet there is no rate and so no day; the
     month is the honest thing to name. */
  const runsOut = forecast.kind === 'out' ? null : forecast.at;
  const forecastLine =
    forecast.kind === 'out'
      ? copy.forecastOut
      : /* A pool that outlasts the month says so. Naming its day printed "runs
           out around August 21" in October — a date years ahead, written
           without its year, read as one already gone. */
        forecast.kind === 'ok'
        ? fill(copy.forecastSafe, { month: monthName.format(forecast.last) })
        : runsOut !== null
          ? fill(copy.forecast, { date: day.format(runsOut) })
          : copy.forecastOut;

  const avg = budget.averageCheck.minor > 0 ? money(toEuro(budget.averageCheck.minor), 'unit') : null;

  return (
    <Card tone="ink" className="dx-vch-budget" aria-label={copy.budgetTitle}>
      <div className="dx-vch-budget-top">
        <div>
          <h2>{copy.budgetTitle}</h2>
          <p>{copy.budgetLede}</p>
        </div>
        <label className="dx-vch-total">
          <span>{copy.budgetLabel}</span>
          <span className="dx-vch-total-well">
            <input
              ref={totalRef}
              type="number"
              inputMode="numeric"
              min={0}
              step={100}
              autoFocus={autoFocus}
              disabled={busy}
              value={draft ?? String(server)}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={save}
              onKeyDown={blurOnEnter}
            />
            <em>{currency.symbol}</em>
          </span>
        </label>
      </div>

      <p className="dx-vch-split">
        {fill(copy.allocSplit, {
          voucher: money(toEuro(pool.base), 'exact'),
          loyalty: money(toEuro(budget.loyalty.base), 'exact'),
        })}
      </p>

      {/* One bar in three parts rather than three bars, because the three are
          one quantity split up: spent, set aside and available exhaust the pool
          by construction, and stacking them is the only drawing that says so.
          The kit clamps the set-aside part into what spent left. */}
      <Progress
        spent={pool.spent}
        aside={pool.reserved}
        total={pool.base}
        tone="fill"
        height={18}
        label={copy.allocNote}
      />

      <div className="dx-vch-legend">
        <div>
          <span className="dx-vch-key">
            <i data-part="spent" />
            {copy.spent}
          </span>
          <b>{money(toEuro(pool.spent), 'exact')}</b>
          <p>{copy.spentNote}</p>
        </div>
        <div>
          <span className="dx-vch-key">
            <i data-part="aside" />
            {copy.held}
          </span>
          <b>{money(toEuro(pool.reserved), 'exact')}</b>
          <p>{copy.heldNote}</p>
        </div>
        <div>
          <span className="dx-vch-key">
            <i data-part="free" />
            {copy.free}
          </span>
          <b data-empty={pool.available <= 0 ? 'true' : undefined}>
            {money(toEuro(Math.max(0, pool.available)), 'exact')}
          </b>
          <p>{copy.freeNote}</p>
        </div>
      </div>

      <p className="dx-vch-forecast" data-tone={forecast.kind === 'ok' ? undefined : 'warn'}>
        <DxIcon name="clock" size={16} strokeWidth={2} />
        <span>{forecastLine}</span>
      </p>

      <div className="dx-vch-foot">
        <div>
          <span className="dx-vch-foot-label">{copy.buysTitle}</span>
          {moreVouchers === null ? (
            <Missing />
          ) : (
            <b className="dx-vch-foot-big">{fill(copy.buys, { n: num(moreVouchers) })}</b>
          )}
          {avg !== null && <p>{fill(copy.buysNote, { amount: avg })}</p>}
        </div>

        <Economics budget={budget} reload={reload} />
      </div>
    </Card>
  );
}

/* ──────────────────────────────────────────── the owner's two figures ── */

/**
 * "Average transaction" and "Most off one voucher" — the two figures every
 * voucher reserve and estimate is built from, and both the owner's to set.
 *
 * Typed in the reader's currency and sent as minor units of the venue's, like
 * every money field here; both save on leaving the field, like the total
 * beside them. An emptied field sends `null`, which hands the figure back to
 * the rule: the venue's category typical (or a month of its own sales) for the
 * average, and each rung's own cap for the most off one voucher.
 *
 * The automatic switch is a separate write on purpose. It is a judgement —
 * "there are enough of my sales now" — and the figure it brings in is the
 * median the server measures, which the field then shows and does not take.
 */
function Economics({ budget, reload }: { budget: BudgetBody; reload: () => void }) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.vouchers;
  const currency = useCurrency();
  const money = useMoney();
  const num = useNum();
  const { busy, commit } = useCommit(reload);

  const toEuro = (minor: number) => minorToEuro(minor, budget.currency);
  /* Two decimals in the field: an average check is a figure with pence in it. */
  const toReader = (minor: number) => Math.round(toEuro(minor) * currency.rate * 100) / 100;
  const toMinor = (typed: number) => euroToMinor(typed / currency.rate, budget.currency);

  const check = budget.averageCheck;
  const auto = check.mode === 'automatic';
  const [avgDraft, setAvgDraft] = useState<string | null>(null);
  const [maxDraft, setMaxDraft] = useState<string | null>(null);
  useRescaleOnCurrency((ratio) => {
    setAvgDraft((typed) => (typed === null ? null : rescaledText(typed, ratio)));
    setMaxDraft((typed) => (typed === null ? null : rescaledText(typed, ratio)));
  });

  const avgShown = check.minor > 0 ? String(toReader(check.minor)) : '';
  /* The rungs' own caps, which are what applies while the owner has set none. */
  const rungCaps = budget.tiers
    .filter((rung) => rung.active !== false)
    .map((rung) => rung.tierMaxDiscountMinor ?? rung.maxDiscountMinor);
  const largestRungCap = rungCaps.length > 0 ? Math.max(...rungCaps) : null;
  const ownCap = budget.maxVoucherMinor ?? null;
  const maxShown = ownCap === null ? '' : String(toReader(ownCap));

  /** What a field's text means: null for empty, a positive amount, or undefined for nonsense. */
  const meaning = (text: string): number | null | undefined => {
    if (text.trim() === '') return null;
    const value = Number(text.replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : undefined;
  };

  const saveAvg = () => {
    if (avgDraft === null) return;
    const meant = meaning(avgDraft);
    if (meant === undefined || avgDraft.trim() === avgShown || (meant === null && (check.ownerMinor ?? null) === null)) {
      setAvgDraft(null);
      return;
    }
    void commit(meant === null ? copy.avgCleared : copy.avgSaved, async () => {
      await setVoucherEconomics(budget.venueId, {
        averageCheckMinor: meant === null ? null : Math.max(1, toMinor(meant)),
      });
      setAvgDraft(null);
    });
  };

  const saveMax = () => {
    if (maxDraft === null) return;
    const meant = meaning(maxDraft);
    if (meant === undefined || maxDraft.trim() === maxShown || (meant === null && ownCap === null)) {
      setMaxDraft(null);
      return;
    }
    void commit(meant === null ? copy.maxCleared : copy.maxSaved, async () => {
      await setVoucherEconomics(budget.venueId, {
        maxVoucherMinor: meant === null ? null : Math.max(1, toMinor(meant)),
      });
      setMaxDraft(null);
    });
  };

  const switchAuto = (next: boolean) =>
    void commit(next ? copy.avgAutoSaved : copy.avgManualSaved, async () => {
      setAvgDraft(null);
      await setVoucherEconomics(budget.venueId, { averageCheckAuto: next });
    });

  /* The line under the average says where the figure in the field came from. */
  const sales =
    check.salesMinor !== undefined && check.salesMinor !== null && check.samples !== undefined
      ? fill(copy.avgSales, { amount: money(toEuro(check.salesMinor), 'unit'), n: num(check.samples) })
      : null;
  const avgLine = auto
    ? check.source === 'computed'
      ? fill(copy.avgAutoOn, { n: num(check.samples ?? 0) })
      : copy.avgAutoWaiting
    : check.source === 'owner'
      ? [copy.avgOwner, sales].filter(Boolean).join(' ')
      : check.source === 'computed'
        ? copy.avgNote
        : check.source === 'category'
          ? [copy.avgCategory, sales].filter(Boolean).join(' ')
          : null;

  return (
    <>
      <div>
        <span className="dx-vch-foot-label">{copy.avgTitle}</span>
        <label className="dx-vch-total-well" data-size="sm">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            aria-label={copy.avgTitle}
            disabled={busy || auto}
            value={auto ? avgShown : (avgDraft ?? avgShown)}
            onChange={(event) => setAvgDraft(event.target.value)}
            onBlur={saveAvg}
            onKeyDown={blurOnEnter}
          />
          <em>{currency.symbol}</em>
        </label>
        <div className="dx-vch-auto">
          <Toggle checked={auto} onChange={switchAuto} label={copy.avgAuto} disabled={busy || check.mode === undefined} />
        </div>
        {avgLine !== null && <p>{avgLine}</p>}
      </div>

      <div>
        <span className="dx-vch-foot-label">{copy.maxTitle}</span>
        <label className="dx-vch-total-well" data-size="sm">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            aria-label={copy.maxTitle}
            placeholder={largestRungCap === null ? undefined : String(toReader(largestRungCap))}
            disabled={busy || budget.maxVoucherMinor === undefined}
            value={maxDraft ?? maxShown}
            onChange={(event) => setMaxDraft(event.target.value)}
            onBlur={saveMax}
            onKeyDown={blurOnEnter}
          />
          <em>{currency.symbol}</em>
        </label>
        <p>
          {ownCap !== null || largestRungCap === null
            ? copy.maxNote
            : fill(copy.maxPerTier, { amount: money(toEuro(largestRungCap), 'unit') })}
        </p>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────── the ladder ── */

/**
 * Who reaches each tier, and what it has cost. The one editable number is the
 * threshold, because it is the one the sentence is about: points decide who
 * gets there, so raising a number sends less of the budget that way.
 */
function Ladder({ budget, reload }: { budget: BudgetBody; reload: () => void }) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.vouchers;
  const money = useMoney();
  const num = useNum();
  const { busy, commit } = useCommit(reload);

  /* Keyed by percentage, the rung's identity on the server too — an index would
     be wrong the moment a rung is added or retired under the draft. */
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const ordered = byDepth(budget.tiers);
  const toEuro = (minor: number) => minorToEuro(minor, budget.currency);

  const pointsOf = (rung: Rung) => {
    const typed = drafts[rung.discountPct];
    return typed === undefined || typed.trim() === '' ? rung.pointsCost : Number(typed);
  };
  /* The ladder must climb, among the rungs on sale: a retired rung is listed for
     the vouchers still out at it, and its points are history rather than a
     price. Checked on the drafts, so it shows while typing. */
  const onSale = ordered.filter((rung) => rung.active !== false);
  const outOfOrder = onSale.some((rung, index) => index > 0 && pointsOf(rung) < pointsOf(onSale[index - 1]));

  const drop = (pct: number) =>
    setDrafts((current) => {
      const { [pct]: _gone, ...rest } = current;
      return rest;
    });

  const save = (rung: Rung) => {
    const typed = drafts[rung.discountPct];
    if (typed === undefined) return;
    const next = Math.round(Number(typed));
    if (typed.trim() === '' || !(next > 0) || next === rung.pointsCost) {
      drop(rung.discountPct);
      return;
    }
    void commit(dashboard.acts.tiersSaved, async () => {
      /* No cap keys: a rung sent without them keeps the caps it has, so saving
         a price never clears a limit set on the card below. */
      /* The rung's own cap, not the applied one: see `tierMaxDiscountMinor`. */
      await setVoucherTiers(budget.venueId, [
        {
          discountPct: rung.discountPct,
          pointsCost: next,
          maxDiscountMinor: rung.tierMaxDiscountMinor ?? rung.maxDiscountMinor,
          active: true,
        },
      ]);
      drop(rung.discountPct);
    });
  };

  /* v3's three notes, by place on the ladder rather than by percentage. */
  const noteOf = (index: number) =>
    index === 0 ? copy.steps.first : index === ordered.length - 1 ? copy.steps.last : copy.steps.middle;

  return (
    <Card pad="none" className="dx-vch-ladder">
      <div className="dx-vch-ladder-head">
        <div>
          <h2>{copy.tiersTitle}</h2>
          <p>{copy.tiersLede}</p>
        </div>
        {onSale.length > 0 && <span>{copy.savesOnBlur}</span>}
      </div>

      {ordered.length === 0 ? (
        <p className="dx-vch-none">{dashboard.empty.vouchers.body}</p>
      ) : (
        <div className="dx-vch-scroll">
          <table className="dx-vch-tiers" aria-label={copy.tiersTitle}>
            <thead>
              <tr>
                {copy.columns.map((column) => (
                  <th key={column} scope="col">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordered.map((rung, index) => (
                <tr key={rung.discountPct} data-retired={rung.active === false ? 'true' : undefined}>
                  <td>
                    <span className="dx-vch-tier">
                      <TierChip pct={rung.discountPct} />
                      <span>{rung.active === false ? copy.retired : noteOf(index)}</span>
                    </span>
                  </td>
                  <td>
                    {rung.active === false ? (
                      /* A fact: `PUT …/tiers` sends `active: true`, so saving a
                         retired rung's points would put it back on sale. */
                      <b className="dx-vch-points-fact" title={dashboard.acts.tierRetired}>
                        {fill(copy.points, { n: num(rung.pointsCost) })}
                      </b>
                    ) : (
                      <UnitField
                        unit={copy.pointsUnit}
                        min={1}
                        step={10}
                        inputMode="numeric"
                        aria-label={fill(copy.pointsFor, { tier: fill(copy.tier, { n: String(rung.discountPct) }) })}
                        disabled={busy}
                        value={drafts[rung.discountPct] ?? String(rung.pointsCost)}
                        invalid={outOfOrder && drafts[rung.discountPct] !== undefined}
                        onChange={(event) =>
                          setDrafts((current) => ({ ...current, [rung.discountPct]: event.target.value }))
                        }
                        onBlur={() => save(rung)}
                        onKeyDown={blurOnEnter}
                      />
                    )}
                  </td>
                  <td>{rung.issuedCount === undefined ? <Missing /> : <b>{num(rung.issuedCount)}</b>}</td>
                  <td>{rung.redeemedCount === undefined ? <Missing /> : <b>{num(rung.redeemedCount)}</b>}</td>
                  <td data-quiet="true">
                    {rung.spentMinor === undefined ? <Missing /> : money(toEuro(rung.spentMinor), 'exact')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {outOfOrder && (
        <p className="dx-vch-error" role="alert">
          {copy.pointsOrder}
        </p>
      )}
    </Card>
  );
}

/* ──────────────────────────────────────────────── where it went, and back ── */

/**
 * Where the money went, what came back, and the one suggestion.
 *
 * The mix is per-rung spend off the budget body. Its headline is the *sum of
 * the legend*, not the pool's own `spent` — they are the same quantity, and a
 * panel whose parts do not add up to its own headline is the bug the metrics
 * module exists to prevent. With nothing spent it says so in words rather than
 * drawing an empty bar, because an empty stacked bar and a budget nobody has
 * spent are the same picture.
 */
function Aftermath({ budget }: { budget: BudgetBody }) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.vouchers;
  const money = useMoney();

  const toEuro = (minor: number) => minorToEuro(minor, budget.currency);
  const costed = byDepth(budget.tiers).filter(
    (rung): rung is Rung & { spentMinor: number } => rung.spentMinor !== undefined,
  );
  const totalMinor = costed.reduce((sum, rung) => sum + rung.spentMinor, 0);
  const pct = (minor: number) => Math.round((minor / totalMinor) * 100);

  /* The rung carrying most of the spend, which is what the suggestion names.
     From measured spend, because the sentence names a tier the owner can check. */
  const biggest =
    totalMinor > 0
      ? costed.reduce((best, rung) => (rung.spentMinor > best.spentMinor ? rung : best), costed[0])
      : null;

  return (
    <div className="dx-vch-pair">
      <Card className="dx-vch-mix">
        <div className="dx-vch-mix-head">
          <h2>{copy.mixTitle}</h2>
          {totalMinor > 0 && <b>{money(toEuro(totalMinor), 'exact')}</b>}
        </div>
        {totalMinor <= 0 ? (
          <p className="dx-vch-quiet">{costed.length === 0 ? dashboard.unmeasured.noSource : copy.insightNone}</p>
        ) : (
          <>
            <div className="dx-vch-mixbar" role="img" aria-label={copy.mixTitle}>
              {costed.map((rung) => (
                <i
                  key={rung.discountPct}
                  data-step={stepOf(rung.discountPct)}
                  style={{ width: `${((rung.spentMinor / totalMinor) * 100).toFixed(1)}%` }}
                />
              ))}
            </div>
            <ul className="dx-vch-mixrows">
              {costed.map((rung) => (
                <li key={rung.discountPct}>
                  <i data-step={stepOf(rung.discountPct)} />
                  <span>{fill(copy.tier, { n: String(rung.discountPct) })}</span>
                  <em>{money(toEuro(rung.spentMinor), 'exact')}</em>
                  <b>{pct(rung.spentMinor)}%</b>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <div className="dx-vch-side">
        <Card className="dx-vch-returned">
          <span className="dx-vch-returned-label">{copy.returnedTitle}</span>
          {/* Released into this month's pool by expiries, counted by the server.
              An API that predates the field is a dash, never a 0 — "nothing
              expired" and "nobody counted" are opposite readings of one glyph. */}
          {budget.returnedMinor === undefined ? (
            <Missing />
          ) : (
            <b>{money(toEuro(budget.returnedMinor), 'exact')}</b>
          )}
          <p>{copy.returnedNote}</p>
        </Card>

        <div className="dx-vch-suggest">
          <span>
            <DxIcon name="bulb" size={15} strokeWidth={1.9} />
            <Eyebrow>{copy.suggestion}</Eyebrow>
          </span>
          <p>{biggest === null ? copy.insightNone : fill(copy.insight, { n: String(biggest.discountPct) })}</p>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── the caps ── */

/**
 * How many of each are given out — `redeem_limit` and `per_user_limit`.
 *
 * Not on v3's page, and kept because it is a real write: it moved here from
 * the old register screen, which v3 turns into a plain log, and it belongs
 * beside the ladder it limits. A cap is only meaningful next to how much of it
 * is used, so each rung reads "18 of 20 taken" over a bar.
 *
 * **`null` is a value.** `undefined` is an API that predates the columns (the
 * card is not drawn at all then), `null` is a rung nobody has capped, and a
 * number is a cap. Emptying a field sends `null` explicitly, because a rung
 * sent *without* the key keeps whatever cap it has — which is also what lets
 * the ladder above save a price without clearing a cap.
 */
function Limits({ budget, reload }: { budget: BudgetBody; reload: () => void }) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.register.caps;
  const num = useNum();
  const { busy, commit } = useCommit(reload);
  type Which = 'redeemLimit' | 'perUserLimit';
  const [draft, setDraft] = useState<Record<string, Partial<Record<Which, string>>>>({});

  const rungs = byDepth(budget.tiers);
  if (rungs.every((rung) => rung.redeemLimit === undefined && rung.perUserLimit === undefined)) return null;

  /* What the field shows: the typed string, else the stored cap, else empty. */
  const shown = (rung: Rung, which: Which) => {
    const typed = draft[rung.id]?.[which];
    if (typed !== undefined) return typed;
    const stored = rung[which];
    return stored === null || stored === undefined ? '' : String(stored);
  };
  /* What it means: an empty or non-positive field is "no limit" — zero is not
     the gesture, because the route refuses a cap of zero by name. */
  const meant = (rung: Rung, which: Which): number | null => {
    const value = Number(shown(rung, which));
    return shown(rung, which).trim() === '' || !(value > 0) ? null : Math.round(value);
  };
  const edit = (rung: Rung, which: Which, value: string) =>
    setDraft((current) => ({ ...current, [rung.id]: { ...current[rung.id], [which]: value } }));

  const editable = rungs.filter((rung) => rung.active !== false);
  const touched = editable.filter((rung) => draft[rung.id] !== undefined);

  const save = () => {
    if (touched.length === 0) return;
    void commit(copy.saved, async () => {
      /* Only the rungs that were touched, and on each only the fields that
         were: an untouched key is left out so its cap stands. */
      const sent: TierDraft[] = touched.map((rung) => {
        const fields = draft[rung.id] ?? {};
        return {
          discountPct: rung.discountPct,
          pointsCost: rung.pointsCost,
          maxDiscountMinor: rung.tierMaxDiscountMinor ?? rung.maxDiscountMinor,
          ...('redeemLimit' in fields ? { redeemLimit: meant(rung, 'redeemLimit') } : {}),
          ...('perUserLimit' in fields ? { perUserLimit: meant(rung, 'perUserLimit') } : {}),
        };
      });
      await setVoucherTiers(budget.venueId, sent);
      setDraft({});
    });
  };

  return (
    <Card className="dx-vch-limits">
      <CardHead title={copy.title} sub={copy.lede} />
      <div className="dx-vch-limit-rows">
        {rungs.map((rung) => {
          const cap = meant(rung, 'redeemLimit');
          const taken = rung.issuedTotal;
          const locked = rung.active === false;
          return (
            <div className="dx-vch-limit" key={rung.id}>
              <div className="dx-vch-limit-use">
                <TierChip pct={rung.discountPct} size="sm" />
                {/* The lifetime count a cap is measured against — not this
                    month's `issuedCount` in the table above. */}
                {taken === undefined ? (
                  <Missing />
                ) : cap === null ? (
                  <span>{fill(copy.takenNoCap, { n: num(taken) })}</span>
                ) : (
                  <span className="dx-vch-limit-bar">
                    <Progress spent={taken} total={cap} height={6} track="soft" />
                    <span>{fill(copy.taken, { n: num(taken), total: num(cap) })}</span>
                  </span>
                )}
              </div>
              {locked ? (
                <span className="dx-vch-retired">{copy.retired}</span>
              ) : (
                (['redeemLimit', 'perUserLimit'] as const).map((which) => (
                  <label className="dx-vch-cap" key={which}>
                    <span>{which === 'redeemLimit' ? copy.total : copy.perUser}</span>
                    <UnitField
                      unit={copy.unit}
                      min={1}
                      step={1}
                      inputMode="numeric"
                      placeholder={copy.noLimit}
                      disabled={busy}
                      value={shown(rung, which)}
                      onChange={(event) => edit(rung, which, event.target.value)}
                    />
                  </label>
                ))
              )}
            </div>
          );
        })}
      </div>
      <div className="dx-vch-limits-foot">
        <p>{copy.noLimitNote}</p>
        <Button variant="primary" disabled={touched.length === 0 || busy} onClick={save}>
          {busy ? copy.saving : copy.save}
        </Button>
      </div>
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────── the board ── */

function Board({ budget, reload }: { budget: BudgetBody; reload: () => void }) {
  const empty = useCopy().dashboard.empty.vouchers;
  const totalRef = useRef<HTMLInputElement | null>(null);

  /* v3's "unset" state: a pool of nothing that nothing has touched. A pool that
     was set and then spent is "out", which is a different month. */
  const pool = budget.voucher;
  const unset = budget.total <= 0 && pool.spent <= 0 && pool.reserved <= 0;
  const [opened, setOpened] = useState(false);

  /* One model, and it is the shared one: `voucherModelFrom` prices a rung at
     `min(check × pct, cap)` and weights "what is left buys" by how the rungs
     actually land. `toEuro` is passed because `Pool` is minor units. */
  const model = useMemo(() => {
    const toEuro = (minor: number) => minorToEuro(minor, budget.currency);
    const rows: TierRow[] = budget.tiers.map((rung) => ({
      pct: rung.discountPct,
      points: rung.pointsCost,
      issued: rung.issuedCount ?? 0,
      redeemed: rung.redeemedCount ?? 0,
      cap: toEuro(rung.maxDiscountMinor),
      remaining: rung.estimatedRemaining,
    }));
    return voucherModelFrom(
      budget.voucher,
      rows,
      toEuro(budget.averageCheck.minor),
      Math.max(0, ...rows.map((row) => row.cap)),
      toEuro,
    );
  }, [budget]);
  /* Priced at the mix actually being issued, so with no issue counts there is
     no mix and the figure is a dash rather than a 0. */
  const moreVouchers = budget.tiers.some((rung) => rung.issuedCount !== undefined) ? model.moreVouchers : null;

  const forecast = useMemo(
    () => forecastOf(budget.period, pool.spent, pool.available, new Date()),
    [budget.period, pool.spent, pool.available],
  );

  if (unset && !opened) {
    /* No suggested figure: v3 offers "1 500 zł for a café your size", and
       nothing here knows what a venue this size gives away. The press opens the
       budget card with its field focused — the real control, not a preset. */
    return (
      <EmptyState
        icon="vouchers"
        title={empty.title}
        body={empty.body}
        action={{ label: empty.action, onClick: () => setOpened(true) }}
      />
    );
  }

  const raise = () => {
    totalRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    totalRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="dx-vch">
      {!unset && <Alert forecast={forecast} onRaise={raise} />}
      <BudgetCard
        budget={budget}
        forecast={forecast}
        moreVouchers={moreVouchers}
        totalRef={totalRef}
        autoFocus={opened}
        reload={reload}
      />
      <Ladder budget={budget} reload={reload} />
      <Aftermath budget={budget} />
      <Limits budget={budget} reload={reload} />
    </div>
  );
}

/**
 * The voucher pool, the ladder that spends it, and what that bought.
 *
 * The venue is read first because the budget is addressed by venue id, and
 * `chain` folds the two requests into one state so the screen cannot draw half
 * of itself while the other half is in flight. `usePartnerVenue` follows the
 * frame's venue switcher.
 */
export function Vouchers() {
  const venueApi = usePartnerVenue();
  const liveId = venueApi.state.status === 'ready' ? (venueApi.state.data?.id ?? null) : null;
  const budgetApi = usePartnerBudget(liveId);
  const state = chain(venueApi, budgetApi);

  return (
    <Screen state={state} id="vouchers" demo={DEMO_BUDGET}>
      {(budget) => <Board budget={budget} reload={budgetApi.reload} />}
    </Screen>
  );
}
