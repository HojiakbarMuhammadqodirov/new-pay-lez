/**
 * Proving that somebody has the address they signed up with.
 *
 * ## What this changes about a rule this server used to state
 *
 * `users` said plainly: **"Nothing here is verified."** That was written when
 * `phone_verified` was dropped, and the argument was good — nothing gated on a
 * phone number, and a reward for clicking a link pays for a formality rather
 * than for anything a venue or a player gets.
 *
 * It does not extend to the **address**, and the difference is that the address
 * is the *credential*. It is what `signIn` looks up and what a password reset
 * would go to. An unproved address is therefore an account somebody may not
 * own — with points in it, a wallet, and a place on a public board — and the
 * person who does own the address cannot sign up with it at all, because it is
 * taken.
 *
 * ## No allow-list, no exceptions, and one real exception
 *
 * Every address is asked, whatever its domain: no list of "trusted" providers,
 * no skip for a corporate domain, no skip for the first account. A list of
 * providers that do not need proving is a list somebody adds their own domain
 * to.
 *
 * The one account that is stamped without a code is a **Google** sign-in, and
 * it is not an exception to the rule so much as the rule already satisfied:
 * `crypto/google.ts` refuses an identity whose `email_verified` claim is false,
 * so the address arrives proved by the provider that issues it. Sending a code
 * to it would be asking somebody to prove something we have just been given
 * cryptographic evidence of.
 *
 * ## What being unverified costs, and what it deliberately does not
 *
 * Three things, and they are the three the account cannot be allowed to have
 * without the address behind it:
 *
 * - **Earning.** A finished round banks nothing — the same shape a practice
 *   round already has (`paid: false`), with `unpaidReason` saying which. The
 *   round is still *played*, because taking the game away teaches nothing about
 *   an email.
 * - **Redeeming.** A voucher and a gift card are value leaving the platform.
 * - **The board.** A public list of names is the one surface where an
 *   unverified account is visible to other people.
 *
 * And three things it must not cost:
 *
 * - **Signing in.** Locking somebody out of an account they made two minutes
 *   ago because a code went to spam is worse than anything being prevented.
 * - **A scan at a till.** `gate.confirm` is a venue serving a customer who is
 *   standing in front of them, and refusing it punishes the venue for our
 *   formality. The venue has verified that person in the strongest way
 *   available.
 * - **Anything an existing account already has.** Every account that predates
 *   this file is unverified, by definition, and a migration that stamped them
 *   verified would assert something nobody checked while one that locked them
 *   out would take the points off people who have been earning for months. So
 *   the gates read `email` too: an account with **no address at all** — a
 *   provisional one — is not held to a rule about an address it does not have.
 */
import { createHmac, randomInt } from 'node:crypto';
import { CONFIG } from '../config.ts';
import type { Db } from '../db/db.ts';
import * as email from '../ports/email.ts';
import { DomainError } from './errors.ts';
import { newId } from './ids.ts';
import { minutesBetween, now, plusMinutes, type Iso } from './time.ts';

/**
 * A code, as it is stored.
 *
 * HMAC-SHA256 with a fixed label, the same construction `hashToken` uses for a
 * session token and for the same reason — except that this input is *not* high
 * entropy, so the reasoning has to be different and is worth stating: six
 * digits is a million possibilities, which a hash of any cost does not protect.
 * What protects it is `codeAttempts` (five per code) and `codeMinutes` (ten),
 * and the hash is here so that whoever reads the database cannot read live
 * codes — not as a work factor. A per-code scrypt would be 100ms of CPU at
 * every sign-up buying nothing the cap does not already buy.
 */
const hash = (code: string): string =>
  createHmac('sha256', 'paylez-email-verification').update(code).digest('hex');

/**
 * A fresh code.
 *
 * `randomInt` rather than `Math.random`: this is a credential, and the one in
 * `ids.ts` is the same choice for the same reason. Padded, because a code with
 * a leading zero has to be six characters on the screen and in the comparison
 * or `000123` and `123` are the same secret.
 */
const newCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');

interface Row {
  id: string;
  user_id: string;
  email_norm: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  sent_at: string;
  sends: number;
}

