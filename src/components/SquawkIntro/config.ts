/**
 * The cold-open's tunables. Times are milliseconds from the moment the sequence
 * starts — which is not the moment the component mounts. See `fontWait`.
 *
 * ## The idea: the bird flies, and what it is flying for is money
 *
 * Squawk is the one thing this product owns that a stranger already understands
 * without being taught: a parrot, four columns, a gap to thread. So the screen
 * opens on the *game* and ends on the *point of the game* — the bird crosses a
 * short course, turns into a banknote, the note goes out and comes back, and
 * the word is written behind it on the way back. Play a little, earn a lot, in
 * the one grammar nobody has to be taught. It is the same argument `CLAUDE.md`
 * makes for the platformer behind L-Earn, spent on the screen that arrives
 * first.
 *
 * The parrot is not a drawing *of* Squawk — it is `site/flight/parrot.ts`, the
 * same table of rounded rectangles the flight canvas paints, at the same two
 * wing frames. A second sprite would be a second thing to keep in step, and
 * would be wrong the first time somebody moved the crest.
 *
 * ## Everything happens in one 400 × 200 box
 *
 * The whole sequence is authored in a **design space 400 wide and 200 tall**
 * and scaled once to whatever the viewport can give it (`stage`). That is what
 * makes "the note travels 200px" a statement rather than a hope: on a phone the
 * stage is smaller and the note travels the same *half the stage*, which is what
 * the number actually meant. Fixing the travel in screen pixels instead gives a
 * 360px phone a note that flies off its own stage — the same mistake
 * `FLIGHT.worldHeight` exists to prevent one directory over.
 *
 * ## What is still the old screen's
 *
 * The engraved surface is unchanged: a lattice of crosses that exists only
 * where the light falls, and a pool of light that is partly yours. What changed
 * is **what the light is following** — it used to run a scripted path across an
 * empty screen, and it now travels with the bird and then with the note, so the
 * surface is lit by the subject rather than beside it. The engraving stops
 * inside the stage (`lattice.clear`), because everything here composites
 * additively on black and a hairline grid *over* the animation reads as graph
 * paper laid on top rather than as the surface it is happening on.
 *
 * ## The rule every version has kept
 *
 * **Nothing is loading, so nothing here may claim to measure a load.** The
 * bundle finished before the first frame. The hairline under the name is an
 * underline arriving with the word, not a meter. The one thing that *does*
 * deplete is the rule under the Skip, and that is honest precisely because it
 * measures this sequence's own length, which is a real number this file owns.
 */
