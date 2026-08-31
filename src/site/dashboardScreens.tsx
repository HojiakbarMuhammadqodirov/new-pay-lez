import { useCallback, useMemo, useState } from 'react';
import { useCopy, useCurrency, useMoney } from './i18n/context';
import { fill, group as groupDigits } from './i18n/currency';
import {
  HEAT_HOURS,
  campaignFromApi,
  campaignModel,
  dealFromApi,
  heatFromApi,
  metricValue,
  reachFromApi,
  totalsFrom,
  voucherModelFrom,
  type CampaignRow,
  type PartnerDeal,
  type TierRow,
} from './partnerMetrics';
import {
  cancelScan,
  chain,
  confirmScan,
  enterScanAmount,
  euroToMinor,
  extendDeal,
  isNoSession,
  minorToEuro,
  publishDeal,
  rebalanceBudget,
  scheduleDealPush,
  setBudget,
  setCampaignStatus,
  setDealStatus,
  setVoucherTiers,
  usePartnerAnalytics,
  usePartnerBudget,
  usePartnerCampaigns,
  usePartnerCustomers,
  usePartnerDeals,
  usePartnerOverview,
  usePartnerPending,
  usePartnerToday,
  usePartnerVenue,
  usePartnerVenueId,
  venueInstant,
  type BudgetBody,
  type Metric,
  type PartnerVenue,
  type PendingScan,
  type TierDraft,
} from './api/partner';
import { useReach } from './api/reach';
import { ApiError } from './api/client';
import type { ApiState } from './api/useApi';
import { Assistant } from './dashboardAssistant';
import { NumberWell } from './dashboardControls';
import { useDashboard } from './dashboardShell';

/**
 * The six dashboard screens that are not the assistant or the profile form.
 *
 * This was `b2b/Paylez Partner Dashboard v2.dc.html` rebuilt: the same panels
 * in the same order, filled with that file's own seeds run through that file's
 * own arithmetic. **Every one of those figures is gone.** A venue owner opening
 * this page used to read "1,247 visits · about 9,900 zł in sales · 149 claims"
 * under their own venue's name, and not one of those numbers had been measured
 * anywhere. The panels remain; what fills them now is either a row the server
 * counted or a sentence saying nobody has counted anything yet.
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
 * ── most of the time the answer is "no session", and that is honest ───────
 *
 * The site's own auth is `localStorage` (`src/site/auth/users.ts`), so an owner
 * who signed in on `#/signin` has no API token and every request here resolves
 * to `no-partner-session`. That is the true state of the product today. The
 * empty copy is `copy.dashboard.empty`, which already existed in all five
 * languages and had never been rendered — it is written for exactly this: what
 * this screen is for, and the one thing to do that would start filling it.
 *
 * ── and now they write, which changes what "honest" costs ────────────────
 *
 * Five of the seven carry controls that reach the server: a deal is published,
 * paused, extended, taken down or given its one notification; a campaign is
 * paused or ended; the voucher ladder and the month's budget are set; a pending
 * scan at the counter is confirmed or turned away. `useAction` below is the one
 * place a write, its two endings and the reload after it are written down —
 * a screen that invented its own would eventually forget one of the three.
 *
 * The rule that governed the read side governs this one too, pointed the other
 * way: **a press that could not reach the server must not look like a press
 * that worked.** Every ending is a sentence, the failed one names why, and the
 * list is re-read from the server afterwards rather than patched locally —
 * because the server is what decides what a deal's status *became*, and a row
 * this screen edited in place would be this screen's opinion of it.
 *
 * Charts are divs and inline SVG paths, as everywhere else on this site.
 */

/* ─────────────────────────────────────────────────────────────── shared ── */

/**
 * Plain counts, grouped the reader's way.
 *
 * `groupDigits` is the money formatter's own separator logic, reused: the digit
 * grouping belongs to the language rather than to the currency (root
 * `CLAUDE.md`), so a count and a price on the same row have to break their
 * thousands identically or the screen looks like two products.
 */
function useNum() {
  const currency = useCurrency();
  return (value: number) => groupDigits(value, currency);
}

/**
 * A metric that may have been withheld.
 *
 * The single place a `Metric` becomes text, so there is one opinion about what
 * `suppressed` looks like. It is **not** a zero and not a blank: a blank reads
 * as a rendering bug, and a zero reads as a finding.
 */
