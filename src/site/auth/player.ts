/**
 * What an individual account accumulates by playing.
 *
 * React-free and pure, like `business.ts` beside it, so `npm run verify` can
 * check the scoring and the wallet arithmetic without a browser. Anything that
 * needs a hook belongs in `AuthProvider`.
 *
 * The model is the one the old paylez app used (see
 * `landing/screenshots/learn1.png`): a score, a daily streak, three lives, and
 * running answered/correct counts. Lives are what cap a session rather than a
 * rounds-per-day limit — you play until you run out.
 */

/*
 * The one import, and it is the catalogue rather than anything React-shaped.
 * A wallet holds cards off a shelf, so what a card costs and what it is worth
 * are the shelf's business and not this module's — the four seeded vouchers
 * below used to carry their own face values and two of them disagreed with the
 * shelf they were supposedly bought from.
 */
import { CHEAPEST_VOUCHER_POINTS, voucherCard } from '../content';

/** How many lives a full tank holds, and what a round can cost. */
export const MAX_LIVES = 3;

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
 * A freeze absorbs the *lapse*, which means it protects the balance too — see
 * `awardPoints`, where a lapse zeroes the points as well as the streak. That is
 * deliberate: those two have always been one rule, and a freeze that saved the
 * number but not the points would be the confusing half-measure.
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
  lives: number;
  answered: number;
  correct: number;
  /** `YYYY-MM-DD` of the last finished round, for the 24-hour streak rule. */
  lastPlayed: string | null;
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

export interface Award {
  /** Points the round earned, already totalled by whatever scored it. */
  points: number;
  /** How many questions, gaps, words or pairs the round put to the player. */
  answered: number;
  /** How many of them they got. */
  correct: number;
  /** True when the player stayed inside the game's mistake allowance. */
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
 * The streak rule is the one the site states in its own FAQ: play inside 24
 * hours and it continues, miss the window and it — and the points with it — go
 * back to zero. Playing twice in one day does not advance it twice, which is why
 * `lastPlayed` is a date rather than a count.
 *
 * The one thing that can stand between a missed window and that reset is a
 * freeze. It is spent here, silently and automatically: a dialog asking "use a
 * freeze?" would arrive a day late, on the round *after* the one that was
 * missed, about a decision the player can no longer change.
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
     spend on it. The streak then advances exactly as a normal day would, and
     the balance survives with it.

     The length test is not a detail. `lapsed` says only "not today and not
     yesterday", so without it a player coming back after two years took the
     same branch as one who missed a Tuesday: full balance kept, streak
     incremented as though they had never been away. A freeze is sold as one
     missed day — on the streak card, and in everything `MAX_FREEZES` reasons
     about — so it covers exactly one, and a longer absence is the reset the FAQ
     describes. */
  const held = freezesOf(state);
  const frozen = lapsed && played === twoDaysBack(now) && held > 0;

  const streak = sameDay ? state.streak : lapsed && !frozen ? 1 : state.streak + 1;
  const base = lapsed && !frozen ? 0 : state.points;

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

  return {
    ...state,
    points: base + result.points,
    streak,
    freezes,
    answered: state.answered + result.answered,
    correct: state.correct + result.correct,
    lastPlayed: day,
    /* A loss costs a life; the tank refills the next day a round is played. */
    lives: result.won ? state.lives : Math.max(0, state.lives - 1),
  };
}

export interface RoundResult {
  correct: number;
  total: number;
  /** Points the round is worth per correct answer, from the game's own table. */
  perCorrect: number;
  /** True when the player stayed inside the game's mistake allowance. */
  won: boolean;
}

/** A quiz round: every right answer is worth the same, and the game says how
 *  much. Kept as its own name because four callers read better for it. */
export function awardRound(
  state: PlayerState,
  result: RoundResult,
  now: Date = new Date(),
): PlayerState {
  return awardPoints(
    state,
    {
      points: result.correct * result.perCorrect,
      answered: result.total,
      correct: result.correct,
      won: result.won,
    },
    now,
  );
}

export interface FlightResult {
  /** Gaps flown through this attempt. The run is endless, so this is unbounded. */
  cleared: number;
  /** Gaps that bank the round, from the game's own row in `GAMES`. */
  target: number;
  /** Points one gap pays. */
  perGap: number;
  won: boolean;
}

/**
 * Most gaps a single flight may bank.
 *
 * Not a rule of the game — a flight is endless and nobody is getting near this
 * — but `cleared` arrives from an animation loop rather than a question index,
 * and an unbounded number multiplied into a balance is the kind of thing a
 * server would refuse. Ninety-nine gaps is about four minutes of clean flying.
 */
export const MAX_FLIGHT_GAPS = 99;

/**
 * Gaps a flight may bank, floored and clamped.
 *
 * Its own function because the score arrives from an animation loop rather than
 * a question index, and because two callers need the same answer: `awardFlight`
 * to move the balance, and the result card to say what was earned. Reading the
 * payout off the difference between two balances would be the obvious shortcut
 * and is wrong — a lapsed streak zeroes the balance before scoring, so the
 * difference can be a large negative number on the round a player earned most.
 */
