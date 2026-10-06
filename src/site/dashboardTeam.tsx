/**
 * The Team screen — v3's look (§3.10 / §4: the "who runs your counters" card,
 * the role legend, the member table, the add/edit drawer, the confirmation),
 * carrying the **server's** role model rather than v3's.
 *
 * v3 drew three roles (staff, manager, owner), a choice between a personal
 * account and a shared counter tablet, an emailed invite, venue chips and a
 * Disable switch. None of that is what `server/domain/team.ts` holds, and the
 * honesty rule is that a control with nothing behind it is not drawn. What the
 * server holds, and so what this screen draws:
 *
 * - **The owner is not a row.** Ownership is the venue's own column, so the
 *   list never contains them; the fixed top row is drawn from the session (an
 *   owner reading their own team) or as "the venue's owner" (a manager reading
 *   it, who has no endpoint that names them).
 * - **Four roles a row can hold** — manager, shift lead, cashier, custom — and
 *   six counter permissions. A role is where the switches *start*; the owner
 *   flips any of them and the role's name stays. A manager holds every
 *   permission by role, so their switches are a sentence, not a form.
 * - **Joining is a six-digit code**, shown once, single use, seven days. The
 *   person types it into their own Paylez app (`POST /v1/team/join` — the
 *   phone's job). There is no email and no invite link, so v3's "Where to send
 *   the invite" and "Resend invite" are gone, and the Sign-in column says
 *   "joined" or "code pending · expires …" instead of personal/shared.
 * - **One venue per row.** A membership belongs to one venue; the frame's
 *   switcher chooses which team is listed, so v3's venue chips and filter are
 *   not drawn and the Venue column names this venue.
 * - **No Disable/Enable.** There is no suspended state, only revoked, which
 *   the server makes immediate. Revoke is the bin; an unaccepted invite's is
 *   the cross, because cancelling an invite is the same call and a different
 *   sentence.
 *
 * **A manager is refused over another manager** (`assertCanManage`): the
 * screen hides those controls — no Manager role card, a sentence in place of
 * the buttons on a manager's row — and prints the server's own words if a
 * refusal still arrives, because the server is the one that decides.
 */
import { useMemo, useState } from 'react';

import {
  addMember,
  reissueCode,
  revokeMember,
  templateFor,
  TEAM_PERMS,
  updateMember,
  usePartnerTeam,
  type TeamMember,
  type TeamPerms,
  type TeamRole,
} from './api/team';
import { ApiError } from './api/client';
import { useAuth } from './auth/context';
import { DEMO_TEAM, DEMO_VENUE } from './dashboardDemo';
import { useVenueDates } from './dashboardFormat';
import { Button, Card, CardHead, ConfirmDialog, Drawer, DxIcon, Eyebrow, Input, Modal, PageHead, Table, Toggle } from './dashboardKit';
import { initialsOf } from './dashboardKitHooks';
import { Screen } from './dashboardScreens';
import { useDashboard } from './dashboardShell';
import type { DxIconName } from './dashboardIcons';
import { DEMO_MODE } from './demoMode';
import { useCopy, useLanguage } from './i18n/context';
import { fill } from './i18n/currency';
import type { Dictionary } from './i18n/en';

import './dashboard-team.css';

type TeamCopy = Dictionary['dashboard']['team'];

/** The server's code lifetime (`TEAM.codeValidDays`) — restated, because the two programs share no code. */
const CODE_VALID_DAYS = 7;

/** Within this long, "last seen" reads as "Active now" rather than "1 minute ago". */
const NOW_MS = 5 * 60_000;

/** The order rows are listed in: who runs more, first. */
const RANK: Record<TeamRole, number> = { manager: 0, shiftlead: 1, cashier: 2, custom: 3 };

/** What the drawer offers, in v3's left-to-right reading: the everyday roles first, the blank one last. */
const ROLE_ORDER: readonly TeamRole[] = ['cashier', 'shiftlead', 'manager', 'custom'];

/* ═══════════════════════════════════════════════════════════ helpers ══ */

