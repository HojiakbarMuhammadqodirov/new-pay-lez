/**
 * The consumer app's endpoints: the catalogue, the wallet, the games, the
 * social bits, the inbox and the assistant.
 *
 * Everything here is a read or a request; nothing here grants anything. The one
 * place value is created is the gate (`routes/gate.ts`), and the one place it is
 * converted is `POST /v1/vouchers`, which spends points against a tier — both of
 * which run through the domain layer's own transactions.
 */
import * as assistant from '../../domain/assistant.ts';
import * as campaigns from '../../domain/campaigns.ts';
import * as deals from '../../domain/deals.ts';
import * as entitlements from '../../domain/entitlements.ts';
import * as games from '../../domain/games.ts';
import * as ledger from '../../domain/ledger.ts';
import * as notifications from '../../domain/notifications.ts';
import * as social from '../../domain/social.ts';
import * as vouchers from '../../domain/vouchers.ts';
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
 * local day — the same slice the lives pool refills on and the round-decay curve
 * resets on (`dayOf` in `domain/games.ts`) — because two daily resets an hour
 * apart is a bug report nobody can reproduce.
 *
 * `side = 'consumer'` keeps a venue owner's dashboard conversations out of it.
 * The two assistants answer out of different data and are sold on different
 * plans, so one allowance spanning both would let a busy afternoon writing deal
 * copy eat the questions the wallet was paid for.
 */
