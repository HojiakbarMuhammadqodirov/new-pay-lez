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

**The ids are the rulebook's and the names are Pico's.** Six games carry the
app's names now, in all five dictionaries — Pico's Flight (`flight`), Pico's
Flock (`snake`), Pico Jump (`doodle`), Pico's Ball (`breakout`), Picuma (`zuma`)
and Pico Ninja (`ninja`) — and **no id moved**: the server's game types, the
economics rows, `SERVER_GAME` and the component files (`Snake.tsx`,
`DoodleJump.tsx`, `Breakout.tsx`, `Zuma.tsx`, `FoodNinja.tsx`) all keep the old
words. Rename the copy, never the id; an id is in rows the app already wrote.

**Inviting friends is a panel, not a section of the page** (`InvitePanel.tsx`,
the owner's call). The Play head (`.play-head`) carries one button beside the
title, whose `+N` chip appears only once `GET /v1/referrals` has answered; the
link, code, share, counts, milestone and every friend live in a modal sheet down
the right (`.play-invite-*`, z 70, full screen on a phone). Modal on purpose —
it is a task, not something read beside the page — so it traps focus, holds the
page still, and closes on Escape, the cross or the scrim. One side panel at a
time: opening it calls `closeAssistant()`, and `openAssistant()` closes it. The
`/i/<code>` landing (`invite.tsx`) is still a page.

**Hovered cards play a working miniature of the round** (`games/preview.tsx`,
`══ game previews ══` in `site.css`):

- **It is the game, not a picture of one** — real deck cards from
  `games/data/decks.json`, a real shuffled word, `flagOf('PL')`, and the real
  Pico (`drawPico`, the call the round's canvas makes) over a still painted by
  the round's own painter.
- **Most are `Miniature` stills** — a canvas (`.pv-mini`) painted once by the
  game's own `miniature.ts` (`bakery/`, `stall/`, `flock/`, `cannon/`, `ball/`,
  `jump/`, `picuma/`, `ninja/`), so a card cannot drift from its scene. The
  flight's is `FlightPainter.still()` with the columns and Pico moving on CSS
  in front of it. Memory and Word Builder are DOM and take the round's own
  materials (`tableSceneStyle`, `wordSceneStyle`); the word preview's
  whole-row "right" is an `::after` overlay reading `attr(data-l)`, because the
  slots fill one letter at a time and the verdict is the word's.
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

**The round is played in Pico's study** (`data-stage="study"`, materials in
`word/config.ts` as `--wb-*`), with Pico's pose per board state in `PICO_FOR`.
A slot's size is the rack's width over the word's length — `--n` on
`.wb-rack`, in container-query units — so an eleven-letter Polish word stays
one row on a phone. **Slots are the word's length and the tray is not**: the
server can deal decoy letters, so the tray may hold more tiles than there are
slots, and nothing may assume the two counts agree.

## Memory Match

