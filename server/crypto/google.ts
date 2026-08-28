/**
 * Verifying a Google ID token.
 *
 * This is the one place in the server that trusts something it did not sign,
 * so it is the one place that has to be paranoid. A Google ID token is a JWT
 * signed with RS256 by a key Google publishes and rotates; verifying it means
 * fetching those keys, checking the signature, and then checking every claim
 * that says *who the token was for*. Skipping the last part is the classic
 * failure: a signature-valid token issued for somebody else's app is still
 * signature-valid, and accepting it hands them every account on this one.
 *
 * `tokens.ts` says, correctly, that this server does not do JWT — its own
 * tokens are an HMAC over a payload with no algorithm field to negotiate. That
 * still holds. This file is not a general JWT library and must never become
 * one: it accepts exactly RS256, from exactly Google's key set, for exactly our
 * client id. `alg` is not read to decide what to do — it is read to reject
 * anything that is not the one algorithm, which is what makes the `alg: none`
 * family of attacks inexpressible here.
 *
 * **This is the server's only outbound request.** The front end's "no
 * third-party runtime requests" rule is about what a visitor's browser is made
 * to fetch; a server fetching a public key set from the issuer whose signature
 * it is checking is not that, and there is no offline way to do it — the keys
 * rotate. It is cached, and a fetch failure fails the sign-in rather than
 * falling through to accepting the token.
 */
import { createPublicKey, verify as verifySignature, type JsonWebKey } from 'node:crypto';

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

/** Google publishes both spellings across its docs and its tokens. */
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

/**
 * Clock skew allowance, in seconds.
 *
 * Small on purpose. This exists because two machines' clocks disagree by a
 * second or two, not to extend the life of an expired token — a generous skew
 * here is a token that keeps working after Google says it should not.
 */
const SKEW_SECONDS = 60;

interface Jwk {
  kid: string;
  alg?: string;
  kty: string;
  n: string;
  e: string;
  use?: string;
}

/** The verified contents of a Google ID token — only what we actually use. */
export interface GoogleIdentity {
  /** Google's stable, never-reused id for this account. The real key. */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

let cache: { keys: Jwk[]; until: number } | null = null;

/**
 * Google's signing keys, cached.
 *
 * The TTL comes from the response's own `Cache-Control: max-age`, because
 * Google rotates on its own schedule and publishes when it next will. Falling
 * back to an hour is safe in both directions: a key we drop early costs one
 * extra fetch, and a key we hold too long simply stops matching a `kid` and
 * forces a refetch below.
 */
async function jwks(now: number): Promise<Jwk[]> {
  if (cache && cache.until > now) return cache.keys;

  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`google jwks: HTTP ${res.status}`);

  const body = (await res.json()) as { keys: Jwk[] };
  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    throw new Error('google jwks: no keys in response');
  }

  const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '');
  const ttl = maxAge ? Number(maxAge[1]) : 3600;
  cache = { keys: body.keys, until: now + ttl * 1000 };
  return body.keys;
}

