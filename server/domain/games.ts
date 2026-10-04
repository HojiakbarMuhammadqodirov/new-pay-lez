/**
 * The L-Earn engine — §7. Server-owned answers, server-computed scores.
 *
 * "**The server owns the answer.** For Word Builder the server holds the target
 * word; for Memory Match the deck layout; for quizzes the correct answers. The
 * client reports events; the server validates and scores. A modified client
 * cannot mint points."
 *
 * So `game_sessions.secret` never leaves this module. `startSession` returns a
 * *view* of the round with the answers stripped, `submitEvent` compares against
 * the stored secret, and `finish` computes the score from the events it accepted
 * rather than from anything the client totals up. The one exception is the
 * endless flight, which is a physics loop rather than a set of answers — it is
 * capped instead, and the comment on `scoreFlight` says exactly how much that is
 * worth.
 *
 * The scoring tables are the same ones `src/site/auth/player.ts` implements on
 * the client, kept in `config.ts`. That duplication is deliberate and one-way:
 * the client's copy decides what the *animation* says, this one decides what the
 * balance does.
 *
 * ## One scale, one formula — the points rulebook §4.1
 *
 * **Every scorer in this file answers one question: what was this round's
 * PERFORMANCE, as an integer from 0 to 100?** Nothing here converts a result
 * into points. `roundPoints` does that, once, from the performance and four
 * facts about the player: which round of the day it is, whether this is the
 * day's featured game, what their plan multiplies by, and which of the three
 * flat bonuses landed.
 *
 *     base  = max(2, round(performance / 100 × 18))      // 2..18
 *           × 1.5 if featured (once per day)
 *           × decay(roundToday)   1 · 0.65 · 0.45 · 0.3 · 0.2 · 0.12
 *           × points_multiplier   1 / 1.25 / 1.75
 *           + perfect 10 + first-ever play 25 + personal best 8
 *     final = max(1, round(that))
 *
 * Seven games used to carry seven private payout tables here, and the only thing
 * holding them level was somebody having last checked: Poland maxed at 5 for the
 * same five questions Brain paid 25 for. Under one scale a game can only be
 * mispriced by mapping its own result onto performance wrongly, which is one
 * small reviewable function per game, and never by its payout drifting.
 *
 * **Energy is still the only thing that bounds how many rounds exist**, and the
 * decay curve is what bounds what they are worth: one energy per finished round,
 * refilling on a clock, which is sixteen rounds a day from a full free tank, and
 * the sixth of them is worth 12% of the first. Those are two different limits
 * rather than two copies of one — how many, and how much — and a result card can
 * explain both.
 *
 * ## Where the rounding happens, and why it moved
 *
 * It used to be a single `floor` inside `ledger.earn`, and this comment used to
 * argue at length for putting it there: two of the scorers returned **halves** —
 * a hinted word was worth half its tier, a gap in the flight half a point — so
 * the round had to stay exact until after the plan multiplier or a player lost
 * the halves they had earned. That argument is retired with the tables that
 * caused it. **Every scorer now returns an integer**, so there are no halves
 * left in a round to protect.
 *
 * The rounding point moved to the end of `roundPoints` and became a **round**
 * rather than a floor, because that is what the rulebook's published payout
 * table (§4.2) is computed with: 70% featured is 13 × 1.5 = 19.5, and the table
 * promises 20. Flooring would print 19 beside a number a player was shown.
 * There is exactly one rounding step and it is the last one — and it is done in
 * **integer arithmetic scaled by a million**, because three of the decay rungs
 * are not exactly representable as doubles and a product landing on a .5
 * boundary would otherwise be decided by representation dust.
 *
 * `ledger.earn` is handed the finished integer and told so (`multiplierApplied`),
 * which is also what keeps the flat bonuses out of the multiplication: the
 * rulebook adds them after it, and a "+25 for a new game" that quietly paid 44
 * on Premium would be a line no result card could name.
 */
