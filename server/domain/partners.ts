/**
 * Partner authoring — B1 to B6. The write side of everything the consumer app
 * and the mobile companion then read.
 *
 * The rule that shapes the whole file: **the entitlement is checked at the point
 * of authoring, and the validation is the same whether a human or the assistant
 * wrote it** (B8: "drafts are validated against the same rules as manual
 * authoring before they can be published"). So the assistant has no privileged
 * path — it produces a config object and hands it to these functions like
 * everybody else.
 *
 * B1's verification gate is the other one: nothing publishes before the venue is
 * verified. It is enforced in `publishDeal` and `setVenueLive` rather than at the
 * form, because a form is a suggestion and this is a rule.
 */
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import * as audit from './audit.ts';
import * as budget from './budget.ts';
import * as campaigns from './campaigns.ts';
import * as deals from './deals.ts';
import * as entitlements from './entitlements.ts';
import { DomainError } from './errors.ts';
import { newId } from './ids.ts';
import { localMonth, now, type Iso } from './time.ts';
import { getVenue, requireVerified, type Venue } from './venues.ts';

/* ══════════════════════════════════════════════════ B1 onboarding & venues ══ */

export interface VenueDraft {
  name: string;
  category: string;
  subcategory?: string;
  city: string;
  countryCode?: string;
  address?: string;
  lat?: number;
  lng?: number;
  timezone?: string;
  currency?: string;
  priceRange?: string;
  phone?: string;
  email?: string;
  imageUrl?: string;
}

/**
 * The parts of a listing that are not columns on `venues`: the description in
 * each language, the links, and the languages spoken there (B2).
 *
 * Taken by the create and the update, not only by their own routes, because the
 * listing form is one form and saves once — a venue saved by three requests is a
 * venue two-thirds saved the first time one of them fails. Typed `unknown`
 * because they arrive as JSON and are checked here, where the rule lives, rather
 * than trusted from the route.
 */
export interface ListingExtras {
  description?: unknown;
  links?: unknown;
  languages?: unknown;
}

interface CheckedExtras {
  /** An empty `value` removes that language. */
  description?: Array<{ language: string; value: string }>;
  links?: Array<{ kind: string; value: string }>;
  languages?: string[];
}

const LANGUAGE_CODE = /^[a-z]{2}$/;
const LINK_KIND = /^[a-z][a-z0-9_]{0,31}$/;

const invalid = (message: string, detail: Record<string, unknown>): never => {
  throw new DomainError('validation_failed', message, detail);
};

/** Whether `Intl` knows a zone — the only check that matters, since every venue-local rule reads the zone through it. */
const isTimeZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

/**
 * Where a new venue is, checked before it is written.
 *
 * **A zone `Intl` does not know is refused at the door**, because it is not a
 * bad value on one field: every venue-local rule in the product formats through
 * `Intl`, which throws on a zone it does not recognise, so a venue created as
 * `Europe/Krakow` would 500 its overview, its budget and every scan at its
 * counter for as long as it existed. Currency and country are checked for shape
 * and upper-cased, because the minor-unit table and every report compare them
 * literally.
 */
function checkPlace(draft: { timezone?: string; currency?: string; countryCode?: string }) {
  const timezone = draft.timezone ?? 'Europe/Warsaw';
  if (!isTimeZone(timezone)) invalid('timezone is not a time zone', { field: 'timezone' });
  const currency = (draft.currency ?? 'PLN').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) invalid('currency is a three-letter code', { field: 'currency' });
  const countryCode = (draft.countryCode ?? 'PL').toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) invalid('countryCode is a two-letter code', { field: 'countryCode' });
  return { timezone, currency, countryCode };
}

/**
 * B2's links, as a set: one of each kind, each with somewhere to go.
 *
 * The same rules for `PUT …/links` and for links saved with the listing,
 * because both write the same rows. `venue_links` is `UNIQUE (venue_id, kind)`,
 * so two Instagram links used to reach the insert and come back as a 500 with a
 * constraint name in the log; they are a 400 naming the kind now. A row with no
 * value is how the form clears one, and is skipped rather than refused.
 */
export function checkLinks(
  links: ReadonlyArray<{ kind?: unknown; value?: unknown }>,
): Array<{ kind: string; value: string }> {
  if (links.length > 20) invalid('a venue has at most 20 links', { field: 'links', max: 20 });
  const seen = new Set<string>();
  const out: Array<{ kind: string; value: string }> = [];
  for (const link of links) {
    const value = typeof link.value === 'string' ? link.value.trim() : '';
    if (!value) continue;
    const kind = typeof link.kind === 'string' ? link.kind.trim().toLowerCase() : '';
    if (!LINK_KIND.test(kind)) {
      invalid('a link needs a kind, such as website or instagram', { field: 'links', kind: link.kind ?? null });
    }
    if (value.length > 500) invalid('a link is at most 500 characters', { field: 'links', kind, max: 500 });
    if (seen.has(kind)) invalid('a venue has one link of each kind', { field: 'links', kind });
    seen.add(kind);
    out.push({ kind, value });
  }
  return out;
}

/** The listing extras, checked whole before anything is written. */
export function checkExtras(extras: ListingExtras): CheckedExtras {
  const out: CheckedExtras = {};

  if (extras.description !== undefined) {
    const map = extras.description;
    if (map === null || typeof map !== 'object' || Array.isArray(map)) {
      invalid('description is a map of language to text', { field: 'description' });
    }
    const entries = Object.entries(map as Record<string, unknown>);
    if (entries.length > 20) invalid('a description has at most 20 languages', { field: 'description', max: 20 });
    out.description = entries.map(([key, value]) => {
      const language = key.trim().toLowerCase();
      if (!LANGUAGE_CODE.test(language)) {
        invalid('description is keyed by two-letter language codes', { field: 'description', language: key });
      }
      if (typeof value !== 'string') invalid('a description is text', { field: 'description', language });
      const text = (value as string).trim();
      if (text.length > 2000) {
        invalid('a description is at most 2000 characters', { field: 'description', language, max: 2000 });
      }
      return { language, value: text };
    });
  }

  if (extras.links !== undefined) {
    if (!Array.isArray(extras.links)) invalid('links must be a list', { field: 'links' });
    out.links = checkLinks(
      (extras.links as unknown[]).map(
        (item) => (item !== null && typeof item === 'object' ? item : {}) as { kind?: unknown; value?: unknown },
      ),
    );
  }

  if (extras.languages !== undefined) {
    if (!Array.isArray(extras.languages)) invalid('languages must be a list', { field: 'languages' });
    const codes = new Set<string>();
    for (const item of extras.languages as unknown[]) {
      const code = typeof item === 'string' ? item.trim().toLowerCase() : '';
      if (!LANGUAGE_CODE.test(code)) invalid('languages are two-letter codes', { field: 'languages', language: item ?? null });
      codes.add(code);
    }
    if (codes.size > 30) invalid('a venue lists at most 30 languages', { field: 'languages', max: 30 });
    out.languages = [...codes].sort();
  }

  return out;
}

