import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { blankBusiness, type BusinessProfile } from './business';
import { seedPlayer, today, type PlayerState } from './player';
import { AuthContext, type Account, type AccountType, type AuthValue } from './context';
import { addUser, listUsers, patchUser, toAccount } from './directory';
import { exchangeGoogleCredential, forgetGoogle } from './google';
import { signOut as apiSignOut } from '../api/client';
import {
  findUser,
  newUser,
  sameEmail,
  validateSignUp,
  type ChoosableType,
  type SignInError,
  type SignUpDraft,
  type SignUpError,
  type UserRecord,
} from './users';

const STORAGE_KEY = 'paylez-session';

/**
 * Narrowing guard for whatever came back out of storage.
 *
 * Deliberately shallow: it checks the fields the app branches on — `type`
 * decides which site you get, `business` decides whether setup is skipped — and
 * lets the rest through. A stored session is written by this same code, so the
 * realistic failure is a *stale shape* after a deploy, not a hostile payload;
 * and the honest answer to a shape this code no longer understands is to drop
 * it and show the sign-in page, which is what returning `false` does.
 */
function isAccount(value: unknown): value is Account {
  if (typeof value !== 'object' || value === null) return false;
  const account = value as Partial<Account>;
  return (
    typeof account.id === 'string' &&
    typeof account.name === 'string' &&
    typeof account.email === 'string' &&
    (account.type === 'individual' ||
      account.type === 'business' ||
      account.type === 'admin' ||
      account.type === null) &&
    (account.business === null || typeof account.business === 'object')
  );
}

function stored(): Account | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isAccount(parsed)) return null;

    /*
     * A session is a pointer into the directory, so a pointer at a row that is
     * no longer there is not a session. This is not hypothetical: the build
     * before this one seeded a different person, and their session is sitting in
     * somebody's browser right now — signed in as an account that cannot be
     * signed into, whose every write would be merged into a row that does not
     * exist and silently dropped. Signing them out is the honest answer.
     */
    if (!listUsers().some((user) => user.id === parsed.id)) return null;

    /*
     * Backfill, not validation.
     *
     * `player` arrived after the first sessions were written, so a stored
     * individual can legitimately have none — and every screen that reads it
     * renders nothing at all when it is missing, which is a blank page rather
     * than an error anyone can act on. Seeding here fixes it once, at the only
     * boundary the old shape can come through, instead of making nine callers
     * defend against `null`. Any future field wants the same treatment.
     */
    return parsed.type === 'individual' && !parsed.player
      ? { ...parsed, player: seedPlayer() }
      : parsed;
  } catch {
    // Private mode, or a shape this code no longer understands. Signed out is
    // the safe reading of both.
    return null;
  }
}

function persist(account: Account | null): void {
  try {
    if (account) localStorage.setItem(STORAGE_KEY, JSON.stringify(account));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not being able to stay signed in across a refresh is not worth failing over.
  }
}

