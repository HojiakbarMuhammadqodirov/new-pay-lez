import { Fragment, type CSSProperties, type ReactNode } from 'react';
import {
  BUSINESS_AUDIENCE_SIZES,
  BUSINESS_DASH_CHART,
  BUSINESS_DASH_HEAD,
  BUSINESS_DASH_LIVE,
  BUSINESS_DASH_TILES,
  BUSINESS_OPERATOR_INITIALS,
  BUSINESS_PILLARS,
  BUSINESS_ROLLOUT_ICONS,
  BUSINESS_SITES,
  BUSINESS_STATS,
  BUSINESS_TIERS,
  BUSINESS_WHY_ICONS,
  SALES_EMAIL,
} from './content';
import { Icon } from './icons';
import { fill, group } from './i18n/currency';
import { useCopy, useCurrency, useMoney, useMoneyParts } from './i18n/context';
import { PATHS } from './router';

/**
 * Business — the fourth page, and the only one that sells to a business.
 *
 * The other three pages talk to a person who might play a game. This one talks
 * to someone who runs four restaurants and is deciding whether to replace a
 * loyalty scheme, so it argues rather than describes: what it costs (nothing
 * until redemption), who owns the customer (you), how long it takes to go live
 * (48 hours), and — at length, in the middle of the page — what the screen they
 * would be logging into actually looks like. The pricing table is on the page
 * for the same reason: an operator who has to ask what it costs has already
 * closed the tab.
 *
 * Every console on the page is DOM and CSS, the way Analytics' charts are. They
 * are product mocks, not screenshots: an image would go stale the first time the
 * portal is restyled, would not translate into five languages, could not follow
 * the theme, and could not price itself in the reader's currency. Being real
 * markup, they do all four for free.
 *
 * Money never appears as a literal here. Amounts are euros in `content.ts` and
 * are converted on the way out by `useMoney` / `useMoneyParts`, because the
 * language the visitor chose is what picks the currency — English prices this
 * page in pounds. See `i18n/currency.ts`.
 *
 * The backdrop is the market tape (`market/MarketTape`) — a revenue line ticked
 * upward by the venues under it. See the note at the top of its config for why
 * it is not the node web a second time.
 */

/**
 * Sets React nodes into a translated sentence at its `{name}` holes.
 *
 * The figures in the dashboard's headline are emphasised, so they cannot be
 * substituted as strings — but they also cannot be lifted out of the sentence,
 * because the words around a number do not sit in the same order in Polish as
 * in English. A template with named holes is the only form that survives both.
 */
function template(text: string, values: Record<string, ReactNode>): ReactNode[] {
  return text.split(/(\{\w+\})/g).map((part, i) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={i}>{name ? (values[name] ?? part) : part}</Fragment>;
  });
}

/* ─────────────────────────────────────────────────── the owner's console ── */

/**
 * The dashboard's toolbar: whose venue, which screen, which period.
 *
 * It is the cheapest line on the mock and it does the most work — without it
 * the panels below are three charts, and with it they are a screen someone is
 * logged into.
 */
function DashBar() {
  const copy = useCopy();
  const mock = copy.business.dashboard.mock;

  return (
    <div className="dash-bar">
      <span className="dash-brand" aria-hidden>
        p
      </span>
      <b>{mock.business}</b>
      <span className="dash-crumb" aria-hidden>
        /
      </span>
      <span className="dash-screen">{mock.screen}</span>
      <span className="dash-range">
        {mock.range}
        <Icon name="chevron" size={12} strokeWidth={2.4} />
      </span>
      <span className="dash-user" aria-hidden>
        {mock.user}
      </span>
    </div>
  );
}

/**
 * The headline strip — the one panel that is a sentence.
 *
 * It is first because it is the only thing on the screen that answers the
 * question an owner actually opens the dashboard with. Charts answer the second
 * question.
 */
function DashHeadline() {
  const copy = useCopy();
  const money = useMoney();
  const currency = useCurrency();
  const mock = copy.business.dashboard.mock;

  return (
    <div className="dash-head">
      <span className="dash-kicker">
        {mock.kicker} · {mock.range}
      </span>
      <p>
        {template(mock.headline, {
          // Grouped with the currency's own separator even though it is a head
          // count: a screen that writes 1,240 customers next to 38 000 zł of
          // revenue is a screen with two number formats on it.
          customers: <b>{group(BUSINESS_DASH_HEAD.customers, currency)}</b>,
          // `soft` rounding: this is a forecast attributed to visits, and
          // quoting it to the pound would claim a precision it does not have.
          revenue: <b>{money(BUSINESS_DASH_HEAD.revenue, 'soft')}</b>,
        })}
      </p>
    </div>
  );
}

