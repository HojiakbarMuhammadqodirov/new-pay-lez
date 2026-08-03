import {
  PD_BUDGET,
  PD_CAMPAIGNS,
  PD_COHORTS,
  PD_DEALS,
  PD_LANGS,
  PD_NATIONS,
  PD_OVERVIEW,
  PD_SCANS,
  PD_TIERS,
} from './content';
import { Icon } from './icons';
import { useCopy, useMoney } from './i18n/context';
import { fill } from './i18n/currency';

/**
 * The six dashboard screens that are not the profile form.
 *
 * Every figure comes from `PD_*` in `content.ts`, which is the prototype's own
 * seed data (`b2b/Paylez Partner Dashboard v2.dc.html`) rather than numbers made
 * up here — so the month hangs together: the deal claims, the campaign costs and
 * the customer mix were all written to agree with each other, and reading them
 * across screens does not produce a contradiction.
 *
 * Charts are divs, as everywhere else on this site. A bar is a width and a
 * column is a height; that is the whole technique, and it buys theme tokens,
 * five languages and the reader's currency for free where a canvas or a
 * screenshot would buy none of them.
 */

/* ─────────────────────────────────────────────────────────────── shared ── */

function Delta({ value }: { value: number }) {
  const copy = useCopy();
  /* Signed, and not colour-coded: the palette has one accent, and a dashboard
     that only ever shows green is a brochure anyway. The sign carries it. */
  return (
    <span className="pd-delta" data-dir={value >= 0 ? 'up' : 'down'}>
      {value >= 0 ? '+' : ''}
      {value}% <i>{copy.dashboard.overview.since}</i>
    </span>
  );
}

