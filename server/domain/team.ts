/**
 * A venue's team — the Staff and Manager workspaces. See `server/TEAM.md`.
 *
 * Until this module the only people who could act for a venue were its owner
 * and an admin, and `user_roles` carried a `manager` role that `requireStaff`
 * accepted **at every venue on the platform** — a future-proofing that would
 * have been a skeleton key the day anybody was granted it. Nobody ever was, and
 * it is gone: a manager is now a row here, scoped to one venue, and the global
 * role is no longer read by any authorisation check.
 *
 * ## The shape
 *
 * One table, `team_members`. A row is created by the owner (or a manager) with a
 * name, a role and six permission bits, and is **invited** until somebody
 * redeems its six-digit join code from their own signed-in account, at which
 * point it is **active** and linked to that account. Revoking sets it
 * **revoked** — the row is kept, because past transactions name it as the
 * member who confirmed them, and "Confirmed by Marta" must still read that way
 * a year after Marta left.
 *
 * ## Why every check reads the database
 *
 * Revocation has to take effect on the very next request, not at the end of a
 * session or when a cache expires: a cashier walked out of the shop at noon must
 * not be able to confirm a visit at one minute past. So nothing about team
 * access is copied into the session or the actor — `accessTo` asks the table
 * every time, and it is one indexed lookup.
 *
 * ## The join code
 *
 * Six digits is a million possibilities, which is a keyboard's worth of
 * convenience and a script's worth of brute force. Four things make it safe
 * enough, and each one alone would not:
 *
 *   1. **Stored as an HMAC keyed on the server secret**, never in the clear and
 *      never as a bare hash — a bare SHA-256 of a six-digit number is reversed
 *      by a loop in under a second, so a leaked table would leak every live
 *      code. The plaintext is returned once, from the call that minted it.
 *   2. **Single use.** Redeeming clears the hash in the same conditional UPDATE
 *      that activates the row, so two phones racing one code link one account.
 *   3. **Seven days.** An old code on a sticky note at the till stops working.
 *   4. **Five failed attempts an hour, per account *and* per connection**,
 *      counted before the code is even looked at — the sixth attempt is refused
 *      whether or not it would have been right.
 *
 * ## The client displays
 *
 * Nothing here trusts a role or a permission the phone sends. The counter's
 * view, the running list, what may be paused and who a confirmation is recorded
 * against are all decided from the rows.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Db } from '../db/db.ts';
import * as audit from './audit.ts';
import * as deals from './deals.ts';
import * as partners from './partners.ts';
import { DomainError } from './errors.ts';
import { newId } from './ids.ts';
import { localDay, localMidnight, now, plusDays, plusMinutes, shiftDay, type Iso } from './time.ts';

/* ══════════════════════════════════════════════════ roles & permissions ══ */

