/**
 * The one error type the domain throws, and the codes it throws with.
 *
 * A domain function that fails has to say *why* in a way the HTTP layer can turn
 * into a status and the client can turn into a message — and it must do that
 * without importing anything from `http/`, or the domain stops being testable on
 * its own. Hence a code plus a status, decided here.
 *
 * The list is closed on purpose. A new failure mode is a decision about what the
 * client should do about it, and adding a case here is where that decision gets
 * made rather than at the call site with a free-text string.
 */

export type ErrorCode =
  /* 400 — the request is wrong */
  | 'bad_request'
  | 'invalid_amount'
  | 'invalid_state'
  | 'validation_failed'
  /* 401 / 403 — who is asking */
  | 'unauthenticated'
  | 'forbidden'
  | 'not_verified'
  | 'entitlement_required'
  | 'consent_required'
  /* 404 */
  | 'not_found'
  /* 409 — the world is not in the state the request assumed */
  | 'conflict'
  | 'already_used'
  | 'expired'
  | 'insufficient_points'
  | 'budget_exhausted'
  | 'cap_reached'
  | 'no_energy'
  | 'daily_cap'
  | 'quota_exceeded'
  | 'quiet_hours'
  /* 422 — the trigger did not survive validation (§3.2, §3.3) */
  | 'invalid_trigger'
  | 'replay_detected'
  /* 429 */
  | 'rate_limited'
  /* 500 */
  | 'internal';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  invalid_amount: 400,
  invalid_state: 400,
  validation_failed: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_verified: 403,
  entitlement_required: 403,
  consent_required: 403,
  not_found: 404,
  conflict: 409,
  already_used: 409,
  expired: 409,
  insufficient_points: 409,
  budget_exhausted: 409,
  cap_reached: 409,
  no_energy: 409,
  daily_cap: 409,
  quota_exceeded: 409,
  quiet_hours: 409,
  invalid_trigger: 422,
  replay_detected: 422,
  rate_limited: 429,
  internal: 500,
};

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly detail: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, detail: Record<string, unknown> = {}) {
    super(message ?? code);
    this.name = 'DomainError';
    this.code = code;
    this.status = STATUS[code];
    this.detail = detail;
  }
}

export const fail = (
  code: ErrorCode,
  message?: string,
  detail?: Record<string, unknown>,
): never => {
  throw new DomainError(code, message, detail);
};

/** Narrow a nullable lookup, with the 404 already decided. */
export function required<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new DomainError('not_found', `${what} not found`);
  return value;
}
