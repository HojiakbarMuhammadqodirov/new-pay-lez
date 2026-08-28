/**
 * Sign in with Google — the browser half.
 *
 * **This is the one place the site loads a third-party script, and it is a
 * deliberate exception to a real rule.** The repo's "no third-party runtime
 * requests" rule exists so that a visitor reading the landing page is not
 * silently fetching from anybody else's server: fonts are self-hosted, geometry
 * comes from npm, there are no CDN links. Google Identity Services cannot be
 * self-hosted — the script has to come from Google, and a copy of it would be a
 * copy of a security-sensitive thing that Google updates.
 *
 * So the exception is scoped instead of waived: **the script is fetched lazily,
 * on first use, from the sign-in screen only.** A visitor who never opens
 * `#/sign-in` never makes a request to Google, which is the part of the rule
 * that was actually protecting them. Nothing else in `src/` may import this.
 *
 * What comes back from Google is an **authorisation code, not a session and not
 * an identity.** It is posted to `POST /v1/auth/google`, which exchanges it —
 * using a client secret this bundle does not have — and verifies the resulting
 * ID token's signature, issuer, audience and expiry before issuing one of our
 * sessions. Nothing here learns who signed in until the server says so, which
 * is the point: a client that read an email out of an unverified token and
 * believed it would be trusting a string anyone can write.
 */
import { call, setToken } from '../api/client';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

/**
 * The client id, from the build environment.
 *
 * Public by nature — it ships in the bundle and Google's own button renders it
 * into the page — so `VITE_` is correct here in a way it never is for a secret.
 * Empty means the button does not render at all, which is the honest response to
 * "this deployment has no Google sign-in configured": a button that is going to
 * fail is worse than no button.
 */
export const GOOGLE_CLIENT_ID: string =
  (import.meta.env?.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';

export const googleConfigured = (): boolean => GOOGLE_CLIENT_ID.length > 0;

/* The slice of the GSI surface this file uses. Declared rather than pulled
   from a types package: two methods, and a dependency for them would be larger
   than the declaration. */
interface CodeClient {
  requestCode(): void;
}

interface Gsi {
  accounts: {
    id: {
      disableAutoSelect(): void;
    };
    oauth2: {
      initCodeClient(config: {
        client_id: string;
        scope: string;
        ux_mode: 'popup' | 'redirect';
        callback: (response: { code?: string; error?: string }) => void;
        error_callback?: (error: { type?: string }) => void;
      }): CodeClient;
    };
  };
}

declare global {
  interface Window {
    google?: Gsi;
  }
}

let loading: Promise<Gsi> | null = null;

/**
 * Fetch the Google script, once.
 *
 * The promise is cached rather than the boolean, so two components mounting in
 * the same frame await one load instead of injecting two `<script>` tags. A
 * failed load clears the cache so a later attempt can retry — the usual cause
 * is a blocked network rather than anything permanent.
 */
export function loadGoogle(): Promise<Gsi> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (loading) return loading;

  loading = new Promise<Gsi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) resolve(window.google);
      else reject(new Error('google identity services loaded but is not usable'));
    };
    script.onerror = () => reject(new Error('could not reach google identity services'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    loading = null;
    throw error;
  });

  return loading;
}

/** What the server says about the person, once it has verified the token. */
export interface GoogleSignIn {
  token: string;
  roles: string[];
  mode: string;
  user: { id: string; name: string; email: string | null };
}

/**
 * Trade a Google credential for one of our sessions.
 *
 * The API token is stored on success, so the console and anything else built on
 * `api/client` is signed in as the same person from here on.
 */
export async function exchangeGoogleCredential(
  code: string,
  language: string,
): Promise<GoogleSignIn> {
  const result = await call<GoogleSignIn>('/v1/auth/google', {
    method: 'POST',
    body: { code, language, surface: 'web' },
  });
  setToken(result.token);
  return result;
}

/** Somebody closed the popup or declined. Not an error worth a message. */
export class GoogleCancelled extends Error {}

/**
 * Open Google's account chooser and resolve with an authorisation code.
 *
 * The **authorisation-code flow, from our own button**, and the reason is the
 * design rather than the security. Google's rendered button decides on its own
 * whether to show a generic "Continue with Google" or a personalised "Continue
 * as …" card — the choice depends on the browser's Google session and cannot be
 * fixed from here — and the personalised form ignores the requested shape. So
 * the same page showed two different buttons on two visits, neither of them
 * matching the primary above it. Driving the flow ourselves is the only way to
 * own the button.
 *
 * The code is useless in a browser: exchanging it needs the client secret,
 * which lives only on the server. That is the property that makes this safe to
 * run from a public page.
 */
export async function requestGoogleCode(): Promise<string> {
  const gsi = await loadGoogle();

  return new Promise<string>((resolve, reject) => {
    const client = gsi.accounts.oauth2.initCodeClient({
      client_id: GOOGLE_CLIENT_ID,
      /* Identity only. This asks for no Gmail, no Drive, no contacts — which is
         both all we need and what keeps the consent screen out of Google's
         verification queue. Widening this is a decision with a review attached. */
      scope: 'openid email profile',
      ux_mode: 'popup',
      callback: (response) => {
        if (response.code) resolve(response.code);
        else reject(new GoogleCancelled(response.error ?? 'no code returned'));
      },
      /* Fires when the popup is blocked or dismissed. Without it those cases
         leave the promise pending forever and the button spins for good. */
      error_callback: (error) => reject(new GoogleCancelled(error?.type ?? 'dismissed')),
    });

    client.requestCode();
  });
}

/** Called on sign-out, so the next visitor to this browser is asked afresh. */
export function forgetGoogle(): void {
  try {
    window.google?.accounts?.id?.disableAutoSelect();
  } catch {
    /* The script may never have loaded. Nothing to forget in that case. */
  }
}
