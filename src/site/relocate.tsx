import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';

import {
  GUIDE_ICON_FALLBACK,
  GUIDE_ICONS,
  RELOCATE_AMOUNT,
  RELOCATE_COUNTRIES,
  RELOCATE_PAIRS,
  RELOCATE_STATS,
  openAssistant,
} from './content';
import {
  categoriesPath,
  servicesPath,
  type GuideCategory,
  type GuideService,
} from './api/guide';
import { useApi } from './api/useApi';
import { useRates } from './api/fx';
import { Icon } from './icons';
import { useCopy, useGroupSeparator, useLanguage } from './i18n/context';
import { fill } from './i18n/currency';
import {
  FX,
  FX_FOR_LANGUAGE,
  FX_ORDER,
  formatFx,
  formatRate,
  type FxCode,
} from './i18n/fx';
import { PATHS } from './router';
import { lineCap } from './heroLines';
import {
  addPair,
  hasPair,
  keyOf,
  readPairs,
  removePair,
  writePairs,
  type Pair,
} from './savedPairs';
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
 * pitch is specificity — the subjects the guide actually carries for the country
 * you pick, and a rate card that quotes the mid-market number rather than one
 * with a spread hidden in it. Both halves are the server's: `#relocate-guide`
 * reads `/v1/guide/*`, and the last invented list on this site went with it.
 *
 * The backdrop is `city/CityRise` — a city building itself around the reader,
 * which is this page's own subject rather than a picture beside it. The page had
 * the globe once, on the argument that it was about a border being crossed; it
 * is not — it is a guide to the place you have already arrived in. Two answers
 * stood in between and both are recorded in `CityRise`'s header. See the
 * backdrop note in CLAUDE.md.
 */

/* ───────────────────────────────────────────────────────── the exchange ── */

/**
 * How wide the amount field has to be, in `ch`, for what it is showing.
 *
 * This replaces `field-sizing: content`, which does the same job natively and
 * only on Chromium — see the note on `.fx-amount input` in `site.css`. Three
 * things make a hand-rolled version safe here rather than the usual guess:
 *
 * - The field is `tabular-nums`, so every **digit** is exactly `1ch` wide by
 *   definition. There is no measuring to do and nothing to be wrong about.
 * - A separator is not, so it counts as roughly half. Overshooting by a
 *   character on a grouped figure is the whole bug this is fixing, and `1,234`
 *   with two full-width separators is a character clear of where it belongs.
 * - The floor is 1.5 rather than the length of the placeholder, so an empty
 *   field still has somewhere to put a caret, and the caret at the end of a full
 *   one is inside the box rather than clipped against its edge — that is what
 *   the extra 0.6 is for.
 */
