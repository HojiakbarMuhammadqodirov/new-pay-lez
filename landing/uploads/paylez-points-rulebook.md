# Paylez Points Rulebook
### The complete earning system: currency, energy, games, visits, streaks, and the mission catalogue

**Version 1.0 · 26 September 2026**

This is the single authoritative reference for how points work in Paylez: what a point is worth, every way to earn one, exactly how each of the eight games pays, and the full catalogue of missions. Every number here has been modelled against the others — change one and re-check §10.

---

## 1. Principles

Five rules govern every number in this document. When a future decision conflicts with one of these, the principle wins.

**1. Points exist to drive venue visits, not to be a game score.** Paylez earns when people walk into partner venues. Games are the retention engine that keeps the app open on days when nobody is shopping — they are not the product. **Games must never be the dominant earning path.** Target: games ≈ 45% of a user's points, visit-linked activity ≈ 30%+, the rest daily habit and one-offs.

**2. A point must be worth something legible.** Users should be able to answer "what is this worth?" — the anchor is **100 points ≈ 1 zł** of gift-card value. Everything else is priced against that.

**3. Earning must be bounded and predictable.** Energy caps how much you can play; decay makes the fifth round of the day worth far less than the first; weekly caps exist as an anti-abuse backstop. No path may produce unbounded points.

**4. Every reward is granted server-side.** The client proposes, the server decides. A points balance that a phone can influence is worthless to the partners funding the discounts.

**5. The free tier must be genuinely rewarding.** Most users will never pay. Free must be able to earn real rewards — the paid tiers buy *speed and ceiling* (more energy, faster refill, a multiplier), never access to the basic loop.

---

## 2. The currency

### 2.1 What a point is worth

| Spend path | Cost | Value | Effective rate |
|---|---|---|---|
| **5% discount voucher** | 300 pts | up to 10 zł off | ~1.2 gr/pt realised |
| **10% discount voucher** | 500 pts | up to 25 zł off | ~1.2 gr/pt realised |
| **15% discount voucher** | 800 pts | up to 40 zł off | ~1.2 gr/pt realised |
| **Gift cards** (Pro & Premium only) | **100 pts = 1 zł** | face value | 1.0 gr/pt |

Vouchers are **partner-funded** — they cost Paylez nothing and are only paid when the customer actually spends at the venue. Gift cards are **Paylez-funded**, which is why they are restricted to paying tiers and drawn from a capped monthly pool (see §9.4).

**Voucher validity by plan:** Free 14 days · Pro 30 days · Premium 60 days.

### 2.2 The plan multiplier
Every **game** point is multiplied by the user's plan multiplier. Visit and one-off bonuses use their own per-plan values instead (§5, §7).

| | Free | Pro | Premium |
|---|---|---|---|
| **Points multiplier (games)** | **1.00×** | **1.25×** | **1.75×** |

---

## 3. Energy — the budget that bounds everything

Energy is the reason a user comes back later the same day. One game round costs **1 energy**.

| | Free | Pro | Premium |
|---|---|---|---|
| **Daily energy (tank size)** | **4** | **6** | **10** |
| **Refill rate** | 1 per **120 min** | 1 per **60 min** | 1 per **30 min** |
| **Full tank refill time** | 8 h | 6 h | 5 h |

**Rules**
- Energy regenerates continuously up to the tank size; it does **not** stockpile beyond it.
- **At zero energy, games remain playable in Practice mode for 0 points.** Never lock the game outright — a blocked user closes the app, a practising user stays. The points are the pull to return, not the play itself.
- Energy is consumed **when a round starts**, not when it ends, so abandoning a round still costs it (prevents reroll-farming for a good board).
- A round abandoned in the first 5 seconds refunds the energy, once per day (accidental taps).

---

## 4. The games — points system

### 4.1 The master formula

All eight games are normalised to a common scale so that **no game pays better than another**. This matters: if Bird's Flight paid more than Memory Match, everyone would play Bird's Flight and seven games would be wasted content.

```
1.  Each game produces a PERFORMANCE SCORE from 0 to 100 (game-specific, §4.3)
2.  base_points   = max(2, round(performance / 100 × 18))        → 2 to 18
3.  × featured_bonus   (×1.5 if this is today's featured game, once per day)
4.  × decay(round_number_today)
5.  × plan_multiplier  (1.00 / 1.25 / 1.75)
6.  + flat bonuses     (perfect round, new game, personal best)
7.  Result is rounded to the nearest whole point, minimum 1
```

