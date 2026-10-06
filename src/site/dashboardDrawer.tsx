import { useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
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
  venueInstant,
  type CampaignDraft,
  type CampaignPatch,
  type DealDraft,
  type DealPatch,
} from './api/partner';
import { ApiError } from './api/client';
import { DEAL_KINDS } from './content';
import { FX } from './i18n/fx';
import { DEMO_AUDIENCES, DEMO_CAMPAIGNS, DEMO_DEALS, DEMO_QUOTA, DEMO_VENUE } from './dashboardDemo';
import {
  clockOf,
  dayLabel,
  daysBetween,
  daysFromRow,
  localDay,
  minutesOf,
  pickOf,
  PICK_SEGMENTS,
  resetDate,
  weekdaysOf,
} from './dashboardDealsModel';
import { useNum } from './dashboardFormat';
import { Button, Drawer, Eyebrow, Field, Input, Segmented, Textarea, Toggle, UnitField } from './dashboardKit';
import { useDashboard } from './dashboardShell';
import type { DrawerKind, DrawerPrefill } from './dashboardShell';
import { DEMO_MODE } from './demoMode';
import './dashboard-drawer.css';

/**
 * The create panel — one drawer, two bodies (v3 §5.2 and §5.3), and an edit
 * mode for each.
 *
 * Every "Create hot deal" and "Create campaign" button lands here, from six
 * places. One component rather than two because the header, the footer, the
 * validation strip, the escape key and the slide-in are the same for both —
 * and they are the kit's `Drawer` now; this file owns only the two forms.
 *
 * **Both bodies write.** A deal goes to `POST /v1/partner/venues/:id/deals` and
 * then the publish endpoint; its push to `POST /v1/partner/deals/:id/push`; a
 * campaign to `POST /v1/partner/venues/:id/campaigns`. Opened on an existing row
 * they write through `PATCH` instead — `/v1/partner/deals/:id` or
 * `/v1/partner/campaigns/:id` — which sends only the fields the form owns, so a
 * rule set somewhere else survives the save.
 *
 * **It can be opened with a draft** (`DrawerPrefill`), which is how the
 * assistant, the empty campaign screen and the deals table's "Copy" hand an
 * owner to the ordinary form rather than filing anything themselves.
 * Prefilled money arrives in the venue's minor units and is converted to the
 * reader's currency once the venue row says what those units are.
 *
 * Five things about it are load-bearing:
 *
 * - **The deal's two buttons are two calls because they are two decisions.** A
 *   deal is created as a draft and published by a second request; the owner is
 *   told which half happened.
 * - **A push is scheduled only on publish, and against the venue's clock** —
 *   the server refuses a send outside 07:00–21:00 *venue-local*.
 * - **Every money control holds the reader's currency, not euros**, and goes
 *   back through the rate at the point a request needs the venue's minor units.
 * - **The audience figures are the server's, and nothing else is.** v3 offers
 *   "Send at 07:30 — most of this audience opens Paylez then"; nothing measures
 *   when an audience opens the app, so that button and sentence are not drawn.
 * - **The notification has no words of its own.** v3 has a "What it says"
 *   field; the server sends the deal's own title and description and has no
 *   column for anything else, so the lock-screen preview draws exactly those
 *   and says so, rather than taking text it would throw away.
 *
 * And one v3 section is absent: "Which branch runs this". A venue here is one
 * place — an owner with several moves between them with the top bar's switcher.
 */

/* ────────────────────────────────────────────────────────────── controls ── */

/** One numbered section of a form: v3's 11px faint label over its controls. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="dx-dform-sec">
      <span className="dx-dform-label">{title}</span>
      {children}
    </section>
  );
}

/**
 * A number in v3's unit field, held as the text being typed.
 *
 * The form keeps numbers, but a field bound straight to a number cannot be
 * emptied on the way to typing a new one — clearing "15" would snap to "0". So
 * the text is local, the number is reported as it parses, and the text follows
 * the number only when the number moves from outside (a fill from the server).
 */
