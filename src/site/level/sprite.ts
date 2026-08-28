/**
 * The runner, as pixel art.
 *
 * Each frame is a list of equal-length strings, one per row, read as a grid —
 * which is the only sane way to author a sprite in a text file, because the
 * source *is* the picture. Edit these by looking at them; `assertFrames` below
 * fails loudly at module load if a row stops being `COLS` wide, rather than
 * letting a lopsided figure onto the page.
 *
 * He is a site engineer: hard hat with a peaked brim, face under it in shadow,
 * a hi-vis band across the chest, belt, dark trousers and boots. Deliberately
 * this codebase's own figure and not a likeness of anybody's platform mascot —
 * and deliberately *clothed*, because a single-tone silhouette at this size
 * reads as a blob. The garments are what make him a person rather than a marker.
 *
 * Five glyphs, four of which paint. They are **tones on a four-step ramp**,
 * named for the garment each mostly draws rather than reserved to it — the
 * darkest doubles as every shadow on the figure and the second-lightest as
 * every highlight, which is how a four-colour sprite gets detail without a
 * fifth colour:
 *
 *     .  nothing
 *     o  hard hat, hi-vis band, belt buckle   palette.runner.helmet
 *     +  face and hands                       palette.runner.face
 *     #  shirt and sleeves                    palette.runner.shirt
 *     -  trousers, boots, and every shadow    palette.runner.legs
 *
 * Four tones of **one hue**, and the hue is the site's accent — the same green
 * cyan the rest of the page is built from, at four lightnesses. Tones rather
 * than alphas, because alpha reverses meaning between the themes: more opaque
 * is brighter on black and darker on paper, so an alpha-built highlight becomes
 * the darkest pixel of the sprite in light mode. The four are declared per tone
 * in `config.ts` and are already the right way round in both. The ramp order is
 * the same in each — `face` lightest, then `helmet`, `shirt`, `legs` — which is
 * the property that lets `o` be a highlight and `-` a shadow in either theme.
 *
 * **One size of art, drawn at two heights.** There is no separate big sprite:
 * the mushroom scales this one up. Two hand-drawn sizes is twice the art to keep
 * in step for a figure that is fifty pixels tall, and "same person, bigger" is
 * exactly what a power-up is supposed to read as.
 *
 * **The grid is 18 × 27 and that ratio is load-bearing.** It was 12 × 18 — the
 * same 2:3 — and going up a step and a half bought room for the brim's peak, the
 * brow shadow, the hi-vis band, the buckle and an arm that bends. Keeping the
 * ratio is what makes it a free change downstream: `drawRunner` derives the cell
 * size from `frame.length` and the width from `COLS`, so the figure lands on
 * screen at exactly the size it did before, and the three block-striking peaks
 * in `LEVEL.moves` (which are `4 − runnerHeight`) still hold.
 *
 * **Nothing here is drawn at an angle, and nothing may be.** A lean is a row
 * slid a whole cell sideways, never a canvas rotation: `drawRunner` blits these
 * with `imageSmoothingEnabled = false`, and rotating the blit resamples the grid
 * into a grey fringe — which is the one thing that would stop this being pixel
 * art at all. Everything below that takes the figure off its own centre line
 * does it in whole cells, through `slide`.
 */

/** Every frame is this wide, and this tall. */
export const COLS = 18;
export const ROWS = 27;

const BLANK = '.'.repeat(COLS);

/**
 * Slide one row sideways by whole cells, keeping it `COLS` wide.
 *
 * This is how the lean and the twist are drawn — see `pose`. A cell pushed off
 * the edge is a piece of the figure that silently vanished, and it would vanish
 * on *one* frame in eight, which is the sort of thing nobody sees and everybody
 * feels, so it throws instead. That guard is what lets the swing amplitude and
 * the twist be tuned by eye: the widest frame does not have to be found by hand,
 * it announces itself.
 */
function slide(row: string, dx: number): string {
  if (dx === 0) return row;
  const lost = dx > 0 ? row.slice(COLS - dx) : row.slice(0, -dx);
  if (lost.replaceAll('.', '') !== '') {
    throw new Error(`level sprite: sliding "${row}" by ${dx} would clip "${lost}"`);
  }
  const pad = '.'.repeat(Math.abs(dx));
  return dx > 0 ? (pad + row).slice(0, COLS) : (row + pad).slice(-COLS);
}

