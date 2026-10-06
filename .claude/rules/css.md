---
paths:
  - "src/site/site.css"
  - "src/index.css"
  - "src/site/sections.tsx"
  - "src/site/business.tsx"
---

# The stylesheet, responsive rules and controls

Moved out of the root `CLAUDE.md`; loads when you work on the files above.

**The plan cards are the fourth answer, and it is texture plus depth rather than
a fourth hue.** Three tiers have to read as three grades of the same thing — and
the ask was for Premium to feel like the expensive one — which is exactly the
case where a colour per card would be easiest and would break the palette. What
separates them instead is *material*: a pixel grid at different densities
(`--pixel-a` / `--pixel-c`), a rail and an inset highlight on the two paid
tiers, and a light that only exists where a hand is. `.sub-field` is one pool of
it behind the whole section (a 22rem mask following the cursor, brightening the
ruling when any card is held) and `.sub-glint` is the per-card version — a 1px
accent border revealed through a 9rem mask anchored to the pointer, so the edge
lights only where the hand is. Both are driven by `site/pointer.ts`, which
writes `--sub-x` / `--sub-y` as custom properties on the element rather than
routing a pointer stream through React, and measures the box on the way in
because the property written on the previous move dirties style — a
`getBoundingClientRect` per event forces a synchronous layout a hundred times a
second, for a light.

Both are `display: none` under `@media (hover: none)`, deleted rather than
frozen at their default mask position, which would be a bright blob nobody put
there. And **hover marks these cards, it never lifts them**: the two paid tiers
take a stronger glow because they have a rail for it to come off, and that is
the whole of the difference.

**Responsive is a measurement, not a breakpoint you liked.** Four things this
sheet learned the hard way, all of them checked headlessly in Chrome with the
viewport and the pointer emulated rather than by looking at a narrow window:

- **A fluid clamp with a floor is not fluid.** `clamp(2.5rem, 5.4vw, 4.4rem)`
  stops moving below 741px — the floor wins — so a 360px phone and a 768px
  tablet were set in the same 40px, which is what "telefon planshet
  versiyalarida bir xil text" was. The form to reach for is the two-point
  `clamp(min, REM + VW, max)`, fitted through the existing desktop value so the
  wide end is unchanged and only the small end moves.
- **`--tap: 44px`, and the touch rules key off `pointer: coarse`, not width.**
  A small laptop window is the same width as a tablet and has none of the
  problem; the on-screen keyboard is the trigger, not the screen. That is why
  the field kit goes to `1rem` under `pointer: coarse` — anything under 16px
  makes iOS zoom the page on focus and leaves the visitor on a page 1.3× too
  wide with no obvious way back — and why a control smaller than the token grows
  its target with a `::before` rather than its box, so the drawn size stays the
  designed one.
- **Vertical rhythm measured in `vh` is backwards once the page is one column.**
  `.guide` reserved `100dvh` for ~600px of content and `.section` paid 12vh at
  each end — 246px between two sections on a tablet — so a taller phone got
  *more* air around less content. The `@media (max-width: 820px)` block takes
  both back to a clamp.
- **A backdrop that is hidden on a phone is not responsive, it is absent.** The
  fix is damping: `.site__web` to 0.62 in that same block, `.site__globe` to 0.4
  because lit coastlines with bloom on them are far brighter than four canvases
  drawing hairlines, and the L-Earn platformer to 0.42 via
  `.site[data-route='learn']` because it is the one backdrop that draws *filled*
  shapes and the stats row lands on the block run. Same rule `--glass` states
  for cards: text wins.

**A stretched `.btn` centres its own label.** `.btn` is an `inline-flex` and set
no `justify-content`, which is invisible everywhere it shrink-wraps — content
and box are the same width, so nothing can move — and wrong everywhere a parent
stretches it. The Contact form's submit is a column child of `.form-block`, so
it is the width of the fieldset and its icon and label sat against the left edge
with 340px of empty pill after them; the same was true of the sign-in button,
the Google button, both plan cards' CTAs, and every hero CTA at phone widths,
where `.hero-cta` wraps and each button takes the row. One declaration on `.btn`
rather than a rule per instance, because the ones that are not stretched cannot
notice it.

