/**
 * The account directory's shape, and the rules for adding to it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS NOT AUTHENTICATION. Anything typed into the sign-up form is kept in
 * plain text in `localStorage` (see `directory.ts`). It exists so an account
 * opened while the backend is unreachable is not lost, and it must be replaced
 * by the server before this site is pointed at anybody's data.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **There are no seeded accounts, and there must not be any.** There were two —
 * a Kraków café owner with a finished listing, and a player with 1,240 points
 * and a seven-day streak — and their passwords shipped in the bundle where
 * anybody could read them. The argument for them was that the signed-in screens
 * are worth looking at, and it was a good argument while `localStorage` was the
 * whole account system. It stopped being one when `server/` arrived: those are
 * working credentials to a system that hashes them, the venue was a real
 * business's name on a listing nobody at that business had written, and the
 * points were a balance the ledger had no entry for. Every screen they existed
 * to demonstrate now has an empty state that says the true thing instead.
 *
 * What is left is the *shape* — `UserRecord`, `newUser`, `findUser`,
 * `validateSignUp`. React-free and storage-free on purpose, the way
 * `business.ts` and `player.ts` beside it are, so `npm run verify` can check
 * the rules without a browser. Persistence lives in `directory.ts`.
 */
import { isEmail, type BusinessProfile } from './business';
import { newPlayer, type PlayerState } from './player';
import { EMPTY_PROFILE } from './context';
import type { AccountType, UserProfile } from './context';

/**
 * One row of the directory: an account plus the two things a session does not
 * carry — the secret, and when the account was opened.
 *
 * `type` may still be `null`, and that is not dead weight. Sign-up now asks the
 * individual-or-business question before the account exists, so nothing *new*
 * arrives undecided; a session written by the build before this one can, and the
 * sign-in page still knows how to finish it.
 */
export interface UserRecord {
  id: string;
  name: string;
  email: string;
  /** Plain text, and see above. Hashing it here would only look like security. */
  password: string;
  /** `YYYY-MM-DD`. What the admin console's "joined" column reads. */
  created: string;
  type: AccountType | null;
  business: BusinessProfile | null;
  player: PlayerState | null;
  /**
   * What this person has told us about themselves.
   *
   * Optional for the reason `PlayerState.freezes` is: it postdates the stored
   * shape, so a row written by an earlier build has no such field, and
   * `toAccount` reads a missing one as `EMPTY_PROFILE` rather than as a crash
   * on a page somebody was already looking at.
   */
  profile?: UserProfile;
  /**
   * When onboarding was finished, or `null` if it has not been.
   *
   * Optional *and* nullable, and the two states are different answers rather
   * than one written twice. `null` is "this account has not been through it",
   * which is what `resolveRoute` holds a new player on. **Absent** is "this row
   * predates onboarding existing", and `toAccount` reads that as the day the
   * account was opened — because sending a returning player with a week's
   * streak through a welcome tour, and paying them the welcome gift for it, is
   * the wrong reading of a schema change they had no part in.
   */
  onboardedAt?: string | null;
}

/**
 * Nobody, and that is the whole of it.
 *
 * Kept as an exported empty array rather than deleted, because the directory
 * still has to merge "seeds a stored directory has not seen" into what it
 * finds in `localStorage` — the merge is the mechanism, and it is correct over
 * an empty set. Putting a row back here puts a password back in the bundle;
 * see the header.
 */
export const SEED_USERS: UserRecord[] = [];

/*
 * There was a `DEMO_USERS` export here, and the sign-in form printed it.
 *
 * The argument for it was that the passwords shipped in the bundle either way,
 * so showing them cost nothing and saved everyone guessing. It stopped being
 * true when `server/` arrived: those became credentials to a system that hashes
 * them, and a working pair printed on the front door is a working pair whoever
 * reads it. The export went first, and then — for the same reason carried one
 * step further — the accounts it advertised. See the header.
 */

/**
 * Why a sign-in did not happen.
 *
 * `offline` is the third because the first two are both claims about what
 * somebody *typed*, and there is a case where nothing they typed was the
 * problem: the server could not be reached, so nobody has looked at it.
 * Reporting that as a wrong password sends a person to check a credential that
 * was correct — which is a worse failure than saying nothing, and it is the one
 * this union existed without for exactly as long as it took to hit it.
 */
