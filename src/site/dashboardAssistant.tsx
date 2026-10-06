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
import './dashboard-assistant.css';
import { SALES_EMAIL } from './content';
import { useCopy, useLanguage, useMoney, type LanguageCode } from './i18n/context';
import { fill } from './i18n/currency';
import type { ApiError } from './api/client';
import type { ApiResult } from './api/useApi';
import {
  isNoSession,
  minorToEuro,
  readyOr,
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
import {
  DEMO_ASSISTANT_CONTEXT,
  DEMO_ASSISTANT_REVIEW,
  demoAnswer,
  demoDraft,
} from './dashboardAssistantDemo';
import { DEMO_BUDGET, DEMO_DEALS, DEMO_VENUE } from './dashboardDemo';
import { useNum } from './dashboardFormat';
import { Button, Card, DxIcon, EmptyState } from './dashboardKit';
import { useDismiss } from './dashboardKitHooks';
import { useDashboard, type DrawerPrefill } from './dashboardShell';
import { DEMO_MODE } from './demoMode';

/**
 * The assistant — the one dashboard screen that talks back, drawn as v3's chat.
 *
 * v3 (`b2b/dashboard-design/…v3.dc.html`, §3.7) is a full-height column: an
 * "Online" bar, a centred thread of bubbles that opens on a snapshot of the
 * venue, four starter chips, a typing indicator, a draft card under an amber
 * "DRAFT: HOT DEAL" header, and a composer pinned to the bottom. The mock's
 * conversation is scripted keyword routing over invented figures ("142 loyalty
 * members", "89 clicks this week"). This one is the same picture over
 * `api/partnerAssistant.ts`, and the rules that made the previous screen honest
 * all survive the change of look:
 *
 * - **The snapshot is the context endpoint's facts**, plus two rows read off
 *   the deals list (how many are live, which one people open most). Every row is
 *   conditional on its own figure; a venue with nothing measured gets the
 *   server's empty signal and its starting points, never a benchmark.
 * - **"Needs a look" is `GET …/assistant/review`**, as a second message, and
 *   only when there is something in it.
 * - **A turn asks or drafts.** The mock had no mode switch, so the composer
 *   decides from the words (`wantsDraft`) — the same bet the server makes on
 *   the goal, and as cheap to lose: a draft is shown for approval anyway.
 * - **A draft is never published here.** The server says `requiresApproval`
 *   and has no publish; v3's "✓ Publish" becomes "Review and publish", which is
 *   `openDrawer` with the draft as its prefill, and the owner publishes there.
 *   v3's "✎ Edit" is the same press and is not drawn twice.
 *
 * ## The sentences are written here, from the server's figures
 *
 * The partner composer answers in English, writes money into its prose as raw
 * minor units and prints a withheld metric as `null`. So for every shape it
 * recognises, this screen says the same thing from the same structured result,
 * in the reader's language and currency; a shape it does not recognise is
 * quoted verbatim and marked as English. **Every figure arrives through a
 * `fill()` hole, and every hole is filled from a response.** Nothing here
 * computes a number the server did not send, beyond dividing two that it did.
 *
 * v3's footnote ("I read Polish, Russian, Ukrainian, Uzbek, Turkish and
 * English") is not carried over: the endpoint routes on English keywords, so a
 * question typed in Polish is answered with the month's overview. The
 * footnote says what is true instead.
 */

/* ────────────────────────────────────────────────────────────────── voice ── */

/*
 * The locale each dictionary is read in, for the handful of words `Intl` knows
 * better than a dictionary does — weekday names, language names, the clock and
 * how a list of days joins. Digit grouping is not among them: counts and money
 * go through `useNum` and `useMoney`, whose grouping belongs to the language.
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
  /** The wall-clock time a message arrived, on this device. */
  time: (at: number) => string;
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
      clock: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }),
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
    time: (at) => intl.clock.format(at),
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
      className="dx-assistant-withheld"
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

/*
 * The snapshot's marks, by fact kind — v3 leads each row with an emoji, and the
 * emoji is chosen by what the row *is*, so a kind this screen does not know
 * gets a plain dot rather than a picture claiming a meaning.
 */
