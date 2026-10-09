/**
 * Loyalty campaigns — v3 §3.3, rebuilt on the kit.
 *
 * ── what this screen is actually about ────────────────────────────────────
 *
 * One number, and everything else is context for it: **earned but never used**.
 * A reward that was earned and never collected means a customer did the work,
 * qualified, and did not come back — the one failure on this dashboard that
 * looks like success in every other column. So the gap leads the screen, the
 * pool that is holding that money is second, and the campaigns are third.
 *
 * ── the rules this file did not get to choose ─────────────────────────────
 *
 * - **A failed request is a state, not a zero.** The campaign list's
 *   `loading | ready | error` is folded once. The budget and the reminder status
 *   are further requests and can fail on their own — a venue whose campaigns
 *   list but whose pool does not gets em dashes, never zeros.
 * - **A pool has exactly three states and they exhaust it** — spent, set aside,
 *   available. The bar draws the server's own `budget_movements` figures through
 *   the kit's `Progress`, which cannot draw more committed than the pool holds.
 * - **A control with nothing honest behind it is not drawn.** v3 notes that
 *   "loyalty can take up to 70% of the total"; the server has no such cap, so
 *   the note under the allocation field says what the split *is* instead. The
 *   branch chips are absent because a venue here is one place. "Came back this
 *   month from rewards that expired unused" is absent because nothing counts
 *   loyalty expiries by month — the screen declines to make that figure up.
 *
 * Every press writes: the allocation through `PUT …/budget`, the rebalance
 * through `POST …/budget/rebalance` (offered only when the server's own
 * `rebalanceHint` says so), the reminder through `POST …/remind`, and each
 * card's pause, resume and end through the campaign status call.
 */
import { useCallback, useMemo, useState } from 'react';

import { ApiError } from './api/client';
import {
  euroToMinor,
  isNoSession,
  isNoVenue,
  minorToEuro,
  readyOr,
  rebalanceBudget,
  sendReminder,
  setCampaignStatus,
  setLoyaltyBudget,
  usePartnerBudget,
  usePartnerCampaigns,
  usePartnerRemind,
  type BudgetBody,
  type CampaignResponse,
  type RemindStatus,
} from './api/partner';
import { DEMO_BUDGET, DEMO_CAMPAIGNS, DEMO_REMIND, DEMO_VENUE } from './dashboardDemo';
import { useNum } from './dashboardFormat';
import { Button, Card, ConfirmDialog, DxIcon, EmptyState, Pill, Progress, type PillTone } from './dashboardKit';
import { useDashboard } from './dashboardShell';
import { DEMO_MODE } from './demoMode';
import { useCopy, useCurrency, useLanguage, useMoney } from './i18n/context';
import { fill } from './i18n/currency';
import { FX } from './i18n/fx';
import { campaignFromApi, campaignModel, type CampaignModel } from './partnerMetrics';
import './dashboard-campaigns.css';

type DashboardCopy = ReturnType<typeof useCopy>['dashboard'];
/** One campaign, with the apportionment `campaignModel` hangs off it. */
type Campaign = CampaignModel['list'][number];

const PILL: Record<CampaignResponse['status'], PillTone> = {
  active: 'live',
  paused: 'paused',
  draft: 'draft',
  ended: 'ended',
};

/* ─────────────────────────────────────────────────────────────── writing ── */

function refusalText(cause: unknown, dashboard: DashboardCopy): string {
  if (cause instanceof ApiError && cause.status === 0) return dashboard.acts.offline;
  if (cause instanceof ApiError && cause.status === 401) return dashboard.unmeasured.noSession;
  return fill(dashboard.acts.refused, { why: cause instanceof Error ? cause.message : String(cause) });
}

/**
 * A write, its two endings, and the re-read after it: the pressed control is
 * the one that locks, a failure is named *by kind*, and success re-reads the
 * list rather than patching a card.
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
 * Localised dates. A bare `YYYY-MM-DD` is pinned to UTC midnight and read in
 * UTC, so a campaign is not filed as starting the day before it did for anybody
 * west of Greenwich.
 */
function useDates() {
  const [language] = useLanguage();
  return useMemo(() => {
    const day = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long' });
    const month = new Intl.DateTimeFormat(language, { month: 'long' });
    const at = (iso: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso);
    return {
      day: (iso: string) => day.format(at(iso)),
      monthOf: (date: Date) => month.format(date),
      dayOf: (date: Date) => day.format(date),
    };
  }, [language]);
}

