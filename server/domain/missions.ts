/**
 * The mission catalogue — rulebook §8: sixty-eight missions in seven bands.
 *
 * Missions are "the surfaced, legible expression of everything above": a to-do
 * list that makes earning visible. This module decides, for one person at one
 * instant, where each of them stands, and pays the ones that are paid by
 * claiming.
 *
 * ## Nothing here keeps a count
 *
 * **Progress is derived on every read** from rows the server already writes for
 * other reasons — finished rounds in `game_sessions`, confirmed visits in
 * `venue_visits`, the ledger, `player_states`, the profile, `referrals`,
 * `issued_vouchers`. That is the house rule applied once more: the balance is a
 * sum, the energy tank is a sum, and a mission's "2 of 3" is a count of rows
 * that exist. A counter kept beside them would be a second record of the same
 * facts, and the one that drifts is always the one nobody reconciles.
 *
 * Three tables are new (`db/schema.sql`, "rulebook §8"), and each holds only
 * what nothing else records: the **claim** (the once-per-period guard, and the
 * ledger entry it paid), the **event** (a round's performance, which the game
 * engine computes and throws away — `domain/missionEvents.ts`), and the
 * **campaign** an operator authors for the seasonal and partner bands. A
 * fourth, `learning_progress`, is the learning band's (`domain/learning.ts`).
 *
 * ## Three kinds of mission
 *
 * 1. **Claimable.** Complete → the player taps Claim → one ledger entry, reason
 *    `mission`, `source_ref` `<id>:<period>`, for `CONFIG.missions.rewards[id]`.
 *    Flat on every plan (§2.2 multiplies game points only). The primary key of
 *    `mission_claims` is (user, mission, period), so a second claim in the same
 *    period cannot insert — two taps racing each other pay once.
 * 2. **Auto-paid mirrors.** Where a mission's reward *is* an automatic bonus the
 *    server already pays — the check-in, the streak milestones, onboarding, the
 *    welcome round, first visit, first scan, a new category, a filled stamp
 *    card, a referral, the friend milestone, the profile, interests, a review,
 *    the birthday and anniversary — the mission is a **window onto that bonus**
 *    and never pays anything of its own. It carries `autoPaid: true` and reads
 *    `claimed` once the ledger shows the bonus was written; `complete` means the
 *    condition holds and the bonus has not (yet) landed; a claim is refused.
 *    Paying these here as well would be the same bonus twice.
 * 3. **Locked.** A campaign kind this build does not know: shown, never
 *    completable.
 * 4. **Not served at all.** A mission nobody can complete *in this build* is
 *    omitted rather than shown locked (`Def.shown`): the venue Pass and
 *    order-ahead (#52–54) do not exist, the learning modules (#66–68) have no
 *    screen in the app, and the first gift card (#51) is served
 *    only to an account whose plan grants gift cards (§9.4). A locked row that
 *    names a feature or a paid tier the app has no way to reach is a dead end in
 *    front of a store reviewer, and the app ships with no purchase path. Their
 *    definitions stay so the rulebook's numbering does; a claim or a read of
 *    one that is not shown is a 404, the same answer as an unknown id.
 *
 * ## Periods
 *
 * Every daily thing in this product turns at **UTC midnight** — the check-in,
 * the featured game, the energy day, the personal-best allowance all slice
 * `at.slice(0, 10)` — and the daily band turns with them, because two resets an
 * hour apart is a bug report nobody can reproduce. The week starts **Monday
 * 00:00 UTC**. `resetsAt` on each band says exactly when, so no client computes
 * its own midnight.
 *
 * ## What counts as playing
 *
 * A round counts when it is **finished and paid** (`state = 'finished' AND
 * life_spent > 0`) — the same test the featured bonus, the first-play bonus and
 * the streak apply. A practice round at zero energy moves none of those and
 * moves no mission either: practice is the round that costs nothing, and
 * "nothing" includes the things it would otherwise unlock.
 */
import { CONFIG } from '../config.ts';
import type { Db } from '../db/db.ts';
import * as checkin from './checkin.ts';
import * as entitlements from './entitlements.ts';
import { DomainError } from './errors.ts';
import * as games from './games.ts';
import * as learning from './learning.ts';
import * as ledger from './ledger.ts';
import { local, now, shiftDay, withinDailyWindow, type Iso } from './time.ts';

/* ══════════════════════════════════════════════════════════ the wire shape ══ */

export type BandKey = 'daily' | 'weekly' | 'ongoing' | 'once' | 'seasonal' | 'partner' | 'learning';
export type MissionStatus = 'locked' | 'open' | 'complete' | 'claimed';

export interface Mission {
  /** Stable: `daily.todays_game`, `learning.pesel`, `seasonal.<campaign id>`. */
  id: string;
  /** The rulebook's number, §8. */
  number: number;
  title: string;
  description: string;
  /** What a claim pays, or what the mirrored bonus pays. `null` when it is not
   *  a number of points ("streak +1", "1 freeze"). */
  reward: number | null;
  /** What to print where the reward goes: "25", "streak +1", "100 / 150 / 250". */
  rewardLabel: string;
  progress: number;
  target: number;
  status: MissionStatus;
  /** Paid by the code that pays the underlying bonus; never claimed here. */
  autoPaid: boolean;
}

export interface Band {
  key: BandKey;
  title: string;
  /** When this band's missions reset, or null for a band that does not. */
  resetsAt: Iso | null;
  missions: Mission[];
}

export interface MissionsView {
  bands: Band[];
  /** How many missions are complete and waiting for the player's tap. */
  unclaimed: number;
}

/** The mission the Missions view's top "Daily" card claims — through the
 *  check-in, which *is* this mission (§8.1 #1). */
export const CHECK_IN_ID = 'daily.check_in';

const BAND_ORDER: readonly BandKey[] = ['daily', 'weekly', 'ongoing', 'once', 'seasonal', 'partner', 'learning'];

/* The band headings the v2 design draws ("Today", "This week", "Ongoing",
   "One-time"); the three it does not draw are named in the same register. */
const BAND_TITLES: Record<BandKey, string> = {
  daily: 'Today',
  weekly: 'This week',
  ongoing: 'Ongoing',
  once: 'One-time',
  seasonal: 'Limited time',
  partner: 'From our partners',
  learning: 'Learn',
};

/* ═══════════════════════════════════════════════════════════════ periods ══ */

const dayOf = (at: Iso): string => at.slice(0, 10);
const startOf = (day: string): Iso => `${day}T00:00:00.000Z`;

/** The Monday that starts the UTC week `day` falls in. */
export function weekStartOf(day: string): string {
  const weekday = (new Date(startOf(day)).getUTCDay() + 6) % 7;
  return shiftDay(day, -weekday);
}

/** The claim key for a mission in a band: the day, the week's Monday, `once`,
 *  or `campaign` (a campaign's id is already in the mission id). */
function periodFor(band: BandKey, at: Iso): string {
  const day = dayOf(at);
  if (band === 'daily') return day;
  if (band === 'weekly') return weekStartOf(day);
  if (band === 'seasonal' || band === 'partner') return 'campaign';
  return 'once';
}

/* ══════════════════════════════════════════════════════ the game "cards" ══ */

/*
 * "Play all 8 games", "a perfect round in all 8", "100% in all three quiz
 * games": the rulebook counts **cards**, and a card is not a game type — the
 * local-knowledge quiz is one card holding two banks (`poland`, `uzbekistan`).
 * So the unit is a slot of `games.DAILY_GAME_POOL`, the featured rotation, which
 * is the one list that already means "the games a player can be shown". Reading
 * it rather than copying it keeps the targets right when the rotation grows (the
 * two §5.7/§5.8 games): `target` is its length, whatever that is.
 */
function cardOf(gameType: string): number {
  return games.DAILY_GAME_POOL.findIndex((slot) => (slot as readonly string[]).includes(gameType));
}

function cardsIn(gameTypes: Iterable<string>): Set<number> {
  const out = new Set<number>();
  for (const gameType of gameTypes) {
    const card = cardOf(gameType);
    if (card >= 0) out.add(card);
  }
  return out;
}

/** The quiz cards: slots every game of which is a question-bank quiz. */
function quizCards(): number[] {
  return games.DAILY_GAME_POOL.map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => slot.length > 0 && slot.every((gameType) => games.QUIZZES.has(gameType)))
    .map(({ index }) => index);
}

/* ═════════════════════════════════════════════════════════════ the facts ══ */

interface LedgerMark {
  reason: string;
  source_kind: string | null;
  source_ref: string | null;
  created_at: string;
}

interface Round {
  id: string;
  game_type: string;
  language: string;
  finished_at: string;
}

interface Visit {
  venue_id: string;
  local_day: string;
  local_hour: number;
  created_at: string;
  category: string;
}

/**
 * Everything a mission may ask about one person, read lazily and at most once.
 *
 * Each fact is a promise memoised on first use, so a band that never asks about
 * vouchers never queries them, and two missions asking the same question share
 * one query even when they are evaluated concurrently. The whole object lives
 * for one request.
 */
class Facts {
  readonly day: string;
  readonly dayStart: Iso;
  readonly dayEnd: Iso;
  readonly week: string;
  readonly weekStart: Iso;
  readonly weekEnd: Iso;
  private readonly memo = new Map<string, Promise<unknown>>();

