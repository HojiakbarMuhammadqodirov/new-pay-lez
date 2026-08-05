import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BOARD_TABS, GAME_BOARD, GAMES } from './content';
import { Icon } from './icons';
import { useCopy, useLanguage } from './i18n/context';
import { fill } from './i18n/currency';
import { useAuth } from './auth/context';
import {
  awardFlight,
  awardPoints,
  awardRound,
  CHEAPEST_VOUCHER,
  flightPoints,
  freezesOf,
  MAX_FREEZES,
  MAX_LIVES,
  refillLives,
  type PlayerState,
} from './auth/player';
import { FlightGame } from './flight/FlightGame';
import type { WordList } from './games/banks';
import { MemoryMatch } from './games/MemoryMatch';
import {
  buildCapitalRound,
  buildFlagRound,
  buildQuizRound,
  type Question,
} from './games/rounds';
import { WordBuilder } from './games/WordBuilder';
import { PATHS } from './router';
import { useReveal } from './useReveal';
import '../components/GlobeHero/ui/flagFont.css';

/**
 * L-Earn, for someone who is signed in — the games themselves rather than a page
 * describing them.
 *
 * Rebuilt from the old paylez app (`landing/screenshots/learn1.png` …
 * `learn5.png`): the stats bar, the redeem strip, the game cards, and a
 * leaderboard with two orderings. What is *not* carried over is that app's
 * palette — a game per gradient — because this site has one accent. The games
 * are told apart by their icon, their name and their rules, which is what a
 * player actually reads.
 *
 * The four *quiz* rounds run through one engine. They differ only in how a
 * question is built (`kind` in `GAMES`) and what it pays, so there is one timer
 * and one scoring path rather than four of each.
 *
 * Three rounds are not quizzes and each brings its own loop: `flight`
 * (`flight/FlightGame.tsx`), `memory` and `word` (`games/`). All three rejoin
 * the others at `onDone` and end on the same result card, so everything
 * downstream of a finished round is one path.
 *
 * **Building a round is asynchronous now.** The questions used to be a handful
 * of items sitting in the dictionaries; they come from the generated banks in
 * `games/data/` — 2102 general questions and 196 flags among them — which are
 * code-split and fetched the first time a game is opened. Hence the `loading`
 * state on the card that starts one, and hence `useReveal` below.
 */

type GameId = (typeof GAMES)[number]['id'];
type Game = (typeof GAMES)[number];

/* ──────────────────────────────────────────────────────────────── the round ── */

interface RoundState {
  index: number;
  correct: number;
  wrong: number;
  /** The option the player just chose, held for the moment of feedback. */
  picked: number | null;
}

