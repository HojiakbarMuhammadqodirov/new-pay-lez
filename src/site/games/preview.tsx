import { useEffect, useRef, type CSSProperties } from 'react';
import { PREVIEW, type GameId } from '../content';
import { useCopy } from '../i18n/context';
import { fill } from '../i18n/currency';
import { flagOf, type LocalCountry, type WordList } from './banks';
import { FlightPainter, previewVars } from '../flight/painter';
import { Pico } from '../pico';
import { useTheme } from '../theme/context';
import { tableSceneStyle } from './memory/table';
import { paintBakeryMiniature } from './bakery/miniature';
import { paintStallMiniature } from './stall/miniature';
import { paintFlockMiniature } from './flock/miniature';
import { paintHarbourMiniature } from './cannon/miniature';
import { paintBallMiniature } from './ball/miniature';
import { paintJumpMiniature } from './jump/miniature';
import { paintPicumaMiniature } from './picuma/miniature';
import { paintNinjaMiniature } from './ninja/miniature';
import { displayFont } from './sceneStage';
import { wordSceneStyle } from './word/desk';

/**
 * The working miniature a catalogue card plays while the pointer rests on it.
 *
 * **It is the game, not a picture of one.** Memory Match turns real cards off
 * the Kraków deck and leaves the matched pairs up. Guess the Flag shows a real
 * flag over real country names and lights the right one. Word Builder carries a
 * real word up out of its own shuffled letters. Pico is the *actual* bird —
 * the same `drawPico` the game's canvas calls, in front of a still the game's
 * own painter made of its world — flying through columns at the width, gap
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
 *     that should be its exception. It is also why the flight's miniature is
 *     not a second game loop: its world is painted *once*, a still, and Pico
 *     and the columns move on keyframes in front of it — `flight/engine.ts` is
 *     a simulation, and what a preview wants is his portrait in motion, not
 *     his physics.
 *   - **The content is real and it is fixed.** `PREVIEW` in `content.ts` and
 *     `copy.games.preview` carry it, and both say why a hover must not reach
 *     into the question banks (the general one is 220 kB) and why a preview
 *     dealing a new question every time would be a slot machine where an
 *     example is wanted.
 *   - **A miniature copies the game's own states, not a livelier version of
 *     them.** Memory Match has no flip — a card's back fades off its face and
 *     its ring lights, and that is all — so this does not flip either. A preview that invents
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
      ) : id === 'merge' ? (
        <MergePreview />
      ) : id === 'food' ? (
        <FoodPreview />
      ) : id === 'ninja' ? (
        <NinjaPreview />
      ) : id === 'snake' ? (
        <SnakePreview />
      ) : id === 'cannon' ? (
        <CannonPreview />
      ) : id === 'breakout' ? (
        <BreakoutPreview />
      ) : id === 'doodle' ? (
        <DoodlePreview />
      ) : id === 'zuma' ? (
        <ZumaPreview />
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
 * the printed back with Pico's badge, `up` shows the emoji, and `matched`
 * shows the emoji **with its Polish label** — which is the moment the game
 * exists for, so it is the moment the preview holds. Dealt on the board's own
 * table: `tableSceneStyle` hands this miniature the same `--mm-*` materials
 * the round reads, so the two cannot be drawn from different decks.
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
  const { theme } = useTheme();
  const board = [0, 1, 2, 1, 0, 2];

  return (
    <span className="pv-board" style={tableSceneStyle(theme)}>
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

/* ─────────────────────────────────────────────────────────────── 2048 ── */

/**
 * A board game's miniature, painted by the round's own painter into the card's
 * band — once, and again only when the band's size, the theme or the web font
 * changes. Both boards are still between moves, so nothing here runs per frame
 * and nothing animates on hover: a board that moved on its own would be
 * advertising a game that plays itself.
 */
function Miniature({
  paint,
}: {
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number, theme: 'dark' | 'light') => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const ctx = canvas.getContext('2d');
      /* A phone hides the band (`display: none`), which measures 0 — nothing to paint. */
      if (!ctx || !(w > 0 && h > 0)) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(ctx, w, h, theme);
    };
    /* Observing paints the first time too, once the band has a size. */
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    let live = true;
    void document.fonts?.ready.then(() => live && draw());
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [paint, theme]);
  return <canvas ref={ref} className="pv-mini" />;
}

