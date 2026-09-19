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
import { Icon } from './icons';
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
      <span className="pd-fine" aria-label={copy.notIncluded}>
        —
      </span>
    );
  }
  if (kind === 'flag' || value === true) {
    return <Icon name="check" size={14} strokeWidth={2.4} />;
  }
  return <b>{value}</b>;
}

/** What the venue has, against what it is using. */
function Mine({ mine, used }: { mine: VenuePlan; used: Record<string, number | undefined> }) {
  const copy = useCopy().dashboard.planPanel;
  const dashboard = useCopy().dashboard;

  return (
    <div className="pd-panel pd-glass">
      <div className="pd-panel-head">
        <div>
          <span className="pd-kicker">{copy.mineKicker}</span>
          <h3>{mine.plan.name}</h3>
        </div>
        {/*
          * The state, and where it came from.
          *
          * `source` matters to an owner who did not expect the plan they are
          * on: `manual` is a tier an operator granted and every other value is
          * a processor's. A miss falls through to the raw value rather than to
          * a blank — the lookup-that-misses rule.
          */}
        <span className="pd-state-pill" data-state={mine.subscription ? 'live' : 'draft'}>
          {mine.subscription
            ? ((copy.sources as Record<string, string | undefined>)[mine.subscription.source] ??
              mine.subscription.source)
            : copy.noSubscription}
        </span>
      </div>

      {/* Capacity against use, which is the pairing the panel exists for. Only
          the counted rows: a yes/no entitlement has nothing to be "3 of" and a
          bar under it would be inventing a quantity. */}
      <ul className="pd-plan-use">
        {PARTNER_PLAN_ROWS.slice(0, PARTNER_PLAN_HERO).map((row, index) => {
          const allowed = valueOf(mine.entitlements[row.key]);
          const now = used[row.key];
          return (
            <li key={row.key}>
              <span>{copy.rows[index]}</span>
              {typeof allowed === 'number' && typeof now === 'number' ? (
                <b>{fill(copy.usage, { used: String(now), total: String(allowed) })}</b>
              ) : (
                <Cell kind={row.kind} value={allowed} />
              )}
            </li>
          );
        })}
      </ul>

      {/* A renewal date only when there is one. A tier an operator granted
          carries none on purpose — see `assignPlan` on the server — so an em
          dash here would be claiming a figure rather than reporting its
          absence. */}
      {mine.subscription?.renews_at && (
        <p className="pd-fine">
          {fill(copy.renews, { date: mine.subscription.renews_at.slice(0, 10) })}
        </p>
      )}
      {mine.subscription?.cancel_at && (
        <p className="pd-fine">
          {fill(copy.until, { date: mine.subscription.cancel_at.slice(0, 10) })}
        </p>
      )}
      {mine.subscription === null && <p className="pd-fine">{dashboard.planPanel.freeNote}</p>}
    </div>
  );
}

