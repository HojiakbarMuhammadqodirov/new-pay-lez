/**
 * The partner's own plan, and the three tiers beside it — item 24.
 *
 * ## What it is, and what it opens from
 *
 * The rail's plan box (`.plan-card`) has always shown this month's budget under
 * a plan name, and the name was a **dictionary string** — "Growth plan",
 * written down, the same for a venue on Starter as for one on Scale. So the one
 * piece of chrome on the dashboard that names the plan was the one piece that
 * had never asked what the plan was. Pressing it now opens this, which asks.
 *
 * ## Two panels, and they answer two different questions
 *
 * - **What I have.** The venue's real plan, its state, where it came from, and
 *   the capacity it grants against what is already used. That last pairing is
 *   the whole value of the panel: "3 of 5" is a decision about whether to move.
 * - **What the three are.** Starter, Growth and Scale as the pricing strategy
 *   prices them (§5), with the **middle tier highlighted** by position rather
 *   than by code, so a fourth tier does not need this file edited.
 *
 * ## Every figure is the server's
 *
 * `GET /v1/plans?audience=partner` returns the plans with their
 * `plan_entitlements` rows and their per-market `prices`, and
 * `GET /v1/partner/venues/:id/subscription` returns this venue's. Nothing here
 * is typed: `PARTNER_PLAN_ROWS` in `content.ts` holds the order and the shape,
 * and `partnerPlans.ts` turns a plan into words and prices — the same module
 * `#/business` draws its pricing table with, so the pitch and the sheet cannot
 * quote two price lists. Which currency a reader sees, and why a so'm price is
 * not a converted złoty one, is written down there.
 *
 * ## Monthly and annual
 *
 * The switch is drawn now because there is something real behind it: the
 * strategy quotes an annual price beside the monthly one (119 zł against 149),
 * and the server's price list carries both. A tier the list quotes no annual
 * price for shows its monthly price under either setting rather than a made-up
 * one.
 *
 * ## There is no "upgrade" button on it
 *
 * `SubscribeButton` opens Stripe Checkout for the **consumer** ladder, and no
 * partner price is mapped in Stripe. So the panel says how to move instead, in
 * words: a sentence naming the sales address, which is what `#/business`
 * already does for a venue that wants a bigger tier. A control with nothing
 * honest behind it is not drawn.
 */

import { useState } from 'react';

import { isNoSession, readyOr, usePartnerCampaigns, usePartnerDeals, type VenuePlan } from './api/partner';
import type { ApiState } from './api/useApi';
import { PARTNER_PLAN_ROWS, PARTNER_PLAN_USAGE, PLAN_UNLIMITED, SALES_EMAIL } from './content';
import {
  DEMO_CAMPAIGNS,
  DEMO_DEALS,
  DEMO_PARTNER_PLANS,
  DEMO_VENUE_PLAN,
} from './dashboardDemo';
import { DEMO_MODE } from './demoMode';
import { Button, DxIcon, Eyebrow, Modal, Pill, Segmented, Table } from './dashboardKit';
import { useCopy, useCurrencyCode } from './i18n/context';
import { fill } from './i18n/currency';
import {
  annualSaving,
  useMarketLine,
  usePartnerPlans,
  usePlanCell,
  usePlanFeatures,
  usePlanPrice,
  type PartnerPlan,
  type PlanBilling,
} from './partnerPlans';

