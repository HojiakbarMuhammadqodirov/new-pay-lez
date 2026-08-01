# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

The **Paylez** landing page: a single-page React site rendered on top of
`GlobeHero`, a procedural two-colour globe (no textures, no models, no image
assets) built with Three.js / React Three Fiber.

React 19 · Vite 8 · TypeScript 6 · Three.js 0.185 · oxlint.

`README.md` documents the globe component in depth — props, the maths behind
the scroll transition, the responsive framing formulas, and the performance
budget. **Read it before changing anything in `src/components/GlobeHero/`.**
This file covers the repo as a whole.

## Commands

```bash
npm install
npm run dev       # copies the flag font, then vite dev on :5173
npm run build     # assets + tsc -b + vite build
npm run lint      # oxlint
npm run verify    # headless checks on the geo + motion maths (vite-node)
npm run preview
```

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

```
src/
  main.tsx · App.tsx        mount; App renders <Site />
  index.css                 minimal document reset

  site/                     the site
    Site.tsx                composition: intro → backdrop layer → header → page → footer
    router.ts               the whole router: six hash routes, no dependency
    sections.tsx            every landing section (Hero, Proof, Guide, Features, Value, Voices, FinalCta, SiteFooter)
    learn.tsx               every L-Earn section (hero, steps, games, streak, board, FAQ, CTA)
    analytics.tsx           every Partner Analytics section (hero, KPIs, funnel, week chart, reports, CTA)
    b2b.tsx                 every B2B section (hero, why, the owner dashboard, three pillars, rollout, operators, pricing, CTA) + every mock
    vouchers.tsx            every Vouchers section (hero + wallet, steps, catalogue, rules, FAQ, CTA)
    relocate.tsx            every Relocate section (hero, rate card, nine subjects, countries, ask, CTA)
    Header.tsx              nav + language switcher + theme toggle
    content.ts              structure only — icons, anchors, stat numbers. No copy.
    i18n/                   en · pl · uz · ru · uk dictionaries, context, provider, currency
    theme/                  dark/light context, provider, and the 3D palettes
    icons.tsx               inline SVG icon set
    site.css                all page styling; design tokens at the top
    useReveal.ts            shared IntersectionObserver reveal + count-up
    glassMesh.ts            glass-surface helper
    controller/             a small 3D game-controller model (procedural geometry)
    network/                L-Earn's backdrop: a canvas-2D web of linked neon nodes
    market/                 B2B's backdrop: a canvas-2D revenue line the venues under it tick up
    AssistantButton.tsx     floating assistant CTA

  components/
    GlobeHero/              the globe — see README.md
    PaylezIntro/            brand cold-open; pure DOM + CSS, one timer

scripts/
  copy-flag-font.mjs        self-hosts the Twemoji flag subset
  verify-geo.ts             the headless maths checks

landing/                    ORIGINAL DESIGN SOURCE — not built, not imported
b2b/                        B2B design source + screenshots — not built, not imported
public/                     favicon + generated fonts/
```

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

**The light theme is one hue at three lightnesses, and the hue is cyan.**
Everything accented on that page is 179°; only the step changes, and the step is
chosen by what the mark *is*, because paper sets a different bar for each:

    --accent      #13eff2  the neon. Fills only — buttons, the brand mark,
                           chips, bars, chart columns. 11.9:1 against its ink.
    --accent-lit  #089b99  3.2:1. Icon strokes, focus rings and large type,
                           which is the WCAG bar for both. Most of the accent
                           you see on the page is this.
    --accent-ink  #007a78  4.9:1. Small accented text, and nothing else.

179° and not the 170° of the dark mint, and that is not a whim: 170° reads as a
turquoise while it is *bright*, but every step down in lightness at that hue
reads greener, because green is where the eye is most sensitive and blue falls
out of a dark mix first. Sitting just under 180° keeps green a shade ahead of
blue — the brand leans green, not blue — without letting it run: the dark steps
lead by two points, not twenty. Dark keeps 171° because it never goes dark; it
only ever has the bright step.

Dark has no middle to need — the mint clears everything at 11:1 — so all three
are `#58e9d4` there and the ramp costs nothing.

`--on-accent` and `--text` are `#04201f`, the same hue taken to near-black, so
the darkest thing on the page and the brightest belong to one family. `--bg-2`
carries the cyan cast too; `--bg` is a specified brand value and is left alone.

Getting the step wrong makes a mark duller than it could be; it never makes one
illegible, because `--accent-ink` is the default and `--accent-lit` is applied
deliberately. Keep it that way round. Nothing in `site.css` sets
`color: var(--accent)`, and nothing should start.

One more token exists because a colour cannot do both jobs on paper:

- **`--tint-rgb`** — the neon in light, `--accent-rgb` in dark. Filled washes
  (`--surface`, `--surface-2`) are large areas and can be the neon itself; a 1px
  border at 16% cannot be anything but the deep step, so `--border` keeps
  `--accent-rgb`. Light raises the wash alphas to match — the neon is lighter, so
  it needs more of itself to tint by the same amount.

The canvases take `--accent-lit` (`THEMES.light.primary`, same hex — the globe,
the controller, the node web, the market tape): they are
shapes, but `tone: 'ink'` alpha-blends them onto paper and the globe is mostly
one-pixel coastlines — at the full neon it renders as an empty disc. The globe's
country label is the one *word* in that layer, and `CountryCard.css` colours it
from `--accent-ink` with the prop as a fallback.

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
- **The backdrop is per route.** Six routes, three canvases. Landing *and*
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
- `DETECTION.spotlight` restricts country labels to `PL UA AZ UZ RU`. An empty
  array means every country. The `intervalMs` / `debounceMs` cadence is tuned
  for that small set — widening the spotlight without retuning them makes the
  label flicker.
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
