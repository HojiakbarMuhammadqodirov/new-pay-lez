---
paths:
  - "src/site/admin*"
  - "src/site/api/admin.ts"
  - "src/site/api/traffic.ts"
  - "server/http/routes/admin.ts"
---

# The operator console (`#/admin`)

Moved out of the root `CLAUDE.md`; loads when you work on the files above.

- **The console edits now, and the rule it replaced is the one to keep in
  mind.** What stood here was "the console reports; it does not edit", with the
  argument that a control writing to somebody else's account has to answer what
  happens when two tabs disagree. That was right while the answer was
  `localStorage`. It is a server's question and the server answers it, so
  `#/admin` can now suspend and remove a venue, pause and remove an offer, take a
  gift card off the shelf, suspend an account, set somebody's password and close
  an account, and **correct what any of them says** — under `C7` in
  `server/http/routes/admin.ts`.

  **The line that survives is the one that mattered: an operator may describe
  things, remove them and restore access to them, and may not edit a number
  anybody reports from.** Nothing reachable from this screen touches a balance, a
  visit count or a funnel figure — the three `PATCH`es take a name, a city, a
  category, an offer's words and closing date, and nothing that was counted.
  A removal is visible by its absence and every write here puts an audit row with
  an actor on it; an edited figure is neither. Two tabs pressing "suspend" agree.

  The three edits call the domain function the **owner's own form** calls
  (`partners.updateVenue`, `partners.updateDeal`, `accounts.updateProfile`), so
  an operator gets the owner's validation and the same city canonicaliser rather
  than a second implementation that drifts.

  **And removal means the row is gone.** A venue and an offer were archived and
  stamped; they are `DELETE`d now, which the schema makes safe rather than
  hopeful — everything that *belongs* to one cascades, and the four tables that
  merely *mention* one (`points_ledger`, `transactions`, `audit_log`,
  `guidance_services`) are `ON DELETE SET NULL`, so the accounting still adds up.
  `translations` is swept by hand, because it is keyed by `(entity, entity_id)`
  and no cascade reaches it. **A person is the exception and the exception is the
  database's**: `points_ledger.user_id` and `transactions.user_id` cascade, so
  dropping a customer who spent would delete a *venue's* record of what they
  spent. Closing an account erases it (Article 17, the same routine
  `DELETE /v1/me` runs) and drops the row only when nothing is owed to it — the
  answer says which, like the gift-card route.

  Three rules travel with it, all in `adminControls.tsx`:

  - **Destroying something is behind a switch, and then behind a dialogue.**
    `EditToggle` sits between the search field and the tabs — search narrows what
    is listed, the tabs choose what kind of thing is listed, and it decides
    whether the list can be changed — and it puts a pencil and a bin at the head
    of every row. It is off on every load and not remembered: a console that
    opened with the bins armed makes the first press of the afternoon a
    destructive control nobody reached for. The bin then opens `ConfirmDialog`,
    which **names the thing** and takes one deliberate press. That replaced a
    gradient of two presses for an offer and the venue's name typed back for a
    venue: a panel inside a list can be scrolled off-screen, and a confirmation
    somebody types twenty times an afternoon is one they type without reading.
    The server still requires the name in the body and `foldConfirm` still folds
    it — that is the client proving it knows which row it is about to destroy.
  - **A refusal is printed in the server's own words.** The strip says the
    dictionary's lead and then the API's message verbatim, which is the one
    place on this site that renders untranslated server text. These refusals
    name *which gate closed* — an unverified venue, a plan with no room for
    another live deal, a deal with no copy — and a dictionary sentence general
    enough to cover them all would name none.
  - **A control with nothing honest behind it is not drawn.** An operator's own
    row gets a word instead of three buttons, because the server refuses every
    one of them; a venue that has never been live gets no "restore", because the
    press that puts one in front of customers is the verification decision on
    the People tab; a gift card gets the bin without the pencil, because its face
    value and points cost are what somebody bought against and no endpoint edits
    one. That is the partner dashboard's honesty rule, one screen over.

  The console's write half is `api/admin.ts` (the calls), `adminWrite.ts` (the
  hook) and `adminControls.tsx` (the kit). Nothing in the kit carries
  `data-reveal`: a panel that opens on a press arrives after the reveal scan.

