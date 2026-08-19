import { useMemo, useState } from 'react';
import { Icon } from './icons';
import { useCopy, useCurrency, useMoney } from './i18n/context';
import { fill, group as groupDigits } from './i18n/currency';
import {
  AVG_SPEND,
  HEAT_HOURS,
  PD_AUDIENCES,
  PD_CAMPAIGN_MODEL,
  PD_CAMPAIGNS,
  PD_CLAIM_RATE,
  PD_COST_ROWS,
  PD_COST_TOTAL,
  PD_CUSTOMERS,
  PD_DEALS,
  PD_HEAT,
  PD_HEAT_MAX,
  PD_MAX_PER_VOUCHER,
  PD_NEAR,
  PD_NOTIFY_QUOTA,
  PD_PER_NEW,
  PD_REMIND,
  PD_ROI,
  PD_ROI_ROWS,
  PD_ROSTER,
  PD_SCAN_NAMES,
  PD_SCAN_PAGE,
  PD_SCAN_TOTAL,
  PD_SCANS,
  PD_SERIES,
  PD_TOTALS,
  PD_VOUCHER_MODEL,
  dealNotify,
  polyarea,
  polyline,
  type PartnerDeal,
  type RosterEntry,
} from './partnerMetrics';
import { Assistant } from './dashboardAssistant';
import { useDashboard } from './dashboardShell';

/**
 * The seven dashboard screens that are not the profile form.
 *
 * This is `b2b/Paylez Partner Dashboard v2.dc.html` rebuilt — the same screens,
 * the same panels in the same order, the same sentences, and the same figures,
 * which come from `partnerMetrics.ts` running that file's own arithmetic on that
 * file's own seeds. What is *not* carried over is its palette: the prototype is
 * ink-on-bone with a mint accent and no theme, and every colour here comes from
 * `site.css` instead, which is what buys the dark theme, five languages and the
 * reader's own currency.
 *
 * **Glass is the surface.** Every panel is `.pd-glass` over the aurora on
 * `.pd-app` — the prototype's white cards on a bone page, restated as sheets
 * with the page showing through. Two things follow and both are load-bearing:
 * the sheet opacity is one token (`--pd-glass`, set by the worst case, which is
 * a paragraph over the brightest part of the wash and not a card over an empty
 * corner), and a panel that carries dense numbers — the tables, the heat map —
 * takes `data-solid` and drops the blur, because tabular figures at 0.78rem over
 * a moving gradient is exactly the reading the glass rule exists to protect.
 *
 * Charts are divs and inline SVG paths, as everywhere else on this site. A bar
 * is a width, a column is a height, a line is a normalised `d` string; that is
 * the whole technique, and it buys theme tokens and translation where a canvas
 * or a screenshot would buy neither.
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
 * The same separator, for `[data-count]`.
 *
 * The count-up rewrites `textContent` every frame, so it takes the separator as
 * an attribute rather than a formatted string. It has to be the *same* one
 * `useNum` uses or the headline and the tile beside it break their thousands
 * differently — which is exactly what happened when this was a hardcoded space.
 */
function useGroup() {
  return useCurrency().group;
}

/** Signed, never coloured — one accent means a fall cannot be red. */
function Delta({ value, note }: { value: number; note: string }) {
  return (
    <span className="pd-delta" data-dir={value >= 0 ? 'up' : 'down'}>
      <b>
        {value >= 0 ? '↑' : '↓'} {Math.abs(value)}%
      </b>
      <i>{note}</i>
    </span>
  );
}

/** A labelled proportion bar — the workhorse of four of these screens. */
function Bar({
  label,
  value,
  of,
  note,
  muted,
}: {
  label: string;
  value: number;
  of: number;
  note?: string;
  muted?: boolean;
}) {
  return (
    <div className="pd-bar-row">
      <span className="pd-bar-label">{label}</span>
      <span className="pd-bar-track">
        <i
          data-muted={muted ? 'true' : undefined}
          style={{ width: `${of > 0 ? Math.min(100, (value / of) * 100) : 0}%` }}
        />
      </span>
      <b>{note ?? value}</b>
    </div>
  );
}

/**
 * A seven-day trend, drawn in a 100 × 100 box and stretched to the cell.
 *
 * `preserveAspectRatio="none"` is what makes one normalised path fit any width;
 * the stroke is kept at its authored weight by `vector-effect` in `site.css`,
 * without which a path squashed into a 76 × 30 cell draws a wedge.
 */
function Spark({ values }: { values: number[] }) {
  const [line, area] = useMemo(() => [polyline(values), polyarea(values)], [values]);
  if (!line) return null;
  return (
    <svg className="pd-spark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <path className="pd-spark-fill" d={area} />
      <path className="pd-spark-line" d={line} />
    </svg>
  );
}

/** The pill every state in the product wears — deal, campaign, scan. */
function State({ state, label }: { state: string; label: string }) {
  return (
    <span className="pd-state" data-state={state}>
      {label}
    </span>
  );
}

/* ───────────────────────────────────────────────────────────── overview ── */