import { GAME_TYPES, type Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import * as entitlements from './entitlements.ts';
import * as ledger from './ledger.ts';
import { DomainError } from './errors.ts';
import { newId } from './ids.ts';
import * as merge from './merge2048.ts';
import * as food from './foodCross.ts';
import * as ninja from './foodNinja.ts';
import * as arcade from './arcade.ts';
import { createHmac } from 'node:crypto';
import { iso, now, secondsBetween, type Iso } from './time.ts';

/**
 * Derived from the tuple in `db/db.ts` rather than written out again here.
 *
 * The list has to exist in SQL — `game_sessions.game_type` carries a CHECK — and
 * the migration that widens that CHECK has to write it from TypeScript, so the
 * tuple lives with the migrations and everything else reads it: this type, the
 * route's `oneOf`, and the enum `openapi.ts` publishes. A game the enum offers
 * and the constraint refuses is a card the player can tap and the database will
 * not accept, which is why `assertGameTypes` reconciles the two on every boot.
 */
export type GameType = (typeof GAME_TYPES)[number];

/* Re-exported so the HTTP layer validates against the same tuple without
   reaching into `db/` for it. */
export { GAME_TYPES };

/**
 * The question-bank games.
 *
 * Five entries, four cards. `poland` and `uzbekistan` are one local-knowledge
 * quiz to the player — the client picks the bank from the country on their
 * profile and shows a single card — and two banks here, because `buildQuiz`
 * selects on `quiz_items.bank` and the bank name *is* the game type. They score
 * by exactly the same rules; nothing downstream distinguishes them.
 */
export const QUIZZES = new Set<GameType>([
  'flags',
  'capitals',
  'brain',
  'poland',
  'uzbekistan',
]);

/**
 * The flags the **welcome** round may ask, by ISO code.
 *
 * The flags bank prompts with the country's ISO 3166-1 alpha-2 code -- the
 * emoji is built by the client from it -- so restricting the welcome round is a
 * filter on `quiz_items.prompt` and needs no column and no migration.
 *
 * It exists because a uniform draw from 196 countries is the wrong first
 * ninety seconds of an account: real runs opened with Comoros against
 * Seychelles and Grenada against Dominica. Somebody who has just signed up is
 * being shown what the product is, and getting four of five wrong teaches them
 * that they are bad at it.
 *
 * Only the welcome round is restricted. The game on the Play screen keeps the
 * whole bank, because by then the player chose to play it.
 */
const WELCOME_FLAGS = [
  'PL', 'UZ', 'UA', 'RU', 'TR', 'DE', 'FR', 'IT', 'ES', 'GB',
  'US', 'CA', 'BR', 'AR', 'MX', 'CN', 'JP', 'KR', 'IN', 'ID',
  'SA', 'EG', 'ZA', 'NG', 'AU', 'NL', 'BE', 'SE', 'NO', 'FI',
  'DK', 'CH', 'AT', 'PT', 'GR', 'CZ', 'KZ', 'AZ', 'GE', 'IE',
];

export interface PlayerState {
  user_id: string;
  streak: number;
  longest_streak: number;
  freezes: number;
  /** Historical name — `player_states.lives` is the column, and it is not the
   *  tank. `energyFor` derives that; see the note at the insert below. */
  lives: number;
  answered: number;
  correct: number;
  last_played: string | null;
  difficulty: number;
}

/* ═════════════════════════════════════════════════════ §7.2 the energy pool ══ */

/** The user's own local day. What a *daily* allowance is counted in. */
const dayOf = (at: Iso): string => at.slice(0, 10);

export async function playerState(db: Db, userId: string, at: Iso = now()): Promise<PlayerState> {
  let state = await db.get<PlayerState>(`SELECT * FROM player_states WHERE user_id = $u`, { u: userId });
  if (!state) {
    await db.run(
      `INSERT INTO player_states (user_id, streak, longest_streak, freezes, lives, answered, correct, updated_at)
       VALUES ($u, 0, 0, 0, $l, 0, 0, $t)`,
      /* `lives` is seeded and then left alone. It is not the tank — `energyFor`
         derives that below — and keeping a second number in step with a count
         nothing stores is exactly the drift this design removes. The column
         keeps the old word because renaming one needs a version-guarded table
         rebuild against a live database and buys nothing anybody can see. */
      { u: userId, l: CONFIG.points.dailyEnergy, t: at },
    );
    state = (await db.get<PlayerState>(`SELECT * FROM player_states WHERE user_id = $u`, { u: userId }))!;
  }
  return state;
}

export interface Energy {
  /** Whole energy available at the instant asked about. */
  energy: number;
  /** The plan's ceiling — `daily_energy`, free 4. */
  max: number;
  /**
   * When the next one lands, or `null` at the ceiling.
   *
   * Carried by the `no_energy` refusal *and* by `/v1/games/state`, because a
   * wait with no visible end is the thing that makes an energy system feel
   * broken rather than strict. It is the whole of what buys the spend back.
   */
  nextAt: Iso | null;
}

/**
 * How much energy, and when the next one arrives.
 *
 * **Every finished round costs one, win or lose.** It was losses only, and
 * before that nothing at all, and both were the same mistake from opposite
 * ends: a pool charged only on a loss is a tax on being bad at quizzes — two of
 * the seven games cannot be lost, and a player answering correctly never
 * touched it — so it bounded the struggling player and nobody else. Charging
 * both sides is what makes this the limiter rather than a decoration, and it
 * makes the number on screen mean the same thing to everybody: rounds left.
 *
 * **The charge is taken when the round starts** (rulebook §3), and a round
 * abandoned after that still costs it: charging at the finish let a player open
 * rounds and walk away until the questions or the board looked easy, which is
 * rerolling for free. The one exception is the accidental tap — a round
 * abandoned within `energyRefundSeconds` of its start is refunded, at most
 * `energyRefundsPerDay` a day (`abandonActive`).
 *
 * What makes charging fair is the refill. Energy used to come back at midnight,
 * which is the rule that makes a pool punitive rather than strict: spend it at
 * nine in the morning and the day is over. It comes back **one per
 * `energy_regen_minutes`** now — two hours on the free plan, faster on a paid
 * one — so an empty tank is a wait measured in an hour or two. Read with the
 * ceiling it gives the size of a day:
 * `daily_energy + 1440 / energy_regen_minutes` rounds from full, 16 free, 30 on
 * Pro, 58 on Premium. The interval is where every tier difference now lives:
 * the ceilings are 4/6/10 as they were, and the clocks went 240/180/120 to
 * 120/60/30.
 *
 * **Nothing runs on a clock; the count is read off the spends.** There is no
 * scheduler in this process and a refill job would be one, so the tank is a
 * bucket that fills at a rate and is drained by the rounds already recorded in
 * `game_sessions.life_spent`, evaluated at the instant somebody asks. That is
 * the answer a timer would give with none of the moving parts, and it is the
 * house rule one table over: the balance is derived, never stored (§2.1).
 *
 * The record it reads is that column plus the row's `finished_at` — an existing
 * pair that already says energy went and when. Its name is historical and stays
 * that way: renaming a column needs a version-guarded table rebuild against a
 * live database and buys nothing a player can see. `daily_counters.lives_used`
 * cannot stand in either, for a reason that is not about its name: it is
 * bucketed by day, and a regen clock needs an instant.
 */
export async function energyFor(db: Db, userId: string, at: Iso = now()): Promise<Energy> {
  /* `at` and not `now()`: this function already takes the instant the tank is
     being read at, and the tank's *size* is a plan entitlement — so reading the
     plan at a different instant than the tank would give a player Premium's
     eight blocks against a free plan's regen clock, or the reverse. */
  const ent = await entitlements.entitlementsFor(db, { userId }, at);
  /* Both fall back to the free tier's own figure, so a deployment that has not
     seeded the keys yet plays like the free plan rather than like Premium. */
  const max = entitlements.entNumber(ent, 'daily_energy', CONFIG.points.dailyEnergy);
  const regen = entitlements.entNumber(
    ent,
    'energy_regen_minutes',
    CONFIG.points.energyRegenMinutes,
  );
  return await energyAt(db, userId, at, max, regen);
}

/**
 * How many spends back the walk below will read before it gives up looking for a
 * gap long enough to have refilled the tank.
 *
 * That gap is `max × interval` and it is usually one or two rows in: a player
 * who has not finished a round in eight hours is full on the free plan, and
 * nothing older than the round that broke that run can affect the count. The
 * limit bounds the pathological case instead — somebody who has finished a
 * round every ninety minutes for a fortnight, where no such gap exists — and
 * there the fold starts from a full tank further back than it should, which the
 * very next spend in the fold takes back off. It bounds the query, never the
 * rule.
 *
 * **The intervals have now been cut hard — free halved, Pro to a third, Premium
 * to a quarter — and both halves of the argument moved with it.** The gap the
 * walk looks for is much shorter: 8 hours free, 6 on Pro, 5 on Premium, where
 * it was 16/18/20, so the walk gives up looking sooner in wall-clock terms. And
 * the rows arrive faster, because a day is 16/30/58 finished rounds rather than
 * 10/14/22. What keeps sixty-four right is the second figure rather than the
 * first: the longest run of spends with no qualifying gap in it is one waking
 * day's play, because any sleep is longer than five hours, and the largest
 * waking day in the product is Premium's 58. Six rows of headroom is not much,
 * so **this is the first constant to move if `daily_energy` or the interval move
 * again** — and both have now moved once.
 */
const ENERGY_LOOKBACK = 64;

/**
 * The bucket: fill at one per interval, capped, drained one per finished round.
 *
 * Worked in **milliseconds of regeneration** rather than in fractional energy.
 * The fraction is the part that matters — a round finished at one hour
 * fifty-nine into a two-hour interval must leave that minute of progress on the
 * clock, not restart it, or the next round can cost two hours it did not earn —
 * and integer milliseconds carry it exactly where a float carries it to the last
 * bit and then floors to the wrong count.
 */
async function energyAt(db: Db, userId: string, at: Iso, plan: number, regenMinutes: number): Promise<Energy> {
  /* Floored: half an energy is not a thing the screen can draw, and a fractional
     ceiling never compares equal to a whole count, so `nextAt` would count down
     for ever to one that never lands. */
  const max = Math.max(0, Math.floor(plan));
  const interval = Math.max(1, Math.round(regenMinutes)) * 60_000;
  const full = max * interval;
  const asked = Date.parse(at);

  /* A spend happened at the round's **start**, which is when the charge is
     taken (rulebook §3). A round from before that rule was charged at its
     finish and its row says so in `finished_at` — the `CASE` reads whichever applies,
     because the charge must be read at the moment it was actually taken. */
  const rows = await db.all<{ spent_at: string }>(
    `SELECT CASE WHEN secret LIKE '%"charged":"start"%' THEN started_at ELSE finished_at END AS spent_at
       FROM game_sessions
      WHERE user_id = $u AND life_spent > 0
        AND (CASE WHEN secret LIKE '%"charged":"start"%' THEN started_at ELSE finished_at END) <= $t
      ORDER BY spent_at DESC LIMIT $n`,
    { u: userId, t: at, n: ENERGY_LOOKBACK },
  );

  /* Newest first, stopping at the last moment the tank was provably full. */
  const spends: number[] = [];
  let newer = asked;
  for (const row of rows) {
    const spent = Date.parse(row.spent_at);
    if (!Number.isFinite(spent)) continue;
    if (newer - spent >= full) break;
    spends.push(spent);
    newer = spent;
  }
  spends.reverse();

  let credit = full;
  let mark = spends[0] ?? asked;
  for (const spent of spends) {
    const filled = Math.min(full, credit + (spent - mark));
    /* A round finished with no whole energy to spend costs nothing at all — it
       neither borrows against the next refill nor confiscates the progress
       towards it. The gate refuses to *start* a round on an empty tank, so the
       only round that lands here is one that began with energy and outlived it,
       and that player has already waited for the unit they are about to be
       given. */
    credit = filled >= interval ? filled - interval : filled;
    mark = spent;
  }
  credit = Math.min(full, credit + (asked - mark));

  const energy = Math.floor(credit / interval);
  return {
    energy,
    max,
    nextAt: energy >= max ? null : iso(new Date(asked + ((energy + 1) * interval - credit))),
  };
}

/* ══════════════════════════════════════════════════════ §7.1 game sessions ══ */

export interface Round {
  sessionId: string;
  gameType: GameType;
  /** What the client may see. Never the answers. */
  content: unknown;
  energyLeft: number;
  /** When the next unit of energy arrives, or `null` on a full tank — so a screen's countdown agrees with this one. */
  energyNextAt: Iso | null;
  /**
   * Whether this round will pay.
   *
   * `false` is a **practice** round — one opened on an empty tank by a client
   * that asked for one. It plays exactly like any other round and banks nothing
   * at all: no points, no streak, no energy, no ledger entry. See `finish`.
   *
   * It is sent on every round rather than only on the practice ones, because a
   * screen that has to infer "this one pays" from a missing field will get it
   * wrong the first time the field is added to something else.
   */
  paid: boolean;
  /**
   * *Why* it banked nothing, when it did.
   *
   * `null` on a paid round. Additive, so a client that shipped against `paid`
   * alone keeps working — and a union rather than a boolean because the set of
   * reasons is the part that grows, while a screen that only ever says
   * "practice" is one a player cannot act on. `no_energy` is the remedy that
   * needs nothing from them: it comes back on a clock.
   */
  unpaidReason: 'no_energy' | null;
}

/**
 * Open a round.
 *
 * Energy is *not* spent here; **finishing** spends it, in `finish`. Charging at
 * the start would take one from a player whose connection dropped before the
 * first question, which is the one failure they definitely did not choose —
 * and it is what keeps "abandoned costs nothing" true without a second rule.
 * What the check at the top does is refuse to *start* a round on an empty tank,
 * and that is the side it has to be enforced from: finding out at the end means
 * finding out after the round was played.
 *
 * The refusal carries `nextAt`, because a gate that only says no is one a player
 * reads as a bug, and a gate that says when is one they wait out.
 *
 * **`practice: true` turns that refusal into an unpaid round instead.** An empty
 * tank used to be a locked door, and a locked door is the one state of this
 * product where there is nothing to do — a player who has run out is sent away
 * for two hours rather than kept. So a client may ask for the round anyway, on
 * the understanding that it pays nothing: `paid: false` comes back, and `finish`
 * banks nothing. What energy still buys is what it always bought — points, the
 * streak, a place on the board — and what it no longer buys is *playing*, which
 * was never the thing worth rationing.
 *
 * The flag is asked for rather than assumed, and that is deliberate: an existing
 * client (the phone) that has an "out of energy" screen built around the
 * `no_energy` refusal keeps getting the refusal, and adopts practice rounds when
 * it chooses to. A server that quietly started handing out rounds instead of the
 * error would change what every client already shipped does.
 */
export async function startSession(
  db: Db,
  input: {
    userId: string;
    gameType: GameType;
    language?: string;
    /** Play on an empty tank for nothing, rather than be refused. */
    practice?: boolean;
    /**
     * The onboarding round, which draws flags from `WELCOME_FLAGS`.
     *
     * A hint about *which* questions, never about what they are worth: the
     * round is scored, charged and written to the ledger exactly like any
     * other, so a client that sends this on every round makes its own flags
     * game easier and gains nothing. That is why it needs no trust.
     */
    welcome?: boolean;
    /**
     * Which Word Builder list to deal — `en` or `pl` — when it is not the
     * reader's language.
     *
     * The site carries two Word Builder cards, English and the local language,
     * and both used to be dealt in `language`: a Polish reader pressing the
     * English card got Polish words, and every other reader got a 404 and the
     * site's offline fallback. The list is the thing being practised and the
     * language is what the clue is written in, so they travel separately.
     * Absent means the old behaviour, which is what the phone still sends.
     */
    wordList?: string;
    at?: Iso;
  },
): Promise<Round> {
  const at = input.at ?? now();
  const language = input.language ?? 'en';

  return db.tx(async () => {
    /* A round still open is abandoned first, and **before** the tank is read:
       if it qualifies for the accidental-tap refund, the energy it gives back is
       the energy this round may spend. That is the whole of the misclick case —
       a wrong card pressed, and the right one pressed a second later. */
    await abandonActive(db, input.userId, at);

    const energy = await energyFor(db, input.userId, at);
    if (energy.energy <= 0 && input.practice !== true) {
      /* `nextAt` rather than the midnight this used to quote: energy does not
         come back with the day any more, and a reset time that is not when the
         thing resets is worse than no time at all. */
      throw new DomainError('no_energy', 'no energy left', {
        nextAt: energy.nextAt,
        max: energy.max,
      });
    }

    /* An abandoned round is closed rather than left open: two live sessions of
       the same game is an obvious way to shop for an easier question set. */
    const built = await buildRound(
      db, input.gameType, input.userId, language, input.welcome, input.wordList,
    );
    const id = newId('gms');
    const paid = energy.energy > 0;
    /* **The charge, at the start** (rulebook §3). `life_spent` is what the tank
       reads, so writing it here is the spend; `charged: "start"` in the secret
       is how this row says when its spend happened, which the tank and `finish`
       both need to tell it from a round charged at its finish under the old
       rule. The secret never leaves the server, so a client cannot claim it. */
    await db.run(
      `INSERT INTO game_sessions
         (id, user_id, game_type, language, seed, secret, state, started_at, life_spent)
       VALUES ($i, $u, $g, $l, $s, $sec, 'active', $t, $ls)`,
      {
        i: id,
        u: input.userId,
        g: input.gameType,
        l: language,
        s: built.seed,
        sec: JSON.stringify({ ...(built.secret as Record<string, unknown>), charged: 'start' }),
        t: at,
        ls: paid ? 1 : 0,
      },
    );
    const after = paid ? await energyFor(db, input.userId, at) : energy;

    return {
      sessionId: id,
      gameType: input.gameType,
      content: built.content,
      energyLeft: after.energy,
      energyNextAt: after.nextAt,
      /* Said at the *start* as well as at the end, and that is the point of
         carrying it: a player should find out that this round banks nothing
         before answering five questions, not on the result card. */
      paid: energy.energy > 0,
      unpaidReason: energy.energy > 0 ? null : 'no_energy',
    };
  });
}

/**
 * Close this player's open round, refunding it if it was an accidental tap.
 *
 * Rulebook §3: the energy went when the round started and an abandoned round
 * keeps that cost — **unless** it is abandoned within `energyRefundSeconds` of
 * its start, and the player has not already had `energyRefundsPerDay` such
 * refunds today. The refund is `life_spent = 0` with the moment stamped in
 * `energy_refunded_at`, which is both what gives the tank its unit back and
 * what counts against tomorrow's allowance being today's.
 *
 * Reached two ways: the screen's Quit (`POST /v1/games/sessions/:id/abandon`)
 * and opening a new round while one is open, which is the misclick it exists
 * for — the wrong card pressed and the right one a second later.
 */
export async function abandonActive(
  db: Db,
  userId: string,
  at: Iso,
  onlySessionId?: string,
): Promise<{ abandoned: number; refunded: boolean }> {
  const open = await db.all<{ id: string; started_at: string; life_spent: number; secret: string }>(
    `SELECT id, started_at, life_spent, secret FROM game_sessions
      WHERE user_id = $u AND state = 'active' AND ($s IS NULL OR id = $s)`,
    { u: userId, s: onlySessionId ?? null },
  );
  let refunded = false;
  for (const session of open) {
    const early = Date.parse(at) - Date.parse(session.started_at) <= CONFIG.points.energyRefundSeconds * 1000;
    const charged = session.life_spent > 0 && (JSON.parse(session.secret) as { charged?: string }).charged === 'start';
    let refund = false;
    if (early && charged) {
      const used = await db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM game_sessions
          WHERE user_id = $u AND energy_refunded_at IS NOT NULL AND substr(energy_refunded_at, 1, 10) = $d`,
        { u: userId, d: dayOf(at) },
      );
      refund = (used?.n ?? 0) < CONFIG.points.energyRefundsPerDay;
    }
    await db.run(
      `UPDATE game_sessions
          SET state = 'abandoned',
              life_spent = CASE WHEN $r = 1 THEN 0 ELSE life_spent END,
              energy_refunded_at = CASE WHEN $r = 1 THEN $t ELSE energy_refunded_at END
        WHERE id = $i AND state = 'active'`,
      { r: refund ? 1 : 0, t: at, i: session.id },
    );
    refunded = refunded || refund;
  }
  return { abandoned: open.length, refunded };
}

/** The Quit button: close one open round of this player's, refund rule applied. */
export async function abandonSession(
  db: Db,
  input: { sessionId: string; userId: string; at?: Iso },
): Promise<{ abandoned: boolean; refunded: boolean; energyLeft: number; energyNextAt: Iso | null }> {
  const at = input.at ?? now();
  return db.tx(async () => {
    const session = await db.get<{ user_id: string }>(`SELECT user_id FROM game_sessions WHERE id = $i`, {
      i: input.sessionId,
    });
    if (!session) throw new DomainError('not_found', 'session not found');
    if (session.user_id !== input.userId) throw new DomainError('forbidden', 'not your session');
    const closed = await abandonActive(db, input.userId, at, input.sessionId);
    const energy = await energyFor(db, input.userId, at);
    return { abandoned: closed.abandoned > 0, refunded: closed.refunded, energyLeft: energy.energy, energyNextAt: energy.nextAt };
  });
}

interface Built {
  seed: string;
  /** Stays on the server. */
  secret: unknown;
  /** Goes to the client. */
  content: unknown;
}

async function buildRound(
  db: Db,
  gameType: GameType,
  userId: string,
  language: string,
  welcome = false,
  wordList?: string,
): Promise<Built> {
  if (QUIZZES.has(gameType)) return await buildQuiz(db, gameType, userId, language, welcome);
  if (gameType === 'word_builder') return await buildWords(db, userId, wordList ?? language, language);
  if (gameType === 'memory_match') return buildDeck();
  if (gameType === 'merge_2048') return buildMerge();
  if (gameType === 'food_cross') return buildFood();
  if (gameType === 'food_ninja') return buildNinja();
  if (gameType === 'snake') return buildSnake();
  if (gameType === 'cannon_numbers') return buildCannon();
  if (gameType === 'breakout') return buildBreakout();
  if (gameType === 'doodle_jump') return buildDoodle();
  if (gameType === 'zuma') return buildZuma();
  return {
    seed: newId('gev'),
    secret: { kind: 'flight' },
    /*
     * **`target` and `perfectObstacles` are two different numbers and both are
     * real**, which is worth being explicit about because a client reading one as
     * the other prints a wrong figure with nothing to catch it.
     *
     * `target` is the **win** threshold — five gaps, the number the site's own
     * screen has always shown — and it decides `won` on the finish and nothing
     * else. `perfectObstacles` is what a **perfect round** takes: 25, because
     * performance is `min(100, obstacles × 4)`. Derived from the rate rather than
     * written beside it, so the two cannot drift.
     *
     * The rate travels too, as it does for every other game: the server owns what
     * an obstacle is worth, and a client holding its own 4 is a second copy of a
     * table this file owns.
     */
    content: {
      target: CONFIG.games.flightTarget,
      performancePerObstacle: CONFIG.games.flightPerformancePerObstacle,
      perfectObstacles: Math.ceil(100 / CONFIG.games.flightPerformancePerObstacle),
    },
  };
}

/**
 * §7.3. Pick questions, avoiding what this player has recently been served.
 *
 * The window is the *server's* floor under the client's own bag rule: the site
 * asks every question in a bank once before any of them twice, which is stricter
 * and lives in the client. This exists so a client that forgets its bag — a
 * reinstall, a second device — still cannot be fed the same five questions all
 * evening.
 */
/**
 * How many rows a quiz draw asks for, as a multiple of the round's length.
 *
 * `LIMIT` is applied in SQL before anything in TypeScript can reject a row, so
 * a draw of exactly five that then discards an incomplete one leaves a round of
 * four. Four times over-draw covers every bank here: the worst case is the 196
 * capitals, of which 14 were short.
 */
const OVERDRAW = 4;

async function buildQuiz(
  db: Db,
  gameType: GameType,
  userId: string,
  language: string,
  /** Restrict a `flags` draw to `WELCOME_FLAGS`. Ignored for every other bank. */
  welcome = false,
): Promise<Built> {
  const count = CONFIG.games.quizQuestions;

  /*
   * The welcome round's narrower pool, as a literal `IN (...)`.
   *
   * Built from a constant this file owns rather than from anything a request
   * carries, so there is no user input in the string -- the codes are two
   * letters each and are checked against that by the guard below before they
   * are ever interpolated. Every other value in this query is still bound.
   */
  const easy = welcome && gameType === 'flags' ? WELCOME_FLAGS : null;
  if (easy && easy.some((code) => !/^[A-Z]{2}$/.test(code))) {
    throw new Error('WELCOME_FLAGS must be ISO 3166-1 alpha-2 codes');
  }
  const poolClause = easy ? ` AND q.prompt IN ('${easy.join("','")}')` : '';

  /*
   * **Complete questions only.**
   *
   * A `quiz_items` row carries its distractors as a JSON array, and a row with
   * fewer than `quizOptions - 1` of them renders as a question with two or
   * three buttons — a coin flip presented as a quiz, paying the same point as a
   * four-option question and conspicuous to the player in a way no log line
   * noticed. `pickDistractors` in `db/import.ts` produced exactly that for
   * every small continent group (Oceania's 14 countries did it to 14 flags and
   * 14 capitals) and has been fixed; **a fix to the generator does not reach
   * rows already written**, and boot only re-imports a bank that is *empty*, so
   * a database filled by an older build still holds them. `main.ts` now treats
   * a short row as a reason to re-import, and this is the guard for the window
   * before that has happened — and for whatever the next data defect is.
   *
   * It is a *filter* rather than an assertion: a short row is not asked and the
   * draw takes a complete one instead. Refusing the round would turn fourteen
   * bad rows into a dead game, which is worse than the bug.
   *
   * The filter is in TypeScript and the draw therefore asks for **more rows
   * than it needs** — `LIMIT` in SQL is applied before anything here can reject
   * a row, so filtering a draw of exactly five leaves a round of three.
   * Counting a JSON array's length in SQL is not expressible portably across
   * both engines (SQLite has no `json_array_length` guaranteed and no regexp),
   * and over-drawing costs one extra index scan on a table of a few hundred
   * rows.
   */
  const complete = (
    rows: Array<{ id: string; prompt: string; answer: string; distractors: string }>,
  ) =>
    rows.filter((row) => {
      try {
        const parsed = JSON.parse(row.distractors) as unknown;
        if (!Array.isArray(parsed) || parsed.length < CONFIG.games.quizOptions - 1) return false;
        /*
         * And no two options the same word, which is a *second* upstream defect
         * with the same symptom. The exports are translated per language and two
         * different English distractors can land on one translation — the
         * Russian general bank asks for the name of a group of crows and offers
         * `Стая`, `Стая`, `Убийство`, `Группа`. Four buttons, three answers, and
         * one of the presses arbitrarily wrong.
         *
         * The answer is included in the comparison, because a distractor equal
         * to the *answer* is the worst version of it: two buttons are right and
         * only one of them scores.
         */
        const options = [row.answer, ...(parsed as unknown[]).map(String)];
        return new Set(options).size === options.length;
      } catch {
        /* A row whose distractors are not JSON is a row nothing can render. */
        return false;
      }
    });

  const pick = async (lang: string, window: number) =>
    complete(
      await db.all<{ id: string; prompt: string; answer: string; distractors: string }>(
        `SELECT q.id, q.prompt, q.answer, q.distractors FROM quiz_items q
          WHERE q.bank = $b AND q.language = $l${poolClause}
            AND q.id NOT IN (
              SELECT item_key FROM game_recent_items
               WHERE user_id = $u AND game_type = $g
               ORDER BY served_at DESC LIMIT $w)
          ORDER BY RANDOM() LIMIT $n`,
        { b: gameType, l: lang, u: userId, g: gameType, w: window, n: count * OVERDRAW },
      ),
    ).slice(0, count);

  /**
   * The same draw, deterministic per account, for the welcome round.
   *
   * `ORDER BY RANDOM()` is right for the game on the Play screen and wrong for
   * the gate: `onboarding.tsx` says a refresh restarts the flow, and with a
   * random draw a refresh also silently *changed the questions* — so a new
   * account's first five flags were not a fixed thing at all, and somebody who
   * reloaded mid-round was asked about somewhere else. Seeding the shuffle on
   * the user id makes the welcome round reproducible: the same account is asked
   * the same five flags in the same order however often it re-opens the gate,
   * and a dispute about one can be reconstructed.
   *
   * Still **different between accounts**, which is the property to keep — the
   * pool is forty codes and a round is five, and giving every new account the
   * identical five would make the answers shareable and the gate pointless.
   *
   * The whole eligible pool is fetched and cut here rather than ordered in SQL,
   * because a seeded shuffle is not portably expressible and the pool is at
   * most forty rows. No over-draw is needed for the same reason: this reads all
   * of them and filters before it cuts.
   */
  const pickWelcome = async (lang: string, window: number) =>
    shuffle(
      complete(
        await db.all<{ id: string; prompt: string; answer: string; distractors: string }>(
          `SELECT q.id, q.prompt, q.answer, q.distractors FROM quiz_items q
            WHERE q.bank = $b AND q.language = $l${poolClause}
              AND q.id NOT IN (
                SELECT item_key FROM game_recent_items
                 WHERE user_id = $u AND game_type = $g
                 ORDER BY served_at DESC LIMIT $w)
            ORDER BY q.id`,
          { b: gameType, l: lang, u: userId, g: gameType, w: window },
        ),
      ),
      userId,
    ).slice(0, count);

  /*
   * Two fallbacks, in the order they stop being the player's fault.
   *
   * **The language.** A bank is imported per language and the coverage is not
   * square: the capitals and flags exports carry four of the five, and the
   * general export carries no Ukrainian at all. An account reading in Ukrainian
   * therefore asked for a bank that exists, in a language that bank has no rows
   * in, and got a 404 that looked exactly like the game being broken. A
   * translation gap is not an absent game, and the question in English is
   * strictly better than no round — so a fallback is tried before giving up,
   * and only for a bank that is genuinely empty in the reader's own language.
   *
   * The chain is **selected → ru → en**, in that order and not straight to
   * English: most of this product's Ukrainian readers read Russian, and none of
   * the Russian bank is harder for them than the English one. English is the
   * last resort because it is the one language every bank is complete in.
   *
   * **The recent window.** A small bank plus the no-repeat window is an
   * arithmetic dead end: `recentWindow` rows are excluded per player per game,
   * and a bank at or under that size eventually has nothing left to offer.
   * Falling back to the unfiltered draw says "you have seen all of these
   * lately, here they are again", which is what the rule was always for — it is
   * a floor under the client's own bag, not a promise that a hundred questions
   * can be a thousand.
   *
   * Both are tried in the reader's language first, so a player only ever loses
   * their language to a gap and never to their own history.
   */
  const draw = easy ? pickWelcome : pick;

  let rows = await draw(language, CONFIG.games.recentWindow);
  if (rows.length === 0) rows = await draw(language, 0);
  /*
   * **Russian before English**, and the order is the whole point.
   *
   * The coverage is not square: the capitals and flags exports carry four of
   * the five languages (`QUIZ_LANGS` has no `uk`) and the general export
   * carries no Ukrainian columns at all, so a Ukrainian reader asks for a bank
   * that exists in a language it has no rows in. Falling straight to English
   * was better than a 404 and worse than it needed to be — most of this
   * product's Ukrainian readers read Russian, and none of the Russian bank is
   * harder for them than the English one.
   *
   * Tried only when it is not already the language asked for, which is what
   * keeps this from being a wasted query for the four languages that have
   * rows. English stays the last resort, because it is the one every bank is
   * complete in.
   */
  for (const fallback of ['ru', 'en'] as const) {
    if (rows.length > 0 || language === fallback) continue;
    rows = await draw(fallback, CONFIG.games.recentWindow);
    if (rows.length === 0) rows = await draw(fallback, 0);
  }

  if (rows.length === 0) {
    throw new DomainError('not_found', `no questions in the ${gameType} bank for ${language}`);
  }

  const at = now();
  for (const row of rows) {
    await db.run(
      `INSERT INTO game_recent_items (user_id, game_type, item_key, served_at) VALUES ($u, $g, $k, $t)
         ON CONFLICT (user_id, game_type, item_key) DO UPDATE SET served_at = excluded.served_at`,
      { u: userId, g: gameType, k: row.id, t: at },
    );
  }
  /* Trim the tail so the table does not grow without bound per player. */
  await db.run(
    `DELETE FROM game_recent_items
      WHERE user_id = $u AND game_type = $g AND item_key NOT IN (
        SELECT item_key FROM game_recent_items WHERE user_id = $u AND game_type = $g
         ORDER BY served_at DESC LIMIT $w)`,
    { u: userId, g: gameType, w: CONFIG.games.recentWindow * 4 },
  );

  const questions = rows.map((row, index) => {
    const distractors = JSON.parse(row.distractors) as string[];
    /* The options are shuffled *here* and the position of the right one is
       remembered in the secret, so the client cannot find the answer by
       noticing it is always third. */
    const options = shuffle([row.answer, ...distractors], `${row.id}${index}`);
    return {
      index,
      prompt: row.prompt,
      options,
      answerIndex: options.indexOf(row.answer),
      itemId: row.id,
    };
  });

  return {
    seed: questions.map((q) => q.itemId).join(','),
    secret: {
      kind: 'quiz',
      answers: questions.map((q) => q.answerIndex),
      /* Recorded on the **server** side of the round, never sent to the client
         and never read back from one: `finishSession` decides the welcome rate
         from this, so a client cannot ask for it at the moment it is paid. */
      welcome,
    },
    /* `mistakesAllowed` is gone from here because the rule is: **all five
       questions are asked and a quiz cannot be lost.** A key that always said
       "two" is a screen drawing two hearts that never empty.

       The three keys beside the questions are on the wire for the same reason
       they always were — what an answer is worth and what the clock is worth are
       the server's rules, and a client hardcoding them is a second copy of a
       table this file owns — but they are **performance** now rather than points,
       and they are renamed so that cannot be mistaken. `perCorrect: 1` became
       `performancePerCorrect: 20`: a client that read the old key as points and
       kept reading a new one worth twenty would print "20 points a question" on
       a round that pays eighteen at its absolute best. A renamed key is a decode
       error on the first round; a re-meaninged one is a wrong number on every
       round, for ever.

       What a round is *worth* is deliberately not here. Points now depend on the
       day's featured game, on which round of the day this is, on the plan and on
       three bonuses, none of which is a property of the questions — so the round
       carries the scale it will be judged on and the finish carries the
       arithmetic, itemised. */
    content: {
      questions: questions.map((q) => ({ index: q.index, prompt: q.prompt, options: q.options })),
      performancePerCorrect: CONFIG.games.quizPerformancePerCorrect,
      speedCredit: CONFIG.games.quizSpeedCredit,
      speedWithinSeconds: CONFIG.games.quizSpeedWithinSeconds,
    },
  };
}

/**
 * `language` is the **list** — which words are dealt — and `hintLanguage` is
 * what the clue is written in, which is the reader's. A clue with no
 * translation in that language falls back to the column's English rather than
 * to nothing: a hint is half of a word's value, and a blank one is a word
 * nobody can be helped with.
 */
async function buildWords(
  db: Db,
  userId: string,
  language: string,
  hintLanguage: string = language,
): Promise<Built> {
  const pick = (window: number) =>
    db.all<{ id: string; word: string; tier: number; hint: string | null }>(
      `SELECT w.id, w.word, w.tier, COALESCE(t.value, w.hint) AS hint FROM word_bank w
         LEFT JOIN translations t
           ON t.entity = 'word' AND t.entity_id = w.id AND t.field = 'hint' AND t.language = $h
        WHERE w.language = $l
          AND w.id NOT IN (SELECT item_key FROM game_recent_items
                          WHERE user_id = $u AND game_type = 'word_builder'
                          ORDER BY served_at DESC LIMIT $w)
        ORDER BY RANDOM() LIMIT $n`,
      { l: language, h: hintLanguage, u: userId, w: window, n: CONFIG.games.wordsPerRound },
    );

  /*
   * The word bank is the sharpest case of the arithmetic `buildQuiz` explains,
   * and it is not hypothetical: the seeded English list is ten words, the round
   * is five of them, and `recentWindow` is forty. Two rounds and that player
   * could never play Word Builder again — a game that worked and then stopped,
   * permanently, for one account. The unfiltered draw is the floor.
   *
   * No language fallback here, unlike the quizzes. A word list is the thing
   * being practised rather than the wrapping around it, and handing an English
   * round to somebody who pressed the card that practises the language of the
   * city they have moved to is answering a different question.
   */
  let rows = await pick(CONFIG.games.recentWindow);
  if (rows.length === 0) rows = await pick(0);
  if (rows.length === 0) throw new DomainError('not_found', `no words for ${language}`);

  const at = now();
  for (const row of rows) {
    await db.run(
      `INSERT INTO game_recent_items (user_id, game_type, item_key, served_at)
       VALUES ($u, 'word_builder', $k, $t)
         ON CONFLICT (user_id, game_type, item_key) DO UPDATE SET served_at = excluded.served_at`,
      { u: userId, k: row.id, t: at },
    );
  }

  return {
    seed: rows.map((r) => r.id).join(','),
    /* The tiers travel with the words because the *bank* owns difficulty and the
       scorer must not re-derive it. Carrying them here rather than re-reading
       `word_bank` at the end also means an edited or deleted row cannot change
       what a round in flight is worth. */
    secret: { kind: 'words', words: rows.map((r) => r.word.toUpperCase()), tiers: rows.map((r) => r.tier) },
    /* The client gets the scrambled letters and the length, which is the game;
       it does not get the word, which is the answer.
       
       `tier` is still sent and **no longer prices the word**. It is the bank's
       human-set difficulty rating, it still decides which words are dealt, and a
       client may well want to draw it — but a scale where a hard word pays more
       is a scale where the round is worth whatever it happened to deal, which is
       the thing the common performance scale exists to stop.

       The four scale keys beside the words are the same arrangement the quizzes
       have: the server owns what a word and a hint are worth, and a client that
       hardcoded "a hint costs ten" would be a second copy of a table this file
       owns. They are **performance**, not points. */
    content: {
      words: rows.map((row, index) => ({
        index,
        length: row.word.length,
        tier: row.tier,
        letters: shuffle([...row.word.toUpperCase()], row.id),
        hint: row.hint,
      })),
      performancePerWord: CONFIG.games.wordPerformancePerWord,
      speedCredit: CONFIG.games.wordSpeedCredit,
      speedWithinSeconds: CONFIG.games.wordSpeedWithinSeconds,
      hintPenalty: CONFIG.games.wordHintPenalty,
    },
  };
}

const SYMBOLS = ['★', '●', '▲', '■', '◆', '✦', '❋', '♦'];

function buildDeck(): Built {
  const pairs = CONFIG.games.memoryPairs;
  const deck = shuffle(
    SYMBOLS.slice(0, pairs).flatMap((symbol) => [symbol, symbol]),
    newId('gev'),
  );
  return {
    seed: deck.join(''),
    secret: { kind: 'deck', deck },
    /* Face down: the client is told how many cards there are and nothing else.
       Sending the layout and asking the client not to look is not a design.

       The scale travels with it, as it does for the quizzes and Word Builder.
       This game is now scored on **moves** rather than on the clock, and the
       bands are what lets a board draw "4 moves left in this band" honestly
       instead of a client's guess at the curve. `limitSeconds` is the one number
       here a client has to act on rather than merely display: the round ends at
       it, and a board still incomplete then is scored proportionally. */
    content: {
      cards: deck.length,
      pairs,
      basePerformance: CONFIG.games.memoryBasePerformance,
      moveBands: CONFIG.games.memoryMoveBands,
      limitSeconds: CONFIG.games.memoryLimitSeconds,
    },
  };
}

/**
 * A 2048 board. The seed is the secret — see `merge2048.ts` for why the board
 * lives here and where the next tile lands is the one thing a client is never
 * told. The opening board is not secret: it is on the screen.
 */
function buildMerge(): Built {
  const seed = newId('gev');
  const state = merge.start(seed);
  return {
    seed,
    secret: state,
    content: {
      board: state.board,
      size: merge.SIZE,
      target: CONFIG.games.mergeTarget,
      /* The scale travels, as it does for every other game: a card that wrote
         "1024 pays 80" from its own table would be a second copy of this one. */
      tileBands: CONFIG.games.mergeTileBands,
      floorPerformance: CONFIG.games.mergeFloorPerformance,
    },
  };
}

/**
 * Food Cross's random source: the `n`th draw is an HMAC of the round's seed,
 * so what falls in next is fixed when the round is dealt and known only here.
 */
export const foodRng = (seed: string): food.Rng => (n) =>
  createHmac('sha256', seed).update(`food:${n}`).digest().readUInt32BE(0);

interface FoodSecret {
  kind: 'food';
  seed: string;
  board: food.Board;
  draws: number;
  moves: number;
  cleared: number;
  /** The round's score so far — what it is performed on. Absent on a round started before scoring. */
  score?: number;
  over: boolean;
}

/** A Food Cross board. The seed is the secret; the board is on the screen. */
function buildFood(): Built {
  const seed = newId('gev');
  const dealt = food.deal(foodRng(seed), 0);
  const state: FoodSecret = { kind: 'food', seed, board: dealt.board, draws: dealt.draws, moves: 0, cleared: 0, over: false };
  return {
    seed,
    secret: state,
    content: {
      board: state.board,
      size: food.SIZE,
      kinds: food.KINDS,
      moves: CONFIG.games.foodMoves,
      target: CONFIG.games.foodTargetScore,
    },
  };
}

/** Food Ninja's random source — the same construction as Food Cross's. */
export const ninjaRng = (seed: string): ninja.Rng => (n) =>
  createHmac('sha256', seed).update(`ninja:${n}`).digest().readUInt32BE(0);

/**
 * A Food Ninja round. The schedule goes to the client because it has to be
 * drawn; what stays here is the seed and, once the round starts, the clock.
 */
function buildNinja(): Built {
  const seed = newId('gev');
  return {
    seed,
    secret: { kind: 'ninja', seed },
    content: {
      flyers: ninja.schedule(ninjaRng(seed)),
      durationMs: ninja.DURATION_MS,
      gravity: ninja.GRAVITY,
      perFood: CONFIG.games.ninjaPerformancePerFood,
      perfectFoods: Math.ceil(100 / CONFIG.games.ninjaPerformancePerFood),
    },
  };
}

/**
 * The arcade games' random source: the `n`th draw for one of them is an HMAC
 * of the round's seed and the game's own tag, so two games built from one seed
 * would still not share a sequence.
 */
export const arcadeRng = (seed: string, tag: string): arcade.Rng => (n) =>
  createHmac('sha256', seed).update(`${tag}:${n}`).digest().readUInt32BE(0);

/** Snake: the food list goes to the client, which has to draw it; the seed stays. */
function buildSnake(): Built {
  const seed = newId('gev');
  return {
    seed,
    secret: { kind: 'snake', seed },
    content: {
      cols: arcade.SNAKE_COLS,
      rows: arcade.SNAKE_ROWS,
      foods: arcade.snakeFoods(arcadeRng(seed, 'snake')),
      perFood: CONFIG.games.snakePerformancePerFood,
      perfectFoods: Math.ceil(100 / CONFIG.games.snakePerformancePerFood),
    },
  };
}

/** Canon Numbers: the board is held here; the rows to come are the seed's. */
function buildCannon(): Built {
  const seed = newId('gev');
  const state = arcade.cannonStart(seed, arcadeRng(seed, 'cannon'));
  return {
    seed,
    secret: state,
    content: {
      board: state.board,
      cols: arcade.CANNON_COLS,
      rows: arcade.CANNON_ROWS,
      turns: arcade.CANNON_TURNS,
      perBlock: CONFIG.games.cannonPerformancePerBlock,
    },
  };
}

function buildBreakout(): Built {
  const seed = newId('gev');
  return {
    seed,
    secret: { kind: 'breakout', seed },
    content: { cols: arcade.BREAKOUT_COLS, rows: arcade.BREAKOUT_ROWS, wall: arcade.breakoutWall(arcadeRng(seed, 'breakout')) },
  };
}

function buildDoodle(): Built {
  const seed = newId('gev');
  return {
    seed,
    secret: { kind: 'doodle', seed },
    content: {
      platforms: arcade.doodlePlatforms(arcadeRng(seed, 'doodle')),
      perPlatform: CONFIG.games.doodlePerformancePerPlatform,
      perfectPlatforms: Math.ceil(100 / CONFIG.games.doodlePerformancePerPlatform),
    },
  };
}

function buildZuma(): Built {
  const seed = newId('gev');
  const rng = arcadeRng(seed, 'zuma');
  return {
    seed,
    secret: { kind: 'zuma', seed },
    content: { chain: arcade.zumaChain(rng), shots: arcade.zumaShots(rng), colors: arcade.ZUMA_COLORS },
  };
}

/* ══════════════════════════════════════════════ the client reports, we judge ══ */

export interface EventResult {
  correct?: boolean;
  /** Only ever the answer to a question already answered. */
  answer?: number | string;
  /**
   * The faces of the cards this move turned over. Memory Match only.
   *
   * **A flipped pair reveals both cards, and this is what says so.** The reply
   * used to be `answer: deck[a]` and nothing else, which taught the client the
   * face of the *first* card and left the second one blank — on a mismatch, half
   * of what the player had just looked at. Memory Match is entirely about
   * remembering what you saw, so a client that cannot draw both faces is not
   * running the game; it is running a coin toss with a delay on it.
   *
   * Nothing is given away by it. What `game_sessions.secret` protects is the ten
   * cards still face down, and these two are the ones the player is looking at —
   * they named the positions in the payload. Every other position stays
   * unreadable, which is the invariant `verify.ts` pins.
   *
   * **Positions rather than an ordered pair**, for two reasons. A client applies
   * `{index, face}` straight onto its board without re-deriving which of `a` and
   * `b` it sent first — a `[faceA, faceB]` tuple is correct only as long as both
   * halves agree about the order, which is exactly the kind of agreement that
   * rots. And it does not write "exactly two" into the shape: this is the one
   * game whose moves *learn the board*, and a move that turned over a different
   * number of cards would still fit.
   *
   * That last sentence has since been cashed in: **`kind:'peek'` turns one card
   * and this array comes back with one entry in it.** A client reads the array
   * rather than the count, which is why the count was never written into the
   * shape. A peek carries no `correct` and no `answer` — it is not an answer to
   * anything, and the pair move's `answer` is a legacy key rather than a second
   * channel to be consistent with.
   *
   * It is **additive**. `answer` still carries `deck[a]` exactly as it did, so
   * the Flutter app's `protocol_test.dart` fixtures — response bodies copied
   * verbatim off a running server — keep every field they were written against.
   * A field added is a client that ignores it; a field changed is a client that
   * breaks in a shop.
   */
  revealed?: Array<{ index: number; face: string }>;
  /**
   * The board after a 2048 move, and where the new tile landed. 2048 only.
   *
   * The whole board rather than the spawn alone, because the client's slide is a
   * prediction and this is the fact: a screen that drew its own result and only
   * added the tile would drift the first time the two disagreed, with nothing to
   * pull it back.
   */
  merge?: {
    board: number[];
    spawned: { index: number; value: number } | null;
    score: number;
    moves: number;
    best: number;
    over: boolean;
  };
  /**
   * The result of a Food Cross swap. Food Cross only.
   *
   * `steps` is every stage of the move — what cleared, and the board after the
   * fall — so the screen can play the cascade out instead of jumping to the end.
   * The last step's board is `board`.
   */
  /** Food Ninja: how many foods the server has credited so far, and which of this swipe's. */
  ninja?: { sliced: number; credited: number[] };
  /** Canon Numbers: the board after a shot, which cells each ball hit, and the tally. */
  cannon?: { board: number[]; hits: number[]; turn: number; destroyed: number; over: boolean };
  food?: {
    board: food.Board;
    steps: food.Step[];
    gained: number;
    cleared: number;
    /** The round's score so far, and `gained` is what this swap added to it. */
    score: number;
    moves: number;
    movesLeft: number;
    over: boolean;
    reshuffled: boolean;
  };
  accepted: boolean;
}

/**
 * The day's Word Builder hints, which are a plan entitlement.
 *
 * Counted off the events themselves rather than off a counter, for the same
 * reason the energy is: the rows are already written, and a second tally of one
 * fact is a second thing to be wrong. Per *local* day — `dayOf`, the same slice
 * every other daily rule in this module uses, because two daily resets an hour
 * apart is a bug report nobody can reproduce.
 *
 * **The event being submitted is excluded from the count**, and that is what
 * keeps a retry idempotent. `submitEvent` swallows the duplicate-key insert and
 * returns `accepted: false`; if the row it is replaying counted against the
 * allowance, a hint allowed the first time would be refused the second and a
 * dropped response would cost the player a reveal they had already spent.
 *
 * Refused rather than quietly answered with something that is not a hint: a
 * reveal that silently stops revealing is a broken button, and `requireCapacity`
 * throws the 403 that names the key — which is what lets the client say "your
 * plan allows three a day" instead of "something went wrong".
 */
async function requireHint(db: Db, userId: string, sessionId: string, seq: number, at: Iso): Promise<void> {
  const used =
    (await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM game_events e
         JOIN game_sessions s ON s.id = e.session_id
        WHERE s.user_id = $u AND e.kind = 'hint'
          AND substr(e.created_at, 1, 10) = $d
          AND NOT (e.session_id = $s AND e.seq = $q)`,
      { u: userId, d: dayOf(at), s: sessionId, q: seq },
    ))?.n ?? 0;

  /* The fallback is the free tier's own figure, so a deployment that has not
     seeded `word_hints_per_day` behaves like the free plan rather than like
     Premium — the same argument as `streak_freezes` below. */
  entitlements.requireCapacity(
    /* The same clock the day above is counted in. */
    await entitlements.entitlementsFor(db, { userId }, at),
    'word_hints_per_day',
    used,
    3,
  );
}

/**
 * The Memory Match positions this session has already matched.
 *
 * Read off `game_events` rather than kept as a column, for the reason the tank
 * and the balance are: the rows that say it are already written, and a second
 * record of one fact is a second thing to be wrong. It is `correct = 1` and the
 * pair of positions in the payload — the same two facts `scoreDeck` reads at the
 * end of the round, normalised the same way, because "which cards are matched"
 * and "how many pairs were found" are one question asked twice.
 *
 * Only `peek` asks. A **pair** naming two matched cards is still accepted, and
 * must be: a client whose response was lost puts those cards back down and turns
 * them again, which is the case `scoreDeck`'s distinct-pair counting exists for.
 * Refusing it would turn a dropped packet into a stuck board.
 *
 * A payload this module cannot parse names no card, which is the same answer
 * `scoreDeck` gives it — a card left out of this set is a card a peek is allowed
 * to turn, and the honest direction for an unreadable row is to permit rather
 * than to block a move the player can see is legal.
 */
async function matchedCards(db: Db, sessionId: string): Promise<Set<number>> {
  const out = new Set<number>();
  const rows = await db.all<{ payload: string }>(
    `SELECT payload FROM game_events WHERE session_id = $s AND correct = 1`,
    { s: sessionId },
  );
  for (const row of rows) {
    try {
      const { a, b } = JSON.parse(row.payload) as { a?: unknown; b?: unknown };
      for (const position of [Number(a), Number(b)]) {
        if (Number.isInteger(position)) out.add(position);
      }
    } catch {
      /* Not a pair this module can name. */
    }
  }
  return out;
}

/**
 * Validate one reported event against the stored secret.
 *
 * The reply says whether *this* answer was right and nothing about the next one.
 * Returning the whole answer key on the first event — which is the shape a naive
 * "here is the round" endpoint takes — hands a modified client a perfect score.
 */
export async function submitEvent(
  db: Db,
  input: { sessionId: string; userId: string; seq: number; kind: string; payload: Record<string, unknown>; at?: Iso },
): Promise<EventResult> {
  const at = input.at ?? now();
  return db.tx(async () => {
    const session = await db.get<{ id: string; user_id: string; state: string; secret: string; game_type: GameType }>(
      `SELECT id, user_id, state, secret, game_type FROM game_sessions WHERE id = $i`,
      { i: input.sessionId },
    );
    if (!session) throw new DomainError('not_found', 'session not found');
    if (session.user_id !== input.userId) throw new DomainError('forbidden', 'not your session');
    if (session.state !== 'active') throw new DomainError('invalid_state', 'session is finished');

    const secret = JSON.parse(session.secret) as Record<string, unknown>;

    if (secret.kind === 'ninja') {
      const flyers = ninja.schedule(ninjaRng(String(secret.seed)));
      const rows = await db.all<{ kind: string; payload: string; created_at: string }>(
        `SELECT kind, payload, created_at FROM game_events WHERE session_id = $s ORDER BY seq`,
        { s: session.id },
      );
      const startRow = rows.find((row) => row.kind === 'start');
      const sliced = new Set<number>();
      for (const row of rows) {
        if (row.kind !== 'slice') continue;
        try {
          for (const id of (JSON.parse(row.payload) as { ids?: unknown[] }).ids ?? []) sliced.add(Number(id));
        } catch {
          /* A row this module cannot read credits nothing. */
        }
      }
      const record = async (kind: string, payload: unknown, correct: boolean | null) => {
        try {
          await db.run(
            `INSERT INTO game_events (id, session_id, seq, kind, payload, correct, created_at)
             VALUES ($i, $s, $q, $k, $p, $c, $t)`,
            {
              i: newId('gev'), s: session.id, q: input.seq, k: kind, p: JSON.stringify(payload),
              c: correct === null ? null : correct ? 1 : 0, t: at,
            },
          );
          return true;
        } catch {
          return false; /* A retried `seq`: already recorded. */
        }
      };

      /*
       * `start` is when the screen's clock started, stamped by this server's.
       * Every slice is timed from it. Once only — a second start would be a way
       * to move the clock.
       */
      if (input.kind === 'start') {
        if (startRow) return { ninja: { sliced: sliced.size, credited: [] }, accepted: false };
        const accepted = await record('start', {}, null);
        return { ninja: { sliced: sliced.size, credited: [] }, accepted };
      }
      if (input.kind !== 'slice') throw new DomainError('bad_request', 'a Food Ninja move is start or slice');
      if (!startRow) throw new DomainError('invalid_state', 'the round has not started');

      const elapsed = Date.parse(at) - Date.parse(startRow.created_at);
      const slack = CONFIG.games.ninjaSlackMs;
      if (elapsed > ninja.DURATION_MS + slack) throw new DomainError('invalid_state', 'the round is over');

      const asked = Array.isArray(input.payload.ids) ? (input.payload.ids as unknown[]).map(Number) : [];
      if (asked.length === 0 || asked.length > ninja.MAX_PER_SWIPE) {
        throw new DomainError('bad_request', `a swipe slices 1 to ${ninja.MAX_PER_SWIPE} foods`);
      }
      /* Credited: a real food, not already sliced, in the air by this clock. The
         rest of the swipe is simply not counted — a late packet is not a cheat. */
      const credited = [...new Set(asked)].filter((id) => {
        const flyer = flyers[id];
        if (!flyer || flyer.id !== id || sliced.has(id)) return false;
        return elapsed >= flyer.t - slack && elapsed <= flyer.t + ninja.airtime(flyer) + slack;
      });
      const accepted = await record('slice', { ids: credited }, credited.length > 0);
      if (!accepted) return { ninja: { sliced: sliced.size, credited: [] }, accepted: false };
      return { ninja: { sliced: sliced.size + credited.length, credited }, accepted: true };
    }

    if (secret.kind === 'food') {
      const state = secret as unknown as FoodSecret;
      const limit = CONFIG.games.foodMoves;
      const view = (s: FoodSecret, steps: food.Step[], gained: number, reshuffled: boolean) => ({
        board: s.board, steps, gained, cleared: s.cleared, score: s.score ?? 0, moves: s.moves,
        movesLeft: Math.max(0, limit - s.moves), over: s.over, reshuffled,
      });
      const a = Number(input.payload.a);
      const b = Number(input.payload.b);
      if (!Number.isInteger(a) || !Number.isInteger(b) || !food.adjacent(a, b)) {
        throw new DomainError('bad_request', 'those two cells are not neighbours');
      }
      /* Same rule as 2048: a swap names the board it was made on, so a retry
         after a lost reply is answered with the current board, not played twice. */
      if (Number(input.payload.from) !== state.moves) return { food: view(state, [], 0, false), accepted: false };
      if (state.over) throw new DomainError('invalid_state', 'the round has no moves left');

      const played = food.play(state.board, a, b, foodRng(state.seed), state.draws);
      if (!played) throw new DomainError('bad_request', 'that swap lines nothing up');

      try {
        await db.run(
          `INSERT INTO game_events (id, session_id, seq, kind, payload, correct, created_at)
           VALUES ($i, $s, $q, $k, $p, NULL, $t)`,
          { i: newId('gev'), s: session.id, q: input.seq, k: 'swap', p: JSON.stringify({ a, b, from: state.moves }), t: at },
        );
      } catch {
        return { food: view(state, [], 0, false), accepted: false };
      }
      const moves = state.moves + 1;
      const next: FoodSecret = {
        ...state,
        board: played.board,
        draws: played.draws,
        moves,
        cleared: state.cleared + played.cleared,
        score: (state.score ?? 0) + played.score,
        over: moves >= limit,
      };
      await db.run(`UPDATE game_sessions SET secret = $sec WHERE id = $i`, { sec: JSON.stringify(next), i: session.id });
      return { food: view(next, played.steps, played.score, played.reshuffled), accepted: true };
    }

    if (secret.kind === 'cannon') {
      const state = secret as unknown as arcade.CannonState;
      const view = (s: arcade.CannonState, hits: number[]) => ({
        board: s.board, hits, turn: s.turn, destroyed: s.destroyed, over: s.over,
      });
      const col = Number(input.payload.col);
      if (!Number.isInteger(col) || col < 0 || col >= arcade.CANNON_COLS) {
        throw new DomainError('bad_request', 'no such column');
      }
      /* `from` names the board the shot was aimed at — 2048's construction. A
         retried shot is answered with the current board, never applied twice. */
      if (Number(input.payload.from) !== state.turn) return { cannon: view(state, []), accepted: false };
      if (state.over) throw new DomainError('invalid_state', 'the round is over');
      const fired = arcade.cannonFire(state, col, arcadeRng(state.seed, 'cannon'));
      try {
        await db.run(
          `INSERT INTO game_events (id, session_id, seq, kind, payload, correct, created_at)
           VALUES ($i, $s, $q, $k, $p, NULL, $t)`,
          { i: newId('gev'), s: session.id, q: input.seq, k: 'fire', p: JSON.stringify({ col, from: state.turn }), t: at },
        );
      } catch {
        return { cannon: view(state, []), accepted: false };
      }
      await db.run(`UPDATE game_sessions SET secret = $sec WHERE id = $i`, {
        sec: JSON.stringify(fired.state),
        i: session.id,
      });
      return { cannon: view(fired.state, fired.hits), accepted: true };
    }

    if (secret.kind === 'merge') {
      const state = secret as unknown as merge.MergeSecret;
      const view = (s: merge.MergeSecret, spawned: { index: number; value: number } | null) => ({
        board: s.board, spawned, score: s.score, moves: s.moves, best: s.best, over: s.over,
      });
      const direction = String(input.payload.dir ?? '') as merge.Direction;
      if (!merge.DIRECTIONS.includes(direction)) throw new DomainError('bad_request', 'no such direction');

      /*
       * **A move names the board it was made on**, as `from`: the number of
       * moves the client had seen applied. That, not `seq`, is what makes a
       * retry safe here. A client whose reply was lost resends the swipe — under
       * the same `seq` or a fresh one — and either way it still says
       * `from: n` while the server is at `n + 1`. Applying it would be a second
       * swipe nobody made; answering with the current board is what puts that
       * client back in step.
       */
      if (Number(input.payload.from) !== state.moves) return { merge: view(state, null), accepted: false };
      if (state.over) throw new DomainError('invalid_state', 'the board has no moves left');

      const played = merge.play(state, direction);
      /* A swipe that changes nothing is not a move in 2048, and the client can
         see that before sending it — the slide is deterministic. */
      if (!played) throw new DomainError('bad_request', 'that move changes nothing');

      try {
        await db.run(
          `INSERT INTO game_events (id, session_id, seq, kind, payload, correct, created_at)
           VALUES ($i, $s, $q, $k, $p, NULL, $t)`,
          { i: newId('gev'), s: session.id, q: input.seq, k: 'move', p: JSON.stringify({ dir: direction, from: state.moves }), t: at },
        );
      } catch {
        /* Same `seq` as a move already recorded under a different board — a
           client bug rather than a retry, which `from` would have caught. */
        return { merge: view(state, null), accepted: false };
      }
      await db.run(`UPDATE game_sessions SET secret = $sec WHERE id = $i`, {
        sec: JSON.stringify(played.state),
        i: session.id,
      });
      return { merge: view(played.state, played.spawned), accepted: true };
    }

    let correct: boolean | undefined;
    let answer: number | string | undefined;
    let revealed: EventResult['revealed'];

    if (secret.kind === 'quiz') {
      const answers = secret.answers as number[];
      const index = Number(input.payload.index);
      const chosen = Number(input.payload.choice);
      if (!Number.isInteger(index) || index < 0 || index >= answers.length) {
        throw new DomainError('bad_request', 'no such question');
      }
      correct = answers[index] === chosen;
      answer = answers[index];
    } else if (secret.kind === 'words') {
      const words = secret.words as string[];
      const index = Number(input.payload.index);
      const guess = String(input.payload.guess ?? '').toUpperCase();
      if (!Number.isInteger(index) || index < 0 || index >= words.length) {
        throw new DomainError('bad_request', 'no such word');
      }
      correct = words[index] === guess;
      /* A hint reveals one letter and nothing else — the position asked for, and
         only while the day's allowance holds. Checked before the letter is read
         rather than before the insert, so a hint that is refused is a hint that
         never happened: nothing is written and nothing is revealed. */
      if (input.kind === 'hint') {
        /*
         * Validated, not clamped — and the order matters as much as the check.
         *
         * It used to be `Math.min(Math.max(0, position), length - 1)`, which
         * meant a hint for a slot that does not exist still passed the
         * allowance below, spent one of the day's three, and answered the
         * *last* letter of the word. A client asking out of range was charged
         * for a letter it had nowhere to put and could not tell that anything
         * had gone wrong. Clamping is the right instinct for a value that is
         * merely imprecise and the wrong one for a value that is a mistake:
         * this is a mistake, and the other out-of-range value in this same
         * branch — `index` — has always been treated as one.
         *
         * Refused *before* `requireHint`, so a rejected hint is a hint that
         * never happened: nothing is written, nothing is spent, nothing is
         * revealed. That is the same guarantee the allowance check itself makes
         * one line down, and it would be worth nothing if a bad request could
         * step past it.
         */
        const position = Number(input.payload.position ?? 0);
        if (!Number.isInteger(position) || position < 0 || position >= words[index].length) {
          throw new DomainError('bad_request', 'no such letter');
        }
        await requireHint(db, input.userId, input.sessionId, input.seq, at);
        answer = words[index][position];
        correct = undefined;
      }
    } else if (secret.kind === 'deck') {
      const deck = secret.deck as string[];
      if (input.kind === 'peek') {
        /*
         * **One card, turned face up on its own.** This is the move the protocol
         * did not have, and without it Memory Match was not the game: the only
         * way to learn a face was to name two positions, so the first card a
         * player tapped stayed blank until they had already committed to a
         * second. That is not a memory game with a delay on it — it is a
         * different game, in which every move is made blind.
         *
         * The shipped client peeks the **first** card of a move and sends the
         * `pair` for the second, so the reply that turns card B is also the
         * reply that judges the pair: tap, it turns; tap, it turns and then they
         * stay or go back down. One extra round trip a move, not two.
         *
         * **A peek cannot make the game cheaper, and the reason is the clock
         * rather than a counter.** `scoreDeck` prices this round on the span
         * from the first recorded event to the last and on nothing else — not
         * moves, not pairs found — and a peek *is* a recorded event inside that
         * span. So peeking widens the span or leaves it alone, and `bandFor`
         * pays less or the same for a wider one: **no sequence of peeks added to
         * a round can pay more than that round without them.**
         *
         * The version of that worth being careful about is the client that does
         * not merely *add* peeks but plays differently because of them — reads
         * the whole board first, then clears it in a second, and takes the top
         * band a flailing player would have missed. **That client did not need
         * this move.** `revealed` already names both cards of a *mismatched*
         * pair, on purpose and for the whole reason this game exists, so twelve
         * cards were learnable in six pair moves before a peek existed; and
         * `scoreDeck` pays the band whether or not the board was cleared, so the
         * cheapest 8 points on offer here is two `pair` events a millisecond
         * apart and always has been. A peek is a slower route to information
         * that was already free, and it opens nothing.
         *
         * What a meter *would* do is tax the honest client, which sends exactly
         * one peek per move because that is what turning a card looks like; the
         * dishonest one pipelines twelve and pays whatever the meter says. So
         * the limiter stays where it already is, and stays the one a result card
         * can explain: the clock.
         *
         * **It is not an answer**, which is the other half of keeping the
         * scoring honest: `correct` stays `undefined` and is written NULL, so
         * `scoreDeck`'s `correct !== 1` filter steps over it, and it is neither
         * counted as a pair nor able to disturb the distinct-pair set. The same
         * is true of `answered`, which is the board's size. Nothing about
         * `finish` changed.
         */
        const index = Number(input.payload.index);
        /*
         * Refused, not clamped, and refused for both reasons a position can be
         * wrong — off the board, or already matched. That is the precedent the
         * `hint` branch above set when it stopped clamping: a position outside
         * the round is a client mistake rather than an imprecise value, and
         * answering it with the nearest legal card hands back a face the client
         * has nowhere to put and no way to know is wrong. A matched card is not
         * face down, so turning it is not a move that exists.
         *
         * Re-peeking a card that is merely face *up* is deliberately allowed:
         * the server holds no board state between events, and the one client
         * behaviour that looks exactly like it is a retry under a fresh `seq`
         * after a lost response — which is the case `revealed` travels on the
         * duplicate path for.
         */
        if (!Number.isInteger(index) || index < 0 || index >= deck.length) {
          throw new DomainError('bad_request', 'no such card');
        }
        if ((await matchedCards(db, session.id)).has(index)) {
          throw new DomainError('bad_request', 'card already matched');
        }
        /* The one position asked for. Everything else in `deck` stays where it
           is — a peek is a card turning over, not a window onto the layout. */
        revealed = [{ index, face: deck[index] }];
      } else {
        const a = Number(input.payload.a);
        const b = Number(input.payload.b);
        if (!deck[a] || !deck[b] || a === b) throw new DomainError('bad_request', 'no such cards');
        correct = deck[a] === deck[b];
        /* Kept, and now redundant beside `revealed`. It is the first card's face
           and it is what every client written against the old reply reads; a key
           that costs one string is not worth a protocol change to remove. */
        answer = deck[a];
        /* Both of them, because both of them are face up on the player's screen.
           Only these two — the loop that would build this from `deck` itself is
           the whole answer key, and there is no move that needs it. */
        revealed = [
          { index: a, face: deck[a] },
          { index: b, face: deck[b] },
        ];
      }
    }

    try {
      await db.run(
        `INSERT INTO game_events (id, session_id, seq, kind, payload, correct, created_at)
         VALUES ($i, $s, $q, $k, $p, $c, $t)`,
        {
          i: newId('gev'),
          s: session.id,
          q: input.seq,
          k: input.kind,
          p: JSON.stringify(input.payload),
          c: correct === undefined ? null : correct ? 1 : 0,
          t: at,
        },
      );
    } catch {
      /* The unique `(session, seq)` fired: this event has already been recorded.
         A replayed event is idempotent rather than an error — a retry after a
         dropped response is the common case and must not cost the player an
         answer.

         `revealed` travels on this reply too, and that is the point of retrying
         one: the response that went missing is the only thing that was ever
         going to tell this client what those two cards were. A duplicate that
         answered `accepted: false` and nothing else would leave a Memory Match
         board with two permanent blanks on it. */
      return { correct, answer, revealed, accepted: false };
    }

    return { correct, answer, revealed, accepted: true };
  });
}

/* ═════════════════════════════════════════════════════════ §7.4 the commit ══ */

export interface Finish {
  score: number;
  /**
   * How many points the daily ceiling trimmed — **still always 0**, and kept.
   *
   * There is no daily points ceiling. What there is again is a decay curve, and
   * it is deliberately *not* reported through this field: `capped` was a number
   * of points removed from a round that had already been scored, and decay is
   * part of scoring it. A client that printed "8 points capped" off this key
   * would be describing something that did not happen. `decay` and `roundToday`
   * below are where a shrunken round explains itself.
   *
   * The field stays because the app reads this body and dropping a key is a
   * protocol change for a fact that is simply "nothing was trimmed".
   */
  capped: number;
  correct: number;
  answered: number;
  won: boolean;
  streak: number;
  freezes: number;
  energyLeft: number;
  /** When the next unit of energy arrives, or `null` on a full tank. */
  energyNextAt: Iso | null;
  balance: number;
  /**
   * Whether this round banked anything — the same fact `Round.paid` promised
   * when it was opened, restated at the end because that is where a client has
   * to explain a `score` of 0.
   *
   * `false` is a practice round: `score` is 0, `streak` and `freezes` are what
   * they already were, `balance` is unmoved and `energyLeft` is still 0. Without
   * this field a practice round and a round somebody got every question wrong on
   * are the same response body, and the screen has to guess which it is looking
   * at.
   */
  paid: boolean;
  /**
   * *Why* it banked nothing, when it did. `null` on a paid round.
   *
   * The same union `Round.unpaidReason` carries and for the same reason: a
   * result card that says only "practice" leaves the player nothing to act on,
   * and `no_energy` is a state that comes back on a clock without them doing
   * anything. A union rather than a boolean because the set of reasons is the
   * part that grows.
   */
  unpaidReason: 'no_energy' | null;
  /** §7.4's reward connection, computed from the real balance. */
  nearest: { venueId: string; venueName: string; discountPct: number; pointsNeeded: number } | null;

  /* ── rulebook §4.1, itemised: the round's own arithmetic, step by step ──
   *
   * Nine fields, and they exist so a result screen can **show the sum rather
   * than the answer**. `score` is one integer and it is the product of six
   * separate decisions: how well the round went, whether it was the day's
   * featured game, how many rounds had already been played today, what the plan
   * multiplies by, and which of three bonuses landed. A card that prints only
   * the total leaves a player with no way to tell a bad round from a fourth
   * round, which are two completely different things to do about it — play
   * better, or come back tomorrow.
   *
   * They are also the honest answer to the support question this formula
   * generates: "why was that worth 4 when the same round was worth 18 this
   * morning?" The answer is `decay: 0.2` and it is now on the wire.
   *
   * Every one of them is **additive**: a client that ignores all nine sees
   * exactly the body it saw before.
   */

  /** The round's performance, 0..100. The one number every game is reduced to. */
  performance: number;
  /**
   * `max(2, round(performance / 100 × 18))` — 2..18, the multiplicative base.
   *
   * 0 on a welcome round, which bypasses the formula entirely; `welcomeRound`
   * says when that is the case.
   */
  base: number;
  /** The decay rung this round landed on: 1, 0.65, 0.45, 0.3, 0.2 or 0.12. */
  decay: number;
  /** Which **paid** round of the day this was, 1-based. What `decay` is read from. */
  roundToday: number;
  /** Whether the ×1.5 featured multiplier applied. Once per day, first round. */
  featured: boolean;
  /**
   * The factor `featured` actually applied — `CONFIG.games.featuredMultiplier`
   * when it did, and 1 when it did not.
   *
   * Beside the boolean rather than instead of it, and the reason is §11 of the
   * rulebook: `FEATURED_GAME_BONUS` is on the list of tunables that must not be
   * hard-coded. A client drawing "×1.5" off a constant of its own prints a figure
   * that stops matching the arithmetic beside it the day this moves to ×1.4 — and
   * a breakdown row whose label contradicts its own sum is worse than one that
   * says only "included", which is what the boolean alone can support.
   *
   * 1 rather than null when it did not apply, so a client can multiply
   * unconditionally: `base × featuredMultiplier × decay × multiplier` is the whole
   * chain with no branch in it.
   */
  featuredMultiplier: number;
  /** The plan's `points_multiplier` as it stood when the round was played. */
  multiplier: number;
  /** +10 for a perfect round (performance 100), or 0. */
  bonusPerfect: number;
  /** +25 for the first time this player has ever finished this game, or 0. */
  bonusNewGame: number;
  /** +8 for beating their own best in this game, at most once a day, or 0. */
  bonusPersonalBest: number;
  /**
   * The one round that does not follow the formula: the welcome round.
   *
   * §7.3 pays the first finished round of an account a flat 10 a correct answer,
   * because the screen before it promises fifty points and the two numbers have
   * to be the same promise. `base` is 0 and all three bonuses are 0 on such a
   * round — the formula did not run — and this flag is what says so, rather than
   * leaving a client to infer it from a `base` of 0 beside a `score` of 50.
   */
  welcomeRound: boolean;
}

/**
 * Finish a round: score it from the recorded events, then bank it.
 *
 * One ledger entry per session (§7.4), written by `ledger.earn`. The streak is
 * decided by `applyStreak` below, and nothing else in the backend is allowed to
 * decide it — the site's own rule, for the same reason: seven games score seven
 * ways and none of them has any business restating what a streak is.
 *
 * **A round opened on an empty tank banks nothing, and that is decided here from
 * the tank as it stood when the round *started*.** Not as it stands now: energy
 * only ever refills, so a two-hour round that began with nothing would otherwise
 * finish paid, and the screen already told the player it would not pay. Asking
 * `energyFor` about `started_at` reconstructs exactly the number `startSession`
 * saw, which is what makes the two ends of one round agree without a column to
 * remember it in — the spends the tank is built from are `finished_at` rows, and
 * this session has none until the line below writes one.
 *
 * What "banks nothing" means is deliberately total: no ledger entry, no streak
 * movement, no freeze earned or spent, no comeback payment, no day counted, no
 * energy taken (there is none to take), **no first-play bonus consumed and no
 * personal best recorded**. The session row is still written — the round
 * happened — with `life_spent = 0`, which is the column `energyFor` filters on,
 * so a practice round is invisible to the tank rather than being a spend the tank
 * has to be taught to ignore.
 *
 * The last two of those are the rulebook's additions and they matter more than
 * they look. A practice round that spent the +25 would mean a player out of
 * energy could burn the single largest bonus in the formula on a round that paid
 * them nothing for it; one that set a personal best would mean the same round
 * both failed to pay and raised the bar for the next one that would. Practice is
 * the round that costs nothing, and "nothing" has to include the things that are
 * spent once.
 *
 * The decay curve, the featured multiplier and the three bonuses are all decided
 * here and applied by `roundPoints` — the itemisation goes back on the response
 * so the result screen can show the sum rather than the answer.
 */
export async function finish(
  db: Db,
  input: { sessionId: string; userId: string; clientReport?: Record<string, unknown>; at?: Iso },
): Promise<Finish> {
  const at = input.at ?? now();

  return db.tx(async () => {
    const session = await db.get<{
      id: string;
      user_id: string;
      state: string;
      secret: string;
      game_type: GameType;
      started_at: string;
      life_spent: number;
    }>(
      `SELECT id, user_id, state, secret, game_type, started_at, life_spent FROM game_sessions WHERE id = $i`,
      { i: input.sessionId },
    );
    if (!session) throw new DomainError('not_found', 'session not found');
    if (session.user_id !== input.userId) throw new DomainError('forbidden', 'not your session');
    if (session.state !== 'active') throw new DomainError('invalid_state', 'session already finished');

    /*
     * Paid or practice: the tank, as it was when this round opened — see the
     * note above the function for why it is asked about `started_at` and not
     * about now.
     *
     * An empty tank does not take the round away. Taking the game away teaches
     * nobody anything about energy, and a player who cannot see what the
     * product does has no reason to come back to it, so the round is played and
     * banks nothing. `unpaidReason` carries the reason so a result card can
     * explain a score of 0 rather than leaving it to be guessed at.
     */
    /* A round charged at its start was paid if and only if the start spent
       energy on it — that decision is already on the row. A round opened
       before that rule falls back to the old reading: the tank at its start. */
    const chargedAtStart = (JSON.parse(session.secret) as { charged?: string }).charged === 'start';
    const paid = chargedAtStart
      ? session.life_spent > 0
      : (await energyFor(db, input.userId, session.started_at)).energy > 0;
    const unpaidReason: 'no_energy' | null = paid ? null : 'no_energy';

    /* `created_at` is selected because three of the four scorers read it —
       the quizzes for their speed credit, Word Builder for its per-word one, and
       Memory Match for the 90-second limit. It is the server's stamp, written
       when the event arrived; the client has no clock this module is willing to
       read. */
    const events = await db.all<{
      seq: number;
      kind: string;
      payload: string;
      correct: number | null;
      created_at: string;
    }>(
      `SELECT seq, kind, payload, correct, created_at FROM game_events WHERE session_id = $s ORDER BY seq`,
      { s: session.id },
    );
    const secret = JSON.parse(session.secret) as Record<string, unknown>;

    /*
     * The welcome round pays a flat rate per correct answer, and only ever once.
     *
     * **It bypasses the formula entirely** — no base, no decay, no featured
     * multiplier, none of the three bonuses — and that is deliberate rather than
     * an omission. §7.3 promises the first finished round of an account fifty
     * points for five right, the onboarding screen before it says so in words,
     * and the master formula cannot produce fifty from one round of anything. A
     * round that paid 18 against a promise of 50 would be the first thing this
     * product ever told somebody that was not true.
     *
     * Two conditions, and the second is the one that matters. `secret.welcome`
     * says the round was *started* as the welcome round — it lives in the
     * server's own secret, so a client cannot assert it here. And the count says
     * this player has never finished a round before, which is what makes it
     * once: without it, a client could open welcome rounds until its energy ran
     * out and take the rate every time, since nothing else about onboarding has
     * to have happened yet.
     */
    const firstEver =
      secret.welcome === true &&
      ((await db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM game_sessions
          WHERE user_id = $u AND finished_at IS NOT NULL AND id <> $s`,
        { u: input.userId, s: session.id },
      ))?.n ?? 0) === 0;

    /* Each of these answers one question — what was this round's performance,
       0..100 — and none of them knows what a point is. */
    const scored =
      secret.kind === 'quiz'
        ? scoreQuiz(events, (secret.answers as number[]).length)
        : secret.kind === 'words'
          ? scoreWords(events, secret.words as string[], session.started_at)
          : secret.kind === 'deck'
            ? scoreDeck(events, CONFIG.games.memoryPairs)
            : secret.kind === 'merge'
              ? scoreMerge(secret as unknown as merge.MergeSecret)
              : secret.kind === 'food'
                ? scoreFood(secret as unknown as FoodSecret)
                : secret.kind === 'ninja'
                  ? scoreNinja(events)
                  : secret.kind === 'snake'
                    ? scoreSnake(secret, input.clientReport ?? {}, secondsBetween(session.started_at, at))
                    : secret.kind === 'cannon'
                      ? scoreCannon(secret as unknown as arcade.CannonState)
                      : secret.kind === 'breakout'
                        ? scoreBreakout(secret, input.clientReport ?? {}, secondsBetween(session.started_at, at))
                        : secret.kind === 'doodle'
                          ? scoreDoodle(input.clientReport ?? {}, secondsBetween(session.started_at, at))
                          : secret.kind === 'zuma'
                            ? scoreZuma(input.clientReport ?? {}, secondsBetween(session.started_at, at))
              : scoreFlight(input.clientReport ?? {}, secondsBetween(session.started_at, at));

    /*
     * The plan **as it was when the round was played**, not as it is when the
     * server happens to read this.
     *
     * `entitlementsFor` defaults its clock to `now()`, and that default was
     * invisible for as long as `activeSubscription` ignored dates: every
     * subscription was live from the moment it existed, whatever `started_at`
     * said. Once a subscription got a window (item 23), the default became a
     * second clock — the round has its own instant, and the two disagree for
     * any round not being scored at this exact moment.
     *
     * `at` is the honest one, and it is the same rule this file already states
     * for energy: the answer is taken from the state at the round's own time,
     * so it cannot change under a round that is being played. A tier granted an
     * hour after somebody finished does not retroactively multiply what they
     * banked, and one that lapsed an hour after does not un-multiply it.
     */
    const ent = await entitlements.entitlementsFor(db, { userId: input.userId }, at);
    const multiplier = entitlements.entNumber(ent, 'points_multiplier', 1);

    /*
     * ── the four facts the formula needs besides the performance ──
     *
     * All four are read **before** anything below is written, which is what
     * makes them facts about the state this round arrived in rather than about
     * the state it created. Three of them are derived from rows that already
     * exist; only the personal best needs storage of its own, because
     * performance is never written to a session row.
     */

    /*
     * Which round of the day this is — the decay curve's only input.
     *
     * `daily_counters.lives_used` counts the player's **paid** rounds today and
     * is upserted a few lines below, *after* scoring, so at this moment it is
     * the count of rounds that came before this one: `roundToday` is that plus
     * one. Two consequences follow from it being the paid count rather than a
     * count of rounds played, and both are the right way round. A practice round
     * does not push anybody down the curve — it paid nothing, so charging it
     * against the day would make an empty tank worse than not playing. And an
     * abandoned round does not either, because nothing writes the counter until
     * a round is banked.
     */
    const roundToday =
      ((await db.get<{ lives_used: number }>(
        `SELECT lives_used FROM daily_counters WHERE user_id = $u AND day = $d`,
        { u: input.userId, d: dayOf(at) },
      ))?.lives_used ?? 0) + 1;

    /*
     * The featured game's ×1.5, once per day.
     *
     * Eligible *and* not already taken: `featuredGamesFor` is the three-UTC-day
     * window that covers every local date a real clock can be showing (see its
     * own note), and `featuredTakenToday` asks whether a paid round of any
     * eligible game has already finished today. A practice round cannot take it,
     * for the reason practice takes nothing: `featuredTakenToday` filters on
     * `life_spent > 0`.
     */
    const featured =
      featuredGamesFor(at).has(session.game_type) &&
      !(await featuredTakenToday(db, input.userId, at, session.id));

    /*
     * The first-ever play of this game, +25 — **derived, not stored.**
     *
     * The rows that answer it are already written: a finished, paid session of
     * this game type belonging to this player. So there is no column and no
     * backfill, and the answer honours accounts that predate the bonus rather
     * than paying a player who has played Guess the Flag two hundred times
     * another 25 for playing it again. Practice cannot spend it (`life_spent >
     * 0`), and a practice round cannot claim it either — `paid` gates the whole
     * question below.
     *
     * **The welcome round neither claims it nor is exempt from spending it**,
     * and the rulebook does not say which way that should go. `!firstEver` is
     * the first half: a round paying a flat fifty outside the formula does not
     * also take the formula's bonuses. The second half falls out of the query
     * rather than being written — the welcome round is a real paid finished round
     * of `flags`, so the *next* round of `flags` is not a first play. Paying 25
     * on it would be paying twice for one discovery, and nobody is short: fifty
     * for that first round is more than the formula's most generous reading of
     * it, so playing all eight games once is 175 + 50 rather than §4.3's 200.
     */
    const newGame =
      paid &&
      !firstEver &&
      ((await db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM game_sessions
          WHERE user_id = $u AND game_type = $g AND finished_at IS NOT NULL
            AND life_spent > 0 AND id <> $s`,
        { u: input.userId, g: session.game_type, s: session.id },
      ))?.n ?? 0) === 0;

    /*
     * The personal best, +8, at most once per game per day.
     *
     * The one thing this formula needs stored — `player_game_bests` — because
     * performance is computed from events and never written down, so unlike
     * "have they played this before" it cannot be recovered from history.
     *
     * **A first record is not a personal best.** A player whose row does not
     * exist yet has nothing to beat, and they are collecting the +25 for the
     * same round; paying both would be paying twice for one fact. So this needs
     * a row to already be there *and* a strictly higher performance than it
     * holds.
     *
     * Once per game per day (§9.2) rather than once per round, because five
     * quizzes that all cap at 100 would otherwise pay the bonus on the way up
     * every round of a good session. `bonus_day` is the local day it was last
     * paid for this game.
     */
    const best = paid
      ? await db.get<{ best: number; bonus_day: string | null }>(
          `SELECT best, bonus_day FROM player_game_bests WHERE user_id = $u AND game_type = $g`,
          { u: input.userId, g: session.game_type },
        )
      : undefined;
    const personalBest =
      paid &&
      !firstEver &&
      best !== undefined &&
      scored.performance > best.best &&
      best.bonus_day !== dayOf(at);

    /*
     * The round, priced.
     *
     * `roundPoints` is the whole of rulebook §4.1 and the only place points are
     * computed; the welcome round is the documented exception and is computed
     * beside it rather than through it.
     *
     * A **practice** round is priced too, and then banks nothing. That is worth
     * doing rather than short-circuiting: the response carries the itemisation,
     * and a practice card that can say "this would have been 14" is the whole
     * argument for letting an empty tank play at all. The three bonuses are the
     * exception — they are reported as 0 because none of them was awarded, and a
     * card offering a +25 that was not paid would be a worse lie than a card
     * that is quiet about it.
     */
    const priced = roundPoints({
      performance: scored.performance,
      roundToday,
      featured,
      multiplier,
      perfect: paid,
      newGame,
      personalBest,
    });
    const welcomeScore = scored.correct * CONFIG.earn.welcomeRoundPerCorrect;

    /* A practice round writes no entry at all rather than an entry for zero.
       The ledger is the answer to "where did my points come from", and a row
       saying "nowhere" on every round played after a tank ran dry is noise in
       the one place that has to stay readable. */
    const banked = paid
      ? await ledger.earn(db, {
          userId: input.userId,
          /* The finished integer, and `earn` is told so. The plan multiplier is
             inside it — the formula applies it before the flat bonuses and they
             are deliberately not multiplied — so `earn` must record the factor
             rather than apply it a second time. The welcome round is the one
             exception and keeps the old arrangement: a flat figure that `earn`
             multiplies, which is what it has always done, and which nobody has
             ever reached anyway (a subscription on your first-ever round is not
             a state that occurs). */
          points: firstEver ? welcomeScore : priced.score,
          reason: 'game_win',
          sourceKind: 'game_session',
          sourceRef: session.id,
          multiplier,
          multiplierApplied: !firstEver,
          at,
        })
      : null;

    await db.run(
      `UPDATE game_sessions
          SET state = 'finished', score = $s, answered = $a, correct = $c,
              finished_at = $t, ledger_id = $l, life_spent = $ls
        WHERE id = $i`,
      {
        s: banked?.entry.delta ?? 0,
        a: scored.answered,
        c: scored.correct,
        t: at,
        l: banked?.entry.id ?? null,
        /* **This row is the record of the spend**, and for a round opened
           under rulebook §3 it was already written at the start — writing the
           same value here changes nothing. For a round opened before that rule
           this is still where the spend happens. `energyFor` reconstructs the
           whole tank from these rows, so this column is not bookkeeping beside
           the truth, it *is* the truth. Its name — `life_spent` — is historical; renaming a
           column needs a version-guarded table rebuild against a live database
           and buys nothing a player can see.

           It is also what `featuredTakenToday` and the first-play query read, so
           it is the single column that makes "practice consumes nothing" true
           across all three rules rather than in each of them separately.

           A practice round writes 0, and that is the whole of how the tank
           learns to ignore it: `energyFor` selects on `life_spent > 0`. There is
           nothing to take from an empty tank, and a round that borrowed against
           the next refill would make practice *cost* more than not playing. */
        ls: paid ? 1 : 0,
        i: session.id,
      },
    );

    /* The day's tally, written beside the row above and under the same
       condition, so the two cannot disagree about what a round cost. It answers
       a different question — how much energy went today — and it deliberately
       answers nothing about the tank: a day is a bucket and a refill clock needs
       an instant. It is also the decay curve's input, read at the top of this
       function before this line moves it. `lives_used` is a historical column
       name. */
    if (paid) {
      await db.run(
        `INSERT INTO daily_counters (user_id, day, lives_used) VALUES ($u, $d, 1)
           ON CONFLICT (user_id, day) DO UPDATE SET lives_used = daily_counters.lives_used + 1`,
        { u: input.userId, d: dayOf(at) },
      );

      /*
       * The record of how well this went, for the next round's +8.
       *
       * Written on **every** paid round and not only on an improvement, because
       * the point of the row is the record rather than the payment: the first
       * paid round of a game writes it with no bonus due, and every round after
       * that is measured against it. `GREATEST`-by-CASE rather than a read and a
       * compare in JavaScript, so two rounds finishing at once for one player
       * cannot both read the old figure and write the lower of their two.
       *
       * `bonus_day` moves only when the bonus was actually paid, which is what
       * makes "once per game per day" hold across a session of several rounds.
       */
      await db.run(
        `INSERT INTO player_game_bests (user_id, game_type, best, bonus_day, updated_at)
         VALUES ($u, $g, $p, $bd, $t)
           ON CONFLICT (user_id, game_type) DO UPDATE
             SET best = (CASE WHEN player_game_bests.best > $p THEN player_game_bests.best ELSE $p END),
                 bonus_day = COALESCE($bd, player_game_bests.bonus_day),
                 updated_at = $t`,
        {
          u: input.userId,
          g: session.game_type,
          p: scored.performance,
          bd: personalBest ? dayOf(at) : null,
          t: at,
        },
      );
    }

    /* The streak is what energy actually buys, so practice does not move it —
       and it does not *break* it either, because nothing here writes
       `last_played`. A player out of energy is in the same position they were
       in before they pressed Play, plus a round they got to play. */
    const state = await playerState(db, input.userId, at);
    const streak = paid
      ? await applyStreak(db, input.userId, scored, ent, at)
      : { streak: state.streak, freezes: state.freezes };
    const energy = await energyFor(db, input.userId, at);
    const balance = await ledger.balance(db, input.userId);

    return {
      score: banked?.entry.delta ?? 0,
      capped: 0,
      correct: scored.correct,
      answered: scored.answered,
      won: scored.won,
      streak: streak.streak,
      freezes: streak.freezes,
      energyLeft: energy.energy,
      energyNextAt: energy.nextAt,
      balance,
      paid,
      unpaidReason,
      nearest: await nearestReward(db, input.userId, balance),

      /* The itemisation. On a welcome round the formula did not run, so `base`
         and the three bonuses are 0 and `welcomeRound` says why; `performance`
         is still the honest figure, because the round was still played. */
      performance: scored.performance,
      base: firstEver ? 0 : priced.base,
      decay: priced.decay,
      roundToday,
      featured: firstEver ? false : featured,
      featuredMultiplier: !firstEver && featured ? CONFIG.games.featuredMultiplier : 1,
      multiplier,
      bonusPerfect: firstEver ? 0 : priced.bonusPerfect,
      bonusNewGame: firstEver ? 0 : priced.bonusNewGame,
      bonusPersonalBest: firstEver ? 0 : priced.bonusPersonalBest,
      welcomeRound: firstEver,
    };
  });
}

