/**
 * The language-model boundary: one question, a set of tools, an answer.
 *
 * Both specs put the model behind a service that "composes a grounded answer
 * from retrieved facts" and are explicit that it "must not invent venues,
 * prices, or user data". This file used to meet that by never letting the model
 * *answer* anything — the domain decided the sentence and the model only
 * reworded it — and the price was an assistant that could answer four kinds of
 * question and said "found 3 places" to everything else. It now answers, and
 * the constraint is held in three places instead of one:
 *
 * 1. **It can only see what a tool hands it.** `domain/assistantTools.ts`
 *    defines every tool, and every tool is bound to the asker on the server —
 *    the model never supplies a user id or a venue id the server has not
 *    already checked. What it does not look up, it does not know.
 * 2. **The system prompt says so** (`domain/assistantPrompt.ts`): answer from
 *    the tools and the knowledge block, in the reader's language, briefly, and
 *    say plainly when the data does not have it. That is a request.
 * 3. **`groundedNumbers` is the guarantee.** Every figure in the answer must
 *    appear in a tool result, the knowledge block, the conversation or the
 *    question. An answer with one that does not is sent back once with the
 *    figures named; a second miss is discarded whole and the deterministic
 *    answer is sent. Not patched — there is no way to know which number lied.
 *
 * ── why there is still no SDK here ──────────────────────────────────────
 *
 * `@anthropic-ai/sdk` is the right way to call this API in almost any project,
 * and this one has a stated budget of **one runtime dependency**, spent on `pg`
 * because Postgres speaks a protocol `fetch` cannot. The Messages API is one
 * POST, and a tool loop over it is the loop below — short, and every branch of
 * it is a decision this product wants to make itself (what a failure falls back
 * to, what is logged, what counts as grounded). `server/README.md` states the
 * rule; Stripe and Resend are called the same way.
 *
 * ── the rules that have not changed ─────────────────────────────────────
 *
 * - **A failure is never an error.** A timeout, a 429, a refusal, a malformed
 *   body, an ungrounded figure: all `{ ok: false }`, and the caller answers
 *   deterministically. The assistant is a panel in the corner of somebody's
 *   screen, and the model being down is not a reason for it to stop working.
 * - **Never log a person's words or the key.** One line per failure: what kind,
 *   the HTTP status and error type when there is one, and how long it took.
 */
import { CONFIG } from '../config.ts';

export type Mode = 'off' | 'live';

export const mode = (): Mode => (CONFIG.llm.mode === 'live' && CONFIG.llm.apiKey !== '' ? 'live' : 'off');

const DEFAULT_BASE = 'https://api.anthropic.com';

/**
 * The line `main.ts` prints at boot, beside `email: live via Resend…`.
 *
 * It exists because the model call used to be invisible: nothing said whether
 * the assistant on a running server was the model or the router, and the only
 * way to find out was to read the answers and guess. Names the model and the
 * host (never a path, a query or a key).
 */
export function bootLine(): string {
  if (mode() === 'off') {
    const why = CONFIG.llm.mode !== 'live' ? 'PAYLEZ_LLM is not live' : 'ANTHROPIC_API_KEY is unset';
    return `assistant: deterministic (${why})`;
  }
  let host = '';
  try {
    const url = new URL(CONFIG.llm.baseUrl);
    if (url.origin !== DEFAULT_BASE) host = ` at ${url.host}`;
  } catch {
    host = ' at an unparseable PAYLEZ_LLM_BASE';
  }
  const effort = acceptsEffort(CONFIG.llm.model) ? `, effort ${CONFIG.llm.effort}` : '';
  return `assistant: live via Claude (${CONFIG.llm.model}${effort})${host}`;
}

/** What is worth a warning at boot: settings that no longer do what they say. */
export function bootWarnings(): string[] {
  const out: string[] = [];
  const retired = CONFIG.llm.retired;
  if (retired.length > 0) {
    const one = retired.length === 1;
    out.push(
      `  ⚠  ${retired.join(' and ')} ${one ? 'is' : 'are'} no longer read — ${one ? 'it' : 'they'} sized the old one-sentence rewrite. Remove ${one ? 'it' : 'them'}; see PAYLEZ_LLM_* in server/README.md.`,
    );
  }
  /* The example env file used to pin this, and a copy of it pins it still. */
  if (mode() === 'live' && process.env.PAYLEZ_LLM_MODEL === 'claude-haiku-4-5') {
    out.push(
      '  ⚠  PAYLEZ_LLM_MODEL=claude-haiku-4-5 is the old rewrite model. Unset it for claude-sonnet-5-5, or set claude-haiku-5-5 for the cheaper current one.',
    );
  }
  return out;
}

