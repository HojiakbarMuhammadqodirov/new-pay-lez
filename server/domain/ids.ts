/**
 * Ids and codes.
 *
 * Every id is `prefix_` plus 20 hex characters of `randomBytes`. The prefix is
 * not decoration: an id in a log line, an audit row or a `source_ref` says what
 * it points at without a join, and `source_ref` in the points ledger (§2.1)
 * genuinely is polymorphic — it can be a game session, a transaction, a
 * referral or a voucher.
 *
 * Random rather than sequential, because these ids appear in URLs a partner and
 * a customer both hold: a sequential venue id tells anyone who asks how many
 * venues Paylez has, and a sequential transaction id lets one venue estimate
 * another's traffic.
 */
import { randomBytes, randomInt } from 'node:crypto';

export type IdPrefix =
  | 'usr' | 'ses' | 'dev' | 'ven' | 'lnk' | 'ver' | 'con' | 'dsc'
  | 'led' | 'txn' | 'bdg' | 'mov' | 'vtr' | 'ivc' | 'gcs' | 'gcd'
  | 'cmp' | 'stc' | 'rwd' | 'vis' | 'del' | 'evt' | 'psh' | 'gms'
  | 'gev' | 'ref' | 'ntf' | 'ptk' | 'pln' | 'sub' | 'inv' | 'bev'
  | 'aud' | 'frd' | 'mod' | 'bmk' | 'ast' | 'msg' | 'gsv' | 'art'
  | 'nws' | 'cpr' | 'rec' | 'fbk' | 'sev' | 'qzi' | 'wrd';

export const newId = (prefix: IdPrefix): string => `${prefix}_${randomBytes(10).toString('hex')}`;

/**
 * A human-readable code — a voucher, a reward, a referral link.
 *
 * Crockford's alphabet minus the four characters that are read wrong at a
 * counter: no `I`/`1`, no `O`/`0`. Somebody has to say these out loud.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function shortCode(length = 8): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** `PLZ-9F3K` — the shape the site's wallet already prints. */
export const voucherCode = (): string => `PLZ-${shortCode(4)}`;

/** `PY1100` — the shape the old database's referral codes are in. */
export const referralCode = (): string => `PY${randomInt(1000, 9999)}`;
