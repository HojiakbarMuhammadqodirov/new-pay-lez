/**
 * Consent, and the GDPR routines that hang off it — §1.3, §1.4, Part E.
 *
 * Two different consents live here and conflating them is the mistake the spec
 * spends a whole section preventing:
 *
 *   * **Account consent** (§1.3) is the terms and privacy policy: what you agree
 *     to in order to have an account at all. Aggregate analytics are covered by
 *     it, protected by the minimum cohort.
 *   * **Data-sharing consent** (§1.4) is a *separate, granular, revocable* grant
 *     to one specific venue, letting that venue see you individually. It is not
 *     part of the account terms and cannot be bundled into them — sharing your
 *     spending with a third-party business is a materially different processing
 *     purpose, which is why it is versioned and audited independently.
 *
 * Revocation is a timestamp, never a delete. "The system records the revocation
 * timestamp so behaviour before and after is auditable" is the requirement, and
 * a deleted grant makes the question unanswerable.
 */
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import { DomainError } from './errors.ts';
import { newId } from './ids.ts';
import { now, type Iso } from './time.ts';

export type ConsentKind = 'terms' | 'privacy' | 'marketing' | 'analytics';

export function record(
  db: Db,
  input: { userId: string; kind: ConsentKind; granted: boolean; source?: string; at?: Iso },
): void {
  const at = input.at ?? now();
  db.run(
    `INSERT INTO consent_records (id, user_id, kind, policy_version, granted, recorded_at, source)
     VALUES ($i, $u, $k, $p, $g, $t, $s)`,
    {
      i: newId('con'),
      u: input.userId,
      k: input.kind,
      p: CONFIG.privacy.policyVersion,
      g: input.granted,
      t: at,
      s: input.source ?? null,
    },
  );
}

/** The current answer for one kind: the latest record wins. */
export function has(db: Db, userId: string, kind: ConsentKind): boolean {
  const row = db.get<{ granted: number }>(
    `SELECT granted FROM consent_records WHERE user_id = $u AND kind = $k
      ORDER BY recorded_at DESC LIMIT 1`,
    { u: userId, k: kind },
  );
  return row?.granted === 1;
}

/* ═════════════════════════════════════════ §1.4 the per-venue data sharing ══ */

export function grantSharing(
  db: Db,
  input: { userId: string; venueId: string; scope?: string; at?: Iso },
): string {
  const at = input.at ?? now();
  const existing = db.get<{ id: string }>(
    `SELECT id FROM data_sharing_consents
      WHERE user_id = $u AND venue_id = $v AND revoked_at IS NULL`,
    { u: input.userId, v: input.venueId },
  );
  if (existing) return existing.id;

  const id = newId('dsc');
  db.run(
    `INSERT INTO data_sharing_consents
       (id, user_id, venue_id, scope, granted_at, policy_version)
     VALUES ($i, $u, $v, $s, $t, $p)`,
    {
      i: id,
      u: input.userId,
      v: input.venueId,
      s: input.scope ?? 'venue_profile',
      t: at,
      p: CONFIG.privacy.policyVersion,
    },
  );
  return id;
}

/**
 * Withdraw. New identified data stops flowing to that venue immediately.
 *
 * "Immediately" is enforced by the read path — every identified endpoint joins
 * against an *active* grant — so this function has nothing to clean up. That is
 * the design working: a revocation that had to go and delete rows from a dozen
 * tables would be a revocation with a dozen places to be incomplete.
 */
export function revokeSharing(db: Db, userId: string, venueId: string, at: Iso = now()): boolean {
  return (
    db.run(
      `UPDATE data_sharing_consents SET revoked_at = $t
        WHERE user_id = $u AND venue_id = $v AND revoked_at IS NULL`,
      { t: at, u: userId, v: venueId },
    ).changes > 0
  );
}

export const sharingWith = (db: Db, userId: string) =>
  db.all<{ venue_id: string; name: string; granted_at: string }>(
    `SELECT d.venue_id, v.name, d.granted_at FROM data_sharing_consents d
       JOIN venues v ON v.id = d.venue_id
      WHERE d.user_id = $u AND d.revoked_at IS NULL ORDER BY d.granted_at DESC`,
    { u: userId },
  );

/**
 * The one predicate every identified-customer endpoint must pass through.
 *
 * Exported and named so that a code review can grep for it: B9a calls the rule
 * "a hard query-layer rule, not a UI toggle", and the way to keep it that way is
 * for there to be exactly one function that answers it.
 */
export const hasSharingGrant = (db: Db, userId: string, venueId: string): boolean =>
  Boolean(
    db.get<{ id: string }>(
      `SELECT id FROM data_sharing_consents
        WHERE user_id = $u AND venue_id = $v AND revoked_at IS NULL`,
      { u: userId, v: venueId },
    ),
  );

/* ══════════════════════════════════════════════════════════ §1.3 GDPR ══ */

/**
 * Everything the platform holds about one person, as a JSON document.
 *
 * Explicitly includes the consent records themselves — a data export that
 * cannot tell you what you agreed to and when is missing the part somebody
 * exercising their rights is most likely asking about.
 */
