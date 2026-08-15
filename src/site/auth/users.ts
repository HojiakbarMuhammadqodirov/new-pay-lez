/**
 * The seeded account directory, and the rules for adding to it.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS NOT AUTHENTICATION. The credentials below ship inside the JavaScript
 * bundle, which means every visitor already has them — view-source is enough,
 * and anything typed into the sign-up form is kept beside them in plain text in
 * `localStorage` (see `directory.ts`). It exists so the prototype has a front
 * door and so the signed-in screens can be looked at, and it must be replaced by
 * a real server before this site is pointed at anybody's data.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Three seeded people, one per kind of account, because "what a signed-in
 * account looks like" is now three different answers: an admin gets the console,
 * an owner gets a venue with a finished listing behind it, an individual gets a
 * wallet with something in it. Each is *furnished* rather than blank — a demo
 * account that lands on an empty dashboard demonstrates nothing.
 *
 * This module is React-free and storage-free on purpose, the way `business.ts`
 * and `player.ts` beside it are: the seeds and the validation are pure data and
 * pure functions, so `npm run verify` can check them. Persistence — the users
 * who signed up, and the edits the seeded three make to their own state — lives
 * in `directory.ts`.
 */
import { isEmail, type BusinessProfile } from './business';
import { seedPlayer, type PlayerState } from './player';
import type { AccountType } from './context';

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
}

/**
 * The venue behind `user1`.
 *
 * A real listing rather than a blank one: every required field is filled, so the
 * owner lands on a dashboard that is *working* — 100% complete, live in the app,
 * app preview populated — instead of on a form. The two optional link fields are
 * left empty on purpose; a small café with no iOS app is the ordinary case, and
 * a listing where literally everything is filled would hide the fact that some
 * of it is optional.
 *
 * Kraków, in złoty, in Polish: the operator is where the operator is. The price
 * is free text the owner types, which is the one figure on this site that is not
 * converted for the reader — it is a sign in their window, not our number.
 */
const BRATYSLAWSKA: BusinessProfile = {
  name: 'Kawiarnia Bratysławska',
  category: 'cafe',
  /* `copy.business.subcategories[0][0]` — "Specialty coffee". */
  subcategory: 0,
  description:
    'A twelve-table specialty café a minute from Nowy Kleparz, roasting on a 5 kg drum in the back room. Breakfast until noon, filter flights all day, and the long table fills with AGH students from three.',
  price: '18–45 zł',
  logo: 'bratyslawska-mark.png',

  country: 'pl',
  city: 'Kraków',
  street: 'Bratysławska 6/2',
  maps: 'https://maps.google.com/?q=Kawiarnia+Bratys%C5%82awska+Krak%C3%B3w',

  phone: '+48 512 340 118',
  email: 'kontakt@bratyslawska.pl',
  website: 'https://bratyslawska.pl',
  instagram: 'https://instagram.com/bratyslawska',
  appStore: '',
  googlePlay: '',

  /* Kraków, and the two languages half the queue actually speaks. */
  spoken: ['pl', 'en', 'uk'],
};

/**
 * The player behind `user2`.
 *
 * Further along than `seedPlayer()`'s brand-new state — a week of streak, a
 * balance that can afford the top of the catalogue, and a history that shows the
 * accuracy figure meaning something. `lastPlayed` stays `null` for the reason it
 * does in `seedPlayer`: a date older than yesterday is a *lapsed* streak, and
 * the first round this account plays would correctly wipe the balance this seed
 * exists to show.
 */
function seededPlayer(): PlayerState {
  return {
    ...seedPlayer(),
    points: 1240,
    streak: 7,
    answered: 132,
    correct: 108,
  };
}

export const SEED_USERS: UserRecord[] = [
  {
    id: 'u_admin',
    name: 'Sardor Rasulov',
    email: 'admin@pay-lez.com',
    password: 'pay-lez26',
    created: '2026-01-05',
    type: 'admin',
    /* An admin has no venue and no wallet — they read everyone else's. */
    business: null,
    player: null,
  },
  {
    id: 'u_marta',
    name: 'Marta Wiśniewska',
    email: 'user1@pay-lez.com',
    password: 'user123',
    created: '2026-04-02',
    type: 'business',
    business: BRATYSLAWSKA,
    player: null,
  },
  {
    id: 'u_dilnoza',
    name: 'Dilnoza Yusupova',
    email: 'user2@pay-lez.com',
    password: 'user123',
    created: '2026-05-19',
    type: 'individual',
    business: null,
    player: seededPlayer(),
  },
];

/*
 * There was a `DEMO_USERS` export here, and the sign-in form printed it.
 *
 * The argument for it was that the passwords ship in the bundle either way, so
 * showing them cost nothing and saved everyone guessing. That was true while the
 * seeds below were the whole of the account system. It stopped being true when
 * `server/` arrived: those are now credentials to a system that hashes them,
 * and a working pair printed on the front door is a working pair whoever reads
 * it. The seeds stay — they are what makes the prototype's screens worth looking
 * at — but nothing advertises them.
 */

export type SignInError = 'email' | 'password';
export type SignUpError = 'name' | 'email' | 'taken' | 'password' | 'type';

/** Short enough to type, long enough not to be a typo. */
export const MIN_PASSWORD = 6;

const sameEmail = (a: string, b: string) =>
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
    player: draft.type === 'individual' ? seedPlayer() : null,
  };
}