/**
 * The session.
 *
 * Same construction as `ThemeProvider`: resolved lazily so the first render is
 * already correct, every storage access wrapped, and the value memoised.
 *
 * Unlike the theme there is **no pre-paint script in `index.html`**, and that is
 * a choice rather than an omission. The theme needs one because the alternative
 * is a black page flashing at a light-theme visitor; the worst this can do is
 * show a signed-out header for the one frame before React mounts, which is not
 * worth a second copy of the parsing logic living in a `<script>` tag.
 *
 * See `auth/users.ts` for why none of this is authentication.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(stored);

  const signIn = useCallback(
    (email: string, password: string): { ok: true } | { ok: false; error: SignInError } => {
      const found = findUser(listUsers(), email, password);
      if (!found.ok) return found;

      /*
       * The directory row *is* the account. Everything a returning visitor
       * expects to still be there — their account type, their venue's listing,
       * their points and vouchers — was written back to that row as it happened
       * (see the write-throughs below), so signing in is a read rather than a
       * reconstruction. This used to try to recover it from the previous
       * session, which worked for exactly one person per browser.
       */
      const next = toAccount(found.user);
      setAccount(next);
      persist(next);
      return { ok: true };
    },
    [],
  );

  const signUp = useCallback(
    (draft: SignUpDraft): { ok: true } | { ok: false; error: SignUpError } => {
      const users = listUsers();
      const problem = validateSignUp(users, draft);
      /* `validateSignUp` returning `null` is what proves `type` is set; the
         cast carries that across a boundary TypeScript cannot see through. */
      if (problem) return { ok: false, error: problem };

      /*
       * Time-based and not a counter: ids have to be unique against rows written
       * by *other* sessions in other tabs, which a length-based id is not. The
       * suffix is the email, so two accounts opened in the same millisecond in
       * two tabs still differ — and duplicate addresses are already refused.
       */
      const id = `u_${Date.now().toString(36)}_${draft.email.trim().toLowerCase()}`;
      const record = newUser({ ...draft, type: draft.type as ChoosableType }, id, today());
      addUser(record);

      const next = toAccount(record);
      setAccount(next);
      persist(next);
      return { ok: true };
    },
    [],
  );

  /**
   * Sign in with Google.
   *
   * The server has already verified the token by the time the directory is
   * touched — `exchangeGoogleCredential` throws otherwise — so the address this
   * matches on is one Google confirmed the person controls. That is what makes
   * matching by email safe here and unsafe anywhere else in this file.
   *
   * Two outcomes, and the second is the interesting one:
   *
   * - **An account with that address already exists**, so this is a returning
   *   visitor who happens to have used the Google button. They get their row,
   *   with their type, their venue and their points, exactly as the password
   *   path would have given it to them.
   * - **Nobody has that address**, so a row is created — with `type: null`.
   *   That is not a shortcut: the individual-or-business question genuinely has
   *   not been asked, because Google does not know the answer and the button
   *   did not ask. `resolveRoute` already sends `type === null` to `ChooseType`,
   *   which exists for precisely this state. Defaulting to `individual` instead
   *   would be the "silently give a business owner the consumer site" failure
   *   `context.ts` warns about, one screen earlier.
   */
  const signInWithGoogle = useCallback(
    async (credential: string, language: string): Promise<Account> => {
      const verified = await exchangeGoogleCredential(credential, language);
      const email = verified.user.email ?? '';

      const existing = listUsers().find((user) => sameEmail(user.email, email));
      if (existing) {
        const next = toAccount(existing);
        setAccount(next);
        persist(next);
        return next;
      }

      const record: UserRecord = {
        /* The *server's* id, not a locally minted one. The two directories are
           going to be merged into one, and rows that already agree about who
           somebody is are rows that will not need reconciling then. */
        id: verified.user.id,
        name: verified.user.name.trim() || email.split('@')[0],
        email,
        /*
         * Unguessable, and never shown to anyone.
         *
         * `findUser` signs somebody in when `record.password === typed`, so an
         * empty string here would mean this account could be entered from the
         * password form by typing the address and leaving the password blank.
         * A Google account has no password; this is how you say that in a store
         * whose shape insists on one.
         */
        password: `google:${crypto.randomUUID()}`,
        created: today(),
        type: null,
        business: null,
        player: null,
      };
      addUser(record);

      const next = toAccount(record);
      setAccount(next);
      persist(next);
      return next;
    },
    [],
  );

  const signOut = useCallback(() => {
    setAccount(null);
    persist(null);
    /* So the next person at this browser is asked which account to use rather
       than being signed straight back into the last one. */
    forgetGoogle();
    apiSignOut();
  }, []);

  /**
   * Write a changed account to both stores.
   *
   * The session so this device stays signed in as them, and the directory row so
   * the change survives signing out — and so the admin console is reading the
   * same listing the owner is editing rather than a shipped copy of it. Called
   * from inside the state updaters, which is where `persist` was already being
   * called from; a merge is idempotent, so React invoking an updater twice in
   * development costs nothing.
   */
  const commit = useCallback((next: Account) => {
    persist(next);
    patchUser(next.id, {
      name: next.name,
      type: next.type,
      business: next.business,
      player: next.player,
    });
  }, []);

  const setType = useCallback((type: AccountType) => {
    setAccount((current) => {
      if (!current) return current;
      /*
       * `business` stays `null` until the owner *saves* a listing, and that is
       * load-bearing rather than lazy: "has a listing" is exactly what
       * `resolveRoute` uses to decide whether setup has been done. Seeding a
       * blank one here would make an owner who has never seen the form look
       * finished, and drop them straight on the dashboard.
       */
      const next: Account = {
        ...current,
        type,
        business: type === 'business' ? current.business : null,
        /* The player state is the opposite case to the listing: it is created
           the moment someone says they are here to play, because an empty
           wallet cannot show what a wallet is for. See `seedPlayer`. */
        player: type === 'individual' ? (current.player ?? seedPlayer()) : null,
      };
      commit(next);
      return next;
    });
  }, [commit]);

  const setPlayer = useCallback(
    (next: PlayerState) => {
      setAccount((current) => {
        if (!current) return current;
        const account: Account = { ...current, player: next };
        commit(account);
        return account;
      });
    },
    [commit],
  );

  const saveBusiness = useCallback(
    (patch: Partial<BusinessProfile>) => {
      setAccount((current) => {
        if (!current) return current;
        const next: Account = {
          ...current,
          business: { ...(current.business ?? blankBusiness()), ...patch },
        };
        commit(next);
        return next;
      });
    },
    [commit],
  );

  const value = useMemo<AuthValue>(
    () => ({ account, signIn, signUp, signInWithGoogle, signOut, setType, saveBusiness, setPlayer }),
    [account, signIn, signUp, signInWithGoogle, signOut, setType, saveBusiness, setPlayer],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
