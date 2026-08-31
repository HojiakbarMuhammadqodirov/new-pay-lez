/**
 * The one thing the profile form cannot answer on its own: **which cities.**
 *
 * Everything else on `#/profile` is decided locally, because the site's own
 * accounts are still `localStorage` (`auth/users.ts` says so at the top). The
 * city is not, and the reason is a rule rather than a preference: the set is
 * 114 entries across three countries, it folds accents and resolves local
 * spellings onto one canonical ASCII name, and the city leaderboard groups on
 * that name with a literal `=`. A second copy of it in this bundle would be a
 * list that changes on the server and does not change here.
 *
 * So the field asks. `GET /v1/cities` is public — it has to be, because sign-up
 * takes a city and a form cannot be asked for a token to render its own
 * options — and it serves the same constant `accounts.resolveCity` checks
 * against.
 *
 * ── a suggestion source, not a whitelist ─────────────────────────────────
 *
 * This used to feed a `<select>`, on the argument that free text does not make
 * a messy leaderboard but *several* boards, one per spelling. That argument is
 * still true and is why the suggestions exist at all — but it was being used to
 * justify something else, which is refusing a city the list has never heard of.
 * 114 names is a good list and a short one; somebody lives in the 115th, and
 * for them a closed picker is not a tidy board, it is a form that cannot be
 * finished.
 *
 * So the field suggests as you type and takes what it is given. `PATCH /v1/me`
 * draws the line in the one place it can be drawn honestly: an unknown city is
 * accepted **provided a country comes with it**, because the pair is what makes
 * a place, and a city nobody can place is the only genuinely useless answer.
 *
 * **A failed request is a state, not an empty list.** Same rule as the console's
 * fourth tab: `useApi` hands back `loading | ready | error` as a union so
 * "the backend is not answering" and "the answer is nothing" cannot be
 * confused. What has changed is the cost of the failure — with a text field
 * there is nothing to disable, so the form says the suggestions are down and
 * lets the reader write the place themselves.
 */
import { call } from './client';
import { useApi, type ApiResult } from './useApi';

/** The three countries Paylez covers, in the order the server lists them. */
export type CityCountry = 'PL' | 'DE' | 'UZ';

export interface City {
  /** Canonical, ASCII, and stored exactly as it arrives. */
  name: string;
  country: CityCountry;
}

export interface CityList {
  countries: CityCountry[];
  cities: City[];
}

export const useCities = (): ApiResult<CityList> => useApi<CityList>('/v1/cities');

/**
 * How many suggestions the menu offers at once.
 *
 * Eight, because the list is scanned rather than read: a menu long enough to
 * scroll is one where the answer can be *below* the fold, which is the failure
 * a suggestion box exists to avoid. Two letters of a Polish city already cut
 * 114 to single figures, and anything still ambiguous after that is answered by
 * typing a third.
 */
export const CITY_SUGGESTIONS = 8;

/**
 * The comparison key: lowercase, accents folded, punctuation and spacing gone.
 *
 * The served names are already canonical ASCII, so this is not really for them
 * — it is for what gets *typed*. Somebody in Kraków types "Kraków", somebody in
 * Gorzów types "Gorzow Wlkp." with a space they may or may not include, and a
 * naive `includes` misses both. Folding both sides means the query is compared
 * on the letters rather than on the keyboard that produced them.
 */
export const foldCity = (value: string): string =>
  value
    .normalize('NFD')
    /* Every combining mark NFD just separated out, by Unicode category rather
       than by a codepoint range: `\p{M}` is what "an accent, from any script"
       is called, so this folds Polish, German and Uzbek Latin without three
       tables — and without a literal combining character in the source, which
       is invisible in every editor and therefore unreviewable. */
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/**
 * The city with this exact name, folded — or `undefined`.
 *
 * The distinction the whole form turns on. A city that resolves here has its
 * country as a *fact* and no second question; one that does not is a place the
 * reader has to describe, which is the "other city" branch.
 */
export const lookupCity = (list: CityList, name: string): City | undefined => {
  const key = foldCity(name);
  return key ? list.cities.find((city) => foldCity(city.name) === key) : undefined;
};

/**
 * The cities a query suggests, best first, at most `CITY_SUGGESTIONS` of them.
 *
 * Ranked in two bands rather than sorted, and the bands are the point: a name
 * that *starts* with what has been typed comes before one that merely contains
 * it, so "war" offers Warsaw before Nowa Warszawa. Within each band the
 * server's own order is kept — it is the population order the table was written
 * in, so the city most people want is at the top rather than the one starting
 * with A.
 *
 * An empty query is not an empty answer: it returns the head of the list, which
 * under that ordering is the largest cities in the countries Paylez covers.
 * A menu that opens blank until a key is pressed is a menu that looks broken.
 */
export function matchCities(list: CityList, query: string): City[] {
  const key = foldCity(query);
  if (!key) return list.cities.slice(0, CITY_SUGGESTIONS);

  const starts: City[] = [];
  const contains: City[] = [];
  for (const city of list.cities) {
    const name = foldCity(city.name);
    if (name.startsWith(key)) starts.push(city);
    else if (name.includes(key)) contains.push(city);
    if (starts.length >= CITY_SUGGESTIONS) break;
  }
  return [...starts, ...contains].slice(0, CITY_SUGGESTIONS);
}

/* ══════════════════════════════════════════════════ where somebody plays ══ */

/**
 * The two answers the leaderboard needs, and the consent to appear on it.
 *
 * One call because they are one decision on one screen: onboarding asks where
 * you are and whether you want to be seen, and a half-applied answer — a city
 * saved with the consent lost, or the reverse — is a state nobody chose. The
 * server takes all three on `PATCH /v1/me`, so they go together or not at all.
 *
 * `city` is *canonicalised on the server*, not stored as typed, which is why
 * the caller has to render the city back from the response rather than from
 * its own field: "kraków" typed here comes back as `Krakow`, and a client that
 * kept the typed form would show a different city from the one it just saved.
 */
export const savePlace = (place: {
  city: string;
  countryCode: string;
  leaderboardOptIn: boolean;
}) => call<{ city: string | null; countryCode: string | null }>('/v1/me', {
  method: 'PATCH',
  body: place,
});
