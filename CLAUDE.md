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

There is no test runner. `npm run verify` is the test suite — 735 checks: it
exercises the pure maths — atlas parsing, projection round-trips, country
hit-testing, ribbon geometry invariants, route baking determinism, hero/footer
framing across five aspect ratios, and the rotation accumulator over an hour of
simulated frames.
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
and `auth/`, and all styling in the single sheet `site.css`. Two files are named
for the route rather than for the pitch: `business.tsx` is `#/business`, the page
that sells to a venue, and `businessSetup.tsx` is `#/business/setup`, the listing
form. "B2B" is gone from the code as well as from the page: `copy.business` is
the pitch page's dictionary block and `copy.listing` is the setup form's. That
rename had to be done in two steps — `business` → `listing` first, then
`b2b` → `business` — because the name being moved into was the one being moved
out of, and doing it the other way round collides. Exactly two things keep the
old word, and neither is code: the `b2b/` prototype directory and the
`landing/screenshots/admin-b2b*.png` files. Both are reference material, and
renaming reference material to match the thing built from it is how you lose the
ability to check one against the other. The globe is
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
`npm run verify:api` is its test suite — 579 checks, the counterpart of
`npm run verify` — and
it is what checks the rules that are arithmetic rather than rendering — the
points ledger's FIFO ordering, the budget pool's three states, the amount-capture
gate, the energy tank's regeneration clock, the min-cohort suppression, the
consent gate on identified customers. **Run it after touching anything under
`server/domain/`.** (FIFO *ordering*, not expiry: nothing expires, and a spend
still has to come out of something.)

**Energy is the single limiter on a day, and every finished round costs one.**
Win or lose — an abandoned round still costs nothing, because the charge is
written in `games.finish` and nowhere else. It refills one per
`energy_regen_minutes` up to `daily_energy`, so a day is
`daily_energy + 1440 / energy_regen_minutes` rounds from a full tank: free 12
sustained and 16 in a burst, Pro 24/30, Premium 48/58. Three other brakes have
lived here and all three are gone — points expiry, a daily points cap, and a
per-game decay curve that paid a repeat of the same game less. Charging only a
*loss* was the version before this one and it bounded nobody: three of the eight
games cannot be lost. **If a day needs to be smaller, move `CONFIG.points`** —
two overlapping limiters where only one binds is one more than a player can be
told about, and the pair a player can see on the screen is where the rule
belongs. `server/README.md` carries the arithmetic and the two column names
(`life_spent`, `lives_used`) that are historical and stay that way.

Two things a venue owner can now see that they could not: **impressions and
clicks**. `analytics.reach` sums the venue's *listing* events
(`venues.trackListing` → `service_events`) and its *deal* events
(`deals.track` → `deal_events`) into one funnel — seen, clicked, claimed —
behind `GET /v1/partner/venues/:id/reach`. It exists because every other figure
on that dashboard starts at a **visit**, and a venue nobody has heard of and a
venue everybody scrolls past render identically without it: zeroes, with nothing
to say which. Those two have opposite fixes. Three rules travel with it — a
*rate over nothing is 0, never null* (null means "we are not telling you");
`uniqueClickers` is a finding about **people** and takes the min-cohort floor
while the raw counts do not; and neither a visit nor a claim is postable by a
client, because both are what the dashboard argues from.

**The assistant can be given a model, and the model may only rewrite.**
`ports/llm.ts` is wired to the Claude Messages API and is off unless *both*
`PAYLEZ_LLM=live` and `ANTHROPIC_API_KEY` are set — a server-side secret, never
`VITE_`-prefixed, because Vite bakes those into the browser bundle. The model is
handed the facts `domain/assistant.ts` retrieved and the sentence it already
composed, and every figure in what comes back is checked against those facts
before it is used (`onlyKnownNumbers`); a rewrite that introduced a number is
discarded whole and the grounded draft is sent. Timeouts, refusals and errors
all resolve to the same thing: the draft. Called with `fetch` rather than the
SDK on purpose — the zero-dependency rule below is worth more than one request
to one endpoint.

Two things about it are easy to undo by accident and both are checked:

