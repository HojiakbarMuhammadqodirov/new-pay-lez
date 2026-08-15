/**
 * Referrals and leaderboards — §8.
 *
 * Both are the same shape of problem: a number about other people, shown to
 * somebody, without telling them anything they should not know. So the privacy
 * rule is enforced in the *query*, not in the response mapping — §8.2 says "a
 * user not opted in still sees the board and their own rank, but is not listed
 * to others", and a filter applied after the rows are fetched is a filter one
 * refactor away from being forgotten.
 *
 * The referral half is short because the interesting part of it lives in the
 * gate: the bond is created here at signup and *paid* there, on the invited
 * user's first confirmed scan (§8.1). Paying at signup is what makes referral
 * farming free.
 */
import type { Db } from '../db/db.ts';
import { DomainError } from './errors.ts';
import { newId, referralCode } from './ids.ts';
import { isoWeek, now, plusDays, type Iso } from './time.ts';

/* ══════════════════════════════════════════════════════════════ referrals ══ */

export function codeFor(db: Db, userId: string): string {
  const existing = db.get<{ referral_code: string | null }>(
    `SELECT referral_code FROM users WHERE id = $u`,
    { u: userId },
  );
  if (existing?.referral_code) return existing.referral_code;

  /* Collisions are possible with a four-digit tail, so it retries rather than
     trusting randomness — a duplicated code silently attributes somebody's
     invites to a stranger. */
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = referralCode();
    const taken = db.get<{ id: string }>(`SELECT id FROM users WHERE referral_code = $c`, { c: code });
    if (taken) continue;
    db.run(`UPDATE users SET referral_code = $c WHERE id = $u`, { c: code, u: userId });
    return code;
  }
  throw new DomainError('internal', 'could not allocate a referral code');
}

/**
 * Bind a new account to whoever invited it.
 *
 * Pending until the first confirmed scan. Self-referral is refused here rather
 * than at payout, because a bond that can never pay out is a "2 friends joined"
 * counter that lies to the person reading it.
 */
export function bind(
  db: Db,
  input: { code: string; newUserId: string; at?: Iso },
): { ok: boolean; reason?: string } {
  const at = input.at ?? now();
  const referrer = db.get<{ id: string }>(`SELECT id FROM users WHERE referral_code = $c`, {
    c: input.code,
  });
  if (!referrer) return { ok: false, reason: 'unknown_code' };
  if (referrer.id === input.newUserId) return { ok: false, reason: 'self_referral' };

  const already = db.get<{ id: string }>(`SELECT id FROM referrals WHERE referred_id = $u`, {
    u: input.newUserId,
  });
  if (already) return { ok: false, reason: 'already_referred' };

  db.run(
    `INSERT INTO referrals (id, referrer_id, referred_id, code, status, created_at)
     VALUES ($i, $r, $u, $c, 'pending', $t)`,
    { i: newId('ref'), r: referrer.id, u: input.newUserId, c: input.code, t: at },
  );
  return { ok: true };
}

/** "2 friends joined · 400 points earned" — the display §8.1 asks for. */
export function referralProgress(db: Db, userId: string) {
  const row = db.get<{ joined: number; completed: number; points: number | null }>(
    `SELECT COUNT(*) AS joined,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
            SUM(points_awarded) AS points
       FROM referrals WHERE referrer_id = $u`,
    { u: userId },
  );
  return {
    code: codeFor(db, userId),
    joined: row?.joined ?? 0,
    completed: row?.completed ?? 0,
    pointsEarned: row?.points ?? 0,
  };
}

/* ═══════════════════════════════════════════════════════════ leaderboards ══ */

export interface BoardRow {
  rank: number;
  userId: string;
  /** Display name only — never the real one, never the email (§8.2). */
  name: string;
  avatar: string | null;
  points: number;
  isYou: boolean;
}

export interface Board {
  scope: string;
  week: string;
  rows: BoardRow[];
  /** Present even when the viewer is not listed, which is the opt-out case. */
  you: BoardRow | null;
  /** True when the viewer is playing but has chosen not to be listed. */
  hidden: boolean;
}

/**
 * Points earned from games this week, per user, in a scope.
 *
 * Computed from the ledger rather than from a counter, so it cannot drift and so
 * a reversal (C3) takes the points off the board too. `game_win` only: a board
 * that counted scan earnings would rank whoever spends the most money, which is
 * a different competition and not one to advertise.
 */
function weeklyPoints(db: Db, since: Iso, city?: string) {
  return db.all<{ user_id: string; points: number; name: string; avatar: string | null; opted: number }>(
    `SELECT l.user_id, SUM(l.delta) AS points, u.display_name AS name,
            u.display_avatar AS avatar, u.leaderboard_opt_in AS opted
       FROM points_ledger l JOIN users u ON u.id = l.user_id
      WHERE l.reason = 'game_win' AND l.status = 'committed' AND l.created_at >= $s
        AND u.status = 'active' AND u.deleted_at IS NULL
        AND ($city IS NULL OR u.city = $city)
      GROUP BY l.user_id
      ORDER BY points DESC`,
    { s: since, city: city ?? null },
  );
}

