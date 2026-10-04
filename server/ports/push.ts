/**
 * The push boundary — browsers (Web Push), and FCM and APNs.
 *
 * Everything that *decides* delivery is real and lives in
 * `domain/notifications.ts`: the per-user frequency cap, quiet hours in venue
 * time, the mode tag, the partner quota, and the honest reach figure that comes
 * from the difference between targeted and reachable. This file is only the last
 * hop.
 *
 * **Browsers are live; the phone is not.** `PAYLEZ_PUSH=live` sends the
 * `CONFIG.push.webKinds` to every web subscription a user has, signed with the
 * VAPID pair (`ports/webpush.ts`). FCM and APNs still need a Firebase service
 * account and an Apple key this repo does not have, so in live mode a row with
 * no browser to go to is marked `failed` — honestly undelivered — rather than
 * `sent` by an adapter that sent nothing.
 *
 * The local adapter marks queued notifications sent and records what it would
 * have delivered, so the whole notification pipeline — including the counters a
 * partner reads — is exercisable end to end without credentials.
 */
import type { Db } from '../db/db.ts';
import * as notifications from '../domain/notifications.ts';
import { DomainError } from '../domain/errors.ts';
import { CONFIG } from '../config.ts';
import * as webpush from './webpush.ts';

export const mode = (): 'local' | 'live' =>
  process.env.PAYLEZ_PUSH === 'live' ? 'live' : 'local';

/**
 * The key a browser subscribes with, or `null` when browser push is not
 * switched on — and the site reads that `null` as "say so", not as a switch
 * that cannot work.
 */
export const webPublicKey = (): string | null =>
  mode() === 'live' ? webpush.keysFromEnv()?.publicKey ?? null : null;

/** `live` with no VAPID pair is a deployment that would fail every push. */
export const configured = (): boolean => mode() === 'local' || webpush.keysFromEnv() !== null;

export interface Delivered {
  attempted: number;
  sent: number;
  failed: number;
}

/**
 * Drain the queue.
 *
 * Called by the scheduler. Batched rather than per-notification because both
 * providers are far happier with one connection and many messages, and because a
 * failure that affects one recipient should not stop the other 199.
 */
export async function drain(db: Db, limit = 200): Promise<Delivered> {
  const queued = await notifications.pending(db, limit);
  if (queued.length === 0) return { attempted: 0, sent: 0, failed: 0 };

  if (mode() === 'live') {
    const keys = webpush.keysFromEnv();
    if (!keys) throw new DomainError('internal', 'PAYLEZ_PUSH=live needs VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY');

    const sent: string[] = [];
    const failed: string[] = [];
    for (const row of queued) {
      /* TODO(live, phone): FCM v1 / APNs for the non-web kinds, treating an
         `UNREGISTERED` answer the way `gone` is treated below. */
      if (!CONFIG.push.webKinds.includes(row.kind)) {
        failed.push(row.id);
        continue;
      }
      const tokens = await db.all<{ id: string; token: string }>(
        `SELECT id, token FROM push_tokens WHERE user_id = $u AND platform = 'web' AND revoked_at IS NULL`,
        { u: row.user_id },
      );
      let delivered = false;
      for (const token of tokens) {
        const sub = webpush.parseSubscription(token.token);
        const result = sub
          ? await webpush.send(
              sub,
              { title: row.title, body: row.body, url: row.action_url ?? undefined },
              keys,
              CONFIG.push.ttlSeconds,
            )
          : 'gone';
        if (result === 'sent') delivered = true;
        /* The browser unsubscribed, or the row was never a subscription: it
           will never be delivered to again, so it stops counting as permission
           — which is what `canPush` reads. */
        if (result === 'gone') {
          await db.run(`UPDATE push_tokens SET revoked_at = $t WHERE id = $i AND revoked_at IS NULL`, {
            t: new Date().toISOString(),
            i: token.id,
          });
        }
      }
      (delivered ? sent : failed).push(row.id);
    }
    await notifications.markSent(db, sent, failed);
    return { attempted: queued.length, sent: sent.length, failed: failed.length };
  }

  const sent = queued.map((row) => row.id);
  await notifications.markSent(db, sent);
  return { attempted: queued.length, sent: sent.length, failed: 0 };
}
