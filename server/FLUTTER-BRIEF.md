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
   Do not hand-write the client. It is 142 operations and it will drift.

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
**Every game is now normalised onto one 0–100 `performance` scale**, and the
points come out of that scale by one formula — see §23, which is the authoritative
version of everything in this section. The figures below are **performance**, not
points; do not print any of them as a reward.

| # | Game | `gameType` | What it is | Performance (0–100) |
| --- | --- | --- | --- | --- |
| 1 | Brain Games | `brain` | 5 questions, 12 s each. **No mistake limit — a quiz cannot be lost** | **20 per correct** → 100 at 5/5, plus **+5** (capped into the 100) if all five were answered within 25 s |
| 2 | Guess the Flag | `flags` | 5 questions, 6 s each. `prompt` is an **ISO country code** — build the flag emoji from it (snippet in `API.md` §5) | as above |
| 3 | Country & Capital | `capitals` | 5 questions, 6 s each | as above |
| 4 | Local Quiz | `poland` **or** `uzbekistan` | 5 questions, 8 s each. **One card, two banks** — send the type that matches the country on the player's profile; see below | as above |
| 5 | Squawk's Flight | `flight` | The arcade round. Endless side-scroller, fly through gaps, one crash ends it. 5 gaps decides whether the round was *won* | `min(100, obstacles × 4)` — **25 obstacles is a perfect round** |
| 6 | Memory Match | `memory_match` | **6 pairs. No fail state** — deliberately the accessible one — and scored on **moves**, with a 90-second limit | **60** for clearing the board, plus by moves used: ≤10 **+40**, 11–14 **+25**, 15–18 **+12**, 19+ **+0**. Incomplete at 90 s → `pairs / 6 × 50` |
| 7 | Word Builder | `word_builder` | **3 words** from scrambled letters (it was five) | **33 a word** (all three → 100), **+4** per word solved under 30 s, **−10 per hint**, clamped 0–100 |

**Seven cards, eight `gameType` values.** Row 4 is one game with two question
banks: `poland` and `uzbekistan` run the identical protocol, score by the
identical rules and differ only in which country they ask about. **Pick between
them by `countryCode` on `GET /v1/me` and render a single card** — do not put both
in the grid. A player in Kraków has no use for a quiz about Samarkand, and a menu
that grows by one card every time the product reaches another country is a grid
that stops fitting on a phone. `countryCode` is nullable, so decide what an
account with no country sees rather than sending `null` into a switch and
rendering nothing; the site's own answer is the market it is in.

Then the server turns that performance into points, by the points rulebook's
master formula (§4.1) and nothing else:

```
base  = max(2, round(performance / 100 × 18))       // 2..18
      × 1.5   if this is the day's featured game    // once per day
      × decay(roundToday)   1 · 0.65 · 0.45 · 0.3 · 0.2 · 0.12
      × points_multiplier   1 / 1.25 / 1.75
      + perfect 10 + first-ever play of that game 25 + personal best 8
score = max(1, round(that))
```

- **`points_multiplier`** (1 / 1.25 / 1.75) is a **game-round rule only**. It is
  not applied to a scan, a first visit, a stamp card or a new category — those
  have four named entitlements of their own. It multiplies the base and **not**
  the three flat bonuses.
- **A round is worth much less than the one before it.** The decay curve counts
  the player's *paid* rounds of the day: the first is worth full, the second 65%,
  the sixth 12%. This is the thing to draw honestly — it is the difference
  between "you played badly" and "come back tomorrow", and those are two
  completely different things for a player to do about it.
- **`decay` is back on the finish response**, along with `roundToday` and seven
  other fields that itemise the round. A model that deleted `decay` when it went
  away needs it again; see §23.
- **A finished round never pays zero.** The floor of 2 on the base means trying
  always beats not trying, and the floor of 1 on the total means even a decayed
  empty round pays something.

Notes that decide whether these feel right:

- The banks are on the server: 196 flag questions and 196 capitals, in English,
  Polish, Russian and Uzbek. You do not ship question data.
- **A quiz cannot be lost.** All five questions are asked however the first four
  went; there is no mistake limit and `mistakesAllowed` is gone from the round's
  `content`. Any hearts-remaining row on a quiz screen is dead — delete it, do
  not draw it full. `won` on a quiz now means **all five correct**, and
  `won: false` means "not a clean sweep" rather than "forfeited".
- **The quiz speed credit is on the whole round and is no longer gated on a clean
  sweep**, timed from the first event the server recorded to the last. There is no
  duration to report. Draw the timer against `content.speedWithinSeconds` (25) and
  label it with `content.speedCredit` (+5 *performance*, not points) — and note the
  credit is **capped into the 100**, so it changes nothing on a 5/5 round and
  separates a fast four-of-five from a slow one.
- **A band boundary is inclusive**: `speedWithinSeconds` and `throughMoves` are
  both compared with `<=`. Twenty-five seconds exactly still earns the credit; ten
  moves exactly is still Memory Match's top band.
- **Memory Match is scored on moves now, not on the clock.** A move is one `pair`
  event; a `peek` is **not** a move, so peeking the first card of a move — which is
  what a normal client does — costs nothing. Clearing the board is 60 performance,
  and the moves band on top of it is `content.moveBands`. There is still a clock,
  and it is a **limit** rather than a rate: `content.limitSeconds` (90), past which
  an unfinished board scores `pairs / 6 × 50` and `won` is `false`. That is the one
  number in this game a client has to act on rather than display.
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
    stopwatch has been showing all along. Under move-based scoring this matters
    even less: a peek is not counted at all.
- The flight is the one game with no answer key. Report `{cleared}` to `/finish`;
  the server caps the **performance**, not the gaps. It is `min(100, obstacles ×
  4)`, so **25 obstacles is a perfect round** where the old 20-point ceiling was
  forty gaps out. The client-side speed ramp is what makes the back half of that
  earned rather than waited out. The ramp is yours; the price of an obstacle is the
  server's. A claim the round's own duration could not have produced is still
  clamped, silently.
- **There are no halves any more, and the rounding moved.** Both fractional rules
  are gone — a word is not worth its tier and a gap is not worth half a point — so
  every performance is a whole number. The one rounding step is at the **end** of
  the formula and it is a **round**, not a floor, because the published payout
  table is computed that way: 70% as the featured game is 13 × 1.5 = 19.5 and pays
  20. Show `score` off the response and do not recompute it.
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
- **That pair is what bounds how many rounds a day holds** — the decay curve is
  what bounds what they are worth, and the two are different limits rather than
  two copies of one. Read together they give the day's size — 12 rounds a day
  sustained on free and 16 from a full tank, 24/30 on Pro, 48/58 on Premium. It
  is worth drawing honestly: it is the number a player plans an evening around,
  and it is what a paid plan is actually sold on. **All six of those figures have
  just moved** (from 6/10, 8/14, 12/22), because the intervals were cut hard
  while the ceilings stayed put.