/** The three tiers, middle one highlighted. */
function Compare({ plans, mineCode }: { plans: PlanRow[]; mineCode: string }) {
  const copy = useCopy().dashboard.planPanel;
  const money = useMoney();

  /* Ordered by the server's own rank, so the ladder reads in the order it was
     designed in rather than in whatever order the rows came back. */
  const ladder = useMemo(() => [...plans].sort((a, b) => a.rank - b.rank), [plans]);

  /*
   * The highlight is the **middle column**, by position.
   *
   * Not `code === 'growth'`: a rule that switches on a plan code makes adding
   * or retiring a tier a change to which one this panel recommends, and the
   * server's own note on retired plans says nothing in the product may read a
   * code to decide what something is worth. With three tiers this is Growth;
   * with four it is the second, which is still the one a ladder is built
   * around.
   */
  const featured = Math.floor((ladder.length - 1) / 2);

  const valueFor = (plan: PlanRow, key: string) =>
    valueOf(plan.entitlements.find((row) => row.key === key)?.value);

  return (
    <div className="pd-panel pd-glass" data-solid="true">
      <div className="pd-panel-head">
        <div>
          <span className="pd-kicker">{copy.compareKicker}</span>
          <h3>{copy.compareTitle}</h3>
        </div>
      </div>

      <div className="pd-table-wrap">
        <table className="pd-table pd-plan-table">
          <thead>
            <tr>
              <th>{copy.whatYouGet}</th>
              {ladder.map((plan, index) => (
                <th key={plan.id} data-align="right" data-on={index === featured ? 'true' : undefined}>
                  <b>{plan.name}</b>
                  {/* The price in the reader's currency through `useMoney`, off
                      the server's minor units — never the `price_minor` digits,
                      which are złoty on a page an English owner may be reading. */}
                  <em>
                    {plan.price_minor === 0
                      ? copy.freePrice
                      : fill(copy.perMonth, {
                          amount: money(plan.price_minor / 100, 'price'),
                        })}
                  </em>
                  {plan.code === mineCode && <span className="pd-tag">{copy.yours}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PARTNER_PLAN_ROWS.map((row, index) => (
              <tr key={row.key}>
                <td>{copy.rows[index]}</td>
                {ladder.map((plan, column) => (
                  <td
                    key={plan.id}
                    data-align="right"
                    data-on={column === featured ? 'true' : undefined}
                  >
                    <Cell kind={row.kind} value={valueFor(plan, row.key)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* How to move, in words rather than as a button. See the header for why
          `SubscribeButton` cannot be pointed at a partner code. */}
      <p className="pd-fine">
        {fill(copy.howToMove, { email: SALES_EMAIL })}{' '}
        <a href={`mailto:${SALES_EMAIL}`}>{SALES_EMAIL}</a>
      </p>
    </div>
  );
}

export function PlanSheet({ venueId, onClose }: { venueId: string | null; onClose: () => void }) {
  const copy = useCopy().dashboard;
  const panel = copy.planPanel;
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [mine, setMine] = useState<VenuePlan | null>(null);
  const [failed, setFailed] = useState(false);

  /*
   * What the venue is already using, from the two reads the rail has made
   * anyway — so the "3 of 5" pairing costs no extra request. `useApi` keys on
   * the path, so these are the rail's own requests answering twice.
   *
   * `readyOr` and not a bare `status === 'ready'`, which is the same
   * arrangement the rail makes one file over: a browser with no partner session
   * still draws the panel under `?demo=1`, and without the stand-in the one
   * pairing this panel exists for is the one thing on it that cannot be seen.
   *
   * `undefined` on a real failure, and the row then shows the **allowance
   * alone** rather than "0 of 5" — a usage nobody could read is not a zero,
   * which is the rule every figure on this dashboard follows.
   */
  const deals = readyOr(usePartnerDeals(venueId).state, DEMO_MODE ? DEMO_DEALS : null);
  const campaigns = readyOr(
    usePartnerCampaigns(venueId).state,
    DEMO_MODE ? DEMO_CAMPAIGNS : null,
  );
  const used: Record<string, number | undefined> = {
    live_deals: deals?.filter((deal) => deal.status === 'live').length,
    active_campaigns: campaigns?.filter((row) => row.status === 'active').length,
  };

  useEffect(() => {
    let live = true;
    /*
     * Both reads, and a failure of *either* is the same panel.
     *
     * The comparison without the current plan cannot mark "yours", and the
     * current plan without the comparison is the figure the rail already
     * showed — so half of this panel is not worth drawing. `Promise.all` says
     * that rather than two independent states saying it twice.
     */
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
        /*
         * The demo fallback, under the same three conditions
         * `dashboardDemo.ts` states for every other panel: the real call is
         * made and **allowed to fail first**, and `?demo=1` has to have been
         * passed. A venue with a session never reaches it.
         *
         * It is here rather than left as the error panel because without it
         * this is the one panel on the dashboard that cannot be looked at —
         * the rest reach theirs through `Screen`, and this is a sheet rather
         * than a screen.
         */
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

  return (
    <div className="pd-sheet" role="dialog" aria-modal="true" aria-label={panel.title}>
      <button type="button" className="pd-scrim" aria-label={copy.drawer.close} onClick={onClose} />
      <section className="pd-drawer-panel" tabIndex={-1}>
        <header>
          <div>
            <span className="console-label">{panel.kicker}</span>
            <h2>{panel.title}</h2>
            <p className="pd-fine">{panel.lede}</p>
          </div>
          <button
            type="button"
            className="pd-icon"
            aria-label={copy.drawer.close}
            onClick={onClose}
          >
            <Icon name="close" size={15} strokeWidth={2} />
          </button>
        </header>

        <div className="pd-drawer-body">
          {failed ? (
            <p className="pd-fine">{copy.unmeasured.serverSilent}</p>
          ) : plans === null ? (
            <p className="pd-fine">{copy.unmeasured.asking}</p>
          ) : (
            <div className="pd-stack">
              {/* No session, no venue, no plan of one's own — the comparison
                  still reads, because what the three tiers are is not a fact
                  about this account. */}
              {mine && <Mine mine={mine} used={used} />}
              <Compare plans={plans} mineCode={mine?.plan.code ?? ''} />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
