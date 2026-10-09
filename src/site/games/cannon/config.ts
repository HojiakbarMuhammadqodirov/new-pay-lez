/**
 * Canon Numbers — every tunable in one place.
 *
 * The game: a sum sits at the top of the field, numbered targets drift down,
 * and a cannon at the bottom fires wherever the player taps (or aims with the
 * arrow keys). Hit the number that answers the sum and a new sum is dealt; hit
 * a wrong one and it costs a point. Ninety seconds, sums getting harder as the
 * score climbs.
 *
 * The field is measured in its own units — 1 wide and `ASPECT` tall — so the
 * same numbers hold on a 390px phone and a desktop; the canvas scales them.
 */

/* ── scoring: the one block the economics config has to agree with ─────────
 *
 * `CANNON_SCORING` is the whole of what a round is worth, in the rulebook's
 * shape (`landing/uploads/paylez-points-rulebook.md` §4–§5): the game produces
 * a 0..100 **performance** and the master formula (`arcadePoints` here,
 * `CONFIG.games` on the server) turns that into points. Bird's Flight is the
 * model — "performance = min(100, obstacles × 4)" — because this is the same
 * kind of game: an arcade round whose raw result is a count.
 *
 *   net         = max(0, correct hits − wrong hits)
 *   performance = min(100, net × PER_HIT)          → 25 net hits is perfect
 *
 * Wrong hits subtract because otherwise firing at everything is the best
 * strategy, and the game would stop being about the sum. They subtract one
 * hit's worth, not more: the round has no fail state (games.md, "nothing that
 * can be lost, is"), and a heavier penalty would make a guess worse than not
 * playing.
 *
 * The server's side is the `cannon_numbers` row of `ARCADE_ECONOMY` in
 * `server/config.ts` (`performancePerUnit` is `perHit`; the rate bound and
 * allowance live only there), and `npm run verify` fails if `perHit` or
 * `wrongCost` stops agreeing with it — change one side and change the other.
 */
export const CANNON_SCORING = {
  /** Performance per net correct hit. 4 → 25 net hits is a perfect round. */
  perHit: 4,
  /** Hits a wrong target takes off the net. */
  wrongCost: 1,
} as const;

/** Net hits for a perfect round — what the card's reward line names. */
export const CANNON_PERFECT = Math.ceil(100 / CANNON_SCORING.perHit);

/** The round, in seconds. 90 lands a whole round inside the 1–2 minute brief. */
export const ROUND_SECONDS = 90;

/* ── the field ──────────────────────────────────────────────────────────── */

/** Field height in field widths — the `.ar-tall` frame is 3 : 4. */
export const ASPECT = 4 / 3;

export const CANNON = {
  /** Pivot of the barrel, near the bottom centre. */
  x: 0.5,
  y: ASPECT - 0.07,
  /** The carriage the barrel sits on. */
  baseRadius: 0.07,
  /** Pivot to muzzle. Most of it shows above the carriage, so it reads as a barrel. */
  barrelLength: 0.17,
  barrelWidth: 0.05,
  /** The barrel never points lower than this from straight up (radians). A
      shot fired flatter would leave the field before it reached anything. */
  maxTilt: (78 * Math.PI) / 180,
  /** Keyboard turning speed, radians a second — a full sweep in under a second. */
  turnSpeed: 2.6,
  /** How far the barrel kicks back on a shot, in field widths. */
  recoil: 0.02,
  recoilMs: 140,
};

export const BALL = {
  radius: 0.016,
  /** Field widths a second. Fast enough that a target barely moves while the
      ball is in flight, so a player aims where the number is, not ahead of it. */
  speed: 2.6,
  /** Minimum time between shots. Long enough that holding Space is not a
      strategy, short enough that a quick double-tap still lands both. */
  cooldownMs: 200,
  /** At most this many balls in the air at once. */
  maxInFlight: 3,
};

export const TARGET = {
  /** 0.072 of the field: 44px across on the ~305px field a 390px phone gets —
      the tap minimum, measured rather than assumed. */
  radius: 0.072,
  /** A target that falls below this line is gone — the cannon's ground. */
  floorY: ASPECT - 0.17,
  /** Gentle side-to-side drift, so the field is alive without being a dodge. */
  swayAmplitude: 0.018,
  swaySpeed: 1.3,
  /** Targets keep at least this gap between their edges when spawned. */
  spacing: 0.03,
  /** Fade-in on arrival and fade-out on leaving, ms. */
  fadeMs: 220,
  /** A target that has to be there *now* — a freshly dealt answer, or a top-up
      when the field runs thin — fades in somewhere in this band rather than
      entering from above, so the player is never left waiting for it. */
  entryBand: [0.1, 0.38] as const,
  /** Reduced motion: targets do not fall, they hover in place and leave after
      this long (ms). The game stays playable with nothing moving but the shot. */
  stillLifeMs: 7000,
};

/* ── difficulty ─────────────────────────────────────────────────────────────
 *
 * The level is read off the net score, not the clock: a struggling player stays
 * on sums they can do, and a quick one is not held back. Each level is a row:
 * how fast targets fall, how many are on the field, how often one arrives, and
 * the share of new arrivals that answer the current goal.
 *
 * `minTargets` is what keeps it a maths game. The first build let a quick
 * player empty the field, and with the answer re-dealt the moment a sum was hit
 * it was often the only disc left — a bot clicking discs at random scored 34 in
 * 25 seconds. With at least three near misses beside it, guessing loses points.
 */
export interface Level {
  /** Net hits at which this level begins. */
  from: number;
  /** Fall speed, field widths a second. */
  fall: number;
  /** Fewest live targets — below this the field is topped up at once. */
  minTargets: number;
  /** Most targets on the field at once. */
  maxTargets: number;
  /** Ms between arrivals. */
  spawnMs: number;
  /** Chance a new arrival answers the goal (one always does — see `goals.ts`). */
  answerShare: number;
}

export const LEVELS: readonly Level[] = [
  { from: 0, fall: 0.085, minTargets: 4, maxTargets: 5, spawnMs: 1300, answerShare: 0.3 },
  { from: 5, fall: 0.1, minTargets: 4, maxTargets: 6, spawnMs: 1150, answerShare: 0.25 },
  { from: 10, fall: 0.115, minTargets: 5, maxTargets: 6, spawnMs: 1050, answerShare: 0.25 },
  { from: 15, fall: 0.13, minTargets: 5, maxTargets: 7, spawnMs: 950, answerShare: 0.2 },
  { from: 20, fall: 0.15, minTargets: 5, maxTargets: 7, spawnMs: 850, answerShare: 0.2 },
];

/* ── feedback ───────────────────────────────────────────────────────────── */

export const FEEDBACK = {
  /** How long "+1" / "−1" floats over a hit target, ms. */
  floatMs: 650,
  /** The burst ring on a correct hit, ms, and how far it grows. */
  burstMs: 380,
  burstGrow: 0.06,
  /** A wrong target shakes before it goes. */
  shakeMs: 360,
  /** How long a crossed-out wrong target stays — as long as its "−1". */
  wrongMs: 650,
  shakeAmplitude: 0.012,
  /** The goal banner's pulse after any hit, ms (CSS reads it via a data flag). */
  bannerMs: 420,
  /** The last seconds the timer is drawn as a warning. */
  warnSeconds: 10,
};

/** Wait between "time" and handing the round to the result card. */
export const END_MS = 1100;
