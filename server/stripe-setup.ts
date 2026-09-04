/**
 * Create the Stripe products and prices for the plans this database already
 * has, and record which price belongs to which plan.
 *
 * `npm run stripe:setup` — run once per Stripe account (once for test, again
 * for live), and safe to re-run: a plan whose price is already recorded is
 * skipped rather than given a second price. That matters more than it sounds,
 * because Stripe has no "create this price if it does not exist" and a
 * duplicate price is invisible until two customers are charged from different
 * ones for the same plan.
 *
 * The prices come **from the database, not from this file**. `plans` already
 * holds the amount, the currency and the interval, and the front end already
 * renders those figures; typing them again here is how a price tag and a
 * charge end up disagreeing.
 */
import { PgDb } from './db/pg.ts';
import { openDb as openSqlite } from './db/db.ts';
import type { Db } from './db/db.ts';
import * as stripe from './ports/stripe.ts';
import { stripePriceKey } from './ports/billing.ts';
import { now } from './domain/time.ts';

const AUDIENCE = process.argv.includes('--partner') ? 'partner' : 'consumer';
const DRY = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  if (!stripe.configured()) {
    console.error('STRIPE_SECRET_KEY is not set.');
    process.exit(1);
  }

  /* A live key writes real products into a real account. It is allowed, but not
     by accident: it takes a flag that says so out loud. */
  if (stripe.live() && !process.argv.includes('--live')) {
    console.error(
      'That is a LIVE Stripe key (sk_live_…). Re-run with --live if you mean it.',
    );
    process.exit(1);
  }

  const url = process.env.PAYLEZ_PG_URL;
  const db: Db = url ? new PgDb(url) : await openSqlite(process.env.PAYLEZ_DB ?? 'server/data/paylez.db');
  console.log(`database: ${url ? 'postgres' : 'sqlite'} | stripe: ${stripe.live() ? 'LIVE' : 'test'}`);

  const plans = await db.all<{
    id: string;
    code: string;
    name: string;
    price_minor: number;
    currency: string;
  }>(
    `SELECT id, code, name, price_minor, currency FROM plans
      WHERE audience = $a AND active = 1 AND price_minor > 0 ORDER BY rank`,
    { a: AUDIENCE },
  );

  if (plans.length === 0) {
    console.log(`no paid ${AUDIENCE} plans to set up`);
    await db.close();
    return;
  }

  const at = now();
  let made = 0;
  let skipped = 0;

  for (const plan of plans) {
    /*
     * **One Stripe price per rung of the commitment ladder**, not one per plan.
     *
     * `plan_terms` holds 1, 3, 6 and 12 months at rising discounts, and the
     * pricing cards already show them — so a plan with only a monthly price
     * advertised "179.88 zł for 12 months, save 25%" and charged 19.99 a month.
     * The page quoted a price the checkout could not honour.
     *
     * A term is `total_minor` charged every `months` months, which is exactly
     * what the card's own sentence says ("{total} charged once, for {n}
     * months") and exactly what Stripe's `interval_count` expresses. Falling
     * back to a single monthly rung keeps a plan with no ladder working.
     */
    const terms = await db.all<{ months: number; total_minor: number }>(
      `SELECT months, total_minor FROM plan_terms WHERE plan_id = $p ORDER BY months`,
      { p: plan.id },
    );
    const rungs = terms.length
      ? terms
      : [{ months: 1, total_minor: plan.price_minor }];

    /* One product per plan, shared by its rungs: they are the same thing bought
       for different lengths, and Stripe's dashboard groups by product. */
    let productId: string | null = null;

    for (const rung of rungs) {
      const key = stripePriceKey(AUDIENCE, plan.code, rung.months);
      const existing = await db.get<{ value: string }>(
        `SELECT value FROM platform_config WHERE key = $k`,
        { k: key },
      );
      if (existing) {
        console.log(
          `  skip  ${plan.code.padEnd(9)} ${String(rung.months).padStart(2)}mo already mapped`,
        );
        skipped += 1;
        /* Remember which product that rung sits on, so the rungs still to be
           created join it rather than starting a second one. */
        if (!productId && !DRY) productId = (await stripe.getPrice(existing.value)).product;
        continue;
      }

      const amount = `${(rung.total_minor / 100).toFixed(2)} ${plan.currency}`;
      if (DRY) {
        console.log(
          `  would create  ${plan.code.padEnd(9)} ${String(rung.months).padStart(2)}mo  ${amount} every ${rung.months} month(s)`,
        );
        continue;
      }

      if (!productId) {
        const product = await stripe.createProduct(`Paylez ${plan.name}`, {
          paylez_plan: plan.id,
          paylez_code: plan.code,
          paylez_audience: AUDIENCE,
        });
        productId = product.id;
      }

      const price = await stripe.createPrice({
        product: productId,
        currency: plan.currency,
        unitAmount: rung.total_minor,
        intervalCount: rung.months,
        metadata: {
          paylez_plan: plan.id,
          paylez_code: plan.code,
          paylez_months: String(rung.months),
        },
      });

      await db.run(
        `INSERT INTO platform_config (key, value, updated_at) VALUES ($k, $v, $t)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        { k: key, v: price.id, t: at },
      );
      console.log(
        `  made  ${plan.code.padEnd(9)} ${String(rung.months).padStart(2)}mo  ${amount} every ${rung.months} month(s) -> ${price.id}`,
      );
      made += 1;
    }
  }

  await db.close();
  console.log(`\n${made} price(s) created, ${skipped} already mapped`);
  if (made > 0) {
    console.log('Set PAYLEZ_BILLING=live and restart the server to take payments.');
  }
}

await main();
