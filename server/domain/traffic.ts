/**
 * Website traffic, and the platform activity feed — the operator's own console.
 *
 * Neither statement of work asks for this. Both are about what the *product*
 * does; this is about what the *site* is doing, which is the question an
 * operator actually opens a console to ask: is anybody coming, where from, and
 * what did they do when they got here.
 *
 * It is here rather than in a third-party tag for the reason the fonts are
 * self-hosted and the geometry comes from npm: an analytics script is a runtime
 * dependency that reads every visitor, and this repository has spent a lot of
 * effort not having any of those.
 *
 * ## A visitor is a daily hash, not a person
 *
 * The whole privacy design is one decision. `visitor_day` is an HMAC of the IP
 * address and user agent under a key that is the server secret *plus the day*.
 * That is enough to answer "how many different people came on Tuesday" and "was
 * this the same person's second page"; it is deliberately not enough to answer
 * "did this person come back on Wednesday", because tomorrow the key is
 * different and the input was never stored.
 *
 * The consequences are worth stating because they read as gaps otherwise:
 *
 * - **No cookie is set and nothing is written to the device.** There is no
 *   banner to show because there is nothing to consent to.
 * - **No IP address is ever stored**, only the HMAC of one.
 * - **There is no "returning visitors" figure for anonymous traffic and there
 *   cannot be one.** `overview` does not report it. Inventing it would mean
 *   keeping a durable identifier, which is the thing this design exists to
 *   avoid; reporting it as zero would be a lie in the other direction.
 *
 * A signed-in visitor is a different case and is treated as one. `user_id` is
 * recorded, because that person has an account and their own activity is
 * already theirs. So anonymous traffic is *counted* and identified traffic is
 * *attributed* — and returning-visitor questions are answered for the second
 * group only, which is the group it is honest to answer them for.
 *
 * ## The session is derived, never sent
 *
 * The client does not hold a session id and could not forge one. A beacon
 * arrives, the visitor hash is derived from the connection, and the event joins
 * that visitor's most recent session if it is still inside the idle window or
 * opens a new one if it is not. A client that lies can only lie about its own
 * page path, which costs a wrong row in a list of pages.
 */
import { createHmac } from 'node:crypto';
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import { newId } from './ids.ts';
import { minutesBetween, now, plusDays, type Iso } from './time.ts';

export type EventKind = 'view' | 'action';

export interface IncomingEvent {
  kind: EventKind;
  path: string;
  name?: string;
}

export interface Beacon {
  events: IncomingEvent[];
  ip: string;
  agent: string;
  /** The document referrer, full URL. Only its host survives. */
  referrer?: string;
  language?: string;
  /** From the edge's country header where one exists. Never inferred. */
  country?: string;
  userId?: string | null;
  accountType?: string | null;
}

/**
 * The daily-rotating visitor key.
 *
 * The day is in the HMAC *key* rather than the message so that yesterday's
 * digests cannot be recomputed from today's key either — rotating the salt is
 * the point, and salting the message alone would leave the key able to reproduce
 * every previous day's hashes.
 */
export function visitorKey(secret: string, day: string, ip: string, agent: string): string {
  return createHmac('sha256', `${secret}:${day}`).update(`${ip}\n${agent}`).digest('hex').slice(0, 32);
}

/** Crude on purpose: three buckets an operator can act on, and no fingerprinting. */
function deviceOf(agent: string): string {
  const ua = agent.toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobi|android|iphone/.test(ua)) return 'mobile';
  return 'desktop';
}

/**
 * The host, or null.
 *
 * Only the host is kept: a full referrer carries the search terms somebody
 * typed to find you, which is their business and not the operator's. A referrer
 * from the site itself is not a referrer at all.
 */
function referrerHost(referrer: string | undefined, ownHosts: readonly string[]): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).host.replace(/^www\./, '');
    if (!host || ownHosts.includes(host)) return null;
    return host.slice(0, 80);
  } catch {
    return null;
  }
}

/**
 * Paths are truncated rather than rejected, and stripped of everything after a
 * `?`. A page is still a page when its name is long; a query string is where an
 * email address ends up in somebody's analytics.
 */
function cleanPath(path: string): string {
  const trimmed = (path || '/').split('?')[0]!.split('&')[0]!.trim();
  const normalised = trimmed.startsWith('#') || trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return normalised.slice(0, CONFIG.traffic.maxPathLength) || '/';
}

const dayOf = (at: Iso): string => at.slice(0, 10);

/**
 * Record a beacon. Returns the session it landed in, mostly so the tests can
 * assert that two beacons inside the window are one visit and not two.
 */