- **An empty tank can now play for nothing, and the app decides whether to offer
  it.** `POST /v1/games/sessions` still refuses with `no_energy` exactly as it
  does today — nothing about the current out-of-energy screen breaks. Send
  `practice: true` on that call and the empty tank opens the round instead: same
  questions, same events, same scoring, and it banks **nothing** — no points, no
  ledger entry, no streak, no freeze, no energy. The session and the finish both
  carry `paid`, and that is the field to branch on, because a practice round and
  a round somebody got everything wrong on both come back `score: 0` and are
  otherwise identical. Whether a round pays is fixed when it **starts**, so
  `paid: false` at the session is `paid: false` at the finish however long the
  round runs; and `practice` is ignored when there is energy in the tank.

  The reason it exists is worth having with the flag: an empty tank was the one
  state of this product with nothing in it to do, and "come back in two hours" is
  the screen people close the app on. Energy still buys everything it bought —
  points, the streak, the board — it just no longer buys permission to play. The
  web app already does this: the Play button reads "Practice", the round carries
  a banner saying it pays nothing, and the result card explains its own zero.
- **Word Builder is three words a round now, not five**, and `content.words` has
  three entries — a screen that drew five slots draws two empty ones. A word is
  worth **33 performance** (all three → 100), `tier` still arrives and no longer
  prices the word, and hints are capped per day by `word_hints_per_day`
  (3 / 6 / 10). Past it the hint event is refused with `entitlement_required`,
  carrying `limit` and `used`. **A hint costs a flat −10 performance**, where it
  used to halve that word's points — so a fast, solved, three-hint round lands at
  70 rather than at whatever the tiers happened to be.
- A round's result comes back with `streak`, `freezes`, `energyLeft` and
  `balance` — show those from the response, do not recompute them. It now also
  comes back with **nine fields that itemise the score**, which is what the result
  screen should draw instead of one number. §23 has them.

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
- **Three things an operator can now do to a live app session, and none of them
  changes a shape you call.** The web console gained a write half (`C7` in
  `server/API.md`) — every endpoint in it is `auth: 'admin'`, so there is nothing
  new for you to *call*. What is new is three states your session can be put into
  from outside, all of which look like an ordinary failure and none of which the
  app can prevent:
  - **Suspended or closed account, or a password an operator reset.** All three
    revoke every session the account holds, so the next request is a **401 in the
    middle of a working app**. Whatever you do for an expired token is the right
    behaviour here — sign out cleanly and land on the sign-in screen. What you
    must not do is retry, or treat it as an outage; a banned account signing in
    again gets refused, and that refusal is the message worth showing.
  - **A venue that has been taken down.** It is archived rather than deleted, and
    every read of it 404s: a saved deal, a bookmarked venue sheet, a QR at a
    counter somebody has not cleared yet. Handle a 404 on a venue or deal the
    app already holds as "this is gone now" rather than as an error state, and
    drop it from the list rather than showing an empty sheet.
  - **An offer that stopped being live.** `GET /v1/deals` already only returns
    live ones, so a cached card is the case to think about — a claim against an
    archived deal is refused, not silently accepted.


---

## 9. Turning up — the daily check-in and the calendar

A second earning surface, and the first that pays for nothing but opening the
app. Two endpoints, and it needed no migration: `check_in` and `streak_milestone`
have been legal `points_ledger.reason` values since the table was written, and a
check-in **is** its ledger entry. There is no check-in table and no streak
column, which is why none of the figures below can drift from the balance.

**The screen is one read.** `GET /v1/daily` returns the streak, the seven-day
run-up, the month's grid and the legend under it together, because they are four
answers to one question — *should I open this tomorrow* — and fetching them
separately means drawing a calendar beside a streak read a second earlier.

**Two fields are the server's and must not be recomputed.** `today` is the day a
check-in is keyed on, and `dayTurnsAt` is when it ends. Count down to
`dayTurnsAt`; a client that works out its own midnight will tell somebody their
streak broke while the server still thinks it is alive. That field is also the
answer to the app's standing "streak expiry" gap, at least for this screen.

**`days` and `monthSources` are earnings, not check-ins.** The question the
screen answers is *where is this balance from*, and the five points somebody
tapped for are one row of that answer. Every positive ledger entry in the month
is bucketed into one of seven kinds — `check_in`, `streak`, `games`, `visits`,
`stamps`, `invites`, `bonus` — each carrying its own `label`. **Print the
`label`.** A client with its own table of names is a client that prints a raw
reason the day the server grows one it has not heard of; `kind` is stable and is
for picking a colour, not a word.

Spends are not in that legend. A redemption is a real entry and belongs in
`GET /v1/wallet/history`; a legend that answers "where did points come from" and
then subtracts a voucher is answering two questions at once and totalling neither.

**The ladder.** A day pays `dailyCheckIn` times a rung of `[1, 1, 1, 2, 2, 2, 4]`
— 5, 5, 5, 10, 10, 10, 20 at today's figures, 65 for a perfect week and about 280
a month. The eighth consecutive day is rung one again; a missed day restarts at
rung one. The whole ladder is on the response, so no client needs the shape.

**Milestones pay once in a lifetime**, not once per streak: 7 → 50, 30 → 250,
100 → 1000, each as its own ledger entry beside the check-in, so a balance that
jumped by 70 has two rows explaining it rather than one nobody can check. A
streak that breaks at ninety and climbs back to seven does not pay the seven-day
bonus again, and `milestones[]` says which have been paid.

**Claiming is safe to send twice, and two different guards make it so.** A second
*claim* the same day — a tab left open overnight, a second device — answers
`granted: false` with the day's real figures rather than failing, because
"already done" is a success from the caller's side. A retried *request* carrying
the same `Idempotency-Key` is replayed from store and never reaches the domain,
which is what hands a phone that lost the first reply the original body rather
than a second, truthful-but-different one. **Send the key.** There is no way to
claim a day that has gone.

**There is a streak reminder, and it is an inbox row like any other.** An hourly
job writes one notification per account per day, `kind: 'streak'`, once the
server's day has `CONFIG.earn.checkInRemindHoursLeft` (6) or fewer hours left and
only for accounts with a **live streak and an unclaimed day** — somebody who
never checked in is not missing anything, and somebody whose streak broke last
week would be getting a bereavement notice. Title: *"Your 7-day streak ends in 5
hours"*. Body: *"Check in to keep it. Today is worth 5 points."*, with the real
figure.

It carries `actionUrl: '#/daily'`. Resolve that against your own destinations —
the whitelist, not the string — and send it to the daily-rewards screen. The row
is written **even when the push is suppressed** (no permission, preference off,
quiet hours, frequency cap), because somebody opening the app tomorrow should
still see what they missed; `suppress_reason` says which of the four it was.

**This streak is not the games streak.** The one here counts days *opened*; the
one on `GET /v1/games/state` counts days *played*, moves only when a round is
banked, and is the one with the freezes. They are two rules about two behaviours
and they will disagree. Name them differently on screen — "check-in streak" and
"play streak" — or neither number means anything to the person reading it.

## Definition of done, overall

- No reward, discount, streak, energy count or balance is computed on the device.
- No answer key, deck layout or target word is ever on the device.
- Every value-moving request carries an `Idempotency-Key`.
- Scans and plays queue offline and flush with `clientTs`, without
  double-submitting.
- All seven games play and score identically to the server.
- Every error code in `API.md` §2 has a message someone at a till can act on.
- Amounts are integers in minor units, everywhere, with no exceptions.
- Nothing on screen says points expire, that there is a daily points cap, that
  energy comes back at midnight, that a quiz round can be lost or that mistakes
  are limited, or that a number has been verified. Nothing says "heart" at all.
