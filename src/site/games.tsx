import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { BOARD_TABS, GAME_BOARD, GAMES, VOUCHER_CARDS, type GameId } from './content';
import { Icon } from './icons';
import { useCopy, useLanguage, type LanguageCode } from './i18n/context';
import { fill } from './i18n/currency';
import { useAuth } from './auth/context';
import {
  awardPoints,
  CHEAPEST_VOUCHER,
  ENERGY_REGEN_MINUTES,
  flightAward,
  freezesOf,
  energyOf,
  MAX_FREEZES,
  MAX_ENERGY,
  quizAward,
  type Award,
  type PlayerState,
} from './auth/player';
import { FlightGame } from './flight/FlightGame';
import type { WordList } from './games/banks';
import { MemoryMatch } from './games/MemoryMatch';
import { rulesFor } from './games/rules';
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
 * The layout follows `b2b/Paylez Play.dc.html`, the Play mock: a panel that
 * leads with the balance and the bar it is filling, a stats strip that folds
 * the detail away until asked, one featured game given the width it deserves,
 * and the rest as a grid of cards. The reasoning behind that shape is the
 * mock's and it is right — the version before it opened with four equal figures
 * in a box, which told a player what they had and nothing about what to do next.
 *
 * Two things here are not the mock's, because the product has moved since it was
 * drawn, and both are answers to the same complaint: the screen was flat.
 *
 *   - **The deck.** The points panel has the energy gauge beside it. Energy is
 *     the only limiter on this page now — a round costs one whether it is won or
 *     lost — so it is the figure that decides whether any of the rest of the
 *     screen is reachable, and it was three 15px hearts in a strip of four
 *     readings. It is a count, a cap, and a countdown, at the size of what it
 *     governs.
 *   - **Three card weights.** `PLAY_SIZES` gives the six remaining games a span
 *     apiece, on facts about the games rather than on a ranking of them. Six
 *     interchangeable tiles said every round was the same round.
 *
 * What is *not* carried over is the mock's palette: it gives every game its own
 * hue (amber, lime, violet, coral, sky) and this site has one accent. The cards
 * are told apart by a **texture** instead — a hatch, a grid, a stripe, a dot
 * field, drawn in the accent at a few percent — which does the same job of
 * making six cards six different objects at a glance without a second colour
 * family on the page. `data-texture` on `.play-card` is the whole mechanism; the
 * index into `PLAY_TEXTURES` is positional, like everything else keyed to
 * `GAMES`.
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

type Game = (typeof GAMES)[number];

/**
 * The card textures, index-aligned with `GAMES`.
 *
 * This is what stands in for the mock's six hues. Each name is a pattern in
 * `site.css` drawn from `--accent-rgb` at a few percent — the point is only that
 * neighbouring cards do not look like the same card twice, so the values are
 * chosen to sit next to each other rather than to mean anything. The featured
 * card takes `GAMES[0]`'s, which is why `dots` is first: it is the quietest of
 * the six and the featured card is the largest surface on the page.
 */
const PLAY_TEXTURES = [
  'dots',
  'stripe',
  'orbit',
  'weave',
  'chevron',
  'grid',
  'hatch',
] as const;

/**
 * How much of the grid each game takes, index-aligned with `GAMES` like the
 * textures above. `FEATURED`'s entry is unused — that game is the poster and
 * has its own element — and is kept so the two arrays index the same way.
 *
 * **The size is a fact about the game, not a ranking of it.** Seven cards of
 * identical weight was the flat thing this screen was: a grid of interchangeable
 * tiles says every round is the same round, and they are not. The three quizzes
 * left over after the featured one genuinely *are* siblings — five questions, a
 * clock per question, one mistake allowed, differing only in what is asked — so
 * they read as one set of three small tiles. Squawk's Flight and Memory Match
 * each bring their own board and their own loop, so each gets a half-width
 * poster. Word Builder gets the full width because it is the only card carrying
 * a **control**: the list it is teaching is chosen here, before the round, and a
 * segmented picker crushed into a third of a row is the thing that breaks first.
 *
 * Nothing here is per-player. A layout that reshuffled itself by what you had
 * played would move the card you were reaching for, which is the one thing a
 * grid of buttons must never do.
 */
