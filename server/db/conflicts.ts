/**
 * GENERATED FILE — do not edit. See `scripts/pg-schema.mjs`.
 *
 * Each table's primary key, which is the `ON CONFLICT` target `db/pg.ts` needs
 * to express SQLite's `INSERT OR REPLACE` / `INSERT OR IGNORE` against
 * Postgres. Generated from `schema.sql` so a primary key cannot change without
 * this changing with it.
 *
 * 0 of 82 tables have no primary key and are absent: an upsert
 * naming one throws rather than guessing a unique index to overwrite on.
 *
 * **6 upsert targets carry a second unique constraint** and are marked inline
 * below: guidance_categories, guidance_subcategories, referrals, venue_links, budgets, voucher_tiers.
 * SQLite replaces on *any* unique constraint; `ON CONFLICT` handles the one it
 * is given. A row colliding on the secondary key with a different primary key
 * now raises a unique violation rather than silently replacing — the safer
 * failure, and one no current statement can reach, because every id that
 * reaches these tables is derived from the same columns the secondary key is
 * built from (see `db/import.ts`).
 */
export const CONFLICT_TARGETS: Record<string, readonly string[] | undefined> = {
  schema_meta: ['key'],
  users: ['id'],
  user_roles: ['user_id', 'role'],
  devices: ['id'],
  device_users: ['device_id', 'user_id'],
  sessions: ['id'],
  consent_records: ['id'],
  data_sharing_consents: ['id'],
  venues: ['id'],
  venue_links: ['id'], // also UNIQUE (venue_id, kind)
  venue_hours: ['venue_id', 'weekday'],
  venue_languages: ['venue_id', 'language'],
  verification_records: ['id'],
  translations: ['entity', 'entity_id', 'field', 'language'],
  points_ledger: ['id'],
  points_lots: ['ledger_id'],
  daily_counters: ['user_id', 'day'],
  transactions: ['id'],
  qr_nonces: ['jti'],
  tag_registry: ['tag_uid'],
  idempotency_keys: ['key', 'user_id', 'endpoint'],
  budgets: ['id'], // also UNIQUE (venue_id, period)
  budget_movements: ['id'],
  voucher_tiers: ['id'], // also UNIQUE (venue_id, discount_pct)
  issued_vouchers: ['id'],
  gift_card_stock: ['id'],
  gift_cards: ['id'],
  campaigns: ['id'],
  stamp_cards: ['id'], // also UNIQUE (user_id, campaign_id)
  earned_rewards: ['id'],
  venue_visits: ['id'], // also UNIQUE (user_id, venue_id, local_day)
  venue_customers: ['venue_id', 'user_id'],
  hot_deals: ['id'],
  deal_events: ['id'],
  deal_pushes: ['id'], // also UNIQUE (deal_id)
  push_quotas: ['venue_id', 'period'],
  game_sessions: ['id'],
  game_events: ['id'], // also UNIQUE (session_id, seq)
  game_recent_items: ['user_id', 'game_type', 'item_key'],
  player_states: ['user_id'],
  daily_words: ['day'],
  quiz_items: ['id'],
  word_bank: ['id'], // also UNIQUE (language, word)
  referrals: ['id'], // also UNIQUE (referred_id)
  leaderboard_entries: ['week', 'scope', 'user_id'],
  friendships: ['user_id', 'friend_id'],
  notifications: ['id'],
  notification_prefs: ['user_id', 'mode', 'channel'],
  push_tokens: ['id'],
  plans: ['id'], // also UNIQUE (audience, code)
  plan_entitlements: ['plan_id', 'key'],
  plan_terms: ['plan_id', 'months'],
  subscriptions: ['id'],
  invoices: ['id'],
  billing_events: ['id'], // also UNIQUE (source, external_id)
  audit_log: ['id'],
  fraud_cases: ['id'],
  moderation_queue: ['id'],
  platform_config: ['key'],
  category_defaults: ['category'],
  benchmarks: ['id'], // also UNIQUE (period, city, category, metric)
  assistant_sessions: ['id'],
  assistant_messages: ['id'], // also UNIQUE (session_id, seq)
  guidance_categories: ['id'], // also UNIQUE (key, country_code)
  guidance_subcategories: ['id'], // also UNIQUE (key, parent_key)
  guidance_services: ['id'],
  guidance_service_links: ['service_id', 'kind'],
  guidance_articles: ['id'],
  news_items: ['id'],
  community_profiles: ['id'],
  service_recommendations: ['id'],
  feedback: ['id'],
  service_events: ['id'],
  exchange_rates: ['code'],
  legacy_wallets: ['id'],
  legacy_recipients: ['id'],
  legacy_transfers: ['id'],
  legacy_payment_methods: ['id'],
  web_sessions: ['id'],
  web_events: ['id'],
  auth_attempts: ['id'],
  contact_messages: ['id'],
};