function NumField({
  value,
  onChange,
  unit,
  label,
  min = 0,
  max,
  step,
  invalid,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  unit: ReactNode;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  invalid?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (Number(text) !== value) setText(String(value));
  }
  return (
    <span className={className}>
      <UnitField
        unit={unit}
        aria-label={label}
        value={text}
        min={min}
        max={max}
        step={step}
        invalid={invalid}
        onChange={(event) => {
          setText(event.target.value);
          const parsed = Number(event.target.value);
          if (event.target.value !== '' && Number.isFinite(parsed)) {
            const next = Math.max(min, max === undefined ? parsed : Math.min(max, parsed));
            setSeen(next);
            onChange(next);
          }
        }}
      />
    </span>
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

/**
 * Where the plans are written down — the *anchor* form, because `routeOf` looks
 * a hash starting with `#/` up verbatim and a compound form misses the table.
 */
const PLANS_ANCHOR = '#business-pricing';

/** The four kinds in v3's order; the values are `DEAL_KINDS` indexes, which is what the server stores. */
const KIND_ORDER = [0, 2, 1, 3] as const;

/** A drafted badge with a percentage in it is a percentage; another drafted badge is a free item. */
const kindOfBadge = (badge: string | undefined): number =>
  badge === undefined || /%/.test(badge) ? 0 : 1;

/* ─────────────────────────────────────────────────────────────── the deal ── */

interface BodyProps {
  /** The footer's sentence when the primary press is not allowed, or null. */
  onValid: (invalid: string | null) => void;
  /* How the footer reaches the form. The buttons live on the frame, so the body
     hands its filing function up the same way it hands up its validity. */
  submit: MutableRefObject<((publish: boolean) => Promise<void>) | null>;
}

function DealBody({
  onValid,
  submit,
  dealId,
  prefill,
}: BodyProps & {
  /* The deal being edited, or undefined when this is a new one. */
  dealId?: string;
  /* Starting values for a new deal. */
  prefill?: DrawerPrefill['deal'];
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.drawer.deal;
  const v3 = dashboard.deals.form;
  const dealCopy = dashboard.deals;
  const currency = useCurrency();
  const money = useMoney();
  const num = useNum();
  const { account } = useAuth();
  const { toast, closeDrawer, refresh, venueId, venue: chosen } = useDashboard();
  const [language] = useLanguage();
  const venue = chosen ?? (DEMO_MODE ? DEMO_VENUE : null);

  const [title, setTitle] = useState(prefill?.title ?? '');
  const [desc, setDesc] = useState(prefill?.description ?? '');
  const [terms, setTerms] = useState('');
  const [kind, setKind] = useState(() => kindOfBadge(prefill?.discountText));
  const [badge, setBadge] = useState(prefill?.discountText ?? '');
  const [from, setFrom] = useState(() => prefill?.validFrom?.slice(0, 10) ?? localDay(0));
  const [to, setTo] = useState(() => prefill?.validTo?.slice(0, 10) ?? localDay(28));
  /*
   * Monday-first, matching `copy.dashboard.customers.days`.
   *
   * **Every day, all day, unless the owner narrows it.** These once defaulted to
   * a mock's Tuesday and Wednesday, 14:00–16:00 — values that read as an example
   * in the drawer and behaved as a rule once filed, so a deal created without
   * touching this block was live four hours a week and nothing on the screen
   * said why. A restriction nobody chose is not targeting.
   */
  const [days, setDays] = useState<boolean[]>(() =>
    prefill?.targetWeekdays && prefill.targetWeekdays.length > 0
      ? Array.from({ length: 7 }, (_, index) => prefill.targetWeekdays!.includes(index))
      : Array.from({ length: 7 }, () => true),
  );
  const [hourFrom, setHourFrom] = useState(() =>
    prefill?.targetFromMin !== undefined ? clockOf(prefill.targetFromMin) : '00:00',
  );
  const [hourTo, setHourTo] = useState(() =>
    prefill?.targetToMin !== undefined ? clockOf(prefill.targetToMin) : '23:59',
  );
  const [audience, setAudience] = useState(0);
  const [notify, setNotify] = useState(false);
  const [notifyDate, setNotifyDate] = useState(() => prefill?.validFrom?.slice(0, 10) ?? localDay(0));
  const [notifyTime, setNotifyTime] = useState('09:00');
  const [stop, setStop] = useState(prefill?.capClaims ? 1 : 0);
  const [stopClaims, setStopClaims] = useState(prefill?.capClaims ?? 200);
  const [stopMoney, setStopMoney] = useState(400);

  /*
   * How big the chosen audience is, from `GET …/audiences`. Both figures are
   * about people and take the min-cohort floor, so a withheld one is said in
   * words, never drawn as 0.
   */
  const audiencesApi = usePartnerAudiences(venueId);
  const audiences = readyOr(audiencesApi.state, DEMO_MODE ? DEMO_AUDIENCES : null);
  const segment = PICK_SEGMENTS[audience] ?? null;
  const sized = segment === null ? null : (audiences?.find((row) => row.segment === segment) ?? null);
  const reach = sized ? metricValue(sized.reach) : null;
  const notifiable = sized ? metricValue(sized.notifiable) : null;

  /*
   * The deal being edited, off the same request the table drew — `useApi` keeps
   * no cache, so this is a second read of the list, which is the price of
   * filling the form from what the server holds rather than from a copy.
   */
  const editing = dealId !== undefined;
  const dealsApi = usePartnerDeals(editing ? venueId : null);
  const existing = editing
    ? (readyOr(dealsApi.state, DEMO_MODE ? DEMO_DEALS : null)?.find((row) => row.id === dealId) ?? null)
    : null;

  /* Fill the form when the row arrives, and only then — keyed on the id so a
     refetch does not undo a keystroke. */
  const filled = useRef<string | null>(null);
  const rate = currency.rate;
  useEffect(() => {
    if (!existing || filled.current === existing.id) return;
    filled.current = existing.id;
    setBadge(existing.discount_text ?? '');
    setTitle(existing.copy?.title ?? '');
    setDesc(existing.copy?.description ?? '');
    setTerms(existing.copy?.terms ?? '');
    const stored = existing.category ? DEAL_KINDS.indexOf(existing.category as (typeof DEAL_KINDS)[number]) : -1;
    setKind(stored >= 0 ? stored : kindOfBadge(existing.discount_text ?? undefined));
    if (existing.valid_from) setFrom(existing.valid_from.slice(0, 10));
    if (existing.valid_to) setTo(existing.valid_to.slice(0, 10));
    setDays(daysFromRow(existing.target_weekdays));
    if (existing.target_from_min !== null) setHourFrom(clockOf(existing.target_from_min));
    if (existing.target_to_min !== null) setHourTo(clockOf(existing.target_to_min));
    const pick = pickOf(existing.target_audience, existing.target_languages);
    if (pick >= 0) setAudience(pick);
    if (existing.cap_claims) {
      setStop(1);
      setStopClaims(existing.cap_claims);
    } else if (existing.funnel.capSpendMinor) {
      setStop(2);
      setStopMoney(Math.round(minorToEuro(existing.funnel.capSpendMinor, venue?.currency ?? 'EUR') * rate));
    }
  }, [existing, venue?.currency, rate]);

  /*
   * The notification quota. With no session and no demo there is no quota, and
   * the switch is disabled for that reason rather than for "you have used them
   * all", which is a different sentence and a different fix. An existing deal
   * that already carries its one push cannot take another.
   */
  const quotaApi = usePartnerPushQuota(venueId);
  const quota = readyOr(quotaApi.state, DEMO_MODE ? DEMO_QUOTA : null);
  const quotaOut = quota !== null && quota.remaining === 0;
  const hasPush = existing?.push != null;
  const canNotify = quota !== null && !quotaOut && !hasPush;
  const reset = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
        resetDate(quota?.period),
      );
    } catch {
      return '';
    }
  }, [language, quota?.period]);

  /* The whole day, however it was reached — 1439 is 23:59, the last minute a
     time input offers. A window covering the whole day is *no* window, sent as
     absent: a stored one makes `claimableNow` compare the clock on every read. */
  const fullDay = minutesOf(hourFrom) === 0 && minutesOf(hourTo) >= 1439;
  const targeting = {
    targetWeekdays: weekdaysOf(days),
    ...(fullDay ? {} : { targetFromMin: minutesOf(hourFrom), targetToMin: minutesOf(hourTo) }),
    targetLanguages: segment === null ? ['ru'] : [],
    targetAudience: segment !== null && segment !== 'all' ? [segment] : [],
  };
  const caps = {
    ...(stop === 1 ? { capClaims: stopClaims } : {}),
    ...(stop === 2 ? { capSpendMinor: euroToMinor(stopMoney / currency.rate, venue?.currency ?? 'EUR') } : {}),
  };
  const words = { [language]: { title: title.trim(), description: desc.trim(), terms: terms.trim() } };

  const asDraft = (): DealDraft => ({
    copy: words,
    discountText: badge.trim(),
    category: DEAL_KINDS[kind],
    validFrom: from,
    validTo: to,
    ...targeting,
    ...caps,
  });

  /* The push is a third call and its own ending: "published, and nobody was
     told" is a state the owner can act on from the Hot deals screen. */
  const schedulePush = async (id: string): Promise<string | null> => {
    if (!notify || !canNotify) return null;
    try {
      await scheduleDealPush(id, venueInstant(notifyDate, notifyTime, venue?.timezone ?? 'Europe/Warsaw'));
      return fill(copy.publishedNotified, { at: notifyTime });
    } catch (cause) {
      return fill(copy.publishedNoPush, { why: cause instanceof Error ? cause.message : String(cause) });
    }
  };

  submit.current = async (andPublish: boolean) => {
    if (venueId === null) {
      /* No venue on the server for this device, so there is nowhere to file
         it — saying that is the whole point. */
      toast(copy.needsSession);
      return;
    }

    /*
     * Editing is a different verb and a different ending: `PATCH` sends only
     * the fields this form owns and never touches the deal's status, so saving
     * an edit cannot put a paused deal back in front of customers.
     */
    if (editing && dealId) {
      const patch: DealPatch = {
        discountText: badge.trim(),
        validFrom: from,
        validTo: to,
        copy: words,
        ...targeting,
        ...caps,
      };
      try {
        await updateDeal(dealId, patch);
      } catch (cause) {
        toast(filingFailure(cause, dashboard));
        return;
      }
      const live = existing?.status === 'live' || existing?.status === 'scheduled';
      toast((live ? await schedulePush(dealId) : null) ?? copy.saved);
      refresh();
      closeDrawer();
      return;
    }

    let created;
    try {
      created = await createDeal(venueId, asDraft());
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
      toast((await schedulePush(created.id)) ?? copy.published);
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
              : fill(copy.savedNotLiveWhy, { why: cause instanceof Error ? cause.message : String(cause) }),
      );
    }
    refresh();
    closeDrawer();
  };

  const dayNames = dashboard.customers.days;
  const whenDays = dayLabel(days, dayNames, copy.everyDay, copy.noDays);
  const span = from && to ? daysBetween(from, to) : null;
  const windowBad = Boolean(from && to) && span === null;
  const dateOf = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
        new Date(`${iso}T00:00:00Z`),
      );
    } catch {
      return iso;
    }
  };

  /* v3's rule for the primary press: a title, a badge, and dates that make a
     window. The description is welcome and not required. */
  const titleMissing = !title.trim();
  const invalid = titleMissing || !badge.trim() ? v3.invalidCopy : !from || !to || windowBad ? v3.invalidDates : null;
  useEffect(() => {
    onValid(invalid);
  }, [invalid, onValid]);

  /* What the audience line says when there is no pair of figures to draw. */
  const audienceNote =
    segment === null
      ? copy.reachLanguage
      : audiencesApi.state.status === 'loading'
        ? dashboard.unmeasured.asking
        : sized !== null
          ? dashboard.unmeasured.withheld
          : audiencesApi.state.status === 'error' && isNoSession(audiencesApi.state.error) && !DEMO_MODE
            ? dashboard.unmeasured.noSession
            : dashboard.unmeasured.audience;
  const thin = reach !== null && notifiable !== null && reach > 0 ? Math.round((notifiable / reach) * 100) : null;
  const bizName = venue?.name || account?.business?.name || account?.name || '';
  const lockDay = (() => {
    try {
      return new Intl.DateTimeFormat(language, { weekday: 'long', timeZone: 'UTC' }).format(
        new Date(`${notifyDate}T00:00:00Z`),
      );
    } catch {
      return '';
    }
  })();

  return (
    <div className="dx-sections dx-dform">
      <Section title={copy.copyTitle}>
        <Field label={copy.titleLabel} error={titleMissing ? v3.titleError : undefined}>
          <Input
            value={title}
            invalid={titleMissing}
            placeholder={copy.titlePlaceholder}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field label={copy.descLabel} help={copy.translateNote}>
          <Textarea
            rows={3}
            value={desc}
            placeholder={copy.descPlaceholder}
            onChange={(event) => setDesc(event.target.value)}
          />
        </Field>
      </Section>

      <Section title={copy.kindTitle}>
        <Segmented
          label={copy.kindTitle}
          value={String(kind)}
          onChange={(next) => setKind(Number(next))}
          options={KIND_ORDER.map((index) => ({ value: String(index), label: copy.kinds[index] }))}
        />
      </Section>

      <Section title={copy.discountTitle}>
        <div className="dx-dform-badge">
          <Field label={copy.badgeLabel} help={copy.badgeNote}>
            <Input
              value={badge}
              maxLength={14}
              placeholder="20% OFF"
              onChange={(event) => setBadge(event.target.value)}
            />
          </Field>
        </div>
        <div className="dx-dform-pair">
          <Field label={copy.from}>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label={copy.to}>
            <Input type="date" value={to} invalid={windowBad} onChange={(event) => setTo(event.target.value)} />
          </Field>
        </div>
        <p className="dx-dform-window" data-bad={windowBad ? 'true' : undefined}>
          {windowBad
            ? v3.windowBad
            : span !== null
              ? fill(v3.windowDays, { n: num(span), from: dateOf(from), to: dateOf(to) })
              : v3.windowPick}
        </p>
      </Section>

      <Section title={copy.whenTitle}>
        <div className="dx-dform-chips">
          {dayNames.map((name, index) => (
            <button
              key={name}
              type="button"
              aria-pressed={days[index]}
              onClick={() => setDays((current) => current.map((on, i) => (i === index ? !on : on)))}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="dx-dform-hours">
          <Field label={copy.hourFrom}>
            <Input type="time" value={hourFrom} onChange={(event) => setHourFrom(event.target.value)} />
          </Field>
          <Field label={copy.hourTo}>
            <Input type="time" value={hourTo} onChange={(event) => setHourTo(event.target.value)} />
          </Field>
          <p>{fill(copy.whenNote, { days: whenDays, from: hourFrom, to: hourTo })}</p>
        </div>
      </Section>

      <Section title={copy.audienceTitle}>
        <div className="dx-dform-picks">
          {dealCopy.audiences.map((name, index) => (
            <button key={name} type="button" aria-pressed={audience === index} onClick={() => setAudience(index)}>
              <b>{name}</b>
              <span>{dealCopy.audienceNotes[index]}</span>
            </button>
          ))}
        </div>
        <p className="dx-dform-strip">
          {reach !== null && notifiable !== null
            ? fill(copy.audienceEstimate, { n: num(reach), notifiable: num(notifiable) })
            : audienceNote}
        </p>
      </Section>

      <Section title={copy.notifyTitle}>
        <div className="dx-dform-switch" data-off={canNotify ? undefined : 'true'}>
          <div>
            <b>{copy.notifySwitch}</b>
            <span>
              {hasPush
                ? existing?.push?.status === 'sent'
                  ? dealCopy.notify.sent
                  : dealCopy.notify.scheduled
                : quota === null
                ? dashboard.unmeasured.quota
                : quotaOut
                  ? fill(v3.quotaNone, { date: reset })
                  : fill(v3.quotaLeft, { n: num(quota.remaining), date: reset })}
            </span>
          </div>
          <Toggle
            checked={notify && canNotify}
            disabled={!canNotify}
            onChange={setNotify}
            label={<span className="visually-hidden">{copy.notifySwitch}</span>}
          />
        </div>

        {quotaOut && !hasPush && (
          <div className="dx-dform-out">
            <b>{fill(v3.outTitle, { total: num(quota?.quota ?? 0) })}</b>
            <p>{fill(v3.outBody, { date: reset })}</p>
            <a className="dx-btn" data-variant="small" href={PLANS_ANCHOR}>
              {v3.outPlan}
            </a>
          </div>
        )}

        {notify && canNotify && (
          <div className="dx-dform-notify">
            <span className="dx-field-label">{copy.notifyWhen}</span>
            <div className="dx-dform-when">
              <Input
                type="date"
                aria-label={copy.notifyWhen}
                value={notifyDate}
                onChange={(event) => setNotifyDate(event.target.value)}
              />
              <Input
                type="time"
                aria-label={copy.notifyWhen}
                value={notifyTime}
                onChange={(event) => setNotifyTime(event.target.value)}
              />
            </div>
            <p className="dx-dform-hint">{copy.quietNote}</p>

            <span className="dx-field-label">{copy.notifyWho}</span>
            <div className="dx-dform-who">
              <div>
                <b>{dealCopy.audiences[audience]}</b>
                <span>
                  {reach !== null && notifiable !== null
                    ? fill(v3.reachLine, { n: num(notifiable), total: num(reach) })
                    : audienceNote}
                </span>
              </div>
              <em>{copy.notifyWhoNote}</em>
            </div>
            {thin !== null && thin < 40 && <p className="dx-dform-thin">{fill(v3.reachThin, { pct: num(thin) })}</p>}

            <p className="dx-dform-hint">{v3.notifySays}</p>
            {/* The lock screen — the one place the dashboard draws the customer's
                phone, because a notification arrives uninvited. The words are
                what the server sends: the deal's title, then its description. */}
            <div className="dx-dform-lock">
              <span className="dx-dform-lock-day">{lockDay}</span>
              <span className="dx-dform-lock-time">{notifyTime}</span>
              <div className="dx-dform-lock-card">
                <div className="dx-dform-lock-head">
                  <i aria-hidden>p</i>
                  <span>{v3.lockApp}</span>
                  <em>{v3.lockNow}</em>
                </div>
                <b>{title.trim() || copy.previewUntitled}</b>
                <p>{desc.trim() || badge.trim() || copy.previewNoDesc}</p>
              </div>
            </div>
          </div>
        )}
      </Section>

      <Section title={copy.stopTitle}>
        <div className="dx-dform-radios">
          {v3.stopOptions.map((option, index) => (
            <button key={option.label} type="button" aria-pressed={stop === index} onClick={() => setStop(index)}>
              <i aria-hidden />
              <span>
                <b>{option.label}</b>
                <em>{option.note}</em>
              </span>
            </button>
          ))}
        </div>
        {stop === 1 && (
          <div className="dx-dform-short">
            <span className="dx-field-label">{copy.stopClaims}</span>
            <NumField value={stopClaims} onChange={setStopClaims} min={1} unit={copy.claims} label={copy.stopClaims} />
          </div>
        )}
        {stop === 2 && (
          <div className="dx-dform-short">
            <span className="dx-field-label">{copy.stopMoney}</span>
            <NumField value={stopMoney} onChange={setStopMoney} min={1} unit={currency.symbol} label={copy.stopMoney} />
          </div>
        )}
        <p className="dx-dform-hint">{copy.stopNote}</p>
      </Section>

      <Section title={copy.termsTitle}>
        <Textarea
          rows={4}
          value={terms}
          aria-label={copy.termsTitle}
          placeholder={copy.termsPlaceholder}
          onChange={(event) => setTerms(event.target.value)}
        />
      </Section>

      <Section title={copy.previewTitle}>
        <div className="dx-dform-phone">
          <span className="dx-dform-phone-notch" aria-hidden />
          <div className="dx-dform-phone-screen">
            <div className="dx-dform-phone-cover">
              <span>{badge.trim() || v3.previewBadge}</span>
            </div>
            <div className="dx-dform-phone-body">
              {bizName && <em>{bizName}</em>}
              <b>{title.trim() || copy.previewUntitled}</b>
              <p>{desc.trim() || copy.previewNoDesc}</p>
              <div className="dx-dform-phone-foot">
                <span>{windowBad || span === null ? v3.windowPick : `${dateOf(from)} – ${dateOf(to)}`}</span>
                <i>{copy.previewClaim}</i>
              </div>
            </div>
          </div>
        </div>
        <p className="dx-dform-caption">
          {whenDays}
          {fullDay ? '' : ` · ${hourFrom}–${hourTo}`} · {dealCopy.audiences[audience]}
        </p>
        <p className="dx-dform-caption">
          {stop === 0
            ? v3.limitNone
            : stop === 1
              ? fill(copy.previewLimitClaims, { n: num(stopClaims) })
              : fill(copy.previewLimitMoney, { amount: money(stopMoney / currency.rate, 'exact') })}
        </p>
      </Section>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── the campaign ── */

function CampaignBody({
  onValid,
  submit,
  campaignId,
  prefill,
}: BodyProps & {
  /* Set in edit mode: the campaign whose row fills the form. */
  campaignId?: string;
  prefill?: DrawerPrefill['campaign'];
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.drawer.campaign;
  const v3 = dashboard.campaigns.form;
  const dealCopy = dashboard.drawer.deal;
  const currency = useCurrency();
  const money = useMoney();
  const num = useNum();
  const { toast, closeDrawer, refresh, venueId, venue: chosen } = useDashboard();
  const venue = chosen ?? (DEMO_MODE ? DEMO_VENUE : null);
  /* The currency prefilled money and the edited row are counted in. Under the
     demo it is the demo venue's, so the edit form can be looked at. */
  const venueCurrency = venue?.currency ?? null;

  const [name, setName] = useState(prefill?.name ?? '');
  const [visits, setVisits] = useState(prefill?.visitsRequired ?? 4);
  const [rewardKind, setRewardKind] = useState<'item' | 'amount'>('item');
  const [rewardItem, setRewardItem] = useState(prefill?.rewardLabel ?? '');
  const [rewardAmount, setRewardAmount] = useState(10);
  /* Held in the reader's currency, like every other typed amount here. */
  const [cost, setCost] = useState(() => Math.max(1, Math.round((5 / FX.PLN.rate) * currency.rate)));
  const [project, setProject] = useState(40);
  const [priority, setPriority] = useState(1);
  const [expiry, setExpiry] = useState(prefill?.rewardValidDays ?? 60);
  const [minSpend, setMinSpend] = useState(15);
  /*
   * Two fields an edit sends only when they were touched. The server's priority
   * runs 0–100 and this control offers 1–5, so a campaign at priority 20 opens
   * with nothing selected — and must not be quietly moved to 1 by a save that
   * was about its name. A campaign with no minimum of its own uses the venue's,
   * and saving the field's placeholder would set a floor nobody chose.
   */
  const [priorityTouched, setPriorityTouched] = useState(false);
  const [minSpendTouched, setMinSpendTouched] = useState(false);
  const [usesVenueMinimum, setUsesVenueMinimum] = useState(false);

  const editing = campaignId !== undefined;
  const campaignsApi = usePartnerCampaigns(editing ? venueId : null);
  const existing = editing
    ? (readyOr(campaignsApi.state, DEMO_MODE ? DEMO_CAMPAIGNS : null)?.find((row) => row.id === campaignId) ?? null)
    : null;

  /*
   * Fill once, when the currency is known. Both the edited row and a draft carry
   * money in the venue's minor units, and converting them before the venue row
   * arrives would convert them from the wrong currency.
   */
  const filled = useRef<string | null>(null);
  const rate = currency.rate;
  useEffect(() => {
    if (venueCurrency === null) return;
    const toReader = (minor: number) => Math.round(minorToEuro(minor, venueCurrency) * rate * 100) / 100;

    if (editing) {
      if (!existing || filled.current === existing.id) return;
      filled.current = existing.id;
      setName(existing.name);
      setVisits(existing.visits_required);
      setRewardKind('item');
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

  const nameMissing = !name.trim();
  const rewardMissing = rewardKind === 'item' ? !rewardItem.trim() : !(rewardAmount > 0);
  /* A reward with no cost reserves nothing, and the pool stops meaning anything
     — `validateCampaign` refuses it, and saying so here is cheaper. */
  const costMissing = !(cost > 0);
  const invalid = nameMissing || rewardMissing || costMissing ? v3.invalid : null;
  useEffect(() => {
    onValid(invalid);
  }, [invalid, onValid]);

  const reward =
    rewardKind === 'item'
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
    if (venueId === null || venueCurrency === null) {
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
        rewardCostMinor: euroToMinor(cost / currency.rate, venueCurrency),
        rewardValidDays: expiry,
        ...(priorityTouched ? { priority } : {}),
        ...(minSpendTouched ? { minSpendMinor: euroToMinor(minSpend / currency.rate, venueCurrency) } : {}),
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
      await createCampaign(venueId, asDraft(venueCurrency));
      /* One call, one ending: a campaign is inserted `active`. */
      toast(copy.started);
    } catch (cause) {
      toast(filingFailure(cause, dashboard));
      return;
    }
    refresh();
    closeDrawer();
  };

  /* Higher wins on the server, so 5 is the top of the row and 1 the bottom. */
  const priorityHelp =
    priority === 5
      ? v3.priorityTopHelp
      : priority >= 1 && priority < 5
        ? fill(v3.priorityHelp, { from: num(priority + 1) })
        : null;
  const minimum = editing && usesVenueMinimum ? null : minSpend;

  return (
    <div className="dx-sections dx-dform">
      <section className="dx-dform-sec">
        <Field label={copy.nameLabel} error={nameMissing ? copy.nameError : undefined}>
          <Input
            value={name}
            invalid={nameMissing}
            placeholder={copy.namePlaceholder}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <span className="dx-field-help">{copy.nameNote}</span>
      </section>

      <Section title={copy.visitsTitle}>
        <div className="dx-dform-stepper">
          <button type="button" aria-label={copy.visitsMinus} onClick={() => setVisits((n) => Math.max(1, n - 1))}>
            −
          </button>
          <NumField
            className="dx-dform-stepper-field"
            value={visits}
            onChange={(n) => setVisits(Math.round(n))}
            min={1}
            max={50}
            unit={copy.visits}
            label={copy.visitsTitle}
          />
          <button type="button" aria-label={copy.visitsPlus} onClick={() => setVisits((n) => Math.min(50, n + 1))}>
            +
          </button>
        </div>
        <p className="dx-dform-hint">{fill(copy.visitsHelp, { n: num(visits) })}</p>
      </Section>

      <Section title={copy.rewardTitle}>
        <Segmented
          label={copy.rewardTitle}
          value={rewardKind}
          onChange={setRewardKind}
          options={[
            { value: 'item', label: v3.rewardKinds[0] },
            { value: 'amount', label: v3.rewardKinds[1] },
          ]}
        />
        {rewardKind === 'item' ? (
          <Field label={<span className="visually-hidden">{copy.rewardTitle}</span>} help={copy.rewardItemNote}>
            <Input
              value={rewardItem}
              invalid={rewardMissing && !nameMissing}
              placeholder={copy.rewardItemPlaceholder}
              onChange={(event) => setRewardItem(event.target.value)}
            />
          </Field>
        ) : (
          <div className="dx-dform-short">
            <NumField
              value={rewardAmount}
              onChange={setRewardAmount}
              unit={`${currency.symbol} ${copy.rewardOff}`}
              label={copy.rewardTitle}
            />
          </div>
        )}
        {/* v3 holds this back until the name is in, so a fresh form says one
            thing at a time. */}
        {rewardMissing && !nameMissing && <span className="dx-field-error">{copy.rewardError}</span>}
      </Section>

      <Section title={copy.costTitle}>
        <div className="dx-dform-short">
          <NumField
            value={cost}
            onChange={setCost}
            step={0.5}
            invalid={costMissing}
            unit={fill(dashboard.words.each, { amount: currency.symbol })}
            label={copy.costTitle}
          />
        </div>
        {costMissing && <span className="dx-field-error">{copy.costError}</span>}
        <p className="dx-dform-hint">{copy.costNote}</p>
        <div className="dx-dform-project">
          <NumField
            className="dx-dform-project-field"
            value={project}
            onChange={(n) => setProject(Math.round(n))}
            unit={copy.project}
            label={copy.project}
          />
          <b>
            {fill(v3.projection, {
              n: num(project),
              amount: money((project * cost) / currency.rate, 'exact'),
            })}
          </b>
        </div>
      </Section>

      <Section title={copy.priorityTitle}>
        <p className="dx-dform-lede">{copy.priorityLede}</p>
        <div className="dx-dform-chips" data-size="lg">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={priority === n}
              onClick={() => {
                setPriority(n);
                setPriorityTouched(true);
              }}
            >
              {n === 5 ? fill(v3.top, { n: num(n) }) : n === 1 ? fill(v3.bottom, { n: num(n) }) : num(n)}
            </button>
          ))}
        </div>
        {priorityHelp && <p className="dx-dform-hint">{priorityHelp}</p>}
      </Section>

      <Section title={copy.rulesTitle}>
        <div className="dx-dform-rules">
          <div>
            <span className="dx-field-label">{copy.expiry}</span>
            <NumField value={expiry} onChange={(n) => setExpiry(Math.round(n))} min={1} max={365} unit={copy.days} label={copy.expiry} />
            <p className="dx-dform-hint">{copy.expiryNote}</p>
          </div>
          <div>
            <span className="dx-field-label">{copy.minSpend}</span>
            <NumField
              value={minSpend}
              onChange={(next) => {
                setMinSpend(next);
                setMinSpendTouched(true);
                setUsesVenueMinimum(false);
              }}
              unit={currency.symbol}
              label={copy.minSpend}
            />
            <p className="dx-dform-hint">{editing && usesVenueMinimum ? copy.minSpendVenue : copy.minSpendNote}</p>
          </div>
        </div>
      </Section>

      {/* The whole form said back in one sentence — the most useful thing on the
          panel for an owner who cannot read the fields. */}
      <div className="dx-dform-summary">
        <Eyebrow tone="mint">{copy.summaryTitle}</Eyebrow>
        <b>{visits === 1 ? fill(v3.summaryOne, { reward }) : fill(v3.summary, { n: num(visits), reward })}</b>
        <p>
          {minimum !== null && minimum > 0
            ? fill(v3.summaryNote, { days: num(expiry), amount: money(minimum / currency.rate, 'exact') })
            : fill(v3.summaryNoteBare, { days: num(expiry) })}
        </p>
      </div>
    </div>
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
  const [invalid, setInvalid] = useState<string | null>(null);
  const [filing, setFiling] = useState(false);
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

  const isDeal = kind === 'deal';
  const editing = isDeal ? dealId !== undefined : campaignId !== undefined;
  const form = isDeal ? dashboard.deals.form : dashboard.campaigns.form;

  return (
    <Drawer
      kicker={form.kicker}
      title={editing ? form.editTitle : form.title}
      sub={form.sub}
      onClose={closeDrawer}
      invalid={invalid ?? undefined}
      footer={
        <>
          <Button variant="secondary" onClick={closeDrawer}>
            {copy.cancel}
          </Button>
          {/* Only a new deal can be saved and finished later: only a deal has a
              draft state, and an edit has nothing to put off. A draft still
              needs a title — the server stores nothing nameless. */}
          {isDeal && !editing && (
            <Button variant="secondary" disabled={filing} onClick={() => void press(false)}>
              {copy.later}
            </Button>
          )}
          <Button variant="primary" disabled={invalid !== null || filing} onClick={() => void press(true)}>
            {filing
              ? copy.deal.filing
              : editing
                ? isDeal
                  ? dashboard.deals.form.save
                  : copy.campaign.save
                : isDeal
                  ? dashboard.deals.form.publish
                  : dashboard.campaigns.form.start}
          </Button>
        </>
      }
    >
      {isDeal ? (
        <DealBody onValid={setInvalid} submit={submit} dealId={dealId} prefill={prefill?.deal} />
      ) : (
        <CampaignBody onValid={setInvalid} submit={submit} campaignId={campaignId} prefill={prefill?.campaign} />
      )}
    </Drawer>
  );
}