**A hero with an empty second column is centred, not left-packed.** `.hero-grid`
is two columns because the right-hand one reserves the space the *globe* renders
into, and the globe is a fixed layer that cannot see the page. Relocate copied
the arrangement when it had the globe and kept it through three backdrops; the
one it has now is full-bleed like every other 2D backdrop, so the reserved
column reserved nothing and the copy sat in the left half of an empty screen.
`hero-mid` is the answer — one column, the 34rem measure kept, and the flex rows
(buttons, stats) centred with it, because a centred paragraph over a left-packed
button row is worse than either. Reach for it on any hero that is not sharing
the viewport with the globe; `text-align` alone would not have been the fix,
since the problem was the track.

**A hover implies a press, and a press has to exist.** There were four `:active`
rules in the whole sheet and none on `.btn` — every button lifted toward the
cursor and then did nothing when clicked. `.btn:active:not(:disabled)` is down
and smaller at 40ms, because that is what a physical button does and because a
press is instant; `.btn:disabled` clears the lift and the glow, since
`.btn-solid:hover` has no `:not(:disabled)` and a submit waiting on a request
still rose. Three more controls got the interaction they were missing: the
burger (the one control a phone cannot browse this site without, and not a
`.btn`, so it needs its own), the carousel dots (eight identical marks with
nothing to say which one a click would take — hover previews *half* the selected
width, not the accent, which would claim it was already selected), and the two
"more" links, whose arrow **travels on a transform** while the `gap` stays put:
animating `gap` relayouts the flex line every frame for exactly the picture the
compositor gives free.

Two mechanical notes. **The `@media (hover: none)` guard drops movement only**,
never the colour and border changes — on a list you have just tapped, "this is
the one you touched" is useful rather than stuck — and because it is written
once against a list of selectors at the same specificity, **it has to stay below
every rule it guards.** And `prefers-reduced-motion` gets its own branch:
`.learn-back`'s glyph is a *mirrored* arrow, so clearing its transform points it
the wrong way; the reduced branch keeps the mirror and drops the travel.

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
real destination. A picture of a control is only honest when nothing about it
invites a tap.

- **A chart states its own height.** The columns inside it are percentages, and a
  percentage height against an `auto` parent resolves to nothing — which is
  exactly what the country comparison did before `.adm-compare-cols` was given a
  definite `9rem`. Every chart in `site.css` sets one.
- **Never put `overflow-x` on `html`.** `overflow-x: clip` there is the trap:
  `clip` on one axis forces the other to `clip` too, so the document stops
  scrolling outright and everything reading `window.scrollY` — the globe's
  scroll transition, the `data-reveal` scan, `scrollIntoView` — is looking at a
  page that, as far as it can tell, does not scroll.

  `body` is the case worth being precise about, because the obvious reading of
  it is wrong. `index.css` sets `html, body, #root { height: 100% }` *and*
  `body { overflow-x: hidden }`, which looks like it should make **body** the
  scroll container and collapse `documentElement.scrollHeight` to one viewport.
  It does not, and the reason is the viewport-propagation rule: `html`'s
  overflow is `visible`, so the *body's* `overflow-x` is applied to the viewport
  and body itself is treated as `visible`. Measured on that exact CSS —
  `scrollY` 1200, `documentElement.scrollHeight` 5000, `innerHeight` 742. The
  rule that follows is the narrow one: leave `html` alone, and note that this
  only holds while `html` has no overflow of its own. Give it one and body stops
  propagating, which is the collapse for real.

  Cut the axis where it actually overflows instead. `.carousel` and `.marquee`
  both take `overflow-x: clip` on the element whose transformed track is three
  screens wide — `clip` rather than `hidden` because `hidden` opens a scroll
  port and focusing an offscreen card then desynchronises the track from
  `--index`. The check worth running after touching either is
  `scrollWidth === innerWidth` at 360, 390, 768 and 1440.
- **Charts and product mocks are DOM, not canvas and not images.** Analytics'
  funnel and week chart, and the Business page's owner dashboard and pillar
  consoles, are divs with a custom property for their size, animated with `transform` off the shared `[data-shown]` reveal.
  That is deliberate: they inherit the theme tokens, they translate into five
  languages, they price themselves in the reader's currency, and they cost no
  context — none of which a screenshot does. `data-count` on the figures rounds to
  whole numbers, so anything wanting a decimal place needs the hook changed first;
  it also takes `data-prefix`, `data-suffix` and `data-group`, which is how a
  money figure gets its symbol on the correct side and its digits separated.
