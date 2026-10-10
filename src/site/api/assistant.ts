/**
 * The consumer assistant, as the server answers it.
 *
 * `AssistantDock` had a working thread, a working composer and a canned reply
 * that said so — "not connected to a model in this build" — and its own header
 * comment claimed there was "no backend in this repo and no network layer
 * anywhere in `src/`". Both stopped being true a while ago: `domain/assistant.ts`
 * retrieves, `ports/llm.ts` rewords, and there are eleven files in this
 * directory. This is the twelfth, and it is the one that makes the button do
 * what it says.
 *
 * ## Three endpoints, and why the first one exists
 *
 * `POST /v1/assistant/sessions` opens a conversation and `POST /v1/assistant/ask`
 * puts a question to it. The ask endpoint will happily open its own session when
 * none is named — `conversationFor` on the server does exactly that — so the
 * separate call looks redundant until you read what the meter is counted from:
 * **the transcript**. An ask with no session writes nothing, so an unlimited
 * number of them cost nothing to make. The server closed that by minting a
 * session server-side; this file keeps the id so the *second* question lands in
 * the same conversation as the first, which is what makes it a conversation
 * rather than five unrelated ones.
 *
 * ## What comes back is not only prose
 *
 * `Answer` is the shape `domain/assistant.ts` returns, and it is the same shape
 * whichever of its two paths answered: a sentence, the `facts` it used,
 * structured `results` (venue, deal and directory rows, §10.1), one `action`,
 * and the record ids it was `grounding` on. With a model configured the
 * sentence is Claude's own answer to the question — written from tools that
 * read this account's points, wallet, games, missions, the places on Paylez and
 * the newcomer's guide — and every figure in it was checked against what those
 * tools returned before the server sent it (`groundedNumbers`). Without one, or
 * when the model fails, the server's keyword router answers instead. Either
 * way **the facts are not decoration and not a debug view**: they are the
 * receipt, the figures the sentence actually used. The panel draws them under
 * the answer for that reason.
 *
 * ## It can take a while, and nothing here times it out
 *
 * A model answer is a short loop of calls with lookups between them — a few
 * seconds usually, up to the server's fifteen-second deadline, after which the
 * server answers from its router rather than erroring. So `ask` sets no client
 * timeout of its own: a timer here shorter than the server's would throw away
 * an answer that was about to arrive, and one longer would never fire. The
 * panel's thinking turn is what covers the wait.
 *
 * `results` is deliberately typed loose. The server returns three different row
 * shapes through one field — venues, guidance services and deals — and the
 * honest client-side model of "one of three things, and I know which fields
 * overlap" is an optional-field record read defensively, not a union invented
 * here that would go stale the first time a column moved.
 *
 * ## The refusal that is not an error
 *
 * The assistant is metered: five asks a day free, twenty on Pro. Over the line
 * the server throws `entitlement_required` with the limit in the message, and it
 * **refuses rather than quietly degrading** — the note in `consumer.ts` argues
 * that at length, and the consequence for this file is that a 403 here is a
 * state the panel has to draw properly, not a failure to log. `isOutOfAsks`
 * exists so the screen can tell "that is your five for today" apart from "the
 * server is not there", which is the same `loading | ready | error` distinction
 * `useApi` makes one file over.
 */
import { ApiError, call } from './client';
import type { NavKey } from '../content';

/**
 * One figure the answer was built from.
 *
 * `value` is a string or a number because the server sends both — a balance is
 * `640`, a voucher is `'10%'` — and coercing either way here would either strip
 * the percent sign or make a points total a string that cannot be compared.
 */
export interface AssistantFact {
  kind: string;
  id?: string;
  label: string;
  value: string | number;
}

/** Where the answer points, when there is somewhere to point. */
export interface AssistantAction {
  label: string;
  href: string;
}

/**
 * A row behind an answer — a venue, a guidance service or a deal.
 *
 * Every field is optional because the three shapes only partly overlap: a venue
 * has `category` and an `address`, a service has `category_key` and no address,
 * a deal has a `title` rather than a `name`. `resultLabel` below is the whole of
 * the reading logic, in one place, so a card cannot render `undefined`.
 */