- **A repeat round does pay less** — the decay curve counts paid rounds of the day
  (§23) — and the result screen says so from `decay` and `roundToday` rather than
  from a rule of its own. The old *per-game* version of that copy is still dead:
  playing a different game does not reset it.
- **The result screen itemises the round** rather than printing one number:
  performance, base, featured, decay, plan, and the three flat bonuses. Nine
  fields arrive for exactly this.
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

- **Superseded by §29: starting costs one, and finishing costs nothing more.**
  Read `energyLeft` off the start response.
- **An abandoned round costs nothing.** *(Superseded by §29 — it costs one, and
  is refunded only within 5 seconds of the start, once a day.)* A dropped connection mid-round is the one
  failure the player definitely did not choose, so it takes nothing with it. Do
  not "helpfully" post a finish to tidy up a stale session; that is the one thing
  that turns a free failure into a charged one.
- **The refusal is enforced at the start** (§1d), because finding out at the end
  means finding out after the round was played.

### 3. The games — `decay` is **gone**, `capped` always was 0, **every scoring table moved**, and `gameType` gained a value

> **Superseded by §23 on both counts that matter.** `decay` came *back* — it is a
> field on the finish response again, with a different meaning (rounds of the day,
> not repeats of one game) — and every scoring table in this section moved again.
> Read §23 for the current figures. The rest of this section is still accurate and
> still worth reading: the `mistakesAllowed` removal, `won` meaning a clean sweep,
> the `uzbekistan` enum value, and the Memory Match `peek` move are all unchanged.

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
| `GET /v1/daily?month=YYYY-MM` | user | The whole daily-rewards screen: `{ today, dayTurnsAt, claimable, claimedToday, todayPoints, todayBonus, streak, longestStreak, atRisk, cycleDay, ladder[], milestones[], nextMilestone, month, monthTotal, monthSources[], days[] }`. See §9 |
| `POST /v1/daily/check-in` | user, idempotent | `{ granted, day, dayTurnsAt, points, bonus, total, milestone, streak, longestStreak, cycleDay, tomorrowPoints, balance }` |

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

### 12. `GET /v1/partner/venues/{id}/overview` — its `budget` block **grew**

Additive, so nothing decodes worse than it did; it is here because it is the fix
for a real crash and you may want the fields.

`GET …/{id}/budget` has always returned the two pools *plus* four decorations —
`tiers`, `averageCheck`, `rebalanceHint`, `tolerance`. `GET …/{id}/overview`
returned the bare pools under the same field name, which is a different type
wearing one name, and it cost the website its entire partner dashboard: the
overview screen reads `budget.averageCheck.minor`, got `undefined`, and a
`TypeError` thrown in render unmounts the whole view. Both routes now return the
same body.

```diff
  "budget": {
    "id": "bdg_…", "venueId": "…", "period": "2026-09", "currency": "PLN",
    "total": 20000,
    "loyalty": { "allocation": "loyalty", "base": 12000, "spent": 0, … },
    "voucher": { "allocation": "voucher", "base": 8000,  "spent": 0, … },
+   "tiers": [ { "id": "vtr_…", "discountPct": 5, "pointsCost": 30, … } ],
+   "averageCheck": { "minor": 10000, "source": "category", "samples": 0 },
+   "rebalanceHint": null,
+   "tolerance": 1000
  }
```

If the partner companion has a model for the overview's budget that is *narrower*
than the one for `/budget`, delete it and share the one type. That the two could
be different is what caused this.

### 13. `GET /v1/venues/{id}` — `deals` stopped hiding, `venue.timezone` arrived

Additive in shape, visible on the venue screen. `deals` used to be filtered by
the **reader's** city as well as the venue, so a player whose profile says Warsaw
opening a Kraków café was shown no deals for it. A venue's own deals are now
listed wherever the reader lives; the city board (`GET /v1/deals`) still keeps
to its city. `venue.timezone` is the IANA zone the venue's deal hours and opening
hours are in — format `12:00–14:00` in it, not in the device's zone.

### 14. Notifications: two new `kind`s, and scheduled pushes are really sent

Nothing sent a scheduled deal push before; now a job does, every few minutes.
Expect in the inbox (and as pushes, where permission, quiet hours and the
frequency cap allow):

- `kind: "deal_push"` — `source_kind: "hot_deal"`, `source_ref` the deal id,
  and the notification's `push_id`. **Send that push id back** on the open:
  `POST /v1/deals/{id}/events { kind: "open", pushId }`. It is how the partner's
  "opened" figure is counted.
- `kind: "venue_reminder"` — a venue reminding somebody who holds an unused
  reward or voucher there. Open the wallet on it.

A kind the app does not recognise should still render as a plain inbox row.

### 15. `PATCH /v1/me` — `null` now clears

Additive. An explicit JSON `null` clears `avatar`, `phone` and `occupation`, and
`city: null` clears the city **and** `countryCode` together (a `countryCode` sent
beside `city: null` is a 400). `null` for `name`, `username`, `birthDate` or
`language` is a `400 validation_failed` naming the field. **An absent key and an
empty string still mean "leave it"**, so an app that resends its whole profile
behaves exactly as before. Clearing never takes back the profile-completion
bonus. `PATCH /v1/partner/venues/{id}` follows the same rule for `subcategory`,
`address`, `priceRange`, `phone`, `email` and `imageUrl`.

### 16. The gate: a timed-out scan no longer blocks the customer

Same sequence, same codes. A pending transaction past the 15-minute limit used to
stay `pending` after its own confirm was refused with `expired` — the refusal
rolled the cancellation back — and until a sweep ran the customer's next scan
there was a `409 conflict`. Now the timed-out transaction is `cancelled`, a new
scan cancels a stale one instead of refusing, and `GET /v1/venues/{id}/pending`
lists only transactions that can still be confirmed.

### 17. Partner companion — values that were wrong, and fields that grew

| Call | Change |
| --- | --- |
| `GET …/venues/{id}/today` | `period` is the **venue-local day** `YYYY-MM-DD` — it was the month, which was a bug — and counts from the venue's midnight, not UTC's. `timezone` added. `pendingConfirmations` leaves out scans that can no longer be confirmed |
| `GET …/budget`, `GET …/overview` | each `tiers[]` rung gains `issuedCount`, `redeemedCount`, `activeCount`, `spentMinor`, `active`; a rung switched off while its vouchers are out appears with `active: false`, `available: false` |
| `GET …/overview?period=` | `findings` now follow the month asked for; a `period` that is not `YYYY-MM` is a 400 (it was a 500) — also on `/analytics`, `/reach`, `/export` |
| `GET …/campaigns` | rows gain `near`, `available`, `expired`, `reserved_minor` |
| `GET …/push-quota` | gains `funnel: { sent, delivered, opened, cameIn }` |
| `GET …/customers` | rows may gain `tierPct` and `spendTrend` (absent when unknown); an unknown `sort` or `status` is a 400; the status filter now applies before paging |
| `GET …/analytics` | `costPerNewCustomer.excluded` (usually `[]`): the plan fee is converted into the venue's currency, and left out and named when no rate exists |
| `POST /v1/partner/deals/{id}/extend` | a bare `YYYY-MM-DD` runs to the end of that venue-local day; not a date → 400; reviving an **expired** deal needs the publish gates (`403 not_verified` / `entitlement_required`) |
| `POST /v1/partner/campaigns/{id}/status` | resuming can be `403 entitlement_required`, like creating |

