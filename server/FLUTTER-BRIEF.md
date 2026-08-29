# Brief for the Paylez Flutter app

Copy this whole file to whoever builds the mobile app.

---

## The standing instruction

Bring the Flutter app up to the backend that now exists, and to the feature set
the website already ships.

**If something is already built and works, leave it alone.** This is a list of
where the app should end up, not a list of things to rewrite. Where the app
already does a thing correctly, the only change needed is the one described
under "Stop calculating, start asking" below. Judge each screen on whether it
behaves as described here — if it does, move on.

Work through it in order; each section says what "done" means.

---

## What changed, and why it changes your job

There is now a real backend. It implements both statements of work end to end:
identity, the points ledger, the amount-capture gate, vouchers, stamp cards, hot
deals, the games engine, referrals, leaderboards, notifications, the assistant,
analytics, subscriptions and platform operations. It is seeded from the old
Base44 database, so the venues, the guidebook, the deals and the exchange rates
you already know are all there.

Read these three, in this order:

1. **`server/API.md`** — the flows: the gate's four steps, idempotency, offline,
   the games protocol, what counts as a claim. Start here.
2. **`server/openapi.json`** — every endpoint. Point a generator at it:
   ```bash
   dart run build_runner …    # or
   openapi-generator generate -i openapi.json -g dart-dio -o lib/api
   ```
   Do not hand-write the client. It is 130 operations and it will drift.
3. **The two PDFs in `new-data/`** — *context, not a work order.* They describe
   what the **server** must do and why. Reading them will make you build better
   screens; implementing from them will give you a second, disagreeing copy of
   the points rules.

Run the backend locally:

```bash
npm install
npm run server        # http://127.0.0.1:8787 — migrates, seeds and imports on first run
npm run verify:api    # 440 checks, if you want to see what it guarantees
```

> **A large economy change has landed since the last copy of this brief.** Points
> no longer expire, there is no daily points cap and no spend bonus, hearts
> refill on a clock instead of at midnight, and the plans are Free / Pro /
> Premium with no trial. Several response bodies changed shape with it — the
> exact list is the **last section of this file**, and it is the one your
> `test/live_test.dart` and `test/protocol_test.dart` will fail on first. Read
> that before you read anything else here.

---

## Stop calculating, start asking

This is the single most important change, and it applies to code that already
works today.

**The server decides. The client displays and requests.** Anywhere the app
currently computes any of the following, delete that code and read the value
from the API instead:

- points earned from a round, a scan or a referral
- the streak, whether it continued, whether a freeze was spent
- hearts remaining, and when the next one lands
- how much a repeat round of the same game is worth today
- a discount amount, or whether a voucher can be issued
- whether a stamp card is complete
- whether a deal is claimable right now
- the points balance

Every one of these is now returned by an endpoint. Two implementations of a
reward rule means one of them is wrong, and nobody finds out which until a
customer is standing at a counter.

Three conventions that go with it:

- **Money is an integer in minor units.** `14200` is 142,00 zł. Never send a
  decimal — the server rejects `14200.5` rather than rounding it.
- **Send an `Idempotency-Key`** on anything that moves value, generated once per
  user attempt and reused for every retry of that attempt.
- **Never hold an answer on the device.** The games server sends questions
  without answers and judges one move at a time.

---

## 1. The gate — scanning, and the counter

The heart of the product and the part that must be exactly right. Full sequence
in `API.md` §2.

**Customer side**

- QR scanning via camera → `POST /v1/gate/scan`
- NFC tap: read the tag's URL, pull `picc_data` and `cmac` from it →
  `POST /v1/gate/tap`
- A pending screen that polls `GET /v1/gate/transactions/{id}` and shows the
  receipt when the cashier confirms
- Where the venue is configured `customer`-enters, an amount field that posts to
  `/amount` — and makes clear that the cashier still has to confirm

**Partner side (business mode)**

- A QR display that re-mints from `POST /v1/venues/{id}/qr` before `expiresAt`
- The confirmation queue: `GET /v1/venues/{id}/pending`
- Amount entry and confirm

**Done when:** a customer scans, a cashier types 142,00 zł and confirms, and both
devices show the same receipt — points, stamp and next-tier line. Every error in
the table in `API.md` §2 has a message a person at a till can act on.

