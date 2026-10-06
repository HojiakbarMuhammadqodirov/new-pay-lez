/**
 * The partner's own plan, and the three tiers beside it — item 24.
 *
 * ## What it is, and what it opens from
 *
 * The rail's plan box (`.plan-card`) has always shown this month's budget under
 * a plan name, and the name was a **dictionary string** — "Growth plan",
 * written down, the same for a venue on Starter as for one on Chain. So the one
 * piece of chrome on the dashboard that names the plan was the one piece that
 * had never asked what the plan was. Pressing it now opens this, which asks.
 *
 * ## Two panels, and they answer two different questions
 *
 * - **What I have.** The venue's real plan, its state, where it came from, and
 *   the capacity it grants against what is already used. That last pairing is
 *   the whole value of the panel: "5 live deals" is a fact, and "3 of 5" is a
 *   decision about whether to move.
 * - **What the three are.** The comparison, with the **middle tier
 *   highlighted** — the same shape the consumer cards take on `#/subscribe`,
 *   where the middle column is the one the ladder is built around. The
 *   highlight is a property of *position* rather than of the plan's code, so a
 *   fourth tier does not need this file edited to stop marking the wrong one.
 *
 * ## Every figure is the server's
 *
 * `GET /v1/plans?audience=partner` returns the three plans with their
 * `plan_entitlements` rows, and `GET /v1/partner/venues/:id/subscription`
 * returns this venue's. Nothing here is typed: `PARTNER_PLAN_ROWS` in
 * `content.ts` holds the **order and the shape** of the rows and not one value,
 * which is the opposite of `SUB_ROWS` on the marketing page — and the reason is
 * which side of the paywall the reader is on. A visitor is being sold a plan
 * and the page has to price it with no session; an owner is being told what
 * they already have, and a figure typed into this file would be a second
 * opinion about their own account.
 *
 * A key the server sends that `PARTNER_PLAN_ROWS` does not name is not drawn,
 * and a key it names that the server does not send reads as not included. Both
 * beat the alternative, which is the failure this repo has had twice: printing
 * `identified_profiles` at somebody because a lookup missed.
 *
 * ## There is no "upgrade" button on it
 *
 * `SubscribeButton` takes a plan code and a term and opens Stripe Checkout, and
 * it is built for the **consumer** ladder — `planCode` is one of
 * `free | pro | premium`, and the partner ladder is `starter | growth | chain`.
 * Pointing it at a partner code would open a checkout for a plan that is not
 * the one on the card. So the panel says how to move instead, and says it in
 * words: a sentence naming the sales address, which is what `#/business`
 * already does for a venue that wants a bigger tier. A control with nothing
 * honest behind it is not drawn — the rule this dashboard states one file over.
 */

import { useEffect, useMemo, useState } from 'react';

import { call } from './api/client';
import { readyOr, usePartnerCampaigns, usePartnerDeals } from './api/partner';
import { PARTNER_PLAN_HERO, PARTNER_PLAN_ROWS, SALES_EMAIL } from './content';
import {
  DEMO_CAMPAIGNS,
  DEMO_DEALS,
  DEMO_PARTNER_PLANS,
  DEMO_VENUE_PLAN,
} from './dashboardDemo';
import { DEMO_MODE } from './demoMode';
import { Button, DxIcon, Eyebrow, Modal, Pill, Table } from './dashboardKit';
import { useCopy, useMoney } from './i18n/context';
import { fill } from './i18n/currency';

/** One plan, as `GET /v1/plans?audience=partner` returns it. */
interface PlanRow {
  id: string;
  code: string;
  name: string;
  price_minor: number;
  currency: string;
  interval: string;
  rank: number;
  entitlements: Array<{ key: string; value: string }>;
}

/** This venue's subscription, as `GET …/subscription` returns it. */
interface VenuePlan {
  subscription: {
    id: string;
    status: string;
    source: string;
    started_at: string;
    renews_at: string | null;
    cancel_at: string | null;
  } | null;
  plan: { id: string; code: string; name: string; rank: number };
  entitlements: Record<string, string>;
}

