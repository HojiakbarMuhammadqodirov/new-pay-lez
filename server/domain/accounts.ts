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
  password_hash: string | null;
  language: string;
  city: string | null;
  country_code: string | null;
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
  const hash = await hashPassword(input.password);
  const id = newId('usr');

  db.tx(() => {
    db.run(
      `INSERT INTO users (id, email, email_norm, display_name, password_hash, auth_provider,
                          language, city, status, created_at, updated_at)
       VALUES ($i, $e, $n, $d, $h, 'email', $l, $c, 'active', $t, $t)`,
      {
        i: id,
        e: input.email.trim(),
        n: email,
        d: input.name.trim(),
        h: hash,
        l: input.language ?? 'en',
        c: input.city ?? null,
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

    ledger.earn(db, {
      userId: id,
      points: CONFIG.points.welcomeBonus,
      reason: 'welcome_bonus',
      sourceKind: 'signup',
      sourceRef: id,
      at,
    });

    db.run(
      `INSERT INTO player_states (user_id, streak, longest_streak, freezes, lives, answered, correct, updated_at)
       VALUES ($u, 0, 0, 0, $l, 0, 0, $t)`,
      { u: id, l: CONFIG.points.dailyLives, t: at },
    );
  });

  return getUser(db, id);
}

export interface SignedIn {
  user: User;
  token: string;
  session: Session;
  roles: Role[];
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

export function updateProfile(
  db: Db,
  userId: string,
  patch: { name?: string; language?: string; city?: string; avatar?: string | null },
  at: Iso = now(),
): User {
  db.run(
    `UPDATE users
        SET display_name = COALESCE($n, display_name),
            language = COALESCE($l, language),
            city = COALESCE($c, city),
            display_avatar = COALESCE($a, display_avatar),
            updated_at = $t
      WHERE id = $u`,
    {
      n: patch.name?.trim() || null,
      l: patch.language ?? null,
      c: patch.city ?? null,
      a: patch.avatar ?? null,
      t: at,
      u: userId,
    },
  );
  return getUser(db, userId);
}