const decodeSegment = (segment: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<string, unknown>;

/**
 * Verify a Google ID token and return who it says the person is.
 *
 * Throws on anything that is not a valid, current, correctly-addressed token.
 * There is no "probably fine" return value on purpose: every caller of this
 * turns the result straight into a session.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
  nowMs: number = Date.now(),
): Promise<GoogleIdentity> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('not a JWT');

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodeSegment(headerB64);
  const payload = decodeSegment(payloadB64);

  /* Not "which algorithm shall we use" — the only accepted answer, checked
     before anything else is read. */
  if (header.alg !== 'RS256') throw new Error(`unexpected alg: ${String(header.alg)}`);
  const kid = typeof header.kid === 'string' ? header.kid : null;
  if (!kid) throw new Error('no kid in header');

  let keys = await jwks(nowMs);
  let jwk = keys.find((k) => k.kid === kid);
  if (!jwk) {
    /* A kid we do not know usually means Google rotated since we cached. One
       forced refetch, then give up — retrying forever on a forged kid would be
       a free way to make this server hammer Google. */
    cache = null;
    keys = await jwks(nowMs);
    jwk = keys.find((k) => k.kid === kid);
  }
  if (!jwk) throw new Error('signing key not found');

  const key = createPublicKey({ key: jwk as unknown as JsonWebKey, format: 'jwk' });
  const signed = Buffer.from(`${headerB64}.${payloadB64}`, 'utf8');
  const signature = Buffer.from(signatureB64, 'base64url');
  if (!verifySignature('RSA-SHA256', signed, key, signature)) {
    throw new Error('signature does not verify');
  }

  /* Signature is good. Everything below is "was this token meant for us, and
     is it still current" — the half that a signature alone does not answer. */
  const seconds = Math.floor(nowMs / 1000);

  if (typeof payload.iss !== 'string' || !ISSUERS.has(payload.iss)) {
    throw new Error(`unexpected issuer: ${String(payload.iss)}`);
  }
  /* `aud` is the whole reason this cannot be a generic verifier: a token signed
     by Google for a different application is perfectly valid and must not be
     accepted here. */
  if (payload.aud !== clientId) throw new Error('token was not issued for this client');

  if (typeof payload.exp !== 'number' || payload.exp + SKEW_SECONDS < seconds) {
    throw new Error('token has expired');
  }
  if (typeof payload.iat === 'number' && payload.iat - SKEW_SECONDS > seconds) {
    throw new Error('token is issued in the future');
  }

  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  const email = typeof payload.email === 'string' ? payload.email : '';
  if (!sub) throw new Error('no subject in token');
  if (!email) throw new Error('no email in token');

  /*
   * An unverified address must not be able to claim an account.
   *
   * Google sets this false for some workspace and federated cases, and if we
   * ignored it somebody could sign up with an address they do not control and
   * be matched to whoever already owns it here.
   */
  const emailVerified = payload.email_verified === true;
  if (!emailVerified) throw new Error('google has not verified that address');

  return {
    sub,
    email,
    emailVerified,
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : email.split('@')[0],
    picture: typeof payload.picture === 'string' ? payload.picture : null,
  };
}

/** Test seam: drop the cached key set. */
export function resetJwksCache(): void {
  cache = null;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * Exchange an authorisation code for the ID token inside it.
 *
 * This is the second way in, and it exists for a reason that is about design
 * rather than security: Google's *rendered* button cannot be styled to match
 * this site — it chooses between a generic and a personalised form on its own,
 * and the personalised one ignores the requested shape. Driving the flow from
 * our own button means the code flow, and the code flow means a server-side
 * exchange, because the client secret must never reach a browser.
 *
 * The exchange returns an ID token, which is then put through
 * `verifyGoogleIdToken` exactly as the direct path is. That is deliberate:
 * a token that arrived over a trusted channel still gets its signature,
 * issuer, audience and expiry checked, so there is one verification path and
 * no "but this one came from Google directly" shortcut to get wrong.
 *
 * `redirect_uri` is the literal string `postmessage`, which is what Google
 * requires for the popup flow — the browser never navigates, so there is no
 * real URI to name.
 */
export async function exchangeGoogleCode(
  code: string,
  clientId: string,
  clientSecret: string,
  nowMs: number = Date.now(),
): Promise<GoogleIdentity> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: 'postmessage',
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    /* Google's body names the failure (`invalid_grant` for a reused or expired
       code, `redirect_uri_mismatch` for a misconfigured client). Worth having in
       the log, never worth returning. */
    const detail = await res.text();
    throw new Error(`google token exchange failed: HTTP ${res.status} ${detail.slice(0, 200)}`);
  }

  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) throw new Error('google token exchange returned no id_token');

  return verifyGoogleIdToken(body.id_token, clientId, nowMs);
}