export type SignInError = 'email' | 'password' | 'offline';
export type SignUpError = 'name' | 'email' | 'taken' | 'password' | 'type';

/** Short enough to type, long enough not to be a typo. */
export const MIN_PASSWORD = 6;

/** Addresses differing only in case or surrounding space are one address. */
export const sameEmail = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** Case-insensitive on the address, exact on the secret. */
export function findUser(
  users: UserRecord[],
  email: string,
  password: string,
): { ok: true; user: UserRecord } | { ok: false; error: SignInError } {
  const match = users.find((user) => sameEmail(user.email, email));
  if (!match) return { ok: false, error: 'email' };
  if (match.password !== password) return { ok: false, error: 'password' };
  return { ok: true, user: match };
}

export function emailTaken(users: UserRecord[], email: string): boolean {
  return users.some((user) => sameEmail(user.email, email));
}

/**
 * What sign-up may ask for.
 *
 * `admin` is deliberately not in it, at the type level rather than in a check:
 * the console is not something a visitor opens an account into, and a form that
 * *could* produce one is a form somebody eventually will.
 */
export type ChoosableType = Exclude<AccountType, 'admin'>;

export interface SignUpDraft {
  name: string;
  email: string;
  password: string;
  type: ChoosableType | null;
}

/**
 * What is wrong with a sign-up, or `null` if nothing is.
 *
 * In the order the form reads, so the message always points at the first field
 * that needs attention rather than the last one checked. `isEmail` is the same
 * loose test the business listing uses — it catches a typo, not a fake domain,
 * and rejecting a valid address is the worse failure here.
 */
export function validateSignUp(
  users: UserRecord[],
  draft: SignUpDraft,
): SignUpError | null {
  if (!draft.name.trim()) return 'name';
  if (!isEmail(draft.email)) return 'email';
  if (emailTaken(users, draft.email)) return 'taken';
  if (draft.password.length < MIN_PASSWORD) return 'password';
  if (draft.type === null) return 'type';
  return null;
}

/**
 * Build the row a sign-up adds to the directory.
 *
 * Pure, and takes its id and date rather than reading a clock, so `verify` can
 * check the shape it produces. The two branches at the bottom are the same rule
 * the rest of the session follows: a player state exists from the moment someone
 * says they are here to play, because an empty wallet cannot show what a wallet
 * is for — and a listing does *not*, because `business === null` is precisely
 * what sends a new owner through setup.
 */
export function newUser(
  draft: SignUpDraft & { type: ChoosableType },
  id: string,
  created: string,
): UserRecord {
  return {
    id,
    name: draft.name.trim(),
    email: draft.email.trim(),
    password: draft.password,
    created,
    type: draft.type,
    business: null,
    /* `newPlayer`, and this is the line the whole separation exists for: this
       is what a sign-up produces. There was a `seedPlayer` beside it — a
       furnished demo wallet built from the catalogue in `content.ts` — and a
       build once called it from here and handed 340 points to every sign-up.
       Both the function and the catalogue are gone; a wallet is
       `GET /v1/wallet` now, so there is nothing left to furnish. */
    player: draft.type === 'individual' ? newPlayer() : null,
    profile: { ...EMPTY_PROFILE },
    /*
     * `null` and not absent, and the difference is the whole of the onboarding
     * hold. Absent means "this row predates the field" and is read as the join
     * date; `null` means "has not been through it", which is what
     * `resolveRoute` sends a new individual to `#/welcome` on. A new account is
     * the one case where we *know* which of the two it is.
     *
     * Set for a business account too, which is not dead weight: an owner is
     * exempt from the hold by type rather than by this field, so writing
     * `null` here keeps the row honest — nobody has been through onboarding —
     * without claiming an owner ever will be.
     */
    onboardedAt: null,
  };
}

/* ═══════════════════════════════════════════════════════════ the profile ══ */

/**
 * The rules the seven profile answers have to satisfy.
 *
 * **These are the server's rules, restated.** `server/domain/accounts.ts` is
 * where they are enforced against a real database; this file is where the
 * prototype's `localStorage` directory enforces them, because there is nowhere
 * else for it to ask. The two copies exist for as long as the two directories
 * do — see the banner at the top of this file — and the day the site's auth
 * moves to the server, this section is what stops being read. **Until then a
 * change to one is a change to the other**, and the failure of forgetting is
 * quiet in one direction only: a value this file accepts and the server refuses
 * is a save that works today and breaks on the wire later.
 *
 * Pure and storage-free, like everything else here, so `npm run verify` owns
 * them rather than a browser.
 */