  readonly db: Db;
  readonly userId: string;
  readonly at: Iso;

  /* Plain assignments rather than parameter properties: the server runs under
     Node's type stripping, which refuses syntax that is not erasable. */
  constructor(db: Db, userId: string, at: Iso) {
    this.db = db;
    this.userId = userId;
    this.at = at;
    this.day = dayOf(at);
    this.dayStart = startOf(this.day);
    this.dayEnd = startOf(shiftDay(this.day, 1));
    this.week = weekStartOf(this.day);
    this.weekStart = startOf(this.week);
    this.weekEnd = startOf(shiftDay(this.week, 7));
  }

  private once<T>(key: string, load: () => Promise<T>): Promise<T> {
    let hit = this.memo.get(key) as Promise<T> | undefined;
    if (!hit) {
      hit = load();
      this.memo.set(key, hit);
    }
    return hit;
  }

  /* ── play ── */

  /** Paid, finished rounds this week (which contains today). */
  weekRounds(): Promise<Round[]> {
    return this.once('weekRounds', () =>
      this.db.all<Round>(
        `SELECT id, game_type, language, finished_at FROM game_sessions
          WHERE user_id = $u AND state = 'finished' AND life_spent > 0
            AND finished_at >= $f AND finished_at < $t
          ORDER BY finished_at`,
        { u: this.userId, f: this.weekStart, t: this.weekEnd },
      ),
    );
  }

  async todayRounds(): Promise<Round[]> {
    return (await this.weekRounds()).filter((round) => round.finished_at.slice(0, 10) === this.day);
  }

  /**
   * Rounds that **took energy** today — started today with `life_spent > 0`.
   *
   * Counted by when the round started rather than when it finished, because
   * the tank is charged when a round starts (rulebook §3) and "Empty the tank"
   * is a question about the tank.
   */
  energySpentToday(): Promise<number> {
    return this.once('energySpentToday', async () =>
      (await this.db.get<{ n: number }>(
        `SELECT COUNT(*) AS n FROM game_sessions
          WHERE user_id = $u AND life_spent > 0 AND started_at >= $f AND started_at < $t`,
        { u: this.userId, f: this.dayStart, t: this.dayEnd },
      ))?.n ?? 0,
    );
  }

  /** Every game type this person has ever finished a paid round of. */
  playedTypes(): Promise<string[]> {
    return this.once('playedTypes', async () =>
      (await this.db.all<{ game_type: string }>(
        `SELECT DISTINCT game_type FROM game_sessions
          WHERE user_id = $u AND state = 'finished' AND life_spent > 0`,
        { u: this.userId },
      )).map((row) => row.game_type),
    );
  }

  /** Game types with a perfect round recorded this week (`mission_events`). */
  perfectThisWeek(): Promise<Array<{ subject: string; created_at: string }>> {
    return this.once('perfectThisWeek', () =>
      this.db.all<{ subject: string; created_at: string }>(
        `SELECT subject, created_at FROM mission_events
          WHERE user_id = $u AND kind = 'round' AND value >= 100
            AND created_at >= $f AND created_at < $t`,
        { u: this.userId, f: this.weekStart, t: this.weekEnd },
      ),
    );
  }

  /**
   * Game types with a perfect round **ever** — from `player_game_bests`, which
   * holds the best performance per game and predates `mission_events`, so an
   * account that was flawless at Guess the Flag last year keeps the credit.
   */
  perfectEver(): Promise<string[]> {
    return this.once('perfectEver', async () =>
      (await this.db.all<{ game_type: string }>(
        `SELECT game_type FROM player_game_bests WHERE user_id = $u AND best >= 100`,
        { u: this.userId },
      )).map((row) => row.game_type),
    );
  }

  /** Whether a personal-best bonus was paid today — `bonus_day` is exactly that. */
  bestBeatenToday(): Promise<boolean> {
    return this.once('bestBeatenToday', async () =>
      (await this.db.get(
        `SELECT 1 AS one FROM player_game_bests WHERE user_id = $u AND bonus_day = $d LIMIT 1`,
        { u: this.userId, d: this.day },
      )) !== undefined,
    );
  }

  /**
   * The longest run of consecutive correct answers inside one round today.
   *
   * Read off `game_events.correct`, which the server marks as each answer
   * arrives. "In a row" is within a round: the last answer of one round and the
   * first of the next are not a streak of anything.
   *
   * **Paid rounds only** (`life_spent > 0`), like every other play fact here: a
   * practice round costs nothing and moves no mission. This one used to join
   * every session, so a run of practice rounds on an empty tank completed it.
   */
  longestRunToday(): Promise<number> {
    return this.once('longestRunToday', async () => {
      const rows = await this.db.all<{ session_id: string; correct: number }>(
        `SELECT e.session_id, e.correct FROM game_events e
           JOIN game_sessions s ON s.id = e.session_id
          WHERE s.user_id = $u AND s.life_spent > 0 AND e.correct IS NOT NULL
            AND e.created_at >= $f AND e.created_at < $t
          ORDER BY e.session_id, e.seq`,
        { u: this.userId, f: this.dayStart, t: this.dayEnd },
      );
      let best = 0;
      let run = 0;
      let session = '';
      for (const row of rows) {
        if (row.session_id !== session) {
          session = row.session_id;
          run = 0;
        }
        run = row.correct ? run + 1 : 0;
        if (run > best) best = run;
      }
      return best;
    });
  }

  player(): Promise<{ streak: number; longest_streak: number; last_played: string | null }> {
    return this.once('player', async () =>
      (await this.db.get<{ streak: number; longest_streak: number; last_played: string | null }>(
        `SELECT streak, longest_streak, last_played FROM player_states WHERE user_id = $u`,
        { u: this.userId },
      )) ?? { streak: 0, longest_streak: 0, last_played: null },
    );
  }

  /** The play streak as it stands: alive only if the last round was today or
   *  yesterday, which is `games.applyStreak`'s own reading of it. */
  async liveStreak(): Promise<number> {
    const player = await this.player();
    return player.last_played === this.day || player.last_played === shiftDay(this.day, -1)
      ? player.streak
      : 0;
  }

  energyMax(): Promise<number> {
    return this.once('energyMax', async () => (await games.energyFor(this.db, this.userId, this.at)).max);
  }

  /* ── visits ── */

  /** Confirmed, qualifying visits this week, with each venue's category. */
  weekVisits(): Promise<Visit[]> {
    return this.once('weekVisits', () =>
      this.db.all<Visit>(
        `SELECT v.venue_id, v.local_day, v.local_hour, v.created_at, ve.category
           FROM venue_visits v JOIN venues ve ON ve.id = v.venue_id
          WHERE v.user_id = $u AND v.created_at >= $f AND v.created_at < $t`,
        { u: this.userId, f: this.weekStart, t: this.weekEnd },
      ),
    );
  }

  async todayVisits(): Promise<Visit[]> {
    return (await this.weekVisits()).filter((visit) => visit.created_at.slice(0, 10) === this.day);
  }

  /** Lifetime visits per venue, and when the first one was. */
  venueHistory(): Promise<Array<{ venue_id: string; n: number; first_at: string }>> {
    return this.once('venueHistory', () =>
      this.db.all<{ venue_id: string; n: number; first_at: string }>(
        `SELECT venue_id, COUNT(*) AS n, MIN(created_at) AS first_at
           FROM venue_visits WHERE user_id = $u GROUP BY venue_id`,
        { u: this.userId },
      ),
    );
  }

  /* ── the ledger ── */

  /**
   * The rows that say an automatic bonus was paid. One query for every mirror;
   * `check_in` and `game_win` are left out because there is one of each per day
   * and the mirrors that need them ask narrower questions.
   */
  marks(): Promise<LedgerMark[]> {
    return this.once('marks', () =>
      this.db.all<LedgerMark>(
        `SELECT reason, source_kind, source_ref, created_at FROM points_ledger
          WHERE user_id = $u AND status = 'committed'
            AND reason IN ('welcome_bonus', 'profile_bonus', 'streak_milestone', 'venue_bonus',
                           'stamp_complete', 'referral', 'review', 'occasion')`,
        { u: this.userId },
      ),
    );
  }

  async marked(test: (mark: LedgerMark) => boolean): Promise<LedgerMark[]> {
    return (await this.marks()).filter(test);
  }

  /**
   * Points earned since `from` (all time when null), **not counting missions**.
   *
   * Missions are left out so no mission is ever completed by claiming another
   * one — "Point hunter" and "Collector" measure what the player did, and a
   * list whose rewards feed its own thresholds would make the order of taps
   * matter.
   */
  earned(from: Iso | null): Promise<number> {
    return this.once(`earned:${from ?? 'ever'}`, async () =>
      (await this.db.get<{ total: number | null }>(
        from === null
          ? `SELECT SUM(delta) AS total FROM points_ledger
              WHERE user_id = $u AND status = 'committed' AND delta > 0 AND reason <> 'mission'`
          : `SELECT SUM(delta) AS total FROM points_ledger
              WHERE user_id = $u AND status = 'committed' AND delta > 0 AND reason <> 'mission'
                AND created_at >= $f`,
        from === null ? { u: this.userId } : { u: this.userId, f: from },
      ))?.total ?? 0,
    );
  }

