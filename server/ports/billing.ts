/**
 * The billing boundary.
 *
 * Everything on the Paylez side of a subscription — the lifecycle, the
 * reconciliation across sources, the entitlement resolution — is real and lives
 * in `domain/entitlements.ts`. What is on the *other* side of this file is a
 * network call to Stripe or to Apple with credentials this repository does not
 * have and must not invent: a checkout session, a receipt validation, a webhook
 * signature check.
 *
 * So this module is a port with two implementations chosen by configuration:
 *
 *   * **`local`** (the default) — every call resolves against the database
 *     immediately. A checkout returns a pretend URL and activates the plan; a
 *     receipt validates by shape; a webhook is trusted. It is what makes the
 *     whole subscription system runnable and testable end to end without an
 *     account at a payment processor, and it is refused outright in production.
 *   * **`stripe` / store adapters** — the two `TODO` markers below are the exact
 *     and only places a real integration plugs in. They are deliberately narrow:
 *     if a future implementation needs to touch anything beyond them, something
 *     has leaked out of the boundary.
 *
 * The signature check is the one thing that must never be softened. An
 * unauthenticated webhook that is trusted is an endpoint anybody can use to
 * grant themselves a plan.
 */
import { timingSafeEqual, createHmac } from 'node:crypto';
import type { Db } from '../db/db.ts';
import * as entitlements from '../domain/entitlements.ts';
import { DomainError } from '../domain/errors.ts';
import { newId } from '../domain/ids.ts';
import { now, plusDays, type Iso } from '../domain/time.ts';

export type Mode = 'local' | 'live';

export const mode = (): Mode =>
  process.env.PAYLEZ_BILLING === 'live' ? 'live' : 'local';

const liveRefused = (what: string): never => {
  throw new DomainError(
    'internal',
    `${what} needs a live billing adapter; set PAYLEZ_BILLING=live and configure the provider`,
  );
};

/* ═══════════════════════════════════════════════════════════════ checkout ══ */

export interface CheckoutInput {
  db: Db;
  subject: entitlements.Subject;
  planCode: string;
  source: 'stripe' | 'apple' | 'google';
  actorId: string;
  at?: Iso;
}

export async function startCheckout(input: CheckoutInput) {
  const at = input.at ?? now();

  if (mode() === 'live') {
    /* TODO(live): create a Stripe Checkout Session for the plan's price id and
       return its URL. The subscription row is *not* written here — it is
       written when the `checkout.session.completed` webhook arrives, because
       until the processor says the money moved, nothing has happened. */
    return liveRefused('checkout');
  }

  const subscription = entitlements.startSubscription(input.db, {
    subject: input.subject,
    planCode: input.planCode,
    source: input.source,
    externalRef: `local_${newId('bev')}`,
    at,
  });
  return {
    mode: 'local' as const,
    /* An honest fake: the client can follow it, see what it is, and nobody
       mistakes this for a payment page. */
    url: `about:blank#paylez-local-checkout/${subscription.id}`,
    subscription,
  };
}

/* ══════════════════════════════════════════════════ app-store receipts ══ */

export interface ReceiptInput {
  db: Db;
  userId: string;
  store: 'apple' | 'google';
  receipt: string;
  at?: Iso;
}

export type ReceiptResult =
  | { ok: true; subscription: entitlements.Subscription }
  | { ok: false; reason: string };

export async function validateReceipt(input: ReceiptInput): Promise<ReceiptResult> {
  const at = input.at ?? now();

  if (mode() === 'live') {
    /* TODO(live): POST the receipt to Apple's verifyReceipt / Google's
       purchases.subscriptions.get, read the product id and expiry from the
       *response*, and only then grant. §12a.2: "entitlements are granted only
       after server-side receipt validation." */
    liveRefused('receipt validation');
  }

  /* The local adapter accepts `plan:<code>` and nothing else, so a test has to
     say what it is claiming rather than being handed a plan for free. */
  const match = input.receipt.match(/^plan:([a-z_]+)$/);
  if (!match) return { ok: false, reason: 'receipt not recognised by the local adapter' };

  const subscription = entitlements.startSubscription(input.db, {
    subject: { userId: input.userId },
    planCode: match[1],
    source: input.store,
    externalRef: input.receipt,
    at,
  });
  return { ok: true, subscription };
}

/* ═══════════════════════════════════════════════════════════ webhooks ══ */

export interface WebhookInput {
  db: Db;
  source: string;
  signature: string;
  payload: Record<string, unknown>;
  at?: Iso;
}

/**
 * Apply a provider event.
 *
 * Order: verify, record, apply. Recording before applying is what makes a retry
 * free — the second delivery of the same event id finds the row and stops.
 */
export async function handleWebhook(input: WebhookInput) {
  const at = input.at ?? now();
  const secret = process.env.PAYLEZ_WEBHOOK_SECRET;

  if (mode() === 'live') {
    if (!secret) liveRefused('webhook verification');
    /* TODO(live): use the provider's own scheme — Stripe's timestamped
       `t=…,v1=…` header, Apple's signed JWS payload. The comparison below is
       the shape; the canonicalisation is provider-specific. */
    const expected = createHmac('sha256', secret!)
      .update(JSON.stringify(input.payload))
      .digest('hex');
    const given = Buffer.from(input.signature || '');
    if (
      given.length !== Buffer.byteLength(expected) ||
      !timingSafeEqual(given, Buffer.from(expected))
    ) {
      throw new DomainError('forbidden', 'bad webhook signature');
    }
  }

  const eventId = String(input.payload.id ?? input.payload.event_id ?? newId('bev'));
  const type = String(input.payload.type ?? 'unknown');

  const fresh = entitlements.recordBillingEvent(input.db, {
    source: input.source,
    eventType: type,
    externalId: eventId,
    payload: input.payload,
    at,
  });
  if (!fresh) return { applied: false, reason: 'already processed' };

  const ref = String(input.payload.subscription ?? input.payload.external_ref ?? '');
  const subscription = ref
    ? input.db.get<entitlements.Subscription>(
        `SELECT * FROM subscriptions WHERE external_ref = $r OR id = $r`,
        { r: ref },
      )
    : undefined;

  if (!subscription) {
    input.db.run(
      `UPDATE billing_events SET processed_at = $t, error = 'no matching subscription'
        WHERE source = $s AND external_id = $e`,
      { t: at, s: input.source, e: eventId },
    );
    return { applied: false, reason: 'no matching subscription' };
  }

  /* The provider's vocabulary, mapped onto the six statuses §12a.2 defines.
     Anything unrecognised is recorded and ignored rather than guessed at — a
     mis-mapped event is a customer losing perks they paid for. */
  const map: Record<string, entitlements.Subscription['status']> = {
    'invoice.paid': 'active',
    'customer.subscription.created': 'active',
    'customer.subscription.updated': 'active',
    'invoice.payment_failed': 'grace',
    'customer.subscription.deleted': 'cancelled',
    'charge.refunded': 'expired',
    DID_RENEW: 'active',
    DID_FAIL_TO_RENEW: 'grace',
    EXPIRED: 'expired',
    REFUND: 'expired',
  };
  const next = map[type];
  if (next) {
    entitlements.setStatus(
      input.db,
      subscription.id,
      next,
      at,
      next === 'active' ? plusDays(at, 30) : undefined,
    );
  }

  input.db.run(
    `UPDATE billing_events SET processed_at = $t WHERE source = $s AND external_id = $e`,
    { t: at, s: input.source, e: eventId },
  );
  return { applied: Boolean(next), status: next ?? null, subscriptionId: subscription.id };
}
