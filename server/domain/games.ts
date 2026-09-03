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
 * **A round's score is `floor(raw × points_multiplier)` and nothing else.** No
 * daily ceiling trims it and no curve shrinks a repeat — a per-game decay curve
 * did the second of those and is gone. **Energy is the single limiter**: every
 * finished round costs one, win or lose, which is twelve rounds a day sustained
 * on the free plan (sixteen from a full tank), 24/30 on Pro and 48/58 on
 * Premium. The curve was written when play was unlimited and it was the only
 * brake there was; once energy became one it stopped reaching, because it was
 * per *game* and a player rotating the seven never got to its zero rung. One
 * rule that can be explained on a result card beats two that overlap. Anything
 * that wants to make a day smaller belongs in `CONFIG.points`.
 *
 * **`raw` is exact and may hold halves; the one floor is the one in
 * `ledger.earn`.** Two of the scorers can end on a half point — a hinted word
 * is worth half its tier, and a gap in the flight is worth half a point — and
 * the whole round is floored once, after the plan multiplier, rather than at
 * each item. Flooring twice is how a player loses a point they earned: two
 * hinted words at 1.5 each are 3, and 1 + 1 is 2.
 */
import { GAME_TYPES, type Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import * as entitlements from './entitlements.ts';
import * as ledger from './ledger.ts';
import { DomainError } from './errors.ts';
import { newId } from './ids.ts';
import { iso, now, type Iso } from './time.ts';

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
const QUIZZES = new Set<GameType>(['flags', 'capitals', 'brain', 'poland', 'uzbekistan']);

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
 * A round *abandoned* still costs nothing. The charge is written in `finish`
 * and nowhere else, so a connection that drops mid-round takes nothing with it
 * — which is the one failure the player definitely did not choose.
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
  const ent = await entitlements.entitlementsFor(db, { userId });
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

  const rows = await db.all<{ finished_at: string }>(
    `SELECT finished_at FROM game_sessions
      WHERE user_id = $u AND life_spent > 0 AND finished_at IS NOT NULL AND finished_at <= $t
      ORDER BY finished_at DESC LIMIT $n`,
    { u: userId, t: at, n: ENERGY_LOOKBACK },
  );

  /* Newest first, stopping at the last moment the tank was provably full. */
  const spends: number[] = [];
  let newer = asked;
  for (const row of rows) {
    const spent = Date.parse(row.finished_at);
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
    at?: Iso;
  },
): Promise<Round> {
  const at = input.at ?? now();
  const language = input.language ?? 'en';

  return db.tx(async () => {
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
    await db.run(
      `UPDATE game_sessions SET state = 'abandoned' WHERE user_id = $u AND state = 'active'`,
      { u: input.userId },
    );

    const built = await buildRound(db, input.gameType, input.userId, language);
    const id = newId('gms');
    await db.run(
      `INSERT INTO game_sessions
         (id, user_id, game_type, language, seed, secret, state, started_at)
       VALUES ($i, $u, $g, $l, $s, $sec, 'active', $t)`,
      {
        i: id,
        u: input.userId,
        g: input.gameType,
        l: language,
        s: built.seed,
        sec: JSON.stringify(built.secret),
        t: at,
      },
    );

    return {
      sessionId: id,
      gameType: input.gameType,
      content: built.content,
      energyLeft: energy.energy,
      paid: energy.energy > 0,
    };
  });
}

interface Built {
  seed: string;
  /** Stays on the server. */
  secret: unknown;
  /** Goes to the client. */
  content: unknown;
}