/* ═════════════════════════════════════════════════════════ what it takes ══ */

/** One tool, as the Messages API takes it. */
export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * What a tool hands back. `data` is serialised for the model as it is — so it
 * is what the guard counts as grounded, too. `error: true` reaches the model as
 * an `is_error` result it can recover from ("no such article").
 */
export interface ToolReply {
  data: unknown;
  error?: boolean;
}

export type ToolRunner = (name: string, input: Record<string, unknown>) => Promise<ToolReply>;

/** One earlier exchange, as plain text: what was asked and what was answered. */
export interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AskInput {
  /** Frozen for the side — the rules and the knowledge block. Cached. */
  system: string;
  /** This request's own facts: today's date, the reader's language. Not cached. */
  context: string;
  tools: ToolSpec[];
  history: Turn[];
  question: string;
  run: ToolRunner;
}

export type Failure =
  | 'off'
  | 'http'
  | 'network'
  | 'timeout'
  | 'deadline'
  | 'refusal'
  | 'max_tokens'
  | 'empty'
  | 'malformed'
  | 'ungrounded';

export type AskResult =
  | {
      ok: true;
      text: string;
      /** Every tool call made, in order, with what it returned — for the receipt. */
      calls: Array<{ name: string; input: Record<string, unknown>; reply: ToolReply }>;
      ms: number;
    }
  | { ok: false; reason: Failure; ms: number };

/* ═══════════════════════════════════════════════════════ the logging sink ══ */

type Sink = (line: string) => void;

const quietDefault: Sink = (line) => {
  if (process.env.PAYLEZ_QUIET !== '1') console.warn(line);
};
let sink: Sink = quietDefault;

/** Tests capture the log to prove what it does not contain. `null` restores it. */
export function setLogSink(next: Sink | null): void {
  sink = next ?? quietDefault;
}

function logFailure(reason: Failure, ms: number, detail: { status?: number; type?: string; calls: number }): void {
  const why = detail.status
    ? ` (HTTP ${detail.status}${detail.type ? ` ${detail.type}` : ''})`
    : detail.type
      ? ` (${detail.type})`
      : '';
  sink(
    `assistant: model failed — ${reason}${why} after ${ms} ms, ${detail.calls} call${detail.calls === 1 ? '' : 's'}; answered deterministically`,
  );
}

/* ═════════════════════════════════════════════════════ the model's options ══ */

/**
 * Whether a model takes `output_config.effort`.
 *
 * It errors on Haiku 4.5 and Sonnet 4.5 — and Haiku 4.5 is what a copied env
 * file may still pin — so it is sent only where it is accepted rather than
 * everywhere and hoped about.
 */
export function acceptsEffort(model: string): boolean {
  const match = /^claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d+))?/.exec(model);
  if (!match) return false;
  const [, family, majorText, minorText] = match;
  if (family === 'fable' || family === 'mythos') return true;
  const minor = minorText !== undefined && Number(minorText) < 100 ? Number(minorText) : 0;
  const version = Number(majorText) * 10 + minor;
  if (family === 'opus') return version >= 45;
  if (family === 'sonnet') return version >= 46;
  return version >= 50;
}

/**
 * The models the server-side refusal fallback is offered on. A decline in a
 * category it reroutes (cyber, frontier-LLM work) is answered by Anthropic's
 * recommended model instead of becoming a refusal here. Neither is likely from
 * a loyalty app's users, which is why it costs nothing to have.
 */
const FALLBACK_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-fable-5'];
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Switched off for the process when the API refuses a request because of it. */
let fallbacksRefused = false;

const offersFallback = (model: string): boolean =>
  CONFIG.llm.fallbacks && !fallbacksRefused && FALLBACK_MODELS.some((id) => model === id || model.startsWith(`${id}-`));

/* ═══════════════════════════════════════════════════════════════ the loop ══ */

/** The longest a tool result may be, in characters, before it is cut. */
const TOOL_RESULT_MAX = 12_000;
/** Below this much time left, another call cannot finish — give up instead. */
const MIN_CALL_MS = 1_500;
/** Statuses worth one quick retry: rate limited, overloaded, a 5xx. */
const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);

type Block = Record<string, unknown> & { type?: string };
type Message = { role: 'user' | 'assistant'; content: string | Block[] };

interface Reply {
  stop_reason?: string;
  content?: Block[];
}