- **The balance is derived, never edited.** `users.points_cache` is written only
  by `domain/ledger.ts` and reconciled against the ledger; a reversal is a
  compensating entry and never a mutation of the row it reverses.
- **A pool has exactly three states and they exhaust it** — spent, set aside,
  available — which is the same rule `partnerMetrics.ts` states on the front end,
  enforced here on the money that actually moves.

**The profile's "Status" is `occupation`, and the column cannot be called
`status`.** `users.status` is the account state — `provisional`, `active`,
`banned`, `erased` — so the field a person picks from five values (`student`,
`worker`, `business`, `freelancer`, `other`) carries the other name everywhere:
the column, the API field and the patch key. The UI label is the dictionary's
job. This repo has already paid once for two things sharing a name — `.dash-*` on
the front end — and a moderation query reading somebody's job is the version of
that bug which is hard to see. It replaced a free-text `headline`, which is
dropped by a version-guarded migration in `db/db.ts` rather than left as a column
nobody writes.

**A city is canonicalised, not restricted, and what is stored is not what was
typed.** `GET /v1/cities` is a suggestion source now; `resolveCity` folds a match
onto the table's own spelling and country (ignoring any `countryCode` the client
sent) and folds anything else to a title-cased ASCII form that needs a country
with it. The reason is one query: the city weekly board groups on `users.city`
with a literal `=`, so free text does not make a messy board, it makes one board
per spelling with one player on each. `server/README.md` carries both costs — a
mis-filed `Halle`, and `Saint-Étienne` stored as `Saint Etienne`.

Two of the four question banks do not come from `new-data/`. The capitals and
flags banks are derived from the `CountryCapital` export; **the general and
Poland banks are the hand-delivered CSVs in `updates/`**, the same files
`npm run banks` reads for the front end, and `db/import.ts` reads that directory
as a second source. They were missing for a while and the symptom is worth
recognising: `POST /v1/games/sessions {gameType:"brain"}` returns a 404 saying
"no questions in the brain bank", and two of the eight games are unplayable
while every other endpoint looks fine. The import reports it in its notes when
the files are not there rather than importing nothing quietly.

The React site still runs on `localStorage` (`src/site/auth/`, which says so at
the top of `users.ts`). Wiring it to this backend is a client module, not a
redesign: the API returns the fields `PlayerState` and `BusinessProfile` already
use. Until somebody does, the two halves are independent and both are correct on
their own terms.

**The Flutter app is the one client that does talk to it.** It lives in the
`Pay-lez mobile` repo beside this one and is wired end to end — the four-step
gate from both sides, all eight games on the server's move-by-move protocol, the
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
pounds; `#/business` ships its whole feature set — the owner dashboard, portal,
Play & Earn placement, campaign tooling, the rollout steps, the three pricing
tiers — in five languages, each of which prices the page in its own currency
(see the money rule under Conventions). So the prototype's pounds are not
discarded, they are what an English reader sees.

## Conventions

**Two colours, everywhere.** One accent on one ground — `#58e9d4` on `#0d0d0e`
in dark, a cyan on near-white in light. Don't introduce a third hue; derive
tints from the accent with alpha the way `--surface` / `--border` do.

There are exactly four sanctioned exceptions, and all four are cases where the
thing depicted *is* its colours: flag emoji; the controller's four face buttons
on the light page (`BUTTON_COLORS` in `controller/Controller3D.tsx`); the
platformer behind L-Earn (`LEVEL.palette` in `level/config.ts`);
and the Google "G" on the sign-in button (`GoogleMark` in `auth/GoogleButton.tsx`).

The G is the narrowest of the four and the easiest to argue with, so: Google's
brand terms forbid altering the mark, which makes recolouring it not a design
choice we are declining to make but one that is not ours. It is 1.15em of SVG
inside a control that is otherwise entirely `--solid`, `--border` and `--text`,
and it appears on exactly one screen. It arrived when Google's *rendered* button
was replaced — that button picked its own shape and wording and could not be
made to match the page, so the flow moved to `requestGoogleCode` and the button
became ours. Everything about it except those four fills is a token.

The controller is worth the words: on black it is a dark moulding lit by the
accent, which is the whole look. On paper that same accent became a colour cast
on pale grey plastic — a photo with the white balance wrong — so light mode
lights it with white and puts the colour where a gamepad actually keeps it.

