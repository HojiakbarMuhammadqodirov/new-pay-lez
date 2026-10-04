/**
 * Browser push — the Web Push protocol, over `fetch` and `node:crypto`.
 *
 * Three RFCs and no dependency. A library for this exists (`web-push`) and it is
 * a few hundred lines wrapping exactly what is below; the budget is one runtime
 * dependency and `pg` has spent it, the same argument `ports/stripe.ts` and
 * `ports/llm.ts` make for calling their APIs with `fetch`.
 *
 *   * **RFC 8291** — the message is encrypted *to the browser*. The push service
 *     (Google's, Mozilla's, Apple's) carries it and cannot read it: an ephemeral
 *     P-256 key agrees a secret with the subscription's `p256dh`, the
 *     subscription's `auth` secret is mixed in, and the payload is one
 *     AES-128-GCM record.
 *   * **RFC 8188** — the `aes128gcm` content coding that record is framed in.
 *   * **RFC 8292** (VAPID) — the request is signed by *this server*, so a push
 *     service only accepts messages for a subscription from the key the browser
 *     subscribed with. A leaked subscription is useless without the private key.
 *
 * The keys are `VAPID_PUBLIC_KEY` (the 65-byte uncompressed point, base64url —
 * the same string the browser is handed to subscribe with) and
 * `VAPID_PRIVATE_KEY` (the 32-byte scalar, base64url). `npm run push:keys`
 * prints a fresh pair.
 */
import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign,
  type ECDH,
  type KeyObject,
} from 'node:crypto';

export interface WebSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const b64url = (bytes: Buffer): string => bytes.toString('base64url');
const fromB64url = (text: string): Buffer => Buffer.from(text, 'base64url');

const hmac = (key: Buffer, data: Buffer): Buffer => createHmac('sha256', key).update(data).digest();

/**
 * Read a stored token back into a subscription, or `null` for one that is not.
 *
 * The token column holds the browser's `PushSubscription.toJSON()` verbatim.
 * Checked on the way *in* by the route and again here, because a row that
 * predates the check — or one an `fcm` client wrote — must not reach `fetch`.
 */
export function parseSubscription(token: string): WebSubscription | null {
  let value: unknown;
  try {
    value = JSON.parse(token);
  } catch {
    return null;
  }
  const sub = value as Partial<WebSubscription> | null;
  if (!sub || typeof sub.endpoint !== 'string' || !sub.keys) return null;
  let url: URL;
  try {
    url = new URL(sub.endpoint);
  } catch {
    return null;
  }
  /* https only: a push service on plain http would be carrying a signed
     request in the clear, and no real browser hands one out. */
  if (url.protocol !== 'https:') return null;
  const { p256dh, auth } = sub.keys;
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return null;
  if (fromB64url(p256dh).length !== 65 || fromB64url(auth).length !== 16) return null;
  return { endpoint: sub.endpoint, keys: { p256dh, auth } };
}

/**
 * The RFC 8291 encryption, returned as the finished `aes128gcm` body.
 *
 * `local` and `salt` are parameters only so `verify:api` can pin a known
 * answer; every real call takes fresh ones, and reusing either across messages
 * would reuse a key and nonce under GCM, which is the one thing GCM cannot
 * survive.
 */
export function encrypt(
  sub: WebSubscription,
  payload: Buffer,
  local?: ECDH,
  salt: Buffer = randomBytes(16),
): Buffer {
  if (!local) {
    local = createECDH('prime256v1');
    local.generateKeys();
  }
  const uaPublic = fromB64url(sub.keys.p256dh);
  const authSecret = fromB64url(sub.keys.auth);
  const asPublic = local.getPublicKey();
  const shared = local.computeSecret(uaPublic);

  /* HKDF in two steps each time, written out: extract is an HMAC keyed by the
     salt, and an expand of at most one hash length is one HMAC with 0x01. */
  const prkKey = hmac(authSecret, shared);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);

  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);

  /* One record, so the padding delimiter is 0x02 ("last record"). */
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const sealed = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final()]);
  const tag = cipher.getAuthTag();

  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, sealed, tag]);
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** The private scalar as a key object, rebuilt from the public point's x and y. */
function signingKey(keys: VapidKeys): KeyObject {
  const point = fromB64url(keys.publicKey);
  if (point.length !== 65 || point[0] !== 4) throw new Error('VAPID_PUBLIC_KEY is not an uncompressed P-256 point');
  return createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: keys.privateKey,
      x: b64url(point.subarray(1, 33)),
      y: b64url(point.subarray(33, 65)),
    },
    format: 'jwk',
  });
}

/**
 * The `Authorization` header (RFC 8292): an ES256 JWT for the push service's
 * origin, and the public key it verifies against.
 */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const header = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(
    Buffer.from(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        /* Twelve hours: the spec's ceiling is twenty-four, and a token is minted
           per request, so the margin only has to cover clock skew. */
        exp: nowSeconds + 12 * 3600,
        sub: keys.subject,
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  /* `ieee-p1363` is the raw r||s a JWS wants; Node's default is DER. */
  const signature = sign('sha256', Buffer.from(unsigned), { key: signingKey(keys), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${b64url(signature)}, k=${keys.publicKey}`;
}

/**
 * What one delivery came to. `gone` is the push service saying the
 * subscription no longer exists (404/410) — the browser unsubscribed or the
 * site's permission was revoked — and is a reason to delete the token rather
 * than a failure to retry.
 */
export type Sent = 'sent' | 'gone' | 'failed';

export async function send(
  sub: WebSubscription,
  message: { title: string; body: string; url?: string },
  keys: VapidKeys,
  ttlSeconds: number,
): Promise<Sent> {
  const body = encrypt(sub, Buffer.from(JSON.stringify(message)));
  try {
    const response = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidAuthorization(sub.endpoint, keys),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttlSeconds),
        Urgency: 'normal',
      },
      body,
      /* A push service that does not answer in ten seconds is not going to,
         and the drain has a queue behind this one. */
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404 || response.status === 410) return 'gone';
    return response.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

export function keysFromEnv(): VapidKeys | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    /* A contact the push service can reach if this server misbehaves. The
       spec requires a `mailto:` or `https:` URL. */
    subject: process.env.VAPID_SUBJECT?.trim() || 'mailto:no-reply@pay-lez.com',
  };
}
