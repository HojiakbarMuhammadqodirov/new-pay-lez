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
import { fxForCountry } from './i18n/fx';
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
  streakWeek,
  type Award,
  type PlayerState,
} from './auth/player';
import { FlightGame } from './flight/FlightGame';
import { wordListFor, type WordList } from './games/banks';
import { MemoryMatch } from './games/MemoryMatch';
import { GamePreview } from './games/preview';
import { gameName, rulesFor } from './games/rules';
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
 * leads with the balance and the bar it is filling, one featured game given the
 * width it deserves, and the rest as a grid of cards. The reasoning behind that
 * shape is the mock's and it is right — the version before it opened with four
 * equal figures in a box, which told a player what they had and nothing about
 * what to do next.
 *
 * Four things here are not the mock's, because the product has moved since it
 * was drawn.
 *
 *   - **The deck.** The points panel has the battery beside it. Energy is the
 *     only limiter on this page — a round costs one whether it is won or lost —
 *     so it is the figure that decides whether any of the rest of the screen is
 *     reachable, and it was three 15px hearts in a strip of four readings. It is
 *     a count, a cap and a countdown, drawn as the object everybody already
 *     knows how to read: cells in a case, filling.
 *   - **The week.** The streak was a number in a strip. It is seven circles now,
 *     Monday to Sunday, with a **currency mark** in each day kept — because the
 *     streak's whole argument is that showing up is worth money, and a bare
 *     integer makes that argument to nobody. The freezes sit beside it at the
 *     same size, on the same line and inside no box, because a freeze is only
 *     any use if you know you have one *before* the day you need it.
 *   - **One card, one press.** Every tile in the grid is a `<button>`. That is
 *     what allowed the hover to take the description and the Play label away —
 *     there is nothing left to aim at, because the card itself is the target —
 *     and it is why Word Builder is two rows in `GAMES` rather than one row with
 *     a picker on it (see the table's own note).
 *   - **The preview.** A hovered card blurs its neighbours and plays a small,
 *     wordless picture of its own round underneath the name. It replaced a set
 *     of repeating background textures whose only job was to stop six tiles
 *     looking like one tile six times — which they did, at the cost of saying
 *     nothing about the games. A picture of the round says both.
 *
 * The four *quiz* rounds run through one engine. They differ only in how a
 * question is built (`kind` in `GAMES`) and what it pays, so there is one timer
 * and one scoring path rather than four of each.
 *
 * Four rounds are not quizzes and each brings its own loop: `flight`
 * (`flight/FlightGame.tsx`), `memory` and the two `word` rows (`games/`). All of
 * them rejoin the others at `onDone` and end on the same result card, so
 * everything downstream of a finished round is one path.
 *
 * **Building a round is asynchronous.** The questions used to be a handful of
 * items sitting in the dictionaries; they come from the generated banks in
 * `games/data/` — 2102 general questions and 196 flags among them — which are
 * code-split and fetched the first time a game is opened. Hence the `loading`
 * state on the card that starts one, and hence `useReveal` below.
 */

type Game = (typeof GAMES)[number];

/**
 * The game the screen leads with: `GAMES[0]`, whatever that row is.
 *
 * A constant rather than a search, because the order in `content.ts` *is* the
 * layout — the first row is the poster and the rest fill the grid — and the two
 * facts are one fact. Nothing picks a featured game at render, and nothing
 * should: "today's game" changing under somebody who came back for the card
 * they saw yesterday is the same failure as a grid that reshuffles itself.
 */
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
 * "3h 12m", or "45m" under the hour, in the reader's own language.
 *
 * A tank that fills on a clock has to say when, or it is a wait with no end on
 * it — which is the one way an energy system reads as broken rather than as a
 * cost. The battery says how many; this says how long.
 *
 * The words come from `Intl` rather than from a dictionary key, and this is one
 * of two places in the site where that is the *better* owner (the other is the
 * weekday letters on the streak row). A duration belongs to the reader's
 * language — five dictionaries would each have to carry a singular, a plural
 * and, in Russian and Ukrainian, the third form the numbers ending 2, 3 and 4
 * take, and the platform already knows all of them. Compare `fx.ts`, which
 * refuses `Intl.NumberFormat` for money on the opposite ground: a currency's
 * symbol placement belongs to the *currency*, not to whoever is reading it.
 *
 * **Two units now, not one.** The rule written here used to be the opposite —
 * one unit, on the grounds that "in 3 hours 12 minutes" is a stopwatch and what
 * a player wants is whether to wait or go and do something else. That was right
 * about a sentence under the gauge and wrong about a figure beside the count,
 * which is where this reads now: somebody looking at it has already decided to
 * wait and is asking how long, and "in 3 hours" leaves them checking back at a
 * quarter past. Under the hour there is only ever one unit anyway.
 *
 * `unitDisplay: 'narrow'` is what keeps it to a chip — "3h" in English, "3 ч"
 * in Russian — rather than the "3 hours" `RelativeTimeFormat` was giving. The
 * cost is that the platform no longer supplies the "in", so the frame around
 * this is a dictionary string (`energyNext`) and only the frame.
 */
function untilNextEnergy(at: number, now: number, language: LanguageCode): string {
  const unit = (value: number, which: 'hour' | 'minute') =>
    new Intl.NumberFormat(language, {
      style: 'unit',
      unit: which,
      unitDisplay: 'narrow',
    }).format(value);

  /* Never "0m": energy forty seconds away is still a minute away to a line that
     counts in minutes, and rounding it to nothing would show the wait as over
     while the button is still disabled. */
  const minutes = Math.max(1, Math.ceil((at - now) / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return unit(minutes, 'minute');
  /* An exact hour drops the zero rather than printing "3h 0m", which is a
     stopwatch reading a clock face. */
  return rest === 0 ? unit(hours, 'hour') : `${unit(hours, 'hour')} ${unit(rest, 'minute')}`;
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

/* ─────────────────────────────────────────────────────────────── the card ── */

/**
 * One game in the catalogue — the poster and the grid tiles are the same
 * component at two sizes.
 *
 * **It is a `<button>`, and the whole surface is the press.** That is the
 * change the hover depends on: at rest the card carries its rules and a Play
 * label, and on hover both slide down and out while the name takes their place,
 * which is only honest if there is nothing left that had to be aimed at. A card
 * with a real button inside it would have hidden its own target.
 *
 * The name landing exactly where the Play label was is a **grid row going from
 * `0fr` to `1fr`**, not a hand-tuned `translateY`. The distance between the two
 * depends on how many lines the game's name wraps to, which is a different
 * number in each of five languages and on every card — so a fixed offset is
 * wrong somewhere by construction. Letting the empty row above the name take
 * the slack the collapsing row below it gives up is the same movement with
 * nothing to keep in step. The tail's contents translate *down* as their row
 * closes, because a row collapsing on its own would slide them up and out of
 * the top, which reads as the card eating them.
 *
 * `disabled` is the empty tank and the moment a bank is being fetched. A
 * disabled button takes no hover, so a card that cannot be played does not
 * animate either — which is the right answer and is free.
 */
function PlayCard({
  entry,
  index,
  name,
  rules,
  list,
  featured,
  badge,
  label,
  disabled,
  onStart,
}: {
  entry: Game;
  index: number;
  name: string;
  rules: [string, string];
  /** Which list the local Word Builder deals — the preview shows that word. */
  list: WordList;
  featured?: boolean;
  /** The "today's game" line. Only the poster has one. */
  badge?: string;
  /** What the press says — "Play", "Dealing…" or "Out of energy". */
  label: string;
  disabled: boolean;
  onStart: () => void;
}) {
  return (
    <button
      type="button"
      className={featured ? 'play-card play-card-lead' : 'play-card'}
      data-reveal
      disabled={disabled}
      onClick={onStart}
      style={{ '--i': index } as CSSProperties}
    >
      <GamePreview id={entry.id} list={list} />

      <span className="play-card-main">
        <span className="play-card-head">
          <span className="play-ico">
            <Icon name={entry.icon} size={featured ? 26 : 22} />
          </span>
          {badge && <span className="play-badge">{badge}</span>}
        </span>

        {/* The row that grows as the tail closes. Empty, and it has to be an
            element rather than a `gap`: a `gap` cannot be animated to take up
            the space a sibling is giving back. */}
        <span className="play-card-lift" />

        <b className="play-card-name">{name}</b>

        <span className="play-card-tail">
          <span className="play-card-rules">
            {rules.map((rule) => (
              <span className="play-rule" key={rule}>
                {rule}
              </span>
            ))}
          </span>
          <span className="play-start">{label}</span>
        </span>
      </span>
    </button>
  );
}

/* ────────────────────────────────────────────────────────── the lightning ── */

/**
 * The arcs a full battery throws off itself.
 *
 * **Drawn, not stamped.** These were a clip-path bolt glyph — one shape,
 * repeated, popping in and out — which read as a row of little icons rather than
 * as electricity. Lightning is a *line*: it is thin, it is kinked, it forks, and
 * it arrives all at once rather than growing. So each of these is a real
 * polyline stroked in the accent, and what animates is `stroke-dashoffset` — the
 * bolt is *drawn* from its root to its tip in about a twentieth of a second,
 * flickers, and is gone. That is the whole difference, and it is entirely in the
 * fact that a stroke can be dashed and a filled shape cannot.
 *
 * Twelve of them, spread along both long edges and one at each end, each
 * rotated to fire **outward** from
 * the point it is attached to: `transform-origin: 50% 0` puts the pivot at the
 * root, so a bolt authored pointing down swings to point up, left or right
 * without moving its attachment. The small per-bolt `--tilt` on top of that is
 * what keeps twelve of them from looking like twelve copies of one.
 *
 * **Spontaneity is co-prime durations, not randomness.** Every bolt has its own
 * cycle length — 1.7s against 2.9s against 3.3s — so the set does not come back
 * into phase for well over a minute, and no two ever strike on the same beat
 * twice running. `Math.random` would do the same thing and would deal a new
 * pattern on every render of a panel that re-renders once a minute; a table of
 * awkward numbers does it once, at build time, for nothing.
 *
 * It runs only while the tank is **full** (`[data-full]` in the sheet), which is
 * exactly when the spark that crosses the case is not: charge going in is a
 * bolt travelling *through* the battery, and charge held is a battery shedding
 * it. Nothing on this panel does both at once.
 */

/**
 * Four bolts, in a 20 × 34 box, rooted at the top edge and striking downward.
 *
 * Two of them fork, because a bolt that never branches is a zigzag. The numbers
 * are drawn by hand rather than generated: a generator with jitter produces
 * shapes that are *different* rather than shapes that are *good*, and there are
 * only four of them.
 */
const ZAPS = [
  'M10 0 5 12 11 13 4 34M8 19 14 25',
  'M10 0 15 11 9 14 13 34',
  'M10 0 4 10 10 15 6 34M9 22 3 28',
  'M10 0 14 13 8 16 12 33',
] as const;

/**
 * Where each one is rooted and which way it fires.
 *
 * `turn` is the outward direction — 180° along the top edge, 0° along the
 * bottom, ±90° at the ends — and `tilt` is the few degrees off it that stop the
 * row looking stamped. `beat` is that bolt's own cycle in seconds and `in` is
 * how far into it the panel starts.
 */
const ZAP_POINTS: ReadonlyArray<{
  x: string;
  y: string;
  turn: number;
  tilt: number;
  beat: number;
  in: number;
}> = [
  { x: '9%', y: '0%', turn: 180, tilt: -16, beat: 1.7, in: 0 },
  { x: '28%', y: '0%', turn: 180, tilt: 7, beat: 2.9, in: 1.1 },
  { x: '47%', y: '0%', turn: 180, tilt: -6, beat: 2.3, in: 1.9 },
  { x: '66%', y: '0%', turn: 180, tilt: 15, beat: 3.1, in: 0.4 },
  { x: '86%', y: '0%', turn: 180, tilt: -11, beat: 2.1, in: 1.5 },
  { x: '100%', y: '50%', turn: -90, tilt: -13, beat: 2.6, in: 0.7 },
  { x: '88%', y: '100%', turn: 0, tilt: 12, beat: 1.9, in: 1.3 },
  { x: '69%', y: '100%', turn: 0, tilt: -8, beat: 3.3, in: 2.2 },
  { x: '50%', y: '100%', turn: 0, tilt: 14, beat: 2.4, in: 0.2 },
  { x: '31%', y: '100%', turn: 0, tilt: -15, beat: 2.8, in: 1.7 },
  { x: '12%', y: '100%', turn: 0, tilt: 9, beat: 1.8, in: 0.9 },
  { x: '0%', y: '50%', turn: 90, tilt: 11, beat: 3.0, in: 2.5 },
];

function BatteryLightning() {
  return (
    <>
      {ZAP_POINTS.map((zap, i) => (
        <svg
          key={i}
          className="play-zap"
          viewBox="0 0 20 34"
          aria-hidden
          focusable="false"
          style={
            {
              left: zap.x,
              top: zap.y,
              '--turn': `${zap.turn + zap.tilt}deg`,
              '--beat': `${zap.beat}s`,
              '--in': `-${zap.in}s`,
            } as CSSProperties
          }
        >
          <path d={ZAPS[i % ZAPS.length]} />
        </svg>
      ))}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────── the week ── */

/**
 * The streak, as seven days, and the freezes that protect it.
 *
 * One section and one line, and neither half is in a box. That is the point of
 * it: the streak and the freeze are one reading — how long you have kept this
 * up, and how much slack you have left — and drawing a border round each made
 * them two unrelated statistics in two panels. A freeze is only worth having if
 * you know about it *before* the morning you sleep in.
 *
 * **A day that was kept shows the money.** The centre of a kept circle is the
 * currency mark of wherever this person lives — złoty in Kraków, hryvnia in
 * Kyiv — because the whole argument a streak makes is that turning up is worth
 * something, and a row of ticks makes that argument to nobody. The mark comes
 * off the **country of the city on the profile** (`fxForCountry`), not off the
 * language switcher, which says what somebody reads and not where they are
 * standing. A country the rate sheet does not carry falls back to `$`, which is
 * read as "money" nearly everywhere and is honest about knowing no more.
 *
 * The weekday letters come from `Intl` rather than from the dictionaries, for
 * the reason `untilNextEnergy` above gives at length: a weekday belongs to the
 * reader's language, the platform already knows all five, and thirty-five
 * hand-written initials are thirty-five chances to be wrong in a language
 * nobody on the team reads.
 */
function StreakRow({ player }: { player: PlayerState }) {
  const copy = useCopy().games;
  const [language] = useLanguage();
  const { account } = useAuth();

  const week = useMemo(() => streakWeek(player, new Date()), [player]);
  const held = freezesOf(player);

  /* The mark itself. `null` from `fxForCountry` is "we do not know where this
     person is", which is a different thing from "we know, and it is dollars" —
     and both draw a `$`, because there is nothing better to draw. What must not
     happen is inventing a currency for the first one. */
  const mark = fxForCountry(account?.profile?.countryCode)?.symbol ?? '$';

  /* Monday first, in the reader's own language. `narrow` is one or two
     characters, which is what fits under a circle; the position in the row is
     what disambiguates English's two Ts and two Ss, exactly as it does on every
     calendar ever printed. */
  const days = useMemo(() => {
    const narrow = new Intl.DateTimeFormat(language, { weekday: 'narrow' });
    const long = new Intl.DateTimeFormat(language, { weekday: 'long' });
    return week.map((day) => {
      const date = new Date(`${day.date}T12:00:00`);
      return { short: narrow.format(date), full: long.format(date) };
    });
  }, [week, language]);

  return (
    <section className="play-run" data-reveal>
      <div className="play-run-part">
        <span className="play-run-kicker">
          <Icon name="calendar" size={13} strokeWidth={2} />
          {copy.streak}
        </span>
        <p className="play-run-count">
          <b>{player.streak}</b>
        </p>
        {/* How long the mark is, so the sheet can size it. `£` and `zł` are one
            and two characters; `so'm` is four and `CHF` three, and a circle
            drawn for a pound sign with four characters in it is a circle with
            the money spilling out of both sides. A data attribute rather than
            an inline font size, because *which* size is a design decision and
            those live in `site.css`. */}
        <ol className="play-run-week" data-mark={mark.length > 2 ? 'long' : undefined}>
          {week.map((day, i) => (
            <li
              key={day.date}
              data-state={day.kept ? 'kept' : day.ahead ? 'ahead' : 'missed'}
              data-now={day.now ? 'true' : undefined}
              style={{ '--p': i } as CSSProperties}
            >
              <span className="play-run-dot">
                <em aria-hidden>{day.kept ? mark : ''}</em>
              </span>
              <span className="play-run-day" aria-hidden>
                {days[i].short}
              </span>
              <span className="visually-hidden">
                {days[i].full} ·{' '}
                {day.kept
                  ? copy.streakKept
                  : day.ahead
                    ? copy.streakAhead
                    : copy.streakMissed}
              </span>
            </li>
          ))}
        </ol>
        <p className="play-run-note">{copy.streakHint}</p>
      </div>

      <div className="play-run-part play-run-freeze">
        <span className="play-run-kicker">
          <Icon name="freeze" size={13} strokeWidth={2} />
          {copy.freezes}
        </span>
        <p className="play-run-count">
          <b>{held}</b>
          <span aria-hidden>/{MAX_FREEZES}</span>
        </p>
        <div className="play-run-flakes" role="img" aria-label={`${held}/${MAX_FREEZES}`}>
          {Array.from({ length: MAX_FREEZES }, (_, i) => (
            <i key={i} data-spent={i >= held ? 'true' : undefined}>
              <Icon name="freeze" size={34} strokeWidth={1.4} />
            </i>
          ))}
        </div>
        <p className="play-run-note">{copy.freezesHint}</p>
      </div>
    </section>
  );
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

  /*
   * Which list the **local** Word Builder deals.
   *
   * Derived from the profile rather than held in state, because it is not a
   * choice made on this screen: it is the language of the city this account
   * says it lives in, and the place to change it is the profile form. The
   * segmented picker that used to sit on the Word Builder card — and made that
   * card the one tile in the grid whose surface could not be the button — is
   * what this replaced, along with the second row in `GAMES`.
   *
   * `wordListFor` falls back to Polish for a profile with no city yet, which is
   * the market this site is a guide to. It never falls back to English: English
   * already has a card, and two cards dealing one list under two names is worse
   * than offering a newcomer the language of the queue in front of them.
   */
  const localList = wordListFor(account?.profile?.countryCode);

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
                    ? fill(games.pointsGoal, {
                        points: String(short),
                        target: String(target),
                      })
                    : games.pointsHave}
                </p>
                <div className="play-hero-bar">
                  <i style={{ width: `${pct}%` }} />
                </div>
                {/* Both ends of the bar, as bare figures. The right-hand one
                    used to carry a clause of its own — "400 unlocks the next
                    one" — which was fine when the sentence above it said
                    "the next discount" and became the same number written
                    twice the moment that sentence started naming the rung. A
                    scale prints numbers. */}
                <div className="play-hero-scale">
                  <span>{player.points}</span>
                  <span>{target}</span>
                </div>
              </div>
              <span className="play-hero-cta">
                {games.redeemTitle}
                <Icon name="arrow" size={16} strokeWidth={2.4} />
              </span>
            </a>

            {/*
              ── the battery ──

              The tank drawn as the object it is. Four cells in a case with a
              terminal on the end, the count above them, and the one sentence
              that makes a wait a wait rather than a fault: when the next one
              lands.

              **A battery rather than a row of pips**, and the reason is that a
              row of pips has to be counted and a battery is read. Everybody in
              every market this ships to has spent twenty years reading exactly
              this shape in the corner of a screen — full, half, nearly out — and
              the reading that matters here is precisely that one: whether there
              is an evening's play left. The cells inside it are square-ended
              blocks rather than a continuous fill because the quantity really is
              discrete: a round costs a whole one, and a bar three-quarters full
              would be promising a round that is not there.

              It is a *reading*, not a control — nothing here is pressable, and
              that is why it is a `<section>` and not the link its neighbour is.
              The state is carried twice on purpose: `data-state` paints each
              cell, and the `aria-label` says "2/4" for anyone who is not looking
              at paint. The count above is the same figure a third time, at the
              size that lets it be read from across the room.

              The cell that is filling does so *live*, against the real clock,
              and it does it in CSS — see `chargeOf`. Nothing here re-renders to
              move it. The bolt beside the count is on the same footing: it is
              two `<i>`s and a keyframe, lit while the tank is charging and still
              when it is full, because a charge indicator that flickers on a full
              battery is telling you about work nobody is doing.
            */}
            <section
              className="play-energy"
              data-empty={energy === 0 ? 'true' : undefined}
              data-charging={nextEnergyAt === null ? undefined : 'true'}
              data-full={nextEnergyAt === null ? 'true' : undefined}
              data-reveal
            >
              <span className="play-energy-glow" aria-hidden />
              <span className="play-energy-kicker">
                <i>
                  <Icon name="bolt" size={13} strokeWidth={2} />
                </i>
                {games.energy}
              </span>

              {/* The count, and beside it the wait. Beside rather than under,
                  because "2 of 4" and "the third lands in 3h 12m" are one
                  reading and a player takes them in one glance — the sentence
                  that used to sit under the battery was the same fact a line
                  away from the figure it belongs to. */}
              <p className="play-energy-count">
                <b>{energy}</b>
                <span aria-hidden>/{MAX_ENERGY}</span>
                {nextEnergyAt !== null && (
                  <em className="play-energy-next">
                    {fill(games.energyNext, {
                      time: untilNextEnergy(nextEnergyAt, Date.now(), language),
                    })}
                  </em>
                )}
              </p>

              <div
                className="play-battery"
                role="img"
                aria-label={`${energy}/${MAX_ENERGY}`}
              >
                <span className="play-battery-case">
                  {Array.from({ length: MAX_ENERGY }, (_, i) => {
                    const charging = i === energy && charge !== null;
                    return (
                      <span
                        key={i}
                        className="play-battery-cell"
                        data-state={i < energy ? 'full' : charging ? 'charging' : 'empty'}
                        style={{ '--p': i } as CSSProperties}
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
                  {/* The spark crossing the case while it charges. Decorative,
                      and the only thing on this panel that is: it is what makes
                      four blocks in a box read as *charge* rather than as a
                      progress bar lying on its side. Two of them, offset, so the
                      loop does not read as one thing blinking. */}
                  <i className="play-battery-bolt" aria-hidden />
                  <i className="play-battery-bolt" aria-hidden />
                </span>
                <span className="play-battery-tip" aria-hidden />

                {/* And the other state — see `BatteryLightning` above. A full
                    tank has nothing crossing it, so it sheds arcs off every edge
                    instead. */}
                <BatteryLightning />
              </div>

              {/* An empty tank says so in words before it says when. The
                  countdown alone answers a question a player who has just been
                  refused a round has not asked yet. */}
              {energy === 0 && <p className="play-energy-out">{games.noEnergy}</p>}

              {/* Only the full state says anything here now. The countdown moved
                  up beside the count, and printing it twice would be the same
                  figure in two registers a centimetre apart. */}
              {nextEnergyAt === null && (
                <p className="play-energy-line">{games.energyFull}</p>
              )}
              <p className="play-energy-cost">{games.energyCost}</p>
            </section>
          </div>

          {/*
            ── the week, and the slack ──

            The streak and the freezes, out of the strip they used to be pills
            in and into a section of their own. See `StreakRow`; the short of it
            is that a streak is the one reading on this page that is *about* the
            player rather than about the balance, and it was a three-character
            number in a row of three three-character numbers.
          */}
          <StreakRow player={player} />

          {/*
            ── the stats strip ──

            What is left after the streak and the freezes moved out: the history,
            behind one disclosure. Shut by default, because five figures a player
            checks occasionally should not push the games below the fold every
            visit — and there is nothing in here that decides whether the rest of
            the screen works. The two readings that do are the panels above.

            Every figure is a reading and none of them is a control. Spending is
            automatic (see `awardPoints`), and there has never been anything to
            press.
          */}
          <div className="play-strip" data-reveal>
            <button
              type="button"
              className="play-stats-toggle"
              aria-expanded={statsOpen}
              onClick={() => setStatsOpen((open) => !open)}
            >
              {games.statsToggle}
              <Icon name="chevron" size={14} strokeWidth={2.2} />
            </button>

            {statsOpen && (
              <div className="play-stats">
                <div>
                  <span>{games.score}</span>
                  <b>{player.points}</b>
                </div>
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
              list={game.id === 'wordLocal' ? localList : 'en'}
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
            /*
              ── the catalogue ──

              The poster and the grid, inside one element on purpose: hovering
              any card blurs **every other card on the screen**, which needs a
              common ancestor for `:has()` to hang off. They were siblings of the
              page wrapper before, and a rule written against that would have
              blurred the balance panel and the leaderboard with them.

              `GAMES[FEATURED]` is the first row of the same table the grid maps,
              so the poster and a grid tile cannot disagree about what a game
              pays — and the poster is the same `PlayCard` component at a larger
              size, so they cannot disagree about how a card behaves either.
              Being told twice how to draw a card is how the two ended up with
              different hovers the last time they were written out separately.
            */
            <div className="play-catalogue">
              {GAMES.map((entry, index) => {
                const featured = index === FEATURED;
                return (
                  <PlayCard
                    key={entry.id}
                    entry={entry}
                    index={index}
                    name={gameName(index, games, localList)}
                    list={localList}
                    rules={rulesFor(entry, games)}
                    featured={featured}
                    badge={featured ? games.featured : undefined}
                    label={
                      loading
                        ? games.loading
                        : energy > 0
                          ? featured
                            ? games.start
                            : games.play
                          : games.noEnergy
                    }
                    disabled={energy <= 0 || loading}
                    onStart={() => start(entry.id)}
                  />
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
