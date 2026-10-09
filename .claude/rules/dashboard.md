---
paths:
  - "src/site/dashboard*"
  - "src/site/partnerMetrics.ts"
  - "src/site/api/partner*"
  - "src/site/api/passes.ts"
  - "src/site/api/team.ts"
  - "src/site/api/workspaces.ts"
  - "src/site/listingEditor.ts"
  - "server/http/routes/partner.ts"
---

# The partner dashboard (`#/dashboard`)

Built to match `b2b/dashboard-design/Paylez Partner Dashboard v3.dc.html`:
**light mode is v3 exactly** (layout, palette, type, copy); **dark keeps the old
dark dashboard** (glass sheets over an aurora, mint on near-black).

## Frame

- **The dashboard and the console are frames, not pages.** `#/dashboard` and
  `#/admin` return early from `SiteContent` with no marketing header, footer or
  backdrop, and still render a `<main>`: `.site > main` is the only thing given
  `z-index: 1`. The console has no assistant dock; the dashboard has one, hidden
  on the assistant screen and while any dashboard overlay (`.dx-scrim`) is open.
- `dashboard.tsx` is the frame: rail (`.dx-rail`, collapses to 74px below
  1160px, becomes a bottom tab bar below 46rem), top bar, venue switcher (only
  with two or more venues), range, toast, drawer and the plan sheet.
- **Screens are keyed, never indexed.** `DashScreenId`, `DASH_ORDER` (the rail's
  order, pinned by `npm run verify`) and `SCREEN_META` (`icon`, `group`, `head`)
  live in `content.ts`; `dashboardRegistry.tsx` maps each id to its component;
  `copy.dashboard.screens[id]` and `copy.dashboard.empty[id]` are keyed objects.
  Adding a screen is one union member plus one entry per table, and the type
  makes a missing one a build error.
- **The shell is `DashboardContext`** (`dashboardShell.ts`): `screen`/`goTo`,
  `venueId`/`venue`/`venues`/`role`/`setVenue`, `range`, `toast`,
  `openDrawer`/`closeDrawer`, `openPlan`, `refresh`, `overlayRoot`. Screens do
  not draw their own deal/campaign drawer, plan sheet or strip: several places
  open each, and each is one panel.
- **Managers get the workspace.** `/v1/me/workspaces` folds into
  `Account.manages`, and `resolveRoute` opens the dashboard for a manager. With
  `role === 'manager'`, billing, team management and the listing are the
  owner's and are hidden, not refused.
- **Eleven screens**: Overview, Hot deals, Loyalty campaigns, Vouchers, Passes,
  Customers, Assistant (grow); Scan activity, Voucher activity, Team, Business
  profile (workspace). Passes (`dashboardPasses*.tsx`, `api/passes.ts`) and Team
  (`dashboardTeam.tsx`, `api/team.ts`: owner, manager, shift lead, cashier,
  custom; six permissions; 6-digit join code) are the two v3 added.

## Styles

- **`dashboard.css` plus one `dashboard-<screen>.css` per screen**, imported by
  its module. Classes are `dx-*` (kit and frame) and `dx-<screen>-*`. Nothing in
  `site.css` styles the dashboard (`npm run verify` checks). `.pd-app` survives
  only as the frame's second class: `.pd-app.dx-app` out-specifies `site.css`,
  which matters because `dashboard.css` lands *before* it in the bundle. Win by
  specificity, never by source order. Grep before naming; the sheet is unscoped.
- **Tokens only.** Every colour is a `--dx-*` token declared in the two token
  blocks at the top of `dashboard.css` (dark first, then
  `:root[data-theme='light']`), and `npm run verify` fails on a colour literal in
  any rule below them. This is the sanctioned exception to the site's two-colour
  rule: v3's ink, deep green, bone, warm red, amber, blue and purple, in light
  only, scoped to `.pd-app`. Dark maps each v3 role to the old dark value.
- **Glass is dark's.** `--dx-glass`, `--dx-glass-blur` and the aurora on
  `.pd-app.dx-app::before` live in `dashboard.css`. Light is v3's solid white
  card on bone with no blur. Reduced transparency or motion turns the glass off.
