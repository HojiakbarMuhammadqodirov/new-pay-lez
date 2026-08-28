/**
 * The assistant — consumer §10 and partner B8.
 *
 * The architectural claim in both specs is the same and it is the only one that
 * matters: **the model composes from retrieved facts and never invents venues,
 * numbers or config.** So this module is a retrieval layer with a grounded
 * composer on top, and the language model — if one is used at all — sits behind
 * `ports/llm.ts` with the retrieved facts as its only input.
 *
 * That ordering is deliberate. Retrieval first means the assistant's answers are
 * a function of the database, and the worst failure available to it is an
 * awkward sentence rather than a confident lie about a discount that does not
 * exist. Every answer here carries its `grounding` — the ids of the records it
 * was built from — which is stored on the message so any answer can be traced
 * back to what justified it.
 *
 * The composer below is deterministic and produces the shape both specs ask for:
 * "a sentence with a number, plus an action". With no LLM configured it *is* the
 * answer; with one configured it is the prompt's factual payload and the model
 * only rewrites the sentence.
 */
import type { Db } from '../db/db.ts';
import * as llm from '../ports/llm.ts';
import * as analytics from './analytics.ts';
import * as budget from './budget.ts';
import * as deals from './deals.ts';
import * as ledger from './ledger.ts';
import { DomainError } from './errors.ts';
import { newId } from './ids.ts';
import { now, type Iso } from './time.ts';
import { getVenue, venuesOf } from './venues.ts';

export type Side = 'consumer' | 'partner';

export interface Fact {
  kind: string;
  id?: string;
  label: string;
  value?: number | string | null;
  action?: { label: string; href: string };
}

export interface Answer {
  text: string;
  facts: Fact[];
  /** Structured results (venue/deal cards), not free prose (§10.1). */
  results: unknown[];
  action: { label: string; href: string } | null;
  /** The record ids this answer was assembled from. */
  grounding: string[];
  /** True when there was nothing to ground on — see `emptyContext`. */
  empty: boolean;
}

/* ══════════════════════════════════════════════════════ sessions & turns ══ */

export function startConversation(
  db: Db,
  input: { userId: string; side: Side; venueId?: string; language?: string; at?: Iso },
): string {
  const at = input.at ?? now();
  const id = newId('ast');
  db.run(
    `INSERT INTO assistant_sessions (id, user_id, venue_id, side, language, created_at, updated_at)
     VALUES ($i, $u, $v, $s, $l, $t, $t)`,
    {
      i: id,
      u: input.userId,
      v: input.venueId ?? null,
      s: input.side,
      l: input.language ?? 'en',
      t: at,
    },
  );
  return id;
}

function appendMessage(
  db: Db,
  sessionId: string,
  role: 'user' | 'assistant',
  text: string,
  grounding: string[] = [],
  at: Iso = now(),
): void {
  const seq =
    (db.get<{ n: number | null }>(
      `SELECT MAX(seq) AS n FROM assistant_messages WHERE session_id = $s`,
      { s: sessionId },
    )?.n ?? 0) + 1;
  db.run(
    `INSERT INTO assistant_messages (id, session_id, seq, role, text, grounding, created_at)
     VALUES ($i, $s, $q, $r, $t, $g, $at)`,
    {
      i: newId('msg'),
      s: sessionId,
      q: seq,
      r: role,
      t: text,
      g: JSON.stringify(grounding),
      at,
    },
  );
  db.run(`UPDATE assistant_sessions SET updated_at = $t WHERE id = $s`, { t: at, s: sessionId });
}

export const transcript = (db: Db, sessionId: string) =>
  db.all(`SELECT seq, role, text, grounding, created_at FROM assistant_messages
           WHERE session_id = $s ORDER BY seq`, { s: sessionId });

/* ═══════════════════════════════════════════════════════ §10 the consumer ══ */

/**
 * Ask the consumer assistant.
 *
 * Two jobs, decided by what the question is *about* rather than by an intent
 * classifier: if it names something findable, it is a search; if it names the
 * user's own state, it is an explanation. Anything else gets the honest
 * "I don't know, but here is the nearest real thing" of §10.2 — which is a
 * feature, not a fallback.
 */
