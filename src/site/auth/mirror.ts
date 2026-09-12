/**
 * Folding the server's answers into this browser's copy of an account.
 *
 * The `localStorage` directory is a mirror of `server/` rather than a second
 * directory (root `CLAUDE.md`), and until this file it was a mirror with one
 * direction: a sign-in wrote down the server's id and name and nothing else.
 * Everything the server knew and this browser did not — the account type, the
 * listing, the seven profile answers, whether onboarding was done — came up
 * blank on any device that had not set it up itself. An owner was asked
 * "individual or business?" again and dropped on the setup form; a returning
 * player was walked through the welcome flow again; the profile page was empty
 * while the server held every answer on it.
 *
 * Everything here is pure, so `npm run verify` owns the rules rather than a
 * browser. `AuthProvider` does the asking and calls these to decide what each
 * answer means for the account it already has.
 */
import type { GamesState, Me } from '../api/consumer';
import type { ProfileWrite } from '../api/profile';
import { businessFromSource, type ListingSource } from '../api/listing';
import type { Account, AccountType, ProfilePatch, ProfileResult, UserProfile } from './context';
import { isPicture } from './picture';
import { ENERGY_REGEN_MINUTES, newPlayer, type PlayerState } from './player';
import { isOccupation } from './users';
import { resolveRoute, type Route } from '../router';

/**
 * Which kind of account this is, decided by the server wherever it can be.
 *
 * In order: an operator is an operator because `user_roles` says so; an owner
 * is an owner because `partner_owner` is granted at sign-up or by
 * `POST /v1/me/partner` and nowhere else; otherwise the answer this browser
 * already had stands, because a consumer role says nothing about whether
 * somebody chose "individual"; and failing that, an account that finished
 * onboarding is a player — onboarding is the player app's first minute and
 * nobody else has one.
 *
 * `null` is the honest remainder: the question has not been answered anywhere,
 * and `resolveRoute` holds that account at the question.
 *
 * A local `admin` the server no longer vouches for is not kept. The console
 * reads the live database with that token, and a browser that still believed
 * in the role would open a screen whose every request is refused.
 */
export function typeFromRoles(
  roles: readonly string[],
  local: AccountType | null,
  onboardedAt: string | null,
): AccountType | null {
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('partner_owner')) return 'business';
  if (local === 'individual' || local === 'business') return local;
  return onboardedAt !== null ? 'individual' : null;
}

/* The three screens an account is *held* at rather than sent to. */
const HOLD_SCREENS: ReadonlySet<Route> = new Set<Route>(['onboarding', 'business-setup', 'signin']);

/**
 * Whether a stored session has to hear from the server before a page is drawn.
 *
 * The mirror answers the first render on its own, and that is right almost
 * always and wrong in one way: when it lacks a fact that decides *where*
 * somebody goes. A player who finished the welcome flow on their phone reloads
 * a laptop whose mirror says `onboardedAt: null`, and the router — correctly,
 * for what it was told — puts them in the welcome flow; the server's answer
 * lands a moment later and releases them home rather than to the page they
 * asked for, because by then the address bar says `#/welcome`. An owner whose
 * listing this browser has not seen is sent to setup the same way, and an
 * account whose type is unknown here to the question.
 *
 * Those three shapes wait, and only when waiting changes something: when the
 * page asked for is one they would be moved off, or one of the three screens
 * they would be held at. An owner without a listing reading the landing page
 * goes nowhere either way and is drawn at once. `resolveRoute` is asked rather
 * than restated, so this cannot drift from the access rule it anticipates.
 */
export function awaitsServer(account: Account | null, requested: Route): boolean {
  if (account === null) return false;
  const missing =
    account.type === null ||
    (account.type === 'individual' && account.onboardedAt === null) ||
    (account.type === 'business' && account.business === null);
  if (!missing) return false;
  const lands = resolveRoute(requested, account);
  return lands !== requested || HOLD_SCREENS.has(lands);
}

