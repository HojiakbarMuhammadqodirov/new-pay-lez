import { call } from './client';

/**
 * The player's own half of the API — who they are, what they have, and what a
 * round did to it.
 *
 * `client.ts` opened the door for the operator's console, and its own header
 * says what was still true then: *"the session, the wallet and the games are
 * still local, and swapping them is the larger job."* This file is the first
 * instalment of that job. The Play screen used to render eight readings off a
 * `localStorage` record, which meant a player's points were a number this
 * browser had made up — true for the person looking at it and true for nobody
 * else. Everything here is the server's answer instead.
 *
 * **Nothing in this file holds state.** These are typed calls and the shapes
 * they return; where the answers are kept, and when they are asked for, is
 * `auth/AuthProvider.tsx`'s business. That split is deliberate — the provider
 * already owns "who is signed in", and a second cache of the same facts beside
 * it is how two parts of one screen come to disagree.
 *
 * The response shapes below are the server's, transcribed rather than adapted:
 * snake_case where the server uses it, `null` where the server sends `null`. A
 * mapper that tidied the names on the way in would be one more place for the
 * two halves to drift, and `server/API.md` is the document either side reads.
 */

/* ═══════════════════════════════════════════════════════════════ sign-in ══ */

/**
 * What `/v1/auth/signin` and `/v1/auth/google` hand back.
 *
 * `roles` and `mode` are how the site learns what kind of account this is —
 * `AccountType` is derived from them rather than stored, because the server is
 * now the only thing that knows. **`/v1/auth/signup` does not send them**: a
 * brand-new account is always a plain consumer, and the server leaves the
 * fields off rather than sending a guess. Both are optional here for that
 * reason, and the provider follows a sign-up with `me()` regardless.
 */
export interface SignedIn {
  token: string;
  roles?: string[];
  mode?: string;
  user: { id: string; name: string; email: string | null };
}

export const signIn = (email: string, password: string) =>
  call<SignedIn>('/v1/auth/signin', {
    method: 'POST',
    /* `surface: 'web'` is not decoration — the server reads it when it decides
       whether to set the session cookie, and it is what makes this a browser
       session rather than a phone's. */
    body: { email, password, surface: 'web' },
  });

export interface SignUpDraft {
  /** Grants `partner_owner`, which is the only moment it can be granted. */
  partner?: boolean;
  email: string;
  password: string;
  name: string;
  language: string;
  city?: string;
  countryCode?: string;
}

export const signUp = (draft: SignUpDraft) =>
  call<SignedIn>('/v1/auth/signup', {
    method: 'POST',
    body: { ...draft, surface: 'web' },
  });

/** Ends the session server-side. The local token is dropped by the caller. */
export const signOutRemote = () => call<{ ok: true }>('/v1/auth/signout', { method: 'POST' });

/* ══════════════════════════════════════════════════════════════════ me ══ */

/**
 * The account, as the server holds it.
 *
 * This is the *identity* half — name, handle, city, birthday, the photo. The
 * *playing* half is `GamesState` below, and they are two calls because they
 * change at completely different rates: a profile is edited a handful of times
 * ever, and the tank moves every four hours. Asking for both together would
 * mean re-reading a birthday to find out whether a round had come back.
 *
 * `entitlements` is a `Record<string, string>` and the values really are
 * strings — `daily_energy` arrives as `"4"`. That is the server's shape and it
 * is transcribed rather than parsed here, because the one caller that wants a
 * number knows which key it is asking for and nothing else should be guessing
 * at types on a bag of plan flags.
 */
export interface Me {
  user: {
    id: string;
    email: string | null;
    name: string;
    username: string | null;
    language: string;
    city: string | null;
    countryCode: string | null;
    avatar: string | null;
    phone: string | null;
    occupation: string | null;
    birthDate: string | null;
    birthDateChangesLeft: number;
    profileCompletedAt: string | null;
    onboardedAt: string | null;
    trustTier: number;
    leaderboardOptIn: boolean;
    referralCode: string;
    createdAt: string;
  };
  roles: string[];
  mode: string;
  points: number;
  plan: { code: string; name: string; audience: string };
  entitlements: Record<string, string>;
  venues: Array<{ id: string; name: string; city: string | null; status: string }>;
}

export const me = () => call<Me>('/v1/me');

/* ═════════════════════════════════════════════════════════════ the tank ══ */

