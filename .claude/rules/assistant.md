---
paths:
  - "src/site/AssistantDock.tsx"
  - "src/site/api/assistant.ts"
  - "src/site/api/partnerAssistant.ts"
  - "src/site/dashboardAssistant.tsx"
  - "src/site/relocate.tsx"
  - "server/domain/assistant.ts"
  - "server/domain/assistantTools.ts"
  - "server/domain/assistantPrompt.ts"
  - "server/ports/llm.ts"
---

# The assistant

Moved out of the root `CLAUDE.md`; loads when you work on the files above.

## What answers

**Claude answers the question; a keyword router answers when it cannot.** Both
`POST /v1/assistant/ask` and the partner `…/assistant/ask` go through
`domain/assistant.ts`, which tries the model first when `PAYLEZ_LLM=live` and
`ANTHROPIC_API_KEY` are both set, and falls back to the router — the
deterministic balance / streak / vouchers / catalogue-search sentences the
assistant was before — when the model is off **or fails in any way**. The
endpoint never errors because the model did. The boot log says which one this
server runs (`assistant: live via Claude (claude-sonnet-5-5, effort low)` or
`assistant: deterministic (…)`), each model failure is one log line (reason,
HTTP status and error type, latency — never the question, never the key), and
`assistant_messages.answered_by` records `model`, `fallback` or `rules` per
answer, so "is the model actually answering?" is a query.

