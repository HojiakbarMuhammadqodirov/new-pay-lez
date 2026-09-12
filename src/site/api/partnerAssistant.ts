/**
 * The partner assistant, as the server answers it.
 *
 * `dashboardAssistant.tsx` was a scripted conversation — keyword matching in
 * five languages over a table of figures nobody had measured, behind a flag
 * that was never true, so the screen never opened. The server had the real
 * thing the whole time: the partner half of `server/domain/assistant.ts`,
 * behind four routes in `server/http/routes/partner.ts`. This file is what the
 * screen reads it through.
 *
 * ## Four endpoints, one entitlement
 *
 * `GET …/assistant/context` is what the assistant knows about the venue — its
 * facts, and suggestions for where to start. `GET …/assistant/review` is what
 * needs the owner's attention, ranked and capped. `POST …/assistant/ask`
 * answers a question. `POST …/assistant/draft` turns a goal, and optionally a
 * budget, into a configuration the owner checks in the ordinary form — the
 * server says `requiresApproval: true` and has no publish, and neither does
 * anything here.
 *
 * All four refuse with `entitlement_required` on a plan without `assistant`
 * (Starter, today). That refusal is a *state* the screen draws, not a failure
 * it apologises for, and `isPlanLocked` exists so it is never drawn with a
 * retry button: pressing one would spend a request to be told the same thing.
 *
 * ## What comes back is structure, and the screen writes the sentence
 *
 * The partner composer speaks English only (`askPartner` hands `llm.compose`
 * `language: 'en'`), writes money into its prose as raw minor units ("You spent
 * 12000 on …") and interpolates a withheld metric as the word `null`. None of
 * that can be put in front of an owner reading in Polish. What *can* be is what
 * the sentence was built from, which every answer carries: `results[0]` is the
 * heat map, the cost report or the overview the server read. `readAnswer`
 * recognises those three shapes and the empty-venue answer, so the screen can
 * say the same thing from the same figures in the reader's language and
 * currency. A shape it does not recognise is quoted verbatim — the server's own
 * words, marked as English — rather than guessed at.
 *
 * ## No conversation id, and why
 *
 * The consumer dock opens a conversation on the first question. The partner
 * side has nowhere to open one: `POST /v1/assistant/sessions` mints a
 * `side: 'consumer'` session, and the consumer allowance is counted from those
 * transcripts, so borrowing one would spend an owner's *consumer* questions on
 * their venue. The partner `ask` and `draft` routes also take any `sessionId`
 * without checking whose it is — the hole `conversationFor` in
 * `routes/consumer.ts` closed on the other side. So nothing here sends one:
 * questions are answered and not transcribed, which is the smaller of the two
 * wrongs. When a partner-side session route exists it is one field in the two
 * request bodies below.
 */
import { useMemo } from 'react';
import { ApiError, call } from './client';
import { NO_SESSION, noSession, type CostPerNewCustomerBody, type Metric } from './partner';
import { useApi, type ApiResult } from './useApi';

/* ═══════════════════════════════════════════════════════ the server's shapes ══ */

/**
 * `domain/assistant.ts`'s `Fact`, verbatim.
 *
 * `kind` is the stable part and `label` is English. `value` is a count, an
 * amount in the venue's minor units, a status word, a language code or
 * `"weekday:hour"` depending on the kind — and `null` when the min-cohort floor
 * withheld it, which must never be drawn as 0.
 */
export interface AssistantFact {
  kind: string;
  id?: string;
  label: string;
  value?: number | string | null;
}

/** A place to start. `key` is stable; `label` and `detail` are English. */
export interface AssistantSuggestion {
  key: string;
  label: string;
  detail: string;
}

/** `VenueContext` — "what I know about your venue". */
export interface VenueContextBody {
  venueId: string;
  name: string;
  /** Nothing measured yet: the honest new-partner signal, not a failure. */
  empty: boolean;
  facts: AssistantFact[];
  suggestions: AssistantSuggestion[];
}

/** Where the server points. `href` is a dashboard path, not a site route. */
export interface AssistantAction {
  label: string;
  href: string;
}

/** One row of `review` — ranked by `weight`, already capped at five. */
export interface ReviewItem {
  key: string;
  text: string;
  action: AssistantAction;
  weight: number;
}

