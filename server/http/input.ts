/**
 * Reading input, with the validation attached.
 *
 * Every field a client sends arrives as `unknown` and leaves as a type, or the
 * request fails with the field named. That is the whole contract, and it is a
 * file rather than a habit because "the server is the single source of truth"
 * (both specs, principle 1) starts with the server not believing a string when
 * it asked for an integer amount of money.
 */
import { DomainError } from '../domain/errors.ts';
import type { Ctx } from './router.ts';

type Bag = Record<string, unknown>;

export function str(body: Bag, field: string, opts: { max?: number } = {}): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new DomainError('validation_failed', `${field} is required`, { field });
  }
  if (opts.max && value.length > opts.max) {
    throw new DomainError('validation_failed', `${field} is too long`, { field, max: opts.max });
  }
  return value.trim();
}

export function optStr(body: Bag, field: string): string | undefined {
  const value = body[field];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new DomainError('validation_failed', `${field} must be text`, { field });
  }
  return value.trim();
}

/**
 * An integer, and money is always one.
 *
 * `Number.isInteger` rather than a parse, because `"42.5"` for an amount in
 * grosze is a client that thinks in złoty and would otherwise silently lose half
 * a grosz per transaction.
 */
export function int(body: Bag, field: string, opts: { min?: number; max?: number } = {}): number {
  const value = body[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new DomainError('validation_failed', `${field} must be a whole number`, { field });
  }
  if (opts.min !== undefined && value < opts.min) {
    throw new DomainError('validation_failed', `${field} must be at least ${opts.min}`, { field });
  }
  if (opts.max !== undefined && value > opts.max) {
    throw new DomainError('validation_failed', `${field} must be at most ${opts.max}`, { field });
  }
  return value;
}

export function optInt(body: Bag, field: string, opts: { min?: number; max?: number } = {}): number | undefined {
  if (body[field] === undefined || body[field] === null) return undefined;
  return int(body, field, opts);
}

export function bool(body: Bag, field: string, fallback = false): boolean {
  const value = body[field];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') {
    throw new DomainError('validation_failed', `${field} must be true or false`, { field });
  }
  return value;
}

export function list<T>(body: Bag, field: string, map: (item: unknown, index: number) => T): T[] {
  const value = body[field];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new DomainError('validation_failed', `${field} must be a list`, { field });
  }
  return value.map(map);
}

export function oneOf<T extends string>(body: Bag, field: string, allowed: readonly T[], fallback?: T): T {
  const value = body[field];
  if ((value === undefined || value === null) && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new DomainError('validation_failed', `${field} must be one of ${allowed.join(', ')}`, {
      field,
      allowed,
    });
  }
  return value as T;
}

export const qInt = (ctx: Ctx, key: string, fallback: number): number => {
  const raw = ctx.query.get(key);
  const value = raw === null ? NaN : Number(raw);
  return Number.isInteger(value) ? value : fallback;
};

export const qStr = (ctx: Ctx, key: string): string | undefined => ctx.query.get(key) ?? undefined;

/** The signed-in actor, where a route declared it needs one. */
export function actor(ctx: Ctx) {
  if (!ctx.actor) throw new DomainError('unauthenticated', 'sign in first');
  return ctx.actor;
}