---

## 2. The games — all seven

The website ships **seven**; the app currently has four. Build the three that are
missing and move the four that exist onto the server protocol (`API.md` §5).

**A round is a round.** Roughly a minute of attention is worth roughly the same in
every game, so a player picks the one they enjoy rather than the one that pays.
The per-game figures below are the **raw** score, before the two factors under the
table; do not print any of them as the reward.

| # | Game | `gameType` | What it is | Raw score |
| --- | --- | --- | --- | --- |
| 1 | Brain Games | `brain` | 5 questions, 12 s each, 2 mistakes survivable | 1 per correct, **+5** for all five |
| 2 | Guess the Flag | `flags` | 5 questions, 6 s each. `prompt` is an **ISO country code** — build the flag emoji from it (snippet in `API.md` §5) | 1 per correct, **+5** for all five |
| 3 | Country & Capital | `capitals` | 5 questions, 6 s each | 1 per correct, **+5** for all five |
| 4 | Poland Quiz | `poland` | 5 questions, 8 s each | 1 per correct, **+5** for all five |
| 5 | Squawk's Flight | `flight` | The arcade round. Endless side-scroller, fly through gaps, one crash ends it. 5 gaps decides whether the round was *won* | 1 per gap, **capped at 20 points** |
| 6 | Memory Match | `memory_match` | 6 pairs. **No fail state** — deliberately the accessible one — but it is now **timed** | Elapsed time alone: <40 s → 12, <70 s → 8, <110 s → 4, otherwise 2 |
| 7 | Word Builder | `word_builder` | 5 words from scrambled letters | 1 per word, **+** the word's own tier bonus (0/1/2), **+3** for all five first-try and hint-free |

Then the server applies two factors, in this order, flooring at each step:

```
score = floor(raw × decay) × points_multiplier      ← floored again
```

- **`decay`** is the per-game repeat curve, and it comes back on the finish
  response. Free `1, .6, .4, .2, 0`; Pro `1, .8, .6, .4, .2`; Premium always `1`.
  It counts rounds of *that same game* finished today, so five different games is
  five first rounds. **Nothing is ever refused for playing too much** — at 0 the
  round still counts for the streak, the leaderboard and accuracy, and only the
  points stop. Show the factor when it is below 1: two points for five right
  answers reads as a bug otherwise.
- **`points_multiplier`** (1 / 1.25 / 1.75) is a **game-round rule only**. It is
  not applied to a scan, a first visit, a stamp card or a new category — those
  have four named entitlements of their own.

Notes that decide whether these feel right:

- The banks are on the server: 196 flag questions and 196 capitals, in English,
  Polish, Russian and Uzbek. You do not ship question data.
- Memory Match never sends the layout — you get `{cards, pairs}` and report pairs
  of positions. Do not hold the deck. It is scored from the server's own event
  stamps, so there is no duration to report: just play the moves.
- The flight is the one game with no answer key. Report `{cleared}` to `/finish`;
  the server caps the **points**, not the gaps.
- **Hearts do not reset at midnight.** They are shared across all seven games and
  refill one every `life_regen_minutes` — 240 free, 180 Pro, 120 Premium — up to
  `daily_lives` (3 / 5 / 7). A **lost** round costs one; a won round costs
  nothing; starting one costs nothing. `GET /v1/games/state` returns
  `lives: { lives, max, nextAt }`, and `nextAt` is what an empty pool should draw.
  A countdown to midnight is now wrong.
- Word Builder hints are capped per day by `word_hints_per_day` (3 / 6 / 10).
  Past it the hint event is refused with `entitlement_required`, carrying `limit`
  and `used`. A hint keeps the word's base point and forfeits its tier bonus.
- A round's result comes back with `streak`, `freezes`, `decay` and `balance` —
  show those from the response, do not recompute them.

**Done when:** all seven play, score identically to the server, and the app holds
no answer, no deck and no scoring table.

---

## 3. Wallet

Points, vouchers, stamp cards, rewards, gift cards, and the ledger history —
`GET /v1/wallet` and `GET /v1/wallet/history`.