/*
 * There is no `mirror` helper any more, and its absence is the point. The arms
 * used to be one hand-drawn torso plus its left-right flip, which bought two
 * poses out of one block and capped the swing at exactly those two; `arms`
 * below composes any pose from the phase instead, so the mirror is now just
 * "half a cycle later" and costs nothing. **The legs are still deliberately not
 * mirrored** — the reason is in the cycle at the bottom of this file, and it has
 * not changed.
 */

/*
 * ── the head ─────────────────────────────────────────────────────────────
 *
 * Nine rows of head, plus a collar that is sometimes there — see `HEAD_SUNK`.
 *
 * Two details do the work at this size. The brim is the widest thing on the
 * figure and the one edge that says "hard hat" rather than "head" — and it is
 * **longer on the right**, so the hat is peaked the way he is travelling. And
 * the row under it is solid shadow: a brim that casts nothing is a hoop, and the
 * dark band is also what lets the two eye pixels sit against a light forehead
 * instead of floating on bare face.
 *
 * The eyes are set right of centre for the same reason as the peak. He is in
 * three-quarter view — facing the camera enough to have a face, turned enough to
 * be going somewhere — which is the view that lets both arms swing visibly.
 *
 * **The whole block is authored one cell right of the hips, and that offset is
 * the lean.** A run is not upright: the head leads and the feet catch up. One
 * cell in eighteen is the smallest lean this grid can draw, and it lives here
 * rather than being applied at runtime because the head is the part furthest
 * from the pelvis and so the part a lean displaces most. The shoulders get
 * theirs from the twist below; the belt, which carries the legs, gets none.
 */
const HEAD = [
  '.......oooooo.....',
  '......oooooooo....',
  '.....oooooooooo...',
  '....ooooooooooooo.', // brim, peaked the way he is going
  '......--------....', // the shadow it casts
  '......++++++++....',
  '......+++-++-+....', // eyes, set right — he is looking where he is running
  '......-+++++++....', // the ear on the away side
  '.......+++--+.....', // jaw and mouth
];

/** The collar, and the neck between its points. */
const COLLAR = '.......##++##.....';

/** Head at full extension: the neck showing. Ten rows. */
const HEAD_TALL = [...HEAD, COLLAR];

/**
 * Head one row lower, with the neck absorbed. Ten rows, like its twin.
 *
 * **The head bob is the row count, exactly as the leg bob is.** Both variants
 * are ten rows, so `pose`'s arithmetic is untouched and the frame stays `ROWS`
 * tall; what changes is *which* row is blank. Dropping the collar and blanking
 * the top puts the whole skull a cell lower with its jaw sitting straight on the
 * shoulders, which is what a neck does under an impact — it is the thing that
 * gives. Used on contact and on the frame the weight sinks onto, where the leg
 * bob is already carrying the body down, so the head reaches its lowest a beat
 * *behind* the hips instead of riding them rigidly. That lag is most of what a
 * frozen head was missing.
 *
 * There is no taller variant and there cannot be: `HEAD_TALL` + `TORSO` +
 * `LEGS_UP` is already exactly `ROWS`, so an eleventh head row would throw.
 */
const HEAD_SUNK = [BLANK, ...HEAD];

/*
 * ── the torso ────────────────────────────────────────────────────────────
 *
 * Seven rows. Everything that is not an arm — the shoulder line, the hi-vis
 * band, the belt and its buckle — is the same in every pose and is written out
 * once, below; the arms are painted onto a copy of it.
 *
 * That is a change, and it is the one that took the robot out of the run. The
 * arms used to be three hand-drawn blocks — up, level, down — which is three
 * positions spread over an eight-frame cycle, so each hand *held* for two or
 * three frames and then jumped. Two hands ratcheting between three heights is
 * exactly what a machine's arms do. They are now an eight-position swing
 * composed from the phase, one position per frame, and the travel matters as
 * much as the count: the old span was two rows and no columns at all, and a real
 * arm goes from in front of the chest to behind the hip.
 *
 * The arms are the single biggest thing separating a run from a shuffle, and
 * they are a *counter-swing*: the arm opposite the forward leg is forward and
 * bent, the other trails. The eye reads the difference between the two hands
 * rather than either hand's absolute height, which is why the two are always
 * half a cycle apart by construction.
 *
 * A one-cell gap between sleeve and torso on every row below the shoulder is
 * what makes the arm read as a limb rather than a wide chest. The shoulder row
 * itself is solid across, which is where the limb is seen to join.
 */

