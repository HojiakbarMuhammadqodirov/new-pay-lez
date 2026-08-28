/**
 * Reach — impressions and clicks, written here and read back on the owner's
 * dashboard.
 *
 * Two halves of one contract in one file, deliberately. What a card posts when
 * it is drawn (`POST /v1/venues/:id/events`, `POST /v1/deals/:id/events`) and
 * what the venue's owner is shown (`GET /v1/partner/venues/:id/reach`) are the
 * same figure at two ends of a wire; split across two modules, the field names
 * drift and nobody notices until a funnel reads wrong.
 *
 * ── it acquires no memory ────────────────────────────────────────────────
 *
 * The same rule `traffic.ts` states at the top, and it is restated because it
 * is *easier* to break here: an impression counter is exactly the thing
 * somebody reaches for a de-duplication id to "improve". **No cookie, no
 * `localStorage` key, no visitor id, nothing in `sessionStorage`.** The server
 * identifies a visitor by a hash of the connection that rotates daily
 * (`server/domain/traffic.ts`, and rule 9 in `server/README.md`), and that
 * rotation is the whole reason none of this is consent-banner territory. A
 * client that mints an id so it can say "this person has already seen this
 * card" has quietly built a tracking cookie, and the banner follows the id
 * rather than the intent behind it.
 *
 * What *is* held is a module-level `Set` that dies with the page — the same
 * construction and the same justification as `sentReferrer` next door. "This
 * page load" is a lifetime a module variable expresses exactly; it is not
 * storage and it cannot outlive the tab.
 *
 * ── fire and forget ──────────────────────────────────────────────────────
 *
 * Every failure is swallowed, as in `traffic.ts`: a lost beacon is a lost row
 * and nothing else. It must never delay a render, break a navigation or put an
 * error in front of somebody reading the site — the backend being absent is the
 * normal case in development and has been the normal case for most of this
 * site's life.
 *
 * Unlike the traffic beacon there is **no batching**, because there is nothing
 * to batch into: the id is in the path, so two impressions of two different
 * cards are two requests however they are queued. Coalescing does that work
 * instead — one impression per card per surface per page load — which is also
 * the more honest number: an impression is a card being drawn, not a card being
 * scrolled past four times.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { API_BASE, ApiError, authHeader, hasToken } from './client';
import { useApi, type ApiResult } from './useApi';

/* ═══════════════════════════════════════════════════════ the collector ══ */

export type ReachTarget = 'venue' | 'deal';

/**
 * Ids the server could actually attribute.
 *
 * There are exactly two shapes and both come from the backend: rows carried
 * over from the old database keep their 24-hex Base44 id, and anything minted
 * since is `ven_` / `del_` plus twenty hex (`server/domain/ids.ts`).
 *
 * This gate exists because nearly everything `src/` renders today is *seed*
 * content with ids of its own — `WALLET_DEALS` carries `d-dubai-2for1`, the
 * stamp cards carry `s1` — and posting one of those is not a harmless miss. A
 * venue id the server does not know is a **404** (`venues.trackListing` reads
 * the venue first, precisely so a bad id cannot become an unattributable row);
 * a deal id it does not know is a **500**, because `deals.track` inserts
 * against a foreign key without looking. Both were checked against a running
 * server rather than assumed.
 *
 * So the rule is: a call site passes whatever id its card carries, and an id
 * the server cannot attribute is dropped here without a request. The wiring is
 * then already the right shape for the day those lists come from
 * `GET /v1/venues` and `GET /v1/deals` instead of from `content.ts`.
 */
const IMPORTED_ID = /^[0-9a-f]{24}$/;
const MINTED_ID: Record<ReachTarget, RegExp> = {
  venue: /^ven_[0-9a-f]{20}$/,
  deal: /^del_[0-9a-f]{20}$/,
};

function isServerId(target: ReachTarget, id: string | null | undefined): id is string {
  if (!id) return false;
  return IMPORTED_ID.test(id) || MINTED_ID[target].test(id);
}

/**
 * What has already been reported this page load.
 *
 * Not a visitor id and not persisted: see the header. It holds
 * `target:kind:id:source`, so the same venue seen on two different surfaces is
 * two impressions — which is true, and is the split the owner's "where they
 * came from" table is built out of.
 *
 * Impressions coalesce; **clicks do not**. Somebody who opens an offer twice
 * opened it twice, and that is a fact about intent rather than about layout.
 */
const reported = new Set<string>();

