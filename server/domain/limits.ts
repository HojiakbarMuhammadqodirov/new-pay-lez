/**
 * One rate limiter, declared on the route rather than remembered in a handler.
 *
 * ## Why it is here and not in each endpoint
 *
 * `throttleSignIn` in `accounts.ts` has always existed and is keyed on the
 * address somebody typed, because the attack it answers is guessing a password.
 * Every *other* public write on this server had nothing: sign-up could be run
 * in a loop to mint accounts, `POST /v1/games/sessions` could be run in a loop
 * to open practice rounds, and the password change on a stolen session could be
 * used to hunt for the current one. None of those is a password guess, so none
 * of them was covered by the one limiter that existed.
 *
 * The fix is a `limit` field on `Route` — the same shape `auth` and `idempotent`
 * already take, and for the same stated reason: a policy on the route
 * definition is a policy a new endpoint cannot be added without stating.
 * `http/server.ts` enforces it between authentication and the handler.
 *
 * ## What it counts, and what it refuses to remember
 *
 * Two keys, because they answer different questions:
 *
 * - **`'account'`** bounds one signed-in caller. It is the user id, which this
 *   server already holds.
 * - **`'connection'`** bounds an unauthenticated caller, and is the *rotating
 *   daily hash* `domain/traffic.ts` computes — an HMAC of the address and agent
 *   keyed on the server secret **and the day**. So a limiter for sign-up cannot
 *   recognise the same connection tomorrow, and nothing durable about anybody
 *   is stored to make it work. That is the same rule the traffic beacon states
 *   and it is load-bearing here too: a rate limiter that quietly built a
 *   per-visitor identifier would have earned the consent banner the whole
 *   product is arranged to avoid.
 *
 * ## Where the rows live
 *
 * `auth_attempts`, which is the table the sign-in throttle already uses, with
 * the endpoint in the subject. A second table holding one integer and a
 * timestamp would need its own schema entry, its own retention sweep and its
 * own purge line, and would hold exactly what this one holds. The subjects
 * cannot collide: the sign-in throttle's is an email address and these are
 * `METHOD /path|<key>`.
 *
 * Retention is `domain/traffic.ts`'s nightly sweep, which already drops
 * anything older than two days — an hour-long window has no use for more.
 *
 * ## The refusal
 *
 * `rate_limited` (429), naming the wait. Deliberately *not* the sign-in
 * throttle's disguise: that one answers `unauthenticated` because telling an
 * attacker "you are throttled" tells them the address they guessed is real.
 * There is nothing to enumerate on sign-up or a game start, so an honest caller
 * is told what happened and how long it lasts rather than being left to guess
 * at a failure that looks like a bug.
 */
import { createHmac } from 'node:crypto';
import type { Db } from '../db/db.ts';
import { DomainError } from './errors.ts';
import { newId } from './ids.ts';
import { plusMinutes, type Iso } from './time.ts';

/** How a route is bounded. Declared on the route; enforced in `http/server.ts`. */
export interface Limit {
  /** Requests allowed in a rolling hour. */
  perHour: number;
  /** Whose hour: the signed-in account, or the (daily-rotating) connection. */
  by: 'account' | 'connection';
}

/**
 * The connection's key for today.
 *
 * Same construction as `traffic.visitorKey` and deliberately a separate call
 * rather than an import of it: that one is the *analytics* identifier and a
 * change to it there (a different field, a coarser bucket) must not silently
 * change what this limiter buckets on. The `limit:` prefix keeps the two
 * namespaces apart even when the inputs are identical.
 */
export const connectionKey = (secret: string, day: string, ip: string, agent: string): string =>
  createHmac('sha256', `limit:${secret}:${day}`).update(`${ip}\n${agent}`).digest('hex').slice(0, 32);

/**
 * Count this call, and refuse it if the window is already full.
 *
 * Counted *before* the work rather than after it, so a handler that throws
 * still costs its caller an attempt — otherwise a limiter on sign-up is
 * bypassed by sending a body that fails validation, which is the cheapest
 * request there is.
 */
export async function enforce(
  db: Db,
  input: { endpoint: string; key: string; limit: Limit; at: Iso },
): Promise<void> {
  const subject = `${input.endpoint}|${input.key}`;
  const since = plusMinutes(input.at, -60);

  const recent = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM auth_attempts WHERE subject = $s AND at >= $since`,
    { s: subject, since },
  );

  if ((recent?.n ?? 0) >= input.limit.perHour) {
    throw new DomainError('rate_limited', 'too many requests — try again later', {
      retryAfterMinutes: 60,
      limit: input.limit.perHour,
    });
  }

  await db.run(`INSERT INTO auth_attempts (id, subject, at, ok) VALUES ($id, $s, $at, 1)`, {
    id: newId('lim'),
    s: subject,
    at: input.at,
  });
}