function assistantAsksToday(ctx: Ctx, userId: string): number {
  return (
    ctx.db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM assistant_messages m
         JOIN assistant_sessions s ON s.id = m.session_id
        WHERE s.user_id = $u AND s.side = 'consumer' AND m.role = 'user'
          AND substr(m.created_at, 1, 10) = $d`,
      { u: userId, d: ctx.at.slice(0, 10) },
    )?.n ?? 0
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
function conversationFor(ctx: Ctx, userId: string): string {
  const named = optStr(ctx.body, 'sessionId');
  if (!named) {
    return assistant.startConversation(ctx.db, {
      userId,
      side: 'consumer',
      language: ctx.language,
      at: ctx.at,
    });
  }

  const session = ctx.db.get<{ user_id: string; side: string }>(
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
    handler: (ctx) =>
      ctx.db.all(
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
    handler: (ctx) => {
      const venue = getVenue(ctx.db, ctx.params.id);
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
        },
        links: linksOf(ctx.db, venue.id),
        hours: ctx.db.all(
          `SELECT weekday, opens_min, closes_min, closed FROM venue_hours WHERE venue_id = $v
            ORDER BY weekday`,
          { v: venue.id },
        ),
        description:
          ctx.db.get<{ value: string }>(
            `SELECT value FROM translations WHERE entity = 'venue' AND entity_id = $v
               AND field = 'description' AND language IN ($l, 'en') ORDER BY language = $l DESC LIMIT 1`,
            { v: venue.id, l: ctx.language },
          )?.value ?? null,
        tiers: vouchers.ladder(ctx.db, venue.id, ctx.at),
        deals: deals.browse(ctx.db, viewerOf(ctx), { venueId: venue.id }),
        stampCards: userId ? campaigns.progressFor(ctx.db, userId, venue.id) : [],
        rewards: userId ? campaigns.availableRewards(ctx.db, userId, venue.id) : [],
      };
    },
  },

  /* ════════════════════════════════════════════════════════════ hot deals ══ */
  {
    method: 'GET',
    pattern: '/v1/deals',
    auth: 'none',
    handler: (ctx) =>
      deals.browse(ctx.db, viewerOf(ctx), {
        city: qStr(ctx, 'city'),
        category: qStr(ctx, 'category'),
        limit: qInt(ctx, 'limit', 50),
      }),
  },
  {
    method: 'GET',
    pattern: '/v1/deals/:id',
    auth: 'none',
    handler: (ctx) => {
      const deal = deals.getDeal(ctx.db, ctx.params.id);
      const copy = deals.copyFor(ctx.db, deal.id, ctx.language);
      const verdict = deals.claimableNow(ctx.db, deal, viewerOf(ctx));
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
    handler: (ctx) => {
      deals.track(ctx.db, {
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
    handler: (ctx) => {
      trackListing(ctx.db, {
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
    handler: (ctx) => {
      const { user } = actor(ctx);
      return {
        points: ledger.balance(ctx.db, user.id),
        /* There is no `expiringSoon` any more, and it is *removed* rather than
           returned empty: points do not expire on any plan now, so the field
           would be an array that is always `[]` — a promise the wallet keeps
           making about a thing that cannot happen, and the client that renders
           "nothing expiring soon" off it is telling the customer about a rule
           the product dropped. `domain/ledger.ts` took the job with it. */
        vouchers: vouchers.activeVouchers(ctx.db, user.id),
        rewards: campaigns.availableRewards(ctx.db, user.id),
        /* The cards in progress, across every venue. The venue screen answers
           "what is on offer here"; this answers "what am I part-way through",
           which is the wallet's question and cannot be assembled from the other
           one without a request per venue. */
        stampCards: campaigns.cardsFor(ctx.db, user.id),
        giftCards: ctx.db.all(
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
    handler: (ctx) =>
      ledger.history(ctx.db, actor(ctx).user.id, qInt(ctx, 'limit', 50), qStr(ctx, 'before')),
  },
  {
    method: 'POST',
    pattern: '/v1/vouchers',
    auth: 'user',
    idempotent: true,
    handler: (ctx) =>
      vouchers.issue(ctx.db, {
        userId: actor(ctx).user.id,
        venueId: str(ctx.body, 'venueId'),
        tierId: str(ctx.body, 'tierId'),
        at: ctx.at,
      }),
  },
  {
    method: 'GET',
    pattern: '/v1/gift-cards',
    auth: 'none',
    handler: (ctx) =>
      ctx.db.all(
        `SELECT id, brand, logo, face_minor, currency, points_cost, stock, priority_only
           FROM gift_card_stock WHERE active = 1 ORDER BY points_cost`,
      ),
  },
  {
    method: 'POST',
    pattern: '/v1/gift-cards',
    auth: 'user',
    idempotent: true,
    handler: (ctx) => {
      const { user } = actor(ctx);
      const ent = entitlements.entitlementsFor(ctx.db, { userId: user.id });
      return vouchers.redeemGiftCard(ctx.db, {
        userId: user.id,
        stockId: str(ctx.body, 'stockId'),
        entitled: entitlements.entBool(ent, 'gift_card_priority'),
        at: ctx.at,
      });
    },
  },

  /* ═══════════════════════════════════════════════════════════════ games ══ */
  {
    method: 'GET',
    pattern: '/v1/games/state',
    auth: 'user',
    handler: (ctx) => {
      const { user } = actor(ctx);
      const state = games.playerState(ctx.db, user.id, ctx.at);
      return {
        lives: games.livesFor(ctx.db, user.id, ctx.at),
        streak: state.streak,
        longestStreak: state.longest_streak,
        freezes: state.freezes,
        answered: state.answered,
        correct: state.correct,
        points: ledger.balance(ctx.db, user.id),
        dailyWord: games.dailyWord(ctx.db, ctx.language, ctx.at),
      };
    },
  },
  {
    method: 'POST',
    pattern: '/v1/games/sessions',
    auth: 'user',
    handler: (ctx) =>
      games.startSession(ctx.db, {
        userId: actor(ctx).user.id,
        gameType: oneOf(ctx.body, 'gameType', [
          'flags',
          'capitals',
          'brain',
          'poland',
          'word_builder',
          'memory_match',
          'flight',
        ] as const),
        language: ctx.language,
        at: ctx.at,
      }),
  },
  {
    method: 'POST',
    pattern: '/v1/games/sessions/:id/events',
    auth: 'user',
    handler: (ctx) =>
      games.submitEvent(ctx.db, {
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
    handler: (ctx) =>
      games.finish(ctx.db, {
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
    handler: (ctx) => social.referralProgress(ctx.db, actor(ctx).user.id),
  },
  {
    method: 'GET',
    pattern: '/v1/leaderboard/city',
    auth: 'none',
    handler: (ctx) =>
      social.cityBoard(ctx.db, {
        userId: ctx.actor?.user.id,
        city: qStr(ctx, 'city') ?? ctx.actor?.user.city ?? 'Krakow',
        at: ctx.at,
        limit: qInt(ctx, 'limit', 20),
      }),
  },
  {
    method: 'GET',
    pattern: '/v1/leaderboard/friends',
    auth: 'user',
    handler: (ctx) => social.friendsBoard(ctx.db, { userId: actor(ctx).user.id, at: ctx.at }),
  },
  {
    method: 'POST',
    pattern: '/v1/friends',
    auth: 'user',
    handler: (ctx) => {
      social.addFriend(ctx.db, actor(ctx).user.id, str(ctx.body, 'userId'), ctx.at);
      return { ok: true };
    },
  },

  /* ══════════════════════════════════════════════════════ notifications ══ */
  {
    method: 'GET',
    pattern: '/v1/notifications',
    auth: 'user',
    handler: (ctx) => {
      const { user, session } = actor(ctx);
      const mode = session.mode === 'partner' ? 'partner' : 'consumer';
      return {
        unread: notifications.unreadCount(ctx.db, user.id, mode),
        items: notifications.inbox(ctx.db, user.id, mode, qInt(ctx, 'limit', 50)),
      };
    },
  },
  {
    method: 'POST',
    pattern: '/v1/notifications/read',
    auth: 'user',
    handler: (ctx) => ({
      read: notifications.markRead(
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
    handler: (ctx) => {
      const { user } = actor(ctx);
      ctx.db.run(
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
      const ent = entitlements.entitlementsFor(ctx.db, { userId: user.id });
      entitlements.requireCapacity(
        ent,
        'assistant_uses_per_day',
        assistantAsksToday(ctx, user.id),
        FREE_ASSISTANT_USES_PER_DAY,
      );

      return await assistant.askConsumer(ctx.db, {
        sessionId: conversationFor(ctx, user.id),
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
    handler: (ctx) => ({
      sessionId: assistant.startConversation(ctx.db, {
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
    handler: (ctx) => assistant.transcript(ctx.db, ctx.params.id),
  },
];
