/**
 * Proving that somebody has the address they signed up with, and resetting a
 * forgotten password with the same proof.
 *
 * ## The history, because it decides the shape
 *
 * A full version of this existed (`cc3d9d0`) and was removed (`53edbf7`) for two
 * reasons, both recorded in `server/README.md`: there was **no transport**, so on
 * a live server the code went to the log and nowhere a customer could read it,
 * and the gate was **far too wide** (an unconfirmed account could not earn, check
 * in, claim the welcome gift or appear on the board), so the first restart would
 * have taken all of that from every live account at once. The README asks for
 * three things on the way back, and this file does all three:
 *
 * 1. **A transport first.** `ports/email.ts` sends through Resend when
 *    `PAYLEZ_RESEND_KEY` is set. Without a key nothing is gated at all
 *    (see {@link gateOn}), so a deployment cannot gate on a code nobody receives.
 * 2. **A banner, not a gate, and if a gate then on spending only.** Earning,
 *    checking in, playing, onboarding and the board are untouched. The only
 *    refusals are the two places points leave the platform as value: buying a
 *    voucher and redeeming a gift card.
 * 3. **Existing accounts are not asked.** An account created before
 *    `CONFIG.auth.verifySince` is never gated. It may still confirm, and the app
 *    offers it, but nothing it has done for months starts failing.
 *
 * ## Who is never gated
 *
 * - An account with **no address** (a guest / provisional account): it cannot
 *   be held to a rule about an address it does not have.
 * - A **Google** account: `crypto/google.ts` refuses an identity whose
 *   `email_verified` claim is false, so the address arrives proved and
 *   `linkGoogleAccount` stamps it.
 * - Anything at a **till**: `gate.confirm` is a venue serving somebody standing
 *   in front of them, and refusing it would punish the venue for our formality.
 *
 * ## One code per account, two uses
 *
 * `email_verifications` holds one live code per user (`UNIQUE (user_id)`), and
 * the code proves one thing: whoever holds it can read that inbox. So the same
 * row serves both the sign-up confirmation and the password reset — a reset
 * also stamps the address as proved, because it just was. Two live codes would
 * double the chance of a blind guess for no benefit.
 */
import { createHmac, randomInt } from 'node:crypto';
import { CONFIG } from '../config.ts';
import type { Db } from '../db/db.ts';
import * as email from '../ports/email.ts';
import { resetPassword } from './accounts.ts';
import { DomainError } from './errors.ts';
import { newId } from './ids.ts';
import { minutesBetween, now, plusMinutes, type Iso } from './time.ts';

/**
 * A code, as stored. HMAC with a fixed label, so whoever reads the database
 * cannot read live codes. It is not a work factor: six digits is a million
 * possibilities, and what protects them is the attempt cap and the expiry.
 */
const hash = (code: string): string =>
  createHmac('sha256', 'paylez-email-verification').update(code).digest('hex');

/** `randomInt`, because this is a credential. Padded so `000123` stays six. */
const newCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');

export type Purpose = 'verify' | 'reset';

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
  /** False when the cooldown refused; `nextSendAt` says when to ask again. */
  sent: boolean;
  nextSendAt: Iso;
  expiresAt: Iso;
}

/**
 * Whether spending is gated on a proved address right now.
 *
 * `PAYLEZ_VERIFY_TO_SPEND=on|off` decides when set. Otherwise the gate is on
 * exactly when mail is really delivered, which is the rule the first version
 * broke: a gate must never depend on a code that goes nowhere.
 */
export function gateOn(): boolean {
  const flag = process.env.PAYLEZ_VERIFY_TO_SPEND;
  if (flag === 'on') return true;
  if (flag === 'off') return false;
  return email.mode() === 'live';
}

interface Standing {
  email: string | null;
  email_verified_at: string | null;
  created_at: string;
}

const standing = async (db: Db, userId: string): Promise<Standing | undefined> =>
  await db.get<Standing>(`SELECT email, email_verified_at, created_at FROM users WHERE id = $u`, {
    u: userId,
  });

/**
 * Whether this account would be refused at a spending route right now.
 *
 * `GET /v1/me` reports it as `emailVerificationRequired`, so a client can ask
 * for the code before somebody taps Buy rather than after.
 */
