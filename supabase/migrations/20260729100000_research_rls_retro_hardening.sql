-- Managed migration 20260729100000_research_rls_retro_hardening.sql
-- Task XCA-W9-RLS-HARDENING (isolated security-hardening lane).
--
-- Retroactive row-level-security hardening for the old-generation tables.
-- The repo has a two-generation security posture. New-generation migrations
-- (Product Control 20260726143000 and later) enable AND force RLS, then
-- revoke every browser-role table grant. Old-generation scripts only enable
-- RLS: they never FORCE it (so the table owner bypasses row security in the
-- SQL editor) and they never revoke the Supabase default anon/authenticated
-- table grants that every table receives at creation. RLS-enabled with zero
-- policies does deny browser reads today, but the posture is one accidental
-- permissive policy or one RLS disable away from exposure. This migration
-- converges every old-generation table onto the new-generation posture and
-- closes the class of bug for future tables via default privileges.
--
-- What it does, and all it does:
--   1. For each enumerated table that EXISTS in this environment: enable row
--      level security (a no-op where already enabled), force row level
--      security, and revoke all table privileges from PUBLIC, anon, and
--      authenticated. Absent tables are skipped with a NOTICE, because
--      several source scripts are PENDING and not applied in all
--      environments.
--   2. Revoke the anon/authenticated entries from the executing role's
--      default privileges in schema public for tables, sequences, and
--      functions, so future tables stop silently inheriting browser grants.
--
-- What it deliberately does NOT do:
--   - It never touches the server role's grants (the application server needs
--     them and keeps them; that role also bypasses row security).
--   - It never touches the two documented Care read surfaces. The tables
--     care_role_assignments and care_access_audit keep their intentional
--     authenticated SELECT and their two read policies from
--     care-access-foundation.sql. No care_* table appears below.
--   - It creates no policy, no table, no function, and it reads or writes
--     zero rows. Idempotent and additive-safe: safe to re-run.
--
-- Verification pair (disposable local PostgreSQL only):
--   supabase/verification/research-rls-retro-hardening-disposable-bootstrap.sql
--   supabase/verification/research-rls-retro-hardening.verify.sql
-- Rollback notes:
--   supabase/production/research-rls-retro-hardening-rollback-notes.md

