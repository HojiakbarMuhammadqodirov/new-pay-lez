/**
 * Session context.
 *
 * Split from the provider component for the same reason `theme/` and `i18n/`
 * are: a module that exports both a context and a component breaks React fast
 * refresh. Types and hooks here, state in `AuthProvider.tsx`.
 *
 * The session is the only thing on this site that changes what a visitor is
 * *allowed* to see, so the guard that enforces it lives in `router.ts` as a pure
 * function rather than as an effect somewhere — see `resolveRoute`.
 */
import { createContext, useContext } from 'react';
import type { BusinessProfile } from './business';
import type { PlayerState } from './player';
import type {
  BirthDateError,
  Occupation,
  SignInError,
  SignUpDraft,
  SignUpError,
  UsernameError,
} from './users';

/**
 * Three, and only two of them are choosable.
 *
 * Individual and business are the two the sign-up form offers, because they are
 * the two a visitor is. `admin` is the third kind of person on the platform
 * rather than a flag on the other two — it has no venue, no wallet and no
 * marketing funnel; it has the console. Modelling it as `business + isAdmin`
 * would mean every rule that asks "is this an owner" would have to remember to
 * ask "…a real one, though?".
 *
 * `null` is a real fourth state and not an oversight: it means the
 * individual-or-business question has not been answered. Sign-up asks it before
 * the account exists, so nothing new arrives that way — but a session stored by
 * the build that asked it *after* sign-in can, and the sign-in page still knows
 * how to finish one. Modelling it as "individual until told otherwise" would
 * silently give a business owner the consumer site.
 */
export type AccountType = 'individual' | 'business' | 'admin';

export interface Account {
  id: string;
  name: string;
  email: string;
  type: AccountType | null;
  /** The listing. `null` until the owner has been through setup. */
  business: BusinessProfile | null;
  /** Points, streak, energy and the wallet. `null` for a business account. */
  player: PlayerState | null;
  /**
   * What this person has told us about themselves. Separate from `name` and
   * `email`, which are what the account was created with and what signs it in.
   */
  profile: UserProfile;
  /**
   * When onboarding was finished. `null` means it has not been, and
   * `resolveRoute` holds an individual there until it is.
   */
  onboardedAt: string | null;
}

/**
 * The seven things a profile is.
 *
 * Mirrors the columns the server grew for it. Everything is optional except
 * that the *set* is fixed: "complete" means all of it, because "most of it" has
 * to be renegotiated every time the form gains a field.
 */
export interface UserProfile {
  /** Unique, chosen once and editable; the handle other players see. */
  username: string;
  /**
   * What this person does — one of five, or `''` for not yet answered.
   *
   * The form labels it **Status**; the field is `occupation`, because `status`
   * on an account already means whether the account is live. It replaced a free
   * line of prose, and the reason is that a line about yourself is not a fact
   * anything can act on: five values can be counted, compared between cities
   * and targeted by a venue's offer, and a sentence cannot.
   */
  occupation: Occupation | '';
  /**
   * Where this person is.
   *
   * **Suggested, not dictated.** `GET /v1/cities` serves 114 canonical names and
   * the field offers them as you type, because a leaderboard groups on this
   * string with a literal `=` and four spellings of Kraków are four boards. But
   * a list of 114 is a list somebody is not on, and refusing them outright makes
   * the picker wrong rather than the list incomplete — so an unknown city is
   * accepted *provided a country comes with it*, which is exactly the rule
   * `PATCH /v1/me` enforces.
   */
  city: string;
  /**
   * The country the city is in.
   *
   * An ISO-3166 alpha-2 code when the city came off the served list, where it is
   * derived and never asked for. Whatever was typed when it did not — the write
   * needs *a country*, not a code, and pretending otherwise would mean shipping
   * a 200-entry country table to serve the one person the city list missed.
   */
  countryCode: string;
  phone: string;
  /** ISO `YYYY-MM-DD`. Settable, then correctable once, then support. */
  birthDate: string;
  /** How many self-service corrections are left on the birthday. */
  birthDateChangesLeft: number;
  /**
   * The photo, as a small square data URL — or `''`.
   *
   * A data URL and not a filename, which is the *opposite* of what the business
   * listing does with its logo, and the difference is the size. That field
   * stores `logo` as a name because there is nowhere to upload to and a
   * full-size image in `localStorage` would eat an origin's 5 MB; this one is
   * downscaled to `AVATAR_PX` square before it is ever stored, which is a few
   * kilobytes. A profile photo nobody can see is not a profile photo, and the
   * quota argument is answered by the downscale rather than ignored.
   */
  avatar: string;
}

/**
 * A profile nobody has filled in yet.
 *
 * `birthDateChangesLeft` is the literal 2 rather than `BIRTH_DATE_WRITES` from
 * `users.ts`, and that is forced rather than sloppy: `users.ts` imports this
 * constant, so reading its export back would be a runtime import cycle between
 * two modules that currently only pass types across. `npm run verify` checks
 * the two agree, which is the same guarantee with none of the cycle.
 */
export const EMPTY_PROFILE: UserProfile = {
  username: '',
  occupation: '',
  city: '',
  countryCode: '',
  phone: '',
  birthDate: '',
  birthDateChangesLeft: 2,
  avatar: '',
};

/**
 * The first letter of the name, for the header chip's avatar.
 *
 * Takes a name-shaped thing rather than an `Account`, because the console draws
 * the same disc for a *directory row* and a `UserRecord` is not an `Account` —
 * it carries a secret and a join date and no session state. It used to be
 * assignable by accident, which is a different thing from being intended: the
 * two shapes only agreed for as long as every field on one was on the other,
 * and the profile is the field that ended that.
 */