export const SQUAWK = {
  /**
   * How long to wait for the brand face before starting anyway.
   *
   * `@fontsource` ships `font-display: swap`, so a cold cache would draw the
   * word in the fallback stack and snap to Onest when it lands — and the reveal
   * is a gradient fitted to the word's own measured box, so a face that changes
   * width mid-sweep uncovers the wrong letters.
   *
   * The cap is for the case where the face never arrives. A slightly wrong face
   * is a worse-looking intro; a stalled one is a site nobody can get into.
   */
  fontWait: 500,

  /** The wordmark, written behind the note on its way back. */
  text: 'paylez',

  /**
   * A ceiling on the backing store, in device pixels — 1920×1080 at 2×.
   *
   * A fill-rate budget rather than a resolution preference. This layer covers
   * the whole viewport and clears it every frame, on a page that is also running
   * the globe; a 4K panel at 2× is a 33-megapixel canvas doing that sixty times
   * a second.
   */
  maxPixels: 8_300_000,

  /* ── the stage ──────────────────────────────────────────────────────────── */

  /**
   * The box every number below is authored in, and how it is fitted.
   *
   * 400 × 200 at full size — the desktop figure — and the same 2:1 box scaled
   * down by width on anything narrower, so a phone gets the whole sequence
   * rather than a cropped one. `centreY` puts it a little above the middle: the
   * hairline takes the room below, exactly as the old lockup did.
   */
  stage: {
    width: 400,
    height: 200,
    /** The most of the viewport's width the stage may take. */
    widthFraction: 0.88,
    centreY: 0.46,
  },

  /* ── the bird ───────────────────────────────────────────────────────────── */

  bird: {
    /**
     * Fixed distance from the stage's left rail — the world moves, the parrot
     * does not, which is the whole illusion. Left of centre so there is room in
     * front of it for the note's travel later.
     */
    x: 122,
    /** Sprite box, in design units. The parrot is drawn in a unit square. */
    size: 52,

    /**
     * The hover: a sine about the midline, and the columns are dealt *to* it.
     *
     * Each gate's hole is centred on wherever the bird will be when that gate
     * arrives (see `columns`), so the parrot threads every one of them without a
     * simulation and without a near miss that reads as a collision. A backdrop
     * bird that can clip a column is a bird that eventually does, in front of
     * somebody's first visit.
     */
    bob: 15,
    bobPeriod: 620,
    /**
     * Nose-down at the bottom of the fall, nose-up at the top of the climb —
     * and small, because the sprite is already a diagonal. The parrot's head
     * sits up and forward of its tail by design, so a tilt scaled to the
     * *game's* (where it answers a real fall at 600px/s) reads here as a bird
     * pitching about rather than one holding its line.
     */
    tilt: 0.2,
  },

  /** The pop-in: overshoot, because a thing that arrives at exactly its own
   *  size was always there. */
  pop: { duration: 200, overshoot: 1.18 },

  /* ── the two bursts ─────────────────────────────────────────────────────── */

  /**
   * Feathers when the bird arrives, banknotes when it stops being a bird.
   *
   * Deliberately the same code and the same timings with a different shape and
   * a different count: they are a matched pair, and the second one reading as
   * "the first thing, again, but money" is the entire joke. Positions are a
   * closed form of elapsed time rather than an integration — no `dt`, so a
   * throttled tab cannot leave a feather stranded mid-air.
   */
  feathers: {
    count: 16,
    /** Design units per second, at the start. */
    speed: { min: 100, max: 260 },
    /** How much of that is left by the end — air, not a fudge. */
    drag: 0.55,
    /** Design units per second², downward. */
    gravity: 260,
    life: 560,
    size: { w: 8, h: 3.2 },
  },

  notes: {
    count: 13,
    speed: { min: 110, max: 270 },
    drag: 0.55,
    gravity: 300,
    life: 620,
    size: { w: 11, h: 6 },
    /** Turns per second, so the scatter reads as paper rather than as pellets. */
    spin: 1.6,
  },

  /* ── the course ─────────────────────────────────────────────────────────── */

  /**
   * Four gates, and four is the number the whole sequence is paced around.
   *
   * They enter off the right edge and the last one is clear of the left edge at
   * `end`, which is what "the columns end" means — the speed below is *derived*
   * from that, so moving `end` moves the scroll rather than leaving a column
   * stranded on screen when the morph starts.
   */
  columns: {
    count: 4,
    width: 30,
    /**
     * The hole a gate shows, in design units — and a **floor** rather than the
     * final answer.
     *
     * `SPRITE` measures what the parrot actually occupies (1.14 boxes tall,
     * because of the crest) and `gap` is widened to clear it plus `clearance`
     * either side. Writing the number down alone is what produced the first
     * cut's best bug: a gap of 56 under a 54-unit bird, which is a course the
     * bird flies *through* rather than along.
     *
     * It is still worth having a look to state. The corridor reads from the
     * rails now rather than from the columns being tall, so this is set by how
     * much air a gate should show, and the sprite raises it when it must.
     */
    gap: 76,
    /** Daylight the bird must have above and below it, in design units. */
    clearance: 10,
    /** The accent band across each mouth — the game's `pipe.cap`. */
    cap: 7,
    /**
     * How far that band stands proud of the column, in design units.
     *
     * A lip, and it is the detail that stops a gate being two rectangles: every
     * pipe anybody has ever seen in this genre is wider at the mouth, so the
     * shape is recognised before it is read. Four units, split either side.
     */
    capOverhang: 5,
    radius: 6,
    /** Distance between gates. */
    spacing: 130,
    /** How far off the right edge the first one starts. */
    lead: 16,
    /** How close a hole's edge may come to the ceiling or the floor. */
    margin: 12,
    start: 150,
    end: 1400,
    /**
     * The rails the columns stand on, and the reason they are here.
     *
     * The stage is 200 units of a viewport that is several times that, so a
     * column that stops at the stage's edge stops in mid-air: the first cut of
     * this screen read as four pairs of blocks floating in the dark rather than
     * as a course with a ceiling and a floor. Two hairlines fix it for the cost
     * of two `fillRect`s, and they fade out at both ends of their own length
     * rather than stopping — a rule that ends abruptly draws the invisible box
     * instead of the corridor inside it.
     */
    rail: { alpha: 0.34, fade: 0.16 },
  },

  /* ── the bird becoming the money ────────────────────────────────────────── */

  /**
   * The morph, as a collapse and an expansion about the same vertical line.
   *
   * A crossfade was the first version and it read as two pictures stacked,
   * because a parrot and a banknote share no silhouette to fade between. Turning
   * the bird edge-on until it is a sliver and opening the note out of that
   * sliver borrows the one gesture everybody already reads as *this became
   * that* — a card turning over. The burst goes at the sliver, which is the
   * frame with nothing in it to hide.
   */
  morph: {
    /**
     * The beat before it, and this is the whole difference between a change and
     * an event.
     *
     * A gesture with no preparation reads as a jump cut: the bird was flying,
     * and then it was money. So for the last moment of the flight it **stops
     * flapping and draws itself up** — the wing pins to one frame, the body
     * stretches a little — and the collapse comes out of that stillness. Every
     * animator's first rule and the cheapest thing on this screen.
     */
    anticipate: 130,
    stretch: 1.1,
    start: 1400,
    sliver: 1470,
    done: 1590,

    /**
     * …and the shockwave out of the sliver.
     *
     * Two rings rather than a flash, and the second one lags: a single
     * expanding circle is a ripple, and two at different speeds is something
     * *breaking open*. They are struck at the frame with nothing in it — the
     * bird gone, the note not yet — so the ring is the only thing on screen for
     * an instant and the eye has nowhere else to be.
     *
     * Radii are design units, so the wave runs past the stage's own edges,
     * which is the point: it is bigger than the box it happened in.
     */
    flash: { duration: 420, from: 12, to: 118, lag: 0.62, line: 5 },
  },

  /* ── the note ───────────────────────────────────────────────────────────── */

  note: {
    width: 56,
    height: 30,
    radius: 5,
    /**
     * How far it goes, in design units — the 200px of the brief, stated as half
     * the stage so it means the same thing on a phone.
     */
    travel: 200,
    /** Out, and back. It leaves to the left rather than stopping where it
     *  started: a thing that returns to its mark has not gone anywhere. */
    out: { delay: 1650, duration: 350 },
    back: { delay: 2000, duration: 400 },
    /** Where it ends up, in design units — off the stage's left edge. */
    exitX: 34,
    /** How long it takes to fade out at the end of the return. */
    fade: 150,
    /** Rock at the top of the out-leg, radians — paper has no engine. */
    tilt: 0.12,

    /**
     * The trail: a few of its own recent positions, plain and faint.
     *
     * Deliberately **the body and nothing else** — no rule, no `$`, no pips. A
     * ghost carrying the whole engraving is four notes overlapping and reads as
     * a printing error; what a trail is for is the *shape* having been
     * somewhere, and the shape is a rectangle.
     *
     * `step` is in milliseconds of the note's own path rather than in pixels,
     * so the trail is long where the note is fast and collapses to nothing
     * where it turns — which is exactly what speed looks like, and is free
     * because `noteX` is a pure function of time.
     *
     * **Many and almost invisible**, rather than a few you can count. Three or
     * four ghosts at a spacing you can see are three or four grey boxes with
     * edges — the eye resolves them and reads a stack, not a smear. Ten at
     * 13ms overlap so heavily that no individual one is findable and what is
     * left is the blur a fast thing actually leaves. Each is worth so little
     * that the whole stack is under a third of one note, and each is shorter
     * than the one in front, so the smear is a wedge that runs out.
     */
    trail: { count: 10, step: 13, alpha: 0.075, taper: 0.055 },
  },

  /* ── the word ───────────────────────────────────────────────────────────── */

  word: {
    /**
     * Type size, fitted by measurement rather than set by breakpoint: the word
     * is measured once at a reference size and scaled to take this share of the
     * stage's width. Text metrics are linear in the size, so one `measureText`
     * answers every candidate.
     */
    widthFraction: 0.68,
    /** …and capped by the stage's height, so a long word cannot overflow it. */
    heightFraction: 0.46,

    /**
     * What an uncovered letter rests at, and how soft the uncovering edge is,
     * in design units.
     *
     * `base` is not 1 because the word has to *gain* something when the specular
     * crosses it — a letter already at full strength has nothing left to do.
     */
    base: 0.86,
    feather: 44,
    /** Width of the specular band riding with the note, in design units. */
    glint: 120,

    /**
     * And one more pass across the finished word, after the note has gone.
     *
     * The specular the note carried was a consequence of the note; when it
     * leaves, the brand is left flat and lit from nowhere for the last half
     * second — which is the half second the screen actually ends on. This is
     * the light coming back for it alone: one band, slow, over a word that is
     * no longer being written. It is the oldest trick a wordmark has and it is
     * the frame people remember.
     */
    finish: { delay: 2340, duration: 480, width: 170 },
  },

  /**
   * The hairline under the name, drawn from the centre out.
   *
   * Deliberately overlapping the note's exit: it starts while the note is still
   * leaving, which is what makes the pair read as one gesture rather than as a
   * reveal followed by a flourish.
   */
  rule: {
    delay: 2280,
    duration: 380,
    /** Width as a fraction of the word's own, so it tracks the type at any size. */
    widthFraction: 1.05,
    /** Distance below the word's ink box, as a fraction of the type size. */
    gap: 0.42,
    alpha: 0.72,
  },

  /* ── the surface ────────────────────────────────────────────────────────── */

  light: {
    /** Where the light comes in from, as a fraction of the viewport width. */
    from: -0.25,
    /** Reach, as a fraction of the viewport diagonal… */
    radius: 0.3,
    /**
     * …and a ceiling on it, in CSS pixels.
     *
     * A fraction of the diagonal is the right *look* and the wrong cost curve:
     * the pool is a soft disc alpha-composited over the destination every frame,
     * so its price is the square of the radius. Uncapped at 1920×1080 on a 2×
     * display it measured 18ms a frame against `StubDrift`'s 7ms.
     */
    maxRadius: 520,
    /**
     * How hard the light is pulled toward the pointer, and how fast it follows.
     *
     * `pull` is under 1 on purpose: the light follows your hand rather than
     * being your hand, so the subject stays lit when the cursor is in a corner.
     * That matters more here than it did on the old screen — the light is
     * carrying the bird, and a light dragged entirely off it leaves the parrot
     * flying in the dark.
     */
    pull: 0.42,
    follow: 0.12,
    /** How fast it settles onto the subject at the very start. */
    arrive: 700,
  },

  lattice: {
    /** Spacing between nodes, in CSS pixels. */
    cell: 27,
    /**
     * The most nodes the lattice may be across, whatever the screen. The light's
     * reach is a fraction of the diagonal, so on a 4K panel the node count —
     * which goes as the *square* of it — is nine times a laptop's. The cell
     * widens past this instead, which costs nothing anybody can see.
     */
    maxSpan: 56,
    /** Arm length of each cross, as a fraction of the cell. */
    tick: 0.3,
    /**
     * Distance buckets. A stroke per tick is over a thousand rasterisation
     * calls a frame; quantising the one thing that varies between them turns
     * the frame into this many `stroke()` calls.
     */
    buckets: 8,
    /** How far the lattice slides against the pointer, as a fraction of offset. */
    parallax: 0.035,
    /**
     * The clearing the stage sits in, as a fraction of the stage's height.
     *
     * Faded out toward the stage rather than clipped at it: everything on this
     * canvas is composited additively on black, so nothing occludes anything,
     * and a hard edge here is a rectangular hole somebody punched in the
     * surface rather than a clearing the animation is happening in.
     */
    clear: 0.34,
  },

  /**
   * What the light and the columns are worth on each ground — one set per tone,
   * the way `FLIGHT.tone` holds one per tone and for the same reason.
   *
   * These are not the same numbers with a switch on top. On black the accent is
   * *added*, so a wide soft disc at 17% is a glow with a dark screen still
   * around it; on paper the identical disc is a pale cyan wash with the
   * animation floating in the middle of it. Paper takes a third of the pool and
   * gets the strength back in the engraving, which is a *mark* and reads
   * perfectly well on white.
   *
   * `pipe` and `edge` are deliberately above the game's: `FLIGHT.tone` is tuned
   * for a stage a player is looking at for a minute, where the columns must not
   * compete with the bird. These are on screen for 1.25 seconds and have to be
   * legible in that time or the bird is flying past nothing.
   */
  tone: {
    glow: { pool: 0.17, lattice: 0.45, spark: 0.5, pipe: 0.16, edge: 0.5, halo: 0.15, flash: 0.85 },
    ink: { pool: 0.06, lattice: 0.6, spark: 0.34, pipe: 0.22, edge: 0.6, halo: 0.05, flash: 0.42 },
  },

  /**
   * A tight light on whatever the subject is, under it rather than on it.
   *
   * The pool is half the screen across — it lights the *surface*, and something
   * lit only by that is a cut-out laid on a lit room. This is 70 units of soft
   * accent travelling with the bird and then the note, which is what makes them
   * sit in the picture instead of on top of it. Paper takes a third of it, for
   * the reason every alpha here is halved on paper: there is no headroom above
   * white, so the identical disc is a wash rather than a light.
   */
  halo: { radius: 70 },

  /**
   * When the Skip appears — early, and that is a correction the old screen
   * already paid for. A sequence is only skippable if there is time to see the
   * control, move to it and press it.
   */
  skip: { delay: 400 },

  /**
   * The screen leaving.
   *
   * `onComplete` fires at `delay` rather than at the end, so the page's own
   * 700ms rise starts *underneath* this and the two overlap. This ground is
   * `--bg`, the page's own ground, so an overlay fading off a page still hidden
   * fades onto a rectangle of the colour it just removed.
   */
  exit: { delay: 2600, duration: 400 },

  /** Total run time; the overlay unmounts here. */
  duration: 3000,
} as const;
