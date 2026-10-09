---
paths:
  - "src/site/games/**"
  - "src/site/games.tsx"
  - "src/site/learn.tsx"
  - "src/site/onboarding.tsx"
  - "src/site/flight/**"
  - "src/site/auth/player.ts"
  - "scripts/build-question-banks.mjs"
  - "updates/**"
---

# L-Earn and the Play screen

## The page and the grid

**A signed-in individual gets a different page, not a different section.**
`useIsPlayer()` swaps `learn.tsx` → `games.tsx` and `vouchers.tsx` →
`wallet.tsx`; everyone else, business owners included, keeps the marketing
pages. Points, streak and energy are pure functions in `auth/player.ts`, owned
by `npm run verify`; components only call them. The wallet is **not** in that
file any more — its holdings are the server's.

**`GAMES` order is the grid's order, and the poster is separate.**

- **The poster is the daily game and it rotates.** `dailyGame(day)` in
  `games/rules.ts` walks `DAILY_POOL` once per day, deterministic and with **no
  user id**, so everyone sees the same game today. A rotation, not a hash — a
  hash can leave a game unposted for a fortnight.
- **The grid lists every game, the poster's included**, so a card stays where it
  was yesterday.
- **`DAILY_POOL` excludes `wordLocal`**, because not every player has that card
  and a poster for a missing card cannot be pressed. The local *quiz* stays in —
  every player has that card, only its bank varies.
- **The flight leads and Memory Match follows** (nothing to read before you
  start) — a product decision. Reordering `GAMES` means reordering
  `copy.games.names` in all five dictionaries; `npm run verify` pins order and
  alignment.
- Nothing sorts or personalises the grid except the region rule, so the card you
  reach for doesn't move. **Every card is a `<button>`** — the whole card is the
  target.
- New games are **appended** to `GAMES`; the grid names a card by its index in
  `GAMES`, never in the filtered list.

**Hovered cards play a working miniature of the round** (`games/preview.tsx`,
`══ game previews ══` in `site.css`):

- **It is the game, not a picture of one** — real deck cards from
  `games/data/decks.json`, a real shuffled word, `flagOf('PL')`, the real
  `PARROT_PARTS` sprite.
- **It copies the game's own states** — `.round-option` right/wrong chips,
  `.mm-card`'s three faces, and memory cards **do not flip** because the real
  board doesn't. Don't invent motion the game lacks.
- **The content is real and fixed** — `PREVIEW` in `content.ts` and
  `copy.games.preview`, so a hover never fetches a bank or deals a new question.
  `npm run verify` checks the samples still exist in the data files.

## Word Builder

**Two rows, not one row with a picker:** `word` always deals English;
`wordLocal` deals the language of the profile's city (`wordListFor` in
`games/banks.ts`).

**`wordListFor` has three answers.** A country with a list gets it; a country
the product hasn't localised for (including no city yet) gets Polish; a
localised country with **no** list gets `null` and the card is not drawn —
never a wrong-language list. Lists today: `en`, `pl`, `ru`; **`UZ` routes to
Russian** (what Tashkent's counters speak). No country takes `null` today;
`npm run verify` pins it through `visible(null)`.

**Adding a list:** `updates/paylez-words-<code>.json`, the code in the loop in
`scripts/build-question-banks.mjs`, `npm run banks`, widen `WordList`, name the
country in `WORD_LIST_FOR_COUNTRY`, then `copy.games.wordGame.lists` in all five
dictionaries, a `PREVIEW.word` sample that exists verbatim in the new file, and
`WORD_LANGUAGES` in `server/db/import.ts` for the server.

**The word is the list's and the clue is the reader's.**
`updates/paylez-word-hints.json` maps each English clue to four translations;
`npm run banks` writes `words.<list>.<language>.json` beside
`words.<list>.json`, rows in the same order so the no-repeat bag stays valid. A
clue missing from the hints file **fails the generator**; at runtime a missing
whole file falls back to English.

**In the `ru` list the clue and answer share a language**, so a clue must
describe the word without naming it ("Место, где ты живёшь" for ДОМ, never
"дом"). Ukrainian has the same trap with near-cognates.

## Server-held games

**2048** — the board is public, so what stays secret is **where the next tile
lands**. `server/domain/merge2048.ts` keeps the board in `game_sessions.secret`
and spawns from an HMAC of a server-only seed; scored on the largest tile
(`CONFIG.games.mergeTileBands`), no clock, no move limit. `games/board2048.ts`
is the same slide re-written (no shared code) so a swipe moves instantly and the
server's reply replaces the prediction. A move carries **`from`** (its move
count) — that, not `seq`, makes a retried swipe harmless. The file is
`board2048.ts`, not `merge2048.ts`, because Windows treats `Merge2048.tsx` and
`merge2048.ts` as one file. The `game_sessions.game_type` CHECK widens itself
whenever `GAME_TYPES` names a type the live table lacks, on both engines.