export function initial(who: { name: string }): string {
  return who.name.trim().charAt(0).toUpperCase() || '?';
}

export interface AuthValue {
  /** `null` when signed out. */
  account: Account | null;
  /**
   * Sign in against the **server**, falling back to the seeded demo accounts.
   *
   * Async now, where it used to read a row out of this device's directory
   * synchronously, and that change is the whole migration in one signature: an
   * account is a row on the server, and this browser holds a mirror of it.
   *
   * The fallback is narrow and deliberate. The three seeded accounts printed on
   * this form exist only in `localStorage` — they are demo data, and putting
   * them on the server would be putting fake people in the same table as real
   * ones, which is the thing being cleaned up. So a seed signs in locally with
   * no server session, and everybody else signs in properly or not at all.
   */
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; error: SignInError }>;
  /**
   * Open an account and sign into it in one move.
   *
   * The type is part of the draft rather than a question asked afterwards: an
   * account that exists but does not yet know what it is has to be held at the
   * front door by the router until it does, and there is no reason to create
   * that state when the form can simply ask first.
   */
  signUp: (draft: SignUpDraft) => Promise<{ ok: true } | { ok: false; error: SignUpError }>;
  /**
   * Sign in with a Google credential.
   *
   * Async where the other two are synchronous, and that is the shape of the
   * difference: the password paths read a row out of this device's directory,
   * while this one asks the *server* to verify a token before anybody is signed
   * in. It is the only identity on this site that something other than the
   * browser has vouched for.
   *
   * Resolves to the local account, or rejects — callers show the message.
   */
  signInWithGoogle: (credential: string, language: string) => Promise<Account>;
  signOut: () => void;
  /** Answering the individual-or-business question — the legacy path only. */
  setType: (type: AccountType) => void;
  /** Merges a patch into the listing, creating it on first write. */
  saveBusiness: (patch: Partial<BusinessProfile>) => void;
  /**
   * Replaces the player state.
   *
   * A whole new state rather than a patch, because every caller already has one
   * from a pure function in `player.ts` — `awardRound(player, …)`,
   * `redeem(player, …)`. Passing the result straight through keeps the rules in
   * one testable place instead of half here.
   */
  setPlayer: (next: PlayerState) => void;
  /**
   * Merge a patch into the profile, or refuse it naming the field.
   *
   * Refusals name a field for the same reason the server's do: a form with
   * seven inputs and one error message has to know which input to put it
   * under. Uniqueness is checked here rather than in the page because it is a
   * fact about the *directory*, and a page cannot see one.
   */
  saveProfile: (patch: ProfilePatch) => ProfileResult;
  /**
   * Onboarding is finished — stamp it, bank what the flow earned, and pay the
   * welcome gift.
   *
   * One call rather than three, and **idempotent**: the stamp is the guard, so
   * a second report pays nothing. That is the same shape as
   * `POST /v1/me/onboarded`, which answers `granted: false` on every call after
   * the first; see `AuthProvider` for which side of the wire this one is.
   */
  finishOnboarding: (earned: number) => void;
}

/**
 * What a save may change, which is not quite what a profile holds.
 *
 * Two of the eight fields are deliberately not writable, and both would be a
 * bug if they were:
 *
 * - **`countryCode` is not a second answer.** It is a fact about the city, so
 *   the two travel as one `place`. A patch that could set a country on its own
 *   is a patch that can store `Krakow, DE`, which is exactly what the server
 *   refuses by deriving it in `resolveCity`; saying it in the type is the same
 *   rule, one layer earlier.
 * - **`birthDateChangesLeft` is spent, not set.** The provider decrements it
 *   when a birthday actually *changes*, so a form that resends the day already
 *   stored costs nothing — the failure otherwise is an account whose one
 *   correction was consumed by a field nobody touched.
 */
export interface ProfilePatch
  extends Partial<Omit<UserProfile, 'city' | 'countryCode' | 'birthDateChangesLeft'>> {
  /**
   * A city and the country it is in — the pair, or neither.
   *
   * The pairing is the rule, and it survived the field becoming a suggestion
   * box: a known city derives its country and an unknown one is only accepted
   * *with* one, so in both cases the two travel together and there is no shape
   * here that can send a city on its own. The page refuses to submit the third
   * state — a city nobody can place — rather than sending half a place and
   * letting the write decide.
   */
  place?: { city: string; countryCode: string };
}

/** Which field a refusal is about, and what is wrong with it. */
export type ProfileResult =
  | { ok: true }
  | { ok: false; field: 'username'; error: UsernameError }
  | { ok: false; field: 'birthDate'; error: BirthDateError | 'spent' }
  | { ok: false; field: 'phone'; error: 'shape' };

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

/** Just the account, for the many places that only read it. */
export function useAccount(): Account | null {
  return useAuth().account;
}

/**
 * True when a signed-in individual is looking.
 *
 * The gate on every "app" version of a page: L-Earn and Vouchers stop being a
 * pitch and start being the thing itself. Business accounts keep the marketing
 * pages — those pages are the consumer product, and an owner reading them is
 * reading about their customers.
 */
export function useIsPlayer(): boolean {
  return useAuth().account?.type === 'individual';
}

/**
 * True when the platform's own operator is looking.
 *
 * Only the console asks. Nothing else on the site changes for an admin: they
 * read the marketing pages as written, because a page that quietly rearranged
 * itself for whoever runs it would be the one page nobody could check.
 */
export function useIsAdmin(): boolean {
  return useAuth().account?.type === 'admin';
}
