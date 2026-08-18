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

`npm run banks` regenerates `src/site/games/data/` from the CSV and JSON exports
in `updates/`. It is deliberately **not** part of `dev` or `build`: those files
are a hand-delivered export rather than a dependency, the output is committed,
and a build that silently rebuilt 3 MB of game data from files that may not be
present would fail on a fresh clone for no reason. Run it when a new export
lands, and commit what it writes.

`npm run server` starts the backend, and `npm run verify:api` is *its* test
suite — a second one, because it checks a different kind of thing (see
`server/README.md`). `tsc -b` type-checks both projects: `tsconfig.app.json`
covers `src/`, `tsconfig.server.json` covers `server/`, and they are separate
because one targets a browser and the other Node. `npm run server:import`
re-reads the old database in `new-data/` and exits.

## Layout

The site is `src/site/` — one file per route, plus `games/`, `i18n/`, `theme/`
and `auth/`, and all styling in the single sheet `site.css`. The globe is
`src/components/GlobeHero/` — see `README.md`. `landing/` and `b2b/` are design
prototypes, not code. `updates/` is inbound material — exports and specs handed
over to be built from, read by `npm run banks`; nothing in `src/` imports it.

`server/` is the backend, built from the two statements of work in `new-data/`
and seeded from the Base44 export beside them. It shares nothing with `src/` —
no imports either way — and is documented in `server/README.md`; read that
before changing anything under it.

### `server/` is a separate program in the same repo

Zero runtime dependencies, like the front end: `node:sqlite`, `node:http` and
`node:crypto`, run straight from TypeScript by Node 22. `npm run server` boots
it (migrating, seeding and importing the old database on an empty file);
`npm run verify:api` is its test suite, the counterpart of `npm run verify`, and
it is what checks the rules that are arithmetic rather than rendering — the
points ledger's FIFO expiry, the budget pool's three states, the amount-capture
gate, the min-cohort suppression, the consent gate on identified customers.
**Run it after touching anything under `server/domain/`.**

Two things about it are easy to undo by accident and both are checked:

- **The balance is derived, never edited.** `users.points_cache` is written only
  by `domain/ledger.ts` and reconciled against the ledger; a reversal is a
  compensating entry and never a mutation of the row it reverses.
- **A pool has exactly three states and they exhaust it** — spent, set aside,
  available — which is the same rule `partnerMetrics.ts` states on the front end,
  enforced here on the money that actually moves.

Two of the four question banks do not come from `new-data/`. The capitals and
flags banks are derived from the `CountryCapital` export; **the general and
Poland banks are the hand-delivered CSVs in `updates/`**, the same files
`npm run banks` reads for the front end, and `db/import.ts` reads that directory
as a second source. They were missing for a while and the symptom is worth
recognising: `POST /v1/games/sessions {gameType:"brain"}` returns a 404 saying
"no questions in the brain bank", and two of the seven games are unplayable
while every other endpoint looks fine. The import reports it in its notes when
the files are not there rather than importing nothing quietly.

The React site still runs on `localStorage` (`src/site/auth/`, which says so at
the top of `users.ts`). Wiring it to this backend is a client module, not a
redesign: the API returns the fields `PlayerState` and `BusinessProfile` already
use. Until somebody does, the two halves are independent and both are correct on
their own terms.

**The Flutter app is the one client that does talk to it.** It lives in the
`Pay-lez mobile` repo beside this one and is wired end to end — the four-step
gate from both sides, all seven games on the server's move-by-move protocol, the
wallet, the guidebook, and the partner companion. Two things follow for anybody
changing `server/`. Its `test/live_test.dart` runs the whole journey against
`npm run server` and will catch a renamed field before a phone does, so **run it
after changing a response shape**. And its `test/protocol_test.dart` holds
response bodies copied verbatim from a running server — a deliberate duplicate
of this repo's shapes, because a mapper written against a guess passes a test
written against the same guess.

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

There are exactly three sanctioned exceptions, and all three are cases where the
thing depicted *is* its colours: flag emoji; the controller's four face buttons
on the light page (`BUTTON_COLORS` in `controller/Controller3D.tsx`); and the
platformer behind the signed-in Play screen (`LEVEL.palette` in `level/config.ts`).

The controller is worth the words: on black it is a dark moulding lit by the
accent, which is the whole look. On paper that same accent became a colour cast
on pale grey plastic — a photo with the white balance wrong — so light mode
lights it with white and puts the colour where a gamepad actually keeps it.

