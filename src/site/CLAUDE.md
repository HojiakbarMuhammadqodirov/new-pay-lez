# src/site

The palette detail for this directory. The universal rules — two colours only,
and the CSS/WebGL palettes having to agree — are in the root `CLAUDE.md`; this
file is the token-level reasoning behind `site.css` and `theme/context.ts`.

**The light theme is one hue at three lightnesses, and the hue is cyan.**
Everything accented on that page is 179°; only the step changes, and the step is
chosen by what the mark *is*, because paper sets a different bar for each:

    --accent      #089b99  fills — buttons, chips, bars, chart columns. The
                           same hex as --accent-lit below, deliberately.
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

The canvases take `--accent-lit` (`THEMES.light.primary`, same hex — the globe,
the controller, the node web, the market tape): they are
shapes, but `tone: 'ink'` alpha-blends them onto paper and the globe is mostly
one-pixel coastlines — at the neon the light theme used to fill with, it renders
as an empty disc.
