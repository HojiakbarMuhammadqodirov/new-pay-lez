---
paths:
  - "src/site/level/**"
---

# The L-Earn platformer (`level/`)

Moved out of the root `CLAUDE.md`; loads when you work on the files above.

- **The runner is a sprite, and sprites are authored as text.** `level/sprite.ts`
  holds each frame as rows of `.o+#-` on an 18 × 27 grid — the source *is* the
  picture, so you edit it by looking at it, and a frame that stops being
  `COLS × ROWS` throws at module load rather than drawing a quietly lopsided
  figure. It has already caught one. He was a stroked stick figure first and that
  was wrong the way a vector logo is wrong on a games console: everything around
  him is cells on a grid, and the one smooth-curved thing in the frame read as a
  different picture pasted on top. Eight things there are not free:
  - **Shading is four colours at one alpha**, never one colour at four alphas.
    Alpha means "brighter" on black and "darker" on paper, so an alpha-built
    highlight inverts in light mode. The four are a *ramp*, not four garments:
    the darkest doubles as every shadow on the figure and the second-lightest as
    every highlight, and that is how the brow shadow, the hi-vis band and the
    belt buckle exist without a fifth colour.
  - **Each frame is stamped into a tiny offscreen canvas and blitted** with
    `imageSmoothingEnabled = false`. Painting the cells straight onto the page
    double-blends every overlap and draws a bright grid over the figure.
  - **The run is eight frames** — contact, down, passing, up, twice over. Two
    frames is a march. Four was the next wrong answer: contact and passing only
    is a run with no vertical in it, so the body travels along a flat line with
    its legs swapping under it. Down and up are what put the bounce in.
  - **The eight are not equal lengths, and the jump is not one frame.**
    `LEVEL.runner.beats` holds each frame for a share of the cycle — stance
    (contact, down) roughly twice as long as flight (passing, up) — and must have
    one entry per frame summing to the frame count, checked at load, or `stride`
    stops meaning frames per tile. Dividing a gait evenly is a metronome. The
    jump is `JUMP.rise` / `apex` / `fall`, picked off the arc's vertical velocity
    rather than off `t`, because the moves that land higher than they leave are
    still climbing at the end.
  - **The bob is the row count, not an offset.** Each leg block is a different
    height and `pose` pads the top of the frame to `ROWS`, so a shorter block
    settles the whole figure without lifting his feet off the floor — which is
    what a bent knee does. The pad goes at the *top* because `drawRunner` puts
    the last row on the ground and builds upward. The head bobs the same way and
    for the same reason: `HEAD_SUNK` is the same ten rows with the *neck* blanked
    instead of the crown, so the skull drops a cell on contact without changing
    the frame's height.
  - **The lean and the twist are whole-cell slides, never a rotation.** The head
    is authored one column forward of the hips (that is the lean) and everything
    above the pelvis slides ±1 with the arm crossing the chest (that is the
    twist); the pelvis and the legs never move, because they carry the planted
    boot. A canvas rotate would resample the grid past
    `imageSmoothingEnabled = false` and stop this being pixel art. `slide` throws
    rather than clipping a cell off the edge.
  - **The legs repeat every four frames; only the arms run all eight.** Mirroring
    the legs for the second half is the obvious version and it moonwalks: within
    a step the planted boot walks *backwards* under the body, and a mirror runs
    that sweep forwards on alternate steps. It is also the truer ratio — a stride
    is two steps and an arm goes forward once per stride. The two poses that
    *are* mirror-symmetric, contact and airborne, are drawn symmetric on purpose:
    both are frames the eye rests on, and one column off centre is a lean.
  - **One size of art, drawn at two heights.** The mushroom scales him. Two
    hand-drawn sizes is twice the art to keep in step for a figure fifty pixels
    tall, and "same person, bigger" is what a power-up should read as. The grid's
    2:3 ratio is what makes a resolution change free — `drawRunner` derives the
    cell size from `frame.length` and the width from `COLS`, so he lands on
    screen at the same size and the block-striking peaks in `LEVEL.moves` still
    hold. Changing the *frame count* is not free: `LEVEL.runner.stride` is frames
    per tile and has to scale with it or the cadence moves, and `beats` needs one
    entry per frame.
- **The level is scripted, not simulated, and that is not laziness.**
  `LEVEL.moves` is a gapless list of parabolas and the runner's height is a
  lookup into it. There is no gravity, no collision and no fail state, because a
  simulated runner on a backdrop is one who eventually falls in a pit at 3am and
  lies there until somebody reloads the page. Every jump clears every pit
  because the jump *is* the level. The corollary is that the two are authored
  together: a block moved without moving the jump that strikes it is a runner
  sailing through it with nothing happening, and a `peak` is the height of his
  **feet** while what has to reach the block is his **head**. Both of those have
  already been wrong once; `config.ts` says so at the point of use.