/* ══════════════════════════════════════════════ §4.1 the master formula ══ */

/** What `roundPoints` decided, itemised. The wire shape `Finish` carries. */
export interface RoundPoints {
  /** `max(2, round(performance / 100 × 18))`. */
  base: number;
  /** The rung `roundToday` landed on. */
  decay: number;
  bonusPerfect: number;
  bonusNewGame: number;
  bonusPersonalBest: number;
  /** `max(1, round(base × featured × decay × multiplier + bonuses))`. */
  score: number;
}

/**
 * Which decay rung a round of the day sits on — rulebook §4.1 step 4.
 *
 * The table is indexed from 0 for the first round and its **last rung repeats**,
 * so a tenth round is worth what a sixth is. Clamped at both ends rather than
 * trusted: a `roundToday` of 0 or a negative is a caller bug, and answering it
 * with `undefined × base = NaN` would put a NaN in the ledger's `delta` two
 * frames later, where it reads as a corrupt schema rather than as the arithmetic
 * mistake it is.
 */
export function decayFor(roundToday: number): number {
  const table = CONFIG.games.decayByRound;
  const index = Math.min(table.length, Math.max(1, Math.round(roundToday))) - 1;
  return table[index] ?? 1;
}

/**
 * Rulebook §4.1: performance and four facts about the player → points.
 *
 * **The whole formula lives here and nowhere else.** `games.finish` gathers the
 * inputs, `domain/tasks.ts` prices the "up to" figures its prompts advertise off
 * the same function, and `verify.ts` reproduces every cell of the published
 * payout table (§4.2) against it. Three callers and one implementation is the
 * arrangement that stops a task promising a number the ledger will not pay.
 *
 * ## The arithmetic is done in integers, and that is not fussiness
 *
 * Three of the six decay rungs — 0.65, 0.45 and 0.12 — are not exactly
 * representable as IEEE doubles, and the formula's last step is a **round**. So
 * a product that lands on a .5 boundary is decided by which side of it the
 * representation dust falls on, and the published table has cells on exactly
 * those boundaries: 70% featured is 13 × 1.5 = 19.5 and the table promises 20.
 * `Math.round(19.5)` is 20 and `Math.round(19.499999999999996)` is 19, and which
 * of those a float chain produces is not something to reason about per cell.
 *
 * Every factor is therefore taken as **hundredths** and multiplied as an
 * integer, so `scaled` is the exact numerator over 10^6 and the rounding is one
 * integer division. The largest value it can reach is 18 × 150 × 100 × 175 =
 * 47,250,000, comfortably inside a double's exact integer range.
 *
 * `Math.round(m × 100)` is how the plan multiplier joins that: it arrives as an
 * entitlement number rather than a constant, so it cannot be a table lookup, and
 * 1 / 1.25 / 1.75 are all exact at two decimal places.
 *
 * ## Why round rather than floor
 *
 * It was a floor, once, in `ledger.earn`, and the argument for it was that two
 * scorers returned halves that had to survive to the multiplier. Those tables
 * are gone and performance is an integer, so the halves are gone with them. What
 * is left is a published table computed with round-half-up, which a floor would
 * contradict in nine of its twenty-seven cells.
 */
