/**
 * The live rate table, over the built-in one.
 *
 * ## What this changes, and what it deliberately does not
 *
 * `i18n/fx.ts` is nineteen rates compiled into the bundle, and its own header
 * says what they are: "a snapshot, not a feed. Replace the numbers when a new
 * sheet lands." So until somebody edited a TypeScript file, the answer to "how
 * often do the rates refresh" was **never** — which is fine for a converter
 * that settles no payments and wrong for a page telling somebody what their
 * salary is worth.
 *
 * `GET /v1/fx` is the same nineteen, synced from the rate sheet twice a day
 * (`domain/rates.ts`). This overlays them **per code**, and that is the only
 * shape that is safe: every rate on both sides is units per one euro, so
 * replacing individual codes keeps a cross rate `to / from` exact — the
 * single-anchor rule `fx.ts` and `currency.ts` both turn on. Overlaying a
 * *pair* would not: two pairs derived from different snapshots do not agree.
 *
 * **The built-in table stays and is the fallback.** Not as a formality: this
 * card has to draw a rate with no session, on a first paint, and when the
 * server is unreachable. A converter that renders a spinner because a request
 * is in flight is worse than one showing a rate from last month — and the card
 * says which of the two it is showing rather than leaving the reader to assume.
 *
 * ## Prices are not converted through this
 *
 * `useMoney` still reads `CURRENCIES[language].rate`, which reads `fx.ts`. That
 * is deliberate and is the one place a live rate would be wrong: a price tag
 * that moved between two page loads because a sheet was edited is a price
 * nobody chose, and the site's prices are *ours* rather than a market quote.
 * The converter quotes a market; a price tag quotes us.
 */
import { FX, type FxCode } from '../i18n/fx';
import { useApi, type ApiState } from './useApi';

export const FX_PATH = '/v1/fx';

export interface LiveRate {
  code: string;
  base: string;
  rate: number;
  decimals: number;
  updated_at: string;
}

export interface LiveFx {
  base: string;
  /** When the rates were last *written*. Null on a database that has none. */
  updatedAt: string | null;
  /** When a sync was last *attempted*, which is the other half of the finding. */
  attemptedAt: string | null;
  attemptStatus: 'ok' | 'failed' | null;
  /** The server's own judgement on that pair — see `CONFIG.rates.staleHours`. */
  stale: boolean;
  rates: LiveRate[];
}

export interface Rates {
  /**
   * Units per one euro for a currency — the live figure where there is one,
   * the built-in one otherwise.
   *
   * Per code rather than per pair, which is what keeps `to / from` exact.
   */
  rateOf: (code: FxCode) => number;
  /** True when at least one rate came from the server. */
  live: boolean;
  /** When the live table was written, or null when none of it is live. */
  updatedAt: string | null;
  /** True only when the server answered *and* said the rates are old. */
  stale: boolean;
}

/**
 * Fold a `/v1/fx` answer into a rate lookup.
 *
 * Exported and pure so `npm run verify` owns it: the property that matters is
 * that a missing, empty or broken answer leaves every rate exactly where
 * `fx.ts` had it, and that is a thing to check rather than to hope.
 */
export function ratesFrom(state: ApiState<LiveFx>): Rates {
  const answer = state.status === 'ready' ? state.data : null;

  /* Only the codes this site knows about, and only sane numbers. A rate of 0
     would divide a conversion to Infinity and a negative one would print a
     negative amount — and the whole point of a fallback is that a bad answer
     lands on the built-in figure rather than on the screen. */
  const overlay = new Map<string, number>();
  for (const row of answer?.rates ?? []) {
    if (row.code in FX && Number.isFinite(row.rate) && row.rate > 0) {
      overlay.set(row.code, row.rate);
    }
  }

  /* The anchor has to be 1. A sheet that quoted `EUR` as anything else would
     scale every conversion on the page by that factor, silently — and the one
     rate nobody would think to check is the one that is 1 by definition. */
  if (overlay.get('EUR') !== 1) overlay.delete('EUR');

  return {
    rateOf: (code) => overlay.get(code) ?? FX[code].rate,
    live: overlay.size > 0,
    updatedAt: overlay.size > 0 ? (answer?.updatedAt ?? null) : null,
    stale: overlay.size > 0 && answer?.stale === true,
  };
}

/**
 * The rate table for a screen.
 *
 * No dependencies and no options: `/v1/fx` is `auth: 'none'`, the answer is the
 * same for everybody, and it is nineteen rows. The one reason this is a request
 * at all rather than a constant is that the constant was never refreshed.
 */
export function useRates(): Rates {
  const { state } = useApi<LiveFx>(FX_PATH);
  return ratesFrom(state);
}