function send(path: string, body: unknown): void {
  const payload = JSON.stringify(body);
  const auth = authHeader();
  const url = `${API_BASE}${path}`;

  /*
   * Signed in: `fetch`, because `sendBeacon` cannot carry an Authorization
   * header and an unattributed click can never reach `uniqueClickers` — the one
   * figure on that panel that is about *people*. Signed out there is nothing to
   * attribute, so the beacon wins: it is the only thing that survives the page
   * being closed, which is exactly when the last click of a visit is still in
   * flight.
   */
  if (Object.keys(auth).length === 0 && typeof navigator.sendBeacon === 'function') {
    try {
      navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
    } catch {
      /* Swallowed: see the header. */
    }
    return;
  }

  void fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...auth },
    body: payload,
    keepalive: true,
  }).catch(() => {
    /* Swallowed. The server being absent is the normal case in development and
       must not produce console noise on every card that scrolls past. */
  });
}

/** One event, gated and coalesced. The single door every export below uses. */
function record(
  target: ReachTarget,
  kind: 'impression' | 'click' | 'open',
  id: string | null | undefined,
  source: string,
): void {
  if (!isServerId(target, id)) return;

  if (kind === 'impression') {
    const key = `${target}:${kind}:${id}:${source}`;
    if (reported.has(key)) return;
    reported.add(key);
  }

  send(
    target === 'venue'
      ? `/v1/venues/${encodeURIComponent(id)}/events`
      : `/v1/deals/${encodeURIComponent(id)}/events`,
    { kind, source },
  );
}

/** The venue's listing was drawn on a screen. */
export const venueImpression = (id: string | null | undefined, source: string): void =>
  record('venue', 'impression', id, source);

/** Somebody opened the listing to read more. */
export const venueClick = (id: string | null | undefined, source: string): void =>
  record('venue', 'click', id, source);

/** One of the venue's offers was drawn on a screen. */
export const dealImpression = (id: string | null | undefined, source: string): void =>
  record('deal', 'impression', id, source);

/**
 * Somebody opened the offer.
 *
 * `open` rather than `click`, because that is the server's word for a deal
 * (`deals.track`); the two vocabularies are folded together on the way back out
 * in `analytics.reach`. A **claim** is deliberately not postable from here and
 * must not become so — it is written by the gate from a confirmed scan, and it
 * is the step the rest of the dashboard argues from.
 */
export const dealOpen = (id: string | null | undefined, source: string): void =>
  record('deal', 'open', id, source);

/* ─────────────────────────────────────────────────────── seen on screen ── */

/** Half the card, for half a second. Together they are what "seen" means. */
const VISIBLE = 0.5;
const DWELL_MS = 500;

/**
 * A ref callback that reports one impression once the node has been at least
 * half on screen for a moment.
 *
 * Not on mount, because a card rendered below the fold was not seen; and once
 * per mount rather than on every scroll past, because the second one is not a
 * second impression. The dwell is what stops a fast flick down a long grid from
 * reporting every card in it.
 *
 * **Nothing here goes through React state**, per the per-frame rule in
 * `CLAUDE.md`: the fired timer, the observer and the teardown are all refs. An
 * IntersectionObserver on every card in a grid calling `setState` re-renders
 * the page on every scroll, which is the cost this whole codebase is arranged
 * to avoid.
 *
 * With no `IntersectionObserver` — a test environment, an ancient browser — it
 * reports **nothing**, rather than falling back to reporting on mount. An
 * impression nobody can say was on screen is a number and not a fact, and
 * inflating the top of an owner's funnel is precisely the failure the panel
 * this feeds exists to prevent.
 */
export function useImpressionRef(
  target: ReachTarget,
  id: string | null | undefined,
  source: string,
): (node: Element | null) => void {
  const timer = useRef<number | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);

  const stop = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    observer.current?.disconnect();
    observer.current = null;
  }, []);

  /* The node is gone before this runs on a route change, so without it the
     observer outlives the element it was watching. */
  useEffect(() => stop, [stop]);

  return useCallback(
    (node: Element | null) => {
      stop();
      if (node === null || !isServerId(target, id)) return;
      if (typeof IntersectionObserver === 'undefined') return;

      const io = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (!entry) return;

          /* Measured against the *smaller* of the card and the viewport. A
             panel taller than the screen can never reach a ratio of 0.5 and
             would therefore never report at all; half of what can be shown is
             half. */
          const box = entry.boundingClientRect;
          const root = entry.rootBounds;
          const reference = root ? Math.min(box.height, root.height) : box.height;
          const enough =
            reference > 0 && entry.intersectionRect.height >= reference * VISIBLE;

          if (!enough) {
            if (timer.current !== null) window.clearTimeout(timer.current);
            timer.current = null;
            return;
          }
          if (timer.current !== null) return;

          timer.current = window.setTimeout(() => {
            timer.current = null;
            record(target, 'impression', id, source);
            /* One per mount: nothing this observer can say afterwards changes
               the answer, and `reported` would drop it anyway. */
            io.disconnect();
            if (observer.current === io) observer.current = null;
          }, DWELL_MS);
        },
        /* Several thresholds rather than one, so a card that resizes or scrolls
           through in large steps still produces a callback for the test above
           to run in. */
        { threshold: [0, 0.25, VISIBLE, 0.75, 1] },
      );

      io.observe(node);
      observer.current = io;
    },
    [target, id, source, stop],
  );
}