export function roundPoints(input: {
  /** 0..100. Clamped, because a scorer returning 120 should not pay for it. */
  performance: number;
  /** 1-based. Which paid round of the day this is. */
  roundToday: number;
  featured: boolean;
  /** `points_multiplier`: 1, 1.25 or 1.75. */
  multiplier: number;
  /**
   * Whether a performance of 100 may take the +10.
   *
   * A flag rather than being inferred from `performance === 100`, because a
   * practice round can be perfect and must still pay nothing: `finish` passes
   * `paid` here. The other two bonuses are already decided by their callers for
   * the same reason.
   */
  perfect?: boolean;
  newGame?: boolean;
  personalBest?: boolean;
}): RoundPoints {
  const performance = Math.min(100, Math.max(0, Math.round(input.performance)));

  /* Step 2. `round(performance / 100 × 18)` in integers, then the floor of 2 —
     "a finished round never pays zero" (§4.2). */
  const base = Math.max(
    CONFIG.games.minRoundPoints,
    Math.floor((performance * CONFIG.games.maxRoundPoints + 50) / 100),
  );

  const decay = decayFor(input.roundToday);

  const bonusPerfect =
    input.perfect && performance >= 100 ? CONFIG.games.perfectRoundBonus : 0;
  const bonusNewGame = input.newGame ? CONFIG.games.newGameBonus : 0;
  const bonusPersonalBest = input.personalBest ? CONFIG.games.personalBestBonus : 0;
  const bonuses = bonusPerfect + bonusNewGame + bonusPersonalBest;

  /* Steps 3–5, as hundredths each, so the product is exact. */
  const featuredHundredths = input.featured
    ? Math.round(CONFIG.games.featuredMultiplier * 100)
    : 100;
  const decayHundredths = Math.round(decay * 100);
  const planHundredths = Math.round(input.multiplier * 100);
  const scaled = base * featuredHundredths * decayHundredths * planHundredths;

  /* Steps 6–7: the bonuses join at full scale, and the one rounding step is this
     integer division. `+ 500_000` is the half that makes it round-half-up. */
  const score = Math.max(1, Math.floor((scaled + (bonuses + 0.5) * 1_000_000) / 1_000_000));

  return { base, decay, bonusPerfect, bonusNewGame, bonusPersonalBest, score };
}

