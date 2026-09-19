-- ─────────────────────────────────────────────────────────────────────────────
-- GENERATED FILE — do not edit.
--
-- Produced from `server/db/schema.sql` by `npm run pg:schema`, and applied by
-- `migrate()` in `server/db/pg.ts` on every boot. Idempotent: every statement
-- here is safe to run against a database it has already run against.
--
-- What it does and why is documented in `scripts/pg-schema.mjs`. The short
-- version: a Supabase project publishes its anon key and serves PostgREST over
-- the `public` schema, so a table with no RLS is readable by anybody holding a
-- URL this repo never uses. This closes that, twice.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
    REVOKE ALL ON SCHEMA public FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
    REVOKE ALL ON SCHEMA public FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM authenticated;
  END IF;
END $$;

-- ══════════════════════════════════════════════════ row-level security ══
--
-- 85 tables, every one of them. RLS with no policy is a closed door: the
-- owner and any role with BYPASSRLS read normally, everybody else — which is
-- what a published anon key authenticates as — reads nothing.
--
-- The guard first. Enabling RLS as a role that neither owns these tables nor
-- bypasses it locks *this server* out of its own database, which is a worse
-- outcome than an open PostgREST endpoint and is not recoverable from inside
-- the process that just did it. So it refuses, loudly, naming the role.
DO $$
DECLARE
  bypasses boolean;
  owns     boolean;
BEGIN
  SELECT rolbypassrls INTO bypasses FROM pg_roles WHERE rolname = current_user;
  SELECT COALESCE(bool_and(tableowner = current_user), true) INTO owns
    FROM pg_tables WHERE schemaname = 'public';
  IF NOT COALESCE(bypasses, false) AND NOT owns THEN
    RAISE EXCEPTION 'paylez: refusing to enable row-level security as %, which neither owns the public tables nor has BYPASSRLS. Connect as the owning role (Supabase: postgres) or grant it, then restart.', current_user;
  END IF;
END $$;

ALTER TABLE schema_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_sharing_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE voucher_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE issued_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_card_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE stamp_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE earned_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE venue_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE hot_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_pushes ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_recent_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE word_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE moderation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE guidance_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE guidance_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE guidance_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE guidance_service_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE guidance_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE legacy_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;
