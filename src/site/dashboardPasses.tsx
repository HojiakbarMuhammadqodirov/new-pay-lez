/**
 * Passes — subscriptions a venue sells straight to its own customers (v3 §3.5).
 *
 * Three views share this module's state: the list (four figures, a card per
 * pass, the five templates), the detail (`dashboardPassDetail.tsx`) and the
 * create/edit drawer (`dashboardPassDrawer.tsx`). The detail is local state
 * rather than a route because the frame's screens are state, and a screen
 * remounts on a change of venue or range — which is the right moment for an
 * open pass to close.
 *
 * ── what this screen may not claim ────────────────────────────────────────
 *
 * - **There is no money rail.** A venue-direct subscription needs the venue to
 *   be the merchant (Stripe Connect), which is not built: `payouts.connected`
 *   is always false and in-app subscribing answers `not_available`. v3's "Connect
 *   payouts with Stripe" has nothing behind it, so it is not drawn; the screen
 *   says in words that a published pass cannot be subscribed to yet.
 * - **Revenue is contracted, not collected.** `recurringMinor` is what holders
 *   are on; the labels say "not collected yet" rather than "straight to you".
 * - **The upsell may be unmeasured**, and then it is an em dash with the
 *   server's reason under it — never a 0, which would claim subscribers bought
 *   nothing else.
 * - **"Included in Growth" is the plan's own claim.** It is drawn only off the
 *   venue's `passes` entitlement; below Growth the screen is locked in words,
 *   and while the plan is unknown it claims neither.
 */
import { useCallback, useState } from 'react';

import { minorToEuro } from './api/partner';
import {
  setPassStatus,
  usePartnerPasses,
  type Pass,
  type PassCard,
  type PassListResponse,
  type PassTemplate,
} from './api/passes';
import { DEMO_PASSES } from './dashboardDemo';
import { useNum } from './dashboardFormat';
import { Button, Callout, Card, CardHead, DxIcon, PageHead } from './dashboardKit';
import { PassArt, PassPill } from './dashboardPassArt';
import { PassDetail } from './dashboardPassDetail';
import { PassDrawer, type PassDrawerTarget } from './dashboardPassDrawer';
import {
  NO_VENUE,
  TEMPLATE_EXAMPLE_PLN_MINOR,
  TEMPLATE_ICON,
  TEMPLATE_ORDER,
  rulePhrase,
  upsellReason,
  usePassEntitlement,
  usePassWrite,
} from './dashboardPassRules';
import { Screen } from './dashboardScreens';
import { useDashboard } from './dashboardShell';
import { DEMO_MODE } from './demoMode';
import { useCopy, useMoney } from './i18n/context';
import { fill } from './i18n/currency';
import './dashboard-passes.css';

/** Minor units of the venue's currency, written in the reader's. */
function useMinorMoney() {
  const money = useMoney();
  return useCallback(
    (minor: number, currency: string) => money(minorToEuro(minor, currency), 'exact'),
    [money],
  );
}

