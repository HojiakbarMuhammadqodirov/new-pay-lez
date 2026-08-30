/**
 * Structure only — no copy.
 *
 * Everything a translator would never touch (icon names, anchors, the numbers
 * behind the count-up stats) lives here; every string lives in `i18n/`. The
 * arrays are index-aligned with their dictionary counterparts, so adding a
 * service or a feature means adding one entry in each place and the compiler
 * catches the half-done version.
 */

import type {
  BusinessCategory,
  BusinessCountry,
  SpokenLanguage,
} from './auth/business';
import type { IconName } from './icons';
import type { Currency } from './i18n/currency';
import { FX, type FxCode } from './i18n/fx';
import { PATHS } from './router';

/**
 * The header's items, keyed rather than indexed.
 *
 * They used to be an array index-aligned with `copy.nav`, which worked while
 * every visitor saw the same six in the same order. A business owner now sees a
 * different set *in a different order* (Business first, Home fourth, no
 * Relocate), and index alignment cannot survive that — the first reordering
 * would have captioned Business "Vouchers". Keys cost one lookup and cannot
 * shear.
 *
 * Assistant is deliberately absent: it is the floating dock, not a nav item.
 */
export type NavKey =
  | 'home'
  | 'learn'
  | 'analytics'
  | 'business'
  | 'wallet'
  | 'contact'
  | 'relocate';

/**
 * Every label `copy.nav` can be asked for — the destinations, plus the handful
 * of alternate words a destination goes by for some readers. Wider than
 * `NavKey` on purpose: `games` is a *label*, not a place, and giving it an
 * `NAV_HREFS` entry would invent a route that does not exist.
 */
export type NavLabelKey = NavKey | 'games';

export const NAV_HREFS: Record<NavKey, string> = {
  home: PATHS.landing,
  learn: PATHS.learn,
  analytics: PATHS.analytics,
  business: PATHS.business,
  /* "Wallet" in the header, `#/vouchers` in the address bar. The page is the
     same one; the word a visitor reads is what changed. */
  wallet: PATHS.vouchers,
  contact: PATHS.contact,
  relocate: PATHS.relocate,
};

/**
 * What a visitor and a signed-in player see.
 *
 * **No Analytics.** It used to be here on the argument that the reporting was
 * part of the pitch, and it read as a public page about numbers nobody outside
 * a venue has. It is a venue owner's tool and now appears only in
 * `NAV_ORDER_BUSINESS`; `resolveRoute` refuses the route to everyone else, so
 * the address bar cannot get anybody there either.
 */
export const NAV_ORDER: NavKey[] = [
  'home',
  'learn',
  'business',
  'wallet',
  'contact',
  'relocate',
];

/**
 * What a signed-in venue owner sees.
 *
 * Their own tools first and the consumer site last, which is the order they use
 * it in — an owner opens the header to reach Business and Analytics, not to
 * browse. Relocate is absent rather than reordered: it is a guide for someone
 * who has just moved country, and an operator running a Kraków café is not that
 * reader.
 */
export const NAV_ORDER_BUSINESS: NavKey[] = [
  'business',
  'analytics',
  'learn',
  'home',
  'wallet',
  'contact',
];

/** An individual has no business with the page that sells to a venue. Analytics
 *  is no longer listed here because it is no longer in `NAV_ORDER` at all. */
export const NAV_HIDDEN_INDIVIDUAL: NavKey[] = ['business'];

/**
 * Labels that change with who is reading, keyed by account type.
 *
 * `copy.nav` is one label per destination, which is right for six of the seven:
 * Contact is Contact to everybody. L-Earn is the exception — to a visitor it is
 * the *pitch* for the games, and to a signed-in owner it is the games. An owner
 * evaluating the product does not need it sold to them, so they get the plain
 * noun. The route is identical; only the word changes.
 */
export const NAV_LABEL_BUSINESS: Partial<Record<NavKey, NavLabelKey>> = {
  learn: 'games',
};

export const HERO_STATS = [
  { value: 100, suffix: ' pts' },
  { value: 500, suffix: '+' },
  { value: 12, suffix: '+' },
];

/** Brand names are never translated. */
export const PARTNERS = [
  'Media Expert',
  'Douglas',
  'Zalando',
  'Empik',
  'Rossmann',
  'Allegro',
  'Decathlon',
];

export const SERVICE_ICONS: IconName[] = [
  'bakery',
  'coffee',
  'shopping',
  'restaurant',
  'halal',
  'leisure',
  'beauty',
  'housing',
];

export const FEATURE_META: Array<{
  icon: IconName;
  stat?: { value: number; suffix: string };
}> = [
  { icon: 'trophy', stat: { value: 100, suffix: ' pts' } },
  { icon: 'gift' },
  { icon: 'card' },
  { icon: 'qr' },
  { icon: 'assistant' },
];

/**
 * The voucher catalogue — the shelf every card on the site is taken off.
 *
 * It sits up here rather than down in the Vouchers block it used to live in
 * because four other things are now derived from it, and a shelf has to be
 * declared before the things that read from it: the value card on Home, the
 * figure the L-Earn FAQ quotes, the wallet mock's own voucher, and the two
 * Vouchers hero stats. Each of those used to carry its own copy of a price, and
 * they disagreed — the same Zalando card was one figure in the wallet, another
 * behind the FAQ's "50 zł", and a third wherever `(points / 100) * 4.65` was
 * being computed at a call site.
 *
 * `eur` is the face value **in euros**, like every other amount in this file;
 * `useMoney` converts on the way out. The zloty figures the copy was written
 * against are the round ones — 50 zł, 250 zł, 150 zł — and these are those in
 * the base unit, which is why they are not round here.
 */
export const VOUCHER_CARDS: Array<{
  brand: string;
  logo: string;
  points: number;
  eur: number;
  left: number;
  of: number;
}> = [
  { brand: 'Media Expert', logo: 'M', points: 100, eur: 11.63, left: 10, of: 10 },
  { brand: 'Zalando', logo: 'Z', points: 500, eur: 58.15, left: 6, of: 10 },
  { brand: 'Douglas', logo: 'D', points: 300, eur: 34.89, left: 8, of: 10 },
  { brand: 'Allegro', logo: 'A', points: 500, eur: 58.15, left: 3, of: 10 },
  { brand: 'Biedronka', logo: 'B', points: 100, eur: 11.63, left: 10, of: 10 },
  { brand: 'Bolt', logo: 'B', points: 200, eur: 23.26, left: 7, of: 10 },
  { brand: 'FlixBus', logo: 'F', points: 400, eur: 46.52, left: 5, of: 10 },
  { brand: 'Hebe', logo: 'H', points: 100, eur: 11.63, left: 9, of: 10 },
];

/**
 * One row off the shelf, by brand.
 *
 * Throws rather than returning `undefined`: every caller here names a brand
 * that is written three lines up, so a miss is a typo at build-out time and not
 * a state to render. A `?.eur` at the call site would put `undefined` into a
 * price tag instead.
 */
export function voucherCard(brand: string) {
  const card = VOUCHER_CARDS.find((row) => row.brand === brand);
  if (!card) throw new Error(`no voucher card for ${brand}`);
  return card;
}

/** The cheapest thing on the shelf — what "enough points" means. */
const CHEAPEST_VOUCHER_CARD = VOUCHER_CARDS.reduce((low, row) =>
  row.points < low.points ? row : low,
);

/**
 * What the cheapest voucher costs, and what it is worth.
 *
 * Derived rather than restated, because three separate places quote them: the
 * L-Earn hero's third stat, the Vouchers hero's second, and the wallet's "you
 * are N points short". `auth/player.ts` re-exports the points figure under the
 * name a balance asks the question in.
 */
export const CHEAPEST_VOUCHER_POINTS = CHEAPEST_VOUCHER_CARD.points;

/**
 * The gift card the L-Earn FAQ quotes, in euros like every other amount here.
 *
 * The answer was written against 50 zł — what a Polish reader sees — and it is
 * the cheapest card on the shelf that costs that. Read off the shelf rather
 * than typed as `11.63`, which was the version before this one and drifted the
 * first time a price moved: the FAQ went on quoting 50 zł for a card the
 * catalogue two pages over had repriced.
 */
export const LEARN_VOUCHER_EUR = CHEAPEST_VOUCHER_CARD.eur;

/** The card on Home's value section. Its face value comes off the shelf. */
export const VALUE_CARD = { brand: 'zalando', logo: 'Z', eur: voucherCard('Zalando').eur };

/* ─────────────────────────────────────────────────────── subscription ── */

/*
 * The consumer plans, and the four commitments the paid ones are sold on.
 *
 * Mirrored from the backend rather than composed for the page: `PLANS` in
 * `server/domain/settings.ts` seeds Free / Pro / Premium with exactly these
 * entitlements, and `TERM_LADDER` in `server/domain/entitlements.ts` sells the
 * two paid tiers on exactly these four rungs at exactly these discounts. A
 * marketing section promising a perk the entitlement table does not grant is
 * the same class of failure as a hardcoded price: it reads fine right up until
 * somebody pays for it.
 *
 * **There is no trial on any plan**, and that is a decision rather than an
 * omission — `trialDays` is 0 on every seeded row, and `settleWithdrawnTrials`
 * exists in that file to clear the subscriptions an earlier seed left sitting
 * in `trialing`. Nothing here may print one back onto the page.
 */

/**
 * What the backend charges per month, in złoty.
 *
 * The server prices in PLN (`plans.currency` is `'PLN'` on every row) and this
 * site holds every amount in euros, so one of the two has to be converted — and
 * it is this one, at the rate the whole building shares. Converting *here*
 * rather than typing a euro figure is what pins the Polish column to the price
 * a Polish customer is actually charged: 19.99 zł stays 19.99 zł across a
 * rate-sheet update, because the euro amount is derived from it rather than the
 * other way round. Every other language is then a conversion of a real price
 * instead of a conversion of a rounding of one.
 */
const SUB_PLN_PER_MONTH = { pro: 19.99, premium: 39.99 };

