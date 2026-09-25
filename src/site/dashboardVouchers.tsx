/**
 * The partner dashboard's Vouchers screen.
 *
 * Split out of `dashboardScreens.tsx` because it is the one screen whose layout
 * is not the file's shared vocabulary of panels and rows: it opens on a **dark
 * slab in both themes**, and everything under that slab is sized against it.
 * Reference: `b2b/uploads/vouchers1.png` and `vouchers2.png`.
 *
 * ── the slab, and why it is not a rule per child ──────────────────────────
 *
 * `data-ink='on'` re-points the tokens *inside* the panel — text to white at
 * three alphas, the accent to the mint, surfaces and borders to white at low
 * alpha — so a kicker that already reads `--accent-ink` and a figure that
 * already reads `--text` invert without knowing the scope exists. That is the
 * `[data-ink]` block in `site.css`, and it is the reason nothing below sets a
 * white anywhere. `'on'` rather than `'paper'` because this panel is dark in
 * **both** themes, which is the design's whole gesture; `'paper'` is for the
 * slabs that are already dark when the page is.
 *
 * ── three states, and none of them is a zero ──────────────────────────────
 *
 * `Screen` folds `loading | ready | error` the same way every other screen
 * does. Inside `ready` there is a second kind of missing, and it is the one
 * this screen is full of: a column the server does not return yet. **Those are
 * em dashes, never 0** — "nobody has counted this" and "the count is zero" are
 * different findings and a venue owner acts differently on each. The take-up
 * fields on a ladder rung — `issuedCount`, `redeemedCount`, `activeCount`,
 * `spentMinor` — are counted by the server now and still optional, so a site
 * built against this shape renders against an API that predates them; every
 * cell that reads one branches on `undefined`.
 *
 * ── what is a field and what is a fact ────────────────────────────────────
 *
 * The reference design draws three number wells. Two of them are facts here,
 * and that is the honesty rule this dashboard states one file over — a figure
 * the screen cannot honestly make editable is shown as a fact rather than a
 * field:
 *
 *  - **Total discount budget** is a field. `PUT …/budget` takes it, and the
 *    loyalty split rides along so resizing the total cannot silently
 *    reallocate the other pool.
 *  - **Average transaction** is a fact. It is the median of the venue's own
 *    confirmed scans, computed by `averageCheck` on the server, and there is no
 *    endpoint that sets it. A well over it would be a control with nothing
 *    behind it.
 *  - **Most off one voucher** is a fact. It is `max_discount_minor` and it is
 *    stored **per rung**; one well over the three would flatten a 10/25/40
 *    ladder to 25 with nothing in the response saying so. That is the silent
 *    kind of wrong, which is the kind this repo keeps paying for.
 *
 * Money typed into the one field is in the **reader's** currency and goes back
 * through the rate on the way out (`minorToEuro` / `euroToMinor` × the reader's
 * rate), because the site stores euros and converts on the way out — right for
 * a figure being shown and wrong for one being typed.
 */

import { useCallback, useMemo, useState } from 'react';

import { ApiError } from './api/client';
import {
  chain,
  euroToMinor,
  minorToEuro,
  setBudget,
  setVoucherTiers,
  usePartnerBudget,
  usePartnerVenue,
  type BudgetBody,
} from './api/partner';
import { DEMO_BUDGET } from './dashboardDemo';
import { NumberWell } from './dashboardControls';
/* Split from `dashboardScreens` because a module that exports a hook *and*
   components breaks React fast refresh — the same split `theme/` and `i18n/`
   already make. `Screen` is a component and stays where it is. */
import { useNum } from './dashboardFormat';
import { Screen } from './dashboardScreens';
import { useDashboard } from './dashboardShell';
import { Icon } from './icons';
import { useCopy, useCurrency, useLanguage, useMoney } from './i18n/context';
import { fill } from './i18n/currency';
import { voucherModelFrom, type TierRow } from './partnerMetrics';

/* ─────────────────────────────────────────────────────────────── the data ── */

