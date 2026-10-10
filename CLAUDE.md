# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

**Paylez**, in two programs that share a repository and no code.

`src/` is the web front end: a hash-routed single-page React site with fifteen
routes (`PATHS` in `router.ts`) covering the marketing pages, the signed-in
player screens, the partner dashboard and the operator's console. It began as a
landing page for `GlobeHero` — a procedural two-colour globe with no textures,
models or image assets, built on Three.js / React Three Fiber — and that globe
is still the landing route's backdrop and still the largest single component
here, but it is now one route's backdrop out of several rather than the thing
the site is built on.

`server/` is the backend the front end and the Flutter app both talk to:
`node:http` and `node:crypto`, run straight from TypeScript by Node 22, with
**one** runtime dependency — `pg`, because production is Supabase Postgres now
and Postgres speaks a binary protocol `fetch` cannot. It still runs on SQLite
when no Postgres is configured, which is what keeps a checkout runnable and the
test suite offline.

Three files document their own halves in depth and this one covers the repo as
a whole:

- **`README.md`** — the globe: props, the maths behind the scroll transition,
  the responsive framing formulas, the performance budget. **Read it before
  changing anything in `src/components/GlobeHero/`.**
- **`server/README.md`** — the backend's rules, which are arithmetic rather
  than rendering. **Read it before changing anything under `server/`.**
- **`src/site/CLAUDE.md`** — the palette at token level. **Read it before
  touching a colour.**

How either half reaches the VPS is **`DEPLOY.md`** — pushing to `main` deploys
nothing.

Most of the detailed notes live in **`.claude/rules/`**, one file per area, and
each loads only when you work on files matching its `paths:` — read the one for
the area you are in before changing it:

- `server.md` — The backend (`server/`)
- `assistant.md` — The assistant: the Claude tool loop, its fallback, and the dock
- `auth-routing.md` — Sign-in, the session mirror, routing and the head
- `games.md` — L-Earn and the Play screen
- `wallet.md` — The wallet
- `css.md` — The stylesheet, responsive rules and controls
- `i18n-money.md` — Legal texts, currency and exchange rates
- `relocate.md` — Relocate and the guide directory
- `dashboard.md` — The partner dashboard (`#/dashboard`)
- `admin.md` — The operator console (`#/admin`)
- `backdrops.md` — The globe and the route backdrops
- `intro.md` — The cold-open (`PaylezIntro`)
- `level.md` — The L-Earn platformer (`level/`)


## Commands

There is no test runner. `npm run verify` is the test suite: it
exercises the pure maths — atlas parsing, projection round-trips, country
hit-testing, ribbon geometry invariants, route baking determinism, hero/footer
framing across five aspect ratios, the rotation accumulator over an hour of
simulated frames, and the two URL tables against the committed sitemap.
**Run it after touching anything under `geo/`, `config.ts`, the rotation and
layout hooks, or `router.ts`.** Run `npm run build` for a type check (`tsc -b` is part of it).

`npm run assets` copies the Twemoji flag font out of `node_modules` into
`public/fonts/`. `dev` and `build` both run it, so it rarely needs invoking
directly — but a fresh clone has no `public/fonts/` until one of them runs.

Three generators are deliberately **not** part of `dev` or `build` — their
output is committed, so run them by hand and commit what they write:

- **`npm run banks`** regenerates `src/site/games/data/` from the exports in
  `updates/`. Run it when a new export lands.
- **`npm run sitemap`** regenerates `public/sitemap.xml` and `public/robots.txt`
  from `URL_PATHS` in `router.ts`. Run it after adding, removing or renaming a
  route; `npm run verify` fails if the committed URL set disagrees.
- **`npm run legal`** regenerates `src/site/legal/export/<lang>.json` (the texts
  the Flutter app reproduces word for word) from `legal/<lang>.tsx`. It **throws
  on any element it does not recognise** — teach it about a new tag in
  `parts.tsx` rather than working around the throw.

`npm run server` starts the backend, and `npm run verify:api` is *its* test
suite — a second one, because it checks a different kind of thing (see
`server/README.md`). `tsc -b` type-checks four projects, split by what they
target rather than by taste: `tsconfig.app.json` covers `src/` (a browser),
`tsconfig.server.json` covers `server/` (Node 22 running TypeScript directly),
and `tsconfig.node.json` and `tsconfig.scripts.json` cover the build config and
the generators in `scripts/`. `npm run openapi` regenerates
`server/openapi.json` from the live route table — run it after adding or
changing an endpoint and commit what it writes. `npm run server:import`
re-reads the old database in `new-data/` and exits.

Four scripts belong to Postgres and Stripe, and three of them write to services
outside this repo:

- **`npm run pg:schema`** regenerates `server/db/schema.pg.sql` and
  `server/db/conflicts.ts` from `schema.sql`. **Never edit either output.** Run
  it after any schema change and commit what it writes.
