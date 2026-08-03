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

/** How many lives a full tank holds, and what a round can cost. */
export const MAX_LIVES = 3;

/** Points needed for the cheapest voucher, so the wallet can say how far off you are. */
export const CHEAPEST_VOUCHER = 100;

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

export interface PlayerState {
  points: number;
  streak: number;
  lives: number;
  answered: number;
  correct: number;
  /** `YYYY-MM-DD` of the last finished round, for the 24-hour streak rule. */
  lastPlayed: string | null;
  vouchers: OwnedVoucher[];
}

/**
 * A new player, with something already in the wallet.
 *
 * Not empty on purpose. A wallet with nothing in it cannot show what a used
 * voucher looks like, what an expiry looks like, or what the Used tab is for —
 * and those are most of what the page is trying to explain now that the
 * explaining paragraphs are gone. Two active and two spent is the smallest set
 * that shows all of it.
 */
export function seedPlayer(): PlayerState {
  return {
    points: 340,
    streak: 3,
    lives: MAX_LIVES,
    answered: 45,
    correct: 38,
    lastPlayed: null,
    vouchers: [
      {
        id: 'v1',
        brand: 'Zalando',
        logo: 'Z',
        points: 500,
        eur: 11.63,
        code: 'PLZ-9F3K',
        expires: '31.08',
        usedOn: null,
      },
      {
        id: 'v2',
        brand: 'Media Expert',
        logo: 'M',
        points: 100,
        eur: 4.65,
        code: 'PLZ-2B7Q',
        expires: '14.09',
        usedOn: null,
      },
      {
        id: 'v3',
        brand: 'Douglas',
        logo: 'D',
        points: 300,
        eur: 6.98,
        code: 'PLZ-7X1M',
        expires: '02.08',
        usedOn: '21.07',
      },
      {
        id: 'v4',
        brand: 'Hebe',
        logo: 'H',
        points: 100,
        eur: 4.65,
        code: 'PLZ-4K8D',
        expires: '18.07',
        usedOn: '11.07',
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

export interface RoundResult {
  correct: number;
  total: number;
  /** Points the round is worth per correct answer, from the game's own table. */
  perCorrect: number;
  /** True when the player stayed inside the game's mistake allowance. */
  won: boolean;
}

/**
 * Bank a finished round.
 *
 * The streak rule is the one the site now states in its own FAQ: play inside
 * 24 hours and it continues, miss the window and it — and the points with it —
 * go back to zero. Playing twice in one day does not advance it twice, which is
 * why `lastPlayed` is a date rather than a count.
 */
export function awardRound(state: PlayerState, result: RoundResult, now: Date = new Date()): PlayerState {
  const day = today(now);
  const scored = result.correct * result.perCorrect;

  let streak: number;
  if (state.lastPlayed === day) {
    streak = state.streak; // already counted today
  } else if (state.lastPlayed === yesterday(now) || state.lastPlayed === null) {
    streak = state.streak + 1;
  } else {
    /* The window was missed. This is the reset the copy promises — and it takes
       the balance with it, not just the streak. */
    streak = 1;
  }

  const lapsed = state.lastPlayed !== null && state.lastPlayed !== day && state.lastPlayed !== yesterday(now);
  const base = lapsed ? 0 : state.points;

  return {
    ...state,
    points: base + scored,
    streak,
    answered: state.answered + result.total,
    correct: state.correct + result.correct,
    lastPlayed: day,
    /* A loss costs a life; the tank refills the next day a round is played. */
    lives: result.won ? state.lives : Math.max(0, state.lives - 1),
  };
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
