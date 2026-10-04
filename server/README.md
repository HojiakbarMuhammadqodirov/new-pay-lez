# `server/` — the Paylez backend

The server-side half of Paylez, built from the two statements of work in
`new-data/`:

- `paylez-backend-technical-spec.pdf` — the consumer mobile app and its partner
  companion mode. Sections are cited as **§n** throughout the code.
- `paylez-desktop-platform-backend-spec.pdf` — the partner dashboard, the
  consumer web app, and platform operations. Cited as **A1**, **B3**, **C2**,
  **Part D** and so on.

It is seeded from the old database: the Base44 export in `new-data/`, thirty-one
CSVs covering the guidebook, the venues, the deals, the people and the rate
sheet. `db/import.ts` is the only file that knows those shapes.

Three of the five question banks come from somewhere else, and it is worth
knowing where. The capitals and flags banks are derived from `CountryCapital` in
the export — **or, when there is no export, from `updates/` as well**: that
directory is in the repository and `new-data/` is not, and an empty flags bank
is what makes the welcome gate a locked door for every new account (see the
block in `db/import.ts`). The **general, Poland and Uzbekistan banks are
hand-delivered exports** and live in `updates/` beside the front end's own copy
of them, so the import reads that directory too. Without one of them
`POST /v1/games/sessions {gameType:"brain"}` is a 404 and the game that draws on
it cannot be played at all — which is a data gap rather than a missing feature,
and the import reports it in its notes when the files are not found.

Five banks and seven games, because **Poland and Uzbekistan are one game.** A
player sees a single local-knowledge quiz and the client picks the bank behind it
from the country on their profile; the server sees two `gameType` values that
score by identical rules and differ only in which questions they draw.

## Running it

```bash
npm run server         # migrate, import if empty, serve on :8787
npm run server:import  # re-import the export and exit
npm run verify:api     # the test suite — 925 checks, no browser, no network
npm run openapi        # regenerate openapi.json from the route table
```

## For whoever builds a client

- **`API.md`** — the flows a spec file cannot express: the gate's four steps,
  idempotency, offline queueing, the games protocol, what counts as a claim, and
  the money/time/language conventions. Read this first.
- **`openapi.json`** — 141 paths, 155 operations, generated from `allRoutes` so
  it cannot drift. Point a generator at it rather than hand-writing a client.
- **`FLUTTER-BRIEF.md`** — the standing instruction for the mobile app, written
  to be handed over whole.

Node 22.18+ runs the TypeScript directly (`--experimental-strip-types` is on by
default), so there is no build step and no bundler. `npx tsc -b` type-checks the
whole repo including this project.

**One runtime dependency, and it is named.** `node:http` for the server,
`node:crypto` for scrypt, HMAC and AES-CMAC, `node:sqlite` for local storage —
and **`pg`**, because production is Supabase Postgres and Postgres speaks a
binary protocol `fetch` cannot. That is the same rule the front end follows for
fonts and geometry, and it matters more here: this process holds the points
ledger, and a supply chain is a thing that can be compromised. The budget is one
dependency at one boundary; Stripe and Claude are both called with `fetch`
rather than their SDKs for exactly that reason.

**Which database is a boot-time decision.** `Db` in `db/db.ts` is an interface
with two implementations — `SqliteDb` beside it and `PgDb` in `db/pg.ts` — and
`boot()` picks from the presence of `PAYLEZ_PG_URL`. Nothing past that line
knows which one answered. Keeping the SQLite driver is what lets this test suite
go on running offline against `:memory:`; Postgres has no such thing.

### Environment

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` / `HOST` | `8787` / `127.0.0.1` | Where to listen. |
| `PAYLEZ_PG_URL` | unset | **Secret.** Postgres connection string. Set means Postgres, unset means the SQLite file below — that is the whole switch, and the rollback. Supabase: the **session pooler** string, not the IPv6-only direct one and not the 6543 transaction pooler. |
| `PAYLEZ_PG_SSL` | unset | `off` only for a Postgres on localhost. Against Supabase the CA is pinned (`db/supabase-ca.crt`) and verification stays on. |
| `PAYLEZ_DB` | `server/data/paylez.db` | SQLite file, used when `PAYLEZ_PG_URL` is unset. `:memory:` for tests. |
| `PAYLEZ_SECRET` | *dev fallback, warns loudly* | Signs QR payloads and sessions. |
| `PAYLEZ_NFC_KEY` | unset | 16-byte hex master key for NTAG 424 DNA taps. |
| `PAYLEZ_ORIGINS` | `http://localhost:5173` | CORS allow-list. |
| `PAYLEZ_BILLING` | `local` | `live` refuses to run without a real adapter. With the Stripe keys set, `live` is what makes checkout real. |
| `STRIPE_SECRET_KEY` | unset | **Secret.** `sk_test_…` moves no real money however live everything else is; `sk_live_…` is the switch that matters. |
| `STRIPE_WEBHOOK_SECRET` | unset | **Secret.** Per endpoint, shown once at creation, and different for test and live. Without it a delivery cannot be verified and is refused — which is correct: a trusted unauthenticated webhook is an endpoint anybody can use to grant themselves a plan. |
| `PAYLEZ_SITE_ORIGIN` | first of `PAYLEZ_ORIGINS` | Where checkout returns the customer to. |
| `PAYLEZ_PUSH` | `local` | Same, for FCM/APNs. |
| `PAYLEZ_LLM` | `off` | `live` lets a model reword the assistant's answer. Off, it composes deterministically. |
| `ANTHROPIC_API_KEY` | unset | **Secret.** The Claude key. Both this and `PAYLEZ_LLM=live` are required; either one alone leaves the model off. |
| `PAYLEZ_LLM_MODEL` | `claude-haiku-4-5` | Which model does the rewording. |
| `PAYLEZ_LLM_MAX_TOKENS` / `PAYLEZ_LLM_TIMEOUT_MS` | `400` / `3000` | Ceilings on one rewrite. Past either, the deterministic sentence is sent. |
| `PAYLEZ_ADMIN_EMAIL` / `PAYLEZ_ADMIN_PASSWORD` | unset | Provisions the one admin at boot. Unset means `/v1/admin/*` is unreachable. |

#### Where the Claude key goes

`paylez.env.example` in this directory is that whole file, ready to fill in and
copy to the host. The two lines that turn the assistant on are:

```sh
# /etc/paylez/paylez.env — server-side, never in the repo, never VITE_-prefixed.
ANTHROPIC_API_KEY=sk-ant-...
PAYLEZ_LLM=live
```

and it is installed and pointed at like this:

```sh
sudo install -d -m 750 -o paylez -g paylez /etc/paylez
sudo install -m 640 -o root -g paylez server/paylez.env.example /etc/paylez/paylez.env
sudo -e /etc/paylez/paylez.env          # fill in the secrets
# systemd unit: EnvironmentFile=/etc/paylez/paylez.env
```

Mode 640 root:paylez, because every secret in that file is spendable by whoever
can read it.

It belongs beside `PAYLEZ_SECRET` and `PAYLEZ_GOOGLE_CLIENT_SECRET`, and the
rule that governs all three is the same one `.env.example` states for the front
end: **a `VITE_` prefix publishes a value.** Vite bakes those into the browser
bundle, so a key with that prefix is readable by anyone who opens the site and
spendable by anyone who reads it. The site never talks to Anthropic — it talks
to this server, and this server talks to Anthropic.

