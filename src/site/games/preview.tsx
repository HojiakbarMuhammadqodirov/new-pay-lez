import type { CSSProperties } from 'react';
import { PREVIEW, type GameId } from '../content';
import { useCopy } from '../i18n/context';
import { fill } from '../i18n/currency';
import { flagOf, type LocalCountry, type WordList } from './banks';
import { PARROT_PARTS, WING, type ParrotPart } from '../flight/parrot';

/**
 * The working miniature a catalogue card plays while the pointer rests on it.
 *
 * **It is the game, not a picture of one.** Memory Match turns real cards off
 * the Kraków deck and leaves the matched pairs up. Guess the Flag shows a real
 * flag over real country names and lights the right one. Word Builder carries a
 * real word up out of its own shuffled letters. Squawk is the *actual* sprite —
 * the same `PARROT_PARTS` table the game's canvas draws, read into SVG rects
 * instead of into `roundRect` calls — flying through columns at the width, gap
 * and cap `FLIGHT.pipe` specifies.
 *
 * The version before this drew abstract shapes: bars for answers, a striped
 * rectangle for a flag, tiles with nothing on them. It did the job the card
 * textures before it had done — six cards stopped looking like one card six
 * times — and no more than that. A card offering a quiz and drawing four grey
 * bars is advertising the wrong product, and a player deciding what to spend a
 * round on is exactly who is looking at it.
 *
 * Four rules hold across all of them.
 *
 *   - **Nothing animates until the card is hovered**, and nothing here runs
 *     through React. Every loop is CSS with `animation-play-state: paused` at
 *     rest, so eight mounted previews cost eight static layouts and no frames.
 *     The root `CLAUDE.md` names per-frame work through React state as the
 *     load-bearing rule of the codebase, and a decoration is the last thing
 *     that should be its exception. It is also why Squawk is SVG rather than a
 *     second canvas: `flight/engine.ts` is a simulation with a game loop, and
 *     what a preview wants is his portrait in motion, not his physics.
 *   - **The content is real and it is fixed.** `PREVIEW` in `content.ts` and
 *     `copy.games.preview` carry it, and both say why a hover must not reach
 *     into the question banks (the general one is 220 kB) and why a preview
 *     dealing a new question every time would be a slot machine where an
 *     example is wanted.
 *   - **A miniature copies the game's own states, not a livelier version of
 *     them.** Memory Match has no flip — a card changes its border and its fill
 *     and that is all — so this does not flip either. A preview that invents
 *     motion the game does not have is back to advertising the wrong product,
 *     one step subtler.
 *   - **It is `aria-hidden` and carries no text of its own.** Everything
 *     readable in here is a string the game itself would show, so there is
 *     nothing extra to translate and nothing for a screen reader to read twice.
 */