**Food Cross** — match-three; `server/domain/foodCross.ts` copied line for line
to `games/foodBoard.ts`, and both suites pin the same hand-built boards. Twenty
swaps; four in a line clears a row/column, five makes a bomb; scored against the
rulebook's 2,000 (§5.8: five a food × cascade level × 4/5-match multipliers).
Falling food comes from an HMAC of the seed; a swap carries `from` like 2048;
the reply carries every cascade **step** so the screen plays the fall.
**Trap:** a "still mounted" ref must be set **on mount**, not only cleared on
unmount, or StrictMode leaves it reading "gone" and every reply is ignored.

**Food Ninja** — an action game, so it is bounded rather than checked:
`server/domain/foodNinja.ts` fixes the round from a seed, a `start` event stamps
the server clock, and a `slice` counts only for a food in the air by that clock,
once, at most six a swipe. Two points a food, 50 for a perfect round, no
per-game combo bonus (flat bonuses are the master formula's job). Canvas state
lives in refs in one rAF loop; React hears only the count and whole seconds.

**Arcade: Snake, Canon Numbers, Bounce Ball (`breakout`), Doodle Jump, Zuma** —
`server/domain/arcade.ts` copied to `src/site/games/arcade.ts`; screens
`games/Snake.tsx`, `CannonNumbers.tsx`, `Breakout.tsx`, `DoodleJump.tsx`,
`Zuma.tsx`, appended to `GAMES` in that order after `ninja`. Snake's turns are
**replayed** by the server (its step must stay identical on both sides — both
suites pin the same cases); the three physics games are **bounded** by duration
like the flight. Zuma's four ball kinds are four *marks* (dot, ring, bar,
cross), not hues. All five draw on a canvas in one rAF loop. Classes: `.ar-*`
shared frame, `.cn-*` Canon Numbers' clock and goal banner.

**Canon Numbers is a maths shooter on the web** — a sum at the top, numbered
discs falling, tap one (or ← → and Space) and the cannon fires at it; the
answer scores and deals a new sum, a wrong number costs a point; 90 seconds,
sums climbing with the net score. Tunables in `games/cannon/config.ts`
(`CANNON_SCORING` is the block the `cannon_numbers` economics row must agree with), the maths
in `games/cannon/goals.ts` (pinned by `npm run verify`). It is **reported**
(`{hits, wrong}`) and bounded by duration (`scoreCannon`). The server still
**holds** the old turn-based board for the Flutter app — `turn > 0` picks that
scoring — and the web never fires on it. It was rebuilt because the board game
had no maths in it: the numbers were hit points.

**The arcade games' economics are one table.** `ARCADE_ECONOMY` in
`server/config.ts` holds, per game after the rulebook's eight, how a result maps
onto 0..100 and how fast it may honestly arrive; payouts come only from the
master formula. The target is per minute: no game may credit a perfect round
sooner than `MIN_PERFECT_SECONDS` (20, an honest perfect quiz), and
`verify:api` checks every row — Canon Numbers' is `cannon_numbers`, with the
old flat `cannon*` keys kept as aliases like every other game's.
`npm run verify` holds the offline mirror's per-unit rates to the table, and
`CANNON_SCORING` to the Canon Numbers row.

