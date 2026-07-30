# GlobeHero

A procedural, two-colour globe for a fintech hero section.
React 19 · Vite · TypeScript · Three.js · React Three Fiber.

```bash
npm install
npm run dev       # http://localhost:5173
npm run verify    # headless checks on the geo + motion maths
npm run build
```

```tsx
import { GlobeHero } from './components/GlobeHero';

<GlobeHero />;
```

---

## Props

| Prop              | Type            | Default   | Notes                                                       |
| ----------------- | --------------- | --------- | ----------------------------------------------------------- |
| `rotationSpeed`   | `number`        | `1 / 5`   | **Revolutions per second.** `1/5` = one turn every 5 s.      |
| `primaryColor`    | `string`        | `#58e9d4` | The only accent in the scene.                                |
| `backgroundColor` | `string`        | `#0d0d0e` | Scene + page background.                                     |
| `tone`            | `'glow'｜'ink'` | `'glow'`  | How the accent meets the background. See below.              |
| `showRoutes`      | `boolean`       | `true`    | Animated great-circle arcs.                                  |
| `showLabels`      | `boolean`       | `true`    | Country card overlay (also gates the detection loop).        |
| `routeCount`      | `number`        | `16`      | Clamped to `ROUTES.maxCount` (48).                           |
| `glowStrength`    | `number`        | `1`       | Scales bloom. `0` removes the composer entirely.             |
| `offsetX`         | `number`        | `0.12`    | Globe centre, as a fraction of viewport width, from centre.  |
| `heightCoverage`  | `number`        | `0.8`     | Globe diameter as a fraction of viewport height.             |
| `scrollTransition`| `boolean`       | `true`    | Scroll carries the globe into its footer pose. See below.    |
| `className`       | `string`        | —         | Appended to the root element.                                |
| `style`           | `CSSProperties` | —         | Merged into the root element.                                |

Every other constant — tessellation, rim falloff, trail length, bloom
threshold, detection cadence, breakpoints — lives in
[`config.ts`](src/components/GlobeHero/config.ts).

## Layout

```
src/components/GlobeHero/
  GlobeHero.tsx        Canvas + overlay; the public surface
  config.ts            every tunable constant
  types.ts             public types
  scene/               GlobeSurface · CountryBorders · Routes · Effects
  shaders/             GLSL for the two custom materials
  geo/                 atlas parsing, sphere maths, hit-testing, route baking
  hooks/               layout · transition · scroll · rotation · detection · atlas
  state/               focusStore — the 3D↔DOM bridge
  ui/                  CountryCard (the Apple-Maps place card)
```

## How it works

**Geometry is procedural.** No textures, no models, no images. Borders come
from Natural Earth 110m country polygons (`world-atlas`, dynamically imported
so it code-splits into its own ~40 kB gzip chunk). `topojson.mesh` deduplicates
shared frontiers, so a border between two countries is drawn once, not twice —
that is what keeps the hairline a hairline. Long edges are re-cut along the
great circle so they hug the sphere instead of chording through it.

**Seamless rotation.** The spin phase is integrated in *turns* and wrapped into
`[0, 1)` every frame, so `rotation.y` only ever crosses `2π → 0` — the identity
rotation. The accumulator never grows, so precision never degrades; changing
`rotationSpeed` at runtime alters only the derivative, so the globe cannot jump;
and `delta` is clamped, so returning from a backgrounded tab resumes rather than
teleports. `npm run verify` replays an hour of frames to confirm all of this.

**Two colours, honestly.** All emissive intensities are clamped to 1.0 in the
shaders. Pushing past that would clip the accent's strongest channel first and
drift the colour toward white, so bloom — not saturation — supplies the
perceived brightness. Tone mapping is disabled for the same reason. If you
change `primaryColor`, scale `POST.bloomThreshold` with its luminance so
borders stay crisp and only route heads flare.

**Glow and ink.** `tone` decides how the accent is composited, and it exists
because the neon treatment is not a colour choice — it is an *additive* one.
Under `'glow'` the surface shader adds the accent to the background and the
route ribbons blend additively, which is exactly right on near-black and
useless on paper: addition has no headroom above white, so a light page would
render an almost invisible globe. `'ink'` keeps every pixel of the geometry and
changes only the operator — the surface lerps toward the accent instead of
adding to it, and the ribbons switch to normal blending with intensity carried
as alpha, so a brighter trail becomes a *darker* line. It also forces
`glowStrength` to 0, because bloom is more added light. The two tones differ in
nothing else; the small tuning gap between them (a touch more body tint, a
touch less border weight, since a dark hairline on paper is already louder than
a lit one on black) is the `TONE` block in `config.ts`.

Set `tone="ink"` whenever `backgroundColor` is light. The rest of the scene
needs no other change.

**Routes are ribbons, not lines.** WebGL ignores `LineBasicMaterial.linewidth`,
so thickness has to be built into the geometry. Each sampled arc point emits two
vertices sharing a position and tangent; the vertex shader pushes them apart
perpendicular to both the arc and the view direction, so the ribbon faces the
camera along its whole length with no per-frame CPU work. One continuous indexed
strip per route keeps the joints seamless on a curve — the exact place naive
fat-line implementations crack open. Width lives in `ROUTES.width` (world units,
globe radius = 1) and the long edges are feathered by `ROUTES.edgeSoftness` so
the result reads as a stroke rather than a rectangle.

