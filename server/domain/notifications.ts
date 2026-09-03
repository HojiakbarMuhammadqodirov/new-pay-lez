/**
 * Notifications — §9.
 *
 * Two rules do all the work here and both are about *not* sending things:
 *
 *   * **The frequency cap is platform-level, not per-partner** (§9.1). A user
 *     targeted by six venues in a week is a user who turns push off, and then
 *     every venue loses. So the cap counts across all sources, and a partner
 *     push that cannot be delivered because of it is dropped for that user —
 *     with the partner's reach figure reflecting only the reachable audience,
 *     which is why `deal_pushes.reachable` is stored separately from `targeted`.
 *   * **Quiet hours are venue-local** (§9.2), so a Kraków venue's 21:00 cut-off
 *     is 21:00 in Kraków whatever the server thinks the time is.
 *
 * Everything lands in the inbox regardless. Suppression is about *delivery*, not
 * about whether the user is told — a customer whose voucher expires tomorrow
 * should find that out when they open the app even if they were over their push
 * cap when it happened.
 */
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import { newId } from './ids.ts';
import { local, now, plusDays, withinDailyWindow, type Iso } from './time.ts';

export type Mode = 'consumer' | 'partner';

export interface NotificationInput {
  userId: string;
  kind: string;
  title: string;
  body: string;
  mode?: Mode;
  language?: string;
  actionUrl?: string;
  sourceKind?: string;
  sourceRef?: string;
  pushId?: string;
  /** Set for anything the user should be interrupted for. */
  push?: boolean;
  /** The venue whose clock quiet hours are evaluated in, when pushing. */
  venueId?: string;
  at?: Iso;
}

export interface Delivery {
  id: string;
  delivery: 'inbox' | 'queued' | 'suppressed';
  reason?: string;
}

/**
 * Write one notification, and decide whether it may also be pushed.
 *
 * The decision order matters: permission, then preference, then quiet hours,
 * then the frequency cap. Each one is a different answer to "why didn't I get
 * this", and recording which one fired is what makes that answerable at all.
 */
export async function notify(db: Db, input: NotificationInput): Promise<Delivery> {
  const at = input.at ?? now();
  const id = newId('ntf');
  const mode: Mode = input.mode ?? 'consumer';

  let delivery: 'inbox' | 'queued' | 'suppressed' = 'inbox';
  let reason: string | undefined;

  if (input.push) {
    const check = await canPush(db, input.userId, mode, input.venueId, at);
    if (check.ok) delivery = 'queued';
    else {
      delivery = 'suppressed';
      reason = check.reason;
    }
  }

  const language =
    input.language ??
    (await db.get<{ language: string }>(`SELECT language FROM users WHERE id = $u`, { u: input.userId }))
      ?.language ??
    'en';

  await db.run(
    `INSERT INTO notifications
       (id, user_id, kind, mode, title, body, language, action_url, source_kind, source_ref,
        push_id, delivery, suppress_reason, created_at)
     VALUES ($i, $u, $k, $m, $t, $b, $l, $a, $sk, $sr, $p, $d, $rs, $at)`,
    {
      i: id,
      u: input.userId,
      k: input.kind,
      m: mode,
      t: input.title,
      b: input.body,
      l: language,
      a: input.actionUrl ?? null,
      sk: input.sourceKind ?? null,
      sr: input.sourceRef ?? null,
      p: input.pushId ?? null,
      d: delivery,
      rs: reason ?? null,
      at,
    },
  );

  return { id, delivery, reason };
}

export type PushCheck = { ok: true } | { ok: false; reason: string };

/**
 * May this user be pushed right now?
 *
 * `no_token` is not a failure of policy, but it is recorded the same way — a
 * partner asking why their reach was 40 out of 300 deserves the real reason, and
 * "most of them never granted permission" is a different problem from "most of
 * them were over the cap".
 */