**Every arcade header is the originals' header** (`games/hud.tsx`): progress
toward a perfect round on the left (`n / perfect`), a clock in `.round-clock` on
the right (`RoundClock` counts up, or the game's own countdown / moves left),
and `PerfectBar` — the quiz's `.round-bar` filled by performance. The ready veil
is Bird's Flight's (field visible, muted hint, shade from the bottom), the end
veil its `.fly-over`. The result card names the server's `nearest` venue
voucher ("You're 60 from 10% off at …") whenever a server round returns one.

## Scoring, streak and energy

**One function decides what a finished round does to the account.**
`awardPoints` owns the streak, the 24-hour window, the lapse and the one-day
freeze. Each game computes its own number and hands it over; **no scorer
restates what a streak is.**

**Nothing that can be lost, is.** Only the flight has a fail state (a crash).
Quizzes run all five questions however many go wrong, so `won` on a quiz means
the **clean sweep**. Don't add a mistake limit — it makes a round shorter, not
harder.

**Halves are floored once, at the end** (`flightPoints`, `wordRoundPoints`): a
gap is 0.5 and a hinted word is half its tier. Flooring per item double-charges;
rounding up pays for gaps not flown.

**The streak's seven days are derived, not stored.** `streakWeek` in
`auth/player.ts` reads the week from `streak` + `lastPlayed`. A live streak with
`lastPlayed: null` reads as ending **yesterday** (the branch `awardPoints`
gives it). A future day is `ahead` and must not be drawn as missed.

**A counted day shows `$` for everyone** — the circles aren't prices, and local
marks (`zł`, `so'm`) changed the row's width between players. Restoring the
local mark is one line in `StreakRow`. Real **prices** still use the reader's
currency through `useMoney`.

**A lapse takes the streak and nothing else.** Points never expire; wiping a
balance would be a product decision.

**Energy bounds a day, and it is not called lives.** `MAX_ENERGY` /
`ENERGY_REGEN_MINUTES` are the free-plan **defaults** (4 in the tank, +1 every
two hours). `energyOf` takes optional `EnergyLimits`, and the Play screen passes
`daily_energy` / `energy_regen_minutes` from `entitlements` (Pro 6 at 60 min,
Premium 8 at 30); missing or bad values fall back to free. The tank is derived
from `energy` + `energyAt` on demand, never stored as a count.

- Server rounds are charged at start; the screen mirrors the tank from the
  server's start, Quit (`abandonRound`) and finish answers, anchored on
  `energyNextAt`.
- Offline rounds follow the same rule: `beginLocal` spends on open, `bank` calls
  `awardPoints(…, { charged: true })`, and a quit inside `ENERGY_REFUND_MS` is
  `refundEnergy`, once per local day (`energyRefundDay`).
- Old `lives` / `livesAt` state still reads; a missing anchor reads as full.

**An empty tank plays; it just doesn't pay.** `awardPoints` returns the state
untouched when `energyOf` reads empty — that is the whole of practice mode here,
and **scorers must not learn about energy**. The card label becomes
`copy.games.practice`, the round shows a banner, the result uses
`practiceResult`. Testing the tank at the end is exact: energy only refills, and
only `spendEnergy` takes it.

**The gauge is a battery** — discrete blocks (a round costs a whole one), the
earning block filling live in CSS, and `+1 in 1h 12m` beside it
(`untilNextEnergy`, units from `Intl`, frame from `copy.games.energyNext`).
Charging: a spark **crosses** the case. Full: twelve stroked bolts **arc off
every edge** (`BatteryLightning` in `games.tsx`, drawn via `stroke-dashoffset`),
on co-prime cycles so they never fall into phase. A full tank must have motion —
it's the state players most want to spot.

## Question banks

**Questions come from `games/data/`, through a bag.**
`scripts/build-question-banks.mjs` turns the `updates/` exports into one
code-split file per bank per language, fetched on first play (so building a
round is async). Run `npm run banks` on a new export and commit the output.

**`games/bag.ts`: every question is asked once before any is asked twice.**
Anything that can renumber rows must invalidate the bag — the key encodes the
pool size, and missing translations are filled at build time so an index means
the same question in every language.

**The local quiz is chosen by the profile's country, not the language** — an
Uzbek speaker in Kraków is asked **about Poland, in Uzbek**.
`QUIZ_BANK_FOR_COUNTRY` in `games/banks.ts` is the switch (Poland, Uzbekistan).
The bank, the card name (`copy.games.localQuiz`) and the hover sample
(`copy.games.preview.local`) all key off `quizCountryFor` once — never resolve
them separately. `npm run verify` checks all five dictionaries cover every
country. The row is `local`, **not** `poland`.

**The id sent to the server is resolved the same way.** `SERVER_GAME` is
`Record<Exclude<GameId, 'local'>, ServerGameType>` and `local` goes through
`serverGame()` → `quizBankFor`; the type has no slot for a constant.

**Adding a country:** drop `updates/<Country>_Quiz_Questions_data_*.csv` (the
generator globs, so parts are fine), add a branch to
`scripts/build-question-banks.mjs`, widen `LocalBank`, name it in
`QUIZ_BANK_FOR_COUNTRY`; the dictionaries then fail to compile until they name
it.

## When a round can't start

**A press that does nothing is the bug behind every "card not working" report.**

- **A refusing server is treated like an absent one:** every server branch in
  `start` falls through to `offline()` (complete local banks, all five
  languages). `client.ts` drops the token on a 401, which is why a card used to
  fail every other press.
- **`startFailed` is the only dead end** — shown only when the server won't
  answer *and* the bank won't load. `.play-warn` is weighted, never coloured.
- **The bank must exist on the server.** The boot import now runs when any bank
  the code can request (`QUIZZES` in `domain/games.ts`) is empty — not on "first
  boot", which once left `uzbekistan` unimported.

**A bank with no rows in your language is a translation gap, not a missing
game.** `buildQuiz` falls back: your language without the no-repeat window, then
English, then English without the window — only then refuses. Capitals and
flags have no `uk` (`QUIZ_LANGS`), the general bank has no Ukrainian columns,
and `languageOf` admits `tr`/`az`, which have no bank. `buildWords` drops the
window but **never** switches language (an English round on the local-language
card answers a different question).

**A quiz question with two options is a data bug upstream.**
`pickDistractors` in `server/db/import.ts` uses the largest stride under 13 that
is **coprime** with the pool size, so it visits every candidate. Deterministic,
so `INSERT OR REPLACE` repairs rows in place — but **deploying doesn't fix an
existing database**; run `npm run server:import`.
