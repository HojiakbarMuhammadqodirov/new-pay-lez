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
    /** §2.3. Points expire twelve months after they are earned, FIFO. */
    expiryMonths: 12,
    /** How far ahead the "points expiring soon" notification fires. */
    expiryWarningDays: 30,
    /**
     * §2.4. A backstop, not the primary limit — the lives pool is that. It
     * exists for the exploit that slips past lives, so it is set well above a
     * normal day's play (three rounds at ~50) and well below a grind.
     */
    dailyGameCap: 150,
    /** §8.1. Both sides of a referral, paid on the invited user's first scan. */
    referralReward: 200,
    welcomeBonus: 100,
    /** §7.2. Shared across every game, reset at the user's local midnight. */
    dailyLives: 3,
    /** What a scan pays before any venue-specific multiplier. */
    scanEarn: 5,
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
    /** Questions in a quiz round, and the mistakes a round survives. */
    quizQuestions: 5,
    quizMistakes: 2,
    quizPerCorrect: 5,
    /** Word Builder (§7.3), matching `src/site/auth/player.ts` exactly — the
     *  client's copy is the display, this one decides the points. */
    wordBase: 5,
    wordTierBonus: [0, 2, 4],
    wordFirstTry: 3,
    wordSpeedFast: 3,
    wordSpeedOk: 1,
    wordFastSeconds: 15,
    wordOkSeconds: 30,
    wordPerfectBonus: 10,
    wordsPerRound: 5,
    /** Memory Match. */
    memoryPerPair: 6,
    memoryFlawlessBonus: 10,
    memoryReasonableMoves: 16,
    memoryPairs: 6,
    /** The endless flight: gaps a single run may bank, so an animation loop
     *  cannot multiply an unbounded number into a balance. */
    flightPerGap: 2,
    flightTarget: 12,
    maxFlightGaps: 99,
    /** Streak freezes: earned one per this many days, this many held. */
    freezeEvery: 7,
    maxFreezes: 2,
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
