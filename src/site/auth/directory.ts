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
import type { Account } from './context';
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
 * The `player` backfill lives here rather than beside the one in
 * `AuthProvider.stored()`, because there are two boundaries the old shape can
 * come through and that comment only ever knew about one. `player` arrived
 * after the first rows were written, `isRecord` above does not check it (it
 * validates six fields and `player` is not one of them), and *this* is the
 * function `signIn` uses — so a directory row written by an earlier build gave
 * an individual an account with no `player` at all. Every screen that reads it
 * bails: `GamesApp` and `WalletApp` both `return null` on a missing player,
 * which renders no `<main>`, and `.site > main` is the only element the sheet
 * gives `z-index: 1`. The symptom is a blank page under a working header, on
 * sign-in, with nothing in the console.
 */
export function toAccount(user: UserRecord): Account {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    type: user.type,
    business: user.business,
    player: user.type === 'individual' ? (user.player ?? seedPlayer()) : user.player,
  };
}
