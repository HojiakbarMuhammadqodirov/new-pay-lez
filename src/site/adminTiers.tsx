/**
 * The console's **Tiers** tab — item 23.
 *
 * ## What this screen is for, and what the console could not do before it
 *
 * `#/admin` could already edit a plan's *entitlements* — what Growth includes —
 * and could not put anybody **on** a plan. So a tier granted over a phone call
 * had to be done in Stripe or in the database, which means the two things this
 * repo cares most about were missing: there was no audit row saying who granted
 * it and why, and there was no way to date it.
 *
 * ## The date is the interesting half, and it is two timestamps
 *
 * There is no scheduler behind "from the first". A dated assignment writes the
 * new subscription with `started_at` at that date and stamps `cancel_at` on the
 * one it replaces at the same instant, and `activeSubscription` filters on both
 * — so the hand-over happens because a query compares two dates, not because
 * anything runs at midnight. That is why this screen shows the two halves
 * separately and never merges them: **live** is what the gate is answering with
 * right now, **scheduled** is what it will answer with later, and a single list
 * would have to lie about one of them.
 *
 * A date is typed as a bare day and kept as one. That matters: `2026-10-01`
 * sorts before `2026-10-01T08:00:00Z`, so a tier dated to the first goes live at
 * the first's own midnight rather than at whatever time of day the operator
 * pressed the button.
 *
 * ## Free is a plan, so there is no "remove"
 *
 * Taking somebody off Growth is assigning them Starter, which keeps one code
 * path and one audit row for every change. A second control that removed a tier
 * would reach the same state with different bookkeeping, and the bookkeeping is
 * the point of doing it here rather than in the database.
 *
 * The one thing that *is* a removal is dropping a change that has not landed,
 * and it is deliberately refused once the change is in force: "undo what I
 * scheduled" and "downgrade this account" are two decisions, and only the
 * second changes what somebody has today.
 *
 * ## Propagation, and what "immediate" honestly means
 *
 * The server has no cache between `subscriptions` and the gate —
 * `entitlementsFor` reads the rows on every call — so the next request the
 * subject makes is gated by the new plan. That is the immediacy, and it is the
 * half this screen can be sure of. What it cannot do is reach into a browser
 * somebody else has open: their header pill is filled by one `GET /v1/me` when
 * their session changes, so it comes right on their next load. `AuthProvider`
 * re-asks when a tab regains focus, which closes most of that gap without
 * polling; the sentence under the assign form says as much rather than claiming
 * more.
 *
 * ## Why it is a tab and not a control on each row
 *
 * A row on People or Services shows *one* subject, and the question an operator
 * has here is usually the other way round: who is on a paid tier, and what is
 * about to change. Putting it per row would also put a plan picker behind the
 * `EditToggle` beside a bin, which is the wrong neighbourhood — this is not a
 * destructive control, and the console's own rule is that the toggle guards
 * the ones that are.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';

import {
  ADMIN_SUBSCRIPTIONS_PATH,
  assignPlan,
  cancelScheduledPlan,
  type AdminSubscription,
  type AdminSubscriptions,
} from './api/admin';
import { useApi } from './api/useApi';
import type { Write } from './adminWrite';
import { Icon } from './icons';
import { useCopy, useLanguage } from './i18n/context';
import { fill } from './i18n/currency';

/** One plan, as `/v1/admin/config` lists them. */
export interface TierPlan {
  id: string;
  audience: 'consumer' | 'partner';
  code: string;
  name: string;
  price_minor: number;
  rank: number;
}

/**
 * A date, short, in the reader's own locale — the console's one format.
 *
 * The fourth copy of these four options, beside `admin.tsx`, `adminPeople.tsx`
 * and `adminWebsite.tsx`. A shared `adminFormat.ts` is where all four belong
 * and is a move across four files this pass did not make; what matters here is
 * that the format is the same one, not that the function is.
 */
const day = (iso: string | null, locale: string) =>
  iso
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: '2-digit' }).format(
        new Date(iso),
      )
    : '—';

/** Today as `YYYY-MM-DD`, in the operator's own clock rather than in UTC. */
function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Who a row is about, named if the join could name them. */
function subjectOf(row: AdminSubscription): { id: string; name: string; venue: boolean } {
  const id = row.venue_id ?? row.user_id ?? '';
  return {
    id,
    /* The id rather than a blank: an operator about to change somebody's tier
       has to be able to tell which row they are on, and a provisional account
       has no display name to show. */
    name: row.subject_name ?? id,
    venue: row.venue_id !== null,
  };
}

