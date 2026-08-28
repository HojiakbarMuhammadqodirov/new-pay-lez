/** One leg of the run. No `peak` means a run rather than a jump. */
export interface Move {
  /** Take-off, in tiles along the level. */
  from: number;
  /** Landing. Every move ends where the next begins. */
  to: number;
  /** Height above the ground at `from`, in tiles. */
  base: number;
  /** Height at `to`, if it differs — this is how the platform is stepped on. */
  toBase?: number;
  /** Apex above the baseline, in tiles. */
  peak?: number;
}

/** The hues one tone draws the level's objects in. See `LEVEL.palette`. */
export interface LevelPalette {
  brick: string;
  lucky: string;
  /** A lucky box that has already been opened. */
  spent: string;
  shroom: string;
  pipe: string;
  /**
   * The runner's four garments, brightest to darkest.
   *
   * Four *colours* rather than one colour at four alphas, because alpha
   * reverses meaning between the themes: more opaque is brighter on black and
   * darker on paper, so an alpha-built highlight becomes the darkest pixel of
   * the sprite in light mode. See `sprite.ts`.
   *
   * Unlike everything else in `palette`, these are **not** a hue of their own —
   * they are the page's accent at four lightnesses. The runner is the one thing
   * in the level that is the product rather than the scenery.
   */
  runner: {
    helmet: string;
    face: string;
    shirt: string;
    legs: string;
  };
}

export interface Block {
  /** Left edge, in tiles; the block is one tile wide, so its centre is `x + 0.5`. */
  x: number;
  /** Tiles above the ground. */
  y: number;
  kind: 'brick' | 'lucky';
}

/**
 * The side-scrolling level behind the signed-in Play screen.
 *
 * Distances are in **tiles** and speeds in tiles per second; the tile itself is
 * sized off the viewport at draw time. That is a deliberate departure from the
 * other 2D backdrops, which are authored in CSS pixels: this one is a *level*,
 * and a level is a grid. Authoring a jump as "six tiles long, five tiles high"
 * is the only way the arithmetic below stays checkable by eye, and it means the
 * same level plays the same shape on a phone and on a widescreen.
 *
 * The picture is the page's own promise drawn as the genre everybody already
 * knows how to read: a runner crosses a level, breaks blocks, takes a power-up
 * out of a lucky box, grows, clears two pits, and leaves down a pipe — then it
 * starts again. Play, get bigger, cash out. The blocks are the vocabulary of a
 * platformer, which is genre; the runner is this codebase's own figure rather
 * than anybody's character, which is the part that would not be.
 *
 * **This is the one backdrop that carries hues of its own** — see the `palette`
 * block. The root `CLAUDE.md` records why.
 */