async function buildRound(db: Db, gameType: GameType, userId: string, language: string): Promise<Built> {
  if (QUIZZES.has(gameType)) return await buildQuiz(db, gameType, userId, language);
  if (gameType === 'word_builder') return await buildWords(db, userId, language);
  if (gameType === 'memory_match') return buildDeck();
  return { seed: newId('gev'), secret: { kind: 'flight' }, content: { target: CONFIG.games.flightTarget } };
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
async function buildQuiz(db: Db, gameType: GameType, userId: string, language: string): Promise<Built> {
  const count = CONFIG.games.quizQuestions;
  const rows = await db.all<{ id: string; prompt: string; answer: string; distractors: string }>(
    `SELECT q.id, q.prompt, q.answer, q.distractors FROM quiz_items q
      WHERE q.bank = $b AND q.language = $l
        AND q.id NOT IN (
          SELECT item_key FROM game_recent_items
           WHERE user_id = $u AND game_type = $g
           ORDER BY served_at DESC LIMIT $w)
      ORDER BY RANDOM() LIMIT $n`,
    { b: gameType, l: language, u: userId, g: gameType, w: CONFIG.games.recentWindow, n: count },
  );

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
    secret: { kind: 'quiz', answers: questions.map((q) => q.answerIndex) },
    /* `mistakesAllowed` is gone from here because the rule is: **all five
       questions are asked and a quiz cannot be lost.** A key that always said
       "two" is a screen drawing two hearts that never empty.

       `perCorrect` and `speedBands` are on the wire for the same reason: what a
       question is worth and what the clock is worth are the server's rules, and
       a client that hardcodes "answer in ten seconds for two points" is a second
       copy of a table this file owns. The bands are what the round timer draws
       against; the *timing* is still the server's, off its own event stamps. */
    content: {
      questions: questions.map((q) => ({ index: q.index, prompt: q.prompt, options: q.options })),
      perCorrect: CONFIG.games.quizPerCorrect,
      perfectBonus: CONFIG.games.quizPerfectBonus,
      speedBands: CONFIG.games.quizSpeedBands,
    },
  };
}

