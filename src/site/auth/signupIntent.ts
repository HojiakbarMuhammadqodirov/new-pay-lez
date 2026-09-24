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

/** Take the request, if there is one. Clears it: a second read finds nothing. */
export function takeSignUpIntent(): ChoosableType | null {
  const type = pending;
  pending = null;
  return type;
}
