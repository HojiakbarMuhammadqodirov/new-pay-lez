# Demo data — `npm run demo:seed` and `npm run demo:purge`

One invented café in Kraków, its owner, and twenty-five customers with seventy
days of history, so the partner dashboard and the player side can be tested
together before real venues arrive. And the purge that removes all of it.

## Why this is allowed when nothing is seeded

`CLAUDE.md` and `bootOrdering` in `server/verify.ts` say boot writes no venue,
deal or voucher, because **a seeded row is immortal**: delete it and the next
restart writes it back. These scripts are the opposite construction, and the
difference is the whole reason they exist:

- **Nothing runs at boot.** `server/main.ts` does not import this folder. A
  person types the command, once.
- **It is removable.** `demo:purge` removes every row that belongs to the demo
  accounts and the demo café — including rows written later by somebody testing
  with them — and proves it with a scan of every text column.
- **It announces itself.** The café is called *Demo Café Kraków*, every account
  is on `@demo.paylez.test` (a reserved domain that can never deliver mail), the
  website and Instagram links are on `.test` and open nothing, the map link is a
  coordinate rather than a place, the phone numbers are `+48 000 000 1NN` (a
  range that rings nobody), and the listing's description says it is
  demonstration data in five languages.
- **Value only moves through the domain.** Points, stamps, rewards, vouchers,
  pool movements and funnel counters are written by `gate.confirm`,
  `vouchers.issue`, `deals.track` and the rest, with backdated `at` values,
  replayed oldest first. The seed ends by asserting `ledger.reconcile` for every
  account and, for every budget, that the pools match what customers hold and
  what was redeemed. It fails loudly if either does not hold.

## What it creates

Numbers are from a run on 2026-09-11. The shape is fixed (a seeded generator);
the dates are counted back from the day it runs.

| | |
|---|---|
| Venue | *Demo Café Kraków*, `cafe`, Kraków, `Europe/Warsaw`, PLN, live and verified, on the **Growth** plan (source `manual`, 12 months) so every paid panel is open: identified profiles, deep analytics, export, assistant, pushes. Address, phone, email, price range, hours, website/Instagram/map links, spoken languages (pl, en, uk, ru), a description in five languages, the three default voucher tiers |
| Owner | `owner@demo.paylez.test` — signs in to the dashboard |
| Players | five login accounts with full profiles (username, Kraków, status, phone, birthday) and leaderboard opt-in; three share their profile with the café, two do not; each ends with a few hundred points |
| Background players | twenty more logins, same password, invented Polish, Ukrainian and Uzbek names and usernames |
| History | about 330 scans over 70 days (about 315 counted as visits; a few under the 15 zł minimum and one inside the 24-hour cooldown, so the till log has "not counted" rows), about 70 deal claims, about 100 stamp-card rewards (most redeemed, some still available, a few expired), vouchers bought (most redeemed, some active) |
| Campaigns | *Coffee card* (5 visits) and *Pastry card* (4 visits, 25 zł minimum, 14-day rewards) active; *Lunch club* paused three weeks ago |
| Deals | four live — two percentage (`20% OFF`, `15% OFF`) and two free-item (`FREE COOKIE`, `2 FOR 1`) — one paused, one draft (half-translated on purpose), one expired; about 1,400 impressions and 190 opens between them. Every one is addressed to customers who have been to the café (see "While it exists") |
| Listing | about 630 impressions and 60 clicks from list, search, map, guidebook and wallet |
| Pushes | one sent this month to the demo customers (delivered to those holding a push token, some opened, "came in" counted), one scheduled three days ahead |
| Budgets | one per month since the café joined, 70% loyalty |

**Why twenty background players, and not just five.** Every figure about
*people* is withheld below the minimum cohort of ten (`CONFIG.privacy.minCohort`,
`analytics.guarded`): new and returning customers, the average check, language
mix, cohorts, unique clickers, cost per new customer. Five customers would turn
most of the dashboard into em dashes, which is correct behaviour and a useless
test. Twenty-five puts the current and previous months over the floor. Some
figures stay withheld on purpose — cost per new customer in a month where fewer
than ten people were new, the `new` and `lapsed` audiences — because that is what
a real café this size would see.

Customers are regulars, weekly and lunch visitors, occasional visitors, three
new this month, two **lapsed** (only seen in the first week, over sixty days ago)
and two **at risk** (high spenders who stopped five weeks ago), so every status
on the customers screen has somebody in it. The photo is the one profile answer
left empty: adding one in the app completes the profile and pays the 50-point
bonus, which is worth being able to test.

