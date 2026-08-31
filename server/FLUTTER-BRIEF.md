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
npm run verify:api    # 579 checks, if you want to see what it guarantees
```

> **A large economy change has landed since the last copy of this brief.** Points
> no longer expire, there is no daily points cap and no per-game decay curve,
> there is no spend bonus, and the plans are Free / Pro / Premium with no trial.
> **Hearts became energy**, they refill on a clock instead of at midnight, and
> **every finished round now costs one, win or lose** — which makes that pair of
> numbers the single thing bounding a day.
>
> Several response bodies changed shape with it, and one thing changed with no
> shape to show for it. The exact list is the **last section of this file**,
> ordered by how much of the app each one touches, and it is what your
> `test/live_test.dart` and `test/protocol_test.dart` will fail on first. Read
> that before you read anything else here.
>
> **The games have moved again since that was written, and mostly in numbers
> rather than in shapes.** The energy clock was cut hard (240/180/120 → 120/60/30
> minutes a refill, ceilings unchanged), so a day went from 10/14/22 rounds to
> **16/30/58**; the four quizzes lost their mistake limit and **cannot be lost**;
> and all four scoring tables were rewritten, with the quizzes gaining a
> round-speed bonus and two of the games now paying in halves. §2 and §3 of that
> same list carry it. One key left a body (`mistakesAllowed`) and two arrived
> (`perfectBonus`, `speedBands`); everything else is a figure, which means the
> app will decode perfectly and be wrong.
>
> **The profile has moved since then too.** `headline` is gone — the column was
> dropped, not emptied — and `occupation`, which the UI labels "Status", took its
> place; the city field stopped being a closed list; and the GDPR export got much
> bigger. Those are §5, §6 and §9 of the same list.
>
> **And `gameType` has gained a value: `uzbekistan`.** It is still seven games —
> the Poland quiz became a *local* quiz with a bank per country, and the client
> picks between `poland` and `uzbekistan` by `countryCode` on `GET /v1/me` rather
> than showing both. A sealed Dart enum over the seven old values will throw on
> decode the first time one is echoed back, which is §3e of that same list.

---

## Stop calculating, start asking

This is the single most important change, and it applies to code that already
works today.

**The server decides. The client displays and requests.** Anywhere the app
currently computes any of the following, delete that code and read the value
from the API instead:

- points earned from a round, a scan or a referral
- the streak, whether it continued, whether a freeze was spent
- energy remaining, and when the next one lands
- whether a round can be started at all
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
The per-game figures below are the **raw** score, before the one factor under the
table; do not print any of them as the reward.

| # | Game | `gameType` | What it is | Raw score |
| --- | --- | --- | --- | --- |
| 1 | Brain Games | `brain` | 5 questions, 12 s each. **No mistake limit — a quiz cannot be lost** | 1 per correct, **+1** for all five, **+2/+1/0** if the whole round took ≤10 s / ≤15 s / longer |
| 2 | Guess the Flag | `flags` | 5 questions, 6 s each. `prompt` is an **ISO country code** — build the flag emoji from it (snippet in `API.md` §5) | as above; ceiling 8 |
| 3 | Country & Capital | `capitals` | 5 questions, 6 s each | as above; ceiling 8 |
| 4 | Local Quiz | `poland` **or** `uzbekistan` | 5 questions, 8 s each. **One card, two banks** — send the type that matches the country on the player's profile; see below | as above; ceiling 8 |
| 5 | Squawk's Flight | `flight` | The arcade round. Endless side-scroller, fly through gaps, one crash ends it. 5 gaps decides whether the round was *won* | **half a point** per gap, **capped at 20 points** |
| 6 | Memory Match | `memory_match` | 6 pairs. **No fail state** — deliberately the accessible one — but it is now **timed** | Elapsed time alone: ≤18 s → 8, ≤23 s → 6, slower → 3 |
| 7 | Word Builder | `word_builder` | 5 words from scrambled letters | **the word's own tier** (1/2/3), **halved** if that word was hinted, **+1** for all five first-try and hint-free |

**Seven cards, eight `gameType` values.** Row 4 is one game with two question
banks: `poland` and `uzbekistan` run the identical protocol, score by the
identical rules and differ only in which country they ask about. **Pick between
them by `countryCode` on `GET /v1/me` and render a single card** — do not put both
in the grid. A player in Kraków has no use for a quiz about Samarkand, and a menu
that grows by one card every time the product reaches another country is a grid
that stops fitting on a phone. `countryCode` is nullable, so decide what an
account with no country sees rather than sending `null` into a switch and
rendering nothing; the site's own answer is the market it is in.

Then the server applies one factor and nothing else:

```
score = floor(raw × points_multiplier)
```

- **`points_multiplier`** (1 / 1.25 / 1.75) is a **game-round rule only**. It is
  not applied to a scan, a first visit, a stamp card or a new category — those
  have four named entitlements of their own.
- **A round pays the same whether it is the player's first of the day or their
  ninth.** There is no daily points cap and no per-game decay curve. A curve did
  live here — it paid a repeat of the same game 100/60/40/20/0 percent on free —
  and it is gone, along with the `decay` field on the finish response. Any "worth
  less this time" copy is dead: delete it rather than leaving it behind a branch
  that can no longer be true.

Notes that decide whether these feel right:

- The banks are on the server: 196 flag questions and 196 capitals, in English,
  Polish, Russian and Uzbek. You do not ship question data.
- **A quiz cannot be lost.** All five questions are asked however the first four
  went; there is no mistake limit and `mistakesAllowed` is gone from the round's
  `content`. Any hearts-remaining row on a quiz screen is dead — delete it, do
  not draw it full. `won` on a quiz now means **all five correct**, and
  `won: false` means "not a clean sweep" rather than "forfeited".
- **The quiz speed bonus is on the whole round and only on a clean sweep**, timed
  from the first event the server recorded to the last. There is no duration to
  report — the same as Memory Match. Draw the timer against
  `content.speedBands`, which the server sends with `perCorrect` and
  `perfectBonus` so the numbers on the screen are the ones that will be paid.
- **A band boundary is inclusive**: the wire field is `throughSeconds` and it is
  compared with `<=`. Ten seconds exactly is the ten-second band.
- **Memory Match: the layout is still secret, but a turned card comes back.**
  You get `{cards, pairs}` and report positions, and the reply carries
  `revealed: [{index, face}, …]` for whatever you just turned. **Render your
  board from that** — it is the only way a client ever learns a face, and
  without it a mismatch teaches nothing and the game is not a memory game. It
  arrives on a mismatch as well as a match, and on the duplicate path
  (`accepted: false`) too, because a retry after a dropped response is the only
  thing that will ever tell you what those cards were. `face` is a symbol
  string, not a label. Still do not hold a deck of your own. It is scored from
  the server's own event stamps, so there is no duration to report: just play
  the moves.
- **Turn the first card of a move with `kind:"peek"`, `payload:{index}`.** This
  is new, it is additive, and it is the difference between this game and a coin
  toss: the protocol had only the pair, so the first card a player tapped stayed
  blank until they had already committed to a second. Peek → that card's face
  comes back as a **one-entry** `revealed`. Then send `{a, b}` for the second
  card → **two** entries and the verdict. So read the array; never index a fixed
  length. Five rules come with it, and four of them are things not to build:
  - A peek carries **no `correct` and no `answer`** — it is not an answer to
    anything. It is not counted as a pair and does not enlarge the board, so
    `/finish` returns exactly what it did.
  - **One `seq` for both kinds.** Number the moves of a round, not the kinds. A
    peek counter and a pair counter collide on the second move of every board.
  - A peek naming a card **off the board, or one already matched**, is a
    `bad_request` and writes nothing — the number is not spent. Your UI should
    never send one: a matched card is not tappable.
  - The **pair** move still accepts two already-matched positions, on purpose,
    so retrying a move whose response was lost is safe.
  - **No peek allowance, no peek penalty, no local meter.** The round is priced
    on elapsed time alone and a peek is an event inside that span, so peeking
    can only ever cost. It also means the clock now starts on the first card
    turned rather than on the first pair, which is the reading the player's own
    stopwatch has been showing all along.
- The flight is the one game with no answer key. Report `{cleared}` to `/finish`;
  the server caps the **points**, not the gaps. It pays **half a point a gap**
  now, so the 20-point ceiling is forty gaps rather than twenty — which is what
  the client-side speed ramp is there to make earned rather than waited out. The
  ramp is yours; the price of a gap is the server's.
- **Halves are real, and the round is floored once at the end.** A hinted word is
  worth half its tier and a gap half a point. The server carries the exact sum
  through the plan multiplier and floors the result, so seven gaps is 3.5 and
  banks 3 on free and **4** on Pro. Do not floor per item locally and then show
  the total; you will be a point low, and only on paid tiers, which is the
  hardest kind of mismatch to notice.
- **Hearts became energy, and every finished round costs one — win or lose.**
  Losses only was the rule before, and it bounded nobody: two of the seven games
  cannot be lost. An **abandoned** round still costs nothing, and *starting* one
  costs nothing — the charge is written when the round is banked, so a dropped
  connection mid-round takes nothing with it.
- **Energy does not reset at midnight.** It is shared across all seven games and
  refills one every `energy_regen_minutes` — 120 free, 60 Pro, 30 Premium — up
  to `daily_energy` (4 / 6 / 10). `GET /v1/games/state` returns
  `energy: { energy, max, nextAt }`, and `nextAt` is what an empty tank should
  draw. A countdown to midnight is wrong.
- **That pair is the whole limiter on a day**, now that there is no points cap
  and no decay curve. Read together they give its size — 12 rounds a day
  sustained on free and 16 from a full tank, 24/30 on Pro, 48/58 on Premium. It
  is worth drawing honestly: it is the number a player plans an evening around,
  and it is what a paid plan is actually sold on. **All six of those figures have
  just moved** (from 6/10, 8/14, 12/22), because the intervals were cut hard
  while the ceilings stayed put.
- Word Builder hints are capped per day by `word_hints_per_day` (3 / 6 / 10).
  Past it the hint event is refused with `entitlement_required`, carrying `limit`
  and `used`. A hint **halves that word's points** — it used to forfeit a tier
  bonus and keep a flat base, which charged nothing on the easiest word.
- A round's result comes back with `streak`, `freezes`, `energyLeft` and
  `balance` — show those from the response, do not recompute them.

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
- **`GET /v1/cities` suggests; it no longer decides.** Same shape, same 114
  cities across Poland, Germany and Uzbekistan, still public so the sign-up form
  can render it before an account exists, still a list rather than a search —
  filter locally and show the whole set when the box is empty. What changed is
  that a city *not* on it is now accepted, by both `PATCH /v1/me` and
  `POST /v1/auth/signup`, as long as a `countryCode` comes with it. The picker
  becomes a type-ahead with a free-text fallback and a country picker behind it,
  not a dropdown that refuses.

  **Do not assume what you sent is what was stored.** A city on the list is
  stored with the list's own spelling and country and your `countryCode` is
  ignored (`Kraków` → `Krakow` / `PL`); a city off it is folded and title-cased,
  so `Saint-Étienne` comes back `Saint Etienne`. Read `city` and `countryCode` off
  the response and render those. One place has to have one spelling, because the
  weekly board groups on it literally.
- **The profile has more fields, one is gone, and none of them is verified.**
  `PATCH /v1/me` takes `name`, `username`, `language`, `city`, `countryCode`,
  `avatar`, `phone`, `occupation`, `birthDate` and `leaderboardOptIn`. There is no
  `phoneVerified` and no verification flow of any kind — delete any "verify your
  number" screen. Three rules shape the form:
  - `username` is unique platform-wide, 3–20 of `a-z 0-9 _`, single underscores
    between runs, some names reserved. A clash is a 409 naming the field.
  - `birthDate` is settable once and correctable once; a third *different* day is
    a 409 naming support. Resending the day already stored spends nothing, so it
    is safe to PATCH the whole profile on every save. `birthDateChangesLeft` on
    `GET /v1/me` says how many writes remain — grey the field out at 0 instead of
    letting somebody find out by being refused.
  - `occupation` is one of `student`, `worker`, `business`, `freelancer`,
    `other`. **Label it "Status" in the UI and never name the field `status` in
    your models** — `status` is the account state on the server, and the two will
    be read for each other the first time somebody greps. It is a picker, not a
    text field; anything else is a 400 whose `allowed` carries the five. The
    labels are yours to translate — the server sends the five raw values and
    nothing else.

  **`headline` is gone.** The free-text line about yourself was dropped, not
  emptied, in both directions — a model that requires it throws on decode, and
  sending it is ignored. Delete the field, its screen and its 140-character
  counter.

  Filling all seven answers (photo, username, status, city, email, phone,
  birthday) pays the completion bonus once and stamps `profileCompletedAt`.
- **Data sharing is a separate consent, per venue** — `POST /v1/me/sharing/{venueId}`.
  It must be asked for on its own, never bundled into sign-up, and revoking must
  be as easy to find as granting.
- GDPR: export `GET /v1/me/export`, erase `DELETE /v1/me` (requires the account
  email typed as confirmation). The export's `account` block got much bigger —
  see §9 of the response-shape list. Show the document or hand over the file;
  **do not map it to a model with a fixed field list**, because that is the same
  under-reporting bug one layer up, and it will silently hide the next column
  anybody adds.
- Subscriptions: the consumer plans are **Free, Pro and Premium** — Plus is
  retired — and **none of them has a free trial**, so no screen should offer one.
  App-store purchase → `POST /v1/billing/receipt` with the receipt. **Send the
  receipt, never a plan name** — entitlements are granted only after the server
  validates it. `GET /v1/plans` carries each plan's commitment terms (1, 3, 6, 12
  months at 0/10/18/25 percent off) with the plan, so never ask twice for a price.

---

## Definition of done, overall

- No reward, discount, streak, energy count or balance is computed on the device.
- No answer key, deck layout or target word is ever on the device.
- Every value-moving request carries an `Idempotency-Key`.
- Scans and plays queue offline and flush with `clientTs`, without
  double-submitting.
- All seven games play and score identically to the server.
- Every error code in `API.md` §2 has a message someone at a till can act on.
- Amounts are integers in minor units, everywhere, with no exceptions.
- Nothing on screen says points expire, that there is a daily points cap, that a
  repeat round pays less, that energy comes back at midnight, that a quiz round
  can be lost or that mistakes are limited, or that a number has been verified.
  Nothing says "heart" at all.
- No screen offers a free-text `headline`, and no screen refuses a city because
  it is not on `GET /v1/cities`. The profile's "Status" is a five-value picker
  reading `occupation`, and every city and country shown is the one the server
  returned rather than the one that was typed.

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

**Ordered by how much of the app each one touches.** Two batches are new since
the last copy of this brief: the economy change, which is §1–§3, and the profile
change, which is §5, §6 and §9. The rest were in it already, so if you have
worked through them once they are here as a checklist rather than as news. Read
§2 whatever else you skip: it is the only item on the list with no shape to fail
on, which means nothing on either side will tell you it happened.

### 1. Hearts became **energy** — one rename, five places

The word changed and so did the rule (§2 below). Every one of these is a hard
break: a required field that is no longer sent, or a string a `switch` no longer
matches.

**1a. `GET /v1/games/state` — the outer key *and* the inner count both moved.**

```diff
  {
-   "lives": { "lives": 2, "max": 4, "nextAt": "2026-08-29T18:12:44.000Z" },
+   "energy": { "energy": 2, "max": 4, "nextAt": "2026-08-29T18:12:44.000Z" },
    "streak": 6,
    "longestStreak": 11,
    "freezes": 2,
    "answered": 310,
    "correct": 244,
    "points": 1240,
    "dailyWord": { … }
  }
