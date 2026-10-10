---
paths:
  - "server/**"
---

# The backend (`server/`)

Moved out of the root `CLAUDE.md`; loads when you work on the files above.

### `server/` is a separate program in the same repo

**Two databases behind one interface, and the boot picks.** `Db` in `db/db.ts`
is an *interface*, implemented twice: `SqliteDb` in that same file over
`node:sqlite`, and `PgDb` in `db/pg.ts` over `pg`. Both are `async`, so the 29
files that import `Db` have one code path and none of them can ask which engine
answered. `boot()` chooses from the presence of **`PAYLEZ_PG_URL`** — set means
Postgres, unset means the SQLite file — and that one variable is also the
rollback: comment it out, restart, and the file is serving again.

An interface rather than structural typing because both classes carry private
fields, and TypeScript treats a class with privates as nominal: neither would
ever be assignable to the other however identical their public surface.

**Keeping the SQLite driver is deliberate and is what keeps `verify:api`
honest.** Postgres has no `:memory:`, so a Postgres-only port would have dragged
all 1,191 checks onto a live database. They still run offline against a file that
is thrown away.

`node:http` and `node:crypto` otherwise, run straight from TypeScript by Node
22. `npm run server` boots
it (migrating, seeding and importing the old database on an empty file — and
**"seeding" is product configuration only**: `seedPlatform` writes the plans,
the category defaults and the word bank, and nothing else. There is no venue
catalogue, no offer and no gift-card shelf on any boot; see "nothing is seeded"
under Conventions for why, and `bootOrdering` in `server/verify.ts` for the
guard that keeps it true);
`npm run verify:api` is its test suite — 1,191 checks, the counterpart of
`npm run verify` — and
it is what checks the rules that are arithmetic rather than rendering — the
points ledger's FIFO ordering, the budget pool's three states, the amount-capture
gate, the energy tank's regeneration clock, the min-cohort suppression, the
consent gate on identified customers. **Run it after touching anything under
`server/domain/`.** (FIFO *ordering*, not expiry: nothing expires, and a spend
still has to come out of something.)

**Energy is the single limiter on a day, and every round costs one when it
starts.** Win or lose, finished or abandoned — that is rulebook §3, and it
replaced charging in `games.finish`, which let a player quit any round going
badly for free. The one way back is an accidental tap: a round abandoned within
`CONFIG.games.energyRefundWithinSeconds` (5) of its start is refunded, at most
`energyRefundsPerDay` (1) a day, through `POST /v1/games/sessions/:id/abandon`
(`games.abandonSession` → `closeRound`, which a new start also runs on any round
left open). Rounds opened before that change carry no `charged: true` in their
secret and are still charged at finish, so a deploy charges nobody twice. It refills one per
`energy_regen_minutes` up to `daily_energy`, so a day is
`daily_energy + 1440 / energy_regen_minutes` rounds from a full tank: free 12
sustained and 16 in a burst, Pro 24/30, Premium 48/58. Three other brakes have
lived here and all three are gone — points expiry, a daily points cap, and a
per-game decay curve that paid a repeat of the same game less. Charging only a
*loss* was the version before this one and it bounded nobody: several of the
games cannot be lost. **If a day needs to be smaller, move `CONFIG.points`** —
two overlapping limiters where only one binds is one more than a player can be
told about, and the pair a player can see on the screen is where the rule
belongs. `server/README.md` carries the arithmetic and the two column names
(`life_spent`, `lives_used`) that are historical and stay that way.

**And it bounds what a day is *worth*, not whether somebody may play.** An empty
tank used to be a locked door — the Play buttons switched off, the server
refusing with `no_energy` — which made it the one screen in this product with
nothing on it to do. It opens a **practice** round now: the same round, banking
nothing at all. No points, no streak, no freeze, no day counted, no energy taken,
no ledger entry. `POST /v1/games/sessions {practice: true}` asks for one and both
game bodies carry `paid`; the front end's whole rule is the first line of
`awardPoints`, which returns the state untouched when `energyOf` reads empty. Two
details are load-bearing and both are checked. The server decides paid-or-practice
from the tank **as it was at `started_at`**, so the answer cannot change under a
round that is being played and contradict what the screen said. And the flag is
**opt-in**, so the phone keeps the refusal it shipped with until it chooses
otherwise — see `server/FLUTTER-BRIEF.md`.

