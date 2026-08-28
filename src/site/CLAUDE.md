# src/site

The palette detail for this directory. The universal rules — two colours only,
and the CSS/WebGL palettes having to agree — are in the root `CLAUDE.md`; this
file is the token-level reasoning behind `site.css` and `theme/context.ts`.

**The light theme is one hue at three lightnesses, and the hue is cyan.**
Everything accented on that page is 179°; only the step changes, and the step is
chosen by what the mark *is*, because paper sets a different bar for each:

    --accent      #089b99  fills — chips, bars, chart columns, selected tabs.
                           The same hex as --accent-lit below, deliberately.
                           *Not* buttons on paper; see the ink, below.
    --accent-lit  #089b99  3.2:1. Icon strokes, focus rings and large type,
                           which is the WCAG bar for both. Most of the accent
                           you see on the page is this.
    --accent-ink  #007a78  4.9:1. Small accented text, and nothing else.

The first two being one value is the point, not an oversight. `--accent` was the
neon `#13eff2` and it did not work: 1.3:1 against near-white, so a solid button
had no silhouette, and it read as a different colour family from the deep teal
of every icon and eyebrow beside it. Landing the fill on the middle step means
the "Play & Earn" pill and the "Exclusive deals." above it are literally one
colour. Its ink is `--on-accent`, which is **white in light and near-black in
dark** — white on this step is 3.4:1, which clears AA for large text and
non-text marks but not for a 15px button label. That is a known, deliberate
trade for the match; moving the fill to `--accent-ink` would put white at 5.25:1
and break it.

179° and not the 170° of the dark mint, and that is not a whim: 170° reads as a
turquoise while it is *bright*, but every step down in lightness at that hue
reads greener, because green is where the eye is most sensitive and blue falls
out of a dark mix first. Sitting just under 180° keeps green a shade ahead of
blue — the brand leans green, not blue — without letting it run: the dark steps
lead by two points, not twenty. Dark keeps 171° because it never goes dark; it
only ever has the bright step.

Dark has no middle to need — the mint clears everything at 11:1 — so all three
are `#58e9d4` there and the ramp costs nothing.

`--text` is `#04201f`, the same hue taken to near-black, so the darkest thing on
the page and the brightest belong to one family — as is `--on-accent` in dark,
where the fill is bright enough to carry near-black ink at 11:1. `--bg-2` carries
the cyan cast too; `--bg` is a specified brand value and is left alone.

Getting the step wrong makes a mark duller than it could be; it never makes one
illegible, because `--accent-ink` is the default and `--accent-lit` is applied
deliberately. Keep it that way round. Nothing in `site.css` sets
`color: var(--accent)`, and nothing should start.

Two more tokens exist because one value cannot do both jobs on paper:

- **`--tint-rgb`** — what filled washes (`--surface`, `--surface-2`) are tinted
  with, `--accent-rgb` in both themes now. It briefly held the neon in light, on
  the argument that a grey wash under a mint button read as two colour families;
  once the fill moved to `#089b99` that argument died and the neon was left
  saturating everything. It only shows above chip size — the L-Earn stats bar,
  the wallet balance, every dashboard card — where `rgba(19,239,242,0.28)` is not
  a tint but a slab of aqua. **Light alphas are 5% / 11%**, which lands within a
  point or two of the reference design's `#EEF1F0` / `#F6F8F7`
  (`b2b/Paylez Partner Dashboard v2.dc.html`): near-neutral surfaces, with the
  green spent only on things that are actually the accent. If a light panel ever
  looks like a coloured block, this is the token, not the component.
- **`--logo`** — the only theme-conditional token that is not a colour, and the
  brand mark as a `url()`. `public/logo/logo-dark.jpg` is mint on black,
  `logo-light.png` the inverse cut; both are square and carry their own ground,
  so `.brand-mark` and `.pz-mark` show the whole tile rather than laying a glyph
  on `--accent`. Declared as a token so only the matched theme's file is fetched.
  `THEMES[…].logo` mirrors it for `PaylezIntro`, which lives under `components/`
  and takes a `markImage` prop rather than reading the site's stylesheet.

**There is a third palette block, and it is the ink.** `--ink-rgb` (`4, 32, 31`)
and `--ink-on-rgb` (`88, 233, 212`) are declared in `:root` and never redeclared,
because they belong to a *surface* rather than to a theme: the near-black this
brand's dark things are made of, and the mint that marks it. Dark is already made
of them. Paper spends them in four places, and all four come from the reference
design (`b2b/Paylez Partner Dashboard v2.dc.html`), which is itself a light page:

    --solid       the face of a thing you press. --accent in both themes, so
    --solid-lit   its label is --on-accent: near-black on the dark mint, white
    --on-solid    on paper. --solid-lit darkens on hover rather than lifting.

**Except on `.pd-app`, where a press is the ink.** That is the inversion worth
understanding, and it is now scoped to one screen instead of being the default.
The accent is what a mark is made of; the ink is what a press is made of, and on
paper those stop being the same colour — a page of white cards with a deep-teal
button on each reads flat, and the reference design's answer is near-black
buttons with a green kept for icon strokes, eyebrows, one chart line and a 6px
dot. That argument is about a page of white cards with nothing behind it, which
describes the partner dashboard and describes no other page here: the marketing
routes all carry a live canvas and a mint headline, and a black pill on one of
them is the single element saying nothing green at all.

The trade is stated rather than hidden. White on `#089b99` is the 3.4:1 the
paragraph above admits to — AA for large text and non-text marks, under it for a
15px label — and mint on the ink is 11.8:1. `--solid-lit` is `--accent-ink`, so
hover *darkens* to 5.25:1 rather than lifting, which is the only direction a
fill this light can move in.

One mechanical note, because it has already been wrong once: `--solid` has to be
**restated** wherever `--solid-rgb` is overridden. A `var()` inside a custom
property is substituted where the declaration sits, so a base
`--solid: rgb(var(--solid-rgb))` resolves against `:root` and is inherited into
the scope as a finished colour — overriding only the triplet changes the shadow
and nothing else.

`[data-ink]` is the same pair at panel size, and it is the third palette block in
`site.css` — the one place other than the two `:root` blocks where a colour is
named, sitting immediately after them. It re-points the tokens *inside* a panel
(text to white at three alphas, the accent to the mint, surfaces and borders to
white at low alpha) so the children invert without a rule each: a kicker is
already `--accent-ink`, a figure already `--text`, a support tile already
`--bg-2` on a `--border` hairline. Two values:

- **`data-ink='on'`** — ink in both themes. The two phone mocks, which are
  pictures of an app whose ground is black whichever theme is reading.
- **`data-ink='paper'`** — ink only in light. The dashboard's black slabs: the
  overview headline, the cost-per-new-customer panel, and the assistant's
  opening panel. In dark they are already dark and glass is the better answer.

Inside the scope a press flips back to the mint, because a black button on black
is not a button — the same inversion dark runs, one level down. Anything added to
those panels later inherits all of it without knowing the scope exists; the thing
that breaks it is a rule that names a colour instead of reading a token, which is
the rule this whole file is about.

The canvases take `--accent-lit` (`THEMES.light.primary`, same hex — the globe,
the controller, the node web, the candle tape): they are
shapes, but `tone: 'ink'` alpha-blends them onto paper and the globe is mostly
one-pixel coastlines — at the neon the light theme used to fill with, it renders
as an empty disc.