**Decay by round number (per day):**

| Round today | 1st | 2nd | 3rd | 4th | 5th | 6th+ |
|---|---|---|---|---|---|---|
| **Multiplier** | **1.00** | 0.65 | 0.45 | 0.30 | 0.20 | 0.12 |

Decay is the main anti-grind lever. The first round of the day is worth real points; the tenth is worth a token. This rewards **daily return** over **single-session grinding**, which is exactly the behaviour Paylez wants.

### 4.2 The published payout table

What a player actually sees, at decay 1.00:

| Performance | Base | As featured game | Featured, Premium |
|---|---|---|---|
| **100%** (perfect) | 18 | 27 | 47 |
| 90% | 16 | 24 | 42 |
| 80% | 14 | 21 | 37 |
| 70% | 13 | 20 | 34 |
| 60% | 11 | 17 | 29 |
| 50% | 9 | 14 | 24 |
| 40% | 7 | 11 | 18 |
| 25% | 5 | 8 | 13 |
| 0% (finished, scored nothing) | **2** | 3 | 5 |

**A finished round never pays zero.** The floor of 2 points means trying always beats not trying.

### 4.3 Flat bonuses

| Bonus | Reward | Rule |
|---|---|---|
| **Perfect round** | **+10** | Performance score = 100 |
| **First time playing a game** | **+25** | Once per game, 8 games = 200 lifetime |
| **Personal best** | **+8** | Beat your own record in a score-based game; max once per game per day |
| **Featured daily game** | ×1.5 | The rotating "today's game", once per day |

### 4.4 The featured game rotation
One of the eight games is featured each day, cycling in order so every game is featured once every 8 days. The featured game pays **×1.5** on the first round played that day. This drives both **daily return** and **variety** — users discover games they would otherwise ignore.

---

## 5. Per-game scoring — how performance is calculated

Each game maps its raw result onto the 0–100 performance scale.

### 5.1 Guess Flag *(quiz)*
- **5 questions per round.** Mix: 3 common flags, 2 harder ones.
- **20 performance per correct answer** → 100 for 5/5.
- Four options per question; no time limit, but a **+5 speed credit** (capped at 100 total) if all five are answered inside 25 seconds.
- Flags are drawn from a pool weighted to the user's region and home country, so they feel relevant.

### 5.2 Brain Games *(general quiz)*
- **5 questions per round**, mixed arithmetic, sequences and logic puzzles.
- **20 performance per correct answer.**
- Difficulty ramps within the round: Q1–2 easy, Q3–4 medium, Q5 hard.

### 5.3 Country Quiz
- **5 questions about one country** the player chooses (the picker already exists): capital, currency, continent, language, landmark.
- **20 performance per correct answer.**
- Playing a country the user has not chosen before awards the **new-content bonus (+5 performance)**.

### 5.4 Word Builder
- **3 words per round**, 4–7 letters, in a language the player chooses (EN / PL / RU / UZ).
- **33 performance per word solved** (99, rounded to 100 for all three).
- **Speed:** +4 performance per word solved under 30 seconds.
- **Hints cost points: −10 performance each.** Hints are a plan entitlement — **Free 3/day · Pro 6/day · Premium 10/day** — so the tier buys help, not free points.
- Longer words are drawn more often at higher player levels.

### 5.5 Memory Match
- **6 pairs (12 cards).** Completing the board is the baseline.
- **Base 60 performance** for completing.
- **Efficiency bonus** on top, by moves used:

| Moves | Bonus | Total |
|---|---|---|
| ≤ 10 | +40 | **100** |
| 11–14 | +25 | 85 |
| 15–18 | +12 | 72 |
| 19+ | +0 | 60 |

- 90-second time limit; running out scores proportionally to pairs found (`pairs / 6 × 50`).

### 5.6 Bird's Flight *(endless tapper)*
- Endless; score = **obstacles passed**.
- **Performance = min(100, obstacles × 4)** → 25 obstacles is a perfect round.
- Difficulty (gap size, speed) increases every 10 obstacles.
- Personal-best bonus applies (§4.3).

### 5.7 2048
- Endless merge; performance is set by the **highest tile reached**:

| Highest tile | 64 | 128 | 256 | 512 | 1024 | 2048 |
|---|---|---|---|---|---|---|
| **Performance** | 20 | 35 | 50 | 65 | 85 | **100** |

- No move limit — the board ending is the limit. One energy per game.

