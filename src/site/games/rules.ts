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
import { GAMES, type GameId } from '../content';
import {
  MAX_FLIGHT_POINTS,
  MEMORY_BANDS,
  QUIZ_PERFECT_BONUS,
  QUIZ_SPEED_BONUS,
} from '../auth/player';
import type { LocalCountry, WordList } from './banks';
import type { Dictionary } from '../i18n/en';
import { fill } from '../i18n/currency';

/* Derived from the table rather than declared beside it, for the same reason
   `games.tsx` derives its own: `GAMES` is the shape, and a hand-written
   interface would be a second one to keep in step. */
export type Game = (typeof GAMES)[number];

export function rulesFor(entry: Game, games: Dictionary['games']): [rule: string, reward: string] {
  if (entry.kind === 'flight') {
    return [
      /* No hole left in this one: the line stopped quoting the bank line when
         it started saying the run accelerates, which is the fact a player needs
         before they start rather than after. */
      games.flight.rule,
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
      fill(games.memory.reward, {
        seconds: String(MEMORY_BANDS[0].throughSeconds),
        points: String(MEMORY_BANDS[0].points),
      }),
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
    /* No mistake figure any more — there is no allowance to quote. What the
       line says instead is what a clean round is worth, which is the thing the
       new scoring made worth aiming at. */
    fill(games.reward, {
      points: String(entry.perCorrect),
      bonus: String(QUIZ_PERFECT_BONUS + QUIZ_SPEED_BONUS[0].points),
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
/* ══════════════════════════════════════════════════ the daily game ══ */

/**
 * Which games the daily poster may land on.
 *
 * Everything except the **local** Word Builder, and the exclusion is the one
 * thing about this rotation that has to be got right: the daily game is the
 * same game for everybody on a given day, and `wordLocal` is not a card
 * everybody has. It practises the language of the country on the profile, so a
 * player in a country the product has no word list for does not see it at all
 * (`wordListFor`) — and a poster pointing at a card that is not on the screen
 * is a poster that cannot be pressed.
 *
 * The local *quiz* is not excluded, and the difference is worth stating: every
 * player sees that card, they are just asked about different countries. What
 * varies there is the bank behind one card; what varies here is whether the
 * card exists.
 *
 * Derived from `GAMES` rather than listed, so a game added to the table joins
 * the rotation without anybody remembering this exists.
 */
export const DAILY_POOL = GAMES.filter((game) => game.id !== 'wordLocal');

/**
 * Days since the epoch, from a `YYYY-MM-DD` day string.
 *
 * Parsed as UTC (`Date.parse` on a bare ISO date is UTC by specification) and
 * divided rather than counted, because what this needs is a number that goes up
 * by exactly one per calendar day and agrees between a browser in Tashkent and
 * a browser in Kraków. A local-midnight `new Date(y, m, d)` would not: the two
 * would disagree for the hours between their midnights, and the rotation's whole
 * claim is that everybody gets the same game.
 *
 * Which day it *is* remains the reader's own — `today()` in `auth/player.ts`
 * resolves that from their clock. The rotation is a pure function of the day it
 * is handed; being handed different days at 00:30 in two time zones is correct,
 * and the two agree again as soon as both are past midnight.
 */
const dayNumber = (day: string): number => {
  const parsed = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(parsed) ? Math.floor(parsed / 86_400_000) : 0;
};

/**
 * The game the poster shows today.
 *
 * **Deterministic and shared.** No user id in it, no randomness, no stored
 * choice: every player opening the Play screen on the same day sees the same
 * poster, which is what makes "today's game" a thing two people can talk about.
 * And it is a plain rotation rather than a hash, so the pool is walked in order
 * and every game gets its turn — a hashed pick would be indistinguishable from a
 * rotation on any one day and would leave a game unposted for a fortnight by
 * chance.
 *
 * The offset is the day number, so the cycle turns over at UTC midnight and its
 * length is the pool's size. Seven games and a seven-day-ish cycle is a
 * coincidence rather than a design; nothing depends on the two matching.
 */
export function dailyGame(day: string): GameId {
  const pool = DAILY_POOL;
  /* `%` on a negative number is negative in JavaScript, and a day before 1970
     is a `slice(0, 10)` of a broken clock rather than a real reading — but the
     index has to be in range whatever arrives. */
  const index = ((dayNumber(day) % pool.length) + pool.length) % pool.length;
  return pool[index].id;
}

/**
 * Where that game sits in `GAMES`, which is what the card components take.
 *
 * An index rather than the id because `gameName` and `copy.games.names` are
 * index-aligned with `GAMES` — the poster and the grid tile for the same game
 * must read the same name, and the only way to guarantee that is for both to
 * be handed the same index.
 */
export const dailyGameIndex = (day: string): number => {
  const id = dailyGame(day);
  return GAMES.findIndex((game) => game.id === id);
};

export function gameName(
  index: number,
  games: Dictionary['games'],
  list: WordList,
  country: LocalCountry,
): string {
  /* The local-knowledge quiz is named per country rather than per language, and
     it is a whole name rather than a template — see `localQuiz` in `en.ts` for
     why a "{country} Quiz" hole cannot work across five grammars. The `names`
     slot is the fallback and stays index-aligned with `GAMES` either way. */
  if (GAMES[index]?.id === 'local') {
    return games.localQuiz[country] ?? games.names[index];
  }
  return fill(games.names[index], { language: games.wordGame.lists[list] });
}