Two things a venue owner can now see that they could not: **impressions and
clicks**. `analytics.reach` sums the venue's *listing* events
(`venues.trackListing` → `service_events`) and its *deal* events
(`deals.track` → `deal_events`) into one funnel — seen, clicked, claimed —
behind `GET /v1/partner/venues/:id/reach`. It exists because every other figure
on that dashboard starts at a **visit**, and a venue nobody has heard of and a
venue everybody scrolls past render identically without it: zeroes, with nothing
to say which. Those two have opposite fixes. Three rules travel with it — a
*rate over nothing is 0, never null* (null means "we are not telling you");
`uniqueClickers` is a finding about **people** and takes the min-cohort floor
while the raw counts do not; and neither a visit nor a claim is postable by a
client, because both are what the dashboard argues from.

**The assistant is Claude with tools, and the keyword router is its floor.**
`ports/llm.ts` runs a Messages API tool loop and is off unless *both*
`PAYLEZ_LLM=live` and `ANTHROPIC_API_KEY` are set — a server-side secret, never
`VITE_`-prefixed, because Vite bakes those into the browser bundle. The model
answers the question itself, but can only see what the tools in
`domain/assistantTools.ts` read — each bound to the asking user, or to one venue
the asker manages — and every figure in its answer is checked against what they
returned (`groundedNumbers`); one miss is sent back for correction, a second is
discarded and the router answers. Timeouts, refusals, HTTP errors and the 15 s
deadline all resolve the same way: the router's deterministic answer, one log
line, `answered_by = 'fallback'` on the message. Default model
`claude-sonnet-5-5` (`PAYLEZ_LLM_MODEL`). Called with `fetch` rather than the
SDK on purpose — one dependency at one boundary is the budget, and `pg` has
spent it. The detail is `.claude/rules/assistant.md`.

**A plan can be paid for, and the money is Stripe's.** `ports/billing.ts` is the
boundary and `ports/stripe.ts` is the transport, over `fetch` for the same
reason the model is. Three rules hold it together and each one has already been
the bug:

- **Nothing is written when checkout starts.** A session is an intention to pay.
  The subscription row is written when the webhook says the money moved, so
  opening the payment page and closing it entitles nobody.
- **The subject rides on the subscription, not only on the session.**
  `client_reference_id` appears on one event, and Stripe does not guarantee
  delivery order — `invoice.paid` and `customer.subscription.created` really did
  arrive before `checkout.session.completed`, with nothing to identify the
  payer. It is stamped into `subscription_data.metadata` as well, and any of
  three events may be the one that creates the row.
- **The signature is checked against the raw bytes.** `Ctx.rawBody` exists for
  this one route. Verifying `JSON.stringify(payload)` would pass today and fail
  the first time a key order changed — and fail as "bad signature", which reads
  as a wrong secret rather than as this mistake. The timestamp is checked too,
  or a captured delivery could be replayed to re-grant a cancelled plan.

**Eight prices, one per plan per rung.** `plan_terms` sells 1, 3, 6 and 12
months at up to 25% off and the cards *open* on the twelve-month rung, so a
checkout that took only a plan code quoted 179.88 zł and charged 19.99 a month.
The term travels card → button → route → port → Stripe and back on the
subscription's metadata, because `renews_at` needs it: `runRenewals` sweeps
anything past its renewal date, and a year-long customer given thirty days is
one moved to `grace` after a month and expired a week later. The renewal date
takes, in order: what Stripe reports, the term bought, the plan's interval.

**BLIK cannot do subscriptions.** It is how Poland pays online and Stripe
refuses it in `subscription` mode — it authorises a single payment and cannot be
stored and charged again. `payment_method_types` is therefore **not** set at
all: a Checkout Session offers whatever the account has enabled and the mode
allows. Naming a list would both break and freeze it.

Two things about it are easy to undo by accident and both are checked:

- **The balance is derived, never edited.** `users.points_cache` is written only
  by `domain/ledger.ts` and reconciled against the ledger; a reversal is a
  compensating entry and never a mutation of the row it reverses.
- **A pool has exactly three states and they exhaust it** — spent, set aside,
  available — which is the same rule `partnerMetrics.ts` states on the front end,
  enforced here on the money that actually moves.

