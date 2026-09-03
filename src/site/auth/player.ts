/**
 * What an individual account accumulates by playing.
 *
 * React-free and pure, like `business.ts` beside it, so `npm run verify` can
 * check the scoring and the streak without a browser. Anything that needs a
 * hook belongs in `AuthProvider`.
 *
 * The model is the one the old paylez app used (see
 * `landing/screenshots/learn1.png`): a score, a daily streak, a tank of energy,
 * and running answered/correct counts.
 *
 * **What bounds a day is energy, and nothing else.** Every finished round
 * spends one, win or lose. What an empty tank stops is *earning*, not playing —
 * it opens a practice round instead, and `awardPoints` is where that one rule
 * lives (see the note above it). The tank gains one every
 * `ENERGY_REGEN_MINUTES` rather than all of it at midnight, and what that
 * arithmetic comes to is sixteen finished rounds in a day from a full tank,
 * twelve a day sustained.
 *
 * A second rule used to sit beside it: a `DAILY_DECAY` curve that paid a
 * *repeat* of the same game 100/60/40/20/0%. It was written when play was
 * unlimited and it was the only brake there was. Once energy became one the
 * curve stopped reaching — it was per game, its zero rung was the fifth round
 * of one game, and a player rotating the seven spent the whole tank without
 * ever getting there — so a round now pays what it scored, first of the day or
 * ninth. Do not put it back: a result card that has to explain why the same
 * five right answers paid ten and then four is a card explaining a rule the
 * player never agreed to, and the door they actually hit is the tank.
 *
 * The two energy numbers mirror the server's **free** plan (`CONFIG.points`),
 * which is the only plan this site can resolve: there are no subscriptions here
 * to read a faster regen off.
 *
 * ── this module used to hold a wallet, and does not any more ─────────────
 *
 * There were three holdings in `PlayerState` — bought gift cards, stamp cards
 * and claimed hot deals — with the arithmetic for all three here: `redeem`,
 * `markUsed`, `stampVisit`, `claimDeal`, `openDeals`, the category strip and
 * `openNow`. Every one of them wrote to `localStorage`, and what they wrote to
 * it was fiction: the cards came off a catalogue in `content.ts`, the deals off
 * a board in the same file, and a "claim" was a code this browser made up.
 *
 * All of it is the server's now, read through `GET /v1/wallet` and
 * `GET /v1/deals` (`api/wallet.ts`). That is not a tidy-up, it is the only
 * arrangement in which a gift card bought with points that came off a real
 * ledger can be shown back to the person who bought it. **A claim in particular
 * cannot come back here**: `POST /v1/deals/:id/events` takes `impression` and
 * `open` and nothing else, because a claim is written by the gate from a
 * confirmed scan — so there is no local claim to keep either.
 *
 * What is left is the mirror of `GET /v1/games/state`: a balance, a streak, a
 * tank, two counters, and the pure functions that read them into a gauge, seven
 * circles and a score. `canAfford` stays because the wallet still has to decide
 * whether a button is pressable before it posts.
 */

/* The one import left, and it is a *type*: which of the seven games a round
   was. The catalogue and the board this file used to reach into are gone. */
import type { GameId } from '../content';

/**
 * How much energy a full tank holds, and what a round costs.
 *
 * Mirrors `CONFIG.points.dailyEnergy`, the server's **free** plan — the only
 * plan this site can resolve, because there are no subscriptions here to read a
 * bigger tank off. The server sells two: Pro holds six and Premium ten.
 */
export const MAX_ENERGY = 4;

/**
 * How long one energy takes to come back.
 *
 * Mirrors `CONFIG.points.energyRegenMinutes`, the free-plan figure — the server
 * sells a faster regen with a plan and this site has no plan to read. It is two
 * hours here, one on Pro, half an hour on Premium.
 *
 * **Two hours, halved from four.** The property that matters is the *first*
 * refill rather than the last: somebody who empties the tank over lunch is
 * playing again by two and whole again by evening, where four hours meant the
 * afternoon was simply over. A cost that expires while you are still on the page
 * is a cost; one that expires when you are asleep is a lockout, and four hours
 * was drifting toward the second.
 *
 * The pair is also the size of a day, and it is worth writing down because
 * nothing else in the module states it: four in the tank plus one every two
 * hours is **sixteen finished rounds in twenty-four hours** from full, and
 * twelve a day at the steady rate.
 */
export const ENERGY_REGEN_MINUTES = 120;

/** The same interval in milliseconds, which is what every clock here is in. */
const ENERGY_REGEN_MS = ENERGY_REGEN_MINUTES * 60_000;

