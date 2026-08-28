/**
 * The language-model boundary.
 *
 * Both specs put the model behind a service that "composes a grounded answer
 * from retrieved facts", and are explicit that it "must not invent venues,
 * prices, or user data". This file is where that constraint is *structural*
 * rather than a hope: the only thing a model is ever handed is a list of facts
 * the database produced, and the only thing it may return is prose. It cannot
 * add a number, because it is never asked for one — and if it adds one anyway,
 * `onlyKnownNumbers` catches it and the draft is sent instead.
 *
 * With no model configured — the default — `compose` returns the deterministic
 * sentence `domain/assistant.ts` already built. That is not a degraded mode: the
 * facts, the results and the action are identical either way, and the only thing
 * a model changes is how the sentence reads.
 *
 * ── why there is no SDK here ─────────────────────────────────────────────
 *
 * `@anthropic-ai/sdk` is the right way to call this API in almost any project,
 * and it is the wrong way in this one. The server's defining property is that it
 * has **zero runtime dependencies** — `node:sqlite`, `node:http`, `node:crypto`,
 * run straight from TypeScript by Node 22 — which is what lets it be deployed by
 * copying a directory, and `server/README.md` states it as a rule rather than as
 * a happy accident. One request to one endpoint, with `fetch` built into the
 * runtime, is not worth trading that for. If this file ever grows streaming,
 * tool use or batching, the trade changes and the SDK should win.
 *
 * ── the three rules ──────────────────────────────────────────────────────
 *
 * 1. **Never send a person's data.** `facts` is the only input, and it is what
 *    `domain/assistant.ts` retrieved and is already showing the reader. No
 *    name, no email, no id, no conversation history.
 * 2. **Never let a failure become an error.** A timeout, a 429, a malformed
 *    body and a refusal are all the same outcome here: the draft. The assistant
 *    is a panel in the corner of somebody's screen, and it working slightly less
 *    well is not a reason for it to stop working.
 * 3. **Check the output, do not trust it.** The system prompt forbids new
 *    figures, which is a request. `onlyKnownNumbers` is the guarantee.
 */
import { CONFIG } from '../config.ts';
import type { Fact } from '../domain/assistant.ts';

export const mode = (): 'off' | 'live' =>
  CONFIG.llm.mode === 'live' && CONFIG.llm.apiKey !== '' ? 'live' : 'off';

export interface ComposeInput {
  /** The already-grounded sentence. The floor, and the fallback. */
  draft: string;
  /** Every number the answer may contain, and nothing else. */
  facts: Fact[];
  language: string;
  /** 'consumer' or 'partner' — the two have different registers. */
  side: 'consumer' | 'partner';
}

/**
 * What the model is told it is for.
 *
 * Written as constraints rather than as a persona, because the only thing that
 * can go wrong here is the model adding something. The register split is the
 * one piece of tone in it: a player is being helped, an owner is being briefed.
 *
 * It is a constant so that prompt caching has a stable prefix to hit — the
 * system prompt is identical on every request and only the user turn changes.
 */
const SYSTEM = [
  'You rewrite one sentence for the Paylez assistant so that it reads like a',
  'person wrote it. You are not answering the question — it has already been',
  'answered, correctly, from the database.',
  '',
  'Rules, in order of importance:',
  '1. Never introduce a number, price, date, percentage, count or name that is',
  '   not already in the draft or in the supplied facts. If you are unsure',
  '   whether a figure is allowed, leave it exactly as the draft has it.',
  '2. Keep every figure the draft contains, unchanged, including its units.',
  '3. Do not add a greeting, a sign-off, an apology, an emoji, or an offer to',
  '   help further. The interface supplies the action.',
  '4. Answer in the language named below, and in at most two sentences.',
  '5. Reply with the rewritten sentence and nothing else — no preamble, no',
  '   quotation marks, no explanation of what you changed.',
].join('\n');

const REGISTER: Record<ComposeInput['side'], string> = {
  consumer: 'Warm and plain. You are talking to somebody using the app.',
  partner: 'Brief and factual. You are talking to a business owner about their venue.',
};

