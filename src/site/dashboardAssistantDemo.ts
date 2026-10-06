/**
 * The assistant's half of `?demo=1`: what its four endpoints would answer for
 * the demo café, so the chat has something to say on a browser with no venue.
 *
 * The same contract as `dashboardDemo.ts`, whose figures these are: consulted
 * only under `DEMO_MODE` and only when there is no live venue to ask, typed
 * against the real response interfaces, and **derived rather than typed** — the
 * context's visits are the overview's visits, the review's stuck deal is a row
 * of `DEMO_DEALS`, the quiet hour is the heat map's own. Each function routes
 * the way `server/domain/assistant.ts` does (`venueContext`, `review`,
 * `askPartner`, `draftFor`), on the same English keywords, so the demo answers
 * a question with the report the real endpoint would have read.
 *
 * Its own module rather than more rows in `dashboardDemo.ts`, because nothing
 * else reads it and that file is shared by every screen.
 */
import type {
  AssistantFact,
  AssistantSuggestion,
  PartnerAnswer,
  PartnerDraft,
  ReviewItem,
  VenueContextBody,
} from './api/partnerAssistant';
import {
  DEMO_ANALYTICS,
  DEMO_BUDGET,
  DEMO_CAMPAIGNS,
  DEMO_DEALS,
  DEMO_VENUE,
} from './dashboardDemo';

const map = DEMO_ANALYTICS.heatmap;
const overview = DEMO_ANALYTICS.overview;
const mix = DEMO_ANALYTICS.languageMix;
const cost = DEMO_ANALYTICS.costPerNewCustomer;

const FACTS: AssistantFact[] = [
  { kind: 'visits', label: 'visits this period', value: overview.visits.value },
  { kind: 'customers', label: 'customers', value: overview.customers.value },
  {
    kind: 'budget',
    label: 'available budget',
    value: DEMO_BUDGET.loyalty.available + DEMO_BUDGET.voucher.available,
  },
  ...(map.total > 0 && map.quietest
    ? [{ kind: 'quiet_window', label: 'quietest hour', value: `${map.quietest.weekday}:${map.quietest.hour}` }]
    : []),
  ...(!mix.suppressed && mix.rows.length
    ? [{ kind: 'language_mix', label: 'top language', value: mix.rows[0].language }]
    : []),
];

/* `venueContext`'s three data-driven starts, under the same conditions. The
   English is what the server sends; the screen writes its own words by key. */
const SUGGESTIONS: AssistantSuggestion[] = [
  ...(map.total > 0 && map.quietest
    ? [{ key: 'fill_quiet_hour', label: 'Fill your quietest hour', detail: 'A deal targeted at your quietest hour.' }]
    : []),
  ...(DEMO_BUDGET.rebalanceHint
    ? [{ key: 'rebalance', label: `Move budget to ${DEMO_BUDGET.rebalanceHint.to}`, detail: 'One pool is nearly out.' }]
    : []),
  ...(!mix.suppressed && mix.rows.length > 1
    ? [{ key: 'translate', label: 'Reach your other customers', detail: 'A second language is in use.' }]
    : []),
];

export const DEMO_ASSISTANT_CONTEXT: VenueContextBody = {
  venueId: DEMO_VENUE.id,
  name: DEMO_VENUE.name,
  empty: false,
  facts: FACTS,
  suggestions: SUGGESTIONS,
};

/* `review`: the three rules, ranked by weight and capped at five. */
export const DEMO_ASSISTANT_REVIEW: ReviewItem[] = [
  ...DEMO_DEALS.filter(
    (deal) => deal.status === 'live' && deal.seen_count > 200 && deal.claimed_count === 0,
  ).map((deal) => ({
    key: 'deal_not_converting',
    text: `A live deal has been seen ${deal.seen_count} times and claimed none.`,
    action: { label: 'Edit the deal', href: `#/dashboard/deals/${deal.id}` },
    weight: 3,
  })),
  ...(DEMO_BUDGET.rebalanceHint
    ? [
        {
          key: 'rebalance',
          text: `Your ${DEMO_BUDGET.rebalanceHint.to} budget is nearly out.`,
          action: { label: 'Move budget', href: '#/dashboard/budget' },
          weight: 2,
        },
      ]
    : []),
  ...(DEMO_CAMPAIGNS.some((campaign) => campaign.status === 'active')
    ? []
    : [
        {
          key: 'no_campaign',
          text: 'You have no stamp card running.',
          action: { label: 'Start a stamp card', href: '#/dashboard/campaigns' },
          weight: 2,
        },
      ]),
]
  .sort((a, b) => b.weight - a.weight)
  .slice(0, 5);

/** `askPartner`, routed on the same words, answering from the demo's reports. */
export function demoAnswer(question: string): PartnerAnswer {
  const text = question.trim().toLowerCase();
  if (/quiet|slow|busy|when/.test(text)) {
    return {
      text: 'Your quietest open hour.',
      facts: FACTS,
      results: [map],
      action: { label: 'Run a deal then', href: '#/dashboard/deals/new' },
      grounding: [DEMO_VENUE.id],
      empty: false,
    };
  }
  if (/cost|spend|budget|roi/.test(text)) {
    return {
      text: 'What each new customer cost.',
      facts: [
        { kind: 'spend', label: 'spend', value: cost.spendMinor },
        { kind: 'new_customers', label: 'new customers', value: cost.newCustomers },
      ],
      results: [cost],
      action: { label: 'See the breakdown', href: '#/dashboard/analytics' },
      grounding: [DEMO_VENUE.id],
      empty: false,
    };
  }
  return {
    text: 'This period so far.',
    facts: FACTS,
    results: [overview],
    action: { label: 'Open analytics', href: '#/dashboard/analytics' },
    grounding: [DEMO_VENUE.id],
    empty: false,
  };
}

/** `draftFor`, routed on the same words. */
export function demoDraft(goal: string): PartnerDraft {
  const words = goal.toLowerCase();
  if (/repeat|again|loyal|return|come ?back|more often|regular|retention|wraca/.test(words)) {
    const each = Math.max(500, Math.round((overview.averageCheckMinor.value ?? 3200) * 0.3));
    return {
      kind: 'campaign',
      config: {
        name: 'Come back three times',
        visitsRequired: 3,
        rewardLabel: 'A free filter coffee',
        rewardCostMinor: each,
        priority: 0,
        minSpendMinor: DEMO_VENUE.min_spend_minor,
      },
      costPreviewMinor: each * 10,
      reasoning: [],
      requiresApproval: true,
    };
  }
  if (map.quietest && /quiet|slow|empty|afternoon|midweek/.test(words)) {
    return {
      kind: 'hot_deal',
      config: {
        targetWeekdays: [map.quietest.weekday],
        targetFromMin: map.quietest.hour * 60,
        targetToMin: (map.quietest.hour + 2) * 60,
        discountText: '15% off',
        capClaims: 50,
      },
      costPreviewMinor: 0,
      reasoning: [],
      requiresApproval: true,
    };
  }
  return {
    kind: 'hot_deal',
    config: { discountText: '10% off', capClaims: 100 },
    costPreviewMinor: 0,
    reasoning: [],
    requiresApproval: true,
  };
}
