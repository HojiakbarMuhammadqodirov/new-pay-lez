import { useMemo, useRef, useState } from 'react';
import { Icon } from './icons';
import { useCopy, useCurrency, useLanguage, useMoney } from './i18n/context';
import { LANGUAGES, LANGUAGE_ORDER } from './i18n/context';
import type { LanguageCode } from './i18n/context';
import { fill, group } from './i18n/currency';
import {
  AVG_SPEND,
  PD_ASSIST,
  PD_ASSIST_COPY,
  PD_AUDIENCES,
  PD_CAMPAIGNS,
  PD_CUSTOMERS,
  PD_CAMPAIGN_MODEL,
  PD_DEALS,
  PD_NOTIFY_QUOTA,
  PD_TIERS,
  PD_VOUCHER_MODEL,
} from './partnerMetrics';
import type { AssistReward } from './partnerMetrics';
import { useDashboard } from './dashboardShell';

/**
 * The assistant — the largest screen in the prototype, and the only one that
 * talks back.
 *
 * `b2b/Paylez Partner Dashboard v2.dc.html` gives it a conversation, a draft it
 * can defend line by line, the deal text in every language the product ships,
 * three named ways out, and four endings that are not a draft at all: an answer
 * to a question, a review of everything running, a hand-over to the normal form,
 * and a plain "I cannot do that, here is what I can do instead". All of that is
 * here, because the screen is the argument: an assistant that only ever
 * succeeds is a demo, and the endings are what make it a design.
 *
 * Three things about it are load-bearing.
 *
 * - **It reads numbers; it does not invent them.** Every figure in every
 *   sentence arrives through a `fill()` hole from `partnerMetrics.ts` — the
 *   quiet hours, the peer comparison, the notification quota, both budget pools,
 *   the tier that moved. That is exactly what the composer note promises the
 *   owner, and a number typed into a dictionary string would break the promise
 *   silently.
 * - **Nothing it drafts is live, and the screen never opens.** `PD_ASSIST.measured`
 *   is false until a venue's own context has been fetched, and nothing fetches
 *   it — so the whole conversation below is unreachable and the panel says why.
 *   That is deliberate rather than pending: the sentences here quote a quiet
 *   window, a peer comparison, a free-item multiple and a Russian-speaking
 *   share, and `GET /v1/partner/venues/:id/assistant/context` answers a
 *   *different* set of facts. Wiring it is a rewrite of the conversation, not a
 *   fetch, and drafting around the holes in the meantime is exactly the failure
 *   the "it reads numbers, it does not invent them" rule above exists to stop.
 *   Every other screen on this dashboard now writes to the server; this one is
 *   the exception and is honest about being one.
 * - **The language tabs are the product's five, not the reader's one.** The
 *   whole point of that panel is that an owner reading in Polish sees what a
 *   Russian-speaking customer will read, so `PD_ASSIST_COPY` is a fixed table
 *   rather than dictionary copy. See its comment for why.
 *
 * The parsing is deliberately shallow — keyword matching per stage, the
 * prototype's own — because it has to be: there is no model behind it, and a
 * screen that pretends otherwise is worse than one that hands you the form. The
 * `missed` ending exists for exactly the case where the matching fails twice.
 */

/* ─────────────────────────────────────────────────────────────── the flow ── */

type Step = 'start' | 'draft' | 'published' | 'review' | 'answer' | 'handed' | 'cant' | 'missed';
type Stage = 'idle' | 'reward' | 'budget' | 'duration' | 'notify' | 'ready';
type Goal = 'quiet' | 'lapsed' | 'new' | 'review';

interface Message {
  who: 'you' | 'it';
  text: string;
}

interface Draft {
  step: Step;
  stage: Stage;
  goal: Goal;
  reward: AssistReward;
  /** Euros, one of `PD_ASSIST.budgets`. */
  budget: number;
  weeks: number;
  notify: boolean;
  /** Index into `copy.assistant.dayChoices`. */
  dayChoice: number;
  hourFrom: string;
  hourTo: string;
  /** Set once a revision narrows the audience. */
  noStudents: boolean;
  /** What the last revision moved, for the change list on the draft. */
  changes: Array<{ field: string; from: string; to: string }>;
  /** Claims the deal stops after; `null` means "whatever the budget buys". */
  stopAfter: number | null;
  sendAt: string;
  messages: Message[];
  /** How many times a revision has failed to parse. Two ends the loop. */
  attempts: number;
  exits: boolean;
}

const FRESH: Draft = {
  step: 'start',
  stage: 'idle',
  goal: 'quiet',
  reward: 'item',
  budget: PD_ASSIST.budgets[1],
  weeks: 4,
  notify: true,
  dayChoice: 0,
  hourFrom: PD_ASSIST.quietFrom,
  hourTo: PD_ASSIST.quietTo,
  noStudents: false,
  changes: [],
  stopAfter: null,
  sendAt: PD_ASSIST.sendAt,
  messages: [],
  attempts: 0,
  exits: false,
};

/* ───────────────────────────────────────────────────────────── the parser ── */

/*
 * Five languages of keywords, which is the whole of the "understanding".
 *
 * Written out per stage rather than as one intent classifier because that is
 * what it honestly is — and because a stage knows what it is asking, so
 * "coffee" only has to mean a free item while the question on the table is what
 * people get. Each list carries the site's five languages; the prototype's
 * Turkish and Azerbaijani are dropped, since a draft cannot promise a
 * translation the product does not ship.
 */
