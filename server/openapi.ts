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
              'daily_cap', 'quota_exceeded', 'quiet_hours', 'invalid_trigger',
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
              '`a-z 0-9 _` folded case-insensitively. Null until they pick one.',
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
          'Partner keys: `live_deals`, `active_campaigns`, `push_quota`, `venues`, ' +
          '`team_seats`, `vouchers`, `deep_analytics`, `benchmarks`, `assistant`, ' +
          '`identified_profiles`, `export_csv`.\n\n' +
          'Four keys are **gone**, not renamed in place: `points_expiry_months` (points ' +
          'never expire on any plan), `round_decay` (the per-game repeat curve is deleted) ' +
          'and the pair `daily_lives` / `life_regen_minutes`, which became the two energy ' +
          'keys above. The server deletes retired rows on boot, so a client that still ' +
          'reads one gets a missing key rather than a stale number. **The energy pair is ' +
          'the only thing that bounds a day**: every finished round costs one, so a full ' +
          'tank plus a day of refill is 16 rounds free, 30 on Pro, 58 on Premium. Those ' +
          'three figures have just moved — the intervals were cut from 240/180/120 while ' +
          'the ceilings stayed at 4/6/10, so what a plan buys is now almost entirely the ' +
          'clock.',
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
      pointsPerScan: int(
        'What a qualifying scan pays here. When it is positive it **overrides** the ' +
          'reader’s plan `scan_points` — a venue that typed a rate meant it, out of its own ' +
          'budget, and a subscriber does not get to overrule it. `points_multiplier` is a ' +
          'game-round rule and is never applied to a scan.',
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
          'Shape depends on the game. Quizzes: `{questions:[{index,prompt,options}], ' +
          'perCorrect, perfectBonus, speedBands}` — for `flags`, `prompt` is an ISO ' +
          'country code and the flag emoji is built from it. Word Builder: ' +
          '`{words:[{index,length,tier,letters,hint}]}`. Memory Match: `{cards,pairs}` — ' +
          'the layout stays on the server. Flight: `{target}`.\n\n' +
          '`mistakesAllowed` is **gone** from the quiz shape: there is no mistake limit ' +
          'and a quiz cannot be lost, so all five questions are asked however the first ' +
          'four went. `speedBands` is `[{throughSeconds, points}]` — inclusive ' +
          'boundaries, compared with `<=`, and paid only on a clean sweep. It is on the ' +
          'wire so a round timer draws against the server’s own numbers rather than a ' +
          'hardcoded copy of them.',
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
      '**Every finished round costs one, win or lose.** Losses only was the rule before, ' +
      'and it bounded nobody: two of the seven games cannot be lost. An *abandoned* round ' +
      'still costs nothing, and starting one costs nothing — the charge is written when ' +
      'the round is banked.\n\n' +
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
    },
  },

  Finish: {
    type: 'object',
    properties: {
      score: int(
        '`floor(raw × points_multiplier)`, and that is the whole of it. Computed ' +
          'server-side from the recorded events; never sent by the client.',
      ),
      capped: int(
        '**Always 0, and it always has been.** Nothing trims a round: there is no daily ' +
          'points ceiling and no per-game decay curve — a round pays the same whether it ' +
          'is the first of the day or the ninth. The key is kept only so an existing ' +
          'client does not break on a missing field.',
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
      'code, and — if `provisionalId` is sent — folds the guest identity in so points ' +
      'earned before signing up survive.\n\n' +
      '**It does not pay the welcome bonus.** That moved to `POST /v1/me/onboarded`, ' +
      'because an address and a password can be produced in bulk and a gift attached to ' +
      'producing them funds a farm.',
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
      '`username` is unique platform-wide (3–20 of `a-z 0-9 _`, single underscores between ' +
      'runs, some names reserved) and a clash is a `409` naming the field.\n\n' +
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
      'birthday) pays `profileComplete` once and stamps `profileCompletedAt`.',
    tags: ['me'],
    body: {
      name: str(),
      username: str('Unique. 3–20 characters of `a-z 0-9 _`.'),
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
      'Refuses with `no_energy` when the tank is empty. **Starting costs nothing and ' +
      'finishing costs one, win or lose** — so `energyLeft` on this response is what the ' +
      'player has *before* paying for the round they are about to play, and the refusal ' +
      'is enforced here because finding out at the end means finding out after the round ' +
      'was played. An abandoned round costs nothing.\n\n' +
      'Send `practice: true` to turn that refusal into an **unpaid round** instead: it ' +
      'plays identically and banks nothing — no points, no streak, no energy, no ledger ' +
      'entry — and both this response and the finish carry `paid: false`. Energy still ' +
      'buys everything it bought; what it no longer buys is playing at all. Without the ' +
      'flag an empty tank is still the refusal, so a client that has an out-of-energy ' +
      'screen keeps it until it decides to offer practice.\n\n' +
      'Nothing else refuses or shrinks a round: there is no daily points cap and no ' +
      'per-game decay curve. Energy is the whole limiter.',
    tags: ['games'],
    body: {
      gameType: gameTypeSchema(
        'Eight values, seven cards. `poland` and `uzbekistan` are one ' +
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
      'peek penalty: the round is priced on elapsed time alone and a peek is an event ' +
      'inside that span, so peeking can only ever cost. A peek naming a position off the ' +
      'board — or one already matched — is a `bad_request` and writes nothing.\n\n' +
      'Word Builder hints are metered per day by `word_hints_per_day` (3 free, 6 Pro, 10 ' +
      'Premium) and are refused rather than quietly stopped revealing. A hint **halves ' +
      'that word’s points** — it used to forfeit a tier bonus and keep a flat base, which ' +
      'charged nothing on an easy word and two thirds on a hard one — and it also costs ' +
      'the round’s clean-sweep bonus.',
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
      'The raw round, before the plan multiplier: a **quiz** pays 1 per correct answer, ' +
      '+1 for all five, and a round speed bonus of +2/+1/0 for a clean sweep in ≤10 s / ' +
      '≤15 s / longer — ceiling 8, and no mistake limit, so all five are always asked; ' +
      '**Word Builder** pays each solved word its own tier (1/2/3), **halved** if that ' +
      'word was hinted, plus 1 for solving all five first-try and hint-free; **Memory ' +
      'Match** is scored on *elapsed time alone* — ≤18 s 8, ≤23 s 6, slower 3, timed from ' +
      'the server’s own event stamps; the **flight** pays half a point per gap and is ' +
      'capped at 20 points, with 5 gaps deciding whether the round was won.\n\n' +
      'Two of those tables deal in **halves**, and the round is floored **once**, at the ' +
      'end, after the multiplier: seven gaps is 3.5, which banks 3 on the free plan and 4 ' +
      'on Pro. A client that rounds per item and compares totals will be a point low, and ' +
      'only on a paid tier.\n\n' +
      'The two timed bands are read as the span from the first recorded event to the ' +
      'last, and their boundaries are **inclusive** — the wire field is `throughSeconds` ' +
      'and it is compared with `<=`. There is no duration for a client to report.\n\n' +
      'Then `score = floor(raw × points_multiplier)`, and that is all — no decay factor, ' +
      'no daily ceiling, and `capped` is always 0. A round pays the same whether it is ' +
      'the first of the day or the ninth.\n\n' +
      '**This is where the energy is spent**, one per finished round, win or lose. ' +
      '`energyLeft` on the response is therefore one lower than the `energyLeft` the ' +
      'start returned.',
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
      'Returns structured results, not prose — render the cards, not the sentence alone.\n\n' +
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
  'GET /v1/plans': {
    summary: 'Available plans and their entitlements',
    description:
      'Consumer: Free, Pro, Premium. Partner: Starter, Growth, Chain. **No plan is sold ' +
      'with a free trial** — `trial_days` is 0 on all of them. Each plan carries its ' +
      '`terms`, the commitment ladder it is sold on (1, 3, 6 and 12 months, at 0/10/18/25 ' +
      'percent off the monthly price), so a client never has to ask twice for a price.',
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
