import { useEffect, useRef, useState } from 'react';

/**
 * The two pieces of a round's header the arcade games share with the originals.
 *
 * The question rounds and Memory Match put the same three things in the same
 * places: **progress** on the left (`.round-count`, "Question 2 of 5", "Pairs
 * 3 / 6"), a **clock** on the right in the accent (`.round-clock`), and under a
 * quiz a 4px `.round-bar`. The arcade games arrived with a bare count and an
 * empty right-hand corner, so a player moving from Memory Match to Snake lost
 * both the clock and any sense of how far a round had to go. These two put them
 * back with the originals' own classes, so the header is one design rather than
 * nine.
 *
 * Neither draws per frame. The clock re-renders four times a second, which is
 * what Memory Match's stopwatch does; the bar changes when the count does,
 * which is already a React state in every game that uses it.
 */

/**
 * Elapsed time, `m:ss`, in the clock slot — Memory Match's stopwatch, for a
 * round that has no countdown of its own.
 *
 * `running` starts it (the round's own Start press, not its mount: the seconds
 * spent reading the intro are not the round), and turning it off freezes the
 * figure where the round ended.
 */
export function RoundClock({ running }: { running: boolean }) {
  const from = useRef<number | null>(null);
  const until = useRef<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!running) {
      if (from.current !== null && until.current === null) {
        until.current = Date.now();
        tick((n) => n + 1);
      }
      return;
    }
    if (from.current === null) from.current = Date.now();
    until.current = null;
    const id = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, [running]);

  const end = until.current ?? Date.now();
  const seconds = from.current === null ? 0 : Math.max(0, Math.floor((end - from.current) / 1000));

  return (
    <span className="round-clock" role="timer">
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
