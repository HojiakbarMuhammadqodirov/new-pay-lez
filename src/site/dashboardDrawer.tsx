import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import { Icon } from './icons';
import { useAuth } from './auth/context';
import { useCopy, useCurrency, useLanguage, useMoney } from './i18n/context';
import { fill } from './i18n/currency';
import { metricValue } from './partnerMetrics';
import {
  createCampaign,
  createDeal,
  euroToMinor,
  isNoSession,
  minorToEuro,
  publishDeal,
  readyOr,
  scheduleDealPush,
  updateCampaign,
  updateDeal,
  usePartnerAudiences,
  usePartnerCampaigns,
  usePartnerDeals,
  usePartnerPushQuota,
  usePartnerVenue,
  venueInstant,
  type AudienceSegment,
  type CampaignDraft,
  type CampaignPatch,
  type DealDraft,
} from './api/partner';
import { ApiError } from './api/client';
import { FX } from './i18n/fx';
import { NumberWell } from './dashboardControls';
import { DEMO_AUDIENCES, DEMO_CAMPAIGNS, DEMO_QUOTA, DEMO_VENUE } from './dashboardDemo';
import { useNum } from './dashboardFormat';
import { Figure } from './dashboardScreens';
import { useDashboard } from './dashboardShell';
import type { DrawerKind, DrawerPrefill } from './dashboardShell';
import { DEMO_MODE } from './demoMode';

/**
 * The create panel — one drawer, two bodies, and now an edit mode for each.
 *
 * `b2b/Paylez Partner Dashboard v2.dc.html` puts every "Create hot deal" and
 * "Create campaign" button on this screen, from six places, and this is where
 * they all land. One component rather than two because the header, the footer,
 * the validation line, the escape key and the slide-in are the same for both.
 *
 * **Both bodies write.** A deal goes to `POST /v1/partner/venues/:id/deals` and
 * then the publish endpoint; its push to `POST /v1/partner/deals/:id/push`; a
 * campaign to `POST /v1/partner/venues/:id/campaigns`. Opened on an existing row
 * they write through `PATCH` instead — `/v1/partner/deals/:id` or
 * `/v1/partner/campaigns/:id` — which sends only the fields the form owns, so a
 * rule set somewhere else survives the save.
 *
 * **It can be opened with a draft** (`DrawerPrefill`), which is how the
 * assistant hands an owner to the ordinary form rather than filing anything
 * itself. Prefilled money arrives in the venue's minor units and is converted to
 * the reader's currency once the venue row says what those units are.
 *
 * Four things about it are load-bearing:
 *
 * - **The deal's two buttons are two calls because they are two decisions.** A
 *   deal is created as a draft and published by a second request; the owner is
 *   told which half happened.
 * - **A push is scheduled only on publish, and against the venue's clock** —
 *   the server refuses a send outside 07:00–21:00 *venue-local*.
 * - **Every money control holds the reader's currency, not euros**, and goes
 *   back through the rate at the point a request needs the venue's minor units.
 * - **The audience figures are the server's, and nothing else is.** The drawer
 *   used to offer "Use 07:30 — your audience opens the app most then", and the
 *   07:30 was whatever the owner had typed: nothing measures when an audience
 *   opens the app, so that button and sentence are gone rather than invented.
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

/** The sentence for a filing that did not land, by kind. */
function filingFailure(cause: unknown, copy: ReturnType<typeof useCopy>['dashboard']): string {
  if (cause instanceof ApiError && cause.status === 0) return copy.drawer.deal.filingOffline;
  if (cause instanceof ApiError && cause.status === 401) return copy.unmeasured.noSession;
  return fill(copy.drawer.deal.filingRefused, {
    why: cause instanceof Error ? cause.message : String(cause),
  });
}

/* ─────────────────────────────────────────────────────────────── the deal ── */

/**
 * The category a deal is filed under, index-aligned with `copy.deal.kinds`.
 *
 * English identifiers rather than the reader's labels, so a Polish owner and an
 * English one filing the same kind of offer file it under one name.
 */
const DEAL_KINDS = ['percentage', 'free_item', 'money_off', 'extra_stamp'] as const;

/**
 * The audience picker's five options as the server's segments, index-aligned
 * with `copy.deals.audiences`.
 *
 * `null` for "Russian speakers", which is a *language* — the draft sends it in
 * `targetLanguages`, and `GET …/audiences` sizes no audience by language, so
 * that option says it has no count rather than borrowing one.
 */