export function Passes() {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.passes;
  const { venueId } = useDashboard();
  const list = usePartnerPasses(venueId);
  const entitlement = usePassEntitlement(venueId);
  const [detail, setDetail] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<PassDrawerTarget | null>(null);
  /* Bumped after every write so the open detail re-reads with the list. */
  const [revision, setRevision] = useState(0);

  const reload = list.reload;
  const changed = useCallback(() => {
    reload();
    setRevision((n) => n + 1);
  }, [reload]);

  /* Unknown is not "no": only a plan read that says no locks the screen. */
  const locked = entitlement !== undefined && !entitlement.allowed;
  const create = (template: PassTemplate) => setDrawer({ mode: 'create', template });

  return (
    <>
      <PageHead
        title={dashboard.screens.passes.name}
        actions={
          <Button
            variant="primary"
            icon="plus"
            disabled={locked}
            title={locked ? copy.lockedTitle : undefined}
            onClick={() => create('custom')}
          >
            {copy.create}
          </Button>
        }
      />
      <Screen state={list.state} id="passes" demo={DEMO_MODE ? DEMO_PASSES : undefined}>
        {(data) =>
          detail !== null ? (
            <PassDetail
              key={`${detail}:${revision}`}
              passId={detail}
              locked={locked}
              onBack={() => setDetail(null)}
              onEdit={(pass) => setDrawer({ mode: 'edit', pass })}
              onChanged={changed}
              onGone={() => {
                setDetail(null);
                changed();
              }}
            />
          ) : (
            <PassList
              data={data}
              locked={locked}
              plan={entitlement}
              onView={setDetail}
              onEdit={(pass) => setDrawer({ mode: 'edit', pass })}
              onCreate={create}
              onChanged={changed}
            />
          )
        }
      </Screen>
      {drawer && (
        <PassDrawer
          target={drawer}
          currency={list.state.status === 'ready' ? list.state.data.currency : DEMO_PASSES.currency}
          locked={locked}
          onClose={() => setDrawer(null)}
          onSaved={() => {
            setDrawer(null);
            changed();
          }}
        />
      )}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────── the list ── */

function PassList({
  data,
  locked,
  plan,
  onView,
  onEdit,
  onCreate,
  onChanged,
}: {
  data: PassListResponse;
  locked: boolean;
  plan: { allowed: boolean; plan: string } | undefined;
  onView: (id: string) => void;
  onEdit: (pass: Pass) => void;
  onCreate: (template: PassTemplate) => void;
  onChanged: () => void;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.passes;
  const num = useNum();
  const minorMoney = useMinorMoney();
  const { openPlan } = useDashboard();
  const { stats } = data;
  const reason = upsellReason(copy, stats.upsell);

  const figures = [
    { key: 'active', label: copy.stats.active, value: num(stats.activeSubscribers), note: copy.stats.activeNote },
    {
      key: 'recurring',
      label: copy.stats.recurring,
      value: minorMoney(stats.recurringMinor, data.currency),
      note: copy.stats.recurringNote,
    },
    {
      key: 'redemptions',
      label: copy.stats.redemptions,
      value: num(stats.redemptionsThisMonth),
      note: copy.stats.redemptionsNote,
    },
    {
      key: 'upsell',
      label: copy.stats.upsell,
      value:
        stats.upsell.minor === null ? (
          <span className="dx-passes-none">—</span>
        ) : (
          minorMoney(stats.upsell.minor, data.currency)
        ),
      note:
        reason ??
        fill(copy.stats.upsellNote, { n: num(stats.upsell.measured), total: num(stats.upsell.redemptions) }),
    },
  ];

  return (
    <div className="dx-passes">
      <div className="dx-passes-intro">
        <p>
          {copy.intro} <strong>{copy.introStrong}</strong>
        </p>
        {plan && (
          <span className="dx-passes-plan" data-locked={plan.allowed ? undefined : 'true'}>
            {!plan.allowed && <DxIcon name="lock" size={13} strokeWidth={2} />}
            {plan.allowed ? fill(copy.included, { plan: plan.plan }) : copy.lockedPill}
          </span>
        )}
      </div>

      {locked && plan && (
        <Callout tone="amber">
          <b className="dx-passes-callout-title">{copy.lockedTitle}</b>
          {fill(copy.lockedBody, { plan: plan.plan })}
          <span className="dx-passes-callout-act">
            <Button variant="small" onClick={openPlan}>
              {copy.seePlan}
            </Button>
          </span>
        </Callout>
      )}

      {!data.subscribeAvailable && (
        <Callout>
          <b className="dx-passes-callout-title">{copy.payoutsTitle}</b>
          {copy.payoutsBody}
        </Callout>
      )}

      {data.passes.length > 0 && (
        <div className="dx-passes-stats">
          {figures.map((figure) => (
            <Card key={figure.key} className="dx-passes-stat" pad="none">
              <div className="dx-passes-stat-label">
                <i data-dot={figure.key} aria-hidden />
                {figure.label}
              </div>
              <div className="dx-passes-stat-value">{figure.value}</div>
              <div className="dx-passes-stat-note">{figure.note}</div>
            </Card>
          ))}
        </div>
      )}

      {data.passes.length > 0 && (
        <div className="dx-passes-cards">
          {data.passes.map((pass) => (
            <PassCardView
              key={pass.id}
              pass={pass}
              locked={locked}
              onView={() => onView(pass.id)}
              onEdit={() => onEdit(pass)}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}

      <Card className="dx-passes-templates">
        {data.passes.length === 0 ? (
          <CardHead title={dashboard.empty.passes.title} sub={dashboard.empty.passes.body} />
        ) : (
          <CardHead title={copy.templatesTitle} sub={copy.templatesBody} />
        )}
        <TemplateGrid locked={locked} onPick={onCreate} />
      </Card>
    </div>
  );
}

function TemplateGrid({ locked, onPick }: { locked: boolean; onPick: (template: PassTemplate) => void }) {
  const copy = useCopy().dashboard.passes;
  const money = useMoney();
  return (
    <div className="dx-passes-tmpl-grid">
      {TEMPLATE_ORDER.map((template) => {
        const words = copy.templates[template];
        const example = TEMPLATE_EXAMPLE_PLN_MINOR[template];
        return (
          <button
            key={template}
            type="button"
            className="dx-passes-tmpl"
            data-template={template}
            disabled={locked}
            title={locked ? copy.lockedTitle : undefined}
            onClick={() => onPick(template)}
          >
            <span className="dx-passes-tmpl-ico">
              <DxIcon name={TEMPLATE_ICON[template]} size={20} />
            </span>
            <b>{words.name}</b>
            <span className="dx-passes-tmpl-blurb">{words.blurb}</span>
            <span className="dx-passes-tmpl-example">
              {example === null
                ? words.example
                : fill(words.example, { amount: money(minorToEuro(example, 'PLN'), 'exact') })}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PassCardView({
  pass,
  locked,
  onView,
  onEdit,
  onChanged,
}: {
  pass: PassCard;
  locked: boolean;
  onView: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const copy = useCopy().dashboard.passes;
  const num = useNum();
  const minorMoney = useMinorMoney();
  const { busy, run } = usePassWrite(onChanged);
  const venueId = useDashboard().venueId;

  /* The one press beside Edit, by state. Publishing an incomplete draft opens
     it instead: the drawer is where the missing part is filled in, and a press
     that only toasts "not ready" sends the owner looking for that place. */
  const lifecycle =
    pass.status === 'live'
      ? { label: copy.card.pause, action: 'pause' as const, done: copy.toasts.paused, gated: false }
      : pass.status === 'paused'
        ? { label: copy.card.resume, action: 'resume' as const, done: copy.toasts.resumed, gated: true }
        : pass.status === 'draft'
          ? { label: copy.card.publish, action: 'publish' as const, done: copy.toasts.published, gated: true }
          : null;

  const press = () => {
    if (!lifecycle) return;
    if (lifecycle.action === 'publish' && pass.missing.length) {
      onEdit();
      return;
    }
    void run(lifecycle.action, lifecycle.done, () =>
      venueId === null ? Promise.reject(NO_VENUE()) : setPassStatus(venueId, pass.id, lifecycle.action),
    );
  };

  return (
    <Card as="article" className="dx-passes-card" pad="none">
      <PassArt
        accent={pass.accent}
        kicker={copy.templates[pass.template].name}
        badge={<PassPill status={pass.status} soldOut={pass.soldOut} />}
        name={pass.name}
        tagline={pass.tagline}
        price={minorMoney(pass.priceMinor, pass.currency)}
        period={copy.period[pass.billingPeriod]}
      />
      <div className="dx-passes-card-body">
        <div className="dx-passes-card-figs">
          <div>
            <b>{num(pass.stats.subscribers)}</b>
            <span>{copy.card.subscribers}</span>
          </div>
          <div>
            <b>{num(pass.stats.usedThisMonth)}</b>
            <span>{copy.card.used}</span>
          </div>
          <div>
            <b>{minorMoney(pass.stats.recurringMinor, pass.currency)}</b>
            <span>{copy.card.mrr}</span>
          </div>
        </div>
        <p className="dx-passes-rule">{rulePhrase(copy, pass)}</p>
        <div className="dx-passes-card-acts">
          <button type="button" className="dx-passes-view" onClick={onView}>
            {copy.card.view}
          </button>
          {pass.status !== 'closed' && (
            <Button variant="small" onClick={onEdit}>
              {copy.card.edit}
            </Button>
          )}
          {lifecycle && (
            <Button
              variant="small"
              data-emphasis={lifecycle.action === 'pause' ? undefined : 'deep'}
              disabled={busy !== null || (lifecycle.gated && locked)}
              title={lifecycle.gated && locked ? copy.lockedTitle : undefined}
              onClick={press}
            >
              {lifecycle.label}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
