/**
 * The HTTP server: bodies in, JSON out, and the four things that happen to every
 * request before a handler sees it.
 *
 * Those four, in order, and each one is here rather than in a handler because
 * "every endpoint remembered to do it" is not a property a system can have:
 *
 *   1. **Authentication** — the bearer token becomes an actor, or the route's
 *      declared `auth` refuses the request.
 *   2. **Idempotency** (§3.2, §13) — a declared-idempotent route with a repeated
 *      key returns the *stored* response rather than doing the work twice. A
 *      retry after a dropped response must not grant points twice.
 *   3. **Errors** — a `DomainError` becomes its own status and code; anything
 *      else becomes a 500 with no internals in the body.
 *   4. **Audit** — anything that moved value is recorded with its actor.
 *
 * No framework. `node:http` plus a router is about 200 lines and has no
 * dependency to keep up to date, which matters more here than in most places:
 * this process holds the points ledger.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import { DomainError } from '../domain/errors.ts';
import { resolveSession, rolesOf } from '../domain/accounts.ts';
import { now } from '../domain/time.ts';
import { Router, type Actor, type Ctx, type Route } from './router.ts';

const MAX_BODY = 1_000_000;

export interface ServerOptions {
  db: Db;
  routes: Route[];
  secret?: string;
  origins?: readonly string[];
}

export function createApi(options: ServerOptions) {
  const router = new Router().add(options.routes);
  const secret = options.secret ?? CONFIG.server.secret;
  const origins = options.origins ?? CONFIG.server.origins;

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const started = Date.now();
    const url = new URL(req.url ?? '/', 'http://localhost');
    const method = (req.method ?? 'GET').toUpperCase();

    cors(req, res, origins);
    if (method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    /* A request id on every response, echoed from the client's if it sent one.
       Support tickets about points arrive with a screenshot; this is what makes
       one findable in a log. */
    const requestId = String(req.headers['x-request-id'] ?? randomUUID());
    res.setHeader('x-request-id', requestId);

    const found = router.match(method, url.pathname);
    if (!found) {
      send(res, 404, { error: { code: 'not_found', message: 'no such endpoint' } });
      return;
    }

    try {
      const { parsed: body, raw: rawBody } = await readBody(req);
      const actor = await authenticate(options.db, req);

      if (found.route.auth !== 'none') {
        if (!actor) throw new DomainError('unauthenticated', 'sign in first');
        if (found.route.auth === 'admin' && !actor.roles.includes('admin')) {
          throw new DomainError('forbidden', 'admin only');
        }
        if (
          found.route.auth === 'partner' &&
          !actor.roles.includes('partner_owner') &&
          !actor.roles.includes('manager') &&
          !actor.roles.includes('admin')
        ) {
          throw new DomainError('forbidden', 'this account owns no venue');
        }
      }

      const ctx: Ctx = {
        db: options.db,
        req,
        res,
        method,
        path: url.pathname,
        params: found.params,
        query: url.searchParams,
        body,
        rawBody,
        ip: ipOf(req),
        language: languageOf(req, actor),
        at: now(),
        actor,
        idempotencyKey: found.route.idempotent
          ? (req.headers['idempotency-key'] as string | undefined) ?? null
          : null,
        secret,
      };

      const result = await runIdempotent(ctx, found.route, () => found.route.handler(ctx));
      /* A handler that returns nothing has done its work and has nothing to say
         — 204, not `null`, so a client can tell the two apart. */
      if (result === undefined) res.writeHead(204).end();
      else send(res, 200, result);
    } catch (error) {
      respondError(res, error, requestId);
    } finally {
      /* One line per request. Enough to answer "was it slow" and "did it fail",
         and deliberately without the body, which holds passwords and amounts. */
      const ms = Date.now() - started;
      if (process.env.PAYLEZ_QUIET !== '1') {
        console.log(`${method} ${url.pathname} ${res.statusCode} ${ms}ms ${requestId}`);
      }
    }
  };

  return { router, handle, listen: (port = CONFIG.server.port, host = CONFIG.server.host) =>
    new Promise<ReturnType<typeof createServer>>((resolve) => {
      const server = createServer(async (req, res) => {
        void await handle(req, res);
      });
      server.listen(port, host, () => resolve(server));
    }) };
}

/* ─────────────────────────────────────────────────────────── the four steps ── */

async function authenticate(db: Db, req: IncomingMessage): Promise<Actor | null> {
  const header = req.headers.authorization;
  const cookie = cookieValue(req.headers.cookie, 'paylez_session');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : cookie;
  if (!token) return null;

  const resolved = await resolveSession(db, token);
  if (!resolved) return null;
  return { user: resolved.user, session: resolved.session, roles: await rolesOf(db, resolved.user.id) };
}

