/**
 * The venue listing, read from and written to the server — the owner's half of
 * what `api/profile.ts` is for a player.
 *
 * ── why this file exists ──────────────────────────────────────────────────
 *
 * The listing form wrote a subset of itself to `venues` and kept the rest in the
 * browser that typed it: the description, the links and the spoken languages
 * never left `localStorage`, and nothing came back the other way. An owner who
 * signed in on a second device was a stranger to their own venue, was asked
 * "individual or business?" again and was walked into setup with a blank form.
 *
 * `GET /v1/partner/venues/:id/listing` returns the whole listing and
 * `POST`/`PATCH /v1/partner/venues` take all of it, so the mapping between the
 * form's `BusinessProfile` and the server's shape is written once, here, as
 * pure functions `npm run verify` checks in both directions.
 *
 * ── three rules the mapping keeps ─────────────────────────────────────────
 *
 * - **Absent is not empty.** Until the listing endpoint answers, the venue row
 *   is read instead, and a row carries no description, links or languages. A
 *   `ListingSource` leaves those three *undefined* rather than empty, and the
 *   reader keeps what the browser already has for them — "we were not told" must
 *   not overwrite a description with nothing.
 * - **Words the form has no list for are carried, not replaced.** Imported venues
 *   are `places / halal_food` and `housing / hotels`; the form offers seven
 *   categories and none of those. Mapping them onto "Café" would put a wrong
 *   label on the view and, on the next save, *write* it over the real one. So
 *   the server's words ride along on `unmapped`, the view prints them, and a
 *   save sends the field only once the owner has picked from the list.
 * - **A replace-the-set write keeps what it cannot show.** `links` and
 *   `languages` replace the whole set on the server, so the kinds the form has
 *   no field for (a TikTok link) and the languages its chips do not offer go
 *   back exactly as they came — and when the set was never read, it is not sent.
 */
import { ApiError, call, hasToken } from './client';
import { becomePartner } from './consumer';
import { BUSINESS_CATEGORIES, BUSINESS_COUNTRIES, SPOKEN_LANGUAGES } from '../content';
import { LANGUAGE_ORDER, LANGUAGES } from '../i18n/context';
import {
  blankBusiness,
  isEmail,
  type BusinessCategory,
  type BusinessCountry,
  type BusinessProfile,
  type SpokenLanguage,
} from '../auth/business';
import { isPicture } from '../auth/picture';

/* ═══════════════════════════════════════════════════════ the wire shapes ══ */

export interface ListingLink {
  kind: string;
  value: string;
}

/** `GET /v1/partner/venues/:id/listing`, as contract §2.9 states it. */
export interface ListingResponse {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  city: string | null;
  countryCode: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  timezone: string;
  currency: string;
  priceRange: string | null;
  phone: string | null;
  email: string | null;
  imageUrl: string | null;
  status: string;
  verifiedAt: string | null;
  acceptsVouchers: boolean;
  /** Language → text. */
  description: Record<string, string>;
  links: ListingLink[];
  languages: string[];
  hours: Array<{ weekday: number; opensMin: number | null; closesMin: number | null; closed: boolean }>;
  verification: null | {
    status: 'pending' | 'approved' | 'rejected';
    submittedAt: string;
    note: string | null;
  };
  createdAt: string;
  updatedAt: string;
}

/** The columns of `GET /v1/partner/venues` (`SELECT *`) this file reads. */
export interface VenueRow {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  city: string | null;
  country_code: string;
  address: string | null;
  price_range: string | null;
  phone: string | null;
  email: string | null;
  image_url: string | null;
  status: string;
  verified_at: string | null;
}

/**
 * What the site knows about a listing: the endpoint's whole answer, or a venue
 * row's half of it.
 *
 * The three optional fields are the difference between the two, and `undefined`
 * there means "not read" — see the header.
 */
export interface ListingSource {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  city: string | null;
  countryCode: string;
  address: string | null;
  priceRange: string | null;
  phone: string | null;
  email: string | null;
  imageUrl: string | null;
  status: string;
  verifiedAt: string | null;
  verification: ListingResponse['verification'];
  description?: Record<string, string>;
  links?: ListingLink[];
  languages?: string[];
}

/*
 * Checked rather than trusted, even from the endpoint: a server build that
 * answers without one of the three sets is a server that has not told us about
 * it, which is the `undefined` case and not the empty one.
 */
const isTextMap = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((text) => typeof text === 'string');

