/**
 * Exchange rates, and where they come from.
 *
 * ## Where they came from before this file, which is the part worth writing down
 *
 * Two places, and neither of them refreshed:
 *
 * - **`exchange_rates`** was written **once**, by `db/import.ts`, from the
 *   `Rate` sheet in the Base44 export. So every rate in this database is as old
 *   as the export, and nothing has ever updated one. `analytics.costPerNewCustomer`
 *   reads it to state a plan fee in a venue's own currency.
 * - **`src/site/i18n/fx.ts`** is a hand-typed copy of the same sheet, compiled
 *   into the browser bundle, and it is what the site's prices and the Relocate
 *   converter actually quote. Its own header says so: "The rates are a
 *   snapshot, not a feed. Replace the numbers when a new sheet lands."
 *
 * The honest answer to "how often do they refresh" was therefore **never**: once
 * at import, and again whenever somebody edited a TypeScript file. That is a
 * defensible position for a converter that settles no payments and an indefensible
 * one for a page that tells somebody what their salary is worth.
 *
 * ## What it is now
 *
 * The live sheet, twice a day, into `exchange_rates`.
 *
 * The sheet is the one handed over for this
 * (`docs.google.com/spreadsheets/d/1ieUf8…`) and it is read as **CSV over plain
 * HTTP** — `gviz/tq?tqx=out:csv`, which every Google Sheet with link sharing
 * serves. That choice is the whole of the cost analysis:
 *
 * - **No Google API, no key, no OAuth, no quota.** The Sheets API would need a
 *   service account, a key in the environment and a client library — a third
 *   dependency in a repo whose budget is one — and would spend quota units per
 *   call. This spends none, because it is not an API call: it is a GET for a
 *   document Google is already serving publicly.
 * - **No Edge Function and no external cron.** This process is long-running and
 *   already runs four scheduled jobs; a rate sync is a fifth. A Supabase Edge
 *   Function invoked twice a day would be two invocations plus egress — small,
 *   but it is a second deployment target, a second place secrets live and a
 *   second thing to notice has stopped.
 * - **Two requests a day.** 343 rows, about 25 kB of CSV.
 *
 * So the marginal cost of this feature is two HTTP GETs a day against a
 * document with no rate limit that applies at this volume. It is the cheapest
 * arrangement that meets "at least twice a day", and it is cheapest by not
 * introducing an integration at all.
 *
 * ## The three rules
 *
 * - **Last-known-good survives a failure.** A fetch that fails writes *nothing*
 *   — no zeroes, no nulls, no `updated_at` bump. The previous rates stay and go
 *   on being served, because a stale rate is a small error and a missing one is
 *   a page that cannot draw a price. `lastSync` records the attempt so the
 *   staleness is visible rather than silent.
 * - **The anchor is EUR and only the `EUR…` block is read.** The sheet holds all
 *   342 ordered pairs; storing them would be 342 numbers that have to agree with
 *   each other. Anchored, a cross rate is `to / from` and is exact for every
 *   pair — the same argument `fx.ts` and `currency.ts` both make, and the reason
 *   the sheet's own `Check` column reads `TRUE` throughout.
 * - **The `PAYLEZ` column is the rate.** The sheet carries `Formula`, `PAYLEZ`,
 *   `Check` and `Backup`; `PAYLEZ` is the one the product is meant to quote and
 *   `Backup` is the previous value kept beside it. Reading `Backup` would quote
 *   yesterday's rate for ever.
 */
import { CONFIG } from '../config.ts';
import type { Db } from '../db/db.ts';
import { rowsOf, type CsvRow } from '../db/csv.ts';
import { now, type Iso } from './time.ts';

/**
 * The currencies this product quotes, with how many decimals each is written
 * to.
 *
 * Nineteen, mirroring `src/site/i18n/fx.ts` — and the decimals are here rather
 * than in the sheet because the sheet does not carry them and they are not a
 * property of the rate: zero decimals on the soum is a statement about what a
 * reader can act on (13 583 to the euro means a fractional soum carries no
 * information), not about how the rate was computed.
 *
 * A sheet row for a currency not on this list is **ignored**. That is the safe
 * direction: a currency arriving in the sheet before the product has a symbol,
 * a flag and a decimal convention for it would otherwise reach a price tag as
 * an unlabelled number.
 */
export const QUOTED: Record<string, number> = {
  EUR: 2,
  USD: 2,
  GBP: 2,
  PLN: 2,
  UAH: 2,
  RUB: 2,
  UZS: 0,
  KZT: 0,
  TRY: 2,
  CZK: 2,
  CHF: 2,
  BYN: 2,
  MDL: 2,
  GEL: 2,
  AMD: 0,
  AZN: 2,
  TMT: 2,
  KGS: 2,
  TJS: 2,
};

export interface SyncResult {
  /** `ok` when rates were written; `failed` when the previous ones were kept. */
  status: 'ok' | 'failed';
  /** How many rates were written. Zero on a failure. */
  written: number;
  /** Codes the sheet had and this product does not quote. */
  ignored: string[];
  /** Codes this product quotes and the sheet did not carry. */
  missing: string[];
  detail: string | null;
  at: Iso;
}

/**
 * A number as the sheet writes it.
 *
 * `"13,583.0000000"` — grouped with commas, seven decimal places, quoted. The
 * commas are the trap: `Number('13,583')` is `NaN`, so a naive parse silently
 * drops exactly the currencies whose rates are large, which is every one that
 * matters most to this audience.
 */
