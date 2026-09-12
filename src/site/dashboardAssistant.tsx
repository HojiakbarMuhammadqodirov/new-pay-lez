import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { DASH_SCREENS, SALES_EMAIL } from './content';
import { Icon, type IconName } from './icons';
import {
  useCopy,
  useCurrency,
  useLanguage,
  useMoney,
  type LanguageCode,
} from './i18n/context';
import { fill } from './i18n/currency';
import type { ApiError } from './api/client';
import type { ApiResult } from './api/useApi';
import {
  euroToMinor,
  isNoSession,
  minorToEuro,
  usePartnerBudget,
  usePartnerDeals,
  usePartnerVenue,
  type BudgetBody,
  type DealResponse,
  type Metric,
  type PartnerVenue,
} from './api/partner';
import {
  ASK_QUESTIONS,
  DRAFT_GOALS,
  askAssistant,
  campaignProposal,
  dealProposal,
  destinationOf,
  draftWithAssistant,
  isPlanLocked,
  isUnreachable,
  readAnswer,
  slotOf,
  useAssistantContext,
  useAssistantReview,
  type AssistantFact,
  type AssistantSuggestion,
  type DealProposal,
  type Destination,
  type PartnerAnswer,
  type PartnerDraft,
  type ReviewItem,
  type VenueContextBody,
} from './api/partnerAssistant';
import { useNum } from './dashboardFormat';
import { useDashboard, type DrawerPrefill } from './dashboardShell';

/**
 * The assistant — the one dashboard screen that talks back, and now the one
 * that talks to the server.
 *
 * It was the prototype's conversation rebuilt: keyword matching in five
 * languages, a draft that defended itself line by line, and every figure in
 * every sentence filled from `PD_ASSIST` in `partnerMetrics.ts`. Once the seeds
 * were purged those figures were zeros, so the screen refused to open — and
 * rightly for good, because that conversation quoted things the server does not
 * measure at all (a peer comparison, a free-item multiple, a Russian-speaking
 * share). Wiring it was never a fetch. It was this rewrite.
 *
 * What it is now is `api/partnerAssistant.ts`, drawn honestly:
 *
 * - **What it knows** is `GET …/assistant/context`'s facts and nothing else —
 *   the same list every answer is built from, so that panel is the receipt for
 *   the whole screen. A new venue gets the server's own empty signal and the
 *   starting points it offers, never a benchmark nobody measured.
 * - **What needs attention** is `GET …/assistant/review`. Every row's link is
 *   translated into a place on this frame (`destinationOf`), because the
 *   server's `#/dashboard/deals/:id` is not a route this site has.
 * - **The thread** asks or drafts, one request at a time. The thinking turn
 *   goes where the answer will land, the facts are drawn under the answer as its
 *   receipt, and the one pressable thing in a reply is the place the server
 *   pointed at. A refusal is not an error: "not on this plan" has no retry;
 *   "the server is not there" and "it broke" do.
 * - **A draft is handed to the form, never published.** The server says
 *   `requiresApproval: true` and has no publish. "Open in the form" is
 *   `openDrawer` with the draft as its prefill, and the owner files it there.
 *
 * ## The sentences are written here, from the server's figures
 *
 * The partner composer answers in English, writes money into its prose as raw
 * minor units and prints a withheld metric as `null` — see the header of
 * `api/partnerAssistant.ts`. So for every shape it recognises, this screen says
 * the same thing from the same structured result, in the reader's language and
 * currency; a shape it does not recognise is quoted verbatim and marked as
 * English. **Every figure still arrives through a `fill()` hole, and every hole
 * is filled from the response.** Nothing here computes a number the server did
 * not send, beyond dividing two that it did.
 */

/* ────────────────────────────────────────────────────────────────── voice ── */

/*
 * The locale each dictionary is read in, for the handful of words `Intl` knows
 * better than a dictionary does — weekday names, language names and how a list
 * of days joins. Digit grouping is not among them: counts and money go through
 * `useNum` and `useMoney`, whose grouping belongs to the language (root
 * `CLAUDE.md`), so a figure here breaks its thousands like every other figure
 * on the dashboard.
 */
const LOCALES: Record<LanguageCode, string> = {
  en: 'en-GB',
  pl: 'pl-PL',
  uz: 'uz-Latn-UZ',
  ru: 'ru-RU',
  uk: 'uk-UA',
};

type Copy = ReturnType<typeof useCopy>['dashboard']['assistant'];

/** Everything a sentence on this screen needs to turn a server figure into words. */
interface Voice {
  count: (value: number) => string;
  /** Minor units of the *venue's* currency, out in the reader's. */
  amount: (minor: number, round?: 'exact' | 'unit') => string;
  /** A metric, or null when it was withheld — never a zero standing in. */
  metric: (metric: Metric | null, as?: 'count' | 'amount' | 'unit') => string | null;
  when: (weekday: number, hour: number) => string;
  days: (weekdays: number[]) => string;
  window: (fromMin: number, toMin: number) => string;
  language: (code: string) => string | null;
  capital: (text: string) => string;
}

function useVoice(currency: string): Voice {
  const [language] = useLanguage();
  const money = useMoney();
  const num = useNum();

  const intl = useMemo(() => {
    const locale = LOCALES[language];
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([locale], { type: 'language' });
    } catch {
      names = null;
    }
    return {
      locale,
      weekday: new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }),
      list: new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }),
      names,
    };
  }, [language]);

  const clock = (minutes: number) => {
    const at = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
    return `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`;
  };
  /* 1 January 2024 was a Monday, so day `n` of that week is weekday `n` in the
     server's count — and formatting it in UTC keeps the device's own zone out
     of a weekday that is already venue-local. */
  const day = (weekday: number) => intl.weekday.format(new Date(Date.UTC(2024, 0, 1 + weekday)));
  const amount = (minor: number, round: 'exact' | 'unit' = 'exact') =>
    money(minorToEuro(minor, currency), round);

  return {
    count: num,
    amount,
    metric: (metric, as = 'count') => {
      if (metric === null || metric.value === null) return null;
      return as === 'count' ? num(metric.value) : amount(metric.value, as === 'unit' ? 'unit' : 'exact');
    },
    when: (weekday, hour) => `${day(weekday)} ${clock(hour * 60)}`,
    days: (weekdays) =>
      intl.list.format([...new Set(weekdays)].sort((a, b) => a - b).map(day)),
    window: (from, to) => `${clock(from)}–${clock(to)}`,
    language: (code) => {
      try {
        const name = intl.names?.of(code);
        if (!name || name.toLowerCase() === code.toLowerCase()) return null;
        return name.charAt(0).toLocaleUpperCase(intl.locale) + name.slice(1);
      } catch {
        return null;
      }
    },
    capital: (text) => text.charAt(0).toLocaleUpperCase(intl.locale) + text.slice(1),
  };
}