/**
 * Streak freezes.
 *
 * A streak that resets to zero because somebody had one bad week is the rule
 * every streak product eventually softens, and for a good reason: the punishment
 * lands hardest on the player who has the most to lose, which is exactly the
 * player you were trying to keep. A freeze is the standard answer — one missed
 * day is absorbed rather than fatal — and it stays honest because the supply is
 * capped and earned.
 *
 * Earned, not given: one freeze every `FREEZE_EVERY` days of streak, up to
 * `MAX_FREEZES` held. So a freeze always costs a week of showing up, and a
 * player cannot bank enough of them to stop the streak meaning anything.
 *
 * What a freeze protects is the **streak**, and that is now the whole of what
 * there is to protect. A lapse used to take the balance with it; it does not any
 * more, because the server deliberately does not do that (`applyStreak` in
 * `server/domain/games.ts` says so) and the two halves of one product cannot
 * disagree about whether a bad week costs a year of earnings. Points are earned,
 * and the only thing that removes an earning is expiry on its own clock.
 */
export const MAX_FREEZES = 2;
export const FREEZE_EVERY = 7;

export interface PlayerState {
  points: number;
  streak: number;
  /**
   * Energy **as of `energyAt`**, not as of now — see the field below, and read
   * the pair through `energyOf` rather than this number on its own.
   */
  energy: number;
  answered: number;
  correct: number;
  /** `YYYY-MM-DD` of the last finished round, for the 24-hour streak rule. */
  lastPlayed: string | null;
  /**
   * When `energy` above was last true, in epoch milliseconds — the anchor the
   * regeneration clock counts from, rewritten every time energy is spent.
   *
   * The pair is the whole model, and the model is: **the tank is derived, never
   * ticked.** A timer that adds one every four hours only runs while a tab is
   * open, and the tab left open all evening and the one closed at nine have to
   * agree in the morning; `energyOf` does the arithmetic on demand instead,
   * which is the same answer with none of the moving parts. That is also why
   * `energy` on its own is *stale by design* — a state that has been sitting in
   * `localStorage` for six hours still says 0.
   *
   * Epoch milliseconds rather than the `YYYY-MM-DD` the rest of this module
   * writes, because a day string cannot say half past nine and this clock is
   * measured in hours. A number rather than an ISO string for the same reason
   * `lastPlayed` is a string: each is stored in the shape its own comparison
   * wants, and this one's comparison is a subtraction.
   *
   * Optional for the reason `freezes` is, and read the
   * generous way round: a session saved before the clock existed has no anchor,
   * and `energyOf` reads a missing one as a **full tank**. The alternative is
   * charging an existing player three rounds for a schema change they had no
   * part in, against a wait they never started.
   *
   * That is also what carries a session stored under the *old* field names —
   * `lives` / `livesAt`, from before the pool was called energy. It has neither
   * field, so it takes the same generous branch and is whole again, and its
   * first spend writes both. Nothing here has to know the old names, because
   * the only thing that would have been read off them is a wait, and the rule
   * for a wait we cannot prove is that it did not happen.
   */
  energyAt?: number | null;
  /**
   * Freezes held. Optional because it postdates the stored shape: a session
   * saved by an earlier build has no such field, and `freezesOf` below reads a
   * missing one as zero rather than as a crash.
   */
  freezes?: number;
  /*
   * There was a `rounds` field here — a per-game tally of what had been played
   * today, read by the decay curve to price a repeat. The curve is gone and so
   * is the field; energy is what bounds a day, and it is counted in `energy` /
   * `energyAt` above.
   *
   * A state stored by that build still has the key. Nothing validates the shape
   * on the way in (`directory.ts` parses and casts), so it loads, rides along
   * unread through every `{...state}` spread, and means nothing. Leaving it is
   * the right trade: a migration to delete one dead object from a page nobody
   * is looking at costs more than the fossil does.
   */
}

/** Freezes held, for a state that may predate the field. */
export const freezesOf = (state: PlayerState): number =>
  typeof state.freezes === 'number' ? Math.max(0, state.freezes) : 0;

/**
 * A player who has just opened an account: **nothing, and a full tank.**
 *
 * Zero of everything, and that is the whole point. There was a `seedPlayer`
 * beside this once — 340 points, a three-day streak, four gift cards, three
 * stamp cards and a claimed deal — kept for the demo account on the argument
 * that a wallet with nothing in it cannot show what a used voucher looks like.
 * That argument died with the shelf it bought from: the four cards came out of
 * `VOUCHER_CARDS` and the deal out of `WALLET_DEALS[0]`, and neither exists.
 *
 * It is not replaced by a smaller seed. A wallet is `GET /v1/wallet` now, so a
 * demo account's wallet shows whatever that account actually holds — which,
 * until somebody plays and buys something, is nothing. That is the state the
 * empty panels on `wallet.tsx` are written for, and it is the state every real
 * account starts in.
 *
 * The welcome gift is then the only thing a new player has not earned, and it
 * is paid by `finishOnboarding` for finishing the flow rather than for
 * existing — so the first balance anybody sees is 100, and every point after it
 * came from a round they played.
 */
