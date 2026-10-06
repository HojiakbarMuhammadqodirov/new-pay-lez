/**
 * The small pure rules the Hot deals screen and its drawer share.
 *
 * A module of its own, rather than a few functions at the top of
 * `dashboardDeals.tsx`, because both the table and the create drawer read a
 * deal's days, hours and audience back out of the server's row, and two copies
 * of "which weekdays is this" disagree the first time one of them is edited.
 * Components live elsewhere so React fast refresh keeps working.
 */

/** The server's weekday names, Monday first — the order `copy.dashboard.customers.days` is in. */
export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/**
 * The stored weekday set as seven Monday-first flags.
 *
 * Absent or empty is **every day**: that is what `claimableNow` does with a
 * deal that has no set, and the drawer sends all seven as none for the same
 * reason. An unknown token is ignored rather than read as a day.
 */
export function daysFromRow(weekdays: string | null | undefined): boolean[] {
  const stored = (weekdays ?? '')
    .split(',')
    .map((day) => day.trim().toLowerCase())
    .filter((day) => (DAY_KEYS as readonly string[]).includes(day));
  return stored.length === 0 ? DAY_KEYS.map(() => true) : DAY_KEYS.map((day) => stored.includes(day));
}

/** Seven flags as the create body's 0 = Monday list; all seven is sent as none. */
export const weekdaysOf = (days: readonly boolean[]): number[] =>
  days.every(Boolean) ? [] : days.flatMap((on, index) => (on ? [index] : []));

/**
 * The day set as words, in the reader's language.
 *
 * A contiguous run of three or more folds into a range — "Mon–Fri" — because
 * the run of weekdays is the common case and five names in a row is what made
 * the old row wrap. Anything else is listed.
 */
export function dayLabel(
  days: readonly boolean[],
  names: readonly string[],
  every: string,
  none: string,
): string {
  const on = days.flatMap((flag, index) => (flag ? [index] : []));
  if (on.length === 7) return every;
  if (on.length === 0) return none;
  const contiguous = on.every((day, i) => day === on[0] + i);
  if (on.length > 2 && contiguous) return `${names[on[0]]}–${names[on[on.length - 1]]}`;
  return on.map((day) => names[day]).join(', ');
}

/** `HH:MM` as minutes past midnight, which is what a deal window compares. */
export const minutesOf = (clock: string): number => {
  const [h, m] = clock.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** The inverse, padded on both halves: `7:0` is not a time anybody writes. */
export const clockOf = (minutes: number): string => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * Local `YYYY-MM-DD`, `offset` days from today — what a date input speaks.
 *
 * Local rather than `toISOString`, which is UTC and opens the picker on
 * yesterday for an owner east of Greenwich late at night.
 */
export const localDay = (offset = 0): string => {
  const at = new Date();
  at.setDate(at.getDate() + offset);
  return `${at.getFullYear()}-${`${at.getMonth() + 1}`.padStart(2, '0')}-${`${at.getDate()}`.padStart(2, '0')}`;
};

/** Whole days from one `YYYY-MM-DD` to another, both counted — or null for a bad pair. */
export function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * The first day of the month after a quota's `YYYY-MM` period — when the
 * notification count starts again. Parsed defensively: a `NaN` month would
 * print a date in 1899 rather than fail visibly.
 */
export function resetDate(period: string | null | undefined): Date {
  const parsed = /^(\d{4})-(\d{2})/.exec(period ?? '');
  const today = new Date();
  const year = parsed ? Number(parsed[1]) : today.getFullYear();
  const month = parsed ? Number(parsed[2]) : today.getMonth() + 1;
  return new Date(Date.UTC(year, month, 1));
}

/**
 * The audience picker's five options as the server's segments, index-aligned
 * with `copy.dashboard.deals.audiences`. `null` is "Russian speakers", which is
 * a *language* — sent in `targetLanguages`, and sized by no audience count.
 */
export const PICK_SEGMENTS = ['all', 'newcomer', 'lapsed', 'new', null] as const;

/**
 * Which of the five options a stored deal is aimed at, or `-1` for a segment
 * the picker does not offer (`returning`, which the assistant can file).
 * A language target wins, because that is the option that set it.
 */
export function pickOf(audience: string | null | undefined, languages: string | null | undefined): number {
  if ((languages ?? '').split(',').map((l) => l.trim()).includes('ru')) return 4;
  const first = (audience ?? '').split(',')[0]?.trim() || 'all';
  return PICK_SEGMENTS.indexOf(first as (typeof PICK_SEGMENTS)[number]);
}

/** The segment whose audience count describes a stored deal, or null when none does. */
export function segmentOf(audience: string | null | undefined, languages: string | null | undefined): string | null {
  if (pickOf(audience, languages) === 4) return null;
  return (audience ?? '').split(',')[0]?.trim() || 'all';
}
