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

Two of the four question banks come from somewhere else, and it is worth knowing
where. The capitals and flags banks are derived from `CountryCapital` in the
export; the **general and Poland banks are hand-delivered exports** and live in
`updates/` beside the front end's own copy of them, so the import reads that
directory too. Without them `POST /v1/games/sessions {gameType:"brain"}` is a
404 and two of the seven games cannot be played at all — which is a data gap
rather than a missing feature, and the import reports it in its notes when the
files are not found.

## Running it

```bash
npm run server         # migrate, import if empty, serve on :8787
npm run server:import  # re-import the export and exit
npm run verify:api     # the test suite — 440 checks, no browser, no network
npm run openapi        # regenerate openapi.json from the route table
```

## For whoever builds a client

- **`API.md`** — the flows a spec file cannot express: the gate's four steps,
  idempotency, offline queueing, the games protocol, what counts as a claim, and
  the money/time/language conventions. Read this first.
- **`openapi.json`** — 120 paths, 130 operations, generated from `allRoutes` so
  it cannot drift. Point a generator at it rather than hand-writing a client.
- **`FLUTTER-BRIEF.md`** — the standing instruction for the mobile app, written
  to be handed over whole.

Node 22.18+ runs the TypeScript directly (`--experimental-strip-types` is on by
default), so there is no build step and no bundler. `npx tsc -b` type-checks the
whole repo including this project.

**Zero runtime dependencies.** `node:sqlite` for storage, `node:http` for the
server, `node:crypto` for scrypt, HMAC and AES-CMAC. That is the same rule the
front end follows for fonts and geometry, and it matters more here: this process
holds the points ledger, and a supply chain is a thing that can be compromised.

### Environment

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` / `HOST` | `8787` / `127.0.0.1` | Where to listen. |
| `PAYLEZ_DB` | `server/data/paylez.db` | SQLite file. `:memory:` for tests. |
| `PAYLEZ_SECRET` | *dev fallback, warns loudly* | Signs QR payloads and sessions. |
| `PAYLEZ_NFC_KEY` | unset | 16-byte hex master key for NTAG 424 DNA taps. |
| `PAYLEZ_ORIGINS` | `http://localhost:5173` | CORS allow-list. |
| `PAYLEZ_BILLING` | `local` | `live` refuses to run without a real adapter. |
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
jobs.ts              the five scheduled rules (releases, lifecycle, renewals, …)
verify.ts            the test suite

db/    schema.sql    every entity in §14 and Part E
       db.ts         open, migrate, nested transactions
       csv.ts        an RFC 4180 reader, for the export
       import.ts     the old database → this schema, plus the two game banks
                     that arrive as hand-delivered CSVs in `updates/`
       demo.ts       seven demonstration venues, written only when the
                     catalogue is *still* empty after the import — see below

domain/              the rules. React-free, HTTP-free, testable on their own
       ledger.ts     §2   append-only points, FIFO lots. Nothing expires
       gate.ts       §3   the universal amount-capture gate
       budget.ts     §4-5 the pools: spent / reserved / available
       vouchers.ts   §4   tiers, reserve-debit-release, gift cards
       campaigns.ts  §5   stamp cards, exact-cost rewards, one per visit
       deals.ts      §6   targeting, funnel, lifecycle, pushes
       games.ts      §7   server-owned answers and scoring
       social.ts     §8   referrals and leaderboards
       notifications.ts §9 inbox, frequency caps, quiet hours
       assistant.ts  §10  grounded retrieval, consumer and partner
       analytics.ts  §12/B9 the estimated-sales pipeline and the findings
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

## The economy, and the four things it used to do and does not

The numbers live in `CONFIG.points`, `CONFIG.earn` and `CONFIG.games`
(`config.ts`), and the per-tier figures in the `PLANS` seed in
`domain/settings.ts`. Each carries the constraint that set it. What is worth
having here is the shape, because four rules were **removed** and each of them
left prose behind in more than one file:

- **Points never expire, on any plan.** `runExpiry`, `expiringSoon` and the
  expiry job are deleted, `points_expiry_months` is not an entitlement, and
  `GET /v1/wallet` does not carry an expiry list. The FIFO lots survive because a
  *spend* still has to come out of something — expiry was a consumer of that
  ordering, never its reason.
