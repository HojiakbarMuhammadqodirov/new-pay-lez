/**
 * The language-model boundary.
 *
 * Both specs put the model behind a service that "composes a grounded answer
 * from retrieved facts", and are explicit that it "must not invent venues,
 * prices, or user data". This file is where that constraint is *structural*
 * rather than a hope: the only thing a model is ever handed is a list of facts
 * the database produced, and the only thing it may return is prose. It cannot
 * add a number, because it is never asked for one.
 *
 * With no model configured — the default — `compose` returns the deterministic
 * sentence `domain/assistant.ts` already built. That is not a degraded mode: the
 * facts, the results and the action are identical either way, and the only thing
 * a model changes is how the sentence reads.
 */
import type { Fact } from '../domain/assistant.ts';

export const mode = (): 'off' | 'live' => (process.env.PAYLEZ_LLM === 'live' ? 'live' : 'off');

export interface ComposeInput {
  /** The already-grounded sentence. The floor, and the fallback. */
  draft: string;
  /** Every number the answer may contain, and nothing else. */
  facts: Fact[];
  language: string;
  /** 'consumer' or 'partner' — the two have different registers. */
  side: 'consumer' | 'partner';
}

export async function compose(input: ComposeInput): Promise<string> {
  if (mode() === 'off') return input.draft;

  /* TODO(live): call the model with a system prompt that forbids introducing any
     figure not present in `facts`, then verify the response *after* generation:
     every number in the output must appear in `facts`, or the draft is returned
     instead. Checking afterwards is the part that matters — an instruction not
     to invent numbers is a request, and a post-check is a guarantee. */
  return input.draft;
}

/**
 * The verification a live implementation must run before returning model prose.
 *
 * Exported and testable on its own, because it is the safety property: if it
 * ever passes something it should not, the assistant is lying with the platform's
 * authority behind it.
 */
export function onlyKnownNumbers(text: string, facts: Fact[]): boolean {
  const known = new Set<string>();
  for (const fact of facts) {
    if (fact.value === null || fact.value === undefined) continue;
    known.add(String(fact.value));
  }
  const numbers = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return numbers.every((n) => known.has(n) || known.has(n.replace(',', '.')));
}