export interface AssistantResult {
  id?: string;
  name?: string;
  title?: string;
  category?: string;
  category_key?: string | null;
  city?: string | null;
  address?: string | null;
}

export interface AssistantAnswer {
  text: string;
  facts: AssistantFact[];
  results: AssistantResult[];
  action: AssistantAction | null;
  grounding: string[];
  /** True when there was nothing to ground on — the server's `emptyContext`. */
  empty: boolean;
}

/** Opens a conversation and returns its id. */
export async function startConversation(language?: string): Promise<string> {
  const body = await call<{ sessionId: string }>('/v1/assistant/sessions', {
    method: 'POST',
    body: {},
    language,
  });
  return body.sessionId;
}

/**
 * Puts one question to the assistant.
 *
 * `sessionId` is optional at the type level because the server accepts an ask
 * without one — which matters on the path where opening the conversation failed
 * but the ask itself might still work. A question answered outside a
 * conversation is worth more to the person asking than a panel that refuses
 * because its bookkeeping call did not land.
 */
export async function ask(input: {
  text: string;
  sessionId?: string;
  language?: string;
  signal?: AbortSignal;
}): Promise<AssistantAnswer> {
  return await call<AssistantAnswer>('/v1/assistant/ask', {
    method: 'POST',
    body: input.sessionId
      ? { text: input.text, sessionId: input.sessionId }
      : { text: input.text },
    language: input.language,
    signal: input.signal,
  });
}

/**
 * Was this refusal the daily allowance running out?
 *
 * `entitlement_required` is the same code the gift-card tier refuses with, so
 * the check is on the code rather than on the status: a 403 is also what an
 * expired token looks like, and telling somebody they have used up their
 * questions when actually they have been signed out is a worse answer than
 * saying nothing.
 */
export function isOutOfAsks(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'entitlement_required';
}

/** Did the request fail because there is no server, rather than because of us? */
export function isUnreachable(error: unknown): boolean {
  return error instanceof ApiError && error.status === 0;
}

/**
 * What to write on a result card.
 *
 * Venues and services carry `name`, deals carry `title`, and a row that somehow
 * has neither returns null so the caller can drop the card rather than draw an
 * empty one. The three-field fallback is here and nowhere else, so a fourth row
 * shape is one line in one file.
 */
export function resultLabel(row: AssistantResult): string | null {
  return row.name ?? row.title ?? null;
}

/**
 * Where an answer's `action` goes on this site — or nowhere.
 *
 * The server writes its hrefs for two clients at once: the phone app's
 * vocabulary (`#/learn`, `#/wallet`, `#/deals`, `#/venue/:id`) and the router's
 * older `#/vouchers`. Most of them are not routes here — this site has no venue
 * page and its games are `#/l-earn` — and an `<a>` pointed at one lands on the
 * landing page, which is a link that lies about where it goes. So each is read
 * as the page on this site that does the job, and an href that maps to none is
 * not drawn at all: the picture-of-a-control rule, for a link.
 *
 * The panel labels the link with the page's own name in the reader's language
 * rather than the server's English label, because the server's label names a
 * place ("Get 10% off at …") this site cannot open.
 */
export function actionDestination(href: string): Extract<NavKey, 'learn' | 'wallet' | 'relocate'> | null {
  const section = /^#\/([a-z-]+)/.exec(href.trim())?.[1];
  switch (section) {
    case 'learn':
    case 'l-earn':
    case 'play':
    case 'missions':
      return 'learn';
    case 'wallet':
    case 'vouchers':
    case 'deals':
    case 'deal':
    case 'venue':
    case 'stamps':
    case 'shop':
      return 'wallet';
    case 'relocate':
    case 'guide':
      return 'relocate';
    default:
      return null;
  }
}

/** The quiet second line on a result card: what it is, and where. */
export function resultMeta(row: AssistantResult): string | null {
  const kind = row.category ?? row.category_key ?? null;
  const where = row.city ?? null;
  if (kind && where) return `${kind} · ${where}`;
  return kind ?? where;
}
