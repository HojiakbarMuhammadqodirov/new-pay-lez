import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCopy } from '../i18n/context';
import { fill } from '../i18n/currency';
import { wordPoints, wordRoundPoints } from '../auth/player';
import { ApiError } from '../api/client';
import { sendMove } from '../api/consumer';
import type { WordList, WordRow } from './banks';
import { buildWordRound } from './rounds';

/**
 * Word Builder.
 *
 * Five words, each shown as a clue and a tray of its own letters scrambled. Tap
 * them into the slots in order; the word checks itself the moment the last slot
 * fills.
 *
 * **A wrong attempt does not end the word.** That is the rule that makes this
 * the thinking game of the set rather than a reflex test: getting it wrong
 * shakes the row, keeps the letters where they are, and lets the player undo
 * back to where they went astray. What it costs is the **round's** perfect
 * bonus, and nothing else — `wordPoints` scores what the word was worth rather
 * than how the player got there, so a word fought for pays exactly what the same
 * word guessed first time does. The one thing that costs the word itself is a
 * *hint*, which forfeits the tier bonus and leaves the base: somebody who needed
 * it still earns for having finished the word, they just do not earn for it
 * having been hard.
 *
 * **Nothing here is timed.** A speed term and a first-try term used to sit in
 * that score and between them they were worth twice the word — which made the
 * one game on the page meant to be thought about into a race against the same
 * clock as the other five. Nothing in this component measures how long a word
 * takes any more.
 *
 * **The list is the language being practised, not the language being read.**
 * Polish or English, chosen on the card, with the clues written in English in
 * both. A Russian speaker learning Polish wants the Polish list; handing them a
 * Russian one would be handing them nothing to learn.
 *
 * Polish diacritics are preserved end to end — Ł, Ą, Ę, Ó, Ż, Ź, Ś, Ć, Ń are in
 * the tray and the comparison is exact, including them. Stripping them to make
 * matching easier would be teaching the word wrong.
 *
 * ── played on the server ──
 *
 * With a `session` the round is the server's: the words arrive as a prop, every
 * guess goes to `/v1/games/sessions/:id/events`, and **the verdict comes back
 * rather than being worked out here.** That is the whole point of the mode — a
 * client that holds the answer can report any score it likes, and a leaderboard
 * built on that ranks whoever opened devtools. `Puzzle.word` is the empty string
 * on those rounds and nothing in here tries to reconstruct it; the letters are a
 * multiset, and inferring the word from them is the same cheat one step removed.
 *
 * Everything else is deliberately unchanged. Without a `session` this is the
 * component it was — the demo accounts, and anybody playing while the backend is
 * down — and the two paths share the tapping, the undo, the shake and the
 * scoring, so neither can quietly drift from the other.
 *
 * Three rules travel with the server path:
 *
 * - **The press registers before the verdict.** Submitting locks the board and
 *   says so; the network follows. The same beat the quiz round runs, for the
 *   same reason — a board that simply went quiet reads as a press that missed.
 * - **A lost move is a word worth nothing, not a broken round.** The word stays
 *   submitted, the round goes on, and the server's own tally is what pays.
 * - **A refused hint reveals nothing and is charged nothing.** The allowance is
 *   a plan entitlement (`word_hints_per_day`) and the server throws *before* it
 *   reads the letter, so a refusal has to leave `attempt.hinted` alone — or the
 *   player is billed half a word for something they never got.
 */

/** How long the shake runs; the tray stays live throughout. */
const SHAKE_MS = 450;

/**
 * One word as the server sends it, and the whole of what a client is told.
 *
 * How long the word is, what it is worth, the clue, and its letters out of
 * order. **Not the word** — that stays in `game_sessions.secret`, which is the
 * only arrangement in which the score is worth ranking. `index` is the server's
 * own numbering and goes back verbatim on every move about this word, guess or
 * hint; it is not the position in this array and must not be re-derived from it.
 */
