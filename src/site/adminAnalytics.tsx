import { useMemo, useState } from 'react';
import {
  ADMIN_CARD_ICONS,
  ADMIN_VIEW_TABS,
  SPOKEN_LANGUAGES,
  type AdminService,
} from './content';
import { Icon } from './icons';
import { useCopy, useMoney, useMoneyParts } from './i18n/context';
import { fill } from './i18n/currency';
import {
  dayLabel,
  inRange,
  RANGES,
  redemptionsFor,
  scanRowsFor,
  serviceMetrics,
  toCsv,
  voucherRowsFor,
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

/** A column chart from divs: a bar is a height, and that is the whole trick. */
function Columns({ values, label }: { values: number[]; label: string }) {
  const peak = Math.max(...values, 1);
  return (
    <div className="adm-cols" role="img" aria-label={label}>
      {values.map((value, index) => (
        <span key={index} style={{ height: `${Math.max(2, (value / peak) * 100)}%` }} />
      ))}
    </div>
  );
}

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

/**
 * A money figure the count-up can animate.
 *
 * It rewrites `textContent` every frame, so it needs the target as a number and
 * the symbol as an affix to re-apply — a formatted string would be parsed back
 * out on the first frame. See `useMoneyParts`.
 */
function MoneyFigure({ eur }: { eur: number }) {
  const parts = useMoneyParts()(eur, 'exact');
  return (
    <b
      data-count={parts.value}
      data-prefix={parts.prefix}
      data-suffix={parts.suffix}
      data-group={parts.group}
    >
      0
    </b>
  );
}

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

function Dashboard({ scale }: { scale: number }) {
  const copy = useCopy().admin.analytics;
  const m = useMemo(() => serviceMetrics(scale), [scale]);

  /* Index-aligned with `copy.admin.analytics.cards` and `ADMIN_CARD_ICONS`, in
     the order the original lays them out: the four ways a customer can tap a
     venue's details, then what that turned into. */
  const cards: Array<{ value: number; note: Record<string, string>; percent?: true }> = [
    { value: m.maps, note: {} },
    { value: m.website, note: {} },
    { value: m.phone, note: {} },
    { value: m.instagram, note: {} },
    { value: m.vouchersUsed + m.vouchersActive, note: { used: String(m.vouchersUsed), active: String(m.vouchersActive) } },
    { value: m.loyaltyUsed + m.loyaltyActive, note: { used: String(m.loyaltyUsed), active: String(m.loyaltyActive) } },
    { value: m.discount, note: {}, percent: true },
    { value: m.engagement, note: {} },
    { value: m.scans, note: {} },
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
            <b data-count={card.value} data-suffix={card.percent ? '%' : ''} data-group=" ">
              0
            </b>
            <span className="adm-sub">{fill(copy.cards[index].note, card.note)}</span>
          </div>
        ))}
      </div>

      <section className="adm-block" data-reveal>
        <div className="adm-block-head">
          <h2>{copy.trend.title}</h2>
          <p>{copy.trend.lede}</p>
        </div>
        {m.engagement > 0 ? (
          <Columns values={m.trend} label={copy.trend.title} />
        ) : (
          <Empty>{copy.trend.empty}</Empty>
        )}
      </section>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── hot deals ── */