type Posted =
  | { ok: true; body: Reply }
  | { ok: false; reason: Failure; status?: number; type?: string };

/**
 * Ask, with tools, until there is a grounded answer or a reason to stop.
 *
 * The shape is the documented manual loop: send system, tools and messages;
 * while the model stops for `tool_use`, run every tool it asked for — in
 * parallel, all results in **one** user message — and send again. The
 * assistant's content goes back **unchanged**, thinking blocks included: the
 * current models bind those blocks to the conversation that made them, and an
 * edited history is a 400. Nothing here edits; every turn is appended.
 *
 * Three ceilings, each ending in the deterministic answer rather than an error:
 * `toolRounds` rounds of tools (after which the model is made to answer with
 * what it has, `tool_choice: none`), `requestTimeoutMs` per call, and
 * `deadlineMs` over the whole thing.
 */
export async function ask(input: AskInput): Promise<AskResult> {
  const started = Date.now();
  if (mode() === 'off') return { ok: false, reason: 'off', ms: 0 };

  const deadline = started + CONFIG.llm.deadlineMs;
  const known: string[] = [input.system, input.context, input.question, ...input.history.map((turn) => turn.text)];
  const calls: Array<{ name: string; input: Record<string, unknown>; reply: ToolReply }> = [];

  const messages: Message[] = historyMessages(input.history);
  messages.push({ role: 'user', content: input.question });

  let rounds = 0;
  let posts = 0;
  let corrected = false;

  const fail = (reason: Failure, detail: { status?: number; type?: string } = {}): AskResult => {
    const ms = Date.now() - started;
    logFailure(reason, ms, { ...detail, calls: posts });
    return { ok: false, reason, ms };
  };

  for (;;) {
    const lastRound = rounds >= CONFIG.llm.toolRounds;
    const posted = await post(input, messages, lastRound, deadline);
    posts += 1;
    if (!posted.ok) return fail(posted.reason, { status: posted.status, type: posted.type });

    const reply = posted.body;
    const content = Array.isArray(reply.content) ? reply.content : null;
    /* A refusal is a valid 200, and its content reads like an answer. Checked
       before anything reads the content. */
    if (reply.stop_reason === 'refusal') return fail('refusal');
    if (content === null) return fail('malformed');

    if (reply.stop_reason === 'tool_use') {
      const uses = content.filter((block) => block.type === 'tool_use');
      /* On the last round it was sent `tool_choice: none`; asking for a tool
         anyway is not something another round can fix, and looping on it would
         spend the deadline on calls that cannot end. */
      if (uses.length === 0 || lastRound) return fail('malformed');
      messages.push({ role: 'assistant', content });
      rounds += 1;

      const results = await Promise.all(
        uses.map(async (use) => {
          const id = String(use.id ?? '');
          const name = String(use.name ?? '');
          const args = isRecord(use.input) ? use.input : {};
          let outcome: ToolReply;
          try {
            outcome = await input.run(name, args);
          } catch {
            /* The tool's own failure, not the model's: it gets an error result
               it can work around, and the reason stays here. */
            outcome = { data: 'That lookup failed on the server. Do not retry it; answer with what you have.', error: true };
          }
          calls.push({ name, input: args, reply: outcome });
          const text = serialise(outcome.data);
          known.push(text);
          return {
            type: 'tool_result',
            tool_use_id: id,
            content: text,
            ...(outcome.error ? { is_error: true } : {}),
          } as Block;
        }),
      );
      messages.push({ role: 'user', content: results });
      continue;
    }

    if (reply.stop_reason === 'max_tokens') return fail('max_tokens');

    const text = content
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => String(block.text))
      .join('')
      .trim();
    if (!text) return fail('empty');

    const verdict = groundedNumbers(text, known);
    if (verdict.ok) return { ok: true, text, calls, ms: Date.now() - started };

    /* One chance to correct, by naming the figures. The answer goes back
       unchanged and the correction is a new user turn after it — append-only,
       so nothing the model thought earlier is invalidated. */
    if (corrected) return fail('ungrounded');
    corrected = true;
    messages.push({ role: 'assistant', content });
    messages.push({
      role: 'user',
      content:
        `[Check failed] Your answer contains ${verdict.unknown.length === 1 ? 'a figure' : 'figures'} ` +
        `(${verdict.unknown.join(', ')}) that ${verdict.unknown.length === 1 ? 'does' : 'do'} not appear in any tool result, ` +
        'the knowledge block or the conversation. Do not calculate, estimate or round new figures. ' +
        'Rewrite the answer using only figures exactly as the data gives them, or leave the figure out ' +
        'and say the data does not have it. Reply with the answer only.',
    });
  }
}

