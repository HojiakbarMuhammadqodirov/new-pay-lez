/**
 * Which venues this account can open the dashboard on, and which one it has.
 *
 * Hooks only, in a `.ts` file, for the fast-refresh reason `dashboardFormat.ts`
 * states. `DashboardPage` calls `useVenueDirectory` once and hands the answer to
 * every screen twice over: on `DashboardContext` (`venueId`, `venue`, `venues`,
 * `role`, `setVenue`) for code written against the shell, and through
 * `SelectedVenueContext` (`api/partner.ts`) for the hooks that predate it.
 *
 * ## Two lists, because there are two ways to be allowed in
 *
 * An **owner** owns the venue row (`venues.owner_user_id`) and
 * `GET /v1/partner/venues` lists it, whole. A **manager** is a `team_members`
 * row on somebody else's venue: that endpoint lists nothing for them, and the
 * only place the venue appears is `GET /v1/me/workspaces`. The partner routes
 * themselves already admit a manager — `mine()` → `team.requireManage` — so
 * once the dashboard knows the id, every report and every write works for them
 * exactly as for the owner. **Staff are not offered**: the counter is the
 * phone's, and the partner routes refuse them.
 *
 * A manager's venue has no row in the owner list, and the screens need one
 * (`currency` prices every `…Minor`, `timezone` is the clock a push is
 * scheduled against), so it is read from `GET …/:id/listing` — a route a
 * manager may call — and reduced to the `PartnerVenue` columns it carries. The
 * three gate rules (`scan_cooldown_hours` and the two spend limits) are not in
 * the listing and stay absent, which every reader already handles: they are
 * optional on `PartnerVenue` precisely so a reader says nothing rather than
 * quoting a default.
 *
 * ## The choice is remembered per device
 *
 * `paylez-dashboard-venue` in `localStorage`, read and written inside `try`
 * like every other key on this site, because a convenience that throws in a
 * private window must not take the dashboard with it. A remembered id that is
 * no longer in the list (a venue sold, a membership revoked) is ignored and the
 * first venue is shown — the list is the server's, the memory is a hint.
 */
import { useCallback, useMemo, useState } from 'react';

import { hasToken } from './api/client';
import type { ListingResponse } from './api/listing';
import { noSession, type PartnerVenue, type SelectedVenue } from './api/partner';
import { useApi, type ApiResult, type ApiState } from './api/useApi';
import { managedVenues, WORKSPACES_PATH, type WorkspacesBody } from './api/workspaces';
import type { DashVenue } from './dashboardShell';

const STORAGE_KEY = 'paylez-dashboard-venue';

function readChoice(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeChoice(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Forgetting which venue was open is not worth failing over.
  }
}

/** The `PartnerVenue` columns a listing carries, for a venue this account manages. */
function rowFromListing(listing: ListingResponse): PartnerVenue {
  return {
    id: listing.id,
    name: listing.name,
    city: listing.city,
    currency: listing.currency,
    timezone: listing.timezone,
    status: listing.status,
    verified_at: listing.verifiedAt,
  };
}

export interface VenueDirectory {
  /** The list as a state — loading, the merged list, or why there is none. */
  list: ApiState<DashVenue[]>;
  /** The list when it has arrived, otherwise empty. */
  venues: DashVenue[];
  /** The venue showing, or `null` (still asking, none at all, or no session). */
  chosen: DashVenue | null;
  /** Its row, once read. */
  row: PartnerVenue | null;
  /** Both, shaped for `SelectedVenueContext`. */
  selected: SelectedVenue;
  choose: (id: string) => void;
}

export function useVenueDirectory(): VenueDirectory {
  const token = hasToken();
  const [choice, setChoice] = useState<string | null>(readChoice);

  const owned = useApi<PartnerVenue[]>(token ? '/v1/partner/venues' : null);
  const spaces = useApi<WorkspacesBody>(token ? WORKSPACES_PATH : null);

  const list = useMemo<ApiState<DashVenue[]>>(() => {
    if (!token) {
      return { status: 'error', error: noSession('This device has no partner session on the API.') };
    }
    if (owned.state.status === 'loading' || spaces.state.status === 'loading') {
      return { status: 'loading' };
    }
    const rows = owned.state.status === 'ready' ? owned.state.data : [];
    /* A server older than the workspaces route answers 404 here; that is "this
       account manages nothing we can see", not a reason to fail the owner's own
       list. */
    const managed = spaces.state.status === 'ready' ? managedVenues(spaces.state.data) : [];
    if (owned.state.status === 'error' && managed.length === 0) {
      return { status: 'error', error: owned.state.error };
    }
    const ownedIds = new Set(rows.map((row) => row.id));
    const venues: DashVenue[] = [
      ...rows.map((row): DashVenue => ({ id: row.id, name: row.name, role: 'owner' })),
      ...managed
        .filter((venue) => !ownedIds.has(venue.id))
        .map((venue): DashVenue => ({ ...venue, role: 'manager' })),
    ];
    return { status: 'ready', data: venues };
  }, [token, owned.state, spaces.state]);

  const venues = useMemo(() => (list.status === 'ready' ? list.data : []), [list]);
  const chosen = useMemo(
    () => venues.find((venue) => venue.id === choice) ?? venues[0] ?? null,
    [venues, choice],
  );

  /* Only a managed venue needs the extra read; an owned one is already whole. */
  const listing = useApi<ListingResponse>(
    chosen?.role === 'manager'
      ? `/v1/partner/venues/${encodeURIComponent(chosen.id)}/listing`
      : null,
  );

  const row = useMemo<PartnerVenue | null>(() => {
    if (chosen === null) return null;
    if (chosen.role === 'owner') {
      return owned.state.status === 'ready'
        ? (owned.state.data.find((entry) => entry.id === chosen.id) ?? null)
        : null;
    }
    return listing.state.status === 'ready' ? rowFromListing(listing.state.data) : null;
  }, [chosen, owned.state, listing.state]);

  /* Keyed on the two `reload`s, which `useApi` keeps stable, and not on the
     results themselves — those are new objects every render, and a context value
     that changed every render would re-render every screen with it. */
  const reloadOwned = owned.reload;
  const reloadSpaces = spaces.reload;
  const reload = useCallback(() => {
    reloadOwned();
    reloadSpaces();
  }, [reloadOwned, reloadSpaces]);

  /*
   * The two `ApiResult`s the pre-switcher hooks return. Folded so that the
   * three "not yet" cases stay distinct: the list still loading is loading, a
   * list that failed is that failure (including `no-partner-session`, which is
   * what lets `?demo=1` draw its stand-ins), and a list that is simply empty is
   * a ready `null` — "this account has no venue", which `chain()` already turns
   * into the right panel.
   */
  const selected = useMemo<SelectedVenue>(() => {
    if (list.status !== 'ready') {
      const state = list as ApiState<never>;
      return { id: { state, reload }, row: { state, reload } };
    }
    const id: ApiResult<string | null> = {
      state: { status: 'ready', data: chosen?.id ?? null },
      reload,
    };
    let rowState: ApiState<PartnerVenue | null>;
    if (chosen === null) rowState = { status: 'ready', data: null };
    else if (chosen.role === 'manager' && listing.state.status !== 'ready') {
      rowState = listing.state as ApiState<never>;
    } else rowState = { status: 'ready', data: row };
    return { id, row: { state: rowState, reload } };
  }, [list, chosen, row, listing.state, reload]);

  const choose = useCallback((id: string) => {
    writeChoice(id);
    setChoice(id);
  }, []);

  return { list, venues, chosen, row, selected, choose };
}