/**
 * The seven answers, with the server's winning wherever it has one.
 *
 * A server `null` keeps what this browser holds rather than blanking it. That is
 * safe here in a way it would not be for most records: no write can *clear* one
 * of these columns (`PATCH /v1/me` reads an empty value as "not sent"), so a
 * server `null` only ever means "never given" — and the value beside it here is
 * an edit saved while the server was unreachable, which is exactly what the
 * offline save promised to keep until the next save can send it.
 *
 * The city and its country move as a pair, as they do everywhere else.
 */
export function profileFromServer(user: Me['user'], held: UserProfile): UserProfile {
  const pick = (server: string | null, local: string) =>
    server !== null && server.trim() !== '' ? server : local;
  const city = user.city !== null && user.city.trim() !== '' ? user.city : null;

  return {
    username: pick(user.username, held.username),
    occupation: user.occupation && isOccupation(user.occupation) ? user.occupation : held.occupation,
    city: city ?? held.city,
    countryCode: city === null ? held.countryCode : (user.countryCode ?? ''),
    phone: pick(user.phone, held.phone),
    birthDate: pick(user.birthDate, held.birthDate),
    /* The counter is the server's record — except for a birthday that exists
       only here, whose one write was spent here too. */
    birthDateChangesLeft:
      user.birthDate !== null || !held.birthDate
        ? user.birthDateChangesLeft
        : held.birthDateChangesLeft,
    avatar: pick(user.avatar, held.avatar),
  };
}

/**
 * The player mirror, rewritten from `GET /v1/games/state`.
 *
 * Every number is the server's. The one conversion is the tank: the server
 * says "this many now, the next one at `nextAt`", and the mirror stores a count
 * and the moment it was last true (`energyAt`, see `player.ts`) — so the anchor
 * is one regeneration interval before `nextAt`, which makes `energyOf` answer
 * the same count and the same wait the server just gave. A full tank has no
 * clock running, and is stored without one.
 */
export function playerFromGames(
  held: PlayerState,
  state: GamesState,
  regenMinutes: number,
): PlayerState {
  const nextAt = state.energy.nextAt === null ? Number.NaN : Date.parse(state.energy.nextAt);
  const filling = Number.isFinite(nextAt) && state.energy.energy < state.energy.max;
  return {
    ...held,
    points: state.points,
    streak: state.streak,
    freezes: state.freezes,
    answered: state.answered,
    correct: state.correct,
    lastPlayed: state.lastPlayed,
    energy: filling ? Math.max(0, state.energy.energy) : state.energy.max,
    energyAt: filling ? nextAt - Math.max(1, regenMinutes) * 60_000 : null,
  };
}

/** Everything one round of asking brings back. `null` halves were not asked, or did not answer. */
export interface ServerAnswers {
  me: Me;
  games: GamesState | null;
  listing: ListingSource | null;
}

/**
 * An account, with what the server said folded in.
 *
 * Two stamps move **forward only**: `onboardedAt` and `profileCompletedAt`
 * are set from the server when this browser has none, and a date this browser
 * already holds is never cleared by a server that has not heard about it yet —
 * the welcome flow finished while its bonus request failed is still finished.
 *
 * The balance is the ledger's (`me.points`), and the rest of the player state
 * is `GET /v1/games/state`'s when it answered. The listing is the server's
 * when there is one; a business with nothing on the server keeps
 * `business === null`, which is what sends a new owner through setup.
 *
 * An account the server now calls something else loses what the other kind
 * holds, the same way `setType` drops it: a player has no listing, an owner
 * and an operator have no player state.
 */