/** Earlier turns as alternating plain-text messages, starting with a question. */
function historyMessages(history: Turn[]): Message[] {
  const out: Message[] = [];
  for (const turn of history) {
    const text = turn.text.trim();
    if (!text) continue;
    if (out.length === 0 && turn.role !== 'user') continue;
    const last = out[out.length - 1];
    /* Two questions in a row — the answer between them was never written, a
       request that failed — are one turn to the API either way; merging them
       keeps the alternation the transcript is supposed to have. */
    if (last && last.role === turn.role) last.content = `${String(last.content)}\n\n${text}`;
    else out.push({ role: turn.role, content: text });
  }
  /* The question being asked is appended after this, so the history must not
     end on a question of its own. */
  if (out.length > 0 && out[out.length - 1].role === 'user') out.pop();
  return out;
}

/** One POST, with one quick retry on a status worth retrying. */
async function post(input: AskInput, messages: Message[], lastRound: boolean, deadline: number): Promise<Posted> {
  let retried = false;
  for (;;) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_CALL_MS) return { ok: false, reason: 'deadline' };

    const fallback = offersFallback(CONFIG.llm.model);
    const outcome = await postOnce(input, messages, lastRound, Math.min(CONFIG.llm.requestTimeoutMs, remaining), fallback);
    if (outcome.ok) return outcome;

    /* The fallback parameter is a beta; if this account or model refuses it,
       stop sending it rather than losing every answer to it. */
    if (fallback && outcome.status === 400 && /fallback|anthropic-beta|beta/i.test(outcome.message ?? '')) {
      fallbacksRefused = true;
      continue;
    }

    const retryable = outcome.reason === 'network' || (outcome.status !== undefined && RETRYABLE.has(outcome.status));
    if (!retried && retryable && deadline - Date.now() > 5_000) {
      retried = true;
      await new Promise((resolve) => setTimeout(resolve, 400));
      continue;
    }
    return { ok: false, reason: outcome.reason, status: outcome.status, type: outcome.type };
  }
}