const countOn = (perms: TeamPerms) => TEAM_PERMS.filter((key) => perms[key]).length;

const samePerms = (a: TeamPerms, b: TeamPerms) => TEAM_PERMS.every((key) => a[key] === b[key]);

/** May this viewer change this row? The server's `assertCanManage`, read early so no button is drawn to be refused. */
const canManage = (asManager: boolean, role: TeamRole) => !(asManager && role === 'manager');

/** Has the outstanding code run out? Read against the clock the screen is drawn at. */
const expired = (member: TeamMember, now: number) =>
  member.codeExpiresAt !== null && Date.parse(member.codeExpiresAt) <= now;

/** A toast naming somebody. A name that ends in a full stop ("Anna K.") takes
    the sentence's own, or "{name}." prints two of them. */
const fillName = (template: string, name: string) =>
  fill(name.trimEnd().endsWith('.') ? template.replace('{name}.', '{name}') : template, { name: name.trimEnd() });

/**
 * The sentence for a write that did not land — by kind, the same three the
 * other screens draw: the server is not there, this device is not signed in,
 * or the server looked and refused, **in its own words**, because those name
 * which gate closed (a manager over a manager, the 50-member cap).
 */
function refusal(cause: unknown, dashboard: Dictionary['dashboard']): string {
  if (cause instanceof ApiError && cause.status === 0) return dashboard.acts.offline;
  if (cause instanceof ApiError && cause.status === 401) return dashboard.unmeasured.noSession;
  return fill(dashboard.acts.refused, { why: cause instanceof Error ? cause.message : String(cause) });
}

/** "2 hours ago", in the reader's language, from `Intl` rather than from a dictionary of units. */
function useAgo() {
  const [language] = useLanguage();
  return useMemo(() => {
    let format: Intl.RelativeTimeFormat;
    try {
      format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
    } catch {
      format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    }
    return (iso: string, now: number): string | null => {
      const ms = now - Date.parse(iso);
      if (ms < NOW_MS) return null;
      const minutes = Math.round(ms / 60_000);
      if (minutes < 60) return format.format(-minutes, 'minute');
      const hours = Math.round(minutes / 60);
      if (hours < 24) return format.format(-hours, 'hour');
      const days = Math.round(hours / 24);
      if (days < 30) return format.format(-days, 'day');
      return format.format(-Math.round(days / 30), 'month');
    };
  }, [language]);
}

/** The permissions a summary lists, joined the way the reader's language joins a list. */
function useListJoin() {
  const [language] = useLanguage();
  return useMemo(() => {
    try {
      const format = new Intl.ListFormat(language, { style: 'long', type: 'conjunction' });
      return (items: string[]) => format.format(items);
    } catch {
      return (items: string[]) => items.join(', ');
    }
  }, [language]);
}

/** "{name} will be a cashier at {venue}. They can …" — whole sentences, each its own dictionary string. */
function summaryOf(
  copy: TeamCopy,
  join: (items: string[]) => string,
  name: string,
  role: TeamRole,
  perms: TeamPerms,
  venue: string,
): string {
  const who = fill(copy.drawer.who[role], { name: name.trim() || copy.drawer.someone, venue });
  if (role === 'manager') return who;
  const on = TEAM_PERMS.filter((key) => perms[key]).map((key) => copy.perms[key].phrase);
  return `${who} ${on.length === 0 ? copy.drawer.nothing : fill(copy.drawer.can, { list: join(on) })}`;
}

/* ════════════════════════════════════════════════════════════ screen ══ */

