import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DASH_SCREENS, type DashScreenId } from './content';
import { PlanSheet } from './dashboardPlan';
import { PD_RANGES, RANGE_DAYS, dealFromApi } from './partnerMetrics';
import type { RangeDays } from './partnerMetrics';
import {
  SelectedVenueContext,
  exportCsv,
  isNoSession,
  markInboxRead,
  minorToEuro,
  readyOr,
  useInbox,
  usePartnerBudget,
  usePartnerCampaigns,
  usePartnerDeals,
} from './api/partner';
import { ApiError, call } from './api/client';
import { useCopy, useCurrencyCode, useLanguage, useMoney, LANGUAGE_ORDER, LANGUAGES } from './i18n/context';
import { CURRENCY_ORDER, fill, type CurrencyCode } from './i18n/currency';
import { useAuth } from './auth/context';
import { Face } from './auth/Avatar';
import { DEMO_MODE } from './demoMode';
import { DEMO_BUDGET, DEMO_INBOX } from './dashboardDemo';
import { DashboardScreen } from './dashboardRegistry';
import { DashboardDrawer } from './dashboardDrawer';
import { Button, DxIcon, Drawer, PageHead, Progress, Toast } from './dashboardKit';
import { useDismiss } from './dashboardKitHooks';
import { DashboardContext, useDashboard } from './dashboardShell';
import type { DashboardShell, DrawerKind, DrawerPrefill, DrawerTarget } from './dashboardShell';
import { useVenueDirectory } from './dashboardVenues';
import { PATHS } from './router';
import { useTheme } from './theme/context';
import { useCountUp, useReveal } from './useReveal';
import './dashboard.css';

/**
 * The partner dashboard frame — v3 (`b2b/dashboard-design/Paylez Partner
 * Dashboard v3.dc.html`, §2 of the spec).
 *
 * A different frame from the rest of the site on purpose: a rail down the left,
 * a sticky bar across the top, and no marketing header or footer. Someone
 * opening this on a Monday morning is working, not reading a pitch.
 *
 * **Light is v3 exactly; dark keeps the dark dashboard.** The markup is one; the
 * two token blocks at the top of `dashboard.css` are where they part. Every
 * class here is `dx-*`, and the screens inside are each their own module, found
 * through `dashboardRegistry.tsx` by id.
 *
 * **What the frame owns**, and hands down through `DashboardContext`
 * (`dashboardShell.ts`) rather than threading through every screen:
 *
 * - **which screen** (`screen`, `goTo`) — by id, never by position;
 * - **which venue** (`venueId`, `venue`, `venues`, `role`, `setVenue`) — the
 *   switcher's choice, which covers the venues this account owns *and* the ones
 *   it manages (`dashboardVenues.ts`); the pre-switcher hooks read the same
 *   choice through `SelectedVenueContext`;
 * - **the reporting window** (`range`, `setRange`);
 * - **the create drawer**, **the confirmation strip** and **the overlay root**
 *   every kit overlay portals into.
 *
 * **Every control in the bar has something real behind it** — the honesty rule
 * this dashboard keeps. v3's bell is a dot over nothing; here it is the inbox.
 * v3's user pill goes to the profile; here it is a menu with the way off the
 * frame. v3's branch select is drawn only when there is more than one venue to
 * choose, and has no "All branches", because no endpoint adds venues together.
 * v3 has no theme toggle; this site does, and the dashboard replaces the header
 * that carries it, so it is here too.
 */

/* ────────────────────────────────────────────────────────────────── rail ── */

