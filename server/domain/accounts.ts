/**
 * Identity — §1.1–1.2, and B1's partner onboarding.
 *
 * The provisional account is the part of this that is easy to get wrong and is
 * explicitly required: "onboarding lets a user play the flag game and earn
 * points *before* signing up. The backend must mint a provisional
 * (device-scoped) identity, hold earned points against it, and merge it into the
 * real account on sign-up. **Points won during onboarding survive the merge.**"
 *
 * They survive because the merge moves the *ledger*, not a balance. Every entry,
 * every lot, every game session is repointed at the real account and the caches
 * are recomputed from the ledger afterwards — so the merged balance is provably
 * the sum of what was earned, and there is no moment where a number is copied
 * from one row to another and has to be trusted.
 *
 * Roles are additive (§1.2): a partner owner is a consumer who also owns a
 * venue, served from one identity with the active mode held in the session. That
 * is why nothing here has an "account type" — the site's prototype has one, and
 * the spec deliberately does not.
 */
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import * as consent from './consent.ts';
import * as ledger from './ledger.ts';
import * as social from './social.ts';
import { DomainError } from './errors.ts';
import { hashPassword, verifyPassword } from '../crypto/passwords.ts';
import { hashToken, newToken } from '../crypto/tokens.ts';
import { newId } from './ids.ts';
import { now, plusDays, plusMinutes, type Iso } from './time.ts';

export type Role = 'consumer' | 'partner_owner' | 'manager' | 'admin';
export type Mode = 'consumer' | 'partner' | 'admin';

export interface User {
  id: string;
  email: string | null;
  display_name: string;
  /** The handle as typed, and the folded form everything compares on. */
  username: string | null;
  username_norm: string | null;
  password_hash: string | null;
  language: string;
  /** One of `CITIES`, or whatever the old database carried. See `resolveCity`. */
  city: string | null;
  country_code: string | null;
  /* Contact and profile. All optional, none of them gates anything, and an
     account that answers none of them is a complete account — the schema says
     so at the columns and this shape has to keep saying it, because a field
     typed `string` here is a field somebody will eventually make required.

     **None of them is verified.** There is no code sent to the number and no
     link clicked in the address; the address is how the account signs in, which
     is a different question. */
  phone: string | null;
  /** ISO `YYYY-MM-DD`. Set once, corrected once — see `updateProfile`. */
  birth_date: string | null;
  birth_date_set_at: string | null;
  /** Accepted writes, not corrections: 0 unset, 1 set, 2 spent. */
  birth_date_changes: number;
  headline: string | null;
  display_avatar: string | null;
  /** When onboarding was reported finished; the welcome gift's once-only guard. */
  onboarded_at: string | null;
  /** The same guard for `CONFIG.earn.profileComplete`. */
  profile_completed_at: string | null;
  points_cache: number;
  leaderboard_opt_in: number;
  referral_code: string | null;
  trust_tier: number;
  status: string;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  mode: Mode;
  surface: 'web' | 'mobile';
  expires_at: string;
}

const normalise = (email: string): string => email.trim().toLowerCase();

export const getUser = (db: Db, userId: string): User => {
  const user = db.get<User>(`SELECT * FROM users WHERE id = $u`, { u: userId });
  if (!user) throw new DomainError('not_found', 'user not found');
  return user;
};

export const rolesOf = (db: Db, userId: string): Role[] =>
  db.all<{ role: Role }>(`SELECT role FROM user_roles WHERE user_id = $u`, { u: userId }).map(
    (row) => row.role,
  );

export const hasRole = (db: Db, userId: string, role: Role): boolean =>
  Boolean(db.get(`SELECT 1 FROM user_roles WHERE user_id = $u AND role = $r`, { u: userId, r: role }));

function grantRole(db: Db, userId: string, role: Role, at: Iso): void {
  db.run(`INSERT OR IGNORE INTO user_roles (user_id, role, granted_at) VALUES ($u, $r, $t)`, {
    u: userId,
    r: role,
    t: at,
  });
}

/* ═══════════════════════════════════════════════ provisional identities ══ */

/**
 * Mint a device-scoped identity so onboarding can pay for itself.
 *
 * It is a real row in `users` with `status = 'provisional'` rather than a
 * separate table, because the alternative is every downstream table needing to
 * know about two kinds of owner — and the ledger, in particular, must not.
 */