export interface PartnerAnswer {
  text: string;
  facts: AssistantFact[];
  /** Deliberately `unknown[]`: see `readAnswer`, which is the only reader. */
  results: unknown[];
  action: AssistantAction | null;
  grounding: string[];
  empty: boolean;
}

export type DraftKind = 'hot_deal' | 'campaign' | 'voucher_tiers';

export interface PartnerDraft {
  kind: DraftKind;
  /** The authoring endpoint's own field names — see `dealProposal`. */
  config: Record<string, unknown>;
  /** Minor units of the venue's currency. For a hot deal it echoes the budget sent, or 0. */
  costPreviewMinor: number;
  reasoning: string[];
  requiresApproval: true;
}

/* ═══════════════════════════════════════════════════════════════ the reads ══ */

/**
 * One assistant GET, or the `no-partner-session` state.
 *
 * The same construction as `useVenueApi` in `partner.ts`, repeated rather than
 * exported from there: "there is nobody to ask on behalf of" has to be an
 * error, never a request that sits at `loading` for ever.
 */
function useAssistantRead<T>(venueId: string | null, what: 'context' | 'review'): ApiResult<T> {
  const path =
    venueId === null
      ? null
      : `/v1/partner/venues/${encodeURIComponent(venueId)}/assistant/${what}`;
  const result = useApi<T>(path);

  const unavailable = useMemo<ApiResult<T>>(
    () => ({
      state: {
        status: 'error',
        error: noSession('This device has no partner session on the API.'),
      },
      reload: () => undefined,
    }),
    [],
  );

  return path === null ? unavailable : result;
}

export const useAssistantContext = (venueId: string | null) =>
  useAssistantRead<VenueContextBody>(venueId, 'context');

export const useAssistantReview = (venueId: string | null) =>
  useAssistantRead<ReviewItem[]>(venueId, 'review');

/* ══════════════════════════════════════════════════════════════ the writes ══ */

const assistantPath = (venueId: string, what: 'ask' | 'draft') =>
  `/v1/partner/venues/${encodeURIComponent(venueId)}/assistant/${what}`;

/** One question. `text` is capped at 500 on the server; the composer caps it too. */
export const askAssistant = (input: { venueId: string; text: string; signal?: AbortSignal }) =>
  call<PartnerAnswer>(assistantPath(input.venueId, 'ask'), {
    method: 'POST',
    body: { text: input.text },
    signal: input.signal,
  });

/**
 * A goal, and optionally a budget, as a draft. Nothing is created: the draft
 * comes back as configuration and the owner takes it to the form.
 *
 * `goal` is capped at 400 on the server. `budgetMinor` is minor units of the
 * **venue's** currency, which is not the reader's.
 */
export const draftWithAssistant = (input: {
  venueId: string;
  goal: string;
  budgetMinor?: number;
  signal?: AbortSignal;
}) =>
  call<PartnerDraft>(assistantPath(input.venueId, 'draft'), {
    method: 'POST',
    body:
      input.budgetMinor === undefined
        ? { goal: input.goal }
        : { goal: input.goal, budgetMinor: input.budgetMinor },
    signal: input.signal,
  });

/**
 * The goal sent when a suggestion becomes a draft, in the words `draftFor`
 * reads.
 *
 * `draftFor` decides what to propose by matching the goal against English
 * keywords — "come back" and "more often" make a stamp card, "quiet" aims a deal
 * at the quietest hour, anything else is a plain starting deal. A suggestion
 * pressed in Ukrainian still means the same thing, so the thread shows the
 * reader's own words and the request carries these. Typed goals go as typed,
 * and outside English they mostly land on the plain branch; the screen says so
 * in the reasoning rather than pretending the match happened.
 */
export const DRAFT_GOALS = {
  first_deal: 'Run my first deal',
  stamp_card: 'Start a stamp card so customers come back more often',
  fill_quiet_hour: 'Fill my quietest hour',
} as const;

/**
 * Three questions, in the words `askPartner` routes on.
 *
 * The ask endpoint picks its report by English keywords too: "when" and "quiet"
 * read the heat map, "cost" and "spend" the cost per new customer, and anything
 * else the month's overview. So a question typed in Polish is always answered
 * with the overview — true, and rarely what was asked. These three are the
 * three reports the endpoint can give, offered as presses, with the reader's
 * own wording in the thread and these in the request.
 */
export const ASK_QUESTIONS = {
  quiet: 'When is my venue quietest?',
  cost: 'What did each new customer cost me?',
  month: 'How is this month going?',
} as const;

