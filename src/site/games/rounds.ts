import type { LanguageCode } from '../i18n/context';
import { drawFrom, shuffledRange } from './bag';
import {
  flagOf,
  loadCapitals,
  loadDecks,
  loadFlags,
  loadQuiz,
  loadWords,
  type WordList,
  type WordRow,
} from './banks';

/**
 * Building one round.
 *
 * Async, and that is the change: questions used to be a handful of items sitting
 * in the dictionaries, so a round was built synchronously in the click handler.
 * They now come from generated banks that are fetched the first time a game is
 * opened (see `banks.ts`), which means starting a round is a promise and the
 * card that starts it has a loading state.
 *
 * Every round draws its indices through the bag (`bag.ts`), never by shuffling
 * the pool and taking the first few. With 2102 general questions the difference
 * is the whole feature: a fresh shuffle each round would let a player see the
 * same question twice in an evening and miss most of the bank forever.
 */

export interface Question {
  /** The prompt, already assembled. */
  prompt: string;
  /** Shown above the prompt at display size — a flag, or nothing. */
  glyph?: string;
  options: string[];
  answer: number;
}

/**
 * Permute a question's options.
 *
 * The banks store the right answer wherever the export had it, and the flag
 * export has it first in *every* row. Without this, one game would be won by
 * always pressing the top button. Done at play time rather than in the generator
 * so the same question does not settle into one position either.
 */
function scramble(options: string[], answer: number): Pick<Question, 'options' | 'answer'> {
  const order = shuffledRange(options.length);
  return { options: order.map((i) => options[i]), answer: order.indexOf(answer) };
}

/* ─────────────────────────────────────────────────────────────── the quizzes ── */

export async function buildQuizRound(
  bank: 'general' | 'poland',
  language: LanguageCode,
  count: number,
): Promise<Question[]> {
  const { rows, answers } = await loadQuiz(bank, language);

  return drawFrom(bank, rows.length, count).map((index) => {
    const row = rows[index];
    return { prompt: row[0], ...scramble(row.slice(1), answers[index]) };
  });
}

/* ────────────────────────────────────────────────────────────────── flags ── */

export async function buildFlagRound(
  language: LanguageCode,
  count: number,
  prompt: string,
): Promise<Question[]> {
  const { rows, answers, codes } = await loadFlags(language);

  return drawFrom('flags', rows.length, count).map((index) => ({
    prompt,
    /* Built from the ISO code rather than fetched: two characters the
       self-hosted flag font already draws. See `flagOf`. */
    glyph: flagOf(codes[index]),
    ...scramble(rows[index], answers[index]),
  }));
}

/* ─────────────────────────────────────────────────────────────── capitals ── */

/**
 * Capitals, which is the one round whose questions do not exist until they are
 * asked: the export is a country → capital table with no wrong answers in it, so
 * the distractors are drawn here.
 *
 * **Same continent where possible.** Three capitals picked at random out of 196
 * makes most questions trivial — asked for the capital of Poland against Lima,
 * Suva and Bamako, nobody has to know anything. Same-continent distractors are
 * what make the round a test rather than a formality, and the fallback to the
 * whole table only fires for a continent with fewer than four rows in it.
 */
export async function buildCapitalRound(
  language: LanguageCode,
  count: number,
  prompt: (country: string) => string,
): Promise<Question[]> {
  const { rows, continents } = await loadCapitals(language);

  /* Grouped once per round rather than per question: 196 rows scanned five
     times is nothing, but the shape reads better and it is one pass. */
  const byContinent = new Map<string, number[]>();
  for (let i = 0; i < continents.length; i++) {
    const group = byContinent.get(continents[i]);
    if (group) group.push(i);
    else byContinent.set(continents[i], [i]);
  }

  return drawFrom('capitals', rows.length, count).map((index) => {
    const [country, capital] = rows[index];
    const neighbours = byContinent.get(continents[index]) ?? [];
    const pool = neighbours.length >= 4 ? neighbours : rows.map((_, i) => i);

    /* Distinct *capitals*, not distinct rows: two countries sharing a capital
       name would otherwise put the same word on two buttons, one right and one
       wrong. */
    const wrong: string[] = [];
    for (const pick of shuffledRange(pool.length)) {
      const other = rows[pool[pick]][1];
      if (other !== capital && !wrong.includes(other)) wrong.push(other);
      if (wrong.length === 3) break;
    }

    return { prompt: prompt(country), ...scramble([capital, ...wrong], 0) };
  });
}