/**
 * One rung of the ladder, named for what this screen calls it.
 *
 * An alias and **not** a second declaration of the shape. The take-up fields
 * are optional on `BudgetBody['tiers']` for older APIs, and restating them here
 * would be two places to keep in step. Every cell that reads one branches on
 * `undefined` and draws an em dash: "nobody has counted this" and "the count is
 * zero" are different findings, and a 0 would report the second when the first
 * is true.
 */
type Rung = BudgetBody['tiers'][number];

/** The three parts of the pool, in the order the bar draws them. */
type Part = 'spent' | 'held' | 'free';

/* ──────────────────────────────────────────────────────────────── writing ── */

/**
 * A write, its two endings, and the re-read after it.
 *
 * The same three obligations `useAction` owns on the other screens — lock the
 * control that is working, name a failure by *kind*, and re-read rather than
 * patch — narrowed to the one shape this screen needs. A press that could not
 * reach the server must not look like a press that worked, and "the server is
 * not there" and "the server looked at this and refused" have different fixes.
 */
function useCommit(reload: () => void) {
  const copy = useCopy().dashboard.acts;
  const { toast } = useDashboard();
  const [busy, setBusy] = useState(false);

  const commit = useCallback(
    async (done: string, work: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await work();
        toast(done);
        reload();
      } catch (cause) {
        toast(
          cause instanceof ApiError && cause.status === 0
            ? copy.offline
            : fill(copy.refused, {
                why: cause instanceof Error ? cause.message : String(cause),
              }),
        );
      } finally {
        setBusy(false);
      }
    },
    [copy, reload, toast],
  );

  return { busy, commit };
}

/* ─────────────────────────────────────────────────────────────── the maths ── */

/** What the period's month is, given `YYYY-MM` — or this month if it is not. */
function monthOf(period: string, now: Date): { year: number; month: number; own: boolean } {
  const parsed = /^(\d{4})-(\d{2})$/.exec(period);
  if (parsed === null) {
    /* `period` is a month on the server (`localMonth`), but the demo payload
       carries `'30d'` and a screen that threw on it would be unviewable in the
       one mode built for looking at it. Fall back to the reader's own month. */
    return { year: now.getUTCFullYear(), month: now.getUTCMonth(), own: true };
  }
  const year = Number(parsed[1]);
  const month = Number(parsed[2]) - 1;
  return {
    year,
    month,
    own: now.getUTCFullYear() === year && now.getUTCMonth() === month,
  };
}

type Forecast =
  | { kind: 'out' }
  | { kind: 'safe'; at: Date }
  | { kind: 'date'; at: Date };

/**
 * When the pool runs dry, at the rate it has been going out.
 *
 * Straight-line from the spend so far over the days of the period that have
 * actually happened — which is why `own` matters: a budget being read back for
 * a month that has ended has *all* of its days behind it, and dividing by
 * today's date would price a finished month as though it were a fortnight in.
 *
 * Three endings rather than one, because the copy has three: the pool is
 * already gone, the pool outlasts the month, or here is the day. A rate of zero
 * is the second of those and not a division by zero.
 */
function forecastOf(period: string, spent: number, available: number, now: Date): Forecast {
  const { year, month, own } = monthOf(period, now);
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const last = new Date(Date.UTC(year, month, days));
  if (available <= 0) return { kind: 'out' };

  const elapsed = own ? Math.max(1, now.getUTCDate()) : days;
  const perDay = spent / elapsed;
  if (perDay <= 0) return { kind: 'safe', at: last };

  const lasts = elapsed + available / perDay;
  if (lasts >= days) return { kind: 'safe', at: last };
  return { kind: 'date', at: new Date(Date.UTC(year, month, Math.max(1, Math.ceil(lasts)))) };
}

/* ─────────────────────────────────────────────────────────────── the parts ── */

/**
 * A figure the server has not reported.
 *
 * Not `Figure`, which is the min-cohort em dash and carries that explanation in
 * its `title` — "too few people for this to be reported without identifying
 * them" is a *finding about privacy* and none of these cells is withheld for
 * that reason. Same mark, the true sentence behind it.
 */
