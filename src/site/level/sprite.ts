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
 */

/** Every frame is this wide, and this tall. */
export const COLS = 18;
export const ROWS = 27;

const BLANK = '.'.repeat(COLS);

/**
 * A block flipped left-to-right.
 *
 * Used for the arms and nothing else. Flipping a torso swaps which arm is up and
 * leaves the shoulder line, the belt, the buckle and the hi-vis band exactly
 * where they were, because all four are symmetric on purpose — so the swing
 * costs one call instead of a second seven-row block that can drift out of step
 * with the first.
 *
 * **The legs are deliberately not mirrored**, and the reason is in the cycle at
 * the bottom of this file.
 */
const mirror = (block: string[]) => block.map((row) => [...row].reverse().join(''));

/*
 * ── the head ─────────────────────────────────────────────────────────────
 *
 * Ten rows, and the same ten in every frame: nothing above the collar moves, so
 * the poses cannot drift apart at the one place a viewer is actually looking.
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
 */
const HEAD = [
  '......oooooo......',
  '.....oooooooo.....',
  '....oooooooooo....',
  '...ooooooooooooo..', // brim, peaked the way he is going
  '.....--------.....', // the shadow it casts
  '.....++++++++.....',
  '.....+++-++-+.....', // eyes, set right — he is looking where he is running
  '.....-+++++++.....', // the ear on the away side
  '......+++--+......', // jaw and mouth
  '......##++##......', // collar, and the neck between its points
];

/*
 * ── the torso ────────────────────────────────────────────────────────────
 *
 * Seven rows, in three versions that differ **only in the arms**. Everything
 * else — the shoulder line, the hi-vis band, the belt and its buckle — is
 * identical in all three and is written out in each rather than spliced in,
 * because a torso you can read top to bottom is the whole reason these are
 * strings.
 *
 * The arms are the single biggest thing separating a run from a shuffle, and
 * they are drawn as a *counter-swing*: the arm opposite the forward leg comes up
 * and bends, the other hangs. Three positions is enough to carry it — up, level,
 * down — because the eye reads the difference between the two hands rather than
 * either hand's absolute height.
 *
 * A one-cell gap between sleeve and torso on every row below the shoulder is
 * what makes the arm read as a limb rather than a wide chest. The shoulder row
 * itself is solid across, which is where the limb is seen to join.
 */

/**
 * Left arm up and bent, right arm hanging: pairs with the right leg forward.
 *
 * The raised hand overhangs the shoulder line by exactly one column. Two looked
 * better on a still frame and was wrong in motion — the silhouette then grew a
 * column on alternate sides every stride, and a figure that changes width as it
 * runs reads as wobbling rather than swinging. The swing has to be carried by
 * the *height* of the two hands, which are two rows apart here and level in
 * `ARMS_LEVEL`.
 */
const ARMS_LEFT_UP = [
  '...############...', // shoulders — the row the arms are seen to join on
  '...#.########.#...',
  '..+#.oooooooo.#...', // left hand up; hi-vis across the chest
  '.....########.#...',
  '.....########.+...', // right hand, hanging low
  '.....---oo---.....', // belt, and the buckle
  '.....--------.....',
];

/** Both hands level, the passing pose halfway between the two swings. */
const ARMS_LEVEL = [
  '...############...',
  '...#.########.#...',
  '...#.oooooooo.#...',
  '...+.########.+...',
  '.....########.....',
  '.....---oo---.....',
  '.....--------.....',
];

/** The mirror: right arm up, left hanging. Pairs with the left leg forward. */
const ARMS_RIGHT_UP = mirror(ARMS_LEFT_UP);

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
 * push-off — and the head rides it.
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
 * a limp.
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
 * Legs open and trailing, for the airborne frame. 10 rows — full height.
 *
 * Symmetric, for the same reason `LEGS_CONTACT` is: a jump is struck at the apex
 * and held there for the length of the arc, so this is the pose on screen the
 * longest and any lean baked into it is a lean nobody can look away from.
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
 */
function pose(torso: string[], legs: string[]): string[] {
  const body = [...HEAD, ...torso, ...legs];
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
 * None of it costs anything to play: `drawRunner` indexes `RUN` by distance
 * travelled, so adding frames makes the animation smoother rather than faster.
 * The one knob that had to move is `LEVEL.runner.stride` — frames per tile,
 * doubled with the frame count to leave the cadence exactly where it was.
 */
export const RUN: string[][] = [
  pose(ARMS_LEFT_UP, LEGS_CONTACT),
  pose(ARMS_LEFT_UP, LEGS_DOWN),
  pose(ARMS_LEVEL, LEGS_PASSING),
  pose(ARMS_RIGHT_UP, LEGS_UP),
  pose(ARMS_RIGHT_UP, LEGS_CONTACT),
  pose(ARMS_RIGHT_UP, LEGS_DOWN),
  pose(ARMS_LEVEL, LEGS_PASSING),
  pose(ARMS_LEFT_UP, LEGS_UP),
];

export const JUMP: string[] = pose(ARMS_REACHING, LEGS_AIRBORNE);

/**
 * A ragged row is invisible until the figure is on screen and subtly wrong, so
 * it is checked once at load instead. Cheap, and it turns a typo into a stack
 * trace naming the row that has it.
 */
function assertFrames() {
  for (const frame of [...RUN, JUMP]) {
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