export function newPlayer(): PlayerState {
  return {
    points: 0,
    streak: 0,
    energy: MAX_ENERGY,
    answered: 0,
    correct: 0,
    lastPlayed: null,
    /* No anchor: a full tank has no clock running. */
    energyAt: null,
    /* Zero, not one. A freeze is earned at the streak milestones in
       `awardPoints`, and handing one over at sign-up is the same category of
       gift as the 340 points this function exists to stop. */
    freezes: 0,
  };
}

/** Today, as `YYYY-MM-DD` in the visitor's own timezone. */
export function today(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Yesterday as a `Date`, which is what a caller that wants to keep walking
 *  needs. `yesterday()` below is this plus `today()`, and is what almost every
 *  caller actually wants. */
function yesterdayOf(now: Date): Date {
  const back = new Date(now);
  back.setDate(back.getDate() - 1);
  return back;
}

/** Yesterday, same format — the only day that continues a streak. */
function yesterday(now: Date = new Date()): string {
  return today(yesterdayOf(now));
}

/**
 * The day before yesterday — the only absence a freeze is worth.
 *
 * "Missed one day" is a `lastPlayed` two days back: played Monday, playing
 * Wednesday, absent on the Tuesday. Built by walking a `Date` rather than by
 * subtracting from the string, for the same reason `yesterday` is: month ends
 * and daylight saving make arithmetic on `YYYY-MM-DD` the wrong tool, and
 * `setDate` already knows the day before the 1st of March is in February.
 */
function twoDaysBack(now: Date = new Date()): string {
  const back = new Date(now);
  back.setDate(back.getDate() - 2);
  return today(back);
}

/* ──────────────────────────────────────────────────────────── the week ── */

/** One of the seven circles on the streak row. */
export interface StreakDay {
  /** `YYYY-MM-DD`, in the reader's own timezone like everything else here. */
  date: string;
  /**
   * 0 is Monday and 6 is Sunday — the index into the row *and* into the
   * dictionary's seven initials, which is why it is not JavaScript's own
   * `getDay()` numbering. `getDay()` puts Sunday first, and a week that starts
   * on Sunday is wrong in all five of this site's languages.
   */
  weekday: number;
  /** Whether the streak counts this day. */
  kept: boolean;
  /** Today. Exactly one of the seven, always. */
  now: boolean;
  /** A day this week that has not arrived yet — neither kept nor missed. */
  ahead: boolean;
}

/**
 * This week, Monday to Sunday, as the streak sees it.
 *
 * **Derived, not stored.** A `streak` of five and a `lastPlayed` of Thursday is
 * already the statement "Sunday through Thursday", so the row reads it back out
 * rather than keeping a second history beside it — which is the same choice
 * `energyOf` makes about the tank, for the same reason. Two records of one fact
 * disagree the first time either is written without the other, and the number
 * printed next to these circles is the one they would disagree with.
 *
 * It also means a day a **freeze** absorbed shows as kept, and that is correct
 * rather than a rounding: a freeze's whole job is that the day still counts.
 * The row is drawing what the streak claims, and the streak claims it.
 *
 * Three states, not two. A day in the future is `ahead` — not missed — because
 * a Monday morning with six empty circles after it is a week already lost, and
 * it is a week that has not happened. `now` is the seventh circle's own state
 * and rides alongside `kept`: today is a day you may still keep.
 *
 * Nothing here is memoised and nothing needs to be: seven `Date`s once per
 * render is cheaper than the comparison that would decide whether to redo it.
 */
export function streakWeek(state: PlayerState, now: Date = new Date()): StreakDay[] {
  /* Monday of the week `now` falls in. `getDay()` is 0..6 from Sunday, so
     Sunday has to walk back six days rather than none. */
  const offset = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(monday.getDate() - offset);

  const at = today(now);
  const run = Math.max(0, Math.floor(state.streak));

  /*
   * The last day the run covers.
   *
   * **A live streak with no `lastPlayed` ends yesterday**, and that is a reading
   * of an existing rule rather than a guess. `awardPoints` treats
   * `played === null` as `continued` — the same branch it gives an actual
   * yesterday — so as far as every rule in this module is concerned, `null` on a
   * streak that is still alive *is* yesterday. Drawing it as no days at all
   * would have the row contradict the number printed beside it, and the number
   * is the one the next round will act on.
   *
   * The state exists in the wild: it is what the seeded demo account looked like
   * before `seededPlayer` started writing a date, and a directory saved by that
   * build is still sitting in the `localStorage` of every device that has opened
   * this site. It is also a state the app itself cannot produce, because a
   * finished round always writes `lastPlayed` — so this is a reader of old data,
   * not a rule.
   *
   * A streak of **zero** takes neither branch and keeps nothing, which is the
   * genuinely new player and is right.
   */
  const last = state.lastPlayed ?? (run > 0 ? today(yesterdayOf(now)) : null);

  /* The first day the streak covers: `run` days ending *on* `last`, so a streak
     of one covers `last` alone. Held as a string so the comparison below is the
     same lexicographic one `YYYY-MM-DD` supports everywhere else in this
     module — and built by walking a `Date`, because subtracting from the string
     would be wrong across a month end. */
  let from: string | null = null;
  if (last !== null && run > 0) {
    const back = new Date(`${last}T12:00:00`);
    back.setDate(back.getDate() - (run - 1));
    from = today(back);
  }

  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(day.getDate() + i);
    const date = today(day);
    return {
      date,
      weekday: i,
      kept: from !== null && last !== null && date >= from && date <= last,
      now: date === at,
      ahead: date > at,
    };
  });
}

