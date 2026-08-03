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
import type { SignInError, SignUpDraft, SignUpError } from './users';

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
  /** Points, streak, lives and the wallet. `null` for a business account. */
  player: PlayerState | null;
}

/** The first letter of the name, for the header chip's avatar. */
export function initial(account: Account): string {
  return account.name.trim().charAt(0).toUpperCase() || '?';
}

export interface AuthValue {
  /** `null` when signed out. */
  account: Account | null;
  signIn: (
    email: string,
    password: string,
  ) => { ok: true } | { ok: false; error: SignInError };
  /**
   * Open an account and sign into it in one move.
   *
   * The type is part of the draft rather than a question asked afterwards: an
   * account that exists but does not yet know what it is has to be held at the
   * front door by the router until it does, and there is no reason to create
   * that state when the form can simply ask first.
   */
  signUp: (draft: SignUpDraft) => { ok: true } | { ok: false; error: SignUpError };
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
}

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
