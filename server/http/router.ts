/**
 * The router: a table of patterns, and what each one needs before it runs.
 *
 * A table rather than a framework because the interesting part of routing in
 * this backend is not path matching, it is the four-line policy that hangs off
 * every route — who may call it, whether it is idempotent, whether it needs an
 * entitlement. Putting that on the route definition means a new endpoint cannot
 * be added *without* stating its policy, which is the failure mode a
 * `app.post(...)` call with a middleware chain somewhere else invites.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Db } from '../db/db.ts';
import type { Role, Session, User } from '../domain/accounts.ts';
import type { Iso } from '../domain/time.ts';

export interface Actor {
  user: User;
  session: Session;
  roles: Role[];
}

export interface Ctx {
  db: Db;
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: Record<string, unknown>;
  /**
   * The request body exactly as it arrived, before parsing.
   *
   * Only one route needs it and that route could not work without it: Stripe
   * signs the *bytes* it sent, so a webhook signature has to be checked
   * against those bytes. Re-serialising the parsed object would produce a
   * different string the day a key order or a number format differed, and the
   * failure would look like a misconfigured secret rather than a bug.
   */
  rawBody: string;
  ip: string;
  language: string;
  at: Iso;
  /** Null on public routes; guaranteed non-null wherever `auth` is not 'none'. */
  actor: Actor | null;
  /** Present on any route declared idempotent, when the client sent one. */
  idempotencyKey: string | null;
  secret: string;
}

/** What the route needs of the caller. Checked before the handler runs. */
export type Auth = 'none' | 'user' | 'partner' | 'admin';

export interface Route {
  method: string;
  pattern: string;
  auth: Auth;
  handler: (ctx: Ctx) => unknown | Promise<unknown>;
  /**
   * §3.2 / §13: earning and redemption endpoints take an idempotency key so a
   * flaky connection cannot double-submit. Declared per route rather than
   * inferred from the method — most POSTs here are not money.
   */
  idempotent?: boolean;
  /** For the audit trail and rate limiting, a stable name. */
  name?: string;
}

interface Compiled extends Route {
  segments: string[];
  keys: string[];
}

const compile = (route: Route): Compiled => {
  const segments = route.pattern.split('/').filter(Boolean);
  return {
    ...route,
    segments,
    keys: segments.filter((s) => s.startsWith(':')).map((s) => s.slice(1)),
  };
};

export class Router {
  private readonly routes: Compiled[] = [];

  add(routes: Route[]): this {
    for (const route of routes) this.routes.push(compile(route));
    return this;
  }

  /**
   * Find the route for a request.
   *
   * Literal segments beat parameters, so `/venues/mine` and `/venues/:id` can
   * both exist and the specific one wins regardless of declaration order —
   * ordering-dependent routing is a bug that only shows up when somebody
   * reorders a file for tidiness.
   */
  match(method: string, path: string): { route: Compiled; params: Record<string, string> } | null {
    const parts = path.split('/').filter(Boolean);
    let best: { route: Compiled; params: Record<string, string>; score: number } | null = null;

    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== parts.length) continue;

      const params: Record<string, string> = {};
      let score = 0;
      let ok = true;
      for (let i = 0; i < parts.length; i += 1) {
        const segment = route.segments[i];
        if (segment.startsWith(':')) {
          params[segment.slice(1)] = decodeURIComponent(parts[i]);
        } else if (segment === parts[i]) {
          score += 1;
        } else {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (!best || score > best.score) best = { route, params, score };
    }

    return best ? { route: best.route, params: best.params } : null;
  }

  /** Every route, for the `/` index — an API that can list itself is testable. */
  list(): Array<{ method: string; pattern: string; auth: Auth }> {
    return this.routes.map((route) => ({
      method: route.method,
      pattern: route.pattern,
      auth: route.auth,
    }));
  }
}
