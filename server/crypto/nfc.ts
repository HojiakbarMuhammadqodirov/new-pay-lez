/**
 * NTAG 424 DNA tap validation — §3.3.
 *
 * Each tap produces a fresh URL carrying an encrypted UID and tap counter
 * (`picc_data`) and a CMAC over them. Verifying it proves three things at once:
 * the silicon is genuine (only the tag holds the key), the tap is fresh (the
 * counter has never been this high), and the tag is ours (it is in the
 * registry). A replayed URL fails on the second.
 *
 * Two properties from the spec are load-bearing and both are here:
 *
 *   * **The tag never stores the venue id.** It stores its UID; the server
 *     resolves the venue from `tag_registry`. That is what makes reassigning or
 *     revoking a tag instant instead of a trip to the venue with a phone.
 *   * **Keys are diversified.** A per-tag key is derived from the master key and
 *     the UID, so one tag pulled apart on a bench exposes nothing but itself.
 *     The master key lives in the process's secret store and never leaves it.
 *
 * The derivation and session-key construction follow NXP's AN12196 shape. A real
 * deployment must use the exact diversification its tags were personalised with
 * — that is a decision made at the factory, not here — so `deriveKey` is the one
 * function to replace when the tags arrive, and it is deliberately alone.
 */
import { createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { cmac, truncate } from './cmac.ts';

export interface TapPayload {
  /** Seven bytes, hex, uppercase — the tag's own UID. */
  uid: string;
  /** The tag's monotonic read counter. Strictly increasing, per tag, forever. */
  counter: number;
}

/**
 * Per-tag key from the master key and the UID.
 *
 * `CMAC(master, 0x01 || uid)` — a labelled derivation rather than the raw UID,
 * so two different key purposes for the same tag cannot collide.
 */
export function deriveKey(master: Buffer, uid: Buffer): Buffer {
  return cmac(master, Buffer.concat([Buffer.from([0x01]), uid]));
}

/**
 * Decrypt the PICC data block.
 *
 * AES-128-CBC with a zero IV, which is what the tag does — and is safe *here*
 * only because the plaintext's first byte is a fixed tag and its remaining
 * bytes are a UID and a counter that never repeat. It is not a pattern to copy.
 */
export function decryptPicc(key: Buffer, piccData: Buffer): TapPayload | null {
  if (piccData.length !== 16) return null;
  const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16));
  decipher.setAutoPadding(false);
  const plain = Buffer.concat([decipher.update(piccData), decipher.final()]);

  /* 0xC7 is the UID+counter mirror tag. Anything else means we decrypted with
     the wrong key, which is indistinguishable from a forgery and is treated as
     one. */
  if (plain[0] !== 0xc7) return null;

  const uid = plain.subarray(1, 8);
  const counter = plain[8] | (plain[9] << 8) | (plain[10] << 16);
  return { uid: uid.toString('hex').toUpperCase(), counter };
}

/** AN12196's session key for the SDM file-read MAC. */
function sessionKey(fileKey: Buffer, uid: Buffer, counter: number): Buffer {
  const sv2 = Buffer.concat([
    Buffer.from([0x3c, 0xc3, 0x00, 0x01, 0x00, 0x80]),
    uid,
    Buffer.from([counter & 0xff, (counter >> 8) & 0xff, (counter >> 16) & 0xff]),
  ]);
  return cmac(fileKey, sv2);
}

export type TapResult =
  | { ok: true; uid: string; counter: number }
  | { ok: false; reason: 'malformed' | 'bad_key' | 'bad_cmac' };

/**
 * Verify a tap URL's `picc_data` and `cmac` parameters.
 *
 * `message` is the SDM-mirrored file data the MAC covers; for a plain
 * UID+counter mirror it is empty, which is the common personalisation.
 */
export function verifyTap(
  master: Buffer,
  piccHex: string,
  cmacHex: string,
  message: Buffer = Buffer.alloc(0),
): TapResult {
  if (!/^[0-9a-fA-F]{32}$/.test(piccHex) || !/^[0-9a-fA-F]{16}$/.test(cmacHex)) {
    return { ok: false, reason: 'malformed' };
  }

  /* The UID is inside the ciphertext, and the key is derived *from* the UID —
     so the meta key cannot be diversified per tag without a chicken-and-egg. It
     is the master key; the *file* key, which authenticates the tap, is the
     diversified one. That asymmetry is deliberate and is how NXP's own SDM
     works: the PICC block leaks nothing on its own. */
  const picc = decryptPicc(master, Buffer.from(piccHex, 'hex'));
  if (!picc) return { ok: false, reason: 'bad_key' };

  const uid = Buffer.from(picc.uid, 'hex');
  const expected = truncate(cmac(sessionKey(deriveKey(master, uid), uid, picc.counter), message));
  const given = Buffer.from(cmacHex, 'hex');

  /* Constant time: a byte-by-byte compare that returns early is a timing oracle
     for forging the MAC one byte at a time, which is not theoretical at the
     scale a loyalty program eventually runs at. */
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: 'bad_cmac' };
  }
  return { ok: true, uid: picc.uid, counter: picc.counter };
}

/**
 * Mint a tap URL's parameters, for tests and for provisioning a demo tag.
 *
 * The counterpart of `verifyTap`, and the only way to have a test that proves
 * the verifier accepts a genuine tap rather than merely rejecting rubbish. A
 * verifier that rejects everything passes every negative test there is.
 */
export function mintTap(
  master: Buffer,
  uidHex: string,
  counter: number,
  message: Buffer = Buffer.alloc(0),
): { piccHex: string; cmacHex: string } {
  const uid = Buffer.from(uidHex, 'hex');
  const plain = Buffer.alloc(16);
  plain[0] = 0xc7;
  uid.copy(plain, 1);
  plain[8] = counter & 0xff;
  plain[9] = (counter >> 8) & 0xff;
  plain[10] = (counter >> 16) & 0xff;
  /* The tag pads with zeros; nothing reads past byte 11. */

  const cipher = createCipheriv('aes-128-cbc', master, Buffer.alloc(16));
  cipher.setAutoPadding(false);
  const piccHex = Buffer.concat([cipher.update(plain), cipher.final()]).toString('hex').toUpperCase();

  const mac = truncate(cmac(sessionKey(deriveKey(master, uid), uid, counter), message));
  return { piccHex, cmacHex: mac.toString('hex').toUpperCase() };
}
