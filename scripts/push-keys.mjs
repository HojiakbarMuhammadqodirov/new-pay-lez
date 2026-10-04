/**
 * Print a fresh VAPID key pair for browser push (`ports/webpush.ts`).
 *
 * Generated once per deployment and kept: every browser that subscribes is
 * subscribed *to the public key*, so a new pair silently orphans every existing
 * subscription — the reminders stop and nothing says why. Rotate only on a
 * leak, and expect everybody to switch the reminder on again.
 */
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const priv = privateKey.export({ format: 'jwk' });
const pub = publicKey.export({ format: 'jwk' });
const point = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(pub.x, 'base64url'),
  Buffer.from(pub.y, 'base64url'),
]);

console.log(`VAPID_PUBLIC_KEY=${point.toString('base64url')}`);
console.log(`VAPID_PRIVATE_KEY=${priv.d}`);
