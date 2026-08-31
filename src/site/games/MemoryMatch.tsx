import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useCopy } from '../i18n/context';
import { fill } from '../i18n/currency';
import { memoryPoints } from '../auth/player';
import { today } from '../auth/player';
import { sendMove, type MoveResult } from '../api/consumer';
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
 * ## Two boards, and only one of them is this file's
 *
 * With a `session` the board belongs to the **server**: `game_sessions.secret`
 * holds the layout, this screen is told `{cards, pairs}` and nothing else, and
 * it learns a card's face by turning it over. That is what makes the points
 * real — a client that dealt its own deck could report any time it liked, and a
 * leaderboard ranked on that ranks whoever opened devtools.
 *
 * **Turning one over is a move, and that is recent.** The protocol had only a
 * pair, so a server board could not show you the first card until you had named
 * the second: you committed to a match blind, and a game entirely about
 * remembering what you saw showed you nothing to remember. `kind:'peek'` turns
 * the opening card of each move and `kind:'pair'` turns the closing one and
 * judges them, so the sequence a player sees is the classic one — it turns, it
 * turns, they stay or they go back down.
 *
 * Without one it deals its own deck exactly as it always has, which is the demo
 * accounts and anybody playing while the backend is down. Those rounds pay into
 * the local mirror and are not ranked. **Nothing on that path changed**, down to
 * the beats: it is the fallback, and a fallback that drifts is one nobody can
 * check the real thing against.
 *
 * The L-Earn payload is the local board's: the deck is a themed set of Kraków
 * landmarks, Polish food, transport or everyday words, so matching two cards
 * teaches the word for what is on them. The deck rotates with the day (see
 * `buildMemoryBoard`), which is what makes five decks into a week of themes.
 * **A server board has no words** — `buildDeck` deals eight geometric symbols,
 * which is the whole of what a face is over there — so the panel under it says
 * what that board is instead of promising a word it cannot pay out. Teaching a
 * word and scoring a round are two jobs, and the server took the second one.
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

/** Whether the reader has asked for less movement. Read at the moment of use —
 *  the setting can change while the tab is open. */
const reducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The two faces a `pair` move turned over, out of the server's reply.
 *
 * `MoveResult` is deliberately open — `api/consumer.ts` says why: the deck games
 * learn about the board as they play and the quiz games do not, so the shape of
 * the extra is the reading screen's business rather than the client module's.
 * This is that narrowing, and it is defensive on purpose: a reply missing the
 * field is an older server, and the honest answer to one is a board that plays
 * on with two blanks rather than a round that throws.
 */
function facesIn(move: MoveResult): Array<{ index: number; face: string }> {
  if (!Array.isArray(move.revealed)) return [];
  return move.revealed.filter(
    (card): card is { index: number; face: string } =>
      typeof card === 'object' &&
      card !== null &&
      typeof (card as { index?: unknown }).index === 'number' &&
      typeof (card as { face?: unknown }).face === 'string',
  );
}

