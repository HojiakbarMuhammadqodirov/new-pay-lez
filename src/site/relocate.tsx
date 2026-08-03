import { useMemo, useState, type CSSProperties } from 'react';
import {
  RELOCATE_AMOUNT,
  RELOCATE_COUNTRIES,
  RELOCATE_PAIRS,
  RELOCATE_STATS,
  RELOCATE_TOPIC_ICONS,
} from './content';
import { Icon } from './icons';
import { useCopy, useLanguage } from './i18n/context';
import { CURRENCIES, fill, group } from './i18n/currency';
import { PATHS } from './router';
/*
 * The flag subset, borrowed from the globe's country card rather than declared
 * again here. Chromium on Windows ships no glyphs for regional-indicator pairs,
 * so without it every flag on this page renders as the two letters it is built
 * from — and the country strip becomes "PL PL, DE DE".
 */
import '../components/GlobeHero/ui/flagFont.css';

/**
 * Relocate — the sixth page, and the Living Guide's front door.
 *
 * The other pages sell something. This one is the part of the product that is
 * free, and the page is written that way: no pricing, no CTA that asks for a
 * card, and the guide readable without an account. What it has instead of a
 * pitch is specificity — nine subjects, fourteen countries, and a rate card that
 * quotes the mid-market number rather than one with a spread hidden in it.
 *
 * **This page keeps the globe.** It is the only route besides the landing page
 * that does, and it is not a saving — it is the correct picture. The globe is
 * about a border being crossed, which is what "relocate" means; the node web is
 * a player base and the market tape is a venue's revenue, and neither is this.
 * Reusing it also costs nothing: one route renders at a time, so the document
 * still never holds more than one WebGL context. See the backdrop note in
 * CLAUDE.md.
 */

/* ───────────────────────────────────────────────────────────── the rate ── */

/**
 * The rate card.
 *
 * A converter and nothing more: an amount in, the same amount in another
 * currency out, at the mid-market rate. Paylez does not send, receive or hold
 * money — which is why there is no fee row, no arrival time and no list of
 * providers on it, and why the number it quotes has nothing on top of it.
 *
 * Every rate is derived from the one table in `i18n/currency.ts` — the same
 * table that prices the rest of the site — so the card cannot drift from the
 * voucher values two pages over. Cross rates go through the base unit:
 * `to.rate / from.rate` is exact for any pair, which is the whole reason the
 * table is anchored to one currency rather than holding a matrix of pairs that
 * would have to agree with each other by hand.
 *
 * The reader's own currency is filtered out of the destinations. A card offering
 * to convert złoty into złoty is a card nobody asked for.
 */
