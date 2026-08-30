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
 *
 * **Two of the figures come from `auth/player.ts`, not from `GAMES`**: the
 * flight's ceiling and the memory board's top band. That is the side the
 * scoring actually lives on and the side `npm run verify` owns, so a card that
 * quoted `content.ts` for them would be a second copy free to drift — which is
 * what the memory row's `perCorrect` was doing when it advertised 6 a pair for a
 * board that now pays 12 at its very best. Importing `player.ts` here is free:
 * it is pure arithmetic with one import of its own.
 */
import { GAMES } from '../content';
import { MAX_FLIGHT_POINTS, MEMORY_BANDS } from '../auth/player';
import type { WordList } from './banks';
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
      fill(games.flight.reward, {
        points: String(entry.perCorrect),
        max: String(MAX_FLIGHT_POINTS),
      }),
    ];
  }
  if (entry.kind === 'memory') {
    /* The top band, and not `entry.perCorrect` — the memory row has no per-pair
       figure to state any more. See the note above the function. */
    return [
      fill(games.memory.rule, { pairs: String(entry.questions) }),
      fill(games.memory.reward, { points: String(MEMORY_BANDS[0].points) }),
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

/**
 * A game's name, with the one hole any of them has filled in.
 *
 * Here rather than in `games.tsx` for the reason `rulesFor` above is: three
 * screens name these games — the signed-in grid, its poster, and the marketing
 * section a signed-out visitor reads — and the moment one of them formats a
 * name itself, that one is free to drift.
 *
 * Seven of the eight names are plain strings. The eighth is the local Word
 * Builder, named after the list it will actually deal
 * (`'Word Builder · {language}'`), because that list is a fact about the
 * player's city rather than about the catalogue. Running every name through
 * `fill` rather than special-casing index seven keeps the call sites from
 * having to know which one is special — `fill` leaves a string with no holes
 * exactly as it found it.
 */
export function gameName(
  index: number,
  games: Dictionary['games'],
  list: WordList,
): string {
  return fill(games.names[index], { language: games.wordGame.lists[list] });
}