The whole network is still one merged geometry: `aT`, `aPhase` and `aSpeed` ride
along as attributes, so it animates from a single `uTime` uniform — one draw
call, one float written per frame. Arcs pass behind the globe because the opaque
body writes depth.

**Country detection.** The centre-screen ray is intersected against the globe
(falling back to the nearest silhouette point when the ray misses on narrow
viewports), converted to globe-local space — which undoes offset, tilt and spin
in one step — then resolved to a country by bounding-box reject plus an even-odd
ring test. Over water it falls back to the nearest coast within 11°, and past
that shows nothing, so the label disappears over open ocean rather than naming
something a thousand miles away. It runs on a 120 ms tick with a 260 ms
debounce, which is what stops border crossings from flickering.

## Performance

- 3 draw calls for the globe (surface · borders · routes) plus one bloom pass.
- Per frame the CPU writes exactly two numbers: `rotation.y` and `uTime`.
- Geometry and uniforms are memoised; every scene layer is `memo`'d.
- Detection results go through an external store consumed by
  `useSyncExternalStore`, so a country change re-renders one small DOM subtree
  and does **zero** 3D work. Routing it through React state would re-render the
  whole Canvas tree several times a second.
- Lighting is analytic in the shader — no lights, no shadow maps.
- DPR is clamped to 1.75; MSAA happens inside the composer, so the default
  framebuffer's antialiasing is switched off rather than paid for twice.
- `prefers-reduced-motion: reduce` freezes the globe and the routes.

## The scroll transition

The globe has two layout states and scroll interpolates between them.

|            | hero (progress 0)      | footer (progress 1)                     |
| ---------- | ---------------------- | --------------------------------------- |
| Diameter   | 0.8 viewport heights   | **1.33** viewport heights               |
| Position   | centred, +12% right    | centred, sunk below the bottom edge     |
| Axial tilt | 14°                    | **90°** — the spin axis faces the camera |
| Visible    | all of it              | **30%** of the globe = **40%** of screen |

The end state is defined by two numbers in `SCROLL.end`, and the diameter is
*derived* from them rather than stated separately:

```
diameter = heightCoverage / visibleFraction = 0.4 / 0.3 = 1.33 viewport heights
```

so "30% of the globe showing" and "filling 40% of the screen" can never drift
out of agreement — edit either one and the other still holds. The centre is
then sunk until exactly that fraction of the diameter clears the bottom edge:

```
(y + R) − (−visibleHeight/2) = visibleFraction · 2R
```

At 90° tilt the rotation axis points straight at the viewer, so the pole side
is what you see and the globe turns in-plane like a disc — the one rotation
that is actually *visible* on a sphere, which is what makes the tilt read.

**How it's driven.** Scroll position is written to a ref by a passive listener
— never to React state, or every wheel tick would re-render the Canvas subtree.
The render loop reads that ref and chases it with frame-rate independent
exponential smoothing, so flicks and trackpad momentum arrive as a glide rather
than a snap, with `smoothstep` flattening the derivative at both ends. The
country card fades out over the first 45% of the transition via a CSS custom
property, so that costs no render either. Net cost of scrolling the whole page:
**zero React renders.**

Mount the component `position: fixed` for this to work — it moves the globe
*within* the viewport, so it needs a stable frame of reference:

```css
.page__globe { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
```

Set `scrollTransition={false}` to pin it to the hero pose.

## Responsive behaviour

On-screen size is driven by camera distance, not by scaling the mesh, so
world-space units (arc altitude, ribbon width, border offset) stay constant and
never need per-breakpoint retuning:

```
visibleHeight(d) = 2·d·tan(fov/2)
2R = coverage · visibleHeight   ⇒   d = R / (coverage · tan(fov/2))
```

In portrait the hero offset is scaled down and `coverage` is clamped to
`2·aspect·(0.5 − |offset| − margin)`, which is the largest globe that still fits
horizontally once it has been pushed off-centre. The label card moves from
bottom-left to bottom-centre at the same breakpoint.

The footer pose is **not** clamped — the 30%/40% framing is honoured exactly at
every aspect ratio. On a phone that means the globe is about 2.4× wider than the
viewport, so the visible cap reads as a gentle horizon rather than an arc. If
you would rather keep the curvature on mobile, cap `SCROLL.end` coverage against
aspect the way the hero state does — but that necessarily gives up one of the
two numbers.

## A note on flags

Flag emoji are inherently multi-colour, which is the one place the two-colour
rule is broken — by request. Set `UI.flagRendering = 'mono'` in `config.ts` to
tint them to the accent instead.

Chromium on Windows ships no glyphs for regional-indicator pairs, so 🇺🇸 would
render as the letters "US". `npm run assets` (which `dev` and `build` both run)
copies the Twemoji flag subset from `country-flag-emoji-polyfill` into
`public/fonts/`, self-hosted — the page makes no third-party requests.

## Verification

`npm run verify` runs the parts that are pure maths headlessly: atlas parsing,
projection round-trips, country hit-testing against known coordinates, Point
Nemo returning nothing, ribbon geometry invariants, route baking determinism,
the hero and footer framing across five aspect ratios, and the rotation
accumulator over an hour of simulated frames.

Layout maths lives in `geo/layout.ts` as a pure function precisely so it can be
checked this way; `useGlobeLayout` is only the React wrapper around it.