### 5.8 Food Cross *(match-3)*
- **20 moves per round**, target score **2,000**.
- **Performance = min(100, score ÷ 2,000 × 100)**.
- Cascades and 4+/5+ matches multiply score, so skilled play reaches target well inside 20 moves.
- Board is seeded server-side per round so a board cannot be rerolled for an easy start.

### 5.9 Summary — all eight at a glance

| Game | Type | Round length | Perfect = 100 when… |
|---|---|---|---|
| Guess Flag | Quiz | 5 questions | 5/5 correct |
| Brain Games | Quiz | 5 questions | 5/5 correct |
| Country Quiz | Quiz | 5 questions | 5/5 correct |
| Word Builder | Puzzle | 3 words | 3 words, no hints, fast |
| Memory Match | Puzzle | 6 pairs | Cleared in ≤10 moves |
| Bird's Flight | Arcade | Endless | 25+ obstacles |
| 2048 | Arcade | Endless | 2048 tile |
| Food Cross | Arcade | 20 moves | 2,000 score |

---

## 6. Visits and the counter — the highest-value earning

These are the points that matter most, because they require walking into a partner venue. **Per-plan values:**

| Line | Free | Pro | Premium | When |
|---|---|---|---|---|
| **Scan points** | **20** | **30** | **50** | Every confirmed scan |
| **First visit to a venue** | **100** | **150** | **250** | First time ever at that venue |
| **First venue in a category** | **25** | **50** | **100** | e.g. first barber, first bakery |
| **Stamp card filled** | **100** | **150** | **250** | A loyalty card completed |

**The venue's own rate beats the plan's.** Where a partner has set `points_per_scan` above zero, that is what a scan pays — it is the venue's own budget, and a subscriber does not get to overrule it. The plan buys a better *default*, not a claim on a partner's money.

**There is no spend bonus.** Paying more over the venue minimum does not earn more. The reward is for the *visit*, not the size of the bill — which is the right shape for a scheme whose whole argument to a venue is repeat custom.

**Gate limits (anti-fraud, all server-enforced):**

| Setting | Value | Meaning |
|---|---|---|
| `minSpendMinor` | 15.00 zł | Below this, a scan is not a visit |
| `maxAmountMinor` | 1 000.00 zł | Ceiling on a single transaction |
| `visitsPerDay` | 1 | Per venue, per person |
| `qrTtlSeconds` | 90 | How long a code is valid |
| `pendingTtlMinutes` | 15 | How long a held scan waits for an amount |
| `burstPerHour` | 12 | Fraud brake |
| `travelKmPerHour` | 900 | Implausible-travel brake |

---

## 7. Streaks, comebacks and one-offs

### 7.1 Streak rules

| Last played | Result | Freeze |
|---|---|---|
| **Today** | Unchanged — a second round the same day does not count twice | — |
| **Yesterday, or never** | **+1** | — |
| **Longer ago, freeze held** | **+1** — the gap is absorbed | One spent |
| **Longer ago, no freeze** | **Resets to 1** | — |

**Freezes:** one earned every **7 days** of streak. Held at most: **Free 2 · Pro 5 · Premium unlimited**.

### 7.2 Streak milestones

| Streak | Reward |
|---|---|
| **7 days** | **50** |
| **30 days** | **250** |
| **100 days** | **1 000** |

### 7.3 One-off and occasional bonuses

| Bonus | Points | Trigger and guard |
|---|---|---|
| **Onboarding complete** | 50 | Finishing the welcome flow (not merely opening an account) |
| **Welcome round** | 10 × 5 | First finished round only, decided server-side |
| **First scan ever** | 100 | The very first confirmed scan on the account |
| **Profile complete** | 50 | All seven fields, once only |
| **Interests picked** | 25 | Choosing categories during onboarding |
| **Daily check-in** | 5 | Once per day, for opening the app |
| **Comeback** | 100 | On ending an absence, once per fixed 30-day window |
| **Birthday** | 200 | Once a year |
| **Anniversary** | 200 | One year since joining |
| **Review after a visit** | 25 | Leaving a review, capped per venue |
| **Deal shared** | 25 | Max 3 per day |
| **Invitee reward** | 100 | To the invited person, on their first confirmed visit |
| **Referrer reward** | 100 | To the referrer, on the invitee's first confirmed visit |
| **Friend milestone** | 500 | At 5 completed referrals |
| **Monthly stipend** | Pro 300 · Premium 1 000 | Credited on renewal |

---

## 8. The mission catalogue

