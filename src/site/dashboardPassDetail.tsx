/**
 * One pass, opened (v3 §3.5 "Detail view"): the hero with its lifecycle
 * presses, four figures, two notes, and the holders who share their name.
 *
 * Two reads, and they fail separately. The pass and its figures are
 * `GET …/passes/:id`; the names are `…/subscribers`, which is the Customers
 * page's entitlement and its consent rule — so a plan without names still sees
 * the figures, and a venue whose holders share nothing is told how many hold
 * it rather than shown an empty list that reads as "nobody".
 *
 * Close is the one press that cannot be undone, so it asks first, naming the
 * pass. A draft is not closed but deleted — the server's lifecycle — and only
 * a draft nobody ever held can be; that asks too.
 */
import { useState } from 'react';

import { minorToEuro, readyOr } from './api/partner';
import {
  deletePassDraft,
  setPassStatus,
  usePartnerPass,
  usePassSubscribers,
  type Pass,
  type PassAction,
  type PassMembersResponse,
} from './api/passes';
import { DEMO_PASS_DETAILS, DEMO_PASS_SUBSCRIBERS } from './dashboardDemo';
import { useNum, useVenueDates } from './dashboardFormat';
import { Card, ConfirmDialog, DxIcon, Eyebrow } from './dashboardKit';
import { initialsOf } from './dashboardKitHooks';
import { PassPill } from './dashboardPassArt';
import { NO_VENUE, TEMPLATE_ICON, rulePhrase, upsellReason, usePassWrite } from './dashboardPassRules';
import { Screen } from './dashboardScreens';
import { useDashboard } from './dashboardShell';
import { DEMO_MODE } from './demoMode';
import { useCopy, useLanguage, useMoney } from './i18n/context';
import { fill } from './i18n/currency';

export function PassDetail({
  passId,
  locked,
  onBack,
  onEdit,
  onChanged,
  onGone,
}: {
  passId: string;
  locked: boolean;
  onBack: () => void;
  onEdit: (pass: Pass) => void;
  onChanged: () => void;
  onGone: () => void;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.passes;
  const { venueId } = useDashboard();
  const detail = usePartnerPass(venueId, passId);
  const num = useNum();
  const money = useMoney();
  const [language] = useLanguage();
  const { busy, run } = usePassWrite(onChanged);
  const [confirm, setConfirm] = useState<'close' | 'delete' | null>(null);

  return (
    <div className="dx-passes">
      <button type="button" className="dx-passes-back" onClick={onBack}>
        <DxIcon name="chevronLeft" size={15} strokeWidth={2} />
        {copy.detail.back}
      </button>
      <Screen state={detail.state} id="passes" demo={DEMO_MODE ? DEMO_PASS_DETAILS[passId] : undefined}>
        {({ pass, stats }) => {
          const minor = (value: number) => money(minorToEuro(value, pass.currency), 'exact');
          const reason = upsellReason(copy, stats.upsell);
          const act = (action: PassAction, done: string) =>
            void run(action, done, () =>
              venueId === null ? Promise.reject(NO_VENUE()) : setPassStatus(venueId, pass.id, action),
            );
          const lifecycle =
            pass.status === 'live'
              ? { label: copy.detail.pauseSignups, press: () => act('pause', copy.toasts.paused), gated: false }
              : pass.status === 'paused'
                ? { label: copy.detail.resume, press: () => act('resume', copy.toasts.resumed), gated: true }
                : pass.status === 'draft'
                  ? {
                      label: copy.detail.publish,
                      press: () => (pass.missing.length ? onEdit(pass) : act('publish', copy.toasts.published)),
                      gated: true,
                    }
                  : null;

          const figures = [
            {
              key: 'subs',
              label: copy.detail.subscribers,
              value: num(stats.subscribers),
              note: fill(copy.detail.subscribersNote, {
                new: num(stats.newThisMonth),
                cancelled: num(stats.cancelledThisMonth),
              }),
            },
            {
              key: 'revenue',
              label: copy.detail.revenue,
              value: minor(stats.recurringMinor),
              note: copy.detail.revenueNote,
            },
            {
              key: 'redemptions',
              label: copy.detail.redemptions,
              value: num(stats.redemptionsThisMonth),
              /* One decimal is the server's; written with the reader's own mark. */
              note: fill(copy.detail.perSub, {
                n: new Intl.NumberFormat(language, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                }).format(stats.perActiveSubscriber),
              }),
            },
            {
              key: 'upsell',
              label: copy.detail.upsell,
              value: stats.upsell.minor === null ? <span className="dx-passes-none">—</span> : minor(stats.upsell.minor),
              note:
                reason ??
                fill(copy.detail.upsellNote, {
                  n: num(stats.upsell.measured),
                  total: num(stats.upsell.redemptions),
                }),
            },
          ];

          return (
            <>
              <section className="dx-passes-hero" data-accent={pass.accent}>
                <span className="dx-passes-hero-ico" aria-hidden>
                  <DxIcon name={TEMPLATE_ICON[pass.template]} size={24} />
                </span>
                <div className="dx-passes-hero-text">
                  <div className="dx-passes-hero-title">
                    <h2>{pass.name}</h2>
                    <PassPill status={pass.status} soldOut={pass.soldOut} />
                  </div>
                  {pass.tagline && <p>{pass.tagline}</p>}
                  <div className="dx-passes-hero-line">
                    <b>
                      {minor(pass.priceMinor)} {copy.period[pass.billingPeriod]}
                    </b>
                    {' · '}
                    <span>{rulePhrase(copy, pass)}</span>
                  </div>
                </div>
                {pass.status !== 'closed' && (
                  <div className="dx-passes-hero-acts">
                    <button type="button" data-kind="edit" onClick={() => onEdit(pass)}>
                      {copy.detail.edit}
                    </button>
                    {lifecycle && (
                      <button
                        type="button"
                        disabled={busy !== null || (lifecycle.gated && locked)}
                        title={lifecycle.gated && locked ? copy.lockedTitle : undefined}
                        onClick={lifecycle.press}
                      >
                        {lifecycle.label}
                      </button>
                    )}
                    {pass.status === 'draft' ? (
                      pass.holders === 0 && (
                        <button type="button" data-kind="quiet" onClick={() => setConfirm('delete')}>
                          {copy.detail.deleteDraft}
                        </button>
                      )
                    ) : (
                      <button type="button" data-kind="quiet" onClick={() => setConfirm('close')}>
                        {copy.detail.close}
                      </button>
                    )}
                  </div>
                )}
              </section>

              <div className="dx-passes-stats" data-plain="true">
                {figures.map((figure) => (
                  <Card key={figure.key} className="dx-passes-stat" pad="none">
                    <div className="dx-passes-stat-label">{figure.label}</div>
                    <div className="dx-passes-stat-value">{figure.value}</div>
                    <div className="dx-passes-stat-note">{figure.note}</div>
                  </Card>
                ))}
              </div>

              <div className="dx-passes-notes">
                <div className="dx-passes-lesson">
                  <Eyebrow>{copy.detail.lessonTitle}</Eyebrow>
                  <p>
                    {stats.subscribers > 0 && stats.upsell.minor !== null
                      ? fill(copy.detail.lessonMeasured, { amount: minor(stats.upsell.minor) })
                      : copy.detail.lessonGeneral}
                  </p>
                </div>
                <Card className="dx-passes-pricenote" pad="sm">
                  <Eyebrow tone="faint">{copy.detail.priceTitle}</Eyebrow>
                  <p>{copy.detail.priceBody}</p>
                </Card>
              </div>

              <Subscribers passId={pass.id} holders={stats.subscribers} />

              {confirm === 'close' && (
                <ConfirmDialog
                  title={fill(copy.closeConfirm.title, { name: pass.name })}
                  body={copy.closeConfirm.body}
                  confirmLabel={copy.closeConfirm.confirm}
                  busy={busy !== null}
                  onCancel={() => setConfirm(null)}
                  onConfirm={() => {
                    void run('close', copy.toasts.closed, () =>
                      venueId === null ? Promise.reject(NO_VENUE()) : setPassStatus(venueId, pass.id, 'close'),
                    ).then(() => setConfirm(null));
                  }}
                />
              )}
              {confirm === 'delete' && (
                <ConfirmDialog
                  title={fill(copy.deleteConfirm.title, { name: pass.name || copy.drawer.previewName })}
                  body={copy.deleteConfirm.body}
                  confirmLabel={copy.deleteConfirm.confirm}
                  busy={busy !== null}
                  onCancel={() => setConfirm(null)}
                  onConfirm={() => {
                    void run('delete', copy.toasts.deleted, () =>
                      venueId === null ? Promise.reject(NO_VENUE()) : deletePassDraft(venueId, pass.id),
                    ).then((ok) => {
                      setConfirm(null);
                      if (ok) onGone();
                    });
                  }}
                />
              )}
            </>
          );
        }}
      </Screen>
    </div>
  );
}