  /** Every day this account has checked in, most recent first. */
  checkInDays(): Promise<string[]> {
    return this.once('checkInDays', async () =>
      (await this.db.all<{ source_ref: string | null }>(
        `SELECT source_ref FROM points_ledger
          WHERE user_id = $u AND reason = 'check_in' AND status = 'committed'
          ORDER BY source_ref DESC`,
        { u: this.userId },
      ))
        .map((row) => row.source_ref ?? '')
        .filter((day) => day !== ''),
    );
  }

  balance(): Promise<number> {
    return this.once('balance', () => ledger.balance(this.db, this.userId));
  }

  /* ── the account ── */

  user(): Promise<Record<string, string | null>> {
    return this.once('user', async () =>
      (await this.db.get<Record<string, string | null>>(
        `SELECT display_avatar, username, occupation, city, email, phone, birth_date,
                onboarded_at, created_at
           FROM users WHERE id = $u`,
        { u: this.userId },
      )) ?? {},
    );
  }

  ent(): Promise<entitlements.Entitlements> {
    return this.once('ent', () => entitlements.entitlementsFor(this.db, { userId: this.userId }, this.at));
  }

  /** One entitlement's value on every active consumer plan, by rank. */
  planValues(key: string): Promise<string[]> {
    return this.once(`planValues:${key}`, async () =>
      (await this.db.all<{ value: string }>(
        `SELECT e.value FROM plan_entitlements e JOIN plans p ON p.id = e.plan_id
          WHERE e.key = $k AND p.audience = 'consumer' AND p.active = 1
          ORDER BY p.rank, p.code`,
        { k: key },
      )).map((row) => row.value),
    );
  }

  /** Referrals this person made that have completed (the friend's first visit). */
  referrals(): Promise<string[]> {
    return this.once('referrals', async () =>
      (await this.db.all<{ id: string }>(
        `SELECT id FROM referrals WHERE referrer_id = $u AND status = 'completed'`,
        { u: this.userId },
      )).map((row) => row.id),
    );
  }

  pushEnabled(): Promise<boolean> {
    return this.once('pushEnabled', async () =>
      (await this.db.get(
        `SELECT 1 AS one FROM push_tokens WHERE user_id = $u AND revoked_at IS NULL LIMIT 1`,
        { u: this.userId },
      )) !== undefined,
    );
  }

  /**
   * Deals opened today that this person had never opened before today.
   *
   * `deal_events` records an `open` with the account when the client reports
   * one (`POST /v1/deals/:id/events`), so "a deal you haven't seen" is a row
   * with no earlier row beside it.
   */
  newDealsOpenedToday(): Promise<number> {
    return this.once('newDealsOpenedToday', async () =>
      (await this.db.get<{ n: number }>(
        `SELECT COUNT(DISTINCT e.deal_id) AS n FROM deal_events e
          WHERE e.user_id = $u AND e.event_type = 'open'
            AND e.created_at >= $f AND e.created_at < $t
            AND NOT EXISTS (SELECT 1 FROM deal_events p
                             WHERE p.user_id = $u AND p.deal_id = e.deal_id
                               AND p.event_type = 'open' AND p.created_at < $f)`,
        { u: this.userId, f: this.dayStart, t: this.dayEnd },
      ))?.n ?? 0,
    );
  }

  /** Vouchers used at a till, newest first — "redeem" is spending it at the
   *  venue, the visit it exists to drive. */
  redeemedVouchers(): Promise<Array<{ redeemed_at: string }>> {
    return this.once('redeemedVouchers', () =>
      this.db.all<{ redeemed_at: string }>(
        `SELECT redeemed_at FROM issued_vouchers
          WHERE user_id = $u AND status = 'redeemed' AND redeemed_at IS NOT NULL
          ORDER BY redeemed_at DESC`,
        { u: this.userId },
      ),
    );
  }

  topVoucherPct(): Promise<number> {
    return this.once('topVoucherPct', async () =>
      (await this.db.get<{ pct: number | null }>(
        `SELECT MAX(discount_pct) AS pct FROM issued_vouchers WHERE user_id = $u`,
        { u: this.userId },
      ))?.pct ?? 0,
    );
  }

  hasGiftCard(): Promise<boolean> {
    return this.once('hasGiftCard', async () =>
      (await this.db.get(`SELECT 1 AS one FROM gift_cards WHERE user_id = $u LIMIT 1`, {
        u: this.userId,
      })) !== undefined,
    );
  }

  learning(): Promise<Map<string, learning.Progress>> {
    return this.once('learning', () => learning.progressFor(this.db, this.userId));
  }

  /** This period's claims: `<mission id>|<period>`. */
  claims(): Promise<Set<string>> {
    return this.once('claims', async () =>
      new Set(
        (await this.db.all<{ mission_id: string; period: string }>(
          `SELECT mission_id, period FROM mission_claims
            WHERE user_id = $u AND period IN ($d, $w, 'once', 'campaign')`,
          { u: this.userId, d: this.day, w: this.week },
        )).map((row) => `${row.mission_id}|${row.period}`),
      ),
    );
  }
}

/* ═════════════════════════════════════════════════════════ the catalogue ══ */

interface Eval {
  progress: number;
  target: number;
  done: boolean;
  /** Auto-paid missions: whether the ledger shows the bonus was written. */
  paid?: boolean;
  locked?: boolean;
  /** Overrides `CONFIG.missions.rewards[id]` — a mirrored bonus's own figure. */
  reward?: number | null;
  rewardLabel?: string;
  /** A partner mission's venue, recorded on the ledger entry. */
  venueId?: string | null;
}

interface Def {
  id: string;
  number: number;
  band: BandKey;
  title: string;
  description: string;
  autoPaid?: boolean;
  /** Whether this person is served the mission at all. Absent means always.
   *  See rule 4 in the header: omitted, not locked. */
  shown?: (f: Facts) => Promise<boolean>;
  evaluate: (f: Facts) => Promise<Eval>;
}

/** A feature this build does not have yet — never served. */
const notInThisBuild = async (): Promise<boolean> => false;

/** Whether `def` is served to the person `f` describes. */
const isShown = async (f: Facts, def: Def): Promise<boolean> =>
  !zeroReward(def) && (def.shown ? await def.shown(f) : true);

/**
 * A claimable mission tuned to pay **nothing** is not served (2026-10-08
 * rebalance). A "+0" row asks for effort and pays for none, and it is the
 * tunable — not a code change — that retires it: set `CONFIG.missions.rewards`
 * to 0 and the row, its claim and its read all become the same 404 as an
 * unserved mission (rule 4 above). Auto-paid mirrors carry their own figure
 * and campaigns theirs, so only a static claimable mission with a configured
 * 0 is affected.
 */
function zeroReward(def: Def): boolean {
  return def.autoPaid !== true && CONFIG.missions.rewards[def.id] === 0;
}

/** "At least `target` of something", clamped for display. */
const count = (n: number, target: number): Eval => ({ progress: n, target, done: n >= target });
const flag = (done: boolean): Eval => ({ progress: done ? 1 : 0, target: 1, done });

/** The run of consecutive days ending `today` or, failing that, yesterday. */
function runEndingAt(days: string[], today: string): number {
  const first = days[0];
  if (first !== today && first !== shiftDay(today, -1)) return 0;
  let run = 0;
  let cursor = first;
  for (const day of days) {
    if (day !== cursor) break;
    run += 1;
    cursor = shiftDay(cursor, -1);
  }
  return run;
}

/** The best run of consecutive days anywhere in a most-recent-first list. */
function longestRun(days: string[]): number {
  let best = 0;
  let run = 0;
  let expected: string | null = null;
  for (const day of days) {
    run = expected === null || day === expected ? run + 1 : 1;
    if (run > best) best = run;
    expected = shiftDay(day, -1);
  }
  return best;
}

/** The per-plan one-off a mirror shows — `stamp_points` and friends, as the
 *  code that pays them reads it. */
const planFigure = async (f: Facts, key: string, fallback: number): Promise<number> =>
  entitlements.entNumber(await f.ent(), key, fallback);

/**
 * A streak milestone mirror (§7.2 / #26–28).
 *
 * The milestones are paid today by the **check-in** streak (`checkin.checkIn`,
 * `source_ref: streak:<n>`), once ever each. §7.2 files them under the play
 * streak; the progress shown is the better of the two runs, so the bar is right
 * whichever of them the payment follows, and `claimed` is read off the ledger
 * row itself.
 */
function milestone(id: string, number: number, title: string, days: number): Def {
  return {
    id,
    number,
    band: 'ongoing',
    title,
    description: `Keep a ${days}-day streak`,
    autoPaid: true,
    evaluate: async (f) => {
      const checkIns = await f.checkInDays();
      const best = Math.max(longestRun(checkIns), (await f.player()).longest_streak);
      const paid = (await f.marked((m) => m.source_kind === 'streak' && m.source_ref === `streak:${days}`)).length > 0;
      const worth = CONFIG.earn.streakMilestones[days] ?? 0;
      return { ...count(best, days), paid, reward: worth };
    },
  };
}

/* A per-plan one-off used to print every consumer plan's figure ("100 / 150 /
   250"). With no way to buy a plan in this build that quoted three rewards of
   which a free player can reach one, so these missions print the viewer's own
   figure — `reward`, from `planFigure` — like every other row. */

