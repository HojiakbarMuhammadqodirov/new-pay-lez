import type { CSSProperties } from 'react';
import {
  ANALYTICS_FUNNEL,
  ANALYTICS_KPIS,
  ANALYTICS_REPORT_ICONS,
  ANALYTICS_WEEK,
} from './content';
import { useAuth } from './auth/context';
import { Icon } from './icons';
import { useCopy } from './i18n/context';
import { PATHS } from './router';

/**
 * Partner Analytics — the third page.
 *
 * Deliberately the smallest of the three. It reuses `.section`, `.section-head`,
 * `.btn`, `.benefits` and `.cta-banner` wholesale and introduces markup for
 * exactly three things the other pages have no equivalent of: the KPI row, the
 * funnel, and the week chart.
 *
 * All three charts are DOM and CSS — no canvas, no charting library, no third
 * WebGL context. The numbers are seven bars and three rows; anything heavier
 * than a `<div>` with a width on it would be paying for axes, scales and tooltip
 * machinery that a marketing page for a dashboard does not need. It also means
 * the charts inherit the theme tokens for free, which a canvas would not.
 *
 * The backdrop is the node web (`NetworkWeb`) — drifting points wiring
 * themselves to their neighbours, which is this page's own subject drawn out:
 * every dot a customer, every link a pattern the dashboards surface. See the
 * backdrop note in `Site.tsx`.
 */

/* ─────────────────────────────────────────────────────────────── hero ── */

/**
 * The panel is the page's one product screenshot, and it is real markup rather
 * than an image — but what it shows changed, and the change is the point.
 *
 * It used to be a Service ID field: a mocked-up `PLZ-4417-KRK` in a well with a
 * caret and a "View analytics" button, because that was the dashboard's actual
 * first step. It is not any more, and it should not have been here for a while:
 * **an owner does not identify their venue to us, they sign in.** The Service ID
 * is an operator's handle for a listing — it is what the console indexes by and
 * what support asks for on the phone — and putting it in front of the owner as
 * the way *in* was asking them to look up a number the session already knows.
 * Worse, the field was decorative (there is nothing on a marketing page to
 * submit an ID to), so the one thing the page invited you to do did nothing,
 * which is the failure the "anything shaped like a control has to be one" rule
 * in the root `CLAUDE.md` exists to prevent.
 *
 * So the panel now shows the venue whose numbers these are — read off the
 * session, not typed — and the button opens the dashboard.
 *
 * There is a case with no listing behind it and it is not the owner's: an admin
 * reads the marketing site exactly as written (see `resolveRoute`), so they can
 * reach this page with no venue on their account at all. The panel falls back to
 * naming what the slot is for rather than inventing a venue to fill it with.
 */