do $$
declare
  t text;
  hardened constant text[] := array[
    -- Group 1: main site foundation, supabase/schema.sql lines 121 to 125
    -- (MIGRATIONS.md order 1, RUN in production).
    'waitlist_signups',
    'loi_submissions',
    'calendly_bookings',
    'admin_notes',
    'concept_gallery_items',

    -- Group 2: membership, members, and referrals
    -- (research-membership.sql, research-members.sql, research-referrals.sql;
    -- MIGRATIONS.md orders 2, 4, 5, RUN in production).
    'research_applications',
    'research_application_events',
    'research_members',
    'referral_programs',
    'referral_identities',
    'referral_attributions',
    'referral_rewards',
    'member_credit_ledger',

    -- Group 3: Track A member platform
    -- (production/research-track-a-private-platform.sql, also applied
    -- piecewise as MIGRATIONS.md orders 10 to 19, RUN in production).
    'research_agreement_acceptances',
    'research_member_profile_sections',
    'research_assessment_responses',
    'research_blueprints',
    'research_xenios30_plans',
    'research_xenios90_plans',
    'research_plan_change_requests',
    'research_plan_documents',
    'research_tracker_observations',
    'research_private_media',
    'research_media_access_log',
    'research_media_retention_elections',
    'research_member_questions',
    'research_telegram_links',
    'research_sla_events',

    -- Group 4: founding membership research_fm_* tables
    -- (production/research-founding-membership.sql, FM-1, RUN in production;
    -- research_fm_agreement_email_candidates is FM-7, which already revoked
    -- its browser grants, so forcing here is the only material change for it).
    'research_fm_payment_methods',
    'research_fm_payment_method_versions',
    'research_fm_bridge_settings',
    'research_fm_bridge_audit_events',
    'research_fm_obligations',
    'research_fm_obligation_events',
    'research_fm_membership_periods',
    'research_fm_ledger',
    'research_fm_receipts',
    'research_fm_identity_cases',
    'research_fm_identity_reviews',
    'research_fm_identity_audit',
    'research_fm_document_versions',
    'research_fm_document_signatures',
    'research_fm_bridge_checklist',
    'research_fm_esign_templates',
    'research_fm_esign_requests',
    'research_fm_esign_archive',
    'research_fm_agreement_email_candidates',

    -- Group 5: PENDING commerce lane tables (MIGRATIONS.md orders 22 to 26,
    -- NOT yet run in production, plus research-track-b-fidelity.sql). These
    -- no-op through the to_regclass guard until their source scripts run; if
    -- those scripts run after this migration, re-run this exact file.
    -- research-orders.sql (order 22):
    'research_orders',
    'research_order_lines',
    'research_order_state_events',
    'research_carts',
    'research_cart_lines',
    'research_provider_webhook_events',
    'research_claims',
    'research_refund_keys',
    -- research-subscriptions.sql (order 23):
    'research_product_subscriptions',
    'research_subscription_events',
    -- research-fulfillment.sql (order 24):
    'research_fulfillment_orders',
    'research_fulfillment_lines',
    'research_shipments',
    'research_shipping_quotes',
    'research_shipping_profiles',
    -- research-partners.sql (order 25):
    'research_partners',
    'research_partner_agreements',
    'research_partner_training',
    'research_partner_lifecycle_events',
    'research_partner_links',
    'research_attribution_touches',
    'research_attribution_conversions',
    'research_organizations',
    'research_organization_representatives',
    'research_organization_events',
    'research_organization_rsvps',
    'research_content_assets',
    'research_content_violations',
    -- research-commission-ledger.sql (order 26):
    'research_commission_ledger',
    'research_store_credit_ledger',
    'research_payout_batches',
    'research_payout_attempts',
    -- research-track-b-fidelity.sql (commerce lane, PENDING):
    'research_order_shipments',

    -- Group 6: additional enable-only tables confirmed during local
    -- verification of this lane. Each is RUN in production per MIGRATIONS.md
    -- and had neither FORCE nor a browser-grant revoke in any source file.
    -- research-notification-outbox.sql (order 3):
    'research_notification_outbox',
    'research_notification_attempts',
    'research_external_exports',
    'research_admin_notification_preferences',
    -- research-consent-covenant.sql (order 7):
    'research_consent_events',
    'research_covenant_acceptances',
    -- research-referral-fraud.sql (order 8):
    'referral_events',
    'referral_fraud_flags',
    'research_rate_limits',
    -- research-idempotency-keys.sql (FM-5):
    'research_idempotency_keys',
    -- research-inventory-lots.sql (order 21): these two lot tables were not
    -- covered by the later forced-RLS inventory migrations.
    'research_lot_excursion_events',
    'research_lot_shipments'
  ];
begin
  foreach t in array hardened loop
    if to_regclass('public.' || t) is null then
      raise notice 'research_rls_retro_hardening: public.% is absent in this environment; skipping', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
  end loop;
end;
$$;

-- Close the class of bug: stop future tables, sequences, and functions in
-- schema public from silently inheriting browser-role grants at creation.
--
-- Grantor caveat: ALTER DEFAULT PRIVILEGES without FOR ROLE edits the default
-- privileges of the role executing this statement. Default privileges are
-- stored per grantor, so this has full effect in production only when run as
-- the same role that owns the browser-granting defaults and runs migrations,
-- which in Supabase is the postgres role used by the SQL editor and managed
-- migrations. If this file is ever applied as a different role, the postgres
-- defaults survive and this section must be re-run as postgres.
--
-- Note: PostgreSQL itself grants EXECUTE on new functions to PUBLIC by
-- default. The statement below removes the anon/authenticated entries that
-- Supabase layers on top; new SECURITY DEFINER functions still need their
-- own explicit PUBLIC revoke, as the new-generation migrations already do.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