/** `'5'` → 5, `'true'` → true, absent → undefined. */
function valueOf(raw: string | undefined): number | boolean | undefined {
  if (raw === undefined) return undefined;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * One cell of the comparison.
 *
 * A flag is a tick or nothing — **not a cross**, which reads as a fault rather
 * than as an absence, and this panel is read by somebody deciding rather than
 * debugging. A number is a number; zero is written as nothing for the same
 * reason `SubCell` does it, because "0" in a column of counts reads as a broken
 * figure rather than as none.
 */
function Cell({ kind, value }: { kind: 'number' | 'flag'; value: number | boolean | undefined }) {
  const copy = useCopy().dashboard.planPanel;

  if (value === undefined || value === false || value === 0) {
    return (
      <span className="dx-fine" aria-label={copy.notIncluded}>
        —
      </span>
    );
  }
  if (kind === 'flag' || value === true) {
    return <DxIcon name="check" size={15} strokeWidth={2.5} />;
  }
  return <b>{value}</b>;
}


/** What the venue has, against what it is using — the "3 of 5" pairing. */
function Mine({ mine, used }: { mine: VenuePlan; used: Record<string, number | undefined> }) {
  const copy = useCopy().dashboard.planPanel;

  return (
    <div className="dx-plan-mine">
      {/*
        * The state, and where it came from: `manual` is a tier an operator
        * granted and every other value is a processor's. A miss falls through
        * to the raw value rather than to a blank.
        */}
      <Pill tone={mine.subscription ? 'live' : 'neutral'}>
        {mine.subscription
          ? ((copy.sources as Record<string, string | undefined>)[mine.subscription.source] ??
            mine.subscription.source)
          : copy.noSubscription}
      </Pill>
      {/* Only the counted rows: a yes/no entitlement has nothing to be "3 of". */}
      {PARTNER_PLAN_ROWS.slice(0, PARTNER_PLAN_HERO).map((row, index) => {
        const allowed = valueOf(mine.entitlements[row.key]);
        const now = used[row.key];
        if (typeof allowed !== 'number' || typeof now !== 'number') return null;
        return (
          <span key={row.key}>
            {copy.rows[index]}: <b>{fill(copy.usage, { used: String(now), total: String(allowed) })}</b>
          </span>
        );
      })}
      {/* A renewal date only when there is one — a granted tier carries none. */}
      {mine.subscription?.renews_at && (
        <span>{fill(copy.renews, { date: mine.subscription.renews_at.slice(0, 10) })}</span>
      )}
      {mine.subscription?.cancel_at && (
        <span>{fill(copy.until, { date: mine.subscription.cancel_at.slice(0, 10) })}</span>
      )}
      {mine.subscription === null && <span>{copy.freeNote}</span>}
    </div>
  );
}

/**
 * One tier, as v3's card: name, price, what it includes, and a press.
 *
 * The features are the server's `plan_entitlements` rows the plan actually
 * grants, in `PARTNER_PLAN_ROWS` order — a count with its number, a flag by its
 * name — so the card can never list something the tier does not carry. The
 * press is v3's "Upgrade" / "Downgrade" made honest: moving between partner
 * tiers is arranged with sales (see the header), so it is a `mailto:` that says
 * so, not a checkout.
 */
function Tier({ plan, current }: { plan: PlanRow; current: boolean }) {
  const copy = useCopy().dashboard.planPanel;
  const money = useMoney();

  const features = PARTNER_PLAN_ROWS.flatMap((row, index) => {
    const value = valueOf(plan.entitlements.find((entry) => entry.key === row.key)?.value);
    if (value === undefined || value === false || value === 0) return [];
    return [typeof value === 'number' ? `${copy.rows[index]}: ${value}` : copy.rows[index]];
  });

  return (
    <article className="dx-plan-tier" data-current={current ? 'true' : undefined}>
      {current && <Eyebrow>{copy.current}</Eyebrow>}
      <h3>{plan.name}</h3>
      <div className="dx-plan-price">
        {/* The reader's currency through `useMoney`, off the server's minor
            units — never the raw `price_minor` digits. */}
        <b>
          {plan.price_minor === 0
            ? copy.freePrice
            : fill(copy.perMonth, { amount: money(plan.price_minor / 100, 'price') })}
        </b>
      </div>
      <div className="dx-plan-rule" />
      <ul className="dx-plan-feats">
        {features.map((feature) => (
          <li key={feature}>
            <DxIcon name="check" size={16} strokeWidth={2.5} />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      {current ? (
        <Button variant="secondary" disabled block>
          {copy.current}
        </Button>
      ) : (
        <a
          className="dx-btn"
          data-variant="secondary"
          data-block="true"
          href={`mailto:${SALES_EMAIL}?subject=${encodeURIComponent(plan.name)}`}
        >
          {copy.talk}
        </a>
      )}
    </article>
  );
}

/** The full comparison, behind v3's "Compare all features" disclosure. */
function Compare({ plans, mineCode }: { plans: PlanRow[]; mineCode: string }) {
  const copy = useCopy().dashboard.planPanel;
  const valueFor = (plan: PlanRow, key: string) =>
    valueOf(plan.entitlements.find((row) => row.key === key)?.value);

  return (
    <div className="dx-compare">
      <Table label={copy.compareTitle}>
        <thead>
          <tr>
            <th>{copy.whatYouGet}</th>
            {plans.map((plan) => (
              <th key={plan.id} data-align="right" data-on={plan.code === mineCode ? 'true' : undefined}>
                {plan.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PARTNER_PLAN_ROWS.map((row, index) => (
            <tr key={row.key}>
              <td>{copy.rows[index]}</td>
              {plans.map((plan) => (
                <td key={plan.id} data-align="right" data-on={plan.code === mineCode ? 'true' : undefined}>
                  <Cell kind={row.kind} value={valueFor(plan, row.key)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

/**
 * v3's plan modal (§5.5), opened from the rail's plan card. Kept from v3: the
 * 920px modal, the cards with the current one ringed and eyebrowed, the
 * "Compare all features" disclosure. Not drawn, because nothing real is behind
 * it: the Monthly/Annual switch (a partner plan has one interval on the
 * server) and any checkout button.
 */
export function PlanSheet({ venueId, onClose }: { venueId: string | null; onClose: () => void }) {
  const copy = useCopy().dashboard;
  const panel = copy.planPanel;
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [mine, setMine] = useState<VenuePlan | null>(null);
  const [failed, setFailed] = useState(false);
  const [details, setDetails] = useState(false);

  /* What the venue is already using, from reads the rail has made anyway.
     `undefined` on a real failure, so the row shows nothing rather than
     "0 of 5" — a usage nobody could read is not a zero. */
  const deals = readyOr(usePartnerDeals(venueId).state, DEMO_MODE ? DEMO_DEALS : null);
  const campaigns = readyOr(usePartnerCampaigns(venueId).state, DEMO_MODE ? DEMO_CAMPAIGNS : null);
  const used: Record<string, number | undefined> = {
    live_deals: deals?.filter((deal) => deal.status === 'live').length,
    active_campaigns: campaigns?.filter((row) => row.status === 'active').length,
  };

  useEffect(() => {
    let live = true;
    /* Both reads, and a failure of either is the same panel: the comparison
       without the current plan cannot mark "yours". */
    Promise.all([
      call<PlanRow[]>('/v1/plans?audience=partner'),
      venueId === null
        ? Promise.resolve(null)
        : call<VenuePlan>(`/v1/partner/venues/${encodeURIComponent(venueId)}/subscription`),
    ])
      .then(([ladder, venue]) => {
        if (!live) return;
        setPlans(ladder);
        setMine(venue);
      })
      .catch(() => {
        if (!live) return;
        /* The demo fallback, under `dashboardDemo.ts`'s conditions: the real
           call failed first, and `?demo=1` was passed. */
        if (DEMO_MODE) {
          setPlans(DEMO_PARTNER_PLANS);
          setMine(DEMO_VENUE_PLAN);
          return;
        }
        setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [venueId]);

  /* The server's own rank, so the ladder reads in the order it was designed. */
  const ladder = useMemo(() => (plans ? [...plans].sort((a, b) => a.rank - b.rank) : null), [plans]);
  const mineCode = mine?.plan.code ?? '';

  return (
    <Modal kicker={panel.kicker} title={panel.title} lede={panel.lede} onClose={onClose}>
      {failed ? (
        <p className="dx-fine">{copy.unmeasured.serverSilent}</p>
      ) : ladder === null ? (
        <p className="dx-fine">{copy.unmeasured.asking}</p>
      ) : (
        <>
          {mine && <Mine mine={mine} used={used} />}
          <div className="dx-plans">
            {ladder.map((plan) => (
              <Tier key={plan.id} plan={plan} current={plan.code === mineCode} />
            ))}
          </div>

          <button
            type="button"
            className="dx-disclose"
            aria-expanded={details}
            onClick={() => setDetails((open) => !open)}
          >
            <DxIcon name={details ? 'chevronDown' : 'chevronRight'} size={15} />
            <span>{panel.compareAll}</span>
          </button>
          {details && <Compare plans={ladder} mineCode={mineCode} />}

          <p className="dx-fine" style={{ marginTop: 20 }}>
            {fill(panel.howToMove, { email: SALES_EMAIL })}{' '}
            <a className="dx-link" href={`mailto:${SALES_EMAIL}`}>
              {SALES_EMAIL}
            </a>
          </p>
        </>
      )}
    </Modal>
  );
}