function Missing() {
  const dashboard = useCopy().dashboard;
  return (
    <b className="vch-missing" title={dashboard.unmeasured.noSource}>
      —
    </b>
  );
}

/** One of the three pool columns: a swatch, a label, the money, the sentence. */
function PoolColumn({
  part,
  label,
  amount,
  note,
}: {
  part: Part;
  label: string;
  amount: string;
  note: string;
}) {
  return (
    <div className="vch-col">
      <span className="vch-col-head">
        <i className="vch-swatch" data-part={part} />
        <em>{label}</em>
      </span>
      <b>{amount}</b>
      <p>{note}</p>
    </div>
  );
}

/**
 * A day written out in full — "16 September".
 *
 * Two components on this screen format one, the budget editor and the forecast
 * banner, and they built the same formatter twice with the same options. That is
 * the cheap half of the mistake `day` in `adminFormat.ts` made four times over:
 * the format was identical both times, so the duplication was invisible until
 * one of them needed changing.
 *
 * `month: 'long'` and not `'short'`, and that distinction is deliberate across
 * this dashboard rather than drift. **Long is prose and short is tabular** — a
 * sentence has room for September and a chart axis and a table column do not, so
 * `useDates().tick` in `dashboardScreens.tsx` is short for an axis label while
 * `full` is long for the tooltip over it. Do not unify them.
 *
 * Not `useVenueDates` either, and that is the other distinction worth keeping:
 * that hook stamps the **venue's** zone, which is right for an instant the till
 * recorded and wrong here — a forecast date is computed from `new Date()` and a
 * budget period is a calendar month, neither of which happened anywhere.
 */
const dayFormatOf = (language: string) =>
  new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long' });


/* ───────────────────────────────────────────────────────────────── screens ── */

/**
 * The dark slab: the pool, where it went, and what is left buys.
 *
 * Its own component rather than a block inside the board because the total is a
 * draft that lives across renders and the render prop `Screen` takes cannot
 * hold a hook.
 */
