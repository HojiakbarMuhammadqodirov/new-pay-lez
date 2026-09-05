import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ASSISTANT_OPEN_EVENT,
  CONTACT_EMAIL,
  FEATURE_META,
  FOOTER_LINKS,
  HERO_STATS,
  PARTNERS,
  SERVICE_ICONS,
  SOCIALS,
  SUB_BADGE_ROW,
  SUB_DEFAULT_TERM,
  SUB_HERO,
  SUB_PLANS,
  SUB_ROWS,
  SUB_TERMS,
  subBeatsFree,
  subTermPrice,
  type SubRowKind,
  type SubValue,
} from './content';
import { Controller3D } from './controller/Controller3D';
import { Icon } from './icons';
import { useCopy, useCurrency, useMoney } from './i18n/context';
import { useAccount } from './auth/context';
import { fill } from './i18n/currency';
import { SubscribeButton } from './subscribe';
import { PATHS } from './router';
import { useSpotlight } from './pointer';
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
            {/* "Play & Earn" is the name of a page, and it now goes to it. It
                used to scroll to `#value`, which is the voucher section — the
                thing you spend points *on*, not the thing you earn them in. */}
            <a href={PATHS.learn} className="btn btn-solid btn-lg">
              <Icon name="arrow" size={18} strokeWidth={2.2} />
              {copy.hero.primary}
            </a>
            <a href="#guide" className="btn btn-ghost btn-lg">
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
 *
 * No reach wiring here, and it is a category error rather than a missing id:
 * `copy.guide.services` are the *kinds* of service Paylez covers — dictionary
 * copy — not venues. There is no listing being drawn, so there is nothing whose
 * impression this would be. See `api/reach.ts`.
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
              {/* An illustration of a voucher, and every word on it is copy.
                  It used to read its brand and its face value out of the
                  catalogue in `content.ts`, which made the picture a claim
                  about stock — a card at a price, on a page that could not tell
                  you whether either existed. The real shelf is
                  `GET /v1/gift-cards`, and the page that lists it is
                  `#/vouchers`. */}
              <span className="pv-logo">{copy.value.card.merchant.trim().charAt(0)}</span>
              <div>
                <b>{copy.value.card.merchant}</b>
                <span>{copy.value.card.meta}</span>
              </div>
            </div>
            <div className="pv-img">
              <span>{copy.value.card.merchant}</span>
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

/* ────────────────────────────────────────────────────────── subscription ── */

/** The nothing-mark, and what it is read as. See `SubRowKind` in `content.ts`. */
function SubNone() {
  const copy = useCopy().subscription;

  return (
    <span className="sub-val" data-none="true" aria-label={copy.notIncluded}>
      —
    </span>
  );
}

/**
 * One plan's answer to one row.
 *
 * `up` is the cell being an improvement on the free column — `subBeatsFree`,
 * computed off the table rather than decided here — and it is the whole of what
 * makes three columns of small print readable as an offer. A lit cell is
 * something this plan buys you; the free column has none and Premium has nearly
 * all of them, which is a shape rather than a paragraph.
 */
function SubCell({
  kind,
  value,
  up = false,
}: {
  kind: SubRowKind;
  value: SubValue;
  up?: boolean;
}) {
  const copy = useCopy().subscription;
  /* `undefined` rather than `"false"`: the sheet selects on the attribute's
     presence, and an attribute reading "false" is present. */
  const lit = up ? 'true' : undefined;

  if (value === null) {
    return (
      <b className="sub-val" data-up={lit}>
        {copy.unlimited}
      </b>
    );
  }

  if (kind === 'flag') {
    return value === 0 ? (
      <SubNone />
    ) : (
      <b className="sub-val" data-yes="true" data-up={lit} aria-label={copy.included}>
        <Icon name="check" size={14} strokeWidth={3} />
      </b>
    );
  }

  if (kind === 'badge') {
    return value === 0 ? (
      <SubNone />
    ) : (
      <b className="sub-val" data-up={lit}>
        {copy.badges[value - 1]}
      </b>
    );
  }

  /* A `number` row writes zero as nothing: no hours of head start and no points
     credited are the absence of a perk, not a quantity of one. */
  if (value === 0) return <SubNone />;

  return (
    <b className="sub-val" data-up={lit}>
      {kind === 'multiplier' ? `${value}×` : value}
    </b>
  );
}

