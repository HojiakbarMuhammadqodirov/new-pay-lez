import { createContext, useContext } from 'react';

/**
 * What every dashboard screen can reach for, and nothing else.
 *
 * The prototype's screens all call three things that live on the frame rather
 * than on the screen: go to another screen, open the create panel, and raise the
 * confirmation strip at the bottom. Prop-drilling those through seven screens
 * and forty buttons is what a context is for.
 *
 * Split from `dashboard.tsx` for the same reason `theme/` and `i18n/` are split:
 * a module that exports both a component and a plain value loses React fast
 * refresh.
 */

/** Which body the create drawer is showing, or `null` for closed. */
export type DrawerKind = 'deal' | 'campaign';

export interface DashboardShell {
  /** Index into `DASH_SCREENS`. */
  screen: number;
  go: (index: number) => void;
  /** Go by id, so a caller can say `'campaigns'` rather than count the rail. */
  goTo: (id: string) => void;
  openDrawer: (kind: DrawerKind) => void;
  closeDrawer: () => void;
  /**
   * Raise the confirmation strip.
   *
   * Every one of these says what *would* have happened, because nothing behind
   * this screen writes anything — same rule as `copy.dashboard.notWired`, in the
   * one place where a button has to acknowledge the press.
   */
  toast: (message: string) => void;
}

/* The default is a working no-op rather than `null` so a screen rendered outside
   the frame — a test, a story — degrades to a dead button instead of throwing. */
export const DashboardContext = createContext<DashboardShell>({
  screen: 0,
  go: () => {},
  goTo: () => {},
  openDrawer: () => {},
  closeDrawer: () => {},
  toast: () => {},
});

export function useDashboard(): DashboardShell {
  return useContext(DashboardContext);
}
