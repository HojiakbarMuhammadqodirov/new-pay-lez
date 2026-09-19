import { Fragment, useMemo, useState } from 'react';

import {
  chain,
  minorToEuro,
  readyOr,
  usePartnerAnalytics,
  usePartnerCampaigns,
  usePartnerCustomer,
  usePartnerCustomers,
  usePartnerDeals,
  usePartnerVenue,
  type CustomerRowResponse,
} from './api/partner';
import {
  DEMO_ANALYTICS,
  DEMO_CAMPAIGNS,
  DEMO_CUSTOMERS,
  DEMO_DEALS,
  DEMO_VENUE,
  demoCustomerDetail,
} from './dashboardDemo';
import { useMonthName, useNum } from './dashboardFormat';
import { Figure, Screen } from './dashboardScreens';
import { useDashboard } from './dashboardShell';
import { DEMO_MODE } from './demoMode';
import { Icon } from './icons';
import { useCopy, useLanguage, useMoney } from './i18n/context';
import { fill } from './i18n/currency';

/**
 * Who comes in, and what it cost to get them.
 *
 * Two panels, and they are two because they answer opposite questions. The ink
 * slab is the **venue's** month — one figure, its four addends, and the two
 * months behind it — and the roster below is the **people**, one row each, which
 * is the only place on this dashboard a customer is named at all.
 *
 * ── the three states, once more ───────────────────────────────────────────
 *
 * `Screen` owns "we could not ask". What this file owns is the two states
 * underneath it that are easy to collapse into a zero:
 *
 *  - **Suppressed.** `costPerNewCustomerMinor` is a fact about however many
 *    people came in new, and the server withholds it below the min-cohort
 *    floor. `Figure` draws the em dash; the sentence under it is dropped.
 *  - **Not on this plan.** `costPerNewCustomerTrend` is *absent* rather than
 *    empty on a venue without deep analytics, and gets `unmeasured.planLocked`.
 *
 * ── a row opens ───────────────────────────────────────────────────────────
 *
 * Pressing a person opens their detail under the row, read from
 * `GET …/customers/:userId` — the same sharing consent the roster is gated on,
 * so a customer who stopped sharing between the two requests reads as "not
 * sharing with you any more" rather than as an error. What it deliberately does
 * not show is anything outside this venue: no global balance, no other venues.
 * The server leaves those out, and the panel has nowhere to put them.
 */