**Consent follows the asking, and the server never infers it.** Sign-up and the
Google exchange both take `acceptTerms`, and both write the two `consent_records`
rows (`terms` and `privacy`, stamped with `CONFIG.privacy.policyVersion`) **only
when it is true**. Both wrote them unconditionally once, on the argument that the
account coming into existence is the moment consent is recorded — true about the
moment and false about the consent, because nobody had been asked. A row saying
somebody agreed to a document on a day they were never shown it is worse than no
row, because it is the row that would be produced as evidence.

**Absent is not refused, and that is a rule about clients rather than about
consent.** It *was* refused for a few days, and the refusal landed on the one
client that cannot be changed: the Flutter app already on people's phones does
not send the field. Nor can the gate be narrowed to the web — `surface` is
client-declared and **defaults to `'web'` when absent**, so the exemption written
to spare the app would have refused the app. Refusing therefore bought no consent
at all; it bought a sign-up screen that fails for everybody who has not updated,
and fails for the people least likely to report it.

So the asking lives on the surface that can ask. On the web the submit *and* the
Google button on the sign-up form are both dead until the box is ticked
(`GoogleButton` takes `acceptTerms`; undefined means "this form does not ask" and
leaves it live, which is how the **sign-in** form's copy stays usable — that
press is for an account that already exists). A client that has not asked gets an
account and no consent row, `GET /v1/me/consents` reports it ungranted, and
`POST /v1/me/consents` is how it arrives later. Google records only on the press
that *creates* the account: a row per sign-in would turn evidence into a log.

**Pro and Premium are granted, never sold, and who may buy a gift card is an
operator's setting.** Plans are given from the console's Tiers tab — the owner's
decision, so neither client sells one under Google Play's billing rules — and
the site draws no price list, no "Get Pro" and no upgrade button; the
`Subscription` section is kept unrendered in `sections.tsx`. The gift-card
rules live in `domain/giftPolicy.ts` (one JSON row in `platform_config`, set
from the Gift cards tab's "Budget and rules"): **automatic** is the rulebook —
Pro and Premium, 60 days, a monthly budget that is a percentage of the live Pro
and Premium plans *at list price, granted ones included*, because counting only
paid plans would make it zero for ever — and **manual** is every criterion by
hand: who, a fixed amount or a percentage, a date window, monthly or once, days
between one person's cards. `redeemGiftCard` reads it and `entitlementsFor`
answers `gift_card_priority` from it, so a client's shop and the purchase
cannot disagree; the boot's re-seeded plan value for that key is overridden.

**A gift card is a real code, and the shelf is per country.**
`domain/giftCards.ts` and the console's seventh tab (`adminGiftCards.tsx`).
Poland sells real **brand** codes the operator loads (paste or CSV); Uzbekistan
sells one **venue's** own card, whose codes the server generates — the kind is
fixed at creation. `stock` is the codes nobody holds and stays the race-safe
gate; a purchase binds the oldest free code. A bought card copies its face value
and currency, so editing the shelf never changes a wallet. "Used" is the
holder's or the operator's word, because the till is not ours; **cancel refunds
the points as a new `adjustment` entry and burns the code** — the one console
write that reaches the ledger, and only by adding to it. The shelf a player sees
is their profile's country (Poland when unset), and every logo is a `data:`
picture the console made, drawn through `isPicture` — the old shelf printed
`card.logo` as text, which would have been a page of base64.

**Browsers get four pushes, each its own switch in the profile.** The daily
game reminder (18:00 on the player's clock, only on a day with no round
started), "your streak is about to break" (20:00, only when it really would —
played yesterday, not today, no freeze held), "your energy is full" (the minute
the tank refills after a spend, once per refill), and a referral reward (written
to the inbox for both sides by `gate.completeReferral`, pushed only to whoever
switched it on). `domain/reminders.ts` decides each one — a live web
subscription, once per day or per event, inside quiet hours in the zone the
browser reported; `ports/webpush.ts` sends it
(RFC 8291 + VAPID over `node:crypto` — no dependency, the `pg` budget again);
`jobs.runEveryMinute` runs it; `public/sw.js` shows it and has **no `fetch`
handler on purpose** — a caching worker would be a second stale-bundle problem
on top of `index.html`'s. `PAYLEZ_PUSH=live` plus `VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY` (from `npm run push:keys`, generated **once** — a new pair
orphans every subscription) turns it on, and the profile's switch says so in
words while it is off. A browser carries only `CONFIG.push.webKinds`;
`canPush` counts a token only if its platform can carry the kind.

