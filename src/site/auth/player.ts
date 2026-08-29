/**
 * What an individual account accumulates by playing.
 *
 * React-free and pure, like `business.ts` beside it, so `npm run verify` can
 * check the scoring and the wallet arithmetic without a browser. Anything that
 * needs a hook belongs in `AuthProvider`.
 *
 * The model is the one the old paylez app used (see
 * `landing/screenshots/learn1.png`): a score, a daily streak, three lives, and
 * running answered/correct counts.
 *
 * What bounds a day is two rules, and they bound two different players.
 * `DAILY_DECAY` below prices a *repeat* of the same game — the fifth pays
 * nothing — which is the brake on somebody farming one round all evening; it
 * prices the round rather than refusing it. Lives are the other, and they do
 * refuse one: a lost round spends one, and an empty tank is a shut door. What
 * keeps that from being a locked door is the clock — the tank gains one life
 * every `LIFE_REGEN_MINUTES` rather than all three at midnight, so a bad
 * morning is paid off by the afternoon and not by tomorrow.
 *
 * Both mirror the server's **free** plan (`CONFIG.points`,
 * `CONFIG.games.decay.free`), which is the only plan this site can resolve:
 * there are no subscriptions here to read a faster regen off.
 */

/*
 * The one import, and it is the catalogue rather than anything React-shaped.
 * A wallet holds cards off a shelf, so what a card costs and what it is worth
 * are the shelf's business and not this module's — the four seeded vouchers
 * below used to carry their own face values and two of them disagreed with the
 * shelf they were supposedly bought from.
 */
import { CHEAPEST_VOUCHER_POINTS, voucherCard, type GameId } from '../content';

/** How many lives a full tank holds, and what a round can cost. */
export const MAX_LIVES = 3;

/**
 * How long one life takes to come back.
 *
 * Mirrors `CONFIG.points.lifeRegenMinutes`, the free-plan figure — the server
 * sells a faster regen with a plan and this site has no plan to read.
 *
 * Four hours is what makes charging for a loss fair, and the two numbers have
 * to be read together: three lives at four hours is twelve hours from empty to
 * full, so somebody who loses three rounds at nine in the morning is playing
 * again by one and whole again by nine — where a midnight refill charged the
 * same three losses the entire rest of the day. A cost that expires while you
 * are still on the page is a cost; one that expires when you are asleep is a
 * lockout.
 */
export const LIFE_REGEN_MINUTES = 240;

/** The same interval in milliseconds, which is what every clock here is in. */
const LIFE_REGEN_MS = LIFE_REGEN_MINUTES * 60_000;

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

/**
 * Points needed for the cheapest voucher, so the wallet can say how far off you
 * are.
 *
 * Read off the catalogue rather than restated as `100`, which was right only
 * for as long as nobody moved the shelf. The same figure is the L-Earn hero's
 * third stat and the vouchers hero's second, and all three are now one
 * derivation from `VOUCHER_CARDS` — so "you are 40 points short" and the
 * cheapest card in the grid below it cannot disagree about what enough is.
 *
 * Kept under this name because every caller asks the player module what a
 * balance falls short of, not the content module what a card costs.
 */
export const CHEAPEST_VOUCHER = CHEAPEST_VOUCHER_POINTS;

export interface OwnedVoucher {
  id: string;
  brand: string;
  /** The letter on the tile. Brands are never translated. */
  logo: string;
  /** What it cost in points. */
  points: number;
  /** Face value **in euros** — converted at render like every other amount. */
  eur: number;
  code: string;
  /** `DD.MM`, already local-agnostic. */
  expires: string;
  /** `null` while it is still spendable. A date string once the QR was shown. */
  usedOn: string | null;
}

/**
 * A visit card at one venue.
 *
 * **Visits are not points and cannot be spent anywhere else**, which is the one
 * sentence about it that has to survive every rewrite. A stamp is a confirmed
 * visit to *this* venue and it buys *this* venue's reward; a player who reads it
 * as a second currency will expect to spend it at the next place on the list.
 *
 * `cycles` is how many times the card has been filled and started again, and it
 * is kept rather than discarded because it is the only thing that separates a
 * card at 0 of 6 on its first day from one that has already paid out four times.
 * The card in front of a regular should say so.
 */