export function exportUser(db: Db, userId: string): Record<string, unknown> {
  const one = (sql: string) => db.get(sql, { u: userId });
  const many = (sql: string) => db.all(sql, { u: userId });

  return {
    exportedAt: now(),
    policyVersion: CONFIG.privacy.policyVersion,
    account: one(`SELECT id, email, display_name, language, city, country_code, points_cache,
                         leaderboard_opt_in, referral_code, trust_tier, status, created_at
                    FROM users WHERE id = $u`),
    roles: many(`SELECT role, granted_at FROM user_roles WHERE user_id = $u`),
    consents: many(`SELECT kind, policy_version, granted, recorded_at, source
                      FROM consent_records WHERE user_id = $u ORDER BY recorded_at`),
    dataSharing: many(`SELECT venue_id, scope, granted_at, revoked_at, policy_version
                         FROM data_sharing_consents WHERE user_id = $u`),
    points: many(`SELECT id, delta, reason, source_kind, source_ref, venue_id, multiplier,
                         status, created_at, expires_at
                    FROM points_ledger WHERE user_id = $u ORDER BY created_at`),
    transactions: many(`SELECT id, venue_id, intent, status, amount_minor, currency,
                               points_granted, discount_minor, opened_at, confirmed_at
                          FROM transactions WHERE user_id = $u ORDER BY opened_at`),
    visits: many(`SELECT venue_id, local_day, amount_minor, created_at FROM venue_visits WHERE user_id = $u`),
    vouchers: many(`SELECT id, venue_id, discount_pct, points_spent, code, status, issued_at,
                           expires_at, redeemed_at FROM issued_vouchers WHERE user_id = $u`),
    rewards: many(`SELECT id, venue_id, label, status, earned_at, expires_at, redeemed_at
                     FROM earned_rewards WHERE user_id = $u`),
    stampCards: many(`SELECT campaign_id, venue_id, stamps, cycles, joined_at FROM stamp_cards WHERE user_id = $u`),
    games: many(`SELECT id, game_type, score, answered, correct, started_at, finished_at
                   FROM game_sessions WHERE user_id = $u ORDER BY started_at`),
    player: one(`SELECT streak, longest_streak, freezes, answered, correct, last_played
                   FROM player_states WHERE user_id = $u`),
    referrals: many(`SELECT id, referred_email, status, points_awarded, created_at
                       FROM referrals WHERE referrer_id = $u`),
    notifications: many(`SELECT kind, title, body, delivery, created_at, read_at
                           FROM notifications WHERE user_id = $u ORDER BY created_at`),
    community: one(`SELECT * FROM community_profiles WHERE user_id = $u`),
  };
}

/**
 * Erasure — §1.3's "cascade or anonymise".
 *
 * It anonymises rather than deleting, and the reason is the ledger: an
 * append-only record of value moving cannot have rows removed from it without
 * making every balance downstream unverifiable, and a venue's month of
 * aggregates cannot silently lose a customer's visits without its own reports
 * changing retroactively. So the *person* is erased — name, email, city, the
 * community profile, the push tokens, the sessions — and what remains is a
 * number that used to belong to somebody.
 *
 * The things that genuinely are personal and serve no accounting purpose *are*
 * deleted: profiles, notifications, device links, push tokens.
 */
export function eraseUser(db: Db, userId: string, at: Iso = now()): { erased: true } {
  const user = db.get<{ id: string }>(`SELECT id FROM users WHERE id = $u`, { u: userId });
  if (!user) throw new DomainError('not_found', 'user not found');

  db.tx(() => {
    db.run(
      /* The username goes with the rest, and both halves of it.

         It is the one field here a person chooses for themselves, so it is the
         one most likely to be their real name or a handle they use elsewhere —
         leaving it on an erased row is the leak this routine exists to prevent.
         And `username_norm` is what the unique index is on, so keeping it would
         also reserve the handle for ever against an account nobody can sign
         into: erasure would quietly cost the next person their name. */
      `UPDATE users
          SET email = NULL, email_norm = NULL, display_name = 'Deleted account',
              username = NULL, username_norm = NULL,
              phone = NULL, birth_date = NULL, birth_date_set_at = NULL, headline = NULL,
              password_hash = NULL, city = NULL, country_code = NULL, display_avatar = NULL,
              referral_code = NULL, leaderboard_opt_in = 0, status = 'erased',
              deleted_at = $t, updated_at = $t
        WHERE id = $u`,
      { t: at, u: userId },
    );
    db.run(`DELETE FROM community_profiles WHERE user_id = $u`, { u: userId });
    db.run(`DELETE FROM notifications WHERE user_id = $u`, { u: userId });
    db.run(`DELETE FROM push_tokens WHERE user_id = $u`, { u: userId });
    db.run(`DELETE FROM device_users WHERE user_id = $u`, { u: userId });
    db.run(`DELETE FROM sessions WHERE user_id = $u`, { u: userId });
    db.run(`DELETE FROM friendships WHERE user_id = $u OR friend_id = $u`, { u: userId });
    /* Every active sharing grant ends with the account: a venue must not keep
       receiving identified data about somebody who no longer exists. */
    db.run(
      `UPDATE data_sharing_consents SET revoked_at = COALESCE(revoked_at, $t) WHERE user_id = $u`,
      { t: at, u: userId },
    );
    /* The erasure itself is a consent-relevant event and is recorded as one. */
    db.run(
      `INSERT INTO consent_records (id, user_id, kind, policy_version, granted, recorded_at, source)
       VALUES ($i, $u, 'privacy', $p, 0, $t, 'erasure')`,
      { i: newId('con'), u: userId, p: CONFIG.privacy.policyVersion, t: at },
    );
  });

  return { erased: true };
}