export interface Issued {
  /** Whether a message was produced. False when the cooldown refused. */
  sent: boolean;
  /** When another send is allowed. */
  nextSendAt: Iso;
  expiresAt: Iso;
  /** How many have gone to this account, including this one. */
  sends: number;
  /**
   * The code — **only** on the local email adapter.
   *
   * Never populated when mail is really being sent: a code in an API response
   * is a code an attacker with the sign-up endpoint can read without having the
   * address, which defeats the whole mechanism. It is here because the local
   * adapter delivers nowhere, and a development sign-up that cannot be
   * completed is a feature nobody will touch. `ports/email.ts` says the same.
   */
  code?: string;
}

/**
 * Whether this account has proved its address — or has no address to prove.
 *
 * The second half is the one to keep. A **provisional** account (§1.1) has no
 * email at all, and holding it to a rule about an address it does not have
 * would make the play-first identity unable to play. Same for any account the
 * import brought over without one.
 */
export async function verified(db: Db, userId: string): Promise<boolean> {
  const row = await db.get<{ email: string | null; email_verified_at: string | null }>(
    `SELECT email, email_verified_at FROM users WHERE id = $u`,
    { u: userId },
  );
  if (!row) return false;
  if (!row.email) return true;
  return row.email_verified_at !== null;
}

/**
 * Refuse unless the address is proved.
 *
 * `not_verified` (403), which is the code this server already uses for "the
 * thing you are asking about has not cleared its gate" — a venue that is not
 * verified cannot publish a deal, and this is the same shape one table over.
 * The message names the remedy, because a 403 that does not is a dead end.
 */
export async function assertVerified(db: Db, userId: string): Promise<void> {
  if (await verified(db, userId)) return;
  throw new DomainError('not_verified', 'confirm your email address first', {
    remedy: 'POST /v1/auth/verify/send',
  });
}

/**
 * Send a code, or say why not.
 *
 * Three brakes, in the order they bind, and each answers a different abuse:
 *
 * - **The cooldown** (`codeCooldownSeconds`) bounds somebody leaning on the
 *   resend button. It is short, because the honest case for pressing resend is
 *   that the first one has not arrived and a two-minute wait on top of that is
 *   the whole of somebody's patience.
 * - **The send ceiling** (`codeSendsPerAddress`) bounds using this endpoint as
 *   a way to post mail to an address that is not yours. It is per account and
 *   it does not reset, which is deliberate: an account that has burned ten
 *   codes has a problem a eleventh will not fix.
 * - **The route's own rate limit** bounds the requests. See `CONFIG.limits`.
 *
 * The row is written **before** the send, so a message that fails to leave
 * still consumed its cooldown — the alternative is a failing transport that can
 * be retried without limit.
 */
