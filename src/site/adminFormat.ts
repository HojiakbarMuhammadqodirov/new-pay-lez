/**
 * Date formatting shared by the console's tabs.
 *
 * ── why this is its own module ────────────────────────────────────────────
 *
 * `day` was four byte-identical copies — `admin.tsx`, `adminPeople.tsx`,
 * `adminWebsite.tsx` and `adminTiers.tsx` — and the fourth arrived by being
 * pasted from the third. The format was never the problem; the duplication was,
 * and the way it shows up is asymmetric: a *format* change made in one file and
 * not the other three is invisible in review and obvious on the screen, because
 * two tabs of one console then write dates two ways.
 *
 * This is the counterpart of `dashboardFormat.ts` and exists for the same
 * mechanical reason as well as the tidiness one: a hook or plain value exported
 * from a module that also exports components breaks React fast refresh, which
 * `oxlint` flags as `react(only-export-components)`. So the shared helper needs
 * a module with no components in it, which is what this is.
 *
 * It takes a `locale` rather than reading one, and that is deliberate: the
 * console's tabs already hold `useLanguage()` for other reasons, and a hook here
 * would make every caller a hook caller for a pure function of two arguments.
 */

/**
 * A date, short, in the reader's own locale — `16 Sep 26`.
 *
 * Four options in one order, and the **year is in it**, which is the difference
 * from the dashboard's `useVenueDates` and is a difference rather than an
 * inconsistency. The console lists sign-up dates, verification dates and audit
 * rows, which span years and are read against each other; the dashboard lists a
 * voucher window and a campaign run, which are weeks long and sit inside a month
 * the screen has already named. Adding a year there would print `16 Sep 26` in a
 * column where every row says 26, and dropping it here would make an account
 * created in 2024 and one created last week look the same.
 *
 * `null` is an em dash, and on this screen that unambiguously means **"nothing
 * to report"** — a venue with no verification date, an account with no city.
 * The console has no *withheld* concept to confuse it with: suppression is a
 * partner-facing rule (a min-cohort floor on somebody else's customers) and the
 * dashboard carries it on `.pd-withheld`, faint and un-bolded under a `title`.
 * An operator is not shown a suppressed figure, so there is no second meaning
 * here for the dash to collide with. If one is ever added, it needs its own
 * treatment rather than this one — see `Figure` in `dashboardScreens.tsx`.
 */
export const day = (iso: string | null, locale: string): string =>
  iso
    ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: '2-digit' }).format(
        new Date(iso),
      )
    : '—';
