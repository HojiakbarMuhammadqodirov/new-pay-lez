import { useMemo, useState } from 'react';
import {
  ADMIN_DEALS,
  ADMIN_SERVICES,
  ADMIN_TABS,
  BUSINESS_CATEGORIES,
  PLATFORM,
  type AdminService,
} from './content';
import { ServiceAnalytics } from './adminAnalytics';
import { AdminWebsite } from './adminWebsite';
import { ThemeToggle } from './Header';
import { Icon } from './icons';
import { useCopy } from './i18n/context';
import { fill } from './i18n/currency';
import { initial, useAuth } from './auth/context';
import { profileCompleteness } from './auth/business';
import { listUsers } from './auth/directory';
import type { UserRecord } from './auth/users';
import { PATHS } from './router';
import { useCountUp, useReveal } from './useReveal';

/**
 * The operator's console — the third signed-in experience.
 *
 * A frame rather than a page, like the partner dashboard: no marketing header,
 * no footer, no backdrop. It is the original admin panel rebuilt in this site's
 * system — the B2B dashboard's service catalogue and offers
 * (`landing/screenshots/admin-b2b*.png`), the per-venue Partner Analytics behind
 * each one (`admin-analytics*.png`), and one thing that panel never had: the
 * people. Accounts are ours, they are real, and an operator's first question
 * about a platform is who is on it.
 *
 * Two kinds of venue sit in one list on purpose. The seeded five are a
 * platform-shaped month (`ADMIN_SERVICES` → `adminMetrics.ts`); the sixth is the
 * listing a real signed-up owner saved, carried in from the directory with no
 * traffic behind it. That is not a gap in the demo — every screenshot in that
 * folder was taken on a venue in exactly that state, and having both in one
 * table is the only way to see that the empty states are reached by arithmetic
 * rather than by a special case.
 *
 * **It reports; it does not edit.** There is no server, so the honest console is
 * one that reads — the numbers are derived by the same pure functions the app
 * uses, and `profileCompleteness` decides "live" here exactly as it does on the
 * owner's own dashboard.
 *
 * Classes are `adm-` prefixed for the reason `site.css` demands it: one unscoped
 * sheet, and `.dash-*` has already collided once.
 */

/* ────────────────────────────────────────────────────────────────── bits ── */

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="adm-kpi" data-reveal>
      <b data-count={value} data-group=" ">
        0
      </b>
      <span>{label}</span>
    </div>
  );
}

/** What a row's owner has to show for themselves, in one cell. */
function State({ user }: { user: UserRecord }) {
  const copy = useCopy();

  if (user.player) {
    return (
      <span>
        {fill(copy.admin.state.player, {
          points: String(user.player.points),
          streak: String(user.player.streak),
        })}
      </span>
    );
  }

  if (user.type === 'business') {
    if (!user.business) return <span className="adm-dim">{copy.admin.state.noListing}</span>;
    const { percent } = profileCompleteness(user.business);
    return percent === 100 ? (
      <span className="adm-live">
        <Icon name="check" size={13} strokeWidth={3} />
        {copy.admin.state.live}
      </span>
    ) : (
      <span>{fill(copy.admin.state.listing, { percent: String(percent) })}</span>
    );
  }

  return <span className="adm-dim">{copy.admin.state.none}</span>;
}

/* ────────────────────────────────────────────────────────────── services ── */