async function postOnce(
  input: AskInput,
  messages: Message[],
  lastRound: boolean,
  timeoutMs: number,
  fallback: boolean,
): Promise<(Posted & { ok: true }) | { ok: false; reason: Failure; status?: number; type?: string; message?: string }> {
  const model = CONFIG.llm.model;
  const body: Record<string, unknown> = {
    model,
    max_tokens: CONFIG.llm.maxTokens,
    /* Tools render first, then the system blocks, so the breakpoint on the
       frozen block caches both. The context block is after it: it carries the
       date, and a date in the cached prefix would miss the cache every day. */
    tools: input.tools,
    system: [
      { type: 'text', text: input.system, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: input.context },
    ],
    messages,
  };
  if (acceptsEffort(model)) body.output_config = { effort: CONFIG.llm.effort };
  if (lastRound) body.tool_choice = { type: 'none' };
  if (fallback) body.fallbacks = 'default';

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': CONFIG.llm.apiKey,
    'anthropic-version': '2023-06-01',
  };
  if (fallback) headers['anthropic-beta'] = FALLBACK_BETA;

  /* One controller per call, cleared in `finally` — an uncleared timer keeps
     the event loop alive for the rest of the window, which in a test run is the
     difference between exiting and hanging. */
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), Math.max(1, timeoutMs));
  try {
    const response = await fetch(`${CONFIG.llm.baseUrl.replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      signal: abort.signal,
      headers,
      body: JSON.stringify(body),
    });
    const raw = await response.text();
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    if (!response.ok) {
      const error = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : {};
      return {
        ok: false,
        reason: 'http',
        status: response.status,
        type: typeof error.type === 'string' ? error.type.slice(0, 60) : undefined,
        message: typeof error.message === 'string' ? error.message : undefined,
      };
    }
    if (!isRecord(parsed)) return { ok: false, reason: 'malformed', status: response.status };
    return { ok: true, body: parsed as Reply };
  } catch (cause) {
    if (abort.signal.aborted) return { ok: false, reason: 'timeout' };
    return { ok: false, reason: 'network', type: (cause as Error)?.name };
  } finally {
    clearTimeout(timer);
  }
}

function serialise(data: unknown): string {
  const text = typeof data === 'string' ? data : JSON.stringify(data ?? null);
  return text.length > TOOL_RESULT_MAX ? `${text.slice(0, TOOL_RESULT_MAX)}… [cut]` : text;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/* ═════════════════════════════════════════════════════════════ the guard ══ */

/**
 * A run of digits, with single grouping or decimal separators inside it —
 * `1 234,50`, `1,234.50`, `640`. A space, a no-break space and the narrow one
 * Polish and Russian group with are all separators; a line break is not, or a
 * figure at the end of one line would fuse with a list number on the next.
 */
const NUMBER = /\d+(?:[.,   ]\d+)*/g;
const SEPARATORS = /[.,   ]/g;

const canonical = (text: string): string => {
  const value = Number(text);
  return Number.isFinite(value) ? String(value) : text;
};

/**
 * Every value a written figure could be.
 *
 * `1,234` is 1234 in English and 1.234 in Polish, and `1 234,50` is a Polish
 * 1234.5. The guard does not know which language wrote it, so it accepts a
 * figure if *any* reading of it was retrieved — the alternative throws away
 * correct answers for their punctuation, which is the failure where the guard
 * is sound and the feature never turns on.
 */
function readings(token: string): string[] {
  const out = new Set<string>([canonical(token.replace(SEPARATORS, ''))]);
  const decimal = /^(.*)[.,](\d+)$/.exec(token);
  if (decimal) out.add(canonical(`${decimal[1].replace(SEPARATORS, '')}.${decimal[2]}`));
  return [...out];
}

const partsOf = (token: string): string[] =>
  token
    .split(SEPARATORS)
    .filter(Boolean)
    .map(canonical);

/** Every reading of every figure in some text, and of each of its parts. */
function figuresIn(text: string, into = new Set<string>()): Set<string> {
  for (const token of text.match(NUMBER) ?? []) {
    for (const value of readings(token)) into.add(value);
    for (const part of partsOf(token)) into.add(part);
  }
  return into;
}

/**
 * The verification every model answer passes before anybody reads it.
 *
 * `sources` is everything the answer may draw on: the system prompt with its
 * knowledge block, today's context, the question, the earlier turns and every
 * tool result exactly as the model saw it. A figure is grounded when one of its
 * readings is in there. A date written the local way — `15.10.2026`, three
 * figures run together by dots — is grounded when each part is; a time like
 * `14:00` is two figures already. A space-grouped figure (`9 999`) is never
 * split that way, or any number could be assembled out of small known ones.
 *
 * Numbered-list markers are not figures: "1." at the start of a line is
 * typography, and rejecting a list for its numbering would reject every list.
 */
export function groundedNumbers(text: string, sources: string[]): { ok: boolean; unknown: string[] } {
  const known = new Set<string>();
  for (const source of sources) figuresIn(source, known);

  const unknown: string[] = [];
  const body = text.replace(/^\s*\d{1,2}[.)](?=\s)/gm, '');
  for (const token of body.match(NUMBER) ?? []) {
    if (readings(token).some((value) => known.has(value))) continue;
    if (/^\d+(?:[.,]\d+){2,}$/.test(token) && partsOf(token).every((part) => known.has(part))) continue;
    if (!unknown.includes(token)) unknown.push(token);
  }
  return { ok: unknown.length === 0, unknown };
}

/**
 * Whether `text` writes `value` — for the receipt, so stricter than the guard.
 *
 * Whole figures only, never the parts of one, and never a zero-padded
 * component: the `00` of "open until 22:00" is a clock, and reading it as a 0
 * would put every zero the tools returned ("earned from playing: 0") under an
 * answer about opening hours.
 */
export function mentions(text: string, value: number | string): boolean {
  const counted = (token: string) => !/^0\d/.test(token);
  const written = new Set<string>();
  for (const token of text.match(NUMBER) ?? []) {
    if (counted(token)) for (const reading of readings(token)) written.add(reading);
  }
  if (typeof value === 'number') return Number.isFinite(value) && written.has(canonical(String(value)));
  const tokens = (value.match(NUMBER) ?? []).filter(counted);
  return tokens.length > 0 && tokens.every((token) => readings(token).some((reading) => written.has(reading)));
}

/**
 * The old guard's signature, kept because it states the property in its plainest
 * form: no figure in `text` that the facts or the deterministic draft do not
 * carry. `groundedNumbers` is the same check over arbitrary text.
 */
export function onlyKnownNumbers(text: string, facts: ReadonlyArray<Record<string, unknown>>, draft = ''): boolean {
  const sources = [draft];
  for (const fact of facts) {
    if (fact.value === null || fact.value === undefined) continue;
    sources.push(String(fact.value));
  }
  return groundedNumbers(text, sources).ok;
}
