/**
 * The email boundary — one message, and it is the verification code.
 *
 * ## What is real here and what is an adapter
 *
 * Everything that *decides* anything about verification is real and lives in
 * `domain/verification.ts`: the code, its hash, its expiry, the attempt cap,
 * the resend cooldown and the send ceiling. This file is the last hop, which
 * needs an SMTP credential or a provider key this repository does not have.
 *
 * The local adapter **logs the code** and records that a message was produced.
 * That is what makes the whole flow — sign up, receive, confirm, be refused
 * after five wrong answers, be refused again inside the cooldown — exercisable
 * end to end with no credentials, which is the same trade `ports/push.ts`
 * makes. It is also why the code is logged at all: a developer who cannot read
 * the code cannot sign up, and a sign-up nobody can complete locally is a
 * feature nobody will touch.
 *
 * **The local adapter is a development tool and it says so at boot.** A
 * deployment that leaves `PAYLEZ_EMAIL` unset gets codes in its log and
 * nowhere else, which means every real customer is stuck — so `live` is the
 * setting a deployment must choose, and choosing it without a transport refuses
 * to run rather than silently logging. That is the `PAYLEZ_BILLING` rule, for
 * the same reason: a boundary that fails open is a boundary nobody notices has
 * failed.
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
 * from the Contact page lands in a table and the console reads it, and "if mail
 * delivery is wanted later it belongs beside this, reading the same table".
 * That is still true and this is not a change of mind — a contact message has a
 * reader (the operator, in a console) and this has none: a verification code
 * nobody receives verifies nothing. One is a record, the other is a message.
 */
import { DomainError } from '../domain/errors.ts';

export const mode = (): 'local' | 'live' =>
  process.env.PAYLEZ_EMAIL === 'live' ? 'live' : 'local';

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
 * Throws on a live mode with no transport, and **not** on a local one: the
 * caller's own error handling is about the code, not about the post, and a
 * local adapter that threw would make every sign-up in development fail.
 */
export async function send(message: Message): Promise<Sent> {
  if (mode() === 'live') {
    /*
     * TODO(live): one POST to a transactional provider, or an SMTP submission.
     * Two things to get right when it lands, neither of which is the transport:
     *
     *  - **The failure has to reach the caller**, because
     *    `verification.issue` writes the code row *before* this is called and a
     *    send that silently failed leaves somebody waiting for a message that
     *    is not coming. It returns the outcome rather than swallowing it for
     *    exactly that reason.
     *  - **A bounce is a fact about the address** and belongs on the account —
     *    a hard bounce means the address does not exist, which is a stronger
     *    statement than "not verified yet" and should not read as one.
     */
    throw new DomainError('internal', 'live email needs an SMTP or provider credential');
  }

  /* The code, where a developer can read it. Deliberately the whole body: a
     log line that said "code sent" would make local sign-up impossible, which
     is the thing this adapter exists to keep working. */
  if (process.env.PAYLEZ_QUIET !== '1') {
    console.log(`email(local) → ${message.to}: ${message.subject} — ${message.body}`);
  }
  return { via: 'local', to: message.to };
}
