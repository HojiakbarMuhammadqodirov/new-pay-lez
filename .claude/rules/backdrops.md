---
paths:
  - "src/components/GlobeHero/**"
  - "src/site/Site.tsx"
  - "src/site/heroFloor.ts"
  - "src/site/network/**"
  - "src/site/market/**"
  - "src/site/stubs/**"
  - "src/site/city/**"
  - "src/site/streets/**"
  - "src/site/level/**"
  - "src/site/controller/**"
---

# The globe and the route backdrops

Moved out of the root `CLAUDE.md`; loads when you work on the files above.

- The globe must be mounted `position: fixed` (`.site__globe`). Its scroll
  transition moves it *within* the viewport, so it needs a stable frame of
  reference. Without that, it will not behave.
- **The globe belongs to the landing page, and to nothing else now.** Relocate
  had it on the argument that the page was about a border being crossed; it is
  not — it is a guide to where you have already arrived, plus a currency
  converter — and it has had three backdrops since: CSS contour rings meaning
  distance from where you are standing, a street map in plan, and now
  `city/CityRise`. (`.site__rings` is gone from `site.css` with the second of
  those: a rule nothing mounts is a rule the next person has to read before
  finding out it does nothing.) Contact had the globe next, on the better
  argument that "reachable from anywhere" is the one other thing the globe
  honestly says, and lost it when the page became a single screen.

  **That last argument is about the globe, not about backdrops**, which is why
  Contact has one again. What a one-section page cannot support is a **scroll
  transition** — it needs enough page below the fold to retire the hero pose
  through, and without it the globe sits pinned straight on top of the form. A
  flat canvas has no hero pose and no transition; it is a layer, and a layer
  over one screen is what a layer is for. The document's single WebGL context is
  still spent on at most one route at a time.
- **The backdrop is per route, and one route per backdrop.** Landing gets the
  globe (the only WebGL one); L-Earn the platformer (`level/`), Analytics the
  node web (`network/`), Business **and Business setup** the candle tape
  (`market/`), Vouchers the drifting stubs (`stubs/`), Relocate the city rising
  (`city/`) and Contact the street map (`streets/`) — all six canvas-2D, all on
  `.site__web`; Privacy, Terms and **Profile** have none at all. Business setup
  shares the tape because describing your venue is the first move in the thing
  the tape already means; the profile has none because its subject is somebody's
  own name, city and photograph, which no backdrop here is a picture of.
  `Site.tsx` renders exactly one, and that is what makes seven components
  affordable: the document holds at most one backdrop context at a
  time, plus the controller's on L-Earn. Rendering two at once costs a second
  context on that page; browsers cap how many a document may hold and start
  dropping the oldest. The six 2D backdrops share one construction — props for
  `primaryColor`/`tone`, a config file, nothing per-frame through React state,
  a one-frame still under `prefers-reduced-motion` — so read one before writing
  a seventh. **L-Earn's used to be keyed to the session** — the arcade trail signed
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
- **The globe's frame is the camera's, and CSS must not restate it.**
  `resolveLayout` sizes the globe by moving the camera, not by scaling the mesh
  or the canvas — that is what keeps arc altitude, ribbon width and border
  offset in world units across both poses. So `.site__globe` and `.site__web`
  get `position`, `inset`, `z-index` and `pointer-events` — plus `width` and
  `height` at 100%, which is not a size *opinion* but a size *fix*: a `<canvas>`
  is a replaced element, and an absolutely positioned replaced element with
  `width: auto` takes its **intrinsic** size (the backing store) rather than
  filling its offsets, so `inset: 0` alone gives a 2× display a CSS box twice
  the viewport and draws the whole picture at double scale off the bottom-right
  corner. Nothing else.

  The two ways to break that are a fixed `height`/`width` on the canvas, and a
  `display: none` on a backdrop at some breakpoint. The first overwrites every
  number the layout resolved and is also the compounding-measure bug two bullets
  down, because R3F measures with `getBoundingClientRect`. The second is not
  responsive, it is absent — see the damping rule under Conventions. If the
  globe is in the wrong place, the fix is in `geo/layout.ts`; if it is too loud,
  the fix is an `opacity` in the `max-width: 820px` block.
