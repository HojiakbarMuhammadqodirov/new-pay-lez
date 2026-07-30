import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CONTACT_EMAIL,
  FEATURE_META,
  FOOTER_LINKS,
  HERO_STATS,
  PARTNERS,
  SERVICE_ICONS,
  VALUE_CARD,
} from './content';
import { Controller3D } from './controller/Controller3D';
import { Icon } from './icons';
import { useCopy } from './i18n/context';
import { usePalette } from './theme/context';

/* ────────────────────────────────────────────────────────────────── hero ── */

/**
 * Hero. The globe occupies the right-hand column where the original design put
 * a phone mockup — it is rendered by the fixed globe layer behind the page, so
 * this column is just the space reserved for it.
 */
export function Hero() {
  const copy = useCopy();

  return (
    <section className="hero" id="hero">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <h1 data-reveal>
            {copy.hero.lines.map((line, i) => (
              <span className="ln" key={line}>
                {i === 1 ? <span className="accent-text">{line}</span> : line}
              </span>
            ))}
          </h1>
          <p className="hero-lede" data-reveal>
            {copy.hero.lede}
          </p>
          <div className="hero-cta" data-reveal>
            <a href="#value" className="btn btn-solid btn-lg">
              <Icon name="arrow" size={18} strokeWidth={2.2} />
              {copy.hero.primary}
            </a>
            <a href="#features" className="btn btn-ghost btn-lg">
              {copy.hero.secondary}
            </a>
          </div>
          <div className="hero-meta" data-reveal>
            {HERO_STATS.map((stat, i) => (
              <div className="hero-stat-row" key={copy.hero.stats[i]}>
                {i > 0 && <span className="hero-stat-div" />}
                <div className="hero-stat">
                  <b data-count={stat.value} data-suffix={stat.suffix}>
                    0
                  </b>
                  <span>{copy.hero.stats[i]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reserved column: the globe layer renders behind this. */}
        <div className="hero-visual" aria-hidden />
      </div>
    </section>
  );
}

/* ───────────────────────────────────────────────────────────────── proof ── */

export function Proof() {
  const copy = useCopy();
  // Duplicated once so the marquee can loop without a visible seam.
  const track = [...PARTNERS, ...PARTNERS];

  return (
    <section className="proof" id="proof">
      <div className="wrap">
        <p className="proof-label" data-reveal>
          {copy.proof}
        </p>
        <div className="marquee">
          <div className="marquee-track">
            {track.map((name, i) => (
              <span
                className="logo-item"
                key={`${name}-${i}`}
                aria-hidden={i >= PARTNERS.length}
              >
                <span className="logo-dot" />
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────────────────────────────────────────── guide ── */

const CAROUSEL_INTERVAL = 2400;

/**
 * "Discover services in your city" — the section the globe's scroll transition
 * is timed to, so the services ride on top of the half-globe arc.
 *
 * The services advance one at a time rather than sitting in a static grid: the
 * arc below them is already the busiest thing on screen, and a single moving
 * focus keeps the two from competing.
 */
export function Guide() {
  const copy = useCopy();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = copy.guide.services.length;

  useEffect(() => {
    if (paused) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const timer = window.setInterval(
      () => setIndex((i) => (i + 1) % count),
      CAROUSEL_INTERVAL,
    );
    return () => window.clearInterval(timer);
  }, [paused, count]);

  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  );

  return (
    <section className="section guide" id="guide">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.guide.eyebrow}</span>
          <h2>{copy.guide.title}</h2>
          <p>{copy.guide.lede}</p>
        </div>
      </div>

      <div
        className="carousel"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        role="group"
        aria-roledescription="carousel"
        aria-label={copy.guide.title}
      >
        <div className="carousel-track" style={{ ['--index' as string]: index }}>
          {copy.guide.services.map((service, i) => (
            <article
              className="cat-card"
              key={service.name}
              data-state={i === index ? 'active' : 'idle'}
              aria-hidden={i !== index}
            >
              <span className="cat-ico">
                <Icon name={SERVICE_ICONS[i]} size={22} />
              </span>
              <div className="cat-tx">
                <b>{service.name}</b>
                <span>{service.blurb}</span>
              </div>
            </article>
          ))}
        </div>

        <div className="carousel-dots" role="tablist" aria-label={copy.guide.eyebrow}>
          {copy.guide.services.map((service, i) => (
            <button
              key={service.name}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={service.name}
              className="carousel-dot"
              data-on={i === index ? 'true' : undefined}
              onClick={() => go(i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── features ── */

/**
 * Play & Earn. The controller holds the centre of the composition and the
 * feature blocks flank it, unboxed — a grid of bordered cards would have
 * competed with it for attention.
 */
export function Features() {
  const copy = useCopy();
  const palette = usePalette();

  return (
    <section className="section features" id="features">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.features.eyebrow}</span>
          <h2>{copy.features.title}</h2>
          <p>{copy.features.lede}</p>
        </div>

        <div className="features-stage">
          {/* Split down the middle so the controller has copy on both flanks
              rather than a lopsided column. Odd counts weight the left. */}
          {([0, 1] as const).map((column) => (
            <ul
              className="feature-list"
              data-side={column === 0 ? 'left' : 'right'}
              key={column}
            >
              {copy.features.cards
                .map((card, index) => ({ card, index }))
                .filter(({ index }) => index % 2 === column)
                .map(({ card, index }) => (
                  <li className="feature-item" key={card.title} data-reveal>
                    <span className="feature-ico">
                      <Icon name={FEATURE_META[index].icon} size={22} />
                    </span>
                    <div className="feature-tx">
                      {FEATURE_META[index].stat && (
                        <span
                          className="feature-stat accent-text"
                          data-count={FEATURE_META[index].stat!.value}
                          data-suffix={FEATURE_META[index].stat!.suffix}
                        >
                          0
                        </span>
                      )}
                      <h3>{card.title}</h3>
                      <p>{card.body}</p>
                    </div>
                  </li>
                ))}
            </ul>
          ))}

          <Controller3D primaryColor={palette.primary} tone={palette.tone} />
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────────────────────────────────────────── value ── */

export function Value() {
  const copy = useCopy();
  const [revealed, setRevealed] = useState(false);

  return (
    <section className="section" id="value">
      <div className="wrap split">
        <div className="split-visual" data-reveal>
          <div className="preview-card">
            <div className="pv-merch">
              <span className="pv-logo">{VALUE_CARD.logo}</span>
              <div>
                <b>{copy.value.card.merchant}</b>
                <span>{copy.value.card.meta}</span>
              </div>
            </div>
            <div className="pv-img">
              <span>{VALUE_CARD.brand}</span>
            </div>
            <div className="pv-title">{copy.value.card.title}</div>
            <div className="pv-prices">
              <span className="pv-now">{copy.value.card.price}</span>
              <span className="pv-save" data-on={revealed ? 'true' : undefined}>
                {copy.value.card.revealed}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-solid pv-reveal"
              onClick={() => setRevealed(true)}
            >
              {copy.value.card.action}
            </button>
          </div>
        </div>

        <div className="split-copy">
          <div className="section-head left" data-reveal>
            <span className="eyebrow">{copy.value.eyebrow}</span>
            <h2>{copy.value.title}</h2>
            <p>{copy.value.lede}</p>
          </div>
          <ul className="benefits">
            {copy.value.benefits.map((benefit) => (
              <li className="benefit" key={benefit.title} data-reveal>
                <span className="benefit-check">
                  <Icon name="check" size={16} strokeWidth={3} />
                </span>
                <div>
                  <h4>{benefit.title}</h4>
                  <p>{benefit.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────── voices ── */

export function Voices() {
  const copy = useCopy();

  return (
    <section className="section" id="voices">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.voices.eyebrow}</span>
          <h2>{copy.voices.title}</h2>
        </div>
        <div className="tcols">
          {copy.voices.items.map((item) => (
            <figure className="tcard" key={item.name} data-reveal>
              <div className="tstars" aria-label="5 / 5">
                ★★★★★
              </div>
              <blockquote className="tquote">{item.quote}</blockquote>
              <figcaption className="tmeta">
                <span className="tavatar" aria-hidden>
                  {item.name.charAt(0)}
                </span>
                <div>
                  <b>{item.name}</b>
                  <span>{item.meta}</span>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────── cta ── */

export function FinalCta() {
  const copy = useCopy();

  return (
    <section className="section" id="cta">
      <div className="wrap">
        <div className="cta-banner" data-reveal>
          <h2>{copy.cta.title}</h2>
          <p>{copy.cta.lede}</p>
          <div className="cta-actions">
            <a href="#value" className="btn btn-solid btn-lg">
              <Icon name="arrow" size={18} strokeWidth={2.2} />
              {copy.cta.primary}
            </a>
            <a href="#guide" className="btn btn-ghost btn-lg">
              {copy.cta.secondary}
            </a>
          </div>
          <p className="cta-note">{copy.cta.note}</p>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────── footer ── */

export function SiteFooter() {
  const copy = useCopy();
  const [subscribed, setSubscribed] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-grid">
          <div className="footer-brand">
            <a className="brand" href="#top">
              <span className="brand-mark">
                <span>p</span>
              </span>
              <span className="brand-word">paylez</span>
            </a>
            <p>{copy.footer.blurb}</p>
            <p className="footer-contact">
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> ·{' '}
              {copy.footer.location}
            </p>
            <div className="footer-social">
              <a className="fsoc" href="#top" aria-label="paylez on Instagram">
                <Icon name="instagram" size={19} />
              </a>
              <a className="fsoc" href="#top" aria-label="paylez on YouTube">
                <Icon name="youtube" size={19} />
              </a>
            </div>
          </div>

          {copy.footer.columns.map((column, columnIndex) => (
            <nav
              className="footer-col"
              key={column.heading}
              aria-label={column.heading}
            >
              <h5>{column.heading}</h5>
              {column.links.map((link, linkIndex) => (
                <a href={FOOTER_LINKS[columnIndex][linkIndex]} key={link}>
                  {link}
                </a>
              ))}
            </nav>
          ))}

          <div className="news">
            <h5>{copy.footer.news.heading}</h5>
            <p>{copy.footer.news.body}</p>
            <form
              className="news-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (emailRef.current?.checkValidity()) setSubscribed(true);
              }}
            >
              <input
                ref={emailRef}
                type="email"
                required
                placeholder={copy.footer.news.placeholder}
                aria-label={copy.footer.news.emailLabel}
              />
              <button type="submit" aria-label={copy.footer.news.subscribe}>
                <Icon name="arrow" size={18} strokeWidth={2.4} />
              </button>
            </form>
            <p
              className="news-ok"
              data-on={subscribed ? 'true' : undefined}
              role="status"
            >
              {copy.footer.news.success}
            </p>
          </div>
        </div>

        <div className="footer-bottom">
          <span>{copy.footer.legal}</span>
          <span>
            <a href="#top">{copy.footer.privacy}</a> ·{' '}
            <a href="#top">{copy.footer.terms}</a>
          </span>
        </div>
      </div>
    </footer>
  );
}
