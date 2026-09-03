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

export async function createVenue(
  db: Db,
  input: { ownerId: string; draft: VenueDraft; at?: Iso },
): Promise<Venue> {
  const at = input.at ?? now();
  const ent = await entitlements.entitlementsFor(db, { userId: input.ownerId });

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
        cc: input.draft.countryCode ?? 'PL',
        ad: input.draft.address ?? null,
        la: input.draft.lat ?? null,
        ln: input.draft.lng ?? null,
        tz: input.draft.timezone ?? 'Europe/Warsaw',
        cu: input.draft.currency ?? 'PLN',
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
    await audit.record(db, {
      actorId: input.ownerId,
      action: 'venue.create',
      entity: 'venue',
      entityId: id,
      venueId: id,
      after: input.draft,
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
    at?: Iso;
  },
): Promise<Venue> {
  const at = input.at ?? now();
  const before = await getVenue(db, input.venueId);
  const p = input.patch;

  await db.run(
    `UPDATE venues SET
        name = COALESCE($n, name), category = COALESCE($ca, category),
        subcategory = COALESCE($sc, subcategory), city = COALESCE($ci, city),
        address = COALESCE($ad, address), lat = COALESCE($la, lat), lng = COALESCE($ln, lng),
        timezone = COALESCE($tz, timezone), currency = COALESCE($cu, currency),
        price_range = COALESCE($pr, price_range), image_url = COALESCE($im, image_url),
        phone = COALESCE($ph, phone), email = COALESCE($em, email),
        amount_entry = COALESCE($ae, amount_entry),
        min_spend_minor = COALESCE($ms, min_spend_minor),
        max_amount_minor = COALESCE($mx, max_amount_minor),
        points_per_scan = COALESCE($pps, points_per_scan),
        scan_cooldown_hours = COALESCE($sch, scan_cooldown_hours),
        updated_at = $t
      WHERE id = $v`,
    {
      n: p.name ?? null,
      ca: p.category ?? null,
      sc: p.subcategory ?? null,
      ci: p.city ?? null,
      ad: p.address ?? null,
      la: p.lat ?? null,
      ln: p.lng ?? null,
      tz: p.timezone ?? null,
      cu: p.currency ?? null,
      pr: p.priceRange ?? null,
      im: p.imageUrl ?? null,
      ph: p.phone ?? null,
      em: p.email ?? null,
      ae: p.amountEntry ?? null,
      ms: p.minSpendMinor ?? null,
      mx: p.maxAmountMinor ?? null,
      pps: p.pointsPerScan ?? null,
      sch: p.scanCooldownHours ?? null,
      t: at,
      v: input.venueId,
    },
  );

  await audit.record(db, {
    actorId: input.actorId,
    action: 'venue.update',
    entity: 'venue',
    entityId: input.venueId,
    venueId: input.venueId,
    before,
    after: p,
    at,
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
  links: Array<{ kind: string; value: string }>,
  at: Iso = now(),
): Promise<void> {
  await db.tx(async () => {
    await db.run(`DELETE FROM venue_links WHERE venue_id = $v`, { v: venueId });
    for (const [index, link] of links.entries()) {
      if (!link.value.trim()) continue;
      await db.run(
        `INSERT INTO venue_links (id, venue_id, kind, value, position) VALUES ($i, $v, $k, $val, $p)`,
        { i: newId('lnk'), v: venueId, k: link.kind, val: link.value.trim(), p: index },
      );
    };
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
    tiers: Array<{ discountPct: number; pointsCost: number; maxDiscountMinor: number; active?: boolean }>;
    at?: Iso;
  },
): Promise<void> {
  const at = input.at ?? now();
  await db.tx(async () => {
    for (const tier of input.tiers) {
      if (tier.pointsCost <= 0 || tier.maxDiscountMinor <= 0) {
        throw new DomainError('validation_failed', 'a tier needs a points cost and a cap', {
          discountPct: tier.discountPct,
        });
      }
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
  /* Refuse to shrink a budget below what is already committed: the reserves
     represent vouchers customers are holding, and a pool that cannot honour them
     is a promise already broken. */
  const committed = view.loyalty.spent + view.loyalty.reserved + view.voucher.spent + view.voucher.reserved;
  if (input.totalMinor < committed) {
    throw new DomainError('conflict', 'that is below what is already spent or reserved', {
      committed,
    });
  }

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
    before: { total: view.total },
    after: { total: input.totalMinor, loyaltyBp: input.loyaltyBp },
    at,
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
        vf: input.draft.validFrom ?? null,
        vt: input.draft.validTo ?? null,
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
        vf: p.validFrom ?? null,
        vt: p.validTo ?? null,
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
export async function dealsFor(db: Db, venueId: string) {
  return await Promise.all((await db
    .all<deals.Deal>(`SELECT * FROM hot_deals WHERE venue_id = $v ORDER BY created_at DESC`, {
      v: venueId,
    }))
    .map(async (deal) => ({
      ...deal,
      funnel: await deals.funnel(db, deal.id),
      translations: await deals.completeness(db, deal.id),
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