Two switches rather than one, because they answer different questions: the key
says a model *can* be called, `PAYLEZ_LLM=live` says this deployment *wants*
one. A staging box that inherits a production env file does not start spending.

## Layout

```
config.ts            every tunable, with the constraint that set it
main.ts              boot: migrate, seed, import, serve
jobs.ts              the six scheduled rules (releases, lifecycle, renewals,
                     the twice-daily rate sync, …)
verify.ts            the test suite

db/    schema.sql    every entity in §14 and Part E
       db.ts         open, migrate, nested transactions
       csv.ts        an RFC 4180 reader, for the export
       import.ts     the old database → this schema, plus the three game banks
                     that arrive as hand-delivered CSVs in `updates/`


domain/              the rules. React-free, HTTP-free, testable on their own
       ledger.ts     §2   append-only points, FIFO lots. Nothing expires
       checkin.ts    §2b  the daily check-in, and the month by where it came from
       gate.ts       §3   the universal amount-capture gate
       budget.ts     §4-5 the pools: spent / reserved / available
       vouchers.ts   §4   tiers, reserve-debit-release, count caps, gift cards
       campaigns.ts  §5   stamp cards, exact-cost rewards, one per visit
       deals.ts      §6   targeting, funnel, lifecycle, pushes
       games.ts      §7   server-owned answers and scoring
       social.ts     §8   referrals and leaderboards
       notifications.ts §9 inbox, frequency caps, quiet hours
       assistant.ts  §10  grounded retrieval, consumer and partner
       analytics.ts  §12/B9 the estimated-sales pipeline and the findings
       dashboard.ts  B9   the dashboard's day series, till log, insights,
                          reminders, audiences, listing and the counter tool
       profiles.ts   B9a  consent-gated identified customers
       entitlements.ts §12a/B7/D plans, subscriptions, entitlements
       consent.ts    §1.3/1.4 consent records, GDPR export and erasure
       fraud.ts      §13  velocity, trust tiers, disputes
       partners.ts   B1-B6 the authoring surface
       accounts.ts   §1.1 identity, provisional accounts, sessions
       traffic.ts    —    website traffic and the platform activity feed

crypto/              qr + session tokens, AES-CMAC, NTAG 424 verification, scrypt
http/                router, server, input validation, route modules
ports/               the three external boundaries — see below
```

## What is real, and what is an adapter

Everything that decides anything is real and runs. The three boundaries below
need credentials this repository does not have; each has a local adapter so the
system is exercisable end to end, and each names the exact place a live
implementation plugs in.

| Boundary | Real here | Adapter |
| --- | --- | --- |
| `ports/billing.ts` | The whole subscription lifecycle, source reconciliation, entitlement resolution, webhook idempotency | The network call to Stripe / the App Store, and their signature schemes |
| `ports/push.ts` | Every delivery decision: frequency cap, quiet hours, mode tag, partner quota, the honest reach figure | The FCM / APNs connection |
| `ports/llm.ts` | Retrieval, grounding, the deterministic sentence, the model call and the post-check | Nothing — this one is wired. Unset by default; see `PAYLEZ_LLM` above |

NFC is *not* on that list. `crypto/nfc.ts` implements AES-CMAC (checked against
RFC 4493's own vectors), the PICC decryption, the AN12196 session key and the
counter rule. It needs a master key, not a vendor.

## The nine rules worth knowing before changing anything

1. **The balance is derived, never edited.** `users.points_cache` is written only
   by `ledger.ts`, always beside the entry that justifies it, and `reconcile()`
   proves it against the ledger. A reversal is a compensating entry; the original
   row is never touched. (§2.1)

2. **A pool has exactly three states and they exhaust it.** `available` is never
   stored — it is `base − spent − reserved`. `verify.ts` checks the identity
   after every operation, because a bar that does not add up lets an owner commit
   the same złoty twice. (§4.2)

   **And a rung can be capped by *count* as well as by money, which §4 does not
   ask for and needed asking for.** The money cap bounds the spend and says
   nothing about the number: a rung with an unlucky average check can issue
   thousands of vouchers inside a budget, and one account could hold every one
   of them. `voucher_tiers.redeem_limit` and `per_user_limit` are those two
   brakes, `NULL` on both meaning no cap, and the thing an owner wants them for
   is usually not money at all — kitchen capacity, a launch week, fairness.

   **The enforcement is a conditional UPDATE, and nothing here may go back to a
   COUNT.** `claimSlot` writes
   `SET issued_count = issued_count + 1 WHERE issued_count < redeem_limit` and
   reads its own row count. Counting rows and then inserting cannot be made
   race-safe at READ COMMITTED — two transactions both count `N < cap` and both
   insert — and raising the isolation level would turn the second into a
   serialisation failure somebody has to retry. The UPDATE takes the rung's row
   lock, so the loser re-evaluates its own `WHERE` against the committed row and
   changes nothing. That lock is also what makes the **per-user** cap safe with
   no counter of its own: by the time the `COUNT` for that account runs, every
   other issue of the rung is committed or waiting.

   Three consequences, all checked: `issued_count` is the **gate and never a
   reported figure** (every count the dashboard prints comes from
   `issued_vouchers`, and `verify.ts` reconciles the two); an **expired voucher
   still counts**, because the cap is on how many were handed out rather than on
   how many are in a wallet, and a cap that freed a slot on expiry is one
   anybody can walk past by waiting; and the same
   guard-inside-the-write shape now covers **`redeem` and `expireVouchers`**,
   both of which read a row and then acted on it — two tills confirming one code
   at the same instant used to release and debit the pool twice.

3. **Nothing of value exists before the commit.** One gate, four steps, in one
   database transaction. No provisional points, no half-stamped card, no
   "pending" discount. (§3.1, §3.5)

4. **The server owns the answer.** `game_sessions.secret` never leaves
   `domain/games.ts`; the client reports events and is told about one at a time.
   (§7.1)

5. **Money is an integer in minor units, and time is UTC resolved to venue-local.**
   Budget periods, deal windows, quiet hours and "one visit per day" are all the
   venue's clock, via `Intl` in `domain/time.ts`. (§3.4, §15)

6. **Aggregate only, with a minimum cohort — and identified profiles need a
   grant.** Suppression returns a *state*, not a zero. The identified-customer
   queries join `data_sharing_consents` in SQL, so there is no code path that
   reads a customer row without one. (§1.3, §1.4, B9a)

7. **Ask what an account is entitled to, never what it paid.** Every tier
   difference is a key in `plan_entitlements`, which is config. A lapse
   restricts; it never claws back points or deletes data. (§12a, B7, D)

   **And a subscription has a *window* now, which is the whole of how an
   operator's dated tier change works.** `activeSubscription` filters on
   `started_at <= at` and `cancel_at IS NULL OR cancel_at > at`, so
   `assignPlan` expresses "put them on Growth from the first" as two timestamps
   rather than as a scheduled job: the new row starts at the date, the row it
   replaces is stamped to stop at the same instant, and the hand-over happens
   because one query compares two dates. Nothing runs at midnight. Both filters
   are no-ops for every row that predates them — nothing had ever written
   `cancel_at`, and every `started_at` is in the past — which is why this is a
   filter and not a migration.

   Three things travel with it. A granted tier carries **no `renews_at`**, or
   `runRenewals` would take it away in a month and an operator could not tell
   that from a card failing. **Free is a plan**, so removing a tier is assigning
   the lowest-ranked one — one code path, one audit row. And the clock is now a
   *parameter* of `planFor` / `entitlementsFor`, because the default of `now()`
   became a second clock the moment the window existed: `games.finish` scores a
   round by the plan that was in force **when it was played**, which is the same
   rule this server already states for the energy tank.

8. **Everything that authors or moves value is audited**, through the single
   `audit.record`. (Part E)

9. **A website visitor is a daily hash, not a person.** `domain/traffic.ts` is
   the one module neither spec asked for — it answers the operator's own
   question, who is visiting — and it answers it without a cookie, without an
   identifier on the device and without ever storing an IP. `visitor_day` is an
   HMAC keyed on the server secret *plus the day*, so Tuesday's visitor cannot
   be matched to Wednesday's. The cost of that is real and is reported rather
   than papered over: there is no returning-visitor figure for anonymous
   traffic, `overview` returns `anonymousReturningVisitors: null`, and a console
   that renders it as `0` has told the same kind of lie `suppressed` exists to
   prevent. Signed-in visits carry a `user_id`, because that person has an
   account already — anonymous traffic is *counted*, identified traffic is
   *attributed*, and nothing joins the two.

## Consent is recorded when it is given, and never inferred

`signUp` and `linkGoogleAccount` both take `acceptTerms` and both write the two
`consent_records` rows — `terms` and `privacy`, stamped with
`CONFIG.privacy.policyVersion` — **only when it is true**. Both wrote them
unconditionally once, on the argument that the account coming into existence is
the moment consent is recorded. That is true about the moment and false about the
consent: nobody had been asked, and a row saying somebody agreed to a document on
a day they were never shown it is worse than no row, because it is the row that
would be produced as evidence. Google is the sharper case — it shows nobody our
terms — and it records only on the press that *creates* the account, because a
row per sign-in turns evidence into a log.

**Absent is not refused, and that is a decision about clients.** It was refused
briefly and the refusal landed on the one client that cannot be changed: the
shipped phone app does not send the field. The gate cannot be narrowed to the web
either, because `surface` is client-declared and **defaults to `'web'`** — so the
exemption written to spare the app would have refused the app. Refusing bought no
consent; it bought a sign-up that fails for everybody who has not updated.

The asking therefore lives on whichever surface can ask, and the recording
follows it. A client that has not asked creates the account and writes nothing;
`GET /v1/me/consents` reports it ungranted and `POST /v1/me/consents` is how it
arrives later, which is the whole migration path for a client on its own release
schedule.

## The five arcade games, and what each one lets the server know

`domain/arcade.ts`: Snake, Canon Numbers, Bounce Ball (`breakout`), Doodle Jump
and Zuma. They score on the rulebook's single 0..100 scale like the eight before
them, and they are honest about how much of a score the server can vouch for,
which is not the same for all five:

- **Snake is replayed.** The report is the turns, not a count; the server plays
  them on the round's own food list with the same step and counts what that
  game ate, stopping where the ticks would have taken longer than the round
  lasted (`snakeSlackMs`).
- **Canon Numbers is held**, 2048's arrangement: the board is in the secret,
  each `fire` is applied here, the next row comes from the seed, and `from`
  makes a retry harmless.
- **Bounce Ball, Doodle Jump and Zuma are bounded.** Continuous physics, so
  whether a ball touched a brick is the screen's fact. The level is the seed's,
  so a report can only name what exists, and `arcade.bounded` caps it by the
  round's duration at the fastest honest rate (`…PerSecond` + `…Allowance` in
  `CONFIG.games`) — refusing the impossible, not refereeing the plausible.