/* ────────────────────────────────────────────────────────────────── lines ── */

/** A label and a value, which is what every list on this screen is made of. */
interface Line {
  key: string;
  label: string;
  /** `null` is "not reported": an em dash, never a 0. */
  value: string | null;
  /** The min-cohort floor held it back, and the dash says so on hover. */
  withheld: boolean;
  /** The server's own English, quoted because nothing here could translate it. */
  quoted: boolean;
}

const lineOf = (key: string, label: string, value: string | null, withheld = false): Line => ({
  key,
  label,
  value,
  withheld,
  quoted: false,
});

function Shown({ line }: { line: Line }) {
  const dashboard = useCopy().dashboard;
  if (line.value !== null) return <>{line.value}</>;
  return (
    <span
      className="pd-withheld"
      title={line.withheld ? dashboard.unmeasured.withheld : undefined}
    >
      —
    </span>
  );
}

/**
 * The server's facts, in the reader's words.
 *
 * By `kind`, which is the stable half of a fact; `label` is English and is only
 * shown for a kind this screen has never heard of. The budget is labelled by
 * which of the two the server sent — money not yet spent on an empty venue,
 * money still available on one that trades — because they are different sums
 * under one kind.
 */
function factLines(facts: AssistantFact[], empty: boolean, copy: Copy, voice: Voice): Line[] {
  const statuses = copy.statuses as Record<string, string | undefined>;

  return facts.map((fact, index) => {
    const key = `${fact.kind}-${fact.id ?? index}`;
    const number =
      typeof fact.value === 'number' && Number.isFinite(fact.value) ? fact.value : null;
    const text = typeof fact.value === 'string' ? fact.value : null;

    switch (fact.kind) {
      case 'visits':
        return lineOf(key, copy.facts.visits, number === null ? null : voice.count(number));
      case 'customers':
        /* A customer count is a finding about people, so null here is the
           min-cohort floor rather than a missing field. */
        return lineOf(
          key,
          copy.facts.customers,
          number === null ? null : voice.count(number),
          number === null,
        );
      case 'new_customers':
        return lineOf(key, copy.facts.newCustomers, number === null ? null : voice.count(number));
      case 'budget':
        return lineOf(
          key,
          empty ? copy.facts.budgetUnspent : copy.facts.budgetAvailable,
          number === null ? null : voice.amount(number),
        );
      case 'spend':
        return lineOf(key, copy.facts.spend, number === null ? null : voice.amount(number));
      case 'status':
        return lineOf(key, copy.facts.listing, text === null ? null : (statuses[text] ?? null));
      case 'quiet_window': {
        const slot = slotOf(fact.value);
        return lineOf(
          key,
          copy.facts.quietest,
          slot ? voice.capital(voice.when(slot.weekday, slot.hour)) : null,
        );
      }
      case 'language_mix':
        return lineOf(key, copy.facts.topLanguage, text === null ? null : voice.language(text));
      default:
        return {
          key,
          label: fact.label,
          value: number !== null ? voice.count(number) : text,
          withheld: false,
          quoted: true,
        };
    }
  });
}

/* ───────────────────────────────────────────────────────── where things go ── */

/**
 * What pressing a suggestion does, by its key.
 *
 * Three become drafts, because a draft is what the server can build for them.
 * The other four go straight to the place that does the job: the voucher ladder
 * lives on Vouchers and the two pools are split on the loyalty screen; "tell me
 * when you are quiet" is the deal form's days and hours, because there is no
 * endpoint that records quiet hours and asking the draft endpoint would aim a
 * deal at an hour picked from zero visits; and reaching another language is the
 * deal copy, which is on Hot deals. A key this screen does not know is asked as
 * a question, which the server always answers from the venue's own figures.
 */
type Move = { kind: 'draft'; goal: string } | { kind: 'go'; to: Destination } | { kind: 'ask' };

const SUGGESTION_MOVES: Record<string, Move> = {
  first_deal: { kind: 'draft', goal: DRAFT_GOALS.first_deal },
  stamp_card: { kind: 'draft', goal: DRAFT_GOALS.stamp_card },
  fill_quiet_hour: { kind: 'draft', goal: DRAFT_GOALS.fill_quiet_hour },
  points_discount: { kind: 'go', to: { kind: 'screen', screen: 'vouchers' } },
  quiet_hours: { kind: 'go', to: { kind: 'drawer', drawer: 'deal' } },
  rebalance: { kind: 'go', to: { kind: 'screen', screen: 'campaigns' } },
  translate: { kind: 'go', to: { kind: 'screen', screen: 'deals' } },
};

const moveOf = (key: string): Move =>
  Object.hasOwn(SUGGESTION_MOVES, key) ? SUGGESTION_MOVES[key] : { kind: 'ask' };

function iconOf(move: Move): IconName {
  if (move.kind === 'draft') return 'spark';
  if (move.kind === 'ask') return 'send';
  return move.to.kind === 'drawer' ? 'plus' : 'arrow';
}

/** A destination's label and the press that reaches it, in one place. */
function useDestinations() {
  const dashboard = useCopy().dashboard;
  const { goTo, openDrawer } = useDashboard();

  return {
    label: (to: Destination): string | null => {
      if (to.kind === 'screen') {
        const index = DASH_SCREENS.findIndex((entry) => entry.id === to.screen);
        return index >= 0 ? dashboard.screens[index].name : null;
      }
      if (to.drawer === 'campaign') return dashboard.actions.newCampaign;
      return to.dealId ? dashboard.assistant.actions.editDeal : dashboard.actions.newDeal;
    },
    go: (to: Destination, prefill?: DrawerPrefill) => {
      if (to.kind === 'screen') goTo(to.screen);
      else openDrawer(to.drawer, to.dealId, prefill);
    },
  };
}

