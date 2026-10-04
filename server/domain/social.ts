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
import { CONFIG } from '../config.ts';
import type { Db } from '../db/db.ts';
import { randomInt } from 'node:crypto';
import { DomainError, type ErrorCode } from './errors.ts';
import * as ledger from './ledger.ts';
import { newId, referralCode } from './ids.ts';
import { isoWeek, now, plusDays, type Iso } from './time.ts';

/* ══════════════════════════════════════════════════════════════ referrals ══ */

/**
 * Where an invite points. The website answers `/i/:code` with a page that says
 * who sent it and where to get the app; the phone opens the same URL itself
 * when it is installed. One constant, so the app's Copy link, the share sheet
 * and the landing page cannot hand out three different addresses.
 */
export const INVITE_BASE = 'https://www.pay-lez.com/i/';
export const inviteLink = (code: string): string => `${INVITE_BASE}${encodeURIComponent(code)}`;

/**
 * The code somebody typed, the way it is stored.
 *
 * People paste the whole link as often as the code, type it in lower case and
 * leave a space on the end — and every one of those is the same invite. So a
 * trailing path segment is taken from a URL, whitespace and any dash somebody
 * added for legibility go, and the result is
 * upper-cased; the lookup compares upper case on both sides, because the codes
 * imported from the old database were never promised to be.
 */