export interface StampCard {
  /** Stable across a refill — a card is the venue's, not the cycle's. */
  id: string;
  venue: string;
  /** The letter on the tile. Venue names are never translated. */
  logo: string;
  /** What the card earns. The venue wrote this; the app does not translate it. */
  reward: string;
  stamps: number;
  required: number;
  cycles: number;
}

/**
 * A hot deal, as it sits in somebody's wallet.
 *
 * The mobile app keeps deals on their own screen and the wallet holds what came
 * *out* of them; here the two are one page, so a deal is in the wallet from the
 * moment it is claimed rather than from the moment it is spent. `claimedOn` is
 * what makes it a holding: an unclaimed deal is a row in the catalogue below,
 * and the same object with a date on it is a thing you own.
 *
 * `points` is what claiming cost, and it is **0 for most of them** — a hot deal
 * is an offer a venue is running, not something bought with a balance. The
 * handful that do cost points say so on the card.
 */
export interface ClaimedDeal {
  id: string;
  venue: string;
  logo: string;
  /** The offer itself — "2 for 1", "20% off". Written by the venue. */
  badge: string;
  points: number;
  /** `DD.MM`, like every other date the wallet writes. */
  expires: string;
  claimedOn: string;
  code: string;
}

export interface PlayerState {
  points: number;
  streak: number;
  /**
   * Lives **as of `livesAt`**, not as of now — see the field below, and read
   * the pair through `livesOf` rather than this number on its own.
   */
  lives: number;
  answered: number;
  correct: number;
  /** `YYYY-MM-DD` of the last finished round, for the 24-hour streak rule. */
  lastPlayed: string | null;
  /**
   * When `lives` above was last true, in epoch milliseconds — the anchor the
   * regeneration clock counts from, rewritten every time a life is spent.
   *
   * The pair is the whole model, and the model is: **the tank is derived, never
   * ticked.** A timer that adds a life every four hours only runs while a tab
   * is open, and the tab left open all evening and the one closed at nine have
   * to agree in the morning; `livesOf` does the arithmetic on demand instead,
   * which is the same answer with none of the moving parts. That is also why
   * `lives` on its own is *stale by design* — a state that has been sitting in
   * `localStorage` for six hours still says 0.
   *
   * Epoch milliseconds rather than the `YYYY-MM-DD` the rest of this module
   * writes, because a day string cannot say half past nine and this clock is
   * measured in hours. A number rather than an ISO string for the same reason
   * `lastPlayed` is a string: each is stored in the shape its own comparison
   * wants, and this one's comparison is a subtraction.
   *
   * Optional for the reason `freezes`, `stamps` and `deals` are, and read the
   * generous way round: a session saved before the clock existed has no anchor,
   * and `livesOf` reads a missing one as a **full tank**. The alternative is
   * charging an existing player three lives for a schema change they had no
   * part in, against a wait they never started.
   */
  livesAt?: number | null;
  /**
   * Freezes held. Optional because it postdates the stored shape: a session
   * saved by an earlier build has no such field, and `freezesOf` below reads a
   * missing one as zero rather than as a crash.
   */
  freezes?: number;
  /**
   * Gift cards bought off the catalogue.
   *
   * The field is named `vouchers` because that is what a stored session from an
   * earlier build calls it, and renaming it would empty the wallet of everybody
   * who already has one. What it holds is a *gift card*: a fixed face value at a
   * named brand, paid for with points. The site's three holdings are that, the
   * stamp cards below, and the claimed deals beside them.
   */
  vouchers: OwnedVoucher[];
  /**
   * Visit cards, and claimed offers.
   *
   * Both optional for the reason `freezes` is: a session saved before they
   * existed has neither, and `stampsOf` / `dealsOf` read a missing one as an
   * empty list rather than as a crash on a page somebody was already looking at.
   */
  stamps?: StampCard[];
  deals?: ClaimedDeal[];
  /**
   * Rounds finished per game **today**, for the decay curve below.
   *
   * One day's tally and not a history, which is the whole design of the field:
   * the curve only ever asks "how many of *this* game already, *today*", so a
   * `Record<day, …>` would grow in `localStorage` for the life of the account to
   * answer a question nothing asks. The day is stored beside the counts rather
   * than inferred, because a tally with no date on it is indistinguishable from
   * yesterday's — and yesterday's, read as today's, silently pays a returning
   * player nothing for their first round.
   *
   * Optional for the reason `freezes`, `stamps` and `deals` are: a session saved
   * by an earlier build has no such field, and `roundsToday` reads a missing one
   * as zero rather than as a crash on a page somebody was already looking at.
   */
  rounds?: { day: string; byGame: Partial<Record<GameId, number>> };
}

