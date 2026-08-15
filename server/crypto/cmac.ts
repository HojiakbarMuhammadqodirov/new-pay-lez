/**
 * AES-CMAC (RFC 4493).
 *
 * Needed because NTAG 424 DNA authenticates a tap with a CMAC and nothing in
 * Node's `crypto` exposes one — `createHmac` is a different construction
 * entirely, and the tag will not be talked out of using AES. It is forty lines,
 * it is exactly specified, and the alternative is trusting a URL the customer's
 * phone just handed us, which is the forgery §3.3 exists to reject.
 *
 * Implemented on `aes-128-ecb` with padding disabled, which is how you get a raw
 * block cipher out of Node.
 */
import { createCipheriv } from 'node:crypto';

const BLOCK = 16;
const Rb = 0x87;

function aesBlock(key: Buffer, block: Buffer): Buffer {
  const cipher = createCipheriv('aes-128-ecb', key, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(block), cipher.final()]);
}

/** One left shift over a 16-byte big-endian value, with the CMAC feedback. */
function shiftLeft(input: Buffer): Buffer {
  const out = Buffer.alloc(BLOCK);
  let carry = 0;
  for (let i = BLOCK - 1; i >= 0; i -= 1) {
    const value = (input[i] << 1) | carry;
    out[i] = value & 0xff;
    carry = (input[i] & 0x80) ? 1 : 0;
  }
  if (input[0] & 0x80) out[BLOCK - 1] ^= Rb;
  return out;
}

function subkeys(key: Buffer): { k1: Buffer; k2: Buffer } {
  const l = aesBlock(key, Buffer.alloc(BLOCK));
  const k1 = shiftLeft(l);
  const k2 = shiftLeft(k1);
  return { k1, k2 };
}

const xor = (a: Buffer, b: Buffer): Buffer => {
  const out = Buffer.alloc(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = a[i] ^ b[i];
  return out;
};

export function cmac(key: Buffer, message: Buffer): Buffer {
  if (key.length !== 16) throw new Error('AES-CMAC here is 128-bit only');
  const { k1, k2 } = subkeys(key);

  const blocks = Math.max(1, Math.ceil(message.length / BLOCK));
  const complete = message.length > 0 && message.length % BLOCK === 0;

  let last: Buffer;
  if (complete) {
    last = xor(message.subarray((blocks - 1) * BLOCK, blocks * BLOCK), k1);
  } else {
    const tail = message.subarray((blocks - 1) * BLOCK);
    const padded = Buffer.alloc(BLOCK);
    tail.copy(padded);
    padded[tail.length] = 0x80;
    last = xor(padded, k2);
  }

  let x: Buffer = Buffer.alloc(BLOCK);
  for (let i = 0; i < blocks - 1; i += 1) {
    x = aesBlock(key, xor(x, message.subarray(i * BLOCK, (i + 1) * BLOCK)));
  }
  return aesBlock(key, xor(x, last));
}

/**
 * The eight bytes NXP actually puts in the URL.
 *
 * SDM truncates the 16-byte CMAC by taking every *odd* byte — not the first
 * eight. Taking the first eight is the mistake that makes a correct
 * implementation reject every genuine tag, and it is silent: the maths is right
 * and nothing works.
 */
export function truncate(mac: Buffer): Buffer {
  const out = Buffer.alloc(8);
  for (let i = 0; i < 8; i += 1) out[i] = mac[i * 2 + 1];
  return out;
}