/**
 * Write what `checkExtras` passed. Each part replaces only itself: a save that
 * carries no `links` leaves the links alone, and a description sent in one
 * language leaves the other languages alone — `''` is how one is removed.
 */
async function writeExtras(db: Db, venueId: string, extras: CheckedExtras, at: Iso): Promise<void> {
  for (const entry of extras.description ?? []) {
    if (entry.value === '') {
      await db.run(
        `DELETE FROM translations
          WHERE entity = 'venue' AND entity_id = $v AND field = 'description' AND language = $l`,
        { v: venueId, l: entry.language },
      );
      continue;
    }
    await db.run(
      `INSERT INTO translations (entity, entity_id, field, language, value, ai_generated, updated_at)
       VALUES ('venue', $v, 'description', $l, $val, 0, $t)
         ON CONFLICT (entity, entity_id, field, language)
         DO UPDATE SET value = excluded.value, ai_generated = excluded.ai_generated,
                       updated_at = excluded.updated_at`,
      { v: venueId, l: entry.language, val: entry.value, t: at },
    );
  }
  if (extras.links) await setLinks(db, venueId, extras.links, at);
  if (extras.languages) {
    await db.run(`DELETE FROM venue_languages WHERE venue_id = $v`, { v: venueId });
    for (const language of extras.languages) {
      await db.run(`INSERT INTO venue_languages (venue_id, language) VALUES ($v, $l)`, {
        v: venueId,
        l: language,
      });
    }
  }
}

/** What the audit entry says about the extras: which ones moved, not a copy of the prose. */
const extrasSummary = (extras: CheckedExtras) => ({
  description: extras.description?.map((entry) => entry.language),
  links: extras.links?.map((link) => link.kind),
  languages: extras.languages,
});