## Gift cards: real codes, one shelf per country

`domain/giftCards.ts`. A gift card used to be a row with a number on it and a
code this server made up, which no brand would have honoured. It is now a shelf
row with **real codes behind it** (`gift_card_codes`), and two kinds by market:

- **Poland — `brand`.** The operator buys codes from the brand (Allegro, a
  supermarket) and loads them; a player is handed one of those exact codes.
- **Uzbekistan — `venue`.** One venue's own card; there is no brand to buy
  from, so the server generates the codes and the venue honours what it is shown.

Five rules:

- **`stock` is the codes nobody holds**, and it stays the race-safe purchase
  gate (`stock = stock - 1 WHERE stock > 0`, then the oldest free code is bound
  with a guarded UPDATE). Loading adds to it in the same transaction, and boot
  restates it from the codes (`reconcileStock`), so a drift dies at restart.
- **The shelf is per country.** `GET /v1/gift-cards` takes `?country=`, else
  the signed-in player's `country_code`, else Poland for a profile with none;
  only an anonymous caller with no parameter sees every country.
- **A bought card keeps what it was bought at.** `face_minor` and `currency`
  are copied onto `gift_cards`, so editing the shelf reaches the next buyer and
  nobody before them. Validity is per shelf row (`validity_days`), counted
  from the purchase; the daily job marks the passed ones `expired`.
- **"Used" is somebody's word, because the till is not ours.** The holder says
  so from the wallet, or an operator from the console.
- **Cancel refunds and burns.** `status = 'cancelled'` and the points back as a
  new `adjustment` entry (never an edit of the spend); the code is **not**
  returned to the pool, because the player has seen it and may have used it.

`face_minor` is hundredths of the card's currency for every currency, so'm
included — the site's `faceValue` and `npm run verify` pin it.

## Browser push: one reminder, at six on the player's clock

The web gets exactly one push, the daily game reminder (`domain/reminders.ts`),
and only to somebody who switched it on in their profile. It is due at
`CONFIG.push.reminderAtMin` (18:00) in the zone the player's **browser**
reported when it subscribed — not Warsaw, not the server's clock — and is sent by
`jobs.runEveryMinute`, so it leaves within a minute of six. Four rules:

- **Not on a day they played.** Any round started since their local midnight,
  paid or practice, cancels it.
- **Once a day**, guarded by the inbox row itself (`kind = 'daily_game'`,
  `source_ref` = their local day), the pattern `checkin.remind` uses.
- **Not late.** Past `reminderUntilMin` (21:00) a missed reminder waits for
  tomorrow, and the push service drops an undelivered one after three hours.
- **A browser carries only `CONFIG.push.webKinds`.** `canPush` counts a token
  only if its platform can carry the kind, so a browser-only user is
  `no_permission` for a venue's deal rather than queued for a push nothing
  will show — which would also spend their frequency cap.

The transport is `ports/webpush.ts`: RFC 8291 encryption and RFC 8292 (VAPID)
signing over `node:crypto` and `fetch`, no dependency. A 404/410 from the
push service revokes the token. FCM/APNs are still not wired, so in live mode a
non-web row is marked `failed`, honestly, where the local adapter marks it
`sent`. `verify:api` decrypts what was encrypted with the subscription's own
key and verifies the VAPID signature, rather than pinning bytes.

## Email codes: confirmation and password reset

A first OTP flow was removed in `53edbf7` for two reasons: there was no transport
(the code went to the log and nowhere a customer could read it), and the gate was
far too wide (an unconfirmed account could not earn, check in, claim the welcome
gift or appear on the board), so the first restart would have taken all of that
from every live account at once.

It came back (2026-10-03, `domain/verification.ts`, `ports/email.ts`) with the
three changes that note asked for:

