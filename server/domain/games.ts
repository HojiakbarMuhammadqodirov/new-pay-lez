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
 * finished round costs one, win or lose, which is six rounds a day sustained on
 * the free plan (nine from a full tank), eight on Pro and twelve on Premium.
 * The curve was written when play was unlimited and it was the only brake there
 * was; once energy became one it stopped reaching, because it was per *game*
 * and a player rotating the seven never got to its zero rung. One rule that can
 * be explained on a result card beats two that overlap. Anything that wants to
 * make a day smaller belongs in `CONFIG.points`.
 */
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import * as entitlements from './entitlements.ts';
import * as ledger from './ledger.ts';
import { DomainError } from './errors.ts';
import { newId } from './ids.ts';
import { iso, now, type Iso } from './time.ts';

export type GameType =
  | 'flags'
  | 'capitals'
  | 'brain'
  | 'poland'
  | 'word_builder'
  | 'memory_match'
  | 'flight';

const QUIZZES = new Set<GameType>(['flags', 'capitals', 'brain', 'poland']);

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

export function playerState(db: Db, userId: string, at: Iso = now()): PlayerState {
  let state = db.get<PlayerState>(`SELECT * FROM player_states WHERE user_id = $u`, { u: userId });
  if (!state) {
    db.run(
      `INSERT INTO player_states (user_id, streak, longest_streak, freezes, lives, answered, correct, updated_at)
       VALUES ($u, 0, 0, 0, $l, 0, 0, $t)`,
      /* `lives` is seeded and then left alone. It is not the tank — `energyFor`
         derives that below — and keeping a second number in step with a count
         nothing stores is exactly the drift this design removes. The column
         keeps the old word because renaming one needs a version-guarded table
         rebuild against a live database and buys nothing anybody can see. */
      { u: userId, l: CONFIG.points.dailyEnergy, t: at },
    );
    state = db.get<PlayerState>(`SELECT * FROM player_states WHERE user_id = $u`, { u: userId })!;
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
 * `energy_regen_minutes`** now — four hours on the free plan, faster on a paid
 * one — so an empty tank is a wait measured in hours. Read with the ceiling it
 * gives the size of a day: `daily_energy + 1440 / energy_regen_minutes` rounds
 * from full, 10 free, 14 on Pro, 22 on Premium.
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
export function energyFor(db: Db, userId: string, at: Iso = now()): Energy {
  const ent = entitlements.entitlementsFor(db, { userId });
  /* Both fall back to the free tier's own figure, so a deployment that has not
     seeded the keys yet plays like the free plan rather than like Premium. */
  const max = entitlements.entNumber(ent, 'daily_energy', CONFIG.points.dailyEnergy);
  const regen = entitlements.entNumber(
    ent,
    'energy_regen_minutes',
    CONFIG.points.energyRegenMinutes,
  );
  return energyAt(db, userId, at, max, regen);
}

/**
 * How many spends back the walk below will read before it gives up looking for a
 * gap long enough to have refilled the tank.
 *
 * That gap is `max × interval` and it is usually one or two rows in: a player
 * who has not finished a round in sixteen hours is full, and nothing older than
 * the round that broke that run can affect the count. The limit bounds the
 * pathological case instead — somebody who has finished a round every three
 * hours for a fortnight, where no such gap exists — and there the fold starts
 * from a full tank further back than it should, which the very next spend in
 * the fold takes back off. It bounds the query, never the rule.
 *
 * Every finished round is a spend now rather than every lost one, so this walk
 * reads several times as many rows per player as it did. Sixty-four is still
 * past the gap on every plan — Premium is 10 × 2h = 20 hours of play without a
 * break before the limit is even consulted — but it is the number to revisit
 * first if the ceiling or the interval ever move, and the ceiling has now moved
 * once.
 */
const ENERGY_LOOKBACK = 64;

/**
 * The bucket: fill at one per interval, capped, drained one per finished round.
 *
 * Worked in **milliseconds of regeneration** rather than in fractional energy.
 * The fraction is the part that matters — a round finished at three hours
 * fifty-nine into a four-hour interval must leave that minute of progress on the
 * clock, not restart it, or the next round can cost four hours it did not earn —
 * and integer milliseconds carry it exactly where a float carries it to the last
 * bit and then floors to the wrong count.
 */
function energyAt(db: Db, userId: string, at: Iso, plan: number, regenMinutes: number): Energy {
  /* Floored: half an energy is not a thing the screen can draw, and a fractional
     ceiling never compares equal to a whole count, so `nextAt` would count down
     for ever to one that never lands. */
  const max = Math.max(0, Math.floor(plan));
  const interval = Math.max(1, Math.round(regenMinutes)) * 60_000;
  const full = max * interval;
  const asked = Date.parse(at);

  const rows = db.all<{ finished_at: string }>(
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
 */
export function startSession(
  db: Db,
  input: { userId: string; gameType: GameType; language?: string; at?: Iso },
): Round {
  const at = input.at ?? now();
  const language = input.language ?? 'en';

  return db.tx(() => {
    const energy = energyFor(db, input.userId, at);
    if (energy.energy <= 0) {
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
    db.run(
      `UPDATE game_sessions SET state = 'abandoned' WHERE user_id = $u AND state = 'active'`,
      { u: input.userId },
    );

    const built = buildRound(db, input.gameType, input.userId, language);
    const id = newId('gms');
    db.run(
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

function buildRound(db: Db, gameType: GameType, userId: string, language: string): Built {
  if (QUIZZES.has(gameType)) return buildQuiz(db, gameType, userId, language);
  if (gameType === 'word_builder') return buildWords(db, userId, language);
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
function buildQuiz(db: Db, gameType: GameType, userId: string, language: string): Built {
  const count = CONFIG.games.quizQuestions;
  const rows = db.all<{ id: string; prompt: string; answer: string; distractors: string }>(
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
    db.run(
      `INSERT INTO game_recent_items (user_id, game_type, item_key, served_at) VALUES ($u, $g, $k, $t)
         ON CONFLICT (user_id, game_type, item_key) DO UPDATE SET served_at = excluded.served_at`,
      { u: userId, g: gameType, k: row.id, t: at },
    );
  }
  /* Trim the tail so the table does not grow without bound per player. */
  db.run(
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
    content: {
      questions: questions.map((q) => ({ index: q.index, prompt: q.prompt, options: q.options })),
      mistakesAllowed: CONFIG.games.quizMistakes,
      perCorrect: CONFIG.games.quizPerCorrect,
    },
  };
}

function buildWords(db: Db, userId: string, language: string): Built {
  const rows = db.all<{ id: string; word: string; tier: number; hint: string | null }>(
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
    db.run(
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
function requireHint(db: Db, userId: string, sessionId: string, seq: number, at: Iso): void {
  const used =
    db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM game_events e
         JOIN game_sessions s ON s.id = e.session_id
        WHERE s.user_id = $u AND e.kind = 'hint'
          AND substr(e.created_at, 1, 10) = $d
          AND NOT (e.session_id = $s AND e.seq = $q)`,
      { u: userId, d: dayOf(at), s: sessionId, q: seq },
    )?.n ?? 0;

  /* The fallback is the free tier's own figure, so a deployment that has not
     seeded `word_hints_per_day` behaves like the free plan rather than like
     Premium — the same argument as `streak_freezes` below. */
  entitlements.requireCapacity(
    entitlements.entitlementsFor(db, { userId }),
    'word_hints_per_day',
    used,
    3,
  );
}

/**
 * Validate one reported event against the stored secret.
 *
 * The reply says whether *this* answer was right and nothing about the next one.
 * Returning the whole answer key on the first event — which is the shape a naive
 * "here is the round" endpoint takes — hands a modified client a perfect score.
 */
export function submitEvent(
  db: Db,
  input: { sessionId: string; userId: string; seq: number; kind: string; payload: Record<string, unknown>; at?: Iso },
): EventResult {
  const at = input.at ?? now();
  return db.tx(() => {
    const session = db.get<{ id: string; user_id: string; state: string; secret: string; game_type: GameType }>(
      `SELECT id, user_id, state, secret, game_type FROM game_sessions WHERE id = $i`,
      { i: input.sessionId },
    );
    if (!session) throw new DomainError('not_found', 'session not found');
    if (session.user_id !== input.userId) throw new DomainError('forbidden', 'not your session');
    if (session.state !== 'active') throw new DomainError('invalid_state', 'session is finished');

    const secret = JSON.parse(session.secret) as Record<string, unknown>;
    let correct: boolean | undefined;
    let answer: number | string | undefined;

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
        requireHint(db, input.userId, input.sessionId, input.seq, at);
        const position = Math.min(Math.max(0, Number(input.payload.position ?? 0)), words[index].length - 1);
        answer = words[index][position];
        correct = undefined;
      }
    } else if (secret.kind === 'deck') {
      const deck = secret.deck as string[];
      const a = Number(input.payload.a);
      const b = Number(input.payload.b);
      if (!deck[a] || !deck[b] || a === b) throw new DomainError('bad_request', 'no such cards');
      correct = deck[a] === deck[b];
      answer = deck[a];
    }

    try {
      db.run(
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
         answer. */
      return { correct, answer, accepted: false };
    }

    return { correct, answer, accepted: true };
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
 */
export function finish(
  db: Db,
  input: { sessionId: string; userId: string; clientReport?: Record<string, unknown>; at?: Iso },
): Finish {
  const at = input.at ?? now();

  return db.tx(() => {
    const session = db.get<{
      id: string;
      user_id: string;
      state: string;
      secret: string;
      game_type: GameType;
    }>(`SELECT id, user_id, state, secret, game_type FROM game_sessions WHERE id = $i`, {
      i: input.sessionId,
    });
    if (!session) throw new DomainError('not_found', 'session not found');
    if (session.user_id !== input.userId) throw new DomainError('forbidden', 'not your session');
    if (session.state !== 'active') throw new DomainError('invalid_state', 'session already finished');

    /* `created_at` is selected because Memory Match is scored on it. It is the
       server's stamp, written when the event arrived — the client has no clock
       this module is willing to read. */
    const events = db.all<{
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

    const ent = entitlements.entitlementsFor(db, { userId: input.userId });
    const multiplier = entitlements.entNumber(ent, 'points_multiplier', 1);

    /* The raw score goes to the ledger untouched, and the plan multiplier is
       applied inside `ledger.earn` — one rounding step, `floor(raw ×
       points_multiplier)`, and that is the whole of what a round pays.

       Nothing here asks how much has already been played today. A per-game
       decay curve used to, and it is gone: energy is charged on the way out of
       this function and is the only thing that bounds a day. A second brake
       that shrinks the reward is a result card that cannot explain itself. */
    const banked = ledger.earn(db, {
      userId: input.userId,
      points: scored.score,
      reason: 'game_win',
      sourceKind: 'game_session',
      sourceRef: session.id,
      multiplier,
      at,
    });

    db.run(
      `UPDATE game_sessions
          SET state = 'finished', score = $s, answered = $a, correct = $c,
              finished_at = $t, ledger_id = $l, life_spent = $ls
        WHERE id = $i`,
      {
        s: banked.entry.delta,
        a: scored.answered,
        c: scored.correct,
        t: at,
        l: banked.entry.id,
        /* **The energy is spent here, and this row is the record of it.** Every
           finished round costs one, win or lose — which is still why the charge
           cannot live in `startSession`: a round that is abandoned rather than
           finished never reaches this line and never costs anything.
           `energyFor` reconstructs the whole tank from these rows and their
           `finished_at`, so this column is not bookkeeping beside the truth, it
           *is* the truth. Its name — `life_spent` — is historical; renaming a
           column needs a version-guarded table rebuild against a live database
           and buys nothing a player can see. */
        ls: 1,
        i: session.id,
      },
    );

    /* The day's tally, written beside the row above and unconditionally, so the
       two cannot disagree about what a round cost. It answers a different
       question — how much energy went today — and it deliberately answers
       nothing about the tank: a day is a bucket and a refill clock needs an
       instant. `lives_used` is likewise a historical column name. */
    db.run(
      `INSERT INTO daily_counters (user_id, day, lives_used) VALUES ($u, $d, 1)
         ON CONFLICT (user_id, day) DO UPDATE SET lives_used = lives_used + 1`,
      { u: input.userId, d: dayOf(at) },
    );

    const streak = applyStreak(db, input.userId, scored, ent, at);
    const energy = energyFor(db, input.userId, at);
    const balance = ledger.balance(db, input.userId);

    return {
      score: banked.entry.delta,
      capped: 0,
      correct: scored.correct,
      answered: scored.answered,
      won: scored.won,
      streak: streak.streak,
      freezes: streak.freezes,
      energyLeft: energy.energy,
      balance,
      nearest: nearestReward(db, input.userId, balance),
    };
  });
}

interface Scored {
  score: number;
  correct: number;
  answered: number;
  won: boolean;
}

/**
 * A quiz: a point a question, and a bonus for taking all five.
 *
 * The bonus is what makes the last question worth thinking about. At a flat
 * point apiece the difference between four right and five is one point, which is
 * not a reason to slow down — so five right is worth ten and four is worth four,
 * and the fifth question is the round.
 */
function scoreQuiz(events: Array<{ correct: number | null }>, total: number): Scored {
  const answers = events.filter((e) => e.correct !== null);
  const correct = answers.filter((e) => e.correct === 1).length;
  const wrong = answers.length - correct;
  const perfect = wrong === 0 && correct >= total ? CONFIG.games.quizPerfectBonus : 0;
  return {
    score: correct * CONFIG.games.quizPerCorrect + perfect,
    correct,
    answered: total,
    won: wrong <= CONFIG.games.quizMistakes,
  };
}

/**
 * Word Builder (§7.3): a point per word solved, the word's own tier on top, and
 * a bonus for a clean sweep.
 *
 * **The tier is the bank's, not the scorer's.** `word_bank.tier` is the only
 * difficulty rating in the product that a human set, and it is carried through
 * the round's secret from the row the word came from. This used to recompute it
 * as `ceil(length / 2) - 1` — a guess about a table that already knows the
 * answer. The seeded banks happen to agree with that guess, which is exactly why
 * it survived; the moment a curator calls a four-letter word hard, or a long
 * word easy, the guess pays the wrong bonus and nothing fails loudly.
 *
 * A hint forfeits that tier bonus and keeps the base point. That is what makes
 * taking one a decision rather than a free reveal, and it is also why the base
 * survives: a word solved with help is still a word solved, and a hint that
 * zeroes the word is a hint nobody presses even when they are stuck.
 *
 * There is deliberately no speed bonus. Three constants existed for one and none
 * of them was ever read against a clock — every answer scored the same flat
 * bonus whatever the timings said, which is not a bonus, it is a base rate with
 * extra words.
 */
function scoreWords(
  events: Array<{ seq: number; kind: string; payload: string; correct: number | null }>,
  words: string[],
  tiers: number[],
): Scored {
  const bonuses = CONFIG.games.wordTierBonus;
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

    score += CONFIG.games.wordBase;
    if (hinted) return;
    /* Clamped into the bonus table rather than trusted: the table is the range
       of tiers this scoring understands, and a bank row outside it — or a
       session opened before tiers travelled in the secret, which reads as
       `undefined` — must land on the easiest rung rather than index past the
       end and pay `NaN`. */
    const tier = Math.min(bonuses.length, Math.max(1, Math.round(tiers[index] ?? 1)));
    score += bonuses[tier - 1];
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
 * The clock is the server's. `game_events.created_at` is stamped when the event
 * arrived, so the span is the earliest stamp to the latest — a client-reported
 * duration is one a modified client invents, and this game has no answer key to
 * check it against. Earliest and latest *by time* rather than by `seq`, because
 * the client picks the sequence numbers and the server picks the stamps: a round
 * whose first move is submitted last would otherwise measure as a negative
 * duration and take the top band.
 *
 * Bands rather than a curve so the result screen can name the one you landed in
 * and what the next one was worth, and the last band pays rather than zeroing —
 * finishing is always worth something, which is what keeps the accessible game
 * accessible now that it is timed.
 */
function scoreDeck(
  events: Array<{ correct: number | null; created_at: string }>,
  pairs: number,
): Scored {
  const matched = events.filter((e) => e.correct === 1).length;
  const bands = CONFIG.games.memoryBands;
  const floor = bands[bands.length - 1];

  const stamps = events.map((e) => Date.parse(e.created_at)).filter((t) => Number.isFinite(t));
  /* Fewer than two events is a round with no elapsed time to read, not a fast
     one. It takes the floor band rather than throwing: a finished deck always
     pays, and a scoring function is the wrong place to reject a session the
     player has already played. */
  const seconds =
    stamps.length >= 2
      ? (Math.max(...stamps) - Math.min(...stamps)) / 1000
      : Number.POSITIVE_INFINITY;

  const band = bands.find((b) => b.underSeconds !== null && seconds < b.underSeconds) ?? floor;

  return {
    score: band.points,
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
function applyStreak(
  db: Db,
  userId: string,
  scored: Scored,
  ent: entitlements.Entitlements,
  at: Iso,
): { streak: number; freezes: number } {
  const state = playerState(db, userId, at);
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

  db.run(
    `UPDATE player_states
        SET streak = $s, longest_streak = MAX(longest_streak, $s), freezes = $f,
            answered = answered + $a, correct = correct + $c, last_played = $d, updated_at = $t
      WHERE user_id = $u`,
    { s: streak, f: freezes, a: scored.answered, c: scored.correct, d: today, t: at, u: userId },
  );

  /* This is the round that restarts the habit, so it is the round §2b pays for.
     Paid on the lapse whether or not a freeze absorbed it: a freeze protects the
     *streak*, not the fact that somebody was away and came back, and the two are
     different things to be pleased about. */
  if (lapsed) payComeback(db, userId, at);

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
function payComeback(db: Db, userId: string, at: Iso): void {
  const days = Math.floor(Date.parse(at) / 86_400_000);
  const ref = `comeback:${Math.floor(days / Math.max(1, CONFIG.earn.comebackEveryDays))}`;
  if (ledger.alreadyPaid(db, userId, 'comeback', ref)) return;

  ledger.earn(db, {
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
function nearestReward(db: Db, userId: string, balance: number) {
  const row = db.get<{ venue_id: string; name: string; discount_pct: number; points_cost: number }>(
    `SELECT t.venue_id, v.name, t.discount_pct, t.points_cost
       FROM voucher_tiers t JOIN venues v ON v.id = t.venue_id
      WHERE t.active = 1 AND v.status = 'live' AND t.points_cost > $b
        AND ($city IS NULL OR v.city = $city)
      ORDER BY t.points_cost ASC LIMIT 1`,
    {
      b: balance,
      city:
        db.get<{ city: string | null }>(`SELECT city FROM users WHERE id = $u`, { u: userId })?.city ??
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
export function dailyWord(db: Db, language: string, at: Iso = now()): string | null {
  const day = dayOf(at);
  const existing = db.get<{ word: string }>(
    `SELECT word FROM daily_words WHERE day = $d AND language = $l`,
    { d: day, l: language },
  );
  if (existing) return existing.word;

  const pool = db.all<{ word: string }>(
    `SELECT word FROM word_bank WHERE language = $l AND tier >= 2 ORDER BY word`,
    { l: language },
  );
  if (pool.length === 0) return null;

  /* Indexed by the date rather than picked at random, so every server and every
     replica agrees without coordinating. */
  const index = Number(day.replace(/-/g, '')) % pool.length;
  const word = pool[index].word;
  db.run(`INSERT OR REPLACE INTO daily_words (day, language, word) VALUES ($d, $l, $w)`, {
    d: day,
    l: language,
    w: word,
  });
  return word;
}