function AnalyticsHero() {
  const copy = useCopy();
  const { account } = useAuth();
  const venue = account?.business ?? null;

  return (
    <section className="hero analytics-hero" id="analytics-top">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <a className="learn-back" href={PATHS.landing} data-reveal>
            <Icon name="arrow" size={15} strokeWidth={2.2} />
            {copy.analytics.back}
          </a>

          <span className="eyebrow learn-eyebrow" data-reveal>
            {copy.analytics.hero.eyebrow}
          </span>

          <h1 data-reveal>
            {copy.analytics.hero.lines.map((line, i) => (
              <span className="ln" key={line}>
                {i === 1 ? <span className="accent-text">{line}</span> : line}
              </span>
            ))}
          </h1>

          <p className="hero-lede" data-reveal>
            {copy.analytics.hero.lede}
          </p>

          <div className="hero-cta" data-reveal>
            {/*
              "Open the dashboard" opens the dashboard. It used to scroll to the
              reports section further down this same page — and before the
              section-anchor fix in `router.ts` it did not even do that: an
              unprefixed hash resolved to the landing page, so the button went
              Home. `resolveRoute` sends a signed-out visitor to sign-in from
              here, which is the correct answer to "open my dashboard".
            */}
            <a href={PATHS.dashboard} className="btn btn-solid btn-lg">
              <Icon name="arrow" size={18} strokeWidth={2.2} />
              {copy.analytics.hero.primary}
            </a>
            <a href="#analytics-kpis" className="btn btn-ghost btn-lg">
              {copy.analytics.hero.secondary}
            </a>
          </div>
        </div>

        <div className="hero-visual analytics-visual" data-reveal>
          <div className="svc-card">
            <div className="svc-head">
              {/* The same initial the header chip and the console's service rows
                  use, so one venue is one letter everywhere on the site. */}
              <span className="pv-logo">
                {venue ? venue.name.trim().charAt(0).toUpperCase() || '?' : '·'}
              </span>
              <div>
                <b>{venue ? venue.name : copy.analytics.hero.venueLabel}</b>
                {/* The city, because it is the one field of a listing that is
                    the same word in every language and is always filled in by
                    the time a venue is reporting. The country is a code that
                    would need the setup form's own table to spell out, and
                    "Kraków, Poland" on a page an owner in Kraków is reading is
                    a word doing no work. */}
                <span>{venue?.city || copy.analytics.hero.venueNone}</span>
              </div>
            </div>

            <p className="svc-note">{copy.analytics.hero.venueNote}</p>

            {/* A real link, unlike the ID field it replaced. It goes where its
                words say — the same destination as the hero's primary button,
                which is the honest answer to "how do I see my numbers". */}
            <a className="btn btn-solid svc-go" href={PATHS.dashboard}>
              <Icon name="bars" size={16} />
              {copy.analytics.hero.primary}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────── kpis ── */

function AnalyticsKpis() {
  const copy = useCopy();

  return (
    <section className="section" id="analytics-kpis">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.analytics.kpis.eyebrow}</span>
          <h2>{copy.analytics.kpis.title}</h2>
          <p>{copy.analytics.kpis.lede}</p>
        </div>

        <div className="kpis">
          {ANALYTICS_KPIS.map((kpi, i) => (
            <article className="kpi" key={copy.analytics.kpis.items[i]} data-reveal>
              <span className="kpi-ico">
                <Icon name={kpi.icon} size={18} />
              </span>
              <b data-count={kpi.value} data-suffix={kpi.suffix}>
                0
              </b>
              <span className="kpi-name">{copy.analytics.kpis.items[i]}</span>
              {/* `data-dir` rather than a colour prop: the palette is two
                  colours, so a fall is drawn with weight and a caret, not with
                  red. */}
              <span className="kpi-delta" data-dir={kpi.delta < 0 ? 'down' : 'up'}>
                <Icon name="chevron" size={12} strokeWidth={2.6} />
                {Math.abs(kpi.delta)}%
                <i>{copy.analytics.kpis.since}</i>
              </span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────────────────────────────────────── funnel ── */

function AnalyticsFunnel() {
  const copy = useCopy();

  return (
    <section className="section" id="analytics-funnel">
      <div className="wrap split">
        <div className="split-copy">
          <div className="section-head left" data-reveal>
            <span className="eyebrow">{copy.analytics.funnel.eyebrow}</span>
            <h2>{copy.analytics.funnel.title}</h2>
            <p>{copy.analytics.funnel.lede}</p>
          </div>
        </div>

        <div className="split-visual" data-reveal>
          <div className="funnel">
            {copy.analytics.funnel.stages.map((stage, i) => (
              <div className="funnel-row" key={stage.name}>
                <div className="funnel-label">
                  <b>{stage.name}</b>
                  <span data-count={ANALYTICS_FUNNEL[i].value}>0</span>
                </div>
                {/*
                  The width is an inline custom property, not an inline width:
                  the bar animates from 0 in CSS once its row is revealed, and a
                  literal width would have to be animated in JS to do the same.
                */}
                <div
                  className="funnel-bar"
                  style={
                    { '--share': `${ANALYTICS_FUNNEL[i].share}%` } as CSSProperties
                  }
                />
                <p>{stage.note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────── week ── */

function AnalyticsWeek() {
  const copy = useCopy();

  const peak = ANALYTICS_WEEK.reduce(
    (best, value, i) => (value > ANALYTICS_WEEK[best] ? i : best),
    0,
  );
  const total = ANALYTICS_WEEK.reduce((sum, value) => sum + value, 0);

  return (
    <section className="section" id="analytics-week">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.analytics.week.eyebrow}</span>
          <h2>{copy.analytics.week.title}</h2>
          <p>{copy.analytics.week.lede}</p>
        </div>

        <div className="chart-card" data-reveal>
          <div className="chart-meta">
            <div>
              <span>{copy.analytics.week.total}</span>
              <b data-count={total}>0</b>
            </div>
            <div>
              <span>{copy.analytics.week.peak}</span>
              <b>{copy.analytics.week.days[peak]}</b>
            </div>
          </div>

          {/* One `role="img"` with a summary label rather than seven bars a
              screen reader has to walk: the shape is the information, and the
              shape does not survive being read out column by column. */}
          <div
            className="chart"
            role="img"
            aria-label={`${copy.analytics.week.peak}: ${copy.analytics.week.days[peak]}`}
          >
            {ANALYTICS_WEEK.map((value, i) => (
              <div className="chart-col" key={copy.analytics.week.days[i]}>
                <div
                  className="chart-bar"
                  data-peak={i === peak ? 'true' : undefined}
                  style={{ '--h': `${value}%` } as CSSProperties}
                />
                <span>{copy.analytics.week.days[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────── reports ── */

function AnalyticsReports() {
  const copy = useCopy();

  return (
    <section className="section" id="analytics-reports">
      <div className="wrap wrap-narrow">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.analytics.reports.eyebrow}</span>
          <h2>{copy.analytics.reports.title}</h2>
        </div>

        <ul className="benefits">
          {copy.analytics.reports.items.map((item, i) => (
            <li className="benefit" key={item.title} data-reveal>
              <span className="benefit-check">
                <Icon name={ANALYTICS_REPORT_ICONS[i]} size={16} />
              </span>
              <div>
                <h4>{item.title}</h4>
                <p>{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────── cta ── */

function AnalyticsCta() {
  const copy = useCopy();

  return (
    <section className="section" id="analytics-cta">
      <div className="wrap">
        <div className="cta-banner" data-reveal>
          <h2>{copy.analytics.cta.title}</h2>
          <p>{copy.analytics.cta.lede}</p>
          <div className="cta-actions">
            <a href={PATHS.dashboard} className="btn btn-solid btn-lg">
              <Icon name="arrow" size={18} strokeWidth={2.2} />
              {copy.analytics.cta.primary}
            </a>
            {/* "Talk to us about partnering" is a conversation, so it goes where
                conversations go now — not back to the front page. */}
            <a href={PATHS.contact} className="btn btn-ghost btn-lg">
              {copy.analytics.cta.secondary}
            </a>
          </div>
          <p className="cta-note">{copy.analytics.cta.note}</p>
        </div>
      </div>
    </section>
  );
}

/** The page, in order. */
export function AnalyticsPage() {
  return (
    <main>
      <AnalyticsHero />
      <AnalyticsKpis />
      <AnalyticsFunnel />
      <AnalyticsWeek />
      <AnalyticsReports />
      <AnalyticsCta />
    </main>
  );
}