/* ────────────────────────────────────────────────────────────── the tank ── */

export interface EnergyTank {
  /** Energy available now, 0..`MAX_ENERGY`. */
  count: number;
  /**
   * When the next one lands, epoch ms — `null` on a full tank, which is the one
   * state there is nothing to count down to.
   */
  nextAt: number | null;
}

/**
 * The tank as of `now`: what is in it, and when it next gains.
 *
 * The only honest reader of `energy` and `energyAt` — see the note on the field.
 * Pure and deterministic on the injected `now`, so `npm run verify` owns it and
 * a screen can ask it once per render without running a timer of its own.
 *
 * **Both answers come out together**, because a screen needs both and computing
 * them apart is how they come to disagree: the count is the floor of a division
 * whose remainder is the wait, and two functions each doing that division end up
 * showing a full tank counting down to one it already has.
 */
/**
 * The tank's two limits, which stop being constants the moment a plan is sold.
 *
 * `MAX_ENERGY` / `ENERGY_REGEN_MINUTES` are the **free** figures and remain the
 * default, so every caller that does not know about plans keeps its old
 * behaviour and `npm run verify` keeps testing the same arithmetic. A screen
 * that has asked the server what this account is entitled to passes the real
 * pair instead — Pro is 6 at 60 minutes, Premium 8 at 30 — and the same
 * division then produces the right gauge without a second implementation.
 *
 * The server is still the authority: `games.energyFor` reads the identical two
 * entitlements and its answer is what a round is actually charged against.
 * This is the display agreeing with it rather than guessing.
 */
export interface EnergyLimits {
  max: number;
  regenMinutes: number;
}

export function energyOf(
  state: PlayerState,
  now: Date = new Date(),
  limits: EnergyLimits = { max: MAX_ENERGY, regenMinutes: ENERGY_REGEN_MINUTES },
): EnergyTank {
  const MAX_ENERGY = Math.max(1, Math.floor(limits.max));
  const ENERGY_REGEN_MS = Math.max(1, limits.regenMinutes) * 60_000;
  const anchor = state.energyAt;
  /* No anchor is no clock, and no clock means nothing is pending — which is a
     full tank. Every session saved before the clock existed takes this branch,
     and so does every session saved under the old `lives` / `livesAt` names. It
     is the forgiving direction on purpose: the stored count of such a state was
     last true at some unknown time, and reading it as "true now" would open an
     account on a wait it never incurred. */
  if (typeof anchor !== 'number') return { count: MAX_ENERGY, nextAt: null };

  const held = Math.min(MAX_ENERGY, Math.max(0, Math.floor(state.energy)));
  /* A clock that has gone backwards — a laptop waking with the wrong time, a
     timezone dragged across an ocean — earns nothing rather than un-earning
     what is already there. */
  const earned = Math.max(0, Math.floor((now.getTime() - anchor) / ENERGY_REGEN_MS));
  const count = Math.min(MAX_ENERGY, held + earned);

  /* The cap is on the count and not on the clock: an anchor a week old is a
     full tank, and everything past the third is simply never granted. */
  return count >= MAX_ENERGY
    ? { count: MAX_ENERGY, nextAt: null }
    : { count, nextAt: anchor + (earned + 1) * ENERGY_REGEN_MS };
}

/**
 * Spend one, and start — or keep — the clock.
 *
 * Unchanged on an empty tank, the same contract `redeem` and `claimDeal` have,
 * so a caller may spend optimistically.
 *
 * The anchor is the part worth reading twice. A **full** tank has no clock
 * running, so the spend starts one at `now`. A tank that is already filling has
 * one, and its new anchor is the moment the unit sitting in it arrived —
 * `nextAt - ENERGY_REGEN_MS` — never `now`. Restarting it on every spend would
 * quietly confiscate the three hours somebody had already waited, and the third
 * round of an afternoon would cost strictly more than the first.
 */
export function spendEnergy(state: PlayerState, now: Date = new Date()): PlayerState {
  const tank = energyOf(state, now);
  if (tank.count <= 0) return state;
  return {
    ...state,
    energy: tank.count - 1,
    energyAt: tank.nextAt === null ? now.getTime() : tank.nextAt - ENERGY_REGEN_MS,
  };
}

/* ─────────────────────────────────────────────────── what a round is worth ── */

