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
 * - **It reported and did not edit, and now it does both.** This bullet used to
 *   say the server had one write against a person and that this screen declined
 *   to call it. Both halves have changed: there are three now — suspend, set a
 *   password, close the account — and the last column calls them.
 *
 *   The reason for the old rule survives the change, because it was never about
 *   an operator being powerless. It was that a console editing somebody's
 *   *numbers* has to answer what happens when two operators disagree, and
 *   nothing here edits a number: every one of the three removes something or
 *   restores access to it, and every one writes an audit row with an actor on
 *   it. Two operators pressing "suspend" agree.
 *
 *   One row is exempt, and it is the row you are signed in as. An operator
 *   cannot suspend, close or reset their own account, or another operator's —
 *   banning your own row revokes your own session inside the request that did
 *   it, and there is no screen anywhere that undoes that. The server refuses;
 *   this screen does not draw the buttons, because a control that is always
 *   refused is a control that should not be there.

 *
 * ## What it does not show
 *
 * Everything in a profile that is not needed to tell two accounts apart. The
 * list carries the name, the address, how they signed in, the city and the
 * status; phone numbers, birthdays and occupations are a profile viewer and
 * this is a list somebody scans. `server/http/routes/admin.ts` draws that line
 * in the query rather than here, so it holds for every client.
 */
import { Fragment, useState } from 'react';
import { call, hasToken } from './api/client';
import { useApi } from './api/useApi';
import {
  removeUser,
  removeVenue,
  setUserBanned,
  setUserPassword,
  updateUser,
  updateVenue,
} from './api/admin';
import {
  ActPanel,
  ConfirmDialog,
  EditForm,
  PressTwice,
  RowActions,
  SetPassword,
  WriteStrip,
} from './adminControls';
import { useWrite } from './adminWrite';

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

/**
 * A venue waiting for somebody to look at it.
 *
 * The queue exists on the server and had nothing in it until the listing form
 * started submitting — see `submitVerification` in `api/partner.ts`. This is
 * the other half: the screen where a person actually looks.
 */
interface Pending {
  id: string;
  venue_id: string;
  venue_name: string;
  city: string | null;
  method: string;
  submitted_at: string;
}

/** A date, short, in the reader's own locale. The operator's day, not the row's. */
const day = (iso: string | null, locale: string) =>
  iso
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: '2-digit' }).format(
        new Date(iso),
      )
    : '—';

/**
 * One thing a row has asked to have destroyed. The console's own `Doomed`, kept
 * here rather than imported because these two files share no other type and a
 * module dependency for one four-field interface is a larger coupling than the
 * interface is worth.
 */
interface Doomed {
  key: string;
  what: string;
  body: string;
  run: () => Promise<unknown>;
}

