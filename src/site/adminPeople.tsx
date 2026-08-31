/**
 * The sixth tab: what is actually in the server's database.
 *
 * ## Why this exists, when there is already a "People" tab
 *
 * Because they answer different questions, and until now only one of them was
 * being asked. The first three tabs are derived on *this device* from
 * `auth/directory.ts` — the accounts in this browser's `localStorage`. That is
 * the right source for them: they show the site's own demo directory, and the
 * console has always been able to read it because it is sitting in the same
 * storage.
 *
 * It is not, however, where the people are. Somebody who signs in with Google
 * on their phone is a row in `users` on the server and has never touched this
 * browser — so the operator's actual question, *"who has signed up"*, had no
 * screen anywhere on the site. It was answerable only over SSH with `sqlite3`,
 * which is not a place a product is inspected from.
 *
 * So: this tab is the server, plainly labelled as the server, beside the local
 * tabs rather than replacing them. Two tables that mean two things is better
 * than one table that means whichever it happens to be reading.
 *
 * ## The rules it inherits
 *
 * Both from `adminWebsite.tsx`, which established them, and both worth
 * restating because they are what makes an operator able to trust the screen:
 *
 * - **A failed request is a state, not an empty database.** `useApi` returns
 *   `loading | ready | error` so that "the backend is not answering" cannot
 *   render as "nobody has signed up". Somebody reading an empty table believes
 *   it.
 * - **It reports; it does not edit.** The server has exactly one write against
 *   a person (`/users/:id/ban`) and this screen does not call it. A console
 *   that edits somebody else's account has to answer what happens when two
 *   operators disagree, which is a decision, not a table.
 *
 * ## What it does not show
 *
 * Everything in a profile that is not needed to tell two accounts apart. The
 * list carries the name, the address, how they signed in, the city and the
 * status; phone numbers, birthdays and occupations are a profile viewer and
 * this is a list somebody scans. `server/http/routes/admin.ts` draws that line
 * in the query rather than here, so it holds for every client.
 */
import { useState } from 'react';
import { hasToken } from './api/client';
import { useApi } from './api/useApi';
import { Icon } from './icons';
import { PATHS } from './router';
import { useCopy, useLanguage } from './i18n/context';
import { fill } from './i18n/currency';

interface ServerUser {
  id: string;
  display_name: string;
  email: string | null;
  auth_provider: string;
  city: string | null;
  country_code: string | null;
  status: string;
  language: string;
  onboarded_at: string | null;
  created_at: string;
  points: number;
  scans: number;
  vouchers: number;
  roles: string | null;
}

interface ServerVenue {
  id: string;
  name: string;
  city: string | null;
  category: string;
  status: string;
  verified_at: string | null;
  owner: string | null;
  visits: number;
  customers: number;
}

interface Overview {
  users: number;
  venues: number;
  points: { issued: number; redeemed: number; ratio: number };
}

/** A date, short, in the reader's own locale. The operator's day, not the row's. */
const day = (iso: string | null, locale: string) =>
  iso
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: '2-digit' }).format(
        new Date(iso),
      )
    : '—';