function Round({
  game,
  questions,
  onDone,
  onQuit,
}: {
  game: Game;
  questions: Question[];
  onDone: (correct: number, won: boolean) => void;
  onQuit: () => void;
}) {
  const copy = useCopy().games;
  const [state, setState] = useState<RoundState>({
    index: 0,
    correct: 0,
    wrong: 0,
    picked: null,
  });
  const [left, setLeft] = useState(game.seconds);
  const question = questions[state.index];

  /*
   * One `answer` for every way a question can end, including running out of
   * time (`choice === -1`). Wrapped in a ref-stable callback because the timer
   * effect below depends on it and must not restart on every render.
   */
  const answer = useCallback(
    (choice: number) => {
      setState((current) => {
        if (current.picked !== null) return current; // already answered
        const right = choice === questions[current.index].answer;
        return {
          ...current,
          picked: choice,
          correct: current.correct + (right ? 1 : 0),
          wrong: current.wrong + (right ? 0 : 1),
        };
      });
    },
    [questions],
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

  // A beat on the answer so the right one can be seen, then the next question.
  useEffect(() => {
    if (state.picked === null) return;
    const next = window.setTimeout(() => {
      setState((current) => {
        const last = current.index + 1 >= questions.length;
        if (last || current.wrong > game.allowedMistakes) {
          onDone(current.correct, current.wrong <= game.allowedMistakes);
          return current;
        }
        return { ...current, index: current.index + 1, picked: null };
      });
    }, 900);
    return () => window.clearTimeout(next);
  }, [state.picked, state.index, questions.length, game.allowedMistakes, onDone]);

  const pct = (left / game.seconds) * 100;

  return (
    <div className="round">
      <div className="round-top">
        <span className="round-count">
          {fill(copy.question, {
            n: String(state.index + 1),
            total: String(questions.length),
          })}
        </span>
        <span className="round-clock" data-low={left <= 3 ? 'true' : undefined}>
          {copy.timeUp} {left}s
        </span>
      </div>

      <div className="round-bar">
        <i style={{ width: `${pct}%` }} />
      </div>

      <div className="round-hearts" aria-label={copy.lives}>
        {Array.from({ length: game.allowedMistakes + 1 }, (_, i) => (
          <span key={i} data-spent={i < state.wrong ? 'true' : undefined}>
            ♥
          </span>
        ))}
      </div>

      {question.glyph && (
        <span className="round-glyph" aria-hidden>
          {question.glyph}
        </span>
      )}
      <h2 className="round-q">{question.prompt}</h2>

      <div className="round-options">
        {question.options.map((option, index) => {
          /* After a pick the right answer is always marked, not just the one
             chosen — getting it wrong is the moment you most want to be told
             what it was. */
          const state_ =
            state.picked === null
              ? undefined
              : index === question.answer
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
            >
              {option}
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

/* ───────────────────────────────────────────────────────────────── results ── */

function Result({
  won,
  correct,
  total,
  points,
  balance,
  streak,
  scoreLine,
  onAgain,
  onBack,
}: {
  won: boolean;
  correct: number;
  total: number;
  points: number;
  /** The balance *after* the round, for the line about what it is worth. */
  balance: number;
  streak: number;
  /** Replaces the "n / m correct" line for a round that does not ask questions. */
  scoreLine?: string;
  onAgain: () => void;
  onBack: () => void;
}) {
  const copy = useCopy().games;

  /*
   * How far off the cheapest voucher is.
   *
   * The supplied games spec is emphatic about this and it is right: a bare score
   * is a dead end, and "+40 points" means nothing until it is "+40 points, 60
   * from a discount". This is the line that makes a second round worth playing,
   * so it is on every result card rather than only on the good ones.
   */
  const short = Math.max(0, CHEAPEST_VOUCHER - balance);

  return (
    <div className="round round-result">
      <span className="result-ico" data-won={won ? 'true' : undefined}>
        <Icon name={won ? 'trophy' : 'check'} size={26} strokeWidth={1.8} />
      </span>
      <h2>{won ? copy.wonTitle : copy.lostTitle}</h2>
      <p className="result-score">
        {scoreLine ?? fill(copy.resultScore, { correct: String(correct), total: String(total) })}
      </p>
      <p className="result-points">
        {points > 0 ? fill(copy.resultPoints, { points: String(points) }) : copy.resultNone}
      </p>
      <p className="result-toward">
        {short > 0
          ? fill(copy.resultToward, { points: String(short) })
          : copy.resultAfford}
      </p>
      <p className="result-streak">{fill(copy.resultStreak, { streak: String(streak) })}</p>

      <div className="result-actions">
        <button type="button" className="btn btn-solid" onClick={onAgain}>
          {copy.again}
        </button>
        <a className="btn btn-ghost" href={PATHS.vouchers}>
          {copy.resultSpend}
        </a>
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          {copy.backToGames}
        </button>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── leaderboard ── */

function Board({ player }: { player: PlayerState }) {
  const copy = useCopy().games;
  const [tab, setTab] = useState(0);
  const [all, setAll] = useState(false);

  /* The signed-in player is *in* the board, ranked with everyone else — a
     leaderboard you are not on is a table of strangers. */
  const rows = useMemo(() => {
    const me = {
      code: 'You',
      correct: player.correct,
      points: player.points,
      streak: player.streak,
      me: true,
    };
    const key = BOARD_TABS[tab];
    return [...GAME_BOARD.map((r) => ({ ...r, me: false })), me].sort(
      (a, b) => b[key] - a[key],
    );
  }, [tab, player.correct, player.points, player.streak]);

  const shown = all ? rows : rows.slice(0, 3);

  return (
    <div className="play-board">
      <div className="play-tabs" role="tablist">
        {copy.boardTabs.map((label, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={tab === index}
            data-on={tab === index ? 'true' : undefined}
            onClick={() => setTab(index)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="console play-board-card">
        <div className="play-board-head">
          <span>
            <Icon name="trophy" size={17} />
            {copy.boardTitle}
          </span>
          <b>{copy.boardTop}</b>
        </div>

        {shown.length === 0 ? (
          <p className="play-board-empty">{copy.boardEmpty}</p>
        ) : (
          <ul className="play-rows">
            {shown.map((row, index) => (
              <li key={row.code} data-me={row.me ? 'true' : undefined}>
                <span className="play-rank">{index + 1}</span>
                <span className="play-who">
                  <b>{row.code}</b>
                  <span>{fill(copy.boardStreak, { n: String(row.streak) })}</span>
                </span>
                <span className="play-score">
                  <b>{tab === 0 ? row.correct : row.points}</b>
                  <span>{tab === 0 ? copy.boardCorrect : copy.boardPoints}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <button type="button" className="play-more" onClick={() => setAll((on) => !on)}>
          {all ? copy.boardShowLess : copy.boardShowAll}
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── page ── */

export function GamesApp() {
  const copy = useCopy();
  const games = copy.games;
  const [language] = useLanguage();
  const { account, setPlayer } = useAuth();
  const [playing, setPlaying] = useState<GameId | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    won: boolean;
    correct: number;
    points: number;
    balance: number;
  } | null>(null);

  /** Which word list Word Builder is practising. Polish by default: this is a
   *  site for people who have moved to Poland. */
  const [wordList, setWordList] = useState<WordList>('pl');

  const player = account?.player;

  /* Lives come back with a new day. Done on mount rather than on a timer:
     nothing else can change the answer while the page is open. */
  const refilled = useRef(false);
  useEffect(() => {
    if (!player || refilled.current) return;
    refilled.current = true;
    const next = refillLives(player);
    if (next !== player) setPlayer(next);
  }, [player, setPlayer]);

  /*
   * Re-run the reveal scan whenever this screen swaps what it is showing.
   *
   * `Site` scans once per route, language and account type — none of which
   * changes when a round starts or ends. So the game cards, which carry
   * `data-reveal`, came back from a finished round with no `data-shown` on them
   * and sat at `opacity: 0` for good: the games vanished the moment you played
   * one. Everything mounted after the observer was built is invisible to it, and
   * the fix is the one the root `CLAUDE.md` already prescribes — re-scan on the
   * thing that replaced the DOM.
   */
  const view = playing ?? (result ? 'result' : 'cards');
  useReveal(`games:${view}:${loading}`);

  if (!player) return null;

  const game = GAMES.find((g) => g.id === playing);

  /**
   * Start a round.
   *
   * Async because the banks are code-split and fetched on first use. `live`
   * guards the obvious race: quitting or starting another game before a 389 kB
   * bank lands would otherwise drop a finished round of the wrong game onto the
   * screen.
   */
  const start = (id: GameId) => {
    const chosen = GAMES.find((g) => g.id === id);
    if (!chosen || player.lives <= 0 || loading) return;

    setResult(null);

    /* The three that build their own round need nothing from here. */
    if (chosen.kind !== 'text' && chosen.kind !== 'flag' && chosen.kind !== 'capital') {
      setQuestions([]);
      setPlaying(id);
      return;
    }

    setLoading(true);
    const build =
      chosen.kind === 'text'
        ? buildQuizRound(
            chosen.id === 'brain' ? 'general' : 'poland',
            language,
            chosen.questions,
          )
        : chosen.kind === 'flag'
          ? buildFlagRound(language, chosen.questions, games.whichCountry)
          : buildCapitalRound(language, chosen.questions, (country) =>
              fill(games.whichCapital, { country }),
            );

    build
      .then((built) => {
        setQuestions(built);
        setPlaying(id);
      })
      .catch(() => {
        /* A bank that will not load is the one failure with no good screen: the
           honest thing is to stay on the cards rather than open an empty round. */
        setPlaying(null);
      })
      .finally(() => setLoading(false));
  };

  /** Bank whatever the round scored and show the card. One path for all seven. */
  const bank = (
    next: PlayerState,
    { won, correct, points }: { won: boolean; correct: number; points: number },
  ) => {
    setPlayer(next);
    setResult({ won, correct, points, balance: next.points });
  };

  /** The quiz and arcade path: the round reports right answers, not points. */
  const finish = (correct: number, won: boolean) => {
    if (!game) return;
    const next =
      game.kind === 'flight'
        ? awardFlight(player, {
            cleared: correct,
            target: game.questions,
            perGap: game.perCorrect,
            won,
          })
        : awardRound(player, {
            correct,
            total: game.questions,
            perCorrect: game.perCorrect,
            won,
          });
    /* A flight past its target pays for gaps that `correct` deliberately does
       not count, so `correct * perCorrect` is no longer the whole story there. */
    bank(next, {
      won,
      correct,
      points:
        game.kind === 'flight'
          ? flightPoints(correct, game.perCorrect)
          : correct * game.perCorrect,
    });
  };

  /**
   * The two that score themselves.
   *
   * Word Builder's total is five per-word scores plus a perfect-round bonus and
   * Memory Match's is a base plus an efficiency curve — neither is
   * `correct × perCorrect`, so they hand over the number rather than the count.
   * `awardPoints` still owns everything that happens to the account, which is
   * why the streak, the lapse and the freeze are not restated in either game.
   */
  const finishScored = (points: number, correct: number, won: boolean) => {
    if (!game) return;
    bank(
      awardPoints(player, { points, answered: game.questions, correct, won }),
      { won, correct, points },
    );
  };

  return (
    <main>
      <section className="section play" id="games-top">
        <div className="wrap wrap-narrow">
          <div className="app-head" data-reveal>
            <h1>{games.title}</h1>
            <p>{games.lede}</p>
          </div>

          {/* ── the stats bar ── */}
          <div className="stat-bar" data-reveal>
            <div className="stat-row">
              <div className="stat">
                <span>
                  <Icon name="trophy" size={15} />
                  {games.score}
                </span>
                <b>{player.points}</b>
              </div>
              <div className="stat">
                <span>
                  <Icon name="coin" size={15} />
                  {games.streak}
                </span>
                <b>{player.streak}</b>
              </div>
              <div className="stat">
                <span>
                  <Icon name="check" size={15} />
                  {games.lives}
                </span>
                <b className="stat-hearts" aria-label={`${player.lives}/${MAX_LIVES}`}>
                  {Array.from({ length: MAX_LIVES }, (_, i) => (
                    <i key={i} data-spent={i >= player.lives ? 'true' : undefined}>
                      ♥
                    </i>
                  ))}
                </b>
              </div>
              {/*
                Freezes held.

                Shown next to the streak it protects rather than tucked into the
                sub-row, because the whole point of a freeze is knowing you have
                one *before* the day you need it. Spending is automatic (see
                `awardPoints`), so this is a reading, not a control.
              */}
              <div className="stat">
                <span>
                  <Icon name="freeze" size={15} />
                  {games.freezes}
                </span>
                <b
                  className="stat-hearts"
                  aria-label={`${freezesOf(player)}/${MAX_FREEZES}`}
                >
                  {Array.from({ length: MAX_FREEZES }, (_, i) => (
                    <i key={i} data-spent={i >= freezesOf(player) ? 'true' : undefined}>
                      <Icon name="freeze" size={19} strokeWidth={2} />
                    </i>
                  ))}
                </b>
              </div>
            </div>

            <div className="stat-sub">
              <div>
                <span>{games.answered}</span>
                <b>{player.answered}</b>
              </div>
              <div>
                <span>{games.correctLabel}</span>
                <b>{player.correct}</b>
              </div>
              {/* The reward connection, on the screen rather than only on the
                  result card: what the balance is actually for. */}
              <div>
                <span>{games.toVoucher}</span>
                <b>{Math.max(0, CHEAPEST_VOUCHER - player.points)}</b>
              </div>
            </div>
          </div>

          {/* ── redeem strip ── */}
          <a className="redeem-strip" href={PATHS.vouchers} data-reveal>
            <span className="redeem-ico">
              <Icon name="gift" size={20} />
            </span>
            <b>{games.redeemTitle}</b>
            <span className="redeem-go">
              {games.redeemAction}
              <Icon name="arrow" size={15} strokeWidth={2.4} />
            </span>
          </a>

          {/* ── in play, or the cards ── */}
          {result && game ? (
            <Result
              won={result.won}
              correct={result.correct}
              total={game.questions}
              points={result.points}
              balance={result.balance}
              streak={player.streak}
              scoreLine={
                game.kind === 'flight'
                  ? fill(games.flight.resultScore, { cleared: String(result.correct) })
                  : game.kind === 'memory'
                    ? fill(games.memory.resultScore, { pairs: String(result.correct) })
                    : game.kind === 'word'
                      ? fill(games.wordGame.resultScore, {
                          solved: String(result.correct),
                          total: String(game.questions),
                        })
                      : undefined
              }
              onAgain={() => start(game.id)}
              onBack={() => {
                setPlaying(null);
                setResult(null);
              }}
            />
          ) : playing && game && game.kind === 'flight' ? (
            <FlightGame game={game} onDone={finish} onQuit={() => setPlaying(null)} />
          ) : playing && game && game.kind === 'memory' ? (
            <MemoryMatch
              pairs={game.questions}
              onDone={finishScored}
              onQuit={() => setPlaying(null)}
            />
          ) : playing && game && game.kind === 'word' ? (
            <WordBuilder
              words={game.questions}
              list={wordList}
              onDone={finishScored}
              onQuit={() => setPlaying(null)}
            />
          ) : playing && game ? (
            <Round
              game={game}
              questions={questions}
              onDone={finish}
              onQuit={() => setPlaying(null)}
            />
          ) : (
            <div className="play-grid">
              {GAMES.map((entry, index) => {
                /*
                 * Each row of `GAMES` reads its own columns (see the table's
                 * comment), so the two rule lines are per kind rather than one
                 * sentence with four holes in it. A per-question clock means
                 * nothing to a round that lasts as long as you do, and "one
                 * mistake allowed" means nothing to a board you cannot lose.
                 */
                const rules =
                  entry.kind === 'flight'
                    ? [
                        fill(games.flight.rule, { gaps: String(entry.questions) }),
                        fill(games.flight.reward, { points: String(entry.perCorrect) }),
                      ]
                    : entry.kind === 'memory'
                      ? [
                          fill(games.memory.rule, { pairs: String(entry.questions) }),
                          fill(games.memory.reward, { points: String(entry.perCorrect) }),
                        ]
                      : entry.kind === 'word'
                        ? [
                            fill(games.wordGame.rule, { words: String(entry.questions) }),
                            games.wordGame.reward,
                          ]
                        : [
                            fill(games.rule, {
                              questions: String(entry.questions),
                              seconds: String(entry.seconds),
                            }),
                            fill(games.reward, {
                              mistakes: String(entry.allowedMistakes),
                              points: String(entry.perCorrect),
                            }),
                          ];

                return (
                  <article className="play-card" key={entry.id} data-reveal>
                    <span className="play-ico">
                      <Icon name={entry.icon} size={24} />
                    </span>
                    <b>{games.names[index]}</b>
                    {rules.map((rule) => (
                      <span className="play-rule" key={rule}>
                        {rule}
                      </span>
                    ))}

                    {/* Word Builder picks the language it is teaching, on the
                        card, before the round starts — the choice belongs to
                        the game rather than to the site's own switcher, which
                        decides what you *read*, not what you are learning. */}
                    {entry.kind === 'word' && (
                      <div className="play-pick" role="group" aria-label={games.wordGame.list}>
                        {(['pl', 'en'] as const).map((option) => (
                          <button
                            key={option}
                            type="button"
                            data-on={wordList === option ? 'true' : undefined}
                            onClick={() => setWordList(option)}
                          >
                            {games.wordGame.lists[option]}
                          </button>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      className="btn btn-solid play-start"
                      disabled={player.lives <= 0 || loading}
                      onClick={() => start(entry.id)}
                    >
                      {loading
                        ? games.loading
                        : player.lives > 0
                          ? games.start
                          : games.noLives}
                    </button>
                  </article>
                );
              })}
            </div>
          )}

          <Board player={player} />
        </div>
      </section>
    </main>
  );
}