export const TEAM_ROLES = ['manager', 'shiftlead', 'cashier', 'custom'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

/** The six counter permissions, in the order the design's toggles list them. */
export const PERMS = ['earn', 'redeem', 'scan', 'running', 'count', 'pause'] as const;
export type Perm = (typeof PERMS)[number];
export type Perms = Record<Perm, boolean>;

const ALL: Perms = { earn: true, redeem: true, scan: true, running: true, count: true, pause: true };
const NONE: Perms = { earn: false, redeem: false, scan: false, running: false, count: false, pause: false };

/**
 * The two templates the add-staff sheet offers. A template is a starting point:
 * the owner may toggle any bit afterwards and the role label stays what was
 * picked. `custom` starts empty. A manager has every counter permission by role,
 * not by bits — see `permsOf`.
 */
export const TEMPLATES: Record<'cashier' | 'shiftlead', Perms> = {
  cashier: { earn: true, redeem: true, scan: true, running: true, count: false, pause: false },
  shiftlead: { ...ALL },
};

export const templateFor = (role: TeamRole): Perms =>
  role === 'manager' ? { ...ALL } : role === 'custom' ? { ...NONE } : { ...TEMPLATES[role] };

/* ══════════════════════════════════════════════════════════════ policy ══ */

/**
 * The numbers. Here rather than in `CONFIG` because they are security controls,
 * not product dials: nobody should be tuning the brute-force ceiling from the
 * same file that sets the welcome gift.
 */
export const TEAM = {
  codeDigits: 6,
  codeValidDays: 7,
  /** Failed joins allowed per rolling hour, per account and per connection. */
  failedJoinsPerHour: 5,
  /** Members that are not revoked, per venue. A café does not have 51 tills. */
  maxMembers: 50,
  /** How many of today's customers the counter lists. */
  recentLimit: 50,
} as const;

/* ═══════════════════════════════════════════════════════════════ rows ══ */

export interface MemberRow {
  id: string;
  venue_id: string;
  user_id: string | null;
  name: string;
  role: TeamRole;
  perm_earn: number;
  perm_redeem: number;
  perm_scan: number;
  perm_running: number;
  perm_count: number;
  perm_pause: number;
  status: 'invited' | 'active' | 'revoked';
  code_hash: string | null;
  code_expires_at: string | null;
  on_shift: number;
  shift_started_at: string | null;
  invited_by: string | null;
  created_at: string;
  joined_at: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
  updated_at: string;
}

/** What every team route sends for one person. The join code is never in it. */
export interface Member {
  id: string;
  name: string;
  role: TeamRole;
  perms: Perms;
  status: MemberRow['status'];
  joinedAt: string | null;
  lastSeenAt: string | null;
  onShift: boolean;
  /**
   * When the outstanding join code stops working, or null when there is none.
   * Additive to the wire contract: it is what lets the owner's screen say
   * "code expired — issue a new one" instead of showing a code that will 404.
   */
  codeExpiresAt: string | null;
}

export const permsOf = (row: MemberRow): Perms =>
  row.role === 'manager'
    ? { ...ALL }
    : {
        earn: row.perm_earn === 1,
        redeem: row.perm_redeem === 1,
        scan: row.perm_scan === 1,
        running: row.perm_running === 1,
        count: row.perm_count === 1,
        pause: row.perm_pause === 1,
      };

export const toMember = (row: MemberRow): Member => ({
  id: row.id,
  name: row.name,
  role: row.role,
  perms: permsOf(row),
  status: row.status,
  joinedAt: row.joined_at,
  lastSeenAt: row.last_seen_at,
  onShift: row.status === 'active' && row.on_shift === 1,
  codeExpiresAt: row.status !== 'revoked' && row.code_hash ? row.code_expires_at : null,
});

const memberById = async (db: Db, venueId: string, memberId: string): Promise<MemberRow | undefined> =>
  await db.get<MemberRow>(`SELECT * FROM team_members WHERE id = $m AND venue_id = $v`, {
    m: memberId,
    v: venueId,
  });

/* ═══════════════════════════════════════════════════════ authorisation ══ */

export type Via = 'owner' | 'admin' | 'manager' | 'staff';

export interface VenueAccess {
  via: Via;
  /** The caller's own membership, for a manager or staff member; null otherwise. */
  member: MemberRow | null;
  perms: Perms;
}

/**
 * Who the caller is **at this venue**, read fresh from the rows.
 *
 * Owner first, then a live membership, then the platform admin. A deleted
 * venue has no team: its members lose access with it, although its owner keeps
 * what `requireStaff` always gave them, so nothing an owner could do before this
 * module changes.
 */
export async function accessTo(db: Db, venueId: string, userId: string): Promise<VenueAccess | null> {
  const venue = await db.get<{ owner_user_id: string | null; deleted_at: string | null }>(
    `SELECT owner_user_id, deleted_at FROM venues WHERE id = $v`,
    { v: venueId },
  );
  if (!venue) return null;
  if (venue.owner_user_id === userId) return { via: 'owner', member: null, perms: { ...ALL } };

  if (!venue.deleted_at) {
    const member = await db.get<MemberRow>(
      `SELECT * FROM team_members WHERE venue_id = $v AND user_id = $u AND status = 'active'`,
      { v: venueId, u: userId },
    );
    if (member) {
      return { via: member.role === 'manager' ? 'manager' : 'staff', member, perms: permsOf(member) };
    }
  }

  const admin = await db.get(`SELECT 1 FROM user_roles WHERE user_id = $u AND role = 'admin'`, { u: userId });
  if (admin) return { via: 'admin', member: null, perms: { ...ALL } };
  return null;
}

/** Owner, admin, or this venue's active manager — the partner dashboard's gate. */
export async function requireManage(db: Db, venueId: string, userId: string): Promise<VenueAccess> {
  const access = await accessTo(db, venueId, userId);
  if (!access || access.via === 'staff') {
    throw new DomainError('forbidden', 'only the venue’s owner or a manager may do this');
  }
  return access;
}

/**
 * Owner or admin only — the things a manager is never given: billing, the
 * subscription, the venue itself, and the managers.
 */
export async function requireOwner(db: Db, venueId: string, userId: string): Promise<VenueAccess> {
  const access = await accessTo(db, venueId, userId);
  if (!access || (access.via !== 'owner' && access.via !== 'admin')) {
    throw new DomainError('forbidden', 'only the venue’s owner may do this');
  }
  return access;
}

/** Whether this account manages any venue — what admits it to `auth: 'partner'` routes. */
export const managesAnyVenue = async (db: Db, userId: string): Promise<boolean> =>
  Boolean(
    await db.get(
      `SELECT 1 FROM team_members m JOIN venues v ON v.id = m.venue_id
        WHERE m.user_id = $u AND m.status = 'active' AND m.role = 'manager' AND v.deleted_at IS NULL`,
      { u: userId },
    ),
  );

export interface CounterAccess extends VenueAccess {
  /** The member this act is recorded against, or null for an owner acting as themselves. */
  memberId: string | null;
}

/**
 * May this caller do a counter act at this venue, and **whom is it recorded
 * against**.
 *
 * `need` is one permission or several, any of which suffices (cancelling a gate
 * needs *some* counter permission, not a particular one).
 *
 * `memberId` is the owner's shared counter device naming who is on shift. It is
 * honoured only from somebody who could have done the act themselves (owner,
 * admin, manager), and only for an **active** member of *this* venue who holds
 * the permission — a device cannot attribute a redemption to a cashier the
 * owner never let redeem. A staff account's own acts are always its own; naming
 * anybody else is refused rather than ignored, because a phone asking to record
 * its confirmation under a colleague's name is not a bug worth being polite to.
 *
 * `customerId` refuses the one thing a till must never do: confirm its own
 * visit. A cashier scanning the venue QR as a customer and then confirming it on
 * their own counter is earning points with nobody else in the room.
 */
export async function requireCounter(
  db: Db,
  venueId: string,
  userId: string,
  need: Perm | readonly Perm[],
  opts: { memberId?: string | null; customerId?: string | null; at?: Iso } = {},
): Promise<CounterAccess> {
  const needs: readonly Perm[] = typeof need === 'string' ? [need] : need;
  const access = await accessTo(db, venueId, userId);
  if (!access) throw new DomainError('forbidden', 'only venue staff may do this at this venue');

  const holds = (perms: Perms) => needs.some((perm) => perms[perm]);
  let memberId: string | null = access.member?.id ?? null;
  let recorded: MemberRow | null = access.member;

  if (access.via === 'staff') {
    if (!holds(access.perms)) {
      throw new DomainError('forbidden', 'your access at this venue does not include this', { need: needs });
    }
    if (opts.memberId && opts.memberId !== access.member!.id) {
      throw new DomainError('forbidden', 'a staff login records only its own actions');
    }
  } else if (opts.memberId) {
    const named = await memberById(db, venueId, opts.memberId);
    if (!named || named.status !== 'active') {
      throw new DomainError('forbidden', 'that team member is not active at this venue');
    }
    if (!holds(permsOf(named))) {
      throw new DomainError('forbidden', 'that team member’s access does not include this', { need: needs });
    }
    memberId = named.id;
    recorded = named;
  }

  if (opts.customerId) {
    const selfServe =
      (opts.customerId === userId && (access.via === 'staff' || access.via === 'manager')) ||
      (recorded?.user_id != null && recorded.user_id === opts.customerId);
    if (selfServe) throw new DomainError('forbidden', 'a team member cannot confirm their own visit');
  }

  if (access.member) await touch(db, access.member.id, opts.at ?? now());
  return { ...access, memberId };
}

const touch = async (db: Db, memberId: string, at: Iso): Promise<void> => {
  await db.run(`UPDATE team_members SET last_seen_at = $t WHERE id = $m`, { t: at, m: memberId });
};

/**
 * May `access` change `target`?
 *
 * Owner and admin: anyone. A manager: cashiers, shift leads and custom members —
 * never another manager (which includes themselves), and never the owner, who
 * is not a row here to begin with. Staff: nobody.
 */
function assertCanManage(access: VenueAccess, target: { role: TeamRole }): void {
  if (access.via === 'owner' || access.via === 'admin') return;
  if (access.via === 'manager' && target.role !== 'manager') return;
  throw new DomainError('forbidden', 'a manager can manage staff, not other managers');
}

/* ═════════════════════════════════════════════════════════════ codes ══ */

/**
 * The stored form of a join code: HMAC-SHA256 keyed on the server secret.
 *
 * Keyed, not salted-and-hashed, because the lookup has to be by value — the
 * person typing the code does not know which row it belongs to — and a keyed
 * hash is the construction that is both searchable and useless without the
 * secret. The `team-join:` prefix keeps it apart from every other HMAC this
 * server computes with the same secret.
 */
export const hashCode = (secret: string, code: string): string =>
  createHmac('sha256', `team-join:${secret}`).update(code).digest('hex');

const CODE_SHAPE = /^\d{6}$/;

/**
 * Mint a fresh code for a member, replacing whatever it had.
 *
 * Collisions are possible — a million values across every live code on the
 * platform — and are handled rather than hoped away: the column is UNIQUE, a
 * clash with another live code draws again, and a clash with a *dead* one
 * (expired, never redeemed) retires the dead one's hash first.
 */
async function issueCode(db: Db, secret: string, memberId: string, at: Iso): Promise<{ code: string; expiresAt: Iso }> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = String(randomInt(0, 10 ** TEAM.codeDigits)).padStart(TEAM.codeDigits, '0');
    const hash = hashCode(secret, code);
    const clash = await db.get<{ id: string; code_expires_at: string | null; status: string }>(
      `SELECT id, code_expires_at, status FROM team_members WHERE code_hash = $h`,
      { h: hash },
    );
    if (clash && clash.id !== memberId) {
      const dead = clash.status === 'revoked' || !clash.code_expires_at || clash.code_expires_at <= at;
      if (!dead) continue;
      await db.run(`UPDATE team_members SET code_hash = NULL, code_expires_at = NULL WHERE id = $i`, { i: clash.id });
    }
    const expiresAt = plusDays(at, TEAM.codeValidDays);
    await db.run(
      `UPDATE team_members SET code_hash = $h, code_expires_at = $e, updated_at = $t WHERE id = $m`,
      { h: hash, e: expiresAt, t: at, m: memberId },
    );
    return { code, expiresAt };
  }
  /* Twenty clashes in a row means the code space is nearly full, which is a
     platform with hundreds of thousands of live invitations — a capacity
     problem, reported as one rather than looped on. */
  throw new DomainError('conflict', 'could not issue a join code; try again');
}

