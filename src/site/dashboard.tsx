import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DASH_SCREENS } from './content';
import { PD_RANGES, RANGE_DAYS, dealFromApi } from './partnerMetrics';
import type { RangeDays } from './partnerMetrics';
import {
  exportCsv,
  minorToEuro,
  usePartnerBudget,
  usePartnerCampaigns,
  usePartnerDeals,
  usePartnerVenue,
  usePartnerVenueId,
} from './api/partner';
import { ApiError, call } from './api/client';
import { Icon } from './icons';
import { useCopy, useMoney } from './i18n/context';
import { fill } from './i18n/currency';
import { useAuth } from './auth/context';
import { Face } from './auth/Avatar';
import { BusinessForm } from './businessSetup';
import { DashboardScreen } from './dashboardScreens';
import { DashboardDrawer, DashboardToast } from './dashboardDrawer';
import { DashboardContext, useDashboard } from './dashboardShell';
import type { DrawerKind } from './dashboardShell';
import { LanguageMenu, ThemeToggle } from './Header';
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
}: {
  screen: number;
  onGo: (index: number) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const copy = useCopy();
  const money = useMoney();

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

  const budget = budgetApi.state.status === 'ready' ? budgetApi.state.data : null;
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
        <div className="plan-card">
          <div className="plan-head">
            <b>{copy.dashboard.plan.name}</b>
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
        </div>

        <button type="button" className="rail-collapse" onClick={onToggle}>
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
 * It is the one control on this frame that still does not reach the server, and
 * the reason is a mismatch rather than a missing endpoint: every report here is
 * counted over a **calendar month**, and this picker offers a rolling day
 * count. Sending 30 as a month would quote one window under the other's label,
 * which is the exact confusion `dashboard.unmeasured.monthOnly` is written to
 * name. It re-keys the reveal and the count-up, and says so in that sentence.
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
        <LanguageMenu />
        <ThemeToggle />
        <button type="button" className="pd-icon" aria-label={copy.dashboard.notifications}>
          <Icon name="bell" size={17} />
          {/* Unread, and drawn as a mark rather than a count: there is nothing
              behind it to count, and a badge reading "3" would be the one
              invented number on the screen. */}
          <i className="pd-dot" aria-hidden />
        </button>
        {/*
          Avatar, first name, role — and nothing else. It was the full name on
          one line, which ran out of the bar at anything narrower than a desktop
          and left "Ali Akl" sitting under its own initial. A surname adds no
          information here: there is one person signed in and the question the
          pill answers is "as whom, and as what".
        */}
        {account?.type && (
          <span className="pd-user">
            <i aria-hidden>
              <Face name={account.name} photo={account.profile.avatar} />
            </i>
            <span className="pd-who">
              <b>{account.name.split(' ')[0]}</b>
              <span>{copy.auth.roles[account.type]}</span>
            </span>
          </span>
        )}
      </div>
    </header>
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
  const [drawer, setDrawer] = useState<DrawerKind | null>(null);
  /* Opens on the month, which is what every figure was written against and what
     the copy's own "August" crumb still says. */
  const [range, setRange] = useState<RangeDays>(RANGE_DAYS);
  const [toastText, setToastText] = useState<string | null>(null);
  /* The venue whose public listing is being previewed, or null. On the frame
     rather than on the head for the same reason the create drawer is: an
     overlay inside a [data-reveal] element is contained by its transform. */
  const [preview, setPreview] = useState<string | null>(null);

  /*
   * A second rescan, keyed on the screen. `Site` keys its own on the route, and
   * the route does not change when the rail does — so without these, every panel
   * after the first mounts with no `data-shown` and sits at `opacity: 0`, and
   * its `[data-count]` figures never leave zero.
   */
  useReveal(screen);
  useCountUp(`${screen}:${range}`);

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
      openDrawer: (kind: DrawerKind) => setDrawer(kind),
      closeDrawer: () => setDrawer(null),
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
        />

        <div className="pd-main">
          <TopBar screen={screen} />

          {/* Keyed on the screen so the reveal observer rescans and the new panel
              fades in rather than appearing at `opacity: 0`. */}
          <div className="pd-page" key={`${screen}:${range}`}>
            <div className="pd-head" data-reveal>
              <div>
                <h1>{copy.dashboard.screens[screen].name}</h1>
                <p>{copy.dashboard.screens[screen].lede}</p>
              </div>
              <div className="pd-head-acts">
                <HeadSecondary isProfile={id === 'profile'} onPreview={setPreview} />
                {primary && (
                  <button type="button" className="btn btn-solid" onClick={() => setDrawer(primary)}>
                    <Icon name="plus" size={15} strokeWidth={2} />
                    {primary === 'deal'
                      ? copy.dashboard.actions.newDeal
                      : copy.dashboard.actions.newCampaign}
                  </button>
                )}
                <a className="btn btn-ghost pd-tosite" href={PATHS.landing}>
                  {copy.dashboard.backToSite}
                </a>
              </div>
            </div>

            {screen === PROFILE ? (
              <BusinessForm mode="profile" />
            ) : (
              <DashboardScreen index={screen} />
            )}
          </div>
        </div>

        {drawer && <DashboardDrawer kind={drawer} />}
        {preview && <ListingPreview venueId={preview} onClose={() => setPreview(null)} />}
        {toastText && <DashboardToast message={toastText} onDone={dismiss} />}
      </main>
    </DashboardContext.Provider>
  );
}