/** Stamp cards held, for a state that may predate the field. */
export const stampsOf = (state: PlayerState): StampCard[] => state.stamps ?? [];

/** Claimed deals held, same. */
export const dealsOf = (state: PlayerState): ClaimedDeal[] => state.deals ?? [];

/** A card with every slot filled. The reward is waiting at the counter. */
export const isCardFull = (card: StampCard): boolean => card.stamps >= card.required;

/** How many visits are left on a card. Never negative — a full card is 0. */
export const stampsLeft = (card: StampCard): number =>
  Math.max(0, card.required - card.stamps);

/**
 * Add a visit to a card.
 *
 * **A full card rolls over rather than overflowing**, which is the rule that
 * decides what the number on screen means: the eleventh visit to a ten-visit
 * card is the first stamp of the next one, not an eleventh stamp on a card that
 * cannot hold it. `cycles` counts the rollovers, so nothing is lost by it.
 *
 * The reward itself is not modelled here. Filling a card is what earns it; a
 * player collects it at the counter, and a wallet that marked it collected on
 * the player's own say-so would be a wallet that can pay itself.
 */
export function stampVisit(state: PlayerState, cardId: string): PlayerState {
  return {
    ...state,
    stamps: stampsOf(state).map((card) => {
      if (card.id !== cardId) return card;
      const filled = card.stamps + 1;
      return filled >= card.required
        ? { ...card, stamps: 0, cycles: card.cycles + 1 }
        : { ...card, stamps: filled };
    }),
  };
}

/**
 * Claim a hot deal.
 *
 * Returns the state unchanged when the balance will not cover it — the same
 * contract `redeem` has, so a caller may call it optimistically — and unchanged
 * again when this deal is already in the wallet. The second guard is the one
 * worth having: a deal is a single offer rather than a stock item, and a button
 * pressed twice would otherwise put two of it in the wallet and charge for both.
 */
export function claimDeal(
  state: PlayerState,
  deal: { id: string; venue: string; logo: string; badge: string; points: number; expires: string },
  code: string,
  on: string,
): PlayerState {
  if (!canAfford(state, deal.points)) return state;
  if (dealsOf(state).some((held) => held.id === deal.id)) return state;
  return {
    ...state,
    points: state.points - deal.points,
    deals: [{ ...deal, code, claimedOn: on }, ...dealsOf(state)],
  };
}

/** Freezes held, for a state that may predate the field. */
export const freezesOf = (state: PlayerState): number =>
  typeof state.freezes === 'number' ? Math.max(0, state.freezes) : 0;

/**
 * A card as it comes out of the catalogue, with the stock counts left behind.
 *
 * The projection is the point: `OwnedVoucher` is what a player holds, and
 * spreading the whole row would quietly store this month's remaining allocation
 * inside somebody's wallet, where it would be wrong by the next morning.
 */
function bought(brand: string): Pick<OwnedVoucher, 'brand' | 'logo' | 'points' | 'eur'> {
  const { logo, points, eur } = voucherCard(brand);
  return { brand, logo, points, eur };
}

