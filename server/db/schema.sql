-- ─────────────────────────────────────────────────────────────────────────────
-- Paylez backend — the whole schema, in one file.
--
-- Every entity named in the mobile spec §14 and the desktop spec Part E has a
-- table here. The ordering is the dependency order, so this file can be exec'd
-- top to bottom against an empty database with `PRAGMA foreign_keys = ON`.
--
-- Conventions, all of them load-bearing:
--
--   * **Money is an integer in minor units.** `amount_minor` + `currency`,
--     never a float. Formatting is the client's job (spec §3.4, Part E).
--   * **Time is UTC ISO-8601 text** (`2026-08-11T09:14:00.000Z`). Venue-local
--     resolution happens in `domain/time.ts` against `venues.timezone`; nothing
--     stores a local timestamp, because a venue can move timezone and a budget
--     period must not silently re-cut itself (Part E, "store UTC, resolve
--     local").
--   * **Nothing of value is a mutable number.** The balance is derived from
--     `points_ledger`; the budget position is derived from `budget_movements`.
--     Both have a cached column that is *reconciled* against the ledger, never
--     trusted as the source (§2.1, §4.3).
--   * **Ids are opaque text.** Rows imported from the old Base44 database keep
--     their 24-hex ids so the export stays traceable; new rows get a prefixed
--     id (`usr_…`, `txn_…`) so a stray id in a log says what it is.
--   * **Soft delete, not hard delete, for anything a foreign key points at.**
--     GDPR erasure anonymises in place (`domain/consent.ts`) so the ledger and
--     the venue's aggregates survive a user leaving — which is what "cascade or
--     anonymise" in §1.3 has to mean for an append-only ledger.
-- ─────────────────────────────────────────────────────────────────────────────

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ══════════════════════════════════════════════════════ 0. schema bookkeeping ══

CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ══════════════════════════════════════════════ 1. identity, roles, consent ══

-- §1.1. `provisional` is the onboarding identity: a device-scoped account that
-- can play the flag game and hold points before anybody signs up. It is merged
-- into a real account on sign-up and the points survive the merge, which is why
-- the ledger points at a user id that outlives the provisional state rather than
-- at a device.
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE,               -- NULL while provisional
  email_norm    TEXT UNIQUE,               -- lower(trim(email)); the lookup key
  display_name  TEXT NOT NULL DEFAULT '',
  -- scrypt, `salt:hash` hex. NULL for provisional and for OAuth-only accounts.
  password_hash TEXT,
  auth_provider TEXT NOT NULL DEFAULT 'email'
                CHECK (auth_provider IN ('email', 'google', 'apple', 'provisional')),
  provider_ref  TEXT,
  language      TEXT NOT NULL DEFAULT 'en',
  city          TEXT,
  country_code  TEXT,
  -- §2.1: derived from the ledger, cached for read speed, reconciled nightly.
  points_cache  INTEGER NOT NULL DEFAULT 0,
  -- §8.2: the city weekly board lists only opted-in users. Everyone still sees
  -- the board and their own rank; enforcement is at the query layer.
  leaderboard_opt_in INTEGER NOT NULL DEFAULT 0,
  display_avatar TEXT,
  referral_code TEXT UNIQUE,
  -- §13 trust tiers: new accounts get low caps and staff confirmation on
  -- everything; a history of confirmed transactions earns headroom.
  trust_tier    INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('provisional', 'active', 'banned', 'erased')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  -- §1.3 GDPR: the flag is set by the erasure routine, which also anonymises.
  deleted_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_city ON users (city);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

-- §1.2. Zero or more roles per account; `consumer` is implicit for everyone but
-- is stored anyway so a query never has to special-case its absence. `staff` is
-- deliberately absent from v1 and deliberately possible without a migration —
-- the check constraint is the only thing that would need widening.
CREATE TABLE IF NOT EXISTS user_roles (
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('consumer', 'partner_owner', 'manager', 'admin')),
  granted_at TEXT NOT NULL,
  PRIMARY KEY (user_id, role)
);

-- §13 device binding. One row per device seen; `user_id` is the *first* account
-- that used it, and the count of distinct accounts per device is what
-- multi-accounting detection reads.
CREATE TABLE IF NOT EXISTS devices (
  id           TEXT PRIMARY KEY,
  fingerprint  TEXT NOT NULL UNIQUE,
  platform     TEXT,
  first_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  blocked      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS device_users (
  device_id TEXT NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  seen_at   TEXT NOT NULL,
  PRIMARY KEY (device_id, user_id)
);

-- Sessions carry the *active mode* (§1.2, §9.3): one identity serves both the
-- consumer and the partner experience, and which one is live is a property of
-- the session rather than of the account.
CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  token_hash  TEXT NOT NULL UNIQUE,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  mode        TEXT NOT NULL DEFAULT 'consumer' CHECK (mode IN ('consumer', 'partner', 'admin')),
  device_id   TEXT REFERENCES devices (id) ON DELETE SET NULL,
  surface     TEXT NOT NULL DEFAULT 'web' CHECK (surface IN ('web', 'mobile')),
  created_at  TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  revoked_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- §1.3. What was consented to, and which version of the policy said it.
CREATE TABLE IF NOT EXISTS consent_records (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('terms', 'privacy', 'marketing', 'analytics')),
  policy_version TEXT NOT NULL,
  granted       INTEGER NOT NULL,
  recorded_at   TEXT NOT NULL,
  source        TEXT
);
CREATE INDEX IF NOT EXISTS idx_consent_user ON consent_records (user_id, kind);