export async function createVenue(
  db: Db,
  input: { ownerId: string; draft: VenueDraft; extras?: ListingExtras; at?: Iso },
): Promise<Venue> {
  const at = input.at ?? now();
  const ent = await entitlements.entitlementsFor(db, { userId: input.ownerId });
  const place = checkPlace(input.draft);
  const extras = checkExtras(input.extras ?? {});

  return db.tx(async () => {
    const owned =
      (await db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM venues WHERE owner_user_id = $o AND deleted_at IS NULL`,
        { o: input.ownerId },
      ))?.n ?? 0;
    /* B7: the number of venues is an entitlement, so a chain has to be on a plan
       that says so. The consumer-side entitlements are read here because the
       owner's *account* holds the plan until a venue exists to hold one. */
    entitlements.requireCapacity(ent, 'venues', owned, 1);

    if (!input.draft.name.trim()) {
      throw new DomainError('validation_failed', 'a venue needs a name', { field: 'name' });
    }

    const id = newId('ven');
    await db.run(
      `INSERT INTO venues
         (id, owner_user_id, name, category, subcategory, city, country_code, address, lat, lng,
          timezone, currency, price_range, image_url, phone, email, status, amount_entry,
          min_spend_minor, max_amount_minor, created_at, updated_at)
       VALUES ($i, $o, $n, $ca, $sc, $ci, $cc, $ad, $la, $ln, $tz, $cu, $pr, $im, $ph, $em,
               'draft', 'cashier', $ms, $mx, $t, $t)`,
      {
        i: id,
        o: input.ownerId,
        n: input.draft.name.trim(),
        ca: input.draft.category,
        sc: input.draft.subcategory ?? null,
        ci: input.draft.city,
        cc: place.countryCode,
        ad: input.draft.address ?? null,
        la: input.draft.lat ?? null,
        ln: input.draft.lng ?? null,
        tz: place.timezone,
        cu: place.currency,
        pr: input.draft.priceRange ?? null,
        im: input.draft.imageUrl ?? null,
        ph: input.draft.phone ?? null,
        em: input.draft.email ?? null,
        ms: CONFIG.gate.minSpendMinor,
        mx: CONFIG.gate.maxAmountMinor,
        t: at,
      },
    );

    /* A venue arrives with its three voucher tiers already configured. A new
       partner who has to invent a points threshold before anything works is a
       new partner who does not finish onboarding. */
    for (const tier of CONFIG.vouchers.defaultTiers) {
      await db.run(
        `INSERT INTO voucher_tiers
           (id, venue_id, discount_pct, points_cost, max_discount_minor, active, created_at, updated_at)
         VALUES ($i, $v, $p, $pt, $m, 1, $t, $t)`,
        {
          i: newId('vtr'),
          v: id,
          p: tier.pct,
          pt: tier.points,
          m: tier.maxDiscountMinor,
          t: at,
        },
      );
    }

    await db.run(
      `INSERT INTO moderation_queue (id, entity, entity_id, venue_id, reason, status, created_at)
       VALUES ($i, 'venue', $v, $v, 'new venue', 'pending', $t)`,
      { i: newId('mod'), v: id, t: at },
    );
    await writeExtras(db, id, extras, at);
    await audit.record(db, {
      actorId: input.ownerId,
      action: 'venue.create',
      entity: 'venue',
      entityId: id,
      venueId: id,
      after: { ...input.draft, ...extrasSummary(extras) },
      at,
    });

    return await getVenue(db, id);
  });
}

/** B2. What consumers see, plus the amount-capture configuration. */
export async function updateVenue(
  db: Db,
  input: {
    venueId: string;
    actorId: string;
    patch: Partial<VenueDraft> & {
      amountEntry?: 'cashier' | 'customer';
      minSpendMinor?: number;
      maxAmountMinor?: number;
      pointsPerScan?: number;
      scanCooldownHours?: number;
    };
    extras?: ListingExtras;
    /**
     * Listing details to take back (§2.13). The patch can only set — its write
     * `COALESCE`s, so a phone number or a photo, once given, could be replaced and
     * never removed. The name, category and city are not here: a venue without
     * them is not a listing anybody can be shown.
     */
    clear?: ReadonlyArray<'subcategory' | 'address' | 'priceRange' | 'phone' | 'email' | 'imageUrl'>;
    at?: Iso;
  },
): Promise<Venue> {
  const at = input.at ?? now();
  const before = await getVenue(db, input.venueId);
  const p = input.patch;

  /*
   * **A name can be changed, not removed.** `COALESCE` keeps a field the patch
   * did not send, and an empty string is not an absent one — so a name of
   * spaces, which `optStr` trims to `''`, was written straight over the real
   * name and left a venue called nothing on every card in the app. Both writers
   * of this row, the owner's form and the operator's console, come through here.
   */
  const name = p.name === undefined ? undefined : p.name.trim();
  if (name !== undefined && !name) invalid('a venue needs a name', { field: 'name' });
  if (name !== undefined && name.length > 120) invalid('name is too long', { field: 'name', max: 120 });
  if (p.timezone !== undefined && !isTimeZone(p.timezone)) {
    invalid('timezone is not a time zone', { field: 'timezone' });
  }
  const currency = p.currency?.toUpperCase();
  if (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) {
    invalid('currency is a three-letter code', { field: 'currency' });
  }
  const extras = checkExtras(input.extras ?? {});
  const clears = new Set(input.clear ?? []);

  await db.tx(async () => {
    await db.run(
      `UPDATE venues SET
          name = COALESCE($n, name), category = COALESCE($ca, category),
          subcategory = CASE WHEN $xsc = 1 THEN NULL ELSE COALESCE($sc, subcategory) END,
          city = COALESCE($ci, city),
          address = CASE WHEN $xad = 1 THEN NULL ELSE COALESCE($ad, address) END,
          lat = COALESCE($la, lat), lng = COALESCE($ln, lng),
          timezone = COALESCE($tz, timezone), currency = COALESCE($cu, currency),
          price_range = CASE WHEN $xpr = 1 THEN NULL ELSE COALESCE($pr, price_range) END,
          image_url = CASE WHEN $xim = 1 THEN NULL ELSE COALESCE($im, image_url) END,
          phone = CASE WHEN $xph = 1 THEN NULL ELSE COALESCE($ph, phone) END,
          email = CASE WHEN $xem = 1 THEN NULL ELSE COALESCE($em, email) END,
          amount_entry = COALESCE($ae, amount_entry),
          min_spend_minor = COALESCE($ms, min_spend_minor),
          max_amount_minor = COALESCE($mx, max_amount_minor),
          points_per_scan = COALESCE($pps, points_per_scan),
          scan_cooldown_hours = COALESCE($sch, scan_cooldown_hours),
          updated_at = $t
        WHERE id = $v`,
      {
        n: name ?? null,
        ca: p.category ?? null,
        sc: p.subcategory ?? null,
        ci: p.city ?? null,
        ad: p.address ?? null,
        la: p.lat ?? null,
        ln: p.lng ?? null,
        tz: p.timezone ?? null,
        cu: currency ?? null,
        pr: p.priceRange ?? null,
        im: p.imageUrl ?? null,
        ph: p.phone ?? null,
        em: p.email ?? null,
        ae: p.amountEntry ?? null,
        ms: p.minSpendMinor ?? null,
        mx: p.maxAmountMinor ?? null,
        pps: p.pointsPerScan ?? null,
        sch: p.scanCooldownHours ?? null,
        xsc: clears.has('subcategory') ? 1 : 0,
        xad: clears.has('address') ? 1 : 0,
        xpr: clears.has('priceRange') ? 1 : 0,
        xim: clears.has('imageUrl') ? 1 : 0,
        xph: clears.has('phone') ? 1 : 0,
        xem: clears.has('email') ? 1 : 0,
        t: at,
        v: input.venueId,
      },
    );
    await writeExtras(db, input.venueId, extras, at);

    await audit.record(db, {
      actorId: input.actorId,
      action: 'venue.update',
      entity: 'venue',
      entityId: input.venueId,
      venueId: input.venueId,
      before,
      after: { ...p, ...extrasSummary(extras), cleared: clears.size > 0 ? [...clears] : undefined },
      at,
    });
  });
  /* Changes propagate immediately (B2) — there is no publish step for a profile
     edit, because the consumer app reads the venue row directly. */
  return await getVenue(db, input.venueId);
}

/**
 * B2. Links as an extensible list, not two fixed columns.
 *
 * `kind` is free text on purpose: adding TikTok is a row, and the consumer app
 * shows whatever it recognises. A schema change to add a social network is the
 * thing the spec explicitly asked to avoid.
 */
export async function setLinks(
  db: Db,
  venueId: string,
  links: ReadonlyArray<{ kind?: unknown; value?: unknown }>,
  at: Iso = now(),
): Promise<void> {
  const checked = checkLinks(links);
  await db.tx(async () => {
    await db.run(`DELETE FROM venue_links WHERE venue_id = $v`, { v: venueId });
    for (const [index, link] of checked.entries()) {
      await db.run(
        `INSERT INTO venue_links (id, venue_id, kind, value, position) VALUES ($i, $v, $k, $val, $p)`,
        { i: newId('lnk'), v: venueId, k: link.kind, val: link.value, p: index },
      );
    }
    await db.run(`UPDATE venues SET updated_at = $t WHERE id = $v`, { t: at, v: venueId });
  });
}

export const linksOf = async (db: Db, venueId: string) =>
  await db.all<{ kind: string; value: string }>(
    `SELECT kind, value FROM venue_links WHERE venue_id = $v ORDER BY position`,
    { v: venueId },
  );

export async function setHours(
  db: Db,
  venueId: string,
  hours: Array<{ weekday: number; opensMin: number | null; closesMin: number | null; closed?: boolean }>,
): Promise<void> {
  /*
   * One row per weekday, and minutes that are minutes. Both used to reach the
   * insert unchecked: a repeated weekday broke the primary key and a `NaN` broke
   * the weekday's CHECK, and each came back as a 500 rather than as the form's
   * mistake. And a time outside the day is not a late opening — `isOpen` and the
   * heat map compare these against minutes past local midnight.
   */
  const seen = new Set<number>();
  for (const row of hours) {
    if (!Number.isInteger(row.weekday) || row.weekday < 0 || row.weekday > 6 || seen.has(row.weekday)) {
      invalid('hours are one row per weekday, 0 (Monday) to 6', { field: 'hours', weekday: row.weekday });
    }
    seen.add(row.weekday);
    for (const minutes of [row.opensMin, row.closesMin]) {
      if (minutes !== null && (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440)) {
        invalid('opening times are minutes past local midnight, 0 to 1440', {
          field: 'hours',
          weekday: row.weekday,
        });
      }
    }
  }

  await db.tx(async () => {
    await db.run(`DELETE FROM venue_hours WHERE venue_id = $v`, { v: venueId });
    for (const row of hours) {
      await db.run(
        `INSERT INTO venue_hours (venue_id, weekday, opens_min, closes_min, closed)
         VALUES ($v, $d, $o, $c, $cl)`,
        {
          v: venueId,
          d: row.weekday,
          o: row.opensMin,
          c: row.closesMin,
          cl: row.closed ? 1 : 0,
        },
      );
    }
  });
}

/** B1 verification. Submitted by the partner, decided by an admin (C1). */
export async function submitVerification(
  db: Db,
  input: { venueId: string; method: 'email_domain' | 'business_details' | 'manual'; taxId?: string; legalName?: string; at?: Iso },
): Promise<string> {
  const at = input.at ?? now();

  /*
   * **Only a venue that is not yet verified can ask to be.** This wrote the
   * venue back to `pending_review` whatever it was, so a live venue that
   * re-submitted — a second press, a form that submits on every save — took
   * itself off the product: `requireVerified` refuses to publish and the gate
   * refuses to scan anywhere that is not `live`, until an operator approved it a
   * second time. A suspended venue could overwrite its own suspension the same
   * way, which is an operator's decision undone by the owner it was about.
   *
   * A second submission while one is already pending returns that one rather
   * than stacking a queue of identical records.
   */
  const venue = await getVenue(db, input.venueId);
  if (venue.status === 'live' && venue.verified_at) {
    throw new DomainError('conflict', 'this venue is already verified', { status: venue.status });
  }
  if (venue.status === 'suspended' || venue.status === 'archived') {
    throw new DomainError('invalid_state', 'a suspended venue is restored by an operator, not re-verified', {
      status: venue.status,
    });
  }
  const pending = await db.get<{ id: string }>(
    `SELECT id FROM verification_records
      WHERE venue_id = $v AND status = 'pending' ORDER BY submitted_at DESC LIMIT 1`,
    { v: venue.id },
  );
  if (pending) return pending.id;

  const id = newId('ver');
  await db.tx(async () => {
    await db.run(
      `INSERT INTO verification_records
         (id, venue_id, method, status, tax_id, legal_name, submitted_at)
       VALUES ($i, $v, $m, 'pending', $t, $l, $at)`,
      {
        i: id,
        v: input.venueId,
        m: input.method,
        t: input.taxId ?? null,
        l: input.legalName ?? null,
        at,
      },
    );
    await db.run(`UPDATE venues SET status = 'pending_review', updated_at = $t WHERE id = $v`, {
      t: at,
      v: input.venueId,
    });
  });
  return id;
}

/** C1. The admin's decision. Only this makes a venue publishable. */
export async function decideVerification(
  db: Db,
  input: { verificationId: string; approve: boolean; reviewerId: string; note?: string; at?: Iso },
): Promise<void> {
  const at = input.at ?? now();
  const record = await db.get<{ venue_id: string }>(
    `SELECT venue_id FROM verification_records WHERE id = $i`,
    { i: input.verificationId },
  );
  if (!record) throw new DomainError('not_found', 'verification not found');

  await db.tx(async () => {
    await db.run(
      `UPDATE verification_records SET status = $s, reviewed_by = $r, reviewed_at = $t, note = $n
        WHERE id = $i`,
      {
        s: input.approve ? 'approved' : 'rejected',
        r: input.reviewerId,
        t: at,
        n: input.note ?? null,
        i: input.verificationId,
      },
    );
    await db.run(
      `UPDATE venues SET status = $s, verified_at = $ver, updated_at = $t WHERE id = $v`,
      {
        s: input.approve ? 'live' : 'draft',
        ver: input.approve ? at : null,
        t: at,
        v: record.venue_id,
      },
    );
    await audit.record(db, {
      actorId: input.reviewerId,
      actorRole: 'admin',
      action: input.approve ? 'venue.verify' : 'venue.reject',
      entity: 'venue',
      entityId: record.venue_id,
      venueId: record.venue_id,
      after: { note: input.note },
      at,
    });
  });
}

/* ══════════════════════════════════════════════════ B6 tiers and budgets ══ */

export async function setVoucherTiers(
  db: Db,
  input: {
    venueId: string;
    actorId: string;
    tiers: Array<{
      discountPct: number;
      pointsCost: number;
      maxDiscountMinor: number;
      /**
       * The two count caps. **`undefined` and `null` mean different things** —
       * absent is "leave whatever is set alone" and null is "remove the cap" —
       * because this function upserts the whole row, so a field that folded the
       * two together would silently clear a cap every time somebody edited a
       * rung's price. The route refuses anything else by name (`capOf`).
       */
      redeemLimit?: number | null;
      perUserLimit?: number | null;
      active?: boolean;
    }>;
    at?: Iso;
  },
): Promise<void> {
  const at = input.at ?? now();
  await db.tx(async () => {
    for (const tier of input.tiers) {
      /* Whole numbers in range, refused by name. A percentage of 0 or 150 used
         to reach the table's CHECK and come back as a 500, and a points cost of
         12.5 was stored — a price nobody can pay in a currency with no halves. */
      if (!Number.isInteger(tier.discountPct) || tier.discountPct < 1 || tier.discountPct > 100) {
        throw new DomainError('validation_failed', 'a tier is a whole percentage from 1 to 100', {
          field: 'discountPct',
          discountPct: tier.discountPct,
        });
      }
      if (
        !Number.isInteger(tier.pointsCost) ||
        !Number.isInteger(tier.maxDiscountMinor) ||
        tier.pointsCost <= 0 ||
        tier.maxDiscountMinor <= 0
      ) {
        throw new DomainError('validation_failed', 'a tier needs a points cost and a cap', {
          field: tier.pointsCost > 0 && Number.isInteger(tier.pointsCost) ? 'maxDiscountMinor' : 'pointsCost',
          discountPct: tier.discountPct,
        });
      }
      /*
       * The caps, written only when they were sent.
       *
       * `COALESCE($sent, …)` would be the compact way and it cannot express
       * this: the sentinel for "not sent" and the value for "no cap" are both
       * NULL over the wire, so one statement cannot tell them apart. Two
       * statements can — the upsert leaves the columns alone, and a second
       * UPDATE writes whichever of the two the body actually carried. A rung
       * arriving without them therefore keeps the cap it has, which is what
       * every existing caller of this function sends.
       *
       * `issued_count` is never touched here. It is `claimSlot`'s column, and
       * an edit that reset it would hand the rung its whole cap back.
       */
      await db.run(
        `INSERT INTO voucher_tiers
           (id, venue_id, discount_pct, points_cost, max_discount_minor, active, created_at, updated_at)
         VALUES ($i, $v, $p, $pt, $m, $a, $t, $t)
           ON CONFLICT (venue_id, discount_pct) DO UPDATE
             SET points_cost = excluded.points_cost,
                 max_discount_minor = excluded.max_discount_minor,
                 active = excluded.active, updated_at = excluded.updated_at`,
        {
          i: newId('vtr'),
          v: input.venueId,
          p: tier.discountPct,
          pt: tier.pointsCost,
          m: tier.maxDiscountMinor,
          a: tier.active === false ? 0 : 1,
          t: at,
        },
      );
      if (tier.redeemLimit !== undefined) {
        await db.run(
          `UPDATE voucher_tiers SET redeem_limit = $l, updated_at = $t
            WHERE venue_id = $v AND discount_pct = $p`,
          { l: tier.redeemLimit, t: at, v: input.venueId, p: tier.discountPct },
        );
      }
      if (tier.perUserLimit !== undefined) {
        await db.run(
          `UPDATE voucher_tiers SET per_user_limit = $l, updated_at = $t
            WHERE venue_id = $v AND discount_pct = $p`,
          { l: tier.perUserLimit, t: at, v: input.venueId, p: tier.discountPct },
        );
      }
    }
    await audit.record(db, {
      actorId: input.actorId,
      action: 'voucher_tiers.update',
      entity: 'venue',
      entityId: input.venueId,
      venueId: input.venueId,
      after: input.tiers,
      at,
    });
  });
}

/**
 * B6. One monthly budget, split between the two allocations.
 *
 * The split is stored in basis points rather than as two amounts, so the two
 * sides cannot be set to something that does not add up to the total — which is
 * the failure mode a "loyalty budget" field and a "voucher budget" field beside
 * each other invites on the very first edit.
 */
export async function setBudget(
  db: Db,
  input: { venueId: string; actorId: string; totalMinor: number; loyaltyBp?: number; at?: Iso },
): Promise<budget.BudgetView> {
  const at = input.at ?? now();
  const venue = await getVenue(db, input.venueId);
  const period = localMonth(at, venue.timezone);

  if (input.totalMinor < 0) throw new DomainError('validation_failed', 'a budget cannot be negative');
  if (input.loyaltyBp !== undefined && (input.loyaltyBp < 0 || input.loyaltyBp > 10_000)) {
    throw new DomainError('validation_failed', 'the split is basis points, 0–10000');
  }

  const view = await budget.budgetFor(db, input.venueId, at);
  const row = (await db.get<{ total_minor: number; loyalty_bp: number }>(
    `SELECT total_minor, loyalty_bp FROM budgets WHERE id = $b`,
    { b: view.id },
  ))!;
  const committed = view.loyalty.spent + view.loyalty.reserved + view.voucher.spent + view.voucher.reserved;

  /*
   * **Each pool has to cover its own commitments — not just the two together.**
   * Refuse to shrink a budget below what is already committed: the reserves are
   * vouchers and rewards customers are holding, and a pool that cannot honour
   * them is a promise already broken. The check used to be on the total alone,
   * so a new *split* could move one pool's base below what it had spent and
   * reserved while the sum still cleared: 60/40 → 10/90 on a loyalty pool holding
   * a month of earned rewards left that pool's `available` negative, which is the
   * state this module exists to make impossible.
   *
   * A pool's base is its share of the total plus the top-ups and rebalances
   * already moved into it, and those do not change with the total — so the new
   * base is the new share plus the same adjustment.
   */
  const shareOf = (total: number, loyaltyBp: number) => {
    const loyalty = Math.floor((total * loyaltyBp) / 10_000);
    return { loyalty, voucher: total - loyalty };
  };
  const was = shareOf(row.total_minor, row.loyalty_bp);
  const next = shareOf(input.totalMinor, input.loyaltyBp ?? row.loyalty_bp);
  for (const pool of [view.loyalty, view.voucher]) {
    const base = next[pool.allocation] + (pool.base - was[pool.allocation]);
    if (base < pool.spent + pool.reserved) {
      throw new DomainError('conflict', `that leaves the ${pool.allocation} pool below what it has already spent or reserved`, {
        allocation: pool.allocation,
        committed,
        poolCommitted: pool.spent + pool.reserved,
      });
    }
  }

  await db.tx(async () => {
    await db.run(
      `UPDATE budgets SET total_minor = $t, loyalty_bp = COALESCE($l, loyalty_bp), updated_at = $at
        WHERE venue_id = $v AND period = $p`,
      { t: input.totalMinor, l: input.loyaltyBp ?? null, at, v: input.venueId, p: period },
    );
    await audit.record(db, {
      actorId: input.actorId,
      action: 'budget.update',
      entity: 'budget',
      entityId: view.id,
      venueId: input.venueId,
      before: { total: view.total, loyaltyBp: row.loyalty_bp },
      after: { total: input.totalMinor, loyaltyBp: input.loyaltyBp },
      at,
    });
  });
  return await budget.budgetFor(db, input.venueId, at);
}

/* ═══════════════════════════════════════════════════════ B5 campaigns ══ */

export async function createCampaign(
  db: Db,
  input: {
    venueId: string;
    actorId: string;
    name: string;
    visitsRequired: number;
    rewardLabel: string;
    rewardCostMinor: number;
    priority?: number;
    recurring?: boolean;
    minSpendMinor?: number;
    rewardValidDays?: number;
    /** Present only so the validator can reject them by name (B5). */
    rewardKind?: string;
    pointsThreshold?: number;
    at?: Iso;
  },
): Promise<campaigns.Campaign> {
  const at = input.at ?? now();
  campaigns.validateCampaign(input);

  const ent = await entitlements.entitlementsFor(db, { venueId: input.venueId });
  const active =
    (await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM campaigns WHERE venue_id = $v AND status = 'active'`,
      { v: input.venueId },
    ))?.n ?? 0;
  entitlements.requireCapacity(ent, 'active_campaigns', active, 1);

  const id = newId('cmp');
  await db.tx(async () => {
    await db.run(
      `INSERT INTO campaigns
         (id, venue_id, name, visits_required, reward_label, reward_cost_minor, priority,
          recurring, min_spend_minor, reward_valid_days, status, created_at, updated_at)
       VALUES ($i, $v, $n, $vr, $rl, $rc, $p, $re, $ms, $rd, 'active', $t, $t)`,
      {
        i: id,
        v: input.venueId,
        n: input.name,
        vr: input.visitsRequired,
        rl: input.rewardLabel,
        rc: input.rewardCostMinor,
        p: input.priority ?? 0,
        re: input.recurring === false ? 0 : 1,
        ms: input.minSpendMinor ?? null,
        rd: input.rewardValidDays ?? CONFIG.loyalty.rewardValidityDays,
        t: at,
      },
    );
    await audit.record(db, {
      actorId: input.actorId,
      action: 'campaign.create',
      entity: 'campaign',
      entityId: id,
      venueId: input.venueId,
      after: input,
      at,
    });
  });

  return (await db.get<campaigns.Campaign>(`SELECT * FROM campaigns WHERE id = $i`, { i: id }))!;
}

export interface CampaignPatch {
  name?: string;
  rewardLabel?: string;
  rewardCostMinor?: number;
  visitsRequired?: number;
  /** `null` clears the override, and the venue's own minimum applies again. */
  minSpendMinor?: number | null;
  rewardValidDays?: number;
  priority?: number;
  recurring?: boolean;
}

/**
 * B5. Change a campaign that already exists.
 *
 * The campaign is validated **as it will be after the edit**, not the patch on
 * its own: a reward cost of zero is refused whether it arrives beside a new name
 * or by itself, because the rule is about the campaign rather than about which
 * field was touched — and it is `validateCampaign`, the one `createCampaign`
 * runs, so the two doors hold the same rule.
 *
 * **Rewards already earned are not repriced.** Each `earned_rewards` row carries
 * the cost and the reserve written when it was earned, and nothing here goes
 * looking for them: a customer holding a free coffee reserved at 12 zł keeps a
 * reward the pool reserved 12 zł for, whatever the next one is set to cost.
 * Cards in progress keep their stamps, and are measured against the new number
 * of visits from their next visit on.
 */
export async function updateCampaign(
  db: Db,
  input: { campaignId: string; actorId: string; patch: CampaignPatch; at?: Iso },
): Promise<campaigns.CampaignRow> {
  const at = input.at ?? now();
  const before = await db.get<campaigns.Campaign>(`SELECT * FROM campaigns WHERE id = $i`, {
    i: input.campaignId,
  });
  if (!before) throw new DomainError('not_found', 'campaign not found');
  const p = input.patch;

  const next = {
    name: p.name?.trim() ?? before.name,
    rewardLabel: p.rewardLabel?.trim() ?? before.reward_label,
    rewardCostMinor: p.rewardCostMinor ?? before.reward_cost_minor,
    visitsRequired: p.visitsRequired ?? before.visits_required,
    minSpendMinor: p.minSpendMinor === undefined ? before.min_spend_minor : p.minSpendMinor,
    rewardValidDays: p.rewardValidDays ?? before.reward_valid_days,
    priority: p.priority ?? before.priority,
    recurring: p.recurring === undefined ? before.recurring === 1 : p.recurring,
  };
  if (!next.name) invalid('a campaign needs a name', { field: 'name' });
  campaigns.validateCampaign(next);

  if (Object.values(p).some((value) => value !== undefined)) {
    await db.tx(async () => {
      await db.run(
        `UPDATE campaigns SET name = $n, reward_label = $rl, reward_cost_minor = $rc,
                visits_required = $vr, min_spend_minor = $ms, reward_valid_days = $rd,
                priority = $pr, recurring = $re, updated_at = $t
          WHERE id = $i`,
        {
          n: next.name,
          rl: next.rewardLabel,
          rc: next.rewardCostMinor,
          vr: next.visitsRequired,
          ms: next.minSpendMinor,
          rd: next.rewardValidDays,
          pr: next.priority,
          re: next.recurring ? 1 : 0,
          t: at,
          i: before.id,
        },
      );
      await audit.record(db, {
        actorId: input.actorId,
        action: 'campaign.update',
        entity: 'campaign',
        entityId: before.id,
        venueId: before.venue_id,
        before: {
          name: before.name,
          rewardLabel: before.reward_label,
          rewardCostMinor: before.reward_cost_minor,
          visitsRequired: before.visits_required,
          minSpendMinor: before.min_spend_minor,
          rewardValidDays: before.reward_valid_days,
          priority: before.priority,
          recurring: before.recurring === 1,
        },
        after: p,
        at,
      });
    });
  }

  return (await campaigns.campaignRows(db, before.venue_id, before.id))[0];
}

/**
 * Pause, end or resume a campaign.
 *
 * **Resuming counts against the plan, the way starting one does.** Only
 * `createCampaign` read `active_campaigns`, so a venue on a one-campaign plan
 * could run as many as it liked: pause the first, create the second, resume the
 * first. It is the deal lifecycle's second door (see `deals.setStatus`) on the
 * campaign side. Pausing and ending are never gated — stopping something must
 * not need an entitlement.
 */
export async function setCampaignStatus(
  db: Db,
  input: { campaignId: string; status: 'active' | 'paused' | 'ended'; actorId: string; at?: Iso },
): Promise<void> {
  const at = input.at ?? now();
  const campaign = await db.get<{ venue_id: string; status: string }>(
    `SELECT venue_id, status FROM campaigns WHERE id = $i`,
    { i: input.campaignId },
  );
  if (!campaign) throw new DomainError('not_found', 'campaign not found');

  if (input.status === 'active' && campaign.status !== 'active') {
    const ent = await entitlements.entitlementsFor(db, { venueId: campaign.venue_id });
    const running =
      (await db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM campaigns WHERE venue_id = $v AND status = 'active' AND id <> $c`,
        { v: campaign.venue_id, c: input.campaignId },
      ))?.n ?? 0;
    entitlements.requireCapacity(ent, 'active_campaigns', running, 1);
  }

  await db.tx(async () => {
    await campaigns.setStatus(db, input.campaignId, input.status, at);
    await audit.record(db, {
      actorId: input.actorId,
      action: `campaign.${input.status}`,
      entity: 'campaign',
      entityId: input.campaignId,
      venueId: campaign.venue_id,
      at,
    });
  });
}

/* ═══════════════════════════════════════════════════════ B3 hot deals ══ */

export interface DealDraft {
  venueId: string;
  discountText?: string;
  promoCode?: string;
  imageUrl?: string;
  category?: string;
  validFrom?: string;
  validTo?: string;
  targetWeekdays?: number[];
  targetFromMin?: number;
  targetToMin?: number;
  targetLanguages?: string[];
  targetAudience?: deals.Segment[];
  capClaims?: number;
  capSpendMinor?: number;
  /** `{ en: { title, description, terms }, … }` — B3's multilingual content. */
  copy: Record<string, { title?: string; description?: string; terms?: string }>;
  aiGenerated?: boolean;
}

export async function createDeal(
  db: Db,
  input: { actorId: string; draft: DealDraft; at?: Iso },
): Promise<deals.Deal> {
  const at = input.at ?? now();
  const venue = await getVenue(db, input.draft.venueId);
  /* Read as dates, and a bare end day made the whole of that day — see
     `deals.checkValidTo` for the last day every offer used to lose. */
  const validFrom = deals.checkValidFrom(input.draft.validFrom);
  const validTo = deals.checkValidTo(input.draft.validTo, venue.timezone);
  if (validFrom && validTo && Date.parse(validTo) <= Date.parse(validFrom)) {
    invalid('a deal has to end after it starts', { field: 'validTo' });
  }
  const id = newId('del');

  await db.tx(async () => {
    await db.run(
      `INSERT INTO hot_deals
         (id, venue_id, partner_name, city, country_code, category, discount_text, promo_code,
          image_url, status, valid_from, valid_to, target_weekdays, target_from_min, target_to_min,
          target_languages, target_audience, cap_claims, cap_spend_minor, created_by,
          created_at, updated_at)
       VALUES ($i, $v, $pn, $ci, $cc, $ca, $dt, $pc, $im, 'draft', $vf, $vt, $tw, $tf, $tt,
               $tl, $ta, $cap, $caps, $cb, $t, $t)`,
      {
        i: id,
        v: venue.id,
        pn: venue.name,
        ci: venue.city,
        cc: venue.country_code,
        ca: input.draft.category ?? venue.category,
        dt: input.draft.discountText ?? null,
        pc: input.draft.promoCode ?? null,
        im: input.draft.imageUrl ?? null,
        vf: validFrom ?? null,
        vt: validTo ?? null,
        tw: input.draft.targetWeekdays?.join(',') ?? null,
        tf: input.draft.targetFromMin ?? null,
        tt: input.draft.targetToMin ?? null,
        tl: input.draft.targetLanguages?.join(',') ?? null,
        ta: input.draft.targetAudience?.join(',') ?? null,
        cap: input.draft.capClaims ?? null,
        caps: input.draft.capSpendMinor ?? null,
        cb: input.actorId,
        t: at,
      },
    );
    await writeCopy(db, id, input.draft.copy, input.draft.aiGenerated ?? false, at);
    await audit.record(db, {
      actorId: input.actorId,
      action: 'deal.create',
      entity: 'hot_deal',
      entityId: id,
      venueId: venue.id,
      after: { copy: Object.keys(input.draft.copy) },
      at,
    });
  });

  return await deals.getDeal(db, id);
}

async function writeCopy(
  db: Db,
  dealId: string,
  copy: DealDraft['copy'],
  ai: boolean,
  at: Iso,
): Promise<void> {
  for (const [language, fields] of Object.entries(copy)) {
    for (const [field, value] of Object.entries(fields)) {
      if (!value?.trim()) continue;
      await db.run(
        `INSERT INTO translations (entity, entity_id, field, language, value, ai_generated, updated_at)
         VALUES ('hot_deal', $i, $f, $l, $v, $ai, $t)
           ON CONFLICT (entity, entity_id, field, language)
           DO UPDATE SET value = excluded.value, ai_generated = excluded.ai_generated,
                         updated_at = excluded.updated_at`,
        { i: dealId, f: field, l: language, v: value.trim(), ai: ai ? 1 : 0, t: at },
      );
    }
  }
}

export async function updateDeal(
  db: Db,
  input: { dealId: string; actorId: string; patch: Partial<DealDraft>; at?: Iso },
): Promise<deals.Deal> {
  const at = input.at ?? now();
  const before = await deals.getDeal(db, input.dealId);
  const p = input.patch;
  const timezone = before.venue_id ? (await getVenue(db, before.venue_id)).timezone : 'Europe/Warsaw';
  const validFrom = deals.checkValidFrom(p.validFrom);
  const validTo = deals.checkValidTo(p.validTo, timezone);

  await db.tx(async () => {
    await db.run(
      `UPDATE hot_deals SET
          discount_text = COALESCE($dt, discount_text), promo_code = COALESCE($pc, promo_code),
          image_url = COALESCE($im, image_url), category = COALESCE($ca, category),
          valid_from = COALESCE($vf, valid_from), valid_to = COALESCE($vt, valid_to),
          target_weekdays = COALESCE($tw, target_weekdays),
          target_from_min = COALESCE($tf, target_from_min),
          target_to_min = COALESCE($tt, target_to_min),
          target_languages = COALESCE($tl, target_languages),
          target_audience = COALESCE($ta, target_audience),
          cap_claims = COALESCE($cap, cap_claims),
          cap_spend_minor = COALESCE($caps, cap_spend_minor),
          updated_at = $t
        WHERE id = $i`,
      {
        dt: p.discountText ?? null,
        pc: p.promoCode ?? null,
        im: p.imageUrl ?? null,
        ca: p.category ?? null,
        vf: validFrom ?? null,
        vt: validTo ?? null,
        tw: p.targetWeekdays?.join(',') ?? null,
        tf: p.targetFromMin ?? null,
        tt: p.targetToMin ?? null,
        tl: p.targetLanguages?.join(',') ?? null,
        ta: p.targetAudience?.join(',') ?? null,
        cap: p.capClaims ?? null,
        caps: p.capSpendMinor ?? null,
        t: at,
        i: input.dealId,
      },
    );
    if (p.copy) await writeCopy(db, input.dealId, p.copy, p.aiGenerated ?? false, at);
    await audit.record(db, {
      actorId: input.actorId,
      action: 'deal.update',
      entity: 'hot_deal',
      entityId: input.dealId,
      venueId: before.venue_id,
      before,
      after: p,
      at,
    });
  });

  return await deals.getDeal(db, input.dealId);
}

/**
 * Publish (B3).
 *
 * Three gates, in the order that gives the most useful error first: the venue
 * must be verified (B1), the plan must have room for another live deal (B7), and
 * the deal must have copy in at least one language it can actually be shown in
 * (B3). Publishing a deal nobody can be shown is the failure that looks like
 * success.
 */
export async function publishDeal(
  db: Db,
  input: { dealId: string; actorId: string; at?: Iso },
): Promise<deals.Deal> {
  const at = input.at ?? now();
  const deal = await assertPublishable(db, input.dealId);
  /* Re-read for the two things the audit entry and the moderation row need.
     `assertPublishable` proved them; it does not carry them back, because its
     job is the verdict rather than the payload. */
  const venue = await getVenue(db, deal.venue_id!);
  const filled = await deals.completeness(db, input.dealId);

  const scheduled = deal.valid_from && deal.valid_from > at;
  await db.run(
    `UPDATE hot_deals SET status = $s, published_at = COALESCE(published_at, $t), updated_at = $t
      WHERE id = $i`,
    { s: scheduled ? 'scheduled' : 'live', t: at, i: input.dealId },
  );
  await db.run(
    `INSERT INTO moderation_queue (id, entity, entity_id, venue_id, reason, status, created_at)
     VALUES ($i, 'hot_deal', $d, $v, 'published copy', 'pending', $t)`,
    { i: newId('mod'), d: input.dealId, v: venue.id, t: at },
  );
  await audit.record(db, {
    actorId: input.actorId,
    action: 'deal.publish',
    entity: 'hot_deal',
    entityId: input.dealId,
    venueId: venue.id,
    after: { status: scheduled ? 'scheduled' : 'live', languages: filled.filled },
    at,
  });

  return await deals.getDeal(db, input.dealId);
}

/** What the dashboard lists, with each deal's funnel and translation state. */
export async function dealsFor(db: Db, venueId: string, language = 'en', at: Iso = now()) {
  const venue = await getVenue(db, venueId);
  return await Promise.all((await db
    .all<deals.Deal>(`SELECT * FROM hot_deals WHERE venue_id = $v ORDER BY created_at DESC`, {
      v: venueId,
    }))
    .map(async (deal) => ({
      ...deal,
      funnel: await deals.funnel(db, deal.id),
      translations: await deals.completeness(db, deal.id),
      /* The deal's own words, in the owner's language or the nearest filled
         one. `discount_text` is the *badge* — "20% OFF" — and is not a name; a
         table that prints it twice is what a row looks like with no title
         joined, which is what this list did. Null when nothing is written in
         any language, which the row draws as "no title yet" rather than as a
         blank cell. */
      copy: await deals.copyFor(db, deal.id, language),
      /* The two the partner's table draws beside the totals: the shape of the
         last week's claims, and whatever became of the deal's one notification.
         Both are reads of tables that were already being written — the funnel
         events and `deal_pushes` — rather than anything new being recorded, and
         both are per-deal, which is why they are joined here rather than in
         `analytics`, whose figures are all venue-wide. */
      series: await deals.claimSeries(db, deal.id, 7, at, venue.timezone),
      push: await deals.pushFor(db, deal.id),
    })));
}

/**
 * The three gates a deal has to clear before customers can see it.
 *
 * Extracted so the *two* doors into a public state enforce the same rule.
 * `publishDeal` was one of them; `deals.setStatus` was the other, and it had no
 * gates at all — an unverified venue could reach the public catalogue by asking
 * for the state instead of asking to publish. A rule enforced at one of two
 * doors is a rule with a door left open, so there is now one function and both
 * call it.
 *
 * The order is the order that gives the most useful error first: unverified is
 * a thing an operator fixes, a full plan is a thing the owner fixes, and an
 * empty deal is a thing they fix in the drawer they just left.
 */
export async function assertPublishable(db: Db, dealId: string): Promise<deals.Deal> {
  const deal = await deals.getDeal(db, dealId);
  if (!deal.venue_id) throw new DomainError('invalid_state', 'deal has no venue');
  const venue = await getVenue(db, deal.venue_id);
  requireVerified(venue);

  const ent = await entitlements.entitlementsFor(db, { venueId: venue.id });
  /* The deal being resumed is not counted, because it is not live yet — so the
     comparison is "is there room for one more", which is the same question
     publishing asks. */
  const live =
    (await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM hot_deals
        WHERE venue_id = $v AND status IN ('live', 'scheduled') AND id <> $d`,
      { v: venue.id, d: dealId },
    ))?.n ?? 0;
  entitlements.requireCapacity(ent, 'live_deals', live, 1);

  const filled = await deals.completeness(db, dealId);
  if (filled.filled.length === 0) {
    throw new DomainError('validation_failed', 'a deal needs a title and description in at least one language', {
      missing: filled.missing,
    });
  }
  return deal;
}