export interface Award {
  /** Which game it was. */
  game: GameId;
  /**
   * What the round is worth, and therefore what it banks.
   *
   * **One number, not two.** A decay curve used to sit between this and the
   * balance, so the result card had a "scored" figure and a "banked" figure and
   * a `bankedPoints` helper existed to stop them drifting apart. With the curve
   * gone they are the same number and this field is it: `awardPoints` adds
   * exactly this to the balance, and a card that wants to say what a round paid
   * reads it directly. Nothing between here and the ledger multiplies it.
   */
  points: number;
  /** How many questions, gaps, words or pairs the round put to the player. */
  answered: number;
  /** How many of them they got. */
  correct: number;
  /**
   * True when the player stayed inside the game's mistake allowance.
   *
   * **It no longer decides what the round costs.** Every finished round spends
   * one energy either way, so this is what the result card says and what the
   * streak and the accuracy columns are computed from, and nothing else. It was
   * the flag the charge hung on, which is why the note is here rather than
   * deleted: a reader who remembers the old rule needs to be told it changed at
   * the field they would have looked at.
   */
  won: boolean;
}

/**
 * Bank a finished round, whatever scored it.
 *
 * **This is the only place the streak, the lapse and the freeze are decided.**
 * There were two copies of that rule before the arcade round arrived and there
 * would be four by now — the quizzes, the flight, Word Builder and Memory Match
 * all score differently and none of them has any business restating what a
 * streak is. They compute a number; this decides what it does to the account.
 *
 * The streak rule: play inside 24 hours and it continues, miss the window and it
 * goes back to zero. Playing twice in one day does not advance it twice, which
 * is why `lastPlayed` is a date rather than a count.
 *
 * **A lapse no longer takes the balance with it.** It used to — the old app
 * wiped points on a missed day — and the backend deliberately does not, because
 * points are an auditable ledger there and deleting a year of earnings over a
 * bad week is not one of the reasons it recognises for a negative entry. Two
 * halves of one product cannot disagree about that, so this half moved. Points
 * now leave only by being spent or by expiring on their own clock.
 *
 * The one thing that can stand between a missed window and the streak reset is a
 * freeze. It is spent here, silently and automatically: a dialog asking "use a
 * freeze?" would arrive a day late, on the round *after* the one that was
 * missed, about a decision the player can no longer change.
 *
 * **And every finished round costs one energy**, which is the other thing this
 * function decides. See the note at the spend itself for why both sides pay.
 *
 * **A round played on an empty tank changes nothing here.** That is a
 * *practice* round — the screen offers one rather than a locked door, because
 * an empty tank was the single state of this product with nothing to do in it —
 * and what it does not do is the whole of what energy buys: no points, no
 * streak, no freeze earned or spent, no day marked as played, not even the
 * accuracy tally. The one rule, in one place, so that "practice" cannot come to
 * mean six slightly different things across eight games.
 *
 * The test is the tank *now*, and that is exact rather than approximate: energy
 * only ever refills, and the only thing that takes it is the spend three lines
 * below, so a tank reading empty at the end of a round was empty at the start
 * of it. There is no state in which this pays nothing for a round that was
 * offered as paid.
 */
export function awardPoints(
  state: PlayerState,
  result: Award,
  now: Date = new Date(),
): PlayerState {
  if (energyOf(state, now).count <= 0) return state;

  const day = today(now);
  const played = state.lastPlayed;

  /* Three cases, and the order matters: already played today, continued inside
     the window (or never played at all), or lapsed. */
  const sameDay = played === day;
  const continued = played === yesterday(now) || played === null;
  const lapsed = !sameDay && !continued;

  /* A lapse is absorbed if it is the size a freeze is for *and* there is one to
     spend on it. The streak then advances exactly as a normal day would.

     The length test is not a detail. `lapsed` says only "not today and not
     yesterday", so without it a player coming back after two years took the
     same branch as one who missed a Tuesday: streak incremented as though they
     had never been away. A freeze is sold as one missed day — on the streak
     card, and in everything `MAX_FREEZES` reasons about — so it covers exactly
     one, and a longer absence is the reset. */
  const held = freezesOf(state);
  const frozen = lapsed && played === twoDaysBack(now) && held > 0;

  const streak = sameDay ? state.streak : lapsed && !frozen ? 1 : state.streak + 1;

  /*
   * Freezes earned, then the one spent.
   *
   * Earned off the streak the round just produced rather than the one it
   * started from, so the seventh day pays for itself. `sameDay` earns nothing
   * because the streak did not move — otherwise a second round on day seven
   * would mint a second freeze.
   */
  let freezes = held;
  if (frozen) freezes -= 1;
  if (!sameDay && streak % FREEZE_EVERY === 0) {
    freezes = Math.min(MAX_FREEZES, freezes + 1);
  }

  /*
   * **Every finished round costs one energy, win or lose.**
   *
   * Charging only the loss was the version before this, and it was the same
   * mistake as charging nothing, one step smaller: three of the eight games have
   * no fail state and a player answering correctly never touched the tank, so
   * the pool was a tax on being bad at quizzes and a bound on nobody. Three
   * pips that only ever moved for the struggling player read as a punishment;
   * cells that mean "rounds left" read as a budget, and everybody has the
   * same one.
   *
   * A round *abandoned* still costs nothing — this is the only spend in the
   * module and it is reached only by a finished round.
   *
   * The clock above is what pays for it. Under a midnight tank a third round
   * shut the page for the rest of the day; under `ENERGY_REGEN_MINUTES` it
   * shuts it for four hours.
   */
  const spent = spendEnergy(state, now);

  /* The round banks what it scored. Nothing here asks how much has been played
     today — a decay curve used to, and the tally it counted went with it. What
     the day costs is the energy above; what it pays is this. */
  return {
    ...spent,
    points: spent.points + result.points,
    streak,
    freezes,
    answered: spent.answered + result.answered,
    correct: spent.correct + result.correct,
    lastPlayed: day,
  };
}