export function provisional(db: Db, fingerprint: string, at: Iso = now()): User {
  const existing = db.get<User>(
    `SELECT u.* FROM users u JOIN devices d ON d.first_user_id = u.id
      WHERE d.fingerprint = $f AND u.status = 'provisional'`,
    { f: fingerprint },
  );
  if (existing) return existing;

  const id = newId('usr');
  db.tx(() => {
    db.run(
      `INSERT INTO users (id, display_name, auth_provider, language, status, created_at, updated_at)
       VALUES ($i, 'Guest', 'provisional', 'en', 'provisional', $t, $t)`,
      { i: id, t: at },
    );
    grantRole(db, id, 'consumer', at);
    const deviceId = newId('dev');
    db.run(
      `INSERT INTO devices (id, fingerprint, first_user_id, first_seen_at, last_seen_at)
       VALUES ($d, $f, $i, $t, $t)
         ON CONFLICT (fingerprint) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
      { d: deviceId, f: fingerprint, i: id, t: at },
    );
    db.run(
      `INSERT OR IGNORE INTO device_users (device_id, user_id, seen_at)
       SELECT id, $i, $t FROM devices WHERE fingerprint = $f`,
      { i: id, t: at, f: fingerprint },
    );
  });
  return getUser(db, id);
}

/**
 * Fold a provisional account into a real one.
 *
 * Everything the guest earned is repointed, then both caches are reconciled from
 * the ledger. The provisional row is marked erased rather than deleted so the
 * foreign keys that already point at it (a game session, a device link) stay
 * valid — and so the merge itself is visible afterwards.
 */
export function merge(db: Db, provisionalId: string, realId: string, at: Iso = now()): void {
  if (provisionalId === realId) return;
  const guest = getUser(db, provisionalId);
  if (guest.status !== 'provisional') {
    throw new DomainError('conflict', 'only a provisional account can be merged');
  }

  db.tx(() => {
    for (const table of ['points_ledger', 'points_lots', 'game_sessions', 'daily_counters']) {
      db.run(`UPDATE ${table} SET user_id = $r WHERE user_id = $p`, { r: realId, p: provisionalId });
    }
    db.run(`UPDATE device_users SET user_id = $r WHERE user_id = $p`, {
      r: realId,
      p: provisionalId,
    });
    db.run(
      `UPDATE users SET status = 'erased', display_name = 'Merged guest', deleted_at = $t WHERE id = $p`,
      { t: at, p: provisionalId },
    );
    /* The balance is *derived* after the move, never copied. That is the whole
       reason the points survive verifiably rather than by assertion. */
    ledger.reconcile(db, realId);
    ledger.reconcile(db, provisionalId);
  });
}

/* ═══════════════════════════════════════════════════════ sign-up, sign-in ══ */

export interface SignUpInput {
  email: string;
  password: string;
  name: string;
  language?: string;
  city?: string;
  /** §1.2. `partner_owner` is chosen at sign-up; `admin` never is. */
  partner?: boolean;
  referralCode?: string;
  /** A guest identity to fold in, if the visitor played before signing up. */
  provisionalId?: string;
  deviceFingerprint?: string;
  at?: Iso;
}

export async function signUp(db: Db, input: SignUpInput): Promise<User> {
  const at = input.at ?? now();
  const email = normalise(input.email);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new DomainError('validation_failed', 'that does not look like an email', { field: 'email' });
  }
  if (input.password.length < CONFIG.auth.minPasswordLength) {
    throw new DomainError('validation_failed', 'password is too short', { field: 'password' });
  }
  if (!input.name.trim()) {
    throw new DomainError('validation_failed', 'a name is needed', { field: 'name' });
  }
  if (db.get(`SELECT 1 FROM users WHERE email_norm = $e`, { e: email })) {
    throw new DomainError('conflict', 'that address already has an account', { field: 'email' });
  }

  /* Hashing is the only await in the flow and it happens *before* the
     transaction opens: a 100ms scrypt inside `BEGIN IMMEDIATE` would hold the
     write lock for the whole of it. */
  /* The same closed set `updateProfile` writes against, checked here too —
     otherwise sign-up is the hole in it, and the first thing every account holds
     is a city nothing else in the product will accept. */
  const city = input.city === undefined ? null : resolveCity(input.city);

  const hash = await hashPassword(input.password);
  const id = newId('usr');

  db.tx(() => {
    db.run(
      `INSERT INTO users (id, email, email_norm, display_name, password_hash, auth_provider,
                          language, city, country_code, status, created_at, updated_at)
       VALUES ($i, $e, $n, $d, $h, 'email', $l, $c, $cc, 'active', $t, $t)`,
      {
        i: id,
        e: input.email.trim(),
        n: email,
        d: input.name.trim(),
        h: hash,
        l: input.language ?? 'en',
        c: city?.name ?? null,
        cc: city?.country ?? null,
        t: at,
      },
    );
    grantRole(db, id, 'consumer', at);
    if (input.partner) grantRole(db, id, 'partner_owner', at);

    /* §1.3: consent is recorded at account creation with the policy version. */
    consent.record(db, { userId: id, kind: 'terms', granted: true, source: 'signup', at });
    consent.record(db, { userId: id, kind: 'privacy', granted: true, source: 'signup', at });

    social.codeFor(db, id);

    if (input.provisionalId) merge(db, input.provisionalId, id, at);
    if (input.referralCode) social.bind(db, { code: input.referralCode, newUserId: id, at });

    /* **Sign-up grants nothing.** The welcome gift used to be paid here and is
       paid by `completeOnboarding` now, which is a different moment: an address
       and a password cost nothing to produce, and a bonus attached to producing
       them is a bonus payable in bulk. Onboarding is the first thing that asks
       for effort, and `users.onboarded_at` is what makes it once-only. */

    db.run(
      `INSERT INTO player_states (user_id, streak, longest_streak, freezes, lives, answered, correct, updated_at)
       VALUES ($u, 0, 0, 0, $l, 0, 0, $t)`,
      { u: id, l: CONFIG.points.dailyLives, t: at },
    );
  });

  return getUser(db, id);
}

/**
 * Sign in with Google — the account half, after the token has been verified.
 *
 * `crypto/google.ts` decides whether the identity is real; this decides which
 * account it *is*, and the order of the two lookups is the whole substance:
 *
 * 1. **By `provider_ref`** — Google's `sub`, which is stable and never reused.
 *    That is the correct key, because an address can change hands and a `sub`
 *    cannot.
 * 2. **By verified email**, which links Google to an account somebody already
 *    opened with a password. Safe only because the caller has already refused
 *    any token whose `email_verified` is false; without that check this second
 *    lookup is an account-takeover route, and it is why the check lives at the
 *    point of verification rather than being left to callers to remember.
 * 3. Otherwise a new account, provisioned exactly as `signUp` does — same role,
 *    same consent records, same referral code, same player state, and the same
 *    nothing in the ledger. A Google account that skipped any of those would be
 *    a second kind of user for every rule downstream to special-case, and one
 *    that *arrived* with points would be the cheapest way to mint them.
 *
 * No password is set. `password_hash` stays NULL, which the schema already
 * allows for exactly this, and `signIn` rejects it because `verifyPassword`
 * against a null hash fails — so a Google-only account cannot be entered with a
 * guessed password.
 */
export function linkGoogleAccount(
  db: Db,
  input: { sub: string; email: string; name: string; language?: string; at?: Iso },
): User {
  const at = input.at ?? now();
  const email = normalise(input.email);

  const byProvider = db.get<User>(
    `SELECT * FROM users WHERE auth_provider = 'google' AND provider_ref = $s AND deleted_at IS NULL`,
    { s: input.sub },
  );
  if (byProvider) {
    if (byProvider.status === 'banned') {
      throw new DomainError('forbidden', 'this account is suspended');
    }
    return byProvider;
  }

  const byEmail = db.get<User>(
    `SELECT * FROM users WHERE email_norm = $e AND deleted_at IS NULL`,
    { e: email },
  );
  if (byEmail) {
    if (byEmail.status === 'banned') {
      throw new DomainError('forbidden', 'this account is suspended');
    }
    /* Link, but leave `auth_provider` alone when the account already has a
       password: it can now be entered either way, and rewriting it to 'google'
       would claim the password no longer works when it does. */
    db.run(
      `UPDATE users
          SET provider_ref = $s,
              auth_provider = CASE WHEN password_hash IS NULL THEN 'google' ELSE auth_provider END,
              updated_at = $t
        WHERE id = $i`,
      { s: input.sub, t: at, i: byEmail.id },
    );
    return getUser(db, byEmail.id);
  }

  const id = newId('usr');
  db.tx(() => {
    db.run(
      `INSERT INTO users (id, email, email_norm, display_name, password_hash, auth_provider,
                          provider_ref, language, status, created_at, updated_at)
       VALUES ($i, $e, $n, $d, NULL, 'google', $s, $l, 'active', $t, $t)`,
      {
        i: id,
        e: input.email.trim(),
        n: email,
        d: input.name.trim() || email.split('@')[0],
        s: input.sub,
        l: input.language ?? 'en',
        t: at,
      },
    );
    grantRole(db, id, 'consumer', at);

    /* §1.3, same as `signUp`. Signing in with Google is still the moment the
       account comes into existence, so it is still the moment consent is
       recorded — with the same policy version, so the two paths cannot drift. */
    consent.record(db, { userId: id, kind: 'terms', granted: true, source: 'signup', at });
    consent.record(db, { userId: id, kind: 'privacy', granted: true, source: 'signup', at });

    social.codeFor(db, id);

    /* No welcome grant here either, for the reason `signUp` gives: the gift is
       onboarding's, and the two paths have to agree or one of them is the
       cheaper way in. */

    db.run(
      `INSERT INTO player_states (user_id, streak, longest_streak, freezes, lives, answered, correct, updated_at)
       VALUES ($u, 0, 0, 0, $l, 0, 0, $t)`,
      { u: id, l: CONFIG.points.dailyLives, t: at },
    );
  });

  return getUser(db, id);
}

/* ══════════════════════════════════════════════════════════ onboarding ══ */

export interface Onboarded {
  /** True only for the call that actually claimed the row — see below. */
  granted: boolean;
  /** When onboarding was first reported. Unchanged by a second report. */
  onboardedAt: Iso;
  /** What this call paid. `0` on every call after the first. */
  points: number;
  balance: number;
}

/**
 * Report onboarding finished, and pay for it — **exactly once**.
 *
 * The gift moved here from sign-up because this is the first moment that costs
 * the person anything: an address and a password can be produced in bulk, and a
 * bonus attached to producing them is a bonus that funds a farm. Finishing
 * onboarding cannot be done twice by one account, which is what makes it a
 * reasonable thing to pay for — provided "cannot be done twice" is actually
 * enforced, and that is the whole substance of this function.
 *
 * The guard is the `UPDATE`, not a read: `WHERE onboarded_at IS NULL` is
 * evaluated by SQLite while it holds the write lock on the row, so two
 * simultaneous reports — a phone and a browser, a client that retried a request
 * it had already sent — race for one row and exactly one of them sees
 * `changes === 1`. A `SELECT` followed by an `if` is the same code with a window
 * between the two statements wide enough to pay the bonus twice, and it is a
 * window a slow ledger write makes wider.
 *
 * No plan multiplier. `CONFIG.earn` files this with the getting-started one-offs
 * that are "the same on every plan": a multiplier on a once-in-a-lifetime grant
 * is a reason to subscribe for a day before finishing the tour.
 *
 * A second report is not an error. The client that sends it is a client that
 * lost its response or reinstalled, and the honest answer to "did I finish
 * onboarding?" is yes, plus a `granted: false` saying this call is not what paid
 * for it.
 */
export function completeOnboarding(db: Db, userId: string, at: Iso = now()): Onboarded {
  /* Resolve first, so an unknown id is a 404 rather than a silent
     `granted: false` — zero changed rows would otherwise mean both "already
     onboarded" and "no such account". */
  getUser(db, userId);

  return db.tx(() => {
    const claimed =
      db.run(
        `UPDATE users SET onboarded_at = $t, updated_at = $t
          WHERE id = $u AND onboarded_at IS NULL`,
        { t: at, u: userId },
      ).changes === 1;

    if (claimed) {
      ledger.earn(db, {
        userId,
        points: CONFIG.earn.onboarding,
        reason: 'welcome_bonus',
        sourceKind: 'onboarding',
        sourceRef: userId,
        at,
      });
    }

    const user = getUser(db, userId);
    return {
      granted: claimed,
      /* Read back rather than assumed: on the losing side of a race the stamp is
         the winner's timestamp, and that is the one the client should hold. */
      onboardedAt: user.onboarded_at ?? at,
      points: claimed ? CONFIG.earn.onboarding : 0,
      balance: ledger.balance(db, userId),
    };
  });
}

export interface SignedIn {
  user: User;
  token: string;
  session: Session;
  roles: Role[];
}

/** The session half of a Google sign-in, shared with the password path. */
export function sessionForUser(
  db: Db,
  input: { user: User; surface?: 'web' | 'mobile'; deviceFingerprint?: string; at?: Iso },
): SignedIn {
  const at = input.at ?? now();
  const roles = rolesOf(db, input.user.id);
  const mode: Mode = roles.includes('admin')
    ? 'admin'
    : roles.includes('partner_owner')
      ? 'partner'
      : 'consumer';

  const session = createSession(db, {
    userId: input.user.id,
    mode,
    surface: input.surface ?? 'web',
    deviceFingerprint: input.deviceFingerprint,
    at,
  });

  return { user: input.user, token: session.token, session: session.session, roles };
}

/**
 * Sign in.
 *
 * The password is verified even when the address is unknown — against a dummy
 * hash — so the response time does not tell an attacker which addresses have
 * accounts. It is one extra scrypt on a failed login and it removes an
 * enumeration oracle that is otherwise free to use.
 */
/**
 * Provision the one admin, from the environment.
 *
 * Part C's console is twenty-four endpoints behind `auth: 'admin'`, and nothing
 * else in this server grants that role — sign-up cannot produce one (§1.2, and
 * the site says the same thing at the type level with `ChoosableType`), the
 * import does not carry one, and there is no endpoint that promotes anybody.
 * Without this the whole operations surface is unreachable.
 *
 * From the environment and **never a default**, which is the entire point. A
 * seeded admin password in a repository is a back door into every venue's
 * money, and it would be found by whoever reads this file next. If the
 * variables are unset the server says the console is unreachable and carries on
 * serving everything else, because that is true and recoverable; a fallback
 * credential is neither.
 *
 * Idempotent: it updates the password of the account it already made rather
 * than failing on the second boot, so rotating the key is `PAYLEZ_ADMIN_PASSWORD=…`
 * and a restart.
 */
export async function provisionAdmin(
  db: Db,
  email: string | undefined,
  password: string | undefined,
  at: Iso = now(),
): Promise<'created' | 'updated' | 'skipped'> {
  if (!email || !password) return 'skipped';
  if (password.length < CONFIG.auth.minPasswordLength) {
    throw new DomainError('validation_failed', 'the admin password is shorter than the minimum');
  }

  const norm = normalise(email);
  const hash = await hashPassword(password);
  const existing = db.get<{ id: string }>(`SELECT id FROM users WHERE email_norm = $e`, { e: norm });

  return db.tx(() => {
    const id = existing?.id ?? newId('usr');
    if (existing) {
      db.run(`UPDATE users SET password_hash = $h, status = 'active', updated_at = $t WHERE id = $i`, {
        h: hash,
        t: at,
        i: id,
      });
    } else {
      db.run(
        `INSERT INTO users (id, email, email_norm, display_name, auth_provider, password_hash,
                            language, status, created_at, updated_at)
         VALUES ($i, $e, $n, 'Paylez operations', 'email', $h, 'en', 'active', $t, $t)`,
        { i: id, e: email, n: norm, h: hash, t: at },
      );
    }
    /* The role is granted separately and idempotently: an operator who existed
       as a customer first keeps that row and gains this one. */
    grantRole(db, id, 'admin', at);
    return existing ? 'updated' : 'created';
  });
}

/**
 * The sign-in rate limit `CONFIG.auth.signInPerHour` has always described.
 *
 * Keyed by the **address tried**, not by the account found. An attempt against
 * an address that does not exist is precisely the one worth counting — keying
 * on the account would leave the enumeration case, guessing addresses, entirely
 * unlimited, and it is the cheaper attack of the two.
 *
 * Only *failures* count against the limit, so a household or an office behind
 * one address cannot lock each other out by signing in successfully. The refusal
 * is deliberately the same `unauthenticated` shape as a wrong password rather
 * than its own code: an attacker who can tell "throttled" from "wrong password"
 * has been told the address is real.
 */
function throttleSignIn(db: Db, subject: string, at: Iso): void {
  const since = plusMinutes(at, -60);
  const recent = db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM auth_attempts WHERE subject = $s AND ok = 0 AND at >= $since`,
    { s: subject, since },
  );
  if ((recent?.n ?? 0) >= CONFIG.auth.signInPerHour) {
    throw new DomainError('unauthenticated', 'wrong email or password');
  }
}

/**
 * A success clears the run of failures rather than being recorded beside them:
 * somebody who mistyped four times and then got it right is not four fifths of
 * the way to a lockout, and leaving the failures in place would mean their next
 * genuine slip counts as the fifth.
 */
function recordAttempt(db: Db, subject: string, ok: boolean, at: Iso): void {
  if (ok) {
    db.run(`DELETE FROM auth_attempts WHERE subject = $s`, { s: subject });
    return;
  }
  db.run(`INSERT INTO auth_attempts (id, subject, at, ok) VALUES ($id, $s, $at, 0)`, {
    id: newId('ath'),
    s: subject,
    at,
  });
}

export async function signIn(
  db: Db,
  input: { email: string; password: string; surface?: 'web' | 'mobile'; deviceFingerprint?: string; at?: Iso },
): Promise<SignedIn> {
  const at = input.at ?? now();
  const subject = normalise(input.email);
  throttleSignIn(db, subject, at);

  const user = db.get<User>(`SELECT * FROM users WHERE email_norm = $e AND deleted_at IS NULL`, {
    e: subject,
  });

  const ok = await verifyPassword(input.password, user?.password_hash ?? null);
  recordAttempt(db, subject, Boolean(user && ok), at);
  if (!user || !ok) throw new DomainError('unauthenticated', 'wrong email or password');
  if (user.status === 'banned') throw new DomainError('forbidden', 'this account is suspended');

  const roles = rolesOf(db, user.id);
  /* §1.2: a partner owner defaults to business mode and can switch to personal
     within the same account. The default is a property of the sign-in, the
     switch is a property of the session. */
  const mode: Mode = roles.includes('admin')
    ? 'admin'
    : roles.includes('partner_owner')
      ? 'partner'
      : 'consumer';

  const session = createSession(db, {
    userId: user.id,
    mode,
    surface: input.surface ?? 'web',
    deviceFingerprint: input.deviceFingerprint,
    at,
  });

  return { user, token: session.token, session: session.session, roles };
}

export function createSession(
  db: Db,
  input: { userId: string; mode: Mode; surface: 'web' | 'mobile'; deviceFingerprint?: string; at?: Iso },
): { token: string; session: Session } {
  const at = input.at ?? now();
  const token = newToken();
  const id = newId('ses');

  db.tx(() => {
    let deviceId: string | null = null;
    if (input.deviceFingerprint) {
      const row = db.get<{ id: string }>(`SELECT id FROM devices WHERE fingerprint = $f`, {
        f: input.deviceFingerprint,
      });
      deviceId = row?.id ?? newId('dev');
      if (!row) {
        db.run(
          `INSERT INTO devices (id, fingerprint, first_user_id, first_seen_at, last_seen_at)
           VALUES ($i, $f, $u, $t, $t)`,
          { i: deviceId, f: input.deviceFingerprint, u: input.userId, t: at },
        );
      } else {
        db.run(`UPDATE devices SET last_seen_at = $t WHERE id = $i`, { t: at, i: deviceId });
      }
      db.run(
        `INSERT OR IGNORE INTO device_users (device_id, user_id, seen_at) VALUES ($d, $u, $t)`,
        { d: deviceId, u: input.userId, t: at },
      );
    }

    db.run(
      `INSERT INTO sessions (id, token_hash, user_id, mode, device_id, surface, created_at,
                             last_seen_at, expires_at)
       VALUES ($i, $h, $u, $m, $d, $s, $t, $t, $e)`,
      {
        i: id,
        h: hashToken(token),
        u: input.userId,
        m: input.mode,
        d: deviceId,
        s: input.surface,
        t: at,
        e: plusDays(at, CONFIG.auth.sessionDays),
      },
    );
  });

  return { token, session: db.get<Session>(`SELECT * FROM sessions WHERE id = $i`, { i: id })! };
}

/** Resolve a bearer token, or nothing. Touches `last_seen_at` for idle expiry. */
export function resolveSession(db: Db, token: string, at: Iso = now()): { session: Session; user: User } | null {
  const row = db.get<Session & { token_hash: string }>(
    `SELECT * FROM sessions WHERE token_hash = $h AND revoked_at IS NULL AND expires_at > $t`,
    { h: hashToken(token), t: at },
  );
  if (!row) return null;

  const user = db.get<User>(`SELECT * FROM users WHERE id = $u AND deleted_at IS NULL`, {
    u: row.user_id,
  });
  /* A session pointing at an account that no longer exists is dropped rather
     than honoured — the same rule the site's own `directory.ts` states. */
  if (!user || user.status === 'banned' || user.status === 'erased') return null;

  db.run(`UPDATE sessions SET last_seen_at = $t WHERE id = $i`, { t: at, i: row.id });
  return { session: row, user };
}

export const signOut = (db: Db, sessionId: string, at: Iso = now()): void => {
  db.run(`UPDATE sessions SET revoked_at = $t WHERE id = $i`, { t: at, i: sessionId });
};

/**
 * §1.2 / §9.3. Switch the active mode within one identity.
 *
 * Refused when the account does not hold the role, which is the only check that
 * matters here: the mode is not a permission, it is which of an owner's two
 * lives the session is currently living.
 */
export function setMode(db: Db, sessionId: string, userId: string, mode: Mode): void {
  if (mode === 'partner' && !hasRole(db, userId, 'partner_owner') && !hasRole(db, userId, 'manager')) {
    throw new DomainError('forbidden', 'this account owns no venue');
  }
  if (mode === 'admin' && !hasRole(db, userId, 'admin')) {
    throw new DomainError('forbidden', 'not an admin');
  }
  db.run(`UPDATE sessions SET mode = $m WHERE id = $i`, { m: mode, i: sessionId });
}

export async function changePassword(
  db: Db,
  userId: string,
  current: string,
  next: string,
): Promise<void> {
  const user = getUser(db, userId);
  if (!(await verifyPassword(current, user.password_hash))) {
    throw new DomainError('unauthenticated', 'current password is wrong');
  }
  if (next.length < CONFIG.auth.minPasswordLength) {
    throw new DomainError('validation_failed', 'password is too short', { field: 'password' });
  }
  const hash = await hashPassword(next);
  db.tx(() => {
    db.run(`UPDATE users SET password_hash = $h, updated_at = $t WHERE id = $u`, {
      h: hash,
      t: now(),
      u: userId,
    });
    /* Every other session is dropped: changing a password is what somebody does
       when they think one of those sessions is not theirs. */
    db.run(`UPDATE sessions SET revoked_at = $t WHERE user_id = $u`, { t: now(), u: userId });
  });
}

/* ════════════════════════════════════════════════════════ the profile ══ */

/**
 * A profile is seven answers: a photo, a username, a status line, a city, an
 * email address, a phone number and a birthday.
 *
 * **Nothing here is verified.** No code is sent to the number, no link is
 * clicked in the address, and neither pays anything. The address is what the
 * account signs in with, which is authentication and a different question — a
 * bonus for proving you can read your own email was paying for a formality, and
 * a `phone_verified` column that nothing could ever set to 1 was worse than not
 * asking, because a reader cannot tell "not verified" from "we stopped asking".
 *
 * Three of the seven have rules that are not "is it a string", and they are what
 * the rest of this section is: the username is unique across the product, the
 * city is a choice from a closed set, and the birthday may be corrected once.
 */

/**
 * The age a self-registered account is allowed to be.
 *
 * Thirteen is the floor a service that profiles its users may take a
 * self-declared sign-up at without a parent in the flow; a hundred and twenty is
 * a typo ceiling — nobody is refused by it who is not also refused by physics.
 *
 * They live here rather than in `CONFIG` on purpose: `config.ts` holds what an
 * operator may retune without a deploy, and neither of these is a dial. Moving
 * the floor is a legal decision and moving the ceiling is meaningless.
 */
const MIN_AGE = 13;
const MAX_AGE = 120;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Whole years elapsed between two `YYYY-MM-DD` days, birthday-aware. */
function wholeYears(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const beforeBirthday = tm < fm || (tm === fm && td < fd);
  return ty - fy - (beforeBirthday ? 1 : 0);
}

/**
 * A birthday, or a refusal naming the field.
 *
 * The round-trip through `Date.UTC` is the part that is not decoration:
 * `new Date('2026-02-30')` does not fail, it rolls forward to March 2nd — so a
 * regex plus a parse accepts a date that does not exist and then silently stores
 * a different one. Comparing the components back out is what turns that into a
 * refusal. Everything else is string comparison, which is exact for ISO days and
 * needs no clock.
 */
function checkBirthDate(value: string, at: Iso): string {
  const invalid = (message: string): never => {
    throw new DomainError('validation_failed', message, { field: 'birthDate' });
  };

  if (!DATE_ONLY.test(value)) invalid('a birthday is a date, written YYYY-MM-DD');

  const [y, m, d] = value.split('-').map(Number);
  const round = new Date(Date.UTC(y, m - 1, d));
  if (round.getUTCFullYear() !== y || round.getUTCMonth() !== m - 1 || round.getUTCDate() !== d) {
    invalid('that day does not exist');
  }

  const today = at.slice(0, 10);
  if (value >= today) invalid('a birthday is in the past');

  const age = wholeYears(value, today);
  if (age < MIN_AGE) invalid(`an account holder has to be at least ${MIN_AGE}`);
  if (age > MAX_AGE) invalid('that birthday does not look right');

  return value;
}

/**
 * A phone number, loosely.
 *
 * Deliberately loose, and that is the design rather than a gap. The only thing
 * that could establish a number is a code sent to it, and nothing here sends
 * one — so a strict pattern would buy nothing it does not already lack. It would
 * reject real numbers in formats nobody thought of, and it would still accept a
 * perfectly well-formed number belonging to somebody else. What is being checked
 * is that the field holds a phone number rather than a sentence.
 */
function checkPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 15 || !/^[+()\-\s\d.]+$/.test(value)) {
    throw new DomainError('validation_failed', 'that does not look like a phone number', {
      field: 'phone',
    });
  }
  return value;
}

