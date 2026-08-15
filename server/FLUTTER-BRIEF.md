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
   Do not hand-write the client. It is 121 operations and it will drift.
3. **The two PDFs in `new-data/`** — *context, not a work order.* They describe
   what the **server** must do and why. Reading them will make you build better
   screens; implementing from them will give you a second, disagreeing copy of
   the points rules.

Run the backend locally:

```bash
npm install
npm run server        # http://127.0.0.1:8787 — migrates, seeds and imports on first run
npm run verify:api    # 284 checks, if you want to see what it guarantees
```

---

## Stop calculating, start asking

This is the single most important change, and it applies to code that already
works today.

**The server decides. The client displays and requests.** Anywhere the app
currently computes any of the following, delete that code and read the value
from the API instead:

- points earned from a round, a scan or a referral
- the streak, whether it continued, whether a freeze was spent
- lives remaining
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

| # | Game | `gameType` | What it is |
| --- | --- | --- | --- |
| 1 | Brain Games | `brain` | 5 questions, 12 s each, 1 mistake allowed, +5 per correct |
| 2 | Guess the Flag | `flags` | 5 questions, 6 s each, +2 per correct. `prompt` is an **ISO country code** — build the flag emoji from it (snippet in `API.md` §5) |
| 3 | Country & Capital | `capitals` | 5 questions, 6 s each, +2 per correct |
| 4 | Poland Quiz | `poland` | 5 questions, 8 s each, +1 per correct |
| 5 | Squawk's Flight | `flight` | The arcade round. Endless side-scroller, fly through gaps, one crash ends it. 5 gaps banks the round and every gap past that pays another 2 — the only game whose ceiling is skill |
| 6 | Memory Match | `memory_match` | 6 pairs. **No clock and no fail state** — deliberately the accessible one. Scored on how few moves it took |
| 7 | Word Builder | `word_builder` | 5 words from scrambled letters. Base + difficulty + first-try + speed bonus; a hint keeps the base and drops the bonuses |

Notes that decide whether these feel right:

- The banks are on the server: 196 flag questions and 196 capitals, in English,
  Polish, Russian and Uzbek. You do not ship question data.
- Memory Match never sends the layout — you get `{cards, pairs}` and report pairs
  of positions. Do not hold the deck.
- The flight is the one game with no answer key. Report `{cleared}` to `/finish`;
  the server clamps it.
- Lives are shared across all seven and reset at local midnight.
- A round's result comes back with `streak`, `freezes` and `balance` — show those
  from the response, do not recompute them.

**Done when:** all seven play, score identically to the website, and the app
holds no answer, no deck and no scoring table.

---

## 3. Wallet

Points, vouchers, stamp cards, rewards, gift cards, and the ledger history —
`GET /v1/wallet` and `GET /v1/wallet/history`.

- Converting points to a voucher: `POST /v1/vouchers` with a `tierId` from the
  venue's ladder. Tiers carry `available` — when a venue's budget is low the top
  tier closes first and the lowest stays open, so **offer the lower tier rather
  than showing an error**.
- Gift cards: `POST /v1/gift-cards`.
- `expiringSoon` on the wallet: points last twelve months from the day they were
  earned, oldest spent first. Surface it before it bites.

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
  genuinely has nothing; show that rather than filling the space.

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
- **Data sharing is a separate consent, per venue** — `POST /v1/me/sharing/{venueId}`.
  It must be asked for on its own, never bundled into sign-up, and revoking must
  be as easy to find as granting.
- GDPR: export `GET /v1/me/export`, erase `DELETE /v1/me` (requires the account
  email typed as confirmation).
- Subscriptions: app-store purchase → `POST /v1/billing/receipt` with the
  receipt. **Send the receipt, never a plan name** — entitlements are granted
  only after the server validates it.

---

## Definition of done, overall

- No reward, discount, streak, life or balance is computed on the device.
- No answer key, deck layout or target word is ever on the device.
- Every value-moving request carries an `Idempotency-Key`.
- Scans and plays queue offline and flush with `clientTs`, without
  double-submitting.
- All seven games play and score identically to the website.
- Every error code in `API.md` §2 has a message someone at a till can act on.
- Amounts are integers in minor units, everywhere, with no exceptions.

## What to ask about rather than guess

- Whether the app should offer partner mode at all in v1, or ship
  consumer-only.
- Which of the seven games are already good enough to leave untouched apart from
  the server protocol change.
- Push: the Firebase and APNs credentials are not set up yet, so the register-a-
  token call works but nothing is delivered until they are.