/**
 * All five right.
 *
 * The whole job of this bonus is to make the last question worth answering. One
 * point an answer is otherwise a flat line — the fifth question pays exactly
 * what the first did, whatever has happened in between — and something on the
 * end is what turns a round into something with a shape.
 *
 * **One, down from five.** It used to be most of what a quiz was worth, which
 * made the difference between four right and five right larger than the
 * difference between one right and four. The shape it exists to give is now
 * split between this and the speed bands below, and the two together are worth
 * three — which is what a clean, fast round is: five for the answers, one for
 * the sweep, two for the clock.
 *
 * Mirrors `CONFIG.games.quizPerfectBonus`.
 */
export const QUIZ_PERFECT_BONUS = 1;

/**
 * What a *fast* clean sweep is worth, on top of the bonus above.
 *
 * Measured across the **whole round** — first question on screen to last answer
 * — rather than per question, and that is the choice that gives the bands their
 * meaning. Every quiz has its own per-question clock (six seconds on the flags,
 * twelve on Brain Games), so a per-question threshold would be free on the games
 * whose clock is already tighter than it and would bite only on the slowest one.
 * A whole-round budget of ten seconds is about two a question: reachable on
 * recognition, genuinely hard on a question you have to read. The bonus is a
 * different size of ask per game, and that is correct — they are different
 * games.
 *
 * **It is paid only on a clean sweep**, and that is not what the brief literally
 * said. Read strictly, "all questions answered under ten seconds" pays two
 * points for five deliberate wrong answers hammered out in two — a round worth
 * more for being wrong quickly than right slowly. It also reconciles the two
 * halves of what was asked: the same brief says a round with all five right is
 * worth three more, and one for the sweep plus two for the clock is exactly
 * three.
 *
 * `throughSeconds` and not `under`: "up to ten seconds" includes ten, and the
 * comparison below is `<=`. A field named for one comparison and used with the
 * other is the sort of thing that survives a rewrite and quietly moves a band.
 */
export const QUIZ_SPEED_BONUS = [
  { throughSeconds: 10, points: 2 },
  { throughSeconds: 15, points: 1 },
  { throughSeconds: null, points: 0 },
] as const;

/** The band a round's elapsed seconds land in. */
export function quizSpeedBonus(seconds: number): number {
  const taken = Math.max(0, seconds);
  for (const band of QUIZ_SPEED_BONUS) {
    if (band.throughSeconds === null || taken <= band.throughSeconds) return band.points;
  }
  return 0;
}

export interface RoundResult {
  /** Which of the four quizzes. */
  game: GameId;
  correct: number;
  total: number;
  /** Points the round is worth per correct answer, from the game's own table. */
  perCorrect: number;
  /**
   * How long the whole round took, in whole seconds — first question on screen
   * to last answer. Only the speed bands read it, and only on a clean sweep.
   */
  seconds: number;
}

/**
 * What a quiz round is worth.
 *
 * Split out from `awardRound` because the result card needs the same number the
 * balance gets, and the two must not be two sums. Every right answer is worth
 * the same and the game says how much; a clean sweep adds the perfect bonus, and
 * a *fast* clean sweep adds the speed band on top.
 *
 * **A quiz can no longer be lost, so nothing here decides whether it was.** The
 * mistake allowance is gone — a player answers all five however many they get
 * wrong — and `won` is now simply the clean sweep, which is the only
 * distinction left that means anything and is the one the bonuses are paid on.
 * It used to be handed in by the caller, which was the caller reporting a rule
 * this module owns.
 */
export function quizAward(result: RoundResult): Award {
  const swept = result.correct >= result.total;
  return {
    game: result.game,
    points:
      result.correct * result.perCorrect +
      (swept ? QUIZ_PERFECT_BONUS + quizSpeedBonus(result.seconds) : 0),
    answered: result.total,
    correct: result.correct,
    won: swept,
  };
}

/** A quiz round, banked. Kept as its own name because four callers read better
 *  for it. */
export function awardRound(
  state: PlayerState,
  result: RoundResult,
  now: Date = new Date(),
): PlayerState {
  return awardPoints(state, quizAward(result), now);
}

