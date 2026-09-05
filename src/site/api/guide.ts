/**
 * The Living Guide, as the server serves it.
 *
 * This is the file the note on `RELOCATE_PROVIDERS` in `content.ts` asked for.
 * Relocate's subject list and the places under it were a hand-written array of
 * twenty-four invented businesses — "Wisła Bank — Newcomer Desk", "Klinika
 * Zdrowie" — sitting on a page that promises a reader three weeks into a new
 * country somewhere to actually go. Two of the names were real businesses that
 * had never heard of us. It was the last seed directory on the site, and it is
 * gone: the section reads `GET /v1/guide/categories` and `GET /v1/guide/services`,
 * which are the imported rows of the old database.
 *
 * Split from `api/consumer.ts` for the reason `api/board.ts` was: both of these
 * are `auth: 'none'`, and the guide is deliberately readable **without an
 * account** — that is the page's whole pitch. Mixing them in with calls that
 * need a session hides which is which.
 *
 * What is *not* here is as much of the point. The seed rows carried a
 * `languages` field, and it was the best thing about them — "somebody here
 * speaks Ukrainian" is exactly what this reader needs. `guidance_services` has
 * no such column, so the card no longer claims it. Inventing the one attribute
 * the real data lacks is how the directory got fictional in the first place.
 */
import { call } from './client';

/** A subject: the app's own guidance categories, in the app's own order. */
export interface GuideCategory {
  id: string;
  /** What `GuideService.category_key` joins on. */
  key: string;
  /** The export's icon name, which is not one of ours — see `GUIDE_ICONS`. */
  icon: string | null;
  position: number;
  /** Translated, with English filling any hole. Absent if untranslated. */
  title?: string;
  description?: string;
  subcategories: Array<{ id: string; key: string; title?: string }>;
}

/** One place filed under a subject. */
export interface GuideService {
  id: string;
  name: string;
  category_key: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  description: string | null;
  /**
   * Set when the listing is also a Paylez venue — the same place at a later
   * stage of its relationship with us, and the one badge on the card that says
   * something a reader can act on here rather than at the counter.
   */
  venueId: string | null;
  acceptsVouchers: boolean;
  links: Array<{ kind: string; value: string }>;
}

/**
 * `limit` is well past the 308 rows the import writes, because the section
 * groups by subject on the client: a page-sized answer would put a *wrong*
 * count on every closed row rather than a short list on one open one.
 */
export const categoriesPath = (country: string): string =>
  `/v1/guide/categories?country=${encodeURIComponent(country)}`;

export const servicesPath = (country: string): string =>
  `/v1/guide/services?country=${encodeURIComponent(country)}&limit=400`;

/* Kept for callers that want the promise rather than the hook. */
export const categories = (country: string, language?: string) =>
  call<GuideCategory[]>(categoriesPath(country), { language });

export const services = (country: string, language?: string) =>
  call<GuideService[]>(servicesPath(country), { language });