The level is worth more of them, because it is the largest of the three. It
draws a brick, a lucky box (and a spent one), a mushroom and a pipe, and a
backdrop has no labels — so on one accent they are five identical rectangles and
the thing stops being a level at all. The hues are the Play mock's own
(`b2b/Paylez Play.dc.html`), which spends them on exactly the same problem one
layer up. Three constraints keep it from leaking: the **ground** is drawn in
`primaryColor`; the **runner** is drawn in it too, at four lightnesses, because
he is the product moving through the level rather than part of the scenery; and
the `ink` row is those same hues taken down to where they read on paper —
it is **not** a second accent ramp and nothing in `site.css` may reach for it.
The exception is the *set*, not the cast.

Do not read any of the three as licence for a fourth hue. In particular, when a
design hands you a colour per item and you are *not* depicting an object, reach
for texture instead — see the `[data-texture]` note below.

**When a design hands you a hue per item, reach for texture — unless the item is
an object.** Two mocks do it. The wallet mock gives each band its own colour and
`[data-texture]` on `.wal-band` answers it: a repeating pattern per band in
`--accent-rgb` at three to five percent, so the bands read as different objects
with one accent on the page. The alphas are the whole difficulty and they are
set by the worst case — a texture crisp enough to admire on an empty card is
noise under the body copy every card carries.

The Play mock (`b2b/Paylez Play.dc.html`) does the same thing for the game cards
and is **no longer answered this way**, which is worth knowing before reaching
for the pattern a third time. The cards carried textures and it worked: eight
tiles stopped looking like one tile eight times. It answered only half the
question, though — a texture tells cards apart and says nothing about the games,
which is a lot of a card's surface to spend on making the choices
distinguishable rather than on the choice.

**A hovered card plays a working miniature of its own round instead**
(`games/preview.tsx` and `══ game previews ══` in `site.css`). Three rules keep
it honest, and they are the whole reason it is worth more than the texture was:

- **It is the game, not a picture of one.** Memory Match turns real cards off
  the Kraków deck in `games/data/decks.json`; Word Builder builds a real word
  out of its own shuffled letters; the flag is `flagOf('PL')`; Squawk is the
  *actual* sprite, the same `PARROT_PARTS` table the flight canvas draws from,
  read into SVG rects. The shapes it replaced — bars for answers, a striped
  rectangle for a flag — were a second decoration wearing the game's clothes.
- **It copies the game's own states.** The answer chips are `.round-option`'s
  pair, right filled and wrong struck through; the memory cards are
  `.mm-card`'s three faces and, like the real board, they **do not flip**.
  Inventing motion the game does not have is the same mistake one step subtler.
- **The content is real and it is fixed.** `PREVIEW` in `content.ts` and
  `copy.games.preview` hold it, because a hover must not fetch a 220 kB question
  bank and a preview that dealt a new question every time would be a slot
  machine where an example is wanted. `npm run verify` reads the real data files
  and checks the samples are still in them, so "real content" cannot quietly
  stop being true.

Where a decoration could be carrying information, prefer the information.

Neither is the rule for the level behind those cards, where a brick and a lucky
box are different things rather than differently-decorated ones and no label
exists to tell them apart. Deciding which of the three you have is the whole
judgement.

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

**A press is the accent; the dashboard is the exception.** `--solid` is
`--accent` in both themes — mint on black, `#089b99` with a white label on paper
— and the near-black press the reference design uses survives in exactly one
place, `.pd-app`. That screen is a wall of white cards with no backdrop of its
own, which is the argument the black was made for; every other page has a live
canvas and a mint headline for a button to belong to. The note on `--solid` in
`src/site/CLAUDE.md` carries the contrast this costs and why it is taken.

**Constants live in config files, not inline.** Every tunable for the globe is
in `GlobeHero/config.ts`; the intro's timings are in `PaylezIntro/config.ts`;
the node web's density, link radius and alphas are in `site/network/config.ts`;
the candle tape's scroll speed, band, wick spread, tick size and venue density are in
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
individual has no Business, Analytics, dashboard or setup; an owner with no listing
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
marketing front page; the same was true of `#business-cta`, `#learn-games`,
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

