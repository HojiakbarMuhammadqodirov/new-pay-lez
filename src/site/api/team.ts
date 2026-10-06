/**
 * A venue's team, read from and written to the server that holds it
 * (`server/domain/team.ts`, `server/http/routes/team.ts`, `server/TEAM.md`).
 *
 * Typed to the shapes those files return, field for field. Four things about
 * them are load-bearing for any screen built on this module:
 *
 *   * **The owner is not a member.** Ownership is `venues.owner_user_id`, so
 *     the list never contains them; a screen that draws an owner row draws it
 *     from the session, not from this answer.
 *   * **A join code exists in the clear exactly once** — in the answer to the
 *     create or the re-issue that made it. `Member` never carries it, so a code
 *     that was not shown at that moment is gone and the only remedy is a new one.
 *   * **`codeExpiresAt` is null when there is no outstanding code**, which is
 *     every joined member who has not been sent a "new phone" code — not "never
 *     expires". Codes are single use and last seven days.
 *   * **A manager is refused over another manager.** The server says so with
 *     `403 forbidden`; the screen hides those controls first, and prints the
 *     server's words if one still gets through.
 */
import { useMemo } from 'react';
import { call, hasToken } from './client';
import { noSession } from './partner';
import { useApi, type ApiResult } from './useApi';

/* ═════════════════════════════════════════════════════════ vocabularies ══ */

/** `TEAM_ROLES` on the server. The owner is not one of them. */
export const TEAM_ROLES = ['manager', 'shiftlead', 'cashier', 'custom'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

/** The six counter permissions, in the server's (and the phone's) order. */
export const TEAM_PERMS = ['earn', 'redeem', 'scan', 'running', 'count', 'pause'] as const;
export type TeamPerm = (typeof TEAM_PERMS)[number];
export type TeamPerms = Record<TeamPerm, boolean>;

export type MemberStatus = 'invited' | 'active' | 'revoked';

const ALL: TeamPerms = { earn: true, redeem: true, scan: true, running: true, count: true, pause: true };
const NONE: TeamPerms = { earn: false, redeem: false, scan: false, running: false, count: false, pause: false };

/**
 * Where a role's toggles start — `templateFor` on the server, restated because
 * the two programs share no code. Only a starting point: the owner may flip any
 * bit and the role label stays. A manager holds every permission *by role*, and
 * the server ignores bits sent for one.
 */
export function templateFor(role: TeamRole): TeamPerms {
  if (role === 'manager' || role === 'shiftlead') return { ...ALL };
  if (role === 'cashier') return { ...NONE, earn: true, redeem: true, scan: true, running: true };
  return { ...NONE };
}

/* ═══════════════════════════════════════════════════════════ responses ══ */

/** `Member` in `server/domain/team.ts`. The join code is never in it. */
export interface TeamMember {
  id: string;
  name: string;
  role: TeamRole;
  perms: TeamPerms;
  status: MemberStatus;
  joinedAt: string | null;
  lastSeenAt: string | null;
  onShift: boolean;
  /** When the outstanding join code stops working, or null when there is none. */
  codeExpiresAt: string | null;
}

/** Revoked members are left out by the server. */
export interface TeamListResponse {
  members: TeamMember[];
}

export interface TeamCreated {
  member: TeamMember;
  /** Six digits, shown once. */
  code: string;
}

export interface TeamCode {
  code: string;
}

/* ════════════════════════════════════════════════════════════════ input ══ */

export interface NewMember {
  /** At most 60 characters. */
  name: string;
  role: TeamRole;
  /** Partial is allowed: missing keys keep the role's template. */
  perms?: Partial<TeamPerms>;
}

/** Partial. A role change without bits resets to that role's template. */
export interface MemberPatch {
  role?: TeamRole;
  perms?: Partial<TeamPerms>;
}

/* ═════════════════════════════════════════════════════════════ requests ══ */

const teamPath = (venueId: string) => `/v1/partner/venues/${encodeURIComponent(venueId)}/team`;
const memberPath = (venueId: string, memberId: string) => `${teamPath(venueId)}/${encodeURIComponent(memberId)}`;

/** `useApi` on the team list, with "no partner session" as its own state rather than a request that 401s. */
export function usePartnerTeam(venueId: string | null): ApiResult<TeamListResponse> {
  const path = venueId !== null && hasToken() ? teamPath(venueId) : null;
  const result = useApi<TeamListResponse>(path);
  const unavailable = useMemo<ApiResult<TeamListResponse>>(
    () => ({
      state: { status: 'error', error: noSession('This device has no partner session on the API.') },
      reload: () => undefined,
    }),
    [],
  );
  return path === null ? unavailable : result;
}

/** 409 `cap_reached` past 50 members; 403 for a manager adding a manager. */
export const addMember = (venueId: string, input: NewMember) =>
  call<TeamCreated>(teamPath(venueId), { method: 'POST', body: input });

export const updateMember = (venueId: string, memberId: string, patch: MemberPatch) =>
  call<{ member: TeamMember }>(memberPath(venueId, memberId), { method: 'PATCH', body: patch });

/** 204. Immediate: their next request is refused and their workspace disappears. */
export const revokeMember = (venueId: string, memberId: string) =>
  call<null>(memberPath(venueId, memberId), { method: 'DELETE' });

/**
 * A new join code; the old one stops working at once. For an active member
 * (a new phone) the current link stays until the new code is redeemed.
 */
export const reissueCode = (venueId: string, memberId: string) =>
  call<TeamCode>(`${memberPath(venueId, memberId)}/code`, { method: 'POST' });
