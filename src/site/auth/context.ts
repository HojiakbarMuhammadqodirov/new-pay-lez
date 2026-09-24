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
import type { Route } from '../router';
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
  /**
   * When the profile first held all seven fields, or `null` if it never has.
   *
   * A stamp rather than a boolean derived from the profile, because the grant
   * behind it is once-only: `isProfileComplete` would go false again the moment
   * somebody cleared their phone number, and paying on the way back would make
   * the bonus a faucet. The server keeps the same stamp in
   * `users.profile_completed_at` and is the record; this is the device's copy.
   */
  profileCompletedAt: string | null;
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
   * The country the city is in, as an ISO-3166 alpha-2 code.
   *
   * Derived and never asked for when the city came off the served list. Asked
   * for when it did not — and asked for *as a code*, because that is the one
   * shape `PATCH /v1/me` accepts, and a form that invited "Poland" would be a
   * form that invited a refusal.
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
   * listing once did with its logo, and the difference is the size: this one is
   * downscaled to `AVATAR_PX` square before it is ever stored, which is a few
   * kilobytes. A profile photo nobody can see is not a profile photo, and the
   * quota argument is answered by the downscale rather than ignored.
   *
   * It may also hold whatever the server holds, which is not always a data URL;
   * `Face` draws only the pictures this site made (see `picture.ts`).
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
   * The plan the server says this account is on, or `null` when unknown.
   *
   * `null` covers signed out, still loading, and the server not answering —
   * all three of which mean "do not draw a badge". It deliberately does not
   * fall back to the free plan: that would label a paying customer as free
   * whenever a request failed, which is the one error worth avoiding here.
   */
  plan: { code: string; name: string; audience: string } | null;
  /**
   * What this plan actually buys, as the server resolves it — a bigger energy
   * tank, a faster refill, more word hints. `null` under the same three
   * conditions as `plan`.
   *
   * Values are strings because that is how they are stored; read them with
   * `Number(...)` and a free-plan fallback, never assume a key is present.
   */
  entitlements: Record<string, string> | null;
  /**
   * When the server opened this account (ISO), or `null` when unknown — the same
   * three `null`s as `plan`. Session state for the same reason: it arrives on the
   * one `GET /v1/me` the provider already makes, and the local directory's own
   * join date is the day this *browser* first saw the account, which is a
   * different and much less interesting fact.
   */
  memberSince: string | null;
  /**
   * Whether this account is listed on the weekly board — `null` when unknown.
   *
   * On by default now (the column's own default, and a one-off migration for
   * the rows that predate it), which is what makes having the switch on this
   * client matter: a default nobody can turn off is not a default, it is a
   * rule. The server and the phone have always had the opt-out; the web did
   * not, and turning the default on without it would have been a privacy
   * change rather than a product one.
   *
   * `null` rather than `false` while unknown, for the reason `plan` states: a
   * switch drawn off for somebody who is actually on it is a switch that lies
   * about them until the request lands.
   */
  leaderboardOptIn: boolean | null;
  /**
   * §1.4's standing answer: share my profile with the venues I visit.
   *
   * `null` while unknown, for the reason the two fields either side of it are:
   * a privacy switch drawn *off* for somebody who is actually on it, or on for
   * somebody who is off, is a switch that lies about them until the request
   * lands. Disabled-and-unknown is the honest third state.
   */
  venueSharingDefault: boolean | null;
  /**
   * Where to go once the session change that is in flight has landed — a
   * **one-shot**, read and cleared by `Site`.
   *
   * ## Why this exists rather than a `navigate()` in a handler
   *
   * `router.ts` states the rule and the reason: **never call `navigate` from a
   * handler that also changes the session.** The hash is set synchronously,
   * React re-renders before `hashchange` fires, and the guard then runs once
   * against the *new* account and the *old* route and replaces the hash over
   * the top of you. Its remedy is "derive the destination in `resolveRoute`
   * instead".
   *
   * That works when the destination is a function of the account, and the
   * welcome screen's second button is the case where it is not: finishing
   * onboarding resolves to `landing` for everybody, and this one person wants
   * the profile. `resolveRoute` cannot know that — it is pure in
   * `(route, account)` and must stay that way, because `npm run verify` walks
   * the whole matrix checking every resolution is a fixed point.
   *
   * So the intent is carried *beside* the session change rather than raced
   * against it: `finishOnboarding('profile')` sets the stamp and this field in
   * one commit, and `Site`'s correcting effect prefers it over the guard's
   * answer for exactly one navigation. Which keeps the whole mechanism in the
   * one place that is allowed to navigate.
   */
  pendingRoute: Route | null;
  /** Consumed by `Site` the moment it has navigated. */
  clearPendingRoute: () => void;
  /**
   * Sign in against the **server**, and bring what it knows about the account
   * home before anybody is shown a page.
   *
   * The session is not published until `GET /v1/me` (and, for an owner, the
   * listing) has answered, and that ordering is the point: publishing the bare
   * mirror first let `resolveRoute` send a returning owner to the setup form on
   * the strength of a browser that simply had not heard of their venue yet.
   * A server that cannot be asked leaves the mirror as it was, which is the
   * behaviour before any of this existed.
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
   * The server verifies the token before anybody is signed in, and the account
   * it answers with is brought home exactly as the password path does it.
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
   * Save the profile — to the server, or refuse it naming the field.
   *
   * Async because the server is the record: the rules that can answer instantly
   * run first and in the reader's language, then `PATCH /v1/me` decides, and its
   * answer is what the account shows afterwards. Only a server that cannot be
   * reached falls back to this device, and the result says so (`where`), so the
   * page can tell the reader the truth about where their answers are.
   */
  saveProfile: (patch: ProfilePatch) => Promise<ProfileResult>;
  /**
   * Onboarding is finished — stamp it, bank what the flow earned, and pay the
   * welcome gift.
   *
   * One call rather than three, and **idempotent**: the stamp is the guard, so
   * a second report pays nothing. That is the same shape as
   * `POST /v1/me/onboarded`, which answers `granted: false` on every call after
   * the first; see `AuthProvider` for which side of the wire this one is.
   */
  /**
   * End the welcome gate, bank the round, and optionally say where to go next.
   *
   * `goTo` is the one-shot `pendingRoute` above, and it is a parameter here
   * rather than a second call because the two have to land in one commit: a
   * `navigate` beside this call is the exact race `router.ts` warns about, and
   * a `setPendingRoute` after it would be a second render with the guard
   * already run.
   */
  finishOnboarding: (earned: number, goTo?: Route) => Promise<void>;
  /**
   * Ask the server about this account again and fold the answer in.
   *
   * For the moments a screen has just written something the mirror did not see
   * being written — the welcome flow's city, a role granted in the background.
   * Resolves once folded; never rejects, because a refresh that could not reach
   * the server leaves the account exactly as it was.
   */
  refreshAccount: () => Promise<void>;
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

/**
 * How a save ended.
 *
 * A success says **where** the answers now are — `server`, or `device` when the
 * server could not be reached and this browser kept them — and whether this was
 * the save that completed the profile, which is the one moment the page
 * celebrates. A refusal names the field it is about, the way the server's do,
 * because a form with seven inputs and one message has to know which input to
 * put it under; `null` is a refusal about the save as a whole.
 */
export type ProfileResult =
  | { ok: true; where: 'server' | 'device'; completed: boolean }
  | { ok: false; field: 'username'; error: UsernameError }
  | { ok: false; field: 'birthDate'; error: BirthDateError | 'spent' }
  | { ok: false; field: 'phone'; error: 'shape' }
  | { ok: false; field: 'city'; error: 'shape' }
  | { ok: false; field: 'country'; error: 'needed' | 'shape' }
  | { ok: false; field: null; error: 'session' | 'refused' };

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