export function AdminPeople({ editing }: { editing: boolean }) {
  const dictionary = useCopy();
  const [language] = useLanguage();
  const copy = dictionary.admin.database;
  const act = dictionary.admin.manage;
  const [view, setView] = useState<'users' | 'venues'>('users');
  /* One open panel across the table, keyed by what it is for. Two half-finished
     closures on one screen is two chances to finish the wrong one. */
  const [panel, setPanel] = useState<string | null>(null);
  /* And one dialogue, for the same reason — see `ConfirmDialog`. */
  const [doomed, setDoomed] = useState<Doomed | null>(null);
  const write = useWrite();


  const overview = useApi<Overview>('/v1/admin/overview');
  const pending = useApi<Pending[]>('/v1/admin/verifications');
  /* Decided here and now, so the row answers the press rather than waiting on a
     round trip. `reload` reconciles; a failure puts the row back. */
  const [decided, setDecided] = useState<Record<string, boolean>>({});
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

  /* Rows this operator has already decided are dropped immediately — the
     server is still the record, and `reload` reconciles. */
  const queue = (pending.state.status === 'ready' ? pending.state.data : []).filter(
    (row) => decided[row.id] === undefined,
  );

  const decide = async (id: string, approve: boolean) => {
    setDecided((current) => ({ ...current, [id]: approve }));
    try {
      await call(`/v1/admin/verifications/${encodeURIComponent(id)}`, {
        method: 'POST',
        body: { approve },
      });
      /* The venues table carries the verified flag, so it has to be re-read
         or the row it just approved goes on saying “not yet”. */
      venues.reload();
    } catch {
      /* Put it back rather than let the console claim a decision the server
         never took. */
      setDecided((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  };
  const venueRows = venues.state.status === 'ready' ? venues.state.data : [];
  const counts = overview.state.status === 'ready' ? overview.state.data : null;

  /*
   * The re-read every write hands over, and it is all four rather than the one
   * that was pressed: closing an account moves the count above the table as
   * well as the row inside it, and a suspended venue owner changes what the
   * queue is waiting on. A screen quietly out of step with the server is the
   * thing this whole file is written against.
   */
  const refresh = () => {
    users.reload();
    overview.reload();
    venues.reload();
    pending.reload();
  };


  return (
    <section className="adm-block" data-reveal>
      <div className="adm-block-head">
        <h2>{copy.title}</h2>
        <p>{copy.lede}</p>
      </div>

      {/* What the last press did, or why it did not — one strip for the whole
          tab, because the row it happened to is often the row that has just
          gone. */}
      <WriteStrip write={write} />


      {/*
        The review queue, and it sits above everything because it is the only
        thing on this screen somebody has to *do*.

        A venue is unverified until an operator looks at it, and an unverified
        venue can hold draft offers but cannot put one in front of a customer.
        So an owner who has finished their listing is waiting on this list, and
        every day it goes unread is a day their deals sit in a drawer. It is
        hidden entirely when empty rather than showing a cheerful zero: a queue
        that is always on screen is a queue that stops being read.
      */}
      {queue.length > 0 && (
        <div className="adm-queue">
          <span className="console-label">{copy.review.title}</span>
          <p>{copy.review.lede}</p>
          <ul>
            {queue.map((row) => (
              <li key={row.id}>
                <span>
                  <b>{row.venue_name}</b>
                  <span>{row.city ?? '—'}</span>
                </span>
                <span className="adm-queue-acts">
                  <button
                    type="button"
                    className="btn btn-solid adm-msg-move"
                    onClick={() => void decide(row.id, true)}
                  >
                    <Icon name="check" size={14} strokeWidth={2.4} />
                    {copy.review.approve}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost adm-msg-move"
                    onClick={() => void decide(row.id, false)}
                  >
                    {copy.review.reject}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
            <table className="adm-table adm-people-table">
              <thead>
                <tr>
                  {copy.userColumns.map((column) => (

                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((user) => {
                  /* An operator, or an account that has already been closed.
                     Neither has an honest button on this row: the server refuses
                     the first and there is nothing left to do to the second, and
                     a control that is always refused is a control that should
                     not be drawn. */
                  const operator = (user.roles ?? '').split(',').includes('admin');
                  const closed = user.status === 'erased';
                  const banKey = `user:${user.id}:ban`;
                  const passKey = `user:${user.id}:password`;
                  const closeKey = `user:${user.id}:close`;
                  const editKey = `user:${user.id}:edit`;
                  /* The address, or the id where there is none — a provisional
                     account has no email and still has to be confirmable against
                     something visible on the row in front of you. The server
                     folds the same pair. */
                  const handle = user.email ?? user.id;

                  return (
                    <Fragment key={user.id}>
                      <tr>
                        <td>
                          <b>{user.display_name || copy.unnamed}</b>
                          {user.roles && <span className="adm-db-role">{user.roles}</span>}
                        </td>
                        <td className="adm-mono adm-db-mail">{user.email ?? '—'}</td>

                        <td>{user.auth_provider}</td>
                        <td>{user.city ?? '—'}</td>
                        <td className="adm-db-num">{user.points}</td>
                        <td>
                          <span className="adm-role" data-role={user.status}>
                            {user.status}
                          </span>
                        </td>
                        <td className="adm-mono">{day(user.created_at, language)}</td>
                        <td className="adm-act-cell">
                          {operator || closed ? (
                            <span className="adm-sub">
                              {operator ? act.operatorRow : act.closedRow}
                            </span>
                          ) : (
                            <span className="adm-act-row">
                              <PressTwice
                                label={user.status === 'banned' ? act.letBackIn : act.ban}
                                icon={user.status === 'banned' ? 'play' : 'pause'}
                                busy={write.busy === banKey}
                                onPress={() =>
                                  write.run(
                                    banKey,
                                    () => setUserBanned(user.id, user.status !== 'banned'),
                                    refresh,
                                  )
                                }
                              />
                              <button
                                type="button"
                                className="btn btn-ghost adm-act-btn"
                                onClick={() => setPanel(panel === passKey ? null : passKey)}
                              >
                                <Icon name="lock" size={14} strokeWidth={2.2} />
                                {act.password}
                              </button>
                              {/* The pencil and the bin only in edit mode —
                                  every destructive control on this console is
                                  behind that switch now, and closing an account
                                  is the most destructive one there is. */}
                              {editing && (
                                <RowActions
                                  editing={panel === editKey}
                                  busy={write.busy === closeKey}
                                  onEdit={() => setPanel(panel === editKey ? null : editKey)}
                                  onDelete={() =>
                                    setDoomed({
                                      key: closeKey,
                                      what: user.display_name || handle,
                                      body: act.deleteUser,
                                      run: async () => {
                                        const result = await removeUser(user.id, handle);
                                        /* Which of the two endings the server
                                           gave it. They are different facts —
                                           see `removeUser` — and an operator
                                           who has just closed an account is
                                           owed the one that happened. */
                                        return result.outcome === 'deleted'
                                          ? act.userDeleted
                                          : act.userAnonymised;
                                      },
                                    })
                                  }
                                />
                              )}
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* The panels are their own rows rather than an overlay:
                          a table cell is not a place to grow a form, and a row
                          spanning the table keeps the field the full width the
                          `══ forms ══` kit expects. */}
                      {panel === passKey && (
                        <tr className="adm-act-tr">
                          <td colSpan={copy.userColumns.length}>
                            <ActPanel
                              title={fill(act.passwordFor, { who: user.display_name || handle })}
                              body={act.passwordBody}
                              onClose={() => setPanel(null)}
                            >
                              <SetPassword
                                busy={write.busy === passKey}
                                onSubmit={(password) =>
                                  write.run(
                                    passKey,
                                    async () => {
                                      await setUserPassword(user.id, password);
                                      setPanel(null);
                                      return act.passwordSet;
                                    },
                                    refresh,
                                  )
                                }
                              />
                            </ActPanel>
                          </td>
                        </tr>
                      )}

                      {panel === editKey && (
                        <tr className="adm-act-tr">
                          <td colSpan={copy.userColumns.length}>
                            {/*
                              What a person is *called*, not what they are worth.
                              No balance, no streak, no scan count, and no
                              address — that last one is the credential they sign
                              in with, and the tool for somebody locked out is
                              the password button on the same row.

                              The city and its country are one answer in two
                              halves and the server treats them that way: a city
                              off its own list of 114 is accepted only with a
                              country beside it. So the two fields are adjacent,
                              and the refusal that comes back names which half is
                              missing.
                            */}
                            <EditForm
                              fields={[
                                {
                                  key: 'name',
                                  label: act.fields.name,
                                  value: user.display_name,
                                },
                                { key: 'city', label: act.fields.city, value: user.city ?? '' },
                                {
                                  key: 'countryCode',
                                  label: act.fields.country,
                                  value: user.country_code ?? '',
                                },
                              ]}
                              busy={write.busy === editKey}
                              onClose={() => setPanel(null)}
                              onSave={(patch) =>
                                write.run(
                                  editKey,
                                  async () => {
                                    await updateUser(user.id, patch);
                                    setPanel(null);
                                    return act.saved;
                                  },
                                  refresh,
                                )
                              }
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
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
                {/* A seventh column only while it has something in it. A
                    permanently empty header is a column of nothing that every
                    other cell has to be measured against. */}
                {editing && <th>{act.editRow}</th>}
              </tr>
            </thead>
            <tbody>
              {venueRows.map((venue) => {
                const venueEditKey = `pvenue:${venue.id}:edit`;
                const venueDropKey = `pventue:${venue.id}:drop`;
                return (
                  <Fragment key={venue.id}>
                    <tr>
                      <td>
                        <b>{venue.name}</b>
                      </td>
                      <td>{venue.city ?? '—'}</td>
                      <td>{venue.category}</td>
                      <td>{venue.owner ?? '—'}</td>
                      <td className="adm-db-num">{venue.visits}</td>
                      <td>
                        {/* Verified is the gate a deal has to clear before it can
                            go live — see the drawer's `savedUnverified`. It is on
                            this table because "why will my offer not publish" is
                            answered here and nowhere else on the site. */}
                        <span
                          className="adm-role"
                          data-role={venue.verified_at ? 'active' : 'draft'}
                        >
                          {venue.verified_at ? copy.verified : copy.unverified}
                        </span>
                      </td>
                      {editing && (
                        <td className="adm-act-cell">
                          <RowActions
                            editing={panel === venueEditKey}
                            busy={write.busy === venueDropKey}
                            onEdit={() =>
                              setPanel(panel === venueEditKey ? null : venueEditKey)
                            }
                            onDelete={() =>
                              setDoomed({
                                key: venueDropKey,
                                what: venue.name,
                                body: act.deleteVenue,
                                run: async () => {
                                  const result = await removeVenue(venue.id, venue.name);
                                  return fill(act.venueDeleted, {
                                    n: String(result.offersDeleted),
                                  });
                                },
                              })
                            }
                          />
                        </td>
                      )}
                    </tr>

                    {panel === venueEditKey && (
                      <tr className="adm-act-tr">
                        <td colSpan={copy.venueColumns.length + 1}>
                          <EditForm
                            fields={[
                              { key: 'name', label: act.fields.name, value: venue.name },
                              { key: 'city', label: act.fields.city, value: venue.city ?? '' },
                              {
                                key: 'category',
                                label: act.fields.category,
                                value: venue.category,
                              },
                            ]}
                            busy={write.busy === venueEditKey}
                            onClose={() => setPanel(null)}
                            onSave={(patch) =>
                              write.run(
                                venueEditKey,
                                async () => {
                                  await updateVenue(venue.id, patch);
                                  setPanel(null);
                                  return act.saved;
                                },
                                refresh,
                              )
                            }
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="adm-db-note">
        <Icon name="shield" size={14} />
        {fill(copy.note, { n: String(rows.length) })}
      </p>

      {/* Its own dialogue rather than the console's, because this tab is a
          component the console renders and cannot reach into. Same kit, same
          shape, same rule: one at a time, closed before the request lands so the
          strip is the only thing reporting the ending. */}
      {doomed && (
        <ConfirmDialog
          title={fill(act.deleteTitle, { what: doomed.what })}
          body={doomed.body}
          action={act.deleteYes}
          busy={write.busy === doomed.key}
          onClose={() => setDoomed(null)}
          onConfirm={() => {
            const { key, run } = doomed;
            setDoomed(null);
            write.run(key, run, refresh);
          }}
        />
      )}
    </section>
  );
}
