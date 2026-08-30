# Paylez API — the flows

`openapi.json` describes every endpoint. This describes what a generated client
cannot tell you: the sequences, the conventions, and the places where doing the
obvious thing is wrong.

Base URL in development: `http://127.0.0.1:8787`. `GET /v1` returns the live
endpoint list; `GET /v1/health` is liveness.

---

## 1. Sessions

`POST /v1/auth/signin` returns `{ token, roles, mode, user }`. Send it as
`Authorization: Bearer <token>` on everything after that. The web surface also
gets an HttpOnly `paylez_session` cookie; both resolve to the same session, so a
mobile client can ignore the cookie entirely.

A session carries a **mode** — `consumer`, `partner` or `admin`. One account can
be both a customer and a venue owner, and the mode decides which experience is
served and which notifications surface. `POST /v1/me/mode` switches it.

### Play before signing up

```
POST /v1/auth/guest      { device: "<stable fingerprint>" }
   → { token, userId, provisional: true }

… play, earn points against that identity …

POST /v1/auth/signup     { email, password, name, provisionalId: "<userId>" }
   → the points survive the merge
```

The merge moves the ledger, not a balance, so what arrives in the new account is
provably the sum of what was earned. Do not try to carry a number across
yourself.

### The welcome gift is not paid at sign-up

`POST /v1/auth/signup` mints the account and nothing else. The gift is claimed by
`POST /v1/me/onboarded`, which takes no body and pays exactly once:

```
POST /v1/me/onboarded
   → { granted: true, onboardedAt, points: 100, balance }
   → { granted: false, onboardedAt, points: 0, balance }   ← every call after
```

An address and a password can be produced in bulk; finishing onboarding cannot be
done twice by one account, which is what makes it a reasonable thing to pay for.
It is safe to send twice — a retry, a second device or a lost response all get
`granted: false` and the original timestamp. `onboardedAt` on `GET /v1/me` is
`null` until it succeeds, which is how a client knows whether to offer onboarding
at all.

### The profile, and the city

`PATCH /v1/me` takes `name`, `username`, `language`, `city`, `countryCode`,
`avatar`, `phone`, `occupation`, `birthDate` and `leaderboardOptIn`. **Nothing on
it is verified** — there is no code sent to the number and no link clicked in the
address, and `GET /v1/me` carries no verification flag of any kind. Every field is
optional and none of them gates anything; filling in all seven answers (photo,
username, status, city, email, phone, birthday) pays the completion bonus once and
stamps `profileCompletedAt`.

There is no `headline`. The free-text line about yourself is **gone** — the column
was dropped, not emptied — and `occupation` took its place in both the request and
`GET /v1/me`.

Four of them have rules to draw the form around:

- **`username`** is unique platform-wide — 3 to 20 characters of `a-z 0-9 _`, no
  leading, trailing or doubled underscores, some names reserved. A clash is a
  `409` naming the field, not a 500.
- **`birthDate`** is accepted twice: the answer, and one correction. A third
  *different* day is a `409` naming support. Resending the day already stored
  costs nothing, so a client may safely PATCH its whole profile on every save.
  `birthDateChangesLeft` on `GET /v1/me` says how many writes are left — grey the
  field out on `0` rather than finding out by being refused.
- **`occupation`** is one of `student`, `worker`, `business`, `freelancer`,
  `other`. **The UI labels it "Status", and the wire field is not called that** —
  `status` is the account state (`provisional` / `active` / `banned` / `erased`),
  which is a different fact about a different thing, and the two would eventually
  be read for each other. Anything outside the five is a `400` whose `allowed`
  carries the whole set, so a client that has drifted is told what it may send.
  The set is served nowhere else: five values a client has to translate anyway do
  not need a round trip.
- **`city`** is canonicalised, not restricted — see below.

#### `GET /v1/cities` suggests; it no longer decides

That endpoint is unchanged in shape and changed in standing. It is public, because
the sign-up form has to render the choice before an account exists, and it returns
114 cities across Poland, Germany and Uzbekistan as a list rather than a search —
filter it locally and show everything when the box is empty, since whether Paylez
is anywhere near them is the thing a visitor actually wants to know.