New partner endpoints, all venue-scoped and refused for anybody who is not staff
at that venue: `GET …/series`, `GET …/insights`, `GET` and `POST …/remind`,
`GET …/scans`, `GET …/audiences`, `GET …/listing`, `POST …/counter/lookup`,
`POST …/counter`, and `PATCH /v1/partner/campaigns/{id}`. The two counter routes
are the ones the companion app is most likely to want: a cashier types a
customer's `@handle`, a voucher code or a reward code and a bill, and the sale
goes through the gate without the customer's phone. Their shapes are in
`openapi.json`.

### 18. Rate limits are enforced, and `429` is now an answer you will see

Routes that create things or spend things are counted per hour. Over the line
the server answers **`429 rate_limited`** with
`{ retryAfterMinutes: 60, limit: <the hour's allowance> }`.

| Route | Per hour | Counted by |
| --- | --- | --- |
| `POST /v1/auth/signup` | 5 | connection |
| `POST /v1/auth/signin` | 20 | connection |
| `POST /v1/auth/google` | 20 | connection |
| `POST /v1/auth/guest` | 10 | connection |
| `POST /v1/me/password` | 10 | account |
| `POST /v1/games/sessions` | 200 | account |
| `POST /v1/games/sessions/{id}/finish` | 200 | account |
| `POST /v1/daily/check-in` | 10 | account |
| `POST /v1/gift-cards` | 30 | account |

"By connection" is a daily-rotating hash of the caller, not a device id and not
anything stored — so a shared café wifi shares an allowance. The game limits sit
well above what energy allows on any plan; they are there to bound a loop, not a
player. **A test fixture that signs up six accounts in one run now fails on the
sixth**, which is the only one of these a suite is likely to hit.

### 19. `POST /v1/auth/signup` — `acceptTerms`, and why it is optional

A new **optional** boolean. Send `acceptTerms: true` when, and only when, the
person has actually been shown the Terms and the Privacy Policy and has agreed:
it writes two `consent_records` rows stamped with the policy version, and that
pair is the evidence that somebody was asked. Send nothing and the account is
created exactly as before, with no consent on file.

It was briefly **required**, and that was wrong for one reason worth keeping in
mind when you design anything like it: the field was added to the server and to
the web form in the same change, while every copy of this app already on a phone
could not learn it. A gate the shipped client cannot satisfy is a gate that
breaks sign-up for everybody who has not updated. Narrowing it to "web only"
does not work either — `surface` is declared by the client and *defaults to
`web`* when absent, so the exemption would have refused this app too.

So the rule is: the client that asks is the client that records. When the app
grows a terms screen, either send `acceptTerms: true` at sign-up, or record it
afterwards with **`POST /v1/me/consents`** `{ kind: "terms", granted: true }`
and the same for `"privacy"`. `GET /v1/me/consents` reports all four kinds, so
"has this person agreed?" is answerable without guessing from a signup date.

### 20. A voucher rung can now be capped, and a cap is a `409`

`voucher_tiers` gained two optional caps — a total and a per-person one. Both
are `null` on every rung that predates them, which is "no cap". When one binds,
`POST /v1/vouchers` refuses:

| Refusal | Detail |
| --- | --- |
| `409 conflict` — "this voucher has all been claimed" | `{ limit, issued }` |
| `409 conflict` — "you have taken all of these you can" | `{ perUserLimit, yours }` |

`conflict` rather than `budget_exhausted` on purpose: the venue's budget may be
untouched and full, and it is the rung that is finished. Show the person the
rung as unavailable rather than telling them the offer has run out of money.

### 21. More new endpoints

Beyond §10:

| Endpoint | What it answers |
| --- | --- |
| `GET /v1/daily/tasks` | The day's tasks and whether each is done — the thing the home screen's empty box is for |
| `GET /v1/partner/venues/{id}/vouchers` | The register of issued vouchers for the partner companion: status, the count against the cap, the validity window, the redemption history. Holder names are withheld unless that customer shared their profile |
| `GET /v1/media/{entity}/{id}` | A venue or guidance-service image, fetched once by the server and served from our own origin. Use it instead of any `base44.app` URL you find on a row |
| `POST /v1/auth/google` | now also accepts **`provisionalId`**, so a guest's points follow them through Google exactly as they do through sign-up (§8). Previously they were stranded on the provisional row |

`POST /v1/auth/google` takes **`acceptTerms`** as well, and it matters more here
than on sign-up. This route used to write both consent rows unconditionally —
Google shows nobody your terms, so that was a record of a question never asked.
It records only when you send the flag now, and only on the press that creates
the account. Send `acceptTerms: true` from whichever screen actually shows the
documents; a "continue with Google" button on a screen that does not show them
should send nothing, and the account is created just the same.

### 22. Word Builder has a Russian list

`word_bank` carries `ru` as well as `en` and `pl`. The round is still built from
the session's language, so nothing in the request changes — a Russian-speaking
account simply gets a real round now instead of `404 not_found`.

### 23. The games — one **0–100 performance scale**, a decay curve, and nine new fields on the finish

This is the largest change to the games since they arrived, and it is worth
saying plainly what kind of change it is: **nothing about the protocol moved.**
The same endpoints, the same events, the same secrets, the same `paid` and
`no_energy`. What moved is the arithmetic between "here is what happened in the
round" and "here is what it was worth", and the response now shows all of it.

Every game is reduced to one integer — `performance`, 0 to 100 — and one formula
turns that into points. The formula is the points rulebook's §4.1:

```
1.  performance          the game's own result, 0..100          (§5, table below)
2.  base = max(2, round(performance / 100 × 18))                → 2..18
3.       × 1.5           if this is the day's featured game     (once per day)
4.       × decay(roundToday)   1 · 0.65 · 0.45 · 0.3 · 0.2 · 0.12
5.       × points_multiplier   1 / 1.25 / 1.75
6.       + perfect 10  + first-ever play of that game 25  + personal best 8
7.  score = max(1, round(step 5 + step 6))
```

Two things about the order, because both are easy to get wrong and invisible from
a total. **The flat bonuses are added after the multiplier and are not multiplied
by it** — a +25 is 25 on Premium. And **there is exactly one rounding step, at the
end, and it is a round rather than a floor**, because the published payout table
is computed with round-half-up: 70% as the featured game is 13 × 1.5 = 19.5 and
the table promises 20.

**23a. The published payout table.** This is what a player is shown, at decay 1,
before the flat bonuses:

| Performance | Base | As featured | Featured, Premium |
| --- | --- | --- | --- |
| **100%** | 18 | 27 | 47 |
| 90% | 16 | 24 | 42 |
| 80% | 14 | 21 | 37 |
| 70% | 13 | 20 | 34 |
| 60% | 11 | 17 | 29 |
| 50% | 9 | 14 | 24 |
| 40% | 7 | 11 | 18 |
| 25% | 5 | 8 | 13 |
| **0%** (finished, scored nothing) | **2** | 3 | 5 |