/**
 * A new player, with something already in the wallet.
 *
 * Not empty on purpose. A wallet with nothing in it cannot show what a used
 * voucher looks like, what an expiry looks like, or what the Used tab is for —
 * and those are most of what the page is trying to explain now that the
 * explaining paragraphs are gone. Two active and two spent is the smallest set
 * that shows all of it.
 *
 * Every row is a real card off the catalogue rather than four hand-written
 * ones. They were hand-written, and two of the four had drifted: a Zalando card
 * here read €11.63 while the catalogue a scroll below it charged 500 points for
 * the same brand, so the wallet and the shelf on one screen quoted the same
 * voucher at two prices. A seeded wallet is a wallet somebody played for, and
 * this is what makes it one.
 */
export function seedPlayer(): PlayerState {
  return {
    points: 340,
    streak: 3,
    lives: MAX_LIVES,
    answered: 45,
    correct: 38,
    lastPlayed: null,
    /* No anchor, because a full tank has no clock running. Stated rather than
       left off so the field is visible to anyone reading what a player is. */
    livesAt: null,
    /* One in hand. A freeze nobody has ever held is a rule nobody has read, and
       the streak card is where the rule is explained. */
    freezes: 1,
    vouchers: [
      {
        id: 'v1',
        ...bought('Zalando'),
        code: 'PLZ-9F3K',
        expires: '31.08',
        usedOn: null,
      },
      {
        id: 'v2',
        ...bought('Media Expert'),
        code: 'PLZ-2B7Q',
        expires: '14.09',
        usedOn: null,
      },
      {
        id: 'v3',
        ...bought('Douglas'),
        code: 'PLZ-7X1M',
        expires: '02.08',
        usedOn: '21.07',
      },
      {
        id: 'v4',
        ...bought('Hebe'),
        code: 'PLZ-4K8D',
        expires: '18.07',
        usedOn: '11.07',
      },
    ],
    /*
     * Three cards at three stages, and that is the smallest set that shows what
     * a stamp card *is*: one nearly full, one just started, and one that has
     * already been filled and refilled. A wallet holding three cards all at
     * 2 of 6 shows a progress bar; this one shows a rule.
     */
    stamps: [
      { id: 's1', venue: 'Dubai Cafe', logo: 'D', reward: 'a free filter coffee', stamps: 5, required: 6, cycles: 1 },
      { id: 's2', venue: 'Sablewski & Para', logo: 'S', reward: 'a free pastry', stamps: 1, required: 8, cycles: 0 },
      { id: 's3', venue: 'Hala Forum', logo: 'H', reward: 'a free lunch set', stamps: 3, required: 10, cycles: 0 },
    ],
    /* One claimed, so the section is not an empty state on a page whose whole
       job is to show what the wallet holds. The rest of the board is the
       catalogue below it. */
    deals: [
      {
        id: 'd-dubai-2for1',
        venue: 'Dubai Cafe',
        logo: 'D',
        badge: '2+1',
        points: 0,
        expires: '31.08',
        claimedOn: '19.07',
        code: 'PLZ-D2F1',
      },
    ],
  };
}