/** Złoty to the unit everything in this file is written in. */
const eurFromPln = (pln: number): number => pln / FX.PLN.rate;

/** Index-aligned with `copy.subscription.plans`, in the server's `rank` order. */
export const SUB_PLANS: Array<{
  id: 'free' | 'pro' | 'premium';
  /** Monthly list price in euros. Zero on the plan that is not sold. */
  eur: number;
  /**
   * Whether the plan is also sold on the commitment ladder.
   *
   * A property of the plan rather than a rule, exactly as it is on the server:
   * `terms` is set on the two paid seeds and left off the free one, because a
   * free tier has nothing to commit to.
   */
  terms: boolean;
  icon: IconName;
}> = [
  { id: 'free', eur: 0, terms: false, icon: 'spark' },
  { id: 'pro', eur: eurFromPln(SUB_PLN_PER_MONTH.pro), terms: true, icon: 'coin' },
  { id: 'premium', eur: eurFromPln(SUB_PLN_PER_MONTH.premium), terms: true, icon: 'trophy' },
];

/** `TERM_LADDER`, verbatim. Basis points, because that is the column's unit. */
export const SUB_TERMS: Array<{ months: number; discountBp: number }> = [
  { months: 1, discountBp: 0 },
  { months: 3, discountBp: 1000 },
  { months: 6, discountBp: 1800 },
  { months: 12, discountBp: 2500 },
];

/**
 * The rung the picker opens on, and it is the last one.
 *
 * The year is the offer — a quarter off is the whole reason the ladder is on
 * the page — so it is what the cards are priced at when the section is first
 * read. Nothing is hidden by that: every card states the commitment and the
 * amount actually charged for it under the monthly figure, which is the line
 * that makes opening on the cheapest rung honest rather than sly.
 */
export const SUB_DEFAULT_TERM = SUB_TERMS.length - 1;

/**
 * A rung's price, in euros, snapped to the currency the reader is quoted in.
 *
 * This is `termPricing` in `server/domain/entitlements.ts` ported, and the
 * order of operations is the whole of it: **the monthly figure is rounded and
 * the total is derived from it**, never the other way round. The monthly price
 * is what the card prints and what a reader compares plans by; the total is
 * what would leave their account. Round the total instead and the per-month
 * figure stops multiplying up — "16.39 a month" beside a charge of 98.35 is the
 * few-grosze disagreement nobody can explain at the counter.
 *
 * The rounding has to happen in the **reader's** currency, because that is
 * where the minor unit is. A euro amount rounded to euro cents is 4.65 in every
 * language and converts to 19.98 zł, a grosz under the price the server would
 * charge; snapping in local units and handing the result back as euros gets
 * 19.99 / 17.99 / 16.39 / 14.99 exactly, which is the ladder the backend
 * seeded. The round trip through the rate is what keeps `useMoney(…, 'unit')`
 * the only thing in the building that ever writes a currency symbol.
 *
 * `'unit'` and not `'price'`, at the call site: `price` snaps to the currency's
 * shelf step, and a step of 5 turns £3.99 / £3.59 / £3.27 / £2.99 into £5 four
 * times over. The ladder is the one thing on the card that cannot survive that
 * mode — see the note on `MoneyRound` in `i18n/currency.ts`, which is about
 * exactly this failure one screen over.
 */
export function subTermPrice(
  eurPerMonth: number,
  months: number,
  discountBp: number,
  currency: Currency,
): { perMonth: number; total: number } {
  const discounted = (eurPerMonth * (10_000 - discountBp)) / 10_000;
  const local = Number((discounted * currency.rate).toFixed(currency.decimals));
  const snapped = local / currency.rate;
  return { perMonth: snapped, total: snapped * months };
}

/**
 * `null` is "no ceiling".
 *
 * The server writes 9999 into `plan_entitlements` for `assistant_uses_per_day`
 * and `streak_freezes` on Premium, because that column holds text and every
 * caller compares against a number — the sentinel is honest about being a
 * bound. A card cannot print a sentinel, so here it is the absence of one and
 * the page writes the word.
 */
export type SubValue = number | null;

/**
 * How a row's three values are written.
 *
 * - `number` — a bare figure, with the unit carried by the row's *label* so
 *   that "days" and "hours" stay translatable copy rather than a suffix typed
 *   into a component. **Zero renders as the nothing-mark**, because no hours of
 *   head start and no points credited are the absence of a perk rather than a
 *   quantity of it.
 * - `multiplier` — the same, written against `×`, which is a symbol and not a
 *   word in any of the five languages.
 * - `flag` — has it or does not.
 * - `badge` — 0 is none; 1 and 2 index `copy.subscription.badges`, which is the
 *   one row whose value is a word.
 */
export type SubRowKind = 'number' | 'multiplier' | 'flag' | 'badge';

/**
 * The entitlement table, one row per key, index-aligned with
 * `copy.subscription.rows` — and the three values are index-aligned with
 * `SUB_PLANS`, so a row is read straight across.
 *
 * Every figure is the seeded one. The order runs from the loop a player is
 * actually in (energy, what it refills at, what a round pays) outward to what a
 * plan adds around it, because the first three are the difference somebody
 * feels on the first evening and the rest is the difference they feel in a
 * month.
 */
export const SUB_ROWS: Array<{ kind: SubRowKind; values: [SubValue, SubValue, SubValue] }> = [
  /* `daily_energy` — the tank, which is also finished rounds a day from a full
     one before the clock gives anything back. These three moved from 3/5/7 when
     energy started being spent on every round rather than only on a lost one,
     and this table was left behind for a day: the page advertised a smaller
     free tier than the product was giving away. `npm run verify` now checks the
     free column against `MAX_ENERGY`, which is the only one of the three the
     front end can see. */
  { kind: 'number', values: [4, 6, 10] },
  /* `energy_regen_minutes`, in hours: 240 / 180 / 120. A faster refill is worth
     more than a bigger pool to the player who empties it at nine in the
     morning, which is what the server's own note says it is for. */
  { kind: 'number', values: [4, 3, 2] },
  /* `points_multiplier`. **Game rounds only** — the venue lines are their own
     per-tier figures on the server, and multiplying those as well would pay a
     paid plan twice for one visit. The row's label has to say so. */
  { kind: 'multiplier', values: [1, 1.25, 1.75] },
  /* `voucher_validity_days`. */
  { kind: 'number', values: [14, 30, 60] },
  /* `word_hints_per_day`. Ten and not the sentinel: a hint per word is five a
     round, so the top of this one is a number a card can print. */
  { kind: 'number', values: [3, 6, 10] },
  /* `assistant_uses_per_day`. The one consumer key whose ceiling is a running
     cost rather than a design choice — a model call and a retrieval pass per
     ask. */
  { kind: 'number', values: [5, 20, null] },
  /* `streak_freezes`. */
  { kind: 'number', values: [2, 5, null] },
  /* `exclusive_deals`. */
  { kind: 'flag', values: [0, 1, 1] },
  /* `deal_early_access_hours`. Zero on two tiers, which is why a `number` row
     writes zero as nothing: "0" in a column of hours reads as a broken figure. */
  { kind: 'number', values: [0, 0, 24] },
  /* `gift_card_priority`. */
  { kind: 'flag', values: [0, 1, 1] },
  /* `monthly_stipend`, from `CONFIG.earn.premiumStipend`. It is deliberately
     worth clearly less than the plan costs; a credit that covered the fee would
     be a subscription that refunds itself. */
  { kind: 'number', values: [0, 0, 200] },
  /* `priority_support`. */
  { kind: 'flag', values: [0, 0, 1] },
  /* `profile_badge` — '', 'star', 'crown'. The mark beside your name on the
     board, and the only row here whose value is a word.

     It stays **last** because it is read off the end rather than in sequence:
     `SUB_BADGE_ROW` points at it and the card draws it as a seal in the header
     rather than as a thirteenth line of small print. A perk you wear is the one
     row on this table that is not a quantity, and printing "Crown" in the
     right-hand column of a list was the flattest possible way to say so. */
  { kind: 'badge', values: [0, 1, 2] },
];

/**
 * How the card splits that table into three parts, by index.
 *
 * The order of `SUB_ROWS` was already an argument — the loop a player is in
 * first, then what a plan adds around it — and these two constants are that
 * argument made structural rather than left in a comment for a component to
 * ignore.
 *
 * - The first `SUB_HERO` rows are the **strip**: three figures at display size,
 *   because they are the difference somebody feels on their first evening and
 *   the reason to pay at all. A plan whose whole case is "ten rounds instead of
 *   four, refilled twice as fast, paying 1.75×" cannot make that case as rows
 *   one to three of a thirteen-row list set in 0.8rem.
 * - The last row is the **seal**, drawn in the card header.
 * - Everything between is the list, which is what a list is good at: nine
 *   like-for-like answers a reader scans down rather than reads.
 *
 * They are indices into one array rather than three arrays because the table
 * still has to be readable straight across — the values are index-aligned with
 * `SUB_PLANS` and the labels with `copy.subscription.rows`, and splitting the
 * source would put that alignment in three places to keep instead of one.
 */
export const SUB_HERO = 3;

/** The seal's row. Last, and the card reads it from the end for that reason. */
export const SUB_BADGE_ROW = SUB_ROWS.length - 1;

/**
 * Where the footer's two columns go, index-aligned with
 * `copy.footer.columns[i].links`.
 *
 * Every one of these used to be a landing-page section anchor, which made the
 * footer a set of six links to the same page under six different names. They
 * now point at the page each label names: Play & Earn at L-Earn, Discounts and
 * Hot Deals at the wallet, Support and feedback at Contact.
 *
 * The AI Assistant is the exception and cannot be a href — it is a dock that
 * opens over whatever page you are on, so its entry is `null` and the footer
 * renders a button that opens it. See `ASSISTANT_OPEN_EVENT`.
 */
export const FOOTER_LINKS: Array<Array<string | null>> = [
  [PATHS.learn, PATHS.vouchers, PATHS.relocate, null],
  [PATHS.contact, PATHS.contact, PATHS.vouchers],
];

export const CONTACT_EMAIL = 'usepaylez@gmail.com';

