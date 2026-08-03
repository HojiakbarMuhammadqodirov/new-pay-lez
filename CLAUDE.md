# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

The **Paylez** landing page: a single-page React site rendered on top of
`GlobeHero`, a procedural two-colour globe (no textures, no models, no image
assets) built with Three.js / React Three Fiber.

`README.md` documents the globe component in depth — props, the maths behind
the scroll transition, the responsive framing formulas, and the performance
budget. **Read it before changing anything in `src/components/GlobeHero/`.**
This file covers the repo as a whole.

## Commands

There is no test runner. `npm run verify` is the test suite: it exercises the
pure maths — atlas parsing, projection round-trips, country hit-testing, ribbon
geometry invariants, route baking determinism, hero/footer framing across five
aspect ratios, and the rotation accumulator over an hour of simulated frames.
**Run it after touching anything under `geo/`, `config.ts`, or the rotation and
layout hooks.** Run `npm run build` for a type check (`tsc -b` is part of it).

`npm run assets` copies the Twemoji flag font out of `node_modules` into
`public/fonts/`. `dev` and `build` both run it, so it rarely needs invoking
directly — but a fresh clone has no `public/fonts/` until one of them runs.

## Layout

The site is `src/site/` — one file per route, plus `i18n/`, `theme/` and `auth/`,
and all styling in the single sheet `site.css`. The globe is
`src/components/GlobeHero/` — see `README.md`. `landing/` and `b2b/` are design
prototypes, not code.

### `landing/` and `b2b/` are reference material

The `.html`, `.css` and `.jsx` files in `landing/`, and the `.dc.html` mocks and
screenshots in `b2b/`, are the original Paylez design prototypes. **Nothing in
`src/` imports them and Vite does not build them.** They exist so the React
rebuild can be checked against the source design. Don't edit them to change the
live site, and don't wire them into the build.

Where a prototype and the live site disagree, the live site wins on market and
palette and the prototype wins on features. `b2b/` is a UK hospitality pitch in
pounds; `#/b2b` ships its whole feature set — the owner dashboard, portal,
Play & Earn placement, campaign tooling, the rollout steps, the three pricing
tiers — in five languages, each of which prices the page in its own currency
(see the money rule under Conventions). So the prototype's pounds are not
discarded, they are what an English reader sees.

## Conventions

**Two colours, everywhere.** One accent on one ground — `#58e9d4` on `#0d0d0e`
in dark, a cyan on near-white in light. Don't introduce a third hue; derive
tints from the accent with alpha the way `--surface` / `--border` do.

There are exactly two sanctioned exceptions, and both are cases where the thing
depicted *is* its colours: flag emoji, and the controller's four face buttons on
the light page (`BUTTON_COLORS` in `controller/Controller3D.tsx`). The second is
new and worth the words: on black the controller is a dark moulding lit by the
accent, which is the whole look. On paper that same accent became a colour cast
on pale grey plastic — a photo with the white balance wrong — so light mode
lights it with white and puts the colour where a gamepad actually keeps it. Do
not read either exception as licence for a third hue anywhere else.

**Theming is two parallel palettes, and they must agree.**

- CSS: every colour comes from a token in the `:root` / `:root[data-theme='light']`
  blocks at the top of `src/site/site.css`. Nothing below those blocks names a
  colour — if you are typing a hex or an `rgba(` literal into a rule, stop and
  add a token. Translucent surfaces use `rgba(var(--accent-rgb), a)` and
  `rgba(var(--panel-rgb), a)`; glows use `rgba(var(--glow-rgb), calc(a * var(--glow-k)))`
  so the light theme can damp them all at once.
- WebGL: canvases cannot read CSS custom properties, so the handful of colours
  they need is duplicated in `THEMES` in `src/site/theme/context.ts` and passed
  down as props. That file is the *only* place the two systems have to be kept
  in sync.

**The light theme is one hue at three lightnesses, and the hue is cyan.** The
accent is 179° at three steps — `--accent` / `--accent-lit` (both `#089b99`) and
`--accent-ink` (`#007a78`) — chosen by what the mark *is*, because paper sets a
different bar for fills, icon strokes and small text. Dark has no middle to need
and is `#58e9d4` throughout. The full reasoning, and the `--tint-rgb` / `--logo`
tokens, are in `src/site/CLAUDE.md` — read it before touching a colour token.