export const sourceFromListing = (listing: ListingResponse): ListingSource => ({
  id: listing.id,
  name: listing.name,
  category: listing.category,
  subcategory: listing.subcategory,
  city: listing.city,
  countryCode: listing.countryCode,
  address: listing.address,
  priceRange: listing.priceRange,
  phone: listing.phone,
  email: listing.email,
  imageUrl: listing.imageUrl,
  status: listing.status,
  verifiedAt: listing.verifiedAt,
  verification: listing.verification ?? null,
  description: isTextMap(listing.description) ? listing.description : undefined,
  links: Array.isArray(listing.links) ? listing.links : undefined,
  languages: Array.isArray(listing.languages) ? listing.languages : undefined,
});

export const sourceFromRow = (row: VenueRow): ListingSource => ({
  id: row.id,
  name: row.name,
  category: row.category,
  subcategory: row.subcategory,
  city: row.city,
  countryCode: row.country_code,
  address: row.address,
  priceRange: row.price_range,
  phone: row.phone,
  email: row.email,
  imageUrl: row.image_url,
  status: row.status,
  verifiedAt: row.verified_at,
  verification: null,
});

/* ═════════════════════════════════════════════════════ the closed lists ══ */

/**
 * Where a venue keeps its clock, per country the form offers.
 *
 * The **venue's** zone, never the reader's: the server compares a deal's window
 * and a venue's quiet hours against it, so a Kraków café is shut at 23:00 Kraków
 * time whoever is looking. One zone per country, which is true for all six —
 * none of them spans two. Moved here from `businessSetup.tsx` because the write
 * below is what needs it.
 */
export const VENUE_ZONES: Record<BusinessCountry, string> = {
  pl: 'Europe/Warsaw',
  ua: 'Europe/Kyiv',
  ge: 'Asia/Tbilisi',
  tr: 'Europe/Istanbul',
  uz: 'Asia/Tashkent',
  az: 'Asia/Baku',
};

/*
 * The comparison key for a word: accents folded, case dropped, and everything
 * that is not a letter or a digit gone — in any script, because the
 * subcategory labels it compares against are Cyrillic in two of the five
 * dictionaries. `specialty_coffee`, `Specialty coffee` and `SPECIALTY-COFFEE`
 * are one key.
 */
const fold = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');

/** One of the form's seven categories, or `null` for a word it has no row for. */
export function categoryOf(value: string | null | undefined): BusinessCategory | null {
  const key = fold(value ?? '');
  return BUSINESS_CATEGORIES.find((entry) => entry.id === key)?.id ?? null;
}

/**
 * The index of a server subcategory in the category's own list, or `null`.
 *
 * The site stores a subcategory as an *index* into a translated list, and the
 * server stores free text, so the two meet at the label. Every language's label
 * is tried, not only English: a row written by an earlier client in Polish is
 * still a row this form can read back.
 */
export function subcategoryIndex(
  category: BusinessCategory,
  value: string | null | undefined,
): number | null {
  const key = fold(value ?? '');
  const at = BUSINESS_CATEGORIES.findIndex((entry) => entry.id === category);
  if (!key || at < 0) return null;
  for (const code of LANGUAGE_ORDER) {
    const index = (LANGUAGES[code].listing.subcategories[at] ?? []).findIndex(
      (label) => fold(label) === key,
    );
    if (index >= 0) return index;
  }
  return null;
}

/**
 * What a subcategory is called on the wire: its **English label**.
 *
 * A label rather than a slug because the column is read raw — the dashboard's
 * listing preview prints `category · subcategory` as the server holds them, and
 * so does the phone — and "Specialty coffee" is a thing a person can read where
 * `specialty_coffee` is not. `subcategoryIndex` folds it back in any language.
 */
export function subcategoryWord(category: BusinessCategory, index: number): string | undefined {
  const at = BUSINESS_CATEGORIES.findIndex((entry) => entry.id === category);
  return LANGUAGES.en.listing.subcategories[at]?.[index];
}

/** One of the six countries the form offers, or `null`. */
export function countryOf(code: string | null | undefined): BusinessCountry | null {
  const key = (code ?? '').trim().toLowerCase();
  return (BUSINESS_COUNTRIES as readonly string[]).includes(key) ? (key as BusinessCountry) : null;
}

const isSpoken = (value: string): value is SpokenLanguage =>
  (SPOKEN_LANGUAGES as readonly string[]).includes(value);