/**
 * What the Contact form files a message under, index-aligned with
 * `copy.contact.form.topics`.
 *
 * These are the server's own words (`TOPICS` in `server/domain/contact.ts`) and
 * they are what goes over the wire — not the index the `<select>` holds, which
 * would change meaning the day somebody reorders the list, and not the label,
 * which is translated and would file a Polish reader's message under a topic
 * the table has no name for.
 */
export const CONTACT_TOPICS = ['support', 'feedback', 'partnership', 'other'] as const;

/**
 * The channels the footer and the Contact page both link to.
 *
 * One table rather than two: the pair appears in the footer and again on
 * `#/contact`, and a social link that is right in one place and stale in the
 * other is the usual way these rot.
 */
export const SOCIALS: Array<{ id: 'instagram' | 'youtube'; href: string; handle: string }> = [
  /* Instagram first, because it is the one the product is actually posted to —
   the order here is the order both surfaces render, so this array is where
   "which channel do we lead with" is decided, and it is decided once. */
  { id: 'instagram', href: 'https://www.instagram.com/pay_lez', handle: '@pay_lez' },
  { id: 'youtube', href: 'https://www.youtube.com/@paylez', handle: '@paylez' },
];

/**
 * Opening the assistant from somewhere that is not the dock.
 *
 * A window event rather than lifting the dock's `open` into a context: the dock
 * is mounted once beside `<main>` and the only thing anyone else needs to do to
 * it is open it. A context for one boolean would put every consumer of it in the
 * re-render path of a panel that is closed almost all of the time.
 */
export const ASSISTANT_OPEN_EVENT = 'paylez:assistant-open';

/* ─────────────────────────────────────────────────────────────── contact ── */

/*
 * Contact used to need two more tables here — a channel-icon list and a row of
 * hero stats. Both went with the sections that read them: the page is one form
 * now, and the only channels left on it are the two in `SOCIALS` above, drawn
 * with their own `id` as the icon name. A count-up stat row on a contact form
 * was the landing page's furniture on a page that is not selling anything.
 */

/* ───────────────────────────────────────────────────────────────── games ── */

/**
 * Which game a round was.
 *
 * Written out here rather than derived from the table below, because the table
 * is now typed *by* it: a row with a misspelt id is a build error at the row
 * rather than a game nothing can ever find. Every award carries one, which is
 * what lets the scoring in `auth/player.ts` say *which* round it is pricing
 * without the table itself having to be reachable from there.
 */
export type GameId =
  | 'brain'
  | 'flag'
  | 'capital'
  | 'poland'
  | 'flight'
  | 'memory'
  /** English. */
  | 'word'
  /** The language of wherever the profile says this person lives. */
  | 'wordLocal';

/**
 * The eight games, in the order the screen shows them and index-aligned with
 * `copy.games.names`.
 *
 * **The order is the layout.** `GAMES[0]` is the featured card — the full-width
 * poster L-Earn opens with — and everything after it fills the grid two to a
 * row. So moving a row here moves a card there, and the two cannot be told
 * apart: there is no second ordering to keep in step, and nothing sorts this
 * list at render. It is also not per-player. A grid that reshuffled itself by
 * what you had played would move the card you were reaching for, which is the
 * one thing a grid of buttons must never do.
 *
 * Rules per game rather than one shared rule, because the old app varied them
 * and the variation is the point: the flag round gives you six seconds a
 * question and the Poland round eight, because one is recognition and the other
 * is the one you are meant to think about. What no longer varies is the
 * **price** — see `perCorrect` below. `kind` is what the round generator
 * switches on.
 *
 * `perCorrect` is the score per right answer, and it is **1 for all four
 * quizzes**. The 5/2/2/1 spread it used to carry priced the same five questions
 * and the same two minutes of somebody's evening at 25, 10, 10 and 5 — so the
 * general quiz was the only one worth opening, and the Poland round, the one
 * this site most wants a newcomer to think about, paid least of the four. What
 * separates them now is the questions rather than the price; what gives a round
 * its shape is `QUIZ_PERFECT_BONUS`, which is worth as much as all five answers
 * put together and lands on the last question.
 *
 * `allowedMistakes` is how many you may get wrong and still bank the round.
 *
 * Every figure here is what a round scores, full stop. A day is bounded by
 * energy and by nothing else (`MAX_ENERGY` in `auth/player.ts`), so the
 * hundredth round of the day pays exactly what the first did — there is no
 * curve here to read the figures through, and the note that used to say so
 * described one that had already been removed.
 *
 * **The last four read those columns differently rather than making them
 * optional**, so this stays one homogeneous table instead of a union of object
 * shapes that every consumer would have to narrow. What each column means per
 * kind is stated on the row.
 *
 * Where the questions come from changed with this table: the four quiz rounds no
 * longer read a handful of hardcoded items out of the dictionaries. They draw
 * from the generated banks in `games/data/` — 2102 general questions, 98 on
 * Poland, 196 flags and 196 capitals — through the no-repeat bag in
 * `games/bag.ts`, so a bank is exhausted before anything in it repeats.
 */
export const GAMES: Array<{
  id: GameId;
  kind: 'text' | 'flag' | 'capital' | 'flight' | 'memory' | 'word';
  icon: IconName;
  questions: number;
  seconds: number;
  perCorrect: number;
  allowedMistakes: number;
}> = [
  /*
   * Memory Match, and it leads the table because it leads the screen — the
   * first row is the featured card (`FEATURED` in `games.tsx`), and this is the
   * one round on the page with no clock, no fail state and nothing to read
   * before you start it. A catalogue's first card is the one somebody who has
   * never played opens, and a quiz with a six-second timer is the wrong door.
   *
   * `questions` is pairs on the board, and both of the other two are zero and
   * mean it: there is no countdown and there is no fail state.
   *
   * **`perCorrect` prices nothing on this row** and is the one dead number in
   * the table. The board is scored by `MEMORY_BANDS` in `auth/player.ts` — 12,
   * 8, 4 or 2 for the whole board on how long it took — so there is no
   * per-pair figure to state, and the card reads the top band out of `player.ts`
   * rather than this column (see `rulesFor`). It is left at 6 rather than
   * dropped because the row is one shape with seven others and a nullable column
   * would be a union of shapes for every consumer to narrow; a number nothing
   * reads is the cheaper of the two.
   *
   * Being measured is not being raced, and the difference is the whole
   * accessibility argument for this game: nothing ticks on screen, nothing ends
   * the board, and the slowest band still pays. What time buys is the honest
   * measure of the skill actually being tested — remembering where a card was is
   * what makes you fast — where the move count it used to be scored on paid a
   * guaranteed 36 for six pairs that cannot be lost, the richest round on the
   * page for the least asked of anybody.
   */
  { id: 'memory', kind: 'memory', icon: 'cards', questions: 6, seconds: 0, perCorrect: 6, allowedMistakes: 0 },
  /*
   * The arcade round, and the only one that is played rather than answered.
   * `questions` is gaps to clear, `perCorrect` is points per gap,
   * `allowedMistakes` is 0 because one crash ends it, and `seconds` is unused —
   * the round lasts as long as you do.
   *
   * Five gaps to bank, matching the quizzes' five questions, so a round is worth
   * the same wherever you spend it. Unlike a quiz the run does not stop there —
   * every gap past five pays another point — but the *payout* does stop:
   * `MAX_FLIGHT_POINTS` in `auth/player.ts` caps a flight at 20, which is twice
   * a clean quiz and the same order as everything else in the set. At two a gap
   * with no ceiling at all, which is what this row said before, one lucky run
   * out-earned four days of the rest of the page — a jackpot rather than a
   * bound. Skill is still paid for past the bank line; it stops being paid at
   * twenty.
   */
  { id: 'flight', kind: 'flight', icon: 'bird', questions: 5, seconds: 0, perCorrect: 1, allowedMistakes: 0 },
  { id: 'flag', kind: 'flag', icon: 'flag', questions: 5, seconds: 6, perCorrect: 1, allowedMistakes: 1 },
  { id: 'capital', kind: 'capital', icon: 'map', questions: 5, seconds: 6, perCorrect: 1, allowedMistakes: 1 },
  { id: 'brain', kind: 'text', icon: 'book', questions: 5, seconds: 12, perCorrect: 1, allowedMistakes: 1 },
  { id: 'poland', kind: 'text', icon: 'housing', questions: 5, seconds: 8, perCorrect: 1, allowedMistakes: 1 },
  /*
   * Word Builder, twice.
   *
   * It used to be one row with a **picker on its card**: a segmented control
   * that chose between the English and the Polish list before the round. Two
   * rows instead, and the difference is not cosmetic. A picker is a decision
   * asked of somebody who has not opened the game yet, in a grid whose every
   * other card is a single press — so the one card in the set that asked a
   * question first was also the one card whose surface could not become the
   * button. Splitting it lets **every** card be one press, which is what the
   * hover on `.play-card` now depends on.
   *
   * It also makes the catalogue tell the truth about itself. Practising English
   * and practising the language of the city you have moved to are not one game
   * played two ways; they are the two things this product is for, and a
   * catalogue that lists seven rounds when there are eight to play is
   * undercounting itself to save a row.
   *
   * The pair share `kind: 'word'` — one screen, one scorer — and differ only in
   * which list `games.tsx` hands `WordBuilder`. `word` is always English;
   * `wordLocal` reads the list off the **profile's country** (`wordListFor` in
   * `games/banks.ts`), because the local language is a fact about where
   * somebody lives rather than about which of five dictionaries they read the
   * site in.
   *
   * `perCorrect` is dead on both rows for the same reason it is on the memory
   * row above, and `seconds` is 0 because **there is no clock at all** — not a
   * limit and not a score. A word is worth `WORD_BASE` plus its own tier
   * (`wordPoints`), and a hint forfeits the tier and leaves the base. The speed
   * term that used to sit in there made the thinking game of the set a race,
   * which is what four of the others already are.
   */
  { id: 'word', kind: 'word', icon: 'letters', questions: 5, seconds: 0, perCorrect: 5, allowedMistakes: 0 },
  { id: 'wordLocal', kind: 'word', icon: 'letters', questions: 5, seconds: 0, perCorrect: 5, allowedMistakes: 0 },
];

