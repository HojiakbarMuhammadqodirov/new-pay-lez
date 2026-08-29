/**
 * The old database, imported.
 *
 * `new-data/` is a Base44 export of the Paylez app that already ran: 308
 * directory listings, 130 guidance articles, 14 hot deals with 844 funnel
 * events, three venues with live loyalty configuration, the people who used it,
 * and a rate sheet. This module is the one place that knows the old shapes, so
 * the domain layer never has to.
 *
 * Three decisions worth stating, because each one is a place the export and the
 * spec disagree and something had to give:
 *
 * 1. **Ids are preserved.** A venue keeps the 24-hex id its listing had, so a
 *    row in the new database can still be found in the export it came from. Only
 *    rows with no ancestor get a `prefix_` id.
 * 2. **A directory listing is not a venue.** 308 services are a guidebook; a
 *    `venues` row is a *partner* — somebody who configured a budget, a campaign,
 *    a scan rate or a deal. The import promotes exactly those and leaves the
 *    rest as guidance content, which is what they are.
 * 3. **A balance is imported as a ledger entry, not as a number.** §2.1 says the
 *    balance is derived and never stored as an authoritative standalone value.
 *    So each migrated user gets one `adjustment` entry with
 *    `source_kind = 'legacy_import'`, and their balance is the sum of it like
 *    everybody else's. There is no back door for the migration.
 *
 * One conversion is genuinely lossy and is reported as such: the old
 * `LoyaltyVoucherCampaign` rows are *percentage* rewards on a visit trigger,
 * which §5.1 forbids — a percentage is a voucher, a visit campaign pays a fixed
 * item with a known cost. They are imported as fixed-value campaigns whose cost
 * is that percentage of the venue's average check, which is the only translation
 * that keeps the budget arithmetic exact.
 */
import { join } from 'node:path';
import type { Db } from './db.ts';
import { bool, json, num, opt, readCsv, str, ts, type CsvRow } from './csv.ts';
import { CONFIG } from '../config.ts';
import { assertComplete, codeFor, flagOf } from './countries.ts';
import { newId, referralCode } from '../domain/ids.ts';
import { localMonth, now } from '../domain/time.ts';

/* Mirrors the sentinel in `domain/ledger.ts`: `points_lots.expires_at` is NOT
   NULL and FIFO spending orders by it, so a lot that never expires needs a date
   that sorts last rather than an absent one. Duplicated rather than exported
   because the ledger keeps it private and one constant is a smaller coupling
   than widening that module's surface for an importer that runs once. */
const NEVER = '9999-12-31T23:59:59.999Z';

/** Every language any table in the export carries copy in. */
const LANGS = ['en', 'pl', 'uz', 'ru', 'uk', 'tr', 'az'] as const;

export interface ImportSummary {
  counts: Record<string, number>;
  notes: string[];
}

