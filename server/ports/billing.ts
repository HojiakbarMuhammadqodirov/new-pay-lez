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
import { CONFIG } from '../config.ts';
import * as stripe from './stripe.ts';

export type Mode = 'local' | 'live';

export const mode = (): Mode =>
  process.env.PAYLEZ_BILLING === 'live' ? 'live' : 'local';

/**
 * Where the customer comes back to after paying.
 *
 * The site's own origin, taken from the same list CORS is built from, so there
 * is one statement of "where the front end lives" rather than two that can
 * disagree. Stripe rejects a `success_url` that is not absolute, which is what
 * makes a wrong value here fail loudly at checkout rather than quietly on the
 * return trip.
 */
const siteOrigin = (): string =>
  process.env.PAYLEZ_SITE_ORIGIN ?? CONFIG.server.origins[0] ?? 'http://localhost:5173';

/**
 * The Stripe price for a plan, as written by `npm run stripe:setup`.
 *
 * Kept in `platform_config` rather than in a column on `plans`, because a price
 * id belongs to one Stripe account: the test account and the live account have
 * different ids for the same plan, and the mapping has to be able to change
 * without a migration when the account does.
 *
 * Monthly only for now. The `plan_terms` ladder (3/6/12 months at a discount)
 * exists in the database and has no way through the checkout route yet, which
 * takes a `planCode` and no term — adding it is a route change, not a Stripe
 * one, and is deliberately not smuggled in here.
 */
export const stripePriceKey = (audience: string, code: string, months = 1): string =>
  `stripe_price:${audience}:${code}:${months}`;

async function stripePriceFor(
  db: Db,
  audience: string,
  code: string,
  months = 1,
): Promise<string | null> {
  const row = await db.get<{ value: string }>(
    `SELECT value FROM platform_config WHERE key = $k`,
    { k: stripePriceKey(audience, code, months) },
  );
  return row?.value ?? null;
}

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
  /**
   * Which rung of the commitment ladder — 1, 3, 6 or 12 months.
   *
   * Defaults to monthly. The pricing cards let a visitor pick a rung and show
   * the discount it earns, so a checkout that ignored it would charge a price
   * the page did not quote.
   */
  months?: number;
  source: 'stripe' | 'apple' | 'google';
  actorId: string;
  at?: Iso;
}