/**
 * What the hover previews actually play.
 *
 * A card in the catalogue shows a **working miniature of its own round** when
 * the pointer rests on it, and these are the pieces that are structure rather
 * than copy: a flag's ISO code, three cards off a real deck, one row out of each
 * word list. The words a reader reads live in `copy.games.preview`.
 *
 * **Everything here is real content the game itself uses**, and that is the
 * whole point of the block. The previews were abstract shapes first — bars,
 * dots, a rectangle standing in for a flag — and they told a player that six
 * cards were six different cards without telling them what any of the six
 * actually was. A card promising a quiz and drawing four grey bars is
 * advertising the wrong product.
 *
 * They are **fixed samples, not draws from the banks.** The banks in
 * `games/data/` are code-split on purpose and the general one is 220 kB; a
 * pointer crossing a card must not fetch that, and a preview that dealt a new
 * question on every hover would be a slot machine where an example is wanted.
 * `npm run verify` checks the deck cards and the words below against the real
 * files, so "real content" stays true rather than being true on the day it was
 * typed.
 */
export const PREVIEW = {
  /**
   * The flag the Guess the Flag card shows, as the ISO code `flagOf` turns into
   * an emoji. `copy.games.preview.flag[0]` is the country it names, and the two
   * have to agree — a translator moving `Poland` to `Polska` keeps them
   * agreeing, which is why the code is here and the name is not.
   */
  flagCode: 'PL',

  /**
   * Three pairs off the Kraków deck in `games/data/decks.json`, verbatim.
   *
   * Not translated, and that is not an omission: the label is the **Polish
   * name**, which is the thing Memory Match is teaching, and it is the same
   * string on the board whichever of the five languages the site is being read
   * in. Copying three rows rather than importing the file keeps a 3.5 kB deck
   * out of the main bundle for a decoration; `npm run verify` reads the real
   * file and checks these three are still in it.
   */
  memory: [
    { icon: '🏰', label: 'Wawel' },
    { icon: '🐉', label: 'Smok' },
    { icon: '⛲', label: 'Rynek' },
  ],

  /**
   * One row from each word list, `[word, hint]` out of `words.<list>.json`.
   *
   * Two different words, because the catalogue now has two Word Builders and a
   * card should preview the round it will actually deal — the English card
   * builds an English word and the local card a Polish one. The hints are
   * English in both files (see `WordList` in `games/banks.ts`), which is what
   * the real game shows too.
   */
  word: {
    en: { word: 'BREAD', hint: 'You buy this at a bakery' },
    pl: { word: 'KAWA', hint: 'You order this in a café' },
  },
} as const;

/** The board's two orderings, index-aligned with `copy.games.boardTabs`. */
export const BOARD_TABS = ['correct', 'points'] as const;

/* ─────────────────────────────────────────────────────────────── account ── */

/**
 * The two account types, in the order the sign-in screen offers them.
 *
 * Index-aligned with `copy.auth.types`, the same arrangement `NAV_ITEMS` has
 * with `copy.nav`: the icon and the id are structure, the name and the sentence
 * under it are copy.
 */
export const ACCOUNT_TYPES: Array<{
  id: 'individual' | 'business';
  icon: IconName;
}> = [
  { id: 'individual', icon: 'assistant' },
  { id: 'business', icon: 'briefcase' },
];

/* ─────────────────────────────────────────────────────────────── console ── */

/**
 * The platform, as the operator's console sees it.
 *
 * Lifted from the original admin panel (`landing/screenshots/admin-b2b*.png`
 * and `admin-analytics*.png`) rather than invented here — same headline counts,
 * same service catalogue, same per-venue analytics. Two things are deliberately
 * *not* carried over: its colours, which are a fourth palette this site does not
 * have, and its PLN/USD toggle, which the language already decides (see the
 * money rule).
 *
 * Everything here is seed data for one platform-shaped month. The one venue on
 * the console that is *not* seeded is the listing a real signed-up owner saved —
 * `admin.tsx` puts it in the same list with no traffic behind it, which is the
 * state every screenshot in that folder was taken in.
 */
export const PLATFORM = { services: 308, active: 220, deals: 14, activeDeals: 10 };

export interface AdminService {
  /** The hash an owner pastes into the analytics search. */
  id: string;
  /** The letter on the tile. Venue names are brands and are never translated. */
  logo: string;
  /**
   * The venue's own mark, if its owner uploaded one — a data URL, and `''` for
   * every seeded venue here.
   *
   * Optional rather than a letter-or-image union because that is what it
   * actually is: a listing either has a picture or it does not, and the letter
   * above is the fallback rather than the other half of a choice. The console
   * is the one screen that shows seeded venues and real ones side by side, so
   * it is also the one screen where both cases are on screen at once.
   */
  mark?: string;
  name: string;
  /** Index into `BUSINESS_CATEGORIES`, and so into `copy.listing.categories`. */
  category: number;
  city: string;
  rating: number;
  vouchers: boolean;
  active: boolean;
  /**
   * How busy this venue is, as a multiple of the base month below.
   *
   * One number instead of five hundred: every figure in the analytics view is
   * derived from it (`adminMetrics.ts`), so a quiet venue is quiet *everywhere*
   * — its trend, its tables and its country comparison all agree, which five
   * separately invented data sets would not.
   */
  scale: number;
}

export const ADMIN_SERVICES: AdminService[] = [
  { id: '6a68a301a5d97e02c4b715c3', logo: 'D', name: 'Dubai Cafe', category: 0, city: 'Kraków', rating: 3.5, vouchers: true, active: true, scale: 1 },
  { id: '9f21c74e0b3a5d18e6c2470a', logo: 'B', name: 'Bollywood Masala House', category: 1, city: 'Kraków', rating: 4.9, vouchers: true, active: true, scale: 1.45 },
  { id: '3d0b58fa9c17e4620d8a1f55', logo: 'S', name: 'Sultan Barbers', category: 2, city: 'Warszawa', rating: 4.6, vouchers: true, active: true, scale: 0.62 },
  { id: 'c48e1207b6d9a35f0e7c9821', logo: 'L', name: 'Lingua Nova', category: 5, city: 'Wrocław', rating: 4.8, vouchers: false, active: true, scale: 0.34 },
  { id: '71bd3e9c802af5461d0b7e34', logo: 'F', name: 'Forma Fitness', category: 6, city: 'Gdańsk', rating: 4.2, vouchers: true, active: false, scale: 0.79 },
];

/** Platform-wide offers. `until` is `DD.MM.YYYY`; brands are never translated. */
export const ADMIN_DEALS: Array<{
  id: string;
  logo: string;
  name: string;
  kind: 'gift' | 'deal';
  country: string;
  until: string;
  active: boolean;
}> = [
  { id: 'flixbus', logo: 'F', name: 'FlixBus Gift Card', kind: 'gift', country: 'PL', until: '31.08.2026', active: true },
  { id: 'biedronka', logo: 'B', name: 'Biedronka Gift Card', kind: 'gift', country: 'PL', until: '31.08.2026', active: true },
  { id: 'hebe', logo: 'H', name: 'Hebe Gift Card', kind: 'gift', country: 'PL', until: '31.08.2026', active: true },
  { id: 'zalando', logo: 'Z', name: 'Zalando Gift Card', kind: 'gift', country: 'PL', until: '30.09.2026', active: true },
  { id: 'mediaexpert', logo: 'M', name: 'Media Expert Gift Card', kind: 'gift', country: 'PL', until: '30.09.2026', active: false },
  { id: 'dubai21', logo: '2', name: '2+1 at Dubai Cafe', kind: 'deal', country: 'PL', until: '31.07.2026', active: false },
];

/**
 * One month at a venue of `scale: 1`, and the seed everything else is derived
 * from. Money is euros like everywhere else in this file.
 *
 * The four contact counters, the two voucher pairs and the scan count are the
 * nine figures the original's Dashboard tab shows; `engagement` is not among
 * them because it is their sum, and computing it (in `adminMetrics.ts`) is what
 * stops the headline disagreeing with the cards under it.
 */
export const ADMIN_BASE = {
  maps: 1840,
  website: 962,
  phone: 314,
  instagram: 587,

  vouchersUsed: 168,
  vouchersActive: 74,
  loyaltyUsed: 96,
  loyaltyActive: 41,
  /** Combined discount given, as a percentage of the cheques it was used on. */
  discount: 12,
  scans: 1212,

  /** Thirty days of engagement, oldest first. Shape, not noise. */
  trend: [
    118, 131, 126, 149, 162, 141, 108, 122, 138, 147,
    166, 178, 159, 121, 134, 151, 163, 172, 188, 164,
    129, 143, 157, 169, 181, 196, 174, 138, 152, 167,
  ],
  /** Daily QR scans over the same window. */
  scanTrend: [
    28, 34, 31, 39, 44, 37, 24, 29, 33, 36,
    42, 47, 40, 27, 31, 38, 41, 45, 51, 43,
    30, 35, 39, 44, 48, 53, 46, 32, 37, 42,
  ],
  /** Daily cheque total from voucher redemptions, in euros. */
  salesTrend: [
    186, 214, 198, 262, 291, 244, 152, 191, 223, 238,
    276, 312, 268, 174, 205, 251, 274, 298, 341, 286,
    196, 231, 259, 288, 317, 352, 302, 211, 246, 279,
  ],
  /** Six months of cheque value from redemptions, in euros. */
  monthly: [4_820, 5_640, 6_180, 7_020, 8_460, 9_240],

  loyalty: {
    perVisit: 5,
    /** Hours a customer must wait before a second scan counts. */
    cooldown: 24,
    active: true,
    /** Visits needed → percent off. The prototype's two standing rewards. */
    campaigns: [
      { visits: 5, reward: 10 },
      { visits: 10, reward: 20 },
    ],
    /** Cheque value from scanned visits, and the average behind it. Euros. */
    sales: 8_640,
    avg: 7.1,
  },

  vouchers: {
    /** The discount budget this campaign runs against, in euros. */
    budget: 907,
    spent: 362,
    issued: 214,
    /** Cheque value the redemptions carried, and the basket behind it. Euros. */
    sales: 12_480,
    basket: 21.4,
  },

  /** Percent off, points it costs, how many went out, and the monthly cap. */
  tiers: [
    { pct: 5, points: 250, issued: 214, cap: 0 },
    { pct: 10, points: 600, issued: 96, cap: 400 },
    { pct: 15, points: 1200, issued: 31, cap: 120 },
  ],

  /** Where the customers came from. Cities are proper nouns, not copy. */
  cities: [
    { name: 'Kraków', n: 428 },
    { name: 'Warszawa', n: 161 },
    { name: 'Wrocław', n: 97 },
    { name: 'Gdańsk', n: 64 },
    { name: 'Poznań', n: 41 },
  ],
  /** Index-aligned with `SPOKEN_LANGUAGES`, so the names come from copy. */
  languages: [
    { code: 'pl' as SpokenLanguage, n: 342 },
    { code: 'uk' as SpokenLanguage, n: 196 },
    { code: 'ru' as SpokenLanguage, n: 154 },
    { code: 'en' as SpokenLanguage, n: 89 },
    { code: 'uz' as SpokenLanguage, n: 32 },
  ],
  /** What a similar venue in the same country averages, for the comparison. */
  country: { maps: 1210, website: 640, phone: 268 },
};

