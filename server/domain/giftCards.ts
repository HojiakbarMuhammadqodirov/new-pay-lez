/**
 * The gift-card engine — the shelf, the codes behind it, and what happens to a
 * card after it is bought.
 *
 * ## Two kinds, one by market
 *
 * In **Poland** a card is a real brand's code: the operator buys codes from
 * the brand and loads them here (`addCodes`), and a player is handed one of
 * those exact codes, which the brand's own till or website accepts. In
 * **Uzbekistan** a card is **one venue's** own card: there is no brand to buy
 * codes from, so this server generates them (`generateCodes`) and the venue
 * honours what it is shown. Either way the code is spent *at the brand or the
 * venue*, never at our gate — so nothing here can confirm a use, and "used" is
 * what the player or the operator says.
 *
 * ## Stock is codes, and the counter is the gate
 *
 * `gift_card_stock.stock` is the number of codes nobody has been handed, and it
 * stays the purchase gate (`vouchers.redeemGiftCard`, which claims a unit with
 * `stock = stock - 1 WHERE stock > 0` before the points move). It is kept equal
 * to the free codes by doing both in one transaction — loading codes adds what
 * was inserted, a purchase takes one of each — and `reconcileStock` restates it
 * from `gift_card_codes` on every boot, so a drift cannot outlive a restart.
 *
 * ## A code somebody has seen is spent
 *
 * Cancelling a card gives the points back (a compensating `adjustment` entry,
 * never an edit of the spend) and burns the code: it is not returned to the
 * pool, because it may already have been used at the brand and a second buyer
 * would be handed a dead code.
 */
import type { Db } from '../db/db.ts';
import * as audit from './audit.ts';
import * as ledger from './ledger.ts';
import { DomainError } from './errors.ts';
import { newId, shortCode } from './ids.ts';
import { now, plusDays, type Iso } from './time.ts';

export type Kind = 'brand' | 'venue';
export const COUNTRIES = ['PL', 'UZ'] as const;
export type Country = (typeof COUNTRIES)[number];
/** The currencies a face value may be written in. Hundredths of each, always. */
export const CURRENCIES = ['PLN', 'UZS', 'EUR', 'USD'] as const;

/** One request can load this many codes; a brand's export is rarely larger. */
export const MAX_CODES_PER_LOAD = 5000;
/** And generate this many — a venue card is printed in hundreds, not millions. */
export const MAX_GENERATED = 1000;
const MAX_LOGO_CHARS = 400_000;

export interface StockInput {
  brand: string;
  logo?: string;
  faceMinor: number;
  currency: string;
  pointsCost: number;
  priorityOnly?: boolean;
  countryCode: string;
  kind: Kind;
  venueId?: string | null;
  validityDays: number;
  howToUse?: string;
}

function check(condition: boolean, field: string, message: string): void {
  if (!condition) throw new DomainError('validation_failed', message, { field });
}

/**
 * A logo is a small picture the console made from a file, or nothing.
 *
 * Raster `data:` URLs only, and short: the shelf is public, and a URL to
 * somewhere else would be the third-party request the site is built to avoid.
 */
function validLogo(logo: string | undefined): string {
  const value = (logo ?? '').trim();
  if (value === '') return '';
  check(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value), 'logo', 'logo must be a PNG, JPEG, WebP or GIF picture');
  check(value.length <= MAX_LOGO_CHARS, 'logo', 'logo is too large');
  return value;
}

async function validated(db: Db, input: StockInput): Promise<StockInput & { logo: string; howToUse: string }> {
  const brand = input.brand.trim();
  check(brand.length >= 1 && brand.length <= 80, 'brand', 'name must be 1–80 characters');
  check(Number.isInteger(input.faceMinor) && input.faceMinor > 0, 'faceMinor', 'face value must be a positive whole number');
  check((CURRENCIES as readonly string[]).includes(input.currency), 'currency', `currency must be one of ${CURRENCIES.join(', ')}`);
  check(Number.isInteger(input.pointsCost) && input.pointsCost > 0, 'pointsCost', 'points price must be a positive whole number');
  check((COUNTRIES as readonly string[]).includes(input.countryCode), 'countryCode', 'country must be PL or UZ');
  check(input.kind === 'brand' || input.kind === 'venue', 'kind', "kind must be 'brand' or 'venue'");
  check(Number.isInteger(input.validityDays) && input.validityDays >= 1 && input.validityDays <= 3650, 'validityDays', 'validity must be 1–3650 days');
  const howToUse = (input.howToUse ?? '').trim();
  check(howToUse.length <= 600, 'howToUse', 'how-to-use text must be at most 600 characters');

  let venueId: string | null = null;
  if (input.kind === 'venue') {
    check(typeof input.venueId === 'string' && input.venueId.trim() !== '', 'venueId', 'a venue card needs its venue');
    const venue = await db.get<{ id: string }>(`SELECT id FROM venues WHERE id = $v`, { v: input.venueId!.trim() });
    if (!venue) throw new DomainError('not_found', 'no such venue', { field: 'venueId' });
    venueId = venue.id;
  }
  return { ...input, brand, venueId, logo: validLogo(input.logo), howToUse };
}

