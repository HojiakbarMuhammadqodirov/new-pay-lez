/**
 * The push boundary — FCM and APNs.
 *
 * Everything that *decides* delivery is real and lives in
 * `domain/notifications.ts`: the per-user frequency cap, quiet hours in venue
 * time, the mode tag, the partner quota, and the honest reach figure that comes
 * from the difference between targeted and reachable. This file is only the last
 * hop, which needs a Firebase service account and an Apple key.
 *
 * The local adapter marks queued notifications sent and records what it would
 * have delivered, so the whole notification pipeline — including the counters a
 * partner reads — is exercisable end to end without credentials.
 */
import type { Db } from '../db/db.ts';
import * as notifications from '../domain/notifications.ts';
import { DomainError } from '../domain/errors.ts';

export const mode = (): 'local' | 'live' =>
  process.env.PAYLEZ_PUSH === 'live' ? 'live' : 'local';

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
  const queued = notifications.pending(db, limit);
  if (queued.length === 0) return { attempted: 0, sent: 0, failed: 0 };

  if (mode() === 'live') {
    /* TODO(live): group by platform, POST to FCM v1 / APNs HTTP/2 with the
       recipient's token, and treat an `UNREGISTERED` response as a signal to
       revoke that token rather than as a transient failure. */
    throw new DomainError('internal', 'live push needs FCM/APNs credentials');
  }

  const sent = queued.map((row) => row.id);
  notifications.markSent(db, sent);
  return { attempted: queued.length, sent: sent.length, failed: 0 };
}