/**
 * The most a round of a given shape can pay, for the prompts that advertise one.
 *
 * `domain/tasks.ts` quotes two ceilings — "play a round" and "play today's
 * featured game" — and both have to come from the formula rather than from a
 * constant beside it, or the panel promises a figure the ledger will not pay.
 * A perfect round at the top of the decay curve, plus the perfect-round bonus.
 *
 * The other two bonuses are deliberately **out** of it. A ceiling including the
 * +25 would be right on the one round of a game a player will ever have and
 * wrong on every round after it, and a prompt that over-promises by 25 points is
 * worse than one that under-promises by nothing — the figure is already labelled
 * "up to".
 */
export function roundCeiling(input: { featured: boolean; multiplier: number }): number {
  return roundPoints({
    performance: 100,
    roundToday: 1,
    featured: input.featured,
    multiplier: input.multiplier,
    perfect: true,
  }).score;
}

interface Scored {
  /**
   * The round's **performance**, an integer 0..100 — rulebook §5.
   *
   * Not points, and not a fraction. Every game maps its own result onto this one
   * scale and stops there; `roundPoints` is the only thing in this file that
   * knows what a point is. A scorer that returned points would be a scorer that
   * had to know about the decay curve, the featured game and the player's plan,
   * which is how seven games came to have seven private payout tables.
   *
   * It was `score`, an exact and possibly fractional raw figure, floored once in
   * `ledger.earn`. Both halves of that are gone: there is nothing fractional
   * left to protect, and the rounding is at the end of `roundPoints`.
   */
  performance: number;
  correct: number;
  answered: number;
  won: boolean;
}

