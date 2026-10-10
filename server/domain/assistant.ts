/**
 * The assistant — consumer §10 and partner B8.
 *
 * The architectural claim in both specs is the same and it is the only one that
 * matters: **the answer is composed from retrieved facts and never invents
 * venues, numbers or config.** There are two ways an answer is made here, and
 * both keep it:
 *
 * - **The model** (`ports/llm.ts`), when `PAYLEZ_LLM=live` and a key are set.
 *   It answers the question itself — anything from "how do I get a PESEL" to
 *   "which game should I play" — but it can only see what the tools in
 *   `assistantTools.ts` read for *this* asker, and every figure it writes is
 *   checked against what they returned before the answer leaves this process.
 * - **The router** below, which is what the assistant was before the model
 *   answered anything: the question is matched on a few words to the balance,
 *   the streak, the vouchers or a catalogue search, and a deterministic
 *   sentence is built from the rows. It answers when the model is off and
 *   whenever the model fails — a timeout, a refusal, a figure it could not
 *   ground — so the endpoint never errors because the model did.
 *
 * Either way the response is the one shape both clients already read — `text`,
 * `facts`, `results`, `action`, `grounding`, `empty` — and the stored message
 * records which of the two answered (`answered_by`). Every answer carries its
 * `grounding`, the ids of the records it was built from, so any answer can be
 * traced back to what justified it.
 */
import type { Db } from '../db/db.ts';
import * as llm from '../ports/llm.ts';
import * as analytics from './analytics.ts';
import * as budget from './budget.ts';
import * as deals from './deals.ts';
import * as ledger from './ledger.ts';
import * as team from './team.ts';
import { consumerTools, partnerTools, type Gathered } from './assistantTools.ts';
import { contextFor, systemFor } from './assistantPrompt.ts';
import { DomainError } from './errors.ts';
import { newId } from './ids.ts';
import { now, type Iso } from './time.ts';
import { averageCheck, getVenue, venuesOf } from './venues.ts';

export type Side = 'consumer' | 'partner';

