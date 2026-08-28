import { useCallback, useEffect, useRef, useState } from 'react';
import { useCopy } from '../i18n/context';
import { fill } from '../i18n/currency';
import { memoryPoints } from '../auth/player';
import { today } from '../auth/player';
import { buildMemoryBoard, type MemoryCard } from './rounds';

/**
 * Memory Match.
 *
 * Twelve cards, six pairs, and the only round on the page with no clock and no
 * way to lose. That is the accessibility decision in the set: every other game
 * here rewards speed, and this is the one a non-native reader or an older player
 * can win by being careful. Scoring is on *efficiency* instead — `memoryPoints`
 * in `auth/player.ts` pays a guaranteed base per pair plus a bonus that falls
 * away as the move count climbs.
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

  const after = useCallback((ms: number, run: () => void) => {
    const id = window.setTimeout(run, ms);
    timers.current.push(id);
  }, []);

  const flip = (index: number) => {
    if (!cards || busy || faces[index] !== 'down') return;

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
   * The board is cleared.
   *
   * Watched here rather than reported from inside `flip`, because `moves` is set
   * through an updater in the same batch and reading it there would be one
   * behind — the flawless bonus turns on `moves === pairs` exactly, so being one
   * out is the difference between earning it and not.
   */
  const reported = useRef(false);
  useEffect(() => {
    if (found < pairs || reported.current) return;
    reported.current = true;
    after(700, () => onDone(memoryPoints(pairs, moves), pairs, true));
  }, [found, pairs, moves, onDone, after]);

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
        </span>
        <span className="round-clock">
          {fill(copy.memory.moves, { n: String(moves) })}
        </span>
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