1. **A transport first.** `PAYLEZ_RESEND_KEY` sends through Resend's REST API
   (one `fetch`, no dependency) from `PAYLEZ_MAIL_FROM`. With no key the local
   adapter logs the message and keeps it in `email.outbox` for `verify.ts`. **The
   code is never in an API response**, in either mode.
2. **A banner, not a gate — and the gate only on spending.** Buying a voucher
   (`POST /v1/vouchers`) and redeeming a gift card (`POST /v1/gift-cards`) answer
   `403 not_verified` for an unconfirmed address. Earning, check-in, games,
   onboarding, the board and the till are untouched. The gate is **off while
   there is no key** (`PAYLEZ_VERIFY_TO_SPEND=on|off` overrides), so it can never
   depend on a code that goes nowhere.
3. **Existing accounts are not asked.** An account created before
   `PAYLEZ_VERIFY_SINCE` (default `2026-10-03T00:00:00Z`; set it to the deploy
   time) is never gated. Guests (no address) and Google accounts (stamped at
   sign-in) are never gated either.

Codes are six digits, HMAC-hashed at rest, valid 10 minutes, five attempts each, a
60-second resend cooldown and five sends per hour per account. One live code per
account in `email_verifications` serves both uses, because the code proves one
thing — whoever holds it reads that inbox — so a password reset also stamps the
address as proved. The reset routes say nothing about which addresses have
accounts: `reset-code` always answers `{ ok: true }` and sends in the background,
and every code failure on `reset` reads the same. Expired codes are pruned by the
daily job after a day's grace.

## The two controls that are about the database rather than the rules

Everything above is access control at the route: `auth:` on a `Route`, checked
before the handler runs. Two things are not reachable that way and both are
answered where they live.

**A Supabase project publishes its anon key, and RLS is what closes the door
that opens.** Nothing in `src/` speaks Postgres — the browser talks to this
server and this server holds the only connection string — so the obvious
reading is that row-level security has nothing to do here. That is true of
*this repository* and says nothing about the project the database sits in. A
Supabase project serves PostgREST over the `public` schema, authenticated by a
key that is in the project's own API settings and in every client its quickstart
writes, and the default grants to `anon` and `authenticated` are what make that
endpoint answer. A table with RLS off is therefore readable by anybody holding a
URL no line of our code uses.

`db/rls.pg.sql` closes it twice, and either half alone would do: every privilege
revoked from both roles (including the *default* privileges that would hand one
to the next table created), and `ENABLE ROW LEVEL SECURITY` on all 82 tables
with no policy behind it, which denies every row to every role that is not the
owner. It is **generated** by `npm run pg:schema` from the same `schema.sql` the
rest is, because a table added without a line there is a table that is open, and
that is exactly the omission nobody notices; `verify:api` fails while the
committed file and the schema disagree. `migrate()` in `db/pg.ts` applies it on
every Postgres boot, so a table created on this boot is not open until somebody
remembers a script.

It refuses rather than half-applying. Enabling RLS as a role that neither owns
these tables nor carries `BYPASSRLS` locks *this server* out of its own
database, from inside the process that just did it — so the file raises an
exception naming the role and the fix. There is no SQLite equivalent and none is
wanted: a file has no roles, no listener and no PostgREST in front of it, and
the control there is the file's own permissions.

**One rate limiter, declared on the route.** `throttleSignIn` has always bounded
password guesses, keyed on the address typed. Every other public write had
nothing: sign-up could be looped to mint accounts, `POST /v1/games/sessions` to
open practice rounds (which cost no energy, which is exactly why they need a
ceiling of their own), and `POST /v1/me/password` was a password oracle for
whoever held a stolen session. `limit` on `Route` and `domain/limits.ts` are the
answer — the same shape `auth` and `idempotent` take, for the stated reason that
a policy on the route definition is one a new endpoint cannot be added without.
The numbers are `CONFIG.limits`; the key is the account, or the **rotating daily
hash** `domain/traffic.ts` computes, so an unauthenticated limiter cannot
recognise the same connection tomorrow and nothing durable about anybody is
stored to make it work.

Three details are load-bearing. It runs **after** authentication and **before**
idempotency, so a retried request with a stored response costs no attempt — a
phone on a flaky connection retrying one scan is what the idempotency key is
for and would otherwise be the first thing punished. A request that **fails
validation still costs an attempt**, or the cheapest way past a limiter is a
body that cannot succeed. And `createApi({ limits: false })` exists for
`verify.ts`'s surface tour alone, which arrives on one connection and signs up
rather more than five accounts; the limiter is then checked deliberately in
`rateLimits` rather than tuned to accommodate a caller it was not written about.

**And the flight's score is bounded by the server's clock.** It is the one game
with no answer key — the 0–100 performance scale bounds what a run can be *worth*
and says nothing about whether it happened, so a thousand gaps claimed a second
after the session opened reached a perfect round and read in the ledger like a very
good player. Columns arrive on a timer in the client, so the honest gap count is
bounded by the round's own duration, measured from `started_at` to now — two
stamps this server wrote. `CONFIG.games.flightSecondsPerGap` is that timer and
`flightGapAllowance` is deliberately generous slack: the bound exists to refuse
the impossible, not to referee the plausible.

## The economy: energy bounds how many rounds a day holds

The numbers live in `CONFIG.points`, `CONFIG.earn` and `CONFIG.games`
(`config.ts`), and the per-tier figures in the `PLANS` seed in
`domain/settings.ts`. Each carries the constraint that set it. The shape is what
is worth having here, and it is one sentence:

> **Every round costs one energy when it starts, win or lose, and nothing else decides
> how many rounds a day holds.** Energy refills one per `energy_regen_minutes` up
> to `daily_energy`, so a day is `daily_energy + 1440 / energy_regen_minutes`
> rounds from a full tank: **free 12 sustained and 16 in a burst, Pro 24/30,
> Premium 48/58.**
>
> What those rounds are *worth* is the other limit and it is the decay curve —
> `CONFIG.games.decayByRound`, 1 / 0.65 / 0.45 / 0.3 / 0.2 / 0.12 over the paid
> rounds of a day. Two limits rather than two copies of one: **how many, and how
> much.** A free tank of four perfect rounds is 18 + 12 + 8 + 5 = 43 points before
> the flat bonuses, where the flat tables paid 8 a round whatever the order.

Both halves of that are recent and both replaced something. Charging a *win* is
what makes the pool a limiter rather than a decoration — losses only was a tax on
being bad at quizzes, and two of the seven games cannot be lost at all, so it
bounded the struggling player and nobody else. Refilling on a clock is what makes
charging fair: spend the tank at nine in the morning and the wait is an hour or
two, not the rest of the day.

**The charge is taken at the start** (rulebook §3), so an abandoned round costs
one too — charging at `finish` let a player walk out of every round going badly
for free. `startSession` writes `life_spent = 1` on the new row and stamps
`charged: true` into its secret; a round opened before the change has no stamp
and is still charged at `finish`, so a round in flight across the deploy is
charged once. The one way back is `POST /v1/games/sessions/:id/abandon` within
`CONFIG.games.energyRefundWithinSeconds` (5) of the start, at most
`energyRefundsPerDay` (1) a day — the accidental tap. A refund sets
`life_spent` back to 0 and writes an `energy_refund` game event, which is what
the daily count reads. A new start first closes any round the player left open
(`closeRound`), under the same rule, so the refund cannot be dodged by not
pressing Quit.

