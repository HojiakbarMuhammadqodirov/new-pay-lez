import { createContext, useContext } from 'react';

import { RANGE_DAYS, type RangeDays } from './partnerMetrics';

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

/**
 * Values to open a *new* deal or campaign with.
 *
 * The assistant is the caller this exists for: it drafts an offer in
 * conversation and hands the owner to the ordinary form to check and file it,
 * rather than filing anything itself. So the shape is the form's, in the API's
 * units — every field optional, because a draft can arrive with half of it
 * decided.
 *
 * Money is **venue minor units** (`rewardCostMinor`, `minSpendMinor`), which is
 * what the server takes and what the assistant reads; the drawer converts to
 * the reader's currency for its wells, the same way it converts back on file.
 * Weekdays are 0 = Monday and the two times are minutes past local midnight —
 * `DealDraft`'s own conventions, so nothing is translated twice.
 */
export interface DrawerPrefill {
  deal?: {
    title?: string;
    description?: string;
    discountText?: string;
    targetWeekdays?: number[];
    targetFromMin?: number;
    targetToMin?: number;
    capClaims?: number;
    validFrom?: string;
    validTo?: string;
  };
  campaign?: {
    name?: string;
    visitsRequired?: number;
    rewardLabel?: string;
    rewardCostMinor?: number;
    minSpendMinor?: number;
    rewardValidDays?: number;
  };
}

/**
 * What the drawer is open *on*.
 *
 * The panel started as create-only, so a bare `DrawerKind` said everything
 * there was to say. Editing needs one more fact — which row — and it is carried
 * here rather than in the drawer's own state because the thing that knows is
 * the table, and the drawer lives on the frame: six places open it, and threading
 * a deal through six call sites is what the context exists to avoid.
 *
 * `id` rather than the whole row on purpose. The drawer re-reads the deal or the
 * campaign from the list it is already subscribed to, so a row edited in one tab
 * and reloaded in another cannot leave the form filled with a copy that has
 * drifted.
 */
export interface DrawerTarget {
  kind: DrawerKind;
  /** The deal being edited, or `undefined` when the drawer is creating one. */
  dealId?: string;
  /** The campaign being edited — the campaign form's edit mode. */
  campaignId?: string;
  /** Starting values for a new one. Ignored when editing: the row is the truth. */
  prefill?: DrawerPrefill;
}

export interface DashboardShell {
  /** Index into `DASH_SCREENS`. */
  screen: number;
  go: (index: number) => void;
  /** Go by id, so a caller can say `'campaigns'` rather than count the rail. */
  goTo: (id: string) => void;
  /**
   * Open the create panel — on nothing, on a deal (`dealId`), with a draft
   * (`prefill`), or on a campaign (`campaignId`, which is edit mode).
   *
   * Positional to match the contract the assistant was written against; the
   * two ids are never both set, and a caller that passes one leaves the other
   * `undefined`.
   */
  openDrawer: (
    kind: DrawerKind,
    dealId?: string,
    prefill?: DrawerPrefill,
    campaignId?: string,
  ) => void;
  closeDrawer: () => void;
  /**
   * Re-read the screen that is showing.
   *
   * The drawer lives on the frame and files into lists the screens own, so a
   * deal it just created is not in the table the owner is looking at until the
   * table asks again. `useApi` holds no cache to invalidate, so this re-mounts
   * the page, which is what fires every request on it.
   */
  refresh: () => void;
  /**
   * Raise the confirmation strip.
   *
   * It used to say what *would* have happened, because nothing behind this
   * screen wrote anything. Now it says what did: every press that reaches the
   * server ends here, in one of three sentences — it worked, the server was not
   * there, or the server refused and here is why. That is the whole reason it
   * lives on the frame rather than on a screen: fourteen controls across five
   * screens report into one strip, and a second strip somewhere else would be a
   * second opinion about whether the press landed.
   */
  toast: (message: string) => void;
  /**
   * The reporting window, and the one piece of state on this frame that changes
   * what the screens *say* rather than which screen is showing.
   *
   * It lives here rather than on the screens because three of them read it and
   * the control that sets it is on the bar above all of them — the same reason
   * the drawer and the toast are here.
   */
  range: RangeDays;
  setRange: (days: RangeDays) => void;
}

/* The default is a working no-op rather than `null` so a screen rendered outside
   the frame — a test, a story — degrades to a dead button instead of throwing. */
export const DashboardContext = createContext<DashboardShell>({
  screen: 0,
  go: () => {},
  goTo: () => {},
  openDrawer: () => {},
  closeDrawer: () => {},
  refresh: () => {},
  toast: () => {},
  range: RANGE_DAYS,
  setRange: () => {},
});

export function useDashboard(): DashboardShell {
  return useContext(DashboardContext);
}