```

Two renames rather than one, so a model that only chased the outer key still
decodes an object with a missing `lives` inside it. `nextAt` is when the next
energy lands, and `null` when the tank is full.

**1b. `POST /v1/games/sessions` — `livesLeft` → `energyLeft`.**

```diff
  {
    "sessionId": "gms_…",
    "gameType": "capitals",
    "content": { … },
-   "livesLeft": 3
+   "energyLeft": 3
  }
```

This one is what the player holds **before** the round is paid for — starting
costs nothing (see §2), so it is not yet decremented.

**1c. `POST /v1/games/sessions/{id}/finish` — the same rename, one lower.**

```diff
    "freezes": 2,
-   "livesLeft": 3,
+   "energyLeft": 2,
    "balance": 1246,
```

**1d. `POST /v1/games/sessions` — the refusal is `no_energy`, not `no_lives`.**

```diff
- { "error": { "code": "no_lives",
-              "message": "no hearts left",
-              "nextAt": "2026-08-29T18:12:44.000Z", "max": 4 } }
+ { "error": { "code": "no_energy",
+              "message": "no energy left",
+              "nextAt": "2026-08-29T18:12:44.000Z", "max": 4 } }
```

**This is the dangerous one**, because nothing about it fails loudly: the status
is still `409`, the body still decodes, and a `switch` on the code simply falls
through to whatever generic handler you have. The screen that said "no hearts —
next one at 18:12" starts saying "something went wrong" on the one refusal in the
product that has a good explanation available.

Two notes on the shape while you are here. The detail is **spread into `error`**,
not nested under a `detail` key — an earlier copy of this brief drew it wrong.
And `resetsAt` does not exist: energy is on a clock, so `nextAt` is a real
timestamp minutes-to-hours away rather than the end of the day.

**1e. The `entitlements` map — the pair renamed, and a third key gone.**

```diff
- "daily_lives": "4", "life_regen_minutes": "240",
+ "daily_energy": "4", "energy_regen_minutes": "120",
- "round_decay": "free",
```

A `Map<String, String>`, so this is a content change rather than a decode
failure — anything reading an old key now reads null, which on a paywall screen
renders as a blank number rather than as an error. The server *deletes* retired
keys from its own tables on every boot, so there is no stale value to read
either.

### 2. Every finished round costs one energy — and there is no shape to catch it

**A win costs one too.** It was losses only. That is invisible to every schema,
to `protocol_test.dart` and to a generated client: nothing renamed, nothing
added, nothing removed. It will reach you as a support ticket.

The size of it: two of the seven games cannot be lost at all, and a player
answering correctly never touched the old pool. So for the players who were
never charged, consumption goes from nothing to one a round, and across a mixed
session **energy drains roughly three times faster than a client tuned to the old
rule expects**. Anything the app paces off the pool — a "play again" affordance,
a nudge, a paywall prompt, an onboarding tutorial that assumes the first few
rounds are free — is now mistimed.

**And the refill has just been cut hard, which moves it back the other way.**
`energy_regen_minutes` went 240/180/120 → **120/60/30** while `daily_energy`
stayed at 4/6/10. Nothing about the shape of the response changed, so this is the
second thing in this section that reaches you as a support ticket rather than as
a decode failure — but a day is now much larger, and the whole of a paid plan's
argument moved into the clock.

What a day is, so the screens can say it honestly:

| Plan | Sustained, per day | From a full tank | Was |
| --- | --- | --- | --- |
| Free | 12 | 16 | 6 / 10 |
| Pro | 24 | 30 | 8 / 14 |
| Premium | 48 | 58 | 12 / 22 |

Three rules travel with the charge, and each of them is a screen:

- **Starting costs nothing; finishing costs one.** Do not decrement locally at
  the start — read `energyLeft` off `/finish`.
- **An abandoned round costs nothing.** A dropped connection mid-round is the one
  failure the player definitely did not choose, so it takes nothing with it. Do
  not "helpfully" post a finish to tidy up a stale session; that is the one thing
  that turns a free failure into a charged one.
- **The refusal is enforced at the start** (§1d), because finding out at the end
  means finding out after the round was played.

### 3. The games — `decay` is **gone**, `capped` always was 0, **every scoring table moved**, and `gameType` gained a value

```diff
  {
    "score": 6,
    "capped": 0,
    "correct": 5,
    "answered": 5,
    "won": true,
    "streak": 7,
    "freezes": 2,
    "energyLeft": 2,
    "balance": 1246,
-   "decay": 0.6,
    "nearest": { … }
  }