/** A labelled proportion bar — the workhorse of four of these screens. */
function Bar({ label, value, of, note }: { label: string; value: number; of: number; note?: string }) {
  return (
    <div className="pd-bar-row">
      <span className="pd-bar-label">{label}</span>
      <span className="pd-bar-track">
        <i style={{ width: `${of > 0 ? (value / of) * 100 : 0}%` }} />
      </span>
      <b>{note ?? value}</b>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── overview ── */

function Overview() {
  const copy = useCopy().dashboard.overview;
  const money = useMoney();
  const o = PD_OVERVIEW;
  const roi = (o.revenue / o.cost).toFixed(1);

  return (
    <div className="pd-stack">
      <div className="console pd-hero" data-reveal>
        <span className="console-label">{copy.kicker}</span>
        <p className="pd-headline">
          {fill(copy.headline, {
            customers: String(o.newCustomers),
            revenue: money(o.revenue, 'soft'),
          })}
        </p>
        <p className="pd-fine">{fill(copy.estimate, { avg: money(o.avgSpend, 'exact') })}</p>
      </div>

      <div className="pd-tiles">
        {o.tiles.map((tile, index) => (
          <div className="console pd-tile" key={tile.key} data-reveal>
            <span>{copy.tiles[index]}</span>
            <b data-count={tile.value} data-suffix={tile.suffix} data-group=" ">
              0
            </b>
            <Delta value={tile.delta} />
          </div>
        ))}
      </div>

      <div className="pd-two">
        <div className="console pd-panel" data-reveal>
          <span className="console-label">{copy.costTitle}</span>
          <div className="pd-rows">
            <div>
              <span>{copy.costTotal}</span>
              <b>{money(o.cost, 'exact')}</b>
            </div>
          </div>
          <p className="pd-roi">{fill(copy.roi, { n: roi })}</p>
        </div>

        <div className="console pd-panel" data-reveal>
          <span className="console-label">{copy.proofTitle}</span>
          <p className="pd-proof">
            {fill(copy.proof, { after: String(o.repeatAfter), before: String(o.repeatBefore) })}
          </p>
          {/* Two columns, heights in proportion. The gap between them is the
              claim; drawing it is cheaper than describing it twice. */}
          <div className="pd-columns">
            <span>
              <i style={{ height: `${(o.repeatBefore / o.repeatAfter) * 100}%` }} />
              {copy.before}
            </span>
            <span data-on="true">
              <i style={{ height: '100%' }} />
              {copy.now}
            </span>
          </div>
          <p className="pd-fine">{copy.proofNote}</p>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── deals ── */

function Deals() {
  const copy = useCopy().dashboard.deals;
  const money = useMoney();

  return (
    <div className="pd-stack">
      <p className="console pd-insight" data-reveal>
        <Icon name="trophy" size={16} />
        {copy.insight}
      </p>

      <div className="console pd-table-wrap" data-reveal>
        <table className="pd-table">
          <thead>
            <tr>
              {copy.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PD_DEALS.map((deal, index) => (
              <tr key={copy.rows[index]}>
                <td>
                  <span className="pd-deal">
                    <i>{deal.badge}</i>
                    {copy.rows[index]}
                  </span>
                </td>
                <td>
                  <span className="pd-state" data-state={deal.state}>
                    {copy.states[deal.state]}
                  </span>
                </td>
                <td>{deal.seen.toLocaleString('en-GB').replace(/,/g, ' ')}</td>
                <td>{deal.opened}</td>
                <td>{deal.claimed}</td>
                <td>{money(deal.cost, 'exact')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pd-fine">{fill(copy.count, { n: String(PD_DEALS.length) })}</p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── campaigns ── */

function Campaigns() {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.campaigns;
  /* One set of state words for the whole dashboard, read once — a hook inside
     the map below would be a hook in a loop. */
  const states = dashboard.deals.states;
  const money = useMoney();

  /* The widest gap is the headline, so it is computed rather than written down —
     editing the seed data must not leave the sentence naming the wrong campaign. */
  const gaps = PD_CAMPAIGNS.map((c, i) => ({ i, gap: c.earned - c.used }));
  const worst = gaps.reduce((a, b) => (b.gap > a.gap ? b : a));

  return (
    <div className="pd-stack">
      <div className="console pd-panel" data-reveal>
        <span className="console-label">{copy.gapTitle}</span>
        <p className="pd-proof">
          {fill(copy.gap, { name: copy.rows[worst.i], n: String(worst.gap) })}
        </p>
      </div>

      <div className="pd-cards">
        {PD_CAMPAIGNS.map((campaign, index) => (
          <div className="console pd-card" key={copy.rows[index]} data-reveal>
            <div className="pd-card-top">
              <b>{copy.rows[index]}</b>
              <span className="pd-state" data-state={campaign.live ? 'live' : 'paused'}>
                {campaign.live ? states.live : states.paused}
              </span>
            </div>
            <span className="pd-fine">
              {fill(copy.rule, { visits: String(campaign.visits) })} ·{' '}
              {fill(copy.each, { amount: money(campaign.cost, 'exact') })}
            </span>

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
              <i style={{ width: `${(campaign.used / campaign.earned) * 100}%` }} />
            </span>
            <span className="pd-fine">
              {fill(copy.unused, { n: String(campaign.earned - campaign.used) })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── vouchers ── */

function Vouchers() {
  const copy = useCopy().dashboard.vouchers;
  const money = useMoney();
  const free = PD_BUDGET.total - PD_BUDGET.spent - PD_BUDGET.held;

  return (
    <div className="pd-stack">
      <div className="console pd-panel" data-reveal>
        <span className="console-label">{copy.budgetTitle}</span>
        {/* One stacked bar: spent, held back, and what is left. The held slice
            is the one that needs explaining, so it is the one with a note. */}
        <div className="pd-stacked">
          <i data-part="spent" style={{ width: `${(PD_BUDGET.spent / PD_BUDGET.total) * 100}%` }} />
          <i data-part="held" style={{ width: `${(PD_BUDGET.held / PD_BUDGET.total) * 100}%` }} />
        </div>
        <div className="pd-legend">
          <span>
            <i data-part="spent" />
            {copy.spent} <b>{money(PD_BUDGET.spent, 'exact')}</b>
          </span>
          <span>
            <i data-part="held" />
            {copy.held} <b>{money(PD_BUDGET.held, 'exact')}</b>
          </span>
          <span>
            <i data-part="free" />
            {copy.free} <b>{money(free, 'exact')}</b>
          </span>
        </div>
        <p className="pd-fine">{copy.heldNote}</p>
      </div>

      <div className="console pd-table-wrap" data-reveal>
        <span className="console-label">{copy.tiersTitle}</span>
        <p className="pd-fine">{copy.tiersLede}</p>
        <table className="pd-table">
          <thead>
            <tr>
              {copy.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PD_TIERS.map((tier) => (
              <tr key={tier.pct}>
                <td>
                  <b>{fill(copy.tier, { n: String(tier.pct) })}</b>
                </td>
                <td>{tier.points}</td>
                <td>{tier.given}</td>
                <td>{tier.used}</td>
                <td>{money(tier.spent, 'exact')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── customers ── */

function Customers() {
  const copy = useCopy().dashboard.customers;
  const nationsTotal = PD_NATIONS.reduce((a, b) => a + b, 0);

  return (
    <div className="pd-stack">
      <p className="console pd-insight" data-reveal>
        <Icon name="assistant" size={16} />
        {copy.finding}
      </p>

      <div className="pd-two">
        <div className="console pd-panel" data-reveal>
          <span className="console-label">{copy.fromTitle}</span>
          {PD_NATIONS.map((count, index) => (
            <Bar key={copy.nations[index]} label={copy.nations[index]} value={count} of={nationsTotal} />
          ))}
          <p className="pd-fine">{copy.privacy}</p>
        </div>

        <div className="console pd-panel" data-reveal>
          <span className="console-label">{copy.readTitle}</span>
          {PD_LANGS.map((pct, index) => (
            <Bar
              key={copy.langs[index]}
              label={copy.langs[index]}
              value={pct}
              of={100}
              note={`${pct}%`}
            />
          ))}
        </div>
      </div>

      <div className="console pd-panel" data-reveal>
        <span className="console-label">{copy.backTitle}</span>
        {PD_COHORTS.map((cohort, index) => (
          <Bar
            key={copy.months[index]}
            label={copy.months[index]}
            value={cohort.back}
            of={cohort.first}
            note={fill(copy.cohort, { back: String(cohort.back), first: String(cohort.first) })}
          />
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── scans ── */

function Scans() {
  const copy = useCopy().dashboard.scans;
  const money = useMoney();

  return (
    <div className="pd-stack">
      <div className="console pd-table-wrap" data-reveal>
        <table className="pd-table">
          <thead>
            <tr>
              {copy.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PD_SCANS.map((scan) => (
              <tr key={scan.code}>
                <td>
                  {copy.today} {scan.when}
                </td>
                <td>
                  <span className="pd-deal">
                    <i>{scan.who}</i>
                    <span className="pd-state" data-state={scan.first ? 'live' : 'paused'}>
                      {scan.first ? copy.first : copy.again}
                    </span>
                  </span>
                </td>
                <td>{money(scan.spent, 'exact')}</td>
                <td>+{scan.points}</td>
                <td className="pd-code">{scan.code}</td>
                <td>
                  <span className="pd-progress">
                    {scan.progress[0]} / {scan.progress[1]}
                    <i>
                      <b style={{ width: `${(scan.progress[0] / scan.progress[1]) * 100}%` }} />
                    </i>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pd-fine">{fill(copy.count, { n: String(PD_SCANS.length) })}</p>
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
const SCREENS = [Overview, Deals, Campaigns, Vouchers, Customers, Scans];

/** The rail's current screen, whichever that is. */
export function DashboardScreen({ index }: { index: number }) {
  const Panel = SCREENS[index];
  return Panel ? <Panel /> : null;
}