const STATIC: readonly Def[] = [
  /* ── §8.1 daily ── */
  {
    id: CHECK_IN_ID,
    number: 1,
    band: 'daily',
    title: 'Daily check-in',
    description: 'Open the app and check in',
    autoPaid: true,
    evaluate: async (f) => {
      const days = await f.checkInDays();
      const taken = days[0] === f.day;
      /* What today pays: the rung of the cycle this day is. On a taken day the
         run ends today and today is its last rung; otherwise the run ends
         yesterday and today would be the next one. */
      const rung = taken ? Math.max(1, runEndingAt(days, f.day)) : runEndingAt(days, f.day) + 1;
      /* Opening the app is the trigger, and the player has — so it is complete
         until taken. It is claimed through `POST /v1/daily/check-in` (or this
         module's `claim`, which calls the same function). */
      return { progress: 1, target: 1, done: true, paid: taken, reward: checkin.dayValue(rung) };
    },
  },
  {
    id: 'daily.todays_game',
    number: 2,
    band: 'daily',
    title: "Today's game",
    description: 'Play the featured game',
    /* The same question the ×1.5 answers — a paid round of an eligible featured
       game, finished today — asked of the same function, so the mission and the
       multiplier cannot disagree about whether today's game was played. */
    evaluate: async (f) => flag(await games.featuredTakenToday(f.db, f.userId, f.at)),
  },
  {
    id: 'daily.warm_up',
    number: 3,
    band: 'daily',
    title: 'Warm up',
    description: 'Play any one round',
    evaluate: async (f) => count((await f.todayRounds()).length, 1),
  },
  {
    id: 'daily.empty_the_tank',
    number: 4,
    band: 'daily',
    title: 'Empty the tank',
    description: 'Spend all your energy',
    /* A full tank's worth of rounds today. Not "the tank reads zero now", which
       a refill undoes an hour later: a mission that completes and then
       un-completes before it is claimed is a mission that lied. */
    evaluate: async (f) => count(await f.energySpentToday(), Math.max(1, await f.energyMax())),
  },
  {
    id: 'daily.record_a_visit',
    number: 5,
    band: 'daily',
    title: 'Record a visit',
    description: 'One confirmed scan at a partner venue',
    evaluate: async (f) => count((await f.todayVisits()).length, 1),
  },
  {
    id: 'daily.flawless',
    number: 6,
    band: 'daily',
    title: 'Flawless',
    description: 'Score 100% in any game',
    evaluate: async (f) =>
      flag((await f.perfectThisWeek()).some((event) => event.created_at.slice(0, 10) === f.day)),
  },
  {
    id: 'daily.mix_it_up',
    number: 7,
    band: 'daily',
    title: 'Mix it up',
    description: 'Play two different games',
    evaluate: async (f) =>
      count(cardsIn((await f.todayRounds()).map((round) => round.game_type)).size, CONFIG.missions.mixItUpGames),
  },
  {
    id: 'daily.window_shopping',
    number: 8,
    band: 'daily',
    title: 'Window shopping',
    description: "Open a deal you haven't seen",
    evaluate: async (f) => count(await f.newDealsOpenedToday(), 1),
  },
  {
    id: 'daily.new_record',
    number: 9,
    band: 'daily',
    title: 'New record',
    description: 'Beat a personal best',
    evaluate: async (f) => flag(await f.bestBeatenToday()),
  },
  {
    id: 'daily.early_bird',
    number: 10,
    band: 'daily',
    title: 'Early bird',
    description: `Scan before ${String(CONFIG.missions.earlyBirdBeforeHour).padStart(2, '0')}:00`,
    /* The venue's own clock, which `venue_visits.local_hour` already is. */
    evaluate: async (f) =>
      flag((await f.todayVisits()).some((visit) => visit.local_hour < CONFIG.missions.earlyBirdBeforeHour)),
  },
  {
    id: 'daily.night_owl',
    number: 11,
    band: 'daily',
    title: 'Night owl',
    description: `Play a round after ${String(CONFIG.missions.nightOwlFromHour).padStart(2, '0')}:00`,
    evaluate: async (f) =>
      flag(
        (await f.todayRounds()).some(
          (round) => local(round.finished_at, CONFIG.missions.clockTimezone).hour >= CONFIG.missions.nightOwlFromHour,
        ),
      ),
  },
  {
    id: 'daily.on_a_roll',
    number: 12,
    band: 'daily',
    title: 'On a roll',
    description: `${CONFIG.missions.onARollInARow} correct answers in a row`,
    evaluate: async (f) => count(await f.longestRunToday(), CONFIG.missions.onARollInARow),
  },

  /* ── §8.2 weekly ── */
  {
    id: 'weekly.five_day_player',
    number: 13,
    band: 'weekly',
    title: 'Five-day player',
    description: `Play on ${CONFIG.missions.fiveDayPlayerDays} different days`,
    evaluate: async (f) =>
      count(
        new Set((await f.weekRounds()).map((round) => round.finished_at.slice(0, 10))).size,
        CONFIG.missions.fiveDayPlayerDays,
      ),
  },
  {
    id: 'weekly.three_venues',
    number: 14,
    band: 'weekly',
    title: 'Three venues',
    description: `Visit ${CONFIG.missions.threeVenuesVenues} different venues`,
    evaluate: async (f) =>
      count(new Set((await f.weekVisits()).map((visit) => visit.venue_id)).size, CONFIG.missions.threeVenuesVenues),
  },
  {
    id: 'weekly.full_deck',
    number: 15,
    band: 'weekly',
    title: 'Full deck',
    description: 'Play every game this week',
    evaluate: async (f) =>
      count(cardsIn((await f.weekRounds()).map((round) => round.game_type)).size, games.DAILY_GAME_POOL.length),
  },
  {
    id: 'weekly.point_hunter',
    number: 16,
    band: 'weekly',
    title: 'Point hunter',
    description: `Earn ${CONFIG.missions.pointHunterPoints} points this week`,
    evaluate: async (f) => count(await f.earned(f.weekStart), CONFIG.missions.pointHunterPoints),
  },
  {
    id: 'weekly.regular',
    number: 17,
    band: 'weekly',
    title: 'Regular',
    description: `${CONFIG.missions.regularScans} confirmed scans`,
    evaluate: async (f) => count((await f.weekVisits()).length, CONFIG.missions.regularScans),
  },
  {
    id: 'weekly.somewhere_new',
    number: 18,
    band: 'weekly',
    title: 'Somewhere new',
    description: 'Visit a venue for the first time',
    evaluate: async (f) =>
      flag((await f.venueHistory()).some((venue) => venue.first_at >= f.weekStart && venue.first_at < f.weekEnd)),
  },
  {
    id: 'weekly.ten_rounds',
    number: 19,
    band: 'weekly',
    title: 'Ten rounds',
    description: `Complete ${CONFIG.missions.tenRoundsRounds} game rounds`,
    evaluate: async (f) => count((await f.weekRounds()).length, CONFIG.missions.tenRoundsRounds),
  },
  {
    id: 'weekly.unbroken',
    number: 20,
    band: 'weekly',
    title: 'Unbroken',
    description: 'Keep your streak all week',
    /* Seven days of the week, each with a paid round in it. A day a freeze
       absorbed kept the *streak* but is not a day played, and this mission is
       the week's reward for playing — so it can only complete on the Sunday. */
    evaluate: async (f) =>
      count(new Set((await f.weekRounds()).map((round) => round.finished_at.slice(0, 10))).size, 7),
  },
  {
    id: 'weekly.cash_it_in',
    number: 21,
    band: 'weekly',
    title: 'Cash it in',
    description: 'Use a voucher at a venue',
    evaluate: async (f) =>
      flag((await f.redeemedVouchers()).some((v) => v.redeemed_at >= f.weekStart && v.redeemed_at < f.weekEnd)),
  },
  {
    id: 'weekly.weekend_warrior',
    number: 22,
    band: 'weekly',
    title: 'Weekend warrior',
    description: 'Scan on both Saturday and Sunday',
    /* The venue's own calendar day, so a Saturday-night visit is Saturday's. */
    evaluate: async (f) => {
      const weekend = new Set<number>();
      for (const visit of await f.weekVisits()) {
        const weekday = new Date(startOf(visit.local_day)).getUTCDay();
        if (weekday === 6 || weekday === 0) weekend.add(weekday);
      }
      return count(weekend.size, 2);
    },
  },
  {
    id: 'weekly.explorer',
    number: 23,
    band: 'weekly',
    title: 'Explorer',
    description: `Visit ${CONFIG.missions.explorerCategories} different categories`,
    evaluate: async (f) =>
      count(new Set((await f.weekVisits()).map((visit) => visit.category)).size, CONFIG.missions.explorerCategories),
  },
  {
    id: 'weekly.quiz_master',
    number: 24,
    band: 'weekly',
    title: 'Quiz master',
    description: 'Score 100% in every quiz game',
    evaluate: async (f) => {
      const quizzes = quizCards();
      const perfect = cardsIn((await f.perfectThisWeek()).map((event) => event.subject));
      return count(quizzes.filter((card) => perfect.has(card)).length, Math.max(1, quizzes.length));
    },
  },

  /* ── §8.3 ongoing ── */
  {
    id: 'ongoing.keep_your_streak',
    number: 25,
    band: 'ongoing',
    title: 'Keep your streak',
    description: 'Play a round every day',
    autoPaid: true,
    /* Its "reward" is the streak itself, moved by `games.applyStreak` on the
       day's first paid round — so it reads claimed for the rest of that day. */
    evaluate: async (f) => {
      const played = (await f.player()).last_played === f.day;
      return { ...flag(played), paid: played, reward: null, rewardLabel: 'streak +1' };
    },
  },
  milestone('ongoing.week_one', 26, 'Week one', 7),
  milestone('ongoing.month_strong', 27, 'Month strong', 30),
  milestone('ongoing.centurion', 28, 'Centurion', 100),
  {
    id: 'ongoing.earn_a_freeze',
    number: 29,
    band: 'ongoing',
    title: 'Earn a freeze',
    description: `Every ${CONFIG.games.freezeEvery} days of streak`,
    autoPaid: true,
    /* `games.applyStreak` grants one on every multiple of `freezeEvery`. The
       bar counts towards the next; it reads claimed on the day one lands. */
    evaluate: async (f) => {
      const streak = await f.liveStreak();
      const every = Math.max(1, CONFIG.games.freezeEvery);
      const landedToday = streak > 0 && streak % every === 0 && (await f.player()).last_played === f.day;
      return {
        progress: landedToday ? every : streak % every,
        target: every,
        done: landedToday,
        paid: landedToday,
        reward: null,
        rewardLabel: '1 freeze',
      };
    },
  },
  {
    id: 'ongoing.bring_a_friend',
    number: 30,
    band: 'ongoing',
    title: 'Bring a friend',
    description: "A friend's first confirmed visit",
    autoPaid: true,
    evaluate: async (f) => {
      const mine = new Set(await f.referrals());
      const paid =
        (await f.marked((m) => m.source_kind === 'referral' && mine.has(m.source_ref ?? ''))).length > 0;
      return { ...count(mine.size, 1), paid, reward: CONFIG.earn.referrerFirstVisit };
    },
  },
  {
    id: 'ongoing.friend_milestone',
    number: 31,
    band: 'ongoing',
    title: 'Friend milestone',
    description: `${CONFIG.earn.friendMilestoneAt} completed referrals`,
    autoPaid: true,
    evaluate: async (f) => ({
      ...count((await f.referrals()).length, CONFIG.earn.friendMilestoneAt),
      paid: (await f.marked((m) => m.source_kind === 'friend_milestone')).length > 0,
      reward: CONFIG.earn.friendMilestone,
    }),
  },
  {
    id: 'ongoing.fill_a_stamp_card',
    number: 32,
    band: 'ongoing',
    title: 'Fill a stamp card',
    description: 'Complete a loyalty card',
    autoPaid: true,
    evaluate: async (f) => {
      const paid = (await f.marked((m) => m.reason === 'stamp_complete')).length > 0;
      return {
        ...flag(paid),
        paid,
        reward: await planFigure(f, 'stamp_points', CONFIG.earn.stampCardComplete),
      };
    },
  },
  {
    id: 'ongoing.new_category',
    number: 33,
    band: 'ongoing',
    title: 'New category',
    description: 'Your first venue in a category',
    autoPaid: true,
    evaluate: async (f) => {
      const paid = (await f.marked((m) => m.source_kind === 'new_category')).length > 0;
      return {
        ...flag(paid),
        paid,
        reward: await planFigure(f, 'new_category_points', CONFIG.earn.newCategory),
      };
    },
  },
  {
    id: 'ongoing.city_explorer',
    number: 34,
    band: 'ongoing',
    title: 'City explorer',
    description: `Visit ${CONFIG.missions.cityExplorerVenues} different venues`,
    evaluate: async (f) => count((await f.venueHistory()).length, CONFIG.missions.cityExplorerVenues),
  },
  {
    id: 'ongoing.local_legend',
    number: 35,
    band: 'ongoing',
    title: 'Local legend',
    description: `${CONFIG.missions.localLegendVisits} visits to one venue`,
    evaluate: async (f) =>
      count(Math.max(0, ...(await f.venueHistory()).map((venue) => venue.n)), CONFIG.missions.localLegendVisits),
  },
  {
    id: 'ongoing.game_master',
    number: 36,
    band: 'ongoing',
    title: 'Game master',
    description: 'A perfect round in every game',
    evaluate: async (f) => count(cardsIn(await f.perfectEver()).size, games.DAILY_GAME_POOL.length),
  },
  {
    id: 'ongoing.collector',
    number: 37,
    band: 'ongoing',
    title: 'Collector',
    description: `Earn ${CONFIG.missions.collectorPoints.toLocaleString('en')} points in total`,
    evaluate: async (f) => count(await f.earned(null), CONFIG.missions.collectorPoints),
  },
  {
    id: 'ongoing.high_roller',
    number: 38,
    band: 'ongoing',
    title: 'High roller',
    description: `Earn ${CONFIG.missions.highRollerPoints.toLocaleString('en')} points in total`,
    evaluate: async (f) => count(await f.earned(null), CONFIG.missions.highRollerPoints),
  },
  {
    id: 'ongoing.tier_climber',
    number: 39,
    band: 'ongoing',
    title: 'Tier climber',
    description: 'Reach the 15% voucher tier',
    /* Reached by holding enough for the rung, or by having bought one: the
       balance falls when the voucher is bought, and the mission must not
       un-complete at the exact moment the player did what it asked. */
    evaluate: async (f) => {
      const rung = CONFIG.vouchers.defaultTiers.find((tier) => tier.pct === 15)
        ?? CONFIG.vouchers.defaultTiers[CONFIG.vouchers.defaultTiers.length - 1];
      const held = await f.balance();
      const bought = (await f.topVoucherPct()) >= rung.pct;
      return { progress: bought ? rung.points : held, target: rung.points, done: bought || held >= rung.points };
    },
  },

  /* ── §8.4 one-time ── */
  {
    id: 'once.finish_setup',
    number: 40,
    band: 'once',
    title: 'Finish setup',
    description: 'Complete onboarding',
    autoPaid: true,
    evaluate: async (f) => ({
      ...flag(Boolean((await f.user()).onboarded_at)),
      paid: (await f.marked((m) => m.source_kind === 'onboarding')).length > 0,
      reward: CONFIG.earn.onboarding,
    }),
  },
  {
    id: 'once.first_game',
    number: 41,
    band: 'once',
    title: 'Your first game',
    description: 'Finish your first round',
    autoPaid: true,
    /* The welcome round (§7.3) — paid by `games.finish` as the round itself,
       10 a correct answer, so the round existing *is* the payment. */
    evaluate: async (f) => {
      const played = (await f.playedTypes()).length > 0;
      return {
        ...flag(played),
        paid: played,
        reward: CONFIG.earn.welcomeRoundPerCorrect * 5,
        rewardLabel: `${CONFIG.earn.welcomeRoundPerCorrect} × 5`,
      };
    },
  },
  {
    id: 'once.complete_profile',
    number: 42,
    band: 'once',
    title: 'Complete your profile',
    description: 'Fill in all seven fields',
    autoPaid: true,
    /* The seven `accounts.isProfileComplete` requires, counted for the bar. */
    evaluate: async (f) => {
      const user = await f.user();
      const fields = ['display_avatar', 'username', 'occupation', 'city', 'email', 'phone', 'birth_date'];
      return {
        ...count(fields.filter((field) => Boolean(user[field])).length, fields.length),
        paid: (await f.marked((m) => m.source_kind === 'profile')).length > 0,
        reward: CONFIG.earn.profileComplete,
      };
    },
  },
  {
    id: 'once.pick_interests',
    number: 43,
    band: 'once',
    title: 'Pick your interests',
    description: 'Choose the categories you like',
    autoPaid: true,
    /* Nothing stores a person's chosen categories yet, so the only evidence is
       the bonus itself (`CONFIG.earn.categoriesPicked`) once something pays it;
       the kinds accepted are the names that payment would reasonably use. */
    evaluate: async (f) => {
      const paid =
        (await f.marked((m) => ['categories_picked', 'categories', 'interests'].includes(m.source_kind ?? '')))
          .length > 0;
      return { ...flag(paid), paid, reward: CONFIG.earn.categoriesPicked };
    },
  },
  {
    id: 'once.first_scan',
    number: 44,
    band: 'once',
    title: 'Your very first scan',
    description: 'Your first confirmed scan ever',
    autoPaid: true,
    evaluate: async (f) => ({
      ...flag((await f.venueHistory()).length > 0),
      paid: (await f.marked((m) => ['first_scan', 'first_scan_ever'].includes(m.source_kind ?? ''))).length > 0,
      reward: CONFIG.earn.firstScanEver,
    }),
  },
  {
    id: 'once.first_visit',
    number: 45,
    band: 'once',
    title: 'First visit',
    description: 'Your first time at a venue',
    autoPaid: true,
    evaluate: async (f) => ({
      ...flag((await f.venueHistory()).length > 0),
      paid: (await f.marked((m) => m.source_kind === 'first_visit')).length > 0,
      reward: await planFigure(f, 'first_visit_points', CONFIG.earn.firstVisitToVenue),
    }),
  },
  {
    id: 'once.stay_in_the_loop',
    number: 46,
    band: 'once',
    title: 'Stay in the loop',
    description: 'Turn on notifications',
    /* Not in this build: the app has no push plugin and never asks, so the row
       could only sit there unfinishable — and paying points for granting a
       permission is what store review calls pressuring consent. Comes back
       with push, and that payout is worth reconsidering when it does. */
    shown: notInThisBuild,
    /* A registered, unrevoked push token is what "enabled" means to the server:
       it is the thing a push can be delivered to. */
    evaluate: async (f) => flag(await f.pushEnabled()),
  },
  {
    id: 'once.show_your_face',
    number: 47,
    band: 'once',
    title: 'Show your face',
    description: 'Add a profile photo',
    evaluate: async (f) => flag(Boolean((await f.user()).display_avatar)),
  },
  {
    id: 'once.first_review',
    number: 48,
    band: 'once',
    title: 'First review',
    description: 'Review a venue after a visit',
    /* Not in this build: there is no review screen in the app and no review
       route to post one to. */
    shown: notInThisBuild,
    autoPaid: true,
    evaluate: async (f) => {
      const paid = (await f.marked((m) => m.reason === 'review')).length > 0;
      return { ...flag(paid), paid, reward: CONFIG.earn.reviewAfterVisit };
    },
  },
  {
    id: 'once.try_everything',
    number: 49,
    band: 'once',
    title: 'Try everything',
    description: 'Play every game once',
    evaluate: async (f) => count(cardsIn(await f.playedTypes()).size, games.DAILY_GAME_POOL.length),
  },
  {
    id: 'once.first_voucher',
    number: 50,
    band: 'once',
    title: 'First voucher',
    description: 'Use your first voucher at a venue',
    evaluate: async (f) => count((await f.redeemedVouchers()).length, 1),
  },
  {
    id: 'once.first_gift_card',
    number: 51,
    band: 'once',
    title: 'First gift card',
    description: 'Claim a gift card',
    /* Served only to an account that may buy a gift card. §9.4 makes them a
       Pro and Premium perk (reverted to that 2026-10-04), and the console's
       "Budget and rules" can widen it; `entitlementsFor` answers
       `gift_card_priority` from that policy, so this follows it. A mission
       nobody on the plan can complete is left out, not sent locked. */
    shown: async (f) => entitlements.entBool(await f.ent(), 'gift_card_priority'),
    evaluate: async (f) => flag(await f.hasGiftCard()),
  },
  {
    id: 'once.join_a_club',
    number: 52,
    band: 'once',
    title: 'Join a club',
    description: 'Buy your first venue Pass',
    /* No Pass exists in the product yet. Not served until one does. */
    shown: notInThisBuild,
    evaluate: async () => flag(false),
  },
  {
    id: 'once.use_your_pass',
    number: 53,
    band: 'once',
    title: 'Use your Pass',
    description: 'Redeem a venue Pass',
    shown: notInThisBuild,
    evaluate: async () => flag(false),
  },
  {
    id: 'once.first_order',
    number: 54,
    band: 'once',
    title: 'First order',
    description: 'Place your first order-ahead',
    shown: notInThisBuild,
    evaluate: async () => flag(false),
  },
  {
    id: 'once.birthday',
    number: 55,
    band: 'once',
    title: 'Birthday',
    description: 'Add your birthday for a gift once a year',
    autoPaid: true,
    /* Once a year, so "claimed" means *this* year's was paid. Complete on the
       day itself until the occasion job pays it. */
    evaluate: async (f) => {
      const year = f.day.slice(0, 4);
      const paid =
        (await f.marked(
          (m) =>
            m.source_ref === `birthday:${year}` || (m.source_kind === 'birthday' && m.created_at.startsWith(year)),
        )).length > 0;
      const born = (await f.user()).birth_date ?? '';
      const today = born !== '' && born.slice(5, 10) === f.day.slice(5, 10);
      return { ...flag(paid || today), paid, reward: CONFIG.earn.birthday };
    },
  },
  {
    id: 'once.anniversary',
    number: 56,
    band: 'once',
    title: 'Anniversary',
    description: 'One year with Paylez',
    autoPaid: true,
    evaluate: async (f) => {
      const year = f.day.slice(0, 4);
      const paid =
        (await f.marked(
          (m) =>
            m.source_ref === `anniversary:${year}` ||
            (m.source_kind === 'anniversary' && m.created_at.startsWith(year)),
        )).length > 0;
      const joined = (await f.user()).created_at ?? f.at;
      const days = Math.floor((Date.parse(f.at) - Date.parse(joined)) / 86_400_000);
      return { progress: Math.min(365, Math.max(0, days)), target: 365, done: paid || days >= 365, paid, reward: CONFIG.earn.anniversary };
    },
  },
];

