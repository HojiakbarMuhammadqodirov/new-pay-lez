import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { GAMES } from '../content';
import { Icon } from '../icons';
import { useCopy, useLanguage } from '../i18n/context';
import { fill } from '../i18n/currency';
import { AnimatedPico, type PicoPose } from '../pico';
import type { Question } from './rounds';
import { QUIZ_LOW_SECONDS, type StageMotif } from './stage/config';
import type { StageCue } from './stage/paint';
import { StageScene } from './stage/StageScene';

type Game = (typeof GAMES)[number];

/**
 * The four quizzes — Guess the Flag, Country & Capital, Brain Games and the
 * local quiz — as one round on one set.
 *
 * **The engine is the one `games.tsx` always ran**, moved here whole: the
 * per-question clock, the optimistic press, the server's verdict, the 900ms
 * beat, `onDone` with the right answers and the round's seconds. Nothing below
 * the markup changed. What changed is what the round is played *in front of*:
 *
 * - **A set per quiz** (`stage/`): bunting and a turning globe for the flags,
 *   a sea chart with capitals pinned and a plane flying between them, a lab of
 *   gears and puzzle pieces for Brain Games, and the player's own city for the
 *   local quiz. One layout, four worlds.
 * - **Pico as the host**, at a lectern beside the question: listening while
 *   the clock runs, hopping while the server thinks, delighted at a right
 *   answer and crestfallen at a wrong one — and the set answers with him (a
 *   brighter spotlight and sparks, or a dimmer beat).
 * - **A HUD with something to read at a glance**: five pips that fill as the
 *   round goes, a ring that drains with the question's clock, and the bar.
 *
 * Everything a player reads or presses is DOM on the page's tokens and
 * `--glass`; only the scenery is painted.
 */

interface RoundState {
  index: number;
  correct: number;
  /** The option the player just chose, held for the moment of feedback. */
  picked: number | null;
  /**
   * What the round came to, written once by the beat after the last question
   * and handed to `onDone` by an effect. Not called from inside the updater:
   * an updater runs during React's render, where calling the parent's
   * `setState` is the "Cannot update GamesApp while rendering QuizRound"
   * warning, and StrictMode runs updaters twice, which called it twice.
   */
  result: { correct: number; seconds: number } | null;
}

/** Which set each quiz is played on. The four are the only rows `QuizRound` is mounted for. */
const MOTIF: Partial<Record<Game['id'], StageMotif>> = {
  flag: 'parade',
  capital: 'atlas',
  brain: 'lab',
  local: 'city',
};

/** The option keys a quiz show prints beside its answers. Decorative: hidden from screen readers. */
const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

