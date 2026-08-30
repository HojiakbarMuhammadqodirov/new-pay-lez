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
 * What an erasure writes into one column of `users`.
 *
 * `null` is the interesting one: it means *this column is personal data*, which
 * is the same fact the export reads off this table one field over.
 */
export type ErasureRule =
  /** Personal, and nullable, so it simply goes. */
  | { readonly write: 'null' }
  /** Personal but `NOT NULL` — a neutral constant stands in for it. */
  | { readonly write: 'value'; readonly value: string | number }
  /** The tombstone: written with the erasure's own instant. */
  | { readonly write: 'at' }
  /**
   * Survives. Four kinds of survivor qualify and nothing else does;
   * `ERASURE_KEEPS` in `verify.ts` names them, and is the independently written
   * statement of this same set.
   */
  | { readonly write: 'keep' };

/** Whether the export carries the column, and — when it does not — why not. */
export type DisclosureRule =
  | { readonly show: true }
  /**
   * An authentication secret rather than a fact about the person. An export is
   * a document that gets emailed to whoever asked for it and left in a
   * downloads folder; a scrypt hash in one is an offline cracking target for an
   * account that still works. Article 15(4) is the hook — a copy must not
   * adversely affect the rights and freedoms of others, and the others here are
   * everyone who shares that password on some other service.
   */
  | { readonly show: false; readonly reason: 'credential' }
  /**
   * A normalised copy of another column, which the export *does* carry. Adding
   * it would write one fact twice and imply the platform holds four identifiers
   * where it holds two. `of` is checked: a duplicate must name a column that is
   * itself disclosed, or the omission is hiding something.
   */
  | { readonly show: false; readonly reason: 'duplicate'; readonly of: string };

export interface UserColumn {
  /** Exactly as `PRAGMA table_info(users)` spells it. */
  readonly column: string;
  readonly erase: ErasureRule;
  readonly disclose: DisclosureRule;
}

const SHOW: DisclosureRule = { show: true };
const NULLED: ErasureRule = { write: 'null' };
const KEPT: ErasureRule = { write: 'keep' };
const STAMPED: ErasureRule = { write: 'at' };

/**
 * Every column of `users`, and what each of the two GDPR routines does with it.
 *
 * **Article 15 and Article 17 are one question asked from two sides** — *what do
 * you hold about me*, and *stop holding it* — so they act on one set of columns,
 * and both statements are generated from this list. They used to be two
 * hand-written pieces of SQL in this file and they had already drifted: the
 * erasure cleared `username`, `phone`, `birth_date`, `display_avatar` and
 * `occupation`, and the export did not mention any of them. That is the worse
 * direction of the two. An erasure that misses a column at least leaves the
 * person something to complain about later; an export that under-reports is
 * read as complete, because nothing in the document says a column exists.
 *
 * Three invariants tie the two halves together, and `verify.ts` checks all three
 * against `PRAGMA table_info(users)` rather than against a copy of this list:
 *
 *   1. this list covers the table exactly — every column once, no strangers;
 *   2. everything the erasure clears is in the export, unless it carries one of
 *      the two stated reasons above;
 *   3. everything that *survives* an erasure is in the export too — a column
 *      that is neither disclosed nor cleared is data held about a person that
 *      neither right reaches, which is the shape of the bug this replaced.
 *
 * So a column added to the schema fails the suite until somebody decides where
 * it belongs, and the decision is made once, for both rights.
 */
