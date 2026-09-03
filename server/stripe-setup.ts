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
    const key = stripePriceKey(AUDIENCE, plan.code, 1);
    const existing = await db.get<{ value: string }>(
      `SELECT value FROM platform_config WHERE key = $k`,
      { k: key },
    );
    if (existing) {
      console.log(`  skip  ${plan.code.padEnd(9)} already mapped to ${existing.value}`);
      skipped += 1;
      continue;
    }

    const amount = `${(plan.price_minor / 100).toFixed(2)} ${plan.currency}`;
    if (DRY) {
      console.log(`  would create  ${plan.code.padEnd(9)} ${plan.name} at ${amount}/month`);
      continue;
    }

    const product = await stripe.createProduct(`Paylez ${plan.name}`, {
      paylez_plan: plan.id,
      paylez_code: plan.code,
      paylez_audience: AUDIENCE,
    });
    const price = await stripe.createPrice({
      product: product.id,
      currency: plan.currency,
      unitAmount: plan.price_minor,
      intervalCount: 1,
      metadata: { paylez_plan: plan.id, paylez_code: plan.code },
    });

    await db.run(
      `INSERT INTO platform_config (key, value, updated_at) VALUES ($k, $v, $t)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      { k: key, v: price.id, t: at },
    );
    console.log(`  made  ${plan.code.padEnd(9)} ${amount}/month -> ${price.id}`);
    made += 1;
  }

  await db.close();
  console.log(`\n${made} price(s) created, ${skipped} already mapped`);
  if (made > 0) {
    console.log('Set PAYLEZ_BILLING=live and restart the server to take payments.');
  }
}

await main();
