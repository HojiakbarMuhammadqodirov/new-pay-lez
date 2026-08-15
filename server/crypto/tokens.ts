/**
 * Signed tokens: the dynamic venue QR (§3.2) and session tokens.
 *
 * Both are the same construction — a compact payload, base64url, with an
 * HMAC-SHA256 over it — because both answer the same question ("did we issue
 * this, and is it still valid?") and a second format would be a second thing to
 * get wrong. What differs is the lifetime and the replay rule: a session token
 * is meant to be reused, a QR is single-use and the nonce table enforces it.
 *
 * Not JWT. A JWT would carry an algorithm field that an attacker may set to
 * `none`, three base64 segments where one would do, and a library. This is
 * twenty lines and has no algorithm negotiation because there is nothing to
 * negotiate with — both ends are this file.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const b64url = (buf: Buffer): string => buf.toString('base64url');

const sign = (secret: string, body: string): string =>
  b64url(createHmac('sha256', secret).update(body).digest());

/** `<payload>.<signature>`, both base64url. */
export function seal(secret: string, payload: Record<string, unknown>): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  return `${body}.${sign(secret, body)}`;
}

export function open<T>(secret: string, token: string): T | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(secret, body));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

/** An opaque session token: 32 bytes of randomness, stored only as its hash. */
export const newToken = (): string => randomBytes(32).toString('base64url');

/**
 * How a session token is stored.
 *
 * SHA-256 rather than scrypt, and that is not an oversight: a session token is
 * already 256 bits of uniform randomness, so there is nothing to brute-force and
 * a slow hash would only tax every authenticated request. Passwords are the
 * opposite case and are handled in `passwords.ts`.
 */
export const hashToken = (token: string): string =>
  createHmac('sha256', 'paylez-session').update(token).digest('hex');
