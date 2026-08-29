/**
 * Where the accounts actually live between visits.
 *
 * `users.ts` holds the three seeded people and the pure rules; this is the
 * stored directory those seeds are merged into, and the only module that talks
 * to `localStorage` about accounts. Two keys now, and they are different things:
 *
 *   `paylez-session`  — who is signed in *on this device* (`AuthProvider`).
 *   `paylez-users`    — everyone who exists (this file).
 *
 * Splitting them is what makes signing up mean something. Before, the session
 * was the whole world: signing out and back in rebuilt the account from a seed,
 * and there was nowhere for a fourth person to be. Now the session is a pointer
 * into a directory that outlives it — which is also why the admin console has
 * anything to show.
 *
 * See `users.ts` for why none of this is authentication. Passwords are written
 * here in plain text, next to the ones already in the bundle.
 */
import { EMPTY_PROFILE, type Account } from './context';
import { SEED_USERS, type UserRecord } from './users';
import { seedPlayer } from './player';

const STORAGE_KEY = 'paylez-users';

/**
 * Shallow, like the session's own guard.
 *
 * Deliberately checks the fields the app branches on and lets the rest through:
 * this store is written by this same code, so the realistic failure is a stale
 * shape after a deploy rather than a hostile payload, and the honest answer to a
 * row this code no longer understands is to drop it.
 */
function isRecord(value: unknown): value is UserRecord {
  if (typeof value !== 'object' || value === null) return false;
  const user = value as Partial<UserRecord>;
  return (
    typeof user.id === 'string' &&
    typeof user.name === 'string' &&
    typeof user.email === 'string' &&
    typeof user.password === 'string' &&
    typeof user.created === 'string' &&
    (user.type === 'individual' ||
      user.type === 'business' ||
      user.type === 'admin' ||
      user.type === null) &&
    (user.business === null || typeof user.business === 'object')
  );
}

/**
 * Everyone, stored rows first.
 *
 * A stored copy of a seeded account **wins** over the seed — that is how the
 * café's listing keeps the edits its owner made rather than snapping back to the
 * shipped one on every reload. Seeds missing from storage are appended, which is
 * how a *new* seeded account reaches somebody who has been here before: without
 * it, anyone with a `paylez-users` key written by an earlier build could never
 * sign in as the admin.
 */
export function listUsers(): UserRecord[] {
  let stored: UserRecord[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) stored = parsed.filter(isRecord);
  } catch {
    // Private mode, or a shape this code no longer understands. The seeds alone
    // are a working site; a thrown error here is a blank page.
  }

  const known = new Set(stored.map((user) => user.id));
  return [...stored, ...SEED_USERS.filter((seed) => !known.has(seed.id))];
}

function writeAll(users: UserRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  } catch {
    // Not being able to remember an account across a refresh is not worth
    // failing over — the session in memory still works for this visit.
  }
}

/** Add a row. The caller has already validated it against `listUsers()`. */
export function addUser(user: UserRecord): void {
  writeAll([...listUsers(), user]);
}

/**
 * Merge a patch into one row.
 *
 * Every write-through from the session comes here — choosing an account type,
 * saving the listing, banking a round, spending a voucher. Without it those
 * changes would live only in `paylez-session` and vanish on sign-out, and the
 * admin console would be reading a directory that disagreed with the app.
 */
export function patchUser(id: string, patch: Partial<UserRecord>): void {
  writeAll(listUsers().map((user) => (user.id === id ? { ...user, ...patch } : user)));
}

/**
 * The session's view of a row: everything except the secret and the join date.
 *
 * **Every backfill for an old shape lives here, and here only.** It used to be
 * two places — this and `AuthProvider.stored()` — and the split was the bug:
 * `player` arrived after the first rows were written, `isRecord` above does not
 * check it (it validates six fields and `player` is not one of them), and the
 * copy in `stored()` only guarded the *session* boundary. A directory row
 * written by an earlier build therefore gave an individual an account with no
 * `player` at all on the sign-in path. Every screen that reads it bails:
 * `GamesApp` and `WalletApp` both `return null` on a missing player, which
 * renders no `<main>`, and `.site > main` is the only element the sheet gives
 * `z-index: 1` — a blank page under a working header, with nothing in the
 * console. `stored()` now rebuilds the session through this function rather
 * than parsing its own copy, so there is one boundary and one answer.
 */
export function toAccount(user: UserRecord): Account {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    type: user.type,
    business: user.business,
    player: user.type === 'individual' ? (user.player ?? seedPlayer()) : user.player,
    /* Same backfill, same reason: the profile postdates the stored shape and
       every field on it is a string the form is about to render. A missing one
       is an empty profile, not a page that throws reading `.username` of
       undefined. */
    profile: user.profile ?? EMPTY_PROFILE,
    /*
     * The one backfill where absent and `null` are **different answers**, and
     * getting it the other way round is a bug with a face on it: reading a
     * missing stamp as `null` would take every individual who signed up before
     * onboarding existed — a week of streak, a wallet with vouchers in it — and
     * hold them at a welcome tour they have already outgrown, then pay them the
     * once-only gift for finishing it.
     *
     * So absent is read as the day they joined, which is a date that is true.
     * `null` is left exactly as it is, because a row that says `null` was
     * written by a build that knew the difference.
     */
    onboardedAt: user.onboardedAt === undefined ? user.created : user.onboardedAt,
  };
}