export function normaliseCode(raw: unknown): string {
  let value = String(raw ?? '').trim();
  value = value.split(/[?#]/)[0].replace(/\/+$/, '');
  const slash = value.lastIndexOf('/');
  if (slash >= 0) value = value.slice(slash + 1);
  return value.replace(/[\s-]+/g, '').toUpperCase();
}

/**
 * "Marta K." — how one person is named to another on this surface.
 *
 * First word of the display name plus the last word's initial, and never the
 * email: a referrer already knows who they invited, and a stranger who guesses
 * a code learns a first name, which is what the landing page is *for*. Empty
 * when there is no name at all, and the client supplies its own "a friend".
 */
export function shortName(displayName: string | null | undefined): string {
  const parts = String(displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  const initial = Array.from(parts[parts.length - 1])[0]?.toUpperCase() ?? '';
  return initial ? `${parts[0]} ${initial}.` : parts[0];
}

export async function codeFor(db: Db, userId: string): Promise<string> {
  const existing = await db.get<{ referral_code: string | null }>(
    `SELECT referral_code FROM users WHERE id = $u`,
    { u: userId },
  );
  if (existing?.referral_code) return existing.referral_code;

  /* Collisions are possible, so it retries rather than trusting randomness — a
     duplicated code silently attributes somebody's invites to a stranger.

     **And it widens.** The old shape is `PY` plus four digits, which is nine
     thousand codes: by the eight-thousandth account twenty tries at four
     digits fail about a third of the time, and this runs inside sign-up, so a
     full space would have been sign-up answering 500. Ten tries at the old
     width keep new codes looking like the old ones for as long as that is
     cheap; after that six digits, then eight. Still digits, because somebody
     reads these aloud across a table. */
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const code = attempt < 10 ? referralCode() : wideCode(attempt < 20 ? 6 : 8);
    const taken = await db.get<{ id: string }>(`SELECT id FROM users WHERE UPPER(referral_code) = $c`, { c: code });
    if (taken) continue;
    await db.run(`UPDATE users SET referral_code = $c WHERE id = $u`, { c: code, u: userId });
    return code;
  }
  throw new DomainError('internal', 'could not allocate a referral code');
}

const wideCode = (digits: number): string => `PY${randomInt(10 ** (digits - 1), 10 ** digits)}`;

/**
 * Why a code cannot be attached to an account. Each is a different sentence
 * on the phone ("this is your own code", "you've already used one"), so each
 * is its own reason rather than one "invalid".
 */
export type BindRefusal =
  | 'unknown_code'
  | 'self_referral'
  | 'already_referred'
  | 'already_visited'
  | 'circular';

interface Referrer {
  id: string;
  display_name: string;
  referral_code: string;
}

/** An active account holding this code, or nothing. */
async function referrerFor(db: Db, code: string): Promise<Referrer | undefined> {
  if (!code) return undefined;
  /* `active` only: a guest's code is a code on a row that is about to be
     merged away, a banned account's invites are not something to pay for, and
     an erased one is nobody. All three read as "no such code". */
  return await db.get<Referrer>(
    `SELECT id, display_name, referral_code FROM users
      WHERE UPPER(referral_code) = $c AND status = 'active' AND deleted_at IS NULL`,
    { c: code },
  );
}

/** Whether this account has ever had a visit confirmed at a counter. */
async function hasVisited(db: Db, userId: string): Promise<boolean> {
  /* `confirmed_at`, not `status = 'committed'`: a visit that was confirmed and
     later reversed still happened, and still spent the moment the reward is
     tied to. */
  const row = await db.get<{ id: string }>(
    `SELECT id FROM transactions WHERE user_id = $u AND confirmed_at IS NOT NULL LIMIT 1`,
    { u: userId },
  );
  return row !== undefined;
}

/**
 * Whether [userId] may be bound to [referrer], and if not why.
 *
 * The rules, and the abuse each one closes:
 *
 * - **not yourself** — two accounts' worth of reward for one person;
 * - **once** — `UNIQUE (referred_id)` says it too, but a refusal with a reason
 *   beats a constraint violation;
 * - **before the first confirmed visit** — the reward *is* the first visit.
 *   A code attached afterwards would pay on the second, which is a visit that
 *   was going to happen anyway and a bonus for having been asked twice;
 * - **no cycles** — A invites B, then B's code is attached to A. Both would be
 *   paid for bringing in the other, which is two people paying each other in
 *   our points. Walked up the chain rather than checked one level deep,
 *   because a ring of three is the same trick with one more account.
 *
 * Only one level ever *pays*: `gate.completeReferral` rewards the referrer and
 * the invitee and nobody above them, so there is no chain to farm upward.
 */
async function refusalFor(db: Db, userId: string, referrer: Referrer | undefined): Promise<BindRefusal | null> {
  if (!referrer) return 'unknown_code';
  if (referrer.id === userId) return 'self_referral';

  const already = await db.get<{ id: string }>(`SELECT id FROM referrals WHERE referred_id = $u`, { u: userId });
  if (already) return 'already_referred';

  if (await hasVisited(db, userId)) return 'already_visited';

  let cursor = referrer.id;
  for (let depth = 0; depth < 64; depth += 1) {
    const up = await db.get<{ referrer_id: string }>(
      `SELECT referrer_id FROM referrals WHERE referred_id = $u`,
      { u: cursor },
    );
    if (!up) break;
    if (up.referrer_id === userId) return 'circular';
    cursor = up.referrer_id;
  }
  return null;
}

/**
 * Bind an account to whoever invited it.
 *
 * Pending until the first confirmed scan. Refused here rather than at payout,
 * because a bond that can never pay out is a "2 friends joined" counter that
 * lies to the person reading it.
 *
 * Sign-up calls this and ignores a refusal — a mistyped code is not a reason
 * to refuse somebody an account. `redeem` below is the path that says why.
 */
export async function bind(
  db: Db,
  input: { code: string; newUserId: string; at?: Iso },
): Promise<{ ok: boolean; reason?: BindRefusal; referrerName?: string }> {
  const at = input.at ?? now();
  const referrer = await referrerFor(db, normaliseCode(input.code));
  const refusal = await refusalFor(db, input.newUserId, referrer);
  if (refusal || !referrer) return { ok: false, reason: refusal ?? 'unknown_code' };

  await db.run(
    `INSERT INTO referrals (id, referrer_id, referred_id, code, status, created_at)
     VALUES ($i, $r, $u, $c, 'pending', $t)`,
    { i: newId('ref'), r: referrer.id, u: input.newUserId, c: referrer.referral_code, t: at },
  );
  return { ok: true, referrerName: shortName(referrer.display_name) };
}

/** The refusal as the HTTP layer says it: a status, a sentence, and `reason`. */
const REFUSALS: Record<BindRefusal, [ErrorCode, string]> = {
  unknown_code: ['not_found', 'that invite code does not exist'],
  self_referral: ['invalid_state', 'that is your own invite code'],
  already_referred: ['already_used', 'an invite code is already on this account'],
  already_visited: ['conflict', 'invite codes can only be added before your first visit'],
  circular: ['conflict', 'that invite would go round in a circle'],
};

/**
 * `POST /v1/referrals/redeem` — attach a code after sign-up.
 *
 * For the person who installed from the store, signed up, and only then found
 * the message with the code in it. Same rules as sign-up, but a refusal is an
 * answer here: the person typed something and is waiting to hear what
 * happened to it. `reason` rides in the error body so the phone can pick the
 * sentence without parsing one.
 */
export async function redeem(
  db: Db,
  input: { userId: string; code: string; at?: Iso },
): Promise<{ referredBy: { name: string }; status: 'joined'; inviteeReward: number; referrerReward: number }> {
  const user = await db.get<{ status: string }>(`SELECT status FROM users WHERE id = $u`, { u: input.userId });
  /* A guest is a device, not a person yet. Its bond would sit on a row that
     `accounts.merge` erases — so the code is carried into sign-up instead,
     where it lands on the account that will actually visit. */
  if (!user || user.status !== 'active') {
    throw new DomainError('forbidden', 'create an account to use an invite code', { reason: 'guest' });
  }

  const result = await db.tx(async () => await bind(db, { code: input.code, newUserId: input.userId, at: input.at }));
  if (!result.ok) {
    const reason = result.reason ?? 'unknown_code';
    const [code, message] = REFUSALS[reason];
    throw new DomainError(code, message, { reason, field: 'code' });
  }
  return {
    referredBy: { name: result.referrerName ?? '' },
    status: 'joined',
    inviteeReward: CONFIG.earn.inviteeJoin,
    referrerReward: CONFIG.earn.referrerFirstVisit,
  };
}

/**
 * `GET /v1/referrals/codes/:code` — who a code belongs to, for somebody who is
 * not signed in yet: the landing page's "Marta K. invited you" and the app's
 * confirm screen before sign-up. The short name and the offer, nothing else.
 */
export async function lookup(db: Db, raw: string) {
  const referrer = await referrerFor(db, normaliseCode(raw));
  if (!referrer) throw new DomainError('not_found', 'that invite code does not exist', { field: 'code' });
  const code = referrer.referral_code;
  return {
    code,
    name: shortName(referrer.display_name),
    link: inviteLink(code),
    inviteeReward: CONFIG.earn.inviteeJoin,
    referrerReward: CONFIG.earn.referrerFirstVisit,
  };
}

/**
 * `GET /v1/referrals` — "2 friends joined · 200 points earned", the people
 * behind it, and whether this account can still attach a code of its own.
 */
export async function referralProgress(db: Db, userId: string) {
  const row = await db.get<{ joined: number; completed: number | null }>(
    `SELECT COUNT(*) AS joined,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM referrals WHERE referrer_id = $u AND status <> 'rejected'`,
    { u: userId },
  );

  /* **What this account was paid, from the ledger.** It used to be
     `SUM(points_awarded)`, and `points_awarded` is what a bond cost *both
     sides together* — so a referrer with two completed invites read "400
     points earned" when 200 had reached them, and the friend milestone, the
     biggest figure in the whole programme, was not in it at all. The ledger is
     what was actually paid, reversals included. */
  const earned = await db.get<{ n: number | null }>(
    `SELECT SUM(l.delta) AS n
       FROM points_ledger l
      WHERE l.user_id = $u AND l.status = 'committed'
        AND (l.source_kind = 'friend_milestone'
             OR (l.source_kind = 'referral'
                 AND l.source_ref IN (SELECT id FROM referrals WHERE referrer_id = $u)))
        /* An entry an operator reversed (rejectReferral) was taken back. */
        AND l.id NOT IN (SELECT source_ref FROM points_ledger
                          WHERE reason = 'reversal' AND source_ref IS NOT NULL)`,
    { u: userId },
  );

  /* The people, newest first. A deleted invitee (`referred_id` set null by the
     cascade) still counts above — they did join — but has nobody to name, so
     is not listed. */
  const people = await db.all<{
    display_name: string | null;
    status: string;
    created_at: string;
    completed_at: string | null;
    paid: number | null;
  }>(
    `SELECT u.display_name, r.status, r.created_at, r.completed_at,
            (SELECT SUM(l.delta) FROM points_ledger l
              WHERE l.user_id = $u AND l.source_kind = 'referral' AND l.source_ref = r.id
                AND l.status = 'committed'
                AND l.id NOT IN (SELECT source_ref FROM points_ledger
                                  WHERE reason = 'reversal' AND source_ref IS NOT NULL)) AS paid
       FROM referrals r
       JOIN users u ON u.id = r.referred_id
      WHERE r.referrer_id = $u AND r.status IN ('pending', 'completed')
      ORDER BY r.created_at DESC
      LIMIT 200`,
    { u: userId },
  );

  const own = await db.get<{ status: string; referrer_name: string | null }>(
    `SELECT r.status, u.display_name AS referrer_name
       FROM referrals r LEFT JOIN users u ON u.id = r.referrer_id
      WHERE r.referred_id = $u`,
    { u: userId },
  );
  const me = await db.get<{ status: string }>(`SELECT status FROM users WHERE id = $u`, { u: userId });

  const code = await codeFor(db, userId);
  return {
    code,
    link: inviteLink(code),
    joined: Number(row?.joined ?? 0),
    completed: Number(row?.completed ?? 0),
    pointsEarned: Number(earned?.n ?? 0),
    /* What the invite pays, from config (rulebook §7.3), so the app's share
       sheet and referral screen print the server's figures instead of either
       inventing one or saying "points" with no number. */
    referrerReward: CONFIG.earn.referrerFirstVisit,
    inviteeReward: CONFIG.earn.inviteeJoin,
    friendMilestoneAt: CONFIG.earn.friendMilestoneAt,
    friendMilestone: CONFIG.earn.friendMilestone,
    people: people.map((p) => ({
      name: shortName(p.display_name),
      status: p.status === 'completed' ? ('completed' as const) : ('joined' as const),
      joinedAt: p.created_at,
      completedAt: p.completed_at,
      pointsAwarded: Number(p.paid ?? 0),
    })),
    /* The other direction: who invited *this* account, and whether it can
       still add a code. Decided here so the phone offers "Have an invite
       code?" exactly when `POST /v1/referrals/redeem` would take one. */
    referredBy: own
      ? {
          name: shortName(own.referrer_name),
          status: own.status === 'completed' ? ('completed' as const) : ('joined' as const),
        }
      : null,
    canRedeem: !own && me?.status === 'active' && !(await hasVisited(db, userId)),
  };
}

/**
 * Void a referral, and take back what it paid.
 *
 * The Terms promise this ("referral points awarded in error or through
 * fraudulent activity will be reversed") and `rejected` sat in the schema's
 * CHECK with nothing ever writing it. A pending bond is simply closed. A
 * completed one also has its two payouts reversed through `ledger.reverse` —
 * compensating entries, never edits, so the history still shows what was paid
 * and when it was taken back.
 *
 * The five-friend milestone is **not** reversed here: it was earned by five
 * bonds together, and whether voiding one of them should claw it back is a
 * judgement an operator makes with the ledger open, by reversing that entry.
 */
export async function rejectReferral(
  db: Db,
  input: { referralId: string; note: string; at?: Iso },
): Promise<{ id: string; previous: 'pending' | 'completed'; reversed: string[] }> {
  const at = input.at ?? now();
  return await db.tx(async () => {
    const bond = await db.get<{ id: string; status: string }>(
      `SELECT id, status FROM referrals WHERE id = $i`,
      { i: input.referralId },
    );
    if (!bond) throw new DomainError('not_found', 'no such referral');
    if (bond.status === 'rejected') throw new DomainError('conflict', 'that referral is already rejected');

    const reversed: string[] = [];
    if (bond.status === 'completed') {
      const entries = await db.all<{ id: string }>(
        `SELECT id FROM points_ledger
          WHERE reason = 'referral' AND source_kind = 'referral' AND source_ref = $b
            AND id NOT IN (SELECT source_ref FROM points_ledger WHERE reason = 'reversal' AND source_ref IS NOT NULL)`,
        { b: bond.id },
      );
      for (const entry of entries) {
        await ledger.reverse(db, entry.id, input.note, at);
        reversed.push(entry.id);
      }
    }
    await db.run(`UPDATE referrals SET status = 'rejected' WHERE id = $i`, { i: bond.id });
    return { id: bond.id, previous: bond.status as 'pending' | 'completed', reversed };
  });
}

/** The operator's list — newest first, both people named. */
export async function listReferrals(db: Db, input: { status?: string; limit?: number }) {
  return await db.all(
    `SELECT r.id, r.status, r.code, r.points_awarded, r.created_at, r.completed_at,
            r.referrer_id, a.display_name AS referrer_name, a.email AS referrer_email,
            r.referred_id, b.display_name AS referred_name, b.email AS referred_email
       FROM referrals r
       JOIN users a ON a.id = r.referrer_id
       LEFT JOIN users b ON b.id = r.referred_id
      WHERE ($s IS NULL OR r.status = $s)
      ORDER BY r.created_at DESC
      LIMIT $l`,
    { s: input.status ?? null, l: Math.min(Math.max(input.limit ?? 100, 1), 500) },
  );
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
/*
 * **Every selected column that is not aggregated is named in the GROUP BY.**
 *
 * SQLite allows a bare `u.display_name` beside a `SUM()` and picks an arbitrary
 * row for it. Postgres refuses: `42803: column "u.display_name" must appear in
 * the GROUP BY clause or be used in an aggregate function`. All three
 * leaderboards — global, city and country — answered 500 on the live database
 * for as long as it has been Postgres, while every check here stayed green,
 * because `verify:api` runs on SQLite where the loose form is legal. It is the
 * same shape as the `rowid` bug and the same reason it hid.
 *
 * Grouping by the user's id alone looks like it should be enough — the join is
 * on the primary key, so the three columns are functionally dependent on it —
 * but Postgres only recognises that when the grouped column *is* that table's
 * key, and this groups by `l.user_id`, which belongs to the ledger rather than
 * to `users`. Naming them is the portable form and costs nothing: all three are
 * constant within a user.
 *
 * The comment lives out here rather than inside the query on purpose. It wants
 * to quote the error, the error contains backticks, and a backtick inside a
 * template literal ends the string — the same trap the shaders carry a warning
 * about in the root `CLAUDE.md`.
 */
async function weeklyPoints(db: Db, since: Iso, where: { city?: string; country?: string } = {}) {
  return await db.all<{ user_id: string; points: number; name: string; avatar: string | null; opted: number }>(
    `SELECT l.user_id, SUM(l.delta) AS points, u.display_name AS name,
            u.display_avatar AS avatar, u.leaderboard_opt_in AS opted
       FROM points_ledger l JOIN users u ON u.id = l.user_id
      WHERE l.reason = 'game_win' AND l.status = 'committed' AND l.created_at >= $s
        AND u.status = 'active' AND u.deleted_at IS NULL
        AND ($city IS NULL OR u.city = $city)
        AND ($country IS NULL OR u.country_code = $country)
      GROUP BY l.user_id, u.display_name, u.display_avatar, u.leaderboard_opt_in
      ORDER BY points DESC`,
    { s: since, city: where.city ?? null, country: where.country ?? null },
  );
}

/**
 * The three scopes a weekly board can have.
 *
 * `global` is not a degenerate city — it is the one that always has an answer.
 * A player who skipped the city question, or who lives somewhere with four
 * other players, is on a board of one either way; ranking everybody together
 * is the scope that is honest at the size this product actually is. The other
 * two get more interesting as it grows, which is the opposite trajectory, and
 * that is why all three exist rather than whichever one currently looks best.
 */
export const SCOPES = ['city', 'country', 'global'] as const;
export type Scope = (typeof SCOPES)[number];

export const isScope = (value: string): value is Scope =>
  (SCOPES as readonly string[]).includes(value);

/**
 * A weekly board, in one of the three scopes.
 *
 * Two populations, one query: everybody counts toward the ranking, only the
 * opted-in are listed. That is why the rank is computed over the full result and
 * *then* the rows are filtered — ranking only the opted-in would tell a hidden
 * player they were third when they were eleventh, which is worse than not
 * showing them at all.
 *
 * **A scope with nothing to filter on falls back to global rather than to
 * empty.** A player who never answered the city question asking for their city
 * board is asking a question with no answer; returning an empty table would
 * read as "nobody in your city is playing", which is a claim about other people
 * rather than about a blank field. The scope in the response says which board
 * actually came back, so a client can label it honestly instead of guessing.
 */
export async function board(
  db: Db,
  input: {
    userId?: string;
    scope: Scope;
    city?: string | null;
    country?: string | null;
    at?: Iso;
    limit?: number;
  },
): Promise<Board> {
  const at = input.at ?? now();
  const week = isoWeek(at);

  const city = input.scope === 'city' ? (input.city ?? null) : null;
  const country = input.scope === 'country' ? (input.country ?? null) : null;
  /* What was asked for, versus what could be answered. */
  const effective: Scope =
    input.scope === 'city' && !city ? 'global'
      : input.scope === 'country' && !country ? 'global'
        : input.scope;

  const rows = await weeklyPoints(db, weekStart(at), {
    city: city ?? undefined,
    country: country ?? undefined,
  });

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
    scope:
      effective === 'city' ? `city:${city}`
        : effective === 'country' ? `country:${country}`
          : 'global',
    week,
    rows: ranked
      .filter((row) => row.opted || row.isYou)
      .slice(0, input.limit ?? 20)
      .map(({ opted: _opted, ...row }) => row),
    you: you ? (({ opted: _o, ...rest }) => rest)(you) : null,
    hidden: Boolean(you && !you.opted),
  };
}

export async function friendsBoard(db: Db, input: { userId: string; at?: Iso }): Promise<Board> {
  const at = input.at ?? now();
  const friends = await db.all<{ friend_id: string }>(
    `SELECT friend_id FROM friendships WHERE user_id = $u`,
    { u: input.userId },
  );
  const ids = new Set([input.userId, ...friends.map((f) => f.friend_id)]);
  const rows = (await weeklyPoints(db, weekStart(at))).filter((row) => ids.has(row.user_id));

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
export async function snapshotWeek(db: Db, at: Iso = now()): Promise<number> {
  const week = isoWeek(plusDays(at, -1));
  const cities = await db.all<{ city: string }>(
    `SELECT DISTINCT city FROM users WHERE city IS NOT NULL AND status = 'active'`,
  );

  let written = 0;
  await db.tx(async () => {
    for (const { city } of cities) {
      const rows = await weeklyPoints(db, weekStart(plusDays(at, -1)), { city });
      for (const [index, row] of rows.entries()) {
        await db.run(
          `INSERT INTO leaderboard_entries (week, scope, user_id, points, rank)
           VALUES ($w, $s, $u, $p, $r)
             ON CONFLICT (week, scope, user_id)
             DO UPDATE SET points = excluded.points, rank = excluded.rank`,
          { w: week, s: `city:${city}`, u: row.user_id, p: row.points, r: index + 1 },
        );
        written += 1;
      };
    }
  });
  return written;
}

export async function setLeaderboardOptIn(db: Db, userId: string, optIn: boolean): Promise<void> {
  await db.run(`UPDATE users SET leaderboard_opt_in = $o WHERE id = $u`, { o: optIn, u: userId });
}

/** Friendship is mutual here — a one-way board is a follower list, not friends. */
export async function addFriend(db: Db, userId: string, friendId: string, at: Iso = now()): Promise<void> {
  if (userId === friendId) throw new DomainError('bad_request', 'cannot befriend yourself');
  await db.tx(async () => {
    await db.run(
      `INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES ($u, $f, $t)`,
      { u: userId, f: friendId, t: at },
    );
    await db.run(
      `INSERT OR IGNORE INTO friendships (user_id, friend_id, created_at) VALUES ($f, $u, $t)`,
      { u: userId, f: friendId, t: at },
    );
  });
}