/**
 * How long the round took, in seconds, from the server's own event stamps.
 *
 * `game_events.created_at` is written when the event arrived, so the span is the
 * earliest stamp to the latest. The quizzes read it for their speed credit, and
 * it is one function because two copies of "how long did that take" would
 * eventually disagree about the empty round.
 *
 * Earliest and latest **by time** rather than by `seq`, because the client picks
 * the sequence numbers and the server picks the stamps: a round whose first move
 * is submitted last would otherwise measure as a negative duration and take the
 * credit.
 *
 * Fewer than two events is a round with no elapsed time to read, not an instant
 * one, so it is `Infinity` and earns nothing. That is the safe direction: the
 * alternative hands the credit to a round that reported one event.
 */
function elapsedSeconds(events: Array<{ created_at: string }>): number {
  const stamps = events.map((e) => Date.parse(e.created_at)).filter((t) => Number.isFinite(t));
  if (stamps.length < 2) return Number.POSITIVE_INFINITY;
  return (Math.max(...stamps) - Math.min(...stamps)) / 1000;
}

/**
 * A quiz: **20 performance a correct answer**, and 5 more for a fast round.
 *
 * Five of five is exactly 100, which is what makes a perfect quiz a perfect
 * round and pays the +10 with it. §5.1–5.3 of the rulebook; the three quiz banks
 * share this function because they are three banks of one game to a player, and
 * a scoring difference between them would be somebody in Tashkent paid
 * differently from somebody in Kraków for the same minute.
 *
 * **A quiz cannot be lost and there is no mistake cap.** A round used to end
 * after two wrong answers, which took the fifth question away from exactly the
 * player who needed it, and made `won` a statement about how many mistakes were
 * left rather than about how the round went. `won` is a clean sweep now.
 *
 * **The speed credit is no longer gated on a clean sweep**, and the gate went
 * because the thing it defended against stopped existing. It was there because
 * the fastest way through five questions is to answer them all wrong without
 * reading them, and under the old per-point table that bought a real bonus.
 * Under this one it buys nothing: five wrong answers in a second is performance
 * 5, and `max(2, round(5/100 × 18))` is 2 — exactly what five wrong answers
 * slowly pays, because the floor of 2 is already there. So the credit now does
 * only what §5.1 asks of it, which is to separate a fast *partial* round from a
 * slow one, and the cap at 100 is why it cannot do anything to a perfect one.
 *
 * The clock is the server's — `elapsedSeconds` above says why — so there is
 * nothing here for a client to report and nothing for a modified one to invent.
 */
