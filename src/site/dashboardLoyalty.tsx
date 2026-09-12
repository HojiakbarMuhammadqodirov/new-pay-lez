/**
 * Loyalty campaigns — the partner dashboard's third screen.
 *
 * Split out of `dashboardScreens.tsx` because this one screen is a panel of
 * findings, a pool of money and a grid of cards, and at that size it stops
 * being a function in a file of functions.
 *
 * ── what this screen is actually about ────────────────────────────────────
 *
 * One number, and everything else is context for it: **earned but never used**.
 * A reward that was earned and never collected means a customer did the work,
 * qualified, and did not come back — which is the one failure on this dashboard
 * that looks like success in every other column. So the gap leads the screen,
 * the pool that is holding that money is second, and the campaigns are third.
 *
 * ── the rules this file did not get to choose ─────────────────────────────
 *
 * - **A failed request is a state, not a zero.** `Screen` folds the campaign
 *   list's `loading | ready | error` once. The budget and the reminder status
 *   are further requests and can fail on their own — a venue whose campaigns
 *   list but whose pool does not gets three em dashes, never three zeros.
 * - **A pool has exactly three states and they exhaust it** — spent, set aside,
 *   available. The bar draws the server's own `budget_movements` figures.
 * - **A control with nothing honest behind it is not drawn.** Every control on a
 *   card writes now: Edit opens the campaign form in edit mode against
 *   `PATCH /v1/partner/campaigns/:id`, and the reminder strip sends
 *   `POST …/remind`. The strip's button is absent when the server has nobody for
 *   it to reach.
 *
 * ── and one that is a loan ────────────────────────────────────────────────
 *
 * `Screen`, `RemindButton` and `RemindNotes` come from `dashboardScreens.tsx`,
 * which in turn imports `Campaigns` from here. The cycle is safe because all of
 * them are function *declarations* called only during render, by which point
 * both modules have finished evaluating — but it is a cycle, and worth knowing
 * about before anything here is moved to module scope.
 */
import { useCallback, useMemo, useState } from 'react';

import {
  chain,
  euroToMinor,
  minorToEuro,
  readyOr,
  setBudget,
  setCampaignStatus,
  usePartnerBudget,
  usePartnerCampaigns,
  usePartnerRemind,
  usePartnerVenue,
  type BudgetBody,
  type RemindStatus,
} from './api/partner';
import { ApiError } from './api/client';
import { NumberWell } from './dashboardControls';
import { DEMO_BUDGET, DEMO_CAMPAIGNS, DEMO_REMIND, DEMO_VENUE } from './dashboardDemo';
import { useNum } from './dashboardFormat';
import { RemindButton, RemindNotes, Screen } from './dashboardScreens';
import { useDashboard } from './dashboardShell';
import { DEMO_MODE } from './demoMode';
import { Icon } from './icons';
import { useCopy, useCurrency, useLanguage, useMoney } from './i18n/context';
import { fill } from './i18n/currency';
import {
  campaignFromApi,
  campaignModel,
  type CampaignModel,
  type CampaignRow,
} from './partnerMetrics';

/** One campaign, with the apportionment `campaignModel` hangs off it. */
type Campaign = CampaignModel['list'][number];

/* ─────────────────────────────────────────────────────────────── writing ── */

/**
 * A write, its two endings, and the re-read after it.
 *
 * A copy of `useAction` in `dashboardScreens.tsx`, which is module-private
 * there. The three things it owns are the three that are easy to forget one of:
 * the pressed control is the one that locks, a failure is named *by kind*, and
 * success re-reads the list rather than patching a row.
 */
function useWrite(reload: () => void) {
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
        toast(
          cause instanceof ApiError && cause.status === 0
            ? dashboard.acts.offline
            : cause instanceof ApiError && cause.status === 401
              ? dashboard.unmeasured.noSession
              : fill(dashboard.acts.refused, {
                  why: cause instanceof Error ? cause.message : String(cause),
                }),
        );
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
 * Localised dates, from `Intl` — which is not used for numbers on this site,
 * and has no quarrel with a month name.
 *
 * `at` pins a bare `YYYY-MM-DD` to UTC midnight, so a campaign is not filed as
 * having started the day before it did for anybody west of Greenwich.
 */
function useDates() {
  const [language] = useLanguage();
  return useMemo(() => {
    const day = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long' });
    const month = new Intl.DateTimeFormat(language, { month: 'long' });
    const at = (iso: string) =>
      new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso);
    return {
      day: (iso: string) => day.format(at(iso)),
      monthOf: (date: Date) => month.format(date),
      dayOf: (date: Date) => day.format(date),
    };
  }, [language]);
}