export async function canPush(
  db: Db,
  userId: string,
  mode: Mode,
  venueId: string | undefined,
  at: Iso = now(),
): Promise<PushCheck> {
  const tokens = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM push_tokens WHERE user_id = $u AND revoked_at IS NULL`,
    { u: userId },
  );
  if ((tokens?.n ?? 0) === 0) return { ok: false, reason: 'no_permission' };

  const pref = await db.get<{ enabled: number }>(
    `SELECT enabled FROM notification_prefs WHERE user_id = $u AND mode = $m AND channel = 'push'`,
    { u: userId, m: mode },
  );
  if (pref && !pref.enabled) return { ok: false, reason: 'preference_off' };

  /* §9.2. Quiet hours are the *venue's*, because the deal is theirs; with no
     venue (a platform notice) the user's own city clock is the closest honest
     stand-in, and Europe/Warsaw is where this product is. */
  const timezone =
    (venueId &&
      (await db.get<{ timezone: string }>(`SELECT timezone FROM venues WHERE id = $v`, { v: venueId }))
        ?.timezone) ||
    'Europe/Warsaw';
  const l = local(at, timezone);
  if (!withinDailyWindow(l.minutes, CONFIG.deals.quietFromMin, CONFIG.deals.quietToMin)) {
    return { ok: false, reason: 'quiet_hours' };
  }

  const day = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM notifications
      WHERE user_id = $u AND delivery IN ('queued', 'sent') AND created_at >= $s`,
    { u: userId, s: plusDays(at, -1) },
  );
  if ((day?.n ?? 0) >= CONFIG.deals.userPushPerDay) return { ok: false, reason: 'frequency_cap' };

  const week = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM notifications
      WHERE user_id = $u AND delivery IN ('queued', 'sent') AND created_at >= $s`,
    { u: userId, s: plusDays(at, -7) },
  );
  if ((week?.n ?? 0) >= CONFIG.deals.userPushPerWeek) return { ok: false, reason: 'frequency_cap' };

  return { ok: true };
}

export const inbox = async (db: Db, userId: string, mode?: Mode, limit = 50) =>
  await db.all(
    `SELECT id, kind, mode, title, body, action_url, read_at, created_at, delivery
       FROM notifications
      WHERE user_id = $u AND ($m IS NULL OR mode = $m)
      ORDER BY created_at DESC LIMIT $l`,
    { u: userId, m: mode ?? null, l: limit },
  );

export const unreadCount = async (db: Db, userId: string, mode?: Mode): Promise<number> =>
  (await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM notifications
      WHERE user_id = $u AND read_at IS NULL AND ($m IS NULL OR mode = $m)`,
    { u: userId, m: mode ?? null },
  ))?.n ?? 0;

export async function markRead(db: Db, userId: string, ids: string[], at: Iso = now()): Promise<number> {
  let changed = 0;
  await db.tx(async () => {
    for (const id of ids) {
      changed += (await db.run(
        `UPDATE notifications SET read_at = $t WHERE id = $i AND user_id = $u AND read_at IS NULL`,
        { t: at, i: id, u: userId },
      )).changes;
    }
  });
  return changed;
}

/**
 * The queue the push adapter drains.
 *
 * Delivery itself is an external boundary (`ports/push.ts`) — FCM and APNs need
 * credentials this repo does not have — but everything that *decides* what is
 * delivered is here and is real. Swapping the adapter changes nothing about who
 * gets what.
 */
export const pending = async (db: Db, limit = 200) =>
  await db.all<{ id: string; user_id: string; title: string; body: string; language: string }>(
    `SELECT n.id, n.user_id, n.title, n.body, n.language FROM notifications n
      WHERE n.delivery = 'queued' ORDER BY n.created_at LIMIT $l`,
    { l: limit },
  );

export async function markSent(db: Db, ids: string[], failed: string[] = []): Promise<void> {
  await db.tx(async () => {
    for (const id of ids) await db.run(`UPDATE notifications SET delivery = 'sent' WHERE id = $i`, { i: id });
    for (const id of failed) await db.run(`UPDATE notifications SET delivery = 'failed' WHERE id = $i`, { i: id });
  });
}