/**
 * A server word the form has no label for, made readable: `halal_food` →
 * "Halal food". Printed as it is otherwise — the server's word is the fact, and
 * guessing a translation for it would be inventing one.
 */
export function wordsOf(value: string): string {
  const text = value.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

/**
 * The description to show: the reader's language, then English, then whatever
 * there is — and which of those it was, so a save writes the text back to the
 * language it came from rather than filing English prose under Polish.
 */
export function pickDescription(
  texts: Record<string, string> | undefined,
  language: string,
): { language: string; text: string } | null {
  if (!texts) return null;
  const has = (code: string) => typeof texts[code] === 'string' && texts[code].trim() !== '';
  if (has(language)) return { language, text: texts[language] };
  if (has('en')) return { language: 'en', text: texts.en };
  const first = Object.keys(texts).find(has);
  return first ? { language: first, text: texts[first] } : null;
}

/** The form's five link fields, and the `venue_links.kind` each one is. */
export const LINK_KINDS = {
  website: 'website',
  instagram: 'instagram',
  maps: 'google_maps',
  appStore: 'app_store',
  googlePlay: 'play_store',
} as const;

type LinkField = keyof typeof LINK_KINDS;
const LINK_FIELDS = Object.keys(LINK_KINDS) as LinkField[];
const SITE_KINDS: ReadonlySet<string> = new Set(Object.values(LINK_KINDS));

/* ═══════════════════════════════════════════════════ server → the form ══ */

/**
 * A listing as the form holds it.
 *
 * `held` is what this browser already has, and it matters in three places:
 * a scalar the server has never been given (`null`) keeps the held value, so an
 * edit saved while offline is not wiped by the next sign-in; a set the server
 * did not report keeps the held set; and a closed-list field the server words
 * differently keeps the held *choice* while `unmapped` carries the server's
 * word. A scalar cannot be cleared on the server — `COALESCE` — so "the server
 * has none" and "the owner deleted it elsewhere" cannot be confused for those.
 * The two sets *can* be, which is why a reported set wins outright.
 *
 * A held listing for a different venue is not a listing for this one, and is
 * ignored rather than blended into it.
 */
export function businessFromSource(
  source: ListingSource,
  language: string,
  held: BusinessProfile | null,
): BusinessProfile {
  const base = held && (!held.venueId || held.venueId === source.id) ? held : blankBusiness();
  const scalar = (server: string | null, local: string) =>
    server !== null && server.trim() !== '' ? server : local;

  const category = categoryOf(source.category);
  const subIndex = category ? subcategoryIndex(category, source.subcategory) : null;
  const country = countryOf(source.countryCode);

  const unmapped: NonNullable<BusinessProfile['unmapped']> = {};
  if (!category && source.category) unmapped.category = source.category;
  if (source.subcategory && subIndex === null) unmapped.subcategory = source.subcategory;
  if (!country && source.countryCode) unmapped.country = source.countryCode;

  const links = source.links;
  const link = (field: LinkField): string =>
    links === undefined
      ? base[field]
      : (links.find((entry) => entry.kind === LINK_KINDS[field])?.value ?? '');

  const description =
    source.description === undefined ? null : pickDescription(source.description, language);

  return {
    ...base,
    venueId: source.id,
    name: scalar(source.name, base.name),
    category: category ?? base.category,
    subcategory:
      category === null
        ? base.subcategory
        : (subIndex ?? (category === base.category ? base.subcategory : 0)),
    description: source.description === undefined ? base.description : (description?.text ?? ''),
    /* Present as a key even when there is none, so a spread over an older
       listing replaces the old language rather than inheriting it. */
    descriptionLanguage:
      source.description === undefined ? base.descriptionLanguage : description?.language,
    price: scalar(source.priceRange, base.price),
    logo: scalar(source.imageUrl, base.logo),
    country: country ?? base.country,
    city: scalar(source.city, base.city),
    street: scalar(source.address, base.street),
    maps: link('maps'),
    phone: scalar(source.phone, base.phone),
    email: scalar(source.email, base.email),
    website: link('website'),
    instagram: link('instagram'),
    appStore: link('appStore'),
    googlePlay: link('googlePlay'),
    spoken: source.languages === undefined ? base.spoken : source.languages.filter(isSpoken),
    unmapped: Object.keys(unmapped).length > 0 ? unmapped : undefined,
  };
}

/* ═══════════════════════════════════════════════════ the form → server ══ */

/** The body `POST` and `PATCH /v1/partner/venues` take (contract §2.9). */
export interface ListingWrite {
  name: string;
  city: string;
  category?: string;
  subcategory?: string;
  countryCode?: string;
  timezone?: string;
  address?: string;
  priceRange?: string;
  phone?: string;
  email?: string;
  imageUrl?: string;
  description?: Record<string, string>;
  links?: ListingLink[];
  languages?: string[];
}

/**
 * The write for a draft.
 *
 * `previous` is the listing as last read for the same venue, or `null` for a
 * venue that does not exist yet. It decides the three things a draft alone
 * cannot: whether the description changed at all (an unchanged one is not
 * sent, so a save never files the same text again under another language),
 * which links and languages the form cannot show and must send back, and
 * whether the two sets were read in the first place — an unread set is not
 * sent, because replacing a set you have not seen is deleting blind.
 *
 * Blank scalars are left out rather than sent empty: the server reads an empty
 * string as "not sent" either way, and leaving them out says so.
 */
export function listingWrite(
  draft: BusinessProfile,
  previous: ListingSource | null,
  language: string,
): ListingWrite {
  const unmapped = draft.unmapped ?? {};
  const put = (value: string) => value.trim() || undefined;

  const body: ListingWrite = { name: draft.name.trim(), city: draft.city.trim() };
  if (unmapped.category === undefined) {
    body.category = draft.category;
    if (unmapped.subcategory === undefined) {
      body.subcategory = subcategoryWord(draft.category, draft.subcategory);
    }
  }
  if (unmapped.country === undefined) {
    body.countryCode = draft.country.toUpperCase();
    body.timezone = VENUE_ZONES[draft.country];
  }
  body.address = put(draft.street);
  body.priceRange = put(draft.price);
  body.phone = put(draft.phone);
  body.email = put(draft.email);
  /* Only a picture this site made. A kept external address is already on the
     server, and sending it back would be the one write here with no reason. */
  if (isPicture(draft.logo)) body.imageUrl = draft.logo;

  const key = draft.descriptionLanguage ?? language;
  const text = draft.description.trim();
  if (previous?.description !== undefined) {
    /* `''` is how the server is told to delete that language, which is what
       emptying the box means. */
    if (text !== (previous.description[key] ?? '').trim()) body.description = { [key]: text };
  } else if (text) {
    body.description = { [key]: text };
  }

  if (previous === null || previous.links !== undefined) {
    const kept = (previous?.links ?? []).filter((entry) => !SITE_KINDS.has(entry.kind));
    body.links = [
      ...LINK_FIELDS.flatMap((field) => {
        const value = draft[field].trim();
        return value ? [{ kind: LINK_KINDS[field], value }] : [];
      }),
      ...kept,
    ];
  }

  if (previous === null || previous.languages !== undefined) {
    const kept = (previous?.languages ?? []).filter((code) => !isSpoken(code));
    body.languages = [...new Set([...draft.spoken, ...kept])];
  }

  return body;
}

/* ═══════════════════════════════════════════════════════════ the state ══ */

/**
 * Where the listing stands, in the words a status pill uses.
 *
 * `status` is the venue's own column and wins when it is decisive; the latest
 * verification record only answers the case the column cannot tell apart — a
 * venue sent back to draft after a refusal reads `draft` on the row and
 * `rejected` in the record, and "draft" would be telling the owner to finish a
 * form they finished.
 */
export type ListingState = 'live' | 'review' | 'draft' | 'rejected' | 'suspended' | 'archived';

export function listingState(source: Pick<ListingSource, 'status' | 'verification'>): ListingState {
  if (source.status === 'live') return 'live';
  if (source.status === 'suspended') return 'suspended';
  if (source.status === 'archived') return 'archived';
  if (source.verification?.status === 'rejected') return 'rejected';
  if (source.status === 'pending_review' || source.verification?.status === 'pending') {
    return 'review';
  }
  return 'draft';
}

/* ═══════════════════════════════════════════════ links a view may follow ══ */

/**
 * A value an `<a href>` may carry, or `null` to print it as text.
 *
 * Owners type these, so nothing reaches an `href` that is not plainly a web
 * address — `javascript:` in a website field is the one input this has to be
 * right about. A bare domain gets a scheme, because `cafe.pl` is what people
 * write and a link that resolves relative to this site is a broken one.
 */
export function webAddress(value: string): string | null {
  const text = value.trim();
  if (/^https?:\/\/[^\s]+$/i.test(text)) return text;
  if (/^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+(\/\S*)?$/u.test(text)) return `https://${text}`;
  return null;
}

export function phoneAddress(value: string): string | null {
  const digits = value.replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 6 ? `tel:${digits}` : null;
}

export function mailAddress(value: string): string | null {
  return isEmail(value) ? `mailto:${value.trim()}` : null;
}

/* ═══════════════════════════════════════════════════════ reading, writing ══ */

export const getListing = (venueId: string) =>
  call<ListingResponse>(`/v1/partner/venues/${encodeURIComponent(venueId)}/listing`);

export const venueRows = () => call<VenueRow[]>('/v1/partner/venues');

const asApiError = (cause: unknown): ApiError =>
  cause instanceof ApiError
    ? cause
    : new ApiError(500, 'client', cause instanceof Error ? cause.message : String(cause));

export type ListingRead =
  | { state: 'ready'; source: ListingSource }
  | { state: 'none' }
  | { state: 'error'; error: ApiError };

/**
 * The owner's listing, read whole where the server can and by halves where it
 * cannot.
 *
 * The venue is chosen off `GET /v1/partner/venues` — first by the id the
 * browser already holds, then the first row, which is ordered by creation and
 * is the same venue every dashboard screen resolves. An owner with four venues
 * therefore sees one listing on the profile screen and figures for that same one
 * everywhere else.
 *
 * If the listing endpoint does not answer — it is not deployed yet, or it
 * failed — the row just read *is* this venue, and its half of the listing is
 * returned rather than nothing. Never throws.
 */
export async function readOwnListing(venueId?: string): Promise<ListingRead> {
  let rows: VenueRow[];
  try {
    rows = await venueRows();
  } catch (cause) {
    return { state: 'error', error: asApiError(cause) };
  }
  const row = (venueId ? rows.find((entry) => entry.id === venueId) : undefined) ?? rows[0];
  if (!row) return { state: 'none' };
  try {
    return { state: 'ready', source: sourceFromListing(await getListing(row.id)) };
  } catch {
    return { state: 'ready', source: sourceFromRow(row) };
  }
}

const submitForReview = (venueId: string) =>
  call<{ id: string }>(`/v1/partner/venues/${encodeURIComponent(venueId)}/verification`, {
    method: 'POST',
    /* `manual`, because a person looks — the form collects neither of the two
       kinds of evidence the other methods name. */
    body: { method: 'manual' },
  });

export type ListingSaved =
  /** Written, and read back — `read` is what the server now holds. */
  | { state: 'saved'; created: boolean; read: ListingRead }
  /** No server to write to. The browser's copy is all there is. */
  | { state: 'device' }
  /** The server answered and said no; `error.message` is its own words. */
  | { state: 'refused'; error: ApiError };

/**
 * Write the listing to the server: create it once, patch it after.
 *
 * `myVenues`-style resolution rather than a flag kept anywhere, because whether
 * this account has a venue is a fact about the server. The role is claimed
 * first, every time — it is idempotent, and the very next call needs it.
 *
 * A new venue is sent for review straight away: an unverified venue can hold
 * drafts and cannot put an offer in front of anybody, and nothing else in the
 * product queues one. That call failing does not undo the venue, so it does not
 * fail the save.
 */
export async function saveOwnListing(
  draft: BusinessProfile,
  previous: ListingSource | null,
  language: string,
): Promise<ListingSaved> {
  if (!hasToken()) return { state: 'device' };
  try {
    await becomePartner();
    const rows = await venueRows();
    const target = (draft.venueId ? rows.find((row) => row.id === draft.venueId) : undefined) ?? rows[0];

    if (target) {
      let before = previous && previous.id === target.id ? previous : null;
      if (!before) {
        const read = await readOwnListing(target.id);
        before = read.state === 'ready' ? read.source : sourceFromRow(target);
      }
      await call<VenueRow>(`/v1/partner/venues/${encodeURIComponent(target.id)}`, {
        method: 'PATCH',
        body: listingWrite(draft, before, language),
      });
      return { state: 'saved', created: false, read: await readOwnListing(target.id) };
    }

    const made = await call<VenueRow>('/v1/partner/venues', {
      method: 'POST',
      body: listingWrite(draft, null, language),
    });
    await submitForReview(made.id).catch(() => undefined);
    return { state: 'saved', created: true, read: await readOwnListing(made.id) };
  } catch (cause) {
    const error = asApiError(cause);
    return error.status === 0 ? { state: 'device' } : { state: 'refused', error };
  }
}
