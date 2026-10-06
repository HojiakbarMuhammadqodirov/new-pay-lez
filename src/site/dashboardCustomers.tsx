import { useMemo, useState } from 'react';

import { ApiError } from './api/client';
import {
  chain,
  minorToEuro,
  readyOr,
  sendReminder,
  usePartnerAnalytics,
  usePartnerAudiences,
  usePartnerCampaigns,
  usePartnerCustomer,
  usePartnerCustomers,
  usePartnerDeals,
  usePartnerRemind,
  usePartnerVenue,
  type AnalyticsResponse,
  type CustomerDetailResponse,
  type CustomerRowResponse,
  type DealResponse,
  type RemindStatus,
} from './api/partner';
import { usePassMembers, type PassMember } from './api/passes';
import './dashboard-customers.css';
import {
  DEMO_ANALYTICS,
  DEMO_AUDIENCES,
  DEMO_CAMPAIGNS,
  DEMO_CUSTOMERS,
  DEMO_DEALS,
  DEMO_PASS_MEMBERS,
  DEMO_REMIND,
  DEMO_VENUE,
  demoCustomerDetail,
} from './dashboardDemo';
import { useMonthName, useNum } from './dashboardFormat';
import { Button, Card, CardHead, DxIcon, EmptyState, Eyebrow, Pill } from './dashboardKit';
import { initialsOf } from './dashboardKitHooks';
import { HEAT_HOURS, heatFromApi } from './partnerMetrics';
import { Figure, Screen } from './dashboardScreens';
import { useDashboard } from './dashboardShell';
import { DEMO_MODE } from './demoMode';
import { useCopy, useLanguage, useMoney } from './i18n/context';
import { fill } from './i18n/currency';

/**
 * Who comes in, when they come, and whether they come back — v3 §3.6.
 *
 * Seven panels, and they split into two populations that must never be
 * confused. The ink slab, the heat map, the language bars, the cohorts and the
 * two comparison cards are about **everybody**, counted in groups and floored
 * by the server's min-cohort rule. The roster and the detail it opens are about
 * **the people who chose to share**, one row each, and nobody else: the server
 * leaves an un-consented customer out of the response entirely, and this screen
 * has no slot that would show one.
 *
 * ── what v3 draws and this screen does not ────────────────────────────────
 *
 * Every element below reads a field the API sends. Four of v3's do not have
 * one, and are left out rather than imitated:
 *
 *  - **"Send Andrii a private offer" / "Win Giorgi back."** The platform does
 *    not let a venue message a named customer (`profiles.segmentFor` says why);
 *    the button in the mock only raised a toast. "Build a deal like this" stays,
 *    because the assistant is real.
 *  - **The branch under each name.** No endpoint attributes a customer to one of
 *    a venue's sites, and the switcher shows one venue at a time anyway.
 *  - **The mock's prose findings** ("most of that fall came from your free-item
 *    deal", "your morning deal already runs then"). Each is a sentence with a
 *    cause in it that nothing measured; the measured half of each is kept.
 *
 * And one state the server forced: the heat map is this **month's** scans, not
 * "an average week" — the grid is a month of counts, and dividing it into a
 * typical week would be inventing the averaging the lede promised.
 */
export function Customers() {
  const venueApi = usePartnerVenue();
  const liveVenue = venueApi.state.status === 'ready' ? venueApi.state.data : null;
  const venue = liveVenue ?? (DEMO_MODE ? DEMO_VENUE : null);
  const liveId = liveVenue?.id ?? null;
  const analyticsApi = usePartnerAnalytics(liveId);
  const state = chain(venueApi, analyticsApi);

  /* Off the venue row rather than off the budget: every minor-unit figure on
     this page is in the venue's currency, and converting it is the seam the
     dashboard rules name (`minorToEuro`, then the reader's money). */
  const currency = venue?.currency ?? 'EUR';

  return (
    <Screen state={state} id="customers" demo={DEMO_ANALYTICS}>
      {(data) => <CustomersBody data={data} liveId={liveId} currency={currency} />}
    </Screen>
  );
}

/**
 * The page under `Screen`. A component of its own because `Screen` *calls* its
 * child during its own render, and the hooks below would join its hook order.
 */
function CustomersBody({
  data,
  liveId,
  currency,
}: {
  data: AnalyticsResponse;
  liveId: string | null;
  currency: string;
}) {
  const dashboard = useCopy().dashboard;

  const customersApi = usePartnerCustomers(liveId);
  /* None of these is part of `chain`: each feeds one panel or one label, and a
     panel that could not ask must not take the screen down with it. */
  const campaignsApi = usePartnerCampaigns(liveId);
  const dealsApi = usePartnerDeals(liveId);
  const remindApi = usePartnerRemind(liveId);
  const audiencesApi = usePartnerAudiences(liveId);
  const membersApi = usePassMembers(liveId);

  const roster = readyOr(customersApi.state, DEMO_MODE ? DEMO_CUSTOMERS : null);
  const campaigns = readyOr(campaignsApi.state, DEMO_MODE ? DEMO_CAMPAIGNS : null);
  const deals = readyOr(dealsApi.state, DEMO_MODE ? DEMO_DEALS : null);
  const remind = readyOr(remindApi.state, DEMO_MODE ? DEMO_REMIND : null);
  const audiences = readyOr(audiencesApi.state, DEMO_MODE ? DEMO_AUDIENCES : null);
  /* The subscriber chip. A 403 (Starter has no `identified_profiles`) and a
     server without passes both land here as `null`, and `null` means no chip
     on anybody — never a guess at who holds one. */
  const members = readyOr(membersApi.state, DEMO_MODE ? DEMO_PASS_MEMBERS : null);

  const toEuro = (minor: number) => minorToEuro(minor, currency);

  /* A person's current pass, if they share with the venue and hold one. A
     cancelled holding still runs to its period end, so it is still a chip. */
  const memberOf = useMemo(() => {
    const map = new Map<string, PassMember>();
    for (const row of members?.rows ?? []) {
      const held = map.get(row.userId);
      if (!held || (held.status === 'cancelled' && row.status !== 'cancelled')) map.set(row.userId, row);
    }
    return map;
  }, [members]);

  const nobody =
    roster !== null &&
    roster.totalCustomers === 0 &&
    (data.overview.visits.value ?? 0) === 0 &&
    data.heatmap.total === 0;

  /* v3's empty screen: nothing on the page can fill in until somebody scans.
     No button under it — the next step is a QR code on a counter, and no
     screen of this dashboard prints one (the rule `dashboard.md` states). */
  if (nobody) {
    return (
      <EmptyState icon="scans" title={dashboard.empty.customers.title} body={dashboard.empty.customers.body} />
    );
  }

  return (
    <>
      <CostHero data={data} toEuro={toEuro} />

      <RosterCard
        roster={roster}
        rosterState={customersApi.state}
        campaigns={campaigns}
        deals={deals}
        memberOf={memberOf}
        toEuro={toEuro}
        liveId={liveId}
        currency={currency}
      />

      <HeatCard data={data} />
      <LanguageCard data={data} deals={deals} />
      <ComeBackCard data={data} remind={remind} reloadRemind={remindApi.reload} audiences={audiences} liveId={liveId} />
      <ComparePair data={data} deals={deals} toEuro={toEuro} />
    </>
  );
}