/* ══════════════════════════════════════════════════════ the owner's team ══ */

export async function listTeam(db: Db, venueId: string): Promise<Member[]> {
  const rows = await db.all<MemberRow>(
    `SELECT * FROM team_members WHERE venue_id = $v AND status <> 'revoked' ORDER BY created_at, id`,
    { v: venueId },
  );
  return rows.map(toMember);
}

/**
 * The permission bits a request may set.
 *
 * `perms` may be partial — a missing key keeps the base (the template, or the
 * member's current bit) — but every key that *is* sent must be one of the six
 * and a boolean. An unknown key is refused rather than dropped: a client
 * sending `refund: true` believes it granted something, and silence would let it
 * go on believing that.
 */
export function readPerms(raw: unknown, base: Perms): Perms {
  if (raw === undefined || raw === null) return { ...base };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new DomainError('validation_failed', 'perms must be an object', { field: 'perms' });
  }
  const out = { ...base };
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(PERMS as readonly string[]).includes(key)) {
      throw new DomainError('validation_failed', `perms.${key} is not a permission`, { field: 'perms', allowed: PERMS });
    }
    if (typeof value !== 'boolean') {
      throw new DomainError('validation_failed', `perms.${key} must be true or false`, { field: 'perms' });
    }
    out[key as Perm] = value;
  }
  return out;
}

