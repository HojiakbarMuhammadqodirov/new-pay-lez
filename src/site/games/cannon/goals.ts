import { CANNON_SCORING, LEVELS, type Level } from './config';

/**
 * Canon Numbers' maths, kept pure so `npm run verify` can own it: what a goal
 * is, which numbers answer it, which wrong numbers are worth showing beside it,
 * and what a round scored. The component only draws and steers.
 *
 * `rand` is `() => [0, 1)` — `Math.random` in play, a fixed sequence in the
 * verifier.
 *
 * ## Why the wrong numbers are near misses
 *
 * A distractor that could never be the answer (a 3 beside "8 × 7") is a free
 * pass: the player rules it out without doing the sum, and the game becomes
 * "shoot the big one". So distractors are the mistakes people actually make —
 * one off, ten off, the sum where the product was asked, the digits swapped —
 * and the player has to *know* 56, not just recognise its size.
 */

export type Rand = () => number;

export type Goal =
  | { kind: 'add'; a: number; b: number }
  | { kind: 'sub'; a: number; b: number }
  | { kind: 'mul'; a: number; b: number }
  | { kind: 'div'; a: number; b: number }
  /** `? + a = total` */
  | { kind: 'missing'; a: number; total: number }
  /** Any multiple of `n` — several targets can answer at once. */
  | { kind: 'multiple'; n: number };

/** Largest number a target ever carries; keeps the discs to two digits wide. */
export const MAX_VALUE = 120;

const int = (rand: Rand, lo: number, hi: number): number => lo + Math.floor(rand() * (hi - lo + 1));
const pick = <T,>(rand: Rand, items: readonly T[]): T => items[Math.floor(rand() * items.length) % items.length];

/** The single answer of an equation goal; `null` for a multiple goal. */
export function answerOf(goal: Goal): number | null {
  switch (goal.kind) {
    case 'add':
      return goal.a + goal.b;
    case 'sub':
      return goal.a - goal.b;
    case 'mul':
      return goal.a * goal.b;
    case 'div':
      return goal.a / goal.b;
    case 'missing':
      return goal.total - goal.a;
    case 'multiple':
      return null;
  }
}

/** Does a target carrying `value` answer `goal`? */
export function answers(goal: Goal, value: number): boolean {
  if (goal.kind === 'multiple') return value > 0 && value % goal.n === 0;
  return value === answerOf(goal);
}

/**
 * The goal as the banner writes it. Equations are symbols and digits, which
 * read the same in all five languages, so they are built here; a multiple goal
 * needs words and comes back as `null` for the component to fill from the
 * dictionary.
 */
export function equationText(goal: Goal): string | null {
  switch (goal.kind) {
    case 'add':
      return `${goal.a} + ${goal.b} = ?`;
    case 'sub':
      return `${goal.a} − ${goal.b} = ?`;
    case 'mul':
      return `${goal.a} × ${goal.b} = ?`;
    case 'div':
      return `${goal.a} ÷ ${goal.b} = ?`;
    case 'missing':
      return `? + ${goal.a} = ${goal.total}`;
    case 'multiple':
      return null;
  }
}

/** The difficulty row for a net score. */
export function levelFor(net: number): Level {
  let level = LEVELS[0];
  for (const row of LEVELS) if (net >= row.from) level = row;
  return level;
}

/** Index of that row, 0-based — which goal menu `dealGoal` draws from. */
export function levelIndex(net: number): number {
  let index = 0;
  LEVELS.forEach((row, i) => {
    if (net >= row.from) index = i;
  });
  return index;
}

/**
 * A new goal for a level. Each level is a menu, and a level keeps the easier
 * kinds in its menu so the round never turns into one operation. `previous`
 * is avoided so a hit never deals the same sum straight back.
 */
export function dealGoal(level: number, rand: Rand, previous?: Goal): Goal {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const goal = drawGoal(level, rand);
    if (!previous || JSON.stringify(goal) !== JSON.stringify(previous)) return goal;
  }
  return drawGoal(level, rand);
}

