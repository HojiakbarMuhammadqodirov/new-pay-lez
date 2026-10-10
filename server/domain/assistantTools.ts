/**
 * Everything the assistant's model may look at, as tools.
 *
 * **Every tool is bound to the asker before the model sees it.** A consumer
 * toolbox is made for one user id, a partner toolbox for one venue the asker
 * manages, and no tool takes an id that widens that: the model can ask "my
 * points" and cannot ask "somebody's points", because there is no argument to
 * put somebody in. The ids it *can* pass — a venue to look at, an article to
 * read — name public things, and each is re-checked here (a venue must be live;
 * a partner's every call re-runs `team.requireManage`).
 *
 * Each tool answers twice. `data` is what the model reads, shaped for reading:
 * money as `"25.00 PLN"` rather than minor units, because a model asked to write
 * "25 zł" from `2500` divides, and the guard in `ports/llm.ts` would rightly
 * reject the quotient. And it adds to `Gathered` what the *response* needs —
 * the candidate facts the receipt may show, the rows the dock draws, the one
 * place to send the reader — so the answer's structure comes from the same
 * reads as its sentence.
 *
 * What the model is never handed: an email, a phone number of a person, a user
 * id, a voucher or gift-card code, another customer's name unless that customer
 * shares their profile with the venue asking.
 */
import type { Db } from '../db/db.ts';
import type { ToolReply, ToolRunner, ToolSpec } from '../ports/llm.ts';
import type { Fact } from './assistant.ts';
import * as analytics from './analytics.ts';
import * as budget from './budget.ts';
import * as campaigns from './campaigns.ts';
import * as dashboard from './dashboard.ts';
import * as deals from './deals.ts';
import * as entitlements from './entitlements.ts';
import * as games from './games.ts';
import * as ledger from './ledger.ts';
import * as missions from './missions.ts';
import * as profiles from './profiles.ts';
import * as social from './social.ts';
import * as team from './team.ts';
import * as vouchers from './vouchers.ts';
import { CONFIG } from '../config.ts';
import { TAXONOMY, TAXONOMY_KEYS, tagsOf, under, type Labels } from './categories.ts';
import { GAME_NAMES } from './assistantPrompt.ts';
import { decimalsFor, toMajor } from './money.ts';
import { local, withinDailyWindow, type Iso } from './time.ts';
import { averageCheck, getVenue } from './venues.ts';

/* ═══════════════════════════════════════════════════════ what a call adds ══ */

/** A figure the answer may have used, and how the answer would write it. */
export interface Candidate {
  fact: Fact;
  /** The number (or text with numbers in it) the answer must contain for the fact to count. */
  match: number | string;
}

export interface Gathered {
  candidates: Candidate[];
  /** Venue, deal and directory rows a search or a place lookup read. */
  places: Array<Record<string, unknown>>;
  /** Voucher rungs within reach, for an answer about spending points. */
  tiers: Array<Record<string, unknown>>;
  actions: Array<{ weight: number; action: { label: string; href: string } }>;
  grounding: string[];
}

export interface Toolbox {
  specs: ToolSpec[];
  run: ToolRunner;
  gathered: Gathered;
}

const gatheredFresh = (): Gathered => ({ candidates: [], places: [], tiers: [], actions: [], grounding: [] });

const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown> = {},
  required: string[] = [],
): ToolSpec => ({
  name,
  description,
  input_schema: { type: 'object', properties, required, additionalProperties: false },
});

/* ─────────────────────────────────────────────────────── reading the input ── */