- Converting points to a voucher: `POST /v1/vouchers` with a `tierId` from the
  venue's ladder. Tiers carry `available` — when a venue's budget is low the top
  tier closes first and the lowest stays open, so **offer the lower tier rather
  than showing an error**.
- Gift cards: `POST /v1/gift-cards`.
- **Points never expire, on any plan.** `expiringSoon` is gone from
  `GET /v1/wallet` — deleted, not emptied — and so is the `points_expiry_months`
  entitlement. Delete the countdown, the warning banner and anything that sorted
  by an expiry date. A spend still consumes the oldest points first, but that is
  the server's business and nothing on screen depends on it.
- A voucher still has its own `expires_at`, from `voucher_validity_days` (14 free,
  30 Pro, 60 Premium). That one is real and worth surfacing; a points expiry is
  not.

**Done when:** a voucher can be earned, held, shown at a counter and redeemed
through the gate, and the balance is never computed on device.

---

## 4. Venues, deals and the map

- `GET /v1/venues`, `GET /v1/venues/{id}` — the detail carries links, hours, the
  tier ladder, live deals, and this customer's stamp cards and rewards.
- Venue links (Instagram, website) are an **extensible list** — render whatever
  kinds come back, do not hard-code two fields.
- `GET /v1/deals` returns only what this reader can claim now. Do not filter
  again locally; you do not have the venue's clock.
- Post `impression` when a card is seen and `open` when it is tapped. A **claim**
  is not postable — pass `dealId` on the scan, and the gate records it
  (`API.md` §6).

---

## 5. The guidebook, news and the converter

Already in the old app, now served from the backend: 308 service listings, 42
articles, the news feed, the community directory, and 19 currencies.

- `GET /v1/guide/categories`, `/guide/services`, `/guide/articles`,
  `/guide/articles/{id}`, `/news`, `/community`
- `GET /v1/fx?from=EUR&to=PLN&amount=10` — one anchor currency, every cross rate
  exact
- Article list returns headings only; fetch a body when it is opened. Some are
  hundreds of kilobytes.
- A guidebook listing that is also a Paylez venue carries `venueId` — link
  through to the venue screen, which is where tiers, stamps and deals live.

---

## 6. Social, notifications, assistant

- **Referrals** `GET /v1/referrals` — the code and the progress. The reward pays
  on the invited person's **first confirmed scan**, not on signup; say so, or
  the counter looks broken.
- **Leaderboards** `GET /v1/leaderboard/city` and `/friends`. City listing is
  opt-in: a player who has not opted in still sees their own rank with
  `hidden: true`. Show the toggle where they see the board.
- **Notifications** — inbox `GET /v1/notifications`, register the device with
  `POST /v1/push-tokens`. The inbox is filtered by session mode, so a partner in
  personal mode does not see business alerts.
- **Assistant** `POST /v1/assistant/ask` — returns structured `results` plus a
  sentence. Render the cards, not the sentence alone. When `empty` is true it
  genuinely has nothing; show that rather than filling the space. It is now
  **metered per day** by `assistant_uses_per_day` — 5 free, 20 on Pro, uncapped on
  Premium — and the ask past the limit is refused with a 403
  `entitlement_required` carrying `limit` and `used`, so write "that is your five
  for today" rather than a generic error. Send the `sessionId` you were given;
  one belonging to another account is a 404.

---

## 7. Partner companion mode

One account can be a customer and a venue owner. `POST /v1/me/mode` switches;
the app should offer it wherever the account has the `partner_owner` role.

Read-mostly, plus three urgent write actions and nothing else:

- Today: `GET /v1/partner/venues/{id}/today`
- Findings and budget: `/overview`, `/budget`, `/analytics`
- **Pause or resume** a deal — `POST /v1/partner/deals/{id}/status`
- **Top up** a budget — `POST /v1/partner/venues/{id}/budget/topup`
- **Extend** a deal — `POST /v1/partner/deals/{id}/extend`

Everything else is desktop-only: show it read-only and link out.

Two rendering rules that matter (`API.md` §9):

- A figure carries its `kind` — `counted`, `estimated`, `attributed`. Label them
  differently; an estimated sale and a counted visit are different claims.