export function Customers() {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.customers;
  const money = useMoney();
  const num = useNum();
  const monthName = useMonthName();
  const { goTo } = useDashboard();

  /* Which segment is showing. 0 is everyone — the absence of a filter. */
  const [people, setPeople] = useState(0);
  /* The spend column's direction, over rows this screen already holds. */
  const [spendDesc, setSpendDesc] = useState(true);

  const venueApi = usePartnerVenue();
  const liveVenue = venueApi.state.status === 'ready' ? venueApi.state.data : null;
  const venue = liveVenue ?? (DEMO_MODE ? DEMO_VENUE : null);
  const liveId = liveVenue?.id ?? null;
  const analyticsApi = usePartnerAnalytics(liveId);
  const customersApi = usePartnerCustomers(liveId);
  /* Not part of `chain`: the campaigns are read for one label — the
     denominator under a stamp count — and the deals for the names of the offers
     a customer's detail lists. Neither may take the screen down with it. */
  const campaignsApi = usePartnerCampaigns(liveId);
  const dealsApi = usePartnerDeals(liveId);
  const state = chain(venueApi, analyticsApi);

  const roster = readyOr(customersApi.state, DEMO_MODE ? DEMO_CUSTOMERS : null);
  const campaigns = readyOr(campaignsApi.state, DEMO_MODE ? DEMO_CAMPAIGNS : null);
  const deals = readyOr(dealsApi.state, DEMO_MODE ? DEMO_DEALS : null);
  const dealTitles = useMemo(
    () =>
      new Map(
        (deals ?? []).map((deal) => [deal.id, deal.copy?.title || deal.discount_text || ''] as const),
      ),
    [deals],
  );

  /* Off the venue row rather than off the budget. */
  const currency = venue?.currency ?? 'EUR';

  return (
    <Screen state={state} index={5} demo={DEMO_ANALYTICS}>
      {(data) => {
        const toEuro = (minor: number) => minorToEuro(minor, currency);
        const cost = data.costPerNewCustomer;
        const trend = data.costPerNewCustomerTrend;
        const costValue = cost.costPerNewCustomerMinor.suppressed
          ? null
          : cost.costPerNewCustomerMinor.value;

        /* The tallest month the row may draw against. Withheld months are
           excluded rather than counted as 0. */
        const trendMax = Math.max(
          0,
          ...(trend ?? [])
            .filter((month) => !month.costPerNewCustomerMinor.suppressed)
            .map((month) => month.costPerNewCustomerMinor.value ?? 0),
        );

        /* What venues like this one pay — absent on a plan without it, and
           withheld until the group is large enough. Never a fallback figure. */
        const benchmark = data.benchmarks?.find((row) => row.metric.includes('cost'))?.value ?? null;

        return (
          <div className="pd-stack">
            {/* What a new customer costs, as one number. `data-ink='paper'`
                re-points the tokens inside the panel rather than a rule per
                child — see `src/site/CLAUDE.md`. */}
            <section className="pd-glass pc-cost" data-ink="paper" data-reveal>
              <div className="pc-cost-main">
                <span className="pc-kicker">{copy.costKicker}</span>

                <p className="pc-headline">
                  <Figure
                    metric={cost.costPerNewCustomerMinor}
                    format={(value) => money(toEuro(value), 'unit')}
                  />
                  <span>{fill(copy.costUnit, { month: monthName(cost.period) })}</span>
                </p>

                {costValue === null ? (
                  <p className="pc-cost-line">{dashboard.unmeasured.withheld}</p>
                ) : (
                  <p className="pc-cost-line">
                    {fill(copy.costLine, {
                      cost: money(toEuro(cost.spendMinor), 'exact'),
                      month: monthName(cost.period),
                      n: num(cost.newCustomers),
                      each: money(toEuro(costValue), 'unit'),
                    })}
                  </p>
                )}

                <div className="pc-boxes">
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

                {/* A button goes where its words say: "see your deals" moves the
                    rail to the deals screen. */}
                <div className="pc-cost-foot">
                  <button type="button" className="pc-act" onClick={() => goTo('deals')}>
                    {copy.costAction}
                    <Icon name="arrow" size={16} />
                  </button>
                </div>
              </div>

              <aside className="pc-trend">
                <span className="pc-eyebrow">{copy.trendTitle}</span>

                {trend === undefined || trend.length === 0 ? (
                  <p className="pc-note">{dashboard.unmeasured.planLocked}</p>
                ) : (
                  <div className="pc-trend-cols">
                    {trend.map((month) => {
                      const value = month.costPerNewCustomerMinor.suppressed
                        ? null
                        : month.costPerNewCustomerMinor.value ?? 0;
                      return (
                        <span
                          key={month.period}
                          data-on={month.period === cost.period ? 'true' : undefined}
                        >
                          <Figure
                            metric={month.costPerNewCustomerMinor}
                            format={(each) => money(toEuro(each), 'unit')}
                          />
                          {/* A withheld month draws no bar at all. */}
                          <i
                            style={{
                              height:
                                value === null || trendMax === 0
                                  ? '0%'
                                  : `${Math.max(8, (value / trendMax) * 100)}%`,
                            }}
                          />
                          <em>{monthName(month.period)}</em>
                        </span>
                      );
                    })}
                  </div>
                )}

                {benchmark !== null && (
                  <p className="pc-note">
                    {fill(copy.benchmark, { amount: money(toEuro(benchmark), 'unit') })}
                  </p>
                )}
              </aside>
            </section>

            {/* The roster, gated twice — by the plan's `identified_profiles`
                entitlement and by an unrevoked sharing consent per person. */}
            <section className="pd-glass pc-roster" data-solid="true" data-reveal>
              <header className="pc-roster-head">
                <div>
                  <h2 className="pc-title">{copy.rosterTitle}</h2>
                  {roster && (
                    <p className="pc-intro">
                      {fill(copy.rosterIntro, {
                        n: num(roster.sharedCustomers),
                        total: num(roster.totalCustomers),
                      })}
                    </p>
                  )}
                </div>
                {roster && (
                  <span className="pc-share">
                    <Icon name="shield" size={14} />
                    {fill(copy.rosterCount, { n: num(roster.sharedCustomers) })}
                  </span>
                )}
              </header>

              {roster === null ? (
                <p className="pc-note">
                  {customersApi.state.status === 'loading'
                    ? dashboard.unmeasured.asking
                    : customersApi.state.status === 'error' &&
                        customersApi.state.error.status === 403
                      ? dashboard.unmeasured.planLocked
                      : dashboard.unmeasured.serverSilent}
                </p>
              ) : roster.rows.length === 0 ? (
                <p className="pc-note">{copy.privacy}</p>
              ) : (
                <Roster
                  rows={roster.rows}
                  stampTarget={stampTarget(campaigns)}
                  people={people}
                  onPeople={setPeople}
                  spendDesc={spendDesc}
                  onSpendDesc={setSpendDesc}
                  toEuro={toEuro}
                  venueId={liveId}
                  currency={currency}
                  dealTitles={dealTitles}
                />
              )}

              <p className="pc-note">{copy.withdrew}</p>
            </section>
          </div>
        );
      }}
    </Screen>
  );
}