/** The torso with no arms on it. `arms` paints them onto a copy. */
const TORSO = [
  '...############...', // shoulders — the row the arms are seen to join on
  '.....########.....',
  '.....oooooooo.....', // hi-vis across the chest
  '.....########.....',
  '.....########.....',
  '.....---oo---.....', // belt, and the buckle
  '.....--------.....',
];

/**
 * The last torso row is the pelvis, and it is the one thing that never twists.
 *
 * Everything above it — shoulders, chest, belt, both arms and the head — slides
 * as one body against it. The pelvis is fixed because it is what the legs are
 * drawn onto: twisting it would move the planted boot, whose column is the one
 * measurement in this file that must not drift (see the legs).
 */
const PELVIS_ROW = 6;

/** The column the left sleeve runs down. The right one is its mirror. */
const ARM_COL = 3;

/**
 * Where a hand sits at each phase of the swing, as `[column offset, row]`.
 *
 * Eight phases — one per frame of the cycle, so no frame repeats another's arms.
 * Read as a full loop and not half of one: from in front of the chest, down and
 * back past the hip, out behind, then up and forward again.
 *
 * **The offset runs +2 to −2, and its sign means "across the body".** This is a
 * three-quarter view, so a hand swinging *forward* projects as a hand crossing
 * the chest and a hand swinging *back* projects as one flaring out past the
 * shoulder — which is what a runner seen nearly head-on actually does. Positive
 * is across, negative is flared. The previous table was −1 at *both* extremes
 * and 0 between them, so the forward hand and the trailing hand landed in the
 * same column and the swing was a vertical pump with a symmetric wobble on it.
 * That wobble is what the old note about "never two columns" was really
 * objecting to: with the pair reaching outward together, the silhouette grew and
 * shrank once a stride. It does not now — the two arms are half a cycle apart,
 * so one is always across while the other is flared, and the pair *translates*
 * rather than breathing.
 *
 * **The path out sits a row lower than the path back**, which is the loop and
 * not a rounding artefact: an arm drives back with the elbow opening (hand low
 * and behind) and swings forward with it closing (hand up and in front). A
 * pendulum retracing one arc would put four of the eight frames on top of four
 * others, which is the dwell this table exists to remove.
 */
const HAND: Array<readonly [dx: number, row: number]> = [
  [2, 2], // across the chest, elbow bent — the front of the swing
  [1, 3],
  [0, 4], // passing the hip on the way back
  [-1, 5],
  [-2, 5], // flared out behind and low — the back of the swing
  [-1, 4],
  [0, 3], // passing the hip again, a row higher on the way up
  [1, 2],
];

/** Round away from zero, so a mirrored arm bends on the cell its twin bends on. */
const cell = (v: number) => Math.sign(v) * Math.round(Math.abs(v));

/**
 * The torso with both arms on it, the second half a cycle behind the first.
 *
 * The limb is walked from the shoulder to the hand a cell at a time, and the
 * column is eased (`t * t`) rather than run straight: that keeps the upper arm
 * hugging the sleeve column and throws the travel into the last cell or two,
 * which is where an elbow is. The step count is the *longer* of the two spans,
 * so every cell is orthogonally or diagonally adjacent to the one before it and
 * a hand two columns out from the shoulder is still attached to it — a detached
 * hand being the first thing that goes wrong when a swing is widened.
 *
 * The arm's length still falls out of the hand's row, which is what makes eight
 * positions read as one limb moving rather than as eight different limbs: a hand
 * low in the swing gets a long straight arm, a hand high in it a short bent one.
 */
