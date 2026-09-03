/**
 * Platform operations — Part C. Internal, admin-only.
 *
 * ## What changed, and what did not
 *
 * This file used to open by saying it *reported* rather than edited, and that
 * an operator's whole write surface was the set Part C names — approve a venue,
 * moderate copy, provision and revoke tags, adjudicate fraud, reverse a
 * fraudulent grant, change platform configuration. It is no longer true, and the
 * reason it is not is worth stating rather than deleting.
 *
 * The rule was never "an operator may not act". It was **"an operator must not
 * quietly edit somebody else's numbers"** — because a figure a partner argues
 * from, changed by a third party with no trace, is a figure nobody can defend.
 * That rule is intact and every write below keeps it:
 *
 * - **Nothing here edits a measurement.** No route touches the ledger, a
 *   venue's counters, a deal's funnel or anybody's balance. What an operator can
 *   do is *describe* things, *remove* them and *restore access* to them — fix a
 *   venue's name, take an offer off the board, close an account, set a password
 *   for somebody locked out. A removal is visible by its absence; an edited
 *   number is not.
 * - **Every one of them writes an audit entry**, with the actor on it. That is
 *   what makes a removal answerable later, and it is the same bar
 *   `ledger.reverse` and `moderation` already met.
 *
 * ## The three edits, and the line they stay on
 *
 * `PATCH .../venues/:id`, `PATCH .../deals/:id` and `PATCH .../users/:id` take
 * **descriptive** fields — a name, a city, a category, an offer's title and
 * window, a person's city and phone. Not one of them takes a count, a balance,
 * a visit or a funnel figure, and there is no route here that does.
 *
 * They are not a second implementation of anything: each one calls the domain
 * function the *owner's* own form calls (`partners.updateVenue`,
 * `partners.updateDeal`, `accounts.updateProfile`), so an operator fixing a
 * misspelt city goes through the same validation, the same city canonicaliser
 * and the same audit entry the person would have. A parallel admin writer would
 * be the copy that drifts.
 *
 * ## Removal means removal
 *
 * A venue and an offer used to be *archived* — stamped and filtered out of every
 * list — on the argument that a deal's funnel rows are a venue's history. They
 * are `DELETE`d now, on the operator's instruction, and the schema is what makes
 * that safe rather than a hope: every foreign key into `venues` and `hot_deals`
 * is `ON DELETE CASCADE` for the rows that *belong* to them (their offers,
 * pushes, campaigns, budgets, staff, tags, visits, events) and `ON DELETE SET
 * NULL` for the rows that merely *mention* them (`points_ledger`,
 * `transactions`, `audit_log`, `guidance_services`). So the thing goes, what it
 * owned goes with it, and the accounting still adds up with the reference
 * detached.
 *
 * **A person is the exception, and the exception is the database's, not a
 * preference.** `points_ledger.user_id` and `transactions.user_id` are `ON
 * DELETE CASCADE`, so dropping a customer's row would silently take every
 * venue's record of what that customer spent with it — a third party's revenue
 * history, deleted by a click on a different screen. So closing an account runs
 * `consent.eraseUser` first (the same Article 17 routine a person can run on
 * themselves: every personal field wiped, the row gone from every list) and then
 * drops the row **only when the account has no committed accounting behind it**.
 * The answer says which of the two happened, exactly as the gift-card route
 * does, because they are different facts.
 *
 * ## The confirmation
 *
 * The two irreversible removals take the row's own name or address back in the
 * body. The console no longer makes an operator *type* it — the modal names the
 * thing and takes a deliberate second press — but the field stays required, and
 * it is not ceremony: it is the client proving it knows which row it is about to
 * destroy, which is the failure a mis-wired list would produce.
 */
import * as accounts from '../../domain/accounts.ts';
import * as analytics from '../../domain/analytics.ts';
import * as audit from '../../domain/audit.ts';
import * as consent from '../../domain/consent.ts';
import * as contact from '../../domain/contact.ts';
import * as deals from '../../domain/deals.ts';
import * as fraud from '../../domain/fraud.ts';
import * as ledger from '../../domain/ledger.ts';
import * as partners from '../../domain/partners.ts';
import * as settings from '../../domain/settings.ts';
import * as traffic from '../../domain/traffic.ts';
import { DomainError } from '../../domain/errors.ts';
import { newId } from '../../domain/ids.ts';
import { actor, bool, int, oneOf, optStr, qInt, qStr, str } from '../input.ts';
import type { Ctx, Route } from '../router.ts';

/**
 * The typed confirmation the two irreversible removals take.
 *
 * Case- and space-insensitive, because the operator is copying a name off the
 * screen beside the button and "Kawiarnia  Bracka " is the same venue. What it
 * is not is optional: a missing or wrong answer is a validation failure naming
 * the field, so the client can say *what* to type rather than that something
 * was wrong.
 */
const fold = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

