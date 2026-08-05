/**
 * Turns the four question exports in `updates/` into the bundled banks the
 * games read.
 *
 * Run with `npm run banks`. It is **not** part of `dev` or `build`: the CSVs are
 * a hand-delivered export rather than a dependency, the output is committed, and
 * a build that silently regenerated 3MB of game data from files that may not be
 * present would fail on a fresh clone for no reason. Re-run it when a new export
 * arrives, commit what it writes.
 *
 * The output shape is one object per question:
 *
 *     { a: <index of the right option>, t: { en: [prompt, ...four options] } }
 *
 * One flat array of strings per language rather than a prompt field and an
 * options field, because every consumer wants both together and the shape halves
 * the JSON's key overhead across two thousand rows.
 *
 * **Ukrainian is missing from three of the four exports** and Turkish and Azeri
 * are present in one of them. Languages this site does not have are dropped;
 * a language the site *does* have and the export does not is simply absent from
 * `t`, and the games fall back to English at read time (see `banks.ts`). A
 * missing key is honest — a machine-translated one would not be.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'updates');
const OUT = join(here, '..', 'src', 'site', 'games', 'data');

/** The five the site is translated into, in menu order. */
const LANGS = ['en', 'pl', 'uz', 'ru', 'uk'];

/* ────────────────────────────────────────────────────────────────── csv ── */

/**
 * A real CSV reader, not a `split(',')`.
 *
 * Every one of these files has commas, escaped double quotes and — in the
 * general quiz — whole JSON arrays inside quoted fields. Splitting on commas
 * shears roughly a third of the rows in each.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  // Strip a BOM; Excel writes one and it lands in the first header name.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      // Swallowed; the \n that follows ends the row.
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }

  const header = rows.shift();
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((key, i) => [key, r[i]])));
}

const clean = (value) => (value ?? '').trim();

/**
 * Keep only rows whose English is complete.
 *
 * English is the fallback every other language falls back *to*, so a row with a
 * blank English prompt or a blank English option is a row that renders as an
 * empty button in at least one language. There is no shortage of questions.
 */
function usable(entry) {
  const en = entry.t.en;
  return Boolean(en) && en.length === 5 && en.every((s) => s.length > 0);
}

/**
 * Drops languages that came through empty, so `t` never holds a blank set.
 *
 * `width` is how many strings a complete row has: five for a question (prompt
 * plus four options), four for the flag round, whose prompt is fixed copy rather
 * than data, and one for a bare name. A short row is a partial translation and
 * is dropped whole — half a translated question is worse than an English one.
 */
function pack(perLanguage, width) {
  const t = {};
  for (const lang of LANGS) {
    const row = perLanguage[lang];
    if (row && row.length === width && row.every((s) => s && s.length)) t[lang] = row;
  }
  return t;
}

/* ─────────────────────────────────────────────────────────── the banks ── */

/** General knowledge. Options arrive as a JSON array inside a quoted field. */
function buildGeneral() {
  const rows = parseCsv(readFileSync(join(SRC, 'General Quiz - data.csv'), 'utf8'));

  const options = (raw) => {
    try {
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed.map(clean) : [];
    } catch {
      /* One malformed row is not worth failing the whole export over — it is
         dropped by `usable` below like any other incomplete row. */
      return [];
    }
  };

  return rows
    .map((row) => ({
      a: Number(row.correct_answer),
      t: pack(
        {
          en: [clean(row.question_text_en), ...options(row.options_en)],
          pl: [clean(row.question_text_pl), ...options(row.options_pl)],
          uz: [clean(row.question_text_uz), ...options(row.options_uz)],
          ru: [clean(row.question_text_ru), ...options(row.options_ru)],
          /* No Ukrainian column in this export; the games fall back to English. */
        },
        5,
      ),
    }))
    .filter((entry) => Number.isInteger(entry.a) && entry.a >= 0 && entry.a < 4)
    .filter(usable);
}