All twenty-seven cells are asserted in `verify:api`. **A finished round never pays
zero** — that is what the floor of 2 is for, and it is a good line for a result
card: trying always beats not trying.

**23b. Nine new fields on `POST /v1/games/sessions/{id}/finish`.** All additive —
a client that ignores every one of them sees the body it saw before.

```diff
  {
    "score": 53,
    "capped": 0,
    "correct": 5,
    "answered": 5,
    "won": true,
    "streak": 7,
    "freezes": 2,
    "energyLeft": 3,
    "balance": 1246,
    "paid": true,
    "unpaidReason": null,
+   "performance": 100,
+   "base": 18,
+   "decay": 1,
+   "roundToday": 1,
+   "featured": false,
+   "featuredMultiplier": 1,
+   "multiplier": 1,
+   "bonusPerfect": 10,
+   "bonusNewGame": 25,
+   "bonusPersonalBest": 0,
+   "welcomeRound": false,
    "nearest": { … }
  }
```

| Field | Type | What it is |
| --- | --- | --- |
| `performance` | `int` 0–100 | The round's result on the common scale. 100 is a perfect round in every game |
| `base` | `int` 2–18 | `max(2, round(performance / 100 × 18))`. `0` on a welcome round |
| `decay` | `num` | The rung: `1`, `0.65`, `0.45`, `0.3`, `0.2` or `0.12` |
| `roundToday` | `int` ≥1 | Which **paid** round of the day this was. What `decay` is read from |
| `featured` | `bool` | Whether the ×1.5 applied. **Once per day**, first paid round of the day's game |
| `featuredMultiplier` | `num` | The factor `featured` applied: `1.5` when it did, **`1`** when it did not. Print this rather than a hard-coded 1.5 |
| `multiplier` | `num` | `1`, `1.25` or `1.75`, as it stood when the round was played |
| `bonusPerfect` | `int` | `10` when `performance` is exactly 100, else `0` |
| `bonusNewGame` | `int` | `25` the first time this account ever finishes a paid round of this game, else `0` |
| `bonusPersonalBest` | `int` | `8` for beating their own best in this game, max once per game per day, else `0` |
| `welcomeRound` | `bool` | The one round that bypasses the formula — see 23f |

**Draw the itemisation, not the total.** `score` is the product of six separate
decisions, and a card that prints only the total leaves a player unable to tell a
*bad round* from a *fourth round* — which are two completely different things to
do about it: play better, or come back tomorrow. `decay: 0.2` is also the honest
answer to the only support question this formula generates, which is "why was that
worth 4 when the same round was worth 18 this morning?".

A client that wants to check its own arithmetic:

```dart
final expected = (base * featuredMultiplier * decay * multiplier
    + bonusPerfect + bonusNewGame + bonusPersonalBest).round();
// == score, except on a welcome round
```

`featuredMultiplier` is `1` when the bonus did not apply, so there is no branch and
nothing to hard-code. **Do not hold your own `1.5`**: `FEATURED_GAME_BONUS` is on
the rulebook's §11 list of tunables, and a breakdown row labelled "×1.5" that stops
matching the sum beside it is worse than one that says only "included".

**23c. `decay` is back, and it does not mean what the old one meant.** §3 above
told you to delete the field and any "worth less this time" copy. The field is
back and the copy is needed again — but it is a **different rule**. The old decay
was *per game*: playing `flags` five times paid 100/60/40/20/0 percent, and
rotating seven games defeated it entirely. The new one counts the player's **paid
rounds of the day across all games**, so there is nothing to rotate away from.

`capped` is still sent and is **still always 0**. It is not where decay is
reported and must not be read as such: `capped` meant points taken off a round
already scored, and decay is part of scoring it. Delete any "you have hit today's
limit" copy; there is still no daily points ceiling.

**23d. What each game does to reach its performance.** Every clock here is the
server's own event stamps and every count is the server's own rows. There is
nothing new to report and nothing new for a modified client to invent.

| Game | Performance |
| --- | --- |
| the five quiz banks | **20 per correct** → 100 at 5/5. **+5** when all five were *answered* within 25 s, **capped into the 100** |
| `word_builder` | **3 words** at **33** each (all three solved → **100**, not 99). **+4** per word solved under 30 s. **−10 per hint.** Clamped 0–100 |
| `memory_match` | **60** for clearing the board, plus by **moves**: ≤10 → +40 (100), 11–14 → +25 (85), 15–18 → +12 (72), 19+ → +0 (60). **90-second limit**; incomplete at it → `pairs / 6 × 50` |
| `flight` | `min(100, obstacles × 4)` — **25 obstacles is a perfect round** |

Five things in that table will bite, in order:

1. **Word Builder is three words, not five.** `content.words` has three entries. A
   screen with five slots draws two empty ones. No shape catches this.
2. **Memory Match is scored on moves, not on the clock.** A move is one `pair`
   event; a **`peek` is not a move**, so peeking the first card of a move costs
   nothing and a normally-played board reaches the top band in six. Any
   elapsed-time band UI on this game is dead — but the clock is not gone, it became
   a **90-second limit** (`content.limitSeconds`). Past it an unfinished board
   scores proportionally and `won` is `false`, which is the first time this game
   has had a losing state. A "no fail state" promise on the board is now wrong.
3. **A hint costs a flat −10 performance**, not half a word's tier. `tier` still
   arrives on each word and no longer prices it.
4. **The quiz speed credit is no longer gated on a clean sweep**, is +5
   *performance* rather than +2/+1/0 points, and the window is 25 s rather than
   10/15. It is capped into the 100, so it is invisible on a perfect round and is
   the difference between a fast four-of-five (85) and a slow one (80).
5. **The flight's ceiling is 25 obstacles**, not forty gaps. It was half a point a
   gap capped at 20 points; it is 4 performance an obstacle capped at 100.

**23e. `content` on `POST /v1/games/sessions` — three renamed keys and eight new ones.**
Every game now carries the scale it will be judged on, so no client holds a copy
of a table this server owns. **These numbers are performance, not points.**

```diff
  // quizzes
  "content": {
    "questions": [ … ],
-   "perCorrect": 1,
-   "perfectBonus": 1,
-   "speedBands": [ { "throughSeconds": 10, "points": 2 }, … ],
+   "performancePerCorrect": 20,
+   "speedCredit": 5,
+   "speedWithinSeconds": 25
  }

  // word_builder — three entries in `words` now
  "content": {
    "words": [ … ],
+   "performancePerWord": 33,
+   "speedCredit": 4,
+   "speedWithinSeconds": 30,
+   "hintPenalty": 10
  }

  // memory_match
  "content": {
    "cards": 12, "pairs": 6,
+   "basePerformance": 60,
+   "moveBands": [ { "throughMoves": 10, "bonus": 40 },
+                  { "throughMoves": 14, "bonus": 25 },
+                  { "throughMoves": 18, "bonus": 12 },
+                  { "throughMoves": null, "bonus": 0 } ],
+   "limitSeconds": 90
  }
```

The flight's `content` gained two keys and **`target` did not change meaning**:

```diff
  // flight
  "content": {
    "target": 5,
+   "performancePerObstacle": 4,
+   "perfectObstacles": 25
  }
```

