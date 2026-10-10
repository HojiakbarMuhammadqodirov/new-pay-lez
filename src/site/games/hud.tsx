import type { ReactNode } from 'react';
import { AnimatedPico, type PicoPose } from '../pico';

/**
 * The shell every game's round shares: the header's two readings
 * (`RoundClock`, `PerfectBar`) and the two veils over a field (`ReadyVeil`,
 * `EndVeil`, at the end of this file). The quiz round and the result card are
 * the rest of the shell — `QuizRound.tsx`, `ResultCard.tsx`, `stage/`.
 *
 * The two pieces of a round's header the arcade games share with the originals.
 *
 * The question rounds and Memory Match put the same three things in the same
 * places: **progress** on the left (`.round-count`, "Question 2 of 5", "Pairs
 * 3 / 6"), a **clock** on the right in the accent (`.round-clock`), and under a
 * quiz a `.round-bar` — the first two as pills, the clock with a dial when it is
 * one (`role="timer"`). The arcade games arrived with a bare count and an
 * empty right-hand corner, so a player moving from Memory Match to Snake lost
 * both the clock and any sense of how far a round had to go. These two put them
 * back with the originals' own classes, so the header is one design rather than
 * nine.
 *
 * Neither draws per frame. The clock changes when the game's whole second does
 * (each game keeps its seconds-left in state and sets it only on a change); the
 * bar changes when the count does, which is already a React state in every game
 * that uses it.
 */

/** The last seconds, drawn by weight rather than a new hue (`.round-clock[data-low]`). */
const LOW_SECONDS = 10;

/**
 * The time **left**, `m:ss`, in the clock slot.
 *
 * It counted *up* once — Memory Match's stopwatch — because the arcade rounds
 * had no end to count down to: Pico's Flock ran until a crash, Pico Jump until
 * a fall, and Pico's Ball caught in a loop ran for ever. Every one of them has
 * an end now (`…_ROUND_…` in `arcade.ts`, the `roundSeconds` column of the
 * server's `ARCADE_ECONOMY`), and a clock that shows how much is left is how a
 * player sees it coming.
 *
 * **Controlled, from the game's own clock.** The game passes the seconds left
 * as its loop measures them — ticks played, fixed steps taken — rather than this
 * reading `Date.now()`, because the two part company the moment a tab is
 * hidden: the game stops with the frames and a wall clock does not, so a
 * stopwatch here would have shown a round running out that was in fact
 * paused.
 */
export function RoundClock({ left }: { left: number }) {
  const seconds = Math.max(0, Math.ceil(left));
  return (
    <span className="round-clock" role="timer" data-low={seconds <= LOW_SECONDS ? 'true' : undefined}>
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </span>
  );
}

/**
 * How far the round is toward a **perfect** one — performance 100 on the
 * rulebook's scale, which is where the points stop growing.
 *
 * The quiz's `.round-bar`, filled by the round's own result rather than by a
 * countdown. It is the one honest progress figure a game with no fixed length
 * has: the count it is priced on, against the count that maxes it out. Once it
 * is full the round pays all it can, and the bar says so before the result card
 * does.
 */
export function PerfectBar({ performance, label }: { performance: number; label: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(performance)));
  return (
    <div
      className="round-bar ar-perfect"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      data-full={pct >= 100 ? 'true' : undefined}
    >
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

/*
 * ── the two veils, with the host in them ──
 *
 * Every arcade field has the same two overlays (`.ar-overlay`, see `site.css`):
 * the **ready** veil — a shade rising from the bottom over a field that stays
 * visible, the intro, a Start press — and the **end** veil, frosted, held for a
 * beat before the result card. These are those two, with Pico in them: waiting
 * beside the Start press, and reacting to how the round ended before the card
 * says it in numbers. A game that renders its own `.ar-overlay` keeps working
 * exactly as it did; one that renders these gets the host as well.
 */

/** The ready veil: the host, the intro, the Start press (and anything else the game needs there). */
export function ReadyVeil({
  intro,
  start,
  onStart,
  children,
}: {
  intro: ReactNode;
  start: string;
  onStart: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="ar-overlay ar-ready">
      <span className="ar-veil-host" aria-hidden>
        <AnimatedPico pose="idle" />
      </span>
      <p>{intro}</p>
      {children}
      <button type="button" className="btn btn-solid" onClick={onStart}>
        {start}
      </button>
    </div>
  );
}

/**
 * The end veil: how the round finished, said by the host's face and one line.
 *
 * `pose` is the bird's verdict — `'happy'` for a round that went well,
 * `'sad'` for one that did not, `'hit'` for a crash (the flight's column, the
 * snake's wall). `detail` is the figure under the line, when the game has one.
 */
export function EndVeil({
  title,
  detail,
  pose,
}: {
  title: ReactNode;
  detail?: ReactNode;
  pose: Extract<PicoPose, 'happy' | 'sad' | 'hit' | 'idle'>;
}) {
  return (
    <div className="ar-overlay ar-end" role="status" data-pose={pose}>
      <span className="ar-veil-host" aria-hidden>
        <AnimatedPico pose={pose} />
      </span>
      <p>{title}</p>
      {detail && <span className="ar-veil-detail">{detail}</span>}
    </div>
  );
}