## Accounts and the password

The seed generates **one random password** for all 26 accounts and prints a
table: role (owner / player / background player), email, name, username, whether
they share their profile with the café, and their points at the end. The same
table is written to `server/data/demo-accounts.local.txt` (gitignored, mode 600),
or wherever `--out` says. **No password is in any committed file.**

## Running it locally

```sh
npm run demo:seed                         # into PAYLEZ_DB, default server/data/paylez.db
npm run demo:seed -- --out /tmp/demo.txt  # table written somewhere else
npm run demo:seed -- --reset              # purge the demo set, then seed again
npm run demo:purge
```

To keep your own database untouched, point both at a copy:

```sh
cp server/data/paylez.db /tmp/paylez-demo.db
PAYLEZ_DB=/tmp/paylez-demo.db npm run demo:seed -- --out /tmp/demo-accounts.txt
PAYLEZ_DB=/tmp/paylez-demo.db npm run server
PAYLEZ_DB=/tmp/paylez-demo.db npm run demo:purge
```

The seed refuses to run if demo data is already present ("run `npm run
demo:purge` first", or pass `--reset`).

### Which database, and the `--yes` flag

Both scripts choose the database exactly the way `boot()` does: `PAYLEZ_PG_URL`
set means Postgres, unset means the SQLite file at `PAYLEZ_DB`. Before opening
anything they print the target — the file path, or the Postgres host, port and
database name, never the credentials — and they **refuse without `--yes`** when
the target is Postgres or `NODE_ENV=production`. A SQLite path that does not
exist is refused rather than created.

They do not call `boot()` itself, because on an empty catalogue that also runs
the legacy import. The seed does call `seedPlatform` (plans and category
defaults, which the Growth subscription needs), which is exactly what every boot
writes anyway.

One side effect worth knowing: `boot()` re-runs the legacy import whenever the
database has no venues. While the demo café exists, it has one.

## Running it on the VPS

The backend lives in `/opt/paylez`, runs as `paylez`, and reads its environment
from `/etc/paylez/paylez.env` — so the environment has to be loaded for the
script, or it would seed the default SQLite file instead of the real database.
Make sure the deployed tree includes `server/demo/`.

**1. Take a backup first.**

If `PAYLEZ_PG_URL` is set (Postgres):

```sh
sudo install -d -m 750 -o paylez -g paylez /var/backups/paylez
sudo -u paylez bash -c 'set -a; . /etc/paylez/paylez.env; set +a; cd /opt/paylez && npm run pg:backup -- --to /var/backups/paylez/pre-demo-$(date +%F-%H%M).db'
```

(`node server/db/backup-to-sqlite.ts --to …` is the same script without npm.)

If it is not set (SQLite), copy the file with the service stopped, so the copy
is consistent:

```sh
sudo install -d -m 750 -o paylez -g paylez /var/backups/paylez
sudo systemctl stop paylez
sudo -u paylez bash -c 'set -a; . /etc/paylez/paylez.env; set +a; cd /opt/paylez && cp -p "${PAYLEZ_DB:-server/data/paylez.db}" /var/backups/paylez/pre-demo-$(date +%F-%H%M).db'
sudo systemctl start paylez
```

**2. Seed.** The server can stay up: the replay writes one short transaction per
café day.

```sh
sudo -u paylez bash -c 'set -a; . /etc/paylez/paylez.env; set +a; cd /opt/paylez && node server/demo/seed.ts --yes --out /var/lib/paylez/demo-accounts.txt'
sudo cat /var/lib/paylez/demo-accounts.txt
```

**3. Purge, when testing is over.**

```sh
sudo -u paylez bash -c 'set -a; . /etc/paylez/paylez.env; set +a; cd /opt/paylez && node server/demo/purge.ts --yes'
sudo rm /var/lib/paylez/demo-accounts.txt
```

Hard-refresh the site afterwards (see "index.html is served with no
Cache-Control" in `CLAUDE.md`).

## What the purge removes

It selects **by who and where, not by which script wrote a row**: accounts whose
address is `@demo.paylez.test`, venues owned by them or with a
`@demo.paylez.test` email, and demo accounts that were **erased** during testing
(erasure clears the address, so those are recognised by an erased row whose only
venue history is the demo café). Then, in one transaction:

- `translations` for the venue, its deals and campaigns (no foreign key reaches
  that table), audit entries about any of it, fraud cases, the listing's
  `service_events`, `idempotency_keys` (no foreign key), failed sign-in attempts
  and contact-form messages from demo addresses, billing events that mention a
  demo id, issued vouchers (before the tiers, which they `RESTRICT`),
- then the venue — which cascades links, hours, languages, verification, budgets
  and movements, tiers, campaigns, stamp cards, rewards, visits, customers,
  transactions, QR nonces, deals with their events and pushes, quotas, the
  subscription and moderation rows,
- then the accounts — which cascades roles, sessions, consents, the ledger and
  its lots, games, notifications, push tokens, cards and assistant transcripts.

That covers rows written **after** the seed by live testing: counter-tool and
manual transactions, vouchers bought in the wallet, sharing toggles, funnel
events, reminders and pushes, sign-ins, contact messages, and erased accounts.

**Then it proves it.** Inside the same transaction, every text column of every
table is searched for the demo account ids, the venue id and the ids of
everything the venue owned; any hit rolls the whole purge back and prints where
it was found. It prints the rows removed per table.

**What it refuses.** If a real account has transactions, visits, vouchers,
rewards, stamp cards or points tied to the demo café — or a demo account has any
of those at a real venue, a gift card from the real shelf, or a completed
referral across the boundary — it deletes nothing and lists them. Deleting the
demo side would cascade away the other side's records (a real venue's pool still
reserving money for a voucher that no longer exists). Resolve those deliberately,
then purge again.

**What it leaves, on purpose.** A demo account's impressions and clicks on a
*real* listing or deal stay as anonymous events (their user id is nulled by the
foreign key), because removing them would mean editing that venue's funnel
counters by hand. If a real person's assistant conversation was grounded on the
demo café, that transcript is theirs and is reported, not edited. Sharing
consents that other accounts gave the demo café go with it.

## While it exists

- **The café is public; its offers are not.** It is live in Kraków, so anybody
  browsing the city sees the listing. Every demo deal is targeted at `returning`
  and `lapsed` customers — people with a history at *this* venue, which only the
  demo customers have — so signed-in real players do not see the offers.
  Visitors who are not signed in do, because targeting has nobody to evaluate.
- **Pushes reach demo accounts only.** The sent push was addressed to the demo
  customers alone. The scheduled one is sent by the server's push dispatcher
  (`deals.sendDuePushes`, in the frequent job) when it comes due, and the
  dispatcher's audience is whoever the deal's targeting admits in its city — the
  same demo customers. If you publish the draft or create a deal from the
  dashboard during testing, keep that targeting on it before scheduling a push.
- **The Growth subscription runs for twelve months**, so the renewal sweep does
  not lock the panels mid-test.

## Gaps the seed works around

Each is commented at the point of use in `seed.ts`.

- **The past push is delivered by the seed, not by the dispatcher.** When this
  was written nothing sent a scheduled push; `deals.sendDuePushes` was being
  added alongside it. Replaying a dispatcher at a past instant is not an option
  either way: it is global, so it would also process every other venue's pushes
  due by then. So the seed delivers the one past push through
  `notifications.notify` to each demo customer (the cap, quiet hours and
  missing-permission rules apply), marks the queued ones sent the way the local
  adapter does, and writes `targeted`, `reachable` and `delivered` onto the push
  row with one commented `UPDATE`; `came_in` is filled the way reminders define
  it (a counted visit within seven days). The dispatcher leaves a push that is
  already `sent` alone. If the dispatcher gains a way to be called for one push,
  `sendPush` can switch to it.
- **A venue's spoken languages and description had no writer**, so they go into
  `venue_languages` and `translations` (entity `venue`, field `description`)
  directly.
- **Verification needs an admin.** The first active admin account is named as the
  reviewer through `partners.decideVerification`, with a note saying the script
  approved it. With no admin in the database, the decision is written the way that
  function writes it, with no reviewer and a `system` audit entry.
- **The lifecycle and expiry jobs are global.** Replayed at a past instant they
  would also expire other venues' deals, vouchers and rewards that were due then.
  The deal's end is `deals.setStatus(…, 'expired')`; vouchers and rewards are
  expired through `vouchers.expireVouchers` / `campaigns.expireRewards` only when
  nothing outside the demo café is due at that instant, and otherwise with the
  same statements scoped to the café.
