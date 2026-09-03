/**
 * Stripe, over `fetch`.
 *
 * No SDK, for the same reason `ports/llm.ts` calls the Claude API by hand: this
 * server has one runtime dependency (`pg`, because Postgres speaks a binary
 * protocol) and Stripe does not need to be the second. Its API is
 * form-encoded HTTP, the two calls used here are small, and the signature check
 * is thirty lines of `node:crypto`. An SDK would bring a dependency tree to a
 * boundary that is already narrow by design — see `ports/billing.ts`.
 *
 * Everything here is *transport*. What a subscription means, when it starts and
 * what it entitles somebody to is `domain/entitlements.ts` and is not Stripe's
 * business.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { DomainError } from '../domain/errors.ts';

const API = 'https://api.stripe.com/v1';

export const configured = (): boolean => Boolean(process.env.STRIPE_SECRET_KEY);

function key(): string {
  const value = process.env.STRIPE_SECRET_KEY;
  if (!value) {
    throw new DomainError('internal', 'STRIPE_SECRET_KEY is not set');
  }
  return value;
}

/** True while the key is a test key, which is what gates real money. */
export const live = (): boolean => key().startsWith('sk_live_');

/**
 * Stripe's form encoding: nested values are bracketed paths, not JSON.
 * `{ line_items: [{ price: 'x' }] }` → `line_items[0][price]=x`.
 */
function form(value: unknown, prefix = '', into = new URLSearchParams()): URLSearchParams {
  if (value === undefined || value === null) return into;
  if (Array.isArray(value)) {
    value.forEach((item, i) => form(item, prefix ? `${prefix}[${i}]` : String(i), into));
  } else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      form(v, prefix ? `${prefix}[${k}]` : k, into);
    }
  } else {
    into.append(prefix, String(value));
  }
  return into;
}

async function call<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${key()}`,
      'content-type': 'application/x-www-form-urlencoded',
      /* Pinned, so Stripe changing its default shape cannot change ours. */
      'stripe-version': '2024-06-20',
    },
    body: body === undefined ? undefined : form(body).toString(),
  });

  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!response.ok) {
    const error = (parsed.error ?? {}) as { message?: string; code?: string };
    /* Stripe's own message is passed through: it names the actual problem
       ("No such price", "You cannot use a test key in live mode") far better
       than anything this layer could infer from a status code. */
    throw new DomainError('internal', `stripe: ${error.message ?? response.status}`, {
      code: error.code ?? null,
      status: response.status,
    });
  }
  return parsed as T;
}

/* ══════════════════════════════════════════════════════════════ products ══ */

export interface StripePrice {
  id: string;
  product: string;
}

export const createProduct = (name: string, metadata: Record<string, string>) =>
  call<{ id: string }>('/products', { name, metadata });

export const createPrice = (input: {
  product: string;
  currency: string;
  unitAmount: number;
  intervalCount: number;
  metadata: Record<string, string>;
}) =>
  call<StripePrice>('/prices', {
    product: input.product,
    currency: input.currency.toLowerCase(),
    unit_amount: input.unitAmount,
    recurring: { interval: 'month', interval_count: input.intervalCount },
    metadata: input.metadata,
  });

/* ══════════════════════════════════════════════════════════════ checkout ══ */

export interface CheckoutSession {
  id: string;
  url: string;
}

/**
 * A Checkout Session for one price.
 *
 * **`client_reference_id` carries our subject** — the user or venue the
 * subscription is for. It comes back on `checkout.session.completed`, and it is
 * the only thing tying Stripe's world to ours; without it a completed payment
 * arrives with nobody to credit.
 *
 * **Stripe chooses the payment methods, not this file.** The obvious thing for
 * Poland is to name BLIK first — it is how the country pays online — and
 * Stripe refuses it outright: `The payment method 'blik' cannot be used in
 * 'subscription' mode`. BLIK and Przelewy24 authorise a single payment and
 * cannot be stored and charged again next month, which is what a subscription
 * is. For recurring PLN that currently leaves the card.
 *
 * So the list is not hard-coded. `automatic_payment_methods` gives Stripe the
 * mode and the currency and lets it offer everything eligible, which means the
 * day BLIK supports recurring, it appears here without a deploy. Hard-coding
 * `['card']` would be correct today and quietly wrong forever after.
 *
 * (For a *one-off* charge — a voucher, a top-up — BLIK and P24 are available
 * and should be offered. That is a different call to a different endpoint.)
 */
export const createCheckoutSession = (input: {
  priceId: string;
  clientReferenceId: string;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
  metadata?: Record<string, string>;
}) =>
  call<CheckoutSession>('/checkout/sessions', {
    mode: 'subscription',
    line_items: [{ price: input.priceId, quantity: 1 }],
    /* No `payment_method_types` at all: omitted, a Checkout Session offers
       whatever the account has enabled and the mode allows. Naming them here
       instead would both break (BLIK is not valid for subscriptions) and
       freeze the list at what was true on the day it was written. */
    client_reference_id: input.clientReferenceId,
    ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    /*
     * **The subject is stamped on the subscription, not only on the session.**
     *
     * `client_reference_id` lives on the Checkout Session and appears on
     * exactly one event. Stripe does not guarantee delivery order, and in
     * practice `invoice.paid` and `customer.subscription.created` can arrive
     * *before* `checkout.session.completed` — which is how three real events
     * landed as "no matching subscription" the first time somebody paid.
     *
     * Copying it into `subscription_data.metadata` puts it on the Stripe
     * subscription itself, so it rides along on every later event about that
     * subscription. Whichever one arrives first can then create the row.
     */
    subscription_data: {
      metadata: {
        paylez_subject: input.clientReferenceId,
        ...(input.metadata?.plan_code ? { paylez_plan_code: input.metadata.plan_code } : {}),
      },
      ...(input.trialDays && input.trialDays > 0
        ? { trial_period_days: input.trialDays }
        : {}),
    },
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });

/* ═════════════════════════════════════════════════════════════ webhooks ══ */

/** How far a webhook's timestamp may be from now. Stripe's own default. */
const TOLERANCE_SECONDS = 300;

/**
 * Verify `Stripe-Signature` against the **raw** request body.
 *
 * Two things here are load-bearing and both are easy to get wrong:
 *
 * 1. **The raw bytes, not the parsed object.** Stripe signs exactly what it
 *    sent. `JSON.stringify(parsed)` re-orders nothing today and will differ the
 *    day a key order or a number format changes, and the failure looks like a
 *    configuration problem rather than a bug. `http/server.ts` keeps the raw
 *    string on the context for this one route.
 * 2. **The timestamp is checked.** A signature stays valid forever without it,
 *    so a captured webhook could be replayed to re-grant a cancelled plan.
 *
 * Throws rather than returning false: an unverifiable webhook is not a
 * "maybe", and the caller must never get the chance to continue past it.
 */
export function verifyWebhook(rawBody: string, header: string, secret: string): void {
  const parts = new Map(
    header
      .split(',')
      .map((piece) => piece.trim().split('='))
      .filter((pair): pair is [string, string] => pair.length === 2)
      .map(([k, v]) => [k, v] as [string, string]),
  );

  const timestamp = parts.get('t');
  const signature = parts.get('v1');
  if (!timestamp || !signature) {
    throw new DomainError('forbidden', 'malformed stripe signature header');
  }

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) {
    throw new DomainError('forbidden', 'stripe webhook timestamp outside tolerance');
  }

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  const given = Buffer.from(signature, 'utf8');
  const want = Buffer.from(expected, 'utf8');
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    throw new DomainError('forbidden', 'bad stripe webhook signature');
  }
}