export async function issue(
  db: Db,
  input: { userId: string; language?: string; at?: Iso; force?: boolean },
): Promise<Issued> {
  const at = input.at ?? now();

  const user = await db.get<{ email: string | null; email_norm: string | null; display_name: string; language: string; email_verified_at: string | null }>(
    `SELECT email, email_norm, display_name, language, email_verified_at FROM users WHERE id = $u`,
    { u: input.userId },
  );
  if (!user) throw new DomainError('not_found', 'no such account');
  if (!user.email || !user.email_norm) {
    throw new DomainError('validation_failed', 'this account has no email address', { field: 'email' });
  }
  if (user.email_verified_at) {
    throw new DomainError('conflict', 'that address is already confirmed');
  }

  const existing = await db.get<Row>(`SELECT * FROM email_verifications WHERE user_id = $u`, {
    u: input.userId,
  });

  if (existing && !input.force) {
    const waited = minutesBetween(existing.sent_at, at) * 60;
    if (waited < CONFIG.auth.codeCooldownSeconds) {
      /* Refused, and it says when — not an error, because asking again too
         soon is what an honest person does when a message is slow. */
      return {
        sent: false,
        nextSendAt: plusMinutes(existing.sent_at, CONFIG.auth.codeCooldownSeconds / 60),
        expiresAt: existing.expires_at,
        sends: existing.sends,
      };
    }
    if (existing.sends >= CONFIG.auth.codeSendsPerAddress) {
      throw new DomainError('quota_exceeded', 'too many codes have been sent for this account', {
        sends: existing.sends,
      });
    }
  }

  const code = newCode();
  const expiresAt = plusMinutes(at, CONFIG.auth.codeMinutes);
  const sends = (existing?.sends ?? 0) + 1;

  await db.run(
    `INSERT INTO email_verifications (id, user_id, email_norm, code_hash, expires_at, attempts, sent_at, sends)
     VALUES ($i, $u, $e, $h, $x, 0, $t, $s)
       ON CONFLICT (user_id) DO UPDATE SET
         email_norm = excluded.email_norm,
         code_hash = excluded.code_hash,
         expires_at = excluded.expires_at,
         -- Reset, because the cap is per code: a new code has its own five
         -- answers. What is not reset is the send count, which is what bounds
         -- the resend button. (A backtick in here would end the template
         -- literal -- the trap the shaders in src/ carry the same warning for.)
         attempts = 0,
         sent_at = excluded.sent_at,
         sends = excluded.sends`,
    {
      i: existing?.id ?? newId('otp'),
      u: input.userId,
      e: user.email_norm,
      h: hash(code),
      x: expiresAt,
      t: at,
      s: sends,
    },
  );

  const copy = messageFor(input.language ?? user.language, code, user.display_name);
  await email.send({ to: user.email, subject: copy.subject, body: copy.body });

  return {
    sent: true,
    nextSendAt: plusMinutes(at, CONFIG.auth.codeCooldownSeconds / 60),
    expiresAt,
    sends,
    /* Local adapter only — see `Issued.code`. */
    code: email.mode() === 'local' ? code : undefined,
  };
}

export interface Confirmed {
  verified: boolean;
  /** True only for the call that actually proved it. */
  granted: boolean;
}

/**
 * Confirm a code.
 *
 * Four ways to fail and they are four different facts, because a client that
 * cannot tell them apart can only say "that did not work":
 *
 * - **`not_found`** — nothing was ever sent, so there is nothing to confirm.
 * - **`expired`** — the code was right ten minutes ago.
 * - **`cap_reached`** — five wrong answers. The code is dead; ask for another.
 * - **`validation_failed`** — wrong code, with how many tries are left.
 *
 * Idempotent on success, the same shape `completeOnboarding` uses: a second
 * confirm of an already-verified account is `granted: false` rather than an
 * error, so a retried request and a second device both cost nothing.
 */
export async function confirm(
  db: Db,
  input: { userId: string; code: string; at?: Iso },
): Promise<Confirmed> {
  const at = input.at ?? now();

  const user = await db.get<{ email_verified_at: string | null }>(
    `SELECT email_verified_at FROM users WHERE id = $u`,
    { u: input.userId },
  );
  if (!user) throw new DomainError('not_found', 'no such account');
  if (user.email_verified_at) return { verified: true, granted: false };

  const row = await db.get<Row>(`SELECT * FROM email_verifications WHERE user_id = $u`, {
    u: input.userId,
  });
  if (!row) throw new DomainError('not_found', 'no code has been sent');

  if (row.attempts >= CONFIG.auth.codeAttempts) {
    throw new DomainError('cap_reached', 'that code has had too many attempts — ask for a new one');
  }
  if (Date.parse(row.expires_at) <= Date.parse(at)) {
    throw new DomainError('expired', 'that code has expired — ask for a new one');
  }

  /* The comparison, on the hash. Trimmed and de-spaced because a code pasted
     out of an email arrives with whitespace around it and often with the
     spaces some clients insert into a six-digit run. */
  const given = input.code.replace(/[\s-]/g, '');
  if (hash(given) !== row.code_hash) {
    await db.run(`UPDATE email_verifications SET attempts = attempts + 1 WHERE user_id = $u`, {
      u: input.userId,
    });
    throw new DomainError('validation_failed', 'that code is not right', {
      field: 'code',
      attemptsLeft: Math.max(0, CONFIG.auth.codeAttempts - (row.attempts + 1)),
    });
  }

  /*
   * Claimed with a guarded `UPDATE`, the same construction `onboarded_at` and
   * `profile_completed_at` use: two confirms arriving together race for one row
   * and only one of them is the grant. `email_norm = $e` is the other half —
   * the code proves the address it was **sent to**, so an account that changed
   * its address between the send and the confirm has not proved the new one.
   */
  const claimed = await db.run(
    `UPDATE users SET email_verified_at = $t, updated_at = $t
      WHERE id = $u AND email_verified_at IS NULL AND email_norm = $e`,
    { t: at, u: input.userId, e: row.email_norm },
  );

  if (claimed.changes === 0) {
    /* The address moved under the code. Not an error about the code — it was
       right — so it says what actually happened. */
    const fresh = await db.get<{ email_verified_at: string | null }>(
      `SELECT email_verified_at FROM users WHERE id = $u`,
      { u: input.userId },
    );
    if (fresh?.email_verified_at) return { verified: true, granted: false };
    throw new DomainError('conflict', 'that code was sent to a different address');
  }

  /* The code is spent. Deleted rather than stamped consumed: it has done its
     one job, and a table of used credentials is a table with no reader. */
  await db.run(`DELETE FROM email_verifications WHERE user_id = $u`, { u: input.userId });

  return { verified: true, granted: true };
}

