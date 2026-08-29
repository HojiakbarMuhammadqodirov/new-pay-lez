import { useMemo, useState } from 'react';
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
  chain,
  isNoSession,
  minorToEuro,
  usePartnerAnalytics,
  usePartnerBudget,
  usePartnerCampaigns,
  usePartnerCustomers,
  usePartnerDeals,
  usePartnerOverview,
  usePartnerToday,
  usePartnerVenueId,
  type Metric,
} from './api/partner';
import { useReach } from './api/reach';
import type { ApiError } from './api/client';
import type { ApiState } from './api/useApi';
import { Assistant } from './dashboardAssistant';
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
function Unmeasured({ index, error }: { index: number; error?: ApiError }) {
  const dashboard = useCopy().dashboard;
  const { openDrawer, toast } = useDashboard();
  const copy = dashboard.empty[index];

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
      <button
        type="button"
        className="btn btn-solid"
        onClick={() => (index === 1 ? openDrawer('deal') : index === 2 ? openDrawer('campaign') : toast(dashboard.notWired))}
      >
        {copy.action}
      </button>
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
                    {fill(copy.proof, {
                      after: (analytics.repeatMultiple.value ?? 0).toFixed(1),
                      before: '1.0',
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

  const venue = usePartnerVenueId();
  const venueId = venue.state.status === 'ready' ? venue.state.data : null;
  const dealsApi = usePartnerDeals(venueId);
  const budgetApi = usePartnerBudget(venueId);
  const state = chain(venue, dealsApi);

  const currency =
    budgetApi.state.status === 'ready' ? budgetApi.state.data.currency : 'EUR';

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
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((deal) => (
                      <tr key={deal.id}>
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
                      </tr>
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

function Campaigns() {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.campaigns;
  const money = useMoney();
  const num = useNum();

  const venue = usePartnerVenueId();
  const venueId = venue.state.status === 'ready' ? venue.state.data : null;
  const campaignsApi = usePartnerCampaigns(venueId);
  const budgetApi = usePartnerBudget(venueId);
  const state = chain(venue, campaignsApi);

  const budget = budgetApi.state.status === 'ready' ? budgetApi.state.data : null;

  return (
    <Screen state={state} index={2}>
      {(rows) => {
        const toEuro = (minor: number) => minorToEuro(minor, budget?.currency ?? 'EUR');
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
 * The voucher ladder and the pool behind it.
 *
 * The prototype made the budget, the average transaction and the per-voucher
 * cap into three editable fields, and recomputed the pool from them on this
 * device — which was honest while there was no server, because the whole pool
 * was invented anyway. There is a server now, and nothing here writes to it, so
 * the rule in `CLAUDE.md` applies in the other direction: **a figure the screen
 * cannot honestly make editable is shown as a fact rather than a field.** All
 * three are read off `GET /v1/partner/venues/:id/budget`.
 *
 * Take-up per tier — how many were issued and how many used — is *not* on that
 * response, so the "given out" and "used" columns are gone rather than zeroed.
 * What the ladder does carry is the server's own `estimatedRemaining`: how many
 * more of this tier the remaining pool could fund, explicitly an estimate and
 * not a cap.
 */
function Vouchers() {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.vouchers;
  const money = useMoney();
  const num = useNum();

  const venue = usePartnerVenueId();
  const venueId = venue.state.status === 'ready' ? venue.state.data : null;
  const budgetApi = usePartnerBudget(venueId);
  const state = chain(venue, budgetApi);

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

        if (budget.voucher.base === 0 && tiers.length === 0) {
          return (
            <div className="pd-stack">
              <Unmeasured index={3} />
            </div>
          );
        }

        return (
          <div className="pd-stack">
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

              {/* Facts, not fields. Nothing on this screen writes, and the
                  three inputs the prototype offered here are all things the
                  server owns. */}
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

            <div className="pd-glass pd-panel" data-solid="true" data-reveal>
              <div className="pd-panel-head">
                <span className="console-label">{copy.tiersTitle}</span>
                <p className="pd-fine">{copy.tiersLede}</p>
              </div>
              {tiers.length === 0 ? (
                <p className="pd-fine">{dashboard.empty[3].body}</p>
              ) : (
                <table className="pd-table">
                  <thead>
                    <tr>
                      <th>{copy.columns[0]}</th>
                      <th>{copy.columns[1]}</th>
                      <th>{copy.buysTitle}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.tiers.map((tier) => (
                      <tr key={tier.pct}>
                        <td>
                          <b>{fill(copy.tier, { n: String(tier.pct) })}</b>
                          {/* `copy.tierDetail` also states what share of the
                              pool this tier has spent, and no endpoint groups
                              spend by tier — so the sentence that needs both is
                              replaced by the half that is true. */}
                          <span className="pd-fine">
                            {fill(dashboard.unmeasured.tierUnit, { unit: money(tier.unit, 'unit') })}
                          </span>
                        </td>
                        <td>{fill(copy.points, { n: num(tier.points) })}</td>
                        <td>{num(tier.remaining)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="pd-fine">{copy.buysNote}</p>
            </div>

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

  const venue = usePartnerVenueId();
  const venueId = venue.state.status === 'ready' ? venue.state.data : null;
  const analyticsApi = usePartnerAnalytics(venueId);
  const customersApi = usePartnerCustomers(venueId);
  const budgetApi = usePartnerBudget(venueId);
  const state = chain(venue, analyticsApi);

  const roster = customersApi.state.status === 'ready' ? customersApi.state.data : null;
  const currency = budgetApi.state.status === 'ready' ? budgetApi.state.data.currency : 'EUR';

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
 * Today at the counter.
 *
 * Forty-eight receipts used to be generated here from the row index — names
 * from a list of sixteen, a spend, a campaign, a receipt code — and paged
 * twelve at a time. `analytics.today` counts the real thing: visits, distinct
 * customers, sales and the transactions still waiting to be confirmed. There is
 * no endpoint that *lists* a venue's scans, so the counts are shown and the log
 * is named as missing rather than manufactured.
 */
function Scans() {
  const dashboard = useCopy().dashboard;
  const money = useMoney();
  const num = useNum();

  const venue = usePartnerVenueId();
  const venueId = venue.state.status === 'ready' ? venue.state.data : null;
  const todayApi = usePartnerToday(venueId);
  const budgetApi = usePartnerBudget(venueId);
  const state = chain(venue, todayApi);

  const currency = budgetApi.state.status === 'ready' ? budgetApi.state.data.currency : 'EUR';

  return (
    <Screen state={state} index={6}>
      {(today) => {
        const visits = metricValue(today.visits) ?? 0;
        if (visits === 0 && today.pendingConfirmations === 0) {
          return (
            <div className="pd-stack">
              <Unmeasured index={6} />
            </div>
          );
        }

        return (
          <div className="pd-stack">
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