function arms(phase: number): string[] {
  const rows = TORSO.map((row) => [...row]);

  for (const [p, flipped] of [
    [phase, false],
    [(phase + HAND.length / 2) % HAND.length, true],
  ] as const) {
    const [dx, row] = HAND[p];
    const shoulder = flipped ? COLS - 1 - ARM_COL : ARM_COL;
    const hand = flipped ? COLS - 1 - (ARM_COL + dx) : ARM_COL + dx;

    const steps = Math.max(row - 1, Math.abs(hand - shoulder));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const r = Math.round(1 + (row - 1) * t);
      const c = shoulder + cell((hand - shoulder) * t * t);
      rows[r][c] = i === steps ? '+' : '#';
    }
  }

  return rows.map((row) => row.join(''));
}

/**
 * Both arms raised — the pose every block is struck from.
 *
 * **Nothing is drawn beside the head.** Three versions got this wrong before it
 * came right, and the last two failed the same way for a reason worth writing
 * down: it is not enough for the arm to be *connected* to the shoulder, it has
 * to be *seen* to be. An arm whose whole visible length runs up the outside
 * column level with the face joins the body somewhere off at the bottom where
 * nobody is looking, and every viewer reads it as growing out of the head — no
 * matter what the pixel adjacency says.
 *
 * So the hands sit on the *first* torso row, which is already two rows below the
 * chin, and the row under them is solid all the way across. Raised, and still
 * unmistakably shoulders.
 */
const ARMS_REACHING = [
  '..+.##########.+..', // hands, on the first row below the collar and no higher
  '..##############..', // the row where the arms meet the chest
  '.....oooooooo.....',
  '.....########.....',
  '.....########.....',
  '.....---oo---.....',
  '.....--------.....',
];

/**
 * Arms on the way up: hands out level with the chest, sleeves still hanging.
 *
 * The take-off half of the jump. One row below `ARMS_REACHING` and keeping the
 * ordinary shoulder line, so the two read as one movement caught twice rather
 * than as two unrelated poses — which is the entire reason the jump is more than
 * one frame.
 */
const ARMS_RISING = [
  '...############...',
  '..+#.########.#+..',
  '.....oooooooo.....',
  '.....########.....',
  '.....########.....',
  '.....---oo---.....',
  '.....--------.....',
];

/** Arms coming down and out for the landing: hands a row lower again. */
const ARMS_SPREAD = [
  '...############...',
  '...#.########.#...',
  '..+#.oooooooo.#+..',
  '.....########.....',
  '.....########.....',
  '.....---oo---.....',
  '.....--------.....',
];

/*
 * ── the legs ─────────────────────────────────────────────────────────────
 *
 * Four poses, not two, and they are the four the animation books name: contact,
 * down, passing, up. The old cycle had contact and passing only, which is half a
 * run — the body never compressed and never extended, so it travelled along a
 * flat line with its legs swapping under it. Down and up are what put the bounce
 * in, and the bounce is most of what "running" looks like from across a room.
 *
 * **The bob is the row count.** Each block below is a different height, and
 * `pose` pads the top of the frame to make up the difference — so a short leg
 * block sits the whole figure lower in its own frame without moving his feet off
 * the floor, which is what a compressed knee does. Over the eight frames that
 * comes out 1, 2, 1, 0 — down two at the deepest, up to full height at the
 * push-off — and the head rides it a beat late (see `HEAD_SUNK`).
 *
 * The feet are always on the last row, which is the ground line. A block that
 * ends short of it is a foot in the air, and that is the only way one gets there.
 */

/**
 * Contact: the lead heel strikes, both legs open. 9 rows — mid height.
 *
 * **Symmetric about the centre line, and that is not a shortcut.** It is the one
 * pose with both feet down and the body's weight between them, so a stance drawn
 * off-centre by even a single column is a lean — and this is the frame the eye
 * rests on, arriving twice a stride. The first draft was off by one and read as
 * a limp. The lean the run *does* have is drawn above the belt for exactly this
 * reason: a leaning figure leans over its feet, it does not stand crookedly on
 * them.
 */
const LEGS_CONTACT = [
  '.....--------.....',
  '.....---..---.....',
  '.....---..---.....',
  '....---....---....',
  '....---....---....',
  '...---......---...',
  '...---......---...',
  '...---......---...',
  '..----......----..',
];