function HotDeals({ scale }: { scale: number }) {
  const copy = useCopy().admin.analytics;
  const money = useMoney();
  const rows = useMemo(() => redemptionsFor(scale), [scale]);
  const [query, setQuery] = useState('');
  const [range, setRange] = useState(0);

  const shown = rows.filter(
    (row) =>
      inRange(row.ago, RANGES[range]) &&
      `${row.deal} ${row.user} ${row.code}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  /* Three deals at a venue of scale 1, and one of them paused — the original's
     own mix, scaled the way everything else here is. */
  const deals = scale > 0 ? [
    { badge: '2+1', points: 2, live: false, ago: -28, redemptions: Math.round(48 * scale) },
    { badge: '20%', points: 250, live: true, ago: -14, redemptions: Math.round(126 * scale) },
    { badge: '15%', points: 1200, live: true, ago: -45, redemptions: Math.round(31 * scale) },
  ] : [];

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

function Loyalty({ scale }: { scale: number }) {
  const copy = useCopy().admin.analytics;
  const money = useMoney();
  const m = useMemo(() => serviceMetrics(scale), [scale]);
  const rows = useMemo(() => scanRowsFor(scale), [scale]);
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
        <div className="adm-setting-row">
          <span>
            <Icon name="coin" size={16} />
            <b>{m.loyalty.perVisit}</b> {copy.loyalty.perVisit}
          </span>
          <span>
            <Icon name="qr" size={16} />
            <b>{fill(copy.loyalty.hours, { n: String(m.loyalty.cooldown) })}</b> {copy.loyalty.cooldown}
          </span>
          <State on={m.loyalty.active}>
            {m.loyalty.active ? copy.states.live : copy.states.paused}
          </State>
        </div>
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
        {tiles.map((tile, index) => (
          <div className="adm-kpi" key={copy.loyalty.tiles[index].label} data-reveal>
            {tile.eur ? (
              <MoneyFigure eur={tile.value} />
            ) : (
              <b data-count={tile.value} data-group=" ">
                0
              </b>
            )}
            <span>{copy.loyalty.tiles[index].label}</span>
            <span className="adm-sub">{fill(copy.loyalty.tiles[index].note, tile.note)}</span>
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
        {m.scans > 0 ? (
          <Columns values={m.scanTrend} label={copy.loyalty.trendTitle} />
        ) : (
          <Empty>{copy.loyalty.trendEmpty}</Empty>
        )}
      </section>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── vouchers ── */

function Vouchers({ scale }: { scale: number }) {
  const copy = useCopy().admin.analytics;
  const money = useMoney();
  const m = useMemo(() => serviceMetrics(scale), [scale]);
  const rows = useMemo(() => voucherRowsFor(scale), [scale]);
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
        <div className="adm-kpi" data-reveal>
          <MoneyFigure eur={campaign.sales} />
          <span>{copy.vouchers.tiles[0].label}</span>
          <span className="adm-sub">
            {fill(copy.vouchers.tiles[0].note, { n: String(campaign.redemptions) })}
          </span>
        </div>
        <div className="adm-kpi" data-reveal>
          <MoneyFigure eur={campaign.basket} />
          <span>{copy.vouchers.tiles[1].label}</span>
          <span className="adm-sub">{copy.vouchers.tiles[1].note}</span>
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
          {campaign.sales > 0 ? (
            <Columns values={m.salesTrend} label={copy.vouchers.dailyTitle} />
          ) : (
            <Empty>{copy.vouchers.dailyEmpty}</Empty>
          )}
        </section>

        <section className="adm-block" data-reveal>
          <div className="adm-block-head">
            <h2>{copy.vouchers.monthlyTitle}</h2>
            <p>{copy.vouchers.monthlyLede}</p>
          </div>
          {campaign.sales > 0 ? (
            <div className="adm-months">
              {m.monthly.map((value, index) => (
                <span key={index}>
                  <i style={{ height: `${(value / Math.max(...m.monthly)) * 100}%` }} />
                  <em>{money(value, 'soft')}</em>
                </span>
              ))}
            </div>
          ) : (
            <Empty>{copy.vouchers.dailyEmpty}</Empty>
          )}
        </section>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── insights ── */

function Insights({ scale }: { scale: number }) {
  const dictionary = useCopy();
  const copy = dictionary.admin.analytics;
  const business = dictionary.business;
  const m = useMemo(() => serviceMetrics(scale), [scale]);

  const cityPeak = Math.max(...m.cities.map((city) => city.n), 1);
  const langPeak = Math.max(...m.languages.map((language) => language.n), 1);

  /* Three ways in, mine against the country's average. Grouped columns rather
     than two lines: there are three categories, and a line chart of three points
     is a table with extra steps. */
  const compare = [
    { mine: m.maps, avg: m.country.maps },
    { mine: m.website, avg: m.country.website },
    { mine: m.phone, avg: m.country.phone },
  ];
  const comparePeak = Math.max(...compare.flatMap((pair) => [pair.mine, pair.avg]), 1);

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
                  label={business.spokenLanguages[SPOKEN_LANGUAGES.indexOf(language.code)]}
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

        <div className="adm-compare">
          {compare.map((pair, index) => (
            <div className="adm-compare-group" key={copy.insights.axis[index]}>
              <div className="adm-compare-cols">
                <span data-on="true" style={{ height: `${Math.max(2, (pair.mine / comparePeak) * 100)}%` }} />
                <span style={{ height: `${Math.max(2, (pair.avg / comparePeak) * 100)}%` }} />
              </div>
              <span className="adm-sub">{copy.insights.axis[index]}</span>
            </div>
          ))}
        </div>

        <div className="adm-legend">
          <span data-on="true">{copy.insights.mine}</span>
          <span>{copy.insights.avg}</span>
        </div>
      </section>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────── view ── */

export function ServiceAnalytics({
  service,
  live,
  onBack,
}: {
  service: AdminService;
  /** True for the listing a real signed-up owner saved, rather than a seed. */
  live?: boolean;
  onBack: () => void;
}) {
  const dictionary = useCopy();
  const copy = dictionary.admin;
  const [tab, setTab] = useState(0);
  const m = useMemo(() => serviceMetrics(service.scale), [service.scale]);

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
  /* The listing stores a category id; the word for it lives in the dictionary,
     and `BUSINESS_CATEGORIES` is what maps between them. */
  const category = dictionary.business.categories[service.category];

  return (
    <div className="adm-stack">
      <button type="button" className="link-btn adm-back" onClick={onBack}>
        <Icon name="chevron" size={14} className="adm-back-ico" />
        {copy.analytics.back}
      </button>

      <section className="adm-service-head" data-reveal>
        <span className="adm-logo" aria-hidden>
          {service.logo}
        </span>
        <div className="adm-service-who">
          <h1>{service.name}</h1>
          {/* Same rule as the card it was opened from: no star without a
              rating behind it. */}
          <span className="adm-sub">
            {[
              category,
              service.city,
              service.rating > 0 ? `★ ${service.rating.toFixed(1)}` : null,
              live ? copy.services.live : null,
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
              <b data-count={totals[index]} data-group=" ">
                0
              </b>
              <i>{label}</i>
            </span>
          ))}
        </div>
      </section>

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
          <Dashboard scale={service.scale} />
        ) : tab === 1 ? (
          <HotDeals scale={service.scale} />
        ) : tab === 2 ? (
          <Loyalty scale={service.scale} />
        ) : tab === 3 ? (
          <Vouchers scale={service.scale} />
        ) : (
          <Insights scale={service.scale} />
        )}
      </div>
    </div>
  );
}