/**
 * The holders who agreed to share, and the sentence that says how many did not.
 *
 * `total` counts everybody holding the pass and `rows` only those who share —
 * the consent rule is the server's, in SQL — so the note says "8 of 128" and
 * never lets the list pass for the whole membership.
 */
function Subscribers({ passId, holders }: { passId: string; holders: number }) {
  const copy = useCopy().dashboard.passes.detail;
  const dashboard = useCopy().dashboard;
  const { venueId, venue } = useDashboard();
  const api = usePassSubscribers(venueId, passId);
  const num = useNum();
  const dates = useVenueDates(venue?.timezone ?? null);
  const demo = DEMO_MODE ? (DEMO_PASS_SUBSCRIBERS[passId] ?? null) : null;
  const data: PassMembersResponse | null = readyOr(api.state, demo);
  const lockedOut = api.state.status === 'error' && api.state.error.code === 'entitlement_required';

  let note: string;
  if (lockedOut) note = copy.listLocked;
  else if (data === null) note = api.state.status === 'loading' ? dashboard.unmeasured.asking : dashboard.unmeasured.serverSilent;
  else if (data.total === 0 && holders === 0) note = copy.listNone;
  else if (data.shared === 0) note = fill(copy.listNoneShared, { total: num(data.total) });
  else note = `${copy.listNote} ${fill(copy.listShared, { shared: num(data.shared), total: num(data.total) })}`;

  return (
    <Card className="dx-passes-subs" pad="none">
      <header>
        <h2>{copy.listTitle}</h2>
        <p>{note}</p>
      </header>
      {data && data.rows.length > 0 && (
        <ul>
          {data.rows.map((row) => (
            <li key={row.subscriptionId}>
              <span className="dx-passes-subs-init" aria-hidden>
                {initialsOf(row.name)}
              </span>
              <div className="dx-passes-subs-who">
                <b>{row.name}</b>
                <span>{fill(copy.since, { date: dates.long(row.since) })}</span>
              </div>
              <div className="dx-passes-subs-used">
                <b>{num(row.usedThisPeriod)}</b>
                <span>{copy.used}</span>
              </div>
              <span className="dx-passes-subs-state" data-state={row.status}>
                {copy.subStatus[row.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