/**
 * Hovering one feature lights that feature on all three plans.
 *
 * The nine rows under the strip are a comparison, and until this existed the
 * reader had to do the comparing with their eyes and their memory: find "Streak
 * freezes" on the free card, hold "2", track across two cards of identically
 * weighted small print to the same line. That is the one job the table is for
 * and it was the one thing the design did not help with.
 *
 * It cannot be done in CSS. A `:hover` reaches the row under the cursor and its
 * ancestors; the *same* row in a sibling card is not on that path, and there is
 * no selector for "the nth child of every other card". So one delegated
 * listener on the grid marks all three by hand.
 *
 * It is deliberately not React state. Every row would re-render three cards on
 * every pointer crossing — nine of them on the way down the list — for a change
 * that is one attribute on three nodes, which is the rule the root `CLAUDE.md`
 * states about continuous work and the same construction `focusStore` and the
 * scroll listener use. `pointerover` rather than `pointerenter` because only
 * the first bubbles, and one listener on the grid is the whole point.
 */
function useRowCompare() {
  const grid = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = grid.current;
    if (!el) return;

    let lit: HTMLElement[] = [];
    const clear = () => {
      for (const node of lit) delete node.dataset.on;
      lit = [];
    };

    const over = (event: PointerEvent) => {
      const row = (event.target as HTMLElement).closest?.('.sub-row');
      const index = row instanceof HTMLElement ? row.dataset.row : undefined;
      if (index === undefined) {
        clear();
        return;
      }
      /* Already lit. Moving between the label and the value of one row is two
         `pointerover`s and no change. */
      if (lit[0]?.dataset.row === index) return;
      clear();
      lit = Array.from(
        el.querySelectorAll<HTMLElement>(`.sub-row[data-row="${index}"]`),
      );
      for (const node of lit) node.dataset.on = 'true';
    };

    el.addEventListener('pointerover', over, { passive: true });
    el.addEventListener('pointerleave', clear, { passive: true });

    return () => {
      el.removeEventListener('pointerover', over);
      el.removeEventListener('pointerleave', clear);
      clear();
    };
  }, []);

  return grid;
}

/**
 * One plan, as a card.
 *
 * Its own component rather than a block inside the section's `map`, because it
 * holds a hook — the spotlight — and a hook cannot live in a loop body. The
 * loop is over a module constant of fixed length, so React would in fact never
 * see the count change; that is an argument for it working, not for writing it.
 *
 * **The rows are marked where they beat the free column.** That is the same
 * thirteen rows the section always carried; what changed is that the offer is
 * legible as a shape before it is read as a list. It is arithmetic on the table
 * above it and not a claim: this section has no subscriber count, no "most
 * popular" ribbon and nothing else it could not show its working for.
 */
