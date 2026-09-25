/**
 * A one-shot "open the sign-up form as a business" request.
 *
 * The Business page's "Become a partner" sets it on the way to `#/signin`, and
 * the sign-in page takes it once, on mount: it opens on the sign-up form with
 * Business already chosen and the individual-or-business question not asked,
 * because pressing that button *was* the answer. Every other way onto the page
 * finds nothing here and gets the ordinary form, question included.
 *
 * Module state rather than a route or a query, on purpose: routes are matched
 * exactly (`ROUTES` in `router.ts`), so a `?as=business` suffix would resolve to
 * nothing, and a new route would be a sixteenth page for one preset. Rather
 * than a storage key, because it is meant to last exactly one navigation — a
 * reload or a later visit to sign in is the ordinary form again.
 */
import type { ChoosableType } from './users';

let pending: ChoosableType | null = null;

/** Ask for the next sign-in page to open as a sign-up for this account type. */
export function signUpAs(type: ChoosableType): void {
  pending = type;
}

/**
 * Read the request without consuming it.
 *
 * **Pure, and that is the whole point.** This is a `useState` initialiser, and
 * React calls those *twice* under `StrictMode` to surface exactly this kind of
 * impurity. The version that read and cleared in one call therefore handed the
 * second pass a `null` — so in development "Become a partner" landed on the
 * ordinary sign-in form with the individual-or-business question asked, which
 * is the one thing the intent exists to prevent, while production was fine.
 * A dev/prod split in a flow nobody re-tests in production is the worst shape
 * a bug can have.
 */
export function peekSignUpIntent(): ChoosableType | null {
  return pending;
}

/**
 * Drop the request. Called from an effect once the page that read it has
 * mounted, which is the moment it has been acted on — effects run after the
 * double render rather than during it, so the clear happens once however many
 * times the component body ran.
 */
export function clearSignUpIntent(): void {
  pending = null;
}