/**
 * Async because of two lines near the bottom, and only because of them.
 *
 * Everything that decides *what* the answer is stays synchronous and stays
 * here: the retrieval, the figures, the results and the action are all computed
 * from the database before anything leaves this process. `llm.compose` is
 * handed the finished sentence and may return a better-reading one; with no
 * model configured it returns the string it was given, which is the default and
 * the state `verify:api` runs in.
 *
 * The rewrite happens **before** the transcript is written, and that ordering is
 * the point. The stored message is the audit trail — its `grounding` is what
 * lets an answer be traced back to the records that justified it — so persisting
 * the draft while returning the rewrite would leave the trail describing a
 * sentence nobody was ever shown.
 */
export async function askConsumer(
  db: Db,
  input: { sessionId?: string; userId: string; text: string; language?: string; city?: string; at?: Iso },
): Promise<Answer> {
  const at = input.at ?? now();
  const language = input.language ?? 'en';
  const text = input.text.trim().toLowerCase();

  if (input.sessionId) appendMessage(db, input.sessionId, 'user', input.text, [], at);

  const balance = ledger.balance(db, input.userId);
  const answer = /point|balance|punkt|баланс|ball/.test(text)
    ? explainBalance(db, input.userId, balance, input.city, at)
    : /streak|seria|стрик/.test(text)
      ? explainStreak(db, input.userId)
      : /voucher|kupon|ваучер|discount|zniżk/.test(text)
        ? explainVouchers(db, input.userId, balance, input.city, at)
        : searchCatalogue(db, { text, language, city: input.city, userId: input.userId, at });

  answer.text = await llm.compose({
    draft: answer.text,
    facts: answer.facts,
    language,
    side: 'consumer',
  });

  if (input.sessionId) appendMessage(db, input.sessionId, 'assistant', answer.text, answer.grounding, at);
  return answer;
}

function explainBalance(db: Db, userId: string, balance: number, city: string | undefined, at: Iso): Answer {
  /* §10.2's recommendation shape — "640 points is enough for 10% off at 12
     venues near you" — computed from the balance and the tiers, never generated. */
  const reachable = db.all<{ venue_id: string; name: string; discount_pct: number; points_cost: number }>(
    `SELECT t.venue_id, v.name, t.discount_pct, t.points_cost
       FROM voucher_tiers t JOIN venues v ON v.id = t.venue_id
      WHERE t.active = 1 AND v.status = 'live' AND t.points_cost <= $b
        AND ($city IS NULL OR v.city = $city)
      ORDER BY t.discount_pct DESC`,
    { b: balance, city: city ?? null },
  );
  const expiring = ledger.expiringSoon(db, userId, at);
  const best = reachable[0];

  return {
    text: best
      ? `You have ${balance} points — enough for ${best.discount_pct}% off at ${reachable.length} venue${reachable.length === 1 ? '' : 's'} near you.`
      : `You have ${balance} points. The cheapest voucher near you is still a little way off.`,
    facts: [
      { kind: 'balance', label: 'points', value: balance },
      { kind: 'reachable', label: 'venues in reach', value: reachable.length },
      ...(expiring.length
        ? [{ kind: 'expiry', label: 'points expiring soon', value: expiring[0].points }]
        : []),
    ],
    results: reachable.slice(0, 6),
    action: best
      ? { label: `Get ${best.discount_pct}% off at ${best.name}`, href: `#/venue/${best.venue_id}` }
      : { label: 'Play & Earn', href: '#/learn' },
    grounding: reachable.map((row) => row.venue_id),
    empty: false,
  };
}

function explainStreak(db: Db, userId: string): Answer {
  const state = db.get<{ streak: number; longest_streak: number; freezes: number; last_played: string | null }>(
    `SELECT streak, longest_streak, freezes, last_played FROM player_states WHERE user_id = $u`,
    { u: userId },
  );
  if (!state) return emptyContext('You have not played yet.', { label: 'Play & Earn', href: '#/learn' });

  return {
    text: `Your streak is ${state.streak} day${state.streak === 1 ? '' : 's'}${
      state.freezes ? `, with ${state.freezes} freeze${state.freezes === 1 ? '' : 's'} in hand` : ''
    }. Your best is ${state.longest_streak}.`,
    facts: [
      { kind: 'streak', label: 'current', value: state.streak },
      { kind: 'streak', label: 'longest', value: state.longest_streak },
      { kind: 'freezes', label: 'freezes', value: state.freezes },
    ],
    results: [],
    action: { label: 'Play today', href: '#/learn' },
    grounding: [userId],
    empty: false,
  };
}

