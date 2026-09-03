import { useMemo, useState } from 'react';
import { ADMIN_CARD_ICONS, ADMIN_VIEW_TABS, SPOKEN_LANGUAGES } from './content';
import { Icon } from './icons';
import { useCopy, useMoney } from './i18n/context';
import { fill } from './i18n/currency';
import {
  categoryLabel,
  dayLabel,
  inRange,
  initialOf,
  RANGES,
  redemptionsFor,
  scanRowsFor,
  serviceMetricsFrom,
  toCsv,
  voucherRowsFor,
  type AdminVenueRow,
  type ServiceMetrics,
} from './adminMetrics';
import { useCountUp, useReveal } from './useReveal';

/**
 * Partner Analytics — one venue, five tabs.
 *
 * This is the original admin panel's analytics screen
 * (`landing/screenshots/admin-analytics*.png`) rebuilt in this site's system:
 * same header, same five tabs, same nine cards, same tables and the same trend
 * panels. What changes is everything underneath — tokens instead of that file's
 * palette, five languages instead of one, the reader's currency instead of a
 * PLN/USD toggle, and divs instead of a chart library.
 *
 * The original reached this screen by pasting a Service ID into a search box.
 * That still works — the console's search matches ids — but a row you can click
 * is the shorter road, so the id is on the card next to a copy button and this
 * view opens from either.
 *
 * Which venue is being read is component state rather than a route: `#/admin/:id`
 * would be the first parameterised path on the site, and `router.ts` matches
 * whole strings on purpose. The day the console needs a shareable link to one
 * venue is the day that note applies.
 */

/* ────────────────────────────────────────────────────────────── helpers ── */

/*
 * `Columns` lived here — a column chart built from divs, one `<span>` per day
 * with a height. Every series it drew (`trend`, `scanTrend`, `salesTrend`) was
 * `ADMIN_BASE` times a venue's `scale`, and no operator-facing route returns a
 * day-by-day anything, so it has no caller left. It is deleted rather than kept
 * warm: the day a series exists, the chart is eight lines, and a helper with no
 * source is how a chart gets quietly refilled from a seed.
 */

/** A labelled proportion bar — cities, languages, tier caps. */
function Bar({ label, value, of, note }: { label: string; value: number; of: number; note: string }) {
  return (
    <div className="adm-bar-row">
      <span className="adm-bar-label">{label}</span>
      <span className="adm-bar-track">
        <i style={{ width: `${of > 0 ? Math.max(2, (value / of) * 100) : 0}%` }} />
      </span>
      <b>{note}</b>
    </div>
  );
}

function Empty({ children }: { children: string }) {
  return <p className="adm-empty">{children}</p>;
}

/** Live / paused, used / unused — the one chip this view repeats. */
function State({ on, children }: { on: boolean; children: string }) {
  return (
    <span className="adm-state" data-on={on ? 'true' : undefined}>
      {children}
    </span>
  );
}

/*
 * `MoneyFigure` lived here, for the same reason and with the same fate: every
 * money figure on this screen was partner-scoped and is now a dash.
 */

/**
 * The filter strip every table carries: a search box, the four ranges, and the
 * export.
 *
 * The export builds the CSV from the rows *as filtered*, which is the only
 * honest reading of a button sitting inside a filtered table — exporting all
 * time from a view showing last week would be a quiet lie.
 */