/**
 * The city weekly board.
 *
 * Two populations, one query: everybody counts toward the ranking, only the
 * opted-in are listed. That is why the rank is computed over the full result and
 * *then* the rows are filtered — ranking only the opted-in would tell a hidden
 * player they were third when they were eleventh, which is worse than not
 * showing them at all.
 */
export function cityBoard(
  db: Db,
  input: { userId?: string; city: string; at?: Iso; limit?: number },
): Board {
  const at = input.at ?? now();
  const week = isoWeek(at);
  const rows = weeklyPoints(db, weekStart(at), input.city);

  const ranked = rows.map((row, index) => ({
    rank: index + 1,
    userId: row.user_id,
    name: row.name || 'Player',
    avatar: row.avatar,
    points: row.points,
    isYou: row.user_id === input.userId,
    opted: row.opted === 1,
  }));

  const you = ranked.find((row) => row.isYou) ?? null;
  return {
    scope: `city:${input.city}`,
    week,
    rows: ranked
      .filter((row) => row.opted || row.isYou)
      .slice(0, input.limit ?? 20)
      .map(({ opted: _opted, ...row }) => row),
    you: you ? (({ opted: _o, ...rest }) => rest)(you) : null,
    hidden: Boolean(you && !you.opted),
  };
}

export function friendsBoard(db: Db, input: { userId: string; at?: Iso }): Board {
  const at = input.at ?? now();
  const friends = db.all<{ friend_id: string }>(
    `SELECT friend_id FROM friendships WHERE user_id = $u`,
    { u: input.userId },
  );
  const ids = new Set([input.userId, ...friends.map((f) => f.friend_id)]);
  const rows = weeklyPoints(db, weekStart(at)).filter((row) => ids.has(row.user_id));

  /* No opt-in filter: these are accounts the user connected with deliberately,
     which is a different consent from being listed to a whole city. */
  const ranked = rows.map((row, index) => ({
    rank: index + 1,
    userId: row.user_id,
    name: row.name || 'Player',
    avatar: row.avatar,
    points: row.points,
    isYou: row.user_id === input.userId,
  }));

  return {
    scope: 'friends',
    week: isoWeek(at),
    rows: ranked,
    you: ranked.find((row) => row.isYou) ?? null,
    hidden: false,
  };
}

/** Monday 00:00 UTC of the week containing `at`. */
function weekStart(at: Iso): Iso {
  const date = new Date(at);
  const dayNumber = (date.getUTCDay() + 6) % 7;
  const monday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - dayNumber),
  );
  return monday.toISOString();
}

/**
 * §8.2's weekly job: snapshot, then let the new week start empty.
 *
 * Snapshotting rather than deleting is what makes "last week you were fourth"
 * answerable, and it is also the only record that survives a user later opting
 * out — their historical rank stays a fact, it just stops being *listed*, which
 * the read path already enforces.
 */
export function snapshotWeek(db: Db, at: Iso = now()): number {
  const week = isoWeek(plusDays(at, -1));
  const cities = db.all<{ city: string }>(
    `SELECT DISTINCT city FROM users WHERE city IS NOT NULL AND status = 'active'`,
  );

  let written = 0;
  db.tx(() => {
    for (const { city } of cities) {
      const rows = weeklyPoints(db, weekStart(plusDays(at, -1)), city);
      rows.forEach((row, index) => {
        db.run(
          `INSERT INTO leaderboard_entries (week, scope, user_id, points, rank)
           VALUES ($w, $s, $u, $p, $r)
             ON CONFLICT (week, scope, user_id)
             DO UPDATE SET points = excluded.points, rank = excluded.rank`,
          { w: week, s: `city:${city}`, u: row.user_id, p: row.points, r: index + 1 },
        );
        written += 1;
      });
    }
  });
  return written;
}

export function setLeaderboardOptIn(db: Db, userId: string, optIn: boolean): void {
  db.run(`UPDATE users SET leaderboard_opt_in = $o WHERE id = $u`, { o: optIn, u: userId });
}

/** Friendship is mutual here — a one-way board is a follower list, not friends. */
export function addFriend(db: Db, userId: string, friendId: string, at: Iso = now()): void {
  if (userId === friendId) throw new DomainError('bad_request', 'cannot befriend yourself');
  db.tx(() => {
    db.run(
      `INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES ($u, $f, $t)`,
      { u: userId, f: friendId, t: at },
    );
    db.run(
      `INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES ($f, $u, $t)`,
      { u: userId, f: friendId, t: at },
    );
  });
}