/** Today, as `YYYY-MM-DD` in the visitor's own timezone. */
export function today(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Yesterday, same format — the only day that continues a streak. */
function yesterday(now: Date = new Date()): string {
  const back = new Date(now);
  back.setDate(back.getDate() - 1);
  return today(back);
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

/* ────────────────────────────────────────────────────────────── the tank ── */

export interface LifeTank {
  /** Lives available now, 0..`MAX_LIVES`. */
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
 * The only honest reader of `lives` and `livesAt` — see the note on the field.
 * Pure and deterministic on the injected `now`, so `npm run verify` owns it and
 * a screen can ask it once per render without running a timer of its own.
 *
 * **Both answers come out together**, because a screen needs both and computing
 * them apart is how they come to disagree: the count is the floor of a division
 * whose remainder is the wait, and two functions each doing that division end up
 * showing a full tank counting down to a life it already has.
 */
export function livesOf(state: PlayerState, now: Date = new Date()): LifeTank {
  const anchor = state.livesAt;
  /* No anchor is no clock, and no clock means nothing is pending — which is a
     full tank. Every session saved before the clock existed takes this branch,
     and it is the forgiving direction on purpose: the stored `lives` of such a
     state was last true at some unknown time, and reading it as "true now"
     would open an account on a wait it never incurred. */
  if (typeof anchor !== 'number') return { count: MAX_LIVES, nextAt: null };

  const held = Math.min(MAX_LIVES, Math.max(0, Math.floor(state.lives)));
  /* A clock that has gone backwards — a laptop waking with the wrong time, a
     timezone dragged across an ocean — earns nothing rather than un-earning
     what is already there. */
  const earned = Math.max(0, Math.floor((now.getTime() - anchor) / LIFE_REGEN_MS));
  const count = Math.min(MAX_LIVES, held + earned);

  /* The cap is on the count and not on the clock: an anchor a week old is a
     full tank, and the lives past the third are simply never granted. */
  return count >= MAX_LIVES
    ? { count: MAX_LIVES, nextAt: null }
    : { count, nextAt: anchor + (earned + 1) * LIFE_REGEN_MS };
}

/**
 * Spend one, and start — or keep — the clock.
 *
 * Unchanged on an empty tank, the same contract `redeem` and `claimDeal` have,
 * so a caller may spend optimistically.
 *
 * The anchor is the part worth reading twice. A **full** tank has no clock
 * running, so the spend starts one at `now`. A tank that is already filling has
 * one, and its new anchor is the moment the life sitting in it arrived —
 * `nextAt - LIFE_REGEN_MS` — never `now`. Restarting it on every spend would
 * quietly confiscate the three hours somebody had already waited, and the third
 * loss of an afternoon would cost strictly more than the first.
 */
export function spendLife(state: PlayerState, now: Date = new Date()): PlayerState {
  const tank = livesOf(state, now);
  if (tank.count <= 0) return state;
  return {
    ...state,
    lives: tank.count - 1,
    livesAt: tank.nextAt === null ? now.getTime() : tank.nextAt - LIFE_REGEN_MS,
  };
}

/* ──────────────────────────────────────────── what a repeat of a game pays ── */

/**
 * The day's decay curve: 100%, 60%, 40%, 20%, then nothing.
 *
 * **This is the brake on the player who is winning.** Lives are the brake on
 * the one who is not, and the two bound different people, which is why both
 * exist: a life is spent only on a *loss*, two of the seven games cannot be
 * lost at all, and somebody answering correctly never touches the tank — so
 * with lives alone, what stopped one round being farmed all evening was in
 * practice nothing.
 *
 * This prices the repeat instead of refusing it: the round still runs, the
 * streak still counts, the answered/correct columns still move, and only the
 * points taper. Nobody is ever told to stop playing for playing well.
 *
 * The tail ends at zero on purpose. A curve that pays twenty percent for ever
 * is not a bound at all — unlimited play still makes unlimited points.
 *
 * Indexed by rounds of *that game* already finished today; past the end of the
 * list the last entry repeats. It mirrors `CONFIG.games.decay.free` in
 * `server/config.ts`, which is the free curve of three: the server prices paid
 * plans off the same table and this site has no plans to price.
 */
export const DAILY_DECAY = [1, 0.6, 0.4, 0.2, 0] as const;

/** The multiplier for a round with `playedToday` of the same game behind it. */
export function decayFactor(playedToday: number): number {
  const at = Math.max(0, Math.floor(playedToday));
  return DAILY_DECAY[Math.min(at, DAILY_DECAY.length - 1)];
}

/**
 * Rounds of one game already finished today.
 *
 * Zero for a state saved before the field existed **and** for a tally left over
 * from an earlier day — the second case is the one that matters, because a
 * stale tally read as today's would hand a player back from yesterday a fifth
 * round's payout for their first.
 */
export function roundsToday(state: PlayerState, game: GameId, day: string): number {
  const tally = state.rounds;
  if (!tally || tally.day !== day) return 0;
  return tally.byGame[game] ?? 0;
}

/** The tally with one more round of `game` on it, discarding any earlier day's. */
function countRound(state: PlayerState, game: GameId, day: string): PlayerState['rounds'] {
  const kept = state.rounds?.day === day ? state.rounds.byGame : {};
  return { day, byGame: { ...kept, [game]: (kept[game] ?? 0) + 1 } };
}

export interface Award {
  /** Which game it was, so a repeat of *this* one can be priced. */
  game: GameId;
  /** What the round scored, **before** the day's decay. */
  points: number;
  /** How many questions, gaps, words or pairs the round put to the player. */
  answered: number;
  /** How many of them they got. */
  correct: number;
  /**
   * True when the player stayed inside the game's mistake allowance.
   *
   * **This is the flag a life is charged on.** The result card reads it too,
   * but the charge is what it is for: `awardPoints` spends one on a false and
   * nothing else in the module spends at all. The server's `life_spent` column
   * is written off exactly this, which is what keeps the two halves agreeing
   * about what a round cost.
   */
  won: boolean;
}

/**
 * What a round actually banks: what it scored, priced by today's curve.
 *
 * Its own exported function because **two callers need the same answer** — this
 * module, to move the balance, and the result card, to say what the round paid.
 * Reading the payout off the difference between two balances is the shortcut
 * that looks equivalent and is not: it silently reports whatever else moved the
 * points in the same call.
 *
 * Floored, not rounded, and floored *here* rather than anywhere else: the server
 * floors at the same point (`Math.floor(scored.score * decay)`), and a client
 * that rounded would show a player one more point than they were credited.
 */
export function bankedPoints(
  state: PlayerState,
  award: Award,
  now: Date = new Date(),
): number {
  return Math.floor(award.points * decayFactor(roundsToday(state, award.game, today(now))));
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
 * **And a lost round costs a life**, which is the other thing this function
 * decides. See the note at the spend itself for why that came back.
 */
export function awardPoints(
  state: PlayerState,
  result: Award,
  now: Date = new Date(),
): PlayerState {
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
   * A lost round costs a life. A won one costs nothing, and never has.
   *
   * The reversal is deliberate, and the clock above is what pays for it. A loss
   * stopped costing anything when the decay curve arrived, on the argument that
   * the pool only ever charged the player who was bad at quizzes and that two
   * of the seven games cannot be lost. What that actually left on the screen
   * was three hearts that never moved — a rule with no consequences, which
   * reads as a broken feature rather than as a kindness, and which the two
   * games with no fail state are not made any fairer by.
   *
   * The objection was really to the *refill*, not to the charge: under a
   * midnight tank a third loss shut the page for the rest of the day. Under
   * `LIFE_REGEN_MINUTES` it shuts it for four hours, and the decay curve is
   * still the brake on the player who is winning. This is the only spend in the
   * module.
   */
  const spent = result.won ? state : spendLife(state, now);

  /* Priced against the state as it *arrives*, so the first round of a day reads
     zero prior rounds of that game and pays in full. Counting first and pricing
     afterwards would start every player on the second rung. */
  return {
    ...spent,
    points: spent.points + bankedPoints(state, result, now),
    streak,
    freezes,
    answered: spent.answered + result.answered,
    correct: spent.correct + result.correct,
    lastPlayed: day,
    rounds: countRound(state, result.game, day),
  };
}

/**
 * All five right.
 *
 * The whole job of this bonus is to make the last question worth answering. One
 * point an answer is otherwise a flat line — the fifth question pays exactly
 * what the first did, whatever has happened in between — and five on the end is
 * what turns a round into something with a shape. It is also most of what a quiz
 * round is worth: 5 for the answers, 5 for having got them all.
 *
 * Mirrors `CONFIG.games.quizPerfectBonus`.
 */
export const QUIZ_PERFECT_BONUS = 5;

export interface RoundResult {
  /** Which of the four quizzes, for the decay curve. */
  game: GameId;
  correct: number;
  total: number;
  /** Points the round is worth per correct answer, from the game's own table. */
  perCorrect: number;
  /** True when the player stayed inside the game's mistake allowance. */
  won: boolean;
}

/**
 * What a quiz round scored, before the day's curve.
 *
 * Split out from `awardRound` because the result card needs the same number the
 * balance gets, and the two must not be two sums. Every right answer is worth
 * the same and the game says how much; a clean sweep adds the bonus above.
 */
export function quizAward(result: RoundResult): Award {
  const perfect = result.correct >= result.total ? QUIZ_PERFECT_BONUS : 0;
  return {
    game: result.game,
    points: result.correct * result.perCorrect + perfect,
    answered: result.total,
    correct: result.correct,
    won: result.won,
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
  /** Points one gap pays. */
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

/** What a flight pays, wherever it is asked. */
export function flightPoints(cleared: number, perGap: number): number {
  return Math.min(bankableGaps(cleared) * perGap, MAX_FLIGHT_POINTS);
}

/**
 * What a finished flight scored, before the day's curve.
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

export const WORD_BASE = 1;
/** +0 / +1 / +2 for tiers 1 / 2 / 3. */
export const WORD_TIER_BONUS = [0, 1, 2];

export function wordPoints(word: WordScore): number {
  const tier = WORD_TIER_BONUS[Math.min(Math.max(word.tier, 1), 3) - 1];
  return WORD_BASE + (word.hinted ? 0 : tier);
}

/**
 * The whole round solved with no wrong guess and no hint.
 *
 * Worth three, which is between a quarter and a third of the round — the same
 * proportion the quizzes' perfect bonus is, for the same reason: it is what the
 * fifth word is for. Mirrors `CONFIG.games.wordPerfectBonus`.
 */
export const WORD_PERFECT_BONUS = 3;

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
 * a number nobody can aim at. The last band has no ceiling and still pays two:
 * finishing is always worth something, which is what keeps the board the
 * approachable one of the set now that it is measured. It is still not *raced* —
 * there is no countdown, no fail state, and nothing on screen ticking.
 *
 * Mirrors `CONFIG.games.memoryBands`.
 */
export const MEMORY_BANDS = [
  { underSeconds: 40, points: 12 },
  { underSeconds: 70, points: 8 },
  { underSeconds: 110, points: 4 },
  { underSeconds: null, points: 2 },
] as const;

export function memoryPoints(seconds: number): number {
  const taken = Math.max(0, seconds);
  for (const band of MEMORY_BANDS) {
    if (band.underSeconds === null || taken < band.underSeconds) return band.points;
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
 * effect when somebody happens to load the page. `livesOf` above replaced both
 * with one division. Nothing writes a life back now; the tank is read.
 */

export function canAfford(state: PlayerState, points: number): boolean {
  return state.points >= points;
}

/**
 * Buy a voucher.
 *
 * Returns the state unchanged when the balance will not cover it, so callers
 * can call it optimistically; the button is disabled either way.
 */
export function redeem(
  state: PlayerState,
  card: { brand: string; logo: string; points: number; eur: number },
  code: string,
  expires: string,
): PlayerState {
  if (!canAfford(state, card.points)) return state;
  return {
    ...state,
    points: state.points - card.points,
    vouchers: [
      {
        id: `v${state.vouchers.length + 1}_${code}`,
        brand: card.brand,
        logo: card.logo,
        points: card.points,
        eur: card.eur,
        code,
        expires,
        usedOn: null,
      },
      ...state.vouchers,
    ],
  };
}

/**
 * Show the QR, which spends it.
 *
 * The rule the vouchers page has always stated: a voucher counts as used the
 * moment its code exists, whether or not anyone scans it. Generating at the
 * counter is the advice; this is the behaviour that makes the advice matter.
 */
export function markUsed(state: PlayerState, id: string, on: string): PlayerState {
  return {
    ...state,
    vouchers: state.vouchers.map((voucher) =>
      voucher.id === id && voucher.usedOn === null ? { ...voucher, usedOn: on } : voucher,
    ),
  };
}

export const activeVouchers = (state: PlayerState) =>
  state.vouchers.filter((v) => v.usedOn === null);
export const usedVouchers = (state: PlayerState) =>
  state.vouchers.filter((v) => v.usedOn !== null);