function explainVouchers(db: Db, userId: string, balance: number, city: string | undefined, at: Iso): Answer {
  const held = db.all<{ id: string; code: string; discount_pct: number; expires_at: string; name: string }>(
    `SELECT i.id, i.code, i.discount_pct, i.expires_at, v.name FROM issued_vouchers i
       JOIN venues v ON v.id = i.venue_id
      WHERE i.user_id = $u AND i.status = 'active' ORDER BY i.expires_at`,
    { u: userId },
  );
  if (held.length === 0) return explainBalance(db, userId, balance, city, at);

  const next = held[0];
  return {
    text: `You have ${held.length} voucher${held.length === 1 ? '' : 's'} to use. The next to expire is ${next.discount_pct}% off at ${next.name}.`,
    facts: held.map((row) => ({
      kind: 'voucher',
      id: row.id,
      label: row.name,
      value: `${row.discount_pct}%`,
    })),
    results: held,
    action: { label: 'Open your wallet', href: '#/vouchers' },
    grounding: held.map((row) => row.id),
    empty: false,
  };
}

/**
 * Natural-language search over the catalogue (§10.1).
 *
 * Returns structured cards, not prose, and matches on the fields a person
 * actually types: the venue's name, its category, its city. Deliberately not
 * fuzzy — a search that confidently returns the wrong café is worse than one
 * that says it found nothing and offers the nearest real thing.
 */
function searchCatalogue(
  db: Db,
  input: { text: string; language: string; city?: string; userId?: string; at: Iso },
): Answer {
  const term = `%${input.text.replace(/[%_]/g, '')}%`;
  const venues = db.all<{ id: string; name: string; category: string; city: string; address: string | null }>(
    `SELECT id, name, category, city, address FROM venues
      WHERE status = 'live' AND deleted_at IS NULL
        AND (LOWER(name) LIKE $q OR LOWER(category) LIKE $q OR LOWER(COALESCE(subcategory,'')) LIKE $q)
        AND ($city IS NULL OR city = $city)
      LIMIT 8`,
    { q: term, city: input.city ?? null },
  );

  const services = db.all<{ id: string; name: string; category_key: string | null; city: string | null }>(
    `SELECT id, name, category_key, city FROM guidance_services
      WHERE active = 1 AND (LOWER(name) LIKE $q OR LOWER(COALESCE(category_key,'')) LIKE $q)
        AND ($city IS NULL OR city = $city)
      LIMIT 8`,
    { q: term, city: input.city ?? null },
  );

  const offers = deals.browse(
    db,
    { userId: input.userId, language: input.language, city: input.city, at: input.at },
    { limit: 6 },
  );

  const total = venues.length + services.length + offers.length;
  if (total === 0) {
    return emptyContext(
      'I could not find that. Here is what is open near you instead.',
      { label: 'Browse deals', href: '#/vouchers' },
    );
  }

  return {
    text: `Found ${venues.length + services.length} place${venues.length + services.length === 1 ? '' : 's'}${
      offers.length ? ` and ${offers.length} live deal${offers.length === 1 ? '' : 's'}` : ''
    }.`,
    facts: [],
    results: [...venues, ...services, ...offers],
    action: null,
    grounding: [...venues.map((v) => v.id), ...services.map((s) => s.id), ...offers.map((d) => d.id)],
    empty: false,
  };
}

const emptyContext = (text: string, action: { label: string; href: string }): Answer => ({
  text,
  facts: [],
  results: [],
  action,
  grounding: [],
  empty: true,
});

/* ══════════════════════════════════════════════════════ B8 the partner side ══ */

export interface VenueContext {
  venueId: string;
  name: string;
  /** True when nothing has been measured yet — the honest empty signal (B8). */
  empty: boolean;
  facts: Fact[];
  /** Starting options: data-free when empty, data-driven when not. */
  suggestions: Array<{ key: string; label: string; detail: string }>;
}