/* ── §8.7 learning ── */
const LEARNING: readonly Def[] = learning.MODULES.map((module) => ({
  id: `learning.${module.id}`,
  number: module.number,
  band: 'learning' as const,
  title: module.title,
  description: `Complete the module (${module.questions.length} questions)`,
  /* Not in this build (#66–68, removed from the app 2026-10-08): the app has no
     screen to take a module in, so the row could only sit there unfinishable.
     The modules, their grading and their routes stay; with the mission hidden,
     a claim of it, and a read of its module, is a 404 like any unserved one. */
  shown: notInThisBuild,
  evaluate: async (f: Facts): Promise<Eval> => {
    const progress = (await f.learning()).get(module.id);
    return {
      progress: progress?.bestCorrect ?? 0,
      target: module.questions.length,
      done: Boolean(progress?.completedAt),
    };
  },
}));

/* ═════════════════════════════════════ §8.5 / §8.6 operator campaigns ══ */

export type CampaignKind =
  | 'rainy_day'
  | 'holiday'
  | 'launch_week'
  | 'city_challenge'
  | 'flash'
  | 'language_week'
  | 'venue_takeover'
  | 'quiet_hours'
  | 'new_item';

/**
 * The nine campaign kinds: which band each belongs to, its rulebook number, the
 * copy an operator's row falls back on, and — in `evaluateCampaign` — the rule
 * that decides it.
 *
 * **Every one of them is decided from data the server has.** The two the
 * rulebook phrases in terms the server cannot see are phrased in terms it can:
 * the server does not know the weather, so a "rainy day" is a window an
 * operator *declares* rainy, and the operator's row is the evidence; and it does
 * not know what was on a bill, so "order a specific new item" is a claim of the
 * partner's deal for that item, which the gate records against the transaction.
 */
