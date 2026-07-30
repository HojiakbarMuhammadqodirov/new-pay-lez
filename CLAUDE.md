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

  site/                     the landing page
    Site.tsx                composition: intro → globe layer → header → sections → footer
    sections.tsx            every page section (Hero, Proof, Guide, Features, Value, Voices, FinalCta, SiteFooter)
    Header.tsx              nav + language switcher
    content.ts              structure only — icons, anchors, stat numbers. No copy.
    i18n/                   en · ru · uz dictionaries, context, provider
    icons.tsx               inline SVG icon set
    site.css                all page styling; design tokens at the top
    useReveal.ts            shared IntersectionObserver reveal + count-up
    glassMesh.ts            glass-surface helper
    controller/             a small 3D game-controller model (procedural geometry)
    AssistantButton.tsx     floating assistant CTA

  components/
    GlobeHero/              the globe — see README.md
    PaylezIntro/            brand cold-open; pure DOM + CSS, one timer

scripts/
  copy-flag-font.mjs        self-hosts the Twemoji flag subset
  verify-geo.ts             the headless maths checks

landing/                    ORIGINAL DESIGN SOURCE — not built, not imported
public/                     favicon + generated fonts/
```

### `landing/` is reference material

The `.html`, `.css` and `.jsx` files in `landing/` are the original Paylez
design prototypes (plus screenshots and pasted uploads). **Nothing in `src/`
imports them and Vite does not build them.** They exist so the React rebuild
can be checked against the source design. Don't edit them to change the live
site, and don't wire them into the build.

## Conventions

**Two colours, everywhere.** `#58e9d4` on `#0d0d0e`. The palette is declared
once in `src/components/GlobeHero/config.ts` (`COLORS`) and mirrored as CSS
custom properties at the top of `src/site/site.css`. Flag emoji are the one
sanctioned exception. Don't introduce a third hue; derive tints from the accent
with alpha the way `--surface` / `--border` do.

**Constants live in config files, not inline.** Every tunable for the globe is
in `GlobeHero/config.ts`; the intro's timings are in `PaylezIntro/config.ts`.
If you find yourself typing a magic number into a component, it probably
belongs in one of those, and the surrounding comment probably explains why the
current value is what it is.

**Copy lives in `i18n/`, structure lives in `content.ts`.** The arrays in
`content.ts` are index-aligned with their dictionary counterparts, so adding a
service or feature means adding one entry in `content.ts` and one in each of
`en.ts`, `ru.ts`, `uz.ts` — the compiler catches the half-done version. Never
hardcode user-visible strings in `sections.tsx`.

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
- The scroll transition is anchored to the `#guide` section
  (`scrollAnchorId="guide"` in `Site.tsx`). Renaming or removing that section
  changes when the globe settles into its footer pose.
- `DETECTION.spotlight` restricts country labels to `PL UA AZ UZ RU`. An empty
  array means every country. The `intervalMs` / `debounceMs` cadence is tuned
  for that small set — widening the spotlight without retuning them makes the
  label flicker.
- Bloom does the perceived brightness, not saturation. Emissive intensities
  clamp to 1.0 in the shaders and tone mapping is disabled, both deliberately.
  If you change `primaryColor`, scale `POST.bloomThreshold` with its luminance.
- `dist/` and `node_modules/` are gitignored; `public/fonts/` is generated but
  committed.