function Rail({
  collapsed,
  onToggle,
  onOpenPlan,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onOpenPlan: () => void;
}) {
  const copy = useCopy();
  const money = useMoney();
  const { plan } = useAuth();
  const { screen, goTo, venueId } = useDashboard();

  /*
   * The plan card reads the same pool the Campaigns and Vouchers screens do —
   * the server's. With no partner session there is no budget, and the card
   * shows no bar and no figures rather than a bar filled to zero against a
   * total of zero, which would be a claim that the venue has spent nothing.
   */
  const budgetApi = usePartnerBudget(venueId);
  const dealsApi = usePartnerDeals(venueId);
  const campaignsApi = usePartnerCampaigns(venueId);

  const budget = readyOr(budgetApi.state, DEMO_MODE ? DEMO_BUDGET : null);
  const toEuro = (minor: number) => minorToEuro(minor, budget?.currency ?? 'EUR');
  /* v3's bar is everything committed — spent and set aside, in both pools —
     and its caption is what is spent. Both read one pool; neither is a seed. */
  const spent = budget ? toEuro(budget.loyalty.spent + budget.voucher.spent) : null;
  const held = budget ? toEuro(budget.loyalty.reserved + budget.voucher.reserved) : null;
  const total = budget ? toEuro(budget.total) : null;

  /*
   * The two counts, counted rather than written down — the mock hardcodes "3"
   * against each. `undefined` when nobody has answered, which keeps the badge
   * off rather than asserting that nothing is running.
   */
  const badges: Partial<Record<DashScreenId, number | undefined>> = {
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

  return (
    <aside className="dx-rail" data-collapsed={collapsed ? 'true' : undefined}>
      {/* The word, and nothing beside it — the brand is the word. */}
      <a className="dx-rail-brand" href={PATHS.landing}>
        <span className="dx-rail-word">paylez</span>
        <span className="dx-rail-tag">{copy.dashboard.tag}</span>
      </a>

      <nav className="dx-rail-nav" aria-label={copy.dashboard.tag}>
        {(['grow', 'workspace'] as const).map((group) => (
          <div className="dx-rail-group" key={group}>
            <span className="dx-rail-label">{copy.dashboard.groups[group]}</span>
            {DASH_SCREENS.filter((entry) => entry.group === group).map((entry) => {
              const name = copy.dashboard.screens[entry.id].name;
              const badge = badges[entry.id];
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="dx-nav"
                  title={name}
                  aria-label={name}
                  aria-current={screen === entry.id ? 'page' : undefined}
                  onClick={() => goTo(entry.id)}
                >
                  <span className="dx-nav-in">
                    <DxIcon name={entry.icon} />
                    <span>{name}</span>
                  </span>
                  {badge !== undefined && badge > 0 && <span className="dx-nav-badge">{badge}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="dx-rail-foot">
        {/* A button that names the plan the venue is actually on — off the
            session, `null` while unknown, in which case the dictionary's own
            word for that rather than a guess at the free tier. */}
        <button type="button" className="dx-plan" onClick={onOpenPlan}>
          <span className="dx-plan-head">
            <span>{plan?.name ?? copy.dashboard.plan.unknown}</span>
            <span className="dx-plan-state">{copy.dashboard.plan.state}</span>
          </span>
          <p className="dx-plan-cap">{copy.dashboard.plan.caption}</p>
          {spent !== null && held !== null && total !== null && total > 0 && (
            <Progress spent={spent + held} total={total} />
          )}
          <span className="dx-plan-foot">
            {spent === null || total === null ? (
              <span>{copy.dashboard.unmeasured.plan}</span>
            ) : (
              <>
                <span>{money(spent, 'exact')}</span>
                <span>{money(total, 'exact')}</span>
              </>
            )}
          </span>
        </button>

        <button
          type="button"
          className="dx-nav dx-rail-collapse"
          title={collapsed ? copy.dashboard.expand : copy.dashboard.collapse}
          aria-label={collapsed ? copy.dashboard.expand : copy.dashboard.collapse}
          onClick={onToggle}
        >
          <span className="dx-nav-in">
            <DxIcon name={collapsed ? 'chevronRight' : 'chevronLeft'} />
            <span>{collapsed ? copy.dashboard.expand : copy.dashboard.collapse}</span>
          </span>
        </button>
      </div>
    </aside>
  );
}

/* ───────────────────────────────────────────────────────────────── topbar ── */

/**
 * The venue switcher — v3's branch select, drawn only when there is a choice.
 * A venue this account manages rather than owns says so in its label.
 */
function VenueSelect() {
  const copy = useCopy().dashboard.frame;
  const { venues, venueId, setVenue } = useDashboard();
  if (venues.length < 2) return null;
  return (
    <label className="dx-select-box" data-tone="deep" title={copy.venue}>
      <DxIcon name="house" size={15} />
      <select aria-label={copy.venue} value={venueId ?? ''} onChange={(event) => setVenue(event.target.value)}>
        {venues.map((venue) => (
          <option key={venue.id} value={venue.id}>
            {venue.role === 'manager' ? fill(copy.managed, { venue: venue.name }) : venue.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The reporting window. It moves every report counted in rolling days (the
 * overview's tiles and chart, the scan log); the reports counted over a
 * calendar month do not move and are labelled with their month instead.
 */
function RangeSelect() {
  const copy = useCopy().dashboard;
  const { range, setRange } = useDashboard();
  return (
    <label className="dx-select-box">
      <DxIcon name="calendar" size={15} />
      <select
        aria-label={copy.rangeMenu}
        value={range}
        onChange={(event) => setRange(Number(event.target.value) as RangeDays)}
      >
        {PD_RANGES.map((days, index) => (
          <option key={days} value={days}>
            {copy.ranges[index]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The site's language setting, drawn as v3's code select. Same key, same switch. */
function LanguageSelect() {
  const copy = useCopy();
  const [language, setLanguage] = useLanguage();
  return (
    <label className="dx-select-box">
      <DxIcon name="globe" size={15} />
      <select
        aria-label={copy.languageMenu}
        value={language}
        onChange={(event) => setLanguage(event.target.value as typeof language)}
      >
        {LANGUAGE_ORDER.map((code) => (
          <option key={code} value={code}>
            {LANGUAGES[code].short}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The site's currency setting — every figure on this frame goes through it. */
function CurrencySelect() {
  const copy = useCopy();
  const [currency, setCurrency] = useCurrencyCode();
  return (
    <label className="dx-select-box" data-caret="own">
      <select
        aria-label={copy.currencyMenu}
        value={currency}
        onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
      >
        {CURRENCY_ORDER.map((code) => (
          <option key={code} value={code}>
            {code}
          </option>
        ))}
      </select>
      <DxIcon name="chevronDown" size={12} strokeWidth={2.5} />
    </label>
  );
}

function ThemeButton() {
  const copy = useCopy();
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  const label = dark ? copy.theme.toLight : copy.theme.toDark;
  return (
    <button type="button" className="dx-icon-btn" onClick={toggle} aria-label={label} title={label}>
      <DxIcon name={dark ? 'sun' : 'moon'} />
    </button>
  );
}

/**
 * The bell, and the inbox behind it — the signed-in person's own
 * `GET /v1/notifications`. The dot means unread items exist and is drawn only
 * then; with no session there is no bell, except under `?demo=1`, where it
 * opens the demo's inbox and says so; marking read writes, and only for items
 * the server sent.
 */
function NotificationsMenu() {
  const copy = useCopy().dashboard;
  const { toast } = useDashboard();
  const [language] = useLanguage();
  const inboxApi = useInbox();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss<HTMLDivElement>(open, close);

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
          : fill(copy.acts.refused, { why: cause instanceof Error ? cause.message : String(cause) }),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dx-pop" ref={ref}>
      <button
        type="button"
        className="dx-icon-btn"
        aria-expanded={open}
        aria-controls="dx-inbox"
        title={copy.notifications}
        aria-label={
          unread > 0
            ? `${copy.notifications} · ${fill(copy.inbox.unread, { n: String(unread) })}`
            : copy.notifications
        }
        onClick={() => setOpen((value) => !value)}
      >
        <DxIcon name="bell" />
        {unread > 0 && <i className="dx-dot" aria-hidden />}
      </button>

      {open && (
        <div className="dx-menu dx-inbox" id="dx-inbox" role="region" aria-label={copy.notifications}>
          <div className="dx-inbox-head">
            <b>{copy.notifications}</b>
            {live !== null && unread > 0 && (
              <button
                type="button"
                className="dx-link"
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
            <p className="dx-inbox-note">
              {inboxApi.state.status === 'loading' ? copy.unmeasured.asking : copy.inbox.failed}
            </p>
          ) : inbox.items.length === 0 ? (
            <p className="dx-inbox-note">{copy.inbox.empty}</p>
          ) : (
            <ul className="dx-inbox-list">
              {inbox.items.map((item) => (
                <li key={item.id} data-unread={item.read_at === null ? 'true' : undefined}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{item.title}</b>
                    <p>{item.body}</p>
                    <time dateTime={item.created_at}>{when.format(new Date(item.created_at))}</time>
                  </div>
                  {live !== null && item.read_at === null && (
                    <button
                      type="button"
                      className="dx-icon-btn"
                      data-size="sm"
                      disabled={busy}
                      aria-label={`${copy.inbox.markRead}: ${item.title}`}
                      onClick={() => void mark([item.id])}
                    >
                      <DxIcon name="check" size={13} strokeWidth={2.4} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {live === null && inbox !== null && <p className="dx-inbox-note">{copy.inbox.sample}</p>}
        </div>
      )}
    </div>
  );
}

/** "Marta K." — v3's form of a name in the pill: the first word and an initial. */
function shortName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return words[0] ?? '';
  return `${words[0]} ${Array.from(words[words.length - 1])[0]}.`;
}

/**
 * Who is signed in, as v3's pill — and a real menu, because "Back to paylez"
 * lives in it: it is a way off the frame rather than a thing to do on it.
 */
function UserMenu() {
  const copy = useCopy();
  const { account, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss<HTMLDivElement>(open, close);
  const trigger = useRef<HTMLButtonElement>(null);

  if (!account?.type) return null;

  return (
    <div className="dx-pop" ref={ref}>
      <button
        ref={trigger}
        type="button"
        className="dx-user"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={copy.auth.accountMenu}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="dx-avatar" aria-hidden>
          <Face name={account.name} photo={account.profile.avatar} />
        </span>
        <span className="dx-user-name">{shortName(account.name)}</span>
      </button>

      {open && (
        <div className="dx-menu" role="menu">
          <a className="dx-menu-item" role="menuitem" href={PATHS.profile} onClick={close}>
            <DxIcon name="user" size={15} />
            {copy.profile.title}
          </a>
          {/* No close here: `#/` replaces this whole frame. */}
          <a className="dx-menu-item" role="menuitem" href={PATHS.landing}>
            <DxIcon name="house" size={15} />
            {copy.dashboard.backToSite}
          </a>
          <button
            type="button"
            role="menuitem"
            className="dx-menu-item"
            onClick={() => {
              close();
              signOut();
            }}
          >
            <DxIcon name="signOut" size={15} />
            {copy.auth.signOut}
          </button>
        </div>
      )}
    </div>
  );
}

function TopBar() {
  const copy = useCopy();
  const { account } = useAuth();
  const { screen, venues, venueId } = useDashboard();
  const crumb = copy.dashboard.screens[screen];
  /* The venue's own name when there is one — the switcher's choice — and the
     account's name only when this device knows no venue (the demo). */
  const business = venues.find((venue) => venue.id === venueId)?.name ?? account?.business?.name ?? account?.name;

  return (
    <header className="dx-bar">
      <div className="dx-crumb">
        <span>{business}</span>
        <span className="dx-crumb-sep" aria-hidden>
          /
        </span>
        {/* v3 crumbs the page title, not the rail word ("Partner analytics"). */}
        <b>{'title' in crumb ? crumb.title : crumb.name}</b>
      </div>
      <div className="dx-bar-spacer" />
      <div className="dx-bar-acts">
        <VenueSelect />
        <RangeSelect />
        <LanguageSelect />
        <CurrencySelect />
        <ThemeButton />
        <NotificationsMenu />
        <UserMenu />
      </div>
    </header>
  );
}

/* ──────────────────────────────────────────────── the two head buttons ── */

/** The public listing, as `GET /v1/venues/:id` serves it to the app. */
interface PublicListing {
  venue: {
    name: string;
    category: string | null;
    subcategory: string | null;
    city: string | null;
    address: string | null;
    priceRange: string | null;
    acceptsVouchers: boolean;
  };
}

/**
 * "Preview listing": the *customer's* view of the venue — the body the phone
 * reads — rather than a picture of the form, so it shows what was saved.
 */
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
    <Drawer kicker={copy.actions.preview} title={copy.acts.previewTitle} sub={copy.acts.previewLede} onClose={onClose}>
      {failed ? (
        <p className="dx-fine">{copy.unmeasured.serverSilent}</p>
      ) : listing === null ? (
        <p className="dx-fine">{copy.unmeasured.asking}</p>
      ) : (
        <div className="dx-phone">
          <div className="dx-phone-screen">
            <div className="dx-phone-cover" aria-hidden />
            <div className="dx-phone-body">
              <em>{[listing.venue.category, listing.venue.subcategory].filter(Boolean).join(' · ')}</em>
              <b>{listing.venue.name}</b>
              <p>{[listing.venue.address, listing.venue.city].filter(Boolean).join(', ')}</p>
              {listing.venue.priceRange && <p>{listing.venue.priceRange}</p>}
              <span>
                {listing.venue.acceptsVouchers ? copy.acts.previewVouchers : copy.acts.previewNoVouchers}
              </span>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}

/**
 * The secondary button above a frame-drawn head: export the month, or preview
 * the listing on the one screen that is the listing. A screen that draws its
 * own head calls `exportCsv` (`api/partner.ts`) itself; this one is the frame's.
 */
function HeadSecondary({ isProfile, onPreview }: { isProfile: boolean; onPreview: (venueId: string) => void }) {
  const copy = useCopy().dashboard;
  const { toast, venueId } = useDashboard();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (busy) return;
    if (venueId === null) {
      toast(copy.drawer.deal.needsSession);
      return;
    }
    setBusy(true);
    try {
      const file = await exportCsv(venueId);
      /* A blob and a synthetic click: the CSV arrives in the body, not at a URL. */
      const url = URL.createObjectURL(new Blob([file.csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
      toast(copy.actions.exported);
    } catch (cause) {
      toast(
        cause instanceof ApiError && cause.status === 403
          ? copy.acts.exportLocked
          : cause instanceof ApiError && cause.status === 0
            ? copy.acts.offline
            : fill(copy.acts.refused, { why: cause instanceof Error ? cause.message : String(cause) }),
      );
    } finally {
      setBusy(false);
    }
  };

  if (isProfile) {
    return (
      <Button
        variant="secondary"
        icon="eye"
        onClick={() => (venueId === null ? toast(copy.drawer.deal.needsSession) : onPreview(venueId))}
      >
        {copy.actions.preview}
      </Button>
    );
  }

  return (
    <Button variant="secondary" icon="download" disabled={busy} onClick={() => void download()}>
      {copy.actions.exportCsv}
    </Button>
  );
}

/**
 * What a frame-drawn head's primary button makes, by screen — v3's table:
 * a campaign above Loyalty campaigns and Scan activity, a hot deal above the
 * overview, deals, customers and the profile, and nothing where v3 draws
 * nothing (the vouchers ladder, the assistant) or where the press has no
 * endpoint yet (passes, team, the voucher register's "settings" jump, which
 * its rebuilt screen will draw for itself).
 */
const PRIMARY: Partial<Record<DashScreenId, DrawerKind>> = {
  overview: 'deal',
  deals: 'deal',
  campaigns: 'campaign',
  customers: 'deal',
  scans: 'campaign',
  profile: 'deal',
};

/** The head the frame draws for screens whose `head` is `'frame'`. */
function FrameHead({ id, onPreview }: { id: DashScreenId; onPreview: (venueId: string) => void }) {
  const copy = useCopy().dashboard;
  const { openDrawer, role } = useDashboard();
  const entry = copy.screens[id];
  const title = 'title' in entry ? entry.title : entry.name;
  /* A manager is not offered the profile's preview: the listing is the owner's. */
  const primary = id === 'profile' && role === 'manager' ? undefined : PRIMARY[id];

  return (
    <PageHead
      title={title}
      subtitle={entry.lede}
      actions={
        <>
          {!(id === 'profile' && role === 'manager') && (
            <HeadSecondary isProfile={id === 'profile'} onPreview={onPreview} />
          )}
          {primary && (
            <Button variant="primary" icon="plus" onClick={() => openDrawer(primary)}>
              {primary === 'deal' ? copy.actions.newDeal : copy.actions.newCampaign}
            </Button>
          )}
        </>
      }
    />
  );
}

/* ────────────────────────────────────────────────────────────────── page ── */

export function DashboardPage() {
  const [collapsed, setCollapsed] = useState(false);
  const [screen, setScreen] = useState<DashScreenId>('overview');
  /* `seq` keys the drawer, so opening it on a second target while it is open
     starts that form fresh rather than keeping the first one's typing. */
  const [drawer, setDrawer] = useState<(DrawerTarget & { seq: number }) | null>(null);
  const drawerSeq = useRef(0);
  /* Bumped by a write the drawer made, which re-mounts the page so the screen
     reads its lists again — `useApi` holds no cache to invalidate. */
  const [revision, setRevision] = useState(0);
  const [range, setRange] = useState<RangeDays>(RANGE_DAYS);
  /* Keyed by a counter so the same sentence twice in a row restarts the 3.2 s. */
  const [toastState, setToastState] = useState<{ text: string; seq: number } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [overlayRoot, setOverlayRoot] = useState<HTMLElement | null>(null);

  const directory = useVenueDirectory();
  const venueId = directory.chosen?.id ?? null;

  /*
   * A second rescan, keyed on the screen. `Site` keys its own on the route, and
   * the route does not change when the rail does — so without these, every
   * older panel after the first mounts with no `data-shown` and sits at
   * `opacity: 0`. The rebuilt screens do not use `data-reveal`; this stays for
   * the ones that still do.
   */
  const pageKey = `${screen}:${range}:${revision}:${venueId ?? '-'}`;
  useReveal(pageKey);
  useCountUp(pageKey);

  const shell = useMemo<DashboardShell>(
    () => ({
      screen,
      goTo: setScreen,
      venueId,
      venue: directory.row,
      venues: directory.venues,
      role: directory.chosen?.role ?? null,
      setVenue: directory.choose,
      overlayRoot,
      openDrawer: (kind: DrawerKind, dealId?: string, prefill?: DrawerPrefill, campaignId?: string) => {
        drawerSeq.current += 1;
        setDrawer({ kind, dealId, prefill, campaignId, seq: drawerSeq.current });
      },
      closeDrawer: () => setDrawer(null),
      refresh: () => setRevision((n) => n + 1),
      toast: (message: string) => setToastState((now) => ({ text: message, seq: (now?.seq ?? 0) + 1 })),
      range,
      setRange,
      openPlan: () => setPlanOpen(true),
    }),
    [screen, venueId, directory.row, directory.venues, directory.chosen, directory.choose, overlayRoot, range],
  );

  const head = DASH_SCREENS.find((entry) => entry.id === screen)?.head ?? 'frame';
  const dismiss = useCallback(() => setToastState(null), []);

  return (
    /*
     * `<main>` and not a `<div>`: `site.css` gives `z-index: 1` to `.site > main`
     * only, and the intro hand-off keys off `.site[data-intro='running'] main`.
     * `pd-app` stays beside `dx-app` because the screens not yet rebuilt read
     * `.pd-app`'s tokens (`--pd-glass`, `--pd-gap`, the ink scopes).
     */
    <SelectedVenueContext.Provider value={directory.selected}>
      <DashboardContext.Provider value={shell}>
        <main className="pd-app dx-app">
          <Rail
            collapsed={collapsed}
            onToggle={() => setCollapsed((on) => !on)}
            onOpenPlan={() => setPlanOpen(true)}
          />

          <div className="dx-main">
            <TopBar />

            <div className="dx-page" key={pageKey}>
              <div className="dx-screen">
                {head === 'frame' && <FrameHead id={screen} onPreview={setPreview} />}
                <DashboardScreen id={screen} />
              </div>
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
          {planOpen && <PlanSheet venueId={venueId} onClose={() => setPlanOpen(false)} />}
          {toastState && <Toast key={toastState.seq} message={toastState.text} onDone={dismiss} />}

          {/* Every kit overlay portals here — see `overlayRoot` on the shell. */}
          <div ref={setOverlayRoot} />
        </main>
      </DashboardContext.Provider>
    </SelectedVenueContext.Provider>
  );
}
