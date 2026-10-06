---
paths:
  - "src/site/AssistantDock.tsx"
  - "src/site/api/assistant.ts"
  - "src/site/relocate.tsx"
---

# The assistant dock

Moved out of the root `CLAUDE.md`; loads when you work on the files above.

**And the site's own dock asks it now.** `AssistantDock` had a working thread, a
working composer and a canned reply that said "not connected to a model in this
build" — honest when it was written, and stale for a while before it was fixed:
its own header comment still claimed there was "no network layer anywhere in
`src/`". `api/assistant.ts` is that layer, and the three things it made the
panel responsible for are states rather than copy:

- **A real call takes time**, and the model leg has a three-second timeout, so a
  *thinking* turn goes into the thread where the answer will be — not a spinner
  somewhere else — and the send button is disabled while it is in flight.
- **The facts are the receipt.** Every figure in the sentence was checked against
  `answer.facts` before the server returned it, so drawing those facts under the
  answer is what makes "640 points" verifiable instead of trusted. Hiding them
  would ask for exactly the trust the server went to the trouble of not needing.
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
reply is `action`, because the server sent somewhere real to go.

The panel's *shape* changed with it, and that was a stale rule rather than a new
idea: `AssistantDock.tsx` has argued for a while that this is a card in the
corner you consult **while reading**, and `site.css` still pinned a 27rem drawer
from `top: 0` to `bottom: 0` under a scrim. It sits above the button it grew out
of now, is as tall as the conversation up to a ceiling, and spans the gutters on
a phone without going full height — the composer summons a keyboard, and a panel
sized to the viewport puts its own input underneath it. `.ai-scrim` is gone;
nothing had rendered one since the panel stopped being modal.

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