const PICK_SEGMENTS: Array<AudienceSegment | null> = ['all', 'newcomer', 'lapsed', 'new', null];

/** `HH:MM` as minutes past midnight, which is what a deal window compares. */
const minutesOf = (clock: string): number => {
  const [h, m] = clock.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** The inverse, for filling the two time wells from a row or a draft. */
const clockOf = (minutes: number): string => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * Local `YYYY-MM-DD`, `offset` days from today — what a date input speaks.
 *
 * The drawer opened on a fixed August window for a while, which by September was
 * a deal whose end date had already passed before anybody typed a word.
 */
const localDay = (offset = 0): string => {
  const at = new Date();
  at.setDate(at.getDate() + offset);
  return `${at.getFullYear()}-${`${at.getMonth() + 1}`.padStart(2, '0')}-${`${at.getDate()}`.padStart(2, '0')}`;
};

/** Seven Monday-first booleans from a 0 = Monday list; an empty list is every day. */
const flagsOf = (weekdays: number[]): boolean[] =>
  weekdays.length === 0
    ? Array.from({ length: 7 }, () => true)
    : Array.from({ length: 7 }, (_, index) => weekdays.includes(index));

/**
 * Where the plans are written down — the *anchor* form, because `routeOf` looks
 * a hash starting with `#/` up verbatim and a compound form misses the table.
 */
const PLANS_ANCHOR = '#business-pricing';

function DealBody({
  onValid,
  submit,
  dealId,
  prefill,
}: {
  onValid: (problems: number) => void;
  /* How the footer reaches the form. The buttons live on the frame, so the body
     hands its filing function up the same way it hands up its validation count. */
  submit: MutableRefObject<((publish: boolean) => Promise<void>) | null>;
  /* The deal being edited, or undefined when this is a new one. */
  dealId?: string;
  /* Starting values for a new deal. */
  prefill?: DrawerPrefill['deal'];
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.drawer.deal;
  const dealCopy = dashboard.deals;
  const currency = useCurrency();
  const money = useMoney();
  const num = useNum();
  const { account } = useAuth();
  const { toast, closeDrawer, refresh } = useDashboard();
  const [language] = useLanguage();

  const [title, setTitle] = useState(prefill?.title ?? '');
  const [desc, setDesc] = useState(prefill?.description ?? '');
  /* A drafted badge with a percentage in it is a percentage; any other drafted
     badge is an item. A blank form opens on the percentage, as it always did. */
  const [kind, setKind] = useState(() =>
    prefill?.discountText === undefined || /%/.test(prefill.discountText) ? 0 : 1,
  );
  const [badge, setBadge] = useState(prefill?.discountText ?? '20%');
  const [from, setFrom] = useState(() => prefill?.validFrom?.slice(0, 10) ?? localDay(0));
  const [to, setTo] = useState(() => prefill?.validTo?.slice(0, 10) ?? localDay(28));
  /* Monday-first, matching `copy.dashboard.customers.days`. */
  const [days, setDays] = useState<boolean[]>(() =>
    prefill?.targetWeekdays ? flagsOf(prefill.targetWeekdays) : [false, true, true, false, false, false, false],
  );
  const [hourFrom, setHourFrom] = useState(() =>
    prefill?.targetFromMin !== undefined ? clockOf(prefill.targetFromMin) : '14:00',
  );
  const [hourTo, setHourTo] = useState(() =>
    prefill?.targetToMin !== undefined ? clockOf(prefill.targetToMin) : '16:00',
  );
  const [audience, setAudience] = useState(0);
  const [notify, setNotify] = useState(false);
  const [notifyDate, setNotifyDate] = useState(() => prefill?.validFrom?.slice(0, 10) ?? localDay(0));
  const [notifyTime, setNotifyTime] = useState('09:00');
  const [notifyText, setNotifyText] = useState('');
  const [stop, setStop] = useState(prefill?.capClaims ? 1 : 0);
  const [stopClaims, setStopClaims] = useState(prefill?.capClaims ?? 200);
  const [stopMoney, setStopMoney] = useState(400);

  const venueApi = usePartnerVenue();
  const venue = venueApi.state.status === 'ready' ? venueApi.state.data : null;
  const liveId = venue?.id ?? null;

  /*
   * How big the chosen audience is, from `GET …/audiences`.
   *
   * Both figures are about people and take the min-cohort floor, so each is a
   * `Figure` — a withheld one is the dash with its reason, never 0. They are
   * two labelled figures rather than one sentence because either can be
   * withheld on its own, and "About — people match this" is not a sentence.
   */
  const audiencesApi = usePartnerAudiences(liveId);
  const audiences = readyOr(audiencesApi.state, DEMO_MODE ? DEMO_AUDIENCES : null);
  const segment = PICK_SEGMENTS[audience] ?? null;
  const sized = segment === null ? null : (audiences?.find((row) => row.segment === segment) ?? null);
  const reachValue = sized ? metricValue(sized.reach) : null;
  const notifiableValue = sized ? metricValue(sized.notifiable) : null;

  /*
   * The deal being edited, off the same request the table drew — `useApi` keeps
   * no cache, so this is a second read of the list, which is the price of
   * filling the form from what the server holds rather than from a copy handed
   * across.
   */
  const dealsApi = usePartnerDeals(dealId ? liveId : null);
  const editing = dealId !== undefined;
  const existing =
    dealsApi.state.status === 'ready'
      ? (dealsApi.state.data.find((row) => row.id === dealId) ?? null)
      : null;

  /* Fill the form when the row arrives, and only then — keyed on the id so a
     refetch does not undo a keystroke. */
  const filled = useRef<string | null>(null);
  useEffect(() => {
    if (!existing || filled.current === existing.id) return;
    filled.current = existing.id;

    setBadge(existing.discount_text ?? '');
    setTitle(existing.copy?.title ?? '');
    setDesc(existing.copy?.description ?? '');
    if (existing.valid_from) setFrom(existing.valid_from.slice(0, 10));
    if (existing.valid_to) setTo(existing.valid_to.slice(0, 10));

    /* The stored set is the server's day names; an absent set is every day. */
    const stored = (existing.target_weekdays ?? '')
      .split(',')
      .map((day: string) => day.trim().toLowerCase())
      .filter(Boolean);
    const order = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    setDays(stored.length === 0 ? order.map(() => true) : order.map((d) => stored.includes(d)));

    if (existing.target_from_min !== null) setHourFrom(clockOf(existing.target_from_min));
    if (existing.target_to_min !== null) setHourTo(clockOf(existing.target_to_min));

    if (existing.cap_claims) {
      setStop(1);
      setStopClaims(existing.cap_claims);
    }
  }, [existing]);

  /*
   * The notification quota — real and reachable. With no session and no demo
   * there is no quota, and the switch is disabled for that reason rather than for
   * "you have used them all", which is a different sentence and a different fix.
   */
  const quotaApi = usePartnerPushQuota(liveId);
  const quota = readyOr(quotaApi.state, DEMO_MODE ? DEMO_QUOTA : null);
  const quotaOut = quota !== null && quota.remaining === 0;
  const quotaUnknown = quota === null;

  /*
   * Filing the deal: the form's state and the endpoint's body are two shapes,
   * and the translation is stated here so the two buttons cannot drift.
   * Weekdays go straight across (both Monday-first) and all seven is sent as
   * none; the "Russian speakers" option is a language, not a segment; the spend
   * cap goes from the reader's currency through the euro to the venue's minor
   * units.
   */
  const asDraft = (): DealDraft => ({
    copy: { [language]: { title: title.trim(), description: desc.trim() } },
    discountText: badge.trim(),
    category: DEAL_KINDS[kind],
    validFrom: from,
    validTo: to,
    targetWeekdays: days.every(Boolean) ? [] : days.flatMap((on, index) => (on ? [index] : [])),
    targetFromMin: minutesOf(hourFrom),
    targetToMin: minutesOf(hourTo),
    targetLanguages: segment === null ? ['ru'] : [],
    targetAudience: segment !== null && segment !== 'all' ? [segment] : [],
    ...(stop === 1 ? { capClaims: stopClaims } : {}),
    ...(stop === 2
      ? { capSpendMinor: euroToMinor(stopMoney / currency.rate, venue?.currency ?? 'EUR') }
      : {}),
  });

  submit.current = async (andPublish: boolean) => {
    if (venue === null) {
      /* No venue on the server for this device, so there is nowhere to file
         it — saying that is the whole point. */
      toast(copy.needsSession);
      return;
    }

    /*
     * Editing is a different verb and a different ending: `PATCH` sends only the
     * fields this form owns and never touches the deal's status, so saving an
     * edit cannot put a paused deal back in front of customers.
     */
    if (editing && dealId) {
      try {
        await updateDeal(dealId, {
          discountText: badge.trim(),
          validFrom: from,
          validTo: to,
          copy: { [language]: { title: title.trim(), description: desc.trim() } },
          ...(stop === 1 ? { capClaims: stopClaims } : {}),
          ...(stop === 2
            ? { capSpendMinor: euroToMinor(stopMoney / currency.rate, venue.currency) }
            : {}),
        });
      } catch (cause) {
        toast(filingFailure(cause, dashboard));
        return;
      }
      toast(copy.saved);
      refresh();
      closeDrawer();
      return;
    }

    let created;
    try {
      created = await createDeal(venue.id, asDraft());
    } catch (cause) {
      toast(filingFailure(cause, dashboard));
      return;
    }

    if (!andPublish) {
      /* A draft carries no push: a notification about an offer that is not in
         the feed sends people to nothing. */
      toast(notify ? copy.savedNoPush : copy.saved);
      refresh();
      closeDrawer();
      return;
    }

    try {
      await publishDeal(created.id);
      /* The push is a third call and its own ending: "published, and nobody was
         told" is a state the owner can act on from the Hot deals screen. */
      if (notify) {
        try {
          await scheduleDealPush(
            created.id,
            venueInstant(notifyDate, notifyTime, venue.timezone ?? 'Europe/Warsaw'),
          );
          toast(fill(copy.publishedNotified, { at: notifyTime }));
        } catch (cause) {
          toast(
            fill(copy.publishedNoPush, {
              why: cause instanceof Error ? cause.message : String(cause),
            }),
          );
        }
      } else {
        toast(copy.published);
      }
    } catch (cause) {
      /* **The deal exists either way**, and every ending on this path says the
         draft is there — only the reason it is not live changes. */
      const why = cause instanceof ApiError ? cause.code : '';
      toast(
        why === 'not_verified'
          ? copy.savedUnverified
          : why === 'entitlement_required'
            ? copy.savedPlanFull
            : cause instanceof ApiError && cause.status === 0
              ? copy.savedNotLive
              : fill(copy.savedNotLiveWhy, {
                  why: cause instanceof Error ? cause.message : String(cause),
                }),
      );
    }
    refresh();
    closeDrawer();
  };

  const dayNames = dashboard.customers.days;
  const whenDays = days.every(Boolean)
    ? copy.everyDay
    : days.some(Boolean)
      ? days.map((on, i) => (on ? dayNames[i] : null)).filter(Boolean).join('–')
      : copy.noDays;

  /* Two problems the footer counts: a deal with no words, and a window that
     runs backwards. */
  const copyMissing = !title.trim() || !desc.trim();
  const windowBad = to < from;
  useEffect(() => {
    onValid((copyMissing ? 1 : 0) + (windowBad ? 1 : 0));
  }, [copyMissing, windowBad, onValid]);

  /* What the audience line says when there is no pair of figures to draw. */
  const audienceNote =
    segment === null
      ? copy.reachLanguage
      : audiencesApi.state.status === 'loading'
        ? dashboard.unmeasured.asking
        : audiencesApi.state.status === 'error' && isNoSession(audiencesApi.state.error) && !DEMO_MODE
          ? dashboard.unmeasured.noSession
          : dashboard.unmeasured.audience;

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
              aria-pressed={days[index]}
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
              aria-pressed={audience === index}
              data-on={audience === index ? 'true' : undefined}
              onClick={() => setAudience(index)}
            >
              <b>{name}</b>
              <span>{dealCopy.audienceNotes[index]}</span>
            </button>
          ))}
        </div>
        {sized === null ? (
          <p className="pd-brief">{audienceNote}</p>
        ) : (
          <div className="pd-brief pd-audience">
            <span>
              <Figure metric={sized.reach} format={num} />
              {copy.reachLabel}
            </span>
            <span>
              <Figure metric={sized.notifiable} format={num} />
              {copy.notifiableLabel}
            </span>
          </div>
        )}
      </Block>

      <Block title={copy.notifyTitle}>
        <div className="pd-switch-row">
          <div>
            <b>{copy.notifySwitch}</b>
            <span className="pd-fine">
              {quota === null
                ? dashboard.unmeasured.quota
                : fill(copy.notifyQuota, {
                    n: num(quota.remaining),
                    total: num(quota.quota),
                  })}
            </span>
          </div>
          {/* A real checkbox under a drawn track: the label, the keyboard and the
              focus ring come free. */}
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
            <b>{fill(copy.notifyOutTitle, { total: num(quota?.quota ?? 0) })}</b>
            <p>{copy.notifyOutBody}</p>
            <a className="btn btn-ghost" href={PLANS_ANCHOR}>
              {copy.notifyPlan}
            </a>
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
            </div>
            <p className="pd-fine">{copy.quietNote}</p>

            <span className="field-label">{copy.notifyWho}</span>
            <div className="pd-switch-row">
              <div>
                <b>{dealCopy.audiences[audience]}</b>
                <span className="pd-fine">
                  {reachValue !== null && notifiableValue !== null
                    ? fill(copy.notifyReach, { n: num(notifiableValue), total: num(reachValue) })
                    : sized !== null
                      ? dashboard.unmeasured.withheld
                      : audienceNote}
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

            {/* The lock screen — the one place the dashboard draws the
                customer's phone, because a notification arrives uninvited. */}
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
              aria-pressed={stop === index}
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
              <em>{account?.business?.name || venue?.name || account?.name}</em>
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
              ? fill(copy.previewLimitClaims, { n: num(stopClaims) })
              : fill(copy.previewLimitMoney, {
                  amount: money(stopMoney / currency.rate, 'exact'),
                })}
        </p>
      </Block>
    </>
  );
}

