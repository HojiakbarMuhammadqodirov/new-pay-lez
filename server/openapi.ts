/**
 * The OpenAPI document, generated from the route table.
 *
 * `npm run openapi` writes `server/openapi.json`. It is generated rather than
 * hand-written for one reason: a hand-written spec is a second description of
 * the API, and a second description of anything is a thing that goes out of date
 * without anybody noticing. The paths, the methods and the auth requirement come
 * from `allRoutes` — the same array the server dispatches on — so an endpoint
 * cannot exist without appearing here, and one that is deleted disappears.
 *
 * What *is* hand-written is the interesting half: request and response shapes for
 * the endpoints a client actually builds against. Those live in `DOCS` below,
 * keyed by `METHOD /pattern`. An endpoint with no entry still appears, with its
 * path, its method and its security — enough to know it is there, not enough to
 * generate a typed client for. That asymmetry is deliberate: the consumer and
 * partner-companion surfaces are documented in full because a mobile app is
 * built from them; the desktop-only admin routes are listed because pretending
 * they do not exist would be worse than describing them thinly.
 *
 * Emitted as JSON rather than YAML because this repo has no YAML writer and
 * every generator reads JSON. `openapi-generator`, `swagger-codegen` and
 * `dart-openapi-generator` all take it as-is.
 */
import { writeFileSync } from 'node:fs';
import { CONFIG } from './config.ts';
import { allRoutes } from './http/routes/index.ts';
import type { Auth, Route } from './http/router.ts';

type Schema = Record<string, unknown>;

const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const arrayOf = (schema: Schema): Schema => ({ type: 'array', items: schema });

/** A minor-unit amount. Its own type so no client ever renders it as major. */
const minor = (description: string): Schema => ({
  type: 'integer',
  format: 'int64',
  description: `${description} **in minor units** (grosze). 14200 is 142,00 zł.`,
});

const str = (description?: string): Schema => ({ type: 'string', ...(description ? { description } : {}) });
const int = (description?: string): Schema => ({ type: 'integer', ...(description ? { description } : {}) });
const bool = (description?: string): Schema => ({ type: 'boolean', ...(description ? { description } : {}) });
const iso = (description: string): Schema => ({ type: 'string', format: 'date-time', description });

interface Doc {
  summary: string;
  description?: string;
  tags: string[];
  /** Property names → schema, for a JSON body. */
  body?: Record<string, Schema>;
  required?: string[];
  response?: Schema;
  query?: Array<{ name: string; description: string; schema?: Schema }>;
  /** Documented failure modes beyond the generic ones. */
  errors?: Array<[number, string]>;
}

/* ══════════════════════════════════════════════════════════ the schemas ══ */