export function record(db: Db, beacon: Beacon, secret: string, at: Iso = now()): string {
  const events = beacon.events.slice(0, CONFIG.traffic.maxBatch);
  if (events.length === 0) return '';

  const day = dayOf(at);
  const visitor = visitorKey(secret, day, beacon.ip, beacon.agent);
  const first = cleanPath(events[0]!.path);

  /* The most recent session for this visitor *today*. Scoping to the day as
     well as the idle window means a session can never straddle the midnight the
     visitor key rotates at — which would otherwise leave a session whose second
     half belongs to a hash nothing else will ever match. */
  const open = db.get<{ id: string; last_at: string }>(
    `SELECT id, last_at FROM web_sessions
      WHERE visitor_day = $v AND day = $d ORDER BY last_at DESC LIMIT 1`,
    { v: visitor, d: day },
  );

  const fresh = !open || minutesBetween(open.last_at, at) > CONFIG.traffic.sessionIdleMinutes;
  let sessionId: string;

  if (fresh) {
    sessionId = newId('wbs');
    db.run(
      `INSERT INTO web_sessions
         (id, visitor_day, day, started_at, last_at, views, actions,
          entry_path, exit_path, referrer_host, country, language, device, user_id, account_type)
       VALUES ($id, $v, $d, $at, $at, 0, 0, $p, $p, $r, $c, $l, $dev, $u, $t)`,
      {
        id: sessionId,
        v: visitor,
        d: day,
        at,
        p: first,
        r: referrerHost(beacon.referrer, CONFIG.server.origins.map(hostOf)),
        c: beacon.country?.slice(0, 2).toUpperCase() ?? null,
        l: beacon.language?.slice(0, 8) ?? null,
        dev: deviceOf(beacon.agent),
        u: beacon.userId ?? null,
        t: beacon.accountType ?? null,
      },
    );
  } else {
    sessionId = open.id;
  }

  let views = 0;
  let actions = 0;
  for (const event of events) {
    const kind: EventKind = event.kind === 'action' ? 'action' : 'view';
    if (kind === 'view') views += 1;
    else actions += 1;
    db.run(
      `INSERT INTO web_events (id, session_id, at, day, kind, path, name, user_id)
       VALUES ($id, $s, $at, $d, $k, $p, $n, $u)`,
      {
        id: newId('wbe'),
        s: sessionId,
        at,
        d: day,
        k: kind,
        p: cleanPath(event.path),
        n: event.name?.slice(0, 60) ?? null,
        u: beacon.userId ?? null,
      },
    );
  }

  /* Signing in mid-session attributes the session that was already running —
     the visit did not start when the sign-in finished. */
  db.run(
    `UPDATE web_sessions
        SET last_at = $at, views = views + $v, actions = actions + $a, exit_path = $p,
            user_id = COALESCE($u, user_id), account_type = COALESCE($t, account_type)
      WHERE id = $id`,
    {
      at,
      v: views,
      a: actions,
      p: cleanPath(events[events.length - 1]!.path),
      u: beacon.userId ?? null,
      t: beacon.accountType ?? null,
      id: sessionId,
    },
  );

  return sessionId;
}

const hostOf = (origin: string): string => {
  try {
    return new URL(origin).host.replace(/^www\./, '');
  } catch {
    return origin;
  }
};

/* ═══════════════════════════════════════════════════════════ the console ══ */

export interface TrafficRange {
  from: string;
  to: string;
}

/** The default window: the last 30 days, inclusive of today. */
export function defaultRange(at: Iso = now()): TrafficRange {
  return { from: dayOf(plusDays(at, -29)), to: dayOf(at) };
}

