import { useEffect, useState } from 'react';
import { ApiError, call } from './api/client';
import { rememberReferral } from './auth/referral';
import { inviteCodeFromPath, PATHS } from './router';

/**
 * `/i/<code>` — where a friend's invite lands for somebody without the app.
 *
 * The phone shares `https://www.pay-lez.com/i/<code>` (the server builds the
 * link), and on a phone that has the app with verified links the app opens it
 * directly. Everyone else is here: who sent it, the code to type at sign-up,
 * and the two ways onward — open the app if it is installed, or get it.
 *
 * **The name comes from the server**, from the public
 * `GET /v1/referrals/codes/:code` — a short "Marta K.", never an address — and
 * so does the figure. When the server cannot be reached the page still shows
 * the code, which is the part that actually carries the invite.
 *
 * English only for now, and deliberately small: a message to one person, not
 * a page to be found (`head.ts` marks it `noindex`, the sitemap leaves it out).
 */

/** The listing, once the app is published; the id is the Android package. */
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.paylez.paylez';

type Lookup = { code: string; name: string; inviteeReward?: number };

type State =
  | { kind: 'loading' }
  | { kind: 'found'; lookup: Lookup }
  | { kind: 'unknown' }
  | { kind: 'offline' };

/**
 * "Open in the app". Android gets an `intent:` URL, which Chrome follows into
 * the app when it is installed and to the Play listing when it is not; iOS
 * gets the bare `paylez://` scheme the app declares. Both carry the code in the
 * path, `/i/<code>`, which is where the app reads it.
 */
function openInAppHref(code: string): string {
  const android = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  return android
    ? `intent://app/i/${code}#Intent;scheme=paylez;package=com.paylez.paylez;` +
        `S.browser_fallback_url=${encodeURIComponent(PLAY_URL)};end`
    : `paylez://app/i/${code}`;
}

export function InvitePage() {
  const code = inviteCodeFromPath(window.location.pathname);
  const [state, setState] = useState<State>({ kind: code ? 'loading' : 'unknown' });

  useEffect(() => {
    if (!code) return;
    const abort = new AbortController();
    call<Lookup>(`/v1/referrals/codes/${encodeURIComponent(code)}`, { signal: abort.signal })
      .then((lookup) => {
        /* Kept for the web sign-up below, the same 30-day hold a `?ref=` link
           gets — and only once the server has said the code is real. */
        rememberReferral(lookup.code);
        setState({ kind: 'found', lookup });
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        setState({ kind: error instanceof ApiError && error.status === 404 ? 'unknown' : 'offline' });
      });
    return () => abort.abort();
  }, [code]);

  const name = state.kind === 'found' && state.lookup.name ? state.lookup.name : null;
  const reward = state.kind === 'found' ? state.lookup.inviteeReward : undefined;
  const shown = state.kind === 'found' ? state.lookup.code : code;

  return (
    <main>
      <section className="section auth" id="invite-top">
        <div className="wrap auth-wrap">
          <div className="auth-card">
            <span className="eyebrow">Invitation</span>
            {state.kind === 'unknown' ? (
              <>
                <h1>This invite code isn’t valid</h1>
                <p className="auth-lede">
                  Ask the person who sent it for their code again — or get the app and look around on
                  your own.
                </p>
              </>
            ) : (
              <>
                <h1>{name ? `${name} invited you to Paylez` : 'You’re invited to Paylez'}</h1>
                <p className="auth-lede">
                  Earn points where you already spend, and turn them into real discounts at the
                  counter. Add this code when you sign up in the app —
                  {typeof reward === 'number'
                    ? ` you both get ${reward} points after your first visit.`
                    : ' you both get points after your first visit.'}
                </p>
                <div className="invite-code" aria-label="Invite code">
                  <span>Code</span>
                  <strong>{shown}</strong>
                </div>
                <a className="btn btn-solid btn-lg auth-submit" href={openInAppHref(shown ?? '')}>
                  Open in the app
                </a>
                {/* The web is the whole product too, and the code is already in
                    the sign-up form's field when this lands there. */}
                <a className="btn btn-ghost auth-submit" href={PATHS.signin}>
                  Sign up on the website
                </a>
              </>
            )}
            <a className="btn btn-ghost auth-submit" href={PLAY_URL} rel="noopener">
              Get it on Google Play
            </a>
            <p className="auth-demo">On iPhone? The App Store version is on its way — keep this code.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