/* ─────────────────────────────────────────────────────────── the campaign ── */

function CampaignBody({
  onValid,
  submit,
  campaignId,
  prefill,
}: {
  onValid: (problems: number) => void;
  submit: MutableRefObject<((publish: boolean) => Promise<void>) | null>;
  /* Set in edit mode: the campaign whose row fills the form. */
  campaignId?: string;
  prefill?: DrawerPrefill['campaign'];
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.drawer.campaign;
  const dealCopy = dashboard.drawer.deal;
  const currency = useCurrency();
  const money = useMoney();
  const num = useNum();
  const { toast, closeDrawer, refresh } = useDashboard();
  const venueApi = usePartnerVenue();
  const venue = venueApi.state.status === 'ready' ? venueApi.state.data : null;
  /* The currency prefilled money and the edited row are counted in. Under the
     demo it is the demo venue's, so the edit form can be looked at. */
  const venueCurrency = venue?.currency ?? (DEMO_MODE ? DEMO_VENUE.currency : null);

  const [name, setName] = useState(prefill?.name ?? '');
  const [visits, setVisits] = useState(prefill?.visitsRequired ?? 4);
  const [rewardKind, setRewardKind] = useState(0);
  const [rewardItem, setRewardItem] = useState(prefill?.rewardLabel ?? '');
  const [rewardAmount, setRewardAmount] = useState(10);
  /* Held in the reader's currency, like every other typed amount here. */
  const [cost, setCost] = useState(() =>
    Math.max(1, Math.round((5 / FX.PLN.rate) * currency.rate)),
  );
  const [project, setProject] = useState(40);
  const [priority, setPriority] = useState(1);
  const [expiry, setExpiry] = useState(prefill?.rewardValidDays ?? 60);
  const [minSpend, setMinSpend] = useState(15);
  /*
   * Two fields an edit sends only when they were touched.
   *
   * The server's priority runs 0–100 and this control offers 1–5, so a campaign
   * at priority 20 opens with nothing selected — and must not be quietly moved
   * to 1 by a save that was about its name. And a campaign with no minimum of
   * its own uses the venue's: a well cannot show "no value", and saving the
   * well's placeholder would set a floor the owner never chose.
   */
  const [priorityTouched, setPriorityTouched] = useState(false);
  const [minSpendTouched, setMinSpendTouched] = useState(false);
  const [usesVenueMinimum, setUsesVenueMinimum] = useState(false);

  const editing = campaignId !== undefined;
  const campaignsApi = usePartnerCampaigns(editing ? (venue?.id ?? null) : null);
  const existing = editing
    ? (readyOr(campaignsApi.state, DEMO_MODE ? DEMO_CAMPAIGNS : null)?.find((row) => row.id === campaignId) ?? null)
    : null;

  /*
   * Fill once, when the currency is known.
   *
   * Both the edited row and a draft carry money in the venue's minor units, and
   * converting them before the venue row arrives would convert them from the
   * wrong currency. The ref makes "the list refetched" and "the form was opened
   * on something" different events, so a refetch never undoes a keystroke.
   */
  const filled = useRef<string | null>(null);
  const rate = currency.rate;
  useEffect(() => {
    if (venueCurrency === null) return;
    const toReader = (minor: number) =>
      Math.round(minorToEuro(minor, venueCurrency) * rate * 100) / 100;

    if (editing) {
      if (!existing || filled.current === existing.id) return;
      filled.current = existing.id;
      setName(existing.name);
      setVisits(existing.visits_required);
      setRewardKind(0);
      setRewardItem(existing.reward_label);
      setCost(toReader(existing.reward_cost_minor));
      setPriority(existing.priority);
      setExpiry(existing.reward_valid_days);
      if (existing.min_spend_minor === null) setUsesVenueMinimum(true);
      else setMinSpend(toReader(existing.min_spend_minor));
      return;
    }

    if (!prefill || filled.current === 'prefill') return;
    filled.current = 'prefill';
    if (prefill.rewardCostMinor !== undefined) setCost(toReader(prefill.rewardCostMinor));
    if (prefill.minSpendMinor !== undefined) setMinSpend(toReader(prefill.minSpendMinor));
  }, [editing, existing, prefill, venueCurrency, rate]);

  const rewardMissing = rewardKind === 0 && !rewardItem.trim();
  const nameMissing = !name.trim();
  /* A reward with no cost reserves nothing, and the pool stops meaning anything
     — `validateCampaign` refuses it, and saying so here is cheaper. */
  const costMissing = !(cost > 0);
  useEffect(() => {
    onValid((nameMissing ? 1 : 0) + (rewardMissing ? 1 : 0) + (costMissing ? 1 : 0));
  }, [nameMissing, rewardMissing, costMissing, onValid]);

  const reward =
    rewardKind === 0
      ? rewardItem.trim() || copy.summaryReward
      : `${money(rewardAmount / currency.rate, 'unit')} ${copy.rewardOff}`;

  const asDraft = (target: string): CampaignDraft => ({
    name: name.trim(),
    visitsRequired: visits,
    rewardLabel: reward,
    rewardCostMinor: euroToMinor(cost / currency.rate, target),
    priority,
    minSpendMinor: euroToMinor(minSpend / currency.rate, target),
    rewardValidDays: expiry,
  });

  submit.current = async () => {
    if (venue === null) {
      toast(dealCopy.needsSession);
      return;
    }

    if (editing && campaignId) {
      /* Only what this form owns, and the two touch-gated fields only when
         touched. Rewards already earned keep what they were reserved at. */
      const patch: CampaignPatch = {
        name: name.trim(),
        visitsRequired: visits,
        rewardLabel: reward,
        rewardCostMinor: euroToMinor(cost / currency.rate, venue.currency),
        rewardValidDays: expiry,
        ...(priorityTouched ? { priority } : {}),
        ...(minSpendTouched
          ? { minSpendMinor: euroToMinor(minSpend / currency.rate, venue.currency) }
          : {}),
      };
      try {
        await updateCampaign(campaignId, patch);
      } catch (cause) {
        toast(filingFailure(cause, dashboard));
        return;
      }
      toast(copy.saved);
      refresh();
      closeDrawer();
      return;
    }

    try {
      await createCampaign(venue.id, asDraft(venue.currency));
      /* One call, one ending: a campaign is inserted `active`. */
      toast(copy.started);
    } catch (cause) {
      toast(filingFailure(cause, dashboard));
      return;
    }
    refresh();
    closeDrawer();
  };

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
            onChange={(n) => setVisits(Math.max(1, Math.min(50, n)))}
            unit={copy.visits}
            label={copy.visitsTitle}
          />
          <button type="button" aria-label={copy.visitsPlus} onClick={() => setVisits((n) => Math.min(50, n + 1))}>
            +
          </button>
        </div>
        <p className="pd-fine">{fill(copy.visitsHelp, { n: num(visits) })}</p>
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
        {costMissing ? (
          <span className="field-error" role="alert">
            {copy.costError}
          </span>
        ) : null}
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
              n: num(project),
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
              aria-pressed={priority === n}
              data-on={priority === n ? 'true' : undefined}
              onClick={() => {
                setPriority(n);
                setPriorityTouched(true);
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="pd-fine">{fill(copy.priorityHelp, { n: num(priority) })}</p>
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
              onChange={(next) => {
                setMinSpend(next);
                setMinSpendTouched(true);
                setUsesVenueMinimum(false);
              }}
              unit={currency.symbol}
              label={copy.minSpend}
              wide
            />
            <span className="field-help">
              {editing && usesVenueMinimum ? copy.minSpendVenue : copy.minSpendNote}
            </span>
          </label>
        </div>
      </Block>

      {/* The whole form said back in one sentence — the most useful thing on
          the panel for an owner who cannot read the fields. */}
      <div className="pd-summary" data-ink="paper">
        <span className="console-label">{copy.summaryTitle}</span>
        <b>
          {fill(copy.summary, {
            visits: num(visits),
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

export function DashboardDrawer({
  kind,
  dealId,
  campaignId,
  prefill,
}: {
  kind: DrawerKind;
  /** Set when the drawer was opened on an existing deal. */
  dealId?: string;
  /** Set when the drawer was opened on an existing campaign — edit mode. */
  campaignId?: string;
  /** Starting values for a new deal or campaign. */
  prefill?: DrawerPrefill;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.drawer;
  const { closeDrawer } = useDashboard();
  const [problems, setProblems] = useState(0);
  const [filing, setFiling] = useState(false);
  const panel = useRef<HTMLElement>(null);
  /* Set by whichever body is mounted, during its render. */
  const submit = useRef<((publish: boolean) => Promise<void>) | null>(null);

  /* One press, whichever button. Locked while it is in flight: a second press
     files a second deal. */
  const press = async (publish: boolean) => {
    if (filing || !submit.current) return;
    setFiling(true);
    try {
      await submit.current(publish);
    } finally {
      setFiling(false);
    }
  };

  const body = kind === 'deal' ? copy.deal : copy.campaign;
  const editing = kind === 'deal' ? dealId !== undefined : campaignId !== undefined;

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

  const heading = editing ? (kind === 'deal' ? copy.editDeal : copy.editCampaign) : body.title;

  return (
    <div className="pd-sheet" role="dialog" aria-modal="true" aria-label={heading}>
      <button type="button" className="pd-scrim" aria-label={copy.close} onClick={closeDrawer} />
      <section className="pd-drawer-panel" ref={panel} tabIndex={-1}>
        <header>
          <div>
            <span className="console-label">{editing ? body.editKicker : body.kicker}</span>
            {/* One panel, two jobs, and the heading is what says which. */}
            <h2>{heading}</h2>
            <p className="pd-fine">{body.sub}</p>
          </div>
          <button type="button" className="pd-icon" aria-label={copy.close} onClick={closeDrawer}>
            <Icon name="close" size={15} strokeWidth={2} />
          </button>
        </header>

        <div className="pd-drawer-body">
          {kind === 'deal' ? (
            <DealBody onValid={setProblems} submit={submit} dealId={dealId} prefill={prefill?.deal} />
          ) : (
            <CampaignBody
              onValid={setProblems}
              submit={submit}
              campaignId={campaignId}
              prefill={prefill?.campaign}
            />
          )}
        </div>

        <footer>
          {validNote && <p className="field-error">{validNote}</p>}
          <div className="pd-drawer-acts">
            <button type="button" className="btn btn-ghost" onClick={closeDrawer}>
              {copy.cancel}
            </button>
            {/* Only a new deal can be saved and finished later: only a deal has
                a draft state, and an edit has nothing to put off. */}
            {kind === 'deal' && !editing && (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={filing}
                onClick={() => void press(false)}
              >
                {copy.later}
              </button>
            )}
            <button
              type="button"
              className="btn btn-solid"
              disabled={problems > 0 || filing}
              onClick={() => void press(true)}
            >
              {filing
                ? copy.deal.filing
                : editing
                  ? kind === 'campaign'
                    ? copy.campaign.save
                    : dashboard.acts.save
                  : body.publish}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────── toast ── */

/**
 * The confirmation strip. Clears itself after four seconds and announces
 * politely: it confirms a press the user just made.
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
