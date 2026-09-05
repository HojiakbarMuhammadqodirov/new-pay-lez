import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { blankBusiness, type BusinessProfile } from './business';
import { newPlayer, today, type PlayerState } from './player';
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
import { ApiError, hasToken, setToken, signOut as apiSignOut } from '../api/client';
import * as api from '../api/consumer';
import { useLanguage } from '../i18n/context';
import {
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
  PROFILE_BONUS,
  isProfileComplete,
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

/**
 * A server session, mirrored into this device's directory.
 *
 * The **server's id** is used, never a locally minted one, and that single
 * choice is what makes the local store a mirror rather than a second
 * directory: sign in on a laptop and a phone and both rows are the same row,
 * so nothing has to be reconciled later. It is the same thing the Google path
 * has always done, lifted out so all three paths do it identically.
 *
 * Everything the server does not model — the account type, the venue's listing
 * — is carried over from an existing local row when there is one, and left
 * blank when there is not. That is the honest state for a person signing in on
 * a new device: the server knows who they are, and this browser does not yet
 * know what they have set up.
 */
function adoptSession(
  session: api.SignedIn,
  type: ChoosableType | null,
): Account {
  /*
   * **An operator is an operator because the server says so.**
   *
   * `admin` is not a `ChoosableType` — the sign-up form cannot offer it, which
   * is the type system enforcing that nobody grants themselves the console. It
   * arrives here instead, off `roles` on the session, which is `user_roles` on
   * the server and nothing this browser can write.
   *
   * That replaces a seeded row in `auth/users.ts` whose password was in the
   * shipped bundle. It was safe while the console only read this device's own
   * `localStorage`; it stopped being safe the moment two of its tabs started
   * reading the live database, and it was always confusing — an operator had to
   * sign in twice, with two different accounts, to see one screen.
   */
  const isAdmin = session.roles?.includes('admin') === true;
  const email = session.user.email ?? '';
  const existing = listUsers().find(
    (user) => user.id === session.user.id || sameEmail(user.email, email),
  );

  const record: UserRecord = existing
    ? { ...existing, id: session.user.id, email, name: session.user.name.trim() || existing.name }
    : {
        id: session.user.id,
        name: session.user.name.trim() || email.split('@')[0],
        email,
        /* Never shown, never checked against: this row is a mirror and the
           server holds the credential. An empty string here would let the
           account be entered from the password form by leaving it blank —
           `findUser` compares `record.password === typed`. */
        password: `server:${crypto.randomUUID()}`,
        created: today(),
        type,
        business: null,
        player: type === 'individual' ? newPlayer() : null,
        profile: { ...EMPTY_PROFILE },
        onboardedAt: null,
      };

  /* The server's word wins over anything this browser remembered: an account
     that has been made an operator becomes one on its next sign-in, and one
     that has had it taken away loses the console the same way. */
  if (isAdmin) record.type = 'admin';
  else if (type !== null && record.type === null) record.type = type;
  if (record.type === 'individual' && !record.player) record.player = newPlayer();


  if (existing) patchUser(record.id, record);
  else addUser(record);

  const next = toAccount(record);
  persist(next);
  return next;
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
  const [language] = useLanguage();
  const [account, setAccount] = useState<Account | null>(stored);

  /**
   * Which plan this account is on, as the **server** understands it.
   *
   * It lives here rather than in each screen that shows it, because it is
   * session state: one fetch when the session changes, shared by the header,
   * the profile card and anything added later. Two components calling
   * `useApi('/v1/me')` would be two requests answering one question.
   *
   * `null` while it is unknown — signed out, still loading, or the server did
   * not answer. A badge is not drawn from a guess: "we have not been told" and
   * "the free plan" are different things, and only the second is a fact.
   */
  const [plan, setPlan] = useState<AuthValue['plan']>(null);
  const [entitlements, setEntitlements] = useState<AuthValue['entitlements']>(null);

  useEffect(() => {
    if (!account || !hasToken()) {
      setPlan(null);
      setEntitlements(null);
      return;
    }
    let live = true;
    void api
      .me()
      .then((server) => {
        if (live) {
          setPlan(server.plan);
          setEntitlements(server.entitlements);
          /*
           * The completion stamp is the server's record, not this device's.
           *
           * `users.profile_completed_at` is what the ledger entry was written
           * against, and it cannot come in on the sign-in response --
           * `SignedIn.user` carries an id, a name and an address and nothing
           * else. It arrives here instead, on the `GET /v1/me` this effect
           * already makes for the plan badge.
           *
           * Adopting it matters on a *second* device: without it a player who
           * finished their profile on a phone signs in on a laptop with a null
           * stamp, and the first save there adds fifty points the server will
           * not credit again -- a number on screen that the next state sync
           * silently takes back. Only ever set *forward*, from null to a date:
           * a stamp this device has just written is not something a slower
           * response is allowed to clear.
           */
          if (server.user.profileCompletedAt) {
            setAccount((held) =>
              held && held.profileCompletedAt === null
                ? { ...held, profileCompletedAt: server.user.profileCompletedAt }
                : held,
            );
          }
        }
      })
      .catch(() => {
        /* Silent: a badge that cannot be resolved is simply not shown. The
           alternative — falling back to "Free" — states a fact we do not have,
           and states it wrongly for exactly the people who paid. */
        if (live) {
          setPlan(null);
          setEntitlements(null);
        }
      });
    return () => {
      live = false;
    };
  }, [account?.id, account]);

  /**
   * Sign in against the server, and fall back to the mirror only when there is
   * no server to ask.
   *
   * The order matters and is not arbitrary. Asking the server first means a
   * real account is always a server account, even if a stale mirror of it is
   * sitting in this browser — a local row that has drifted must never be able
   * to shadow the row that is actually authoritative.
   *
   * **The fallback is gated on `status === 0` and nothing else.** It used to be
   * gated on the address matching a seeded account, which is gone; what it
   * covers now is the one row this browser can hold that the server has never
   * heard of — an account opened by `signUp` while the backend was unreachable.
   * A server that answered and said no is authoritative and must not be
   * second-guessed by a directory it did not write.
   *
   * On success the local directory is written with the **server's id**, which
   * is what makes the mirror a mirror rather than a second directory: the row
   * that already agrees about who somebody is will not need reconciling.
   */
  const signIn = useCallback(
    async (
      email: string,
      password: string,
    ): Promise<{ ok: true } | { ok: false; error: SignInError }> => {
      try {
        const session = await api.signIn(email.trim(), password);
        setToken(session.token);
        setAccount(adoptSession(session, null));
        return { ok: true };
      } catch (cause) {
        /* A server that is not there is not a wrong password, and saying so is
           the difference between "try again" and "check your details". */
        const offline = cause instanceof ApiError && cause.status === 0;
        if (!offline) return { ok: false, error: 'password' };

        /* No server, so the mirror is all there is. It holds nothing but the
           accounts this browser opened while the backend was down; on an
           ordinary device it is empty and `findUser` says so. */
        const found = findUser(listUsers(), email, password);
        if (!found.ok) return { ok: false, error: 'offline' };

        const next = toAccount(found.user);
        setAccount(next);
        persist(next);
        return { ok: true };
      }
    },
    [],
  );

  /**
   * Open an account **on the server**, and mirror it here.
   *
   * The local validation stays and runs first, because it is the one that can
   * answer instantly and in the reader's own language — a password two
   * characters long should not cost a round trip to be told so. What it can no
   * longer decide is whether an address is taken: that is a fact about the
   * server's table, not about this browser, so `taken` now comes back from the
   * server rather than from a local scan that only ever saw one device.
   */
  const signUp = useCallback(
    async (draft: SignUpDraft): Promise<{ ok: true } | { ok: false; error: SignUpError }> => {
      const problem = validateSignUp(listUsers(), draft);
      /* `validateSignUp` returning `null` is what proves `type` is set; the
         cast below carries that across a boundary TypeScript cannot see. */
      if (problem && problem !== 'taken') return { ok: false, error: problem };

      try {
        const session = await api.signUp({
          email: draft.email.trim(),
          password: draft.password,
          name: draft.name.trim(),
          language,
          /*
           * **The one field that decides whether this account can ever own a
           * venue**, and the site did not send it.
           *
           * `partner_owner` is granted at sign-up and nowhere else — there is no
           * endpoint that promotes an account afterwards, deliberately, because
           * a role that can be self-assigned is not a role. So a venue owner who
           * signed up without this flag was filed as a consumer, could not
           * create a venue, and every control on their dashboard that needed one
           * told them the browser was not connected. It was; the account simply
           * was not a partner.
           */
          partner: draft.type === 'business',
        });
        setToken(session.token);
        setAccount(adoptSession(session, draft.type as ChoosableType));
        return { ok: true };
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 0) {
          /* No server. Rather than refuse the sign-up outright, open the
             account here and let it be reconciled on the next successful
             sign-in — the id is minted locally and the mirror is all there is
             until then. This is the one path that still writes a purely local
             account, and it exists so a dead backend does not read as a broken
             form. */
          const id = `u_${Date.now().toString(36)}_${draft.email.trim().toLowerCase()}`;
          const record = newUser({ ...draft, type: draft.type as ChoosableType }, id, today());
          addUser(record);
          const next = toAccount(record);
          setAccount(next);
          persist(next);
          return { ok: true };
        }
        /* `conflict` is the server's word for an address already registered. */
        const taken = cause instanceof ApiError && /conflict|exists|taken/i.test(cause.code);
        return { ok: false, error: taken ? 'taken' : 'email' };
      }
    },
    [language],
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
      /* Persisted for the same reason the stamp above is: it is the only
         record on this device that the bonus has been paid. */
      profileCompletedAt: next.profileCompletedAt,
    });
  }, []);

  const setType = useCallback((type: AccountType) => {
    /*
     * **Tell the server, too, when the answer is "business".**
     *
     * `partner_owner` is granted at sign-up from the form's own flag — but a
     * Google visitor is signed in *before* this question is asked, so for them
     * this is the only moment it can be granted. Without it they were a
     * consumer on the server holding a business account in the browser, and
     * every control on the dashboard reported there was nowhere to file
     * anything. Which was true, and named none of the reasons.
     *
     * Fire-and-forget: it is idempotent, and a failure here is recoverable the
     * next time they save a listing. What must not happen is this blocking the
     * choice — the local account type is what the router reads, and holding the
     * screen on a network call to set a role would be trading the whole flow
     * for a permission the next screen re-establishes anyway.
     */
    if (type === 'business' && hasToken()) void api.becomePartner().catch(() => undefined);

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
           wallet is empty, and stays empty until they play. See `newPlayer`. */
        player: type === 'individual' ? (current.player ?? newPlayer()) : null,
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

      /* `occupation` gets no check of its own, and that is the closed set
         paying for itself: it is a union of five literals plus `''`, so the
         only value that could arrive wrong is one the type system already
         refuses. The free line it replaced needed a length rule. */

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
          ...(patch.occupation === undefined ? {} : { occupation: patch.occupation }),
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
        /*
         * The profile bonus, claimed once and only on the way *into* complete.
         *
         * The server does this in `payForACompleteProfile`, guarded by
         * `UPDATE ... WHERE profile_completed_at IS NULL` while it holds the
         * write lock. This is the local half and it needs the same guard for
         * the same reason: without the stamp, clearing a field and filling it
         * back in would pay again, and the seven fields are all editable.
         *
         * The points are added optimistically. Where a token is in hand the
         * server has already written the ledger entry inside the same
         * `PATCH /v1/me` that saved these fields, and the next
         * `/v1/games/state` reconciles this number against the balance it
         * returns -- the same arrangement `finishOnboarding` settles for.
         */
        const earnsBonus =
          live.profileCompletedAt === null &&
          live.player !== null &&
          isProfileComplete(profile, live.email);

        const next: Account = {
          ...live,
          profile,
          profileCompletedAt: earnsBonus
            ? new Date().toISOString()
            : live.profileCompletedAt,
          player:
            earnsBonus && live.player
              ? { ...live.player, points: live.player.points + PROFILE_BONUS }
              : live.player,
        };
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
  /**
   * Finish onboarding, and take the welcome bonus **from the server**.
   *
   * The flow's own flag rounds are a server session like any other round now,
   * so `earned` has already been banked by the time this runs — what is left is
   * the welcome bonus, and it is the server's to grant. `POST /v1/me/onboarded`
   * claims the row with `UPDATE … WHERE onboarded_at IS NULL`, so a refresh, a
   * second device and a double-press all race for one row and exactly one pays.
   * `granted: false` is not a failure; it is "somebody already collected this".
   *
   * The account is then written from the **balance the server reports**, not
   * from local arithmetic. It used to add `earned + WELCOME_POINTS` to whatever
   * this browser happened to hold, which is how a brand-new player ended the
   * flow reading 130 while the database said 2.
   *
   * With no session it falls back to the old local sum. That is the demo
   * accounts and a dead backend — the same fallback every other path here has,
   * and for the same reason.
   */
  const finishOnboarding = useCallback(
    async (earned: number) => {
      const stamp = (balance: number | null) =>
        setAccount((live) => {
          if (!live) return live;
          if (live.onboardedAt !== null) return live;

          const next: Account = {
            ...live,
            onboardedAt: new Date().toISOString(),
            player: live.player
              ? {
                  ...live.player,
                  points:
                    balance ?? live.player.points + earned + WELCOME_POINTS,
                }
              : live.player,
          };
          commit(next);
          return next;
        });

      if (!hasToken()) {
        stamp(null);
        return;
      }

      try {
        const done = await api.completeOnboarding();
        stamp(done.balance);
      } catch {
        /* The bonus did not land, and inventing it here would put a number on
           the screen that is not in the ledger. The stamp still goes on — the
           flow *is* finished — and the balance stays whatever the server last
           said, which the next `/v1/games/state` reconciles. */
        stamp(account?.player?.points ?? null);
      }
    },
    [commit, account],
  );

  const value = useMemo<AuthValue>(
    () => ({
      account,
      plan,
      entitlements,
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
      plan,
      entitlements,
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
