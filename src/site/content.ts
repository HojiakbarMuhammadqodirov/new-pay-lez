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
import type { FxCode } from './i18n/fx';
import { PATHS } from './router';

/**
 * The header's items, keyed rather than indexed.
 *
 * They used to be an array index-aligned with `copy.nav`, which worked while
 * every visitor saw the same six in the same order. A business owner now sees a
 * different set *in a different order* (B2B first, Home fourth, no Relocate),
 * and index alignment cannot survive that — the first reordering would have
 * captioned B2B "Vouchers". Keys cost one lookup and cannot shear.
 *
 * Assistant is deliberately absent: it is the floating dock, not a nav item.
 */
export type NavKey =
  | 'home'
  | 'learn'
  | 'analytics'
  | 'b2b'
  | 'wallet'
  | 'contact'
  | 'relocate';

export const NAV_HREFS: Record<NavKey, string> = {
  home: PATHS.landing,
  learn: PATHS.learn,
  analytics: PATHS.analytics,
  b2b: PATHS.b2b,
  /* "Wallet" in the header, `#/vouchers` in the address bar. The page is the
     same one; the word a visitor reads is what changed. */
  wallet: PATHS.vouchers,
  contact: PATHS.contact,
  relocate: PATHS.relocate,
};

/** What everyone else sees, in order. */
export const NAV_ORDER: NavKey[] = [
  'home',
  'learn',
  'analytics',
  'b2b',
  'wallet',
  'contact',
  'relocate',
];

/**
 * What a signed-in venue owner sees.
 *
 * Their own tools first and the consumer site last, which is the order they use
 * it in — an owner opens the header to reach B2B and Analytics, not to browse.
 * Relocate is absent rather than reordered: it is a guide for someone who has
 * just moved country, and an operator running a Kraków café is not that reader.
 */
export const NAV_ORDER_BUSINESS: NavKey[] = [
  'b2b',
  'analytics',
  'learn',
  'home',
  'wallet',
  'contact',
];

/** An individual has no business with the two pages that sell to a venue. */
export const NAV_HIDDEN_INDIVIDUAL: NavKey[] = ['analytics', 'b2b'];

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

/**
 * The gift card the L-Earn FAQ quotes, in euros like every other amount here.
 *
 * The figure the answer was written against is 50 zł — what a Polish reader
 * sees — and 11.63 is that in the base unit, from which every other language
 * prices it. Named rather than inlined at the call site precisely because 11.63
 * is not a number anyone chose; 50 is.
 */
export const LEARN_VOUCHER_EUR = 11.63;

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

export const CONTACT_EMAIL = 'support@paylez.com';

/**
 * The channels the footer and the Contact page both link to.
 *
 * One table rather than two: the pair appears in the footer and again on
 * `#/contact`, and a social link that is right in one place and stale in the
 * other is the usual way these rot.
 */