**Glass opacity is one token, `--glass`.** Every card that floats over a
backdrop — the voucher preview, the streak card, the game cards, the board —
takes its sheet from it. The backdrops move and the cards carry body copy, so
the number is set by the worst frame (a bright knot of the node web drifting
under a paragraph), not by how the card looks over empty sky. Light sets it
higher than dark: white-on-near-white has no colour difference to separate the
card with, and `ink` draws the web as dark marks, which is the high-contrast
direction.

**The globe has a `tone`, not just colours.** `'glow'` composites the accent
additively (the neon original); `'ink'` alpha-blends it so it *darkens* a light
page — additive blending has no headroom above white and renders an almost
invisible globe. `tone='ink'` also forces bloom off. See the `TONE` block in
`GlobeHero/config.ts`.

**Constants live in config files, not inline.** Every tunable for the globe is
in `GlobeHero/config.ts`; the intro's timings are in `PaylezIntro/config.ts`;
the node web's density, link radius and alphas are in `site/network/config.ts`;
the market tape's scroll speed, band, tick size and venue density are in
`site/market/config.ts`. If you find yourself typing a magic number into a component, it probably
belongs in one of those, and the surrounding comment probably explains why the
current value is what it is.

**Copy lives in `i18n/`, structure lives in `content.ts`.** Five languages, in
menu order: English, Polish, Uzbek, Russian, Ukrainian. `en.ts` is the source —
its shape *is* the `Dictionary` type, so a missing or misspelt key in any other
language is a build error. The arrays in `content.ts` are index-aligned with
their dictionary counterparts, so adding a service or feature means one entry in
`content.ts` and one in each of the five dictionaries. Never hardcode
user-visible strings in `sections.tsx`.

Adding a language: create the dictionary, then add it to `LANGUAGE_ORDER` and
`LANGUAGES` in `i18n/context.ts` — nothing else. The provider's runtime guard is
derived from `LANGUAGE_ORDER` precisely so it cannot be forgotten. Give it a
currency in `i18n/currency.ts` at the same time; there is no fallback, and a
missing entry is a type error rather than a page that quietly prices in euros.

**The language picks the currency, and every amount is written in euros.** The
switcher is the only thing a visitor tells us about where they are, so English
prices the site in pounds, Polish in złoty, and so on. Amounts live as euros in
`content.ts` (and in the euro figures behind the dictionaries) and are converted
on the way out by `useMoney` / `useMoneyParts`; a currency symbol typed into a
component or a dictionary is the bug this arrangement exists to prevent. Copy
that quotes a figure carries a `{amount}` hole and is finished with `fill()` —
not two half-sentences, because the words either side of a price do not sit in
the same order in every language. Prices snap to a step the currency actually
uses and estimates snap to two significant figures, both in `currency.ts`: a
price tag reading £126.65 is an exchange rate, and nobody chose it.

**There are three kinds of person, and only two of them are choosable.**
`admin` sits beside `individual` and `business` in `AccountType` rather than
being a flag on one of them: it has no venue, no wallet and no marketing funnel,
it has `#/admin`. Sign-up cannot produce one — `ChoosableType` excludes it at the
type level, so the form that offers the choice *cannot* offer that one. Seeded
credentials live in `auth/users.ts`; the two demo accounts are printed on the
sign-in form and the admin deliberately is not.

**Who is signed in decides what exists, and the rule is one pure function.**
`resolveRoute(route, account)` in `router.ts` is the whole access policy: an
individual has no B2B, Analytics, dashboard or setup; an owner with no listing
goes to setup; an admin's console *replaces* both partner routes and sign-in;
an account that has not answered the individual-or-business question is held at
sign-in. `Site` resolves the route *during render*, so a page this account may
not see never mounts for a frame, and corrects the address bar in an effect
afterwards.

Three things follow from that, and all three are easy to undo by accident:

