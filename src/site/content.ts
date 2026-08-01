/**
 * Structure only — no copy.
 *
 * Everything a translator would never touch (icon names, anchors, the numbers
 * behind the count-up stats) lives here; every string lives in `i18n/`. The
 * arrays are index-aligned with their dictionary counterparts, so adding a
 * service or a feature means adding one entry in each place and the compiler
 * catches the half-done version.
 */

import type { IconName } from './icons';

/**
 * Assistant is deliberately absent: it is the floating button, not a nav item.
 *
 * `#/l-earn` is a route (see `router.ts`); every other href is a section on the
 * landing page, which is why they work unchanged from either page.
 */
export const NAV_ITEMS: Array<{ href: string; icon: IconName }> = [
  { href: '#top', icon: 'home' },
  { href: '#/l-earn', icon: 'coin' },
  { href: '#/analytics', icon: 'bars' },
  { href: '#/b2b', icon: 'briefcase' },
  { href: '#/vouchers', icon: 'ticket' },
  { href: '#/relocate', icon: 'send' },
];

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

export const VALUE_CARD = { brand: 'zalando', logo: 'Z' };

export const FOOTER_LINKS: string[][] = [
  ['#value', '#proof', '#guide', '#features'],
  ['#top', '#top', '#proof', '#guide'],
];

export const CONTACT_EMAIL = 'support@paylez.com';

/* ─────────────────────────────────────────────────────────────── l-earn ── */

/** Index-aligned with `copy.learn.hero.stats`. */
export const LEARN_STATS = [
  { value: 100, suffix: ' pts' },
  { value: 7, suffix: '-day' },
  { value: 500, suffix: ' pts' },
];

/** Index-aligned with `copy.learn.steps.items`. */
export const LEARN_STEP_ICONS: IconName[] = ['leisure', 'check', 'trophy', 'gift'];

/**
 * Index-aligned with `copy.learn.games.items`.
 *
 * The three games are the ones the product actually ships — Capital Game, Flag
 * Game, and the Poland quiz — so the names are fixed and only their blurbs are
 * translated.
 */
export const LEARN_GAME_ICONS: IconName[] = ['map', 'flag', 'book'];

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

/** The sample partner the dashboard preview is scoped to. */
export const ANALYTICS_SERVICE = { id: 'PLZ-4417-KRK', logo: 'M' };

/* ────────────────────────────────────────────────────────────────── b2b ── */

/**
 * Index-aligned with `copy.b2b.hero.stats`.
 *
 * `money` marks a figure that is quoted in the reader's currency rather than in
 * a unit. Its value is euros like every other amount in this file — the symbol,
 * the conversion and which side of the number it sits on all come from
 * `i18n/currency.ts`, because the page prices in whatever the language does.
 */
export const B2B_STATS: Array<{ value: number; suffix: string; money?: true }> = [
  { value: 3, suffix: '×' },
  { value: 0, suffix: '', money: true },
  { value: 48, suffix: 'h' },
];

/** Index-aligned with `copy.b2b.why.items`. Four, not three: the pitch is that
 *  four systems most operators buy separately run off one customer record, and
 *  a fourth claim needs a fourth card to stand in. */
export const B2B_WHY_ICONS: IconName[] = ['coin', 'assistant', 'qr', 'briefcase'];

/* ── the owner's dashboard ─────────────────────────────────────────────────
 *
 * The mock on `#/b2b` is the console a venue owner logs into, not the partner
 * analytics screen `#/analytics` previews — same product, different seat. Every
 * figure below is what one four-site operator saw in a month, so the numbers
 * have to agree with each other: the tile totals are the chart's columns summed,
 * and the headline revenue is what the attributed visits spent.
 */

/** The headline strip. Euros; converted at render. */
export const B2B_DASH_HEAD = { customers: 1240, revenue: 38600 };

/**
 * The four tiles, index-aligned with `copy.b2b.dashboard.tiles`.
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
export const B2B_DASH_TILES: Array<{
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
export const B2B_DASH_CHART: Array<{ visits: number; redeemed: number }> = [
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
 * `copy.b2b.dashboard.live.rows`.
 *
 * `paused` is on one of the three deliberately. Three green rows is a product
 * screenshot; one paused row is a screen someone actually works in.
 */
export const B2B_DASH_LIVE: Array<{
  icon: IconName;
  stat: number;
  suffix: string;
  paused?: true;
}> = [
  { icon: 'trophy', stat: 1840, suffix: '' },
  { icon: 'ticket', stat: 612, suffix: '' },
  { icon: 'send', stat: 38, suffix: '%', paused: true },
];

/** Index-aligned with `copy.b2b.rollout.items`. */
export const B2B_ROLLOUT_ICONS: IconName[] = ['send', 'map', 'trophy', 'qr'];

/**
 * The three platform pillars, index-aligned with `copy.b2b.pillars.items`.
 *
 * `visual` names which of the three console mocks the pillar is illustrated
 * with. The component switches on it rather than on the index, so reordering
 * the pillars in the dictionary cannot silently swap the pictures.
 */