**Still no flip.** The redesign gave the cards a fade, a deal, a wobble and a
sheen, and never a rotation — the real board's rule, which the preview copies.
If a second animation is ever added to `.mm-card`, **restate the whole
`animation` shorthand with `mm-deal` first**: a rule naming only the new one
replaces the list, and the deal replays the moment it stops applying.

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
once, at most six an event. Two points a food, 50 for a perfect round, no
per-game combo bonus (flat bonuses are the master formula's job). **A cut is
sent the moment the blade makes it**, not when the finger lifts: a slice is only
credited inside its food's flight + 1.5 s, and a long held drag used to report
its first foods after their window shut, so the screen's count and the result
card's disagreed for an honest player. Canvas state lives in refs in one rAF
loop; React hears only the count and whole seconds.

**Arcade: Snake (Pico's Flock), Canon Numbers, Bounce Ball (`breakout`, Pico's
Ball), Doodle Jump (Pico Jump), Zuma (Picuma)** — `server/domain/arcade.ts`
copied to `src/site/games/arcade.ts`; screens `games/Snake.tsx`,
`CannonNumbers.tsx`, `Breakout.tsx`, `DoodleJump.tsx`, `Zuma.tsx`, appended to
`GAMES` in that order after `ninja`. Snake's turns are **replayed** by the
server (its step must stay identical on both sides — both suites pin the same
cases); the three physics games are **bounded** by duration like the flight.
All five draw on a canvas in one rAF loop. Classes: `.ar-*` shared frame,
`.cn-*` Canon Numbers' clock and goal banner.

**Every arcade round ends, and the header counts down to it.** The latest end is
`roundSeconds` in `ARCADE_ECONOMY`, mirrored as `SNAKE_ROUND_MS`,
`BREAKOUT_ROUND_SECONDS`, `DOODLE_ROUND_SECONDS`, `ZUMA_ROUND_SECONDS` in
`games/arcade.ts` (and Canon Numbers' `ROUND_SECONDS`, Food Ninja's
`DURATION_MS`); `npm run verify` holds them to the table, and the cards quote
them. The ends are the games' own: Snake — a crash, or 90 s; Doodle Jump — a
fall, **the summit** (the website's level is the first 50 platforms, the 50th
flagged; landing on it is a perfect round and ends it won), or 90 s; Bounce
Ball — the ball lost, the wall cleared, or 150 s (a ball can loop up an empty
column for ever); Zuma — the hole, the chain cleared, or a 120 s backstop
(clearing the front pulls the chain back indefinitely). Four rules travel with
it:

- **The clock is the game's, never the wall's** — Snake's is the ticks played
  (`state.ms`), Doodle Jump's and Zuma's are fixed steps taken, Bounce Ball's and
  Canon Numbers' the clamped frames simulated — so a hidden tab pauses the round
  and its clock together. Canon Numbers' used to be wall time over a frozen
  field. Food Ninja is the exception: its clock is the server's.
- **Snake's end is replayed too.** `snakeOutOfTime` is one line on each side,
  the server keeps `roundMs` in the round's secret, and both suites pin the tick
  a circling snake stops on (642).
- **Physics step in fixed steps or capped sub-steps.** Doodle Jump's integrator
  is `doodleAdvance` in `arcade.ts` — the app's 1/120 s step, so the jump is the
  same height at 25 and 144 Hz (it used to peak at 0.295 on a slow phone and
  0.316 on a fast monitor); Zuma moves in the app's 1/60 s; every loop caps one
  frame (40–100 ms) so a tab back from the background resumes, not leaps.
- **Quit is off once a round is over.** In the beat between the end and the
  result card the round is being banked, and a Quit there abandoned a finished
  round. Each screen also keeps `onDone` in a ref, so a parent re-render cannot
  keep re-arming the banking timer.

**Canon Numbers is a maths shooter on the web** — a sum at the top, numbered
discs falling, tap one (or ← → and Space) and the cannon fires at it; the
answer scores and deals a new sum, a wrong number costs a point; 90 seconds,
sums climbing with the net score. A ball is judged by the sum it was **fired
at**: one still in the air when that sum was answered, landing on a number that
answered it, is forgiven rather than charged. Tunables in `games/cannon/config.ts`
(`CANNON_SCORING` is the block the `cannon_numbers` economics row must agree with), the maths
in `games/cannon/goals.ts` (pinned by `npm run verify`). It is **reported**
(`{hits, wrong}`) and bounded by duration (`scoreCannon`). The server still
**holds** the old turn-based board for the Flutter app — `turn > 0` picks that
scoring — and the web never fires on it. It was rebuilt because the board game
had no maths in it: the numbers were hit points.

**The arcade games' economics are one table.** `ARCADE_ECONOMY` in
`server/config.ts` holds, per game after the rulebook's eight, how a result maps
onto 0..100, how fast it may honestly arrive and when the website's round ends;
payouts come only from the master formula. The target is per minute: no game may
credit a perfect round sooner than `MIN_PERFECT_SECONDS` (20, an honest perfect
quiz), and none later than its own clock — `verify:api` checks every row — Canon
Numbers' is `cannon_numbers`, with the old flat `cannon*` keys kept as aliases
like every other game's. `npm run verify` holds the offline mirror's per-unit
rates and clocks to the table, and `CANNON_SCORING` to the Canon Numbers row.
The per-round table against a quiz, and rulebook-format sections for Snake and
Canon Numbers (which the rulebook lacks), are "Arcade economics" in
`server/README.md`. The server's bounds for the four games the app plays did not
move with the clocks, and must not move without the app.

**Every arcade header is the originals' header** (`games/hud.tsx`): progress
toward a perfect round on the left (`n / perfect`), a clock in `.round-clock` on
the right (`RoundClock` counts **down** from the seconds left the game passes it,
`data-low` for the last ten; Canon Numbers and Food Ninja draw their own), and
`PerfectBar` — the quiz's `.round-bar` filled by performance. The veils
(`.ar-overlay`, and `ReadyVeil` / `EndVeil` in the same file) read as the
flight's: the ready one is Pico's Flight's
(field visible, muted hint, shade from the bottom, Pico waiting beside Start),
the end one its `.fly-over`. The result card names the server's `nearest`
venue voucher ("You're 60 from 10% off at …") whenever a server round returns
one.

## The shared shell

Every round is played on a painted set, and the set is shared code, so a fix to
one stage is a fix to all of them.

- **`.round[data-stage]` plus `<StageScene motif …/>`** puts a painted set
  behind a round's DOM. It is built on `games/diorama.tsx` (`Diorama`, the room
  canvas Memory Match and Word Builder mount directly) — **keep that API
  stable**; a change there is a change to every quiz, the result card and both
  boards.
