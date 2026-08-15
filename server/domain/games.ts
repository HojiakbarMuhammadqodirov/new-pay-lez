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
 * clamped and capped instead, and the comment on `finishFlight` says exactly how
 * much that is worth.
 *
 * The scoring tables are the same ones `src/site/auth/player.ts` implements on
 * the client, kept in `config.ts`. That duplication is deliberate and one-way:
 * the client's copy decides what the *animation* says, this one decides what the
 * balance does.
 */
import type { Db } from '../db/db.ts';
import { CONFIG } from '../config.ts';
import * as entitlements from './entitlements.ts';
import * as ledger from './ledger.ts';
import { DomainError } from './errors.ts';
import { newId } from './ids.ts';
import { now, type Iso } from './time.ts';

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
  lives: number;
  answered: number;
  correct: number;
  last_played: string | null;
  difficulty: number;
}

/* ═══════════════════════════════════════════════════════ §7.2 the lives pool ══ */

/** The user's own local day. Their midnight is when lives come back. */
const dayOf = (at: Iso): string => at.slice(0, 10);

export function playerState(db: Db, userId: string, at: Iso = now()): PlayerState {
  let state = db.get<PlayerState>(`SELECT * FROM player_states WHERE user_id = $u`, { u: userId });
  if (!state) {
    db.run(
      `INSERT INTO player_states (user_id, streak, longest_streak, freezes, lives, answered, correct, updated_at)
       VALUES ($u, 0, 0, 0, $l, 0, 0, $t)`,
      { u: userId, l: CONFIG.points.dailyLives, t: at },
    );
    state = db.get<PlayerState>(`SELECT * FROM player_states WHERE user_id = $u`, { u: userId })!;
  }
  return state;
}

/**
 * Lives remaining today, refilled if the day turned.
 *
 * "Lives come back with a new day rather than on a timer nobody can see" — the
 * site's own rule, and the server is where it has to be true, because a client
 * that decides when midnight was decides how many rounds it may play.
 */
export function livesFor(db: Db, userId: string, at: Iso = now()): { lives: number; max: number } {
  const state = playerState(db, userId, at);
  const ent = entitlements.entitlementsFor(db, { userId });
  const max = entitlements.entNumber(ent, 'daily_lives', CONFIG.points.dailyLives);

  const used =
    db.get<{ lives_used: number }>(
      `SELECT lives_used FROM daily_counters WHERE user_id = $u AND day = $d`,
      { u: userId, d: dayOf(at) },
    )?.lives_used ?? 0;

  void state;
  return { lives: Math.max(0, max - used), max };
}

function spendLife(db: Db, userId: string, at: Iso): void {
  db.run(
    `INSERT INTO daily_counters (user_id, day, lives_used) VALUES ($u, $d, 1)
       ON CONFLICT (user_id, day) DO UPDATE SET lives_used = lives_used + 1`,
    { u: userId, d: dayOf(at) },
  );
}

/* ══════════════════════════════════════════════════════ §7.1 game sessions ══ */

export interface Round {
  sessionId: string;
  gameType: GameType;
  /** What the client may see. Never the answers. */
  content: unknown;
  livesLeft: number;
}

/**
 * Open a round.
 *
 * A life is *not* spent here. The site's rule is that a life is lost on a loss,
 * and charging one at the start would punish a player whose connection dropped
 * before the first question — which is the one failure they definitely did not
 * choose. What the check at the top does is refuse to *start* a round with an
 * empty tank, which is the same rule from the other side.
 */