-- §1.4 / B9a. The per-user, per-venue grant that gates every identified-customer
-- endpoint. Revocation is a timestamp rather than a delete: the whole point is
-- that behaviour before and after the revocation is auditable.
CREATE TABLE IF NOT EXISTS data_sharing_consents (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  venue_id   TEXT NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  scope      TEXT NOT NULL DEFAULT 'venue_profile',
  granted_at TEXT NOT NULL,
  revoked_at TEXT,
  policy_version TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dsc_lookup ON data_sharing_consents (venue_id, user_id, revoked_at);

-- ═══════════════════════════════════════════════════════════════ 2. venues ══

CREATE TABLE IF NOT EXISTS venues (
  id            TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users (id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'other',
  subcategory   TEXT,
  city          TEXT NOT NULL DEFAULT 'Krakow',
  country_code  TEXT NOT NULL DEFAULT 'PL',
  address       TEXT,
  lat           REAL,
  lng           REAL,
  timezone      TEXT NOT NULL DEFAULT 'Europe/Warsaw',
  currency      TEXT NOT NULL DEFAULT 'PLN',
  price_range   TEXT,
  image_url     TEXT,
  rating        REAL,
  review_count  INTEGER NOT NULL DEFAULT 0,
  phone         TEXT,
  email         TEXT,
  -- B1: a venue cannot publish live deals until it is verified.
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'pending_review', 'live', 'suspended', 'archived')),
  verified_at   TEXT,
  -- B2 amount-capture configuration, per venue. `cashier` is required for
  -- anything involving a discount (§3.4); `customer` is allowed for plain scans.
  amount_entry  TEXT NOT NULL DEFAULT 'cashier' CHECK (amount_entry IN ('cashier', 'customer')),
  min_spend_minor INTEGER NOT NULL DEFAULT 1500,
  max_amount_minor INTEGER NOT NULL DEFAULT 100000,
  -- §4.5: rolling 30-day median of confirmed amounts, or the category default
  -- until ~30 confirmed transactions exist. `avg_check_source` is what the
  -- partner notification fires on when it flips.
  avg_check_minor INTEGER,
  avg_check_source TEXT NOT NULL DEFAULT 'category' CHECK (avg_check_source IN ('category', 'computed')),
  accepts_vouchers INTEGER NOT NULL DEFAULT 1,
  -- The old database's LoyaltyConfig, which is per-venue scan economics: what a
  -- plain scan pays, and how long before the same customer may earn again. The
  -- cooldown is a *second* bound beside the one-visit-per-day rule of §5.2 —
  -- the old app let a venue set 24h and it is the same intent, so the gate takes
  -- the stricter of the two rather than replacing one with the other.
  points_per_scan INTEGER NOT NULL DEFAULT 5,
  scan_cooldown_hours INTEGER NOT NULL DEFAULT 24,
  loyalty_active  INTEGER NOT NULL DEFAULT 1,
  trial_started_at TEXT,
  trial_ends_at    TEXT,
  founding_partner INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_venues_city ON venues (city, status);
CREATE INDEX IF NOT EXISTS idx_venues_owner ON venues (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_venues_category ON venues (category, city);

-- B2: "model links as an extensible list, not two fixed fields, so Facebook /
-- TikTok can be added later without migration".
CREATE TABLE IF NOT EXISTS venue_links (
  id       TEXT PRIMARY KEY,
  venue_id TEXT NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  kind     TEXT NOT NULL,          -- instagram | website | google_maps | app_store | play_store | …
  value    TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE (venue_id, kind)
);

CREATE TABLE IF NOT EXISTS venue_hours (
  venue_id  TEXT NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  weekday   INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0 = Monday
  opens_min INTEGER,               -- minutes past venue-local midnight
  closes_min INTEGER,
  closed    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (venue_id, weekday)
);

CREATE TABLE IF NOT EXISTS venue_languages (
  venue_id TEXT NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  PRIMARY KEY (venue_id, language)
);

-- B1 verification. Kept as its own record rather than a column so the evidence
-- and the reviewer survive a re-verification.
CREATE TABLE IF NOT EXISTS verification_records (
  id           TEXT PRIMARY KEY,
  venue_id     TEXT NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  method       TEXT NOT NULL CHECK (method IN ('email_domain', 'business_details', 'manual')),
  status       TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  tax_id       TEXT,
  legal_name   TEXT,
  note         TEXT,
  reviewed_by  TEXT REFERENCES users (id) ON DELETE SET NULL,
  submitted_at TEXT NOT NULL,
  reviewed_at  TEXT
);

-- ══════════════════════════════════ 3. translations (one table, every entity) ══

-- B3 requires *translation-completeness tracking*: the backend must know which
-- languages are filled so the UI can warn and so the consumer app never shows a
-- language a deal lacks. A column per language per field cannot answer that
-- without a schema change every time a language is added, so copy lives here.
CREATE TABLE IF NOT EXISTS translations (
  entity     TEXT NOT NULL,          -- 'hot_deal' | 'venue' | 'campaign' | 'guidance_article' | …
  entity_id  TEXT NOT NULL,
  field      TEXT NOT NULL,          -- 'title' | 'description' | 'terms' | …
  language   TEXT NOT NULL,
  value      TEXT NOT NULL,
  -- B8: AI-composed copy is marked as such and shown in all languages before
  -- publish. The flag travels with the string, not with the deal.
  ai_generated INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (entity, entity_id, field, language)
);
CREATE INDEX IF NOT EXISTS idx_translations_entity ON translations (entity, entity_id);

-- ═════════════════════════════════════════════════ 4. the points ledger (§2) ══

-- Append-only. Nothing in the codebase may UPDATE or DELETE a row here; a
-- reversal is a compensating entry (§C3), never a mutation of history.
CREATE TABLE IF NOT EXISTS points_ledger (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  delta      INTEGER NOT NULL,
  reason     TEXT NOT NULL CHECK (reason IN (
               'game_win', 'scan_earn', 'referral', 'welcome_bonus',
               'voucher_redeem', 'gift_card_redeem', 'expiry', 'adjustment', 'reversal')),
  source_ref TEXT,                 -- game session, transaction, referral, voucher…
  source_kind TEXT,
  -- §12a.4: a paid tier's earn multiplier is recorded *on the entry* so earning
  -- stays auditable and the daily cap can account for it.
  multiplier REAL NOT NULL DEFAULT 1.0,
  status     TEXT NOT NULL DEFAULT 'committed'
             CHECK (status IN ('committed', 'reversed')),
  venue_id   TEXT REFERENCES venues (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  -- §2.3: earn-date + 12 months. NULL on negative entries.
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON points_ledger (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_source ON points_ledger (source_kind, source_ref);

-- §2.3 FIFO expiry. Every positive committed entry opens a lot; spends consume
-- the oldest unexpired lot first. The ledger stays immutable because the
-- consumption counter lives here rather than on the entry.
CREATE TABLE IF NOT EXISTS points_lots (
  ledger_id  TEXT PRIMARY KEY REFERENCES points_ledger (id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  earned_at  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  consumed   INTEGER NOT NULL DEFAULT 0,
  expired    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_lots_open ON points_lots (user_id, expires_at, expired);

-- §2.4 the daily points cap and the shared lives pool, one row per user per
-- venue-independent local day. The client's view of both is advisory.
CREATE TABLE IF NOT EXISTS daily_counters (
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day         TEXT NOT NULL,        -- YYYY-MM-DD in the user's own local day
  game_points INTEGER NOT NULL DEFAULT 0,
  lives_used  INTEGER NOT NULL DEFAULT 0,
  plays       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- ══════════════════════════════════════ 5. the amount-capture gate (§3) ══

-- The central record. Everything — points, stamps, discounts, estimated sales —
-- hangs off a committed row here.
CREATE TABLE IF NOT EXISTS transactions (
  id            TEXT PRIMARY KEY,
  venue_id      TEXT NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  trigger_type  TEXT NOT NULL CHECK (trigger_type IN ('qr', 'nfc', 'manual')),
  trigger_ref   TEXT,               -- the jti of the QR, or the tag uid
  intent        TEXT NOT NULL DEFAULT 'earn'
                CHECK (intent IN ('earn', 'voucher_redeem', 'reward_redeem')),
  intent_ref    TEXT,               -- issued_voucher id / earned_reward id
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'committed', 'cancelled', 'reversed')),
  amount_minor  INTEGER,            -- NULL until step 3 of the gate
  currency      TEXT NOT NULL DEFAULT 'PLN',
  amount_entered_by TEXT CHECK (amount_entered_by IN ('cashier', 'customer')),
  confirmed_by  TEXT REFERENCES users (id) ON DELETE SET NULL,
  -- what the commit granted, for the receipt and for reversal
  points_granted   INTEGER NOT NULL DEFAULT 0,
  discount_minor   INTEGER NOT NULL DEFAULT 0,
  stamp_granted    INTEGER NOT NULL DEFAULT 0,
  deal_id       TEXT REFERENCES hot_deals (id) ON DELETE SET NULL,
  -- §15 offline tolerance: the client's original timestamp is kept beside the
  -- server's, because a queued scan is validated on arrival but happened then.
  client_ts     TEXT,
  device_id     TEXT REFERENCES devices (id) ON DELETE SET NULL,
  opened_at     TEXT NOT NULL,
  confirmed_at  TEXT,
  cancelled_at  TEXT,
  cancel_reason TEXT,
  -- §13 partner dispute window
  disputed_at   TEXT,
  dispute_note  TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_txn_venue ON transactions (venue_id, status, confirmed_at);
CREATE INDEX IF NOT EXISTS idx_txn_user ON transactions (user_id, confirmed_at);
CREATE INDEX IF NOT EXISTS idx_txn_pending ON transactions (venue_id, status);

-- §3.2. Dynamic signed QR: single-use nonces, TTL 60–120s. A row is written when
-- the token is minted and marked used on first successful scan; a replay finds
-- `used_at` already set.
CREATE TABLE IF NOT EXISTS qr_nonces (
  jti        TEXT PRIMARY KEY,
  venue_id   TEXT NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  issued_at  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  used_by    TEXT REFERENCES users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_qr_expiry ON qr_nonces (expires_at);

-- §3.3 / C2. The tag never stores the venue id — the server resolves it — so a
-- tag can be reassigned or revoked instantly by UID.
CREATE TABLE IF NOT EXISTS tag_registry (
  tag_uid      TEXT PRIMARY KEY,
  venue_id     TEXT REFERENCES venues (id) ON DELETE SET NULL,
  last_counter INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'unassigned'
               CHECK (status IN ('unassigned', 'active', 'revoked')),
  batch        TEXT,
  key_version  INTEGER NOT NULL DEFAULT 1,
  registered_at TEXT NOT NULL,
  assigned_at  TEXT,
  revoked_at   TEXT
);

-- §3.2 / §13. Idempotency keys on every earning and redemption endpoint, so a
-- flaky connection cannot double-submit. The response is stored so a retry
-- returns the *same* answer rather than a conflict.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key          TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  endpoint     TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code  INTEGER,
  response     TEXT,
  created_at   TEXT NOT NULL,
  PRIMARY KEY (key, user_id, endpoint)
);

-- ═══════════════════════════════════════════════ 6. budgets and allocations ══

-- §4.2 / §5.4. One monthly budget per venue, split between two allocations.
-- Period is a calendar month in venue-local time, stored as `YYYY-MM`.
CREATE TABLE IF NOT EXISTS budgets (
  id            TEXT PRIMARY KEY,
  venue_id      TEXT NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  period        TEXT NOT NULL,             -- YYYY-MM, venue-local
  currency      TEXT NOT NULL DEFAULT 'PLN',
  total_minor   INTEGER NOT NULL,
  -- the split, in basis points, so 6000 = 60% loyalty (default 60/40)
  loyalty_bp    INTEGER NOT NULL DEFAULT 6000,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (venue_id, period)
);

-- §4.3. The three states of a pool, and the only place they change. Available is
-- never stored — it is `total − spent − reserved`, which is what makes "a pool
-- has exactly three states and they exhaust it" checkable rather than asserted.
CREATE TABLE IF NOT EXISTS budget_movements (
  id          TEXT PRIMARY KEY,
  budget_id   TEXT NOT NULL REFERENCES budgets (id) ON DELETE CASCADE,
  allocation  TEXT NOT NULL CHECK (allocation IN ('loyalty', 'voucher')),
  -- `rebalance_in` / `rebalance_out` are a pair written together (B6): money
  -- moves between the two allocations and the total does not change. `topup`
  -- raises one allocation's base and the total with it (mobile §11.2).
  kind        TEXT NOT NULL CHECK (kind IN (
                'reserve', 'release', 'debit', 'topup', 'rebalance_in', 'rebalance_out')),
  amount_minor INTEGER NOT NULL,           -- always positive; `kind` gives the sign
  source_kind TEXT,                        -- 'issued_voucher' | 'earned_reward' | 'admin'
  source_ref  TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_budget_mov ON budget_movements (budget_id, allocation);

-- ═══════════════════════════════════════════════════════ 7. vouchers (§4) ══

-- §4.1. Three tiers per venue, configured on desktop, served read-only to the app.
CREATE TABLE IF NOT EXISTS voucher_tiers (
  id             TEXT PRIMARY KEY,
  venue_id       TEXT NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  discount_pct   INTEGER NOT NULL CHECK (discount_pct BETWEEN 1 AND 100),
  points_cost    INTEGER NOT NULL,
  max_discount_minor INTEGER NOT NULL,
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  UNIQUE (venue_id, discount_pct)
);

-- §4.3. Issue reserves an *estimate*; redemption releases it and debits the
-- actual; expiry releases it back to available.
CREATE TABLE IF NOT EXISTS issued_vouchers (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  venue_id       TEXT NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  tier_id        TEXT NOT NULL REFERENCES voucher_tiers (id) ON DELETE RESTRICT,
  discount_pct   INTEGER NOT NULL,
  max_discount_minor INTEGER NOT NULL,
  points_spent   INTEGER NOT NULL,
  reserved_minor INTEGER NOT NULL,
  spent_minor    INTEGER NOT NULL DEFAULT 0,
  code           TEXT NOT NULL UNIQUE,
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'redeemed', 'expired', 'cancelled')),
  budget_id      TEXT REFERENCES budgets (id) ON DELETE SET NULL,
  transaction_id TEXT REFERENCES transactions (id) ON DELETE SET NULL,
  issued_at      TEXT NOT NULL,
  expires_at     TEXT NOT NULL,
  redeemed_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_vouchers_user ON issued_vouchers (user_id, status);
CREATE INDEX IF NOT EXISTS idx_vouchers_venue ON issued_vouchers (venue_id, status);

-- Gift cards are the other redemption path (§2.2) — points out, no venue budget
-- involved, stock managed by the platform.
CREATE TABLE IF NOT EXISTS gift_card_stock (
  id            TEXT PRIMARY KEY,
  brand         TEXT NOT NULL,
  logo          TEXT NOT NULL DEFAULT '',
  face_minor    INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'EUR',
  points_cost   INTEGER NOT NULL,
  stock         INTEGER NOT NULL DEFAULT 0,
  priority_only INTEGER NOT NULL DEFAULT 0,   -- §12a.1 "priority gift-card stock"
  active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS gift_cards (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  stock_id    TEXT NOT NULL REFERENCES gift_card_stock (id) ON DELETE RESTRICT,
  points_spent INTEGER NOT NULL,
  code        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired')),
  issued_at   TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  used_at     TEXT
);

-- ══════════════════════════════════ 8. loyalty campaigns & stamps (§5) ══

-- §5.1. Visits-only trigger, fixed-value reward, exact cost-to-partner.
-- Percentage rewards and points thresholds are rejected at validation time
-- (B5) so the two mechanics never blur.
CREATE TABLE IF NOT EXISTS campaigns (
  id                TEXT PRIMARY KEY,
  venue_id          TEXT NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  visits_required   INTEGER NOT NULL CHECK (visits_required > 0),
  reward_label      TEXT NOT NULL,
  reward_cost_minor INTEGER NOT NULL,         -- exact; drives the exact reserve
  priority          INTEGER NOT NULL DEFAULT 0,
  recurring         INTEGER NOT NULL DEFAULT 1,
  min_spend_minor   INTEGER,                  -- overrides the venue default
  reward_valid_days INTEGER NOT NULL DEFAULT 60,
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('draft', 'active', 'paused', 'ended')),
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campaigns_venue ON campaigns (venue_id, status);

CREATE TABLE IF NOT EXISTS stamp_cards (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  venue_id    TEXT NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  stamps      INTEGER NOT NULL DEFAULT 0,
  cycles      INTEGER NOT NULL DEFAULT 0,
  joined_at   TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (user_id, campaign_id)
);

-- §5.3. Reserve on earn, debit on redeem, release on expiry.
CREATE TABLE IF NOT EXISTS earned_rewards (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  venue_id       TEXT NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  campaign_id    TEXT NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  label          TEXT NOT NULL,
  cost_minor     INTEGER NOT NULL,
  reserved_minor INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'available'
                 CHECK (status IN ('available', 'redeemed', 'expired', 'cancelled')),
  code           TEXT NOT NULL UNIQUE,
  budget_id      TEXT REFERENCES budgets (id) ON DELETE SET NULL,
  transaction_id TEXT REFERENCES transactions (id) ON DELETE SET NULL,
  earned_at      TEXT NOT NULL,
  expires_at     TEXT NOT NULL,
  redeemed_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_rewards_user ON earned_rewards (user_id, status);

-- One qualifying visit per user per venue per day (§5.2, §13). The unique key
-- *is* the rule — a second scan the same day cannot insert.
CREATE TABLE IF NOT EXISTS venue_visits (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  venue_id       TEXT NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  local_day      TEXT NOT NULL,        -- YYYY-MM-DD in venue-local time
  transaction_id TEXT NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  amount_minor   INTEGER NOT NULL,
  local_hour     INTEGER NOT NULL,     -- B9 heatmap
  local_weekday  INTEGER NOT NULL,
  created_at     TEXT NOT NULL,
  UNIQUE (user_id, venue_id, local_day)
);
CREATE INDEX IF NOT EXISTS idx_visits_venue ON venue_visits (venue_id, local_day);

-- B9 "second-visit / cohort retention … needs first-seen tracking per user per
-- venue". Derivable from `venue_visits`, kept explicitly because every cohort
-- query would otherwise be a self-join over the whole visit history.
CREATE TABLE IF NOT EXISTS venue_customers (
  venue_id      TEXT NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  first_seen_at TEXT NOT NULL,
  last_seen_at  TEXT NOT NULL,
  visits        INTEGER NOT NULL DEFAULT 0,
  spend_minor   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (venue_id, user_id)
);

-- ═════════════════════════════════════════════════════ 9. hot deals (§6, B3) ══

CREATE TABLE IF NOT EXISTS hot_deals (
  id             TEXT PRIMARY KEY,
  venue_id       TEXT REFERENCES venues (id) ON DELETE CASCADE,
  -- the old export carries deals with no venue row (platform-wide promos), so
  -- this is nullable and `partner_name` keeps what was there.
  partner_name   TEXT,
  city           TEXT,
  country_code   TEXT NOT NULL DEFAULT 'PL',
  category       TEXT,
  subcategory    TEXT,
  discount_text  TEXT,
  promo_code     TEXT,
  image_url      TEXT,
  -- B3 lifecycle. `live` is *derived* from the window at read time; the stored
  -- state is what the partner set, so a paused deal does not come back to life
  -- when its window is still open.
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'scheduled', 'live', 'paused', 'expired', 'archived')),
  valid_from     TEXT,
  valid_to       TEXT,
  -- §6.2 targeting, evaluated in venue-local time
  target_weekdays TEXT,             -- CSV of 0-6, NULL = every day
  target_from_min INTEGER,          -- minutes past local midnight
  target_to_min   INTEGER,
  target_languages TEXT,            -- CSV, NULL = any
  target_audience TEXT,             -- CSV of new|returning|lapsed|newcomer
  -- §6.3 caps. Hot deals are not funded from the loyalty/voucher pools.
  cap_claims     INTEGER,
  cap_spend_minor INTEGER,
  spend_minor    INTEGER NOT NULL DEFAULT 0,
  points_required INTEGER NOT NULL DEFAULT 0,
  -- funnel counters, maintained from deal_events
  seen_count     INTEGER NOT NULL DEFAULT 0,
  opened_count   INTEGER NOT NULL DEFAULT 0,
  claimed_count  INTEGER NOT NULL DEFAULT 0,
  created_by     TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  published_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_deals_venue ON hot_deals (venue_id, status);
CREATE INDEX IF NOT EXISTS idx_deals_window ON hot_deals (status, valid_from, valid_to);

-- Seen → Opened → Claimed (§6.3). One row per event; the counters on the deal
-- are the materialised view of this table.
CREATE TABLE IF NOT EXISTS deal_events (
  id         TEXT PRIMARY KEY,
  deal_id    TEXT NOT NULL REFERENCES hot_deals (id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users (id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'open', 'claim')),
  source     TEXT,                 -- home_widget | list | push | assistant
  push_id    TEXT,                 -- §9.2 push-attributed vs organic
  transaction_id TEXT REFERENCES transactions (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deal_events ON deal_events (deal_id, event_type, created_at);

-- B4 / §9.2. One scheduled push per deal, with quota and quiet hours enforced at
-- authoring time and again at send time.
CREATE TABLE IF NOT EXISTS deal_pushes (
  id            TEXT PRIMARY KEY,
  deal_id       TEXT NOT NULL REFERENCES hot_deals (id) ON DELETE CASCADE,
  venue_id      TEXT NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  scheduled_at  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled', 'sending', 'sent', 'cancelled', 'failed')),
  targeted      INTEGER NOT NULL DEFAULT 0,
  reachable     INTEGER NOT NULL DEFAULT 0,   -- after the per-user frequency cap
  delivered     INTEGER NOT NULL DEFAULT 0,
  opened        INTEGER NOT NULL DEFAULT 0,
  came_in       INTEGER NOT NULL DEFAULT 0,
  sent_at       TEXT,
  created_at    TEXT NOT NULL,
  UNIQUE (deal_id)
);

-- B4 per-partner monthly push quota.
CREATE TABLE IF NOT EXISTS push_quotas (
  venue_id   TEXT NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  period     TEXT NOT NULL,        -- YYYY-MM venue-local
  used       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (venue_id, period)
);

-- ═══════════════════════════════════════════════════ 10. games engine (§7) ══

-- §7.1. The server owns the answer. `secret` is never serialised to a client;
-- the route layer strips it, and every scoring decision reads it from here.
CREATE TABLE IF NOT EXISTS game_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  game_type   TEXT NOT NULL CHECK (game_type IN (
                'flags', 'capitals', 'brain', 'poland', 'word_builder', 'memory_match', 'flight')),
  language    TEXT NOT NULL DEFAULT 'en',
  seed        TEXT NOT NULL,
  secret      TEXT NOT NULL,        -- JSON: answers / target word / deck layout
  state       TEXT NOT NULL DEFAULT 'active'
              CHECK (state IN ('active', 'finished', 'abandoned', 'invalidated')),
  score       INTEGER NOT NULL DEFAULT 0,
  answered    INTEGER NOT NULL DEFAULT 0,
  correct     INTEGER NOT NULL DEFAULT 0,
  life_spent  INTEGER NOT NULL DEFAULT 0,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  ledger_id   TEXT REFERENCES points_ledger (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_game ON game_sessions (user_id, started_at);

-- The client reports events; the server validates and scores. Kept for audit and
-- for anomaly detection (a session with impossible timings).
CREATE TABLE IF NOT EXISTS game_events (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES game_sessions (id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  payload    TEXT NOT NULL,
  correct    INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE (session_id, seq)
);

-- §7.3 "avoids recent repeats (track last ~40 served per user)".
CREATE TABLE IF NOT EXISTS game_recent_items (
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  game_type  TEXT NOT NULL,
  item_key   TEXT NOT NULL,
  served_at  TEXT NOT NULL,
  PRIMARY KEY (user_id, game_type, item_key)
);

-- The player's own accumulated state: streak, freezes, lifetime accuracy. The
-- balance is *not* here — it is the ledger's (§2.1).
CREATE TABLE IF NOT EXISTS player_states (
  user_id       TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  streak        INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  freezes       INTEGER NOT NULL DEFAULT 0,
  lives         INTEGER NOT NULL DEFAULT 3,
  answered      INTEGER NOT NULL DEFAULT 0,
  correct       INTEGER NOT NULL DEFAULT 0,
  last_played   TEXT,                -- YYYY-MM-DD, user-local
  difficulty    REAL NOT NULL DEFAULT 3.0,
  updated_at    TEXT NOT NULL
);

-- §7.3 the daily shared word, same for everyone, keyed to the date.
CREATE TABLE IF NOT EXISTS daily_words (
  day      TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  word     TEXT NOT NULL
);

-- The question bank the quizzes draw from, imported from CountryCapital and
-- whatever else the export carries.
CREATE TABLE IF NOT EXISTS quiz_items (
  id          TEXT PRIMARY KEY,
  bank        TEXT NOT NULL,         -- 'flags' | 'capitals' | 'brain' | 'poland'
  language    TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  answer      TEXT NOT NULL,
  distractors TEXT NOT NULL,         -- JSON array
  meta        TEXT                   -- JSON: country code, continent…
);
CREATE INDEX IF NOT EXISTS idx_quiz_bank ON quiz_items (bank, language);

CREATE TABLE IF NOT EXISTS word_bank (
  id       TEXT PRIMARY KEY,
  language TEXT NOT NULL,
  word     TEXT NOT NULL,
  tier     INTEGER NOT NULL,        -- 1 easy (3-4) | 2 medium (5-6) | 3 hard (7+)
  hint     TEXT,
  UNIQUE (language, word)
);

-- ══════════════════════════════════════ 11. referrals & leaderboards (§8) ══

CREATE TABLE IF NOT EXISTS referrals (
  id            TEXT PRIMARY KEY,
  referrer_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  referred_id   TEXT REFERENCES users (id) ON DELETE SET NULL,
  referred_email TEXT,
  code          TEXT NOT NULL,
  -- §8.1: the reward triggers on the invited user's *first confirmed scan*, not
  -- on signup, so referrals cannot be farmed with throwaway accounts.
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'completed', 'rejected')),
  points_awarded INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  completed_at  TEXT,
  UNIQUE (referred_id)
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_id, status);

-- §8.2. Weekly, snapshotted and reset by a scheduled job. `week` is the ISO week
-- key `YYYY-Www`; the snapshot rows are what makes "last week" answerable after
-- the reset.
CREATE TABLE IF NOT EXISTS leaderboard_entries (
  week       TEXT NOT NULL,
  scope      TEXT NOT NULL,          -- 'city:Krakow' | 'friends'
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  points     INTEGER NOT NULL DEFAULT 0,
  rank       INTEGER,
  PRIMARY KEY (week, scope, user_id)
);
CREATE INDEX IF NOT EXISTS idx_board ON leaderboard_entries (week, scope, points DESC);

CREATE TABLE IF NOT EXISTS friendships (
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  friend_id  TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);

-- ═══════════════════════════════════════════════════ 12. notifications (§9) ══

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  -- §9.3: tagged by mode, so a partner-owner in personal mode is not buzzed with
  -- business alerts. Both streams still accrue to the inbox.
  mode       TEXT NOT NULL DEFAULT 'consumer' CHECK (mode IN ('consumer', 'partner')),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  language   TEXT NOT NULL DEFAULT 'en',
  action_url TEXT,
  source_kind TEXT,
  source_ref TEXT,
  push_id    TEXT REFERENCES deal_pushes (id) ON DELETE SET NULL,
  delivery   TEXT NOT NULL DEFAULT 'inbox'
             CHECK (delivery IN ('inbox', 'queued', 'sent', 'suppressed', 'failed')),
  suppress_reason TEXT,             -- 'frequency_cap' | 'quiet_hours' | 'no_permission'
  read_at    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications (user_id, created_at);

CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id      TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  mode         TEXT NOT NULL CHECK (mode IN ('consumer', 'partner')),
  channel      TEXT NOT NULL CHECK (channel IN ('push', 'email', 'inbox')),
  enabled      INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, mode, channel)
);

CREATE TABLE IF NOT EXISTS push_tokens (
  id        TEXT PRIMARY KEY,
  user_id   TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  platform  TEXT NOT NULL CHECK (platform IN ('fcm', 'apns', 'web')),
  token     TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

-- ═════════════════════════════════════ 13. plans, entitlements, billing (D) ══

-- C6: "manage plan/entitlement definitions as config, so tiers and perks change
-- without deploys". Hence rows, not constants.
CREATE TABLE IF NOT EXISTS plans (
  id           TEXT PRIMARY KEY,
  audience     TEXT NOT NULL CHECK (audience IN ('consumer', 'partner')),
  code         TEXT NOT NULL,
  name         TEXT NOT NULL,
  price_minor  INTEGER NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'PLN',
  interval     TEXT NOT NULL DEFAULT 'month' CHECK (interval IN ('month', 'year', 'none')),
  trial_days   INTEGER NOT NULL DEFAULT 0,
  rank         INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
  UNIQUE (audience, code)
);

-- A plan maps to a list of entitlements. Everything that differs by tier asks
-- "what is this account entitled to", never "what did it pay" (D1).
CREATE TABLE IF NOT EXISTS plan_entitlements (
  plan_id TEXT NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
  key     TEXT NOT NULL,
  value   TEXT NOT NULL,              -- number | boolean | JSON, read by key
  PRIMARY KEY (plan_id, key)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id           TEXT PRIMARY KEY,
  -- exactly one of these two, which is what "one active subscription state per
  -- account regardless of source" (D2) is enforced against.
  user_id      TEXT REFERENCES users (id) ON DELETE CASCADE,
  venue_id     TEXT REFERENCES venues (id) ON DELETE CASCADE,
  plan_id      TEXT NOT NULL REFERENCES plans (id) ON DELETE RESTRICT,
  status       TEXT NOT NULL CHECK (status IN (
                 'trialing', 'active', 'grace', 'past_due', 'cancelled', 'expired')),
  source       TEXT NOT NULL CHECK (source IN ('stripe', 'apple', 'google', 'manual')),
  external_ref TEXT,
  started_at   TEXT NOT NULL,
  renews_at    TEXT,
  cancel_at    TEXT,
  ended_at     TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_subs_venue ON subscriptions (venue_id, status);

CREATE TABLE IF NOT EXISTS invoices (
  id           TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES subscriptions (id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL,
  tax_minor    INTEGER NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('draft', 'open', 'paid', 'void', 'refunded')),
  external_ref TEXT,
  issued_at    TEXT NOT NULL,
  paid_at      TEXT
);

-- Every webhook / S2S notification that touched a subscription, stored raw
-- before it is applied. A store's retry is then idempotent by event id.
CREATE TABLE IF NOT EXISTS billing_events (
  id          TEXT PRIMARY KEY,
  source      TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  external_id TEXT NOT NULL,
  payload     TEXT NOT NULL,
  processed_at TEXT,
  error       TEXT,
  received_at TEXT NOT NULL,
  UNIQUE (source, external_id)
);

-- ══════════════════════════════════════════ 14. platform operations (Part C) ══

-- Part E: "audit everything that authors or moves value".
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  actor_id   TEXT REFERENCES users (id) ON DELETE SET NULL,
  actor_role TEXT,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  venue_id   TEXT REFERENCES venues (id) ON DELETE SET NULL,
  before     TEXT,
  after      TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_venue ON audit_log (venue_id, created_at);

-- C3. Anomalies flagged by the runtime checks, and their adjudication.
CREATE TABLE IF NOT EXISTS fraud_cases (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN (
                'impossible_travel', 'velocity', 'burst', 'multi_account',
                'disputed_transaction', 'replay')),
  severity    TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high')),
  user_id     TEXT REFERENCES users (id) ON DELETE SET NULL,
  venue_id    TEXT REFERENCES venues (id) ON DELETE SET NULL,
  transaction_id TEXT REFERENCES transactions (id) ON DELETE SET NULL,
  device_id   TEXT REFERENCES devices (id) ON DELETE SET NULL,
  detail      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'reviewing', 'confirmed', 'dismissed')),
  resolution  TEXT,
  resolved_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_fraud_open ON fraud_cases (status, created_at);

-- C1. Approval queue for venues and moderation of partner-authored copy.
CREATE TABLE IF NOT EXISTS moderation_queue (
  id         TEXT PRIMARY KEY,
  entity     TEXT NOT NULL CHECK (entity IN ('venue', 'hot_deal', 'campaign', 'image')),
  entity_id  TEXT NOT NULL,
  venue_id   TEXT REFERENCES venues (id) ON DELETE CASCADE,
  reason     TEXT,
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by TEXT REFERENCES users (id) ON DELETE SET NULL,
  note       TEXT,
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);

-- C6. Tunable safety/economic parameters, editable without a deploy.
CREATE TABLE IF NOT EXISTS platform_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- C6. Average check by category, the fallback until a venue has ~30 confirmed
-- transactions (§4.5).
CREATE TABLE IF NOT EXISTS category_defaults (
  category        TEXT PRIMARY KEY,
  avg_check_minor INTEGER NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'PLN'
);

-- B9 category benchmarks: the cross-venue aggregation job's output, written only
-- when at least `min_venues` venues contributed.
CREATE TABLE IF NOT EXISTS benchmarks (
  id          TEXT PRIMARY KEY,
  period      TEXT NOT NULL,
  city        TEXT NOT NULL,
  category    TEXT NOT NULL,
  metric      TEXT NOT NULL,
  value       REAL NOT NULL,
  venue_count INTEGER NOT NULL,
  computed_at TEXT NOT NULL,
  UNIQUE (period, city, category, metric)
);

-- ═════════════════════════════════════════════════ 15. the assistant (§10, B8) ══

-- B8: "conversation state (turns, clarifying answers, the working draft) is held
-- server-side per session so the dialogue survives reloads and the draft is
-- reconstructable".
CREATE TABLE IF NOT EXISTS assistant_sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  venue_id   TEXT REFERENCES venues (id) ON DELETE CASCADE,
  side       TEXT NOT NULL CHECK (side IN ('consumer', 'partner')),
  language   TEXT NOT NULL DEFAULT 'en',
  draft      TEXT,                  -- JSON working draft, editable, unpublished
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assistant_messages (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES assistant_sessions (id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  text       TEXT NOT NULL,
  -- every answer is assembled from real records; this is the list of them, so an
  -- answer can be traced back to what grounded it (§10.2).
  grounding  TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (session_id, seq)
);

-- ═══════════════════════════════════════ 16. guidance content (the old DB) ══

-- The relocation guide the site's Relocate page reads, imported wholesale from
-- the old database: categories, subcategories, the service directory, the
-- long-form articles, and the news feed. Copy is multilingual and lives in
-- `translations` like everything else.
CREATE TABLE IF NOT EXISTS guidance_categories (
  id           TEXT PRIMARY KEY,
  key          TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'PL',
  icon         TEXT,
  color        TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
  UNIQUE (key, country_code)
);

CREATE TABLE IF NOT EXISTS guidance_subcategories (
  id            TEXT PRIMARY KEY,
  key           TEXT NOT NULL,
  parent_key    TEXT NOT NULL,
  icon          TEXT,
  color         TEXT,
  position      INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1,
  UNIQUE (key, parent_key)
);

-- A guidance service and a venue are the same real-world thing at different
-- stages: the directory lists everywhere useful, and a venue row exists once a
-- partner claims one. `venue_id` is that link, filled by the import for every
-- service that a partner already runs a campaign on.
CREATE TABLE IF NOT EXISTS guidance_services (
  id            TEXT PRIMARY KEY,
  venue_id      TEXT REFERENCES venues (id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  category_key  TEXT,
  subcategories TEXT,               -- JSON array
  city          TEXT,
  country_code  TEXT NOT NULL DEFAULT 'PL',
  country_codes TEXT,               -- JSON array; some services span countries
  address       TEXT,
  lat           REAL,
  lng           REAL,
  phone         TEXT,
  email         TEXT,
  price_range   TEXT,
  rating        REAL,
  review_count  INTEGER NOT NULL DEFAULT 0,
  image_url     TEXT,
  accepts_vouchers INTEGER NOT NULL DEFAULT 0,
  voucher_limit INTEGER,
  active        INTEGER NOT NULL DEFAULT 1,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gservices ON guidance_services (country_code, category_key, active);

CREATE TABLE IF NOT EXISTS guidance_service_links (
  service_id TEXT NOT NULL REFERENCES guidance_services (id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  value      TEXT NOT NULL,
  PRIMARY KEY (service_id, kind)
);

CREATE TABLE IF NOT EXISTS guidance_articles (
  id           TEXT PRIMARY KEY,
  category_key TEXT,
  category_id  TEXT,
  country_code TEXT NOT NULL DEFAULT 'PL',
  position     INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_articles ON guidance_articles (country_code, category_key, active);

CREATE TABLE IF NOT EXISTS news_items (
  id           TEXT PRIMARY KEY,
  country_code TEXT NOT NULL DEFAULT 'PL',
  icon         TEXT,
  color        TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1,
  published_at TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS community_profiles (
  id           TEXT PRIMARY KEY,
  user_id      TEXT REFERENCES users (id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email        TEXT,
  city         TEXT,
  country_code TEXT,
  work         TEXT,
  bio          TEXT,
  interests    TEXT,
  languages    TEXT,               -- JSON array
  telegram     TEXT,
  instagram    TEXT,
  whatsapp     TEXT,
  visible      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_recommendations (
  id           TEXT PRIMARY KEY,
  user_id      TEXT REFERENCES users (id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  city         TEXT,
  country_code TEXT,
  category_key TEXT,
  subcategory  TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users (id) ON DELETE SET NULL,
  subject    TEXT,
  body       TEXT NOT NULL,
  rating     INTEGER,
  status     TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL
);

-- The old ServiceAnalytics table: directory-level interest events (maps clicks,
-- calls, site visits). Distinct from `deal_events` — these are about a listing,
-- not an offer — and they feed the "quiet venue" reading in the console.
CREATE TABLE IF NOT EXISTS service_events (
  id         TEXT PRIMARY KEY,
  service_id TEXT REFERENCES guidance_services (id) ON DELETE CASCADE,
  venue_id   TEXT REFERENCES venues (id) ON DELETE SET NULL,
  user_id    TEXT REFERENCES users (id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  -- Where it happened: list | search | map | guidebook | assistant. The same
  -- vocabulary `deal_events.source` uses, because the two are read together --
  -- "seen 900 times" and "seen 900 times, 850 of them in one list nobody
  -- scrolls" are different findings, and an owner is entitled to the second.
  source     TEXT,
  city       TEXT,
  country_code TEXT,
  language   TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sevents ON service_events (service_id, event_type, created_at);

-- ══════════════════════════════════════════════════════ 17. money reference ══

-- Rates as units per one anchor currency, mirroring `src/site/i18n/fx.ts`: one
-- anchor makes a cross rate `to/from` and exact for every pair. The old export
-- carried a pair-keyed blob; the import folds it back onto the anchor.
CREATE TABLE IF NOT EXISTS exchange_rates (
  code       TEXT PRIMARY KEY,
  base       TEXT NOT NULL DEFAULT 'EUR',
  rate       REAL NOT NULL,
  decimals   INTEGER NOT NULL DEFAULT 2,
  updated_at TEXT NOT NULL
);

-- ═════════════════════════════════ 18. archived remittance (out of scope) ══

-- The old app's money-transfer feature. Both specs put real money movement in a
-- separate later track ("the fintech/payments layer … is out of scope"), so
-- these tables are imported for continuity and served read-only. Nothing in the
-- domain layer writes to them.
CREATE TABLE IF NOT EXISTS legacy_wallets (
  id             TEXT PRIMARY KEY,
  user_id        TEXT REFERENCES users (id) ON DELETE SET NULL,
  owner_email    TEXT,
  balance_eur_minor INTEGER NOT NULL DEFAULT 0,
  balance_usdt_minor INTEGER NOT NULL DEFAULT 0,
  total_topped_up_minor INTEGER NOT NULL DEFAULT 0,
  total_sent_minor INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS legacy_recipients (
  id            TEXT PRIMARY KEY,
  user_id       TEXT REFERENCES users (id) ON DELETE SET NULL,
  owner_email   TEXT,
  full_name     TEXT NOT NULL,
  city          TEXT,
  phone         TEXT,
  method        TEXT,
  bank_name     TEXT,
  card_number   TEXT,
  wallet_address TEXT,
  wallet_network TEXT,
  favorite      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS legacy_transfers (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT REFERENCES users (id) ON DELETE SET NULL,
  owner_email        TEXT,
  recipient_id       TEXT REFERENCES legacy_recipients (id) ON DELETE SET NULL,
  recipient_name     TEXT,
  source_currency    TEXT,
  destination_currency TEXT,
  amount_sent_minor  INTEGER NOT NULL DEFAULT 0,
  amount_received_minor INTEGER NOT NULL DEFAULT 0,
  fee_minor          INTEGER NOT NULL DEFAULT 0,
  exchange_rate      REAL,
  send_type          TEXT,
  delivery_speed     TEXT,
  payment_method     TEXT,
  status             TEXT,
  tx_hash            TEXT,
  created_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS legacy_payment_methods (
  id             TEXT PRIMARY KEY,
  user_id        TEXT REFERENCES users (id) ON DELETE SET NULL,
  owner_email    TEXT,
  type           TEXT,
  nickname       TEXT,
  card_brand     TEXT,
  card_last_four TEXT,
  card_expiry    TEXT,
  bank_name      TEXT,
  iban_last_four TEXT,
  is_default     INTEGER NOT NULL DEFAULT 0,
  is_verified    INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);

/* ══════════════════════════════════════════ website traffic & activity ══ */
/*
 * Neither spec asks for this. It is the operator's own question — who is
 * visiting the site, and how often — and it is here rather than in a
 * third-party script for the same reason the fonts are self-hosted: an
 * analytics tag is a runtime dependency that reads every visitor.
 *
 * The privacy design is the whole of it, and it is one decision: **a visitor
 * is a daily hash, not a person.** `visitor_day` is HMAC(ip + user agent, the
 * server secret + the day). That is enough to count unique visitors on a day
 * and to tell a second page view from a second visitor; it is deliberately not
 * enough to follow anybody from Tuesday to Wednesday, because the key changes
 * with the day and the input is never stored. No cookie is set, no identifier
 * is written to the device, and no IP address is ever stored — which is what
 * keeps this outside the consent gate that `data_sharing_consents` exists for.
 *
 * A *signed-in* visitor is a different case and is treated as one: `user_id`
 * is recorded, because that person already has an account and their activity
 * is attributable to it. That is the honest line — anonymous traffic is
 * counted, identified traffic is attributed, and the two are never joined
 * across the boundary by anything in this file.
 */
CREATE TABLE IF NOT EXISTS web_sessions (
  id            TEXT PRIMARY KEY,
  /* HMAC of ip+agent under a key that rotates daily. Never reversible to an IP. */
  visitor_day   TEXT NOT NULL,
  day           TEXT NOT NULL,
  started_at    TEXT NOT NULL,
  last_at       TEXT NOT NULL,
  views         INTEGER NOT NULL DEFAULT 0,
  actions       INTEGER NOT NULL DEFAULT 0,
  entry_path    TEXT NOT NULL,
  exit_path     TEXT NOT NULL,
  /* The host only. A full referrer URL carries the search terms someone typed. */
  referrer_host TEXT,
  /* From the edge's country header when there is one, else null. Never guessed. */
  country       TEXT,
  language      TEXT,
  device        TEXT,
  user_id       TEXT REFERENCES users (id) ON DELETE SET NULL,
  account_type  TEXT
);

CREATE INDEX IF NOT EXISTS idx_web_sessions_day ON web_sessions (day);
CREATE INDEX IF NOT EXISTS idx_web_sessions_visitor ON web_sessions (visitor_day, day);
CREATE INDEX IF NOT EXISTS idx_web_sessions_user ON web_sessions (user_id);

CREATE TABLE IF NOT EXISTS web_events (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES web_sessions (id) ON DELETE CASCADE,
  at         TEXT NOT NULL,
  day        TEXT NOT NULL,
  kind       TEXT NOT NULL,
  path       TEXT NOT NULL,
  name       TEXT,
  user_id    TEXT REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_web_events_day ON web_events (day, kind);
CREATE INDEX IF NOT EXISTS idx_web_events_session ON web_events (session_id);
CREATE INDEX IF NOT EXISTS idx_web_events_path ON web_events (day, path);

/*
 * Sign-in attempts, for the rate limit in §13's spirit that `auth.signInPerHour`
 * has always described and nothing enforced. Keyed by the address tried rather
 * than by the account found, because an attempt against an address that does
 * not exist is exactly the one worth counting.
 */
CREATE TABLE IF NOT EXISTS auth_attempts (
  id       TEXT PRIMARY KEY,
  subject  TEXT NOT NULL,
  at       TEXT NOT NULL,
  ok       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_auth_attempts ON auth_attempts (subject, at);
