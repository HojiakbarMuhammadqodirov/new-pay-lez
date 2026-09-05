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

/*
 * There was a `VOUCHER_CARDS` shelf here — eight brands with a points price, a
 * face value in euros and a monthly allocation — and four things across the
 * site were derived from it: the value card on Home, the figure the L-Earn FAQ
 * quoted, the wallet's own catalogue, and the two Vouchers hero stats.
 *
 * Every one of those numbers was written in this file. There is a real shelf
 * now — `gift_card_stock` on the server, read through `GET /v1/gift-cards` —
 * and it is the only thing that can say what a card costs, what it is worth and
 * whether there are any left. So the catalogue screens read it (`api/wallet.ts`
 * carries the shapes), and the figures that had no source anywhere are gone
 * rather than estimated: a price quoted off a table nobody stocked is a price
 * somebody will hold us to.
 *
 * The shelf is empty until an operator stocks it, and that is a state the
 * screens render as itself. See the note on empty states in `wallet.tsx`.
 */

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
  /*
   * A spark, a coin and a trophy.
   *
   * These were taken off for a version, on the argument that three game glyphs
   * make a price list read as a shop screen. That argument was answering a
   * question nobody had asked: this product **is** a game, the section sells
   * energy and points and a mark that goes beside your name, and the arcade
   * reading is the one it wants. They are back, and the card is built around
   * them rather than apologising for them.
   */
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
export const SUB_ROWS: Array<{
  kind: SubRowKind;
  values: [SubValue, SubValue, SubValue];
  /**
   * Set on the one row where a *smaller* figure is the better one.
   *
   * The card marks every cell a paid tier improves on the free column
   * (`subBeatsFree`), which is a comparison and therefore needs a direction.
   * Twelve of the thirteen rows climb; the refill clock comes down. Writing the
   * direction on the row rather than special-casing an index in the component
   * is what stops the next lower-is-better row — a cooldown, a fee — from
   * quietly rendering as the worst cell on the most expensive card.
   */
  lower?: true;
}> = [
  /* `daily_energy` — the tank, which is also finished rounds a day from a full
     one before the clock gives anything back. These three moved from 3/5/7 when
     energy started being spent on every round rather than only on a lost one,
     and this table was left behind for a day: the page advertised a smaller
     free tier than the product was giving away. `npm run verify` now checks the
     free column against `MAX_ENERGY`, which is the only one of the three the
     front end can see. */
  { kind: 'number', values: [4, 6, 10] },
  /* `energy_regen_minutes`, and **in minutes** rather than hours. A faster refill
     is worth more than a bigger pool to the player who empties it at nine in the
     morning, which is what the server's own note says it is for — and the clocks
     got fast enough that hours stopped being the unit: half an hour on Premium
     is "0.5" in a column of whole numbers, which reads as a rounding error
     rather than as the best row on the table. */
  { kind: 'number', values: [120, 60, 30], lower: true },
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

/** The tank, and the clock that refills it. The first two rows of the strip. */
const SUB_TANK_ROW = 0;
const SUB_REFILL_ROW = 1;

/**
 * Finished rounds a plan buys in a day, starting from a full tank.
 *
 * `daily_energy + 1440 / energy_regen_minutes` — the tank you woke up with plus
 * everything the clock hands back over the day — which is the arithmetic the
 * root `CLAUDE.md` states and the server's `CONFIG.points` implements. It comes
 * out at 16 / 30 / 58, and that spread is the reason anybody pays: it is the
 * only figure on this card that says what a *day* is worth rather than what one
 * column of a table holds.
 *
 * It is **derived and never typed**, for the reason the whole file is: the two
 * rows it multiplies are already on the page directly above it, and a headline
 * that stopped agreeing with the two figures under it would be worse than no
 * headline. Change the tank or the clock and this moves with them.
 *
 * The floor matters. A refill that does not divide the day evenly hands back a
 * whole energy only when the clock reaches it, so a fraction of one is a round
 * that cannot be played — and rounding it up would advertise a round that is
 * not there, which is the same failure as a seeded balance the ledger has no
 * entry for.
 */
export function subRoundsPerDay(planIndex: number): number {
  const tank = SUB_ROWS[SUB_TANK_ROW].values[planIndex] as number;
  const refill = SUB_ROWS[SUB_REFILL_ROW].values[planIndex] as number;
  return tank + Math.floor((24 * 60) / refill);
}

/**
 * Whether a paid tier's cell is an improvement on the free one beside it.
 *
 * The card lights every cell this returns `true` for, and that mark is the
 * whole of what the section was missing: three columns of identically-weighted
 * small print gave a reader nothing to *see*, so the case for paying had to be
 * read row by row and reconstructed. Lit against unlit, the free column is
 * plain and the Premium one is almost entirely accent, and the shape of the
 * offer arrives before a single figure is read.
 *
 * It is a comparison of the table against itself rather than a judgement typed
 * into it — nothing here can claim a perk the entitlement table does not grant,
 * which is the same rule the prices are held to. `null` is the no-ceiling
 * sentinel and beats every number; `lower` inverts the test for the one row
 * where less is more.
 */
export function subBeatsFree(rowIndex: number, planIndex: number): boolean {
  if (planIndex === 0) return false;
  const row = SUB_ROWS[rowIndex];
  const free = row.values[0];
  const mine = row.values[planIndex];
  /* Unlimited beats anything, including unlimited on the free column — which
     no row has, and which would be a table where the free tier could not be
     improved on rather than a comparison this function got wrong. */
  if (mine === null) return free !== null;
  if (free === null) return false;
  return row.lower ? mine < free : mine > free;
}

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
  /** The local-knowledge quiz. **Which** country it asks about is the profile's,
   *  not this id's — see `quizBankFor`. */
  | 'local'
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
 * **There is no mistake allowance any more, and no column for one.** A quiz
 * ran until the second wrong answer, which closed a round the player had paid
 * energy for and left three questions they never saw — a fail state on a game
 * whose whole promise is "answer five things". Every round now runs to the
 * fifth question; a wrong answer is worth nothing and nothing worse than
 * nothing. The one game that can still end early is the flight, and what ends
 * it is a crash, not a tally.
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
  { id: 'memory', kind: 'memory', icon: 'cards', questions: 6, seconds: 0, perCorrect: 6 },
  /*
   * The arcade round, and the only one that is played rather than answered.
   * `questions` is gaps to clear, `perCorrect` is points per gap,
   * one crash ends it, and `seconds` is unused —
   * the round lasts as long as you do.
   *
   * Five gaps to bank, matching the quizzes' five questions. Unlike a quiz the
   * run does not stop there — every gap past five pays another **half** point,
   * which is what lets the scroll speed climb without the payout running away
   * with it — but the payout does stop:
   * `MAX_FLIGHT_POINTS` in `auth/player.ts` caps a flight at 20, which is twice
   * a clean quiz and the same order as everything else in the set. At two a gap
   * with no ceiling at all, which is what this row said before, one lucky run
   * out-earned four days of the rest of the page — a jackpot rather than a
   * bound. Skill is still paid for past the bank line; it stops being paid at
   * twenty.
   */
  { id: 'flight', kind: 'flight', icon: 'bird', questions: 5, seconds: 0, perCorrect: 0.5 },
  { id: 'flag', kind: 'flag', icon: 'flag', questions: 5, seconds: 6, perCorrect: 1 },
  { id: 'capital', kind: 'capital', icon: 'map', questions: 5, seconds: 6, perCorrect: 1 },
  { id: 'brain', kind: 'text', icon: 'book', questions: 5, seconds: 12, perCorrect: 1 },
  /*
   * The local-knowledge quiz, and the row that is **not named after a country**.
   *
   * It used to be `poland`, which was true while Poland was the only bank there
   * was. A second one arrived and the id became a lie: the card asks about
   * wherever the profile says this person lives, and an id that says otherwise
   * is exactly the trap `occupation` was renamed to avoid one screen over. The
   * bank comes from `quizBankFor`, the name from `copy.games.localQuiz`.
   */
  { id: 'local', kind: 'text', icon: 'housing', questions: 5, seconds: 8, perCorrect: 1 },
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
  { id: 'word', kind: 'word', icon: 'letters', questions: 5, seconds: 0, perCorrect: 5 },
  { id: 'wordLocal', kind: 'word', icon: 'letters', questions: 5, seconds: 0, perCorrect: 5 },
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

/*
 * There were six seeded tables here, and every figure on the console came out
 * of them: `PLATFORM` (the four headline counts), `ADMIN_SERVICES` (five
 * venues, each carrying a `scale` the whole analytics view was multiplied by),
 * `ADMIN_DEALS`, and three tables of redemptions, scans and vouchers with
 * invented customer codes in them.
 *
 * They are gone, and what replaced them is not a smaller seed. The console asks
 * the server: `GET /v1/admin/overview` for the counts, `GET /v1/admin/venues`
 * for the venues, `GET /v1/deals` and `GET /v1/gift-cards` for what the app is
 * showing. Where no operator-facing endpoint exists the figure is **not shown
 * at all** rather than derived from a number typed beside a name —
 * `adminMetrics.ts` carries that reasoning at length, and the `measured` flag
 * it returns is what every panel branches on.
 *
 * What stays below is structure: which icon sits on which tab, and in which
 * order. None of it is data about anybody.
 */

/** The console's own tabs, and the analytics view's. Icons are structure. */
export const ADMIN_TABS: IconName[] = ['briefcase', 'ticket', 'people', 'bars', 'send'];
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

/*
 * Index-aligned with `copy.learn.hero.stats`, which now reads
 * ['Best round', 'Earns a freeze'].
 *
 * The first was 100 under the label "per game win", and both halves of that
 * were wrong at once: nothing pays 100 a round any more, and the biggest round
 * on the page is a full flight at `MAX_FLIGHT_POINTS`. It is written here
 * rather than imported from `auth/player.ts` because this file is the
 * marketing model and importing the app's scoring into it would make the two
 * one thing — but it is the same number, and it is the number to change if the
 * ceiling moves.
 *
 * **There were three.** The third was "buys a voucher", read off the shelf
 * `content.ts` used to carry, and there is no shelf here to read: what a
 * voucher costs is `points_cost` on `gift_card_stock`, which is a row on the
 * server and may be nothing at all until an operator stocks one. A hero stat
 * cannot go and ask, and a hero stat that guesses is the thing this whole pass
 * removed. Both figures left are properties of the *rules* — what a round can
 * pay and what a week of streak earns — which this file does own.
 */
export const LEARN_STATS = [
  { value: 20, suffix: ' pts' },
  { value: 7, suffix: '-day' },
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
 * The board used to be here too: `WALLET_DEALS`, nine hot deals at nine invented
 * Kraków venues, each carrying a `VenueFacts` block — an address, a rating and
 * a review count, an opening span and a timezone — and `DEAL_CATEGORIES`, the
 * five-chip strip they were filed under.
 *
 * The board is `GET /v1/deals` now (`api/wallet.ts` carries the shape, checked
 * against a running server). Three things did not survive the move, and all
 * three are absences rather than regressions:
 *
 * - **the chips are the data's.** A deal's category on the server is the
 *   *venue's* taxonomy — `cafe`, `bakery`, `hotels` — not the customer strip
 *   invented here, so the strip is built from the categories the fetched rows
 *   actually carry and labelled from `copy.listing.categories` where the id is
 *   one this site knows. A chip that can only ever be empty is not drawn.
 * - **there is no "Open now".** It was answered on the venue's own clock, which
 *   needed a timezone, and nothing the server returns carries one. A pill that
 *   answered it on the *reader's* clock would be worse than no pill.
 * - **there is no address or rating on a deal card.** `GET /v1/deals` projects
 *   the offer, not the venue, and joining a second request onto every card to
 *   decorate it is not worth a line of grey text.
 *
 * `VOUCHER_WALLET` and `VOUCHER_STATS` went with the shelf above: a mock wallet
 * holding "3 active · 11 used" and a hero counting eight partner brands were
 * both claims about stock nobody has.
 */

/** Index-aligned with `copy.vouchers.steps.items`. */
export const VOUCHER_STEP_ICONS: IconName[] = ['leisure', 'gift', 'qr', 'check'];

/** Index-aligned with `copy.vouchers.rules.items`. */
export const VOUCHER_RULE_ICONS: IconName[] = ['ticket', 'qr', 'coin'];

/* ───────────────────────────────────────────────────────────── relocate ── */

/**
 * A guidance category's icon, keyed by the category key the server sends.
 *
 * The subject list itself is **not** here any more. It was: nine
 * `RELOCATE_TOPICS` with nine names and blurbs in each of five dictionaries,
 * and under them twenty-four invented businesses. All of it read
 * `GET /v1/guide/categories` and `GET /v1/guide/services` now — see
 * `api/guide.ts` for what that replaced and why.
 *
 * What stays local is the drawing. `guidance_categories.icon` holds the old
 * app's icon names, which are not this site's, and mapping them here rather
 * than shipping the export's glyphs keeps the section inside the one icon set
 * the rest of the page uses. The map is by **category key**, not by the export's
 * icon name, because the key is the stable thing — an editor may restyle a
 * category, and the reader's answer to "which subject is this" must not move
 * when they do.
 *
 * An unknown key gets the pin rather than nothing. The icon is decoration and
 * the server's translated title is the information, so a subject we have no
 * glyph for still has to render — the alternative is a guide that hides a
 * category because we did not recognise its name.
 */
export const GUIDE_ICON_FALLBACK: IconName = 'map';

export const GUIDE_ICONS: Record<string, IconName> = {
  places: 'map',
  food: 'map',
  shopping: 'map',
  banking: 'card',
  finance: 'card',
  banking_finance: 'card',
  housing: 'housing',
  accommodation: 'housing',
  /* Healthcare. It borrowed the halal glyph back when that was a shield with a
     tick on it; now that halal is a crescent, the shield is its own name. */
  health: 'shield',
  healthcare: 'shield',
  medical: 'shield',
  legal: 'book',
  visa: 'book',
  legal_visa: 'book',
  documents: 'book',
  employment: 'briefcase',
  jobs: 'briefcase',
  work: 'briefcase',
  education: 'leisure',
  schools: 'leisure',
  language: 'leisure',
  transport: 'send',
  transportation: 'send',
  culture: 'assistant',
  community: 'assistant',
  integration: 'assistant',
};

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
