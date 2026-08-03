/**
 * The business listing — its shape, its blank, and how finished it is.
 *
 * Split out from `context.ts` and kept free of React on purpose: the
 * completeness calculation is the one piece of this feature that is pure
 * arithmetic over a fixed field list, which makes it the one piece
 * `npm run verify` can check without a browser. Anything that needs a hook
 * belongs in `AuthProvider`, not here.
 *
 * The field list is lifted from the partner dashboard prototype
 * (`b2b/Paylez Partner Dashboard v2.dc.html`, the `profile` screen). Ten of the
 * sixteen are required before a listing can go live, and it is deliberately the
 * prototype's ten rather than a set chosen here — the app it describes is what
 * decides when a listing is publishable.
 */

/** Ids, not names. The names are copy and live in the dictionaries. */
export type BusinessCategory =
  | 'cafe'
  | 'restaurant'
  | 'barbershop'
  | 'beauty'
  | 'dental'
  | 'language'
  | 'fitness';

export type BusinessCountry = 'pl' | 'ua' | 'ge' | 'tr' | 'uz' | 'az';

/** Languages a venue's staff speak. Wider than the site's own five. */
export type SpokenLanguage = 'pl' | 'en' | 'uk' | 'ru' | 'tr' | 'uz';

export interface BusinessProfile {
  name: string;
  category: BusinessCategory;
  /** Index into the category's own subcategory list. Reset when it changes. */
  subcategory: number;
  description: string;
  price: string;
  logo: string;

  country: BusinessCountry;
  city: string;
  street: string;
  maps: string;

  phone: string;
  email: string;
  website: string;
  instagram: string;
  appStore: string;
  googlePlay: string;

  spoken: SpokenLanguage[];
}

/**
 * A blank listing.
 *
 * The two selects start on their first option rather than empty: a `<select>`
 * with no selection shows its first entry anyway, so an empty string here would
 * claim a field is missing while the control on screen reads "Café".
 */
export function blankBusiness(): BusinessProfile {
  return {
    name: '',
    category: 'cafe',
    subcategory: 0,
    description: '',
    price: '',
    logo: '',
    country: 'pl',
    city: '',
    street: '',
    maps: '',
    phone: '',
    email: '',
    website: '',
    instagram: '',
    appStore: '',
    googlePlay: '',
    spoken: ['pl', 'en'],
  };
}

/**
 * The fields a listing cannot go live without.
 *
 * `category` and `country` are absent because they cannot be blank — see
 * `blankBusiness`. Everything else here is free text the owner has to supply.
 */
export const REQUIRED_FIELDS = [
  'name',
  'description',
  'price',
  'logo',
  'city',
  'street',
  'maps',
  'phone',
  'email',
] as const satisfies readonly (keyof BusinessProfile)[];

export type RequiredField = (typeof REQUIRED_FIELDS)[number];

/** The prototype's rule, and deliberately a loose one: it catches a typo, not a
 *  fake domain, and rejecting a valid address is the worse failure here. */
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export interface Completeness {
  /** Required fields filled. */
  done: number;
  total: number;
  /** 0–100, rounded — what the progress bar and the headline figure read. */
  percent: number;
  /** In `REQUIRED_FIELDS` order, so the "still needed" list matches the form. */
  missing: RequiredField[];
}

/**
 * How much of the listing is done.
 *
 * An email that is present but malformed counts as **missing**, not as filled:
 * a listing that goes live with `hello@` in it is broken in exactly the way
 * this meter exists to prevent, and the form shows its own inline error beside
 * the field so the reason is never a mystery.
 */
export function profileCompleteness(profile: BusinessProfile): Completeness {
  const missing = REQUIRED_FIELDS.filter((field) => {
    const value = profile[field].trim();
    if (!value) return true;
    return field === 'email' ? !isEmail(value) : false;
  });

  const total = REQUIRED_FIELDS.length;
  const done = total - missing.length;
  return { done, total, percent: Math.round((done / total) * 100), missing };
}

/** Whether the listing is publishable — the one thing callers usually want. */
export function isBusinessReady(profile: BusinessProfile): boolean {
  return profileCompleteness(profile).missing.length === 0;
}
