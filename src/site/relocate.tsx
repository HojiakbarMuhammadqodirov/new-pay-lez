import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import {
  RELOCATE_AMOUNT,
  RELOCATE_CITIES,
  RELOCATE_COUNTRIES,
  RELOCATE_PAIRS,
  RELOCATE_PROVIDERS,
  RELOCATE_STATS,
  RELOCATE_TOPICS,
  SPOKEN_LANGUAGES,
  type RelocateProvider,
} from './content';
import { Icon } from './icons';
import { useCopy, useLanguage } from './i18n/context';
import { CURRENCIES, fill } from './i18n/currency';
import {
  FX,
  FX_FOR_LANGUAGE,
  FX_ORDER,
  formatFx,
  formatRate,
  type FxCode,
} from './i18n/fx';
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
 * The backdrop is `.site__rings` — CSS contour rings meaning distance from
 * where you are standing, the way a map draws "near you". The page had the
 * globe once, on the argument that it was about a border being crossed; it is
 * not — it is a guide to the place you have already arrived in. See the
 * backdrop note in CLAUDE.md.
 */

/* ───────────────────────────────────────────────────────── the exchange ── */

/**
 * A number the field can be seeded with, as opposed to one it can display.
 *
 * `formatFx` groups its digits, and the group separator is a comma for an
 * English reader — which the input's own filter would then read as a decimal
 * mark. Anything written *back into* the field goes through here instead:
 * plain digits, one dot, no trailing zeros.
 */
function plain(value: number, decimals: number): string {
  const fixed = value.toFixed(decimals);
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
}

/**
 * Roughly how tall the open menu is, in pixels — the search row plus a full
 * `max-height` list, matching `.fx-menu` in `site.css`. Only used to decide
 * which way it opens, so an estimate is enough; it does not size anything.
 */
const MENU_HEIGHT = 320;

/**
 * The currency picker.
 *
 * Nineteen currencies is past the count a row of pills can carry and past the
 * count a reader will scan, so it is a menu with a search in it: type `uz`,
 * `soum` or `so'm` and there is one row left. The names come from the
 * dictionary — `names` is keyed by currency code, and because `relocate.tsx`
 * indexes it with `FxCode`, a currency added to `fx.ts` without a name in all
 * five languages is a build error rather than a blank row.
 *
 * A native `<select>` would have been fewer lines and is what the city filter
 * on this page uses. It cannot show a flag, cannot be searched on a phone, and
 * cannot show the code and the name as two weights — all three of which are
 * what makes a nineteen-item list findable.
 */