export async function compose(input: ComposeInput): Promise<string> {
  if (mode() === 'off') return input.draft;

  /*
   * One abort controller for the whole call, cleared in `finally`. Without the
   * clear, a fast response still leaves a timer holding the event loop open for
   * the rest of the window — which in a test run is the difference between the
   * process exiting and hanging.
   */
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), CONFIG.llm.timeoutMs);

  try {
    const response = await fetch(`${CONFIG.llm.baseUrl}/v1/messages`, {
      method: 'POST',
      signal: abort.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': CONFIG.llm.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CONFIG.llm.model,
        max_tokens: CONFIG.llm.maxTokens,
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              `Language: ${input.language}`,
              `Register: ${REGISTER[input.side]}`,
              '',
              'Facts you may refer to (and nothing outside this list):',
              /* The facts as they are, minus anything that is not a label and a
                 value. `id` is a database key and `action` is a URL the
                 interface renders itself; neither belongs in a sentence, and
                 sending them would be sending the model more than it needs. */
              ...input.facts.map(
                (fact) =>
                  `- ${fact.label}${fact.value === null || fact.value === undefined ? '' : `: ${fact.value}`}`,
              ),
              '',
              'Draft to rewrite:',
              input.draft,
            ].join('\n'),
          },
        ],
      }),
    });

    if (!response.ok) return input.draft;

    const body = (await response.json()) as {
      stop_reason?: string;
      content?: Array<{ type?: string; text?: string }>;
    };

    /* A refusal is a valid 200 with no usable prose in it. Checked before the
       content is read rather than after, because `content` on a refused turn is
       an explanation of the refusal and reads like an answer. */
    if (body.stop_reason === 'refusal') return input.draft;

    const text = (body.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
      .trim();

    if (!text) return input.draft;

    /* The guarantee. An instruction not to invent a figure is a request; this is
       the part that holds. A rewrite that introduced one is discarded whole —
       not patched, because there is no way to know which number is the lie. */
    if (!onlyKnownNumbers(text, input.facts, input.draft)) return input.draft;

    return text;
  } catch {
    /* Timeout, DNS, a socket reset, a body that is not JSON. All the same
       outcome: the answer the database already produced. See rule 2. */
    return input.draft;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The verification a live implementation must run before returning model prose.
 *
 * Exported and testable on its own, because it is the safety property: if it
 * ever passes something it should not, the assistant is lying with the platform's
 * authority behind it.
 *
 * `draft` is part of the allowed set and not an afterthought. The draft is
 * itself grounded — `domain/assistant.ts` built it out of the same records — and
 * it routinely contains figures that never became a `Fact`: an hour in "quiet
 * between 14:00 and 16:00", the "2" in "came twice". Checking against the facts
 * alone rejected every rewrite of a sentence like that, which is the failure
 * mode where the guard is technically sound and the feature never turns on.
 */
export function onlyKnownNumbers(text: string, facts: Fact[], draft = ''): boolean {
  const known = new Set<string>();

  const learn = (value: string) => {
    known.add(value);
    /* `1,234` and `1234` and `1 234` are one number written three ways, and a
       model asked to write a sentence will group digits the way the language
       does. Normalising to the bare digits is what stops correct output being
       thrown away for its punctuation. */
    known.add(value.replace(/[.,\s]/g, ''));
    known.add(value.replace(',', '.'));
  };

  for (const fact of facts) {
    if (fact.value === null || fact.value === undefined) continue;
    learn(String(fact.value));
    /* A fact's value may be a sentence with figures in it rather than a bare
       number — `label: 'quiet hours', value: '14:00–16:00'`. Every number
       *inside* it is as grounded as the value itself. */
    for (const n of String(fact.value).match(NUMBER) ?? []) learn(n);
  }
  for (const n of draft.match(NUMBER) ?? []) learn(n);

  return (text.match(NUMBER) ?? []).every(
    (n) => known.has(n) || known.has(n.replace(/[.,\s]/g, '')) || known.has(n.replace(',', '.')),
  );
}

/** Digits, with an optional grouped or decimal tail. */
const NUMBER = /\d+(?:[.,\s]\d+)*/g;