/* ─────────────────────────────────────────────────────────────── the pool ── */

/**
 * When the loyalty pool runs out, at the rate it has been going out.
 *
 * Derived rather than invented: `spent` is the ledger's own figure and `elapsed`
 * is the calendar. `period` is parsed defensively, because a `NaN` month would
 * silently produce a date in 1899 rather than a visible failure.
 */
type Forecast = { kind: 'out' } | { kind: 'safe'; at: Date } | { kind: 'until'; at: Date };

function forecastFor(period: string, spent: number, available: number): Forecast {
  const parsed = /^(\d{4})-(\d{2})$/.exec(period);
  const today = new Date();
  const year = parsed ? Number(parsed[1]) : today.getFullYear();
  const month = parsed ? Number(parsed[2]) : today.getMonth() + 1;

  /* Day 0 of the *next* month is the last day of this one. */
  const days = new Date(year, month, 0).getDate();
  const inThisMonth = year === today.getFullYear() && month === today.getMonth() + 1;
  const elapsed = Math.max(1, inThisMonth ? Math.min(days, today.getDate()) : days);
  const last = new Date(year, month - 1, days);

  if (available <= 0) return { kind: 'out' };

  const perDay = spent / elapsed;
  if (perDay <= 0) return { kind: 'safe', at: last };

  const runsFor = elapsed + available / perDay;
  if (runsFor >= days) return { kind: 'safe', at: last };
  return { kind: 'until', at: new Date(year, month - 1, Math.ceil(runsFor)) };
}

/* ═════════════════════════════════════════════════════════════ the screen ══ */

export function Campaigns() {
  const venueApi = usePartnerVenue();
  const liveVenue = venueApi.state.status === 'ready' ? venueApi.state.data : null;
  const venue = liveVenue ?? (DEMO_MODE ? DEMO_VENUE : null);
  const liveId = liveVenue?.id ?? null;
  const campaignsApi = usePartnerCampaigns(liveId);
  const budgetApi = usePartnerBudget(liveId);
  const remindApi = usePartnerRemind(liveId);
  const state = chain(venueApi, campaignsApi);

  /* The real answer first; the demonstration data only when there was no
     session to ask with, and only when this browser was sent `?demo=1`. */
  const budget = readyOr(budgetApi.state, DEMO_MODE ? DEMO_BUDGET : null);
  const remind = readyOr(remindApi.state, DEMO_MODE ? DEMO_REMIND : null);

  /* The pool comes from `/budget`, but the *currency* comes from the venue. */
  const currency = venue?.currency ?? 'EUR';

  return (
    <Screen state={state} index={2} demo={DEMO_CAMPAIGNS}>
      {(rows) => {
        const toEuro = (minor: number) => minorToEuro(minor, currency);
        const list: CampaignRow[] = rows.map((row) =>
          campaignFromApi(row, toEuro, venue?.scan_cooldown_hours ?? null),
        );
        const model = campaignModel(list, budget?.loyalty ?? null);

        if (list.length === 0) {
          return (
            <div className="pd-stack">
              <NoCampaigns />
            </div>
          );
        }

        return (
          <div className="pd-stack">
            <GapPanel
              model={model}
              venueId={liveId}
              remind={remind}
              reloadRemind={remindApi.reload}
            />
            <BudgetPanel
              budget={budget}
              asking={budgetApi.state.status === 'loading'}
              reload={budgetApi.reload}
            />
            <div className="pl-grid">
              {model.list.map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} reload={campaignsApi.reload} />
              ))}
            </div>
          </div>
        );
      }}
    </Screen>
  );
}

/**
 * No campaign has been created yet — which after the seed purge is the ordinary
 * state of a new venue rather than a failure, and says so in its own words.
 */
