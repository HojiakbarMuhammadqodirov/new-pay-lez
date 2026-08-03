import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BOARD_TABS, GAME_BOARD, GAME_COUNTRIES, GAMES } from './content';
import { Icon } from './icons';
import { useCopy } from './i18n/context';
import { fill } from './i18n/currency';
import { useAuth } from './auth/context';
import {
  awardFlight,
  awardRound,
  flightPoints,
  MAX_LIVES,
  refillLives,
  type PlayerState,
} from './auth/player';
import { FlightGame } from './flight/FlightGame';
import { PATHS } from './router';
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
 * `flight` is the exception and the only one: an arcade round with no questions
 * to build, which brings its own loop in `flight/FlightGame.tsx`. It rejoins the
 * others at `onDone` — same two arguments, same result card — so everything
 * downstream of a finished round stayed as it was.
 */

type GameId = (typeof GAMES)[number]['id'];
type Game = (typeof GAMES)[number];

interface Question {
  /** The prompt, already assembled. */
  prompt: string;
  /** Shown above the prompt at display size — a flag, or nothing. */
  glyph?: string;
  options: string[];
  answer: number;
}

/* ─────────────────────────────────────────────────────────── the questions ── */

/** Fisher–Yates on a copy. Rounds must not repeat a question. */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Build one round.
 *
 * The written games read their questions straight from the dictionary; the flag
 * and capital games are *generated* from one ten-country table, which is why
 * adding a country gives both games a new question and costs one line in each
 * language rather than two.
 */
function buildRound(
  game: Game,
  copy: ReturnType<typeof useCopy>['games'],
): Question[] {
  /*
   * The arcade round has no bank to draw from. This guard is structural rather
   * than defensive: `GAMES` is one array type, not a union of object types, so
   * `kind === 'text'` below does *not* narrow, and without this an unguarded
   * caller would fall through and silently build the flight game a round of
   * capital cities.
   */
  if (game.kind === 'flight') return [];

  if (game.kind === 'text') {
    const bank = game.id === 'brain' ? copy.brain : copy.poland;
    return shuffled(bank)
      .slice(0, game.questions)
      .map((item) => ({ prompt: item.q, options: item.options, answer: item.a }));
  }

  const picks = shuffled(GAME_COUNTRIES.map((_, index) => index)).slice(0, game.questions);

  return picks.map((index) => {
    /* Three wrong answers drawn from the same table, so a distractor is always
       a plausible country rather than obviously filler. */
    const wrong = shuffled(GAME_COUNTRIES.map((_, i) => i).filter((i) => i !== index)).slice(0, 3);
    const order = shuffled([index, ...wrong]);
    const label = (i: number) =>
      game.kind === 'flag' ? copy.countries[i] : copy.capitals[i];

    return {
      prompt:
        game.kind === 'flag'
          ? copy.whichCountry
          : fill(copy.whichCapital, { country: copy.countries[index] }),
      glyph: game.kind === 'flag' ? GAME_COUNTRIES[index] : undefined,
      options: order.map(label),
      answer: order.indexOf(index),
    };
  });
}

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
  streak,
  scoreLine,
  onAgain,
  onBack,
}: {
  won: boolean;
  correct: number;
  total: number;
  points: number;
  streak: number;
  /** Replaces the "n / m correct" line for a round that does not ask questions. */
  scoreLine?: string;
  onAgain: () => void;
  onBack: () => void;
}) {
  const copy = useCopy().games;

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
      <p className="result-streak">{fill(copy.resultStreak, { streak: String(streak) })}</p>

      <div className="result-actions">
        <button type="button" className="btn btn-solid" onClick={onAgain}>
          {copy.again}
        </button>
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
  const { account, setPlayer } = useAuth();
  const [playing, setPlaying] = useState<GameId | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [result, setResult] = useState<{ won: boolean; correct: number; points: number } | null>(
    null,
  );

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

  if (!player) return null;

  const game = GAMES.find((g) => g.id === playing);

  const start = (id: GameId) => {
    const chosen = GAMES.find((g) => g.id === id);
    if (!chosen || player.lives <= 0) return;
    setQuestions(chosen.kind === 'flight' ? [] : buildRound(chosen, games));
    setResult(null);
    setPlaying(id);
  };

  const finish = (correct: number, won: boolean) => {
    if (!game) return;
    /* Both paths bank `correct x perCorrect` and charge the whole round to
       `answered`; `awardFlight` adds only the clamp a real-time score needs. */
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
    setPlayer(next);
    /* A flight past its target pays for gaps that `correct` deliberately does
       not count, so `correct * perCorrect` is no longer the whole story there. */
    setResult({
      won,
      correct,
      points:
        game.kind === 'flight'
          ? flightPoints(correct, game.perCorrect)
          : correct * game.perCorrect,
    });
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
              streak={player.streak}
              scoreLine={
                game.kind === 'flight'
                  ? fill(games.flight.resultScore, { cleared: String(result.correct) })
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
          ) : playing && game ? (
            <Round
              game={game}
              questions={questions}
              onDone={finish}
              onQuit={() => setPlaying(null)}
            />
          ) : (
            <div className="play-grid">
              {GAMES.map((entry, index) => (
                <article className="play-card" key={entry.id} data-reveal>
                  <span className="play-ico">
                    <Icon name={entry.icon} size={24} />
                  </span>
                  <b>{games.names[index]}</b>
                  {/* A per-question clock means nothing to a round that lasts
                      as long as you do, so the arcade card states its own. */}
                  <span className="play-rule">
                    {entry.kind === 'flight'
                      ? fill(games.flight.rule, { gaps: String(entry.questions) })
                      : fill(games.rule, {
                          questions: String(entry.questions),
                          seconds: String(entry.seconds),
                        })}
                  </span>
                  <span className="play-rule">
                    {entry.kind === 'flight'
                      ? fill(games.flight.reward, { points: String(entry.perCorrect) })
                      : fill(games.reward, {
                          mistakes: String(entry.allowedMistakes),
                          points: String(entry.perCorrect),
                        })}
                  </span>
                  <button
                    type="button"
                    className="btn btn-solid play-start"
                    disabled={player.lives <= 0}
                    onClick={() => start(entry.id)}
                  >
                    {player.lives > 0 ? games.start : games.noLives}
                  </button>
                </article>
              ))}
            </div>
          )}

          <Board player={player} />
        </div>
      </section>
    </main>
  );
}