**The clocks have just been cut hard and the ceilings have not moved**:
`energy_regen_minutes` went 240/180/120 → **120/60/30** while `daily_energy`
stayed at 4/6/10, which took a day from 10/14/22 rounds to 16/30/58. What a plan
buys is now almost entirely the refill: the tank is a burst allowance somebody
spends in the first ten minutes, and the clock is the evening. Six figures moved
with that pair — the sustained and burst rates on all three tiers — and every one
of them is written down in `API.md`, `FLUTTER-BRIEF.md` and `openapi.ts` as well
as here, which is why `verify.ts` asserts all three day sizes off
`plan_entitlements` rather than off `CONFIG` (only the free row is a copy of the
config; Pro and Premium live nowhere else).

`games.energyFor` reconstructs the tank from `game_sessions.life_spent` and
`finished_at` at the instant somebody asks — no scheduler, no refill job, the
same house rule as the balance one table over: derived, never stored.
`no_energy` carries `nextAt` and `max`, and never `resetsAt`.

**An empty tank is no longer a locked door: it is an unpaid one.**
`POST /v1/games/sessions {practice: true}` opens a round on a tank with nothing
in it, and that round banks nothing at all — no points, no ledger entry, no
streak movement, no freeze earned or spent, no comeback payment, no day counted,
no energy taken. Both bodies carry `paid`, because a practice round and a round
that simply scored zero are otherwise the same response. Energy still buys
everything it bought — points, the streak, a place on the board — and the one
thing it no longer buys is *playing*, which was the only state of this product
where a player who wanted to be here had nothing to do.

Three details hold it together. The flag is **opt-in**: without it an empty tank
is still the `no_energy` refusal, so a client that shipped an out-of-energy
screen keeps it until it decides otherwise. `finish` decides paid-or-practice
from the tank **as it was at `started_at`**, not as it is now — energy only
refills, so a long round begun on empty would otherwise finish paid, contradicting
what the screen told the player, and asking `energyFor` about the session's own
start reconstructs exactly the number `startSession` saw without a column to
remember it in. And a practice round writes `life_spent = 0`, which is the column
`energyFor` already filters on, so it is invisible to the tank rather than being
a spend the tank has to be taught to ignore.

**Two column names are historical and stay that way**, which is the thing most
likely to confuse the next reader of `db/schema.sql`:
`game_sessions.life_spent` is the one energy charge for a finished round, and
`daily_counters.lives_used` is the day's tally of them. Renaming a column needs a
version-guarded table rebuild against a live database and buys nothing a player
can see. Both carry a comment saying so at the point of use. No API field, config
key or entitlement is named after either of them — `daily_counters.lives_used`
also cannot stand in for the tank for a reason that is not about its name: it is
bucketed by day, and a regen clock needs an instant.

**Adding a game costs a table rebuild**, which is the other thing worth knowing
about that schema. `game_sessions.game_type` carries a CHECK; SQLite cannot alter
one in place, so `GAME_TYPES` in `db/db.ts` is the list in TypeScript — the route
validates against it and `openapi.ts` publishes it — and `widenGameTypes` is the
version-5 migration that writes it into SQL on a database that already exists.
Without that half, a new type passes every test and fails on every deployed box,
which is the worst shape a schema change can take. `assertGameTypes` reconciles
the tuple against the live constraint on every boot for the same reason
`assertLedgerReasons` does it for the ledger's vocabulary.

### What a round pays

**One scale and one formula.** Seven games, eight `gameType` values, four scorers —
and every scorer answers the same question, which is what this round's
**performance** was as an integer from 0 to 100. Nothing in `domain/games.ts`
except `roundPoints` knows what a point is. This is the points rulebook's §4.1,
and the reason for it is that seven games used to carry seven private payout tables
whose only thing holding them level was somebody having last checked: `poland`
maxed at 5 for the same five questions `brain` paid 25 for.

```
base  = max(2, round(performance / 100 × 18))       → 2..18
      × 1.5 if this is the day's featured game      (once per day)
      × decay(roundToday)   1 · 0.65 · 0.45 · 0.3 · 0.2 · 0.12
      × points_multiplier   1 / 1.25 / 1.75
      + perfect 10 + first-ever play 25 + personal best 8
score = max(1, round(that))
```

Each game's own map onto the scale (rulebook §5), the tables in `CONFIG.games`:

| Game | Performance |
| --- | --- |
| `brain`, `flags`, `capitals`, `poland`, `uzbekistan` | **20 a correct answer** → 100 at 5/5, **+5** when all five were answered within 25s, capped into the 100 |
| `word_builder` | **3 words** at **33** each (a clean sweep is promoted to 100), **+4** per word solved under 30s, **−10 a hint**, clamped 0–100 |
| `memory_match` | **60** for clearing the board plus an efficiency bonus by **moves**: ≤10 +40, 11–14 +25, 15–18 +12, 19+ +0. A **90-second limit**, past which an incomplete board is `pairs / 6 × 50` |
| `flight` | `min(100, obstacles × 4)` — 25 obstacles is a perfect round. Five gaps still decide `won`, not what it pays |

Five things about this are load-bearing:

- **The flat bonuses are added after the multiplier and are not multiplied by
  it.** That is the rulebook's order and it is the only one a result card can
  name: a "+25 for a new game" that quietly pays 44 on Premium is a line nobody
  can check. `ledger.earn` is therefore handed the finished integer with
  `multiplierApplied: true`, so it records the plan factor for the audit trail
  (the GDPR export reads it) without applying it a second time.
- **There is one rounding step, it is the last one, and it is a `round` rather
  than a `floor`.** It used to be a floor inside `ledger.earn`, because two
  scorers returned halves that had to survive to the multiplier; both tables are
  gone and performance is an integer, so there are no halves left to protect. What
  replaced the argument is a **published** table (rulebook §4.2) computed with
  round-half-up: 70% featured is 13 × 1.5 = 19.5 and the table promises 20.
  `verify.ts` reproduces all twenty-seven of its cells.
- **The arithmetic is done in integers scaled by a million.** Three of the six
  decay rungs are not exactly representable as doubles and the last step is a
  round, so a product landing on a .5 boundary would otherwise be decided by
  representation dust — and the published table has cells on exactly those
  boundaries.
- **Every clock and every count is the server's.** The quizzes' and Word
  Builder's speed credits read `game_events.created_at`; Memory Match's move count
  is the `pair` rows and its 90-second deadline is measured from the round's first
  recorded event. A client has no clock and no counter this server is willing to
  read.
- **A band boundary is inclusive, and the field is named for the comparison.**
  `throughMoves` and `speedWithinSeconds` are compared with `<=`. "Under 10" and
  "up to 10" are different rules and a field called `under` compared with `<=` is
  a lie about one of them.

Two of those maps changed the character of their game and the reasons are worth
keeping. **Memory Match moved from the clock to moves**, reversing a deliberate
decision: moves are the one thing a player can optimise away entirely with a
notepad and a stopwatch cannot be, which is true and is the wrong trade for the
one game in the set with no fail state — the accessible one, the one somebody
plays because the quizzes are in a language they are still learning. The clock's
own hole was cheaper than the notepad anyway: two `pair` events a millisecond
apart took the top band. The notepad is now worth 100 against 85, which is 18
points against 15, once, on the one round of the day that pays full. **And a
`peek` is not a move** — it turns one card and is how the shipped client shows the
first card of a move, so counting it would charge two moves for one.