Missions are the surfaced, legible expression of everything above — a to-do list that makes earning visible. **68 missions across seven bands.** Rewards below are **in addition to** the underlying action's own points (a mission to scan pays its reward *plus* the normal scan points).

### 8.1 DAILY — resets every day (12)

| # | Mission | Trigger | Reward |
|---|---|---|---|
| 1 | **Daily check-in** | Open the app | 5 |
| 2 | **Today's game** | Play the featured game | 25 |
| 3 | **Warm up** | Play any one round | 10 |
| 4 | **Empty the tank** | Spend all your energy | 15 |
| 5 | **Record a visit** | One confirmed scan | 20 |
| 6 | **Flawless** | Score 100% in any game | 20 |
| 7 | **Mix it up** | Play two different games | 15 |
| 8 | **Window shopping** | Open a deal you haven't seen | 5 |
| 9 | **New record** | Beat a personal best | 20 |
| 10 | **Early bird** | Scan before 10:00 | 15 |
| 11 | **Night owl** | Play a round after 21:00 | 10 |
| 12 | **On a roll** | 3 correct answers in a row | 10 |

### 8.2 WEEKLY — resets Monday (12)

| # | Mission | Trigger | Reward |
|---|---|---|---|
| 13 | **Five-day player** | Play on 5 different days | 50 |
| 14 | **Three venues** | Visit 3 different venues | 60 |
| 15 | **Full deck** | Play all 8 games in one week | 80 |
| 16 | **Point hunter** | Earn 300 points this week | 40 |
| 17 | **Regular** | 5 confirmed scans | 50 |
| 18 | **Somewhere new** | Visit a venue for the first time | 50 |
| 19 | **Ten rounds** | Complete 10 game rounds | 40 |
| 20 | **Unbroken** | Keep your streak all week | 60 |
| 21 | **Cash it in** | Redeem a voucher | 40 |
| 22 | **Weekend warrior** | Scan on both Saturday and Sunday | 40 |
| 23 | **Explorer** | Visit two different categories | 55 |
| 24 | **Quiz master** | 100% in all three quiz games | 70 |

### 8.3 ONGOING — long arcs, no reset (15)

| # | Mission | Trigger | Reward |
|---|---|---|---|
| 25 | **Keep your streak** | Play each day | streak +1 |
| 26 | **Week one** | 7-day streak | 50 |
| 27 | **Month strong** | 30-day streak | 250 |
| 28 | **Centurion** | 100-day streak | 1 000 |
| 29 | **Earn a freeze** | Every 7 days of streak | 1 freeze |
| 30 | **Bring a friend** | Friend's first confirmed visit | 100 |
| 31 | **Friend milestone** | 5 completed referrals | 500 |
| 32 | **Fill a stamp card** | Complete a loyalty card | 100 / 150 / 250 |
| 33 | **New category** | First venue in a category | 25 / 50 / 100 |
| 34 | **City explorer** | Visit 10 different venues | 200 |
| 35 | **Local legend** | 25 visits to one venue | 250 |
| 36 | **Game master** | A perfect round in all 8 games | 200 |
| 37 | **Collector** | 5 000 points earned lifetime | 300 |
| 38 | **High roller** | 20 000 points earned lifetime | 750 |
| 39 | **Tier climber** | Reach the 15% voucher tier | 100 |

### 8.4 ONE-TIME — onboarding and occasions (17)

| # | Mission | Trigger | Reward |
|---|---|---|---|
| 40 | **Finish setup** | Complete onboarding | 50 |
| 41 | **Your first game** | First finished round | 10 × 5 |
| 42 | **Complete your profile** | All seven fields | 50 |
| 43 | **Pick your interests** | Choose categories | 25 |
| 44 | **Your very first scan** | First confirmed scan ever | 100 |
| 45 | **First visit** | First time at a venue | 100 / 150 / 250 |
| 46 | **Stay in the loop** | Enable notifications | 20 |
| 47 | **Show your face** | Add a profile photo | 15 |
| 48 | **First review** | Review a venue after a visit | 25 |
| 49 | **Try everything** | Play all 8 games once | 200 |
| 50 | **First voucher** | Redeem your first voucher | 50 |
| 51 | **First gift card** | Claim a gift card *(Pro+)* | 50 |
| 52 | **Join a club** | Buy your first venue Pass | 100 |
| 53 | **Use your Pass** | First Pass redemption | 50 |
| 54 | **First order** | Place your first order-ahead | 75 |
| 55 | **Birthday** | Once a year | 200 |
| 56 | **Anniversary** | One year with Paylez | 200 |