export function bankableGaps(cleared: number): number {
  return Math.max(0, Math.min(Math.floor(cleared), MAX_FLIGHT_GAPS));
}

/** What a flight pays, wherever it is asked. */
export function flightPoints(cleared: number, perGap: number): number {
  return bankableGaps(cleared) * perGap;
}

/**
 * Bank a finished flight.
 *
 * Delegates to `awardRound` rather than restating it. The streak window, the
 * lapse that takes the balance with it, and the life a loss costs are rules the
 * site states in its own FAQ — a second copy of them is how one of the two
 * quietly becomes a lie.
 *
 * What this function owns is the translation and the clamp. `cleared` arrives
 * from an animation loop rather than from a question index, so it is floored and
 * capped at the target, and a `won` that did not actually reach the target is
 * recorded as the loss it was.
 *
 * A gap flown is a gate cleared and a gap hit is a gate failed, so the round is
 * charged to `answered` in full and only the gaps flown count as `correct` —
 * exactly what the quiz engine already does when a round ends early on its
 * mistake allowance. Without that a flight-only player would sit permanently
 * last on a leaderboard they are actively competing on, which is a worse lie
 * than a mixed accuracy column.
 *
 * Gaps past the target are the one place the two paths genuinely differ. The
 * flight does not stop at the target — it is endless, and stopping it there
 * would be the tuning equivalent of ending a quiz because it was going well —
 * so `correct` saturates at the target while the *points* keep counting. A
 * fifteen-gap flight is 15/12 of nothing sensible, but it is unarguably 30
 * points.
 */
export function awardFlight(
  state: PlayerState,
  result: FlightResult,
  now: Date = new Date(),
): PlayerState {
  const banked = bankableGaps(result.cleared);
  const counted = Math.min(banked, result.target);
  const won = result.won && banked >= result.target;

  const base = awardRound(
    state,
    { correct: counted, total: result.target, perCorrect: result.perGap, won },
    now,
  );

  const surplus = (banked - counted) * result.perGap;
  return surplus > 0 ? { ...base, points: base.points + surplus } : base;
}

/* ────────────────────────────────────────────────────── the two new games ── */

/**
 * What one solved word is worth in Word Builder.
 *
 * Straight from the supplied spec, and the shape of it is the point: a flat
 * points-per-word would pay the same for guessing KAWA and for building
 * PRZEPRASZAM, so the score is base plus what the player actually did — how hard
 * the word was, whether they got it first time, and how long it took.
 *
 * A hint is not a penalty, it is a ceiling: taking one removes the first-try and
 * speed bonuses for that word and leaves the base and the tier bonus. Somebody
 * who needs the hint still earns; they just do not earn the mastery part.
 *
 * An unsolved word is worth nothing and is simply not passed here.
 */
export interface WordScore {
  /** 1 easy (3–4 letters), 2 medium (5–6), 3 hard (7+). */
  tier: number;
  /** No wrong attempt on this word. */
  firstTry: boolean;
  /** A letter was revealed. */
  hinted: boolean;
  /** Wall-clock seconds spent on this word. */
  seconds: number;
}

/** +0 / +2 / +4 for tiers 1 / 2 / 3. */
const TIER_BONUS = [0, 2, 4];

export function wordPoints(word: WordScore): number {
  const base = 5;
  const tier = TIER_BONUS[Math.min(Math.max(word.tier, 1), 3) - 1];
  if (word.hinted) return base + tier;

  const first = word.firstTry ? 3 : 0;
  const speed = word.seconds < 15 ? 3 : word.seconds <= 30 ? 1 : 0;
  return base + tier + first + speed;
}

/** Every word first-try. A target to chase rather than an expectation. */
export const WORD_PERFECT_BONUS = 10;

/**
 * What a finished Memory Match round is worth.
 *
 * The skill in this game is efficiency — fewer flips means better memory — so
 * that is what the bonus is on. The base is per pair and is guaranteed: there is
 * no fail state here, and a slow player still earns, just less. That is
 * deliberate, and it is the reason this round has no clock: the deliberately
 * accessible one of the set.
 *
 * `moves` is completed *pairs* of flips, not individual card taps, so the floor
 * is `pairs` — one move per pair, every one of them a match.
 */
export const MEMORY_PER_PAIR = 6;
export const MEMORY_FLAWLESS_BONUS = 10;

export function memoryPoints(pairs: number, moves: number): number {
  const base = pairs * MEMORY_PER_PAIR;

  /* Past sixteen moves on a six-pair board the player is turning cards over at
     random, and the bonus is zero rather than negative — nobody goes backwards
     here. */
  const reasonable = 16;
  const span = Math.max(1, reasonable - pairs);
  const efficiency = Math.min(1, Math.max(0, (reasonable - moves) / span));

  const flawless = moves === pairs ? MEMORY_FLAWLESS_BONUS : 0;
  return base + Math.round(efficiency * 12) + flawless;
}

/** Lives come back with a new day rather than on a timer nobody can see. */
export function refillLives(state: PlayerState, now: Date = new Date()): PlayerState {
  if (state.lastPlayed === today(now)) return state;
  return state.lives === MAX_LIVES ? state : { ...state, lives: MAX_LIVES };
}

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