The level is worth more of them, because it is the largest of the three. It
draws a brick, a lucky box, a mushroom and a pipe, and a backdrop has no labels
— so on one accent they are four identical rectangles and the thing stops being
a level at all. The four hues are the Play mock's own
(`b2b/Paylez Play.dc.html`), which spends them on exactly the same problem one
layer up. Three constraints keep it from leaking: the **ground** is drawn in
`primaryColor`; the **runner** is drawn in it too, at four lightnesses, because
he is the product moving through the level rather than part of the scenery; and
the `ink` row is those same four hues taken down to where they read on paper —
it is **not** a second accent ramp and nothing in `site.css` may reach for it.
The exception is the *set*, not the cast.

Do not read any of the three as licence for a fourth hue. In particular, when a
design hands you a colour per item and you are *not* depicting an object, reach
for texture instead — see the `[data-texture]` note below.

**When a design hands you a hue per item, reach for texture — unless the item is
an object.** The Play mock (`b2b/Paylez Play.dc.html`) gives each game its own
colour, and that colour is doing real work: it is how six cards in a grid stop
being the same card six times. The work is what had to be kept, not the
mechanism. `[data-texture]` on `.play-card` paints a different repeating pattern
per game in `--accent-rgb` at three to five percent, and the cards read as six
objects with one accent on the page. `PLAY_TEXTURES` in `games.tsx` is
index-aligned with `GAMES` like everything else there. The alphas are the whole
difficulty and they are set by the worst case — a texture crisp enough to admire
on an empty card is noise under the two rule lines every card carries.

That is the rule for *cards*, which are surfaces carrying their own labels. It
is not the rule for the level behind them, where a brick and a lucky box are
different things rather than differently-decorated ones and no label exists to
tell them apart. Deciding which of the two you have is the whole judgement.

**The brand is the word, and the word is `900 21px/1 Onest`.** That is the app's
own declaration, carried over exactly: `--font-brand` / `--brand-size` in
`site.css`, and `.brand` is the class every one of them uses — header, footer,
dashboard rail, admin console, and the intro. There is **no tile beside it**.
The square logo files are still in `public/logo/` behind the `--logo` token, but
no chrome shows them: the product has never put a mark next to the name, and a
30px square of art beside six letters was the one place the site and the app
disagreed about what the brand looks like. If you are adding a surface that
needs the wordmark, use `.brand` rather than setting the face again.

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

Index alignment is the default, not a law: `copy.nav` is **keyed** because a
business owner sees the header in a different order and without one of its items
(`NAV_ORDER_BUSINESS` in `content.ts`), and no array survives being reordered.
Reach for keys whenever the *order* is a variable rather than a constant.

**A page must not describe a list it does not read.** The L-Earn marketing
section used to carry its own three game cards in five dictionaries, and it was
already wrong — it claimed three games after five had shipped. It now maps
`GAMES` with the same names and rule strings the app screen uses, so the pitch
cannot drift from the product. Where a marketing section is describing something
`content.ts` already models, render from the model.

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

There is a fourth rounding mode for the case that rule destroys. `unit` keeps
the currency's own minor units (`decimals`, read from `fx.ts` like the rate) and
is for a per-something cost: a cost per claim, per visit or per new customer is
a pound or two at most, and `exact` rounds all three of them to "£1" — which is
what the partner dashboard's "where your money works" panel showed before it
existed, three different figures written identically. It is 0 decimals where the
currency has no minor unit, so a soum never grows a fractional part.

**Every rate in the building comes from `i18n/fx.ts`.** That is the nineteen
currencies the Relocate converter offers, each as units per one euro, from the
rate sheet handed over for it — and the five in `currency.ts` read their `rate`
from it rather than carrying their own. One anchor, so a cross rate is
`to.rate / from.rate` and is exact for all 342 pairs; one table, so the
converter and the price tag two pages over cannot quote different pounds. Two
things live *outside* it on purpose: digit grouping, which belongs to the
reader's language and not to the currency being written (`CURRENCIES[language].group`),
and the currency *names*, which are dictionary copy keyed by ISO code — indexed
with `FxCode`, so a currency added to the table without all five names is a
build error.

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