function PlanCard({ planIndex, term }: { planIndex: number; term: number }) {
  const copy = useCopy().subscription;
  const money = useMoney();
  const currency = useCurrency();
  const card = useSpotlight();

  const plan = SUB_PLANS[planIndex];
  const named = copy.plans[planIndex];
  const rung = SUB_TERMS[term];

  /* The free plan is not on the ladder, so it is not priced by one — `terms` is
     a property of the plan on the server for exactly this reason, rather than a
     rule about which plans cost nothing. */
  const priced = plan.terms
    ? subTermPrice(plan.eur, rung.months, rung.discountBp, currency)
    : null;
  /* 0, 1 or 2 — none, star, crown. A `badge` row's value is an index into
     `copy.badges` and not a count, which is why it is read here rather than
     through `SubCell`. */
  const seal = SUB_ROWS[SUB_BADGE_ROW].values[planIndex] ?? 0;

  return (
    <article
      className="sub-card"
      data-tier={plan.id}
      data-reveal
      ref={card}
      /* Its place in the row, for the sheet: the three cards arrive one after
         another and each one's rail, figure and chip are timed off the same
         number. A custom property rather than three inline delays, because the
         staging belongs to the stylesheet and the index is the only thing the
         component knows. */
      style={{ ['--sub-i' as string]: planIndex }}
    >
      <div className="sub-card-in">
        {/* First child, so it paints under the content rather than over it —
            everything else in the plate is lifted a layer by `.sub-card-in > *`
            and siblings at one z-index stack in source order. */}
        <span className="sub-glint" aria-hidden="true" />

        {/*
          * The plan's mark, its name, and the seal it wears.
          *
          * The disc and the seal's glyph were stripped for a version and are
          * back: this section sells an arcade, and a rank badge with a crown on
          * it is the honest picture of what a subscription here buys. The disc
          * is drawn as a **pixel plate** rather than a circle — hard corners,
          * stepped highlight — which is the register the rest of the card now
          * works in.
          */}
        <header className="sub-head">
          <span className="sub-ico" aria-hidden>
            <Icon name={plan.icon} size={19} />
          </span>
          <span className="sub-titles">
            <h3>{named.name}</h3>
            <span className="sub-note">{named.note}</span>
          </span>
          {/* Read off the end of the table rather than printed as its last
              row — see `SUB_BADGE_ROW`. */}
          {seal !== 0 && (
            <span
              className="sub-seal"
              aria-label={fill(copy.mark, { name: copy.badges[seal - 1] })}
            >
              <Icon name={seal === 1 ? 'star' : 'crown'} size={12} />
              {copy.badges[seal - 1]}
            </span>
          )}
        </header>

        {/* Keyed on the term so a new price animates in rather than swapping
            under the eye. Remounting one `<p>` is the whole cost of it. */}
        <p className="sub-price" key={term}>
          {priced === null ? (
            <b>{copy.free}</b>
          ) : (
            <>
              <b>{money(priced.perMonth, 'unit')}</b>
              <span>{copy.perMonth}</span>
              {/* The rung's own saving, on the card it is taken off. It is the
                  ladder's figure rather than a second one: the chip above says
                  which rung is selected and this says what that rung is doing
                  to *this* price, which is the question a reader has while
                  looking at the price rather than at the ladder. */}
              {rung.discountBp > 0 && (
                <span className="sub-save">
                  {fill(copy.term.save, { pct: String(rung.discountBp / 100) })}
                </span>
              )}
            </>
          )}
        </p>

        {/* What is actually charged, which is what makes opening on the
            twelve-month rung honest rather than sly. */}
        <p className="sub-billed">
          {priced === null
            ? copy.billed.free
            : rung.months === 1
              ? copy.billed.monthly
              : fill(copy.billed.term, {
                  total: money(priced.total, 'unit'),
                  n: String(rung.months),
                })}
        </p>

        {/* The three figures the plan is actually bought for, at a size that
            can make the case. */}
        <ul className="sub-hero">
          {SUB_ROWS.slice(0, SUB_HERO).map((row, rowIndex) => (
            <li key={rowIndex}>
              <b>
                <SubCell kind={row.kind} value={row.values[planIndex]} />
              </b>
              <span>{copy.heroRows[rowIndex]}</span>
            </li>
          ))}
        </ul>

        <span className="sub-more">{copy.more}</span>

        <ul className="sub-rows">
          {SUB_ROWS.slice(SUB_HERO, SUB_BADGE_ROW).map((row, offset) => {
            const rowIndex = offset + SUB_HERO;
            return (
              <li className="sub-row" key={rowIndex} data-row={rowIndex}>
                <span className="sub-row-label">{copy.rows[rowIndex]}</span>
                <SubCell
                  kind={row.kind}
                  value={row.values[planIndex]}
                  up={subBeatsFree(rowIndex, planIndex)}
                />
              </li>
            );
          })}
        </ul>

        {/* A press per paid card, which there is now something behind. This
            section used to carry one button for the whole strip, on the
            reasoning that three reading "Get Pro" would be three that do not —
            true while nothing could take a payment, and no longer. Signed out
            it still goes to sign-in, because checkout needs an account to
            attach a subscription to. `SubscribeButton` renders nothing at all
            for the free plan, which is why this is unconditional. */}
        <SubscribeButton
          planCode={plan.id}
          planName={named.name}
          months={rung.months}
        />

      </div>
    </article>
  );
}