const numberOf = (value: string): number | null => {
  const parsed = Number(value.replace(/[\s,]/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Read the sheet and write what it says.
 *
 * `fetch` rather than a client library, for the reason at the top of this file
 * and the same reason `ports/stripe.ts` and `ports/llm.ts` use it: one
 * dependency at one boundary is the budget, and `pg` has spent it.
 */
export async function sync(db: Db, at: Iso = now()): Promise<SyncResult> {
  const fail = async (detail: string): Promise<SyncResult> => {
    /*
     * **Nothing is written on a failure.** Not a zero, not a null, not an
     * `updated_at` bump — the rates that are there stay there and go on being
     * served. A stale rate is a small error; a missing one is a page that
     * cannot draw a price.
     *
     * The *attempt* is recorded, so the staleness is visible: without it a
     * sheet that has been unreachable for a week looks identical to one that
     * has not changed in a week.
     */
    await db.run(
      `INSERT INTO platform_config (key, value, updated_at) VALUES ('rates_last_attempt', $v, $t)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      { v: JSON.stringify({ status: 'failed', detail, at }), t: at },
    );
    return { status: 'failed', written: 0, ignored: [], missing: [], detail, at };
  };

  let csv: string;
  try {
    const response = await fetch(CONFIG.rates.sheetUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(CONFIG.rates.timeoutMs),
    });
    if (!response.ok) return await fail(`http ${response.status}`);
    csv = await response.text();
  } catch (error) {
    return await fail((error as Error).message.slice(0, 200));
  }

  /* The same RFC 4180 reader the export goes through. The sheet quotes every
     field and some values contain a comma, so a `split(',')` would be wrong on
     exactly the large rates. */
  let rows: CsvRow[];
  try {
    rows = rowsOf(csv);
  } catch (error) {
    return await fail(`unparsable: ${(error as Error).message.slice(0, 120)}`);
  }

  /*
   * Only the `EUR…` block. The sheet's `Currency Pair` is two concatenated ISO
   * codes with no separator, which is why this is a slice rather than a split —
   * `EURUZS` has no delimiter in it to split on.
   */
  const found = new Map<string, number>();
  const ignored: string[] = [];
  for (const row of rows) {
    const pair = (row['Currency Pair'] ?? '').trim().toUpperCase();
    if (pair.length !== 6 || !pair.startsWith('EUR')) continue;
    const code = pair.slice(3);
    const rate = numberOf(row.PAYLEZ ?? '');
    if (rate === null) continue;
    if (!(code in QUOTED)) {
      ignored.push(code);
      continue;
    }
    found.set(code, rate);
  }

  /*
   * A sheet that parsed and yielded nothing is a **failure**, not an empty
   * success. It is what a login page, an error page or a renamed column all
   * look like from here, and writing "0 rates, updated just now" over a working
   * table is the one outcome this function must never produce.
   */
  if (found.size === 0) return await fail('no EUR rates in the sheet');

  /* The anchor itself is never in the sheet — `EUREUR` is not a pair — and it
     has to be in the table, because `to / from` divides by it. */
  found.set('EUR', 1);

  await db.tx(async () => {
    for (const [code, rate] of found) {
      await db.run(
        `INSERT INTO exchange_rates (code, base, rate, decimals, updated_at)
         VALUES ($c, 'EUR', $r, $d, $t)
           ON CONFLICT (code) DO UPDATE SET
             base = 'EUR', rate = excluded.rate, decimals = excluded.decimals,
             updated_at = excluded.updated_at`,
        { c: code, r: rate, d: QUOTED[code] ?? 2, t: at },
      );
    }
    await db.run(
      `INSERT INTO platform_config (key, value, updated_at) VALUES ('rates_last_attempt', $v, $t)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      { v: JSON.stringify({ status: 'ok', written: found.size, at }), t: at },
    );
  });

  /* A currency the product quotes that the sheet did not carry keeps whatever
     it had. Reported rather than corrected: a rate that has silently stopped
     being updated is the failure this whole file is about. */
  const missing = Object.keys(QUOTED).filter((code) => !found.has(code));

  return {
    status: 'ok',
    written: found.size,
    ignored: [...new Set(ignored)].sort(),
    missing,
    detail: null,
    at,
  };
}

/**
 * When the rates were last *written*, and when a sync was last *attempted*.
 *
 * Two timestamps because they answer different questions and the gap between
 * them is the finding: rates written on Monday with an attempt this morning
 * means the sheet has not changed, and rates written on Monday with the last
 * attempt on Monday means the sync has stopped. A UI showing only the first
 * cannot tell a reader which.
 */
export async function lastSync(db: Db): Promise<{
  ratesUpdatedAt: Iso | null;
  attemptedAt: Iso | null;
  attemptStatus: 'ok' | 'failed' | null;
}> {
  const rates = await db.get<{ at: string | null }>(
    `SELECT MAX(updated_at) AS at FROM exchange_rates`,
  );
  const attempt = await db.get<{ value: string; updated_at: string }>(
    `SELECT value, updated_at FROM platform_config WHERE key = 'rates_last_attempt'`,
  );

  let status: 'ok' | 'failed' | null = null;
  if (attempt) {
    try {
      const parsed = JSON.parse(attempt.value) as { status?: string };
      status = parsed.status === 'ok' ? 'ok' : parsed.status === 'failed' ? 'failed' : null;
    } catch {
      status = null;
    }
  }

  return {
    ratesUpdatedAt: rates?.at ?? null,
    attemptedAt: attempt?.updated_at ?? null,
    attemptStatus: status,
  };
}