/* ═════════════════════════════════════════════════════════════ the shelf ══ */

/**
 * What a player can buy: active, in stock or not, for their country.
 *
 * `country` null is every country — a visitor with no account, or a client
 * that did not say. Sold-out rows stay listed, because "this exists and is gone
 * for now" is information and an empty shelf is not.
 */
export async function shelf(db: Db, country: string | null) {
  return await db.all(
    `SELECT s.id, s.brand, s.logo, s.face_minor, s.currency, s.points_cost, s.stock, s.priority_only,
            s.country_code, s.kind, s.venue_id, v.name AS venue_name, s.validity_days, s.how_to_use
       FROM gift_card_stock s LEFT JOIN venues v ON v.id = s.venue_id
      WHERE s.active = 1 AND ($c IS NULL OR s.country_code = $c)
      ORDER BY s.points_cost, s.brand`,
    { c: country },
  );
}

/** Every shelf row, live or paused, with what has happened to its codes. */
export async function adminList(db: Db) {
  return await db.all(
    `SELECT s.id, s.brand, s.logo, s.face_minor, s.currency, s.points_cost, s.stock, s.priority_only,
            s.active, s.country_code, s.kind, s.venue_id, v.name AS venue_name, s.validity_days,
            s.how_to_use, s.created_at, s.updated_at,
            (SELECT COUNT(*) FROM gift_card_codes c WHERE c.stock_id = s.id) AS codes_total,
            (SELECT COUNT(*) FROM gift_cards g WHERE g.stock_id = s.id) AS issued,
            (SELECT COUNT(*) FROM gift_cards g WHERE g.stock_id = s.id AND g.status = 'active') AS active_cards,
            (SELECT COUNT(*) FROM gift_cards g WHERE g.stock_id = s.id AND g.status = 'used') AS used_cards,
            (SELECT COUNT(*) FROM gift_cards g WHERE g.stock_id = s.id AND g.status = 'expired') AS expired_cards,
            (SELECT COUNT(*) FROM gift_cards g WHERE g.stock_id = s.id AND g.status = 'cancelled') AS cancelled_cards
       FROM gift_card_stock s LEFT JOIN venues v ON v.id = s.venue_id
      ORDER BY s.active DESC, s.country_code, s.brand`,
  );
}

export async function create(db: Db, input: StockInput, actorId: string, at: Iso = now()): Promise<{ id: string }> {
  const value = await validated(db, input);
  const id = newId('gcs');
  await db.run(
    `INSERT INTO gift_card_stock
       (id, brand, logo, face_minor, currency, points_cost, stock, priority_only, active,
        country_code, kind, venue_id, validity_days, how_to_use, created_at, updated_at)
     VALUES ($i, $b, $l, $f, $c, $p, 0, $pr, 1, $cc, $k, $v, $d, $h, $t, $t)`,
    {
      i: id,
      b: value.brand,
      l: value.logo,
      f: value.faceMinor,
      c: value.currency,
      p: value.pointsCost,
      pr: value.priorityOnly ? 1 : 0,
      cc: value.countryCode,
      k: value.kind,
      v: value.venueId ?? null,
      d: value.validityDays,
      h: value.howToUse,
      t: at,
    },
  );
  await audit.record(db, {
    actorId,
    actorRole: 'admin',
    action: 'gift_card.create',
    entity: 'gift_card_stock',
    entityId: id,
    after: { ...value, logo: value.logo ? '(picture)' : '' },
    at,
  });
  return { id };
}

/**
 * Change what a shelf row says and costs.
 *
 * Safe for anybody already holding one: their card carries the face value and
 * the points it was bought for (`gift_cards.face_minor`, `points_spent`), so an
 * edit here reaches the next buyer and nobody before them. The kind cannot
 * change — a brand row's codes were bought from a brand, and a venue row's were
 * generated for a venue; turning one into the other would leave its codes
 * meaning the wrong thing.
 */