const MARKS: Record<string, string> = {
  city: '📍',
  visits: '📊',
  customers: '👥',
  new_customers: '🆕',
  budget: '💰',
  spend: '💸',
  status: '📋',
  quiet_window: '🕒',
  language_mix: '🌐',
  deals: '🏷️',
  top: '🔥',
};
const markOf = (key: string) => MARKS[key.replace(/-.*$/, '')] ?? '•';

/* ───────────────────────────────────────────────────────── where things go ── */

/**
 * What pressing a suggestion does, by its key.
 *
 * Three become drafts, because a draft is what the server can build for them.
 * The other four go straight to the place that does the job: the voucher ladder
 * lives on Vouchers and the two pools are split on the loyalty screen; "tell me
 * when you are quiet" is the deal form's days and hours, because there is no
 * endpoint that records quiet hours; and reaching another language is the deal
 * copy, which is on Hot deals. A key this screen does not know is asked as a
 * question, which the server always answers from the venue's own figures.
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

/* The suggestions v3's four starter chips already cover — a fifth chip saying
   "Run your first deal" beside "Create a hot deal" would be one press twice. */
const COVERED = new Set(['first_deal', 'stamp_card', 'fill_quiet_hour', 'points_discount']);

const moveOf = (key: string): Move =>
  Object.hasOwn(SUGGESTION_MOVES, key) ? SUGGESTION_MOVES[key] : { kind: 'ask' };