/**
 * Sample rows for the three tables, newest first.
 *
 * `ago` is days back from today, which is what makes the All time / 7 / 30 / 90
 * filters do something rather than decorate: the row's date is computed at
 * render, so the table is never stale and the filter is never a lie. Money is
 * euros; `points` is what the customer spent or earned.
 */
export const ADMIN_REDEMPTIONS: Array<{
  ago: number;
  deal: string;
  user: string;
  code: string;
  points: number;
  discount: number;
  used: boolean;
  cheque: number;
}> = [
  { ago: 0, deal: '2+1', user: 'PY7178', code: 'PLZ-9F3K', points: 2, discount: 10, used: true, cheque: 18.4 },
  { ago: 1, deal: '20%', user: 'PY6722', code: 'PLZ-2B7Q', points: 250, discount: 20, used: true, cheque: 31.2 },
  { ago: 3, deal: 'FREE', user: 'PY6307', code: 'PLZ-7X1M', points: 600, discount: 100, used: true, cheque: 12.8 },
  { ago: 6, deal: '15%', user: 'PY5940', code: 'PLZ-4K8D', points: 1200, discount: 15, used: false, cheque: 0 },
  { ago: 12, deal: '20%', user: 'PY5511', code: 'PLZ-8W2N', points: 250, discount: 20, used: true, cheque: 26.5 },
  { ago: 19, deal: '10%', user: 'PY5203', code: 'PLZ-3T6V', points: 250, discount: 10, used: true, cheque: 22.9 },
  { ago: 34, deal: '2+1', user: 'PY4988', code: 'PLZ-5R1J', points: 2, discount: 10, used: true, cheque: 16.7 },
  { ago: 61, deal: '15%', user: 'PY4712', code: 'PLZ-1Z9H', points: 1200, discount: 15, used: true, cheque: 44.1 },
];

/** `progress` is visits done out of visits needed for the next reward. */
export const ADMIN_SCAN_ROWS: Array<{
  ago: number;
  user: string;
  points: number;
  spent: number;
  receipt: string;
  city: string;
  progress: [number, number];
}> = [
  { ago: 0, user: 'PY7178', points: 5, spent: 6.4, receipt: '#7F2A', city: 'Kraków', progress: [3, 5] },
  { ago: 0, user: 'PY6722', points: 5, spent: 9.1, receipt: '#B14C', city: 'Kraków', progress: [1, 5] },
  { ago: 2, user: 'PY6307', points: 5, spent: 4.8, receipt: '#C903', city: 'Warszawa', progress: [8, 10] },
  { ago: 5, user: 'PY5940', points: 5, spent: 12.6, receipt: '#2D71', city: 'Kraków', progress: [2, 5] },
  { ago: 9, user: 'PY5511', points: 5, spent: 7.3, receipt: '#A48E', city: 'Wrocław', progress: [4, 5] },
  { ago: 21, user: 'PY5203', points: 5, spent: 5.2, receipt: '#66F1', city: 'Kraków', progress: [5, 5] },
  { ago: 48, user: 'PY4988', points: 5, spent: 8.9, receipt: '#31DA', city: 'Gdańsk', progress: [2, 10] },
];

/** `pct` is the discount the voucher carried; `loyalty` marks the ones a scan
 *  earned rather than points bought. */
export const ADMIN_VOUCHER_ROWS: Array<{
  ago: number;
  code: string;
  loyalty: boolean;
  user: string;
  pct: number;
  points: number;
  used: boolean;
  cheque: number;
}> = [
  { ago: 0, code: 'PLZ-9F3K', loyalty: false, user: 'PY7178', pct: 5, points: 250, used: true, cheque: 24.6 },
  { ago: 1, code: 'PLZ-2B7Q', loyalty: true, user: 'PY6722', pct: 10, points: 0, used: true, cheque: 33.8 },
  { ago: 4, code: 'PLZ-7X1M', loyalty: false, user: 'PY6307', pct: 10, points: 600, used: true, cheque: 19.2 },
  { ago: 8, code: 'PLZ-4K8D', loyalty: false, user: 'PY5940', pct: 15, points: 1200, used: false, cheque: 0 },
  { ago: 15, code: 'PLZ-8W2N', loyalty: true, user: 'PY5511', pct: 5, points: 0, used: true, cheque: 28.4 },
  { ago: 27, code: 'PLZ-3T6V', loyalty: false, user: 'PY5203', pct: 5, points: 250, used: true, cheque: 21.1 },
  { ago: 55, code: 'PLZ-5R1J', loyalty: false, user: 'PY4712', pct: 15, points: 1200, used: true, cheque: 52.3 },
];

/** The console's own tabs, and the analytics view's. Icons are structure. */
export const ADMIN_TABS: IconName[] = ['briefcase', 'ticket', 'assistant', 'bars', 'send'];
export const ADMIN_VIEW_TABS: IconName[] = ['bars', 'ticket', 'qr', 'gift', 'map'];

/** The nine Dashboard cards, in the original's order. */
export const ADMIN_CARD_ICONS: IconName[] = [
  'map',
  'link',
  'phone',
  'instagram',
  'ticket',
  'gift',
  'coin',
  'assistant',
  'qr',
];

/* ─────────────────────────────────────────────────────────────── listing ── */

/**
 * Business categories and their subcategories, as ids.
 *
 * The taxonomy is the partner prototype's. Ids here, names in the dictionaries:
 * "Café" and "Kawiarnia" are the same category, and a listing that stored the
 * word would change category when the reader changed language.
 *
 * `subs` is a count rather than a list because the subcategory names are copy
 * too — `copy.listing.subcategories[i]` is the array for category `i`, and this
 * number is what the two are checked against.
 */
export const BUSINESS_CATEGORIES: Array<{
  id: BusinessCategory;
  subs: number;
}> = [
  { id: 'cafe', subs: 4 },
  { id: 'restaurant', subs: 5 },
  { id: 'barbershop', subs: 3 },
  { id: 'beauty', subs: 4 },
  { id: 'dental', subs: 3 },
  { id: 'language', subs: 3 },
  { id: 'fitness', subs: 3 },
];

/** Index-aligned with `copy.listing.countries`. */
export const BUSINESS_COUNTRIES: BusinessCountry[] = [
  'pl',
  'ua',
  'ge',
  'tr',
  'uz',
  'az',
];

/**
 * Languages a venue's staff might speak, index-aligned with
 * `copy.listing.spokenLanguages`.
 *
 * Six, where the site itself has five: Turkish is not a language this site is
 * translated into, but it is one a Kraków barber may well speak, and the
 * listing describes the venue rather than the reader.
 */
export const SPOKEN_LANGUAGES: SpokenLanguage[] = ['pl', 'en', 'uk', 'ru', 'tr', 'uz'];

/**
 * The opening hours shown on the listing.
 *
 * Fixed, and index-aligned with `copy.listing.hoursDays`. The prototype does
 * not make these editable either — an hours editor is a week-shaped control
 * with holidays and split shifts in it, and stubbing one badly would be worse
 * than showing the three lines the app actually renders.
 */
export const BUSINESS_HOURS = ['07:30 – 19:00', '08:30 – 18:00', '09:00 – 16:00'];

/**
 * The partner plan's monthly discount budget, in euros like every other amount
 * in this file. `spent` is what has gone out so far.
 *
 * Two numbers rather than a percentage because the rail shows both figures in
 * the reader's own currency, and a percentage cannot be converted into one.
 */
export const PARTNER_BUDGET = { total: 350, spent: 214 };

/* ── the venue's actual figures ─────────────────────────────────────────────
 *
 * They used to live here, transcribed by hand from the prototype's seed tables.
 * They are now in `partnerMetrics.ts`, which carries the prototype's *seeds and
 * its arithmetic* rather than a snapshot of its output — so the deal claim
 * rates, the campaign set-aside money, the cost per new customer and the ROI
 * verdict are all one calculation seen from four screens, and a seed edit moves
 * them together instead of leaving three of them stale.
 *
 * Money there is euros like everything else here, for the same reason.
 */

/**
 * The dashboard's screens, in rail order and index-aligned with
 * `copy.dashboard.screens`.
 *
 * `group` is which heading the rail files it under; `profile` is the only one
 * with a form behind it, and every other screen shows the empty state at the
 * matching index of `copy.dashboard.empty` — which is not a placeholder but the
 * state a venue genuinely starts in. A new partner has run no deals, has no
 * customers and has had no scans, and the prototype this is rebuilt from says
 * so screen by screen rather than showing zeroes.
 */