const RE = {
  cant: /spend|how much they|średnio|wydaj|тратят|скольк|витрача/i,
  review: /review|everything|what.*fix|przegl|wszystk|обзор|всё|огляд/i,
  voucher: /voucher|why.*drop|why.*down|\bbon\b|ваучер|знижк|скидк/i,
  lapsed: /back|stopped|lapsed|regular|wróc|stał|верн|давно|поверн/i,
  new: /first.?time|new customer|new people|nowy|nowi|нов/i,
  item: /coffee|free item|free |\bitem\b|kawa|бесплат|filter|подар|безкошт|bepul|qahva/i,
  percent: /percent|%|off the bill|\boff\b|discount|zniżk|скид|знижк|chegirma/i,
  no: /\bno\b|nope|\bnie\b|нет|\bні\b|just list|don.t|do not|yo['’]q/i,
  yes: /\byes\b|yeah|sure|send|\btak\b|\bда\b|\bтак\b|\bha\b|ha,/i,
  fortnight: /fortnight|two week|2 week|dwa tyg|две недел|два тижн|ikki hafta/i,
  month: /month|miesiąc|месяц|місяц|oy\b/i,
  weeks: /(\d+)\s*(week|tyg|недел|тижн|hafta)/i,
  thursday: /thursday|czwart|четверг|четвер|payshanba/i,
  friday: /friday|piątek|пятниц|п'?ятниц|juma/i,
  student: /student|студент|talaba/i,
  morning: /morning|rano|poranek|утр|ранк|ertalab/i,
};

/** Snaps a typed number to whichever of the three budgets it is nearest. */
function nearestBudget(text: string, options: readonly number[], rate: number): number | null {
  const match = text.replace(/\s/g, '').match(/(\d{2,7})/);
  if (!match) return null;
  /* The owner types their own currency, so the comparison happens there and the
     answer comes back in euros — the same conversion every money control on
     this dashboard does, in the one place a number arrives by keyboard. */
  const typed = Number(match[1]);
  let best = options[0];
  let closest = Infinity;
  for (const option of options) {
    const distance = Math.abs(option * rate - typed);
    if (distance < closest) {
      closest = distance;
      best = option;
    }
  }
  return best;
}

function parseWeeks(text: string): number | null {
  if (RE.fortnight.test(text)) return 2;
  if (RE.month.test(text)) return 4;
  const match = text.match(RE.weeks);
  if (!match) return null;
  const typed = Number(match[1]);
  return PD_ASSIST.weeks.reduce((best, option) =>
    Math.abs(option - typed) < Math.abs(best - typed) ? option : best,
  );
}

/** A deal's run length in whole weeks, or 0 when its window is open-ended. */
const weeksOf = (deal: { from: string | null; to: string | null }): number =>
  deal.from && deal.to
    ? Math.max(
        1,
        Math.round(
          (new Date(deal.to).getTime() - new Date(deal.from).getTime()) / 604_800_000,
        ),
      )
    : 0;

/* ─────────────────────────────────────────────────────────────── the screen ── */

export function Assistant() {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.assistant;
  const money = useMoney();
  const currency = useCurrency();
  const [language] = useLanguage();
  const { goTo, openDrawer, toast } = useDashboard();

  const [draft, setDraft] = useState<Draft>(FRESH);
  const [typed, setTyped] = useState('');
  const [revision, setRevision] = useState('');
  const [langOpen, setLangOpen] = useState<LanguageCode>(language);
  /* Edits to the deal text live outside the draft: a revision rewrites the
     draft and must not silently throw away words the owner typed into a
     translation. */
  const [edits, setEdits] = useState<
    Partial<Record<AssistReward, Partial<Record<LanguageCode, { title?: string; body?: string }>>>>
  >({});
  const [terms, setTerms] = useState(copy.terms);
  const thread = useRef<HTMLDivElement>(null);

  const num = (value: number) => group(value, currency);
  const patch = (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next }));

  /* ── the figures every sentence is filled from ── */

  const vouchers = PD_VOUCHER_MODEL;
  const campaigns = PD_CAMPAIGN_MODEL;
  const days = copy.dayChoices[draft.dayChoice];
  const tight = draft.budget > PD_ASSIST.hotRoom;
  const budget = tight ? Math.min(draft.budget, PD_ASSIST.hotRoom) : draft.budget;
  /* What one claim costs: a fixed price for a free item, a fifth of the average
     bill for a percentage off. The whole cost panel hangs off this one line. */
  const unit = draft.reward === 'item' ? PD_ASSIST.itemCost : AVG_SPEND * 0.2;
  const claims = draft.stopAfter ?? Math.max(1, Math.round(budget / unit));
  const cost = claims * unit;
  const audience = PD_AUDIENCES[PD_ASSIST.audience];
  const sample = PD_ASSIST_COPY[draft.reward];
  const edited = edits[draft.reward] ?? {};

  const say = (them: string, you?: string) =>
    setDraft((current) => ({
      ...current,
      messages: [
        ...current.messages,
        ...(you ? ([{ who: 'you', text: you }] as Message[]) : []),
        { who: 'it', text: them },
      ],
    }));

  /* ── the four replies ── */

  const askBudget = (reward: AssistReward) =>
    fill(copy.askBudget[reward], {
      x: String(PD_ASSIST.itemMultiple),
      amount: money(PD_ASSIST.itemCost, 'unit'),
    });

  const askDuration = (amount: number) =>
    fill(copy.askDuration, { amount: money(amount, 'exact') });

  const askNotify = (weeks: number) =>
    fill(copy.askNotify, {
      n: String(weeks),
      left: String(PD_NOTIFY_QUOTA.left),
      total: String(PD_NOTIFY_QUOTA.total),
    });

  const readyLine = (on: boolean) =>
    fill(copy.ready, { notify: on ? copy.readyNotify : '' });

  const goalOpen = (goal: Goal) =>
    goal === 'lapsed'
      ? fill(copy.goalOpen.lapsed, { n: String(PD_CUSTOMERS.lapsed) })
      : goal === 'new'
        ? copy.goalOpen.new
        : fill(copy.goalOpen.quiet, {
            days: copy.dayChoices[0],
            from: PD_ASSIST.quietFrom,
            to: PD_ASSIST.quietTo,
            pct: String(PD_ASSIST.quietBelow),
          });

  /** Opens the thread on one of the four starts the right-hand column offers. */
  const start = (index: number) => {
    const seeds: Goal[] = ['quiet', 'lapsed', 'review', 'quiet'];
    const goal = seeds[index];
    const seed = fill(copy.options[index].seed, { n: String(PD_CUSTOMERS.lapsed) });

    if (index === 2) {
      setDraft({ ...FRESH, step: 'review', goal: 'review', messages: [{ who: 'you', text: seed }] });
      return;
    }
    if (index === 3) {
      setDraft({ ...FRESH, step: 'answer', messages: [{ who: 'you', text: seed }] });
      return;
    }
    setDraft({
      ...FRESH,
      goal,
      stage: 'reward',
      messages: [
        { who: 'you', text: seed },
        { who: 'it', text: goalOpen(goal) },
      ],
    });
  };

  /** A chip answer: the stage's value is known, so no parsing is needed. */
  const chip = (value: string | number | boolean, label: string) => {
    if (draft.stage === 'reward') {
      const reward = value as AssistReward;
      patch({ reward, stage: 'budget' });
      say(askBudget(reward), label);
    } else if (draft.stage === 'budget') {
      patch({ budget: value as number, stage: 'duration' });
      say(askDuration(value as number), label);
    } else if (draft.stage === 'duration') {
      patch({ weeks: value as number, stage: 'notify' });
      say(askNotify(value as number), label);
    } else if (draft.stage === 'notify') {
      patch({ notify: value as boolean, stage: 'ready' });
      say(readyLine(value as boolean), label);
    }
  };

  /** A typed answer, read against whichever question is on the table. */
  const send = () => {
    const text = typed.trim();
    if (!text) return;
    setTyped('');

    if (draft.stage === 'idle') {
      if (RE.cant.test(text)) {
        setDraft((c) => ({ ...c, step: 'cant', messages: [...c.messages, { who: 'you', text }] }));
        return;
      }
      if (RE.review.test(text)) {
        setDraft((c) => ({
          ...c,
          step: 'review',
          goal: 'review',
          messages: [...c.messages, { who: 'you', text }],
        }));
        return;
      }
      if (RE.voucher.test(text)) {
        setDraft((c) => ({ ...c, step: 'answer', messages: [...c.messages, { who: 'you', text }] }));
        return;
      }
      const goal: Goal = RE.lapsed.test(text) ? 'lapsed' : RE.new.test(text) ? 'new' : 'quiet';
      /* Anything it *did* understand in the opening sentence is kept, so a
         person who says "400 zł for a month" is not asked both again. */
      const budgetSaid = nearestBudget(text, PD_ASSIST.budgets, currency.rate);
      const weeksSaid = parseWeeks(text);
      const rewardSaid = RE.item.test(text) ? 'item' : RE.percent.test(text) ? 'percent' : null;
      setDraft((c) => ({
        ...c,
        goal,
        stage: 'reward',
        ...(budgetSaid ? { budget: budgetSaid } : {}),
        ...(weeksSaid ? { weeks: weeksSaid } : {}),
        ...(rewardSaid ? { reward: rewardSaid } : {}),
        messages: [...c.messages, { who: 'you', text }, { who: 'it', text: goalOpen(goal) }],
      }));
      return;
    }

    if (draft.stage === 'reward') {
      const reward: AssistReward | null = RE.item.test(text)
        ? 'item'
        : RE.percent.test(text)
          ? 'percent'
          : null;
      if (reward) {
        patch({ reward, stage: 'budget' });
        say(askBudget(reward), text);
      } else {
        say(copy.retry.reward, text);
      }
      return;
    }

    if (draft.stage === 'budget') {
      const value = nearestBudget(text, PD_ASSIST.budgets, currency.rate);
      if (value != null) {
        patch({ budget: value, stage: 'duration' });
        say(askDuration(value), text);
      } else {
        say(
          fill(copy.retry.budget, {
            a: money(PD_ASSIST.budgets[0], 'exact'),
            b: money(PD_ASSIST.budgets[1], 'exact'),
            c: money(PD_ASSIST.budgets[2], 'exact'),
          }),
          text,
        );
      }
      return;
    }

    if (draft.stage === 'duration') {
      const value = parseWeeks(text);
      if (value != null) {
        patch({ weeks: value, stage: 'notify' });
        say(askNotify(value), text);
      } else {
        say(copy.retry.duration, text);
      }
      return;
    }

    if (draft.stage === 'notify') {
      const value = RE.no.test(text) ? false : RE.yes.test(text) ? true : null;
      if (value != null) {
        patch({ notify: value, stage: 'ready' });
        say(readyLine(value), text);
      } else {
        say(copy.retry.notify, text);
      }
      return;
    }

    say(copy.retry.other, text);
  };

  /**
   * A revision: change only what was named, and show what moved.
   *
   * Two failures in a row stop it asking. That is the whole reason `missed`
   * exists as a step — a matcher this shallow *will* fail, and a screen that
   * keeps saying "sorry, try again" is worse than one that opens the form with
   * what it did understand already filled in.
   */
  const revise = () => {
    const text = revision.trim();
    if (!text) return;
    const changes: Draft['changes'] = [];
    const next: Partial<Draft> = {};

    if (RE.thursday.test(text)) {
      changes.push({ field: copy.revisions.days, from: days, to: copy.revisions.thursday });
      next.dayChoice = 1;
    } else if (RE.friday.test(text)) {
      changes.push({ field: copy.revisions.days, from: days, to: copy.revisions.friday });
      next.dayChoice = 2;
    }
    if (RE.morning.test(text)) {
      const [from, to] = copy.revisions.morning.split('–');
      changes.push({
        field: copy.revisions.hours,
        from: `${draft.hourFrom}–${draft.hourTo}`,
        to: copy.revisions.morning,
      });
      next.hourFrom = from;
      next.hourTo = to;
    }
    if (RE.student.test(text)) {
      changes.push({
        field: copy.revisions.audience,
        from: dashboard.deals.audiences[PD_ASSIST.audience],
        to: fill(copy.revisions.noStudents, { n: num(audience.reach - PD_ASSIST.students) }),
      });
      next.noStudents = true;
    }

    setRevision('');
    if (!changes.length) {
      patch({ step: 'missed', attempts: draft.attempts + 1 });
      return;
    }
    patch({ ...next, changes, exits: false });
    toast(copy.draftUpdated);
  };

  /* ── the pieces of the draft ── */

  const reasons = [
    draft.dayChoice === 0
      ? fill(copy.reasons.quietDays, {
          days,
          from: draft.hourFrom,
          to: draft.hourTo,
          pct: String(PD_ASSIST.quietBelow),
        })
      : fill(copy.reasons.movedDays, {
          days,
          quiet: copy.dayChoices[0],
          from: PD_ASSIST.quietFrom,
          to: PD_ASSIST.quietTo,
        }),
    draft.reward === 'item'
      ? fill(copy.reasons.item, {
          x: String(PD_ASSIST.itemMultiple),
          n: String(PD_ASSIST.peers),
          amount: money(PD_ASSIST.itemCost, 'unit'),
        })
      : copy.reasons.percent,
    fill(tight ? copy.reasons.budgetTight : copy.reasons.budget, {
      amount: money(budget, 'exact'),
    }),
  ];

  const readyRows = [
    copy.goals[draft.goal === 'lapsed' ? 1 : draft.goal === 'new' ? 2 : 0],
    copy.dealValues[draft.reward],
    `${days}, ${draft.hourFrom}–${draft.hourTo}`,
    money(budget, 'exact'),
    fill(copy.weeksValue, { n: String(draft.weeks) }),
    draft.notify ? copy.notifyYes : copy.notifyNo,
  ];

  const dealValues = [
    copy.dealValues[draft.reward],
    `${days}, ${draft.hourFrom}–${draft.hourTo}`,
    fill(copy.weeksValue, { n: String(draft.weeks) }),
    draft.noStudents
      ? fill(copy.revisions.noStudents, { n: num(audience.reach - PD_ASSIST.students) })
      : dashboard.deals.audiences[PD_ASSIST.audience],
  ];

  const chips = useMemo(() => {
    if (draft.stage === 'reward') {
      return [
        { label: copy.chips.item, value: 'item' as const },
        { label: copy.chips.percent, value: 'percent' as const },
      ];
    }
    if (draft.stage === 'budget') {
      return PD_ASSIST.budgets.map((amount) => ({
        label: money(amount, 'exact'),
        value: amount,
      }));
    }
    if (draft.stage === 'duration') {
      return PD_ASSIST.weeks.map((weeks) => ({
        label: fill(copy.chips.weeks, { n: String(weeks) }),
        value: weeks,
      }));
    }
    if (draft.stage === 'notify') {
      return [
        { label: copy.chips.yes, value: true },
        { label: copy.chips.no, value: false },
      ];
    }
    return [];
  }, [draft.stage, copy, money]);

  const placeholder =
    draft.stage === 'idle'
      ? copy.placeholders.idle
      : draft.stage === 'ready'
        ? copy.placeholders.ready
        : draft.stage === 'budget'
          ? fill(copy.placeholders.budget, {
              a: money(PD_ASSIST.budgets[0], 'exact'),
              b: money(PD_ASSIST.budgets[1], 'exact'),
              c: money(PD_ASSIST.budgets[2], 'exact'),
            })
          : copy.placeholders[draft.stage];

  /*
   * With nothing measured, it has nothing to say — and says that.
   *
   * The rule for this screen (root `CLAUDE.md`) is that **every figure in every
   * sentence arrives through a `fill()` hole from `partnerMetrics.ts`**, which
   * is what stops it inventing one. The seeds behind those holes are gone, so
   * the corollary now bites: an assistant that fills a hole with 0 or a blank
   * because it cannot know is exactly the failure that rule exists to prevent.
   * `PD_ASSIST.measured` is false until a venue's own context has been fetched
   * from `GET /v1/partner/venues/:id/assistant/context`, and until then this
   * refuses to draft rather than drafting around holes.
   *
   * It sits after every hook, so the hook order is unchanged.
   */
  if (!PD_ASSIST.measured) {
    const empty = dashboard.empty[5];
    return (
      <div className="pd-stack pd-assist">
        <div className="pd-glass pd-panel pd-empty" data-reveal>
          <h3>{empty.title}</h3>
          <p className="pd-fine">{empty.body}</p>
          <p className="pd-fine">{dashboard.unmeasured.assistant}</p>
        </div>
      </div>
    );
  }

  /* ── screens the conversation can end on ── */

  const winter = PD_CAMPAIGNS.findIndex((campaign) => !campaign.live);
  const lunch = PD_DEALS.findIndex((deal) => deal.state === 'expired');
  const tier = PD_TIERS[1];
  /* Redemptions this month, across every tier — the same sum the Vouchers page
     shows, so the answer below explains a number the owner can go and find. */
  const redeemedNow = PD_TIERS.reduce((total, row) => total + row.redeemed, 0);

  return (
    <div className="pd-stack pd-assist">
      {/* Two panels side by side: what it knows, and where to start. The left is
          the argument for trusting it at all, so it comes first and it is the
          dark one. */}
      <div className="pd-two pd-assist-top">
        <div className="pd-glass pd-hero pd-knows" data-ink="paper" data-reveal>
          <span className="console-label">{copy.knowTitle}</span>
          <p className="pd-lede">{copy.intro}</p>
          <ul>
            <li>
              {fill(copy.knows[0], {
                days: copy.dayChoices[0],
                from: PD_ASSIST.quietFrom,
                to: PD_ASSIST.quietTo,
                pct: String(PD_ASSIST.quietBelow),
              })}
            </li>
            <li>{fill(copy.knows[1], { pct: String(PD_ASSIST.russianShare) })}</li>
            <li>
              {fill(copy.knows[2], {
                n: String(PD_ASSIST.peers),
                x: String(PD_ASSIST.itemMultiple),
              })}
            </li>
            <li>
              {fill(copy.knows[3], {
                vouchers: money(Math.max(0, vouchers.available), 'exact'),
                loyalty: money(Math.max(0, campaigns.available), 'exact'),
              })}
            </li>
          </ul>
        </div>

        <div className="pd-glass pd-panel pd-starts" data-reveal>
          <span className="console-label">{copy.optionsTitle}</span>
          <p className="pd-fine">{copy.optionsIntro}</p>
          <div className="pd-start-list">
            {copy.options.map((option, index) => (
              <button key={option.name} type="button" onClick={() => start(index)}>
                <b>{option.name}</b>
                <span>
                  {fill(option.desc, {
                    days: copy.dayChoices[0],
                    from: PD_ASSIST.quietFrom,
                    to: PD_ASSIST.quietTo,
                    pct: String(PD_ASSIST.quietBelow),
                    n: String(PD_CUSTOMERS.lapsed),
                  })}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {draft.step === 'start' && (
        <div className="pd-glass pd-thread" data-solid="true" data-reveal>
          <div className="pd-thread-head">
            <span className="console-label">
              <i className="pd-live-dot" aria-hidden />
              {copy.convTitle}
            </span>
            {draft.messages.length > 0 && (
              <button type="button" className="btn btn-ghost" onClick={() => setDraft(FRESH)}>
                {copy.reset}
              </button>
            )}
          </div>

          <div className="pd-msgs" ref={thread}>
            <p className="pd-msg" data-who="it">
              {copy.opening}
            </p>
            {draft.messages.map((message, index) => (
              <p className="pd-msg" data-who={message.who} key={`${index}-${message.text}`}>
                {message.text}
              </p>
            ))}

            {chips.length > 0 && (
              <div className="pd-chips">
                {chips.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => chip(option.value, option.label)}
                  >
                    {option.label}
                  </button>
                ))}
                <span className="pd-fine">{copy.chipsHint}</span>
              </div>
            )}

            {draft.stage === 'ready' && (
              <div className="pd-ready">
                <span className="console-label">{copy.readyTitle}</span>
                <dl>
                  {copy.readyRows.map((label, index) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{readyRows[index]}</dd>
                    </div>
                  ))}
                </dl>
                <button
                  type="button"
                  className="btn btn-solid"
                  onClick={() => patch({ step: 'draft' })}
                >
                  {copy.showDraft}
                </button>
              </div>
            )}
          </div>

          {/* The composer. Enter sends, shift-enter breaks the line — the one
              keyboard convention a chat box may not get wrong. */}
          <div className="pd-composer">
            <label className="pd-composer-well">
              <span className="visually-hidden">{placeholder}</span>
              <textarea
                rows={1}
                value={typed}
                placeholder={placeholder}
                onChange={(event) => setTyped(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    send();
                  }
                }}
              />
              <button
                type="button"
                className="pd-send"
                disabled={!typed.trim()}
                aria-label={copy.send}
                onClick={send}
              >
                <Icon name="arrow" size={17} strokeWidth={2.1} />
              </button>
            </label>
            <p className="pd-fine">{copy.composerNote}</p>
          </div>
        </div>
      )}

      {draft.step === 'draft' && (
        <div className="pd-glass pd-draft" data-solid="true" data-reveal>
          <div className="pd-draft-head">
            <span className="pd-tag">{copy.draftTag}</span>
            <span>{copy.draftNote}</span>
          </div>

          <div className="pd-draft-body">
            {draft.changes.length > 0 && (
              <div className="pd-changed">
                <span className="console-label">{copy.changedTitle}</span>
                {draft.changes.map((change) => (
                  <div key={change.field}>
                    <b>{change.field}</b>
                    <span>
                      <del>{change.from}</del>
                      <em>
                        <Icon name="arrow" size={14} strokeWidth={2.2} />
                        {change.to}
                      </em>
                    </span>
                  </div>
                ))}
                <p className="pd-fine">{copy.changedNote}</p>
              </div>
            )}

            <p className="pd-proof">
              {fill(copy.sentence[draft.reward], {
                days,
                from: draft.hourFrom,
                to: draft.hourTo,
                weeks: String(draft.weeks),
              })}
            </p>

            <span className="console-label">{copy.whyTitle}</span>
            <ul className="pd-reasons">
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>

            {/* The two objects it would create, each written as the record it
                would become rather than as prose. */}
            <div className="pd-record">
              <div className="pd-record-head">
                <span className="pd-tag" data-quiet="true">
                  {copy.dealTag}
                </span>
                <span className="pd-fine">{copy.dealNew}</span>
              </div>
              {copy.dealFields.map((label, index) => (
                <div className="pd-record-row" key={label}>
                  <span>{label}</span>
                  <b>{dealValues[index]}</b>
                </div>
              ))}
              <div className="pd-record-row">
                <span>{copy.stopAfter}</span>
                <label className="pd-well">
                  <span className="visually-hidden">{copy.stopAfter}</span>
                  <input
                    type="number"
                    value={claims}
                    onChange={(event) =>
                      patch({ stopAfter: Math.max(1, Number(event.target.value) || 1) })
                    }
                  />
                  <span>{copy.claims}</span>
                </label>
              </div>
              <p className="pd-fine">{copy.fieldNote}</p>
            </div>

            {draft.notify && (
              <div className="pd-record">
                <div className="pd-record-head">
                  <span className="pd-tag" data-quiet="true">
                    {copy.notifyTag}
                  </span>
                  <span className="pd-fine">{copy.notifyAttached}</span>
                </div>
                <div className="pd-record-row">
                  <span>{copy.goesOut}</span>
                  <label className="pd-well">
                    <span className="visually-hidden">{copy.goesOut}</span>
                    <input
                      type="time"
                      value={draft.sendAt}
                      onChange={(event) => patch({ sendAt: event.target.value })}
                    />
                  </label>
                </div>
                <div className="pd-record-row">
                  <span>{copy.notifyFields[0]}</span>
                  <b>{fill(copy.notifyReach, { n: num(audience.notifiable) })}</b>
                </div>
                <div className="pd-record-row">
                  <span>{copy.notifyFields[1]}</span>
                  <b>{fill(copy.notifyUses, { n: String(PD_NOTIFY_QUOTA.left) })}</b>
                </div>
              </div>
            )}

            <div className="pd-brief">
              <span className="console-label">{copy.costTitle}</span>
              <b>
                {fill(copy.costLine[draft.reward], {
                  n: num(claims),
                  amount: money(cost, 'exact'),
                  each: money(PD_ASSIST.itemCost, 'unit'),
                  avg: money(AVG_SPEND, 'unit'),
                })}
              </b>
              <p>{copy.costNote}</p>
            </div>

            {tight && (
              <p className="pd-brief pd-brief-warn">
                <Icon name="warn" size={16} />
                {fill(copy.budgetWarn, {
                  asked: money(draft.budget, 'exact'),
                  room: money(PD_ASSIST.hotRoom, 'exact'),
                  n: num(claims),
                  wanted: num(Math.round(draft.budget / unit)),
                })}
              </p>
            )}

            {/* The five languages, as tabs. This is the panel the whole screen
                is arguing for: an owner who reads in one language can see, and
                edit, what a customer reading in another will be shown. */}
            <div className="pd-langs">
              <div className="pd-lang-head">
                <span className="console-label">{copy.readTitle}</span>
                <span className="pd-tag" data-warn="true">
                  {copy.readWarn}
                </span>
              </div>
              <div className="pd-seg">
                {LANGUAGE_ORDER.map((code) => (
                  <button
                    key={code}
                    type="button"
                    title={LANGUAGES[code].label}
                    data-on={langOpen === code ? 'true' : undefined}
                    onClick={() => setLangOpen(code)}
                  >
                    {LANGUAGES[code].short}
                  </button>
                ))}
              </div>
              <label className="field">
                <span className="field-label">
                  {fill(copy.titleIn, { lang: LANGUAGES[langOpen].label })}
                </span>
                <input
                  value={edited[langOpen]?.title ?? sample[langOpen].title}
                  onChange={(event) =>
                    setEdits((current) => ({
                      ...current,
                      [draft.reward]: {
                        ...current[draft.reward],
                        [langOpen]: {
                          ...current[draft.reward]?.[langOpen],
                          title: event.target.value,
                        },
                      },
                    }))
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">
                  {fill(copy.bodyIn, { lang: LANGUAGES[langOpen].label })}
                </span>
                <textarea
                  rows={2}
                  value={edited[langOpen]?.body ?? sample[langOpen].body}
                  onChange={(event) =>
                    setEdits((current) => ({
                      ...current,
                      [draft.reward]: {
                        ...current[draft.reward],
                        [langOpen]: {
                          ...current[draft.reward]?.[langOpen],
                          body: event.target.value,
                        },
                      },
                    }))
                  }
                />
              </label>
            </div>

            <div className="pd-langs">
              <div className="pd-lang-head">
                <span className="console-label">{copy.termsTitle}</span>
                <span className="pd-tag" data-quiet="true">
                  {copy.termsTag}
                </span>
              </div>
              <label className="field">
                <span className="visually-hidden">{copy.termsTitle}</span>
                <textarea
                  rows={2}
                  value={terms}
                  onChange={(event) => setTerms(event.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="pd-draft-foot">
            <span className="console-label">{copy.reviseTitle}</span>
            <div className="pd-revise">
              <label className="field">
                <span className="visually-hidden">{copy.reviseTitle}</span>
                <textarea
                  rows={2}
                  value={revision}
                  placeholder={copy.revisePlaceholder}
                  onChange={(event) => setRevision(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn btn-solid"
                disabled={!revision.trim()}
                onClick={revise}
              >
                {copy.reviseAction}
              </button>
            </div>
            <p className="pd-fine">{copy.reviseNote}</p>
          </div>

          <div className="pd-draft-acts">
            <button
              type="button"
              className="btn btn-solid"
              onClick={() => {
                patch({ step: 'published' });
                toast(copy.published);
              }}
            >
              {copy.publish}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => patch({ exits: !draft.exits })}
            >
              {copy.notRight}
            </button>
          </div>

          {draft.exits && (
            <div className="pd-exits">
              <p className="pd-fine">{copy.exitsIntro}</p>
              <div className="pd-exit-list">
                {copy.exits.map((exit, index) => (
                  <div key={exit.title}>
                    <b>{exit.title}</b>
                    <p>{exit.note}</p>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        if (index === 0) patch({ exits: false });
                        else if (index === 1) patch({ step: 'handed', exits: false });
                        else setDraft(FRESH);
                      }}
                    >
                      {exit.label}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {draft.step === 'published' && (
        <div className="pd-glass pd-panel" data-reveal>
          <h2 className="pd-done">
            <Icon name="check" size={20} strokeWidth={2.4} />
            {draft.notify ? copy.publishedTitle : copy.publishedOne}
          </h2>
          <div className="pd-record">
            <div className="pd-record-row pd-record-item">
              <span className="pd-tag" data-quiet="true">
                {copy.dealTag}
              </span>
              <div>
                <b>{edited[language]?.title ?? sample[language].title}</b>
                <span className="pd-fine">
                  {fill(copy.publishedDeal, {
                    days,
                    from: draft.hourFrom,
                    to: draft.hourTo,
                    n: num(claims),
                  })}
                </span>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => goTo('deals')}>
                {dashboard.words.open}
              </button>
            </div>
            {draft.notify && (
              <div className="pd-record-row pd-record-item">
                <span className="pd-tag" data-quiet="true">
                  {copy.notifyTag}
                </span>
                <div>
                  <b>{fill(copy.publishedNotify, { at: draft.sendAt })}</b>
                  <span className="pd-fine">
                    {fill(copy.publishedNotifyNote, { n: num(audience.notifiable) })}
                  </span>
                </div>
                <button type="button" className="btn btn-ghost" onClick={() => goTo('deals')}>
                  {dashboard.words.open}
                </button>
              </div>
            )}
          </div>
          <p className="pd-fine">{copy.watch}</p>
          <button type="button" className="btn btn-ghost" onClick={() => setDraft(FRESH)}>
            {copy.again}
          </button>
        </div>
      )}

      {draft.step === 'review' && (
        <div className="pd-glass pd-notices" data-reveal>
          <div className="pd-panel-head">
            <div>
              <span className="console-label">{copy.reviewTitle}</span>
              <p className="pd-fine">{copy.reviewIntro}</p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => setDraft(FRESH)}>
              {copy.reset}
            </button>
          </div>
          {[
            {
              text: fill(copy.review[0].text, {
                pct: String(tier.pct),
                points: num(tier.points),
                reached: num(tier.issued),
                lower: num(PD_ASSIST.tierLower),
                more: num(PD_ASSIST.tierLowerReached),
              }),
              label: copy.review[0].label,
              go: () => goTo('vouchers'),
            },
            {
              text: fill(copy.review[1].text, {
                name: dashboard.campaigns.rows[winter],
                amount: money(PD_CAMPAIGN_MODEL.list[winter].aside, 'exact'),
                n: String(PD_CAMPAIGN_MODEL.list[winter].gap),
              }),
              label: copy.review[1].label,
              go: () => goTo('campaigns'),
            },
            {
              text: fill(copy.review[2].text, {
                name: dashboard.deals.rows[lunch],
                /* How long it ran, from the deal's own window. `PartnerDeal`
                   carried a `weeks` seed and no longer does — the server sends
                   `valid_from` / `valid_to`, and a run length is the two
                   subtracted rather than a third figure to keep in step. */
                weeks: String(weeksOf(PD_DEALS[lunch])),
                claims: num(PD_DEALS[lunch].claimed),
              }),
              label: copy.review[2].label,
              go: () => goTo('deals'),
            },
          ].map((item) => (
            <div className="pd-notice" key={item.label}>
              <p>{item.text}</p>
              <div className="pd-notice-acts">
                <button type="button" className="btn btn-solid" onClick={item.go}>
                  {item.label}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {draft.step === 'answer' && (
        <div className="pd-glass pd-panel" data-reveal>
          <p className="pd-fine">
            {fill(copy.asked, { q: fill(copy.options[3].seed, { n: '' }).trim() })}
          </p>
          <p className="pd-proof">
            {fill(copy.answerLine, {
              /* This month's redemptions are the tier table's own sum and the
                 drop is the difference — only last month is a seed. The three
                 used to be written into the sentence in all five languages,
                 which put the assistant one seed edit away from explaining a
                 fall that the Vouchers page did not show. */
              down: String(Math.round((1 - redeemedNow / PD_ASSIST.redeemedBefore) * 100)),
              from: num(PD_ASSIST.redeemedBefore),
              to: num(redeemedNow),
              pct: String(tier.pct),
              now: num(tier.issued),
              before: num(PD_ASSIST.twiceBefore),
              points: num(tier.points),
            })}
          </p>
          <p className="pd-fine">{copy.answerNote}</p>
          <div className="pd-answer-acts">
            <button type="button" className="btn btn-solid" onClick={() => goTo('vouchers')}>
              {copy.answerLabel}
            </button>
            <span className="pd-fine">{copy.answerMore}</span>
            <button type="button" className="btn btn-ghost" onClick={() => setDraft(FRESH)}>
              {copy.askElse}
            </button>
          </div>
        </div>
      )}

      {draft.step === 'handed' && (
        <div className="pd-glass pd-panel" data-reveal>
          <span className="console-label">{copy.handedTitle}</span>
          <p className="pd-fine">{copy.handedNote}</p>
          <div className="pd-record">
            {copy.handedFields.map((label, index) => {
              const values = [
                `${days}, ${draft.hourFrom}–${draft.hourTo}`,
                copy.dealValues[draft.reward],
                fill(copy.handedWeeks, { n: String(draft.weeks) }),
                `${num(claims)} ${copy.claims}`,
                dealValues[3],
                copy.handedCopy,
              ];
              /* The last two are guesses and are marked as guesses. That
                 distinction is the point of the panel — a hand-over that does
                 not say which fields it was unsure about hands over nothing. */
              const sure = index < 4;
              return (
                <div className="pd-record-row" key={label}>
                  <span>{label}</span>
                  <b>{values[index]}</b>
                  <em className="pd-tag" data-warn={sure ? undefined : 'true'} data-quiet={sure ? 'true' : undefined}>
                    {sure ? copy.filledIn : copy.checkThis}
                  </em>
                </div>
              );
            })}
          </div>
          <div className="pd-draft-acts">
            <button
              type="button"
              className="btn btn-solid"
              onClick={() => {
                openDrawer('deal');
                toast(copy.handedOver);
              }}
            >
              {copy.openForm}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => patch({ step: 'draft' })}>
              {copy.backToDraft}
            </button>
          </div>
        </div>
      )}

      {draft.step === 'cant' && (
        <div className="pd-glass pd-panel" data-reveal>
          <p className="pd-proof">{copy.cantLine}</p>
          <p className="pd-lede">
            {/* Counted out of the cohort table rather than invented: every
                cohort's returners are people who came a second time, which is
                exactly what the sentence claims. */}
            {fill(copy.cantAlt, {
              n: num(PD_CUSTOMERS.cohorts.reduce((sum, month) => sum + month.back, 0)),
            })}
          </p>
          <div className="pd-draft-acts">
            <button
              type="button"
              className="btn btn-solid"
              onClick={() =>
                setDraft({
                  ...FRESH,
                  goal: 'lapsed',
                  stage: 'reward',
                  messages: [
                    { who: 'you', text: copy.options[1].name },
                    { who: 'it', text: goalOpen('lapsed') },
                  ],
                })
              }
            >
              {copy.cantYes}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setDraft(FRESH)}>
              {copy.cantNo}
            </button>
          </div>
          <div className="pd-brief">
            <span>{copy.cantElsewhere}</span>
            <button type="button" className="btn btn-ghost" onClick={() => goTo('customers')}>
              {copy.cantOpen}
            </button>
          </div>
        </div>
      )}

      {draft.step === 'missed' && (
        <div className="pd-glass pd-panel" data-reveal>
          <span className="console-label">{copy.missedTitle}</span>
          <p className="pd-lede">{fill(copy.missedBody, { days })}</p>
          {draft.attempts >= 2 && <p className="pd-brief">{copy.loopNote}</p>}
          <div className="pd-draft-acts">
            <button
              type="button"
              className="btn btn-solid"
              onClick={() => {
                openDrawer('deal');
                toast(copy.handedOver);
              }}
            >
              {copy.missedAction}
            </button>
            {draft.attempts < 2 && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => patch({ step: 'draft' })}
              >
                {copy.tryAgain}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