### 8.5 SEASONAL & LIMITED — time-boxed, run by Paylez (6)

| # | Mission | Trigger | Reward |
|---|---|---|---|
| 57 | **Rainy day** | Play or visit on a rainy day | double game points |
| 58 | **Holiday special** | Christmas / Navruz / Eid windows | 150 |
| 59 | **Launch week** | Visit a newly joined venue in its first week | 100 |
| 60 | **City challenge** | Community goal — all users hit a total | 200 each |
| 61 | **Flash mission** | A 2-hour window announced by push | 50 |
| 62 | **Language week** | Play Word Builder in a new language | 60 |

### 8.6 PARTNER-SPONSORED — funded by the venue (3)

| # | Mission | Trigger | Reward |
|---|---|---|---|
| 63 | **Venue takeover** | Visit a specific sponsoring venue | partner-set |
| 64 | **Quiet hours hero** | Visit during the venue's off-peak window | partner-set |
| 65 | **Try the new thing** | Order a specific new menu item | partner-set |

These cost Paylez nothing — the partner funds the reward from their own budget, exactly like a deal. They are also a **sellable Growth/Scale feature**.

### 8.7 LEARNING — practical content for new arrivals (3)

| # | Mission | Trigger | Reward |
|---|---|---|---|
| 66 | **How to register for a PESEL** | Complete the module (4 questions) | 60 |
| 67 | **What your umowa zlecenie means** | Complete the module (3 questions) | 45 |
| 68 | **Polish you need at the pharmacy** | Complete the module (5 questions) | 40 |

This band is the most on-brand content Paylez has — genuinely useful to an expat, and nothing a delivery app or a loyalty card can offer. Expand it over time (banking, renting, ZUS, driving licence).

---

## 9. Caps, guardrails and anti-abuse

### 9.1 Weekly game cap (backstop)
A ceiling on points earned from **games** per week. Set generously — it should catch exploits, not honest players.

| | Free | Pro | Premium |
|---|---|---|---|
| **Weekly game cap** | **450** | **600** | **1 000** |

(A perfect week of maximum play is ~365 / 507 / 816, so the cap sits ~20% above the honest ceiling.)

### 9.2 Per-action caps
- **Deal shared:** 3 per day · **Reviews:** 1 per venue per 30 days · **Personal best bonus:** once per game per day · **Energy refund:** one abandoned round per day.
- **Daily check-in:** strictly once per calendar day in the user's timezone.
- **Comeback:** once per fixed 30-day grid window, not "30 days since the last one" — otherwise playing every third day pays a monthly bonus ten times a month.

### 9.3 Server authority
Every award is written by the server to the **append-only points ledger**, with a reason and a reference. Balances are always derived by summing the ledger, never stored as a mutable number. Specifically: **game results are validated server-side** (seeded boards, plausible score ranges, minimum round duration) — a client-reported score is a suggestion, not a fact.

### 9.4 The gift-card pool
Gift cards are the only Paylez-funded reward and are bounded three ways: **Pro and Premium only**, priced at **100 pts = 1 zł**, and drawn from a monthly pool capped at **20% of consumer subscription revenue**. Cards sell out — the scarcity counter in the app ("5 left this month") is a financial control, not decoration. Add a **per-user cap of one card per 60 days** so a handful of heavy users cannot capture the whole pool.

### 9.5 Points never expire
Earned points do not expire. Vouchers do (14/30/60 days by plan), and unredeemed vouchers return their budget to the partner — but the underlying points balance is the user's to keep. This is a trust decision: an expiring balance is the fastest way to make a loyalty scheme feel hostile.

---

## 10. Economy model — the sanity check

An engaged user (plays most days, ~10 venue visits a month, does the obvious missions):

| | **Games** | **Visits** | **Daily habit** | **Missions** | **Stipend** | **TOTAL / month** |
|---|---|---|---|---|---|---|
| **Free** | 870 | 400 | 162 | 450 | — | **~1 880** |
| **Pro** | 1 208 | 500 | 162 | 550 | 300 | **~2 720** |
| **Premium** | 1 942 | 700 | 162 | 650 | 1 000 | **~4 455** |

**Balance check:** games are **44–46%** of earnings and visit-linked activity ~30% — inside the target from Principle 1.

**What that buys per month:**

| | Gift-card equivalent | or 10%-off vouchers | or 5%-off vouchers |
|---|---|---|---|
| **Free** | ~19 zł | 3 | 6 |
| **Pro** | ~27 zł | 5 | 9 |
| **Premium** | ~45 zł | 8 | 14 |

