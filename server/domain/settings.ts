/**
 * Platform configuration — C6.
 *
 * "Manage plan/entitlement definitions as config, so tiers and perks change
 * without deploys", and the same for the safety and economic thresholds. So
 * `CONFIG` in `config.ts` is the *default*, and a row here wins. Reading through
 * one function means an operator changing the min-cohort at 2am changes it
 * everywhere, including in code written after they did it.
 *
 * The plan definitions seeded below are the mechanism, not the product decision.
 * Both specs say the final tier design is a product call and that the point of
 * an entitlement model is that the call can be made later — so what matters is
 * that every tiered behaviour in the backend reads a key, and that the free tier
 * runs the core loop unaided (§12a.1, B7).
 */
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import { now, type Iso } from './time.ts';

export function configValue(db: Db, key: string, fallback: number): number {
  const row = db.get<{ value: string }>(`SELECT value FROM platform_config WHERE key = $k`, {
    k: key,
  });
  const parsed = row ? Number(row.value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function setConfig(db: Db, key: string, value: string | number, at: Iso = now()): void {
  db.run(
    `INSERT INTO platform_config (key, value, updated_at) VALUES ($k, $v, $t)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    { k: key, v: String(value), t: at },
  );
}

export const minCohort = (db: Db): number => configValue(db, 'min_cohort', CONFIG.privacy.minCohort);
export const minVenues = (db: Db): number => configValue(db, 'min_venues', CONFIG.privacy.minVenues);

/**
 * The plans, their perks, the category average checks, and a small gift-card
 * catalogue. Idempotent: safe to run on every boot.
 */
export function seedPlatform(db: Db, at: Iso = now()): void {
  db.tx(() => {
    seedPlans(db, at);
    seedCategoryDefaults(db);
    seedGiftCards(db);
    seedWords(db);
  });
}

interface PlanSeed {
  audience: 'consumer' | 'partner';
  code: string;
  name: string;
  priceMinor: number;
  trialDays: number;
  rank: number;
  entitlements: Record<string, string | number | boolean>;
}

/**
 * Rank order is entitlement order: `freePlan()` takes rank 0 and
 * `activeSubscription` prefers the highest rank, so the ladder is these rows and
 * nothing else.
 */
const PLANS: PlanSeed[] = [
  {
    audience: 'consumer',
    code: 'free',
    name: 'Free',
    priceMinor: 0,
    trialDays: 0,
    rank: 0,
    entitlements: {
      /* The free tier is genuinely useful: earning, redeeming, games and deals
         all work. What paid tiers add is headroom, never access (§12a.1). */
      daily_lives: CONFIG.points.dailyLives,
      points_multiplier: 1,
      points_expiry_months: CONFIG.points.expiryMonths,
      exclusive_deals: false,
      gift_card_priority: false,
      assistant: true,
    },
  },
  {
    audience: 'consumer',
    code: 'plus',
    name: 'Plus',
    priceMinor: 1499,
    trialDays: 7,
    rank: 1,
    entitlements: {
      daily_lives: 5,
      points_multiplier: 1.25,
      points_expiry_months: 18,
      exclusive_deals: true,
      gift_card_priority: false,
      assistant: true,
    },
  },
  {
    audience: 'consumer',
    code: 'premium',
    name: 'Premium',
    priceMinor: 2999,
    trialDays: 7,
    rank: 2,
    entitlements: {
      daily_lives: 8,
      points_multiplier: 1.5,
      points_expiry_months: 24,
      exclusive_deals: true,
      gift_card_priority: true,
      assistant: true,
    },
  },
  {
    audience: 'partner',
    code: 'starter',
    name: 'Starter',
    priceMinor: 0,
    trialDays: 0,
    rank: 0,
    entitlements: {
      /* B7: "the free tier must let a partner run the core loop — at least basic
         deals, loyalty, and vouchers — so a venue can join and see value before
         paying." */
      live_deals: 1,
      active_campaigns: 1,
      push_quota: 2,
      venues: 1,
      team_seats: 1,
      vouchers: true,
      deep_analytics: false,
      benchmarks: false,
      assistant: false,
      identified_profiles: false,
      export_csv: false,
    },
  },
  {
    audience: 'partner',
    code: 'growth',
    name: 'Growth',
    priceMinor: 29900,
    trialDays: 30,
    rank: 1,
    entitlements: {
      live_deals: 5,
      active_campaigns: 3,
      push_quota: 4,
      venues: 3,
      team_seats: 5,
      vouchers: true,
      deep_analytics: true,
      /* B9: benchmarks are explicitly a Growth-tier entitlement. */
      benchmarks: true,
      assistant: true,
      identified_profiles: true,
      export_csv: true,
    },
  },
  {
    audience: 'partner',
    code: 'chain',
    name: 'Chain',
    priceMinor: 79900,
    trialDays: 30,
    rank: 2,
    entitlements: {
      live_deals: 20,
      active_campaigns: 10,
      push_quota: 8,
      venues: 25,
      team_seats: 25,
      vouchers: true,
      deep_analytics: true,
      benchmarks: true,
      assistant: true,
      identified_profiles: true,
      export_csv: true,
    },
  },
];

function seedPlans(db: Db, at: Iso): void {
  for (const plan of PLANS) {
    const id = `pln_${plan.audience}_${plan.code}`;
    db.run(
      `INSERT INTO plans (id, audience, code, name, price_minor, currency, interval, trial_days, rank, active)
       VALUES ($i, $a, $c, $n, $p, 'PLN', 'month', $t, $r, 1)
       ON CONFLICT (audience, code) DO UPDATE
         SET name = excluded.name, price_minor = excluded.price_minor,
             trial_days = excluded.trial_days, rank = excluded.rank`,
      {
        i: id,
        a: plan.audience,
        c: plan.code,
        n: plan.name,
        p: plan.priceMinor,
        t: plan.trialDays,
        r: plan.rank,
      },
    );
    for (const [key, value] of Object.entries(plan.entitlements)) {
      db.run(
        `INSERT INTO plan_entitlements (plan_id, key, value) VALUES ($p, $k, $v)
           ON CONFLICT (plan_id, key) DO UPDATE SET value = excluded.value`,
        { p: id, k: key, v: String(value) },
      );
    }
  }
  void at;
}

/**
 * §4.5's fallback: what a check is worth in a category before a venue has thirty
 * confirmed transactions of its own. Kraków figures, in grosze.
 */
const CATEGORY_DEFAULTS: Array<[string, number]> = [
  ['cafe', 3200],
  ['places', 6000],
  ['restaurant', 8500],
  ['bakery', 1800],
  ['barbershop', 6500],
  ['beauty', 12000],
  ['dental', 25000],
  ['fitness', 14000],
  ['language', 20000],
  ['healthcare', 18000],
  ['education', 15000],
  ['housing', 30000],
  ['legal', 25000],
  ['banking', 0],
  ['transportation', 4000],
  ['employment', 0],
  ['shopping', 9000],
  ['hotels', 32000],
  ['other', 6000],
];

function seedCategoryDefaults(db: Db): void {
  for (const [category, minor] of CATEGORY_DEFAULTS) {
    db.run(
      `INSERT INTO category_defaults (category, avg_check_minor, currency) VALUES ($c, $m, 'PLN')
         ON CONFLICT (category) DO UPDATE SET avg_check_minor = excluded.avg_check_minor`,
      { c: category, m: minor },
    );
  }
}

/**
 * The gift-card catalogue.
 *
 * The four brands and the points prices the site's own wallet already shows
 * (`src/site/auth/player.ts`), so a wallet migrated from the prototype and one
 * served by this backend hold the same things. Face values are euros because
 * that is the unit the site stores every amount in and converts on the way out.
 */
const GIFT_CARDS: Array<[string, string, number, number, boolean]> = [
  ['Zalando', 'Z', 1163, 500, false],
  ['Media Expert', 'M', 465, 100, false],
  ['Douglas', 'D', 698, 300, false],
  ['Hebe', 'H', 465, 100, false],
  ['Empik', 'E', 930, 400, true],
];

function seedGiftCards(db: Db): void {
  for (const [brand, logo, faceMinor, points, priority] of GIFT_CARDS) {
    db.run(
      `INSERT INTO gift_card_stock (id, brand, logo, face_minor, currency, points_cost, stock, priority_only, active)
       VALUES ($i, $b, $l, $f, 'EUR', $p, 250, $pr, 1)
       ON CONFLICT (id) DO UPDATE
         SET points_cost = excluded.points_cost, face_minor = excluded.face_minor`,
      {
        i: `gcs_${brand.toLowerCase().replace(/\s+/g, '_')}`,
        b: brand,
        l: logo,
        f: faceMinor,
        p: points,
        pr: priority ? 1 : 0,
      },
    );
  }
}

/**
 * The Word Builder bank.
 *
 * Polish first, because the product's reason for existing is somebody who has
 * just moved to Kraków — the words are the ones a newcomer meets in a week of
 * ordinary errands, not a dictionary sample. The tier is the spec's own: 1 for
 * three or four letters, 2 for five or six, 3 for seven and up, which is what
 * `wordTierBonus` in `config.ts` pays against.
 *
 * The bank exists here rather than in the CSV import because the old database
 * has no word list — the games it shipped were the four quizzes.
 */
const WORDS: Array<[string, string, string]> = [
  /* language, word, hint */
  ['pl', 'kawa', 'coffee'],
  ['pl', 'chleb', 'bread'],
  ['pl', 'woda', 'water'],
  ['pl', 'sklep', 'shop'],
  ['pl', 'ulica', 'street'],
  ['pl', 'dworzec', 'railway station'],
  ['pl', 'przystanek', 'bus stop'],
  ['pl', 'apteka', 'pharmacy'],
  ['pl', 'lekarz', 'doctor'],
  ['pl', 'mieszkanie', 'flat'],
  ['pl', 'umowa', 'contract'],
  ['pl', 'praca', 'work'],
  ['pl', 'urzad', 'government office'],
  ['pl', 'pobyt', 'stay, residence'],
  ['pl', 'karta', 'card'],
  ['pl', 'rachunek', 'bill'],
  ['pl', 'paragon', 'receipt'],
  ['pl', 'kolejka', 'queue'],
  ['pl', 'wniosek', 'application'],
  ['pl', 'termin', 'appointment'],
  ['en', 'rent', 'what you pay monthly'],
  ['en', 'lease', 'the housing contract'],
  ['en', 'permit', 'what you apply for'],
  ['en', 'deposit', 'paid up front, returned later'],
  ['en', 'invoice', 'a bill with a number'],
  ['en', 'landlord', 'who owns the flat'],
  ['en', 'insurance', 'what covers the doctor'],
  ['en', 'residence', 'where you legally live'],
  ['en', 'appointment', 'a slot at an office'],
  ['en', 'registration', 'putting your address on record'],
];

function seedWords(db: Db): void {
  for (const [language, word, hint] of WORDS) {
    const tier = word.length <= 4 ? 1 : word.length <= 6 ? 2 : 3;
    db.run(
      `INSERT INTO word_bank (id, language, word, tier, hint) VALUES ($i, $l, $w, $t, $h)
         ON CONFLICT (language, word) DO UPDATE SET tier = excluded.tier, hint = excluded.hint`,
      { i: `wrd_${language}_${word}`, l: language, w: word, t: tier, h: hint },
    );
  }
}
