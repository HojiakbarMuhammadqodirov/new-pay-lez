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
import { TERM_LADDER, termPricing } from './entitlements.ts';
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
 * The plans, their perks, the terms they are sold on, the category average
 * checks, and a small gift-card catalogue. Idempotent: safe to run on every
 * boot.
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
  /**
   * Whether the plan is also sold on the commitment ladder (`TERM_LADDER`).
   *
   * A property of the seed rather than a rule, because "which plans commit" is a
   * commercial decision and this file is where those are made. A free tier has
   * nothing to commit to; the partner tiers are invoiced monthly and their
   * contract length is a conversation, not a button.
   */
  terms?: boolean;
  entitlements: Record<string, string | number | boolean>;
}

/**
 * "Unlimited", written in a column whose values are text.
 *
 * `entNumber` hands every caller a number and every caller compares against it,
 * so the top tier needs a figure no real account reaches rather than a second
 * type in `plan_entitlements` for the one row that means "no ceiling". Ten
 * thousand lives is ten thousand rounds between two midnights; the sentinel is
 * honest about being a bound, because it *is* one — just not one anybody will
 * find. Anything that has to distinguish "high" from "infinite" should read the
 * key it means (`points_expiry_months: 0`) rather than test against this.
 */
const UNLIMITED = 9999;

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
      streak_freezes: 2,
      word_hints_per_day: 3,
      exclusive_deals: false,
      deal_early_access_hours: 0,
      gift_card_priority: false,
      monthly_stipend: 0,
      /* Which curve in `CONFIG.games.decay` prices a repeat of the same game
         today. The *value* is a key of that table, so a code here that the table
         does not know silently buys the free curve — see `decayFor`. Keeping the
         three values equal to the three plan codes is what makes that
         impossible to get wrong. */
      round_decay: 'free',
      priority_support: false,
      assistant: true,
    },
  },
  {
    audience: 'consumer',
    code: 'pro',
    name: 'Pro',
    priceMinor: 1999,
    trialDays: 7,
    rank: 1,
    terms: true,
    entitlements: {
      daily_lives: 6,
      points_multiplier: 1.2,
      /* Twice the free window rather than no window: expiry is what keeps the
         liability finite, and only the top tier is sold out of it. */
      points_expiry_months: 24,
      streak_freezes: 5,
      word_hints_per_day: 6,
      exclusive_deals: true,
      deal_early_access_hours: 0,
      gift_card_priority: true,
      monthly_stipend: 0,
      round_decay: 'pro',
      priority_support: false,
      assistant: true,
    },
  },
  {
    audience: 'consumer',
    code: 'premium',
    name: 'Premium',
    priceMinor: 3999,
    trialDays: 7,
    rank: 2,
    terms: true,
    entitlements: {
      daily_lives: UNLIMITED,
      points_multiplier: 1.6,
      /* **Zero means never.** `ledger.ts` writes a NULL `expires_at` for it,
         which is the only value the expiry job cannot misread — so this is not
         "a very long window", it is the absence of one. */
      points_expiry_months: 0,
      streak_freezes: UNLIMITED,
      word_hints_per_day: UNLIMITED,
      exclusive_deals: true,
      /* A day's head start on a deal, which is the perk that costs the platform
         nothing and is worth the most on a deal with a claim ceiling. */
      deal_early_access_hours: 24,
      gift_card_priority: true,
      /* The monthly credit, from the earn table so the subscription and the
         gift are priced against each other in one place: it must stay worth
         clearly less than the plan costs, or the plan refunds itself. */
      monthly_stipend: CONFIG.earn.premiumStipend,
      round_decay: 'premium',
      priority_support: true,
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

/**
 * Plans that were sold once and are not on the shelf any more.
 *
 * Withdrawn rather than deleted, and the difference is a foreign key: a
 * subscription points at its plan `ON DELETE RESTRICT`, so removing the row
 * would either fail or take somebody's subscription with it. `active = 0` takes
 * it out of the catalogue and out of `freePlan`'s ordering while anybody still
 * on it keeps the entitlements they bought — which is the same "a lapse
 * restricts, it never claws back" rule read from the other end.
 *
 * One thing does change for a grandfathered subscriber: `decayFor` keys the
 * round-decay curve on the plan *code*, and `plus` is not a key of
 * `CONFIG.games.decay`, so it falls back to the free curve. That is the
 * documented behaviour of an unrecognised code rather than a new decision, and
 * it is the argument for retiring a paid tier only when nobody is on it.
 */
const RETIRED: ReadonlyArray<{ audience: 'consumer' | 'partner'; code: string }> = [
  /* Free / Plus / Premium became Free / Pro / Premium. */
  { audience: 'consumer', code: 'plus' },
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
    seedTerms(db, id, plan.priceMinor, plan.terms === true);
  }

  for (const plan of RETIRED) {
    db.run(`UPDATE plans SET active = 0 WHERE audience = $a AND code = $c`, {
      a: plan.audience,
      c: plan.code,
    });
    db.run(
      `DELETE FROM plan_terms WHERE plan_id IN
         (SELECT id FROM plans WHERE audience = $a AND code = $c)`,
      { a: plan.audience, c: plan.code },
    );
  }
  void at;
}

/**
 * The commitment ladder for one plan, rebuilt from `TERM_LADDER` and the list
 * price.
 *
 * **Rebuilt rather than reconciled**, which is safe here and nowhere else in
 * this file: nothing has a foreign key into `plan_terms`, and a subscription
 * records what it was charged rather than pointing at the rung it was bought on.
 * So the table is a pure projection of the ladder times the price, and a rung
 * taken off the ladder — or a price cut — has to leave no trace behind it. An
 * upsert would leave the stale rung sitting in the catalogue for ever.
 *
 * Every figure comes back out of `termPricing`, which is the one place the
 * arithmetic lives: the monthly price is rounded half-up to whole minor units
 * and the total is `price × months` derived from it, never the other way round.
 * That is what makes the per-month figure on the card and the amount on the
 * invoice agree by construction — 16.39 a month beside a charge of 98.35 is the
 * few-grosze disagreement nobody can explain at the counter.
 */
function seedTerms(db: Db, planId: string, monthlyMinor: number, sold: boolean): void {
  db.run(`DELETE FROM plan_terms WHERE plan_id = $p`, { p: planId });
  if (!sold) return;

  for (const rung of TERM_LADDER) {
    const term = termPricing(monthlyMinor, rung.months, rung.discountBp);
    db.run(
      `INSERT INTO plan_terms (plan_id, months, discount_bp, price_minor, total_minor)
       VALUES ($p, $m, $d, $pm, $tm)`,
      {
        p: planId,
        m: term.months,
        d: term.discountBp,
        pm: term.priceMinor,
        tm: term.totalMinor,
      },
    );
  }
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