function Overview() {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.overview;
  const money = useMoney();
  const num = useNum();
  const digitGroup = useGroup();

  const campaigns = PD_CAMPAIGN_MODEL;
  const vouchers = PD_VOUCHER_MODEL;

  /* The four tiles' figures and their sparklines. The last has no delta: it is
     a running count for the month rather than a comparison, and inventing a
     previous month to compare it against is the one thing this screen must not
     do — it is the screen that explains what it is willing to claim. */
  const tiles = [
    { value: PD_TOTALS.visits, delta: 12.4, series: PD_SERIES.visits.slice(-14) },
    {
      value: PD_TOTALS.claims,
      delta: 8.1,
      series: PD_SERIES.visits.slice(-14).map((v) => Math.round(v * 0.4598)),
    },
    { value: PD_TOTALS.redeemed, delta: -3.6, series: PD_SERIES.redeemed.slice(-14) },
    {
      value: campaigns.used,
      delta: null,
      series: PD_SERIES.visits.slice(-14).map((v) => Math.round(v * 0.07)),
    },
  ];

  const support = [
    num(PD_TOTALS.visits),
    money(AVG_SPEND, 'unit'),
    num(PD_TOTALS.newCustomers),
  ];

  /* The three deals customers can see today, plus the top campaign and the
     voucher tiers — which is what "running right now" means: everything with a
     customer-facing surface, not everything in the database. */
  const live = PD_DEALS.filter((deal) => deal.state === 'live');

  return (
    <div className="pd-stack">
      {campaigns.tight && (
        <div className="pd-glass pd-alert" data-reveal>
          <Icon name="arrow" size={18} />
          <p>
            {fill(copy.budgetAlert, {
              month: dashboard.month,
              amount: money(Math.max(0, vouchers.available), 'exact'),
            })}
          </p>
          <button type="button" className="btn btn-solid" disabled title={dashboard.notWired}>
            {copy.budgetAction}
          </button>
        </div>
      )}

      {/* The headline panel. Three claims at three strengths, in descending
          order of how much we can stand behind them: counted, estimated, and
          the subset we would defend. Stacking them is the design — a dashboard
          that shows only the estimate is a brochure. */}
      <div className="pd-glass pd-hero" data-reveal>
        <div className="pd-hero-main">
          <span className="console-label">
            {fill(copy.kicker, { range: dashboard.rangeLabel })}
          </span>

          <span className="pd-hero-eyebrow">{copy.countedLabel}</span>
          <p className="pd-counted">
            <b data-count={PD_TOTALS.visits} data-group={digitGroup}>
              0
            </b>
            <span>{copy.counted}</span>
          </p>
          <p className="pd-fine pd-counted-new">
            {fill(copy.countedNew, { n: num(PD_TOTALS.newCustomers) })}
          </p>

          <div className="pd-estimate">
            <span className="pd-tag">{copy.estimateTag}</span>
            <b>{fill(copy.estimate, { amount: money(PD_TOTALS.estimate, 'soft') })}</b>
            <p className="pd-fine">
              {fill(copy.estimateNote, { avg: money(AVG_SPEND, 'unit') })}
            </p>
          </div>

          <div className="pd-claim">
            <span className="console-label">{copy.claimTitle}</span>
            <b>
              {fill(copy.claim, {
                visits: num(PD_TOTALS.attributed),
                amount: money(PD_TOTALS.attributedMoney, 'soft'),
              })}
            </b>
            <p className="pd-fine">{copy.claimNote}</p>
          </div>
        </div>

        <div className="pd-support">
          {copy.support.map((row, index) => (
            <div key={row.label}>
              <span>{row.label}</span>
              <b>{support[index]}</b>
              <i>{row.note}</i>
            </div>
          ))}
        </div>
      </div>

      {/* What it cost, and the verdict. The verdict sentence is picked by the
          arithmetic, not written down — a month where Paylez cost more than it
          can be shown to have returned has to say so. */}
      <div className="pd-glass pd-panel" data-reveal>
        <div className="pd-panel-head">
          <span className="console-label">{copy.costTitle}</span>
          <span className="pd-chip">{dashboard.month}</span>
        </div>
        <div className="pd-rows">
          {copy.costRows.map((label, index) => (
            <div key={label}>
              <span>{label}</span>
              <b>{money(PD_COST_ROWS[index], 'exact')}</b>
            </div>
          ))}
          <div data-total="true">
            <span>{copy.costTotal}</span>
            <b>{money(PD_COST_TOTAL, 'exact')}</b>
          </div>
        </div>

        <div className="pd-return">
          <span>{copy.returnLabel}</span>
          <b>{money(PD_TOTALS.attributedMoney, 'soft')}</b>
        </div>
        <p className="pd-verdict" data-good={PD_ROI >= 1 ? 'true' : 'false'}>
          {PD_ROI >= 1
            ? fill(copy.roiGood, {
                cost: money(PD_COST_TOTAL, 'exact'),
                month: dashboard.month,
                revenue: money(PD_TOTALS.attributedMoney, 'soft'),
                n: PD_ROI.toFixed(1),
              })
            : fill(copy.roiBad, {
                cost: money(PD_COST_TOTAL, 'exact'),
                month: dashboard.month,
                revenue: money(PD_TOTALS.attributedMoney, 'soft'),
                gap: money(PD_COST_TOTAL - PD_TOTALS.attributedMoney, 'exact'),
              })}
        </p>
      </div>

      <div className="pd-tiles">
        {tiles.map((tile, index) => (
          <div className="pd-glass pd-tile" key={copy.tiles[index]} data-reveal>
            <span>{copy.tiles[index]}</span>
            <div className="pd-tile-body">
              <div>
                <b data-count={tile.value} data-group={digitGroup}>
                  0
                </b>
                {tile.delta == null ? (
                  <span className="pd-delta" data-dir="flat">
                    <i>{fill(copy.inMonth, { month: dashboard.month })}</i>
                  </span>
                ) : (
                  <Delta value={tile.delta} note={copy.since} />
                )}
              </div>
              <Spark values={tile.series} />
            </div>
          </div>
        ))}
      </div>

      {/* The one claim on this screen that is counted rather than modelled, and
          the reason it gets a panel to itself. */}
      <div className="pd-glass pd-panel pd-proof-panel" data-reveal>
        <div>
          <span className="console-label">{copy.proofTitle}</span>
          <p className="pd-proof">
            {fill(copy.proof, { after: '2.4', before: '1.5' })}
          </p>
          <p className="pd-fine">{copy.proofNote}</p>
        </div>
        <div className="pd-columns">
          <span>
            <i style={{ height: `${(1.5 / 2.4) * 100}%` }} />
            <b>1.5</b>
            {copy.before}
          </span>
          <span data-on="true">
            <i style={{ height: '100%' }} />
            <b>2.4</b>
            {copy.now}
          </span>
        </div>
      </div>

      <Chart />

      <div className="pd-glass pd-panel pd-holding" data-reveal>
        <div>
          <span className="console-label">{copy.holdingTitle}</span>
          <p className="pd-proof">
            {fill(copy.holding, {
              rewards: num(campaigns.holding),
              vouchers: num(vouchers.held),
              amount: money(campaigns.aside + vouchers.reserved, 'exact'),
            })}
          </p>
          <p className="pd-fine">{copy.holdingNote}</p>
        </div>
        <button type="button" className="btn btn-solid" disabled title={dashboard.notWired}>
          <Icon name="coin" size={16} />
          {dashboard.words.remind}
        </button>
      </div>

      {/* Three things the month noticed, each with the change already named.
          The third counts itself out of the campaign model rather than quoting
          a number, so it cannot go stale. */}
      <div className="pd-glass pd-notices" data-reveal>
        <div className="pd-notice-head">
          <i aria-hidden />
          <span className="console-label">{copy.noticed}</span>
        </div>
        {copy.insights.map((insight, index) => (
          <div className="pd-notice" key={insight.action}>
            <div>
              <p>
                {index === 2
                  ? fill(insight.text, {
                      n: num(campaigns.holding),
                      amount: money(campaigns.aside, 'exact'),
                    })
                  : insight.text}
              </p>
              <p className="pd-fine">{insight.detail}</p>
            </div>
            <div className="pd-notice-acts">
              <button
                type="button"
                className="btn btn-solid"
                disabled
                title={dashboard.notWired}
              >
                {insight.action}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled
                title={dashboard.notWired}
              >
                {dashboard.words.ask}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Everything a customer could walk in and use today. */}
      <div className="pd-glass pd-running" data-reveal>
        <div className="pd-panel-head">
          <div>
            <span className="console-label">{copy.runningTitle}</span>
            <p className="pd-fine">{copy.runningNote}</p>
          </div>
          <span className="pd-chip" data-warn={PD_NOTIFY_QUOTA.left === 0 ? 'true' : undefined}>
            <Icon name="coin" size={13} />
            {PD_NOTIFY_QUOTA.left === 0
              ? copy.quotaOut
              : fill(copy.quota, {
                  n: String(PD_NOTIFY_QUOTA.left),
                  total: String(PD_NOTIFY_QUOTA.total),
                })}
          </span>
        </div>

        {live.map((deal) => {
          const index = PD_DEALS.indexOf(deal);
          return (
            <div className="pd-run-row" key={deal.id}>
              <span className="pd-kind" data-kind="deal">
                {copy.kinds.deal}
              </span>
              <div className="pd-run-name">
                <b>{dashboard.deals.rows[index]}</b>
                <span className="pd-fine">
                  {dashboard.deals.when[index]} · {dashboard.deals.windows[index]}
                </span>
                {deal.notify.state !== 'none' && (
                  <span className="pd-notif" data-on={deal.notify.state === 'sent' ? 'true' : undefined}>
                    {deal.notify.state === 'sent' ? copy.notifySent : copy.notifySet}
                  </span>
                )}
              </div>
              <div className="pd-run-stat">
                <b>{num(deal.claimed)}</b>
                <i>{copy.claims}</i>
              </div>
              <div className="pd-run-acts">
                <button type="button" className="btn btn-ghost" disabled title={dashboard.notWired}>
                  {dashboard.words.edit}
                </button>
                <button type="button" className="btn btn-ghost" disabled title={dashboard.notWired}>
                  {dashboard.words.pause}
                </button>
              </div>
            </div>
          );
        })}

        <div className="pd-run-row">
          <span className="pd-kind" data-kind="campaign">
            {copy.kinds.campaign}
          </span>
          <div className="pd-run-name">
            <b>{dashboard.campaigns.rows[0]}</b>
            <span className="pd-fine">
              {fill(dashboard.campaigns.rule, {
                visits: String(PD_CAMPAIGNS[0].visits),
                reward: dashboard.campaigns.rewards[0],
              })}{' '}
              · {fill(dashboard.words.each, { amount: money(PD_CAMPAIGNS[0].cost, 'unit') })}
            </span>
          </div>
          <div className="pd-run-stat">
            <b>
              {num(PD_CAMPAIGNS[0].used)} / {num(PD_CAMPAIGNS[0].earned)}
            </b>
            <i>{copy.usedEarned}</i>
          </div>
          <div className="pd-run-acts">
            <button type="button" className="btn btn-ghost" disabled title={dashboard.notWired}>
              {dashboard.words.edit}
            </button>
          </div>
        </div>

        <div className="pd-run-row">
          <span className="pd-kind" data-kind="vouchers">
            {copy.kinds.vouchers}
          </span>
          <div className="pd-run-name">
            <b>{copy.tierBundle}</b>
            <span className="pd-fine">{copy.tierBundleRule}</span>
          </div>
          <div className="pd-run-stat">
            <b>{money(vouchers.spent, 'exact')}</b>
            <i>{copy.givenAway}</i>
          </div>
          <div className="pd-run-acts">
            <button type="button" className="btn btn-ghost" disabled title={dashboard.notWired}>
              {dashboard.words.edit}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Thirty days of visits against redemptions.
 *
 * Both lines share one vertical scale — visits are eight times redemptions and
 * normalising them separately would draw two lines of the same height and tell
 * a lie about the ratio, which is the whole thing this chart is for.
 */
function Chart() {
  const copy = useCopy().dashboard.overview;
  const max = Math.max(...PD_SERIES.visits) * 1.12;
  const visits = polyline(PD_SERIES.visits, max);
  const area = polyarea(PD_SERIES.visits, max);
  const redeemed = polyline(PD_SERIES.redeemed, max);

  return (
    <div className="pd-glass pd-panel pd-chart-panel" data-reveal>
      <div className="pd-panel-head">
        <div>
          <span className="console-label">{copy.chartTitle}</span>
          <p className="pd-fine">{copy.chartNote}</p>
        </div>
        <div className="pd-legend">
          <span>
            <i data-part="spent" />
            {copy.chartVisits}
          </span>
          <span>
            <i data-part="held" />
            {copy.chartRedeemed}
          </span>
        </div>
      </div>
      {/* The height is stated here and not left to the SVG: a percentage inside
          an `auto` parent resolves to nothing, which is the bug `.adm-compare-cols`
          was fixed for one screen over. */}
      <div className="pd-chart">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {[0, 25, 50, 75, 100].map((y) => (
            <path key={y} className="pd-chart-grid" d={`M0 ${y} L100 ${y}`} />
          ))}
          <path className="pd-chart-fill" d={area} />
          <path className="pd-chart-line" d={visits} />
          <path className="pd-chart-line" data-second="true" d={redeemed} />
        </svg>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── deals ── */

/**
 * One deal, opened out.
 *
 * The prototype's row expansion, which is the densest thing on the screen and
 * the reason the table is worth clicking: three panels that answer the three
 * questions the columns raise but cannot fit. Where did the people go, what did
 * the one notification actually do, and what is going to stop this.
 *
 * The notification panel has four shapes because a notification has four states
 * — sent, scheduled, never set, and not applicable because the deal has expired
 * — and each of them is a different thing to tell an owner. Collapsing them into
 * one "notification: yes/no" line is what this panel exists instead of.
 */
function DealDetail({ deal, index }: { deal: PartnerDeal; index: number }) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.deals;
  const num = useNum();
  const { openDrawer, toast } = useDashboard();

  const started = deal.seen > 0;
  const openRate = started ? (deal.opened / deal.seen) * 100 : 0;
  const claimRate = started ? (deal.claimed / deal.seen) * 100 : 0;
  const useRate = deal.opened ? (deal.claimed / deal.opened) * 100 : 0;
  const notify = dealNotify(deal);
  const audience = PD_AUDIENCES[deal.audience];

  /* Seen is the whole width by definition; the other two are shares of it. The
     bar has a 3% floor so a step that happened at all is still a mark. */
  const steps = [
    { value: deal.seen, width: 100, note: copy.funnelNotes[0] },
    {
      value: deal.opened,
      width: openRate,
      note: fill(copy.funnelNotes[1], { pct: openRate.toFixed(1) }),
    },
    {
      value: deal.claimed,
      width: claimRate,
      note: fill(copy.funnelNotes[2], { pct: useRate.toFixed(0) }),
    },
  ];

  return (
    <div className="pd-open">
      <div className="pd-open-main">
        <span className="console-label">{copy.funnelTitle}</span>
        <div className="pd-funnel">
          {copy.funnel.map((label, step) => (
            <div key={label}>
              <span>{label}</span>
              <b data-lead={step === 2 ? 'true' : undefined}>
                {started ? num(steps[step].value) : '—'}
              </b>
              <i style={{ width: `${Math.max(3, steps[step].width)}%` }} data-step={step} />
              <em>{started ? steps[step].note : copy.notStarted}</em>
            </div>
          ))}
        </div>
        <p className="pd-fine">
          {started
            ? fill(copy.drop, {
                seen: num(deal.seen - deal.opened),
                opened: num(deal.opened - deal.claimed),
              })
            : copy.dropNone}
        </p>

        {deal.notify.state === 'sent' && (
          <>
            <span className="console-label">{copy.notifyTitle}</span>
            <div className="pd-funnel">
              {copy.notifySteps.map((label, step) => (
                <div key={label}>
                  <span>{label}</span>
                  <b data-lead={step === 2 ? 'true' : undefined}>
                    {num([notify.notified, notify.opened, notify.camein][step])}
                  </b>
                  <em>
                    {step === 0
                      ? copy.notifyStepNotes[0]
                      : fill(copy.notifyStepNotes[step], {
                          pct: (step === 1 ? notify.openPct : notify.cameinPct).toFixed(0),
                        })}
                  </em>
                </div>
              ))}
            </div>
            <p className="pd-fine">
              {fill(copy.notifySplit, {
                camein: num(notify.camein),
                claims: num(deal.claimed),
                alone: num(notify.alone),
              })}
            </p>
            <p className="pd-fine">
              {fill(copy.notifyBlocked, {
                n: num(notify.notified),
                blocked: num(notify.blocked),
              })}
            </p>
          </>
        )}
      </div>

      <div className="pd-open-side">
        {deal.limit > 0 && deal.state === 'live' && (
          <p className="pd-brief pd-brief-warn">
            <Icon name="clock" size={15} />
            {fill(copy.limitForecast, {
              limit: num(deal.limit),
              date: copy.limitDates[index],
            })}
          </p>
        )}

        {deal.notify.state === 'scheduled' && (
          <div className="pd-brief">
            <Icon name="bell" size={16} />
            <div>
              <p>
                {fill(copy.notifyScheduled, {
                  at: PD_AUDIENCES[deal.audience].sendAt,
                  n: num(deal.notify.reach),
                })}
              </p>
              <div className="pd-brief-acts">
                <button type="button" className="btn btn-ghost" onClick={() => openDrawer('deal')}>
                  {copy.notifyChange}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => toast(dashboard.notWired)}
                >
                  {copy.notifyCancel}
                </button>
              </div>
            </div>
          </div>
        )}

        {deal.notify.state === 'none' && deal.state !== 'expired' && (
          <p className="pd-brief">
            {fill(copy.notifyNone, {
              n: num(deal.notify.reach),
              total: num(deal.notify.match),
            })}
          </p>
        )}

        {deal.state === 'expired' && (
          <p className="pd-brief">
            <Icon name="bulb" size={15} />
            {fill(copy.retro, { weeks: String(deal.weeks), claims: num(deal.claimed) })}
          </p>
        )}

        <div className="pd-brief">
          <span className="console-label">{copy.whoTitle}</span>
          <b>{copy.when[index]}</b>
          <p>{copy.audiences[deal.audience]}</p>
          <p className="pd-fine">
            {fill(copy.reach, {
              n: num(audience.notifiable),
              total: num(audience.reach),
            })}
          </p>
          <p className="pd-fine">
            {deal.langs === 5
              ? copy.langsAll
              : fill(copy.langsSome, {
                  n: String(deal.langs),
                  pct: String(deal.reachLoss),
                })}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Which column the table is ordered by. `rank` is the prototype's default. */
type DealSort = 'rank' | 'seen' | 'opened' | 'claimed' | 'rate' | 'cost';

function Deals() {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.deals;
  const money = useMoney();
  const num = useNum();
  const { openDrawer, toast } = useDashboard();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState<DealSort>('rank');
  const [descending, setDescending] = useState(true);

  /* The prototype's own order: live and scheduled first, then by claim rate.
     A paused deal with a brilliant rate is still not the row you act on. */
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const states = ['all', 'live', 'scheduled', 'paused', 'expired'] as const;
    const wanted = states[filter];
    const rate = (deal: PartnerDeal) => (deal.seen ? deal.claimed / deal.seen : 0);
    const rank = (deal: PartnerDeal) =>
      deal.state === 'live' || deal.state === 'scheduled' ? 0 : 1;
    const key = (deal: PartnerDeal) =>
      sort === 'seen'
        ? deal.seen
        : sort === 'opened'
          ? deal.opened
          : sort === 'claimed'
            ? deal.claimed
            : sort === 'cost'
              ? deal.cost
              : rate(deal);

    return PD_DEALS.map((deal, index) => ({ deal, index }))
      .filter(({ deal, index }) => {
        if (wanted !== 'all' && deal.state !== wanted) return false;
        if (!q) return true;
        return `${copy.rows[index]} ${deal.badge} ${copy.states[deal.state]}`
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        /* The default keeps its two-level order; any chosen column replaces it
           outright, because a column header that only sorts within a group is a
           control that half works. */
        if (sort === 'rank') return rank(a.deal) - rank(b.deal) || rate(b.deal) - rate(a.deal);
        const delta = key(a.deal) - key(b.deal);
        return descending ? -delta : delta;
      });
  }, [search, filter, copy, sort, descending]);

  /* Index into `copy.columns` → the key it sorts by. The last column is a
     sparkline and the first two are words, so neither is sortable. */
  const sortKeys: Array<DealSort | null> = [
    null,
    null,
    'seen',
    'opened',
    'claimed',
    'rate',
    'cost',
    null,
  ];

  return (
    <div className="pd-stack">
      <p className="pd-glass pd-insight" data-reveal>
        <Icon name="bulb" size={16} />
        {copy.insight}
      </p>

      <div className="pd-glass pd-table-wrap" data-solid="true" data-reveal>
        <div className="pd-toolbar">
          <label className="pd-search">
            <Icon name="search" size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={copy.search}
              aria-label={copy.search}
            />
          </label>

          <div className="pd-seg">
            {copy.filters.map((label, index) => (
              <button
                key={label}
                type="button"
                data-on={filter === index ? 'true' : undefined}
                onClick={() => setFilter(index)}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="pd-chip" data-warn={PD_NOTIFY_QUOTA.left === 0 ? 'true' : undefined}>
            <Icon name="bell" size={13} />
            {fill(dashboard.overview.quota, {
              n: String(PD_NOTIFY_QUOTA.left),
              total: String(PD_NOTIFY_QUOTA.total),
            })}
          </span>

          <span className="pd-fine">
            {fill(copy.count, { n: String(rows.length), total: String(PD_DEALS.length) })}
          </span>
        </div>

        <p className="pd-sort-note">{copy.sortNote}</p>

        {rows.length === 0 ? (
          /* Not a zero row and not a blank table: the filter is the reason, so
             the way out of it is the button. */
          <div className="pd-empty">
            <span className="pd-empty-ico" aria-hidden>
              <Icon name="ticket" size={21} />
            </span>
            <b>{copy.emptyFiltered}</b>
            <p>{copy.emptyFilteredBody}</p>
            <div className="pd-empty-acts">
              <button type="button" className="btn btn-solid" onClick={() => openDrawer('deal')}>
                {dashboard.actions.newDeal}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setSearch('');
                  setFilter(0);
                }}
              >
                {copy.clearFilters}
              </button>
            </div>
          </div>
        ) : (
          <div className="pd-scroll">
            <table className="pd-table pd-table-deals">
              <thead>
                <tr>
                  {copy.columns.map((column, index) => {
                    const key = sortKeys[index];
                    const on = key != null && sort === key;
                    return (
                      <th key={column} data-align={index >= 2 && index <= 6 ? 'right' : undefined}>
                        {key ? (
                          <button
                            type="button"
                            className="pd-sort"
                            data-on={on ? 'true' : undefined}
                            title={fill(copy.sortBy, { column })}
                            onClick={() => {
                              if (on) setDescending((d) => !d);
                              else {
                                setSort(key);
                                setDescending(true);
                              }
                            }}
                          >
                            {column}
                            <i aria-hidden>{on ? (descending ? '▾' : '▴') : ''}</i>
                          </button>
                        ) : (
                          column
                        )}
                      </th>
                    );
                  })}
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ deal, index }) => {
                  const rate = deal.seen ? (deal.claimed / deal.seen) * 100 : 0;
                  const isOpen = open === deal.id;
                  const notify = dealNotify(deal);
                  return [
                    <tr
                      key={deal.id}
                      data-open={isOpen ? 'true' : undefined}
                      data-dim={deal.state === 'expired' ? 'true' : undefined}
                      onClick={() => setOpen(isOpen ? null : deal.id)}
                    >
                      <td>
                        <span className="pd-deal">
                          <i data-kind={deal.kind} data-live={deal.state === 'live' ? 'true' : undefined}>
                            {deal.badge}
                          </i>
                          <span>
                            <b>{copy.rows[index]}</b>
                            <em>
                              {copy.windows[index]} · {copy.when[index]} ·{' '}
                              {copy.audiences[deal.audience]}
                            </em>
                            <span className="pd-row-chips">
                              <i className="pd-notif" data-state={deal.notify.state}>
                                {deal.notify.state === 'sent'
                                  ? fill(copy.notifyChips.sent, { n: num(notify.camein) })
                                  : deal.notify.state === 'scheduled'
                                    ? fill(copy.notifyChips.scheduled, {
                                        at: PD_AUDIENCES[deal.audience].sendAt,
                                      })
                                    : copy.notifyChips.none}
                              </i>
                              {deal.kind === 'points' && (
                                <i className="pd-notif" data-state="points">
                                  {copy.pointsNote}
                                </i>
                              )}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <State state={deal.state} label={copy.states[deal.state]} />
                      </td>
                      <td data-align="right">{deal.seen ? num(deal.seen) : '—'}</td>
                      <td data-align="right">{deal.seen ? num(deal.opened) : '—'}</td>
                      <td data-align="right">
                        <b>{deal.seen ? num(deal.claimed) : '—'}</b>
                        {deal.limit > 0 && (
                          <span className="pd-limit">
                            <i>
                              <b
                                style={{
                                  width: `${Math.min(100, (deal.claimed / deal.limit) * 100)}%`,
                                }}
                              />
                            </i>
                            {fill(copy.limitAllowed, { limit: num(deal.limit) })}
                          </span>
                        )}
                      </td>
                      <td data-align="right">
                        <b>{deal.seen ? `${rate.toFixed(1)}%` : '—'}</b>
                      </td>
                      <td data-align="right">
                        {deal.kind === 'points' ? '—' : money(deal.cost, 'exact')}
                        {(deal.kind === 'points' || (deal.kind === 'percent' && deal.seen > 0)) && (
                          <em className="pd-cost-note">
                            {deal.kind === 'points' ? copy.costNone : copy.costEstimate}
                          </em>
                        )}
                      </td>
                      <td className="pd-trend-cell">
                        <Spark values={deal.trend} />
                      </td>
                      <td data-align="right">
                        <span className="pd-row-acts">
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              openDrawer('deal');
                            }}
                          >
                            {dashboard.words.edit}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              toast(dashboard.notWired);
                            }}
                          >
                            {copy.act[deal.state]}
                          </button>
                        </span>
                      </td>
                    </tr>,
                    isOpen ? (
                      <tr className="pd-drawer-row" key={`${deal.id}-open`}>
                        <td colSpan={9}>
                          <DealDetail deal={deal} index={index} />
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── campaigns ── */

function Campaigns() {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.campaigns;
  const states = dashboard.deals.states;
  const money = useMoney();
  const num = useNum();

  const model = PD_CAMPAIGN_MODEL;
  const pct = (value: number) =>
    model.allocation > 0 ? Math.max(0, Math.min(100, (value / model.allocation) * 100)) : 0;
  const runOut = `${model.runOut} ${dashboard.month}`;

  return (
    <div className="pd-stack">
      {model.tight && (
        <div className="pd-glass pd-alert" data-reveal>
          <Icon name="arrow" size={18} />
          <p>
            {fill(copy.rebalance, {
              date: runOut,
              amount: money(Math.max(0, PD_VOUCHER_MODEL.available), 'exact'),
            })}
          </p>
          <button type="button" className="btn btn-solid" disabled title={dashboard.notWired}>
            {copy.rebalanceAction}
          </button>
        </div>
      )}

      {/* The gap panel. Earned minus used is the only number on this screen that
          is a person rather than a złoty: someone qualified and did not come. */}
      <div className="pd-glass pd-panel" data-reveal>
        <div className="pd-gap-head">
          <div>
            <span className="console-label">{copy.gapTitle}</span>
            <p className="pd-fine">{copy.gapLede}</p>
            <p className="pd-proof">
              {fill(copy.gap, {
                name: copy.rows[model.widest],
                n: String(model.widestGap),
              })}
            </p>
          </div>
          <div className="pd-gap-totals">
            {copy.totals.map((label, index) => (
              <div key={label}>
                <span>{label}</span>
                <b>{num([model.earned, model.used, model.holding][index])}</b>
              </div>
            ))}
          </div>
        </div>

        <div className="pd-remind">
          <button type="button" className="btn btn-solid" disabled title={dashboard.notWired}>
            <Icon name="coin" size={16} />
            {fill(copy.remindLabel, { n: num(model.holding) })}
          </button>
          <div>
            <b>{copy.remindNote}</b>
            <span className="pd-fine">
              {fill(copy.remindResult, {
                back: String(PD_REMIND.back),
                of: String(PD_REMIND.of),
              })}
            </span>
          </div>
          <button type="button" className="btn btn-ghost" disabled title={dashboard.notWired}>
            {copy.remindSetup}
          </button>
        </div>

        <p className="pd-near">
          <Icon name="assistant" size={15} />
          {fill(copy.near, { n: String(PD_NEAR) })}
        </p>
      </div>

      {/* The pool. Three slices, and the middle one is the one that needs the
          explanation — money committed but not gone. */}
      <div className="pd-glass pd-panel" data-reveal>
        <div className="pd-panel-head">
          <div>
            <span className="console-label">{copy.budgetTitle}</span>
            <p className="pd-fine">{copy.budgetLede}</p>
          </div>
          <b className="pd-budget-total">{money(model.allocation, 'exact')}</b>
        </div>

        <div className="pd-stacked">
          <i data-part="spent" style={{ width: `${pct(model.spent)}%` }} />
          <i data-part="held" style={{ width: `${pct(model.aside)}%` }} />
        </div>

        <div className="pd-legend pd-legend-wide">
          <span>
            <i data-part="spent" />
            <em>{dashboard.words.spent}</em>
            <b>{money(model.spent, 'exact')}</b>
            <p className="pd-fine">{copy.spentNote}</p>
          </span>
          <span>
            <i data-part="held" />
            <em>{dashboard.words.aside}</em>
            <b>{money(model.aside, 'exact')}</b>
            <p className="pd-fine">{copy.asideNote}</p>
          </span>
          <span>
            <i data-part="free" />
            <em>{dashboard.words.available}</em>
            <b>{money(Math.max(0, model.available), 'exact')}</b>
            <p className="pd-fine">{copy.availableNote}</p>
          </span>
        </div>

        <div className="pd-forecast">
          <span className="pd-chip" data-warn={model.available <= 0 ? 'true' : undefined}>
            <Icon name="coin" size={13} />
            {model.available <= 0
              ? copy.forecastOut
              : model.outlasts
                ? fill(copy.forecastSafe, { month: dashboard.month })
                : fill(copy.forecast, { date: runOut })}
          </span>
          <span className="pd-fine">
            {fill(dashboard.words.returned, { amount: money(model.returned, 'exact') })}
          </span>
        </div>
      </div>

      <div className="pd-cards">
        {model.list.map((campaign, index) => (
          <div className="pd-glass pd-card" key={copy.rows[index]} data-reveal>
            <div className="pd-card-top">
              <div>
                <b>{copy.rows[index]}</b>
                <span className="pd-card-rule">
                  {fill(copy.rule, {
                    visits: String(campaign.visits),
                    /* The reward is filled too: one of the four is money off
                       rather than a free item, and the amount it takes off is
                       the same figure as what it costs the venue. A złoty typed
                       into the dictionary is the bug `useMoney` exists to
                       prevent, and `fill` leaves the other three untouched. */
                    reward: fill(copy.rewards[index], {
                      amount: money(campaign.cost, 'unit'),
                    }),
                  })}
                  <em>{fill(dashboard.words.each, { amount: money(campaign.cost, 'unit') })}</em>
                </span>
              </div>
              <State
                state={campaign.live ? 'live' : 'paused'}
                label={campaign.live ? states.live : states.paused}
              />
            </div>

            <div className="pd-split">
              <div>
                <span>{copy.earned}</span>
                <b>{campaign.earned}</b>
              </div>
              <div>
                <span>{copy.used}</span>
                <b>{campaign.used}</b>
              </div>
            </div>

            <span className="pd-bar-track">
              <i style={{ width: `${campaign.rate * 100}%` }} />
            </span>
            <div className="pd-card-meta">
              <span>{fill(copy.unused, { n: String(campaign.gap) })}</span>
              <span>{fill(copy.usedRate, { pct: String(Math.round(campaign.rate * 100)) })}</span>
            </div>

            <div className="pd-split pd-split-money">
              <div>
                <span>{dashboard.words.costSoFar}</span>
                <b>{money(campaign.spent, 'exact')}</b>
              </div>
              <div>
                <span>{dashboard.words.aside}</span>
                <b>{money(campaign.aside, 'exact')}</b>
              </div>
            </div>

            <p className="pd-fine">{copy.visitRule}</p>
            {!campaign.live && <p className="pd-fine">{copy.pausedNote}</p>}

            {/* The two buttons are one group, so a narrow card drops both to the
                next line together rather than leaving "Pause" orphaned under
                "Edit" on whichever card happens to have the shortest date. */}
            <div className="pd-card-foot">
              <span>{fill(dashboard.words.priority, { n: String(campaign.priority) })}</span>
              <span>{copy.since[index]}</span>
              <span className="pd-card-acts">
                <button type="button" className="btn btn-ghost" disabled title={dashboard.notWired}>
                  {dashboard.words.edit}
                </button>
                <button type="button" className="btn btn-ghost" disabled title={dashboard.notWired}>
                  {campaign.live ? dashboard.words.pause : states.live}
                </button>
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── vouchers ── */

function Vouchers() {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.vouchers;
  const money = useMoney();
  const num = useNum();

  const model = PD_VOUCHER_MODEL;
  const pct = (value: number) =>
    model.budget > 0 ? Math.max(0, Math.min(100, (value / model.budget) * 100)) : 0;
  const runOut = `${model.runOut} ${dashboard.month}`;
  const spendTotal = model.tiers.reduce((a, t) => a + t.spent, 0);

  return (
    <div className="pd-stack">
      {model.tight && (
        <div className="pd-glass pd-alert" data-reveal>
          <Icon name="arrow" size={18} />
          <div>
            <b>{copy.alertTitle}</b>
            <p className="pd-fine">{fill(copy.alertBody, { date: runOut })}</p>
          </div>
          <button type="button" className="btn btn-solid" disabled title={dashboard.notWired}>
            {copy.alertAction}
          </button>
        </div>
      )}

      <div className="pd-glass pd-hero pd-budget" data-reveal>
        <div className="pd-panel-head">
          <div>
            <span className="console-label">{copy.budgetTitle}</span>
            <p className="pd-fine">{copy.budgetLede}</p>
          </div>
          <div className="pd-budget-figure">
            <span>{copy.budgetLabel}</span>
            <b>{money(model.budget, 'exact')}</b>
          </div>
        </div>

        <p className="pd-fine">{copy.allocNote}</p>
        <div className="pd-stacked" data-tall="true">
          <i data-part="spent" style={{ width: `${pct(model.spent)}%` }} />
          <i data-part="held" style={{ width: `${pct(model.reserved)}%` }} />
        </div>

        <div className="pd-legend pd-legend-wide">
          <span>
            <i data-part="spent" />
            <em>{copy.spent}</em>
            <b>{money(model.spent, 'exact')}</b>
            <p className="pd-fine">{copy.spentNote}</p>
          </span>
          <span>
            <i data-part="held" />
            <em>{copy.held}</em>
            <b>{money(model.reserved, 'exact')}</b>
            <p className="pd-fine">{copy.heldNote}</p>
          </span>
          <span>
            <i data-part="free" />
            <em>{copy.free}</em>
            <b>{money(Math.max(0, model.available), 'exact')}</b>
            <p className="pd-fine">{copy.freeNote}</p>
          </span>
        </div>

        <span className="pd-chip" data-warn={model.available <= 0 ? 'true' : undefined}>
          <Icon name="coin" size={13} />
          {model.available <= 0
            ? copy.forecastOut
            : model.outlasts
              ? fill(copy.forecastSafe, { month: dashboard.month })
              : fill(copy.forecast, { date: runOut })}
        </span>

        {/* The three inputs the pool is computed from, shown as facts rather
            than fields: there is no server, and a control that silently forgets
            what you typed is worse than a figure that says where it came from. */}
        <div className="pd-inputs">
          <div>
            <span className="console-label">{copy.buysTitle}</span>
            <b>{fill(copy.buys, { n: num(model.moreVouchers) })}</b>
            <p className="pd-fine">{copy.buysNote}</p>
          </div>
          <div>
            <span className="console-label">{copy.avgTitle}</span>
            <b>{money(AVG_SPEND, 'unit')}</b>
            <p className="pd-fine">{copy.avgNote}</p>
          </div>
          <div>
            <span className="console-label">{copy.maxTitle}</span>
            <b>{money(PD_MAX_PER_VOUCHER, 'unit')}</b>
            <p className="pd-fine">{copy.maxNote}</p>
          </div>
        </div>
      </div>

      <div className="pd-glass pd-table-wrap" data-solid="true" data-reveal>
        <div className="pd-panel-head">
          <div>
            <span className="console-label">{copy.tiersTitle}</span>
            <p className="pd-fine">{copy.tiersLede}</p>
          </div>
        </div>
        <div className="pd-scroll">
          <table className="pd-table">
            <thead>
              <tr>
                {copy.columns.map((column, index) => (
                  <th key={column} data-align={index >= 2 ? 'right' : undefined}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.tiers.map((tier) => (
                <tr key={tier.pct}>
                  <td>
                    <span className="pd-tier">{fill(copy.tier, { n: String(tier.pct) })}</span>
                  </td>
                  <td>{fill(copy.points, { n: num(tier.points) })}</td>
                  <td data-align="right">{num(tier.issued)}</td>
                  <td data-align="right">{num(tier.redeemed)}</td>
                  <td data-align="right">{money(tier.spent, 'exact')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pd-two">
        <div className="pd-glass pd-panel" data-reveal>
          <div className="pd-panel-head">
            <span className="console-label">{copy.mixTitle}</span>
            <b>{money(spendTotal, 'exact')}</b>
          </div>
          <div className="pd-stacked">
            {model.tiers.map((tier, index) => (
              <i
                key={tier.pct}
                data-part={['spent', 'held', 'free'][index]}
                style={{ width: `${spendTotal > 0 ? (tier.spent / spendTotal) * 100 : 0}%` }}
              />
            ))}
          </div>
          {model.tiers.map((tier, index) => (
            <div className="pd-mix-row" key={tier.pct}>
              <i data-part={['spent', 'held', 'free'][index]} />
              <span>{fill(copy.tier, { n: String(tier.pct) })}</span>
              <em>{money(tier.spent, 'exact')}</em>
              <b>{spendTotal > 0 ? Math.round((tier.spent / spendTotal) * 100) : 0}%</b>
            </div>
          ))}
        </div>

        <div className="pd-side">
          <div className="pd-glass pd-panel" data-reveal>
            <span className="console-label">{copy.returnedTitle}</span>
            <b className="pd-big">{money(model.returned, 'exact')}</b>
            <p className="pd-fine">{copy.returnedNote}</p>
          </div>
          <div className="pd-glass pd-panel pd-suggestion" data-reveal>
            <span className="console-label">
              <Icon name="trophy" size={14} />
              {copy.suggestion}
            </span>
            <p>{fill(copy.insight, { n: String(model.tiers[model.biggest].pct) })}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── customers ── */

function Customers() {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.customers;
  const money = useMoney();
  const num = useNum();

  const [filter, setFilter] = useState(0);
  const [detail, setDetail] = useState<number | null>(null);

  const nationsTotal = PD_CUSTOMERS.nations.reduce((a, b) => a + b, 0);
  const last = PD_CUSTOMERS.cohorts[PD_CUSTOMERS.cohorts.length - 1];
  const lastPct = Math.round((last.back / last.first) * 100);
  const trendMax = Math.max(...PD_CUSTOMERS.perNewTrend);

  const roster = useMemo(() => {
    const wanted = ['all', 'regular', 'lapsed', 'new'][filter];
    return PD_ROSTER.filter((r) => wanted === 'all' || r.status === wanted).sort(
      (a, b) => b.spent - a.spent,
    );
  }, [filter]);

  const open = detail == null ? null : (PD_ROSTER.find((r) => r.id === detail) ?? null);

  return (
    <div className="pd-stack">
      {/* What a new customer costs. One number, its four parts, and the trend —
          which is the honest version of "customer acquisition cost": everything
          Paylez charged plus every discount given, over everyone new. */}
      <div className="pd-glass pd-hero" data-reveal>
        <div className="pd-hero-main">
          <span className="console-label">{copy.costKicker}</span>
          <p className="pd-counted">
            <b>{money(PD_PER_NEW, 'unit')}</b>
            <span>{fill(copy.costUnit, { month: dashboard.month })}</span>
          </p>
          <p className="pd-proof">
            {fill(copy.costLine, {
              cost: money(PD_COST_TOTAL, 'exact'),
              month: dashboard.month,
              n: num(PD_TOTALS.newCustomers),
              each: money(PD_PER_NEW, 'unit'),
            })}
          </p>

          <div className="pd-breakdown">
            {copy.costBreakdown.map((label, index) => (
              <div key={label}>
                <span>{label}</span>
                <b>{money(PD_COST_ROWS[index], 'exact')}</b>
              </div>
            ))}
          </div>

          <div className="pd-finding">
            <p className="pd-fine">
              {fill(copy.costFinding, {
                now: money(PD_PER_NEW, 'unit'),
                month: dashboard.month,
                then: money(PD_CUSTOMERS.perNewTrend[0], 'unit'),
              })}
            </p>
            <button type="button" className="btn btn-ghost" disabled title={dashboard.notWired}>
              {copy.costAction}
            </button>
          </div>
        </div>

        <div className="pd-trend">
          <span className="console-label">{copy.trendTitle}</span>
          <div className="pd-trend-cols">
            {PD_CUSTOMERS.perNewTrend.map((value, index) => (
              <span key={copy.trendMonths[index]} data-on={index === 2 ? 'true' : undefined}>
                <em>{money(value, 'unit')}</em>
                <i style={{ height: `${(value / trendMax) * 100}%` }} />
                {copy.trendMonths[index]}
              </span>
            ))}
          </div>
          <p className="pd-fine">
            {fill(copy.benchmark, { amount: money(PD_CUSTOMERS.benchmark, 'unit') })}
          </p>
        </div>
      </div>

      {/* The roster. Everyone here chose to be here — which is why the panel
          says so twice, once at the top and once at the bottom. */}
      <div className="pd-glass pd-table-wrap" data-solid="true" data-reveal>
        {open ? (
          <CustomerDetail entry={open} onBack={() => setDetail(null)} />
        ) : (
          <>
            <div className="pd-panel-head">
              <div>
                <span className="console-label">{copy.rosterTitle}</span>
                <p className="pd-fine">
                  {fill(copy.rosterIntro, {
                    n: String(PD_ROSTER.length),
                    total: num(PD_CUSTOMERS.total),
                  })}
                </p>
              </div>
              <span className="pd-chip">
                <Icon name="shield" size={13} />
                {fill(copy.rosterCount, { n: String(PD_ROSTER.length) })}
              </span>
            </div>

            <div className="pd-seg">
              {copy.rosterFilters.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  data-on={filter === index ? 'true' : undefined}
                  onClick={() => setFilter(index)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="pd-scroll">
              <table className="pd-table">
                <thead>
                  <tr>
                    {copy.rosterColumns.map((column, index) => (
                      <th key={column} data-align={index === 1 || index === 2 ? 'right' : undefined}>
                        {column}
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {roster.map((entry) => (
                    <tr key={entry.id} onClick={() => setDetail(entry.id)}>
                      <td>
                        <span className="pd-person">
                          <i data-hv={entry.hv ? 'true' : undefined}>{entry.init}</i>
                          <span>
                            <b>{entry.name}</b>
                            <em>
                              {entry.tier > 0
                                ? fill(copy.tierProgress, { n: String(entry.tier) })
                                : fill(copy.stamps, {
                                    done: String(entry.sg),
                                    of: String(entry.so),
                                  })}
                            </em>
                          </span>
                        </span>
                      </td>
                      <td data-align="right">
                        <span className="pd-trend-mark" data-dir={entry.trend}>
                          {entry.trend === 'up' ? '↑' : entry.trend === 'down' ? '↓' : '→'}
                        </span>
                        <b>{money(entry.spent, 'exact')}</b>
                      </td>
                      <td data-align="right">{entry.visits}</td>
                      <td>
                        {entry.last === 0
                          ? copy.today
                          : entry.last === 1
                            ? copy.dayAgo
                            : fill(copy.daysAgo, { n: String(entry.last) })}
                      </td>
                      <td>
                        <State state={entry.status} label={copy.statuses[entry.status]} />
                      </td>
                      <td data-align="right">
                        <Icon name="chevron" size={15} className="pd-row-chevron" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="pd-fine">{copy.withdrew}</p>
          </>
        )}
      </div>

      <Heat />

      <div className="pd-two">
        <div className="pd-glass pd-panel" data-reveal>
          <span className="console-label">{copy.fromTitle}</span>
          {PD_CUSTOMERS.nations.map((count, index) => (
            <Bar
              key={copy.nations[index]}
              label={copy.nations[index]}
              value={count}
              of={PD_CUSTOMERS.nations[0]}
              muted={index === PD_CUSTOMERS.nations.length - 1}
              note={fill(copy.nationCount, {
                n: num(count),
                pct: String(Math.round((count / nationsTotal) * 100)),
              })}
            />
          ))}
          <p className="pd-fine">
            {fill(copy.nationHidden, { n: String(PD_CUSTOMERS.hiddenGroups) })}
          </p>
        </div>

        <div className="pd-glass pd-panel" data-reveal>
          <span className="console-label">{copy.readTitle}</span>
          <p className="pd-fine">{copy.readLede}</p>
          {PD_CUSTOMERS.langs.map((pct, index) => (
            <Bar
              key={copy.langs[index]}
              label={copy.langs[index]}
              value={pct}
              of={PD_CUSTOMERS.langs[0]}
              muted={index === PD_CUSTOMERS.langs.length - 1}
              note={
                index === PD_CUSTOMERS.langs.length - 1
                  ? `${pct}%`
                  : fill(copy.nationCount, {
                      n: num(Math.round((pct / 100) * PD_CUSTOMERS.total)),
                      pct: String(pct),
                    })
              }
            />
          ))}
          <div className="pd-finding">
            <p className="pd-fine">{copy.langFinding}</p>
            <button type="button" className="btn btn-solid" disabled title={dashboard.notWired}>
              {copy.langAction}
            </button>
          </div>
        </div>
      </div>

      <div className="pd-glass pd-panel" data-reveal>
        <span className="console-label">{copy.backTitle}</span>
        <p className="pd-fine">{copy.backLede}</p>
        <p className="pd-proof">
          {fill(copy.backFinding, {
            first: num(last.first),
            month: copy.months[copy.months.length - 1],
            back: num(last.back),
            pct: String(lastPct),
          })}
        </p>
        {PD_CUSTOMERS.cohorts.map((cohort, index) => (
          <Bar
            key={copy.months[index]}
            label={copy.months[index]}
            value={cohort.back}
            of={cohort.first}
            note={fill(copy.cohort, {
              back: num(cohort.back),
              first: num(cohort.first),
              pct: String(Math.round((cohort.back / cohort.first) * 100)),
            })}
          />
        ))}
        <div className="pd-finding">
          <p className="pd-fine">
            {fill(copy.lapsedFinding, { n: num(PD_CUSTOMERS.lapsed) })}
          </p>
          <button type="button" className="btn btn-solid" disabled title={dashboard.notWired}>
            <Icon name="coin" size={16} />
            {dashboard.words.remind}
          </button>
        </div>
      </div>

      <div className="pd-two">
        <div className="pd-glass pd-panel" data-reveal>
          <span className="console-label">{copy.compareTitle}</span>
          <p className="pd-fine">
            {fill(copy.compareNote, { n: String(PD_CUSTOMERS.peers) })}
          </p>
          {[
            {
              you: `${PD_CLAIM_RATE.toFixed(1)}%`,
              them: `${PD_CUSTOMERS.benchClaim.toFixed(1)}%`,
              better: PD_CLAIM_RATE > PD_CUSTOMERS.benchClaim,
            },
            {
              you: `${lastPct}%`,
              them: `${PD_CUSTOMERS.benchSecond}%`,
              better: lastPct > PD_CUSTOMERS.benchSecond,
            },
            {
              you: money(PD_PER_NEW, 'unit'),
              them: money(PD_CUSTOMERS.benchmark, 'unit'),
              better: PD_PER_NEW < PD_CUSTOMERS.benchmark,
            },
          ].map((row, index) => (
            <div className="pd-compare" key={copy.compareRows[index]}>
              <span>{copy.compareRows[index]}</span>
              <div>
                <b data-better={row.better ? 'true' : undefined}>{row.you}</b>
                <i>{fill(copy.compareThem, { amount: row.them })}</i>
              </div>
            </div>
          ))}
        </div>

        <div className="pd-glass pd-panel" data-reveal>
          <span className="console-label">{copy.roiTitle}</span>
          <p className="pd-fine">{fill(copy.roiLede, { month: dashboard.month })}</p>
          {PD_ROI_ROWS.map((row, index) => (
            <div className="pd-compare" key={copy.roiRows[index]}>
              <span>
                <b>{copy.roiRows[index]}</b>
                <i>
                  {fill(copy.roiLine, {
                    cost: money(row.cost, 'exact'),
                    n: num(row.units),
                    unit: copy.roiUnits[index],
                  })}
                </i>
              </span>
              <div>
                <b>{money(row.cost / Math.max(1, row.units), 'unit')}</b>
                <i>{copy.roiPer[index]}</i>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="pd-fine">{copy.privacy}</p>
    </div>
  );
}

/** One shared customer, opened out of the roster. */
function CustomerDetail({ entry, onBack }: { entry: RosterEntry; onBack: () => void }) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.customers;
  const money = useMoney();

  /* Six months of spend, back-filled from the total: the prototype does the
     same, and the alternative is a per-customer time series nobody would read. */
  const months = 6;
  const trend = Array.from({ length: months }, (_, i) => {
    const age = months - 1 - i;
    if (age >= entry.tenure) return 0;
    const share = (entry.tenure - age) / ((entry.tenure * (entry.tenure + 1)) / 2);
    return entry.spent * share;
  });
  const trendMax = Math.max(...trend, 1);

  const progress =
    entry.tier > 0 ? 100 : entry.so > 0 ? Math.min(100, (entry.sg / entry.so) * 100) : 0;

  return (
    <div className="pd-open">
      <button type="button" className="btn btn-ghost pd-back" onClick={onBack}>
        <Icon name="chevron" size={15} className="pd-back-ico" />
        {copy.rosterTitle}
      </button>

      <div className="pd-detail-head">
        <i data-hv={entry.hv ? 'true' : undefined}>{entry.init}</i>
        <div>
          <h2>{entry.name}</h2>
          <State state={entry.status} label={copy.statuses[entry.status]} />
        </div>
      </div>

      <p className="pd-fine pd-privacy">
        <Icon name="shield" size={15} />
        {copy.withdrew}
      </p>

      <div className="pd-detail-stats">
        <div>
          <span>{copy.rosterColumns[1]}</span>
          <b>{money(entry.spent, 'exact')}</b>
        </div>
        <div>
          <span>{copy.rosterColumns[2]}</span>
          <b>{entry.visits}</b>
        </div>
        <div>
          {/* The product's own name for this quantity, borrowed rather than
              restated: it is the same average the voucher pool is priced off. */}
          <span>{dashboard.vouchers.avgTitle}</span>
          <b>{money(entry.spent / entry.visits, 'unit')}</b>
        </div>
        <div>
          <span>{copy.rosterColumns[3]}</span>
          <b>
            {entry.last === 0
              ? copy.today
              : entry.last === 1
                ? copy.dayAgo
                : fill(copy.daysAgo, { n: String(entry.last) })}
          </b>
        </div>
      </div>

      <div className="pd-two">
        <div className="pd-sub">
          <span className="console-label">{copy.spendByMonth}</span>
          <div className="pd-trend-cols">
            {trend.map((value, index) => (
              <span key={index}>
                <i style={{ height: `${(value / trendMax) * 100}%` }} />
              </span>
            ))}
          </div>
        </div>

        <div className="pd-sub">
          <span className="console-label">{copy.rewards[entry.reward]}</span>
          <span className="pd-bar-track">
            <i style={{ width: `${progress}%` }} />
          </span>
          <p className="pd-fine">
            {entry.tier > 0
              ? fill(copy.tierProgress, { n: String(entry.tier) })
              : fill(copy.stamps, { done: String(entry.sg), of: String(entry.so) })}
          </p>
          {entry.deals.map((deal) => (
            <p className="pd-fine pd-used" key={deal}>
              <Icon name="check" size={14} />
              {dashboard.deals.rows[deal]}
            </p>
          ))}
          {entry.camp >= 0 && (
            <p className="pd-fine">{dashboard.campaigns.rows[entry.camp]}</p>
          )}
        </div>
      </div>

      <div className="pd-finding">
        <p className="pd-proof">{copy.patterns[entry.pattern]}</p>
        <button type="button" className="btn btn-solid" disabled title={dashboard.notWired}>
          {copy.langAction}
        </button>
      </div>
    </div>
  );
}

/**
 * An average week at the counter.
 *
 * Alpha on one accent, not a colour ramp: the palette has one hue and a heat map
 * is exactly the case where a second one would be reached for. Density carries
 * it — the quiet Tuesday–Wednesday afternoon block is visible because it is the
 * only pale patch in a warm field, which is all this chart has to say.
 */
function Heat() {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.customers;

  return (
    <div className="pd-glass pd-panel" data-solid="true" data-reveal>
      <span className="console-label">{copy.whenTitle}</span>
      <p className="pd-fine">{copy.whenLede}</p>

      <div className="pd-scroll">
        <div className="pd-heat">
          <span />
          <div className="pd-heat-hours">
            {HEAT_HOURS.map((hour, index) => (
              <span key={hour}>{index % 2 === 0 ? `${String(hour).padStart(2, '0')}:00` : ''}</span>
            ))}
          </div>
          {PD_HEAT.map((row, day) => (
            <FragmentRow key={copy.days[day]} label={copy.days[day]} row={row} note={copy.heatCell} />
          ))}
        </div>
      </div>

      <div className="pd-finding">
        <p className="pd-proof">{copy.quietFinding}</p>
        <div className="pd-notice-acts">
          <button type="button" className="btn btn-solid" disabled title={dashboard.notWired}>
            {copy.quietAction}
          </button>
          <button type="button" className="btn btn-ghost" disabled title={dashboard.notWired}>
            {copy.quietSelf}
          </button>
        </div>
      </div>
      <p className="pd-fine">{copy.peakFinding}</p>
    </div>
  );
}

function FragmentRow({ label, row, note }: { label: string; row: number[]; note: string }) {
  return (
    <>
      <span className="pd-heat-day">{label}</span>
      <div className="pd-heat-row">
        {row.map((value, index) => (
          <i
            key={HEAT_HOURS[index]}
            title={fill(note, { n: String(value) })}
            /* One custom property, one rule. The floor keeps an empty cell
               visible as a cell rather than a hole in the grid. */
            style={{ '--v': (0.07 + (value / PD_HEAT_MAX) * 0.83).toFixed(2) } as React.CSSProperties}
          />
        ))}
      </div>
    </>
  );
}

/* ──────────────────────────────────────────────────────────────── scans ── */

function Scans() {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.scans;
  const money = useMoney();
  const num = useNum();

  const [filter, setFilter] = useState(0);
  const [page, setPage] = useState(0);

  const matching = useMemo(
    () =>
      PD_SCANS.filter((scan) =>
        filter === 0 ? true : filter === 1 ? scan.first : !scan.first,
      ),
    [filter],
  );

  /* Twelve at a time, the prototype's page size. The filter changing has to
     take the pager back to the top with it, or a narrow filter lands you on an
     empty page four. */
  const pages = Math.max(1, Math.ceil(matching.length / PD_SCAN_PAGE));
  const current = Math.min(page, pages - 1);
  const from = current * PD_SCAN_PAGE;
  const rows = matching.slice(from, from + PD_SCAN_PAGE);

  return (
    <div className="pd-stack">
      <div className="pd-glass pd-table-wrap" data-solid="true" data-reveal>
        <div className="pd-toolbar">
          <div className="pd-seg">
            {copy.filters.map((label, index) => (
              <button
                key={label}
                type="button"
                data-on={filter === index ? 'true' : undefined}
                onClick={() => {
                  setFilter(index);
                  setPage(0);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="pd-fine">
            {fill(copy.count, { n: num(PD_SCAN_TOTAL) })} · {dashboard.rangeLabel}
          </span>
        </div>

        <div className="pd-scroll">
          <table className="pd-table">
            <thead>
              <tr>
                {copy.columns.map((column, index) => (
                  <th key={column} data-align={index === 3 || index === 4 ? 'right' : undefined}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((scan) => {
                const name = PD_SCAN_NAMES[scan.who];
                const initials = name
                  .split(' ')
                  .map((word) => word[0])
                  .join('')
                  .slice(0, 2);
                const left = scan.need - scan.done;
                return (
                  <tr key={scan.receipt}>
                    <td>
                      {copy.today}{' '}
                      {String(scan.hour).padStart(2, '0')}:{String(scan.minute).padStart(2, '0')}
                    </td>
                    <td>
                      <span className="pd-person">
                        <i>{initials}</i>
                        <b>{name}</b>
                      </span>
                    </td>
                    <td>
                      <State
                        state={scan.first ? 'live' : 'paused'}
                        label={scan.first ? copy.first : copy.again}
                      />
                    </td>
                    <td data-align="right">{money(scan.spent, 'unit')}</td>
                    <td data-align="right">+{scan.points}</td>
                    <td className="pd-code">#{scan.receipt}</td>
                    {/* Pinned, and the second line names the till rather than
                        the prototype's latitude and longitude: a coordinate
                        pair under every row is six decimal places of precision
                        about where a customer stood, which is not a thing this
                        screen should be printing. */}
                    <td>
                      <span className="pd-place">
                        <Icon name="pin" size={12} strokeWidth={2} />
                        <b>{copy.places[scan.place]}</b>
                        <em>{copy.coords}</em>
                      </span>
                    </td>
                    <td>
                      {scan.need > 0 ? (
                        <span className="pd-progress">
                          <span>
                            {fill(copy.progress, {
                              done: String(scan.done),
                              need: String(scan.need),
                            })}
                            <em>
                              {left === 0 ? copy.ready : fill(copy.toGo, { n: String(left) })}
                            </em>
                          </span>
                          <i>
                            <b style={{ width: `${(scan.done / scan.need) * 100}%` }} />
                          </i>
                        </span>
                      ) : (
                        <span className="pd-fine">{copy.noCampaign}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="pd-pager">
          <span className="pd-fine">
            {fill(copy.page, {
              from: String(from + 1),
              to: String(from + rows.length),
              total: num(matching.length),
            })}
          </span>
          <div>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              {copy.prev}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
            >
              {copy.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── index ── */

/*
 * Index-aligned with `DASH_SCREENS`; the profile is handled by its own form and
 * so has no entry. Kept module-private and reached through the component below
 * rather than exported: a file that exports both components and a plain value
 * loses React fast refresh, which is the same rule `theme/` and `i18n/` are
 * split for.
 */
const SCREENS = [Overview, Deals, Campaigns, Vouchers, Customers, Assistant, Scans];

/** The rail's current screen, whichever that is. */
export function DashboardScreen({ index }: { index: number }) {
  const Panel = SCREENS[index];
  return Panel ? <Panel /> : null;
}
