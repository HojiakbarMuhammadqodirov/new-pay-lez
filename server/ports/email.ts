/**
 * The email boundary — one message, and it is the verification code.
 *
 * ## What is real here and what is an adapter
 *
 * Everything that *decides* anything about verification is real and lives in
 * `domain/verification.ts`: the code, its hash, its expiry, the attempt cap,
 * the resend cooldown and the send ceiling. This file is the last hop.
 *
 * Two adapters, chosen by `PAYLEZ_EMAIL`:
 *
 * - **`live`** posts to Resend (`RESEND_API_KEY`), from `PAYLEZ_EMAIL_FROM`
 *   (default `Paylez <no-reply@pay-lez.com>`, which needs the `pay-lez.com`
 *   domain verified in the Resend account — an unverified sender domain is
 *   refused by Resend, not by us).
 * - **`local`** (the default) **logs the code** and delivers nowhere. That is
 *   what makes the whole flow — sign up, receive, confirm, be refused after
 *   five wrong answers, be refused again inside the cooldown — exercisable end
 *   to end with no credentials, which is the same trade `ports/push.ts` makes.
 *
 * **The local adapter is a development tool and the boot says so.** A
 * deployment that leaves `PAYLEZ_EMAIL` unset gets codes in its log and nowhere
 * else, so `main.ts` warns about it; and `live` without a key refuses to start
 * rather than silently logging. That is the `PAYLEZ_BILLING` rule, for the same
 * reason: a boundary that fails open is a boundary nobody notices has failed.
 *
 * ## Why Resend, and why over `fetch`
 *
 * One HTTPS POST with a bearer key — no SMTP session, no MIME assembly — and it
 * is called by hand for the reason `ports/stripe.ts` and `ports/llm.ts` are:
 * this server has one runtime dependency and an email SDK would be the second,
 * for a boundary that is a single request.
 *
 * ## Why there is no template engine and no HTML
 *
 * A six-digit code in a plain-text body. HTML mail would need a template, a
 * layout, an inliner and a second copy of every string in five languages — and
 * the thing being delivered is six digits. `subject` and `body` come from the
 * caller so the language is the reader's; this file only sends.
 *
 * ## `contact_messages` is not this
 *
 * `domain/contact.ts` is emphatic that it does **not** send email: a message
 * from the Contact page lands in a table and the console reads it. That is
 * still true and this is not a change of mind — a contact message has a reader
 * (the operator, in a console) and this has none: a verification code nobody
 * receives verifies nothing. One is a record, the other is a message.
 */
import { DomainError } from '../domain/errors.ts';

const RESEND_URL = 'https://api.resend.com/emails';

/** Long enough for a slow provider, short enough that a sign-up is not held. */
const TIMEOUT_MS = 10_000;

export const mode = (): 'local' | 'live' =>
  process.env.PAYLEZ_EMAIL === 'live' ? 'live' : 'local';

/** Whether `live` has what it needs. Read by the boot, which refuses without it. */
export const configured = (): boolean => Boolean(process.env.RESEND_API_KEY);

export const sender = (): string =>
  process.env.PAYLEZ_EMAIL_FROM?.trim() || 'Paylez <no-reply@pay-lez.com>';

export interface Message {
  to: string;
  subject: string;
  /** Plain text. See the note above on why there is no HTML. */
  body: string;
}

export interface Sent {
  /** `local` means it was logged, not delivered. */
  via: 'local' | 'live';
  to: string;
}

/**
 * Send one message.
 *
 * **A live failure throws, and has to.** `verification.issue` writes the code
 * row *before* this is called, so a send that silently failed would leave
 * somebody waiting for a message that is not coming. The caller decides what a
 * failure means: sign-up survives it (the account is real either way), the
 * resend button reports it.
 *
 * The local adapter does **not** throw: a local adapter that did would make
 * every sign-up in development fail.
 */
export async function send(message: Message): Promise<Sent> {
  if (mode() === 'live') {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new DomainError('internal', 'PAYLEZ_EMAIL=live needs RESEND_API_KEY');

    let response: Response;
    try {
      response = await fetch(RESEND_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: sender(),
          to: [message.to],
          subject: message.subject,
          text: message.body,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new DomainError('internal', `email provider unreachable: ${(error as Error).message}`);
    }

    if (!response.ok) {
      /* Resend answers `{ name, message }`. The message is logged rather than
         returned: it can name the sender domain and the account's own limits,
         which are ours to read and nobody else's. The address is not logged —
         it is personal data and the status says enough to debug from. */
      const detail = await response.text().catch(() => '');
      console.warn(`email(live) refused: ${response.status} ${detail.slice(0, 300)}`);
      throw new DomainError('internal', `email provider refused the message (${response.status})`);
    }
    return { via: 'live', to: message.to };
  }

  /* The code, where a developer can read it. Deliberately the whole body: a
     log line that said "code sent" would make local sign-up impossible, which
     is the thing this adapter exists to keep working. */
  if (process.env.PAYLEZ_QUIET !== '1') {
    console.log(`email(local) → ${message.to}: ${message.subject} — ${message.body}`);
  }
  return { via: 'local', to: message.to };
}