export function importLegacy(db: Db, dir: string, gamesDir?: string): ImportSummary {
  const at = now();
  const counts: Record<string, number> = {};
  const notes: string[] = [];
  const bump = (key: string, by = 1) => {
    counts[key] = (counts[key] ?? 0) + by;
  };

  const file = (name: string) => readCsv(join(dir, `${name}_export.csv`));

  /* ─────────────────────────────────────────────── translations, one helper ── */

  const putText = (entity: string, id: string, field: string, lang: string, value: string) => {
    if (!value.trim()) return;
    db.run(
      `INSERT INTO translations (entity, entity_id, field, language, value, updated_at)
       VALUES ($e, $i, $f, $l, $v, $t)
       ON CONFLICT (entity, entity_id, field, language)
       DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      { e: entity, i: id, f: field, l: lang, v: value.trim(), t: at },
    );
  };

  /** `title_en`, `title_ru`, … → one row per language that is actually filled. */
  const putSuffixed = (entity: string, id: string, field: string, row: CsvRow, prefix: string) => {
    for (const lang of LANGS) putText(entity, id, field, lang, str(row, `${prefix}_${lang}`));
  };

  /* ────────────────────────────────────────────────────────────────── users ── */

  /**
   * The export identifies a person three ways — a Base44 account id, an email,
   * and (in GameProgress) a `PY####` code — and no single table has all three.
   * So users are resolved into one registry keyed by both id and email, and the
   * first sighting wins the row.
   */
  const byId = new Map<string, string>();
  const byEmail = new Map<string, string>();

  const isService = (id: string) => id === '' || id.startsWith('service_');

  function userFor(
    base44Id: string,
    email: string,
    name = '',
    created: string | null = null,
  ): string | null {
    const mail = email.trim().toLowerCase();
    if (isService(base44Id) && !mail) return null;

    /* The in-memory registry first, then the database. The second half is what
       makes a re-import work at all: on the second run the maps start empty, and
       without the lookup every returning person is a fresh INSERT that fails on
       the unique address — which is what `npm run server:import` does. */
    const known =
      (!isService(base44Id) && byId.get(base44Id)) ||
      (mail && byEmail.get(mail)) ||
      (!isService(base44Id) &&
        db.get<{ id: string }>(`SELECT id FROM users WHERE id = $i`, { i: base44Id })?.id) ||
      (mail && db.get<{ id: string }>(`SELECT id FROM users WHERE email_norm = $e`, { e: mail })?.id);

    if (known) {
      if (name) {
        db.run(
          `UPDATE users SET display_name = $n, updated_at = $t
             WHERE id = $i AND (display_name = '' OR display_name IS NULL)`,
          { n: name, i: known, t: at },
        );
      }
      if (!isService(base44Id)) byId.set(base44Id, known);
      if (mail) byEmail.set(mail, known);
      return known;
    }

    const id = isService(base44Id) ? newId('usr') : base44Id;
    db.run(
      `INSERT INTO users (id, email, email_norm, display_name, auth_provider, language,
                          status, trust_tier, created_at, updated_at)
       VALUES ($i, $e, $n, $d, 'email', 'en', 'active', 1, $c, $t)`,
      {
        i: id,
        e: mail || null,
        n: mail || null,
        d: name || (mail ? mail.split('@')[0] : 'Paylez user'),
        c: created ?? at,
        t: at,
      },
    );
    db.run(
      `INSERT OR IGNORE INTO user_roles (user_id, role, granted_at) VALUES ($u, 'consumer', $t)`,
      { u: id, t: at },
    );
    if (!isService(base44Id)) byId.set(base44Id, id);
    if (mail) byEmail.set(mail, id);
    bump('users');
    return id;
  }

  /* ─────────────────────────────────────────────── 1. reference: fx rates ── */

  for (const row of file('ExchangeRate')) {
    const base = str(row, 'base_currency') || 'EUR';
    const rates = json<Record<string, number>>(row, 'rates', {});
    const updated = ts(row, 'last_updated', at) ?? at;

    /* The export stores all 342 ordered pairs. Only the anchor's row is kept —
       one anchor makes every cross rate `to / from` and exact, which is the rule
       `src/site/i18n/fx.ts` already states on the front end. */
    const write = (code: string, rate: number) =>
      db.run(
        `INSERT INTO exchange_rates (code, base, rate, decimals, updated_at)
         VALUES ($c, $b, $r, $d, $u)
         ON CONFLICT (code) DO UPDATE SET rate = excluded.rate, updated_at = excluded.updated_at`,
        { c: code, b: base, r: rate, d: code === 'UZS' ? 0 : 2, u: updated },
      );

    write(base, 1);
    bump('rates');
    for (const [pair, rate] of Object.entries(rates)) {
      const match = pair.match(new RegExp(`^${base}_to_(\\w+)$`));
      if (!match || typeof rate !== 'number') continue;
      write(match[1], rate);
      bump('rates');
    }
  }

  /* ───────────────────────────────────────── 2. guidance: the content half ── */

  for (const row of file('GuidanceCategory')) {
    const id = str(row, 'id');
    db.run(
      `INSERT OR REPLACE INTO guidance_categories (id, key, country_code, icon, color, position, active)
       VALUES ($i, $k, $c, $ic, $co, $p, $a)`,
      {
        i: id,
        k: str(row, 'key'),
        c: str(row, 'country_code') || 'PL',
        ic: opt(row, 'icon'),
        co: opt(row, 'color'),
        p: num(row, 'order'),
        a: bool(row, 'is_active'),
      },
    );
    putSuffixed('guidance_category', id, 'title', row, 'title');
    putSuffixed('guidance_category', id, 'description', row, 'description');
    bump('guidance_categories');
  }

  for (const row of file('GuidanceSubcategory')) {
    const id = str(row, 'id');
    db.run(
      `INSERT OR REPLACE INTO guidance_subcategories (id, key, parent_key, icon, color, position, active)
       VALUES ($i, $k, $p, $ic, $co, $o, $a)`,
      {
        i: id,
        k: str(row, 'subcategory_key'),
        p: str(row, 'parent_category_key'),
        ic: opt(row, 'icon'),
        co: opt(row, 'color'),
        o: num(row, 'order'),
        a: bool(row, 'is_active'),
      },
    );
    putSuffixed('guidance_subcategory', id, 'title', row, 'title');
    bump('guidance_subcategories');
  }

  /** service id → the row, so the venue promotion below can read its address. */
  const services = new Map<string, CsvRow>();

  for (const row of file('GuidanceService')) {
    const id = str(row, 'id');
    services.set(id, row);
    db.run(
      `INSERT OR REPLACE INTO guidance_services
         (id, venue_id, name, category_key, subcategories, city, country_code, country_codes,
          address, lat, lng, phone, email, price_range, rating, review_count, image_url,
          accepts_vouchers, voucher_limit, active, position, created_at, updated_at)
       VALUES ($i, NULL, $n, $ck, $sc, $ci, $cc, $ccs, $ad, $la, $ln, $ph, $em, $pr,
               $ra, $rc, $im, $av, $vl, $ac, $po, $cr, $up)`,
      {
        i: id,
        n: str(row, 'service_name'),
        ck: opt(row, 'category_key'),
        sc: JSON.stringify(json<string[]>(row, 'subcategories', [])),
        ci: opt(row, 'city'),
        cc: str(row, 'country_code') || 'PL',
        ccs: JSON.stringify(json<string[]>(row, 'country_codes', [])),
        ad: opt(row, 'address'),
        la: str(row, 'location_lat') ? num(row, 'location_lat') : null,
        ln: str(row, 'location_lng') ? num(row, 'location_lng') : null,
        ph: opt(row, 'phone'),
        em: opt(row, 'email'),
        pr: opt(row, 'price_range'),
        ra: str(row, 'rating') ? num(row, 'rating') : null,
        rc: num(row, 'review_count'),
        im: opt(row, 'image_url'),
        av: bool(row, 'accepts_vouchers'),
        vl: str(row, 'voucher_limit') ? num(row, 'voucher_limit') : null,
        ac: bool(row, 'is_active'),
        po: num(row, 'order'),
        cr: ts(row, 'created_date', at),
        up: ts(row, 'updated_date', at),
      },
    );
    /* The description is single-language in the export (English), so it is filed
       under `en` rather than guessed at. The other four are a translation job,
       and an empty row is the honest record of that. */
    putText('guidance_service', id, 'description', 'en', str(row, 'description'));

    for (const [kind, key] of [
      ['website', 'website'],
      ['google_maps', 'google_maps_link'],
      ['instagram', 'instagram_link'],
      ['app_store', 'app_store_link'],
      ['play_store', 'play_market_link'],
    ] as const) {
      const value = opt(row, key);
      if (value) {
        db.run(
          `INSERT OR REPLACE INTO guidance_service_links (service_id, kind, value)
           VALUES ($s, $k, $v)`,
          { s: id, k: kind, v: value },
        );
      }
    }
    bump('guidance_services');
  }

  for (const row of file('GuidanceArticle')) {
    const id = str(row, 'id');
    db.run(
      `INSERT OR REPLACE INTO guidance_articles
         (id, category_key, category_id, country_code, position, active, created_at, updated_at)
       VALUES ($i, $ck, $ci, $cc, $p, $a, $cr, $up)`,
      {
        i: id,
        ck: opt(row, 'category_key'),
        ci: opt(row, 'category_id'),
        cc: str(row, 'country_code') || 'PL',
        p: num(row, 'order'),
        a: bool(row, 'is_active'),
        cr: ts(row, 'created_date', at),
        up: ts(row, 'updated_date', at),
      },
    );
    putSuffixed('guidance_article', id, 'heading', row, 'heading');
    putSuffixed('guidance_article', id, 'content', row, 'content');
    bump('guidance_articles');
  }

  for (const row of file('NewsFeed')) {
    const id = str(row, 'id');
    db.run(
      `INSERT OR REPLACE INTO news_items
         (id, country_code, icon, color, position, active, published_at, created_at)
       VALUES ($i, $cc, $ic, $co, $p, $a, $pu, $cr)`,
      {
        i: id,
        cc: str(row, 'country_code') || 'PL',
        ic: opt(row, 'icon'),
        co: opt(row, 'color'),
        p: num(row, 'order'),
        a: bool(row, 'is_active'),
        pu: ts(row, 'published_date', null),
        cr: ts(row, 'created_date', at),
      },
    );
    putSuffixed('news_item', id, 'title', row, 'title');
    putSuffixed('news_item', id, 'content', row, 'content');
    bump('news_items');
  }

  /* ───────────────────────────────────── 3. people, and what they carried ── */

  for (const row of file('CommunityProfile')) {
    const user = userFor(
      str(row, 'created_by_id'),
      str(row, 'email') || str(row, 'created_by'),
      str(row, 'user_name'),
      ts(row, 'created_date', at),
    );
    const id = str(row, 'id');
    db.run(
      `INSERT OR REPLACE INTO community_profiles
         (id, user_id, display_name, email, city, country_code, work, bio, interests,
          languages, telegram, instagram, whatsapp, visible, created_at, updated_at)
       VALUES ($i, $u, $d, $e, $c, $cc, $w, $b, $in, $l, $tg, $ig, $wa, $v, $cr, $up)`,
      {
        i: id,
        u: user,
        d: str(row, 'user_name'),
        e: opt(row, 'email'),
        c: opt(row, 'city'),
        cc: opt(row, 'country_code'),
        w: opt(row, 'work'),
        b: opt(row, 'bio'),
        in: opt(row, 'interests'),
        l: JSON.stringify(json<string[]>(row, 'languages', [])),
        tg: opt(row, 'telegram'),
        ig: opt(row, 'instagram'),
        wa: opt(row, 'whatsapp'),
        v: bool(row, 'is_visible'),
        cr: ts(row, 'created_date', at),
        up: ts(row, 'updated_date', at),
      },
    );
    /* A profile that says which city you are in is the same fact the account
       carries (§1.1), so it is copied up rather than left in one table. */
    if (user) {
      db.run(`UPDATE users SET city = COALESCE(city, $c), country_code = COALESCE(country_code, $cc) WHERE id = $u`, {
        c: opt(row, 'city'),
        cc: opt(row, 'country_code'),
        u: user,
      });
    }
    bump('community_profiles');
  }

  /** user id → the opening balance their old rows add up to. */
  const opening = new Map<string, number>();
  const addOpening = (user: string, points: number) => {
    if (points > 0) opening.set(user, (opening.get(user) ?? 0) + points);
  };

  for (const row of file('GameProgress')) {
    const user = userFor(
      str(row, 'created_by_id'),
      str(row, 'created_by') || str(row, 'user_email'),
      str(row, 'user_name'),
      ts(row, 'created_date', at),
    );
    if (!user) continue;

    db.run(
      `INSERT OR REPLACE INTO player_states
         (user_id, streak, longest_streak, freezes, lives, answered, correct,
          last_played, difficulty, updated_at)
       VALUES ($u, $s, $l, 0, $li, $a, $c, $lp, $d, $t)`,
      {
        u: user,
        s: num(row, 'current_streak'),
        l: num(row, 'longest_streak'),
        li: Math.min(CONFIG.points.dailyEnergy, num(row, 'lives', CONFIG.points.dailyEnergy)),
        a: num(row, 'questions_answered'),
        c: num(row, 'correct_answers'),
        lp: (ts(row, 'last_played', null) ?? '').slice(0, 10) || null,
        d: num(row, 'current_difficulty', 3),
        t: at,
      },
    );
    /* `user_id` in this table is the old `PY####` referral code, not an id. */
    const code = str(row, 'user_id');
    if (code) {
      db.run(`UPDATE users SET referral_code = COALESCE(referral_code, $c) WHERE id = $u`, {
        c: code,
        u: user,
      });
    }
    addOpening(user, num(row, 'total_score'));
    bump('player_states');
  }

  for (const row of file('ReferralRewards')) {
    const user = userFor(str(row, 'created_by_id'), str(row, 'created_by'), '', ts(row, 'created_date', at));
    if (!user) continue;
    const code = str(row, 'referral_code');
    if (code) {
      db.run(`UPDATE users SET referral_code = COALESCE(referral_code, $c) WHERE id = $u`, {
        c: code,
        u: user,
      });
    }
    /* `points` is the old balance and `points_used` what was already spent, so
       the opening entry is the difference — importing the gross would hand back
       points the user had already redeemed. */
    addOpening(user, num(row, 'points') - num(row, 'points_used'));
    bump('referral_rewards');
  }

  for (const row of file('Referral')) {
    const referrer = userFor('', str(row, 'referrer_email'));
    const referredEmail = str(row, 'referred_email');
    const referred = referredEmail ? userFor('', referredEmail) : null;
    if (!referrer) continue;
    const status = str(row, 'status') === 'completed' ? 'completed' : 'pending';
    db.run(
      `INSERT OR REPLACE INTO referrals
         (id, referrer_id, referred_id, referred_email, code, status, points_awarded,
          created_at, completed_at)
       VALUES ($i, $r, $rd, $re, $c, $s, $p, $cr, $co)`,
      {
        i: str(row, 'id'),
        r: referrer,
        rd: referred,
        re: referredEmail || null,
        c:
          (db.get<{ referral_code: string | null }>(
            `SELECT referral_code FROM users WHERE id = $u`,
            { u: referrer },
          )?.referral_code) ?? referralCode(),
        s: status,
        p: num(row, 'points_awarded'),
        cr: ts(row, 'created_date', at),
        co: status === 'completed' ? ts(row, 'updated_date', at) : null,
      },
    );
    bump('referrals');
  }

  /* ─────────────────────────────────── 4. venues: the partners among them ── */

  /**
   * A service is promoted to a venue when a partner artefact points at it — a
   * budget, a scan configuration, a stamp campaign or a deal. Everything else
   * stays a guidebook entry, which is what it is.
   */
  const voucherCampaigns = file('DiscountVoucherCampaign');
  const loyaltyConfigs = file('LoyaltyConfig');
  const stampCampaigns = file('LoyaltyVoucherCampaign');
  const deals = file('HotDeal');

  const partnerServiceIds = new Set<string>();
  for (const rows of [voucherCampaigns, loyaltyConfigs, stampCampaigns, deals]) {
    for (const row of rows) {
      const id = str(row, 'service_id');
      if (id && services.has(id)) partnerServiceIds.add(id);
    }
  }
  for (const [id, row] of services) if (bool(row, 'accepts_vouchers')) partnerServiceIds.add(id);

  /** Whoever configured the venue's economics owns it, in the absence of a
   *  partner account table in the export. The role is granted on the way past. */
  const ownerFor = (rows: CsvRow[], serviceId: string): string | null => {
    const row = rows.find((r) => str(r, 'service_id') === serviceId);
    return row ? userFor(str(row, 'created_by_id'), str(row, 'created_by')) : null;
  };

  for (const serviceId of partnerServiceIds) {
    const service = services.get(serviceId);
    if (!service) continue;

    const owner =
      ownerFor(voucherCampaigns, serviceId) ??
      ownerFor(stampCampaigns, serviceId) ??
      ownerFor(loyaltyConfigs, serviceId) ??
      ownerFor(deals, serviceId);

    if (owner) {
      db.run(
        `INSERT OR IGNORE INTO user_roles (user_id, role, granted_at) VALUES ($u, 'partner_owner', $t)`,
        { u: owner, t: at },
      );
    }

    const loyalty = loyaltyConfigs.find((r) => str(r, 'service_id') === serviceId);
    const city = str(service, 'city') || 'Krakow';

    db.run(
      `INSERT OR REPLACE INTO venues
         (id, owner_user_id, name, category, subcategory, city, country_code, address,
          lat, lng, timezone, currency, price_range, image_url, rating, review_count,
          phone, email, status, verified_at, amount_entry, min_spend_minor, max_amount_minor,
          avg_check_minor, avg_check_source, accepts_vouchers, points_per_scan,
          scan_cooldown_hours, loyalty_active, created_at, updated_at)
       VALUES ($i, $o, $n, $ca, $sc, $ci, $cc, $ad, $la, $ln, $tz, $cu, $pr, $im, $ra, $rc,
               $ph, $em, 'live', $ver, 'cashier', $ms, $mx, NULL, 'category', 1, $pps,
               $cool, $lact, $cr, $up)`,
      {
        i: serviceId,
        o: owner,
        n: str(service, 'service_name'),
        ca: str(service, 'category_key') || 'places',
        sc: (json<string[]>(service, 'subcategories', [])[0] ?? null),
        ci: city,
        cc: str(service, 'country_code') || 'PL',
        ad: opt(service, 'address'),
        la: str(service, 'location_lat') ? num(service, 'location_lat') : null,
        ln: str(service, 'location_lng') ? num(service, 'location_lng') : null,
        tz: timezoneFor(str(service, 'country_code') || 'PL'),
        cu: currencyFor(str(service, 'country_code') || 'PL'),
        pr: opt(service, 'price_range'),
        im: opt(service, 'image_url'),
        ra: str(service, 'rating') ? num(service, 'rating') : null,
        rc: num(service, 'review_count'),
        ph: opt(service, 'phone'),
        em: opt(service, 'email'),
        ver: ts(service, 'created_date', at),
        ms: CONFIG.gate.minSpendMinor,
        mx: CONFIG.gate.maxAmountMinor,
        /* The venue's own rate when the old LoyaltyConfig carried one, and the
           §2b platform default when it did not. That default is `CONFIG.earn.scan`
           now; it used to be a row under `points` worth a fifth as much, and an
           import still quoting the old figure would land every legacy venue on a
           rate nobody chose and nobody could see was stale. */
        pps: loyalty ? num(loyalty, 'points_per_scan', CONFIG.earn.scan) : CONFIG.earn.scan,
        cool: loyalty ? num(loyalty, 'scan_cooldown_hours', 24) : 24,
        lact: loyalty ? bool(loyalty, 'is_active') : true,
        cr: ts(service, 'created_date', at),
        up: ts(service, 'updated_date', at),
      },
    );
    db.run(`UPDATE guidance_services SET venue_id = $v WHERE id = $v`, { v: serviceId });

    for (const [kind, key] of [
      ['website', 'website'],
      ['google_maps', 'google_maps_link'],
      ['instagram', 'instagram_link'],
    ] as const) {
      const value = opt(service, key);
      if (value) {
        db.run(
          `INSERT OR REPLACE INTO venue_links (id, venue_id, kind, value, position)
           VALUES ($i, $v, $k, $va, 0)`,
          { i: `lnk_legacy_${serviceId}_${kind}`, v: serviceId, k: kind, va: value },
        );
      }
    }
    putText('venue', serviceId, 'description', 'en', str(service, 'description'));
    bump('venues');
  }

  /* ────────────────────────────── 5. budgets, tiers, campaigns per venue ── */

  const period = localMonth(at, 'Europe/Warsaw');

  for (const row of voucherCampaigns) {
    const venueId = str(row, 'service_id');
    if (!partnerServiceIds.has(venueId)) continue;

    const currency = str(row, 'currency') || 'PLN';
    /* Derived from the venue and period rather than random, and every `INSERT OR
       REPLACE` below is the same. A fresh id on a row with a unique key turns a
       re-import into a delete-and-recreate: the budget's movements cascade away,
       a tier that an issued voucher points at cannot be deleted at all, and the
       import that was supposed to be idempotent quietly destroys history. */
    const budgetId = `bdg_legacy_${venueId}_${period}`;
    db.run(
      `INSERT OR REPLACE INTO budgets
         (id, venue_id, period, currency, total_minor, loyalty_bp, created_at, updated_at)
       VALUES ($i, $v, $p, $c, $t, $l, $cr, $up)`,
      {
        i: budgetId,
        v: venueId,
        p: period,
        c: currency,
        t: Math.round(num(row, 'budget_total') * 100),
        l: CONFIG.loyalty.defaultLoyaltyBp,
        cr: at,
        up: at,
      },
    );
    /* `budget_consumed` was a single number in the old model. The new one splits
       spend by allocation, and the export gives no split — so it is recorded as
       a voucher debit, which is the allocation the old campaign belonged to. */
    const consumed = Math.round(num(row, 'budget_consumed') * 100);
    if (consumed > 0) {
      db.run(
        `INSERT INTO budget_movements
           (id, budget_id, allocation, kind, amount_minor, source_kind, note, created_at)
         VALUES ($i, $b, 'voucher', 'debit', $a, 'legacy_import', 'imported budget_consumed', $t)`,
        { i: `mov_legacy_${budgetId}`, b: budgetId, a: consumed, t: at },
      );
    }
    bump('budgets');

    const avgCheck = Math.round(num(row, 'avg_check_amount') * 100);
    if (avgCheck > 0) {
      db.run(`UPDATE venues SET avg_check_minor = $a WHERE id = $v`, { a: avgCheck, v: venueId });
    }

    for (const [pct, defaults] of [
      [5, CONFIG.vouchers.defaultTiers[0]],
      [10, CONFIG.vouchers.defaultTiers[1]],
      [15, CONFIG.vouchers.defaultTiers[2]],
    ] as const) {
      const points = num(row, `tier_${pct}_points`, defaults.points);
      /* `tier_*_limit` is 0 throughout the export, and a zero cap would mean no
         voucher can ever pay out anything. Zero reads as "unset". */
      const cap = Math.round(num(row, `tier_${pct}_limit`) * 100) || defaults.maxDiscountMinor;
      db.run(
        `INSERT OR REPLACE INTO voucher_tiers
           (id, venue_id, discount_pct, points_cost, max_discount_minor, active, created_at, updated_at)
         VALUES ($i, $v, $p, $pts, $cap, $a, $t, $t)`,
        {
          i: `vtr_legacy_${venueId}_${pct}`,
          v: venueId,
          p: pct,
          pts: points,
          cap,
          a: bool(row, 'is_active'),
          t: at,
        },
      );
      bump('voucher_tiers');
    }
  }

  let converted = 0;
  for (const row of stampCampaigns) {
    const venueId = str(row, 'service_id');
    if (!partnerServiceIds.has(venueId)) continue;

    const venue = db.get<{ avg_check_minor: number | null }>(
      `SELECT avg_check_minor FROM venues WHERE id = $v`,
      { v: venueId },
    );
    const avgCheck = venue?.avg_check_minor ?? 6000;

    /* The lossy conversion, stated at the top of this file: a percentage reward
       on a visit trigger is not a campaign under §5.1, and a campaign's reserve
       has to be an *exact* cost. The percentage is resolved against the venue's
       average check once, here, and the campaign carries money from then on. */
    const isPercentage = str(row, 'reward_type') === 'percentage_discount';
    const value = num(row, 'reward_value');
    const cost = isPercentage ? Math.round((avgCheck * value) / 100) : Math.round(value * 100);
    if (isPercentage) converted += 1;

    const id = str(row, 'id');
    db.run(
      `INSERT OR REPLACE INTO campaigns
         (id, venue_id, name, visits_required, reward_label, reward_cost_minor, priority,
          recurring, reward_valid_days, status, created_at, updated_at)
       VALUES ($i, $v, $n, $vr, $rl, $rc, $p, $re, $rd, $s, $cr, $up)`,
      {
        i: id,
        v: venueId,
        n: str(row, 'campaign_name'),
        vr: Math.max(1, num(row, 'scan_threshold', 3)),
        rl: str(row, 'campaign_name'),
        rc: cost,
        p: num(row, 'priority'),
        re: bool(row, 'is_recurring'),
        rd: CONFIG.loyalty.rewardValidityDays,
        s: bool(row, 'is_active') ? 'active' : 'paused',
        cr: ts(row, 'created_date', at),
        up: ts(row, 'updated_date', at),
      },
    );
    putText('campaign', id, 'reward_label', 'en', str(row, 'campaign_name'));
    bump('campaigns');
  }
  if (converted > 0) {
    notes.push(
      `${converted} percentage-reward loyalty campaigns were converted to fixed-cost ` +
        `campaigns (§5.1 forbids percentage rewards on a visit trigger); the cost is that ` +
        `percentage of the venue's average check, so the budget reserve stays exact.`,
    );
  }

  /* ─────────────────────────────────────────────── 6. hot deals and funnel ── */

  const dealIds = new Set<string>();
  for (const row of deals) {
    const id = str(row, 'id');
    dealIds.add(id);
    const serviceId = str(row, 'service_id');
    const venueId = partnerServiceIds.has(serviceId) ? serviceId : null;
    const active = bool(row, 'is_active');
    const validTo = ts(row, 'valid_to', null);

    db.run(
      `INSERT OR REPLACE INTO hot_deals
         (id, venue_id, partner_name, city, country_code, category, subcategory,
          discount_text, promo_code, image_url, status, valid_from, valid_to,
          cap_claims, points_required, created_by, created_at, updated_at, published_at)
       VALUES ($i, $v, $pn, $ci, $cc, $ca, $sc, $dt, $pc, $im, $st, $vf, $vt,
               $cap, $pts, $cb, $cr, $up, $pu)`,
      {
        i: id,
        v: venueId,
        pn: opt(row, 'partner_name'),
        ci: opt(row, 'city'),
        cc: str(row, 'country_code') || 'PL',
        ca: opt(row, 'category'),
        sc: opt(row, 'subcategory'),
        dt: opt(row, 'discount_text'),
        pc: opt(row, 'promo_code'),
        im: opt(row, 'partner_logo'),
        st: !active ? 'paused' : validTo && validTo < at ? 'expired' : 'live',
        vf: ts(row, 'valid_from', null),
        vt: validTo,
        cap: str(row, 'voucher_limit') ? num(row, 'voucher_limit') : null,
        pts: num(row, 'points_required'),
        cb: userFor(str(row, 'created_by_id'), str(row, 'created_by')),
        cr: ts(row, 'created_date', at),
        up: ts(row, 'updated_date', at),
        pu: active ? ts(row, 'created_date', at) : null,
      },
    );
    putSuffixed('hot_deal', id, 'title', row, 'title');
    putSuffixed('hot_deal', id, 'description', row, 'description');
    putText('hot_deal', id, 'terms', 'en', str(row, 'terms'));
    bump('hot_deals');
  }

  for (const row of file('HotDealEvent')) {
    const dealId = str(row, 'hot_deal_id');
    if (!dealIds.has(dealId)) continue;
    /* The old funnel had two steps, not three: `click` is the "opened" of §6.3,
       and a claim only exists once a scan confirms it — which the old app had no
       gate for, so no claims are imported rather than inventing them. */
    const kind = str(row, 'event_type') === 'click' ? 'open' : 'impression';
    const user = byId.get(str(row, 'user_id')) ?? null;
    db.run(
      `INSERT OR REPLACE INTO deal_events (id, deal_id, user_id, event_type, source, created_at)
       VALUES ($i, $d, $u, $e, $s, $c)`,
      {
        i: str(row, 'id'),
        d: dealId,
        u: user,
        e: kind,
        s: opt(row, 'source'),
        c: ts(row, 'created_date', at),
      },
    );
    bump('deal_events');
  }

  /* The counters on the deal are a materialised view of the events table, so
     they are recomputed here rather than incremented row by row. */
  db.exec(`
    UPDATE hot_deals SET
      seen_count = (SELECT COUNT(*) FROM deal_events e
                     WHERE e.deal_id = hot_deals.id AND e.event_type = 'impression'),
      opened_count = (SELECT COUNT(*) FROM deal_events e
                       WHERE e.deal_id = hot_deals.id AND e.event_type = 'open'),
      claimed_count = (SELECT COUNT(*) FROM deal_events e
                        WHERE e.deal_id = hot_deals.id AND e.event_type = 'claim')
  `);

  /* ──────────────────────────────────────── 7. directory-level engagement ── */

  for (const row of file('ServiceAnalytics')) {
    const serviceId = str(row, 'service_id');
    db.run(
      `INSERT OR REPLACE INTO service_events
         (id, service_id, venue_id, user_id, event_type, city, country_code, language, created_at)
       VALUES ($i, $s, $v, $u, $e, $ci, $cc, $l, $c)`,
      {
        i: str(row, 'id'),
        s: services.has(serviceId) ? serviceId : null,
        v: partnerServiceIds.has(serviceId) ? serviceId : null,
        u: userFor(str(row, 'created_by_id'), str(row, 'user_email') || str(row, 'created_by')),
        e: str(row, 'event_type'),
        ci: opt(row, 'city'),
        cc: opt(row, 'country_code'),
        l: opt(row, 'user_language'),
        c: ts(row, 'created_date', at),
      },
    );
    bump('service_events');
  }

  for (const row of file('ServiceRecommendation')) {
    db.run(
      `INSERT OR REPLACE INTO service_recommendations
         (id, user_id, name, city, country_code, category_key, subcategory, status, created_at)
       VALUES ($i, $u, $n, $ci, $cc, $ck, $sc, $st, $c)`,
      {
        i: str(row, 'id'),
        u: userFor(str(row, 'created_by_id'), str(row, 'created_by')),
        n: str(row, 'service_name'),
        ci: opt(row, 'city'),
        cc: opt(row, 'country_code'),
        ck: opt(row, 'category_key'),
        sc: opt(row, 'subcategory'),
        st: ['pending', 'accepted', 'rejected'].includes(str(row, 'status'))
          ? str(row, 'status')
          : 'pending',
        c: ts(row, 'created_date', at),
      },
    );
    bump('service_recommendations');
  }

  for (const row of file('Feedback')) {
    db.run(
      `INSERT OR REPLACE INTO feedback (id, user_id, subject, body, rating, status, created_at)
       VALUES ($i, $u, $s, $b, $r, 'new', $c)`,
      {
        i: str(row, 'id') || newId('fbk'),
        u: userFor(str(row, 'created_by_id'), str(row, 'created_by')),
        s: opt(row, 'subject'),
        b: str(row, 'message') || str(row, 'body') || '',
        r: str(row, 'rating') ? num(row, 'rating') : null,
        c: ts(row, 'created_date', at),
      },
    );
    bump('feedback');
  }

  /* ───────────────────────────────── 8. the quiz banks, from CountryCapital ── */

  const countries = file('CountryCapital');
  assertComplete(countries.map((row) => str(row, 'country_name')));
  importCapitals(db, countries, bump);
  importFlags(db, countries, bump);

  /* The other two banks are hand-delivered exports rather than Base44 tables, so
     they sit in `updates/` beside the front end's own copy of them and are read
     from there. Without them `POST /v1/games/sessions {gameType:"brain"}` is a
     404 and two of the seven games cannot be played at all — which is a data
     gap, not a missing feature, and it is fixed here rather than by teaching the
     client to hide the cards. */
  const banksDir = gamesDir ?? 'updates';
  const general = readCsv(join(banksDir, 'General Quiz - data.csv'));
  const poland = readCsv(join(banksDir, 'Poland Quiz Question - data.csv'));
  if (general.length === 0 || poland.length === 0) {
    notes.push(
      `game banks: ${general.length} general and ${poland.length} Poland questions found in ${banksDir}/ — ` +
        'the brain and poland games need both',
    );
  }
  importGeneralQuiz(db, general, bump);
  importPolandQuiz(db, poland, bump);

  /* ────────────────────────────── 9. the remittance tables, archived as-is ── */

  for (const row of file('Wallet')) {
    db.run(
      `INSERT OR REPLACE INTO legacy_wallets
         (id, user_id, owner_email, balance_eur_minor, balance_usdt_minor,
          total_topped_up_minor, total_sent_minor, created_at, updated_at)
       VALUES ($i, $u, $e, $be, $bu, $tt, $tsent, $c, $up)`,
      {
        i: str(row, 'id'),
        u: userFor(str(row, 'created_by_id'), str(row, 'created_by')),
        e: opt(row, 'created_by'),
        be: Math.round(num(row, 'balance_eur') * 100),
        bu: Math.round(num(row, 'balance_usdt') * 100),
        tt: Math.round(num(row, 'total_topped_up') * 100),
        tsent: Math.round(num(row, 'total_sent') * 100),
        c: ts(row, 'created_date', at),
        up: ts(row, 'updated_date', at),
      },
    );
    bump('legacy_wallets');
  }

  for (const row of file('Recipient')) {
    db.run(
      `INSERT OR REPLACE INTO legacy_recipients
         (id, user_id, owner_email, full_name, city, phone, method, bank_name,
          card_number, wallet_address, wallet_network, favorite, created_at)
       VALUES ($i, $u, $e, $n, $ci, $ph, $m, $b, $ca, $wa, $wn, $f, $c)`,
      {
        i: str(row, 'id'),
        u: userFor(str(row, 'created_by_id'), str(row, 'created_by')),
        e: opt(row, 'created_by'),
        n: str(row, 'full_name'),
        ci: opt(row, 'city'),
        ph: opt(row, 'phone_number'),
        m: opt(row, 'preferred_receive_method'),
        b: opt(row, 'bank_name'),
        ca: opt(row, 'card_number'),
        wa: opt(row, 'wallet_address'),
        wn: opt(row, 'wallet_network'),
        f: bool(row, 'is_favorite'),
        c: ts(row, 'created_date', at),
      },
    );
    bump('legacy_recipients');
  }

  for (const row of file('Transaction')) {
    db.run(
      `INSERT OR REPLACE INTO legacy_transfers
         (id, user_id, owner_email, recipient_id, recipient_name, source_currency,
          destination_currency, amount_sent_minor, amount_received_minor, fee_minor,
          exchange_rate, send_type, delivery_speed, payment_method, status, tx_hash, created_at)
       VALUES ($i, $u, $e, $r, $rn, $sc, $dc, $as, $ar, $f, $x, $st, $ds, $pm, $s, $h, $c)`,
      {
        i: str(row, 'id'),
        u: userFor(str(row, 'created_by_id'), str(row, 'created_by')),
        e: opt(row, 'created_by'),
        r: opt(row, 'recipient_id'),
        rn: opt(row, 'recipient_name'),
        sc: opt(row, 'source_currency'),
        dc: opt(row, 'destination_currency'),
        as: Math.round(num(row, 'amount_sent') * 100),
        ar: Math.round(num(row, 'amount_received') * 100),
        f: Math.round(num(row, 'fee') * 100),
        x: num(row, 'exchange_rate'),
        st: opt(row, 'send_type'),
        ds: opt(row, 'delivery_speed'),
        pm: opt(row, 'payment_method'),
        s: opt(row, 'status'),
        h: opt(row, 'blockchain_tx_hash'),
        c: ts(row, 'created_date', at),
      },
    );
    bump('legacy_transfers');
  }

  for (const row of file('PaymentMethod')) {
    db.run(
      `INSERT OR REPLACE INTO legacy_payment_methods
         (id, user_id, owner_email, type, nickname, card_brand, card_last_four, card_expiry,
          bank_name, iban_last_four, is_default, is_verified, created_at)
       VALUES ($i, $u, $e, $t, $n, $cb, $cl, $cx, $bn, $ib, $d, $v, $c)`,
      {
        i: str(row, 'id'),
        u: userFor(str(row, 'created_by_id'), str(row, 'created_by')),
        e: opt(row, 'created_by'),
        t: opt(row, 'type'),
        n: opt(row, 'nickname'),
        cb: opt(row, 'card_brand'),
        cl: opt(row, 'card_last_four'),
        cx: opt(row, 'card_expiry'),
        bn: opt(row, 'bank_name'),
        ib: opt(row, 'iban_last_four'),
        d: bool(row, 'is_default'),
        v: bool(row, 'is_verified'),
        c: ts(row, 'created_date', at),
      },
    );
    bump('legacy_payment_methods');
  }

  /* ──────────────────────────── 10. opening balances, as ledger entries ── */

  for (const [user, points] of opening) {
    if (points <= 0) continue;
    /* One opening entry per person, ever. The id is derived from the user rather
       than minted, and the insert is `OR IGNORE`, so a second import finds it
       already there and adds nothing — the alternative is a re-run that hands
       everybody their old balance a second time. */
    const ledgerId = `led_legacy_${user}`;
    const inserted = db.run(
      `INSERT OR IGNORE INTO points_ledger
         (id, user_id, delta, reason, source_ref, source_kind, status, created_at, expires_at)
       VALUES ($i, $u, $d, 'adjustment', 'base44', 'legacy_import', 'committed', $c, $e)`,
      /* No expiry date. Points do not expire on any plan, and this was the
         last place still stamping one — a legacy opening balance carrying a
         365-day clock nothing reads is a date waiting to be believed by the
         next thing that looks at the column. */
      { i: ledgerId, u: user, d: points, c: at, e: null },
    ).changes;
    if (inserted === 0) continue;

    db.run(
      `INSERT INTO points_lots (ledger_id, user_id, earned_at, expires_at, amount)
       VALUES ($i, $u, $c, $e, $a)`,
      /* The lot's `expires_at` is NOT NULL, so it takes the same far-future
         sentinel `ledger.ts` uses rather than a null: FIFO spending orders by
         that column, and a null would sort unpredictably against the rows the
         ledger writes. The entry above takes a real null, because nothing
         orders by it and a date nobody reads is a date somebody eventually
         believes. */
      { i: ledgerId, u: user, c: at, e: NEVER, a: points },
    );
    db.run(`UPDATE users SET points_cache = points_cache + $d WHERE id = $u`, {
      d: points,
      u: user,
    });
    bump('opening_balances');
  }

  return { counts, notes };
}

/* ─────────────────────────────────────────────────────────────── helpers ── */

/** Where the old data's countries are, for venue-local time (§15). */
function timezoneFor(country: string): string {
  switch (country.toUpperCase()) {
    case 'UZ':
      return 'Asia/Tashkent';
    case 'UA':
      return 'Europe/Kyiv';
    case 'TR':
      return 'Europe/Istanbul';
    case 'AZ':
      return 'Asia/Baku';
    case 'GE':
      return 'Asia/Tbilisi';
    default:
      return 'Europe/Warsaw';
  }
}

function currencyFor(country: string): string {
  switch (country.toUpperCase()) {
    case 'UZ':
      return 'UZS';
    case 'UA':
      return 'UAH';
    case 'TR':
      return 'TRY';
    case 'AZ':
      return 'AZN';
    case 'GE':
      return 'GEL';
    default:
      return 'PLN';
  }
}

/**
 * The capitals bank, in every language the export carries it in.
 *
 * Distractors are drawn from the *same continent*, which is the difference
 * between a question and a giveaway: three capitals picked at random from 195
 * countries leaves one plausible answer and the player is not being asked
 * anything. They are also picked deterministically from the row index, so
 * re-running the import produces the same bank rather than a second one.
 */
const QUIZ_LANGS = [
  { code: 'en', country: 'country_name', capital: 'capital_name' },
  { code: 'pl', country: 'country_name_pl', capital: 'capital_name_pl' },
  { code: 'ru', country: 'country_name_ru', capital: 'capital_name_ru' },
  { code: 'uz', country: 'country_name_uz', capital: 'capital_name_uz' },
] as const;

/**
 * Three wrong answers from the same continent, chosen deterministically.
 *
 * The stride is coprime with most pool sizes, so it walks the list without
 * repeating and without a PRNG — which means re-running the import produces the
 * same bank rather than a second one, and a question a player disputes can be
 * reconstructed exactly.
 */
function pickDistractors(pool: string[], answer: string, wide: string[], index: number): string[] {
  const from = pool.length >= 3 ? pool : wide;
  const candidates = from.filter((value) => value !== answer);
  const out: string[] = [];
  for (let step = 1; out.length < 3 && step <= candidates.length; step += 1) {
    const pick = candidates[(index * 7 + step * 13) % candidates.length];
    if (pick && !out.includes(pick)) out.push(pick);
  }
  return out;
}

function importCapitals(
  db: Db,
  rows: CsvRow[],
  bump: (key: string, by?: number) => void,
): void {
  for (const lang of QUIZ_LANGS) {
    const items = rows
      .map((row) => ({
        id: str(row, 'id'),
        continent: str(row, 'continent') || 'Other',
        code: codeFor(str(row, 'country_name')),
        country: str(row, lang.country),
        capital: str(row, lang.capital),
      }))
      .filter((item) => item.country && item.capital);

    const byContinent = new Map<string, string[]>();
    for (const item of items) {
      const list = byContinent.get(item.continent) ?? [];
      list.push(item.capital);
      byContinent.set(item.continent, list);
    }
    const all = items.map((item) => item.capital);

    items.forEach((item, index) => {
      db.run(
        `INSERT OR REPLACE INTO quiz_items (id, bank, language, prompt, answer, distractors, meta)
         VALUES ($i, 'capitals', $l, $p, $a, $d, $m)`,
        {
          i: `${item.id}_${lang.code}`,
          l: lang.code,
          p: item.country,
          a: item.capital,
          d: JSON.stringify(
            pickDistractors(byContinent.get(item.continent) ?? [], item.capital, all, index),
          ),
          m: JSON.stringify({ continent: item.continent, code: item.code }),
        },
      );
      bump('quiz_items');
    });
  }
}

/**
 * The flags bank.
 *
 * The prompt is the ISO code and the emoji is derived from it, so the client can
 * render either — a font that has the flag, or the two letters as a fallback.
 * Storing the emoji as the prompt instead would put a rendering decision in the
 * database, and the one platform that refuses to draw a given flag would leave a
 * question that is literally two blank boxes.
 *
 * The answer is the country's name in the player's own language, which is why
 * this bank exists in four: a flag quiz that only works in English is a
 * geography test in a second language.
 */
function importFlags(
  db: Db,
  rows: CsvRow[],
  bump: (key: string, by?: number) => void,
): void {
  for (const lang of QUIZ_LANGS) {
    const items = rows
      .map((row) => ({
        id: str(row, 'id'),
        continent: str(row, 'continent') || 'Other',
        code: codeFor(str(row, 'country_name')),
        country: str(row, lang.country),
      }))
      .filter((item): item is typeof item & { code: string } =>
        Boolean(item.code && item.country),
      );

    const byContinent = new Map<string, string[]>();
    for (const item of items) {
      const list = byContinent.get(item.continent) ?? [];
      list.push(item.country);
      byContinent.set(item.continent, list);
    }
    const all = items.map((item) => item.country);

    items.forEach((item, index) => {
      db.run(
        `INSERT OR REPLACE INTO quiz_items (id, bank, language, prompt, answer, distractors, meta)
         VALUES ($i, 'flags', $l, $p, $a, $d, $m)`,
        {
          i: `flag_${item.id}_${lang.code}`,
          l: lang.code,
          p: item.code,
          a: item.country,
          d: JSON.stringify(
            pickDistractors(byContinent.get(item.continent) ?? [], item.country, all, index),
          ),
          m: JSON.stringify({
            continent: item.continent,
            code: item.code,
            flag: flagOf(item.code),
          }),
        },
      );
      bump('quiz_items');
    });
  }
}

/**
 * The five languages the two hand-delivered banks are written in.
 *
 * The general export also carries Turkish and Azerbaijani columns. They are
 * skipped rather than imported: the account's `language` can only ever be one of
 * the five the product ships in, so a `tr` row would be written and never read,
 * and a bank that is present but unreachable is worse than one that is absent —
 * the first looks like coverage.
 */
const BANK_LANGS = ['en', 'pl', 'ru', 'uz', 'uk'] as const;

/**
 * Brain Games, from `General Quiz - data.csv`.
 *
 * The export is already shaped like a quiz — a question, four options and the
 * index of the right one — so nothing has to be invented here, and nothing is:
 * where a language's translation is blank the row is skipped for *that language
 * only*, which is why the counts per bank differ and should.
 *
 * `correct_answer` is an index into `options_<lang>`, and the same index in every
 * language, so the option order must be preserved exactly as exported. It is not
 * shuffled here — `domain/games.ts` shuffles per round and remembers where the
 * answer went, which is the only place that can do it without losing the key.
 */
function importGeneralQuiz(db: Db, rows: CsvRow[], bump: (key: string, by?: number) => void): void {
  for (const row of rows) {
    const id = str(row, 'id');
    if (!id) continue;
    const correct = Number(str(row, 'correct_answer'));
    if (!Number.isInteger(correct) || correct < 0) continue;

    for (const lang of BANK_LANGS) {
      const prompt = str(row, `question_text_${lang}`);
      const options = json<string[]>(row, `options_${lang}`, []);
      /* Four options and a valid index, or the row is not a question in this
         language. A three-option round with a dangling answer index would score
         wrongly rather than fail, which is the worst of the two. */
      if (!prompt || options.length < 2 || correct >= options.length) continue;
      const answer = options[correct];
      if (!answer) continue;

      db.run(
        `INSERT OR REPLACE INTO quiz_items (id, bank, language, prompt, answer, distractors, meta)
         VALUES ($i, 'brain', $l, $p, $a, $d, $m)`,
        {
          i: `brain_${id}_${lang}`,
          l: lang,
          p: prompt,
          a: answer,
          d: JSON.stringify(options.filter((_, index) => index !== correct)),
          m: JSON.stringify({
            subject: str(row, 'subject') || null,
            difficulty: num(row, 'difficulty', 0) || null,
            explanation: str(row, `explanation_${lang}`) || null,
          }),
        },
      );
      bump('quiz_items');
    }
  }
}

/**
 * The Poland quiz, from `Poland Quiz Question - data.csv`.
 *
 * Same bank, a different export shape: four lettered columns per language and a
 * letter rather than an index. `A`–`D` is mapped to 0–3 once, here, so nothing
 * downstream has to know that two of the four banks were exported by different
 * tools.
 */
function importPolandQuiz(db: Db, rows: CsvRow[], bump: (key: string, by?: number) => void): void {
  const letters = ['a', 'b', 'c', 'd'] as const;

  for (const row of rows) {
    const id = str(row, 'id');
    if (!id) continue;
    const correct = letters.indexOf(
      str(row, 'correct_answer').trim().toLowerCase() as (typeof letters)[number],
    );
    if (correct < 0) continue;

    for (const lang of BANK_LANGS) {
      const prompt = str(row, `question_${lang}`);
      const options = letters.map((letter) => str(row, `option_${letter}_${lang}`));
      if (!prompt || options.some((option) => !option)) continue;

      db.run(
        `INSERT OR REPLACE INTO quiz_items (id, bank, language, prompt, answer, distractors, meta)
         VALUES ($i, 'poland', $l, $p, $a, $d, $m)`,
        {
          i: `poland_${id}_${lang}`,
          l: lang,
          p: prompt,
          a: options[correct],
          d: JSON.stringify(options.filter((_, index) => index !== correct)),
          m: JSON.stringify({ source: 'poland_quiz' }),
        },
      );
      bump('quiz_items');
    }
  }
}
