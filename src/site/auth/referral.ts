/**
 * The invite code a visitor arrived with, held until they sign up.
 *
 * An invite link is `/sign-in?ref=PY7KQ2MX`. The code has to outlive the page
 * it arrived on: somebody opens the link, reads the landing page, goes to
 * L-Earn, comes back tomorrow, and *then* signs up — with email or with Google.
 * Before this the site never read the parameter at all, so no invite opened on
 * the web ever reached the server.
 *
 * **A fifth `localStorage` key, `paylez-referral`, and a per-device
 * convenience in the sense the root `CLAUDE.md` uses.** It holds a code
 * somebody chose to follow, nothing that identifies them, and it expires: an
 * invite followed six weeks ago and forgotten should not be credited to
 * whoever sent it. Every access is wrapped in `try`, because storage throws in
 * a private window with cookies blocked, and losing an invite is better than a
 * page that cannot load.
 *
 * What this cannot do is follow a link opened in Instagram's or Telegram's
 * in-app browser and finished in Safari — those are two different storages.
 * That is why the sign-up form has a code field this only *prefills*.
 */
import { SITE_ORIGIN } from '../router';

const KEY = 'paylez-referral';

/** How long a followed invite is remembered. */
const KEEP_DAYS = 30;

/** Loose on purpose: the server folds case and spacing (`social.normalizeCode`). */
const LOOKS_LIKE_CODE = /^[A-Za-z0-9 -]{4,20}$/;

export const normalizeReferral = (raw: string): string => raw.replace(/[\s-]/g, '').toUpperCase();

/**
 * Read `?ref=` off the address, keep it, and take it out of the bar.
 *
 * Called once from `main.tsx`, before the first render, so nothing the router
 * does to the address can run first. Taken out of the bar so a visitor who
 * copies the page's URL to send somebody else is not quietly forwarding a
 * stranger's invite.
 */
export function captureReferral(): void {
  try {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get('ref');
    if (raw === null) return;
    url.searchParams.delete('ref');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    if (!LOOKS_LIKE_CODE.test(raw)) return;
    localStorage.setItem(KEY, JSON.stringify({ code: normalizeReferral(raw), at: Date.now() }));
  } catch {
    /* Storage unavailable: the invite is lost, the page is not. */
  }
}

/** The remembered code, or `null` when there is none or it has expired. */
export function storedReferral(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { code?: unknown; at?: unknown };
    if (typeof parsed.code !== 'string' || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > KEEP_DAYS * 86_400_000) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed.code;
  } catch {
    return null;
  }
}

/** Dropped once an account exists — an invite is for opening one. */
export function forgetReferral(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* Nothing to forget. */
  }
}

/**
 * The link a player shares.
 *
 * The canonical host in a production build, so an invite sent from
 * `new.pay-lez.com` still lands on the address search engines are told about
 * (`SITE_ORIGIN`); the page's own origin in development, so a link made on a
 * laptop can be followed on that laptop.
 */
export const inviteLink = (code: string): string =>
  `${import.meta.env.PROD ? SITE_ORIGIN : window.location.origin}/sign-in?ref=${encodeURIComponent(code)}`;
