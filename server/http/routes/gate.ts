/**
 * The amount-capture gate's endpoints — §3.
 *
 * Five routes for four steps, and the shape of them is the security model:
 *
 *   * `POST /qr` is **partner-side**. The venue's screen asks for a code; the
 *     customer's phone never mints one.
 *   * `POST /scan` and `/tap` are **customer-side** and open a PENDING
 *     transaction. Both are idempotent — a retry after a dropped response must
 *     return the same pending transaction, not burn a second QR.
 *   * `POST /:id/amount` is whoever the venue's configuration says (§3.4).
 *   * `POST /:id/confirm` is **partner-side only**, and is the moment anything
 *     is granted.
 *
 * Nothing here computes a reward. The handlers read input, call one domain
 * function and return what it produced — every decision lives in `domain/gate.ts`
 * so that "the client never decides points, discounts, or eligibility" is a
 * property of the architecture rather than of the discipline of each route.
 */
import { CONFIG } from '../../config.ts';
import * as audit from '../../domain/audit.ts';
import * as fraud from '../../domain/fraud.ts';
import * as gate from '../../domain/gate.ts';
import { DomainError } from '../../domain/errors.ts';
import { actor, int, oneOf, optStr, str } from '../input.ts';
import type { Route } from '../router.ts';

/** The NFC master key, from the environment. See `crypto/nfc.ts`. */
function masterKey(): Buffer {
  const hex = process.env.PAYLEZ_NFC_KEY;
  if (!hex) {
    throw new DomainError('invalid_trigger', 'NFC is not configured on this server', {
      hint: 'set PAYLEZ_NFC_KEY to a 16-byte hex key',
    });
  }
  return Buffer.from(hex, 'hex');
}