export const DASH_SCREENS: Array<{
  id: string;
  icon: IconName;
  group: 'grow' | 'workspace';
}> = [
  { id: 'overview', icon: 'bars', group: 'grow' },
  { id: 'deals', icon: 'ticket', group: 'grow' },
  { id: 'campaigns', icon: 'trophy', group: 'grow' },
  { id: 'vouchers', icon: 'gift', group: 'grow' },
  { id: 'customers', icon: 'people', group: 'grow' },
  { id: 'assistant', icon: 'spark', group: 'grow' },
  { id: 'scans', icon: 'qr', group: 'workspace' },
  { id: 'profile', icon: 'housing', group: 'workspace' },
];

/* ─────────────────────────────────────────────────────────────── l-earn ── */

/**
 * Index-aligned with `copy.learn.hero.stats`.
 *
 * The third is "what a voucher starts at", read off the catalogue rather than
 * typed. It was `500` — a figure that was true of some card at some point and
 * had stopped being the cheapest one long before anybody noticed, which is the
 * whole reason `CHEAPEST_VOUCHER_POINTS` exists.
 */
/*
 * Index-aligned with `copy.learn.hero.stats`, which now reads
 * ['Best round', 'Earns a freeze', 'Buys a voucher'].
 *
 * The first was 100 under the label "per game win", and both halves of that
 * were wrong at once: nothing pays 100 a round any more, and the biggest round
 * on the page is a full flight at `MAX_FLIGHT_POINTS`. It is written here
 * rather than imported from `auth/player.ts` because this file is the
 * marketing model and importing the app's scoring into it would make the two
 * one thing — but it is the same number, and it is the number to change if the
 * ceiling moves.
 */
export const LEARN_STATS = [
  { value: 20, suffix: ' pts' },
  { value: 7, suffix: '-day' },
  { value: CHEAPEST_VOUCHER_POINTS, suffix: ' pts' },
];

/** Index-aligned with `copy.learn.steps.items`. */
export const LEARN_STEP_ICONS: IconName[] = ['leisure', 'check', 'trophy', 'gift'];

/*
 * `LEARN_GAME_ICONS` used to live here, index-aligned with three hand-written
 * cards in `copy.learn.games.items`. Both are gone: the marketing section reads
 * `GAMES` directly now, so the page cannot claim a catalogue the product does
 * not have — which it already did, listing three games after five had shipped.
 */

/** Length is the streak the strip draws; `lit` is how much of it is done. */
export const STREAK = { length: 7, lit: 5 };

/**
 * Sample leaderboard. Display names, so they are structure rather than copy —
 * and deliberately the same people who appear in the testimonials.
 */
export const LEARN_BOARD = [
  { name: 'Ola K.', points: 4820 },
  { name: 'Mateusz R.', points: 4415 },
  { name: 'Mira D.', points: 4180 },
  { name: 'Priya S.', points: 3960 },
  { name: 'Elena V.', points: 3705 },
];

/* ──────────────────────────────────────────────────────────── analytics ── */

/**
 * The partner dashboard's four headline figures, index-aligned with
 * `copy.analytics.kpis`.
 *
 * `delta` is the period-on-period change in percentage points, and it is signed
 * on purpose: a dashboard that only ever shows green is a brochure. The count-up
 * hook rounds to whole numbers, so every value here is an integer — a rate that
 * wanted one decimal place would silently lose it.
 */
export const ANALYTICS_KPIS: Array<{
  icon: IconName;
  value: number;
  suffix: string;
  delta: number;
}> = [
  { icon: 'bars', value: 24800, suffix: '', delta: 12 },
  { icon: 'qr', value: 3120, suffix: '', delta: 8 },
  { icon: 'ticket', value: 18, suffix: '%', delta: 3 },
  { icon: 'coin', value: 562, suffix: '', delta: -4 },
];

/**
 * The engagement funnel, index-aligned with `copy.analytics.funnel.stages`.
 *
 * `share` is the width of each bar as a percentage of the first stage, not of
 * the viewport — the shape of the drop-off *is* the chart, and hardcoding it
 * here keeps the component free of arithmetic over numbers it cannot check.
 */
export const ANALYTICS_FUNNEL = [
  { value: 24800, share: 100 },
  { value: 3120, share: 13 },
  { value: 562, share: 2 },
];

/**
 * Redemptions per day for one week, as a fraction of the tallest bar.
 *
 * Fourteen bars would need a real scale and axis labels; seven need neither,
 * and a week is the period a shop owner actually thinks in. Monday first.
 */
export const ANALYTICS_WEEK = [46, 62, 51, 78, 94, 71, 38];

/** Index-aligned with `copy.analytics.reports.items`. */
export const ANALYTICS_REPORT_ICONS: IconName[] = ['map', 'card', 'check', 'send'];

/*
 * There is no sample partner here any more. The Analytics hero used to mock up
 * a Service ID field against `{ id: 'PLZ-4417-KRK', logo: 'M' }`; the panel now
 * names the venue on the session instead, so the only thing that table held is
 * a number the page no longer asks anybody for. The Service ID itself is not
 * gone — it is an operator's handle, and the console still indexes by it.
 */

/* ────────────────────────────────────────────────────────────── business ── */

/**
 * Index-aligned with `copy.business.hero.stats`.
 *
 * `money` marks a figure that is quoted in the reader's currency rather than in
 * a unit. Its value is euros like every other amount in this file — the symbol,
 * the conversion and which side of the number it sits on all come from
 * `i18n/currency.ts`, because the page prices in whatever the language does.
 */
export const BUSINESS_STATS: Array<{ value: number; suffix: string; money?: true }> = [
  { value: 3, suffix: '×' },
  { value: 0, suffix: '', money: true },
  { value: 48, suffix: 'h' },
];

/** Index-aligned with `copy.business.why.items`. Four, not three: the pitch is that
 *  four systems most operators buy separately run off one customer record, and
 *  a fourth claim needs a fourth card to stand in. */
export const BUSINESS_WHY_ICONS: IconName[] = ['coin', 'assistant', 'qr', 'briefcase'];

/* ── the owner's dashboard ─────────────────────────────────────────────────
 *
 * The mock on `#/business` is the console a venue owner logs into, not the partner
 * analytics screen `#/analytics` previews — same product, different seat. Every
 * figure below is what one four-site operator saw in a month, so the numbers
 * have to agree with each other: the tile totals are the chart's columns summed,
 * and the headline revenue is what the attributed visits spent.
 */

/** The headline strip. Euros; converted at render. */
export const BUSINESS_DASH_HEAD = { customers: 1240, revenue: 38600 };

/**
 * The four tiles, index-aligned with `copy.business.dashboard.tiles`.
 *
 * `delta` is the period-on-period change and it is signed on purpose — the same
 * reason the analytics KPIs are. A dashboard that only ever shows green is a
 * brochure, and the falling basket next to the rising visit count is the honest
 * shape of what discounting does.
 *
 * `spark` is seven days as percentages of the tile's own tallest day. It is not
 * a scale anyone reads a value off; it is there so a number that moved has
 * something showing *how* it moved.
 */
export const BUSINESS_DASH_TILES: Array<{
  icon: IconName;
  value: number;
  suffix: string;
  delta: number;
  money?: true;
  spark: number[];
}> = [
  { icon: 'qr', value: 8420, suffix: '', delta: 18, spark: [48, 61, 55, 70, 82, 94, 66] },
  {
    icon: 'ticket',
    value: 2180,
    suffix: '',
    delta: 12,
    spark: [40, 52, 47, 63, 71, 88, 58],
  },
  {
    icon: 'assistant',
    value: 61,
    suffix: '%',
    delta: 6,
    spark: [70, 68, 74, 77, 81, 86, 84],
  },
  {
    icon: 'coin',
    value: 24,
    suffix: '',
    delta: -3,
    money: true,
    spark: [86, 82, 79, 84, 75, 71, 74],
  },
];

/**
 * A fortnight of visits against the vouchers actually redeemed, as percentages
 * of the tallest column.
 *
 * Two series rather than one, because the gap between them is the number the
 * insight card below the chart is about: a reward earned and never used is a
 * customer who qualified and did not come back.
 */
export const BUSINESS_DASH_CHART: Array<{ visits: number; redeemed: number }> = [
  { visits: 52, redeemed: 14 },
  { visits: 58, redeemed: 17 },
  { visits: 49, redeemed: 13 },
  { visits: 63, redeemed: 19 },
  { visits: 71, redeemed: 22 },
  { visits: 66, redeemed: 20 },
  { visits: 44, redeemed: 11 },
  { visits: 61, redeemed: 18 },
  { visits: 68, redeemed: 21 },
  { visits: 59, redeemed: 17 },
  { visits: 74, redeemed: 24 },
  { visits: 88, redeemed: 29 },
  { visits: 96, redeemed: 33 },
  { visits: 58, redeemed: 17 },
];

/**
 * What is live in the venue right now, index-aligned with
 * `copy.business.dashboard.live.rows`.
 *
 * `paused` is on one of the three deliberately. Three green rows is a product
 * screenshot; one paused row is a screen someone actually works in.
 */
export const BUSINESS_DASH_LIVE: Array<{
  icon: IconName;
  stat: number;
  suffix: string;
  paused?: true;
}> = [
  { icon: 'trophy', stat: 1840, suffix: '' },
  { icon: 'ticket', stat: 612, suffix: '' },
  { icon: 'send', stat: 38, suffix: '%', paused: true },
];

/** Index-aligned with `copy.business.rollout.items`. */
export const BUSINESS_ROLLOUT_ICONS: IconName[] = ['send', 'map', 'trophy', 'qr'];

/**
 * The three platform pillars, index-aligned with `copy.business.pillars.items`.
 *
 * `visual` names which of the three console mocks the pillar is illustrated
 * with. The component switches on it rather than on the index, so reordering
 * the pillars in the dictionary cannot silently swap the pictures.
 */
export const BUSINESS_PILLARS: Array<{
  icon: IconName;
  visual: 'portal' | 'game' | 'campaign';
}> = [
  { icon: 'bars', visual: 'portal' },
  { icon: 'trophy', visual: 'game' },
  { icon: 'send', visual: 'campaign' },
];