export const B2B_PILLARS: Array<{
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
export const B2B_SITES = [
  { name: 'Kraków · Kazimierz', spend: 92, repeat: 61 },
  { name: 'Warszawa · Mokotów', spend: 74, repeat: 48 },
  { name: 'Wrocław · Rynek', spend: 58, repeat: 66 },
  { name: 'Gdańsk · Wrzeszcz', spend: 41, repeat: 39 },
];

/** The campaign mock's audience chips, index-aligned with `copy.b2b.pillars.audiences`. */
export const B2B_AUDIENCE_SIZES = [1840, 620, 2310, 480];

/**
 * Pricing, index-aligned with `copy.b2b.pricing.tiers`.
 *
 * `price` is in euros and is converted into the reader's currency at render,
 * rounded to a step that currency actually uses — a price tag reading £126.65
 * is an exchange-rate artefact, and nobody chose it. It is null on the tier that
 * is quoted rather than listed: a multi-site rollout with POS integration does
 * not have a shelf price, and inventing one would be the only dishonest number
 * on the page.
 */
export const B2B_TIERS: Array<{ price: number | null; featured?: boolean }> = [
  { price: 0 },
  { price: 149, featured: true },
  { price: null },
];

/** Index-aligned with `copy.b2b.operators.items`. */
export const B2B_OPERATOR_INITIALS = ['SS', 'HC', 'PY', 'NB'];

/** Separate from `CONTACT_EMAIL`: an operator asking about a rollout is not a
 *  support ticket, and the two go to different people. */
export const SALES_EMAIL = 'sales@paylez.com';

/* ───────────────────────────────────────────────────────────── vouchers ── */

/**
 * The gift cards the app actually carries, in the order the wallet lists them.
 *
 * Brand names are never translated, which is why they are structure and not
 * copy. `points` is the redemption cost and `left` is what remains of this
 * month's allocation — a voucher page that showed unlimited stock would be
 * describing a coupon, and the scarcity is the reason anyone opens the app on
 * the first of the month.
 */
export const VOUCHER_CARDS: Array<{
  brand: string;
  logo: string;
  points: number;
  left: number;
  of: number;
}> = [
  { brand: 'Media Expert', logo: 'M', points: 100, left: 10, of: 10 },
  { brand: 'Zalando', logo: 'Z', points: 500, left: 6, of: 10 },
  { brand: 'Douglas', logo: 'D', points: 300, left: 8, of: 10 },
  { brand: 'Allegro', logo: 'A', points: 500, left: 3, of: 10 },
  { brand: 'Biedronka', logo: 'B', points: 100, left: 10, of: 10 },
  { brand: 'Bolt', logo: 'B', points: 200, left: 7, of: 10 },
  { brand: 'FlixBus', logo: 'F', points: 400, left: 5, of: 10 },
  { brand: 'Hebe', logo: 'H', points: 100, left: 9, of: 10 },
];

/**
 * The wallet mock's own voucher, and the two tabs above it.
 *
 * `used` is deliberately non-zero. A wallet with an empty Used tab is a wallet
 * nobody has spent from, which is the opposite of what the page is arguing.
 */
export const VOUCHER_WALLET = {
  active: 3,
  used: 11,
  card: { brand: 'Zalando', logo: 'Z', points: 500, code: 'PLZ-9F3K' },
};

/**
 * Index-aligned with `copy.vouchers.hero.stats`.
 *
 * `money` marks the figure quoted in the reader's currency rather than in a
 * unit — the same flag the B2B stats carry, and for the same reason.
 */
export const VOUCHER_STATS: Array<{ value: number; suffix: string; money?: true }> = [
  { value: 8, suffix: '' },
  { value: 100, suffix: ' pts' },
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
export const RELOCATE_TOPIC_ICONS: IconName[] = [
  'map',
  'card',
  'housing',
  'halal',
  'book',
  'briefcase',
  'leisure',
  'send',
  'assistant',
];

/**
 * The corridors the rate card offers, as language codes.
 *
 * Language codes rather than currency codes because the currencies are already
 * defined per language in `i18n/currency.ts`, and every rate here is derived
 * from that one table — the card cannot drift from the prices on the rest of
 * the site. The reader's own currency is filtered out at render: a card
 * offering to convert złoty into złoty is a card nobody asked for.
 */
export const RELOCATE_CORRIDORS = ['uz', 'uk', 'pl', 'ru', 'en'] as const;

/**
 * What the rate card converts.
 *
 * The one amount on the site that is **not** in euros: it is a round hundred of
 * whatever the reader's own currency is. A converter is read as "if I send a
 * hundred, what arrives", and converting 100 EUR into the reader's currency
 * first would put £85 in the send box — a number nobody types, and one that
 * makes the rate underneath harder rather than easier to check.
 */
export const RELOCATE_SEND = 100;

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