`target` is still the **win** threshold — five gaps, what decides `won` — and
`perfectObstacles` is what a **perfect round** takes. They are two different
numbers and a label reading one as the other prints a wrong figure with nothing to
catch it. "Of N obstacles for a perfect round" is `perfectObstacles`, not `target`.

**A required `perCorrect`, `perfectBonus` or `speedBands` throws on decode** at the
top of every quiz. That is deliberate and is the safer of the two options: the keys
were **renamed rather than re-meaninged**, because a client that went on reading
`perCorrect` as points and found a `20` there would print "20 points a question" on
a round whose absolute ceiling is 18 — a wrong number on every round for ever,
against a decode error on the first round.

`throughMoves` is **inclusive** (`<=`), exactly as `throughSeconds` was. The last
band has `throughMoves: null` and pays nothing extra; read the array, do not index
a fixed length.

**23f. The welcome round still pays fifty, and now says so.** The first finished
round of an account pays a flat **10 per correct answer** and bypasses the formula
completely — the onboarding screen promises fifty points and the master formula
cannot produce fifty from one round of anything. On that round:

- `welcomeRound` is `true`. Branch on this, not on `base == 0`.
- `base` is `0` and all three bonuses are `0` — the formula did not run.
- `featured` is `false`.
- `performance` is still the honest 0–100 figure, so a screen can still say "5/5".
- `score` is `correct × 10`.

It is once **ever**, decided from the server's own secret *and* from this being the
account's first finished round, so a client cannot ask for the rate. The second
round of `flags` is an ordinary formula round — and it does **not** carry the +25
discovery bonus, because the welcome round was that game's first play.

**23g. `GET /v1/games/state` gained `featuredGame` — the card to draw, and the
server is the only thing that can name it.**

```diff
  {
    "energy": { "energy": 3, "max": 4, "nextAt": "…" },
    "streak": 7, "longestStreak": 12, "freezes": 2,
    "answered": 140, "correct": 96,
    "points": 1246,
    "dailyWord": { … },
+   "featuredGame": "capitals"
  }
```

One `gameType`, or `null` if the rotation genuinely posts nothing. **Draw the hero
card off this and delete any local derivation.** Two reasons, and the second is the
one that cannot be worked around client-side:

- The bonus is paid by the server, so the only answer that is *true* is the
  server's. A client rotation and a server rotation that agree today agree by
  coincidence.
- **The local quiz is one slot holding two banks.** `poland` and `uzbekistan` share
  a rotation slot, and picking between them needs the account's `country_code`.
  `featuredGame` is already resolved — an Uzbek account is sent `uzbekistan` and
  never `poland` — so there is nothing left to decide.

It does **not** say whether the bonus is still available today; the poster is the
same all day. `done` on the `daily_game` task is what answers that, and `featured`
on the finish is what confirms a round claimed it.

**23h. The featured game: the flat +20 is gone, replaced by ×1.5 inside the round.**
There used to be a second ledger entry of `+20` for finishing the day's featured
card, on top of whatever the round scored. It is deleted. The featured game is now
a ×1.5 on step 3 of the formula, once per day, on the first paid round of an
eligible game.

Three consequences:

- **One ledger entry per round again.** A wallet screen that expected a paired
  `daily_game` line beside the `game_win` will not see one. Nothing pays
  `source_kind: "daily_game"` any more.
- **It is worth what the round is worth**, from 3 points for an empty round to 27
  for a perfect one, where the flat +20 paid the same either way. Read `featured`
  on the response to draw it.
- **The `daily_game` task became a ceiling.** On `GET /v1/games/tasks` that row now
  carries `exact: false` and the most a featured round could pay — 37 on free, 44
  on Pro, 57 on Premium — so render it "up to N", exactly as `play_round` already
  is. It quoted an exact `20` before. `done` still means the featured bonus has
  been taken today.

**23i. Practice rounds consume nothing, and "nothing" grew.** A practice round
(`paid: false`) already banked no points, no streak and no energy. It now also:
does **not** spend the +25 first-play bonus, does **not** set a personal best, does
**not** take the featured ×1.5, and does **not** advance the decay curve. Its
response carries `performance`, `base`, `decay` and `multiplier` honestly — so a
practice card can say "this would have been worth 14" — and all three bonuses as
`0`, because none was awarded.

**23j. What this does to a day.** A free player's tank is four rounds, and four
perfect rounds are now **18 + 12 + 8 + 5 = 43 points** before bonuses, where the
old tables paid a flat 8 a round for a quiz whatever the order. With the
perfect-round bonus that is 83, and a first day that discovers four new games adds
another 100. The shape to build for is: **the first round of the day is the one
worth drawing attention to, and the fifth is a token.** A "keep playing" prompt
after the fourth round is now working against the economy rather than with it; a
"come back tomorrow" one is working with it.

**23k. Fixtures that are now wrong.** Any assertion of a quiz round at 6–8 points,
a Memory Match board at 3–8, a flight gap at half a point, a Word Builder word at
its tier, a five-word Word Builder round, an exact `20` on the `daily_game` task,
or a `daily_game` ledger entry. Also any test that asserted two rounds of the same
game pay the same — they no longer do, and that is the point.

### 24. Email confirmation — two new endpoints, one new field, and a switch that waits for you

Every email sign-up now gets a six-digit code by email, and the
`POST /v1/auth/signup` response gained `verification` (the shape below, or
`null` if the mail could not be sent — the account is created either way).
Google sign-ins are stamped verified and never get a code.

| Call | Notes |
|---|---|
| `POST /v1/auth/verify/send` | Resend. Returns `{sent, nextSendAt, expiresAt, sends}`. Inside the 90 s cooldown it is **200 with `sent: false`** — show "wait a moment", not an error. After 10 codes: `409 quota_exceeded`. |
| `POST /v1/auth/verify` `{code}` | `{verified, granted}`. Spaces and dashes are ignored. Wrong code: `400 validation_failed` with `attemptsLeft`. Then `409 expired` / `409 cap_reached` (5 wrong answers) — both mean "send a new one". |
| `GET /v1/me` → `user.emailVerifiedAt` | Null on an account with an email = draw the "confirm your email" prompt. Every account older than this change was stamped by a migration. |
| `GET /v1/me` → `user.spendNeedsVerifiedEmail` | New. While true, `POST /v1/vouchers` and `POST /v1/gift-cards` answer **403 `not_verified`** for an unproved address (`remedy` names the send endpoint). |

**The switch is off, and it is off for you.** The server will not refuse a spend
until `PAYLEZ_VERIFY_GATE=on`, and that will be turned on only once the app has
a code screen. Earning — rounds, check-in, the welcome gift, the board — is never
gated. Until then an app user can confirm on the website.

**Done when:** a code field (`autocomplete`/`textContentType` one-time-code),
a resend button that respects `sent: false`, the attempts-left message, and a
`not_verified` 403 on a purchase that opens the code screen instead of a generic
error.

### 25. Referrals — Google sign-up can carry a code, codes got longer, and the payout got stricter