**Email codes are the phone's design, and the website follows it.** Sign-up
emails a six-digit code; `POST /v1/auth/email/send-code` and
`POST /v1/auth/email/verify` resend and confirm, and
`POST /v1/auth/password/reset-code` / `/reset` are "Forgot password?". Mail is
Resend (`PAYLEZ_RESEND_KEY`, `PAYLEZ_MAIL_FROM`); without a key codes go to the
server log. The only thing an unproved address can cost is a spend — a voucher
or a gift card — and `GET /v1/me` carries it as `emailVerificationRequired`:
true only with mail configured, for an account created after
`PAYLEZ_VERIFY_SINCE`, and not when `PAYLEZ_VERIFY_TO_SPEND=off`. Older accounts
are exempt by date rather than stamped by a migration, so there is no schema
version 8. `VerifyEmail.tsx` on Play and the wallet picks its sentence from that
field. The rules and their reasons are in `domain/verification.ts`.

**The profile's "Status" is `occupation`, and the column cannot be called
`status`.** `users.status` is the account state — `provisional`, `active`,
`banned`, `erased` — so the field a person picks from five values (`student`,
`worker`, `business`, `freelancer`, `other`) carries the other name everywhere:
the column, the API field and the patch key. The UI label is the dictionary's
job. This repo has already paid once for two things sharing a name — `.dash-*` on
the front end — and a moderation query reading somebody's job is the version of
that bug which is hard to see. It replaced a free-text `headline`, which is
dropped by a version-guarded migration in `db/db.ts` rather than left as a column
nobody writes.

**A city is canonicalised, not restricted, and what is stored is not what was
typed.** `GET /v1/cities` is a suggestion source now; `resolveCity` folds a match
onto the table's own spelling and country (ignoring any `countryCode` the client
sent) and folds anything else to a title-cased ASCII form that needs a country
with it. The reason is one query: the city weekly board groups on `users.city`
with a literal `=`, so free text does not make a messy board, it makes one board
per spelling with one player on each. `server/README.md` carries both costs — a
mis-filed `Halle`, and `Saint-Étienne` stored as `Saint Etienne`.

Two of the five question banks do not come from `new-data/`. The capitals and
flags banks are derived from the `CountryCapital` export; **the general, Poland
and Uzbekistan banks are the hand-delivered CSVs in `updates/`**, the same files
`npm run banks` reads for the front end, and `db/import.ts` reads that directory
as a second source.

**And `new-data/` is not in the repository, so the country banks fall back to
`updates/` too.** That is not tidiness — it is the difference between a clone
that works and one that cannot be signed up for. Without `CountryCapital` both
derived banks import as empty, `POST /v1/games/sessions {gameType:"flags"}` is a
404, and **flags is the round the welcome gate asks for**: the new account gets
"The flags did not load" with a Try again that will never succeed, and
`resolveRoute` holds it at `#/welcome` from every route. One missing file three
directories away locks every new player out of the entire product. The same 196
countries are in `updates/`, split across the two exports the front end's own
generator already reads, so the import prefers the Base44 table when it is there
and reads those when it is not. Two details make the fallback equal rather than
approximate: the flags export spells three countries its own way
(`Saint Vincent`, `Congo (Brazzaville)`, `Central African Rep.`), which are
aliases in `db/countries.ts` now because `assertComplete` throws rather than let
a bank shrink quietly; and it carries no `continent`, which is joined across from
the capitals export **on the ISO code** — the two files disagree about spelling,
and the code is what `codeFor` exists to make them agree on. Without that join
every country lands in one bucket and the wrong answers stop being from the same
continent, which is the difference between a question and a giveaway.
`verify:api` checks both. They were missing for a while and the symptom is worth
recognising: `POST /v1/games/sessions {gameType:"brain"}` returns a 404 saying
"no questions in the brain bank", and two games are unplayable
while every other endpoint looks fine. The import reports it in its notes when
the files are not there rather than importing nothing quietly.

**The Flutter app is the other client.** It lives in the
`Pay-lez mobile` repo beside this one and is wired end to end — the four-step
gate from both sides, the games on the server's move-by-move protocol, the
wallet, the guidebook, and the partner companion. Two things follow for anybody
changing `server/`. Its `test/live_test.dart` runs the whole journey against
`npm run server` and will catch a renamed field before a phone does, so **run it
after changing a response shape**. And its `test/protocol_test.dart` holds
response bodies copied verbatim from a running server — a deliberate duplicate
of this repo's shapes, because a mapper written against a guess passes a test
written against the same guess.