- **The four quizzes are one component, `QuizRound.tsx`**, on four motifs:
  `parade` (flags), `atlas` (capitals), `lab` (Brain Games) and `city` (the
  local quiz, whose city comes from `quizCountryFor`). The engine moved in whole
  from `games.tsx`; only what it is played in front of changed. Its end reaches
  `onDone` from an effect on a `result` it writes once, never from inside a
  state updater — that is React's "cannot update a component while rendering a
  different one", and StrictMode runs updaters twice.
- **The result card is `ResultCard.tsx`**, with Pico's face read off the round
  (`MOOD` in `stage/config.ts`, on `correct / total`), so a 1-of-5 round is not
  cheered.
- **Arcade veils are `.ar-overlay`, one look for all of them**, told apart by
  `role="status"` (the end). `ReadyVeil` / `EndVeil` in `hud.tsx` are the
  shared components (ready: Pico Ninja, Picuma; end: Pico's Ball, Pico Jump,
  Pico Ninja, Picuma); the others write the same overlay by hand. `.ar-over-late`
  holds an end veil 480 ms so the crash or the cheer is seen before the words
  cover it (Pico's Flock, Canon Numbers); `.ar-ready-snug` lowers the ready veil
  where Pico starts mid-field and the hint would sit on him.
- **The `.round-clock` dial keys off `role="timer"`**, because the same slot
  also holds readings that are not time — Food Cross's and 2048's moves — and
  a dial on "12 moves left" is a picture of the wrong thing.
- **A wrong answer's strike-through is on `.qz-text` only.** A
  `text-decoration` on the button propagates into every block inside it, and
  through the key it turned a "C" into a "€".

## Pictures only watch

**Every scene reads the game's state and never writes it.** The rules, the
score, the requests and the replies are what they were before the redesign;
the picture is told what happened, at the same lines that update the rules, and
draws it. A scene that decided anything would be a second implementation of
the game, and the server's copy is already the second. Specifics:

- **2048** (`bakery/scene.ts`) is told `slide` / `spawn` / `settle` / `snap`;
  `bakery/tracks.ts` is animation only, and `settle` snaps to the server's
  board whenever the two disagree.
- **Food Cross** (`stall/scene.ts`) is told `swap` / `refuse` / `step` /
  `restore` / `sync`; `stall/fall.ts` is animation only. A valid swap is shown
  before the reply (`canSwap` already proved it a move) and swapped back in
  sight if the reply fails. `.fc-grid`'s `inset: 3.5cqi` **must equal**
  `STALL.layout.frame`, or the sixty-four transparent buttons stop lying over
  the foods they name.
- **Neither can stall a round.** 2048 never waits on its scene, and Food Cross's
  waits resolve on a timer rather than on the painter, so a stage scrolled out
  of sight — no frames — still finishes its cascade.
- **Pico's Flock** (`flock/`) draws one tick behind the rules so it can glide
  between cells; its chick rows and its hedge are drawn round the grid and never
  alter a cell.
- **Canon Numbers** (`cannon/scene.ts`, `cannon/look.ts`): the rail stays on
  `TARGET.floorY`, the line past which a target is gone, so what reads as
  "landed" is what the rules call landed.
- **Pico Jump**: `JUMP_SCENE.lift` / `readyDrop` are drawing offsets only.
- **Pico's Ball**: a picture-only strip (`BALL_SCENE.strip`) sits under the
  field for Pico's board, but the ball is still lost at the **field's** own
  bottom edge; `Breakout.tsx` hands the scene `BallGeometry` from its own
  constants, so the two cannot disagree about a rectangle.
- **Picuma**: its rules send two picture notes, `popRun` and `joined`, so a pop
  bursts where the orbs were. The four ball kinds are **marks first** (dot,
  ring, bar, cross); the app's stone materials (jade, gold, coral, deep teal)
  are a second cue, set at different lightnesses so a greyscale screen still
  sorts them (`picuma/config.ts`).
- **Pico Ninja**: the picture notices a cut by the rules' `halves` list. The web
  round has no bombs because the server's round has none — a bomb is a rule,
  not a picture.
- **Pico's Flight**: the art is `flight/scene.ts` + `painter.ts`, and nothing
  there is read by `engine.ts`. Pico is drawn `anchor: 'body'`, sized from
  `FLIGHT.bird.radius` (`picoSizeForBodyRadius`), so his body *is* the hit
  circle; `npm run verify` pins it.

## Scoring, streak and energy

**One function decides what a finished round does to the account.**
`awardPoints` owns the streak, the 24-hour window, the lapse and the one-day
freeze. Each game computes its own number and hands it over; **no scorer
restates what a streak is.**

**Nothing that can be lost, is.** Of the rulebook's eight only the flight has a
fail state (a crash). Quizzes run all five questions however many go wrong, so
`won` on a quiz means the **clean sweep**. Don't add a mistake limit — it makes a
round shorter, not harder. The arcade games' fail states (Snake's crash, Bounce
Ball's one ball, Doodle Jump's fall, Zuma's hole) are the rulebook's own for
those games and stay; it is also why their casual rounds pay below a quiz's —
see "Arcade economics" in `server/README.md`.

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