**Word Builder's tier stopped pricing the word.** `word_bank.tier` is still the
only human-set difficulty rating in the product and still decides which words are
dealt; a scale where a hard word pays more is a scale where the round is worth
whatever it happened to deal, and "a round is a round" is the rule the common
scale exists to enforce. A hint is a flat 10 off the round rather than half of
whatever that word was worth, for the same reason: the same tenth wherever it is
spent is a decision, where a share of a tier was a lottery.

**The formula needs exactly one thing stored**, `player_game_bests`, and it is
worth saying what it is not. "Has this player ever finished a paid round of this
game" is already written in `game_sessions`, so the +25 is derived and honours the
history of accounts that predate it. Performance is *not* written anywhere — a
session's `score` is what was banked, which carries the decay, the featured
multiplier and the plan, and is therefore a different number for two identical
rounds — so the best performance per game cannot be recovered and needs the table.

**The welcome round bypasses all of it.** §7.3's flat `welcomeRoundPerCorrect`
(10 × 5 = 50) is what the onboarding screen promises, and the formula's ceiling is
18 before bonuses. The finish reports it as `welcomeRound: true` with a `base` of
0, so nothing has to infer it.

### The six rules this economy used to have and does not

Each of them left prose behind in more than one file, which is why they are
listed rather than simply absent:

- **Points never expire, on any plan.** `runExpiry`, `expiringSoon` and the
  expiry job are deleted, `points_expiry_months` is not an entitlement, and
  `GET /v1/wallet` does not carry an expiry list. The FIFO lots survive because a
  *spend* still has to come out of something — expiry was a consumer of that
  ordering, never its reason.
- **There is no daily points cap.** `Finish.capped` is kept so a client does not
  break on a missing key, and is always 0.
- **There is no *per-game* decay curve** — and there is a per-*day* one, which is
  a different rule and is worth keeping the distinction. The old one paid a repeat
  of the **same game** 100/60/40/20/0 percent on free, and a player rotating the
  seven never met it: per game, its free zero rung was the fifth round of one game.
  `round_decay` stays in `RETIRED_ENTITLEMENTS`, because it was a per-tier
  entitlement and the curve is not one — it is `CONFIG.games.decayByRound`, the
  same six rungs for everybody, counted over **paid rounds of the day across all
  games** so there is nothing to rotate away from. `decayFor` and the `decay`
  field on the finish response are back with that meaning. Energy and the curve are
  not two overlapping limiters: one bounds how many rounds a day holds and the
  other what they are worth, which is two facts a result card can state
  separately.
- **There is no spend bonus.** A bigger bill does not earn more. The venue
  minimum still decides whether a scan counts as a *visit*, which is upstream in
  `gate.confirm`.
- **Energy does not reset at midnight** — and it is not called hearts. The word
  changed with the rule: `CONFIG.points.dailyEnergy` / `energyRegenMinutes`, the
  entitlements `daily_energy` (4/6/10) and `energy_regen_minutes` (120/60/30),
  `games.energyFor`, `energyLeft` on both game bodies, `energy` on
  `GET /v1/games/state`, and `no_energy`. `daily_lives` and `life_regen_minutes`
  are retired alongside `round_decay`.
- **A quiz has no mistake limit and cannot be lost.** All five questions are
  asked however the first four went; `quizMistakes` and the `mistakesAllowed` key
  on the round's `content` are both gone. `won` on a quiz means **all five
  correct** — the only distinction left worth drawing, and the one both quiz
  bonuses are paid on. A round that ended after two wrong answers took the last
  question away from exactly the player who needed the practice.

Two rules about what a paid plan buys, and they are easy to break in opposite
directions:

- **What a visit pays is four named entitlements, not a multiplier** —
  `scan_points` 20/30/50, `first_visit_points` and `stamp_points` 100/150/250,
  `new_category_points` 25/50/100. A venue's own `points_per_scan` overrides the
  first of them, because that is the venue's money.
- **`points_multiplier` prices a game round and nothing else** (1 / 1.25 / 1.75).
  Applying it to a scan as well would pay a subscriber twice for one visit.
  `entitlements.ts` says so at the top; `games.ts` applies it and `gate.ts` must
  not.

The consumer plans are **Free / Pro / Premium** (Plus is retired but not deleted
— a subscription has a foreign key into its plan), and **no plan is sold with a
trial**: every `trialDays` is 0, which is what keeps a paid subscription out of
`trialing`, the one status that would renew on the day it started.

### The profile, and the two things it will not do

