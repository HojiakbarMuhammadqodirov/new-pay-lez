/**
 * The client for `server/` — the first thing in `src/` that talks to it.
 *
 * Until this file existed the two halves of Paylez had never met: the React site
 * ran entirely on `localStorage` (`auth/users.ts` says so at the top, and still
 * does), and the backend served 125 endpoints nobody called. This does not
 * change that — the session, the wallet and the games are still local, and
 * swapping them is the larger job `server/README.md` describes. What this does
 * is give the console and the traffic beacon a way through, which is the part
 * that cannot be done locally at all: **an operator's console is the one screen
 * whose whole purpose is to read data this device did not produce.**
 *
 * Three properties it has to keep:
 *
 * - **It is optional.** Every caller must render something sensible when the
 *   server is not running, because for most of this site's life it will not be.
 *   `useApi` returns a state rather than throwing, and the console shows a
 *   "not connected" panel rather than an error boundary.
 * - **It never invents a number.** A failed request is `error`, not zero. That
 *   is the same rule the partner analytics follow for `suppressed`, and the
 *   reason is identical: a person reading 0 believes it.
 * - **The token is a pointer, not a credential store.** It goes in
 *   `localStorage` beside the session the site already keeps, and it is dropped
 *   the moment the server says it is no longer valid.
 */

/**
 * Where the backend is.
 *
 * The default is the dev port, so `npm run dev` and `npm run server` find each
 * other with no configuration. A deployment sets `VITE_API_URL` at build time —
 * and `PAYLEZ_ORIGINS` on the server has to name the site's origin, or the
 * browser will refuse the response before this code sees it.
 */
export const API_BASE: string =
  (import.meta.env?.VITE_API_URL as string | undefined) ?? 'http://127.0.0.1:8787';

const TOKEN_KEY = 'paylez-api-token';

/* Wrapped, like `auth/directory.ts` does it: storage throws in a private window
   with cookies blocked, and a console that cannot open is worse than one that
   cannot remember. */
function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* Nothing to do: the session lasts the tab instead. */
  }
}

export const hasToken = (): boolean => readToken() !== null;

/* Fields are declared and assigned rather than written as constructor parameter
   properties: `erasableSyntaxOnly` is on, and that syntax emits code. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** The one shape the server refuses in — `{ error: { code, message } }`. */
interface ErrorBody {
  error?: { code?: string; message?: string };
}

export interface CallOptions {
  method?: string;
  body?: unknown;
  /** Anything that moves value. Generated once per attempt, reused on retry. */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /**
   * The reader's language, as `accept-language`.
   *
   * The browser sends one of its own, and it is the wrong one: it says what
   * language the *machine* is set to, and this site's language is whatever the
   * switcher in the header says. The server reads the header for every piece of
   * translated content it serves (`copyOf` in `routes/guidance.ts`), so a guide
   * read by somebody who has switched the site to Ukrainian on an English
   * laptop would come back in English without this.
   */
  language?: string;
}

export async function call<T>(path: string, options: CallOptions = {}): Promise<T> {
  const token = readToken();
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}),
        ...(options.language ? { 'accept-language': options.language } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (cause) {
    /* A network failure and a 500 are different things to a reader: one means
       "the server is not there", the other "it is there and something broke".
       Status 0 is how the console tells them apart. */
    throw new ApiError(0, 'unreachable', String((cause as Error)?.message ?? cause));
  }

  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const body = parsed as ErrorBody;
    /* A token the server no longer honours is dropped here rather than left to
       fail every subsequent call — the console's "connect" panel is the correct
       next screen, and it only appears when there is no token. */
    if (response.status === 401) setToken(null);
    throw new ApiError(
      response.status,
      body?.error?.code ?? 'unknown',
      body?.error?.message ?? response.statusText,
    );
  }

  return parsed as T;
}

/* ═══════════════════════════════════════════════════════════════ sign-in ══ */

export interface SignedIn {
  token: string;
  user: { id: string; display_name: string; email: string | null };
  roles: string[];
}

/**
 * Sign in *to the API*, which is not the same act as signing in to the site.
 *
 * They are deliberately separate while the site's own auth is still local. The
 * console asks for these credentials explicitly rather than reusing the ones
 * typed on `#/signin`, because the two directories genuinely are different: the
 * site's admin is a seed in `auth/users.ts`, and the server's is whatever
 * `PAYLEZ_ADMIN_EMAIL` provisioned. Pretending one implies the other would fail
 * confusingly at the first request.
 */
export async function signIn(email: string, password: string): Promise<SignedIn> {
  const result = await call<SignedIn>('/v1/auth/signin', {
    method: 'POST',
    body: { email, password },
  });
  setToken(result.token);
  return result;
}

export function signOut(): void {
  setToken(null);
}

/**
 * The bearer header, or nothing.
 *
 * Exported for the one caller that cannot go through `call()` — the reach
 * beacon in `reach.ts`, which builds its own request because it needs
 * `keepalive` and, when nobody is signed in, `sendBeacon`. It hands back a
 * header object rather than the token, so the token itself still has exactly
 * one reader and that reader is in this file.
 */
export function authHeader(): Record<string, string> {
  const token = readToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}