**A section anchor carries its own page.** A hash that does not start with `#/`
used to mean "the landing page", full stop — so *every in-page link on every
other page* went Home. "Open the dashboard" on Analytics pointed at
`#analytics-reports`, missed the route table, and dropped the visitor on the
marketing front page; the same was true of `#b2b-cta`, `#learn-games`,
`#vouchers-catalogue` and `#relocate-guide`. `ANCHOR_ROUTES` in `router.ts` maps
each page's section prefix to its route, and the landing page keeps the
unprefixed ones. **A new page must prefix its section ids with its own name and
add the prefix to that table**, or its own links will leave it; `npm run verify`
checks the table against `PATHS` and walks the known anchors.

And a matching rule for the labels: **a button goes where its words say.**
"Open the dashboard" opens `#/dashboard` (which resolves to sign-in for a
visitor, correctly); "Play & Earn" goes to L-Earn; "Talk to us" goes to Contact.
Several of these pointed at a section on the page they were already on, which is
what a page does when nobody has anywhere to send you yet.

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

**One function decides what a finished round does to the account.**
`awardPoints` owns the streak, the 24-hour window, the lapse that takes the
balance with it, and the freeze that absorbs one missed day. Seven games score
seven different ways — a quiz pays per right answer, a flight pays per gap past
an endless target, Word Builder totals five per-word scores plus a perfect-round
bonus, Memory Match pays a base plus an efficiency curve — and **none of them
restates what a streak is.** They compute a number and hand it over. There were
two copies of that rule once and it would be five by now.

**Questions come from `games/data/`, through a bag.** The four quiz rounds no
longer read a handful of items out of the dictionaries: `scripts/build-question-banks.mjs`
turns the CSV exports in `updates/` into one file per bank per language (2102
general questions, 98 on Poland, 196 flags, 196 capitals), which are code-split
and fetched on first play — so a visitor who never opens L-Earn pays nothing for
them, and building a round is asynchronous. Run `npm run banks` when a new export
arrives and commit what it writes; it is deliberately *not* part of `build`.

`games/bag.ts` is the no-repeat rule: **every question in a bank is asked once
before any of them is asked twice.** Shuffling the pool per round and taking the
first five is the thing it replaced, and with a two-thousand-question bank that
let a player grind all evening and never see a third of it. Anything that can
renumber the rows has to invalidate the bag — the key encodes the pool size for
that reason, and missing translations are filled at build time so an index means
the same question in every language.

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

**Anything shaped like a control has to be one, edge to edge.** Two versions of
the same bug shipped on Relocate: the converter's amount was an input sized to
its own digits, so the only tappable part of a full-width row was the number
itself; and the assistant's ask box was a `<span>` that looked exactly like a
field and did nothing at all. The fixes are the pattern — wrap the input in a
`<label>` that fills the row, so the well, the currency symbol and the empty
space after the digits all put the caret in it; and give a decorative field a
real destination (the ask box is an `<a>` to sign-in, which is where the
assistant lives). A picture of a control is only honest when nothing about it
invites a tap.

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
- **The partner dashboard carries the prototype's arithmetic, not its output.**
  `b2b/Paylez Partner Dashboard v2.dc.html` is a working React app: a page of
  seeds and a page of maths that turns them into every figure on all its screens.
  `partnerMetrics.ts` is that ported — the seeds verbatim, and the derivations
  re-run. Transcribing the *numbers* instead was the version before it, and it
  drifted the first time one was edited: the overview's attribution, the deals
  table's claim rates, the two budget pools and the cost per new customer are
  four views of one venue and have to move together. Two things follow. **A pool
  has exactly three states and they exhaust it** — spent, set aside, available;
  `npm run verify` checks both pools sum to their budget, because a bar that does
  not lets an owner commit the same money twice. And **a figure shown twice is
  computed once**: the cost-per-new-customer headline and the last column of the
  trend beside it are one value, the plan card in the rail reads the same pool
  the Campaigns screen does, and the prototype's own third seed for that column
  (which disagreed with its headline by a few pence) is gone.
- **The dashboard's surface is glass, and dense panels opt out of it.** Every
  panel is `.pd-glass` over the aurora on `.pd-app::before` — two radial fields
  of `rgba(var(--glow-rgb), …)`, the accent at alpha, not a second hue. The sheet
  opacity is one token, `--pd-glass`, set by the worst frame (body copy over the
  brightest part of the wash) rather than by how a card looks over an empty
  corner — the same argument `--glass` makes for the marketing cards, on a screen
  with far more text. Tables and the heat map take `data-solid`, which keeps the
  sheet and drops the blur: tabular figures at 0.78rem over a live gradient is
  the reading the rule exists to protect, and `backdrop-filter` on a dozen
  stacked panels is the most expensive thing on the page. Reduced-transparency
  and reduced-motion both turn it off.