- **The globe has two responsive framings. The portrait one is measured; the
  end pose is still a constant and is still wrong on a phone.**

  **Portrait, hero pose — measured.** The copy stacks above the globe and the
  globe sinks into the slot left under it. `RESPONSIVE.portraitCopyDepth` says
  where that copy ends as a *fraction* of viewport height, and the copy is a
  headline, a lede, two buttons and a stat row — a roughly fixed **pixel**
  height, so the fraction it occupies moves with the screen. 0.55 is right at
  390×844 and puts the globe about 90px into the stats at 360×780; tuning it
  only moves which phones are wrong. `site/heroFloor.ts` measures the real floor
  and publishes it through the `focusStore` construction
  (`useSyncExternalStore`, resize-only — this is not per-frame work);
  `resolveLayout` takes it as a `copyDepth` **parameter defaulting to the
  constant**, so every existing caller and every check in `verify-geo.ts`
  resolves exactly as it did. Above phone width it is inert *by construction*
  rather than by test: `sink` is 0 unless the viewport is both narrower than
  `portraitStackWidth` and portrait, and `heroOffsetY` is
  `-(copyDepth / 2) * sink`.

  The half worth knowing about is the **reset**. The globe outlives the hero —
  it is a fixed backdrop `Site` keeps across routes — so `useReportHeroFloor`
  publishes the constant back on unmount. Without that, a measurement taken on
  the landing page goes on aiming the globe on a route whose hero is a different
  shape, or gone.

  **Narrow, end pose — open.** Framed by height alone the disc is 133% of it,
  which is 1123px across a 390px screen: a wall behind the bottom of every
  screenful rather than a horizon under it, with the carousel's dimmed cards
  landing on a bright sphere. The fix is a second pair of numbers below a width
  step — a diameter near the viewport *width* and a larger visible fraction to
  keep the cap around a quarter of the height — and it has to come with
  `verify-geo.ts` checks that the cap never exceeds `heightCoverage` whichever
  framing applied and that the centre stays below the fold. Do not correct it
  from the stylesheet; that is the bullet above.
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
  lucky box, grows, and leaves down a pipe, which is play, get bigger, cash out;
  the city rising behind Relocate is an unfamiliar place becoming known, blocks
  standing up in a wave with always more of it beyond the horizon than you have
  learnt; the street map behind Contact is the route to reach us, an avenue
  reaching out with side-streets off it and landmarks lighting where it arrives.
  They are different pictures on purpose. A new one that is "the node web but
  different particles" is a reason not to add it.

  **The last two are the rule working, and it is worth reading them in order.**
  The street map drew itself on *Relocate* for an afternoon and said the right
  sentence in the wrong medium: a place becoming legible is areas and volumes,
  and hairlines on black are a wiring diagram with no mass and nothing a page
  can stand on. So Relocate got the volumes and Contact got the lines, because
  on Contact the subject genuinely *is* a route. Same drawing, and only one of
  the two routes was ever right for it — which is what "one route per backdrop"
  is actually about.

  **A candle says direction with a fill, not a hue.** Green and red are not
  available here, so an up candle is solid and a down candle is hollow — the
  convention a chart printed in one ink has always used, and still the fastest
  tell on the screen. Reaching for a second colour there is the same mistake as
  reaching for one on the game cards; see the `[data-texture]` rule above.

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
- The globe's scroll transition is anchored at `#guide` (`scrollAnchorId` in
  `Site.tsx`), the landing page's third section — the second is too early, and
  the globe ends up behind a card rather than under it. Renaming or removing
  that section changes when it settles.