/* ─────────────────────────────────────────────────────────────── the pool ── */

/**
 * When the loyalty pool runs out, at the rate it has been going out. Derived
 * rather than invented: `spent` is the ledger's own figure and `elapsed` is the
 * calendar. `period` is parsed defensively, because a `NaN` month would
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
  const dashboard = useCopy().dashboard;
  const { venueId, venue: chosen } = useDashboard();
  const venue = chosen ?? (DEMO_MODE ? DEMO_VENUE : null);
  const campaignsApi = usePartnerCampaigns(venueId);
  const budgetApi = usePartnerBudget(venueId);
  const remindApi = usePartnerRemind(venueId);

  /* The real answer first; the demonstration data only when there was no
     session to ask with, and only when this browser was sent `?demo=1`. */
  const budget = readyOr(budgetApi.state, DEMO_MODE ? DEMO_BUDGET : null);
  const remind = readyOr(remindApi.state, DEMO_MODE ? DEMO_REMIND : null);

  const state = campaignsApi.state;
  if (state.status === 'loading') {
    return (
      <Card>
        <p className="dx-fine">{dashboard.unmeasured.asking}</p>
      </Card>
    );
  }

  let rows: CampaignResponse[];
  if (state.status === 'error') {
    if (!(DEMO_MODE && isNoSession(state.error))) {
      return (
        <EmptyState
          icon="campaigns"
          title={dashboard.empty.campaigns.title}
          body={isNoVenue(state.error) ? dashboard.unmeasured.noVenue : isNoSession(state.error) ? dashboard.unmeasured.noSession : dashboard.unmeasured.serverSilent}
        />
      );
    }
    rows = DEMO_CAMPAIGNS;
  } else {
    rows = state.data;
  }

  /* The pool comes from `/budget`, but the *currency* comes from the venue. */
  const currency = venue?.currency ?? 'EUR';
  const toEuro = (minor: number) => minorToEuro(minor, currency);
  const model = campaignModel(
    rows.map((row) => campaignFromApi(row, toEuro, venue?.scan_cooldown_hours ?? null)),
    budget?.loyalty ?? null,
  );

  if (rows.length === 0) return <NoCampaigns currency={currency} />;

  const statusOf = new Map(rows.map((row) => [row.id, row.status]));

  return (
    <>
      <RebalanceBanner budget={budget} venueId={venueId} reload={budgetApi.reload} />
      <GapCard model={model} venueId={venueId} remind={remind} reloadRemind={remindApi.reload} />
      <BudgetCard
        budget={budget}
        asking={budgetApi.state.status === 'loading'}
        reload={budgetApi.reload}
      />
      <div className="dx-camp-grid">
        {model.list.map((campaign) => (
          <CampaignCard
            key={campaign.id}
            campaign={campaign}
            status={statusOf.get(campaign.id) ?? (campaign.live ? 'active' : 'paused')}
            reload={campaignsApi.reload}
          />
        ))}
      </div>
    </>
  );
}

/**
 * No campaign yet — after the seed purge the ordinary state of a new venue,
 * which says so in its own words and offers v3's starter: four visits, a free
 * filter coffee, about five złoty in the reader's own currency. The press opens
 * the ordinary form with those values in it; nothing is filed until the owner
 * presses Start there.
 */
function NoCampaigns({ currency }: { currency: string }) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.campaigns;
  const money = useMoney();
  const { openDrawer, toast } = useDashboard();
  /* The reference design's five złoty, as euros — which is what every amount
     on this site is written in before it is converted for the reader. */
  const starterCost = 5 / FX.PLN.rate;
  const reward = dashboard.drawer.campaign.rewardItemPlaceholder;

  return (
    <EmptyState
      icon="campaigns"
      title={dashboard.empty.campaigns.title}
      body={copy.board.emptyBody}
      suggestion={{
        kicker: copy.board.suggestKicker,
        title: fill(copy.rule, { visits: '4', reward }),
        note: fill(copy.board.suggestNote, { amount: money(starterCost, 'unit') }),
      }}
      action={{
        label: copy.board.suggestAction,
        onClick: () => {
          openDrawer('campaign', undefined, {
            campaign: {
              visitsRequired: 4,
              rewardLabel: reward,
              rewardCostMinor: euroToMinor(starterCost, currency),
            },
          });
          toast(copy.board.starter);
        },
      }}
    />
  );
}

