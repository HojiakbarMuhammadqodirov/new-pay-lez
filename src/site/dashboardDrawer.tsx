import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { Icon } from './icons';
import { useAuth } from './auth/context';
import { useCopy, useCurrency, useLanguage, useMoney } from './i18n/context';
import { fill } from './i18n/currency';
import { PD_AUDIENCES } from './partnerMetrics';
import {
  createDeal,
  publishDeal,
  usePartnerPushQuota,
  usePartnerVenueId,
  type DealDraft,
} from './api/partner';
import { ApiError } from './api/client';
import { FX } from './i18n/fx';
import { NumberWell } from './dashboardControls';
import { useDashboard } from './dashboardShell';
import type { DrawerKind } from './dashboardShell';

/**
 * The create panel — one drawer, two bodies.
 *
 * `b2b/Paylez Partner Dashboard v2.dc.html` puts every "Create hot deal" and
 * "Create campaign" button on this screen, from six places, and this is where
 * they all land. One component rather than two because the header, the footer,
 * the validation line, the escape key and the slide-in are the same for both;
 * only the middle changes.
 *
 * **The deal body writes.** Both of its buttons reach the server —
 * `POST /v1/partner/venues/:id/deals` for the draft, and the publish endpoint
 * after it for the one that goes live — so a deal created here is in the
 * database and comes back on the Hot deals screen, which has always read from
 * the API. Before this the buttons raised `copy.dashboard.notWired`, which was
 * true and was also the whole complaint: an owner filled the panel in, pressed
 * publish, and nothing existed afterwards.
 *
 * Two things about that are load-bearing.
 *
 * **The two buttons are two calls because they are two decisions.** A deal is
 * created as a draft and published by a second request; collapsing them into
 * one flag would hide the state that actually goes wrong, which is a deal that
 * was created and then failed to go live. The owner is told which half
 * happened.
 *
 * **The rest of the drawer still writes nothing, and still says so.** The push
 * notification this panel schedules has no endpoint behind it here, so it
 * raises the strip exactly as before. A panel where three controls write and
 * one does not is only honest if the one that does not keeps saying so.
 *
 * What the drawer is *also* for has not changed: it shows an owner the cost,
 * the reach and the phone preview of the thing they are about to publish,
 * before they publish it, and all three move as the form is filled in.
 *
 * Two things about it are easy to undo by accident:
 *
 * - **Every money control holds the reader's currency, not euros.** The site
 *   stores euros and converts on the way out (root `CLAUDE.md`), which is right
 *   for a figure being *shown* and wrong for one being *typed*: a Polish owner
 *   types złoty. So these fields keep the local number and divide by the rate
 *   once, at the point a sentence needs euros back.
 * - **The preview is the deal, not a picture of one.** Badge, title, description,
 *   dates, audience and limit all read the live draft. A preview built from
 *   placeholders is decoration, and decoration is what this panel exists to
 *   replace.
 */

/* ────────────────────────────────────────────────────────────── controls ── */

