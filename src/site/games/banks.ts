import type { LanguageCode } from '../i18n/context';

/**
 * The question banks, loaded on demand.
 *
 * `data/` is generated — see `scripts/build-question-banks.mjs`, which turns the
 * four CSV exports in `updates/` into one file per bank per language plus a
 * shared `.meta.json` for the structural half (which option is right, a flag's
 * ISO code, a country's continent).
 *
 * **Nothing here is in the main bundle.** The general bank alone is 2102
 * questions; the Russian copy of it is 389 kB, and a visitor who never opens
 * L-Earn should not pay for a byte of that. `import.meta.glob` gives Vite a
 * static pattern to code-split on, and the loader below fetches exactly one
 * language file per bank, the first time a round of that game is built.
 *
 * `import.meta.glob` rather than a template-literal `import()`: the glob is
 * typed, Vite resolves it at build time with no module-resolution guessing, and
 * a missing file is a lookup that returns `undefined` here instead of a runtime
 * import failure inside a game.
 */

export type BankId = 'general' | 'poland' | 'flags' | 'capitals';

const TEXT = import.meta.glob('./data/*.json', { import: 'default' }) as Record<
  string,
  () => Promise<unknown>
>;

/* ── the shapes the generator writes ──────────────────────────────────────
 *
 * Rows of plain strings rather than objects with named fields, because every
 * consumer wants the whole row and named keys cost more than the strings do
 * across two thousand of them. Position is the contract:
 *
 *   quiz     [prompt, option, option, option, option]
 *   flags    [country, option, option, option]   — the prompt is copy, not data
 *   capitals [country, capital]
 */

export interface QuizBank {
  /** One row per question: prompt first, then the four options. */
  rows: string[][];
  /** Which option is the right one, index-aligned with `rows`. */
  answers: number[];
}

export interface FlagBank {
  /** Four country names; the first is the right one. */
  rows: string[][];
  answers: number[];
  /** Two-letter ISO codes, index-aligned. The flag emoji is built from these. */
  codes: string[];
}

export interface CapitalBank {
  /** `[country, capital]` per row. */
  rows: string[][];
  /** Which continent each row is in, for drawing plausible distractors. */
  continents: string[];
}

/* ────────────────────────────────────────────────────────────── loading ── */

/**
 * One promise per bank+language, kept forever — as long as it resolves.
 *
 * The cache holds the *promise* rather than the result so two rounds started in
 * the same tick share one fetch. Nothing evicts a good one: a bank is at most
 * 389 kB and the alternative is re-parsing it every time somebody replays a
 * game.
 *
 * A *rejected* one is evicted, because it is the answer to a question nobody
 * asked. Caching a failure forever turns one dropped chunk request — a tab that
 * went offline for a second, a deploy that moved the file — into a game that
 * stays unplayable for the life of the tab, while every other game on the page
 * works. The retry is already on screen: it is the button that started the
 * round.
 */
const cache = new Map<string, Promise<unknown>>();

function load(file: string): Promise<unknown> {
  const cached = cache.get(file);
  if (cached) return cached;

  const loader = TEXT[file];
  if (!loader) return Promise.reject(new Error(`No bank at ${file}`));

  const promise: Promise<unknown> = loader().catch((error: unknown) => {
    /* Only if this is still the attempt in the map. A retry started while this
       one was failing has already replaced it, and deleting by key alone would
       evict a load that is in flight and about to succeed — leaving the next
       caller to start a third fetch of the same 389 kB. */
    if (cache.get(file) === promise) cache.delete(file);
    throw error;
  });
  cache.set(file, promise);
  return promise;
}

const text = (id: BankId, language: LanguageCode) =>
  load(`./data/${id}.${language}.json`) as Promise<string[][]>;

const meta = <T>(id: BankId) => load(`./data/${id}.meta.json`) as Promise<T>;

export async function loadQuiz(
  id: 'general' | 'poland',
  language: LanguageCode,
): Promise<QuizBank> {
  const [rows, { a }] = await Promise.all([
    text(id, language),
    meta<{ a: number[] }>(id),
  ]);
  return { rows, answers: a };
}