export async function required(db: Db, userId: string): Promise<boolean> {
  if (!gateOn()) return false;
  const row = await standing(db, userId);
  if (!row || !row.email || row.email_verified_at) return false;
  /* Read at call time, like the gate itself, so a test can move it. */
  const since = process.env.PAYLEZ_VERIFY_SINCE || CONFIG.auth.verifySince;
  return Date.parse(row.created_at) >= Date.parse(since);
}

/**
 * Refuse unless the address is proved (or the account is exempt).
 *
 * `not_verified` (403), with the route that sends a code, so the refusal is not
 * a dead end. Called from the two spending routes only.
 */
export async function assertVerified(db: Db, userId: string): Promise<void> {
  if (!(await required(db, userId))) return;
  throw new DomainError('not_verified', 'confirm your email address first', {
    remedy: 'POST /v1/auth/email/send-code',
  });
}

/**
 * Write a fresh code and send it, or say why not.
 *
 * Three brakes, and each bounds something different:
 *
 * - **The cooldown** (`codeCooldownSeconds`) bounds the resend button. Not an
 *   error: asking again too soon is what an honest person does when a message
 *   is slow, so it comes back `sent: false` with `nextSendAt`.
 * - **The hourly ceiling** (`codeSendsPerHour`) bounds using this as a way to
 *   post mail to an address that is not yours. `sends` counts the codes since
 *   the last quiet hour: a send more than an hour after the previous one starts
 *   the count again.
 * - **The route's own rate limit** bounds the requests.
 *
 * The row is written **before** the send, so a message that fails to leave
 * still spent its cooldown.
 *
 * `background` sends without waiting, for the password reset: its answer must
 * not take longer for an address that exists than for one that does not.
 */
async function issue(
  db: Db,
  input: { userId: string; purpose: Purpose; language?: string; at: Iso; background?: boolean },
): Promise<Issued> {
  const at = input.at;
  const user = await db.get<{
    email: string | null;
    email_norm: string | null;
    display_name: string;
    language: string;
    email_verified_at: string | null;
  }>(`SELECT email, email_norm, display_name, language, email_verified_at FROM users WHERE id = $u`, {
    u: input.userId,
  });
  if (!user) throw new DomainError('not_found', 'no such account');
  if (!user.email || !user.email_norm) {
    throw new DomainError('validation_failed', 'this account has no email address', { field: 'email' });
  }
  if (input.purpose === 'verify' && user.email_verified_at) {
    throw new DomainError('conflict', 'that address is already confirmed');
  }

  const existing = await db.get<Row>(`SELECT * FROM email_verifications WHERE user_id = $u`, {
    u: input.userId,
  });

  let sends = 1;
  if (existing) {
    const waited = minutesBetween(existing.sent_at, at);
    if (waited * 60 < CONFIG.auth.codeCooldownSeconds) {
      return {
        sent: false,
        nextSendAt: plusMinutes(existing.sent_at, CONFIG.auth.codeCooldownSeconds / 60),
        expiresAt: existing.expires_at,
      };
    }
    if (waited < 60) {
      if (existing.sends >= CONFIG.auth.codeSendsPerHour) {
        throw new DomainError('quota_exceeded', 'too many codes have been sent — try again in an hour');
      }
      sends = existing.sends + 1;
    }
  }

  const code = newCode();
  const expiresAt = plusMinutes(at, CONFIG.auth.codeMinutes);
  await db.run(
    `INSERT INTO email_verifications (id, user_id, email_norm, code_hash, expires_at, attempts, sent_at, sends)
     VALUES ($i, $u, $e, $h, $x, 0, $t, $s)
       ON CONFLICT (user_id) DO UPDATE SET
         email_norm = excluded.email_norm,
         code_hash = excluded.code_hash,
         expires_at = excluded.expires_at,
         -- Reset: the attempt cap is per code, and this is a new code.
         attempts = 0,
         sent_at = excluded.sent_at,
         sends = excluded.sends`,
    { i: existing?.id ?? newId('otp'), u: input.userId, e: user.email_norm, h: hash(code), x: expiresAt, t: at, s: sends },
  );

  const copy = messageFor(input.language ?? user.language, code, user.display_name, input.purpose);
  const sending = email.send({ to: user.email, subject: copy.subject, body: copy.body });
  if (input.background) {
    sending.catch((error: unknown) => console.warn(`reset code not sent: ${(error as Error).message}`));
  } else {
    await sending;
  }

  return {
    sent: true,
    nextSendAt: plusMinutes(at, CONFIG.auth.codeCooldownSeconds / 60),
    expiresAt,
  };
}

