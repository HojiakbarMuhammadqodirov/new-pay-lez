/**
 * The console's fourth tab: the website itself.
 *
 * Every other screen in `admin.tsx` is derived on this device — `adminMetrics.ts`
 * turns one `scale` per venue into a whole month, and the people come out of the
 * local directory. This one cannot be, and that is the point of it. "Who visited
 * the site, and how often" is a question about people who never signed in and
 * never touched this browser, so it is the one screen that has to ask the
 * server. It is therefore also the first screen in `src/` that does.
 *
 * That makes it the odd one out in a way worth stating, because the temptation
 * is to smooth it over: **when the backend is not running, this tab says so.**
 * It does not fall back to invented figures, and it does not borrow the seeded
 * numbers the other tabs use. A console whose traffic chart looks the same
 * whether or not anything is connected is worse than no chart.
 *
 * The one figure that needs a word is the one that is deliberately absent.
 * `server/domain/traffic.ts` identifies a visitor by a hash that rotates every
 * day, so nobody can be followed from Tuesday to Wednesday — which means
 * "returning visitors" is not merely unmeasured, it is unmeasurable, and the API
 * returns `anonymousReturningVisitors: null` to say so out loud. This renders
 * that as a sentence rather than a number. Rendering it as 0 would be the same
 * lie `suppressed` exists to prevent on the partner side, and the reason is
 * identical: a person reading 0 believes it.
 *
 * Classes are `adm-` prefixed and reuse the console's existing kit — `.adm-kpis`,
 * `.adm-bar-row`, `.adm-table` — rather than introducing a parallel one.
 */
import { useState } from 'react';
import { ApiError, hasToken, signIn, signOut } from './api/client';
import { useApi } from './api/useApi';
import { Icon } from './icons';
import { useCopy } from './i18n/context';
import { fill } from './i18n/currency';

/* ─────────────────────────────────────────────────────────────── shapes ── */

interface Bucket {
  key: string | null;
  sessions: number;
}

interface TrafficReport {
  range: { from: string; to: string };
  sessions: number;
  views: number;
  actions: number;
  dailyVisitors: number;
  signedInSessions: number;
  accounts: { seen: number; returning: number };
  anonymousReturningVisitors: null;
  trend: { day: string; visitors: number; sessions: number; views: number }[];
  pages: { path: string; views: number; sessions: number }[];
  topActions: { name: string; count: number }[];
  referrers: { key: string; sessions: number }[];
  countries: Bucket[];
  languages: Bucket[];
  devices: Bucket[];
  accountTypes: Bucket[];
}

interface ActivityFeed {
  events: { at: string; kind: string; subject: string; detail: string | null }[];
}

interface PlatformUser {
  id: string;
  display_name: string;
  city: string | null;
  status: string;
  created_at: string;
  points: number;
  scans: number;
  vouchers: number;
  roles: string | null;
  last_seen: string | null;
}

/* ──────────────────────────────────────────────────────────────── pieces ── */

function Bar({ label, value, of }: { label: string; value: number; of: number }) {
  return (
    <div className="adm-bar-row">
      <span className="adm-bar-label">{label}</span>
      <span className="adm-bar-track">
        {/* A floor of 2%, so a real row with one visit is still visibly a row
            rather than an empty track that reads as zero. */}
        <i style={{ width: `${of > 0 ? Math.max(2, (value / of) * 100) : 0}%` }} />
      </span>
      <b>{value}</b>
    </div>
  );
}