- **The console reports; it does not edit.** Every number on `#/admin` is
  derived by the same pure functions the app uses — `profileCompleteness`
  decides "live" there exactly as it does on the owner's own dashboard. Adding a
  control that writes to somebody else's account means deciding what happens when
  two tabs disagree, which is a server's job.
- **The console's fourth tab is the one screen that asks a server, and it says
  so when there is none.** Three tabs are derived on this device; "who visited
  the site" is a question about people who never signed in and never touched this
  browser, so `adminWebsite.tsx` reads `/v1/admin/*` through `api/`. It is the
  first thing in `src/` that talks to `server/` — the session, wallet and games
  are still `localStorage`. Two rules come with it. **A failed request is a
  state, not a zero**: `useApi` returns `loading | ready | error` as a union
  precisely so "not connected" and "connected, and the answer is 0" cannot be
  confused, and the tab renders a "backend is not answering" panel rather than an
  empty chart. And **the console signs in to the API separately from the site**,
  because the site's admin is a seed in `auth/users.ts` and the server's is
  whoever `PAYLEZ_ADMIN_EMAIL` provisioned; that panel disappears when the site's
  own auth moves to the server.
- **The traffic beacon must not acquire a memory.** `api/traffic.ts` sends page
  views and named actions to `POST /v1/traffic` and holds *nothing* — no cookie,
  no `localStorage` key, no visitor id. The server identifies a visitor by a hash
  of the connection that rotates daily, which is what keeps the whole thing
  outside consent-banner territory; a client that generates an id to "improve"
  the numbers has quietly built a tracking cookie and earned the banner. The cost
  is that returning *anonymous* visitors is unmeasurable — the API returns
  `anonymousReturningVisitors: null` and the console prints a sentence. **Never
  render that as 0**; it is the same lie `suppressed` exists to prevent one screen
  over.
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
- **The globe belongs to the landing page, and to Contact.** Relocate had it on
  the argument that the page was about a border being crossed; it is not — it is
  a guide to where you have already arrived, plus a currency converter, and it
  now takes `.site__rings`, CSS contour rings that mean distance from where you
  are standing. Contact gets it instead: reachable from anywhere is the one other
  thing the globe honestly says. The document's single WebGL context is still
  spent on at most one route at a time.
- **The backdrop is per route — and on L-Earn, per *reader*.** Seven *marketing*
  routes, six canvas components. Landing *and* Contact get the globe (the only
  WebGL one); L-Earn gets the arcade trail (`arcade/`) signed out and the
  platformer (`level/`) signed in, Analytics the node web (`network/`), B2B the
  market tape (`market/`) and Vouchers the drifting stubs (`stubs/`) — all five
  canvas-2D, all on `.site__web`; Relocate keeps CSS rings (`.site__rings`).
  `Site.tsx` renders exactly one, and that is what makes six components
  affordable: the document holds at most one backdrop context at a time, plus
  the controller's on L-Earn. Rendering two at once costs a second context on
  that page; browsers cap how many a document may hold and start dropping the
  oldest. The five 2D backdrops share one construction — props for
  `primaryColor`/`tone`, a config file, nothing per-frame through React state,
  a one-frame still under `prefers-reduced-motion` — so read one before writing
  a sixth. **L-Earn's split is the only one keyed to the session, and it keys off
  `isPlayer`, the same test `<main>` uses** — the backdrop and the page it sits
  behind have to agree about which of the two L-Earns this is.
- **A reused globe still needs its scroll anchor.** `scrollTransition` is off only
  for sign-in, which is one screenful with nothing under it. Any other page that
  takes the globe has content below the fold, and a globe held in the hero pose
  sits *on top of it* — Contact's form was unreadable under a pinned one for
  exactly as long as it took to look. Give the page an anchor at its **third**
  section (`scrollAnchorId` in `Site.tsx`) and let the globe retire into the arc.