function scoreQuiz(
  events: Array<{ correct: number | null; created_at: string }>,
  total: number,
): Scored {
  const answers = events.filter((e) => e.correct !== null);
  const correct = answers.filter((e) => e.correct === 1).length;
  const swept = correct >= total && answers.length - correct === 0;

  /* Every question answered, and the round inside the window. "Answered" and not
     "answered correctly": §5.1 prices the clock, and the cap above is what stops
     that being exploitable. */
  const quick =
    answers.length >= total &&
    elapsedSeconds(events) <= CONFIG.games.quizSpeedWithinSeconds;

  const performance =
    correct * CONFIG.games.quizPerformancePerCorrect +
    (quick ? CONFIG.games.quizSpeedCredit : 0);

  return {
    /* Clamped, which is the "total capped at 100" of §5.1: a perfect round is
       already perfect and the credit cannot take it past the top of the scale. */
    performance: Math.min(100, performance),
    correct,
    answered: total,
    won: swept,
  };
}

/**
 * Word Builder (§5.4): **33 performance a word**, +4 for a fast one, −10 a hint.
 *
 * Three words a round, and all three solved is promoted to **100 rather than
 * 99** — a clean sweep that cannot reach a perfect round is a rule a player
 * experiences as a bug, because there is no fourth word to go and find. The
 * rulebook says to do exactly that.
 *
 * **The word's tier no longer prices it.** `word_bank.tier` is still the only
 * human-set difficulty rating in the product and still decides which words are
 * dealt, but a scale where a hard word pays more is a scale where the round is
 * worth whatever it happened to deal — and "a round is a round" is the rule the
 * common scale exists to enforce. Difficulty is expressed now by what a player
 * can do in the time rather than by a multiplier on the word.
 *
 * **A hint is a flat 10 off**, where it used to halve that word's points. The
 * halving was priced against the tier, which no longer prices anything; a flat
 * tenth of a round costs the same wherever it is spent, which is what makes
 * pressing the button a decision rather than a lottery. Hints are an entitlement
 * — 3 free, 6 on Pro, 10 on Premium — so the tier buys help, and this is what
 * stops it also buying points.
 *
 * **The speed credit is per word, not per round**, which is the one place this
 * game is timed differently from the quizzes and is deliberate: the round is
 * three separate puzzles, and somebody who solves two instantly and then stares
 * at the third has earned it on two of them. Each word is measured from the
 * previous solve — or from the round's own `started_at` for the first one — off
 * stamps the server wrote. That boundary assumes words are played one at a time,
 * which is what the client does; a client that interleaved them would measure
 * shorter spans and collect more credits, and the only way to make a span
 * shorter is to actually submit the solve sooner, which is the thing being paid
 * for.
 *
 * A **wrong attempt** costs the word nothing and costs the sweep everything: the
 * promotion to 100 is paid only when every word was solved first try and
 * hint-free. That split is deliberate — the per-word rate is what somebody plays
 * for, and 99 against 100 is what a perfect round is for.
 */
function scoreWords(
  events: Array<{ seq: number; kind: string; payload: string; correct: number | null; created_at: string }>,
  words: string[],
  startedAt: string,
): Scored {
  /** Which word an event belongs to, or `null` if its payload cannot say. */
  const indexOf = (payload: string): number | null => {
    try {
      const n = Number((JSON.parse(payload) as { index?: number }).index);
      return Number.isInteger(n) ? n : null;
    } catch {
      return null;
    }
  };

  let performance = 0;
  let solved = 0;
  let clean = true;
  let hints = 0;

  /* The solves, in the order the server stamped them — which is the order the
     per-word clocks are measured against, and is not necessarily the order the
     words were dealt in. */
  const solves: Array<{ index: number; at: number }> = [];

  words.forEach((_, index) => {
    const mine = events.filter((e) => indexOf(e.payload) === index);
    const win = mine.find((e) => e.correct === 1);
    const hinted = mine.filter((e) => e.kind === 'hint').length;
    hints += hinted;

    if (!win) {
      clean = false;
      return;
    }
    solved += 1;
    performance += CONFIG.games.wordPerformancePerWord;

    const attempts = mine.filter((e) => e.kind !== 'hint');
    if (attempts.length !== 1 || hinted > 0) clean = false;

    const at = Date.parse(win.created_at);
    if (Number.isFinite(at)) solves.push({ index, at });
  });

  /* The per-word clocks. The first solve is measured from the round opening and
     each one after it from the solve before, so the seconds a player spent on a
     word they never solved fall into the next one they did — which is the honest
     direction: they did spend them. */
  solves.sort((a, b) => a.at - b.at);
  let previous = Date.parse(startedAt);
  for (const solve of solves) {
    const seconds = Number.isFinite(previous) ? (solve.at - previous) / 1000 : Number.POSITIVE_INFINITY;
    if (seconds >= 0 && seconds <= CONFIG.games.wordSpeedWithinSeconds) {
      performance += CONFIG.games.wordSpeedCredit;
    }
    previous = solve.at;
  }

  /* §5.4: "99, rounded to 100 for all three". Only on a clean sweep — every word
     first try and hint-free — so a fumbled or hinted sweep stays at whatever its
     own arithmetic says. */
  if (solved === words.length && clean) {
    performance = Math.max(performance, 100);
  }

  /*
   * **The credits are capped into the 100 before the hints come off, and the
   * order is the whole of what makes a hint cost anything.**
   *
   * Three words at 33 is 99 and three speed credits are 12, so the credit-
   * inclusive total on a fast round is 111. Clamped once, at the very end, a
   * single hint would come off the 111 and the clamp would hand back the same
   * 100 — a free hint on exactly the round where the button is least needed, and
   * the next two costing 10 each. Capping first is the same rule §5.1 states for
   * the quiz's own credit ("total capped at 100") and it makes the penalty mean
   * what it says: a fast sweep with one hint is 90, two is 80, three is 70.
   *
   * The floor at 0 is the second clamp and it is the one that keeps the round
   * payable: three hints on a round where nothing was solved is −30, and the
   * round's own minimum of 2 points is what a performance of 0 still pays.
   */
  performance = Math.min(100, performance) - hints * CONFIG.games.wordHintPenalty;

  return {
    performance: Math.min(100, Math.max(0, performance)),
    correct: solved,
    answered: words.length,
    won: solved === words.length,
  };
}

/**
 * Memory Match (§5.5): **60 for clearing the board, and moves buy the rest.**
 *
 * This is the change the rulebook makes that is most worth arguing out loud,
 * because the rule it replaces was chosen deliberately and for a real reason.
 * The board was scored on **elapsed time** here, on the argument that moves are
 * the one thing a player can optimise away entirely by writing the board down,
 * and a stopwatch cannot be beaten with a pencil. That is true. It is also the
 * wrong trade: a clock on the one game in the set with no fail state — the
 * deliberately accessible one, the one somebody plays because the quizzes are in
 * a language they are still learning — turns it into the least accessible thing
 * here. And the clock had a hole of its own that was cheaper than the pencil:
 * two `pair` events a millisecond apart took the top band.
 *
 * Moves price what the game is about, which is remembering what you saw. Six
 * pairs is six moves played perfectly, so the top band's ten allows four
 * mistakes; nineteen or more is the whole board turned over by trial and error,
 * and it still pays the 60 for finishing.
 *
 * **The pencil is real and it is bounded**: writing the board down is worth 100
 * instead of 85, which is 18 points instead of 15 at the top of the decay curve,
 * for a minute with a notepad, once, on the one round of the day that pays full.
 *
 * **A move is one `pair` event, counted from the rows the server wrote.** Never a
 * client-reported total: this game has no answer key to check one against. A
 * `peek` is not a move — it turns one card, carries no verdict, and is how the
 * shipped client shows the first card of a move — so counting peeks would charge
 * two moves for what the player experienced as one. Rows rather than distinct
 * card-pairs, because a client that re-turns the same two cards under a fresh
 * `seq` has made a second move by the protocol's own definition; the *pairs
 * found* are still counted distinctly, which is the figure printed beside the
 * moves.
 *
 * **The 90-second limit is enforced pair by pair**, not on the round's total
 * span. The deadline is 90 seconds after the round's first recorded event, and a
 * pair matched after it does not count — which is what lets an expired board be
 * scored on the pairs actually found in time rather than on whatever arrived
 * afterwards. Timing from the first *event* rather than from `started_at` is the
 * forgiving direction on purpose: the seconds somebody spends looking at a
 * freshly dealt board before touching it are not seconds the limit should eat.
 *
 * **Peeks are out of the tally and out of the move count, and a peek still
 * cannot pay.** A `peek` carries no verdict — `submitEvent` leaves `correct`
 * NULL, because it is not an answer — so the `correct !== 1` line below steps
 * over it and it can neither be counted as a pair nor land in the distinct-pair
 * set. What it can do is start the 90-second clock, since it is the round's first
 * recorded event, and it can never shorten it. That is the whole of why there is
 * no peek counter and no peek penalty.
 */
function scoreDeck(
  events: Array<{ kind: string; payload: string; correct: number | null; created_at: string }>,
  pairs: number,
): Scored {
  const stamps = events.map((e) => Date.parse(e.created_at)).filter((t) => Number.isFinite(t));
  /* No events is a round with nothing in it; the deadline is then irrelevant
     because nothing can be inside or outside it. */
  const deadline =
    stamps.length > 0
      ? Math.min(...stamps) + CONFIG.games.memoryLimitSeconds * 1000
      : Number.POSITIVE_INFINITY;

  /* **Distinct pairs, not matching events.** The two are the same number for a
     client that plays each pair once, and they come apart the moment one does
     not: a move whose *response* was lost has been recorded here, and a client
     that puts those two cards back down and turns them again submits the same
     match a second time under a fresh `seq`. Counting rows would report seven
     pairs found on a six-pair board. Normalised because `{a:3,b:7}` and
     `{a:7,b:3}` are one pair of cards. */
  const seen = new Set<string>();
  let moves = 0;
  for (const event of events) {
    const at = Date.parse(event.created_at);
    /* Past the limit the round is over, so neither the pair nor the move counts.
       A stamp that will not parse is treated as inside it, which is the
       forgiving direction for a row this module cannot read. */
    if (Number.isFinite(at) && at > deadline) continue;
    /* Every `pair` is a move, matched or not. A `peek` is not. */
    if (event.kind !== 'peek') moves += 1;
    if (event.correct !== 1) continue;
    try {
      const { a, b } = JSON.parse(event.payload) as { a?: unknown; b?: unknown };
      seen.add([Number(a), Number(b)].sort((x, y) => x - y).join(':'));
    } catch {
      /* A payload this module cannot read is not a pair it can name; it stays
         out of the tally rather than taking the round's score down with it. */
    }
  }
  const matched = seen.size;
  const complete = pairs > 0 && matched >= pairs;

  /*
   * A board that ran out of time scores `pairs / 6 × 50` — half marks for half a
   * board, and the 50 is the whole of what the limit enforces: an expired round
   * cannot reach the 60 that completing it pays, however many pairs it found.
   *
   * Rounded rather than floored so a nearly-finished board does not lose its last
   * point to arithmetic: five of six is 41.67, and 42 is the honest reading.
   */
  const performance = complete
    ? CONFIG.games.memoryBasePerformance + movesBonus(moves)
    : pairs > 0
      ? Math.round((matched * CONFIG.games.memoryExpiredCeiling) / pairs)
      : 0;

  return {
    performance: Math.min(100, Math.max(0, performance)),
    correct: matched,
    answered: pairs,
    /* There is no fail state in Memory Match — it is the deliberately accessible
       one of the set — so a cleared deck is a win. An expired one is not: the
       board was not finished, and that is the one distinction this game has. */
    won: complete,
  };
}

/**
 * The efficiency bonus for a cleared board, by moves used.
 *
 * `throughMoves` is **inclusive** — the field is named for the comparison, so
 * that "up to 10 moves" and `<= 10` cannot drift apart, and a board finished on
 * the boundary gets the band it can see it earned. The last rung has no ceiling
 * and pays nothing extra, because finishing is always worth the 60.
 */
function movesBonus(moves: number): number {
  const bands = CONFIG.games.memoryMoveBands;
  return (
    bands.find((band) => band.throughMoves !== null && moves <= band.throughMoves)?.bonus ??
    bands[bands.length - 1]?.bonus ??
    0
  );
}

/**
 * The endless flight (§5.6): **4 performance an obstacle**, so 25 is perfect.
 *
 * This one is honestly weaker than the rest and the comment says so: a physics
 * loop has no answer key, so the server cannot recompute the score, only bound
 * it. The 0..100 scale is now the first of those bounds — a claim of a thousand
 * gaps reaches exactly the 100 a good honest run reaches — and capping
 * *performance* rather than points is the stronger version of the old
 * `flightMaxPoints`: it does not have to guess how far a real player could fly,
 * only how far a perfect round goes.
 *
 * `flightTarget` decides whether the round was a *win*, not what it pays — five
 * gaps, matching the number the site's own screen shows the player. A win the
 * server and the client disagree about is worse than a hard target.
 *
 * The second bound is the server's own clock and the rulebook does not ask for
 * it. It is kept because the scale alone says nothing about whether a run could
 * have *happened*: a client posting 10,000 gaps one second after opening the
 * session reaches a perfect round and sits in the ledger looking exactly like a
 * very good player.
 */
/**
 * 2048, scored on the largest tile — from the board this server played, never
 * from anything the client says at the finish. A round with no moves made
 * nothing and performs at 0 (the master formula's floor still applies).
 *
 * `answered` is the five milestones from 128 to the target and `correct` how
 * many were reached, so the lifetime accuracy columns read "got to 512" as
 * three of five rather than as a figure from another game's scale.
 */
function scoreMerge(state: merge.MergeSecret): Scored {
  const bands = CONFIG.games.mergeTileBands;
  const best = state.best;
  const performance =
    state.moves === 0
      ? 0
      : (bands.find((band) => best >= band.tile)?.performance ?? CONFIG.games.mergeFloorPerformance);
  return {
    performance,
    correct: bands.filter((band) => best >= band.tile).length,
    answered: bands.length,
    won: best >= CONFIG.games.mergeTarget,
  };
}

/**
 * Food Cross, rulebook §5.8: the score the server's board made, linear against
 * `foodTargetScore`, capped at 100. No swaps made is 0. `correct` counts the
 * fifths of the target reached, out of `answered` = 5.
 */
function scoreFood(state: FoodSecret): Scored {
  const target = CONFIG.games.foodTargetScore;
  const score = state.score ?? 0;
  const performance = state.moves === 0 ? 0 : Math.min(100, Math.round((score / target) * 100));
  return {
    performance,
    correct: Math.min(5, Math.floor((score / target) * 5)),
    answered: 5,
    won: score >= target,
  };
}

/**
 * Food Ninja: the foods this server credited, from the `slice` rows it wrote —
 * never a total the client sends at the finish. `perFood` performance each,
 * capped at 100; `correct` is tenths of the perfect round, out of 5.
 */
function scoreNinja(events: Array<{ kind: string; payload: string }>): Scored {
  const sliced = new Set<number>();
  for (const event of events) {
    if (event.kind !== 'slice') continue;
    try {
      for (const id of (JSON.parse(event.payload) as { ids?: unknown[] }).ids ?? []) sliced.add(Number(id));
    } catch {
      /* Unreadable: credits nothing. */
    }
  }
  const per = CONFIG.games.ninjaPerformancePerFood;
  const perfect = Math.ceil(100 / per);
  return {
    performance: Math.min(100, sliced.size * per),
    correct: Math.min(5, Math.floor((sliced.size / perfect) * 5)),
    answered: 5,
    won: sliced.size >= perfect,
  };
}

/** A count against the rulebook's scale: `per` performance each, capped at 100. */
function perUnit(count: number, per: number): Scored {
  const perfect = Math.ceil(100 / per);
  return {
    performance: Math.min(100, count * per),
    correct: Math.min(5, Math.floor((count / perfect) * 5)),
    answered: 5,
    won: count >= perfect,
  };
}

/** A share of what the level holds: `done` of `total`, as 0..100. */
function share(done: number, total: number): Scored {
  const performance = total === 0 ? 0 : Math.round((done / total) * 100);
  return {
    performance,
    correct: Math.min(5, Math.floor((performance / 100) * 5)),
    answered: 5,
    won: total > 0 && done >= total,
  };
}

/**
 * Snake: the reported **turns**, replayed against this round's food list —
 * never a food count. `turns` is `[tick, dir]` pairs and `ticks` the tick the
 * round ended on; the replay is held to the round's own duration plus slack.
 */
function scoreSnake(secret: Record<string, unknown>, report: Record<string, unknown>, elapsed: number): Scored {
  const list = arcade.snakeFoods(arcadeRng(String(secret.seed), 'snake'));
  const raw = Array.isArray(report.turns) ? report.turns : [];
  const turns: Array<[number, number]> = [];
  for (const item of raw.slice(0, arcade.SNAKE_MAX_TURNS)) {
    if (Array.isArray(item) && item.length === 2) turns.push([Number(item[0]), Number(item[1])]);
  }
  const played = arcade.snakeReplay(list, turns, Number(report.ticks) || 0, elapsed * 1000 + CONFIG.games.snakeSlackMs);
  return perUnit(played.eaten, CONFIG.games.snakePerformancePerFood);
}

/** Canon Numbers: the blocks this server's board destroyed. */
function scoreCannon(state: arcade.CannonState): Scored {
  if (state.turn === 0) return { performance: 0, correct: 0, answered: 5, won: false };
  return perUnit(state.destroyed, CONFIG.games.cannonPerformancePerBlock);
}

/**
 * Breakout: the share of this round's wall broken. `broken` names brick ids,
 * so only bricks the wall has count, each once, and no more than the round's
 * duration allows.
 */