const permColumns = (perms: Perms) => ({
  pe: perms.earn,
  pr: perms.redeem,
  ps: perms.scan,
  pu: perms.running,
  pc: perms.count,
  pp: perms.pause,
});

export async function createMember(
  db: Db,
  input: {
    venueId: string;
    access: VenueAccess;
    actorId: string;
    name: string;
    role: TeamRole;
    perms?: unknown;
    secret: string;
    at?: Iso;
  },
): Promise<{ member: Member; code: string }> {
  const at = input.at ?? now();
  assertCanManage(input.access, { role: input.role });
  const perms = input.role === 'manager' ? { ...ALL } : readPerms(input.perms, templateFor(input.role));

  return await db.tx(async () => {
    const count = await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM team_members WHERE venue_id = $v AND status <> 'revoked'`,
      { v: input.venueId },
    );
    if ((count?.n ?? 0) >= TEAM.maxMembers) {
      throw new DomainError('cap_reached', `a venue can have at most ${TEAM.maxMembers} team members`, {
        limit: TEAM.maxMembers,
      });
    }
    const id = newId('tmm');
    await db.run(
      `INSERT INTO team_members
         (id, venue_id, name, role, perm_earn, perm_redeem, perm_scan, perm_running, perm_count,
          perm_pause, status, invited_by, created_at, updated_at)
       VALUES ($i, $v, $n, $r, $pe, $pr, $ps, $pu, $pc, $pp, 'invited', $by, $t, $t)`,
      { i: id, v: input.venueId, n: input.name, r: input.role, ...permColumns(perms), by: input.actorId, t: at },
    );
    const { code } = await issueCode(db, input.secret, id, at);
    await audit.record(db, {
      actorId: input.actorId,
      actorRole: input.access.via,
      action: 'team.invite',
      entity: 'team_member',
      entityId: id,
      venueId: input.venueId,
      after: { role: input.role, perms },
      at,
    });
    return { member: toMember((await memberById(db, input.venueId, id))!), code };
  });
}

async function liveTarget(db: Db, venueId: string, memberId: string): Promise<MemberRow> {
  const row = await memberById(db, venueId, memberId);
  /* A member of another venue is a 404 here, not a 403: the id is somebody
     else's business, and "forbidden" would confirm it exists. */
  if (!row) throw new DomainError('not_found', 'team member not found');
  if (row.status === 'revoked') throw new DomainError('invalid_state', 'this team member has been removed');
  return row;
}

export async function updateMember(
  db: Db,
  input: {
    venueId: string;
    memberId: string;
    access: VenueAccess;
    actorId: string;
    role?: TeamRole;
    perms?: unknown;
    at?: Iso;
  },
): Promise<Member> {
  const at = input.at ?? now();
  return await db.tx(async () => {
    const row = await liveTarget(db, input.venueId, input.memberId);
    assertCanManage(input.access, row);
    const role = input.role ?? row.role;
    /* A manager cannot promote anybody to manager — the check above was about
       who the target *is*; this one is about what they would become. */
    assertCanManage(input.access, { role });

    /* A role change without bits resets to the new role's template, which is
       what picking a template in the sheet means; bits sent with it apply on top. */
    const base = input.role && input.role !== row.role ? templateFor(role) : permsOf(row);
    const perms = role === 'manager' ? { ...ALL } : readPerms(input.perms, base);

    await db.run(
      `UPDATE team_members
          SET role = $r, perm_earn = $pe, perm_redeem = $pr, perm_scan = $ps, perm_running = $pu,
              perm_count = $pc, perm_pause = $pp, updated_at = $t
        WHERE id = $m`,
      { r: role, ...permColumns(perms), t: at, m: row.id },
    );
    await audit.record(db, {
      actorId: input.actorId,
      actorRole: input.access.via,
      action: 'team.update',
      entity: 'team_member',
      entityId: row.id,
      venueId: input.venueId,
      before: { role: row.role, perms: permsOf(row) },
      after: { role, perms },
      at,
    });
    return toMember((await memberById(db, input.venueId, row.id))!);
  });
}

/**
 * Remove somebody from the team.
 *
 * The code goes, the shift ends, and the row stays as `revoked` — see the file
 * header for why it is never deleted. Nothing is cached anywhere, so the member's
 * very next request is refused by `accessTo`.
 */
export async function revokeMember(
  db: Db,
  input: { venueId: string; memberId: string; access: VenueAccess; actorId: string; at?: Iso },
): Promise<void> {
  const at = input.at ?? now();
  await db.tx(async () => {
    const row = await liveTarget(db, input.venueId, input.memberId);
    assertCanManage(input.access, row);
    await db.run(
      `UPDATE team_members
          SET status = 'revoked', revoked_at = $t, revoked_by = $by, code_hash = NULL,
              code_expires_at = NULL, on_shift = 0, shift_started_at = NULL, updated_at = $t
        WHERE id = $m`,
      { t: at, by: input.actorId, m: row.id },
    );
    await audit.record(db, {
      actorId: input.actorId,
      actorRole: input.access.via,
      action: 'team.revoke',
      entity: 'team_member',
      entityId: row.id,
      venueId: input.venueId,
      at,
    });
  });
}

/**
 * A new code for a member; the old one stops working at once.
 *
 * For an invited member this is "the code expired" or "I lost the message". For
 * an active one it is "new phone": the membership stays linked to the old
 * account until the new code is redeemed, and redeeming it moves the membership
 * to whichever account typed it — the old account loses access in that moment.
 */
export async function reissueCode(
  db: Db,
  input: { venueId: string; memberId: string; access: VenueAccess; actorId: string; secret: string; at?: Iso },
): Promise<{ code: string }> {
  const at = input.at ?? now();
  return await db.tx(async () => {
    const row = await liveTarget(db, input.venueId, input.memberId);
    assertCanManage(input.access, row);
    const { code } = await issueCode(db, input.secret, row.id, at);
    await audit.record(db, {
      actorId: input.actorId,
      actorRole: input.access.via,
      action: 'team.code',
      entity: 'team_member',
      entityId: row.id,
      venueId: input.venueId,
      at,
    });
    return { code };
  });
}

/* ═══════════════════════════════════════════════════════════ joining ══ */

export interface Workspace {
  kind: 'personal' | 'owner' | 'manager' | 'staff';
  venueId: string | null;
  venueName: string | null;
  memberId: string | null;
  role: string | null;
  perms: Perms | null;
}

const JOIN_SUBJECT = 'POST /v1/team/join|failed';

const failedSubjects = (userId: string, connection: string) => [
  `${JOIN_SUBJECT}|account:${userId}`,
  `${JOIN_SUBJECT}|connection:${connection}`,
];

/**
 * Minutes until the caller may try again, or null when they may try now.
 *
 * Counts only *failures*, which is the difference from `limits.enforce`: a
 * limiter on every call would lock out a manager who joined five venues in an
 * afternoon, and what this defends against is guessing, which is by definition
 * failing. Rows live in `auth_attempts` with `ok = 0`, beside the sign-in
 * throttle's and swept with them.
 *
 * `mine` are the rows this very attempt has already booked (see `bookAttempt`)
 * and are left out of the count, so the rule stays "five failures before this
 * one".
 */
async function joinWait(db: Db, subjects: string[], at: Iso, mine: string[]): Promise<number | null> {
  const since = plusMinutes(at, -60);
  let wait: number | null = null;
  for (const subject of subjects) {
    const rows = (
      await db.all<{ id: string; at: string }>(
        `SELECT id, at FROM auth_attempts WHERE subject = $s AND ok = 0 AND at >= $since ORDER BY at DESC`,
        { s: subject, since },
      )
    ).filter((row) => !mine.includes(row.id));
    if (rows.length < TEAM.failedJoinsPerHour) continue;
    /* The window reopens when the oldest failure that still counts ages out. */
    const pivot = rows[TEAM.failedJoinsPerHour - 1].at;
    const minutes = Math.max(1, Math.ceil((new Date(plusMinutes(pivot, 60)).getTime() - new Date(at).getTime()) / 60_000));
    wait = Math.max(wait ?? 0, minutes);
  }
  return wait;
}

/**
 * Book this attempt as a failure *before* anything is checked.
 *
 * Check-then-record was a race: on Postgres (a pool of ten, real async I/O) a
 * burst of parallel guesses from one account all passed the count before any of
 * them wrote a failure, so far more than five landed in the hour. Booking first
 * closes it — the k-th attempt to book sees at least k−1 others, so only the
 * first five of any burst can get past `joinWait`. What turns out *not* to be a
 * miss (a success, one of the two free refusals, or a refusal for having run
 * out) is forgiven afterwards, which keeps the rule exactly what it was.
 */
async function bookAttempt(db: Db, subjects: string[], at: Iso): Promise<string[]> {
  const ids: string[] = [];
  for (const subject of subjects) {
    const id = newId('ath');
    await db.run(`INSERT INTO auth_attempts (id, subject, at, ok) VALUES ($i, $s, $t, 0)`, { i: id, s: subject, t: at });
    ids.push(id);
  }
  return ids;
}

async function forgive(db: Db, ids: string[]): Promise<void> {
  for (const id of ids) await db.run(`DELETE FROM auth_attempts WHERE id = $i`, { i: id });
}

const noSuchCode = () => new DomainError('not_found', 'that code does not match an invitation');

/**
 * Redeem a join code from the caller's own account.
 *
 * Every miss is the same 404 with the same words — wrong, expired, already used,
 * revoked, malformed — because each distinction is information for somebody
 * guessing. Every miss also costs an attempt, and the check for having run out
 * of attempts comes **before** the code is examined, so a right answer on the
 * sixth try is still refused.
 *
 * Two refusals are not misses and cost nothing: the venue's owner typing their
 * own staff's code (which would make the owner a cashier at their own till), and
 * somebody already on this venue's team (a second row would double their
 * access and split their history).
 */
export async function join(
  db: Db,
  input: { userId: string; userStatus: string; code: string; secret: string; connection: string; at?: Iso },
): Promise<{ workspace: Workspace }> {
  const at = input.at ?? now();
  if (input.userStatus === 'provisional') {
    throw new DomainError('forbidden', 'sign up before joining a team', { signUp: true });
  }

  const subjects = failedSubjects(input.userId, input.connection);
  const booked = await bookAttempt(db, subjects, at);
  const wait = await joinWait(db, subjects, at, booked);
  if (wait !== null) {
    await forgive(db, booked);
    throw new DomainError('rate_limited', 'too many wrong codes — try again later', {
      retryAfterMinutes: wait,
      limit: TEAM.failedJoinsPerHour,
    });
  }

  const code = input.code.trim();
  const hash = CODE_SHAPE.test(code) ? hashCode(input.secret, code) : null;
  const row = hash
    ? await db.get<MemberRow & { owner_user_id: string | null; venue_name: string; deleted_at: string | null }>(
        `SELECT m.*, v.owner_user_id, v.name AS venue_name, v.deleted_at
           FROM team_members m JOIN venues v ON v.id = m.venue_id
          WHERE m.code_hash = $h`,
        { h: hash },
      )
    : undefined;

  /* Constant-time on the stored value as well as the indexed lookup: the lookup
     is keyed, so its timing says nothing about the code, and this makes the
     comparison itself say nothing either. */
  const matches =
    row !== undefined &&
    hash !== null &&
    row.code_hash !== null &&
    row.code_hash.length === hash.length &&
    timingSafeEqual(Buffer.from(row.code_hash, 'hex'), Buffer.from(hash, 'hex'));
  const live =
    matches && row!.status !== 'revoked' && !row!.deleted_at && row!.code_expires_at !== null && row!.code_expires_at > at;

  /* A miss keeps the failure booked above. */
  if (!live) throw noSuchCode();
  const member = row!;

  if (member.owner_user_id === input.userId) {
    await forgive(db, booked);
    throw new DomainError('conflict', 'you own this venue — its workspace is already yours');
  }
  const already = await db.get<{ id: string }>(
    `SELECT id FROM team_members WHERE venue_id = $v AND user_id = $u AND status = 'active' AND id <> $m`,
    { v: member.venue_id, u: input.userId, m: member.id },
  );
  if (already) {
    await forgive(db, booked);
    throw new DomainError('conflict', 'you are already on this venue’s team');
  }

  /* The single-use guarantee: the hash is cleared by the same statement that
     links the account, and only while it is still the hash that was typed. Two
     phones redeeming one code both reach this line; one changes a row. */
  const claimed = await db.run(
    `UPDATE team_members
        SET user_id = $u, status = 'active', joined_at = COALESCE(joined_at, $t), last_seen_at = $t,
            code_hash = NULL, code_expires_at = NULL, on_shift = 0, shift_started_at = NULL, updated_at = $t
      WHERE id = $m AND code_hash = $h AND status <> 'revoked'`,
    { u: input.userId, t: at, m: member.id, h: hash },
  );
  if (claimed.changes !== 1) throw noSuchCode();
  await forgive(db, booked);
  await audit.record(db, {
    actorId: input.userId,
    actorRole: member.role === 'manager' ? 'manager' : 'staff',
    action: 'team.join',
    entity: 'team_member',
    entityId: member.id,
    venueId: member.venue_id,
    at,
  });

  const joined = (await memberById(db, member.venue_id, member.id))!;
  return {
    workspace: {
      kind: joined.role === 'manager' ? 'manager' : 'staff',
      venueId: joined.venue_id,
      venueName: member.venue_name,
      memberId: joined.id,
      role: joined.role,
      perms: permsOf(joined),
    },
  };
}

/**
 * Every context this account can act in: Personal first, always, then the
 * venues it owns, then the teams it is on. A revoked membership is simply not
 * here — which is what "their workspace disappears at once" means on the wire.
 */
export async function workspacesFor(db: Db, userId: string): Promise<Workspace[]> {
  const owned = await db.all<{ id: string; name: string }>(
    `SELECT id, name FROM venues WHERE owner_user_id = $u AND deleted_at IS NULL ORDER BY created_at, id`,
    { u: userId },
  );
  const memberships = await db.all<MemberRow & { venue_name: string }>(
    `SELECT m.*, v.name AS venue_name FROM team_members m JOIN venues v ON v.id = m.venue_id
      WHERE m.user_id = $u AND m.status = 'active' AND v.deleted_at IS NULL
      ORDER BY m.role = 'manager' DESC, m.joined_at, m.id`,
    { u: userId },
  );
  return [
    { kind: 'personal', venueId: null, venueName: null, memberId: null, role: null, perms: null },
    ...owned.map((venue): Workspace => ({
      kind: 'owner',
      venueId: venue.id,
      venueName: venue.name,
      memberId: null,
      role: 'owner',
      perms: { ...ALL },
    })),
    ...memberships.map((row): Workspace => ({
      kind: row.role === 'manager' ? 'manager' : 'staff',
      venueId: row.venue_id,
      venueName: row.venue_name,
      memberId: row.id,
      role: row.role,
      perms: permsOf(row),
    })),
  ];
}

/* ═══════════════════════════════════════════════════════════ shifts ══ */

/**
 * Start or end a shift.
 *
 * A staff login may only start or end its own. The owner's shared counter device
 * — "Who's on shift?" — names the member, and so may a manager's; the member has
 * to have joined, because a shift is who confirmations are recorded against and
 * an invitation nobody has redeemed is not a person yet.
 */
export async function setShift(
  db: Db,
  input: { venueId: string; access: VenueAccess; action: 'start' | 'end'; memberId?: string; at?: Iso },
): Promise<Member> {
  const at = input.at ?? now();
  const own = input.access.member;
  let targetId: string;
  if (input.access.via === 'staff') {
    if (input.memberId && input.memberId !== own!.id) {
      throw new DomainError('forbidden', 'a staff login may start or end only its own shift');
    }
    targetId = own!.id;
  } else if (input.memberId) {
    targetId = input.memberId;
  } else if (own) {
    targetId = own.id;
  } else {
    throw new DomainError('validation_failed', 'memberId is required from the owner’s device', { field: 'memberId' });
  }

  const row = await memberById(db, input.venueId, targetId);
  if (!row) throw new DomainError('not_found', 'team member not found');
  if (row.status !== 'active') throw new DomainError('invalid_state', 'this team member has not joined');

  await db.run(
    `UPDATE team_members
        SET on_shift = $on, shift_started_at = $s, last_seen_at = $t, updated_at = $t
      WHERE id = $m`,
    { on: input.action === 'start', s: input.action === 'start' ? at : null, t: at, m: row.id },
  );
  return toMember((await memberById(db, input.venueId, row.id))!);
}

/* ══════════════════════════════════════════════════════════ the counter ══ */

export interface RunningItem {
  id: string;
  kind: 'deal' | 'stampCard' | 'voucherTier';
  name: string;
  sub: string;
  paused: boolean;
  canPause: boolean;
}

export interface RecentCustomer {
  initials: string;
  name: string;
  detail: string;
  time: string;
}

/**
 * A customer's name as the counter may show it: first name and last initial.
 *
 * GDPR data minimisation, applied where the data leaves rather than trusted to
 * the screen: a cashier needs enough to say "thanks, Amina" and to tell two
 * Aminas apart, not a surname they can look up afterwards.
 */
export function shortName(full: string | null | undefined): string | null {
  const words = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  if (words.length === 1) return words[0];
  return `${words[0]} ${words[words.length - 1][0].toUpperCase()}.`;
}

const initialsOf = (name: string): string =>
  name
    .replace(/\./g, '')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** "20 Oct" — read at a counter, not parsed; an ISO date there read as a code. */
const fmtDay = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
};

/**
 * What's running at this venue, as the counter lists it.
 *
 * Live and paused deals (not drafts, not ended ones), active and paused stamp
 * cards, and every voucher rung — the three things a customer might ask about at
 * the till and a shift lead might need to pause when the kitchen runs out.
 */
export async function runningFor(
  db: Db,
  venueId: string,
  canPause: boolean,
  language: string,
  at: Iso = now(),
): Promise<RunningItem[]> {
  const items: RunningItem[] = [];

  const dealRows = await db.all<{ id: string; status: string; discount_text: string | null; valid_to: string | null }>(
    `SELECT id, status, discount_text, valid_to FROM hot_deals
      WHERE venue_id = $v AND status IN ('live', 'paused') AND (valid_to IS NULL OR valid_to > $t)
      ORDER BY created_at, id`,
    { v: venueId, t: at },
  );
  for (const deal of dealRows) {
    const copy = await deals.copyFor(db, deal.id, language);
    const name = copy?.title?.trim() || deal.discount_text?.trim() || 'Hot deal';
    const parts = [deal.discount_text?.trim() && deal.discount_text.trim() !== name ? deal.discount_text.trim() : null,
      deal.valid_to ? `until ${fmtDay(deal.valid_to)}` : null].filter(Boolean);
    items.push({ id: deal.id, kind: 'deal', name, sub: parts.join(' · '), paused: deal.status === 'paused', canPause });
  }

  const cards = await db.all<{ id: string; name: string; visits_required: number; reward_label: string; status: string }>(
    `SELECT id, name, visits_required, reward_label, status FROM campaigns
      WHERE venue_id = $v AND status IN ('active', 'paused') ORDER BY priority DESC, created_at, id`,
    { v: venueId },
  );
  for (const card of cards) {
    items.push({
      id: card.id,
      kind: 'stampCard',
      name: card.name,
      sub: `${card.visits_required} visits · ${card.reward_label}`,
      paused: card.status === 'paused',
      canPause,
    });
  }

  const tiers = await db.all<{ id: string; discount_pct: number; points_cost: number; active: number }>(
    `SELECT id, discount_pct, points_cost, active FROM voucher_tiers WHERE venue_id = $v ORDER BY points_cost, id`,
    { v: venueId },
  );
  for (const tier of tiers) {
    items.push({
      id: tier.id,
      kind: 'voucherTier',
      name: `${tier.discount_pct}% voucher`,
      sub: `${tier.discount_pct}% off at ${tier.points_cost} points`,
      paused: tier.active !== 1,
      canPause,
    });
  }
  return items;
}

/**
 * Pause or resume one running item.
 *
 * Each kind goes through the *owner's own* domain function for the same change,
 * so a shift lead resuming a deal passes exactly the gates the owner would —
 * the venue still verified, the plan's live-deal cap still with room — and a
 * resumed stamp card is held to the plan's campaign allowance the same way.
 */
export async function setPaused(
  db: Db,
  input: { venueId: string; itemId: string; paused: boolean; actorId: string; actorRole: Via; language: string; at?: Iso },
): Promise<RunningItem> {
  const at = input.at ?? now();

  /* Only what `runningFor` lists can be paused or resumed from the counter, and
     only between running and paused. Without the status filter a "resume" was
     `setStatus(…, 'live')` on *any* row with that id — a shift lead could
     publish a draft the owner had not finished, or bring back a stamp card the
     owner had ended, because neither domain function checks where it came
     from. A draft or an ended item is simply not found here. */
  const deal = await db.get<{ id: string }>(
    `SELECT id FROM hot_deals
      WHERE id = $i AND venue_id = $v AND status IN ('live', 'paused') AND (valid_to IS NULL OR valid_to > $t)`,
    { i: input.itemId, v: input.venueId, t: at },
  );
  if (deal) {
    await deals.setStatus(db, deal.id, input.paused ? 'paused' : 'live', at, {
      check: async () => await partners.assertPublishable(db, deal.id),
    });
    await audit.record(db, {
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: `deal.${input.paused ? 'paused' : 'live'}`,
      entity: 'hot_deal',
      entityId: deal.id,
      venueId: input.venueId,
      at,
    });
  } else {
    const card = await db.get<{ id: string }>(
      `SELECT id FROM campaigns WHERE id = $i AND venue_id = $v AND status IN ('active', 'paused')`,
      { i: input.itemId, v: input.venueId },
    );
    if (card) {
      await partners.setCampaignStatus(db, {
        campaignId: card.id,
        status: input.paused ? 'paused' : 'active',
        actorId: input.actorId,
        at,
      });
    } else {
      const tier = await db.get<{ id: string }>(`SELECT id FROM voucher_tiers WHERE id = $i AND venue_id = $v`, {
        i: input.itemId,
        v: input.venueId,
      });
      /* Another venue's item is not found, not forbidden — see `liveTarget`. */
      if (!tier) throw new DomainError('not_found', 'nothing with that id is running here');
      await db.run(`UPDATE voucher_tiers SET active = $a, updated_at = $t WHERE id = $i`, {
        a: !input.paused,
        t: at,
        i: tier.id,
      });
      await audit.record(db, {
        actorId: input.actorId,
        actorRole: input.actorRole,
        action: `voucher_tier.${input.paused ? 'paused' : 'active'}`,
        entity: 'voucher_tier',
        entityId: tier.id,
        venueId: input.venueId,
        at,
      });
    }
  }

  const item = (await runningFor(db, input.venueId, true, input.language, at)).find((row) => row.id === input.itemId);
  /* A deal whose window closed between the tap and this read is no longer
     "running"; say what was asked for rather than 404 on a change that landed. */
  return item ?? {
    id: input.itemId,
    kind: deal ? 'deal' : 'voucherTier',
    name: '',
    sub: '',
    paused: input.paused,
    canPause: true,
  };
}

export interface CounterView {
  venue: { id: string; name: string };
  member: Member | null;
  perms: Perms;
  running: RunningItem[];
  customersToday: number | null;
  recent: RecentCustomer[];
}

/**
 * The counter's home screen, cut to what this login may see.
 *
 * `running` is empty without `running`, and the count and the activity list are
 * null and empty without `count` — not hidden by the phone, absent from the
 * reply. The owner's shared device may pass `memberId` for whoever is on shift,
 * and then sees exactly what that member would.
 */
export async function counterView(
  db: Db,
  input: { venueId: string; access: VenueAccess; memberId?: string; language: string; at?: Iso },
): Promise<CounterView> {
  const at = input.at ?? now();
  const venue = await db.get<{ id: string; name: string; timezone: string }>(
    `SELECT id, name, timezone FROM venues WHERE id = $v`,
    { v: input.venueId },
  );
  if (!venue) throw new DomainError('not_found', 'venue not found');

  let member: MemberRow | null = input.access.member;
  let perms = input.access.perms;
  if (input.memberId && input.access.via !== 'staff') {
    const named = await memberById(db, input.venueId, input.memberId);
    if (!named || named.status !== 'active') throw new DomainError('not_found', 'team member not found');
    member = named;
    perms = permsOf(named);
  } else if (input.memberId && input.memberId !== member?.id) {
    throw new DomainError('forbidden', 'a staff login sees only its own counter');
  }
  if (input.access.member) await touch(db, input.access.member.id, at);

  let customersToday: number | null = null;
  let recent: RecentCustomer[] = [];
  if (perms.count) {
    const day = localDay(at, venue.timezone);
    const window = { v: venue.id, start: localMidnight(day, venue.timezone), end: localMidnight(shiftDay(day, 1), venue.timezone) };
    customersToday =
      (await db.get<{ n: number }>(
        `SELECT COUNT(DISTINCT user_id) AS n FROM transactions
          WHERE venue_id = $v AND status = 'committed' AND confirmed_at >= $start AND confirmed_at < $end`,
        window,
      ))?.n ?? 0;
    const rows = await db.all<{
      display_name: string | null;
      shared: number;
      intent: string;
      points_granted: number;
      stamp_granted: number;
      confirmed_at: string;
    }>(
      `SELECT CASE WHEN u.deleted_at IS NULL THEN u.display_name ELSE NULL END AS display_name,
              CASE WHEN EXISTS (SELECT 1 FROM data_sharing_consents d
                                 WHERE d.user_id = t.user_id AND d.venue_id = t.venue_id AND d.revoked_at IS NULL)
                   THEN 1 ELSE 0 END AS shared,
              t.intent, t.points_granted, t.stamp_granted, t.confirmed_at
         FROM transactions t JOIN users u ON u.id = t.user_id
        WHERE t.venue_id = $v AND t.status = 'committed' AND t.confirmed_at >= $start AND t.confirmed_at < $end
        ORDER BY t.confirmed_at DESC, t.id DESC LIMIT $lim`,
      { ...window, lim: TEAM.recentLimit },
    );
    recent = rows.map((row) => {
      /* A name only where the customer shares with this venue — the till log's
         rule (§1.4) — and then only first name and last initial. */
      const name = (row.shared === 1 ? shortName(row.display_name) : null) ?? 'Customer';
      const detail =
        row.intent === 'voucher_redeem'
          ? 'Redeemed a voucher'
          : row.intent === 'reward_redeem'
            ? 'Redeemed a reward'
            : `Earned ${row.points_granted} pts${row.stamp_granted === 1 ? ' · stamp' : ''}`;
      return { initials: name === 'Customer' ? '?' : initialsOf(name), name, detail, time: row.confirmed_at };
    });
  }

  return {
    venue: { id: venue.id, name: venue.name },
    member: member ? toMember(member) : null,
    perms,
    running: perms.running ? await runningFor(db, venue.id, perms.pause, input.language, at) : [],
    customersToday,
    recent,
  };
}

/** "Confirmed by <name>" for a transaction, or null when the owner confirmed as themselves. */
export async function confirmedByOf(
  db: Db,
  memberId: string | null,
): Promise<{ memberId: string; name: string } | null> {
  if (!memberId) return null;
  const row = await db.get<{ name: string }>(`SELECT name FROM team_members WHERE id = $m`, { m: memberId });
  return row ? { memberId, name: row.name } : null;
}