/** The Poland round. `correct_answer` is a letter, A–D. */
function buildPoland() {
  const rows = parseCsv(
    readFileSync(join(SRC, 'Poland Quiz Question - data.csv'), 'utf8'),
  );

  const letters = ['a', 'b', 'c', 'd'];

  return rows
    .map((row) => ({
      a: letters.indexOf(clean(row.correct_answer).toLowerCase()),
      t: pack(
        {
          en: [clean(row.question_en), ...letters.map((l) => clean(row[`option_${l}_en`]))],
          pl: [clean(row.question_pl), ...letters.map((l) => clean(row[`option_${l}_pl`]))],
          uz: [clean(row.question_uz), ...letters.map((l) => clean(row[`option_${l}_uz`]))],
          ru: [clean(row.question_ru), ...letters.map((l) => clean(row[`option_${l}_ru`]))],
          uk: [clean(row.question_uk), ...letters.map((l) => clean(row[`option_${l}_uk`]))],
        },
        5,
      ),
    }))
    .filter((entry) => entry.a >= 0)
    .filter(usable);
}

/**
 * Flags.
 *
 * The export points at `flagcdn.com` for the image, which this site cannot use —
 * no third-party runtime requests, anywhere. The ISO code in that URL is the
 * useful part: two letters map to a regional-indicator pair, which the
 * self-hosted Twemoji subset already renders (`ui/flagFont.css`), so the flag
 * ships as two characters instead of a network round trip.
 *
 * The right answer is `country_name` and sits at index 0 here. It is *not*
 * shuffled at build time on purpose — the round generator shuffles at play time,
 * so the same question does not always answer in the same position.
 */
function buildFlags() {
  const rows = parseCsv(readFileSync(join(SRC, 'Flag Question data.csv'), 'utf8'));

  const iso = (url) => {
    const match = /\/([a-z]{2})\.svg/i.exec(url || '');
    return match ? match[1].toLowerCase() : '';
  };

  return rows
    .map((row) => ({
      a: 0,
      code: iso(row.flag_url),
      /* Four options and no prompt: "Which country is this flag?" is copy, not
         data, and lives in the dictionaries like every other sentence. */
      t: pack(
        {
          en: [
            clean(row.country_name),
            clean(row.option_2),
            clean(row.option_3),
            clean(row.option_4),
          ],
          pl: [
            clean(row.country_name_pl),
            clean(row.option_2_pl),
            clean(row.option_3_pl),
            clean(row.option_4_pl),
          ],
          uz: [
            clean(row.country_name_uz),
            clean(row.option_2_uz),
            clean(row.option_3_uz),
            clean(row.option_4_uz),
          ],
          ru: [
            clean(row.country_name_ru),
            clean(row.option_2_ru),
            clean(row.option_3_ru),
            clean(row.option_4_ru),
          ],
        },
        4,
      ),
    }))
    .filter((entry) => entry.code.length === 2 && Boolean(entry.t.en));
}

/**
 * Capitals.
 *
 * The export is a plain country → capital table with no distractors in it, so
 * unlike the other three this bank is not a list of questions — it is the pool
 * a question is built from at play time, exactly as the ten-country version it
 * replaces did. Three wrong capitals drawn from the same continent where there
 * are enough of them, which is what keeps a distractor plausible.
 */
function buildCapitals() {
  const rows = parseCsv(
    readFileSync(join(SRC, 'Country - Capital game data.csv'), 'utf8'),
  );

  /** One name in every language that has it, flattened out of `pack`'s rows. */
  const names = (row, field) => {
    const packed = pack(
      {
        en: [clean(row[field])],
        pl: [clean(row[`${field}_pl`])],
        uz: [clean(row[`${field}_uz`])],
        ru: [clean(row[`${field}_ru`])],
      },
      1,
    );
    return Object.fromEntries(
      Object.entries(packed).map(([lang, one]) => [lang, one[0]]),
    );
  };

  return rows
    .map((row) => ({
      continent: clean(row.continent),
      country: names(row, 'country_name'),
      capital: names(row, 'capital_name'),
    }))
    .filter((entry) => entry.country.en && entry.capital.en);
}

/* ──────────────────────────────────────────────────────────────── write ── */