const SCHEMAS: Record<string, Schema> = {
  Error: {
    type: 'object',
    description:
      'Every failure. `code` is a closed set (see `domain/errors.ts`) and is what a ' +
      'client branches on; `message` is for a human and may change.',
    properties: {
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: {
            type: 'string',
            enum: [
              'bad_request', 'invalid_amount', 'invalid_state', 'validation_failed',
              'unauthenticated', 'forbidden', 'not_verified', 'entitlement_required',
              'consent_required', 'not_found', 'conflict', 'already_used', 'expired',
              'insufficient_points', 'budget_exhausted', 'cap_reached', 'no_lives',
              'daily_cap', 'quota_exceeded', 'quiet_hours', 'invalid_trigger',
              'replay_detected', 'rate_limited', 'internal',
            ],
          },
          message: str(),
          field: str('Present on `validation_failed`: which input was wrong.'),
        },
      },
      requestId: str('Echoed in the `x-request-id` header. Quote it in a support ticket.'),
    },
  },

  Session: {
    type: 'object',
    properties: {
      token: str('Bearer token. Also set as an HttpOnly cookie on the web surface.'),
      roles: arrayOf({ type: 'string', enum: ['consumer', 'partner_owner', 'manager', 'admin'] }),
      mode: { type: 'string', enum: ['consumer', 'partner', 'admin'] },
      user: {
        type: 'object',
        properties: { id: str(), name: str(), email: { type: 'string', nullable: true } },
      },
    },
  },

  Me: {
    type: 'object',
    properties: {
      user: {
        type: 'object',
        properties: {
          id: str(),
          email: { type: 'string', nullable: true },
          name: str(),
          language: str('The app language they chose. Drives every localised response.'),
          city: { type: 'string', nullable: true },
          trustTier: int('0–2. New accounts get lower caps (§13).'),
          leaderboardOptIn: bool(),
          referralCode: { type: 'string', nullable: true },
          createdAt: iso('Account age; what "newcomer" targeting is derived from.'),
        },
      },
      roles: arrayOf(str()),
      mode: str(),
      points: int('The balance, summed from the ledger rather than read from a cache.'),
      plan: { type: 'object', properties: { code: str(), name: str(), audience: str() } },
      entitlements: {
        type: 'object',
        additionalProperties: str(),
        description:
          'Resolved server-side from the active plan. Ask what the account is entitled ' +
          'to, never what it paid. Keys: daily_lives, points_multiplier, exclusive_deals, ' +
          'gift_card_priority, points_expiry_months.',
      },
      venues: arrayOf({ type: 'object' }),
    },
  },

  Venue: {
    type: 'object',
    properties: {
      id: str(),
      name: str(),
      category: str(),
      subcategory: { type: 'string', nullable: true },
      city: str(),
      address: { type: 'string', nullable: true },
      lat: { type: 'number', nullable: true },
      lng: { type: 'number', nullable: true },
      currency: str(),
      priceRange: { type: 'string', nullable: true },
      imageUrl: { type: 'string', nullable: true },
      rating: { type: 'number', nullable: true },
      reviewCount: int(),
      phone: { type: 'string', nullable: true },
      acceptsVouchers: bool(),
      pointsPerScan: int('What a qualifying scan pays here, before any plan multiplier.'),
    },
  },

  VenueDetail: {
    type: 'object',
    description:
      'Everything the venue screen shows: the listing, its links (only the ones the ' +
      'partner filled in), opening hours, the tier ladder, live deals, and — when ' +
      'signed in — this customer’s stamp cards and rewards here.',
    properties: {
      venue: ref('Venue'),
      links: arrayOf({ type: 'object', properties: { kind: str(), value: str() } }),
      hours: arrayOf({
        type: 'object',
        properties: {
          weekday: int('0 = Monday.'),
          opens_min: { type: 'integer', nullable: true, description: 'Minutes past local midnight.' },
          closes_min: { type: 'integer', nullable: true },
          closed: int(),
        },
      }),
      description: { type: 'string', nullable: true },
      tiers: arrayOf(ref('Tier')),
      deals: arrayOf(ref('DealCard')),
      stampCards: arrayOf(ref('StampProgress')),
      rewards: arrayOf(ref('Reward')),
    },
  },

  Tier: {
    type: 'object',
    properties: {
      id: str(),
      discountPct: int(),
      pointsCost: int(),
      maxDiscountMinor: minor('The per-voucher cap'),
      estimateMinor: minor('What this tier is expected to be worth on an average bill'),
      estimatedRemaining: int('An estimate of how many this budget could still fund. **Not a cap** — enforcement is on money at redemption.'),
      available: bool('False when the venue’s budget has degraded this tier out (§4.4). The lowest tier never switches off.'),
    },
  },

  DealCard: {
    type: 'object',
    properties: {
      id: str(),
      venueId: { type: 'string', nullable: true },
      partnerName: { type: 'string', nullable: true },
      city: { type: 'string', nullable: true },
      category: { type: 'string', nullable: true },
      discountText: { type: 'string', nullable: true },
      imageUrl: { type: 'string', nullable: true },
      validTo: { type: 'string', nullable: true },
      pointsRequired: int(),
      copy: {
        type: 'object',
        properties: {
          title: str(),
          description: str(),
          terms: str(),
          language: str('The language actually used, which may not be the one asked for.'),
        },
      },
      claimable: bool(),
    },
  },

  StampProgress: {
    type: 'object',
    properties: {
      campaign: { type: 'object' },
      stamps: int(),
      required: int(),
      cycles: int(),
    },
  },

  Reward: {
    type: 'object',
    properties: {
      id: str(),
      venue_id: str(),
      label: str(),
      code: str(),
      status: { type: 'string', enum: ['available', 'redeemed', 'expired', 'cancelled'] },
      earned_at: str(),
      expires_at: str(),
    },
  },

  Voucher: {
    type: 'object',
    properties: {
      id: str(),
      venue_id: str(),
      discount_pct: int(),
      max_discount_minor: minor('The cap on this voucher'),
      points_spent: int(),
      code: str(),
      status: { type: 'string', enum: ['active', 'redeemed', 'expired', 'cancelled'] },
      issued_at: str(),
      expires_at: str(),
      redeemed_at: { type: 'string', nullable: true },
    },
  },

  Wallet: {
    type: 'object',
    properties: {
      points: int(),
      expiringSoon: arrayOf({
        type: 'object',
        properties: { expires_at: str(), points: int() },
        description: 'Points expire 12 months after they are earned, oldest spent first.',
      }),
      vouchers: arrayOf(ref('Voucher')),
      rewards: arrayOf(ref('Reward')),
      giftCards: arrayOf({ type: 'object' }),
      stampCards: arrayOf({
        type: 'object',
        description:
          'Cards this customer has started, across every venue. A paused campaign’s card is still listed — the stamps already collected stay valid.',
        properties: {
          campaign_id: str(),
          venue_id: str(),
          venue_name: str(),
          label: str(),
          stamps: int(),
          required: int(),
          cycles: int(),
          status: { type: 'string', enum: ['active', 'paused'] },
        },
      }),
    },
  },

  Transaction: {
    type: 'object',
    description: 'The amount-capture record. `pending` until a cashier confirms it.',
    properties: {
      id: str(),
      venue_id: str(),
      user_id: str(),
      trigger_type: { type: 'string', enum: ['qr', 'nfc', 'manual'] },
      intent: { type: 'string', enum: ['earn', 'voucher_redeem', 'reward_redeem'] },
      status: { type: 'string', enum: ['pending', 'committed', 'cancelled', 'reversed'] },
      amount_minor: { type: 'integer', nullable: true, description: 'Null until step 3 of the gate.' },
      currency: str(),
      amount_entered_by: {
        type: 'string',
        enum: ['cashier', 'customer'],
        description:
          'Who may call `/amount`. Always `cashier` when a discount is involved (§3.4).',
      },
      opened_at: str(),
      confirmed_at: { type: 'string', nullable: true },
    },
  },

  Receipt: {
    type: 'object',
    description: 'What the commit granted. The only response that means value moved.',
    properties: {
      transaction: ref('Transaction'),
      pointsGranted: int(),
      pointsCapped: int('Points the daily cap trimmed off. Usually 0; show it if not.'),
      discountMinor: minor('The discount actually applied'),
      stamped: bool(),
      reward: { nullable: true, allOf: [ref('Reward')] },
      visitCounted: bool('False on a second scan the same day — still a sale, not a second visit.'),
      balance: int(),
      nextTier: {
        nullable: true,
        type: 'object',
        properties: { discountPct: int(), pointsNeeded: int() },
        description: '“You’re 60 from 10% off here.” Computed from the real balance.',
      },
    },
  },

  Round: {
    type: 'object',
    description:
      'A started game. `content` never contains the answers — the server holds them ' +
      'and judges each event as it arrives.',
    properties: {
      sessionId: str(),
      gameType: {
        type: 'string',
        enum: ['flags', 'capitals', 'brain', 'poland', 'word_builder', 'memory_match', 'flight'],
      },
      content: {
        type: 'object',
        description:
          'Shape depends on the game. Quizzes: `{questions:[{index,prompt,options}], ' +
          'mistakesAllowed, perCorrect}` — for `flags`, `prompt` is an ISO country code ' +
          'and the flag emoji is built from it. Word Builder: `{words:[{index,length,' +
          'tier,letters,hint}]}`. Memory Match: `{cards,pairs}` — the layout stays on ' +
          'the server. Flight: `{target}`.',
      },
      livesLeft: int(),
    },
  },

  EventResult: {
    type: 'object',
    properties: {
      correct: { type: 'boolean', nullable: true },
      answer: { nullable: true, description: 'Only ever the answer to the question just asked.' },
      accepted: bool('False when this `seq` was already recorded — a retry, not a second answer.'),
    },
  },

  Finish: {
    type: 'object',
    properties: {
      score: int('Computed server-side from the recorded events. Never sent by the client.'),
      capped: int(),
      correct: int(),
      answered: int(),
      won: bool(),
      streak: int(),
      freezes: int('Streak freezes held. One is earned every 7 days, 2 max.'),
      livesLeft: int(),
      balance: int(),
      nearest: {
        nullable: true,
        type: 'object',
        properties: { venueId: str(), venueName: str(), discountPct: int(), pointsNeeded: int() },
      },
    },
  },

  Board: {
    type: 'object',
    properties: {
      scope: str(),
      week: str('ISO week, `2026-W33`.'),
      rows: arrayOf({
        type: 'object',
        properties: {
          rank: int(),
          userId: str(),
          name: str('Display name only. Never a real name.'),
          avatar: { type: 'string', nullable: true },
          points: int(),
          isYou: bool(),
        },
      }),
      you: { nullable: true, type: 'object', description: 'Present even when you are not listed.' },
      hidden: bool('True when you are playing but have not opted into the public listing.'),
    },
  },

  Notification: {
    type: 'object',
    properties: {
      id: str(),
      kind: str(),
      mode: { type: 'string', enum: ['consumer', 'partner'] },
      title: str(),
      body: str(),
      action_url: { type: 'string', nullable: true },
      read_at: { type: 'string', nullable: true },
      created_at: str(),
      delivery: { type: 'string', enum: ['inbox', 'queued', 'sent', 'suppressed', 'failed'] },
    },
  },

  Answer: {
    type: 'object',
    description:
      'An assistant reply. Assembled from real records — `grounding` lists the ids it ' +
      'was built from. It never invents a venue, a price or a number.',
    properties: {
      text: str(),
      facts: arrayOf({ type: 'object' }),
      results: arrayOf({ type: 'object' }, ),
      action: { nullable: true, type: 'object', properties: { label: str(), href: str() } },
      grounding: arrayOf(str()),
      empty: bool('True when there was nothing to ground on. Say so; do not fill the gap.'),
    },
  },

  Metric: {
    type: 'object',
    description:
      'An analytics figure that knows what kind of figure it is. Render the label: a ' +
      'counted visit and an estimated sale are different claims.',
    properties: {
      value: { type: 'number', nullable: true },
      kind: { type: 'string', enum: ['counted', 'estimated', 'attributed'] },
      suppressed: bool('True when the cohort was too small to report. `value` is then null — do not render 0.'),
      cohort: int(),
    },
  },

  Budget: {
    type: 'object',
    description: 'A pool has exactly three states and they exhaust it.',
    properties: {
      id: str(),
      period: str('`YYYY-MM`, in the venue’s own timezone.'),
      currency: str(),
      total: minor('Both allocations together'),
      loyalty: ref('Pool'),
      voucher: ref('Pool'),
    },
  },

  Pool: {
    type: 'object',
    properties: {
      allocation: { type: 'string', enum: ['loyalty', 'voucher'] },
      base: minor('The allocation’s share, plus top-ups and rebalances'),
      spent: minor('Discount actually given'),
      reserved: minor('Committed to vouchers and rewards not yet redeemed'),
      available: minor('base − spent − reserved. Never stored; always derived'),
    },
  },

  Guide: {
    type: 'object',
    properties: {
      id: str(),
      venueId: { type: 'string', nullable: true, description: 'Set when this listing is also a Paylez venue.' },
      name: str(),
      category_key: { type: 'string', nullable: true },
      city: { type: 'string', nullable: true },
      address: { type: 'string', nullable: true },
      lat: { type: 'number', nullable: true },
      lng: { type: 'number', nullable: true },
      phone: { type: 'string', nullable: true },
      rating: { type: 'number', nullable: true },
      description: { type: 'string', nullable: true },
      links: arrayOf({ type: 'object', properties: { kind: str(), value: str() } }),
    },
  },
};