function Buckets({ title, rows, empty }: { title: string; rows: Bucket[]; empty: string }) {
  const of = rows.reduce((max, row) => Math.max(max, row.sessions), 0);
  return (
    <div className="adm-block" data-reveal>
      <div className="adm-block-head">
        <h2>{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="adm-empty">{empty}</p>
      ) : (
        <div className="adm-bars">
          {rows.map((row) => (
            <Bar key={row.key ?? 'unknown'} label={row.key ?? '—'} value={row.sessions} of={of} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The daily trend.
 *
 * DOM rather than canvas, like every other chart on this site, and it states its
 * own height in `site.css` — a percentage height against an `auto` parent
 * resolves to nothing, which is the bug `.adm-compare-cols` was written to fix.
 */
function Trend({ rows, label }: { rows: TrafficReport['trend']; label: string }) {
  const peak = rows.reduce((max, row) => Math.max(max, row.visitors), 0);
  return (
    <div className="adm-block" data-reveal>
      <div className="adm-block-head">
        <h2>{label}</h2>
      </div>
      <div className="adm-web-trend">
        {rows.map((row) => (
          <span
            key={row.day}
            /* A day with nobody on it draws nothing. The 3% floor is there so a
               day with one visitor is still visible against a peak of four
               hundred, and it used to catch zero on the way past — which drew
               the same mark for "nobody came" as for "one person came", on the
               one tab whose whole argument is that absent and present are
               different states. The column keeps its slot in the flex row, so
               the axis still has every day on it; only the bar is gone. */
            style={{
              height: `${row.visitors > 0 && peak > 0 ? Math.max(3, (row.visitors / peak) * 100) : 0}%`,
            }}
            title={`${row.day} — ${row.visitors}`}
          />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────── the connect gate ── */

/**
 * The console signs in to the API separately from the site.
 *
 * Deliberately, and it is not a stopgap to tidy away later: the site's admin is
 * a seed in `auth/users.ts` and the server's is whoever `PAYLEZ_ADMIN_EMAIL`
 * provisioned at boot. They are two directories, and quietly reusing the
 * password typed on `#/signin` would fail at the first request in a way nobody
 * could diagnose. When the site's own auth moves to the server this panel is
 * what disappears.
 */
function Connect({ onDone, copy }: { onDone: () => void; copy: WebsiteCopy }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <section className="adm-block" data-reveal>
      <div className="adm-block-head">
        <h2>{copy.connect.title}</h2>
        <p>{copy.connect.lede}</p>
      </div>
      <form
        className="form-block"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          signIn(email, password)
            .then((result) => {
              /* An operator who signs in with a customer's credentials gets a
                 token that works and a console that 403s on every panel. Saying
                 so here is the only place it reads as one problem. */
              if (!result.roles.includes('admin')) {
                signOut();
                setError(copy.connect.notAdmin);
                return;
              }
              onDone();
            })
            .catch((cause: unknown) => {
              setError(
                cause instanceof ApiError && cause.status === 0
                  ? copy.connect.unreachable
                  : copy.connect.refused,
              );
            })
            .finally(() => setBusy(false));
        }}
      >
        <label className="field-row">
          <span className="field-label">{copy.connect.email}</span>
          <input
            className="field"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="field-row">
          <span className="field-label">{copy.connect.password}</span>
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error === null ? null : <p className="field-error">{error}</p>}
        <button className="btn" type="submit" disabled={busy}>
          {busy ? copy.connect.working : copy.connect.submit}
        </button>
      </form>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────── screen ── */

type WebsiteCopy = ReturnType<typeof useCopy>['admin']['website'];

export function AdminWebsite() {
  const copy = useCopy().admin.website;
  const [connected, setConnected] = useState(hasToken);

  const traffic = useApi<TrafficReport>(connected ? '/v1/admin/traffic' : null);
  const activity = useApi<ActivityFeed>(connected ? '/v1/admin/activity?limit=40' : null);
  const users = useApi<PlatformUser[]>(connected ? '/v1/admin/users?limit=100' : null);

  if (!connected) {
    return (
      <Connect
        copy={copy}
        onDone={() => {
          setConnected(true);
        }}
      />
    );
  }

  /* One failure is enough to know the server is not answering; showing three
     identical "unreachable" panels stacked is noise, not information. */
  if (traffic.state.status === 'error') {
    const { error } = traffic.state;
    return (
      <section className="adm-block" data-reveal>
        <div className="adm-block-head">
          <h2>{copy.down.title}</h2>
          <p>{error.status === 0 ? copy.down.unreachable : copy.down.refused}</p>
        </div>
        <div className="adm-actions">
          <button className="btn" type="button" onClick={traffic.reload}>
            {copy.down.retry}
          </button>
          <button
            /* `btn-ghost`, one dash. `btn--ghost` matched nothing, so the
               destructive secondary rendered as a bare `.btn` — visually
               identical to the "Retry" primary beside it. */
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              signOut();
              setConnected(false);
            }}
          >
            {copy.down.disconnect}
          </button>
        </div>
      </section>
    );
  }

  if (traffic.state.status === 'loading') {
    return <p className="adm-empty">{copy.loading}</p>;
  }

  const report = traffic.state.data;

  return (
    <>
      <section className="adm-block" data-reveal>
        <div className="adm-block-head">
          <h2>{copy.title}</h2>
          <p>{fill(copy.lede, { from: report.range.from, to: report.range.to })}</p>
        </div>
        <div className="adm-kpis">
          {[
            [copy.kpis[0]!, report.dailyVisitors],
            [copy.kpis[1]!, report.sessions],
            [copy.kpis[2]!, report.views],
            [copy.kpis[3]!, report.actions],
            [copy.kpis[4]!, report.signedInSessions],
            [copy.kpis[5]!, report.accounts.returning],
          ].map(([label, value]) => (
            <div className="adm-kpi" key={label as string}>
              <b data-count={value} data-group=" ">
                0
              </b>
              <span>{label as string}</span>
            </div>
          ))}
        </div>
        {/*
         * The absent figure, said out loud. See the file header: this is null
         * rather than 0 because the visitor hash rotates daily by design, and a
         * console that printed 0 here would be believed.
         */}
        <p className="adm-note">
          <Icon name="shield" size={14} /> {copy.privacy}
        </p>
      </section>

      <Trend rows={report.trend} label={copy.trend} />

      <div className="adm-two">
        <div className="adm-block" data-reveal>
          <div className="adm-block-head">
            <h2>{copy.pages}</h2>
          </div>
          {report.pages.length === 0 ? (
            <p className="adm-empty">{copy.empty}</p>
          ) : (
            <div className="adm-bars">
              {report.pages.slice(0, 12).map((page) => (
                <Bar
                  key={page.path}
                  label={page.path}
                  value={page.views}
                  of={report.pages[0]?.views ?? 0}
                />
              ))}
            </div>
          )}
        </div>

        <Buckets
          title={copy.referrers}
          rows={report.referrers.map((row) => ({ key: row.key, sessions: row.sessions }))}
          empty={copy.empty}
        />
      </div>

      <div className="adm-two">
        <Buckets title={copy.countries} rows={report.countries} empty={copy.empty} />
        <Buckets title={copy.devices} rows={report.devices} empty={copy.empty} />
      </div>

      {report.topActions.length === 0 ? null : (
        <div className="adm-block" data-reveal>
          <div className="adm-block-head">
            <h2>{copy.actions}</h2>
          </div>
          <div className="adm-bars">
            {report.topActions.map((action) => (
              <Bar
                key={action.name}
                label={action.name}
                value={action.count}
                of={report.topActions[0]?.count ?? 0}
              />
            ))}
          </div>
        </div>
      )}

      <section className="adm-block" data-reveal>
        <div className="adm-block-head">
          <h2>{copy.people.title}</h2>
          <p>{copy.people.lede}</p>
        </div>
        {users.state.status !== 'ready' ? (
          /*
           * Three states, three sentences — `loading | error | ready` is a union
           * for exactly this reason, and collapsing the first two into one
           * `!== 'ready'` branch put the *error* case on "Nothing recorded
           * yet." The panel above only catches a failing `/traffic`; this
           * endpoint can fail on its own (a 500, or a 403 on an account the
           * server scopes differently), and the operator would then read a
           * fully-drawn traffic report next to a confident claim that the
           * platform has no users. Same lie as rendering `null` as 0.
           */
          <p className="adm-empty">
            {users.state.status === 'loading'
              ? copy.loading
              : users.state.status === 'error'
                ? copy.down.title
                : copy.empty}
          </p>
        ) : (
          <div className="adm-scroll">
            <table className="adm-table" data-solid>
              <thead>
                <tr>
                  {copy.people.columns.map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.state.data.map((user) => (
                  <tr key={user.id}>
                    <td>{user.display_name}</td>
                    <td>{user.city ?? '—'}</td>
                    <td>{user.roles ?? 'consumer'}</td>
                    <td>{user.points}</td>
                    <td>{user.scans}</td>
                    <td>{user.created_at.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="adm-block" data-reveal>
        <div className="adm-block-head">
          <h2>{copy.feed.title}</h2>
          <p>{copy.feed.lede}</p>
        </div>
        {activity.state.status !== 'ready' ? (
          /* Same three states as the table above, and the same reason: the
             next branch down is the *genuine* empty, and a failed request must
             not borrow its sentence. */
          <p className="adm-empty">
            {activity.state.status === 'loading'
              ? copy.loading
              : activity.state.status === 'error'
                ? copy.down.title
                : copy.empty}
          </p>
        ) : activity.state.data.events.length === 0 ? (
          <p className="adm-empty">{copy.empty}</p>
        ) : (
          <ul className="adm-list">
            {activity.state.data.events.map((event, index) => (
              <li className="adm-user" key={`${event.at}:${event.kind}:${index}`}>
                <span className="adm-role">{copy.feed.kinds[event.kind] ?? event.kind}</span>
                <b>{event.subject}</b>
                <span className="adm-dim">{event.at.slice(0, 16).replace('T', ' ')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