/**
 * What a subscription costs, and what each one is.
 *
 * It sits directly under "your points are real money" because that section is
 * the argument this one prices: the reader has just been told a point is worth
 * something, and the next honest question is what it costs to earn them faster.
 *
 * **The plans are the server's, not the page's.** `SUB_PLANS` and `SUB_ROWS` in
 * `content.ts` mirror `PLANS` in `server/domain/settings.ts` row for row, and
 * the four rungs mirror `TERM_LADDER`. Nothing here is a round number chosen
 * because it looked convincing — there is no subscriber count, no "most
 * popular" ribbon and no headline saving, because none of those is a figure the
 * product could show its working for. The one claim on the section is the
 * discount, and that is arithmetic.
 *
 * **Money never appears as a literal.** Every amount is euros in `content.ts`
 * and is converted on the way out by `money()`, because the language the
 * visitor chose is what picks the currency — an English reader is quoted the
 * same plan in pounds. `'unit'` is the rounding mode and it is not optional
 * here: `price` snaps to the currency's shelf step, which flattens the whole
 * four-rung ladder onto one number in every currency with a step above a
 * pound. See `subTermPrice`, which is where that is argued at length.
 *
 * The term is React state and the prices are derived during render — four
 * multiplications on a click, not per frame, so it does not go near the rule
 * about continuous updates.
 */