/** Down: weight over the lead leg, knee bent, back foot just off. 8 rows — lowest. */
const LEGS_DOWN = [
  '.....--------.....',
  '.....---.----.....',
  '....---..---......',
  '...---...---......',
  '..---....---......',
  '.----....---......',
  '.........---......',
  '........----......',
];

/** Passing: the free leg swings through, heel tucked up. 9 rows — mid height. */
const LEGS_PASSING = [
  '.....--------.....',
  '.....---.----.....',
  '....---..---......',
  '....---.---.......',
  '....---.---.......',
  '...----.---.......',
  '........---.......',
  '........---.......',
  '.......----.......',
];

/**
 * Up: toe-off, the free knee driving forward. 10 rows — full height.
 *
 * The planted boot is the last thing to leave, and across the four poses its
 * column walks steadily *backwards* under the body — roughly 13, 10, 8, 3 — while
 * the body itself holds still on screen. That direction is the whole difference
 * between a run and a moonwalk, and it is worth checking by eye after any edit
 * here: a pose whose planted foot lands ahead of the one before it will read as
 * the ground sliding the wrong way, however good the pose looks on its own.
 *
 * It doubles as the jump's take-off, because that is what a take-off is: the
 * run's own push-off, held.
 */
const LEGS_UP = [
  '.....--------.....',
  '.....---.----.....',
  '....---...----....',
  '....---....---....',
  '...---.....---....',
  '...---....---.....',
  '..---.....---.....',
  '..---.....----....',
  '.---..............',
  '.----.............',
];

/**
 * Legs open and trailing, for the top of the jump. 10 rows — full height.
 *
 * Symmetric, for the same reason `LEGS_CONTACT` is: the apex is where every
 * block is struck and where the arc spends its middle half, so it is the
 * airborne pose on screen the longest and any lean baked into it is a lean
 * nobody can look away from.
 */
const LEGS_AIRBORNE = [
  '.....--------.....',
  '.....---..---.....',
  '.....---..---.....',
  '....---....---....',
  '....---....---....',
  '....---....---....',
  '...---......---...',
  '...---......---...',
  '...---......---...',
  '..----......----..',
];

/**
 * Head, torso and legs stacked into one frame, blank-padded at the top to `ROWS`.
 *
 * The padding is the bob — see the legs block above — and it goes at the *top*
 * on purpose: `drawRunner` puts the last row on the ground and builds upward, so
 * padding the bottom instead would lift him off the floor rather than settle him
 * into it.
 *
 * `twist` slides everything above the pelvis by a whole cell. That is the torso
 * rotating against the hips: the shoulders lead the arm crossing the chest, the
 * belt follows, and the legs — which are what the planted boot is drawn on — do
 * not move at all. One cell is the entire budget; `slide` throws rather than
 * clipping if a wider swing ever asks for more.
 */
function pose(head: string[], torso: string[], legs: string[], twist: number): string[] {
  const body = [
    ...head.map((row) => slide(row, twist)),
    ...torso.map((row, i) => (i < PELVIS_ROW ? slide(row, twist) : row)),
    ...legs,
  ];
  const bob = ROWS - body.length;
  if (bob < 0) {
    throw new Error(`level sprite: pose is ${body.length} rows, want at most ${ROWS}`);
  }
  return [...Array.from({ length: bob }, () => BLANK), ...body];
}

