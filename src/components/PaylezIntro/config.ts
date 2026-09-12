/**
 * The cold-open's tunables. Times are milliseconds from the moment the sequence
 * starts — which is not the moment the component mounts. See `fontWait`.
 *
 * ## The idea: the icon opens into the name
 *
 * `public/logo/logo-dark.jpg` is a lowercase **p** in the accent on the brand's
 * near-black. That is the mark on a phone's home screen, and it is also, exactly,
 * the first letter of the wordmark — the same geometric lowercase p that starts
 * `paylez`. Nothing else this product owns is that specific to it.
 *
 * So the sequence is: **the mark arrives, and then it becomes the word.** A
 * light crosses a dark engraved surface and finds the p; the p holds for a beat;
 * then it travels into its place in the lockup and shrinks to type size while
 * the light carries on and uncovers `aylez` behind it. The thing you tapped
 * turns into the thing you are looking at.
 *
 * **This is not the tile coming back.** `CLAUDE.md` is firm that there is no
 * mark *beside* the wordmark — the header, the footer and the dashboard rail
 * have never had one, and an earlier intro that opened on a square tile next to
 * the name was introducing a lockup the product does not use. The distinction
 * that matters is that this mark is never beside the name: it **is** the name's
 * first letter, drawn from the same face at the same weight, and by the end of
 * the sequence it is sitting in the word rather than next to it. The final frame
 * is the wordmark and nothing else, which is the only lockup this brand has.
 *
 * ## And your hand has the light
 *
 * The light is a blend of the scripted path and wherever the pointer is, so
 * moving the mouse drags it from the first frame — you can uncover the word
 * yourself, ahead of the script, or hold the light on a corner and watch the
 * engraving there.
 *
 * The reason that is safe is the rule the word keeps: **it is a high-water
 * mark.** A letter that has been lit stays lit, however the light moves
 * afterwards. Without it a cursor swept right and then left would *un-write* the
 * wordmark, which is the one thing a brand screen must not let you do.
 *
 * On a touch device nothing reports a hovering position, the script simply runs
 * to the end on its own, and the light settles on the word.
 *
 * ## What it is not
 *
 * Five versions preceded this one. **Three seconds of particles gathering into
 * the word** was the most work of them and the worst result: a particle field
 * assembling into type is a *tech demo*, and a tech demo in front of a payments
 * product reads as a studio showing off rather than as a brand arriving. **Do
 * not reach for it again.** Nor for six letters fading up one at a time, which
 * is a list of events rather than a gesture.
 *
 * ## The rule every version has kept
 *
 * **Nothing is loading, so nothing here may claim to measure a load.** The
 * bundle finished before the first frame. The hairline is an underline arriving
 * with the name, not a meter. The one thing that *does* deplete is the rule
 * under the Skip, and that is honest precisely because it measures this
 * sequence's own length, which is a real number this file owns.
 */
