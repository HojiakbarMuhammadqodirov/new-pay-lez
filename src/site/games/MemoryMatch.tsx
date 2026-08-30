import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useCopy } from '../i18n/context';
import { fill } from '../i18n/currency';
import { memoryPoints } from '../auth/player';
import { today } from '../auth/player';
import { buildMemoryBoard, type MemoryCard } from './rounds';

/**
 * Memory Match.
 *
 * Twelve cards, six pairs, and the only round on the page with no countdown and
 * no way to lose. It is **timed**, which is not the same thing: `memoryPoints`
 * in `auth/player.ts` reads the elapsed seconds into one of four bands.
 * Nothing ends and the slowest band still pays, so the accessibility decision
 * survives intact — it was never about being untimed: this is still the game a
 * non-native reader or an older player wins by being careful, and being careful
 * is what being quick at it *is*.
 *
 * **The clock is on screen, and it counts up.** It was hidden on the argument
 * that a reading nobody is shown should not cost a re-render, which answered the
 * wrong question: the elapsed time is the only input to what this round pays,
 * and a player who cannot see it is being scored on something the screen refuses
 * to tell them. A countdown would be the other mistake — it would put a deadline
 * on a board that has none. What is drawn is a stopwatch: it never runs out, it
 * just costs. `Stopwatch` below owns its own tick so the twelve cards do not
 * re-render with it.
 *
 * What changed is that the round stopped paying a guaranteed 36 for six pairs
 * that cannot be lost — the richest round on the page for the least asked of
 * anybody. It was scored on the move count, which a player turning cards at
 * random spends just as freely; time is the measure of the thing actually being
 * tested, because remembering where a card was is what makes you fast.
 *
 * The L-Earn payload is the label revealed on a match: the deck is a themed set
 * of Kraków landmarks, Polish food, transport or everyday words, so matching two
 * cards teaches the word for what is on them. The deck rotates with the day (see
 * `buildMemoryBoard`), which is what makes five decks into a week of themes.
 *
 * The icons are emoji, and the supplied spec is explicit that they are a
 * placeholder for commissioned illustrations. They are also the reason this
 * component does not violate the two-colour rule: an emoji is the same sanctioned
 * exception a flag is.
 */

/** How long a mismatched pair stays face-up before flipping back. */
const FLIP_BACK_MS = 850;
/** The beat between the second card turning over and a match locking. */
const MATCH_MS = 420;

type Face = 'down' | 'up' | 'matched';