/** Send (or resend) the confirmation code to a signed-in account's address. */
export async function sendCode(
  db: Db,
  input: { userId: string; language?: string; at?: Iso },
): Promise<Issued> {
  return await issue(db, { ...input, purpose: 'verify', at: input.at ?? now() });
}

/**
 * Check a code against the account's live row. Four failures, four facts:
 * nothing sent, too many attempts, expired, wrong (with attempts left).
 */
async function check(db: Db, userId: string, given: string, at: Iso): Promise<Row> {
  const row = await db.get<Row>(`SELECT * FROM email_verifications WHERE user_id = $u`, { u: userId });
  if (!row) throw new DomainError('not_found', 'no code has been sent');
  if (row.attempts >= CONFIG.auth.codeAttempts) {
    throw new DomainError('cap_reached', 'that code has had too many attempts — ask for a new one');
  }
  if (Date.parse(row.expires_at) <= Date.parse(at)) {
    throw new DomainError('expired', 'that code has expired — ask for a new one');
  }
  /* Spaces and dashes out: a code pasted from a mail client often has them. */
  if (hash(given.replace(/[\s-]/g, '')) !== row.code_hash) {
    await db.run(`UPDATE email_verifications SET attempts = attempts + 1 WHERE user_id = $u`, { u: userId });
    throw new DomainError('validation_failed', 'that code is not right', {
      field: 'code',
      attemptsLeft: Math.max(0, CONFIG.auth.codeAttempts - (row.attempts + 1)),
    });
  }
  return row;
}

/**
 * Stamp the address the code was **sent to**. A guarded `UPDATE`, so two
 * confirms racing grant once, and an account that changed its address between
 * the send and the confirm has not proved the new one.
 */
async function stamp(db: Db, userId: string, emailNorm: string, at: Iso): Promise<boolean> {
  const claimed = await db.run(
    `UPDATE users SET email_verified_at = $t, updated_at = $t
      WHERE id = $u AND email_verified_at IS NULL AND email_norm = $e`,
    { t: at, u: userId, e: emailNorm },
  );
  return claimed.changes > 0;
}

export interface Confirmed {
  verified: boolean;
  /** True only for the call that actually proved it. */
  granted: boolean;
}

/**
 * Confirm the sign-up code. Idempotent on success: confirming an account that
 * is already confirmed is `granted: false`, not an error.
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

  const row = await check(db, input.userId, input.code, at);
  if (!(await stamp(db, input.userId, row.email_norm, at))) {
    const fresh = await db.get<{ email_verified_at: string | null }>(
      `SELECT email_verified_at FROM users WHERE id = $u`,
      { u: input.userId },
    );
    if (fresh?.email_verified_at) return { verified: true, granted: false };
    throw new DomainError('conflict', 'that code was sent to a different address');
  }
  /* Spent. Deleted rather than marked: it has done its one job. */
  await db.run(`DELETE FROM email_verifications WHERE user_id = $u`, { u: input.userId });
  return { verified: true, granted: true };
}

const accountFor = async (db: Db, address: string) =>
  await db.get<{ id: string; status: string }>(
    `SELECT id, status FROM users WHERE email_norm = $e AND deleted_at IS NULL`,
    { e: address.trim().toLowerCase() },
  );

/**
 * Ask for a password-reset code. **Says nothing about whether the address has
 * an account**: the route answers the same `{ ok: true }` either way, a cooldown
 * or a spent hourly ceiling is swallowed rather than reported, and the mail is
 * sent in the background so the answer takes as long for a stranger's address
 * as for a customer's.
 */
export async function requestReset(
  db: Db,
  input: { email: string; language?: string; at?: Iso },
): Promise<void> {
  const user = await accountFor(db, input.email);
  if (!user || user.status === 'banned') return;
  try {
    await issue(db, { userId: user.id, purpose: 'reset', language: input.language, at: input.at ?? now(), background: true });
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
  }
}

/**
 * Set a new password with a reset code.
 *
 * Every way the code can fail answers the same sentence — no account, no code,
 * expired, spent, wrong — so this route cannot be used to learn which addresses
 * have accounts. A wrong guess still counts against the code's five attempts.
 *
 * On success: the password is set through `accounts.resetPassword` (which drops
 * every open session, because a reset is what somebody does when they think a
 * session is not theirs), the address is stamped as proved, and the code is
 * spent.
 */
