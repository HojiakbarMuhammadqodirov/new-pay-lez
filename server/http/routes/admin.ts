/**
 * Platform operations — Part C. Internal, admin-only, and reporting rather than
 * editing.
 *
 * The site's own rule for its console applies here and is worth restating,
 * because the temptation is constant: **the console reports; it does not edit
 * somebody else's account.** What an admin *can* do here is exactly the set
 * Part C names — approve a venue, moderate copy, provision and revoke tags,
 * adjudicate fraud, reverse a fraudulent grant, change platform configuration —
 * and every one of those is an operations action with an audit entry, not a
 * quiet edit of a partner's numbers.
 */
import * as analytics from '../../domain/analytics.ts';
import * as audit from '../../domain/audit.ts';
import * as fraud from '../../domain/fraud.ts';
import * as ledger from '../../domain/ledger.ts';
import * as partners from '../../domain/partners.ts';
import * as settings from '../../domain/settings.ts';
import * as traffic from '../../domain/traffic.ts';
import { DomainError } from '../../domain/errors.ts';
import { newId } from '../../domain/ids.ts';
import { actor, bool, int, oneOf, optStr, qInt, qStr, str } from '../input.ts';
import type { Route } from '../router.ts';

export const adminRoutes: Route[] = [
  /* ═══════════════════════════════════════ C1 approval & moderation ══ */
  {
    method: 'GET',
    pattern: '/v1/admin/queue',
    auth: 'admin',
    handler: (ctx) =>
      ctx.db.all(
        `SELECT m.*, v.name AS venue_name FROM moderation_queue m
           LEFT JOIN venues v ON v.id = m.venue_id
          WHERE m.status = 'pending' ORDER BY m.created_at LIMIT $l`,
        { l: qInt(ctx, 'limit', 100) },
      ),
  },
  {
    method: 'POST',
    pattern: '/v1/admin/queue/:id',
    auth: 'admin',
    handler: (ctx) => {
      const approve = bool(ctx.body, 'approve', true);
      const item = ctx.db.get<{ entity: string; entity_id: string; venue_id: string | null }>(
        `SELECT entity, entity_id, venue_id FROM moderation_queue WHERE id = $i`,
        { i: ctx.params.id },
      );
      if (!item) throw new DomainError('not_found', 'queue item not found');

      ctx.db.tx(() => {
        ctx.db.run(
          `UPDATE moderation_queue SET status = $s, reviewed_by = $r, reviewed_at = $t, note = $n
            WHERE id = $i`,
          {
            s: approve ? 'approved' : 'rejected',
            r: actor(ctx).user.id,
            t: ctx.at,
            n: optStr(ctx.body, 'note') ?? null,
            i: ctx.params.id,
          },
        );
        /* Rejecting content unpublishes it. Leaving a rejected deal live while
           the queue says "rejected" is the version of moderation that does
           nothing at all. */
        if (!approve && item.entity === 'hot_deal') {
          ctx.db.run(`UPDATE hot_deals SET status = 'paused', updated_at = $t WHERE id = $i`, {
            t: ctx.at,
            i: item.entity_id,
          });
        }
        audit.record(ctx.db, {
          actorId: actor(ctx).user.id,
          actorRole: 'admin',
          action: approve ? 'moderation.approve' : 'moderation.reject',
          entity: item.entity,
          entityId: item.entity_id,
          venueId: item.venue_id,
          at: ctx.at,
        });
      });
      return { ok: true };
    },
  },
  {
    method: 'GET',
    pattern: '/v1/admin/verifications',
    auth: 'admin',
    handler: (ctx) =>
      ctx.db.all(
        `SELECT r.*, v.name AS venue_name, v.city FROM verification_records r
           JOIN venues v ON v.id = r.venue_id
          WHERE r.status = 'pending' ORDER BY r.submitted_at`,
      ),
  },
  {
    method: 'POST',
    pattern: '/v1/admin/verifications/:id',
    auth: 'admin',
    handler: (ctx) => {
      partners.decideVerification(ctx.db, {
        verificationId: ctx.params.id,
        approve: bool(ctx.body, 'approve', true),
        reviewerId: actor(ctx).user.id,
        note: optStr(ctx.body, 'note'),
        at: ctx.at,
      });
      return { ok: true };
    },
  },

  /* ═══════════════════════════════════════════ C2 NFC tag provisioning ══ */
  {
    method: 'POST',
    pattern: '/v1/admin/tags',
    auth: 'admin',
    handler: (ctx) => {
      const uids = (ctx.body.uids as unknown[]) ?? [];
      if (!Array.isArray(uids) || uids.length === 0) {
        throw new DomainError('validation_failed', 'a batch needs UIDs', { field: 'uids' });
      }
      const batch = optStr(ctx.body, 'batch') ?? newId('evt');
      let imported = 0;
      ctx.db.tx(() => {
        for (const raw of uids) {
          const uid = String(raw).toUpperCase();
          if (!/^[0-9A-F]{14}$/.test(uid)) {
            throw new DomainError('validation_failed', `${uid} is not a 7-byte UID`, { uid });
          }
          ctx.db.run(
            `INSERT INTO tag_registry (tag_uid, status, batch, registered_at)
             VALUES ($u, 'unassigned', $b, $t)
               ON CONFLICT (tag_uid) DO NOTHING`,
            { u: uid, b: batch, t: ctx.at },
          );
          imported += 1;
        }
        audit.record(ctx.db, {
          actorId: actor(ctx).user.id,
          actorRole: 'admin',
          action: 'tags.import',
          entity: 'tag_registry',
          entityId: batch,
          after: { count: imported },
          at: ctx.at,
        });
      });
      /* The diversified keys are *not* stored per tag: they are derived from the
         master key and the UID at verification time (`crypto/nfc.ts`), so a
         database dump contains no tag key at all. */
      return { batch, imported };
    },
  },
  {
    method: 'POST',
    pattern: '/v1/admin/tags/:uid/assign',
    auth: 'admin',
    handler: (ctx) => {
      const uid = ctx.params.uid.toUpperCase();
      const changed = ctx.db.run(
        `UPDATE tag_registry SET venue_id = $v, status = 'active', assigned_at = $t, revoked_at = NULL
          WHERE tag_uid = $u AND status != 'revoked'`,
        { v: str(ctx.body, 'venueId'), t: ctx.at, u: uid },
      ).changes;
      if (changed === 0) throw new DomainError('not_found', 'no such assignable tag');
      audit.record(ctx.db, {
        actorId: actor(ctx).user.id,
        actorRole: 'admin',
        action: 'tags.assign',
        entity: 'tag_registry',
        entityId: uid,
        venueId: String(ctx.body.venueId),
        at: ctx.at,
      });
      return { uid, assigned: true };
    },
  },
  {
    method: 'POST',
    pattern: '/v1/admin/tags/:uid/revoke',
    auth: 'admin',
    handler: (ctx) => {
      const uid = ctx.params.uid.toUpperCase();
      /* Instant, and by UID alone — a lost tag is revoked without anyone going
         to the venue, which is the whole reason the tag carries no venue id. */
      ctx.db.run(
        `UPDATE tag_registry SET status = 'revoked', revoked_at = $t WHERE tag_uid = $u`,
        { t: ctx.at, u: uid },
      );
      audit.record(ctx.db, {
        actorId: actor(ctx).user.id,
        actorRole: 'admin',
        action: 'tags.revoke',
        entity: 'tag_registry',
        entityId: uid,
        at: ctx.at,
      });
      return { uid, revoked: true };
    },
  },
  {
    method: 'GET',
    pattern: '/v1/admin/tags',
    auth: 'admin',
    handler: (ctx) =>
      ctx.db.all(
        `SELECT t.tag_uid, t.status, t.last_counter, t.batch, t.assigned_at, v.name AS venue
           FROM tag_registry t LEFT JOIN venues v ON v.id = t.venue_id
          ORDER BY t.registered_at DESC LIMIT $l`,
        { l: qInt(ctx, 'limit', 200) },
      ),
  },

  /* ═════════════════════════════════════════════════════ C3 fraud review ══ */
  {
    method: 'GET',
    pattern: '/v1/admin/fraud',
    auth: 'admin',
    handler: (ctx) => fraud.openCases(ctx.db, qInt(ctx, 'limit', 100)),
  },
  {
    method: 'POST',
    pattern: '/v1/admin/fraud/:id',
    auth: 'admin',
    handler: (ctx) => {
      const status = oneOf(ctx.body, 'status', ['reviewing', 'confirmed', 'dismissed'] as const);
      ctx.db.run(
        `UPDATE fraud_cases SET status = $s, resolution = $r, resolved_by = $b, resolved_at = $t
          WHERE id = $i`,
        {
          s: status,
          r: optStr(ctx.body, 'resolution') ?? null,
          b: actor(ctx).user.id,
          t: status === 'reviewing' ? null : ctx.at,
          i: ctx.params.id,
        },
      );
      return { ok: true };
    },
  },
  {
    /**
     * Reverse a fraudulent grant.
     *
     * A compensating ledger entry, never a mutation of history (C3). The
     * original stays exactly as it was recorded and stops counting — which is
     * what makes the reversal itself auditable.
     */
    method: 'POST',
    pattern: '/v1/admin/ledger/:id/reverse',
    auth: 'admin',
    handler: (ctx) => {
      const entry = ledger.reverse(
        ctx.db,
        ctx.params.id,
        str(ctx.body, 'reason', { max: 300 }),
        ctx.at,
      );
      audit.record(ctx.db, {
        actorId: actor(ctx).user.id,
        actorRole: 'admin',
        action: 'ledger.reverse',
        entity: 'points_ledger',
        entityId: ctx.params.id,
        after: { compensating: entry.id, reason: ctx.body.reason },
        at: ctx.at,
      });
      return entry;
    },
  },
  {
    method: 'POST',
    pattern: '/v1/admin/users/:id/ban',
    auth: 'admin',
    handler: (ctx) => {
      ctx.db.tx(() => {
        ctx.db.run(`UPDATE users SET status = $s, updated_at = $t WHERE id = $u`, {
          s: bool(ctx.body, 'banned', true) ? 'banned' : 'active',
          t: ctx.at,
          u: ctx.params.id,
        });
        ctx.db.run(`UPDATE sessions SET revoked_at = $t WHERE user_id = $u`, {
          t: ctx.at,
          u: ctx.params.id,
        });
        audit.record(ctx.db, {
          actorId: actor(ctx).user.id,
          actorRole: 'admin',
          action: 'user.ban',
          entity: 'user',
          entityId: ctx.params.id,
          after: { banned: ctx.body.banned },
          at: ctx.at,
        });
      });
      return { ok: true };
    },
  },

  /* ═════════════════════════════════════ C4–C5 trials & platform reporting ══ */
  {
    method: 'GET',
    pattern: '/v1/admin/overview',
    auth: 'admin',
    handler: (ctx) => {
      const one = <T>(sql: string) => ctx.db.get<T>(sql);
      const issued = one<{ n: number | null }>(
        `SELECT SUM(delta) AS n FROM points_ledger WHERE delta > 0 AND status = 'committed'`,
      )?.n ?? 0;
      const redeemed = one<{ n: number | null }>(
        `SELECT -SUM(delta) AS n FROM points_ledger
          WHERE delta < 0 AND status = 'committed' AND reason IN ('voucher_redeem', 'gift_card_redeem')`,
      )?.n ?? 0;

      return {
        users: one<{ n: number }>(`SELECT COUNT(*) AS n FROM users WHERE status = 'active'`)?.n ?? 0,
        venues: one<{ n: number }>(`SELECT COUNT(*) AS n FROM venues WHERE status = 'live'`)?.n ?? 0,
        /* C5 calls this "the key economic ratio", and it is: points issued
           against points redeemed is whether the loyalty balance is a liability
           customers believe in or one they ignore. */
        points: { issued, redeemed, ratio: issued ? redeemed / issued : 0 },
        mrrMinor:
          ctx.db.get<{ n: number | null }>(
            `SELECT SUM(p.price_minor) AS n FROM subscriptions s JOIN plans p ON p.id = s.plan_id
              WHERE s.status IN ('active', 'grace')`,
          )?.n ?? 0,
        transactionsToday:
          ctx.db.get<{ n: number }>(
            `SELECT COUNT(*) AS n FROM transactions
              WHERE status = 'committed' AND confirmed_at >= $s`,
            { s: ctx.at.slice(0, 10) },
          )?.n ?? 0,
        openFraudCases:
          ctx.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM fraud_cases WHERE status = 'open'`)?.n ?? 0,
        cities: ctx.db.all(
          `SELECT city, COUNT(*) AS venues FROM venues WHERE status = 'live' GROUP BY city ORDER BY venues DESC`,
        ),
      };
    },
  },
  {
    /**
     * Website traffic. Not in either statement of work — it is the operator's
     * own question, and `domain/traffic.ts` explains why the answers have the
     * shape they do.
     *
     * The one thing to carry into any view of this: `dailyVisitors` is distinct
     * visitors summed per day, and `anonymousReturningVisitors` is `null`
     * because the design cannot know it. Rendering that null as 0 would be a
     * lie of the same kind `suppressed` exists to prevent on the partner side.
     */
    method: 'GET',
    pattern: '/v1/admin/traffic',
    auth: 'admin',
    handler: (ctx) => {
      const fallback = traffic.defaultRange(ctx.at);
      return traffic.overview(ctx.db, {
        from: qStr(ctx, 'from') ?? fallback.from,
        to: qStr(ctx, 'to') ?? fallback.to,
      });
    },
  },
  {
    /** The activity feed: one chronological list across the whole platform. */
    method: 'GET',
    pattern: '/v1/admin/activity',
    auth: 'admin',
    handler: (ctx) => ({ events: traffic.activity(ctx.db, qInt(ctx, 'limit', 100)) }),
  },
  {
    /**
     * The people. Read-only and deliberately shallow — this is the list an
     * operator scans, not a profile viewer. C1 gives an admin exactly one write
     * against a person (`/users/:id/ban`), and no view here should grow into a
     * second one.
     */
    method: 'GET',
    pattern: '/v1/admin/users',
    auth: 'admin',
    handler: (ctx) => {
      const search = qStr(ctx, 'q');
      return ctx.db.all(
        `SELECT u.id, u.display_name, u.city, u.country, u.status, u.created_at,
                u.points_cache AS points, u.referral_code,
                (SELECT COUNT(*) FROM transactions t
                  WHERE t.user_id = u.id AND t.status = 'committed') AS scans,
                (SELECT COUNT(*) FROM issued_vouchers iv WHERE iv.user_id = u.id) AS vouchers,
                (SELECT GROUP_CONCAT(r.role) FROM user_roles r WHERE r.user_id = u.id) AS roles,
                (SELECT MAX(s.last_at) FROM web_sessions s WHERE s.user_id = u.id) AS last_seen
           FROM users u
          WHERE u.deleted_at IS NULL
            AND ($q IS NULL OR u.display_name LIKE '%' || $q || '%' OR u.city LIKE '%' || $q || '%')
          ORDER BY u.created_at DESC LIMIT $l`,
        { q: search ?? null, l: qInt(ctx, 'limit', 200) },
      );
    },
  },
  {
    method: 'GET',
    pattern: '/v1/admin/venues',
    auth: 'admin',
    handler: (ctx) =>
      ctx.db.all(
        `SELECT v.id, v.name, v.city, v.category, v.status, v.verified_at, v.created_at,
                u.display_name AS owner,
                (SELECT COUNT(*) FROM venue_visits vv WHERE vv.venue_id = v.id) AS visits,
                (SELECT COUNT(*) FROM venue_customers vc WHERE vc.venue_id = v.id) AS customers
           FROM venues v LEFT JOIN users u ON u.id = v.owner_user_id
          WHERE v.deleted_at IS NULL AND ($city IS NULL OR v.city = $city)
          ORDER BY v.created_at DESC LIMIT $l`,
        { city: qStr(ctx, 'city') ?? null, l: qInt(ctx, 'limit', 200) },
      ),
  },
  {
    method: 'GET',
    pattern: '/v1/admin/trials',
    auth: 'admin',
    handler: (ctx) =>
      ctx.db.all(
        `SELECT s.id, s.venue_id, v.name, s.status, s.started_at, s.renews_at, p.code AS plan
           FROM subscriptions s JOIN plans p ON p.id = s.plan_id
           LEFT JOIN venues v ON v.id = s.venue_id
          WHERE s.status = 'trialing' ORDER BY s.renews_at`,
      ),
  },
  {
    /* C5's city market report: category-level, anonymised, for PR and partner
       acquisition. It runs through the same benchmark job, so it inherits the
       min-venue threshold rather than having its own. */
    method: 'POST',
    pattern: '/v1/admin/benchmarks/compute',
    auth: 'admin',
    handler: (ctx) => ({ written: analytics.computeBenchmarks(ctx.db, { at: ctx.at }) }),
  },
  {
    method: 'GET',
    pattern: '/v1/admin/audit',
    auth: 'admin',
    handler: (ctx) => audit.recent(ctx.db, qInt(ctx, 'limit', 200)),
  },

  /* ═════════════════════════════════════════════ C6 configuration ══ */
  {
    method: 'GET',
    pattern: '/v1/admin/config',
    auth: 'admin',
    handler: (ctx) => ({
      rows: ctx.db.all(`SELECT key, value, updated_at FROM platform_config ORDER BY key`),
      effective: analytics.cohortFloor(ctx.db),
      plans: ctx.db.all(
        `SELECT p.id, p.audience, p.code, p.name, p.price_minor, p.rank,
                (SELECT COUNT(*) FROM plan_entitlements e WHERE e.plan_id = p.id) AS entitlements
           FROM plans p ORDER BY p.audience, p.rank`,
      ),
      categoryDefaults: ctx.db.all(`SELECT * FROM category_defaults ORDER BY category`),
    }),
  },
  {
    method: 'PUT',
    pattern: '/v1/admin/config/:key',
    auth: 'admin',
    handler: (ctx) => {
      settings.setConfig(ctx.db, ctx.params.key, str(ctx.body, 'value'), ctx.at);
      audit.record(ctx.db, {
        actorId: actor(ctx).user.id,
        actorRole: 'admin',
        action: 'config.set',
        entity: 'platform_config',
        entityId: ctx.params.key,
        after: { value: ctx.body.value },
        at: ctx.at,
      });
      return { key: ctx.params.key, value: String(ctx.body.value) };
    },
  },
  {
    method: 'PUT',
    pattern: '/v1/admin/plans/:id/entitlements',
    auth: 'admin',
    handler: (ctx) => {
      const entries = Object.entries((ctx.body.entitlements as Record<string, unknown>) ?? {});
      ctx.db.tx(() => {
        for (const [key, value] of entries) {
          ctx.db.run(
            `INSERT INTO plan_entitlements (plan_id, key, value) VALUES ($p, $k, $v)
               ON CONFLICT (plan_id, key) DO UPDATE SET value = excluded.value`,
            { p: ctx.params.id, k: key, v: String(value) },
          );
        }
        audit.record(ctx.db, {
          actorId: actor(ctx).user.id,
          actorRole: 'admin',
          action: 'plan.entitlements',
          entity: 'plan',
          entityId: ctx.params.id,
          after: ctx.body.entitlements,
          at: ctx.at,
        });
      });
      return ctx.db.all(`SELECT key, value FROM plan_entitlements WHERE plan_id = $p`, {
        p: ctx.params.id,
      });
    },
  },
  {
    method: 'PUT',
    pattern: '/v1/admin/category-defaults/:category',
    auth: 'admin',
    handler: (ctx) => {
      ctx.db.run(
        `INSERT INTO category_defaults (category, avg_check_minor, currency) VALUES ($c, $m, $cur)
           ON CONFLICT (category) DO UPDATE SET avg_check_minor = excluded.avg_check_minor`,
        {
          c: ctx.params.category,
          m: int(ctx.body, 'avgCheckMinor', { min: 0 }),
          cur: optStr(ctx.body, 'currency') ?? 'PLN',
        },
      );
      return { ok: true };
    },
  },
];
