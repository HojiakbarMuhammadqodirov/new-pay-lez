import { useEffect, useState } from 'react';
import { ApiError, call } from './api/client';

/**
 * `/t?picc_data=…&cmac=…` — a venue's NFC sticker, tapped by a phone that does
 * not hand the URL to the app.
 *
 * Every sticker carries this address (`server/NFC.md`). A phone with the app
 * opens it there; everyone else lands here: an iPhone without Associated
 * Domains, an Android without the app, a phone held to the sticker out of
 * curiosity. So the page names the venue and offers the way into the app.
 *
 * **It never posts `/tap`.** The tap that earns points is opened by the app,
 * signed in, against a fresh counter; this page only asks the public
 * `GET /v1/gate/tags/resolve` which venue the sticker belongs to. Passing the
 * same two parameters to the app is safe because the server refuses a counter
 * it has already seen — a copied link earns nothing twice.
 *
 * English only, like the invite page: a sticker's landing, not a page to be
 * found (`head.ts` marks it `noindex`, the sitemap leaves it out).
 */

/** The listing, once the app is published; the id is the Android package. */
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.paylez.paylez';

type Resolved = { venueId: string; venueName: string; label: string | null };

type State =
  | { kind: 'loading' }
  | { kind: 'found'; tag: Resolved }
  /* Malformed, forged, unassigned or retired — one answer, on purpose: telling
     a stranger *which* would be telling a forger how far they got. */
  | { kind: 'unknown' }
  | { kind: 'offline' };

/** The two parameters, strictly — hex of the lengths the tag writes. */
function readParams(search: string): { picc: string; cmac: string } | null {
  const params = new URLSearchParams(search);
  const picc = params.get('picc_data') ?? params.get('picc') ?? '';
  const cmac = params.get('cmac') ?? '';
  return /^[0-9a-fA-F]{32}$/.test(picc) && /^[0-9a-fA-F]{16}$/.test(cmac) ? { picc, cmac } : null;
}

/**
 * "Open in the app", the invite page's shape: Android gets an `intent:` URL
 * that falls back to the Play listing, iOS the bare `paylez://` scheme. The app
 * reads `paylez://app/t?picc_data=…&cmac=…` (`NFC.md` §7).
 */
function openInAppHref(picc: string, cmac: string): string {
  const query = `picc_data=${picc}&cmac=${cmac}`;
  const android = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  return android
    ? `intent://app/t?${query}#Intent;scheme=paylez;package=com.paylez.paylez;` +
        `S.browser_fallback_url=${encodeURIComponent(PLAY_URL)};end`
    : `paylez://app/t?${query}`;
}

export function TagPage() {
  const params = readParams(window.location.search);
  const [state, setState] = useState<State>({ kind: params ? 'loading' : 'unknown' });
  const picc = params?.picc ?? '';
  const cmac = params?.cmac ?? '';

  useEffect(() => {
    if (!picc) return;
    const abort = new AbortController();
    call<Resolved>(
      `/v1/gate/tags/resolve?picc_data=${encodeURIComponent(picc)}&cmac=${encodeURIComponent(cmac)}`,
      { signal: abort.signal },
    )
      .then((tag) => setState({ kind: 'found', tag }))
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        const refused = error instanceof ApiError && (error.status === 404 || error.status === 422);
        setState({ kind: refused ? 'unknown' : 'offline' });
      });
    return () => abort.abort();
  }, [picc, cmac]);

  const venue = state.kind === 'found' ? state.tag.venueName : null;

  return (
    <main>
      <section className="section auth" id="tag-top">
        <div className="wrap auth-wrap">
          <div className="auth-card">
            <span className="eyebrow">Paylez tag</span>
            {state.kind === 'unknown' ? (
              <>
                <h1>This tag isn’t in use</h1>
                <p className="auth-lede">
                  It may have been moved or retired. Ask the staff — you can still earn at the
                  counter by showing your code in the app.
                </p>
              </>
            ) : (
              <>
                <h1>{venue ? `You’re at ${venue}` : state.kind === 'loading' ? 'One moment…' : 'You tapped a Paylez tag'}</h1>
                <p className="auth-lede">
                  Open Paylez to collect points for this visit. Tapping the tag again with the app
                  open on the Scan tab works too.
                </p>
                <a className="btn btn-solid btn-lg auth-submit" href={openInAppHref(picc, cmac)}>
                  Open in the app
                </a>
              </>
            )}
            <a className="btn btn-ghost auth-submit" href={PLAY_URL} rel="noopener">
              Get it on Google Play
            </a>
            <p className="auth-demo">On iPhone? The App Store version is on its way.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