export const LEVEL = {
  /* ── the world ──────────────────────────────────────────────────────── */

  /** Tile size: this fraction of the viewport height, clamped to a range. */
  tile: { of: 0.048, min: 21, max: 42 },
  /** The ground line, as a fraction of the viewport height. */
  groundY: 0.9,
  /**
   * How fast the runner crosses the level, tiles per second.
   *
   * **This is a cadence setting as much as a pacing one, and that is what got
   * it lowered from 7.5.** The run cycle is keyed to distance (`runner.stride`
   * below), so the speed and the leg speed are the same number seen twice: at
   * 7.5 the eight frames came round 2.6 times a second, which is five and a
   * quarter steps — flat-out sprint cadence on a figure that is plainly jogging
   * through the scenery. Legs moving faster than the pose set can describe is
   * most of what reads as mechanical, and no amount of extra art fixes it.
   *
   * At 5.2 the same stride length (2.8 tiles, a little under two body heights —
   * which is what a running stride is) comes out at about 3.6 steps a second.
   * That is a run. It is also a calmer backdrop, which is the right direction
   * for something that sits under a page of copy for as long as this does.
   */
  speed: 5.2,
  /**
   * Where the runner sits, as a fraction of the viewport width.
   *
   * Left of the content column on purpose. `.wrap-narrow` is a centred ~55rem
   * of glass, and a backdrop is behind it by definition — but the *action* here
   * is one figure a tile wide, and putting it dead centre means the one thing
   * worth seeing is the one thing permanently behind a card. The margins are
   * where this level is legible on a wide screen; on a phone there are no
   * margins and it plays behind the page, which is what a backdrop does.
   */
  lead: 0.15,

  /**
   * Level length in tiles. Everything below is authored in this space, and the
   * run wraps here — so the last thing in the script has to leave the screen
   * empty enough that the seam is not a cut.
   */
  length: 94,

  /**
   * Ground, as `[from, to)` spans. Everything not covered is a pit, which is
   * the whole reason the spans are the authored thing rather than the pits:
   * there is no way to write a pit that is not also a hole in the floor.
   */
  ground: [
    [0, 28],
    [32, 56],
    [60, 94],
  ] as const,

  /**
   * The floating platform. One, not a staircase: a backdrop wants a single
   * legible "he has to go up and over that" rather than a level design.
   */
  platform: { from: 41, to: 47, y: 3 },

  /**
   * The two pipes: the one he comes up out of at `at[0]` and the one he goes
   * down at `at[1]`. Two rather than one so the lap has no seam — he leaves the
   * level down a pipe and arrives out of a pipe, instead of blinking back into
   * existence mid-stride at the same screen position a second later.
   *
   * `w` is wide enough to hold a whole ascent or descent. The runner's screen
   * position never changes, so "on the pipe" means his *level* position is
   * inside `[x, x + w)` — and a descent that runs past the right edge stops
   * overlapping, loses the clip that was hiding him, and pops back into view
   * halfway underground. Three tiles covers the three-tile moves below.
   */
  pipes: { w: 3, h: 2.8, at: [1, 86] as const },

  /**
   * The blocks, `y` tiles above the ground. Three bricks and a lucky box in the
   * first half, three more bricks in the second — the second cluster is broken
   * *after* the power-up, so a bigger runner smashing the same thing is the
   * payoff for the mushroom rather than a fact stated in a caption.
   */
  blocks: [
    { x: 10, y: 4, kind: 'brick' },
    { x: 11, y: 4, kind: 'brick' },
    { x: 12, y: 4, kind: 'brick' },
    { x: 20, y: 4, kind: 'lucky' },
    { x: 66, y: 4, kind: 'brick' },
    { x: 67, y: 4, kind: 'brick' },
    { x: 68, y: 4, kind: 'brick' },
  ] as Block[],

  /** A block within this many tiles of a jump's apex is struck by it. */
  strikeRadius: 1.35,

  /* ── the run ────────────────────────────────────────────────────────── */

  /**
   * The script, in order and gapless: every move ends where the next begins, so
   * the runner's height at any point in the level is one lookup and there is no
   * state to get out of sync.
   *
   * `peak` is the apex above the baseline, in tiles; a move without one is a
   * run. `base` and `toBase` are tiles above the ground, which is how the
   * platform is stepped onto and off again.
   *
   * **A jump's apex is where its block is, in both axes.** Horizontally: 8→15
   * tops out at 11.5, the centre brick of the first three; 18→23 at 20.5, the
   * lucky box; 64→71 at 67.5, the centre of the second three.
   *
   * Vertically is the part that is easy to get wrong, and did get wrong once. A
   * `peak` is the height of the runner's **feet**, and what has to reach the
   * block is his **head** — so a block whose underside is at 4 wants a peak of
   * about `4 − runnerHeight`, which is 2.4 small and 1.6 big. Author it as the
   * block's height and he sails a body's length over the top of it, breaking
   * bricks he never touched. The pit jumps carry no such constraint and are
   * whatever clears the gap with room to look like it.
   *
   * The `-3` at each end is "gone", and it is not a round number for effect: it
   * has to clear the *big* runner's whole height. Once he is past a pipe
   * horizontally the clip reverts to the ground line, so anything shallower
   * leaves a head sliding along the floor for the rest of the lap.
   */
  moves: [
    /* Up out of the first pipe, and down off it. The mirror of the exit at the
       other end, and the reason the lap reads as continuous. */
    { from: 0, to: 1.8, base: -3 },
    { from: 1.8, to: 3.4, base: -3, toBase: 2.8 },
    { from: 3.4, to: 7, base: 2.8, toBase: 0, peak: 0.5 },
    { from: 7, to: 8, base: 0 },
    { from: 8, to: 15, base: 0, peak: 2.4 }, // breaks the first three bricks
    { from: 15, to: 18, base: 0 },
    { from: 18, to: 23, base: 0, peak: 2.4 }, // opens the lucky box
    { from: 23, to: 27, base: 0 }, // the mushroom is caught along here
    { from: 27, to: 33, base: 0, peak: 2.6 }, // over the first pit
    { from: 33, to: 38, base: 0 },
    { from: 38, to: 42, base: 0, toBase: 3, peak: 1.2 }, // up onto the platform
    { from: 42, to: 46, base: 3 },
    { from: 46, to: 50, base: 3, toBase: 0, peak: 1.2 }, // and off the end
    { from: 50, to: 55, base: 0 },
    { from: 55, to: 61, base: 0, peak: 2.8 }, // over the second pit
    { from: 61, to: 64, base: 0 },
    { from: 64, to: 71, base: 0, peak: 1.6 }, // breaks the second three, big
    { from: 71, to: 83, base: 0 },
    /*
     * Out down the pipe, which is three moves and not one.
     *
     * He hops *onto* it first — a pipe is 2.8 tiles tall and you do not walk
     * into the top of it from the floor. Then the baseline goes below the
     * mouth, and `drawRunner` clips him at the mouth while he is over the pipe,
     * so he sinks into it rather than through it. The landing at 86 is not a
     * free choice: the runner's screen position is fixed, so his *level*
     * position is the pipe's own `x`, and missing it puts him down beside it.
     */
    { from: 83, to: 86, base: 0, toBase: 2.8, peak: 1.4 },
    { from: 86, to: 87, base: 2.8 },
    { from: 87, to: 88.8, base: 2.8, toBase: -3 },
    { from: 88.8, to: 94, base: -3 }, // gone; the level runs out and wraps
  ] as Move[],

  /* ── the mushroom ───────────────────────────────────────────────────── */

  /**
   * Everything about the power-up is a function of `d`, how far the runner has
   * travelled since the box opened — no second clock, so it cannot drift out of
   * step with him.
   *
   * It outruns him for three tiles and then stops, which is why he catches it
   * at `reach`. That is backwards from the physics and right for the picture: a
   * power-up that simply sat where it spawned would be collected on the frame
   * it appeared, and nobody would see what he picked up.
   */
  mushroom: {
    /** Rises out of the box over this many tiles of `d`. */
    rise: 0.6,
    /** Then falls to the ground by this much `d`. */
    fall: 1.5,
    /**
     * Runs this far right, reached at `dash` tiles of `d`, then stops.
     *
     * The ratio is what matters: `reach / dash` is how much faster than the
     * runner it moves, and it has to be well over 1 or the two never separate
     * enough to see. At 2.2× it opens a two-and-a-half tile gap before it
     * stops, which is the whole reason there is anything to watch — and the
     * runner still catches it five tiles later, comfortably before the pit.
     */
    reach: 5.5,
    dash: 2.5,
  },

  /**
   * The runner's height in tiles, and how far he travels while growing.
   *
   * Roughly the genre's own proportions — about a tile and a half against
   * four-tile blocks — which is also the smallest he can be and still read as a
   * figure rather than a mark. Changing either height means changing the three
   * block-striking peaks in `moves`, which are `4 − height`.
   */
  runner: {
    small: 1.6,
    big: 2.4,
    grow: 1.1,
    /**
     * Run-cycle frames per tile travelled. There are eight frames, so at `speed`
     * 5.2 this is about fifteen frames a second — one full stride every 2.9
     * tiles, which is a little under two strides and so three and a half steps
     * a second. A jog. Tied to *distance* and not to a clock, so he cannot
     * moonwalk: the feet always move the same amount as the ground under them.
     *
     * It doubled when the cycle went from four frames to eight, and that is the
     * only reason it moved: the *cadence* is unchanged, and adding frames to a
     * distance-keyed cycle without rescaling this would have run him at twice
     * the leg speed over the same ground.
     */
    stride: 2.8,
    /**
     * How long each frame of the cycle is held, in frame-widths. One entry per
     * frame, and they **sum to the frame count** — checked at load in
     * `LevelRun.tsx`, because a table that sums to anything else silently
     * rescales the cadence `stride` was set to produce.
     *
     * A gait is not a metronome, and dividing the cycle evenly is most of what
     * was left of the robot after the poses were fixed. A running leg spends
     * longer bearing weight than it does in the air: contact and down are the
     * foot planted and the knee absorbing, up and passing are the push-off and
     * the flight. Holding the first pair and hurrying the second is the
     * difference between a figure whose feet *land* and one whose legs revolve.
     *
     * The four values run in the order the poses do — contact, down, passing,
     * up — and repeat for the second step, because the legs do (see `sprite.ts`).
     * The arms are on the eight-frame period and ride the same table, which is
     * right: a hand slows at the ends of its swing, and the ends of the swing
     * are where the planted foot is.
     */
    beats: [1.3, 1.3, 0.7, 0.7, 1.3, 1.3, 0.7, 0.7],
  },

  /** Shards thrown off a broken block: how many, how fast, how long they live. */
  debris: { count: 5, speed: 5.5, gravity: 26, life: 0.85 },

  /* ── the sky ────────────────────────────────────────────────────────── */

  /** Clouds and hills, drawn at a fraction of the camera's speed for depth. */
  parallax: { cloud: 0.3, hill: 0.55 },
  clouds: [
    { x: 6, y: 10.5, r: 1.5 },
    { x: 23, y: 12.5, r: 1.1 },
    { x: 38, y: 9.5, r: 1.8 },
    { x: 57, y: 12, r: 1.3 },
    { x: 74, y: 10, r: 1.6 },
  ] as const,
  hills: [
    { x: 8, r: 5.5 },
    { x: 30, r: 4 },
    { x: 52, r: 6 },
    { x: 76, r: 4.5 },
  ] as const,

  /* ── colour ─────────────────────────────────────────────────────────── */

  /**
   * The hues, and the one place in this codebase outside the flag font and the
   * controller's face buttons that carries any.
   *
   * They are the Play mock's own — `b2b/Paylez Play.dc.html` gives each game a
   * colour, and these are those colours doing the same job one layer down: a
   * brick has to not be a lucky box, and on a two-colour page the only thing
   * left to tell them apart with is a label, which a backdrop cannot have.
   *
   * The `ink` row is the same five hues taken down to where they read on paper.
   * They are not the light theme's accent ramp and must not be used as it — the
   * page's own accent still comes from `primaryColor`, which is what the ground
   * is drawn in, so the level sits *inside* the palette rather than beside it.
   */
  palette: {
    glow: {
      brick: '#ff7e6b',
      lucky: '#ffc65c',
      spent: '#8a7340',
      shroom: '#c6f35e',
      pipe: '#6fb4ff',
      /* The dark theme's accent, `#58e9d4`, plus a lift and two drops. */
      runner: {
        helmet: '#9df3e4',
        face: '#e6fffb',
        shirt: '#58e9d4',
        legs: '#1d7268',
      },
    },
    ink: {
      brick: '#c2402c',
      lucky: '#a87400',
      spent: '#8d7d5a',
      shroom: '#5f7d10',
      pipe: '#2a6fc4',
      /*
       * The light theme's accent, `#089b99`, and its ramp runs the *other* way
       * for the face: a pale face is invisible on paper, so the lightest tone
       * here is a mid teal rather than a near-white.
       */
      runner: {
        helmet: '#0bb3ae',
        face: '#43c4b8',
        shirt: '#067370',
        legs: '#02332f',
      },
    },
  } as Record<'glow' | 'ink', LevelPalette>,

  /**
   * Alpha budget per tone.
   *
   * Higher than every other backdrop here, and that is the point rather than an
   * oversight: the others are textures you are not meant to look at, and this
   * one has to be *readable as a level* or it is a smear of coloured rectangles.
   * The ceiling is still the page's copy — every card above it is `--glass` over
   * this, and the ground band sits under the footer rather than under the game
   * cards, which is why `groundY` is as low as it is.
   *
   * `runner` is far and away the highest, and it has to be. He is thirty pixels
   * wide, he is the only thing on this backdrop anybody is meant to *watch*, and
   * he is drawn in the page's own accent — at the scenery's alpha that accent
   * dilutes to a grey-green smudge and the whole level loses its protagonist.
   * He is also the one element that never sits under a card: `lead` keeps him in
   * the margin.
   */
  tone: {
    glow: { terrain: 0.19, item: 0.4, runner: 0.78, sky: 0.075 },
    ink: { terrain: 0.15, item: 0.3, runner: 0.62, sky: 0.07 },
  },
} as const;