- `suppressed: true` means the group was too small to report on without
  identifying someone. `value` is `null`. **Render "not enough data yet", never
  0.** A partner who reads 0% will believe it.

---

## 8. Accounts, privacy, subscriptions

- Sign up / sign in / sign out. Onboarding may use `POST /v1/auth/guest` so
  somebody can play before signing up; pass `provisionalId` at sign-up and the
  points come with them.
- **The welcome gift is not paid at sign-up.** Call `POST /v1/me/onboarded` when
  onboarding finishes: no body, pays once, and returns
  `{ granted, onboardedAt, points, balance }`. It is idempotent, so a retry or a
  second device gets `granted: false` and the same stamp rather than an error —
  which means a client that guesses wrong costs nothing. `onboardedAt` on
  `GET /v1/me` is null until it lands, and that is how you know whether to offer
  onboarding at all.
- **The city picker reads `GET /v1/cities`** — public, so the sign-up form can
  render it before an account exists. 114 cities across Poland, Germany and
  Uzbekistan, as a closed list rather than a search: filter locally and show the
  whole set when the box is empty. Send the canonical `name` back; `countryCode`
  is derived on the server and never sent by the client. Anything not on the list
  is refused rather than stored.
- **The profile has more fields and none of them is verified.** `PATCH /v1/me`
  takes `name`, `username`, `language`, `city`, `avatar`, `phone`, `headline`,
  `birthDate` and `leaderboardOptIn`. There is no `phoneVerified` and no
  verification flow of any kind — delete any "verify your number" screen. Two
  rules shape the form:
  - `username` is unique platform-wide, 3–20 of `a-z 0-9 _`, single underscores
    between runs, some names reserved. A clash is a 409 naming the field.
  - `birthDate` is settable once and correctable once; a third *different* day is
    a 409 naming support. Resending the day already stored spends nothing, so it
    is safe to PATCH the whole profile on every save. `birthDateChangesLeft` on
    `GET /v1/me` says how many writes remain — grey the field out at 0 instead of
    letting somebody find out by being refused.

  Filling all seven answers (photo, username, headline, city, email, phone,
  birthday) pays the completion bonus once and stamps `profileCompletedAt`.
- **Data sharing is a separate consent, per venue** — `POST /v1/me/sharing/{venueId}`.
  It must be asked for on its own, never bundled into sign-up, and revoking must
  be as easy to find as granting.
- GDPR: export `GET /v1/me/export`, erase `DELETE /v1/me` (requires the account
  email typed as confirmation).
- Subscriptions: the consumer plans are **Free, Pro and Premium** — Plus is
  retired — and **none of them has a free trial**, so no screen should offer one.
  App-store purchase → `POST /v1/billing/receipt` with the receipt. **Send the
  receipt, never a plan name** — entitlements are granted only after the server
  validates it. `GET /v1/plans` carries each plan's commitment terms (1, 3, 6, 12
  months at 0/10/18/25 percent off) with the plan, so never ask twice for a price.

---

## Definition of done, overall

- No reward, discount, streak, heart or balance is computed on the device.
- No answer key, deck layout or target word is ever on the device.
- Every value-moving request carries an `Idempotency-Key`.
- Scans and plays queue offline and flush with `clientTs`, without
  double-submitting.
- All seven games play and score identically to the server.
- Every error code in `API.md` §2 has a message someone at a till can act on.
- Amounts are integers in minor units, everywhere, with no exceptions.
- Nothing on screen says points expire, that there is a daily points cap, that
  hearts come back at midnight, or that a number has been verified.

## What to ask about rather than guess

- Whether the app should offer partner mode at all in v1, or ship
  consumer-only.
- Which of the seven games are already good enough to leave untouched apart from
  the server protocol change.
- Push: the Firebase and APNs credentials are not set up yet, so the register-a-
  token call works but nothing is delivered until they are.

---

## The response shapes that changed

Your `test/live_test.dart` runs the whole journey against a live server and your
`test/protocol_test.dart` holds bodies copied verbatim from one. Both will fail on
the list below, and they are *supposed* to — that is the check working. Fix the
fixtures against a freshly booted `npm run server`, not against this list; this is
the map of where to look.