`users` carries `username` (unique, folded case-insensitively by
`idx_users_username_norm` rather than by the column's own `UNIQUE`),
`occupation`, `phone`, `birth_date` and `profile_completed_at`. Filling in all
seven answers pays the completion bonus once and stamps `profile_completed_at`,
claimed with `UPDATE … WHERE profile_completed_at IS NULL` so two saves cannot pay
twice — which is the same shape `POST /v1/me/onboarded` uses for the welcome gift,
and for the same reason.

**`occupation` is the field the UI labels "Status", and it cannot be called
that.** `users.status` is the account state — `provisional`, `active`, `banned`,
`erased` — and two columns meaning different things under one name is how a
moderation query ends up reading somebody's job. The label belongs to the person
reading the form and the name belongs to whoever is reading a query at 3am. It is
one of five values (`student`, `worker`, `business`, `freelancer`, `other`) and it
replaced a free-text `headline`, which the version-4 migration in `db/db.ts`
drops: a sentence somebody wrote about themselves is unsearchable, unsegmentable,
untranslatable and a moderation surface, and it earned the product none of those.
The drop counts and reports the non-empty lines it discards before performing it —
a warning rather than a refusal, because a server that will not boot over one
person's "hi about me" is the worse outcome, and what must not happen is losing
them *silently*.

**There is deliberately no `CHECK` on it.** SQLite cannot alter a CHECK in place,
so the day the picker gains a sixth value it would cost a full rebuild of `users`
— the most-referenced table in this schema, with cascades hanging off nearly every
other one — to widen a dropdown. `points_ledger.reason` pays that price because
the ledger outlives every process that writes to it and holds money; a
self-reported status does not. One code path writes the column (`updateProfile`)
and it validates against `OCCUPATIONS`, the same exported tuple the picker is
rendered from, so there is one list rather than two.

**`GET /v1/cities` is a suggestion source, not a whitelist.** It still serves the
same 114 places and is still public — sign-up has to render the choice before an
account exists — but `PATCH /v1/me` and `POST /v1/auth/signup` now take a city
that is not on it, provided a `countryCode` comes with it. A whitelist told
somebody the product has not reached yet that their own city does not exist, over
a field that gates nothing.

What made that safe is `resolveCity`, and its two halves are worth knowing
because both have a cost:

- **A city that matches the table stores the table's own spelling and country,
  and any `countryCode` the client sent is ignored.** That is what keeps `Kraków`,
  `Krakow` and `krakow` on one weekly board — `domain/social.ts` groups on
  `users.city` with a literal `=`, so free text does not produce a *messy* board,
  it produces several, each with one player on it — and it is what stops a client
  writing `Krakow, US`. The cost is one mis-filed country: the table's `Halle` is
  the German one, so somebody in Halle, Belgium is recorded in Germany with no way
  to correct it, on a display-only field.
- **A city off the table is folded and title-cased**, so diacritics, hyphens and
  apostrophes do not survive: `Saint-Étienne` is stored `Saint Etienne`. That is
  the price of `Saint Etienne` and `saint-etienne` being one board rather than
  two, and it is the price the 114 already pay — their canonical names are ASCII
  for exactly this reason. The country is checked for *shape* and never against a
  registry; the only one here is the quiz export's 196 sovereign states, which has
  no Hong Kong, Greenland or Puerto Rico in it.

Nothing revalidates a row already stored — the old database's cities came over as
whatever it held, and a rule applied backwards would make those accounts
unsaveable. Re-sending a legacy value succeeds, because it takes the off-list path
and canonicalises to itself.

Two things that surface is deliberately not:

- **Nothing on it is verified.** `phone_verified` is dropped from `users` by a
  migration in `db/db.ts`, and there is no endpoint that could have set it. A
  reward for clicking a link in an email pays for a formality rather than for
  anything a venue or a player gets, so `CONFIG.earn` has no line for one.
- **A birthday is settable and then correctable once**, enforced by
  `birth_date_changes` — a *kept count*, not a timestamp comparison, because a
  timestamp can only say when the last write happened and the rule is about how
  many there have been. `birthDateChangesLeft` is on `GET /v1/me` so a form can
  grey the field out rather than find out by being refused, and resending the day
  already stored spends nothing.

### The two GDPR rights are generated from one table

`USER_COLUMNS` in `domain/consent.ts` lists every column of `users` with what the
export discloses and what the erasure writes, and both statements are built from
it. They were two hand-written pieces of SQL and had already drifted: the erasure
cleared `username`, `phone`, `birth_date`, `display_avatar` and `occupation`, and
the export mentioned none of them. That is the worse direction of the two — an
erasure that misses a column at least leaves somebody something to complain about
later, while an export that under-reports is read as complete, because nothing in
the document says a column exists.

The `account` block went from 12 keys to **25**, of the table's 28 columns. Three
are withheld and each carries its reason in the list rather than being quietly
absent: `password_hash` is a credential, and `email_norm` / `username_norm` are
normalised duplicates of columns the export does carry. `verify.ts` checks three
invariants against `PRAGMA table_info(users)` rather than against a copy of the
list — that it covers the table exactly, that everything the erasure clears is
disclosed unless it states one of those two reasons, and that everything which
*survives* an erasure is disclosed too. So a column added to the schema fails the
suite until somebody decides where it belongs, once, for both rights.

The column that fix caught: **`provider_ref`, the Google `sub`, was surviving
erasure entirely.** It is a permanent cross-service identifier of a natural person
and the single most identifying thing on the row, and it went unnoticed for
exactly the reason it was dangerous — nothing reads it on an erased account, so it
was invisible rather than harmless. It is now cleared, and disclosed as well: the
column it would be worst to leave out of an access request is the one whose
absence is hardest to notice.

## Where the spec and the old data disagree

Two places, both resolved in favour of the spec, the first reported by the
import every time it runs:

- **Percentage rewards on a visit trigger.** `LoyaltyVoucherCampaign` rows pay a
  percentage; §5.1 says a campaign pays a fixed item with an exact cost, because
  the exact cost is what makes its budget reserve exact. They are converted to
  fixed-cost campaigns at that percentage of the venue's average check. **Those
  three campaigns want a real reward and a real cost typing in** — the conversion
  keeps the arithmetic honest, it does not invent what the venue gives away.
- **The lapse wipe.** The old app zeroed a player's points after 24 hours without
  play — its own hot-deal terms in the export say so. **Points do not expire here
  at all**, on any plan, and the ledger lists no reason for a negative entry that
  looks like a wipe, so a lapse resets the *streak* only. `domain/games.ts` says
  this at the point it happens. Bringing a wipe back is a product decision that
  would have to arrive as an `adjustment` entry with a reason on it.

### The quiz banks

`CountryCapital` has 196 countries with names and capitals in four languages and
no ISO codes, so `db/countries.ts` supplies the mapping — which is what a flag
question needs, since the emoji is two regional-indicator letters derived from
the two-letter code. The import builds **1 568 questions**: capitals and flags,
196 each, in English, Polish, Russian and Uzbek. Wrong answers come from the same
continent, chosen by a fixed stride rather than a random pick, so the bank is a
pure function of the export and a disputed question can be reconstructed.

`assertComplete` throws at import time on a country the table does not know, and
the table refuses to load if two names normalise to one key — both because the
failure is otherwise invisible: the bank is simply smaller and every test still
passes. The second guard earned itself immediately. Stripping "Rep." and "Dem."
as noise words collapsed `Congo, Dem. Rep.` and `Congo, Rep.` into one key, and
every Kinshasa question got Brazzaville's flag.

The other three banks are hand-delivered CSVs in `updates/`, and the two
local-knowledge ones — **Poland, 98 questions, and Uzbekistan, 100** — are read
by one function because they differ only in which country they ask about: four
lettered options per language and a letter for the answer, where the general
export gives an index. Both are complete in all five languages, which the suite
pins rather than hopes for; a row missing a translation is skipped for *that
language only*, so a partial bank shows up as a shorter pool for whoever reads
Ukrainian and as nothing at all anywhere else.

**Uzbekistan is matched by pattern, Poland by name**, and the asymmetry is
deliberate. The Uzbekistan export arrived as
`Uzbekistan_Quiz_Questions_data_part2.csv` — a name that promises more parts — so
`readCsvParts` reads every file matching the prefix, sorted, and part three is a
file drop rather than a code change. Poland arrived once, as one file, with no
part in its name and therefore no convention to match; a prefix invented for it
here would be a guess. The stronger reason is that `updates/` has two readers:
the front end's `scripts/build-question-banks.mjs` builds its own copy of these
banks out of the same files and pins Poland the same way, and two halves of one
repository disagreeing about which files *are* the Poland bank is a difference
nothing would report.

### Re-running the import

`npm run server:import` is safe on a database that already has data: every row
the import writes has a derived id, so a second run updates in place instead of
delete-and-recreating — which would cascade a budget's movements away — and the
opening balances insert once and only once. `verify:api` runs a full double
import and asserts nothing moved.

### When there is nothing to import

`new-data/` is gitignored — it is the old app’s *live* data and must never
reach a remote — so on a deployed box the import reports "nothing (new-data/
not found)" and the catalogue stays empty.

**And it stays empty.** There was a `db/demo.ts` here: seven Polish venues
across Kraków and Warsaw, two live deals each, with hours, a voucher ladder, a
budget and a stamp campaign, written whenever the count was still zero after
the import. Beside it `seedPlatform` wrote a gift-card shelf — Zalando, Media
Expert, Douglas, Hebe, Empik, 250 in stock each. Both were carefully marked,
both were arithmetically sound, and both are deleted.

Three things were wrong with them and only the first was obvious:

- **A shelf is a promise.** A card offered at 500 points is a month of somebody
  earning, and there is no agreement with any of those retailers behind it. An
  empty shelf says something true; that one said something we could not keep.