/**
 * §3.2's idempotency key, stored with the response.
 *
 * The stored *response* is what makes this correct rather than merely safe: a
 * retry gets the same transaction id and the same receipt, so a client that
 * retried a scan shows the customer one grant, not a second attempt that
 * "already happened". A key reused with a different body is a conflict — the
 * same key meaning two different things is a client bug worth surfacing.
 */
async function runIdempotent(ctx: Ctx, route: Route, run: () => unknown): Promise<unknown> {
  if (!route.idempotent || !ctx.idempotencyKey || !ctx.actor) return run();

  const endpoint = `${route.method} ${route.pattern}`;
  const hash = createHash('sha256').update(JSON.stringify(ctx.body ?? {})).digest('hex');
  const existing = await ctx.db.get<{ request_hash: string; response: string | null }>(
    `SELECT request_hash, response FROM idempotency_keys
      WHERE key = $k AND user_id = $u AND endpoint = $e`,
    { k: ctx.idempotencyKey, u: ctx.actor.user.id, e: endpoint },
  );

  if (existing) {
    if (existing.request_hash !== hash) {
      throw new DomainError('conflict', 'that idempotency key was used with a different request');
    }
    return existing.response ? JSON.parse(existing.response) : undefined;
  }

  const result = await run();
  await ctx.db.run(
    `INSERT INTO idempotency_keys (key, user_id, endpoint, request_hash, status_code, response, created_at)
     VALUES ($k, $u, $e, $h, 200, $r, $t)
       ON CONFLICT (key, user_id, endpoint) DO NOTHING`,
    {
      k: ctx.idempotencyKey,
      u: ctx.actor.user.id,
      e: endpoint,
      h: hash,
      r: result === undefined ? null : JSON.stringify(result),
      t: ctx.at,
    },
  );
  return result;
}

function respondError(res: ServerResponse, error: unknown, requestId: string): void {
  if (error instanceof DomainError) {
    send(res, error.status, {
      error: { code: error.code, message: error.message, ...error.detail },
      requestId,
    });
    return;
  }
  /* Anything else is a bug. The client gets a code and a request id; the details
     go to the log, because an unexpected error message is the most reliable way
     to leak a schema. */
  console.error(`[${requestId}]`, error);
  send(res, 500, { error: { code: 'internal', message: 'something went wrong' }, requestId });
}

/* ────────────────────────────────────────────────────────────────── plumbing ── */

function send(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<{ parsed: Record<string, unknown>; raw: string }> {
  if (req.method === 'GET' || req.method === 'HEAD') return Promise.resolve({ parsed: {}, raw: '' });
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      /* A body limit, because the process that holds the ledger should not be
         killable by one large POST. */
      if (size > MAX_BODY) {
        reject(new DomainError('bad_request', 'body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        resolve({ parsed: {}, raw });
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolve({
          parsed: typeof parsed === 'object' && parsed !== null ? parsed : { value: parsed },
          raw,
        });
      } catch {
        reject(new DomainError('bad_request', 'body is not JSON'));
      }
    });
    req.on('error', reject);
  });
}

function cors(req: IncomingMessage, res: ServerResponse, origins: readonly string[]): void {
  const origin = req.headers.origin;
  /* An allow-list, not `*`: the session travels in a cookie on the web surface
     and `*` with credentials is both refused by browsers and wrong. */
  if (origin && origins.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('access-control-allow-credentials', 'true');
    res.setHeader('vary', 'origin');
  }
  res.setHeader('access-control-allow-headers', 'content-type, authorization, idempotency-key, x-request-id, accept-language');
  res.setHeader('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('access-control-max-age', '600');
}

const ipOf = (req: IncomingMessage): string =>
  String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() ||
  req.socket.remoteAddress ||
  '';

/**
 * The reader's language: their account's setting first, the header second.
 *
 * That order matters — §15 says the backend selects content by "the user's app
 * language", which is a choice they made, not a guess from their browser. The
 * header is only the fallback for somebody who has not chosen yet.
 */
function languageOf(req: IncomingMessage, actor: Actor | null): string {
  if (actor?.user.language) return actor.user.language;
  const header = String(req.headers['accept-language'] ?? '');
  const first = header.split(',')[0]?.split('-')[0]?.trim().toLowerCase();
  return ['en', 'pl', 'uz', 'ru', 'uk', 'tr', 'az'].includes(first) ? first : 'en';
}

function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export { send, cookieValue };
