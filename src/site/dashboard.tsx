import { useState } from 'react';
import { DASH_SCREENS } from './content';
import { PD_ALLOCATION, PD_CAMPAIGN_MODEL, PD_VOUCHER_MODEL } from './partnerMetrics';
import { Icon } from './icons';
import { useCopy, useMoney } from './i18n/context';
import { fill } from './i18n/currency';
import { useAuth, initial } from './auth/context';
import { BusinessForm } from './business';
import { DashboardScreen } from './dashboardScreens';
import { ThemeToggle } from './Header';
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
 * — same rail, same groups, same plan card — but every colour comes from the
 * site's tokens rather than that file's own palette, which is what gives this
 * screen a dark theme, five languages and the reader's own currency. The
 * surface is glass over the wash on `.pd-app`; see the `── the screens: glass ──`
 * block in `site.css` for what that costs and where it is turned off.
 *
 * **All seven screens open**, and six of them now report a full month rather
 * than the empty state a brand-new venue is in: `partnerMetrics.ts` carries the
 * prototype's seeds *and* its arithmetic, so the overview's attribution, the
 * deal claim rates, the two budget pools and the cost per new customer are one
 * calculation seen from four screens. The seventh is the profile, which is the
 * only one with a form behind it.
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
        <span className="pd-range">{copy.dashboard.range}</span>
        {/*
          The dashboard replaces the site header, and the theme toggle lived
          there — so without this the one screen an owner spends the most time
          on was the one screen with no way to switch. Same control, same
          `data-theme` cross-fade; it just needs its own mount here.
        */}
        <ThemeToggle />
        <button type="button" className="pd-icon" aria-label={copy.dashboard.notifications}>
          <Icon name="coin" size={17} />
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

export function DashboardPage() {
  const copy = useCopy();
  const [collapsed, setCollapsed] = useState(false);
  /* Opens on the overview, which is the first entry in the rail and the screen
     the prototype opens on. It used to open on the profile because that was the
     only screen with anything on it. */
  const [screen, setScreen] = useState(0);

  /*
   * A second rescan, keyed on the screen. `Site` keys its own on the route, and
   * the route does not change when the rail does — so without these, every panel
   * after the first mounts with no `data-shown` and sits at `opacity: 0`, and
   * its `[data-count]` figures never leave zero.
   */
  useReveal(screen);
  useCountUp(screen);

  return (
    /*
     * `<main>` and not a `<div>`: `site.css` gives `z-index: 1` to `.site > main`
     * only, and the intro hand-off keys off `.site[data-intro='running'] main`.
     * A dashboard in a plain div sits behind the page background.
     */
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
        <div className="pd-page" key={screen}>
          <div className="pd-head" data-reveal>
            <div>
              <h1>{copy.dashboard.screens[screen].name}</h1>
              <p>{copy.dashboard.screens[screen].lede}</p>
            </div>
            <a className="btn btn-ghost" href={PATHS.landing}>
              {copy.dashboard.backToSite}
            </a>
          </div>

          {screen === PROFILE ? <BusinessForm mode="profile" /> : <DashboardScreen index={screen} />}
        </div>
      </div>
    </main>
  );
}
