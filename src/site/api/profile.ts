/**
 * The one thing the profile form cannot answer on its own: **which cities.**
 *
 * Everything else on `#/profile` is decided locally, because the site's own
 * accounts are still `localStorage` (`auth/users.ts` says so at the top). The
 * city is not, and the reason is a rule rather than a preference: the set is
 * closed, it is 114 entries across three countries, it folds accents and
 * resolves local spellings onto one canonical ASCII name, and the city
 * leaderboard groups on that name with a literal `=`. A second copy of it in
 * this bundle would be a list that changes on the server and does not change
 * here — the shape that ends with a picker offering a city the write refuses.
 *
 * So the picker asks. `GET /v1/cities` is public — it has to be, because
 * sign-up takes a city and a form cannot be asked for a token to render its own
 * options — and it serves the same constant `accounts.resolveCity` checks
 * against, which is what makes "chosen, not typed" true on both sides of the
 * wire at once.
 *
 * **A failed request is a state, not an empty list.** Same rule as the console's
 * fourth tab: `useApi` hands back `loading | ready | error` as a union so
 * "the backend is not answering" and "the answer is nothing" cannot be
 * confused, and the form disables the field and says which one it is rather
 * than showing an empty dropdown that looks like a product with no cities in
 * it.
 */
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
 * The list as an options list: grouped by country, in the server's country
 * order, each group in the server's own order within it.
 *
 * Grouped rather than sorted alphabetically across the whole set, because a
 * flat list of 114 puts Andijan above Berlin and asks a reader in Kraków to
 * scan the other two countries to find their own. The server's order is kept
 * inside each group — it is the population order the table was written in, so
 * the city most people want is at the top rather than the one starting with A.
 */
export function byCountry(list: CityList): Array<[CityCountry, City[]]> {
  return list.countries
    .map(
      (country): [CityCountry, City[]] => [
        country,
        list.cities.filter((city) => city.country === country),
      ],
    )
    .filter(([, cities]) => cities.length > 0);
}
