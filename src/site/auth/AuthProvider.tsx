import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { addUser, listUsers, patchUser, replaceUser, toAccount } from './directory';
import { exchangeGoogleCredential, forgetGoogle } from './google';
import {
  awaitsServer,
  foldServer,
  profileRefusal,
  profileWrite,
  typeFromRoles,
  type ServerAnswers,
} from './mirror';
import { ApiError, hasToken, setToken, signOut as apiSignOut } from '../api/client';
import * as api from '../api/consumer';
import { readOwnListing } from '../api/listing';
import { saveMe } from '../api/profile';
import { useLanguage } from '../i18n/context';
import { currentRoute } from '../router';
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
import { DEMO_ACCOUNT, DEMO_MODE } from '../demoMode';

const STORAGE_KEY = 'paylez-session';

/**
 * The longest a reload waits for the server before drawing the page anyway.
 *
 * The wait exists for a stale session (see `awaitsServer`), and it must never
 * become a blank page: an unreachable server fails fast and ends it at once,
 * but a network that neither answers nor refuses would hold it open for as long
 * as the browser lets a request hang. Past this the mirror's page is drawn —
 * the behaviour before the wait existed — and the server's answer is still
 * folded in whenever it lands.
 */
const HOLD_CEILING_MS = 4000;

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
     * exactly one place.
     */
    return toAccount(row);
  } catch {
    // Private mode, or a shape this code no longer understands. Signed out is
    // the safe reading of both.
    return null;
  }
}

/** Who a session belongs to, as each of the three sign-in routes reports it. */
interface ServerSession {
  roles?: string[];
  user: { id: string; name: string; email: string | null };
}

/**
 * A server session, mirrored into this device's directory.
 *
 * The **server's id** is used, never a locally minted one, and that single
 * choice is what makes the local store a mirror rather than a second
 * directory: sign in on a laptop and a phone and both rows are the same row.
 * An account this browser opened while the backend was down carries a local id,
 * and signing in to the server moves its row onto the server's id rather than
 * leaving a session that points at nothing.
 *
 * This is only the *first half* of bringing an account home — the half the
 * sign-in response can answer, which is who somebody is and the roles they
 * hold. `askServer` below is the second half, and nothing publishes this
 * account to the router until both have run.
 *
 * **An operator is an operator because the server says so**, and so is an
 * owner: `typeFromRoles` reads `user_roles`, which nothing in this browser can
 * write. `admin` is not a `ChoosableType`, so no sign-up form can offer it.
 */
function adoptSession(
  session: ServerSession,
  type: ChoosableType | null,
  provider: 'server' | 'google' = 'server',
): Account {
  const email = session.user.email ?? '';
  const rows = listUsers();
  const existing =
    rows.find((user) => user.id === session.user.id) ??
    (email ? rows.find((user) => sameEmail(user.email, email)) : undefined);

  const record: UserRecord = existing
    ? {
        ...existing,
        id: session.user.id,
        email: email || existing.email,
        name: session.user.name.trim() || existing.name,
      }
    : {
        id: session.user.id,
        name: session.user.name.trim() || email.split('@')[0],
        email,
        /* Never shown, never checked against: this row is a mirror and the
           server holds the credential. An empty string here would let the
           account be entered from the password form by leaving it blank —
           `findUser` compares `record.password === typed`. */
        password: `${provider}:${crypto.randomUUID()}`,
        created: today(),
        type,
        business: null,
        player: null,
        profile: { ...EMPTY_PROFILE },
        onboardedAt: null,
      };

  const onboarded = record.onboardedAt === undefined ? record.created : record.onboardedAt;
  record.type = typeFromRoles(session.roles ?? [], record.type ?? type, onboarded);
  record.player = record.type === 'individual' ? (record.player ?? newPlayer()) : null;

  if (existing && existing.id === record.id) patchUser(record.id, record);
  else if (existing) replaceUser(existing.id, record);
  else addUser(record);

  const next = toAccount(record);
  persist(next);
  return next;
}

/**
 * Everything the server knows about this account that the mirror should hold.
 *
 * `GET /v1/me` first, because it decides what else is worth asking: a player's
 * tank and streak come from `GET /v1/games/state`, and an owner's listing from
 * the partner routes — asked in parallel, and each allowed to fail on its own
 * without costing the answers that did arrive.
 *
 * **Never throws.** `null` means "the server did not answer about this account",
 * and every caller has the mirror to fall back on. That includes a token that
 * belongs to somebody else — a `me` whose id is not this account's — which is
 * not folded into it: a stale token in a shared browser must not rename
 * whoever is signed in now.
 */
