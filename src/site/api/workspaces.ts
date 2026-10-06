/**
 * `GET /v1/me/workspaces` — every context this account can act in.
 *
 * The server's answer to "where can I work?" (`server/domain/team.ts`,
 * `workspacesFor`): the personal workspace first, always, then every venue the
 * account owns, then every team it is on, managers first. The Flutter app's
 * switcher is built on it; the web reads it for two things only:
 *
 * - **Whether this account may open the dashboard at all.** A venue's manager
 *   is a row in `team_members`, not a role on the account, so `GET /v1/me`'s
 *   `roles` cannot say so and `GET /v1/partner/venues` (venues *owned*) returns
 *   nothing for them. `auth/AuthProvider.tsx` folds "manages at least one venue"
 *   into the account as `manages`, and `resolveRoute` lets them through.
 * - **Which venues the dashboard's switcher offers** (`dashboardVenues.ts`).
 *
 * Staff (`kind: 'staff'`) are deliberately not in either: the counter is the
 * phone's, and every partner route refuses them anyway (`team.requireManage`).
 */
import { call } from './client';

export type WorkspaceKind = 'personal' | 'owner' | 'manager' | 'staff';

/** One row, as `server/domain/team.ts` `Workspace` declares it. */
export interface Workspace {
  kind: WorkspaceKind;
  venueId: string | null;
  venueName: string | null;
  memberId: string | null;
  role: string | null;
  perms: Record<string, boolean> | null;
}

export interface WorkspacesBody {
  workspaces: Workspace[];
}

export const WORKSPACES_PATH = '/v1/me/workspaces';

export const myWorkspaces = () => call<WorkspacesBody>(WORKSPACES_PATH);

/** The venues this account runs as a manager, in the server's order. */
export function managedVenues(body: WorkspacesBody): Array<{ id: string; name: string }> {
  const out: Array<{ id: string; name: string }> = [];
  for (const space of body.workspaces) {
    if (space.kind === 'manager' && space.venueId) {
      out.push({ id: space.venueId, name: space.venueName ?? space.venueId });
    }
  }
  return out;
}