Ordered by how much of the app each one touches.

### 1. `GET /v1/wallet` — a field was **removed**

```diff
  {
    "points": 1240,
-   "expiringSoon": [ { "expires_at": "…", "points": 120 } ],
    "vouchers": [ … ],
    "rewards": [ … ],
    "stampCards": [ … ],
    "giftCards": [ … ]
  }
```

Points never expire, on any plan, so the array could only ever be `[]` — and a
client rendering "nothing expiring soon" off an empty array is telling the
customer about a rule that no longer exists. Removed rather than emptied for
exactly that reason. **A model that requires the key will throw on decode.**

### 2. `GET /v1/games/state` — `lives` is now an **object**

```diff
  {
-   "lives": { "lives": 2, "max": 3 },
+   "lives": { "lives": 2, "max": 3, "nextAt": "2026-08-29T18:12:44.000Z" },
    "streak": 6,
    "longestStreak": 11,
    "freezes": 2,
    "answered": 310,
    "correct": 244,
    "points": 1240,
    "dailyWord": { … }
  }
```

`nextAt` is when the next heart lands, and `null` when the pool is full. It is
additive, so an old model decodes — but every screen that drew "hearts back at
midnight" is now wrong on the facts and has to read this instead.

### 3. `POST /v1/games/sessions/{id}/finish` — one field added, one hollowed out

```diff
  {
    "score": 6,
-   "capped": 4,            ← could be any number; now always 0
+   "capped": 0,
    "correct": 5,
    "answered": 5,
    "won": true,
    "streak": 7,
    "freezes": 2,
    "livesLeft": 3,
    "balance": 1246,
+   "decay": 0.6,
    "nearest": { … }
  }
```

`capped` is **always 0** now and is kept only so an existing model does not break
on a missing key — there is no daily points ceiling left to trim anything. Any
"you have hit today's limit" copy driven off it is dead: delete it, and delete
the branch that showed it.

`decay` is the factor the round's raw score was multiplied by, and it is what a
"why was this round worth less?" line has to be written from. Also note the raw
scores themselves all moved — see the table in §2. A fixture asserting 25 points
for a clean Brain round or 36 for a Memory Match board is now wrong by a lot.

### 4. `POST /v1/gate/transactions/{id}/confirm` — the receipt lost a field

```diff
  {
    "transaction": { … },
    "pointsGranted": 145,
-   "pointsCapped": 0,
    "discountMinor": 0,
    "stamped": true,
    "reward": null,
    "visitCounted": true,
    "balance": 1385,
    "nextTier": { … }
  }
```

Same reason: nothing caps a scan any more. `pointsGranted` is still one number and
is still the sum of every §2b line this visit paid — it is simply the sum of
*fewer* lines, because **there is no spend bonus**. A bigger bill no longer earns
more; the venue minimum still decides whether the scan counts as a visit at all,
and that is the only thing the amount decides. Nothing else about the gate
changed.

### 5. `POST /v1/games/sessions` — the `no_lives` error detail

```diff
  { "error": { "code": "no_lives",
-              "message": "no lives left today",
-              "detail": { "resetsAt": "2026-08-29T24:00" } } }
+              "message": "no hearts left",
+              "detail": { "nextAt": "2026-08-29T18:12:44.000Z", "max": 3 } } }
```

`resetsAt` is **gone**. A client still parsing it gets null and renders an empty
wait. Hearts refill one every `life_regen_minutes`, so `nextAt` is a real
timestamp minutes-to-hours away, not the end of the day.

### 6. `GET /v1/me` — five fields added, one **removed**

```diff
  "user": {
    "id": "usr_…", "email": "…", "name": "…",
+   "username": "kasia_pl",
    "language": "pl",
    "city": "Kraków",
+   "countryCode": "PL",
+   "avatar": "…",
    "phone": "+48…",
-   "phoneVerified": false,
    "headline": "…",
    "birthDate": "1994-03-11",
+   "birthDateChangesLeft": 1,
+   "profileCompletedAt": "2026-08-14T09:02:11.000Z",
    "onboardedAt": "2026-08-12T18:44:00.000Z",
    "trustTier": 1, "leaderboardOptIn": true,
    "referralCode": "…", "createdAt": "…"
  }
```