```

The per-game decay curve is **deleted**, not disabled: `score = floor(raw ×
points_multiplier)` and nothing else. A round pays the same whether it is the
first of the day or the tenth. **A model with a required `decay` throws on
decode**, on the result screen of every round of every game — and any "worth less
this time" copy, and the branch that showed it, should go with the field rather
than sit behind a condition that can no longer be true.

`capped` is still sent and is **always 0**, kept only so an older model does not
break on a missing key. There is nothing to read instead of it: nothing trims a
round. Delete any "you have hit today's limit" copy driven off it.

**The raw scores themselves have all just moved again**, and none of them has a
shape to catch it. The table is in §2 of the brief; what changed, per game:

| Game | Was | Is |
| --- | --- | --- |
| the four quizzes | 1 per correct, **+5** for all five; 2 mistakes survivable | 1 per correct, **+1** for all five, **+2/+1/0** for a clean sweep in ≤10 s / ≤15 s / slower. **No mistake limit.** Ceiling 8 |
| `word_builder` | 1 per word + tier bonus 0/1/2 (a hint forfeited the bonus), **+3** for a clean sweep | **the word's tier** 1/2/3, **halved** by a hint, **+1** for a clean sweep |
| `memory_match` | <40 s → 12, <70 s → 8, <110 s → 4, else 2 | **≤18 s → 8, ≤23 s → 6, slower → 3** |
| `flight` | 1 per gap, capped at 20 | **0.5 per gap**, capped at 20 |

Four consequences for the app, in the order they will bite:

**3a. `content` on `POST /v1/games/sessions` — a quiz key left and two arrived.**

```diff
  "content": {
    "questions": [ … ],
-   "mistakesAllowed": 2,
    "perCorrect": 1,
+   "perfectBonus": 1,
+   "speedBands": [ { "throughSeconds": 10, "points": 2 },
+                   { "throughSeconds": 15, "points": 1 },
+                   { "throughSeconds": null, "points": 0 } ]
  }
