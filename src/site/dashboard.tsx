import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DASH_SCREENS } from './content';
import { PlanSheet } from './dashboardPlan';
import { PD_RANGES, RANGE_DAYS, dealFromApi } from './partnerMetrics';
import type { RangeDays } from './partnerMetrics';
import {
  exportCsv,
  isNoSession,
  markInboxRead,
  minorToEuro,
  readyOr,
  useInbox,
  usePartnerBudget,
  usePartnerCampaigns,
  usePartnerDeals,
  usePartnerVenue,
  usePartnerVenueId,
} from './api/partner';
import { ApiError, call } from './api/client';
import { Icon } from './icons';
import { useCopy, useLanguage, useMoney } from './i18n/context';
import { fill } from './i18n/currency';
import { useAuth } from './auth/context';
import { Face } from './auth/Avatar';
import { DEMO_MODE } from './demoMode';
import { DEMO_BUDGET, DEMO_INBOX } from './dashboardDemo';
import { BusinessForm } from './businessSetup';
import { DashboardScreen } from './dashboardScreens';
import { DashboardDrawer, DashboardToast } from './dashboardDrawer';
import { DashboardContext, useDashboard } from './dashboardShell';
import type { DrawerKind, DrawerPrefill, DrawerTarget } from './dashboardShell';
import { CurrencyMenu, LanguageMenu, ThemeToggle } from './Header';
import { PATHS } from './router';
import { useCountUp, useReveal } from './useReveal';

/**
 * The partner dashboard shell.
 *
 * A different frame from the rest of the site on purpose: a rail down the left,
 * a sticky bar across the top, and no marketing header or footer. Someone
 * opening this on a Monday morning is working, not reading a pitch.
 *
 * The layout follows the prototype in `b2b/Paylez Partner Dashboard v2.dc.html`
 * — same rail, same groups, same plan card, same pair of buttons above every
 * screen — but every colour comes from the site's tokens rather than that file's
 * own palette, which is what gives this screen a dark theme, five languages and
 * the reader's own currency. The surface is glass over the wash on `.pd-app`;
 * see the `── the screens: glass ──` block in `site.css` for what that costs and
 * where it is turned off.
 *
 * **All eight screens open, and none of them invents a figure.** Every number
 * on every one of them is either a row the server counted (`api/partner.ts`) or
 * an explicit "nothing measured yet" panel — see the header of
 * `dashboardScreens.tsx`. The rail's own two badges and its plan card follow the
 * same rule: with no partner session on this device there is no budget to draw a
 * bar for, and the card says so rather than filling it to zero. The eighth
 * screen is the profile, the only one with a form behind it.
 *
 * Two things belong to the frame rather than to any screen, and both are here
 * for the same reason the prototype puts them here: **the create drawer** —
 * reachable from six places and always the same panel — and **the confirmation
 * strip**, which is now where every write on the dashboard reports its ending.
 * They are handed down through `DashboardContext` rather than threaded as props
 * through eight screens and forty buttons.
 *
 * **And the buttons write.** A deal is published, paused, extended, taken down
 * or given its notification; a campaign is started, paused or ended; the
 * voucher ladder and the month's budget are set; a scan waiting at the counter
 * is confirmed. Six of the seven screens reach the server, and the strip's
 * sentences are in the past tense because the thing has happened — which is the
 * change that retired `copy.dashboard.notWired` rather than translating it.
 */

/* ────────────────────────────────────────────────────────────────── rail ── */

