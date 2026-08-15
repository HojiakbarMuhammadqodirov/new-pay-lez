/**
 * An RFC 4180 CSV reader, for the one job it has: reading the old database.
 *
 * The Base44 export quotes every field, embeds newlines inside quotes (the
 * guidance articles are HTML with paragraph breaks in them), doubles internal
 * quotes, and stores arrays and objects as JSON *inside* a quoted field — so a
 * split on commas produces garbage on roughly every third row. This is a real
 * parser rather than a regex for that reason, and it is 60 lines because CSV
 * genuinely is that small once you accept the state machine.
 *
 * It reads a whole file into memory. The largest export is 3.2 MB; streaming
 * would be the right call at a thousand times that and pointless here.
 */
import { readFileSync } from 'node:fs';

export type CsvRow = Record<string, string>;

/** Split one CSV document into rows of raw cells. */
export function parseCsv(text: string): string[][] {
  /* A BOM ahead of the first header would otherwise become part of its name. */
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let i = 0;

  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    /* A trailing newline produces one empty cell, which is not a row. */
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === '"' && cell === '') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      endCell();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      endRow();
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}

/** Read a CSV file as objects keyed by its header row. */
export function readCsv(path: string): CsvRow[] {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const out: CsvRow = {};
    header.forEach((key, index) => {
      out[key] = cells[index] ?? '';
    });
    return out;
  });
}

/* ─────────────────────────────────────────────── reading a cell as a value ── */

export const str = (row: CsvRow, key: string): string => (row[key] ?? '').trim();

export const opt = (row: CsvRow, key: string): string | null => {
  const value = str(row, key);
  return value === '' ? null : value;
};

export function num(row: CsvRow, key: string, fallback = 0): number {
  const value = str(row, key);
  if (value === '') return fallback;
  /* The export writes `'+48…` for phone-shaped numbers and plain decimals for
     everything else; anything unparseable falls back rather than becoming NaN. */
  const parsed = Number(value.replace(/[^0-9.eE+-]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const bool = (row: CsvRow, key: string): boolean => str(row, key).toLowerCase() === 'true';

/** A JSON cell — `["English","Russian"]` and the rate blob both arrive this way. */
export function json<T>(row: CsvRow, key: string, fallback: T): T {
  const value = str(row, key);
  if (value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * A timestamp cell, normalised to UTC ISO.
 *
 * The export mixes two shapes — `2026-08-02T14:02:22.958000` (no zone, six
 * decimal places, and it is UTC) and `2026-08-10T07:00:44.804Z`. Reading the
 * first with `new Date()` in a non-UTC process would shift every imported row by
 * the server's offset, which is how a month of history quietly lands in the
 * wrong bucket.
 */
export function ts(row: CsvRow, key: string, fallback: string | null = null): string | null {
  const value = str(row, key);
  if (value === '') return fallback;
  const zoned = /[zZ]$|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`;
  const parsed = new Date(zoned);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}