export async function update(
  db: Db,
  id: string,
  patch: Partial<Omit<StockInput, 'kind'>>,
  actorId: string,
  at: Iso = now(),
): Promise<void> {
  const row = await db.get<{
    brand: string; logo: string; face_minor: number; currency: string; points_cost: number;
    priority_only: number; country_code: string; kind: Kind; venue_id: string | null;
    validity_days: number; how_to_use: string;
  }>(`SELECT * FROM gift_card_stock WHERE id = $i`, { i: id });
  if (!row) throw new DomainError('not_found', 'no such gift card');

  const before: StockInput = {
    brand: row.brand,
    logo: row.logo,
    faceMinor: Number(row.face_minor),
    currency: row.currency,
    pointsCost: Number(row.points_cost),
    priorityOnly: Number(row.priority_only) === 1,
    countryCode: row.country_code,
    kind: row.kind,
    venueId: row.venue_id,
    validityDays: Number(row.validity_days),
    howToUse: row.how_to_use,
  };
  const value = await validated(db, {
    ...before,
    ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
    kind: row.kind,
  });
  await db.run(
    `UPDATE gift_card_stock
        SET brand = $b, logo = $l, face_minor = $f, currency = $c, points_cost = $p,
            priority_only = $pr, country_code = $cc, venue_id = $v, validity_days = $d,
            how_to_use = $h, updated_at = $t
      WHERE id = $i`,
    {
      i: id,
      b: value.brand,
      l: value.logo,
      f: value.faceMinor,
      c: value.currency,
      p: value.pointsCost,
      pr: value.priorityOnly ? 1 : 0,
      cc: value.countryCode,
      v: value.venueId ?? null,
      d: value.validityDays,
      h: value.howToUse,
      t: at,
    },
  );
  const strip = (input: StockInput) => ({ ...input, logo: input.logo ? '(picture)' : '' });
  await audit.record(db, {
    actorId,
    actorRole: 'admin',
    action: 'gift_card.update',
    entity: 'gift_card_stock',
    entityId: id,
    before: strip(before),
    after: strip(value),
    at,
  });
}

/** Pause a row (off the shelf, codes kept) or put it back. */
export async function setActive(db: Db, id: string, active: boolean, actorId: string, at: Iso = now()): Promise<void> {
  const changed = await db.run(`UPDATE gift_card_stock SET active = $a, updated_at = $t WHERE id = $i`, {
    a: active ? 1 : 0,
    t: at,
    i: id,
  });
  if (changed.changes === 0) throw new DomainError('not_found', 'no such gift card');
  await audit.record(db, {
    actorId,
    actorRole: 'admin',
    action: active ? 'gift_card.resume' : 'gift_card.pause',
    entity: 'gift_card_stock',
    entityId: id,
    at,
  });
}

/* ═════════════════════════════════════════════════════════════ the codes ══ */

async function kindOf(db: Db, id: string): Promise<Kind> {
  const row = await db.get<{ kind: Kind }>(`SELECT kind FROM gift_card_stock WHERE id = $i`, { i: id });
  if (!row) throw new DomainError('not_found', 'no such gift card');
  return row.kind;
}

async function insertCodes(db: Db, stockId: string, codes: string[], at: Iso): Promise<number> {
  let added = 0;
  /* Loads are an operator's, one at a time, inside a transaction: reading the
     high-water mark once is enough to keep the order they were loaded in. */
  let seq = Number((await db.get<{ m: number | null }>(`SELECT MAX(seq) AS m FROM gift_card_codes WHERE stock_id = $s`, { s: stockId }))?.m ?? 0);
  for (const code of codes) {
    const exists = await db.get(`SELECT 1 AS x FROM gift_card_codes WHERE stock_id = $s AND code = $c`, {
      s: stockId,
      c: code,
    });
    if (exists) continue;
    await db.run(
      `INSERT INTO gift_card_codes (id, stock_id, code, added_at, seq) VALUES ($i, $s, $c, $t, $q)`,
      { i: newId('gcc'), s: stockId, c: code, t: at, q: (seq += 1) },
    );
    added += 1;
  }
  if (added > 0) {
    await db.run(`UPDATE gift_card_stock SET stock = stock + $n, updated_at = $t WHERE id = $s`, {
      n: added,
      t: at,
      s: stockId,
    });
  }
  return added;
}