export const USER_COLUMNS: readonly UserColumn[] = [
  { column: 'id', erase: KEPT, disclose: SHOW },
  { column: 'email', erase: NULLED, disclose: SHOW },
  { column: 'email_norm', erase: NULLED, disclose: { show: false, reason: 'duplicate', of: 'email' } },
  /* Personal, and `NOT NULL`, so erasure writes the absence of a name rather
     than removing one. 'Deleted account' is not data about anybody. */
  { column: 'display_name', erase: { write: 'value', value: 'Deleted account' }, disclose: SHOW },
  /* The handle goes on erasure, and both halves of it.

     It is the one field here a person chooses for themselves, so it is the one
     most likely to be their real name or a handle they use elsewhere — leaving
     it on an erased row is the leak that routine exists to prevent. And
     `username_norm` is what the unique index is on, so keeping it would also
     reserve the handle for ever against an account nobody can sign into:
     erasure would quietly cost the next person their name. */
  { column: 'username', erase: NULLED, disclose: SHOW },
  { column: 'username_norm', erase: NULLED, disclose: { show: false, reason: 'duplicate', of: 'username' } },
  { column: 'password_hash', erase: NULLED, disclose: { show: false, reason: 'credential' } },
  { column: 'auth_provider', erase: KEPT, disclose: SHOW },
  /* Google's `sub` — a permanent, cross-service identifier of a natural person,
     and the single most identifying thing on this row. It was the column the
     erasure was missing once already, and it survived unnoticed because nothing
     reads it on an erased account: it was invisible rather than useful.

     Which is exactly why it is disclosed as well as cleared. The column it
     would be worst to leave out of an access request is the one whose absence
     is hardest to notice. */
  { column: 'provider_ref', erase: NULLED, disclose: SHOW },
  { column: 'language', erase: KEPT, disclose: SHOW },
  { column: 'city', erase: NULLED, disclose: SHOW },
  { column: 'country_code', erase: NULLED, disclose: SHOW },
  { column: 'phone', erase: NULLED, disclose: SHOW },
  { column: 'birth_date', erase: NULLED, disclose: SHOW },
  { column: 'birth_date_set_at', erase: NULLED, disclose: SHOW },
  /* A bare count, on a row that no longer holds a birthday. `NOT NULL`, and it
     discloses only that one was once written. */
  { column: 'birth_date_changes', erase: KEPT, disclose: SHOW },
  { column: 'occupation', erase: NULLED, disclose: SHOW },
  /* The two once-only grant guards. They are accounting — what stops a welcome
     gift and a completion bonus being paid twice — which is the category this
     module's erasure note says survives. */
  { column: 'onboarded_at', erase: KEPT, disclose: SHOW },
  { column: 'profile_completed_at', erase: KEPT, disclose: SHOW },
  { column: 'points_cache', erase: KEPT, disclose: SHOW },
  /* `NOT NULL`, and erasure turns it off rather than keeping a preference on
     behalf of somebody who is no longer on any board. */
  { column: 'leaderboard_opt_in', erase: { write: 'value', value: 0 }, disclose: SHOW },
  { column: 'display_avatar', erase: NULLED, disclose: SHOW },
  { column: 'referral_code', erase: NULLED, disclose: SHOW },
  { column: 'trust_tier', erase: KEPT, disclose: SHOW },
  { column: 'status', erase: { write: 'value', value: 'erased' }, disclose: SHOW },
  { column: 'created_at', erase: KEPT, disclose: SHOW },
  { column: 'updated_at', erase: STAMPED, disclose: SHOW },
  { column: 'deleted_at', erase: STAMPED, disclose: SHOW },
];

/* Both statements below interpolate these names into SQL. They are literals in
   the list above rather than input, but the guard costs one pass at module load
   and turns a future typo — or a name arriving from somewhere less trustworthy
   — into a crash on boot rather than a malformed query at the moment somebody
   exercises a right. */
for (const { column } of USER_COLUMNS) {
  if (!/^[a-z][a-z0-9_]*$/.test(column)) throw new Error(`unsafe column name: ${column}`);
}

/** The `SELECT` list of the export's `account` block, in schema order. */
const DISCLOSED = USER_COLUMNS.filter((c) => c.disclose.show)
  .map((c) => c.column)
  .join(', ');

/** The erasure's whole `SET` clause, and the constants it substitutes. */
const ERASURE = ((): { set: string; params: Record<string, string | number> } => {
  const clauses: string[] = [];
  const params: Record<string, string | number> = {};
  for (const { column, erase } of USER_COLUMNS) {
    switch (erase.write) {
      case 'keep':
        break;
      case 'null':
        clauses.push(`${column} = NULL`);
        break;
      case 'at':
        clauses.push(`${column} = $t`);
        break;
      case 'value':
        params[`v_${column}`] = erase.value;
        clauses.push(`${column} = $v_${column}`);
        break;
    }
  }
  return { set: clauses.join(', '), params };
})();

/**
 * Everything the platform holds about one person, as a JSON document.
 *
 * Explicitly includes the consent records themselves — a data export that
 * cannot tell you what you agreed to and when is missing the part somebody
 * exercising their rights is most likely asking about.
 *
 * The `account` block is generated from `USER_COLUMNS` rather than written out,
 * which is what stops it falling behind the erasure the way it had: five
 * columns the erasure knew were personal were simply absent from it, and an
 * export that under-reports is the one failure its reader cannot detect.
 */
export function exportUser(db: Db, userId: string): Record<string, unknown> {
  const one = (sql: string) => db.get(sql, { u: userId });
  const many = (sql: string) => db.all(sql, { u: userId });

  return {
    exportedAt: now(),
    policyVersion: CONFIG.privacy.policyVersion,
    account: one(`SELECT ${DISCLOSED} FROM users WHERE id = $u`),
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
    /* The `SET` clause is `USER_COLUMNS` above rather than a list written out
       here, and that is a fix for the class of bug rather than for one instance
       of it: a column personal enough to clear is by that fact personal enough
       to disclose, and two hand-written statements cannot stay agreed about
       which columns those are. Every column that used to be named on this line
       still is — read the table. */
    db.run(`UPDATE users SET ${ERASURE.set} WHERE id = $u`, {
      ...ERASURE.params,
      t: at,
      u: userId,
    });
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
