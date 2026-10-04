/**
 * The email boundary. One kind of message: a six-digit code.
 *
 * ## Two adapters, chosen by whether a key is present
 *
 * - **live** — `PAYLEZ_RESEND_KEY` is set. One `POST` to Resend's REST API over
 *   `fetch`, no SDK: the server is dependency-free, and the whole integration is
 *   one request with a bearer token.
 * - **local** — no key. The message is logged and kept in {@link outbox}, which
 *   is how `verify.ts` reads a code without the code ever appearing in an API
 *   response. A code in a response is a code anybody with the endpoint can read
 *   without having the inbox, which defeats the whole mechanism.
 *
 * The mode is read at call time rather than at import, so a test can switch it
 * and a deployment that gains a key on restart needs nothing else.
 *
 * ## Why this came back differently
 *
 * The first version (removed in `53edbf7`) had no transport at all, so on a
 * live server the code went to the log and nowhere a customer could read it.
 * That is why `domain/verification.ts` gates **nothing** unless this file is in
 * live mode: the gate and the transport arrive together or not at all.
 *
 * ## Plain text, no HTML
 *
 * Six digits do not need a template, a layout or an inliner. `subject` and
 * `body` come from the caller in the reader's language; this file only sends.
 */
import { DomainError } from '../domain/errors.ts';

export const mode = (): 'local' | 'live' => (process.env.PAYLEZ_RESEND_KEY ? 'live' : 'local');

/**
 * The sender. It must be an address on a domain verified in Resend (SPF and
 * DKIM records for `pay-lez.com`), or Resend refuses the message with a 403.
 */
export const from = (): string => process.env.PAYLEZ_MAIL_FROM || 'Paylez <no-reply@pay-lez.com>';

export interface Message {
  to: string;
  subject: string;
  body: string;
}

export interface Sent {
  /** `local` means it was logged, not delivered. */
  via: 'local' | 'live';
  to: string;
}

/**
 * What the local adapter produced, newest last. Bounded so a long-running dev
 * server does not grow it forever. Read by `verify.ts`; nothing in a route
 * reads it.
 */
export const outbox: Message[] = [];

/** The newest local message to an address, for tests. */
export const lastTo = (to: string): Message | undefined =>
  [...outbox].reverse().find((m) => m.to.toLowerCase() === to.toLowerCase());

/**
 * Send one message.
 *
 * Throws when the live transport refuses, so the caller can say so. The code
 * row is written before this is called, so a failed send still spent its
 * cooldown: a failing transport cannot be retried without limit.
 */
export async function send(message: Message): Promise<Sent> {
  const key = process.env.PAYLEZ_RESEND_KEY;
  if (key) {
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: from(), to: [message.to], subject: message.subject, text: message.body }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      console.warn(`email: transport unreachable: ${(error as Error).message}`);
      throw new DomainError('internal', 'the email could not be sent — try again in a minute');
    }
    if (!response.ok) {
      /* The provider's body names the cause (an unverified domain, a bad key),
         and it belongs in the log, not in a response to the person asking. */
      console.warn(`email: provider refused (${response.status}): ${(await response.text()).slice(0, 300)}`);
      throw new DomainError('internal', 'the email could not be sent — try again in a minute');
    }
    return { via: 'live', to: message.to };
  }

  outbox.push(message);
  if (outbox.length > 200) outbox.splice(0, outbox.length - 200);
  if (process.env.PAYLEZ_QUIET !== '1') {
    /* The whole body, so a developer can complete a sign-up locally. */
    console.log(`email(local) → ${message.to}: ${message.subject} — ${message.body}`);
  }
  return { via: 'local', to: message.to };
}