| Change | What to do |
|---|---|
| `POST /v1/auth/google` accepts `referralCode` | Send it on a Google sign-up exactly as on `POST /v1/auth/signup`. Bound only when that press creates the account. |
| Both sign-up responses gained `referral: { applied }` | `null` when no code was sent. A bad code never fails the sign-up — show "that code was not recognised" if you want to. |
| `GET /v1/referrals/codes/{code}` (no auth) | `{ valid }` — check a typed code before sign-up. Case, spaces and dashes are ignored everywhere now. |
| New codes are `PY` + 6 characters (`PY7KQ2MX`) | Old `PY####` codes still work. Do not validate the shape client-side. |
| `GET /v1/referrals` → `pointsEarned` | Now what *this* account was paid (it was double: both sides of each bond). `joined` excludes voided referrals. |
| Payout rule | Both sides are paid on the friend's **first counted visit** — not a scan under the venue's minimum spend, and not at a till the inviter runs. |

The web's invite link is `https://www.pay-lez.com/sign-in?ref=<code>`; if the app
shares a link, use the same shape so it lands in the web form prefilled.

### 26. A ninth game: 2048 (`gameType: "merge_2048"`)

Additive — an app that does not draw the card is unaffected. To add it:

| Step | Shape |
|---|---|
| Start | `POST /v1/games/sessions {gameType: "merge_2048"}` → `content: { board: number[16], size: 4, target: 2048, tileBands, floorPerformance }`. `board` is row-major, `0` = empty. |
| Move | `POST …/events {seq, kind: "move", payload: {dir: "up"|"down"|"left"|"right", from: <moves applied so far>}}` → `{accepted, merge: {board, spawned: {index, value} \| null, score, moves, best, over}}`. Draw `merge.board` — it includes the new tile the server placed. |
| Retry | A move whose `from` is behind the server's count is **not applied**: `accepted: false` with the current board. So resending a lost move is safe. |
| Refusals | `400 bad_request` for a swipe that changes nothing (check it locally first — the slide is deterministic) or an unknown `dir`; `409 invalid_state` once `over` is true. |
| Finish | `POST …/finish` with no report. Scored on the **largest tile** the server's board reached (rulebook §5.7): 2048 = 100, 1024 = 85, 512 = 65, 256 = 50, 128 = 35, 64 = 20, below = 0, no moves = 0. `correct` = milestones reached of `answered` = 6. |

No clock and no move limit: the round ends when `over` is true or the player banks it.
It joins the daily rotation as the last slot (`DAILY_GAME_POOL`), after Word Builder.

### 27. A tenth game: Food Cross (`gameType: "food_cross"`)

A match-three on an 8×8 board of six foods. Additive, like 2048.

| Step | Shape |
|---|---|
| Start | `content: { board: Piece[64], size: 8, kinds: 6, moves: 20, target: 2000 }`. `Piece` is `{ t, s }`: `t` the food 0–5 (−1 for a bomb), `s` 0 plain · 1 clears its row · 2 clears its column · 3 bomb. Row-major. |
| Swap | `POST …/events {seq, kind: "swap", payload: {a, b, from}}` — `a`, `b` neighbouring cell indices, `from` the moves applied so far. Reply `{accepted, food: {board, steps: [{cleared: number[], score, board}], gained, cleared, score, moves, movesLeft, over, reshuffled}}`. `gained` is this swap's score; `score` the round's. Play `steps` out in order (cleared cells, then the board after the fall); `board` is the final one. |
| Rules | A swap must line up 3+ of one food, or involve a bomb. 4 in a line leaves a row/column clearer; 5 leaves a bomb; a bomb swapped with a food clears every food of that kind, with another bomb the whole board. A board left with no move is dealt again (`reshuffled`). |
| Refusals | `400 bad_request` — not neighbours, or the swap lines nothing up (check locally first). `409 invalid_state` — the 20 moves are used. A stale `from` is answered with the current board, not applied. |
| Finish | No report. Rulebook §5.8: `min(100, score / 2000 × 100)`. A food is 5, × the cascade level, ×2 for a step that made a four, ×3 for a five. `correct` = fifths of 2,000 reached, of `answered` = 5. |

The rules are `server/domain/foodCross.ts`; the app can port them line for line for the legality check.

### 28. An eleventh game: Food Ninja (`gameType: "food_ninja"`)

Sixty seconds of foods thrown up from the bottom; slice them with a swipe. No bombs. Additive.

| Step | Shape |
|---|---|
| Start | `content: { flyers: Flyer[], durationMs: 60000, gravity: 1.7, perFood: 2, perfectFoods: 50 }`. `Flyer` is `{ id, kind (0–5), t (launch ms), x, vx, vy }` on a unit field: `x` 0..1, `y` 0 at the bottom. Position at `s` seconds after `t`: `x + vx·s`, `−0.08 + vy·s − ½·1.7·s²`; gone below `y = −0.16`. A food's radius is 0.06 of the field's width. |
| Clock | `POST …/events {seq, kind: "start", payload: {}}` when the round actually begins. The server times every slice from this. Once only. |
| Slice | `{seq, kind: "slice", payload: {ids: number[]}}` per swipe, **1–6 ids**. Reply `{accepted, ninja: {sliced, credited}}`. An id is credited once, only while that food is in the air by the server's clock (±1.5 s), and never after the round's 60 s. Ids outside that are simply not credited. |
| Finish | No report. `min(100, credited × 2)`; `correct` = fifths of 50, of `answered` = 5. |

The server cannot prove a finger crossed a food — the same limit as the flight's `cleared` — but it can refuse every slice of a food that was not in the air, and the score can never exceed the schedule. `server/domain/foodNinja.ts` has the schedule and physics to port.

### 29. Energy is charged when a round **starts** — and Quit has an endpoint

Rulebook §3. This reverses §2's "starting costs nothing; finishing costs one",
and like §2 it changes no shape a decoder sees, so it reaches you as wrong
numbers rather than as a failure.

- **`POST /v1/games/sessions` takes the energy.** `energyLeft` on that response
  is the tank **after** this round's charge (it was "before"). New:
  `energyNextAt` (ISO, or `null` on a full tank) on the start and the finish.
  Set the gauge from the start response; do not decrement locally.
- **An abandoned round costs one.** Quitting no longer saves it.
- **`POST /v1/games/sessions/{id}/abandon`** (no body) — call it on Quit.
  Reply `{abandoned, refunded, energyLeft, energyNextAt}`. Within **5 seconds**
  of the start, **once a day**, the energy comes back (`refunded: true`).
  Idempotent: a round already closed answers `abandoned: false`.
- **Starting a round closes any round still open** for that player, under the
  same rule — so not calling abandon just means the refund window has passed by
  the time the next start closes it.
- Practice rounds (`paid: false`) cost nothing and refund nothing, as before.
- Rounds opened before this deploy are still charged at finish, once.

### 30. Browser push — nothing for the app to do, one thing to know

The website now pushes one thing to browsers: the daily game reminder
(`kind: "daily_game"`, 18:00 on the player's clock, only if they switched it
on). The app is untouched — its `fcm`/`apns` tokens and the inbox work as
before, and `daily_game` rows appear in `GET /v1/notifications` like any
other. The one change: `canPush` now counts only tokens that can carry the
kind, so a `web` token never makes a phone-only kind "deliverable" and an
`fcm` token never makes `daily_game` deliverable. `POST /v1/push-tokens`
also accepts an optional `timezone`; sending the device's IANA zone is
harmless and future-proof.

### 31. Gift cards — real codes, a shelf per country, and two new states

All additive, but two behaviours change under existing shapes:

- **`GET /v1/gift-cards` is filtered to the player's country** when called
  with a token (Poland for a profile with no country). A Tashkent player now
  sees Uzbek venue cards and no Polish brands. New fields per row:
  `country_code`, `kind` (`brand` | `venue`), `venue_name`,
  `validity_days`, `how_to_use`.
- **`POST /v1/gift-cards` returns a real code** from the operator's stock, and
  a row with no codes loaded is `409 conflict` "out of stock" even if it was
  listed — `stock` is now the count of codes left, so show it as such.
- **`GET /v1/wallet` → `giftCards[]`** gains `kind`, `how_to_use`,
  `venue_name`, `used_at`, and `face_minor`/`currency` are now what the card
  was **bought at**. `status` gains `cancelled` (an operator voided it and the
  points were returned) — treat any status other than `active` as spent.
- **New: `POST /v1/wallet/gift-cards/{id}/used`** (no body) — the holder's
  "I've used it". `404` for somebody else's card, `400 invalid_state` for one
  that is not active.

### 32. Five more games: Snake, Canon Numbers, Bounce Ball, Doodle Jump, Zuma

`gameType` gains `snake`, `cannon_numbers`, `breakout` (shown as "Bounce
Ball"), `doodle_jump` and `zuma`. All additive; the energy, practice and finish
rules are the same as every other game. `server/domain/arcade.ts` has every
rule to port, and the web's `src/site/games/arcade.ts` is a line-for-line copy.

| Game | Start `content` | During | Finish `report` |
|---|---|---|---|
| Snake | `{cols: 16, rows: 16, foods: number[512]}` — cell indices; the next food is the next entry not under the snake | nothing | `{turns: [tick, dir][], ticks}` — **replayed** on the server; dir 0 up · 1 right · 2 down · 3 left, applied before that tick's move |
| Canon Numbers | `{board: number[48], cols: 6, rows: 8, turns: 30}` | `POST …/events {kind: "fire", payload: {col, from}}` → `{cannon: {board, hits, turn, destroyed, over}}` — 2048's `from` rule | none |
| Bounce Ball | `{cols: 8, rows: 5, wall: number[40]}` — hit points per brick | nothing | `{broken: number[]}` — brick ids |
| Doodle Jump | `{platforms: number[400]}` — 0..1 across; heights are `doodleHeights` | nothing | `{reached}` — highest platform index + 1 |
| Zuma | `{chain: number[60], shots: number[300], colors: 4}` | nothing | `{cleared}` — **chain** balls only |

Scoring (0..100 performance): Snake 4 a food, Canon Numbers 4 a block, Doodle
Jump 2 a platform, Bounce Ball and Zuma the share of the wall / chain. Snake
cannot be faked (the server plays the turns again, held to the round's own
duration); Canon Numbers is held server-side; the other three are capped by what
the level holds and what the round's duration allows — the flight's rule.

### 33. Directory logos — `image_url` is now always our own URL

`GET /v1/guide/services` rows: `image_url` used to be the raw stored value — a
Base44 address, or a whole `data:` picture inline (100 of them, 1.6 MB of the
response). It is now **an absolute URL on this API**
(`https://api.pay-lez.com/v1/media/service/<id>?v=<hash>`) or `null`, and
`logo` is the same thing as a path. Load either as a normal network image; the
`?v=` changes when the logo does, so it is safe to cache hard. `null` means the
service has no logo — draw your placeholder. Nothing else about the row changed.

### What did **not** change

The gate's *sequence* — `/gate/scan`, `/amount`, `/confirm`, the polling and the
error codes — is exactly as it was; only `pointsCapped` left the receipt (§7).
Vouchers, gift cards, stamp cards, rewards, deals and their funnel, the guidebook,
the converter, referrals, leaderboards, push registration and the per-venue
consent routines are untouched in shape. The partner endpoints grew additively
(§12, §17), `/today`'s `period` value was corrected (§17), and two notification
kinds are new (§14).

**The `/v1/admin/*` routes moved and the app does not touch them.** Removing a
venue or an offer is a real `DELETE` now rather than an archive flag, closing an
account answers with an `outcome`, and three `PATCH`es were added so an operator
can correct a name or a city. None of it is reachable from the app — it is
`auth: 'admin'` throughout — and it is mentioned only so a schema diff does not
look like a surprise. The two
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
      `mistakesAllowed` or `headline` field: make it gone, not optional. A field
      that is never sent is not a nullable field, it is a field that does not
      exist. **`decay` is the exception and has come back** (§23), with a new
      meaning — rounds of the day rather than repeats of one game — alongside
      `performance`, `base`, `roundToday`, `featured`, `multiplier`, the three
      `bonus*` fields and `welcomeRound`.
- [ ] Any required `perCorrect`, `perfectBonus` or `speedBands` on a quiz round's
      `content`: all three are **gone**, renamed to `performancePerCorrect`,
      `speedCredit` and `speedWithinSeconds` (§23e). They throw on decode.
- [ ] Every hardcoded scoring figure in the app or its fixtures: **all four tables
      moved again** (§23), and the figures are now *performance* rather than
      points. The ones most likely to be sitting in a test are the 8-point quiz
      ceiling, the 18/23-second memory bands, half a point a gap, and a word's
      tier. Also any five-word Word Builder round: it is three words now.
- [ ] Any Memory Match assertion about elapsed-time bands, or about the board
      having no losing state: it is scored on **moves** now and a board unfinished
      at 90 seconds comes back `won: false`.
- [ ] Any client-side derivation of today's featured game — off a day number, off
      the daily word, off anything. `featuredGame` on `GET /v1/games/state` is the
      only correct answer, and it is the only one that can resolve the
      `poland`/`uzbekistan` slot for the account (§23g).
- [ ] Any hard-coded `1.5` for the featured bonus, or any flight label that reads
      `content.target` as the perfect-round figure. Use `featuredMultiplier` off the
      finish and `content.perfectObstacles` off the round.
- [ ] Any assertion that a quiz round ends, or is `won: false`, after two wrong
      answers. There is no mistake limit; `won` means all five correct.
- [ ] Any comparison of a locally-totalled score against `score`. There are no
      halves any more and the one rounding step is a **round** at the very end, so
      an app that floors is a point low on the featured and paid-tier cases. The
      response carries every term (§23b) — check against those or not at all.
- [ ] Any fixture with a `daily_game` ledger entry or an exact `20` on the
      `daily_game` task. The flat featured bonus is deleted; it is a ×1.5 inside
      the round, the task is `exact: false` now, and nothing writes
      `source_kind: "daily_game"`.
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
      new performance-based figures **with** the decay curve applied — a journey
      that plays four rounds in a row is playing rounds 1 to 4 of a day and the
      fourth is worth 30% of the first. Assert `performance` where the point is
      how the round went, and `score` only where the point is the arithmetic.
- [ ] Any assertion that energy is unchanged after a **won** round: it is one
      lower. A journey that finishes four rounds on a fresh free account now
      ends on an empty tank — inside one test run nothing regenerates, two
      hours being what a refill costs — so a fifth `POST /v1/games/sessions` is a
      `409 no_energy`.
- [ ] Any assertion that a fourth Word Builder hint or a sixth assistant ask
      succeeds. Both are 403s now.