export function MemoryMatch({
  pairs,
  session,
  serverBoard,
  onDone,
  onQuit,
}: {
  pairs: number;
  /** The server round in flight. Absent for a board this file dealt itself. */
  session?: string;
  /** What `/v1/games/sessions` said the board is. Arrives with `session`. */
  serverBoard?: { cards: number; pairs: number };
  /** Points earned, pairs found, and whether the board was cleared. */
  onDone: (points: number, found: number, won: boolean) => void;
  onQuit: () => void;
}) {
  const copy = useCopy().games;

  /*
   * The server round, or `null` for a board this file deals itself.
   *
   * The two props are one fact and are read as one: a session with no board
   * shape has nothing to draw, and a board shape with no session has nowhere to
   * send a move. `games.tsx` sets them in a single batch, and taking them
   * together here is what makes that a promise rather than a coincidence — a
   * screen that believed either half on its own would render a grid it could
   * not play.
   */
  const remote = session && serverBoard ? { session, ...serverBoard } : null;

  /* The server's figures win where it has any: it dealt the board, and a client
     that drew its grid from the game table would render eleven cards the day
     `CONFIG.games.memoryPairs` moves. `pairs` stays the fallback, because
     without a session there is nobody else to ask. */
  const size = remote ? remote.cards : pairs * 2;
  const total = remote ? remote.pairs : pairs;

  const [cards, setCards] = useState<MemoryCard[] | null>(null);
  /*
   * The faces this client has been told about, by position.
   *
   * Only a server board uses it, and it is the whole of what that board knows:
   * `null` is a card nobody has turned over yet. Written once per *turn*, from
   * the reply — a peek names one card and a pair names two — never guessed, and
   * never derived from a match, because a match tells you two cards were equal
   * and not what they were.
   *
   * A face **stays** here after the pair flips back down, which is not a leak:
   * the render only draws a face for a card that is up or matched. What it buys
   * is the flip a player expects — turning a card they have already seen shows
   * it at once instead of waiting on a round trip for a fact this tab already
   * holds. The server is still the one that says whether the pair matched.
   */
  const [known, setKnown] = useState<Array<string | null>>(() =>
    remote ? Array.from({ length: remote.cards }, () => null) : [],
  );
  const [faces, setFaces] = useState<Face[]>(() =>
    /* A server board is ready on the first render — there is nothing to fetch,
       only blanks to draw — so the twelve cards are laid out in the state
       initialiser rather than a frame later in an effect. A local board is
       waiting on `decks.json` and stays empty until it lands. */
    remote ? Array.from({ length: remote.cards }, () => 'down' as Face) : [],
  );
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
  /* Whether this board is still the one on screen. A `pair` move is a round trip
     and the player can quit inside it — `timers` catches the beats, this catches
     the reply that was already in the air when they did. */
  const live = useRef(true);
  useEffect(() => {
    /* Both flags are set on the way *in* as well as read on the way out, because
       `StrictMode` mounts this component, tears it down and mounts it again in
       development: a `live` that was only ever cleared would come back false on
       the second mount and every reply would be dropped by a board that is on
       screen. `pending` is the same array `after` pushes into — copied to a
       local so the cleanup closes over the list rather than reaching through the
       ref for it, which is a ref that could have been replaced by then. */
    live.current = true;
    const pending = timers.current;
    return () => {
      live.current = false;
      for (const id of pending) window.clearTimeout(id);
    };
  }, []);

  /*
   * The next `seq`, which is 0-based and increases across the whole session.
   *
   * `game_events` has a unique `(session_id, seq)`, and the number is taken when
   * a move is **sent** rather than when one succeeds: a request whose response
   * was lost may well have been recorded, and re-using its number would spend
   * the next pair's move on a duplicate — the server would answer
   * `accepted: false` about two cards nobody is looking at, and the pair
   * actually on screen would never be judged. A burnt number costs nothing; a
   * reused one costs a move.
   */
  const nextSeq = useRef(0);

  /* `onQuit` is an inline arrow at the call site, so putting it in the dep array
     below would rebuild the board on every render of the page — a new shuffle
     mid-game. Latched in a ref instead: the build reads whatever the current one
     is without depending on its identity. */
  const quit = useRef(onQuit);
  quit.current = onQuit;

  useEffect(() => {
    /* A server board was dealt before this component mounted and there is
       nothing here to build. Returning early rather than branching inside the
       fetch keeps `decks.json` — a code-split chunk — off a path that would
       never read it. The two props are tested rather than `remote`, which is a
       fresh object every render and would restart this effect on each one; the
       condition is the same one, written in the two stable halves. */
    if (session && serverBoard) return;

    let building = true;
    buildMemoryBoard(pairs, today())
      .then((board) => {
        if (!building) return;
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
        if (building) quit.current();
      });
    return () => {
      building = false;
    };
  }, [pairs, session, serverBoard]);

  /*
   * When the first card was turned over.
   *
   * **Still a ref, now that the clock is drawn.** This is the reading that
   * *scores* a local round — it is what `memoryPoints` is handed when the board
   * clears — and it has to be exact and must not cause a render. The visible
   * stopwatch reads the same ref through `Stopwatch`, which keeps its own tick
   * to itself: one small component re-renders four times a second, and the
   * twelve cards do not. That is the whole of the arrangement the root
   * `CLAUDE.md` asks for, rather than the "no clock at all" it was mistaken for.
   *
   * Started by the first flip rather than on mount, because opening the tab is
   * not playing: somebody who opens the page and goes to answer the door has not
   * had a slow round, and a clock started at mount would charge them for the
   * door. `null` until a card turns.
   *
   * **On a server round it scores nothing and is still drawn**, and the two
   * clocks are worth being precise about. The server times a deck from the first
   * `game_events` row to the last — so it starts when the opening card's *peek*
   * arrives, which is the same tap that starts this one, and it stops when the
   * last pair is judged, which is before the match beat below has finished
   * playing. Its span is therefore still inside this one, and the band it lands
   * in is the same or a faster one. A player is never paid less than the clock
   * they were watching says; the direction it can be wrong in is the safe one.
   *
   * The peek is what made those two nearly the same reading. Before it the
   * server's clock did not start until the *first pair* was submitted — two taps
   * in — so it undercharged every round by however long the opening move took.
   * Closing that gap is a round scored on what the player actually spent, which
   * is the honest direction even though it is the stricter one.
   */
  const startedAt = useRef<number | null>(null);

  const after = useCallback((ms: number, run: () => void) => {
    const id = window.setTimeout(run, ms);
    timers.current.push(id);
  }, []);

  /**
   * Lock a matched pair, or turn a mismatched one back down.
   *
   * One function for both endings because they differ in three things — the
   * face, the beat, and whether a pair was found — and everything else about
   * them, including the two cards being released for the next move, is the same
   * two lines written twice in the version this replaced.
   */
  const settle = useCallback(
    (a: number, b: number, matched: boolean, hold: number) => {
      after(hold, () => {
        setFaces((current) =>
          current.map((face, i) => (i === a || i === b ? (matched ? 'matched' : 'down') : face)),
        );
        setFlipped([]);
        setBusy(false);
        if (matched) setFound((n) => n + 1);
      });
    },
    [after],
  );

  /**
   * Write the faces a reply named onto the board.
   *
   * One function because both moves answer in the same shape and the merge is
   * the same merge — a peek names one card, a pair names two — and two copies of
   * an index bound is one of them eventually being wrong. It **merges** rather
   * than replaces: `known` is everything this tab has ever been told, not what
   * is face up, which is what lets a card the player has already seen turn back
   * over instantly the next time they reach for it.
   */
  const learn = useCallback((move: MoveResult) => {
    const faces = facesIn(move);
    if (faces.length === 0) return;
    setKnown((current) => {
      const next = [...current];
      for (const card of faces) {
        if (card.index >= 0 && card.index < next.length) next[card.index] = card.face;
      }
      return next;
    });
  }, []);

  /**
   * Turn one card over on its own, and ask what it is.
   *
   * **This is the move that makes it a memory game.** The protocol had only a
   * pair, so the first card a player tapped stayed blank until they had already
   * tapped a second — every move made blind, which is not this game with a delay
   * on it but a different one. `kind:'peek'` asks about a single position and
   * the reply carries that card's face in the same `revealed` array a pair uses.
   *
   * It is fired and not waited on. Nothing is blocked — `busy` stays false, so
   * the second card can be tapped while this is in the air — because the card is
   * already drawn lifted and the only thing missing is the symbol on it. A
   * player who is quick simply gets both faces at once, out of the pair's reply.
   *
   * Sent even when `known` already holds the face, which looks redundant and is
   * not: the render draws that face immediately from what the tab knows, and
   * this is what puts the *turn* in the round the server is timing. A move the
   * server never saw is a second of the player's round that its clock does not
   * charge for, and this game is scored on that clock alone.
   *
   * A failure is nothing at all. The card stays lifted and blank, the round
   * carries on, and the pair move that follows names both faces anyway — so
   * there is no state to unwind and nothing the player has to be told.
   */
  const peek = useCallback(
    (id: string, index: number) => {
      const seq = nextSeq.current;
      nextSeq.current += 1;

      void sendMove(id, seq, { index }, 'peek')
        .then((move) => {
          if (live.current) learn(move);
        })
        .catch(() => {
          /* Deliberately empty; the comment above says why. */
        });
    },
    [learn],
  );

  /**
   * Submit a turned pair and wait to be told what it was.
   *
   * The optimistic half already happened — both cards are drawn face up before
   * this is called, and the first of them usually has its symbol on it already
   * from the peek — and what arrives is the half a client is not allowed to
   * decide: the two faces, and whether they matched.
   */
  const submit = useCallback(
    (id: string, a: number, b: number) => {
      const seq = nextSeq.current;
      nextSeq.current += 1;

      void sendMove(id, seq, { a, b }, 'pair')
        .then((move) => {
          if (!live.current) return;

          /* Both faces, whichever way the pair went. A mismatch is the move that
             *teaches* — it is two cards the player now has to remember — and it
             is exactly what the old reply could not say, because it named the
             first card and left the second blank. It is still read here rather
             than left to the peek: the peek covers the *first* card of a move
             and this is the only thing that ever names the second. */
          learn(move);

          /* `accepted: false` is a duplicate `seq`, not a failure: the server had
             this move already and has answered about it anyway. The verdict is
             the same verdict, so it is read the same way — the flag is about
             bookkeeping, and treating it as an error would put a played pair
             back face down under the player. */
          settle(
            a,
            b,
            move.correct === true,
            /* The match beat exists so the second card reads as *turning* before
               the plate changes colour under it. On a server round that turn has
               already been on screen for a round trip, and a reader who has asked
               for less movement has no animation left for the beat to be waiting
               on — so it is nothing. The mismatch beat is not motion and is not
               touched: it is the time the two faces are readable, which is the
               whole of what the player is here to do. */
            move.correct === true ? (reducedMotion() ? 0 : MATCH_MS) : FLIP_BACK_MS,
          );
        })
        .catch(() => {
          if (!live.current) return;
          /* The move did not land, so this client knows nothing about those two
             cards and must not pretend otherwise: they go back down, unlearned,
             and the round carries on. The server may have recorded it anyway —
             a response can be lost after the row is written — and if it did, its
             tally already counts the pair and this board will simply be turned
             again. **What the round pays is the server's**, and it is scored on
             the clock rather than on the count, so a move this client lost costs
             the player nothing at all. */
          settle(a, b, false, 0);
        });
    },
    [settle, learn],
  );

  const flip = (index: number) => {
    if (busy || faces[index] !== 'down') return;
    /* A local board has nothing to turn until `decks.json` lands; a server one
       is dealt on the first render and has no such window. */
    if (!remote && !cards) return;

    /* The clock starts on the first card that actually turns, which is why it is
       here and not above the guard: a tap on a matched card, or during a
       flip-back, is not the round starting. */
    if (startedAt.current === null) startedAt.current = Date.now();

    const nextFaces = faces.map((face, i) => (i === index ? 'up' : face) as Face);
    const nextFlipped = [...flipped, index];
    setFaces(nextFaces);
    setFlipped(nextFlipped);

    if (nextFlipped.length < 2) {
      /* **The first card of a move is turned on its own**, because the player is
         looking at it now and a card that shows nothing until they have
         committed to a second one is the whole of what was wrong here. A local
         board has the face in hand and needs nobody's permission. */
      if (remote) peek(remote.session, index);
      return;
    }

    const [a, b] = nextFlipped;
    setMoves((m) => m + 1);
    setBusy(true);

    if (remote) {
      submit(remote.session, a, b);
      return;
    }

    /* Both halves of the local ending read the deck, and the guard at the top of
       this function is what makes it non-null. Restated because the `remote`
       branch above sits between the two and a narrowing does not cross it. */
    const deck = cards ?? [];

    if (deck[a].pair === deck[b].pair) {
      after(MATCH_MS, () => {
        setFaces((current) =>
          current.map((face, i) => (i === a || i === b ? 'matched' : face)),
        );
        setLearned(deck[a]);
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
   *
   * **The points reported are this file's own reckoning**, and on a server round
   * they are dropped: `finishScored` in `games.tsx` calls `/finish` and takes
   * the score from the reply, because the round was scored where the deck lives.
   * They are still computed and still passed, because the same three arguments
   * are the whole of what a local round pays and that path must not fork.
   */
  const reported = useRef(false);
  useEffect(() => {
    if (found < total || reported.current) return;
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
    after(700, () => onDone(memoryPoints(seconds), total, true));
  }, [found, total, onDone, after]);

  if (!remote && !cards) {
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
          {fill(copy.memory.pairs, { found: String(found), total: String(total) })}
          <span aria-hidden> · </span>
          {fill(copy.memory.moves, { n: String(moves) })}
        </span>
        {/* The stopwatch takes the clock slot, which is where a quiz puts its
            countdown — the same corner of the same header, because it answers
            the same question about the same thing. The moves moved in beside
            the pairs: they are a tally of what has happened and this is the
            figure the round is priced on. */}
        <Stopwatch from={startedAt} stopped={found >= total} />
      </div>

      {/* Four columns and a 3:4 card, which is the shape a playing card is; a
          square grid reads as a keypad. */}
      <div className="mm-grid">
        {Array.from({ length: size }, (_, index) => {
          const face = faces[index] ?? 'down';
          const up = face !== 'down';
          /* What is drawn on the front of this card. A local board knows every
             face from the moment it is dealt; a server board knows the ones it
             has been told, and `null` is the state this whole screen is built
             around — turned over, and the reply not back yet. */
          const card = cards ? cards[index] : null;
          const icon = card ? card.icon : known[index] ?? null;
          return (
            <button
              /* A server board has no keys of its own — its cards are positions
                 and nothing else — so the index is the identity there. It is
                 stable: the grid is dealt once and never reordered. */
              key={card ? card.key : index}
              type="button"
              className="mm-card"
              data-face={face}
              disabled={up || busy}
              aria-label={
                !up
                  ? copy.memory.facedown
                  : icon === null
                    ? copy.memory.turning
                    : (card?.label ?? icon)
              }
              onClick={() => flip(index)}
            >
              {up && icon !== null ? (
                <>
                  <span className="mm-icon" aria-hidden>
                    {icon}
                  </span>
                  {face === 'matched' && card && <span className="mm-label">{card.label}</span>}
                </>
              ) : (
                /* The same mark a face-down card carries, because the card is
                   the honest thing to change and it already has: `.mm-card` is
                   lit and lifted at `data-face='up'` while this is still the
                   back. Drawing a placeholder glyph in the icon slot would be
                   inventing a face to say there is no face yet. */
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

        A server board has no word to teach — its faces are symbols — so it keeps
        its own line here for the whole round rather than swapping to a label
        that does not exist. The slot is kept either way: it is the live region,
        and it holds the board's height steady between the first match and the
        last.
      */}
      <p className="mm-learned" aria-live="polite">
        {learned ? (
          <>
            <b>{learned.label}</b>
            {learned.en !== learned.label && <span>{learned.en}</span>}
          </>
        ) : remote ? (
          copy.memory.serverHint
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