function Segmented({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="pd-seg">
      {options.map((label, index) => (
        <button
          key={label}
          type="button"
          data-on={index === value ? 'true' : undefined}
          onClick={() => onChange(index)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pd-form-block">
      <span className="console-label">{title}</span>
      {children}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────── the deal ── */

/** The dates the drawer opens on: the month the whole dashboard reports. */
/**
 * The category a deal is filed under, index-aligned with `copy.deal.kinds`.
 *
 * The server takes `category` as free text, so these are the words it will be
 * grouped by later; they are English identifiers rather than the reader's
 * labels for the same reason `CONTACT_TOPICS` is — a Polish owner and an
 * English one filing the same kind of offer have to file it under one name.
 */
const DEAL_KINDS = ['percentage', 'free_item', 'money_off', 'extra_stamp'] as const;

/**
 * The audience options as the server's segments, index-aligned with
 * `copy.deals.audiences`.
 *
 * `null` twice, for two different reasons: "Everyone" is the absence of a
 * segment, and "Russian speakers" is a *language*, which the draft sends in
 * `targetLanguages` instead. A language filed as a segment would be a targeting
 * rule the server has no name for and would silently match nobody.
 */
const AUDIENCE_SEGMENTS: (string | null)[] = ['', 'newcomer', 'lapsed', 'new', null].map(
  (value) => value || null,
);

/** `HH:MM` as minutes past midnight, which is what a deal window compares. */
const minutesOf = (clock: string): number => {
  const [h, m] = clock.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const DEFAULT_FROM = '2026-08-04';
const DEFAULT_TO = '2026-09-01';

function DealBody({
  onValid,
  submit,
}: {
  onValid: (problems: number) => void;
  /* How the footer reaches the form. The buttons live on the frame — six places
     open this drawer and all of them get the same footer — so the body hands
     its filing function up the same way it hands up its validation count. */
  submit: MutableRefObject<((publish: boolean) => Promise<void>) | null>;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.drawer.deal;
  const dealCopy = dashboard.deals;
  const currency = useCurrency();
  const money = useMoney();
  const { account } = useAuth();
  const { toast, closeDrawer } = useDashboard();
  const [language] = useLanguage();

  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [kind, setKind] = useState(0);
  const [badge, setBadge] = useState('20%');
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  /* Monday-first, matching `copy.dashboard.customers.days`; the seed is the
     quiet stretch the assistant would also pick. */
  const [days, setDays] = useState<boolean[]>([false, true, true, false, false, false, false]);
  const [hourFrom, setHourFrom] = useState('14:00');
  const [hourTo, setHourTo] = useState('16:00');
  const [audience, setAudience] = useState(0);
  const [notify, setNotify] = useState(false);
  const [notifyDate, setNotifyDate] = useState(DEFAULT_FROM);
  const [notifyTime, setNotifyTime] = useState('07:30');
  const [notifyText, setNotifyText] = useState('');
  const [stop, setStop] = useState(0);
  const [stopClaims, setStopClaims] = useState(200);
  const [stopMoney, setStopMoney] = useState(400);

  /*
   * How big the chosen audience is — and, more often, the admission that we
   * cannot say.
   *
   * `PD_AUDIENCES` used to be five invented rows: a reach, a notifiable count
   * and a suggested send time each. The server computes the real thing per deal
   * (`deals.audienceFor`, which is the honest figure — who a push should reach
   * against who it actually will, after the platform frequency cap) but there
   * is no endpoint listing the audiences a venue can choose between, so the
   * list is empty and the estimate paragraph says so. A drawer that sized an
   * audience from a seed was telling an owner how many people their offer would
   * reach, which is the single most consequential number on this panel.
   */
  const reach = PD_AUDIENCES[audience] ?? null;
  const suggested = reach?.sendAt ?? notifyTime;

  /*
   * The notification quota is real and reachable:
   * `GET /v1/partner/venues/:id/push-quota` counts `push_quotas` against the
   * plan's entitlement. With no partner session there is no quota — and the
   * switch is disabled for that reason rather than for the "you have used them
   * all" reason, which is a different sentence and a different fix.
   */
  const quotaVenue = usePartnerVenueId();
  const quotaApi = usePartnerPushQuota(
    quotaVenue.state.status === 'ready' ? quotaVenue.state.data : null,
  );
  const quota = quotaApi.state.status === 'ready' ? quotaApi.state.data : null;
  const quotaOut = quota !== null && quota.remaining === 0;
  const quotaUnknown = quota === null;

  /*
   * Filing the deal.
   *
   * The form's state and the endpoint's body are two different shapes, and the
   * translation is stated here rather than inlined at the press so the two
   * buttons cannot drift:
   *
   * - **Weekdays.** The checkboxes are Monday-first and so is the server
   *   (`LocalTime.weekday`, 0 = Monday), so the indices go straight across. All
   *   seven ticked is sent as *nothing*, because "every day" is the absence of
   *   a day filter and a list of all seven would be a filter that has to be
   *   re-checked on every claim for no reason.
   * - **Hours.** Two clock faces become minutes past local midnight, which is
   *   what a deal window is compared against.
   * - **The audience.** Four of the five options are segments the server knows;
   *   the fifth, "Russian speakers", is a *language* and goes in the language
   *   list instead. A language is not a segment, and sending it as one would
   *   file a targeting rule the server has no name for.
   * - **The spend cap.** The well holds the **reader's** currency — that is the
   *   rule for a money field being typed rather than shown — and the server
   *   wants the *venue's* minor units. It goes back through the euro the whole
   *   site stores amounts in, then out to złoty, which is the currency the
   *   venues on this dashboard actually charge in.
   */
  const asDraft = (): DealDraft => ({
    /* One language, and the one being written in. The panel has a single title
       field, so claiming a translation exists for the other four would be the
       lie the assistant's language tabs exist to avoid. */
    copy: { [language]: { title: title.trim(), description: desc.trim() } },
    discountText: badge.trim(),
    category: DEAL_KINDS[kind],
    validFrom: from,
    validTo: to,
    targetWeekdays: days.every(Boolean)
      ? []
      : days.flatMap((on, index) => (on ? [index] : [])),
    targetFromMin: minutesOf(hourFrom),
    targetToMin: minutesOf(hourTo),
    targetLanguages: audience === 4 ? ['ru'] : [],
    targetAudience: AUDIENCE_SEGMENTS[audience] ? [AUDIENCE_SEGMENTS[audience]!] : [],
    ...(stop === 1 ? { capClaims: stopClaims } : {}),
    ...(stop === 2
      ? { capSpendMinor: Math.round((stopMoney / currency.rate) * FX.PLN.rate * 100) }
      : {}),
  });

  submit.current = async (andPublish: boolean) => {
    const venueId = quotaVenue.state.status === 'ready' ? quotaVenue.state.data : null;
    if (venueId === null) {
      /* No partner session on this device, so there is nowhere to file it.
         Saying that is the whole point — the alternative is a press that
         appears to work and leaves nothing behind, which is exactly what this
         change exists to stop. */
      toast(copy.needsSession);
      return;
    }

    let created;
    try {
      created = await createDeal(venueId, asDraft());
    } catch (cause) {
      /* Named separately, because the two have different fixes: one is "try
         again in a minute", the other is "the server looked at this and said
         no", and only the second is worth reading the reason for. */
      toast(
        cause instanceof ApiError && cause.status === 0
          ? copy.filingOffline
          : fill(copy.filingRefused, {
              why: cause instanceof Error ? cause.message : String(cause),
            }),
      );
      return;
    }

    if (!andPublish) {
      toast(copy.saved);
      closeDrawer();
      return;
    }

    try {
      await publishDeal(created.id);
      toast(copy.published);
    } catch (cause) {
      /*
       * **The deal exists either way**, and this is the whole reason the two
       * calls are not collapsed into one.
       *
       * The common failure here is not an error at all: a venue is unverified
       * until an operator verifies it, and an unverified venue may hold drafts
       * but may not put an offer in front of customers. Reporting that as
       * "filing failed" would send an owner back to retype a deal that is
       * already saved — so every ending on this path says the draft is there,
       * and only the *reason* it is not live changes.
       */
      const why = cause instanceof ApiError ? cause.code : '';
      toast(
        why === 'not_verified'
          ? copy.savedUnverified
          : cause instanceof ApiError && cause.status === 0
            ? copy.savedNotLive
            : fill(copy.savedNotLiveWhy, {
                why: cause instanceof Error ? cause.message : String(cause),
              }),
      );
    }
    closeDrawer();
  };

  const dayNames = useCopy().dashboard.customers.days;
  const whenDays =
    days.every(Boolean) ? copy.everyDay
      : days.some(Boolean) ? days.map((on, i) => (on ? dayNames[i] : null)).filter(Boolean).join('–')
        : copy.noDays;

  /* Two problems the footer counts, and the only two the form can have: a deal
     with no words, and a window that runs backwards. */
  const copyMissing = !title.trim() || !desc.trim();
  const windowBad = to < from;
  useEffect(() => {
    onValid((copyMissing ? 1 : 0) + (windowBad ? 1 : 0));
  }, [copyMissing, windowBad, onValid]);

  return (
    <>
      <Block title={copy.copyTitle}>
        <label className="field">
          <span className="field-label">{copy.titleLabel}</span>
          <input
            value={title}
            placeholder={copy.titlePlaceholder}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">{copy.descLabel}</span>
          <textarea
            rows={3}
            value={desc}
            placeholder={copy.descPlaceholder}
            onChange={(event) => setDesc(event.target.value)}
          />
          {copyMissing ? (
            <span className="field-error" role="alert">
              {copy.copyError}
            </span>
          ) : (
            <span className="field-help">{copy.translateNote}</span>
          )}
        </label>
      </Block>

      <Block title={copy.kindTitle}>
        <Segmented options={copy.kinds} value={kind} onChange={setKind} />
      </Block>

      <Block title={copy.discountTitle}>
        <label className="field pd-field-short">
          <span className="field-label">{copy.badgeLabel}</span>
          <input
            value={badge}
            maxLength={14}
            onChange={(event) => setBadge(event.target.value)}
          />
          <span className="field-help">{copy.badgeNote}</span>
        </label>
        <div className="field-row">
          <label className="field">
            <span className="field-label">{copy.from}</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">{copy.to}</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            {windowBad && (
              <span className="field-error" role="alert">
                {copy.windowError}
              </span>
            )}
          </label>
        </div>
      </Block>

      <Block title={copy.whenTitle}>
        <div className="pd-days">
          {dayNames.map((name, index) => (
            <button
              key={name}
              type="button"
              data-on={days[index] ? 'true' : undefined}
              onClick={() =>
                setDays((current) => current.map((on, i) => (i === index ? !on : on)))
              }
            >
              {name}
            </button>
          ))}
        </div>
        <div className="pd-hours">
          <label className="field">
            <span className="field-label">{copy.hourFrom}</span>
            <input
              type="time"
              value={hourFrom}
              onChange={(event) => setHourFrom(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">{copy.hourTo}</span>
            <input type="time" value={hourTo} onChange={(event) => setHourTo(event.target.value)} />
          </label>
          <p className="pd-fine">
            {fill(copy.whenNote, { days: whenDays, from: hourFrom, to: hourTo })}
          </p>
        </div>
      </Block>

      <Block title={copy.audienceTitle}>
        <div className="pd-picks">
          {dealCopy.audiences.map((name, index) => (
            <button
              key={name}
              type="button"
              data-on={audience === index ? 'true' : undefined}
              onClick={() => setAudience(index)}
            >
              <b>{name}</b>
              <span>{dealCopy.audienceNotes[index]}</span>
            </button>
          ))}
        </div>
        <p className="pd-brief">
          {reach === null
            ? dashboard.unmeasured.audience
            : fill(copy.audienceEstimate, {
                n: reach.reach.toLocaleString('en-US').replace(/,/g, currency.group),
                notifiable: reach.notifiable
                  .toLocaleString('en-US')
                  .replace(/,/g, currency.group),
              })}
        </p>
      </Block>

      <Block title={copy.notifyTitle}>
        <div className="pd-switch-row">
          <div>
            <b>{copy.notifySwitch}</b>
            <span className="pd-fine">
              {quota === null
                ? dashboard.unmeasured.quota
                : fill(copy.notifyQuota, {
                    n: String(quota.remaining),
                    total: String(quota.quota),
                  })}
            </span>
          </div>
          {/*
            A real checkbox under a drawn track. `appearance: none` on the input
            keeps the label association, the keyboard and the focus ring that a
            `<button role="switch">` has to re-implement by hand.
          */}
          <label className="pd-switch">
            <input
              type="checkbox"
              checked={notify}
              disabled={quotaOut || quotaUnknown}
              onChange={(event) => setNotify(event.target.checked)}
            />
            <i aria-hidden />
            <span className="visually-hidden">{copy.notifySwitch}</span>
          </label>
        </div>

        {quotaOut && (
          <div className="pd-brief pd-brief-warn">
            <b>{fill(copy.notifyOutTitle, { total: String(quota?.quota ?? 0) })}</b>
            <p>{copy.notifyOutBody}</p>
            <button type="button" className="btn btn-ghost" onClick={() => toast(dashboard.notWired)}>
              {copy.notifyPlan}
            </button>
          </div>
        )}

        {notify && !quotaOut && (
          <div className="pd-notify-body">
            <span className="field-label">{copy.notifyWhen}</span>
            <div className="pd-notify-when">
              <input
                type="date"
                value={notifyDate}
                aria-label={copy.notifyWhen}
                onChange={(event) => setNotifyDate(event.target.value)}
              />
              <input
                type="time"
                value={notifyTime}
                aria-label={copy.notifyWhen}
                onChange={(event) => setNotifyTime(event.target.value)}
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setNotifyTime(suggested)}
              >
                {fill(copy.useSuggested, { at: suggested })}
              </button>
            </div>
            <p className="pd-fine">{fill(copy.notifySuggested, { at: suggested })}</p>
            <p className="pd-fine">{copy.quietNote}</p>

            <span className="field-label">{copy.notifyWho}</span>
            <div className="pd-switch-row">
              <div>
                <b>{dealCopy.audiences[audience]}</b>
                <span className="pd-fine">
                  {reach === null
                    ? dashboard.unmeasured.audience
                    : fill(copy.notifyReach, {
                        n: String(reach.notifiable),
                        total: String(reach.reach),
                      })}
                </span>
              </div>
              <span className="pd-fine">{copy.notifyWhoNote}</span>
            </div>

            <label className="field">
              <span className="field-label">{copy.notifyText}</span>
              <input
                value={notifyText}
                maxLength={64}
                placeholder={title || copy.titlePlaceholder}
                onChange={(event) => setNotifyText(event.target.value)}
              />
              <span className="field-help">{copy.notifyTextNote}</span>
            </label>

            {/* The lock screen. The one place on the dashboard that draws the
                customer's phone rather than the owner's desk, because a
                notification is the only thing here that arrives uninvited. */}
            <div className="pd-lock">
              <span className="pd-lock-clock">{notifyTime}</span>
              <div className="pd-lock-card">
                <div className="pd-lock-head">
                  <span className="brand">paylez</span>
                  <i>now</i>
                </div>
                <b>{title || copy.previewUntitled}</b>
                <p>{notifyText || desc || copy.previewNoDesc}</p>
              </div>
            </div>
          </div>
        )}
      </Block>

      <Block title={copy.stopTitle}>
        <div className="pd-radios">
          {copy.stopOptions.map((option, index) => (
            <button
              key={option.label}
              type="button"
              data-on={stop === index ? 'true' : undefined}
              onClick={() => setStop(index)}
            >
              <i aria-hidden />
              <span>
                <b>{option.label}</b>
                <em>{option.note}</em>
              </span>
            </button>
          ))}
        </div>
        {stop === 1 && (
          <label className="field pd-field-short">
            <span className="field-label">{copy.stopClaims}</span>
            <NumberWell
              value={stopClaims}
              onChange={setStopClaims}
              unit={copy.claims}
              label={copy.stopClaims}
            />
          </label>
        )}
        {stop === 2 && (
          <label className="field pd-field-short">
            <span className="field-label">{copy.stopMoney}</span>
            <NumberWell
              value={stopMoney}
              onChange={setStopMoney}
              unit={currency.symbol}
              label={copy.stopMoney}
            />
          </label>
        )}
        <p className="pd-fine">{copy.stopNote}</p>
      </Block>

      <Block title={copy.termsTitle}>
        <label className="field">
          <span className="visually-hidden">{copy.termsTitle}</span>
          <textarea rows={3} placeholder={copy.termsPlaceholder} defaultValue="" />
        </label>
      </Block>

      <Block title={copy.previewTitle}>
        <div className="pd-phone" data-ink="on">
          <span className="pd-phone-notch" aria-hidden />
          <div className="pd-phone-card">
            <div className="pd-phone-art">
              <span>{badge}</span>
            </div>
            <div className="pd-phone-body">
              <em>{account?.business?.name || account?.name}</em>
              <b>{title || copy.previewUntitled}</b>
              <p>{desc || copy.previewNoDesc}</p>
              <div className="pd-phone-foot">
                <span>{from} – {to}</span>
                <i>{copy.previewClaim}</i>
              </div>
            </div>
          </div>
        </div>
        <p className="pd-fine pd-centred">
          {fill(copy.whenNote, { days: whenDays, from: hourFrom, to: hourTo })} ·{' '}
          {dealCopy.audiences[audience]}
        </p>
        <p className="pd-fine pd-centred">
          {stop === 0
            ? copy.previewLimitNone
            : stop === 1
              ? fill(copy.previewLimitClaims, { n: String(stopClaims) })
              : fill(copy.previewLimitMoney, {
                  amount: money(stopMoney / currency.rate, 'exact'),
                })}
        </p>
      </Block>
    </>
  );
}

/* ─────────────────────────────────────────────────────────── the campaign ── */

function CampaignBody({ onValid }: { onValid: (problems: number) => void }) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.drawer.campaign;
  const currency = useCurrency();
  const money = useMoney();

  const [name, setName] = useState('');
  const [visits, setVisits] = useState(4);
  const [rewardKind, setRewardKind] = useState(0);
  const [rewardItem, setRewardItem] = useState('');
  const [rewardAmount, setRewardAmount] = useState(10);
  /* Held in the reader's currency, like every other typed amount here — the
     prototype's five złoty, converted once for the field to open on. */
  const [cost, setCost] = useState(() =>
    Math.max(1, Math.round((5 / FX.PLN.rate) * currency.rate)),
  );
  const [project, setProject] = useState(40);
  const [priority, setPriority] = useState(1);
  const [expiry, setExpiry] = useState(60);
  const [minSpend, setMinSpend] = useState(15);

  const rewardMissing = rewardKind === 0 && !rewardItem.trim();
  const nameMissing = !name.trim();
  useEffect(() => {
    onValid((nameMissing ? 1 : 0) + (rewardMissing ? 1 : 0));
  }, [nameMissing, rewardMissing, onValid]);

  const reward =
    rewardKind === 0
      ? rewardItem.trim() || copy.summaryReward
      : `${money(rewardAmount / currency.rate, 'unit')} ${copy.rewardOff}`;

  return (
    <>
      <label className="field">
        <span className="field-label">{copy.nameLabel}</span>
        <input
          value={name}
          placeholder={copy.namePlaceholder}
          onChange={(event) => setName(event.target.value)}
        />
        {nameMissing ? (
          <span className="field-error" role="alert">
            {copy.nameError}
          </span>
        ) : (
          <span className="field-help">{copy.nameNote}</span>
        )}
      </label>

      <Block title={copy.visitsTitle}>
        <div className="pd-stepper">
          <button
            type="button"
            aria-label={copy.visitsMinus}
            onClick={() => setVisits((n) => Math.max(1, n - 1))}
          >
            −
          </button>
          <NumberWell
            value={visits}
            onChange={(n) => setVisits(Math.max(1, n))}
            unit={copy.visits}
            label={copy.visitsTitle}
          />
          <button type="button" aria-label={copy.visitsPlus} onClick={() => setVisits((n) => n + 1)}>
            +
          </button>
        </div>
        <p className="pd-fine">{fill(copy.visitsHelp, { n: String(visits) })}</p>
      </Block>

      <Block title={copy.rewardTitle}>
        <Segmented options={copy.rewardKinds} value={rewardKind} onChange={setRewardKind} />
        {rewardKind === 0 ? (
          <label className="field">
            <span className="visually-hidden">{copy.rewardTitle}</span>
            <input
              value={rewardItem}
              placeholder={copy.rewardItemPlaceholder}
              onChange={(event) => setRewardItem(event.target.value)}
            />
            {rewardMissing ? (
              <span className="field-error" role="alert">
                {copy.rewardError}
              </span>
            ) : (
              <span className="field-help">{copy.rewardItemNote}</span>
            )}
          </label>
        ) : (
          <NumberWell
            value={rewardAmount}
            onChange={setRewardAmount}
            unit={`${currency.symbol} ${copy.rewardOff}`}
            label={copy.rewardTitle}
          />
        )}
      </Block>

      <Block title={copy.costTitle}>
        <NumberWell
          value={cost}
          onChange={setCost}
          unit={`${currency.symbol} ${copy.costEach}`}
          label={copy.costTitle}
        />
        <p className="pd-fine">{copy.costNote}</p>
        <div className="pd-projection">
          <NumberWell
            value={project}
            onChange={setProject}
            unit={copy.project}
            label={copy.project}
          />
          <b>
            {fill(copy.projection, {
              n: String(project),
              amount: money((project * cost) / currency.rate, 'exact'),
            })}
          </b>
        </div>
      </Block>

      <Block title={copy.priorityTitle}>
        <p className="pd-fine">{copy.priorityLede}</p>
        <div className="pd-seg">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              data-on={priority === n ? 'true' : undefined}
              onClick={() => setPriority(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="pd-fine">{fill(copy.priorityHelp, { n: String(priority) })}</p>
      </Block>

      <Block title={copy.rulesTitle}>
        <div className="field-row">
          <label className="field">
            <span className="field-label">{copy.expiry}</span>
            <NumberWell value={expiry} onChange={setExpiry} unit={copy.days} label={copy.expiry} wide />
            <span className="field-help">{copy.expiryNote}</span>
          </label>
          <label className="field">
            <span className="field-label">{copy.minSpend}</span>
            <NumberWell
              value={minSpend}
              onChange={setMinSpend}
              unit={currency.symbol}
              label={copy.minSpend}
              wide
            />
            <span className="field-help">{copy.minSpendNote}</span>
          </label>
        </div>
      </Block>

      {/* The whole form said back in one sentence. The prototype ends both
          drawers this way and it is the most useful thing on either: an owner
          who cannot read the fields can still check the sentence. */}
      {/* `data-ink='paper'` is what makes it a black slab on the light page and
          leaves it as glass in dark — the same treatment `.pd-hero` takes, and
          the reason `site.css` no longer swaps `--text` and `--bg` here. */}
      <div className="pd-summary" data-ink="paper">
        <span className="console-label">{copy.summaryTitle}</span>
        <b>
          {fill(copy.summary, {
            visits: String(visits),
            reward,
            amount: money(cost / currency.rate, 'unit'),
          })}
        </b>
        <p>{copy.summaryNote}</p>
      </div>
    </>
  );
}

/* ───────────────────────────────────────────────────────────────── frame ── */

export function DashboardDrawer({ kind }: { kind: DrawerKind }) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.drawer;
  const { closeDrawer, toast } = useDashboard();
  const [problems, setProblems] = useState(0);
  const [filing, setFiling] = useState(false);
  const panel = useRef<HTMLElement>(null);
  /* Set by `DealBody` during its render — see the prop's note there. Null while
     the campaign body is mounted, which is what the `kind` check below is
     reading rather than a second flag. */
  const submit = useRef<((publish: boolean) => Promise<void>) | null>(null);

  /* One press, whichever button. Locked while it is in flight: a second press
     files a second deal, and the panel closes on success anyway. */
  const press = async (publish: boolean) => {
    if (filing) return;
    if (kind !== 'deal' || !submit.current) {
      /* The campaign body has no endpoint behind it and still says so — see the
         note in the file header. */
      toast(dashboard.notWired);
      closeDrawer();
      return;
    }
    setFiling(true);
    try {
      await submit.current(publish);
    } finally {
      setFiling(false);
    }
  };

  const body = kind === 'deal' ? copy.deal : copy.campaign;

  /* Escape closes, and focus starts inside — a slide-over that leaves the
     keyboard on the page behind it is a modal in appearance only. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer();
    };
    document.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [closeDrawer]);

  const validNote = useMemo(
    () =>
      problems === 0
        ? ''
        : fill(problems === 1 ? copy.valid : copy.validPlural, { n: String(problems) }),
    [problems, copy],
  );

  return (
    <div className="pd-sheet" role="dialog" aria-modal="true" aria-label={body.title}>
      <button type="button" className="pd-scrim" aria-label={copy.close} onClick={closeDrawer} />
      <section className="pd-drawer-panel" ref={panel} tabIndex={-1}>
        <header>
          <div>
            <span className="console-label">{body.kicker}</span>
            <h2>{body.title}</h2>
            <p className="pd-fine">{body.sub}</p>
          </div>
          <button type="button" className="pd-icon" aria-label={copy.close} onClick={closeDrawer}>
            <Icon name="close" size={15} strokeWidth={2} />
          </button>
        </header>

        <div className="pd-drawer-body">
          {kind === 'deal' ? (
            <DealBody onValid={setProblems} submit={submit} />
          ) : (
            <CampaignBody onValid={setProblems} />
          )}
        </div>

        <footer>
          {validNote && <p className="field-error">{validNote}</p>}
          <div className="pd-drawer-acts">
            <button type="button" className="btn btn-ghost" onClick={closeDrawer}>
              {copy.cancel}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={filing}
              onClick={() => void press(false)}
            >
              {copy.later}
            </button>
            <button
              type="button"
              className="btn btn-solid"
              disabled={problems > 0 || filing}
              onClick={() => void press(true)}
            >
              {filing ? copy.deal.filing : body.publish}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── toast ── */

/**
 * The confirmation strip.
 *
 * It clears itself after four seconds, which is the prototype's own timing, and
 * announces politely rather than assertively: it confirms a press the user just
 * made, so interrupting them with it is worse than letting it wait.
 */
export function DashboardToast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 4000);
    return () => window.clearTimeout(timer);
  }, [message, onDone]);

  return (
    <output className="pd-toast">
      <i aria-hidden>
        <Icon name="check" size={12} strokeWidth={3} />
      </i>
      {message}
    </output>
  );
}