export function AdminPeople() {
  const dictionary = useCopy();
  const [language] = useLanguage();
  const copy = dictionary.admin.database;
  const [view, setView] = useState<'users' | 'venues'>('users');

  const overview = useApi<Overview>('/v1/admin/overview');
  const users = useApi<ServerUser[]>('/v1/admin/users?limit=200');
  const venues = useApi<ServerVenue[]>('/v1/admin/venues?limit=200');

  /*
   * **No second sign-in.**
   *
   * Reaching this screen at all means `resolveRoute` saw an account whose type
   * is `admin`, and that type comes from `roles` on the *server's* session —
   * so a token is already in hand. The panel that used to ask for the
   * operations address and password here was a second login for the same
   * person, with a different account, on one screen; it is gone, and the seeded
   * browser admin it existed beside is gone with it.
   *
   * What can still happen is the token expiring under a session this browser
   * still remembers. That is not a password prompt, it is a stale sign-in, and
   * the honest thing is to say so and send them to the front door.
   */
  if (!hasToken()) {
    return (
      <section className="adm-block" data-reveal>
        <div className="adm-block-head">
          <h2>{dictionary.admin.website.expired.title}</h2>
          <p>{dictionary.admin.website.expired.body}</p>
        </div>
        <div className="adm-actions">
          <a className="btn" href={PATHS.signin}>
            {dictionary.admin.website.expired.again}
          </a>
        </div>
      </section>
    );
  }

  /* One failure is enough to know the server is not answering; three stacked
     "unreachable" panels is noise rather than information. */
  if (users.state.status === 'error') {
    const { error } = users.state;
    return (
      <section className="adm-block" data-reveal>
        <div className="adm-block-head">
          <h2>{dictionary.admin.website.down.title}</h2>
          <p>
            {error.status === 0
              ? dictionary.admin.website.down.unreachable
              : dictionary.admin.website.down.refused}
          </p>
        </div>
        <div className="adm-actions">
          <button className="btn" type="button" onClick={users.reload}>
            {dictionary.admin.website.down.retry}
          </button>
        </div>
      </section>
    );
  }

  if (users.state.status === 'loading') {
    return <p className="adm-empty">{dictionary.admin.website.loading}</p>;
  }

  const rows = users.state.data;
  const venueRows = venues.state.status === 'ready' ? venues.state.data : [];
  const counts = overview.state.status === 'ready' ? overview.state.data : null;

  return (
    <section className="adm-block" data-reveal>
      <div className="adm-block-head">
        <h2>{copy.title}</h2>
        <p>{copy.lede}</p>
      </div>

      {/* The three figures that say how big the thing is. `counts` may still be
          resolving while the tables are up — an em dash rather than a 0, for the
          reason the whole file is about. */}
      <div className="adm-db-counts">
        <div>
          <b>{counts ? counts.users : '—'}</b>
          <span>{copy.counts.users}</span>
        </div>
        <div>
          <b>{counts ? counts.venues : '—'}</b>
          <span>{copy.counts.venues}</span>
        </div>
        <div>
          <b>{counts ? counts.points.issued : '—'}</b>
          <span>{copy.counts.issued}</span>
        </div>
      </div>

      <div className="adm-chips" role="group" aria-label={copy.switch}>
        <button
          type="button"
          className="adm-chip"
          data-on={view === 'users' ? 'true' : undefined}
          onClick={() => setView('users')}
        >
          {copy.tables.users}
          <b>{rows.length}</b>
        </button>
        <button
          type="button"
          className="adm-chip"
          data-on={view === 'venues' ? 'true' : undefined}
          onClick={() => setView('venues')}
        >
          {copy.tables.venues}
          <b>{venueRows.length}</b>
        </button>
      </div>

      {view === 'users' ? (
        rows.length === 0 ? (
          <p className="adm-empty">{copy.noUsers}</p>
        ) : (
          <div className="adm-scroll">
            <table className="adm-table">
              <thead>
                <tr>
                  {copy.userColumns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <b>{user.display_name || copy.unnamed}</b>
                      {user.roles && <span className="adm-db-role">{user.roles}</span>}
                    </td>
                    <td className="adm-mono">{user.email ?? '—'}</td>
                    <td>{user.auth_provider}</td>
                    <td>{user.city ?? '—'}</td>
                    <td className="adm-db-num">{user.points}</td>
                    <td>
                      <span className="adm-role" data-role={user.status}>
                        {user.status}
                      </span>
                    </td>
                    <td className="adm-mono">{day(user.created_at, language)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : venueRows.length === 0 ? (
        <p className="adm-empty">{copy.noVenues}</p>
      ) : (
        <div className="adm-scroll">
          <table className="adm-table">
            <thead>
              <tr>
                {copy.venueColumns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {venueRows.map((venue) => (
                <tr key={venue.id}>
                  <td>
                    <b>{venue.name}</b>
                  </td>
                  <td>{venue.city ?? '—'}</td>
                  <td>{venue.category}</td>
                  <td>{venue.owner ?? '—'}</td>
                  <td className="adm-db-num">{venue.visits}</td>
                  <td>
                    {/* Verified is the gate a deal has to clear before it can go
                        live — see the drawer's `savedUnverified`. It is on this
                        table because "why will my offer not publish" is answered
                        here and nowhere else on the site. */}
                    <span className="adm-role" data-role={venue.verified_at ? 'active' : 'draft'}>
                      {venue.verified_at ? copy.verified : copy.unverified}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="adm-db-note">
        <Icon name="shield" size={14} />
        {fill(copy.note, { n: String(rows.length) })}
      </p>
    </section>
  );
}