function sizeOf(shown: string): string {
  let width = 0.6;
  for (const character of shown) width += character >= '0' && character <= '9' ? 1 : 0.5;
  return `${Math.max(1.5, width)}ch`;
}

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
  const separator = useGroupSeparator();

  const home = FX_FOR_LANGUAGE[language];

  /**
   * The pairs this reader pinned, and the defaults under them.
   *
   * Two rows and two different things, which is the whole point: `shortcuts` is
   * the same four pairs for everybody who reads in this language, and `pinned`
   * is whatever this person actually checks. The row used to be labelled "Saved
   * pairs" and be neither — see the header of `savedPairs.ts` for what that
   * promise cost.
   *
   * Read lazily rather than in an effect, so the pins are on screen in the first
   * paint instead of appearing a frame later.
   */
  const [pinned, setPinned] = useState<Pair[]>(() => readPairs());
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

  /** Whether the pair on screen is one of the pinned ones. */
  const saved = hasPair(pinned, [from, to]);

  /** One unit of the left-hand currency in the right-hand one. */
  /*
   * The cross rate, from the live table where there is one.
   *
   * `rateOf` is per **code** and both sides are units per one euro, so this
   * division is exact for every one of the 342 ordered pairs — the
   * single-anchor rule `fx.ts` states. Overlaying a *pair* would break it: two
   * pairs derived from different snapshots do not agree with each other.
   *
   * `useRates` falls back to the built-in figure per code, so this line draws a
   * rate on the first paint, with no session, and when the server is
   * unreachable. What it must not do is render a spinner — a converter that
   * cannot show a number until a request lands is worse than one showing last
   * month's rate and saying so, which is what `.fx-age` below does.
   */
  const rates = useRates();
  const rate = rates.rateOf(to) / rates.rateOf(from);

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

  /**
   * Pin the pair on screen, or take it off again.
   *
   * One control for both, because the alternative is a save button that does
   * nothing the second time it is pressed and a separate way to undo it. The
   * store is written here rather than in an effect: this is the only thing that
   * changes the list, and an effect would also fire on the first render and
   * write back what it had just read.
   */
  const pin = () => {
    const pair: Pair = [from, to];
    const next = hasPair(pinned, pair) ? removePair(pinned, pair) : addPair(pinned, pair);
    setPinned(next);
    writePairs(next);
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
    /* The amount stays put and the units move under it, which is what a swap
       button is read as. Carrying the converted figure across instead would
       answer a question nobody asked. */
  };

  /* Both rows do the same thing, so they call the same thing. `edge` goes back
     to the left-hand side because a shortcut is read as "show me this pair", and
     leaving the caret on the answer would show it backwards. */
  const show = (pair: Pair) => {
    setFrom(pair[0]);
    setTo(pair[1]);
    setEdge('from');
  };

  const field = (side: 'from' | 'to') => {
    const code = side === 'from' ? from : to;
    const currency = FX[code];
    const mine = edge === side;
    const label = side === 'from' ? text.send : text.gets;
    /* The typed side shows the raw string; the other shows the answer, grouped.
       Computed once because the width is measured off the same string that is
       rendered — deriving it from `typed` on both sides would size the answer to
       the question. */
    const shown = mine ? typed : formatFx(answer, currency, separator);

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
              /* The symbol is left to the `<i>` beside it so the two rows line
                 up. */
              value={shown}
              style={{ width: sizeOf(shown) }}
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
        {/* The pinned row exists only when something is pinned. An empty
            "Saved pairs" heading over nothing is the same empty promise the
            label used to make when it sat over four defaults. */}
        {pinned.length > 0 && (
          <div className="fx-group">
            <span className="console-label">{text.saved}</span>
            <div className="fx-chips">
              {pinned.map((pair) => (
                <span className="fx-chip fx-chip-pin" key={keyOf(pair)}>
                  <button
                    type="button"
                    className="fx-chip-go"
                    data-on={pair[0] === from && pair[1] === to ? 'true' : undefined}
                    onClick={() => show(pair)}
                  >
                    <Pill pair={pair} />
                  </button>
                  {/* Its own button, not a second job for the chip: pressing a
                      shortcut and unpinning it are opposite intentions and must
                      not share a target. */}
                  <button
                    type="button"
                    className="fx-chip-off"
                    aria-label={fill(text.unpin, { pair: `${pair[0]} ${pair[1]}` })}
                    title={fill(text.unpin, { pair: `${pair[0]} ${pair[1]}` })}
                    onClick={() => {
                      const next = removePair(pinned, pair);
                      setPinned(next);
                      writePairs(next);
                    }}
                  >
                    <Icon name="close" size={12} strokeWidth={2.6} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="fx-group">
          <span className="console-label">{text.common}</span>
          <div className="fx-chips">
            {shortcuts.map(([a, b]) => (
              <button
                type="button"
                key={`${a}${b}`}
                className="fx-chip"
                data-on={a === from && b === to ? 'true' : undefined}
                onClick={() => show([a, b])}
              >
                <Pill pair={[a, b]} />
              </button>
            ))}
          </div>
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

      {/*
        The control the label above was promising.
        Sitting here rather than beside the chips because this is where the pair
        is *chosen* — the picker is two rows up, and a save button at the top of
        the card would be asking about something the reader has not decided yet.
      */}
      <button
        type="button"
        className="fx-pin"
        data-on={saved ? 'true' : undefined}
        aria-pressed={saved}
        onClick={pin}
      >
        <Icon name="star" size={14} strokeWidth={2.2} />
        {saved ? text.pinned : text.pin}
      </button>

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

/** A pair written out: flag, code, arrow, code, flag. Shared by both rows. */
function Pill({ pair }: { pair: Pair }) {
  return (
    <>
      <i className="fx-flag">{FX[pair[0]].flag}</i>
      {pair[0]} <Icon name="arrow" size={12} strokeWidth={2.4} /> {pair[1]}
      <i className="fx-flag">{FX[pair[1]].flag}</i>
    </>
  );
}

/**
 * The defaults above the card — one tap sets both sides.
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
    <section className="hero hero-mid" id="relocate-top">
      <div className="wrap hero-grid">
        {/*
          The way back, and it is a **grid child rather than a line in the
          stack**.

          Inside `.hero-copy` it was left-aligned to that column — which on a
          centred 46rem measure is about 350px in from the edge of a 1440
          screen, so "top left" was true of the copy and false of the page. Out
          here it takes `justify-self: start` against the wrap, which is the
          page's own gutter and is where a way out belongs.

          And it is the button kit rather than a text link: `.btn-ghost` is
          `--text` on `--surface` inside a real border, where `.learn-back`
          alone is `--text-mut` — the faintest thing on the sheet, on the one
          control that leaves the page. `.learn-back` stays on it for the
          mirrored arrow and the travel on hover.
        */}
        <a className="btn btn-ghost learn-back" href={PATHS.landing} data-reveal>
          <Icon name="arrow" size={15} strokeWidth={2.2} />
          {copy.relocate.back}
        </a>

        <div className="hero-copy">
          <span className="eyebrow learn-eyebrow" data-reveal>
            {copy.relocate.hero.eyebrow}
          </span>

          <h1 data-reveal style={lineCap(copy.relocate.hero.lines)}>
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

        {/* No reserved column. There was one, holding the space the globe
            rendered into — and this page has not had the globe since it got
            `CityRise`, which is full-bleed. Keeping the column meant a hero
            written into the left half of an empty screen; `hero-mid` centres
            what is actually here. */}
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
/**
 * When the rates were last synced, in one line under the card.
 *
 * Its own component rather than a line inside `ExchangeCard` because the card
 * is keyed on the language and remounts when it changes — which would re-issue
 * this request for no reason — and because what it says is about the *table*
 * rather than about the pair being converted.
 *
 * It renders **nothing** while the request is in flight. A converter that says
 * "checking how old its numbers are" is drawing attention to the one thing
 * nobody asked about; the answer is worth a line and the wait is not.
 */
function RatesAge() {
  const text = useCopy().relocate.rates;
  const [language] = useLanguage();
  const rates = useRates();

  const when = useMemo(() => {
    if (!rates.updatedAt) return null;
    const parsed = Date.parse(rates.updatedAt);
    if (!Number.isFinite(parsed)) return null;
    try {
      /* The reader's own locale, from the platform. Five dictionaries carrying
         a date format each is the thing `Intl` exists to make unnecessary —
         the same side `untilNextEnergy` and the streak row's weekday names
         take. */
      return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(parsed);
    } catch {
      return rates.updatedAt.slice(0, 10);
    }
  }, [rates.updatedAt, language]);

  if (!rates.live) {
    /* No server, or a server with no rates in it. The built-in table is on
       screen and saying so is the honest version of a missing timestamp —
       "last updated: never" would read as a fault rather than as a state. */
    return (
      <p className="fx-age" data-reveal>
        {text.builtIn}
      </p>
    );
  }

  if (when === null) return null;

  return (
    <p className="fx-age" data-state={rates.stale ? 'stale' : undefined} data-reveal>
      {fill(rates.stale ? text.stale : text.updated, { when })}
    </p>
  );
}

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

        {/*
          How old the numbers are.

          This card quotes a market rate and the one thing a reader cannot see
          about a market rate is **when it was taken**. The rates used to be a
          table compiled into the bundle, refreshed whenever somebody edited a
          TypeScript file, and the card said nothing at all about it — which
          reads as "this is current" and was not.

          Three states, because there are three: synced (say when), synced and
          old (say when, and that nothing has refreshed it), and not synced at
          all (say that the built-in table is what is on screen). The third is
          the ordinary state with no server, and it is the one a
          "last updated: never" would render as a fault.
        */}
        <RatesAge />

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

/*
 * Frozen singletons, not `[]` at the point of use.
 *
 * Both feed a `useMemo` dependency list, and a fresh literal every render is a
 * new identity every render — which recomputes the grouping over three hundred
 * services on every keystroke elsewhere on the page, and defeats the memo
 * entirely.
 */
const EMPTY_SERVICES: readonly GuideService[] = [];
const EMPTY_CATEGORIES: readonly GuideCategory[] = [];

/**
 * The country's name in the reader's language, from the platform rather than
 * from a dictionary.
 *
 * Fourteen countries in five languages is seventy strings that say nothing this
 * product knows and the browser does not — and the fifteenth country would need
 * five more. `Intl.DisplayNames` is the same table `Intl` already uses for the
 * currency names two sections up. Older engines without it fall back to the ISO
 * code, which is what the strip beside `relocate.countries` shows anyway.
 */
function countryNamer(language: string): (code: string) => string {
  try {
    const names = new Intl.DisplayNames([language], { type: 'region' });
    return (code) => names.of(code) ?? code;
  } catch {
    return (code) => code;
  }
}

/**
 * The subjects, and the real places filed under each one.
 *
 * **This section used to be the last seed directory on the site.** Nine
 * hard-coded topics, nine names and blurbs in each of five dictionaries, and
 * twenty-four invented businesses underneath — a "Wisła Bank — Newcomer Desk"
 * that does not exist, on the one page in this product whose promise is that it
 * will tell somebody three weeks into a new country where to actually go. Two of
 * the twenty-four were real businesses that had never heard of us. It reads
 * `GET /v1/guide/categories` and `GET /v1/guide/services` now — the imported
 * rows of the old database — and `api/guide.ts` says what that cost and bought.
 *
 * Four consequences worth knowing before editing this:
 *
 * - **The subject list is the server's, so nothing here may say "nine".** The
 *   count is whatever the country has; the heading and the lede were rewritten
 *   in all five languages to stop claiming a number this file no longer owns.
 * - **The country picker is new and it is upstream of everything.** The guide is
 *   written per country — that is what `relocate.countries` two sections down
 *   has always claimed — so the country chooses the subjects *and* the places,
 *   and the city filter narrows what came back.
 * - **The cities are derived from the answer, never declared.** A filter
 *   offering a city with nothing in it is a control that silently returns
 *   nothing, and the old array could drift from the rows the moment either was
 *   edited. Now it cannot.
 * - **Three states, and "none" is not "could not ask".** `useApi`'s union, for
 *   the reason the console states at length: after the seed purge an empty guide
 *   is the *ordinary* answer for most countries, and a reader told "nothing here
 *   yet" when the server is down has been told something false.
 */
function RelocateGuide() {
  const copy = useCopy();
  const [language] = useLanguage();
  const [open, setOpen] = useState<string | null>(null);
  /* The place whose panel is up. The row itself rather than an id: the list is
     already in hand, and holding an id means re-finding it on every render and
     deciding what a panel open on a row that vanished under a filter change
     should do. Holding the row, it simply stays until it is closed. */
  const [detail, setDetail] = useState<GuideService | null>(null);
  /** `''` is every city — the filter's own first option. */
  const [city, setCity] = useState('');
  const [country, setCountry] = useState(RELOCATE_COUNTRIES[0].code);

  const guide = copy.relocate.guide;

  /* Named and sorted in the reader's language: an alphabetical list of country
     names is only alphabetical in the language it was sorted in. */
  const countryOptions = useMemo(() => {
    const name = countryNamer(language);
    return RELOCATE_COUNTRIES.map((entry) => ({ code: entry.code, name: name(entry.code) })).sort(
      (a, b) => a.name.localeCompare(b.name, language),
    );
  }, [language]);

  /* Two reads rather than one: the subjects have to render — with their counts
     — before anybody opens one, so there is no version of this where the places
     can wait for a press. Both are keyed on the country and on the reader's
     language, which is what re-fetches translated copy when the header's
     switcher moves. */
  const cats = useApi<GuideCategory[]>(categoriesPath(country), [country], { language });
  const svcs = useApi<GuideService[]>(servicesPath(country), [country], { language });

  const rows = svcs.state.status === 'ready' ? svcs.state.data : EMPTY_SERVICES;

  /* Derived, never declared — see the note above. Sorted by the reader's own
     collation, because these are Polish and Uzbek city names and `<` is not a
     sort order for either. */
  const cities = useMemo(
    () =>
      [
        ...new Set(rows.map((row) => row.city).filter((name): name is string => Boolean(name))),
      ].sort((a, b) => a.localeCompare(b, language)),
    [rows, language],
  );

  /* Grouped once rather than filtered per row: a dozen subjects each scanning
     three hundred services is a dozen passes for one answer. */
  const byCategory = useMemo(() => {
    const out = new Map<string, GuideService[]>();
    for (const row of rows) {
      if (city && row.city !== city) continue;
      if (!row.category_key) continue;
      const group = out.get(row.category_key);
      if (group) group.push(row);
      else out.set(row.category_key, [row]);
    }
    return out;
  }, [rows, city]);

  /* A city that vanished under a country change would otherwise leave the
     filter set to somewhere with nothing in it, and every subject empty with no
     visible reason why. */
  useEffect(() => {
    if (city && !cities.includes(city)) setCity('');
  }, [cities, city]);

  const listed = city ? rows.filter((row) => row.city === city).length : rows.length;
  const loading = cats.state.status === 'loading' || svcs.state.status === 'loading';
  const failed = cats.state.status === 'error' || svcs.state.status === 'error';
  const subjects = cats.state.status === 'ready' ? cats.state.data : EMPTY_CATEGORIES;

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
            <i aria-hidden="true">
              {RELOCATE_COUNTRIES.find((entry) => entry.code === country)?.flag}
            </i>
            <span className="visually-hidden">{guide.country}</span>
            <select value={country} onChange={(event) => setCountry(event.target.value)}>
              {countryOptions.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>

          {/* Only once there is something to narrow. A filter over an answer
              with one city in it is a control that cannot change anything. */}
          {cities.length > 1 && (
            <label className="guide-city">
              <Icon name="map" size={14} />
              <span className="visually-hidden">{guide.city}</span>
              <select value={city} onChange={(event) => setCity(event.target.value)}>
                <option value="">{guide.cities}</option>
                {cities.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* An em dash while it is unknown, never a 0 — the console's rule, and
              this page has the same reason for it. */}
          <span className="guide-count">
            {fill(guide.count, { n: loading || failed ? '—' : String(listed) })}
          </span>
        </div>

        {failed ? (
          <p className="guide-state" data-reveal>
            {guide.failed}
          </p>
        ) : loading ? (
          <p className="guide-state" data-reveal>
            {guide.loading}
          </p>
        ) : subjects.length === 0 ? (
          <p className="guide-state" data-reveal>
            {guide.empty}
          </p>
        ) : (
          <div className="topics">
            {subjects.map((subject, index) => {
              const places = byCategory.get(subject.key) ?? EMPTY_SERVICES;
              const isOpen = open === subject.key;

              return (
                <article
                  className="topic"
                  key={subject.id}
                  /* The first two, at double width. The emphasis is the
                     server's `position` rather than a list of keys here: the
                     app already orders housing and paperwork first because that
                     is what a first month is about, and reading the order we
                     were given beats keeping a second opinion about it in the
                     front end. */
                  data-featured={index < 2 ? 'true' : undefined}
                  data-open={isOpen ? 'true' : undefined}
                  data-reveal
                >
                  <button
                    type="button"
                    className="topic-head"
                    aria-expanded={isOpen}
                    aria-controls={`topic-panel-${subject.key}`}
                    onClick={() => setOpen(isOpen ? null : subject.key)}
                  >
                    <span className="topic-ico">
                      <Icon name={GUIDE_ICONS[subject.key] ?? GUIDE_ICON_FALLBACK} size={20} />
                    </span>
                    <span className="topic-tx">
                      {/* Translated by the server, with English filling any
                          hole. A category with neither is drawn under its key
                          rather than blank — an untranslated row is still a row
                          somebody can open. */}
                      <b>{subject.title ?? subject.key}</b>
                      {subject.description && <span>{subject.description}</span>}
                    </span>
                    <span className="topic-n">{places.length}</span>
                    <Icon name="chevron" size={16} strokeWidth={2.2} className="topic-go" />
                  </button>

                  {/* Same `0fr → 1fr` grid collapse the FAQ uses: the lists are
                      different lengths in every language, so nothing here may
                      need a pixel height up front. */}
                  <div className="topic-panel" id={`topic-panel-${subject.key}`} role="region">
                    <div>
                      {places.length === 0 ? (
                        <p className="topic-empty">
                          {city ? fill(guide.none, { city }) : guide.soon}
                        </p>
                      ) : (
                        /* No reach wiring on these rows yet. `service_events` is
                           what `venues.trackListing` writes and it is keyed on a
                           *venue*, which only the promoted listings have —
                           reporting an impression against the rest would file it
                           under nobody. See `api/reach.ts`. */
                        <div className="gs-grid">
                          {places.map((place) => (
                            <GuideCard
                              key={place.id}
                              place={place}
                              onOpen={() => setDetail(place)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {detail && <GuideDetail place={detail} onClose={() => setDetail(null)} />}
    </section>
  );
}

/* ─────────────────────────────────────────────────────── one place, listed ── */

/**
 * The place's logo, or its initial.
 *
 * ## Why there was no image here, and what changed
 *
 * `guidance_services.image_url` is an external address — every one of them an
 * `https://base44.app/…` — and nothing in `src/` makes a third-party runtime
 * request; the whole front end is built that way, fonts and map geometry
 * included. So this drew the first letter of the name, which is a real piece of
 * the row rather than a grey rectangle standing in for one, and the logos the
 * old database holds were invisible. That is the whole of "the service logos do
 * not display".
 *
 * The rule has not been relaxed. The **server** fetches the image now and
 * serves it from `/v1/media/service/:id` (`domain/media.ts`), so `place.logo`
 * is a path on our own origin and the request this `<img>` makes is
 * first-party. What the browser never gets is a URL pointing at somebody
 * else's host.
 *
 * ## The fallback is not a placeholder, it is the old mark
 *
 * A dead source host, a refused media type, a source that was a PDF — all of
 * them are a 404 from that path, and all of them are **normal**. So the initial
 * is still what a card shows whenever there is no image to show, and `onError`
 * is what makes that true for the case the server could not know about in
 * advance: an image that 404s or fails to decode *after* the page has committed
 * to drawing one. Without it, a broken source renders the browser's own
 * broken-image glyph, which is the one outcome worse than no logo.
 *
 * `useState` keyed on the src rather than a ref, because the element is reused
 * across rows as the list filters: a failure remembered past the row it
 * happened on would hide a perfectly good logo on the next one.
 *
 * `codePointAt`-style spreading rather than `[0]`, because a name beginning
 * with an emoji or any astral character would otherwise be cut in half and
 * render as a replacement glyph.
 */
function GuideMark({ name, logo }: { name: string; logo?: string | null }) {
  const [failed, setFailed] = useState<string | null>(null);
  const first = [...name.trim()][0] ?? '?';
  const src = logo && logo !== failed ? logo : null;

  if (src) {
    return (
      <span className="gs-mark gs-mark-img">
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(src)} />
      </span>
    );
  }
  return (
    <span className="gs-mark" aria-hidden="true">
      {first.toLocaleUpperCase()}
    </span>
  );
}

/**
 * A rating, or nothing at all.
 *
 * `rating` is `null` where nobody has rated the place, and that is a different
 * finding from a rating of zero — the same distinction the console draws with
 * an em dash and `measured`. A card with no stars says "we do not know"; a card
 * showing 0.0 would be saying the place is bad.
 */
function GuideStars({ place }: { place: GuideService }) {
  const guide = useCopy().relocate.guide;
  const [language] = useLanguage();
  if (place.rating === null) return null;

  return (
    <span className="gs-rating">
      <Icon name="star" size={13} />
      <b>{place.rating.toLocaleString(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</b>
      {place.review_count > 0 && (
        <span>{fill(guide.reviews, { n: place.review_count.toLocaleString(language) })}</span>
      )}
    </span>
  );
}

/**
 * One place, as a card you can press.
 *
 * **The whole card is the button**, which is the rule the Play screen's game
 * grid states: a card with a "details" link in the corner has a target the size
 * of two words inside a target the size of a card, and the reader has to find
 * the small one. Here it was worse than that — the rows were `<li>`s with no
 * affordance at all, so the address and the blurb were the entire listing and
 * everything else the server sends (the rating, the price band, the
 * subcategories, whether it takes vouchers) had nowhere to go.
 *
 * The links are **outside** the card for that reason: a `tel:` inside a
 * `<button>` is a control inside a control, which is invalid and which browsers
 * resolve by guessing. They sit under it, where a press on the number dials and
 * a press on anything else opens the panel.
 */
function GuideCard({ place, onOpen }: { place: GuideService; onOpen: () => void }) {
  const guide = useCopy().relocate.guide;

  return (
    <div className="gs-card">
      <button type="button" className="gs-hit" onClick={onOpen}>
        <GuideMark name={place.name} logo={place.logo} />
        <span className="gs-tx">
          <b className="gs-name">{place.name}</b>
          <span className="gs-meta">
            <GuideStars place={place} />
            {/* Verbatim, in the venue's own currency — see `price_range` in
                `api/guide.ts` for why this one figure does not go through
                `useMoney` like every other price on the site. */}
            {place.price_range && <span className="gs-price">{place.price_range}</span>}
          </span>
          {place.city && (
            <span className="gs-where">
              <Icon name="map" size={12} />
              {place.city}
            </span>
          )}
        </span>
        <span className="gs-flags">
          {place.venueId !== null && <span className="gs-tag">{guide.onPaylez}</span>}
          {place.acceptsVouchers && (
            <span className="gs-tag gs-tag-vouchers" title={guide.takesVouchers}>
              <Icon name="ticket" size={13} />
              <span className="visually-hidden">{guide.takesVouchers}</span>
            </span>
          )}
        </span>
      </button>
      <GuideLinks place={place} />
    </div>
  );
}

/* ───────────────────────────────────────────────────── one place, opened ── */

/**
 * Everything the row actually carries.
 *
 * The panel is the answer to "what else do we know about this place", so the
 * rule that governs it is which blocks are **absent**. Every one of them is
 * conditional on its own field: no description, no About; no `price_range`, no
 * Pricing; no phone, no email, no address and no links, no Contact. A heading
 * over an em dash is a promise that the row holds something it does not, and
 * this directory has already been fictional once.
 *
 * Two things the mock has that are deliberately not here. There is no
 * **Translate** control: the server already returns this copy in the reader's
 * language with English filling any hole (`copyOf` in `routes/guidance.ts`), so
 * the button would either do nothing or claim a second translation nothing
 * performs. And the photograph is the place's **logo**, drawn from our own
 * origin and falling back to the initial — see `GuideMark`, which carries the
 * whole reason there was no image here for so long.
 *
 * It is modal, unlike the assistant dock, and for the opposite reason. The dock
 * is a thing you consult *while* reading the page; this is the page's own row,
 * opened. Escape and the scrim both close it, and focus goes back to the card
 * that opened it rather than to the top of the document.
 */
function GuideDetail({ place, onClose }: { place: GuideService; onClose: () => void }) {
  const guide = useCopy().relocate.guide;
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const site = place.links.find((link) => link.kind === 'website')?.value;
  const hasContact = Boolean(place.phone || place.email || place.address || site);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();

    /* The page behind must not scroll under an open panel — on a phone the
       panel is most of the screen and a scroll gesture that moved the list
       instead reads as the panel being stuck. Restored on the way out rather
       than cleared, so a page that was already locked by something else stays
       locked. */
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="gs-scrim" onClick={onClose}>
      <div
        ref={panelRef}
        className="gs-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        /* The panel is inside the scrim so a press outside it closes; the press
           must not travel back up from inside the panel itself. */
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="gs-close" onClick={onClose} aria-label={guide.close}>
          <Icon name="close" size={16} strokeWidth={2.2} />
        </button>

        <div className="gs-panel-head">
          <GuideMark name={place.name} logo={place.logo} />
          <div>
            <h3 id={titleId}>{place.name}</h3>
            <div className="gs-meta">
              <GuideStars place={place} />
              {place.venueId !== null && <span className="gs-tag">{guide.onPaylez}</span>}
            </div>
          </div>
        </div>

        {place.subcategories.length > 0 && (
          <div className="chips gs-subs">
            {place.subcategories.map((sub) => (
              <span className="chip" key={sub}>
                {sub}
              </span>
            ))}
          </div>
        )}

        {place.description && (
          <section className="gs-block">
            <h4>{guide.about}</h4>
            <p>{place.description}</p>
          </section>
        )}

        {place.price_range && (
          <section className="gs-block">
            <h4>{guide.pricing}</h4>
            <p className="gs-price-big">{place.price_range}</p>
          </section>
        )}

        {hasContact && (
          <section className="gs-block">
            <h4>{guide.contact}</h4>
            <ul className="gs-contact">
              {place.address && (
                <li>
                  <Icon name="map" size={14} />
                  <span>{place.city ? `${place.address}, ${place.city}` : place.address}</span>
                </li>
              )}
              {place.phone && (
                <li>
                  <Icon name="phone" size={14} />
                  <a href={`tel:${place.phone.replace(/\s+/g, '')}`}>{place.phone}</a>
                </li>
              )}
              {place.email && (
                <li>
                  <Icon name="send" size={14} />
                  <a href={`mailto:${place.email}`}>{place.email}</a>
                </li>
              )}
              {site && (
                <li>
                  <Icon name="link" size={14} />
                  <a href={site} target="_blank" rel="noreferrer noopener">
                    {guide.visit}
                  </a>
                </li>
              )}
            </ul>
          </section>
        )}

        {/* Last, because it is the one line that is about us rather than about
            them, and because it is only true for some rows. */}
        {place.acceptsVouchers && (
          <p className="gs-vouchers">
            <Icon name="ticket" size={14} />
            {guide.takesVouchers}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The two ways to reach a place, and only the two we can label.
 *
 * `guidance_service_links.kind` is free text out of the export — `website`,
 * `instagram`, `menu`, whatever an editor typed — and printing a kind we have no
 * word for would put untranslated server text on a marketing page that ships in
 * five languages. The phone is a column rather than a link row, so it is always
 * safe; a website is the one kind worth a dictionary entry. Anything else is
 * dropped rather than guessed at, which is why this is a component and not two
 * lines inline: the rule wants somewhere to be written down.
 */
function GuideLinks({ place }: { place: GuideService }) {
  const guide = useCopy().relocate.guide;
  const site = place.links.find((link) => link.kind === 'website')?.value;

  if (!place.phone && !site) return null;

  return (
    <span className="topic-links">
      {place.phone && (
        <a href={`tel:${place.phone.replace(/\s+/g, '')}`}>
          <Icon name="send" size={12} />
          {place.phone}
        </a>
      )}
      {site && (
        <a href={site} target="_blank" rel="noreferrer noopener">
          <Icon name="chevron" size={12} />
          {guide.visit}
        </a>
      )}
    </span>
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
/**
 * Where the guide is written, as a strip of chips.
 *
 * The chips held the **ISO code** — "PL", "DE", "UZ" — beside the flag, and
 * fourteen of those is a row of luggage tags: a reader who does not already
 * know the two letters is being asked to decode the one thing this section
 * exists to say. `countryNamer` is already in this file for the guide's own
 * picker and it is `Intl.DisplayNames`, so the name arrives translated for all
 * five languages without a dictionary entry per country — which is the only
 * reason this is a one-line change rather than seventy strings.
 *
 * The flag stays. It is the faster read of the two and it is the thing the eye
 * finds; the name is what makes it legible to somebody who is not sure whether
 * that one was Austria or Australia.
 *
 * Memoised on the language because `Intl.DisplayNames` builds a table, and this
 * component re-renders on every reveal scan the page does.
 */
function RelocateCountries() {
  const copy = useCopy();
  const [language] = useLanguage();
  const nameOf = useMemo(() => countryNamer(language), [language]);

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
              {nameOf(country.code)}
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
 * The assistant, as the escape hatch from a fixed list of subjects.
 *
 * The field is still a picture of one — a real input here would be a second
 * composer to keep in step with the dock's. What it does has changed twice. As
 * a `<span>` it looked like somewhere to type and did nothing at all; as an
 * `<a>` to sign-in it was at least honest, and it sent a visitor to a password
 * form to answer a question about tram tickets. It **opens the dock** now,
 * which is where the assistant lives and which draws its own signed-out pitch,
 * so a visitor sees the thing before being asked to join it.
 *
 * The suggestions are the better half of the change. They were four sentences
 * wearing the dock's chip styling, and the dock's chips ask what they say —
 * these did nothing. Each one now opens the panel **with its question already
 * asked**, which is what a suggested question is for; making them links would
 * have fixed "not clickable" and kept the part that was actually wrong.
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

        <button
          type="button"
          className="ask-box"
          onClick={() => openAssistant()}
          data-reveal
        >
          <span className="ask-field">
            <Icon name="assistant" size={17} />
            {copy.relocate.ask.placeholder}
          </span>
          <span className="btn btn-solid ask-go">{copy.relocate.ask.action}</span>
        </button>

        <div className="chips ask-chips" data-reveal>
          {copy.relocate.ask.samples.map((sample, i) => (
            <button
              type="button"
              className="chip"
              key={sample}
              onClick={() => openAssistant(sample)}
              style={{ '--i': i } as CSSProperties}
            >
              {sample}
            </button>
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