export async function startCheckout(input: CheckoutInput) {
  const at = input.at ?? now();

  if (mode() === 'live') {
    if (input.source !== 'stripe') return liveRefused(`${input.source} checkout`);

    const audience = 'venueId' in input.subject ? 'partner' : 'consumer';
    const plan = await input.db.get<{ id: string; trial_days: number }>(
      `SELECT id, trial_days FROM plans WHERE audience = $a AND code = $c AND active = 1`,
      { a: audience, c: input.planCode },
    );
    if (!plan) throw new DomainError('not_found', 'no such plan', { planCode: input.planCode });

    const months = input.months && input.months > 0 ? Math.floor(input.months) : 1;
    const priceId = await stripePriceFor(input.db, audience, input.planCode, months);
    if (!priceId) {
      throw new DomainError(
        'internal',
        `no Stripe price is mapped for ${audience}/${input.planCode} at ${months} month(s) — run \`npm run stripe:setup\``,
      );
    }

    /* The address is only a convenience: it pre-fills Stripe's form. Nothing is
       identified by it — `client_reference_id` below is what says who this is,
       and it is an opaque id rather than an email for that reason. */
    const email =
      'userId' in input.subject
        ? (
            await input.db.get<{ email: string | null }>(`SELECT email FROM users WHERE id = $u`, {
              u: input.subject.userId,
            })
          )?.email ?? null
        : null;

    const subject =
      'venueId' in input.subject ? `venue:${input.subject.venueId}` : `user:${input.subject.userId}`;

    const session = await stripe.createCheckoutSession({
      priceId,
      clientReferenceId: subject,
      customerEmail: email,
      successUrl: `${siteOrigin()}/#/wallet?checkout=done`,
      cancelUrl: `${siteOrigin()}/#/wallet?checkout=cancelled`,
      trialDays: plan.trial_days,
      metadata: {
        plan_code: input.planCode,
        months: String(months),
        audience,
        actor: input.actorId,
      },
    });

    /*
     * **No subscription row is written here, and that is the whole point.**
     * A session is an intention to pay. The row is written when
     * `checkout.session.completed` arrives, because until the processor says
     * the money moved, nothing has happened — and a row written now would
     * entitle somebody who abandons the page.
     */
    return { mode: 'live' as const, url: session.url, sessionId: session.id };
  }

  const subscription = await entitlements.startSubscription(input.db, {
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

  const subscription = await entitlements.startSubscription(input.db, {
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
  /**
   * The body exactly as it arrived. Stripe signs bytes rather than meaning, so
   * the check has to run on these and not on a re-serialised `payload`.
   */
  rawPayload?: string;
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
  /* Stripe issues its own signing secret per endpoint (`whsec_…`), and it is
     not the generic one an app store would use — so it is named for its
     provider. `PAYLEZ_WEBHOOK_SECRET` remains the fallback for the others. */
  const secret =
    input.source === 'stripe'
      ? process.env.STRIPE_WEBHOOK_SECRET ?? process.env.PAYLEZ_WEBHOOK_SECRET
      : process.env.PAYLEZ_WEBHOOK_SECRET;

  if (mode() === 'live') {
    if (!secret) liveRefused('webhook verification');

    /*
     * Stripe has its own scheme and it is not the generic one below: a
     * `t=…,v1=…` header, an HMAC over `${timestamp}.${rawBody}`, and a
     * tolerance on the timestamp so a captured delivery cannot be replayed
     * later to re-grant a plan somebody cancelled.
     *
     * It runs on the raw bytes. Verifying `JSON.stringify(payload)` instead
     * would pass today and fail the first time Stripe changed a key order or a
     * number's formatting — and it would fail as "bad signature", which reads
     * as a wrong secret rather than as this mistake.
     */
    if (input.source === 'stripe') {
      if (!input.rawPayload) {
        throw new DomainError('internal', 'stripe webhooks need the raw request body');
      }
      stripe.verifyWebhook(input.rawPayload, input.signature, secret!);
    } else {
      /* TODO(live): Apple's signed JWS payload, when the app stores are wired.
         The comparison below is the shape; the canonicalisation is
         provider-specific. */
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
  }

  const eventId = String(input.payload.id ?? input.payload.event_id ?? newId('bev'));
  const type = String(input.payload.type ?? 'unknown');

  const fresh = await entitlements.recordBillingEvent(input.db, {
    source: input.source,
    eventType: type,
    externalId: eventId,
    payload: input.payload,
    at,
  });
  if (!fresh) return { applied: false, reason: 'already processed' };

  /*
   * **Stripe wraps the thing in an event.** The payload is
   * `{ id, type, data: { object } }`, so the resource — the session, the
   * invoice, the subscription — is `data.object` and never the top level. The
   * flat reads below are the local adapter's shape and are kept for it.
   */
  const object = (
    input.source === 'stripe'
      ? ((input.payload.data as Record<string, unknown> | undefined)?.object ?? {})
      : input.payload
  ) as Record<string, unknown>;

  /*
   * **The first payment is where the subscription is born.** The session was
   * created without writing anything, deliberately, so that abandoning the
   * payment page entitles nobody. This is the moment the processor says the
   * money moved, and so it is the moment the row is written.
   *
   * **Any of three events may be the first to arrive, so any of them may be
   * the one that creates the row.**
   *
   * It used to be `checkout.session.completed` alone, on the reasoning that the
   * session is where the subject lives. Stripe does not guarantee ordering, and
   * the first real payment proved it: `invoice.paid` and
   * `customer.subscription.created` both landed first and were recorded as "no
   * matching subscription". Nothing was lost that time — a later event created
   * it — but had the session event been delayed or dropped, somebody would have
   * paid and got nothing, with the events that could have said so already
   * marked processed.
   *
   * The subject now rides on the Stripe subscription's own metadata as well as
   * the session (see `subscription_data` in `ports/stripe.ts`), so whichever
   * event wins the race can identify who paid.
   */
  const CREATES = new Set([
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
  ]);

  if (input.source === 'stripe' && CREATES.has(type)) {
    const metadata = (object.metadata ?? {}) as Record<string, string>;
    /* The session carries `client_reference_id`; a subscription object carries
       the same value under its own metadata. Either identifies the subject. */
    const reference = String(object.client_reference_id ?? metadata.paylez_subject ?? '');
    const planCode = metadata.plan_code ?? metadata.paylez_plan_code ?? '';
    const externalRef = String(object.subscription ?? object.id ?? '');
    const [kind, id] = reference.split(':');

    /* Only create when there is nothing there. A second event about the same
       subscription must fall through to the status mapping below rather than
       starting the subscription again. */
    const already = externalRef
      ? await input.db.get<{ id: string }>(
          `SELECT id FROM subscriptions WHERE external_ref = $r`,
          { r: externalRef },
        )
      : undefined;

    if (!already) {
      if (!id || !planCode) {
        await input.db.run(
          `UPDATE billing_events SET processed_at = $t, error = 'event without a subject or plan'
            WHERE source = $s AND external_id = $e`,
          { t: at, s: input.source, e: eventId },
        );
        return { applied: false, reason: 'event without a subject or plan' };
      }

      /*
       * The renewal date, in order of authority. `current_period_end` is on a
       * subscription object and is Stripe's own answer, in seconds; a session
       * event does not carry it, and then the rung bought is the next best
       * thing. Both beat "thirty days", which is what a twelve-month customer
       * would otherwise get before `runRenewals` expired them.
       */
      const periodEnd = Number(object.current_period_end);
      const created = await entitlements.startSubscription(input.db, {
        subject: kind === 'venue' ? { venueId: id } : { userId: id },
        planCode,
        source: 'stripe',
        externalRef,
        months: Number(metadata.paylez_months ?? metadata.months) || 1,
        renewsAt: Number.isFinite(periodEnd) && periodEnd > 0
          ? new Date(periodEnd * 1000).toISOString()
          : undefined,
        at,
      });
      await input.db.run(
        `UPDATE billing_events SET processed_at = $t WHERE source = $s AND external_id = $e`,
        { t: at, s: input.source, e: eventId },
      );
      return { applied: true, status: created.status, subscription: created };
    }
    /* It exists already — fall through to the status mapping below, which is
       what an `updated` event is actually for. */
  }

  const ref = String(
    object.subscription ?? object.external_ref ?? (input.source === 'stripe' ? object.id : '') ?? '',
  );
  const subscription = ref
    ? await input.db.get<entitlements.Subscription>(
        `SELECT * FROM subscriptions WHERE external_ref = $r OR id = $r`,
        { r: ref },
      )
    : undefined;

  if (!subscription) {
    await input.db.run(
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
    await entitlements.setStatus(
      input.db,
      subscription.id,
      next,
      at,
      next === 'active' ? plusDays(at, 30) : undefined,
    );
  }

  await input.db.run(
    `UPDATE billing_events SET processed_at = $t WHERE source = $s AND external_id = $e`,
    { t: at, s: input.source, e: eventId },
  );
  return { applied: Boolean(next), status: next ?? null, subscriptionId: subscription.id };
}