/* ══════════════════════════════════════════════════════════ the report ══ */

/**
 * `GET /v1/partner/venues/:id/reach`, verbatim — `server/domain/analytics.ts`.
 *
 * Three properties of that response are load-bearing, and are restated here
 * because the front end is where they get broken:
 *
 * - **A rate over nothing is `0`, never `null`.** Null on this screen means "we
 *   are not telling you"; zero means "nothing happened", and rendering them the
 *   same way is the lie `suppressed` exists to prevent.
 * - **`uniqueClickers` is a `Metric` and it takes the min-cohort floor**, being
 *   a finding about *people*. The raw counts beside it do not, because an
 *   impression is a card being drawn and says nothing about anybody. A
 *   suppressed value is `null` and must never be rendered as 0.
 * - **Neither a visit nor a claim is postable by a client.** Both arrive from
 *   the gate, and every other figure on the dashboard is derived from them.
 */
export interface ReachMetric {
  value: number | null;
  kind: string;
  suppressed: boolean;
  cohort?: number;
}

export interface ReachReportRow {
  /** `null` is the listing itself; anything else is one of the venue's deals. */
  id: string | null;
  title: string;
  impressions: number;
  clicks: number;
  claims: number;
  /** 0–1, not a percentage. */
  clickRate: number;
}

export interface ReachReport {
  /** `YYYY-MM`, venue-local. The server's window is a calendar month. */
  period: string;
  impressions: number;
  clicks: number;
  clickRate: number;
  uniqueClickers: ReachMetric;
  claims: number;
  claimRate: number;
  sources: Array<{ source: string; impressions: number; clicks: number }>;
  rows: ReachReportRow[];
}

interface PartnerVenue {
  id: string;
  name: string;
}

/**
 * "Not asked" is an error state, not a loading one.
 *
 * `useApi` given a `null` path sits at `loading` for ever, which on this screen
 * would read as "the numbers are on their way" when in fact nothing was ever
 * sent. The union stays the three `useApi` returns — a failed request is a
 * *state*, not a zero — and this is its honest member: we cannot ask.
 */
const notAsked = (why: string): ApiError => new ApiError(0, 'no-partner-session', why);

/**
 * The venue this device's API session owns, if it owns one.
 *
 * The partner dashboard authenticates against `localStorage` (`src/site/auth/`)
 * and its `BusinessProfile` carries no server id at all, so there is no id to
 * hand down from the session — the API has to be asked whose venue this token
 * is. With no token, or with one that is not a partner's (the console's admin,
 * for instance), this resolves to `null` and the dashboard falls back to its
 * seeds. That is the whole of the "until the site's own auth moves to the
 * server" gap, in one hook.
 */
export function usePartnerVenueId(): string | null {
  const { state } = useApi<PartnerVenue[]>(hasToken() ? '/v1/partner/venues' : null);
  if (state.status !== 'ready') return null;
  return state.data[0]?.id ?? null;
}

/**
 * Impressions and clicks for one venue, straight from the server.
 *
 * `period` is `YYYY-MM` and is the server's own unit; omitted, it answers for
 * the month containing now. It is deliberately *not* fed from the dashboard's
 * 7/14/30/90-day picker — a rolling day count and a calendar month are
 * different windows, and quoting one under the other's label is the exact
 * mismatch `reachFor` scales its seeds to avoid.
 */
export function useReach(venueId: string | null, period?: string): ApiResult<ReachReport> {
  const path =
    venueId === null
      ? null
      : `/v1/partner/venues/${encodeURIComponent(venueId)}/reach${
          period ? `?period=${encodeURIComponent(period)}` : ''
        }`;

  const result = useApi<ReachReport>(path);

  /* Memoised so the substituted state is referentially stable: the screen reads
     it inside a `useMemo`, and a fresh object every render would re-run that
     every render. */
  const unavailable = useMemo<ApiResult<ReachReport>>(
    () => ({
      state: {
        status: 'error',
        error: notAsked('No partner session on the API for this device.'),
      },
      reload: () => undefined,
    }),
    [],
  );

  return path === null ? unavailable : result;
}