/**
 * Everything the Play screen reads, in one call.
 *
 * The server's own description of this endpoint is *"the truth about this
 * player — anything the client tracks is a display"*, and that sentence is the
 * whole design. `auth/player.ts` still holds `energyOf`, `streakWeek` and
 * `freezesOf`, but they are **readers** now: they turn these numbers into a
 * gauge and seven circles. The arithmetic that *changes* them — spending
 * energy, advancing a streak, spending a freeze — moved to the server, where it
 * is the same code the phone runs.
 *
 * `lastPlayed` is what lets the streak be drawn as a week rather than a
 * number: `streak` says how many days, this says which. A `null` with a live
 * streak is read as yesterday — see `streakWeek`, which explains why.
 */
export interface GamesState {
  energy: { energy: number; max: number; nextAt: string | null };
  streak: number;
  longestStreak: number;
  freezes: number;
  answered: number;
  correct: number;
  points: number;
  /** `YYYY-MM-DD`, or `null` for an account that has never finished a round. */
  lastPlayed: string | null;
  dailyWord: string | null;
}

export const gamesState = () => call<GamesState>('/v1/games/state');

/* ═════════════════════════════════════════════════════════════ checkout ══ */

/**
 * Start paying for a plan.
 *
 * Returns a **URL to send the browser to**, not a subscription: the server
 * writes nothing at this point, deliberately, so that opening the payment page
 * and closing it again entitles nobody. The plan arrives back through Stripe's
 * webhook, which is why the caller's job ends at the redirect and the badge
 * only changes on the next load.
 *
 * `mode` says which adapter answered. `live` is a real Stripe page; `local` is
 * the development stand-in, whose `url` is an `about:blank` that says so rather
 * than a page pretending to take a card.
 */
export interface Checkout {
  mode: 'live' | 'local';
  url: string;
  sessionId?: string;
}

export const startCheckout = (planCode: string) =>
  call<Checkout>('/v1/billing/checkout', {
    method: 'POST',
    body: { planCode, source: 'stripe' },
  });

/* ══════════════════════════════════════════════════════════════ a round ══ */

/**
 * The seven types the server knows, which is one fewer than the site's eight.
 *
 * Word Builder is two cards here and one `gameType` there — English, and the
 * language of the city on the profile — so the pair is told apart by the
 * `language` on the session rather than by the type. `gameTypeOf` below is the
 * only place that mapping is written down.
 */
export type ServerGameType =
  | 'flags'
  | 'capitals'
  | 'brain'
  | 'poland'
  | 'word_builder'
  | 'memory_match'
  | 'flight';

/**
 * A round, opened.
 *
 * `content` is deliberately `unknown`: it is a different shape per game — five
 * questions, a jumble of letters, a count of cards — and every caller narrows
 * it against the type it just asked for. Typing it as a union here would put
 * the narrowing in this file, one level away from the component that knows
 * which game it started.
 *
 * **The answers are never in it.** They stay in `game_sessions.secret` on the
 * server, which is the reason a round has to be opened at all rather than the
 * client scoring a bank it already has in its bundle.
 */
export interface Round {
  sessionId: string;
  gameType: ServerGameType;
  content: unknown;
  /** Before this round is paid for. Energy is charged at `finish`, never here. */
  energyLeft: number;
  /**
   * Whether this round will bank anything.
   *
   * `false` is a **practice** round — one opened on an empty tank. It plays
   * identically and pays nothing at all: no points, no streak, no energy. The
   * screen has to say so before the first question rather than after the last,
   * which is why the server answers it here and not only at the finish.
   */
  paid: boolean;
}

/**
 * Open a round.
 *
 * `practice` is what turns an empty tank from a refusal into an unpaid round.
 * Sent only when the tank is actually empty — the flag is ignored when there is
 * energy, and a client that sent it unconditionally would be asking the server
 * to decide something it has already decided.
 */
export const startRound = (gameType: ServerGameType, language?: string, practice?: boolean) =>
  call<Round>('/v1/games/sessions', {
    method: 'POST',
    body: {
      gameType,
      ...(language ? { language } : {}),
      ...(practice ? { practice: true } : {}),
    },
  });

/**
 * One move.
 *
 * `seq` is 0-based and must increase. A repeat of a `(session, seq)` pair comes
 * back `accepted: false` rather than as an error — the server treats a resent
 * move as a duplicate, not a fault, which is the right answer for a flaky
 * connection and means a client may retry without checking first.
 *
 * `answer` is whatever the question's answer was: an option index on a quiz,
 * the correct spelling on a Word Builder guess, one letter on a hint. It is
 * only ever sent for a question already answered — the server does not hand out
 * answers to questions still open, which is the property that makes a
 * client-side score worthless and a server-side one worth having.
 *
 * There was a `pair` field documented here, said to arrive on a Memory Match
 * match. **It never existed on the server.** Something had to be believed about
 * a protocol nobody had run, and this is what was believed; it is recorded
 * rather than quietly deleted because the same mistake is cheap to make twice.
 * What Memory Match actually returns is decided in `domain/games.ts` and is
 * typed below by the screen that reads it.
 */
