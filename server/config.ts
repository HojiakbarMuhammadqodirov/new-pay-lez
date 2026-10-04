/**
 * Every tunable in the backend, in one file.
 *
 * The repo's own rule — "constants live in config files, not inline" — with one
 * addition the front end does not need: the numbers here are *economic*, and a
 * few of them are the difference between a working loyalty program and one that
 * can be farmed. So each carries the constraint that set it, not a restatement
 * of its name.
 *
 * Anything an operator must be able to change without a deploy also has a row in
 * `platform_config` (desktop C6). This file is the default; the row wins.
 * `configFor()` in `domain/settings.ts` is the reader.
 */

export const CONFIG = {
  /* ─────────────────────────────────────────────────────────── the server ── */
  server: {
    port: Number(process.env.PORT ?? 8787),
    host: process.env.HOST ?? '127.0.0.1',
    /** Where the SQLite file lives. `:memory:` is what the self-test uses. */
    database: process.env.PAYLEZ_DB ?? 'server/data/paylez.db',
    /**
     * This API's own public address, for the few answers that must carry an
     * absolute URL — a logo's `image_url`, which the phone app loads as it is.
     * Unset, it is read off the request (`x-forwarded-proto` / `host`), which is
     * right on a laptop and wrong behind a proxy that rewrites `Host` — so the
     * VPS sets `PAYLEZ_API_URL=https://api.pay-lez.com`.
     */
    publicUrl: process.env.PAYLEZ_API_URL ?? '',
    /** The consumer web app's origin, for CORS and cookie scope. */
    origins: (process.env.PAYLEZ_ORIGINS ?? 'http://localhost:5173').split(','),
    /**
     * Signing key for QR payloads and session tokens.
     *
     * Read from the environment with a development fallback, and the fallback is
     * *logged loudly* at boot: a QR signing key that ships in a repo means
     * anybody can mint a scan for any venue, which is precisely the forgery §3.2
     * exists to stop.
     */
    secret: process.env.PAYLEZ_SECRET ?? 'dev-only-insecure-secret',
  },

  /* ───────────────────────────────────────────── §2 the points economy ── */
  points: {
    /*
     * §7.2 Energy. The floor; a plan raises it (`daily_energy`).
     *
     * **Every round costs one, win or lose, charged when it starts** (rulebook
     * §3 — it was charged at the finish until the rulebook moved it, so that
     * abandoning a round is no longer a free reroll; see `games.startSession`
     * and `CONFIG.games.energyRefundWithinSeconds`). It used to be losses
     * only, which made the pool a tax on being bad at quizzes and no bound at
     * all on anybody else: two of the seven games cannot be lost, and a player
     * answering correctly never touched it. Charging both sides is what makes
     * this the limiter rather than a decoration.
     *
     * What makes charging fair is that energy comes back on a clock rather than
     * at midnight: spend the tank at nine in the morning and the wait is an
     * hour or two, not the rest of the day. Read the two numbers below together
     * — four at two hours is eight hours from empty to full, and sixteen
     * finished rounds in a day from a full start; twelve a day at the steady
     * rate. Pro is twenty-four sustained and Premium forty-eight.
     *
     * The intervals have all been cut hard — 240 → 120 here, and the paid tiers
     * further still (180 → 60, 120 → 30). The ceiling did not move, so what a
     * plan buys is almost entirely the clock now: the tank is a burst allowance
     * and the refill is the day. That is the honest shape of it, because the
     * tank is what somebody spends in the first ten minutes and the refill is
     * what they plan an evening around.
     *
     * **This pair is the whole of what bounds a day.** There is no daily points
     * cap and no per-game taper: both existed once and both are gone. Anything
     * that wants to limit play belongs here, in the two numbers a player can
     * see on the screen, rather than in a second rule that shrinks the reward
     * for reasons nobody can count.
     */
    dailyEnergy: 4,
    /*
     * Rulebook §3: energy is spent **when a round starts**, so abandoning a
     * round still costs it — otherwise a player could open rounds and walk away
     * until the board or the questions looked easy. A round abandoned within
     * `energyRefundSeconds` of its start gets its energy back, at most
     * `energyRefundsPerDay` times a day: the accidental tap.
     */
    energyRefundSeconds: 5,
    energyRefundsPerDay: 1,
    /** Minutes to regenerate one energy, on the free plan. Paid plans are
     *  faster (`energy_regen_minutes`): 60 on Pro, 30 on Premium. */
    energyRegenMinutes: 120,
  },

  /* ─────────────────────────────────────────────── §2b what pays, and how much ──
   *
   * Every earning source in the product, in one table, so that changing what a
   * visit is worth is one edit rather than a hunt. Values are points and are
   * deliberately *relative* — the whole table scales by one factor the day an
   * exchange rate is set, and nothing here encodes money.
   *
   * The ordering principle: a venue visit is the only line somebody is paying
   * for, so it is anchored first and the games are priced under it.
   */
  earn: {
    /*
     * Every value here is the **free-plan** figure. Where a paid plan pays more
     * it does so through a named entitlement rather than a multiplier — `scan_points`,
     * `first_visit_points`, `stamp_points`, `new_category_points` — because a
     * table anybody can read beats an arithmetic rule nobody can predict. The
     * multiplier survives for **game rounds only**; applying it on top of these
     * would pay a paid plan twice for the same visit.
     */

    /** A scan or tap, before the venue's own rate. Pro 30, Premium 50. */
    scan: 20,

    /*
     * There is no spend bonus. Paying more used to earn more, in steps over the
     * venue minimum, and it was the one line here that made the reward depend
     * on the size of the bill rather than on the visit — which is the wrong
     * thing for a scheme whose whole argument to a venue is repeat custom.
     */

    /** One-offs at a venue. Pro/Premium raise all three. */
    firstVisitToVenue: 100,
    stampCardComplete: 100,
    newCategory: 25,
    /*
     * §7.3 / §9.2. A review left after a confirmed visit, **at most once per
     * venue per `reviewEveryDays`**. The window is rolling rather than a fixed
     * grid (unlike `comeback`), because it is keyed per venue and the thing it
     * bounds is one person re-reviewing one place — a grid would let a review
     * on the 29th and another on the 31st both pay. Paid by `social.review`.
     */
    reviewAfterVisit: 25,
    reviewEveryDays: 30,

    /** Bringing people in. Flat on every plan, so nobody subscribes for a day
        and harvests them. */
    referrerFirstVisit: 100,
    inviteeJoin: 100,
    friendMilestoneAt: 5,
    friendMilestone: 500,
    dealShared: 25,
    dealSharedPerDay: 3,

    /*
     * Turning up.
     *
     * The base day, and the one number to move if opening the app is worth more
     * or less than it is. Everything else about the check-in is a *shape* over
     * this figure rather than a second table of amounts, so the economy has one
     * dial and not eight.
     */
    dailyCheckIn: 5,
    /*
     * The seven-day cycle, as multiples of `dailyCheckIn` — **flat, since the
     * rulebook (§7.3, §11 `DAILY_CHECKIN 5`)**.
     *
     * It was `[1, 1, 1, 2, 2, 2, 4]`: a run-up that paid the seventh day four
     * times the first, 65 points a week. The rulebook prices opening the app at
     * a flat 5 a day and puts the whole of a week's reward for turning up into
     * the *streak milestones* (7 → 50) and the missions (#1 is this same 5), and
     * §10's "daily habit ≈ 162 a month" is built on the flat figure. A run-up on
     * top of a milestone on the same seventh day was paying for one habit twice.
     *
     * Kept as an array of seven ones rather than deleted, because the shape is
     * still what `GET /v1/daily` draws as its ladder and `cycleDay` still counts
     * through it: a client that renders seven rungs keeps rendering seven, each
     * honestly saying 5. Changing what a day is worth stays one edit
     * (`dailyCheckIn`), and bringing a run-up back is the other — though the
     * rulebook would have to change first.
     *
     * Thirty-five a week, ~150 a month on an unbroken streak: comfortably under
     * the lowest voucher rung (300), so a month of opening the app is half-way
     * to a reward and the other half is a visit.
     */
    checkInCycle: [1, 1, 1, 1, 1, 1, 1] as readonly number[],
    /*
     * How near the end of a day a live streak is reminded, in hours left.
     *
     * Not a payment, and it sits here anyway: somebody tuning what turning up is
     * worth is the same person deciding when to ask for it, and a reminder
     * filed under notifications is one they would never find.
     *
     * Six is chosen against the *product's* clock rather than the server's. The
     * day is the UTC slice, so six hours left is 18:00 UTC — 19:00 or 20:00 in
     * Warsaw, an evening. Quiet hours (`deals.quietFromMin`/`quietToMin`) close
     * the window at 21:00 local, so the push lands in that hour or two and not
     * at one in the morning; the inbox row is written either way, because
     * somebody who opens the app tomorrow should still see what they missed.
     *
     * A larger number does not send more reminders — it sends the same one
     * earlier, when the day still has plenty left in it and the message is a
     * nag rather than a prompt.
     */
    checkInRemindHoursLeft: 6,
    /**
     * Streak day → points. Paid once, when the streak first reaches it.
     *
     * Once *ever*, not once per streak: `source_ref` is `streak:7`, so a streak
     * that breaks at ninety and rebuilds does not pay the seven-day bonus again.
     * A milestone is for the first time somebody did the thing, and a lapse is
     * not a way to buy another one.
     */
    streakMilestones: { 7: 50, 30: 250, 100: 1000 } as Record<number, number>,
    /** Coming back after a lapse, once a month. Worth having rather than
        token: the round it accompanies is the one that restarts the habit. */
    comeback: 100,
    comebackEveryDays: 30,
    /*
     * **There is no flat featured-game bonus any more.** `dailyGame: 20` lived
     * here and was paid by `payDailyGame` as its own ledger entry, once a day,
     * for finishing the day's featured card. Rulebook §4.1 step 3 replaces it
     * with `CONFIG.games.featuredMultiplier` — ×1.5 on the round itself — and
     * the two must not both exist, or the featured card pays twice.
     *
     * The shape is the argument, not the amount. A flat 20 was worth the same to
     * a player who cleared the board and to one who opened the card and answered
     * nothing, which made the featured game the cheapest 20 points in the
     * product and made "play it" the whole of the strategy. A multiplier pays
     * for the round — 27 for a perfect one, 3 for an empty one — and it rides
     * the decay curve, so it cannot be collected on the ninth round of a day.
     *
     * Two readers had to move with it and both are worth knowing about:
     * `domain/tasks.ts` priced the `daily_game` task off this constant as an
     * *exact* promise and now quotes the featured ceiling as a "up to" figure
     * (`exact: false`), and `verify.ts` asserted on the constant directly.
     */

    /*
     * Getting started, once each, the same on every plan.
     *
     * There is no bonus for verifying an address or a number, because nothing
     * is verified any more — finishing the profile is the whole of it, and a
     * reward for clicking a link in an email was paying for a formality rather
     * than for anything a venue or a player gets.
     */
    /*
     * The welcome gift, paid for *finishing* onboarding.
     *
     * Half of the first hundred. The other half is the welcome round itself --
     * five flags at ten points each -- so somebody who answers all five walks
     * out with 100 and somebody who skips every one still walks out with 50
     * for opening the account. That split is the point: the gift is for
     * turning up and the rest is for playing, and the screen can say so
     * because the two numbers are separate.
     */
    onboarding: 50,

    /**
     * The welcome round, per correct answer.
     *
     * Ten a question, flat, and it **bypasses the master formula entirely** —
     * no base, no decay, no featured multiplier, none of the three flat bonuses.
     * That is not an omission: the onboarding screen before this round offers
     * fifty points, the two numbers have to be the same promise (five right is
     * fifty, four is forty, none is nothing), and §4.1 cannot produce fifty from
     * one round of anything. Its ceiling is 18 before bonuses.
     *
     * The round is reported with `welcomeRound: true` and a `base` of 0, so a
     * client can tell the flat round from a formula one rather than inferring it.
     *
     * Read only where `scoreQuiz` is told the round is the welcome one, which
     * `finishSession` decides from the server's own secret **and** from this
     * being the player's first finished round. It is not a rate a client can
     * ask for.
     */
    welcomeRoundPerCorrect: 10,
    profileComplete: 50,
    categoriesPicked: 25,
    firstScanEver: 100,

    /** Occasions, once a year each (§7.3). Paid by `occasions.payDue` from the
        hourly job, keyed `birthday:<year>` / `anniversary:<year>`. */
    birthday: 200,
    anniversary: 200,
    /**
     * How many days late an occasion may still be paid.
     *
     * The job runs on an interval rather than at midnight, and a restart resets
     * its phase — so "is today the day" alone would lose the birthday of anyone
     * whose day fell in a gap. A week of grace makes a missed run cost nothing,
     * and the `<year>` key is what stops the grace paying twice.
     */
    occasionGraceDays: 7,

    /** Premium's monthly credit, and Pro's.

        Both must stay worth clearly less than the subscription costs, or the
        plan refunds itself and becomes a coupon. At the rulebook's anchor of
        100 pts = 1 zl these are 10 zl and 3 zl against fees of 39.99 and 19.99
        (`domain/settings.ts`) — a quarter and about a sixth, which is the margin
        the old value over-protected: 200 points was ~2 zl, and a perk nobody can
        feel is not a perk. Rulebook §7.3 / §11 `MONTHLY_STIPEND`.

        These are advertised by `plan_entitlements.monthly_stipend` and paid by
        `jobs.runMonthly`. Before 2026-09-26 the key was read by nothing at all
        and Premium's 200 was never credited to anybody. */
    premiumStipend: 1000,
    proStipend: 300,
  },

  /* ──────────────────────────────────────────── §3 the amount-capture gate ── */
  gate: {
    /** §3.2. 60–120s: long enough to walk to the counter, short enough that a
     *  photographed QR is dead before it can be shared. */
    qrTtlSeconds: 90,
    /** FLUTTER-BRIEF §3b. A customer's redemption pass. Longer than the venue's
     *  QR because it is shown while the customer waits to pay, not minted on a
     *  timer at the till — and it is still single use and bound to one voucher,
     *  one venue and one amount, so a photograph of it buys nothing. */
    passTtlSeconds: 600,
    /** How long a PENDING transaction waits for the cashier before it expires.
     *  Nothing is granted while it waits, so this is a cleanup bound, not a
     *  risk one — but a pending row holds a reserve, and a reserve that never
     *  releases is an available pool that shrinks for no reason. */
    pendingTtlMinutes: 15,
    /** §5.2. Default minimum spend for a scan to count as a visit; per venue. */
    minSpendMinor: 1500,
    /** §3.4. Default implausible-amount ceiling; per venue. */
    maxAmountMinor: 100_000,
    /** §13. One qualifying scan per user per venue per day. */
    visitsPerDay: 1,
    /** §13 impossible travel: two confirmed scans this far apart in km within
     *  this many minutes is physically impossible and opens a fraud case. */
    travelKmPerHour: 900,
    /** §13 burst detection: scans by one account across all venues per hour. */
    burstPerHour: 12,
  },

  /* ───────────────────────────────────────────────────── §4 vouchers ── */
  vouchers: {
    /** §4.1. The three tiers a venue configures, as defaults for a new venue. */
    defaultTiers: [
      { pct: 5, points: 300, maxDiscountMinor: 1000 },
      { pct: 10, points: 500, maxDiscountMinor: 2500 },
      { pct: 15, points: 800, maxDiscountMinor: 4000 },
    ],
    /** How long an issued voucher stays spendable before its reserve is released.
     *  The fallback only: the plan's `voucher_validity_days` (14 / 30 / 60,
     *  rulebook §2.1) is what is read. */
    validityDays: 30,
    /**
     * How far a venue's own ladder may stray from `defaultTiers`, in basis
     * points of the platform's price for the same percentage.
     *
     * A venue sets its own rungs, and before this nothing bounded them — four
     * live venues sold 5% off for **30 points**, a tenth of the platform's 300.
     * The partner pays for the discount, so it is not the platform's money at
     * stake; it is the *currency's*. Principle 2 is that a point is worth
     * something legible (~1.2 gr realised on a voucher), and a venue pricing a
     * rung at a tenth of the ladder makes every other venue's price look like a
     * rip-off and makes a points balance mean ten different things.
     *
     * So a rung may be cheaper than the ladder — a venue buying custom with a
     * sharper offer is the product working — but not by more than a fifth, and
     * it may be dearer but not by more than three times, past which it is a
     * rung nobody will ever reach dressed up as an offer. The price for a
     * percentage the ladder does not name is interpolated between its rungs
     * (`vouchers.ladderPrice`).
     *
     * Enforced when a rung is **written** (`partners.setVoucherTiers`). Rungs
     * already stored are not rewritten by a boot — an operator reprices those.
     */
    partnerTierFloorBp: 8000,
    partnerTierCeilingBp: 30000,
    /**
     * §4.4. The tolerance buffer, in basis points of the budget.
     *
     * It exists so a customer who legitimately earned a voucher is not refused
     * at the counter because an average-check estimate was a few złoty off.
     * Overspend is bounded by the per-voucher cap, so the worst case is one
     * capped discount past the pool rather than an open tab.
     */
    toleranceBp: 500,
    /** §4.4. Below this share of the pool, stop issuing the highest tier first
     *  and fall back down the ladder. Never switch vouchers off entirely. */
    degradeAtBp: 1500,
    /** §4.5. Confirmed transactions needed before the median replaces the
     *  category default, and the window it is computed over. */
    avgCheckMinSamples: 30,
    avgCheckWindowDays: 30,
  },

  /* ──────────────────────────────────── rulebook §2.1 / §9.4 gift cards ── */
  /**
   * The only Paylez-funded reward, and so the only one bounded three ways.
   *
   * Vouchers cost Paylez nothing — a partner pays the discount when it is
   * spent. A gift card is face value bought by the platform, which is why the
   * rulebook fences it: paying tiers only, priced so it is never *better* value
   * than a voucher, and drawn from a pool that cannot outgrow the revenue that
   * funds it. Each line below is one of those fences, and `vouchers.giftCardShelf`
   * / `vouchers.redeemGiftCard` are the only readers.
   */
  giftCards: {
    /**
     * §2.1 `GIFT_CARD_RATE`: **100 points = 1 zł** of face value.
     *
     * It was whatever an operator typed into `gift_card_stock.points_cost`, and
     * the build the rulebook audited priced cards at 50 = 1 zł — which made the
     * Paylez-funded reward twice as generous as the partner-funded voucher
     * (~1.2 gr/pt), exactly backwards. The price is now **derived** from the
     * card's face value on every read and every sale, so a typo on the shelf can
     * no longer re-price the currency. The stored `points_cost` is ignored.
     *
     * Points per one major unit of `anchorCurrency`. A card in another currency
     * is converted through `exchange_rates` first; a card whose currency has no
     * rate is not offered at all, because "the same number in a different
     * currency" is not a price.
     */
    pointsPerMajor: 100,
    anchorCurrency: 'PLN',
    /*
     * The plan gate is `gift_card_priority`, rulebook §9.4: Pro and Premium
     * only (`settings.ts`). It was opened to every account on 2026-10-03 and
     * closed again on the owner's instruction to follow the rulebook; opening
     * it is one value per plan, not code.
     */
    /** §9.4 `PER_USER_CAP`: one card per this many days, rolling, so a handful
     *  of heavy users cannot take the month's whole pool between them. */
    perUserEveryDays: 60,
    /**
     * §9.4 `POOL_SHARE_OF_REVENUE`: the month's cards, at face value, may not
     * exceed this share of the month's consumer subscription revenue.
     *
     * Revenue is the monthly price of every **paid** consumer subscription live
     * now (`source <> 'manual'`: an operator-assigned tier is a courtesy, not
     * income — see `vouchers.giftCardPool`). The spend side is the face value of
     * every card issued this calendar month. The counter a screen shows ("5 left
     * this month") is this pool divided by a card's face value, which is why it
     * is a financial control and not decoration.
     */
    poolShareBp: 2000,
    /**
     * A fixed monthly budget, in `anchorCurrency` major units, added to the
     * revenue share above. **0 by default — the rulebook's pool is the revenue
     * share alone**, so with no paid consumer subscription every card reads
     * "sold out this month". `PAYLEZ_GIFT_POOL_MONTHLY` is the way to fund it
     * on top without a deploy.
     */
    fixedMonthlyMajor: Number(process.env.PAYLEZ_GIFT_POOL_MONTHLY ?? 0),
  },

  /* ────────────────────────────────────────── §5 loyalty campaigns ── */
  loyalty: {
    /** §5.3. How long an earned reward stays available before release. */
    rewardValidityDays: 60,
    /** §5.4. The default split of the monthly budget, in basis points. */
    defaultLoyaltyBp: 6000,
    /** When one allocation is this close to empty and the other has surplus,
     *  the dashboard surfaces a rebalance prompt. */
    rebalancePromptBp: 1000,
  },

  /* ───────────────────────────────────────────────────────── browser push ── */
  push: {
    /**
     * When the daily game reminder is due, in minutes past local midnight —
     * the *player's* midnight, from the zone their browser reported. 18:00:
     * late enough that "you have not played today" is true of a day rather
     * than of a morning, early enough to still be an evening's round.
     */
    reminderAtMin: 18 * 60,
    /**
     * And the last minute it may still go out. Past this a server that was down
     * at six does not remind somebody at half past ten; the next day's six
     * o'clock is the next chance. Equal to the end of quiet hours on purpose.
     */
    reminderUntilMin: 21 * 60,
    /**
     * How long a push service holds a message for a browser that is offline,
     * in seconds. A reminder about *today* delivered tomorrow is wrong, so it
     * dies with the evening.
     */
    ttlSeconds: 3 * 3600,
    /**
     * When the "your streak is about to break" push is due, on the player's
     * clock. Later than the daily reminder (it is the last call, not the first)
     * and still inside `reminderUntilMin`, which is the end of quiet hours.
     */
    streakAtMin: 20 * 60,
    /**
     * How late after the tank fills the "energy is full" push may still go
     * out, in minutes. The job runs every minute; this is the slack for a run
     * that was missed, and past it the moment has gone.
     */
    energyFullWithinMin: 15,
    /**
     * The kinds a **browser** is pushed — the four a player can switch on in
     * the profile (`domain/reminders.ts`). Every other kind (the check-in
     * streak, a venue's deal) still reaches the inbox and the phone app, and
     * never a browser tab; these four reach the inbox on the phone too, and are
     * pushed only to a browser.
     */
    webKinds: ['daily_game', 'energy_full', 'referral_reward', 'game_streak'] as readonly string[],
  },

  /* ──────────────────────────────────────────────── §6 / §9 deals & pushes ── */
  deals: {
    /** §6.2. An account younger than this is "newcomer" for audience targeting —
     *  derived from account age, never from self-declared origin (§1.4, §12). */
    newcomerDays: 180,
    /** A customer with no visit to this venue in this long is "lapsed". */
    lapsedDays: 60,
    /** §9.2. Quiet hours, venue-local. Nothing is delivered outside them. */
    quietFromMin: 7 * 60,
    quietToMin: 21 * 60,
    /** §9.1. Platform-level frequency cap per user across every source. A user
     *  targeted by six venues in a week is a user who turns push off. */
    userPushPerDay: 2,
    userPushPerWeek: 6,
    /**
     * §9.2. How late a scheduled push may still go out, in minutes.
     *
     * The dispatch job runs every few minutes, so a push normally leaves within
     * one run of its time. Past this it is marked `failed` instead of sent: a
     * lunch offer announced at five in the afternoon — because the server was
     * down at noon — sends people to something that has already happened, and
     * a push is the one message a customer cannot un-read.
     */
    pushLateMinutes: 60,
    /**
     * §9.2. How long after a push a recipient's counted visit is credited to it
     * (`deal_pushes.came_in`), in days.
     *
     * A week, because a push invites a visit soon — "this weekend", "before the
     * offer ends" — and a week covers every such invitation; past it, a regular's
     * ordinary next visit would be credited to a notification that had nothing
     * to do with it, and the one figure that says whether pushes work would say
     * they always do. Credited once per recipient per push.
     */
    pushCameInDays: 7,
  },

  /* ──────────────────────────────────────────────────── §7 the games ── */
  games: {
    /** §7.3. How many recently-served items to avoid repeating, per user, per
     *  game. The site's own bag rule is stricter (every item once before any
     *  twice); this is the server-side floor under it. */
    recentWindow: 40,
    /*
     * ══ the master formula (rulebook §4.1) ══
     *
     * **Every game is normalised onto one 0–100 performance scale, and the
     * points are computed from that scale and nothing else.** This is the whole
     * of what makes "a round is a round" true rather than aspirational: seven
     * games used to carry seven private payout tables, and the only thing
     * holding them level was somebody having last checked. Poland maxed at 5 for
     * the same five questions Brain paid 25 for; Memory Match paid a guaranteed
     * 36 for a board that cannot be lost. Under one scale a game can only be
     * mispriced by mapping its own result onto performance wrongly — which is a
     * single, reviewable function per game (§5 of the rulebook, `scoreQuiz` and
     * friends in `domain/games.ts`) — and never by its payout drifting away from
     * the others'.
     *
     *   1. the game produces PERFORMANCE, an integer 0..100
     *   2. base      = max(2, round(performance / 100 × 18))     → 2..18
     *   3. × 1.5     if this is the day's featured game, once per day
     *   4. × decay(roundToday)
     *   5. × points_multiplier (1 / 1.25 / 1.75)
     *   6. + flat bonuses: perfect 10, first-ever play 25, personal best 8
     *   7. final = max(1, round(step 5 + step 6))
     *
     * **The flat bonuses are added after the multiplier and are not multiplied
     * by it.** That is the rulebook's order and it is also the only order that
     * keeps them legible: a "+25 for a new game" that silently pays 44 on
     * Premium is a number no result card can name, and the three bonuses are
     * exactly the lines a result card exists to itemise.
     *
     * `roundPoints` in `domain/games.ts` is the one implementation, and it does
     * the arithmetic in **integers scaled by 100** rather than in floats — the
     * decay rungs are 0.65/0.45/0.3/0.2/0.12 and none of them is exactly
     * representable as a double, so a product landing on a .5 boundary is a
     * coin flip on representation dust. The published table in §4.2 of the
     * rulebook is a promise to players, and `verify:api` reproduces all
     * twenty-seven of its cells; that check is what stops this drifting.
     */

    /** §4.1 step 2. The most a perfect round can be worth before the featured
     *  multiplier, the decay, the plan and the flat bonuses. */
    maxRoundPoints: 18,
    /**
     * And the floor under a **finished** round, from the same step.
     *
     * "A finished round never pays zero" (§4.2): trying always beats not
     * trying, and a player who scored nothing at all still spent the energy and
     * still turned up. Two points is deliberately small enough that farming the
     * floor is worse than playing — the decay curve takes it to 1 by the third
     * round of the day — and large enough to be a number on a card.
     */
    minRoundPoints: 2,

    /**
     * §4.1 step 4. The decay curve, by which round of the **day** this is.
     *
     * Indexed from 0 for the first round; the last rung repeats for every round
     * past it, so a tenth round is worth what a sixth is. `roundToday` comes
     * from `daily_counters.lives_used + 1` — the paid rounds already recorded
     * today, plus this one — so a practice round does not push a player down
     * the curve and neither does an abandoned one.
     *
     * **This is the anti-grind lever, and it is the one that replaced the
     * per-game curve that used to live here.** The old one paid a repeat of the
     * *same* game less, which a player rotating seven games never met at all;
     * this one counts rounds rather than games, so there is nothing to rotate
     * away from. Read with energy — which bounds how many rounds exist — it
     * makes coming back tomorrow worth more than finishing the tank tonight,
     * and that is the behaviour the product wants: the first round of the day
     * is worth real points and the sixth is a token.
     *
     * A fraction rather than a percentage because step 4 is a multiplication;
     * `roundPoints` converts each rung to hundredths and multiplies in
     * integers, so what is written here is documentation and the arithmetic
     * cannot inherit a float's rounding.
     */
    decayByRound: [1, 0.65, 0.45, 0.3, 0.2, 0.12] as readonly number[],

    /**
     * §4.1 step 3 / §4.4. The day's featured game, ×1.5, **once per day**.
     *
     * This replaced a flat `CONFIG.earn.dailyGame: 20` paid as its own ledger
     * entry, and the replacement is not a re-pricing so much as a change of
     * shape. A flat bonus is worth the same to a player who cleared the board
     * and to one who answered nothing, so the featured card was the cheapest 20
     * points in the product and the way to take it was to open it and finish.
     * A multiplier pays for the round: 27 for a perfect one, 3 for an empty
     * one. It also travels with the decay, so the featured bonus cannot be
     * farmed on the ninth round of a day.
     *
     * "Once per day" is derived rather than stored — `featuredTakenToday` in
     * `domain/games.ts` reads the paid rounds already finished today — which is
     * the same argument the energy tank and the balance make: the rows that say
     * it are already written, and a second record of one fact is a second thing
     * to be wrong.
     */
    featuredMultiplier: 1.5,

    /**
     * §4.3 the three flat bonuses, added after the multiplier.
     *
     * **`perfectRoundBonus`** is paid on performance exactly 100, which is a
     * different statement in every game — five right, three words fast and
     * hint-free, a board cleared in ten moves, 25 obstacles — and that is the
     * point of having one scale: "perfect" means one thing on the card.
     *
     * **`newGameBonus`** is paid once per game, ever, and eight games make 200
     * points of lifetime discovery. It is the largest single bonus here on
     * purpose: the thing it is buying is a player trying the game they would
     * otherwise never open, and the featured rotation is the other half of that
     * argument.
     *
     * **`personalBestBonus`** is paid at most once per game per day, and only
     * when there is a previous best to beat — the round that *sets* a first
     * record takes `newGameBonus` instead, and paying both for one round would
     * be paying twice for the same fact. It needs the only new storage this
     * formula asks for (`player_game_bests`), because performance is computed
     * from events and never written to a session row, so unlike "has this
     * player played this game before" it cannot be derived from history.
     */
    perfectRoundBonus: 10,
    newGameBonus: 25,
    personalBestBonus: 8,

    /*
     * ══ §5: each game's own map onto performance ══
     */

    /**
     * Questions in a quiz round. **There is no mistake cap and a quiz cannot be
     * lost.** All five are asked however the first four went.
     *
     * A round used to end after two wrong answers, which made the fifth
     * question unreachable for exactly the player who most needed the practice,
     * and it made "won" a statement about how many mistakes somebody had left
     * rather than about how they did. The only distinction left worth drawing
     * is a clean sweep, and `won` is that.
     */
    quizQuestions: 5,
    /**
     * How many buttons a quiz question has, and therefore how many distractors
     * a row in `quiz_items` must carry.
     *
     * A number rather than an assumption, because the assumption was wrong on
     * real data and the symptom was a *question* rather than an error: a row
     * with one distractor renders two buttons, which is a coin flip presented
     * as a quiz — worth the same as a question with four options, and
     * conspicuous to a player in a way no log line noticed. Oceania's 14
     * countries did it to 14 flags and 14 capitals (see `pickDistractors` in
     * `db/import.ts` for the arithmetic that caused it).
     *
     * `buildQuiz` filters on it, so a short row that survives in a database
     * imported by an older build is never *asked*, and `main.ts` re-runs the
     * import when it finds one — the fix to the generator does not reach rows
     * already written.
     */
    quizOptions: 4,
    /**
     * §5.1–5.3. **20 performance a correct answer**, so five of five is exactly
     * 100 and a perfect quiz is a perfect round.
     *
     * The three quizzes share this line because they are three banks of one
     * game to a player — same five questions, same four buttons, same minute —
     * and a scoring difference between them would be somebody in Tashkent paid
     * differently for the same attention than somebody in Kraków. `poland` and
     * `uzbekistan` are two banks of one *card* and the same argument applies
     * twice over.
     */
    quizPerformancePerCorrect: 20,
    /**
     * §5.1. **+5 performance for a fast round, capped into the 100 with
     * everything else.**
     *
     * On a five-of-five round the cap eats it, which is not an accident: a
     * perfect round is already perfect, and the credit is there to move the
     * *partial* rounds — four right and quick is 85 where four right and slow
     * is 80.
     *
     * **It is deliberately not gated on a clean sweep any more**, and the
     * reason the old gate existed has gone with the old table. It was there
     * because the fastest way through five questions is to answer them all
     * wrong without reading them, and under a per-point table that bought a
     * real bonus. Under this one it buys nothing at all: five wrong answers in
     * a second is performance 5, and `max(2, round(5/100 × 18))` is 2 — exactly
     * what five wrong answers slowly pays, because the floor is already there.
     * A rule that cannot change an outcome is a rule to delete rather than to
     * keep explaining.
     *
     * Timed on the **whole round**, from the first event the server stamped to
     * the last — `elapsedSeconds` in `domain/games.ts`. The client has no clock
     * this module is willing to read.
     *
     * `withinSeconds` is compared with `<=`, and it is named for the
     * comparison: "under 25 seconds" and "up to 25 seconds" are different
     * rules, only one of them can be written with a `<`, and a round that lands
     * exactly on the boundary and silently loses the credit is the kind of
     * off-by-one nobody reports — they just feel robbed.
     */
    quizSpeedCredit: 5,
    quizSpeedWithinSeconds: 25,

    /**
     * §5.4 Word Builder. **Three words a round, not five.**
     *
     * Five was this server's number and three is the rulebook's, and the change
     * is a shortening of the round rather than a re-pricing of it: three words
     * at 33 performance each is the same 100 as five at 20 would be. A
     * three-word round is about forty seconds, which is the length the rest of
     * the set runs at — a five-word round was the longest minute in the product
     * and paid no more for it.
     *
     * **It is also a wire change with no shape to catch it**: `content.words`
     * simply has three entries. A client that drew five slots draws two empty
     * ones.
     */
    wordsPerRound: 3,
    /**
     * §5.4. 33 performance a word — and three solved words are **100, not 99**.
     *
     * `wordsPerRound × wordPerformancePerWord` is 99, and a clean sweep that
     * cannot reach a perfect round is a rule the player experiences as a bug:
     * every word solved, no hints, fast, and the card says 99% with no fourth
     * word to find. `scoreWords` promotes a full sweep to 100 for that reason,
     * which is exactly what the rulebook says to do ("99, rounded to 100 for
     * all three").
     *
     * The word's **tier** no longer prices it. `word_bank.tier` is still the
     * only human-set difficulty rating in the product and it still decides
     * which words are dealt and what the client can say about them — but a
     * scale where a hard word pays more is a scale where the *round* is worth
     * whatever it happened to deal, and "a round is a round" is the rule this
     * whole formula exists to enforce. Difficulty is now expressed by what a
     * player can do in the time rather than by a multiplier on the word.
     */
    wordPerformancePerWord: 33,
    /**
     * §5.4. **+4 performance for each word solved inside 30 seconds.**
     *
     * Per word rather than per round, which is the one place Word Builder is
     * timed differently from the quizzes, and it is deliberate: the round is
     * three separate puzzles and a player who solves two instantly and stares
     * at the third has earned the credit on two of them. `scoreWords` measures
     * each word from the previous solve — or from the round's own `started_at`
     * for the first — off the server's stamps.
     *
     * Read with the line above, the ceiling is 99 + 12 clamped to 100, so a
     * fast sweep is perfect and a slow sweep is still perfect. The credit is
     * what separates a fast *partial* round from a slow one — one word in 10
     * seconds is 37 where one word in a minute is 33.
     */
    wordSpeedCredit: 4,
    wordSpeedWithinSeconds: 30,
    /**
     * §5.4. **Each hint costs 10 performance.**
     *
     * A flat subtraction, where the rule before was halving that word's points
     * — and the flat version is the one that survives the move to a common
     * scale. Halving priced the reveal against the word's tier, which no longer
     * prices anything; 10 off 100 is the same tenth of a round whichever word
     * it was spent on, which is what makes pressing the button a decision
     * rather than a lottery.
     *
     * Hints are an entitlement, not a currency: `word_hints_per_day` is 3 free,
     * 6 on Pro, 10 on Premium, so the tier buys **help** and this line is what
     * stops it also buying points. Three hints on a three-word round is 30 off
     * — a solved-but-hinted round lands near 70, which is a real score for a
     * round somebody needed help with.
     *
     * The total is clamped into 0..100 afterwards, so hints cannot take a round
     * negative; the round's own floor of 2 points is what a 0 performance still
     * pays.
     */
    wordHintPenalty: 10,

    /**
     * §5.5 Memory Match. Six pairs, twelve cards.
     */
    memoryPairs: 6,
    /**
     * §5.5. **Completing the board is 60, and moves buy the rest.**
     *
     * This is the change the rulebook makes that is hardest to argue against
     * and easiest to get wrong, so it is worth stating both halves. Memory
     * Match was scored on **elapsed time** here, on the argument that moves are
     * the one thing a player can optimise away entirely by writing the board
     * down, and a stopwatch cannot be beaten with a pencil. That is true and it
     * is the wrong trade: a clock on the one game in the set with no fail state
     * — the deliberately accessible one, the one somebody plays because the
     * quizzes are in a language they are still learning — turns it into the
     * least accessible. It also made the cheapest 8 points on offer two `pair`
     * events a millisecond apart.
     *
     * Moves price the thing the game is actually about, which is remembering
     * what you saw. A six-pair board is six moves played perfectly, so the top
     * band's ten allows four mistakes; nineteen or more is the whole board
     * turned over by trial and error and still pays the 60 for finishing.
     *
     * **The pencil is real and it is bounded.** A player who writes the board
     * down reaches 100 instead of 85 — 18 points instead of 15 at decay 1 — and
     * spends a minute with a notepad to do it, once, on the one round of the
     * day that pays full. The clock's version of the same exploit was worth
     * more and needed no notepad.
     *
     * **A move is one `pair` event**, counted from `game_events` — the server's
     * own rows, never a client-reported total. A `peek` is not a move: it turns
     * one card, it carries no verdict, and it is how the shipped client shows
     * the first card of a move (see `submitEvent`). Counting peeks would charge
     * a client one move for turning one card and another for turning the
     * second, which is two moves for what the player experienced as one.
     */
    memoryBasePerformance: 60,
    /**
     * §5.5. The efficiency bonus on top of the 60, by moves used.
     *
     * `throughMoves` is **inclusive** and named for the comparison, the same
     * rule `quizSpeedWithinSeconds` above carries and for the same reason. The
     * last rung has no ceiling and pays nothing extra — finishing is always
     * worth the 60, which is what keeps the board approachable.
     *
     * Bands rather than a curve so a result screen can name the one the player
     * landed in and what the next one was worth. The totals are 100 / 85 / 72 /
     * 60, and the first of them is why a cleared board in ten moves is a
     * perfect round and takes the perfect-round bonus with it.
     */
    memoryMoveBands: [
      { throughMoves: 10, bonus: 40 },
      { throughMoves: 14, bonus: 25 },
      { throughMoves: 18, bonus: 12 },
      { throughMoves: null, bonus: 0 },
    ] as ReadonlyArray<{ throughMoves: number | null; bonus: number }>,
    /**
     * §5.5. The 90-second limit, and what an expired board is worth.
     *
     * `pairs_found / 6 × 50` — half marks for half a board, and the ceiling of
     * 50 is the whole of what the limit enforces: a board that ran out of time
     * cannot reach the 60 that completing it pays, however many pairs were
     * found. Six of six inside the limit is a completion and takes the bands
     * above instead.
     *
     * **Measured against the server's own stamps, and pair by pair.** The
     * deadline is 90 seconds after the round's first recorded event, and a pair
     * matched after it does not count — which is what lets an expired board be
     * scored on the pairs that were actually found in time rather than on
     * whatever the client posted afterwards. Timing from the first *event*
     * rather than from `started_at` is the forgiving direction on purpose: the
     * seconds a player spends looking at a freshly dealt board before touching
     * it are not seconds the limit should be eating.
     */
    memoryLimitSeconds: 90,
    memoryExpiredCeiling: 50,

    /**
     * §5.6 Bird flight. **4 performance an obstacle**, so 25 is perfect.
     *
     * The one game with no answer key — a physics loop the server did not run —
     * so the server cannot recompute this, only bound it. The bound is
     * `flightSecondsPerGap` below and it is the honest limit of what can be
     * said about a claim: the number of gaps a real run can have crossed is
     * bounded by how long the session was open.
     *
     * `flightTarget` decides whether the round was a **win**, not what it pays:
     * five gaps, matching the number the site's own screen shows the player. A
     * win the server and the client disagree about is worse than a hard target.
     *
     * The old `flightMaxPoints: 20` ceiling is gone because the 0..100 scale is
     * the ceiling now: 25 obstacles is 100, and a claim of a thousand is
     * clamped to the same 100 that a very good honest run reaches. Capping
     * performance rather than points is the stronger version of the same rule —
     * it does not have to guess how far a real player could fly, only how far a
     * perfect round goes.
     */
    flightPerformancePerObstacle: 4,
    /*
     * 2048 is scored on the **largest tile** the round made, read through these
     * bands from the top: the first floor the tile reaches is the performance.
     * Rulebook §5.7, verbatim. Below 64 the performance is 0 — and the master
     * formula's `minRoundPoints` still pays a finished round 2.
     *
     * There is **no time and no move limit**: a round ends when no swipe can
     * change the board, or when the player banks it. Energy is what bounds a
     * day, one per finished round, however long the round took.
     */
    mergeTileBands: [
      { tile: 2048, performance: 100 },
      { tile: 1024, performance: 85 },
      { tile: 512, performance: 65 },
      { tile: 256, performance: 50 },
      { tile: 128, performance: 35 },
      { tile: 64, performance: 20 },
    ],
    mergeFloorPerformance: 0,
    /** The tile that wins the round, and the last of the milestones `correct` counts. */
    mergeTarget: 2048,
    /*
     * Food Cross (`domain/foodCross.ts`), rulebook §5.8: twenty swaps a round,
     * performance = min(100, score ÷ 2,000 × 100). The score is the board's own
     * — foods × `SCORE_PER_FOOD`, multiplied by cascade level and by 4- and
     * 5-matches — so the target is reached by playing well, not by clearing a
     * fixed count.
     */
    foodMoves: 20,
    foodTargetScore: 2000,
    /*
     * Food Ninja (`domain/foodNinja.ts`), on the rulebook's one scale the way
     * the flight is: a fixed rate per food, capped at 100 — so 50 foods sliced
     * is a perfect round. A round throws about ninety, so the top is reachable
     * without being the whole schedule.
     *
     * The slack is how far either side of a food's real time in the air a slice
     * is still believed, measured on this server's clock from the round's
     * `start` event: a request takes time to arrive and a phone's frame can be
     * late. Generous on purpose, as the flight's allowance is — its job is to
     * refuse the impossible, not to referee the plausible.
     */
    ninjaPerformancePerFood: 2,
    ninjaSlackMs: 1500,
    /*
     * ── the five arcade games (`domain/arcade.ts`) ──
     *
     * Each maps onto the rulebook's 0..100 performance like the eight before
     * them: a count times a rate, capped, or a share of what the level holds.
     * The `…PerSecond` figures are the plausibility bounds on the three that
     * are reported rather than replayed — the fastest honest rate, generous on
     * purpose, plus a fixed allowance — the same arrangement as the flight's.
     */
    /** Snake: 4 a food, so 25 is a perfect round. Replayed, not reported. */
    snakePerformancePerFood: 4,
    /** How much longer than the round lasted a replay may run, in ms. */
    snakeSlackMs: 3000,
    /** Canon Numbers: 4 a block destroyed, so 25 is a perfect round. */
    cannonPerformancePerBlock: 4,
    /** Breakout: the share of the wall broken. At most four bricks a second. */
    breakoutBricksPerSecond: 4,
    breakoutAllowance: 4,
    /** Doodle Jump: 2 a platform climbed, so 50 is a perfect round. */
    doodlePerformancePerPlatform: 2,
    doodlePlatformsPerSecond: 3,
    doodleAllowance: 5,
    /** Zuma: the share of the chain cleared. */
    zumaBallsPerSecond: 5,
    zumaAllowance: 6,
    flightTarget: 5,
    /*
     * The plausibility bound on a claimed run, in seconds per gap.
     *
     * Columns arrive on a **timer** in the client (`interval` in
     * `src/site/flight/config.ts`), and the difficulty ramp deliberately leaves
     * that timer alone — it spreads the columns further apart in world units
     * instead. So this number is that one, and the gap count a run can honestly
     * have is bounded by its own duration, measured from two stamps this server
     * wrote. Change one and the other has to move with it: a client that
     * spawned faster than this would have honest runs clamped.
     *
     * The rulebook does not ask for this guard and it is kept anyway. Without
     * it a client posting 10,000 gaps one second after opening the session
     * banks a perfect round and looks in the ledger exactly like a very good
     * player.
     *
     * The allowance is slack, and generously so. Columns already on screen when
     * a run starts were not waited for, and the bound exists to refuse the
     * impossible rather than to referee the plausible.
     */
    flightSecondsPerGap: 1.75,
    flightGapAllowance: 3,

    /*
     * ══ §5.7 / §5.8: the two seeded games ══
     *
     * **These two are replayed, not reported.** `/start` hands the client a
     * 32-bit seed, the client plays the round locally, and `/finish` carries the
     * move list; `domain/engines/` replays it from the same seed and computes the
     * result, so a client's own claim of a score is never read. The rules an
     * independent implementation needs are in `server/GAMES-2048-FOODCROSS.md`,
     * with test vectors.
     *
     * Every value below is copied into the round's secret at `/start` and sent
     * to the client as `content`, so changing one here changes the *next* round
     * and never a round in flight — a board replayed on different rules from the
     * ones it was played on is a different board. That is also why the client
     * must read these off `content` rather than hard-code them.
     *
     * `minSecondsPerMove` is §9.3's "minimum round duration", made proportional
     * to the round: a replay of N moves is refused if the round was open for
     * less than N × this. Generous on purpose — it exists to refuse a script
     * posting a solved board a second after `/start`, not to referee a quick
     * thumb. A 2048 swipe is a flick and ten a second is beyond anybody; a Food
     * Cross swap waits for its own cascade to land, which is most of a second.
     */
    game2048: {
      size: 4,
      /** A spawned tile is a 4 one time in this many, else a 2. */
      fourOneIn: 10,
      startTiles: 2,
      /** A bound on the replay's work, not a rule of the game: 2048 takes ~1,000. */
      maxMoves: 20_000,
      /** §5.7's table, verbatim. Below the first band the performance is 0. */
      performanceByTile: [
        { tile: 64, performance: 20 },
        { tile: 128, performance: 35 },
        { tile: 256, performance: 50 },
        { tile: 512, performance: 65 },
        { tile: 1024, performance: 85 },
        { tile: 2048, performance: 100 },
      ] as ReadonlyArray<{ tile: number; performance: number }>,
      minSecondsPerMove: 0.1,
    },
    foodCross: {
      rows: 7,
      cols: 7,
      kinds: 6,
      /** §5.8: twenty swaps a round, and 2,000 is performance 100. */
      moves: 20,
      target: 2000,
      /*
       * The two multipliers §5.8 asks for — "cascades and 4+/5+ matches multiply
       * score" — and the one base they multiply. A run of L tiles scores
       * `tilePoints × L × runMultiplier[min(L, 5) - 3]`, so 3 → 30, 4 → 120,
       * 5 → 250; each cascade step multiplies its own runs by the step number,
       * capped at `cascadeCap`.
       *
       * Tuned by simulation over 400 seeded boards (2026-09-30): a player
       * choosing swaps **at random** finishes twenty moves on a median of
       * ~1,650 (performance ~82, p10 ~1,140); a naive greedy player that simply
       * takes the longest match nearest the bottom reaches 2,000 on 72% of
       * boards, typically by the fifteenth swap. That is the rulebook's "a
       * skilled player reaches the target well inside twenty moves", with the
       * luck of the refill still in it — which is what a match-3 is.
       */
      tilePoints: 10,
      runMultiplier: [1, 3, 5] as readonly number[],
      cascadeCap: 5,
      minSecondsPerMove: 0.5,
    },

    /*
     * §3: **energy is spent when a round starts**, and one abandoned inside its
     * first `energyRefundWithinSeconds` gives it back — at most
     * `energyRefundsPerDay` times a day (§9.2, "one abandoned round per day").
     * The refund is for the accidental tap; the once-a-day is what stops it
     * being a way to look at a board and put it back.
     */
    energyRefundWithinSeconds: 5,
    energyRefundsPerDay: 1,

    /*
     * §9.1 the weekly game cap, by plan code: points from **game rounds** in a
     * Monday-to-Sunday (UTC) week. A backstop set ~20% above an honest perfect
     * week (§9.1: ~365 / 507 / 816), so it catches an exploit and never a
     * player. A plan with no row here takes the free figure. Enforced in
     * `games.finish`, which trims the round to what is left and reports the
     * trim as `capped`.
     */
    weeklyGameCap: { free: 450, pro: 600, premium: 1000 } as Readonly<Record<string, number>>,

    /** Streak freezes: earned one per this many days. The count held is a
     *  plan entitlement (`streak_freezes`); Premium never breaks a streak. */
    freezeEvery: 7,
  },

  /* ──────────────────────────────────────────── rulebook §8 the missions ── */
  /**
   * Every number the mission catalogue pays or counts to, by mission id.
   *
   * The catalogue itself — which missions exist, which band, how progress is
   * derived — is `domain/missions.ts`, because *what* a mission watches is code.
   * *How much* it pays and *how far* it counts are tunables (§11), so they live
   * here, and a mission whose reward is missing from `rewards` is served with
   * `reward: null` rather than with a number somebody forgot to type.
   *
   * A mission's reward is **in addition to** the action's own points (§8): the
   * scan still pays its scan points, the round still pays its round. And it is
   * **flat on every plan** — §2.2 multiplies game points only, and a mission
   * that paid Premium 1.75× would be the multiplier leaking into the one-offs
   * the rulebook deliberately keeps per-plan-by-table instead.
   *
   * The missions that *mirror* an existing automatic bonus (the check-in, the
   * streak milestones, first visit, stamp card, onboarding and the rest) are not
   * here: they pay what `CONFIG.earn` already pays, through the code that
   * already pays it, and are shown as `autoPaid`. A reward listed here for one
   * of them would be the same bonus paid twice.
   */
  missions: {
    rewards: {
      /* §8.1 daily */
      'daily.todays_game': 25,
      'daily.warm_up': 10,
      'daily.empty_the_tank': 15,
      'daily.record_a_visit': 20,
      'daily.flawless': 20,
      'daily.mix_it_up': 15,
      'daily.window_shopping': 5,
      'daily.new_record': 20,
      'daily.early_bird': 15,
      'daily.night_owl': 10,
      'daily.on_a_roll': 10,
      /* §8.2 weekly */
      'weekly.five_day_player': 50,
      'weekly.three_venues': 60,
      'weekly.full_deck': 80,
      'weekly.point_hunter': 40,
      'weekly.regular': 50,
      'weekly.somewhere_new': 50,
      'weekly.ten_rounds': 40,
      'weekly.unbroken': 60,
      'weekly.cash_it_in': 40,
      'weekly.weekend_warrior': 40,
      'weekly.explorer': 55,
      'weekly.quiz_master': 70,
      /* §8.3 ongoing — the claimable ones; 25–33 mirror automatic bonuses */
      'ongoing.city_explorer': 200,
      'ongoing.local_legend': 250,
      'ongoing.game_master': 200,
      'ongoing.collector': 300,
      'ongoing.high_roller': 750,
      'ongoing.tier_climber': 100,
      /* §8.4 one-time — the claimable ones */
      'once.stay_in_the_loop': 20,
      'once.show_your_face': 15,
      'once.try_everything': 200,
      'once.first_voucher': 50,
      'once.first_gift_card': 50,
      'once.join_a_club': 100,
      'once.use_your_pass': 50,
      'once.first_order': 75,
      /* §8.7 learning */
      'learning.pesel': 60,
      'learning.umowa_zlecenie': 45,
      'learning.pharmacy_polish': 40,
    } as Record<string, number>,

    /**
     * §8.5 seasonal defaults, by campaign kind. An operator's row may carry its
     * own `reward`; these fill it when the row does not. Partner-sponsored
     * campaigns (§8.6) have no default — "partner-set" means the partner sets
     * it, and a partner campaign created without one is refused. `rainy_day` has
     * none either: its reward is the game points banked in its window, which is
     * what "double game points" means once the doubling is a second entry.
     */
    campaignRewards: {
      holiday: 150,
      launch_week: 100,
      city_challenge: 200,
      flash: 50,
      language_week: 60,
    } as Record<string, number>,

    /** #10 "Early bird": a scan whose venue-local hour is below this. */
    earlyBirdBeforeHour: 10,
    /**
     * #11 "Night owl": a round finished at or after this hour.
     *
     * The server does not know a player's clock — there is no time zone on an
     * account — so the hour is read in `clockTimezone`, the product's home. A
     * round at 21:00 in Kraków is 19:00 or 20:00 UTC, the same server day, so
     * this never pushes a round into a different daily period than the one it
     * is counted in.
     */
    nightOwlFromHour: 21,
    clockTimezone: 'Europe/Warsaw',

    /* The counts the rulebook names in words. */
    onARollInARow: 3,
    mixItUpGames: 2,
    fiveDayPlayerDays: 5,
    threeVenuesVenues: 3,
    pointHunterPoints: 300,
    regularScans: 5,
    tenRoundsRounds: 10,
    explorerCategories: 2,
    cityExplorerVenues: 10,
    localLegendVisits: 25,
    collectorPoints: 5000,
    highRollerPoints: 20000,
    /** #59: how long a venue counts as "newly joined", from its verification. */
    launchWeekDays: 7,
  },

  /* ──────────────────────────────────────── §1.3 / B9 privacy thresholds ── */
  privacy: {
    /** §1.3. No aggregate is returned over fewer customers than this — the
     *  number that stops a "finding" from being one identifiable person. */
    minCohort: 10,
    /** B9. And no cross-venue benchmark over fewer venues than this. */
    minVenues: 5,
    /** The policy version stamped on new consent records — the date the
     *  documents a person is shown today take effect. Terms 1.1 (referrals,
     *  §5) is effective 2026-10-18: §12 promises 14 days' notice of a
     *  material change, counted from 2026-10-04. Nothing compares this to old
     *  rows; it says which text a new consent was given to. */
    policyVersion: '2026-10-18',
  },

  /* ───────────────────────────────────────────────── §13 anti-fraud ── */
  fraud: {
    /** Trust tiers: confirmed transactions needed to reach tier 1 and 2. */
    tierThresholds: [0, 3, 15],
    /** Distinct accounts on one device before it is flagged. */
    devicesPerUser: 3,
    accountsPerDevice: 3,
    /** §13. How long a partner may dispute a committed transaction. */
    disputeWindowHours: 72,
  },

  /* ─────────────────────────────────────────── website traffic ── */
  traffic: {
    /**
     * How long a gap before the next page view is a new visit rather than the
     * same one. Thirty minutes is the figure every analytics tool settled on,
     * and the reason is the same here: shorter counts a long read as two
     * visits, longer counts tomorrow morning as last night.
     */
    sessionIdleMinutes: 30,
    /**
     * How long the per-event rows are kept. The daily rollups the console reads
     * are computed from them, so this is the limit on how far back a *new*
     * question can be asked — not on how far the charts go.
     */
    retentionDays: 400,
    /** Events accepted in one beacon. A tab that has been open all day batches. */
    maxBatch: 50,
    /** Paths are truncated rather than rejected: a long one is still a page. */
    maxPathLength: 120,
  },

  /* ────────────────────────────────────────── messages from the site ── */
  contact: {
    /**
     * How many messages one address, or one connection, may send in an hour.
     *
     * Five rather than one, because the realistic honest case is somebody who
     * writes, presses send, thinks of the screenshot they meant to describe,
     * and writes again — twice or three times over a few minutes. A limit that
     * catches that person is a limit that loses the detail they came back to
     * add. It is a bound against a script, and a script does not stop at five.
     *
     * Counted over both keys independently: the address bounds one person
     * hammering the form, and the rotating connection hash bounds one script
     * cycling addresses. Neither alone is enough — see `domain/contact.ts`.
     */
    perHour: 5,
  },

  /* ─────────────────────────────────────────────────── exchange rates ── */

  /**
   * Where the rates come from, and how often.
   *
   * ## The URL
   *
   * The sheet handed over for the converter, read as **CSV over plain HTTP**
   * (`gviz/tq?tqx=out:csv`, which every link-shared Google Sheet serves). No
   * Google API, no key, no OAuth, no client library and **no quota**: this is a
   * GET for a document Google already publishes, not an API call.
   *
   * The sheet id is the whole configuration, and it is *not* a secret — the
   * document is readable by link — so it lives here rather than in
   * `/etc/paylez/paylez.env`. Overridable by environment for the obvious reason:
   * a staging box pointed at a copy of the sheet must not be one edit away from
   * moving production's prices.
   *
   * ## The cadence
   *
   * Twice a day, in `runTwiceDaily` (`jobs.ts`). That is the requirement and it
   * is also about as often as this sheet is worth reading: nothing here settles
   * a payment, and the figures it feeds are a price tag and a converter.
   *
   * The scheduler is the *existing* one — this process is long-running and
   * already runs four jobs, so the marginal cost of a fifth is two HTTP GETs a
   * day. A serverless function on a cron would be a second deployment target, a
   * second place secrets live and a second thing to notice has stopped, for the
   * same two requests. `domain/rates.ts` carries that comparison in full.
   */
  rates: {
    sheetId: process.env.PAYLEZ_RATES_SHEET ?? '1ieUf8ZMiVPY6pXVKVpQVS_L1mIN6hUkmCWUdGzSA5Eg',
    get sheetUrl(): string {
      return `https://docs.google.com/spreadsheets/d/${this.sheetId}/gviz/tq?tqx=out:csv`;
    },
    /**
     * How long to wait for it.
     *
     * Ten seconds, which is long for this server and right for this caller: it
     * is a background job with nobody waiting on it, and the alternative to
     * waiting is another twelve hours of stale rates. Compare
     * `media.timeoutMs` (4s), which is inside a request somebody is watching.
     */
    timeoutMs: 10_000,
    /**
     * How stale a rate may get before a screen says so, in hours.
     *
     * Thirty-six, which is three missed syncs at a twelve-hour cadence. Two
     * would flag a single hiccup and a week would let the sync stop silently —
     * and this number's whole job is to be the line between "the sheet has not
     * changed" and "nothing has read the sheet".
     */
    staleHours: 36,
  },

  /* ──────────────────────────────────────────── logos and photographs ── */

  /**
   * The image proxy in `domain/media.ts` — what it will accept from somebody
   * else's host, and how long it will wait for it.
   *
   * `maxBytes` is a *logo*, and 256 kB is a generous one: the whole reason a
   * cap exists is that the thing at the other end is not ours, and a host
   * advertising 40 kB and sending 400 MB is the failure being bounded. Refused
   * rather than truncated — half an image is a corrupt image, and a corrupt
   * image cached for a year is worse than no image at all.
   *
   * `timeoutMs` is short because a hung fetch holds a request on *this* server
   * for the sake of a picture the client already has a fallback for. The same
   * argument `PAYLEZ_LLM_TIMEOUT_MS` makes, at a tenth the stakes.
   */
  media: {
    /**
     * Where logo files live on this server's disk — `media:<dir>/<file>` in a
     * logo column resolves under here. The VPS sets `PAYLEZ_MEDIA_DIR=/var/lib/paylez/media`;
     * a checkout keeps them beside its SQLite file. Not in the nightly database
     * backup: see DEPLOY.md.
     */
    dir: process.env.PAYLEZ_MEDIA_DIR ?? 'server/data/media',
    maxBytes: 256 * 1024,
    timeoutMs: 4000,
    /**
     * How long a browser may keep one.
     *
     * A week, and it is safe to be this long because the URL is keyed on the
     * *row* rather than on the bytes: an owner who replaces a logo changes
     * `venues.logo`, `assetFor` notices the source moved and re-fetches, and
     * the response a cached client is holding is the only thing that goes on
     * being stale. A logo is the right thing to be a week out of date about.
     */
    cacheSeconds: 604_800,
  },

  /* ──────────────────────────────────────────────────── rate limits ── */

  /**
   * Requests per rolling hour per caller, by endpoint — enforced by the `limit`
   * field on `Route` and `domain/limits.ts`.
   *
   * Every number here is a bound against a **script**, not against a person, so
   * each is set well above what a determined honest caller does and well below
   * what a loop does in a second. The two that are not obvious:
   *
   * - `signUpPerHour` is 5 per *connection*, not per address: the thing being
   *   bounded is minting accounts, and an address is a field the script fills
   *   in. Five is a household sharing a router, three of whom mistype something
   *   and start again.
   * - `gameStartPerHour` is above what energy allows on any plan (Premium's
   *   burst is 58 rounds), because energy already bounds the rounds that *pay*
   *   and this bounds the rounds that do not — a practice round costs nothing,
   *   which is exactly why it needs a ceiling of its own. 200 is six hours of
   *   continuous play at the fastest a quiz can honestly be finished.
   */
  limits: {
    signUpPerHour: 5,
    googleSignInPerHour: 20,
    guestPerHour: 10,
    passwordChangePerHour: 10,
    gameStartPerHour: 200,
    gameFinishPerHour: 200,
    checkInPerHour: 10,
    giftCardPerHour: 30,
    /* A claim is once per mission per period, guarded by its own key; these
       bound the *requests*, the way `checkInPerHour` does. Sixty is every
       mission on the screen claimed twice over. */
    missionClaimPerHour: 60,
    learningAnswersPerHour: 30,
    /* Invite codes are `PY` and four digits for most accounts — a space small
       enough to walk. Redeeming is once per account for good, so ten is a
       person retyping a misread code; the public lookup names a first name,
       so sixty per connection is a landing page reloaded, not a directory. */
    referralRedeemPerHour: 10,
    referralLookupPerHour: 60,
    /* Email codes (`domain/verification.ts`). The per-code attempt cap and the
       hourly send ceiling do the real work; these bound the requests. The two
       reset routes are unauthenticated, so they key on the connection. */
    sendCodePerHour: 10,
    verifyEmailPerHour: 30,
    resetCodePerHour: 10,
    resetPasswordPerHour: 20,
  },

  /* ─────────────────────────────────────────────────────── sessions ── */
  auth: {
    sessionDays: 30,
    /** scrypt cost. 2^15 is ~100ms per hash here, which is the point. */
    scryptN: 32768,
    minPasswordLength: 6,
    /** Sign-in attempts per address per window, then a cool-off. */
    signInPerHour: 20,

    /*
     * ── email codes (`domain/verification.ts`) ──
     *
     * `codeMinutes`: long enough to switch to a mail app and back, short enough
     * that a code left in an inbox is not a standing key.
     *
     * `codeAttempts` is **what makes six digits safe**: five wrong answers per
     * code is a one-in-two-hundred-thousand chance per code, however slowly.
     *
     * `codeCooldownSeconds` bounds the resend button; `codeSendsPerHour` bounds
     * using it to post mail to somebody else's address.
     */
    codeMinutes: 10,
    codeAttempts: 5,
    codeCooldownSeconds: 60,
    codeSendsPerHour: 5,
    /**
     * Accounts created before this moment are never gated on a proved address.
     * They signed up when nobody asked, and taking spending away from them on a
     * restart is the mistake the first version of this made. Set
     * `PAYLEZ_VERIFY_SINCE` to the deploy time.
     */
    verifySince: process.env.PAYLEZ_VERIFY_SINCE || '2026-10-03T00:00:00.000Z',
    /**
     * The Google OAuth client id, and the audience every ID token must name.
     *
     * Unset disables `/v1/auth/google` outright rather than defaulting to
     * something — the same argument as the admin credentials above. A verifier
     * with no expected audience accepts tokens Google issued for *any*
     * application, which is a sign-in endpoint that anyone with a Google
     * account and a different app can walk through. Absent means off; it never
     * means "accept anything".
     *
     * Public by nature — it ships in the browser bundle — so it is read from
     * the environment for deployment convenience, not for secrecy.
     */
    googleClientId: process.env.PAYLEZ_GOOGLE_CLIENT_ID ?? '',
    /**
     * The Google client *secret* — the one value in this pair that is a secret.
     *
     * Needed only by the authorisation-code exchange, which is what lets the
     * site draw its own sign-in button instead of Google's. Unset means the
     * `code` path is closed and only the direct ID-token path works, which is
     * the correct behaviour for a deployment that has not been given one: the
     * alternative is a button that opens a popup and then fails after the
     * person has already chosen an account.
     *
     * Never `VITE_`-prefixed, never in the repo, never in a response body.
     */
    googleClientSecret: process.env.PAYLEZ_GOOGLE_CLIENT_SECRET ?? '',
  },

  /* ────────────────────────────────────────────────── the language model ── */

  /**
   * The assistant's optional writer — see `ports/llm.ts` for what it may and may
   * not do, which is the part that matters.
   *
   * Off unless *both* `PAYLEZ_LLM=live` and a key are set. Two switches rather
   * than one because they answer different questions: the key says whether a
   * model *can* be called, the flag says whether this deployment *wants* one.
   * A staging box with the production key in its environment should not start
   * spending on it because someone copied an env file.
   */
  llm: {
    /**
     * `ANTHROPIC_API_KEY`, and it is a **server-side secret**.
     *
     * It lives in `/etc/paylez/paylez.env` beside `PAYLEZ_SECRET` and the Google
     * client secret, and it must never acquire a `VITE_` prefix: Vite bakes
     * those into the browser bundle, where a key is readable by anybody who
     * opens the site and spendable by anybody who reads it. The site never talks
     * to Anthropic — it talks to this server, which talks to Anthropic.
     */
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    /** `live` turns it on; anything else (including unset) leaves it off. */
    mode: process.env.PAYLEZ_LLM ?? 'off',
    /**
     * Claude Haiku 4.5.
     *
     * The job is to rewrite one already-correct sentence so it reads like a
     * person wrote it — the facts, the figures and the action are decided by
     * `domain/assistant.ts` before the model is called and are re-checked after
     * it answers. That is a small job, it is on the request path of a chat
     * panel, and it is the cheapest and fastest model in the family. Overridable
     * so the model can be changed without a deploy.
     */
    model: process.env.PAYLEZ_LLM_MODEL ?? 'claude-haiku-4-5',
    /**
     * Ceiling on the rewrite, in tokens.
     *
     * Small on purpose: the draft it is rewriting is one or two sentences, and a
     * ceiling this low is a second, cruder guard against a model that decides to
     * write an essay. A truncated rewrite fails the post-check below and the
     * draft is used instead, so the failure mode is "no worse than off".
     */
    maxTokens: Number(process.env.PAYLEZ_LLM_MAX_TOKENS ?? 400),
    /**
     * How long to wait before giving up and using the draft, ms.
     *
     * The assistant is a panel somebody is watching. Three seconds is roughly
     * the point at which a person decides a chat is broken, and the draft is
     * always ready — so waiting longer buys nothing but a worse answer later.
     */
    timeoutMs: Number(process.env.PAYLEZ_LLM_TIMEOUT_MS ?? 3000),
    /** The Messages API. Overridable for a proxy or a gateway. */
    baseUrl: process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
  },
} as const;

export type Config = typeof CONFIG;