export const CAMPAIGN_KINDS: Record<CampaignKind, { band: 'seasonal' | 'partner'; number: number; title: string; description: string }> = {
  rainy_day: { band: 'seasonal', number: 57, title: 'Rainy day', description: 'Play today and your game points are doubled' },
  holiday: { band: 'seasonal', number: 58, title: 'Holiday special', description: 'Play a round or visit a venue during the holiday' },
  launch_week: { band: 'seasonal', number: 59, title: 'Launch week', description: 'Visit a newly joined venue in its first week' },
  city_challenge: { band: 'seasonal', number: 60, title: 'City challenge', description: 'Help the whole city reach the goal' },
  flash: { band: 'seasonal', number: 61, title: 'Flash mission', description: 'Play a round or visit a venue before the window closes' },
  language_week: { band: 'seasonal', number: 62, title: 'Language week', description: 'Play Word Builder in a new language' },
  venue_takeover: { band: 'partner', number: 63, title: 'Venue takeover', description: 'Visit the sponsoring venue' },
  quiet_hours: { band: 'partner', number: 64, title: 'Quiet hours hero', description: 'Visit during the venue’s quiet hours' },
  new_item: { band: 'partner', number: 65, title: 'Try the new thing', description: 'Order the venue’s new item' },
};

export const CAMPAIGN_KIND_KEYS = Object.keys(CAMPAIGN_KINDS) as CampaignKind[];