- **There is no daily points cap.** The brake is the per-game **decay curve**
  (`CONFIG.games.decay`), applied in `games.finish` where it can see what is
  being played: a repeat of the *same* game the same day pays less — free
  `1/.6/.4/.2/0`, Pro `1/.8/.6/.4/.2`, Premium always 1 — and the rest of the day
  is untouched. Playing on is never refused; the streak, the leaderboard and the
  accuracy figures all keep counting when the factor reaches zero, and only the
  points stop. `Finish.capped` is kept and is always 0.
- **There is no spend bonus.** A bigger bill does not earn more. The venue
  minimum still decides whether a scan counts as a *visit*, which is upstream in
  `gate.confirm`.
- **Hearts do not reset at midnight.** They regenerate one every
  `life_regen_minutes` (free 240, Pro 180, Premium 120) up to `daily_lives`
  (3/5/7), reconstructed in `games.livesFor` from the `life_spent` column on
  finished sessions. A **lost** round costs one; a won round and a start cost
  nothing. `no_lives` carries `nextAt` and `max`, and no longer `resetsAt`.

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

Nothing on a profile is verified. `phone_verified` is dropped from `users` by a
migration in `db/db.ts`, and there is no endpoint that could have set it.

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

### Re-running the import

`npm run server:import` is safe on a database that already has data: every row
the import writes has a derived id, so a second run updates in place instead of
delete-and-recreating — which would cascade a budget's movements away — and the
opening balances insert once and only once. `verify:api` runs a full double
import and asserts nothing moved.

### When there is nothing to import

`new-data/` is gitignored — it is the old app's *live* data and must never reach
a remote — so on every deployed box the import correctly reports "nothing
(new-data/ not found)" and the catalogue stays empty. That is what production was
actually serving: `GET /v1/venues` and `GET /v1/deals` both `[]`, for ever.

So `boot()` checks the venue count a **second** time, *after* the import has had
its chance, and only if it is still zero calls `seedDemo` (`db/demo.ts`): seven
Polish venues across Kraków and Warsaw, seven categories, two live deals each,
with hours, a voucher ladder, a budget and a stamp campaign. The ordering is the
whole of it — a box that *has* `new-data/` takes the real import and must never
see these rows, because a demonstration café standing beside migrated partners is
a row nobody can tell from a real one.

They are marked rather than disguised. Every id is prefixed `*_demo_*`, every
name carries `(demo)`, the description says so in both languages it is written
in, and `platform_config.demo_seed` — which the console lists — records when they
arrived. Nobody owns them: `owner_user_id` is NULL, because the alternative is a
partner credential in this repository, and `provisionAdmin` above states exactly
why that is not on offer. Nothing is invented that would be a lie if believed —
no ratings, no funnel events, no visits, and districts rather than street
numbers. **Delete them the day the first real venue is onboarded**;
`DELETE FROM venues WHERE id LIKE 'ven\_demo\_%' ESCAPE '\'` takes the rest with
it.

The remittance tables (`Wallet`, `Recipient`, `Transaction`, `PaymentMethod`) are
imported into `legacy_*` and served read-only: both specs put real money movement
in a separate later track, so nothing in `domain/` writes to them.

## Connecting the front end

The React site in `src/` still runs on `localStorage` (`src/site/auth/`), which
its own `users.ts` says must be replaced by a server. The API shapes were chosen
to match it — `GET /v1/me`, `GET /v1/wallet`, `GET /v1/games/state` return the
fields `PlayerState` and `BusinessProfile` already use — so the swap is a client
module, not a redesign. `GET /v1` lists all 130 endpoints.

### The admin account

Part C's console is twenty-four endpoints behind `auth: 'admin'`, and **nothing
else in this server grants that role** — sign-up cannot produce one (§1.2), the
import does not carry one, and no endpoint promotes anybody. `provisionAdmin`
runs at boot and is the only way in:

```bash
PAYLEZ_ADMIN_EMAIL=ops@pay-lez.com PAYLEZ_ADMIN_PASSWORD='…' npm run server
```

From the environment and **never a default**. A seeded admin password in a
repository is a back door into every venue's money, and it would be found by
whoever reads the file next. With the variables unset the server says so at boot
and serves everything else; the console is simply unreachable, which is true and
recoverable. It is idempotent, so rotating the key is a new value and a restart.