function ServiceCard({
  service,
  live,
  onOpen,
}: {
  service: AdminService;
  live: boolean;
  onOpen: () => void;
}) {
  const dictionary = useCopy();
  const copy = dictionary.admin.services;
  const [copied, setCopied] = useState(false);

  /*
   * The clipboard is not guaranteed — it needs a secure context and the user's
   * permission — so the id stays visible and selectable either way, and the
   * button only ever adds a shortcut. A silent failure would be a button that
   * does nothing; this one just does not confirm.
   */
  const copyId = () => {
    navigator.clipboard?.writeText(service.id).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      },
      () => undefined,
    );
  };

  return (
    <li className="adm-service" data-reveal>
      <span className="adm-logo" aria-hidden>
        {service.logo}
      </span>

      <div className="adm-service-body">
        <b>{service.name}</b>
        {/* No star for a venue with no customers. "★ 0.0" is not a rating of
            zero, it is the absence of one, and the listing form says as much:
            the rating comes from the app and an owner cannot type one. */}
        <span className="adm-sub">
          {[
            dictionary.business.categories[service.category],
            service.city,
            service.rating > 0 ? `★ ${service.rating.toFixed(1)}` : null,
            service.vouchers ? copy.vouchers : null,
            live ? copy.live : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span className="adm-id">
          <span className="adm-sub">{copy.serviceId}</span>
          <code>{service.id}</code>
          <button type="button" className="link-btn" onClick={copyId}>
            {copied ? copy.copied : copy.copy}
          </button>
        </span>
      </div>

      <div className="adm-service-side">
        <span className="adm-state" data-on={service.active ? 'true' : undefined}>
          {service.active ? copy.active : copy.paused}
        </span>
        <button type="button" className="btn btn-ghost" onClick={onOpen}>
          <Icon name="bars" size={14} />
          {copy.analytics}
        </button>
      </div>
    </li>
  );
}

/* ────────────────────────────────────────────────────────────────── page ── */

export function AdminPage() {
  const dictionary = useCopy();
  const copy = dictionary.admin;
  const { account, signOut } = useAuth();

  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  /* A rescan per tab. `Site` keys its own on the route, and pressing a tab does
     not change the route — see the same note in `dashboard.tsx`. */
  useReveal(`${tab}:${openId}`);
  useCountUp(`${tab}:${openId}`);

  /*
   * Read once. Nothing on this screen writes to the directory, and nobody else
   * is writing to it while an admin is looking at it — this build has one tab's
   * worth of world. Re-reading on every render would re-parse the whole store
   * for a table that cannot have changed.
   */
  const users = useMemo(() => listUsers(), []);

  /**
   * Every venue on the platform: the seeded five, then the real listings.
   *
   * A saved listing becomes a service with `scale: 0` — no traffic, because it
   * genuinely has none — and its "service id" is the account id it belongs to,
   * which is the only stable handle this build has for it.
   */
  const services = useMemo<Array<AdminService & { live: boolean }>>(() => {
    const live = users
      /* `flatMap` rather than filter-then-map: it is the narrowing the compiler
         understands, so the listing below is a `BusinessProfile` rather than a
         maybe-null one with an assertion after it. */
      .flatMap((user) => (user.business ? [{ user, listing: user.business }] : []))
      .map(({ user, listing }) => {
        return {
          id: user.id,
          logo: listing.name.trim().charAt(0).toUpperCase() || '?',
          name: listing.name,
          category: Math.max(0, BUSINESS_CATEGORIES.findIndex((c) => c.id === listing.category)),
          city: listing.city,
          /* No customers, so no rating. The listing form says so itself: the
             rating comes from the app and an owner cannot type one. */
          rating: 0,
          vouchers: false,
          active: profileCompleteness(listing).percent === 100,
          scale: 0,
          live: true,
        };
      });

    return [...ADMIN_SERVICES.map((service) => ({ ...service, live: false })), ...live];
  }, [users]);

  const open = services.find((service) => service.id === openId) ?? null;

  const needle = query.trim().toLowerCase();
  const match = (...fields: string[]) =>
    needle === '' || fields.join(' ').toLowerCase().includes(needle);

  const shownServices = services.filter((service) =>
    match(service.name, service.city, service.id),
  );
  const shownDeals = ADMIN_DEALS.filter((deal) => match(deal.name, deal.country));
  const shownUsers = users.filter((user) => match(user.name, user.email));

  const players = users.filter((user) => user.type === 'individual').length;
  const kpis = [
    PLATFORM.services,
    PLATFORM.active,
    PLATFORM.deals,
    PLATFORM.activeDeals,
    users.length,
    players,
  ];

  return (
    /* `<main>` and not a `<div>`, for the same reason the dashboard is one:
       `site.css` gives `z-index: 1` to `.site > main` only. */
    <main className="adm-app">
      <header className="adm-bar">
        <a className="adm-brand" href={PATHS.landing}>
          <span className="adm-word">paylez</span>
          <span className="adm-tag">{copy.tag}</span>
        </a>

        <div className="adm-actions">
          <ThemeToggle />
          <a className="btn btn-ghost" href={PATHS.landing}>
            {copy.back}
          </a>
          {account && (
            <span className="adm-user">
              <i aria-hidden>{initial(account)}</i>
              <span>
                <b>{account.name.split(' ')[0]}</b>
                <span>{dictionary.auth.roles.admin}</span>
              </span>
            </span>
          )}
          <button type="button" className="btn btn-ghost" onClick={signOut}>
            {dictionary.auth.signOut}
          </button>
        </div>
      </header>

      <div className="adm-page">
        {open ? (
          <ServiceAnalytics
            service={open}
            live={open.live}
            onBack={() => setOpenId(null)}
          />
        ) : (
          <>
            <div className="adm-head" data-reveal>
              <h1>{copy.title}</h1>
              <p>{copy.lede}</p>
            </div>

            <div className="adm-kpis">
              {kpis.map((value, index) => (
                <Kpi key={copy.kpis[index]} label={copy.kpis[index]} value={value} />
              ))}
            </div>

            <div className="adm-toolbar" data-reveal>
              <label className="adm-search adm-search-lg">
                <Icon name="search" size={16} className="adm-search-ico" />
                <input
                  type="search"
                  placeholder={copy.search}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>

              <div className="adm-tabs" role="tablist" aria-label={copy.tag}>
                {copy.tabs.map((name, index) => (
                  <button
                    key={name}
                    type="button"
                    role="tab"
                    aria-selected={tab === index}
                    className="adm-tab"
                    data-on={tab === index ? 'true' : undefined}
                    onClick={() => setTab(index)}
                  >
                    <Icon name={ADMIN_TABS[index]} size={15} />
                    {name}
                  </button>
                ))}
              </div>
            </div>

            {/* Keyed on the tab so the reveal observer rescans and the new panel
                fades in rather than arriving at `opacity: 0`. */}
            <div key={tab} className="adm-stack">
              {tab === 0 ? (
                <section className="adm-block" data-reveal>
                  <div className="adm-block-head">
                    <h2>{copy.services.title}</h2>
                    <p>{copy.services.lede}</p>
                  </div>
                  {shownServices.length === 0 ? (
                    <p className="adm-empty">{copy.noMatch}</p>
                  ) : (
                    <ul className="adm-list">
                      {shownServices.map((service) => (
                        <ServiceCard
                          key={service.id}
                          service={service}
                          live={service.live}
                          onOpen={() => setOpenId(service.id)}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              ) : tab === 1 ? (
                <section className="adm-block" data-reveal>
                  <div className="adm-block-head">
                    <h2>{copy.deals.title}</h2>
                    <p>{copy.deals.lede}</p>
                  </div>
                  {shownDeals.length === 0 ? (
                    <p className="adm-empty">{copy.noMatch}</p>
                  ) : (
                    <ul className="adm-list">
                      {shownDeals.map((deal) => (
                        <li className="adm-service" key={deal.id} data-reveal>
                          <span className="adm-logo" aria-hidden>
                            {deal.logo}
                          </span>
                          <div className="adm-service-body">
                            <b>{deal.name}</b>
                            <span className="adm-sub">
                              {copy.deals.kinds[deal.kind]} · {deal.country} ·{' '}
                              {fill(copy.deals.until, { date: deal.until })}
                            </span>
                          </div>
                          <div className="adm-service-side">
                            <span
                              className="adm-state"
                              data-on={deal.active ? 'true' : undefined}
                            >
                              {deal.active ? copy.services.active : copy.services.paused}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : tab === 3 ? (
                /* The one tab that is not derived on this device — it asks the
                   backend, and says so when the backend is not there. */
                <AdminWebsite />
              ) : (
                <section className="adm-block" data-reveal>
                  <div className="adm-block-head">
                    <h2>{copy.people.title}</h2>
                    <p>{copy.people.lede}</p>
                  </div>

                  {shownUsers.length === 0 ? (
                    <p className="adm-empty">{copy.noMatch}</p>
                  ) : (
                    /* The table scrolls inside its own box rather than widening
                       the page — five columns of addresses do not fit a phone. */
                    <div className="adm-scroll">
                      <table className="adm-table">
                        <thead>
                          <tr>
                            {copy.people.columns.map((column) => (
                              <th key={column}>{column}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {shownUsers.map((user) => (
                            <tr key={user.id}>
                              <td>
                                <span className="adm-who">
                                  <i aria-hidden>{initial(user)}</i>
                                  <b>{user.name}</b>
                                </span>
                              </td>
                              <td className="adm-mono">{user.email}</td>
                              <td>
                                {user.type ? (
                                  <span className="adm-role" data-role={user.type}>
                                    {dictionary.auth.roles[user.type]}
                                  </span>
                                ) : (
                                  <span className="adm-dim">{copy.state.undecided}</span>
                                )}
                              </td>
                              <td className="adm-mono">{user.created}</td>
                              <td>
                                <State user={user} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </div>

            {/* The same honesty the assistant panel practises: say what is not
                connected rather than draw a control that pretends to be. */}
            <p className="adm-note" data-reveal>
              <Icon name="shield" size={15} />
              {copy.note}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