/** A line, not a paragraph. A column with no ceiling is where a novel lands. */
const HEADLINE_MAX = 140;

/* ─────────────────────────────────────────────────────────── the handle ── */

/**
 * Three to twenty, `a-z 0-9 _`, starting and ending on a letter or a digit and
 * never two underscores together.
 *
 * The ceiling is a display constraint — a handle has to fit beside an avatar on
 * a leaderboard row — and the floor is that two characters is not a name, it is
 * a landgrab on a namespace with one of each. The rest is about *telling two
 * handles apart*: leading, trailing and doubled underscores are invisible at a
 * glance, so `kasia_`, `_kasia` and `kasia__pl` are three ways to look like
 * somebody else, and refusing them costs nobody a name they wanted.
 *
 * ASCII only, and that is the point rather than an oversight. The handle is
 * quoted back at other people — in a leaderboard, in a referral, in a report —
 * and a Cyrillic `а` in an otherwise Latin word is a working impersonation that
 * no amount of case folding catches. The display name beside it is free text in
 * any script the player likes; that one is what they are called, this one is
 * what they *are*.
 */
const USERNAME_MIN = 3;
const USERNAME_MAX = 20;
const USERNAME_SHAPE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

/**
 * Handles the product needs to keep, or that would be a lie to hand out.
 *
 * Two kinds, and it is worth keeping them apart when adding to the list.
 * `admin`, `support`, `security` and `billing` are **claims about who is
 * speaking**, and a player holding one of them is a phishing message that needs
 * no forgery. The rest are surfaces — `api`, `me`, `settings` — that a URL or a
 * client route may want later; giving one away costs a rename with somebody's
 * name on it.
 */
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'moderator', 'mod', 'staff', 'team', 'official',
  'support', 'help', 'helpdesk', 'security', 'billing', 'payments', 'sales',
  'paylez', 'paylezteam', 'paylezsupport', 'operations', 'ops', 'system',
  'root', 'superuser', 'owner', 'partner', 'venue', 'merchant',
  'api', 'www', 'me', 'my', 'settings', 'account', 'login', 'signin', 'signup',
  'about', 'contact', 'privacy', 'terms', 'legal', 'press',
  'null', 'undefined', 'none', 'anonymous', 'guest', 'user', 'everyone', 'all',
  'noreply', 'no_reply', 'postmaster', 'webmaster',
]);