const PLAY_SIZES = ['lg', 'sm', 'sm', 'sm', 'md', 'md', 'lg'] as const;

/** The game the screen leads with — the first row of `GAMES`, the general quiz. */
const FEATURED = 0;

/** The voucher ladder, cheapest first and deduplicated. */
const TIERS = [...new Set(VOUCHER_CARDS.map((card) => card.points))].sort((a, b) => a - b);

/**
 * The rung the points bar is filling toward: the cheapest card in the catalogue
 * this balance will not yet buy.
 *
 * Read out of `VOUCHER_CARDS` rather than fixed at `CHEAPEST_VOUCHER`, because a
 * bar pinned to 100 is full for every player past their first afternoon and
 * then says nothing for the rest of the account's life. The ladder is real —
 * 100, 200, 300, 400, 500 — so the bar has somewhere to go at every balance. A
 * player who can afford everything gets the top rung and a full bar, which is
 * the honest end of it.
 */
function nextTier(points: number): number {
  return TIERS.find((cost) => cost > points) ?? TIERS[TIERS.length - 1];
}

/**
 * How far the tank is through the unit it is currently earning, plus the two
 * times a CSS animation needs to finish the job without React.
 *
 * The fraction is what the gauge is *at*; `span` and `into` are what let it
 * keep moving between renders. A bar that only advances when React re-renders
 * would step once a minute and read as broken; a bar driven by a per-frame
 * timer would be exactly the thing the root `CLAUDE.md` forbids. Handing CSS a
 * duration and a **negative delay** gets a genuinely live gauge for one
 * declaration and no JavaScript at all — the animation is simply already
 * partway through when it starts, and each re-render re-syncs it.
 *
 * Derived from `nextAt` rather than by asking `energyOf` again: the remainder of
 * its division is exactly this, and computing the count and the wait apart is
 * how the two come to disagree — see the note on `energyOf` itself.
 *
 * A backgrounded tab freezes the document timeline and the animation with it,
 * so a bar left running behind another window comes back a few minutes short.
 * Nothing extra is needed for that: the minute beat below re-renders, the delay
 * is written again, and the animation re-syncs to the real clock. Which is also
 * the answer to a laptop lid closed for a week.
 */
function chargeOf(nextAt: number, now: number): { span: number; into: number; at: number } {
  const span = ENERGY_REGEN_MINUTES * 60_000;
  /* Clamped both ways: a clock dragged backwards must not run the bar past its
     own cell, and a `nextAt` already in the past is a full cell, not a negative
     one. */
  const left = Math.max(0, Math.min(span, nextAt - now));
  return { span, into: span - left, at: (span - left) / span };
}

/**
 * "in 3 hours", in the reader's own language.
 *
 * A tank that fills on a clock has to say when, or it is a wait with no end on
 * it — which is the one way an energy system reads as broken rather than as a
 * cost. The pips say how many; this says how long. It matters more now that
 * every round spends one: an empty tank is a state every player reaches, not
 * only the one losing.
 *
 * The words come from `Intl` rather than from a dictionary key, and this is the
 * one place in the site where that is the *better* owner. A duration belongs to
 * the reader's language — five dictionaries would each have to carry a
 * singular, a plural and, in Russian and Ukrainian, the third form the numbers
 * ending 2, 3 and 4 take, and the platform already knows all of them. Compare
 * `fx.ts`, which refuses `Intl.NumberFormat` for money on the opposite ground:
 * a currency's symbol placement belongs to the *currency*, not to whoever is
 * reading it.
 *
 * One unit, never two. "in 3 hours 12 minutes" is a stopwatch; what a player
 * wants off this line is whether to wait or to go and do something else.
 */
function untilNextEnergy(at: number, now: number, language: LanguageCode): string {
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: 'always' });
  /* Never "in 0 minutes": energy forty seconds away is still a minute away to a
     line that counts in minutes, and rounding it to nothing would show the wait
     as over while the button is still disabled. */
  const minutes = Math.max(1, Math.ceil((at - now) / 60_000));
  return minutes >= 60
    ? rtf.format(Math.round(minutes / 60), 'hour')
    : rtf.format(minutes, 'minute');
}