/**
 * The portal mock's per-site rows: share of group spend, and returning-customer
 * share.
 *
 * Two numbers per row because the whole pitch is the second one — a site can be
 * the biggest earner in the group and still have the worst retention, and a
 * console that only showed spend would hide exactly the thing being sold.
 */
export const BUSINESS_SITES = [
  { name: 'Kraków · Kazimierz', spend: 92, repeat: 61 },
  { name: 'Warszawa · Mokotów', spend: 74, repeat: 48 },
  { name: 'Wrocław · Rynek', spend: 58, repeat: 66 },
  { name: 'Gdańsk · Wrzeszcz', spend: 41, repeat: 39 },
];

/** The campaign mock's audience chips, index-aligned with `copy.business.pillars.audiences`. */
export const BUSINESS_AUDIENCE_SIZES = [1840, 620, 2310, 480];

/**
 * Pricing, index-aligned with `copy.business.pricing.tiers`.
 *
 * `price` is in euros and is converted into the reader's currency at render,
 * rounded to a step that currency actually uses — a price tag reading £126.65
 * is an exchange-rate artefact, and nobody chose it. It is null on the tier that
 * is quoted rather than listed: a multi-site rollout with POS integration does
 * not have a shelf price, and inventing one would be the only dishonest number
 * on the page.
 */
export const BUSINESS_TIERS: Array<{ price: number | null; featured?: boolean }> = [
  { price: 0 },
  { price: 149, featured: true },
  { price: null },
];

/** Index-aligned with `copy.business.operators.items`. */
export const BUSINESS_OPERATOR_INITIALS = ['SS', 'HC', 'PY', 'NB'];

/** Separate from `CONTACT_EMAIL`: an operator asking about a rollout is not a
 *  support ticket, and the two go to different people. */
export const SALES_EMAIL = 'usepaylez@gmail.com';

/* ───────────────────────────────────────────────────────────── vouchers ── */

/*
 * The catalogue itself is `VOUCHER_CARDS`, near the top of this file, because
 * four things outside this block read from it. Everything below is the Vouchers
 * *page*, and all of it is derived from that shelf rather than restating it.
 */

/**
 * The hot deals a player can claim, in the order the board lists them.
 *
 * A hot deal is not a catalogue item and the difference matters to the whole
 * section: a gift card is stock — eight brands, a monthly allocation, a points
 * price — and a hot deal is one venue running one offer for a fixed window.
 * So there is no `left of`, no monthly refresh, and `points` is **0 for most of
 * them**, because the venue is paying for it rather than the player.
 *
 * Venue names are brand names and are never translated, which is why they are
 * structure. The offer itself (`badge`) is the venue's own words and is not
 * translated either — a deal written as "2+1" by a Kraków café is "2+1" to
 * everybody who walks past it. `copy.wallet.deals.offers` is index-aligned with
 * this array and *is* translated: that half is the app explaining the offer
 * rather than the venue stating it.
 *
 * ── the venue travels with the offer ─────────────────────────────────────
 *
 * The app's card (`Pay-lez mobile`, `lib/screens/deals_screen.dart`, `_DealCard`)
 * is a **venue** card — the top line is the place, not the offer — and it reads
 * that line off a `Venue` the deals list has already fetched. There is no venue
 * list on this page and there is not going to be one for a seed of nine rows,
 * so the facts the card needs ride on the deal: `category`, `address`, `hours`
 * and the rating pair. Every one of them is a fact about the place rather than
 * about the reader, which is the line this seed will not cross — see `zone`.
 */
export type DealCategory = 'coffee' | 'food' | 'bakery' | 'services' | 'beauty';

/**
 * The chips on the deals strip, in the app's own order.
 *
 * The app's strip is `['All', 'Coffee', 'Food', 'Bakery', 'Services', 'Beauty']`
 * (`deals_screen.dart`, `_cats`) and this is the five that are actually a
 * category — "All" is the absence of a filter and is drawn from
 * `copy.wallet.deals.all` rather than being an entry here, because a venue
 * cannot *be* in it.
 *
 * Index-aligned with `copy.wallet.deals.categories`, like every other list here.
 * These are **not** `BUSINESS_CATEGORIES`: that taxonomy is the one a venue
 * owner files a listing under (café, restaurant, barbershop, beauty, dental,
 * language school, fitness) and this is the one a customer browses offers with.
 * Seven filing cabinets is the wrong strip to put in front of somebody deciding
 * where to have lunch, and the app already chose the shorter one.
 */
export const DEAL_CATEGORIES: DealCategory[] = [
  'coffee',
  'food',
  'bakery',
  'services',
  'beauty',
];

/** What the card says about the place, over and above the offer. */
export interface VenueFacts {
  category: DealCategory;
  city: string;
  /** Street and number. Joined with the category into the app's meta line. */
  address: string;
  /** One decimal, as the app's guide screen writes it: `★ 4.5`. */
  rating: number;
  reviews: number;
  /**
   * The door, as `HH:MM – HH:MM` in `zone`.
   *
   * One span for the whole week rather than seven, because that is what the
   * card renders (`Every day, 07:30 – 19:00` — the app's `everyDaySpan` branch)
   * and a seven-day editor is a listing form's problem, not a seed's.
   */
  hours: string;
  /**
   * The venue's own timezone, and the reason the pill may say "Open now".
   *
   * The pill used to say the window (`Until 15.09`) with a note admitting that
   * the app's own dot means *open now* and that this page had no week to read
   * one off. It has one now — and a week without a zone would be worse than no
   * week at all, because it would answer "is it open?" against whichever clock
   * the reader happens to be standing in. Kraków venues keep Kraków hours to a
   * reader in Tashkent, and `openNow` in `auth/player.ts` evaluates them there.
   */
  zone: string;
}

export interface HotDeal extends VenueFacts {
  id: string;
  venue: string;
  logo: string;
  badge: string;
  /** What claiming costs. Zero is the normal case — see the note above. */
  points: number;
  /** `DD.MM`, the format every date in the wallet is written in. */
  expires: string;
}

/*
 * Nine rows, and the shape of the set is deliberate: every chip on the strip
 * has at least one deal behind it, two of the nine cost points (one of which
 * the seeded balance cannot reach, so the "N more points" branch is on screen
 * rather than only in the code), and one is already in the seeded wallet, so
 * the claimed section is not an empty state on a page whose job is to show what
 * the wallet holds.
 */
export const WALLET_DEALS: HotDeal[] = [
  {
    id: 'd-dubai-2for1',
    venue: 'Dubai Cafe',
    logo: 'D',
    badge: '2+1',
    points: 0,
    expires: '31.08',
    category: 'coffee',
    city: 'Kraków',
    address: 'ul. Karmelicka 12',
    rating: 4.5,
    reviews: 218,
    hours: '07:30 – 19:00',
    zone: 'Europe/Warsaw',
  },
  {
    id: 'd-karma-10',
    venue: 'Karma Coffee',
    logo: 'K',
    badge: '10%',
    points: 0,
    expires: '28.09',
    category: 'coffee',
    city: 'Kraków',
    address: 'ul. Krupnicza 12',
    rating: 4.7,
    reviews: 402,
    hours: '08:00 – 18:00',
    zone: 'Europe/Warsaw',
  },
  {
    id: 'd-sablewski-20',
    venue: 'Sablewski & Para',
    logo: 'S',
    badge: '20%',
    points: 0,
    expires: '15.09',
    category: 'bakery',
    city: 'Kraków',
    address: 'ul. Sławkowska 17',
    rating: 4.6,
    reviews: 1180,
    hours: '06:30 – 20:00',
    zone: 'Europe/Warsaw',
  },
  {
    id: 'd-buczek-3for2',
    venue: 'Buczek Piekarnia',
    logo: 'B',
    badge: '3+1',
    points: 0,
    expires: '22.09',
    category: 'bakery',
    city: 'Kraków',
    address: 'ul. Długa 43',
    rating: 4.4,
    reviews: 640,
    hours: '06:00 – 19:00',
    zone: 'Europe/Warsaw',
  },
  {
    id: 'd-forum-lunch',
    venue: 'Hala Forum',
    logo: 'H',
    badge: '15%',
    points: 50,
    expires: '30.09',
    category: 'food',
    city: 'Kraków',
    address: 'Marii Konopnickiej 28',
    rating: 4.3,
    reviews: 2960,
    hours: '12:00 – 23:00',
    zone: 'Europe/Warsaw',
  },
  {
    id: 'd-hevre-2for1',
    venue: 'Hevre',
    logo: 'H',
    badge: '2+1',
    points: 0,
    expires: '05.10',
    category: 'food',
    city: 'Kraków',
    address: 'ul. Meiselsa 18',
    rating: 4.5,
    reviews: 1740,
    hours: '10:00 – 23:30',
    zone: 'Europe/Warsaw',
  },
  {
    id: 'd-massolit-free',
    venue: 'Massolit Books',
    logo: 'M',
    badge: 'FREE',
    points: 100,
    expires: '12.09',
    category: 'services',
    city: 'Kraków',
    address: 'ul. Felicjanek 4',
    rating: 4.8,
    reviews: 1120,
    hours: '10:00 – 20:00',
    zone: 'Europe/Warsaw',
  },
  {
    id: 'd-sultan-15',
    venue: 'Sultan Barbers',
    logo: 'S',
    badge: '15%',
    points: 0,
    expires: '18.09',
    category: 'services',
    city: 'Warszawa',
    address: 'ul. Chmielna 21',
    rating: 4.6,
    reviews: 512,
    hours: '10:00 – 20:00',
    zone: 'Europe/Warsaw',
  },
  {
    id: 'd-nova-beauty',
    venue: 'Nova Beauty Bar',
    logo: 'N',
    badge: '25%',
    points: 500,
    expires: '08.10',
    category: 'beauty',
    city: 'Kraków',
    address: 'ul. Dietla 60',
    rating: 4.6,
    reviews: 380,
    hours: '09:00 – 20:00',
    zone: 'Europe/Warsaw',
  },
];