**The wallet holds three things, and they are three because their rules
differ.** A *hot deal* is one venue running one offer for a window, and claiming
it is usually free — the venue is paying. A *gift card* is stock: a fixed face
value at a named brand, bought with points off a catalogue with a monthly
allocation. A *stamp card* counts **visits to one venue**, and a visit is not a
point — it cannot be spent anywhere else, and a full card **rolls over into the
next one** rather than overflowing, which is why `cycles` exists. The model is
the Flutter app's (`lib/screens/wallet_screen.dart`) and the arithmetic is pure
functions in `auth/player.ts`, so `npm run verify` owns it.

**The wallet page is a board and then a wallet, and a deal is in exactly one of
them.** What is on offer is at the top — the hot deals and the stamp cards,
under one strip of category chips (`DEAL_CATEGORIES`, the app's own six less the
"All" that is the absence of a filter rather than something a venue can be) —
because that is what somebody opens the page to decide from before going out.
What has already been taken is below it: the claimed deals with their codes,
then the gift cards. The split is **derived** (`openDeals`) rather than tracked,
so the two lists cannot drift, and `npm run verify` checks that they exhaust the
board between them. That replaced a two-column layout which put the deals and
the stamp cards side by side and mixed claimed offers in among the unclaimed;
the columns were a good answer to "what have I got, and where am I nearly
there", and what they could not do is separate an offer from a holding.

The card is the app's (`lib/screens/deals_screen.dart`, `_DealCard`) with the
venue's own facts brought forward from the venue sheet the web has no room for —
and the pill says **Open now** on the *venue's* clock, not the reader's, which is
what `VenueFacts.zone` is for and the only place in the front end that reaches
for `Intl`. The one slot the app has and this does not is the distance: nothing
here has a position fix either, and a seeded "1.2 km away" would be the one
thing on the card that is about the reader rather than about the venue.

**Claiming is the one thing on that page that is animated, and the animation is
load-bearing.** The phone's button *navigates* — it arms the gate and drops you
on the Scan tab — so the app celebrates nothing. Nothing navigates here, and a
card that simply vanished from the list would fail to say that the press worked,
that the offer is now yours, and that it has moved. So the card is held on the
board for `CLAIM_HOLD_MS` while a ring goes out, a sheen crosses the plate and
the code lands where the button was, and only then does `openDeals` move it
down. Every curve is the app's own kit rather than invented here. Under
`prefers-reduced-motion` the **hold goes with the motion**: the deal appears
below immediately rather than leaving a second of nothing on a still card.

**A signed-in individual gets a different page, not a different section.**
`useIsPlayer()` swaps L-Earn and Vouchers wholesale: `learn.tsx` → `games.tsx`,
`vouchers.tsx` → `wallet.tsx`. The marketing pages are untouched and still serve
everyone else, including business owners — those pages describe the *customer's*
experience, which an owner is reading about rather than living. The rules that
decide points, streak, energy and the wallet are pure functions in
`auth/player.ts`, so `npm run verify` owns them; the components only call them.

**The order of `GAMES` is the layout of the Play screen.** `GAMES[0]` is the
full-width poster L-Earn opens with and everything after it fills the grid two
to a row, so moving a row moves a card and there is no second ordering to keep
in step. Nothing sorts the list at render and nothing is per-player: a grid that
reshuffled itself by what you had played would move the card you were reaching
for. **Every card is a `<button>`**, which is what lets a hover take the
description and the Play label away — there is nothing left to aim at, because
the card is the target. That is also why **Word Builder is two rows rather than
one row with a picker**: `word` always deals English and `wordLocal` deals the
language of the city on the profile (`wordListFor` in `games/banks.ts`), and
practising English and practising the language you have moved to are the two
things this product is for rather than one game played two ways.

**One function decides what a finished round does to the account.**
`awardPoints` owns the streak, the 24-hour window, the lapse, and the freeze that
absorbs one missed day. Eight games score seven different ways — a quiz pays per
right answer plus a sweep bonus and a band off the round's own clock, a flight
pays half a point per gap past an endless target, Word Builder pays each word its
tier and halves any word a hint was spent on, Memory Match reads its elapsed
seconds into one of three bands — and **none of them restates what a streak is.**
They compute a number and hand it over. There were two copies of that rule once
and it would be five by now.

