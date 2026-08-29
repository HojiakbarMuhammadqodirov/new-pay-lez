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
    /**
     * §2.3. How long points live, FIFO. This is the *floor*: a plan may buy a
     * longer window through the `points_expiry_months` entitlement, and on
     * Premium it buys no expiry at all. `ledger.ts` reads the entitlement and
     * falls back to this — it used to read this and ignore the entitlement,
     * which is why a paying subscriber's points still expired at twelve months.
     */
    expiryMonths: 12,
    /** How far ahead the "points expiring soon" notification fires. */
    expiryWarningDays: 30,
    /**
     * §7.2. Shared across every game, reset at the user's local midnight. A
     * plan may raise it (`daily_lives`), and Premium removes it entirely.
     *
     * It is no longer the primary brake on earning: only a *loss* ever spent
     * one, and two of the seven games cannot be lost. `games.decay` is what
     * actually bounds a day now — see the note there.
     */
    dailyLives: 3,
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
    /** A scan or tap, before the venue's own rate and the plan multiplier. */
    scan: 25,
    /** Spending over the venue minimum: this many points per step, capped. */
    spendStepMinor: 1000,
    spendStepPoints: 5,
    spendMaxSteps: 5,
    /** One-offs at a venue. */
    firstVisitToVenue: 100,
    stampCardComplete: 200,
    newCategory: 50,
    reviewAfterVisit: 25,
    /** Bringing people in. Flat on every plan, so nobody subscribes for a day
        and harvests them. */
    referrerFirstVisit: 100,
    inviteeJoin: 100,
    friendMilestoneAt: 5,
    friendMilestone: 500,
    dealShared: 25,
    dealSharedPerDay: 3,
    /** Turning up. */
    dailyCheckIn: 5,
    /** Streak day → points. Paid once, when the streak first reaches it. */
    streakMilestones: { 7: 50, 30: 250, 100: 1000 } as Record<number, number>,
    comeback: 25,
    comebackEveryDays: 30,
    /** Getting started, once each, the same on every plan. */
    onboarding: 100,
    verifyContact: 25,
    profileComplete: 50,
    categoriesPicked: 25,
    firstScanEver: 100,
    /** Occasions. */
    birthday: 200,
    anniversary: 200,
    /** Premium's monthly credit. It must stay worth clearly less than the
        subscription costs, or the plan refunds itself and becomes a coupon. */
    premiumStipend: 200,
  },

  /* ──────────────────────────────────────────── §3 the amount-capture gate ── */
  gate: {
    /** §3.2. 60–120s: long enough to walk to the counter, short enough that a
     *  photographed QR is dead before it can be shared. */
    qrTtlSeconds: 90,
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
    /** How long an issued voucher stays spendable before its reserve is released. */
    validityDays: 30,
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
  },

  /* ──────────────────────────────────────────────────── §7 the games ── */
  games: {
    /** §7.3. How many recently-served items to avoid repeating, per user, per
     *  game. The site's own bag rule is stricter (every item once before any
     *  twice); this is the server-side floor under it. */
    recentWindow: 40,

    /*
     * A round is a round.
     *
     * Roughly a minute of attention is worth roughly the same in every game,
     * so a player picks the one they enjoy instead of the one that pays. The
     * old table did the opposite: Poland maxed at 5 for the same five
     * questions Brain paid 25 for, and Memory Match paid a guaranteed 36 for a
     * board that cannot be lost.
     */

    /** Questions in a quiz round, and the mistakes a round survives. */
    quizQuestions: 5,
    quizMistakes: 2,
    quizPerCorrect: 1,
    /** All five right. The last question is worth having, which is the whole
     *  job of this bonus. */
    quizPerfectBonus: 5,

    /*
     * Word Builder. The tier is the word's own difficulty, read from
     * `word_bank.tier` — this is the only bank in the product that carries one,
     * and the server used to recompute it from the word's length instead.
     *
     * There is deliberately no speed bonus any more. Three constants existed
     * for one and none of them was ever read: every answer scored the same
     * flat point whatever the clock said.
     */
    wordBase: 1,
    wordTierBonus: [0, 1, 2],
    wordPerfectBonus: 3,
    wordsPerRound: 5,

    /*
     * Memory Match is scored on time and nothing else.
     *
     * Bands rather than a curve, so the result screen can say which one you
     * landed in and what the next one was worth. The last band has no ceiling
     * and still pays: finishing is always worth something, which is what keeps
     * the board approachable now that it is timed.
     *
     * Timed from the first move to the last, from the timestamps the server
     * already writes on every event — the client has no clock to borrow, and a
     * client-reported duration is one a modified client can invent.
     */
    memoryPairs: 6,
    memoryBands: [
      { underSeconds: 40, points: 12 },
      { underSeconds: 70, points: 8 },
      { underSeconds: 110, points: 4 },
      { underSeconds: null, points: 2 },
    ] as ReadonlyArray<{ underSeconds: number | null; points: number }>,

    /*
     * The endless flight. `flightTarget` gaps banks the round; every gap past it
     * still pays, up to a hard ceiling — one lucky run used to be worth four
     * days of everything else.
     */
    flightPerGap: 1,
    flightTarget: 5,
    flightMaxPoints: 20,

    /** Streak freezes: earned one per this many days. The count held is a
     *  plan entitlement (`streak_freezes`); Premium never breaks a streak. */
    freezeEvery: 7,

    /*
     * What a repeat of the same game pays, on the same day.
     *
     * This is the brake, and it is the only one: the daily points ceiling is
     * gone and lives never bounded anything much, because only a loss spent
     * one and two of the seven games cannot be lost.
     *
     * The free curve ends at zero on purpose. A tail that pays twenty percent
     * for ever is not a bound — unlimited play still makes unlimited points.
     * Playing on is never blocked; scores, streaks and the leaderboard all
     * keep counting. Only the points stop.
     *
     * Indexed by how many rounds of that game are already finished today; past
     * the end of the list the last entry repeats.
     */
    decay: {
      free: [1, 0.6, 0.4, 0.2, 0],
      pro: [1, 0.8, 0.6, 0.4, 0.2],
      premium: [1],
    } as Record<string, readonly number[]>,
  },

  /* ──────────────────────────────────────── §1.3 / B9 privacy thresholds ── */
  privacy: {
    /** §1.3. No aggregate is returned over fewer customers than this — the
     *  number that stops a "finding" from being one identifiable person. */
    minCohort: 10,
    /** B9. And no cross-venue benchmark over fewer venues than this. */
    minVenues: 5,
    /** The policy version stamped on new consent records. */
    policyVersion: '2026-08-07',
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

  /* ─────────────────────────────────────────────────────── sessions ── */
  auth: {
    sessionDays: 30,
    /** scrypt cost. 2^15 is ~100ms per hash here, which is the point. */
    scryptN: 32768,
    minPasswordLength: 6,
    /** Sign-in attempts per address per window, then a cool-off. */
    signInPerHour: 20,
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
