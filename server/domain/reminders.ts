/**
 * The four pushes a browser gets, each switched on separately in the profile:
 * the daily game reminder, "your energy is full", a referral reward, and "your
 * streak is about to break". The daily reminder is described below; the other
 * three are next to their own functions at the end of this file.
 *
 * ## The daily game reminder
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
import * as games from './games.ts';
import * as notifications from './notifications.ts';
import { local, localMidnight, now, plusDays, plusMinutes, type Iso } from './time.ts';

export const DAILY_GAME = 'daily_game';
export const ENERGY_FULL = 'energy_full';
export const REFERRAL_REWARD = 'referral_reward';
export const GAME_STREAK = 'game_streak';

/** The per-event switches a client can set, by their API name. */
export interface KindPrefs {
  dailyGameReminder: boolean;
  energyFull: boolean;
  referralReward: boolean;
  streakAtRisk: boolean;
}

const KIND_FOR: Record<keyof KindPrefs, string> = {
  dailyGameReminder: DAILY_GAME,
  energyFull: ENERGY_FULL,
  referralReward: REFERRAL_REWARD,
  streakAtRisk: GAME_STREAK,
};

/** No row is "never switched on", which is off. */
export async function kindPrefs(db: Db, userId: string): Promise<KindPrefs> {
  const rows = await db.all<{ kind: string; enabled: number }>(
    `SELECT kind, enabled FROM notification_kind_prefs WHERE user_id = $u`,
    { u: userId },
  );
  const on = (kind: string) => rows.some((row) => row.kind === kind && Number(row.enabled) === 1);
  return {
    dailyGameReminder: on(DAILY_GAME),
    energyFull: on(ENERGY_FULL),
    referralReward: on(REFERRAL_REWARD),
    streakAtRisk: on(GAME_STREAK),
  };
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

/**
 * Everybody who switched `kind` on, has a live **web** subscription, and is not
 * suspended or erased — with the zone of their newest subscription, which
 * stands for the person: it is the browser they most recently said yes in.
 */
async function subscribed(
  db: Db,
  kind: string,
): Promise<Array<{ user_id: string; language: string; timezone: string | null }>> {
  return await db.all<{ user_id: string; language: string; timezone: string | null }>(
    `SELECT u.id AS user_id, u.language AS language,
            (SELECT t.timezone FROM push_tokens t
              WHERE t.user_id = u.id AND t.platform = 'web' AND t.revoked_at IS NULL
              ORDER BY t.created_at DESC LIMIT 1) AS timezone
       FROM users u
       JOIN notification_kind_prefs p ON p.user_id = u.id AND p.kind = $k AND p.enabled = 1
      WHERE u.status NOT IN ('banned', 'erased')
        AND EXISTS (SELECT 1 FROM push_tokens t
                     WHERE t.user_id = u.id AND t.platform = 'web' AND t.revoked_at IS NULL)`,
    { k: kind },
  );
}

export async function dailyGameReminder(db: Db, at: Iso = now()): Promise<Reminded> {
  const rows = await subscribed(db, DAILY_GAME);

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

/* ═══════════════════════════════════════════════════ energy is full ══ */

export function energyFullCopy(language: string): { title: string; body: string } {
  switch (language) {
    case 'pl':
      return { title: 'Energia jest pełna', body: 'Wszystkie rundy czekają. Zagraj, zanim zacznie się marnować.' };
    case 'uz':
      return { title: 'Energiya to‘ldi', body: 'Barcha raundlar sizni kutmoqda. Behuda ketmasidan o‘ynang.' };
    case 'ru':
      return { title: 'Энергия полная', body: 'Все раунды ждут. Сыграйте, пока она не пропадает зря.' };
    case 'uk':
      return { title: 'Енергія повна', body: 'Усі раунди чекають. Зіграйте, поки вона не пропадає марно.' };
    default:
      return { title: 'Your energy is full', body: 'Every round is waiting. Play before it goes to waste.' };
  }
}

/**
 * "Your energy is full" — once per refill.
 *
 * **Became full, not is full.** A tank that is simply full is the state of
 * everybody who has not played for a day, and a push every minute about it is
 * a nag. So it goes out only when the tank was short `energyFullWithinMin`
 * ago and is at the ceiling now, and at most once since the player's last
 * spend: the inbox row created after that spend is the guard, so a refill is
 * announced once however many runs see it.
 *
 * Derived from `games.energyFor`, the same reading the Play screen's battery
 * draws, so the push and the gauge cannot disagree about whether it is full.
 * Quiet hours still apply (`notifications.canPush`): a tank that fills at
 * 03:00 lands in the inbox and is not pushed.
 */
export async function energyFullReminder(db: Db, at: Iso = now()): Promise<Reminded> {
  const rows = await subscribed(db, ENERGY_FULL);
  let sent = 0;
  let pushed = 0;
  for (const row of rows) {
    const nowTank = await games.energyFor(db, row.user_id, at);
    if (nowTank.energy < nowTank.max) continue;
    const before = await games.energyFor(db, row.user_id, plusMinutes(at, -CONFIG.push.energyFullWithinMin));
    if (before.energy >= before.max) continue;

    const spent = await db.get<{ t: string | null }>(
      `SELECT MAX(started_at) AS t FROM game_sessions WHERE user_id = $u AND life_spent > 0`,
      { u: row.user_id },
    );
    if (!spent?.t) continue;
    const already = await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM notifications WHERE user_id = $u AND kind = $k AND created_at >= $t`,
      { u: row.user_id, k: ENERGY_FULL, t: spent.t },
    );
    if (Number(already?.n ?? 0) > 0) continue;

    const copy = energyFullCopy(row.language);
    const delivery = await notifications.notify(db, {
      userId: row.user_id,
      mode: 'consumer',
      kind: ENERGY_FULL,
      title: copy.title,
      body: copy.body,
      actionUrl: '/l-earn',
      sourceKind: ENERGY_FULL,
      sourceRef: spent.t,
      push: true,
      timezone: validZone(row.timezone) ?? 'Europe/Warsaw',
      at,
    });
    sent += 1;
    if (delivery.delivery === 'queued') pushed += 1;
  }
  return { candidates: rows.length, sent, pushed };
}

/* ══════════════════════════════════════════════ the streak is at risk ══ */

export function streakCopy(language: string, streak: number): { title: string; body: string } {
  switch (language) {
    case 'pl':
      return { title: `Twoja seria ${streak} dni zaraz się skończy`, body: 'Zagraj dziś jedną rundę, żeby ją utrzymać.' };
    case 'uz':
      return { title: `${streak} kunlik seriyangiz uzilay deyapti`, body: 'Saqlab qolish uchun bugun bitta raund o‘ynang.' };
    case 'ru':
      return { title: `Ваша серия из ${streak} дн. вот-вот прервётся`, body: 'Сыграйте сегодня один раунд, чтобы её сохранить.' };
    case 'uk':
      return { title: `Ваша серія з ${streak} дн. ось-ось перерветься`, body: 'Зіграйте сьогодні один раунд, щоб її зберегти.' };
    default:
      return {
        title: `Your ${streak}-day streak is about to break`,
        body: 'Play one round today to keep it.',
      };
  }
}

/**
 * "Your streak is about to break" — the evening's last call.
 *
 * **Only when it really would break.** The game streak counts UTC days
 * (`games.applyStreak`): it continues if the last paid round was yesterday and
 * lapses if a whole day passes without one — unless a freeze is held, which
 * absorbs the missed day. So this goes out to a player whose streak is alive,
 * who played yesterday and not yet today, and who holds no freeze. Telling
 * somebody with a freeze that their streak is about to break would be the one
 * sentence here that is not true.
 *
 * At `CONFIG.push.streakAtMin` (20:00) on their clock, before
 * `reminderUntilMin`, once a day — the inbox row keyed by the UTC day is the
 * guard, as it is for the daily reminder.
 */
export async function streakAtRisk(db: Db, at: Iso = now()): Promise<Reminded> {
  const rows = await subscribed(db, GAME_STREAK);
  const today = at.slice(0, 10);
  const yesterday = plusDays(at, -1).slice(0, 10);
  let sent = 0;
  let pushed = 0;
  for (const row of rows) {
    const zone = validZone(row.timezone) ?? 'Europe/Warsaw';
    const clock = local(at, zone);
    if (clock.minutes < CONFIG.push.streakAtMin || clock.minutes >= CONFIG.push.reminderUntilMin) continue;

    const state = await db.get<{ streak: number; freezes: number; last_played: string | null }>(
      `SELECT streak, freezes, last_played FROM player_states WHERE user_id = $u`,
      { u: row.user_id },
    );
    if (!state || Number(state.streak) <= 0) continue;
    if (state.last_played !== yesterday || Number(state.freezes) > 0) continue;

    const already = await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM notifications WHERE user_id = $u AND kind = $k AND source_ref = $d`,
      { u: row.user_id, k: GAME_STREAK, d: today },
    );
    if (Number(already?.n ?? 0) > 0) continue;

    const copy = streakCopy(row.language, Number(state.streak));
    const delivery = await notifications.notify(db, {
      userId: row.user_id,
      mode: 'consumer',
      kind: GAME_STREAK,
      title: copy.title,
      body: copy.body,
      actionUrl: '/l-earn',
      sourceKind: GAME_STREAK,
      sourceRef: today,
      push: true,
      timezone: zone,
      at,
    });
    sent += 1;
    if (delivery.delivery === 'queued') pushed += 1;
  }
  return { candidates: rows.length, sent, pushed };
}

/* ═════════════════════════════════════════════════ a referral paid out ══ */

export function referralCopy(language: string, points: number, invitee: boolean): { title: string; body: string } {
  switch (language) {
    case 'pl':
      return invitee
        ? { title: `+${points} punktów za zaproszenie`, body: 'Twoja pierwsza wizyta się liczy — Ty i osoba, która Cię zaprosiła, dostajecie punkty.' }
        : { title: `+${points} punktów za zaproszenie`, body: 'Osoba, którą zaprosiłeś, odwiedziła lokal partnerski. Punkty są już na Twoim koncie.' };
    case 'uz':
      return invitee
        ? { title: `Taklif uchun +${points} ball`, body: 'Birinchi tashrifingiz hisoblandi — siz ham, sizni taklif qilgan do‘stingiz ham ball oldingiz.' }
        : { title: `Taklif uchun +${points} ball`, body: 'Siz taklif qilgan do‘stingiz hamkor joyga tashrif buyurdi. Ballar hisobingizda.' };
    case 'ru':
      return invitee
        ? { title: `+${points} баллов за приглашение`, body: 'Ваш первый визит засчитан — баллы получили и вы, и тот, кто вас пригласил.' }
        : { title: `+${points} баллов за приглашение`, body: 'Приглашённый вами друг посетил заведение-партнёр. Баллы уже на вашем счёте.' };
    case 'uk':
      return invitee
        ? { title: `+${points} балів за запрошення`, body: 'Ваш перший візит зараховано — бали отримали і ви, і той, хто вас запросив.' }
        : { title: `+${points} балів за запрошення`, body: 'Запрошений вами друг відвідав заклад-партнер. Бали вже на вашому рахунку.' };
    default:
      return invitee
        ? { title: `+${points} points for joining by invite`, body: 'Your first visit counted — you and the friend who invited you have both been paid.' }
        : { title: `+${points} points for an invite`, body: 'The friend you invited visited a partner venue. The points are in your balance.' };
  }
}

/**
 * Tell one side of a referral that it paid — called by `gate.completeReferral`
 * right after the two ledger entries, inside the same transaction.
 *
 * The inbox row is always written: being paid is something a player should be
 * able to find later, on the phone as well. It is **pushed** only when this
 * person switched "Referral reward" on, because that switch is the whole of
 * what they agreed to be interrupted for.
 */
export async function referralReward(
  db: Db,
  input: { userId: string; points: number; invitee: boolean; referralId: string; at: Iso },
): Promise<void> {
  const prefs = await kindPrefs(db, input.userId);
  const person = await db.get<{ language: string; timezone: string | null }>(
    `SELECT u.language AS language,
            (SELECT t.timezone FROM push_tokens t
              WHERE t.user_id = u.id AND t.platform = 'web' AND t.revoked_at IS NULL
              ORDER BY t.created_at DESC LIMIT 1) AS timezone
       FROM users u WHERE u.id = $u`,
    { u: input.userId },
  );
  const copy = referralCopy(person?.language ?? 'en', input.points, input.invitee);
  await notifications.notify(db, {
    userId: input.userId,
    mode: 'consumer',
    kind: REFERRAL_REWARD,
    title: copy.title,
    body: copy.body,
    actionUrl: '/vouchers',
    sourceKind: 'referral',
    sourceRef: input.referralId,
    push: prefs.referralReward,
    timezone: validZone(person?.timezone) ?? 'Europe/Warsaw',
    at: input.at,
  });
}