async function askServer(base: Account): Promise<ServerAnswers | null> {
  let me: api.Me;
  try {
    me = await api.me();
  } catch {
    return null;
  }
  if (me.user.id !== base.id) return null;

  const type = typeFromRoles(me.roles, base.type, base.onboardedAt ?? me.user.onboardedAt);
  const [games, listing] = await Promise.all([
    type === 'individual' ? api.gamesState().catch(() => null) : Promise.resolve(null),
    type === 'business' && me.venues.length > 0
      ? readOwnListing(base.business?.venueId).then((read) =>
          read.state === 'ready' ? read.source : null,
        )
      : Promise.resolve(null),
  ]);
  return { me, games, listing };
}

function persist(account: Account | null): void {
  /*
   * The demonstration account is never written down.
   *
   * It has no row in the directory, so `stored()` would drop it on the next
   * load anyway — but leaving it in `paylez-session` means a browser that has
   * turned the flag off still carries a session blob for somebody who does not
   * exist, and the next person to read that key has to work out why. It costs
   * one line to not create the puzzle.
   */
  if (account?.id === DEMO_ACCOUNT.id) return;

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
  /*
   * Demo mode signs itself in, because otherwise it cannot be looked at: the
   * dashboard is private, so `?demo=1#/dashboard` on a signed-out browser
   * resolves to the sign-in form and the flag achieves nothing. A real session
   * still wins — open the link while signed in and it is *your* account, with
   * your own venue's figures where the API answers. See `demoMode.ts` for why
   * this is a browser-only account rather than a row on the server.
   */
  /* The stored session, and whether the first page has to wait for the server
     before it is drawn — read once and together, so both answers are about the
     same account and the same address. */
  const [boot] = useState(() => {
    const held = stored() ?? (DEMO_MODE ? DEMO_ACCOUNT : null);
    return {
      held,
      waits:
        held !== null &&
        held.id !== DEMO_ACCOUNT.id &&
        hasToken() &&
        awaitsServer(held, currentRoute()),
    };
  });
  const [account, setAccount] = useState<Account | null>(boot.held);
  /*
   * True while a stale session waits for the server, and the site is not drawn
   * at all for that moment. It cannot be a page drawn from the mirror with the
   * route merely "not yet resolved": `Site` resolves during render and corrects
   * the address bar in an effect, so any page drawn would already have routed on
   * the missing fact and moved the hash before the answer could stop it.
   */
  const [settling, setSettling] = useState(boot.waits);

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
  const [memberSince, setMemberSince] = useState<string | null>(null);

  /* Read by callbacks that must not be rebuilt whenever either changes — a
     language switch is not a reason to re-ask the server about an account, and
     a round banked is not a reason to rebuild `refreshAccount`. */
  const languageRef = useRef(language);
  const accountRef = useRef(account);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);
  useEffect(() => {
    accountRef.current = account;
  }, [account]);

  /**
   * The account whose server answer is already folded in.
   *
   * A sign-in asks before it publishes the session, and publishing changes
   * `account.id` — which is exactly what the load-time effect below watches.
   * Without this the same four requests went out twice, a few milliseconds
   * apart, every time anybody signed in.
   */
  const settled = useRef<string | null>(null);

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
      email: next.email,
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

  /** The session-level facts one `GET /v1/me` carries, or none of them. */
  const adoptMe = useCallback((me: api.Me | null) => {
    setPlan(me?.plan ?? null);
    setEntitlements(me?.entitlements ?? null);
    setMemberSince(me?.user.createdAt ?? null);
  }, []);

  /* Folded into the account as it is *now*, not as it was when the question
     went out: a round banked while the answer was in flight is a newer fact
     than anything the answer can know about. */
  const fold = useCallback(
    (answers: ServerAnswers) => {
      setAccount((held) => {
        if (!held || held.id !== answers.me.user.id) return held;
        const next = foldServer(held, answers, languageRef.current);
        commit(next);
        return next;
      });
    },
    [commit],
  );

  /*
   * A stored session, brought up to date once per page load.
   *
   * The first render is the mirror, as it always was, so nothing waits on the
   * network to draw. The server's answer is folded in when it lands — the
   * profile somebody edited on their phone, the listing an operator approved,
   * the plan badge.
   *
   * Keyed on the id alone. It used to be keyed on the whole account, which
   * re-asked `GET /v1/me` after every banked round and every keystroke-free save;
   * now that its answer *writes* the account, that key would be a loop.
   */
  useEffect(() => {
    if (!account || account.id === DEMO_ACCOUNT.id || !hasToken()) {
      settled.current = null;
      adoptMe(null);
      setSettling(false);
      return;
    }
    if (settled.current === account.id) {
      setSettling(false);
      return;
    }

    let live = true;
    const base = account;
    /* The wait ends on an answer, on a failure — a server that is not there
       ends it as fast as it refuses the connection, and the mirror's page is
       drawn exactly as it was before any of this — or at the ceiling. */
    const ceiling = window.setTimeout(() => setSettling(false), HOLD_CEILING_MS);
    void askServer(base).then((answers) => {
      if (!live) return;
      settled.current = base.id;
      adoptMe(answers?.me ?? null);
      /* One render, with the account already folded: the first route the site
         resolves is the one the server's facts give. */
      if (answers) fold(answers);
      setSettling(false);
    });
    return () => {
      live = false;
      window.clearTimeout(ceiling);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  /**
   * Publish a session that has just been opened — after asking the server.
   *
   * The ordering is the whole fix. Publishing the bare mirror first meant the
   * router saw an owner with no listing (this browser had never seen one) and
   * sent them to setup, where the form mounted blank; the listing arriving a
   * moment later changed nothing, because nothing re-reads a mounted draft.
   * Asking first costs the sign-in button a second or so and makes the first
   * route anybody sees the right one.
   */
  const welcome = useCallback(
    async (mirrored: Account): Promise<Account> => {
      const answers = await askServer(mirrored);
      const next = answers ? foldServer(mirrored, answers, languageRef.current) : mirrored;
      settled.current = next.id;
      adoptMe(answers?.me ?? null);
      commit(next);
      setAccount(next);
      return next;
    },
    [adoptMe, commit],
  );

  const refreshAccount = useCallback(async () => {
    const current = accountRef.current;
    if (!current || current.id === DEMO_ACCOUNT.id || !hasToken()) return;
    const answers = await askServer(current);
    if (!answers) return;
    adoptMe(answers.me);
    fold(answers);
  }, [adoptMe, fold]);

  /**
   * Sign in against the server, and fall back to the mirror only when there is
   * no server to ask.
   *
   * The order matters and is not arbitrary. Asking the server first means a
   * real account is always a server account, even if a stale mirror of it is
   * sitting in this browser — a local row that has drifted must never be able
   * to shadow the row that is actually authoritative.
   *
   * **The fallback is gated on `status === 0` and nothing else.** What it covers
   * is the one row this browser can hold that the server has never heard of —
   * an account opened by `signUp` while the backend was unreachable. A server
   * that answered and said no is authoritative and must not be second-guessed
   * by a directory it did not write.
   *
   * Only the sign-in request itself can fail the sign-in. Bringing the account
   * home afterwards cannot: a `GET /v1/me` that fails leaves the mirror, and it
   * must never be reported as a wrong password.
   */
  const signIn = useCallback(
    async (
      email: string,
      password: string,
    ): Promise<{ ok: true } | { ok: false; error: SignInError }> => {
      let session: api.SignedIn;
      try {
        session = await api.signIn(email.trim(), password);
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

      setToken(session.token);
      await welcome(adoptSession(session, null));
      return { ok: true };
    },
    [welcome],
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

      let session: api.SignedIn;
      try {
        session = await api.signUp({
          email: draft.email.trim(),
          password: draft.password,
          name: draft.name.trim(),
          language,
          /*
           * **The one field that decides whether this account can ever own a
           * venue**, and the site did not send it.
           *
           * `partner_owner` is granted at sign-up and nowhere else a visitor can
           * reach before signing in — a role that can be self-assigned later is
           * not a role. So a venue owner who signed up without this flag was
           * filed as a consumer, could not create a venue, and every control on
           * their dashboard that needed one told them the browser was not
           * connected. It was; the account simply was not a partner.
           */
          partner: draft.type === 'business',
        });
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 0) {
          /*
           * No server. Rather than refuse the sign-up outright, open the
           * account here and let it be reconciled on the next successful
           * sign-in — the id is minted locally and the mirror is all there is
           * until then. This is the one path that still writes a purely local
           * account, and it exists so a dead backend does not read as a broken
           * form.
           *
           * **But `taken` still counts here, and ignoring it opened a real
           * hole.** The check above defers the question to the server on the
           * argument that whether an address is registered is a fact about the
           * server's table rather than about this browser. That argument holds
           * only while there *is* a server to ask. On this path there is not,
           * and the local directory stops being a weaker answer than the
           * server's — it becomes the only evidence there is.
           *
           * Without this, signing up with an address this browser already
           * knows minted a *second* row for it: the id carries a timestamp, so
           * the two never collided, and the directory ended up with two
           * accounts for one address. `findUser` then answers with whichever
           * it reaches first, which is a sign-in that lands on an account at
           * random.
           */
          if (problem === 'taken') return { ok: false, error: 'taken' };

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

      setToken(session.token);
      await welcome(adoptSession(session, draft.type as ChoosableType));
      return { ok: true };
    },
    [language, welcome],
  );

  /**
   * Sign in with Google.
   *
   * The server has already verified the token by the time the directory is
   * touched — `exchangeGoogleCredential` throws otherwise — so the address this
   * matches on is one Google confirmed the person controls. That is what makes
   * matching a local row by email safe here.
   *
   * It is the password path from there on: the server's id, the server's roles,
   * and nothing published until the server has been asked what it knows. A
   * brand-new address still arrives with `type: null` — Google does not know
   * whether somebody is here to play or to list a venue, and the button did not
   * ask — and `resolveRoute` sends that to `ChooseType`, which exists for
   * precisely this state.
   */
  const signInWithGoogle = useCallback(
    async (credential: string, language: string): Promise<Account> => {
      const verified = await exchangeGoogleCredential(credential, language);
      return welcome(adoptSession(verified, null, 'google'));
    },
    [welcome],
  );

  const signOut = useCallback(() => {
    settled.current = null;
    setAccount(null);
    persist(null);
    /* So the next person at this browser is asked which account to use rather
       than being signed straight back into the last one. */
    forgetGoogle();
    apiSignOut();
  }, []);

  const setType = useCallback(
    (type: AccountType) => {
      /*
       * **Tell the server, too, when the answer is "business".**
       *
       * `partner_owner` is granted at sign-up from the form's own flag — but a
       * Google visitor is signed in *before* this question is asked, so for them
       * this is the only moment it can be granted. Without it they were a
       * consumer on the server holding a business account in the browser, and
       * every control on the dashboard reported there was nowhere to file
       * anything.
       *
       * Fire-and-forget: it is idempotent, and a failure here is recoverable the
       * next time they save a listing. What must not happen is this blocking the
       * choice — the local account type is what the router reads. Once the role
       * is granted the account is asked about again, which is what finds a venue
       * this address already owns.
       */
      if (type === 'business' && hasToken()) {
        void api
          .becomePartner()
          .then(() => refreshAccount())
          .catch(() => undefined);
      }

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
    },
    [commit, refreshAccount],
  );

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
   * Save the profile — validate first, then let the server decide.
   *
   * Everything this browser can check is checked *before* anything is written,
   * and that ordering is why none of it is inside an updater: React may invoke
   * an updater twice in development, and a rule with a side effect in it —
   * spending one of two birthday corrections — would spend both.
   *
   * Then `PATCH /v1/me`, and **its answer is what the account shows**. The
   * server canonicalises the city, pays the bonus in the same transaction that
   * completed the profile, and cannot clear a column — so an answer somebody
   * emptied comes back as the value the server still holds, which is the truth
   * the page should draw rather than the draft it was sent.
   *
   * Two things are left to the server that used to be decided here. Whether a
   * handle is *taken* is a fact about its table, not about the accounts this
   * browser happens to have seen; the local directory is only asked when there
   * is no server to ask. And the save only falls back to this device when the
   * server cannot be reached at all — a refusal is a refusal, and the result
   * says which field it is about.
   */
  const saveProfile = useCallback(
    async (patch: ProfilePatch): Promise<ProfileResult> => {
      const current = account;
      if (!current) return { ok: true, where: 'device', completed: false };
      const was = current.profile;
      /* The demonstration account has no row anywhere and no token of its own,
         whatever else is sitting in this browser. */
      const online = hasToken() && current.id !== DEMO_ACCOUNT.id;

      let username: string | undefined;
      if (patch.username !== undefined && patch.username.trim() !== was.username) {
        const handle = checkUsername(online ? [] : listUsers(), patch.username, current.id);
        if (!handle.ok) return { ok: false, field: 'username', error: handle.error };
        username = handle.username;
      }

      /* `occupation` gets no check of its own, and that is the closed set
         paying for itself: it is a union of five literals plus `''`, so the
         only value that could arrive wrong is one the type system already
         refuses. */

      const phone = patch.phone?.trim();
      if (phone !== undefined && phone !== '' && !isPhone(phone)) {
        return { ok: false, field: 'phone', error: 'shape' };
      }

      /* A city we do not know travels with a country, and the server takes a
         country as its two-letter code and nothing else. Said here, in the
         reader's language, rather than as a round trip to a 400. */
      const country = patch.place?.countryCode.trim() ?? '';
      if (patch.place?.city.trim() && country && !/^[A-Za-z]{2}$/.test(country)) {
        return { ok: false, field: 'country', error: 'shape' };
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

      /* The patch, applied to a profile. Pure, and applied to whichever profile
         is live when the write lands rather than to the one this render saw. */
      const merge = (profile: UserProfile): UserProfile => ({
        ...profile,
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
                 subtraction so a row that arrived at 0 through some older shape
                 cannot go negative. */
              birthDateChangesLeft: Math.max(0, profile.birthDateChangesLeft - 1),
            }),
      });

      /*
       * The save this browser can make on its own: no server at all, or none
       * that could be reached.
       *
       * The profile bonus is claimed once and only on the way *into* complete,
       * guarded by the stamp for the reason the server guards it with
       * `UPDATE … WHERE profile_completed_at IS NULL`: without it, clearing a
       * field and filling it back in would pay again. The points are added
       * optimistically, and the next answer from the server reconciles them.
       */
      const keepHere = (): ProfileResult => {
        const completed =
          current.profileCompletedAt === null &&
          current.player !== null &&
          isProfileComplete(merge(was), current.email);

        setAccount((live) => {
          if (!live) return live;
          const profile = merge(live.profile);
          const earnsBonus =
            live.profileCompletedAt === null &&
            live.player !== null &&
            isProfileComplete(profile, live.email);
          const next: Account = {
            ...live,
            profile,
            profileCompletedAt: earnsBonus ? new Date().toISOString() : live.profileCompletedAt,
            player:
              earnsBonus && live.player
                ? { ...live.player, points: live.player.points + PROFILE_BONUS }
                : live.player,
          };
          commit(next);
          return next;
        });
        return { ok: true, where: 'device', completed };
      };

      if (!online) return keepHere();

      try {
        const me = await saveMe(profileWrite(patch));
        adoptMe(me);
        setAccount((live) => {
          if (!live || live.id !== me.user.id) return live;
          /* Onto the *patched* profile, so an answer the server has never held
             and the reader just emptied stays empty rather than coming back
             from the profile as it was before the save. */
          const next = foldServer(
            { ...live, profile: merge(live.profile) },
            { me, games: null, listing: null },
            languageRef.current,
          );
          commit(next);
          return next;
        });
        return {
          ok: true,
          where: 'server',
          completed: current.profileCompletedAt === null && me.user.profileCompletedAt !== null,
        };
      } catch (cause) {
        if (!(cause instanceof ApiError)) return { ok: false, field: null, error: 'refused' };
        if (cause.status === 0) return keepHere();
        /* The answer a refusal is about travels in `detail` — `respondError`
           spreads it into the error body beside the code and the message. */
        const field = typeof cause.detail.field === 'string' ? cause.detail.field : null;
        return profileRefusal(cause.status, cause.code, field, cause.message);
      }
    },
    [account, adoptMe, commit],
  );

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
      memberSince,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      setType,
      saveBusiness,
      setPlayer,
      saveProfile,
      finishOnboarding,
      refreshAccount,
    }),
    [
      account,
      plan,
      entitlements,
      memberSince,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      setType,
      saveBusiness,
      setPlayer,
      saveProfile,
      finishOnboarding,
      refreshAccount,
    ],
  );

  return (
    <AuthContext.Provider value={value}>{settling ? null : children}</AuthContext.Provider>
  );
}
