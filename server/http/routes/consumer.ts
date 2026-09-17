/**
 * The consumer app's endpoints: the catalogue, the wallet, the games, the
 * social bits, the inbox and the assistant.
 *
 * Almost everything here is a read or a request. Three of them are not, and each
 * says so on its own route: `POST /v1/vouchers` spends points against a tier,
 * `POST /v1/games/sessions/:id/finish` banks a round, and
 * `POST /v1/daily/check-in` pays for turning up. The gate (`routes/gate.ts`) is
 * still the only place a *venue's* value is created; these three are the ones a
 * customer creates alone, and all four run through the domain layer's own
 * transactions rather than writing a row from a handler.
 */
import * as assistant from '../../domain/assistant.ts';
import * as campaigns from '../../domain/campaigns.ts';
import * as checkin from '../../domain/checkin.ts';
import * as deals from '../../domain/deals.ts';
import * as entitlements from '../../domain/entitlements.ts';
import * as games from '../../domain/games.ts';
import * as ledger from '../../domain/ledger.ts';
import * as notifications from '../../domain/notifications.ts';
import * as social from '../../domain/social.ts';
import * as tasks from '../../domain/tasks.ts';
import * as verification from '../../domain/verification.ts';
import * as vouchers from '../../domain/vouchers.ts';
import { CONFIG } from '../../config.ts';
import { getVenue, trackListing } from '../../domain/venues.ts';
import { linksOf } from '../../domain/partners.ts';
import { DomainError } from '../../domain/errors.ts';
import { FREE_ASSISTANT_USES_PER_DAY } from '../../domain/settings.ts';
import { actor, list, oneOf, optStr, qInt, qStr, str } from '../input.ts';
import type { Ctx, Route } from '../router.ts';

const viewerOf = (ctx: Ctx) => ({
  userId: ctx.actor?.user.id,
  language: ctx.language,
  city: qStr(ctx, 'city') ?? ctx.actor?.user.city ?? undefined,
  at: ctx.at,
});

/* ────────────────────────────────────────────────── the assistant's meter ── */

/**
 * How many questions this account has already put to the consumer assistant
 * today.
 *
 * Counted from the transcript rather than from a counter column: the transcript
 * is already the record of what was asked, and a second tally beside it is a
 * second thing that can drift. `substr(created_at, 1, 10)` is the user's own
 * local day — the same slice the word-hint allowance resets on (`dayOf` in
 * `domain/games.ts`) — because two daily resets an hour apart is a bug report
 * nobody can reproduce. Energy is the one allowance in the product that is *not*
 * on this clock: it refills on an interval, not at a boundary.
 *
 * `side = 'consumer'` keeps a venue owner's dashboard conversations out of it.
 * The two assistants answer out of different data and are sold on different
 * plans, so one allowance spanning both would let a busy afternoon writing deal
 * copy eat the questions the wallet was paid for.
 */