const mergeMiniature = (ctx: CanvasRenderingContext2D, w: number, h: number, theme: 'dark' | 'light') =>
  paintBakeryMiniature(ctx, w, h, PREVIEW.merge, theme, displayFont());

/**
 * `PREVIEW.merge` on the round's own tray — the glazed tiles, the wooden frame,
 * Pico on the rim — drawn by `bakery/miniature.ts` with the scene's functions.
 */
function MergePreview() {
  return <Miniature paint={mergeMiniature} />;
}

/* ───────────────────────────────────────────────────────────── food cross ── */

const foodMiniature = (ctx: CanvasRenderingContext2D, w: number, h: number, theme: 'dark' | 'light') =>
  paintStallMiniature(ctx, w, h, PREVIEW.food, theme);

/** A still 4×4 corner of the round's crate and gingham, with its foods and Pico. */
function FoodPreview() {
  return <Miniature paint={foodMiniature} />;
}

/* ───────────────────────────────────────────────────── the arcade games ── */

/*
 * Five still frames of the five arcade games, drawn the way each game draws
 * itself: Pico's flock and a treat on the lawn, balloons over the bay above
 * the cannon, the sandcastle over Pico's surfboard, Pico climbing the jungle
 * (all four painted by their rounds' own scenes), and the chain with its four
 * marks. No motion a game does not have,
 * and nothing to read — the rule of every preview in this file.
 */

/**
 * Pico's Flock (`snake`): Pico leading his line of chicks round a corner
 * toward a cherry, on the round's own lawn — `flock/miniature.ts`, the round's
 * scene painting a fixed board.
 */
function SnakePreview() {
  return <Miniature paint={paintFlockMiniature} />;
}

const cannonMiniature = (ctx: CanvasRenderingContext2D, w: number, h: number, theme: 'dark' | 'light') =>
  paintHarbourMiniature(ctx, w, h, theme, displayFont());

/**
 * The round in one frame: the sum, three balloons coming down over the bay and
 * a ball on its way to the answer, Pico at the cannon — `cannon/miniature.ts`,
 * the round's harbour. The distractors are the round's own kind, one either
 * side of the answer, so the picture teaches the rule. The sum is the
 * banner's, set over the canvas.
 */
function CannonPreview() {
  return (
    <span className="pv-cannon">
      <Miniature paint={cannonMiniature} />
      <em>3 + 4 = ?</em>
    </span>
  );
}

/**
 * Pico's Ball: the sandcastle with a gap knocked in it and a wet block
 * cracked, the beach ball on its way up, Pico under his surfboard — painted by
 * the round's own scene (`ball/miniature.ts`).
 */
function BreakoutPreview() {
  return <Miniature paint={paintBallMiniature} />;
}

/**
 * Pico Jump: Pico on his way up off one jungle branch toward the next —
 * painted by the round's own scene (`jump/miniature.ts`).
 */
function DoodlePreview() {
  return <Miniature paint={paintJumpMiniature} />;
}

/**
 * Picuma (`zuma`): two dots in the chain on the temple's causeway and a third
 * on its way to them out of Pico's beak — painted by the round's own scene
 * (`picuma/miniature.ts`).
 */
function ZumaPreview() {
  return <Miniature paint={paintPicumaMiniature} />;
}

/* ──────────────────────────────────────────────────────────── food ninja ── */

const ninjaMiniature = (ctx: CanvasRenderingContext2D, w: number, h: number, theme: 'dark' | 'light') =>
  paintNinjaMiniature(ctx, w, h, PREVIEW.ninja, theme);

/**
 * Pico Ninja (`ninja`): three foods in the air over the night market and the
 * blade through the middle one, already in two halves with its juice flying —
 * the moment the game is about, held still, painted by the round's own scene
 * (`ninja/miniature.ts`) at the places `PREVIEW.ninja` gives.
 */
function NinjaPreview() {
  return <Miniature paint={ninjaMiniature} />;
}

/* ────────────────────────────────────────────────────────────── flight ── */

/**
 * The size the miniature's backdrop is painted at, in CSS pixels. Fixed, and
 * scaled into the band with `object-fit: cover` (bottom-anchored, so the turf
 * stays on the floor), because the band changes height on hover — its top
 * moves up when the card's head steps out — and a canvas painted to the
 * band's own box would rebuild the whole scene on every hover in and out.
 */
const STILL = { width: 540, height: 240, plane: 37 } as const;

/**
 * The flight's world, painted once — by the game's own painter, so the card
 * and the round are one picture — and then left alone. Repainted only when the
 * theme changes, and after the page has settled rather than during its first
 * render: a dozen cards mount together and only this one paints.
 */