- **The model can only see what a tool reads, and every tool is bound to the
  asker.** `assistantTools.ts`: the consumer toolbox is made for one user id
  (points and history, play status, wallet, missions, invites, place search,
  place details, the guide's articles); the partner one for one venue the asker
  manages, re-checking `team.requireManage` on every call (month, trend, offers,
  budget, consented top customers, plan). No tool takes a user id, and no
  partner tool takes a venue id — there is no argument to put somebody else in.
  Money reaches the model as `"25.00 PLN"`, never minor units, so it quotes
  rather than divides.
- **The prompt is frozen per side and cached** (`assistantPrompt.ts`): the rules
  plus a knowledge block **built from the running configuration** — `CONFIG`,
  the plan rows, the game rotation, the category tree — never typed in. The date
  and the reader's language go in a second, uncached system block.
- **Every figure is checked** (`groundedNumbers` in `ports/llm.ts`): a number in
  the answer must appear in a tool result, the knowledge block, the
  conversation or the question, under any reading of its separators. A miss is
  sent back once with the figures named; a second miss is the router's answer.
- **The response shape did not change.** `facts` are the candidate figures the
  sentence actually writes; `results` the venue/deal/directory rows a search read
  (or the voucher rungs in reach); `action` the heaviest destination a tool
  proposed. A **partner** model answer carries no `results` — the dashboard
  reads `results[0]` as a report and would replace the sentence with its own —
  so `readAnswer` calls an answer with no rows `prose` and draws it as written.
- **Memory is text.** The last six transcript messages go to the model as plain
  user/assistant turns — no tool results, no thinking blocks — so nothing stored
  is bound to the request that produced it.
- **It is tested against a fake endpoint.** `server/verify-assistant.ts` stands
  up a scripted `/v1/messages` on a free port (`PAYLEZ_LLM_BASE` is what points
  the port at it) and checks the loop, every failure path, the guard, the
  scoping and the shape. No test touches the real API.

## The dock

**And the site's own dock asks it now.** `AssistantDock` had a working thread, a
working composer and a canned reply that said "not connected to a model in this
build" — honest when it was written, and stale for a while before it was fixed:
its own header comment still claimed there was "no network layer anywhere in
`src/`". `api/assistant.ts` is that layer, and the three things it made the
panel responsible for are states rather than copy:

- **A real answer takes time** — a few seconds, up to the server's fifteen-second
  deadline — and **nothing on the client times it out**: a client timer shorter
  than the server's throws away an answer about to arrive. A *thinking* turn
  goes into the thread where the answer will be — not a spinner somewhere else —
  the send button is disabled while it is in flight, and after `SLOW_AFTER_MS`
  the dots say in words that it is still looking (`thinkingLong`).
- **The facts are the receipt.** Every figure in the sentence was checked on the
  server against what the lookups returned, and `answer.facts` are the figures
  it used, so drawing them under the answer is what makes "640 points"
  verifiable instead of trusted. Hiding them would ask for exactly the trust the
  server went to the trouble of not needing.
- **A refusal is not an error.** Over the daily allowance (five free, twenty on
  Pro) the server refuses rather than answering from a cheaper path, so
  "that is your questions for today", "the server is not there" and "something
  broke" are three different panels — the same union `useApi` draws — and only
  the last two offer a retry. A button whose only outcome is the message already
  on screen is a button that exists to fail.

Two smaller rules travel with it. `startConversation` is called on the **first
question**, not when the panel opens, so a panel somebody glanced at leaves no
row on the server — and failing to open one is deliberately not fatal, because
`/v1/assistant/ask` mints its own session and a bookkeeping call must not cost
somebody their answer. And the `results` rows are drawn as **text, not cards you
can press**: they carry venue ids and this site has no venue route to open one
in, which is the picture-of-a-control rule again. The one pressable thing in a
reply is `action` — read through `actionDestination`, because the server writes
hrefs in the phone app's vocabulary (`#/learn`, `#/wallet`, `#/venue/:id`) and
most are not routes here. Each maps to the page that does the job (Earn,
Wallet, Relocate), labelled with that page's own name in the reader's language;
one that maps to none is not drawn.

The panel's *shape* changed with it, and that was a stale rule rather than a new
idea: `AssistantDock.tsx` has argued for a while that this is a card in the
corner you consult **while reading**, and `site.css` still pinned a 27rem drawer
from `top: 0` to `bottom: 0` under a scrim. It sits above the button it grew out
of now, is as tall as the conversation up to a ceiling, and spans the gutters on
a phone without going full height — the composer summons a keyboard, and a panel
sized to the viewport puts its own input underneath it. `.ai-scrim` is gone;
nothing had rendered one since the panel stopped being modal.

**It yields to the invite panel.** `closeAssistant()` (`ASSISTANT_CLOSE_EVENT`
in `content.ts`) shuts the dock *without* handing focus back to its button: the
Play screen's invite sheet (`InvitePanel.tsx`) calls it on opening, because
focus is on its way into that sheet, and closes itself on
`ASSISTANT_OPEN_EVENT`. The two are never open together.

**And the destination has to be the thing, not a form in front of it.** The ask
box went to sign-in for a while, which was honest and sent somebody asking about
tram tickets to a password field. It **opens the dock** now — `openAssistant()`
in `content.ts` — which draws its own signed-out pitch, so a visitor sees what
they are being asked to join before being asked. The four suggested questions
under it were the worse half: `<span>`s wearing the styling of the dock's chips,
which *are* buttons and *do* ask what they say. Each now opens the panel **with
its question already asked**. Making them links would have answered the
complaint ("not clickable") and kept the part that was actually wrong — the
point of a suggested question is the question.

Three things about that hand-off are load-bearing, and two of them were bugs
first:

- **The payload carries a sequence number, not just the text.** Clearing the
  dock's state and guarding on non-null asked everything **twice**: StrictMode
  runs an effect, tears it down and runs it again against the same props, and
  the clear has not committed in between. A plain string cannot be the guard
  either — setting state to the string it already holds is a React bail-out, so
  the *same* chip pressed twice would do nothing. A counter says "once each"
  and "again" with one comparison.
- **The guard has to let a re-run through.** That same teardown aborts the
  request in flight, so an effect that refused its second run left the question
  spinning forever with nothing coming back.
- **An aborted question leaves nothing behind.** `send` used to `return` on an
  abort and leave the pair in the thread — a question with dots under it that
  nothing can ever settle. It removes them now. A thread is a record of the
  conversation, and an exchange that did not happen does not belong in it.