export function Team() {
  const dashboard = useCopy().dashboard;
  const { venueId } = useDashboard();
  const team = usePartnerTeam(venueId);
  const [adding, setAdding] = useState(false);
  /* Held here, above `Screen`, and not in the body: a write re-reads the list,
     the re-read puts `Screen` back to "asking" and unmounts the body — and a
     code kept in the body would vanish in the same frame it was shown, which
     for the one time a code exists in the clear is the one thing that must
     not happen. */
  const [shown, setShown] = useState<Shown | null>(null);
  const [now] = useState(() => Date.now());
  const { venue, venues } = useDashboard();
  const venueName =
    venue?.name ?? venues.find((row) => row.id === venueId)?.name ?? (DEMO_MODE ? DEMO_VENUE.name : '');
  const dates = useVenueDates(venue?.timezone ?? (DEMO_MODE ? DEMO_VENUE.timezone : null));

  return (
    <div className="dx-team">
      <PageHead
        title={dashboard.screens.team.name}
        subtitle={dashboard.screens.team.lede}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
            {dashboard.team.add}
          </Button>
        }
      />
      <Screen state={team.state} id="team" demo={DEMO_TEAM}>
        {(data) => (
          <TeamBody
            members={data.members}
            reload={team.reload}
            adding={adding}
            setAdding={setAdding}
            onCode={setShown}
          />
        )}
      </Screen>
      {shown && (
        <CodePanel
          shown={shown}
          venueName={venueName}
          expiresOn={dates.long(new Date(now + CODE_VALID_DAYS * 86_400_000).toISOString())}
          onClose={() => setShown(null)}
        />
      )}
    </div>
  );
}

type Confirm = { kind: 'revoke' | 'reissue'; member: TeamMember };
type Shown = { name: string; code: string; again: boolean };