export const SOCIALS: Array<{ id: 'youtube' | 'instagram'; href: string; handle: string }> = [
  { id: 'youtube', href: 'https://www.youtube.com/@paylez', handle: '@paylez' },
  { id: 'instagram', href: 'https://www.instagram.com/pay_lez', handle: '@pay_lez' },
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

/**
 * The Contact page's four channels, index-aligned with
 * `copy.contact.channels.items`.
 *
 * Icons only. The two mail destinations are built at render from
 * `CONTACT_EMAIL` and `SALES_EMAIL`, and the two social ones from `SOCIALS`, so
 * an address lives in exactly one place on the site.
 */
export const CONTACT_CHANNEL_ICONS: IconName[] = [
  'assistant',
  'briefcase',
  'youtube',
  'instagram',
];

/** Index-aligned with `copy.contact.hero.stats`. */
export const CONTACT_STATS = [
  { value: 1, suffix: ' day' },
  { value: 5, suffix: '' },
  { value: 4, suffix: '' },
];

/* ───────────────────────────────────────────────────────────────── games ── */

/**
 * The seven games, index-aligned with `copy.games.names`.
 *
 * Rules per game rather than one shared rule, because the old app varied them
 * and the variation is the point: the flag round is quick and worth more, the
 * Poland round is slower and worth less because it is the one you are meant to
 * think about. `kind` is what the round generator switches on.
 *
 * `perCorrect` is the score per right answer; `allowedMistakes` is how many you
 * may get wrong and still bank the round.
 *
 * **The last three read those columns differently rather than making them
 * optional**, so this stays one homogeneous table instead of a union of five
 * object shapes that every consumer would have to narrow. What each column means
 * per kind is stated on the row.
 *
 * Where the questions come from changed with this table: the four quiz rounds no
 * longer read a handful of hardcoded items out of the dictionaries. They draw
 * from the generated banks in `games/data/` — 2102 general questions, 98 on
 * Poland, 196 flags and 196 capitals — through the no-repeat bag in
 * `games/bag.ts`, so a bank is exhausted before anything in it repeats.
 */
export const GAMES: Array<{
  id: 'brain' | 'flag' | 'capital' | 'poland' | 'flight' | 'memory' | 'word';
  kind: 'text' | 'flag' | 'capital' | 'flight' | 'memory' | 'word';
  icon: IconName;
  questions: number;
  seconds: number;
  perCorrect: number;
  allowedMistakes: number;
}> = [
  { id: 'brain', kind: 'text', icon: 'book', questions: 5, seconds: 12, perCorrect: 5, allowedMistakes: 1 },
  { id: 'flag', kind: 'flag', icon: 'flag', questions: 5, seconds: 6, perCorrect: 2, allowedMistakes: 1 },
  { id: 'capital', kind: 'capital', icon: 'map', questions: 5, seconds: 6, perCorrect: 2, allowedMistakes: 1 },
  { id: 'poland', kind: 'text', icon: 'housing', questions: 5, seconds: 8, perCorrect: 1, allowedMistakes: 1 },
  /*
   * The arcade round, and the only one that is played rather than answered.
   * `questions` is gaps to clear, `perCorrect` is points per gap,
   * `allowedMistakes` is 0 because one crash ends it, and `seconds` is unused —
   * the round lasts as long as you do.
   *
   * Five gaps to bank, matching the quizzes' five questions, so a round is worth
   * the same wherever you spend it. Unlike a quiz the run does not stop there —
   * every gap past five pays another two, so a good flight can out-earn any
   * round on the page. That is deliberate: it is the only game here where the
   * ceiling is skill rather than the question count.
   */
  { id: 'flight', kind: 'flight', icon: 'bird', questions: 5, seconds: 0, perCorrect: 2, allowedMistakes: 0 },
  /*
   * Memory Match. `questions` is pairs on the board, `perCorrect` is points per
   * pair found, and both of the other two are zero and mean it: there is no
   * clock and there is no fail state.
   *
   * That is the one accessibility decision in the set and it is deliberate —
   * every other game here is timed, and a game that rewards patience rather than
   * speed is the one a non-native reader or an older player can actually win.
   * The real scoring is `memoryPoints` in `auth/player.ts`: the base is
   * guaranteed and the bonus is on how few moves it took.
   */
  { id: 'memory', kind: 'memory', icon: 'cards', questions: 6, seconds: 0, perCorrect: 6, allowedMistakes: 0 },
  /*
   * Word Builder. `questions` is words in the round and `perCorrect` is the base
   * a solved word pays before its tier, first-try and speed bonuses — see
   * `wordPoints`. `seconds` is 0 because the clock scores rather than limits:
   * running long costs the speed bonus and nothing else.
   */
  { id: 'word', kind: 'word', icon: 'letters', questions: 5, seconds: 0, perCorrect: 5, allowedMistakes: 0 },
];

/** The board's two orderings, index-aligned with `copy.games.boardTabs`. */
export const BOARD_TABS = ['correct', 'points'] as const;

/**
 * The sample leaderboard.
 *
 * Player codes rather than names, exactly as the old app showed them — a public
 * board with real names on it is a different product with a different privacy
 * question, and the codes are what the screenshots have.
 */
export const GAME_BOARD = [
  { code: 'PY7178', correct: 21, points: 96, streak: 6 },
  { code: 'PY6722', correct: 17, points: 74, streak: 4 },
  { code: 'PY6307', correct: 10, points: 61, streak: 2 },
  { code: 'PY5940', correct: 9, points: 48, streak: 5 },
  { code: 'PY5511', correct: 7, points: 35, streak: 1 },
];

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
  name: string;
  /** Index into `BUSINESS_CATEGORIES`, and so into `copy.business.categories`. */
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
export const ADMIN_TABS: IconName[] = ['briefcase', 'ticket', 'assistant', 'bars'];
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

/* ────────────────────────────────────────────────────────────── business ── */

/**
 * Business categories and their subcategories, as ids.
 *
 * The taxonomy is the partner prototype's. Ids here, names in the dictionaries:
 * "Café" and "Kawiarnia" are the same category, and a listing that stored the
 * word would change category when the reader changed language.
 *
 * `subs` is a count rather than a list because the subcategory names are copy
 * too — `copy.business.subcategories[i]` is the array for category `i`, and this
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

/** Index-aligned with `copy.business.countries`. */
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
 * `copy.business.spokenLanguages`.
 *
 * Six, where the site itself has five: Turkish is not a language this site is
 * translated into, but it is one a Kraków barber may well speak, and the
 * listing describes the venue rather than the reader.
 */
export const SPOKEN_LANGUAGES: SpokenLanguage[] = ['pl', 'en', 'uk', 'ru', 'tr', 'uz'];

/**
 * The opening hours shown on the listing.
 *
 * Fixed, and index-aligned with `copy.business.hoursDays`. The prototype does
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
  { id: 'customers', icon: 'assistant', group: 'grow' },
  { id: 'scans', icon: 'qr', group: 'workspace' },
  { id: 'profile', icon: 'housing', group: 'workspace' },
];

/* ─────────────────────────────────────────────────────────────── l-earn ── */

/** Index-aligned with `copy.learn.hero.stats`. */
export const LEARN_STATS = [
  { value: 100, suffix: ' pts' },
  { value: 7, suffix: '-day' },
  { value: 500, suffix: ' pts' },
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
 * `copy.business.spokenLanguages` rather than needing a blurb in five languages
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