/**
 * The wallet mock's own voucher, and the two tabs above it.
 *
 * `used` is deliberately non-zero. A wallet with an empty Used tab is a wallet
 * nobody has spent from, which is the opposite of what the page is arguing.
 *
 * The card is spread off the shelf rather than written out, so the price on the
 * mock and the price in the grid below it are one number. They were two, and
 * they disagreed.
 */
export const VOUCHER_WALLET = {
  active: 3,
  used: 11,
  card: { ...voucherCard('Zalando'), code: 'PLZ-9F3K' },
};

/**
 * Index-aligned with `copy.vouchers.hero.stats`.
 *
 * `money` marks the figure quoted in the reader's currency rather than in a
 * unit — the same flag the Business stats carry, and for the same reason.
 *
 * The first two are counted off the shelf: "eight brands" and "from 100 points"
 * are claims about the catalogue, and a hero that states them as literals is a
 * hero that goes stale the first time a card is added or repriced.
 */
export const VOUCHER_STATS: Array<{ value: number; suffix: string; money?: true }> = [
  { value: VOUCHER_CARDS.length, suffix: '' },
  { value: CHEAPEST_VOUCHER_POINTS, suffix: ' pts' },
  { value: 0, suffix: '', money: true },
];

/** Index-aligned with `copy.vouchers.steps.items`. */
export const VOUCHER_STEP_ICONS: IconName[] = ['leisure', 'gift', 'qr', 'check'];

/** Index-aligned with `copy.vouchers.rules.items`. */
export const VOUCHER_RULE_ICONS: IconName[] = ['ticket', 'qr', 'coin'];

/* ───────────────────────────────────────────────────────────── relocate ── */

/**
 * The nine guidance categories, index-aligned with
 * `copy.relocate.guide.items`.
 *
 * Nine and not eight: this is the list the app ships, and dropping one to make
 * the grid divide evenly would be letting the layout edit the product.
 */
export const RELOCATE_TOPICS: Array<{ icon: IconName; featured?: true }> = [
  { icon: 'map' },
  { icon: 'card' },
  /*
   * Housing and Legal & visa are lifted out of the grid and shown first, at
   * double width.
   *
   * Not a layout preference — it is what the first month is actually about. A
   * nine-up grid of equal tiles says every subject is equally likely to be the
   * one you came for, and for somebody three weeks into a new country that is
   * plainly false: they need somewhere to live and permission to stay, and the
   * other seven can wait a fortnight.
   */
  { icon: 'housing', featured: true },
  /* Healthcare. It borrowed the halal glyph back when that was a shield with a
     tick on it; now that halal is a crescent, the shield is its own name. */
  { icon: 'shield' },
  { icon: 'book', featured: true },
  { icon: 'briefcase' },
  { icon: 'leisure' },
  { icon: 'send' },
  { icon: 'assistant' },
];

/**
 * The service providers behind each subject.
 *
 * **This is seed data and is meant to be replaced.** The real directory is being
 * supplied separately; what is here is a small fictional set in the same world
 * as `ADMIN_SERVICES` — invented venues in the cities the rest of the site
 * already uses — so the interaction, the city filter and the empty states are
 * all real and exercised. Swapping the rows changes nothing else.
 *
 * `languages` is the one attribute that earns its place on a card here, and it
 * is the reason the shape is this and not a paragraph per provider: on a
 * relocation guide, "somebody here speaks Ukrainian" is more of what a reader
 * needs than a sentence of marketing, and it translates for free out of
 * `copy.listing.spokenLanguages` rather than needing a blurb in five languages
 * per row.
 */
export interface RelocateProvider {
  name: string;
  /** Index into `RELOCATE_TOPICS`, and so into `copy.relocate.guide.items`. */
  topic: number;
  city: string;
  languages: SpokenLanguage[];
}

export const RELOCATE_PROVIDERS: RelocateProvider[] = [
  { name: 'Kazimierz Bazar', topic: 0, city: 'Kraków', languages: ['pl', 'en'] },
  { name: 'Dubai Cafe', topic: 0, city: 'Kraków', languages: ['pl', 'en', 'tr'] },
  { name: 'Hala Koszyki', topic: 0, city: 'Warszawa', languages: ['pl', 'en'] },

  { name: 'Wisła Bank — Newcomer Desk', topic: 1, city: 'Kraków', languages: ['pl', 'en', 'uk'] },
  { name: 'Nowa Kasa', topic: 1, city: 'Warszawa', languages: ['pl', 'en', 'ru'] },
  { name: 'Odra Credit Union', topic: 1, city: 'Wrocław', languages: ['pl', 'uk'] },

  { name: 'Podgórze Lettings', topic: 2, city: 'Kraków', languages: ['pl', 'en', 'uk'] },
  { name: 'Mokotów Mieszkania', topic: 2, city: 'Warszawa', languages: ['pl', 'en'] },
  { name: 'Rynek Rentals', topic: 2, city: 'Wrocław', languages: ['pl', 'en', 'ru'] },
  { name: 'Wrzeszcz Housing Help', topic: 2, city: 'Gdańsk', languages: ['pl', 'uk'] },

  { name: 'Klinika Zdrowie', topic: 3, city: 'Kraków', languages: ['pl', 'en', 'uk', 'ru'] },
  { name: 'Centrum Medyczne Wisła', topic: 3, city: 'Warszawa', languages: ['pl', 'en'] },
  { name: 'Poznań Family Practice', topic: 3, city: 'Poznań', languages: ['pl', 'en'] },

  { name: 'Kancelaria Migracja', topic: 4, city: 'Kraków', languages: ['pl', 'en', 'uk', 'ru'] },
  { name: 'Warsaw Residency Advisors', topic: 4, city: 'Warszawa', languages: ['pl', 'en', 'uz'] },
  { name: 'Wrocław Permit Office Help', topic: 4, city: 'Wrocław', languages: ['pl', 'uk'] },

  { name: 'Praca Start', topic: 5, city: 'Kraków', languages: ['pl', 'en', 'uk'] },
  { name: 'Gdańsk Jobs Point', topic: 5, city: 'Gdańsk', languages: ['pl', 'en'] },

  { name: 'Lingua Nova', topic: 6, city: 'Wrocław', languages: ['pl', 'en', 'ru'] },
  { name: 'Szkoła Otwarta', topic: 6, city: 'Kraków', languages: ['pl', 'en', 'uk'] },

  { name: 'MPK Info Point', topic: 7, city: 'Kraków', languages: ['pl', 'en'] },
  { name: 'Poznań Transport Desk', topic: 7, city: 'Poznań', languages: ['pl', 'en', 'uk'] },

  { name: 'Dom Kultury Podgórze', topic: 8, city: 'Kraków', languages: ['pl', 'en', 'uk'] },
  { name: 'Warszawa Welcome Point', topic: 8, city: 'Warszawa', languages: ['pl', 'en', 'ru', 'uz'] },
];

/**
 * The cities the filter offers, in the order it offers them.
 *
 * Derived rather than declared: a city in the list with nothing under it is a
 * filter that silently returns nothing, and a provider in a city the filter
 * does not offer is a provider nobody can reach. Deriving makes both impossible.
 */
export const RELOCATE_CITIES = [
  ...new Set(RELOCATE_PROVIDERS.map((provider) => provider.city)),
].sort((a, b) => a.localeCompare(b));

/**
 * The shortcut pairs above the converter — one tap, both sides set.
 *
 * Currency codes now, not language codes. The card used to offer the five
 * currencies the *site* is priced in, which is a much smaller world than the
 * one it is for: somebody in Kraków sending money to Tashkent was offered
 * neither end of that. It reads the full table in `i18n/fx.ts` instead, and
 * what is left here is the handful of corridors worth putting one tap away.
 *
 * The reader's own currency leads regardless — see the shortcut list in
 * `relocate.tsx`, which prepends it and drops whatever duplicates it. These are
 * the ones that follow.
 *
 * Pairs, not corridors in the money-transfer sense: the card converts and
 * nothing else. Paylez does not send, receive or hold money, so there is no
 * fee, no arrival time and no provider to compare — which is exactly why it can
 * quote the mid-market rate with nothing on top of it.
 */
export const RELOCATE_PAIRS: Array<[FxCode, FxCode]> = [
  ['PLN', 'UAH'],
  ['PLN', 'UZS'],
  ['EUR', 'PLN'],
  ['GBP', 'PLN'],
  ['PLN', 'KZT'],
  ['USD', 'TRY'],
];

/**
 * What the rate card converts.
 *
 * The one amount on the site that is **not** in euros: it is a round hundred of
 * whatever the reader's own currency is. A converter is read as "if I have a
 * hundred, what is that worth", and converting 100 EUR into the reader's
 * currency first would put £85 in the input — a number nobody types, and one
 * that makes the rate underneath harder rather than easier to check.
 */
export const RELOCATE_AMOUNT = 100;

/**
 * The countries the app carries local news and guidance for.
 *
 * Flag emoji are the one sanctioned exception to the two-colour rule (see
 * CLAUDE.md), and they are the only reason this list reads as a map rather than
 * as a paragraph of country names.
 */
export const RELOCATE_COUNTRIES = [
  { flag: '🇵🇱', code: 'PL' },
  { flag: '🇩🇪', code: 'DE' },
  { flag: '🇺🇿', code: 'UZ' },
  { flag: '🇳🇱', code: 'NL' },
  { flag: '🇫🇷', code: 'FR' },
  { flag: '🇮🇹', code: 'IT' },
  { flag: '🇪🇸', code: 'ES' },
  { flag: '🇬🇧', code: 'GB' },
  { flag: '🇨🇿', code: 'CZ' },
  { flag: '🇦🇹', code: 'AT' },
  { flag: '🇧🇪', code: 'BE' },
  { flag: '🇨🇭', code: 'CH' },
  { flag: '🇱🇻', code: 'LV' },
  { flag: '🇸🇪', code: 'SE' },
];

/** Index-aligned with `copy.relocate.hero.stats`. */
export const RELOCATE_STATS = [
  { value: 9, suffix: '' },
  { value: 14, suffix: '' },
  { value: 0, suffix: '%' },
];
