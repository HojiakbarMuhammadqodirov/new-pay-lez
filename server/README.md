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
the export; the **general, Poland and Uzbekistan banks are hand-delivered
exports** and live in `updates/` beside the front end's own copy of them, so the
import reads that directory too. Without one of them
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
npm run verify:api     # the test suite — 646 checks, no browser, no network
npm run openapi        # regenerate openapi.json from the route table
```

## For whoever builds a client

- **`API.md`** — the flows a spec file cannot express: the gate's four steps,
  idempotency, offline queueing, the games protocol, what counts as a claim, and
  the money/time/language conventions. Read this first.
- **`openapi.json`** — 123 paths, 133 operations, generated from `allRoutes` so
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
       import.ts     the old database → this schema, plus the three game banks
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

## The economy: energy is the single limiter on a day

The numbers live in `CONFIG.points`, `CONFIG.earn` and `CONFIG.games`
(`config.ts`), and the per-tier figures in the `PLANS` seed in
`domain/settings.ts`. Each carries the constraint that set it. The shape is what
is worth having here, and it is one sentence:

> **Every finished round costs one energy, win or lose, and nothing else bounds
> a day.** Energy refills one per `energy_regen_minutes` up to `daily_energy`, so
> a day is `daily_energy + 1440 / energy_regen_minutes` rounds from a full tank:
> **free 12 sustained and 16 in a burst, Pro 24/30, Premium 48/58.**

Both halves of that are recent and both replaced something. Charging a *win* is
what makes the pool a limiter rather than a decoration — losses only was a tax on
being bad at quizzes, and two of the seven games cannot be lost at all, so it
bounded the struggling player and nobody else. Refilling on a clock is what makes
charging fair: spend the tank at nine in the morning and the wait is an hour or
two, not the rest of the day. A round that is *abandoned* still costs nothing,
because the charge is written in `games.finish` and nowhere else.

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

Seven games, eight `gameType` values, four scorers, and one rounding step. The
tables are in `CONFIG.games`; the shape is:

| Game | Raw |
| --- | --- |
| `brain`, `flags`, `capitals`, `poland`, `uzbekistan` | 1 per correct answer, **+1** for all five, **+2/+1/0** for a clean sweep in ≤10s / ≤15s / slower. Ceiling 8 |
| `word_builder` | **the word's own tier** (1/2/3), **halved** if it was hinted, **+1** for solving all five first-try and hint-free |
| `memory_match` | elapsed time alone: ≤18s → 8, ≤23s → 6, slower → 3 |
| `flight` | **half a point** per gap cleared, capped at 20. Five gaps decide `won`, not what it pays |

Then `score = floor(raw × points_multiplier)` and that is the whole of it.

Three things about that are load-bearing:

- **The clock is the server's**, for both the quizzes' speed bonus and Memory
  Match, read as the span from the first `game_events` row to the last. A client
  has no clock this server is willing to read, and a reported duration is one a
  modified client invents.
- **A band boundary is inclusive, and the field is named for the comparison.**
  `throughSeconds` is compared with `<=`, so a round finishing on the stroke of
  ten seconds gets the ten-second band. "Under 10" and "up to 10" are different
  rules and a field called `under` compared with `<=` is a lie about one of them.
- **The round is floored once, at the end, after the multiplier.** Two scorers
  return halves — a hinted word and a flight gap — and `domain/games.ts` carries
  the exact sum through to `ledger.earn`, which is where it becomes points.
  Flooring per item throws those halves away one at a time, and the loss only
  becomes visible on a paid tier: seven gaps is 3.5, which banks 4 on Pro and
  would bank 3 if the scorer had rounded first. `verify.ts` checks exactly that.

The quiz speed bonus is paid **only on a clean sweep**, which is what stops the
fastest way through a quiz being to answer five questions wrong without reading
them.

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
- **There is no per-game decay curve.** A round pays `floor(raw ×
  points_multiplier)` and nothing else, whether it is the first of the day or the
  tenth. `CONFIG.games.decay`, `decayFor` and the `decay` field on the finish
  response are gone, and `round_decay` is in `RETIRED_ENTITLEMENTS` so a row
  seeded by an older build is deleted on boot rather than left as a live tier
  figure no file mentions. It was written when play was unlimited and it was the
  only brake there was; once energy became one it stopped reaching, because per
  *game* its free zero rung was the fifth round of one game and a player rotating
  the seven never got near it. Two overlapping limiters where only one binds is
  one more than a player can be told about.
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
module, not a redesign. `GET /v1` lists all 133 endpoints.

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
