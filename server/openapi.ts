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
import { GAME_TYPES } from './domain/games.ts';
import { allRoutes } from './http/routes/index.ts';
import type { Auth, Route } from './http/router.ts';

type Schema = Record<string, unknown>;

/** A venue's kind, as `domain/categories.ts` states it. */
const KIND_CATEGORY =
  'One category key of the venue taxonomy (`GET /v1/categories`): `coffee`, `restaurant`, `shopping`, ' +
  '`leisure`, `beauty`, `housing`, `bakery`, `halal`. A word an older client sends (`cafe`) is placed on the ' +
  'tree and stored as its key; anything else is a 400 naming `category`.';
const KIND_SUBCATEGORY =
  'A subcategory key under the category (`restaurant.turkish`), or its last part (`turkish`); stored as the full key.';

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
const obj = (properties: Record<string, Schema>): Schema => ({ type: 'object', properties });

/**
 * The game enum, read from the same tuple the route validates against and the
 * database's CHECK is built from.
 *
 * Spelt out here once, it would be a fourth copy of a list that already exists in
 * three places — and the one a client generator reads, so the copy that goes
 * stale is the one that produces a Dart enum missing a game.
 */
const gameTypeSchema = (description: string): Schema => ({
  type: 'string',
  enum: [...GAME_TYPES],
  description,
});

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
      'client branches on; `message` is for a human and may change.\n\n' +
      '`daily_cap` is listed because the set is closed, but nothing throws it any more: ' +
      'there is no daily points ceiling. Do not write a screen for it.',
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
              'insufficient_points', 'budget_exhausted', 'cap_reached', 'no_energy',
              'daily_cap', 'quota_exceeded', 'quiet_hours', 'not_available', 'invalid_trigger',
              'replay_detected', 'rate_limited', 'internal',
            ],
          },
          message: str(),
          field: str('Present on `validation_failed`: which input was wrong.'),
          allowed: {
            type: 'array',
            items: str(),
            description:
              'Present on a `validation_failed` against a closed vocabulary — currently ' +
              'only `occupation` — and it carries the whole set. A client that has drifted ' +
              'is told what it may send at the one moment that matters, which is why the ' +
              'five values are not also served from an endpoint of their own.',
          },
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
    description:
      'The whole account. **Nothing on the profile is verified** — there is no code ' +
      'sent to the number and no link clicked in the address, so there is no ' +
      '`phoneVerified` (or any other verification flag) to branch on.',
    properties: {
      user: {
        type: 'object',
        properties: {
          id: str(),
          email: { type: 'string', nullable: true },
          name: str(),
          username: {
            type: 'string',
            nullable: true,
            description:
              'The handle, as typed. Unique across the platform, 3–20 characters of ' +
              '`a-z 0-9 . _` folded case-insensitively. Null until they pick one — and a ' +
              'player with null is asked for one before anything else (the website does; ' +
              'the app should).',
          },
          language: str('The app language they chose. Drives every localised response.'),
          city: {
            type: 'string',
            nullable: true,
            description:
              'The **canonical** spelling, which is also the name of the weekly board this ' +
              'account lands on. Never simply what was typed: a city that matches ' +
              '`GET /v1/cities` is stored the way that list spells it (`Kraków` → `Krakow`), ' +
              'and one that does not is folded and title-cased (`Saint-Étienne` → ' +
              '`Saint Etienne`). Echo this value back rather than the input; the board ' +
              'matches on it with a literal `=`, so one place has to have one spelling.',
          },
          countryCode: {
            type: 'string',
            nullable: true,
            description:
              'ISO 3166-1 alpha-2, upper case. For a city on `GET /v1/cities` it is the ' +
              'list’s own country and **any `countryCode` sent with it is ignored** — that ' +
              'is what stops a client writing `Krakow, US`. For a city off the list it is ' +
              'the code the client sent, and sending one is required; see `PATCH /v1/me`.',
          },
          avatar: { type: 'string', nullable: true },
          phone: { type: 'string', nullable: true, description: 'Optional, and unverified.' },
          occupation: {
            type: 'string',
            nullable: true,
            enum: ['student', 'worker', 'business', 'freelancer', 'other'],
            description:
              'What the person does — **the field the UI labels "Status"**. It is not called ' +
              '`status` on the wire or in the schema, because that name is taken: the account ' +
              'state (`provisional` / `active` / `banned` / `erased`) is `users.status`, and ' +
              'two things meaning different things under one name is how a query ends up ' +
              'reading somebody’s job. It replaced a free-text `headline`, which is **gone** ' +
              'rather than nullable — a model that requires it throws on decode.',
          },
          birthDate: { type: 'string', nullable: true, description: 'ISO `YYYY-MM-DD`.' },
          birthDateChangesLeft: int(
            'Self-service writes still available: 2 before it is set, 1 after, 0 once the one ' +
              'correction is spent. Grey the field out on 0 rather than letting a form find out ' +
              'by being refused. Resending the day already stored spends nothing.',
          ),
          profileCompletedAt: {
            type: 'string',
            nullable: true,
            description:
              'When all seven profile answers were first present (photo, username, status, ' +
              'city, email, phone, birthday) and the completion bonus was paid. A stamp, not a ' +
              'live flag.',
          },
          onboardedAt: {
            type: 'string',
            nullable: true,
            description: 'Null until `POST /v1/me/onboarded` claims the welcome gift.',
          },
          trustTier: int('0–2. New accounts get lower caps (§13).'),
          emailVerifiedAt: {
            type: 'string',
            nullable: true,
            description:
              'When the address was proved, or null. Stamped by a Google sign-in, by ' +
              '`POST /v1/auth/email/verify`, and by a password reset. Null with an `email` ' +
              'is the state a client offers "confirm your email" for — as a banner, not a block.',
          },
          emailVerificationRequired: bool(
            'Whether buying a voucher or redeeming a gift card would be refused with ' +
              '`403 not_verified` right now. False while the server has no mail transport, ' +
              'and false for proved, Google, guest and pre-`PAYLEZ_VERIFY_SINCE` accounts.',
          ),
          venueSharingDefault: bool(
            '§1.4’s standing answer: may a venue I visit be told who I am. **Always `true`** ' +
              'since 2026-10-08 — sharing with visited venues cannot be switched off, so a ' +
              'client should draw no switch for it. `PATCH /v1/me` still accepts the key from ' +
              'older clients and ignores it. The per-venue grant is a separate record, on ' +
              '`GET /v1/me/consents`.',
          ),
          leaderboardOptIn: bool(),
          referralCode: { type: 'string', nullable: true },
          createdAt: iso('Account age; what "newcomer" targeting is derived from.'),
        },
      },
      roles: arrayOf(str()),
      mode: str(),
      points: int('The balance, summed from the ledger rather than read from a cache.'),
      plan: {
        type: 'object',
        description: 'Consumer plans are `free`, `pro`, `premium`. No plan is sold with a trial.',
        properties: { code: str(), name: str(), audience: str() },
      },
      entitlements: {
        type: 'object',
        additionalProperties: str(),
        description:
          'Resolved server-side from the active plan. Ask what the account is entitled ' +
          'to, never what it paid. Values are strings; parse what you need.\n\n' +
          'Consumer keys, free/pro/premium: `daily_energy` 4/6/10, `energy_regen_minutes` ' +
          '120/60/30, `points_multiplier` 1/1.25/1.75 (**game rounds only**), `scan_points` ' +
          '20/30/50, `first_visit_points` 100/150/250, `stamp_points` 100/150/250, ' +
          '`new_category_points` 25/50/100, `voucher_validity_days` 14/30/60, ' +
          '`word_hints_per_day` 3/6/10, `assistant_uses_per_day` 5/20/unlimited, ' +
          '`streak_freezes` 2/5/unlimited, `profile_badge`, ' +
          '`exclusive_deals`, `deal_early_access_hours` 0/0/24, `gift_card_priority`, ' +
          '`monthly_stipend`, `priority_support`, `assistant`.\n\n' +
          'Partner keys, starter/growth/scale (pricing strategy §5; 9999 means unlimited): ' +
          '`live_deals` 9999/9999/9999, `deep_analytics` (deal analytics; false is "basic"), ' +
          '`active_campaigns` 1/9999/9999, `loyalty_budget` (JSON, currency to minor units: ' +
          'growth {"PLN":390000,"UZS":2000000}, scale {"PLN":1200000,"UZS":6000000}; absent on starter), ' +
          '`voucher_tiers`, `push_quota` 2/4/10, `identified_profiles`, `export_csv`, `benchmarks`, ' +
          '`venues` 1/3/9999, `team_management`, `assistant`, `assistant_level` ""/standard/advanced, ' +
          '`api_access`, `support` email/chat/manager, `passes`, `pass_limit` 0/2/9999, ' +
          '`pass_subscribers` 0/200/9999, `pass_analytics` ""/basic/full, `multi_venue_passes`, ' +
          '`member_deals`, `vouchers`. `team_seats` is gone: it was never enforced.\n\n' +
          'Four keys are **gone**, not renamed in place: `points_expiry_months` (points ' +
          'never expire on any plan), `round_decay` (the old *per-game* repeat curve; the ' +
          'decay curve that exists now is per round of the day, is not an entitlement, and ' +
          'is reported on the finish as `decay`) and the pair `daily_lives` / ' +
          '`life_regen_minutes`, which became the two energy keys above. The server deletes ' +
          'retired rows on boot, so a client that still reads one gets a missing key rather ' +
          'than a stale number. **The energy pair is what bounds how many rounds a day ' +
          'holds**: every finished round costs one, so a full tank plus a day of refill is ' +
          '16 rounds free, 30 on Pro, 58 on Premium — while the decay curve is what bounds ' +
          'what those rounds are worth. Two limits rather than two copies of one: how ' +
          'many, and how much.',
      },
      venues: arrayOf({ type: 'object' }),
    },
  },

  Cities: {
    type: 'object',
    description:
      'The 114 places Paylez operates in, and the countries they sit in — **a suggestion ' +
      'source, not a whitelist**. A profile may name a city that is not here as long as a ' +
      '`countryCode` comes with it; see `PATCH /v1/me`. Public, because the sign-up form ' +
      'has to render the choice before an account exists.',
    properties: {
      countries: arrayOf({ type: 'string', enum: ['PL', 'DE', 'UZ'] }),
      cities: arrayOf({
        type: 'object',
        properties: {
          name: str(
            'The canonical spelling, and the one to send back. A match is found by folding, ' +
              'so `Kraków`, `Cracow` and `krakow` all resolve to this entry — but what is ' +
              'stored is this string.',
          ),
          country: { type: 'string', enum: ['PL', 'DE', 'UZ'] },
        },
      }),
    },
  },

  Venue: {
    type: 'object',
    properties: {
      id: str(),
      name: str(),
      category: str(KIND_CATEGORY),
      subcategory: { type: 'string', nullable: true, description: KIND_SUBCATEGORY },
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
      pointsPerScan: int(
        'What a qualifying scan pays here. When it is positive it **overrides** the ' +
          'reader’s plan `scan_points` — a venue that typed a rate meant it, out of its own ' +
          'budget, and a subscriber does not get to overrule it. `points_multiplier` is a ' +
          'game-round rule and is never applied to a scan.',
      ),
      timezone: str(
        'On venue detail: the IANA zone the venue’s deal hours, opening hours and budget month are in. ' +
          'Format a deal’s `12:00–14:00` in this zone, not the device’s.',
      ),
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
    description:
      'There is no `expiringSoon`, and it is **removed** rather than returned empty: ' +
      'points do not expire on any plan, so an always-`[]` array would be a promise ' +
      'about a rule the product dropped. A spend still consumes the oldest lot first.',
    properties: {
      points: int(),
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
      confirmedBy: {
        nullable: true,
        allOf: [ref('ConfirmedBy')],
        description:
          'On `GET /v1/gate/transactions/{id}` only. The team member the confirm is recorded ' +
          'against (server/TEAM.md); null when the owner confirmed as themselves.',
      },
    },
  },

  ConfirmedBy: {
    type: 'object',
    description: 'Who on the team confirmed a transaction. The owner reads it as “Confirmed by <name>”.',
    properties: { memberId: str(), name: str('The member’s name as the owner entered it.') },
  },

  TeamPerms: {
    type: 'object',
    description:
      'The six counter permissions (server/TEAM.md). Templates: cashier = earn, redeem, scan, ' +
      'running; shift lead = all six. A manager and the owner hold all six by role.',
    properties: {
      earn: bool('Enter the bill and confirm an earning visit.'),
      redeem: bool('Confirm a voucher or reward redemption.'),
      scan: bool('Show the venue QR, open a manual transaction, look a customer up.'),
      running: bool('See what the venue is running.'),
      count: bool('See today’s customer count and recent customers.'),
      pause: bool('Pause and resume what is running.'),
    },
  },

  TeamMember: {
    type: 'object',
    description: 'One row of a venue’s team. The join code is never part of it.',
    properties: {
      id: str(),
      name: str(),
      role: { type: 'string', enum: ['manager', 'shiftlead', 'cashier', 'custom'] },
      perms: ref('TeamPerms'),
      status: { type: 'string', enum: ['invited', 'active', 'revoked'] },
      joinedAt: { type: 'string', format: 'date-time', nullable: true },
      lastSeenAt: { type: 'string', format: 'date-time', nullable: true },
      onShift: bool(),
      codeExpiresAt: {
        type: 'string',
        format: 'date-time',
        nullable: true,
        description: 'When the outstanding join code stops working, or null when there is none.',
      },
    },
  },

  Workspace: {
    type: 'object',
    description:
      'One entry of the workspace switcher. `personal` has every other field null; `owner` ' +
      'carries `role: "owner"` and all six perms.',
    properties: {
      kind: { type: 'string', enum: ['personal', 'owner', 'manager', 'staff'] },
      venueId: { type: 'string', nullable: true },
      venueName: { type: 'string', nullable: true },
      memberId: { type: 'string', nullable: true },
      role: { type: 'string', nullable: true },
      perms: { nullable: true, allOf: [ref('TeamPerms')] },
    },
  },

  Counter: {
    type: 'object',
    description:
      'The staff counter. Each section is filled only when `perms` allows it; the client ' +
      'draws what arrives and decides nothing.',
    properties: {
      venue: { type: 'object', properties: { id: str(), name: str() } },
      member: { nullable: true, allOf: [ref('TeamMember')], description: 'Null for the owner.' },
      perms: ref('TeamPerms'),
      running: arrayOf({
        type: 'object',
        properties: {
          id: str(),
          kind: { type: 'string', enum: ['deal', 'stampCard', 'voucherTier'] },
          name: str('English display string from the server.'),
          sub: str('English display string from the server.'),
          paused: bool(),
          canPause: bool(),
        },
      }),
      customersToday: { type: 'integer', nullable: true, description: 'Null without `count`.' },
      recent: arrayOf({
        type: 'object',
        description:
          'Today’s confirmed customers, newest first, up to 50; empty without `count`. `name` is ' +
          'first name + last initial, and only for a customer who shares with this venue ' +
          '(otherwise `Customer` / `?`).',
        properties: { initials: str(), name: str(), detail: str(), time: iso('The confirm instant.') },
      }),
    },
  },

  Receipt: {
    type: 'object',
    description: 'What the commit granted. The only response that means value moved.',
    properties: {
      transaction: ref('Transaction'),
      pointsGranted: int(
        'Every point this visit paid, across all of §2b’s venue lines — the scan, a first ' +
          'visit here, a new category, a completed stamp card. The ledger holds them apart; ' +
          'the receipt is one number because a cashier reads it out loud. **There is no ' +
          'spend bonus**: the size of the bill decides whether the scan counts as a visit ' +
          '(the venue minimum) and nothing else.',
      ),
      discountMinor: minor('The discount actually applied'),
      stamped: bool(),
      reward: { nullable: true, allOf: [ref('Reward')] },
      visitCounted: bool('False on a second scan the same day — still a sale, not a second visit.'),
      confirmedBy: {
        nullable: true,
        allOf: [ref('ConfirmedBy')],
        description: 'The team member this confirm is recorded against; null for the owner.',
      },
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
      gameType: gameTypeSchema(
        'Echoed back. `poland` and `uzbekistan` are the same quiz asked about two ' +
          'different countries and score identically — a client shows **one** ' +
          'local-knowledge card and picks between them by the country on the ' +
          'player’s profile, rather than offering both.',
      ),
      content: {
        type: 'object',
        description:
          'Shape depends on the game, and every game now carries **the scale it will be ' +
          'judged on** so a client never hardcodes a copy of a table this server owns. ' +
          'Those numbers are `performance` (0–100), not points: what a round *pays* ' +
          'depends on the featured game, the round of the day, the plan and three ' +
          'bonuses, none of which is a property of the questions.\n\n' +
          'Quizzes: `{questions:[{index,prompt,options}], performancePerCorrect, ' +
          'speedCredit, speedWithinSeconds}` — for `flags`, `prompt` is an ISO country ' +
          'code and the flag emoji is built from it. Word Builder: ' +
          '`{words:[{index,length,tier,letters,hint}], performancePerWord, speedCredit, ' +
          'speedWithinSeconds, hintPenalty}` — **three** words a round, and `tier` is the ' +
          'bank’s difficulty rating and no longer prices the word. Memory Match: ' +
          '`{cards, pairs, basePerformance, moveBands, limitSeconds}` — the layout stays ' +
          'on the server, `moveBands` is `[{throughMoves, bonus}]` with inclusive ' +
          'boundaries, and `limitSeconds` is the one number here a client has to act on ' +
          'rather than display. Flight: `{target, performancePerObstacle, ' +
          'perfectObstacles}` \u2014 **two different numbers**: `target` is 5, the gaps that ' +
          'decide `won`, and `perfectObstacles` is 25, what a perfect round takes. A label ' +
          'reading one as the other prints a wrong figure with nothing to catch it.\n\n' +
          'Two quiz keys were **renamed rather than re-meaninged**: `perCorrect: 1` and ' +
          '`perfectBonus` became `performancePerCorrect: 20`, and `speedBands` became the ' +
          '`speedCredit` / `speedWithinSeconds` pair. A client that kept reading ' +
          '`perCorrect` as points and found a 20 there would print “20 points a question” ' +
          'on a round whose absolute ceiling is 18. `mistakesAllowed` is still gone: there ' +
          'is no mistake limit and a quiz cannot be lost.',
      },
      energyLeft: int(
        'Energy in the tank *before* this round is paid for — starting costs nothing, ' +
          'finishing costs one. Was `livesLeft`.',
      ),
      paid: {
        type: 'boolean',
        description:
          'Whether this round will bank anything. `false` is a **practice** round — one ' +
          'opened on an empty tank by a client that sent `practice: true`. It plays ' +
          'identically and banks nothing at all: no points, no streak, no energy, no ' +
          'ledger entry. Without `practice` an empty tank is still the `no_energy` ' +
          'refusal, so an existing client keeps the behaviour it shipped with.',
      },
    },
  },

  EventResult: {
    type: 'object',
    properties: {
      correct: { type: 'boolean', nullable: true },
      answer: { nullable: true, description: 'Only ever the answer to the question just asked.' },
      accepted: bool('False when this `seq` was already recorded — a retry, not a second answer.'),
      revealed: {
        type: 'array',
        nullable: true,
        description:
          'Memory Match only. The cards this move turned over, as `{index, face}` — ' +
          'positions rather than an ordered pair, so a client can apply them to its board ' +
          'without re-deriving which of `a`/`b` it sent first. It is the only way a client ' +
          'ever learns the layout, and it arrives on a mismatch as well as a match: a ' +
          'memory game in which a mismatch taught you nothing would not be one. Sent on the ' +
          'duplicate path too, because a retry after a dropped response is the only thing ' +
          'that will ever tell that client what those cards were.\n\n' +
          '**Two entries for a `pair`, one for a `peek`** — read the array, never a fixed ' +
          'length. A peek turns the opening card of a move on its own and answers here and ' +
          'nowhere else: it sets no `correct` (it is not an answer to anything) and no ' +
          '`answer` (which is the pair move’s legacy key, not a second channel).',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer' },
            face: { type: 'string' },
          },
        },
      },
    },
  },

  Energy: {
    type: 'object',
    description:
      'The energy pool — what hearts became, and the **only** thing that bounds a day.\n\n' +
      '**Every round costs one when it starts, win or lose** (rulebook §3), so an ' +
      '*abandoned* round costs one too. The one way back: abandoning within 5 seconds of ' +
      'the start refunds it, once a day — see `POST /v1/games/sessions/{id}/abandon`.\n\n' +
      'It **does not reset at midnight**: one refills every `energy_regen_minutes` (free ' +
      '120, Pro 60, Premium 30) up to `daily_energy` (4/6/10). From a full tank that is ' +
      '16 rounds in a day free, 30 on Pro, 58 on Premium; 12/24/48 at the sustained rate. ' +
      'All six figures moved when the intervals were cut from 240/180/120; the ceilings ' +
      'did not, so the refill is where a paid plan now argues for itself.',
    properties: {
      energy: int('Whole energy available right now. Was `lives`.'),
      max: int('The plan’s ceiling — `daily_energy`.'),
      nextAt: {
        type: 'string',
        nullable: true,
        description:
          'When the next one lands, or null when the tank is already full. Render the ' +
          'wait; a pool with no visible end is the one that feels broken.',
      },
    },
  },

  EarnSource: {
    type: 'object',
    description:
      'One row of the "where did this come from" legend. Fewer kinds than there are ledger ' +
      'reasons, on purpose: a scan, the venue bonus that rode in with it and the review left ' +
      'afterwards are one thing to the person who earned them. **Render `label`** — a client ' +
      'with its own table of names is a client that prints a raw reason the day the server ' +
      'grows one it has never heard of.',
    properties: {
      kind: {
        type: 'string',
        enum: ['check_in', 'streak', 'games', 'visits', 'stamps', 'invites', 'bonus'],
        description: 'Stable, for picking a colour. Never for picking a word.',
      },
      label: str('The words to print.'),
      points: int('Earned. Spends are not in this legend at all.'),
    },
  },

  CalendarDay: {
    type: 'object',
    description:
      'A day with something to say. Days with nothing are **left out**, not sent as zeroes: ' +
      'the client knows `today`, so a day that is absent is "nothing happened" before it and ' +
      '"not yet" after it, and those are not the same cell.',
    properties: {
      day: str('`YYYY-MM-DD`.'),
      checkedIn: bool('Whether the check-in was claimed on this day.'),
      points: int('Everything earned that day, from every source.'),
      sources: arrayOf(ref('EarnSource')),
    },
  },

  StreakMilestone: {
    type: 'object',
    description:
      'A one-off bonus for reaching a streak length. **Paid once in a lifetime, not once per ' +
      'streak** — a run that breaks at ninety and climbs back to seven does not pay the ' +
      'seven-day bonus again.',
    properties: {
      day: int('The streak length that pays it.'),
      points: int(),
      paid: bool('Whether this account has ever been paid it.'),
    },
  },

  DailyCalendar: {
    type: 'object',
    description:
      'Everything the daily-rewards screen draws. One response rather than three, because the ' +
      'streak, the seven-day run-up, the month grid and the legend under it are four answers ' +
      'to one question, and a screen that fetched them separately could draw a calendar beside ' +
      'a streak read a second earlier.',
    properties: {
      today: str('The server’s day, `YYYY-MM-DD`. **Do not compute this locally.**'),
      dayTurnsAt: iso(
        'When `today` becomes tomorrow. Count down to this rather than to a local midnight: a ' +
          'client that picks its own boundary is a client that disagrees with the server about ' +
          'whether a streak is still alive.',
      ),
      claimable: bool('Whether today’s check-in is still there to take.'),
      claimedToday: bool(),
      todayPoints: int('What today’s check-in paid, or would pay.'),
      todayBonus: int('The milestone landing with it, or 0.'),
      streak: int('Consecutive days checked in, ending today **or yesterday**.'),
      longestStreak: int(),
      atRisk: bool(
        'A live streak with today unclaimed — the only state a "you are about to lose it" ' +
          'reminder is honest about.',
      ),
      cycleDay: int('Which rung of the seven-day cycle today is, 1–7.'),
      ladder: arrayOf({
        type: 'object',
        properties: { day: int(), points: int(), milestone: int('0 where none lands on this rung.') },
      }),
      milestones: arrayOf(ref('StreakMilestone')),
      nextMilestone: {
        type: 'object',
        nullable: true,
        description: 'The next unpaid one, or null when all of them are paid.',
        properties: { day: int(), points: int(), daysAway: int() },
      },
      month: str('`YYYY-MM` — the month `days` belongs to.'),
      monthTotal: int('Everything earned in it. Equal to the sum of `monthSources`, and of `days`.'),
      monthSources: arrayOf(ref('EarnSource')),
      days: arrayOf(ref('CalendarDay')),
    },
  },

  /** Rulebook §8 — one mission, as `GET /v1/missions` sends it. */
  Mission: {
    type: 'object',
    required: ['id', 'number', 'title', 'description', 'reward', 'rewardLabel', 'progress', 'target', 'status', 'autoPaid'],
    properties: {
      id: str('Stable: `daily.todays_game`, `learning.pesel`, `seasonal.<campaign id>`.'),
      number: int('The rulebook’s mission number.'),
      title: str(),
      description: str(),
      reward: { ...int('Points a claim pays, or the mirrored bonus pays; null when not a number of points.'), nullable: true },
      rewardLabel: str('What to print: "25", "streak +1", "1 freeze", "100 / 150 / 250".'),
      progress: int(),
      target: int(),
      status: { type: 'string', enum: ['locked', 'open', 'complete', 'claimed'] },
      autoPaid: bool('Paid automatically by the bonus it mirrors; never claimed here.'),
    },
  },

  DailyCheckIn: {
    type: 'object',
    description: 'What one check-in did. Safe to send twice; see the endpoint.',
    properties: {
      granted: bool('True only for the call that actually claimed the day.'),
      day: str('`YYYY-MM-DD`.'),
      dayTurnsAt: iso('When it stops being today.'),
      points: int('What the check-in paid. `0` on a repeat.'),
      bonus: int('The milestone that landed with it. `0` when none did.'),
      total: int('`points + bonus` — what the balance moved by.'),
      milestone: {
        type: 'object',
        nullable: true,
        description: 'The milestone this call paid, for a screen that wants to celebrate it.',
        properties: { day: int(), points: int() },
      },
      streak: int(),
      longestStreak: int(),
      cycleDay: int(),
      tomorrowPoints: int('What tomorrow pays if tomorrow is claimed. The reason to come back.'),
      balance: int('The balance after, as the server computed it.'),
    },
  },

  GamesState: {
    type: 'object',
    description: 'The truth about this player. Anything the client tracks is a display.',
    properties: {
      energy: ref('Energy'),
      streak: int(),
      longestStreak: int(),
      freezes: int(
        'Streak freezes held. One is earned every 7 days, up to `streak_freezes` — 2 free, ' +
          '5 on Pro, effectively unlimited on Premium.',
      ),
      answered: int(),
      correct: int(),
      points: int('The balance, from the ledger.'),
      dailyWord: { type: 'object', nullable: true, description: 'Today’s shared word, for Word Builder.' },
      featuredGame: {
        type: 'string',
        nullable: true,
        description:
          '**Today\u2019s featured game as one `gameType`**, which is the card to draw as the ' +
          'hero on a Play or Home screen. The \u00d71.5 is paid on the first paid round of ' +
          'it \u2014 see `featured` on the finish.\n\n' +
          'Resolved **per account**: the rotation holds `poland` and `uzbekistan` as one ' +
          'slot, so this is the single bank that account is dealt (by `country_code`, ' +
          'defaulting to `poland`), and an Uzbek account is never sent the Poland quiz. Do ' +
          'not compute this client-side from a day number \u2014 that cannot resolve the ' +
          'local slot, and two screens deriving it independently will disagree with each ' +
          'other and with the game the bonus is actually paid on.\n\n' +
          '`null` only if the rotation genuinely posts nothing. It does not say whether the ' +
          'bonus is still available today \u2014 the `daily_game` task\u2019s `done` does.',
      },
    },
  },

  Finish: {
    type: 'object',
    properties: {
      score: int(
        'The points banked, and the whole of what the balance moved by. Computed ' +
          'server-side from the recorded events; never sent by the client.\n\n' +
          'It is the points rulebook\u2019s master formula (\u00a74.1): ' +
          '`max(1, round(base \u00d7 featured \u00d7 decay \u00d7 points_multiplier + ' +
          'bonuses))`, where `base` is `max(2, round(performance / 100 \u00d7 18))`. Every ' +
          'term is itemised on this response \u2014 see `performance` below \u2014 so a ' +
          'result screen can show the sum rather than only the answer.',
      ),
      capped: int(
        '**Always 0, and it always has been.** Nothing *trims* a round: there is no daily ' +
          'points ceiling. There is a decay curve again, and it is deliberately not ' +
          'reported here \u2014 `capped` meant points removed from a round already scored, ' +
          'and decay is part of scoring it. Read `decay` and `roundToday` instead. The key ' +
          'is kept only so an existing client does not break on a missing field.',
      ),
      performance: int(
        'The round\u2019s **performance**, 0\u2013100 \u2014 the one scale every game is ' +
          'reduced to (rulebook \u00a75). 20 a correct answer on a quiz; 33 a word plus ' +
          'speed credits and minus hints in Word Builder; 60 for clearing a Memory Match ' +
          'board plus an efficiency bonus by moves; 4 an obstacle in the flight. 100 is a ' +
          'perfect round in every game, which is what makes them comparable.',
      ),
      base: int(
        '`max(2, round(performance / 100 \u00d7 18))` \u2014 2..18, the multiplicative base ' +
          'before the featured multiplier, the decay, the plan and the flat bonuses. ' +
          '**A finished round never pays zero**: 2 is the floor, so trying always beats not ' +
          'trying. 0 on a welcome round, which bypasses the formula \u2014 see `welcomeRound`.',
      ),
      decay: {
        type: 'number',
        description:
          'The decay rung this round landed on: `1`, `0.65`, `0.45`, `0.3`, `0.2` or `0.12` ' +
          'for the 1st through 6th-or-later **paid** round of the day. This is the main ' +
          'anti-grind lever and the honest answer to \u201cwhy was that worth 4 when the ' +
          'same round was worth 18 this morning\u201d \u2014 draw it rather than leaving a ' +
          'player to guess.',
      },
      roundToday: int(
        'Which paid round of the day this was, 1-based \u2014 what `decay` is read from. ' +
          'Practice rounds and abandoned rounds do not count, so this is the number of ' +
          'rounds that actually banked today.',
      ),
      featured: bool(
        'Whether the \u00d71.5 featured-game multiplier applied. **Once per day**, on the ' +
          'first paid round of the day\u2019s rotating game. This replaced a flat +20 that ' +
          'used to arrive as a separate ledger entry \u2014 there is one entry per round now. ' +
          '`featuredGame` on `GET /v1/games/state` names which game that is.',
      ),
      featuredMultiplier: {
        type: 'number',
        description:
          'The factor `featured` actually applied: `1.5` when it did, `1` when it did not. ' +
          'Sent beside the boolean so a breakdown row can print \u201c\u00d71.5\u201d ' +
          'without holding its own constant \u2014 `FEATURED_GAME_BONUS` is a tunable ' +
          '(rulebook \u00a711), and a label that stops matching the sum beside it is worse ' +
          'than one that says only \u201cincluded\u201d. `1` rather than null when it did ' +
          'not apply, so the chain `base \u00d7 featuredMultiplier \u00d7 decay \u00d7 ' +
          'multiplier` needs no branch.',
      },
      multiplier: {
        type: 'number',
        description:
          'The plan\u2019s `points_multiplier` as it stood when the round was played: `1`, ' +
          '`1.25` or `1.75`. Applied to the base only \u2014 the three flat bonuses below are ' +
          'added after it and are **not** multiplied by it.',
      },
      bonusPerfect: int(
        '`10` when `performance` is exactly 100, else `0`. Flat: the same 10 on every plan.',
      ),
      bonusNewGame: int(
        '`25` the first time this player has ever finished a paid round of this game, else ' +
          '`0`. Once per game, ever \u2014 eight games make 200 points of discovery.',
      ),
      bonusPersonalBest: int(
        '`8` for beating their own best performance in this game, at most once per game per ' +
          'day, else `0`. The round that *sets* a first record takes `bonusNewGame` instead.',
      ),
      welcomeRound: bool(
        'The one round that does not follow the formula. The first finished round of an ' +
          'account pays a flat 10 per correct answer \u2014 the fifty points the onboarding ' +
          'screen promises \u2014 so `base` and all three bonuses are `0` and `featured` is ' +
          '`false`. `performance` is still the honest figure.',
      ),
      correct: int(),
      answered: int(),
      won: bool(
        'Whether the round was won. It **does not decide what the round cost** — every ' +
          'finished round spends one energy either way.\n\n' +
          'On a **quiz** this means *all five correct*, and nothing else: there is no ' +
          'mistake limit and a quiz cannot be lost, so `false` here is “not a clean ' +
          'sweep” rather than “forfeited”. The round still scored and still banked.',
      ),
      streak: int(),
      freezes: int(
        'Streak freezes held. One is earned every 7 days, up to `streak_freezes` — 2 free, ' +
          '5 on Pro, effectively unlimited on Premium.',
      ),
      energyLeft: int(
        'Energy left after this round, which is one lower than the round started with — ' +
          'or unchanged at 0 when `paid` is false. Was `livesLeft`. See `Energy`.',
      ),
      balance: int(),
      paid: {
        type: 'boolean',
        description:
          'Whether this round banked anything — the same fact `Round.paid` promised when ' +
          'it was opened. `false` is a practice round: `score` is 0, `streak` and ' +
          '`freezes` are unchanged, `balance` is unmoved and `energyLeft` is still 0. ' +
          'A client needs it to tell a practice round from a round that simply scored ' +
          'nothing — the two bodies are otherwise identical.',
      },
      nearest: {
        nullable: true,
        type: 'object',
        properties: { venueId: str(), venueName: str(), discountPct: int(), pointsNeeded: int() },
      },
    },
  },

  Onboarded: {
    type: 'object',
    description:
      'The welcome gift, paid **once ever** and idempotent: a retry, a second device or a ' +
      'lost response all return `granted: false` with the original timestamp.',
    properties: {
      granted: bool('True only for the call that actually claimed it.'),
      onboardedAt: iso('When onboarding was first reported. Unchanged by a second report.'),
      points: int('What this call paid. 0 on every call after the first.'),
      balance: int(),
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
      'was built from. It never invents a venue, a price or a number: `facts` are the figures ' +
      'the sentence used, `results` the venue, deal and directory rows (or voucher rungs) it read, ' +
      '`action` the one place it points to.',
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
  /* ── subscription passes (`domain/passes.ts`) ── */
  PassTerms: {
    type: 'object',
    description:
      'The redemption rule as **locked onto one period**. A pass edited mid-term changes what new ' +
      'subscribers get at once and what existing ones get at their next renewal, never before.',
    properties: {
      benefitItem: { type: 'string', nullable: true },
      discountPct: { type: 'integer', nullable: true },
      capKind: { type: 'string', enum: ['per_day', 'per_week', 'per_month', 'unlimited'] },
      capCount: int('Uses per window. Ignored when `capKind` is `unlimited`.'),
      allowedDays: { type: 'array', items: { type: 'integer' }, nullable: true, description: 'Monday-zero. Null is any day.' },
      fromMin: { type: 'integer', nullable: true, description: 'Minutes past local midnight, or null.' },
      toMin: { type: 'integer', nullable: true },
      maxValueMinor: { type: 'integer', nullable: true, description: '"Most off one visit", in minor units.' },
      seats: int('1, or up to 3 for "Friends and family".'),
      billingPeriod: { type: 'string', enum: ['monthly', 'quarterly', 'annual'] },
    },
  },
  Pass: {
    type: 'object',
    description:
      'A pass as its venue sees it. `soldOut` is derived (holders against `subscriberCap`). ' +
      '`missing` lists what publishing would still refuse: `name`, `benefit`, `price`, `unlimitedOk`.',
    properties: {
      id: str(),
      venueId: str(),
      template: { type: 'string', enum: ['daily', 'bundle', 'vip', 'weekend', 'custom'] },
      name: str(),
      tagline: { type: 'string', nullable: true },
      accent: { type: 'string', enum: ['teal', 'deep_green', 'purple', 'terracotta', 'ink'] },
      benefitItem: { type: 'string', nullable: true },
      discountPct: { type: 'integer', nullable: true },
      perks: arrayOf({ type: 'string', enum: ['early_access', 'member_deals', 'skip_line', 'birthday'] }),
      capKind: { type: 'string', enum: ['per_day', 'per_week', 'per_month', 'unlimited'] },
      capCount: int(),
      unlimitedOk: bool(),
      allowedDays: { type: 'array', items: { type: 'integer' }, nullable: true },
      fromMin: { type: 'integer', nullable: true },
      toMin: { type: 'integer', nullable: true },
      maxValueMinor: { type: 'integer', nullable: true },
      seats: int(),
      priceMinor: minor('Price per billing period'),
      currency: str(),
      billingPeriod: { type: 'string', enum: ['monthly', 'quarterly', 'annual'] },
      intro: { type: 'string', enum: ['none', 'trial_7', 'half_first'] },
      subscriberCap: { type: 'integer', nullable: true },
      costPerUseMinor: { type: 'integer', nullable: true },
      status: { type: 'string', enum: ['draft', 'live', 'paused', 'closed'] },
      soldOut: bool(),
      holders: int('Current holders: trialing, active, or cancelled inside their period.'),
      missing: arrayOf(str()),
      publishedAt: { type: 'string', nullable: true },
      pausedAt: { type: 'string', nullable: true },
      closedAt: { type: 'string', nullable: true },
      createdAt: str(),
      updatedAt: str(),
    },
  },
  PassUpsell: {
    type: 'object',
    description:
      'Extra spend beyond the pass, **estimated** from the uses where the till entered a bill and ' +
      'the covered value is known. Never scaled up to unmeasured uses. `minor` is null — with a ' +
      '`reason` — when nothing could be measured; it is never a stand-in 0.',
    properties: {
      minor: { type: 'integer', nullable: true },
      measured: int(),
      redemptions: int(),
      reason: { type: 'string', nullable: true, enum: ['no_redemptions', 'no_bills_recorded', 'no_covered_value', null] },
    },
  },
  PassAllowance: {
    type: 'object',
    properties: {
      capKind: str(),
      window: str('`d:YYYY-MM-DD`, `w:YYYY-Www`, `m:<period anchor>` or `u`.'),
      used: int(),
      allowance: { type: 'integer', nullable: true },
      remaining: { type: 'integer', nullable: true },
      resetsAt: { type: 'string', nullable: true },
    },
  },
  PassSubscription: {
    type: 'object',
    description: '`charged` is always false today: there is no payment rail for venue passes.',
    properties: {
      id: str(),
      passId: str(),
      venueId: str(),
      code: str('`PS-XXXXXX`. What the customer shows the counter.'),
      status: { type: 'string', enum: ['trialing', 'active', 'cancelled', 'expired'] },
      startedAt: str(),
      periodStart: str(),
      periodEnd: str(),
      priceMinor: minor('The price this period is locked at'),
      currency: str(),
      periodKind: { type: 'string', enum: ['trial', 'intro', 'full'] },
      charged: bool(),
      cancelledAt: { type: 'string', nullable: true },
      terms: ref('PassTerms'),
    },
  },
  PassMembers: {
    type: 'object',
    description: 'Current holders who share their profile with this venue. `total` counts everybody holding.',
    properties: {
      total: int(),
      shared: int(),
      rows: arrayOf(
        obj({
          subscriptionId: str(),
          passId: str(),
          passName: str(),
          accent: str(),
          userId: str(),
          name: str(),
          avatar: { type: 'string', nullable: true },
          since: str(),
          usedThisPeriod: int(),
          status: { type: 'string', enum: ['trialing', 'active', 'cancelled'] },
        }),
      ),
    },
  },
};

/* ═══════════════════════════════════════════════ the documented endpoints ══ */

const DOCS: Record<string, Doc> = {
  /* ── identity ── */
  'POST /v1/auth/signup': {
    summary: 'Create an account',
    description:
      'Mints a referral code, and — if `provisionalId` is sent — folds the guest ' +
      'identity in so points earned before signing up survive.\n\n' +
      'Records terms and privacy consent with the policy version **when `acceptTerms` ' +
      'is sent**, and not otherwise: a consent row is evidence that somebody was asked, ' +
      'so a client that did not ask writes none. `POST /v1/me/consents` is how it ' +
      'arrives later.\n\n' +
      '**It does not pay the welcome bonus.** That moved to `POST /v1/me/onboarded`, ' +
      'because an address and a password can be produced in bulk and a gift attached to ' +
      'producing them funds a farm.\n\n' +
      '**It sends the first email confirmation code.** The response carries `verification` ' +
      '(the `POST /v1/auth/verify/send` shape), or `null` if the mail could not be sent — ' +
      'the account is created either way, and the resend button is the remedy.',
    tags: ['auth'],
    body: {
      email: str(), password: str('At least 6 characters.'), name: str(),
      language: str(),
      city: str(
        'Suggested by `GET /v1/cities`, not restricted to it. A city off that list needs ' +
          '`countryCode` beside it, and is stored folded and title-cased — the same rule as ' +
          '`PATCH /v1/me`, checked here so sign-up is not the hole in it.',
      ),
      countryCode: str(
        'ISO 3166-1 alpha-2. Read only alongside `city`, and **ignored** when the city is ' +
          'one of `GET /v1/cities` — those own their country.',
      ),
      partner: bool('Grants the partner_owner role. Never grants admin.'),
      acceptTerms: bool(
        'Send `true` only when the person has been shown the Terms and the Privacy ' +
          'Policy and agreed. Optional, and absent is not refused: a required field ' +
          'cannot be added to a client that is already installed.',
      ),
      referralCode: str('The code of whoever invited them.'),
      provisionalId: str('The guest account to merge in.'),
      device: str('A stable device fingerprint. Used for multi-account detection.'),
      surface: { type: 'string', enum: ['web', 'mobile'] },
    },
    required: ['email', 'password', 'name'],
    response: ref('Session'),
    errors: [
      [400, '`validation_failed` — `field` is `email`, `password`, `name`, `city` or `countryCode`. The last of those is a city we do not know sent without the country it is in.'],
      [409, 'That address already has an account.'],
    ],
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
  'POST /v1/auth/email/send-code': {
    summary: 'Send (or resend) the email confirmation code',
    description:
      'To the signed-in account’s own address. Sign-up already sends the first one. A six-digit ' +
      'code, valid 10 minutes, 5 attempts. Inside the 60-second cooldown the answer is ' +
      '`sent: false` with `nextSendAt` — not an error. The code is never in a response.',
    tags: ['auth'],
    response: {
      type: 'object',
      properties: { sent: bool(), nextSendAt: str(), expiresAt: str() },
    },
    errors: [
      [409, '`conflict` — the address is already confirmed.'],
      [409, '`quota_exceeded` — five codes inside an hour.'],
    ],
  },
  'POST /v1/auth/email/verify': {
    summary: 'Confirm the email code',
    tags: ['auth'],
    body: { code: str('Six digits. Spaces and dashes are ignored.') },
    required: ['code'],
    response: { type: 'object', properties: { verified: bool(), granted: bool('True only for the call that proved it.') } },
    errors: [
      [400, '`validation_failed` — wrong code; `attemptsLeft` says how many remain.'],
      [404, '`not_found` — no code has been sent.'],
      [409, '`expired` — ask for a new one.'],
      [409, '`cap_reached` — five wrong answers; ask for a new one.'],
    ],
  },
  'POST /v1/auth/password/reset-code': {
    summary: 'Email a password-reset code',
    description:
      'Always `{ ok: true }`, whether or not the address has an account, so the route cannot ' +
      'be used to find out which addresses do. The same code rules as confirmation.',
    tags: ['auth'],
    body: { email: str() },
    required: ['email'],
    response: { type: 'object', properties: { ok: bool() } },
  },
  'POST /v1/auth/password/reset': {
    summary: 'Set a new password with the emailed code',
    description:
      'Drops every open session and marks the address as proved. The client then signs in ' +
      'with the new password. Every code failure (no account, no code, expired, spent, wrong) ' +
      'answers the same 400.',
    tags: ['auth'],
    body: { email: str(), code: str(), password: str() },
    required: ['email', 'code', 'password'],
    response: { type: 'object', properties: { reset: bool() } },
    errors: [[400, '`validation_failed` — `field` is `password` (too short) or `code`.']],
  },
  'POST /v1/auth/signout': { summary: 'Revoke this session', tags: ['auth'], response: { type: 'object' } },
  'GET /v1/cities': {
    summary: 'The cities the profile form suggests',
    description:
      '114 places across Poland, Germany and Uzbekistan. Public, because sign-up takes a ' +
      'city and the form has to render the choice before anybody has an account.\n\n' +
      '**Unchanged in shape, changed in standing.** It was the closed set a profile had to ' +
      'pick from; it is now a suggestion source, and `PATCH /v1/me` takes a city that is ' +
      'not on it as long as a `countryCode` comes with it. Somebody the product has not ' +
      'reached yet was being told their own city does not exist, over a field that gates ' +
      'nothing.\n\n' +
      'Still a list rather than a search, because it is short: filter it locally and show ' +
      'the whole set when the box is empty — whether Paylez is anywhere near them is the ' +
      'thing a visitor actually wants to know, and a search endpoint would be a round trip ' +
      'per keystroke to narrow a hint.',
    tags: ['me'],
    response: ref('Cities'),
  },
  'GET /v1/me': { summary: 'Who is signed in, and what they are entitled to', tags: ['me'], response: ref('Me') },
  'PATCH /v1/me': {
    summary: 'Update the profile',
    description:
      'Every field is optional and none of them gates anything — an account that answers ' +
      'none of them is a complete account, it just has not been paid for finishing one. ' +
      '**Nothing here is verified**; there is no code sent to the number.\n\n' +
      'Four fields have rules worth knowing before the form is drawn.\n\n' +
      '`username` is unique platform-wide (3–20 of `a-z 0-9 . _`, single dots or underscores ' +
      'between runs, some names reserved) and a clash is a `409` naming the field. ' +
      '`PUT /v1/me/username` is the same write on a route of its own, rate-limited.\n\n' +
      '`birthDate` is accepted twice — the answer and one correction — after which a ' +
      '*different* day is a `409` naming support; resending the day already stored costs ' +
      'nothing, so a client may safely PATCH its whole profile on every save. ' +
      '`birthDateChangesLeft` on `GET /v1/me` says how many writes remain.\n\n' +
      '`occupation` is the field the UI labels **"Status"** and is one of five values; ' +
      'anything else is a `400` whose `allowed` carries the whole set. It replaced the ' +
      'free-text `headline`, which no longer exists in either direction.\n\n' +
      '`city` is **canonicalised, not restricted.** A city that matches `GET /v1/cities` is ' +
      'stored with that list’s own spelling and country, and a `countryCode` sent with it ' +
      'is ignored — which is what keeps `Kraków`, `Krakow` and `krakow` on one weekly board ' +
      'and stops a client writing `Krakow, US`. A city that does not match is accepted with ' +
      'a `countryCode` beside it and is stored folded and title-cased, so diacritics, ' +
      'hyphens and apostrophes do not survive (`Saint-Étienne` → `Saint Etienne`). That is ' +
      'the price of one board per place rather than one per spelling: read `city` back off ' +
      'the response rather than assuming what was sent was stored.\n\n' +
      'Filling in all seven answers (photo, username, status, city, email, phone, ' +
      'birthday) pays `profileComplete` once and stamps `profileCompletedAt`.\n\n' +
      '**An explicit `null` takes an answer back**: `avatar`, `phone` and `occupation` are cleared, and ' +
      '`city: null` clears the city and its country together (a `countryCode` sent beside it is a 400). ' +
      '`name`, `username`, `birthDate` and `language` cannot be cleared — `null` is a 400 naming the field. ' +
      'An absent key or an empty string still leaves a field alone, and clearing never takes back a ' +
      'completion bonus already paid.',
    tags: ['me'],
    body: {
      name: str(),
      username: str('Unique. 3–20 characters of `a-z 0-9 . _`.'),
      language: str(),
      city: str(
        'Suggested by `GET /v1/cities`, not restricted to it. Off that list, send ' +
          '`countryCode` too. 2–60 characters measured on the fold.',
      ),
      countryCode: str(
        'ISO 3166-1 alpha-2, checked for shape and not against a registry. Read only ' +
          'alongside `city` — sending it alone is a `400`, not a silent discard — and ' +
          'ignored when the city is one of `GET /v1/cities`.',
      ),
      avatar: str(),
      phone: str(),
      occupation: {
        type: 'string',
        enum: ['student', 'worker', 'business', 'freelancer', 'other'],
        description: 'The UI’s "Status". Not `status`, which is the account state.',
      },
      birthDate: str('ISO `YYYY-MM-DD`. Set once, corrected once.'),
      leaderboardOptIn: bool(),
    },
    response: ref('Me'),
    errors: [
      [400, '`validation_failed` — `field` says which: `username`, `phone`, `birthDate`, `occupation` (with the five values in `allowed`), `countryCode` (a city we do not know, sent without one) or `city` (a `countryCode` sent without a city, or a name that is not one).'],
      [409, '`conflict` — the username is taken, or the birthday has no corrections left.'],
    ],
  },
  'POST /v1/me/onboarded': {
    summary: 'Report onboarding finished, and claim the welcome gift',
    description:
      'Takes no body: the server already knows who is asking and whether they have asked ' +
      'before. Safe to send twice — the grant is claimed with an `UPDATE … WHERE ' +
      'onboarded_at IS NULL`, so a retry returns `granted: false` and the original stamp ' +
      'rather than a second bonus or an error. `onboardedAt` on `GET /v1/me` is null until ' +
      'this succeeds, which is how a client knows whether to offer onboarding at all.',
    tags: ['me'],
    response: ref('Onboarded'),
  },
  'GET /v1/usernames/{name}': {
    summary: 'Whether a username can be had, as the user types',
    description:
      'Applies exactly the rules the write applies, so "available" never precedes a refusal: ' +
      '3–20 characters of `a-z 0-9 . _`, runs of letters and digits joined by single dots or ' +
      'underscores, unique ignoring case, a reserved list, and a short list of words nobody ' +
      'needs to be called (reported as `reserved`). `mine` is the account asking about its own ' +
      'handle, which is available to it. When not available, `suggestions` holds up to three ' +
      'handles free right now. **Advice, not a reservation** — the write claims the name and ' +
      'can still `409`. Debounce it. 300 per hour per account.',
    tags: ['me'],
    response: obj({
      username: str('What was asked about, trimmed, not folded.'),
      available: bool(),
      mine: bool(),
      reason: { type: 'string', nullable: true, enum: ['length', 'shape', 'reserved', 'taken', null] },
      message: { type: 'string', nullable: true, description: 'The sentence the write would refuse with.' },
      suggestions: arrayOf(str()),
    }),
  },
  'GET /v1/usernames': {
    summary: 'Three free usernames for this account, before anything is typed',
    description:
      'Built from the account’s name and the part of its address before the `@`, checked ' +
      'against the table in one query. What a "create your username" step opens with. ' +
      'Advice, not a reservation. Shares the check’s 300 per hour per account.',
    tags: ['me'],
    response: obj({ suggestions: arrayOf(str()) }),
  },
  'PUT /v1/me/username': {
    summary: 'Set or change the username',
    description:
      'The same write as `PATCH /v1/me {username}` — one rule — on a route of its own, bounded ' +
      'like a write (20 per hour per account), because a handle is what other people know ' +
      'somebody by. A username cannot be removed, only changed. The website asks for one as a ' +
      'required onboarding step after the city, and asks an existing player without one once, ' +
      'before anything else.',
    tags: ['me'],
    body: { username: str('3–20 of `a-z 0-9 . _`; unique ignoring case.') },
    required: ['username'],
    response: ref('Me'),
    errors: [
      [400, '`validation_failed` naming `username` — absent, the wrong length or shape, or reserved.'],
      [409, '`conflict` naming `username` — somebody else holds it, in any case.'],
      [429, 'More than 20 changes in an hour.'],
    ],
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
      'Three separate lists, and the third is the one a toggle needs. `account` is the terms ' +
      '(`terms`, `privacy`, `marketing`, `analytics`), each with `granted`. `dataSharing` is ' +
      'the per-venue, revocable grant that lets one venue see this customer individually — ' +
      'kept separate from the terms on purpose, because bundling them is the presentational ' +
      'version of bundling the consent. `sharingWithdrawn` is the venue ids switched **off ' +
      'and not back on**.\n\n' +
      'Draw a venue’s switch from all three, in this order: a live grant in `dataSharing` is ' +
      'on; an id in `sharingWithdrawn` is off; anything else takes the account default, ' +
      '`venueSharingDefault` on `GET /v1/me`, which is **on**. Without the third list a ' +
      '"no" said before the customer has ever visited that venue reads as undecided, and the ' +
      'default then grants exactly what they refused.',
    tags: ['me', 'privacy'],
    response: {
      type: 'object',
      properties: {
        account: arrayOf({
          type: 'object',
          properties: { kind: str(), granted: bool() },
        }),
        dataSharing: arrayOf({ type: 'object' }),
        sharingWithdrawn: arrayOf(str('A venue id this customer has switched sharing off for.')),
      },
    },
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
  'GET /v1/me/export': {
    summary: 'GDPR export — everything held about this account',
    description:
      'Article 15, as a JSON document: the `account` block, roles, consents, per-venue ' +
      'data-sharing grants, the points ledger, and the rest of what the platform holds.\n\n' +
      '**The `account` block is generated from the same table the erasure is** ' +
      '(`USER_COLUMNS` in `domain/consent.ts`), so the two rights cannot disagree about ' +
      'what is personal. It used to be hand-written and had already drifted — `username`, ' +
      '`phone`, `birth_date`, `display_avatar` and `occupation` were cleared by the erasure ' +
      'and absent from the export, which is the worse direction of the two: an export that ' +
      'under-reports reads as complete, because nothing in the document says a column ' +
      'exists. It now carries **25 of the 28 columns of `users`**, up from 12.\n\n' +
      'Three are withheld and the reason is stated rather than left to be noticed. ' +
      '`password_hash` is a credential — an export is a document that ends up in a ' +
      'downloads folder, and a scrypt hash in one is an offline cracking target for an ' +
      'account that still works (Art. 15(4)). `email_norm` and `username_norm` are ' +
      'normalised duplicates of columns the export does carry, and including them would ' +
      'imply four identifiers where there are two.',
    tags: ['privacy'],
    response: { type: 'object' },
  },
  'DELETE /v1/me': {
    summary: 'GDPR erasure',
    description:
      'Article 17. Anonymises rather than deleting, so the ledger stays verifiable. ' +
      'Requires the account email as confirmation.\n\n' +
      'Generated from `USER_COLUMNS` alongside the export, which is what fixed the column ' +
      'it was missing: **`provider_ref` — the Google `sub` — survived erasure entirely and ' +
      'is now cleared.** It is a permanent cross-service identifier of a natural person and ' +
      'the single most identifying thing on the row; it went unnoticed because nothing ' +
      'reads it on an erased account, which made it invisible rather than harmless. What ' +
      'survives is accounting — the once-only grant guards, the trust tier, the balance ' +
      'cache, the created-at — and it is disclosed by the export, so nothing is held that ' +
      'neither right reaches.',
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
      { name: 'category', description: 'A taxonomy key (`halal`, `restaurant.kebabs`) — matches a category and every subcategory under it.' },
      { name: 'limit', description: 'Default 50.', schema: int() },
    ],
    response: arrayOf(ref('Venue')),
  },
  'GET /v1/categories': {
    summary: 'The venue taxonomy',
    description:
      'The eight categories in order, each with its subcategories. Keys are stable and never translated ' +
      '(`restaurant`, `restaurant.turkish`); `label` is in the reader’s language and `labels` carries all five ' +
      '(en, pl, ru, uk, uz). A venue’s `category` is one of these category keys and its `subcategory` one of the ' +
      'subcategory keys under it.',
    tags: ['catalogue'],
    response: { type: 'object' },
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
  'GET /v1/gift-cards': {
    summary: 'The gift-card catalogue',
    description:
      'Rulebook §2.1 / §9.4. `points_cost` is **derived** from the face value at 100 points per ' +
      'złoty (converted through the rate sheet for other currencies; a card with no rate is not ' +
      'listed) — the stored column is ignored. `left_this_month` is how many more of that card the ' +
      'month’s pool (20% of consumer subscription revenue) can still buy, capped by stock.',
    tags: ['wallet'],
    response: arrayOf({ type: 'object' }),
  },
  'POST /v1/gift-cards': {
    summary: 'Redeem points for a gift card',
    description:
      'Pro and Premium only, one card per account per 60 days, and only while the month’s pool ' +
      'covers the card’s face value. The price is the derived one on the shelf.',
    tags: ['wallet'],
    body: { stockId: str() },
    required: ['stockId'],
    response: { type: 'object', properties: { id: str(), code: str(), points: int() } },
    errors: [
      [403, '`entitlement_required` — gift cards are a Pro and Premium perk.'],
      [409, '`conflict` — out of stock; `reason: per_user_cap` with `nextAt`; or `reason: pool_exhausted`.'],
    ],
  },
  'POST /v1/deals/{id}/share': {
    summary: 'Record a share of a deal (pays 25, three a day, once per deal)',
    description:
      'Rulebook §7.3. Call when the share sheet completes. Pays `CONFIG.earn.dealShared` at most ' +
      '`dealSharedPerDay` times a day and once per deal per account. A share that pays nothing ' +
      'is **not an error**: `granted: false` with `reason` `already_shared`, `daily_cap` or `not_live`.',
    tags: ['deals'],
    response: {
      type: 'object',
      properties: {
        granted: bool(),
        reason: str('Null when it paid.'),
        points: int(),
        sharedToday: int(),
        perDay: int(),
        balance: int(),
      },
    },
  },
  'POST /v1/venues/{id}/reviews': {
    summary: 'Review a venue after a visit (pays 25, one per venue per 30 days)',
    description:
      'Rulebook §7.3 / §9.2. Needs a confirmed visit to the venue. Pays `CONFIG.earn.reviewAfterVisit` ' +
      'with the review; a second review of the same venue inside `reviewEveryDays` is refused.',
    tags: ['catalogue'],
    body: { rating: int('1–5.'), body: str('Optional, at most 1000 characters.') },
    required: ['rating'],
    response: {
      type: 'object',
      properties: { review: { type: 'object' }, points: int(), balance: int() },
    },
    errors: [
      [400, '`validation_failed` — `rating` is not 1–5, or `body` is too long.'],
      [403, '`forbidden` — `reason: no_visit`.'],
      [409, '`conflict` — `reason: review_window`, with `nextAt`.'],
    ],
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
  'POST /v1/gate/passes': {
    summary: 'A redemption pass: the customer shows it, the counter scans it',
    description:
      'For one voucher (`voucher_redeem`) or earned reward (`reward_redeem`) the caller holds, ' +
      'with the bill they typed. The answer carries a signed `token` (starts `plzpass.`) to draw ' +
      'as a QR, and a six-character `code` for a cashier to type when the camera cannot read the ' +
      'screen. Single use, `ttlSeconds` long, and minting a new one for the same item retires the ' +
      'last. Nothing is granted: the counter still confirms.',
    tags: ['gate'],
    body: {
      intent: { type: 'string', enum: ['voucher_redeem', 'reward_redeem'] },
      intentRef: str('The voucher or earned-reward id.'),
      amountMinor: minor('The bill, as the customer typed it'),
    },
    required: ['intentRef', 'amountMinor'],
    response: obj({
      id: str(),
      token: str(),
      code: str(),
      venueId: str(),
      intent: str(),
      intentRef: str(),
      amountMinor: int(),
      currency: str(),
      expiresAt: str(),
      ttlSeconds: int(),
    }),
    errors: [
      [400, '`invalid_amount` — zero, or above the venue’s ceiling.'],
      [404, 'Not a voucher or reward this account holds.'],
      [409, '`already_used` or `expired` — the item cannot be spent.'],
    ],
  },
  'POST /v1/gate/passes/scan': {
    summary: 'The counter scans (or types) a customer’s pass',
    description:
      'Send `token` (the scanned QR) or `code` (typed). Opens a PENDING transaction with the ' +
      'customer’s amount on it (`amount_entered_by: customer`), which the counter then confirms ' +
      'through `/v1/gate/transactions/{id}/confirm` — or corrects through `/amount` first. ' +
      'Needs `redeem` on this venue’s counter.',
    tags: ['gate', 'partner'],
    body: {
      venueId: str('The venue whose counter is scanning.'),
      token: str(),
      code: str(),
      memberId: str('Owner or manager only: who is on shift.'),
    },
    required: ['venueId'],
    response: obj({
      transaction: ref('Transaction'),
      pass: obj({
        code: str(),
        intent: str(),
        title: str('What is being redeemed, e.g. “10% off this order”.'),
        customerName: str('First name only.'),
        amountMinor: int(),
        currency: str(),
      }),
    }),
    errors: [
      [403, 'Not on this venue’s counter with `redeem`, or the pass is for another venue.'],
      [404, 'No pass with that code at this venue.'],
      [409, '`already_used` or `expired`.'],
      [422, '`invalid_trigger` — not a Paylez pass, or the signature does not verify.'],
    ],
  },
  'GET /v1/gate/passes/{id}': {
    summary: 'What became of my pass',
    description: '`status` is `live`, `scanned`, `used`, `cancelled` or `expired`. The owner of the pass only.',
    tags: ['gate'],
    response: obj({ id: str(), status: str(), code: str(), expiresAt: str(), transaction: ref('Transaction') }),
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
      'or none of them do.\n\n' +
      'The venue’s owner, a manager, or an active team member holding `earn` (for an ' +
      'earning visit) or `redeem` (for a redemption) may confirm; a team member’s confirm ' +
      'is recorded against them and comes back as `confirmedBy`. The owner’s shared ' +
      'counter device may name `memberId` to attribute the confirm to whoever is on shift.',
    tags: ['gate', 'partner'],
    body: {
      memberId: str(
        'Owner or manager only: the member to record the confirm against. Must be an active ' +
          'member of this venue holding the permission, or the confirm is refused.',
      ),
    },
    response: ref('Receipt'),
    errors: [
      [403, 'Not on this venue’s counter, a revoked member, or missing `earn`/`redeem`.'],
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
    description:
      'Only transactions still inside the 15-minute limit — one past it is refused at confirm, so it is not ' +
      'listed. A customer whose earlier scan timed out is not blocked from scanning again.',
    tags: ['gate', 'partner'],
    response: arrayOf(ref('Transaction')),
  },

  /* ── games ── */
  'GET /v1/daily': {
    summary: 'The daily check-in, the streak, and where this month’s points came from',
    description:
      'The whole daily-rewards screen in one read.\n\n' +
      'Two things on it are the server’s and must not be recomputed. `today` is the day a ' +
      'check-in is keyed on — the same slice every daily allowance in this API resets on — and ' +
      '`dayTurnsAt` is when it ends. A client that derives either from the device clock will ' +
      'tell somebody in Tashkent their streak broke while the server still thinks it is alive.\n\n' +
      '`days` and `monthSources` are **earnings, from every source**, not a list of check-ins: ' +
      'the question the screen answers is "where is this balance from", and the five points ' +
      'somebody tapped for are one row of that answer. Spends are not here at all — a ' +
      'redemption is a real entry and belongs in `GET /v1/wallet/history`.\n\n' +
      'The streak counted here is **days opened**, and it is not the one on ' +
      '`GET /v1/games/state`, which counts days *played*. Two rules about two behaviours; name ' +
      'them differently on screen or neither number means anything.',
    tags: ['daily'],
    query: [
      {
        name: 'month',
        description: '`YYYY-MM`. Defaults to the month `today` falls in. Anything else is a 400.',
        schema: str(),
      },
    ],
    response: ref('DailyCalendar'),
    errors: [[400, 'validation_failed — `month` is not `YYYY-MM`']],
  },
  'POST /v1/daily/check-in': {
    summary: 'Take today’s check-in',
    description:
      '**No body.** The server knows who is asking and what day it is, and a claim that let the ' +
      'client name either is a claim the client can aim.\n\n' +
      'Pays `CONFIG.earn.dailyCheckIn` — **a flat 5 every day** (rulebook §7.3). The response ' +
      'still names a rung of a seven-day cycle (`cycleDay`) so a ladder can be drawn, but every ' +
      'rung pays the same; it restarts at rung one on the eighth consecutive day and after a ' +
      'missed day. A streak milestone (7, 30, 100) ' +
      'arrives as **its own ledger entry**, so a balance that jumped by 70 has two rows ' +
      'explaining it rather than one that cannot be checked.\n\n' +
      '**Safe to send twice, and two different guards make it so.** A second *claim* the same ' +
      'day — a tab left open overnight, a second device — answers `granted: false` with the ' +
      'day’s real figures rather than failing, because "already done" is a success from the ' +
      'caller’s side. A retried *request* carrying the same `Idempotency-Key` is replayed from ' +
      'store and never reaches the domain, which is what hands a phone that lost the first ' +
      'reply the original body rather than a second, truthful-but-different one. Send the key.\n\n' +
      'There is no way to claim a day that has gone.',
    tags: ['daily'],
    response: ref('DailyCheckIn'),
  },
  /* ── rulebook §8: missions (`domain/missions.ts`) ── */
  'GET /v1/missions': {
    summary: 'Every mission band, with this account’s progress on each mission',
    description:
      'Render the bands **in the order sent**; the seasonal and partner bands are present only ' +
      'while an operator campaign is live. Progress is derived on the server from rounds, visits, ' +
      'the ledger and the profile — never compute it on the phone.\n\n' +
      '`status`: `locked` (the product or plan cannot do it yet), `open`, `complete` (ready to claim), ' +
      '`claimed`. `autoPaid: true` means the reward *is* an automatic bonus paid elsewhere (check-in, ' +
      'streak milestones, first visit, onboarding…): show it, never offer a claim button — except ' +
      '`daily.check_in`, which is claimed through `POST /v1/daily/check-in` (or this API’s claim, ' +
      'which calls the same thing). `rewardLabel` is what to print where the reward goes.',
    tags: ['missions'],
    response: {
      type: 'object',
      properties: {
        bands: arrayOf({
          type: 'object',
          properties: {
            key: { type: 'string', enum: ['daily', 'weekly', 'ongoing', 'once', 'seasonal', 'partner', 'learning'] },
            title: str(),
            resetsAt: { ...iso('When this band resets; null for a band that does not.'), nullable: true },
            missions: arrayOf(ref('Mission')),
          },
        }),
        unclaimed: int('Missions complete and waiting for a tap.'),
      },
    },
  },
  'POST /v1/missions/{id}/claim': {
    summary: 'Claim a completed mission',
    description:
      'No body. Credits the ledger once per mission per period (`reason: mission`). ' +
      '**409 `conflict`** when the mission is not complete, is already claimed this period, or is ' +
      'auto-paid. Send an `Idempotency-Key`.',
    tags: ['missions'],
    response: {
      type: 'object',
      properties: { mission: ref('Mission'), points: int(), balance: int() },
    },
    errors: [[404, 'not_found — no such mission'], [409, 'conflict — not claimable now']],
  },
  'GET /v1/missions/learning/{id}': {
    summary: 'A learning module (§8.7): its questions, without answers',
    tags: ['missions'],
  },
  'POST /v1/missions/learning/{id}/answers': {
    summary: 'Submit a learning module’s answers; the server grades',
    description:
      '`answers` is one option index per question, in order. Every answer right passes the module ' +
      'and completes its mission, which is then claimed like any other. The reply names the right ' +
      'answer for each question — this is teaching.',
    tags: ['missions'],
    body: { answers: arrayOf(int()) },
    required: ['answers'],
  },
  'GET /v1/games/state': {
    summary: 'Energy, streak, freezes, accuracy, today’s shared word',
    description:
      'The key is `energy` and it holds an **object** — `{ energy, max, nextAt }` — not a ' +
      'bare count. Both halves moved: it was `lives: { lives, max, nextAt }`.\n\n' +
      'Energy does not reset at midnight: one refills every `energy_regen_minutes` up to ' +
      '`daily_energy`, so the honest thing to draw next to an empty tank is `nextAt`, not ' +
      'a countdown to midnight. The client’s view is advisory; this is the truth.',
    tags: ['games'],
    response: ref('GamesState'),
  },
  'POST /v1/games/sessions': {
    summary: 'Start a round',
    description:
      'Refuses with `no_energy` when the tank is empty. **Starting costs one, win or ' +
      'lose** (rulebook §3) — so `energyLeft` on this response is the tank *after* this ' +
      'round has been paid for, and `energyNextAt` is when the next unit arrives. Any ' +
      'round the player left open is abandoned first, under the abandon route’s rule.\n\n' +
      'Send `practice: true` to turn that refusal into an **unpaid round** instead: it ' +
      'plays identically and banks nothing — no points, no streak, no energy, no ledger ' +
      'entry — and both this response and the finish carry `paid: false`. Energy still ' +
      'buys everything it bought; what it no longer buys is playing at all. Without the ' +
      'flag an empty tank is still the refusal, so a client that has an out-of-energy ' +
      'screen keeps it until it decides to offer practice.\n\n' +
      'Nothing else **refuses** a round: there is no daily points cap, and energy is the ' +
      'whole of what bounds how many rounds a day holds. What a round is *worth* is a ' +
      'separate limit and it does shrink: the decay curve pays the 1st through 6th paid ' +
      'round of the day 1 / 0.65 / 0.45 / 0.3 / 0.2 / 0.12 of its base. See `decay` and ' +
      '`roundToday` on the finish.',
    tags: ['games'],
    body: {
      gameType: gameTypeSchema(
        'One value per card, except that `poland` and `uzbekistan` are one ' +
          'local-knowledge quiz asked about two different countries — same ' +
          'protocol, same scoring, different bank — so send the one that matches ' +
          'the country on the player’s profile rather than showing both.',
      ),
      practice: {
        type: 'boolean',
        description:
          'Play on an empty tank for nothing rather than be refused. Ignored when there ' +
          'is energy — a round that can pay, pays. Optional; absent means false.',
      },
    },
    required: ['gameType'],
    response: ref('Round'),
    errors: [
      [
        409,
        '`no_energy` — the tank is empty. Was `no_lives`: a client switching on the ' +
          'string stops recognising the refusal. The detail carries `nextAt` (when the ' +
          'next energy lands) and `max`, and never `resetsAt` — energy is on a clock, not ' +
          'a day.',
      ],
    ],
  },
  'POST /v1/games/sessions/{id}/events': {
    summary: 'Report one move, and be told whether it was right',
    description:
      'Quizzes send `{index, choice}`. Word Builder sends `{index, guess}`, or ' +
      '`kind:"hint"` with `{index, position}` to reveal one letter. Memory Match sends ' +
      '`kind:"peek"` with `{index}` to turn one card, and `{a, b}` — two card positions — ' +
      'to close the move and be judged. `seq` must increase; a repeat is accepted as a ' +
      'retry and does not count twice.\n\n' +
      '**The peek is what makes Memory Match a memory game**, and it is additive: the ' +
      'protocol had only the pair, so the first card a player tapped could not be drawn ' +
      'until they had committed to a second. Peek one card, get its face back in ' +
      '`revealed`; pair the two, get both faces and the verdict. A peek is **not an ' +
      'answer** — no `correct`, no `answer`, and it is neither counted as a pair nor able ' +
      'to enlarge the board at `/finish`. It shares the one `seq` sequence with the pairs, ' +
      'so number the moves of a round, not the kinds. There is no peek allowance and no ' +
      'peek penalty, and **a peek is not a move**: Memory Match is priced on the `pair` ' +
      'events, so peeking the first card of a move — which is what the shipped client ' +
      'does — costs nothing. A peek naming a position off the board, or one already ' +
      'matched, is a `bad_request` and writes nothing.\n\n' +
      'Word Builder hints are metered per day by `word_hints_per_day` (3 free, 6 Pro, 10 ' +
      'Premium) and are refused rather than quietly stopped revealing. A hint costs a flat ' +
      '**−10 performance** — a tenth of the scale, the same wherever it is spent, where it ' +
      'used to halve the word’s own points — and it also costs the round the promotion to ' +
      'a perfect 100.',
    tags: ['games'],
    body: {
      seq: int('0-based, monotonic within the session.'),
      kind: str(
        '`answer` by default; `hint` for Word Builder; `peek` and `pair` for Memory Match.',
      ),
      payload: { type: 'object' },
    },
    required: ['seq', 'payload'],
    response: ref('EventResult'),
    errors: [
      [403, '`entitlement_required` on a hint past `word_hints_per_day`. Carries `limit` and `used`.'],
      [
        400,
        '`bad_request` on a position that is not a move: a hint past the end of the word, ' +
          'or a `peek` naming a card off the board or one already matched. Refused rather ' +
          'than clamped, and nothing is written — a refused move spends neither a `seq` ' +
          'nor a hint.',
      ],
    ],
  },
  'POST /v1/games/sessions/{id}/finish': {
    summary: 'Finish the round and bank it',
    description:
      'The score is computed from the events the server recorded — nothing the client ' +
      'totals is trusted. `report` carries `{cleared}` for the flight, which is the one ' +
      'game with no answer key and is clamped instead.\n\n' +
      '**Every game is normalised onto one 0–100 `performance` scale** (points rulebook ' +
      '§5), and the points come from that and four facts about the player:\n\n' +
      '```\n' +
      'base  = max(2, round(performance / 100 × 18))     // 2..18\n' +
      '      × 1.5 if this is the day’s featured game    // once per day\n' +
      '      × decay(roundToday)  1 · 0.65 · 0.45 · 0.3 · 0.2 · 0.12\n' +
      '      × points_multiplier  1 / 1.25 / 1.75\n' +
      '      + perfect 10 + first-ever play 25 + personal best 8\n' +
      'score = max(1, round(that))\n' +
      '```\n\n' +
      'The flat bonuses are added **after** the multiplier and are not multiplied by it. ' +
      'Every term is on the response, so the result screen can itemise the round instead ' +
      'of printing one number: `performance`, `base`, `decay`, `roundToday`, `featured`, ' +
      '`multiplier`, `bonusPerfect`, `bonusNewGame`, `bonusPersonalBest`.\n\n' +
      'How each game reaches its performance: a **quiz** is 20 per correct answer — five ' +
      'of five is 100 — plus a +5 credit, capped into the 100, when all five were answered ' +
      'within 25 s, and there is no mistake limit so all five are always asked; **Word ' +
      'Builder** is 3 words at 33 each (a clean sweep is promoted to 100), +4 per word ' +
      'solved under 30 s, **−10 per hint**; **Memory Match** is 60 for clearing the board ' +
      'plus an efficiency bonus by **moves used** — ≤10 +40, 11–14 +25, 15–18 +12, 19+ +0 ' +
      '— with a 90-second limit, past which an incomplete board is `pairs / 6 × 50`; the ' +
      '**flight** is `min(100, obstacles × 4)`, so 25 obstacles is a perfect round, and 5 ' +
      'gaps still decides whether the round was *won*.\n\n' +
      'Every clock here is the **server’s own event stamps** — there is no duration for a ' +
      'client to report, and a move count is read from the recorded `pair` events rather ' +
      'than from anything the client totals. Band boundaries are **inclusive**.\n\n' +
      'There is one rounding step and it is the last one, and it is a **round** rather ' +
      'than a floor because the published payout table is computed that way: 70% featured ' +
      'is 13 × 1.5 = 19.5 and pays 20.\n\n' +
      '**This is where the energy is spent**, one per finished round, win or lose. ' +
      '`energyLeft` on the response is therefore one lower than the `energyLeft` the ' +
      'start returned.',
    tags: ['games'],
    body: { report: { type: 'object', description: 'Flight only: `{ "cleared": 14 }`.' } },
    response: ref('Finish'),
  },

  /* ── social ── */
  'GET /v1/referrals': {
    summary: 'My code, and how the invites are going',
    description:
      '`code`, `link` (`https://www.pay-lez.com/i/<code>`), `joined` (rejected excluded), `completed`, `pointsEarned` ' +
      '(what reached *this* account, milestone included, reversals netted), the four reward figures, and `people`: ' +
      '`{ name, status: "joined"|"completed", joinedAt, completedAt, pointsAwarded }`, names as ' +
      'first name + last initial. `referredBy` and `canRedeem` describe the other direction.',
    tags: ['social'],
    response: { type: 'object' },
  },
  'POST /v1/referrals/redeem': {
    summary: 'Attach an invite code after sign-up',
    description:
      'Once per account, before its first confirmed visit, never its own code, never circular. ' +
      'Refusals carry `reason`: `unknown_code` (404), `self_referral` (400), `already_referred` ' +
      '(409), `already_visited` (409), `circular` (409); a guest is 403.',
    tags: ['social'],
    body: { code: { type: 'string', description: 'The code, or the whole invite link.' } },
    response: { type: 'object' },
  },
  /* Keys are the `{param}` form `pathOf` produces. A `:param` key matches no
     route and is silently dropped from the spec — both of these were, until
     the keys were corrected. */
  'GET /v1/referrals/codes/{code}': {
    summary: 'Who an invite code belongs to',
    description: 'Public. `{ code, name, link, inviteeReward, referrerReward }`, or 404.',
    tags: ['social'],
    response: { type: 'object' },
  },
  'GET /v1/admin/referrals': {
    summary: 'Referrals, newest first',
    tags: ['admin'],
    query: [
      { name: 'status', description: '`pending`, `completed` or `rejected`.' },
      { name: 'limit', description: 'Up to 500; default 100.' },
    ],
    response: { type: 'object' },
  },
  'GET /v1/admin/gift-cards/policy': {
    summary: 'The gift-card policy, and the pool it produces now',
    description:
      '`{ policy, pool }`. `policy.mode` is `auto` (Pro and Premium, one card per 60 days, a monthly ' +
      'budget of `autoPercent` of the live Pro and Premium plans at list price) or `manual` ' +
      '(`manual.audience` all | paid | premium, `budgetKind` amount | percent, `amountMajor` in złoty, ' +
      '`percent`, `from`/`until` YYYY-MM-DD or null, `repeat` monthly | once, `perUserEveryDays`, 0 = no limit).',
    tags: ['admin'],
    response: { type: 'object' },
  },
  'PATCH /v1/admin/gift-cards/policy': {
    summary: 'Set the gift-card policy',
    description:
      'The whole policy, in the shape `GET` answers (without `updatedAt`). Applies to the next purchase, ' +
      'and to `gift_card_priority` in every consumer\'s entitlements. Audited.',
    tags: ['admin'],
    body: { mode: str('auto or manual'), autoPercent: int('0–100') },
    required: ['mode'],
    response: { type: 'object' },
    errors: [[400, '`validation_failed` — `field` names the setting that was refused.']],
  },
  'POST /v1/admin/referrals/{id}/reject': {
    summary: 'Void a referral',
    description:
      'Terms §5: points awarded in error or through fraud are reversed. A pending referral is closed; ' +
      'a completed one also has both payouts reversed by compensating ledger entries. The five-friend ' +
      'milestone is not touched — reverse that entry separately if it should go too. Audited.',
    tags: ['admin'],
    body: { reason: str('Why. Kept on the reversal entries and the audit row.') },
    required: ['reason'],
    response: { type: 'object' },
    errors: [[409, '`conflict` — already rejected.'], [404, '`not_found` — no such referral.']],
  },
  'GET /v1/leaderboard/{scope}': {
    summary: 'The weekly board: `city`, `country` or `global`',
    description:
      'Everyone is ranked; only opted-in players are listed. If you have not opted in ' +
      'you still see your own rank, with `hidden: true`. Any other scope is a 404.',
    tags: ['social'],
    query: [
      { name: 'city', description: '`city` scope. Defaults to the account’s city.' },
      { name: 'country', description: '`country` scope. Defaults to the account’s country.' },
      { name: 'limit', description: 'Default 20.', schema: int() },
    ],
    response: ref('Board'),
  },
  'GET /v1/leaderboard/friends': { summary: 'The friends board', tags: ['social'], response: ref('Board') },

  /* ── team: Staff and Manager workspaces (server/TEAM.md) ──
     Every route here is `auth: 'user'`; the venue question — owner, manager,
     or an active member holding a permission — is answered in the handler, on
     every request, so a revoked member is refused on the very next call. */
  'GET /v1/partner/venues/{venueId}/team': {
    summary: 'The venue’s team',
    description:
      'Owner, admin, or this venue’s manager. Revoked members are left out; a manager sees ' +
      'the whole list but may only change cashiers, shift leads and custom roles.',
    tags: ['team'],
    response: { type: 'object', properties: { members: arrayOf(ref('TeamMember')) } },
    errors: [[403, 'Not the owner or a manager of this venue.']],
  },
  'POST /v1/partner/venues/{venueId}/team': {
    summary: 'Add a team member, and get their join code once',
    description:
      '`perms` may be partial: missing keys come from the role’s template. `code` is six ' +
      'digits, single use, valid for 7 days, stored only as a keyed hash — **it is shown in ' +
      'this response and never again**; `…/code` re-issues. At most 50 non-revoked members ' +
      'per venue.',
    tags: ['team'],
    body: {
      name: str(),
      role: { type: 'string', enum: ['manager', 'shiftlead', 'cashier', 'custom'] },
      perms: ref('TeamPerms'),
    },
    required: ['name', 'role'],
    response: {
      type: 'object',
      properties: { member: ref('TeamMember'), code: str('Six digits. Shown once.') },
    },
    errors: [
      [400, 'An unknown permission key or a non-boolean value.'],
      [403, 'A manager adding a manager.'],
      [409, '`cap_reached` — 50 members.'],
    ],
  },
  'PATCH /v1/partner/venues/{venueId}/team/{memberId}': {
    summary: 'Change a member’s role or permissions',
    description:
      'A role change starts from the new role’s template; `perms` then overrides it. A ' +
      'manager may not edit, promote to, or demote a manager. A member of another venue is ' +
      '404.',
    tags: ['team'],
    body: {
      role: { type: 'string', enum: ['manager', 'shiftlead', 'cashier', 'custom'] },
      perms: ref('TeamPerms'),
    },
    response: { type: 'object', properties: { member: ref('TeamMember') } },
  },
  'DELETE /v1/partner/venues/{venueId}/team/{memberId}': {
    summary: 'Revoke a member',
    description:
      'Immediate: their workspace disappears from `GET /v1/me/workspaces`, their outstanding ' +
      'code dies, and their next QR, confirm or counter read is a 403. A manager may not ' +
      'revoke a manager, themselves included.',
    tags: ['team'],
  },
  'POST /v1/partner/venues/{venueId}/team/{memberId}/code': {
    summary: 'Re-issue a join code',
    description:
      'The old code stops working at once. For an active member (a new phone) the old account ' +
      'stays linked until the new code is redeemed.',
    tags: ['team'],
    response: { type: 'object', properties: { code: str('Six digits. Shown once.') } },
  },
  'POST /v1/team/join': {
    summary: 'Join a venue’s team with a code',
    description:
      'Any signed-in, non-guest account. Wrong, expired, used and revoked codes are one ' +
      'answer — `404 not_found` — so a guess learns nothing. Five failures an hour per ' +
      'account **or** per connection block the next attempt before the code is even looked ' +
      'at, a right one included.',
    tags: ['team'],
    body: { code: str('Six digits.') },
    required: ['code'],
    response: { type: 'object', properties: { workspace: ref('Workspace') } },
    errors: [
      [403, 'A guest account.'],
      [404, '`not_found` — no such live code.'],
      [409, '`conflict` — the venue’s own owner, or already on this team. Costs no attempt.'],
      [429, '`rate_limited`, with `retryAfterMinutes`.'],
    ],
  },
  'GET /v1/me/workspaces': {
    summary: 'The workspace switcher',
    description:
      '`personal` always first, then owned venues, then active memberships (managers before ' +
      'staff). A revoked membership is simply absent.',
    tags: ['team', 'me'],
    response: { type: 'object', properties: { workspaces: arrayOf(ref('Workspace')) } },
  },
  'GET /v1/team/{venueId}/counter': {
    summary: 'The staff counter',
    description:
      'Anybody on this venue’s counter: the owner, a manager, or an active member. Sections ' +
      'the member’s `perms` do not cover arrive empty or null.',
    tags: ['team'],
    query: [
      {
        name: 'memberId',
        description:
          'Owner or manager only: show the counter as that member would see it — the shared ' +
          '“Who’s on shift?” device. A staff login naming anybody else is 403.',
      },
    ],
    response: ref('Counter'),
  },
  'POST /v1/team/{venueId}/shift': {
    summary: 'Start or end a shift',
    description:
      'A staff login may start or end only its own. The owner’s shared device must name ' +
      '`memberId` (400 otherwise); a manager’s defaults to themselves. Only an active member ' +
      'can be on shift.',
    tags: ['team'],
    body: { action: { type: 'string', enum: ['start', 'end'] }, memberId: str() },
    required: ['action'],
    response: { type: 'object', properties: { member: ref('TeamMember') } },
  },
  'POST /v1/team/{venueId}/running/{id}/pause': {
    summary: 'Pause or resume something the venue is running',
    description:
      'Needs `pause`. Runs through the owner’s own functions, so a shift lead resuming a deal ' +
      'passes exactly the checks the owner would.',
    tags: ['team'],
    body: { paused: bool() },
    required: ['paused'],
    response: { type: 'object', properties: { item: { type: 'object' } } },
  },
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
      'Answers any question about Paylez, the account’s own points, wallet, games and missions, ' +
      'the places on Paylez and the newcomer’s guide. With a model configured on the server ' +
      '(`PAYLEZ_LLM=live`) Claude answers in the reader’s language from tools bound to this ' +
      'account, and every figure is checked against what they returned; otherwise, or when the ' +
      'model fails, a keyword router answers. **The response shape is the same either way** — ' +
      'render `facts` and `results`, not the sentence alone. A model answer can take several ' +
      'seconds (the server gives up at 15 and answers from the router), so set no client timeout under ~20 s.\n\n' +
      'Metered per day by `assistant_uses_per_day` — 5 free, 20 on Pro, effectively ' +
      'uncapped on Premium — and **refused, never quietly degraded**, because a worse ' +
      'answer for an invisible reason is how somebody learns to distrust an assistant. ' +
      'An ask that names no `sessionId` is given one, and a `sessionId` belonging to ' +
      'somebody else is a `404`.',
    tags: ['assistant'],
    body: { text: str('At most 500 characters.'), sessionId: str('Keeps the thread; optional.') },
    required: ['text'],
    response: ref('Answer'),
    errors: [
      [403, '`entitlement_required` past `assistant_uses_per_day`. Carries `limit` and `used`.'],
      [404, '`not_found` — no such conversation, or it is not yours.'],
    ],
  },
  'GET /v1/assistant/sessions/{id}': { summary: 'The transcript', tags: ['assistant'], response: arrayOf({ type: 'object' }) },

  /* ── partner companion (the mobile dashboard) ── */
  'GET /v1/partner/venues': { summary: 'Venues this account owns', tags: ['partner'], response: arrayOf({ type: 'object' }) },
  'GET /v1/partner/venues/{id}/today': {
    summary: 'Today: customers, sales, what needs confirming',
    description:
      '**Today is the venue’s own calendar day**, read off `venue_visits.local_day`. It used to be counted ' +
      'from UTC midnight, which is 01:00–02:00 in Kraków. `period` is that day as `YYYY-MM-DD` — it was, ' +
      'wrongly, the month — and `timezone` names the clock. `pendingConfirmations` leaves out pending scans ' +
      'past the gate’s 15-minute limit, which can no longer be confirmed.',
    tags: ['partner'],
    response: {
      type: 'object',
      properties: {
        period: str('The venue-local day, `YYYY-MM-DD`.'),
        timezone: str(),
        customers: ref('Metric'),
        visits: ref('Metric'),
        salesMinor: ref('Metric'),
        pendingConfirmations: int(),
      },
    },
  },
  'GET /v1/partner/venues/{id}/series': {
    summary: 'The day-by-day series, and the same span before it',
    description:
      '`days` **venue-local** calendar days ending today, zero-filled: `series` always has exactly `days` rows, ' +
      'oldest first. `totals` covers the window and `previous` the same number of days before it. `customers` ' +
      'is distinct over the span, not the sum of the days. `newCustomers` is **null below the minimum cohort** — ' +
      'the floor `overview.newCustomers` takes, so the series cannot hand back a figure the overview withholds.',
    tags: ['partner'],
    query: [{ name: 'days', description: '`7`, `14`, `30` (default) or `90`. Anything else is a 400 naming `days`.' }],
    response: {
      type: 'object',
      properties: {
        days: int(),
        from: str('First local day of the window.'),
        to: str('Last local day — today.'),
        timezone: str(),
        currency: str(),
        series: arrayOf({
          type: 'object',
          properties: {
            day: str('`YYYY-MM-DD`, venue-local.'),
            visits: int(),
            customers: int(),
            salesMinor: minor('Sales that day'),
            claims: int(),
            vouchersRedeemed: int(),
            rewardsRedeemed: int(),
          },
        }),
        totals: { type: 'object', description: 'visits, customers, newCustomers (nullable), salesMinor, claims, vouchersRedeemed, rewardsRedeemed.' },
        previous: { type: 'object', description: 'The same totals for the span before.' },
      },
    },
    errors: [[400, '`validation_failed` naming `days`.']],
  },
  'GET /v1/partner/venues/{id}/insights': {
    summary: 'What we noticed: three findings, each null when it does not apply',
    description:
      '`trend` — month to date against the same elapsed span of last month, null when either previous figure ' +
      'is 0. `tierReach` — how many recent customers (visited in 30 days) hold enough points for a tier, and a ' +
      'lower cost in 50-point steps that would qualify more; balances are only ever counted, and the finding is ' +
      'null below the minimum cohort. `itemVsPercent` — free-item deals against percentage deals by claims per ' +
      'impression, among deals seen 20 times or more. `unusedRewards` — rewards earned here and not collected.',
    tags: ['partner'],
    response: {
      type: 'object',
      properties: {
        period: str('`YYYY-MM`, venue-local.'),
        trend: { type: 'object', nullable: true, properties: { visitsPct: int(), vouchersPct: int() } },
        tierReach: {
          type: 'object',
          nullable: true,
          properties: { tierId: str(), pct: int(), points: int(), eligible: int(), reached: int(), lower: int(), more: int() },
        },
        itemVsPercent: { type: 'object', nullable: true, description: '`{ item, percent, multiple }`; each side `{ dealId, title, badge, claims, seen }`.' },
        unusedRewards: { type: 'object', nullable: true, properties: { n: int(), amountMinor: minor('What they still hold in the loyalty pool') } },
      },
    },
  },
  'GET /v1/partner/venues/{id}/remind': {
    summary: 'Who a reminder would reach, and what the last one did',
    description:
      'Holders of an unused reward or voucher here, still good today. `nextAllowedAt` is set while the weekly ' +
      'limit applies. `lastResult.cameBack` counts recipients with a counted visit here within 7 days of it.',
    tags: ['partner'],
    response: {
      type: 'object',
      properties: {
        rewardHolders: int(),
        voucherHolders: int(),
        audience: int('Distinct people across both.'),
        lastSentAt: { type: 'string', nullable: true },
        nextAllowedAt: { type: 'string', nullable: true },
        lastResult: { type: 'object', nullable: true, properties: { sentAt: str(), audience: int(), cameBack: int(), windowDays: int() } },
      },
    },
  },
  'POST /v1/partner/venues/{id}/remind': {
    summary: 'Remind everybody holding something unused here',
    description:
      'One inbox copy per person, pushed where the platform’s rules allow — permission, preference, quiet hours ' +
      'in the venue’s clock, the frequency cap across every venue. `inbox` is everybody, `queued` will also be ' +
      'pushed, `suppressed` is inbox only. **Once a week per venue**; the audit row is the record. Notifications ' +
      'carry `kind: "venue_reminder"`. Send an `Idempotency-Key`.',
    tags: ['partner'],
    response: {
      type: 'object',
      properties: { sentAt: str(), audience: int(), inbox: int(), queued: int(), suppressed: int(), nextAllowedAt: str() },
    },
    errors: [
      [409, '`conflict` — a reminder went out in the last 7 days; `nextAllowedAt` says when the next may.'],
      [400, '`invalid_state` with `reason: "no_audience"` — nobody holds anything to be reminded of.'],
    ],
  },
  'GET /v1/partner/venues/{id}/scans': {
    summary: 'The till log',
    description:
      'Committed transactions confirmed inside the window, newest first. **`who` and `avatar` are null unless ' +
      'the customer shares their profile with this venue** — decided in the query, never filtered afterwards. ' +
      '`first` is the transaction that made the customer’s first visit here; `counted` is whether it was a visit ' +
      'at all. `progress` is the stamp card the visit went on, reconstructed, or null. Counts are before paging.',
    tags: ['partner'],
    query: [
      { name: 'days', description: '`7`, `14`, `30` (default) or `90`.' },
      { name: 'segment', description: '`all` (default), `first` or `again`.' },
      { name: 'limit', description: '1–100, default 50.', schema: int() },
      { name: 'offset', description: 'Default 0.', schema: int() },
    ],
    response: {
      type: 'object',
      properties: {
        days: int(),
        segment: str(),
        total: int(),
        firstCount: int(),
        againCount: int(),
        currency: str(),
        timezone: str(),
        rows: arrayOf({
          type: 'object',
          properties: {
            id: str(),
            at: str(),
            who: { type: 'string', nullable: true },
            avatar: { type: 'string', nullable: true },
            first: bool(),
            counted: bool(),
            intent: { type: 'string', enum: ['earn', 'voucher_redeem', 'reward_redeem'] },
            spentMinor: minor('The bill'),
            discountMinor: minor('The discount given'),
            points: int(),
            receipt: str('`#` and four readable characters, stable per transaction.'),
            site: { type: 'object' },
            progress: { type: 'object', nullable: true, properties: { campaignId: str(), campaign: str(), done: int(), need: int(), rewardEarned: bool() } },
          },
        }),
      },
    },
    errors: [[400, '`validation_failed` naming `days`, `segment`, `limit` or `offset`.']],
  },
  'GET /v1/partner/venues/{id}/audiences': {
    summary: 'How many people each targeting segment is, and how many a push reaches',
    description:
      'The segments as deal targeting reads them: `new` (accounts in the venue’s city with no visit here), ' +
      '`returning` / `lapsed` (this venue’s customers, split at 60 days), `newcomer` (accounts in the city ' +
      'younger than 180 days) and `all`. Both figures are about people and take the minimum-cohort floor.',
    tags: ['partner'],
    response: arrayOf({
      type: 'object',
      properties: {
        segment: { type: 'string', enum: ['all', 'new', 'returning', 'lapsed', 'newcomer'] },
        reach: ref('Metric'),
        notifiable: ref('Metric'),
      },
    }),
  },
  'GET /v1/partner/venues/{id}/listing': {
    summary: 'The whole listing, as the profile form edits it',
    description:
      'The venue row in camelCase plus what it does not carry: `description` by language, `links` in order, ' +
      '`languages`, `hours`, and the latest `verification` record (or null).',
    tags: ['partner'],
    response: { type: 'object' },
  },
  'POST /v1/partner/venues/{id}/counter/lookup': {
    summary: 'The counter tool: who a handle or a code belongs to',
    description:
      'A leading `@` is a handle. Otherwise a handle-shaped string is tried as a handle first and then as a ' +
      'code; a voucher (`PLZ-…`) or reward code is matched **at this venue only**, and only while it can still ' +
      'be spent. Every miss — unknown, another venue’s, used, expired, a banned or erased account — is one 404. ' +
      '`name` and `avatar` are null unless the customer shares with this venue. Writes nothing.',
    tags: ['partner'],
    body: { code: str('`@handle`, a voucher code or a reward code. Case does not matter.') },
    required: ['code'],
    response: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['customer', 'voucher', 'reward'] },
        customer: {
          type: 'object',
          properties: {
            userId: str(),
            handle: { type: 'string', nullable: true },
            name: { type: 'string', nullable: true },
            avatar: { type: 'string', nullable: true },
            firstVisit: bool(),
            stamps: arrayOf({ type: 'object', properties: { campaignId: str(), campaign: str(), done: int(), need: int() } }),
          },
        },
        voucher: { type: 'object', description: 'On `kind: "voucher"`: `{ id, code, discountPct, maxDiscountMinor, expiresAt }`.' },
        reward: { type: 'object', description: 'On `kind: "reward"`: `{ id, code, label, costMinor, expiresAt }`.' },
      },
    },
    errors: [[404, '`not_found` — the one answer for every miss.']],
  },
  'POST /v1/partner/venues/{id}/counter': {
    summary: 'The counter tool: record a sale for a customer at the till',
    description:
      'Resolves the code as the lookup does, then runs the gate’s own steps with the caller as cashier — so it ' +
      'pays exactly what a QR scan of the same bill pays, and is refused for the same reasons. A failure after ' +
      'the transaction opened cancels it. The receipt never carries the customer’s balance or next tier. Staff ' +
      'cannot record a sale to themselves or to the venue’s owner. Audited as `gate.counter`. Send an ' +
      '`Idempotency-Key` per press.',
    tags: ['partner'],
    body: { code: str(), amountMinor: minor('The bill, in the venue’s currency') },
    required: ['code', 'amountMinor'],
    response: {
      type: 'object',
      properties: {
        lookup: { type: 'object', description: 'The lookup the sale acted on, as `…/counter/lookup` returns it.' },
        receipt: {
          type: 'object',
          properties: {
            transactionId: str(),
            amountMinor: minor('The bill'),
            currency: str(),
            pointsGranted: int(),
            discountMinor: minor('The discount applied'),
            stamped: bool(),
            visitCounted: bool('False under the minimum bill, inside the cooldown, or a second visit that day.'),
            rewardEarned: { type: 'object', nullable: true, properties: { label: str(), code: str() } },
          },
        },
      },
    },
    errors: [
      [404, '`not_found` — no customer, voucher or reward here matches the code.'],
      [409, '`conflict` — the customer already has a transaction open here; or a gate refusal (`expired`, `already_used`, `budget_exhausted`).'],
      [400, '`invalid_amount` — zero, or above the venue’s ceiling.'],
      [403, '`forbidden` — a sale to the caller’s own account or the owner’s.'],
    ],
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
    description:
      'The same body `GET …/overview` returns as `budget`. On this partner body only, each rung of `tiers` also ' +
      'carries its take-up against the current budget — `issuedCount`, `redeemedCount`, `activeCount`, ' +
      '`spentMinor` — and `active`; a rung switched off while its vouchers are still out is listed with ' +
      '`active: false, available: false`. Σ `spentMinor` equals `voucher.spent`. The public venue page’s ladder ' +
      'carries none of this.',
    tags: ['partner'],
    response: ref('Budget'),
  },
  'PUT /v1/partner/venues/{id}/budget': {
    summary: 'Set the month’s budget, or the loyalty pool on its own',
    description:
      'Send `totalMinor` (and optionally `loyaltyBp`) to cut both pools from one total, **or** `loyaltyMinor` alone ' +
      'to set the loyalty pool’s base and leave the voucher pool where it is — the server works out the total and ' +
      'the split (to one basis point of the total, the split’s stored resolution). Either is refused with ' +
      '`409 conflict` when it would leave a pool below what it has already spent or reserved.',
    tags: ['partner'],
    body: {
      totalMinor: minor('The total both pools are cut from'),
      loyaltyBp: int('The loyalty share in basis points, 0–10000'),
      loyaltyMinor: minor('The loyalty pool’s base; the voucher pool is left alone'),
    },
    response: ref('Budget'),
  },
  'PATCH /v1/partner/venues/{id}/voucher-economics': {
    summary: 'The owner’s average transaction, its automatic switch, and “most off one voucher”',
    description:
      'Each key is optional and `null` clears a figure. `averageCheckMinor` is the average transaction the owner ' +
      'types; `averageCheckAuto: true` replaces it with the median of the venue’s confirmed sales over the last ' +
      '30 days (whatever there are — the owner judged it enough), falling back to the typed figure while there ' +
      'are none. `maxVoucherMinor`, when set, is every rung’s cap; the rungs keep their own caps underneath ' +
      '(`tierMaxDiscountMinor` on the partner ladder). Every voucher reserve and estimate uses these. Answers ' +
      'with the same body as `GET …/budget`, where `averageCheck` carries `mode`, `ownerMinor` and `salesMinor` ' +
      'and the body carries `maxVoucherMinor`.',
    tags: ['partner'],
    body: {
      averageCheckMinor: { type: 'integer', nullable: true, description: 'Minor units of the venue’s currency, ≥ 1, or null' },
      averageCheckAuto: bool('Use the median of the venue’s own sales'),
      maxVoucherMinor: { type: 'integer', nullable: true, description: 'Minor units, ≥ 1, or null for each rung’s own cap' },
    },
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
    description:
      'A bare `YYYY-MM-DD` means **the whole of that day in the venue’s clock** and is stored as its last ' +
      'millisecond; an instant is stored as sent. The date must be later than the current end and not already ' +
      'past. Extending an **expired** deal puts it back live, so it passes the same gates as publishing.',
    tags: ['partner'],
    body: { validTo: iso('The new end of the window, or a bare day') },
    required: ['validTo'],
    response: { type: 'object' },
    errors: [
      [400, '`validation_failed` (not a date) or `bad_request` (not later, or already past).'],
      [403, '`not_verified` or `entitlement_required` when reviving an expired deal.'],
    ],
  },
  'GET /v1/partner/venues/{id}/campaigns': {
    summary: 'Stamp campaigns and how they are doing',
    description:
      'Every column of the campaign plus `members`, `earned`, `redeemed`, and — additive — `near` (cards one ' +
      'stamp from paying out, active campaigns only), `available` and `expired` rewards, and `reserved_minor`, ' +
      'what the uncollected rewards still hold in the loyalty pool.',
    tags: ['partner'],
    response: arrayOf({ type: 'object' }),
  },
  'PATCH /v1/partner/campaigns/{id}': {
    summary: 'Edit a campaign',
    description:
      'Every field optional; the campaign is validated as it will be after the edit. Rewards already earned ' +
      'keep the cost they were reserved at. `minSpendMinor: null` clears the override. Answers with the row as ' +
      '`GET …/campaigns` lists it. Audited as `campaign.update`.',
    tags: ['partner'],
    body: {
      name: str(),
      rewardLabel: str(),
      rewardCostMinor: minor('What the reward costs the venue, at least 1'),
      visitsRequired: int('1–50.'),
      minSpendMinor: { type: 'integer', nullable: true, description: 'At least 0; `null` clears the override.' },
      rewardValidDays: int('1–365.'),
      priority: int('0–100.'),
      recurring: bool(),
    },
    response: { type: 'object' },
    errors: [[400, '`validation_failed` naming the field.']],
  },
  'POST /v1/partner/campaigns/{id}/status': {
    summary: 'Pause, end or resume a campaign',
    description:
      'Pausing keeps every earned reward valid and reserved. **Resuming counts against `active_campaigns`**, ' +
      'exactly as creating one does — a venue could otherwise hold any number by pausing and resuming.',
    tags: ['partner'],
    body: { status: { type: 'string', enum: ['active', 'paused', 'ended'] } },
    required: ['status'],
    response: { type: 'object', properties: { status: str() } },
    errors: [[403, '`entitlement_required` — resuming would exceed the plan’s `active_campaigns`.']],
  },
  'GET /v1/partner/venues/{id}/push-quota': {
    summary: 'This month’s push allowance, and what the sent pushes did',
    description:
      '`funnel` (additive) sums this month’s sent pushes: `sent` is who each was actually pushed to (after the ' +
      'platform’s frequency cap), `delivered` what the push provider confirmed, `opened` opens carrying the push ' +
      'id, `cameIn` recipients who then made a counted visit within a week — each once.',
    tags: ['partner'],
    response: {
      type: 'object',
      properties: {
        period: str(),
        quota: int(),
        used: int(),
        remaining: int(),
        funnel: { type: 'object', properties: { sent: int(), delivered: int(), opened: int(), cameIn: int() } },
      },
    },
  },
  'GET /v1/partner/venues/{id}/customers': {
    summary: 'Customers who share their profile with this venue',
    description:
      'Rows gain two optional keys, **absent rather than null** when unknown: `tierPct`, the highest discount ' +
      'this customer bought a voucher for here, and `spendTrend` (`up` / `down` / `flat`), their last 30 days of ' +
      'spend here against the 30 before. Every row also carries `vouchersIssued` (bought here, any state but ' +
      'cancelled) and `vouchersUsed` (of those, redeemed); the detail carries the same two plus `sharingSince`, ' +
      'when the current sharing grant began. The `status` filter now applies before paging, and an unknown `sort` or ' +
      '`status` is a 400.',
    tags: ['partner'],
    query: [
      { name: 'sort', description: '`spend` (default), `visits` or `recent`.' },
      { name: 'status', description: '`new`, `regular`, `lapsed`, `at_risk` or `high_value`.' },
      { name: 'limit', description: 'Default 50.', schema: int() },
      { name: 'offset', description: 'Default 0.', schema: int() },
    ],
    response: { type: 'object' },
    errors: [[403, '`entitlement_required` — `identified_profiles`.'], [400, '`validation_failed` naming `sort` or `status`.']],
  },
  'POST /v1/partner/venues': {
    summary: 'List a venue',
    description:
      'Also takes the listing’s non-column parts in the same request — `description` (language → text), `links` ' +
      '(`[{kind, value}]`, one per kind) and `languages` (two-letter codes). `timezone` must be one the clock ' +
      'library knows; `currency` and `countryCode` are upper-cased. Answers with the venue row.',
    tags: ['partner'],
    body: {
      name: str(),
      category: str(KIND_CATEGORY),
      subcategory: str(KIND_SUBCATEGORY),
      city: str(),
      timezone: str('An IANA zone, e.g. `Europe/Warsaw`.'),
      currency: str('ISO 4217.'),
      description: { type: 'object', additionalProperties: str() },
      links: arrayOf({ type: 'object', properties: { kind: str(), value: str() } }),
      languages: arrayOf(str()),
    },
    required: ['name', 'category', 'city'],
    response: { type: 'object' },
    errors: [[400, '`validation_failed` naming the field — `category` (off the tree, with `allowed`), `subcategory` (not under the category), `timezone`, `currency`, `links`, `languages`, `description`.']],
  },
  'PATCH /v1/partner/venues/{id}': {
    summary: 'Edit the listing',
    description:
      'Every field optional. `description` upserts per language (`""` removes one), `links` and `languages` ' +
      'replace their sets. **An explicit `null` clears** `subcategory`, `address`, `priceRange`, `phone`, ' +
      '`email` and `imageUrl`; `name`, `category` and `city` cannot be cleared (400). An absent key leaves the ' +
      'field alone. Answers with the venue row; `GET …/listing` reads the whole listing back.',
    tags: ['partner'],
    body: {
      name: str(),
      category: str(KIND_CATEGORY + ' A new category without a `subcategory` beside it clears the old subcategory.'),
      subcategory: { type: 'string', nullable: true, description: KIND_SUBCATEGORY + ' Sent alone, it must be under the stored category.' },
      address: { type: 'string', nullable: true },
      priceRange: { type: 'string', nullable: true },
      phone: { type: 'string', nullable: true },
      email: { type: 'string', nullable: true },
      imageUrl: { type: 'string', nullable: true },
      description: { type: 'object', additionalProperties: str() },
      links: arrayOf({ type: 'object', properties: { kind: str(), value: str() } }),
      languages: arrayOf(str()),
    },
    response: { type: 'object' },
    errors: [[400, '`validation_failed` naming the field — including a `null` sent for `name`, `category` or `city`, a category off the tree and a subcategory not under its category.']],
  },
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
  'GET /v1/plans': {
    summary: 'Available plans and their entitlements',
    description:
      'Consumer: Free, Pro, Premium. Partner: Starter, Growth, Scale (Chain is retired and its ' +
      'subscribers were moved to Scale). **No plan is sold with a free trial** — `trial_days` ' +
      'is 0 on all of them. Each plan carries its `terms`, the commitment ladder it is sold on ' +
      '(1, 3, 6 and 12 months at 0/10/18/25 percent off; consumer plans only), and its `prices`: ' +
      'the per-market price list as `{currency, months, priceMinor, totalMinor}` rows — ' +
      '`priceMinor` per month on that commitment, `totalMinor` one invoice, in the currency’s own ' +
      'minor units (UZS has none). Partner: Growth PLN 14900 monthly / 11900 a month annual, ' +
      'UZS 149000 / 119000; Scale PLN 34900 / 27900, UZS 349000 / 279000; Starter has none. ' +
      'Show a market’s own row when the reader’s currency has one: a so’m price is not a ' +
      'converted złoty one. `price_minor` / `currency` stay the home-market (PLN) monthly price.',
    tags: ['billing'],
    query: [{ name: 'audience', description: '`consumer` or `partner`.' }],
    response: arrayOf({ type: 'object' }),
  },
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
  /* ── subscription passes ── */
  'GET /v1/partner/venues/{id}/passes': {
    summary: 'The Passes screen: four stat cards and a card per pass',
    description:
      'Owner, admin or this venue’s manager. Every revenue figure is the **contracted** price — no ' +
      'payment rail exists for venue passes, so nothing is collected. `recurringMinor` is each ' +
      '*active* subscription (not trialing, not cancelled, on a pass that is not closed) at the price ' +
      'its current period is locked at, spread over its billing period. "This month" is the ' +
      'venue-local month in `month`.',
    tags: ['passes', 'partner'],
    response: obj({
      month: str('YYYY-MM'),
      currency: str(),
      stats: obj({
        activeSubscribers: int(),
        livePasses: int(),
        recurringMinor: minor('Recurring revenue a month'),
        redemptionsThisMonth: int('Uses, counting quantity.'),
        upsell: ref('PassUpsell'),
      }),
      payouts: obj({ connected: bool(), available: bool() }),
      subscribeAvailable: bool('Whether customers can subscribe in the app (`PAYLEZ_PASS_SUBSCRIBE`).'),
      passes: arrayOf({
        allOf: [ref('Pass'), obj({ stats: obj({ subscribers: int(), usedThisMonth: int(), recurringMinor: int() }) })],
      }),
    }),
  },
  'POST /v1/partner/venues/{id}/passes': {
    summary: 'Create a pass (always a draft)',
    description:
      'Needs the `passes` entitlement (Growth, Chain). Every field is optional; a template fills ' +
      'the *rule* (accent, cap, days, VIP’s 15%) and never a name, item or price. `null` removes a ' +
      'nullable field. `subscriberCap: 0` means no limit.',
    tags: ['passes', 'partner'],
    body: {
      template: { type: 'string', enum: ['daily', 'bundle', 'vip', 'weekend', 'custom'] },
      name: str('≤ 60.'),
      tagline: str('≤ 120.'),
      accent: { type: 'string', enum: ['teal', 'deep_green', 'purple', 'terracotta', 'ink'] },
      benefitItem: str('≤ 120. Null for a discount-only pass.'),
      discountPct: int('1–100, or null.'),
      perks: arrayOf({ type: 'string', enum: ['early_access', 'member_deals', 'skip_line', 'birthday'] }),
      capKind: { type: 'string', enum: ['per_day', 'per_week', 'per_month', 'unlimited'] },
      capCount: int('1–1000.'),
      unlimitedOk: bool('"Keep it unlimited" — required to publish an unlimited *item* pass.'),
      allowedDays: { type: 'array', items: { type: 'integer' }, nullable: true },
      fromMin: int(),
      toMin: int(),
      maxValueMinor: minor('Most off one visit'),
      seats: int('1–3.'),
      priceMinor: minor('Price per billing period'),
      billingPeriod: { type: 'string', enum: ['monthly', 'quarterly', 'annual'] },
      intro: { type: 'string', enum: ['none', 'trial_7', 'half_first'] },
      subscriberCap: int(),
      costPerUseMinor: minor('The venue’s own cost per use, for the economics panel'),
    },
    response: ref('Pass'),
    errors: [
      [403, '`entitlement_required` — `passes`.'],
      [400, '`validation_failed` naming the field.'],
      [409, '`cap_reached` — twenty open passes.'],
    ],
  },
  'GET /v1/partner/venues/{id}/passes/{passId}': {
    summary: 'One pass, with the detail view’s stats',
    tags: ['passes', 'partner'],
    response: obj({
      month: str(),
      pass: ref('Pass'),
      stats: obj({
        subscribers: int(),
        newThisMonth: int(),
        cancelledThisMonth: int(),
        recurringMinor: int(),
        redemptionsThisMonth: int(),
        perActiveSubscriber: { type: 'number', description: 'One decimal. 0 with nobody holding.' },
        upsell: ref('PassUpsell'),
      }),
    }),
  },
  'PATCH /v1/partner/venues/{id}/passes/{passId}': {
    summary: 'Edit a pass',
    description:
      'Same body as create, every field optional. A new price or rule reaches new subscribers at ' +
      'once and existing ones at their next renewal. A live or paused pass may not be edited into ' +
      'something publishing would refuse (`validation_failed` with `missing`). Closed passes: 400.',
    tags: ['passes', 'partner'],
    response: ref('Pass'),
  },
  'DELETE /v1/partner/venues/{id}/passes/{passId}': {
    summary: 'Delete a draft nobody ever held',
    tags: ['passes', 'partner'],
    response: obj({ deleted: bool() }),
    errors: [[400, '`invalid_state` — not a draft, or it has subscribers: close it instead.']],
  },
  'POST /v1/partner/venues/{id}/passes/{passId}/status': {
    summary: 'Publish, pause, resume or close a pass',
    description:
      '`publish` draft → live and `resume` paused → live both need a verified venue, the `passes` ' +
      'entitlement and a complete pass. `pause` stops sign-ups only — subscribers keep using it and ' +
      'keep renewing. `close` stops renewals; members keep it to the end of their period. Asking for ' +
      'the state it is already in returns the pass.',
    tags: ['passes', 'partner'],
    body: { action: { type: 'string', enum: ['publish', 'pause', 'resume', 'close'] } },
    required: ['action'],
    response: ref('Pass'),
    errors: [
      [400, '`invalid_state` — the transition does not exist (a draft is deleted, not closed); `validation_failed` with `missing`.'],
      [403, '`not_verified`, or `entitlement_required` — `passes`.'],
    ],
  },
  'GET /v1/partner/venues/{id}/passes/{passId}/subscribers': {
    summary: 'A pass’s subscribers — those who share their profile',
    description: 'Needs `identified_profiles`, like the Customers page, and runs the same consent rule in SQL.',
    tags: ['passes', 'partner'],
    response: ref('PassMembers'),
    errors: [[403, '`entitlement_required` — `identified_profiles`.']],
  },
  'GET /v1/partner/venues/{id}/passes/members': {
    summary: 'Every current pass holder who shares, across passes',
    description: 'For the Customers page’s subscriber chip and its "Pass membership" row.',
    tags: ['passes', 'partner'],
    response: ref('PassMembers'),
  },
  'POST /v1/partner/venues/{id}/passes/lookup': {
    summary: 'The counter: what a pass code is, and what is left on it',
    description:
      'Needs `scan` at this venue. Writes nothing. The customer’s name only when they share; a ' +
      'staff login sees first name and initial.',
    tags: ['passes', 'team'],
    body: { code: str('`PS-XXXXXX`, any case.') },
    required: ['code'],
    response: obj({
      subscription: obj({ id: str(), code: str(), status: str(), periodEnd: str() }),
      pass: obj({ id: str(), name: str(), benefitItem: { type: 'string', nullable: true }, discountPct: { type: 'integer', nullable: true }, seats: int() }),
      customer: obj({ name: { type: 'string', nullable: true } }),
      allowance: ref('PassAllowance'),
      usable: obj({ ok: bool(), reason: { type: 'string', nullable: true, enum: ['expired', 'wrong_day', 'outside_hours', 'used_up', null] } }),
    }),
    errors: [[403, 'No `scan` at this venue.'], [404, '`not_found` — no pass with that code here.']],
  },
  'POST /v1/partner/venues/{id}/passes/redeem': {
    summary: 'The counter: use a pass',
    description:
      'Needs `redeem` — the permission that already confirms voucher and reward redemptions. ' +
      '`memberId` is the shared device naming who is on shift (an active member holding `redeem`); ' +
      'the use is recorded against them in `confirmed_member_id`. A member cannot redeem their own ' +
      'pass. The allowance is counted in the venue’s day, its ISO week, or a month anchored on the ' +
      'period start, under a lock. `billMinor`, or a committed `transactionId` for this customer at ' +
      'this venue, feeds the upsell estimate.',
    tags: ['passes', 'team'],
    body: {
      code: str(),
      quantity: int('1–3, and at most the pass’s seats.'),
      billMinor: minor('The whole bill on this visit'),
      transactionId: str(),
      memberId: str(),
    },
    required: ['code'],
    response: obj({
      redemption: obj({
        id: str(),
        subscriptionId: str(),
        passId: str(),
        quantity: int(),
        billMinor: { type: 'integer', nullable: true },
        coveredMinor: { type: 'integer', nullable: true },
        transactionId: { type: 'string', nullable: true },
        redeemedAt: str(),
        confirmedBy: { type: 'object', nullable: true, properties: { memberId: str(), name: str() } },
      }),
      allowance: ref('PassAllowance'),
    }),
    errors: [
      [403, 'No `redeem` here, a member naming somebody without it, or a member’s own pass.'],
      [404, '`not_found` — no pass with that code here.'],
      [409, '`cap_reached` (with `used`, `allowance`, `resetsAt`), `expired`, `conflict` with `reason: wrong_day | outside_hours`, `already_used` (a linked sale).'],
    ],
  },
  'GET /v1/venues/{id}/passes': {
    summary: 'A venue’s live passes, as a customer sees them',
    description:
      'Paused, draft and closed passes are absent. `subscribable` is false with ' +
      '`unavailableReason: payments_unavailable` while in-app subscribing is switched off.',
    tags: ['passes', 'catalogue'],
    response: obj({ passes: arrayOf({ type: 'object' }), subscribeAvailable: bool() }),
  },
  'GET /v1/me/passes': {
    summary: 'My passes',
    description: 'Current subscriptions and anything that ended in the last 90 days, each with its code and allowance.',
    tags: ['passes', 'me'],
    response: obj({
      subscriptions: arrayOf({ allOf: [ref('PassSubscription'), obj({ pass: { type: 'object' }, allowance: ref('PassAllowance') })] }),
    }),
  },
  'POST /v1/passes/{passId}/subscribe': {
    summary: 'Subscribe to a pass — switched off',
    description:
      'There is no payment rail for venue-direct subscriptions (it needs Stripe Connect). Until one ' +
      'exists this answers `409 not_available` with `reason: payments_unavailable`, unless the ' +
      'deployment sets `PAYLEZ_PASS_SUBSCRIBE=on`.',
    tags: ['passes'],
    response: ref('PassSubscription'),
    errors: [
      [409, '`not_available` (the default), `conflict` (already held), `cap_reached` (sold out).'],
      [400, '`invalid_state` — the pass is paused or not on sale.'],
    ],
  },
  'POST /v1/me/passes/{subscriptionId}/cancel': {
    summary: 'Stop renewing a pass',
    description: 'Kept to the end of the current period, trial included, then expired.',
    tags: ['passes', 'me'],
    response: ref('PassSubscription'),
  },
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
      { name: 'gate', description: 'The amount-capture gate. The only place a venue’s value is granted.' },
      { name: 'daily', description: 'Turning up — the check-in, the streak, and the month’s earnings by source.' },
      { name: 'games', description: 'Server-scored rounds. The client never holds an answer.' },
      { name: 'missions', description: 'Missions and their claims (rulebook §8).' },
      { name: 'social', description: 'Referrals and leaderboards.' },
      { name: 'notifications', description: 'Inbox and push registration.' },
      { name: 'assistant', description: 'Grounded search and explanation.' },
      { name: 'partner', description: 'The partner dashboard and its mobile companion.' },
      { name: 'team', description: 'Staff and Manager workspaces: the team, joining, the counter. See server/TEAM.md.' },
      { name: 'passes', description: 'Subscription passes a venue sells to its customers. No payment rail yet: in-app subscribing is switched off.' },
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
  /* A documented entry whose key matches no route is dropped from the spec
     without a sound — written as `:code` instead of `{code}`, or left behind
     when a route is renamed — and the endpoint quietly degrades to a stub. Two
     had. Refuse to write rather than publish a spec that has lost them. */
  const live = new Set(allRoutes.map((route) => `${route.method} ${pathOf(route.pattern).path}`));
  const orphans = Object.keys(DOCS).filter((key) => !live.has(key));
  if (orphans.length) {
    throw new Error(`DOCS entries that match no route (use {param}, not :param): ${orphans.join(', ')}`);
  }

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
