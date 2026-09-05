/**
 * The currency pairs a reader has pinned on Relocate.
 *
 * This exists because the card was already claiming it. The chips above the
 * converter were labelled **"Saved pairs"** and the dictionary carried a note
 * saying they were "pinned to the top of the screen, so a rate check is one tap
 * rather than a search" — and nothing was saved and nothing could be pinned:
 * they were four defaults computed from the reader's language and identical for
 * everybody who spoke it. That is the honesty rule the partner dashboard states
 * at length, failing quietly on a marketing page: a control that describes a
 * feature is a promise, and this one had no endpoint and no store behind it.
 *
 * Two ways out. Rename the label to what the row actually was — the most-used
 * pairs — or build the thing. Both, as it turns out: the defaults keep their own
 * row under an honest name, and this is the store behind the row above it.
 *
 * **A fourth `localStorage` key**, after `paylez-session`, `paylez-users` and
 * `paylez-api-token`. It is deliberately not on the server: there is no endpoint
 * for it, the guide is readable with no account at all — which is the page's
 * whole pitch — and "the rates I check" is a per-device convenience rather than
 * a record. If accounts ever carry it, this file is what moves.
 *
 * Every read and write is wrapped, like `auth/directory.ts` and `api/client.ts`:
 * storage throws in a private window with cookies blocked, and a converter that
 * cannot open is worse than one that cannot remember.
 */
import { FX, type FxCode } from './i18n/fx';

export type Pair = readonly [FxCode, FxCode];

const KEY = 'paylez-fx-pairs';

/**
 * How many a reader may pin.
 *
 * Six, because the row wraps and a list long enough to need scanning is the
 * search this feature exists to replace. Saving a seventh drops the oldest.
 */
export const MAX_PAIRS = 6;

/** `"PLN>UAH"` — the stored form, and the identity used for deduping. */
export const keyOf = (pair: Pair): string => `${pair[0]}>${pair[1]}`;

/**
 * Direction matters here, and it does not in `useShortcuts`.
 *
 * The defaults treat PLN→UAH and UAH→PLN as one shortcut, because there are
 * only four slots and the card has a swap button. A pair somebody pinned is not
 * a slot being rationed: they chose a direction, and showing it reversed is the
 * card second-guessing an explicit instruction.
 */
function parse(raw: unknown): Pair[] {
  if (!Array.isArray(raw)) return [];
  const out: Pair[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const [a, b] = entry.split('>');
    /* Checked against the live table rather than trusted: a code that was in
       `fx.ts` when it was written may not be in it now, and a pair naming one
       would crash the card on the read rather than on the write. */
    if (!(a in FX) || !(b in FX) || a === b) continue;
    const pair = [a, b] as unknown as Pair;
    if (seen.has(keyOf(pair))) continue;
    seen.add(keyOf(pair));
    out.push(pair);
  }

  return out.slice(0, MAX_PAIRS);
}

export function readPairs(): Pair[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? parse(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function writePairs(pairs: Pair[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(pairs.map(keyOf)));
  } catch {
    /* Nothing to do: the pins last the tab instead. */
  }
}

/** Newest first, capped, and never twice — the list the card renders. */
export function addPair(pairs: Pair[], pair: Pair): Pair[] {
  const key = keyOf(pair);
  return [pair, ...pairs.filter((entry) => keyOf(entry) !== key)].slice(0, MAX_PAIRS);
}

export function removePair(pairs: Pair[], pair: Pair): Pair[] {
  const key = keyOf(pair);
  return pairs.filter((entry) => keyOf(entry) !== key);
}

export const hasPair = (pairs: Pair[], pair: Pair): boolean =>
  pairs.some((entry) => keyOf(entry) === keyOf(pair));