```

A required `mistakesAllowed` **throws on decode** at the top of every quiz. Any
hearts-remaining row on a quiz screen is dead: **a quiz cannot be lost**, all five
questions are asked however the first four went, and the round banks what it
earned. Draw the round timer against `speedBands` rather than hardcoding 10 and
15 — the point of sending them is that the number on the screen is the number
that will be paid.

**3b. `won` on a quiz now means all five correct.** Not "fewer than three
mistakes". `won: false` is "not a clean sweep", not "forfeited" — the round still
scored, still banked, and still cost its one energy. A "you lost" screen on a
quiz is now wrong on both counts.

**3c. The quiz speed bonus is timed by the server, on the whole round, and is
paid only on a clean sweep.** It is the span from the first event the server
recorded to the last, exactly as Memory Match is timed. There is no duration to
report and no per-question clock behind it. Paying it on any round would make
answering five questions wrong without reading them the fastest way to a bonus.
A boundary is **inclusive**: `throughSeconds` is compared with `<=`, so ten
seconds exactly is the ten-second band.

**3d. Scores can be halves before they are banked, and the round is floored
once, at the end.** A hinted word is worth half its tier; a gap is worth half a
point. The server carries the exact sum through `points_multiplier` and floors
the result — seven gaps is 3.5, which banks **3** on free and **4** on Pro. If
the app floors per item and shows its own total, it will disagree with `score`
by a point, only on paid tiers, only on odd counts. That is the hardest kind of
mismatch to notice and the easiest to avoid: show `score` off the response.

A fixture asserting 25 points for a clean Brain round, 36 for a Memory Match
board, or 10 for a clean quiz sweep is wrong by a lot.

**3e. `gameType` has an eighth value, `uzbekistan`, and it is still seven
games.** The Poland quiz became a *local* quiz with one bank per country:
`poland` and `uzbekistan` run the same protocol, take the same event payloads,
score by the same table and differ only in what they ask about. This is the one
item in §3 that is a **decode** break rather than a figure — a sealed enum over
the seven old strings throws the first time the server echoes the new one back
on `POST /v1/games/sessions`.

Two things to build against it. **Choose by `countryCode` on `GET /v1/me` and
render one card**, not two: a grid that gains a card every time the product
reaches another country stops fitting on a phone, and the quiz a player wants is
the one about where they live. And **decide what an unknown country sees** —
`countryCode` is nullable on accounts that predate the field, so a `switch` with
no default renders no local quiz at all rather than an obvious fallback.

**3f. Memory Match gained a move: `kind:"peek"`, `payload:{index}`.** Purely
additive — nothing that exists changed shape — and it is the difference between
the game and a coin toss with a delay on it. The protocol had only the pair, so
the first card a player tapped could not be drawn until they had already
committed to a second, and a game about remembering what you saw showed them
nothing to remember.

```
POST /v1/games/sessions/{id}/events
     { seq: 0, kind: "peek", payload: { index: 3 } }
  → { revealed: [ { index: 3, face: "▲" } ], accepted: true }

     { seq: 1, kind: "pair", payload: { a: 3, b: 7 } }
  → { correct: false, answer: "▲",
      revealed: [ { index: 3, face: "▲" }, { index: 7, face: "●" } ],
      accepted: true }
