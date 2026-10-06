/**
 * Which component draws which screen — the one table a screen builder edits.
 *
 * Keyed by `DashScreenId`, so it is complete by type: widening the id union in
 * `content.ts` fails the build here until the new screen has a component. To
 * ship a rebuilt screen, change its row to point at the new component (and, if
 * it draws its own head, its `head` in `content.ts` to `'own'`). Nothing else
 * in the frame needs to know.
 *
 * A screen not yet rebuilt would be a `SoonPanel` row, which says so on the
 * page rather than drawing a layout with nothing true in it.
 *
 * Its own module rather than the foot of `dashboardScreens.tsx` (where the
 * positional table used to live): that file also exports `Screen` and `Figure`,
 * which every other screen imports, and a table there importing every screen
 * back made one import cycle of the whole dashboard.
 */
import type { ComponentType } from 'react';

import type { DashScreenId } from './content';
import { Assistant } from './dashboardAssistant';
import { Customers } from './dashboardCustomers';
import { Campaigns } from './dashboardLoyalty';
import { Overview } from './dashboardOverview';
import { Passes } from './dashboardPasses';
import { Scans } from './dashboardScans';
import { Deals } from './dashboardDeals';
import { Profile } from './dashboardProfile';
import { Team } from './dashboardTeam';
import { IssuedVouchers } from './dashboardVoucherList';
import { Vouchers } from './dashboardVouchers';

const SCREENS: Record<DashScreenId, ComponentType> = {
  overview: Overview,
  deals: Deals,
  campaigns: Campaigns,
  vouchers: Vouchers,
  passes: Passes,
  customers: Customers,
  assistant: Assistant,
  scans: Scans,
  voucherActivity: IssuedVouchers,
  team: Team,
  profile: Profile,
};

/** The screen the rail is pointing at. Remounted on a change of id, which fires its requests. */
export function DashboardScreen({ id }: { id: DashScreenId }) {
  const Body = SCREENS[id];
  return <Body />;
}