/* ─────────────────────────────────────────────────────────── word builder ── */

/**
 * Five words, ramping in difficulty: two easy, two medium, one hard.
 *
 * The ramp is the supplied spec's, and it is what makes a round feel like a
 * round rather than five unrelated words — the first is meant to be free and the
 * last is meant to be the reason you played.
 *
 * **One bag per tier, not one bag for the list.** A single bag cannot serve a
 * ramp: satisfying "one tier-3 word" out of a mixed bag means drawing until a
 * hard one turns up and throwing the easy ones away, and a discarded draw is a
 * word removed from the bag without ever being shown — which is precisely the
 * property the bag exists to guarantee. Three bags keyed by tier each exhaust
 * their own tier, so every word in the list is still asked before any repeats.
 */
export const WORD_RAMP = [1, 1, 2, 2, 3];

export async function buildWordRound(
  list: WordList,
  count: number,
): Promise<WordRow[]> {
  const words = await loadWords(list);

  const byTier = new Map<number, number[]>();
  words.forEach((word, index) => {
    const tier = word[2];
    const group = byTier.get(tier);
    if (group) group.push(index);
    else byTier.set(tier, [index]);
  });

  const ramp = WORD_RAMP.slice(0, count);

  /* Drawn per tier up front, then handed out in ramp order — one bag read per
     tier rather than one per word. */
  const queues = new Map<number, number[]>();
  for (const tier of new Set(ramp)) {
    const group = byTier.get(tier) ?? [];
    const need = ramp.filter((t) => t === tier).length;
    queues.set(
      tier,
      drawFrom(`word:${list}:t${tier}`, group.length, need).map((i) => group[i]),
    );
  }

  const out: WordRow[] = [];
  for (const tier of ramp) {
    const picked = queues.get(tier)?.pop();
    /* A tier with no words in it at all — not the case for either shipped list,
       but a shorter one would hit it. Skipping shortens the round rather than
       repeating a word, which is the failure that stays fair. */
    if (picked === undefined) continue;
    out.push(words[picked]);
  }

  return out;
}

/* ─────────────────────────────────────────────────────────── memory match ── */

/**
 * One board: six pairs out of a deck of ten, shuffled into twelve cards.
 *
 * The deck rotates with the day rather than being chosen at random, which is
 * what turns five decks into a week of themes — landmarks today, food tomorrow —
 * and means two people playing on the same day are learning the same words. The
 * pairs *within* the deck are drawn through the bag, so the ten in a deck are
 * seen before any of them comes round twice.
 */
export interface MemoryCard {
  /** Unique per card; the two halves of a pair share `pair`, not this. */
  key: string;
  pair: number;
  icon: string;
  label: string;
  en: string;
}

export async function buildMemoryBoard(
  pairs: number,
  today: string,
): Promise<{ deck: string; cards: MemoryCard[] }> {
  const decks = await loadDecks();

  /* Days since the epoch, off the `YYYY-MM-DD` the player module already
     produces — no `Date` parsing, no timezone question, and the same answer for
     everyone on the same local day. */
  const day = Number(today.replaceAll('-', ''));
  const deck = decks[day % decks.length];

  const chosen = drawFrom(`memory:${deck.id}`, deck.pairs.length, pairs).map(
    (index, pair) => ({ ...deck.pairs[index], pair }),
  );

  const doubled = chosen.flatMap((entry, index) => [
    { key: `${entry.id}-a`, pair: index, icon: entry.icon, label: entry.label, en: entry.en },
    { key: `${entry.id}-b`, pair: index, icon: entry.icon, label: entry.label, en: entry.en },
  ]);

  return {
    deck: deck.id,
    cards: shuffledRange(doubled.length).map((i) => doubled[i]),
  };
}