function CurrencyPicker({
  value,
  onPick,
  label,
}: {
  value: FxCode;
  onPick: (code: FxCode) => void;
  label: string;
}) {
  const copy = useCopy();
  const text = copy.relocate.rates;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  /** Opened upwards, because downwards would have run off the bottom. */
  const [up, setUp] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  /* Close on anything that means "I am done here". `pointerdown` rather than
     `click` so the menu is gone before whatever was clicked underneath it
     reacts, and Escape because a menu that traps you is not a menu. */
  useEffect(() => {
    if (!open) return;

    const away = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const needle = query.trim().toLowerCase();
  const shown = FX_ORDER.filter(
    (code) =>
      !needle ||
      code.toLowerCase().includes(needle) ||
      text.names[code].toLowerCase().includes(needle) ||
      FX[code].symbol.toLowerCase().includes(needle),
  );

  return (
    <div className="fx-pick" ref={box}>
      <button
        type="button"
        className="fx-pick-btn"
        aria-expanded={open}
        aria-label={`${label}: ${text.names[value]}`}
        onClick={(event) => {
          /*
           * Which way it opens is decided here, not in CSS — a menu tall enough
           * to matter is exactly the one that will not fit, and the lower of
           * the two rows is the common case. Measured against the button's own
           * box at the moment of opening, which is the only time the answer can
           * be known.
           */
          const rect = event.currentTarget.getBoundingClientRect();
          setUp(rect.bottom + MENU_HEIGHT > window.innerHeight && rect.top > MENU_HEIGHT);
          setQuery('');
          setOpen(!open);
        }}
      >
        <i className="fx-flag">{FX[value].flag}</i>
        <b>{value}</b>
        <Icon name="chevron" size={14} strokeWidth={2.4} />
      </button>

      {open && (
        <div className="fx-menu" data-up={up ? 'true' : undefined}>
          <div className="fx-search">
            <Icon name="search" size={15} />
            <input
              type="search"
              value={query}
              placeholder={text.search}
              aria-label={text.search}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          {shown.length === 0 ? (
            <p className="fx-none">{fill(text.noMatch, { query: query.trim() })}</p>
          ) : (
            <ul className="fx-list">
              {shown.map((code) => (
                <li key={code}>
                  <button
                    type="button"
                    data-on={code === value ? 'true' : undefined}
                    onClick={() => {
                      onPick(code);
                      setOpen(false);
                    }}
                  >
                    <i className="fx-flag">{FX[code].flag}</i>
                    <b>{code}</b>
                    <span>{text.names[code]}</span>
                    {code === value && <Icon name="check" size={14} strokeWidth={3} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The converter.
 *
 * A converter and nothing more: an amount in, the same amount in another
 * currency out, at the mid-market rate. Paylez does not send, receive or hold
 * money — which is why there is no fee row, no arrival time and no list of
 * providers on it, and why the number it quotes has nothing on top of it.
 *
 * Three things about it are deliberate:
 *
 * - **Either currency can be anything.** It used to offer the five the *site*
 *   is priced in, converting out of the reader's own — which meant somebody in
 *   Kraków sending money to Tashkent was offered neither end of that. Both
 *   sides now read the whole table in `i18n/fx.ts`, and the cross rate goes
 *   through the anchor: `to.rate / from.rate` is exact for every pair.
 * - **Either side can be typed into.** The one you are typing in is the
 *   question; the other is the answer, and focusing it swaps the roles rather
 *   than clearing it.
 * - **The whole well is the field.** Both amounts are `<label>`s wrapping their
 *   input, and the *label* fills the row — so a tap anywhere on it, including
 *   on the currency symbol and the empty space after the digits, puts the caret
 *   in the input. It used to be a content-sized input holding a right-aligned
 *   number and nothing else, which meant the only thing a tap could land on was
 *   the digits themselves: on a phone, a target a few millimetres wide. The
 *   input still sizes to its content (so a trailing `zł` stays beside its
 *   number) — that was never the problem, the missing label was.
 */
function ExchangeCard() {
  const copy = useCopy();
  const [language] = useLanguage();
  const text = copy.relocate.rates;

  /* Digit grouping belongs to the reader, not to the currency being written —
     see the note in `fx.ts`. This is the only thing the card wants from the
     language's own currency. */
  const separator = CURRENCIES[language].group;

  const home = FX_FOR_LANGUAGE[language];
  const shortcuts = useShortcuts(home);

  /* Opened on the first shortcut rather than on a pair of its own, so the chip
     that is lit is the pair the card is showing. The reader's own currency
     into złoty — this is a guide to a country whose money is złoty — or into
     euros for the reader whose money already is. */
  const [from, setFrom] = useState<FxCode>(shortcuts[0][0]);
  const [to, setTo] = useState<FxCode>(shortcuts[0][1]);

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

  /** One unit of the left-hand currency in the right-hand one. */
  const rate = FX[to].rate / FX[from].rate;

  const amount = Number(typed.replace(',', '.'));
  const valid = typed.trim() !== '' && Number.isFinite(amount) && amount >= 0;
  /** The side that is *not* being typed into — the answer. */
  const answer = valid ? (edge === 'from' ? amount * rate : amount / rate) : 0;

  const value = (side: 'from' | 'to') => (edge === side ? amount : answer);

  /** An amount with its currency's mark, on the side that currency writes it. */
  const write = (raw: number, code: FxCode) => {
    const currency = FX[code];
    const digits = formatFx(raw, currency, separator);
    return currency.before
      ? `${currency.symbol}${digits}`
      : `${digits} ${currency.symbol}`;
  };

  /*
   * Digits, one separator, nothing else. Filtering on the way in rather than
   * validating on the way out means the field can never hold something the
   * arithmetic above would turn into `NaN`.
   */
  const onType = (raw: string) => {
    setTyped(raw.replace(/[^\d.,]/g, '').replace(/[.,](?=.*[.,])/g, ''));
  };

  /**
   * Choosing a currency that is already on the other side swaps the two.
   *
   * The alternative is hiding it from the list, which is worse: the reader has
   * gone looking for euros, and a menu that silently does not contain them
   * reads as a missing currency rather than as a rule about the other field.
   */
  const choose = (side: 'from' | 'to', code: FxCode) => {
    if (side === 'from') {
      if (code === to) setTo(from);
      setFrom(code);
    } else {
      if (code === from) setFrom(to);
      setTo(code);
    }
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
    /* The amount stays put and the units move under it, which is what a swap
       button is read as. Carrying the converted figure across instead would
       answer a question nobody asked. */
  };

  const field = (side: 'from' | 'to') => {
    const code = side === 'from' ? from : to;
    const currency = FX[code];
    const mine = edge === side;
    const label = side === 'from' ? text.send : text.gets;

    return (
      <div className="fx-row" data-out={side === 'to' ? 'true' : undefined}>
        <span className="fx-lab">{label}</span>
        <div className="fx-line">
          {/* A label, so the well is the target rather than the digits. */}
          <label className="fx-amount" data-live={mine ? 'true' : undefined}>
            {currency.before && <i>{currency.symbol}</i>}
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              /* The typed side shows the raw string; the other shows the
                 answer, grouped and with its symbol left to the `<i>` beside
                 it so the two rows line up. */
              value={mine ? typed : formatFx(answer, currency, separator)}
              aria-label={label}
              onChange={(event) => {
                setEdge(side);
                onType(event.target.value);
              }}
              onFocus={(event) => {
                /* Typing into the answer flips the direction and seeds the
                   field with what it was showing, so the number does not
                   jump under the caret. */
                if (!mine) {
                  setEdge(side);
                  setTyped(plain(answer, currency.decimals));
                  /* …and selects it. What is in the field at that moment is a
                     figure this card worked out, not one anybody typed, so the
                     next keystroke should replace it rather than append to it.
                     Focusing the side you are *already* typing in does not
                     select, because there the digits are yours to edit. */
                  event.target.select();
                }
              }}
            />
            {!currency.before && <i>{currency.symbol}</i>}
          </label>

          <CurrencyPicker value={code} onPick={(next) => choose(side, next)} label={text.pick} />
        </div>
      </div>
    );
  };

  return (
    <div className="console fx-card">
      <div className="fx-quick">
        <span className="console-label">{text.saved}</span>
        <div className="fx-chips">
          {shortcuts.map(([a, b]) => (
            <button
              type="button"
              key={`${a}${b}`}
              className="fx-chip"
              data-on={a === from && b === to ? 'true' : undefined}
              onClick={() => {
                setFrom(a);
                setTo(b);
                /* Back to the left-hand side: a shortcut is read as "show me
                   this pair", and leaving the caret on the answer would show
                   it backwards. */
                setEdge('from');
              }}
            >
              <i className="fx-flag">{FX[a].flag}</i>
              {a} <Icon name="arrow" size={12} strokeWidth={2.4} /> {b}
              <i className="fx-flag">{FX[b].flag}</i>
            </button>
          ))}
        </div>
      </div>

      {field('from')}

      <button
        type="button"
        className="fx-swap"
        aria-label={text.swap}
        title={text.swap}
        onClick={swap}
      >
        <Icon name="arrow" size={16} strokeWidth={2.2} />
      </button>

      {field('to')}

      <p className="fx-total" aria-live="polite">
        {valid
          ? fill(text.result, { from: write(value('from'), from), to: write(value('to'), to) })
          : text.enter}
      </p>

      {/* Both directions, written out. "1 zł = 0.2328 €" is a sentence someone
          can check against the board in a kantor window; a lone decimal is not.
          The precision follows the magnitude — a soum priced to two decimals
          would read as zero. See `rateDecimals`. */}
      <div className="fx-foot">
        <span>{text.rate}</span>
        <b>
          {write(1, from)} = {formatRate(rate, separator)} {FX[to].code}
        </b>
        <b className="fx-inverse">
          {write(1, to)} = {formatRate(1 / rate, separator)} {FX[from].code}
        </b>
      </div>
    </div>
  );
}

/**
 * The shortcuts above the card — one tap sets both sides.
 *
 * The reader's own currency leads, paired with złoty (the market the guide is
 * written for) or with euros if they are already reading in złoty. The rest
 * come from `RELOCATE_PAIRS`, minus anything that would repeat the first.
 */
function useShortcuts(home: FxCode): Array<[FxCode, FxCode]> {
  return useMemo(() => {
    /* The key is direction-insensitive, because the card has a swap button:
       PLN→UAH and UAH→PLN are one shortcut reached two ways, and offering both
       spends two of only four slots saying the same thing. A plain `join` let
       the reversed pair through, and three of the five languages showed the
       duplicate — Polish got PLN→EUR beside EUR→PLN, Uzbek and Ukrainian the
       same trick with their own currency against złoty. */
    const key = (pair: [FxCode, FxCode]) => [...pair].sort().join('');

    const lead: [FxCode, FxCode] = [home, home === 'PLN' ? 'EUR' : 'PLN'];
    const seen = new Set([key(lead)]);
    const out: Array<[FxCode, FxCode]> = [lead];

    for (const pair of RELOCATE_PAIRS) {
      if (seen.has(key(pair))) continue;
      seen.add(key(pair));
      out.push(pair);
    }

    return out.slice(0, 4);
  }, [home]);
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

          <p className="business-trust" data-reveal>
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

/**
 * The converter, centred.
 *
 * It used to be the right-hand column of a split — copy on the left, card on
 * the right — which is the layout the rest of the site uses to *illustrate* a
 * paragraph. This one is not an illustration: it is the only thing on the page
 * a visitor can actually operate, and half a column on a laptop is a narrow
 * card carrying two amounts, two currency menus and a rate. So the section
 * reads top to bottom instead — heading, the card in the middle of the page at
 * a width its rows fit in, and the three points underneath it, where they are
 * a caption rather than a competing column.
 *
 * The card is keyed on the language. Both currencies are seeded from it, and
 * seeded state does not re-seed itself — without the key, switching to Ukrainian
 * would leave a card converting pounds.
 */
function RelocateRates() {
  const copy = useCopy();
  const [language] = useLanguage();

  return (
    <section className="section" id="relocate-rates">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{copy.relocate.rates.eyebrow}</span>
          <h2>{copy.relocate.rates.title}</h2>
          <p>{copy.relocate.rates.lede}</p>
        </div>

        <div className="fx-stage" data-reveal>
          <ExchangeCard key={language} />
        </div>

        <ul className="fx-points" data-reveal>
          {copy.relocate.rates.bullets.map((bullet) => (
            <li key={bullet.title}>
              <Icon name="check" size={15} strokeWidth={3} />
              <b>{bullet.title}</b>
              <span>{bullet.body}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────── guide ── */

/**
 * The nine subjects, and the providers behind each one.
 *
 * Three things changed here and they are one change: the rows **open**.
 *
 * - They were `<article>`s with a decorative chevron that went nowhere, on the
 *   argument that a marketing page cannot honour the click. It can now: each
 *   opens into the providers filed under it, which is the thing a reader came
 *   for. See `RELOCATE_PROVIDERS` — seed data, replaced by the real directory.
 * - **The city filter is a filter.** It was a static pill reading "All cities".
 *   It is a real control, it narrows every open list, and the options are
 *   derived from the providers so it can never offer a city with nothing in it.
 * - **The search pill is gone.** It duplicated the assistant two sections down,
 *   which is a real input against a fake one — and the fake one was above.
 *
 * Two subjects lead the list at double width rather than sitting in the nine-up
 * grid: see the `featured` note in `RELOCATE_TOPICS`.
 */
function RelocateGuide() {
  const copy = useCopy();
  const [open, setOpen] = useState<number | null>(null);
  /** `''` is every city — the filter's own first option. */
  const [city, setCity] = useState('');

  const guide = copy.relocate.guide;

  /* Grouped once rather than filtered per row: nine rows each scanning the
     whole table is nine passes for one answer. */
  const byTopic = useMemo(() => {
    const out = new Map<number, RelocateProvider[]>();
    for (const provider of RELOCATE_PROVIDERS) {
      if (city && provider.city !== city) continue;
      const group = out.get(provider.topic);
      if (group) group.push(provider);
      else out.set(provider.topic, [provider]);
    }
    return out;
  }, [city]);

  const order = RELOCATE_TOPICS.map((topic, i) => ({ topic, i })).sort(
    (a, b) => Number(Boolean(b.topic.featured)) - Number(Boolean(a.topic.featured)),
  );

  return (
    <section className="section" id="relocate-guide">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">{guide.eyebrow}</span>
          <h2>{guide.title}</h2>
          <p>{guide.lede}</p>
        </div>

        <div className="guide-bar" data-reveal>
          <label className="guide-city">
            <Icon name="map" size={14} />
            <span className="visually-hidden">{guide.city}</span>
            <select value={city} onChange={(event) => setCity(event.target.value)}>
              <option value="">{guide.cities}</option>
              {RELOCATE_CITIES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <span className="guide-count">
            {fill(guide.count, {
              n: String(
                city
                  ? RELOCATE_PROVIDERS.filter((p) => p.city === city).length
                  : RELOCATE_PROVIDERS.length,
              ),
            })}
          </span>
        </div>

        <div className="topics">
          {order.map(({ topic, i }) => {
            const item = guide.items[i];
            const providers = byTopic.get(i) ?? [];
            const isOpen = open === i;

            return (
              <article
                className="topic"
                key={item.name}
                data-featured={topic.featured ? 'true' : undefined}
                data-open={isOpen ? 'true' : undefined}
                data-reveal
              >
                <button
                  type="button"
                  className="topic-head"
                  aria-expanded={isOpen}
                  aria-controls={`topic-panel-${i}`}
                  onClick={() => setOpen(isOpen ? null : i)}
                >
                  <span className="topic-ico">
                    <Icon name={topic.icon} size={20} />
                  </span>
                  <span className="topic-tx">
                    <b>{item.name}</b>
                    <span>{item.blurb}</span>
                  </span>
                  <span className="topic-n">{providers.length}</span>
                  <Icon name="chevron" size={16} strokeWidth={2.2} className="topic-go" />
                </button>

                {/* Same `0fr → 1fr` grid collapse the FAQ uses: the provider
                    lists are different lengths in every language, so nothing
                    here may need a pixel height up front. */}
                <div className="topic-panel" id={`topic-panel-${i}`} role="region">
                  <div>
                    {providers.length === 0 ? (
                      <p className="topic-empty">
                        {city ? fill(guide.none, { city }) : guide.soon}
                      </p>
                    ) : (
                      /* No reach wiring on these rows. `RelocateProvider` has a
                         name, a topic, a city and its languages — and no id at
                         all, because it is the seed directory the real one
                         replaces. There is nothing to report an impression
                         *against*, and keying one on the name would attribute
                         a stranger's listing to whichever venue happened to be
                         called that. Wire this the day the guide reads
                         `GET /v1/venues`; see `api/reach.ts`. */
                      <ul className="topic-list">
                        {providers.map((provider) => (
                          <li key={provider.name}>
                            <b>{provider.name}</b>
                            <span className="topic-where">
                              <Icon name="map" size={13} />
                              {provider.city}
                            </span>
                            <span className="topic-langs">
                              {guide.speaks}{' '}
                              {provider.languages
                                .map(
                                  (code) =>
                                    copy.listing.spokenLanguages[
                                      SPOKEN_LANGUAGES.indexOf(code)
                                    ],
                                )
                                .join(' · ')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
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

        <p className="business-note" data-reveal>
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
 * The field is still a picture of one — a real input on a marketing page is a
 * promise to answer, and this page cannot keep it. What changed is that the
 * picture is now a **link**: it looks like somewhere to type, and a visitor who
 * taps it gets sign-in, which is where the assistant dock actually lives. As a
 * `<span>` it looked like somewhere to type and did nothing at all, which is
 * the same complaint as the converter's hairline-thin amount field — anything
 * shaped like a control has to be one.
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

        <a className="ask-box" href={PATHS.signin} data-reveal>
          <span className="ask-field">
            <Icon name="assistant" size={17} />
            {copy.relocate.ask.placeholder}
          </span>
          <span className="btn btn-solid ask-go">{copy.relocate.ask.action}</span>
        </a>

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