export interface CampaignRow {
  id: string;
  band: 'seasonal' | 'partner';
  kind: string;
  title: string;
  description: string;
  reward: number | null;
  venue_id: string | null;
  config: string;
  starts_at: string;
  ends_at: string;
  active: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const configOf = (row: CampaignRow): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(row.config) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const numberIn = (config: Record<string, unknown>, key: string, fallback: number): number => {
  const value = Number(config[key]);
  return Number.isFinite(value) ? value : fallback;
};

/** Campaigns live at `at`: switched on and inside their window. */
async function liveCampaigns(db: Db, at: Iso): Promise<CampaignRow[]> {
  return await db.all<CampaignRow>(
    `SELECT * FROM mission_campaigns
      WHERE active = 1 AND starts_at <= $t AND ends_at > $t
      ORDER BY ends_at, id`,
    { t: at },
  );
}

/**
 * One campaign, decided for one person.
 *
 * Every rule reads the window `[starts_at, ends_at)` and nothing outside it,
 * with the same "paid, finished round" and "confirmed visit" definitions the
 * static catalogue uses.
 */
async function evaluateCampaign(f: Facts, row: CampaignRow): Promise<Eval> {
  const config = configOf(row);
  const window = { u: f.userId, f: row.starts_at, t: row.ends_at };
  const rounds = () =>
    f.db.all<{ game_type: string; language: string }>(
      `SELECT game_type, language FROM game_sessions
        WHERE user_id = $u AND state = 'finished' AND life_spent > 0
          AND finished_at >= $f AND finished_at < $t`,
      window,
    );
  const visits = () =>
    f.db.all<{ venue_id: string; local_hour: number; created_at: string; joined_at: string }>(
      `SELECT v.venue_id, v.local_hour, v.created_at, COALESCE(ve.verified_at, ve.created_at) AS joined_at
         FROM venue_visits v JOIN venues ve ON ve.id = v.venue_id
        WHERE v.user_id = $u AND v.created_at >= $f AND v.created_at < $t`,
      window,
    );
  const defaultReward = row.reward ?? CONFIG.missions.campaignRewards[row.kind] ?? null;

  switch (row.kind as CampaignKind) {
    case 'rainy_day': {
      /* "Double game points": the second half of the doubling is this reward,
         equal to the game points banked in the window so far. Claiming settles
         it — once per campaign — so the description tells the player to claim
         after they have played. */
      const banked =
        (await f.db.get<{ total: number | null }>(
          `SELECT SUM(delta) AS total FROM points_ledger
            WHERE user_id = $u AND reason = 'game_win' AND status = 'committed'
              AND created_at >= $f AND created_at < $t`,
          window,
        ))?.total ?? 0;
      return { ...flag(banked > 0), reward: banked, rewardLabel: 'double game points' };
    }
    case 'holiday':
    case 'flash':
      return { ...flag((await rounds()).length + (await visits()).length > 0), reward: defaultReward };
    case 'launch_week': {
      const days = CONFIG.missions.launchWeekDays * 86_400_000;
      const fresh = (await visits()).some((visit) => {
        const joined = Date.parse(visit.joined_at);
        const came = Date.parse(visit.created_at);
        return came >= joined && came - joined < days;
      });
      return { ...flag(fresh), reward: defaultReward };
    }
    case 'city_challenge': {
      const metric = config.metric === 'rounds' ? 'rounds' : 'visits';
      const target = Math.max(1, Math.floor(numberIn(config, 'target', 1000)));
      const city = typeof config.city === 'string' && config.city !== '' ? config.city : null;
      const total =
        metric === 'rounds'
          ? (await f.db.get<{ n: number }>(
              `SELECT COUNT(*) AS n FROM game_sessions
                WHERE state = 'finished' AND life_spent > 0 AND finished_at >= $f AND finished_at < $t`,
              { f: row.starts_at, t: row.ends_at },
            ))?.n ?? 0
          : (await f.db.get<{ n: number }>(
              `SELECT COUNT(*) AS n FROM venue_visits v JOIN venues ve ON ve.id = v.venue_id
                WHERE v.created_at >= $f AND v.created_at < $t AND ($city IS NULL OR ve.city = $city)`,
              { f: row.starts_at, t: row.ends_at, city },
            ))?.n ?? 0;
      /* "200 each" — each person who took part. The community's total is the
         bar; a person who contributed nothing is shown it and cannot claim. */
      const mine = metric === 'rounds' ? (await rounds()).length : (await visits()).length;
      return { progress: total, target, done: total >= target && mine > 0, reward: defaultReward };
    }
    case 'language_week': {
      const before = new Set(
        (await f.db.all<{ language: string }>(
          `SELECT DISTINCT language FROM game_sessions
            WHERE user_id = $u AND game_type = 'word_builder' AND state = 'finished'
              AND life_spent > 0 AND finished_at < $f`,
          { u: f.userId, f: row.starts_at },
        )).map((r) => r.language),
      );
      const fresh = (await rounds()).some((r) => r.game_type === 'word_builder' && !before.has(r.language));
      return { ...flag(fresh), reward: defaultReward };
    }
    case 'venue_takeover':
      return {
        ...flag((await visits()).some((visit) => visit.venue_id === row.venue_id)),
        reward: row.reward,
        venueId: row.venue_id,
      };
    case 'quiet_hours': {
      const from = numberIn(config, 'fromHour', 14) * 60;
      const to = numberIn(config, 'toHour', 17) * 60;
      const quiet = (await visits()).some(
        (visit) => visit.venue_id === row.venue_id && withinDailyWindow(visit.local_hour * 60, from, to),
      );
      return { ...flag(quiet), reward: row.reward, venueId: row.venue_id };
    }
    case 'new_item': {
      const dealId = typeof config.dealId === 'string' ? config.dealId : '';
      const ordered =
        dealId !== '' &&
        (await f.db.get(
          `SELECT 1 AS one FROM transactions
            WHERE user_id = $u AND venue_id = $v AND deal_id = $d AND status = 'committed'
              AND confirmed_at >= $f AND confirmed_at < $t LIMIT 1`,
          { ...window, v: row.venue_id ?? '', d: dealId },
        )) !== undefined;
      return { ...flag(ordered), reward: row.reward, venueId: row.venue_id };
    }
    default:
      /* A kind this build does not know: shown, never completable. */
      return { ...flag(false), locked: true, reward: defaultReward };
  }
}

function campaignDef(row: CampaignRow): Def {
  const kind = CAMPAIGN_KINDS[row.kind as CampaignKind];
  return {
    id: `${row.band}.${row.id}`,
    number: kind?.number ?? (row.band === 'partner' ? 63 : 57),
    band: row.band,
    title: row.title || kind?.title || 'Mission',
    description: row.description || kind?.description || '',
    evaluate: (f) => evaluateCampaign(f, row),
  };
}

/* ══════════════════════════════════════════════════════════════ the reads ══ */

async function resolve(f: Facts, def: Def): Promise<Mission & { venueId: string | null; period: string }> {
  const result = await def.evaluate(f);
  const period = periodFor(def.band, f.at);
  const target = Math.max(1, Math.floor(result.target));
  const reward = result.reward !== undefined ? result.reward : (CONFIG.missions.rewards[def.id] ?? null);
  const autoPaid = def.autoPaid === true;

  let status: MissionStatus;
  if (result.locked) status = 'locked';
  else if (autoPaid) status = result.paid ? 'claimed' : result.done ? 'complete' : 'open';
  else if ((await f.claims()).has(`${def.id}|${period}`)) status = 'claimed';
  else status = result.done ? 'complete' : 'open';

  return {
    id: def.id,
    number: def.number,
    title: def.title,
    description: def.description,
    reward,
    rewardLabel: result.rewardLabel ?? (reward === null ? '' : String(reward)),
    progress: status === 'claimed' ? target : Math.max(0, Math.min(target, Math.floor(result.progress))),
    target,
    status,
    autoPaid,
    venueId: result.venueId ?? null,
    period,
  };
}

const wire = ({ venueId: _venueId, period: _period, ...mission }: Mission & { venueId: string | null; period: string }): Mission =>
  mission;

/** Whether the player can act on it now: a claim button, or the check-in. */
const claimable = (mission: Mission): boolean =>
  mission.status === 'complete' && (!mission.autoPaid || mission.id === CHECK_IN_ID);

/**
 * Every band for one person, in the rulebook's order, with the seasonal and
 * partner bands present only while a campaign is live — "a band with no active
 * rows is omitted".
 */
export async function missionsFor(db: Db, userId: string, at: Iso = now()): Promise<MissionsView> {
  const f = new Facts(db, userId, at);
  const campaigns = await liveCampaigns(db, at);
  const all = [...STATIC, ...campaigns.map(campaignDef), ...LEARNING];
  const served = await Promise.all(all.map((def) => isShown(f, def)));
  const defs = all.filter((_, i) => served[i]);

  const bands: Band[] = [];
  for (const key of BAND_ORDER) {
    const inBand = defs.filter((def) => def.band === key);
    if (inBand.length === 0) continue;
    const missions = (await Promise.all(inBand.map((def) => resolve(f, def)))).map(wire);
    bands.push({
      key,
      title: BAND_TITLES[key],
      resetsAt:
        key === 'daily'
          ? f.dayEnd
          : key === 'weekly'
            ? f.weekEnd
            : key === 'seasonal' || key === 'partner'
              ? (campaigns.find((row) => row.band === key)?.ends_at ?? null)
              : null,
      missions,
    });
  }

  return {
    bands,
    unclaimed: bands.reduce((n, band) => n + band.missions.filter(claimable).length, 0),
  };
}

/** The definition behind a mission id, or a 404. A campaign is looked up by its
 *  row whatever its window, so a claim made a second after it ends still finds
 *  it; a switched-off one is gone. */
async function defFor(db: Db, missionId: string): Promise<Def> {
  const fixed = [...STATIC, ...LEARNING].find((def) => def.id === missionId);
  if (fixed) return fixed;
  const match = /^(seasonal|partner)\.(.+)$/.exec(missionId);
  if (match) {
    const row = await db.get<CampaignRow>(
      `SELECT * FROM mission_campaigns WHERE id = $i AND band = $b AND active = 1`,
      { i: match[2], b: match[1] },
    );
    if (row) return campaignDef(row);
  }
  throw new DomainError('not_found', 'mission not found', { missionId });
}

/** One mission, as `GET /v1/missions` would show it. */
export async function missionFor(db: Db, userId: string, missionId: string, at: Iso = now()): Promise<Mission> {
  const f = new Facts(db, userId, at);
  const def = await defFor(db, missionId);
  if (!(await isShown(f, def))) throw new DomainError('not_found', 'mission not found', { missionId });
  return wire(await resolve(f, def));
}

/* ═════════════════════════════════════════════════════════════ the claim ══ */

export interface Claimed {
  mission: Mission;
  points: number;
  balance: number;
}

/**
 * Claim a completed mission: one ledger entry, once per period.
 *
 * **409 `conflict`** when the mission is not complete, is already claimed this
 * period, or is auto-paid (its bonus is paid by the code that pays it, and a
 * claim here would be the second payment). The check-in is the one auto-paid
 * mission that *is* claimed by a tap, and it is claimed through the check-in
 * itself, so the two endpoints are one grant.
 *
 * The guard is the `INSERT … ON CONFLICT DO NOTHING` on `mission_claims`, not
 * the status read above it: two taps arriving together both read `complete`,
 * and exactly one of them inserts. The status is re-read *inside* the
 * transaction so a mission cannot be claimed on a reading taken before it.
 */
export async function claim(db: Db, input: { userId: string; missionId: string; at?: Iso }): Promise<Claimed> {
  const at = input.at ?? now();

  if (input.missionId === CHECK_IN_ID) {
    const taken = await checkin.checkIn(db, { userId: input.userId, at });
    if (!taken.granted) throw new DomainError('conflict', 'already checked in today', { missionId: CHECK_IN_ID });
    return {
      mission: await missionFor(db, input.userId, CHECK_IN_ID, at),
      points: taken.total,
      balance: taken.balance,
    };
  }

  const def = await defFor(db, input.missionId);
  /* One not served to this person does not exist for them — the same 404 as an
     unknown id, not a 409 that would admit there is something to finish. */
  if (!(await isShown(new Facts(db, input.userId, at), def))) {
    throw new DomainError('not_found', 'mission not found', { missionId: def.id });
  }
  return db.tx(async () => {
    const before = await resolve(new Facts(db, input.userId, at), def);
    if (before.autoPaid) {
      throw new DomainError('conflict', 'this mission is paid automatically', { missionId: def.id });
    }
    if (before.status === 'claimed') {
      throw new DomainError('conflict', 'already claimed', { missionId: def.id, period: before.period });
    }
    if (before.status !== 'complete') {
      throw new DomainError('conflict', 'mission not complete', { missionId: def.id, status: before.status });
    }
    const points = Math.max(0, Math.floor(before.reward ?? 0));
    if (points <= 0) throw new DomainError('conflict', 'nothing to claim', { missionId: def.id });

    const inserted = await db.run(
      `INSERT INTO mission_claims (user_id, mission_id, period, points, ledger_id, claimed_at)
       VALUES ($u, $m, $p, $pt, NULL, $t)
       ON CONFLICT (user_id, mission_id, period) DO NOTHING`,
      { u: input.userId, m: def.id, p: before.period, pt: points, t: at },
    );
    if (inserted.changes !== 1) {
      throw new DomainError('conflict', 'already claimed', { missionId: def.id, period: before.period });
    }

    /* No multiplier: `earn` defaults it to 1, which is §2.2 — plans multiply
       game points, and a mission is not a round. A partner mission carries its
       venue on the entry, which is where "funded by the venue" is recorded. */
    const { entry } = await ledger.earn(db, {
      userId: input.userId,
      points,
      reason: 'mission',
      sourceKind: 'mission',
      sourceRef: `${def.id}:${before.period}`,
      venueId: before.venueId,
      at,
    });
    await db.run(
      `UPDATE mission_claims SET ledger_id = $l WHERE user_id = $u AND mission_id = $m AND period = $p`,
      { l: entry.id, u: input.userId, m: def.id, p: before.period },
    );

    return {
      mission: wire(await resolve(new Facts(db, input.userId, at), def)),
      points: entry.delta,
      balance: await ledger.balance(db, input.userId),
    };
  });
}

/* ═════════════════════════════════════════════ the operator's campaigns ══ */

export interface CampaignInput {
  kind: CampaignKind;
  title?: string;
  description?: string;
  reward?: number | null;
  venueId?: string | null;
  config?: Record<string, unknown>;
  startsAt: Iso;
  endsAt: Iso;
  active?: boolean;
}

function validateCampaign(input: CampaignInput): void {
  const kind = CAMPAIGN_KINDS[input.kind];
  if (!kind) throw new DomainError('validation_failed', 'unknown campaign kind', { field: 'kind' });
  if (!Number.isFinite(Date.parse(input.startsAt)) || !Number.isFinite(Date.parse(input.endsAt))) {
    throw new DomainError('validation_failed', 'a campaign needs a start and an end', { field: 'startsAt' });
  }
  if (Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
    throw new DomainError('validation_failed', 'a campaign must end after it starts', { field: 'endsAt' });
  }
  if (input.reward !== undefined && input.reward !== null && (!Number.isInteger(input.reward) || input.reward <= 0)) {
    throw new DomainError('validation_failed', 'a reward is a positive whole number of points', { field: 'reward' });
  }
  if (kind.band === 'partner') {
    if (!input.venueId) throw new DomainError('validation_failed', 'a partner mission names its venue', { field: 'venueId' });
    /* §8.6 "partner-set": there is no default to fall back on. */
    if (!input.reward) throw new DomainError('validation_failed', 'a partner mission sets its reward', { field: 'reward' });
  }
  if (input.kind === 'new_item' && typeof input.config?.dealId !== 'string') {
    throw new DomainError('validation_failed', 'a new-item mission names the deal for the item', { field: 'config' });
  }
  if (input.kind === 'city_challenge' && !(Number(input.config?.target) > 0)) {
    throw new DomainError('validation_failed', 'a city challenge sets its community target', { field: 'config' });
  }
}

export async function listCampaigns(db: Db): Promise<CampaignRow[]> {
  return await db.all<CampaignRow>(`SELECT * FROM mission_campaigns ORDER BY starts_at DESC, id`);
}

export async function getCampaign(db: Db, id: string): Promise<CampaignRow> {
  const row = await db.get<CampaignRow>(`SELECT * FROM mission_campaigns WHERE id = $i`, { i: id });
  if (!row) throw new DomainError('not_found', 'campaign not found');
  return row;
}

export async function createCampaign(
  db: Db,
  input: CampaignInput & { id: string; actorId: string | null; at?: Iso },
): Promise<CampaignRow> {
  validateCampaign(input);
  const at = input.at ?? now();
  const kind = CAMPAIGN_KINDS[input.kind];
  await db.run(
    `INSERT INTO mission_campaigns
       (id, band, kind, title, description, reward, venue_id, config, starts_at, ends_at,
        active, created_by, created_at, updated_at)
     VALUES ($i, $b, $k, $ti, $d, $r, $v, $c, $s, $e, $a, $by, $t, $t)`,
    {
      i: input.id,
      b: kind.band,
      k: input.kind,
      ti: input.title?.trim() || kind.title,
      d: input.description?.trim() ?? '',
      r: input.reward ?? null,
      v: kind.band === 'partner' ? (input.venueId ?? null) : null,
      c: JSON.stringify(input.config ?? {}),
      s: new Date(input.startsAt).toISOString(),
      e: new Date(input.endsAt).toISOString(),
      a: input.active ?? true,
      by: input.actorId,
      t: at,
    },
  );
  return await getCampaign(db, input.id);
}

export async function updateCampaign(
  db: Db,
  id: string,
  patch: Partial<CampaignInput>,
  at: Iso = now(),
): Promise<CampaignRow> {
  const row = await getCampaign(db, id);
  const merged: CampaignInput = {
    kind: (patch.kind ?? row.kind) as CampaignKind,
    title: patch.title ?? row.title,
    description: patch.description ?? row.description,
    reward: patch.reward !== undefined ? patch.reward : row.reward,
    venueId: patch.venueId !== undefined ? patch.venueId : row.venue_id,
    config: patch.config ?? configOf(row),
    startsAt: patch.startsAt ?? row.starts_at,
    endsAt: patch.endsAt ?? row.ends_at,
    active: patch.active ?? row.active === 1,
  };
  validateCampaign(merged);
  const kind = CAMPAIGN_KINDS[merged.kind];
  await db.run(
    `UPDATE mission_campaigns
        SET band = $b, kind = $k, title = $ti, description = $d, reward = $r, venue_id = $v,
            config = $c, starts_at = $s, ends_at = $e, active = $a, updated_at = $t
      WHERE id = $i`,
    {
      i: id,
      b: kind.band,
      k: merged.kind,
      ti: merged.title?.trim() || kind.title,
      d: merged.description?.trim() ?? '',
      r: merged.reward ?? null,
      v: kind.band === 'partner' ? (merged.venueId ?? null) : null,
      c: JSON.stringify(merged.config ?? {}),
      s: new Date(merged.startsAt).toISOString(),
      e: new Date(merged.endsAt).toISOString(),
      a: merged.active ?? true,
      t: at,
    },
  );
  return await getCampaign(db, id);
}

export async function deleteCampaign(db: Db, id: string): Promise<CampaignRow> {
  const row = await getCampaign(db, id);
  /* The claims stay: they are the record of points paid, and `mission_claims`
     has no foreign key to this table for exactly that reason. */
  await db.run(`DELETE FROM mission_campaigns WHERE id = $i`, { i: id });
  return row;
}
