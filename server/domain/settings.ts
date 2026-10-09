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

export async function configValue(db: Db, key: string, fallback: number): Promise<number> {
  const row = await db.get<{ value: string }>(`SELECT value FROM platform_config WHERE key = $k`, {
    k: key,
  });
  const parsed = row ? Number(row.value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function setConfig(db: Db, key: string, value: string | number, at: Iso = now()): Promise<void> {
  await db.run(
    `INSERT INTO platform_config (key, value, updated_at) VALUES ($k, $v, $t)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    { k: key, v: String(value), t: at },
  );
}

export const minCohort = async (db: Db): Promise<number> => await configValue(db, 'min_cohort', CONFIG.privacy.minCohort);
export const minVenues = async (db: Db): Promise<number> => await configValue(db, 'min_venues', CONFIG.privacy.minVenues);

/**
 * The plans, their perks, the terms they are sold on, the category average
 * checks, and a small gift-card catalogue. Idempotent: safe to run on every
 * boot.
 */
export async function seedPlatform(db: Db, at: Iso = now()): Promise<void> {
  await db.tx(async () => {
    await seedPlans(db, at);
    await seedCategoryDefaults(db);
    /*
     * **There is no gift-card catalogue here, and there must not be one.**
     *
     * Five real brand names — Zalando, Media Expert, Douglas, Hebe, Empik —
     * were written on every boot with 250 in stock each, carried over from the
     * prototype's own wallet so the two would agree. Nothing behind them was
     * real: there is no agreement with any of those retailers, and a catalogue
     * offering a 50 zł Zalando card for 500 points is a promise the product
     * cannot keep to the first person who saves up for one. Worse, it is a
     * promise made in *points*, which people spend a month earning.
     *
     * Making it opt-in behind an env flag was the intermediate answer and it
     * was not enough: the flag is set once on a box and forgotten, and the rows
     * it wrote are indistinguishable from stock an operator entered. The shelf
     * is `gift_card_stock`, it starts empty, and only an operator fills it.
     * `wallet.tsx` and `games.tsx` both render the empty shelf as itself.
     */
    await seedWords(db);
    await seedDailyTasks(db, at);
  });
}

/**
 * The daily-task inventory.
 *
 * **Product configuration, not anybody's data**, which is the line the
 * "nothing is seeded" rule in `README.md` draws: the plan ladder, the category
 * defaults and the word bank are written on every boot because they are the
 * product's own shape, while a venue, a deal or a gift card is a fact about a
 * business and is only ever written through the partner API. Five prompts on the
 * Play screen are the former — a fresh box with no tasks in it has an empty
 * panel where the nudges go, and there is nothing true for that emptiness to
 * mean.
 *
 * It carries neither the copy nor the amounts, and `daily_tasks` in
 * `schema.sql` says why at length. The short of it: a translated sentence in a
 * database is one that is missing in Ukrainian with nothing to report it, and a
 * points value in a database is one that can disagree with what the ledger
 * pays.
 *
 * `DO UPDATE` on the two columns an operator does not own, and **not** on
 * `active`: turning a prompt off is an operator decision on a live box, and a
 * restart that switched it back on would make the control useless. That is the
 * same shape `seedPlans` uses for the same reason.
 */
const DAILY_TASKS: ReadonlyArray<{ key: string; copyKey: string; reward: string; order: number }> = [
  /* First because it is the one that resets every day and the only one a player
     can lose by not doing — the streak is behind it. */
  { key: 'check_in', copyKey: 'checkIn', reward: 'check_in', order: 1 },
  /* The featured game's once-a-day bonus. The website rotates this, the
     profile and the invite inside its points card; the other two stay for the
     phone, which has a check-in button and a round counter to point at. */
  { key: 'daily_game', copyKey: 'dailyGame', reward: 'daily_game', order: 2 },
  { key: 'play_round', copyKey: 'playRound', reward: 'play_round', order: 3 },
  { key: 'profile', copyKey: 'profile', reward: 'profile', order: 4 },
  { key: 'invite', copyKey: 'invite', reward: 'invite', order: 5 },
];

async function seedDailyTasks(db: Db, at: Iso): Promise<void> {
  for (const task of DAILY_TASKS) {
    await db.run(
      `INSERT INTO daily_tasks (key, copy_key, reward, sort_order, active, updated_at)
       VALUES ($k, $c, $r, $o, 1, $t)
         ON CONFLICT (key) DO UPDATE SET
           copy_key = excluded.copy_key,
           reward = excluded.reward,
           sort_order = excluded.sort_order,
           updated_at = excluded.updated_at`,
      { k: task.key, c: task.copyKey, r: task.reward, o: task.order, t: at },
    );
  }
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
  /**
   * The price list per market (`plan_prices`): per-month price on each
   * commitment a market quotes, in that currency's minor units. Absent on a
   * free plan and on a plan sold only at `priceMinor` in złoty.
   */
  prices?: ReadonlyArray<{ currency: string; months: number; priceMinor: number }>;
  entitlements: Record<string, string | number | boolean>;
}

/**
 * "Unlimited", written in a column whose values are text.
 *
 * `entNumber` hands every caller a number and every caller compares against it,
 * so the top tier needs a figure no real account reaches rather than a second
 * type in `plan_entitlements` for the one row that means "no ceiling". Ten
 * thousand assistant questions is one every nine seconds from one midnight to
 * the next; the sentinel is honest about being a bound, because it *is* one —
 * just not one anybody will find.
 *
 * It is spent on exactly two keys now — `streak_freezes` and
 * `assistant_uses_per_day` — and the tiered numbers everywhere else are real
 * numbers a customer can be told. That is the direction to keep travelling: a
 * perk written as a figure ("seven energy", "ten hints") is one a plan card can
 * print, and a sentinel is what you reach for only when the honest answer is
 * that nobody will ever hit the ceiling.
 */
const UNLIMITED = 9999;

/**
 * The free plan's assistant allowance, exported because two files need it and
 * `config.ts` has no home for it.
 *
 * `plan_entitlements` *is* the config for this one (C6: tiers change without a
 * deploy), so the number lives in the seed below — but the route that enforces
 * it needs a fallback for a database whose plan rows predate the key, and a
 * fallback that disagrees with the seed is a limit nobody can predict. One
 * constant, read by the seed and by `routes/consumer.ts`.
 */
export const FREE_ASSISTANT_USES_PER_DAY = 5;

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
      /*
       * The free tier is genuinely useful: earning, redeeming, games and deals
       * all work. What paid tiers add is headroom, never access (§12a.1).
       *
       * Every key below is the **free** figure and every one of them is also
       * the floor the code falls back to when a row is missing, so this block
       * and `config.ts` have to keep saying the same thing — which is why the
       * ones that have a home there are read from it rather than retyped.
       *
       * The three plans list their keys in the same order on purpose: the whole
       * commercial argument for a tier is the column diff, and a reader who has
       * to hunt for `word_hints_per_day` in three differently-ordered blocks
       * cannot see it.
       */
      daily_energy: CONFIG.points.dailyEnergy,
      /* Energy comes back on a clock, and the clock is what a plan buys: two
         hours free, one on Pro, half an hour on Premium. A faster refill is
         worth more than a bigger pool to the player who runs out at nine in the
         morning, which is the player this key exists for — and now that every
         finished round costs one, that is every player, not just the one
         losing. The two keys together are what a day is: from a full tank,
         `daily_energy + 1440 / energy_regen_minutes` rounds, so 16 here, 30 on
         Pro, 58 on Premium.

         All three intervals were cut hard together (240/180/120 → 120/60/30)
         while the ceilings stayed where they were, which is what
         turns the tank into a burst allowance and the refill into the day. The
         diff between the tiers widened with it: Pro used to buy a quarter more
         rounds than free and now buys nearly twice as many. */
      energy_regen_minutes: CONFIG.points.energyRegenMinutes,
      /* **Game rounds only** — see the note in `entitlements.ts`. The venue
         lines below have their own per-tier figures, and multiplying those as
         well would pay a paid plan twice for one visit. */
      points_multiplier: 1,
      /* What a visit is worth, per tier, as four named numbers rather than as
         the multiplier applied twice. A table anybody can read beats an
         arithmetic rule nobody can predict — `config.ts` says the same thing
         from the other end, and these four are its free-plan row. */
      scan_points: CONFIG.earn.scan,
      first_visit_points: CONFIG.earn.firstVisitToVenue,
      stamp_points: CONFIG.earn.stampCardComplete,
      new_category_points: CONFIG.earn.newCategory,
      /* How long a bought voucher stays spendable. Two weeks is long enough to
         plan a meal around and short enough that the venue's reserve is not
         held for a season by somebody who has forgotten they have it —
         `CONFIG.vouchers.validityDays` is the fallback, not this number. */
      voucher_validity_days: 14,
      word_hints_per_day: 3,
      /* Questions the assistant answers in a day. It costs a model call and a
         retrieval pass per ask, so this is the one consumer key whose ceiling
         is a real running cost rather than a design choice. */
      assistant_uses_per_day: FREE_ASSISTANT_USES_PER_DAY,
      /* The mark beside the name on a leaderboard. Empty is not "no key set" —
         it is the free tier's badge, which is none. */
      profile_badge: '',
      streak_freezes: 2,
      exclusive_deals: false,
      deal_early_access_hours: 0,
      /* Rulebook §2.1 / §9.4: a gift card is face value Paylez buys, so it is a
         paid-tier reward — false here, true on Pro and Premium.
         `vouchers.redeemGiftCard` refuses on it, and a client draws the shop
         as an upgrade prompt from the same key. */
      gift_card_priority: false,
      monthly_stipend: 0,
      priority_support: false,
      assistant: true,
    },
  },
  {
    audience: 'consumer',
    code: 'pro',
    name: 'Pro',
    priceMinor: 1999,
    /*
     * **No trial, on any plan.** See `startSubscription`: the status a
     * subscription opens in is derived from this number, and a zero here is
     * what keeps a paid subscription out of `trialing` — which is the state
     * that would otherwise renew on the day it started.
     */
    trialDays: 0,
    rank: 1,
    terms: true,
    entitlements: {
      daily_energy: 6,
      energy_regen_minutes: 60,
      points_multiplier: 1.25,
      scan_points: 30,
      first_visit_points: 150,
      stamp_points: 150,
      new_category_points: 50,
      voucher_validity_days: 30,
      word_hints_per_day: 6,
      assistant_uses_per_day: 20,
      profile_badge: 'star',
      streak_freezes: 5,
      exclusive_deals: true,
      deal_early_access_hours: 0,
      gift_card_priority: true,
      monthly_stipend: CONFIG.earn.proStipend,
      priority_support: false,
      assistant: true,
    },
  },
  {
    audience: 'consumer',
    code: 'premium',
    name: 'Premium',
    priceMinor: 3999,
    trialDays: 0,
    rank: 2,
    terms: true,
    entitlements: {
      daily_energy: 10,
      energy_regen_minutes: 30,
      points_multiplier: 1.75,
      scan_points: 50,
      first_visit_points: 250,
      stamp_points: 250,
      new_category_points: 100,
      /* Two months. The reserve it holds against a venue's pool is the cost of
         this one, which is why the top tier is where it stops rather than
         somewhere it keeps growing. */
      voucher_validity_days: 60,
      /* Ten, not the sentinel: a hint per word is five a round, and a number a
         card can print is worth more than "unlimited" here. */
      word_hints_per_day: 10,
      assistant_uses_per_day: UNLIMITED,
      profile_badge: 'crown',
      streak_freezes: UNLIMITED,
      exclusive_deals: true,
      /* A day's head start on a deal, which is the perk that costs the platform
         nothing and is worth the most on a deal with a claim ceiling. */
      deal_early_access_hours: 24,
      gift_card_priority: true,
      /* The monthly credit, from the earn table so the subscription and the
         gift are priced against each other in one place: it must stay worth
         clearly less than the plan costs, or the plan refunds itself. */
      monthly_stipend: CONFIG.earn.premiumStipend,
      priority_support: true,
      assistant: true,
    },
  },
  /*
   * ── The partner ladder: Starter / Growth / Scale ─────────────────────────
   *
   * **Every figure below is the pricing strategy's**, §5 and the price card in
   * §12 (`landing/uploads/paylez-pricing-strategy.md`), and this block is the
   * one place they are written: `GET /v1/plans?audience=partner` serves them,
   * and the dashboard's plan sheet and `#/business` both render that response
   * rather than a copy of it. The strategy's own instruction was to *settle the
   * price list* — the older Growth 299 zł / Chain 799 zł is retired below
   * (`SUCCESSORS`), so two price lists cannot meet in a sales conversation.
   *
   * The keys are listed in the strategy's own row order, so the table and this
   * block can be read side by side. Three kinds of value:
   *
   * - **Counts**, where `UNLIMITED` is the sentinel the client writes as a word.
   * - **Flags**, `true` / `false`.
   * - **Levels**, a word the client looks up (`basic`, `full`, `standard`,
   *   `advanced`, `email`, `chat`, `manager`) — the strategy grades these rows
   *   rather than counting them, and a number invented to stand in for "Advanced"
   *   would be a figure nobody chose. Empty is "not included".
   *
   * And one **money** value, `loyalty_budget`: a JSON map of currency to minor
   * units, because the strategy sets it per market (3 900 zł against 2 000 000
   * so'm) for the same reason it sets the prices per market.
   *
   * What is enforced, and where — so a reader can tell a gate from a promise:
   * `live_deals`, `active_campaigns`, `venues` (`requireCapacity`), `push_quota`
   * (`deals.pushQuota`), `passes`, `pass_limit`, `pass_subscribers`
   * (`domain/passes.ts`), `deep_analytics`, `benchmarks`, `identified_profiles`,
   * `export_csv`, `assistant` (`routes/partner.ts`). The rest describe what the
   * tier is sold with and are delivered by people or by features still to be
   * built (API access, the account manager, multi-venue passes, member-only
   * deals, tiered vouchers, the assistant's two grades, the loyalty budget's
   * ceiling) — the plan sheet prints them because the price list does.
   */
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
         paying." The strategy goes further on deals: unlimited on every tier. */
      live_deals: UNLIMITED,
      /* "Basic" deal analytics is the base the overview already serves; "Full"
         is `deep_analytics`, which `routes/partner.ts` gates the rest behind. */
      deep_analytics: false,
      /* "1 (fixed)": one loyalty campaign running, and no budget of its own. */
      active_campaigns: 1,
      voucher_tiers: false,
      push_quota: 2,
      identified_profiles: false,
      /* Rides with the customer list: an export of a list you cannot see would
         be the list by another door. */
      export_csv: false,
      benchmarks: false,
      venues: 1,
      team_management: false,
      assistant: false,
      assistant_level: '',
      api_access: false,
      support: 'email',
      /* "Preview only": a Starter venue can build a pass and see it, and cannot
         publish one — `passes` is what `assertPublishable` asks. */
      passes: false,
      pass_limit: 0,
      pass_subscribers: 0,
      pass_analytics: '',
      multi_venue_passes: false,
      member_deals: false,
      vouchers: true,
    },
  },
  {
    audience: 'partner',
    code: 'growth',
    name: 'Growth',
    priceMinor: 14900,
    trialDays: 0,
    rank: 1,
    /* 149 zł a month, or 119 a month on the annual — §5. Tashkent's figures are
       the same digits in so'm, which is the strategy's point: about 29% of the
       Polish price in real terms, a POS add-on rather than a software platform. */
    prices: [
      { currency: 'PLN', months: 1, priceMinor: 14900 },
      { currency: 'PLN', months: 12, priceMinor: 11900 },
      { currency: 'UZS', months: 1, priceMinor: 149000 },
      { currency: 'UZS', months: 12, priceMinor: 119000 },
    ],
    entitlements: {
      live_deals: UNLIMITED,
      deep_analytics: true,
      /* "Full": no ceiling on how many run at once — the budget is the bound. */
      active_campaigns: UNLIMITED,
      loyalty_budget: JSON.stringify({ PLN: 390000, UZS: 2000000 }),
      voucher_tiers: true,
      push_quota: 4,
      identified_profiles: true,
      export_csv: true,
      /* B9: benchmarks are explicitly a Growth-tier entitlement. */
      benchmarks: true,
      venues: 3,
      team_management: false,
      assistant: true,
      assistant_level: 'standard',
      api_access: false,
      support: 'chat',
      passes: true,
      /* "2 passes · 200 subscribers": live or paused passes at once, and people
         holding any of the venue's passes at once. */
      pass_limit: 2,
      pass_subscribers: 200,
      pass_analytics: 'basic',
      multi_venue_passes: false,
      member_deals: true,
      vouchers: true,
    },
  },
  {
    audience: 'partner',
    code: 'scale',
    name: 'Scale',
    priceMinor: 34900,
    trialDays: 0,
    rank: 2,
    prices: [
      { currency: 'PLN', months: 1, priceMinor: 34900 },
      { currency: 'PLN', months: 12, priceMinor: 27900 },
      { currency: 'UZS', months: 1, priceMinor: 349000 },
      { currency: 'UZS', months: 12, priceMinor: 279000 },
    ],
    entitlements: {
      live_deals: UNLIMITED,
      deep_analytics: true,
      active_campaigns: UNLIMITED,
      loyalty_budget: JSON.stringify({ PLN: 1200000, UZS: 6000000 }),
      voucher_tiers: true,
      push_quota: 10,
      identified_profiles: true,
      export_csv: true,
      benchmarks: true,
      venues: UNLIMITED,
      team_management: true,
      assistant: true,
      assistant_level: 'advanced',
      api_access: true,
      support: 'manager',
      passes: true,
      pass_limit: UNLIMITED,
      pass_subscribers: UNLIMITED,
      pass_analytics: 'full',
      multi_venue_passes: true,
      member_deals: true,
      vouchers: true,
    },
  },
];

/**
 * A plan replaced by another, and where its subscribers go.
 *
 * Chain (799 zł) became Scale (349 zł) when the strategy settled the price list.
 * **Moved rather than grandfathered**, which is the opposite of what `RETIRED`
 * does for Plus, and the difference is the direction: every Scale figure is at
 * least Chain's (unlimited deals, venues, campaigns and passes against Chain's
 * 20 / 25 / 10 / any) at under half the list price, so leaving a venue on the
 * withdrawn row would keep it on the *worse* plan for paying more — and keep it
 * off the ladder the plan sheet draws, with no card marked as its own. The
 * strategy's "existing subscribers keep their price" (§11) protects a customer
 * from a rise; this is a cut, and it is applied.
 *
 * Only the `plan_id` changes. Status, source, dates and the processor's
 * reference stay as they were, so nobody's renewal moves and nothing is billed:
 * partner tiers are granted from the console (`manual`), and no partner price
 * has ever been mapped in Stripe (`stripe:setup` maps the consumer audience
 * unless told `--partner`). Run on every boot, it is a no-op once the old row
 * is empty — which also catches a subscription a console wrote against the old
 * id between two boots.
 */
const SUCCESSORS: ReadonlyArray<{ audience: 'consumer' | 'partner'; from: string; to: string }> = [
  { audience: 'partner', from: 'chain', to: 'scale' },
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
 * Nothing in the product reads a plan *code* to decide what something is worth
 * any more, so a grandfathered subscriber is exactly their entitlement rows and
 * nothing else. That used to be untrue: the round-decay curve was keyed on the
 * code, and `plus` — not being one of the three the curve knew — silently
 * bought the free ladder. Keep it that way. A rule that switches on the code
 * makes retiring a tier a change to what its subscribers get.
 */
const RETIRED: ReadonlyArray<{ audience: 'consumer' | 'partner'; code: string }> = [
  /* Free / Plus / Premium became Free / Pro / Premium. */
  { audience: 'consumer', code: 'plus' },
  /* Starter / Growth / Chain became Starter / Growth / Scale; its subscribers
     are moved first (`SUCCESSORS`), so this withdraws an empty row. */
  { audience: 'partner', code: 'chain' },
];

/**
 * Entitlement keys no plan grants any more.
 *
 * **This list is the difference between renaming a key and adding one.** The
 * seed upserts every key in `PLANS` on every boot and has no idea what it wrote
 * last time, so a key that stops appearing in the seed does not stop existing —
 * it sits in `plan_entitlements` at whatever value the build before the rename
 * left there. That is not inert. `entNumber` reads a key by name and returns the
 * first row it finds, so a stale `daily_lives` is a live tier figure that no
 * file in the repo mentions and nothing keeps in step with the key that
 * replaced it: change Premium's energy to 9 and the ghost still says 7.
 *
 * Deleted by key across every plan rather than per plan, because the question is
 * "does this key exist anywhere" and a key withdrawn from one tier and left on
 * another is the same drift one row smaller. Nothing has a foreign key into
 * `plan_entitlements`, so the row can simply go — and running the delete on
 * every boot is what makes a database seeded by an older build converge without
 * a migration.
 */
const RETIRED_ENTITLEMENTS: readonly string[] = [
  /* Hearts became energy, and both keys moved with the word. */
  'daily_lives',
  'life_regen_minutes',
  /* The per-game decay curve is gone — a round pays the same whether it is the
     first of the day or the ninth, and energy is what bounds the day. This key
     named which ladder priced a repeat, so a row left behind would be the only
     surviving trace of a mechanism with no reader: harmless to `entNumber`,
     which never asks for it, and exactly the kind of ghost that gets a curve
     re-implemented around it because the table still says a plan buys one. */
  'round_decay',
  /* A seat count nothing enforced, replaced by the strategy's yes/no row
     "Team management & roles" (`team_management`, Scale only). A count left
     behind would be printed by a client as a promise nobody keeps. */
  'team_seats',
];

async function seedPlans(db: Db, at: Iso): Promise<void> {
  for (const plan of PLANS) {
    const id = `pln_${plan.audience}_${plan.code}`;
    await db.run(
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
      await db.run(
        `INSERT INTO plan_entitlements (plan_id, key, value) VALUES ($p, $k, $v)
           ON CONFLICT (plan_id, key) DO UPDATE SET value = excluded.value`,
        { p: id, k: key, v: String(value) },
      );
    }
    await seedTerms(db, id, plan.priceMinor, plan.terms === true);
    await seedPrices(db, id, plan.prices ?? []);
  }

  /* Before `RETIRED`, so the row being withdrawn is already empty; after the
     upsert loop, so the successor exists to be pointed at. */
  for (const move of SUCCESSORS) {
    await db.run(
      `UPDATE subscriptions SET plan_id = (SELECT id FROM plans WHERE audience = $a AND code = $to), updated_at = $t
        WHERE plan_id IN (SELECT id FROM plans WHERE audience = $a AND code = $from)
          AND EXISTS (SELECT 1 FROM plans WHERE audience = $a AND code = $to)`,
      { a: move.audience, from: move.from, to: move.to, t: at },
    );
  }

  /* After the upsert loop, never before it: a key deleted first would be put
     straight back by a plan that still listed it, which is exactly the failure
     this is here to catch if one ever does. */
  for (const key of RETIRED_ENTITLEMENTS) {
    await db.run(`DELETE FROM plan_entitlements WHERE key = $k`, { k: key });
  }

  for (const plan of RETIRED) {
    await db.run(`UPDATE plans SET active = 0 WHERE audience = $a AND code = $c`, {
      a: plan.audience,
      c: plan.code,
    });
    await db.run(
      `DELETE FROM plan_terms WHERE plan_id IN
         (SELECT id FROM plans WHERE audience = $a AND code = $c)`,
      { a: plan.audience, c: plan.code },
    );
    await db.run(
      `DELETE FROM plan_prices WHERE plan_id IN
         (SELECT id FROM plans WHERE audience = $a AND code = $c)`,
      { a: plan.audience, c: plan.code },
    );
  }

  await settleWithdrawnTrials(db, at);
}

/**
 * Subscriptions left sitting in `trialing` after the trial was withdrawn.
 *
 * No plan is sold with one any more, so `startSubscription` cannot mint that
 * status — but a database seeded before the change still holds rows in it, and
 * they would stay there for as long as the subscription lives: nothing resolves
 * `trialing` except the renewal sweep, which moves it on the renewal date the
 * *trial* set, and the admin console's "trials" list would keep reporting
 * customers on a trial the product no longer offers.
 *
 * `trialing` and `active` are both in `ENTITLED`, and `renews_at` is left
 * exactly where it was, so nobody gains or loses a day of anything — this
 * changes the *word* on the row and nothing else. The `trial_days = 0` clause
 * makes it self-limiting: put a trial back on a plan and its subscriptions stop
 * being touched, which is what makes running this on every boot safe.
 */
async function settleWithdrawnTrials(db: Db, at: Iso): Promise<void> {
  await db.run(
    `UPDATE subscriptions SET status = 'active', updated_at = $t
      WHERE status = 'trialing'
        AND plan_id IN (SELECT id FROM plans WHERE trial_days = 0)`,
    { t: at },
  );
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
async function seedTerms(db: Db, planId: string, monthlyMinor: number, sold: boolean): Promise<void> {
  await db.run(`DELETE FROM plan_terms WHERE plan_id = $p`, { p: planId });
  if (!sold) return;

  for (const rung of TERM_LADDER) {
    const term = termPricing(monthlyMinor, rung.months, rung.discountBp);
    await db.run(
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
 * A plan's per-market price list, rebuilt from the seed — the same "rebuilt
 * rather than reconciled" reasoning as `seedTerms`: nothing has a foreign key
 * into `plan_prices`, so a price taken off the list has to leave no row behind.
 * The total is derived from the monthly figure, never typed, so the per-month
 * price on a card and the amount one invoice charges cannot disagree.
 */
async function seedPrices(
  db: Db,
  planId: string,
  prices: ReadonlyArray<{ currency: string; months: number; priceMinor: number }>,
): Promise<void> {
  await db.run(`DELETE FROM plan_prices WHERE plan_id = $p`, { p: planId });
  for (const price of prices) {
    await db.run(
      `INSERT INTO plan_prices (plan_id, currency, months, price_minor, total_minor)
       VALUES ($p, $c, $m, $pm, $tm)`,
      {
        p: planId,
        c: price.currency,
        m: price.months,
        pm: price.priceMinor,
        tm: price.priceMinor * price.months,
      },
    );
  }
}

/**
 * §4.5's fallback: what a check is worth in a category before a venue has thirty
 * confirmed transactions of its own. Kraków figures, in grosze.
 *
 * One row per category of the venue taxonomy (`domain/categories.ts`) and no
 * other: `venues.category` holds those keys, so a row under any other word is
 * one nothing can look up. Each figure is the closest one the older,
 * wider list carried — coffee is the old café, leisure the old fitness, Halal
 * the old restaurant (it is mostly restaurants and kebab houses), the rest
 * their own old namesakes. A venue with no row falls back to the 60 zł in
 * `venues.averageCheck`.
 */
const CATEGORY_DEFAULTS: Array<[string, number]> = [
  ['coffee', 3200],
  ['restaurant', 8500],
  ['shopping', 9000],
  ['leisure', 14000],
  ['beauty', 12000],
  ['housing', 30000],
  ['bakery', 1800],
  ['halal', 8500],
];

async function seedCategoryDefaults(db: Db): Promise<void> {
  for (const [category, minor] of CATEGORY_DEFAULTS) {
    await db.run(
      `INSERT INTO category_defaults (category, avg_check_minor, currency) VALUES ($c, $m, 'PLN')
         ON CONFLICT (category) DO UPDATE SET avg_check_minor = excluded.avg_check_minor`,
      { c: category, m: minor },
    );
  }
  /* The rows the older list wrote (`cafe`, `dental`, `places`, …) are
     product configuration for categories that no longer exist, so they go:
     the console lists this table, and a row nothing can look up is noise. */
  const keep = CATEGORY_DEFAULTS.map((_, i) => `$k${i}`).join(', ');
  await db.run(
    `DELETE FROM category_defaults WHERE category NOT IN (${keep})`,
    Object.fromEntries(CATEGORY_DEFAULTS.map(([category], i) => [`k${i}`, category])),
  );
}

/*
 * `GIFT_CARDS` and `seedGiftCards` were here — a five-row table of real retail
 * brands with face values and points prices, upserted into `gift_card_stock` at
 * boot. Both are deleted; see the note in `seedPlatform`. The table it wrote to
 * is untouched and is still the only place a voucher can come from, which is
 * what makes `vouchers.redeem` a real transaction rather than a lookup into a
 * list somebody typed.
 */

/**
 * The Word Builder bank.
 *
 * Polish first, because the product's reason for existing is somebody who has
 * just moved to Kraków — the words are the ones a newcomer meets in a week of
 * ordinary errands, not a dictionary sample. The tier is the spec's own: 1 for
 * three or four letters, 2 for five or six, 3 for seven and up.
 *
 * **It no longer prices the word.** It did — the tier *was* the payment, and
 * before that a bonus on top of a base — and under the points rulebook's common
 * 0–100 performance scale every word in a round is worth the same 33. A scale
 * where a hard word pays more is a scale where the round is worth whatever it
 * happened to deal, and "a round is a round" is the rule the scale exists to
 * enforce. What the tier still decides is which words are dealt and what a client
 * can say about them, which is the thing a human curator was rating.
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

/**
 * The thirty-word placeholder, and it is explicitly a **floor** now.
 *
 * ## What this is for
 *
 * A checkout with no `updates/` still has to be able to play Word Builder, so
 * these thirty words exist. They are not the bank: `db/import.ts` reads the
 * real lists — 136 words per language, with their own authored tiers and hints
 * — out of `updates/paylez-words-*.json`, which is where the front end has
 * always read them from.
 *
 * ## Two things changed here and both were bugs
 *
 * **The words are stored upper-case.** They were lower-case, the export is
 * upper-case, and `buildWords` upper-cases on read — so the column's case was
 * presentational and the two writers disagreed about it. Which meant `rent` and
 * `RENT` were two rows for one word, and whichever existed decided the tier and
 * the hint. Now the id is keyed on the folded word and the word is stored
 * folded up, so a word is one row whoever wrote it.
 *
 * **`DO NOTHING`, not `DO UPDATE`.** This is a seed: it puts a word there if
 * nothing better has. `DO UPDATE` ran on every boot and would now overwrite the
 * export's authored tier with the guess below for the thirty words they share —
 * which is the wrong direction, because the tier is what a word *pays* and the
 * export is the thing that decided it. The cost is that editing a hint here
 * does not propagate to a database that already has one; that is the correct
 * trade for a placeholder.
 *
 * The tier below is still a guess from the word's length — 3–4 easy, 5–7
 * medium, 8+ hard, the bands `updates/paylez-words-*.json` is authored against.
 * It is only ever used for a word the export does not carry.
 */
async function seedWords(db: Db): Promise<void> {
  /* Only into an **empty** list. The import replaces a language's bank with
     the CSV's (new ids, `wrd_wb-…`), so writing the placeholder beside it on
     the next boot would bring back thirty retired words — and one of them
     sharing a spelling with a CSV word (KAWA) would trip `UNIQUE (language,
     word)`, which `ON CONFLICT (id)` does not cover, and stop the boot. */
  const filled = new Set(
    (await db.all<{ language: string }>(`SELECT DISTINCT language FROM word_bank`))
      .map((row) => row.language),
  );
  for (const [language, word, hint] of WORDS) {
    if (filled.has(language)) continue;
    const tier = word.length <= 4 ? 1 : word.length <= 7 ? 2 : 3;
    await db.run(
      `INSERT INTO word_bank (id, language, word, tier, hint) VALUES ($i, $l, $w, $t, $h)
         ON CONFLICT (id) DO NOTHING`,
      {
        i: `wrd_${language}_${word.toLowerCase()}`,
        l: language,
        w: word.toUpperCase(),
        t: tier,
        h: hint,
      },
    );
  }
}