What changed is that it is now a **suggestion source**. `PATCH /v1/me` and
`POST /v1/auth/signup` both take a city that is not on it, as long as a
`countryCode` comes with it. Somebody the product has not reached yet was being
told their own city does not exist, over a field that gates nothing.

**What you send is not necessarily what is stored**, and a form that assumes
otherwise will show the wrong thing until it reloads. Two rules, both in
`resolveCity`:

- **On the list:** the entry's own spelling and the entry's own country are
  stored, and any `countryCode` you sent is **ignored**. `Kraków`, `Cracow` and
  `krakow` all store `Krakow` / `PL`. That is what keeps one place on one weekly
  board — the board groups on `users.city` with a literal `=`, so free text does
  not produce a messy board, it produces several, each with one player on it — and
  it is what stops a client writing `Krakow, US`.
- **Off the list:** `countryCode` becomes required, and the name is stored as the
  title-cased fold. Diacritics, hyphens and apostrophes do not survive:
  `Saint-Étienne` is stored `Saint Etienne`. That is the cost of the same rule,
  and it is the cost the 114 already pay — their canonical names are ASCII for
  exactly this reason.

So: read `city` and `countryCode` back off the response and display those. Three
refusals on `PATCH /v1/me`, all `400 validation_failed`:

| What was sent | `field` |
| --- | --- |
| A city we do not know, with no `countryCode` | `countryCode` — show the country picker, do not argue about the city |
| A `countryCode` with no `city` | `city` — a country is half of one answer, not a field of its own |
| An `occupation` outside the five | `occupation`, with `allowed` |

`POST /v1/auth/signup` shares the first of those and neither of the other two: it
takes no `occupation` at all, and a `countryCode` sent without a `city` there has
no city to be a fact about and is dropped rather than refused.

The country code is checked for *shape* — two letters — and never against a
registry. The only one here is the quiz export's 196 sovereign states, which has
no Hong Kong, Greenland or Puerto Rico in it, so checking against it would refuse
real people to catch a typo in a field nothing joins on.

Nothing revalidates a row that is already stored. The old database's cities came
over as whatever it held, and a rule applied backwards would make those accounts
unsaveable; re-sending a legacy value now succeeds, because it takes the off-list
path and canonicalises to itself.

---

## 2. The gate — the only place value is granted

Every earning and redemption event uses the same four steps in the same order.
The event type only changes what step 5 grants.

```
  customer's phone                 server                    cashier's device
        │                            │                              │
        │  POST /v1/gate/scan        │                              │
        │  { token }                 │   verify signature,          │
        │───────────────────────────▶│   burn the nonce,            │
        │                            │   open PENDING               │
        │◀───────────────────────────│                              │
        │  { id, status: pending }   │                              │
        │                            │  GET /venues/{id}/pending    │
        │                            │◀─────────────────────────────│
        │                            │                              │
        │                            │  POST …/{id}/amount          │
        │                            │  { amountMinor: 14200 }      │
        │                            │◀─────────────────────────────│
        │                            │                              │
        │                            │  POST …/{id}/confirm         │
        │                            │◀─────────────────────────────│
        │                            │   ── COMMIT ──               │
        │                            │   points + stamp + discount  │
        │                            │   + deal claim + referral,   │
        │                            │   all or none                │
        │  GET …/{id} (poll)         │─────────────────────────────▶│
        │◀───────────────────────────│         Receipt              │
        │      Receipt               │                              │
```

**Nothing exists before the commit.** No provisional points, no half-stamped
card, no "pending" discount. Do not show a customer what they are about to earn
as though they have earned it.

### Who enters the amount

Read `amount_entered_by` off the pending transaction:

- `cashier` — the partner device calls `/amount`. Always the case when a
  discount is involved.
- `customer` — the customer's phone may call it, and the cashier still has to
  confirm. Nothing is granted until they do.

A typo is corrected by calling `/amount` again. Do **not** cancel and re-scan —
that makes the customer re-open the app in a queue.

### The three intents

| Intent | `intentRef` | What the commit does |
| --- | --- | --- |
| `earn` (default) | — | Points, a stamp, a visit |
| `voucher_redeem` | the voucher id | Applies the % discount, capped |
| `reward_redeem` | the earned reward id | Marks the free item redeemed |

### Failures worth handling by name

