/**
 * The no-repeat bag.
 *
 * The rule the games needed and did not have: **every question in a bank is
 * asked once before any of them is asked twice.** The old generator shuffled the
 * whole pool on every round and took the first five, which with a ten-country
 * table meant seeing the same flag three rounds running was routine — and with a
 * two-thousand-question bank would have meant a player could grind for an hour
 * and never see a third of it.
 *
 * A bag is the standard answer and the cheap one: shuffle every index once,
 * draw off the end, and only reshuffle when the bag is empty. Drawing is O(n) in
 * what you take rather than in the pool, which matters when the pool is 2102.
 *
 * React-free and pure apart from the one storage read and write, so
 * `npm run verify` owns the exhaustion property rather than a browser doing.
 */

const STORAGE_KEY = 'paylez-bags';

/** What is left to draw, per bank. The array is the *remaining* indices. */
type Bags = Record<string, number[]>;

/* ─────────────────────────────────────────────────────────────── storage ── */

/**
 * Wrapped the way `theme/` and `auth/` wrap theirs: a private tab throws on
 * write and a corrupt value is not worth a white screen. Losing a bag costs a
 * player one round of possible repeats, which is the mildest failure on the
 * page.
 */
function read(): Bags {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};

    const out: Bags = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value) && value.every((n) => typeof n === 'number')) {
        out[key] = value as number[];
      }
    }
    return out;
  } catch {
    return {};
  }
}

function write(bags: Bags): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bags));
  } catch {
    // Private mode. The bag is a nicety, not a correctness requirement.
  }
}

/* ─────────────────────────────────────────────────────────────── the bag ── */

/** Fisher–Yates on a fresh range. */
export function shuffledRange(size: number, random: () => number = Math.random): number[] {
  const out = Array.from({ length: size }, (_, i) => i);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Draw `count` distinct indices from a bank's bag, refilling as needed.
 *
 * Returns the drawn indices and the bag that is left, and touches no storage —
 * `drawFrom` below is the one that does. Split so the exhaustion property can be
 * checked without a `localStorage` to stand in.
 *
 * Two things it is careful about, both of which are how a bag usually goes
 * wrong:
 *
 * - **A refill mid-draw must not hand back something already drawn.** With four
 *   left in the bag and five wanted, the fifth comes from a brand-new shuffle
 *   that may well start with one of those four. Filtering the refill against
 *   what this draw has already taken is what stops a round asking the same
 *   question twice.
 * - **A pool that shrank.** `size` comes from the loaded bank; a stored bag from
 *   an older, larger export could hold indices past the end of it. Out-of-range
 *   indices are dropped on the way in rather than read off the end of the array.
 */
export function draw(
  bag: number[],
  size: number,
  count: number,
  random: () => number = Math.random,
): { picked: number[]; rest: number[] } {
  if (size <= 0) return { picked: [], rest: [] };

  const wanted = Math.min(count, size);
  let rest = bag.filter((index) => index >= 0 && index < size);
  const picked: number[] = [];

  while (picked.length < wanted) {
    if (rest.length === 0) {
      rest = shuffledRange(size, random).filter((index) => !picked.includes(index));
      /* Can only happen if `wanted === size`, in which case the loop is already
         about to end; guarding anyway so a bad `count` cannot spin forever. */
      if (rest.length === 0) break;
    }
    picked.push(rest.pop() as number);
  }

  return { picked, rest };
}

/**
 * The same draw, against the stored bag for `key`.
 *
 * `key` is the bank *and* the size — `general:2102` — so a new export with more
 * questions in it starts a fresh bag rather than continuing one whose indices
 * meant different questions. That is the same reasoning behind filling missing
 * translations at build time (see `scripts/build-question-banks.mjs`): the bag
 * stores indices, so anything that can renumber the rows has to invalidate it.
 */
export function drawFrom(bank: string, size: number, count: number): number[] {
  const key = `${bank}:${size}`;
  const bags = read();
  const { picked, rest } = draw(bags[key] ?? [], size, count);

  /* Only this bank's bag is kept. A bag for a size that no longer exists is
     dead weight, and clearing it here is why the key can encode the size at all
     without the store growing on every export. */
  const next: Bags = {};
  for (const [existing, value] of Object.entries(bags)) {
    if (!existing.startsWith(`${bank}:`)) next[existing] = value;
  }
  next[key] = rest;
  write(next);

  return picked;
}