async function buildWords(db: Db, userId: string, language: string): Promise<Built> {
  const rows = await db.all<{ id: string; word: string; tier: number; hint: string | null }>(
    `SELECT id, word, tier, hint FROM word_bank
      WHERE language = $l
        AND id NOT IN (SELECT item_key FROM game_recent_items
                        WHERE user_id = $u AND game_type = 'word_builder'
                        ORDER BY served_at DESC LIMIT $w)
      ORDER BY RANDOM() LIMIT $n`,
    { l: language, u: userId, w: CONFIG.games.recentWindow, n: CONFIG.games.wordsPerRound },
  );
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
       it does not get the word, which is the answer. */
    content: {
      words: rows.map((row, index) => ({
        index,
        length: row.word.length,
        tier: row.tier,
        letters: shuffle([...row.word.toUpperCase()], row.id),
        hint: row.hint,
      })),
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
       Sending the layout and asking the client not to look is not a design. */
    content: { cards: deck.length, pairs },
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
    await entitlements.entitlementsFor(db, { userId }),
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
   * How many points the daily ceiling trimmed — now always 0, and kept.
   *
   * There is no daily game ceiling and nothing else shrinks a round either: a
   * per-game decay curve did for a while, and `decay` travelled on this body to
   * explain it. Both are gone. The field stays because the app reads this body
   * and dropping a key is a protocol change for a fact that is simply "nothing
   * was trimmed" — and it never has been.
   */
  capped: number;
  correct: number;
  answered: number;
  won: boolean;
  streak: number;
  freezes: number;
  energyLeft: number;
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
  /** §7.4's reward connection, computed from the real balance. */
  nearest: { venueId: string; venueName: string; discountPct: number; pointsNeeded: number } | null;
}

/**
 * Finish a round: score it from the recorded events, then bank it.
 *
 * One ledger entry per session (§7.4), written by `ledger.earn`, which owns the
 * daily cap. The streak is decided by `applyStreak` below, and nothing else in
 * the backend is allowed to decide it — the site's own rule, for the same
 * reason: seven games score seven ways and none of them has any business
 * restating what a streak is.
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
 * movement, no freeze earned or spent, no comeback payment, no day counted, and
 * no energy taken (there is none to take). The session row is still written —
 * the round happened — with `life_spent = 0`, which is the column `energyFor`
 * filters on, so a practice round is invisible to the tank rather than being a
 * spend the tank has to be taught to ignore.
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
    }>(
      `SELECT id, user_id, state, secret, game_type, started_at FROM game_sessions WHERE id = $i`,
      { i: input.sessionId },
    );
    if (!session) throw new DomainError('not_found', 'session not found');
    if (session.user_id !== input.userId) throw new DomainError('forbidden', 'not your session');
    if (session.state !== 'active') throw new DomainError('invalid_state', 'session already finished');

    /* Paid or practice — the tank as it was when this round opened. See the
       note above the function for why it is asked about `started_at` and not
       about now. */
    const paid = (await energyFor(db, input.userId, session.started_at)).energy > 0;

    /* `created_at` is selected because Memory Match is scored on it. It is the
       server's stamp, written when the event arrived — the client has no clock
       this module is willing to read. */
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

    const scored =
      secret.kind === 'quiz'
        ? scoreQuiz(events, (secret.answers as number[]).length)
        : secret.kind === 'words'
          ? scoreWords(events, secret.words as string[], (secret.tiers as number[] | undefined) ?? [])
          : secret.kind === 'deck'
            ? scoreDeck(events, CONFIG.games.memoryPairs)
            : scoreFlight(input.clientReport ?? {});

    const ent = await entitlements.entitlementsFor(db, { userId: input.userId });
    const multiplier = entitlements.entNumber(ent, 'points_multiplier', 1);

    /* The raw score goes to the ledger untouched, and the plan multiplier is
       applied inside `ledger.earn` — one rounding step, `floor(raw ×
       points_multiplier)`, and that is the whole of what a round pays.

       **That floor is the only one, and it is deliberately here rather than in
       the scorers.** Two of them return halves: a hinted word is worth half its
       tier and a gap in the flight is worth half a point. Rounding each item as
       it is scored throws those halves away one at a time — two hinted words
       are 1.5 + 1.5 = 3, and flooring each first gives 2 — so the scorers
       accumulate exactly and the round is made whole once, after the
       multiplier, at the moment it becomes an integer number of points in the
       ledger. Flooring twice is how a player loses a point they earned.

       Nothing here asks how much has already been played today. A per-game
       decay curve used to, and it is gone: energy is charged on the way out of
       this function and is the only thing that bounds a day. A second brake
       that shrinks the reward is a result card that cannot explain itself. */
    /* A practice round writes no entry at all rather than an entry for zero.
       The ledger is the answer to "where did my points come from", and a row
       saying "nowhere" on every round played after a tank ran dry is noise in
       the one place that has to stay readable. */
    const banked = paid
      ? await ledger.earn(db, {
          userId: input.userId,
          points: scored.score,
          reason: 'game_win',
          sourceKind: 'game_session',
          sourceRef: session.id,
          multiplier,
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
        /* **The energy is spent here, and this row is the record of it.** Every
           *paid* round costs one, win or lose — which is still why the charge
           cannot live in `startSession`: a round that is abandoned rather than
           finished never reaches this line and never costs anything.
           `energyFor` reconstructs the whole tank from these rows and their
           `finished_at`, so this column is not bookkeeping beside the truth, it
           *is* the truth. Its name — `life_spent` — is historical; renaming a
           column needs a version-guarded table rebuild against a live database
           and buys nothing a player can see.

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
       an instant. `lives_used` is likewise a historical column name. */
    if (paid) {
      await db.run(
        `INSERT INTO daily_counters (user_id, day, lives_used) VALUES ($u, $d, 1)
           ON CONFLICT (user_id, day) DO UPDATE SET lives_used = daily_counters.lives_used + 1`,
        { u: input.userId, d: dayOf(at) },
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
      balance,
      paid,
      nearest: await nearestReward(db, input.userId, balance),
    };
  });
}

interface Scored {
  /**
   * The **exact** raw score, halves and all.
   *
   * Not an integer, on purpose: a hinted word is worth half its tier and a gap
   * in the flight half a point, and the round is floored once in `finish` after
   * the plan multiplier. A scorer that rounds its own total is the second floor
   * that costs a player the halves they earned.
   */
  score: number;
  correct: number;
  answered: number;
  won: boolean;
}

/**
 * How long the round took, in seconds, from the server's own event stamps.
 *
 * `game_events.created_at` is written when the event arrived, so the span is the
 * earliest stamp to the latest. Two games read it — the quizzes for their speed
 * bonus and Memory Match for its whole score — and it is one function because
 * two copies of "how long did that take" would eventually disagree about the
 * empty round.
 *
 * Earliest and latest **by time** rather than by `seq`, because the client picks
 * the sequence numbers and the server picks the stamps: a round whose first move
 * is submitted last would otherwise measure as a negative duration and take the
 * fastest band.
 *
 * Fewer than two events is a round with no elapsed time to read, not an instant
 * one, so it is `Infinity` and lands in the slowest band. That is the safe
 * direction: the alternative hands the top band to a round that reported one
 * event.
 */
function elapsedSeconds(events: Array<{ created_at: string }>): number {
  const stamps = events.map((e) => Date.parse(e.created_at)).filter((t) => Number.isFinite(t));
  if (stamps.length < 2) return Number.POSITIVE_INFINITY;
  return (Math.max(...stamps) - Math.min(...stamps)) / 1000;
}

/**
 * Which band a duration lands in. `throughSeconds` is **inclusive** — the field
 * is named for the comparison, so that "up to 10 seconds" and `<= 10` cannot
 * drift apart, and a round finishing on the boundary gets the band it can see it
 * earned.
 */
function bandFor<T extends { throughSeconds: number | null }>(
  bands: ReadonlyArray<T>,
  seconds: number,
): T {
  return bands.find((b) => b.throughSeconds !== null && seconds <= b.throughSeconds)
    ?? bands[bands.length - 1];
}

/**
 * A quiz: a point a question, one more for taking all five, and the clock on top
 * of that.
 *
 * **A quiz cannot be lost and there is no mistake cap.** A round used to end
 * after two wrong answers, which took the fifth question away from exactly the
 * player who needed it, and made `won` a statement about how many mistakes were
 * left rather than about how the round went. `won` is a clean sweep now, which
 * is the only distinction still worth drawing — and it is the one both bonuses
 * are paid on.
 *
 * **The speed bonus is a clean-sweep bonus too**, and that is the whole of what
 * keeps it honest: timed on the round rather than on a question, the fastest way
 * through five questions is to answer them all wrong without reading them. Five
 * right in ten seconds or under is 5 + 1 + 2 = 8, the ceiling for a quiz; five
 * right at any speed is at least 6; four right is 4, whatever the clock said.
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
  const wrong = answers.length - correct;
  const swept = wrong === 0 && correct >= total;

  const bonus = swept
    ? CONFIG.games.quizPerfectBonus +
      bandFor(CONFIG.games.quizSpeedBands, elapsedSeconds(events)).points
    : 0;

  return {
    score: correct * CONFIG.games.quizPerCorrect + bonus,
    correct,
    answered: total,
    won: swept,
  };
}

/**
 * Word Builder (§7.3): **a word is worth its tier**, halved if it was hinted,
 * plus a bonus for a clean sweep.
 *
 * **The tier is the bank's, not the scorer's.** `word_bank.tier` is the only
 * difficulty rating in the product that a human set, and it is carried through
 * the round's secret from the row the word came from. This used to recompute it
 * as `ceil(length / 2) - 1` — a guess about a table that already knows the
 * answer. The seeded banks happen to agree with that guess, which is exactly why
 * it survived; the moment a curator calls a four-letter word hard, or a long
 * word easy, the guess pays the wrong bonus and nothing fails loudly.
 *
 * The tier *is* the payment now — 1, 2 or 3 — where it used to be a flat base of
 * 1 plus a bonus of 0/1/2. Same three numbers, one table.
 *
 * **A hint halves the word rather than stripping its bonus.** Stripping it
 * priced the reveal backwards: a tier-3 word fell from 3 to 1 and a tier-1 word
 * fell from 1 to 1, so the hint was free where nobody needs it and cost two
 * thirds where everybody does. A half is the same share of whatever the word is
 * worth, which is what makes pressing it a decision rather than a trap — and it
 * is the reason this function returns a fraction and does not round it. Two
 * hinted tier-3 words are 3, and 1.5 floored twice is 2.
 *
 * A **wrong attempt** costs the word nothing and costs the sweep everything:
 * the bonus below is paid only when every word was solved first try and
 * hint-free. That split is deliberate — the per-word rate is what somebody plays
 * for, and the bonus is what a perfect round is for.
 *
 * There is deliberately no speed bonus. This is the one game in the set where
 * thinking is the activity, and a clock on it turns a puzzle into a typing test;
 * the quizzes carry one because a question you know is answered instantly.
 */
function scoreWords(
  events: Array<{ seq: number; kind: string; payload: string; correct: number | null }>,
  words: string[],
  tiers: number[],
): Scored {
  const table = CONFIG.games.wordTierPoints;
  let score = 0;
  let solved = 0;
  let clean = true;

  words.forEach((_, index) => {
    const mine = events.filter((e) => {
      try {
        return Number((JSON.parse(e.payload) as { index?: number }).index) === index;
      } catch {
        return false;
      }
    });
    const win = mine.find((e) => e.correct === 1);
    if (!win) {
      clean = false;
      return;
    }
    solved += 1;

    const attempts = mine.filter((e) => e.kind !== 'hint');
    const hinted = mine.some((e) => e.kind === 'hint');
    const firstTry = attempts.length === 1;
    if (!firstTry || hinted) clean = false;

    /* Clamped into the table rather than trusted: the table is the range of
       tiers this scoring understands, and a bank row outside it — or a session
       opened before tiers travelled in the secret, which reads as `undefined` —
       must land on the easiest rung rather than index past the end and pay
       `NaN`. */
    const tier = Math.min(table.length, Math.max(1, Math.round(tiers[index] ?? 1)));
    score += table[tier - 1] * (hinted ? CONFIG.games.wordHintFactor : 1);
  });

  if (solved === words.length && clean) score += CONFIG.games.wordPerfectBonus;
  return { score, correct: solved, answered: words.length, won: solved > 0 };
}

/**
 * Memory Match: the clock, and nothing else.
 *
 * Moves decided it before, through an efficiency curve — and moves are the one
 * thing a player can optimise away entirely by writing the board down, which
 * made the one game in the set with no fail state also the best-paying minute in
 * the product. A stopwatch cannot be beaten with a pencil.
 *
 * The clock is the server's, through `elapsedSeconds` above — a client-reported
 * duration is one a modified client invents, and this game has no answer key to
 * check it against.
 *
 * Bands rather than a curve so the result screen can name the one you landed in
 * and what the next one was worth, and the last band pays rather than zeroing —
 * finishing is always worth something, which is what keeps the accessible game
 * accessible now that it is timed. Three bands now, at 18/23/over paying 8/6/3,
 * where it was four at 40/70/110/over: a six-pair board is not a forty-second
 * game for anybody paying attention, so almost every finished round used to land
 * in the top band and the clock was decorative.
 *
 * The boundaries are **inclusive** — a board finished on the stroke of 18
 * seconds takes the 18-second band. `bandFor` is why, and `throughSeconds` is
 * named so the comparison and the copy cannot drift apart.
 *
 * **Peeks are in the clock and out of the tally, and that pairing is the whole
 * of what keeps single-card turns from being free.** A `peek` carries no verdict
 * — `submitEvent` leaves `correct` NULL, because it is not an answer — so the
 * `correct !== 1` line below steps over it and it can neither be counted as a
 * pair nor land in the distinct-pair set. It is still an event, so it is inside
 * the span `elapsedSeconds` measures, and a wider span never pays more. That is
 * why there is no peek counter and no peek penalty: the only input to this score
 * is a duration a peek can lengthen and cannot shorten.
 */
function scoreDeck(
  events: Array<{ payload: string; correct: number | null; created_at: string }>,
  pairs: number,
): Scored {
  /* **Distinct pairs, not matching events.** The two are the same number for a
     client that plays each pair once, and they come apart the moment one does
     not: a move whose *response* was lost has been recorded here, and a client
     that puts those two cards back down and turns them again submits the same
     match a second time under a fresh `seq`. Counting rows would then report
     seven pairs found on a six-pair board — which pays the same, because this
     game is scored on the clock alone, and reads as a bug in the one figure the
     result card shows beside the time. Normalised because `{a:3,b:7}` and
     `{a:7,b:3}` are one pair of cards. */
  const seen = new Set<string>();
  for (const event of events) {
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
  /* A round with fewer than two events has no elapsed time to read, not a fast
     one — `elapsedSeconds` returns `Infinity` and `bandFor` lands it on the
     slowest band, which still pays. A scoring function is the wrong place to
     reject a session the player has already played. */
  const band = bandFor(CONFIG.games.memoryBands, elapsedSeconds(events));

  /*
   * **The band is the rate; the pairs found are what it is paid on.**
   *
   * It used to be `band.points` flat, and that priced a round on the clock and
   * on nothing else — so two `pair` events a millisecond apart, matching
   * nothing, finished in the top band and banked the full eight. `correct: 0`
   * on the body was the only tell, and nothing read it. A round that found
   * nothing paid the same as a cleared board, which is not a scoring rule
   * anybody chose; it is the shape the function happened to have.
   *
   * Proportional rather than a threshold, for the same reason the quiz pays per
   * answer instead of demanding a sweep: a player who finds four pairs of six
   * has played four pairs' worth of the game, and a cliff at "cleared" would
   * pay them nothing for it. A cleared board still pays the whole band, which
   * is the case that has to stay exactly as it was.
   *
   * Rounded rather than floored so a nearly-finished board does not lose its
   * last point to arithmetic — five of six at the top band is 6.67, and 7 is
   * the honest reading of that.
   *
   * The accessibility of this game is untouched: there is still no fail state,
   * no clock on screen, and the slowest band still pays. What changed is that
   * it pays for pairs.
   */
  const score = pairs > 0 ? Math.round((band.points * matched) / pairs) : 0;

  return {
    score,
    correct: matched,
    answered: pairs,
    /* There is no fail state in Memory Match — it is the deliberately accessible
       one of the set — so a finished deck is always a win. */
    won: true,
  };
}

/**
 * The endless flight.
 *
 * This one is honestly weaker than the rest and the comment says so: a physics
 * loop has no answer key, so the server cannot recompute the score, only bound
 * it. `flightMaxPoints` is that bound and it is now the whole defence — the
 * points a run can be worth are capped directly, so a client claiming a thousand
 * gaps banks exactly what a good honest run banks, and the claim is still
 * visible in the ledger as an implausible run. Capping the *points* rather than
 * the gaps is the stronger version of the same rule: it does not have to guess
 * how far a real player could fly.
 *
 * `flightTarget` decides whether the round was a *win*, not what it pays — five
 * gaps, matching the number the site's own screen shows the player. A win the
 * server and the client disagree about is worse than a hard target.
 *
 * **Half a point a gap**, so the ceiling is forty gaps rather than twenty. The
 * client ramps the scroll speed as a run goes on, which is what makes the far
 * half of that a run rather than a wait — but none of that is simulated here.
 * This function is handed `{cleared}` and clamps it, which is the honest limit
 * of what a server can say about a physics loop it did not run.
 *
 * An odd gap count therefore ends on a half point, and it is **left** there: the
 * round is floored once, in `finish`, after the plan multiplier. Seven gaps is
 * 3.5 and banks 3 on the free plan and 4 on Pro, which is the multiplier doing
 * its job rather than two roundings cancelling it out.
 */
function scoreFlight(report: Record<string, unknown>): Scored {
  const cleared = Math.max(0, Math.floor(Number(report.cleared) || 0));
  const target = CONFIG.games.flightTarget;
  return {
    score: Math.min(cleared * CONFIG.games.flightPerGap, CONFIG.games.flightMaxPoints),
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
