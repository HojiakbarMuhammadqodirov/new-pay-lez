/**
 * Password hashing.
 *
 * `src/site/auth/users.ts` opens with a warning that the front-end prototype
 * stores passwords in plain text in `localStorage` and "must be replaced by a
 * real server before this points at anybody's data". This file is the half of
 * that replacement that matters: nothing anywhere in this backend holds a
 * password, only a scrypt hash of one with a per-password salt.
 *
 * scrypt rather than bcrypt or PBKDF2 because it is memory-hard and it is in
 * Node's standard library, which keeps the dependency count at zero. The cost
 * parameter lives in `config.ts` where it can be raised as hardware improves —
 * the encoded form carries the parameters it was made with, so raising it does
 * not invalidate anybody's existing password.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { CONFIG } from '../config.ts';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const KEYLEN = 32;
const R = 8;
const P = 1;

/** `scrypt$N$r$p$salt$hash` — self-describing, so parameters can change. */
export async function hashPassword(password: string, N: number = CONFIG.auth.scryptN): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: 256 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  /* An account with no password — provisional, or OAuth-only — cannot be signed
     into with one. Returning false rather than throwing keeps the sign-in path
     from telling an attacker which accounts those are. */
  if (!encoded) return false;

  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, salt, hash] = parts;

  try {
    const expected = Buffer.from(hash, 'base64url');
    const actual = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 256 * 1024 * 1024,
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