/* ═══════════════════════════════════════════════ the documented endpoints ══ */

const DOCS: Record<string, Doc> = {
  /* ── identity ── */
  'POST /v1/auth/signup': {
    summary: 'Create an account',
    description:
      'Records terms and privacy consent with the policy version, mints a referral ' +
      'code, pays the welcome bonus, and — if `provisionalId` is sent — folds the ' +
      'guest identity in so points earned before signing up survive.',
    tags: ['auth'],
    body: {
      email: str(), password: str('At least 6 characters.'), name: str(),
      language: str(), city: str(),
      partner: bool('Grants the partner_owner role. Never grants admin.'),
      referralCode: str('The code of whoever invited them.'),
      provisionalId: str('The guest account to merge in.'),
      device: str('A stable device fingerprint. Used for multi-account detection.'),
      surface: { type: 'string', enum: ['web', 'mobile'] },
    },
    required: ['email', 'password', 'name'],
    response: ref('Session'),
    errors: [[409, 'That address already has an account.']],
  },
  'POST /v1/auth/signin': {
    summary: 'Sign in',
    tags: ['auth'],
    body: { email: str(), password: str(), device: str(), surface: { type: 'string', enum: ['web', 'mobile'] } },
    required: ['email', 'password'],
    response: ref('Session'),
    errors: [[401, 'Wrong email or password — the same answer for both, deliberately.']],
  },
  'POST /v1/auth/guest': {
    summary: 'Mint a provisional identity',
    description:
      'Onboarding lets somebody play before signing up. This returns a device-scoped ' +
      'account that can hold points; pass its id as `provisionalId` to `/signup` and ' +
      'the points survive the merge.',
    tags: ['auth'],
    body: { device: str('A stable device fingerprint.'), surface: { type: 'string', enum: ['web', 'mobile'] } },
    required: ['device'],
    response: {
      type: 'object',
      properties: { token: str(), userId: str(), provisional: bool() },
    },
  },
  'POST /v1/auth/signout': { summary: 'Revoke this session', tags: ['auth'], response: { type: 'object' } },
  'GET /v1/me': { summary: 'Who is signed in, and what they are entitled to', tags: ['me'], response: ref('Me') },
  'PATCH /v1/me': {
    summary: 'Update the profile',
    tags: ['me'],
    body: { name: str(), language: str(), city: str(), avatar: str(), leaderboardOptIn: bool() },
    response: ref('Me'),
  },
  'POST /v1/me/password': {
    summary: 'Change the password',
    description: 'Revokes every other session — that is what somebody is doing this for.',
    tags: ['me'],
    body: { current: str(), next: str() },
    required: ['current', 'next'],
    response: { type: 'object' },
  },
  'POST /v1/me/mode': {
    summary: 'Switch between personal and business mode',
    description:
      'One identity serves both. The mode lives on the session, and notifications are ' +
      'tagged by it so an owner in personal mode is not buzzed with business alerts.',
    tags: ['me'],
    body: { mode: { type: 'string', enum: ['consumer', 'partner', 'admin'] } },
    required: ['mode'],
    response: { type: 'object', properties: { mode: str() } },
  },
  'GET /v1/me/consents': {
    summary: 'What this account has consented to',
    description:
      'Two separate lists. Account consent is the terms; data-sharing is a per-venue, ' +
      'revocable grant that lets one venue see this customer individually.',
    tags: ['me', 'privacy'],
    response: { type: 'object' },
  },
  'POST /v1/me/sharing/{venueId}': {
    summary: 'Share my profile with this venue',
    tags: ['privacy'],
    response: { type: 'object' },
  },
  'DELETE /v1/me/sharing/{venueId}': {
    summary: 'Stop sharing with this venue',
    description: 'Takes effect immediately: every identified endpoint joins on an active grant.',
    tags: ['privacy'],
    response: { type: 'object' },
  },
  'GET /v1/me/export': { summary: 'GDPR export — everything held about this account', tags: ['privacy'], response: { type: 'object' } },
  'DELETE /v1/me': {
    summary: 'GDPR erasure',
    description: 'Anonymises rather than deleting, so the ledger stays verifiable. Requires the account email as confirmation.',
    tags: ['privacy'],
    body: { confirmEmail: str() },
    required: ['confirmEmail'],
    response: { type: 'object' },
  },

  /* ── catalogue ── */
  'GET /v1/venues': {
    summary: 'Browse venues',
    tags: ['catalogue'],
    query: [
      { name: 'city', description: 'Filter by city.' },
      { name: 'category', description: 'Filter by category.' },
      { name: 'limit', description: 'Default 50.', schema: int() },
    ],
    response: arrayOf(ref('Venue')),
  },
  'GET /v1/venues/{id}': { summary: 'Venue detail', tags: ['catalogue'], response: ref('VenueDetail') },
  'GET /v1/deals': {
    summary: 'Browse live deals',
    description:
      'Already filtered by targeting — day, hour, language and audience segment, all in ' +
      'the venue’s own timezone. A deal you cannot claim is not returned rather than ' +
      'greyed out, and a deal with no copy in the reader’s language is skipped.',
    tags: ['deals'],
    query: [
      { name: 'city', description: 'Defaults to the account’s city.' },
      { name: 'category', description: 'Filter by category.' },
      { name: 'limit', description: 'Default 50.', schema: int() },
    ],
    response: arrayOf(ref('DealCard')),
  },
  'GET /v1/deals/{id}': { summary: 'One deal, with why it is or is not claimable', tags: ['deals'], response: { type: 'object' } },
  'POST /v1/deals/{id}/events': {
    summary: 'Record a funnel event',
    description:
      'Seen and Opened only. A **claim** is written by the gate from a confirmed scan — ' +
      'it is deliberately not something a client can post, because the claim rate is ' +
      'the number the whole partner dashboard argues from.',
    tags: ['deals'],
    body: {
      kind: { type: 'string', enum: ['impression', 'open'] },
      source: str('`home_widget`, `list`, `push`, `assistant`.'),
      pushId: str('Set when the open came from a push, for attribution.'),
    },
    required: ['kind'],
    response: { type: 'object' },
  },

  /* ── wallet ── */
  'GET /v1/wallet': { summary: 'Points, vouchers, rewards, gift cards', tags: ['wallet'], response: ref('Wallet') },
  'GET /v1/wallet/history': {
    summary: 'The points ledger for this account',
    tags: ['wallet'],
    query: [
      { name: 'limit', description: 'Default 50.', schema: int() },
      { name: 'before', description: 'Cursor: return entries older than this timestamp.' },
    ],
    response: arrayOf({ type: 'object' }),
  },
  'POST /v1/vouchers': {
    summary: 'Convert points into a voucher',
    description:
      'Reserves the estimated cost against the venue’s budget, then spends the points. ' +
      'Send an `Idempotency-Key`.',
    tags: ['wallet'],
    body: { venueId: str(), tierId: str() },
    required: ['venueId', 'tierId'],
    response: ref('Voucher'),
    errors: [
      [409, '`insufficient_points`, or `budget_exhausted` when the venue has degraded this tier out.'],
    ],
  },
  'GET /v1/gift-cards': { summary: 'The gift-card catalogue', tags: ['wallet'], response: arrayOf({ type: 'object' }) },
  'POST /v1/gift-cards': {
    summary: 'Redeem points for a gift card',
    tags: ['wallet'],
    body: { stockId: str() },
    required: ['stockId'],
    response: { type: 'object', properties: { id: str(), code: str(), points: int() } },
    errors: [[403, '`entitlement_required` on priority-only stock.']],
  },

  /* ── the gate ── */
  'POST /v1/gate/scan': {
    summary: 'Step 1–2: scan a venue QR and open a pending transaction',
    description:
      'The QR is signed, single-use and lives 90 seconds. Nothing is granted here. Send ' +
      'an `Idempotency-Key` so a dropped response does not burn a second code.',
    tags: ['gate'],
    body: {
      token: str('The whole string encoded in the QR.'),
      intent: { type: 'string', enum: ['earn', 'voucher_redeem', 'reward_redeem'] },
      intentRef: str('The voucher or reward id, for the two redemption intents.'),
      dealId: str('Set when this scan is claiming a deal the customer opened.'),
      clientTs: str('When the scan really happened, for queued offline events.'),
    },
    required: ['token'],
    response: ref('Transaction'),
    errors: [
      [409, '`conflict` — this customer already has a pending transaction at this venue.'],
      [422, '`invalid_trigger` (forged or unknown) or `replay_detected` (already used).'],
    ],
  },
  'POST /v1/gate/tap': {
    summary: 'Step 1–2: an NFC tap',
    description:
      'The two parameters from the tag’s own URL. The counter must be strictly higher ' +
      'than the last one seen for that tag, which is what rejects a replayed URL.',
    tags: ['gate'],
    body: {
      picc: str('`picc_data` from the tag URL — 32 hex characters.'),
      cmac: str('`cmac` from the tag URL — 16 hex characters.'),
      intent: { type: 'string', enum: ['earn', 'voucher_redeem', 'reward_redeem'] },
      intentRef: str(),
      dealId: str(),
      clientTs: str(),
    },
    required: ['picc', 'cmac'],
    response: ref('Transaction'),
  },
  'POST /v1/gate/manual': {
    summary: 'Step 1–2: opened by staff, for a customer with a flat phone',
    tags: ['gate', 'partner'],
    body: { venueId: str(), userId: str(), intent: { type: 'string', enum: ['earn', 'voucher_redeem', 'reward_redeem'] }, intentRef: str() },
    required: ['venueId', 'userId'],
    response: ref('Transaction'),
  },
  'GET /v1/gate/transactions/{id}': {
    summary: 'Poll a pending transaction',
    description: 'Either party may read it. This is how the customer’s phone sees the cashier confirm.',
    tags: ['gate'],
    response: ref('Transaction'),
  },
  'POST /v1/gate/transactions/{id}/amount': {
    summary: 'Step 3: enter the amount',
    description:
      'Who may call this is `amount_entered_by` on the transaction. Call it again to ' +
      'correct a typo — correcting is the intended path, cancelling is not.',
    tags: ['gate'],
    body: { amountMinor: minor('The bill') },
    required: ['amountMinor'],
    response: ref('Transaction'),
    errors: [[400, '`invalid_amount` — zero, negative, or above the venue’s ceiling.']],
  },
  'POST /v1/gate/transactions/{id}/confirm': {
    summary: 'Steps 4–5: the cashier confirms, and everything is granted',
    description:
      'Partner-side only, and the only call in the API that grants anything. Points, ' +
      'stamps, the discount, the deal claim and the referral payout all commit together ' +
      'or none of them do.',
    tags: ['gate', 'partner'],
    response: ref('Receipt'),
    errors: [
      [403, 'Only venue staff may confirm.'],
      [409, '`expired` — the pending transaction timed out after 15 minutes.'],
    ],
  },
  'POST /v1/gate/transactions/{id}/cancel': {
    summary: 'Abandon a pending transaction',
    tags: ['gate'],
    body: { reason: str() },
    response: ref('Transaction'),
  },
  'POST /v1/gate/transactions/{id}/dispute': {
    summary: 'Flag a committed transaction (72-hour window)',
    tags: ['gate', 'partner'],
    body: { note: str() },
    required: ['note'],
    response: { type: 'object' },
  },
  'POST /v1/venues/{id}/qr': {
    summary: 'Mint a QR for the venue’s screen',
    description: 'Partner-side. Re-mint before `expiresAt`; the code is single-use.',
    tags: ['gate', 'partner'],
    response: {
      type: 'object',
      properties: { token: str(), expiresAt: str(), ttlSeconds: int() },
    },
  },
  'GET /v1/venues/{id}/pending': {
    summary: 'The confirmation queue at this venue',
    tags: ['gate', 'partner'],
    response: arrayOf(ref('Transaction')),
  },

  /* ── games ── */
  'GET /v1/games/state': {
    summary: 'Lives, streak, freezes, accuracy, today’s shared word',
    description: 'Lives reset at local midnight. The client’s view of them is advisory; this is the truth.',
    tags: ['games'],
    response: { type: 'object' },
  },
  'POST /v1/games/sessions': {
    summary: 'Start a round',
    description:
      'Refuses with `no_lives` when the tank is empty. A life is spent on a **loss**, ' +
      'not on starting.',
    tags: ['games'],
    body: {
      gameType: {
        type: 'string',
        enum: ['flags', 'capitals', 'brain', 'poland', 'word_builder', 'memory_match', 'flight'],
      },
    },
    required: ['gameType'],
    response: ref('Round'),
    errors: [[409, '`no_lives` — no lives left today.']],
  },
  'POST /v1/games/sessions/{id}/events': {
    summary: 'Report one move, and be told whether it was right',
    description:
      'Quizzes send `{index, choice}`. Word Builder sends `{index, guess}`, or ' +
      '`kind:"hint"` with `{index, position}` to reveal one letter. Memory Match sends ' +
      '`{a, b}` — two card positions. `seq` must increase; a repeat is accepted as a ' +
      'retry and does not count twice.',
    tags: ['games'],
    body: {
      seq: int('0-based, monotonic within the session.'),
      kind: str('`answer` by default; `hint` for Word Builder.'),
      payload: { type: 'object' },
    },
    required: ['seq', 'payload'],
    response: ref('EventResult'),
  },
  'POST /v1/games/sessions/{id}/finish': {
    summary: 'Finish the round and bank it',
    description:
      'The score is computed from the events the server recorded — nothing the client ' +
      'totals is trusted. `report` carries `{cleared}` for the flight, which is the one ' +
      'game with no answer key and is clamped instead.',
    tags: ['games'],
    body: { report: { type: 'object', description: 'Flight only: `{ "cleared": 14 }`.' } },
    response: ref('Finish'),
  },

  /* ── social ── */
  'GET /v1/referrals': { summary: 'My code, and how the invites are going', tags: ['social'], response: { type: 'object' } },
  'GET /v1/leaderboard/city': {
    summary: 'The city weekly board',
    description:
      'Everyone is ranked; only opted-in players are listed. If you have not opted in ' +
      'you still see your own rank, with `hidden: true`.',
    tags: ['social'],
    query: [{ name: 'city', description: 'Defaults to the account’s city.' }],
    response: ref('Board'),
  },
  'GET /v1/leaderboard/friends': { summary: 'The friends board', tags: ['social'], response: ref('Board') },
  'POST /v1/friends': { summary: 'Connect with another player', tags: ['social'], body: { userId: str() }, required: ['userId'], response: { type: 'object' } },

  /* ── notifications ── */
  'GET /v1/notifications': {
    summary: 'The inbox for the session’s current mode',
    tags: ['notifications'],
    query: [{ name: 'limit', description: 'Default 50.', schema: int() }],
    response: {
      type: 'object',
      properties: { unread: int(), items: arrayOf(ref('Notification')) },
    },
  },
  'POST /v1/notifications/read': { summary: 'Mark as read', tags: ['notifications'], body: { ids: arrayOf(str()) }, required: ['ids'], response: { type: 'object' } },
  'POST /v1/push-tokens': {
    summary: 'Register a device for push',
    tags: ['notifications'],
    body: { platform: { type: 'string', enum: ['fcm', 'apns', 'web'] }, token: str() },
    required: ['platform', 'token'],
    response: { type: 'object' },
  },

  /* ── assistant ── */
  'POST /v1/assistant/sessions': { summary: 'Open a conversation', tags: ['assistant'], response: { type: 'object', properties: { sessionId: str() } } },
  'POST /v1/assistant/ask': {
    summary: 'Ask the assistant',
    description:
      'Two jobs: find things in the catalogue, and explain the account’s own data. ' +
      'Returns structured results, not prose — render the cards, not the sentence alone.',
    tags: ['assistant'],
    body: { text: str(), sessionId: str('Keeps the thread; optional.') },
    required: ['text'],
    response: ref('Answer'),
  },
  'GET /v1/assistant/sessions/{id}': { summary: 'The transcript', tags: ['assistant'], response: arrayOf({ type: 'object' }) },

  /* ── partner companion (the mobile dashboard) ── */
  'GET /v1/partner/venues': { summary: 'Venues this account owns', tags: ['partner'], response: arrayOf({ type: 'object' }) },
  'GET /v1/partner/venues/{id}/today': {
    summary: 'Today: customers, sales, what needs confirming',
    tags: ['partner'],
    response: { type: 'object' },
  },
  'GET /v1/partner/venues/{id}/overview': {
    summary: 'The period’s findings, the budget, and the cohort floors',
    tags: ['partner'],
    query: [{ name: 'period', description: '`YYYY-MM`. Defaults to the current month.' }],
    response: { type: 'object' },
  },
  'GET /v1/partner/venues/{id}/analytics': {
    summary: 'The full analytics set',
    description:
      'Cohorts, ROI and benchmarks are a paid-tier entitlement and are **absent** from ' +
      'the response rather than nulled, so a client renders what it has.',
    tags: ['partner'],
    query: [{ name: 'period', description: '`YYYY-MM`.' }],
    response: { type: 'object' },
  },
  'GET /v1/partner/venues/{id}/budget': {
    summary: 'The two pools, the tier ladder, and the rebalance hint',
    tags: ['partner'],
    response: ref('Budget'),
  },
  'POST /v1/partner/venues/{id}/budget/topup': {
    summary: 'Urgent lever: add money to a pool',
    tags: ['partner'],
    body: { allocation: { type: 'string', enum: ['loyalty', 'voucher'] }, amountMinor: minor('How much to add'), note: str() },
    required: ['allocation', 'amountMinor'],
    response: ref('Budget'),
  },
  'POST /v1/partner/deals/{id}/status': {
    summary: 'Urgent lever: pause or resume a deal',
    tags: ['partner'],
    body: { status: { type: 'string', enum: ['live', 'paused', 'archived'] } },
    required: ['status'],
    response: { type: 'object' },
  },
  'POST /v1/partner/deals/{id}/extend': {
    summary: 'Urgent lever: push a deal’s end date out',
    tags: ['partner'],
    body: { validTo: iso('The new end of the window') },
    required: ['validTo'],
    response: { type: 'object' },
  },
  'GET /v1/partner/venues/{id}/campaigns': { summary: 'Stamp campaigns and how they are doing', tags: ['partner'], response: arrayOf({ type: 'object' }) },
  'GET /v1/partner/venues/{id}/deals': { summary: 'This venue’s deals, with funnel and translation state', tags: ['partner'], response: arrayOf({ type: 'object' }) },

  /* ── content ── */
  'GET /v1/guide/categories': { summary: 'Guidebook categories and subcategories', tags: ['guide'], query: [{ name: 'country', description: 'Default `PL`.' }], response: arrayOf({ type: 'object' }) },
  'GET /v1/guide/services': {
    summary: 'The service directory',
    tags: ['guide'],
    query: [
      { name: 'country', description: 'Default `PL`.' },
      { name: 'city', description: 'Filter by city.' },
      { name: 'category', description: 'Filter by category key.' },
      { name: 'limit', description: 'Default 100.', schema: int() },
    ],
    response: arrayOf(ref('Guide')),
  },
  'GET /v1/guide/articles': { summary: 'Article headings (bodies are fetched one at a time)', tags: ['guide'], response: arrayOf({ type: 'object' }) },
  'GET /v1/guide/articles/{id}': { summary: 'One article, with its body', tags: ['guide'], response: { type: 'object' } },
  'GET /v1/news': { summary: 'The news feed', tags: ['guide'], response: arrayOf({ type: 'object' }) },
  'GET /v1/community': { summary: 'The community directory', tags: ['guide'], response: arrayOf({ type: 'object' }) },
  'GET /v1/fx': {
    summary: 'Exchange rates, and an optional conversion',
    description: 'One anchor currency; every cross rate is `to.rate / from.rate` and exact.',
    tags: ['guide'],
    query: [
      { name: 'from', description: 'ISO currency code.' },
      { name: 'to', description: 'ISO currency code.' },
      { name: 'amount', description: 'Amount in `from`, as a decimal.', schema: { type: 'number' } },
    ],
    response: { type: 'object' },
  },
  'POST /v1/feedback': { summary: 'Send feedback', tags: ['guide'], body: { subject: str(), body: str(), rating: int() }, required: ['body'], response: { type: 'object' } },
  'POST /v1/recommendations': { summary: 'Suggest a service for the guidebook', tags: ['guide'], body: { name: str(), city: str(), categoryKey: str() }, required: ['name'], response: { type: 'object' } },

  /* ── billing ── */
  'GET /v1/plans': { summary: 'Available plans and their entitlements', tags: ['billing'], query: [{ name: 'audience', description: '`consumer` or `partner`.' }], response: arrayOf({ type: 'object' }) },
  'GET /v1/me/subscription': { summary: 'The active subscription and what it entitles', tags: ['billing'], response: { type: 'object' } },
  'POST /v1/billing/receipt': {
    summary: 'Validate an app-store purchase',
    description:
      'Send the store receipt, never a plan name. Entitlements are granted only after ' +
      'the receipt validates server-side.',
    tags: ['billing'],
    body: { store: { type: 'string', enum: ['apple', 'google'] }, receipt: str() },
    required: ['store', 'receipt'],
    response: { type: 'object' },
  },
  'POST /v1/billing/checkout': { summary: 'Start a web checkout', tags: ['billing'], body: { planCode: str(), venueId: str(), source: { type: 'string', enum: ['stripe', 'apple', 'google'] } }, required: ['planCode'], response: { type: 'object' } },
  'POST /v1/billing/cancel': { summary: 'Cancel at the end of the period', tags: ['billing'], body: { venueId: str() }, response: { type: 'object' } },

  'GET /v1/health': { summary: 'Liveness', tags: ['meta'], response: { type: 'object' } },
};