function NoCampaigns() {
  const copy = useCopy().dashboard.empty[2];
  const { openDrawer } = useDashboard();

  return (
    <div className="pd-glass pd-panel pd-empty" data-reveal>
      <h3>{copy.title}</h3>
      <p className="pd-fine">{copy.body}</p>
      <button type="button" className="btn btn-solid" onClick={() => openDrawer('campaign')}>
        {copy.action}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════ the gap, and what to do ══ */

/**
 * The number to watch, and the one press that follows from it.
 *
 * Three figures side by side — earned, used, and the difference — because the
 * difference is the only one of the three that is a *finding*.
 *
 * Two sentences join it now that the server measures them: how many members are
 * one stamp short of a reward (summed over the running campaigns, and only when
 * every one of them reported it — a sum with a hole in it is a smaller number,
 * not an honest one), and what the last reminder did.
 */
function GapPanel({
  model,
  venueId,
  remind,
  reloadRemind,
}: {
  model: CampaignModel;
  venueId: string | null;
  remind: RemindStatus | null;
  reloadRemind: () => void;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.campaigns;
  const num = useNum();
  const { goTo } = useDashboard();

  const widest = model.widest >= 0 ? model.list[model.widest] : null;
  const running = model.list.filter((campaign) => campaign.live);
  const near = running.every((campaign) => campaign.near !== undefined)
    ? running.reduce((sum, campaign) => sum + (campaign.near ?? 0), 0)
    : null;
  const waiting =
    remind !== null && remind.nextAllowedAt !== null && Date.parse(remind.nextAllowedAt) > Date.now();
  const strip = model.holding > 0 || (remind !== null && (remind.audience > 0 || waiting));

  return (
    <div className="pd-glass pd-panel pl-panel" data-reveal>
      <div className="pl-head">
        <div className="pl-head-copy">
          <h2 className="pd-title">{copy.gapTitle}</h2>
          <p className="pl-lede">
            {copy.gapLede}
            {widest !== null && widest.gap > 0
              ? ` ${fill(copy.gap, { name: widest.name, n: num(widest.gap) })}`
              : ''}
          </p>
          {near !== null && near > 0 && (
            <p className="pl-near">
              <Icon name="spark" size={14} />
              {fill(copy.near, { n: num(near) })}
            </p>
          )}
        </div>

        <div className="pl-totals">
          <Total label={copy.totals[0]} value={num(model.earned)} />
          <Total label={copy.totals[1]} value={num(model.used)} />
          <Total label={copy.totals[2]} value={num(model.holding)} gap />
        </div>
      </div>

      {/* Nobody holding anything and nothing sent this week: there is nobody to
          remind, so the strip is not drawn rather than drawn offering to message
          zero people. */}
      {strip && (
        <div className="pl-remind">
          <RemindButton
            venueId={venueId}
            remind={remind}
            reload={reloadRemind}
            className="pl-remind-btn"
          />
          <div className="pl-remind-copy">
            <p className="pl-remind-note">{copy.remindNote}</p>
            <RemindNotes remind={remind} className="pd-fine" />
          </div>
          {/* The assistant drafts customer-facing copy in all five languages, so
              "set this up for me" goes to the thing that can actually do it. */}
          <button type="button" className="btn btn-ghost pl-setup" onClick={() => goTo('assistant')}>
            {copy.remindSetup}
          </button>
        </div>
      )}
    </div>
  );
}

/** One of the three figures over the gap panel. */
function Total({ label, value, gap }: { label: string; value: string; gap?: boolean }) {
  return (
    <div className="pl-total" data-gap={gap ? 'true' : undefined}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

/* ══════════════════════════════════════════════════════ the loyalty pool ══ */

/**
 * What the month has for loyalty, and what is left of it.
 *
 * One bar in three parts rather than three bars, because the three parts are a
 * *partition*. The field on the right sets the **loyalty share** and leaves the
 * total alone: `setBudget` takes a total and a split in basis points, so moving
 * one side necessarily moves the other. It is typed in the reader's currency and
 * converted where the request needs the venue's.
 */
function BudgetPanel({
  budget,
  asking,
  reload,
}: {
  budget: BudgetBody | null;
  asking: boolean;
  reload: () => void;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.campaigns;
  const acts = dashboard.acts;
  const words = dashboard.words;
  const money = useMoney();
  const reader = useCurrency();
  const dates = useDates();
  const { busy, run } = useWrite(reload);

  const pool = budget?.loyalty ?? null;
  const toEuro = (minor: number) => minorToEuro(minor, budget?.currency ?? 'EUR');
  const toMinor = (typed: number) => euroToMinor(typed / reader.rate, budget?.currency ?? 'EUR');

  const base = pool ? toEuro(pool.base) : 0;
  const spent = pool ? toEuro(pool.spent) : 0;
  const aside = pool ? toEuro(pool.reserved) : 0;
  const available = pool ? Math.max(0, toEuro(pool.available)) : 0;

  /*
   * The field holds a draft, and the draft follows the server only when the
   * server moves: comparing against the last server value distinguishes "the
   * server said something new" from "somebody is typing".
   */
  const reported = Math.round(base * reader.rate);
  const [seen, setSeen] = useState(reported);
  const [share, setShare] = useState(reported);
  if (seen !== reported) {
    setSeen(reported);
    setShare(reported);
  }

  const working = busy !== null;
  const part = (value: number) => (base > 0 ? Math.max(0, Math.min(100, (value / base) * 100)) : 0);
  const forecast = budget ? forecastFor(budget.period, spent, available) : null;

  return (
    <div className="pd-glass pd-panel pl-panel" data-reveal>
      <div className="pl-head">
        <div className="pl-head-copy">
          <h2 className="pd-title">{copy.budgetTitle}</h2>
          <p className="pl-lede">{copy.budgetLede}</p>
        </div>

        {budget && (
          <div className="pl-set">
            <div className="pl-set-row">
              <NumberWell
                value={share}
                onChange={(next) => setShare(Math.max(0, next))}
                unit={reader.symbol}
                label={acts.budgetShare}
                min={0}
                wide
              />
              <button
                type="button"
                className="btn btn-ghost"
                disabled={working}
                onClick={() =>
                  void run('budget', acts.budgetSaved, () => {
                    const minor = toMinor(share);
                    const bp = budget.total > 0 ? Math.round((minor / budget.total) * 10_000) : 0;
                    return setBudget(budget.venueId, budget.total, Math.max(0, Math.min(10_000, bp)));
                  })
                }
              >
                {acts.save}
              </button>
            </div>
            <span className="field-help pl-set-note">
              {fill(acts.budgetShareNote, {
                loyalty: money(share / reader.rate, 'exact'),
                voucher: money(Math.max(0, toEuro(budget.total) - share / reader.rate), 'exact'),
              })}
            </span>
          </div>
        )}
      </div>

      {pool ? (
        <>
          <div className="pl-split" aria-hidden>
            <i data-part="spent" style={{ width: `${part(spent)}%` }} />
            <i data-part="aside" style={{ width: `${part(aside)}%` }} />
          </div>

          <div className="pl-legend">
            <Pool part="spent" label={words.spent} value={money(spent, 'exact')} note={copy.spentNote} />
            <Pool part="aside" label={words.aside} value={money(aside, 'exact')} note={copy.asideNote} />
            <Pool
              part="free"
              label={words.available}
              value={money(available, 'exact')}
              note={copy.availableNote}
            />
          </div>

          {forecast && (
            <div className="pl-forecast">
              <span className="pl-callout">
                <Icon name="clock" size={15} />
                {forecast.kind === 'out'
                  ? copy.forecastOut
                  : forecast.kind === 'safe'
                    ? fill(copy.forecastSafe, { month: dates.monthOf(forecast.at) })
                    : fill(copy.forecast, { date: dates.dayOf(forecast.at) })}
              </span>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="pd-fine">
            {asking ? dashboard.unmeasured.asking : dashboard.unmeasured.serverSilent}
          </p>
          {/* Never a zero. A pool nobody could read is not an empty pool. */}
          <div className="pl-legend">
            <Pool part="spent" label={words.spent} note={copy.spentNote} />
            <Pool part="aside" label={words.aside} note={copy.asideNote} />
            <Pool part="free" label={words.available} note={copy.availableNote} />
          </div>
        </>
      )}
    </div>
  );
}

/** One of the pool's three states; no `value` is an em dash, never a zero. */
function Pool({
  part,
  label,
  value,
  note,
}: {
  part: 'spent' | 'aside' | 'free';
  label: string;
  value?: string;
  note: string;
}) {
  const withheld = useCopy().dashboard.unmeasured.serverSilent;

  return (
    <div className="pl-pool">
      <span className="pl-pool-label">
        <i className="pl-swatch" data-part={part} />
        {label}
      </span>
      {value === undefined ? (
        <b className="pd-withheld" title={withheld}>
          —
        </b>
      ) : (
        <b>{value}</b>
      )}
      <p className="pd-fine">{note}</p>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════ one campaign ══ */

/**
 * One campaign card.
 *
 * Earned and used are counts the server sends; the gap between them is the
 * chip, and the rate is the same pair as a percentage. A rate over nothing is
 * **0, not null**: a campaign that has handed out no rewards has a used rate of
 * zero, and an em dash there would claim we are withholding something.
 *
 * A paused card is tinted amber and carries `copy.pausedNote`, because the thing
 * an owner needs to know about a paused campaign is that the rewards already
 * earned **stay valid**.
 *
 * The small rules under the figures are each conditional on their own field —
 * and the cooldown is the **venue's** now, read off the venue row, where it was
 * a constant of 24 hours quoted at every venue whatever it had set.
 */
function CampaignCard({ campaign, reload }: { campaign: Campaign; reload: () => void }) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.campaigns;
  const acts = dashboard.acts;
  const words = dashboard.words;
  /* The drawer's own words for the two small rules — same dashboard, same two
     settings, already translated five ways. */
  const rules = dashboard.drawer.campaign;
  const money = useMoney();
  const num = useNum();
  const dates = useDates();
  const { openDrawer } = useDashboard();
  const { busy, run } = useWrite(reload);

  const [sure, setSure] = useState(false);
  const working = busy !== null;
  const pct = Math.round(campaign.rate * 100);

  const clauses = [
    campaign.minSpend > 0 ? `${rules.minSpend} ${money(campaign.minSpend, 'unit')}` : null,
    campaign.expiryDays > 0 ? `${rules.expiry} ${num(campaign.expiryDays)} ${rules.days}` : null,
    campaign.cooldownHours !== null && campaign.cooldownHours > 0
      ? fill(copy.cooldown, { n: num(campaign.cooldownHours) })
      : null,
  ].filter((clause): clause is string => clause !== null);

  return (
    <div className="pd-glass pl-card" data-live={campaign.live ? 'true' : 'false'} data-reveal>
      <div className="pl-card-head">
        <h3 className="pl-card-name">{campaign.name}</h3>
        <span className="pl-pill">
          {campaign.live ? dashboard.deals.states.live : dashboard.deals.states.paused}
        </span>
      </div>

      <p className="pl-rule">
        {fill(copy.rule, { visits: num(campaign.visits), reward: campaign.reward })}
        <span className="pl-cost">{fill(words.each, { amount: money(campaign.cost, 'unit') })}</span>
      </p>

      <div className="pl-counts">
        <div className="pl-count">
          <span>{copy.earned}</span>
          <b>{num(campaign.earned)}</b>
        </div>
        <div className="pl-count">
          <span>{copy.used}</span>
          <b>{num(campaign.used)}</b>
        </div>
      </div>

      <div className="pl-bar" aria-hidden>
        <i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>

      <div className="pl-chips">
        <span className="pl-chip">{fill(copy.unused, { n: num(campaign.gap) })}</span>
        <span className="pl-rate">{fill(copy.usedRate, { pct: num(pct) })}</span>
      </div>

      <div className="pl-cols">
        <div className="pl-col">
          <span>{words.costSoFar}</span>
          <b>{money(campaign.spent, 'exact')}</b>
        </div>
        <div className="pl-col">
          <span>{words.aside}</span>
          <b>{money(campaign.aside, 'exact')}</b>
        </div>
      </div>

      {clauses.length > 0 && <p className="pd-fine pl-rules">{clauses.join(' · ')}</p>}

      {!campaign.live && <p className="pl-paused">{copy.pausedNote}</p>}

      <div className="pl-foot">
        <span className="pl-meta">
          {fill(words.priority, { n: num(campaign.priority) })}
          {campaign.startedAt !== null && (
            <>
              <i aria-hidden />
              {dates.day(campaign.startedAt)}
            </>
          )}
        </span>

        <span className="pl-acts">
          {/* The campaign form in edit mode, which writes through
              `PATCH /v1/partner/campaigns/:id`. */}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={working}
            onClick={() => openDrawer('campaign', undefined, undefined, campaign.id)}
          >
            {acts.edit}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={working}
            onClick={() =>
              void run('status', campaign.live ? acts.paused : acts.resumed, () =>
                setCampaignStatus(campaign.id, campaign.live ? 'paused' : 'active'),
              )
            }
          >
            {campaign.live ? acts.pause : acts.resume}
          </button>
          {/* One accent means a button cannot be red, so the one change that
              cannot be undone asks its question in words instead. */}
          <button
            type="button"
            className="btn btn-ghost"
            disabled={working}
            onBlur={() => setSure(false)}
            onClick={() => {
              if (!sure) {
                setSure(true);
                return;
              }
              setSure(false);
              void run('end', acts.ended, () => setCampaignStatus(campaign.id, 'ended'));
            }}
          >
            {sure ? acts.endSure : acts.end}
          </button>
        </span>
      </div>
    </div>
  );
}