export async function loadFlags(language: LanguageCode): Promise<FlagBank> {
  const [rows, { a, code }] = await Promise.all([
    text('flags', language),
    meta<{ a: number[]; code: string[] }>('flags'),
  ]);
  return { rows, answers: a, codes: code };
}

export async function loadCapitals(language: LanguageCode): Promise<CapitalBank> {
  const [rows, { continent }] = await Promise.all([
    text('capitals', language),
    meta<{ continent: string[] }>('capitals'),
  ]);
  return { rows, continents: continent };
}

/* ─────────────────────────────────────────────── the two new games' data ── */

/** `[word, hint, tier]`. Tier is 1 easy / 2 medium / 3 hard. */
export type WordRow = [word: string, hint: string, tier: number];

/**
 * Word Builder ships two lists and only two.
 *
 * It is a *language* game — the thing being learned is the word — so the list is
 * the language you are practising rather than the language you read the site in,
 * and the hints are written in English in both files. A Russian speaker learning
 * Polish wants the Polish list; giving them a Russian one would be giving them
 * nothing to learn.
 */
export type WordList = 'en' | 'pl';

/**
 * Which list the **local** Word Builder card practises.
 *
 * The catalogue carries two Word Builder rows (see `GAMES` in `content.ts`):
 * one that is always English, and one that is the language of wherever this
 * person has moved to. This table is the second one's answer, keyed by the
 * country of the city on their profile — `UserProfile.countryCode` — because
 * where you live is what decides which language the queue in front of you is
 * speaking. It is deliberately *not* keyed by the site's own language switcher,
 * which decides what you read and says nothing about where you are standing.
 *
 * `'pl'` is the fallback and it is a real answer rather than a shrug: this site
 * is a guide to having moved to Poland, and Polish is the one local list it
 * ships. An account with no city yet gets it, and so does a country we have no
 * list for — because the alternative, resolving to `'en'`, would put the same
 * game on two cards under two names, which is worse than offering the market's
 * language to somebody who has not told us where they are.
 *
 * A country whose language *is* English is the same case and takes the same
 * branch, for the same reason: English already has a card.
 *
 * **Adding a list is one file and one row.** Drop `data/words.<code>.json`
 * beside the two that are there, widen `WordList`, and name the country here.
 * The card renames itself — its label is `copy.games.wordGame.lists[list]`.
 */
export const WORD_LIST_FOR_COUNTRY: Record<string, WordList> = {
  PL: 'pl',
};

/** The local list for a profile's country, folded the way `fxForCountry` folds. */
export function wordListFor(countryCode: string | undefined): WordList {
  return WORD_LIST_FOR_COUNTRY[(countryCode ?? '').trim().toUpperCase()] ?? 'pl';
}

export const loadWords = (list: WordList) =>
  load(`./data/words.${list}.json`) as Promise<WordRow[]>;

export interface Deck {
  id: string;
  /** Ten pairs; a round uses six of them. */
  pairs: Array<{
    id: string;
    /** Emoji placeholder — the spec's own word. Custom art replaces these. */
    icon: string;
    /** The Polish name, which is the thing being learned. */
    label: string;
    /** …and what it is in English, for everyone who is not learning Polish. */
    en: string;
  }>;
}

export const loadDecks = () => load('./data/decks.json') as Promise<Deck[]>;

/* ───────────────────────────────────────────────────────────────── flags ── */

/**
 * A two-letter ISO code as its flag emoji.
 *
 * `pl` becomes the regional-indicator pair `🇵🇱`. This is why the export's
 * `flagcdn.com` image URLs are parsed for their code and then thrown away: the
 * site makes no third-party runtime requests, and the self-hosted Twemoji subset
 * (`GlobeHero/ui/flagFont.css`) already draws every one of these. Two characters
 * instead of a network round trip per question.
 */
export function flagOf(code: string): string {
  if (code.length !== 2) return '';
  // 0x1f1e6 is REGIONAL INDICATOR SYMBOL LETTER A.
  return String.fromCodePoint(
    ...[...code.toLowerCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 97),
  );
}