export function Subscription() {
  const copy = useCopy().subscription;
  const account = useAccount();
  const [term, setTerm] = useState(SUB_DEFAULT_TERM);
  const grid = useRowCompare();
  /* The same two properties the cards use for their own light, written on the
     section instead — the field below reads them. A card sets its own and
     shadows the section's inside itself, which is what makes one hook serve
     both without either knowing about the other. */
  const field = useSpotlight();

  return (
    <section className="section" id="subscription" ref={field}>
      {/*
        * The ruled field this section is printed on.
        *
        * Not a backdrop in the sense the root `CLAUDE.md` means — it holds no
        * canvas and no context, it is two repeating hairline gradients under a
        * mask, and it lives inside this one section rather than behind the
        * route. The landing page's backdrop is still the globe and still the
        * only one.
        *
        * What it means is the point of it existing at all: a price list is a
        * ruled table, and this is the paper it is ruled on. It is invisible
        * except where the reader's hand is, so it is discovered rather than
        * decorated with — which is also why it costs nothing to a reader who
        * never moves the pointer into the section.
        */}
      <span className="sub-field" aria-hidden="true" />

      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.eyebrow}</span>
          <h2>{copy.title}</h2>
          <p>{copy.lede}</p>
        </div>

        {/* The ladder. A rung is a whole control edge to edge — the label, the
            chip and the space around both put the same rung under the cursor,
            which is the rule the Relocate converter's amount field was fixed
            against. */}
        <div
          className="sub-ladder"
          role="radiogroup"
          aria-label={copy.term.label}
          data-reveal
        >
          {SUB_TERMS.map((option, index) => (
            <button
              key={option.months}
              type="button"
              role="radio"
              aria-checked={index === term}
              className="sub-rung"
              data-on={index === term ? 'true' : undefined}
              onClick={() => setTerm(index)}
            >
              <b>
                {option.months === 1
                  ? copy.term.one
                  : fill(copy.term.many, { n: String(option.months) })}
              </b>
              <span className="sub-rung-note">
                {option.discountBp === 0
                  ? copy.term.rolling
                  : fill(copy.term.save, { pct: String(option.discountBp / 100) })}
              </span>
            </button>
          ))}
        </div>

        <div className="sub-grid" ref={grid}>
          {SUB_PLANS.map((plan, planIndex) => (
            <PlanCard key={plan.id} planIndex={planIndex} term={term} />
          ))}
        </div>

        {/* Still here, and now the *other* half: the cards sell a plan, this
            offers the account somebody needs before they can buy one — and is
            the only thing on the strip for a visitor who wants neither. */}
        {/* Only show the account CTA when the visitor is not signed in. */}
        {!account && (
          <div className="sub-foot" data-reveal>
            <a href={PATHS.signin} className="btn btn-ghost btn-lg">
              <Icon name="arrow" size={18} strokeWidth={2.2} />
              {copy.action}
            </a>
            <p className="sub-foot-note">{copy.note}</p>
          </div>
        )}
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
            <a href={PATHS.learn} className="btn btn-solid btn-lg">
              <Icon name="arrow" size={18} strokeWidth={2.2} />
              {copy.cta.primary}
            </a>
            {/* "Explore the Living Guide" is Relocate. It was `#guide`, which is
                the landing page's service carousel — a different thing that
                happens to share the word. */}
            <a href={PATHS.relocate} className="btn btn-ghost btn-lg">
              {copy.cta.secondary}
            </a>
          </div>
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
            {/* The header's wordmark, and literally its class — the two are one
                mark and should never drift apart. */}
            <a className="brand" href={PATHS.landing}>
              paylez
            </a>
            <p>{copy.footer.blurb}</p>
            <p className="footer-contact">
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> ·{' '}
              {copy.footer.location}
            </p>
            <div className="footer-social">
              {/* Real destinations, and the only links on the site that leave
                  it — hence `rel`, which the in-site links have no use for. */}
              {SOCIALS.map((social) => (
                <a
                  className="fsoc"
                  key={social.id}
                  href={social.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={fill(copy.footer.social, {
                    channel: social.id === 'youtube' ? 'YouTube' : 'Instagram',
                  })}
                >
                  <Icon name={social.id} size={19} />
                </a>
              ))}
            </div>
          </div>

          {copy.footer.columns.map((column, columnIndex) => (
            <nav
              className="footer-col"
              key={column.heading}
              aria-label={column.heading}
            >
              <h5>{column.heading}</h5>
              {column.links.map((link, linkIndex) => {
                const href = FOOTER_LINKS[columnIndex][linkIndex];
                /* `null` is the assistant, which is a dock rather than a page.
                   A button, so it is not a link that goes nowhere. */
                return href === null ? (
                  <button
                    type="button"
                    className="footer-link-btn"
                    key={link}
                    onClick={() =>
                      window.dispatchEvent(new Event(ASSISTANT_OPEN_EVENT))
                    }
                  >
                    {link}
                  </button>
                ) : (
                  <a href={href} key={link}>
                    {link}
                  </a>
                );
              })}
            </nav>
          ))}

          <div className="news">
            <h5>{copy.footer.news.heading}</h5>
            <p>{copy.footer.news.body}</p>
            {/*
              It hands off to a mail app, exactly as `ContactForm` does, and for
              the reason that file's own header gives: there is no server behind
              this, and "the usual way that gets built is a `setTimeout` and a
              green tick over a message nobody received". That is precisely what
              this was — `setSubscribed(true)` and a line reading "You're in —
              watch your inbox", with the address going nowhere at all. A visitor
              typed a real address, was told they were subscribed, and no email
              was ever going to arrive.

              The confirmation was reworded in all five languages to match: it
              now says the mail app is open and the message still has to be sent,
              which is the true half of what just happened. The field is cleared
              too — it used to sit there holding the address under a
              confirmation, which reads as "stored".
            */}
            <form
              className="news-form"
              onSubmit={(event) => {
                event.preventDefault();
                const field = emailRef.current;
                if (!field?.checkValidity()) return;

                const address = field.value.trim();
                const subject = copy.footer.news.subscribe;
                window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
                  subject,
                )}&body=${encodeURIComponent(address)}`;

                field.value = '';
                setSubscribed(true);
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
            {/*
              A live region that is *empty* until there is something to say.
              It used to render the confirmation from first paint and hide it
              with `opacity: 0` — which hides it from the eye and from nobody
              else: a screen reader read "You're in" on page load, and then had
              nothing to announce when `data-on` flipped, because the text had
              not changed. A live region only fires on a change to its contents.
            */}
            <p className="news-ok" data-on={subscribed ? 'true' : undefined} role="status">
              {subscribed && copy.footer.news.success}
            </p>
          </div>
        </div>

        {/*
          Both links point at real routes now.

          They used to be `<a href="#top">` — the same href the wordmark uses —
          so from Business, Relocate or anywhere else, clicking "Privacy Policy"
          dropped the reader on the marketing front page. That is the
          silent-trip-to-Home bug `ANCHOR_ROUTES` was written to end, and it is
          worse here than on a CTA: a legal link is the one a reader follows
          because they want the document, not the site. `PATHS` rather than a
          literal, for the same reason nothing else here hardcodes a hash.
        */}
        <div className="footer-bottom">
          <span>{copy.footer.legal}</span>
          <nav className="footer-legal" aria-label={copy.footer.legal}>
            <a href={PATHS.privacy}>{copy.footer.privacy}</a>
            <a href={PATHS.terms}>{copy.footer.terms}</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
