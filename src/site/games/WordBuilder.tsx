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
 * back to where they went astray. What it costs is the first-try bonus and,
 * usually, the speed one — see `wordPoints`, which is where all of the scoring
 * lives.
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
  firstTry: boolean;
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
  const [shake, setShake] = useState(false);

  const [solved, setSolved] = useState<Solved[]>([]);
  /** Per-word, reset by `load`: whether anything has gone wrong or been hinted. */
  const attempt = useRef({ started: 0, missed: false, hinted: false });

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
    attempt.current = { started: Date.now(), missed: false, hinted: false };
  }, []);

  useEffect(() => {
    let live = true;
    buildWordRound(list, count).then((rows) => {
      if (!live || rows.length === 0) return;
      setDeck(rows);
      setIndex(0);
      load(rows, 0);
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
      setShake(true);
      const id = window.setTimeout(() => setShake(false), SHAKE_MS);
      return () => window.clearTimeout(id);
    }

    setStatus('right');
    const seconds = (Date.now() - attempt.current.started) / 1000;
    setSolved((current) => [
      ...current,
      {
        points: wordPoints({
          tier,
          firstTry: !attempt.current.missed,
          hinted: attempt.current.hinted,
          seconds,
        }),
        firstTry: !attempt.current.missed && !attempt.current.hinted,
      },
    ]);
  }, [built, word, status, deck, tier]);

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

  /** Fills the next correct letter. Costs the first-try and speed bonuses. */
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
      const points =
        solved.reduce((sum, entry) => sum + entry.points, 0) +
        (solved.length === deck.length && solved.every((entry) => entry.firstTry)
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
          styled at once rather than each box deciding for itself. */}
      <div className="wb-slots" data-state={status} data-shake={shake ? 'true' : undefined}>
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