/* ═══════════════════════════════════════════════════════════ the emitter ══ */

/** `:id` → `{id}`, and the parameter list that goes with it. */
function pathOf(pattern: string): { path: string; params: string[] } {
  const params: string[] = [];
  const path = pattern
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return segment;
      const name = segment.slice(1);
      params.push(name);
      return `{${name}}`;
    })
    .join('/');
  return { path, params };
}

const AUTH_NOTE: Record<Auth, string> = {
  none: 'Public. A session is still read when one is sent — deals and boards are personalised by it.',
  user: 'Any signed-in account.',
  partner: 'An account with the partner_owner, manager or admin role.',
  admin: 'Admin only. Not part of the mobile surface.',
};

function operationFor(route: Route, doc: Doc | undefined, params: string[]): Schema {
  const responses: Schema = {
    [doc?.response ? '200' : '204']: {
      description: 'Success',
      ...(doc?.response
        ? { content: { 'application/json': { schema: doc.response } } }
        : {}),
    },
  };
  for (const [status, description] of doc?.errors ?? []) {
    responses[String(status)] = {
      description,
      content: { 'application/json': { schema: ref('Error') } },
    };
  }
  if (route.auth !== 'none') {
    responses['401'] = { description: 'Not signed in', content: { 'application/json': { schema: ref('Error') } } };
  }
  responses.default = { description: 'Error', content: { 'application/json': { schema: ref('Error') } } };

  const parameters: Schema[] = params.map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
  for (const q of doc?.query ?? []) {
    parameters.push({ name: q.name, in: 'query', required: false, description: q.description, schema: q.schema ?? { type: 'string' } });
  }
  if (route.idempotent) {
    parameters.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: false,
      description:
        'A key you generate per attempt. Retrying with the same key returns the *stored* ' +
        'response instead of doing the work twice. The same key with a different body is ' +
        'a 409.',
      schema: { type: 'string' },
    });
  }

  return {
    summary: doc?.summary ?? `${route.method} ${route.pattern}`,
    description: [doc?.description, `**Access:** ${AUTH_NOTE[route.auth]}`]
      .filter(Boolean)
      .join('\n\n'),
    operationId: operationId(route),
    tags: doc?.tags ?? [tagFor(route.pattern)],
    ...(parameters.length ? { parameters } : {}),
    ...(doc?.body
      ? {
          requestBody: {
            required: (doc.required ?? []).length > 0,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: doc.body,
                  ...(doc.required?.length ? { required: doc.required } : {}),
                },
              },
            },
          },
        }
      : {}),
    ...(route.auth === 'none' ? {} : { security: [{ bearerAuth: [] }] }),
    responses,
  };
}