/**
 * "What I know about your venue" (B8).
 *
 * The **new-partner state** is the part worth getting right: with no data, the
 * backend returns an honest empty signal rather than fabricated insight, and a
 * *richer* set of data-free starting options — run a first deal, start a stamp
 * card, set up a points discount. A brand-new partner shown invented benchmarks
 * learns on day one that the numbers here are decoration.
 */
export function venueContext(db: Db, venueId: string, at: Iso = now()): VenueContext {
  const venue = getVenue(db, venueId);
  const view = budget.budgetFor(db, venueId, at);
  const overview = analytics.overview(db, venueId, { at });
  const map = analytics.heatmap(db, venueId, { at });
  const mix = analytics.languageMix(db, venueId, { at });

  const measured = overview.visits.value ?? 0;
  const empty = measured === 0;

  if (empty) {
    return {
      venueId,
      name: venue.name,
      empty: true,
      facts: [
        { kind: 'budget', label: 'unspent budget', value: view.total - view.loyalty.spent - view.voucher.spent },
        { kind: 'status', label: 'listing', value: venue.status },
      ],
      suggestions: [
        {
          key: 'first_deal',
          label: 'Run your first deal',
          detail: 'A time-bound offer anyone can claim. Nothing to configure but the window.',
        },
        {
          key: 'stamp_card',
          label: 'Start a stamp card',
          detail: 'N visits, one fixed reward. You set what it costs you.',
        },
        {
          key: 'points_discount',
          label: 'Set up a points discount',
          detail: 'Three tiers customers can spend points on. Bounded by one monthly budget.',
        },
        {
          key: 'quiet_hours',
          label: "Tell me when you're quiet",
          detail: "I'll learn it as customers visit, but you know it already today.",
        },
      ],
    };
  }

  const facts: Fact[] = [
    { kind: 'visits', label: 'visits this period', value: overview.visits.value },
    { kind: 'customers', label: 'customers', value: overview.customers.value },
    {
      kind: 'budget',
      label: 'available budget',
      value: view.loyalty.available + view.voucher.available,
    },
  ];
  if (map.quietest) {
    facts.push({
      kind: 'quiet_window',
      label: 'quietest hour',
      value: `${map.quietest.weekday}:${map.quietest.hour}`,
    });
  }
  if (!mix.suppressed && mix.rows.length) {
    facts.push({ kind: 'language_mix', label: 'top language', value: mix.rows[0].language });
  }

  const suggestions: Array<{ key: string; label: string; detail: string }> = [];
  if (map.quietest) {
    suggestions.push({
      key: 'fill_quiet_hour',
      label: 'Fill your quietest hour',
      detail: `A deal targeted at ${dayName(map.quietest.weekday)} ${map.quietest.hour}:00, when ${map.quietest.visits} customers came.`,
    });
  }
  const hint = budget.rebalanceHint(view);
  if (hint) {
    suggestions.push({
      key: 'rebalance',
      label: `Move budget to ${hint.to}`,
      detail: `${hint.from} has surplus while ${hint.to} is nearly out.`,
    });
  }
  if (!mix.suppressed && mix.rows.length > 1) {
    suggestions.push({
      key: 'translate',
      label: `Reach your ${mix.rows[1].language} customers`,
      detail: `${Math.round(mix.rows[1].share * 100)}% of your customers read the app in ${mix.rows[1].language}.`,
    });
  }

  return { venueId, name: venue.name, empty: false, facts, suggestions };
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const dayName = (weekday: number) => DAYS[weekday] ?? 'Monday';

export interface Draft {
  kind: 'hot_deal' | 'campaign' | 'voucher_tiers';
  config: Record<string, unknown>;
  /** B8: a cost preview and visible reasoning, both editable, behind Publish. */
  costPreviewMinor: number;
  reasoning: string[];
  /** Never published by the assistant — the partner approves (B8). */
  requiresApproval: true;
}

/**
 * B8 "set up": a plain-language goal plus a budget becomes a complete draft.
 *
 * The draft is validated against the same rules as manual authoring before it
 * can be published, which is why it is returned as configuration rather than as
 * prose — a suggestion the authoring endpoint would reject is not a suggestion,
 * it is a trap.
 */
export function draftFor(
  db: Db,
  input: { venueId: string; goal: string; budgetMinor?: number; at?: Iso },
): Draft {
  const at = input.at ?? now();
  const venue = getVenue(db, input.venueId);
  const context = venueContext(db, input.venueId, at);
  const map = analytics.heatmap(db, input.venueId, { at });
  const goal = input.goal.toLowerCase();

  const reasoning: string[] = [];

  /* The words a partner actually types for "I want repeat custom". Matched on
     the goal rather than on an intent classifier, because the whole draft is
     shown for approval anyway — a wrong guess costs a click, not a campaign. */
  if (/repeat|again|loyal|return|come ?back|more often|regular|retention|wraca/.test(goal)) {
    const cost = Math.max(500, Math.round((venue.avg_check_minor ?? 3200) * 0.3));
    reasoning.push('A visit-based campaign is what buys repeat custom; a percentage is a voucher.');
    reasoning.push(`The reward costs you ${cost} minor units, which is what the reserve holds per earned reward.`);
    return {
      kind: 'campaign',
      config: {
        name: 'Come back three times',
        visitsRequired: 3,
        rewardLabel: 'A free filter coffee',
        rewardCostMinor: cost,
        priority: 0,
        minSpendMinor: venue.min_spend_minor,
      },
      costPreviewMinor: cost * 10,
      reasoning,
      requiresApproval: true,
    };
  }

  if (map.quietest && /quiet|slow|empty|afternoon|midweek/.test(goal)) {
    reasoning.push(
      `${dayName(map.quietest.weekday)} at ${map.quietest.hour}:00 is your quietest open hour (${map.quietest.visits} visits).`,
    );
    reasoning.push('The window is narrow on purpose: a discount that runs all week is a price cut.');
    return {
      kind: 'hot_deal',
      config: {
        targetWeekdays: [map.quietest.weekday],
        targetFromMin: map.quietest.hour * 60,
        targetToMin: (map.quietest.hour + 2) * 60,
        discountText: '15% off',
        capClaims: 50,
      },
      costPreviewMinor: input.budgetMinor ?? 0,
      reasoning,
      requiresApproval: true,
    };
  }

  reasoning.push(
    context.empty
      ? 'Nothing is measured for this venue yet, so this draft is a starting point rather than a finding.'
      : 'Built from this venue’s own visits, budget and language mix.',
  );
  return {
    kind: 'hot_deal',
    config: { discountText: '10% off', capClaims: 100 },
    costPreviewMinor: input.budgetMinor ?? 0,
    reasoning,
    requiresApproval: true,
  };
}

/**
 * B8 "review": everything currently running, against the venue's own data.
 *
 * Ordered and capped. An unranked list of fourteen recommendations is a list
 * nobody acts on, and the cap is what forces the ordering to mean something.
 */
export function review(db: Db, venueId: string, at: Iso = now(), limit = 5) {
  const view = budget.budgetFor(db, venueId, at);
  const out: Array<{ key: string; text: string; action: { label: string; href: string }; weight: number }> = [];

  const stale = db.all<{ id: string; seen_count: number; opened_count: number; claimed_count: number }>(
    `SELECT id, seen_count, opened_count, claimed_count FROM hot_deals
      WHERE venue_id = $v AND status = 'live'`,
    { v: venueId },
  );
  for (const deal of stale) {
    if (deal.seen_count > 200 && deal.claimed_count === 0) {
      out.push({
        key: 'deal_not_converting',
        text: `A live deal has been seen ${deal.seen_count} times and claimed none. The offer or the window is wrong.`,
        action: { label: 'Edit the deal', href: `#/dashboard/deals/${deal.id}` },
        weight: 3,
      });
    }
  }

  const hint = budget.rebalanceHint(view);
  if (hint) {
    out.push({
      key: 'rebalance',
      text: `Your ${hint.to} budget is nearly out while ${hint.from} has surplus.`,
      action: { label: 'Move budget', href: '#/dashboard/budget' },
      weight: 2,
    });
  }

  const idle = db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM campaigns WHERE venue_id = $v AND status = 'active'`,
    { v: venueId },
  );
  if ((idle?.n ?? 0) === 0) {
    out.push({
      key: 'no_campaign',
      text: 'You have no stamp card running. It is the cheapest thing here that buys a second visit.',
      action: { label: 'Start a stamp card', href: '#/dashboard/campaigns' },
      weight: 2,
    });
  }

  return out.sort((a, b) => b.weight - a.weight).slice(0, limit);
}

/**
 * B8 "answer": conversational access to the venue's own analytics.
 *
 * A sentence, a number, and an action — and when the number is suppressed by the
 * minimum cohort, it says so rather than rounding to something reportable.
 */
/** Async for the one reason `askConsumer` is — see the note there. */
export async function askPartner(
  db: Db,
  input: { sessionId?: string; venueId: string; userId: string; text: string; at?: Iso },
): Promise<Answer> {
  const at = input.at ?? now();
  const text = input.text.trim().toLowerCase();
  if (input.sessionId) appendMessage(db, input.sessionId, 'user', input.text, [], at);

  const context = venueContext(db, input.venueId, at);
  if (context.empty) {
    const answer = emptyContext(
      "I have nothing measured for this venue yet — I'll learn as customers visit. Here is what you can start today.",
      { label: context.suggestions[0].label, href: '#/dashboard' },
    );
    answer.facts = context.facts;
    answer.results = context.suggestions;
    if (input.sessionId) appendMessage(db, input.sessionId, 'assistant', answer.text, [], at);
    return answer;
  }

  let answer: Answer;
  if (/quiet|slow|busy|when/.test(text)) {
    const map = analytics.heatmap(db, input.venueId, { at });
    answer = {
      text: map.quietest
        ? `${dayName(map.quietest.weekday)} at ${map.quietest.hour}:00 is your quietest open hour — ${map.quietest.visits} visits this period.`
        : 'Not enough visits yet to find a quiet window.',
      facts: context.facts,
      results: [map],
      action: { label: 'Run a deal then', href: '#/dashboard/deals/new' },
      grounding: [input.venueId],
      empty: false,
    };
  } else if (/cost|spend|budget|roi/.test(text)) {
    const cost = analytics.costPerNewCustomer(db, input.venueId, { at });
    answer = {
      text: cost.costPerNewCustomerMinor.suppressed
        ? 'Too few new customers this period to report a cost per customer without identifying them.'
        : `You spent ${cost.spendMinor} on ${cost.newCustomers} new customers — ${cost.costPerNewCustomerMinor.value} each.`,
      facts: [
        { kind: 'spend', label: 'spend', value: cost.spendMinor },
        { kind: 'new_customers', label: 'new customers', value: cost.newCustomers },
      ],
      results: [cost],
      action: { label: 'See the breakdown', href: '#/dashboard/analytics' },
      grounding: [input.venueId],
      empty: false,
    };
  } else {
    const overview = analytics.overview(db, input.venueId, { at });
    answer = {
      text: `${overview.visits.value} visits from ${overview.customers.value} customers this period.`,
      facts: context.facts,
      results: [overview],
      action: { label: 'Open analytics', href: '#/dashboard/analytics' },
      grounding: [input.venueId],
      empty: false,
    };
  }

  answer.text = await llm.compose({
    draft: answer.text,
    facts: answer.facts,
    /* A partner session is opened in one language and stays in it, and this
       endpoint carries no per-ask language to read. */
    language: 'en',
    side: 'partner',
  });

  if (input.sessionId) appendMessage(db, input.sessionId, 'assistant', answer.text, answer.grounding, at);
  return answer;
}

/** Store the working draft so the dialogue survives a reload (B8). */
export function saveDraft(db: Db, sessionId: string, draft: Draft, at: Iso = now()): void {
  const changed = db.run(`UPDATE assistant_sessions SET draft = $d, updated_at = $t WHERE id = $s`, {
    d: JSON.stringify(draft),
    t: at,
    s: sessionId,
  }).changes;
  if (changed === 0) throw new DomainError('not_found', 'conversation not found');
}

export function loadDraft(db: Db, sessionId: string): Draft | null {
  const row = db.get<{ draft: string | null }>(
    `SELECT draft FROM assistant_sessions WHERE id = $s`,
    { s: sessionId },
  );
  return row?.draft ? (JSON.parse(row.draft) as Draft) : null;
}

/** Venues an owner may point the partner assistant at. */
export const venuesForOwner = (db: Db, ownerId: string) => venuesOf(db, ownerId);
