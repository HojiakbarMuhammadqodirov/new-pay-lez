/**
 * The games routes that arrived with the points rulebook, kept beside
 * `consumer.ts` rather than inside it so they could be added without reopening
 * the file the rest of the consumer surface lives in. They are the same
 * surface: `/v1/games/...`, `auth: 'user'`, the domain in `domain/games.ts`.
 */
import * as games from '../../domain/games.ts';
import { CONFIG } from '../../config.ts';
import { actor } from '../input.ts';
import type { Route } from '../router.ts';

export const gameRoutes: Route[] = [
  {
    /**
     * §3: give up a round. Energy was spent when it started; a round abandoned
     * inside its first `energyRefundWithinSeconds` gets it back, once a day.
     *
     * `{ sessionId, refunded, energy: { energy, max, nextAt } }`. Idempotent: a
     * repeat on a round already abandoned reports what happened the first time
     * and changes nothing. A finished round is `invalid_state`.
     */
    method: 'POST',
    pattern: '/v1/games/sessions/:id/abandon',
    auth: 'user',
    idempotent: true,
    /* The same ceiling as starting a round: there cannot be more abandons than
       starts, so a lower one would only refuse an abandon somebody is owed. */
    limit: { perHour: CONFIG.limits.gameStartPerHour, by: 'account' },
    handler: async (ctx) =>
      await games.abandonSession(ctx.db, {
        sessionId: ctx.params.id,
        userId: actor(ctx).user.id,
        at: ctx.at,
      }),
  },
];
