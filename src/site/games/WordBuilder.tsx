import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCopy } from '../i18n/context';
import { fill } from '../i18n/currency';
import { WORD_PERFECT_BONUS, wordPoints } from '../auth/player';
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
 */

/** How long the shake runs; the tray stays live throughout. */
const SHAKE_MS = 450;

interface Solved {
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
  onDone,
  onQuit,
}: {
  /** How many words the round asks. */
  words: number;
  list: WordList;
  /** Points earned, words solved, and whether every one of them went in. */
  onDone: (points: number, solved: number, won: boolean) => void;
  onQuit: () => void;
}) {
  const copy = useCopy().games;
  const [deck, setDeck] = useState<WordRow[] | null>(null);
  const [index, setIndex] = useState(0);

  /** Tray letters, and which have been spent into a slot. */
  const [tray, setTray] = useState<Array<{ ch: string; used: boolean }>>([]);
  /** Tray indices, in the order they were tapped. */
  const [slots, setSlots] = useState<number[]>([]);
  const [status, setStatus] = useState<'open' | 'right' | 'wrong'>('open');
  /** Wrong attempts so far, across the whole round. A count rather than a flag —
   *  see the shake effect, which needs a *new value* to restart on. */
  const [misses, setMisses] = useState(0);

  const [solved, setSolved] = useState<Solved[]>([]);
  /** Per-word, reset by `load`: whether anything has gone wrong or been hinted. */
  const attempt = useRef({ missed: false, hinted: false });

  const word = deck?.[index]?.[0] ?? '';
  const hint = deck?.[index]?.[1] ?? '';
  const tier = deck?.[index]?.[2] ?? 1;

  const load = useCallback((rows: WordRow[], at: number) => {
    const letters = [...rows[at][0]];
    /* Fisher–Yates inline: the tray is at most a dozen letters and pulling in
       the bag's helper for it would be the wrong dependency. */
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    setTray(letters.map((ch) => ({ ch, used: false })));
    setSlots([]);
    setStatus('open');
    attempt.current = { missed: false, hinted: false };
  }, []);

  /* `onQuit` is an inline arrow at the call site, so putting it in the dep array
     below would rebuild the deck on every render of the page — a new set of five
     words mid-round. Latched in a ref instead: the build reads whatever the
     current one is without depending on its identity. */
  const quit = useRef(onQuit);
  quit.current = onQuit;

  useEffect(() => {
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
        setDeck(rows);
        setIndex(0);
        load(rows, 0);
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
  }, [list, count, load]);

  const built = slots.map((i) => tray[i]?.ch ?? '').join('');

  /*
   * Auto-check when the last slot fills.
   *
   * In an effect rather than at the tap, because the tap that fills the slot and
   * the check that reads it would otherwise be in the same batch and the check
   * would see the tray one letter short.
   */
  useEffect(() => {
    if (!deck || status !== 'open') return;
    if (built.length === 0 || built.length !== word.length) return;

    if (built !== word) {
      setStatus('wrong');
      attempt.current.missed = true;
      /* Count the miss and let the effect below do the animating. Running the
         shake from here is what the first version did and it could not work:
         `status` is in this effect's dep array, so setting it re-ran the effect,
         and the cleanup killed the timeout that was meant to end the shake a few
         milliseconds after it was set. The row stayed marked shaken for the rest
         of the round, and every miss after the first animated nothing. */
      setMisses((n) => n + 1);
      return;
    }

    setStatus('right');
    /* The tier and the hint are the whole of it. What is deliberately *not* here
       is how many attempts it took or how long they took — the word is worth
       what the word is worth. `clean` is kept anyway, for the round's bonus. */
    setSolved((current) => [
      ...current,
      {
        points: wordPoints({ tier, hinted: attempt.current.hinted }),
        clean: !attempt.current.missed && !attempt.current.hinted,
      },
    ]);
  }, [built, word, status, deck, tier]);

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

  const tap = (i: number) => {
    if (status === 'right' || tray[i]?.used) return;
    setTray((current) => current.map((x, k) => (k === i ? { ...x, used: true } : x)));
    setSlots((current) => [...current, i]);
    /* A wrong word goes back to open the moment a letter moves, so the red row
       is feedback on the attempt rather than a state to get out of. */
    setStatus('open');
  };

  const undo = () => {
    if (status === 'right' || slots.length === 0) return;
    const last = slots[slots.length - 1];
    setTray((current) => current.map((x, k) => (k === last ? { ...x, used: false } : x)));
    setSlots((current) => current.slice(0, -1));
    setStatus('open');
  };

  const clear = () => {
    if (status === 'right') return;
    setTray((current) => current.map((x) => ({ ...x, used: false })));
    setSlots([]);
    setStatus('open');
  };

  /** Fills the next correct letter. Costs this word its tier bonus, and the
   *  round its perfect one. */
  const reveal = () => {
    if (status === 'right') return;
    const need = [...word][slots.length];
    const at = tray.findIndex((x) => !x.used && x.ch === need);
    if (at < 0) return;
    attempt.current.hinted = true;
    tap(at);
  };

  const next = () => {
    if (!deck) return;
    const at = index + 1;
    if (at >= deck.length) {
      /* Every word solved, every one of them clean. Both halves are load-bearing:
         `every` over an incomplete round would pay the bonus to somebody who
         quit after two perfect words. */
      const points =
        solved.reduce((sum, entry) => sum + entry.points, 0) +
        (solved.length === deck.length && solved.every((entry) => entry.clean)
          ? WORD_PERFECT_BONUS
          : 0);
      /* Won means every word went in. Anything less still banks what it earned —
         there is no negative balance in this game and no round worth nothing. */
      onDone(points, solved.length, solved.length === deck.length);
      return;
    }
    setIndex(at);
    load(deck, at);
  };

  const letters = useMemo(() => [...word], [word]);

  if (!deck) {
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
          {fill(copy.wordGame.tier, { n: String(tier) })}
        </span>
      </div>

      <div className="wb-pips" aria-hidden>
        {deck.map((_, i) => (
          <i key={i} data-on={i < solved.length ? 'true' : undefined} />
        ))}
      </div>

      <p className="wb-hint">{hint}</p>

      {/* The slots. `data-state` carries right/wrong so the whole row can be
          styled at once rather than each box deciding for itself. `data-shake`
          is deliberately not here: the effect above sets and clears it on the
          element itself, because restarting a CSS animation needs a style flush
          that a re-render cannot guarantee. */}
      <div className="wb-slots" ref={row} data-state={status}>
        {letters.map((_, i) => (
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
            disabled={letter.used || status === 'right'}
            onClick={() => tap(i)}
          >
            {letter.ch}
          </button>
        ))}
      </div>

      {status === 'right' ? (
        <div className="wb-done">
          <b>
            {fill(copy.wordGame.correct, {
              points: String(solved[solved.length - 1]?.points ?? 0),
            })}
          </b>
          <button type="button" className="btn btn-solid" onClick={next}>
            {index + 1 >= deck.length ? copy.wordGame.finish : copy.wordGame.next}
          </button>
        </div>
      ) : (
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
      )}

      <button type="button" className="link-btn round-quit" onClick={onQuit}>
        {copy.quit}
      </button>
    </div>
  );
}