/* ─────────────────────────────────────────────────────────────── the list ── */

/**
 * The top rung of the voucher ladder, which is what a tier bar is a share of.
 *
 * A bar drawn at the rung's own percentage would read 15% full for the best
 * customer on the list. The ladder is per-venue and settable, so when the tiers
 * become readable from a customer row this should come off them.
 */
const TIER_TOP = 15;

/**
 * The server's five statuses, each its own segment.
 *
 * `profiles.deriveStatus` returns `regular`, `high_value`, `at_risk`, `lapsed`
 * or `new`, and the roster used to fold the second and third into the first and
 * fourth because the dictionaries had no words for them. They have words now,
 * and the fold is gone: "a valuable customer who has not been in for a month" is
 * a different prompt from "a regular", and the whole point of the server deriving
 * it is that somebody acts on it.
 *
 * Every row still lands in exactly one segment — an unknown word folds into
 * `regular` — so the five chips add up to "Everyone".
 */
const SEGMENTS = ['regular', 'high_value', 'at_risk', 'lapsed', 'new'] as const;
type Segment = (typeof SEGMENTS)[number];

function segmentOf(status: string): Segment {
  return (SEGMENTS as readonly string[]).includes(status) ? (status as Segment) : 'regular';
}

/**
 * The denominator under a stamp count, or nothing — every *active* campaign's
 * `visits_required`, summed, because a row's `stamps` is the sum across cards.
 */
function stampTarget(campaigns: Array<{ status: string; visits_required: number }> | null): number | null {
  if (!campaigns) return null;
  const total = campaigns
    .filter((row) => row.status === 'active')
    .reduce((sum, row) => sum + Math.max(0, row.visits_required), 0);
  return total > 0 ? total : null;
}

/**
 * The people, six filters and one sortable column.
 *
 * A component rather than a block inside the render prop above, because `Screen`
 * *calls* `children(data)` during its own render and a hook written in there
 * would join `Screen`'s hook order.
 */