export function GamePreview({
  id,
  list,
  country,
}: {
  id: GameId;
  list: WordList;
  /** Which local bank this player's profile selects — see `quizBankFor`. */
  country: LocalCountry;
}) {
  return (
    <span className="play-prev" data-prev={id} aria-hidden>
      {id === 'memory' ? (
        <MemoryPreview />
      ) : id === 'flight' ? (
        <FlightPreview />
      ) : id === 'flag' ? (
        <FlagPreview />
      ) : id === 'word' || id === 'wordLocal' ? (
        <WordPreview list={id === 'wordLocal' ? list : 'en'} />
      ) : (
        <QuizPreview id={id} country={country} />
      )}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────── memory ── */

/**
 * Six cards, three pairs, turned a pair at a time and left face up.
 *
 * The three states are the board's own (`data-face` on `.mm-card`): `down` is
 * an empty card with a small square on it, `up` shows the emoji, and `matched`
 * shows the emoji **with its Polish label** — which is the moment the game
 * exists for, so it is the moment the preview holds.
 *
 * The order is fixed and deliberately not adjacent: `[0, 1, 2, 1, 0, 2]` puts
 * each pair a row apart, which is what makes the reveal read as *remembering*
 * rather than as a row lighting up. A shuffled order would also be a different
 * board on every render, and this element re-renders whenever the energy tank
 * ticks a minute on.
 *
 * `data-pair` is what times it. Matched pairs stay up until the loop restarts,
 * because that is the real board's rule — see the note on
 * `.mm-card[data-face='matched']` in the sheet, which keeps them for the same
 * reason.
 */
function MemoryPreview() {
  const board = [0, 1, 2, 1, 0, 2];

  return (
    <span className="pv-board">
      {board.map((pair, i) => {
        const card = PREVIEW.memory[pair];
        return (
          <span className="pv-card" key={i} data-pair={pair}>
            <i className="pv-back" />
            <b>{card.icon}</b>
            <em>{card.label}</em>
          </span>
        );
      })}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────── flight ── */

/** The game's own clamp: a radius never exceeds half the shorter side. */
const radiusOf = (part: ParrotPart) => Math.min(part.r, part.w / 2, part.h / 2);

const Rect = ({ part, className }: { part: ParrotPart; className: string }) => (
  <rect
    x={part.x}
    y={part.y}
    width={part.w}
    height={part.h}
    rx={radiusOf(part)}
    className={className}
  />
);

/**
 * Squawk, off the same table the game's canvas draws him from.
 *
 * `PARROT_PARTS` is eleven rounded rectangles in a unit square, which is a
 * `roundRect` on one side and an `<rect rx>` on the other — the same eleven
 * rows either way, so the bird in the preview cannot become a different bird
 * from the one in the round. `WING` is one rect pivoted about a shoulder and
 * drawn after index `WING.after`, which is exactly where it goes here.
 *
 * **The pivot is derived, not measured.** `transform-box: fill-box` puts the
 * origin inside the wing's own box, so the shoulder is a percentage of that
 * box — and the shoulder happens to lie inside it, which is what makes this
 * work at all. Both are computed from `WING` so a tuning change moves the
 * preview with the game. The two frame angles ride along as custom properties
 * for the same reason; the sheet only swings between them.
 *
 * The `viewBox` is the unit square plus the room the crest and the tail take
 * outside it — the parts run x `-0.28…1.08` and y `-0.22…0.92`, so a `0 0 1 1`
 * box would cut off his head.
 */
function Squawk() {
  const wing = {
    '--wing-x': `${((WING.pivot.x - WING.rect.x) / WING.rect.w) * 100}%`,
    '--wing-y': `${((WING.pivot.y - WING.rect.y) / WING.rect.h) * 100}%`,
    '--wing-up': `${(WING.frames[0] * 180) / Math.PI}deg`,
    '--wing-down': `${(WING.frames[1] * 180) / Math.PI}deg`,
  } as CSSProperties;

  return (
    <svg className="pv-bird" viewBox="-0.32 -0.26 1.44 1.24" focusable="false">
      {PARROT_PARTS.slice(0, WING.after + 1).map((part, i) => (
        <Rect key={i} part={part} className={`pv-p-${part.style}`} />
      ))}
      {/* Its own colour, and not one of `PART_STYLES`: the skin has a fifth
          slot for the wing, and the game applies it outside the style table. */}
      <rect
        className="pv-wing"
        x={WING.rect.x}
        y={WING.rect.y}
        width={WING.rect.w}
        height={WING.rect.h}
        rx={WING.rect.r}
        style={wing}
      />
      {PARROT_PARTS.slice(WING.after + 1).map((part, i) => (
        <Rect key={i} part={part} className={`pv-p-${part.style}`} />
      ))}
    </svg>
  );
}

/**
 * The stage: columns crossing, and Squawk rising and falling between them.
 *
 * Two columns rather than the game's stream, because a preview lasts a few
 * seconds and a third would only ever be half on screen. Each is a top piece
 * and a bottom piece with the gap between them, both running past the frame so
 * only the mouth shows a rounded end — the same construction the canvas uses,
 * and for the same reason: a column with four rounded corners floats where
 * these are meant to be cut out of the frame.
 *
 * **He is flying it, not being carried through it.** The bird holds no altitude
 * of his own: every rise is an impulse and everything between impulses is a
 * fall, which is what the game is and what the smooth sine wave here before was
 * not. See `pv-flap` in the sheet.
 *
 * `--gap` is where the hole is, and the two differ by less than
 * `FLIGHT.pipe.maxStep` allows, so the pair is a course the generator could
 * actually have dealt.
 *
 * **The two heights and the bird's bob are one arrangement, not two.** A column
 * reaches him about three quarters of the way through its travel, and the second
 * is half a cycle ahead of the first, so he meets one of them at each end of his
 * bob — which is why the sheet times `pv-bob` to the *column* cycle rather than
 * to a rhythm of its own. Get that wrong and the preview shows him flying
 * through a wall, which is the one thing the real game will not let you do.
 */
function FlightPreview() {
  return (
    <span className="pv-sky">
      {[
        { p: 0, gap: 40 },
        { p: 1, gap: 60 },
      ].map((column) => (
        <span
          className="pv-col"
          key={column.p}
          style={{ '--p': column.p, '--gap': `${column.gap}%` } as CSSProperties}
        >
          <i className="pv-col-top" />
          <i className="pv-col-low" />
        </span>
      ))}

      {/* The tap that does it. Squawk does not drift — somebody is flapping him,
          and a preview that leaves that out is showing a bird on a conveyor
          belt. The ring pulses on the same clock as the impulse, so what the
          card teaches is the control: press, and he climbs. */}
      <i className="pv-tap" aria-hidden />

      {/* Two elements and two motions, composed. The wrapper flies the
          **course** — the slow drift that puts him in one gap and then the next
          — and the sprite inside does the **flap**, the fast rise and the
          accelerating fall that is the actual game. One transform cannot do
          both: they have different periods, and the whole point is that the
          fast one rides on the slow one. */}
      <span className="pv-bird-path">
        <Squawk />
      </span>
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────── flag ── */

/**
 * A real flag and three real countries, with the right one lighting.
 *
 * The one preview with no prompt line: "Which country is this?" printed over a
 * flag is a caption on a picture that has already asked the question, and the
 * room it costs is the room the three answers need.
 */
function FlagPreview() {
  const preview = useCopy().games.preview;

  return (
    <span className="pv-quiz" data-flag="true">
      <b className="pv-flag">{flagOf(PREVIEW.flagCode)}</b>
      <Options options={preview.flag} />
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────── quiz ── */

/**
 * The three question rounds: a prompt, then three answers.
 *
 * The capital round asks with the game's **own** prompt — `whichCapital` is
 * what a real round puts at the top of the screen, so the preview asks the same
 * sentence and cannot drift into asking something the game does not.
 */
function QuizPreview({ id, country }: { id: GameId; country: LocalCountry }) {
  const games = useCopy().games;
  const preview = games.preview;

  /* The local card previews **the bank it will actually deal**, which is the
     same rule the local Word Builder follows: a card that offered a question
     about Poland and then dealt one about Uzbekistan would be the abstract
     shapes all over again, one step subtler. */
  const local = preview.local[country];

  const ask =
    id === 'capital'
      ? fill(games.whichCapital, { country: preview.capital.country })
      : id === 'local'
        ? local.q
        : preview.brain.q;

  const options =
    id === 'capital'
      ? preview.capital.options
      : id === 'local'
        ? local.options
        : preview.brain.options;

  return (
    <span className="pv-quiz">
      <span className="pv-ask">{ask}</span>
      <Options options={options} />
    </span>
  );
}

/**
 * The answer chips, in the round's own two states.
 *
 * Right is the accent fill and wrong is the accent *removed* — no tint, ink at
 * half strength, struck through. That is `.round-option`'s pair verbatim, and
 * it is the only honest one on a site with a single hue: the answer lights up
 * and the mistake goes quiet.
 *
 * `options[0]` is the right one everywhere in `copy.games.preview` — the
 * dictionaries say so and a translation has to keep the order — so `data-right`
 * is positional rather than a second field to keep in step.
 */
function Options({ options }: { options: readonly string[] }) {
  return (
    <span className="pv-opts">
      {options.map((option, i) => (
        <i
          key={option}
          data-right={i === 0 ? 'true' : undefined}
          style={{ '--p': i } as CSSProperties}
        >
          {option}
        </i>
      ))}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────── word ── */

/**
 * A real word going up into its slots, out of its own shuffled letters.
 *
 * The tray holds **exactly the word's letters and no decoys**, which is the
 * real game's rule — tile count always equals slot count — and a spent tile
 * keeps its place at low contrast rather than closing the gap, which is also
 * the real game's rule and for the reason its own comment gives: the tray is a
 * layout the player is reading.
 *
 * Shuffled by a fixed rotation rather than randomly. `Math.random` here would
 * deal a different jumble on every re-render, and this element re-renders on
 * the energy tick — the board would rearrange itself while nobody was looking
 * at it.
 *
 * Which list is previewed follows the card: the English Word Builder shows an
 * English word and the local one shows the language of the city on the profile,
 * because a card should preview the round it is actually going to deal.
 */
function WordPreview({ list }: { list: WordList }) {
  const row = PREVIEW.word[list];
  const letters = [...row.word];
  const keys = [...letters.slice(2), ...letters.slice(0, 2)];

  return (
    <span className="pv-word">
      <span className="pv-hint">{row.hint}</span>
      <span className="pv-slots">
        {letters.map((letter, i) => (
          <i key={i} style={{ '--p': i } as CSSProperties}>
            {letter}
          </i>
        ))}
      </span>
      {/* `--of` is which slot this tile fills, so a key dims on the beat its own
          letter lands rather than on its place in the tray. */}
      <span className="pv-keys">
        {keys.map((letter, i) => (
          <i
            key={i}
            style={{ '--p': i, '--of': (i + 2) % letters.length } as CSSProperties}
          >
            {letter}
          </i>
        ))}
      </span>
    </span>
  );
}
