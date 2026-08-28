/**
 * The traffic beacon — the client half of `server/domain/traffic.ts`.
 *
 * Read that file's header before changing anything here, because the privacy
 * property it describes is only half server-side. The server counts a visitor as
 * a daily hash of the connection and never stores an identifier; **this file's
 * job is to not undo that.** Concretely, three things it must never start doing:
 *
 * - **Never generate or store a visitor id.** No cookie, no `localStorage` key,
 *   nothing in `sessionStorage`. The server derives the visit from the
 *   connection precisely so that the client does not have to hold anything, and
 *   a client that invents an id has quietly built the tracking cookie the whole
 *   design avoids — along with the consent banner that legally follows it.
 * - **Never send the current URL as the referrer.** Only `document.referrer`,
 *   which is where the visitor came *from*. The server keeps its host and drops
 *   the rest.
 * - **Never put a query string in a path.** The server strips everything after a
 *   `?`, but a query string is where somebody's email address ends up in an
 *   analytics tool, and the fix belongs on both sides of the wire.
 *
 * It is fire-and-forget by construction: events are queued, flushed on a timer
 * and on `visibilitychange`, and every failure is swallowed. A lost beacon is a
 * lost row and nothing else — it must never be able to delay a render, break a
 * navigation, or surface an error to somebody reading the site.
 */
import { API_BASE } from './client';

interface QueuedEvent {
  kind: 'view' | 'action';
  path: string;
  name?: string;
}

let queue: QueuedEvent[] = [];
let timer: number | null = null;
let started = false;
/* Whether the entry referrer has already gone out. Not a visitor id and not
   persisted anywhere — it is a module flag that dies with the page, which is
   exactly the lifetime "this page load" means. */
let sentReferrer = false;

/** Matches `CONFIG.traffic.maxBatch` on the server, which truncates past it. */
const MAX_BATCH = 50;
const FLUSH_MS = 5000;

function sendBatch(useBeacon: boolean): void {
  const events = queue.slice(0, MAX_BATCH);
  queue = queue.slice(MAX_BATCH);

  const body = JSON.stringify({
    events,
    /* Only where the visitor came from, and only on the first batch of a page
       load — after that the referrer is stale and the server has it anyway.
       The flag is what makes the second half of that sentence true: it used to
       be attached to every batch, so a long visit reported its entry referrer
       over and over and the server counted one arrival many times. */
    referrer: (sentReferrer ? '' : document.referrer) || undefined,
  });
  sentReferrer = true;

  /* `sendBeacon` is the only thing that survives the page being closed, which is
     exactly when the last events of a visit are still queued. It cannot carry
     an Authorization header, so a signed-in visit's final batch arrives
     anonymous — an acceptable loss, and better than losing it entirely. */
  if (useBeacon && typeof navigator.sendBeacon === 'function') {
    try {
      navigator.sendBeacon(`${API_BASE}/v1/traffic`, new Blob([body], { type: 'application/json' }));
    } catch {
      /* Swallowed: see the header. */
    }
    return;
  }

  void fetch(`${API_BASE}/v1/traffic`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    /* Swallowed. The server being absent is the normal case in development and
       must not produce console noise on every navigation. */
  });
}

/**
 * Drain the queue.
 *
 * One batch is capped at `MAX_BATCH` because the server truncates past it, and
 * the remainder used to be left sitting there with nothing scheduled to come
 * back for it — so a burst of more than fifty events stranded its tail until
 * some *later* `trackView` happened to restart the timer. On the
 * `visibilitychange` path that tail was not late, it was gone: the page is
 * closing, and there is no later call. That is the one moment this file exists
 * to protect, so the beacon path drains rather than sending a single batch.
 */
function flush(useBeacon = false): void {
  if (queue.length === 0) return;

  if (useBeacon) {
    while (queue.length > 0) sendBatch(true);
    return;
  }

  sendBatch(false);
  /* Still more than one batch's worth: come back for it rather than waiting on
     a navigation that may never happen. */
  if (queue.length > 0) schedule();
}

function schedule(): void {
  if (timer !== null) return;
  timer = window.setTimeout(() => {
    timer = null;
    flush();
  }, FLUSH_MS);
}

/** Called once, from `Site`. Idempotent under React's double-invoked effects. */
export function startTraffic(): () => void {
  if (started) return () => undefined;
  started = true;

  const onHidden = () => {
    if (document.visibilityState === 'hidden') flush(true);
  };
  document.addEventListener('visibilitychange', onHidden);

  return () => {
    document.removeEventListener('visibilitychange', onHidden);
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    started = false;
  };
}

export function trackView(path: string): void {
  queue.push({ kind: 'view', path });
  schedule();
}

/**
 * A named thing somebody did — a game started, a plan opened, a converter used.
 * The name is the unit of analysis; the path is only context.
 */
export function trackAction(name: string, path: string): void {
  queue.push({ kind: 'action', path, name });
  schedule();
}