function scoreBreakout(secret: Record<string, unknown>, report: Record<string, unknown>, elapsed: number): Scored {
  const total = arcade.breakoutWall(arcadeRng(String(secret.seed), 'breakout')).length;
  const ids = new Set(
    (Array.isArray(report.broken) ? report.broken : [])
      .map(Number)
      .filter((id) => Number.isInteger(id) && id >= 0 && id < total),
  );
  const broken = arcade.bounded(ids.size, total, elapsed, CONFIG.games.breakoutBricksPerSecond, CONFIG.games.breakoutAllowance);
  return share(broken, total);
}

/** Doodle Jump: the highest platform stood on, bounded by the round's length. */
function scoreDoodle(report: Record<string, unknown>, elapsed: number): Scored {
  const reached = arcade.bounded(
    report.reached,
    arcade.DOODLE_PLATFORMS,
    elapsed,
    CONFIG.games.doodlePlatformsPerSecond,
    CONFIG.games.doodleAllowance,
  );
  return perUnit(reached, CONFIG.games.doodlePerformancePerPlatform);
}

/** Zuma: the share of the chain cleared, bounded by the round's length. */
function scoreZuma(report: Record<string, unknown>, elapsed: number): Scored {
  const cleared = arcade.bounded(
    report.cleared,
    arcade.ZUMA_CHAIN,
    elapsed,
    CONFIG.games.zumaBallsPerSecond,
    CONFIG.games.zumaAllowance,
  );
  return share(cleared, arcade.ZUMA_CHAIN);
}

function scoreFlight(report: Record<string, unknown>, elapsed: number): Scored {
  const claimed = Math.max(0, Math.floor(Number(report.cleared) || 0));
  /*
   * Columns arrive on a **timer**, not on a distance — `interval` in
   * `src/site/flight/config.ts` is 1.75 seconds and the difficulty ramp
   * deliberately does not change it (it spreads the columns further apart in
   * world units instead, which is what keeps this honest). So the number of gaps
   * a real run can have crossed is bounded by its own duration, and that
   * duration is measured from `started_at` to now — two stamps this server
   * wrote.
   *
   * `flightGapAllowance` is the slack, and it is deliberately generous: the
   * columns already on screen when a run begins were not waited for, clocks
   * drift, and a request takes time to arrive. Being lenient is the right
   * direction for a bound whose purpose is to refuse the impossible rather than
   * to referee the plausible.
   */
  const possible = Math.floor(elapsed / CONFIG.games.flightSecondsPerGap) + CONFIG.games.flightGapAllowance;
  const cleared = Math.min(claimed, Math.max(0, possible));
  const target = CONFIG.games.flightTarget;
  return {
    performance: Math.min(100, cleared * CONFIG.games.flightPerformancePerObstacle),
    correct: Math.min(cleared, target),
    answered: target,
    won: cleared >= target,
  };
}

/**
 * The streak, the lapse, the freeze and the comeback — the one place they are
 * decided.
 *
 * Ported from `src/site/auth/player.ts`, with one deliberate difference: a lapse
 * resets the **streak** and does not touch the balance. The old app wiped points
 * on a missed day (its own hot-deal terms in the imported data say so), and §2.1
 * makes the ledger the auditable source of truth — deleting a year of earnings
 * because somebody had a bad week is not one of the reasons it lists for a
 * negative entry, and nothing else takes points off a player either.
 *
 * `CONFIG` has no switch for this on purpose — bringing the wipe back is a
 * product decision that should arrive as an `adjustment` entry with a reason,
 * which is exactly what `ledger.reverse` and `earn(..., 'adjustment')` are for.
 * The lapse pays in the other direction instead: `payComeback` below.
 */
async function applyStreak(
  db: Db,
  userId: string,
  scored: Scored,
  ent: entitlements.Entitlements,
  at: Iso,
): Promise<{ streak: number; freezes: number }> {
  const state = await playerState(db, userId, at);
  const today = dayOf(at);
  const yesterday = dayOf(new Date(new Date(at).getTime() - 86_400_000).toISOString());

  const sameDay = state.last_played === today;
  const continued = state.last_played === yesterday || state.last_played === null;
  const lapsed = !sameDay && !continued;

  const held = Math.max(0, state.freezes);
  const frozen = lapsed && held > 0;

  const streak = sameDay ? state.streak : lapsed && !frozen ? 1 : state.streak + 1;

  /* How many freezes may be *held* is the plan's, not a constant: Free keeps a
     couple, the paid tiers keep more, and Premium's number is simply large
     enough that a streak never breaks. It is read as an ordinary number and not
     special-cased as "unlimited" — a cap nobody can reach and no cap at all
     behave identically, and only one of them needs a branch at every comparison
     that touches it. The fallback matches the free tier so a deployment that has
     not seeded the key yet behaves like the free plan rather than like Premium. */
  const maxFreezes = entitlements.entNumber(ent, 'streak_freezes', 2);

  let freezes = held;
  if (frozen) freezes -= 1;
  if (!sameDay && streak % CONFIG.games.freezeEvery === 0) {
    freezes = Math.min(maxFreezes, freezes + 1);
  }

  await db.run(
    `UPDATE player_states
        SET streak = $s, longest_streak = (CASE WHEN longest_streak > $s THEN longest_streak ELSE $s END), freezes = $f,
            answered = answered + $a, correct = correct + $c, last_played = $d, updated_at = $t
      WHERE user_id = $u`,
    { s: streak, f: freezes, a: scored.answered, c: scored.correct, d: today, t: at, u: userId },
  );

  /* This is the round that restarts the habit, so it is the round §2b pays for.
     Paid on the lapse whether or not a freeze absorbed it: a freeze protects the
     *streak*, not the fact that somebody was away and came back, and the two are
     different things to be pleased about. */
  if (lapsed) await payComeback(db, userId, at);

  return { streak, freezes };
}

/**
 * "Welcome back" — `CONFIG.earn.comeback`, at most once every
 * `comebackEveryDays`.
 *
 * **Its own ledger entry, not points folded into the round.** A round that pays
 * 110 with no line saying why is a number the player cannot check, and §2.1
 * makes the ledger the thing that answers where points came from. It is also why
 * this is worth having rather than token: the round it arrives on is the one
 * that ends an absence.
 *
 * **Once per window, not once per lapse.** A lapse is a fact that recurs — play
 * every third day and every third day is one — so keying the guard on the lapse
 * pays a monthly bonus ten times a month. `source_ref` carries the *window* the
 * day falls in instead, a fixed grid rather than "thirty days since the last
 * one", which is what lets both the payment and the check compute the same key
 * and makes `alreadyPaid` one indexed lookup rather than a scan. The grid costs
 * one thing and it is worth naming: two lapses either side of a boundary are two
 * payments a few days apart. A rolling window would need the date of the last
 * one and a second concept to hold it; a bounded, occasional extra hundred for
 * somebody who did come back twice is the cheaper mistake.
 *
 * **Flat, with no plan multiplier.** The earn table files it beside the referral
 * and invite one-offs and for the same reason: nobody should subscribe for a day
 * to harvest the bonus for a month they were not here. `earn` defaults the
 * multiplier to 1, so this is expressed by not passing one.
 */
async function payComeback(db: Db, userId: string, at: Iso): Promise<void> {
  const days = Math.floor(Date.parse(at) / 86_400_000);
  const ref = `comeback:${Math.floor(days / Math.max(1, CONFIG.earn.comebackEveryDays))}`;
  if (await ledger.alreadyPaid(db, userId, 'comeback', ref)) return;

  await ledger.earn(db, {
    userId,
    points: CONFIG.earn.comeback,
    /* `occasion` is the reason a customer reads in their history; `comeback` is
       the `source_kind` the arithmetic keys off. That split is the ledger's, and
       it is why a new bonus is not a new reason and not a migration. */
    reason: 'occasion',
    sourceKind: 'comeback',
    sourceRef: ref,
    at,
  });
}

/**
 * The day's featured game, in the order the Play screen rotates it.
 *
 * This is `DAILY_POOL` in `src/site/games/rules.ts` — `GAMES` without the local
 * Word Builder — restated in server game types, because the two programs share
 * no code. The local quiz is one slot that is two banks: which one a player is
 * dealt depends on their profile, and either is that day's game. `verify:api`
 * pins this order, so a reorder here that is not made there fails a check
 * rather than paying the bonus on the wrong card.
 */
export const DAILY_GAME_POOL: ReadonlyArray<ReadonlyArray<GameType>> = [
  ['flight'],
  ['memory_match'],
  ['flags'],
  ['capitals'],
  ['brain'],
  ['poland', 'uzbekistan'],
  ['word_builder'],
  ['merge_2048'],
  ['food_cross'],
  ['food_ninja'],
  ['snake'],
  ['cannon_numbers'],
  ['breakout'],
  ['doodle_jump'],
  ['zuma'],
];

/**
 * Which local-knowledge bank an account is dealt, by the country on its profile.
 *
 * `QUIZ_BANK_FOR_COUNTRY` in `src/site/games/banks.ts` is this same table, and it
 * is restated here rather than shared because the two programs share no code.
 * `verify:api` reads that file as text and compares the two, so a country added to
 * one and not the other fails a check rather than dealing an Uzbek bank to a
 * Polish account.
 *
 * **Poland is the fallback for everything, including an account with no country.**
 * The product's reason for existing is somebody who has just moved to Kraków, the
 * bank was built around that, and a card with no bank is worse than a card with
 * the wrong one — this is the same argument the site's own table makes.
 */
export const LOCAL_QUIZ_FOR_COUNTRY: Readonly<Record<string, GameType>> = {
  PL: 'poland',
  UZ: 'uzbekistan',
};

/** The bank for a country code, Poland for anything unrecognised or absent. */
export function localQuizFor(countryCode: string | null | undefined): GameType {
  return LOCAL_QUIZ_FOR_COUNTRY[(countryCode ?? '').toUpperCase()] ?? 'poland';
}

/** Which slot of `DAILY_GAME_POOL` a `YYYY-MM-DD` day posts. */
export function dailyGameFor(day: string): ReadonlyArray<GameType> {
  const n = DAILY_GAME_POOL.length;
  const index = ((Math.floor(Date.parse(day) / 86_400_000) % n) + n) % n;
  return DAILY_GAME_POOL[index] ?? [];
}

/**
 * Every game type that counts as "today's featured game" for a round at `at`.
 *
 * **Which day is the player's, and the server does not know their clock.** The
 * poster rotates on the reader's *local* date, and local dates run from a day
 * behind UTC to a day ahead of it. So a round counts if its game is the featured
 * one for yesterday, today or tomorrow in UTC — the only three a real clock can
 * be showing — and "once per day" is then keyed on the **UTC** day, so there is
 * still exactly one multiplied round whichever of the three it matched.
 *
 * It is a set of three slots rather than one, which means up to four game types
 * are eligible on any given day (the local quiz is one slot holding two banks).
 * That is the same latitude the flat bonus had and it costs the same thing: a
 * player who plays yesterday's featured game and then today's gets the ×1.5 on
 * the first of the two, not on both.
 */
export function featuredGamesFor(at: Iso): Set<GameType> {
  const base = Date.parse(dayOf(at));
  const out = new Set<GameType>();
  for (const offset of [-1, 0, 1]) {
    const day = new Date(base + offset * 86_400_000).toISOString().slice(0, 10);
    for (const gameType of dailyGameFor(day)) out.add(gameType);
  }
  return out;
}

/**
 * **The one game to put on the poster today**, resolved for this account.
 *
 * `featuredGamesFor` below is the set the ×1.5 is *honoured* on — three UTC days
 * wide, because the poster rotates on the reader's local date and the server does
 * not know their clock. That set is the right answer to "may this round take the
 * bonus" and the wrong one to "which card do I draw": it holds up to four game
 * types, and a hero card cannot name four.
 *
 * So this is the server's **own** UTC day, one slot, with the local-quiz slot
 * resolved to the single bank this account is dealt. Two clients were picking that
 * card themselves and by two different rules — one off the day number modulo the
 * number of cards, one off the daily word — so Home and Play could name different
 * games on the same day and neither matched the game the bonus was paid on. There
 * is one answer to that question and it belongs to whoever pays the bonus.
 *
 * `null` only when the rotation genuinely posts nothing, which `DAILY_GAME_POOL`
 * cannot currently do; it is in the signature because an empty slot is a data
 * state and a client that assumed a value would break on it rather than on
 * nothing.
 *
 * It does **not** say whether the bonus is still available — `featuredTakenToday`
 * answers that, and the `daily_game` task carries it as `done`. The poster is the
 * same all day whether or not somebody has claimed it.
 */
export async function featuredGameFor(
  db: Db,
  userId: string,
  at: Iso = now(),
): Promise<GameType | null> {
  const slot = dailyGameFor(dayOf(at));
  if (slot.length === 0) return null;
  /* One entry for six of the seven slots; the local quiz is the seventh and is
     the only one that needs the account at all, so the read is skipped for the
     others rather than made unconditionally. */
  if (slot.length === 1) return slot[0];

  const row = await db.get<{ country_code: string | null }>(
    `SELECT country_code FROM users WHERE id = $u`,
    { u: userId },
  );
  const mine = localQuizFor(row?.country_code);
  /* Resolved *within the slot*: if the slot ever holds banks this account's
     country is not one of, the first is still an honest answer and a card the
     client can draw. */
  return slot.includes(mine) ? mine : slot[0];
}

/**
 * Whether the day's featured ×1.5 has already been taken.
 *
 * **Derived rather than stored**, which is the same argument the energy tank and
 * the balance make: the rows that answer it are already written. A paid round of
 * an eligible game, finished today, is what taking it looks like — and because
 * the filter is `life_spent > 0`, a practice round cannot take it, exactly as it
 * cannot take the first-play bonus or a place on the decay curve.
 *
 * It replaced a `ledger.alreadyPaid` lookup against a `daily_game` entry, which
 * existed because the bonus used to be a ledger row of its own. A multiplier on
 * the round has no row to look for, and inventing one — a zero-value marker
 * entry whose only purpose is to be found again — would be a line in the
 * player's own points history that says nothing about their points.
 *
 * `excludeSessionId` is the round being scored: it has no `finished_at` yet at
 * the moment `finish` asks, so excluding it is belt and braces rather than
 * load-bearing, and it is what keeps the answer right if this is ever called
 * after the update.
 *
 * Also read by `domain/tasks.ts`, to mark the "today's game" prompt done.
 */
export async function featuredTakenToday(
  db: Db,
  userId: string,
  at: Iso = now(),
  excludeSessionId?: string,
): Promise<boolean> {
  const eligible = [...featuredGamesFor(at)];
  if (eligible.length === 0) return false;

  /* Built inline because the list is this module's own constant tuple, never
     user input — there is nothing here for a client to reach. */
  const placeholders = eligible.map((_, i) => `$g${i}`).join(', ');
  const params: Record<string, string> = { u: userId, d: dayOf(at), s: excludeSessionId ?? '' };
  eligible.forEach((gameType, i) => {
    params[`g${i}`] = gameType;
  });

  const row = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM game_sessions
      WHERE user_id = $u AND finished_at IS NOT NULL AND life_spent > 0
        AND substr(finished_at, 1, 10) = $d
        AND game_type IN (${placeholders})
        AND id <> $s`,
    params,
  );
  return (row?.n ?? 0) > 0;
}

/** "You're 60 from 10% off at Café Bratysławska" — from the real balance. */
async function nearestReward(db: Db, userId: string, balance: number) {
  const row = await db.get<{ venue_id: string; name: string; discount_pct: number; points_cost: number }>(
    `SELECT t.venue_id, v.name, t.discount_pct, t.points_cost
       FROM voucher_tiers t JOIN venues v ON v.id = t.venue_id
      WHERE t.active = 1 AND v.status = 'live' AND t.points_cost > $b
        AND ($city IS NULL OR v.city = $city)
      ORDER BY t.points_cost ASC LIMIT 1`,
    {
      b: balance,
      city:
        (await db.get<{ city: string | null }>(`SELECT city FROM users WHERE id = $u`, { u: userId }))?.city ??
        null,
    },
  );
  if (!row) return null;
  return {
    venueId: row.venue_id,
    venueName: row.name,
    discountPct: row.discount_pct,
    pointsNeeded: row.points_cost - balance,
  };
}

/* ─────────────────────────────────────────────────────────────── utilities ── */

/**
 * A deterministic shuffle.
 *
 * Seeded rather than `Math.random` so a round can be rebuilt from its stored
 * seed — which is what makes a disputed session reviewable at all — and so the
 * option order in a question is reproducible when somebody asks why a player
 * says the answer moved.
 */
export function shuffle<T>(items: T[], seed: string): T[] {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    hash = (Math.imul(hash, 48271) + 11) % 2147483647;
    const j = Math.abs(hash) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** §7.3's daily shared word: the same word for everyone, keyed to the date. */
export async function dailyWord(db: Db, language: string, at: Iso = now()): Promise<string | null> {
  const day = dayOf(at);
  const existing = await db.get<{ word: string }>(
    `SELECT word FROM daily_words WHERE day = $d AND language = $l`,
    { d: day, l: language },
  );
  if (existing) return existing.word;

  const pool = await db.all<{ word: string }>(
    `SELECT word FROM word_bank WHERE language = $l AND tier >= 2 ORDER BY word`,
    { l: language },
  );
  if (pool.length === 0) return null;

  /* Indexed by the date rather than picked at random, so every server and every
     replica agrees without coordinating. */
  const index = Number(day.replace(/-/g, '')) % pool.length;
  const word = pool[index].word;
  await db.run(`INSERT OR REPLACE INTO daily_words (day, language, word) VALUES ($d, $l, $w)`, {
    d: day,
    l: language,
    w: word,
  });
  return word;
}