```

So `revealed` is **one** entry for a peek and **two** for a pair: read the
array, do not index a fixed length, and note that a peek carries neither
`correct` nor `answer` because it is not an answer to anything. It shares the
one `seq` sequence with the pairs — number the *moves* of a round, not the
kinds, or a peek counter and a pair counter collide on the second move of every
board. A peek naming a card off the board or one already matched is a `400`
`bad_request` and writes nothing, so a refused move costs neither a number nor a
row; the `pair` move still accepts two matched positions, on purpose, so a retry
after a lost response is safe.

There is **no peek allowance and no peek penalty** — do not build a meter. The
round is priced on elapsed time alone and a peek is an event inside that span,
so it can only ever cost. The one consequence worth knowing is that the clock
now starts on the first card *turned* rather than on the first pair submitted,
which is a second or two earlier and is the reading a player's own stopwatch has
been showing all along.

### 4. `GET /v1/wallet` — a field was **removed**

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

### 5. `GET /v1/me` — `headline` is **gone**, `occupation` arrived

```diff
  "user": {
    "id": "usr_…", "email": "…", "name": "…",
+   "username": "kasia_pl",
    "language": "pl",
-   "city": "Kraków",
+   "city": "Krakow",
+   "countryCode": "PL",
+   "avatar": "…",
    "phone": "+48…",
-   "phoneVerified": false,
-   "headline": "a sentence somebody typed",
+   "occupation": "freelancer",
    "birthDate": "1994-03-11",
+   "birthDateChangesLeft": 1,
+   "profileCompletedAt": "2026-08-14T09:02:11.000Z",
    "onboardedAt": "2026-08-12T18:44:00.000Z",
    "trustTier": 1, "leaderboardOptIn": true,
    "referralCode": "…", "createdAt": "…"
  }
