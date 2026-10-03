/**
 * The mission catalogue on the wire — rulebook §8.
 *
 * A file of its own rather than more rows in `consumer.ts`, because it carries
 * both halves of the feature: what a player reads and claims, and the small
 * operator surface §12.3 asks for ("someone has to create missions #57–65").
 * The rules are all in `domain/missions.ts` and `domain/learning.ts`; every
 * handler here is input in, domain call, output out.
 *
 * The response shape is the contract the app and this server agreed, in
 * camelCase:
 *
 *   GET  /v1/missions                   → { bands: [{ key, title, resetsAt, missions: [...] }], unclaimed }
 *   POST /v1/missions/:id/claim         → { mission, points, balance }  — 409 `conflict` when not claimable
 *   GET  /v1/missions/learning/:id      → the module, questions without answers, and its mission
 *   POST /v1/missions/learning/:id/answers { answers: [optionIndex…] } → graded, and the mission
 *
 * The daily check-in is mission #1 and is claimed through the check-in itself;
 * `POST /v1/missions/daily.check_in/claim` calls the same function as
 * `POST /v1/daily/check-in`, so either endpoint is the one grant.
 */
import { CONFIG } from '../../config.ts';
import * as audit from '../../domain/audit.ts';
import { DomainError } from '../../domain/errors.ts';
import { newId } from '../../domain/ids.ts';
import * as learning from '../../domain/learning.ts';
import * as missions from '../../domain/missions.ts';
import { actor, bool, list, oneOf, optInt, optStr, str } from '../input.ts';
import type { Ctx, Route } from '../router.ts';