function drawGoal(level: number, rand: Rand): Goal {
  if (level <= 0) {
    /* Sums inside ten: the one a player can do before reading the second number. */
    const a = int(rand, 1, 8);
    return { kind: 'add', a, b: int(rand, 1, 10 - a) };
  }
  if (level === 1) {
    if (rand() < 0.5) return { kind: 'add', a: int(rand, 3, 12), b: int(rand, 2, 9) };
    const a = int(rand, 8, 20);
    return { kind: 'sub', a, b: int(rand, 2, Math.min(9, a - 1)) };
  }
  if (level === 2) {
    const r = rand();
    if (r < 0.4) return { kind: 'mul', a: int(rand, 2, 10), b: pick(rand, [2, 5, 10]) };
    if (r < 0.7) return { kind: 'multiple', n: pick(rand, [2, 5, 10]) };
    return { kind: 'add', a: int(rand, 8, 19), b: int(rand, 6, 11) };
  }
  if (level === 3) {
    const r = rand();
    if (r < 0.45) return { kind: 'mul', a: int(rand, 3, 9), b: int(rand, 3, 9) };
    if (r < 0.7) return { kind: 'multiple', n: pick(rand, [3, 4, 6]) };
    const a = int(rand, 20, 50);
    return { kind: 'sub', a, b: int(rand, 6, 19) };
  }
  const r = rand();
  if (r < 0.3) {
    const b = int(rand, 2, 9);
    return { kind: 'div', a: b * int(rand, 2, 9), b };
  }
  if (r < 0.55) {
    const a = int(rand, 4, 15);
    return { kind: 'missing', a, total: a + int(rand, 4, 18) };
  }
  if (r < 0.8) return { kind: 'mul', a: int(rand, 6, 12), b: int(rand, 3, 9) };
  return { kind: 'multiple', n: pick(rand, [6, 7, 8, 9]) };
}

/** A number that answers the goal — the target the player is looking for. */
export function answerValue(goal: Goal, rand: Rand): number {
  if (goal.kind === 'multiple') return goal.n * int(rand, 1, Math.max(1, Math.floor(MAX_VALUE / goal.n / 1.2)));
  return answerOf(goal)!;
}

/**
 * A number that does **not** answer the goal and is a believable mistake for
 * it. Falls back to any non-answer in range, so it always returns something.
 */
export function distractorValue(goal: Goal, rand: Rand): number {
  const ok = (v: number) => Number.isInteger(v) && v > 0 && v <= MAX_VALUE && !answers(goal, v);
  const near: number[] = [];
  if (goal.kind === 'multiple') {
    const k = int(rand, 1, Math.max(1, Math.floor(MAX_VALUE / goal.n / 1.2)));
    near.push(goal.n * k + 1, goal.n * k - 1, goal.n * k + 2, goal.n + 1, goal.n * k + Math.ceil(goal.n / 2));
  } else {
    const answer = answerOf(goal)!;
    near.push(answer + 1, answer - 1, answer + 2, answer - 2, answer + 10, answer - 10);
    if (answer >= 10) near.push(Number(String(answer).split('').reverse().join('')));
    if (goal.kind === 'mul') near.push(goal.a + goal.b, goal.a * (goal.b + 1), (goal.a + 1) * goal.b);
    if (goal.kind === 'add') near.push(goal.a * goal.b, Math.abs(goal.a - goal.b));
    if (goal.kind === 'sub') near.push(goal.a + goal.b);
    if (goal.kind === 'div') near.push(goal.a - goal.b, goal.b);
    if (goal.kind === 'missing') near.push(goal.total + goal.a, goal.total);
  }
  const candidates = near.filter(ok);
  if (candidates.length > 0) return pick(rand, candidates);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const v = int(rand, 1, 30);
    if (ok(v)) return v;
  }
  return MAX_VALUE;
}

/** Net hits: correct hits less what the wrong ones cost, never below zero. */
export const netHits = (hits: number, wrong: number): number =>
  Math.max(0, hits - wrong * CANNON_SCORING.wrongCost);

/** The round's 0..100 performance — the number the master formula is fed. */
export const cannonPerformance = (hits: number, wrong: number): number =>
  Math.min(100, netHits(hits, wrong) * CANNON_SCORING.perHit);