export interface FlightResult {
  game: GameId;
  /** Gaps flown through this attempt. The run is endless, so this is unbounded. */
  cleared: number;
  /** Gaps that bank the round, from the game's own row in `GAMES`. */
  target: number;
  /** Points one gap pays. **Half a point**, since the rework — see `flightPoints`. */
  perGap: number;
  won: boolean;
}

/**
 * Most points a single flight may pay.
 *
 * The ceiling is on the **payout**, not on the gaps, and that is the change
 * worth understanding: capping the gaps at ninety-nine was a cap in name only —
 * at two points each it let one lucky run out-earn four days of everything else
 * on the page, which is not a bound, it is a jackpot. A flight is still endless
 * and skill is still paid for past the bank line; it stops being paid at twenty,
 * which is the same order as every other round in the set.
 *
 * It also does the job the gap clamp was really there for. `cleared` arrives
 * from an animation loop rather than from a question index, and an unbounded
 * number multiplied into a balance is the kind of thing a server would refuse.
 *
 * Mirrors `CONFIG.games.flightMaxPoints`.
 */
export const MAX_FLIGHT_POINTS = 20;

/** Gaps a flight may bank: floored, and never negative. A rAF loop can hand
 *  over either. */
export function bankableGaps(cleared: number): number {
  return Math.max(0, Math.floor(cleared));
}

/**
 * What a flight pays, wherever it is asked.
 *
 * **Half a point a gap, floored once at the end.** The half is what lets the
 * scroll speed climb without the payout running away with it — a run that lasts
 * twice as long is worth twice as much, and twice as much of a half is still
 * modest against the ceiling. Flooring is deliberate and it is deliberate that
 * it happens *here*, once: an odd gap count leaves a half point on the table,
 * and rounding it up instead would pay for a gap that was not flown.
 */
export function flightPoints(cleared: number, perGap: number): number {
  return Math.floor(Math.min(bankableGaps(cleared) * perGap, MAX_FLIGHT_POINTS));
}

/**
 * What a finished flight is worth.
 *
 * An `Award` rather than a call through `quizAward`, and that is deliberate: a
 * flight that reaches its bank line is not a clean sweep of five questions and
 * must not collect the quiz's perfect bonus. What the two share is
 * `awardPoints` below, which is where the streak, the lapse and the freeze live
 * — a second copy of *those* is how one of them quietly becomes a lie.
 *
 * A gap flown is a gate cleared and a gap hit is a gate failed, so the round is
 * charged to `answered` in full and only the gaps flown count as `correct` —
 * exactly what the quiz engine already does when a round ends early on its
 * mistake allowance. Without that a flight-only player would sit permanently
 * last on a leaderboard they are actively competing on, which is a worse lie
 * than a mixed accuracy column.
 *
 * `correct` saturates at the target while the points keep counting to the
 * ceiling: the flight does not stop at the bank line — stopping it there would
 * be the tuning equivalent of ending a quiz because it was going well — so a
 * fifteen-gap flight is 15/5 of nothing sensible, but it is unarguably 15
 * points. And a `won` that did not actually reach the target is recorded as the
 * loss it was.
 */
export function flightAward(result: FlightResult): Award {
  const banked = bankableGaps(result.cleared);
  return {
    game: result.game,
    points: flightPoints(result.cleared, result.perGap),
    answered: result.target,
    correct: Math.min(banked, result.target),
    won: result.won && banked >= result.target,
  };
}

/** A finished flight, banked. */
export function awardFlight(
  state: PlayerState,
  result: FlightResult,
  now: Date = new Date(),
): PlayerState {
  return awardPoints(state, flightAward(result), now);
}

/* ────────────────────────────────────────────────────── the two new games ── */

/**
 * What one solved word is worth in Word Builder.
 *
 * Base plus the word's own difficulty, and nothing else. There is no speed term
 * and no first-try term any more: both used to sit here, and between them they
 * were worth twice the word — which made the game a race and a reflex test,
 * which is precisely what the other five already are. The clock is gone from the
 * component with them; nothing measures how long a word took.
 *
 * A hint forfeits the tier bonus and leaves the base. That is the whole penalty,
 * and it is the right shape: somebody who needed the hint still earns for having
 * finished the word, they just do not earn for it having been hard.
 *
 * An unsolved word is worth nothing and is simply not passed here.
 *
 * Mirrors `CONFIG.games.wordBase` / `wordTierBonus`.
 */
export interface WordScore {
  /** 1 easy (3–4 letters), 2 medium (5–6), 3 hard (7+). The bank carries it. */
  tier: number;
  /** A letter was revealed. */
  hinted: boolean;
}

/**
 * What each tier is worth: **the tier itself**, 1 / 2 / 3.
 *
 * A round is the ramp `[1, 1, 2, 2, 3]`, so a clean five is nine points and the
 * last word is worth three times the first — which is the whole reason the ramp
 * exists. This replaced a base of one plus a bonus of 0/1/2, which came to the
 * same three numbers by a longer route and made a hinted word's value a
 * subtraction rather than a fraction.
 */
