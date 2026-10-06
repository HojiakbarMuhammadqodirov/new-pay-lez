/**
 * Taking a subscription pass's money — **not built**, and this file says so.
 *
 * A pass is sold by the venue to its own customer, and the drawer promises the
 * venue keeps 100% with Paylez never holding the money. That is a connected
 * account: the venue is the merchant of record, Paylez is the platform, and the
 * charge goes to the venue's own Stripe balance. `ports/stripe.ts` cannot do
 * that — it sells *Paylez's* plans on Paylez's own account — and pointing it at
 * a pass would put a venue's takings in our account, which is the precise thing
 * the promise rules out.
 *
 * So this port has one implementation, and it charges nothing. Every period a
 * renewal writes is stamped `not_charged` (or `free`, for a trial), and the only
 * thing that can create a subscription in the first place is either the domain
 * function the test suite calls or a consumer route that is switched off
 * (`CONFIG.passes.selfServeSubscribe`).
 *
 * TODO(passes-payments): a Stripe Connect transport — onboarding a venue's
 * account (the drawer's "6 · GET PAID"), a Checkout Session in subscription
 * mode on that account with `application_fee_percent: 0`, and the webhook that
 * writes the subscription row **when the money moved**, never when checkout
 * started (the rule `ports/billing.ts` already lives by). When it lands,
 * `chargePeriod` is where a renewal asks for the money and `charge_status`
 * becomes `charged` or `failed`.
 */
import type { Db } from '../db/db.ts';

export interface PeriodToCharge {
  subscriptionId: string;
  periodId: string;
  priceMinor: number;
  currency: string;
}

export type ChargeOutcome =
  | { charged: true; externalRef: string }
  | { charged: false; reason: 'no_payment_rail' | 'free' };

/** Whether this deployment can take a pass's money at all. Always false today. */
export const paymentsAvailable = (): boolean => false;

/** Ask for one period's money. Today: nothing is asked for, and it says why. */
export async function chargePeriod(_db: Db, period: PeriodToCharge): Promise<ChargeOutcome> {
  if (period.priceMinor === 0) return { charged: false, reason: 'free' };
  return { charged: false, reason: 'no_payment_rail' };
}