export interface ServerWord {
  index: number;
  length: number;
  tier: number;
  letters: string[];
  /**
   * The clue — and **nullable at runtime**, whatever the shape of the round
   * you happen to be handed.
   *
   * `word_bank.hint` is a nullable column and `buildWords` passes it through
   * unchanged, so a word with no clue arrives as `null` rather than as an
   * empty string. Typing it `string` because every word in the seeded bank
   * happens to have one is how a screen ends up rendering the text `null` at
   * a player the first time somebody adds a row without one.
   */
  hint: string | null;
}

/**
 * One word as the board plays it, whichever half of the game built it.
 *
 * The two sources differ in exactly one field and it is the load-bearing one:
 * `word` is the answer on a local round and the empty string on a server one.
 * The clue, the tier, the length and the tray are the same puzzle either way,
 * which is what keeps the tapping, the undo, the shake and the scoring as one
 * piece of code rather than two that have to be kept in step.
 */
interface Puzzle {
  /** The server's index on a server round; the position in the deck otherwise. */
  index: number;
  hint: string;
  tier: number;
  length: number;
  letters: string[];
  /** Empty on a server round, and nothing here may fill it in. */
  word: string;
}

const fromRow = (row: WordRow, at: number): Puzzle => ({
  index: at,
  hint: row[1],
  tier: row[2],
  length: row[0].length,
  letters: [...row[0]],
  word: row[0],
});

/**
 * What the board is doing.
 *
 * `sent` is the one the local path never reaches: the tray is full, the guess is
 * in the air, and nothing may move until the server answers. `lost` is the other
 * — the guess never arrived, so the word is over and worth nothing, and the only
 * honest thing left is the button to the next one.
 */
type Status = 'open' | 'sent' | 'right' | 'wrong' | 'lost';

/**
 * `data-state` on `.wb-slots`, per status.
 *
 * `picked` rather than a word of this component's own, because that is already
 * the site's name for "pressed, verdict not back yet" — `.round-option` and
 * `.onb-option` both use it. `lost` maps to nothing: the row is not right and it
 * is not wrong either, and marking it wrong would be a verdict nobody gave.
 */
const SLOT_STATE: Record<Status, string | undefined> = {
  open: 'open',
  sent: 'picked',
  right: 'right',
  wrong: 'wrong',
  lost: undefined,
};

/** Why the hint button did nothing. Cleared by the next press, and by the next word. */
type Notice = 'spent' | 'unsent';

interface Solved {
  /** 1 easy / 2 medium / 3 hard — what the word was worth before the hint. */
  tier: number;
  /** A letter was revealed, which halves it. */
  hinted: boolean;
  /** What it paid, for the line under the board. May be a half. */
  points: number;
  /**
   * No wrong guess and no hint.
   *
   * Not "first try" any more, because a first try is no longer worth anything on
   * its own — this is only ever read by the perfect-round bonus below, which
   * needs every word in the round to have gone in clean.
   */
  clean: boolean;
}