async function assistantAsksToday(ctx: Ctx, userId: string): Promise<number> {
  return (
    (await ctx.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM assistant_messages m
         JOIN assistant_sessions s ON s.id = m.session_id
        WHERE s.user_id = $u AND s.side = 'consumer' AND m.role = 'user'
          AND substr(m.created_at, 1, 10) = $d`,
      { u: userId, d: ctx.at.slice(0, 10) },
    ))?.n ?? 0
  );
}

/**
 * The conversation an ask belongs to: the one the client named, or a new one.
 *
 * Resolved here rather than left to `askConsumer`, because the meter above is
 * read off the transcript and both of the ways an ask can miss the transcript
 * are ways to make the cap stop existing. An ask with no `sessionId` writes
 * nothing at all, so an unlimited number of them cost nothing to make; and an
 * ask carrying *somebody else's* session id writes into their history, where it
 * counts against their allowance instead of the asker's — as well as putting one
 * customer's question in another customer's transcript.
 *
 * So a named session is checked against who is asking, and an ask that names
 * none is given one. The extra row is the price of every ask being on the
 * record, which is what §10.2's "an answer can be traced back to what grounded
 * it" wanted of it anyway.
 */
async function conversationFor(ctx: Ctx, userId: string): Promise<string> {
  const named = optStr(ctx.body, 'sessionId');
  if (!named) {
    return await assistant.startConversation(ctx.db, {
      userId,
      side: 'consumer',
      language: ctx.language,
      at: ctx.at,
    });
  }

  const session = await ctx.db.get<{ user_id: string; side: string }>(
    `SELECT user_id, side FROM assistant_sessions WHERE id = $s`,
    { s: named },
  );
  if (!session || session.user_id !== userId || session.side !== 'consumer') {
    /* One answer for "no such conversation" and for "not yours", deliberately:
       a 403 that only fires on real ids tells the caller which ids are real. */
    throw new DomainError('not_found', 'conversation not found');
  }
  return named;
}

export const consumerRoutes: Route[] = [
  /* ═══════════════════════════════════════════════════════ the catalogue ══ */
  {
    method: 'GET',
    pattern: '/v1/venues',
    auth: 'none',
    handler: async (ctx) =>
      await ctx.db.all(
        `SELECT id, name, category, subcategory, city, address, lat, lng, price_range,
                image_url, rating, review_count, accepts_vouchers
           FROM venues
          WHERE status = 'live' AND deleted_at IS NULL
            AND ($city IS NULL OR city = $city)
            AND ($cat IS NULL OR category = $cat)
          ORDER BY rating DESC NULLS LAST LIMIT $lim`,
        {
          city: qStr(ctx, 'city') ?? null,
          cat: qStr(ctx, 'category') ?? null,
          lim: qInt(ctx, 'limit', 50),
        },
      ),
  },
  {
    /**
     * Venue detail (§10.1): deals, stamp card, tier ladder, hours, map — and
     * the venue's links, shown only when the partner provided them.
     */
    method: 'GET',
    pattern: '/v1/venues/:id',
    auth: 'none',
    handler: async (ctx) => {
      const venue = await getVenue(ctx.db, ctx.params.id);
      const userId = ctx.actor?.user.id;
      return {
        venue: {
          id: venue.id,
          name: venue.name,
          category: venue.category,
          subcategory: venue.subcategory,
          city: venue.city,
          address: venue.address,
          lat: venue.lat,
          lng: venue.lng,
          currency: venue.currency,
          priceRange: venue.price_range,
          imageUrl: venue.image_url,
          rating: venue.rating,
          reviewCount: venue.review_count,
          phone: venue.phone,
          acceptsVouchers: venue.accepts_vouchers === 1,
          pointsPerScan: venue.points_per_scan,
          /* The clock the venue's deal hours, opening hours and budget month are
             in — a client printing "12:00–14:00" for a deal has to know whose
             twelve o'clock it is. */
          timezone: venue.timezone,
        },
        links: await linksOf(ctx.db, venue.id),
        hours: await ctx.db.all(
          `SELECT weekday, opens_min, closes_min, closed FROM venue_hours WHERE venue_id = $v
            ORDER BY weekday`,
          { v: venue.id },
        ),
        description:
          (await ctx.db.get<{ value: string }>(
            `SELECT value FROM translations WHERE entity = 'venue' AND entity_id = $v
               AND field = 'description' AND language IN ($l, 'en') ORDER BY language = $l DESC LIMIT 1`,
            { v: venue.id, l: ctx.language },
          ))?.value ?? null,
        /* The viewer is passed so a rung this account has taken its personal
           limit of closes, rather than looking live and refusing on the press.
           `undefined` signed out, which applies the total cap alone — see
           `vouchers.ladder`. */
        tiers: await vouchers.ladder(ctx.db, venue.id, ctx.at, userId),
        deals: await deals.browse(ctx.db, viewerOf(ctx), { venueId: venue.id }),
        stampCards: userId ? await campaigns.progressFor(ctx.db, userId, venue.id) : [],
        rewards: userId ? await campaigns.availableRewards(ctx.db, userId, venue.id) : [],
      };
    },
  },

  /* ════════════════════════════════════════════════════════════ hot deals ══ */
  {
    method: 'GET',
    pattern: '/v1/deals',
    auth: 'none',
    handler: async (ctx) =>
      await deals.browse(ctx.db, viewerOf(ctx), {
        city: qStr(ctx, 'city'),
        category: qStr(ctx, 'category'),
        limit: qInt(ctx, 'limit', 50),
      }),
  },
  {
    method: 'GET',
    pattern: '/v1/deals/:id',
    auth: 'none',
    handler: async (ctx) => {
      const deal = await deals.getDeal(ctx.db, ctx.params.id);
      const copy = await deals.copyFor(ctx.db, deal.id, ctx.language);
      const verdict = await deals.claimableNow(ctx.db, deal, viewerOf(ctx));
      return {
        deal,
        copy,
        claimable: verdict.ok,
        reason: verdict.ok ? null : verdict.reason,
      };
    },
  },
  {
    /* Seen and Opened only. A *claim* is written by the gate from a confirmed
       scan (§6.3) and is deliberately not reachable from here. */
    method: 'POST',
    pattern: '/v1/deals/:id/events',
    auth: 'none',
    handler: async (ctx) => {
      await deals.track(ctx.db, {
        dealId: ctx.params.id,
        userId: ctx.actor?.user.id ?? null,
        kind: oneOf(ctx.body, 'kind', ['impression', 'open'] as const),
        source: optStr(ctx.body, 'source'),
        pushId: optStr(ctx.body, 'pushId'),
        at: ctx.at,
      });
      return { ok: true };
    },
  },
  {
    /*
     * The same two steps, one level up: the *venue* being seen and opened,
     * rather than one of its offers. `auth: 'none'` for the reason the deal
     * events above are: most impressions happen to somebody who is not signed
     * in, and an impression that only counts for members is a reach figure that
     * under-reports the audience an owner is actually paying to reach.
     *
     * A visit is deliberately not postable here, exactly as a claim is not
     * postable there. It is written by the gate from a confirmed scan, and it
     * is the number every other figure on the dashboard is derived from.
     */
    method: 'POST',
    pattern: '/v1/venues/:id/events',
    auth: 'none',
    handler: async (ctx) => {
      await trackListing(ctx.db, {
        venueId: ctx.params.id,
        userId: ctx.actor?.user.id ?? null,
        kind: oneOf(ctx.body, 'kind', ['impression', 'click'] as const),
        source: optStr(ctx.body, 'source'),
        language: ctx.language,
        at: ctx.at,
      });
      return { ok: true };
    },
  },

  /* ══════════════════════════════════════════════════════════════ wallet ══ */
  {
    method: 'GET',
    pattern: '/v1/wallet',
    auth: 'user',
    handler: async (ctx) => {
      const { user } = actor(ctx);
      return {
        points: await ledger.balance(ctx.db, user.id),
        /* There is no `expiringSoon` any more, and it is *removed* rather than
           returned empty: points do not expire on any plan now, so the field
           would be an array that is always `[]` — a promise the wallet keeps
           making about a thing that cannot happen, and the client that renders
           "nothing expiring soon" off it is telling the customer about a rule
           the product dropped. `domain/ledger.ts` took the job with it. */
        vouchers: await vouchers.activeVouchers(ctx.db, user.id),
        rewards: await campaigns.availableRewards(ctx.db, user.id),
        /* The cards in progress, across every venue. The venue screen answers
           "what is on offer here"; this answers "what am I part-way through",
           which is the wallet's question and cannot be assembled from the other
           one without a request per venue. */
        stampCards: await campaigns.cardsFor(ctx.db, user.id),
        giftCards: await ctx.db.all(
          `SELECT g.id, g.code, g.status, g.issued_at, g.expires_at, s.brand, s.logo,
                  s.face_minor, s.currency
             FROM gift_cards g JOIN gift_card_stock s ON s.id = g.stock_id
            WHERE g.user_id = $u ORDER BY g.issued_at DESC`,
          { u: user.id },
        ),
      };
    },
  },
  {
    method: 'GET',
    pattern: '/v1/wallet/history',
    auth: 'user',
    handler: async (ctx) =>
      await ledger.history(ctx.db, actor(ctx).user.id, qInt(ctx, 'limit', 50), qStr(ctx, 'before')),
  },
  {
    method: 'POST',
    pattern: '/v1/vouchers',
    auth: 'user',
    idempotent: true,
    handler: async (ctx) => {
      /* Value leaving the platform, so it is behind a proved address. The gate
         is at the route rather than in `vouchers.issue`, because that function
         is also how the till, the demo seed and the fixtures issue one and none
         of those is a client with an inbox. */
      await verification.assertVerified(ctx.db, actor(ctx).user.id);
      return await vouchers.issue(ctx.db, {
        userId: actor(ctx).user.id,
        venueId: str(ctx.body, 'venueId'),
        tierId: str(ctx.body, 'tierId'),
        at: ctx.at,
      });
    },
  },
  {
    method: 'GET',
    pattern: '/v1/gift-cards',
    auth: 'none',
    handler: async (ctx) =>
      await ctx.db.all(
        `SELECT id, brand, logo, face_minor, currency, points_cost, stock, priority_only
           FROM gift_card_stock WHERE active = 1 ORDER BY points_cost`,
      ),
  },
  {
    method: 'POST',
    pattern: '/v1/gift-cards',
    auth: 'user',
    idempotent: true,
    /* The one press on the wallet that moves value. Bounded because a loop
       against a shelf with stock on it is a loop that empties it. */
    limit: { perHour: CONFIG.limits.giftCardPerHour, by: 'account' },
    handler: async (ctx) => {
      const { user } = actor(ctx);
      /* Same rule as the voucher ladder above: points leaving as a card with a
         face value on it. */
      await verification.assertVerified(ctx.db, user.id);
      const ent = await entitlements.entitlementsFor(ctx.db, { userId: user.id });
      return await vouchers.redeemGiftCard(ctx.db, {
        userId: user.id,
        stockId: str(ctx.body, 'stockId'),
        entitled: entitlements.entBool(ent, 'gift_card_priority'),
        at: ctx.at,
      });
    },
  },

  /* ══════════════════════════════════════════════════════════ turning up ══ */
  {
    /**
     * The daily-rewards screen, in one response.
     *
     * One call rather than three, because the streak, the seven-day run-up, the
     * month's grid and the legend under it are four answers to one question, and
     * a screen that fetched them separately could draw a calendar beside a
     * streak read a second earlier. `month` defaults to the one `today` falls
     * in; an older one is a read of history and costs the same query.
     */
    method: 'GET',
    pattern: '/v1/daily',
    auth: 'user',
    handler: async (ctx) =>
      await checkin.calendar(ctx.db, {
        userId: actor(ctx).user.id,
        month: qStr(ctx, 'month'),
        at: ctx.at,
      }),
  },
  {
    /**
     * The daily-task prompts, with this account's progress on each.
     *
     * A read of its own rather than a field on `GET /v1/games/state`, because
     * the two answer different questions and one of them is expensive: the
     * state is the tank, the streak and the balance — four cheap reads a screen
     * needs before it can draw anything — and this walks a month of check-ins,
     * the day's finished rounds, the profile stamp and the referral table. A
     * panel of nudges must not be on the critical path of the Play screen.
     *
     * Every task carries its own `done`, and the point of that is stated in
     * `domain/tasks.ts`: each of these grants is once-only and guarded, so a
     * panel that went on offering fifty points for a finished profile would be
     * advertising a reward the server is going to refuse.
     */
    method: 'GET',
    pattern: '/v1/daily/tasks',
    auth: 'user',
    handler: async (ctx) => ({
      tasks: await tasks.tasksFor(ctx.db, actor(ctx).user.id, ctx.at),
    }),
  },
  {
    /**
     * Take today's check-in.
     *
     * Declared idempotent although the day key already makes a repeat free, because
     * the two guards answer different questions. The day key stops a second
     * *claim* — a tab left open overnight, a second device — and answers it
     * `granted: false`. `Idempotency-Key` stops a retried *request* from being
     * run twice at all, which is what hands a phone that never saw the first
     * reply the original body rather than a second, truthful-but-different one.
     *
     * No body. The server knows who is asking and what day it is, and a claim
     * that let the client name either is a claim the client can aim.
     */
    method: 'POST',
    pattern: '/v1/daily/check-in',
    auth: 'user',
    idempotent: true,
    /* The day key already makes a repeat free; this bounds the *requests*
       rather than the grants, which is the cost the day key does not cover. */
    limit: { perHour: CONFIG.limits.checkInPerHour, by: 'account' },
    handler: async (ctx) => {
      /* It grants points. Refused rather than granted-as-nothing, unlike a game
         round: a round has a reason to be played anyway (it is the product) and
         a check-in is *only* the grant, so a silent zero would be a button that
         does nothing. */
      await verification.assertVerified(ctx.db, actor(ctx).user.id);
      return await checkin.checkIn(ctx.db, { userId: actor(ctx).user.id, at: ctx.at });
    },
  },

  /* ═══════════════════════════════════════════════════════════════ games ══ */
  {
    method: 'GET',
    pattern: '/v1/games/state',
    auth: 'user',
    handler: async (ctx) => {
      const { user } = actor(ctx);
      const state = await games.playerState(ctx.db, user.id, ctx.at);
      return {
        energy: await games.energyFor(ctx.db, user.id, ctx.at),
        streak: state.streak,
        longestStreak: state.longest_streak,
        freezes: state.freezes,
        answered: state.answered,
        correct: state.correct,
        points: await ledger.balance(ctx.db, user.id),
        dailyWord: await games.dailyWord(ctx.db, ctx.language, ctx.at),
      };
    },
  },
  {
    method: 'POST',
    pattern: '/v1/games/sessions',
    auth: 'user',
    /* Above what energy allows on any plan, because energy bounds the rounds
       that *pay* and this bounds the ones that do not: a practice round costs
       nothing, which is exactly why it needs a ceiling of its own. */
    limit: { perHour: CONFIG.limits.gameStartPerHour, by: 'account' },
    handler: async (ctx) =>
      await games.startSession(ctx.db, {
        userId: actor(ctx).user.id,
        /* The same tuple the database's CHECK is built from, so a type this
           route accepts is a type the insert cannot reject. */
        gameType: oneOf(ctx.body, 'gameType', games.GAME_TYPES),
        language: ctx.language,
        /* Opt-in, and only ever opt-in: without it an empty tank is the
           `no_energy` refusal every shipped client already handles. Read as
           `=== true` rather than coerced, so a client sending the string
           "false" — which every truthiness test in JavaScript gets wrong — does
           not silently give up the round's points. */
        practice: ctx.body.practice === true,
        /* Chooses an easier flag pool for the welcome round and nothing else
           -- see `welcome` on `startSession`. Same strict `=== true`. */
        welcome: ctx.body.welcome === true,
        at: ctx.at,
      }),
  },
  {
    method: 'POST',
    pattern: '/v1/games/sessions/:id/events',
    auth: 'user',
    handler: async (ctx) =>
      await games.submitEvent(ctx.db, {
        sessionId: ctx.params.id,
        userId: actor(ctx).user.id,
        seq: Number(ctx.body.seq ?? 0),
        kind: optStr(ctx.body, 'kind') ?? 'answer',
        payload: (ctx.body.payload as Record<string, unknown>) ?? {},
        at: ctx.at,
      }),
  },
  {
    method: 'POST',
    pattern: '/v1/games/sessions/:id/finish',
    auth: 'user',
    idempotent: true,
    /* The one endpoint on this file that writes to the ledger unprompted by a
       venue. Matched to the start limit: a finish with no start before it
       cannot exist, so a lower number here would only ever refuse a round
       somebody was allowed to begin. */
    limit: { perHour: CONFIG.limits.gameFinishPerHour, by: 'account' },
    handler: async (ctx) =>
      await games.finish(ctx.db, {
        sessionId: ctx.params.id,
        userId: actor(ctx).user.id,
        clientReport: (ctx.body.report as Record<string, unknown>) ?? {},
        at: ctx.at,
      }),
  },

  /* ══════════════════════════════════════════════════ referrals & boards ══ */
  {
    method: 'GET',
    pattern: '/v1/referrals',
    auth: 'user',
    handler: async (ctx) => await social.referralProgress(ctx.db, actor(ctx).user.id),
  },
  {
    /**
     * The weekly board, in one of three scopes.
     *
     * `auth: 'none'` because the board is public — a visitor deciding whether
     * to sign up should be able to see that people are playing. A signed-in
     * caller gets their own row marked and their own city and country used as
     * the default filter, which is why the scope parameters are optional.
     *
     * `/v1/leaderboard/city` stays as an alias rather than being renamed: the
     * Flutter app calls it, and breaking a client to tidy a path is not a
     * trade worth making. Both routes reach the same function.
     */
    method: 'GET',
    pattern: '/v1/leaderboard/:scope',
    auth: 'none',
    handler: async (ctx) => {
      const scope = ctx.params.scope;
      if (!social.isScope(scope)) {
        throw new DomainError('not_found', 'no such leaderboard');
      }
      return await social.board(ctx.db, {
        userId: ctx.actor?.user.id,
        scope,
        city: qStr(ctx, 'city') ?? ctx.actor?.user.city ?? null,
        country: qStr(ctx, 'country') ?? ctx.actor?.user.country_code ?? null,
        at: ctx.at,
        limit: qInt(ctx, 'limit', 20),
      });
    },
  },
  {
    method: 'GET',
    pattern: '/v1/leaderboard/friends',
    auth: 'user',
    handler: async (ctx) => await social.friendsBoard(ctx.db, { userId: actor(ctx).user.id, at: ctx.at }),
  },
  {
    method: 'POST',
    pattern: '/v1/friends',
    auth: 'user',
    handler: async (ctx) => {
      await social.addFriend(ctx.db, actor(ctx).user.id, str(ctx.body, 'userId'), ctx.at);
      return { ok: true };
    },
  },

  /* ══════════════════════════════════════════════════════ notifications ══ */
  {
    method: 'GET',
    pattern: '/v1/notifications',
    auth: 'user',
    handler: async (ctx) => {
      const { user, session } = actor(ctx);
      const mode = session.mode === 'partner' ? 'partner' : 'consumer';
      return {
        unread: await notifications.unreadCount(ctx.db, user.id, mode),
        items: await notifications.inbox(ctx.db, user.id, mode, qInt(ctx, 'limit', 50)),
      };
    },
  },
  {
    method: 'POST',
    pattern: '/v1/notifications/read',
    auth: 'user',
    handler: async (ctx) => ({
      read: await notifications.markRead(
        ctx.db,
        actor(ctx).user.id,
        list(ctx.body, 'ids', (item) => String(item)),
        ctx.at,
      ),
    }),
  },
  {
    method: 'POST',
    pattern: '/v1/push-tokens',
    auth: 'user',
    handler: async (ctx) => {
      const { user } = actor(ctx);
      await ctx.db.run(
        `INSERT INTO push_tokens (id, user_id, platform, token, created_at)
         VALUES ($i, $u, $p, $t, $at) ON CONFLICT (token) DO UPDATE SET revoked_at = NULL`,
        {
          i: `ptk_${user.id}_${Date.now()}`,
          u: user.id,
          p: oneOf(ctx.body, 'platform', ['fcm', 'apns', 'web'] as const),
          t: str(ctx.body, 'token'),
          at: ctx.at,
        },
      );
      return { ok: true };
    },
  },

  /* ═══════════════════════════════════════════════════════════ assistant ══ */
  {
    method: 'POST',
    pattern: '/v1/assistant/ask',
    auth: 'user',
    /* Async, because the answer may be handed to a language model to reword
       before it is stored and returned — see `ports/llm.ts`. Everything the
       sentence *says* was decided synchronously before that. */
    handler: async (ctx) => {
      const { user } = actor(ctx);

      /*
       * §12a: the assistant is metered — five questions a day free, twenty on
       * Pro, effectively uncapped on Premium.
       *
       * It is the one consumer entitlement whose ceiling is a running cost
       * rather than a design choice: every ask is a retrieval pass, and with
       * `PAYLEZ_LLM=live` it is also a model call. `requireCapacity` throws the
       * same 403 the gift-card tier does, naming the key, the limit and what has
       * been spent, so the app can say "that is your five for today" instead of
       * "something went wrong".
       *
       * **Refused, never quietly degraded.** Answering the sixth question from a
       * cheaper path — a canned line, a shorter retrieval, yesterday's answer —
       * gives the person a worse answer for a reason they cannot see, and an
       * assistant somebody has learned to distrust is worth less than one that
       * says no.
       */
      const ent = await entitlements.entitlementsFor(ctx.db, { userId: user.id });
      entitlements.requireCapacity(
        ent,
        'assistant_uses_per_day',
        await assistantAsksToday(ctx, user.id),
        FREE_ASSISTANT_USES_PER_DAY,
      );

      return await assistant.askConsumer(ctx.db, {
        sessionId: await conversationFor(ctx, user.id),
        userId: user.id,
        text: str(ctx.body, 'text', { max: 500 }),
        language: ctx.language,
        city: user.city ?? undefined,
        at: ctx.at,
      });
    },
  },
  {
    method: 'POST',
    pattern: '/v1/assistant/sessions',
    auth: 'user',
    handler: async (ctx) => ({
      sessionId: await assistant.startConversation(ctx.db, {
        userId: actor(ctx).user.id,
        side: 'consumer',
        language: ctx.language,
        at: ctx.at,
      }),
    }),
  },
  {
    method: 'GET',
    pattern: '/v1/assistant/sessions/:id',
    auth: 'user',
    handler: async (ctx) => await assistant.transcript(ctx.db, ctx.params.id),
  },
];