function Rail({
  screen,
  onGo,
  collapsed,
  onToggle,
  onOpenPlan,
}: {
  screen: number;
  onGo: (index: number) => void;
  collapsed: boolean;
  onToggle: () => void;
  onOpenPlan: () => void;
}) {
  const copy = useCopy();
  const money = useMoney();
  /* The venue's plan, from the session rather than from a fetch of its own —
     see the note on the plan card below. */
  const { plan } = useAuth();

  /*
   * The plan card reads the same pool the Campaigns and Vouchers screens do —
   * which is now the server's, not a seed. It used to carry its own two
   * numbers, which was a contradiction waiting to happen: the rail said one
   * budget was spent and the screen one click away said another.
   *
   * With no partner session there is no budget, and `budget` is `null`. The
   * card then shows no bar and no figures rather than a bar filled to zero
   * against a total of zero — which is both a division by zero and a claim
   * that the venue has spent nothing, and only one of those is a rendering
   * bug.
   */
  const venue = usePartnerVenueId();
  const venueId = venue.state.status === 'ready' ? venue.state.data : null;
  const budgetApi = usePartnerBudget(venueId);
  const dealsApi = usePartnerDeals(venueId);
  const campaignsApi = usePartnerCampaigns(venueId);

  /* The rail's own budget read, which is not one of the seven `Screen`s and so
     needs the demo stand-in stated again. Same rule as everywhere: a venue that
     has a budget draws its own, and the demo's is reached only when there was
     no session to ask with, and only in demo mode. */
  const budget = readyOr(budgetApi.state, DEMO_MODE ? DEMO_BUDGET : null);
  const toEuro = (minor: number) => minorToEuro(minor, budget?.currency ?? 'EUR');
  const spent = budget ? toEuro(budget.loyalty.spent + budget.voucher.spent) : null;
  const total = budget ? toEuro(budget.total) : null;
  const used = spent !== null && total !== null && total > 0 ? spent / total : null;

  /*
   * The two counts in the rail, counted rather than written down — the
   * prototype hardcodes "3" against each, and a badge edited by hand when a
   * deal is paused is a badge that will be wrong by Thursday. `undefined` when
   * nobody has answered, which is what keeps the badge off rather than
   * asserting that nothing is running.
   */
  const badges: Record<string, number | undefined> = {
    deals:
      dealsApi.state.status === 'ready'
        ? dealsApi.state.data
            .map((row) => dealFromApi(row, toEuro))
            .filter((deal) => deal.state === 'live').length
        : undefined,
    campaigns:
      campaignsApi.state.status === 'ready'
        ? campaignsApi.state.data.filter((campaign) => campaign.status === 'active').length
        : undefined,
  };

  const group = (which: 'grow' | 'workspace') =>
    DASH_SCREENS.map((entry, index) => ({ entry, index })).filter(
      ({ entry }) => entry.group === which,
    );

  return (
    <aside className="rail" data-collapsed={collapsed ? 'true' : undefined}>
      {/* The word, and nothing beside it.
          This rail carried a 32px tile of the old square logo, copied from the
          reference export — and it was the one piece of chrome on the whole
          site that did. `CLAUDE.md` states the rule the other way round: the
          brand *is* the word, there is no tile beside it, and the square files
          in `public/logo/` are behind the `--logo` token precisely because no
          chrome shows them. Dropping it settles the disagreement in favour of
          the rule rather than the export. */}
      <a className="rail-brand" href={PATHS.landing}>
        <span className="rail-word">paylez</span>
        <span className="rail-tag">{copy.dashboard.tag}</span>
      </a>

      <nav className="rail-nav" aria-label={copy.dashboard.tag}>
        {(['grow', 'workspace'] as const).map((which) => (
          <div className="rail-group-block" key={which}>
            <span className="rail-group">{copy.dashboard.groups[which]}</span>
            {group(which).map(({ entry, index }) => (
              <button
                key={entry.id}
                type="button"
                className="rail-link"
                title={copy.dashboard.screens[index].name}
                data-on={screen === index ? 'true' : undefined}
                onClick={() => onGo(index)}
              >
                <Icon name={entry.icon} size={18} />
                <span>{copy.dashboard.screens[index].name}</span>
                {(badges[entry.id] ?? 0) > 0 && (
                  <i className="rail-badge">{badges[entry.id]}</i>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="rail-foot">
        {/*
          * A button, and it names the plan the venue is actually on.
          *
          * Two things were wrong with the box this replaces and they compound.
          * It was a `<div>`, so the one piece of chrome that names the plan was
          * not pressable and the panel behind it did not exist. And the name
          * was `copy.dashboard.plan.name` — the dictionary string "Growth plan",
          * identical for a venue on Starter and one on Chain, which is the one
          * thing on this rail that had never asked what the plan was.
          *
          * `plan` comes off the auth context, which fills it from one
          * `GET /v1/me` when the session changes, so this costs no request. It
          * is **`null` while unknown**, and the dictionary's own word for that
          * is shown rather than a guess — falling back to the free tier would
          * label a paying customer free every time a request failed.
          */}
        <button type="button" className="plan-card" onClick={onOpenPlan}>
          <div className="plan-head">
            <b>{plan?.name ?? copy.dashboard.plan.unknown}</b>
            <span className="plan-state">{copy.dashboard.plan.state}</span>
          </div>
          <p>{copy.dashboard.plan.caption}</p>
          {used !== null && (
            <div className="plan-bar">
              {/* Amber is not available — the palette has one accent — so a
                  budget running out is shown by the bar filling, not by
                  changing hue. */}
              <i style={{ width: `${Math.min(100, used * 100).toFixed(1)}%` }} />
            </div>
          )}
          <span className="plan-usage">
            {spent === null || total === null
              ? copy.dashboard.unmeasured.plan
              : fill(copy.dashboard.plan.usage, {
                  used: money(spent, 'exact'),
                  total: money(total, 'exact'),
                })}
          </span>
          {/* What the press does, said on the control rather than guessed at. */}
          <span className="plan-open">
            {copy.dashboard.plan.open}
            <Icon name="chevron" size={13} strokeWidth={2.2} />
          </span>
        </button>

        {/*
          The `title` is what names this button once the rail is collapsed, and it
          is the same affordance every `.rail-link` above already carries.

          `.rail[data-collapsed='true'] .rail-collapse span` is `display: none`,
          which does not merely hide the words -- it removes them from the
          accessibility tree, so the one control that puts the labels *back* was
          announced as an unnamed "button" to anybody who could not see the
          chevron. The links were fine; this was the gap.

          `title` rather than `aria-label` so it serves a mouse as well: at
          4.6rem there is nothing on screen to say which way the chevron goes.
        */}
        <button
          type="button"
          className="rail-collapse"
          title={collapsed ? copy.dashboard.expand : copy.dashboard.collapse}
          onClick={onToggle}
        >
          <Icon name="chevron" size={16} strokeWidth={2.2} />
          <span>{collapsed ? copy.dashboard.expand : copy.dashboard.collapse}</span>
        </button>
      </div>
    </aside>
  );
}

/* ───────────────────────────────────────────────────────────────── topbar ── */

/**
 * The reporting window.
 *
 * Built like `LanguageMenu` and sharing its menu rules, because it is the same
 * component — a trigger and a listbox — and `site.css` has one set of rules for
 * that. What it does not share is the trigger: this one is chrome in the
 * dashboard bar rather than a header control, so it keeps `.pd-range-btn`.
 *
 * It moves every report that is counted in rolling days: the overview's four
 * tiles, their period deltas and the visits chart (`GET …/series?days=`), and
 * the scan log (`GET …/scans?days=`) — the picker's four windows are those
 * endpoints' own. The reports counted over a **calendar month** (the headline,
 * the cost panel, reach) do not move, and are labelled with their month rather
 * than with this window: sending 30 as a month would quote one window under the
 * other's label. It re-keys the page, so the reveal and the count-up run again.
 */
function RangeMenu() {
  const copy = useCopy();
  const { range, setRange } = useDashboard();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const at = PD_RANGES.indexOf(range);

  return (
    <div className="pd-range" ref={ref}>
      <button
        type="button"
        className="pd-range-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={copy.dashboard.rangeMenu}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="calendar" size={14} />
        {copy.dashboard.ranges[at]}
        <Icon name="chevron" size={13} strokeWidth={2.2} className="lang-caret" />
      </button>

      {open && (
        /* A `div` with the options as direct children — see the note on
           `LanguageMenu` in `Header.tsx`, whose classes this borrows. A
           `role="listbox"` may only own `option`s, and an `<li>` in between
           breaks that; the two controls are one component and have to make the
           same mistake or neither. */
        <div
          className="lang-menu pd-range-menu"
          role="listbox"
          aria-label={copy.dashboard.rangeMenu}
        >
          {PD_RANGES.map((days, index) => (
            <button
              key={days}
              type="button"
              role="option"
              aria-selected={days === range}
              className="lang-option"
              data-on={days === range ? 'true' : undefined}
              onClick={() => {
                setRange(days);
                setOpen(false);
              }}
            >
              {copy.dashboard.ranges[index]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TopBar({ screen }: { screen: number }) {
  const copy = useCopy();
  const { account } = useAuth();
  const business = account?.business;

  return (
    <header className="pd-bar">
      <div className="pd-crumb">
        <span>{business?.name || account?.name}</span>
        <Icon name="chevron" size={13} strokeWidth={2.4} className="pd-crumb-sep" />
        <b>{copy.dashboard.screens[screen].name}</b>
      </div>

      <div className="pd-actions">
        <RangeMenu />
        {/*
          The dashboard replaces the site header, and both of these lived there —
          so without them the one screen an owner spends the most time on was the
          one screen with no way to switch theme or language. Same controls, same
          `data-theme` cross-fade and the same `paylez-language` key; they just
          need their own mount here.
        */}
        {/* Two settings, two controls — the dashboard prices a budget and a
            cost per customer, so the currency belongs here as much as the
            language does. */}
        <CurrencyMenu />
        <LanguageMenu />
        <ThemeToggle />
        <NotificationsMenu />
        <UserMenu />
      </div>
    </header>
  );
}

/**
 * The bell, and the inbox behind it.
 *
 * It used to draw a permanent unread dot over nothing — a mark with no inbox
 * behind it, which is the picture-of-a-control this dashboard keeps deleting.
 * It reads `GET /v1/notifications` now: the signed-in person's own inbox,
 * filtered to the session's mode, so a partner session sees the partner half —
 * the monthly summary and the notes the daily job writes about the venue.
 *
 * Three rules, and each is a thing the old dot got wrong:
 *
 * - **The dot means unread items exist**, and is drawn only then. A bell with a
 *   dot and an empty menu is the lie the old one told every day.
 * - **No session, no bell.** With nobody to ask there is nothing behind the
 *   control, so it is not drawn — except under `?demo=1`, where it opens the
 *   demo's inbox and says that is what it is.
 * - **Marking read writes**, through `POST /v1/notifications/read`, and only for
 *   items the server sent — the demo's are read-only, because a press that could
 *   not reach anything must not look like one that did.
 *
 * A disclosure rather than a `role="menu"`: the panel holds items to read with a
 * control beside some of them, which is a region, not a list of commands.
 */
function NotificationsMenu() {
  const copy = useCopy().dashboard;
  const { toast } = useDashboard();
  const [language] = useLanguage();
  const inboxApi = useInbox();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const when = useMemo(
    () => new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }),
    [language],
  );

  const live = inboxApi.state.status === 'ready' ? inboxApi.state.data : null;
  const inbox = readyOr(inboxApi.state, DEMO_MODE ? DEMO_INBOX : null);
  const noSession = inboxApi.state.status === 'error' && isNoSession(inboxApi.state.error);

  if (noSession && !DEMO_MODE) return null;

  const unread = inbox?.unread ?? 0;

  const mark = async (ids: string[]) => {
    if (live === null || ids.length === 0 || busy) return;
    setBusy(true);
    try {
      await markInboxRead(ids);
      inboxApi.reload();
    } catch (cause) {
      toast(
        cause instanceof ApiError && cause.status === 0
          ? copy.acts.offline
          : fill(copy.acts.refused, {
              why: cause instanceof Error ? cause.message : String(cause),
            }),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pd-bell" ref={ref}>
      <button
        ref={trigger}
        type="button"
        className="pd-icon"
        aria-expanded={open}
        aria-controls="pd-inbox"
        aria-label={
          unread > 0
            ? `${copy.notifications} · ${fill(copy.inbox.unread, { n: String(unread) })}`
            : copy.notifications
        }
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="bell" size={17} />
        {unread > 0 && <i className="pd-dot" aria-hidden />}
      </button>

      {open && (
        <div className="account-menu pd-inbox" id="pd-inbox" role="region" aria-label={copy.notifications}>
          <div className="pd-inbox-head">
            <b>{copy.notifications}</b>
            {live !== null && unread > 0 && (
              <button
                type="button"
                className="pd-inbox-all"
                disabled={busy}
                onClick={() =>
                  void mark(live.items.filter((item) => item.read_at === null).map((item) => item.id))
                }
              >
                {copy.inbox.markAll}
              </button>
            )}
          </div>

          {inbox === null ? (
            <p className="pd-fine pd-inbox-note">
              {inboxApi.state.status === 'loading' ? copy.unmeasured.asking : copy.inbox.failed}
            </p>
          ) : inbox.items.length === 0 ? (
            <p className="pd-fine pd-inbox-note">{copy.inbox.empty}</p>
          ) : (
            <ul className="pd-inbox-list">
              {inbox.items.map((item) => (
                <li key={item.id} data-unread={item.read_at === null ? 'true' : undefined}>
                  <div>
                    <b>{item.title}</b>
                    <p>{item.body}</p>
                    <time dateTime={item.created_at}>{when.format(new Date(item.created_at))}</time>
                  </div>
                  {live !== null && item.read_at === null && (
                    <button
                      type="button"
                      className="pd-inbox-read"
                      disabled={busy}
                      aria-label={`${copy.inbox.markRead}: ${item.title}`}
                      onClick={() => void mark([item.id])}
                    >
                      <Icon name="check" size={13} strokeWidth={2.4} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {live === null && inbox !== null && (
            <p className="pd-fine pd-inbox-note">{copy.inbox.sample}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Who is signed in — and, unlike before, something you can press.
 *
 * It was a `<span>`: an avatar, a first name and a role, styled exactly like the
 * marketing header's account chip and doing nothing at all. That is the
 * picture-of-a-control failure this repository names in `CLAUDE.md` — anything
 * shaped like a control has to be one — and it was the more misleading for
 * sitting beside four real controls in the same bar.
 *
 * So it is the same component the landing page has, with the same three
 * destinations. "Back to paylez" moves in here from the header row: it is a way
 * *off* this frame, which is what the rest of this menu is about, and in the
 * header it sat beside Export and Create — the two controls an owner presses
 * most — spending width on the one action nobody opens the dashboard to perform.
 */
function UserMenu() {
  const copy = useCopy();
  const { account, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      /* Escape means "put me back". Closing unmounts whatever item had focus,
         which drops it on `<body>` — the same restore `AccountChip` does. */
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!account?.type) return null;

  return (
    <div className="pd-usermenu" ref={ref}>
      <button
        ref={trigger}
        type="button"
        className="pd-user"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={copy.auth.accountMenu}
        onClick={() => setOpen((value) => !value)}
      >
        <i aria-hidden>
          <Face name={account.name} photo={account.profile.avatar} />
        </i>
        <span className="pd-who">
          <b>{account.name.split(' ')[0]}</b>
          <span>{copy.auth.roles[account.type]}</span>
        </span>
        <Icon name="chevron" size={13} strokeWidth={2.2} className="lang-caret" />
      </button>

      {open && (
        <div className="account-menu pd-user-menu" role="menu">
          <a
            className="account-item"
            role="menuitem"
            href={PATHS.profile}
            onClick={() => setOpen(false)}
          >
            <Icon name="people" size={15} />
            {copy.profile.title}
          </a>
          {/* No `onClick` close on this one: `#/landing` replaces this whole
              frame, so the menu unmounts with the bar it hangs off — the same
              reason `AccountChip`'s dashboard link does not close itself. */}
          <a className="account-item" role="menuitem" href={PATHS.landing}>
            <Icon name="home" size={15} />
            {copy.dashboard.backToSite}
          </a>
          <button
            type="button"
            className="account-item"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
          >
            <Icon name="send" size={15} />
            {copy.auth.signOut}
          </button>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────── the two head buttons ── */

/**
 * The public listing, fetched from the server that serves it to the app.
 *
 * "Preview listing" raised the strip with "Opening your listing preview" and
 * opened nothing, which is the shape of dishonesty this dashboard is least
 * allowed: a control whose confirmation describes something that did not
 * happen. `GET /v1/venues/:id` is the *customer's* view of a venue — the same
 * body the phone reads — so previewing it is a real read of a real endpoint
 * rather than a picture of the form the owner just filled in.
 *
 * Deliberately not built from `account.business`. A preview drawn from the
 * browser's own copy of the listing shows what was typed; this shows what was
 * *saved*, which is the only version a customer will ever see and the one worth
 * checking before a deal goes out.
 */
interface PublicListing {
  venue: {
    name: string;
    category: string | null;
    subcategory: string | null;
    city: string | null;
    address: string | null;
    priceRange: string | null;
    imageUrl: string | null;
    acceptsVouchers: boolean;
  };
}

function ListingPreview({ venueId, onClose }: { venueId: string; onClose: () => void }) {
  const copy = useCopy().dashboard;
  const [listing, setListing] = useState<PublicListing | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    call<PublicListing>(`/v1/venues/${encodeURIComponent(venueId)}`)
      .then((body) => live && setListing(body))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [venueId]);

  return (
    <div className="pd-sheet" role="dialog" aria-modal="true" aria-label={copy.acts.previewTitle}>
      <button
        type="button"
        className="pd-scrim"
        aria-label={copy.drawer.close}
        onClick={onClose}
      />
      <section className="pd-drawer-panel" tabIndex={-1}>
        <header>
          <div>
            <span className="console-label">{copy.actions.preview}</span>
            <h2>{copy.acts.previewTitle}</h2>
            <p className="pd-fine">{copy.acts.previewLede}</p>
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
          ) : listing === null ? (
            <p className="pd-fine">{copy.unmeasured.asking}</p>
          ) : (
            /* The same mock the deal drawer draws its offer in, and for the
               same reason: the ground of the thing being previewed is black
               whichever theme is reading, so `data-ink='on'` rather than the
               page's own surface. */
            <div className="pd-phone" data-ink="on">
              <span className="pd-phone-notch" aria-hidden />
              <div className="pd-phone-card">
                <div className="pd-phone-art">
                  <span>{listing.venue.priceRange ?? ''}</span>
                </div>
                <div className="pd-phone-body">
                  <em>{[listing.venue.category, listing.venue.subcategory]
                    .filter(Boolean)
                    .join(' · ')}</em>
                  <b>{listing.venue.name}</b>
                  <p>{[listing.venue.address, listing.venue.city].filter(Boolean).join(', ')}</p>
                  <div className="pd-phone-foot">
                    <span>
                      {listing.venue.acceptsVouchers
                        ? copy.acts.previewVouchers
                        : copy.acts.previewNoVouchers}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * The secondary button above every screen: export the month, or preview the
 * listing on the one screen that is the listing.
 *
 * Both used to raise the strip with a sentence in the past tense — "Your CSV is
 * downloading", "Opening your listing preview" — and neither did anything. They
 * are one component because they are one slot, and because both need the venue
 * this API session owns.
 */
function HeadSecondary({
  isProfile,
  onPreview,
}: {
  isProfile: boolean;
  /* The sheet itself is raised by the frame rather than rendered here, for the
     reason the create drawer is: `.pd-head` is a `[data-reveal]` element, and a
     `position: fixed` overlay inside one is contained by its transform until the
     reveal lands — and invisible at `opacity: 0` before it does. */
  onPreview: (venueId: string) => void;
}) {
  const copy = useCopy().dashboard;
  const { toast } = useDashboard();
  const venueApi = usePartnerVenue();
  const venue = venueApi.state.status === 'ready' ? venueApi.state.data : null;
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (busy) return;
    if (venue === null) {
      toast(copy.drawer.deal.needsSession);
      return;
    }
    setBusy(true);
    try {
      const file = await exportCsv(venue.id);
      /*
       * A blob and a synthetic click, because the CSV arrives in the response
       * body rather than at a URL — there is no object store behind this and
       * there does not need to be: it is a day-by-day roll-up with no user
       * column, measured in kilobytes. The object URL is revoked immediately;
       * the click has already read it.
       */
      const url = URL.createObjectURL(new Blob([file.csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
      toast(copy.actions.exported);
    } catch (cause) {
      /* Three endings, because they have three different fixes: the plan does
         not carry this, the server is not there, or it looked and refused. */
      toast(
        cause instanceof ApiError && cause.status === 403
          ? copy.acts.exportLocked
          : cause instanceof ApiError && cause.status === 0
            ? copy.acts.offline
            : fill(copy.acts.refused, {
                why: cause instanceof Error ? cause.message : String(cause),
              }),
      );
    } finally {
      setBusy(false);
    }
  };

  if (isProfile) {
    return (
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() =>
          venue === null ? toast(copy.drawer.deal.needsSession) : onPreview(venue.id)
        }
      >
        <Icon name="eye" size={15} />
        {copy.actions.preview}
      </button>
    );
  }

  return (
    <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void download()}>
      <Icon name="download" size={15} />
      {copy.actions.exportCsv}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────── page ── */

/** The profile is the last screen and the only one with a form. */
const PROFILE = DASH_SCREENS.length - 1;

/**
 * Which of the two things a screen's primary button makes.
 *
 * The prototype changes it by screen and the choice is not decorative: the
 * button above Campaigns and Scan activity makes a campaign, and everywhere else
 * it makes a hot deal, because that is what an owner standing on each of those
 * screens is most likely to want next. The assistant is the one screen with no
 * primary at all — it *is* the create flow, and a "create" button beside it
 * would be offering the long way round.
 */
function primaryFor(id: string): DrawerKind | null {
  if (id === 'assistant' || id === 'profile') return null;
  return id === 'campaigns' || id === 'scans' ? 'campaign' : 'deal';
}

export function DashboardPage() {
  const copy = useCopy();
  const [collapsed, setCollapsed] = useState(false);
  /* Opens on the overview, which is the first entry in the rail and the screen
     the prototype opens on. It used to open on the profile because that was the
     only screen with anything on it. */
  const [screen, setScreen] = useState(0);
  /* `seq` keys the drawer, so opening it on a second target while it is open
     starts that form fresh rather than keeping the first one's typing. */
  const [drawer, setDrawer] = useState<(DrawerTarget & { seq: number }) | null>(null);
  const drawerSeq = useRef(0);
  /* Bumped by a write the drawer made, which re-mounts the page so the screen
     reads its lists again — see `refresh` on the shell. */
  const [revision, setRevision] = useState(0);
  /* Opens on the month, which is what every figure was written against and what
     the copy's own "August" crumb still says. */
  const [range, setRange] = useState<RangeDays>(RANGE_DAYS);
  /* The same read the rail makes. `useApi` keys on the path, so this is the one
     request answering both rather than a second one. */
  const planVenue = usePartnerVenueId();
  const planVenueId = planVenue.state.status === 'ready' ? planVenue.state.data : null;
  const [toastText, setToastText] = useState<string | null>(null);
  /* The venue whose public listing is being previewed, or null. On the frame
     rather than on the head for the same reason the create drawer is: an
     overlay inside a [data-reveal] element is contained by its transform. */
  const [preview, setPreview] = useState<string | null>(null);
  /* The plan panel, on the frame rather than in the rail for the same reason
     the create drawer is: an overlay inside a `[data-reveal]` element is
     contained by that element's transform. */
  const [planOpen, setPlanOpen] = useState(false);

  /*
   * A second rescan, keyed on the screen. `Site` keys its own on the route, and
   * the route does not change when the rail does — so without these, every panel
   * after the first mounts with no `data-shown` and sits at `opacity: 0`, and
   * its `[data-count]` figures never leave zero.
   */
  useReveal(`${screen}:${range}:${revision}`);
  useCountUp(`${screen}:${range}:${revision}`);

  /* Memoised on the two things that actually move: without it every screen
     re-renders on each keystroke inside the drawer, because the context value
     would be a new object every time the frame renders. */
  const shell = useMemo(
    () => ({
      screen,
      go: setScreen,
      goTo: (id: string) => {
        const index = DASH_SCREENS.findIndex((entry) => entry.id === id);
        if (index >= 0) setScreen(index);
      },
      openDrawer: (
        kind: DrawerKind,
        dealId?: string,
        prefill?: DrawerPrefill,
        campaignId?: string,
      ) => {
        drawerSeq.current += 1;
        setDrawer({ kind, dealId, prefill, campaignId, seq: drawerSeq.current });
      },
      closeDrawer: () => setDrawer(null),
      refresh: () => setRevision((n) => n + 1),
      toast: (message: string) => setToastText(message),
      range,
      setRange,
    }),
    [screen, range],
  );

  const id = DASH_SCREENS[screen].id;
  const primary = primaryFor(id);
  const dismiss = useCallback(() => setToastText(null), []);

  return (
    /*
     * `<main>` and not a `<div>`: `site.css` gives `z-index: 1` to `.site > main`
     * only, and the intro hand-off keys off `.site[data-intro='running'] main`.
     * A dashboard in a plain div sits behind the page background.
     */
    <DashboardContext.Provider value={shell}>
      <main className="pd-app" data-collapsed={collapsed ? 'true' : undefined}>
        <Rail
          screen={screen}
          onGo={setScreen}
          collapsed={collapsed}
          onToggle={() => setCollapsed((on) => !on)}
          onOpenPlan={() => setPlanOpen(true)}
        />

        <div className="pd-main">
          <TopBar screen={screen} />

          {/* Keyed on the screen so the reveal observer rescans and the new panel
              fades in rather than appearing at `opacity: 0`. */}
          <div className="pd-page" key={`${screen}:${range}:${revision}`}>
            <div className="pd-head" data-reveal>
              {/* The name, without the sentence under it.
                  Each screen's `lede` explained what the screen was — "What
                  Paylez did for you, and what it cost" — which is a useful line
                  the first time somebody opens the dashboard and dead weight
                  every time after. The panels below say the same thing with
                  figures in them. The `lede` strings stay in the five
                  dictionaries rather than being deleted — removing a key means
                  editing five files to change what one screen renders, and this
                  is a presentation decision that may well be reversed. */}
              <div>
                <h1>{copy.dashboard.screens[screen].name}</h1>
              </div>
              <div className="pd-head-acts">
                <HeadSecondary isProfile={id === 'profile'} onPreview={setPreview} />
                {primary && (
                  <button
                    type="button"
                    className="btn btn-solid"
                    onClick={() => shell.openDrawer(primary)}
                  >
                    <Icon name="plus" size={15} strokeWidth={2} />
                    {primary === 'deal'
                      ? copy.dashboard.actions.newDeal
                      : copy.dashboard.actions.newCampaign}
                  </button>
                )}
                {/* "Back to paylez" was here and is in the user menu now — see
                    `UserMenu`. It is a way off the frame, not a thing to do on
                    it, and it was taking header width from the two controls
                    that are. */}
              </div>
            </div>

            {screen === PROFILE ? (
              <BusinessForm mode="profile" />
            ) : (
              <DashboardScreen index={screen} />
            )}
          </div>
        </div>

        {drawer && (
          <DashboardDrawer
            key={drawer.seq}
            kind={drawer.kind}
            dealId={drawer.dealId}
            campaignId={drawer.campaignId}
            prefill={drawer.prefill}
          />
        )}
        {preview && <ListingPreview venueId={preview} onClose={() => setPreview(null)} />}
        {planOpen && <PlanSheet venueId={planVenueId} onClose={() => setPlanOpen(false)} />}
        {toastText && <DashboardToast message={toastText} onDone={dismiss} />}
      </main>
    </DashboardContext.Provider>
  );
}
