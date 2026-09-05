/**
 * Where the accounts actually live between visits.
 *
 * `users.ts` holds the shape and the pure rules; this is the stored directory
 * and the only module that talks to `localStorage` about accounts. Two keys, and
 * they are different things:
 *
 *   `paylez-session`  — who is signed in *on this device* (`AuthProvider`).
 *   `paylez-users`    — everyone who exists (this file).
 *
 * Splitting them is what makes signing up mean something. Before, the session
 * was the whole world: signing out and back in rebuilt the account from a seed,
 * and there was nowhere for anybody else to be. Now the session is a pointer
 * into a directory that outlives it.
 *
 * See `users.ts` for why none of this is authentication. Passwords are written
 * here in plain text.
 */
import { EMPTY_PROFILE, type Account } from './context';
import { SEED_USERS, type UserRecord } from './users';
import { newPlayer } from './player';

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
 * The accounts a build no longer ships, deleted from this device on next read.
 *
 * Removing a seed from `users.ts` stops it being *written*; it does nothing
 * about the copy already sitting in `localStorage` on every browser that has
 * been here, and a stored row wins over the seed by design — so the demo café
 * and the demo player would have outlived their own deletion on exactly the
 * devices that had seen them. These two ids are what those rows were. The sweep
 * is by id rather than by address because the address is the one field their
 * owner could have edited.
 *
 * This list is append-only and must never be reused: an id here is an id no
 * future account may be given, or that account is deleted on first read.
 */
export const RETIRED_IDS: ReadonlySet<string> = new Set(['u_marta', 'u_dilnoza', 'u_admin']);

/**
 * Everyone, stored rows first.
 *
 * A stored copy of a seeded account **wins** over the seed — which is how a
 * venue's listing keeps the edits its owner made rather than snapping back to a
 * shipped one on every reload. Seeds missing from storage are appended, which
 * is how a new one would reach somebody who has been here before. `SEED_USERS`
 * is empty and the merge is a no-op over it; the mechanism stays because the
 * emptiness is a decision, not a property of the code.
 */
export function listUsers(): UserRecord[] {
  let stored: UserRecord[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) stored = parsed.filter(isRecord);
  } catch {
    // Private mode, or a shape this code no longer understands. An empty
    // directory is a working site; a thrown error here is a blank page.
  }

  /* Written back, not just filtered on the way out: a purge that ran on every
     read and never persisted would leave the rows there for any other reader of
     the key — and there is one, the operator's console. */
  const live = stored.filter((user) => !RETIRED_IDS.has(user.id));
  if (live.length !== stored.length) writeAll(live);

  const known = new Set(live.map((user) => user.id));
  return [...live, ...SEED_USERS.filter((seed) => !known.has(seed.id))];
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
    /* `newPlayer`, not the demo state: a stored row that predates `player`
       belongs to somebody who has played nothing, and backfilling them a wallet
       would be inventing a history for a real account. */
    player: user.type === 'individual' ? (user.player ?? newPlayer()) : user.player,
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
    /*
     * And here absent and `null` are the *same* answer, which is the opposite
     * of the stamp above and worth saying why.
     *
     * `onboardedAt` reads absent as the join date because a returning player
     * has demonstrably been through onboarding -- the evidence is the streak.
     * A profile carries no such evidence: a row written before this field
     * existed says nothing about whether all seven were filled, and the
     * profile itself is right there to answer it. So absent is `null`, and if
     * the seven are in fact complete the next save stamps it and pays once.
     * The server's own guard means a second payment cannot land either way.
     */
    profileCompletedAt: user.profileCompletedAt ?? null,
  };
}