A Free user earning ~1,880 points a month can claim roughly **3 ten-percent vouchers** — real, useful, and entirely partner-funded. That is the free tier doing its job (Principle 5) at no cost to Paylez.

**Casual user** (plays ~3 days/week, 4 visits/month): roughly 700–900 points/month on Free — about one 10% voucher plus change. Still worth opening the app.

---

## 11. Configuration reference

Every tunable in one place. **None of these should be hard-coded.**

```
# Currency
GIFT_CARD_RATE            100 pts = 1 zl        (Pro & Premium only)
VOUCHER_TIERS             5%:300  10%:500  15%:800
VOUCHER_CAPS              10 zl / 25 zl / 40 zl
VOUCHER_VALIDITY_DAYS     Free 14 | Pro 30 | Premium 60

# Energy
DAILY_ENERGY              Free 4  | Pro 6  | Premium 10
ENERGY_REGEN_MINUTES      Free 120| Pro 60 | Premium 30
PRACTICE_MODE_AT_ZERO     true (0 points)

# Games
POINTS_MULTIPLIER         Free 1.00 | Pro 1.25 | Premium 1.75
MAX_ROUND_POINTS          18
MIN_ROUND_POINTS          2
DECAY_BY_ROUND            1: 1.00 | 2: 0.65 | 3: 0.45 | 4: 0.30 | 5: 0.20 | 6+: 0.12
FEATURED_GAME_BONUS       1.5x  (first round of the featured game, once/day)
PERFECT_ROUND_BONUS       10
NEW_GAME_BONUS            25    (once per game)
PERSONAL_BEST_BONUS       8     (once per game per day)
WEEKLY_GAME_CAP           Free 450 | Pro 600 | Premium 1000
WORD_HINTS_PER_DAY        Free 3 | Pro 6 | Premium 10   (each hint: -10 performance)

# Visits
SCAN_POINTS               Free 20 | Pro 30 | Premium 50
FIRST_VISIT_POINTS        Free 100| Pro 150| Premium 250
NEW_CATEGORY_POINTS       Free 25 | Pro 50 | Premium 100
STAMP_POINTS              Free 100| Pro 150| Premium 250
VENUE_RATE_OVERRIDES_PLAN true
SPEND_BONUS               none

# Gate limits
MIN_SPEND                 15.00 zl
MAX_AMOUNT                1000.00 zl
VISITS_PER_DAY            1 per venue
QR_TTL_SECONDS            90
PENDING_TTL_MINUTES       15
BURST_PER_HOUR            12
TRAVEL_KM_PER_HOUR        900

# Streaks
FREEZE_EVERY_DAYS         7
MAX_FREEZES               Free 2 | Pro 5 | Premium unlimited
STREAK_MILESTONES         7:50 | 30:250 | 100:1000
COMEBACK                  100, once per fixed 30-day window

# One-offs
ONBOARDING 50 | WELCOME_ROUND 10x5 | FIRST_SCAN_EVER 100 | PROFILE_COMPLETE 50
CATEGORIES_PICKED 25 | DAILY_CHECKIN 5 | BIRTHDAY 200 | ANNIVERSARY 200
REVIEW_AFTER_VISIT 25 | DEAL_SHARED 25 (max 3/day)
INVITEE 100 | REFERRER 100 | FRIEND_MILESTONE 500 (at 5)
MONTHLY_STIPEND           Pro 300 | Premium 1000

# Gift-card pool
POOL_SHARE_OF_REVENUE     20%
PER_USER_CAP              1 card per 60 days
```

---

## 12. Open decisions

Three things to settle before this ships:

1. **The Premium stipend.** The config advertises `monthly_stipend: 200` but no code pays it. At 200 points (~2 zł against a 19.99 zł fee) it is close to meaningless. This rulebook assumes **1 000 for Premium and 300 for Pro** — either wire those, or remove the promise from the plan.
2. **The gift-card rate.** Today's build prices gift cards at **50 pts = 1 zł**, which makes the Paylez-funded reward *more* generous than the partner-funded voucher — backwards. This rulebook assumes the corrected **100 pts = 1 zł**.
3. **Seasonal and partner-sponsored missions need an operator surface** — someone has to create mission #57–65. That is a small admin tool, and it should exist before those bands are promised to partners.

---

*All values modelled against each other in §10. Changing any earning rate requires re-running that model — the balance between games, visits and missions is the thing being protected, not any individual number.*