- **The kit is `dashboardKit.tsx`.** It exports components only, so fast refresh
  works; the hooks are in `dashboardKitHooks.ts` and `useNum` is in
  `dashboardFormat.ts`. It has `PageHead`, `Card`, `Metric`, `Pill`, `Button`,
  `Segmented`, `Toggle`, `Progress`, `Field`, `Table`, `EmptyState`, `Callout`,
  `Drawer`, `Modal` and `ConfirmDialog`. Overlays portal into `overlayRoot`
  inside `.pd-app`, so they keep the tokens. `dashboardScreens.tsx` holds only
  what several screens share: `Screen` (which folds an `ApiState` into loading,
  error or ready), `Figure` (the withheld em dash) and `RemindNotes`.

## Data and honesty

- **Real data only.** Every screen reads the partner API (`api/partner.ts`,
  `api/passes.ts`, `api/team.ts`). A v3 element with no endpoint behind it is
  not drawn, or it shows its empty or "not measured" state. Never draw a made-up
  figure or a button that only toasts; delete a control with nothing honest
  behind it rather than leaving it to refuse.
- **A figure nobody measured is never a zero.** Absent is `undefined`, and every
  reader branches on it: a `?? 0` prints "0 issued" over a venue that has issued
  hundreds. A lookup that misses must not fall through to the raw key.
- **`dashboardDemo.ts` is a fallback for a browser with no venue.** It is read
  only under `?demo=1`, and only after the real call failed for want of a
  session. It is typed against the real responses and tells one story: the heat
  map's total is the overview's visits, and the Passes subscribers are the
  Customers roster's people. It is not `npm run demo:seed` (see
  `server/demo/README.md`).
- **No venue is not no session.** `chain()` reports an empty venue list as
  `no-partner-venue` (`isNoVenue`); `isNoSession` is true for both, so demo
  stand-ins and hidden controls behave alike, and only the sentence differs.
  The frame itself draws `NoVenue` (a "Set up your venue" panel, no rail) when
  the directory is ready and empty outside `?demo=1`, and `foldServer` drops a
  cached listing whose `venueId` the server no longer lists, so the router
  sends that owner to setup.
- **The budget is a store.** Every budget write in `api/partner.ts` goes
  through `announcing()`, and `usePartnerBudget` subscribes to the version, so
  the rail's card (outside the re-mounted page) re-reads after a save; the
  shell's `refresh()` bumps it too. The rail's plan name is the venue's
  `GET …/subscription` (`usePartnerSubscription`, read once by the frame and
  handed to `PlanSheet`), never `useAuth().plan`, which is the consumer plan.
- **`partnerMetrics.ts` derives figures; it does not transcribe them.** A pool
  has exactly three states (spent, set aside, available), and `npm run verify`
  checks they sum to the budget. A figure shown twice is computed once.
- **Money.** Amounts go through `useMoney`, `useVenueMoney` or `useNum` in the
  reader's currency, and money *inputs* hold the reader's currency too. Any
  `…Minor` field crossing into euros goes through a `toEuro` seam: mixing grosz
  with euros once printed "about 192,847 more vouchers". "Money returned" is the
  server's `returnedMinor`, and it is an em dash only when that is absent.
- **The assistant reads numbers; it does not invent them.** Every figure arrives
  through a `fill()` hole from data the server or the demo returned.
- **Two endpoints that answer the same question return the same shape.** The
  budget and overview routes both go through `budgetBody` in
  `server/http/routes/partner.ts`, and `verify:api` compares their key-sets: one
  missing decoration once unmounted the whole dashboard.
- **A waiting scan is confirmed from the counter's device**, not from Scan
  activity. `POST /v1/gate/transactions/:id/confirm` is unchanged.

## CSS traps

- **State `flex-direction` with every `display: flex`.** A rule that only sets
  `display: flex` can inherit a column from a panel rule.
- **Use `minmax(0, 1fr)`, not `1fr`.** `repeat(n, 1fr)` is `minmax(auto, 1fr)`,
  so a `nowrap` cell overflows its track.
