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

/** The first instant of a `YYYY-MM` period in a zone, as UTC. */
export function monthStart(period: string, timezone: string): Iso {
  const [year, month] = period.split('-').map(Number);
  /* Walk back from the UTC midnight guess until the local day is the 1st: the
     offset is at most a day either way and this needs no offset arithmetic. */
  let guess = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  for (let step = 0; step < 48; step += 1) {
    const l = local(guess.toISOString(), timezone);
    if (l.day === `${period}-01` && l.minutes === 0) return guess.toISOString();
    guess = new Date(guess.getTime() + (l.day < `${period}-01` ? 3_600_000 : -3_600_000));
  }
  return new Date(Date.UTC(year, month - 1, 1)).toISOString();
}

/** `YYYY-MM` one month on, for a renewal or a quota reset. */
export function nextPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, '0')}`;
}
