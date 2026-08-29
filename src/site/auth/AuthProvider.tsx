import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { blankBusiness, type BusinessProfile } from './business';
import { seedPlayer, today, type PlayerState } from './player';
import {
  AuthContext,
  EMPTY_PROFILE,
  type Account,
  type AccountType,
  type AuthValue,
  type ProfilePatch,
  type ProfileResult,
  type UserProfile,
} from './context';
import { addUser, listUsers, patchUser, toAccount } from './directory';
import { exchangeGoogleCredential, forgetGoogle } from './google';
import { signOut as apiSignOut } from '../api/client';
import {
  HEADLINE_MAX,
  WELCOME_POINTS,
  checkBirthDate,
  checkUsername,
  findUser,
  isPhone,
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
    const row = listUsers().find((user) => user.id === parsed.id);
    if (!row) return null;

    /*
     * …and the row is then the *whole* answer, not just a permission slip.
     *
     * Everything the session carries beyond the id is written back to that row
     * as it happens (see `commit`), so `toAccount(row)` and the stored blob
     * agree by construction — and where they do not, the row is the copy the
     * admin console reads and the copy signing out and back in would restore.
     * Rebuilding through it also means the backfills for an old shape live in
     * exactly one place. There used to be a second copy here, guarding only
     * this boundary, and the `player` field it was written for could still
     * arrive missing through `signIn`; `directory.ts` says what that looked
     * like. Two new fields have just landed, and neither of them needs a note
     * in two files.
     */
    return toAccount(row);
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
        /* Google hands over a name and an address and nothing else — no handle,
           no city, no birthday. The profile is empty rather than half-guessed,
           and `null` rather than absent for the onboarding stamp: this account
           is genuinely new, which is exactly the case the two states exist to
           tell apart. */
        profile: { ...EMPTY_PROFILE },
        onboardedAt: null,
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
      /* Both of the new fields go through here, and both have to: the profile
         because signing out and back in must restore a handle somebody chose,
         and the stamp because a player who finished onboarding on Monday and
         signs in again on Tuesday must not be walked through it a second time
         — the welcome gift is once-only, and this row is the only record of
         that anywhere on this device. */
      profile: next.profile,
      onboardedAt: next.onboardedAt,
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

  /**
   * Save the profile — validate first, write second.
   *
   * Everything is checked *before* `setAccount`, and that ordering is the whole
   * of why this is not inside the updater: React may invoke an updater twice in
   * development, and a rule with a side effect in it — spending one of two
   * birthday corrections — would spend both. The updater below is a pure merge
   * of a patch that has already been proved good.
   *
   * The rules themselves are pure functions in `users.ts`, so `npm run verify`
   * owns them; this is only the part that needs the directory and the session.
   */
  const saveProfile = useCallback(
    (patch: ProfilePatch): ProfileResult => {
      const current = account;
      if (!current) return { ok: true };
      const was = current.profile;

      let username: string | undefined;
      if (patch.username !== undefined && patch.username.trim() !== was.username) {
        const handle = checkUsername(listUsers(), patch.username, current.id);
        if (!handle.ok) return { ok: false, field: 'username', error: handle.error };
        username = handle.username;
      }

      const headline = patch.headline?.trim();
      if (headline !== undefined && headline.length > HEADLINE_MAX) {
        return { ok: false, field: 'headline', error: 'long' };
      }

      const phone = patch.phone?.trim();
      if (phone !== undefined && phone !== '' && !isPhone(phone)) {
        return { ok: false, field: 'phone', error: 'shape' };
      }

      /*
       * The birthday, and the one rule on this form that costs something.
       *
       * Writing the same day back is not a change and spends nothing — which is
       * what lets the form submit all seven fields on every save. The refusal
       * for a third *different* day names support rather than pretending the
       * correction is impossible, because deciding whether somebody's birthday
       * is really the 14th is a human question and not an endpoint's.
       */
      let birthDate: string | undefined;
      const wanted = patch.birthDate?.trim();
      if (wanted !== undefined && wanted !== '' && wanted !== was.birthDate) {
        const checked = checkBirthDate(wanted, today());
        if (!checked.ok) return { ok: false, field: 'birthDate', error: checked.error };
        if (was.birthDateChangesLeft <= 0) {
          return { ok: false, field: 'birthDate', error: 'spent' };
        }
        birthDate = checked.date;
      }

      setAccount((live) => {
        if (!live) return live;
        const profile: UserProfile = {
          ...live.profile,
          ...(username === undefined ? {} : { username }),
          ...(headline === undefined ? {} : { headline }),
          ...(phone === undefined ? {} : { phone }),
          ...(patch.avatar === undefined ? {} : { avatar: patch.avatar }),
          ...(patch.place === undefined
            ? {}
            : { city: patch.place.city, countryCode: patch.place.countryCode }),
          ...(birthDate === undefined
            ? {}
            : {
                birthDate,
                /* Spent here and nowhere else. `Math.max` rather than a bare
                   subtraction so a row that arrived at 0 through some older
                   shape cannot go negative and start reading as "minus one
                   corrections left". */
                birthDateChangesLeft: Math.max(0, live.profile.birthDateChangesLeft - 1),
              }),
        };
        const next: Account = { ...live, profile };
        commit(next);
        return next;
      });

      return { ok: true };
    },
    [account, commit],
  );

  /**
   * Finish onboarding: stamp it, bank what the flow earned, pay the gift.
   *
   * ── which side of the wire this is ────────────────────────────────────────
   * The server does this at `POST /v1/me/onboarded`
   * (`accounts.completeOnboarding`): it claims the row with
   * `UPDATE … WHERE onboarded_at IS NULL` so two simultaneous reports race for
   * one row and exactly one pays, and the flag game's points arrive separately
   * — earned by a provisional identity and repointed at the real account by
   * `accounts.merge`, so they survive as *ledger entries* rather than as a
   * number copied across.
   *
   * **This is the local half, and it is not that.** There is no provisional
   * identity here because the site's sign-up creates the account before
   * onboarding runs, so the round's points are simply banked onto the player
   * state that already exists; and there is no write lock, because the only
   * writer is this tab. What survives the translation is the property that
   * matters: the stamp is the guard, so a second call pays nothing. When
   * `auth/` moves to the server this function becomes one request.
   *
   * The round's points do **not** go through `awardPoints`. That function owns
   * the streak, the 24-hour window and the per-game decay curve, and the
   * onboarding round is none of those — it is a first-run demo with fixed
   * per-round values, paid on the server as ledger entries against an identity
   * that has never played. Running it through the streak would start a streak
   * on a game that is not one of the seven.
   */
  const finishOnboarding = useCallback(
    (earned: number) => {
      setAccount((live) => {
        if (!live) return live;
        /* The guard, and the reason a second call is safe rather than an
           error: the honest answer to "did I finish onboarding?" is yes, and
           this call is simply not the one that paid for it. */
        if (live.onboardedAt !== null) return live;

        const next: Account = {
          ...live,
          onboardedAt: new Date().toISOString(),
          player: live.player
            ? { ...live.player, points: live.player.points + earned + WELCOME_POINTS }
            : live.player,
        };
        commit(next);
        return next;
      });
    },
    [commit],
  );

  const value = useMemo<AuthValue>(
    () => ({
      account,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      setType,
      saveBusiness,
      setPlayer,
      saveProfile,
      finishOnboarding,
    }),
    [
      account,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      setType,
      saveBusiness,
      setPlayer,
      saveProfile,
      finishOnboarding,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