/* ══════════════════════════════════════════════════════════ the refusals ══ */

/** The plan does not carry `assistant`. A state, never retried. */
export const isPlanLocked = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'entitlement_required';

/** No server on the other end — as opposed to no session, which is not a network fault. */
export const isUnreachable = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 0 && error.code !== NO_SESSION;

/* ════════════════════════════════════════════════ reading what came back ══ */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const isMetric = (value: unknown): value is Metric =>
  isRecord(value) &&
  (value.value === null || isCount(value.value)) &&
  typeof value.suppressed === 'boolean';

/** An hour of the week, venue-local. `weekday` 0 is Monday, as `LocalTime.weekday` counts. */
export interface HourSlot {
  weekday: number;
  hour: number;
  visits: number;
}

const isSlot = (value: unknown): value is HourSlot =>
  isRecord(value) &&
  Number.isInteger(value.weekday) &&
  (value.weekday as number) >= 0 &&
  (value.weekday as number) <= 6 &&
  Number.isInteger(value.hour) &&
  (value.hour as number) >= 0 &&
  (value.hour as number) <= 23 &&
  isCount(value.visits);

const isSuggestion = (value: unknown): value is AssistantSuggestion =>
  isRecord(value) &&
  typeof value.key === 'string' &&
  typeof value.label === 'string' &&
  typeof value.detail === 'string';

/**
 * Which report an answer was built from.
 *
 * `askPartner` has four endings and each puts the thing it read in
 * `results[0]`: nothing measured (the suggestions), the heat map, the cost per
 * new customer, or the month's overview. The shapes are checked field by field
 * rather than inferred from `action.href`, because the figures are what the
 * screen is about to quote — a shape that has the link and not the numbers is
 * `unknown`, and `unknown` is quoted rather than filled.
 */
export type AnswerReading =
  | { shape: 'starts'; suggestions: AssistantSuggestion[] }
  | { shape: 'quiet'; quietest: HourSlot | null; busiest: HourSlot | null; total: number }
  | {
      shape: 'cost';
      spendMinor: number;
      newCustomers: number;
      each: Metric;
      breakdown: CostPerNewCustomerBody['breakdown'] | null;
    }
  | {
      shape: 'overview';
      visits: Metric;
      customers: Metric;
      newCustomers: Metric | null;
      returningCustomers: Metric | null;
      salesMinor: Metric | null;
      averageCheckMinor: Metric | null;
    }
  | { shape: 'unknown' };

export function readAnswer(answer: PartnerAnswer): AnswerReading {
  if (answer.empty) {
    return { shape: 'starts', suggestions: answer.results.filter(isSuggestion) };
  }

  const first = answer.results[0];
  if (!isRecord(first)) return { shape: 'unknown' };

  if (Array.isArray(first.grid) && 'quietest' in first && isCount(first.total)) {
    return {
      shape: 'quiet',
      quietest: isSlot(first.quietest) ? first.quietest : null,
      busiest: isSlot(first.busiest) ? first.busiest : null,
      total: first.total,
    };
  }

  if (
    isCount(first.spendMinor) &&
    isCount(first.newCustomers) &&
    isMetric(first.costPerNewCustomerMinor)
  ) {
    const parts = first.breakdown;
    const breakdown =
      isRecord(parts) &&
      isCount(parts.subscription) &&
      isCount(parts.loyalty) &&
      isCount(parts.vouchers) &&
      isCount(parts.deals)
        ? {
            subscription: parts.subscription,
            loyalty: parts.loyalty,
            vouchers: parts.vouchers,
            deals: parts.deals,
          }
        : null;
    return {
      shape: 'cost',
      spendMinor: first.spendMinor,
      newCustomers: first.newCustomers,
      each: first.costPerNewCustomerMinor,
      breakdown,
    };
  }

  if (isMetric(first.visits) && isMetric(first.customers)) {
    const metric = (key: string): Metric | null => {
      const value = first[key];
      return isMetric(value) ? value : null;
    };
    return {
      shape: 'overview',
      visits: first.visits,
      customers: first.customers,
      newCustomers: metric('newCustomers'),
      returningCustomers: metric('returningCustomers'),
      salesMinor: metric('salesMinor'),
      averageCheckMinor: metric('averageCheckMinor'),
    };
  }

  return { shape: 'unknown' };
}