/** The comparison key. Lowercase is total here because the shape is ASCII. */
const foldUsername = (value: string): string => value.trim().toLowerCase();

/**
 * A handle, or a refusal naming the field.
 *
 * Returns both forms because both are stored: what the player typed, so
 * `KasiaPL` is shown back the way she wrote it, and the folded key, so nobody
 * else can be `kasiapl`. That is the arrangement `email` / `email_norm` already
 * uses on this table, and the reason to copy it rather than invent a second one
 * is that the second one is where the two drift.
 */
function checkUsername(value: string): { username: string; norm: string } {
  const username = value.trim();
  const norm = foldUsername(username);
  const invalid = (message: string): never => {
    throw new DomainError('validation_failed', message, { field: 'username' });
  };

  if (norm.length < USERNAME_MIN || norm.length > USERNAME_MAX) {
    invalid(`a username is ${USERNAME_MIN} to ${USERNAME_MAX} characters`);
  }
  if (!USERNAME_SHAPE.test(norm)) {
    invalid('a username is letters, digits and single underscores between them');
  }
  if (RESERVED_USERNAMES.has(norm)) invalid('that username is reserved');

  return { username, norm };
}

/* ───────────────────────────────────────────────────────────── the city ── */

/**
 * Where Paylez operates, and therefore the only cities a profile may name.
 *
 * **A served constant rather than a table**, and the choice is not arbitrary.
 * The set is a product decision that ships with the code — it changes when the
 * business enters a country, which is a deploy either way — and the matching
 * below is a *rule* rather than data, so a table would hold half the answer and
 * leave the half that actually decides things in TypeScript anyway. A table
 * would also drift: a row added to a live database is a city the validator
 * accepts and nothing else in the product has ever heard of. `GET /v1/cities`
 * serves this list so a client can render the picker from the same source the
 * write is checked against.
 *
 * The reason a closed set exists at all is one query. The city weekly board
 * (`domain/social.ts`) groups on `users.city` with a literal `=`, so free text
 * does not produce a messy board — it produces *several* boards, one per
 * spelling, and every player is alone on theirs.
 *
 * Names are the ASCII form already in this database (`venues.city` is `Krakow`
 * and `Warsaw`), because that same literal `=` has to match across the two
 * tables. The local and native spellings are not lost: they are how the entry is
 * *found*, either by folding (`Kraków` → `krakow`) or by the aliases below, for
 * the ones where folding is not enough (`Warszawa`, `München`, `Toshkent`).
 */