```

**`headline` is gone, not nullable.** The column was dropped — a free-text line
about yourself is unsearchable, unsegmentable, untranslatable and a moderation
surface, and it earned the product none of those. **A model with a required
`headline` throws on decode**, on the profile screen and on everything that
renders a profile header. Delete the field, its editor and its character counter.

**`occupation` replaces it** and is one of `student`, `worker`, `business`,
`freelancer`, `other`, or `null`. Two things about the name, and both will
otherwise cost somebody an afternoon:

- **The UI label is "Status". The field is not.** `status` on the server is the
  account state — `provisional`, `active`, `banned`, `erased` — so a Dart model
  with a `status` getter on the user is a name collision waiting for the first
  person who greps for it. Keep the wire name.
- **The five labels are yours to translate.** The server sends the raw values and
  there is no endpoint that serves the set — five strings a client has to
  translate anyway are not worth a round trip. The 400 in §6 carries them in
  `allowed`, which is where a drifted client finds out.

`phoneVerified` is **removed**, because nothing is verified any more — there is no
code sent to the number and no endpoint that could ever have set it true. Any
"verify your number" screen, badge or gate goes with it.

`city` is worth recapturing even if you think you have it: what comes back is the
**canonical** spelling, not what was typed. A fixture holding `Kraków` was already
wrong before this change — the list's own spelling is `Krakow` — and §6 is where
that rule now bites, because the field accepts far more than it used to.
`countryCode` comes back beside it and is the server's answer for a city it knows.

If your fixture is older than a few weeks, `phone`, `birthDate` and `onboardedAt`
will be missing from it too — they are shown as unchanged above because they
arrived in the step before this one. `plan.code` is now one of `free`, `pro`,
`premium`; a fixture holding `plus` is on a retired plan.

The `entitlements` map in the same response gained `scan_points`,
`first_visit_points`, `stamp_points`, `new_category_points`,
`voucher_validity_days`, `word_hints_per_day`, `assistant_uses_per_day`,
`profile_badge`, `deal_early_access_hours`, `monthly_stipend`,
`priority_support` and `streak_freezes`, and **lost `points_expiry_months`**.
The energy pair and `round_decay` are §1e.

### 6. `PATCH /v1/me` — one field gone, one arrived, and the city opened up

The request side of §5, plus the change that actually needs a form redesign.

```diff
  PATCH /v1/me
  {
    "name": "Kasia", "username": "kasia_pl", "language": "pl",
-   "city": "Kraków",
+   "city": "Kryvyi Rih",
+   "countryCode": "UA",
    "avatar": "…", "phone": "+48…",
-   "headline": "a sentence somebody typed",
+   "occupation": "freelancer",
    "birthDate": "1994-03-11", "leaderboardOptIn": true
  }