/** `quiet_window`'s value, `"weekday:hour"`, or null when it is anything else. */
export function slotOf(value: unknown): { weekday: number; hour: number } | null {
  if (typeof value !== 'string') return null;
  const match = /^([0-6]):(\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[2]);
  return hour <= 23 ? { weekday: Number(match[1]), hour } : null;
}

/* ══════════════════════════════════════════ where the server's links go ══ */

/** The dashboard screens an action can land on — ids from `DASH_SCREENS`. */
export type ScreenId = 'overview' | 'deals' | 'campaigns' | 'vouchers' | 'customers' | 'scans';

export type Destination =
  | { kind: 'screen'; screen: ScreenId }
  | { kind: 'drawer'; drawer: 'deal' | 'campaign'; dealId?: string };

/**
 * A server `href`, as a place on this frame — or null.
 *
 * The assistant links to paths like `#/dashboard/deals/:id` and
 * `#/dashboard/budget`, which read like routes and are not: `#/dashboard` is one
 * route whose screens are state, and navigating to one of these would miss the
 * route table and land the owner on the marketing page. So every href is
 * translated into a screen or the drawer, and one that does not translate gets
 * no button at all — a control with nowhere honest to go is not drawn.
 *
 * `budget` goes to the loyalty screen because the two pools are split there;
 * `analytics` goes to the overview because that is where the month's figures
 * and the cost per new customer live on this frame.
 */
export function destinationOf(href: string): Destination | null {
  const match = /^#\/dashboard\/([a-z-]+)(?:\/([^/?#]+))?\/?$/.exec(href.trim());
  if (!match) return null;
  const [, section, rest] = match;

  switch (section) {
    case 'deals': {
      if (rest === undefined) return { kind: 'screen', screen: 'deals' };
      if (rest === 'new') return { kind: 'drawer', drawer: 'deal' };
      try {
        return { kind: 'drawer', drawer: 'deal', dealId: decodeURIComponent(rest) };
      } catch {
        return { kind: 'screen', screen: 'deals' };
      }
    }
    case 'campaigns':
      return rest === 'new'
        ? { kind: 'drawer', drawer: 'campaign' }
        : { kind: 'screen', screen: 'campaigns' };
    case 'budget':
      return { kind: 'screen', screen: 'campaigns' };
    case 'analytics':
    case 'overview':
      return { kind: 'screen', screen: 'overview' };
    case 'vouchers':
    case 'customers':
    case 'scans':
      return { kind: 'screen', screen: section };
    default:
      return null;
  }
}

/* ═══════════════════════════════════════════ a draft, as the form takes it ══ */

/**
 * What a hot-deal draft proposes, in the create drawer's prefill fields.
 *
 * Only what the draft actually carries, and only when it is the right type:
 * a prefill with `capClaims: undefined` would overwrite a form default with
 * nothing, and a weekday outside 0–6 is a form the server would refuse.
 */
export interface DealProposal {
  discountText?: string;
  targetWeekdays?: number[];
  targetFromMin?: number;
  targetToMin?: number;
  capClaims?: number;
}

export interface CampaignProposal {
  name?: string;
  visitsRequired?: number;
  rewardLabel?: string;
  /** Minor units of the venue's currency. */
  rewardCostMinor?: number;
  minSpendMinor?: number;
  rewardValidDays?: number;
}

const countOf = (value: unknown): number | undefined => (isCount(value) ? value : undefined);

const wordsOf = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;

function defined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

export function dealProposal(config: Record<string, unknown>): DealProposal {
  const days = config.targetWeekdays;
  return defined({
    discountText: wordsOf(config.discountText),
    targetWeekdays:
      Array.isArray(days) &&
      days.length > 0 &&
      days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
        ? (days as number[])
        : undefined,
    targetFromMin: countOf(config.targetFromMin),
    targetToMin: countOf(config.targetToMin),
    capClaims: countOf(config.capClaims),
  });
}

export function campaignProposal(config: Record<string, unknown>): CampaignProposal {
  /* `priority` is in the config and not here: the drawer has no field for it,
     and the server's default is the same 0 the draft proposes. */
  return defined({
    name: wordsOf(config.name),
    visitsRequired: countOf(config.visitsRequired),
    rewardLabel: wordsOf(config.rewardLabel),
    rewardCostMinor: countOf(config.rewardCostMinor),
    minSpendMinor: countOf(config.minSpendMinor),
    rewardValidDays: countOf(config.rewardValidDays),
  });
}