**Nothing that can be lost, is.** Only the flight has a fail state, and what ends
it is a crash rather than a tally. The quizzes' mistake allowance is gone — a
round runs to the fifth question however many go wrong — so `won` on a quiz means
the **clean sweep** and nothing else, which is the only distinction left worth
drawing and the one the bonuses are paid on. Do not reintroduce a mistake limit
to make a game harder: it does not make it harder, it makes it shorter, and what
it takes away is the questions the player paid energy to see.

**Halves exist now, and they are floored once.** A gap is worth 0.5 and a hinted
word is worth half its tier, so a round can hold an odd number of halves. Every
such round floors at the end and only at the end (`flightPoints`,
`wordRoundPoints`) — flooring per item charges the same hint twice, and rounding
up pays for a gap that was not flown.

**The streak is drawn as seven days, and the week is derived rather than
stored.** `streakWeek` in `auth/player.ts` reads the run back off
`streak` + `lastPlayed` — a streak of five ending Thursday already *says*
"Sunday through Thursday" — because a second history beside the number would
disagree with it the first time either was written without the other, and the
number is printed next to the circles. A live streak whose `lastPlayed` is
`null` reads as ending **yesterday**, because that is the branch `awardPoints`
already gives it — a state stored directories still carry and the app itself
cannot produce. A day the streak counts shows the
**currency mark of wherever the player lives** (`fxForCountry`, off the
profile's country, not off the language switcher), because the argument a streak
makes is that turning up is worth money and a row of ticks makes it to nobody. A
country the rate sheet does not carry falls back to `$`. A day that has not
happened yet is `ahead` and must not be drawn as missed.

**A lapse takes the streak and nothing else.** It used to take the balance with
it — the old app's own hot-deal terms say so — and the server does not do that
either: points never expire, and there is no ledger reason for a negative entry
that looks like a wipe. Bringing one back is a product decision, not a tidy-up.

**Energy is what bounds a day, and it is not called lives.** `MAX_ENERGY` and
`ENERGY_REGEN_MINUTES` mirror the server's *free-plan* figures (`CONFIG.points`):
four in the tank, one back every two hours — twelve rounds a day sustained and
sixteen from a full start. The free plan is the only one this site can resolve, because
it sells no subscription it could read a bigger tank off. `energyOf` derives the
tank from `energy` + `energyAt` on demand rather than storing a count that would
be stale the moment the tab was left open — the same construction
`games.energyFor` uses one repo over, for the same reason. Every finished round
costs one, win or lose; `spendEnergy` is the only spend, so an abandoned round
costs nothing. A state saved under the old `lives` / `livesAt` names still reads,
and a missing anchor reads as a full tank.

The gauge that draws it is a **battery** — four blocks in a case with a terminal
on the end, the block being earned filling live against the real clock in CSS,
and the wait written beside the count as `+1 in 1h 12m` (`untilNextEnergy`,
which takes its units from `Intl` and its frame from `copy.games.energyNext`).
The two states have their own motion and it is the difference between them that
matters: a spark **crosses** the case while charge is going in, and a full tank
**arcs off every edge** instead — twelve bolts drawn as stroked polylines
(`BatteryLightning` in `games.tsx`), each struck by pulling a `stroke-dashoffset`
to zero in a fiftieth of a second. A filled shape can only *appear*, which is
what an icon does; a stroke can be drawn, which is what lightning does. Their
cycles are deliberately co-prime, so the set does not come back into phase and
the striking reads as spontaneous without a single random number. A full battery was the one reading
on that panel with no motion at all, which is backwards — it is the state a
player most wants to recognise without reading, because it is the one where every
button on the page works. A row of pips has to be counted; a
battery is read, and the reading that matters is whether there is an evening's
play left. The blocks are discrete because the quantity is: a round costs a whole
one, and a bar three-quarters full would be promising a round that is not there.

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
family to the Business page's dashboard mock — which silently crushed the
dashboard's user pill to 26px. The app screens are prefixed `play-` (games), `wal-` (wallet), `pd-`
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
- **Eight screens, and two of them belong to the frame.** The rail lists the
  prototype's eight — the six report screens, the profile form, and **the
  assistant** (`dashboardAssistant.tsx`), which is the largest single thing in
  that file and the only screen that talks: a conversation, a draft it defends
  line by line, the deal text in all five languages, three named ways out, and
  four endings that are not a draft at all (an answer, a review, a hand-over to
  the form, a plain "I cannot do that"). The endings are the design — an
  assistant that only ever succeeds is a demo. The **create drawer** and the
  **confirmation strip** (`dashboardDrawer.tsx`) sit on the frame rather than on
  any screen, because six places open the drawer and every one of them is the
  same panel; both are reached through `DashboardContext` (`dashboardShell.ts`)
  rather than threaded as props through eight screens.
- **Nothing on this dashboard writes anything, and every control that looks like
  it does says so.** There is no server behind `#/dashboard`, so publishing a
  deal, cancelling a notification or exporting a CSV raises the strip with
  `copy.dashboard.notWired` instead of pretending. Two corollaries. Money
  *inputs* — the drawer's, the assistant's claim ceiling — hold the **reader's
  currency**, not euros: the site stores euros and converts on the way out, which
  is right for a figure being shown and wrong for one being typed, so they divide
  by the rate once at the point a sentence needs euros back. And a figure the
  screen cannot honestly make editable is shown as a **fact rather than a field**
  — the voucher pool's three inputs are the note that states this, and the
  Campaigns allocation follows it.
- **The assistant reads numbers; it does not invent them.** Every figure in every
  sentence it says arrives through a `fill()` hole from `partnerMetrics.ts` — the
  quiet hours, the peer comparison, the notification quota, both budget pools,
  the tier that moved, the count of customers who came twice. That is exactly
  what its own composer note promises the owner, and a number typed into a
  dictionary string breaks the promise silently. Its language tabs are the one
  table in the building that is deliberately **not** dictionary copy
  (`PD_ASSIST_COPY`): the point of the panel is that an owner reading in Polish
  sees what a Russian-speaking customer will read, so the set is fixed and
  `npm run verify` checks it covers `LANGUAGE_ORDER`.
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
- **The globe belongs to the landing page, and to nothing else now.** Relocate
  had it on the argument that the page was about a border being crossed; it is
  not — it is a guide to where you have already arrived, plus a currency
  converter, and it takes `.site__rings`, CSS contour rings that mean distance
  from where you are standing. Contact had it next, on the better argument that
  "reachable from anywhere" is the one other thing the globe honestly says — and
  lost it when the page became a single screen. A fixed backdrop needs a page
  long enough to scroll it out of the hero pose; a one-section form is not one,
  and a pinned globe sits straight on top of it. The document's single WebGL
  context is spent on at most one route at a time.
- **The backdrop is per route, and one route per backdrop.** Landing gets the
  globe (the only WebGL one); L-Earn gets the platformer (`level/`), Analytics
  the node web (`network/`), Business the candle tape (`market/`) and Vouchers
  the drifting stubs (`stubs/`) — all four canvas-2D, all on `.site__web`;
  Relocate keeps CSS rings (`.site__rings`), and Contact, Privacy and Terms have
  none at all. `Site.tsx` renders exactly one, and that is what makes five
  components affordable: the document holds at most one backdrop context at a
  time, plus the controller's on L-Earn. Rendering two at once costs a second
  context on that page; browsers cap how many a document may hold and start
  dropping the oldest. The four 2D backdrops share one construction — props for
  `primaryColor`/`tone`, a config file, nothing per-frame through React state,
  a one-frame still under `prefers-reduced-motion` — so read one before writing
  a fifth. **L-Earn's used to be keyed to the session** — the arcade trail signed
  out, the platformer signed in — and is not any more: the platformer is the
  page's promise in the one grammar nobody has to be taught, which is *more*
  use to a visitor who has not signed up than to a player who has. The arcade
  trail went with the split.
- **A reused globe still needs its scroll anchor.** `scrollTransition` is off only
  for sign-in, which is one screenful with nothing under it. Any other page that
  takes the globe has content below the fold, and a globe held in the hero pose
  sits *on top of it* — Contact's form was unreadable under a pinned one for
  exactly as long as it took to look. Give the page an anchor at its **third**
  section (`scrollAnchorId` in `Site.tsx`) and let the globe retire into the arc.
- **Each backdrop has to *mean* something, or it is wallpaper.** The globe is a
  border being crossed; the node web behind Analytics is the customer base being
  measured (drifting points that link to each other — it moved there from L-Earn,
  where it was "a player base", when L-Earn got its own game); the candle tape
  behind Business is repeat custom compounding into revenue — a market printing
  candle by candle, and the only thing that moves it is a venue under it firing
  (on its own rhythm, or because your cursor walked past); the stubs behind
  Vouchers are the tickets themselves, notched and tear-lined, settling into a
  wallet; the platformer behind L-Earn is the page's promise in the one grammar
  nobody has to be taught — a runner breaks blocks, takes a power-up out of a
  lucky box, grows, and leaves down a pipe, which is play, get bigger, cash out.
  They are different pictures on purpose. A new one that is "the node web but
  different particles" is a reason not to add it.

  **A candle says direction with a fill, not a hue.** Green and red are not
  available here, so an up candle is solid and a down candle is hollow — the
  convention a chart printed in one ink has always used, and still the fastest
  tell on the screen. Reaching for a second colour there is the same mistake as
  reaching for one on the game cards; see the `[data-texture]` rule above.

- **The runner is a sprite, and sprites are authored as text.** `level/sprite.ts`
  holds each frame as rows of `.o+#-` on an 18 × 27 grid — the source *is* the
  picture, so you edit it by looking at it, and a frame that stops being
  `COLS × ROWS` throws at module load rather than drawing a quietly lopsided
  figure. It has already caught one. He was a stroked stick figure first and that
  was wrong the way a vector logo is wrong on a games console: everything around
  him is cells on a grid, and the one smooth-curved thing in the frame read as a
  different picture pasted on top. Eight things there are not free:
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
  - **The eight are not equal lengths, and the jump is not one frame.**
    `LEVEL.runner.beats` holds each frame for a share of the cycle — stance
    (contact, down) roughly twice as long as flight (passing, up) — and must have
    one entry per frame summing to the frame count, checked at load, or `stride`
    stops meaning frames per tile. Dividing a gait evenly is a metronome. The
    jump is `JUMP.rise` / `apex` / `fall`, picked off the arc's vertical velocity
    rather than off `t`, because the moves that land higher than they leave are
    still climbing at the end.
  - **The bob is the row count, not an offset.** Each leg block is a different
    height and `pose` pads the top of the frame to `ROWS`, so a shorter block
    settles the whole figure without lifting his feet off the floor — which is
    what a bent knee does. The pad goes at the *top* because `drawRunner` puts
    the last row on the ground and builds upward. The head bobs the same way and
    for the same reason: `HEAD_SUNK` is the same ten rows with the *neck* blanked
    instead of the crown, so the skull drops a cell on contact without changing
    the frame's height.
  - **The lean and the twist are whole-cell slides, never a rotation.** The head
    is authored one column forward of the hips (that is the lean) and everything
    above the pelvis slides ±1 with the arm crossing the chest (that is the
    twist); the pelvis and the legs never move, because they carry the planted
    boot. A canvas rotate would resample the grid past
    `imageSmoothingEnabled = false` and stop this being pixel art. `slide` throws
    rather than clipping a cell off the edge.
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
    per tile and has to scale with it or the cadence moves, and `beats` needs one
    entry per frame.
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
  funnel and week chart, and the Business page's owner dashboard and pillar
  consoles, are divs with a custom property for their size, animated with `transform` off the shared `[data-shown]` reveal.
  That is deliberate: they inherit the theme tokens, they translate into five
  languages, they price themselves in the reader's currency, and they cost no
  context — none of which a screenshot does. `data-count` on the figures rounds to
  whole numbers, so anything wanting a decimal place needs the hook changed first;
  it also takes `data-prefix`, `data-suffix` and `data-group`, which is how a
  money figure gets its symbol on the correct side and its digits separated.
- **`#/business` is the only page that sells to a business,** which is why it
  carries a pricing table and a `mailto:` to `SALES_EMAIL` rather than the app
  CTAs. Its venues are Polish — the market the rest of the site is in — while the
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