- **Never call `navigate` from a handler that also changes the session.** The
  hash is set synchronously and React re-renders before `hashchange` fires, so
  the guard runs once against the *new* account and the *old* route and
  redirects over the top of you. Derive the destination in `resolveRoute`
  instead — that is why choosing an account type on the sign-in form does not
  navigate at all.
- **Every resolution must be a fixed point.** `resolveRoute(resolveRoute(r), a)`
  has to equal `resolveRoute(r, a)` or the correcting effect navigates in a
  loop and the tab hangs. `npm run verify` walks the whole account × route
  matrix checking exactly this; it has already caught one.
- **`account.business === null` means "has not been through setup".** Do not
  seed a blank listing when the account type is chosen, or a brand-new owner
  looks finished and lands on the dashboard.

**Two storage keys, and they are different things.** `paylez-session` is who is
signed in *on this device*; `paylez-users` (`auth/directory.ts`) is everyone who
exists — the three seeds plus everyone who has signed up. The session is a
pointer into that directory, which is what makes the rest work: every change an
account makes to itself is written back to its row (`commit` in `AuthProvider`),
so signing out and back in restores a venue's listing and a player's balance, and
the admin console is reading the same rows the app is writing. A stored session
whose id is no longer in the directory is dropped rather than honoured — that is
what a session pointing at a deleted account *is*. Both follow the `theme/` split
(context in one file, provider in another) and the same lazy-initialiser,
wrapped-storage construction. **None of it is authentication** — the credentials
are in the bundle and every sign-up password is written to `localStorage` in
plain text beside them; `auth/users.ts` says so, and it must be replaced by a
server before this points at real data.

**Sign-up asks which kind of account it is; sign-in does not.** The question is
answered *before* the account exists, so nothing new is ever created in the
undecided state. `ChooseType` on the sign-in route still exists for the sessions
that predate that — `resolveRoute` sends `type === null` back there from every
route — and deleting it would sign those visitors out of a tab they never asked
to be signed out of.

**A signed-in individual gets a different page, not a different section.**
`useIsPlayer()` swaps L-Earn and Vouchers wholesale: `learn.tsx` → `games.tsx`,
`vouchers.tsx` → `wallet.tsx`. The marketing pages are untouched and still serve
everyone else, including business owners — those pages describe the *customer's*
experience, which an owner is reading about rather than living. The rules that
decide points, streak, lives and the wallet are pure functions in
`auth/player.ts`, so `npm run verify` owns them; the components only call them.

**Namespace new component classes, and grep before you name one.** `site.css` is
one 6,000-line sheet with no scoping, and three separate collisions have already
shipped bugs here: `.games` / `.game-ico` / `.board-rank` belong to the L-Earn
marketing page, `.wallet-tabs` to the Vouchers page, and the whole `.dash-*`
family to the B2B mock — which silently crushed the dashboard's user pill to
26px. The app screens are prefixed `play-` (games), `wal-` (wallet), `pd-`
(partner dashboard) and `adm-` (console) for that reason. Reusing an existing
class is fine when it is
the *same component* — the wallet's catalogue deliberately keeps `.gift` — but
sharing a name by accident is not.

**There is one field kit, in the `══ forms ══` block.** Until sign-in existed no
rule in `site.css` touched an `input`, `select`, `textarea` or `label`. Anything
that takes input reuses `.field`, `.field-row`, `.field-label`, `.field-help`,
`.field-error`, `.file-pick`, `.form-block` rather than styling its own
controls. Note the error style: the palette has one accent, so an error cannot
be red — it is weighted instead (700 in `--text`, and the control drops its
tint), which is louder by contrast rather than by hue.

**Per-frame work does not go through React state.** This is the load-bearing
rule of the codebase. Scroll position is written to a ref by a passive listener
and read in the render loop; the centred-country result goes through
`focusStore` + `useSyncExternalStore`; scroll progress and the globe silhouette
are published as CSS custom properties on the root element. Routing any of it
through `useState` re-renders the whole Canvas subtree several times a second.
If you add something that updates continuously, follow the same pattern.