/** A suggestion in the reader's language — or the server's English for a key nobody translated. */
function suggestionWords(
  suggestion: AssistantSuggestion,
  copy: Copy,
  voice: Voice,
  quiet: { weekday: number; hour: number } | null,
): { label: string; detail: string; quoted: boolean } {
  if (suggestion.key === 'fill_quiet_hour') {
    return {
      label: copy.suggestions.fill_quiet_hour.label,
      /* The hour comes from the context's own `quiet_window` fact. The server's
         detail also names how many came in that hour, and that count is only
         in its English prose — so it is left out rather than parsed out. */
      detail: quiet
        ? fill(copy.suggestions.fill_quiet_hour.detail, {
            when: voice.when(quiet.weekday, quiet.hour),
          })
        : copy.quietPlain,
      quoted: false,
    };
  }
  const known = (copy.suggestions as Record<string, { label: string; detail: string } | undefined>)[
    suggestion.key
  ];
  return known && Object.hasOwn(copy.suggestions, suggestion.key)
    ? { label: known.label, detail: known.detail, quoted: false }
    : { label: suggestion.label, detail: suggestion.detail, quoted: true };
}

/* ─────────────────────────────────────────────────────────────── the turns ── */

type DraftRequest = {
  mode: 'draft';
  goal: string;
  budgetMinor?: number;
  /** What the thread shows as the owner's words. */
  shown: string;
  /** The budget as they typed it, under their words. */
  note?: string;
};

type Request = { mode: 'ask'; text: string; shown: string } | DraftRequest;

/**
 * One entry in the thread — a union rather than a row with optional fields, for
 * the dock's reason: the states are different things to draw, and the compiler
 * should be what notices one that is not handled.
 */
type Turn =
  | { id: number; from: 'you'; text: string; note?: string }
  | { id: number; from: 'it'; state: 'thinking' }
  | { id: number; from: 'it'; state: 'answer'; answer: PartnerAnswer }
  | { id: number; from: 'it'; state: 'draft'; draft: PartnerDraft; asked: DraftRequest }
  | {
      id: number;
      from: 'it';
      state: 'error';
      kind: 'locked' | 'offline' | 'failed';
      detail: string | null;
      /** What a retry re-sends, and the owner's turn it replaces. */
      request: Request;
      pair: number;
    };

type ErrorTurn = Extract<Turn, { state: 'error' }>;

/**
 * An answer, written from the report it was built from.
 *
 * `readAnswer` says which report that was; this says it in words. Rows are text
 * and deliberately not pressable — the one pressable thing is the place the
 * server pointed at, translated to this frame, and a link that translates to
 * nowhere is not drawn.
 */