function BudgetSlab({
  budget,
  rungs,
  moreVouchers,
  reload,
}: {
  budget: BudgetBody;
  rungs: Rung[];
  /** Null when no rung reports a take-up, which is what a dash is drawn for. */
  moreVouchers: number | null;
  reload: () => void;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.vouchers;
  const acts = dashboard.acts;
  const [language] = useLanguage();
  const currency = useCurrency();
  const money = useMoney();
  const num = useNum();
  const { busy, commit } = useCommit(reload);

  const toEuro = useCallback(
    (minor: number) => minorToEuro(minor, budget.currency),
    [budget.currency],
  );
  const toReader = (minor: number) => toEuro(minor) * currency.rate;
  const toMinor = (reader: number) => euroToMinor(reader / currency.rate, budget.currency);

  /* `null` is "nobody has typed", which is not the same as "the field is empty"
     and is what lets the well fall back to the server's figure after a reload
     without a second effect to copy it across. A failed save keeps the draft,
     because the number on screen is still the one the owner asked for. */
  const [draft, setDraft] = useState<number | null>(null);
  const server = Math.round(toReader(budget.total));
  const total = draft ?? server;

  const pool = budget.voucher;
  const dates = useMemo(
    () => ({
      day: dayFormatOf(language),
      month: new Intl.DateTimeFormat(language, { month: 'long' }),
    }),
    [language],
  );
  const forecast = useMemo(
    () => forecastOf(budget.period, pool.spent, pool.available, new Date()),
    [budget.period, pool.spent, pool.available],
  );

  /* Four readings, and the first is the one a straight forecast gets wrong. A
     pool of nothing resolves to "out" — `available` is 0 — and "the budget is
     spent" says money left, which is a different month from the one a venue
     that has never set a budget has had. Its own sentence, and it is the
     remedy: the field that fixes it is the one directly above this line. */
  const forecastLine =
    pool.base <= 0
      ? dashboard.empty[3].title
      : forecast.kind === 'out'
        ? copy.forecastOut
        : forecast.kind === 'safe'
          ? fill(copy.forecastSafe, { month: dates.month.format(forecast.at) })
          : fill(copy.forecast, { date: dates.day.format(forecast.at) });

  /* The largest cap on the ladder, which is the number `maxNote` is about. A
     venue with no ladder has no cap — not a cap of zero. */
  const caps = rungs.map((rung) => toEuro(rung.maxDiscountMinor));
  const avgSpend = toEuro(budget.averageCheck.minor);

  /* Widths, as percentages of the pool. `base` and not the three added up: the
     three states *exhaust* the pool by construction, so anything that does not
     reach 100 is the available slice and drawing it against a different total
     would hide exactly the disagreement worth seeing. */
  const share = (value: number) =>
    pool.base > 0 ? `${Math.max(0, Math.min(100, (value / pool.base) * 100))}%` : '0%';

  const saveTotal = () => {
    if (draft === null || draft === server || !(draft >= 0)) return;
    void commit(acts.budgetSaved, async () => {
      /* The split rides along. `PUT …/budget` takes a total and a share of it,
         and omitting the share lets the server keep whatever default it had —
         so resizing the pool would quietly move money between the two. */
      await setBudget(
        budget.venueId,
        toMinor(draft),
        budget.total > 0 ? Math.round((budget.loyalty.base / budget.total) * 10_000) : undefined,
      );
      setDraft(null);
    });
  };

  return (
    <div className="pd-glass pd-panel vch-slab" data-ink="on" data-reveal>
      <div className="vch-slab-top">
        <div className="vch-slab-copy">
          <h3>{copy.budgetTitle}</h3>
          <p>{copy.budgetLede}</p>
        </div>
        {/* The pool is the largest number on the panel and it stays that size
            when it becomes typeable — a four-figure sum in a 0.85rem well reads
            as a setting somebody tucked away rather than as the headline it is.
            `onBlur` on the wrapper rather than on the input: React's blur is
            `focusout` and bubbles, and `NumberWell` owns the input's own
            handler for its draft string. */}
        <div className="vch-total" onBlur={saveTotal}>
          <span className="vch-foot-label">{copy.budgetLabel}</span>
          <NumberWell
            value={total}
            onChange={setDraft}
            unit={currency.symbol}
            label={copy.budgetLabel}
            min={0}
            wide
          />
        </div>
      </div>

      <p className="vch-split">
        {fill(acts.budgetShareNote, {
          loyalty: money(toEuro(budget.loyalty.base), 'exact'),
          voucher: money(toEuro(pool.base), 'exact'),
        })}
      </p>

      {/* One bar in three parts rather than three bars, because the three are
          one quantity split up: spent, set aside and available exhaust the pool
          by construction, and stacking them is the only drawing that says so.
          `role="img"` with the sentence as its label, since the parts carry no
          text of their own and a screen reader gets three empty spans. */}
      <div className="vch-bar" role="img" aria-label={copy.allocNote}>
        <i data-part="spent" style={{ width: share(pool.spent) }} />
        <i data-part="held" style={{ width: share(pool.reserved) }} />
      </div>

      <div className="vch-cols">
        <PoolColumn
          part="spent"
          label={copy.spent}
          amount={money(toEuro(pool.spent), 'exact')}
          note={copy.spentNote}
        />
        <PoolColumn
          part="held"
          label={copy.held}
          amount={money(toEuro(pool.reserved), 'exact')}
          note={copy.heldNote}
        />
        <PoolColumn
          part="free"
          label={copy.free}
          amount={money(toEuro(Math.max(0, pool.available)), 'exact')}
          note={copy.freeNote}
        />
      </div>

      <p className="vch-callout">
        <Icon name="clock" size={16} />
        <span>{forecastLine}</span>
      </p>

      <div className="vch-foot">
        <div className="vch-foot-col">
          <span className="vch-foot-label">{copy.buysTitle}</span>
          {moreVouchers === null ? (
            <Missing />
          ) : (
            <b className="vch-foot-figure">{fill(copy.buys, { n: num(moreVouchers) })}</b>
          )}
          <p>{copy.buysNote}</p>
        </div>

        {/* A fact, not a field. The median check is the venue's own trading,
            computed by `averageCheck` from confirmed scans, and no endpoint
            sets it — a well over it would be a picture of a control. Zero is a
            venue that has never had a scan confirmed, which is a dash. */}
        <div className="vch-foot-col">
          <span className="vch-foot-label">{copy.avgTitle}</span>
          {budget.averageCheck.minor > 0 ? (
            <b className="vch-foot-figure">{money(avgSpend, 'unit')}</b>
          ) : (
            <Missing />
          )}
          <p>{copy.avgNote}</p>
        </div>

        {/* Also a fact, and for the harder reason. The cap is stored per rung,
            so one well over three of them would flatten the ladder on the first
            blur with nothing in the response saying it had — the silent kind of
            wrong. The ladder below is where a rung is changed. */}
        <div className="vch-foot-col">
          <span className="vch-foot-label">{copy.maxTitle}</span>
          {caps.length > 0 ? (
            <b className="vch-foot-figure">{money(Math.max(...caps), 'unit')}</b>
          ) : (
            <Missing />
          )}
          <p>{copy.maxNote}</p>
        </div>
      </div>

      {busy && <span className="vch-saving" aria-hidden="true" />}
    </div>
  );
}

/**
 * Who reaches each tier, and what it has cost.
 *
 * The one editable number is the threshold, because it is the one the lede is
 * about: points decide who gets there, so raising a number sends less of the
 * budget that way. `PUT …/tiers` is an upsert keyed on the percentage, so one
 * rung is sent and the others are left alone.
 */
function Ladder({
  budget,
  rungs,
  units,
  reload,
}: {
  budget: BudgetBody;
  rungs: Rung[];
  /**
   * What one voucher at each rung takes off a bill.
   *
   * Index-aligned with `rungs` **sorted by discount**, which is the order the
   * table draws — not with `rungs` as handed over. Both ends sort the same way
   * and the caller says so; an ordering agreed in two places is a trap, but the
   * alternative is passing the figure per row and this one comes out of the
   * shared model in one pass.
   */
  units: number[];
  reload: () => void;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.vouchers;
  const acts = dashboard.acts;
  const money = useMoney();
  const num = useNum();
  const { busy, commit } = useCommit(reload);

  /* Keyed by percentage, which is the rung's identity on the server too — an
     index would be wrong the moment a rung is added or retired under the
     draft. `undefined` is "not typed", the same `null` the total field uses. */
  const [drafts, setDrafts] = useState<Record<number, number>>({});

  const toEuro = (minor: number) => minorToEuro(minor, budget.currency);

  /* The ladder must climb: a deeper discount cannot cost fewer points than a
     shallower one. Checked on the *drafts* rather than on the saved rows, so it
     appears while the number is being typed rather than after the save that
     would be refused. */
  const ordered = [...rungs].sort((a, b) => a.discountPct - b.discountPct);
  const pointsOf = (rung: Rung) => drafts[rung.discountPct] ?? rung.pointsCost;
  /* Only the rungs on sale have to climb. A retired rung is listed for the
     vouchers still out at it, and its points are history rather than a price. */
  const onSale = ordered.filter((rung) => rung.active !== false);
  const outOfOrder = onSale.some(
    (rung, index) => index > 0 && pointsOf(rung) < pointsOf(onSale[index - 1]),
  );

  const save = (rung: Rung) => {
    const next = drafts[rung.discountPct];
    if (next === undefined || next === rung.pointsCost || !(next > 0)) return;
    void commit(acts.tiersSaved, async () => {
      await setVoucherTiers(budget.venueId, [
        {
          discountPct: rung.discountPct,
          pointsCost: Math.round(next),
          maxDiscountMinor: rung.maxDiscountMinor,
          active: true,
        },
      ]);
      setDrafts((current) => {
        const { [rung.discountPct]: _saved, ...rest } = current;
        return rest;
      });
    });
  };

  if (rungs.length === 0) {
    return (
      <div className="pd-glass pd-panel" data-solid="true" data-reveal>
        <div className="pd-panel-head">
          <div>
            <span className="console-label">{copy.tiersTitle}</span>
            <p className="pd-fine">{copy.tiersLede}</p>
          </div>
        </div>
        <p className="pd-fine">{dashboard.empty[3].body}</p>
      </div>
    );
  }

  return (
    <div className="pd-glass pd-panel vch-ladder" data-solid="true" data-reveal>
      <div className="pd-panel-head">
        <div>
          <span className="console-label">{copy.tiersTitle}</span>
          <p className="pd-fine">{copy.tiersLede}</p>
        </div>
      </div>

      <div className="vch-scroll">
        <table className="vch-table">
          <thead>
            <tr>
              {/* Left-aligned, including the three count columns, which is what
                  the reference draws — the figures still line up because they
                  are `tabular-nums`, and a heading and its figure that share an
                  edge are read as one thing. */}
              {copy.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((rung, index) => (
              <tr key={rung.discountPct} data-retired={rung.active === false ? 'true' : undefined}>
                <td>
                  <div className="vch-tier">
                    {/* Three alphas of the one accent, never three hues — the
                        deepest rung is the fill itself, so its label flips to
                        `--on-accent` the way every other solid mark here does. */}
                    <span className="vch-pill" data-step={Math.min(2, index)}>
                      {fill(copy.tier, { n: String(rung.discountPct) })}
                    </span>
                    {rung.active === false && (
                      <span className="vch-retired" title={acts.tierRetired}>
                        {copy.retired}
                      </span>
                    )}
                    <span className="vch-tier-note">
                      {rung.spentMinor === undefined
                        ? fill(dashboard.unmeasured.tierUnit, {
                            unit: money(units[index] ?? 0, 'unit'),
                          })
                        : fill(copy.tierDetail, {
                            unit: money(units[index] ?? 0, 'unit'),
                            pct: String(
                              Math.round(
                                (rung.spentMinor / Math.max(1, budget.voucher.spent)) * 100,
                              ),
                            ),
                          })}
                    </span>
                  </div>
                </td>
                <td>
                  {rung.active === false ? (
                    /* A fact, not a field: `PUT …/tiers` sends `active: true`, so
                       saving a retired rung's points would put it back on sale
                       with nothing on the screen saying it had. */
                    <b className="vch-points-fact">{fill(copy.points, { n: num(rung.pointsCost) })}</b>
                  ) : (
                    /* `onBlur` on the cell, which is what "changes save when you
                       leave the field" means mechanically: focusout bubbles, and
                       the well below owns only its own draft string. */
                    <div className="vch-points" onBlur={() => save(rung)}>
                      <NumberWell
                        value={pointsOf(rung)}
                        onChange={(next) =>
                          setDrafts((current) => ({ ...current, [rung.discountPct]: next }))
                        }
                        unit={copy.pointsUnit}
                        label={copy.columns[1]}
                        min={1}
                      />
                    </div>
                  )}
                </td>
                <td>
                  {rung.issuedCount === undefined ? (
                    <Missing />
                  ) : (
                    <span className="vch-given">
                      <b>{num(rung.issuedCount)}</b>
                      {/* Still in somebody's wallet — the part of "given out"
                          the pool is still holding money for. */}
                      {rung.activeCount !== undefined && rung.activeCount > 0 && (
                        <i>{fill(copy.stillOut, { n: num(rung.activeCount) })}</i>
                      )}
                    </span>
                  )}
                </td>
                <td>
                  {rung.redeemedCount === undefined ? (
                    <Missing />
                  ) : (
                    <b>{num(rung.redeemedCount)}</b>
                  )}
                </td>
                <td>
                  {rung.spentMinor === undefined ? (
                    <Missing />
                  ) : (
                    <span className="vch-cost">{money(toEuro(rung.spentMinor), 'exact')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {outOfOrder && (
        <p className="field-error" role="alert">
          {copy.pointsOrder}
        </p>
      )}
      <p className="pd-fine">{copy.buysNote}</p>
      {busy && <span className="vch-saving" aria-hidden="true" />}
    </div>
  );
}

/**
 * Where the money went, and what came back.
 *
 * The mix is per-rung spend off the budget body. With nothing spent it says so
 * in words rather than drawing an empty bar, because an empty stacked bar and a
 * budget nobody has spent are the same picture. "Money returned" stays an em
 * dash: nothing counts voucher expiries.
 */
function Aftermath({ budget, rungs }: { budget: BudgetBody; rungs: Rung[] }) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.vouchers;
  const money = useMoney();

  const toEuro = (minor: number) => minorToEuro(minor, budget.currency);
  const ordered = [...rungs].sort((a, b) => a.discountPct - b.discountPct);
  const costed = ordered.filter((rung): rung is Rung & { spentMinor: number } =>
    rung.spentMinor !== undefined,
  );
  /* The header total is the *sum of the legend*, not the pool's own `spent`.
     They are the same quantity, and a panel whose parts do not add up to its
     own headline is the bug this dashboard's metrics module exists to prevent —
     a figure shown twice is computed once. */
  const totalMinor = costed.reduce((sum, rung) => sum + rung.spentMinor, 0);

  /* The rung carrying most of the pool, which is what the suggestion is about.
     Derived from the measured spend rather than from `voucherModelFor`'s
     estimate, because the sentence names a percentage the owner can check. */
  const biggest = costed.reduce<(Rung & { spentMinor: number }) | null>(
    (best, rung) => (best === null || rung.spentMinor > best.spentMinor ? rung : best),
    null,
  );

  return (
    <div className="vch-pair">
      <div className="pd-glass pd-panel vch-mix" data-reveal>
        <div className="vch-mix-head">
          <span className="console-label">{copy.mixTitle}</span>
          {costed.length > 0 && <b>{money(toEuro(totalMinor), 'exact')}</b>}
        </div>

        {costed.length === 0 || totalMinor <= 0 ? (
          <p className="pd-fine">{dashboard.unmeasured.noSource}</p>
        ) : (
          <>
            <div className="vch-mixbar" role="img" aria-label={copy.mixTitle}>
              {costed.map((rung, index) => (
                <i
                  key={rung.discountPct}
                  data-step={Math.min(2, index)}
                  style={{ width: `${(rung.spentMinor / totalMinor) * 100}%` }}
                />
              ))}
            </div>
            <ul className="vch-legend">
              {costed.map((rung, index) => (
                <li key={rung.discountPct}>
                  <i className="vch-swatch" data-step={Math.min(2, index)} />
                  <em>{fill(copy.tier, { n: String(rung.discountPct) })}</em>
                  <span>{money(toEuro(rung.spentMinor), 'exact')}</span>
                  <b>{Math.round((rung.spentMinor / totalMinor) * 100)}%</b>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="vch-side">
        <div className="pd-glass pd-panel vch-returned" data-reveal>
          <span className="console-label">{copy.returnedTitle}</span>
          {/* Nothing on the budget response counts what expired unused, so this
              is a dash for now and must not become a 0 — "no voucher expired"
              and "nobody counted expiries" are opposite readings of the same
              glyph, and only one of them is true. */}
          <Missing />
          <p className="pd-fine">{copy.returnedNote}</p>
        </div>

        {/* The suggestion needs a rung to name, and the rung comes from measured
            spend. With nothing counted there is no advice to give, and a
            suggestion with a guessed number in it is the one thing this
            dashboard promises never to show. */}
        {biggest !== null && (
          <div className="vch-suggest" data-reveal>
            <span className="vch-suggest-head">
              <Icon name="bulb" size={15} />
              {copy.suggestion}
            </span>
            <p>{fill(copy.insight, { n: String(biggest.discountPct) })}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── the board ── */

function Board({ budget, reload }: { budget: BudgetBody; reload: () => void }) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.vouchers;
  const [language] = useLanguage();

  const rungs: Rung[] = budget.tiers;

  /* One model, and it is the shared one. `voucherModelFrom` prices a rung at
     `min(check × pct, cap)` and weights "what is left buys" by how the rungs
     actually land — deriving either of those here would be the same figure
     computed twice, which is the thing `partnerMetrics.ts` exists to stop. */
  const model = useMemo(() => {
    const rows: TierRow[] = budget.tiers.map((rung: Rung) => ({
      pct: rung.discountPct,
      points: rung.pointsCost,
      issued: rung.issuedCount ?? 0,
      redeemed: rung.redeemedCount ?? 0,
      cap: minorToEuro(rung.maxDiscountMinor, budget.currency),
      remaining: rung.estimatedRemaining,
    }));
    return voucherModelFrom(
      budget.voucher,
      rows,
      minorToEuro(budget.averageCheck.minor, budget.currency),
      Math.max(0, ...rows.map((row) => row.cap)),
      (minor: number) => minorToEuro(minor, budget.currency),
    );
  }, [budget]);

  /* "About n more vouchers" is priced at the mix actually being issued, so with
     no issue counts there is no mix and the figure is a dash rather than a 0 —
     the unweighted mean of three rungs would price a mix nobody issues. */
  const anyIssued = rungs.some((rung) => rung.issuedCount !== undefined);
  const moreVouchers = anyIssued ? model.moreVouchers : null;

  /* The alert is the forecast again, said louder, and **only** when the
     forecast lands on a day inside the period. A pool that outlasts the month
     is not running low, and one that is already gone is not running low either
     — it has run out, which the callout on the slab says in its own words. A
     banner repeating the sentence one panel below it is two voices on one fact.
     It sits above the slab because it is about the whole screen, and its one
     press goes to the field that fixes it. */
  const forecast = useMemo(
    () => forecastOf(budget.period, budget.voucher.spent, budget.voucher.available, new Date()),
    [budget.period, budget.voucher.spent, budget.voucher.available],
  );
  const dayFormat = useMemo(() => dayFormatOf(language), [language]);

  return (
    <div className="pd-stack">
      {forecast.kind === 'date' && (
        <div className="vch-alert" data-reveal>
          <Icon name="warn" size={17} />
          <div>
            <b>{copy.alertTitle}</b>
            <p>{fill(copy.alertBody, { date: dayFormat.format(forecast.at) })}</p>
          </div>
          {/* A real destination, not a second copy of the control: the total is
              a field one panel down, and this scrolls to it and puts the caret
              in it. A button whose only outcome is the sentence already on
              screen is a button that exists to fail. */}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const well = document.querySelector<HTMLInputElement>('.vch-total input');
              well?.scrollIntoView({ block: 'center', behavior: 'smooth' });
              well?.focus();
            }}
          >
            {copy.alertAction}
          </button>
        </div>
      )}

      <BudgetSlab budget={budget} rungs={rungs} moreVouchers={moreVouchers} reload={reload} />
      <Ladder
        budget={budget}
        rungs={rungs}
        units={[...rungs]
          .sort((a, b) => a.discountPct - b.discountPct)
          .map((rung) => model.tiers.find((tier) => tier.pct === rung.discountPct)?.unit ?? 0)}
        reload={reload}
      />
      <Aftermath budget={budget} rungs={rungs} />
    </div>
  );
}

/**
 * The voucher pool, the ladder that spends it, and what that bought.
 *
 * `SCREENS[3]` on the partner dashboard. The venue is read first because the
 * budget is addressed by venue id, and `chain` folds the two requests into one
 * state so a screen cannot draw half of itself while the other half is still in
 * flight.
 */
export function Vouchers() {
  const venueApi = usePartnerVenue();
  /* The live venue's id or nothing: under the demo there is nobody to address a
     request to, and `Screen` swaps in `DEMO_BUDGET` for the missing session. */
  const liveId = venueApi.state.status === 'ready' ? (venueApi.state.data?.id ?? null) : null;
  const budgetApi = usePartnerBudget(liveId);
  const state = chain(venueApi, budgetApi);

  return (
    <Screen state={state} index={3} demo={DEMO_BUDGET}>
      {(budget) => <Board budget={budget} reload={budgetApi.reload} />}
    </Screen>
  );
}