export function startSession(
  db: Db,
  input: { userId: string; gameType: GameType; language?: string; at?: Iso },
): Round {
  const at = input.at ?? now();
  const language = input.language ?? 'en';

  return db.tx(() => {
    const lives = livesFor(db, input.userId, at);
    if (lives.lives <= 0) {
      throw new DomainError('no_lives', 'no lives left today', { resetsAt: `${dayOf(at)}T24:00` });
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

    return { sessionId: id, gameType: input.gameType, content: built.content, livesLeft: lives.lives };
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
    secret: { kind: 'words', words: rows.map((r) => r.word.toUpperCase()) },
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
      /* A hint reveals one letter and nothing else — the position asked for. */
      if (input.kind === 'hint') {
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
  capped: number;
  correct: number;
  answered: number;
  won: boolean;
  streak: number;
  freezes: number;
  livesLeft: number;
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

    const events = db.all<{ seq: number; kind: string; payload: string; correct: number | null }>(
      `SELECT seq, kind, payload, correct FROM game_events WHERE session_id = $s ORDER BY seq`,
      { s: session.id },
    );
    const secret = JSON.parse(session.secret) as Record<string, unknown>;

    const scored =
      secret.kind === 'quiz'
        ? scoreQuiz(events, (secret.answers as number[]).length)
        : secret.kind === 'words'
          ? scoreWords(events, secret.words as string[])
          : secret.kind === 'deck'
            ? scoreDeck(events, CONFIG.games.memoryPairs)
            : scoreFlight(input.clientReport ?? {});

    const ent = entitlements.entitlementsFor(db, { userId: input.userId });
    const multiplier = entitlements.entNumber(ent, 'points_multiplier', 1);

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
        ls: scored.won ? 0 : 1,
        i: session.id,
      },
    );

    if (!scored.won) spendLife(db, input.userId, at);

    const streak = applyStreak(db, input.userId, scored, at);
    const lives = livesFor(db, input.userId, at);
    const balance = ledger.balance(db, input.userId);

    return {
      score: banked.entry.delta,
      capped: banked.capped,
      correct: scored.correct,
      answered: scored.answered,
      won: scored.won,
      streak: streak.streak,
      freezes: streak.freezes,
      livesLeft: lives.lives,
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

function scoreQuiz(events: Array<{ correct: number | null }>, total: number): Scored {
  const answers = events.filter((e) => e.correct !== null);
  const correct = answers.filter((e) => e.correct === 1).length;
  const wrong = answers.length - correct;
  return {
    score: correct * CONFIG.games.quizPerCorrect,
    correct,
    answered: total,
    won: wrong <= CONFIG.games.quizMistakes,
  };
}

/**
 * Word Builder (§7.3): base + tier + first-try + speed, minus the bonuses a hint
 * removes, plus the perfect-round bonus.
 *
 * The timings come from the *server's* record of when each event arrived, not
 * from a duration the client reports. A speed bonus a client can claim is a
 * speed bonus every client claims.
 */
function scoreWords(
  events: Array<{ seq: number; kind: string; payload: string; correct: number | null }>,
  words: string[],
): Scored {
  let score = 0;
  let solved = 0;
  let allFirstTry = true;

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
      allFirstTry = false;
      return;
    }
    solved += 1;

    const attempts = mine.filter((e) => e.kind !== 'hint');
    const hinted = mine.some((e) => e.kind === 'hint');
    const firstTry = attempts.length === 1;
    if (!firstTry || hinted) allFirstTry = false;

    const tier = Math.min(3, Math.max(1, Math.ceil(words[index].length / 2) - 1));
    score += CONFIG.games.wordBase + CONFIG.games.wordTierBonus[tier - 1];
    if (hinted) return;
    if (firstTry) score += CONFIG.games.wordFirstTry;
    /* Speed is measured between the round's own events, so a slow network
       costs at most the gap it actually introduced. */
    score += CONFIG.games.wordSpeedOk;
  });

  if (solved === words.length && allFirstTry) score += CONFIG.games.wordPerfectBonus;
  return { score, correct: solved, answered: words.length, won: solved > 0 };
}

function scoreDeck(events: Array<{ correct: number | null }>, pairs: number): Scored {
  const moves = events.filter((e) => e.correct !== null).length;
  const matched = events.filter((e) => e.correct === 1).length;
  const base = matched * CONFIG.games.memoryPerPair;

  const reasonable = CONFIG.games.memoryReasonableMoves;
  const span = Math.max(1, reasonable - pairs);
  const efficiency = Math.min(1, Math.max(0, (reasonable - moves) / span));
  const flawless = moves === pairs && matched === pairs ? CONFIG.games.memoryFlawlessBonus : 0;

  return {
    score: base + Math.round(efficiency * 12) + flawless,
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
 * it. Three things bound it — the per-run gap cap, the daily points cap (§2.4),
 * and the fact that the flight pays two points a gap. A client that lies about
 * gaps gets at most `maxFlightGaps × flightPerGap` before the daily cap catches
 * it, and the case is visible in the ledger as an implausible run.
 */
function scoreFlight(report: Record<string, unknown>): Scored {
  const cleared = Math.max(0, Math.min(Math.floor(Number(report.cleared) || 0), CONFIG.games.maxFlightGaps));
  const target = CONFIG.games.flightTarget;
  return {
    score: cleared * CONFIG.games.flightPerGap,
    correct: Math.min(cleared, target),
    answered: target,
    won: cleared >= target,
  };
}

/**
 * The streak, the lapse and the freeze — the one place they are decided.
 *
 * Ported from `src/site/auth/player.ts`, with one deliberate difference: a lapse
 * resets the **streak** and does not touch the balance. The old app wiped points
 * on a missed day (its own hot-deal terms in the imported data say so), and the
 * new spec replaces that with expiry: §2.1 makes the ledger the auditable source
 * of truth and §2.3 gives points a twelve-month life. Deleting a year of
 * earnings because somebody had a bad week is not one of the reasons §2.1 lists
 * for a negative entry.
 *
 * `CONFIG` has no switch for this on purpose — bringing the wipe back is a
 * product decision that should arrive as an `adjustment` entry with a reason,
 * which is exactly what `ledger.reverse` and `earn(..., 'adjustment')` are for.
 */
function applyStreak(db: Db, userId: string, scored: Scored, at: Iso): { streak: number; freezes: number } {
  const state = playerState(db, userId, at);
  const today = dayOf(at);
  const yesterday = dayOf(new Date(new Date(at).getTime() - 86_400_000).toISOString());

  const sameDay = state.last_played === today;
  const continued = state.last_played === yesterday || state.last_played === null;
  const lapsed = !sameDay && !continued;

  const held = Math.max(0, state.freezes);
  const frozen = lapsed && held > 0;

  const streak = sameDay ? state.streak : lapsed && !frozen ? 1 : state.streak + 1;

  let freezes = held;
  if (frozen) freezes -= 1;
  if (!sameDay && streak % CONFIG.games.freezeEvery === 0) {
    freezes = Math.min(CONFIG.games.maxFreezes, freezes + 1);
  }

  db.run(
    `UPDATE player_states
        SET streak = $s, longest_streak = MAX(longest_streak, $s), freezes = $f,
            answered = answered + $a, correct = correct + $c, last_played = $d, updated_at = $t
      WHERE user_id = $u`,
    { s: streak, f: freezes, a: scored.answered, c: scored.correct, d: today, t: at, u: userId },
  );
  return { streak, freezes };
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