| Code | Status | What to show |
| --- | --- | --- |
| `replay_detected` | 422 | "That code has already been used — ask for a fresh one." |
| `expired` | 409 | The QR aged out (90 s), or the pending transaction did (15 min). Re-scan. |
| `invalid_trigger` | 422 | Not one of our codes. |
| `conflict` | 409 | This customer already has a gate open at this venue. The response carries `transactionId` — resume it. |
| `invalid_amount` | 400 | Zero, negative, or above the venue's ceiling. `reason` says which. |
| `no_energy` | 409 | Games only, and it was `no_lives`. The energy tank is empty. The detail carries `nextAt` — when the next energy lands — and `max`. It does **not** carry `resetsAt`, and energy does not come back at midnight. |
| `insufficient_points` | 409 | Carries `required` and `available`. |
| `budget_exhausted` | 409 | The venue's pool cannot fund this tier right now. Offer a lower one — the ladder tells you which are `available`. |
| `entitlement_required` | 403 | Carries `entitlement`, and `limit`/`used` where it is a capacity. |

---

## 3. Idempotency

Every endpoint that moves value accepts an `Idempotency-Key` header. Generate one
**per user attempt** — not per HTTP retry — and reuse it for every retry of that
attempt.

```
POST /v1/gate/scan
Idempotency-Key: 6f2a…            ← same key on every retry of this scan
```

Retrying with the same key returns the *stored response*, so a dropped
connection cannot grant twice. The same key with a different body is a `409`.

Endpoints that take one: `/gate/scan`, `/gate/tap`, `/gate/manual`,
`/gate/transactions/{id}/confirm`, `/vouchers`, `/gift-cards`,
`/games/sessions/{id}/finish`, `/partner/venues/{id}/budget/topup`.

---

## 4. Offline

The app is used in venues with bad signal. Queue the whole attempt locally and
send it when the connection returns, with `clientTs` set to when it really
happened:

```json
{ "token": "…", "clientTs": "2026-08-12T14:31:02.000Z" }
```

The server validates on arrival — a QR that has expired in the meantime is still
rejected — and nothing is granted until the gate completes. Keep the
`Idempotency-Key` with the queued item so a flush that half-succeeded does not
double-submit.

---

## 5. Games

The server holds the answers. The client shows the question, reports the move,
and is told whether that one move was right — never the key.

```
POST /v1/games/sessions            { gameType: "capitals" }
  → { sessionId, gameType, content, energyLeft }  ← energyLeft is a plain count

POST /v1/games/sessions/{id}/events
     { seq: 0, kind: "answer", payload: { index: 0, choice: 2 } }
  → { correct: true, answer: 2, accepted: true }

… one call per move …

POST /v1/games/sessions/{id}/finish
  → { score, capped, correct, answered, won, streak, freezes,
      energyLeft, balance, nearest }
```

`seq` is 0-based and must increase. Repeating a `seq` returns
`accepted: false` — it is treated as a retry, not a second answer, so a flaky
connection never costs the player a question.

`content` differs per game:

| `gameType` | `content` | Event `payload` |
| --- | --- | --- |
| `flags` | `questions[{index, prompt, options}]` — `prompt` is an **ISO country code**; build the flag emoji from it | `{index, choice}` |
| `capitals`, `brain`, `poland` | `questions[{index, prompt, options}]` | `{index, choice}` |
| `word_builder` | `words[{index, length, tier, letters, hint}]` | `{index, guess}`, or `kind:"hint"` with `{index, position}` |
| `memory_match` | `{cards, pairs}` — the layout stays on the server | `{a, b}` — two card positions |
| `flight` | `{target}` | none; send `{report:{cleared}}` to `/finish` |

### Energy is the whole of what bounds a day

Hearts became **energy**, and **every finished round costs one, win or lose**. It
was losses only, which bounded nobody: two of the seven games cannot be lost, and
a player who answers correctly never touched the pool. There is nothing else —
no daily points cap, no per-game decay curve — so the number on the screen means
one thing, *rounds left*, and it is the only thing a client has to explain.

An **abandoned** round still costs nothing. The charge is written when the round
is banked, so a connection that drops mid-round takes nothing with it.

It is a shared pool across all seven games, and `GET /v1/games/state` returns it
under `energy` as an **object**:

```json
{ "energy": 2, "max": 3, "nextAt": "2026-08-29T18:12:44.000Z" }
```

One comes back every `energy_regen_minutes` — 240 free, 180 on Pro, 120 on
Premium — up to `daily_energy`, which is 3, 5 and 7. `nextAt` is `null` when the
tank is full. Draw the wait from it; a countdown to midnight is simply wrong, and
a pool with no visible end is what makes an energy system feel broken.

Read the two keys together and they give the size of a day —
`daily_energy + 1440 / energy_regen_minutes` rounds from a full tank:

| Plan | Sustained, per day | From a full tank |
| --- | --- | --- |
| Free | 6 | 9 |
| Pro | 8 | 13 |
| Premium | 12 | 19 |

`POST /v1/games/sessions` refuses with `no_energy` on an empty tank — enforced at
the start, because finding out at the end means finding out after the round was
played. `energyLeft` on that response is therefore what the player holds
*before* paying for the round; the one on `/finish` is one lower.

**A hint is metered.** Word Builder hints are capped per day by
`word_hints_per_day` — 3 free, 6 on Pro, 10 on Premium — and past it the event is
refused with `entitlement_required` rather than quietly answered with something
that is not a hint. A hint keeps the word's base point and forfeits its tier
bonus, which is what makes taking one a decision.

**The score is not sent by the client.** `/finish` computes it from the events
the server recorded. The only exception is the flight, which has no answer key —
it reports `cleared` and the server clamps it.

### What a round pays

The raw round, before the one factor below:

| Game | Raw score |
| --- | --- |
| `brain`, `flags`, `capitals`, `poland` | 1 per correct answer, **+5** for all five. 5 questions, 2 mistakes survivable |
| `word_builder` | 1 per word solved, **+** the word's own tier bonus (0/1/2, forfeited by a hint), **+3** for solving all five first-try and hint-free |
| `memory_match` | **Elapsed time alone**: under 40 s → 12, under 70 s → 8, under 110 s → 4, otherwise → 2. Timed from the server's own event stamps. No fail state; a finished deck always pays |
| `flight` | 1 per gap cleared, **capped at 20 points**. 5 gaps decides `won`, not what it pays |

Then `score = floor(raw × points_multiplier)`, and that is the whole of it.

**A round pays the same whether it is your first of the day or your ninth.**
There is no daily points cap and no per-game decay curve — a curve lived here
that paid a repeat of the same game 100/60/40/20/0 percent on free, and it is
gone along with the `decay` field on the finish response and the `round_decay`
entitlement. Energy is the brake now, and it is the only one: two overlapping
limiters where only one binds is one more than a player can be told about.

`capped` is still on the response and is **always 0** — it always was. It is kept
so an existing client does not break on a missing key, and there is nothing
behind it to read instead: nothing trims a round.

`points_multiplier` (1 / 1.25 / 1.75) applies to **game rounds only**. What a
visit pays is four named entitlements of its own — see §8.

The flag emoji, from a code:

```dart
String flagOf(String code) => code
    .toUpperCase()
    .codeUnits
    .map((c) => String.fromCharCode(0x1F1E6 + c - 65))
    .join();
```

---

## 6. Deals, and what counts as a claim

`GET /v1/deals` returns only deals this reader can claim **right now** — day,
hour, language and audience already evaluated in the venue's timezone. Do not
filter again on the client; you will not have the venue's clock.

The funnel is Seen → Opened → Claimed:

```
POST /v1/deals/{id}/events   { kind: "impression" }   ← the card scrolled into view
POST /v1/deals/{id}/events   { kind: "open" }         ← they tapped it
```

A **claim** is not postable. It is written by the gate when somebody who opened
the deal completes a confirmed scan — pass `dealId` on `/gate/scan`. That is
deliberate: the claim rate is the number the partner dashboard argues from, and a
client-postable claim is a client-inflatable one.

---

## 7. Money, time and language

**Money is an integer in minor units.** `amountMinor: 14200` is 142,00 zł.
Never send a decimal; `14200.5` is rejected rather than rounded. Format for
display with the currency on the venue or the response.