/*
 * The cycle: contact, down, passing, up — the four poses of one *step*, run
 * twice, under arms that take the whole *stride* to swing across and back.
 *
 * Eight frames and not four, and not two before that. Two frames is a march,
 * because the pose snaps straight to its own mirror with nothing in between.
 * Four was a run with no vertical in it — the body travelled along a flat line
 * with its legs swapping under it. Eight is the shape the legs actually make.
 *
 * **The legs repeat every four; only the arms run the full eight.** The obvious
 * version mirrors the legs for the second half, and it is wrong in a way that is
 * easy to ship and hard to unsee: within a step the planted boot walks backwards
 * under the body — roughly column 13, 10, 8, 3 — because that is what standing
 * on something while moving past it looks like. Mirror those four and the second
 * step runs the same sweep *forwards*, so every other step is a moonwalk. Two
 * legs that cannot be told apart are the reason a side view gets away with
 * repeating them, and the arms are what say the other one is down.
 *
 * That split is also the true one. A stride is two steps, and an arm goes
 * forward once per stride — so arms at period eight over legs at period four is
 * not a compromise for the mirror's sake, it is the ratio a gait has.
 *
 * **`HAND.length` is the frame count**, and that is what killed the last of the
 * ratchet. The swing used to be four positions folded over eight frames
 * (`0,1,2,3,3,2,1,0`), and the fold meant two frames in every eight had no arm
 * movement in them at all. A dwell at the ends of a swing is real, but it
 * belongs in how long a frame is *held* — that is `LEVEL.runner.beats` — not in
 * drawing the same thing twice.
 *
 * The frame count is otherwise free to change: `drawRunner` indexes `RUN` by
 * distance travelled, so more frames make the animation smoother rather than
 * faster. Two knobs are **not** free. `LEVEL.runner.stride` is frames per tile
 * and has to scale with the count or the cadence moves; `LEVEL.runner.beats`
 * must have one entry per frame and sum to the count. Both are checked where
 * they are read, in `LevelRun.tsx`.
 */

/** The four leg poses of one step, run twice. See the note above. */
const LEGS = [LEGS_CONTACT, LEGS_DOWN, LEGS_PASSING, LEGS_UP];

/**
 * Where the neck compresses: contact, and the frame the weight sinks onto.
 *
 * Index-aligned with the frames, like everything else keyed to the cycle. Those
 * are the two the leg bob is already carrying downward, so the head reaches its
 * lowest one frame after the hips do rather than at the same instant. A head
 * pinned rigidly to the shoulders is the single most mechanical thing a run
 * cycle can do, and it is what this file did before.
 */
const CHIN_DOWN = [true, true, false, false, true, true, false, false];

export const RUN: string[][] = HAND.map(([dx], i) =>
  pose(
    CHIN_DOWN[i] ? HEAD_SUNK : HEAD_TALL,
    arms(i),
    LEGS[i % LEGS.length],
    /* The shoulders follow whichever arm is crossing the chest, so the twist is
       the swing's own sign rather than a second table that could disagree with
       it. Whole cells only: ±1 is a rotation this grid can draw, ±2 is a lurch. */
    Math.sign(dx),
  ),
);

/**
 * The jump, in three: pushing up, at the top, coming down.
 *
 * One held pose was the most visible statue on the page — the arc over the first
 * three bricks is the better part of a second and a half of screen time, and the
 * runner spent all of it in a single frame while the world scrolled past him.
 * The three are chosen by the arc's *vertical velocity* rather than by a clock
 * (`jumpFrame` in `LevelRun.tsx`), so a hop onto the platform and a full-height
 * jump at a brick both spend their middles at the apex: the pose a block is
 * struck from is still the pose held longest, which is what `LEGS_AIRBORNE`'s
 * symmetry is for.
 *
 * The legs are reused rather than redrawn, and that is the honest version rather
 * than the lazy one: a take-off *is* the run's toe-off held, and a landing *is*
 * its contact arriving early. Two more hand-drawn blocks would be two more sets
 * of boot columns to keep in step for a picture the cycle already has.
 */
export const JUMP = {
  rise: pose(HEAD_TALL, ARMS_RISING, LEGS_UP, 0),
  apex: pose(HEAD_TALL, ARMS_REACHING, LEGS_AIRBORNE, 0),
  fall: pose(HEAD_SUNK, ARMS_SPREAD, LEGS_CONTACT, 0),
};

/**
 * A ragged row is invisible until the figure is on screen and subtly wrong, so
 * it is checked once at load instead. Cheap, and it turns a typo into a stack
 * trace naming the row that has it.
 */
function assertFrames() {
  for (const frame of [...RUN, ...Object.values(JUMP)]) {
    if (frame.length !== ROWS) {
      throw new Error(`level sprite: frame is ${frame.length} rows, want ${ROWS}`);
    }
    for (const row of frame) {
      if (row.length !== COLS) {
        throw new Error(`level sprite: row "${row}" is ${row.length}, want ${COLS}`);
      }
    }
  }
}
assertFrames();