```

`Kraków` was the only kind of answer the field took: one of the 114, or a 400.
`Kryvyi Rih` is not on that list and is now accepted, because `countryCode` came
with it, and it comes back as `Kryvyi Rih` / `UA`. Send `Kraków` and it still
works — and comes back `Krakow` / `PL`, with any `countryCode` you sent thrown
away.

**`city` is canonicalised, not restricted.** `GET /v1/cities` is unchanged in
shape — same 114 places, still public, still a list you filter locally — but it is
now a *suggestion source*. A city that is not on it is accepted as long as
`countryCode` comes with it, which is the point: a whitelist told somebody the
product has not reached yet that their own home town does not exist, over a field
that gates nothing.

So the field is a type-ahead over the 114 with a free-text fallback, and a country
picker that appears when nothing matched. **What you send is not what is stored**,
in both directions:

- **On the list.** The list's own spelling and the list's own country win, and
  the `countryCode` you sent is **ignored**. `Kraków`, `Cracow` and `krakow` all
  store `Krakow` / `PL`. That is what keeps one place on one weekly board — the
  board groups on `users.city` with a literal `=`, so free text would not make a
  messy board, it would make several, each with one player on it — and it is what
  stops a client writing `Krakow, US`.
- **Off the list.** The name is folded and title-cased, so diacritics, hyphens and
  apostrophes do not survive: `Saint-Étienne` is stored, and returned, as
  `Saint Etienne`. That is the price of one board per place. It is the price the
  114 already pay — their canonical names are ASCII for the same reason.

**Render `city` and `countryCode` from the response, never from the text field.**
A form that keeps showing what was typed is showing something the server does not
have, and it will disagree with the leaderboard on the next screen.

Three refusals, all `400 validation_failed`, and each names the field a form
should point at:

| What was sent | `field` | What the form should do |
| --- | --- | --- |
| A city we do not know, with no `countryCode` | `countryCode` | Show the country picker. Do **not** mark the city field invalid — the city is fine, it is the answer that is incomplete. |
| A `countryCode` with no `city` | `city` | Send both or neither; a country is half of one answer. |
| An `occupation` outside the five | `occupation` | The body carries the allowed set in `allowed`. Reaching this means the picker has drifted from the server. |

`POST /v1/auth/signup` takes `city` and `countryCode` under the same rule, so the
sign-up form gets the same treatment and the first row of that table applies
there too. The other two do not: sign-up takes no `occupation` at all, and a
`countryCode` sent there without a `city` has no city to be a fact about and is
dropped rather than refused.

`headline` is no longer read at all — sending it is ignored rather than refused,
which means a client that keeps the field will look like it is working and quietly
save nothing.

### 7. `POST /v1/gate/transactions/{id}/confirm` — the receipt lost a field

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

Nothing caps a scan any more. `pointsGranted` is still one number and is still the
sum of every §2b line this visit paid — it is simply the sum of *fewer* lines,
because **there is no spend bonus**. A bigger bill no longer earns more; the venue
minimum still decides whether the scan counts as a visit at all, and that is the
only thing the amount decides. Nothing else about the gate changed.

### 8. `POST /v1/auth/signup` — the body is the same, the behaviour is not

It no longer pays the welcome bonus. The balance immediately after sign-up is 0
(or whatever a merged guest identity brought), not 100. Call
`POST /v1/me/onboarded` when onboarding finishes:

```json
{ "granted": true, "onboardedAt": "…", "points": 100, "balance": 100 }
```

A test asserting "a new account has 100 points" fails until it makes that call.

### 9. `GET /v1/me/export` — the `account` block gained 13 keys

The GDPR export's `account` block went from **12 keys to 25**, of the 28 columns
`users` has. Nothing was removed.

```diff
  "account": {
    "id": "usr_…", "email": "…", "display_name": "Kasia",
    "language": "pl", "city": "Krakow", "country_code": "PL",
+   "username": "kasia_pl",
+   "auth_provider": "email",
+   "provider_ref": null,
+   "phone": "+48…",
+   "birth_date": "1994-03-11",
+   "birth_date_set_at": "…",
+   "birth_date_changes": 1,
+   "occupation": "freelancer",
+   "onboarded_at": "…",
+   "profile_completed_at": "…",
+   "display_avatar": "…",
+   "updated_at": "…",
+   "deleted_at": null,
    "points_cache": 1240, "leaderboard_opt_in": 1, "referral_code": "…",
    "trust_tier": 1, "status": "active", "created_at": "…"
  }