- **`npm run pg:migrate -- --from <file.db>`** copies a SQLite database into
  Postgres, once. It refuses a target that already has rows, and re-reads both
  sides at the end rather than trusting the count it kept while inserting.
- **`npm run pg:backup -- --to <file.db>`** is the reverse, and is what the
  VPS's nightly timer runs. What it writes is a **bootable database**, not a
  dump: recovery is `cp` it into place, comment out `PAYLEZ_PG_URL`, restart.
- **`npm run stripe:setup`** creates the products and prices in the Stripe
  account the current key points at, from `plans` and `plan_terms`. Safe to
  re-run — a mapped price is skipped, not duplicated — and it refuses a
  `sk_live_` key without `--live`.

**`npm run dev` reads `.env.development.local`, and that file is why sign-up
works locally.** `.env.local` holds the **production** values and loads in every
mode; without the dev override the site talks to `api.pay-lez.com`, fails CORS,
and silently drops to the offline path (no token, empty wallet, local-only
accounts). The dev file must repeat `VITE_GOOGLE_CLIENT_ID`, or the Google
button disappears. Both files are gitignored, so a fresh clone has neither.

## Layout

The site is `src/site/` — one file per route, plus `games/`, `i18n/`, `theme/`
and `auth/`, and all styling in the single sheet `site.css`. Two files are named
for the route rather than for the pitch: `business.tsx` is `#/business`, the page
that sells to a venue, and `businessSetup.tsx` is `#/business/setup`, the listing
form; `copy.business` is the pitch page's dictionary block and `copy.listing`
the setup form's. "B2B" survives only in the `b2b/` reference directory — don't
rename reference material to match the code. The globe is
`src/components/GlobeHero/` — see `README.md`. `landing/` and `b2b/` are design
prototypes, not code. `updates/` is inbound material — exports and specs handed
over to be built from, read by `npm run banks`; nothing in `src/` imports it.

`server/` is the backend, built from the two statements of work in `new-data/`
and seeded from the Base44 export beside them. It shares nothing with `src/` —
no imports either way — and is documented in `server/README.md`; read that
before changing anything under it.

### `landing/` and `b2b/` are reference material

The `.html`, `.css` and `.jsx` files in `landing/`, and the `.dc.html` mocks and
screenshots in `b2b/`, are the original Paylez design prototypes. **Nothing in
`src/` imports them and Vite does not build them.** They exist so the React
rebuild can be checked against the source design. Don't edit them to change the
live site, and don't wire them into the build.

**`b2b/Feedbacks.docx` is not a prototype — it is the review list**, 28 numbered
notes with a screenshot under most of them, and it is what the recent run of work
was built from. Read it before assuming a screen is wrong: several notes are
questions rather than defects, and a few name a screen the note above them is
actually about. Extract it with `word/document.xml` out of the zip; the images
are `word/media/` in paragraph order, which is how a note is matched to the
screen it is complaining about.

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

The sanctioned exceptions are all cases where the thing depicted *is* its
colours, and they are a closed list: flag emoji; the controller's four face
buttons on the light page (`BUTTON_COLORS` in `controller/Controller3D.tsx`);
the platformer behind L-Earn (`LEVEL.palette` in `level/config.ts`); the Google
"G" on the sign-in button (`GoogleMark` in `auth/GoogleButton.tsx`); Pico, the
mascot parrot the games share (`PICO_BRAND` in `pico/palette.ts`); and the
games' stage scenes, below.

The G's colours are Google's brand terms, not our choice; everything around it
is tokens. In the level, the ground and the runner stay in `primaryColor`, and
the `ink` row is **not** a second accent ramp — nothing in `site.css` may reach
for it. Pico's teal, bill and crest are the app's mascot carried over value for
value, and `pico/palette.ts` is the only file that names them; a one-colour Pico
is `picoMono(tint)`, never a shade picked by hand. None of these is licence for
a hue that is not on the list.

