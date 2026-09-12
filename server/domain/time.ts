/**
 * Time, and the one rule the specs repeat three times: **store UTC, resolve
 * local** (mobile §15, desktop Part E).
 *
 * Everything with a business meaning — a budget period, a deal's day/time
 * window, quiet hours, "one visit per day" — is evaluated in the *venue's* local
 * time, not the server's and not the customer's. A venue in Kraków whose budget
 * month ends at midnight local must not roll over an hour early because the
 * process happens to run in UTC.
 *
 * `Intl.DateTimeFormat` with a `timeZone` does the conversion, which means no
 * timezone table and no dependency: Node ships full ICU, so the IANA database is
 * already in the process. The formatter is cached per zone because constructing
 * one is by far the most expensive thing in this file and the gate calls it on
 * every scan.
 */

export type Iso = string;

export const now = (): Iso => new Date().toISOString();

export const iso = (date: Date): Iso => date.toISOString();

export const parse = (value: Iso): Date => new Date(value);

/** Shift an instant by whole minutes; the unit every window in the specs uses. */
export const plusMinutes = (at: Iso, minutes: number): Iso =>
  new Date(new Date(at).getTime() + minutes * 60_000).toISOString();

export const plusDays = (at: Iso, days: number): Iso => plusMinutes(at, days * 1440);

/** Calendar months, which is what a budget period and a points expiry both use. */
export function plusMonths(at: Iso, months: number): Iso {
  const date = new Date(at);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  /* Clamp rather than overflow: one month after 31 January is 28 February, not
     3 March. A points batch earned on the 31st must expire on a real date. */
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.toISOString();
}

export const minutesBetween = (from: Iso, to: Iso): number =>
  (new Date(to).getTime() - new Date(from).getTime()) / 60_000;

export const daysBetween = (from: Iso, to: Iso): number => minutesBetween(from, to) / 1440;

export const isBefore = (a: Iso, b: Iso): boolean => new Date(a).getTime() < new Date(b).getTime();
export const isAfter = (a: Iso, b: Iso): boolean => new Date(a).getTime() > new Date(b).getTime();

/* ────────────────────────────────────────────────────────────── venue-local ── */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
  let f = formatters.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      weekday: 'short',
    });
    formatters.set(timezone, f);
  }
  return f;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface LocalTime {
  /** `YYYY-MM-DD` in the zone. The key "one visit per day" is enforced on. */
  day: string;
  /** `YYYY-MM`. The budget period. */
  month: string;
  /** 0 = Monday, matching `venue_hours.weekday` and the deal targeting CSV. */
  weekday: number;
  hour: number;
  minute: number;
  /** Minutes past local midnight — what a deal window and quiet hours compare. */
  minutes: number;
}

/** An instant, as the venue sees it. */
export function local(at: Iso, timezone: string): LocalTime {
  const parts = formatterFor(timezone).formatToParts(new Date(at));
  const pick = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  const year = pick('year');
  const month = pick('month');
  const day = pick('day');
  const hour = Number(pick('hour') === '24' ? '00' : pick('hour'));
  const minute = Number(pick('minute'));
  const weekday = Math.max(0, WEEKDAYS.indexOf(pick('weekday')));

  return {
    day: `${year}-${month}-${day}`,
    month: `${year}-${month}`,
    weekday,
    hour,
    minute,
    minutes: hour * 60 + minute,
  };
}

export const localDay = (at: Iso, timezone: string): string => local(at, timezone).day;
export const localMonth = (at: Iso, timezone: string): string => local(at, timezone).month;

/**
 * Is `at` inside a daily window, in the venue's own clock?
 *
 * A window that wraps midnight (`22:00–02:00`) is the reason this is not
 * `from <= t && t <= to`: the night shift is a real venue's quiet hour, and a
 * naive comparison silently makes it an empty window.
 */
export function withinDailyWindow(minutes: number, from: number, to: number): boolean {
  if (from === to) return true;
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}

/**
 * The ISO week key, `YYYY-Www` — what the weekly leaderboard is bucketed by.
 *
 * ISO rather than "seven days from Sunday" because the reset is a scheduled job
 * and a week that means different things in different places would rank two
 * players against different amounts of time.
 */
export function isoWeek(at: Iso): string {
  const date = new Date(at);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  /* Thursday decides the year: that is the whole of ISO-8601's week numbering. */
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * How far a zone's wall clock is ahead of UTC at one instant, in milliseconds.
 *
 * Read by formatting the instant *in* the zone and taking the difference —
 * the offset with daylight saving already applied, and no table of offsets.
 * Floored to the minute first, because `local` carries no seconds and a
 * difference taken against a fractional minute would be off by the fraction.
 */
function offsetAt(instantMs: number, timezone: string): number {
  const minute = Math.floor(instantMs / 60_000) * 60_000;
  const l = local(new Date(minute).toISOString(), timezone);
  const [year, month, date] = l.day.split('-').map(Number);
  return Date.UTC(year, month - 1, date, l.hour, l.minute) - minute;
}

/**
 * The first instant of a venue-local calendar day, as UTC.
 *
 * Every day-bucketed report — a dashboard's thirty days, a till log's window,
 * "today" — is a range of these, and the range has to start where the venue's
 * day starts rather than where the server's does: a Kraków visit at 00:30 on
 * the 5th is the 5th's trade, not the 4th's.
 *
 * Two passes of the offset, because one is wrong across a daylight-saving
 * change (the offset read at the naive guess is the other side of the jump).
 * Then a walk, for the two days a year where the answer is not simply "local
 * 00:00": a zone that springs forward *at* midnight has no 00:00 at all and its
 * day starts at 01:00, and one that falls back across midnight has two of them
 * and its day starts at the first. Both walks are bounded, and both are a
 * no-op on every ordinary day.
 *
 * It replaced an hour-by-hour search that stopped at the first whole hour whose
 * local minutes were zero — which never happens in a half-hour zone (Kolkata,
 * Adelaide) or a quarter-hour one (Kathmandu), so every month there silently
 * started at UTC midnight instead.
 */
export function localMidnight(day: string, timezone: string): Iso {
  const [year, month, date] = day.split('-').map(Number);
  const wall = Date.UTC(year, month - 1, date);
  let instant = wall - offsetAt(wall, timezone);
  instant = wall - offsetAt(instant, timezone);

  const dayAt = (ms: number) => local(new Date(ms).toISOString(), timezone).day;
  for (let step = 0; step < 240 && dayAt(instant) < day; step += 1) instant += 60_000;
  for (let step = 0; step < 240 && dayAt(instant - 60_000) === day; step += 1) instant -= 60_000;
  return new Date(instant).toISOString();
}

/**
 * A `YYYY-MM-DD` calendar day moved by whole days.
 *
 * Arithmetic on the *date*, not on an instant: "the day before" a local day is
 * a local day, and stepping an instant by 24 hours lands on the wrong one twice
 * a year wherever the clocks change.
 */
export function shiftDay(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

/** The first instant of a `YYYY-MM` period in a zone, as UTC. */
export function monthStart(period: string, timezone: string): Iso {
  return localMidnight(`${period}-01`, timezone);
}

/** `YYYY-MM` one month on, for a renewal or a quota reset. */
export function nextPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, '0')}`;
}

/**
 * `YYYY-MM` one month back, for a comparison against the month before.
 *
 * The mirror of `nextPeriod` and written the same way rather than as
 * `nextPeriod` run eleven times: a trend that walks backwards needs this, and
 * deriving it from the forward one is how January comes out as month 0.
 */
export function prevPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, '0')}`;
}