/*
 * `rulesFor` — the two rule lines under a game's name — used to live here.
 *
 * It moved to `games/rules.ts` when a third screen turned out to be printing
 * the same sentences: the L-Earn marketing section, for a signed-out visitor,
 * had its own hand-written copy of the same four-branch dispatch. Three screens
 * describing seven games from one function is the point; two of them sharing it
 * and one restating it is how the page ends up describing the product two ways.
 */

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

  // A beat on the answer so the right one can be seen, then the next question.
  useEffect(() => {
    if (state.picked === null) return;
    const next = window.setTimeout(() => {
      setState((current) => {
        const last = current.index + 1 >= questions.length;
        if (last || current.wrong > game.allowedMistakes) {
          done.current(current.correct, current.wrong <= game.allowedMistakes);
          return current;
        }
        return { ...current, index: current.index + 1, picked: null };
      });
    }, 900);
    return () => window.clearTimeout(next);
  }, [state.picked, state.index, questions.length, game.allowedMistakes]);

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

      <div className="round-hearts" aria-label={copy.roundMistakes}>
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
  canAgain,
  onAgain,
  onBack,
}: {
  won: boolean;
  correct: number;
  total: number;
  /** What the round paid. The headline figure. */
  points: number;
  /** The balance *after* the round, for the line about what it is worth. */
  balance: number;
  streak: number;
  /** Replaces the "n / m correct" line for a round that does not ask questions. */
  scoreLine?: string;
  /** False when the tank is empty. `start` refuses on no energy, so without this
   *  the one button on the card that a player is certain to press did nothing
   *  at all and gave no reason — the two start buttons already say `noEnergy`.
   *  It fires far more often now: the round that just finished spent one
   *  whether it was won or lost, so "Again" is the press that finds the tank
   *  empty. */
  canAgain: boolean;
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
      {/*
        The gain, at the size the mock gives it.

        A round's whole feedback is one number, and it used to arrive as a line
        of body copy between two other lines of body copy. The kicker above it
        carries what the old `<h2>` said — won or lost — because at this size
        the figure is the headline and a heading over it would be a second one.
      */}
      <span className="result-kicker" data-won={won ? 'true' : undefined}>
        <Icon name={won ? 'trophy' : 'check'} size={14} strokeWidth={2} />
        {won ? copy.wonTitle : copy.lostTitle}
      </span>
      {/* A round that paid nothing still states its figure — leaving it out
          would make the card jump between outcomes — but not in the accent.
          A celebratory 0 is the wrong face for the wrong news. */}
      <b className="result-gain" data-zero={points === 0 ? 'true' : undefined}>
        {points > 0 ? `+${points}` : '0'}
      </b>
      <p className="result-score">
        {scoreLine ?? fill(copy.resultScore, { correct: String(correct), total: String(total) })}
      </p>
      {/* Only a round that needs explaining says anything in words, and with the
          repeat-play taper gone there is exactly one such round left: the one
          that paid nothing. `resultPoints` used to restate the figure directly
          above it, which was fine as a line of body copy and is noise under a
          4.5rem one. */}
      {points === 0 && <p className="result-points">{copy.resultNone}</p>}
      <p className="result-toward">
        {short > 0
          ? fill(copy.resultToward, { points: String(short) })
          : copy.resultAfford}
      </p>
      <p className="result-streak">{fill(copy.resultStreak, { streak: String(streak) })}</p>

      <div className="result-actions">
        <button
          type="button"
          className="btn btn-solid"
          disabled={!canAgain}
          onClick={onAgain}
        >
          {canAgain ? copy.again : copy.noEnergy}
        </button>
        <a className="btn btn-ghost" href={PATHS.vouchers}>
          {copy.resultSpend}
        </a>
      </div>
      {/* Three filled-and-outlined buttons in a row is three offers of equal
          weight, and they are not: one is what you came to do, one is what the
          points are for, and one is a way back. The way back is a link. */}
      <button type="button" className="link-btn result-back" onClick={onBack}>
        {copy.backToGames}
      </button>
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
  /* The detail behind the strip. Shut by default: four figures a player checks
     occasionally should not push the games below the fold every visit. */
  const [statsOpen, setStatsOpen] = useState(false);
  const [result, setResult] = useState<{
    won: boolean;
    correct: number;
    /** What the round paid. */
    points: number;
    balance: number;
  } | null>(null);

  /** Which word list Word Builder is practising. Polish by default: this is a
   *  site for people who have moved to Poland. */
  const [wordList, setWordList] = useState<WordList>('pl');

  const player = account?.player;

  /*
   * The tank, derived on every render rather than stored — `energyOf` in
   * `player.ts` carries the reasoning. Read here, above the early return
   * below, because the timer that watches it is a hook and hooks cannot sit
   * under a conditional.
   */
  const tank = player ? energyOf(player) : null;
  const energy = tank?.count ?? 0;
  const nextEnergyAt = tank?.nextAt ?? null;
  /* The cell in the gauge that is currently filling. `null` on a full tank,
     which is the one state with nothing to draw. */
  const charge = nextEnergyAt === null ? null : chargeOf(nextEnergyAt, Date.now());

  /*
   * Wake the screen when energy lands, and once a minute until it does.
   *
   * Nothing is *written* here and nothing needs to be: the tank is a division
   * against the clock, so the only thing a timer has to do is cause a render.
   * That is the whole of what replaced `refillLives`, which fired on mount and
   * therefore never fired at all in a tab left open past midnight.
   *
   * It is not per-frame work and it is kept that way: one `setState` a minute,
   * which is as often as a line counting in minutes can say anything new — and
   * none at all while a round is running, because nobody is reading the strip
   * mid-round and there is a canvas game mounted under this component. An
   * arrival during a round is picked up by the next render either way.
   */
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (playing || nextEnergyAt === null) return;
    const wait = Math.max(500, Math.min(60_000, nextEnergyAt - Date.now()));
    const id = window.setTimeout(() => setBeat((n) => n + 1), wait);
    return () => window.clearTimeout(id);
    /* `beat` is the dependency that makes this reschedule: the effect re-runs
       because the tick changed it, not because the parent re-rendered — which
       is what stops an unrelated render from postponing the next one for ever,
       the same trap the `done` ref in `Round` above sidesteps. */
  }, [playing, nextEnergyAt, beat]);

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

  /* The points panel's three numbers. `target` is the rung of the voucher
     ladder above this balance, so the bar always has somewhere to go. */
  const target = nextTier(player.points);
  const short = Math.max(0, target - player.points);
  const pct = Math.min(100, Math.round((player.points / target) * 100));

  /**
   * Start a round.
   *
   * Async because the banks are code-split and fetched on first use, which is
   * what `loading` is for. It is not only a label: it is the guard on the door,
   * refusing a second start while one is in flight, because two builds racing
   * would land the loser's questions on the winner's game.
   */
  const start = (id: GameId) => {
    const chosen = GAMES.find((g) => g.id === id);
    if (!chosen || energy <= 0 || loading) return;

    setResult(null);

    /* The three that build their own round need nothing from here. */
    if (chosen.kind !== 'text' && chosen.kind !== 'flag' && chosen.kind !== 'capital') {
      setQuestions([]);
      setPlaying(id);
      return;
    }

    /* Leave the round *before* the build starts, not when it lands.
       "Again" arrives here with `playing` and `questions` still set from the
       round that just finished, and a bank is up to 389 kB — so a round view
       kept alive across the fetch is a live clock over the previous round's
       questions, answered and scored, with the prompts swapping underneath the
       player at whatever index they had reached when the bank arrived. The
       cards, whose buttons already read "Loading…", are the honest screen for
       those few hundred milliseconds. */
    setPlaying(null);

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

  /**
   * Bank a finished round and show the card. One path for all seven.
   *
   * `award.points` is the whole story now. There were two figures here — what a
   * round *scored* and what the day's curve let it *bank* — and the card
   * existed partly to explain the gap between them. The curve is gone: energy
   * is spent by every finished round and is the only limiter left, so a round
   * pays what it scored and the card has one number to show.
   *
   * The `now` is still built once and passed in, because `awardPoints` defaults
   * to a fresh `new Date()` and the streak arithmetic is day-boundary work.
   */
  const bank = (award: Award, correct: number) => {
    const next = awardPoints(player, award, new Date());
    setPlayer(next);
    setResult({
      won: award.won,
      correct,
      points: award.points,
      balance: next.points,
    });
  };

  /** The quiz and arcade path: the round reports right answers, not points. */
  const finish = (correct: number, won: boolean) => {
    if (!game) return;
    bank(
      game.kind === 'flight'
        ? flightAward({
            game: game.id,
            cleared: correct,
            target: game.questions,
            perGap: game.perCorrect,
            won,
          })
        : quizAward({
            game: game.id,
            correct,
            total: game.questions,
            perCorrect: game.perCorrect,
            won,
          }),
      correct,
    );
  };

  /**
   * The two that score themselves.
   *
   * Word Builder's total is five per-word scores plus a perfect-round bonus and
   * Memory Match's is a single band read off the clock — neither is
   * `correct × perCorrect`, and the memory row does not even carry a per-pair
   * figure any more, so they hand over the number rather than the count.
   * `awardPoints` still owns everything that happens to the account, which is
   * why the streak, the lapse and the freeze are not restated in either game.
   */
  const finishScored = (points: number, correct: number, won: boolean) => {
    if (!game) return;
    bank({ game: game.id, points, answered: game.questions, correct, won }, correct);
  };

  return (
    <main>
      <section className="section play" id="games-top">
        <div className="wrap wrap-narrow">
          <div className="app-head" data-reveal>
            <h1>{games.title}</h1>
            <p>{games.lede}</p>
          </div>

          {/*
            ── the deck ──

            The two things a player arrives holding, side by side and at the
            size of the decisions they drive: what the balance is worth, and how
            many rounds are left in the tank.

            They are one row rather than two because they answer one question
            between them. The balance says whether it is worth playing; the
            energy says whether it is *possible* to. A player who reads the
            first and not the second presses a Play button that is disabled and
            is told "out of lives" by a card that cannot say when they come
            back — which is what this screen did, with the whole economy of the
            page rendered as three 15px hearts in a strip of four readings.
          */}
          <div className="play-deck">
            <a className="play-hero" href={PATHS.vouchers} data-reveal>
              <span className="play-hero-glow" aria-hidden />
              <div className="play-hero-main">
                <span className="play-hero-kicker">
                  <i>
                    <Icon name="coin" size={13} strokeWidth={2} />
                  </i>
                  {games.pointsKicker}
                </span>
                <p className="play-hero-line">
                  <b>{fill(games.pointsUnit, { points: String(player.points) })}</b>
                  <span aria-hidden> · </span>
                  {short > 0
                    ? fill(games.pointsGoal, { points: String(short) })
                    : games.pointsHave}
                </p>
                <div className="play-hero-bar">
                  <i style={{ width: `${pct}%` }} />
                </div>
                <div className="play-hero-scale">
                  <span>{player.points}</span>
                  <span>{fill(games.pointsTarget, { points: String(target) })}</span>
                </div>
              </div>
              <span className="play-hero-cta">
                {games.redeemTitle}
                <Icon name="arrow" size={16} strokeWidth={2.4} />
              </span>
            </a>

            {/*
              ── the energy gauge ──

              Three cells, the count above them, and the one sentence that makes a
              wait a wait rather than a fault: when the next one lands.

              It is a *reading*, not a control — nothing here is pressable, and
              that is why it is a `<section>` and not the link its neighbour is.
              The cells carry the state twice on purpose: `data-state` paints
              them, and the `aria-label` on the row says "2/3" for anyone who is
              not looking at paint. The count above is the same figure a third
              time, at the size that lets it be read from across the room, which
              is the whole difference between this and the pips it replaces.

              The middle cell fills *live*, against the real clock, and it does it
              in CSS — see `chargeOf`. Nothing here re-renders to move it.
            */}
            <section
              className="play-energy"
              data-empty={energy === 0 ? 'true' : undefined}
              data-reveal
            >
              <span className="play-energy-glow" aria-hidden />
              <span className="play-energy-kicker">
                <i>
                  <Icon name="spark" size={13} strokeWidth={2} />
                </i>
                {games.energy}
              </span>

              <p className="play-energy-count">
                <b>{energy}</b>
                <span aria-hidden>/{MAX_ENERGY}</span>
              </p>

              <div
                className="play-energy-cells"
                role="img"
                aria-label={`${energy}/${MAX_ENERGY}`}
              >
                {Array.from({ length: MAX_ENERGY }, (_, i) => {
                  const charging = i === energy && charge !== null;
                  return (
                    <span
                      key={i}
                      data-state={i < energy ? 'full' : charging ? 'charging' : 'empty'}
                    >
                      {charging && (
                        <i
                          style={
                            {
                              '--charge': charge.at,
                              '--charge-span': `${charge.span}ms`,
                              '--charge-delay': `-${charge.into}ms`,
                            } as CSSProperties
                          }
                        />
                      )}
                    </span>
                  );
                })}
              </div>

              {/* An empty tank says so in words before it says when. The
                  countdown alone answers a question a player who has just been
                  refused a round has not asked yet. */}
              {energy === 0 && <p className="play-energy-out">{games.noEnergy}</p>}

              <p className="play-energy-line">
                {nextEnergyAt === null
                  ? games.energyFull
                  : `+1 ${untilNextEnergy(nextEnergyAt, Date.now(), language)}`}
              </p>
              <p className="play-energy-cost">{games.energyCost}</p>
            </section>
          </div>

          {/*
            ── the stats strip ──

            The readings a player checks constantly, and a disclosure for the
            four they do not. Freezes stay in the top line next to the streak
            they protect, because the whole point of a freeze is knowing you
            have one *before* the day you need it. Spending is automatic (see
            `awardPoints`), so every figure here is a reading and none of them
            is a control.

            **Energy is no longer one of them.** It was the fourth pill in this
            row and it is the gauge in the deck above now: it is the only
            reading here that decides whether the rest of the page works, and a
            figure that gates every button on the screen cannot be the same size
            as the count of questions you have ever answered. What is left in
            the row are three readings that are genuinely glanceable — and they
            fit the line without wrapping in five languages now that the pips
            and their countdown have gone.
          */}
          <div className="play-strip" data-reveal>
            <div className="play-strip-row">
              <span className="play-stat">
                <Icon name="coin" size={15} />
                <em>{games.streak}</em>
                <b>{player.streak}</b>
              </span>
              <span className="play-stat">
                <Icon name="freeze" size={15} />
                <em>{games.freezes}</em>
                <b
                  className="play-pips"
                  aria-label={`${freezesOf(player)}/${MAX_FREEZES}`}
                >
                  {Array.from({ length: MAX_FREEZES }, (_, i) => (
                    <i key={i} data-spent={i >= freezesOf(player) ? 'true' : undefined}>
                      <Icon name="freeze" size={15} strokeWidth={2} />
                    </i>
                  ))}
                </b>
              </span>
              <span className="play-stat">
                <Icon name="trophy" size={15} />
                <em>{games.score}</em>
                <b>{player.points}</b>
              </span>

              <button
                type="button"
                className="play-stats-toggle"
                aria-expanded={statsOpen}
                onClick={() => setStatsOpen((open) => !open)}
              >
                {games.statsToggle}
                <Icon name="chevron" size={14} strokeWidth={2.2} />
              </button>
            </div>

            {statsOpen && (
              <div className="play-stats">
                <div>
                  <span>{games.answered}</span>
                  <b>{player.answered}</b>
                </div>
                <div>
                  <span>{games.correctLabel}</span>
                  <b>{player.correct}</b>
                </div>
                <div>
                  <span>{games.accuracy}</span>
                  {/* Zero answered is zero percent, not a division by it. */}
                  <b data-lit="true">
                    {player.answered > 0
                      ? Math.round((player.correct / player.answered) * 100)
                      : 0}
                    %
                  </b>
                </div>
                {/* The reward connection, on the screen rather than only on the
                    result card: what the balance is actually for. */}
                <div>
                  <span>{games.toVoucher}</span>
                  <b>{Math.max(0, CHEAPEST_VOUCHER - player.points)}</b>
                </div>
              </div>
            )}
          </div>

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
              canAgain={energy > 0}
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
            <>
              {/*
                ── the featured game ──

                One game given the width of the page, the way the mock leads
                with its daily quiz. It is `GAMES[FEATURED]` rather than a row
                of its own, so the featured card and the grid card below it read
                the same table and cannot disagree about what the game pays.
              */}
              {(() => {
                const entry = GAMES[FEATURED];
                const rules = rulesFor(entry, games);
                return (
                  <article
                    className="play-feature"
                    data-texture={PLAY_TEXTURES[FEATURED]}
                    data-reveal
                  >
                    <span className="play-feature-glow" aria-hidden />
                    <div className="play-feature-main">
                      <span className="play-badge">
                        <Icon name="coin" size={13} strokeWidth={2} />
                        {games.featured}
                      </span>
                      <h2>{games.names[FEATURED]}</h2>
                      <p className="play-feature-rules">{rules.join(' · ')}</p>
                      <button
                        type="button"
                        className="btn btn-solid play-feature-cta"
                        disabled={energy <= 0 || loading}
                        onClick={() => start(entry.id)}
                      >
                        {loading
                          ? games.loading
                          : energy > 0
                            ? games.start
                            : games.noEnergy}
                        {energy > 0 && !loading && (
                          <Icon name="arrow" size={16} strokeWidth={2.4} />
                        )}
                      </button>
                    </div>
                    <span className="play-feature-ico" aria-hidden>
                      <Icon name={entry.icon} size={64} strokeWidth={1.3} />
                    </span>
                  </article>
                );
              })()}

              {/*
                ── the rest of the catalogue ──

                Three sizes rather than six identical tiles — see `PLAY_SIZES`
                for which game gets which and why. The size decides the
                *composition*, not just the span: a small card stacks, a medium
                one puts its framed icon beside the copy the way the poster
                above does, and the wide one gives its picker a column of its
                own. Six cards that differ only in their texture were still six
                of the same object.

                `--i` is the card's place in the row, and the sheet turns it
                into a reveal delay — the grid arrives as a cascade rather than
                as one block. `useReveal` already skips the whole thing under
                `prefers-reduced-motion`.
              */}
              <div className="play-grid">
                {GAMES.map((entry, index) => {
                  if (index === FEATURED) return null;
                  const rules = rulesFor(entry, games);
                  const size = PLAY_SIZES[index];

                  return (
                    <article
                      className="play-card"
                      key={entry.id}
                      data-size={size}
                      data-texture={PLAY_TEXTURES[index]}
                      data-reveal
                      style={{ '--i': index } as CSSProperties}
                    >
                      <div className="play-card-main">
                        <div className="play-card-head">
                          <span className="play-ico">
                            <Icon name={entry.icon} size={size === 'sm' ? 20 : 24} />
                          </span>
                          <b>{games.names[index]}</b>
                        </div>

                        {/* One line on a small tile, two on the others. The
                            rules are the same pair either way — `rulesFor` is
                            the only thing that says what a game is — but three
                            tiles in a row are read by scanning down them, and a
                            two-line block per tile turns that scan into
                            reading. */}
                        {size === 'sm' ? (
                          <span className="play-rule">{rules.join(' · ')}</span>
                        ) : (
                          rules.map((rule) => (
                            <span className="play-rule" key={rule}>
                              {rule}
                            </span>
                          ))
                        )}
                      </div>

                      {/* `.play-card-main` above takes the slack, which is what
                          lines the buttons up along the bottom of a row of
                          cards whose names wrap to different heights. */}
                      <div className="play-card-side">
                        {/* Word Builder picks the language it is teaching, on the
                            card, before the round starts — the choice belongs to
                            the game rather than to the site's own switcher, which
                            decides what you *read*, not what you are learning.
                            It is why this card is the wide one. */}
                        {entry.kind === 'word' && (
                          <div
                            className="play-pick"
                            role="group"
                            aria-label={games.wordGame.list}
                          >
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
                          disabled={energy <= 0 || loading}
                          onClick={() => start(entry.id)}
                        >
                          {loading
                            ? games.loading
                            : energy > 0
                              ? games.play
                              : games.noEnergy}
                        </button>
                      </div>

                      {/* The glyph again, at poster size, on the two cards that
                          have the room for it. It is the card's own icon rather
                          than a second drawing, and it is drawn in the texture's
                          own register — a mark on the surface, not an object on
                          it — so a medium card reads as a place rather than as a
                          taller tile. */}
                      {size === 'md' && (
                        <span className="play-mark" aria-hidden>
                          <Icon name={entry.icon} size={112} strokeWidth={1} />
                        </span>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}

          <Board player={player} />
        </div>
      </section>
    </main>
  );
}