export function overview(db: Db, range: TrafficRange) {
  const p = { from: range.from, to: range.to };

  const totals = db.get<{
    sessions: number;
    views: number;
    actions: number;
    signed_in: number;
  }>(
    `SELECT COUNT(*) AS sessions, COALESCE(SUM(views), 0) AS views,
            COALESCE(SUM(actions), 0) AS actions,
            COALESCE(SUM(CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS signed_in
       FROM web_sessions WHERE day BETWEEN $from AND $to`,
    p,
  );

  /* Summed per day, because a visitor hash only means anything within its day.
     This is "visits by distinct people, added up over the range" and not
     "distinct people over the range" — the second is not answerable by design,
     and the field is named for what it is. */
  const dailyVisitors = db.get<{ n: number }>(
    `SELECT COALESCE(SUM(n), 0) AS n FROM (
        SELECT COUNT(DISTINCT visitor_day) AS n FROM web_sessions
         WHERE day BETWEEN $from AND $to GROUP BY day)`,
    p,
  )?.n ?? 0;

  const trend = db.all<{ day: string; visitors: number; sessions: number; views: number }>(
    `SELECT day, COUNT(DISTINCT visitor_day) AS visitors, COUNT(*) AS sessions,
            COALESCE(SUM(views), 0) AS views
       FROM web_sessions WHERE day BETWEEN $from AND $to
      GROUP BY day ORDER BY day`,
    p,
  );

  const pages = db.all<{ path: string; views: number; sessions: number }>(
    `SELECT path, COUNT(*) AS views, COUNT(DISTINCT session_id) AS sessions
       FROM web_events WHERE day BETWEEN $from AND $to AND kind = 'view'
      GROUP BY path ORDER BY views DESC LIMIT 25`,
    p,
  );

  const actions = db.all<{ name: string; count: number }>(
    `SELECT COALESCE(name, path) AS name, COUNT(*) AS count
       FROM web_events WHERE day BETWEEN $from AND $to AND kind = 'action'
      GROUP BY name ORDER BY count DESC LIMIT 25`,
    p,
  );

  const bucket = (column: string, limit = 15) =>
    db.all<{ key: string | null; sessions: number }>(
      `SELECT ${column} AS key, COUNT(*) AS sessions FROM web_sessions
        WHERE day BETWEEN $from AND $to GROUP BY ${column}
        ORDER BY sessions DESC LIMIT ${limit}`,
      p,
    );

  /* Direct traffic is a null host, not a missing row — an operator reading a
     referrer list wants to know how much of it arrived with no referrer at all,
     and that is usually the largest single line. */
  const referrers = db.all<{ key: string; sessions: number }>(
    `SELECT COALESCE(referrer_host, 'direct') AS key, COUNT(*) AS sessions
       FROM web_sessions WHERE day BETWEEN $from AND $to
      GROUP BY key ORDER BY sessions DESC LIMIT 20`,
    p,
  );

  /* Answerable for accounts and only for accounts — see the header. */
  const returning = db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM (
        SELECT user_id FROM web_sessions
         WHERE day BETWEEN $from AND $to AND user_id IS NOT NULL
         GROUP BY user_id HAVING COUNT(DISTINCT day) > 1)`,
    p,
  )?.n ?? 0;

  const knownVisitors = db.get<{ n: number }>(
    `SELECT COUNT(DISTINCT user_id) AS n FROM web_sessions
      WHERE day BETWEEN $from AND $to AND user_id IS NOT NULL`,
    p,
  )?.n ?? 0;

  return {
    range,
    sessions: totals?.sessions ?? 0,
    views: totals?.views ?? 0,
    actions: totals?.actions ?? 0,
    /* Named for exactly what it counts. See the comment on the query. */
    dailyVisitors,
    signedInSessions: totals?.signed_in ?? 0,
    accounts: { seen: knownVisitors, returning },
    /**
     * Stated rather than left to be inferred. A console that shows every other
     * figure and silently omits this one invites somebody to compute it wrongly
     * from the ones beside it.
     */
    anonymousReturningVisitors: null as null,
    trend,
    pages,
    topActions: actions,
    referrers,
    countries: bucket('country'),
    languages: bucket('language'),
    devices: bucket('device'),
    accountTypes: bucket('account_type'),
  };
}

/**
 * The platform activity feed: one list, newest first, of the things that
 * happened across the whole product.
 *
 * A union rather than six lists side by side, because the operator's question
 * is chronological — "what has been going on" — and six independently paged
 * tables cannot answer it. Each arm selects the same four columns so the shape
 * is uniform, and every arm is bounded before the union so one busy table
 * cannot starve the others out of the window.
 */
export function activity(db: Db, limit = 100) {
  const per = Math.max(10, Math.min(limit, 200));
  const rows = db.all<{ at: string; kind: string; subject: string; detail: string | null }>(
    `SELECT * FROM (
        SELECT created_at AS at, 'signup' AS kind,
               COALESCE(display_name, 'someone') AS subject,
               city AS detail
          FROM users WHERE status = 'active' ORDER BY created_at DESC LIMIT $n)
      UNION ALL
      SELECT * FROM (
        SELECT created_at AS at, 'venue' AS kind, name AS subject, city AS detail
          FROM venues WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $n)
      UNION ALL
      SELECT * FROM (
        SELECT confirmed_at AS at, 'transaction' AS kind, v.name AS subject,
               CAST(t.amount_minor AS TEXT) AS detail
          FROM transactions t JOIN venues v ON v.id = t.venue_id
         WHERE t.status = 'committed' AND t.confirmed_at IS NOT NULL
         ORDER BY t.confirmed_at DESC LIMIT $n)
      UNION ALL
      SELECT * FROM (
        SELECT issued_at AS at, 'voucher' AS kind, code AS subject,
               CAST(points_cost AS TEXT) AS detail
          FROM issued_vouchers ORDER BY issued_at DESC LIMIT $n)
      UNION ALL
      SELECT * FROM (
        SELECT finished_at AS at, 'game' AS kind, game_type AS subject,
               CAST(points_awarded AS TEXT) AS detail
          FROM game_sessions WHERE finished_at IS NOT NULL
         ORDER BY finished_at DESC LIMIT $n)
      ORDER BY at DESC LIMIT $n`,
    { n: per },
  );
  return rows;
}

/** Prune the per-event rows past the retention window. Called by the daily job. */
export function prune(db: Db, at: Iso = now()): number {
  const cutoff = dayOf(plusDays(at, -CONFIG.traffic.retentionDays));
  const events = db.run(`DELETE FROM web_events WHERE day < $c`, { c: cutoff });
  db.run(`DELETE FROM web_sessions WHERE day < $c`, { c: cutoff });
  db.run(`DELETE FROM auth_attempts WHERE at < $c`, { c: plusDays(at, -2) });
  return events.changes;
}
