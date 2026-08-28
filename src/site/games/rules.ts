/**
 * The two rule lines under a game's name.
 *
 * Each row of `GAMES` reads its own columns (see the table's comment in
 * `content.ts`), so the lines are per kind rather than one sentence with four
 * holes in it: a per-question clock means nothing to a round that lasts as long
 * as you do, and "one mistake allowed" means nothing to a board you cannot
 * lose.
 *
 * It lives in its own module because **three** screens describe these seven
 * games and all three have to agree: the signed-in Play grid, the featured card
 * above it, and the marketing section on L-Earn that a signed-out visitor
 * reads. The first two already shared it; the third had a hand-written copy of
 * the same four-branch dispatch, with all six `fill()` calls written out again.
 * They agreed at the time, which is what that kind of duplicate always does —
 * and this is the exact mechanism behind the bug the L-Earn section's own
 * comment describes, where the pitch went on claiming three games after five
 * had shipped. Rendering from the model is only half the rule; the sentences
 * have to come from one place too.
 *
 * A separate file rather than an export from `games.tsx` because the marketing
 * page must not pull the app's game screens — the boards, the flight canvas and
 * the question banks — into its own bundle to borrow one pure function.
 */
import { GAMES } from '../content';
import type { Dictionary } from '../i18n/en';
import { fill } from '../i18n/currency';

/* Derived from the table rather than declared beside it, for the same reason
   `games.tsx` derives its own: `GAMES` is the shape, and a hand-written
   interface would be a second one to keep in step. */
export type Game = (typeof GAMES)[number];

export function rulesFor(entry: Game, games: Dictionary['games']): [rule: string, reward: string] {
  if (entry.kind === 'flight') {
    return [
      fill(games.flight.rule, { gaps: String(entry.questions) }),
      fill(games.flight.reward, { points: String(entry.perCorrect) }),
    ];
  }
  if (entry.kind === 'memory') {
    return [
      fill(games.memory.rule, { pairs: String(entry.questions) }),
      fill(games.memory.reward, { points: String(entry.perCorrect) }),
    ];
  }
  if (entry.kind === 'word') {
    return [
      fill(games.wordGame.rule, { words: String(entry.questions) }),
      games.wordGame.reward,
    ];
  }
  return [
    fill(games.rule, {
      questions: String(entry.questions),
      seconds: String(entry.seconds),
    }),
    fill(games.reward, {
      mistakes: String(entry.allowedMistakes),
      points: String(entry.perCorrect),
    }),
  ];
}