`phoneVerified` is **removed**, because nothing is verified any more — there is no
code sent to the number and no endpoint that could ever have set it true. Any
"verify your number" screen, badge or gate goes with it. `countryCode` is derived
from the city on the server and must never be sent by a client.

If your fixture is older than a few weeks, `phone`, `headline`, `birthDate` and
`onboardedAt` will be missing from it too — they are shown as unchanged above
because they arrived in the step before this one. `plan.code` is now one of
`free`, `pro`, `premium`; a fixture holding `plus` is on a retired plan.

The `entitlements` map in the same response gained
`life_regen_minutes`, `scan_points`, `first_visit_points`, `stamp_points`,
`new_category_points`, `voucher_validity_days`, `word_hints_per_day`,
`assistant_uses_per_day`, `profile_badge`, `deal_early_access_hours`,
`monthly_stipend`, `priority_support`, `round_decay` and `streak_freezes`, and
**lost `points_expiry_months`**. It is a `Map<String, String>`, so this is a
content change rather than a decode failure — but anything reading the old key
now reads null.

### 7. `POST /v1/auth/signup` — the body is the same, the behaviour is not

It no longer pays the welcome bonus. The balance immediately after sign-up is 0
(or whatever a merged guest identity brought), not 100. Call
`POST /v1/me/onboarded` when onboarding finishes:

```json
{ "granted": true, "onboardedAt": "…", "points": 100, "balance": 100 }
```

A test asserting "a new account has 100 points" fails until it makes that call.

### 8. New endpoints

| Endpoint | Auth | Response |
| --- | --- | --- |
| `GET /v1/cities` | public | `{ countries: ["PL","DE","UZ"], cities: [{ name, country }] }` — 114 entries |
| `POST /v1/me/onboarded` | user | `{ granted, onboardedAt, points, balance }` |

### 9. New refusals on endpoints that used to always succeed

| Call | New failure |
| --- | --- |
| `POST /v1/assistant/ask` | `403 entitlement_required`, `entitlement: "assistant_uses_per_day"`, with `limit` and `used`, past 5 asks a day on free |
| `POST /v1/games/sessions/{id}/events` with `kind: "hint"` | `403 entitlement_required`, `entitlement: "word_hints_per_day"`, past 3 a day on free |
| `POST /v1/assistant/ask` with someone else's `sessionId` | `404 not_found` |
| `PATCH /v1/me` | `409 conflict` on a taken `username`, or on a third different `birthDate`; `400 validation_failed` with `field` on a city outside `GET /v1/cities` |

A test fixture that asks the assistant six times in one run, or takes four hints
in a round, now fails on the sixth and the fourth.

### What did **not** change

The gate's *sequence* — `/gate/scan`, `/amount`, `/confirm`, the polling and the
error codes — is exactly as it was; only `pointsCapped` left the receipt (§4).
Vouchers, gift cards, stamp cards, rewards, deals and their funnel, the guidebook,
the converter, referrals, leaderboards, notifications, push registration, the
consent and GDPR routines, and every partner endpoint are untouched. So is
`GET /v1/wallet/history`: the ledger entries still carry an `expires_at` field,
and every new one is `null`. Do not render it.

### A checklist for the two test files

- [ ] `test/protocol_test.dart`: recapture `/v1/wallet`, `/v1/games/state`,
      `/v1/games/sessions/{id}/finish`, `/v1/gate/…/confirm` and `/v1/me` from a
      freshly booted server. Those five are the ones whose keys moved.
- [ ] Any model with a required `expiringSoon`, `pointsCapped` or `phoneVerified`
      field: make it gone, not optional. A field that is never sent is not a
      nullable field, it is a field that does not exist.
- [ ] Any parse of `resetsAt` off a `no_lives` error: replace with `nextAt`.
- [ ] `test/live_test.dart`: the journey now needs `POST /v1/me/onboarded` before
      it can assert a non-zero starting balance, and its game assertions need the
      new raw scores plus the decay factor if it plays the same game twice.
- [ ] Any assertion that a fourth Word Builder hint or a sixth assistant ask
      succeeds. Both are 403s now.