**Comments explain *why*.** The existing code is heavily commented with the
reasoning behind non-obvious choices (why intensities clamp at 1.0, why the
spin phase is integrated in turns, why routes are ribbons rather than lines).
Match that: state the constraint that forced the decision, not what the line
does.

**`prefers-reduced-motion` is honoured.** The globe and routes freeze, the
intro is skipped outright rather than sped up, and reveals resolve
immediately. Any new animation needs the same treatment.

**TypeScript is strict-ish and unforgiving of dead code.** `noUnusedLocals`,
`noUnusedParameters`, `erasableSyntaxOnly` and `verbatimModuleSyntax` are on —
type-only imports need the `type` keyword. Scene layers are `memo`'d and
geometry/uniforms are memoised; keep that up when adding to the scene.

**No third-party runtime requests.** Fonts are self-hosted (`@fontsource/*`
bundled, the flag font copied into `public/`), geometry comes from the
`world-atlas` npm package, and there are no CDN links. Keep it that way.

## Things that will bite

- The globe must be mounted `position: fixed` (`.site__globe`). Its scroll
  transition moves it *within* the viewport, so it needs a stable frame of
  reference. Without that, it will not behave.
- **The dashboard and the console are frames, not pages.** `#/dashboard` and
  `#/admin` return early from `SiteContent` with no marketing header, no footer
  and no backdrop. Both still render a `<main>`, and must: `.site > main` is the
  only thing given `z-index: 1`, and the intro hand-off keys off
  `.site[data-intro='running'] main`. A frame in a plain `<div>` sits behind the
  page background. The console is also the one signed-in screen with **no
  assistant dock** — the assistant answers out of *your* points, vouchers and
  city, and an admin has none of those.
- **The console reports; it does not edit.** There is no server, so every number
  on `#/admin` is derived by the same pure functions the app uses —
  `profileCompleteness` decides "live" there exactly as it does on the owner's
  own dashboard. Adding a control that writes to somebody else's account means
  deciding what happens when two tabs disagree, which is a server's job.
- **A venue's analytics come out of one number.** `ADMIN_SERVICES` gives each
  seeded venue a `scale`, and `adminMetrics.ts` derives the whole month from it —
  cards, trends, tables, insights and the country comparison. That is what keeps
  a quiet venue quiet *everywhere*; five separately invented data sets would
  eventually contradict each other, and the original admin panel's screens agreed
  with each other. `engagement` is a sum rather than a seeded figure for the same
  reason — it is shown twice on the screen.
- **`scale: 0` is not a special case, it is the same arithmetic.** Every count
  lands on zero, every table empties, and the view falls back to its "nothing
  yet" states — which is the state every reference screenshot in
  `landing/screenshots/admin-*` was taken in, and the state a real signed-up
  owner's listing is genuinely in. That listing is carried into the same service
  list from the directory, so both are visible side by side.
- **A chart states its own height.** The columns inside it are percentages, and a
  percentage height against an `auto` parent resolves to nothing — which is
  exactly what the country comparison did before `.adm-compare-cols` was given a
  definite `9rem`. Every chart in `site.css` sets one.
- **The globe is the landing page's, and only the landing page's.** Relocate had
  it on the argument that the page was about a border being crossed; it is not —
  it is a guide to where you have already arrived, plus a currency converter. It
  now takes `.site__rings`, CSS contour rings that mean distance from where you
  are standing. One consequence worth knowing: the document's single WebGL
  context is spent on exactly one route again.
- **The backdrop is per route.** Six *marketing* routes, three canvases. Landing *and*
  Relocate get the globe, L-Earn gets the node web, B2B gets the market tape
  (the last two canvas-2D, both on `.site__web`); Analytics gets a CSS plot grid
  (`.site__grid`) and Vouchers a CSS perforation (`.site__stubs`). `Site.tsx`
  renders exactly one. Rendering two costs a second context on a page that
  already spends one on the controller; browsers cap how many a document may hold
  and start dropping the oldest. Only the globe is WebGL, and that is the budget —
  a page past the third reaches for CSS, the way Analytics and Vouchers did, or
  reuses a canvas that already means the right thing, the way Relocate reuses the
  globe. Reuse is free: one route is mounted at a time.