function FlightBackdrop({ tone, accent }: { tone: 'glow' | 'ink'; accent: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const paint = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(STILL.width * dpr);
      canvas.height = Math.round(STILL.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const painter = new FlightPainter();
      painter.configure(STILL.width, STILL.height, dpr, tone, accent);
      painter.still(ctx, STILL.plane);
    };
    const idle = window.requestIdleCallback;
    if (idle) {
      const id = idle(paint, { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(paint, 200);
    return () => window.clearTimeout(id);
  }, [tone, accent]);
  return <canvas ref={ref} className="pv-scene" />;
}

/**
 * The stage: columns crossing, and Pico rising and falling between them.
 *
 * Two columns rather than the game's stream, because a preview lasts a few
 * seconds and a third would only ever be half on screen. Each is a top piece
 * and a bottom piece with the gap between them, both running past the frame so
 * only the mouth shows its capital — the same construction the canvas uses,
 * and for the same reason: a column that ends in the air floats where these
 * are meant to be cut out of the frame. They are dressed in the scene's own
 * stone and moss, carried in as custom properties (`previewVars`) because the
 * sheet may not name a scene colour; the runes on each capital are the page's
 * accent, as they are in the round.
 *
 * **He is flying it, not being carried through it.** Pico holds no altitude of
 * his own: every rise is an impulse and everything between impulses is a
 * fall, which is what the game is. See `pv-swoop` in the sheet. His wing is
 * two still frames of the real drawing — top and bottom of the stroke —
 * swapped on a `steps()` keyframe, so even the beat costs no frame loop.
 *
 * `--gap` is where the hole is, and the two differ by less than
 * `FLIGHT.pipe.maxStep` allows, so the pair is a course the generator could
 * actually have dealt.
 *
 * **The two heights and the bird's bob are one arrangement, not two.** A column
 * reaches him about three quarters of the way through its travel, and the second
 * is half a cycle ahead of the first, so he meets one of them at each end of his
 * bob — which is why the sheet times `pv-course` to the *column* cycle rather
 * than to a rhythm of its own. Get that wrong and the preview shows him flying
 * through a wall, which is the one thing the real game will not let you do.
 */
function FlightPreview() {
  const { palette } = useTheme();
  return (
    <span className="pv-sky" style={previewVars(palette.tone) as CSSProperties}>
      <FlightBackdrop tone={palette.tone} accent={palette.primary} />
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

      {/* The tap that does it. Pico does not drift — somebody is flapping him,
          and a preview that leaves that out is showing a bird on a conveyor
          belt. The ring pulses on the same clock as the impulse, so what the
          card teaches is the control: press, and he climbs. */}
      <i className="pv-tap" aria-hidden />

      {/* Two elements and two motions, composed. The wrapper flies the
          **course** — the slow drift that puts him in one gap and then the next
          — and the bird inside does the **flap**, the fast rise and the
          accelerating fall that is the actual game. One transform cannot do
          both: they have different periods, and the whole point is that the
          fast one rides on the slow one. */}
      <span className="pv-bird-path">
        <span className="pv-bird">
          <Pico pose="flap" flap={0.75} className="pv-pico pv-pico-up" />
          <Pico pose="flap" flap={0.25} className="pv-pico pv-pico-down" />
        </span>
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
 *
 * Set in the study's own materials (`wordSceneStyle`), with Pico holding the
 * clue as he does on the shelf — a still `<Pico>`, since the miniature's motion
 * is the tiles' and a second animated bird per card would be a frame loop for a
 * decoration.
 */
function WordPreview({ list }: { list: WordList }) {
  const { theme } = useTheme();
  const row = PREVIEW.word[list];
  /* The clue in the reader's language, the word in the list's. */
  const hint = useCopy().games.preview.word[list];
  const letters = [...row.word];
  const keys = [...letters.slice(2), ...letters.slice(0, 2)];

  return (
    <span className="pv-word" style={wordSceneStyle(theme)}>
      <span className="pv-say">
        <Pico size={40} />
        <span className="pv-hint">{hint}</span>
      </span>
      {/* `data-l` is the letter again, for the accent overlay that marks the
          whole row right at once (`::after` in the sheet). */}
      <span className="pv-slots">
        {letters.map((letter, i) => (
          <i key={i} data-l={letter} style={{ '--p': i } as CSSProperties}>
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