/**
 * What somebody does, as a closed set — `occupation` on the server.
 *
 * A five-option list and not the free line that used to sit here. The line was
 * a paragraph nobody read and nothing could group on; this is a fact about a
 * person that a venue can actually target an offer at, and the same five values
 * the server stores. Kept in *this* order because it is the order the menu
 * offers them in, and `other` is last for the reason a catch-all always is.
 *
 * **The column is `occupation`; the label on the form is "Status".** `status`
 * is already the account state, so the two names are deliberately different —
 * a label is what a reader is asked, a column is what the row is called.
 */
export const OCCUPATIONS = ['student', 'worker', 'business', 'freelancer', 'other'] as const;

export type Occupation = (typeof OCCUPATIONS)[number];

/**
 * Whether a stored string is still one of the five.
 *
 * Needed because a profile read back out of `localStorage` is whatever an older
 * build wrote there — including the `headline` prose this field replaced. A row
 * carrying one is read as unanswered rather than as a sixth option nothing has
 * a label for.
 */
export function isOccupation(value: string): value is Occupation {
  return (OCCUPATIONS as readonly string[]).includes(value);
}

/**
 * How many times a player may write their own birthday: once to set it, once to
 * fix it. `BIRTH_DATE_WRITES` on the server, and the reason is the same — a
 * date picker is a machine for being one day out, and "contact support" as the
 * answer to a typo made in the first minute is a queue nobody wanted.
 */
export const BIRTH_DATE_WRITES = 2;

/** The floor a self-declared sign-up may be, and the typo ceiling above it. */
export const MIN_AGE = 13;
export const MAX_AGE = 120;

/* Three to twenty, `a-z 0-9 _`, starting and ending on a letter or digit and
   never two underscores together. The ceiling is a display constraint — a
   handle has to fit beside an avatar on a leaderboard row — and the rest is
   about telling two handles apart: `kasia_`, `_kasia` and `kasia__pl` are three
   ways to look like somebody else. */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const USERNAME_SHAPE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

/**
 * Handles the product keeps, copied from `RESERVED_USERNAMES` on the server.
 *
 * Verbatim rather than shortened, and that is the point: a *subset* would
 * contradict nothing and still hand somebody a name that is refused the first
 * time this account is written to a real server. Two kinds in it — `admin`,
 * `support`, `security` and `billing` are claims about who is speaking, and a
 * player holding one is a phishing message that needs no forgery; the rest are
 * surfaces a URL may want later.
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

/** The comparison key. Lowercasing is total here because the shape is ASCII. */
export const foldUsername = (value: string): string => value.trim().toLowerCase();

export type UsernameError = 'length' | 'shape' | 'reserved' | 'taken';

/**
 * A handle, or the reason it is not one.
 *
 * Returns both forms because both are stored: what was typed, so `KasiaPL` is
 * shown back the way she wrote it, and the folded key, so nobody else can be
 * `kasiapl`. Taking the directory as an argument rather than reading it keeps
 * this pure — uniqueness is a fact about a set of rows, and the set is the
 * caller's to supply.
 *
 * `self` is the id of the account doing the writing, so saving a profile
 * without changing the handle is not a clash with oneself.
 */
export function checkUsername(
  users: UserRecord[],
  value: string,
  self: string,
): { ok: true; username: string; norm: string } | { ok: false; error: UsernameError } {
  const username = value.trim();
  const norm = foldUsername(username);

  if (norm.length < USERNAME_MIN || norm.length > USERNAME_MAX) {
    return { ok: false, error: 'length' };
  }
  if (!USERNAME_SHAPE.test(norm)) return { ok: false, error: 'shape' };
  if (RESERVED_USERNAMES.has(norm)) return { ok: false, error: 'reserved' };

  const taken = users.some(
    (user) => user.id !== self && foldUsername(user.profile?.username ?? '') === norm,
  );
  if (taken) return { ok: false, error: 'taken' };

  return { ok: true, username, norm };
}