export async function completeReset(
  db: Db,
  input: { email: string; code: string; password: string; at?: Iso },
): Promise<{ reset: true }> {
  const at = input.at ?? now();
  /* First, and before any lookup: it leaks nothing and burns no attempt. */
  if (input.password.length < CONFIG.auth.minPasswordLength) {
    throw new DomainError('validation_failed', 'password is too short', { field: 'password' });
  }
  const refused = () =>
    new DomainError('validation_failed', 'that code is not right, or it has expired', { field: 'code' });

  const user = await accountFor(db, input.email);
  if (!user || user.status === 'banned') throw refused();
  let row: Row;
  try {
    row = await check(db, user.id, input.code, at);
  } catch (error) {
    if (error instanceof DomainError) throw refused();
    throw error;
  }
  await resetPassword(db, user.id, input.password, at);
  await stamp(db, user.id, row.email_norm, at);
  await db.run(`DELETE FROM email_verifications WHERE user_id = $u`, { u: user.id });
  return { reset: true };
}

/**
 * The message, in the reader's language, English as the fallback. Kept here
 * because the server has no dictionaries of its own and this is five short
 * strings beside the one thing that sends them.
 */
function messageFor(
  language: string,
  code: string,
  name: string,
  purpose: Purpose,
): { subject: string; body: string } {
  const who = name.trim() ? `${name.trim()}, ` : '';
  const m = CONFIG.auth.codeMinutes;
  const reset = purpose === 'reset';
  switch (language) {
    case 'pl':
      return {
        subject: `Twój kod Paylez: ${code}`,
        body: reset
          ? `${who}Twój kod do zmiany hasła to ${code}. Wygasa po ${m} minutach. Jeśli to nie Ty prosiłeś o zmianę hasła, zignoruj tę wiadomość.`
          : `${who}Twój kod potwierdzający to ${code}. Wygasa po ${m} minutach. Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.`,
      };
    case 'uz':
      return {
        subject: `Paylez kodingiz: ${code}`,
        body: reset
          ? `${who}Parolni tiklash kodingiz — ${code}. U ${m} daqiqadan keyin eskiradi. Agar parolni tiklashni so‘ramagan bo‘lsangiz, bu xatni e’tiborsiz qoldiring.`
          : `${who}Tasdiqlash kodingiz — ${code}. U ${m} daqiqadan keyin eskiradi. Agar hisob ochmagan bo‘lsangiz, bu xatni e’tiborsiz qoldiring.`,
      };
    case 'ru':
      return {
        subject: `Ваш код Paylez: ${code}`,
        body: reset
          ? `${who}Ваш код для сброса пароля — ${code}. Он действует ${m} минут. Если вы не запрашивали сброс, просто проигнорируйте это письмо.`
          : `${who}Ваш код подтверждения — ${code}. Он действует ${m} минут. Если вы не регистрировались, просто проигнорируйте это письмо.`,
      };
    case 'uk':
      return {
        subject: `Ваш код Paylez: ${code}`,
        body: reset
          ? `${who}Ваш код для скидання пароля — ${code}. Він діє ${m} хвилин. Якщо ви не просили скинути пароль, просто проігноруйте цей лист.`
          : `${who}Ваш код підтвердження — ${code}. Він діє ${m} хвилин. Якщо ви не реєструвалися, просто проігноруйте цей лист.`,
      };
    default:
      return {
        subject: `Your Paylez code: ${code}`,
        body: reset
          ? `${who}your password reset code is ${code}. It expires in ${m} minutes. If you did not ask to reset your password, you can ignore this message.`
          : `${who}your confirmation code is ${code}. It expires in ${m} minutes. If you did not create an account, you can ignore this message.`,
      };
  }
}

/**
 * Drop codes nobody is going to use: expired a day or more ago. The day's grace
 * keeps the row for a support conversation about "it said expired". Called by
 * the daily job, because the rows carry an address.
 */
export async function prune(db: Db, at: Iso = now()): Promise<number> {
  const result = await db.run(`DELETE FROM email_verifications WHERE expires_at < $cut`, {
    cut: plusMinutes(at, -1440),
  });
  return result.changes;
}