```

It was under-reporting: `username`, `phone`, `birth_date`, `display_avatar` and
`occupation` were cleared by the erasure and absent from the export. Both are now
generated from one table, so they cannot disagree about what is personal.

Three columns are deliberately withheld and the reason is part of the design
rather than an oversight: `password_hash` is a credential, and `email_norm` /
`username_norm` are normalised duplicates of columns the export does carry. If a
screen lists what is held, those three are what it should be able to explain.

For the client this is one instruction: **show the document, do not map it.** A
model with a fixed field list is the same under-reporting bug one layer up, and it
will hide the next column silently. Render the JSON, or hand over the file.

`DELETE /v1/me` is unchanged in shape and now clears one more column —
`provider_ref`, the Google `sub`, which was surviving erasure entirely.

### 10. New endpoints

| Endpoint | Auth | Response |
| --- | --- | --- |
| `GET /v1/cities` | public | `{ countries: ["PL","DE","UZ"], cities: [{ name, country }] }` — 114 entries, and now a suggestion source rather than a whitelist (§6) |
| `POST /v1/me/onboarded` | user | `{ granted, onboardedAt, points, balance }` |

### 11. New refusals on endpoints that used to always succeed

| Call | New failure |
| --- | --- |
| `POST /v1/assistant/ask` | `403 entitlement_required`, `entitlement: "assistant_uses_per_day"`, with `limit` and `used`, past 5 asks a day on free |
| `POST /v1/games/sessions/{id}/events` with `kind: "hint"` | `403 entitlement_required`, `entitlement: "word_hints_per_day"`, past 3 a day on free |
| `POST /v1/games/sessions/{id}/events` with `kind: "peek"` | `400 bad_request` on a card off the board, or one already matched. Nothing is written, so the `seq` is still free (§3f) |
| `POST /v1/assistant/ask` with someone else's `sessionId` | `404 not_found` |
| `PATCH /v1/me` | `409 conflict` on a taken `username`, or on a third different `birthDate`; `400 validation_failed` naming `countryCode`, `city` or `occupation` — the three in §6 |

A test fixture that asks the assistant six times in one run, or takes four hints
in a round, now fails on the sixth and the fourth. One that asserts a city off
`GET /v1/cities` is refused now **passes** the write and fails the assertion:
that refusal is gone, and only the missing `countryCode` is still a 400.

### What did **not** change

The gate's *sequence* — `/gate/scan`, `/amount`, `/confirm`, the polling and the
error codes — is exactly as it was; only `pointsCapped` left the receipt (§7).
Vouchers, gift cards, stamp cards, rewards, deals and their funnel, the guidebook,
the converter, referrals, leaderboards, notifications, push registration, the
per-venue consent routines, and every partner endpoint are untouched. The two
GDPR *endpoints* are unchanged too — same paths, same request bodies; what moved
is how much the export discloses (§9). So is `GET /v1/wallet/history`: the ledger
entries still carry an `expires_at` field, and every new one is `null`. Do not
render it.

Two names on the server side are **deliberately** unchanged, and they will
confuse anybody who reads a schema dump: `game_sessions.life_spent` and
`daily_counters.lives_used` are the columns energy is recorded in. Renaming a
column needs a version-guarded table rebuild against a live database and buys
nothing a player can see, so both names stayed historical. No API field is named
after either of them.

### A checklist for the two test files

- [ ] `test/protocol_test.dart`: recapture `/v1/games/state`,
      `/v1/games/sessions`, `/v1/games/sessions/{id}/finish`, `/v1/wallet`,
      `/v1/me` and `/v1/gate/…/confirm` from a freshly booted server. Those six
      are the ones whose keys moved.
- [ ] Any model with a required `expiringSoon`, `pointsCapped`, `phoneVerified`,
      `decay`, `mistakesAllowed` or `headline` field: make it gone, not optional.
      A field that is never sent is not a nullable field, it is a field that does
      not exist.
- [ ] Every hardcoded scoring figure in the app or its fixtures: all four tables
      moved (§3). The ones most likely to be sitting in a test are `+5` for a
      clean quiz sweep, the 40/70/110-second memory bands, and 1 point a gap.
- [ ] Any assertion that a quiz round ends, or is `won: false`, after two wrong
      answers. There is no mistake limit; `won` means all five correct.
- [ ] Any comparison of a locally-totalled score against `score`. Halves are real
      now, and the server floors once at the end — an app that floors per item is
      a point low on Pro and Premium and exactly right on free.
- [ ] Grep the app for `no_lives`, `livesLeft`, `daily_lives`,
      `life_regen_minutes`, `round_decay` and `resetsAt`. Every hit is a bug, and
      the first of them is the one that fails silently.
- [ ] Grep the app for `headline`. Every hit is a field the server neither sends
      nor reads — the write side fails silently, which is the worse half.
- [ ] Grep the user model for `status`. If it has one, it is either the account
      state or somebody's mis-named `occupation`; the two must not merge.
- [ ] Any assertion that a city off `GET /v1/cities` is refused: it is accepted
      now, with a `countryCode`. And any assertion that `city` comes back as it
      was sent — it comes back canonicalised (§6).
- [ ] `test/live_test.dart`: the journey now needs `POST /v1/me/onboarded` before
      it can assert a non-zero starting balance, and its game assertions need the
      new raw scores with no decay factor applied to them.
- [ ] Any assertion that energy is unchanged after a **won** round: it is one
      lower. A journey that finishes four rounds on a fresh free account now
      ends on an empty tank — inside one test run nothing regenerates, two
      hours being what a refill costs — so a fifth `POST /v1/games/sessions` is a
      `409 no_energy`.
- [ ] Any assertion that a fourth Word Builder hint or a sixth assistant ask
      succeeds. Both are 403s now.
