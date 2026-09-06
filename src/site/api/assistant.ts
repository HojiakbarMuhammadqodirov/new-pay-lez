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
 * ## What comes back is not prose
 *
 * `Answer` is the shape `domain/assistant.ts` composes: a sentence, the `facts`
 * every figure in that sentence came from, structured `results` (venue and deal
 * cards, §10.1), one `action`, and the record ids it was `grounding` on. The
 * sentence may have been through a model — `llm.compose` — but every number in
 * it was checked against `facts` before it was returned (`onlyKnownNumbers`), so
 * **the facts are not decoration and not a debug view**: they are the receipt.
 * The panel draws them under the answer for that reason.
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

/** The quiet second line on a result card: what it is, and where. */
export function resultMeta(row: AssistantResult): string | null {
  const kind = row.category ?? row.category_key ?? null;
  const where = row.city ?? null;
  if (kind && where) return `${kind} · ${where}`;
  return kind ?? where;
}
