/**
 * Subscriptions and billing — Part D.
 *
 * The scope boundary is the most important thing in this file, so it goes at the
 * top: **subscription money is real money and is entirely separate from the
 * loyalty balance** (D4). Nothing here touches the points ledger. Points are
 * never purchasable and never withdrawable; a subscription buys perks and
 * capability. That separation is what keeps the loyalty system outside e-money
 * treatment even as real money flows, and it is enforced by there being no code
 * path from this file to `ledger.ts`.
 *
 * The three billing sources (D2) each have a webhook here. What arrives is
 * *recorded first, applied second*, and keyed by the provider's own event id so
 * a retry is a no-op — stores retry aggressively, and a renewal applied twice is
 * a month of free service.
 *
 * What is an adapter and what is real: the **lifecycle, reconciliation and
 * entitlement resolution are real and complete**. Talking to Stripe and to the
 * app stores — creating a checkout session, validating a receipt against
 * Apple's servers, verifying a webhook signature against a key this repo does
 * not have — is `ports/billing.ts`, and it says so.
 */
import * as audit from '../../domain/audit.ts';
import * as entitlements from '../../domain/entitlements.ts';
import { DomainError } from '../../domain/errors.ts';
import * as billingPort from '../../ports/billing.ts';
import { actor, oneOf, optInt, optStr, str } from '../input.ts';
import type { Route } from '../router.ts';

export const billingRoutes: Route[] = [
  {
    method: 'GET',
    pattern: '/v1/plans',
    auth: 'none',
    handler: async (ctx) => {
      const audience = (ctx.query.get('audience') ?? 'consumer') as 'consumer' | 'partner';
      return await Promise.all((await entitlements.plansFor(ctx.db, audience)).map(async (plan) => ({
        ...plan,
        entitlements: await ctx.db.all(`SELECT key, value FROM plan_entitlements WHERE plan_id = $p`, {
          p: plan.id,
        }),
      })));
    },
  },
  {
    method: 'GET',
    pattern: '/v1/me/subscription',
    auth: 'user',
    handler: async (ctx) => {
      const { user } = actor(ctx);
      return {
        subscription: (await entitlements.activeSubscription(ctx.db, { userId: user.id })) ?? null,
        plan: await entitlements.planFor(ctx.db, { userId: user.id }),
        entitlements: await entitlements.entitlementsFor(ctx.db, { userId: user.id }),
      };
    },
  },
  {
    /**
     * Start a checkout.
     *
     * The server decides the plan and the price from `plans`; the client sends a
     * plan *code*, never an amount. A checkout that trusts a client-supplied
     * price is the oldest hole in commerce.
     */
    method: 'POST',
    pattern: '/v1/billing/checkout',
    auth: 'user',
    handler: async (ctx) => {
      const { user } = actor(ctx);
      const venueId = optStr(ctx.body, 'venueId');
      const subject = venueId ? { venueId } : { userId: user.id };
      const source = oneOf(ctx.body, 'source', ['stripe', 'apple', 'google'] as const, 'stripe');

      if (venueId) {
        const owns = await ctx.db.get(`SELECT 1 FROM venues WHERE id = $v AND owner_user_id = $u`, {
          v: venueId,
          u: user.id,
        });
        if (!owns) throw new DomainError('forbidden', 'not your venue');
      }

      return await billingPort.startCheckout({
        db: ctx.db,
        subject,
        planCode: str(ctx.body, 'planCode'),
        /* Which rung of the ladder. Absent means monthly, which is what the
           cards default to for a plan that is not sold on a ladder. */
        months: optInt(ctx.body, 'months'),
        source,
        actorId: user.id,
        at: ctx.at,
      });
    },
  },
  {
    /**
     * App-store purchase, validated server-side (§12a.2).
     *
     * "Never trust the client's claim of plan." The client sends a receipt, not
     * a plan; entitlements are granted only after the receipt validates.
     */
    method: 'POST',
    pattern: '/v1/billing/receipt',
    auth: 'user',
    handler: async (ctx) => {
      const { user } = actor(ctx);
      const result = await billingPort.validateReceipt({
        db: ctx.db,
        userId: user.id,
        store: oneOf(ctx.body, 'store', ['apple', 'google'] as const),
        receipt: str(ctx.body, 'receipt', { max: 20_000 }),
        at: ctx.at,
      });
      if (!result.ok) throw new DomainError('bad_request', result.reason);
      return {
        subscription: result.subscription,
        entitlements: await entitlements.entitlementsFor(ctx.db, { userId: user.id }),
      };
    },
  },
  {
    method: 'POST',
    pattern: '/v1/billing/cancel',
    auth: 'user',
    handler: async (ctx) => {
      const { user } = actor(ctx);
      const venueId = optStr(ctx.body, 'venueId');
      const subject = venueId ? { venueId } : { userId: user.id };
      const subscription = await entitlements.activeSubscription(ctx.db, subject);
      if (!subscription) throw new DomainError('not_found', 'no active subscription');

      /* Cancelled at the end of the period, not immediately: they paid for the
         month. D3's "lapses restrict capability but never delete data" starts
         with not cutting somebody off the day they cancel. */
      await entitlements.setStatus(ctx.db, subscription.id, 'cancelled', ctx.at);
      await audit.record(ctx.db, {
        actorId: user.id,
        action: 'subscription.cancel',
        entity: 'subscription',
        entityId: subscription.id,
        venueId: venueId ?? null,
        at: ctx.at,
      });
      return { cancelled: true, until: subscription.renews_at };
    },
  },
  {
    /**
     * Processor and store webhooks (D2).
     *
     * Unauthenticated by design — the caller is Stripe or Apple, not a session —
     * and therefore *signature*-checked inside the port before anything is
     * applied. The route is one line because "record, then apply, idempotently"
     * is the entire contract.
     */
    method: 'POST',
    pattern: '/v1/billing/webhook/:source',
    auth: 'none',
    handler: async (ctx) =>
      await billingPort.handleWebhook({
        db: ctx.db,
        source: ctx.params.source,
        signature: String(ctx.req.headers['stripe-signature'] ?? ctx.req.headers['x-signature'] ?? ''),
        payload: ctx.body,
        rawPayload: ctx.rawBody,
        at: ctx.at,
      }),
  },
  {
    method: 'GET',
    pattern: '/v1/partner/venues/:id/subscription',
    auth: 'partner',
    handler: async (ctx) => {
      const venueId = ctx.params.id;
      const owns = await ctx.db.get(`SELECT 1 FROM venues WHERE id = $v AND owner_user_id = $u`, {
        v: venueId,
        u: actor(ctx).user.id,
      });
      if (!owns && !actor(ctx).roles.includes('admin')) {
        throw new DomainError('forbidden', 'not your venue');
      }
      return {
        subscription: (await entitlements.activeSubscription(ctx.db, { venueId })) ?? null,
        plan: await entitlements.planFor(ctx.db, { venueId }),
        entitlements: await entitlements.entitlementsFor(ctx.db, { venueId }),
        invoices: await ctx.db.all(
          `SELECT i.* FROM invoices i JOIN subscriptions s ON s.id = i.subscription_id
            WHERE s.venue_id = $v ORDER BY i.issued_at DESC LIMIT 24`,
          { v: venueId },
        ),
      };
    },
  },
];
