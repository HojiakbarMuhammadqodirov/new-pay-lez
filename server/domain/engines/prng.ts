/**
 * mulberry32 — the one PRNG both seeded games draw from, on the server and on
 * the phone.
 *
 * **Chosen for being small enough to port bit-for-bit**, not for its quality.
 * The server replays a round from its seed and the move list the client sends,
 * and the phone plays the same round locally from the same seed — so the two
 * implementations have to produce the *identical* stream, forever, in two
 * languages. mulberry32 is five lines of 32-bit integer arithmetic with no
 * floating point anywhere in the state, which is exactly what makes that
 * tractable: Dart's `int` is 64-bit, so every step below is reproduced with a
 * mask to 32 bits and nothing is left to a platform's rounding.
 *
 * **The stream is consumed only through `pick`**, which returns an integer in
 * `0..n-1` as `floor(u × n / 2^32)` over the raw 32-bit output `u`. That is
 * computed in integers (`u × n` is below 2^53 for any `n` this module uses), so
 * there is no float in the whole chain — the conventional `next() * n` form
 * would be exact too, but it is one more thing a port has to reason about.
 *
 * `server/GAMES-2048-FOODCROSS.md` is the normative description and carries
 * test vectors; `verify.ts` checks this file against them.
 */
export interface Rng {
  /** The raw 32-bit output, as an unsigned integer 0..2^32-1. */
  nextU32(): number;
  /** An integer in `0..n-1`: `floor(u × n / 2^32)`. `n` must be 1..2^20. */
  pick(n: number): number;
  /** How many 32-bit draws have been taken — for tests and the doc's vectors. */
  readonly draws: number;
}

/** A mulberry32 stream from a 32-bit seed. Negative or oversized seeds are masked. */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  let draws = 0;
  const nextU32 = (): number => {
    draws += 1;
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  return {
    nextU32,
    pick(n: number): number {
      if (!Number.isInteger(n) || n < 1 || n > 1 << 20) {
        throw new RangeError(`pick(${n}) is outside 1..2^20`);
      }
      /* `u × n` < 2^52, so this product and the division by 2^32 are exact in a
         double; `Math.floor` is then a true integer floor. */
      return Math.floor((nextU32() * n) / 4294967296);
    },
    get draws() {
      return draws;
    },
  };
}

/**
 * A fresh round seed: a uniformly random unsigned 32-bit integer.
 *
 * From the platform CSPRNG rather than `Math.random`, because the seed is the
 * whole of what makes one board different from the next, and a guessable seed
 * is a board a client can pre-solve before pressing Play.
 */
export function freshSeed(): number {
  const bytes = new Uint32Array(1);
  globalThis.crypto.getRandomValues(bytes);
  return bytes[0] >>> 0;
}