- **`rowid` does not exist on Postgres, and this suite cannot catch that.** The
  eighth trap and the worst so far, because it was silent here and fatal there:
  `ledger.spend` ordered its FIFO lots by `rowid`, `verify.ts` asserted the same
  order, every check was green — and on the live database every spend threw
  `42703 column "rowid" does not exist`. A voucher could not be bought, a gift
  card could not be bought, a tier could not be spent on. It stood from the
  Supabase migration until a demo seed run against production hit it.

  **The reason it hid is structural, not careless.** `verify:api` runs on
  `:memory:` SQLite (see "keeping the SQLite driver" above), so *every check in
  it passes on constructs Postgres does not have*. The engine cannot be the thing
  that finds these. `sqliteOnlySql` in `server/verify.ts` therefore reads the
  source instead — comments stripped, one banned token, the offending file named
  — and it is the pattern to extend if a ninth turns up.

  **The tiebreak is `points_lots.seq`, and the two cheaper answers were both
  wrong.** `rowid` is SQLite's. `ledger_id` is portable and deterministic and was
  tried next — and it is *random*, so FIFO became a coin flip between lots
  sharing a millisecond, which `gate.confirm` produces every time it pays a scan,
  a spend bonus and a venue bonus in one transaction. It survived three green
  runs before a fourth caught it, which is what a 50/50 test looks like. `seq` is
  assigned by `ledger.earn` as `MAX(seq) + 1` for that user, **inside the insert**
  so two concurrent earns cannot read the same maximum, and rows predating the
  column carry 0 — correct, because they are older than anything writable now and
  their order among themselves was never recorded. Not a sequence type, because
  `pg-schema.mjs` deliberately keeps `schema.sql` to what both engines take
  verbatim.

- **Postgres is stricter than SQLite in seven other places, and six of them fail
  loudly.** All are handled and commented where they live; the list is here so a
  new query does not walk into one. `pg` returns **bigint and numeric as
  strings**, so `SUM(delta)` would have made the ledger disagree with itself on
  every account (type parsers in `db/pg.ts`). A parameter tested with
  **`$x IS NULL` cannot have its type inferred** — the optional-filter idiom is
  used 26 times and broke every list endpoint with a 500, so `translate()` casts
  that occurrence to `::text`. The pooler forces **`extra_float_digits = 0`**,
  truncating float reads; storage is exact but a read-modify-write makes it
  permanent. Scalar **`MAX(a, b)`** is SQLite-only (written as `CASE WHEN`).
  **`GROUP_CONCAT`** is translated to `STRING_AGG`. **`ON CONFLICT … DO UPDATE
  SET x = x + 1`** is ambiguous and must qualify the table. And **`GROUP BY` an
  output alias** binds to a *column* of that name if one exists, which silently
  broke the traffic report.
- **A `GROUP BY` cannot report a row that does not exist, and three boot gates
  turn on exactly that.** `main.ts` decides whether to re-import by asking what
  is missing or too small, and the word-bank gate asked
  `SELECT language, COUNT(*) … GROUP BY language HAVING COUNT(*) <= $floor` — a
  query that can only ever name a language which already has rows. A list added
  after a database was first filled has none, appears in no group, and is starved
  in the one way the query cannot see. `ru` was exactly that, and it would have
  shipped a card whose words never arrived: the card drawn, the server answering
  `not_found` for the session's language, every round falling silently through to
  the browser's own copy of the bank. `WORD_LANGUAGES` in `db/import.ts` is now
  the list both sides read. **Ask the code what it can request, never the table
  what it happens to hold** — the quiz-bank gate above it already carries the same
  correction, for the same reason, and a fourth gate written the easy way will
  have the same hole.
- **Three kinds of async bug the type checker cannot see.** The whole server is
  promise-based now, and `tsc` catches only the cases where the value is used.
  It says nothing about a **floating promise** — a statement like `db.tx(…)`
  whose result is discarded, which type-checks perfectly while no longer
  happening before the next line (97 of these existed; one was in a live admin
  route). Nor about **`forEach(async …)`**, which throws the callback's promise
  away so the loop finishes before any body runs — and converting it to `for…of`
  changes what `return` means, from *continue* to *leave the function*. Nor
  about **an async callback typed `() => void`**, which is assignable and whose
  promise is then dropped: that turned a routine 403 into a process-killing
  unhandled rejection. If something "did not happen", suspect these before
  suspecting the database.