function confirmed(ctx: Ctx, expected: string): void {
  if (fold(optStr(ctx.body, 'confirm') ?? '') !== fold(expected)) {
    throw new DomainError('validation_failed', `type “${expected}” to confirm`, {
      field: 'confirm',
      expected,
    });
  }
}

/**
 * Refuse to act on an operator, including yourself.
 *
 * Two things this prevents, and the first is the one that has to be prevented:
 * banning or erasing your own row revokes your own session inside the request
 * that did it, so the console goes blank and the next sign-in fails — an
 * operator can lock themselves out of the platform with one press and no way
 * back through any screen. The second is the same failure with more steps: erase
 * every operator and the console has no one who can open it, and the only way
 * back in is a restart with `PAYLEZ_ADMIN_EMAIL` set.
 *
 * Removing an operator is a roles decision, and it belongs where roles are
 * granted rather than on a list of customers.
 */
async function notAnOperator(ctx: Ctx, userId: string): Promise<void> {
  if (userId === actor(ctx).user.id) {
    throw new DomainError('forbidden', 'an operator cannot do this to their own account');
  }
  if (await accounts.hasRole(ctx.db, userId, 'admin')) {
    throw new DomainError('forbidden', 'this account is an operator');
  }
}


export const adminRoutes: Route[] = [
  /* ═══════════════════════════════════════ C1 approval & moderation ══ */
  {
    method: 'GET',
    pattern: '/v1/admin/queue',
    auth: 'admin',
    handler: async (ctx) =>
      await ctx.db.all(
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
    handler: async (ctx) => {
      const approve = bool(ctx.body, 'approve', true);
      const item = await ctx.db.get<{ entity: string; entity_id: string; venue_id: string | null }>(
        `SELECT entity, entity_id, venue_id FROM moderation_queue WHERE id = $i`,
        { i: ctx.params.id },
      );
      if (!item) throw new DomainError('not_found', 'queue item not found');

      await ctx.db.tx(async () => {
        await ctx.db.run(
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
          await ctx.db.run(`UPDATE hot_deals SET status = 'paused', updated_at = $t WHERE id = $i`, {
            t: ctx.at,
            i: item.entity_id,
          });
        }
        await audit.record(ctx.db, {
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
    handler: async (ctx) =>
      await ctx.db.all(
        `SELECT r.*, v.name AS venue_name, v.city FROM verification_records r
           JOIN venues v ON v.id = r.venue_id
          WHERE r.status = 'pending' ORDER BY r.submitted_at`,
      ),
  },
  {
    method: 'POST',
    pattern: '/v1/admin/verifications/:id',
    auth: 'admin',
    handler: async (ctx) => {
      await partners.decideVerification(ctx.db, {
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
    handler: async (ctx) => {
      const uids = (ctx.body.uids as unknown[]) ?? [];
      if (!Array.isArray(uids) || uids.length === 0) {
        throw new DomainError('validation_failed', 'a batch needs UIDs', { field: 'uids' });
      }
      const batch = optStr(ctx.body, 'batch') ?? newId('evt');
      let imported = 0;
      await ctx.db.tx(async () => {
        for (const raw of uids) {
          const uid = String(raw).toUpperCase();
          if (!/^[0-9A-F]{14}$/.test(uid)) {
            throw new DomainError('validation_failed', `${uid} is not a 7-byte UID`, { uid });
          }
          await ctx.db.run(
            `INSERT INTO tag_registry (tag_uid, status, batch, registered_at)
             VALUES ($u, 'unassigned', $b, $t)
               ON CONFLICT (tag_uid) DO NOTHING`,
            { u: uid, b: batch, t: ctx.at },
          );
          imported += 1;
        }
        await audit.record(ctx.db, {
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
    handler: async (ctx) => {
      const uid = ctx.params.uid.toUpperCase();
      const changed = (await ctx.db.run(
        `UPDATE tag_registry SET venue_id = $v, status = 'active', assigned_at = $t, revoked_at = NULL
          WHERE tag_uid = $u AND status != 'revoked'`,
        { v: str(ctx.body, 'venueId'), t: ctx.at, u: uid },
      )).changes;
      if (changed === 0) throw new DomainError('not_found', 'no such assignable tag');
      await audit.record(ctx.db, {
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
    handler: async (ctx) => {
      const uid = ctx.params.uid.toUpperCase();
      /* Instant, and by UID alone — a lost tag is revoked without anyone going
         to the venue, which is the whole reason the tag carries no venue id. */
      await ctx.db.run(
        `UPDATE tag_registry SET status = 'revoked', revoked_at = $t WHERE tag_uid = $u`,
        { t: ctx.at, u: uid },
      );
      await audit.record(ctx.db, {
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
    handler: async (ctx) =>
      await ctx.db.all(
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
    handler: async (ctx) => await fraud.openCases(ctx.db, qInt(ctx, 'limit', 100)),
  },
  {
    method: 'POST',
    pattern: '/v1/admin/fraud/:id',
    auth: 'admin',
    handler: async (ctx) => {
      const status = oneOf(ctx.body, 'status', ['reviewing', 'confirmed', 'dismissed'] as const);
      await ctx.db.run(
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
    handler: async (ctx) => {
      const entry = await ledger.reverse(
        ctx.db,
        ctx.params.id,
        str(ctx.body, 'reason', { max: 300 }),
        ctx.at,
      );
      await audit.record(ctx.db, {
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
    /**
     * Suspend an account, or let it back in.
     *
     * The reversible one, and the one to reach for first: a banned account keeps
     * everything it has and gets it all back the moment somebody presses again.
     * Erasure below is the other end of the same scale and cannot be undone at
     * all, which is why the console offers this beside it rather than only that.
     */
    method: 'POST',
    pattern: '/v1/admin/users/:id/ban',
    auth: 'admin',
    handler: async (ctx) => {
      await notAnOperator(ctx, ctx.params.id);
      await ctx.db.tx(async () => {

        await ctx.db.run(`UPDATE users SET status = $s, updated_at = $t WHERE id = $u`, {
          s: bool(ctx.body, 'banned', true) ? 'banned' : 'active',
          t: ctx.at,
          u: ctx.params.id,
        });
        await ctx.db.run(`UPDATE sessions SET revoked_at = $t WHERE user_id = $u`, {
          t: ctx.at,
          u: ctx.params.id,
        });
        await audit.record(ctx.db, {
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
    handler: async (ctx) => {
      const one = async <T>(sql: string) => await ctx.db.get<T>(sql);
      const issued = (await one<{ n: number | null }>(
        `SELECT SUM(delta) AS n FROM points_ledger WHERE delta > 0 AND status = 'committed'`,
      ))?.n ?? 0;
      const redeemed = (await one<{ n: number | null }>(
        `SELECT -SUM(delta) AS n FROM points_ledger
          WHERE delta < 0 AND status = 'committed' AND reason IN ('voucher_redeem', 'gift_card_redeem')`,
      ))?.n ?? 0;

      return {
        users: (await one<{ n: number }>(`SELECT COUNT(*) AS n FROM users WHERE status = 'active'`))?.n ?? 0,
        venues: (await one<{ n: number }>(`SELECT COUNT(*) AS n FROM venues WHERE status = 'live'`))?.n ?? 0,
        /* C5 calls this "the key economic ratio", and it is: points issued
           against points redeemed is whether the loyalty balance is a liability
           customers believe in or one they ignore. */
        points: { issued, redeemed, ratio: issued ? redeemed / issued : 0 },
        mrrMinor:
          (await ctx.db.get<{ n: number | null }>(
            `SELECT SUM(p.price_minor) AS n FROM subscriptions s JOIN plans p ON p.id = s.plan_id
              WHERE s.status IN ('active', 'grace')`,
          ))?.n ?? 0,
        transactionsToday:
          (await ctx.db.get<{ n: number }>(
            `SELECT COUNT(*) AS n FROM transactions
              WHERE status = 'committed' AND confirmed_at >= $s`,
            { s: ctx.at.slice(0, 10) },
          ))?.n ?? 0,
        openFraudCases:
          (await ctx.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM fraud_cases WHERE status = 'open'`))?.n ?? 0,
        cities: await ctx.db.all(
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
    handler: async (ctx) => {
      const fallback = traffic.defaultRange(ctx.at);
      return await traffic.overview(ctx.db, {
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
    handler: async (ctx) => ({ events: await traffic.activity(ctx.db, qInt(ctx, 'limit', 100)) }),
  },
  {
    /**
     * The inbox: what people wrote on the website's Contact page.
     *
     * `counts` is returned beside the page rather than derived from it, because
     * the number on a filter chip is a fact about the table and not about this
     * page of it — see `domain/contact.ts`.
     */
    method: 'GET',
    pattern: '/v1/admin/messages',
    auth: 'admin',
    handler: async (ctx) => {
      const status = qStr(ctx, 'status');
      if (status !== undefined && !contact.isStatus(status)) {
        throw new DomainError('validation_failed', 'unknown status');
      }
      return await contact.list(ctx.db, { status, limit: qInt(ctx, 'limit', 100) });
    },
  },
  {
    /**
     * The one write: where the operator has got to with a message.
     *
     * It is not a reply — there is no mail sender here and adding one to make
     * this endpoint feel complete would be the wrong order to build it in. It
     * records that somebody has read or finished with the row, which is what
     * stops two operators answering the same person.
     */
    method: 'PATCH',
    pattern: '/v1/admin/messages/:id',
    auth: 'admin',
    handler: async (ctx) => {
      const status = oneOf(ctx.body, 'status', contact.STATUSES);
      const message = await contact.setStatus(ctx.db, ctx.params.id, status, ctx.at);
      await audit.record(ctx.db, {
        actorId: actor(ctx).user.id,
        actorRole: 'admin',
        action: 'contact.status',
        entity: 'contact_message',
        entityId: message.id,
        after: status,
        at: ctx.at,
      });
      return message;
    },
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
    handler: async (ctx) => {
      const search = qStr(ctx, 'q');
      return await ctx.db.all(
        /* `email` and `auth_provider` are here and the rest of the profile is
           not, which is the line this endpoint's "deliberately shallow" note
           draws. An operator has to be able to tell two accounts apart, and on
           a real directory the display names collide — four variants of one
           person's name, all real, was the state that made this necessary. The
           provider is beside it because "signed in with Google" is the answer
           to "why has this account no password", which is otherwise a support
           ticket. Phone, birthday and occupation stay out: those are a profile
           viewer, and this is a list somebody scans. */
        `SELECT u.id, u.display_name, u.email, u.auth_provider, u.city, u.country_code,
                u.status, u.created_at, u.language, u.onboarded_at,
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
    handler: async (ctx) =>
      await ctx.db.all(
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
    handler: async (ctx) =>
      await ctx.db.all(
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
    handler: async (ctx) => ({ written: await analytics.computeBenchmarks(ctx.db, { at: ctx.at }) }),
  },
  {
    method: 'GET',
    pattern: '/v1/admin/audit',
    auth: 'admin',
    handler: async (ctx) => await audit.recent(ctx.db, qInt(ctx, 'limit', 200)),
  },

  /* ═════════════════════════════════════════════ C6 configuration ══ */
  {
    method: 'GET',
    pattern: '/v1/admin/config',
    auth: 'admin',
    handler: async (ctx) => ({
      rows: await ctx.db.all(`SELECT key, value, updated_at FROM platform_config ORDER BY key`),
      effective: await analytics.cohortFloor(ctx.db),
      plans: await ctx.db.all(
        `SELECT p.id, p.audience, p.code, p.name, p.price_minor, p.rank,
                (SELECT COUNT(*) FROM plan_entitlements e WHERE e.plan_id = p.id) AS entitlements
           FROM plans p ORDER BY p.audience, p.rank`,
      ),
      categoryDefaults: await ctx.db.all(`SELECT * FROM category_defaults ORDER BY category`),
    }),
  },
  {
    method: 'PUT',
    pattern: '/v1/admin/config/:key',
    auth: 'admin',
    handler: async (ctx) => {
      await settings.setConfig(ctx.db, ctx.params.key, str(ctx.body, 'value'), ctx.at);
      await audit.record(ctx.db, {
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
    handler: async (ctx) => {
      const entries = Object.entries((ctx.body.entitlements as Record<string, unknown>) ?? {});
      await ctx.db.tx(async () => {
        for (const [key, value] of entries) {
          await ctx.db.run(
            `INSERT INTO plan_entitlements (plan_id, key, value) VALUES ($p, $k, $v)
               ON CONFLICT (plan_id, key) DO UPDATE SET value = excluded.value`,
            { p: ctx.params.id, k: key, v: String(value) },
          );
        }
        await audit.record(ctx.db, {
          actorId: actor(ctx).user.id,
          actorRole: 'admin',
          action: 'plan.entitlements',
          entity: 'plan',
          entityId: ctx.params.id,
          after: ctx.body.entitlements,
          at: ctx.at,
        });
      });
      return await ctx.db.all(`SELECT key, value FROM plan_entitlements WHERE plan_id = $p`, {
        p: ctx.params.id,
      });
    },
  },
  {
    method: 'PUT',
    pattern: '/v1/admin/category-defaults/:category',
    auth: 'admin',
    handler: async (ctx) => {
      await ctx.db.run(
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

  /* ═════════════════════════════ C7 taking things down, and letting back in ══
   *
   * The console's write half. Read the file header for the rule these keep and
   * the one they do not: an operator may *remove*, and may *restore access*, and
   * may not edit a number anybody reports from.
   *
   * Each pair is deliberately a pair — a reversible action beside the final one,
   * with the reversible one first. Suspending a venue, pausing an offer and
   * banning an account all undo with a second press; archiving and erasing do
   * not undo at all. An operator who is given only the final version of an
   * action uses it for the reversible case, because it is the only button there
   * is.
   */

  {
    /**
     * Every offer, in whatever state it is in.
     *
     * The public `GET /v1/deals` is `status = 'live'` and passes each row
     * through `claimableNow`, which is right for a customer and useless to an
     * operator: it cannot see a paused offer, so it cannot resume one, and a
     * deal that vanished because its window closed is indistinguishable from one
     * that was never there. This is the same table with no filter but the one
     * that matters — archived rows are gone, which is what archiving means.
     *
     * The copy comes through `deals.copyFor` rather than a join, so a deal shows
     * the title the *server's* fallback order picks: a row with Polish copy and
     * no English still has a name here instead of an empty cell.
     */
    method: 'GET',
    pattern: '/v1/admin/deals',
    auth: 'admin',
    handler: async (ctx) =>
      await Promise.all((await ctx.db
        .all<{
          id: string;
          venue_id: string | null;
          partner_name: string | null;
          city: string | null;
          status: string;
          valid_to: string | null;
          points_required: number;
          seen_count: number;
          claimed_count: number;
        }>(
          `SELECT d.id, d.venue_id, COALESCE(v.name, d.partner_name) AS partner_name, d.city,
                  d.status, d.valid_to, d.points_required, d.seen_count, d.claimed_count
             FROM hot_deals d LEFT JOIN venues v ON v.id = d.venue_id
            WHERE d.status <> 'archived'
            ORDER BY d.created_at DESC LIMIT $l`,
          { l: qInt(ctx, 'limit', 200) },
        ))
        .map(async (row) => ({ ...row, copy: await deals.copyFor(ctx.db, row.id, ctx.language) }))),
  },
  {
    /**
     * Take an offer off the board, or put it back.
     *
     * Resuming goes through `partners.assertPublishable` — the same three gates
     * the owner's own publish button clears, handed to `setStatus` as its guard.
     * Being an operator is not an exemption from them: an unverified venue, a
     * plan with no room for another live deal and a deal with no copy in any
     * language are each a reason a customer must not be shown it, and none of
     * them stops being true because the press came from the console. Pausing is
     * ungated, because taking something *down* never is.
     */
    method: 'PATCH',
    pattern: '/v1/admin/deals/:id',
    auth: 'admin',
    handler: async (ctx) => {
      /* Told apart by which keys arrive, like the venue patch above: `{status}`
         is the pause/resume press, the rest is the edit form saving. */
      const status = optStr(ctx.body, 'status');
      if (status !== undefined) {
        const next = oneOf(ctx.body, 'status', ['live', 'paused'] as const);
        const deal = await deals.setStatus(ctx.db, ctx.params.id, next, ctx.at, {
          check: async (row) => {
            await partners.assertPublishable(ctx.db, row.id);
          },
        });
        await audit.record(ctx.db, {
          actorId: actor(ctx).user.id,
          actorRole: 'admin',
          action: 'deal.status',
          entity: 'hot_deal',
          entityId: deal.id,
          venueId: deal.venue_id,
          after: { status: next },
          at: ctx.at,
        });
      }

      /*
       * The words on the card, and the window it runs in.
       *
       * The copy goes in under **one** language — the request's, resolved the
       * same way every other read on this file resolves it — because that is
       * the language the operator is looking at the row in. Writing an edit
       * made in Polish into the English row is how a deal ends up with an
       * English title in Polish, and `deals.copyFor` already falls back for the
       * languages nobody has written yet.
       */
      const title = optStr(ctx.body, 'title');
      const description = optStr(ctx.body, 'description');
      const terms = optStr(ctx.body, 'terms');
      const validTo = optStr(ctx.body, 'validTo');
      const copy =
        title === undefined && description === undefined && terms === undefined
          ? undefined
          : { [ctx.language]: { title, description, terms } };

      if (copy !== undefined || validTo !== undefined) {
        await partners.updateDeal(ctx.db, {
          dealId: ctx.params.id,
          actorId: actor(ctx).user.id,
          patch: { validTo, copy },
          at: ctx.at,
        });
      }

      const row = await deals.getDeal(ctx.db, ctx.params.id);
      return { ...row, copy: await deals.copyFor(ctx.db, row.id, ctx.language) };
    },
  },
  {
    /**
     * Remove an offer.
     *
     * A real `DELETE`, and the cost of that is worth naming because the previous
     * version existed to avoid it: `deal_events` cascades on the deal, so its
     * impressions and claims go too, and the venue's reach funnel for the period
     * loses that offer's share. The judgement is that an operator who deletes an
     * offer has decided it should not be in the record either — and an offer
     * kept in the database purely to hold up a rate is a row nobody can point at
     * on any screen. The scheduled pushes cascade with it, which is what stops
     * the worst kind of dead link: a notification for an offer that is gone,
     * arriving on a phone at 09:00 tomorrow.
     */
    method: 'DELETE',
    pattern: '/v1/admin/deals/:id',
    auth: 'admin',
    handler: async (ctx) => {
      const before = await deals.getDeal(ctx.db, ctx.params.id);
      /* Before the delete — `audit_log.venue_id` is `ON DELETE SET NULL` and
         this entry has to keep saying which venue lost an offer. */
      await audit.record(ctx.db, {
        actorId: actor(ctx).user.id,
        actorRole: 'admin',
        action: 'deal.delete',
        entity: 'hot_deal',
        entityId: before.id,
        venueId: before.venue_id,
        before: { status: before.status, partnerName: before.partner_name },
        at: ctx.at,
      });
      await ctx.db.tx(async () => {
        /* `translations` is a side table keyed by `(entity, entity_id)` with no
           foreign key to anything — that is what lets one table hold copy for
           deals, venues, campaigns and guidance articles — and the price of it
           is that no cascade reaches it. Deleting the deal without this leaves
           its title and terms in the database under an id nothing points at. */
        await ctx.db.run(`DELETE FROM translations WHERE entity = 'hot_deal' AND entity_id = $d`, {
          d: before.id,
        });
        await ctx.db.run(`DELETE FROM hot_deals WHERE id = $d`, { d: before.id });
      });
      return { id: before.id, deleted: true };
    },
  },
  {
    /**
     * Take a gift card off the shelf.
     *
     * Two outcomes, and which one happens is decided by the database rather than
     * by the caller: `gift_cards.stock_id` is `ON DELETE RESTRICT`, so a brand
     * somebody has actually bought from cannot have its row removed — the code
     * on a card in somebody's wallet would stop naming anything. That one is
     * *delisted* (`active = 0`), which is what the public shelf filters on. A
     * shelf entry nobody has bought is deleted outright.
     *
     * The answer says which happened, because they are different facts: one is
     * gone, and one is hidden with rows still pointing at it.
     */
    method: 'DELETE',
    pattern: '/v1/admin/gift-cards/:id',
    auth: 'admin',
    handler: async (ctx) => {
      const card = await ctx.db.get<{ id: string; brand: string }>(
        `SELECT id, brand FROM gift_card_stock WHERE id = $i`,
        { i: ctx.params.id },
      );
      if (!card) throw new DomainError('not_found', 'no such gift card');

      const issued =
        (await ctx.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM gift_cards WHERE stock_id = $i`, {
          i: card.id,
        }))?.n ?? 0;

      if (issued === 0) await ctx.db.run(`DELETE FROM gift_card_stock WHERE id = $i`, { i: card.id });
      else {
        await ctx.db.run(`UPDATE gift_card_stock SET active = 0, stock = 0 WHERE id = $i`, { i: card.id });
      }

      await audit.record(ctx.db, {
        actorId: actor(ctx).user.id,
        actorRole: 'admin',
        action: issued === 0 ? 'gift_card.delete' : 'gift_card.delist',
        entity: 'gift_card_stock',
        entityId: card.id,
        before: { brand: card.brand, issued },
        at: ctx.at,
      });
      return { id: card.id, outcome: issued === 0 ? 'deleted' : 'delisted', issued };
    },
  },

  {
    /**
     * Suspend a venue, or bring it back.
     *
     * One column, and it does more than it looks like: `requireVerified` demands
     * `status = 'live'`, so a suspended venue cannot publish an offer, cannot
     * resume one, and cannot take a scan at the counter — every author path runs
     * through that check. Nothing is lost and nothing is stamped, which is what
     * makes this the press to reach for when the answer might be "for now".
     *
     * Restoring writes `live` and does *not* touch `verified_at`: a venue that
     * was verified before it was suspended is the same venue, and making an
     * operator re-verify it would be a second review of something nobody
     * re-submitted.
     */
    method: 'PATCH',
    pattern: '/v1/admin/venues/:id',
    auth: 'admin',
    handler: async (ctx) => {
      const live = await ctx.db.get<{ id: string }>(
        `SELECT id FROM venues WHERE id = $v AND deleted_at IS NULL`,
        { v: ctx.params.id },
      );
      if (!live) throw new DomainError('not_found', 'venue not found');

      /*
       * Two different requests wearing one method, and they are told apart by
       * which key is present rather than by a mode flag: `{status}` is the
       * suspend/restore press, anything else is the edit form saving. A body
       * carrying both is legitimate and does both, in that order.
       */
      const status = optStr(ctx.body, 'status');
      if (status !== undefined) {
        const next = oneOf(ctx.body, 'status', ['live', 'suspended'] as const);
        await ctx.db.run(
          `UPDATE venues SET status = $s, updated_at = $t WHERE id = $v AND deleted_at IS NULL`,
          { s: next, t: ctx.at, v: ctx.params.id },
        );
        await audit.record(ctx.db, {
          actorId: actor(ctx).user.id,
          actorRole: 'admin',
          action: 'venue.status',
          entity: 'venue',
          entityId: ctx.params.id,
          venueId: ctx.params.id,
          after: { status: next },
          at: ctx.at,
        });
      }

      /*
       * The descriptive half, through the owner's own writer. Every field here
       * is something printed on a card; none of them is counted. `updateVenue`
       * `COALESCE`s an absent key, so a form that sends only what it changed
       * changes only that.
       */
      const patch = {
        name: optStr(ctx.body, 'name'),
        category: optStr(ctx.body, 'category'),
        city: optStr(ctx.body, 'city'),
        address: optStr(ctx.body, 'address'),
        phone: optStr(ctx.body, 'phone'),
        email: optStr(ctx.body, 'email'),
      };
      const edited = Object.values(patch).some((value) => value !== undefined);
      if (edited) {
        await partners.updateVenue(ctx.db, {
          venueId: ctx.params.id,
          actorId: actor(ctx).user.id,
          patch,
          at: ctx.at,
        });
      }

      return await ctx.db.get(
        `SELECT id, name, city, category, address, phone, email, status, verified_at
           FROM venues WHERE id = $v`,
        { v: ctx.params.id },
      );
    },
  },
  {
    /**
     * Remove a venue. The name is typed back — see the header.
     *
     * **Its offers go with it, and that is the load-bearing line.**
     * `deals.browse` selects on `hot_deals.status` and never joins `venues`, so
     * an archived venue whose deals are still `live` keeps a card on the board
     * for a business that no longer exists — and the card is claimable, which
     * sends somebody to a door. Everything the venue put in front of a customer
     * comes down in the same transaction as the venue: its offers archived, its
     * scheduled pushes cancelled, its stamp campaigns ended, its tags revoked.
     *
     * **The row is dropped, not stamped.** It was stamped — `deleted_at` set and
     * every list filtering on it — which left an operator told "removed" looking
     * at a database that still held the venue, and that is the gap this now
     * closes. What makes a real `DELETE` safe here is the schema rather than
     * optimism: everything that *belongs* to a venue cascades away with it, and
     * the four tables that merely *mention* one — the ledger, transactions, the
     * audit log, the guidebook listing it was promoted from — carry
     * `ON DELETE SET NULL`, so a platform-wide report still adds up with the
     * reference gone. The file header lists them.
     *
     * The count of offers that went with it is still the interesting half of
     * the answer: it is the part customers would otherwise still be seeing.
     */
    method: 'DELETE',
    pattern: '/v1/admin/venues/:id',
    auth: 'admin',
    handler: async (ctx) => {
      const venue = await ctx.db.get<{ id: string; name: string; status: string }>(
        `SELECT id, name, status FROM venues WHERE id = $v AND deleted_at IS NULL`,
        { v: ctx.params.id },
      );
      if (!venue) throw new DomainError('not_found', 'venue not found');
      confirmed(ctx, venue.name);

      let offers = 0;
      await ctx.db.tx(async () => {
        offers =
          (await ctx.db.get<{ n: number }>(
            `SELECT COUNT(*) AS n FROM hot_deals WHERE venue_id = $v AND status <> 'archived'`,
            { v: venue.id },
          ))?.n ?? 0;
        /* The audit entry is written *before* the delete, and it has to be:
           `audit_log.venue_id` is `ON DELETE SET NULL`, so a row inserted after
           this would be the same entry with the id blanked — a record of a
           removal that cannot say what was removed. Writing it first keeps the
           name and the status in `before`, which is where they survive. */
        await audit.record(ctx.db, {
          actorId: actor(ctx).user.id,
          actorRole: 'admin',
          action: 'venue.delete',
          entity: 'venue',
          entityId: venue.id,
          venueId: venue.id,
          before: { name: venue.name, status: venue.status },
          after: { offersDeleted: offers },
          at: ctx.at,
        });

        /*
         * The copy, which no cascade reaches.
         *
         * `translations` is keyed by `(entity, entity_id)` and has no foreign
         * key to anything — one table holding copy for deals, venues, campaigns
         * and guidance articles cannot have five — so the rows for the venue and
         * for everything about to cascade off it have to be swept by hand, and
         * **before** the delete, while there is still something to ask which
         * deals and campaigns were its.
         */
        await ctx.db.run(
          `DELETE FROM translations
            WHERE (entity = 'venue' AND entity_id = $v)
               OR (entity = 'hot_deal'
                   AND entity_id IN (SELECT id FROM hot_deals WHERE venue_id = $v))
               OR (entity = 'campaign'
                   AND entity_id IN (SELECT id FROM campaigns WHERE venue_id = $v))`,
          { v: venue.id },
        );
        await ctx.db.run(`DELETE FROM venues WHERE id = $v`, { v: venue.id });
      });
      return { id: venue.id, deleted: true, offersDeleted: offers };
    },
  },

  {
    /**
     * Set somebody's password, when they cannot.
     *
     * The support action this console existed without, and the one an operator
     * otherwise performs over SSH with `sqlite3` and a hash pasted in from
     * somewhere. `accounts.resetPassword` carries the rules — the length floor,
     * the address requirement, and dropping every session the account has open.
     *
     * The new password is **not** written to the audit entry, and the omission
     * is the point: `audit_log` is a table an operator reads, exports and hands
     * to whoever asks for it, and a password in it is a credential in a
     * document. What is recorded is that a reset happened and who did it, which
     * is the question an audit trail is for.
     */
    method: 'POST',
    pattern: '/v1/admin/users/:id/password',
    auth: 'admin',
    handler: async (ctx) => {
      await accounts.resetPassword(
        ctx.db,
        ctx.params.id,
        str(ctx.body, 'password', { max: 200 }),
        ctx.at,
      );
      await audit.record(ctx.db, {
        actorId: actor(ctx).user.id,
        actorRole: 'admin',
        action: 'user.password_reset',
        entity: 'user',
        entityId: ctx.params.id,
        at: ctx.at,
      });
      return { ok: true, sessionsRevoked: true };
    },
  },
  {
    /**
     * Close an account. The address is typed back — see the header.
     *
     * It is `consent.eraseUser`: the *same* routine `DELETE /v1/me` runs when
     * somebody asks for themselves to be forgotten, and reusing it rather than
     * writing an operator's own version is the whole decision. Erasure is a long
     * list of columns and a longer list of tables, and two implementations of it
     * drift — the one exercised daily stays correct and the one exercised twice
     * a year quietly stops clearing a column somebody added. A second copy here
     * would be the one that rots.
     *
     * What it does is anonymise: the person leaves and the accounting stays, for
     * the reason `domain/consent.ts` sets out at the point it declines to delete
     * a ledger row.
     */
    method: 'DELETE',
    pattern: '/v1/admin/users/:id',
    auth: 'admin',
    handler: async (ctx) => {
      await notAnOperator(ctx, ctx.params.id);
      const user = await ctx.db.get<{ id: string; email: string | null; display_name: string }>(
        `SELECT id, email, display_name FROM users WHERE id = $u AND deleted_at IS NULL`,
        { u: ctx.params.id },
      );
      if (!user) throw new DomainError('not_found', 'user not found');
      /* The address, or the id when there is none — a provisional account has no
         email and still has to be confirmable against something the operator can
         see on the row in front of them. */
      confirmed(ctx, user.email ?? user.id);

      const result = await consent.eraseUser(ctx.db, user.id, ctx.at);
      await audit.record(ctx.db, {
        actorId: actor(ctx).user.id,
        actorRole: 'admin',
        action: 'user.erase',
        entity: 'user',
        entityId: user.id,
        /* The name and address are written here on purpose, and this is the one
           place they survive: an erasure nobody can later attach to a request is
           indistinguishable from an operator deleting an inconvenient customer.
           `audit_log` is the record of the act, not of the person. */
        before: { email: user.email, name: user.display_name },
        at: ctx.at,
      });

      /*
       * And then the row itself, when nothing is owed to it.
       *
       * "Removed" ought to mean the row is gone, and for an account nobody ever
       * transacted with it can be: erasure has already blanked every personal
       * field, and a `DELETE` takes the sessions, the game history and the
       * profile with it. What stops it being unconditional is the schema —
       * `points_ledger.user_id` and `transactions.user_id` are `ON DELETE
       * CASCADE`, so dropping a customer who *did* spend would take with them
       * every venue's record of what they spent. That is a third party's revenue
       * history being deleted from a screen about somebody else, and no
       * confirmation dialogue on this console is asking about it.
       *
       * So the database decides, the way it decides for a gift card one route
       * up, and the answer says which happened. `anonymised` is not a lesser
       * outcome: the person is gone from every list and every field that named
       * them is empty. What is left is arithmetic with nobody's name on it.
       */
      const owed =
        ((await ctx.db.get<{ n: number }>(
          `SELECT (SELECT COUNT(*) FROM points_ledger WHERE user_id = $u)
                + (SELECT COUNT(*) FROM transactions WHERE user_id = $u) AS n`,
          { u: user.id },
        ))?.n ?? 0) > 0;

      if (!owed) await ctx.db.run(`DELETE FROM users WHERE id = $u`, { u: user.id });

      return { ...result, outcome: owed ? ('anonymised' as const) : ('deleted' as const) };
    },
  },
  {
    /**
     * Fix what a person is *called*, not what they are worth.
     *
     * `accounts.updateProfile` — the same function `PATCH /v1/me` calls — so an
     * operator correcting a city goes through the same canonicaliser that keeps
     * the weekly board from splitting into one board per spelling, and the same
     * name and phone checks. Nothing here reaches a balance, a streak or a
     * scan count, and there is no route on this file that does.
     *
     * The address is deliberately absent. It is the credential the account signs
     * in with, and changing somebody's login from a console is an account
     * takeover with a nice form around it; the operator's tool for a person
     * locked out is the password reset above, which drops every open session.
     */
    method: 'PATCH',
    pattern: '/v1/admin/users/:id',
    auth: 'admin',
    handler: async (ctx) => {
      const user = await accounts.updateProfile(
        ctx.db,
        ctx.params.id,
        {
          name: optStr(ctx.body, 'name'),
          city: optStr(ctx.body, 'city'),
          countryCode: optStr(ctx.body, 'countryCode'),
          phone: optStr(ctx.body, 'phone'),
          occupation: optStr(ctx.body, 'occupation'),
          language: optStr(ctx.body, 'language'),
        },
        ctx.at,
      );
      await audit.record(ctx.db, {
        actorId: actor(ctx).user.id,
        actorRole: 'admin',
        action: 'user.update',
        entity: 'user',
        entityId: user.id,
        after: { name: user.display_name, city: user.city },
        at: ctx.at,
      });
      return user;
    },
  },
];

