/**
 * The daily game reminder — the one push a browser gets.
 *
 * ## Who is reminded
 *
 * Somebody who (1) switched "Daily game reminder" on in their profile, (2) has
 * a live **web** subscription, (3) is not suspended or erased, and (4) has not
 * started a round today. Each of those is a different reason not to send, and
 * the last is the one that makes this a reminder rather than a nag: a player
 * who already played at lunch is told nothing.
 *
 * ## When
 *
 * At `CONFIG.push.reminderAtMin` (18:00) **on the player's clock** — the zone
 * their browser reported when it subscribed — and no later than
 * `reminderUntilMin`. "Today" is their local day too, both for "has not played
 * today" and for "already reminded today", so somebody in Tashkent and
 * somebody in Kraków are each reminded at their own six o'clock about their own
 * day. The job runs every minute, so the push leaves within a minute of six.
 *
 * ## Once
 *
 * The guard is the inbox row itself: `kind = 'daily_game'` with the local day
 * as `source_ref`. Written by `notifications.notify` in the same pass that
 * decides to send, and checked in the same statement that finds the
 * population, so two overlapping runs cannot both remind — the pattern
 * `checkin.remind` uses for the same reason.
 */
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import * as notifications from './notifications.ts';
import { local, localMidnight, now, type Iso } from './time.ts';

export const DAILY_GAME = 'daily_game';

/** The per-event switches a client can set, by their API name. */
export interface KindPrefs {
  dailyGameReminder: boolean;
}

const KIND_FOR: Record<keyof KindPrefs, string> = { dailyGameReminder: DAILY_GAME };

/** No row is "never switched on", which is off. */
export async function kindPrefs(db: Db, userId: string): Promise<KindPrefs> {
  const rows = await db.all<{ kind: string; enabled: number }>(
    `SELECT kind, enabled FROM notification_kind_prefs WHERE user_id = $u`,
    { u: userId },
  );
  const on = (kind: string) => rows.some((row) => row.kind === kind && Number(row.enabled) === 1);
  return { dailyGameReminder: on(DAILY_GAME) };
}

export async function setKindPrefs(
  db: Db,
  userId: string,
  patch: Partial<KindPrefs>,
  at: Iso = now(),
): Promise<KindPrefs> {
  for (const key of Object.keys(KIND_FOR) as (keyof KindPrefs)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    await db.run(
      `INSERT INTO notification_kind_prefs (user_id, kind, enabled, updated_at)
       VALUES ($u, $k, $e, $t)
       ON CONFLICT (user_id, kind)
       DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
      { u: userId, k: KIND_FOR[key], e: value ? 1 : 0, t: at },
    );
  }
  return kindPrefs(db, userId);
}

/**
 * Is this a zone `Intl` knows? A browser reports `Intl…resolvedOptions().timeZone`,
 * so a real one always passes; anything else is stored as nothing rather than
 * as a string that would throw inside `local()` every minute for ever.
 */
export function validZone(zone: unknown): string | null {
  if (typeof zone !== 'string' || zone.length === 0 || zone.length > 64) return null;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

/**
 * The sentence, in the reader's language.
 *
 * Written here rather than in the site's dictionaries for the reason
 * `verification.ts` gives for its email: the server sends it, so the server has
 * to hold it, and the two programs share no code. It promises nothing it cannot
 * see — no figure, no streak length — because the push is composed once and
 * read whenever the browser shows it.
 */
export function reminderCopy(language: string): { title: string; body: string } {
  switch (language) {
    case 'pl':
      return { title: 'Dzisiejsza gra czeka', body: 'Nie grałeś jeszcze dziś. Jedna runda zajmuje minutę.' };
    case 'uz':
      return { title: 'Bugungi o‘yin kutmoqda', body: 'Bugun hali o‘ynamadingiz. Bir raund bir daqiqa oladi.' };
    case 'ru':
      return { title: 'Сегодняшняя игра ждёт', body: 'Вы сегодня ещё не играли. Один раунд — это минута.' };
    case 'uk':
      return { title: 'Сьогоднішня гра чекає', body: 'Ви сьогодні ще не грали. Один раунд — це хвилина.' };
    default:
      return { title: 'Today’s game is waiting', body: 'You have not played today yet. One round takes a minute.' };
  }
}

export interface Reminded {
  /** Switched on, subscribed in a browser, and allowed. */
  candidates: number;
  /** Written to the inbox this run. */
  sent: number;
  /** Of those, queued for the browser (the rest were suppressed — see the row). */
  pushed: number;
}

export async function dailyGameReminder(db: Db, at: Iso = now()): Promise<Reminded> {
  /* The newest web subscription's zone stands for the person: it is the
     browser they most recently said yes in. */
  const rows = await db.all<{ user_id: string; language: string; timezone: string | null }>(
    `SELECT u.id AS user_id, u.language AS language,
            (SELECT t.timezone FROM push_tokens t
              WHERE t.user_id = u.id AND t.platform = 'web' AND t.revoked_at IS NULL
              ORDER BY t.created_at DESC LIMIT 1) AS timezone
       FROM users u
       JOIN notification_kind_prefs p ON p.user_id = u.id AND p.kind = $k AND p.enabled = 1
      WHERE u.status NOT IN ('banned', 'erased')
        AND EXISTS (SELECT 1 FROM push_tokens t
                     WHERE t.user_id = u.id AND t.platform = 'web' AND t.revoked_at IS NULL)`,
    { k: DAILY_GAME },
  );

  let sent = 0;
  let pushed = 0;
  for (const row of rows) {
    const zone = validZone(row.timezone) ?? 'Europe/Warsaw';
    const clock = local(at, zone);
    if (clock.minutes < CONFIG.push.reminderAtMin || clock.minutes >= CONFIG.push.reminderUntilMin) continue;

    const day = clock.day;
    const already = await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM notifications
        WHERE user_id = $u AND kind = $k AND source_ref = $d`,
      { u: row.user_id, k: DAILY_GAME, d: day },
    );
    if (Number(already?.n ?? 0) > 0) continue;

    /* Any round started since their midnight, paid or practice, finished or
       not: somebody who opened a game today has been reminded by the game. */
    const played = await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM game_sessions WHERE user_id = $u AND started_at >= $from`,
      { u: row.user_id, from: localMidnight(day, zone) },
    );
    if (Number(played?.n ?? 0) > 0) continue;

    const copy = reminderCopy(row.language);
    const delivery = await notifications.notify(db, {
      userId: row.user_id,
      mode: 'consumer',
      kind: DAILY_GAME,
      title: copy.title,
      body: copy.body,
      /* The site's own path for Play; the service worker opens it. */
      actionUrl: '/l-earn',
      sourceKind: DAILY_GAME,
      sourceRef: day,
      push: true,
      timezone: zone,
      at,
    });
    sent += 1;
    if (delivery.delivery === 'queued') pushed += 1;
  }

  return { candidates: rows.length, sent, pushed };
}