export interface Fact {
  kind: string;
  id?: string;
  label: string;
  value?: number | string | null;
  /** On a money fact: the currency `value` is in, as minor units. Absent on a count. */
  currency?: string;
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

export async function startConversation(
  db: Db,
  input: { userId: string; side: Side; venueId?: string; language?: string; at?: Iso },
): Promise<string> {
  const at = input.at ?? now();
  const id = newId('ast');
  await db.run(
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

/**
 * The partner conversation a request names, checked against who is asking and
 * about which venue.
 *
 * The partner routes took any `sessionId` they were handed, so a partner could
 * write questions and drafts into somebody else's conversation — and the only way
 * to open one was the consumer route, whose sessions count against the owner's
 * *consumer* question allowance. A named session has to be this caller's, on the
 * partner side, about the venue in the path.
 *
 * One answer for "no such conversation" and for "not yours", as the consumer
 * route's `conversationFor` gives: a refusal that only fires on real ids tells
 * the caller which ids are real.
 */
export async function partnerConversation(
  db: Db,
  input: { sessionId: string; userId: string; venueId: string },
): Promise<string> {
  const session = await db.get<{ user_id: string; side: string; venue_id: string | null }>(
    `SELECT user_id, side, venue_id FROM assistant_sessions WHERE id = $s`,
    { s: input.sessionId },
  );
  if (!session || session.user_id !== input.userId || session.side !== 'partner' || session.venue_id !== input.venueId) {
    throw new DomainError('not_found', 'conversation not found');
  }
  return input.sessionId;
}

/**
 * Which path wrote an answer: the model; the router because the model was
 * tried and failed; or the router because no model is configured. Stored on the
 * message so "is the model actually answering?" is a query, not a guess.
 */
export type AnsweredBy = 'model' | 'fallback' | 'rules';

async function appendMessage(
  db: Db,
  sessionId: string,
  role: 'user' | 'assistant',
  text: string,
  grounding: string[] = [],
  at: Iso = now(),
  answeredBy: AnsweredBy | null = null,
): Promise<void> {
  const seq =
    ((await db.get<{ n: number | null }>(
      `SELECT MAX(seq) AS n FROM assistant_messages WHERE session_id = $s`,
      { s: sessionId },
    ))?.n ?? 0) + 1;
  await db.run(
    `INSERT INTO assistant_messages (id, session_id, seq, role, text, grounding, answered_by, created_at)
     VALUES ($i, $s, $q, $r, $t, $g, $b, $at)`,
    {
      i: newId('msg'),
      s: sessionId,
      q: seq,
      r: role,
      t: text,
      g: JSON.stringify(grounding),
      b: answeredBy,
      at,
    },
  );
  await db.run(`UPDATE assistant_sessions SET updated_at = $t WHERE id = $s`, { t: at, s: sessionId });
}

/**
 * The conversation so far, as the model is shown it: the last few exchanges,
 * oldest first, as plain text.
 *
 * Read **before** the new question is written, so it is the history and not
 * the question. Text only — no tool results, no thinking — which is what keeps
 * a stored conversation replayable to any model on any later day: there is
 * nothing in it bound to the request that produced it. A follow-up that needs a
 * figure again looks it up again.
 */
const HISTORY_MESSAGES = 6;

async function historyOf(db: Db, sessionId: string): Promise<llm.Turn[]> {
  const rows = await db.all<{ role: 'user' | 'assistant'; text: string }>(
    `SELECT role, text FROM assistant_messages WHERE session_id = $s ORDER BY seq DESC LIMIT $n`,
    { s: sessionId, n: HISTORY_MESSAGES },
  );
  return rows.reverse().map((row) => ({ role: row.role, text: row.text.slice(0, 1500) }));
}

/**
 * The response a model answer is returned in — the router's shape, filled from
 * what the tools read.
 *
 * - `facts` are the candidates whose figure the sentence actually writes: the
 *   receipt under an answer is the figures *it* used, not everything looked at.
 * - `results` are the rows a search or a place lookup read (or, for an answer
 *   about spending points, the voucher rungs within reach) — the cards both
 *   clients draw. The partner dashboard reads `results[0]` as one of its three
 *   reports, so a partner answer carries none: its sentence *is* the answer.
 * - `action` is the heaviest destination a tool proposed, or none.
 */
function assemble(text: string, gathered: Gathered, side: Side): Answer {
  const facts: Fact[] = [];
  const seen = new Set<string>();
  for (const { fact, match } of gathered.candidates) {
    const key = `${fact.kind}|${fact.label}|${String(fact.value)}`;
    if (seen.has(key) || !llm.mentions(text, match)) continue;
    seen.add(key);
    facts.push(fact);
    if (facts.length === 6) break;
  }

  const rows = (list: Array<Record<string, unknown>>, max: number) => {
    const out: Array<Record<string, unknown>> = [];
    const keys = new Set<string>();
    for (const row of list) {
      const key = `${String(row.id ?? row.venue_id)}|${String(row.name)}|${String(row.discount_pct ?? '')}`;
      if (keys.has(key)) continue;
      keys.add(key);
      out.push(row);
      if (out.length === max) break;
    }
    return out;
  };
  const results =
    side === 'partner' ? [] : gathered.places.length > 0 ? rows(gathered.places, 8) : rows(gathered.tiers, 6);

  let action: Answer['action'] = null;
  let weight = -Infinity;
  for (const entry of gathered.actions) {
    if (entry.weight > weight) {
      weight = entry.weight;
      action = entry.action;
    }
  }

  return { text, facts, results, action, grounding: [...new Set(gathered.grounding)], empty: false };
}

/* Scoped to the asker. It read any conversation by id alone, so a leaked id —
   in a log, a screenshot, a shared device — was somebody else's transcript,
   and a partner's holds their business numbers. Somebody else's id answers
   exactly like an id that does not exist: an empty list. */
export const transcript = async (db: Db, sessionId: string, userId: string) =>
  await db.all(`SELECT m.seq, m.role, m.text, m.grounding, m.created_at FROM assistant_messages m
           JOIN assistant_sessions s ON s.id = m.session_id
           WHERE m.session_id = $s AND s.user_id = $u ORDER BY m.seq`, { s: sessionId, u: userId });

/* ═══════════════════════════════════════════════════════ §10 the consumer ══ */

/**
 * Ask the consumer assistant.
 *
 * The model first, when there is one; the router when there is not or when the
 * model could not produce a grounded answer. Both answers are written to the
 * transcript the same way, so the daily meter (`assistantAsksToday`, counted
 * off the user rows) and the audit trail do not care which one answered.
 *
 * The answer is written **after** it is final — the model's checked text or the
 * router's sentence — because the stored message is the audit trail, and a
 * trail describing a sentence nobody was shown is no trail.
 */
export async function askConsumer(
  db: Db,
  input: { sessionId?: string; userId: string; text: string; language?: string; city?: string; at?: Iso },
): Promise<Answer> {
  const at = input.at ?? now();
  const language = input.language ?? 'en';

  const history = input.sessionId ? await historyOf(db, input.sessionId) : [];
  if (input.sessionId) await appendMessage(db, input.sessionId, 'user', input.text, [], at);

  let answer: Answer | null = null;
  let by: AnsweredBy = 'rules';
  if (llm.mode() === 'live') {
    answer = await modelForConsumer(db, { ...input, language, at }, history);
    by = answer ? 'model' : 'fallback';
  }
  answer ??= await routeConsumer(db, { ...input, language, at });

  if (input.sessionId) await appendMessage(db, input.sessionId, 'assistant', answer.text, answer.grounding, at, by);
  return answer;
}

async function modelForConsumer(
  db: Db,
  input: { userId: string; text: string; language: string; city?: string; at: Iso },
  history: llm.Turn[],
): Promise<Answer | null> {
  const user = await db.get<{ city: string | null; country_code: string | null }>(
    `SELECT city, country_code FROM users WHERE id = $u`,
    { u: input.userId },
  );
  const city = input.city ?? user?.city ?? undefined;
  const box = consumerTools(db, { userId: input.userId, language: input.language, city, at: input.at });
  const result = await llm.ask({
    system: await systemFor(db, 'consumer'),
    context: contextFor({ at: input.at, language: input.language, city, country: user?.country_code }),
    tools: box.specs,
    history,
    question: input.text,
    run: box.run,
  });
  return result.ok ? assemble(result.text, box.gathered, 'consumer') : null;
}

/**
 * The router: what the assistant answers with no model, and after a failed one.
 *
 * Two jobs, decided by what the question is *about* rather than by an intent
 * classifier: if it names the user's own state, it is an explanation; anything
 * else is a search, and a search that finds nothing gets the honest "I could
 * not find that" of §10.2 with the nearest real thing to do.
 */
async function routeConsumer(
  db: Db,
  input: { userId: string; text: string; language: string; city?: string; at: Iso },
): Promise<Answer> {
  const text = input.text.trim().toLowerCase();
  const balance = await ledger.balance(db, input.userId);
  return /point|balance|punkt|баланс|ball/.test(text)
    ? await explainBalance(db, balance, input.city)
    : /streak|seria|стрик/.test(text)
      ? await explainStreak(db, input.userId)
      : /voucher|kupon|ваучер|discount|zniżk/.test(text)
        ? await explainVouchers(db, input.userId, balance, input.city)
        : await searchCatalogue(db, { text, language: input.language, city: input.city, userId: input.userId, at: input.at });
}

async function explainBalance(db: Db, balance: number, city: string | undefined): Promise<Answer> {
  /* §10.2's recommendation shape — "640 points is enough for 10% off at 12
     venues near you" — computed from the balance and the tiers, never generated. */
  const reachable = await db.all<{ venue_id: string; name: string; discount_pct: number; points_cost: number }>(
    `SELECT t.venue_id, v.name, t.discount_pct, t.points_cost
       FROM voucher_tiers t JOIN venues v ON v.id = t.venue_id
      WHERE t.active = 1 AND v.status = 'live' AND t.points_cost <= $b
        AND ($city IS NULL OR v.city = $city)
      ORDER BY t.discount_pct DESC`,
    { b: balance, city: city ?? null },
  );
  const best = reachable[0];

  return {
    text: best
      ? `You have ${balance} points — enough for ${best.discount_pct}% off at ${reachable.length} venue${reachable.length === 1 ? '' : 's'} near you.`
      : `You have ${balance} points. The cheapest voucher near you is still a little way off.`,
    facts: [
      { kind: 'balance', label: 'points', value: balance },
      { kind: 'reachable', label: 'venues in reach', value: reachable.length },
      /* There was a third fact here — "points expiring soon" — and it is gone
         with the expiry itself. Points do not expire on any plan now, so the
         honest thing is to stop saying it rather than to say it about zero:
         a nudge to spend before a deadline that no longer exists is the
         assistant inventing urgency, which is the one thing this file is
         built not to do. */
    ],
    results: reachable.slice(0, 6),
    action: best
      ? { label: `Get ${best.discount_pct}% off at ${best.name}`, href: `#/venue/${best.venue_id}` }
      : { label: 'Play & Earn', href: '#/learn' },
    grounding: reachable.map((row) => row.venue_id),
    empty: false,
  };
}

async function explainStreak(db: Db, userId: string): Promise<Answer> {
  const state = await db.get<{ streak: number; longest_streak: number; freezes: number; last_played: string | null }>(
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

async function explainVouchers(db: Db, userId: string, balance: number, city: string | undefined): Promise<Answer> {
  const held = await db.all<{ id: string; code: string; discount_pct: number; expires_at: string; name: string }>(
    `SELECT i.id, i.code, i.discount_pct, i.expires_at, v.name FROM issued_vouchers i
       JOIN venues v ON v.id = i.venue_id
      WHERE i.user_id = $u AND i.status = 'active' ORDER BY i.expires_at`,
    { u: userId },
  );
  if (held.length === 0) return await explainBalance(db, balance, city);

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
async function searchCatalogue(
  db: Db,
  input: { text: string; language: string; city?: string; userId?: string; at: Iso },
): Promise<Answer> {
  const term = `%${input.text.replace(/[%_]/g, '')}%`;
  const venues = await db.all<{ id: string; name: string; category: string; city: string; address: string | null }>(
    `SELECT id, name, category, city, address FROM venues
      WHERE status = 'live' AND deleted_at IS NULL
        AND (LOWER(name) LIKE $q OR LOWER(category) LIKE $q OR LOWER(COALESCE(subcategory,'')) LIKE $q)
        AND ($city IS NULL OR city = $city)
      LIMIT 8`,
    { q: term, city: input.city ?? null },
  );

  const services = await db.all<{ id: string; name: string; category_key: string | null; city: string | null }>(
    `SELECT id, name, category_key, city FROM guidance_services
      WHERE active = 1 AND (LOWER(name) LIKE $q OR LOWER(COALESCE(category_key,'')) LIKE $q)
        AND ($city IS NULL OR city = $city)
      LIMIT 8`,
    { q: term, city: input.city ?? null },
  );

  const offers = await deals.browse(
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
export async function venueContext(db: Db, venueId: string, at: Iso = now()): Promise<VenueContext> {
  const venue = await getVenue(db, venueId);
  const view = await budget.budgetFor(db, venueId, at);
  const overview = await analytics.overview(db, venueId, { at });
  const map = await analytics.heatmap(db, venueId, { at });
  const mix = await analytics.languageMix(db, venueId, { at });

  const measured = overview.visits.value ?? 0;
  const empty = measured === 0;

  if (empty) {
    return {
      venueId,
      name: venue.name,
      empty: true,
      facts: [
        {
          kind: 'budget',
          label: 'unspent budget',
          value: view.total - view.loyalty.spent - view.voucher.spent,
          currency: venue.currency,
        },
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
      currency: venue.currency,
    },
  ];
  /* `heatmap` names a quietest open hour even over no visits at all — every
     hour ties at nothing — so it is only a finding when something was counted. */
  const quiet = map.total > 0 ? map.quietest : null;
  if (quiet) {
    facts.push({
      kind: 'quiet_window',
      label: 'quietest hour',
      value: `${quiet.weekday}:${quiet.hour}`,
    });
  }
  if (!mix.suppressed && mix.rows.length) {
    facts.push({ kind: 'language_mix', label: 'top language', value: mix.rows[0].language });
  }

  const suggestions: Array<{ key: string; label: string; detail: string }> = [];
  if (quiet) {
    suggestions.push({
      key: 'fill_quiet_hour',
      label: 'Fill your quietest hour',
      detail: `A deal targeted at ${dayName(quiet.weekday)} ${quiet.hour}:00, when ${quiet.visits} customers came.`,
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
export async function draftFor(
  db: Db,
  input: { venueId: string; goal: string; budgetMinor?: number; at?: Iso },
): Promise<Draft> {
  const at = input.at ?? now();
  const venue = await getVenue(db, input.venueId);
  const context = await venueContext(db, input.venueId, at);
  const map = await analytics.heatmap(db, input.venueId, { at });
  const goal = input.goal.toLowerCase();

  const reasoning: string[] = [];

  /* The words a partner actually types for "I want repeat custom". Matched on
     the goal rather than on an intent classifier, because the whole draft is
     shown for approval anyway — a wrong guess costs a click, not a campaign. */
  if (/repeat|again|loyal|return|come ?back|more often|regular|retention|wraca/.test(goal)) {
    /* The average the owner set or chose on the Vouchers screen, the same one
       every voucher reserve is built from. */
    const cost = Math.max(500, Math.round((await averageCheck(db, venue, at)).minor * 0.3));
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
export async function review(db: Db, venueId: string, at: Iso = now(), limit = 5) {
  const view = await budget.budgetFor(db, venueId, at);
  const out: Array<{ key: string; text: string; action: { label: string; href: string }; weight: number }> = [];

  const stale = await db.all<{ id: string; seen_count: number; opened_count: number; claimed_count: number }>(
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

  const idle = await db.get<{ n: number }>(
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
 * The model first, with the partner toolbox — every tool reads this one venue
 * and re-checks, on every call, that the asker still manages it. The router
 * otherwise: a sentence, a number and an action from the report the question's
 * words point at, and when the number is suppressed by the minimum cohort it
 * says so rather than rounding to something reportable.
 *
 * The access check is here as well as on the route. The route already refuses a
 * venue the caller does not manage; this is so the *model* is never called on
 * one, whoever calls this function.
 */
export async function askPartner(
  db: Db,
  input: { sessionId?: string; venueId: string; userId: string; text: string; language?: string; at?: Iso },
): Promise<Answer> {
  const at = input.at ?? now();
  const language = input.language ?? 'en';
  await team.requireManage(db, input.venueId, input.userId);

  const history = input.sessionId ? await historyOf(db, input.sessionId) : [];
  if (input.sessionId) await appendMessage(db, input.sessionId, 'user', input.text, [], at);

  let answer: Answer | null = null;
  let by: AnsweredBy = 'rules';
  if (llm.mode() === 'live') {
    answer = await modelForPartner(db, { ...input, language, at }, history);
    by = answer ? 'model' : 'fallback';
  }
  answer ??= await routePartner(db, { venueId: input.venueId, text: input.text, at });

  if (input.sessionId) await appendMessage(db, input.sessionId, 'assistant', answer.text, answer.grounding, at, by);
  return answer;
}

async function modelForPartner(
  db: Db,
  input: { venueId: string; userId: string; text: string; language: string; at: Iso },
  history: llm.Turn[],
): Promise<Answer | null> {
  const venue = await getVenue(db, input.venueId);
  const box = partnerTools(db, { userId: input.userId, venueId: input.venueId, language: input.language, at: input.at });
  const result = await llm.ask({
    system: await systemFor(db, 'partner'),
    context: contextFor({
      at: input.at,
      language: input.language,
      venue: { name: venue.name, city: venue.city, currency: venue.currency, timezone: venue.timezone },
    }),
    tools: box.specs,
    history,
    question: input.text,
    run: box.run,
  });
  return result.ok ? assemble(result.text, box.gathered, 'partner') : null;
}

async function routePartner(db: Db, input: { venueId: string; text: string; at: Iso }): Promise<Answer> {
  const at = input.at;
  const text = input.text.trim().toLowerCase();
  const context = await venueContext(db, input.venueId, at);
  if (context.empty) {
    const answer = emptyContext(
      "I have nothing measured for this venue yet — I'll learn as customers visit. Here is what you can start today.",
      { label: context.suggestions[0].label, href: '#/dashboard' },
    );
    answer.facts = context.facts;
    answer.results = context.suggestions;
    return answer;
  }

  let answer: Answer;
  if (/quiet|slow|busy|when/.test(text)) {
    const map = await analytics.heatmap(db, input.venueId, { at });
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
    const cost = await analytics.costPerNewCustomer(db, input.venueId, { at });
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
    const overview = await analytics.overview(db, input.venueId, { at });
    answer = {
      text: `${overview.visits.value} visits from ${overview.customers.value} customers this period.`,
      facts: context.facts,
      results: [overview],
      action: { label: 'Open analytics', href: '#/dashboard/analytics' },
      grounding: [input.venueId],
      empty: false,
    };
  }
  return answer;
}

/** Store the working draft so the dialogue survives a reload (B8). */
export async function saveDraft(db: Db, sessionId: string, draft: Draft, at: Iso = now()): Promise<void> {
  const changed = (await db.run(`UPDATE assistant_sessions SET draft = $d, updated_at = $t WHERE id = $s`, {
    d: JSON.stringify(draft),
    t: at,
    s: sessionId,
  })).changes;
  if (changed === 0) throw new DomainError('not_found', 'conversation not found');
}

export async function loadDraft(db: Db, sessionId: string): Promise<Draft | null> {
  const row = await db.get<{ draft: string | null }>(
    `SELECT draft FROM assistant_sessions WHERE id = $s`,
    { s: sessionId },
  );
  return row?.draft ? (JSON.parse(row.draft) as Draft) : null;
}

/** Venues an owner may point the partner assistant at. */
export const venuesForOwner = async (db: Db, ownerId: string) => await venuesOf(db, ownerId);