/* ══════════════════════════════════════════════════════ rebalance banner ══ */

/**
 * "Your loyalty budget runs out — move some across?", and only when the server
 * thinks so. `rebalanceHint` is null unless one pool is genuinely running out
 * *and* the other has room, so an owner does not learn to dismiss it; the
 * amount on the button is the server's suggestion, not a round number.
 */
function RebalanceBanner({
  budget,
  venueId,
  reload,
}: {
  budget: BudgetBody | null;
  venueId: string | null;
  reload: () => void;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.campaigns.board;
  const money = useMoney();
  const dates = useDates();
  const { toast } = useDashboard();
  const { busy, run } = useWrite(reload);

  const hint = budget?.rebalanceHint ?? null;
  if (!budget || !hint || hint.to !== 'loyalty') return null;

  const toEuro = (minor: number) => minorToEuro(minor, budget.currency);
  const forecast = forecastFor(budget.period, toEuro(budget.loyalty.spent), toEuro(budget.loyalty.available));
  if (forecast.kind === 'safe') return null;
  const amount = money(toEuro(hint.suggested), 'exact');
  const spare = money(toEuro(budget.voucher.available), 'exact');

  return (
    <div className="dx-camp-banner">
      <DxIcon name="swap" size={20} strokeWidth={1.9} />
      <p>
        {forecast.kind === 'out'
          ? fill(copy.rebalanceOut, { amount: spare })
          : fill(copy.rebalance, { date: dates.dayOf(forecast.at), amount: spare })}
      </p>
      <Button
        variant="primary"
        disabled={busy !== null}
        onClick={() => {
          if (venueId === null) {
            toast(dashboard.unmeasured.noSession);
            return;
          }
          void run('move', fill(copy.moved, { amount }), () => rebalanceBudget(venueId, 'voucher', hint.suggested));
        }}
      >
        {fill(copy.move, { amount })}
      </Button>
    </div>
  );
}

/* ══════════════════════════════════════════════ the gap, and what to do ══ */

/**
 * The number to watch, and the one press that follows from it.
 *
 * Three figures side by side — earned, used, and the difference — because the
 * difference is the only one of the three that is a *finding*. "One visit away"
 * is summed over the running campaigns only when every one of them reported it:
 * a sum with a hole in it is a smaller number, not an honest one.
 */
function GapCard({
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
  const dates = useDates();
  const { goTo } = useDashboard();

  const widest = model.widest >= 0 ? model.list[model.widest] : null;
  const running = model.list.filter((campaign) => campaign.live);
  const near = running.every((campaign) => campaign.near !== undefined)
    ? running.reduce((sum, campaign) => sum + (campaign.near ?? 0), 0)
    : null;
  const totals = [model.earned, model.used, Math.max(0, model.earned - model.used)];

  return (
    <Card className="dx-camp-gap">
      <div className="dx-camp-gap-head">
        <div className="dx-camp-gap-copy">
          <h2>{copy.gapTitle}</h2>
          <p>
            {copy.gapLede}
            {widest !== null && widest.gap > 0 ? ` ${fill(copy.board.gap, { name: widest.name, n: num(widest.gap) })}` : ''}
          </p>
        </div>
        <div className="dx-camp-tiles">
          {copy.board.totals.map((label, index) => (
            <div key={label}>
              <span>{label}</span>
              <b data-down={index === 2 ? 'true' : undefined}>{num(totals[index])}</b>
            </div>
          ))}
        </div>
      </div>

      {/* Nobody to remind and nothing sent this week: no strip, rather than a
          strip offering to message zero people. */}
      {remind !== null && (remind.audience > 0 || remindWaiting(remind)) && (
        <div className="dx-camp-remind">
          <RemindPress venueId={venueId} remind={remind} reload={reloadRemind} />
          <div className="dx-camp-remind-copy">
            <b>{copy.board.remindNote}</b>
            {remind.lastResult && (
              <span>
                {fill(copy.board.remindResult, {
                  date: dates.day(remind.lastResult.sentAt),
                  back: num(remind.lastResult.cameBack),
                  of: num(remind.lastResult.audience),
                })}
              </span>
            )}
            {remind.nextAllowedAt !== null && remindWaiting(remind) && (
              <span>{fill(copy.remindNext, { date: dates.day(remind.nextAllowedAt) })}</span>
            )}
          </div>
          {/* The assistant drafts customer-facing copy in all five languages, so
              "set this up for me" goes to the thing that can actually do it. */}
          <Button variant="secondary" onClick={() => goTo('assistant')}>
            {copy.remindSetup}
          </Button>
        </div>
      )}

      {near !== null && near > 0 && (
        <p className="dx-camp-near">
          <DxIcon name="userPlus" size={15} strokeWidth={1.9} />
          {fill(copy.near, { n: num(near) })}
        </p>
      )}
    </Card>
  );
}

/** Whether a reminder is still inside the week the server makes owners wait. */
const remindWaiting = (remind: RemindStatus) =>
  remind.nextAllowedAt !== null && Date.parse(remind.nextAllowedAt) > Date.now();

/**
 * "Remind {n} customers" → "Reminded". It sends now, and the face is the
 * server's: `nextAllowedAt` in the future, read from `GET …/remind`, rather than
 * a flag this component set — so a reload, a second tab and the phone agree.
 */
function RemindPress({
  venueId,
  remind,
  reload,
}: {
  venueId: string | null;
  remind: RemindStatus;
  reload: () => void;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.campaigns;
  const num = useNum();
  const dates = useDates();
  const { toast } = useDashboard();
  const [busy, setBusy] = useState(false);
  const waiting = remindWaiting(remind);

  const press = async () => {
    if (busy || waiting) return;
    if (venueId === null) {
      toast(dashboard.unmeasured.noSession);
      return;
    }
    setBusy(true);
    try {
      const sent = await sendReminder(venueId);
      toast(fill(copy.remindSent, { n: num(sent.audience), queued: num(sent.queued) }));
      reload();
    } catch (cause) {
      /* The two refusals about the week and the audience have their own
         sentences, and both re-read so the button stops offering a press the
         server has just turned down. */
      if (cause instanceof ApiError && cause.code === 'conflict') {
        const next = cause.detail.nextAllowedAt;
        toast(typeof next === 'string' ? fill(copy.remindTooSoon, { date: dates.day(next) }) : refusalText(cause, dashboard));
        reload();
      } else if (cause instanceof ApiError && cause.code === 'invalid_state') {
        toast(copy.remindNobody);
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
      {waiting ? dashboard.overview.reminded : fill(copy.remindLabel, { n: num(remind.audience) })}
    </Button>
  );
}

/* ══════════════════════════════════════════════════════ the loyalty pool ══ */

/**
 * What the month has for loyalty, and what is left of it.
 *
 * The field sets the **loyalty pool** and leaves the voucher pool where it is
 * (`setLoyaltyBudget`); the server works out the total and the split. It used
 * to send the current total with a new split, and on a venue whose total was
 * still 0 every split of nothing is nothing — the owner typed a budget, was
 * told it was saved, and still had none. It also took the money out of the
 * voucher pool, which is the Vouchers screen's figure, not this one's.
 * It is typed in the reader's currency and converted where the request needs
 * the venue's minor units; the Save appears only once the field differs from
 * what the server holds, because a field that writes on every keystroke would
 * write a budget of "2" on the way to typing 2000.
 */
function BudgetCard({
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
  const available = pool ? toEuro(pool.available) : 0;
  const total = budget ? toEuro(budget.total) : 0;

  /*
   * The field holds a draft, and the draft follows the server only when the
   * server moves: comparing against the last server value tells "the server
   * said something new" apart from "somebody is typing".
   */
  const reported = Math.round(base * reader.rate);
  const [seen, setSeen] = useState(reported);
  const [share, setShare] = useState(String(reported));
  if (seen !== reported) {
    setSeen(reported);
    setShare(String(reported));
  }
  const typed = Math.max(0, Number(share) || 0);
  const dirty = budget !== null && typed !== reported;
  const forecast = budget && pool ? forecastFor(budget.period, spent, available) : null;

  return (
    <Card className="dx-camp-budget">
      <div className="dx-camp-budget-head">
        <div>
          <h2>{copy.budgetTitle}</h2>
          <p>
            {budget
              ? fill(copy.board.share, {
                  total: money(total, 'exact'),
                  vouchers: money(Math.max(0, total - base), 'exact'),
                })
              : asking
                ? dashboard.unmeasured.asking
                : dashboard.unmeasured.serverSilent}
          </p>
        </div>
        {budget && (
          <div className="dx-camp-alloc">
            <div className="dx-camp-alloc-row">
              <label className="dx-camp-alloc-field">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={100}
                  value={share}
                  aria-label={acts.budgetShare}
                  onChange={(event) => setShare(event.target.value)}
                />
                <span>{reader.symbol}</span>
              </label>
              {dirty && (
                <Button
                  variant="primary"
                  disabled={busy !== null}
                  onClick={() =>
                    void run('budget', acts.budgetSaved, () => setLoyaltyBudget(budget.venueId, toMinor(typed)))
                  }
                >
                  {acts.save}
                </Button>
              )}
            </div>
            <span className="dx-camp-alloc-note">
              {fill(acts.budgetShareNote, {
                loyalty: money(typed / reader.rate, 'exact'),
                /* The voucher pool does not move when this field does. */
                voucher: money(toEuro(budget.voucher.base), 'exact'),
              })}
            </span>
          </div>
        )}
      </div>

      {pool ? (
        <Progress spent={spent} aside={aside} total={base} tone="fill" height={14} track="soft" />
      ) : null}

      {/* Never a zero: a pool nobody could read is not an empty pool. */}
      <div className="dx-camp-legend">
        <Legend part="spent" label={words.spent} value={pool ? money(spent, 'exact') : undefined} note={copy.spentNote} />
        <Legend part="aside" label={words.aside} value={pool ? money(aside, 'exact') : undefined} note={copy.asideNote} />
        <Legend
          part="free"
          label={words.available}
          value={pool ? money(Math.max(0, available), 'exact') : undefined}
          down={pool !== null && available <= 0}
          note={copy.availableNote}
        />
      </div>

      {forecast && (
        <p className="dx-camp-forecast" data-ok={forecast.kind === 'safe' ? 'true' : undefined}>
          <DxIcon name="clock" size={15} strokeWidth={2} />
          {forecast.kind === 'out'
            ? copy.forecastOut
            : forecast.kind === 'safe'
              ? fill(copy.forecastSafe, { month: dates.monthOf(forecast.at) })
              : fill(copy.forecast, { date: dates.dayOf(forecast.at) })}
        </p>
      )}

      {forecast?.kind === 'out' && (
        <div className="dx-camp-out">
          <DxIcon name="info" size={17} strokeWidth={1.9} />
          <span>{copy.board.exhausted}</span>
        </div>
      )}
    </Card>
  );
}

/** One of the pool's three states; no `value` is an em dash, never a zero. */
function Legend({
  part,
  label,
  value,
  note,
  down,
}: {
  part: 'spent' | 'aside' | 'free';
  label: string;
  value?: string;
  note: string;
  down?: boolean;
}) {
  const withheld = useCopy().dashboard.unmeasured.serverSilent;
  return (
    <div className="dx-camp-pool">
      <span className="dx-camp-pool-label">
        <i data-part={part} aria-hidden />
        {label}
      </span>
      {value === undefined ? (
        <b className="dx-camp-withheld" title={withheld}>
          —
        </b>
      ) : (
        <b data-down={down ? 'true' : undefined}>{value}</b>
      )}
      <p>{note}</p>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════ one campaign ══ */

/**
 * One campaign card.
 *
 * Earned and used are counts the server sends; the gap between them is the
 * chip, and the rate is the same pair as a percentage. A rate over nothing is
 * **0, not null**: a campaign that has handed out nothing has a used rate of
 * zero, and an em dash there would claim we are withholding something.
 *
 * v3's "widening" — not too new to judge, and under half of what was earned
 * actually used — tints the card's edge, bar and chip amber. That is the
 * card's one warning, and it is read off the same two counts it prints.
 */
function CampaignCard({
  campaign,
  status,
  reload,
}: {
  campaign: Campaign;
  status: CampaignResponse['status'];
  reload: () => void;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.campaigns;
  const board = copy.board;
  const acts = dashboard.acts;
  const words = dashboard.words;
  const money = useMoney();
  const num = useNum();
  const dates = useDates();
  const { openDrawer } = useDashboard();
  const { busy, run } = useWrite(reload);
  const [ending, setEnding] = useState(false);
  const working = busy !== null;

  const pct = Math.round(campaign.rate * 100);
  const live = status === 'active';
  const young = live && campaign.earned < 20;
  const widening = !young && campaign.earned > 0 && pct < 50;

  const clauses = [
    campaign.cooldownHours === 24
      ? board.scanDay
      : campaign.cooldownHours !== null && campaign.cooldownHours > 0
        ? fill(copy.cooldown, { n: num(campaign.cooldownHours) })
        : null,
    campaign.minSpend > 0 ? fill(board.minSpend, { amount: money(campaign.minSpend, 'exact') }) : null,
    campaign.expiryDays > 0 ? fill(board.expiry, { n: num(campaign.expiryDays) }) : null,
  ].filter((clause): clause is string => clause !== null);

  return (
    <Card className="dx-camp-card" aria-label={campaign.name}>
      <div className="dx-camp-card-in" data-widening={widening ? 'true' : undefined}>
        <div className="dx-camp-card-head">
          <div>
            <h3>{campaign.name}</h3>
            <p className="dx-camp-rule">
              <span>{fill(copy.rule, { visits: num(campaign.visits), reward: campaign.reward })}</span>
              <em>{fill(words.each, { amount: money(campaign.cost, 'unit') })}</em>
            </p>
          </div>
          <Pill tone={PILL[status]}>{board.states[status]}</Pill>
        </div>

        <div className="dx-camp-counts">
          <span>{copy.earned}</span>
          <b>{num(campaign.earned)}</b>
          <span>{copy.used}</span>
          <b>{num(campaign.used)}</b>
        </div>

        <Progress spent={campaign.used} total={campaign.earned} tone={widening ? 'amber' : 'fill'} height={12} track="soft" />

        <div className="dx-camp-chips">
          <span className="dx-camp-gapchip">{fill(copy.unused, { n: num(campaign.gap) })}</span>
          <span className="dx-camp-rate">{fill(copy.usedRate, { pct: num(pct) })}</span>
          {young && <span className="dx-camp-young">{board.young}</span>}
        </div>

        <div className="dx-camp-cols">
          <div>
            <span>{words.costSoFar}</span>
            <b>{money(campaign.spent, 'exact')}</b>
          </div>
          <div>
            <span>{words.aside}</span>
            <b>{money(campaign.aside, 'exact')}</b>
          </div>
        </div>

        {clauses.length > 0 && <p className="dx-camp-rules">{clauses.join(' · ')}</p>}

        {status === 'paused' && (
          <p className="dx-camp-paused">
            {fill(board.paused, { n: num(campaign.outstanding), amount: money(campaign.aside, 'exact') })}
          </p>
        )}

        <div className="dx-camp-foot">
          <span>{fill(words.priority, { n: num(campaign.priority) })}</span>
          {campaign.startedAt !== null && (
            <>
              <i aria-hidden />
              <span>{fill(live ? board.since : board.started, { date: dates.day(campaign.startedAt) })}</span>
            </>
          )}
          <span className="dx-camp-foot-gap" />
          {/* The campaign form in edit mode, writing through
              `PATCH /v1/partner/campaigns/:id`. */}
          <Button variant="small" disabled={working} onClick={() => openDrawer('campaign', undefined, undefined, campaign.id)}>
            {acts.edit}
          </Button>
          {status !== 'ended' && (
            <Button
              variant="small"
              disabled={working}
              onClick={() =>
                void run('status', live ? acts.paused : acts.resumed, () =>
                  setCampaignStatus(campaign.id, live ? 'paused' : 'active'),
                )
              }
            >
              {live ? acts.pause : acts.resume}
            </Button>
          )}
          {status !== 'ended' && (
            <Button variant="small" disabled={working} onClick={() => setEnding(true)}>
              {acts.end}
            </Button>
          )}
        </div>
      </div>

      {ending && (
        <ConfirmDialog
          title={fill(board.endTitle, { name: campaign.name })}
          body={board.endBody}
          confirmLabel={board.endConfirm}
          busy={working}
          onCancel={() => setEnding(false)}
          onConfirm={() => {
            setEnding(false);
            void run('end', acts.ended, () => setCampaignStatus(campaign.id, 'ended'));
          }}
        />
      )}
    </Card>
  );
}