**Time is UTC ISO-8601** on the wire. Anything with a business meaning — budget
periods, deal windows, quiet hours, "one visit per day" — is evaluated in the
*venue's* timezone by the server. Do not compute a window locally.

**Language** comes from the account's own setting, falling back to
`Accept-Language`. Set it with `PATCH /v1/me { language }`. Responses that carry
copy say which language they actually used — a deal has no translation in every
language, and `copy.language` may differ from the one you asked for.

---

## 8. Entitlements, and what a visit pays

Ask what the account is entitled to, never what it paid. `GET /v1/me` returns an
`entitlements` map resolved from the active plan:

```json
{ "daily_energy": "3", "energy_regen_minutes": "240", "scan_points": "20",
  "points_multiplier": "1", "exclusive_deals": "false" }
```

Values are strings; parse what you need. A missing subscription resolves to the
free plan, so there is no null case to handle. A lapse restricts capability and
**never** removes points or vouchers already earned.

The consumer plans are **Free, Pro and Premium**. Plus is retired, and **no plan
is sold with a free trial** — `trial_days` is 0 on every one of them.

| Key | Free | Pro | Premium |
| --- | --- | --- | --- |
| `daily_energy` | 3 | 5 | 7 |
| `energy_regen_minutes` | 240 | 180 | 120 |
| `points_multiplier` *(game rounds only)* | 1 | 1.25 | 1.75 |
| `scan_points` | 20 | 30 | 50 |
| `first_visit_points` | 100 | 150 | 250 |
| `stamp_points` | 100 | 150 | 250 |
| `new_category_points` | 25 | 50 | 100 |
| `voucher_validity_days` | 14 | 30 | 60 |
| `word_hints_per_day` | 3 | 6 | 10 |
| `assistant_uses_per_day` | 5 | 20 | *uncapped* |
| `streak_freezes` | 2 | 5 | *uncapped* |
| `deal_early_access_hours` | 0 | 0 | 24 |
| `profile_badge` | *(none)* | `star` | `crown` |
| `exclusive_deals`, `gift_card_priority` | false | true | true |
| `monthly_stipend`, `priority_support` | 0 / false | 0 / false | 200 / true |

**What a visit pays is four named keys, not a multiplier.** `scan_points`,
`first_visit_points`, `stamp_points` and `new_category_points` each carry their own
per-tier figure, and `points_multiplier` is deliberately *not* applied to them —
doing both would pay a subscriber twice for one scan. A venue's own
`pointsPerScan`, when it is positive, overrides `scan_points` outright: that is
the venue's money and its decision.

**There is no spend bonus.** Paying more over the venue minimum used to earn more
in steps and does not any more. The minimum still decides whether a scan counts as
a *visit* at all, which is upstream of any of this.

**There is no `points_expiry_months`, and points never expire** — on any plan.
`GET /v1/wallet` therefore has no `expiringSoon`, and it was removed rather than
returned empty: an always-`[]` array is a promise about a rule the product
dropped. A spend still consumes the oldest lot first, because a redemption has to
come out of something.

**Four keys are gone from that map, not renamed in place.** `daily_lives` and
`life_regen_minutes` became `daily_energy` and `energy_regen_minutes`;
`round_decay` and `points_expiry_months` describe mechanisms that no longer
exist. The server deletes retired keys from `plan_entitlements` on every boot, so
a client still reading one gets a missing key rather than a stale number left
behind by the build before the rename.

Partner entitlements are `live_deals`, `active_campaigns`, `push_quota`, `venues`,
`team_seats`, `vouchers`, `deep_analytics`, `benchmarks`, `assistant`,
`identified_profiles` and `export_csv`. Paid-tier analytics are **absent** from
partner responses rather than nulled, so render what is present instead of
branching on a locked flag.

A capacity refusal is a `403 entitlement_required` carrying `entitlement`, `limit`
and `used` — enough to write "that is your five for today" instead of "something
went wrong". Three of them reach a consumer client: `assistant_uses_per_day` on
`POST /v1/assistant/ask`, `word_hints_per_day` on a Word Builder hint event, and
`gift_card_priority` on priority-only stock.

---

## 9. Analytics figures carry their own kind

Partner responses wrap figures as:

```json
{ "value": 41, "kind": "counted", "suppressed": false, "cohort": 22 }
```