**A game's stage may carry its own scene palette when the stage is a picture of
a place** — the level's argument again: a bakery, a harbour or a beach painted
in one accent is a diagram of a place, not a place. Each game keeps its palette
in **one** TS config, keyed by theme (or by the theme's tone, `glow` / `ink`):
`flight/scene.ts`, and under `games/` — `stage/config.ts` (`STAGE_PALETTE`, the
four quiz sets), `cannon/look.ts`, and `config.ts` in `word/`, `memory/`,
`bakery/`, `stall/`, `flock/`, `jump/`, `ball/`, `picuma/` and `ninja/`. What
keeps it on brand:

- It harmonises with the teal and Pico's range, and **spends the brand accent on
  what means points** — so the accent still answers "where do I score?".
- It is **never named in `site.css`.** DOM that needs a scene colour gets it as an
  inline custom property set from the config (`--fs-*`, `--wb-*`, `--mm-*` …),
  so the sheet's no-literal rule holds.
- Foods and other objects that *are* their colours **keep a silhouette each**, so
  colour is never the only cue (Picuma's balls are marks first).

The partner dashboard is the other kind of exception — a second palette for a
whole screen rather than a thing depicted: light mode is the v3 mock's palette,
scoped to `.pd-app` and spent only through the `--dx-*` tokens in
`dashboard.css` (see `.claude/rules/dashboard.md`).

**When a design hands you a hue per item, reach for texture — unless the item is
an object.** Two mocks do it. The wallet mock gives each band its own colour and
`[data-texture]` on `.wal-band` answers it: a repeating pattern per band in
`--accent-rgb` at three to five percent, so the bands read as different objects
with one accent on the page. The alphas are the whole difficulty and they are
set by the worst case — a texture crisp enough to admire on an empty card is
noise under the body copy every card carries.

The game cards are **not** answered this way any more: a hovered card plays a
working miniature of its own round (see `.claude/rules/games.md`). Where a
decoration could be carrying information, prefer the information.

**The brand is the word, and the word is `900 21px/1 Onest`.** That is the app's
own declaration, carried over exactly: `--font-brand` / `--brand-size` in
`site.css`, and `.brand` is the class every one of them uses — header, footer,
dashboard rail and admin console. The intro is the one surface that does not,
and cannot: it draws the word into a canvas, where a custom property is
invisible, so `FACE` in `PaylezIntro.tsx` restates the same family and fallbacks
the way `THEMES` restates the palette. Those two are the only copies.
There is **no tile beside it**.
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
place, the dashboard's light `--dx-press-*` tokens. That screen is a wall of white cards with no backdrop of its
own, which is the argument the black was made for; every other page has a live
canvas and a mint headline for a button to belong to. The note on `--solid` in
`src/site/CLAUDE.md` carries the contrast this costs and why it is taken.

**Constants live in config files, not inline.** Every tunable for the globe is
in `GlobeHero/config.ts`; the intro's whole sequence is in
`PaylezIntro/config.ts`;
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
`LANGUAGES` in `i18n/context.ts`, and write its legal module (below). The
provider's runtime guard is derived from `LANGUAGE_ORDER` precisely so it cannot
be forgotten. Give it a currency in `i18n/currency.ts` at the same time; there is
no fallback, and a missing entry is a type error rather than a page that quietly
prices in euros. Every one of those three is a *type* error rather than a
discovery in production — `LANGUAGES`, `CURRENCIES` and `LOADERS` are all keyed
by `LanguageCode`, so widening that type is what fails the build until they are
filled in.

**There are three kinds of person, and only two of them are choosable.**
`admin` sits beside `individual` and `business` in `AccountType` rather than
being a flag on one of them: it has no venue, no wallet and no marketing funnel,
it has `#/admin`. Sign-up cannot produce one — `ChoosableType` excludes it at the
type level, so the form that offers the choice *cannot* offer that one.

**And nothing is seeded** — no accounts (`SEED_USERS` in `auth/users.ts` is
empty; `RETIRED_IDS` in `directory.ts` sweeps old seeds off devices), and on the
server no venues, offers or gift cards on any boot, not even behind a flag. Only
product configuration is seeded: plans, category defaults, the word bank.
`bootOrdering` in `server/verify.ts` is the guard. A seeded row is immortal —
delete it and the next restart writes it back — and an empty catalogue is a true
state with its own empty-state copy. **Do not helpfully seed any of it back.**

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

- **`index.html` is served with no `Cache-Control`.** A deploy therefore looks
  like it did nothing until the browser revalidates — the page keeps loading the
  *previous* bundle while `curl` shows the new one. **Hard-refresh before
  judging a deploy, and tell whoever asked to do the same.** The durable fix is
  a `location = /index.html` block with `add_header Cache-Control "no-cache";`
  in the nginx site config, which is not applied.
- **`#/business` is the only page that sells to a business,** which is why it
  carries a pricing table and a `mailto:` to `SALES_EMAIL` rather than the app
  CTAs. Its venues are Polish — the market the rest of the site is in — while the
  prices follow the reader's language, so an English visitor sees Kraków sites
  quoted in pounds. That is the intended split: the operator is where the
  operator is, and the currency is whoever is reading. The original prototype in
  `b2b/` is a UK pitch throughout; it is reference material like `landing/`, not
  the source of truth.
- The theme is resolved twice: by an inline script in `index.html` before first
  paint, and by `ThemeProvider` once React mounts. Both read the same
  `paylez-theme` localStorage key — change one and you must change the other, or
  light-theme visitors get a black flash on load.
- `dist/` and `node_modules/` are gitignored; `public/fonts/` is generated but
  committed.