function TeamBody({
  members,
  reload,
  adding,
  setAdding,
  onCode,
}: {
  members: TeamMember[];
  reload: () => void;
  adding: boolean;
  setAdding: (on: boolean) => void;
  onCode: (shown: Shown) => void;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.team;
  const { venueId, venue, venues, role: viewerRole, toast } = useDashboard();
  const { account } = useAuth();
  const asManager = viewerRole === 'manager';
  const dates = useVenueDates(venue?.timezone ?? (DEMO_MODE ? DEMO_VENUE.timezone : null));
  const ago = useAgo();
  /* The clock every "expired" and "ago" on the page is read against, taken once
     per mount so two rows cannot disagree about what time it is. */
  const [now] = useState(() => Date.now());

  const venueName =
    venue?.name ?? venues.find((row) => row.id === venueId)?.name ?? (DEMO_MODE ? DEMO_VENUE.name : '');

  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () =>
      [...members].sort(
        (a, b) =>
          RANK[a.role] - RANK[b.role] ||
          (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1) ||
          a.name.localeCompare(b.name),
      ),
    [members],
  );

  /* Under the demo there is no venue to write to, and a press says so rather
     than firing a request that can only 401. */
  const runConfirm = async () => {
    if (!confirm) return;
    if (venueId === null) {
      toast(dashboard.unmeasured.noSession);
      setConfirm(null);
      return;
    }
    const { kind, member } = confirm;
    setBusy(true);
    try {
      if (kind === 'revoke') {
        await revokeMember(venueId, member.id);
        toast(
          member.status === 'invited' ? copy.toasts.cancelled : fillName(copy.toasts.revoked, member.name),
        );
        setEditing(null);
      } else {
        const { code } = await reissueCode(venueId, member.id);
        setEditing(null);
        onCode({ name: member.name, code, again: true });
        toast(fillName(copy.toasts.reissued, member.name));
      }
      reload();
    } catch (cause) {
      toast(refusal(cause, dashboard));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const ownerName = asManager ? copy.owner.unnamed : account?.name ?? copy.owner.unnamed;
  const ownerSub = asManager ? fill(copy.owner.sub, { venue: venueName }) : account?.email ?? '';

  return (
    <div className="dx-team-stack">
      <Card className="dx-team-intro">
        <CardHead
          title={copy.intro.title}
          sub={asManager ? fill(copy.intro.manager, { venue: venueName }) : copy.intro.owner}
          aside={
            <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
              {copy.add}
            </Button>
          }
        />
      </Card>

      <div className="dx-team-legend">
        {(['cashier', 'shiftlead', 'manager', 'owner'] as const).map((role) => (
          <div key={role} className="dx-team-legend-card">
            <RolePill role={role} copy={copy} />
            <p>{copy.legend[role]}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="dx-team-empty">
          <div className="dx-team-empty-ico">
            <DxIcon name="userPlus" size={24} strokeWidth={2} />
          </div>
          <h3>{dashboard.empty.team.title}</h3>
          <p>{dashboard.empty.team.body}</p>
          <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
            {dashboard.empty.team.action}
          </Button>
        </div>
      ) : (
        <Card pad="none">
          <Table minWidth={900} label={dashboard.screens.team.name}>
            <thead>
              <tr>
                <th className="dx-team-edge">{copy.columns.member}</th>
                <th>{copy.columns.role}</th>
                <th>{copy.columns.venue}</th>
                <th>{copy.columns.signIn}</th>
                <th>{copy.columns.status}</th>
                <th>{copy.columns.last}</th>
                <th className="dx-team-edge">
                  <span className="dx-team-sr">{copy.columns.actions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="dx-team-edge">
                  <MemberCell role="owner" name={ownerName} sub={ownerSub} unnamed={asManager || !account} />
                </td>
                <td>
                  <RolePill role="owner" copy={copy} />
                </td>
                <td className="dx-team-venue">{venueName}</td>
                <td>
                  <SignIn icon="user" text={copy.signIn.app} />
                </td>
                <td>
                  <span className="dx-team-status" data-tone="active">
                    {copy.status.active}
                  </span>
                </td>
                <td className="dx-team-last">{asManager ? '—' : copy.owner.last}</td>
                <td className="dx-team-edge">
                  <div className="dx-team-acts">
                    <span className="dx-team-note">{copy.owner.tag}</span>
                  </div>
                </td>
              </tr>
              {rows.map((member) => {
                const lapsed = member.status === 'invited' && expired(member, now);
                const seen = member.lastSeenAt === null ? null : ago(member.lastSeenAt, now);
                const manageable = canManage(asManager, member.role);
                const on = countOn(member.perms);
                return (
                  <tr key={member.id}>
                    <td className="dx-team-edge">
                      <MemberCell
                        role={member.role}
                        name={member.name}
                        sub={
                          member.role === 'manager' || on === TEAM_PERMS.length
                            ? copy.sub.all
                            : on === 0
                              ? copy.sub.none
                              : fill(copy.sub.some, { n: String(on) })
                        }
                      />
                    </td>
                    <td>
                      <RolePill role={member.role} copy={copy} />
                    </td>
                    <td className="dx-team-venue">{venueName}</td>
                    <td>
                      {member.status === 'active' ? (
                        <SignIn icon="user" text={copy.signIn.app} />
                      ) : lapsed ? (
                        <SignIn icon="clock" text={copy.signIn.expired} tone="down" />
                      ) : member.codeExpiresAt ? (
                        <SignIn
                          icon="clock"
                          text={fill(copy.signIn.pending, { date: dates.day(member.codeExpiresAt) })}
                          tone="warn"
                        />
                      ) : (
                        <SignIn icon="clock" text={copy.signIn.noCode} />
                      )}
                    </td>
                    <td>
                      {member.status === 'invited' ? (
                        <span className="dx-team-status" data-tone="invited">
                          {copy.status.invited}
                        </span>
                      ) : member.onShift ? (
                        <span className="dx-team-status" data-tone="shift">
                          <i aria-hidden />
                          {copy.status.onShift}
                        </span>
                      ) : (
                        <span className="dx-team-status" data-tone="active">
                          {copy.status.active}
                        </span>
                      )}
                    </td>
                    <td className="dx-team-last">
                      {member.status === 'invited'
                        ? copy.last.notJoined
                        : member.lastSeenAt !== null
                          ? (seen ?? copy.last.now)
                          : member.joinedAt
                            ? fill(copy.last.joined, { date: dates.day(member.joinedAt) })
                            : '—'}
                    </td>
                    <td className="dx-team-edge">
                      <div className="dx-team-acts">
                        {manageable ? (
                          <>
                            <ActButton icon="pencil" label={copy.actions.edit} onClick={() => setEditing(member)} />
                            <ActButton
                              icon="refresh"
                              label={copy.actions.reissue}
                              onClick={() => setConfirm({ kind: 'reissue', member })}
                            />
                            <ActButton
                              icon={member.status === 'invited' ? 'close' : 'trash'}
                              label={member.status === 'invited' ? copy.actions.cancelInvite : copy.actions.revoke}
                              danger
                              onClick={() => setConfirm({ kind: 'revoke', member })}
                            />
                          </>
                        ) : (
                          <span className="dx-team-note">{copy.byOwner}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}

      {(adding || editing) && (
        <MemberDrawer
          key={editing?.id ?? 'new'}
          member={editing}
          venueName={venueName}
          asManager={asManager}
          now={now}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onCreated={(name, code) => {
            setAdding(false);
            onCode({ name, code, again: false });
            toast(fillName(copy.toasts.created, name));
            reload();
          }}
          onSaved={(name) => {
            setEditing(null);
            toast(fillName(copy.toasts.saved, name));
            reload();
          }}
          onAsk={(kind, member) => setConfirm({ kind, member })}
        />
      )}

      {confirm && (
        <ConfirmDialog
          tone={confirm.kind === 'revoke' ? 'danger' : 'regen'}
          title={
            confirm.kind === 'reissue'
              ? copy.confirm.reissueTitle
              : fill(confirm.member.status === 'invited' ? copy.confirm.cancelTitle : copy.confirm.revokeTitle, {
                  name: confirm.member.name,
                })
          }
          body={
            confirm.kind === 'reissue'
              ? fill(confirm.member.status === 'invited' ? copy.confirm.reissuePending : copy.confirm.reissueActive, {
                  name: confirm.member.name,
                })
              : confirm.member.status === 'invited'
                ? copy.confirm.cancelBody
                : copy.confirm.revokeBody
          }
          confirmLabel={
            confirm.kind === 'reissue'
              ? copy.confirm.reissue
              : confirm.member.status === 'invited'
                ? copy.confirm.cancel
                : copy.confirm.revoke
          }
          busy={busy}
          onConfirm={() => void runConfirm()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ pieces ══ */

function RolePill({ role, copy }: { role: TeamRole | 'owner'; copy: TeamCopy }) {
  return (
    <span className="dx-team-role" data-role={role}>
      {copy.roles[role]}
    </span>
  );
}

/** `unnamed` draws a person in the avatar — initials of "The venue's owner" would be a name nobody has. */
function MemberCell({
  role,
  name,
  sub,
  unnamed,
}: {
  role: TeamRole | 'owner';
  name: string;
  sub: string;
  unnamed?: boolean;
}) {
  return (
    <div className="dx-team-member">
      <span className="dx-team-avatar" data-role={role} aria-hidden>
        {unnamed ? <DxIcon name="user" size={17} /> : initialsOf(name)}
      </span>
      <div>
        <b>{name}</b>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

function SignIn({ icon, text, tone }: { icon: DxIconName; text: string; tone?: 'warn' | 'down' }) {
  return (
    <span className="dx-team-signin" data-tone={tone}>
      <DxIcon name={icon} size={16} />
      <span>{text}</span>
    </span>
  );
}

function ActButton({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: DxIconName;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="dx-team-act"
      data-danger={danger ? 'true' : undefined}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <DxIcon name={icon} size={15} />
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════ drawer ══ */

/**
 * Add a member, or change one. One panel for both because they are the same
 * three decisions — who, which role, which switches — and the edit form adds
 * only where the person has got to (joined, or a code outstanding) and the two
 * presses that act on that.
 *
 * The name is a field on add and a fact on edit: `PATCH` takes a role and
 * permissions and nothing else, so a name box on the edit form would be a
 * control with nothing behind it.
 */
function MemberDrawer({
  member,
  venueName,
  asManager,
  now,
  onClose,
  onCreated,
  onSaved,
  onAsk,
}: {
  member: TeamMember | null;
  venueName: string;
  asManager: boolean;
  now: number;
  onClose: () => void;
  onCreated: (name: string, code: string) => void;
  onSaved: (name: string) => void;
  onAsk: (kind: Confirm['kind'], member: TeamMember) => void;
}) {
  const dashboard = useCopy().dashboard;
  const copy = dashboard.team;
  const { venueId, venue, toast } = useDashboard();
  const dates = useVenueDates(venue?.timezone ?? (DEMO_MODE ? DEMO_VENUE.timezone : null));
  const join = useListJoin();

  const [name, setName] = useState('');
  const [role, setRole] = useState<TeamRole>(member?.role ?? 'cashier');
  const [perms, setPerms] = useState<TeamPerms>(member ? { ...member.perms } : templateFor('cashier'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editing = member !== null;
  const shownName = editing ? member.name : name;
  const changed = editing && (role !== member.role || (role !== 'manager' && !samePerms(perms, member.perms)));
  const missingName = !editing && name.trim() === '';

  /* Picking a role is picking its template — the server resets to it on a role
     change too, so the switches on screen are what will be stored. */
  const pickRole = (next: TeamRole) => {
    setRole(next);
    setPerms(templateFor(next));
    setError(null);
  };

  const submit = async () => {
    if (busy || missingName || (editing && !changed)) return;
    if (venueId === null) {
      toast(dashboard.unmeasured.noSession);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        await updateMember(venueId, member.id, {
          ...(role !== member.role ? { role } : {}),
          ...(role !== 'manager' ? { perms } : {}),
        });
        onSaved(member.name);
      } else {
        const trimmed = name.trim();
        const created = await addMember(venueId, {
          name: trimmed,
          role,
          ...(role !== 'manager' ? { perms } : {}),
        });
        onCreated(created.member.name, created.code);
      }
    } catch (cause) {
      setError(refusal(cause, dashboard));
    } finally {
      setBusy(false);
    }
  };

  const roles = ROLE_ORDER.filter((option) => !(asManager && option === 'manager'));
  const lapsed = member !== null && member.status === 'invited' && expired(member, now);

  return (
    <Drawer
      kicker={editing ? copy.drawer.editKicker : copy.drawer.addKicker}
      title={editing ? copy.drawer.editTitle : copy.drawer.addTitle}
      sub={editing ? copy.drawer.editSub : copy.drawer.addSub}
      onClose={onClose}
      invalid={error ?? (missingName ? copy.drawer.needName : undefined)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {dashboard.drawer.cancel}
          </Button>
          <Button
            variant="primary"
            disabled={busy || missingName || (editing && !changed)}
            onClick={() => void submit()}
          >
            {busy ? copy.drawer.saving : editing ? copy.drawer.save : copy.drawer.create}
          </Button>
        </>
      }
    >
      <div className="dx-sections">
        {editing ? (
          <section>
            <div className="dx-team-who">
              <MemberCell role={member.role} name={member.name} sub={copy.roles[member.role]} />
            </div>
          </section>
        ) : (
          <section>
            <SectionLabel>{copy.drawer.name}</SectionLabel>
            <Input
              value={name}
              maxLength={60}
              placeholder={copy.drawer.namePlaceholder}
              aria-label={copy.drawer.name}
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              autoFocus
            />
            <p className="dx-team-help">{copy.drawer.nameHelp}</p>
          </section>
        )}

        <section>
          <SectionLabel>{copy.drawer.role}</SectionLabel>
          <div className="dx-team-roles" role="radiogroup" aria-label={copy.drawer.role}>
            {roles.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={role === option}
                className="dx-team-option"
                onClick={() => pickRole(option)}
              >
                <i aria-hidden />
                <span>
                  <b>{copy.roles[option]}</b>
                  <span>{copy.drawer.roleCards[option]}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="dx-team-help">{copy.drawer.roleHelp}</p>
        </section>

        <section>
          <SectionLabel>{copy.drawer.perms}</SectionLabel>
          {role === 'manager' ? (
            <div className="dx-team-box">
              <p>{copy.drawer.managerPerms}</p>
            </div>
          ) : (
            <>
              <div className="dx-team-perms">
                {TEAM_PERMS.map((key) => (
                  <div key={key} className="dx-team-perm">
                    <Toggle
                      checked={perms[key]}
                      onChange={(on) => {
                        setPerms((prev) => ({ ...prev, [key]: on }));
                        setError(null);
                      }}
                      label={
                        <span className="dx-team-perm-text">
                          <b>{copy.perms[key].label}</b>
                          <span>{copy.perms[key].body}</span>
                        </span>
                      }
                    />
                  </div>
                ))}
              </div>
              <p className="dx-team-help">{copy.drawer.permsHelp}</p>
            </>
          )}
        </section>

        {editing ? (
          <section>
            <SectionLabel>{copy.drawer.state}</SectionLabel>
            <div className="dx-team-box">
              <p>
                {member.status === 'active'
                  ? fill(copy.drawer.joined, { date: member.joinedAt ? dates.long(member.joinedAt) : '—' })
                  : lapsed || !member.codeExpiresAt
                    ? copy.drawer.expired
                    : fill(copy.drawer.pending, { date: dates.long(member.codeExpiresAt) })}
              </p>
              <div className="dx-team-box-acts">
                <Button variant="small" icon="refresh" onClick={() => onAsk('reissue', member)}>
                  {copy.actions.reissue}
                </Button>
                <Button variant="small" icon={member.status === 'invited' ? 'close' : 'trash'} onClick={() => onAsk('revoke', member)}>
                  {member.status === 'invited' ? copy.actions.cancelInvite : copy.actions.revoke}
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <section>
            <SectionLabel>{copy.drawer.join}</SectionLabel>
            <div className="dx-team-box">
              <b>{copy.drawer.joinTitle}</b>
              <p>{copy.drawer.joinBody}</p>
            </div>
          </section>
        )}

        <div className="dx-team-line">
          <Eyebrow tone="mint">{copy.drawer.oneLine}</Eyebrow>
          <p>{summaryOf(copy, join, shownName, role, perms, venueName)}</p>
        </div>
      </div>
    </Drawer>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="dx-team-label">
      <Eyebrow tone="faint">{children}</Eyebrow>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════ code ══ */

/**
 * The code, the one time it exists in the clear.
 *
 * The phone's code step, on a desk: six boxes, what to do with them, how long
 * they last, and two ways to get them off this screen — the digits alone, or
 * the whole message the phone's share sheet sends. Closing it is final; the
 * screen says so before the owner finds out.
 */
function CodePanel({
  shown,
  venueName,
  expiresOn,
  onClose,
}: {
  shown: Shown;
  venueName: string;
  expiresOn: string;
  onClose: () => void;
}) {
  const copy = useCopy().dashboard.team;
  const { toast } = useDashboard();

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(copy.code.copied);
    } catch {
      toast(copy.code.copyFailed);
    }
  };

  return (
    <Modal
      kicker={copy.code.kicker}
      title={fill(shown.again ? copy.code.again : copy.code.title, { name: shown.name })}
      lede={copy.code.body}
      width={520}
      onClose={onClose}
    >
      <div className="dx-team-code">
        <div className="dx-team-digits" aria-label={shown.code.split('').join(' ')}>
          {shown.code.split('').map((digit, index) => (
            <span key={index} aria-hidden>
              {digit}
            </span>
          ))}
        </div>
        <p className="dx-team-help">{fill(copy.code.expires, { date: expiresOn })}</p>
        <div className="dx-team-code-acts">
          <Button variant="secondary" icon="copy" onClick={() => void copyText(shown.code)}>
            {copy.code.copy}
          </Button>
          <Button
            variant="secondary"
            icon="mail"
            onClick={() => void copyText(fill(copy.code.message, { venue: venueName, code: shown.code }))}
          >
            {copy.code.copyMessage}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {copy.code.done}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