export function QuizRound({
  game,
  questions,
  resolve,
  onDone,
  onQuit,
  country,
}: {
  game: Game;
  questions: Question[];
  /**
   * Ask the **server** whether a choice was right, when the round is a server
   * round.
   *
   * Present for the four quizzes, absent for the rounds the client still builds
   * itself. The difference it makes is a round trip per question — the server
   * holds the answers (`game_sessions.secret`) and hands over only prompts and
   * options, which is what makes a score it computes worth anything. A client
   * that knew the answer could report any score it liked.
   *
   * `Question.answer` is `-1` on a server round for that reason: there is no
   * answer here to compare against, and the resolver's reply is what fills the
   * right-and-wrong marking in.
   */
  resolve?: (index: number, choice: number) => Promise<{ correct: boolean; answer: number }>;
  /** Right answers, and how long the whole round took in whole seconds. */
  onDone: (correct: number, seconds: number) => void;
  onQuit: () => void;
  /** The local quiz's country (`quizCountryFor`), which picks the city it is played in. */
  country?: string;
}) {
  const copy = useCopy().games;
  const [language] = useLanguage();
  /* The seconds unit in the reader's language — `Intl` knows all five, the
     same side `untilNextEnergy` takes. A bare `s` after the figure was the one
     English letter on a translated screen. */
  const seconds = useMemo(
    () => new Intl.NumberFormat(language, { style: 'unit', unit: 'second', unitDisplay: 'narrow' }),
    [language],
  );
  const [state, setState] = useState<RoundState>({
    index: 0,
    correct: 0,
    picked: null,
    result: null,
  });
  const [left, setLeft] = useState(game.seconds);
  const question = questions[state.index];

  /*
   * When the round started, for the speed bands in `quizSpeedBonus`.
   *
   * A ref, and set on the first render rather than in an effect: nothing on
   * screen reads it — there is no round stopwatch, only the per-question one —
   * so it must not cause a render, and an effect would start it a frame after
   * the first question was already on screen. `useState`'s initialiser runs
   * once, which is exactly the guarantee wanted.
   *
   * It measures **question one appearing to answer five landing**, which is what
   * the bands are written against. The 900ms feedback beats between questions
   * are inside that, deliberately: they are part of the round, they are the same
   * for everybody, and the alternative is a clock that stops and starts four
   * times and cannot be checked against a stopwatch.
   */
  const [startedAt] = useState(() => Date.now());

  /*
   * The right answer for the question on screen, once it is known.
   *
   * On a local round it is known up front and this is never written. On a
   * server round the answer arrives with the verdict, and the buttons need it
   * to mark which one *was* right — showing only "you were wrong" without
   * showing what was right is the one thing a quiz must not do.
   */
  const [revealed, setRevealed] = useState<number | null>(null);

  /*
   * One `answer` for every way a question can end, including running out of
   * time (`choice === -1`). Wrapped in a ref-stable callback because the timer
   * effect below depends on it and must not restart on every render.
   */
  const answer = useCallback(
    (choice: number) => {
      /* The optimistic half: the press has to register now, whatever the
         network is doing. Locking on `picked` is what stops a second press
         landing while the first is in flight — and the timer's own `-1` cannot
         race it either, for the same reason. */
      let already = false;
      setState((current) => {
        if (current.picked !== null) {
          already = true;
          return current;
        }
        return { ...current, picked: choice };
      });
      if (already) return;

      const index = state.index;

      if (!resolve) {
        const right = choice === questions[index].answer;
        setRevealed(questions[index].answer);
        if (right) setState((current) => ({ ...current, correct: current.correct + 1 }));
        return;
      }

      void resolve(index, choice)
        .then(({ correct, answer: right }) => {
          setRevealed(right);
          if (correct) setState((current) => ({ ...current, correct: current.correct + 1 }));
        })
        .catch(() => {
          /* The move did not land. The question stays answered — un-answering it
             under the player would be worse — and the server's own tally is the
             one that pays, so a lost move is a question that scored nothing
             rather than a round that broke. */
          setRevealed(-1);
        });
    },
    [questions, resolve, state.index],
  );

  // The clock. Restarts with each question; `answer` freezes it by setting `picked`.
  useEffect(() => {
    if (state.picked !== null) return;
    setLeft(game.seconds);
    const started = Date.now();
    const tick = window.setInterval(() => {
      const remaining = game.seconds - Math.floor((Date.now() - started) / 1000);
      setLeft(Math.max(0, remaining));
      if (remaining <= 0) {
        window.clearInterval(tick);
        answer(-1); // out of time counts as wrong, and moves on
      }
    }, 100);
    return () => window.clearInterval(tick);
  }, [state.index, state.picked, game.seconds, answer]);

  /*
   * Latched, for the same reason `answer` above is a `useCallback`: the beat
   * effect below depends on it and must not restart on every render.
   *
   * `onDone` is `finish` in `GamesApp`, a plain arrow declared in the render
   * body — so it is a *new function on every parent render*, and with it in the
   * dep array each of those renders cleared the 900ms timeout and started it
   * again. A parent re-rendering faster than the beat would postpone the next
   * question indefinitely; one re-rendering slower just makes the beat longer
   * than it reads. A ref is enough because nothing here needs the effect to
   * re-run when the callback changes — it only needs to call the current one.
   */
  const done = useRef(onDone);
  done.current = onDone;

  /*
   * A beat on the answer so the right one can be seen, then the next question —
   * and now there is always a next question until the fifth.
   *
   * **A quiz can no longer be lost.** It used to end the moment the mistake
   * allowance was spent, which meant two wrong answers on question two closed a
   * round the player had paid energy for and left three questions they never
   * saw. What that bought was a fail state on a game whose whole promise is
   * "answer five things"; what it cost was the other three, and the chance to
   * learn anything from them. A wrong answer is now worth nothing and nothing
   * more than nothing.
   */
  useEffect(() => {
    if (state.picked === null) return;
    const next = window.setTimeout(() => {
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      setState((current) => {
        if (current.index + 1 >= questions.length) {
          return current.result ? current : { ...current, result: { correct: current.correct, seconds } };
        }
        return { ...current, index: current.index + 1, picked: null };
      });
      /* Cleared with the question it belonged to. Leaving it set would mark an
         option on the *next* question before it had been answered. */
      setRevealed(null);
    }, 900);
    return () => window.clearTimeout(next);
  }, [state.picked, state.index, questions.length, startedAt]);

  /* The round's end, reported once: `result` goes from `null` to a value a
     single time, and a late verdict's `correct + 1` spreads the same object
     on, so it cannot fire this again. */
  useEffect(() => {
    if (state.result) done.current(state.result.correct, state.result.seconds);
  }, [state.result]);

  /* ── what the screen shows of all that ─────────────────────────────────
     Everything below is read off the state above and writes none of it back:
     the verdict, the host's face, the pips, the set's cue. */

  /* `revealed` is the answer once it is known — immediately on a local round,
     and when the server replies on a server one. */
  const right = resolve ? revealed : question.answer;
  const verdict: 'right' | 'wrong' | null =
    state.picked === null || right === null ? null : state.picked === right ? 'right' : 'wrong';

  /* The five pips: what each question came to, kept for the round. Display
     only — the tally that pays is `state.correct` and the server's. */
  const [marks, setMarks] = useState<('right' | 'wrong')[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const cue = useRef<StageCue>({ kind: 'none', at: 0 });
  useEffect(() => {
    if (!verdict) return;
    cue.current = { kind: verdict, at: performance.now() };
    setMarks((m) => {
      if (m[state.index] === verdict) return m;
      const next = m.slice();
      next[state.index] = verdict;
      return next;
    });
  }, [verdict, state.index]);

  /* Listening while the clock runs; hopping while the server thinks; then the verdict on his face. */
  const pose: PicoPose =
    state.picked === null ? 'idle' : verdict === null ? 'flap' : verdict === 'right' ? 'happy' : 'sad';

  const low = state.picked === null && left <= QUIZ_LOW_SECONDS;
  /* The drain runs on the compositor (a CSS animation the length of the
     question, restarted by `key` and paused on a pick); `--qz-left` is the
     stepped figure the reduced-motion branch shows instead. */
  const drain = {
    animationDuration: `${game.seconds}s`,
    '--qz-left': String(left / game.seconds),
  } as CSSProperties;
  const paused = state.picked !== null ? 'true' : undefined;
  const motif = MOTIF[game.id] ?? 'lab';

  return (
    <div className="round qz" data-stage={motif} ref={root}>
      <StageScene motif={motif} root={root} host={host} cue={cue} country={country} />

      <div className="round-top qz-top">
        <span className="round-count">
          {fill(copy.question, {
            n: String(state.index + 1),
            total: String(questions.length),
          })}
        </span>
        <ol className="qz-track" aria-hidden>
          {questions.map((_, i) => (
            <li key={i} data-mark={marks[i] ?? (i === state.index ? 'now' : undefined)}>
              {marks[i] === 'right' && <Icon name="check" size={10} strokeWidth={3.2} />}
            </li>
          ))}
        </ol>
        <span className="round-clock qz-clock" role="timer" data-low={low ? 'true' : undefined}>
          <svg className="qz-ring" viewBox="0 0 20 20" aria-hidden>
            <circle className="qz-ring-track" cx="10" cy="10" r="8" />
            <circle
              key={state.index}
              className="qz-ring-fill"
              cx="10"
              cy="10"
              r="8"
              pathLength={100}
              style={drain}
              data-paused={paused}
            />
          </svg>
          <span className="visually-hidden">{copy.timeUp} </span>
          {seconds.format(left)}
        </span>
      </div>

      <div className="round-bar qz-bar" data-low={low ? 'true' : undefined}>
        <i key={state.index} style={drain} data-paused={paused} />
      </div>

      <div className="qz-stage">
        <div className="qz-host" ref={host} data-pose={pose}>
          <AnimatedPico pose={pose} />
        </div>
        <div className="qz-card" key={state.index}>
          {question.glyph && (
            <span className="round-glyph" aria-hidden>
              {question.glyph}
            </span>
          )}
          <h2 className="round-q">{question.prompt}</h2>
        </div>
      </div>

      <div className="round-options qz-options" key={state.index}>
        {question.options.map((option, index) => {
          /* After a pick the right answer is always marked, not just the one
             chosen — getting it wrong is the moment you most want to be told
             what it was. Until the verdict is in, only the pressed button is
             marked, and as *chosen* rather than as wrong: calling it wrong
             before the verdict arrives would be a guess, and it would be wrong
             about a fifth of the time. */
          const state_ =
            state.picked === null
              ? undefined
              : right === null
                ? index === state.picked
                  ? 'picked'
                  : undefined
                : index === right
                  ? 'right'
                  : index === state.picked
                    ? 'wrong'
                    : undefined;
          return (
            <button
              key={option}
              type="button"
              className="round-option"
              data-state={state_}
              disabled={state.picked !== null}
              onClick={() => answer(index)}
              style={{ '--i': index } as CSSProperties}
            >
              <span className="qz-key" aria-hidden>
                {KEYS[index] ?? index + 1}
              </span>
              <span className="qz-text">{option}</span>
              <span className="qz-mark" aria-hidden>
                {state_ === 'right' && <Icon name="check" size={16} strokeWidth={2.6} />}
                {state_ === 'wrong' && <Icon name="close" size={14} strokeWidth={2.6} />}
              </span>
            </button>
          );
        })}
      </div>

      <button type="button" className="link-btn round-quit" onClick={onQuit}>
        {copy.quit}
      </button>
    </div>
  );
}