/* ═════════════════════════════════════════════════════ what one costs ══ */

/**
 * The ink slab: one figure, its four addends, and the months behind it.
 *
 * Two states the server can put it in, and neither is a zero. **Suppressed**:
 * the cost is a finding about however many people came in new, withheld below
 * the floor — v3's "thin" state, which shows the count instead and says why.
 * **Not on this plan**: `costPerNewCustomerTrend` is absent rather than empty.
 */
function CostHero({ data, toEuro }: { data: AnalyticsResponse; toEuro: (minor: number) => number }) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.customers;
  const page = copy.page;
  const money = useMoney();
  const num = useNum();
  const monthName = useMonthName();
  const { goTo } = useDashboard();

  const cost = data.costPerNewCustomer;
  const trend = data.costPerNewCustomerTrend;
  const month = monthName(cost.period);
  const each = cost.costPerNewCustomerMinor.suppressed ? null : cost.costPerNewCustomerMinor.value;
  const thin = each === null;

  /* Withheld months draw no bar and are left out of the scale — counting one as
     0 would make every other bar look tall. */
  const measured = (trend ?? []).filter((m) => !m.costPerNewCustomerMinor.suppressed && m.costPerNewCustomerMinor.value !== null);
  const peak = Math.max(0, ...measured.map((m) => m.costPerNewCustomerMinor.value ?? 0));

  /* The finding compares this month with the oldest measured month in the
     trend, which is what "down from … in June" is in v3. Flat inside 3%, so a
     few pence either way is not reported as a direction. */
  const first = measured[0];
  let finding: string | null = null;
  if (!thin && each !== null && first && first.period !== cost.period) {
    const then = first.costPerNewCustomerMinor.value ?? 0;
    const ratio = then > 0 ? each / then : 1;
    const key = ratio < 0.97 ? 'findingDown' : ratio > 1.03 ? 'findingUp' : 'findingFlat';
    finding = fill(page[key], {
      now: money(toEuro(each), 'unit'),
      then: money(toEuro(then), 'unit'),
      month,
      first: monthName(first.period),
    });
  }

  /* `cost_per_new_customer` is the metric `computeBenchmarks` writes; the older
     demo spelling ends in `_minor`, so the prefix is what is matched. */
  const bench = data.benchmarks?.find((row) => row.metric.startsWith('cost_per_new_customer')) ?? null;
  const breakdown = [
    cost.breakdown.subscription,
    cost.breakdown.loyalty,
    cost.breakdown.vouchers,
    cost.breakdown.deals,
  ];

  return (
    <Card tone="ink" className="dx-customers-hero" aria-label={copy.costKicker}>
      <div className="dx-customers-hero-main">
        <Eyebrow tone="mint">{thin ? page.thinKicker : copy.costKicker}</Eyebrow>
        <div className="dx-customers-hero-figure">
          <span className="dx-customers-hero-value">
            {thin ? num(cost.newCustomers) : <Figure metric={cost.costPerNewCustomerMinor} format={(v) => money(toEuro(v), 'unit')} />}
          </span>
          <span className="dx-customers-hero-unit">
            {thin ? fill(page.thinUnit, { month }) : fill(copy.costUnit, { month })}
          </span>
        </div>
        <p className="dx-customers-hero-line">
          {thin
            ? page.thinLine
            : fill(copy.costLine, {
                cost: money(toEuro(cost.spendMinor), 'exact'),
                month,
                n: num(cost.newCustomers),
                each: money(toEuro(each ?? 0), 'unit'),
              })}
        </p>
        <div className="dx-customers-tiles">
          {copy.costBreakdown.map((label, index) => (
            <div key={label}>
              <span>{label}</span>
              <b>{money(toEuro(breakdown[index] ?? 0), 'exact')}</b>
            </div>
          ))}
        </div>
        {!thin && (
          <div className="dx-customers-hero-foot">
            {finding && <p>{finding}</p>}
            {/* A button goes where its words say. */}
            <button type="button" className="dx-customers-hero-act" onClick={() => goTo('deals')}>
              {copy.costAction}
            </button>
          </div>
        )}
      </div>

      <aside className="dx-customers-hero-side">
        <span className="dx-customers-side-kicker">{copy.trendTitle}</span>
        {trend === undefined ? (
          <p className="dx-customers-side-note">{dashboard.unmeasured.planLocked}</p>
        ) : measured.length === 0 ? (
          <p className="dx-customers-side-note">{page.trendNone}</p>
        ) : (
          <div className="dx-customers-trend">
            {trend.map((m) => {
              const value = m.costPerNewCustomerMinor.suppressed ? null : m.costPerNewCustomerMinor.value;
              const current = m.period === cost.period;
              return (
                <div key={m.period} data-on={current ? 'true' : undefined}>
                  <span className="dx-customers-trend-value">
                    <Figure metric={m.costPerNewCustomerMinor} format={(v) => money(toEuro(v), 'unit')} />
                  </span>
                  {value !== null && peak > 0 && (
                    <i style={{ height: `${Math.max(8, Math.round((value / peak) * 78))}px` }} />
                  )}
                  <em>{monthName(m.period)}</em>
                </div>
              );
            })}
          </div>
        )}
        {bench !== null && !thin && (
          <p className="dx-customers-side-note">
            {fill(page.benchmark, { amount: money(toEuro(bench.value), 'unit'), n: num(bench.venue_count) })}
          </p>
        )}
      </aside>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════ the roster ══ */

/**
 * v3's three statuses over the server's five words.
 *
 * `profiles.deriveStatus` says `regular`, `high_value`, `at_risk`, `lapsed` or
 * `new`; v3 draws Regular, Slipping away and New, and carries "valuable" as a
 * separate fact — the ink avatar and the Top spenders chip. Folding loses
 * nothing: `at_risk` is a valuable customer who has gone quiet, so it is
 * Slipping away *and* a top spender, and `high_value` is a regular who is one.
 * A word the server grows later folds into Regular rather than printing itself.
 */
type Status = 'regular' | 'away' | 'new';

const statusOf = (word: string): Status =>
  word === 'at_risk' || word === 'lapsed' ? 'away' : word === 'new' ? 'new' : 'regular';

const isTop = (word: string) => word === 'high_value' || word === 'at_risk';

type Filter = 'all' | 'regular' | 'away' | 'new' | 'top' | 'members';
type SortKey = 'spent' | 'visits' | 'last' | 'status';

/** The denominator under a stamp count: every active campaign's `visits_required`, summed. */
function stampTarget(campaigns: Array<{ status: string; visits_required: number }> | null): number | null {
  if (!campaigns) return null;
  const total = campaigns
    .filter((row) => row.status === 'active')
    .reduce((sum, row) => sum + Math.max(0, row.visits_required), 0);
  return total > 0 ? total : null;
}

/** "Today", "1 day ago", "N days ago". */
function useSince() {
  const copy = useCopy().dashboard.customers;
  const num = useNum();
  return (days: number) =>
    days <= 0 ? copy.today : days === 1 ? copy.dayAgo : fill(copy.daysAgo, { n: num(days) });
}

/**
 * The people, six filters, four sortable columns, and a row that opens.
 *
 * The detail **replaces** the list inside the same card, which is v3's
 * arrangement and the reason the open person is state here rather than in the
 * row: a back button has to put the list back exactly as it was left.
 */
function RosterCard({
  roster,
  rosterState,
  campaigns,
  deals,
  memberOf,
  toEuro,
  liveId,
  currency,
}: {
  roster: { totalCustomers: number; sharedCustomers: number; rows: CustomerRowResponse[] } | null;
  rosterState: { status: string; error?: unknown };
  campaigns: Array<{ status: string; visits_required: number }> | null;
  deals: DealResponse[] | null;
  memberOf: Map<string, PassMember>;
  toEuro: (minor: number) => number;
  liveId: string | null;
  currency: string;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.customers;
  const page = copy.page;
  const money = useMoney();
  const num = useNum();
  const since = useSince();

  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'spent', desc: true });
  const [openId, setOpenId] = useState<string | null>(null);

  const target = stampTarget(campaigns);
  const rows = roster?.rows ?? [];
  const open = openId === null ? null : rows.find((row) => row.userId === openId) ?? null;

  if (open) {
    return (
      <Card className="dx-customers-card">
        <CustomerDetail
          row={open}
          member={memberOf.get(open.userId) ?? null}
          liveId={liveId}
          currency={currency}
          deals={deals}
          onBack={() => setOpenId(null)}
        />
      </Card>
    );
  }

  const matches = (row: CustomerRowResponse, f: Filter) =>
    f === 'all'
      ? true
      : f === 'top'
        ? isTop(row.status)
        : f === 'members'
          ? memberOf.has(row.userId)
          : statusOf(row.status) === f;

  /* A chip with nobody under it is not drawn — v3's rule, and the honest one:
     a "Subscribers 0" chip offers a press whose only outcome is an empty list. */
  const chips = (['all', 'regular', 'away', 'new', 'top', 'members'] as const)
    .map((f) => ({ f, n: rows.filter((row) => matches(row, f)).length }))
    .filter((chip) => chip.f === 'all' || chip.n > 0);

  const statusRank: Record<Status, number> = { regular: 0, away: 1, new: 2 };
  const shown = rows
    .filter((row) => matches(row, filter))
    .sort((a, b) => {
      const by =
        sort.key === 'spent'
          ? a.spendMinor - b.spendMinor
          : sort.key === 'visits'
            ? a.visits - b.visits
            : sort.key === 'last'
              ? b.daysSince - a.daysSince
              : statusRank[statusOf(a.status)] - statusRank[statusOf(b.status)];
      return sort.desc ? -by : by;
    });

  const sortHead = (key: SortKey, label: string) => (
    <button
      type="button"
      className="dx-customers-sort"
      data-on={sort.key === key ? 'true' : undefined}
      aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : undefined}
      onClick={() => setSort((was) => ({ key, desc: was.key === key ? !was.desc : true }))}
    >
      {label}
      {sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}
    </button>
  );

  return (
    <Card className="dx-customers-card">
      <div className="dx-customers-roster-head">
        <div>
          <h2>{copy.rosterTitle}</h2>
          {roster && (
            <p>
              {fill(copy.rosterIntro, { n: num(roster.sharedCustomers), total: num(roster.totalCustomers) })}
            </p>
          )}
        </div>
        {roster && roster.sharedCustomers > 0 && (
          <span className="dx-customers-sharing">
            <DxIcon name="shield" size={15} strokeWidth={1.9} />
            {fill(copy.rosterCount, { n: num(roster.sharedCustomers) })}
          </span>
        )}
      </div>

      {roster === null ? (
        <p className="dx-customers-note">
          {rosterState.status === 'loading'
            ? dashboard.unmeasured.asking
            : rosterState.status === 'error' &&
                rosterState.error instanceof ApiError &&
                rosterState.error.status === 403
              ? dashboard.unmeasured.planLocked
              : dashboard.unmeasured.serverSilent}
        </p>
      ) : rows.length === 0 ? (
        <div className="dx-customers-empty">
          <span className="dx-customers-empty-ico">
            <DxIcon name="userPlus" size={20} />
          </span>
          <h3>{page.emptyTitle}</h3>
          <p>{page.emptyBody}</p>
        </div>
      ) : (
        <>
          {/* v3's thin state: the list exists but is a handful. */}
          {roster.sharedCustomers < 5 && <div className="dx-customers-few">{page.fewNote}</div>}

          <div className="dx-customers-chips" role="group" aria-label={copy.rosterTitle}>
            {chips.map(({ f, n }) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {page.filters[f]}
                {'  '}
                {num(n)}
              </button>
            ))}
          </div>

          <div className="dx-customers-scroll">
            <div className="dx-customers-grid" role="table" aria-label={copy.rosterTitle}>
              <div className="dx-customers-row" data-head="true" role="row">
                <span role="columnheader">{page.columns.customer}</span>
                <span role="columnheader">{sortHead('spent', page.columns.spent)}</span>
                <span role="columnheader">{sortHead('visits', page.columns.visits)}</span>
                <span role="columnheader">{page.columns.vouchers}</span>
                <span role="columnheader">{sortHead('last', page.columns.last)}</span>
                <span role="columnheader">{sortHead('status', page.columns.status)}</span>
                <span aria-hidden="true" />
              </div>

              {shown.map((row) => {
                const status = statusOf(row.status);
                const member = memberOf.get(row.userId) ?? null;
                const stamps =
                  row.tierPct === undefined && target !== null && row.stamps <= target
                    ? { done: row.stamps, of: target }
                    : null;
                const progress = row.tierPct !== undefined ? 100 : stamps ? Math.round((stamps.done / stamps.of) * 100) : null;
                const issued = row.vouchersIssued;
                const used = row.vouchersUsed;
                return (
                  <button
                    key={row.userId}
                    type="button"
                    className="dx-customers-row"
                    role="row"
                    aria-label={fill(page.open, { name: row.name })}
                    onClick={() => setOpenId(row.userId)}
                  >
                    <span className="dx-customers-who" role="cell">
                      {/* Initials, never a photograph — no third-party request. */}
                      <i className="dx-customers-avatar" data-top={isTop(row.status) ? 'true' : undefined} aria-hidden="true">
                        {initialsOf(row.name)}
                      </i>
                      <span>
                        <b>{row.name}</b>
                        {progress !== null && (
                          <span className="dx-customers-prog">
                            <s>
                              <u data-tier={row.tierPct !== undefined ? 'true' : undefined} style={{ width: `${progress}%` }} />
                            </s>
                            <em>
                              {row.tierPct !== undefined
                                ? fill(page.tier, { n: num(row.tierPct) })
                                : stamps
                                  ? fill(page.stamps, { done: num(stamps.done), of: num(stamps.of) })
                                  : ''}
                            </em>
                          </span>
                        )}
                      </span>
                    </span>

                    <span className="dx-customers-spent" role="cell">
                      {/* No mark when the direction is unknown: a dash would
                          claim we looked and it did not move. */}
                      {row.spendTrend !== undefined && (
                        <i data-trend={row.spendTrend} aria-hidden="true">
                          {row.spendTrend === 'up' ? '▲' : row.spendTrend === 'down' ? '▼' : '—'}
                        </i>
                      )}
                      {money(toEuro(row.spendMinor), 'exact')}
                    </span>

                    <span className="dx-customers-quiet" role="cell">{num(row.visits)}</span>

                    {/* Absent against an older API: the em dash, never "0 / 0". */}
                    <span
                      className="dx-customers-vouchers"
                      role="cell"
                      data-open={issued !== undefined && used !== undefined && issued - used > 0 ? 'true' : undefined}
                    >
                      {issued === undefined || used === undefined ? (
                        <span className="dx-customers-dash">—</span>
                      ) : (
                        <>
                          <b>{num(used)}</b>
                          <span> / {num(issued)}</span>
                        </>
                      )}
                    </span>

                    <span className="dx-customers-quiet" role="cell" data-away={status === 'away' ? 'true' : undefined}>
                      {since(row.daysSince)}
                    </span>

                    <span className="dx-customers-status-cell" role="cell">
                      <span className="dx-customers-status" data-s={status}>
                        {page.statuses[status]}
                      </span>
                      {member && (
                        <Pill tone="purple" size="sm">
                          {member.passName}
                        </Pill>
                      )}
                    </span>

                    <span className="dx-customers-chev" aria-hidden="true">
                      <DxIcon name="chevronRight" size={15} strokeWidth={2} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {roster.sharedCustomers > rows.length && (
            <p className="dx-customers-foot">
              {fill(page.shown, { n: num(rows.length), total: num(roster.sharedCustomers) })}
            </p>
          )}
          <p className="dx-customers-foot" data-lead="true">{copy.withdrew}</p>
        </>
      )}
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════ one person ══ */

/**
 * One person, read from `GET …/customers/:userId` — which re-checks the sharing
 * grant, so somebody who withdrew between the list and the press reads as "not
 * sharing with you any more" rather than as an error. Everything is about this
 * venue; the server leaves out their balance and their other venues, and this
 * panel has nowhere to put them.
 */
function CustomerDetail({
  row,
  member,
  liveId,
  currency,
  deals,
  onBack,
}: {
  row: CustomerRowResponse;
  member: PassMember | null;
  liveId: string | null;
  currency: string;
  deals: DealResponse[] | null;
  onBack: () => void;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.customers;
  const page = copy.page;
  const money = useMoney();
  const num = useNum();
  const since = useSince();
  const formats = useFormats();
  const { goTo } = useDashboard();

  const api = usePartnerCustomer(liveId, row.userId);
  const detail: CustomerDetailResponse | null = readyOr(api.state, DEMO_MODE ? demoCustomerDetail(row.userId) : null);
  const toEuro = (minor: number) => minorToEuro(minor, currency);
  const status = statusOf(detail?.status ?? row.status);
  const firstName = row.name.trim().split(/\s+/)[0] ?? row.name;

  const back = (
    <button type="button" className="dx-customers-back" onClick={onBack}>
      <DxIcon name="chevronLeft" size={15} strokeWidth={2} />
      <span>{page.back}</span>
    </button>
  );

  if (detail === null) {
    return (
      <div className="dx-customers-detail">
        {back}
        <p className="dx-customers-note">
          {api.state.status === 'loading'
            ? dashboard.unmeasured.asking
            : api.state.status === 'error' && api.state.error.status === 404
              ? copy.detail.gone
              : dashboard.unmeasured.serverSilent}
        </p>
      </div>
    );
  }

  const issued = detail.vouchersIssued ?? row.vouchersIssued;
  const used = detail.vouchersUsed ?? row.vouchersUsed;
  const months = detail.trend.slice(-6);
  const spendPeak = Math.max(0, ...months.map((m) => m.spend));

  /* The reward that is closest to paying out: a voucher tier if they have one
     (v3 draws a tier as a full bar), otherwise the fullest stamp card. */
  const card = [...detail.stamps].sort(
    (a, b) => b.stamps / Math.max(1, b.required) - a.stamps / Math.max(1, a.required),
  )[0];
  const titles = new Map((deals ?? []).map((deal) => [deal.id, deal.copy?.title || deal.discount_text || ''] as const));
  /* Claims only — an open is not a use — once per deal, and only deals this
     venue can still name. A title that misses prints nothing, never an id. */
  const usedDeals = [...new Set(detail.deals.filter((e) => e.event_type === 'claim').map((e) => e.deal_id))]
    .map((id) => titles.get(id) ?? '')
    .filter(Boolean)
    .slice(0, 5);
  const top = detail.visitPattern[0];

  const stats: Array<{ label: string; value: string }> = [
    { label: page.stats.spent, value: money(toEuro(detail.lifetimeValueMinor), 'exact') },
    { label: page.stats.visits, value: num(detail.visits) },
    {
      label: page.stats.average,
      value: detail.visits > 0 ? money(toEuro(detail.lifetimeValueMinor / detail.visits), 'unit') : '—',
    },
    {
      label: page.stats.vouchers,
      value: issued === undefined || used === undefined ? '—' : fill(page.vouchersOf, { used: num(used), issued: num(issued) }),
    },
    { label: page.stats.last, value: since(row.daysSince) },
  ];

  return (
    <div className="dx-customers-detail">
      {back}

      <div className="dx-customers-person">
        <i className="dx-customers-avatar" data-size="lg" data-top={isTop(detail.status) ? 'true' : undefined} aria-hidden="true">
          {initialsOf(detail.name)}
        </i>
        <div>
          <div className="dx-customers-person-name">
            <h2>{detail.name}</h2>
            <span className="dx-customers-status" data-s={status} data-size="lg">
              {page.statuses[status]}
            </span>
          </div>
          <p>
            {detail.sharingSince
              ? fill(page.sharingSince, { date: formats.monthYear(detail.sharingSince) })
              : fill(page.firstVisit, { date: formats.date(detail.firstSeenAt) })}
          </p>
        </div>
      </div>

      <div className="dx-customers-privacy">
        <DxIcon name="shield" size={15} strokeWidth={1.9} />
        <span>{fill(page.privacy, { name: firstName })}</span>
      </div>

      {member && (
        <div className="dx-customers-pass">
          <span className="dx-customers-pass-ico" data-accent={member.accent} aria-hidden="true">
            <DxIcon name="passes" size={17} strokeWidth={1.9} />
          </span>
          <div className="dx-customers-pass-name">
            <span>{page.passKicker}</span>
            <b>{member.passName}</b>
          </div>
          <div className="dx-customers-pass-facts">
            <div>
              <span>{page.passSince}</span>
              <b>{formats.monthYear(member.since)}</b>
            </div>
            <div>
              <span>{page.passUsed}</span>
              <b>{num(member.usedThisPeriod)}</b>
            </div>
            <Pill tone={member.status === 'trialing' ? 'warn' : member.status === 'cancelled' ? 'down' : 'active'} size="sm">
              {page.passStatus[member.status]}
            </Pill>
          </div>
        </div>
      )}

      <div className="dx-customers-stats">
        {stats.map((stat) => (
          <div key={stat.label}>
            <span>{stat.label}</span>
            <b>{stat.value}</b>
          </div>
        ))}
      </div>

      <div className="dx-customers-detail-grid">
        <div className="dx-customers-panel" data-wide="true">
          <span className="dx-customers-kicker">{page.spendKicker}</span>
          {months.length === 0 || spendPeak === 0 ? (
            <p className="dx-customers-quiet-line">{copy.detail.none}</p>
          ) : (
            <div
              className="dx-customers-months"
              role="img"
              aria-label={months.map((m) => `${formats.month(m.month)} ${money(toEuro(m.spend), 'exact')}`).join(', ')}
            >
              {months.map((m, index) => (
                <div key={m.month} title={money(toEuro(m.spend), 'exact')}>
                  <i
                    data-on={index === months.length - 1 ? 'true' : undefined}
                    style={{ height: `${Math.max(7, Math.round((m.spend / spendPeak) * 72))}px` }}
                  />
                  <em>{formats.month(m.month)}</em>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dx-customers-detail-side">
          <div className="dx-customers-panel">
            <span className="dx-customers-kicker">{page.rewardKicker}</span>
            {row.tierPct !== undefined ? (
              <>
                <b className="dx-customers-reward">{fill(page.rewardTier, { n: num(row.tierPct) })}</b>
                <s className="dx-customers-bar">
                  <u data-tier="true" style={{ width: '100%' }} />
                </s>
                <p className="dx-customers-quiet-line">{page.rewardTierNote}</p>
              </>
            ) : card ? (
              <>
                <b className="dx-customers-reward">
                  {fill(page.rewardStamps, { done: num(card.stamps), need: num(card.required) })}
                </b>
                <s className="dx-customers-bar">
                  <u style={{ width: `${Math.min(100, Math.round((card.stamps / Math.max(1, card.required)) * 100))}%` }} />
                </s>
                <p className="dx-customers-quiet-line">{card.name}</p>
              </>
            ) : (
              <p className="dx-customers-quiet-line">{page.rewardNone}</p>
            )}
          </div>

          <div className="dx-customers-panel">
            <span className="dx-customers-kicker">{page.usedKicker}</span>
            {usedDeals.length === 0 ? (
              <p className="dx-customers-faint-line">{page.usedNone}</p>
            ) : (
              <ul className="dx-customers-used">
                {usedDeals.map((title) => (
                  <li key={title}>
                    <DxIcon name="check" size={15} strokeWidth={2.2} />
                    <span>{title}</span>
                  </li>
                ))}
              </ul>
            )}
            {detail.stamps[0] && (
              <p className="dx-customers-campaign">{fill(page.inCampaign, { name: detail.stamps[0].name })}</p>
            )}
          </div>
        </div>
      </div>

      <div className="dx-customers-finding" data-tight="true">
        <div>
          <span className="dx-customers-kicker">{page.whenKicker}</span>
          <p>
            {top
              ? fill(page.pattern, { day: formats.weekday(top.local_weekday), time: formats.hour(top.local_hour) })
              : page.patternNone}
          </p>
        </div>
        {/* The one way on from a person that has something behind it. */}
        <div className="dx-customers-finding-acts">
          <Button variant="secondary" onClick={() => goTo('assistant')}>
            {page.build}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════ the heat map ══ */

function HeatCard({ data }: { data: AnalyticsResponse }) {
  const copy = useCopy().dashboard.customers;
  const page = copy.page;
  const num = useNum();
  const formats = useFormats();
  const { goTo, openDrawer, toast } = useDashboard();

  const map = data.heatmap;
  const grid = heatFromApi(map.grid);
  const max = Math.max(0, ...grid.flat());

  /* "Below your average hour": the mean over the hours anybody came in at, so a
     closed night does not drag the average down and flatter the quiet hour. */
  const busyCells = map.grid.flat().filter((n) => n > 0);
  const average = busyCells.length ? busyCells.reduce((s, n) => s + n, 0) / busyCells.length : 0;
  const quiet = map.quietest;
  const pct = quiet && average > 0 ? Math.round((1 - quiet.visits / average) * 100) : 0;

  return (
    <Card className="dx-customers-card">
      <CardHead title={copy.whenTitle} sub={page.heatLede} />
      {map.total === 0 || max === 0 ? (
        <p className="dx-customers-note">{page.heatEmpty}</p>
      ) : (
        <>
          <div className="dx-customers-scroll">
            <div className="dx-customers-heat" role="img" aria-label={copy.whenTitle}>
              <div className="dx-customers-heat-row" data-head="true">
                <span />
                {HEAT_HOURS.map((hour, i) => (
                  <em key={hour}>{i % 2 === 0 ? formats.hour(hour) : ''}</em>
                ))}
              </div>
              {grid.map((row, day) => (
                <div className="dx-customers-heat-row" key={day}>
                  <span>{copy.days[day]}</span>
                  {row.map((v, i) => (
                    <i
                      key={HEAT_HOURS[i]}
                      title={fill(page.heatTitle, {
                        time: formats.hour(HEAT_HOURS[i]),
                        day: formats.weekday(day),
                        n: num(v),
                      })}
                      style={{ ['--a' as string]: (0.06 + (v / max) * 0.82).toFixed(2) }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {quiet && pct > 0 && (
            <div className="dx-customers-finding">
              <p>
                {fill(page.quiet, {
                  day: formats.weekday(quiet.weekday),
                  time: formats.hour(quiet.hour),
                  pct: num(pct),
                })}
              </p>
              <div className="dx-customers-finding-acts">
                <Button variant="primary" onClick={() => goTo('assistant')}>
                  {copy.quietAction}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    openDrawer('deal', undefined, {
                      deal: {
                        targetWeekdays: [quiet.weekday],
                        targetFromMin: quiet.hour * 60,
                        targetToMin: Math.min(24 * 60, (quiet.hour + 1) * 60),
                      },
                    });
                    toast(page.quietToast);
                  }}
                >
                  {copy.quietSelf}
                </Button>
              </div>
            </div>
          )}
          {map.busiest && map.busiest.visits > 0 && (
            <p className="dx-customers-foot" data-gap="true">
              {fill(page.busy, { day: formats.weekday(map.busiest.weekday), time: formats.hour(map.busiest.hour) })}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

/* ══════════════════════════════════════════════════════════ the languages ══ */

/**
 * The smallest group drawn under its own name. Matches the "groups smaller than
 * 10" in `readLede` — the server floors the whole mix but not each row, so the
 * rolling-up is done here, before a single Uzbek speaker becomes a bar.
 */
const LANGUAGE_GROUP_FLOOR = 10;

function LanguageCard({ data, deals }: { data: AnalyticsResponse; deals: DealResponse[] | null }) {
  const copy = useCopy().dashboard.customers;
  const page = copy.page;
  const num = useNum();
  const formats = useFormats();
  const { openDrawer } = useDashboard();
  const mix = data.languageMix;

  const rows = useMemo(() => {
    if (mix.suppressed) return [];
    const named: Array<{ code: string | null; n: number; share: number }> = [];
    let other = 0;
    for (const row of mix.rows) {
      const n = Math.round(row.share * mix.total);
      if (n < LANGUAGE_GROUP_FLOOR) other += row.share;
      else named.push({ code: row.language, n, share: row.share });
    }
    named.sort((a, b) => b.share - a.share);
    if (other > 0) named.push({ code: null, n: 0, share: other });
    return named;
  }, [mix]);

  const topShare = Math.max(0, ...rows.map((row) => row.share));
  /* The finding: the largest named group no live deal is written in. Only
     with at least one live deal — "none of your live deals" over a venue with
     none is true and says nothing. */
  const live = (deals ?? []).filter((deal) => deal.status === 'live');
  const gap =
    live.length > 0
      ? rows.find((row) => row.code !== null && !live.some((deal) => deal.translations.filled.includes(row.code as string)))
      : undefined;

  return (
    <Card className="dx-customers-card">
      <CardHead title={copy.readTitle} sub={copy.readLede} />
      {mix.suppressed || rows.length === 0 ? (
        <p className="dx-customers-note">{page.langSuppressed}</p>
      ) : (
        <>
          <div className="dx-customers-langs">
            <span className="dx-customers-kicker" data-tone="faint">{copy.langKicker}</span>
            <div>
              {rows.map((row) => {
                const pct = Math.round(row.share * 100);
                return (
                  <div key={row.code ?? 'other'} className="dx-customers-lang">
                    <div>
                      <span>{row.code === null ? page.langOther : formats.language(row.code)}</span>
                      <em>
                        {row.code === null
                          ? `${num(pct)}%`
                          : fill(copy.nationCount, { n: num(row.n), pct: num(pct) })}
                      </em>
                    </div>
                    <s className="dx-customers-bar" data-h="9">
                      <u data-tier={row.code === null ? 'other' : 'true'} style={{ width: `${((row.share / topShare) * 100).toFixed(1)}%` }} />
                    </s>
                  </div>
                );
              })}
            </div>
            <p className="dx-customers-faint-line">{page.langHidden}</p>
          </div>

          {gap && gap.code !== null && (
            <div className="dx-customers-finding">
              <p>
                {fill(page.langFinding, {
                  pct: num(Math.round(gap.share * 100)),
                  language: formats.language(gap.code),
                })}
              </p>
              <div className="dx-customers-finding-acts">
                <Button variant="primary" onClick={() => openDrawer('deal')}>
                  {copy.langAction}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════ do they come back ══ */

/** `CONFIG.deals.lapsedDays` on the server — the window the `lapsed` audience counts over. */
const LAPSED_DAYS = 60;

function ComeBackCard({
  data,
  remind,
  reloadRemind,
  audiences,
  liveId,
}: {
  data: AnalyticsResponse;
  remind: RemindStatus | null;
  reloadRemind: () => void;
  audiences: Array<{ segment: string; reach: { value: number | null; suppressed: boolean } }> | null;
  liveId: string | null;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.customers;
  const page = copy.page;
  const num = useNum();
  const monthName = useMonthName();

  const cohorts = (data.cohorts ?? []).filter((c) => c.size > 0);
  /* The latest month whose return rate is reportable — a suppressed one is a
     month of too few first-timers, not a month nobody came back. */
  const latest = [...cohorts].reverse().find((c) => !c.returned.suppressed && c.returned.value !== null);
  const lapsed = audiences?.find((row) => row.segment === 'lapsed')?.reach ?? null;

  return (
    <Card className="dx-customers-card">
      <CardHead title={copy.backTitle} sub={copy.backLede} />
      {data.cohorts === undefined ? (
        <p className="dx-customers-note">{dashboard.unmeasured.planLocked}</p>
      ) : !latest ? (
        <div className="dx-customers-thin">
          <DxIcon name="clock" size={17} strokeWidth={1.9} />
          <span>{page.backNone}</span>
        </div>
      ) : (
        <>
          <p className="dx-customers-statement">
            {fill(copy.backFinding, {
              first: num(latest.size),
              month: monthName(latest.cohort),
              back: num(Math.round((latest.returned.value ?? 0) * latest.size)),
              pct: num(Math.round((latest.returned.value ?? 0) * 100)),
            })}
          </p>
          <div className="dx-customers-cohorts">
            {cohorts.map((c) => {
              const share = c.returned.suppressed ? null : c.returned.value;
              return (
                <div key={c.cohort}>
                  <span>{monthName(c.cohort)}</span>
                  <s className="dx-customers-bar" data-h="8">
                    {share !== null && <u data-tier="true" style={{ width: `${Math.round(share * 100)}%` }} />}
                  </s>
                  <em>
                    {share === null
                      ? '—'
                      : fill(copy.cohort, {
                          back: num(Math.round(share * c.size)),
                          first: num(c.size),
                          pct: num(Math.round(share * 100)),
                        })}
                  </em>
                </div>
              );
            })}
          </div>
        </>
      )}

      {lapsed && !lapsed.suppressed && (lapsed.value ?? 0) > 0 && (
        <p className="dx-customers-foot" data-gap="true">
          {fill(page.lapsedLine, { n: num(lapsed.value ?? 0), days: num(LAPSED_DAYS) })}
        </p>
      )}

      <RemindPanel remind={remind} reload={reloadRemind} liveId={liveId} />
    </Card>
  );
}

/** Whether a reminder is still inside the week the server makes owners wait. */
const remindWaiting = (remind: RemindStatus) =>
  remind.nextAllowedAt !== null && Date.parse(remind.nextAllowedAt) > Date.now();

/**
 * v3's "Remind them", wired to `POST …/remind`.
 *
 * The mock put it under the lapsed regulars; the endpoint reaches the people
 * holding an unused reward or voucher, so the sentence beside it says *that*
 * audience — a button under "84 lapsed" that messaged 38 other people would be
 * the panel lying about its own press. One a week, and the "Reminded" state is
 * the server's `nextAllowedAt`, not a flag kept here.
 */
function RemindPanel({ remind, reload, liveId }: { remind: RemindStatus | null; reload: () => void; liveId: string | null }) {
  const dashboard = useCopy().dashboard;
  const page = dashboard.customers.page;
  const num = useNum();
  const formats = useFormats();
  const { toast } = useDashboard();
  const [busy, setBusy] = useState(false);

  if (remind === null) return null;
  const waiting = remindWaiting(remind);
  if (!waiting && remind.audience === 0) return null;

  const press = async () => {
    if (busy || waiting) return;
    if (liveId === null) {
      toast(dashboard.unmeasured.noSession);
      return;
    }
    setBusy(true);
    try {
      const sent = await sendReminder(liveId);
      toast(fill(dashboard.campaigns.remindSent, { n: num(sent.audience), queued: num(sent.queued) }));
      reload();
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'conflict' && typeof cause.detail.nextAllowedAt === 'string') {
        toast(fill(dashboard.campaigns.remindTooSoon, { date: formats.date(cause.detail.nextAllowedAt) }));
        reload();
      } else if (cause instanceof ApiError && cause.code === 'invalid_state') {
        toast(dashboard.campaigns.remindNobody);
        reload();
      } else if (cause instanceof ApiError && cause.status === 0) {
        toast(dashboard.acts.offline);
      } else {
        toast(fill(dashboard.acts.refused, { why: cause instanceof Error ? cause.message : String(cause) }));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dx-customers-finding">
      <div>
        <p>{fill(page.remindLine, { n: num(remind.audience) })}</p>
        {remind.lastResult && (
          <span className="dx-customers-finding-note">
            {fill(dashboard.campaigns.remindResult, {
              back: num(remind.lastResult.cameBack),
              of: num(remind.lastResult.audience),
            })}
          </span>
        )}
        {waiting && remind.nextAllowedAt && (
          <span className="dx-customers-finding-note">
            {fill(dashboard.campaigns.remindNext, { date: formats.date(remind.nextAllowedAt) })}
          </span>
        )}
      </div>
      <div className="dx-customers-finding-acts">
        <Button
          variant="primary"
          icon={waiting ? 'check' : 'bell'}
          disabled={waiting || busy}
          aria-busy={busy || undefined}
          onClick={() => void press()}
        >
          {waiting ? dashboard.overview.reminded : page.remind}
        </Button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════ how you compare · money works ══ */

/**
 * The pair v3 locks on Starter. The lock is the server's, not a plan name this
 * file knows: `benchmarks` and `roi` are **absent** on a plan without deep
 * analytics, and absent-on-both is the locked state. A blurred copy of the
 * cards is not drawn under the lock — there are no figures to blur, and
 * blurring invented ones would be the thing this dashboard does not do.
 */
function ComparePair({
  data,
  deals,
  toEuro,
}: {
  data: AnalyticsResponse;
  deals: DealResponse[] | null;
  toEuro: (minor: number) => number;
}) {
  const copy = useCopy().dashboard.customers;
  const page = copy.page;
  const money = useMoney();
  const num = useNum();
  const monthName = useMonthName();
  const { goTo, openPlan } = useDashboard();

  if (data.benchmarks === undefined && data.roi === undefined) {
    return (
      <Card className="dx-customers-lock">
        <DxIcon name="lock" size={22} />
        <b>{page.lockLine}</b>
        <Button variant="secondary" onClick={openPlan}>
          {page.seePlan}
        </Button>
      </Card>
    );
  }

  /* "You" for each benchmark, computed the way `computeBenchmarks` computes the
     peers' — claims over opens across every deal, the mean of the reportable
     cohorts, and this month's cost — so the two columns are one arithmetic. */
  const opened = (deals ?? []).reduce((s, d) => s + d.opened_count, 0);
  const claimed = (deals ?? []).reduce((s, d) => s + d.claimed_count, 0);
  const usable = (data.cohorts ?? []).filter((c) => !c.returned.suppressed && c.returned.value !== null);
  const second = usable.length ? usable.reduce((s, c) => s + (c.returned.value ?? 0), 0) / usable.length : null;
  const cost = data.costPerNewCustomer.costPerNewCustomerMinor;
  const costYou = cost.suppressed ? null : cost.value;

  const pct = (share: number, digits: number) => `${(share * 100).toFixed(digits)}%`;
  const benchRows = (data.benchmarks ?? [])
    .map((row) => {
      const key = row.metric.startsWith('cost_per_new_customer')
        ? 'cost_per_new_customer'
        : row.metric === 'claim_rate' || row.metric === 'second_visit_rate'
          ? row.metric
          : null;
      if (key === null) return null;
      const you =
        key === 'claim_rate' ? (opened > 0 && deals ? claimed / opened : null) : key === 'second_visit_rate' ? second : costYou;
      const show = (v: number) =>
        key === 'cost_per_new_customer' ? money(toEuro(v), 'unit') : pct(v, key === 'claim_rate' ? 1 : 0);
      return {
        key,
        label: page.compareRows[key],
        you: you === null ? '—' : show(you),
        them: show(row.value),
        better: you !== null && (key === 'cost_per_new_customer' ? you < row.value : you > row.value),
        peers: row.venue_count,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  const peers = Math.max(0, ...benchRows.map((row) => row.peers));

  const roiOrder = ['loyalty', 'deals', 'vouchers'] as const;
  const roi = roiOrder
    .map((feature) => data.roi?.find((row) => row.feature === feature))
    .filter((row): row is NonNullable<typeof row> => row !== undefined);
  const roiScreen = { loyalty: 'campaigns', deals: 'deals', vouchers: 'vouchers' } as const;

  return (
    <div className="dx-customers-pair">
      <Card className="dx-customers-card">
        <CardHead
          title={copy.compareTitle}
          sub={benchRows.length ? fill(page.compareNote, { n: num(peers) }) : undefined}
        />
        {benchRows.length === 0 ? (
          <div className="dx-customers-nodata">
            <div>
              <DxIcon name="clock" size={16} strokeWidth={1.9} />
              <b>{page.compareNone}</b>
            </div>
            <span>{page.compareNoneNote}</span>
          </div>
        ) : (
          <div className="dx-customers-rows">
            {benchRows.map((row) => (
              <div key={row.key}>
                <span>{row.label}</span>
                <div>
                  <b data-better={row.better ? 'true' : undefined}>{row.you}</b>
                  <em>{fill(copy.compareThem, { amount: row.them })}</em>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="dx-customers-card">
        <CardHead title={copy.roiTitle} sub={fill(copy.roiLede, { month: monthName(data.costPerNewCustomer.period) })} />
        {roi.length === 0 ? (
          <p className="dx-customers-note">{page.roiNone}</p>
        ) : (
          <div className="dx-customers-rows">
            {roi.map((row) => (
              <div key={row.feature}>
                <div>
                  <button type="button" className="dx-customers-link" onClick={() => goTo(roiScreen[row.feature])}>
                    {page.roiRows[row.feature]}
                  </button>
                  <span className="dx-customers-roi-line">
                    {fill(copy.roiLine, {
                      cost: money(toEuro(row.spendMinor), 'exact'),
                      n: num(row.outcome),
                      unit: page.roiUnits[row.feature],
                    })}
                  </span>
                </div>
                <div>
                  <b>{row.costPerOutcomeMinor === null ? '—' : money(toEuro(row.costPerOutcomeMinor), 'unit')}</b>
                  <em>{page.roiPer[row.feature]}</em>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ formatting ══ */

/**
 * Dates, weekdays, hours and language names in the reader's language.
 *
 * `Intl` for all four — it is only *numbers* this site keeps out of `Intl`
 * (`currency.ts` says why). Weekdays are the server's 0 = Monday; 1 January
 * 2024 was a Monday, which is what anchors the lookup.
 */
function useFormats() {
  const [language] = useLanguage();
  return useMemo(() => {
    const date = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', year: 'numeric' });
    const monthYear = new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric' });
    const month = new Intl.DateTimeFormat(language, { month: 'short', timeZone: 'UTC' });
    const weekday = new Intl.DateTimeFormat(language, { weekday: 'long', timeZone: 'UTC' });
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([language], { type: 'language' });
    } catch {
      names = null;
    }
    const capital = (text: string) => (text ? text[0].toLocaleUpperCase(language) + text.slice(1) : text);
    return {
      date: (iso: string) => date.format(new Date(iso)),
      monthYear: (iso: string) => capital(monthYear.format(new Date(iso))),
      month: (period: string) => capital(month.format(new Date(`${period}-01T12:00:00Z`))),
      weekday: (day: number) => capital(weekday.format(new Date(Date.UTC(2024, 0, 1 + day, 12)))),
      hour: (hour: number) => `${String(hour).padStart(2, '0')}:00`,
      /* The language's own name in the reader's language, or its code where the
         browser cannot name it — a code is still the true answer. */
      language: (code: string) => capital(names?.of(code) ?? code.toUpperCase()),
    };
  }, [language]);
}