- **Each backdrop has to *mean* something, or it is wallpaper.** The globe is a
  border being crossed — which is why Contact keeps it rather than inventing a
  seventh thing; the arcade trail behind L-Earn is the page's own game — gates
  drifting past, a flyer threading the gaps on autopilot (or chasing your
  cursor), a pulse where a gate pays; the node web behind Analytics is the
  customer base being measured (drifting points that link to each other — it
  moved there from L-Earn, where it was "a player base", when L-Earn got its
  own game); the market tape is repeat custom compounding into revenue — a line
  that climbs, and the only thing that moves it is a venue under it firing (on
  its own rhythm, or because your cursor walked past); the stubs behind
  Vouchers are the tickets themselves, notched and tear-lined, settling into a
  wallet; the platformer behind the *signed-in* L-Earn is the page's promise in
  the one grammar nobody has to be taught — a runner breaks blocks, takes a
  power-up out of a lucky box, grows, and leaves down a pipe, which is play, get
  bigger, cash out. They are different pictures on purpose. A new one that is
  "the node web but different particles" is a reason not to add it.

- **The runner is a sprite, and sprites are authored as text.** `level/sprite.ts`
  holds each frame as rows of `.o+#-` on an 18 × 27 grid — the source *is* the
  picture, so you edit it by looking at it, and a frame that stops being
  `COLS × ROWS` throws at module load rather than drawing a quietly lopsided
  figure. It has already caught one. He was a stroked stick figure first and that
  was wrong the way a vector logo is wrong on a games console: everything around
  him is cells on a grid, and the one smooth-curved thing in the frame read as a
  different picture pasted on top. Six things there are not free:
  - **Shading is four colours at one alpha**, never one colour at four alphas.
    Alpha means "brighter" on black and "darker" on paper, so an alpha-built
    highlight inverts in light mode. The four are a *ramp*, not four garments:
    the darkest doubles as every shadow on the figure and the second-lightest as
    every highlight, and that is how the brow shadow, the hi-vis band and the
    belt buckle exist without a fifth colour.
  - **Each frame is stamped into a tiny offscreen canvas and blitted** with
    `imageSmoothingEnabled = false`. Painting the cells straight onto the page
    double-blends every overlap and draws a bright grid over the figure.
  - **The run is eight frames** — contact, down, passing, up, twice over. Two
    frames is a march. Four was the next wrong answer: contact and passing only
    is a run with no vertical in it, so the body travels along a flat line with
    its legs swapping under it. Down and up are what put the bounce in.
  - **The bob is the row count, not an offset.** Each leg block is a different
    height and `pose` pads the top of the frame to `ROWS`, so a shorter block
    settles the whole figure without lifting his feet off the floor — which is
    what a bent knee does. The pad goes at the *top* because `drawRunner` puts
    the last row on the ground and builds upward.
  - **The legs repeat every four frames; only the arms run all eight.** Mirroring
    the legs for the second half is the obvious version and it moonwalks: within
    a step the planted boot walks *backwards* under the body, and a mirror runs
    that sweep forwards on alternate steps. It is also the truer ratio — a stride
    is two steps and an arm goes forward once per stride. The two poses that
    *are* mirror-symmetric, contact and airborne, are drawn symmetric on purpose:
    both are frames the eye rests on, and one column off centre is a lean.
  - **One size of art, drawn at two heights.** The mushroom scales him. Two
    hand-drawn sizes is twice the art to keep in step for a figure fifty pixels
    tall, and "same person, bigger" is what a power-up should read as. The grid's
    2:3 ratio is what makes a resolution change free — `drawRunner` derives the
    cell size from `frame.length` and the width from `COLS`, so he lands on
    screen at the same size and the block-striking peaks in `LEVEL.moves` still
    hold. Changing the *frame count* is not free: `LEVEL.runner.stride` is frames
    per tile and has to scale with it or the cadence moves.
- **The level is scripted, not simulated, and that is not laziness.**
  `LEVEL.moves` is a gapless list of parabolas and the runner's height is a
  lookup into it. There is no gravity, no collision and no fail state, because a
  simulated runner on a backdrop is one who eventually falls in a pit at 3am and
  lies there until somebody reloads the page. Every jump clears every pit
  because the jump *is* the level. The corollary is that the two are authored
  together: a block moved without moving the jump that strikes it is a runner
  sailing through it with nothing happening, and a `peak` is the height of his
  **feet** while what has to reach the block is his **head**. Both of those have
  already been wrong once; `config.ts` says so at the point of use.
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
