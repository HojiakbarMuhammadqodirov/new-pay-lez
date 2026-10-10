import { useRef } from 'react';
import { useReducedMotion } from '../../components/GlobeHero/hooks/useReducedMotion';
import type { Finish } from '../api/consumer';
import { Icon } from '../icons';
import { useCopy, useLanguage } from '../i18n/context';
import { fill, plural } from '../i18n/currency';
import { AnimatedPico, type PicoPose } from '../pico';
import { PATHS } from '../router';
import { Burst } from './stage/Burst';
import { MOOD } from './stage/config';
import type { StageMood } from './stage/paint';
import { StageScene } from './stage/StageScene';
import { useCountUp } from './stage/useCountUp';

/**
 * The card every round ends on — all sixteen games, one path.
 *
 * Moved out of `games.tsx` with its props unchanged; what it says is what it
 * always said, and the reasoning for each line is kept beside it. What is new
 * is the occasion:
 *
 * - **Pico on a podium**, under a light that matches the round: gold rays and
 *   confetti for a perfect one, a puff of feathers for a good one, a quiet
 *   mint glow for an ordinary one, and his own small rain cloud for a round
 *   that went badly. His face is the round's (`MOOD` in `stage/config.ts`).
 * - **The figure counts up** from nothing (`useCountUp` — refs, not state) and
 *   lands with a small pop.
 * - **The reward line is a ticket**, because it is one: the nearest voucher,
 *   at a named place, and how far off it is.
 *
 * Wide, the bird stands to the left of the reading; narrow, above it.
 */
export function Result({
  won,
  correct,
  total,
  points,
  paid,
  balance,
  cheapest,
  nearest,
  streak,
  scoreLine,
  nextPays,
  onAgain,
  onBack,
}: {
  won: boolean;
  correct: number;
  total: number;
  /** What the round paid. The headline figure. */
  points: number;
  /**
   * Whether the round was ever going to pay.
   *
   * A practice round — one played on an empty tank — and a round where every
   * answer went wrong both show a `0`, and only one of them is worth
   * explaining. This is which.
   */
  paid: boolean;
  /** The balance *after* the round, for the line about what it is worth. */
  balance: number;
  /**
   * What the cheapest gift card on the shelf costs, or `null` for a shelf that
   * is empty or has not answered. The card says nothing about vouchers in that
   * case rather than quoting a price nobody set.
   */
  cheapest: number | null;
  /**
   * The nearest **venue voucher** the server found above the new balance, or
   * null/absent. Preferred over `cheapest` when present: a named discount at a
   * named place is the reward connection the rulebook asks every game to end
   * on, and it is a partner-funded voucher every plan can buy — the gift-card
   * shelf behind `cheapest` is Pro and Premium only.
   */
  nearest?: Finish['nearest'];
  streak: number;
  /** Replaces the "n / m correct" line for a round that does not ask questions. */
  scoreLine?: string;
  /**
   * Whether the round behind "Again" will pay — the tank *now*, not the round
   * that just ended. The two differ in the commonest case there is: a paid
   * round that spent the last energy in the tank.
   */
  nextPays: boolean;
  onAgain: () => void;
  onBack: () => void;
}) {
  const copy = useCopy().games;
  const [language] = useLanguage();
  const reduced = useReducedMotion();

  /*
   * How far off the cheapest voucher is.
   *
   * The supplied games spec is emphatic about this and it is right: a bare score
   * is a dead end, and "+40 points" means nothing until it is "+40 points, 60
   * from a discount". This is the line that makes a second round worth playing,
   * so it is on every result card rather than only on the good ones — **when
   * there is a shelf to be short of.** With none, the line is dropped rather
   * than quoting the 100 points this file used to carry.
   */
  const short = cheapest === null ? null : Math.max(0, cheapest - balance);

  /*
   * Pico's face, from how the round *went* rather than what it paid: a practice
   * sweep is still a sweep, and the figure beside him already says what it was
   * worth. `won` is the clean sweep on a quiz and the banked run on the
   * flight — the moment for confetti.
   */
  const ratio = total > 0 ? correct / total : 0;
  const mood: StageMood = won ? 'party' : ratio >= MOOD.happyAt ? 'happy' : ratio < MOOD.sadBelow ? 'sad' : 'idle';
  const pose: PicoPose = mood === 'party' || mood === 'happy' ? 'happy' : mood;
  const moodRef = useRef<StageMood>(mood);
  moodRef.current = mood;

  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const gain = useRef<HTMLElement>(null);
  const figure = (n: number) => (n > 0 ? `+${n}` : '0');
  useCountUp(gain, points, figure, reduced);

  const toward =
    paid && nearest
      ? fill(copy.resultTowardVenue, {
          points: String(nearest.pointsNeeded),
          pct: String(nearest.discountPct),
          venue: nearest.venueName,
        })
      : short !== null
        ? short > 0
          ? fill(copy.resultToward, { points: String(short) })
          : copy.resultAfford
        : null;

  return (
    <div className="round round-result rs" data-stage="stage" data-mood={mood} ref={root}>
      <StageScene motif="stage" root={root} host={host} mood={moodRef} />
      {(mood === 'party' || mood === 'happy') && (
        <Burst kind={mood === 'party' ? 'confetti' : 'puff'} root={root} host={host} />
      )}

      <div className="rs-podium">
        <div className="rs-host" ref={host}>
          <AnimatedPico pose={pose} />
        </div>
      </div>

      <div className="rs-body">
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
            A celebratory 0 is the wrong face for the wrong news. The visible
            figure counts; the hidden one is what a screen reader is told. */}
        <p className="rs-gain">
          <b className="result-gain" data-zero={points === 0 ? 'true' : undefined} ref={gain} aria-hidden>
            {figure(points)}
          </b>
          <span className="visually-hidden">{figure(points)}</span>
        </p>
        <p className="result-score">
          {scoreLine ?? fill(copy.resultScore, { correct: String(correct), total: String(total) })}
        </p>
        {/* Only a round that needs explaining says anything in words, and with the
            repeat-play taper gone there are exactly two such rounds left: the one
            that scored nothing, and the one that was never going to pay. They
            print the same `0` and they are not the same news — one is "you got
            none right", the other "the tank was empty and this was practice" —
            so the second says so rather than letting the player read it as the
            first. */}
        {!paid ? (
          <p className="result-points rs-note">
            <Icon name="clock" size={14} strokeWidth={2} />
            {copy.practiceResult}
          </p>
        ) : (
          points === 0 && <p className="result-points">{copy.resultNone}</p>
        )}
        {toward && (
          <p className="result-toward rs-ticket">
            <span className="rs-ticket-ico" aria-hidden>
              <Icon name="ticket" size={18} strokeWidth={2} />
            </span>
            <span>{toward}</span>
          </p>
        )}
        <p className="result-streak rs-streak">
          <Icon name="calendar" size={13} strokeWidth={2} />
          {fill(plural(language, streak, copy.resultStreak), { streak: String(streak) })}
        </p>

        <div className="result-actions">
          {/* Always live now. This was the press most likely to find an empty
              tank — the round that just finished spent the last one — and it used
              to switch itself off and say so. There is a round behind it either
              way; what changes is whether it pays.

              Labelled off `nextPays` and not off `paid`: those are two different
              rounds. The commonest case on this card is a *paid* round that took
              the last energy with it, where the press underneath is practice. */}
          <button type="button" className="btn btn-solid" onClick={onAgain}>
            <Icon name="play" size={14} />
            {nextPays ? copy.again : copy.practice}
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
    </div>
  );
}