const textIn = (input: Record<string, unknown>, key: string, max = 200): string | undefined => {
  const value = input[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/* ─────────────────────────────────────────────────────────── writing data ── */

/** Minor units as the model should quote them: `"25.00 PLN"`, `"20000 UZS"`. */
export const money = (minor: number | null | undefined, currency: string): string | null =>
  minor === null || minor === undefined ? null : `${toMajor(minor, currency).toFixed(decimalsFor(currency))} ${currency}`;

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const clock = (minutes: number): string =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const WITHHELD = 'withheld — too few customers to report without identifying them';

const metric = (value: analytics.Metric | undefined | null): number | string | null =>
  !value ? null : value.suppressed ? WITHHELD : value.value;

/** What a ledger entry was, in words a player would use. */
const REASONS: Record<string, string> = {
  game_win: 'game round',
  scan_earn: 'venue visit',
  spend_bonus: 'visit bonus',
  venue_bonus: 'first visit / new category bonus',
  stamp_complete: 'stamp card completed',
  review: 'review',
  referral: 'invite reward',
  welcome_bonus: 'welcome gift',
  profile_bonus: 'profile bonus',
  check_in: 'daily check-in',
  streak_milestone: 'streak milestone',
  occasion: 'birthday or anniversary',
  stipend: 'monthly plan credit',
  mission: 'mission',
  adjustment: 'adjustment by Paylez',
  voucher_redeem: 'voucher bought',
  gift_card_redeem: 'gift card bought',
  reversal: 'reversal',
};

/** A category key in the reader's language, English when it has none of the five. */
function labelOf(key: string, language: string): string {
  for (const node of TAXONOMY) {
    if (node.key === key) return node.labels[(language as keyof Labels)] ?? node.labels.en;
    const sub = node.subcategories.find((entry) => entry.key === key);
    if (sub) return sub.labels[(language as keyof Labels)] ?? sub.labels.en;
  }
  return key;
}

/** Every language's label for a key — what a search in Russian matches a venue on. */
function labelsOf(key: string): string[] {
  for (const node of TAXONOMY) {
    if (node.key === key) return Object.values(node.labels);
    const sub = node.subcategories.find((entry) => entry.key === key);
    if (sub) return Object.values(sub.labels);
  }
  return [];
}

/* ─────────────────────────────────────────────────────────── matching text ── */

const STOP = new Set([
  'the', 'and', 'for', 'how', 'what', 'where', 'when', 'which', 'who', 'why', 'can', 'get', 'with', 'from',
  'that', 'this', 'you', 'your', 'are', 'does', 'about', 'into', 'need', 'want', 'there', 'have', 'has', 'not',
  'any', 'all', 'more', 'some', 'near', 'nearby', 'best', 'good', 'place', 'places', 'find', 'open', 'now', 'today',
]);

/**
 * The words of a query as substrings worth looking for: lower-case, three
 * letters or more, stop words out, and long words cut to a stem so
 * "registration" finds "register" and "tickets" finds "ticket".
 */
export function stems(query: string | undefined): string[] {
  if (!query) return [];
  const out = new Set<string>();
  for (const word of query.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (word.length < 3 || STOP.has(word)) continue;
    out.add(word.length > 6 ? word.slice(0, 6) : word);
  }
  return [...out].slice(0, 8);
}

const hits = (haystack: string, terms: string[]): number => terms.filter((term) => haystack.includes(term)).length;

/* ═══════════════════════════════════════════════════════ the consumer side ══ */

export interface ConsumerScope {
  userId: string;
  language: string;
  city?: string;
  at: Iso;
}

const CATEGORY_KEYS = [...TAXONOMY_KEYS];

const CONSUMER_SPECS: ToolSpec[] = [
  tool(
    'my_points',
    "The reader's points: balance, lifetime earnings by source, the latest entries in their points history, the vouchers their balance already buys (their city first), and the next voucher with the points still needed for it.",
  ),
  tool(
    'my_play_status',
    "The reader's games status: streak, longest streak and freezes held, energy now and when the next arrives, their plan and its points multiplier, today's featured game and whether its bonus is taken, paid rounds played today, game points this week against the weekly cap, and the games they have never played (each pays a first-play bonus).",
  ),
  tool(
    'my_wallet',
    "The reader's wallet: active vouchers (venue, discount, most off, expiry), stamp cards in progress, rewards ready to collect, and gift cards — never codes.",
  ),
  tool(
    'my_missions',
    "The reader's missions that are ready to claim or in progress, with reward and progress.",
  ),
  tool(
    'my_invites',
    "The reader's invite code and link, how many friends joined and completed a first visit, and points earned from invites.",
  ),
  tool(
    'search_places',
    "Search partner venues, live deals and the guide's directory of useful services (banks, doctors, offices, schools, shops). Matches names, categories (in any of the app's languages) and descriptions. Defaults to the reader's city; pass city 'any' to search everywhere. Returns ids for place_details.",
    {
      query: { type: 'string', description: 'A few keywords, e.g. "kebab", "coffee", "english doctor", "barber".' },
      category: { type: 'string', enum: CATEGORY_KEYS, description: 'Optional venue category key from the knowledge block.' },
      city: { type: 'string', description: "Optional city name, or 'any'." },
    },
  ),
  tool(
    'place_details',
    "One partner venue in detail: address, phone, opening hours and whether it is open now (venue's local time), points per visit, its voucher ladder, its live deals, the reader's stamp card there, and the owner's own description.",
    { venue_id: { type: 'string', description: 'An id from search_places.' } },
    ['venue_id'],
  ),
  tool(
    'search_guide',
    "Search the newcomer's guide: practical articles about living in Poland (or Germany) — PESEL, address registration (meldunek), residence and work permits, bank accounts, health insurance, doctors, public transport and city cards, renting, schools and universities, taxes, mobile plans, sending money home. Returns the best articles with an excerpt each. Keywords in English work best; the articles are in English, Russian and Uzbek.",
    {
      query: { type: 'string', description: 'Keywords, e.g. "tram ticket Krakow", "PESEL", "residence permit".' },
      country: { type: 'string', enum: ['PL', 'DE'], description: "Which country's guide. Defaults to the reader's, else Poland." },
    },
    ['query'],
  ),
  tool(
    'read_guide_article',
    'Read one guide article in full, in the reader\'s language where it exists. Long articles come in parts: pass the returned next_offset to read on.',
    {
      article_id: { type: 'string', description: 'An id from search_guide.' },
      offset: { type: 'integer', minimum: 0, description: 'Where to continue a long article.' },
    },
    ['article_id'],
  ),
];

export function consumerTools(db: Db, scope: ConsumerScope): Toolbox {
  const gathered = gatheredFresh();
  const run: ToolRunner = async (name, input) => {
    switch (name) {
      case 'my_points':
        return await myPoints(db, scope, gathered);
      case 'my_play_status':
        return await myPlayStatus(db, scope, gathered);
      case 'my_wallet':
        return await myWallet(db, scope, gathered);
      case 'my_missions':
        return await myMissions(db, scope, gathered);
      case 'my_invites':
        return await myInvites(db, scope, gathered);
      case 'search_places':
        return await searchPlaces(db, scope, input, gathered);
      case 'place_details':
        return await placeDetails(db, scope, input, gathered);
      case 'search_guide':
        return await searchGuide(db, scope, input, gathered);
      case 'read_guide_article':
        return await readGuideArticle(db, scope, input, gathered);
      default:
        return { data: `There is no tool called ${name}.`, error: true };
    }
  };
  return { specs: CONSUMER_SPECS, run, gathered };
}

/* ── my_points ── */

async function myPoints(db: Db, scope: ConsumerScope, g: Gathered): Promise<ToolReply> {
  const balance = await ledger.balance(db, scope.userId);
  const earned = await ledger.earnedBySource(db, scope.userId);
  const history = await ledger.history(db, scope.userId, 8);

  const venueIds = [...new Set(history.map((entry) => entry.venue_id).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  for (const id of venueIds) {
    const row = await db.get<{ name: string }>(`SELECT name FROM venues WHERE id = $v`, { v: id });
    if (row) names.set(id, row.name);
  }

  const tiers = await db.all<{
    venue_id: string;
    name: string;
    city: string | null;
    currency: string;
    discount_pct: number;
    points_cost: number;
    max_discount_minor: number;
  }>(
    `SELECT t.venue_id, v.name, v.city, v.currency, t.discount_pct, t.points_cost, t.max_discount_minor
       FROM voucher_tiers t JOIN venues v ON v.id = t.venue_id
      WHERE t.active = 1 AND v.status = 'live' AND v.deleted_at IS NULL
      ORDER BY t.points_cost, t.discount_pct DESC
      LIMIT 400`,
  );
  const home = (row: { city: string | null }) =>
    scope.city && row.city && row.city.toLowerCase() === scope.city.toLowerCase() ? 0 : 1;
  const reachable = tiers
    .filter((tier) => tier.points_cost <= balance)
    .sort((a, b) => home(a) - home(b) || b.discount_pct - a.discount_pct || a.points_cost - b.points_cost);
  const next = tiers
    .filter((tier) => tier.points_cost > balance)
    .sort((a, b) => home(a) - home(b) || a.points_cost - b.points_cost)[0];

  g.candidates.push(
    { fact: { kind: 'balance', label: 'points', value: balance }, match: balance },
    { fact: { kind: 'earned', label: 'earned from playing', value: earned.playing }, match: earned.playing },
    { fact: { kind: 'earned', label: 'earned from visiting', value: earned.visiting }, match: earned.visiting },
    { fact: { kind: 'earned', label: 'earned from bonuses', value: earned.bonuses }, match: earned.bonuses },
    { fact: { kind: 'reachable', label: 'vouchers within reach', value: reachable.length }, match: reachable.length },
  );
  for (const tier of reachable.slice(0, 5)) {
    g.candidates.push({
      fact: { kind: 'voucher_tier', id: tier.venue_id, label: `${tier.discount_pct}% off at ${tier.name}`, value: tier.points_cost },
      match: tier.points_cost,
    });
    g.tiers.push({ venue_id: tier.venue_id, name: tier.name, discount_pct: tier.discount_pct, points_cost: tier.points_cost });
    g.grounding.push(tier.venue_id);
  }
  if (next) {
    const needed = next.points_cost - balance;
    g.candidates.push({
      fact: { kind: 'points_needed', id: next.venue_id, label: `points to ${next.discount_pct}% off at ${next.name}`, value: needed },
      match: needed,
    });
  }
  const best = reachable[0];
  g.actions.push(
    best
      ? { weight: 2, action: { label: `Get ${best.discount_pct}% off at ${best.name}`, href: `#/venue/${best.venue_id}` } }
      : { weight: 1, action: { label: 'Play & Earn', href: '#/learn' } },
  );
  g.grounding.push(scope.userId);

  return {
    data: {
      balance,
      earned_lifetime: { from_playing: earned.playing, from_visiting: earned.visiting, from_bonuses: earned.bonuses },
      recent_history: history.map((entry) => ({
        date: entry.created_at.slice(0, 10),
        points: entry.delta,
        what: REASONS[entry.reason] ?? entry.reason.replace(/_/g, ' '),
        ...(entry.venue_id && names.has(entry.venue_id) ? { venue: names.get(entry.venue_id) } : {}),
        ...(entry.status !== 'committed' ? { status: entry.status } : {}),
      })),
      vouchers_within_reach: reachable.slice(0, 5).map((tier) => ({
        venue: tier.name,
        city: tier.city,
        discount: `${tier.discount_pct}%`,
        points_cost: tier.points_cost,
        most_off: money(tier.max_discount_minor, tier.currency),
      })),
      vouchers_within_reach_count: reachable.length,
      next_voucher: next
        ? {
            venue: next.name,
            city: next.city,
            discount: `${next.discount_pct}%`,
            points_cost: next.points_cost,
            points_still_needed: next.points_cost - balance,
          }
        : null,
    },
  };
}

/* ── my_play_status ── */

async function myPlayStatus(db: Db, scope: ConsumerScope, g: Gathered): Promise<ToolReply> {
  const { userId, at } = scope;
  const day = at.slice(0, 10);
  const state = await db.get<{ streak: number; longest_streak: number; freezes: number; last_played: string | null }>(
    `SELECT streak, longest_streak, freezes, last_played FROM player_states WHERE user_id = $u`,
    { u: userId },
  );
  const energy = await games.energyFor(db, userId, at);
  const plan = await entitlements.planFor(db, { userId }, at);
  const ent = await entitlements.entitlementsFor(db, { userId }, at);
  const featured = await games.featuredGameFor(db, userId, at);
  const featuredTaken = await games.featuredTakenToday(db, userId, at);
  const roundsToday =
    (await db.get<{ lives_used: number }>(
      `SELECT lives_used FROM daily_counters WHERE user_id = $u AND day = $d`,
      { u: userId, d: day },
    ))?.lives_used ?? 0;

  /* The weekly cap as `games.finish` counts it: game-round entries since
     Monday 00:00 UTC, against the plan's row. */
  const date = new Date(`${day}T00:00:00.000Z`);
  const monday = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * 86_400_000).toISOString();
  const thisWeek = Number(
    (await db.get<{ n: number | null }>(
      `SELECT COALESCE(SUM(delta), 0) AS n FROM points_ledger
        WHERE user_id = $u AND reason = 'game_win' AND source_kind = 'game_session' AND created_at >= $m`,
      { u: userId, m: monday },
    ))?.n ?? 0,
  );
  const cap = CONFIG.games.weeklyGameCap[plan.code] ?? CONFIG.games.weeklyGameCap.free;

  const played = new Set(
    (
      await db.all<{ game_type: string }>(
        `SELECT DISTINCT game_type FROM game_sessions
          WHERE user_id = $u AND finished_at IS NOT NULL AND life_spent > 0`,
        { u: userId },
      )
    ).map((row) => row.game_type),
  );
  const neverPlayed = [
    ...new Set(
      games.GAME_TYPES.filter((type) => !played.has(type) && type !== 'uzbekistan' && type !== 'poland').map(
        (type) => GAME_NAMES[type] ?? type,
      ),
    ),
  ];
  const decay = CONFIG.games.decayByRound;
  const nextDecay = decay[Math.min(roundsToday, decay.length - 1)];
  const multiplier = entitlements.entNumber(ent, 'points_multiplier', 1);

  const streak = state?.streak ?? 0;
  g.candidates.push(
    { fact: { kind: 'streak', label: 'current', value: streak }, match: streak },
    { fact: { kind: 'streak', label: 'longest', value: state?.longest_streak ?? 0 }, match: state?.longest_streak ?? 0 },
    { fact: { kind: 'freezes', label: 'freezes', value: state?.freezes ?? 0 }, match: state?.freezes ?? 0 },
    { fact: { kind: 'energy', label: 'energy', value: `${energy.energy}/${energy.max}` }, match: `${energy.energy}/${energy.max}` },
    { fact: { kind: 'weekly_room', label: 'game points left this week', value: Math.max(0, cap - thisWeek) }, match: Math.max(0, cap - thisWeek) },
  );
  g.actions.push({ weight: 1.5, action: { label: 'Play today', href: '#/learn' } });
  g.grounding.push(userId);

  return {
    data: {
      plan: plan.name,
      points_multiplier: multiplier,
      streak_days: streak,
      longest_streak_days: state?.longest_streak ?? 0,
      streak_freezes_held: state?.freezes ?? 0,
      last_played: state?.last_played ? state.last_played.slice(0, 10) : null,
      energy: {
        now: energy.energy,
        tank: energy.max,
        next_energy_at_utc: energy.nextAt,
        one_back_every_minutes: entitlements.entNumber(ent, 'energy_regen_minutes', CONFIG.points.energyRegenMinutes),
      },
      featured_game_today: featured ? GAME_NAMES[featured] ?? featured : null,
      featured_bonus_taken_today: featuredTaken,
      paid_rounds_today: roundsToday,
      next_round_decay: nextDecay,
      game_points_this_week: thisWeek,
      weekly_game_cap: cap,
      game_points_left_this_week: Math.max(0, cap - thisWeek),
      games_never_played: neverPlayed,
      first_play_bonus_each: CONFIG.games.newGameBonus,
    },
  };
}

/* ── my_wallet ── */

async function myWallet(db: Db, scope: ConsumerScope, g: Gathered): Promise<ToolReply> {
  const { userId } = scope;
  const held = await db.all<{
    venue_id: string;
    name: string;
    currency: string;
    discount_pct: number;
    max_discount_minor: number;
    expires_at: string;
  }>(
    `SELECT i.venue_id, v.name, v.currency, i.discount_pct, i.max_discount_minor, i.expires_at
       FROM issued_vouchers i JOIN venues v ON v.id = i.venue_id
      WHERE i.user_id = $u AND i.status = 'active' ORDER BY i.expires_at`,
    { u: userId },
  );
  const cards = await campaigns.cardsFor(db, userId);
  const rewards = await campaigns.availableRewards(db, userId);
  const rewardVenues = new Map<string, string>();
  for (const reward of rewards) {
    if (rewardVenues.has(reward.venue_id)) continue;
    const row = await db.get<{ name: string }>(`SELECT name FROM venues WHERE id = $v`, { v: reward.venue_id });
    rewardVenues.set(reward.venue_id, row?.name ?? 'a venue');
  }
  const gifts = await db.all<{
    status: string;
    expires_at: string | null;
    brand: string | null;
    face: number | null;
    currency: string | null;
    venue: string | null;
  }>(
    `SELECT g.status, g.expires_at, s.brand,
            COALESCE(g.face_minor, s.face_minor) AS face,
            COALESCE(g.currency, s.currency) AS currency,
            v.name AS venue
       FROM gift_cards g JOIN gift_card_stock s ON s.id = g.stock_id
       LEFT JOIN venues v ON v.id = s.venue_id
      WHERE g.user_id = $u ORDER BY g.issued_at DESC LIMIT 10`,
    { u: userId },
  );

  g.candidates.push({ fact: { kind: 'vouchers', label: 'vouchers to use', value: held.length }, match: held.length });
  for (const voucher of held.slice(0, 6)) {
    g.candidates.push({
      fact: { kind: 'voucher', id: voucher.venue_id, label: voucher.name, value: `${voucher.discount_pct}%` },
      match: `${voucher.discount_pct}%`,
    });
    g.grounding.push(voucher.venue_id);
  }
  for (const card of cards.slice(0, 4)) {
    g.candidates.push({
      fact: { kind: 'stamps', label: `stamps at ${card.venue_name}`, value: `${card.stamps}/${card.required}` },
      match: `${card.stamps}/${card.required}`,
    });
  }
  g.actions.push({ weight: 2, action: { label: 'Open your wallet', href: '#/wallet' } });
  g.grounding.push(userId);

  return {
    data: {
      active_vouchers: held.map((voucher) => ({
        venue: voucher.name,
        discount: `${voucher.discount_pct}%`,
        most_off: money(voucher.max_discount_minor, voucher.currency),
        expires: voucher.expires_at.slice(0, 10),
      })),
      stamp_cards: cards.map((card) => ({
        venue: card.venue_name,
        reward: card.label,
        stamps: card.stamps,
        stamps_needed: card.required,
        status: card.status,
      })),
      rewards_ready: rewards.map((reward) => ({
        venue: rewardVenues.get(reward.venue_id),
        reward: reward.label,
        expires: reward.expires_at.slice(0, 10),
      })),
      gift_cards: gifts.map((gift) => ({
        brand: gift.brand ?? gift.venue,
        status: gift.status,
        face_value: gift.face !== null && gift.currency ? money(gift.face, gift.currency) : null,
        expires: gift.expires_at ? gift.expires_at.slice(0, 10) : null,
      })),
    },
  };
}

/* ── my_missions ── */

async function myMissions(db: Db, scope: ConsumerScope, g: Gathered): Promise<ToolReply> {
  const view = await missions.missionsFor(db, scope.userId, scope.at);
  const rows = view.bands
    .flatMap((band) =>
      band.missions
        .filter((mission) => mission.status === 'complete' || mission.status === 'open')
        .map((mission) => ({ band, mission })),
    )
    .sort((a, b) => Number(b.mission.status === 'complete') - Number(a.mission.status === 'complete'))
    .slice(0, 16);

  g.candidates.push({ fact: { kind: 'missions_ready', label: 'missions ready to claim', value: view.unclaimed }, match: view.unclaimed });
  for (const { mission } of rows.slice(0, 6)) {
    if (mission.reward !== null) {
      g.candidates.push({ fact: { kind: 'mission', label: mission.title, value: mission.reward }, match: mission.reward });
    }
  }
  g.actions.push({ weight: 1, action: { label: 'Open missions', href: '#/learn' } });
  g.grounding.push(scope.userId);

  return {
    data: {
      ready_to_claim: view.unclaimed,
      missions: rows.map(({ band, mission }) => ({
        band: band.title,
        title: mission.title,
        what_to_do: mission.description,
        reward: mission.rewardLabel,
        progress: `${mission.progress}/${mission.target}`,
        status: mission.status === 'complete' ? 'done — claim it' : 'in progress',
        ...(mission.autoPaid ? { paid_automatically: true } : {}),
        ...(band.resetsAt ? { resets_at_utc: band.resetsAt } : {}),
      })),
    },
  };
}

/* ── my_invites ── */

async function myInvites(db: Db, scope: ConsumerScope, g: Gathered): Promise<ToolReply> {
  const progress = await social.referralProgress(db, scope.userId);
  g.candidates.push(
    { fact: { kind: 'invites', label: 'friends joined', value: progress.joined }, match: progress.joined },
    { fact: { kind: 'invites', label: 'friends completed a first visit', value: progress.completed }, match: progress.completed },
    { fact: { kind: 'invites', label: 'points from invites', value: progress.pointsEarned }, match: progress.pointsEarned },
  );
  g.grounding.push(scope.userId);
  return {
    data: {
      invite_code: progress.code,
      invite_link: progress.link,
      friends_joined: progress.joined,
      friends_completed_first_visit: progress.completed,
      points_earned_from_invites: progress.pointsEarned,
      can_still_enter_someone_elses_code: progress.canRedeem,
    },
  };
}

/* ── search_places ── */

async function searchPlaces(
  db: Db,
  scope: ConsumerScope,
  input: Record<string, unknown>,
  g: Gathered,
): Promise<ToolReply> {
  const terms = stems(textIn(input, 'query', 120));
  const category =
    typeof input.category === 'string' && TAXONOMY_KEYS.has(input.category) ? input.category : undefined;
  const asked = textIn(input, 'city', 80);
  const city = asked && asked.toLowerCase() === 'any' ? undefined : (asked ?? scope.city);
  const inCity = (value: string | null) => !city || (value ?? '').toLowerCase() === city.toLowerCase();

  const rows = await db.all<{
    id: string;
    name: string;
    category: string;
    subcategory: string | null;
    tags: string | null;
    city: string | null;
    address: string | null;
    rating: number | null;
    points_per_scan: number | null;
    accepts_vouchers: number;
  }>(
    `SELECT id, name, category, subcategory, tags, city, address, rating, points_per_scan, accepts_vouchers
       FROM venues WHERE status = 'live' AND deleted_at IS NULL LIMIT 500`,
  );
  const descriptions = await descriptionsOf(db, 'venue', scope.language);

  const scored = rows
    .map((row) => {
      const keys = tagsOf(row);
      const haystack = [
        row.name,
        row.category,
        row.subcategory ?? '',
        row.city ?? '',
        row.address ?? '',
        ...keys,
        ...keys.flatMap(labelsOf),
        descriptions.get(row.id) ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return { row, keys, score: terms.length === 0 ? 1 : hits(haystack, terms) };
    })
    .filter((entry) => entry.score > 0 && (!category || under(entry.keys, category)))
    .sort((a, b) => b.score - a.score || (b.row.rating ?? 0) - (a.row.rating ?? 0));

  let venues = scored.filter((entry) => inCity(entry.row.city));
  let widened = false;
  if (venues.length === 0 && city && scored.length > 0) {
    venues = scored;
    widened = true;
  }
  venues = venues.slice(0, 6);

  const live = await deals.browse(
    db,
    { userId: scope.userId, language: scope.language, city: widened ? undefined : city, at: scope.at },
    { limit: 40 },
  );
  const venueIds = new Set(venues.map((entry) => entry.row.id));
  const offers = live
    .filter((deal) => {
      if (deal.venueId && venueIds.has(deal.venueId)) return true;
      if (category) return deal.category !== null && (deal.category === category || deal.category.startsWith(`${category}.`));
      if (terms.length === 0) return true;
      const haystack = [deal.partnerName ?? '', deal.category ?? '', deal.copy.title, deal.copy.description].join(' ').toLowerCase();
      return hits(haystack, terms) > 0;
    })
    .slice(0, 4);

  /* The guide's directory — banks, clinics, offices, schools — matched on words
     only: it has its own category keys, not the venue tree's. */
  let services: Array<ServiceRow & { description: string | null }> = [];
  if (terms.length > 0) {
    const all = await db.all<ServiceRow & { subcategories: string | null }>(
      `SELECT id, venue_id, name, category_key, subcategories, city, address, phone, price_range, rating
         FROM guidance_services WHERE active = 1 LIMIT 2000`,
    );
    const notes = await descriptionsOf(db, 'guidance_service', scope.language);
    const ranked = all
      .map((row) => ({
        row,
        score: hits(
          [row.name, row.category_key ?? '', row.subcategories ?? '', row.city ?? '', notes.get(row.id) ?? '']
            .join(' ')
            .toLowerCase(),
          terms,
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || (b.row.rating ?? 0) - (a.row.rating ?? 0));
    const local = ranked.filter((entry) => inCity(entry.row.city));
    services = (local.length > 0 ? local : ranked)
      .slice(0, 4)
      .map(({ row }) => ({ ...row, description: trimText(notes.get(row.id), 220) }));
  }

  for (const { row, keys } of venues) {
    g.places.push({
      id: row.id,
      venue_id: row.id,
      name: row.name,
      category: keys[0] ? labelOf(keys[0], scope.language) : row.category,
      city: row.city,
      address: row.address,
    });
    g.grounding.push(row.id);
  }
  for (const deal of offers) {
    g.places.push({
      id: deal.id,
      ...(deal.venueId ? { venue_id: deal.venueId } : {}),
      name: deal.partnerName ?? deal.copy.title,
      title: deal.copy.title,
      category: deal.category,
      city: deal.city,
    });
    g.grounding.push(deal.id);
  }
  for (const service of services) {
    g.places.push({
      id: service.id,
      ...(service.venue_id ? { venue_id: service.venue_id } : {}),
      name: service.name,
      category_key: service.category_key,
      city: service.city,
      address: service.address,
    });
    g.grounding.push(service.id);
  }
  if (venues.length === 1) {
    g.actions.push({ weight: 1.5, action: { label: `Open ${venues[0].row.name}`, href: `#/venue/${venues[0].row.id}` } });
  } else if (venues.length > 0 || offers.length > 0) {
    g.actions.push({ weight: 1, action: { label: 'Browse deals', href: '#/deals' } });
  }

  return {
    data: {
      searched_city: widened ? 'any (nothing matched in the reader\'s city)' : (city ?? 'any'),
      venues: venues.map(({ row, keys }) => ({
        id: row.id,
        name: row.name,
        categories: keys.map((key) => labelOf(key, 'en')),
        city: row.city,
        address: row.address,
        rating: row.rating,
        points_per_visit: row.points_per_scan,
        sells_vouchers: row.accepts_vouchers === 1,
      })),
      deals: offers.map((deal) => ({
        venue: deal.partnerName,
        venue_id: deal.venueId,
        title: deal.copy.title,
        discount: deal.discountText,
        valid_until: deal.validTo ? deal.validTo.slice(0, 10) : null,
        points_required: deal.pointsRequired,
        owner_written_text: trimText(deal.copy.description, 200),
      })),
      directory: services.map((service) => ({
        name: service.name,
        category: service.category_key,
        city: service.city,
        address: service.address,
        phone: service.phone,
        price_range: service.price_range,
        rating: service.rating,
        description: service.description,
      })),
      ...(venues.length + offers.length + services.length === 0
        ? { note: 'Nothing matched. Say so; do not suggest places from general knowledge.' }
        : {}),
    },
  };
}

interface ServiceRow {
  id: string;
  venue_id: string | null;
  name: string;
  category_key: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  price_range: string | null;
  rating: number | null;
}

/** One description per entity, in the reader's language or English. */
async function descriptionsOf(db: Db, entity: string, language: string): Promise<Map<string, string>> {
  const rows = await db.all<{ entity_id: string; language: string; value: string }>(
    `SELECT entity_id, language, value FROM translations
      WHERE entity = $e AND field = 'description' AND language IN ($l, 'en')`,
    { e: entity, l: language },
  );
  const out = new Map<string, string>();
  for (const row of rows) {
    if (row.language === language || !out.has(row.entity_id)) out.set(row.entity_id, row.value);
  }
  return out;
}

function trimText(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const text = stripHtml(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/* ── place_details ── */

async function placeDetails(
  db: Db,
  scope: ConsumerScope,
  input: Record<string, unknown>,
  g: Gathered,
): Promise<ToolReply> {
  const id = textIn(input, 'venue_id', 80);
  const venue = id
    ? await db.get<{
        id: string;
        name: string;
        category: string;
        subcategory: string | null;
        tags: string | null;
        city: string | null;
        address: string | null;
        phone: string | null;
        price_range: string | null;
        rating: number | null;
        review_count: number;
        points_per_scan: number | null;
        accepts_vouchers: number;
        timezone: string;
        currency: string;
        min_spend_minor: number | null;
      }>(
        `SELECT id, name, category, subcategory, tags, city, address, phone, price_range, rating, review_count,
                points_per_scan, accepts_vouchers, timezone, currency, min_spend_minor
           FROM venues WHERE id = $i AND status = 'live' AND deleted_at IS NULL`,
        { i: id },
      )
    : undefined;
  if (!venue) return { data: 'There is no live partner venue with that id. Use an id from search_places.', error: true };

  const hours = await db.all<{ weekday: number; opens_min: number | null; closes_min: number | null; closed: number }>(
    `SELECT weekday, opens_min, closes_min, closed FROM venue_hours WHERE venue_id = $v ORDER BY weekday`,
    { v: venue.id },
  );
  const now = local(scope.at, venue.timezone);
  const today = hours.find((row) => row.weekday === now.weekday);
  const openNow =
    hours.length === 0 || !today
      ? 'unknown — no opening hours on file'
      : today.closed
        ? false
        : today.opens_min === null || today.closes_min === null
          ? 'unknown'
          : withinDailyWindow(now.minutes, today.opens_min, today.closes_min);

  const ladder = await vouchers.ladder(db, venue.id, scope.at, scope.userId);
  const offers = await deals.browse(
    db,
    { userId: scope.userId, language: scope.language, city: scope.city, at: scope.at },
    { venueId: venue.id, limit: 10 },
  );
  const stamps = await campaigns.progressFor(db, scope.userId, venue.id);
  const description = (await descriptionsOf(db, 'venue', scope.language)).get(venue.id);
  const keys = tagsOf(venue);

  for (const rung of ladder) {
    g.candidates.push({
      fact: { kind: 'voucher_tier', id: venue.id, label: `${rung.discountPct}% off at ${venue.name}`, value: rung.pointsCost },
      match: rung.pointsCost,
    });
  }
  g.places.push({
    id: venue.id,
    venue_id: venue.id,
    name: venue.name,
    category: keys[0] ? labelOf(keys[0], scope.language) : venue.category,
    city: venue.city,
    address: venue.address,
  });
  g.grounding.push(venue.id);
  g.actions.push({ weight: 3, action: { label: `Open ${venue.name}`, href: `#/venue/${venue.id}` } });

  return {
    data: {
      name: venue.name,
      categories: keys.map((key) => labelOf(key, 'en')),
      city: venue.city,
      address: venue.address,
      phone: venue.phone,
      price_range: venue.price_range,
      rating: venue.rating,
      reviews: venue.review_count,
      points_per_visit: venue.points_per_scan,
      minimum_spend_for_a_visit: money(venue.min_spend_minor, venue.currency),
      local_time_now: `${DAYS[now.weekday]} ${clock(now.minutes)}`,
      open_now: openNow,
      opening_hours: hours.map((row) => ({
        day: DAYS[row.weekday],
        hours: row.closed
          ? 'closed'
          : row.opens_min === null || row.closes_min === null
            ? 'not given'
            : `${clock(row.opens_min)}–${clock(row.closes_min)}`,
      })),
      voucher_ladder: venue.accepts_vouchers
        ? ladder.map((rung) => ({
            discount: `${rung.discountPct}%`,
            points_cost: rung.pointsCost,
            most_off: money(rung.maxDiscountMinor, venue.currency),
            can_be_bought_now: rung.available,
          }))
        : 'this venue does not sell vouchers',
      live_deals: offers.map((deal) => ({
        title: deal.copy.title,
        discount: deal.discountText,
        valid_until: deal.validTo ? deal.validTo.slice(0, 10) : null,
        points_required: deal.pointsRequired,
        owner_written_text: trimText(deal.copy.description, 240),
      })),
      my_stamp_cards_here: stamps.map((card) => ({
        reward: card.campaign.reward_label,
        stamps: card.stamps,
        stamps_needed: card.required,
      })),
      owner_written_description: trimText(description, 700),
    },
  };
}

/* ── the guide ── */

interface GuideDoc {
  id: string;
  category: string | null;
  country: string;
  /** language → heading and plain text. */
  copy: Map<string, { heading: string; body: string }>;
}

const GUIDE_TTL_MS = 10 * 60_000;
const guideCache = new WeakMap<Db, { key: string; at: number; docs: GuideDoc[] }>();

/**
 * Every article, as plain text, held for ten minutes per database.
 *
 * The articles are long-form HTML and one of them is most of a megabyte of
 * inline images, so stripping them on every question would be most of the
 * question's cost. Keyed on a fingerprint as well as a clock, so an import that
 * adds or edits articles is seen on the next ask rather than ten minutes later.
 */
async function guideDocs(db: Db): Promise<GuideDoc[]> {
  const print = await db.get<{ n: number; u: string | null; t: number }>(
    `SELECT COUNT(*) AS n, MAX(updated_at) AS u,
            (SELECT COUNT(*) FROM translations WHERE entity = 'guidance_article') AS t
       FROM guidance_articles WHERE active = 1`,
  );
  const key = `${print?.n ?? 0}|${print?.u ?? ''}|${print?.t ?? 0}`;
  const cached = guideCache.get(db);
  if (cached && cached.key === key && Date.now() - cached.at < GUIDE_TTL_MS) return cached.docs;

  const articles = await db.all<{ id: string; category_key: string | null; country_code: string }>(
    `SELECT id, category_key, country_code FROM guidance_articles WHERE active = 1 ORDER BY position`,
  );
  const copy = await db.all<{ entity_id: string; field: string; language: string; value: string }>(
    `SELECT entity_id, field, language, value FROM translations
      WHERE entity = 'guidance_article' AND field IN ('heading', 'content')`,
  );
  const byId = new Map<string, GuideDoc>(
    articles.map((row) => [row.id, { id: row.id, category: row.category_key, country: row.country_code, copy: new Map() }]),
  );
  for (const row of copy) {
    const doc = byId.get(row.entity_id);
    if (!doc) continue;
    const entry = doc.copy.get(row.language) ?? { heading: '', body: '' };
    if (row.field === 'heading') entry.heading = stripHtml(row.value);
    else entry.body = stripHtml(row.value);
    doc.copy.set(row.language, entry);
  }
  const docs = [...byId.values()].filter((doc) => doc.copy.size > 0);
  guideCache.set(db, { key, at: Date.now(), docs });
  return docs;
}

const inLanguage = (doc: GuideDoc, language: string) =>
  doc.copy.get(language) ?? doc.copy.get('en') ?? [...doc.copy.values()][0];

async function guideCountry(db: Db, scope: ConsumerScope, input: Record<string, unknown>): Promise<string> {
  if (input.country === 'PL' || input.country === 'DE') return input.country;
  const row = await db.get<{ country_code: string | null }>(`SELECT country_code FROM users WHERE id = $u`, {
    u: scope.userId,
  });
  return row?.country_code === 'DE' ? 'DE' : 'PL';
}

async function searchGuide(
  db: Db,
  scope: ConsumerScope,
  input: Record<string, unknown>,
  g: Gathered,
): Promise<ToolReply> {
  const terms = stems(textIn(input, 'query', 160));
  if (terms.length === 0) return { data: 'Give a few keywords to search the guide.', error: true };
  const country = await guideCountry(db, scope, input);
  const docs = (await guideDocs(db)).filter((doc) => doc.country === country);

  const ranked = docs
    .map((doc) => {
      let score = 0;
      for (const { heading, body } of doc.copy.values()) {
        const head = heading.toLowerCase();
        const text = body.toLowerCase();
        const here = terms.reduce((sum, term) => {
          const inHead = head.includes(term) ? 5 : 0;
          let count = 0;
          for (let at = text.indexOf(term); at !== -1 && count < 5; at = text.indexOf(term, at + term.length)) count += 1;
          return sum + inHead + count;
        }, 0);
        score = Math.max(score, here);
      }
      return { doc, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  for (const { doc } of ranked) g.grounding.push(doc.id);

  return {
    data: {
      country,
      articles: ranked.map(({ doc }) => {
        const copy = inLanguage(doc, scope.language);
        const lower = copy.body.toLowerCase();
        const first = terms.map((term) => lower.indexOf(term)).filter((at) => at >= 0).sort((a, b) => a - b)[0] ?? 0;
        const start = Math.max(0, first - 300);
        return {
          id: doc.id,
          title: copy.heading,
          topic: doc.category,
          excerpt: `${start > 0 ? '…' : ''}${copy.body.slice(start, start + 1500)}${start + 1500 < copy.body.length ? '…' : ''}`,
        };
      }),
      ...(ranked.length === 0
        ? { note: 'No article matches. Say the guide does not cover it; do not answer from general knowledge.' }
        : {}),
    },
  };
}

const ARTICLE_PART = 6000;

async function readGuideArticle(
  db: Db,
  scope: ConsumerScope,
  input: Record<string, unknown>,
  g: Gathered,
): Promise<ToolReply> {
  const id = textIn(input, 'article_id', 80);
  const doc = id ? (await guideDocs(db)).find((entry) => entry.id === id) : undefined;
  if (!doc) return { data: 'There is no guide article with that id. Use an id from search_guide.', error: true };
  const offset = Math.max(0, Math.floor(Number(input.offset ?? 0)) || 0);
  const copy = inLanguage(doc, scope.language);
  const part = copy.body.slice(offset, offset + ARTICLE_PART);
  g.grounding.push(doc.id);
  return {
    data: {
      title: copy.heading,
      topic: doc.category,
      country: doc.country,
      text: part,
      ...(offset + ARTICLE_PART < copy.body.length ? { next_offset: offset + ARTICLE_PART } : {}),
    },
  };
}

/**
 * HTML to plain text — enough for an article body, not a general sanitiser.
 *
 * Images go first and whole: the imported articles carry them as `data:` URIs,
 * and one article is ~700 kB of them. Block ends become line breaks so a list
 * stays a list; entities are decoded so `&amp;` is not read as a word.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|ol|ul)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ═════════════════════════════════════════════════════════ the partner side ══ */

export interface PartnerScope {
  userId: string;
  venueId: string;
  language: string;
  at: Iso;
}

const PARTNER_SPECS: ToolSpec[] = [
  tool(
    'venue_month',
    "This venue's month: visits, customers (new and returning), sales and average check (estimated from bills), points issued, discount given, how often the listing and its deals were seen, clicked and claimed, the quietest and busiest open hour, and the customers' top languages. Defaults to the current month.",
    { month: { type: 'string', description: 'Optional month, YYYY-MM.' } },
  ),
  tool(
    'venue_trend',
    'This venue over the last 7, 30 or 90 days against the same span before it: visits, customers, new customers, sales, deal claims, vouchers and rewards redeemed, each with the percentage change.',
    { days: { type: 'integer', enum: [7, 30, 90] } },
    ['days'],
  ),
  tool(
    'venue_offers',
    "This venue's offers: vouchers issued, active, redeemed and expired with their money; the voucher ladder; loyalty stamp-card campaigns with members and rewards; and recent hot deals with seen / opened / claimed.",
  ),
  tool(
    'venue_budget',
    "This venue's budget this month: the loyalty and voucher pools (spent, set aside, available), the average check vouchers are priced on, a suggestion to move budget if there is one, and the cost per new customer this month.",
  ),
  tool(
    'venue_top_customers',
    "This venue's top customers by spend — only customers who agreed to share their profile with this venue, and only if the plan includes named profiles. Otherwise says why not.",
  ),
  tool('venue_plan', "This venue's Paylez plan and what it includes."),
];

export function partnerTools(db: Db, scope: PartnerScope): Toolbox {
  const gathered = gatheredFresh();
  gathered.grounding.push(scope.venueId);
  const run: ToolRunner = async (name, input) => {
    /* Every call, not once: a manager removed mid-conversation stops reading
       the venue at the next tool call rather than at the next question. */
    await team.requireManage(db, scope.venueId, scope.userId);
    switch (name) {
      case 'venue_month':
        return await venueMonth(db, scope, input, gathered);
      case 'venue_trend':
        return await venueTrend(db, scope, input, gathered);
      case 'venue_offers':
        return await venueOffers(db, scope, gathered);
      case 'venue_budget':
        return await venueBudget(db, scope, gathered);
      case 'venue_top_customers':
        return await venueTopCustomers(db, scope, gathered);
      case 'venue_plan':
        return await venuePlan(db, scope);
      default:
        return { data: `There is no tool called ${name}.`, error: true };
    }
  };
  return { specs: PARTNER_SPECS, run, gathered };
}

async function venueMonth(
  db: Db,
  scope: PartnerScope,
  input: Record<string, unknown>,
  g: Gathered,
): Promise<ToolReply> {
  const asked = textIn(input, 'month', 7);
  const window = { period: asked && MONTH.test(asked) ? asked : undefined, at: scope.at };
  const venue = await getVenue(db, scope.venueId);
  const overview = await analytics.overview(db, scope.venueId, window);
  const reach = await analytics.reach(db, scope.venueId, window);
  const map = await analytics.heatmap(db, scope.venueId, window);
  const mix = await analytics.languageMix(db, scope.venueId, window);
  const currency = overview.currency ?? venue.currency;

  const pushMetric = (kind: string, label: string, value: analytics.Metric) => {
    if (!value.suppressed && value.value !== null) g.candidates.push({ fact: { kind, label, value: value.value }, match: value.value });
  };
  pushMetric('visits', 'visits this period', overview.visits);
  pushMetric('customers', 'customers', overview.customers);
  pushMetric('new_customers', 'new customers', overview.newCustomers);
  for (const [label, value] of [
    ['sales (estimated)', overview.salesMinor],
    ['average check', overview.averageCheckMinor],
  ] as const) {
    const shown = !value.suppressed && value.value !== null ? money(value.value, currency) : null;
    if (shown) g.candidates.push({ fact: { kind: 'sales', label, value: shown }, match: shown });
  }
  const quiet = map.total > 0 ? map.quietest : null;
  if (quiet) {
    g.candidates.push({
      fact: { kind: 'quiet_window', label: 'quietest hour', value: `${quiet.weekday}:${quiet.hour}` },
      match: `${quiet.hour}:00`,
    });
    g.actions.push({ weight: 1, action: { label: 'Run a deal then', href: '#/dashboard/deals/new' } });
  } else {
    g.actions.push({ weight: 0.5, action: { label: 'Open analytics', href: '#/dashboard/analytics' } });
  }

  return {
    data: {
      month: overview.period,
      currency,
      visits: metric(overview.visits),
      customers: metric(overview.customers),
      new_customers: metric(overview.newCustomers),
      returning_customers: metric(overview.returningCustomers),
      sales_estimated: overview.salesMinor.suppressed ? WITHHELD : money(overview.salesMinor.value, currency),
      sales_projected_for_month: overview.projectedSalesMinor.suppressed
        ? WITHHELD
        : money(overview.projectedSalesMinor.value, currency),
      average_check: overview.averageCheckMinor.suppressed ? WITHHELD : money(overview.averageCheckMinor.value, currency),
      visits_from_paylez_offers: metric(overview.attributedVisits),
      points_issued: overview.pointsIssued,
      discount_given: money(overview.discountGivenMinor, currency),
      listing_and_deals_seen: reach.impressions,
      clicked: reach.clicks,
      deals_claimed: reach.claims,
      quietest_open_hour: quiet ? `${DAYS[quiet.weekday]} ${clock(quiet.hour * 60)} (${quiet.visits} visits)` : null,
      busiest_hour:
        map.total > 0 && map.busiest
          ? `${DAYS[map.busiest.weekday]} ${clock(map.busiest.hour * 60)} (${map.busiest.visits} visits)`
          : null,
      top_languages: mix.suppressed
        ? WITHHELD
        : mix.rows.slice(0, 3).map((row) => `${row.language} ${Math.round(row.share * 100)}%`),
    },
  };
}

async function venueTrend(
  db: Db,
  scope: PartnerScope,
  input: Record<string, unknown>,
  g: Gathered,
): Promise<ToolReply> {
  const days = [7, 30, 90].includes(Number(input.days)) ? Number(input.days) : 30;
  const series = await dashboard.series(db, scope.venueId, days, scope.at);
  const change = (now: number | null, before: number | null) =>
    now === null || before === null || before === 0 ? null : `${Math.round(((now - before) / before) * 100)}%`;
  const pair = (now: number | null, before: number | null, render: (n: number | null) => unknown = (n) => n) => ({
    now: now === null ? WITHHELD : render(now),
    before: before === null ? WITHHELD : render(before),
    change: change(now, before),
  });
  const t = series.totals;
  const p = series.previous;
  g.candidates.push(
    { fact: { kind: 'visits', label: `visits, last ${days} days`, value: t.visits }, match: t.visits },
    { fact: { kind: 'customers', label: `customers, last ${days} days`, value: t.customers }, match: t.customers },
  );
  const sales = money(t.salesMinor, series.currency);
  if (sales) g.candidates.push({ fact: { kind: 'sales', label: `sales, last ${days} days`, value: sales }, match: sales });
  g.actions.push({ weight: 0.5, action: { label: 'Open analytics', href: '#/dashboard/analytics' } });

  return {
    data: {
      days,
      from: series.from.slice(0, 10),
      to: series.to.slice(0, 10),
      currency: series.currency,
      visits: pair(t.visits, p.visits),
      customers: pair(t.customers, p.customers),
      new_customers: pair(t.newCustomers, p.newCustomers),
      sales_estimated: pair(t.salesMinor, p.salesMinor, (n) => money(n, series.currency)),
      deal_claims: pair(t.claims, p.claims),
      vouchers_redeemed: pair(t.vouchersRedeemed, p.vouchersRedeemed),
      rewards_redeemed: pair(t.rewardsRedeemed, p.rewardsRedeemed),
    },
  };
}

async function venueOffers(db: Db, scope: PartnerScope, g: Gathered): Promise<ToolReply> {
  const venue = await getVenue(db, scope.venueId);
  const totals = await vouchers.partnerVoucherTotals(db, scope.venueId, scope.at);
  const ladder = await vouchers.partnerLadder(db, scope.venueId, scope.at);
  const runs = await campaigns.campaignRows(db, scope.venueId);
  const offers = await db.all<{
    id: string;
    discount_text: string | null;
    status: string;
    valid_to: string | null;
    seen_count: number;
    opened_count: number;
    claimed_count: number;
  }>(
    `SELECT id, discount_text, status, valid_to, seen_count, opened_count, claimed_count
       FROM hot_deals WHERE venue_id = $v AND status IN ('live', 'scheduled', 'paused', 'draft')
      ORDER BY created_at DESC LIMIT 8`,
    { v: scope.venueId },
  );
  const titles = new Map<string, string | null>();
  for (const offer of offers) titles.set(offer.id, (await deals.copyFor(db, offer.id, scope.language))?.title ?? null);

  g.candidates.push(
    { fact: { kind: 'vouchers_issued', label: 'vouchers issued', value: totals.issued }, match: totals.issued },
    { fact: { kind: 'vouchers_redeemed', label: 'vouchers redeemed', value: totals.redeemed }, match: totals.redeemed },
    { fact: { kind: 'vouchers_active', label: 'vouchers active', value: totals.active }, match: totals.active },
  );
  g.actions.push({ weight: 0.75, action: { label: 'Open vouchers', href: '#/dashboard/vouchers' } });

  return {
    data: {
      currency: venue.currency,
      vouchers: {
        issued: totals.issued,
        active: totals.active,
        redeemed: totals.redeemed,
        expired: totals.expired,
        expiring_within_a_week: totals.lapsing,
        set_aside_for_active: money(totals.activeReservedMinor, venue.currency),
        discount_paid_on_redeemed: money(totals.redeemedSpentMinor, venue.currency),
        returned_by_expiry: money(totals.expiredReleasedMinor, venue.currency),
      },
      voucher_ladder: ladder.map((rung) => ({
        discount: `${rung.discountPct}%`,
        points_cost: rung.pointsCost,
        most_off: money(rung.maxDiscountMinor, venue.currency),
        on_sale: rung.available,
        issued_this_month: rung.issuedCount,
        redeemed_this_month: rung.redeemedCount,
      })),
      stamp_cards: runs.map((run) => ({
        name: run.name,
        status: run.status,
        visits_required: run.visits_required,
        reward: run.reward_label,
        reward_cost: money(run.reward_cost_minor, venue.currency),
        members: run.members,
        one_visit_from_reward: run.near,
        rewards_earned: run.earned,
        rewards_redeemed: run.redeemed,
      })),
      hot_deals: offers.map((offer) => ({
        title: titles.get(offer.id) ?? offer.discount_text,
        status: offer.status,
        valid_until: offer.valid_to ? offer.valid_to.slice(0, 10) : null,
        seen: offer.seen_count,
        opened: offer.opened_count,
        claimed: offer.claimed_count,
      })),
    },
  };
}

async function venueBudget(db: Db, scope: PartnerScope, g: Gathered): Promise<ToolReply> {
  const venue = await getVenue(db, scope.venueId);
  const view = await budget.budgetFor(db, scope.venueId, scope.at);
  const hint = budget.rebalanceHint(view);
  const check = await averageCheck(db, venue, scope.at);
  const cost = await analytics.costPerNewCustomer(db, scope.venueId, { at: scope.at });
  const currency = view.currency;
  const pool = (p: budget.Pool) => ({
    base: money(p.base, currency),
    spent: money(p.spent, currency),
    set_aside: money(p.reserved, currency),
    available: money(p.available, currency),
  });
  const available = view.loyalty.available + view.voucher.available;
  g.candidates.push({
    fact: { kind: 'budget', label: 'available budget', value: available, currency },
    match: money(available, currency) ?? available,
  });
  if (!cost.costPerNewCustomerMinor.suppressed) {
    g.candidates.push({
      fact: { kind: 'spend', label: 'spend this month', value: cost.spendMinor, currency },
      match: money(cost.spendMinor, currency) ?? cost.spendMinor,
    });
  }
  g.actions.push({ weight: 1, action: { label: 'Move budget', href: '#/dashboard/budget' } });

  return {
    data: {
      month: view.period,
      currency,
      total: money(view.total, currency),
      loyalty_pool: pool(view.loyalty),
      voucher_pool: pool(view.voucher),
      available_in_both: money(available, currency),
      average_check_used_for_vouchers: money(check.minor, currency),
      suggestion: hint
        ? `Move about ${money(hint.suggested, currency)} from the ${hint.from} pool to the ${hint.to} pool.`
        : null,
      cost_per_new_customer: cost.costPerNewCustomerMinor.suppressed
        ? WITHHELD
        : {
            spend_this_month: money(cost.spendMinor, currency),
            of_which: {
              plan: money(cost.breakdown.subscription, currency),
              loyalty_rewards: money(cost.breakdown.loyalty, currency),
              vouchers: money(cost.breakdown.vouchers, currency),
              deals: money(cost.breakdown.deals, currency),
            },
            new_customers: cost.newCustomers,
            each: money(cost.costPerNewCustomerMinor.value, currency),
          },
    },
  };
}

async function venueTopCustomers(db: Db, scope: PartnerScope, g: Gathered): Promise<ToolReply> {
  const ent = await entitlements.entitlementsFor(db, { venueId: scope.venueId }, scope.at);
  if (!entitlements.entBool(ent, 'identified_profiles')) {
    return {
      data: {
        available: false,
        reason:
          "This venue's plan does not include named customer profiles. The month's aggregate figures are still available.",
      },
    };
  }
  const venue = await getVenue(db, scope.venueId);
  /* `customerTable` joins the sharing grant in SQL: a customer who did not
     agree to share with this venue cannot be in what comes back. */
  const table = await profiles.customerTable(db, scope.venueId, { sort: 'spend', limit: 5, at: scope.at });
  g.candidates.push({
    fact: { kind: 'shared_customers', label: 'customers sharing their profile', value: table.sharedCustomers },
    match: table.sharedCustomers,
  });
  g.actions.push({ weight: 1, action: { label: 'Open customers', href: '#/dashboard/customers' } });
  return {
    data: {
      available: true,
      customers_ever: table.totalCustomers,
      customers_sharing_their_profile: table.sharedCustomers,
      top_by_spend: table.rows.map((row) => ({
        name: row.name,
        visits: row.visits,
        spend_here: money(row.spendMinor, venue.currency),
        status: row.status.replace('_', ' '),
        last_visit: row.lastSeenAt.slice(0, 10),
        days_since: row.daysSince,
      })),
    },
  };
}

const PARTNER_KEYS = [
  'live_deals',
  'active_campaigns',
  'voucher_tiers',
  'push_quota',
  'deep_analytics',
  'benchmarks',
  'identified_profiles',
  'export_csv',
  'venues',
  'team_management',
  'assistant_level',
  'support',
];

async function venuePlan(db: Db, scope: PartnerScope): Promise<ToolReply> {
  const plan = await entitlements.planFor(db, { venueId: scope.venueId }, scope.at);
  const ent = await entitlements.entitlementsFor(db, { venueId: scope.venueId }, scope.at);
  const out: Record<string, unknown> = {};
  for (const key of PARTNER_KEYS) {
    const value = ent[key];
    if (value === undefined) continue;
    out[key] = value === 'true' ? true : value === 'false' ? false : Number(value) >= 9999 ? 'unlimited' : value;
  }
  return { data: { plan: plan.name, includes: out } };
}