function AnswerTurn({
  answer,
  context,
  voice,
  onStart,
}: {
  answer: PartnerAnswer;
  context: VenueContextBody;
  voice: Voice;
  onStart: (suggestion: AssistantSuggestion) => void;
}) {
  const copy = useCopy().dashboard.assistant;
  const destinations = useDestinations();
  const reading = readAnswer(answer);
  const quiet = slotOf(context.facts.find((fact) => fact.kind === 'quiet_window')?.value);

  const pointed = answer.action ? destinationOf(answer.action.href) : null;
  const pointAt = (label?: string, prefill?: DrawerPrefill) => {
    if (!pointed) return null;
    const text = label ?? destinations.label(pointed);
    return text ? { label: text, run: () => destinations.go(pointed, prefill) } : null;
  };

  let sentence = answer.text;
  let quoted = false;
  let rows: Line[] = [];
  let action: { label: string; run: () => void } | null = null;

  switch (reading.shape) {
    case 'starts': {
      sentence = copy.answers.empty;
      rows = reading.suggestions.map((suggestion, index) => {
        const words = suggestionWords(suggestion, copy, voice, quiet);
        return {
          key: `${suggestion.key}-${index}`,
          label: words.label,
          value: words.detail,
          withheld: false,
          quoted: words.quoted,
        };
      });
      /* The server's link here is `#/dashboard` with the first suggestion's
         label on it — a pointer at the list above rather than at a place. So
         the press does what that suggestion does. */
      const first = reading.suggestions[0];
      if (first) {
        action = {
          label: suggestionWords(first, copy, voice, quiet).label,
          run: () => onStart(first),
        };
      }
      break;
    }
    case 'quiet': {
      const slot = reading.quietest;
      sentence = slot
        ? fill(copy.answers.quiet, {
            when: voice.when(slot.weekday, slot.hour),
            n: voice.count(slot.visits),
          })
        : copy.answers.quietNone;
      if (reading.busiest) {
        rows.push(
          lineOf(
            'busiest',
            copy.answers.busiest,
            voice.capital(voice.when(reading.busiest.weekday, reading.busiest.hour)),
          ),
          lineOf('busiest-visits', copy.answers.busiestVisits, voice.count(reading.busiest.visits)),
        );
      }
      rows.push(lineOf('counted', copy.answers.counted, voice.count(reading.total)));
      /* "Run a deal then" opens the form aimed at the hour that was measured —
         one clock hour, because that is the unit the heat map counts in. */
      action = pointAt(
        slot && pointed?.kind === 'drawer' ? copy.actions.dealThen : undefined,
        slot
          ? {
              deal: {
                targetWeekdays: [slot.weekday],
                targetFromMin: slot.hour * 60,
                targetToMin: Math.min((slot.hour + 1) * 60, 23 * 60 + 59),
              },
            }
          : undefined,
      );
      break;
    }
    case 'cost': {
      const each = reading.each;
      sentence =
        each.value === null
          ? copy.answers.costWithheld
          : fill(copy.answers.cost, {
              spend: voice.amount(reading.spendMinor),
              n: voice.count(reading.newCustomers),
              each: voice.amount(each.value, 'unit'),
            });
      if (reading.breakdown) {
        const parts = reading.breakdown;
        rows = [
          lineOf('subscription', copy.answers.parts.subscription, voice.amount(parts.subscription)),
          lineOf('loyalty', copy.answers.parts.loyalty, voice.amount(parts.loyalty)),
          lineOf('vouchers', copy.answers.parts.vouchers, voice.amount(parts.vouchers)),
          lineOf('deals', copy.answers.parts.deals, voice.amount(parts.deals)),
        ];
      }
      action = pointAt();
      break;
    }
    case 'overview': {
      const visits = voice.metric(reading.visits) ?? '—';
      sentence =
        reading.customers.value === null
          ? fill(copy.answers.overviewWithheld, { visits })
          : fill(copy.answers.overview, { visits, customers: voice.count(reading.customers.value) });
      const withheld = (metric: Metric | null) => metric?.suppressed === true;
      rows = [
        lineOf(
          'new',
          copy.answers.newCustomers,
          voice.metric(reading.newCustomers),
          withheld(reading.newCustomers),
        ),
        lineOf(
          'returning',
          copy.answers.returning,
          voice.metric(reading.returningCustomers),
          withheld(reading.returningCustomers),
        ),
        lineOf('sales', copy.answers.sales, voice.metric(reading.salesMinor, 'amount'), withheld(reading.salesMinor)),
        lineOf(
          'average',
          copy.answers.averageCheck,
          voice.metric(reading.averageCheckMinor, 'unit'),
          withheld(reading.averageCheckMinor),
        ),
      ];
      action = pointAt();
      break;
    }
    default:
      quoted = true;
      action = pointAt();
  }

  const receipt = factLines(answer.facts, answer.empty, copy, voice);

  return (
    <div className="pd-msg pas-answer" data-who="it">
      <p lang={quoted ? 'en' : undefined}>{sentence}</p>

      {receipt.length > 0 && (
        <ul className="pas-receipt" aria-label={copy.receipt}>
          {receipt.map((line) => (
            <li key={line.key}>
              <b>
                <Shown line={line} />
              </b>
              <span lang={line.quoted ? 'en' : undefined}>{line.label}</span>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <dl className="pas-rows">
          {rows.map((line) => (
            <div key={line.key}>
              <dt lang={line.quoted ? 'en' : undefined}>{line.label}</dt>
              <dd lang={line.quoted ? 'en' : undefined}>
                <Shown line={line} />
              </dd>
            </div>
          ))}
        </dl>
      )}

      {action && (
        <button type="button" className="pas-action" onClick={action.run}>
          {action.label}
          <Icon name="arrow" size={14} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}

/**
 * A draft, as the record it would become — and the one press that takes it to
 * the form.
 *
 * The words inside a draft (the offer's badge, a campaign's name and reward)
 * are the assistant's English and are shown as written, because they are what
 * the form will be filled with and the owner rewrites them there. The reasons
 * are this screen's, written from the shape of the draft: the server's own lines
 * put a reward's cost in raw minor units, and claim a plain starting deal was
 * "built from this venue's own visits" when nothing in it was.
 */
function DraftTurn({
  draft,
  asked,
  empty,
  voice,
}: {
  draft: PartnerDraft;
  asked: DraftRequest;
  empty: boolean;
  voice: Voice;
}) {
  const copy = useCopy().dashboard.assistant;
  const [language] = useLanguage();
  const { goTo, openDrawer } = useDashboard();

  const kinds = copy.kinds as Record<string, string | undefined>;
  const kind = kinds[draft.kind] ?? null;
  const rows: Line[] = [];
  let english = false;
  let reasons: { lines: string[]; quoted: boolean } = { lines: draft.reasoning, quoted: true };
  let cost = copy.cost.none;
  let open: { label: string; run: () => void } | null = null;

  const whenOf = (deal: DealProposal) => {
    const days = deal.targetWeekdays ? voice.days(deal.targetWeekdays) : null;
    const hours =
      deal.targetFromMin !== undefined && deal.targetToMin !== undefined
        ? voice.window(deal.targetFromMin, deal.targetToMin)
        : null;
    const words =
      days && hours
        ? fill(copy.fields.daysHours, { days, hours })
        : (days ?? (hours ? fill(copy.fields.everyDay, { hours }) : copy.fields.whenever));
    return voice.capital(words);
  };

  if (draft.kind === 'hot_deal') {
    const deal = dealProposal(draft.config);
    if (deal.discountText) {
      rows.push({ ...lineOf('offer', copy.fields.offer, deal.discountText), quoted: true });
      english = true;
    }
    rows.push(lineOf('when', copy.fields.when, whenOf(deal)));
    if (deal.capClaims !== undefined) {
      rows.push(lineOf('cap', copy.fields.capClaims, voice.count(deal.capClaims)));
    }

    /* A budget sent with the goal comes back as the preview and nowhere else:
       the draft carries no spending cap, so the sentence says to set one
       rather than implying the deal will stop at it. */
    cost =
      asked.budgetMinor !== undefined && draft.costPreviewMinor > 0
        ? fill(copy.cost.budget, { amount: voice.amount(draft.costPreviewMinor) })
        : copy.cost.deal;

    const aimed =
      deal.targetWeekdays?.length === 1 && deal.targetFromMin !== undefined
        ? { weekday: deal.targetWeekdays[0], hour: Math.floor(deal.targetFromMin / 60) }
        : null;
    reasons = {
      quoted: false,
      lines: aimed
        ? empty
          ? /* With no visits every open hour ties at zero and the heat map
               returns the first one — which is not a finding, and saying it is
               the quietest would be the assistant inventing one. */
            [copy.reasons.startingPoint, copy.reasons.hourUnmeasured]
          : [fill(copy.reasons.quietHour, { when: voice.when(aimed.weekday, aimed.hour) }), copy.reasons.narrow]
        : [empty ? copy.reasons.startingPoint : copy.reasons.unmatched],
    };

    open = { label: copy.openForm, run: () => openDrawer('deal', undefined, { deal }) };
  } else if (draft.kind === 'campaign') {
    const campaign = campaignProposal(draft.config);
    if (campaign.name) {
      rows.push({ ...lineOf('name', copy.fields.name, campaign.name), quoted: true });
      english = true;
    }
    if (campaign.visitsRequired !== undefined) {
      rows.push(lineOf('visits', copy.fields.visits, voice.count(campaign.visitsRequired)));
    }
    if (campaign.rewardLabel) {
      rows.push({ ...lineOf('reward', copy.fields.reward, campaign.rewardLabel), quoted: true });
      english = true;
    }
    if (campaign.rewardCostMinor !== undefined) {
      rows.push(
        lineOf('reward-cost', copy.fields.rewardCost, voice.amount(campaign.rewardCostMinor, 'unit')),
      );
    }
    if (campaign.minSpendMinor !== undefined) {
      rows.push(lineOf('min-spend', copy.fields.minSpend, voice.amount(campaign.minSpendMinor, 'unit')));
    }
    if (campaign.rewardValidDays !== undefined) {
      rows.push(lineOf('valid', copy.fields.validDays, voice.count(campaign.rewardValidDays)));
    }

    /* The preview is a number of rewards' worth of the reward's cost, and the
       number is the one division on this screen: both figures are the
       server's, and the sentence names the count so the total is checkable. */
    if (campaign.rewardCostMinor && draft.costPreviewMinor > 0) {
      cost = fill(copy.cost.campaign, {
        n: voice.count(Math.round(draft.costPreviewMinor / campaign.rewardCostMinor)),
        amount: voice.amount(draft.costPreviewMinor),
        each: voice.amount(campaign.rewardCostMinor, 'unit'),
      });
    }

    reasons = {
      quoted: false,
      lines: [
        copy.reasons.campaign,
        ...(campaign.rewardCostMinor !== undefined
          ? [fill(copy.reasons.campaignCost, { each: voice.amount(campaign.rewardCostMinor, 'unit') })]
          : []),
      ],
    };

    open = { label: copy.openForm, run: () => openDrawer('campaign', undefined, { campaign }) };
  } else if (draft.kind === 'voucher_tiers') {
    /* The ladder has its own editor and the drawer has no body for it. */
    open = { label: copy.openVouchers, run: () => goTo('vouchers') };
  }

  return (
    <article className="pd-draft" aria-label={kind ? `${copy.draftTag}: ${kind}` : copy.draftTag}>
      <div className="pd-draft-head">
        <span className="pd-tag">{copy.draftTag}</span>
        <span>{copy.draftNote}</span>
      </div>

      <div className="pd-draft-body">
        <p className="pd-fine">{fill(copy.goal, { goal: asked.shown })}</p>

        <div className="pd-record">
          {kind && (
            <div className="pd-record-head">
              <b>{kind}</b>
            </div>
          )}
          {rows.map((line) => (
            <div className="pd-record-row" key={line.key}>
              <span>{line.label}</span>
              <b lang={line.quoted ? 'en' : undefined}>
                <Shown line={line} />
              </b>
            </div>
          ))}
          {english && language !== 'en' && <p className="pd-fine">{copy.english}</p>}
        </div>

        <div className="pd-brief">
          <span className="console-label">{copy.costTitle}</span>
          <p>{cost}</p>
        </div>

        {reasons.lines.length > 0 && (
          <div className="pas-why">
            <span className="console-label">{copy.whyTitle}</span>
            <ul className="pd-reasons" lang={reasons.quoted ? 'en' : undefined}>
              {reasons.lines.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {open && (
        <div className="pd-draft-acts">
          <button type="button" className="btn btn-solid" onClick={open.run}>
            {open.label}
          </button>
        </div>
      )}
    </article>
  );
}

/* ─────────────────────────────────────────────────────────── the top panels ── */

function Knows({ context, voice }: { context: VenueContextBody; voice: Voice }) {
  const copy = useCopy().dashboard.assistant;
  const titleId = useId();
  const lines = factLines(context.facts, context.empty, copy, voice);

  return (
    /* `data-ink='paper'`: the dashboard's black slab in light, glass in dark —
       the same treatment the overview's headline takes. */
    <section
      className="pd-glass pd-panel pd-knows"
      data-ink="paper"
      data-reveal
      aria-labelledby={titleId}
    >
      <h2 className="pd-title" id={titleId}>
        {fill(copy.knowTitle, { venue: context.name })}
      </h2>
      {context.empty && <p className="pd-lede">{copy.knowEmpty}</p>}
      {lines.length > 0 && (
        <dl className="pas-facts">
          {lines.map((line) => (
            <div key={line.key}>
              <dt lang={line.quoted ? 'en' : undefined}>{line.label}</dt>
              <dd>
                <Shown line={line} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="pd-fine">{copy.knowNote}</p>
    </section>
  );
}

/**
 * One review row in the reader's words.
 *
 * The server's sentences carry one figure each and no name, so two rows read a
 * second report to say which deal and how much — the deals list for the deal
 * whose id is in the link, the budget for the pool with room. Both are the
 * screens' own endpoints and neither is required: while they load, or if they
 * fail, the row says the same thing without the figure.
 */
function reviewWords(
  item: ReviewItem,
  copy: Copy,
  voice: Voice,
  deals: DealResponse[] | null,
  budget: BudgetBody | null,
): { text: string; quoted: boolean } {
  switch (item.key) {
    case 'deal_not_converting': {
      const target = destinationOf(item.action.href);
      const dealId = target?.kind === 'drawer' ? target.dealId : undefined;
      const deal = dealId ? deals?.find((row) => row.id === dealId) : undefined;
      const title = deal?.copy?.title?.trim() || deal?.discount_text?.trim();
      return {
        text:
          deal && title
            ? fill(copy.review.dealStuck, { title, n: voice.count(deal.seen_count) })
            : copy.review.dealStuckPlain,
        quoted: false,
      };
    }
    case 'rebalance': {
      const hint = budget?.rebalanceHint;
      if (!budget || !hint) return { text: copy.review.poolsPlain, quoted: false };
      return {
        text: fill(hint.to === 'loyalty' ? copy.review.toLoyalty : copy.review.toVoucher, {
          amount: voice.amount(budget[hint.from].available),
        }),
        quoted: false,
      };
    }
    case 'no_campaign':
      return { text: copy.review.noCampaign, quoted: false };
    default:
      return { text: item.text, quoted: true };
  }
}

function Attention({
  review,
  venue,
  voice,
}: {
  review: ApiResult<ReviewItem[]>;
  venue: PartnerVenue;
  voice: Voice;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.assistant;
  const destinations = useDestinations();
  const titleId = useId();

  const items = review.state.status === 'ready' ? review.state.data : [];
  const dealsApi = usePartnerDeals(
    items.some((item) => item.key === 'deal_not_converting') ? venue.id : null,
  );
  const budgetApi = usePartnerBudget(items.some((item) => item.key === 'rebalance') ? venue.id : null);
  const deals = dealsApi.state.status === 'ready' ? dealsApi.state.data : null;
  const budget = budgetApi.state.status === 'ready' ? budgetApi.state.data : null;

  let body: ReactNode;
  if (review.state.status === 'loading') {
    body = <p className="pd-fine">{dashboard.unmeasured.asking}</p>;
  } else if (review.state.status === 'error') {
    body = isPlanLocked(review.state.error) ? (
      <p className="pd-fine">{dashboard.unmeasured.planLocked}</p>
    ) : (
      <div className="pd-finding">
        <p className="pd-fine">{copy.attentionFailed}</p>
        <button type="button" className="btn btn-ghost" onClick={review.reload}>
          {copy.states.retry}
        </button>
      </div>
    );
  } else if (items.length === 0) {
    body = <p className="pd-fine">{copy.attentionNone}</p>;
  } else {
    body = (
      <ul className="pas-attn">
        {items.map((item, index) => {
          const words = reviewWords(item, copy, voice, deals, budget);
          /* "Start a stamp card" opens the form that starts one; the server's
             link points at the campaigns list, which is one press short of it. */
          const to: Destination | null =
            item.key === 'no_campaign'
              ? { kind: 'drawer', drawer: 'campaign' }
              : destinationOf(item.action.href);
          const label = !to
            ? null
            : item.key === 'deal_not_converting'
              ? copy.actions.editDeal
              : item.key === 'rebalance'
                ? copy.actions.moveBudget
                : item.key === 'no_campaign'
                  ? copy.actions.startCampaign
                  : destinations.label(to);
          return (
            <li className="pd-finding" key={`${item.key}-${index}`}>
              <p lang={words.quoted ? 'en' : undefined}>{words.text}</p>
              {to && label && (
                <button type="button" className="btn btn-ghost" onClick={() => destinations.go(to)}>
                  {label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section className="pd-glass pd-panel pas-attention" data-reveal aria-labelledby={titleId}>
      <h2 className="pd-title" id={titleId}>
        {copy.attentionTitle}
      </h2>
      {body}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────── the conversation ── */

function Conversation({
  venue,
  context,
  review,
}: {
  venue: PartnerVenue;
  context: VenueContextBody;
  review: ApiResult<ReviewItem[]>;
}) {
  const copy = useCopy().dashboard.assistant;
  const reader = useCurrency();
  const money = useMoney();
  const voice = useVoice(venue.currency);
  const destinations = useDestinations();

  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'ask' | 'draft'>('ask');
  const [typed, setTyped] = useState('');
  const [budget, setBudget] = useState('');

  const nextId = useRef(0);
  /* The request in flight, if any. A ref rather than state because nothing
     renders from it — `busy` is the rendered half — and because it is what the
     "one question at a time" guard has to read synchronously. */
  const abortRef = useRef<AbortController | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const lastRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const fieldId = useId();
  const budgetId = useId();

  const quiet = useMemo(
    () => slotOf(context.facts.find((fact) => fact.kind === 'quiet_window')?.value),
    [context.facts],
  );

  /* A question in flight when the screen goes is a question nobody is waiting
     for — the rail moved, or the range re-keyed the page. */
  useEffect(() => () => abortRef.current?.abort(), []);

  /* The newest turn in view. `nearest` is the right alignment for both sizes of
     turn: a short one lands at the bottom edge, and a draft taller than the
     window lands with its top showing rather than its last line. */
  useEffect(() => {
    if (turns.length > 0) lastRef.current?.scrollIntoView({ block: 'nearest' });
  }, [turns]);

  const send = useCallback(
    async (request: Request) => {
      /* One at a time. The send button is disabled while one is out; this is
         the same rule for the presses that are not that button. */
      if (abortRef.current) return;

      const you = nextId.current;
      const it = you + 1;
      nextId.current += 2;

      setTurns((current) => [
        ...current,
        {
          id: you,
          from: 'you',
          text: request.shown,
          note: request.mode === 'draft' ? request.note : undefined,
        },
        { id: it, from: 'it', state: 'thinking' },
      ]);
      setBusy(true);

      const controller = new AbortController();
      abortRef.current = controller;
      /* The answer replaces the dots in place, so it arrives where they were. */
      const settle = (turn: Turn) =>
        setTurns((current) => current.map((row) => (row.id === it ? turn : row)));

      try {
        if (request.mode === 'ask') {
          const answer = await askAssistant({
            venueId: venue.id,
            text: request.text,
            signal: controller.signal,
          });
          settle({ id: it, from: 'it', state: 'answer', answer });
        } else {
          const draft = await draftWithAssistant({
            venueId: venue.id,
            goal: request.goal,
            budgetMinor: request.budgetMinor,
            signal: controller.signal,
          });
          settle({ id: it, from: 'it', state: 'draft', draft, asked: request });
        }
      } catch (error) {
        /* An abandoned exchange leaves nothing behind — the dock's rule. The
           only thing that could settle those dots is the reply that was
           cancelled, and a thread is a record of what was actually said. */
        if (controller.signal.aborted) {
          setTurns((current) => current.filter((row) => row.id !== you && row.id !== it));
          return;
        }
        settle({
          id: it,
          from: 'it',
          state: 'error',
          kind: isPlanLocked(error) ? 'locked' : isUnreachable(error) ? 'offline' : 'failed',
          detail: error instanceof Error && error.message ? error.message : null,
          request,
          pair: you,
        });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        if (!controller.signal.aborted) setBusy(false);
      }
    },
    [venue.id],
  );

  /* Focus goes to the thread rather than the field after a press that removes
     the control it came from: the suggestions vanish with the first turn, and
     putting the caret in the composer would raise a phone's keyboard over the
     answer being waited for. */
  const keepFocus = () => logRef.current?.focus({ preventScroll: true });

  const start = (suggestion: AssistantSuggestion) => {
    const move = moveOf(suggestion.key);
    if (move.kind === 'go') {
      destinations.go(move.to);
      return;
    }
    const shown = suggestionWords(suggestion, copy, voice, quiet).label;
    void send(
      move.kind === 'draft'
        ? { mode: 'draft', goal: move.goal, shown }
        : { mode: 'ask', text: suggestion.label, shown },
    );
    keepFocus();
  };

  const askQuestion = (which: keyof typeof ASK_QUESTIONS) => {
    void send({ mode: 'ask', text: ASK_QUESTIONS[which], shown: copy.questions[which] });
    keepFocus();
  };

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setTurns([]);
    keepFocus();
  };

  /* Retry drops the failed exchange and sends it again, rather than stacking a
     second copy of the question under the first. By id, not by position: a
     later exchange may have landed since this one failed. */
  const retry = (turn: ErrorTurn) => {
    if (abortRef.current) return;
    setTurns((current) => current.filter((row) => row.id !== turn.pair && row.id !== turn.id));
    void send(turn.request);
  };

  const submit = () => {
    const text = typed.trim().slice(0, mode === 'draft' ? 400 : 500);
    if (!text || busy) return;

    if (mode === 'ask') {
      void send({ mode: 'ask', text, shown: text });
    } else {
      /* The well holds the reader's currency, like every money input on this
         dashboard; it crosses to euros through the reader's rate and on to the
         venue's minor units at the point it is sent. */
      const amount = Number(budget.replace(/\s/g, '').replace(',', '.'));
      const minor =
        budget.trim() !== '' && Number.isFinite(amount) && amount > 0
          ? euroToMinor(amount / reader.rate, venue.currency)
          : 0;
      void send(
        minor > 0
          ? {
              mode: 'draft',
              goal: text,
              shown: text,
              budgetMinor: minor,
              note: fill(copy.budgetShown, { amount: money(amount / reader.rate, 'exact') }),
            }
          : { mode: 'draft', goal: text, shown: text },
      );
      setBudget('');
    }

    setTyped('');
    if (fieldRef.current) fieldRef.current.style.height = 'auto';
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    /* Enter sends and Shift+Enter breaks the line — and neither fires while an
       input method is still composing a word. */
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const renderTurn = (turn: Turn) => {
    if (turn.from === 'you') {
      return (
        <p className="pd-msg" data-who="you">
          {turn.text}
          {turn.note && <small className="pas-note">{turn.note}</small>}
        </p>
      );
    }

    switch (turn.state) {
      case 'thinking':
        return (
          <p className="pd-msg pas-typing" data-who="it">
            <span className="visually-hidden">{copy.thinking}</span>
            <span className="pas-dot" aria-hidden />
            <span className="pas-dot" aria-hidden />
            <span className="pas-dot" aria-hidden />
          </p>
        );
      case 'answer':
        return <AnswerTurn answer={turn.answer} context={context} voice={voice} onStart={start} />;
      case 'draft':
        return <DraftTurn draft={turn.draft} asked={turn.asked} empty={context.empty} voice={voice} />;
      case 'error':
        return (
          <div className="pd-msg pas-error" data-who="it">
            <p>
              {turn.kind === 'locked'
                ? copy.states.turnLocked
                : turn.kind === 'offline'
                  ? copy.states.turnOffline
                  : copy.states.turnFailed}
            </p>
            {/* The server's own words, verbatim and untranslated — they name
                which rule refused, and a sentence general enough to cover every
                refusal would name none. */}
            {turn.kind === 'failed' && turn.detail && (
              <p className="pas-detail" lang="en">
                {turn.detail}
              </p>
            )}
            {/* No retry on `locked`: it would spend a request to be told the
                same thing, which is a button that exists to fail. */}
            {turn.kind !== 'locked' && (
              <button
                type="button"
                className="btn btn-ghost pas-retry"
                disabled={busy}
                onClick={() => retry(turn)}
              >
                {copy.states.retry}
              </button>
            )}
          </div>
        );
    }
  };

  return (
    <div className="pd-stack pd-assist">
      <div className="pd-two pd-assist-top">
        <Knows context={context} voice={voice} />
        <Attention review={review} venue={venue} voice={voice} />
      </div>

      <section
        className="pd-glass pd-thread"
        data-solid="true"
        data-reveal
        aria-labelledby={titleId}
      >
        <div className="pd-thread-head">
          <h2 className="pd-title" id={titleId}>
            <i className="pd-live-dot" aria-hidden />
            {copy.convTitle}
          </h2>
          {turns.length > 0 && (
            <button type="button" className="btn btn-ghost pas-reset" onClick={reset}>
              {copy.reset}
            </button>
          )}
        </div>

        {/* A log: new turns are announced as they arrive, and nothing already
            said is read again. Focusable by script only, so a press that removes
            its own control can leave focus somewhere that makes sense. */}
        <div
          className="pd-msgs"
          ref={logRef}
          role="log"
          aria-live="polite"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          <p className="pd-msg" data-who="it">
            {copy.opening}
          </p>

          {turns.length === 0 && (
            <div className="pas-starts">
              {context.suggestions.length > 0 && (
                <>
                  <span className="console-label">{copy.startTitle}</span>
                  <div className="pd-start-list">
                    {context.suggestions.map((suggestion) => {
                      const words = suggestionWords(suggestion, copy, voice, quiet);
                      return (
                        <button
                          key={suggestion.key}
                          type="button"
                          disabled={busy}
                          onClick={() => start(suggestion)}
                        >
                          <Icon name={iconOf(moveOf(suggestion.key))} size={16} />
                          <b lang={words.quoted ? 'en' : undefined}>{words.label}</b>
                          <span lang={words.quoted ? 'en' : undefined}>{words.detail}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Questions the server routes to a report. Not offered on an empty
                  venue, where every question has the same honest answer. */}
              {!context.empty && (
                <>
                  <span className="console-label">{copy.askTitle}</span>
                  <div className="pd-chips">
                    {(Object.keys(ASK_QUESTIONS) as Array<keyof typeof ASK_QUESTIONS>).map(
                      (which) => (
                        <button
                          key={which}
                          type="button"
                          disabled={busy}
                          onClick={() => askQuestion(which)}
                        >
                          {copy.questions[which]}
                        </button>
                      ),
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {turns.map((turn, index) => (
            <div
              key={turn.id}
              className="pas-turn"
              data-from={turn.from}
              ref={index === turns.length - 1 ? lastRef : undefined}
            >
              {renderTurn(turn)}
            </div>
          ))}
        </div>

        <div className="pd-composer">
          <div className="pas-controls">
            <div className="pd-seg" role="group" aria-label={copy.modeLabel}>
              {(['ask', 'draft'] as const).map((which) => (
                <button
                  key={which}
                  type="button"
                  aria-pressed={mode === which}
                  data-on={mode === which ? 'true' : undefined}
                  onClick={() => setMode(which)}
                >
                  {copy.modes[which]}
                </button>
              ))}
            </div>

            {mode === 'draft' && (
              <label className="pas-budget" htmlFor={budgetId}>
                <span>{copy.budgetLabel}</span>
                <span className="pd-well">
                  {reader.before && <span aria-hidden>{reader.symbol}</span>}
                  <input
                    id={budgetId}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={budget}
                    onChange={(event) => setBudget(event.target.value.replace(/[^\d.,\s]/g, ''))}
                  />
                  {!reader.before && <span aria-hidden>{reader.symbol}</span>}
                </span>
              </label>
            )}
          </div>

          <label className="visually-hidden" htmlFor={fieldId}>
            {copy.fieldLabel[mode]}
          </label>
          <div className="pd-composer-well">
            <textarea
              id={fieldId}
              ref={fieldRef}
              rows={1}
              value={typed}
              /* The server's own ceilings: 500 for a question, 400 for a goal. */
              maxLength={mode === 'draft' ? 400 : 500}
              placeholder={copy.placeholders[mode]}
              onChange={(event) => {
                setTyped(event.target.value);
                /* Grow to fit, and shrink back: collapse to auto first, then
                   read the height the content needs. The sheet caps it. */
                const node = event.target;
                node.style.height = 'auto';
                node.style.height = `${node.scrollHeight}px`;
              }}
              onKeyDown={onKeyDown}
            />
            <button
              type="button"
              className="pd-send"
              disabled={busy || !typed.trim()}
              aria-label={copy.send}
              onClick={submit}
            >
              <Icon name="send" size={17} strokeWidth={2} />
            </button>
          </div>
          <p className="pd-fine">{copy.composerNote}</p>
        </div>
      </section>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── the states ── */

/** In flight. One line, and never a zero standing in for an answer. */
function Asking() {
  const dashboard = useCopy().dashboard;
  return (
    <div className="pd-glass pd-panel pd-empty" data-reveal>
      <p className="pd-fine">{dashboard.unmeasured.asking}</p>
    </div>
  );
}

/**
 * Nothing to read, and the reason — the dashboard's empty-panel convention.
 *
 * Three reasons with three different next steps: no partner session on this
 * device (retrying changes nothing, so there is no button), no venue on this
 * account, and a server that did not answer or refused. Only the last is worth
 * a retry.
 */
function Unavailable({
  error,
  noVenue = false,
  onRetry,
}: {
  error?: ApiError;
  noVenue?: boolean;
  onRetry?: () => void;
}) {
  const dashboard = useCopy().dashboard;
  const states = dashboard.assistant.states;

  const reason = noVenue
    ? states.noVenue
    : !error
      ? null
      : isNoSession(error)
        ? dashboard.unmeasured.noSession
        : isUnreachable(error)
          ? dashboard.unmeasured.serverSilent
          : fill(states.failed, { why: error.message });
  const retry = !noVenue && error !== undefined && !isNoSession(error) ? onRetry : undefined;

  return (
    <div className="pd-glass pd-panel pd-empty" data-reveal>
      <h3>{states.title}</h3>
      <p className="pd-fine">{states.body}</p>
      {reason && <p className="pd-fine">{reason}</p>}
      {retry && (
        <button type="button" className="btn btn-ghost" onClick={retry}>
          {states.retry}
        </button>
      )}
    </div>
  );
}

/**
 * The plan does not carry the assistant.
 *
 * Not an error and not a retry: the answer will be the same until the plan
 * changes. The press is a letter to the people who can change it, because no
 * screen on this site sells a partner plan — the pricing section on `#/business`
 * describes tiers under different names and does not mention the assistant, so
 * sending an owner there to find it would be sending them somewhere that does
 * not answer the question.
 */
function PlanLocked({ venue }: { venue: PartnerVenue }) {
  const states = useCopy().dashboard.assistant.states;
  const subject = fill(states.lockedSubject, { venue: venue.name });

  return (
    <div className="pd-glass pd-panel pd-empty" data-reveal>
      <span className="pd-empty-ico" aria-hidden>
        <Icon name="lock" size={22} />
      </span>
      <h3>{states.lockedTitle}</h3>
      <p className="pd-fine">{states.lockedBody}</p>
      <a
        className="btn btn-ghost"
        href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(subject)}`}
      >
        {states.lockedAction}
      </a>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── the screen ── */

export function Assistant() {
  const venueApi = usePartnerVenue();
  const venue = venueApi.state.status === 'ready' ? venueApi.state.data : null;
  const contextApi = useAssistantContext(venue?.id ?? null);
  const reviewApi = useAssistantReview(venue?.id ?? null);

  let body: ReactNode;
  if (venueApi.state.status === 'loading') {
    body = <Asking />;
  } else if (venueApi.state.status === 'error') {
    body = <Unavailable error={venueApi.state.error} onRetry={venueApi.reload} />;
  } else if (venue === null) {
    body = <Unavailable noVenue />;
  } else if (contextApi.state.status === 'loading') {
    body = <Asking />;
  } else if (contextApi.state.status === 'error') {
    body = isPlanLocked(contextApi.state.error) ? (
      <PlanLocked venue={venue} />
    ) : (
      <Unavailable
        error={contextApi.state.error}
        onRetry={() => {
          contextApi.reload();
          reviewApi.reload();
        }}
      />
    );
  } else {
    /* Keyed on the venue so a different venue starts a different thread. */
    return (
      <Conversation
        key={venue.id}
        venue={venue}
        context={contextApi.state.data}
        review={reviewApi}
      />
    );
  }

  return <div className="pd-stack pd-assist">{body}</div>;
}