/** A campaign row as the console reads it: camelCase, `config` parsed. */
const campaignOut = (row: missions.CampaignRow) => {
  let config: unknown = {};
  try {
    config = JSON.parse(row.config);
  } catch {
    config = {};
  }
  return {
    id: row.id,
    missionId: `${row.band}.${row.id}`,
    band: row.band,
    kind: row.kind,
    title: row.title,
    description: row.description,
    reward: row.reward,
    venueId: row.venue_id,
    config,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

/** `config` must be a JSON object if it is sent at all. */
function configIn(body: Record<string, unknown>): Record<string, unknown> | undefined {
  const value = body.config;
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new DomainError('validation_failed', 'config must be an object', { field: 'config' });
  }
  return value as Record<string, unknown>;
}

/** The fields a create or an edit may carry, read once for both. */
function campaignPatch(ctx: Ctx): Partial<missions.CampaignInput> {
  const body = ctx.body;
  const patch: Partial<missions.CampaignInput> = {};
  if (body.kind !== undefined) patch.kind = oneOf(body, 'kind', missions.CAMPAIGN_KIND_KEYS);
  const title = optStr(body, 'title');
  if (title !== undefined) patch.title = title;
  const description = optStr(body, 'description');
  if (description !== undefined) patch.description = description;
  if (body.reward !== undefined) patch.reward = optInt(body, 'reward', { min: 1, max: 100_000 }) ?? null;
  if (body.venueId !== undefined) patch.venueId = optStr(body, 'venueId') ?? null;
  const config = configIn(body);
  if (config !== undefined) patch.config = config;
  const startsAt = optStr(body, 'startsAt');
  if (startsAt !== undefined) patch.startsAt = startsAt;
  const endsAt = optStr(body, 'endsAt');
  if (endsAt !== undefined) patch.endsAt = endsAt;
  if (body.active !== undefined) patch.active = bool(body, 'active');
  return patch;
}

export const missionRoutes: Route[] = [
  /* ═════════════════════════════════════════════════════════ the player ══ */
  {
    /**
     * Every band, with this account's progress on every mission.
     *
     * A read of its own rather than a field on `/v1/games/state`, for the reason
     * `/v1/daily/tasks` gives: the state is four cheap reads the Play screen
     * cannot draw without, and this walks the week's rounds, visits and ledger.
     */
    method: 'GET',
    pattern: '/v1/missions',
    auth: 'user',
    handler: async (ctx) => await missions.missionsFor(ctx.db, actor(ctx).user.id, ctx.at),
  },
  {
    /**
     * Claim one completed mission. No body: the server knows who is asking,
     * what time it is and what the mission pays, and a claim that let the
     * client name any of them is a claim the client can aim.
     *
     * Idempotent on the `Idempotency-Key` as well as on the claim's own key, for
     * the reason the check-in route gives: the key on `mission_claims` stops a
     * second *claim*, the header stops a retried *request* being run twice and
     * hands the phone that lost the first reply the original body.
     */
    method: 'POST',
    pattern: '/v1/missions/:id/claim',
    auth: 'user',
    idempotent: true,
    limit: { perHour: CONFIG.limits.missionClaimPerHour, by: 'account' },
    handler: async (ctx) =>
      await missions.claim(ctx.db, { userId: actor(ctx).user.id, missionId: ctx.params.id, at: ctx.at }),
  },
  {
    /** A learning module to take: its questions, without their answers. `:id`
     *  is the module's id (`pesel`) or its mission's (`learning.pesel`). */
    method: 'GET',
    pattern: '/v1/missions/learning/:id',
    auth: 'user',
    handler: async (ctx) => {
      const module = learning.moduleFor(ctx.params.id);
      const userId = actor(ctx).user.id;
      const progress = (await learning.progressFor(ctx.db, userId)).get(module.id);
      return {
        ...learning.publicModule(module),
        progress: {
          attempts: progress?.attempts ?? 0,
          bestCorrect: progress?.bestCorrect ?? 0,
          completedAt: progress?.completedAt ?? null,
        },
        mission: await missions.missionFor(ctx.db, userId, `learning.${module.id}`, ctx.at),
      };
    },
  },
  {
    /**
     * Submit answers — one option index per question, in order. The server
     * grades; the reply says which were right and what the right answer was,
     * because this is teaching. Passing (every answer right) completes the
     * mission, which is then claimed like any other.
     */
    method: 'POST',
    pattern: '/v1/missions/learning/:id/answers',
    auth: 'user',
    limit: { perHour: CONFIG.limits.learningAnswersPerHour, by: 'account' },
    handler: async (ctx) => {
      const userId = actor(ctx).user.id;
      const graded = await learning.grade(ctx.db, {
        userId,
        moduleId: ctx.params.id,
        answers: list(ctx.body, 'answers', (item) => item),
        at: ctx.at,
      });
      return {
        ...graded,
        mission: await missions.missionFor(ctx.db, userId, `learning.${graded.moduleId}`, ctx.at),
      };
    },
  },

  /* ═══════════════════════════════════════════════ the operator (§12.3) ══ */
  {
    /** Every campaign, live or not, newest first. */
    method: 'GET',
    pattern: '/v1/admin/mission-campaigns',
    auth: 'admin',
    handler: async (ctx) => ({
      kinds: missions.CAMPAIGN_KINDS,
      campaigns: (await missions.listCampaigns(ctx.db)).map(campaignOut),
    }),
  },
  {
    /**
     * Author a seasonal (§8.5) or partner-sponsored (§8.6) mission.
     *
     * `kind` decides the band and the rule; `config` carries that rule's
     * parameters — `{metric, target, city}` for a city challenge,
     * `{fromHour, toHour}` for quiet hours, `{dealId}` for a new menu item. A
     * partner kind needs its `venueId` and its own `reward`; a seasonal one
     * falls back on `CONFIG.missions.campaignRewards`.
     */
    method: 'POST',
    pattern: '/v1/admin/mission-campaigns',
    auth: 'admin',
    handler: async (ctx) => {
      const patch = campaignPatch(ctx);
      const row = await missions.createCampaign(ctx.db, {
        ...patch,
        kind: oneOf(ctx.body, 'kind', missions.CAMPAIGN_KIND_KEYS),
        startsAt: str(ctx.body, 'startsAt'),
        endsAt: str(ctx.body, 'endsAt'),
        id: newId('mcp'),
        actorId: actor(ctx).user.id,
        at: ctx.at,
      });
      await audit.record(ctx.db, {
        actorId: actor(ctx).user.id,
        actorRole: 'admin',
        action: 'mission_campaign.create',
        entity: 'mission_campaign',
        entityId: row.id,
        venueId: row.venue_id,
        after: campaignOut(row),
        at: ctx.at,
      });
      return campaignOut(row);
    },
  },
  {
    /** Edit a campaign, or switch it off with `{active: false}`. */
    method: 'PATCH',
    pattern: '/v1/admin/mission-campaigns/:id',
    auth: 'admin',
    handler: async (ctx) => {
      const before = await missions.getCampaign(ctx.db, ctx.params.id);
      const row = await missions.updateCampaign(ctx.db, ctx.params.id, campaignPatch(ctx), ctx.at);
      await audit.record(ctx.db, {
        actorId: actor(ctx).user.id,
        actorRole: 'admin',
        action: 'mission_campaign.update',
        entity: 'mission_campaign',
        entityId: row.id,
        venueId: row.venue_id,
        before: campaignOut(before),
        after: campaignOut(row),
        at: ctx.at,
      });
      return campaignOut(row);
    },
  },
  {
    /** Remove a campaign. Claims already paid under it keep their record. */
    method: 'DELETE',
    pattern: '/v1/admin/mission-campaigns/:id',
    auth: 'admin',
    handler: async (ctx) => {
      const row = await missions.deleteCampaign(ctx.db, ctx.params.id);
      await audit.record(ctx.db, {
        actorId: actor(ctx).user.id,
        actorRole: 'admin',
        action: 'mission_campaign.delete',
        entity: 'mission_campaign',
        entityId: row.id,
        venueId: row.venue_id,
        before: campaignOut(row),
        at: ctx.at,
      });
      return { ok: true };
    },
  },
];