function Roster({
  rows,
  stampTarget: target,
  people,
  onPeople,
  spendDesc,
  onSpendDesc,
  toEuro,
  venueId,
  currency,
  dealTitles,
}: {
  rows: CustomerRowResponse[];
  stampTarget: number | null;
  people: number;
  onPeople: (index: number) => void;
  spendDesc: boolean;
  onSpendDesc: (desc: boolean) => void;
  toEuro: (minor: number) => number;
  venueId: string | null;
  currency: string;
  dealTitles: Map<string, string>;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.customers;
  const money = useMoney();
  const num = useNum();
  /* One person open at a time: the detail is a panel under a row, and two open
     panels push the rest of the list off the screen. */
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = SEGMENTS.map((segment) => rows.filter((row) => segmentOf(row.status) === segment).length);
  const filtered =
    people === 0 ? rows : rows.filter((row) => segmentOf(row.status) === SEGMENTS[people - 1]);
  const shown = [...filtered].sort((a, b) =>
    spendDesc ? b.spendMinor - a.spendMinor : a.spendMinor - b.spendMinor,
  );

  return (
    <>
      <div className="pc-filters">
        {copy.rosterFilters.map((label, index) => (
          <button
            key={label}
            type="button"
            className="pc-filter"
            data-on={index === people ? 'true' : undefined}
            onClick={() => onPeople(index)}
          >
            {label}
            <i>{num(index === 0 ? rows.length : counts[index - 1] ?? 0)}</i>
          </button>
        ))}
      </div>

      <div className="pc-scroll">
        <table className="pc-table">
          <thead>
            <tr>
              {copy.rosterColumns.map((label, index) => (
                <th
                  key={label}
                  data-align={index === 0 ? 'left' : 'right'}
                  aria-sort={index === 1 ? (spendDesc ? 'descending' : 'ascending') : undefined}
                >
                  {index === 1 ? (
                    <button
                      type="button"
                      className="pc-sort"
                      data-dir={spendDesc ? 'desc' : 'asc'}
                      onClick={() => onSpendDesc(!spendDesc)}
                    >
                      {label}
                      <Icon name="chevron" size={13} />
                    </button>
                  ) : (
                    label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const segment = segmentOf(row.status);
              const open = openId === row.userId;
              const stamps =
                row.tierPct === undefined && target !== null && row.stamps <= target
                  ? { done: row.stamps, of: target }
                  : null;
              const toggle = () => setOpenId(open ? null : row.userId);

              return (
                <Fragment key={row.userId}>
                  {/* The row opens itself — a `<tr>` cannot be a button, so the
                      affordance is the cursor, the hover and `aria-expanded`,
                      and the keyboard reaches it through `tabIndex`. */}
                  <tr
                    className="pc-row"
                    data-open={open ? 'true' : undefined}
                    tabIndex={0}
                    role="button"
                    aria-expanded={open}
                    title={fill(copy.detail.open, { name: row.name })}
                    onClick={toggle}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      toggle();
                    }}
                  >
                    <td>
                      <span className="pc-person">
                        {/* Initials, not a photograph — no third-party runtime
                            request. Filled for a customer the server called
                            `high_value`. */}
                        <i aria-hidden="true" data-top={segment === 'high_value' ? 'true' : undefined}>
                          {initials(row.name)}
                        </i>
                        <span>
                          <b>{row.name}</b>
                          {(row.tierPct !== undefined || stamps !== null) && (
                            <span className="pc-tier">
                              <em>
                                <em
                                  style={{
                                    width: `${
                                      row.tierPct !== undefined
                                        ? Math.min(100, (row.tierPct / TIER_TOP) * 100)
                                        : stamps
                                          ? (stamps.done / stamps.of) * 100
                                          : 0
                                    }%`,
                                  }}
                                />
                              </em>
                              <span>
                                {row.tierPct !== undefined
                                  ? fill(copy.tierProgress, { n: num(row.tierPct) })
                                  : stamps
                                    ? fill(copy.stamps, {
                                        done: num(stamps.done),
                                        of: num(stamps.of),
                                      })
                                    : ''}
                              </span>
                            </span>
                          )}
                        </span>
                      </span>
                    </td>

                    <td data-align="right">
                      <span className="pc-spend">
                        {/* No indicator when the direction is unknown. A neutral
                            dash would say we looked and it did not move. */}
                        {row.spendTrend !== undefined && (
                          <i aria-hidden="true" data-trend={row.spendTrend}>
                            {row.spendTrend === 'up' ? '▲' : row.spendTrend === 'down' ? '▼' : '–'}
                          </i>
                        )}
                        <b>{money(toEuro(row.spendMinor), 'exact')}</b>
                      </span>
                    </td>

                    <td data-align="right" data-quiet="true">
                      {num(row.visits)}
                    </td>

                    {/* Warm when the server has decided they are going — at risk
                        or lapsed — keyed off the *status*, not a day count this
                        file invented a threshold for. */}
                    <td
                      data-align="right"
                      data-quiet="true"
                      data-risk={segment === 'lapsed' || segment === 'at_risk' ? 'true' : undefined}
                    >
                      {row.daysSince === 0
                        ? copy.today
                        : row.daysSince === 1
                          ? copy.dayAgo
                          : fill(copy.daysAgo, { n: num(row.daysSince) })}
                    </td>

                    <td data-align="right">
                      <span className="pc-pill" data-person={segment}>
                        {copy.statuses[segment]}
                      </span>
                    </td>
                  </tr>

                  {open && (
                    <tr className="pc-detail-row">
                      <td colSpan={5}>
                        <CustomerDetail
                          userId={row.userId}
                          venueId={venueId}
                          currency={currency}
                          dealTitles={dealTitles}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * One person, opened under their row.
 *
 * Five facts, then three short lists — visits by month, their stamp cards, and
 * the offers they opened or claimed. Everything is about **this venue**: the
 * server's detail leaves out the customer's global balance and their activity
 * anywhere else, deliberately, and this panel has no slot to put them in.
 */
function CustomerDetail({
  userId,
  venueId,
  currency,
  dealTitles,
}: {
  userId: string;
  venueId: string | null;
  currency: string;
  dealTitles: Map<string, string>;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.customers.detail;
  const money = useMoney();
  const num = useNum();
  const [language] = useLanguage();

  const api = usePartnerCustomer(venueId, userId);
  const detail = readyOr(api.state, DEMO_MODE ? demoCustomerDetail(userId) : null);

  const formats = useMemo(() => {
    const date = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', year: 'numeric' });
    const month = new Intl.DateTimeFormat(language, { month: 'short', timeZone: 'UTC' });
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([language], { type: 'language' });
    } catch {
      names = null;
    }
    return {
      date: (iso: string) => date.format(new Date(iso)),
      month: (period: string) => month.format(new Date(`${period}-01T12:00:00Z`)),
      /* The language's own name in the reader's language, or its code in capitals
         where the browser cannot name it — a code is still the true answer. */
      language: (code: string) => names?.of(code) ?? code.toUpperCase(),
    };
  }, [language]);

  if (detail === null) {
    return (
      <div className="pc-detail">
        <p className="pd-fine">
          {api.state.status === 'loading'
            ? dashboard.unmeasured.asking
            : api.state.status === 'error' && api.state.error.status === 404
              ? copy.gone
              : dashboard.unmeasured.serverSilent}
        </p>
      </div>
    );
  }

  const months = detail.trend.slice(-6);
  const peak = Math.max(1, ...months.map((month) => month.visits));
  /* Only event kinds the dictionary can name. A lookup that misses must not
     fall through to printing the server's raw key. */
  const events = detail.deals
    .filter((event): event is typeof event & { event_type: keyof typeof copy.events } =>
      Object.prototype.hasOwnProperty.call(copy.events, event.event_type),
    )
    .slice(0, 5);

  return (
    <div className="pc-detail">
      <div className="pc-detail-figures">
        <div>
          <span>{copy.spent}</span>
          <b>{money(minorToEuro(detail.lifetimeValueMinor, currency), 'exact')}</b>
        </div>
        <div>
          <span>{copy.visits}</span>
          <b>{num(detail.visits)}</b>
        </div>
        <div>
          <span>{copy.firstSeen}</span>
          <b>{formats.date(detail.firstSeenAt)}</b>
        </div>
        <div>
          <span>{copy.lastSeen}</span>
          <b>{formats.date(detail.lastSeenAt)}</b>
        </div>
        <div>
          <span>{copy.language}</span>
          <b>{formats.language(detail.language)}</b>
        </div>
      </div>

      <div className="pc-detail-grid">
        <section>
          <span className="console-label">{copy.months}</span>
          {months.length === 0 ? (
            <p className="pd-fine">{copy.none}</p>
          ) : (
            <div
              className="pc-detail-months"
              role="img"
              aria-label={months.map((month) => `${formats.month(month.month)} ${month.visits}`).join(', ')}
            >
              {months.map((month) => (
                <span key={month.month}>
                  <b>{num(month.visits)}</b>
                  {/* The track is what the bar is a percentage of. The column also
                      holds the count and the month, and a bar measured against
                      the whole column would push them out of it. */}
                  <s>
                    <i style={{ height: `${Math.max(6, (month.visits / peak) * 100)}%` }} />
                  </s>
                  <em>{formats.month(month.month)}</em>
                </span>
              ))}
            </div>
          )}
        </section>

        <section>
          <span className="console-label">{copy.cards}</span>
          {detail.stamps.length === 0 ? (
            <p className="pd-fine">{copy.none}</p>
          ) : (
            detail.stamps.map((card) => (
              <div className="pc-detail-card" key={card.campaign_id}>
                <span>{card.name}</span>
                <b>{fill(copy.card, { done: num(card.stamps), need: num(card.required) })}</b>
                <s aria-hidden="true">
                  <u style={{ width: `${Math.min(100, (card.stamps / Math.max(1, card.required)) * 100)}%` }} />
                </s>
              </div>
            ))
          )}
        </section>

        <section>
          <span className="console-label">{copy.offers}</span>
          {events.length === 0 ? (
            <p className="pd-fine">{copy.none}</p>
          ) : (
            <ul className="pc-detail-events">
              {events.map((event) => (
                <li key={`${event.deal_id}:${event.event_type}:${event.created_at}`}>
                  <b>{copy.events[event.event_type]}</b>
                  <span>{dealTitles.get(event.deal_id) ?? ''}</span>
                  <em>{formats.date(event.created_at)}</em>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Two letters off a display name — a local copy, because the two files that
 * need it are already in an import cycle and four lines is the cheaper cost.
 */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '•';
  const first = [...words[0]][0] ?? '';
  const last = words.length > 1 ? [...words[words.length - 1]][0] ?? '' : '';
  return (first + last).toLocaleUpperCase() || '•';
}