export type CityCountry = 'PL' | 'DE' | 'UZ';

interface CityEntry {
  name: string;
  country: CityCountry;
  /** Spellings that do not fold onto `name` — exonyms and endonyms, not typos. */
  also?: readonly string[];
}

const CITY_TABLE: readonly CityEntry[] = [
  /* Poland — the market the rest of the product is written for. */
  { name: 'Warsaw', country: 'PL', also: ['Warszawa'] },
  { name: 'Krakow', country: 'PL', also: ['Cracow'] },
  { name: 'Lodz', country: 'PL' },
  { name: 'Wroclaw', country: 'PL', also: ['Breslau'] },
  { name: 'Poznan', country: 'PL' },
  { name: 'Gdansk', country: 'PL', also: ['Danzig'] },
  { name: 'Gdynia', country: 'PL' },
  { name: 'Sopot', country: 'PL' },
  { name: 'Szczecin', country: 'PL' },
  { name: 'Bydgoszcz', country: 'PL' },
  { name: 'Lublin', country: 'PL' },
  { name: 'Bialystok', country: 'PL' },
  { name: 'Katowice', country: 'PL' },
  { name: 'Czestochowa', country: 'PL' },
  { name: 'Radom', country: 'PL' },
  { name: 'Torun', country: 'PL' },
  { name: 'Sosnowiec', country: 'PL' },
  { name: 'Rzeszow', country: 'PL' },
  { name: 'Kielce', country: 'PL' },
  { name: 'Gliwice', country: 'PL' },
  { name: 'Zabrze', country: 'PL' },
  { name: 'Bytom', country: 'PL' },
  { name: 'Olsztyn', country: 'PL' },
  { name: 'Bielsko-Biala', country: 'PL' },
  { name: 'Rybnik', country: 'PL' },
  { name: 'Opole', country: 'PL' },
  { name: 'Tychy', country: 'PL' },
  { name: 'Zielona Gora', country: 'PL' },
  { name: 'Gorzow Wielkopolski', country: 'PL' },
  { name: 'Plock', country: 'PL' },
  { name: 'Elblag', country: 'PL' },
  { name: 'Walbrzych', country: 'PL' },
  { name: 'Wloclawek', country: 'PL' },
  { name: 'Tarnow', country: 'PL' },
  { name: 'Chorzow', country: 'PL' },
  { name: 'Koszalin', country: 'PL' },
  { name: 'Legnica', country: 'PL' },
  { name: 'Kalisz', country: 'PL' },
  { name: 'Slupsk', country: 'PL' },
  { name: 'Jelenia Gora', country: 'PL' },
  { name: 'Nowy Sacz', country: 'PL' },
  { name: 'Przemysl', country: 'PL' },
  { name: 'Zamosc', country: 'PL' },
  { name: 'Suwalki', country: 'PL' },
  { name: 'Zakopane', country: 'PL' },

  /* Germany. */
  { name: 'Berlin', country: 'DE' },
  { name: 'Hamburg', country: 'DE' },
  { name: 'Munich', country: 'DE', also: ['München', 'Muenchen'] },
  { name: 'Cologne', country: 'DE', also: ['Köln', 'Koeln'] },
  { name: 'Frankfurt', country: 'DE', also: ['Frankfurt am Main'] },
  { name: 'Stuttgart', country: 'DE' },
  { name: 'Dusseldorf', country: 'DE', also: ['Duesseldorf'] },
  { name: 'Leipzig', country: 'DE' },
  { name: 'Dortmund', country: 'DE' },
  { name: 'Essen', country: 'DE' },
  { name: 'Bremen', country: 'DE' },
  { name: 'Dresden', country: 'DE' },
  { name: 'Hanover', country: 'DE', also: ['Hannover'] },
  { name: 'Nuremberg', country: 'DE', also: ['Nürnberg', 'Nuernberg'] },
  { name: 'Duisburg', country: 'DE' },
  { name: 'Bochum', country: 'DE' },
  { name: 'Wuppertal', country: 'DE' },
  { name: 'Bielefeld', country: 'DE' },
  { name: 'Bonn', country: 'DE' },
  { name: 'Munster', country: 'DE', also: ['Muenster'] },
  { name: 'Karlsruhe', country: 'DE' },
  { name: 'Mannheim', country: 'DE' },
  { name: 'Augsburg', country: 'DE' },
  { name: 'Wiesbaden', country: 'DE' },
  { name: 'Monchengladbach', country: 'DE', also: ['Moenchengladbach'] },
  { name: 'Braunschweig', country: 'DE', also: ['Brunswick'] },
  { name: 'Kiel', country: 'DE' },
  { name: 'Chemnitz', country: 'DE' },
  { name: 'Aachen', country: 'DE' },
  { name: 'Halle', country: 'DE', also: ['Halle an der Saale'] },
  { name: 'Magdeburg', country: 'DE' },
  { name: 'Freiburg', country: 'DE', also: ['Freiburg im Breisgau'] },
  { name: 'Krefeld', country: 'DE' },
  { name: 'Mainz', country: 'DE' },
  { name: 'Lubeck', country: 'DE', also: ['Luebeck'] },
  { name: 'Erfurt', country: 'DE' },
  { name: 'Rostock', country: 'DE' },
  { name: 'Kassel', country: 'DE' },
  { name: 'Potsdam', country: 'DE' },
  { name: 'Saarbrucken', country: 'DE', also: ['Saarbruecken'] },
  { name: 'Heidelberg', country: 'DE' },
  { name: 'Regensburg', country: 'DE' },
  { name: 'Wurzburg', country: 'DE', also: ['Wuerzburg'] },
  { name: 'Ulm', country: 'DE' },
  { name: 'Jena', country: 'DE' },

  /* Uzbekistan. Canonical is the international Latin form, because that is what
     the guidebook and the old database already carry; the Uzbek spellings are
     aliases rather than second entries, so one city is one board. */
  { name: 'Tashkent', country: 'UZ', also: ['Toshkent'] },
  { name: 'Samarkand', country: 'UZ', also: ['Samarqand'] },
  { name: 'Bukhara', country: 'UZ', also: ['Buxoro', 'Bukhoro'] },
  { name: 'Namangan', country: 'UZ' },
  { name: 'Andijan', country: 'UZ', also: ['Andijon'] },
  { name: 'Nukus', country: 'UZ' },
  /* One spelling each for the two with an apostrophe in them: the fold strips
     it, so `Farg'ona` and `Fargona` are already the same key. */
  { name: 'Fergana', country: 'UZ', also: ["Farg'ona"] },
  { name: 'Qarshi', country: 'UZ', also: ['Karshi'] },
  { name: 'Kokand', country: 'UZ', also: ["Qo'qon"] },
  { name: 'Margilan', country: 'UZ', also: ['Margilon'] },
  { name: 'Jizzakh', country: 'UZ', also: ['Jizzax'] },
  { name: 'Urgench', country: 'UZ', also: ['Urganch'] },
  { name: 'Navoiy', country: 'UZ', also: ['Navoi'] },
  { name: 'Termez', country: 'UZ', also: ['Termiz'] },
  { name: 'Angren', country: 'UZ' },
  { name: 'Chirchik', country: 'UZ', also: ['Chirchiq'] },
  { name: 'Gulistan', country: 'UZ', also: ['Guliston'] },
  { name: 'Nurafshon', country: 'UZ' },
  { name: 'Khiva', country: 'UZ', also: ['Xiva'] },
  { name: 'Shahrisabz', country: 'UZ' },
  { name: 'Zarafshan', country: 'UZ', also: ['Zarafshon'] },
  { name: 'Bekabad', country: 'UZ', also: ['Bekobod'] },
  { name: 'Denau', country: 'UZ', also: ['Denov'] },
  { name: 'Kagan', country: 'UZ', also: ['Kogon'] },
];