- `counted` — it happened and was observed. Render as fact.
- `estimated` — derived. Label it as an estimate.
- `attributed` — a conservative subset Paylez claims credit for.
- `suppressed: true` — the cohort was too small to report without identifying
  somebody. `value` is `null`. **Render "not enough data", never 0.**

---

## 10. Privacy the client has to respect

`POST /v1/me/sharing/{venueId}` is a *separate, revocable* consent from the
account terms: it lets one venue see this customer individually. It must be
asked for on its own, per venue, and `DELETE` must be as easy to reach as the
grant. Never bundle it into sign-up.

`GET /v1/me/export` and `DELETE /v1/me` are the GDPR routines — Article 15 and
Article 17, which are one question asked from two sides. Erasure requires the
account email as confirmation, and anonymises rather than deleting so the ledger
stays verifiable.

**Both are generated from one table**, `USER_COLUMNS` in `domain/consent.ts`, so
they cannot disagree about what is personal. They were two hand-written pieces of
SQL and had already drifted: the erasure cleared `username`, `phone`,
`birth_date`, `display_avatar` and `occupation`, and the export mentioned none of
them. That is the worse direction — an erasure that misses a column at least
leaves somebody something to complain about, while an export that under-reports is
read as complete, because nothing in the document says a column exists.

Two things follow that a client showing the document should say out loud:

- The `account` block now carries **25 of the 28 columns of `users`**, up from 12.
  Three are withheld with a stated reason: `password_hash`, because a scrypt hash
  in a file sitting in a downloads folder is an offline cracking target for an
  account that still works (Art. 15(4)); and `email_norm` / `username_norm`,
  because they are normalised duplicates of columns the export does carry.
- **`provider_ref` — the Google `sub` — was surviving erasure and is now
  cleared.** It is a permanent cross-service identifier of a natural person, and
  it went unnoticed for exactly the reason it was dangerous: nothing reads it on an
  erased account, so it was invisible rather than harmless. It is disclosed as well
  as cleared, on the same argument — the column it would be worst to leave out of
  an access request is the one whose absence is hardest to notice.

What survives an erasure is accounting: the two once-only grant guards, the trust
tier, the balance cache, the timestamps. All of it is in the export, which is the
third invariant — a column that is neither disclosed nor cleared is data held
about a person that neither right reaches.

## 11. Traffic — counting visitors without tracking them

`POST /v1/traffic` is the only endpoint a client calls that is not about a
person. It takes a batch of page views and named actions and returns nothing
useful:

```json
{ "events": [{ "kind": "view", "path": "/#/learn" },
             { "kind": "action", "path": "/#/learn", "name": "play_flags" }],
  "referrer": "https://www.google.com/" }
```

Three things about it are load-bearing, and a client that "improves" any of them
breaks the privacy property the endpoint exists to have:

- **Do not send an identifier, and do not store one.** There is no session id in
  the request and none in the response. The server derives the visit from the
  connection. A client that generates a visitor id and puts it in
  `localStorage` has quietly built the tracking cookie this design avoids — and
  has earned the consent banner that goes with it.
- **Send the referrer, not the URL you are on.** Only the referrer's *host* is
  kept. Never put a query string in `path`; the server strips everything after a
  `?`, but the fix belongs on both sides — a query string is where somebody's
  email address ends up in an analytics tool.
- **Send it with the session token when there is one.** The route is public, but
  a token turns an anonymous visit into an attributed one, which is what makes
  "returning users" answerable for accounts.

It is fire-and-forget: batch it, send it on `visibilitychange`, and never block
a render or a navigation on the response. A failed beacon is a lost row and
nothing else.

The console reads it back through `GET /v1/admin/traffic?from=&to=`, alongside
`GET /v1/admin/activity` (one chronological feed across the platform) and
`GET /v1/admin/users`. One field in that response needs saying out loud:

- `dailyVisitors` is distinct visitors **summed per day**, not distinct visitors
  over the range. The second is not answerable, by design.
- `anonymousReturningVisitors` is always `null`, and it is in the response
  precisely so that nobody computes it wrongly from the figures beside it.
  **Render it as "not knowable", never as 0** — the same rule §9's `suppressed`
  states for partner analytics, for the same reason.