/*
 * One file per bank per language, and each one complete on its own.
 *
 * The obvious shape — one file holding every language — came out at 1.1 MB for
 * the general bank alone, and a player in Kraków would download the Uzbek and
 * Russian copies of two thousand questions to read the Polish ones. Splitting by
 * language means exactly one file is fetched, and it gzips to well under a
 * tenth of that.
 *
 * Rows missing a translation are filled with the English one at *build* time
 * rather than falling back at read time. That is what keeps each file
 * self-sufficient: the alternative is loading English alongside every other
 * language as a fallback source, which is the 1.1 MB problem again with extra
 * steps. It also keeps the row indices identical across languages, which is what
 * the no-repeat bag in `banks.ts` relies on — it stores indices, and an index
 * that meant a different question in a different language would be a bug that
 * only appeared after switching language mid-bag.
 *
 * The structural half — which option is right, a flag's ISO code, a country's
 * continent — is language-independent and goes in one `.meta.json` beside them.
 */
mkdirSync(OUT, { recursive: true });

/** Every language gets a row; a missing translation takes the English one. */
function perLanguage(entries, width) {
  const out = {};
  for (const lang of LANGS) {
    out[lang] = entries.map((entry) =>
      (entry.t[lang] ?? entry.t.en).slice(0, width),
    );
  }
  return out;
}

const written = [];

function emit(name, meta, text) {
  const metaFile = join(OUT, `${name}.meta.json`);
  writeFileSync(metaFile, JSON.stringify(meta));
  written.push([`${name}.meta`, Buffer.byteLength(JSON.stringify(meta))]);

  for (const [lang, rows] of Object.entries(text)) {
    const file = join(OUT, `${name}.${lang}.json`);
    const json = JSON.stringify(rows);
    writeFileSync(file, json);
    written.push([`${name}.${lang}`, Buffer.byteLength(json)]);
  }
}

const general = buildGeneral();
emit('general', { a: general.map((e) => e.a) }, perLanguage(general, 5));

const poland = buildPoland();
emit('poland', { a: poland.map((e) => e.a) }, perLanguage(poland, 5));

const flags = buildFlags();
emit(
  'flags',
  { a: flags.map((e) => e.a), code: flags.map((e) => e.code) },
  perLanguage(flags, 4),
);

/* Capitals are a pool rather than a list of questions: two names per row, and
   the distractors are drawn from the pool at play time. */
const capitals = buildCapitals();
emit(
  'capitals',
  { continent: capitals.map((e) => e.continent) },
  Object.fromEntries(
    LANGS.map((lang) => [
      lang,
      capitals.map((e) => [
        e.country[lang] ?? e.country.en,
        e.capital[lang] ?? e.capital.en,
      ]),
    ]),
  ),
);

/* ── the two new games' data ──────────────────────────────────────────────
 *
 * These arrive as JSON already and only need reshaping: the word lists lose
 * their `category` (nothing selects on it yet) and become positional triples,
 * and the memory decks lose the `asset` filenames, which name custom
 * illustrations that have not been drawn — the emoji are the placeholder the
 * spec says they are, and a field pointing at a file that does not exist would
 * read as one that does.
 */

const decks = JSON.parse(
  readFileSync(join(SRC, 'paylez-memory-decks.json'), 'utf8'),
).decks.map((deck) => ({
  id: deck.id,
  pairs: deck.pairs.map((pair) => ({
    id: pair.id,
    icon: pair.icon,
    label: pair.label,
    en: pair.label_en,
  })),
}));
writeFileSync(join(OUT, 'decks.json'), JSON.stringify(decks));

/** `[word, hint, tier]`. Tier is 1 easy / 2 medium / 3 hard, and drives both
 *  the difficulty ramp within a round and the per-word bonus. */
for (const lang of ['en', 'pl']) {
  const words = JSON.parse(
    readFileSync(join(SRC, `paylez-words-${lang}.json`), 'utf8'),
  ).words.map((entry) => [entry.word, entry.hint, entry.tier]);
  writeFileSync(join(OUT, `words.${lang}.json`), JSON.stringify(words));
  written.push([`words.${lang}`, Buffer.byteLength(JSON.stringify(words))]);
}

console.log(
  `general ${general.length} · poland ${poland.length} · ` +
    `flags ${flags.length} · capitals ${capitals.length} · ` +
    `decks ${decks.length}`,
);
for (const [name, bytes] of written) {
  console.log(`  ${name.padEnd(18)} ${(bytes / 1024).toFixed(0).padStart(5)} kB`);
}
