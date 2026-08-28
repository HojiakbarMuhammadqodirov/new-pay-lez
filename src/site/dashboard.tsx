import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DASH_SCREENS } from './content';
import {
  PD_ALLOCATION,
  PD_CAMPAIGN_MODEL,
  PD_DEALS,
  PD_RANGES,
  PD_VOUCHER_MODEL,
  RANGE_DAYS,
} from './partnerMetrics';
import type { RangeDays } from './partnerMetrics';
import { Icon } from './icons';
import { useCopy, useMoney } from './i18n/context';
import { fill } from './i18n/currency';
import { useAuth, initial } from './auth/context';
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
 * **All eight screens open.** Seven report a full month rather than the empty
 * state a brand-new venue is in — `partnerMetrics.ts` carries the prototype's
 * seeds *and* its arithmetic, so the overview's attribution, the deal claim
 * rates, the two budget pools and the cost per new customer are one calculation
 * seen from four screens. The eighth is the profile, the only one with a form
 * behind it.
 *
 * Two things belong to the frame rather than to any screen, and both are here
 * for the same reason the prototype puts them here: **the create drawer** —
 * reachable from six places and always the same panel — and **the confirmation
 * strip**, which is the one honest thing a button can do on a screen with no
 * server behind it. They are handed down through `DashboardContext` rather than
 * threaded as props through eight screens and forty buttons.
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
   * The plan card reads the same pool the Campaigns and Vouchers screens do.
   * It used to carry its own two numbers, which was fine while those screens
   * showed a venue's empty state and became a contradiction the moment they
   * started reporting: the rail said one budget was spent and the screen one
   * click away said another.
   */
  const spent = PD_CAMPAIGN_MODEL.spent + PD_VOUCHER_MODEL.spent;
  const used = spent / PD_ALLOCATION.total;

  /*
   * The two counts in the rail, and both are counted rather than written down.
   * The prototype hardcodes "3" against each; a badge that has to be edited by
   * hand when a deal is paused is a badge that will be wrong by Thursday.
   */
  const badges: Record<string, number> = {
    deals: PD_DEALS.filter((deal) => deal.state === 'live').length,
    campaigns: PD_CAMPAIGN_MODEL.list.filter((campaign) => campaign.live).length,
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
                {badges[entry.id] > 0 && <i className="rail-badge">{badges[entry.id]}</i>}
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
          <div className="plan-bar">
            {/* Amber is not available — the palette has one accent — so a budget
                running out is shown by the bar filling, not by changing hue. */}
            <i style={{ width: `${Math.min(100, used * 100).toFixed(1)}%` }} />
          </div>
          <span className="plan-usage">
            {fill(copy.dashboard.plan.usage, {
              used: money(spent, 'exact'),
              total: money(PD_ALLOCATION.total, 'exact'),
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
 * Unlike everything else on this frame it is *not* a control that has to
 * apologise for having no server: the numbers behind it are derived on this
 * device, so changing the window really does change every figure that depends
 * on it. That is why it is the one thing up here that is not `disabled`.
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
            <i aria-hidden>{initial(account)}</i>
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
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() =>
                    setToastText(
                      id === 'profile'
                        ? copy.dashboard.actions.previewing
                        : copy.dashboard.actions.exported,
                    )
                  }
                >
                  <Icon name={id === 'profile' ? 'eye' : 'download'} size={15} />
                  {id === 'profile'
                    ? copy.dashboard.actions.preview
                    : copy.dashboard.actions.exportCsv}
                </button>
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
        {toastText && <DashboardToast message={toastText} onDone={dismiss} />}
      </main>
    </DashboardContext.Provider>
  );
}