export function MemoryMatch({
  pairs,
  onDone,
  onQuit,
}: {
  pairs: number;
  /** Points earned, pairs found, and whether the board was cleared. */
  onDone: (points: number, found: number, won: boolean) => void;
  onQuit: () => void;
}) {
  const copy = useCopy().games;
  const [cards, setCards] = useState<MemoryCard[] | null>(null);
  const [faces, setFaces] = useState<Face[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [found, setFound] = useState(0);
  const [moves, setMoves] = useState(0);
  const [busy, setBusy] = useState(false);
  /** The label to show under the board, held for a beat after a match. */
  const [learned, setLearned] = useState<MemoryCard | null>(null);

  /* Every pending flip-back, so quitting mid-beat cannot land a `setState` on an
     unmounted board. One ref rather than one timer id: two can be in flight when
     a match and a mismatch overlap. */
  const timers = useRef<number[]>([]);
  useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id);
    },
    [],
  );

  /* `onQuit` is an inline arrow at the call site, so putting it in the dep array
     below would rebuild the board on every render of the page — a new shuffle
     mid-game. Latched in a ref instead: the build reads whatever the current one
     is without depending on its identity. */
  const quit = useRef(onQuit);
  quit.current = onQuit;

  useEffect(() => {
    let live = true;
    buildMemoryBoard(pairs, today())
      .then((board) => {
        if (!live) return;
        setCards(board.cards);
        setFaces(board.cards.map(() => 'down'));
      })
      .catch(() => {
        /* `decks.json` is code-split and fetched on first play, so it can fail:
           a tab that dropped offline for a second, a deploy that moved the
           chunk. `cards` then stays null, the panel below says "Loading…" for
           the rest of the tab's life, and the rejection surfaces as an unhandled
           one in the console. Hand the player back to the cards instead — the
           same answer `games.tsx` gives the quiz path for the same failure, and
           the screen the button that retries it is on. */
        if (live) quit.current();
      });
    return () => {
      live = false;
    };
  }, [pairs]);

  /*
   * When the first card was turned over.
   *
   * **Still a ref, now that the clock is drawn.** This is the reading that
   * *scores* — it is what `memoryPoints` is handed when the board clears — and it
   * has to be exact and must not cause a render. The visible stopwatch reads the
   * same ref through `Stopwatch`, which keeps its own tick to itself: one small
   * component re-renders four times a second, and the twelve cards do not. That
   * is the whole of the arrangement the root `CLAUDE.md` asks for, rather than
   * the "no clock at all" it was mistaken for.
   *
   * Started by the first flip rather than on mount, because opening the tab is
   * not playing: somebody who opens the page and goes to answer the door has not
   * had a slow round, and a clock started at mount would charge them for the
   * door. `null` until a card turns.
   */
  const startedAt = useRef<number | null>(null);

  const after = useCallback((ms: number, run: () => void) => {
    const id = window.setTimeout(run, ms);
    timers.current.push(id);
  }, []);

  const flip = (index: number) => {
    if (!cards || busy || faces[index] !== 'down') return;

    /* The clock starts on the first card that actually turns, which is why it is
       here and not above the guard: a tap on a matched card, or during a
       flip-back, is not the round starting. */
    if (startedAt.current === null) startedAt.current = Date.now();

    const nextFaces = faces.map((face, i) => (i === index ? 'up' : face) as Face);
    const nextFlipped = [...flipped, index];
    setFaces(nextFaces);
    setFlipped(nextFlipped);

    if (nextFlipped.length < 2) return;

    const [a, b] = nextFlipped;
    setMoves((m) => m + 1);
    setBusy(true);

    if (cards[a].pair === cards[b].pair) {
      after(MATCH_MS, () => {
        setFaces((current) =>
          current.map((face, i) => (i === a || i === b ? 'matched' : face)),
        );
        setLearned(cards[a]);
        setFlipped([]);
        setBusy(false);
        setFound((n) => n + 1);
      });
    } else {
      after(FLIP_BACK_MS, () => {
        setFaces((current) =>
          current.map((face, i) => (i === a || i === b ? 'down' : face)),
        );
        setFlipped([]);
        setBusy(false);
      });
    }
  };

  /*
   * The board is cleared, and the clock stops.
   *
   * Watched here rather than reported from inside `flip`, because `found` is set
   * through an updater in the same batch and reading it there would be one
   * behind — the last pair would score as the second to last.
   *
   * The reading is taken *now* and not inside the 700ms beat below. That beat is
   * the last pair finishing its animation, and charging it to the player would
   * put every round most of a second closer to the next band down for watching
   * something they cannot skip.
   */
  const reported = useRef(false);
  useEffect(() => {
    if (found < pairs || reported.current) return;
    reported.current = true;
    /* Whole seconds, floored, the way a stopwatch reads: `MEMORY_BANDS` is a
       list of ceilings and a 39.9-second board is a 39-second board.

       The fallback is unreachable — `startedAt` is set by the first flip and no
       board is cleared without one — and it is the *slowest* reading rather than
       the fastest, because a clock that never ran must not be worth more than
       one that did. */
    const seconds =
      startedAt.current === null
        ? Number.POSITIVE_INFINITY
        : Math.floor((Date.now() - startedAt.current) / 1000);
    after(700, () => onDone(memoryPoints(seconds), pairs, true));
  }, [found, pairs, onDone, after]);

  if (!cards) {
    return (
      <div className="round round-loading" role="status">
        {copy.loading}
      </div>
    );
  }

  return (
    <div className="round mm-round">
      <div className="round-top">
        <span className="round-count">
          {fill(copy.memory.pairs, { found: String(found), total: String(pairs) })}
          <span aria-hidden> · </span>
          {fill(copy.memory.moves, { n: String(moves) })}
        </span>
        {/* The stopwatch takes the clock slot, which is where a quiz puts its
            countdown — the same corner of the same header, because it answers
            the same question about the same thing. The moves moved in beside
            the pairs: they are a tally of what has happened and this is the
            figure the round is priced on. */}
        <Stopwatch from={startedAt} stopped={found >= pairs} />
      </div>

      {/* Four columns and a 3:4 card, which is the shape a playing card is; a
          square grid reads as a keypad. */}
      <div className="mm-grid">
        {cards.map((card, index) => {
          const face = faces[index];
          const up = face !== 'down';
          return (
            <button
              key={card.key}
              type="button"
              className="mm-card"
              data-face={face}
              disabled={up || busy}
              aria-label={up ? card.label : copy.memory.facedown}
              onClick={() => flip(index)}
            >
              {up ? (
                <>
                  <span className="mm-icon" aria-hidden>
                    {card.icon}
                  </span>
                  {face === 'matched' && <span className="mm-label">{card.label}</span>}
                </>
              ) : (
                <span className="mm-back" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      {/*
        What was just learned, and the whole reason the game is on this site.
        `aria-live` because the label appears without anything being focused, and
        a matched pair with a word on it is the one thing here worth announcing.
      */}
      <p className="mm-learned" aria-live="polite">
        {learned ? (
          <>
            <b>{learned.label}</b>
            {learned.en !== learned.label && <span>{learned.en}</span>}
          </>
        ) : (
          copy.memory.hint
        )}
      </p>

      <button type="button" className="link-btn round-quit" onClick={onQuit}>
        {copy.quit}
      </button>
    </div>
  );
}

/**
 * The elapsed clock, counting up.
 *
 * **Its own component so its own tick stays its own.** The board is twelve cards
 * and a live word panel; re-rendering all of it four times a second to move two
 * digits is exactly the pattern the root `CLAUDE.md` rules out. One small
 * component reading a ref is not — nothing above it re-renders, and the cards
 * are untouched between flips.
 *
 * Four times a second rather than once, because a stopwatch that ticks on its
 * own schedule is visibly late: at a one-second interval the displayed second
 * lags the real one by up to a full second, and this is a number a player is
 * about to be scored on. It costs a comparison and a text node.
 *
 * It **stops** when the board is cleared rather than being unmounted, so the
 * time that was actually paid for stays on screen through the result beat.
 *
 * `m:ss`, floored, which is how a stopwatch reads and is also how
 * `MEMORY_BANDS` reads it: the bands are ceilings, so a 39.9-second board is a
 * 39-second board and must not be shown as 40.
 */
function Stopwatch({
  from,
  stopped,
}: {
  /** When the first card turned; `null` until one does. */
  from: RefObject<number | null>;
  stopped: boolean;
}) {
  const [, tick] = useState(0);

  useEffect(() => {
    if (stopped) return;
    const id = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [stopped]);

  const seconds =
    from.current === null ? 0 : Math.floor((Date.now() - from.current) / 1000);

  return (
    <span className="round-clock mm-watch" role="timer">
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </span>
  );
}