export const gateRoutes: Route[] = [
  {
    /* §3.2. TTL 60–120s, single use. The venue's own screen calls this on a
       timer; the response carries the expiry so the screen knows when to ask
       again rather than guessing. */
    method: 'POST',
    pattern: '/v1/venues/:id/qr',
    auth: 'partner',
    handler: async (ctx) => {
      await gate.requireStaff(ctx.db, ctx.params.id, actor(ctx).user.id);
      return await gate.mintQr(ctx.db, ctx.params.id, ctx.secret, ctx.at);
    },
  },
  {
    method: 'POST',
    pattern: '/v1/gate/scan',
    auth: 'user',
    idempotent: true,
    handler: async (ctx) =>
      await gate.openTransaction(
        ctx.db,
        { kind: 'qr', token: str(ctx.body, 'token'), secret: ctx.secret },
        {
          userId: actor(ctx).user.id,
          intent: oneOf(ctx.body, 'intent', ['earn', 'voucher_redeem', 'reward_redeem'] as const, 'earn'),
          intentRef: optStr(ctx.body, 'intentRef'),
          dealId: optStr(ctx.body, 'dealId'),
          clientTs: optStr(ctx.body, 'clientTs'),
          at: ctx.at,
        },
      ),
  },
  {
    /* §3.3. The two parameters the tag's own URL carries. */
    method: 'POST',
    pattern: '/v1/gate/tap',
    auth: 'user',
    idempotent: true,
    handler: async (ctx) =>
      await gate.openTransaction(
        ctx.db,
        {
          kind: 'nfc',
          piccHex: str(ctx.body, 'picc'),
          cmacHex: str(ctx.body, 'cmac'),
          masterKey: masterKey(),
        },
        {
          userId: actor(ctx).user.id,
          intent: oneOf(ctx.body, 'intent', ['earn', 'voucher_redeem', 'reward_redeem'] as const, 'earn'),
          intentRef: optStr(ctx.body, 'intentRef'),
          dealId: optStr(ctx.body, 'dealId'),
          clientTs: optStr(ctx.body, 'clientTs'),
          at: ctx.at,
        },
      ),
  },
  {
    /* The counter tool's fallback: a customer whose phone is flat still earns,
       opened by staff against the customer's own account. */
    method: 'POST',
    pattern: '/v1/gate/manual',
    auth: 'partner',
    idempotent: true,
    handler: async (ctx) => {
      const { user } = actor(ctx);
      return await gate.openTransaction(
        ctx.db,
        { kind: 'manual', venueId: str(ctx.body, 'venueId'), byUserId: user.id },
        {
          userId: str(ctx.body, 'userId'),
          intent: oneOf(ctx.body, 'intent', ['earn', 'voucher_redeem', 'reward_redeem'] as const, 'earn'),
          intentRef: optStr(ctx.body, 'intentRef'),
          at: ctx.at,
        },
      );
    },
  },
  {
    method: 'GET',
    pattern: '/v1/gate/transactions/:id',
    auth: 'user',
    handler: async (ctx) => {
      const txn = await gate.getTransaction(ctx.db, ctx.params.id);
      const { user, roles } = actor(ctx);
      /* Either party to the transaction may look at it, and nobody else. */
      if (txn.user_id !== user.id && !roles.includes('admin')) {
        await gate.requireStaff(ctx.db, txn.venue_id, user.id);
      }
      return txn;
    },
  },
  {
    method: 'POST',
    pattern: '/v1/gate/transactions/:id/amount',
    auth: 'user',
    handler: async (ctx) =>
      await gate.submitAmount(ctx.db, {
        transactionId: ctx.params.id,
        /* Minor units. A client sending 42.50 is refused by `int`, not
           silently rounded — see `http/input.ts`. */
        amountMinor: int(ctx.body, 'amountMinor', { min: 1 }),
        actorId: actor(ctx).user.id,
        at: ctx.at,
      }),
  },
  {
    method: 'POST',
    pattern: '/v1/gate/transactions/:id/confirm',
    auth: 'partner',
    idempotent: true,
    handler: async (ctx) => {
      const { user } = actor(ctx);
      const receipt = await gate.confirm(ctx.db, {
        transactionId: ctx.params.id,
        cashierId: user.id,
        at: ctx.at,
      });
      await audit.record(ctx.db, {
        actorId: user.id,
        actorRole: 'partner_owner',
        action: 'gate.confirm',
        entity: 'transaction',
        entityId: receipt.transaction.id,
        venueId: receipt.transaction.venue_id,
        after: {
          amountMinor: receipt.transaction.amount_minor,
          points: receipt.pointsGranted,
          discountMinor: receipt.discountMinor,
        },
        ip: ctx.ip,
        at: ctx.at,
      });
      return receipt;
    },
  },
  {
    method: 'POST',
    pattern: '/v1/gate/transactions/:id/cancel',
    auth: 'user',
    handler: async (ctx) =>
      await gate.cancel(ctx.db, {
        transactionId: ctx.params.id,
        reason: optStr(ctx.body, 'reason') ?? 'cancelled',
        actorId: actor(ctx).user.id,
        at: ctx.at,
      }),
  },
  {
    /* The partner app's confirmation queue (§11.1). */
    method: 'GET',
    pattern: '/v1/venues/:id/pending',
    auth: 'partner',
    handler: async (ctx) => {
      await gate.requireStaff(ctx.db, ctx.params.id, actor(ctx).user.id);
      return await gate.pendingAt(ctx.db, ctx.params.id);
    },
  },
  {
    /* §13's dispute window: a partner flags, an admin adjudicates (C3). */
    method: 'POST',
    pattern: '/v1/gate/transactions/:id/dispute',
    auth: 'partner',
    handler: async (ctx) => {
      const txn = await gate.getTransaction(ctx.db, ctx.params.id);
      await gate.requireStaff(ctx.db, txn.venue_id, actor(ctx).user.id);
      const result = await fraud.dispute(ctx.db, ctx.params.id, str(ctx.body, 'note', { max: 500 }), ctx.at);
      if (!result.ok) {
        throw new DomainError(
          result.reason === 'expired' ? 'expired' : 'invalid_state',
          result.reason === 'expired'
            ? `the ${CONFIG.fraud.disputeWindowHours}-hour dispute window has closed`
            : 'only a committed transaction can be disputed',
        );
      }
      return { ok: true };
    },
  },
];