/** The assign form: a subject, a plan, a date, and a reason. */
function Assign({
  plans,
  write,
  reload,
}: {
  plans: TierPlan[];
  write: Write;
  reload: () => void;
}) {
  const copy = useCopy().admin.tiers;
  const [kind, setKind] = useState<'venue' | 'user'>('venue');
  const [subject, setSubject] = useState('');
  const [planCode, setPlanCode] = useState('');
  const [from, setFrom] = useState(today());
  const [note, setNote] = useState('');

  /*
   * The plans for the audience the subject belongs to, and nothing else.
   *
   * The server derives the audience from the subject and refuses a mismatch by
   * name, so this is not the enforcement — it is the picker not offering a
   * choice that is going to be refused. `plans` carries both ladders because
   * `/v1/admin/config` lists both.
   */
  const audience = kind === 'venue' ? 'partner' : 'consumer';
  const offered = useMemo(
    () => plans.filter((plan) => plan.audience === audience).sort((a, b) => a.rank - b.rank),
    [plans, audience],
  );

  const ready = subject.trim() !== '' && planCode !== '';
  const scheduled = from > today();

  const submit = useCallback(() => {
    if (!ready) return;
    write.run(
      'assign',
      async () => {
        const result = await assignPlan({
          [kind === 'venue' ? 'venueId' : 'userId']: subject.trim(),
          planCode,
          /* Today is "now" and is sent as absent, so the ordinary case does not
             go down the dated path at all — a change dated to today would work,
             and saying "scheduled" about something already in force is the kind
             of small lie that makes an operator distrust the screen. */
          effectiveFrom: scheduled ? from : undefined,
          note: note.trim() === '' ? undefined : note.trim(),
        });
        setSubject('');
        setNote('');
        return result.scheduled
          ? fill(copy.didSchedule, { plan: result.plan.name, from: result.effectiveFrom })
          : fill(copy.didAssign, { plan: result.plan.name });
      },
      reload,
    );
  }, [ready, write, kind, subject, planCode, scheduled, from, note, copy, reload]);

  return (
    /* `.adm-edit-*` and `.adm-tabs` rather than a namespace of its own: this is
       the console's form kit and its segmented control doing the jobs they
       already do, and `.adm-tier*` is taken — it is the voucher-ladder display
       on the analytics screen, which is a different tier entirely. Grepping
       before naming is the rule, and this is what it turned up. */
    <form
      className="adm-edit-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {/* Which of the two ladders, because a plan code means a different plan on
          each. It is a segmented control rather than a guess from the id: ids
          carry a prefix (`ven_`, `usr_`) and reading it would be inferring the
          audience from a string the server may change. */}
      <div className="adm-tabs" role="group" aria-label={copy.subjectKind}>
        {(['venue', 'user'] as const).map((which) => (
          <button
            key={which}
            type="button"
            className="adm-tab"
            data-on={kind === which ? 'true' : undefined}
            onClick={() => {
              setKind(which);
              /* The plan list changes with it, so a code picked for the other
                 audience must not survive — it would be refused on submit. */
              setPlanCode('');
            }}
          >
            {which === 'venue' ? copy.aVenue : copy.aPerson}
          </button>
        ))}
      </div>

      <div className="adm-edit-grid">
      <label className="field">
        <span className="field-label">{kind === 'venue' ? copy.venueId : copy.userId}</span>
        <input
          value={subject}
          placeholder={kind === 'venue' ? 'ven_…' : 'usr_…'}
          onChange={(event) => setSubject(event.target.value)}
        />
        <span className="field-help">{copy.idHelp}</span>
      </label>

      <label className="field">
        <span className="field-label">{copy.plan}</span>
        <select value={planCode} onChange={(event) => setPlanCode(event.target.value)}>
          <option value="">{copy.pickPlan}</option>
          {offered.map((plan) => (
            <option key={plan.id} value={plan.code}>
              {plan.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">{copy.from}</span>
        {/* A day, not an instant — see the header. `type="date"` gives the
            browser's own picker and hands back exactly `YYYY-MM-DD`, which is
            the form the server keeps. */}
        <input type="date" value={from} min={today()} onChange={(event) => setFrom(event.target.value)} />
        <span className="field-help">{scheduled ? copy.fromLater : copy.fromNow}</span>
      </label>

      <label className="field">
        <span className="field-label">{copy.note}</span>
        <input
          value={note}
          placeholder={copy.notePlaceholder}
          onChange={(event) => setNote(event.target.value)}
        />
        {/* The reason a tier was granted by hand is the one thing nobody can
            reconstruct afterwards, so the field says what it is for. */}
        <span className="field-help">{copy.noteHelp}</span>
      </label>
      </div>

      <div className="adm-edit-acts">
        {/* What the press does and does not reach, said rather than implied —
            see the header on propagation. */}
        <p className="adm-note">{copy.propagation}</p>
        <button type="submit" className="btn btn-solid" disabled={!ready || write.busy === 'assign'}>
          <Icon name="check" size={15} strokeWidth={2} />
          {write.busy === 'assign' ? copy.working : scheduled ? copy.schedule : copy.assign}
        </button>
      </div>
    </form>
  );
}

/** One row of either list. */
function Row({
  row,
  locale,
  onDrop,
  dropping,
}: {
  row: AdminSubscription;
  locale: string;
  /** Only the scheduled list passes one; a live row has nothing to drop. */
  onDrop?: () => void;
  dropping?: boolean;
}) {
  const copy = useCopy().admin.tiers;
  const subject = subjectOf(row);

  return (
    <tr>
      <td>
        <b>{subject.name}</b>
        <em className="adm-dim">{subject.venue ? copy.aVenue : copy.aPerson}</em>
      </td>
      <td>{row.plan_name}</td>
      <td>
        {/* The source, because "manual" is the operator's own grant and every
            other value is a processor's. An operator looking at a tier they did
            not expect needs to know whether somebody paid for it. */}
        {/* Keyed lookup, and a miss falls through to the **raw value** rather
            than to a blank: `subscriptions.source` is a CHECK-constrained set
            the server can widen, and a fifth member would otherwise render as
            nothing at all. That is the lookup-that-misses failure this console
            has already had twice (`quiet hours`, `newcomer`). */}
        <span className="adm-badge">
          {(copy.sources as Record<string, string | undefined>)[row.source] ?? row.source}
        </span>
      </td>
      <td>{day(row.started_at, locale)}</td>
      <td>{day(row.cancel_at, locale)}</td>
      <td data-align="right">
        {onDrop ? (
          <button type="button" className="link-btn" onClick={onDrop} disabled={dropping}>
            {dropping ? copy.working : copy.drop}
          </button>
        ) : null}
      </td>
    </tr>
  );
}

export function AdminTiers({
  write,
  down,
}: {
  write: Write;
  /* The console's "we could not ask" panel, handed in rather than imported:
     `Down` is local to `admin.tsx` and this screen has no business reaching
     into another screen's internals for it. */
  down: (result: { reload: () => void }) => ReactNode;
}) {
  const copy = useCopy().admin.tiers;
  const [language] = useLanguage();
  const subs = useApi<AdminSubscriptions>(ADMIN_SUBSCRIPTIONS_PATH);
  /* The ladders, from the route that already lists them. Read here rather than
     handed in: the console's shell does not fetch `/v1/admin/config`, and
     threading a request through it for one tab would make every other tab pay
     for it. A failure here is not fatal to the screen — the lists below still
     read — so the picker simply has nothing to offer and says so. */
  const config = useApi<{ plans: TierPlan[] }>('/v1/admin/config');
  const plans = config.state.status === 'ready' ? config.state.data.plans : [];

  const drop = useCallback(
    (id: string) => write.run(`drop:${id}`, () => cancelScheduledPlan(id), subs.reload),
    [write, subs.reload],
  );

  const table = (rows: AdminSubscription[], scheduled: boolean) => (
    <div className="adm-scroll">
      <table className="adm-table" data-solid>
        <thead>
          <tr>
            {copy.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
            <th data-align="right">{scheduled ? copy.act : ''}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row
              key={row.id}
              row={row}
              locale={language}
              onDrop={scheduled ? () => drop(row.id) : undefined}
              dropping={write.busy === `drop:${row.id}`}
            />
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <section className="adm-block" data-reveal>
        <div className="adm-block-head">
          <h2>{copy.assignTitle}</h2>
          <p>{copy.assignLede}</p>
        </div>
        <Assign plans={plans} write={write} reload={subs.reload} />
      </section>

      <section className="adm-block" data-reveal>
        <div className="adm-block-head">
          <h2>{copy.liveTitle}</h2>
          <p>{copy.liveLede}</p>
        </div>
        {subs.state.status === 'error' ? (
          down(subs)
        ) : subs.state.status === 'loading' ? (
          <p className="adm-empty">{copy.loading}</p>
        ) : subs.state.data.live.length === 0 ? (
          /* The honest state of a platform where nobody has bought a tier, and
             the one production is in. Not the same sentence as a failed
             request, which is the branch above. */
          <div className="adm-block-empty">
            <h3>{copy.noneLive.title}</h3>
            <p>{copy.noneLive.body}</p>
          </div>
        ) : (
          table(subs.state.data.live, false)
        )}
      </section>

      {/* Drawn only when there is something dated, because an empty "nothing is
          scheduled" panel is a panel that is empty almost always. */}
      {subs.state.status === 'ready' && subs.state.data.scheduled.length > 0 && (
        <section className="adm-block" data-reveal>
          <div className="adm-block-head">
            <h2>{copy.scheduledTitle}</h2>
            <p>{copy.scheduledLede}</p>
          </div>
          {table(subs.state.data.scheduled, true)}
        </section>
      )}
    </>
  );
}