- **All seven console tabs ask the server, and there is no second sign-in.**
  Services, Offers, People, Website, Messages, **Tiers** and Gift cards
  (`ADMIN_TABS` in `content.ts`) are seven reads of `/v1/admin/*` through `api/`.

  **Tiers is the one tab that grants a plan.** The console
  could already edit what a plan *includes* and could not put anybody **on**
  one, so a tier arranged over a phone call was done in Stripe or in the
  database — with no audit row saying who granted it and why, and no way to
  date it. `adminTiers.tsx` is that, and three of its decisions are the ones to
  keep: it shows **live and scheduled separately** and never merges them,
  because one is what the gate answers with now and the other is what it will
  answer with later; it has **no "remove"**, because free is a plan and
  assigning it keeps one code path and one audit row; and it says in words what
  "immediate" covers — the server answers with the new plan at once, and a
  browser the subject already has open catches up on its next load or when its
  tab regains focus (`AuthProvider` re-asks on `visibilitychange`, which is not
  a poll). It claims no namespace of its own: every panel on it is the console's
  own `.adm-edit-*` form kit and `.adm-table`, and `.adm-tier*` was already
  taken by the voucher ladder on the analytics screen — which is grep-before-
  naming turning something up for the fifth time. There is no operator
  password panel: reaching `#/admin` at all means
  `resolveRoute` saw `roles` containing `admin` on the *server's* session, so a
  token is already in hand, and asking again was one person signing in twice
  with two accounts on one screen. What can still happen is that token expiring
  under a session this browser remembers, which is a stale sign-in rather than a
  password prompt, and the screen says so and points at the front door.

  **A failed request is a state, not a zero.** `useApi` returns
  `loading | ready | error` as a union precisely so "not connected" and
  "connected, and the answer is none" cannot render the same way — and after the
  purge the second is the *ordinary* state, because there genuinely are no
  venues and no offers until a business signs up and somebody verifies it. Every
  list has both panels and every count that has not arrived is an em dash rather
  than a 0.
- **The traffic beacon must not acquire a memory.** `api/traffic.ts` sends page
  views and named actions to `POST /v1/traffic` and holds *nothing* — no cookie,
  no `localStorage` key, no visitor id. The server identifies a visitor by a hash
  of the connection that rotates daily, which is what keeps the whole thing
  outside consent-banner territory; a client that generates an id to "improve"
  the numbers has quietly built a tracking cookie and earned the banner. The cost
  is that returning *anonymous* visitors is unmeasurable — the API returns
  `anonymousReturningVisitors: null` and the console prints a sentence. **Never
  render that as 0**; it is the same lie `suppressed` exists to prevent one screen
  over.
- **The console's analytics view says "not measured", and that is the honest
  answer rather than a stub.** `adminMetrics.ts` used to derive a venue's whole
  month from one seed: `ADMIN_SERVICES` gave each listing a `scale` and
  `serviceMetrics(scale)` multiplied a table of invented base figures by it —
  map opens, website clicks, calls, Instagram taps, scans, vouchers, a
  thirty-day trend, a sales curve, a city and language split, a country
  comparison. It was internally consistent, which was the whole argument for
  deriving rather than transcribing, and none of it had been measured.

  One endpoint answers anything venue-specific to an *operator*:
  `GET /v1/admin/venues` returns a visit count and a customer count, two `COUNT`s
  and nothing more. Everything else that screen showed is either partner-scoped
  (`/v1/partner/venues/:id/analytics`, which an admin token cannot call —
  `requireStaff` gates it on ownership) or is not collected at all. So
  `serviceMetrics()` returns the **unmeasured month** and `serviceMetricsFrom()`
  fills in the two figures that exist. `measured` is the field every panel
  branches on and it is `false` **by construction rather than by a value
  happening to be zero**, because "nobody has counted this" and "the count is
  zero" are different findings and this console exists to tell an operator
  things they cannot see anywhere else.

  The pull to fix this by inventing a plausible number is the thing to resist.
  If the figure is wanted, the work is a collection path on the server, not a
  multiplier here.