export type BirthDateError = 'format' | 'nonexistent' | 'future' | 'young' | 'old';

/** Whole years elapsed between two `YYYY-MM-DD` days, birthday-aware. */
function wholeYears(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const beforeBirthday = tm < fm || (tm === fm && td < fd);
  return ty - fy - (beforeBirthday ? 1 : 0);
}

/**
 * A birthday, or the reason it is not one.
 *
 * The round-trip through `Date.UTC` is the part that is not decoration:
 * `new Date('2026-02-30')` does not fail, it rolls forward to March 2nd — so a
 * regex plus a parse accepts a day that does not exist and then stores a
 * different one. Comparing the components back out is what turns that into a
 * refusal. Everything else is string comparison, exact for ISO days.
 *
 * `today` is passed rather than read off a clock, for the same reason `newUser`
 * takes its date: a function that reads the time cannot be checked.
 */
export function checkBirthDate(
  value: string,
  today: string,
): { ok: true; date: string } | { ok: false; error: BirthDateError } {
  const date = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'format' };

  const [y, m, d] = date.split('-').map(Number);
  const round = new Date(Date.UTC(y, m - 1, d));
  if (round.getUTCFullYear() !== y || round.getUTCMonth() !== m - 1 || round.getUTCDate() !== d) {
    return { ok: false, error: 'nonexistent' };
  }

  if (date >= today) return { ok: false, error: 'future' };

  const age = wholeYears(date, today);
  if (age < MIN_AGE) return { ok: false, error: 'young' };
  if (age > MAX_AGE) return { ok: false, error: 'old' };

  return { ok: true, date };
}

/**
 * A phone number, loosely — and the looseness is the design rather than a gap.
 *
 * The only thing that could establish a number is a code sent to it, and
 * nothing here sends one, so a strict pattern would buy nothing it does not
 * already lack: it would reject real numbers in formats nobody thought of, and
 * still accept a well-formed number belonging to somebody else. What is checked
 * is that the field holds a phone number rather than a sentence.
 */
export function isPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 15 && /^[+()\-\s\d.]+$/.test(value);
}

/** The seven answers, in the order the form asks them. */
export type ProfileField =
  | 'avatar'
  | 'username'
  | 'occupation'
  | 'city'
  | 'email'
  | 'phone'
  | 'birthDate';

/**
 * Which of the seven are still blank.
 *
 * **All seven, or it is not finished.** That is the only definition of complete
 * that survives a field being added: "most of it" has to be renegotiated every
 * time the form grows, and a threshold nobody can state is one the client and
 * the server will eventually disagree about. It is also the server's own
 * definition (`isProfileComplete`), which matters because the server *pays* for
 * a complete profile — a meter here that read 100% while the bonus had not
 * landed would be the site calling the server wrong.
 *
 * `email` is one of the seven and is not on `UserProfile`: it lives on the
 * account, because it is what signs in. It is on the list anyway, for the case
 * the server has and this prototype does not — an identity with no address at
 * all — so the two lists stay the same list.
 */
export function profileGaps(profile: UserProfile, email: string): ProfileField[] {
  const answered: Record<ProfileField, string> = {
    avatar: profile.avatar,
    username: profile.username,
    occupation: profile.occupation,
    city: profile.city,
    email,
    phone: profile.phone,
    birthDate: profile.birthDate,
  };
  return (Object.keys(answered) as ProfileField[]).filter((field) => !answered[field]);
}

/** Whole percent of the seven that are answered. Rounded down, so 6/7 is 85 —
 *  a meter that reads 100 while something is missing is worse than one that
 *  rounds mean. */
export const profilePercent = (profile: UserProfile, email: string): number =>
  Math.floor(((7 - profileGaps(profile, email).length) / 7) * 100);

/**
 * What the welcome gift is worth, mirroring `CONFIG.earn.onboarding`.
 *
 * It is paid for *finishing onboarding* rather than for signing up, and that is
 * a rule about farming rather than about generosity: an address and a password
 * can be produced in bulk, and a bonus attached to producing them funds a farm.
 * Finishing onboarding cannot be done twice by one account, which is what makes
 * it a reasonable thing to pay for — provided "cannot be done twice" is
 * actually enforced, which is `finishOnboarding` in `AuthProvider`.
 */
export const WELCOME_POINTS = 100;