function TableTools({
  title,
  count,
  query,
  onQuery,
  range,
  onRange,
  onExport,
}: {
  title: string;
  count: number;
  query: string;
  onQuery: (value: string) => void;
  range: number;
  onRange: (index: number) => void;
  onExport: () => void;
}) {
  const copy = useCopy().admin.analytics;

  return (
    <>
      <div className="adm-table-head">
        <div>
          <h3>{title}</h3>
          <span className="adm-sub">{fill(copy.records, { n: String(count) })}</span>
        </div>
        <div className="adm-table-tools">
          <label className="adm-search">
            <Icon name="search" size={15} className="adm-search-ico" />
            <input
              type="search"
              placeholder={copy.search}
              value={query}
              onChange={(event) => onQuery(event.target.value)}
            />
          </label>
          <button type="button" className="btn btn-ghost adm-export" onClick={onExport}>
            <Icon name="send" size={14} />
            {copy.export}
          </button>
        </div>
      </div>

      <div className="adm-ranges" role="tablist" aria-label={copy.rangesLabel}>
        {copy.ranges.map((name, index) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={range === index}
            className="adm-range"
            data-on={range === index ? 'true' : undefined}
            onClick={() => onRange(index)}
          >
            {name}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * Hand a CSV to the browser.
 *
 * A blob and an object URL rather than a data URI: a data URI puts the whole
 * table in the address bar, and Chrome refuses the long ones. The URL is revoked
 * on the next frame — the click has already been dispatched by then, and leaving
 * it alive pins the string in memory for the life of the document.
 */
function download(name: string, csv: string): void {
  /* U+FEFF first, and not decoration: without a byte-order mark Excel reads a
     UTF-8 CSV in the system codepage, and every Kraków in the file arrives with
     its ó mangled. Spelled as a code point rather than typed — an invisible
     character in a source file is one somebody deletes by accident. */
  const bom = String.fromCharCode(0xfe_ff);
  const url = URL.createObjectURL(
    new Blob([bom, csv], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/* ─────────────────────────────────────────────────────────── dashboard ── */

function Dashboard({ m }: { m: ServiceMetrics }) {
  const copy = useCopy().admin.analytics;

  /*
   * Index-aligned with `copy.admin.analytics.cards` and `ADMIN_CARD_ICONS`, in
   * the order the original lays them out: the four ways a customer can tap a
   * venue's details, then what that turned into.
   *
   * **`source` is the field that matters now.** Seven of these nine have no
   * measurement behind them at all — map opens, website clicks, phone taps and
   * Instagram taps are not collected, and the voucher, loyalty and discount
   * splits are partner-scoped and unreachable with an operator's token. Only
   * engagement and scans come off a `COUNT`, and only when the request that
   * carried them succeeded.
   *
   * A card with no source renders an em dash rather than a zero. That is the
   * whole distinction: an operator reading "0 map opens" concludes nobody is
   * finding this venue, which is a claim nothing here can make.
   */
  const cards: Array<{
    value: number;
    note: Record<string, string>;
    percent?: true;
    source: boolean;
  }> = [
    { value: m.maps, note: {}, source: false },
    { value: m.website, note: {}, source: false },
    { value: m.phone, note: {}, source: false },
    { value: m.instagram, note: {}, source: false },
    { value: m.vouchersUsed + m.vouchersActive, note: { used: String(m.vouchersUsed), active: String(m.vouchersActive) }, source: false },
    { value: m.loyaltyUsed + m.loyaltyActive, note: { used: String(m.loyaltyUsed), active: String(m.loyaltyActive) }, source: false },
    { value: m.discount, note: {}, percent: true, source: false },
    { value: m.engagement, note: {}, source: m.measured },
    { value: m.scans, note: {}, source: m.measured },
  ];

  return (
    <div className="adm-stack">
      <div className="adm-cards">
        {cards.map((card, index) => (
          <div className="adm-card" key={copy.cards[index].label} data-reveal>
            <div className="adm-card-top">
              <span>{copy.cards[index].label}</span>
              <i>
                <Icon name={ADMIN_CARD_ICONS[index]} size={16} />
              </i>
            </div>
            {card.source ? (
              <b data-count={card.value} data-suffix={card.percent ? '%' : ''} data-group=" ">
                0
              </b>
            ) : (
              <b title={copy.unmeasured.noSource}>—</b>
            )}
            <span className="adm-sub">
              {card.source ? fill(copy.cards[index].note, card.note) : copy.unmeasured.noSource}
            </span>
          </div>
        ))}
      </div>

      <section className="adm-block" data-reveal>
        <div className="adm-block-head">
          <h2>{copy.trend.title}</h2>
          <p>{copy.trend.lede}</p>
        </div>
        {/* The thirty-day trend was `ADMIN_BASE.trend` times the venue's
            `scale`. Nothing an operator can call returns a day-by-day series,
            so the panel says so rather than drawing a flat line through zero,
            which reads as a month of no trade. */}
        <Empty>{copy.unmeasured.noSource}</Empty>
      </section>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── hot deals ── */

function HotDeals() {
  const copy = useCopy().admin.analytics;
  const money = useMoney();
  const rows = useMemo(() => redemptionsFor(), []);
  const [query, setQuery] = useState('');
  const [range, setRange] = useState(0);

  const shown = rows.filter(
    (row) =>
      inRange(row.ago, RANGES[range]) &&
      `${row.deal} ${row.user} ${row.code}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  /*
   * A venue's hot deals.
   *
   * Three were written out here — a 2+1, a 20% and a 15%, with redemption
   * counts multiplied by the venue's `scale`. `hot_deals` holds the real ones
   * and `partners.dealsFor` returns them with their funnel, but that route is
   * partner-scoped and gated on ownership (`requireStaff`), which an operator's
   * token does not satisfy. There is no admin-side deal listing, so this is
   * empty and the panel below says which.
   */
  const deals: Array<{
    badge: string;
    points: number;
    live: boolean;
    ago: number;
    redemptions: number;
  }> = [];

  const counts = [
    deals.filter((deal) => deal.live).length,
    deals.reduce((sum, deal) => sum + deal.redemptions, 0),
    deals.filter((deal) => !deal.live).length,
  ];

  const onExport = () =>
    download(
      'hot-deal-redemptions.csv',
      toCsv(copy.columns.deals, shown.map((row) => [
        dayLabel(row.ago),
        row.deal,
        row.user,
        row.code,
        String(row.points),
        `${row.discount}%`,
        row.used ? copy.status.used : copy.status.active,
        row.used ? money(row.cheque, 'exact') : '—',
      ])),
    );

  return (
    <div className="adm-stack">
      <div className="adm-kpis">
        {copy.hot.counts.map((label, index) => (
          <div className="adm-kpi" key={label} data-reveal>
            <b data-count={counts[index]} data-group=" ">0</b>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <section className="adm-block" data-reveal>
        <div className="adm-block-head">
          <h2>{copy.hot.title}</h2>
          <p>{copy.hot.lede}</p>
        </div>

        {deals.length === 0 ? (
          <Empty>{copy.hot.empty}</Empty>
        ) : (
          <ul className="adm-deals">
            {deals.map((deal) => (
              <li key={deal.badge}>
                <i className="adm-badge">{deal.badge}</i>
                <span className="adm-deal-body">
                  <b>{fill(copy.hot.points, { n: String(deal.points) })}</b>
                  <span className="adm-sub">
                    {fill(copy.hot.expires, { date: dayLabel(deal.ago) })} ·{' '}
                    {fill(copy.hot.redemptions, { n: String(deal.redemptions) })}
                  </span>
                </span>
                <State on={deal.live}>{deal.live ? copy.states.live : copy.states.paused}</State>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="adm-block" data-reveal>
        <TableTools
          title={copy.hot.tableTitle}
          count={shown.length}
          query={query}
          onQuery={setQuery}
          range={range}
          onRange={setRange}
          onExport={onExport}
        />

        {shown.length === 0 ? (
          <Empty>{copy.noRows}</Empty>
        ) : (
          <div className="adm-scroll">
            <table className="adm-table">
              <thead>
                <tr>
                  {copy.columns.deals.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.code}>
                    <td className="adm-mono">{dayLabel(row.ago)}</td>
                    <td>
                      <i className="adm-badge">{row.deal}</i>
                    </td>
                    <td className="adm-mono">{row.user}</td>
                    <td className="adm-mono">{row.code}</td>
                    <td>{row.points}</td>
                    <td>{row.discount}%</td>
                    <td>
                      <State on={row.used}>
                        {row.used ? copy.status.used : copy.status.active}
                      </State>
                    </td>
                    <td>{row.used ? money(row.cheque, 'exact') : <span className="adm-dim">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ────────────────────────────────────────────────────────── loyalty ── */

function Loyalty({ m }: { m: ServiceMetrics }) {
  const copy = useCopy().admin.analytics;
  const money = useMoney();
  const rows = useMemo(() => scanRowsFor(), []);
  const [query, setQuery] = useState('');
  const [range, setRange] = useState(0);

  const shown = rows.filter(
    (row) =>
      inRange(row.ago, RANGES[range]) &&
      `${row.user} ${row.receipt} ${row.city}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const onExport = () =>
    download(
      'loyalty-scans.csv',
      toCsv(copy.columns.scans, shown.map((row) => [
        dayLabel(row.ago),
        row.user,
        String(row.points),
        money(row.spent, 'exact'),
        row.receipt,
        row.city,
        `${row.progress[0]}/${row.progress[1]}`,
      ])),
    );

  const tiles: Array<{ value: number; note: Record<string, string>; eur: boolean }> = [
    { value: m.scans, note: { n: String(m.loyalty.awarded) }, eur: false },
    { value: m.loyalty.sales, note: { n: String(m.scans) }, eur: true },
    { value: m.loyalty.avg, note: {}, eur: true },
  ];

  return (
    <div className="adm-stack">
      <section className="adm-block adm-settings" data-reveal>
        <div className="adm-block-head">
          <h2>{copy.loyalty.settingsTitle}</h2>
          <p>{copy.loyalty.settingsLede}</p>
        </div>
        {/* Settings are settings, and a venue with no scans still has a rule
            about what a scan is worth — which is why these used to be shown
            even at `scale: 0`. What changed is where they came from: these were
            `ADMIN_BASE.loyalty`, three numbers typed once and shown against
            every venue. The real ones live in `venue_settings` and no
            operator-facing route returns them. */}
        <Empty>{copy.unmeasured.noSource}</Empty>
      </section>

      <section className="adm-block" data-reveal>
        <div className="adm-block-head">
          <h2>{copy.loyalty.campaignsTitle}</h2>
          <p>{copy.loyalty.campaignsLede}</p>
        </div>
        {m.loyalty.campaigns.length === 0 ? (
          <Empty>{copy.loyalty.campaignsEmpty}</Empty>
        ) : (
          <ul className="adm-deals">
            {m.loyalty.campaigns.map((campaign) => (
              <li key={campaign.visits}>
                <i className="adm-badge">{campaign.reward}%</i>
                <span className="adm-deal-body">
                  <b>{fill(copy.loyalty.every, { n: String(campaign.visits) })}</b>
                  <span className="adm-sub">
                    {fill(copy.loyalty.reward, { n: String(campaign.reward) })}
                  </span>
                </span>
                <State on>{copy.states.live}</State>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="adm-kpis">
        {tiles.map((_tile, index) => (
          <div className="adm-kpi" key={copy.loyalty.tiles[index].label} data-reveal>
            {/* Points awarded, loyalty-attributed sales and the average basket
                are all partner-scoped figures. An operator's token cannot reach
                any of them, so all three are dashes rather than zeros — a
                zero here says the loyalty programme handed out nothing. */}
            <b title={copy.unmeasured.noSource}>—</b>
            <span>{copy.loyalty.tiles[index].label}</span>
            <span className="adm-sub">{copy.unmeasured.noSource}</span>
          </div>
        ))}
      </div>

      <section className="adm-block" data-reveal>
        <TableTools
          title={copy.loyalty.tableTitle}
          count={shown.length}
          query={query}
          onQuery={setQuery}
          range={range}
          onRange={setRange}
          onExport={onExport}
        />

        {shown.length === 0 ? (
          <Empty>{copy.noRows}</Empty>
        ) : (
          <div className="adm-scroll">
            <table className="adm-table">
              <thead>
                <tr>
                  {copy.columns.scans.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.receipt}>
                    <td className="adm-mono">{dayLabel(row.ago)}</td>
                    <td className="adm-mono">{row.user}</td>
                    <td>+{row.points}</td>
                    <td>{money(row.spent, 'exact')}</td>
                    <td className="adm-mono">{row.receipt}</td>
                    <td>{row.city}</td>
                    <td>
                      <span className="adm-meter" aria-hidden>
                        <i style={{ width: `${(row.progress[0] / row.progress[1]) * 100}%` }} />
                      </span>
                      <span className="adm-sub">
                        {row.progress[0]}/{row.progress[1]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="adm-block" data-reveal>
        <div className="adm-block-head">
          <h2>{copy.loyalty.trendTitle}</h2>
          <p>{copy.loyalty.trendLede}</p>
        </div>
        {/* A day-by-day scan series. `venue_visits` carries one, and nothing
            an operator can call returns it. */}
        <Empty>{copy.unmeasured.noSource}</Empty>
      </section>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── vouchers ── */

function Vouchers({ m }: { m: ServiceMetrics }) {
  const copy = useCopy().admin.analytics;
  const money = useMoney();
  const rows = useMemo(() => voucherRowsFor(), []);
  const [query, setQuery] = useState('');
  const [range, setRange] = useState(0);

  const shown = rows.filter(
    (row) =>
      inRange(row.ago, RANGES[range]) &&
      `${row.user} ${row.code}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const campaign = m.voucherCampaign;
  const used = campaign.budget > 0 ? campaign.spent / campaign.budget : 0;

  const onExport = () =>
    download(
      'vouchers.csv',
      toCsv(copy.columns.vouchers, shown.map((row) => [
        dayLabel(row.ago),
        row.code,
        row.loyalty ? copy.vouchers.types.loyalty : copy.vouchers.types.discount,
        row.user,
        `${row.pct}%`,
        String(row.points),
        row.used ? copy.status.used : copy.status.active,
        row.used ? money(row.cheque, 'exact') : '—',
      ])),
    );

  return (
    <div className="adm-stack">
      <section className="adm-block" data-reveal>
        <div className="adm-block-head">
          <h2>{copy.vouchers.campaignTitle}</h2>
          <p>{fill(copy.vouchers.campaignKind, { n: String(campaign.issued) })}</p>
        </div>

        <div className="adm-budget">
          <div className="adm-budget-top">
            <span className="adm-sub">{copy.vouchers.usage}</span>
            <b>{Math.round(used * 100)}%</b>
          </div>
          <span className="adm-meter adm-meter-wide" aria-hidden>
            <i style={{ width: `${Math.min(100, used * 100)}%` }} />
          </span>
          <div className="adm-budget-top">
            <span className="adm-sub">
              {fill(copy.vouchers.used, {
                used: money(campaign.spent, 'exact'),
                total: money(campaign.budget, 'exact'),
              })}
            </span>
            <span className="adm-sub">
              {fill(copy.vouchers.left, {
                amount: money(Math.max(0, campaign.budget - campaign.spent), 'exact'),
              })}
            </span>
          </div>
        </div>
      </section>

      <div className="adm-tiers">
        {m.tiers.map((tier) => (
          <div className="adm-tier" key={tier.pct} data-reveal>
            <span className="adm-badge adm-badge-lg">{tier.pct}%</span>
            <div className="adm-tier-rows">
              <span>
                <i>{copy.vouchers.points}</i>
                <b>{tier.points}</b>
              </span>
              <span>
                <i>{copy.vouchers.issued}</i>
                <b>{tier.issued}</b>
              </span>
              <span>
                <i>{copy.vouchers.cap}</i>
                {/* An uncapped tier is the one figure on this screen that is not
                    a number, and writing it as one ("0") would read as a tier
                    nobody may claim. */}
                <b>{tier.cap === 0 ? '∞' : tier.cap}</b>
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="adm-kpis">
        {/* Voucher-attributed sales and the average basket behind them are
            partner-scoped, like everything else on this tab. */}
        <div className="adm-kpi" data-reveal>
          <b title={copy.unmeasured.noSource}>—</b>
          <span>{copy.vouchers.tiles[0].label}</span>
          <span className="adm-sub">{copy.unmeasured.noSource}</span>
        </div>
        <div className="adm-kpi" data-reveal>
          <b title={copy.unmeasured.noSource}>—</b>
          <span>{copy.vouchers.tiles[1].label}</span>
          <span className="adm-sub">{copy.unmeasured.noSource}</span>
        </div>
      </div>

      <section className="adm-block" data-reveal>
        <TableTools
          title={copy.vouchers.tableTitle}
          count={shown.length}
          query={query}
          onQuery={setQuery}
          range={range}
          onRange={setRange}
          onExport={onExport}
        />

        {shown.length === 0 ? (
          <Empty>{copy.noRows}</Empty>
        ) : (
          <div className="adm-scroll">
            <table className="adm-table">
              <thead>
                <tr>
                  {copy.columns.vouchers.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.code}>
                    <td className="adm-mono">{dayLabel(row.ago)}</td>
                    <td className="adm-mono">{row.code}</td>
                    <td>{row.loyalty ? copy.vouchers.types.loyalty : copy.vouchers.types.discount}</td>
                    <td className="adm-mono">{row.user}</td>
                    <td>
                      <i className="adm-badge">{row.pct}%</i>
                    </td>
                    <td>{row.points === 0 ? <span className="adm-dim">—</span> : row.points}</td>
                    <td>
                      <State on={row.used}>
                        {row.used ? copy.status.used : copy.status.active}
                      </State>
                    </td>
                    <td>{row.used ? money(row.cheque, 'exact') : <span className="adm-dim">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="adm-two">
        <section className="adm-block" data-reveal>
          <div className="adm-block-head">
            <h2>{copy.vouchers.dailyTitle}</h2>
            <p>{copy.vouchers.dailyLede}</p>
          </div>
          <Empty>{copy.unmeasured.noSource}</Empty>
        </section>

        <section className="adm-block" data-reveal>
          <div className="adm-block-head">
            <h2>{copy.vouchers.monthlyTitle}</h2>
            <p>{copy.vouchers.monthlyLede}</p>
          </div>
          <Empty>{copy.unmeasured.noSource}</Empty>
        </section>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── insights ── */

function Insights({ m }: { m: ServiceMetrics }) {
  const dictionary = useCopy();
  const copy = dictionary.admin.analytics;
  const listing = dictionary.listing;

  const cityPeak = Math.max(...m.cities.map((city) => city.n), 1);
  const langPeak = Math.max(...m.languages.map((language) => language.n), 1);


  return (
    <div className="adm-stack">
      <div className="adm-two">
        <section className="adm-block" data-reveal>
          <div className="adm-block-head">
            <h2>{copy.insights.citiesTitle}</h2>
            <p>{copy.insights.citiesLede}</p>
          </div>
          {m.cities.length === 0 ? (
            <Empty>{copy.insights.citiesEmpty}</Empty>
          ) : (
            <div className="adm-bars">
              {m.cities.map((city) => (
                <Bar key={city.name} label={city.name} value={city.n} of={cityPeak} note={String(city.n)} />
              ))}
            </div>
          )}
        </section>

        <section className="adm-block" data-reveal>
          <div className="adm-block-head">
            <h2>{copy.insights.langsTitle}</h2>
            <p>{copy.insights.langsLede}</p>
          </div>
          {m.languages.length === 0 ? (
            <Empty>{copy.insights.langsEmpty}</Empty>
          ) : (
            <div className="adm-bars">
              {m.languages.map((language) => (
                <Bar
                  key={language.code}
                  /* The venue's own language list, so "Ukrainian" is the same
                     word here as on the listing form. */
                  label={listing.spokenLanguages[SPOKEN_LANGUAGES.indexOf(language.code)]}
                  value={language.n}
                  of={langPeak}
                  note={String(language.n)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="adm-block" data-reveal>
        <div className="adm-block-head">
          <h2>{copy.insights.compareTitle}</h2>
          <p>{copy.insights.compareLede}</p>
        </div>

        {/* Three ways in — map, website, phone — mine against the country's
            average. Neither half exists: the three channels are not collected,
            and `ADMIN_BASE.country` was three numbers typed once. A chart of a
            venue at zero against a country at zero is not an empty chart, it is
            a claim that nobody in the country does any of this. */}
        <Empty>{copy.unmeasured.noSource}</Empty>

      </section>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────── view ── */

export function ServiceAnalytics({
  service,
  onBack,
}: {
  /** The row the console opened, straight off `GET /v1/admin/venues`. */
  service: AdminVenueRow;
  onBack: () => void;
}) {
  const dictionary = useCopy();
  const copy = dictionary.admin;
  const [tab, setTab] = useState(0);
  /*
   * The venue's month, from the one source an operator has.
   *
   * `GET /v1/admin/venues` is the only admin route that answers anything about
   * a specific venue, and it answers two things: a visit count and a customer
   * count. Everything else this screen used to show came out of `service.scale`
   * — a number beside the venue's name in `content.ts`, multiplied through a
   * table of invented figures. `serviceMetricsFrom` fills in the two that exist
   * and leaves the rest `measured: false`.
   *
   * **The row is passed in rather than re-read.** The console cannot reach this
   * view without a ready list, so asking for the same list again would be a
   * second request that can fail on its own and a second answer to disagree
   * with. Where "the backend is not answering" is a *state* is one level up, in
   * `admin.tsx`, and it stays there.
   */
  const m = useMemo(() => serviceMetricsFrom(service), [service]);
  const live = service.status === 'live';

  /*
   * A rescan per tab, and per venue.
   *
   * `Site` keys its own on the route, and the route does not change when a
   * service is opened or a tab is pressed — so without this every panel after
   * the first mounts with no `data-shown` and sits at `opacity: 0`, and its
   * `[data-count]` figures never leave zero. The partner dashboard needs the
   * same thing for the same reason.
   */
  useReveal(`${service.id}:${tab}`);
  useCountUp(`${service.id}:${tab}`);

  const totals = [m.engagement, m.vouchers, m.scans];
  /* The row stores a category id; the word for it lives in the dictionary, and
     an id this site has no word for is printed as itself — see `categoryLabel`. */
  const category = categoryLabel(service.category, dictionary.listing.categories);

  return (
    <div className="adm-stack">
      <button type="button" className="link-btn adm-back" onClick={onBack}>
        <Icon name="chevron" size={14} className="adm-back-ico" />
        {copy.analytics.back}
      </button>

      <section className="adm-service-head" data-reveal>
        <span className="adm-logo" aria-hidden>
          {initialOf(service.name)}
        </span>
        <div className="adm-service-who">
          <h1>{service.name}</h1>
          {/* No star, and not because the venue has no customers: `venues.rating`
              exists on the server and `GET /v1/admin/venues` does not select it.
              A figure this screen cannot read is a figure it does not print. */}
          <span className="adm-sub">
            {[
              category,
              service.city,
              live ? copy.services.live : copy.services.paused,
              service.verified_at ? copy.database.verified : copy.database.unverified,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <span className="adm-id">
            <span className="adm-sub">{copy.services.serviceId}</span>
            <code>{service.id}</code>
          </span>
        </div>

        <div className="adm-totals">
          {copy.analytics.totals.map((label, index) => (
            <span key={label}>
              {/* Engagement and scans are counted; the voucher total in the
                  middle has no operator-facing source, so it is a dash. */}
              {index === 1 || !m.measured ? (
                <b title={copy.analytics.unmeasured.noSource}>—</b>
              ) : (
                <b data-count={totals[index]} data-group=" ">
                  0
                </b>
              )}
              <i>{label}</i>
            </span>
          ))}
        </div>
      </section>

      {/*
        What on this screen is real, said once and at the top.

        Every figure below used to be `service.scale` multiplied through a table
        of invented base figures, and it hung together well enough that an
        operator had no way to tell. Two counts survive that; the banner names
        them, and names the reason the rest are dashes.
      */}
      <p className="adm-empty" data-reveal>{copy.analytics.unmeasured.measured}</p>

      <div className="adm-tabs" role="tablist" aria-label={copy.analytics.back}>
        {copy.analytics.tabs.map((name, index) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === index}
            className="adm-tab"
            data-on={tab === index ? 'true' : undefined}
            onClick={() => setTab(index)}
          >
            <Icon name={ADMIN_VIEW_TABS[index]} size={15} />
            {name}
          </button>
        ))}
      </div>

      {/* Keyed on the tab so the reveal observer rescans and the new panel fades
          in rather than arriving at `opacity: 0` — the same reason the partner
          dashboard keys its screens. */}
      <div key={tab}>
        {tab === 0 ? (
          <Dashboard m={m} />
        ) : tab === 1 ? (
          <HotDeals />
        ) : tab === 2 ? (
          <Loyalty m={m} />
        ) : tab === 3 ? (
          <Vouchers m={m} />
        ) : (
          <Insights m={m} />
        )}
      </div>
    </div>
  );
}