export function WordBuilder({
  words: count,
  list,
  session,
  serverWords,
  onDone,
  onQuit,
}: {
  /** How many words the round asks. */
  words: number;
  list: WordList;
  /**
   * The server session, when the round is one. Its absence is the whole switch:
   * no session means the bank, the local answer and the local score, exactly as
   * before.
   */
  session?: string;
  /** The server's words. Read once per `session` — see the build effect. */
  serverWords?: ServerWord[];
  /** Points earned, words solved, and whether every one of them went in. */
  onDone: (points: number, solved: number, won: boolean) => void;
  onQuit: () => void;
}) {
  const copy = useCopy().games;
  const [deck, setDeck] = useState<Puzzle[] | null>(null);
  const [index, setIndex] = useState(0);

  /** Tray letters, and which have been spent into a slot. */
  const [tray, setTray] = useState<Array<{ ch: string; used: boolean }>>([]);
  /** Tray indices, in the order they were tapped. */
  const [slots, setSlots] = useState<number[]>([]);
  const [status, setStatus] = useState<Status>('open');
  /** Wrong attempts so far, across the whole round. A count rather than a flag —
   *  see the shake effect, which needs a *new value* to restart on. */
  const [misses, setMisses] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [solved, setSolved] = useState<Solved[]>([]);
  /** Per-word, reset by `load`: whether anything has gone wrong or been hinted. */
  const attempt = useRef({ missed: false, hinted: false });

  /**
   * The next `seq` for this session.
   *
   * **One counter for the whole round, over guesses and hints alike.**
   * `game_events` is unique on `(session_id, seq)`, so numbering by word index
   * would collide the moment a word took a hint and then a guess — and a
   * collision does not fail loudly, it comes back `accepted: false` and scores
   * nothing. Increasing and unique is the only property the server asks for, and
   * a running count is the cheapest thing that has it.
   */
  const seq = useRef(0);

  /**
   * A guess is in the air.
   *
   * `status` is the real lock, but a queued state change is not a lock until it
   * commits: the effect below runs during a commit and `setStatus('sent')` is
   * only read by the render after it. The ref closes that window.
   */
  const pending = useRef(false);

  const puzzle = deck?.[index] ?? null;

  const load = useCallback((rows: Puzzle[], at: number) => {
    /* Shuffled here whichever source the letters came from. The server scrambles
       its own tray too, but seeded by the word's row id — so a word served twice
       presents the identical tray, and a player who has seen it before reads the
       answer off the keys. One scramble, in one place, for both paths. */
    const letters = [...rows[at].letters];
    /* Fisher–Yates inline: the tray is at most a dozen letters and pulling in
       the bag's helper for it would be the wrong dependency. */
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    setTray(letters.map((ch) => ({ ch, used: false })));
    setSlots([]);
    setStatus('open');
    setNotice(null);
    attempt.current = { missed: false, hinted: false };
    pending.current = false;
  }, []);

  /* `onQuit` is an inline arrow at the call site, so putting it in the dep array
     below would rebuild the deck on every render of the page — a new set of five
     words mid-round. Latched in a ref instead: the build reads whatever the
     current one is without depending on its identity. */
  const quit = useRef(onQuit);
  quit.current = onQuit;

  /* `serverWords` is latched for the same reason and a sharper one: it is an
     array the parent builds, so its identity changes whenever the parent
     re-renders, and depending on it would deal five new words under a round in
     progress. The build below keys on the *session id* instead, which is the
     thing that actually changes when there is a new round to play. */
  const supplied = useRef(serverWords);
  supplied.current = serverWords;

  useEffect(() => {
    /*
     * A server round arrives already built: `/v1/games/sessions` returned the
     * words with the session, so there is no bank to fetch and nothing to wait
     * for. An empty prop is the same dead end as a failed fetch below, and takes
     * the same way out.
     */
    if (session) {
      const rows = supplied.current ?? [];
      if (rows.length === 0) {
        quit.current();
        return;
      }
      const dealt = rows.map((row) => ({
        index: row.index,
        /* The bank's `hint` column is nullable and the server passes it through
           as it finds it. A clue-less word is still playable. */
        hint: row.hint ?? '',
        tier: row.tier,
        length: row.length,
        letters: row.letters,
        word: '',
      }));
      seq.current = 0;
      setDeck(dealt);
      setIndex(0);
      load(dealt, 0);
      return;
    }

    let live = true;
    buildWordRound(list, count)
      .then((rows) => {
        if (!live) return;
        /* An empty deck is the same dead end as a failed fetch — `deck` stays
           null, the panel below says "Loading…" and nothing will ever fill it —
           so it takes the same way out rather than returning quietly. */
        if (rows.length === 0) {
          quit.current();
          return;
        }
        const dealt = rows.map(fromRow);
        setDeck(dealt);
        setIndex(0);
        load(dealt, 0);
      })
      .catch(() => {
        /* `words.pl.json` / `words.en.json` are code-split and fetched on first
           play, so they can fail: a tab that dropped offline for a second, a
           deploy that moved the chunk. Without this the player waits on a
           "Loading…" that will never resolve and the rejection surfaces as an
           unhandled one in the console. Back to the cards, which is the answer
           `games.tsx` gives the quiz path for the same failure and the screen
           the button that retries it is on. */
        if (live) quit.current();
      });
    return () => {
      live = false;
    };
  }, [session, list, count, load]);

  const built = slots.map((i) => tray[i]?.ch ?? '').join('');

  /* Both stable, because the check effect below depends on them — and a new
     identity there is a second submission of the same guess. */
  const miss = useCallback(() => {
    setStatus('wrong');
    attempt.current.missed = true;
    /* Count the miss and let the effect below do the animating. Running the
       shake from here is what the first version did and it could not work:
       `status` is in that effect's dep array, so setting it re-ran the effect,
       and the cleanup killed the timeout that was meant to end the shake a few
       milliseconds after it was set. The row stayed marked shaken for the rest
       of the round, and every miss after the first animated nothing. */
    setMisses((n) => n + 1);
  }, []);

  const win = useCallback((entry: Puzzle) => {
    setStatus('right');
    /* The tier and the hint are the whole of it. What is deliberately *not* here
       is how many attempts it took or how long they took — the word is worth
       what the word is worth. `clean` is kept anyway, for the round's bonus.
       On a server round this is a *display*: the server scored the same events
       off the same table, and `finishRound` is what pays. */
    setSolved((current) => [
      ...current,
      {
        tier: entry.tier,
        hinted: attempt.current.hinted,
        points: wordPoints({ tier: entry.tier, hinted: attempt.current.hinted }),
        clean: !attempt.current.missed && !attempt.current.hinted,
      },
    ]);
  }, []);

  /*
   * Auto-check when the last slot fills.
   *
   * In an effect rather than at the tap, because the tap that fills the slot and
   * the check that reads it would otherwise be in the same batch and the check
   * would see the tray one letter short.
   */
  useEffect(() => {
    if (!puzzle || status !== 'open') return;
    if (built.length === 0 || built.length !== puzzle.length) return;

    /* A local round marks itself, because it has the word to mark against. */
    if (!session) {
      if (built !== puzzle.word) miss();
      else win(puzzle);
      return;
    }

    if (pending.current) return;
    pending.current = true;
    /* The press registers now, whatever the network is doing: the board locks
       and says it is checking, and the verdict fills that in when it lands. */
    setStatus('sent');

    sendMove(session, seq.current++, { index: puzzle.index, guess: built })
      .then((move) => {
        pending.current = false;
        /* `accepted: false` is a **duplicate**, not a failure — the server
           evaluated the guess and sent its verdict in the same reply, which is
           what makes a resent move safe. So the verdict is read either way, and
           only a request that threw is treated as a loss.
           The reply carries no correct spelling for a word — the server fills
           `answer` on a hint and nowhere else in this branch — so a wrong guess
           reveals nothing, which is the right shape here anyway: the word does
           not end on a miss, it shakes and stays. */
        if (move.correct === true) win(puzzle);
        else miss();
      })
      .catch(() => {
        pending.current = false;
        /* The move did not land. The word stays submitted — un-submitting it
           under the player would be worse — and the server's own tally is what
           pays, so this is a word worth nothing rather than a round that broke.
           The same treatment the quiz round gives a lost answer. */
        setStatus('lost');
      });
  }, [built, puzzle, status, session, miss, win]);

  /*
   * The shake, restarted on every miss.
   *
   * `.wb-slots[data-shake='true']` in `site.css` is a keyframe animation, and an
   * animation replays only when the element stops matching the rule and starts
   * matching it again *with a style flush in between*. React cannot promise that
   * flush — two commits inside one frame coalesce into no attribute change at
   * all — so the attribute is written by hand: off, read a layout property to
   * force the recalculation, on. `misses` in the dep array is what makes a
   * second identical miss a new run rather than a no-op.
   *
   * The removal at `SHAKE_MS` matters as much as the add: it is what leaves the
   * row unmarked, so the *next* miss starts from a clean element. Reduced motion
   * is honoured in the stylesheet, which drops the animation to `none` — the
   * attribute still comes and goes and nothing moves.
   */
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (misses === 0 || !row.current) return;
    const el = row.current;
    el.removeAttribute('data-shake');
    void el.offsetWidth;
    el.dataset.shake = 'true';
    const id = window.setTimeout(() => el.removeAttribute('data-shake'), SHAKE_MS);
    return () => window.clearTimeout(id);
  }, [misses]);

  /** Nothing may move: the word is over, or its verdict is still in the air. */
  const locked = status === 'sent' || status === 'right' || status === 'lost';

  /* The move itself, without the guard — the hint below has to place a letter
     the player did not choose, and it has to do it while the board is locked
     against the player. */
  const place = useCallback((i: number) => {
    setTray((current) => current.map((x, k) => (k === i ? { ...x, used: true } : x)));
    setSlots((current) => [...current, i]);
    /* A wrong word goes back to open the moment a letter moves, so the marked
       row is feedback on the attempt rather than a state to get out of. */
    setStatus('open');
  }, []);

  const tap = (i: number) => {
    if (locked || tray[i]?.used) return;
    place(i);
  };

  const undo = () => {
    if (locked || slots.length === 0) return;
    const last = slots[slots.length - 1];
    setTray((current) => current.map((x, k) => (k === last ? { ...x, used: false } : x)));
    setSlots((current) => current.slice(0, -1));
    setStatus('open');
  };

  const clear = () => {
    if (locked) return;
    setTray((current) => current.map((x) => ({ ...x, used: false })));
    setSlots([]);
    setStatus('open');
  };

  /** Fills the next correct letter. Costs this word half its value, and the
   *  round its perfect bonus. */
  const reveal = () => {
    if (locked || !puzzle) return;
    /* Nowhere to put a letter — which is the board after a wrong guess, before
       anything is undone. Locally that was a harmless no-op (`word[slots.length]`
       is `undefined` and the search below fails); on a server round it is not,
       because the server clamps the position into the word and answers, and the
       player has spent one of the day's three hints on a letter with no slot to
       go in. Refused here rather than discovered there. */
    if (slots.length >= puzzle.length) return;
    setNotice(null);

    if (!session) {
      const need = [...puzzle.word][slots.length];
      const at = tray.findIndex((x) => !x.used && x.ch === need);
      if (at < 0) return;
      attempt.current.hinted = true;
      place(at);
      return;
    }

    /*
     * On a server round the letter is the server's to give: it is the one thing
     * about the word a client is allowed to learn, it is metered per day by
     * plan, and `requireHint` decides — not this.
     *
     * The board locks for the round trip, which is what makes reading `tray` and
     * `slots.length` out of this closure safe: neither can move while it is
     * locked, so the letter that comes back is the letter for the slot that was
     * asked about. Without the lock a tap landing mid-flight would spend one of
     * the day's hints and reveal nothing.
     */
    setStatus('sent');
    sendMove(session, seq.current++, { index: puzzle.index, position: slots.length }, 'hint')
      .then((move) => {
        setStatus('open');
        const letter = typeof move.answer === 'string' ? move.answer : '';
        const at = letter ? tray.findIndex((x) => !x.used && x.ch === letter) : -1;
        if (at < 0) {
          setNotice('unsent');
          return;
        }
        attempt.current.hinted = true;
        place(at);
      })
      .catch((error: unknown) => {
        setStatus('open');
        /* A refused hint is a hint that never happened — the server throws
           before it reads the letter, so nothing was revealed and nothing may be
           charged here either. `attempt.hinted` stays false on purpose: half a
           word for a letter the player never got is the one outcome worse than
           the refusal itself. The entitlement is named in the error code, which
           is what lets the sentence say "your hints are spent" rather than
           "something went wrong" about a rule working exactly as designed. */
        setNotice(
          error instanceof ApiError && error.code === 'entitlement_required' ? 'spent' : 'unsent',
        );
      });
  };

  const next = () => {
    if (!deck) return;
    const at = index + 1;
    if (at >= deck.length) {
      /*
         Every word solved, every one of them clean. Both halves are
         load-bearing: `every` over an incomplete round would pay the bonus to
         somebody who quit after two perfect words.

         The sum is `wordRoundPoints`' rather than a `reduce` here because a hinted
         word is worth **half** its tier now, so a round can hold an odd number
         of halves — and where that half-point is dropped is a rule, not an
         arithmetic detail. It is dropped once, over the whole round, in
         `player.ts` where `npm run verify` can hold it.

         On a server round the caller throws these away and takes the score from
         `finishRound`, which is the only figure that reached the database. They
         are computed anyway rather than skipped, so the local path is untouched
         by the mode existing.
      */
      const points = wordRoundPoints(
        solved,
        solved.length === deck.length && solved.every((entry) => entry.clean),
      );
      /* Won means every word went in. Anything less still banks what it earned —
         there is no negative balance in this game and no round worth nothing. */
      onDone(points, solved.length, solved.length === deck.length);
      return;
    }
    setIndex(at);
    load(deck, at);
  };

  /* The slots are drawn from the *length*, not from the word: on a server round
     there is no word here to spread. */
  const boxes = useMemo(() => Array.from({ length: puzzle?.length ?? 0 }, (_, i) => i), [puzzle]);

  if (!deck || !puzzle) {
    return (
      <div className="round round-loading" role="status">
        {copy.loading}
      </div>
    );
  }

  return (
    <div className="round wb-round">
      <div className="round-top">
        <span className="round-count">
          {fill(copy.question, {
            n: String(index + 1),
            total: String(deck.length),
          })}
        </span>
        <span className="round-clock">
          {fill(copy.wordGame.tier, { n: String(puzzle.tier) })}
        </span>
      </div>

      <div className="wb-pips" aria-hidden>
        {deck.map((_, i) => (
          <i key={i} data-on={i < solved.length ? 'true' : undefined} />
        ))}
      </div>

      <p className="wb-hint">{puzzle.hint}</p>

      {/* The slots. `data-state` carries right/wrong so the whole row can be
          styled at once rather than each box deciding for itself. `data-shake`
          is deliberately not here: the effect above sets and clears it on the
          element itself, because restarting a CSS animation needs a style flush
          that a re-render cannot guarantee. */}
      <div className="wb-slots" ref={row} data-state={SLOT_STATE[status]}>
        {boxes.map((i) => (
          <span className="wb-slot" key={i}>
            {tray[slots[i]]?.ch ?? ''}
          </span>
        ))}
      </div>

      <div className="wb-tray">
        {tray.map((letter, i) => (
          <button
            key={i}
            type="button"
            className="wb-key"
            data-used={letter.used ? 'true' : undefined}
            disabled={letter.used || locked}
            onClick={() => tap(i)}
          >
            {letter.ch}
          </button>
        ))}
      </div>

      {status === 'sent' ? (
        /* The beat between the last letter and the verdict, in the same slot the
           result line lands in. A live region and not an animation: the one
           thing it has to do is say the press registered, and a spinner would be
           motion added to a screen that has none. */
        <div className="wb-done" role="status">
          <b>{copy.wordGame.checking}</b>
        </div>
      ) : status === 'right' || status === 'lost' ? (
        <div className="wb-done">
          <b>
            {status === 'right'
              ? fill(copy.wordGame.correct, {
                  points: String(solved[solved.length - 1]?.points ?? 0),
                })
              : copy.wordGame.unsent}
          </b>
          <button type="button" className="btn btn-solid" onClick={next}>
            {index + 1 >= deck.length ? copy.wordGame.finish : copy.wordGame.next}
          </button>
        </div>
      ) : (
        <>
          {notice && (
            /* Not red, because the palette has one accent: `.field-error` is the
               field kit's refusal — weighted in `--text` rather than coloured —
               and a control refusing is exactly what that style is for. */
            <div className="wb-done" role="status">
              <span className="field-error">
                {notice === 'spent' ? copy.wordGame.hintsSpent : copy.wordGame.unsent}
              </span>
            </div>
          )}
          <div className="wb-controls">
            <button type="button" className="btn btn-ghost" onClick={undo}>
              {copy.wordGame.undo}
            </button>
            <button type="button" className="btn btn-ghost" onClick={clear}>
              {copy.wordGame.clear}
            </button>
            <button type="button" className="btn btn-ghost wb-hint-btn" onClick={reveal}>
              {copy.wordGame.reveal}
            </button>
          </div>
        </>
      )}

      <button type="button" className="link-btn round-quit" onClick={onQuit}>
        {copy.quit}
      </button>
    </div>
  );
}
