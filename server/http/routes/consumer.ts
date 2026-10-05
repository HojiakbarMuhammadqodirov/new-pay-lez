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
import * as giftCards from '../../domain/giftCards.ts';
import * as reminders from '../../domain/reminders.ts';
import * as push from '../../ports/push.ts';
import { parseSubscription } from '../../ports/webpush.ts';
import * as occasions from '../../domain/occasions.ts';
import * as social from '../../domain/social.ts';
import * as tasks from '../../domain/tasks.ts';
import * as verification from '../../domain/verification.ts';
import * as vouchers from '../../domain/vouchers.ts';
import { CONFIG } from '../../config.ts';
import { getVenue, trackListing } from '../../domain/venues.ts';
import { linksOf } from '../../domain/partners.ts';
import { DomainError } from '../../domain/errors.ts';
import { FREE_ASSISTANT_USES_PER_DAY } from '../../domain/settings.ts';
import { actor, bool, list, oneOf, optStr, qInt, qStr, str } from '../input.ts';
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
        /* `points_per_scan`, `currency` and `phone` travel with the listing too.
           The app's home cards print "N points a visit" and its scan screens the
           same figure straight off this row; with the column missing, its
           tolerant reader turned the absence into 0 and every nearby venue said
           "0 points a visit" against a real server. Additive, so the website
           (which reads this row as well) is unaffected. */
        `SELECT id, name, category, subcategory, city, address, lat, lng, price_range,
                image_url, rating, review_count, accepts_vouchers, points_per_scan,
                currency, phone
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
     * Rulebook §7.3 "Deal shared": 25 points, at most three a day and once per
     * deal. The client calls this when its share sheet completes; the server
     * cannot see a share land, which is why the two caps exist. A share that
     * pays nothing answers 200 with `granted: false` and the reason — sharing
     * twice is not an error. See `occasions.shareDeal`.
     */
    method: 'POST',
    pattern: '/v1/deals/:id/share',
    auth: 'user',
    idempotent: true,
    handler: async (ctx) =>
      await occasions.shareDeal(ctx.db, { userId: actor(ctx).user.id, dealId: ctx.params.id, at: ctx.at }),
  },
  {
    /*
     * Rulebook §7.3 / §9.2 "Review after a visit": 25 points, one review per
     * venue per 30 days, and only after a confirmed visit (403 `forbidden`,
     * `reason: 'no_visit'`, otherwise). A second review inside the window is a
     * 409 naming `nextAt`. Body `{ rating: 1..5, body?: string }`.
     */
    method: 'POST',
    pattern: '/v1/venues/:id/reviews',
    auth: 'user',
    idempotent: true,
    handler: async (ctx) => {
      const body = (ctx.body ?? {}) as Record<string, unknown>;
      return await occasions.review(ctx.db, {
        userId: actor(ctx).user.id,
        venueId: ctx.params.id,
        rating: body.rating,
        body: body.body,
        at: ctx.at,
      });
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
        /* Lifetime earned points by source, for the "from playing / from
           visiting" bar — `ledger.earnedBySource`. The phone used to guess it. */
        earned: await ledger.earnedBySource(ctx.db, user.id),
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
          /* The face value the card was bought at, not the shelf's today —
             an edit to the shelf must not change what is in somebody's wallet. */
          `SELECT g.id, g.code, g.status, g.issued_at, g.expires_at, g.used_at, s.brand, s.logo,
                  COALESCE(g.face_minor, s.face_minor) AS face_minor,
                  COALESCE(g.currency, s.currency) AS currency,
                  s.kind, s.how_to_use, v.name AS venue_name
             FROM gift_cards g JOIN gift_card_stock s ON s.id = g.stock_id
             LEFT JOIN venues v ON v.id = s.venue_id
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
      /* Value leaving the platform, so behind a proved address — when mail is
         live and the account is new enough to have been asked. At the route,
         not in `vouchers.issue`, which the till and fixtures also call. */
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
    /* The shelf, priced by rulebook §2.1 (100 pts = 1 zł, derived from the
       face value — the stored `points_cost` is ignored) and with
       `left_this_month` from the §9.4 pool. Same row shape as before plus that
       one field, so a reader of the old array keeps working.

       `?country=` narrows it to one market's cards — Polish brand codes or
       Uzbek venue cards — which is how the website asks. Without it the shelf
       is every country's, exactly what the phone app has always been sent. */
    handler: async (ctx) =>
      await vouchers.giftCardShelf(ctx.db, ctx.at, { country: qStr(ctx, 'country')?.toUpperCase() ?? null }),
  },
  {
    method: 'POST',
    pattern: '/v1/wallet/gift-cards/:id/used',
    auth: 'user',
    /* "I've used it" — the code was spent at the brand or the venue, which is
       a till this server never sees, so the holder is the one who can say. */
    handler: async (ctx) => {
      await giftCards.markUsed(ctx.db, {
        cardId: ctx.params.id,
        by: 'player',
        userId: actor(ctx).user.id,
        at: ctx.at,
      });
      return { ok: true };
    },
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
      /* Who may buy, and the pool, are the operator's gift-card policy
         (`giftPolicy.ts`), which `redeemGiftCard` reads itself. */
      return await vouchers.redeemGiftCard(ctx.db, {
        userId: user.id,
        stockId: str(ctx.body, 'stockId'),
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
    handler: async (ctx) => await checkin.checkIn(ctx.db, { userId: actor(ctx).user.id, at: ctx.at }),
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
        /*
         * **Today's featured game, as one `gameType`, resolved for this account.**
         *
         * The client had been deciding this itself and in two places by two
         * different rules — one off the day number modulo the number of cards, one
         * off the daily word — so two screens could name different games on the
         * same day and neither matched the game the ×1.5 was actually paid on.
         * That is a question with one answer and it belongs to whoever pays the
         * bonus, which is this server.
         *
         * The local quiz is the reason it cannot be computed from a rotation alone:
         * `DAILY_GAME_POOL` holds `['poland', 'uzbekistan']` as **one** slot, and a
         * client cannot pick between them without knowing the account's country.
         * `featuredGameFor` resolves it, so an Uzbek account is never told to play
         * the Poland quiz.
         */
        featuredGame: await games.featuredGameFor(ctx.db, user.id, ctx.at),
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
        /* Which Word Builder list, separately from the reader's language —
           see `wordList` on `startSession`. Two lower-case letters or nothing:
           it is matched against `word_bank.language` and never trusted further. */
        wordList:
          typeof ctx.body.wordList === 'string' && /^[a-z]{2}$/.test(ctx.body.wordList)
            ? ctx.body.wordList
            : undefined,
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
     * Attach an invite code after sign-up — once, before the first confirmed
     * visit, never your own, never in a circle. See `social.redeem`.
     *
     * Bounded per account because the code space is small enough to walk: a
     * loop of guesses here would be a loop of strangers' first names.
     */
    method: 'POST',
    pattern: '/v1/referrals/redeem',
    auth: 'user',
    limit: { perHour: CONFIG.limits.referralRedeemPerHour, by: 'account' },
    handler: async (ctx) =>
      await social.redeem(ctx.db, { userId: actor(ctx).user.id, code: str(ctx.body, 'code'), at: ctx.at }),
  },
  {
    /**
     * Who a code belongs to — "Marta K. invited you" — for the website's
     * `/i/:code` page and the app's confirm screen, both of which are shown
     * before anybody has an account. A short name and the offer; bounded per
     * connection for the reason `redeem` is bounded at all.
     */
    method: 'GET',
    pattern: '/v1/referrals/codes/:code',
    auth: 'none',
    limit: { perHour: CONFIG.limits.referralLookupPerHour, by: 'connection' },
    handler: async (ctx) => await social.lookup(ctx.db, ctx.params.code),
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
      const platform = oneOf(ctx.body, 'platform', ['fcm', 'apns', 'web'] as const);
      const token = str(ctx.body, 'token');
      /* A web token is the browser's `PushSubscription` as JSON, and the drain
         will POST to its endpoint — so it is checked here, where a bad one is
         the client's mistake, rather than failing quietly every evening. */
      if (platform === 'web' && !parseSubscription(token)) {
        throw new DomainError('validation_failed', 'token must be a browser push subscription', { field: 'token' });
      }
      /* On conflict the row moves to *this* user: a browser has one
         subscription per site, and on a shared computer the person who just
         switched the reminder on is the person it should reach — not whoever
         subscribed in that browser before them. */
      await ctx.db.run(
        `INSERT INTO push_tokens (id, user_id, platform, token, created_at, timezone)
         VALUES ($i, $u, $p, $t, $at, $z)
         ON CONFLICT (token) DO UPDATE
           SET revoked_at = NULL, user_id = excluded.user_id, created_at = excluded.created_at,
               timezone = COALESCE(excluded.timezone, push_tokens.timezone)`,
        {
          i: `ptk_${user.id}_${Date.now()}`,
          u: user.id,
          p: platform,
          t: token,
          at: ctx.at,
          z: reminders.validZone(ctx.body.timezone),
        },
      );
      return { ok: true };
    },
  },
  {
    method: 'GET',
    pattern: '/v1/push/web-key',
    auth: 'none',
    /* The VAPID public key a browser subscribes with — public by definition —
       or `null` while browser push is off on this server, which the site
       draws as a sentence rather than as a switch that cannot work. */
    handler: async () => ({ publicKey: push.webPublicKey() }),
  },
  {
    method: 'GET',
    pattern: '/v1/me/notification-prefs',
    auth: 'user',
    handler: async (ctx) => await reminders.kindPrefs(ctx.db, actor(ctx).user.id),
  },
  {
    method: 'PATCH',
    pattern: '/v1/me/notification-prefs',
    auth: 'user',
    handler: async (ctx) => {
      const patch: Partial<reminders.KindPrefs> = {};
      for (const key of ['dailyGameReminder', 'energyFull', 'referralReward', 'streakAtRisk'] as const) {
        if (ctx.body[key] !== undefined) patch[key] = bool(ctx.body, key);
      }
      return await reminders.setKindPrefs(ctx.db, actor(ctx).user.id, patch, ctx.at);
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