/**
 * Load a brand's real codes. Blank lines go, surrounding space goes, and a code
 * already on this card — earlier in the same paste, or loaded last week — is
 * counted as a duplicate rather than loaded twice: a brand code handed to two
 * people is a support ticket for one of them.
 */
export async function addCodes(
  db: Db,
  stockId: string,
  raw: string[],
  actorId: string,
  at: Iso = now(),
): Promise<{ added: number; duplicates: number; rejected: number }> {
  if ((await kindOf(db, stockId)) !== 'brand') {
    throw new DomainError('invalid_state', "a venue card's codes are generated, not loaded");
  }
  const cleaned = raw.map((code) => String(code).trim()).filter((code) => code !== '');
  check(cleaned.length > 0, 'codes', 'no codes to load');
  check(cleaned.length <= MAX_CODES_PER_LOAD, 'codes', `at most ${MAX_CODES_PER_LOAD} codes at a time`);
  /* Printable and short: a code is read off a phone at a till. */
  const valid = cleaned.filter((code) => code.length <= 128 && /^[\x21-\x7E]+$/.test(code));
  const unique = [...new Set(valid)];

  const added = await db.tx(async () => await insertCodes(db, stockId, unique, at));
  await audit.record(db, {
    actorId,
    actorRole: 'admin',
    action: 'gift_card.codes_load',
    entity: 'gift_card_stock',
    entityId: stockId,
    after: { added, received: cleaned.length },
    at,
  });
  return { added, duplicates: valid.length - added, rejected: cleaned.length - valid.length };
}

/** A venue card's own codes, made here. `UZ-` + two blocks of the counter alphabet. */
export async function generateCodes(
  db: Db,
  stockId: string,
  count: number,
  actorId: string,
  at: Iso = now(),
): Promise<{ added: number }> {
  if ((await kindOf(db, stockId)) !== 'venue') {
    throw new DomainError('invalid_state', "a brand card's codes come from the brand, and are loaded");
  }
  check(Number.isInteger(count) && count >= 1 && count <= MAX_GENERATED, 'count', `generate 1–${MAX_GENERATED} codes at a time`);
  const codes = new Set<string>();
  while (codes.size < count) codes.add(`UZ-${shortCode(4)}-${shortCode(4)}`);
  const added = await db.tx(async () => await insertCodes(db, stockId, [...codes], at));
  await audit.record(db, {
    actorId,
    actorRole: 'admin',
    action: 'gift_card.codes_generate',
    entity: 'gift_card_stock',
    entityId: stockId,
    after: { added },
    at,
  });
  return { added };
}

/**
 * Take the oldest free code for a card that is being bought — inside the
 * purchase's transaction, after it has claimed a unit of `stock`.
 *
 * The stock claim already holds that row's lock, so two buyers reach this one
 * after the other and the second sees the first's code taken; the guarded
 * UPDATE is the belt to those braces.
 */
export async function claimCode(db: Db, stockId: string): Promise<{ id: string; code: string }> {
  const free = await db.get<{ id: string; code: string }>(
    `SELECT id, code FROM gift_card_codes WHERE stock_id = $s AND card_id IS NULL
      ORDER BY added_at, seq, id LIMIT 1`,
    { s: stockId },
  );
  if (!free) throw new DomainError('conflict', 'out of stock');
  return free;
}

export async function bindCode(db: Db, codeId: string, cardId: string, at: Iso): Promise<void> {
  const bound = await db.run(
    `UPDATE gift_card_codes SET card_id = $c, issued_at = $t WHERE id = $i AND card_id IS NULL`,
    { c: cardId, t: at, i: codeId },
  );
  if (bound.changes !== 1) throw new DomainError('conflict', 'out of stock');
}

/** `stock` restated from the codes. Run on boot; correct at any time. */
export async function reconcileStock(db: Db): Promise<void> {
  await db.run(
    `UPDATE gift_card_stock
        SET stock = (SELECT COUNT(*) FROM gift_card_codes c
                      WHERE c.stock_id = gift_card_stock.id AND c.card_id IS NULL)`,
  );
}

/* ══════════════════════════════════════════════════════ cards once bought ══ */

