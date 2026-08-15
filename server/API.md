# Paylez API — the flows

`openapi.json` describes every endpoint. This describes the six things a
generated client cannot tell you: the sequences, the conventions, and the places
where doing the obvious thing is wrong.

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
| `no_lives` | 409 | Games only. Lives reset at local midnight. |
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
  → { sessionId, content, livesLeft }

POST /v1/games/sessions/{id}/events
     { seq: 0, kind: "answer", payload: { index: 0, choice: 2 } }
  → { correct: true, answer: 2, accepted: true }

… one call per move …

POST /v1/games/sessions/{id}/finish
  → { score, correct, answered, won, streak, freezes, livesLeft, balance }
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

**Lives** are a shared daily pool across all games and reset at local midnight.
A life is spent on a **loss**, not on starting a round. `GET /v1/games/state` is
the truth; anything the client tracks is a display.

**The score is not sent by the client.** `/finish` computes it from the events
the server recorded. The only exception is the flight, which has no answer key —
it reports `cleared` and the server clamps it.

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

## 8. Entitlements

Ask what the account is entitled to, never what it paid. `GET /v1/me` returns an
`entitlements` map resolved from the active plan:

```json
{ "daily_lives": "3", "points_multiplier": "1", "exclusive_deals": "false" }
```

Values are strings; parse what you need. A missing subscription resolves to the
free plan, so there is no null case to handle. A lapse restricts capability and
**never** removes points or vouchers already earned.

Paid-tier analytics are **absent** from partner responses rather than nulled, so
render what is present instead of branching on a locked flag.

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

`GET /v1/me/export` and `DELETE /v1/me` are the GDPR routines. Erasure requires
the account email as confirmation.

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