/** The three countries, in the order the table lists them. */
export const CITY_COUNTRIES: readonly CityCountry[] = ['PL', 'DE', 'UZ'];

/** What `GET /v1/cities` serves, and the only shape a client needs. */
export const CITIES: readonly { name: string; country: CityCountry }[] = CITY_TABLE.map(
  ({ name, country }) => ({ name, country }),
);

/**
 * Fold a place name to the key two spellings of it share.
 *
 * NFD-and-strip handles every accented letter that *decomposes* — `ó`, `ą`, `ń`,
 * `ü` — which is most of them and costs nothing to maintain. Three do not, and
 * each is a whole language's worth of near-misses: Polish `ł` has no
 * decomposition at all (`Łódź` would fold to `łodz` and match nothing), German
 * `ß` is two letters, and the Uzbek `ʻ`/`'` in `Farg'ona` is a modifier letter
 * that a keyboard on a phone will and will not produce.
 *
 * Everything else collapses to single spaces, so `Bielsko-Biala`,
 * `Bielsko Biala` and `bielsko—biala` are one place.
 */
const foldCity = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .replace(/ß/g, 'ss')
    .replace(/['‘’ʻ`.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Every spelling that resolves, built once — and every collision named. */
const CITY_INDEX = new Map<string, CityEntry>();
const CITY_CLASHES: string[] = [];
for (const entry of CITY_TABLE) {
  for (const spelling of [entry.name, ...(entry.also ?? [])]) {
    const key = foldCity(spelling);
    const taken = CITY_INDEX.get(key);
    /* Only a clash between *different* cities is a fault. One entry listing two
       spellings that fold together — `Farg'ona` and `Fargona`, which differ only by
       the apostrophe the fold strips — is redundant and harmless, and demanding
       the author pre-apply the fold would defeat the point of an alias list. */
    if (taken && taken !== entry) {
      CITY_CLASHES.push(`${spelling} (${entry.country}) collides with ${taken.name} (${taken.country}) on "${key}"`);
    }
    CITY_INDEX.set(key, entry);
  }
}

/* Two cities folding onto one key would silently make one of them
   unreachable — the picker would offer it and the write would store its
   neighbour. Cheaper to refuse to load than to explain later, and it is the same
   guard `db/countries.ts` earned the hard way on `Congo, Rep.`. */
if (CITY_CLASHES.length > 0) {
  throw new Error('CITY_TABLE has folding spellings: ' + CITY_CLASHES.join('; '));
}

/**
 * A city, or a refusal naming the field.
 *
 * Returns the country with it, because the country is not a second answer: it is
 * a fact about the city, and a profile that could be asked for both is a profile
 * that can hold `Krakow, DE`. `users.country_code` is written from here and
 * never from the request.
 *
 * **Nothing revalidates a row that is already stored.** The old database's
 * cities came over as whatever it held, and a rule applied backwards would make
 * those accounts unsaveable — every PATCH refused over a field the player never
 * touched. The set governs writes; what is already there stays until its owner
 * picks from the list.
 */
export function resolveCity(value: string): { name: string; country: CityCountry } {
  const entry = CITY_INDEX.get(foldCity(value));
  if (!entry) {
    throw new DomainError('validation_failed', 'that city is not one Paylez covers yet', {
      field: 'city',
      countries: CITY_COUNTRIES,
    });
  }
  return { name: entry.name, country: entry.country };
}

/* ────────────────────────────────────────────────────────── the birthday ── */

/**
 * How many times a player may write their own birthday: once to set it, once to
 * fix it.
 *
 * The reason for a limit has not changed — `CONFIG.earn.birthday` pays for one,
 * so an unlimited edit is a bonus collectable every day of the year. What
 * changed is the recognition that a date picker on a phone is a machine for
 * being one day out, and that "contact support" as the answer to a typo made in
 * the first thirty seconds of using the product is a support queue nobody wanted
 * and a player who does not bother. One correction costs the scheme nothing: the
 * second write cannot pay twice, because the occasion pays on the *day*, not on
 * the edit.
 *
 * Counted rather than inferred. `birth_date_set_at` is equally true after one
 * write and after two, so a rule reading it can only ever enforce write-once.
 */
export const BIRTH_DATE_WRITES = 2;

export interface ProfilePatch {
  name?: string;
  username?: string;
  language?: string;
  city?: string;
  avatar?: string | null;
  phone?: string;
  headline?: string;
  /** ISO `YYYY-MM-DD`. Accepted twice: the answer, and one correction. */
  birthDate?: string;
}

/**
 * What makes a profile complete: all seven answers present.
 *
 * Photo, username, status line, city, email, phone, birthday — the whole of what
 * a profile *is*, which is the only definition that survives a field being
 * added. "Most of it" would have to be renegotiated every time the form grows,
 * and a threshold nobody can state is one the client and the server will
 * eventually disagree about.
 *
 * The email is on the list even though every password account has one, because
 * a Google account has one too and a provisional guest has none — so it is the
 * line that says a guest who filled in six fields has not finished, which is
 * true: they have no account yet.
 */
const isProfileComplete = (user: User): boolean =>
  Boolean(
    user.display_avatar &&
      user.username &&
      user.headline &&
      user.city &&
      user.email &&
      user.phone &&
      user.birth_date,
  );

/**
 * Pay for a finished profile, **exactly once**.
 *
 * The same construction as `completeOnboarding`, and for the same reason: the
 * guard is the `UPDATE … WHERE profile_completed_at IS NULL`, evaluated while
 * SQLite holds the write lock, so two saves arriving together race for one row
 * and one of them wins. A read followed by an `if` is the same code with a gap
 * in it wide enough to pay twice.
 *
 * The stamp is never cleared. A profile that has once been complete has been
 * complete, and a grant that could be re-earned by deleting a photo and adding
 * it back is not a grant, it is a faucet.
 */
function payForACompleteProfile(db: Db, user: User, at: Iso): void {
  if (user.profile_completed_at !== null || !isProfileComplete(user)) return;

  const claimed =
    db.run(
      `UPDATE users SET profile_completed_at = $t WHERE id = $u AND profile_completed_at IS NULL`,
      { t: at, u: user.id },
    ).changes === 1;
  if (!claimed) return;

  ledger.earn(db, {
    userId: user.id,
    points: CONFIG.earn.profileComplete,
    reason: 'profile_bonus',
    sourceKind: 'profile',
    sourceRef: user.id,
    at,
  });
}

/**
 * Edit the profile.
 *
 * Four of these fields are not "is it a string", and each rule is also in the
 * schema at the column it belongs to:
 *
 * **A username is unique, ignoring case.** Checked here for the refusal a client
 * can act on — a `conflict` naming the field — and enforced by
 * `idx_users_username_norm` for the case this check cannot see: two people
 * claiming one handle in the same millisecond. The unique index is what is
 * *true*; the lookup is what is *helpful*, and the `catch` below is what stops
 * the race surfacing as a raw SQLite constraint message.
 *
 * **A city is a choice.** `resolveCity` maps whatever was typed onto one of
 * `CITIES` and hands back the country with it, so `country_code` is written from
 * the city rather than answered separately and the two cannot disagree.
 *
 * **A birthday may be corrected once.** The counter is the rule; see
 * `BIRTH_DATE_WRITES`. The refusal names support rather than pretending the
 * correction is impossible, because a third change is a human decision about
 * somebody's identity and that is exactly the kind that does not belong on an
 * endpoint.
 *
 * **Finishing it pays.** `CONFIG.earn.profileComplete`, once, inside the same
 * transaction as the write that finished it — so the grant and the fact it is
 * paid for either both happened or neither did.
 */
export function updateProfile(
  db: Db,
  userId: string,
  patch: ProfilePatch,
  at: Iso = now(),
): User {
  const user = getUser(db, userId);

  const headline = patch.headline?.trim();
  if (headline !== undefined && headline.length > HEADLINE_MAX) {
    throw new DomainError('validation_failed', `a headline is at most ${HEADLINE_MAX} characters`, {
      field: 'headline',
      max: HEADLINE_MAX,
    });
  }

  const handle = patch.username === undefined ? null : checkUsername(patch.username);
  if (handle && handle.norm !== user.username_norm) {
    const taken = db.get(`SELECT 1 FROM users WHERE username_norm = $n AND id <> $u`, {
      n: handle.norm,
      u: userId,
    });
    if (taken) {
      throw new DomainError('conflict', 'that username is taken', { field: 'username' });
    }
  }

  const city = patch.city === undefined ? null : resolveCity(patch.city);
  const phone = patch.phone === undefined ? null : checkPhone(patch.phone.trim());

  let birthDate: string | null = null;
  if (patch.birthDate !== undefined) {
    const wanted = checkBirthDate(patch.birthDate.trim(), at);
    /* Writing the same day back is not a change and does not spend anything.
       That is what lets a client PATCH its whole profile on every save — the
       alternative is an account whose one correction was consumed by a form
       resending a field nobody touched, which is a support ticket caused
       entirely by the rule meant to avoid them. */
    if (wanted !== user.birth_date) {
      if (user.birth_date_changes >= BIRTH_DATE_WRITES) {
        throw new DomainError(
          'conflict',
          'a birthday can be corrected once — contact support to have it changed again',
          { field: 'birthDate' },
        );
      }
      birthDate = wanted;
    }
  }

  return db.tx(() => {
    try {
      db.run(
        `UPDATE users
            SET display_name = COALESCE($n, display_name),
                username = COALESCE($un, username),
                username_norm = COALESCE($unn, username_norm),
                language = COALESCE($l, language),
                city = COALESCE($c, city),
                /* From the city, never from the request: see resolveCity. */
                country_code = COALESCE($cc, country_code),
                display_avatar = COALESCE($a, display_avatar),
                headline = COALESCE($hd, headline),
                phone = COALESCE($ph, phone),
                birth_date = COALESCE($bd, birth_date),
                /* When it was last written, which is now one of two moments. */
                birth_date_set_at = CASE WHEN $bd IS NULL THEN birth_date_set_at ELSE $t END,
                /* The right-hand side reads the row as it was, so this counts
                   the write that is happening. The ceiling is checked above; the
                   column is the record, not the guard. */
                birth_date_changes = birth_date_changes + CASE WHEN $bd IS NULL THEN 0 ELSE 1 END,
                updated_at = $t
          WHERE id = $u`,
        {
          n: patch.name?.trim() || null,
          un: handle?.username ?? null,
          unn: handle?.norm ?? null,
          l: patch.language ?? null,
          c: city?.name ?? null,
          cc: city?.country ?? null,
          a: patch.avatar ?? null,
          hd: headline || null,
          ph: phone,
          bd: birthDate,
          t: at,
          u: userId,
        },
      );
    } catch (error) {
      /* The race the lookup above cannot see. Re-thrown as the same refusal the
         lookup would have given, so a client never has to read SQLite's own
         wording to find out which field it was. Anything else is somebody
         else's problem and is rethrown untouched. */
      if (String((error as Error).message).includes('users.username_norm')) {
        throw new DomainError('conflict', 'that username is taken', { field: 'username' });
      }
      throw error;
    }

    /* Read back before deciding: completeness is a fact about the row as it now
       is, and half of it may have arrived in this very patch. */
    const updated = getUser(db, userId);
    payForACompleteProfile(db, updated, at);
    return getUser(db, userId);
  });
}