export async function issued(db: Db, filter: { stockId?: string | null; status?: string | null; limit?: number }) {
  return await db.all(
    `SELECT g.id, g.code, g.status, g.points_spent, g.issued_at, g.expires_at, g.used_at, g.used_by,
            g.cancelled_at, COALESCE(g.face_minor, s.face_minor) AS face_minor,
            COALESCE(g.currency, s.currency) AS currency, s.id AS stock_id, s.brand, s.country_code,
            u.id AS user_id, u.display_name, u.email
       FROM gift_cards g
       JOIN gift_card_stock s ON s.id = g.stock_id
       JOIN users u ON u.id = g.user_id
      WHERE ($s IS NULL OR g.stock_id = $s) AND ($st IS NULL OR g.status = $st)
      ORDER BY g.issued_at DESC LIMIT $l`,
    { s: filter.stockId ?? null, st: filter.status ?? null, l: Math.min(Math.max(filter.limit ?? 200, 1), 500) },
  );
}

/**
 * The code was spent at the brand or the venue.
 *
 * The player says so from the wallet, about their own card; the operator from
 * the console, about anybody's. Only an active card can be used — a cancelled
 * one was refunded, and an expired one is past the date the brand honours.
 */
export async function markUsed(
  db: Db,
  input: { cardId: string; by: 'player' | 'admin'; userId?: string; actorId?: string; at?: Iso },
): Promise<void> {
  const at = input.at ?? now();
  const card = await db.get<{ user_id: string; status: string }>(
    `SELECT user_id, status FROM gift_cards WHERE id = $i`,
    { i: input.cardId },
  );
  /* Somebody else's card is a not-found, not a forbidden: a client must not be
     able to learn which ids exist. */
  if (!card || (input.by === 'player' && card.user_id !== input.userId)) {
    throw new DomainError('not_found', 'no such gift card');
  }
  if (card.status !== 'active') throw new DomainError('invalid_state', `this card is ${card.status}`);
  const changed = await db.run(
    `UPDATE gift_cards SET status = 'used', used_at = $t, used_by = $b WHERE id = $i AND status = 'active'`,
    { t: at, b: input.by, i: input.cardId },
  );
  if (changed.changes !== 1) throw new DomainError('invalid_state', 'this card is no longer active');
  if (input.by === 'admin') {
    await audit.record(db, {
      actorId: input.actorId ?? null,
      actorRole: 'admin',
      action: 'gift_card.mark_used',
      entity: 'gift_cards',
      entityId: input.cardId,
      at,
    });
  }
}

/**
 * Void a card and give its points back.
 *
 * The refund is a new `adjustment` entry for exactly what was spent, so the
 * ledger keeps both halves and the balance is still derived from it; the spend
 * is never edited. Claimed with a guarded UPDATE first, so two presses refund
 * once. The code is burned — see the header.
 */
export async function cancel(
  db: Db,
  cardId: string,
  actorId: string,
  at: Iso = now(),
): Promise<{ refunded: number }> {
  return await db.tx(async () => {
    const card = await db.get<{ user_id: string; status: string; points_spent: number }>(
      `SELECT user_id, status, points_spent FROM gift_cards WHERE id = $i`,
      { i: cardId },
    );
    if (!card) throw new DomainError('not_found', 'no such gift card');
    if (card.status !== 'active') throw new DomainError('invalid_state', `this card is ${card.status}`);

    const claimed = await db.run(
      `UPDATE gift_cards SET status = 'cancelled', cancelled_at = $t WHERE id = $i AND status = 'active'`,
      { t: at, i: cardId },
    );
    if (claimed.changes !== 1) throw new DomainError('invalid_state', 'this card is no longer active');

    const points = Number(card.points_spent);
    const { entry } = await ledger.earn(db, {
      userId: card.user_id,
      points,
      reason: 'adjustment',
      sourceKind: 'gift_card_refund',
      sourceRef: cardId,
      at,
    });
    await db.run(`UPDATE gift_cards SET refund_ledger_id = $l WHERE id = $i`, { l: entry.id, i: cardId });
    await audit.record(db, {
      actorId,
      actorRole: 'admin',
      action: 'gift_card.cancel',
      entity: 'gift_cards',
      entityId: cardId,
      after: { refunded: points, ledgerId: entry.id },
      at,
    });
    return { refunded: points };
  });
}

/** Active cards past their date become expired. Daily job; idempotent. */
export async function expire(db: Db, at: Iso = now()): Promise<number> {
  return (
    await db.run(`UPDATE gift_cards SET status = 'expired' WHERE status = 'active' AND expires_at <= $t`, { t: at })
  ).changes;
}

/** When a card bought now stops being valid. */
export const expiresAt = (at: Iso, validityDays: number): Iso => plusDays(at, validityDays);