export function foldServer(held: Account, answers: ServerAnswers, language: string): Account {
  const { me } = answers;
  const onboardedAt = held.onboardedAt ?? me.user.onboardedAt;
  const type = typeFromRoles(me.roles, held.type, onboardedAt);
  const regenMinutes = Number(me.entitlements?.energy_regen_minutes) || ENERGY_REGEN_MINUTES;

  let player: PlayerState | null = null;
  if (type === 'individual') {
    const ledger = { ...(held.player ?? newPlayer()), points: me.points };
    player = answers.games ? playerFromGames(ledger, answers.games, regenMinutes) : ledger;
  }

  const business =
    type === 'individual' || type === 'admin'
      ? null
      : answers.listing
        ? businessFromSource(answers.listing, language, held.business)
        : held.business;

  return {
    ...held,
    name: me.user.name.trim() || held.name,
    email: me.user.email ?? held.email,
    type,
    player,
    business,
    profile: profileFromServer(me.user, held.profile),
    onboardedAt,
    profileCompletedAt: held.profileCompletedAt ?? me.user.profileCompletedAt,
  };
}

/**
 * The body a profile save sends.
 *
 * Blank answers are left out, which is not tidiness: the server reads an empty
 * string as "not sent" and cannot clear a column, and a blank phone sent anyway
 * would meet the phone's shape rule rather than be ignored. A photo is sent
 * only when it is one this site made — see `picture.ts`. Unchanged answers go
 * too, and cost nothing: the server compares a username by its folded key and
 * spends a birthday correction only on a *different* day.
 */
export function profileWrite(patch: ProfilePatch): ProfileWrite {
  const body: ProfileWrite = {};
  const text = (value: string | undefined) => value?.trim() || undefined;

  const username = text(patch.username);
  if (username) body.username = username;
  const occupation = text(patch.occupation);
  if (occupation) body.occupation = occupation;
  const phone = text(patch.phone);
  if (phone) body.phone = phone;
  const birthDate = text(patch.birthDate);
  if (birthDate) body.birthDate = birthDate;
  if (isPicture(patch.avatar)) body.avatar = patch.avatar;

  const city = text(patch.place?.city);
  if (city) {
    body.city = city;
    const country = text(patch.place?.countryCode);
    if (country) body.countryCode = country.toUpperCase();
  }
  return body;
}

/**
 * A refusal from `PATCH /v1/me`, in the form's own vocabulary.
 *
 * Keyed on the `field` the server names — the reason its errors carry one — and
 * on the code only where a field can be refused two ways: `conflict` on the
 * username is somebody else holding it, and on the birthday it is the
 * correction limit. The reason *within* a field comes off the message, the one
 * place the server states it, and each branch falls back to that field's widest
 * reading rather than to nothing.
 */
export function profileRefusal(
  status: number,
  code: string,
  field: string | null,
  message: string,
): ProfileResult {
  const said = message.toLowerCase();
  if (status === 401) return { ok: false, field: null, error: 'session' };

  switch (field) {
    case 'username':
      if (code === 'conflict') return { ok: false, field: 'username', error: 'taken' };
      if (said.includes('reserved')) return { ok: false, field: 'username', error: 'reserved' };
      if (said.includes('characters')) return { ok: false, field: 'username', error: 'length' };
      return { ok: false, field: 'username', error: 'shape' };
    case 'birthDate':
      if (code === 'conflict') return { ok: false, field: 'birthDate', error: 'spent' };
      if (said.includes('exist')) return { ok: false, field: 'birthDate', error: 'nonexistent' };
      if (said.includes('past')) return { ok: false, field: 'birthDate', error: 'future' };
      if (said.includes('at least')) return { ok: false, field: 'birthDate', error: 'young' };
      if (said.includes('look right')) return { ok: false, field: 'birthDate', error: 'old' };
      return { ok: false, field: 'birthDate', error: 'format' };
    case 'phone':
      return { ok: false, field: 'phone', error: 'shape' };
    case 'city':
      return { ok: false, field: 'city', error: 'shape' };
    case 'countryCode':
      return {
        ok: false,
        field: 'country',
        error: said.includes('two-letter') ? 'shape' : 'needed',
      };
    default:
      return { ok: false, field: null, error: 'refused' };
  }
}