export const WORD_TIER_POINTS = [1, 2, 3];

/**
 * A word, scored.
 *
 * **A hint halves it**, where it used to forfeit the tier bonus and leave the
 * base — which paid the same one point for a hinted three-letter word and a
 * hinted nine-letter one, and so made the hint free on exactly the words it
 * should cost most on. Half of three is more than half of one, which is the
 * shape a hint should have: it costs in proportion to what it gave away.
 *
 * Returns a **half point** where one was used. Nothing rounds here — the round's
 * total is floored once, in `wordRoundPoints`, because flooring each word would
 * charge the same hint twice.
 */
export function wordPoints(word: WordScore): number {
  const full = WORD_TIER_POINTS[Math.min(Math.max(word.tier, 1), 3) - 1];
  return word.hinted ? full / 2 : full;
}

/**
 * The whole round solved with no wrong guess and no hint.
 *
 * Worth one, down from three. The round's own ramp does the work now that a word
 * pays its tier — nine points across five words, with the last worth three of
 * them — so the bonus is the nod at the end rather than a third of the total.
 * Mirrors `CONFIG.games.wordPerfectBonus`.
 */
export const WORD_PERFECT_BONUS = 1;

/**
 * A finished Word Builder round, in whole points.
 *
 * **The one place the halves are resolved.** Hinted words come back as halves,
 * and a round with three of them is worth an odd number of halves; flooring once
 * here is the difference between losing a point and losing three. The bonus is
 * added before the floor for the same reason — it is part of the round, not a
 * separate payment.
 *
 * `clean` is every word solved with no wrong attempt and no hint. Both halves
 * are load-bearing: a bonus paid on "no hints" alone would go to somebody who
 * guessed at every word until it went in.
 */
export function wordRoundPoints(words: WordScore[], clean: boolean): number {
  const earned = words.reduce((sum, word) => sum + wordPoints(word), 0);
  return Math.floor(earned + (clean ? WORD_PERFECT_BONUS : 0));
}

/**
 * What a finished Memory Match round is worth — **time, and nothing else.**
 *
 * The board was scored on move count and paid a guaranteed 36 for six pairs that
 * cannot be lost, which made it the richest round on the page for the least
 * asked of anybody. Time is the honest measure of the skill it actually tests:
 * remembering where a card was is what makes you fast, and a player turning
 * cards at random is slow whatever their move count says.
 *
 * Bands rather than a curve, so a result screen can say which one you landed in
 * and what the next one was worth — a continuous score off a hidden stopwatch is
 * a number nobody can aim at. The last band has no ceiling and still pays three:
 * finishing is always worth something, which is what keeps the board the
 * approachable one of the set now that it is measured. It is still not *raced* —
 * there is no countdown and no fail state, and the clock on screen counts up.
 *
 * **Three bands, and they are tight.** Forty seconds for the top band was most
 * of a leisurely round; eighteen is a board somebody has actually learned. The
 * spread narrowed with it — 8 / 6 / 3 rather than 12 / 8 / 4 / 2 — so the
 * difference between a good clear and a slow one is a point or two rather than a
 * multiple, which is the right weight for the one game in the set that cannot be
 * lost.
 *
 * `throughSeconds` and not `under`: "up to eighteen seconds" includes eighteen.
 * The clock is floored to whole seconds before it gets here, so this is the same
 * band a player reads off the stopwatch when it stops.
 *
 * Mirrors `CONFIG.games.memoryBands`.
 */
export const MEMORY_BANDS = [
  { throughSeconds: 18, points: 8 },
  { throughSeconds: 23, points: 6 },
  { throughSeconds: null, points: 3 },
] as const;

export function memoryPoints(seconds: number): number {
  const taken = Math.max(0, seconds);
  for (const band of MEMORY_BANDS) {
    if (band.throughSeconds === null || taken <= band.throughSeconds) return band.points;
  }
  /* Unreachable — the last band's `null` catches everything — but the list is
     data and a list edited down to bands that all have a ceiling should still
     pay rather than return nothing. */
  return MEMORY_BANDS[MEMORY_BANDS.length - 1].points;
}

/*
 * `refillLives` is gone. It restored the whole tank on a new calendar day and
 * had two problems: it fired on mount only, so a tab left open past midnight
 * never refilled at all, and a refill is a *write* — a rule that only takes
 * effect when somebody happens to load the page. `energyOf` above replaced both
 * with one division. Nothing writes energy back now; the tank is read.
 */

/**
 * Whether a balance covers a price.
 *
 * The last survivor of the wallet arithmetic that used to live here, and it
 * survives because it is the one piece that is not a *holding*: the catalogue
 * has to know whether to disable a button before it posts to
 * `POST /v1/gift-cards`, and the server's refusal ("not enough points") is the
 * wrong place to learn it — a button you can press that always fails is worse
 * than one that says why it is dark.
 */
export function canAfford(state: PlayerState, points: number): boolean {
  return state.points >= points;
}