- **An empty catalogue is a finding, not a fault.** It means no venue has
  signed up, which is a fact worth putting on a screen — and it is the exact
  distinction `analytics.reach` exists to draw one level down. A catalogue that
  fills itself in cannot tell an operator which of the two they have.
- **A seeded row is immortal.** Delete it and the next restart writes it back.
  Gating it behind `PAYLEZ_DEMO_SEED=1` was the intermediate answer and it was
  not enough: a flag is set once on a box and then forgotten, and the rows it
  wrote are indistinguishable from stock an operator entered by hand.

So a fresh box comes up with no venues, no deals and no vouchers, and the
first of each arrives the way a real one does — through the partner API, with
an audit trail behind it. `bootOrdering` in `verify.ts` is the check: after a
boot, no `ven_demo_` row, no `del_demo_` row, no gift-card stock, no
`platform_config.demo_seed`, and no venue reachable at `demo@pay-lez.com` —
the address the seven shared, which is the tell that survives a rename.

What boot *does* still write is product configuration rather than anybody’s
data: the plan ladder, the category check defaults, and the Word Builder bank.
The same suite checks those are still there, so the cut cannot go further than
it was meant to.

The remittance tables (`Wallet`, `Recipient`, `Transaction`, `PaymentMethod`) are
imported into `legacy_*` and served read-only: both specs put real money movement
in a separate later track, so nothing in `domain/` writes to them.

## Connecting the front end

The React site in `src/` still runs on `localStorage` (`src/site/auth/`), which
its own `users.ts` says must be replaced by a server. The API shapes were chosen
to match it — `GET /v1/me`, `GET /v1/wallet`, `GET /v1/games/state` return the
fields `PlayerState` and `BusinessProfile` already use — so the swap is a client
module, not a redesign. `GET /v1` lists all 153 endpoints.


### The admin account

Part C's console is behind `auth: 'admin'`, and **nothing else in this server
grants that role** — sign-up cannot produce one (§1.2), the import does not
carry one, and no endpoint promotes anybody. `provisionAdmin` runs at boot and
is the only way in:


```bash
PAYLEZ_ADMIN_EMAIL=ops@pay-lez.com PAYLEZ_ADMIN_PASSWORD='…' npm run server
```

From the environment and **never a default**. A seeded admin password in a
repository is a back door into every venue's money, and it would be found by
whoever reads the file next. With the variables unset the server says so at boot
and serves everything else; the console is simply unreachable, which is true and
recoverable. It is idempotent, so rotating the key is a new value and a restart.

### What an operator may change (C7)

This file used to say the console reported and did not edit. It does both now,
and the sentence that replaced it is the one to hold on to: **an operator may
remove a thing, or restore access to it, and may not edit a figure anybody
reports from.** Nothing in `routes/admin.ts` touches a balance, a visit count or
a funnel number — the rule was never that an operator should be powerless, it
was that a figure a partner argues from, changed by a third party with no trace,
is a figure nobody can defend.

They come in threes — describe it, take it down reversibly, or end it — because
an operator given only the final version of an action will use it for the
reversible case, and one given no way to fix a misspelt name will reach for the
final version to fix one:

| | describe | reversible | final |
|---|---|---|---|
| venue | `PATCH …/venues/:id` name, city, category, address, phone, email | `PATCH …/venues/:id` suspend / restore | `DELETE …/venues/:id` |
| offer | `PATCH …/deals/:id` title, description, terms, `validTo` | `PATCH …/deals/:id` pause / resume | `DELETE …/deals/:id` |
| gift card | `PATCH …/gift-cards/:id` name, logo, value, price, validity, how-to | `POST …/gift-cards/:id/active` | `DELETE …/gift-cards/:id` |
| account | `PATCH …/users/:id` name, city, phone, occupation | `POST …/users/:id/ban` | `DELETE …/users/:id` |

plus `POST …/users/:id/password`, which gives a person their account back, and
`GET …/deals`, which lists every offer whatever its state — the public
`GET /v1/deals` is live rows only, so without it a paused offer could not be
listed and therefore could not be resumed.

The describe column and the reversible column share a route and are told apart
by **which keys arrive**: a body carrying `status` is the suspend press, anything
else is the edit form saving, and a body carrying both does both. Every one of
them calls the domain function the *owner's own form* calls
(`partners.updateVenue`, `partners.updateDeal`, `accounts.updateProfile`), so an
operator gets the owner's validation, the same city canonicaliser and the same
audit entry rather than a parallel writer that drifts. **Not one of them takes a
count.** There is no route on this file that edits a balance, a visit, a claim or
a funnel figure.

Six things they get right that are easy to get wrong, and `verify.ts` checks
every one:

- **Removing means the row is gone, and the schema is what makes that safe.**
  It used to be a `deleted_at` stamp, which left an operator told "removed"
  looking at a database that still held the venue. Every foreign key into
  `venues` and `hot_deals` is `ON DELETE CASCADE` for what *belongs* to them and
  `ON DELETE SET NULL` for what merely *mentions* them — `points_ledger`,
  `transactions`, `audit_log`, `guidance_services` — so the thing goes, what it
  owned goes with it, and a platform report still adds up with the reference
  detached. The audit entry is written **before** the delete, because
  `audit_log.venue_id` is one of those SET NULLs and a record of a removal that
  cannot say what was removed is not a record.
- **`translations` is swept by hand.** It is keyed by `(entity, entity_id)` with
  no foreign key to anything — that is what lets one table hold copy for deals,
  venues, campaigns and guidance articles — so no cascade reaches it, and a deal
  deleted without the sweep leaves its title under an id nothing points at.
  Removing a venue sweeps its own copy *and* that of every deal and campaign
  about to cascade off it, before the delete, while there is still something to
  ask which those were.
- **A person is the exception, and the exception is the database's.**
  `points_ledger.user_id` and `transactions.user_id` are `ON DELETE CASCADE`, so
  dropping a customer who spent would take every venue's record of what they
  spent with them — a third party's revenue history, deleted from a screen about
  somebody else. So closing an account runs `consent.eraseUser` and then drops
  the row **only when nothing is owed to it**; the response's `outcome` is
  `deleted` or `anonymised`, because they are different facts.
- **A venue takes its offers with it.** `deals.browse` selects on
  `hot_deals.status` and never joins `venues`, so a venue that is gone whose
  deals are still `live` would leave a claimable card on the board for a business
  that no longer exists. Its offers, pushes, campaigns and tags cascade in the
  same transaction, and the count of offers comes back in the answer.
- **Resuming an offer clears `assertPublishable`** — the owner's own three gates,
  passed to `deals.setStatus` as its guard. Being an operator is not an
  exemption from the rule that decides what a customer may be shown. Pausing is
  ungated, because taking something *down* never is.
- **A gift card is deleted or delisted and the database decides which.**
  `gift_cards.stock_id` is `ON DELETE RESTRICT`, so a brand somebody holds a
  card from goes `active = 0` instead; the response says which happened.
- **An operator cannot be acted on, including by themselves.** Banning or
  erasing your own row revokes your own session inside the request that did it,
  and there is no screen anywhere that undoes that.

Erasure is `consent.eraseUser` rather than an operator's own copy of it, and
that reuse is the whole decision: erasure is a long list of columns and a longer
list of tables, and the version exercised twice a year is the one that quietly
stops clearing a column somebody added. The password reset drops every session
the account has open and the new password is **not** written to the audit entry
— `audit_log` is a table an operator exports.