/** What the venue has, against what it is using — the "3 of 5" pairing. */
function Mine({ mine, used }: { mine: VenuePlan; used: Record<string, number | undefined> }) {
  const copy = useCopy().dashboard.planPanel;
  const plans = useCopy().partnerPlans;

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
      {/* Only the counted rows whose usage the dashboard has read. */}
      {PARTNER_PLAN_USAGE.map((key) => {
        const allowed = Number(mine.entitlements[key]);
        const now = used[key];
        if (!Number.isFinite(allowed) || typeof now !== 'number') return null;
        return (
          <span key={key}>
            {plans.rows[key]}:{' '}
            <b>
              {fill(copy.usage, {
                used: String(now),
                total: allowed >= PLAN_UNLIMITED ? plans.unlimited.toLowerCase() : String(allowed),
              })}
            </b>
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
 * One tier, as v3's card: name, price, what it adds, and a press.
 *
 * The features are `usePlanFeatures` — the first tier's whole list, then what
 * each later tier adds over the one before it. The press is v3's "Upgrade" /
 * "Downgrade" made honest: moving between partner tiers is arranged with
 * sales, so it is a `mailto:` that says so, not a checkout.
 */
function Tier({
  plans,
  index,
  billing,
  current,
  featured,
}: {
  plans: PartnerPlan[];
  index: number;
  billing: PlanBilling;
  current: boolean;
  featured: boolean;
}) {
  const copy = useCopy().dashboard.planPanel;
  const shared = useCopy().partnerPlans;
  const price = usePlanPrice();
  const marketLine = useMarketLine();
  const features = usePlanFeatures()(plans, index);
  const plan = plans[index];
  /* The annual figure when there is one; a tier quoting none keeps its monthly. */
  const quoted = price(plan, billing) ?? (billing === 12 ? price(plan, 1) : null);

  return (
    <article
      className="dx-plan-tier"
      data-current={current ? 'true' : undefined}
      data-featured={featured ? 'true' : undefined}
    >
      {current && <Eyebrow>{copy.current}</Eyebrow>}
      <h3>{plan.name}</h3>
      <div className="dx-plan-price">
        <b>{quoted ? quoted.amount : copy.freePrice}</b>
        {quoted && <span>{shared.perMonth}</span>}
      </div>
      {quoted?.total && <p className="dx-plan-billed">{fill(shared.billedYearly, { total: quoted.total })}</p>}
      {marketLine(quoted) && <p className="dx-plan-billed">{marketLine(quoted)}</p>}
      <div className="dx-plan-rule" />
      {features.heading && <p className="dx-plan-plus">{features.heading}</p>}
      <ul className="dx-plan-feats">
        {features.lines.map((feature) => (
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
          data-variant={featured ? 'primary' : 'secondary'}
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
function Compare({ plans, mineCode }: { plans: PartnerPlan[]; mineCode: string }) {
  const copy = useCopy().dashboard.planPanel;
  const shared = useCopy().partnerPlans;
  const cell = usePlanCell();

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
          {PARTNER_PLAN_ROWS.map((row) => (
            <tr key={row.key}>
              <td>{shared.rows[row.key]}</td>
              {plans.map((plan) => {
                /* A tick for a flag, the words or figure otherwise, and an em
                   dash — not a cross — for what the tier does not include: a
                   cross reads as a fault, and this is read by somebody deciding. */
                const value = cell(plan, row);
                return (
                  <td key={plan.id} data-align="right" data-on={plan.code === mineCode ? 'true' : undefined}>
                    {value === null ? (
                      <span className="dx-fine" aria-label={copy.notIncluded}>
                        —
                      </span>
                    ) : value === true ? (
                      <DxIcon name="check" size={15} strokeWidth={2.5} />
                    ) : (
                      <b>{value}</b>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

/**
 * v3's plan modal (§5.5), opened from the rail's plan card. Kept from v3: the
 * 920px modal, the Monthly/Annual switch, the cards with the current one ringed
 * and eyebrowed, the "Compare all features" disclosure. Not drawn, because
 * nothing real is behind it: any checkout button.
 */
export function PlanSheet({
  venueId,
  plan,
  onClose,
}: {
  venueId: string | null;
  /**
   * The venue's plan, as the frame read it for the rail's card — handed down
   * rather than asked again, so the card and the sheet it opens cannot name two
   * different tiers.
   */
  plan: ApiState<VenuePlan>;
  onClose: () => void;
}) {
  const copy = useCopy().dashboard;
  const panel = copy.planPanel;
  const shared = useCopy().partnerPlans;
  const [currency] = useCurrencyCode();
  const price = usePlanPrice();
  const { plans: ladder, failed: ladderFailed } = usePartnerPlans(DEMO_MODE ? DEMO_PARTNER_PLANS : undefined);
  const [details, setDetails] = useState(false);
  const [billing, setBilling] = useState<PlanBilling>(1);

  /* What the venue is already using, from reads the rail has made anyway.
     `undefined` on a real failure, so the row shows nothing rather than
     "0 of 5" — a usage nobody could read is not a zero. */
  const deals = readyOr(usePartnerDeals(venueId).state, DEMO_MODE ? DEMO_DEALS : null);
  const campaigns = readyOr(usePartnerCampaigns(venueId).state, DEMO_MODE ? DEMO_CAMPAIGNS : null);
  const used: Record<string, number | undefined> = {
    live_deals: deals?.filter((deal) => deal.status === 'live').length,
    active_campaigns: campaigns?.filter((row) => row.status === 'active').length,
  };

  /* The demo fallback, under `dashboardDemo.ts`'s conditions (`readyOr`). */
  const mine = readyOr(plan, DEMO_MODE ? DEMO_VENUE_PLAN : null);
  /*
   * Both reads, and a failure of either is the same panel: the comparison
   * without the current plan cannot mark "yours". Two refusals are not
   * failures, though: a manager may not read the owner's subscription (403),
   * and with no venue there is nothing to read — the ladder is still worth
   * showing, with no card ringed.
   */
  const mineFailed =
    plan.status === 'error' && !isNoSession(plan.error) && plan.error.status !== 403;
  const failed = ladderFailed || mineFailed;
  const mineCode = mine?.plan.code ?? '';
  const saving = ladder
    ? ladder.map((plan) => annualSaving(plan, currency)).find((pct) => pct !== null) ?? null
    : null;
  const converted = ladder?.some((plan) => price(plan, billing)?.converted) ?? false;
  const middle = ladder ? Math.floor((ladder.length - 1) / 2) : -1;

  return (
    <Modal kicker={panel.kicker} title={panel.title} lede={panel.lede} onClose={onClose}>
      {failed ? (
        <p className="dx-fine">{copy.unmeasured.serverSilent}</p>
      ) : ladder === null ? (
        <p className="dx-fine">{copy.unmeasured.asking}</p>
      ) : (
        <>
          {mine && <Mine mine={mine} used={used} />}
          <div className="dx-plan-bar">
            <Segmented<'1' | '12'>
              label={shared.billing}
              value={billing === 12 ? '12' : '1'}
              onChange={(value) => setBilling(value === '12' ? 12 : 1)}
              options={[
                { value: '1', label: shared.monthly },
                { value: '12', label: shared.annual },
              ]}
            />
            {saving !== null && saving > 0 && <Pill tone="live">{fill(shared.save, { pct: String(saving) })}</Pill>}
          </div>
          <div className="dx-plans">
            {ladder.map((plan, index) => (
              <Tier
                key={plan.id}
                plans={ladder}
                index={index}
                billing={billing}
                current={plan.code === mineCode}
                featured={index === middle}
              />
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
            {shared.noCommission} {shared.vat}
            {converted && <> {shared.converted}</>}
          </p>
          <p className="dx-fine" style={{ marginTop: 8 }}>
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