export interface MoveResult {
  accepted: boolean;
  correct?: boolean;
  answer?: number | string;
  /**
   * Anything a particular game's move sends back beyond the two fields above.
   *
   * Deliberately open: the deck games learn about the board as they play and
   * the quiz games do not, and pinning one shape here would either constrain a
   * protocol this file does not own or invent fields it cannot see. The screen
   * that reads a move narrows this to what its own game sends.
   */
  [extra: string]: unknown;
}

export const sendMove = (
  sessionId: string,
  seq: number,
  payload: Record<string, unknown>,
  kind = 'answer',
) =>
  call<MoveResult>(`/v1/games/sessions/${sessionId}/events`, {
    method: 'POST',
    body: { seq, kind, payload },
  });

/**
 * The end of a round, and the only place energy is spent.
 *
 * Everything here is the server's arithmetic: what it scored, what the streak
 * became, what is left in the tank, what the balance now is. The client used to
 * compute all five in `awardPoints`; it displays them now.
 *
 * Idempotent — the server declares it so — which matters because this is the
 * one request in the protocol whose loss costs the player something real.
 */
export interface Finish {
  score: number;
  capped: number;
  correct: number;
  answered: number;
  won: boolean;
  streak: number;
  freezes: number;
  energyLeft: number;
  balance: number;
  /**
   * Whether the round banked anything — the same promise `Round.paid` made when
   * it was opened.
   *
   * The result card needs it to tell a practice round from a round somebody got
   * everything wrong on: both pay 0, and only one of them is worth explaining.
   */
  paid: boolean;
  nearest: {
    venueId: string;
    venueName: string;
    discountPct: number;
    pointsNeeded: number;
  } | null;
}

export const finishRound = (sessionId: string, report?: Record<string, unknown>) =>
  call<Finish>(`/v1/games/sessions/${sessionId}/finish`, {
    method: 'POST',
    body: report ? { report } : {},
    /* The session id *is* the key: a finish resent after a dropped response
       must bank the same round once, not twice. */
    idempotencyKey: `finish:${sessionId}`,
  });

/* ═════════════════════════════════════════════════════════ leaderboard ══ */

/**
 * The city board, this week.
 *
 * Ranked on **points earned from games this ISO week** — not on the lifetime
 * balance, and not on points from scans — so it is a board about playing rather
 * than about spending. `you` is sent even when the viewer is not in `rows`,
 * which is what lets the screen always show where somebody stands; `hidden` is
 * the honest answer for a player who has opted out, and is not the same thing
 * as being unranked.
 */
export interface BoardRow {
  rank: number;
  userId: string;
  name: string;
  avatar: string | null;
  points: number;
  isYou: boolean;
}

export interface Board {
  scope: string;
  week: string;
  rows: BoardRow[];
  you: BoardRow | null;
  hidden: boolean;
}

export const cityBoard = (limit = 10) =>
  call<Board>(`/v1/leaderboard/city?limit=${limit}`);

/* ═══════════════════════════════════════════════════════════ onboarding ══ */

/**
 * Claim the welcome bonus.
 *
 * **Idempotent on the server**, and that is what makes it safe to call from a
 * flow somebody can refresh, come back to on a second device, or double-press:
 * `accounts.completeOnboarding` claims the row with
 * `UPDATE … WHERE onboarded_at IS NULL`, so two calls race for one row and
 * exactly one pays. `granted` says which call this was — `false` is not a
 * failure, it is "somebody already collected this", which is the honest answer
 * to a second press.
 */
export interface Onboarded {
  granted: boolean;
  points: number;
  balance: number;
}

export const completeOnboarding = () =>
  call<Onboarded>('/v1/me/onboarded', {
    method: 'POST',
    /* The account is the key: a retry after a dropped response must pay once. */
    idempotencyKey: 'onboarded',
  });

/**
 * Register the signed-in account as a venue owner.
 *
 * Needed because Google issues a session *before* anybody has been asked what
 * kind of account this is: the sign-up form knows, and hands `partner: true` to
 * `/v1/auth/signup`, but a Google visitor picks after they are already signed
 * in. Without this they were filed as a consumer with no way back, and every
 * control on the partner dashboard told them there was nowhere to file
 * anything.
 *
 * Idempotent on the server, so calling it for somebody who is already a partner
 * is a no-op rather than an error — which is what lets the site call it on every
 * "I am a business" without checking first.
 */
export const becomePartner = () =>
  call<{ roles: string[] }>('/v1/me/partner', { method: 'POST' });