- **Each backdrop has to *mean* something, or it is wallpaper.** The globe is a
  border being crossed — which is why Relocate keeps it rather than inventing a
  fifth thing; the node web is a player base (drifting points that link to each
  other); the market tape is repeat custom compounding into revenue — a line that
  climbs, and the only thing that moves it is a venue under it firing (on its own
  rhythm, or because your cursor walked past); the perforation behind Vouchers is
  the tear line down a ticket stub, and it is the one that does not move, because
  a perforation does not. They are different pictures on purpose. A new one that
  is "the node web but different particles" is a reason not to add it.
- **Charts and product mocks are DOM, not canvas and not images.** Analytics'
  funnel and week chart, and B2B's owner dashboard and pillar consoles, are divs
  with a custom property for their size, animated with `transform` off the shared `[data-shown]` reveal.
  That is deliberate: they inherit the theme tokens, they translate into five
  languages, they price themselves in the reader's currency, and they cost no
  context — none of which a screenshot does. `data-count` on the figures rounds to
  whole numbers, so anything wanting a decimal place needs the hook changed first;
  it also takes `data-prefix`, `data-suffix` and `data-group`, which is how a
  money figure gets its symbol on the correct side and its digits separated.
- **B2B is the only page that sells to a business,** which is why it carries a
  pricing table and a `mailto:` to `SALES_EMAIL` rather than the app CTAs.
  Its venues are Polish — the market the rest of the site is in — while the
  prices follow the reader's language, so an English visitor sees Kraków sites
  quoted in pounds. That is the intended split: the operator is where the
  operator is, and the currency is whoever is reading. The original prototype in
  `b2b/` is a UK pitch throughout; it is reference material like `landing/`, not
  the source of truth.
- The scroll transition is anchored per route in `Site.tsx`: `#guide` on the
  landing page and `#relocate-guide` on Relocate — the third section on each,
  which is where the globe has finished being the hero's right-hand column.
  Anchoring to the second section is too early on both: the globe is still large
  when the content arrives and ends up behind a card rather than under it.
  Renaming or removing either section changes when it settles.
- **An R3F canvas measures itself, so never let its size depend on its own
  output.** Two ways to get that wrong, both of which walk the canvas off the
  page: giving it a CSS `transform` (R3F measures with `getBoundingClientRect`,
  which includes transforms, and writes the result back as an untransformed
  width — so it compounds on every re-measure), or putting it in an auto-sized
  grid/flex track (the track sizes to the canvas, the canvas sizes to the
  track). `Controller3D` passes `resize={{ offsetSize: true }}` against the
  first; containers give it a definite track against the second.
- **The country label is off, and it is off at the call site.** `Site.tsx` passes
  `showLabels={false}`: the flag-and-name card that popped in beside the globe
  competed with the hero copy it sat next to. The prop also gates the detection
  loop, so nothing is running — but `CountryCard`, `useCenteredCountry` and
  `focusStore` are all intact and `DEFAULTS.showLabels` is still `true`, so
  turning it back on is one word. `npm run verify` still exercises the
  hit-testing, which is why none of it was deleted.
- `DETECTION.spotlight` restricts country labels to `PL UA AZ UZ RU`. An empty
  array means every country. The `intervalMs` / `debounceMs` cadence is tuned
  for that small set — widening the spotlight without retuning them makes the
  label flicker. Moot while `showLabels` is off; it is what you will need if you
  turn it on.
- Bloom does the perceived brightness, not saturation. Emissive intensities
  clamp to 1.0 in the shaders and tone mapping is disabled, both deliberately.
  If you change `primaryColor`, scale `POST.bloomThreshold` with its luminance.
- The shaders are template literals. **A backtick inside a GLSL comment ends the
  string** and produces a baffling TypeScript syntax error a few lines later.
- The theme is resolved twice: by an inline script in `index.html` before first
  paint, and by `ThemeProvider` once React mounts. Both read the same
  `paylez-theme` localStorage key — change one and you must change the other, or
  light-theme visitors get a black flash on load.
- `dist/` and `node_modules/` are gitignored; `public/fonts/` is generated but
  committed.