export const INTRO = {
  /**
   * How long to wait for the brand face before starting anyway.
   *
   * `@fontsource` ships `font-display: swap`, so a cold cache would draw the
   * word in the fallback stack and snap to Onest when it lands. It matters more
   * here than in any previous version: the mark is the *font's* lowercase p, so
   * a fallback face does not merely look wrong, it is a different mark.
   *
   * The cap is for the case where the face never arrives. A slightly wrong face
   * is a worse-looking intro; a stalled one is a site nobody can get into.
   */
  fontWait: 500,

  /** The wordmark, and the mark — which is its first letter. */
  text: 'paylez',
  mark: 'p',

  /**
   * A ceiling on the backing store, in device pixels — 1920×1080 at 2×.
   *
   * A fill-rate budget rather than a resolution preference. This layer covers
   * the whole viewport and clears it every frame, on a page that is also running
   * the globe; a 4K panel at 2× is a 33-megapixel canvas doing that sixty times
   * a second. Above the cap the type loses a little sharpness and nothing else
   * does — the rest of the picture is a lattice of hairlines and a soft pool.
   */
  maxPixels: 8_300_000,

  /* ── the light ──────────────────────────────────────────────────────────── */

  light: {
    /**
     * Two legs and a beat between them, as fractions of the viewport width.
     *
     * The light enters from outside the frame, settles on the mark, waits, and
     * then carries on out the other side taking the reveal with it. The pause is
     * the whole reason the mark registers as a mark rather than as a letter the
     * sweep happened to pass: without it the p is uncovered and abandoned inside
     * the same gesture.
     *
     * It starts and ends *outside* the frame. A light that appears at the left
     * edge and stops at the right is a thing being switched on and off; one that
     * passes through was always travelling and the screen was in its way.
     */
    from: -0.25,
    to: 1.25,
    arrive: { delay: 120, duration: 780 },

    /** Reach of the light, as a fraction of the viewport diagonal. */
    radius: 0.3,

    /**
     * …and a ceiling on that reach, in CSS pixels.
     *
     * A fraction of the diagonal is the right *look* — the light should cover
     * the same share of a laptop and a phone — but it is the wrong cost curve.
     * The pool is a soft disc alpha-composited over the destination every frame,
     * so its price is the square of the radius: at 1920×1080 on a 2× display an
     * uncapped 0.3 is a 2644px disc, seven megapixels of blending per frame, and
     * it measured 18ms a frame against `StubDrift`'s 7ms on the same screen.
     *
     * The cap binds only above about 1730px of diagonal, and what it costs there
     * is that the light stops growing with the screen — which nobody can see,
     * because the wordmark it is lighting has its own maximum size too.
     */
    maxRadius: 520,

    /**
     * How hard the light is pulled toward the pointer, and how fast.
     *
     * `pull` is deliberately under 1: the light follows your hand rather than
     * being your hand, which keeps the mark lit when the cursor is in a corner.
     * `follow` is the per-frame easing — low enough that the light has weight
     * and does not snap.
     */
    pull: 0.62,
    follow: 0.09,
  },

  /* ── the mark, and the mark becoming the word ───────────────────────────── */

  /**
   * How much larger the p stands before it descends into the lockup, as a
   * multiple of the wordmark's own type size.
   *
   * Big enough to read as the app icon rather than as an oversized letter, small
   * enough that the travel into place is one move and not a journey.
   */
  markScale: 2.6,

  /**
   * The last stretch of the unfold, over which the travelling p hands off to the
   * wordmark's own first letter.
   *
   * By then the two are the same glyph at the same size in the same place, so
   * the crossfade is invisible — it exists only so the final frame is one
   * `fillText` of the whole word rather than a word with a separately-drawn
   * letter sitting on top of it.
   */
  markFade: 170,

  /** The p travelling into place while the light uncovers the rest. */
  unfold: { delay: 1100, duration: 900 },

  /* ── the surface ────────────────────────────────────────────────────────── */

  /**
   * The engraving: a lattice of small crosses that exists only where the light
   * falls.
   *
   * This is the interactive half of the screen and the reason moving the mouse
   * is worth doing — the surface was always there and the light is what proves
   * it. Drawn as short ticks rather than as full grid lines because a continuous
   * rule reads as a chart and a broken one reads as material.
   */
  lattice: {
    /** Spacing between nodes, in CSS pixels. */
    cell: 27,
    /**
     * The most nodes the lattice may be across, whatever the screen.
     *
     * The light's reach is a fraction of the viewport diagonal, so on a 4K panel
     * it is nearly three times the radius it has on a laptop and the node count
     * — which goes as the *square* of that — is nine times. The cell widens past
     * this instead, which keeps the frame bounded and costs nothing anybody can
     * see: the engraving is a texture, and a texture's job is not to hold a
     * fixed pitch in millimetres on a screen you are sitting further away from.
     */
    maxSpan: 56,
    /** Arm length of each cross, as a fraction of the cell. */
    tick: 0.3,
    /**
     * Distance buckets.
     *
     * A stroke per tick is over a thousand rasterisation calls a frame.
     * Distance from the light is the only thing that varies between them, so
     * quantising it into this many layers turns the frame into that many
     * `stroke()` calls, with every tick of a layer in one path.
     */
    buckets: 8,
    /** How far the lattice slides against the pointer, as a fraction of offset. */
    parallax: 0.035,
    /**
     * The clearing the lockup sits in, as a fraction of the type size.
     *
     * The engraving has to stop where the brand is, and a hairline grid *over*
     * the letters is what made that obvious: everything on this canvas is
     * composited additively on black, so nothing occludes anything and the
     * lattice read as graph paper laid on top rather than as a surface the brand
     * is cut into. Fading the ticks out toward the ink box — rather than
     * clipping them at it — is what keeps the hole from looking like a rectangle
     * somebody punched.
     */
    clear: 0.6,
  },

  /* ── the word ───────────────────────────────────────────────────────────── */

  word: {
    /**
     * Type size, fitted by measurement rather than set by breakpoint.
     *
     * The word is scaled until it occupies `widthFraction` of the viewport, then
     * capped by height and by the two absolute bounds. A CSS `clamp()` with a
     * floor — which is what an earlier version of this screen used — stops being
     * fluid below the width where the floor wins, so a 360px phone and a 460px
     * one are handed exactly the same type. `site.css` has the long version.
     */
    widthFraction: 0.64,
    heightFraction: 0.22,
    minSize: 46,
    maxSize: 152,
    /** The lockup sits a little above centre; the rule takes the room below. */
    centreY: 0.46,

    /**
     * What an uncovered letter rests at, and how soft the uncovering edge is
     * (as a fraction of the light's radius).
     *
     * `base` is not 1 because the word has to *gain* something when the specular
     * crosses it — a letter already at full strength has nothing left to do, and
     * the glint stops reading as light falling on a surface. It is not much
     * under 1 either: this is what the wordmark looks like for most of the
     * screen's life, and a brand sitting at half strength reads as unfinished
     * rather than as unlit.
     */
    base: 0.86,
    feather: 0.5,

    /** Width of the specular band, as a fraction of the light's radius. */
    glint: 0.55,
  },

  /* ── the two grounds ────────────────────────────────────────────────────── */

  /**
   * What the light is worth on each ground — one set per tone, the way
   * `CITY.tone` holds one palette per tone and for the same reason.
   *
   * These are not the same numbers with a switch on top, and the pool is where
   * that bites hardest. On black the accent is *added*, so a wide soft disc at
   * 17% is a glow with a dark screen still around it. On paper it is laid over
   * near-white, where the identical disc is a pale cyan cloud with the wordmark
   * floating in the middle of it — not a light at all, just a wash. Paper takes
   * a third of it, and gets the strength back in the engraving instead, which
   * is a *mark* and reads perfectly well on white.
   *
   * `spark` is the same story one step further: additively it pushes a letter
   * past the accent into a highlight, which is the whole point of a specular.
   * There is no headroom above white, so on paper it can only land the letter on
   * solid accent — so it is dialled back to where that is exactly what it does.
   */
  tone: {
    glow: { pool: 0.17, lattice: 0.45, spark: 0.5 },
    ink: { pool: 0.06, lattice: 0.6, spark: 0.34 },
  },

  /**
   * The hairline under the name, drawn from the centre out.
   *
   * Deliberately overlapping the unfold: it starts while the p is still
   * travelling, which is what makes the pair read as one gesture rather than as
   * a reveal followed by a flourish.
   */
  rule: {
    delay: 1800,
    duration: 600,
    /** Width as a fraction of the word's own, so it tracks the type at any size. */
    widthFraction: 1.05,
    /** Distance below the word's ink box, as a fraction of the type size. */
    gap: 0.46,
    alpha: 0.72,
  },

  /**
   * When the Skip appears.
   *
   * **Early, and that is a correction.** It used to arrive with the hairline,
   * near the end, on the argument that a control offering to skip something
   * should not precede the thing — which is true, and was worth less than it
   * cost. A sequence is only skippable if there is time to see the control, move
   * to it and press it, and arriving two thirds of the way through a two-second
   * screen left about a second for all three. It is on screen for well over two
   * now.
   */
  skip: { delay: 400 },

  /**
   * The screen leaving.
   *
   * `onComplete` fires at `delay` rather than at the end, so the page's own
   * 700ms rise starts *underneath* this and the two overlap. Firing at the end
   * made the hand-off two events in a row with a dead frame between them.
   */
  exit: { delay: 2600, duration: 400 },

  /** Total run time; the overlay unmounts here. */
  duration: 3000,
} as const;