function RateCard() {
  const copy = useCopy();
  const [language] = useLanguage();
  const from = CURRENCIES[language];

  const pairs = useMemo(
    () => RELOCATE_PAIRS.filter((code) => code !== language).slice(0, 3),
    [language],
  );

  const [active, setActive] = useState(0);
  // Clamped rather than reset: the list is rebuilt when the language changes,
  // and an index held from the longer list would read off the end of it.
  const to = CURRENCIES[pairs[Math.min(active, pairs.length - 1)]];

  /**
   * What is being converted, as typed.
   *
   * A **string**, not a number, and that is the whole trick to a converter that
   * is pleasant to type in. Holding a number means the field cannot contain
   * `''` while you clear it, cannot hold a trailing `.` while you reach for the
   * decimals, and re-formats `1.50` to `1.5` under the cursor. The string is
   * what the reader typed; `amount` below is what the maths uses.
   */
  const [typed, setTyped] = useState(String(RELOCATE_AMOUNT));
  /** Which side is being typed into — the other one is the answer. */
  const [edge, setEdge] = useState<'from' | 'to'>('from');

  /** One unit of the reader's currency in the destination's. */
  const rate = to.rate / from.rate;

  const amount = Number(typed.replace(',', '.'));
  const valid = typed.trim() !== '' && Number.isFinite(amount) && amount >= 0;
  const converted = valid ? (edge === 'from' ? amount * rate : amount / rate) : 0;

  const write = (value: number, currency: typeof to) =>
    currency.before
      ? `${currency.symbol}${group(value, currency)}`
      : `${group(value, currency)} ${currency.symbol}`;

  /*
   * Digits, one separator, nothing else. Filtering on the way in rather than
   * validating on the way out means the field can never hold something the
   * arithmetic below would turn into `NaN`.
   */
  const onType = (raw: string) => {
    const cleaned = raw.replace(/[^\d.,]/g, '').replace(/[.,](?=.*[.,])/g, '');
    setTyped(cleaned);
  };

  /** The side being read rather than typed, formatted with its symbol. */
  const answer = write(converted, edge === 'from' ? to : from);

  const field = (side: 'from' | 'to') => {
    const currency = side === 'from' ? from : to;
    const mine = edge === side;
    return (
      <div className="rate-row" data-out={side === 'to' ? 'true' : undefined}>
        <span>{side === 'from' ? copy.relocate.rates.send : copy.relocate.rates.gets}</span>
        <span className="rate-input" data-live={mine ? 'true' : undefined}>
          {currency.before && <i>{currency.symbol}</i>}
          <input
            type="text"
            inputMode="decimal"
            /* The typed side shows the raw string; the other shows the answer,
               already grouped and with its symbol stripped back off so the two
               fields line up. */
            value={mine ? typed : group(converted, currency)}
            aria-label={side === 'from' ? copy.relocate.rates.send : copy.relocate.rates.gets}
            onChange={(event) => {
              setEdge(side);
              onType(event.target.value);
            }}
            onFocus={() => {
              /* Typing into the answer flips the direction and seeds the field
                 with what it was showing, so the number does not jump. */
              if (!mine) {
                setEdge(side);
                setTyped(String(Math.round(converted * 100) / 100));
              }
            }}
          />
          {!currency.before && <i>{currency.symbol}</i>}
        </span>
      </div>
    );
  };

  return (
    <div className="console rate-card">
      <div className="rate-saved">
        <span className="console-label">{copy.relocate.rates.saved}</span>
        <div className="rate-pairs">
          {pairs.map((code, i) => (
            <button
              type="button"
              key={code}
              className="rate-pair"
              data-on={i === Math.min(active, pairs.length - 1) ? 'true' : undefined}
              onClick={() => setActive(i)}
            >
              {from.symbol} <Icon name="arrow" size={12} strokeWidth={2.4} />{' '}
              {CURRENCIES[code].symbol}
            </button>
          ))}
        </div>
      </div>

      {field('from')}

      <button
        type="button"
        className="rate-swap"
        aria-label={copy.relocate.rates.swap}
        title={copy.relocate.rates.swap}
        onClick={() => {
          /* Swapping is just moving which end you are typing at, with the
             number that was on screen carried across. */
          setTyped(String(Math.round(converted * 100) / 100));
          setEdge(edge === 'from' ? 'to' : 'from');
        }}
      >
        <Icon name="arrow" size={15} strokeWidth={2.2} />
      </button>

      {field('to')}

      <div className="rate-foot">
        <span>{copy.relocate.rates.rate}</span>
        {/* Written out in full rather than as a bare number: "1 £ = 5.06 zł" is
            a sentence someone can check, and a lone decimal is not. */}
        <b>
          {write(1, from)} = {write(rate, to)}
        </b>
      </div>

      <p className="rate-total" aria-live="polite">
        {valid
          ? fill(copy.relocate.rates.result, {
              from: write(amount, edge === 'from' ? from : to),
              to: answer,
            })
          : copy.relocate.rates.enter}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── hero ── */

function RelocateHero() {
  const copy = useCopy();

  return (
    <section className="hero" id="relocate-top">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <a className="learn-back" href={PATHS.landing} data-reveal>
            <Icon name="arrow" size={15} strokeWidth={2.2} />
            {copy.relocate.back}
          </a>

          <span className="eyebrow learn-eyebrow" data-reveal>
            {copy.relocate.hero.eyebrow}
          </span>

          <h1 data-reveal>
            {copy.relocate.hero.lines.map((line, i) => (
              <span className="ln" key={line}>
                {i === copy.relocate.hero.lines.length - 1 ? (
                  <span className="accent-text">{line}</span>
                ) : (
                  line
                )}
              </span>
            ))}
          </h1>

          <p className="hero-lede" data-reveal>
            {copy.relocate.hero.lede}
          </p>

          <div className="hero-cta" data-reveal>
            <a href="#relocate-guide" className="btn btn-solid btn-lg">
              <Icon name="arrow" size={18} strokeWidth={2.2} />
              {copy.relocate.hero.primary}
            </a>
            <a href="#relocate-rates" className="btn btn-ghost btn-lg">
              {copy.relocate.hero.secondary}
            </a>
          </div>

          <div className="hero-meta" data-reveal>
            {RELOCATE_STATS.map((stat, i) => (
              <div className="hero-stat-row" key={copy.relocate.hero.stats[i]}>
                {i > 0 && <span className="hero-stat-div" />}
                <div className="hero-stat">
                  <b data-count={stat.value} data-suffix={stat.suffix}>
                    0
                  </b>
                  <span>{copy.relocate.hero.stats[i]}</span>
                </div>
              </div>
            ))}
          </div>

          <p className="b2b-trust" data-reveal>
            {copy.relocate.hero.trust}
          </p>
        </div>

        {/* Empty on purpose: the globe renders behind this column, exactly as it
            does on the landing page. This only reserves the space. */}
        <div className="hero-visual" aria-hidden />
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────── rates ── */

function RelocateRates() {
  const copy = useCopy();

  return (
    <section className="section" id="relocate-rates">
      <div className="wrap split">
        <div className="split-copy">
          <div className="section-head left" data-reveal>
            <span className="eyebrow">{copy.relocate.rates.eyebrow}</span>
            <h2>{copy.relocate.rates.title}</h2>
            <p>{copy.relocate.rates.lede}</p>
          </div>

          <ul className="pillar-list" data-reveal>
            {copy.relocate.rates.bullets.map((bullet) => (
              <li key={bullet.title}>
                <Icon name="check" size={15} strokeWidth={3} />
                <div>
                  <b>{bullet.title}</b>
                  <span>{bullet.body}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="split-visual" data-reveal>
          <RateCard />
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────── guide ── */

/**
 * The nine subjects.
 *
 * A grid of rows rather than cards: the app lists them as rows with a chevron,
 * and someone who has used the app should recognise this as the same list. The
 * chevron is decorative here — these open in the app, and a marketing page
 * cannot honour the click.
 */
function RelocateGuide() {
  const copy = useCopy();

  return (
    <section className="section" id="relocate-guide">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.relocate.guide.eyebrow}</span>
          <h2>{copy.relocate.guide.title}</h2>
          <p>{copy.relocate.guide.lede}</p>
        </div>

        <div className="guide-bar" data-reveal>
          <span className="console-tag">
            <Icon name="map" size={13} />
            {copy.relocate.guide.cities}
            <Icon name="chevron" size={12} strokeWidth={2.4} />
          </span>
          <span className="guide-search">
            <Icon name="assistant" size={14} />
            {copy.relocate.guide.search}
          </span>
        </div>

        <div className="topics">
          {copy.relocate.guide.items.map((item, i) => (
            <article className="topic" key={item.name} data-reveal>
              <span className="topic-ico">
                <Icon name={RELOCATE_TOPIC_ICONS[i]} size={20} />
              </span>
              <div>
                <b>{item.name}</b>
                <span>{item.blurb}</span>
              </div>
              <Icon name="chevron" size={16} strokeWidth={2.2} className="topic-go" />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── countries ── */

/**
 * Where the guidance is written for.
 *
 * Flags, not a list of names — the one sanctioned exception to the two-colour
 * rule, and the reason this reads as a map at a glance instead of as a
 * paragraph. The font is the self-hosted Twemoji subset (`public/fonts/`), so
 * they render the same on a machine that has no flag emoji of its own.
 */
function RelocateCountries() {
  const copy = useCopy();

  return (
    <section className="section" id="relocate-countries">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.relocate.countries.eyebrow}</span>
          <h2>{copy.relocate.countries.title}</h2>
          <p>{copy.relocate.countries.lede}</p>
        </div>

        <div className="flags" data-reveal>
          {RELOCATE_COUNTRIES.map((country) => (
            <span className="flag-chip" key={country.code}>
              <i>{country.flag}</i>
              {country.code}
            </span>
          ))}
        </div>

        <p className="b2b-note" data-reveal>
          {copy.relocate.countries.note}
        </p>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────── ask ── */

/**
 * The assistant, as the escape hatch from a fixed list of nine subjects.
 *
 * The field is a picture of one — a real input on a marketing page is a promise
 * to answer, and this page cannot keep it. The sample questions carry the point
 * instead: they are specific enough to show what the assistant is for.
 */
function RelocateAsk() {
  const copy = useCopy();

  return (
    <section className="section" id="relocate-ask">
      <div className="wrap wrap-narrow">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.relocate.ask.eyebrow}</span>
          <h2>{copy.relocate.ask.title}</h2>
          <p>{copy.relocate.ask.lede}</p>
        </div>

        <div className="ask-box" data-reveal>
          <span className="ask-field">
            <Icon name="assistant" size={17} />
            {copy.relocate.ask.placeholder}
          </span>
          <span className="btn btn-solid ask-go">{copy.relocate.ask.action}</span>
        </div>

        <div className="chips ask-chips" data-reveal>
          {copy.relocate.ask.samples.map((sample, i) => (
            <span
              className="chip"
              key={sample}
              style={{ '--i': i } as CSSProperties}
            >
              {sample}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────────── cta ── */

function RelocateCta() {
  const copy = useCopy();

  return (
    <section className="section" id="relocate-cta">
      <div className="wrap">
        <div className="cta-banner" data-reveal>
          <h2>{copy.relocate.cta.title}</h2>
          <p>{copy.relocate.cta.lede}</p>
          <div className="cta-actions">
            <a href="#relocate-guide" className="btn btn-solid btn-lg">
              <Icon name="arrow" size={18} strokeWidth={2.2} />
              {copy.relocate.cta.primary}
            </a>
            <a href={PATHS.learn} className="btn btn-ghost btn-lg">
              {copy.relocate.cta.secondary}
            </a>
          </div>
          <p className="cta-note">{copy.relocate.cta.note}</p>
        </div>
      </div>
    </section>
  );
}

/** The page, in order. */
export function RelocatePage() {
  return (
    <main>
      <RelocateHero />
      <RelocateRates />
      <RelocateGuide />
      <RelocateCountries />
      <RelocateAsk />
      <RelocateCta />
    </main>
  );
}