function Figure({ metric, format }: { metric: Metric | undefined; format?: (n: number) => string }) {
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

/** A labelled proportion bar. One accent, so the parts differ by width alone. */
function Bar({ label, value, of, note }: { label: string; value: number; of: number; note: string }) {
  return (
    <div className="pd-bar-row">
      <span>{label}</span>
      <span className="pd-bar">
        <i style={{ width: `${of > 0 ? Math.max(1, Math.min(100, (value / of) * 100)) : 0}%` }} />
      </span>
      <b>{note}</b>
    </div>
  );
}

/**
 * A write, its two endings, and the re-read after it.
 *
 * One hook rather than a `try/catch` at each of the fourteen call sites, and
 * the three things it owns are the three that are easy to forget one of:
 *
 * - **A press is locked while it is in flight.** `busy` is the key of the
 *   control that is working, not a boolean, so the row that was pressed is the
 *   row that shows it — a table of six deals with every button greyed says the
 *   wrong thing about which one is being paused.
 * - **A failure is named, and named by kind.** "The server is not there" and
 *   "the server looked at this and refused" have different fixes, and only the
 *   second is worth reading a reason for. Same split the create drawer makes.
 * - **Success re-reads rather than patches.** What a deal's status *became* is
 *   the server's answer, not this screen's guess: extending an expired deal
 *   also revives it, publishing may land on `scheduled` rather than `live`, and
 *   a locally-patched row would show neither.
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
        toast(
          cause instanceof ApiError && cause.status === 0
            ? dashboard.acts.offline
            : fill(dashboard.acts.refused, {
                why: cause instanceof Error ? cause.message : String(cause),
              }),
        );
      } finally {
        setBusy(null);
      }
    },
    [dashboard.acts, reload, toast],
  );

  return { busy, run };
}

/** Live / paused, used / unused — the one chip the screens repeat. */
function State({ on, children }: { on: boolean; children: string }) {
  return (
    <span className="pd-state" data-on={on ? 'true' : undefined}>
      {children}
    </span>
  );
}

/**
 * The panel an owner sees when there is nothing measured.
 *
 * Deliberately not a blank card. `copy.dashboard.empty` is seven entries, one
 * per screen, each of them a title, a sentence about what this screen is for,
 * and the single action that would start filling it — written in five languages
 * and, until now, never rendered. A dashboard that cannot show a figure should
 * still tell an owner what the figure would be and how to get one.
 *
 * The second paragraph is the *reason*, and it has to distinguish the two. "No
 * partner session on this device" is a property of the build; "the server did
 * not answer" is a fault. An owner about to conclude that nobody has visited
 * them needs to know it is neither.
 */
/**
 * The screens whose empty state has something to press, and what it opens.
 *
 * Three of the seven, and the button is **absent** on the other four rather
 * than raising `copy.dashboard.notWired`. That string was the honest answer
 * while nothing on this frame wrote anything; it stopped being one the moment
 * the drawer started filing deals, because "not wired up" beside a button that
 * could be wired is an excuse rather than a fact. Where the next step is not a
 * press — the Customers and Scan screens fill in when a QR code goes on a
 * counter, which is a thing that happens in a café — the panel says what to do
 * and offers nothing to click, which is the true shape of it.
 */
const EMPTY_ACTION: Record<number, 'deal' | 'campaign'> = {
  0: 'deal',
  1: 'deal',
  2: 'campaign',
};

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
function Screen<T>({
  state,
  index,
  children,
}: {
  state: ApiState<T>;
  index: number;
  children: (data: T) => React.ReactNode;
}) {
  if (state.status === 'loading') return <div className="pd-stack"><Asking /></div>;
  if (state.status === 'error') {
    return (
      <div className="pd-stack">
        <Unmeasured index={index} error={state.error} />
      </div>
    );
  }
  return <>{children(state.data)}</>;
}

/** A panel whose question the API does not answer. Says which, and stops. */
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

/* ───────────────────────────────────────────────────────────── overview ── */

function Overview() {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.overview;
  const money = useMoney();
  const num = useNum();

  const venue = usePartnerVenueId();
  const venueId = venue.state.status === 'ready' ? venue.state.data : null;

  const overviewApi = usePartnerOverview(venueId);
  const analyticsApi = usePartnerAnalytics(venueId);
  const dealsApi = usePartnerDeals(venueId);
  const campaignsApi = usePartnerCampaigns(venueId);
  const reachApi = useReach(venueId);

  const state = chain(venue, overviewApi);

  /* Reach is its own request and its own state: it is the one report worth
     reading for a venue with no visits at all, which is precisely when the rest
     of this screen is a screen of "nothing yet". */
  const reach = reachApi.state.status === 'ready' ? reachFromApi(reachApi.state.data) : null;
  const reachPeriod = reachApi.state.status === 'ready' ? reachApi.state.data.period : null;

  const analytics = analyticsApi.state.status === 'ready' ? analyticsApi.state.data : null;
  const deals = dealsApi.state.status === 'ready' ? dealsApi.state.data : null;
  const campaigns = campaignsApi.state.status === 'ready' ? campaignsApi.state.data : null;

  return (
    <Screen state={state} index={0}>
      {(data) => {
        const toEuro = (minor: number) => minorToEuro(minor, data.budget.currency);
        /* The venue's *own* average transaction, from `budget.averageCheck` —
           which is the median of its own confirmed scans. The seeded version
           quoted a prototype café's 34.1 zł at every owner as though it were
           theirs, and it was the multiplier behind every money estimate here. */
        const avgSpend = toEuro(data.budget.averageCheck.minor);
        /* Redemptions come off `roiByFeature`, which counts `issued_vouchers`
           with a `redeemed_at` in the window. Zero when that report is not on
           the plan — and the tile that shows it renders a dash in that case
           rather than reading this, because the two mean different things. */
        const redeemed =
          analytics?.roi?.find((row) => row.feature === 'vouchers')?.outcome ?? 0;
        const totals = totalsFrom(data.overview, reach?.claims ?? 0, redeemed, avgSpend);

        const loyalty = campaignModel(
          (campaigns ?? []).map((row) => campaignFromApi(row, toEuro)),
          data.budget.loyalty,
        );
        const tiers: TierRow[] = data.budget.tiers.map((tier) => ({
          pct: tier.discountPct,
          points: tier.pointsCost,
          issued: 0,
          redeemed: 0,
          cap: toEuro(tier.maxDiscountMinor),
          remaining: tier.estimatedRemaining,
        }));
        const vouchers = voucherModelFrom(
          data.budget.voucher,
          tiers,
          avgSpend,
          Math.max(0, ...tiers.map((t) => t.cap)),
        );

        const liveDeals = (deals ?? [])
          .map((row) => dealFromApi(row, toEuro))
          .filter((deal) => deal.state === 'live');

        /* What the month cost, from the server's own four-way breakdown —
           subscription, loyalty, vouchers, deals — which is `costPerNewCustomer`
           summing `subscriptions`, `budget_movements` and `transactions`. The
           four seeded rows here were a flat fee somebody typed and three pool
           figures derived from it. */
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

        return (
          <div className="pd-stack">
            {/* The headline. Three claims at three strengths, in descending
                order of how much we can stand behind them: counted, estimated,
                and the subset we would defend. */}
            <div className="pd-glass pd-hero" data-ink="paper" data-reveal>
              <div className="pd-hero-main">
                <span className="console-label">
                  {fill(copy.kicker, { range: data.overview.period })}
                </span>
                {/* The bar's picker is a rolling day count and the server counts
                    in calendar months. Quoting one under the other's label is
                    exactly the mismatch this panel exists to avoid, so the
                    period is stated and the difference is named once. */}
                <p className="pd-fine">{dashboard.unmeasured.monthOnly}</p>

                <span className="pd-hero-eyebrow">{copy.countedLabel}</span>
                <p className="pd-counted">
                  <b>{num(totals.visits)}</b>
                  <span>{copy.counted}</span>
                </p>
                <p className="pd-fine pd-counted-new">
                  {data.overview.newCustomers.suppressed
                    ? dashboard.unmeasured.withheld
                    : fill(copy.countedNew, { n: num(totals.newCustomers) })}
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
                  <span>{copy.support[0].label}</span>
                  <b>{num(totals.visits)}</b>
                  <i>{copy.support[0].note}</i>
                </div>
                <div>
                  <span>{copy.support[1].label}</span>
                  <b>{money(avgSpend, 'unit')}</b>
                  <i>{copy.support[1].note}</i>
                </div>
                <div>
                  <span>{copy.support[2].label}</span>
                  <Figure metric={data.overview.newCustomers} format={num} />
                  <i>{copy.support[2].note}</i>
                </div>
              </div>
            </div>

            {/*
              Who saw you — above the cost panel, because it is the top of the
              funnel every other figure on this screen sits below.

              Without it a venue nobody has heard of and a venue everybody
              scrolls past render identically: zeroes, with nothing to say
              which. Those two have opposite fixes.
            */}
            <div className="pd-glass pd-panel pd-reach" data-reveal>
              <div className="pd-panel-head">
                <span className="console-label">{copy.reachTitle}</span>
                {reachPeriod && <span className="pd-chip">{reachPeriod}</span>}
              </div>

              {reach === null ? (
                <p className="pd-fine">
                  {reachApi.state.status === 'loading' ? dashboard.unmeasured.asking : dashboard.unmeasured.serverSilent}
                </p>
              ) : reach.seen === 0 && reach.clicks === 0 ? (
                <p className="pd-fine">{copy.reachEmpty}</p>
              ) : (
                <>
                  <p className="pd-fine">{copy.reachLive}</p>
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
                  </div>

                  <p className="pd-fine pd-reach-funnel">
                    {fill(copy.reachFunnel, {
                      seen: num(reach.seen),
                      clicks: num(reach.clicks),
                      claims: num(reach.claims),
                    })}
                  </p>

                  <div className="pd-panel-head pd-reach-split-head">
                    <span className="console-label">{copy.reachSplit}</span>
                  </div>
                  <div className="pd-rows">
                    <div>
                      <span>{copy.reachListing}</span>
                      <b>{num(reach.listingSeen)}</b>
                    </div>
                    <div>
                      <span>{copy.reachDeals}</span>
                      <b>{num(reach.dealSeen)}</b>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* What it cost, and the verdict. The verdict is picked by the
                arithmetic — a month where Paylez cost more than it can be shown
                to have returned has to say so — but only when both halves are
                known, which is what the null branch is for. */}
            <div className="pd-glass pd-panel" data-reveal>
              <div className="pd-panel-head">
                <span className="console-label">{copy.costTitle}</span>
                <span className="pd-chip">{data.overview.period}</span>
              </div>

              {costRows === null || costTotal === null ? (
                <p className="pd-fine">
                  {analyticsApi.state.status === 'loading'
                    ? dashboard.unmeasured.asking
                    : dashboard.unmeasured.serverSilent}
                </p>
              ) : (
                <>
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
                  </div>
                  {roi !== null && (
                    <p className="pd-verdict" data-good={roi >= 1 ? 'true' : 'false'}>
                      {roi >= 1
                        ? fill(copy.roiGood, {
                            cost: money(costTotal, 'exact'),
                            month: data.overview.period,
                            revenue: money(totals.attributedMoney, 'soft'),
                            n: roi.toFixed(1),
                          })
                        : fill(copy.roiBad, {
                            cost: money(costTotal, 'exact'),
                            month: data.overview.period,
                            revenue: money(totals.attributedMoney, 'soft'),
                            gap: money(costTotal - totals.attributedMoney, 'exact'),
                          })}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Four counts. No deltas: comparing to a previous period needs a
                second request nobody makes yet, and a delta invented to fill
                the slot is the thing this rewrite removed. No sparklines
                either — there is no daily series endpoint. */}
            <div className="pd-tiles">
              <div className="pd-glass pd-tile" data-reveal>
                <span>{copy.tiles[0]}</span>
                <div className="pd-tile-body">
                  <div>
                    <b>{num(totals.visits)}</b>
                    <span className="pd-delta" data-dir="flat">
                      <i>{fill(copy.inMonth, { month: data.overview.period })}</i>
                    </span>
                  </div>
                </div>
              </div>
              <div className="pd-glass pd-tile" data-reveal>
                <span>{copy.tiles[1]}</span>
                <div className="pd-tile-body">
                  <div>
                    <b>{reach ? num(reach.claims) : '—'}</b>
                    <span className="pd-delta" data-dir="flat">
                      <i>{fill(copy.inMonth, { month: data.overview.period })}</i>
                    </span>
                  </div>
                </div>
              </div>
              <div className="pd-glass pd-tile" data-reveal>
                <span>{copy.tiles[2]}</span>
                <div className="pd-tile-body">
                  <div>
                    <b>
                      {analytics?.roi
                        ? num(analytics.roi.find((r) => r.feature === 'vouchers')?.outcome ?? 0)
                        : '—'}
                    </b>
                    <span className="pd-delta" data-dir="flat">
                      <i>{fill(copy.inMonth, { month: data.overview.period })}</i>
                    </span>
                  </div>
                </div>
              </div>
              <div className="pd-glass pd-tile" data-reveal>
                <span>{copy.tiles[3]}</span>
                <div className="pd-tile-body">
                  <div>
                    <b>
                      {analytics?.roi
                        ? num(analytics.roi.find((r) => r.feature === 'loyalty')?.outcome ?? 0)
                        : '—'}
                    </b>
                    <span className="pd-delta" data-dir="flat">
                      <i>{fill(copy.inMonth, { month: data.overview.period })}</i>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/*
              The one claim on this screen that is counted rather than modelled.

              It used to read "1.5 before, 2.4 now" as two literals in the JSX.
              `analytics.repeatMultiple` is the real thing — every campaign
              member's own visit rate before and after they joined, averaged —
              and it is cohort-suppressed, because it is a finding about people.
              Absent from the response entirely on a plan without deep
              analytics, which is a third state and gets its own sentence.
            */}
            {analytics === undefined || analytics === null ? null : analytics.repeatMultiple === undefined ? (
              <NoSource title={copy.proofTitle} detail={dashboard.unmeasured.planLocked} />
            ) : analytics.repeatMultiple.suppressed ? (
              <NoSource title={copy.proofTitle} detail={dashboard.unmeasured.withheld} />
            ) : (
              <div className="pd-glass pd-panel pd-proof-panel" data-reveal>
                <div>
                  <span className="console-label">{copy.proofTitle}</span>
                  <p className="pd-proof">
                    {/* One hole, because the server answers with a *ratio* —
                        each member's visit rate after joining over their rate
                        before it, averaged. Its baseline is 1 by construction,
                        which is what the column beside it draws; the sentence
                        used to quote that 1 as though it were a measured
                        visits-per-month figure. */}
                    {fill(copy.proof, {
                      n: (analytics.repeatMultiple.value ?? 0).toFixed(1),
                    })}
                  </p>
                  <p className="pd-fine">{copy.proofNote}</p>
                </div>
                <div className="pd-columns">
                  <span>
                    <i style={{ height: `${100 / Math.max(1, analytics.repeatMultiple.value ?? 1)}%` }} />
                    <b>1.0</b>
                    {copy.before}
                  </span>
                  <span data-on="true">
                    <i style={{ height: '100%' }} />
                    <b>{(analytics.repeatMultiple.value ?? 0).toFixed(1)}</b>
                    {copy.now}
                  </span>
                </div>
              </div>
            )}

            {/* The chart the prototype drew from two overlaid sine waves. There
                is no daily-series endpoint, so it says so rather than drawing a
                flat line through zero — which reads as a month of no trade. */}
            <NoSource title={copy.chartTitle} detail={dashboard.unmeasured.noSource} />

            <div className="pd-glass pd-panel pd-holding" data-reveal>
              <div>
                <span className="console-label">{copy.holdingTitle}</span>
                <p className="pd-proof">
                  {fill(copy.holding, {
                    rewards: num(loyalty.holding),
                    vouchers: num(vouchers.held),
                    amount: money(toEuro(data.budget.loyalty.reserved + data.budget.voucher.reserved), 'exact'),
                  })}
                </p>
                <p className="pd-fine">{copy.holdingNote}</p>
              </div>
            </div>

            {/*
              What the month noticed.

              Three invented sentences with invented figures used to sit here.
              `analytics.findings` is the server's own ranked list — the quiet
              window, the cost per new customer, the second-visit rate, the new
              customer count — and it returns at most three, already ordered by
              how much they deserve attention. A venue with nothing worth saying
              gets an empty list, which is a finding of its own.
            */}
            <div className="pd-glass pd-notices" data-reveal>
              <div className="pd-notice-head">
                <i aria-hidden />
                <span className="console-label">{copy.noticed}</span>
              </div>
              {data.findings.length === 0 ? (
                <p className="pd-fine">{dashboard.unmeasured.noFindings}</p>
              ) : (
                data.findings.map((finding) => (
                  <div className="pd-notice" key={finding.key}>
                    <div>
                      <p>
                        {dashboard.findings[
                          finding.key as keyof typeof dashboard.findings
                        ] ?? finding.key.replace(/_/g, ' ')}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Everything a customer could walk in and use today. */}
            <div className="pd-glass pd-running" data-reveal>
              <div className="pd-panel-head">
                <div>
                  <span className="console-label">{copy.runningTitle}</span>
                  <p className="pd-fine">{copy.runningNote}</p>
                </div>
              </div>

              {liveDeals.length === 0 && loyalty.list.length === 0 ? (
                <p className="pd-fine">{dashboard.empty[0].body}</p>
              ) : (
                <>
                  {liveDeals.map((deal) => (
                    <div className="pd-run-row" key={deal.id}>
                      <span className="pd-kind" data-kind="deal">
                        {copy.kinds.deal}
                      </span>
                      <div className="pd-run-name">
                        <b>{deal.badge}</b>
                      </div>
                      <div className="pd-run-stat">
                        <b>{num(deal.claimed)}</b>
                        <i>{copy.claims}</i>
                      </div>
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
                            visits: String(campaign.visits),
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
                    </div>
                  ))}
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
 * Today, and a fortnight after it, as `YYYY-MM-DD`.
 *
 * `<input type="date">` speaks that and nothing else, and `toISOString` is the
 * only formatter that produces it without an `Intl` round trip — it is UTC, so
 * an owner east of the line late at night opens the picker on yesterday. That
 * is a date field with a defaulted value in it, not a figure being reported,
 * and the alternative is a second timezone conversion for a value the owner is
 * about to overwrite.
 */
const isoDay = (offsetDays = 0): string =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/**
 * One deal, and everything an owner can do to it after it exists.
 *
 * The row was read-only until now, which meant the whole of §11.2 — the levers
 * an owner reaches for when the thing they are giving away has run out — lived
 * on the server with nothing calling them. Six controls, and which of them
 * appear is decided by the state rather than by taste:
 *
 * - **Publish** only on a `draft`, because publishing is what a draft is for.
 * - **Pause** on anything customers can currently reach, **Resume** on what was
 *   paused. Reversible, no confirmation, deliberately: an offer that has to come
 *   off the feed has to come off it now.
 * - **Extend** wherever there is a window to push out. It is the correct control
 *   on an *expired* deal and not a second publish, because the server revives an
 *   expired deal in the same statement that moves its end date.
 * - **End** everywhere except a draft, and it is the one that asks twice —
 *   `archived` is the only one of the three status changes this screen cannot
 *   undo.
 * - **Notify** on a deal customers can reach. One per deal, ever; a second
 *   attempt is a `conflict` the strip reports rather than a second send.
 *
 * The two that need a value open a second row underneath rather than a dialog:
 * a date and a clock face are two fields, and a modal over a table the owner is
 * comparing rows in hides the thing they were reading.
 */
function DealRow({
  deal,
  venue,
  reload,
  children,
}: {
  deal: PartnerDeal;
  venue: PartnerVenue | null;
  reload: () => void;
  /** The read-only cells, which are the caller's business rather than this one's. */
  children: React.ReactNode;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.acts;
  const { busy, run } = useAction(reload);
  const [open, setOpen] = useState<'extend' | 'notify' | null>(null);
  const [sure, setSure] = useState(false);
  const [until, setUntil] = useState(() => deal.to?.slice(0, 10) ?? isoDay(14));
  const [pushDay, setPushDay] = useState(() => isoDay());
  const [pushTime, setPushTime] = useState('09:00');

  const reachable = deal.state === 'live' || deal.state === 'scheduled';
  const working = busy !== null;

  return (
    <>
      <tr data-dim={deal.state === 'expired' || deal.state === 'archived' ? 'true' : undefined}>
        {children}
        <td>
          <span className="pd-row-acts">
            {deal.state === 'draft' && (
              <button
                type="button"
                className="btn btn-solid"
                disabled={working}
                onClick={() => void run('publish', copy.published, () => publishDeal(deal.id))}
              >
                {copy.publish}
              </button>
            )}
            {reachable && (
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
            )}
            {deal.state === 'paused' && (
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
            )}
            {deal.state !== 'draft' && deal.state !== 'archived' && (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={working}
                onClick={() => setOpen((was) => (was === 'extend' ? null : 'extend'))}
              >
                {copy.extend}
              </button>
            )}
            {reachable && (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={working}
                onClick={() => setOpen((was) => (was === 'notify' ? null : 'notify'))}
              >
                {copy.notify}
              </button>
            )}
            {deal.state !== 'draft' && deal.state !== 'archived' && (
              /* Two presses, because this is the one status change the screen
                 cannot take back. The second label is a question rather than a
                 warning: a palette with one accent cannot make a button red, so
                 the confirmation is in the words. */
              <button
                type="button"
                className="btn btn-ghost"
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
          </span>
        </td>
      </tr>

      {open !== null && (
        <tr className="pd-drawer-row">
          <td colSpan={6}>
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
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * The venue's hot deals, as the server has them.
 *
 * Six invented rows used to be here, with a claim sparkline, a "reach lost to
 * missing languages" percentage and a notification funnel derived from three
 * invented rates. What survives is what `hot_deals` and `deals.funnel` actually
 * carry: seen, opened, claimed, what the discounts cost, the claim cap, and how
 * many of the five languages the deal is written in — which is a real
 * completeness check over the `translations` table and the one column here that
 * tells an owner something they can fix.
 */
function Deals() {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.deals;
  const money = useMoney();
  const num = useNum();
  const [filter, setFilter] = useState(0);

  const venueApi = usePartnerVenue();
  const venue = venueApi.state.status === 'ready' ? venueApi.state.data : null;
  const dealsApi = usePartnerDeals(venue?.id ?? null);
  const state = chain(venueApi, dealsApi);

  /* The venue's own currency, off the venue row rather than off the budget.
     Reading it from `/budget` meant a screen that could reach `/deals` but not
     `/budget` priced a Kraków café's discounts in euros — the same figure, at
     four times the number. */
  const currency = venue?.currency ?? 'EUR';
  const reload = dealsApi.reload;

  return (
    <Screen state={state} index={1}>
      {(rows) => {
        const deals: PartnerDeal[] = rows.map((row) =>
          dealFromApi(row, (minor) => minorToEuro(minor, currency)),
        );
        const states: Array<PartnerDeal['state'] | null> = [
          null,
          'live',
          'scheduled',
          'paused',
          'expired',
        ];
        const shown = deals.filter(
          (deal) => states[filter] === null || deal.state === states[filter],
        );

        if (deals.length === 0) {
          return (
            <div className="pd-stack">
              <Unmeasured index={1} />
            </div>
          );
        }

        return (
          <div className="pd-stack">
            <div className="pd-glass pd-panel" data-solid="true" data-reveal>
              <div className="pd-panel-head">
                <div>
                  <span className="console-label">{dashboard.screens[1].name}</span>
                  <p className="pd-fine">
                    {fill(copy.count, { n: String(shown.length), total: String(deals.length) })}
                  </p>
                </div>
                <div className="pd-filters">
                  {copy.filters.map((label, index) => (
                    <button
                      key={label}
                      type="button"
                      className="pd-filter"
                      data-on={index === filter ? 'true' : undefined}
                      onClick={() => setFilter(index)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {shown.length === 0 ? (
                <p className="pd-fine">{copy.emptyFiltered}</p>
              ) : (
                <table className="pd-table">
                  <thead>
                    <tr>
                      <th>{copy.columns[0]}</th>
                      <th>{copy.funnel[0]}</th>
                      <th>{copy.funnel[1]}</th>
                      <th>{copy.funnel[2]}</th>
                      <th>{dashboard.words.costSoFar}</th>
                      <th>{dashboard.acts.column}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((deal) => (
                      <DealRow key={deal.id} deal={deal} venue={venue} reload={reload}>
                        <td>
                          <b>{deal.badge}</b>
                          <span className="pd-fine">
                            <State on={deal.state === 'live'}>
                              {copy.states[deal.state]}
                            </State>
                            {' · '}
                            {deal.langs === 5
                              ? copy.langsAll
                              : fill(copy.langsSome, {
                                  n: String(deal.langs),
                                  /* The share of the five languages the deal is
                                     *not* written in. The seeded column called
                                     this "reach lost" and quoted a percentage
                                     nobody had measured; this is a count of
                                     missing translations, which is a fact. */
                                  pct: String(Math.round((deal.missing.length / 5) * 100)),
                                })}
                          </span>
                        </td>
                        <td>{num(deal.seen)}</td>
                        <td>{num(deal.opened)}</td>
                        <td>
                          {num(deal.claimed)}
                          {deal.limit > 0 && (
                            <span className="pd-fine">
                              {' '}
                              {fill(copy.limitAllowed, { limit: String(deal.limit) })}
                            </span>
                          )}
                        </td>
                        <td>{money(deal.cost, 'exact')}</td>
                      </DealRow>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* The notification funnel the prototype drew. `deal_pushes` holds
                the real sends and opens; `partners.dealsFor` does not join it,
                so there is nothing to draw and the panel says which. */}
            <NoSource title={copy.notifyTitle} />
          </div>
        );
      }}
    </Screen>
  );
}

/* ──────────────────────────────────────────────────────────── campaigns ── */

/**
 * Pause a campaign, restart it, or close it for good.
 *
 * §5.3's half that is easy to get backwards: pausing stops new *earning* and
 * touches nothing already earned. A reward somebody has qualified for stays
 * valid and stays reserved out of the loyalty pool, which is why the row keeps
 * showing an outstanding count for a paused campaign rather than zeroing it —
 * that money is still committed and the customer can still walk in for it.
 *
 * Ending asks twice for the same reason the deal's does: `ended` is where this
 * screen stops being able to change its mind.
 */
function CampaignActions({
  id,
  live,
  reload,
}: {
  id: string;
  live: boolean;
  reload: () => void;
}) {
  const copy = useCopy().dashboard.acts;
  const { busy, run } = useAction(reload);
  const [sure, setSure] = useState(false);
  const working = busy !== null;

  return (
    <span className="pd-row-acts">
      <button
        type="button"
        className="btn btn-ghost"
        disabled={working}
        onClick={() =>
          void run(
            'status',
            live ? copy.paused : copy.resumed,
            () => setCampaignStatus(id, live ? 'paused' : 'active'),
          )
        }
      >
        {live ? copy.pause : copy.resume}
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={working}
        onClick={() => {
          if (!sure) {
            setSure(true);
            return;
          }
          setSure(false);
          void run('end', copy.ended, () => setCampaignStatus(id, 'ended'));
        }}
      >
        {sure ? copy.endSure : copy.end}
      </button>
    </span>
  );
}

function Campaigns() {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.campaigns;
  const money = useMoney();
  const num = useNum();

  const venueApi = usePartnerVenue();
  const venue = venueApi.state.status === 'ready' ? venueApi.state.data : null;
  const campaignsApi = usePartnerCampaigns(venue?.id ?? null);
  const budgetApi = usePartnerBudget(venue?.id ?? null);
  const state = chain(venueApi, campaignsApi);

  const budget = budgetApi.state.status === 'ready' ? budgetApi.state.data : null;
  /* The pool comes from `/budget`, but the *currency* comes from the venue: a
     screen that can list campaigns and cannot read the budget still knows what
     a reward costs, and must not quote it in the wrong money. */
  const currency = venue?.currency ?? 'EUR';

  return (
    <Screen state={state} index={2}>
      {(rows) => {
        const toEuro = (minor: number) => minorToEuro(minor, currency);
        const list: CampaignRow[] = rows.map((row) => campaignFromApi(row, toEuro));
        const model = campaignModel(list, budget?.loyalty ?? null);

        if (list.length === 0) {
          return (
            <div className="pd-stack">
              <Unmeasured index={2} />
            </div>
          );
        }

        return (
          <div className="pd-stack">
            {/* The pool. Three states that exhaust it — spent, set aside,
                available — read straight off `budget_movements` rather than
                re-derived from the reward counts, so the bar cannot let an
                owner commit the same money twice. */}
            <div className="pd-glass pd-panel" data-reveal>
              <div className="pd-panel-head">
                <span className="console-label">{copy.budgetTitle}</span>
                {budget && <span className="pd-chip">{budget.period}</span>}
              </div>
              {model.measured ? (
                <>
                  <p className="pd-fine">{copy.budgetLede}</p>
                  <Bar
                    label={dashboard.words.spent}
                    value={toEuro(budget!.loyalty.spent)}
                    of={toEuro(budget!.loyalty.base)}
                    note={money(toEuro(budget!.loyalty.spent), 'exact')}
                  />
                  <Bar
                    label={dashboard.words.aside}
                    value={toEuro(budget!.loyalty.reserved)}
                    of={toEuro(budget!.loyalty.base)}
                    note={money(toEuro(budget!.loyalty.reserved), 'exact')}
                  />
                  <Bar
                    label={dashboard.words.available}
                    value={Math.max(0, toEuro(budget!.loyalty.available))}
                    of={toEuro(budget!.loyalty.base)}
                    note={money(toEuro(budget!.loyalty.available), 'exact')}
                  />
                  <p className="pd-fine">{copy.availableNote}</p>
                </>
              ) : (
                <p className="pd-fine">
                  {budgetApi.state.status === 'loading' ? dashboard.unmeasured.asking : dashboard.unmeasured.serverSilent}
                </p>
              )}
            </div>

            <div className="pd-glass pd-panel" data-solid="true" data-reveal>
              <div className="pd-panel-head">
                <span className="console-label">{dashboard.screens[2].name}</span>
                <p className="pd-fine">{copy.visitRule}</p>
              </div>
              <table className="pd-table">
                <thead>
                  <tr>
                    <th>{dashboard.screens[2].name}</th>
                    <th>{copy.earned}</th>
                    <th>{copy.used}</th>
                    <th>{copy.totals[2]}</th>
                    <th>{dashboard.acts.column}</th>
                  </tr>
                </thead>
                <tbody>
                  {model.list.map((campaign) => (
                    <tr key={campaign.id}>
                      <td>
                        <b>{campaign.name}</b>
                        <span className="pd-fine">
                          {fill(copy.rule, {
                            visits: String(campaign.visits),
                            reward: campaign.reward,
                          })}
                          {' · '}
                          {fill(dashboard.words.each, { amount: money(campaign.cost, 'unit') })}
                          {' · '}
                          <State on={campaign.live}>
                            {campaign.live ? dashboard.deals.states.live : dashboard.deals.states.paused}
                          </State>
                        </span>
                      </td>
                      <td>{num(campaign.earned)}</td>
                      <td>{num(campaign.used)}</td>
                      <td>{num(campaign.outstanding)}</td>
                      <td>
                        <CampaignActions
                          id={campaign.id}
                          live={campaign.live}
                          reload={campaignsApi.reload}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* The gap — earned and never collected — is the number to watch,
                and it is computed rather than written down so a rewards count
                that moves takes the sentence with it. */}
            {model.widest >= 0 && model.widestGap > 0 && (
              <div className="pd-glass pd-panel" data-reveal>
                <div className="pd-panel-head">
                  <span className="console-label">{copy.gapTitle}</span>
                </div>
                <p className="pd-fine">{copy.gapLede}</p>
                <p className="pd-proof">
                  {fill(copy.gap, {
                    name: model.list[model.widest].name,
                    n: String(model.widestGap),
                  })}
                </p>
              </div>
            )}
          </div>
        );
      }}
    </Screen>
  );
}

/* ───────────────────────────────────────────────────────────── vouchers ── */

/**
 * The month's money: how much of it there is, and how it is split.
 *
 * The prototype made the budget an editable field and recomputed the pool from
 * it on this device, which was honest while there was no server — the whole
 * pool was invented anyway. Then it became a *fact* rather than a field,
 * because a screen that cannot save a number must not offer to take one. This
 * is the third state and the right one: the field is back, and what it does is
 * `PUT /v1/partner/venues/:id/budget`.
 *
 * Two things about it are the server's rules rather than this screen's:
 *
 * - **The split is one number, not two.** Basis points of one total, so the two
 *   sides cannot be set to a pair that does not add up — which is the failure a
 *   "loyalty budget" field beside a "voucher budget" field invites on the very
 *   first edit, and it ends with the same money committed twice.
 * - **A budget cannot shrink below what is already committed.** Spent money is
 *   gone and reserved money belongs to a customer holding a voucher; a pool that
 *   cannot honour them is a promise already broken. The refusal names the
 *   figure and arrives through the strip like every other one.
 *
 * Both amounts are typed in the **reader's** currency and converted where the
 * request needs the venue's, which is the rule for a money field being typed
 * rather than shown (root `CLAUDE.md`).
 */
function BudgetEditor({
  budget,
  reload,
}: {
  budget: BudgetBody;
  reload: () => void;
}) {
  const copy = useCopy().dashboard.acts;
  const currency = useCurrency();
  const money = useMoney();
  const { busy, run } = useAction(reload);

  const toReader = (minor: number) => minorToEuro(minor, budget.currency) * currency.rate;
  const toMinor = (reader: number) => euroToMinor(reader / currency.rate, budget.currency);

  const [total, setTotal] = useState(() => Math.round(toReader(budget.total)));
  /* Percent rather than basis points, because a person setting a split thinks
     in percent and the server's unit is an implementation detail of *storing*
     it. One multiplication at the seam, in one place. */
  const [share, setShare] = useState(() =>
    budget.total > 0 ? Math.round((budget.loyalty.base / budget.total) * 100) : 50,
  );
  const [from, setFrom] = useState<'loyalty' | 'voucher'>('voucher');
  const [amount, setAmount] = useState(0);

  const working = busy !== null;
  const hint = budget.rebalanceHint;
  const poolName = (which: 'loyalty' | 'voucher') => copy.pools[which];

  return (
    <div className="pd-glass pd-panel" data-reveal>
      <div className="pd-panel-head">
        <span className="console-label">{copy.budgetTitle}</span>
        <span className="pd-chip">{budget.period}</span>
      </div>
      <p className="pd-fine">{copy.budgetLede}</p>

      <div className="pd-inputs">
        <div>
          <span className="field-label">{copy.budgetTotal}</span>
          <NumberWell
            value={total}
            onChange={setTotal}
            unit={currency.symbol}
            label={copy.budgetTotal}
            min={0}
            wide
          />
        </div>
        <div>
          <span className="field-label">{copy.budgetShare}</span>
          <NumberWell
            value={share}
            onChange={(next) => setShare(Math.max(0, Math.min(100, next)))}
            unit={copy.shareUnit}
            label={copy.budgetShare}
            min={0}
            wide
          />
          <span className="field-help">
            {fill(copy.budgetShareNote, {
              loyalty: money((total / currency.rate) * (share / 100), 'exact'),
              voucher: money((total / currency.rate) * (1 - share / 100), 'exact'),
            })}
          </span>
        </div>
      </div>

      <div className="pd-inline-form">
        <button
          type="button"
          className="btn btn-solid"
          disabled={working}
          onClick={() =>
            void run('budget', copy.budgetSaved, () =>
              setBudget(budget.venueId, toMinor(total), Math.round(share * 100)),
            )
          }
        >
          {copy.save}
        </button>
      </div>

      {/* Moving money between the two pools is a different act from resizing the
          budget, and it is a different endpoint: two compensating movements in
          one transaction, so `base − spent − reserved` still exhausts both sides
          afterwards. Only what is *available* moves — reserved money belongs to
          somebody who has already qualified for it. */}
      <div className="pd-panel-head pd-move-head">
        <span className="console-label">{copy.moveTitle}</span>
      </div>
      {hint && (
        <p className="pd-fine">
          {fill(copy.hint, {
            from: poolName(hint.from),
            to: poolName(hint.to),
            amount: money(minorToEuro(hint.suggested, budget.currency), 'exact'),
          })}
        </p>
      )}
      <div className="pd-inline-form">
        <div className="pd-seg">
          {(['loyalty', 'voucher'] as const).map((which) => (
            <button
              key={which}
              type="button"
              data-on={from === which ? 'true' : undefined}
              onClick={() => setFrom(which)}
            >
              {fill(copy.moveDir, {
                from: poolName(which),
                to: poolName(which === 'loyalty' ? 'voucher' : 'loyalty'),
              })}
            </button>
          ))}
        </div>
        {/* No label element: `NumberWell` carries the `aria-label`, and a
            `<label>` wrapping it would nest one inside the well’s own. */}
        <div className="field">
          <NumberWell
            value={amount}
            onChange={setAmount}
            unit={currency.symbol}
            label={copy.moveAmount}
            min={0}
          />
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={working || !(amount > 0)}
          onClick={() =>
            void run('move', copy.moved, () =>
              rebalanceBudget(budget.venueId, from, toMinor(amount)),
            )
          }
        >
          {copy.moveDo}
        </button>
      </div>
      <p className="pd-fine">{copy.moveNote}</p>
    </div>
  );
}

/**
 * One rung being edited, in the units the owner is typing in.
 *
 * `cap` is the reader's currency, and `existing` says whether the server has
 * seen this rung — a tier is keyed on `(venue_id, discount_pct)` rather than on
 * an id, so a new rung is simply a percentage it has not met before. That is
 * also why the duplicate check matters: two rows at 10% are not two tiers, they
 * are one tier written twice, and the second silently wins.
 */
interface LadderRow {
  existing: boolean;
  pct: number;
  points: number;
  cap: number;
}

/**
 * What points buy — and, now, what an owner can change about it.
 *
 * The ladder is the whole of the points economy from the venue's side: how deep
 * a discount is, what it costs in points, and the most it may ever take off one
 * bill. The third is what makes the second safe to be wrong — a median check
 * that doubles overnight still cannot produce a voucher larger than the cap the
 * owner set.
 *
 * Retiring rather than deleting, because `issued_vouchers` already points at
 * the row: a tier with history behind it is switched off (`active: false`) and
 * drops out of the ladder on the next read, since `vouchers.tiersFor` selects
 * the active ones. `PUT …/tiers` is an upsert keyed on the percentage, so what
 * is sent is what changes and a rung left out of the list is left alone.
 *
 * `units` is index-aligned with `budget.tiers` and comes from the caller
 * because it is `voucherModelFor`'s arithmetic — what one voucher at this tier
 * is expected to take off a bill, `min(check × pct, cap)`. Recomputing it here
 * would be the same figure derived twice, which is the thing this dashboard's
 * whole metrics module exists to prevent.
 */
function LadderEditor({
  budget,
  units,
  reload,
}: {
  budget: BudgetBody;
  units: number[];
  reload: () => void;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.acts;
  const vouchers = dashboard.vouchers;
  const currency = useCurrency();
  const money = useMoney();
  const num = useNum();
  const { busy, run } = useAction(reload);
  const [editing, setEditing] = useState(false);

  const asRows = useCallback(
    (): LadderRow[] =>
      budget.tiers.map((tier) => ({
        existing: true,
        pct: tier.discountPct,
        points: tier.pointsCost,
        cap: Math.round(minorToEuro(tier.maxDiscountMinor, budget.currency) * currency.rate),
      })),
    [budget.tiers, budget.currency, currency.rate],
  );
  const [rows, setRows] = useState<LadderRow[]>(asRows);

  const patch = (index: number, next: Partial<LadderRow>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...next } : row)));

  const asDraft = (row: LadderRow, active: boolean): TierDraft => ({
    discountPct: row.pct,
    pointsCost: row.points,
    maxDiscountMinor: euroToMinor(row.cap / currency.rate, budget.currency),
    active,
  });

  /* Three things the server would refuse, and one it would silently accept. The
     silent one is the duplicate: an upsert on the percentage means a second row
     at 10% overwrites the first, and nothing in the response says so. */
  const duplicate = new Set(rows.map((row) => row.pct)).size !== rows.length;
  const incomplete = rows.some((row) => !(row.pct > 0) || !(row.points > 0) || !(row.cap > 0));
  const working = busy !== null;

  return (
    <div className="pd-glass pd-panel" data-solid="true" data-reveal>
      <div className="pd-panel-head">
        <div>
          <span className="console-label">{vouchers.tiersTitle}</span>
          <p className="pd-fine">{vouchers.tiersLede}</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            /* Re-read the server's answer every time the panel opens, so an
               edit abandoned half-typed does not come back the next time. */
            setRows(asRows());
            setEditing((on) => !on);
          }}
        >
          {editing ? copy.ladderDone : copy.ladderEdit}
        </button>
      </div>

      {!editing ? (
        budget.tiers.length === 0 ? (
          <p className="pd-fine">{dashboard.empty[3].body}</p>
        ) : (
          <table className="pd-table">
            <thead>
              <tr>
                <th>{vouchers.columns[0]}</th>
                <th>{vouchers.columns[1]}</th>
                <th>{vouchers.buysTitle}</th>
              </tr>
            </thead>
            <tbody>
              {budget.tiers.map((tier, index) => (
                <tr key={tier.discountPct}>
                  <td>
                    <b>{fill(vouchers.tier, { n: String(tier.discountPct) })}</b>
                    {/* `copy.tierDetail` also states what share of the pool this
                        tier has spent, and no endpoint groups spend by tier — so
                        the sentence that needs both is replaced by the half that
                        is true. */}
                    <span className="pd-fine">
                      {fill(dashboard.unmeasured.tierUnit, {
                        unit: money(units[index] ?? 0, 'unit'),
                      })}
                    </span>
                  </td>
                  <td>{fill(vouchers.points, { n: num(tier.pointsCost) })}</td>
                  <td>{num(tier.estimatedRemaining)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        <>
          {/* `pd-rung` and not `pd-tier-row`: that name is already a six-column
              grid with a pointer cursor further down `site.css`, left behind by
              the seeded ladder this replaced. Grep before naming a class — the
              sheet has no scoping and three collisions have shipped bugs here
              already (root `CLAUDE.md`). */}
          {rows.map((row, index) => (
            <div className="pd-rung" key={`${row.pct}-${index}`}>
              <div className="field">
                <span className="field-label">{copy.tierPct}</span>
                <NumberWell
                  value={row.pct}
                  onChange={(next) => patch(index, { pct: Math.round(next) })}
                  unit={copy.pctUnit}
                  label={copy.tierPct}
                  min={1}
                />
              </div>
              <div className="field">
                <span className="field-label">{copy.tierPoints}</span>
                <NumberWell
                  value={row.points}
                  onChange={(next) => patch(index, { points: Math.round(next) })}
                  unit={vouchers.pointsUnit}
                  label={copy.tierPoints}
                  min={1}
                />
              </div>
              <div className="field">
                <span className="field-label">{copy.tierCap}</span>
                <NumberWell
                  value={row.cap}
                  onChange={(next) => patch(index, { cap: next })}
                  unit={currency.symbol}
                  label={copy.tierCap}
                  min={1}
                />
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={working}
                onClick={() => {
                  /* A rung the server has never seen is simply dropped from the
                     list. One it knows about is switched off, because a voucher
                     somebody is holding still points at that row. */
                  if (!row.existing) {
                    setRows((current) => current.filter((_, i) => i !== index));
                    return;
                  }
                  void run('retire', copy.tierRetired, () =>
                    setVoucherTiers(budget.venueId, [asDraft(row, false)]),
                  );
                }}
              >
                {copy.tierRetire}
              </button>
            </div>
          ))}

          {duplicate && (
            <p className="field-error" role="alert">
              {copy.tierDuplicate}
            </p>
          )}
          <p className="pd-fine">{vouchers.pointsOrder}</p>

          <div className="pd-inline-form">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() =>
                setRows((current) => [
                  ...current,
                  { existing: false, pct: 5, points: 100, cap: 10 },
                ])
              }
            >
              {copy.tierAdd}
            </button>
            <button
              type="button"
              className="btn btn-solid"
              disabled={working || duplicate || incomplete || rows.length === 0}
              onClick={() =>
                void run('tiers', copy.tiersSaved, async () => {
                  await setVoucherTiers(
                    budget.venueId,
                    rows.map((row) => asDraft(row, true)),
                  );
                  setEditing(false);
                })
              }
            >
              {copy.save}
            </button>
          </div>
        </>
      )}
      <p className="pd-fine">{vouchers.buysNote}</p>
    </div>
  );
}

/**
 * The voucher ladder and the pool behind it.
 *
 * The three figures at the top are still facts rather than fields — the average
 * transaction is the median of the venue's own confirmed scans and the pool is
 * `budget_movements` added up, and neither is a thing to type over. What *is*
 * typeable now lives in its own two panels below, because the difference
 * between "this is what your month looks like" and "this is what I am changing"
 * is worth a panel border.
 *
 * Take-up per tier — how many were issued and how many used — is not on this
 * response, so those columns are named as missing rather than zeroed.
 */
function Vouchers() {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.vouchers;
  const money = useMoney();

  const venueApi = usePartnerVenue();
  const venue = venueApi.state.status === 'ready' ? venueApi.state.data : null;
  const budgetApi = usePartnerBudget(venue?.id ?? null);
  const state = chain(venueApi, budgetApi);

  return (
    <Screen state={state} index={3}>
      {(budget) => {
        const toEuro = (minor: number) => minorToEuro(minor, budget.currency);
        const avgSpend = toEuro(budget.averageCheck.minor);
        const tiers: TierRow[] = budget.tiers.map((tier) => ({
          pct: tier.discountPct,
          points: tier.pointsCost,
          issued: 0,
          redeemed: 0,
          cap: toEuro(tier.maxDiscountMinor),
          remaining: tier.estimatedRemaining,
        }));
        const model = voucherModelFrom(
          budget.voucher,
          tiers,
          avgSpend,
          Math.max(0, ...tiers.map((t) => t.cap)),
        );
        const nothingYet = budget.voucher.base === 0 && tiers.length === 0;

        return (
          <div className="pd-stack">
            {/* Nothing set up yet says so *and* leaves the controls that fix it
                on the screen. The panel used to be the whole screen, with a
                button under it that raised `notWired`; an explanation with the
                remedy one panel below needs no button at all. */}
            {nothingYet && <Unmeasured index={3} />}

            <div className="pd-glass pd-panel" data-reveal>
              <div className="pd-panel-head">
                <span className="console-label">{copy.budgetTitle}</span>
                <span className="pd-chip">{budget.period}</span>
              </div>
              <p className="pd-fine">{copy.budgetLede}</p>

              <Bar
                label={copy.spent}
                value={toEuro(budget.voucher.spent)}
                of={toEuro(budget.voucher.base)}
                note={money(toEuro(budget.voucher.spent), 'exact')}
              />
              <Bar
                label={copy.held}
                value={toEuro(budget.voucher.reserved)}
                of={toEuro(budget.voucher.base)}
                note={money(toEuro(budget.voucher.reserved), 'exact')}
              />
              <Bar
                label={copy.free}
                value={Math.max(0, toEuro(budget.voucher.available))}
                of={toEuro(budget.voucher.base)}
                note={money(toEuro(budget.voucher.available), 'exact')}
              />

              {/* Facts, not fields. The median check is the venue's own trading
                  and the cap belongs to the ladder below, which is where it is
                  edited; only the total is typeable, and it is typeable in the
                  panel whose whole subject is changing it. */}
              <div className="pd-rows">
                <div>
                  <span>{copy.budgetLabel}</span>
                  <b>{money(toEuro(budget.total), 'exact')}</b>
                </div>
                <div>
                  <span>{copy.avgTitle}</span>
                  <b>{money(avgSpend, 'unit')}</b>
                </div>
                <div>
                  <span>{copy.maxTitle}</span>
                  <b>
                    {tiers.length === 0
                      ? '—'
                      : money(Math.max(...tiers.map((t) => t.cap)), 'unit')}
                  </b>
                </div>
              </div>
              <p className="pd-fine">{copy.avgNote}</p>
            </div>

            <BudgetEditor budget={budget} reload={budgetApi.reload} />

            <LadderEditor
              budget={budget}
              units={model.tiers.map((tier) => tier.unit)}
              reload={budgetApi.reload}
            />

            {/* Per-tier take-up: `issued_vouchers` has it, no partner endpoint
                returns it grouped by tier. Named rather than zeroed. */}
            <NoSource title={copy.mixTitle} />
          </div>
        );
      }}
    </Screen>
  );
}

/* ──────────────────────────────────────────────────────────── customers ── */

function Customers() {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.customers;
  const money = useMoney();
  const num = useNum();

  const venueApi = usePartnerVenue();
  const venue = venueApi.state.status === 'ready' ? venueApi.state.data : null;
  const analyticsApi = usePartnerAnalytics(venue?.id ?? null);
  const customersApi = usePartnerCustomers(venue?.id ?? null);
  const state = chain(venueApi, analyticsApi);

  const roster = customersApi.state.status === 'ready' ? customersApi.state.data : null;
  /* Off the venue row rather than off the budget. Reading it from `/budget`
     meant a screen that could reach `/analytics` and not `/budget` priced a
     Kraków café's spend in euros — the same number, at four times the value. */
  const currency = venue?.currency ?? 'EUR';

  return (
    <Screen state={state} index={4}>
      {(data) => {
        const toEuro = (minor: number) => minorToEuro(minor, currency);
        const heat = heatFromApi(data.heatmap.grid);
        const heatMax = Math.max(...heat.flat());
        const cost = data.costPerNewCustomer;

        return (
          <div className="pd-stack">
            {/* What a new customer costs. One figure, computed once — the
                server sums the subscription, both pools and the deal discounts
                and divides by the new customers it counted. It is
                cohort-suppressed, because "we spent 300 zł to win 2 customers"
                is a fact about two people. */}
            <div className="pd-glass pd-panel" data-ink="paper" data-reveal>
              <span className="console-label">{copy.costKicker}</span>
              {cost.costPerNewCustomerMinor.suppressed ? (
                <p className="pd-fine">{dashboard.unmeasured.withheld}</p>
              ) : (
                <>
                  <p className="pd-counted">
                    <b>{money(toEuro(cost.costPerNewCustomerMinor.value ?? 0), 'unit')}</b>
                    <span>{fill(copy.costUnit, { month: cost.period })}</span>
                  </p>
                  <div className="pd-rows">
                    {copy.costBreakdown.map((label, index) => (
                      <div key={label}>
                        <span>{label}</span>
                        <b>
                          {money(
                            toEuro(
                              [
                                cost.breakdown.subscription,
                                cost.breakdown.loyalty,
                                cost.breakdown.vouchers,
                                cost.breakdown.deals,
                              ][index] ?? 0,
                            ),
                            'exact',
                          )}
                        </b>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Do they come back — real monthly cohorts, each suppressed on its
                own size. The seeded version had four invented cohorts. */}
            <div className="pd-glass pd-panel" data-reveal>
              <div className="pd-panel-head">
                <div>
                  <span className="console-label">{copy.backTitle}</span>
                  <p className="pd-fine">{copy.backLede}</p>
                </div>
              </div>
              {data.cohorts === undefined ? (
                <p className="pd-fine">{dashboard.unmeasured.planLocked}</p>
              ) : data.cohorts.length === 0 ? (
                <p className="pd-fine">{dashboard.empty[4].body}</p>
              ) : (
                data.cohorts.map((cohort) => (
                  <Bar
                    key={cohort.cohort}
                    label={cohort.cohort}
                    value={cohort.returned.value ?? 0}
                    of={1}
                    note={
                      cohort.returned.suppressed
                        ? '—'
                        : `${Math.round((cohort.returned.value ?? 0) * 100)}%`
                    }
                  />
                ))
              )}
            </div>

            {/* When they come in. The server's own grid, in venue-local hours,
                and its own quietest *open* hour — which the seeded generator
                could never do, because 04:00 on a Monday is a closed café and
                not a hole in the trade. */}
            <div className="pd-glass pd-panel" data-solid="true" data-reveal>
              <div className="pd-panel-head">
                <div>
                  <span className="console-label">{copy.whenTitle}</span>
                  <p className="pd-fine">{copy.whenLede}</p>
                </div>
              </div>
              {heatMax === 0 ? (
                <p className="pd-fine">{dashboard.empty[4].body}</p>
              ) : (
                <div className="pd-heat">
                  {heat.map((row, day) => (
                    <div className="pd-heat-row" key={copy.days[day]}>
                      <span>{copy.days[day]}</span>
                      {row.map((value, hour) => (
                        <i
                          key={HEAT_HOURS[hour]}
                          style={{ opacity: 0.08 + (value / heatMax) * 0.92 }}
                          title={fill(copy.heatCell, { n: String(value) })}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {data.heatmap.quietest && data.heatmap.total > 0 && (
                <p className="pd-fine">
                  {copy.days[data.heatmap.quietest.weekday]}{' '}
                  {String(data.heatmap.quietest.hour).padStart(2, '0')}:00 ·{' '}
                  {num(data.heatmap.quietest.visits)}
                </p>
              )}
            </div>

            {/* Language mix — the only demographic signal collected, and the
                reason it is collectable at all is that it is a preference the
                customer chose rather than an origin. Suppressed below the
                cohort floor, wholesale. */}
            <div className="pd-glass pd-panel" data-reveal>
              <div className="pd-panel-head">
                <div>
                  <span className="console-label">{copy.readTitle}</span>
                  <p className="pd-fine">{copy.readLede}</p>
                </div>
              </div>
              {data.languageMix.suppressed ? (
                <p className="pd-fine">{dashboard.unmeasured.withheld}</p>
              ) : data.languageMix.rows.length === 0 ? (
                <p className="pd-fine">{dashboard.empty[4].body}</p>
              ) : (
                data.languageMix.rows.map((row) => (
                  <Bar
                    key={row.language}
                    label={row.language.toUpperCase()}
                    value={row.share}
                    of={1}
                    note={`${Math.round(row.share * 100)}%`}
                  />
                ))
              )}
              <p className="pd-fine">{copy.privacy}</p>
            </div>

            {/* Where the money works. Three tools, three different outcomes —
                normalising them into one "outcome" would produce a
                comparable-looking number that compares nothing. */}
            <div className="pd-glass pd-panel" data-reveal>
              <div className="pd-panel-head">
                <div>
                  <span className="console-label">{copy.roiTitle}</span>
                  <p className="pd-fine">{fill(copy.roiLede, { month: cost.period })}</p>
                </div>
              </div>
              {data.roi === undefined ? (
                <p className="pd-fine">{dashboard.unmeasured.planLocked}</p>
              ) : (
                <div className="pd-rows">
                  {data.roi.map((row, index) => (
                    <div key={row.feature}>
                      <span>{copy.roiRows[index]}</span>
                      <b>
                        {fill(copy.roiLine, {
                          cost: money(toEuro(row.spendMinor), 'exact'),
                          n: num(row.outcome),
                          unit: copy.roiUnits[index],
                        })}
                      </b>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* How you compare. Withheld until enough venues are in the group —
                two thresholds, not one: the min-cohort protects customers, the
                min-venues protects businesses, because with four venues in a
                category a benchmark plus your own number is a calculator away
                from a competitor's. */}
            <div className="pd-glass pd-panel" data-reveal>
              <div className="pd-panel-head">
                <span className="console-label">{copy.compareTitle}</span>
              </div>
              {data.benchmarks === undefined || data.benchmarks.length === 0 ? (
                <p className="pd-fine">{dashboard.unmeasured.withheld}</p>
              ) : (
                <div className="pd-rows">
                  {data.benchmarks.map((row) => (
                    <div key={row.metric}>
                      <span>{row.metric}</span>
                      <b>{row.value.toFixed(2)}</b>
                    </div>
                  ))}
                </div>
              )}
              <p className="pd-fine">{copy.compareNote}</p>
            </div>

            {/* The roster. Gated twice — by the plan's `identified_profiles`
                entitlement and by an unrevoked sharing consent per person — and
                that gap is the whole reason the count beside it is smaller than
                the customer total. Sixteen invented people used to be here. */}
            <div className="pd-glass pd-panel" data-solid="true" data-reveal>
              <div className="pd-panel-head">
                <div>
                  <span className="console-label">{copy.rosterTitle}</span>
                  <p className="pd-fine">{copy.rosterIntro}</p>
                </div>
                {roster && (
                  <span className="pd-chip">
                    {fill(copy.rosterCount, { n: String(roster.sharedCustomers) })}
                  </span>
                )}
              </div>
              {roster === null ? (
                <p className="pd-fine">
                  {customersApi.state.status === 'loading'
                    ? dashboard.unmeasured.asking
                    : customersApi.state.status === 'error' &&
                        customersApi.state.error.status === 403
                      ? dashboard.unmeasured.planLocked
                      : dashboard.unmeasured.serverSilent}
                </p>
              ) : roster.rows.length === 0 ? (
                <p className="pd-fine">{copy.privacy}</p>
              ) : (
                <table className="pd-table">
                  <thead>
                    <tr>
                      {copy.rosterColumns.map((label) => (
                        <th key={label}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {roster.rows.map((row) => (
                      <tr key={row.userId}>
                        <td>{row.name}</td>
                        <td>{money(toEuro(row.spendMinor), 'exact')}</td>
                        <td>{num(row.visits)}</td>
                        <td>
                          {row.daysSince === 0
                            ? copy.today
                            : row.daysSince === 1
                              ? copy.dayAgo
                              : fill(copy.daysAgo, { n: String(row.daysSince) })}
                        </td>
                        <td>{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        );
      }}
    </Screen>
  );
}

/* ──────────────────────────────────────────────────────────────── scans ── */

/**
 * The queue at the counter.
 *
 * §11.1, and the one screen on this dashboard where the owner is standing at a
 * till rather than reading a report: a customer has scanned, the gate has opened
 * a transaction, and nothing of value exists until somebody presses confirm
 * (§3.1). This is that press, and `POST /v1/gate/transactions/:id/confirm` is
 * where every point, stamp and discount in the whole product is actually
 * granted.
 *
 * Three things it has to get right:
 *
 * - **`amount_minor` is null until step three, and that is not a missing
 *   figure.** It is the state where a customer has scanned and nobody has
 *   entered the bill. Drawing it as 0 would say they bought nothing, and
 *   confirming at that point is a real thing to do — an earn with no amount is
 *   how a venue with no minimum spend works.
 * - **The press carries an idempotency key**, because a double press on a slow
 *   connection must not pay twice. The server settles that by storing the first
 *   response against the key; the disabled button is a courtesy, not the rule.
 * - **The queue is re-read, not patched.** What the confirm *granted* is the
 *   receipt's business, and a row struck off locally would leave the counts in
 *   the tiles above disagreeing with the list below them.
 */
function Queue({ venueId, currency }: { venueId: string | null; currency: string }) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.acts;
  const pendingApi = usePartnerPending(venueId);
  const { busy, run } = useAction(pendingApi.reload);

  const rows = pendingApi.state.status === 'ready' ? pendingApi.state.data : null;

  return (
    <div className="pd-glass pd-panel" data-solid="true" data-reveal>
      <div className="pd-panel-head">
        <div>
          <span className="console-label">{copy.queueTitle}</span>
          <p className="pd-fine">{copy.queueLede}</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={pendingApi.reload}>
          {copy.refresh}
        </button>
      </div>

      {rows === null ? (
        <p className="pd-fine">
          {pendingApi.state.status === 'loading'
            ? dashboard.unmeasured.asking
            : dashboard.unmeasured.serverSilent}
        </p>
      ) : rows.length === 0 ? (
        <p className="pd-fine">{copy.queueEmpty}</p>
      ) : (
        rows.map((row) => (
          <ScanRow
            key={row.id}
            row={row}
            currency={currency}
            busy={busy !== null}
            run={run}
          />
        ))
      )}
    </div>
  );
}

/**
 * One scan waiting at the till, and the bill that has to be on it first.
 *
 * The gate has four steps and this row is three of them. `confirm` refuses with
 * `invalid_state: no amount has been entered` until step three has happened, so
 * a Confirm button on its own is a button that fails every time — which is what
 * the first version of this panel was, and the server said so.
 *
 * Who fills the bill in is `venues.amount_entry`, carried on the transaction:
 *
 * - **`cashier`**, the default — the owner types it here, and Confirm sends the
 *   amount and then commits. Two calls, one press, because they are one act at
 *   a counter: the till says 24 złoty and the phone is being handed back.
 * - **`customer`** — the field is not offered at all, and the row says what it
 *   is waiting for. Drawing a field the server would refuse the owner's input
 *   from is worse than drawing nothing.
 *
 * The well holds the **reader's** currency like every other typed amount on this
 * dashboard, and crosses to the venue's minor units at the request.
 */
function ScanRow({
  row,
  currency,
  busy,
  run,
}: {
  row: PendingScan;
  /** The venue's currency code — what `amount_minor` is counted in. */
  currency: string;
  busy: boolean;
  run: (key: string, done: string, work: () => Promise<unknown>) => Promise<void>;
}) {
  const copy = useCopy().dashboard.acts;
  const money = useMoney();
  const reader = useCurrency();
  const [bill, setBill] = useState(0);

  const known = row.amount_minor !== null;
  const mine = row.amount_entered_by !== 'customer';
  /* Nothing to confirm until there is a bill — unless the venue is waiting on
     the customer, in which case there is nothing this screen can do either. */
  const ready = known || (mine && bill > 0);

  return (
    <div className="pd-run-row">
      <span className="pd-kind" data-kind="deal">
        {copy.intents[row.intent]}
      </span>
      <div className="pd-run-name">
        {known ? (
          <b>{money(minorToEuro(row.amount_minor ?? 0, currency), 'exact')}</b>
        ) : mine ? (
          <div className="field">
            <NumberWell
              value={bill}
              onChange={setBill}
              unit={reader.symbol}
              label={copy.billLabel}
              min={0}
            />
          </div>
        ) : (
          <b>{copy.waitingCustomer}</b>
        )}
        <span className="pd-fine">
          {fill(copy.openedAt, { at: row.opened_at.slice(11, 16) })}
        </span>
      </div>
      <span className="pd-row-acts">
        <button
          type="button"
          className="btn btn-solid"
          disabled={busy || !ready}
          onClick={() =>
            void run(row.id, copy.confirmed, async () => {
              if (!known) {
                await enterScanAmount(
                  row.id,
                  euroToMinor(bill / reader.rate, currency),
                );
              }
              await confirmScan(row.id);
            })
          }
        >
          {copy.confirm}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() =>
            void run(row.id, copy.turnedAway, () => cancelScan(row.id, 'partner_declined'))
          }
        >
          {copy.turnAway}
        </button>
      </span>
    </div>
  );
}

/**
 * Today at the counter.
 *
 * Forty-eight receipts used to be generated here from the row index — names
 * from a list of sixteen, a spend, a campaign, a receipt code — and paged twelve
 * at a time. `analytics.today` counts the real thing: visits, distinct
 * customers, sales and the transactions still waiting to be confirmed.
 *
 * There is still no endpoint that lists a venue's *completed* scans, so the
 * receipt log stays absent rather than manufactured. What was wrong about the
 * old note is that it said so about the whole screen: `GET /v1/venues/:id/pending`
 * has the transactions that have not been confirmed yet, which is the half a
 * person standing at the till actually needs — and the count in `today` was
 * being shown with no way to act on any of it.
 */
function Scans() {
  const dashboard = useCopy().dashboard;
  const money = useMoney();
  const num = useNum();

  const venueApi = usePartnerVenue();
  const venue = venueApi.state.status === 'ready' ? venueApi.state.data : null;
  const venueId = venue?.id ?? null;
  const todayApi = usePartnerToday(venueId);
  const state = chain(venueApi, todayApi);

  const currency = venue?.currency ?? 'EUR';

  return (
    <Screen state={state} index={6}>
      {(today) => {
        const visits = metricValue(today.visits) ?? 0;
        const quiet = visits === 0 && today.pendingConfirmations === 0;

        return (
          <div className="pd-stack">
            {/* Nothing today is a fact rather than a failure, and the queue
                stays underneath it: a scan can arrive while the screen is open,
                and the panel that would show it must not be the panel that
                disappears when there is nothing in it yet. */}
            {quiet && <Unmeasured index={6} />}

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

            <Queue venueId={venueId} currency={currency} />

            {/* The receipt log: `transactions` holds every confirmed scan, and
                no partner endpoint lists them. Named rather than invented. */}
            <NoSource title={dashboard.screens[6].name} />
          </div>
        );
      }}
    </Screen>
  );
}

/* ───────────────────────────────────────────────────────────────── index ── */

const SCREENS = [Overview, Deals, Campaigns, Vouchers, Customers, Assistant, Scans];

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