/** A destination's label and the press that reaches it, in one place. */
function useDestinations() {
  const dashboard = useCopy().dashboard;
  const { goTo, openDrawer } = useDashboard();

  return {
    label: (to: Destination): string | null => {
      if (to.kind === 'screen') {
        return dashboard.screens[to.screen].name;
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

/**
 * Whether typed words ask for something to be *made* rather than answered.
 *
 * A verb of making and a thing that can be made, in the five languages the
 * dashboard is read in. Both halves, because "how is my deal doing" names a
 * deal and asks a question. A wrong guess either way costs one press: a draft
 * is shown for approval and an answer points at the form.
 */
const MAKE =
  /\b(create|make|set ?up|start|run|launch|draft|add|new)\b|stw[oó]rz|utw[oó]rz|zr[oó]b|ustaw|uruchom|now[aey]|созд|сдела|запуст|настро|нов[аыо]|створ|зроби|налашту|yarat|tuz|boshla|yangi|sozla/i;
const MADE =
  /deal|offer|discount|promo|campaign|stamp|loyal|okazj|ofert|promocj|rabat|zni[żz]k|kampani|piecz[aą]tk|lojaln|скидк|акци|предлож|кампани|штамп|лояльн|знижк|пропозиц|акці|taklif|chegirma|aksiya|kampaniya|sodiqlik/i;

const wantsDraft = (text: string) => MAKE.test(text) && MADE.test(text);

/* ─────────────────────────────────────────────────────────────── the turns ── */

type Request =
  | { mode: 'ask'; text: string; shown: string }
  | { mode: 'draft'; goal: string; shown: string };

type DraftRequest = Extract<Request, { mode: 'draft' }>;

/**
 * One entry in the thread — a union rather than a row with optional fields:
 * the states are different things to draw, and the compiler should be what
 * notices one that is not handled. `at` is when it arrived, for the stamp
 * beside the assistant's name.
 */
type Turn =
  | { id: number; at: number; from: 'you'; text: string }
  | { id: number; at: number; from: 'it'; state: 'thinking' }
  | { id: number; at: number; from: 'it'; state: 'answer'; answer: PartnerAnswer }
  | { id: number; at: number; from: 'it'; state: 'draft'; draft: PartnerDraft; asked: DraftRequest }
  | {
      id: number;
      at: number;
      from: 'it';
      state: 'error';
      kind: 'locked' | 'offline' | 'failed';
      detail: string | null;
      /** What a retry re-sends, and the owner's turn it replaces. */
      request: Request;
      pair: number;
    };

type ErrorTurn = Extract<Turn, { state: 'error' }>;

/** The assistant's side of the thread: the "P", the name, the time, the bubble. */
function Bot({
  at,
  voice,
  children,
  bare = false,
}: {
  at: number | null;
  voice: Voice;
  children: ReactNode;
  /** The typing indicator: no name row, a tighter bubble. */
  bare?: boolean;
}) {
  const chat = useCopy().dashboard.assistant.chat;
  return (
    <div className="dx-assistant-bot" data-bare={bare ? 'true' : undefined}>
      <span className="dx-assistant-avatar" aria-hidden>
        P
      </span>
      <div className="dx-assistant-bot-body">
        {!bare && (
          <div className="dx-assistant-who">
            <b>{chat.name}</b>
            {at !== null && <time dateTime={new Date(at).toISOString()}>{voice.time(at)}</time>}
          </div>
        )}
        <div className="dx-assistant-bubble">{children}</div>
      </div>
    </div>
  );
}

/** A dictionary sentence with the venue's name set in bold where `{venue}` sits. */
function WithVenue({ template, venue }: { template: string; venue: string }) {
  const [before, after = ''] = template.split('{venue}');
  return (
    <>
      {before}
      <strong>{venue}</strong>
      {after}
    </>
  );
}

/**
 * An answer, written from the report it was built from.
 *
 * `readAnswer` says which report that was; this says it in words. Rows are text
 * and deliberately not pressable — the one pressable thing is the place the
 * server pointed at, translated to this frame, and a link that translates to
 * nowhere is not drawn.
 */
function AnswerBody({
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
    <>
      <p className="dx-assistant-p" lang={quoted ? 'en' : undefined}>
        {sentence}
      </p>

      {/* v3's mini-table: a bordered box of label/value rows. */}
      {rows.length > 0 && (
        <dl className="dx-assistant-table">
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

      {/* The receipt: every figure the sentence read, so "412 visits" is
          checkable rather than trusted. Quiet, under the answer. */}
      {receipt.length > 0 && (
        <ul className="dx-assistant-receipt" aria-label={copy.receipt}>
          {receipt.map((line) => (
            <li key={line.key}>
              <span lang={line.quoted ? 'en' : undefined}>{line.label}</span>{' '}
              <b>
                <Shown line={line} />
              </b>
            </li>
          ))}
        </ul>
      )}

      {action && (
        <div className="dx-assistant-acts">
          <Button variant="secondary" onClick={action.run}>
            {action.label}
            <DxIcon name="arrowRight" size={14} strokeWidth={2.1} />
          </Button>
        </div>
      )}
    </>
  );
}

/**
 * A draft, as v3's card: the amber "DRAFT: …" header, the offer as the title,
 * the record's rows, what it costs and why — and the one press, which takes it
 * to the form.
 *
 * The words inside a draft (the offer's badge, a campaign's name and reward)
 * are the assistant's English and are shown as written, because they are what
 * the form will be filled with and the owner rewrites them there. The reasons
 * are this screen's, written from the shape of the draft: the server's own lines
 * put a reward's cost in raw minor units, and claim a plain starting deal was
 * "built from this venue's own visits" when nothing in it was.
 */
function DraftBody({
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
  const chat = copy.chat;
  const [language] = useLanguage();
  const { goTo, openDrawer } = useDashboard();

  const kinds = copy.kinds as Record<string, string | undefined>;
  const kind = kinds[draft.kind] ?? null;
  const rows: Line[] = [];
  let title: string | null = null;
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
      title = deal.discountText;
      english = true;
    }
    rows.push(lineOf('when', copy.fields.when, whenOf(deal)));
    if (deal.capClaims !== undefined) {
      rows.push(lineOf('cap', copy.fields.capClaims, voice.count(deal.capClaims)));
    }

    /* A budget comes back as the preview and nowhere else: the draft carries
       no spending cap, so the sentence says to set one rather than implying
       the deal will stop at it. */
    cost =
      draft.costPreviewMinor > 0
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

    open = { label: chat.publish, run: () => openDrawer('deal', undefined, { deal }) };
  } else if (draft.kind === 'campaign') {
    const campaign = campaignProposal(draft.config);
    if (campaign.name) {
      title = campaign.name;
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

    open = { label: chat.publish, run: () => openDrawer('campaign', undefined, { campaign }) };
  } else if (draft.kind === 'voucher_tiers') {
    /* The ladder has its own editor and the drawer has no body for it. */
    open = { label: copy.openVouchers, run: () => goTo('vouchers') };
  }

  const head = kind ? fill(chat.draftHead, { kind }) : copy.draftTag;

  return (
    <>
      <p className="dx-assistant-p">{chat.draftLead}</p>

      <article className="dx-assistant-draft" aria-label={head}>
        <div className="dx-assistant-draft-head">
          <span aria-hidden>🔥</span>
          <span>{head}</span>
        </div>

        <div className="dx-assistant-draft-body">
          {title && (
            <h3 className="dx-assistant-draft-title" lang="en">
              {title}
            </h3>
          )}
          <p className="dx-assistant-goal">{fill(copy.goal, { goal: asked.shown })}</p>

          {rows.length > 0 && (
            <dl className="dx-assistant-draft-rows">
              {rows.map((line) => (
                <div key={line.key}>
                  <dt>{line.label}</dt>
                  <dd lang={line.quoted ? 'en' : undefined}>
                    <Shown line={line} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {english && language !== 'en' && <p className="dx-assistant-fine">{copy.english}</p>}

          <div className="dx-assistant-draft-note">
            <b>{copy.costTitle}</b>
            <p>{cost}</p>
          </div>

          {reasons.lines.length > 0 && (
            <div className="dx-assistant-draft-note">
              <b>{copy.whyTitle}</b>
              <ul lang={reasons.quoted ? 'en' : undefined}>
                {reasons.lines.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="dx-assistant-ask">{chat.draftAsk}</p>

          {open && (
            <div className="dx-assistant-acts">
              <Button variant="primary" icon="check" onClick={open.run}>
                {open.label}
              </Button>
            </div>
          )}
        </div>
      </article>
    </>
  );
}

/* ───────────────────────────────────────────────────────── the opening ── */

/**
 * v3's opening message: "Hi! I'm your Paylez assistant for **…**. Here's a
 * quick snapshot:" and a column of emoji rows. The mock's rows are an address,
 * members and deals, a top performer by clicks and a week-on-week trend. What
 * is drawn is what was measured: the city off the venue, the context's facts,
 * and two rows off the deals list — how many are live, and the live deal opened
 * most, only when anybody has opened one. There is no trend row, because the
 * context carries no previous period to compare with.
 */
function Snapshot({
  venue,
  context,
  deals,
  voice,
  at,
}: {
  venue: PartnerVenue;
  context: VenueContextBody;
  deals: DealResponse[] | null;
  voice: Voice;
  at: number;
}) {
  const copy = useCopy().dashboard.assistant;
  const chat = copy.chat;

  const lines: Line[] = [];
  if (venue.city) lines.push({ ...lineOf('city', '', venue.city), quoted: false });
  lines.push(...factLines(context.facts, context.empty, copy, voice));

  if (deals) {
    const live = deals.filter((deal) => deal.status === 'live');
    lines.push(lineOf('deals', chat.liveDeals, voice.count(live.length)));
    const top = live.reduce<DealResponse | null>(
      (best, deal) => (deal.funnel.opened > (best?.funnel.opened ?? 0) ? deal : best),
      null,
    );
    const title = top?.copy?.title?.trim() || top?.discount_text?.trim();
    if (top && title) {
      lines.push(
        lineOf('top', '', fill(chat.topDeal, { title, n: voice.count(top.funnel.opened) })),
      );
    }
  }

  return (
    <Bot at={at} voice={voice}>
      <p className="dx-assistant-p" data-gap="lg">
        <WithVenue template={context.empty ? chat.helloEmpty : chat.hello} venue={context.name} />
      </p>
      {context.empty && <p className="dx-assistant-p dx-assistant-muted">{copy.knowEmpty}</p>}
      {lines.length > 0 && (
        <ul className="dx-assistant-snap">
          {lines.map((line) => (
            <li key={line.key}>
              <span aria-hidden>{markOf(line.key)}</span>
              <span>
                {line.label && (
                  <span lang={line.quoted ? 'en' : undefined}>
                    {line.label}
                    {': '}
                  </span>
                )}
                <Shown line={line} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="dx-assistant-p dx-assistant-muted">{chat.workOn}</p>
    </Bot>
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

/**
 * "A few things need a look" — the review, as the assistant's second message.
 *
 * Drawn only when there is something to say: an empty review is the ordinary
 * state of a healthy venue, and a message saying "nothing to report" under the
 * snapshot would be a bubble with nothing in it. A review that failed says so
 * with a retry, because the owner is otherwise told nothing about it at all.
 */
function Attention({
  review,
  deals,
  budget,
  voice,
  at,
}: {
  review: ReviewItem[] | null;
  deals: DealResponse[] | null;
  budget: BudgetBody | null;
  voice: Voice;
  at: number;
}) {
  const copy = useCopy().dashboard.assistant;
  const destinations = useDestinations();
  if (!review || review.length === 0) return null;

  return (
    <Bot at={at} voice={voice}>
      <p className="dx-assistant-p">{copy.chat.attention}</p>
      <ul className="dx-assistant-attn">
        {review.map((item, index) => {
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
            <li key={`${item.key}-${index}`}>
              <p lang={words.quoted ? 'en' : undefined}>{words.text}</p>
              {to && label && (
                <Button variant="small" onClick={() => destinations.go(to)}>
                  {label}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Bot>
  );
}

/* ─────────────────────────────────────────────────────────── the conversation ── */

/*
 * How long the demo takes to answer. v3 holds its typing dots for 1.2 s; the
 * demo answers from memory and would otherwise replace them before they were
 * seen, which is a typing indicator nobody can check.
 */
const DEMO_REPLY_MS = 900;

function Conversation({
  venue,
  live,
  context,
  review,
}: {
  venue: PartnerVenue;
  /** False on `?demo=1` with no venue on this device: answers come from the demo. */
  live: boolean;
  context: VenueContextBody;
  review: ApiResult<ReviewItem[]>;
}) {
  const copy = useCopy().dashboard.assistant;
  const chat = copy.chat;
  const { goTo } = useDashboard();
  const voice = useVoice(venue.currency);
  const destinations = useDestinations();

  /* The second reports. The deals list feeds the snapshot's two deal rows and
     the stuck-deal review row; the budget only the rebalance row. Neither is
     required — the rows they feed are simply not drawn without them. */
  const liveId = live ? venue.id : null;
  const reviewItems = readyOr(review.state, live ? null : DEMO_MODE ? DEMO_ASSISTANT_REVIEW : null);
  const dealsApi = usePartnerDeals(liveId);
  const budgetApi = usePartnerBudget(
    liveId && reviewItems?.some((item) => item.key === 'rebalance') ? liveId : null,
  );
  const deals = readyOr(dealsApi.state, DEMO_MODE && !live ? DEMO_DEALS : null);
  const budget = readyOr(budgetApi.state, DEMO_MODE && !live ? DEMO_BUDGET : null);

  const [opened] = useState(() => Date.now());
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [typed, setTyped] = useState('');
  const [menu, setMenu] = useState(false);

  const nextId = useRef(0);
  /* The request in flight, if any. A ref rather than state because nothing
     renders from it — `busy` is the rendered half — and because it is what the
     "one question at a time" guard has to read synchronously. */
  const abortRef = useRef<AbortController | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const menuRef = useDismiss<HTMLDivElement>(menu, () => setMenu(false));
  const logId = useId();
  const fieldId = useId();
  const menuId = useId();

  const quiet = useMemo(
    () => slotOf(context.facts.find((fact) => fact.kind === 'quiet_window')?.value),
    [context.facts],
  );

  /* A question in flight when the screen goes is a question nobody is waiting
     for — the rail moved, or the range re-keyed the page. */
  useEffect(() => () => abortRef.current?.abort(), []);

  /* The newest turn in view, after v3's 60 ms. The thread scrolls with the
     page and the composer is pinned over its foot, so the anchor below the
     last turn carries a scroll margin the composer's height — `nearest`
     then stops with the turn above the composer rather than under it. */
  useEffect(() => {
    if (turns.length === 0) return;
    const timer = window.setTimeout(
      () => endRef.current?.scrollIntoView({ block: 'nearest' }),
      60,
    );
    return () => window.clearTimeout(timer);
  }, [turns]);

  const send = useCallback(
    async (request: Request) => {
      /* One at a time. The send button is disabled while one is out; this is
         the same rule for the presses that are not that button. */
      if (abortRef.current) return;

      const you = nextId.current;
      const it = you + 1;
      nextId.current += 2;
      const now = Date.now();

      setTurns((current) => [
        ...current,
        { id: you, at: now, from: 'you', text: request.shown },
        { id: it, at: now, from: 'it', state: 'thinking' },
      ]);
      setBusy(true);

      const controller = new AbortController();
      abortRef.current = controller;
      /* The answer replaces the dots in place, so it arrives where they were. */
      const settle = (turn: Turn) =>
        setTurns((current) => current.map((row) => (row.id === it ? turn : row)));

      try {
        if (!live) {
          /* `?demo=1` with no venue: the demo's own reports, routed the way
             the endpoint routes, after the dots have had time to be seen. */
          await new Promise<void>((resolve, reject) => {
            const timer = window.setTimeout(resolve, DEMO_REPLY_MS);
            controller.signal.addEventListener('abort', () => {
              window.clearTimeout(timer);
              reject(new DOMException('aborted', 'AbortError'));
            });
          });
          settle(
            request.mode === 'ask'
              ? { id: it, at: Date.now(), from: 'it', state: 'answer', answer: demoAnswer(request.text) }
              : { id: it, at: Date.now(), from: 'it', state: 'draft', draft: demoDraft(request.goal), asked: request },
          );
        } else if (request.mode === 'ask') {
          const answer = await askAssistant({
            venueId: venue.id,
            text: request.text,
            signal: controller.signal,
          });
          settle({ id: it, at: Date.now(), from: 'it', state: 'answer', answer });
        } else {
          const draft = await draftWithAssistant({
            venueId: venue.id,
            goal: request.goal,
            signal: controller.signal,
          });
          settle({ id: it, at: Date.now(), from: 'it', state: 'draft', draft, asked: request });
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
          at: Date.now(),
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
    [live, venue.id],
  );

  /* Focus goes to the thread rather than the field after a press that removes
     the control it came from: the chips vanish with the first turn, and putting
     the caret in the composer would raise a phone's keyboard over the answer
     being waited for. */
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

  const draftChip = (goal: string, shown: string) => {
    void send({ mode: 'draft', goal, shown });
    keepFocus();
  };

  const askChip = (which: keyof typeof ASK_QUESTIONS, shown: string) => {
    void send({ mode: 'ask', text: ASK_QUESTIONS[which], shown });
    keepFocus();
  };

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setTurns([]);
    setMenu(false);
    keepFocus();
  };

  /*
   * "Export chat history" — the thread as text, saved on this device.
   *
   * Read off the rendered log rather than rebuilt from the turns, because the
   * sentences are written at render time from the server's figures: the log's
   * text *is* what the owner read, in their language and currency, and a second
   * serialiser would be a second place for the two to disagree.
   */
  const exportThread = () => {
    setMenu(false);
    const text = logRef.current?.innerText.trim();
    if (!text) return;
    const blob = new Blob([`${context.name}\n\n${text}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `paylez-assistant-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
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
    const text = typed.trim().slice(0, 400);
    if (!text || busy) return;
    void send(wantsDraft(text) ? { mode: 'draft', goal: text, shown: text } : { mode: 'ask', text, shown: text });
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

  /*
   * The starter chips. v3's four, each wired to the thing it says — a hot deal
   * and a stamp card are drafts, the stats are the month's overview, vouchers is
   * the ladder's own screen — then the server's data-driven starts the four do
   * not already cover, then the two questions only a trading venue can be asked.
   */
  const chips: Array<{ key: string; label: string; quoted?: boolean; run: () => void }> = [
    {
      key: 'deal',
      label: chat.chips.deal,
      run: () => draftChip(quiet ? DRAFT_GOALS.fill_quiet_hour : DRAFT_GOALS.first_deal, chat.chips.deal),
    },
    {
      key: 'campaign',
      label: chat.chips.campaign,
      run: () => draftChip(DRAFT_GOALS.stamp_card, chat.chips.campaign),
    },
    { key: 'stats', label: chat.chips.stats, run: () => askChip('month', chat.chips.stats) },
    { key: 'vouchers', label: chat.chips.vouchers, run: () => goTo('vouchers') },
    ...context.suggestions
      .filter((suggestion) => !COVERED.has(suggestion.key))
      .map((suggestion) => {
        const words = suggestionWords(suggestion, copy, voice, quiet);
        return {
          key: suggestion.key,
          label: words.label,
          quoted: words.quoted,
          run: () => start(suggestion),
        };
      }),
    ...(context.empty
      ? []
      : (['quiet', 'cost'] as const).map((which) => ({
          key: which,
          label: copy.questions[which],
          run: () => askChip(which, copy.questions[which]),
        }))),
  ];

  const renderTurn = (turn: Turn) => {
    if (turn.from === 'you') {
      return (
        <div className="dx-assistant-you">
          <span className="visually-hidden">{chat.you}: </span>
          <p>{turn.text}</p>
        </div>
      );
    }

    switch (turn.state) {
      case 'thinking':
        return (
          <Bot at={null} voice={voice} bare>
            <span className="visually-hidden">{copy.thinking}</span>
            <span className="dx-assistant-dots" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          </Bot>
        );
      case 'answer':
        return (
          <Bot at={turn.at} voice={voice}>
            <AnswerBody answer={turn.answer} context={context} voice={voice} onStart={start} />
          </Bot>
        );
      case 'draft':
        return (
          <Bot at={turn.at} voice={voice}>
            <DraftBody draft={turn.draft} asked={turn.asked} empty={context.empty} voice={voice} />
          </Bot>
        );
      case 'error':
        return (
          <Bot at={turn.at} voice={voice}>
            <p className="dx-assistant-p">
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
              <p className="dx-assistant-fine" lang="en">
                {turn.detail}
              </p>
            )}
            {/* No retry on `locked`: it would spend a request to be told the
                same thing, which is a button that exists to fail. */}
            {turn.kind !== 'locked' && (
              <div className="dx-assistant-acts">
                <Button variant="small" disabled={busy} onClick={() => retry(turn)}>
                  {copy.states.retry}
                </Button>
              </div>
            )}
          </Bot>
        );
    }
  };

  return (
    <section className="dx-assistant" aria-labelledby={logId}>
      <div className="dx-assistant-bar">
        <span className="dx-assistant-online">
          <i aria-hidden />
          <span id={logId}>{chat.online}</span>
        </span>
        <span className="dx-assistant-spacer" />
        {turns.length > 0 && (
          <Button variant="small" onClick={reset}>
            {chat.newConversation}
          </Button>
        )}
        <div className="dx-pop" ref={menuRef}>
          <button
            type="button"
            className="dx-assistant-kebab"
            aria-label={chat.more}
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-controls={menu ? menuId : undefined}
            onClick={() => setMenu((on) => !on)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="5" r="1" />
              <circle cx="12" cy="12" r="1" />
              <circle cx="12" cy="19" r="1" />
            </svg>
          </button>
          {menu && (
            <div className="dx-menu dx-assistant-menu" id={menuId} role="menu">
              <button
                type="button"
                className="dx-menu-item"
                role="menuitem"
                disabled={turns.length === 0}
                onClick={reset}
              >
                {chat.clear}
              </button>
              <button type="button" className="dx-menu-item" role="menuitem" onClick={exportThread}>
                {chat.export}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* A log: new turns are announced as they arrive, and nothing already
          said is read again. Focusable by script only, so a press that removes
          its own control can leave focus somewhere that makes sense. */}
      <div
        className="dx-assistant-thread"
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-labelledby={logId}
        tabIndex={-1}
      >
        <Snapshot venue={venue} context={context} deals={deals} voice={voice} at={opened} />
        <Attention review={reviewItems} deals={deals} budget={budget} voice={voice} at={opened} />
        {review.state.status === 'error' && live && !isPlanLocked(review.state.error) && (
          <Bot at={opened} voice={voice}>
            <p className="dx-assistant-p">{copy.attentionFailed}</p>
            <div className="dx-assistant-acts">
              <Button variant="small" onClick={review.reload}>
                {copy.states.retry}
              </Button>
            </div>
          </Bot>
        )}

        {turns.length === 0 && (
          <div className="dx-assistant-chips">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className="dx-assistant-chip"
                disabled={busy}
                lang={chip.quoted ? 'en' : undefined}
                onClick={chip.run}
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {turns.map((turn) => (
          <div key={turn.id} className="dx-assistant-turn" data-from={turn.from}>
            {renderTurn(turn)}
          </div>
        ))}
        <div className="dx-assistant-end" ref={endRef} aria-hidden />
      </div>

      <div className="dx-assistant-composer">
        <div className="dx-assistant-composer-in">
          <label className="visually-hidden" htmlFor={fieldId}>
            {chat.fieldLabel}
          </label>
          <div className="dx-assistant-well">
            <textarea
              id={fieldId}
              ref={fieldRef}
              rows={1}
              value={typed}
              /* The server's tighter ceiling of the two: 400 for a goal, 500
                 for a question — and a line is not known to be either until
                 it is sent. */
              maxLength={400}
              placeholder={chat.placeholder}
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
              className="dx-assistant-send"
              disabled={busy || !typed.trim()}
              aria-label={copy.send}
              title={copy.send}
              onClick={submit}
            >
              <DxIcon name="arrowRight" size={17} strokeWidth={2.1} />
            </button>
          </div>
          <p className="dx-assistant-foot">{copy.composerNote}</p>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── the states ── */

/** In flight. One line, and never a zero standing in for an answer. */
function Asking() {
  const dashboard = useCopy().dashboard;
  return (
    <Card>
      <p className="dx-fine">{dashboard.unmeasured.asking}</p>
    </Card>
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
    <EmptyState
      icon="assistant"
      title={states.title}
      body={
        <>
          {states.body}
          {reason && (
            <>
              <br />
              <br />
              {reason}
            </>
          )}
        </>
      }
      action={retry ? { label: states.retry, onClick: retry } : undefined}
    />
  );
}

/**
 * The plan does not carry the assistant.
 *
 * Not an error and not a retry: the answer will be the same until the plan
 * changes. The press is a letter to the people who can change it, because no
 * screen on this site sells a partner plan.
 */
function PlanLocked({ venue }: { venue: PartnerVenue }) {
  const states = useCopy().dashboard.assistant.states;
  const subject = fill(states.lockedSubject, { venue: venue.name });

  return (
    <Card className="dx-empty">
      <div className="dx-empty-ico">
        <DxIcon name="lock" size={20} />
      </div>
      <h2>{states.lockedTitle}</h2>
      <p>{states.lockedBody}</p>
      <a
        className="dx-btn"
        data-variant="primary"
        href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(subject)}`}
      >
        {states.lockedAction}
      </a>
    </Card>
  );
}

/* ───────────────────────────────────────────────────────────────── the screen ── */

export function Assistant() {
  const venueApi = usePartnerVenue();
  const liveVenue = venueApi.state.status === 'ready' ? venueApi.state.data : null;
  /* `?demo=1` on a device with no venue: the demo café, and the demo's
     answers — only after the real read has said there is nobody to ask. */
  const demo = DEMO_MODE && venueApi.state.status === 'error' && isNoSession(venueApi.state.error);
  const venue = liveVenue ?? (demo ? DEMO_VENUE : null);
  const contextApi = useAssistantContext(liveVenue?.id ?? null);
  const reviewApi = useAssistantReview(liveVenue?.id ?? null);
  const context = readyOr(contextApi.state, demo ? DEMO_ASSISTANT_CONTEXT : null);

  let body: ReactNode;
  if (venueApi.state.status === 'loading') {
    body = <Asking />;
  } else if (venueApi.state.status === 'error' && !demo) {
    body = <Unavailable error={venueApi.state.error} onRetry={venueApi.reload} />;
  } else if (venue === null) {
    body = <Unavailable noVenue />;
  } else if (context) {
    /* Keyed on the venue so a different venue starts a different thread. */
    return (
      <Conversation
        key={venue.id}
        venue={venue}
        live={liveVenue !== null}
        context={context}
        review={reviewApi}
      />
    );
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
    body = <Asking />;
  }

  return <div className="dx-assistant-state">{body}</div>;
}