/** A stable, readable name for a generated client method. */
function operationId(route: Route): string {
  const body = route.pattern
    .replace(/^\/v1\//, '')
    .split('/')
    .map((segment) => (segment.startsWith(':') ? `By${cap(segment.slice(1))}` : cap(segment)))
    .join('');
  return route.method.toLowerCase() + body;
}

const cap = (value: string) =>
  value.replace(/[^a-z0-9]+(.)?/gi, (_, chr: string | undefined) => (chr ? chr.toUpperCase() : ''))
    .replace(/^./, (chr) => chr.toUpperCase());

function tagFor(pattern: string): string {
  if (pattern.startsWith('/v1/admin')) return 'admin';
  if (pattern.startsWith('/v1/partner')) return 'partner';
  if (pattern.startsWith('/v1/gate')) return 'gate';
  if (pattern.startsWith('/v1/billing')) return 'billing';
  if (pattern.startsWith('/v1/guide') || pattern.startsWith('/v1/legacy')) return 'guide';
  return 'other';
}

export function buildSpec(): Schema {
  const paths: Record<string, Schema> = {};

  for (const route of allRoutes) {
    const { path, params } = pathOf(route.pattern);
    const doc = DOCS[`${route.method} ${path}`];
    const entry = (paths[path] ?? {}) as Record<string, unknown>;
    entry[route.method.toLowerCase()] = operationFor(route, doc, params);
    paths[path] = entry;
  }

  const documented = Object.keys(DOCS).length;

  return {
    openapi: '3.0.3',
    info: {
      title: 'Paylez API',
      version: '1.0.0',
      description: [
        'The Paylez backend, built from the two statements of work in `new-data/`.',
        '',
        'Four rules run through the whole surface and are worth reading before the endpoints:',
        '',
        '1. **The server decides.** Points, discounts and eligibility are computed here. A ' +
          'client displays and requests; it never calculates a reward.',
        '2. **Money is an integer in minor units.** `amountMinor: 14200` is 142,00 zł. ' +
          'Formatting is the client’s job.',
        '3. **Nothing of value exists before it is confirmed.** Every earning and ' +
          'redemption passes the same four-step gate; the commit is the only moment ' +
          'anything is granted.',
        '4. **Send an `Idempotency-Key` on anything that moves value.** A retry then ' +
          'returns the same receipt instead of granting twice.',
        '',
        `${documented} endpoints are documented in full; the rest are listed with their ` +
          'path, method and access level. `GET /v1` returns the live list.',
      ].join('\n'),
      contact: { name: 'Paylez backend', url: 'https://pay-lez.com' },
    },
    servers: [
      { url: `http://${CONFIG.server.host}:${CONFIG.server.port}`, description: 'Local development' },
      { url: 'https://api.pay-lez.com', description: 'Production (when deployed)' },
    ],
    tags: [
      { name: 'auth', description: 'Sign up, sign in, provisional identities.' },
      { name: 'me', description: 'The account, its profile and its mode.' },
      { name: 'privacy', description: 'Consent, per-venue data sharing, GDPR export and erasure.' },
      { name: 'catalogue', description: 'Venues and their detail.' },
      { name: 'deals', description: 'Hot deals and the Seen → Opened → Claimed funnel.' },
      { name: 'wallet', description: 'Points, vouchers, rewards, gift cards.' },
      { name: 'gate', description: 'The amount-capture gate. The only place value is granted.' },
      { name: 'games', description: 'Server-scored rounds. The client never holds an answer.' },
      { name: 'social', description: 'Referrals and leaderboards.' },
      { name: 'notifications', description: 'Inbox and push registration.' },
      { name: 'assistant', description: 'Grounded search and explanation.' },
      { name: 'partner', description: 'The partner dashboard and its mobile companion.' },
      { name: 'billing', description: 'Plans, subscriptions, receipts.' },
      { name: 'guide', description: 'The relocation guidebook, news, community, exchange rates.' },
      { name: 'admin', description: 'Platform operations. Desktop only.' },
      { name: 'meta', description: 'Health and the endpoint index.' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description:
            'The token from `/v1/auth/signin`. The web surface also accepts an HttpOnly ' +
            '`paylez_session` cookie; both resolve to one session.',
        },
      },
      schemas: SCHEMAS,
    },
    paths,
  };
}

function main(): void {
  const spec = buildSpec();
  const out = 'server/openapi.json';
  writeFileSync(out, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
  const paths = Object.keys(spec.paths as object).length;
  const operations = Object.values(spec.paths as Record<string, object>).reduce(
    (total, entry) => total + Object.keys(entry).length,
    0,
  );
  console.log(`wrote ${out} — ${paths} paths, ${operations} operations, ${Object.keys(DOCS).length} documented in full`);
}

main();
