/**
 * The audit log — Part E: "audit everything that authors or moves value: deal
 * publishes, budget changes, subscription changes, fraud reversals, tag
 * assignments — all logged with actor and timestamp."
 *
 * One function, deliberately. An audit trail with several entry points grows a
 * gap the day somebody adds a sixth one and forgets, and the gap is invisible
 * until the moment it is needed. Everything that writes here writes through
 * `record`, and the `before`/`after` pair is what makes an entry answer "what
 * changed" rather than merely "something did".
 */
import type { Db } from '../db/db.ts';
import { newId } from './ids.ts';
import { now, type Iso } from './time.ts';

export interface AuditInput {
  actorId: string | null;
  actorRole?: string;
  action: string;
  entity: string;
  entityId?: string | null;
  venueId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  at?: Iso;
}

export async function record(db: Db, input: AuditInput): Promise<string> {
  const id = newId('aud');
  await db.run(
    `INSERT INTO audit_log
       (id, actor_id, actor_role, action, entity, entity_id, venue_id, before, after, ip, created_at)
     VALUES ($i, $a, $r, $ac, $e, $ei, $v, $b, $af, $ip, $t)`,
    {
      i: id,
      a: input.actorId,
      r: input.actorRole ?? null,
      ac: input.action,
      e: input.entity,
      ei: input.entityId ?? null,
      v: input.venueId ?? null,
      b: input.before === undefined ? null : JSON.stringify(input.before),
      af: input.after === undefined ? null : JSON.stringify(input.after),
      ip: input.ip ?? null,
      t: input.at ?? now(),
    },
  );
  return id;
}

export const forEntity = async (db: Db, entity: string, entityId: string, limit = 50) =>
  await db.all(
    `SELECT id, actor_id, actor_role, action, before, after, created_at FROM audit_log
      WHERE entity = $e AND entity_id = $i ORDER BY created_at DESC LIMIT $l`,
    { e: entity, i: entityId, l: limit },
  );

export const forVenue = async (db: Db, venueId: string, limit = 100) =>
  await db.all(
    `SELECT id, actor_id, action, entity, entity_id, created_at FROM audit_log
      WHERE venue_id = $v ORDER BY created_at DESC LIMIT $l`,
    { v: venueId, l: limit },
  );

export const recent = async (db: Db, limit = 200) =>
  await db.all(
    `SELECT id, actor_id, actor_role, action, entity, entity_id, venue_id, created_at
       FROM audit_log ORDER BY created_at DESC LIMIT $l`,
    { l: limit },
  );