/**
 * The message, in the reader's language.
 *
 * Here rather than in `i18n/` because there is no `i18n/` on this side: the
 * five dictionaries are the front end's, and this text is composed by a server
 * that may be sending to somebody who is not looking at a browser. Five short
 * strings kept beside the one thing that sends them is the smaller of the two
 * evils; a sixth language starts an argument this file should lose.
 *
 * English is the fallback, which is the same rule `copyOf` in
 * `routes/guidance.ts` applies to every other translated thing here.
 */
function messageFor(language: string, code: string, name: string): { subject: string; body: string } {
  const who = name.trim() ? `${name.trim()}, ` : '';
  switch (language) {
    case 'pl':
      return {
        subject: `Twój kod Paylez: ${code}`,
        body: `${who}Twój kod potwierdzający to ${code}. Wygasa po ${CONFIG.auth.codeMinutes} minutach. Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.`,
      };
    case 'uz':
      return {
        subject: `Paylez kodingiz: ${code}`,
        body: `${who}Tasdiqlash kodingiz — ${code}. U ${CONFIG.auth.codeMinutes} daqiqadan keyin eskiradi. Agar hisob ochmagan bo‘lsangiz, bu xatni e’tiborsiz qoldiring.`,
      };
    case 'ru':
      return {
        subject: `Ваш код Paylez: ${code}`,
        body: `${who}Ваш код подтверждения — ${code}. Он действует ${CONFIG.auth.codeMinutes} минут. Если вы не регистрировались, просто проигнорируйте это письмо.`,
      };
    case 'uk':
      return {
        subject: `Ваш код Paylez: ${code}`,
        body: `${who}Ваш код підтвердження — ${code}. Він діє ${CONFIG.auth.codeMinutes} хвилин. Якщо ви не реєструвалися, просто проігноруйте цей лист.`,
      };
    default:
      return {
        subject: `Your Paylez code: ${code}`,
        body: `${who}your confirmation code is ${code}. It expires in ${CONFIG.auth.codeMinutes} minutes. If you did not create an account, you can ignore this message.`,
      };
  }
}

/**
 * Drop codes nobody is going to use.
 *
 * Called by the daily job. An expired code is already refused, so this is about
 * the table rather than about correctness — but the rows carry an address, and
 * rows nobody deletes are rows that eventually have to be explained. The same
 * argument `traffic.prune` makes.
 *
 * A day's grace past expiry, so a support conversation about "I entered the
 * code and it said expired" still has the row in it.
 */
export async function prune(db: Db, at: Iso = now()): Promise<number> {
  const result = await db.run(`DELETE FROM email_verifications WHERE expires_at < $cut`, {
    cut: plusMinutes(at, -1440),
  });
  return result.changes;
}