/** The four tiles. `compact` drops the sparklines for the hero's smaller card. */
function DashTiles({ compact }: { compact?: boolean }) {
  const copy = useCopy();
  const moneyParts = useMoneyParts();
  const currency = useCurrency();
  const mock = copy.business.dashboard.mock;

  return (
    <div className="dash-tiles" data-compact={compact ? 'true' : undefined}>
      {BUSINESS_DASH_TILES.map((tile, i) => {
        const parts = tile.money ? moneyParts(tile.value) : null;

        return (
          <article className="dash-tile" key={mock.tiles[i].name}>
            <span className="dash-tile-ico">
              <Icon name={tile.icon} size={15} />
            </span>
            {/* Grouped whether or not it is money: four figures in a row, one
                of them a price, and only that one separated would read as two
                number formats on one screen. */}
            <b
              data-count={parts ? parts.value : tile.value}
              data-prefix={parts?.prefix}
              data-suffix={parts ? parts.suffix : tile.suffix}
              data-group={currency.group}
            >
              0
            </b>
            <span className="dash-tile-name">{mock.tiles[i].name}</span>

            {/* `data-dir` rather than a colour, the way the analytics KPIs do
                it: the palette is two colours, so a fall is drawn with a caret
                and weight instead of with red. */}
            <span className="dash-delta" data-dir={tile.delta < 0 ? 'down' : 'up'}>
              <Icon name="chevron" size={11} strokeWidth={2.6} />
              {Math.abs(tile.delta)}%
            </span>

            {!compact && (
              <>
                <span className="dash-tile-note">{mock.tiles[i].note}</span>
                <div className="spark" aria-hidden>
                  {tile.spark.map((value, day) => (
                    <i key={day} style={{ '--h': `${value}%` } as CSSProperties} />
                  ))}
                </div>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}

/**
 * A fortnight of visits with redemptions stacked inside them.
 *
 * Inside rather than beside: a redemption is a subset of the visits, not a
 * second independent series, and two columns per day would say they were
 * unrelated. The gap left above the inner bar is the thing the insight panel
 * underneath is about.
 */
function DashChart() {
  const copy = useCopy();
  const chart = copy.business.dashboard.mock.chart;

  return (
    <div className="dash-panel">
      <div className="dash-panel-head">
        <div>
          <b>{chart.title}</b>
          <span>{chart.note}</span>
        </div>
        <div className="dash-keys">
          <span>
            <i />
            {chart.visits}
          </span>
          <span>
            <i data-solid="true" />
            {chart.redeemed}
          </span>
        </div>
      </div>

      {/* One `role="img"` with a summary label rather than twenty-eight bars a
          screen reader has to walk: the shape is the information, and the shape
          does not survive being read out column by column. */}
      <div className="dash-chart" role="img" aria-label={chart.title}>
        {BUSINESS_DASH_CHART.map((day, i) => (
          // `--i` is the column's place in the fortnight; the CSS turns it into
          // a transition delay so the chart draws left to right on reveal
          // rather than all fourteen columns arriving on the same frame.
          <div
            className="dash-col"
            key={i}
            style={{ '--h': `${day.visits}%`, '--i': i } as CSSProperties}
          >
            <i style={{ '--h': `${(day.redeemed / day.visits) * 100}%` } as CSSProperties} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The insight — the dashboard reading its own chart back to you. */
function DashInsight() {
  const copy = useCopy();
  const insight = copy.business.dashboard.mock.insight;

  return (
    <div className="dash-insight">
      <span className="dash-kicker">{insight.kicker}</span>
      <p>{insight.text}</p>
      <div className="dash-insight-actions">
        {/* Spans, not buttons: there is nothing on a marketing page for them to
            do, and a button that does nothing is a bug report waiting to be
            filed. */}
        <span className="dash-act" data-solid="true">
          {insight.action}
        </span>
        <span className="dash-act">{insight.dismiss}</span>
      </div>
    </div>
  );
}

/** What is live in the venue right now, one row each. */
function DashLive() {
  const copy = useCopy();
  const currency = useCurrency();
  const live = copy.business.dashboard.mock.live;

  return (
    <div className="dash-panel">
      <div className="dash-panel-head">
        <div>
          <b>{live.title}</b>
          <span>{live.note}</span>
        </div>
      </div>

      <div className="dash-rows">
        {BUSINESS_DASH_LIVE.map((row, i) => (
          <div className="dash-row" key={live.rows[i].name}>
            <span className="dash-row-ico">
              <Icon name={row.icon} size={16} />
            </span>

            <div className="dash-row-main">
              <span className="dash-row-kind">{live.rows[i].kind}</span>
              <b>{live.rows[i].name}</b>
              <span className="dash-row-rule">{live.rows[i].rule}</span>
            </div>

            <div className="dash-row-stat">
              <b>
                {group(row.stat, currency)}
                {row.suffix}
              </b>
              <span>{live.rows[i].statLabel}</span>
            </div>

            <span className="dash-state" data-on={row.paused ? undefined : 'true'}>
              {row.paused ? live.off : live.on}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── mocks ── */

/**
 * The portal rows: one line per site, spend behind the name, returning share on
 * the right.
 *
 * Two numbers per row, because the second one is the argument. A site can be the
 * biggest earner in the group and still have the worst returning share, and that
 * disagreement — visible here in the Wrocław row, which is small and loyal, and
 * the Gdańsk row, which is neither — is the thing the portal is for.
 */
/* No reach wiring anywhere on `#/business`, including here. Every "venue" on
   this page is inside a *picture of the owner's own console* — `BUSINESS_SITES`
   is the multi-site portal mock, not a listing a customer is being shown — so
   there is no impression to report. Reach counts a consumer seeing a venue; an
   owner seeing a mock of their own dashboard is not that. See `api/reach.ts`. */
function PortalRows() {
  const copy = useCopy();
  const portal = copy.business.pillars.portal;

  return (
    <>
      <div className="console-cols">
        <span>{portal.columns.site}</span>
        <span>{portal.columns.repeat}</span>
      </div>

      <div className="console-rows">
        {BUSINESS_SITES.map((site) => (
          <div className="console-row" key={site.name}>
            <span className="console-site">{site.name}</span>
            {/* The bar is the row's background rather than a third column: at
                four rows a separate chart column would be mostly whitespace,
                and behind the name it doubles as the row's own hairline. */}
            <div
              className="console-bar"
              style={{ '--share': `${site.spend}%` } as CSSProperties}
              aria-hidden
            />
            <b>{site.repeat}%</b>
          </div>
        ))}
      </div>
    </>
  );
}

/** Returning vs. first-time basket spend — one bar, two figures. */
function CohortSplit() {
  const copy = useCopy();
  const returning = 68;

  return (
    <div className="console console-sm">
      <span className="console-label">{copy.business.pillars.cohort.label}</span>

      <div className="cohort" aria-hidden>
        <div
          className="cohort-fill"
          style={{ '--share': `${returning}%` } as CSSProperties}
        />
      </div>

      <div className="cohort-keys">
        <div>
          <i />
          <span>{copy.business.pillars.cohort.returning}</span>
          <b>{returning}%</b>
        </div>
        <div>
          <i data-muted="true" />
          <span>{copy.business.pillars.cohort.first}</span>
          <b>{100 - returning}%</b>
        </div>
      </div>
    </div>
  );
}

/** The voucher as a player sees it: a correct answer, then what it buys. */
function GameMock() {
  const copy = useCopy();

  return (
    <div className="console console-sm">
      <p className="game-hit">
        <Icon name="check" size={15} strokeWidth={3} />
        {copy.business.pillars.game.note}
      </p>

      <span className="console-label">{copy.business.pillars.game.label}</span>

      <div className="pool-card">
        <span className="pv-logo" aria-hidden>
          %
        </span>
        <div>
          <b>{copy.business.pillars.game.prize}</b>
          <span>{copy.business.pillars.game.cost}</span>
        </div>
      </div>
    </div>
  );
}

/** Audience chips, then the send row with its forecast. */
function CampaignMock() {
  const copy = useCopy();
  const money = useMoney();

  return (
    <div className="console console-sm">
      <span className="console-label">{copy.business.pillars.campaign.label}</span>

      <div className="chips">
        {copy.business.pillars.campaign.audiences.map((audience, i) => (
          // The first chip is the selected one. A campaign builder with nothing
          // selected is a picture of a form; with one selected it is a picture
          // of a decision, which is the state worth showing.
          <span className="chip" key={audience} data-on={i === 0 ? 'true' : undefined}>
            {audience}
            <i>{BUSINESS_AUDIENCE_SIZES[i]}</i>
          </span>
        ))}
      </div>

      <div className="send-row">
        <b>{copy.business.pillars.campaign.send}</b>
        <span>
          {fill(copy.business.pillars.campaign.estimate, {
            amount: money(11400, 'soft'),
          })}
        </span>
      </div>
    </div>
  );
}

/** Picked by name, not by index — reordering the pillars cannot swap pictures. */
function PillarVisual({ visual }: { visual: (typeof BUSINESS_PILLARS)[number]['visual'] }) {
  if (visual === 'game') return <GameMock />;
  if (visual === 'campaign') return <CampaignMock />;
  return <CohortSplit />;
}

/* ─────────────────────────────────────────────────────────────── hero ── */

function BusinessHero() {
  const copy = useCopy();
  const moneyParts = useMoneyParts();

  return (
    <section className="hero business-hero" id="business-top">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <a className="learn-back" href={PATHS.landing} data-reveal>
            <Icon name="arrow" size={15} strokeWidth={2.2} />
            {copy.business.back}
          </a>

          <span className="eyebrow learn-eyebrow" data-reveal>
            {copy.business.hero.eyebrow}
          </span>

          {/* The accent falls on the last line, which is the claim — the two
              before it are the setup. */}
          <h1 data-reveal>
            {copy.business.hero.lines.map((line, i) => (
              <span className="ln" key={line}>
                {i === copy.business.hero.lines.length - 1 ? (
                  <span className="accent-text">{line}</span>
                ) : (
                  line
                )}
              </span>
            ))}
          </h1>

          <p className="hero-lede" data-reveal>
            {copy.business.hero.lede}
          </p>

          <div className="hero-cta" data-reveal>
            <a href="#business-cta" className="btn btn-solid btn-lg">
              <Icon name="arrow" size={18} strokeWidth={2.2} />
              {copy.business.hero.primary}
            </a>
            <a href="#business-dashboard" className="btn btn-ghost btn-lg">
              {copy.business.hero.secondary}
            </a>
          </div>

          <div className="hero-meta" data-reveal>
            {BUSINESS_STATS.map((stat, i) => {
              // The middle stat is a price — zero, but a price — so it carries
              // the reader's currency symbol rather than a hardcoded one.
              const parts = stat.money ? moneyParts(stat.value, 'exact') : null;

              return (
                <div className="hero-stat-row" key={copy.business.hero.stats[i]}>
                  {i > 0 && <span className="hero-stat-div" />}
                  <div className="hero-stat">
                    {/* The count-up target is the *converted* figure, because
                        the affixes beside it are already the reader's. Counting
                        `stat.value` up while wearing a pound sign would put the
                        euro amount under a £ — masked here only because this
                        one happens to be zero. `DashTiles` above is the same
                        line. */}
                    <b
                      data-count={parts ? parts.value : stat.value}
                      data-prefix={parts?.prefix}
                      data-suffix={parts ? parts.suffix : stat.suffix}
                      data-group={parts?.group}
                    >
                      0
                    </b>
                    <span>{copy.business.hero.stats[i]}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="business-trust" data-reveal>
            {copy.business.hero.trust}
          </p>
        </div>

        {/*
          A slice of the same dashboard the middle of the page shows in full:
          the sentence it opens with, the four tiles, and the per-site rows. An
          operator deciding whether to read on is deciding whether the product
          is a screen they would use, so the hero shows them the screen.
        */}
        <div className="hero-visual business-visual" data-reveal>
          <div className="console dash dash-hero">
            <DashBar />
            <DashHeadline />
            <DashTiles compact />
            <PortalRows />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────── why ── */

function BusinessWhy() {
  const copy = useCopy();
  const money = useMoney();

  return (
    <section className="section" id="business-why">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.business.why.eyebrow}</span>
          <h2>{copy.business.why.title}</h2>
          <p>{copy.business.why.lede}</p>
        </div>

        <div className="games business-why-grid">
          {copy.business.why.items.map((item, i) => (
            <article className="game" key={item.title} data-reveal>
              <span className="game-ico">
                <Icon name={BUSINESS_WHY_ICONS[i]} size={24} />
              </span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              {/* `.game-meta` from the L-Earn cards: the same pushed-down stat
                  line, keeping four bodies of four different lengths flush.
                  One card's stat is a price and the rest are counts, so all
                  four go through the same fill rather than only the one that
                  needs it today. */}
              <span className="game-meta">
                {fill(item.stat, { amount: money(0, 'exact') })}
              </span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── dashboard ── */

/**
 * The dashboard, at the size it is actually used.
 *
 * Full width rather than in a split column: the panels are a toolbar, a
 * sentence, four tiles, a fortnight of columns and three rows, and squeezed into
 * half a page they stop being a screen and become a thumbnail of one. The copy
 * runs above it instead of beside it.
 */
function BusinessDashboard() {
  const copy = useCopy();

  return (
    <section className="section" id="business-dashboard">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.business.dashboard.eyebrow}</span>
          <h2>{copy.business.dashboard.title}</h2>
          <p>{copy.business.dashboard.lede}</p>
        </div>

        <div className="console dash dash-full" data-reveal>
          <DashBar />
          <DashHeadline />
          <DashTiles />
          <DashChart />
          <DashInsight />
          <DashLive />
        </div>

        <div className="dash-notes">
          {copy.business.dashboard.bullets.map((bullet) => (
            <div className="dash-note" key={bullet.title} data-reveal>
              <Icon name="check" size={15} strokeWidth={3} />
              <div>
                <b>{bullet.title}</b>
                <p>{bullet.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="dash-cta" data-reveal>
          <a href="#business-cta" className="btn btn-ghost btn-lg">
            {copy.business.dashboard.action}
            <Icon name="arrow" size={16} strokeWidth={2.2} />
          </a>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────── pillars ── */

/**
 * The three pillars, alternating sides.
 *
 * `data-flip` swaps the grid order rather than the DOM order: the copy has to
 * come first in the document on every row — that is the reading order, and on a
 * phone the columns stack into exactly it — while on a wide screen the middle
 * row reads better with its console on the left.
 */
function BusinessPillars() {
  const copy = useCopy();

  return (
    <section className="section" id="business-platform">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.business.pillars.eyebrow}</span>
          <h2>{copy.business.pillars.title}</h2>
        </div>

        <div className="pillars">
          {copy.business.pillars.items.map((pillar, i) => (
            <div className="pillar" key={pillar.title} data-flip={i === 1 ? 'true' : undefined}>
              <div className="pillar-copy" data-reveal>
                <span className="pillar-eyebrow">
                  <Icon name={BUSINESS_PILLARS[i].icon} size={15} />
                  {pillar.eyebrow}
                </span>
                <h3>{pillar.title}</h3>
                <p>{pillar.body}</p>

                {/* Two levels per bullet, as the source design has them: the
                    title is what it does and the body is the constraint it
                    lifts. A single line has to be one or the other. */}
                <ul className="pillar-list">
                  {pillar.bullets.map((bullet) => (
                    <li key={bullet.title}>
                      <Icon name="check" size={15} strokeWidth={3} />
                      <div>
                        <b>{bullet.title}</b>
                        <span>{bullet.body}</span>
                      </div>
                    </li>
                  ))}
                </ul>

                {/* Anchored to the CTA rather than to a page that does not
                    exist yet. A link that goes nowhere is worse than one that
                    goes somewhere honest. */}
                <a className="pillar-more" href="#business-cta">
                  {pillar.action}
                  <Icon name="arrow" size={15} strokeWidth={2.2} />
                </a>
              </div>

              <div className="pillar-visual" data-reveal>
                <PillarVisual visual={BUSINESS_PILLARS[i].visual} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────── rollout ── */

/**
 * How the 48 hours are spent.
 *
 * The hero claims a number; this is the section that has to make it credible.
 * Four steps on one rail rather than four boxed cards — the same component the
 * L-Earn page uses, for the same reason: the sequence *is* the information.
 */
function BusinessRollout() {
  const copy = useCopy();

  return (
    <section className="section" id="business-rollout">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.business.rollout.eyebrow}</span>
          <h2>{copy.business.rollout.title}</h2>
          <p>{copy.business.rollout.lede}</p>
        </div>

        <ol className="steps">
          {copy.business.rollout.items.map((step, i) => (
            <li className="step" key={step.title} data-reveal>
              <span className="step-ico">
                <Icon name={BUSINESS_ROLLOUT_ICONS[i]} size={21} />
              </span>
              <span className="step-n">{String(i + 1).padStart(2, '0')}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>

        <p className="business-note" data-reveal>
          {copy.business.rollout.note}
        </p>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────── operators ── */

function BusinessOperators() {
  const copy = useCopy();

  return (
    <section className="section" id="business-operators">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.business.operators.eyebrow}</span>
          <h2>{copy.business.operators.title}</h2>
        </div>

        {/* `.tcols` and `.tcard` from the landing page's testimonials, without
            the star rating: an operator quote is a reference, not a review, and
            five stars on the Business page reads as a plugin. */}
        <div className="tcols">
          {copy.business.operators.items.map((item, i) => (
            <figure className="tcard" key={item.name} data-reveal>
              <blockquote className="tquote">{item.quote}</blockquote>
              <figcaption className="tmeta">
                <span className="tavatar" aria-hidden>
                  {BUSINESS_OPERATOR_INITIALS[i]}
                </span>
                <div>
                  <b>{item.name}</b>
                  <span>{item.role}</span>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────── pricing ── */

function BusinessPricing() {
  const copy = useCopy();
  const money = useMoney();

  return (
    <section className="section" id="business-pricing">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.business.pricing.eyebrow}</span>
          <h2>{copy.business.pricing.title}</h2>
          <p>{copy.business.pricing.lede}</p>
        </div>

        <div className="tiers">
          {copy.business.pricing.tiers.map((tier, i) => {
            const { price, featured } = BUSINESS_TIERS[i];

            return (
            <article
              className="tier"
              key={tier.name}
              data-featured={featured ? 'true' : undefined}
              data-reveal
            >
              {featured && <span className="tier-flag">{copy.business.pricing.featured}</span>}

              <h3>{tier.name}</h3>
              <span className="tier-note">{tier.note}</span>

              <p className="tier-price">
                {price === null ? (
                  <b>{copy.business.pricing.quoted}</b>
                ) : (
                  <>
                    <b>{money(price)}</b>
                    <span>{copy.business.pricing.perMonth}</span>
                  </>
                )}
              </p>

              <p className="tier-body">{tier.body}</p>

              <ul className="tier-list">
                {tier.features.map((feature) => (
                  <li key={feature}>
                    <Icon name="check" size={14} strokeWidth={3} />
                    {feature}
                  </li>
                ))}
              </ul>

              <a
                href="#business-cta"
                className={`btn btn-lg ${featured ? 'btn-solid' : 'btn-ghost'}`}
              >
                {tier.action}
              </a>
            </article>
            );
          })}
        </div>

        <p className="business-note" data-reveal>
          {copy.business.pricing.footnote}
        </p>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────── cta ── */

function BusinessCta() {
  const copy = useCopy();

  return (
    <section className="section" id="business-cta">
      <div className="wrap">
        <div className="cta-banner" data-reveal>
          <h2>{copy.business.cta.title}</h2>
          <p>{copy.business.cta.lede}</p>
          <div className="cta-actions">
            <a href={`mailto:${SALES_EMAIL}`} className="btn btn-solid btn-lg">
              <Icon name="arrow" size={18} strokeWidth={2.2} />
              {copy.business.cta.primary}
            </a>
            <a href={PATHS.landing} className="btn btn-ghost btn-lg">
              {copy.business.cta.secondary}
            </a>
          </div>
          <p className="cta-note">{copy.business.cta.note}</p>
        </div>
      </div>
    </section>
  );
}

/** The page, in order. */
export function BusinessPage() {
  return (
    <main>
      <BusinessHero />
      <BusinessWhy />
      <BusinessDashboard />
      <BusinessPillars />
      <BusinessRollout />
      <BusinessOperators />
      <BusinessPricing />
      <BusinessCta />
    </main>
  );
}
