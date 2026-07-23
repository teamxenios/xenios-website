-- ==========================================================================
-- XENIOS RESEARCH - TRACK B VERIFICATION (read-only, run after the Track B apply)
-- ==========================================================================
-- Confirms the commerce schema landed with the safety posture the server
-- relies on. Any row returned by a check labelled FAIL is a DEFECT to resolve.
-- Read-only apart from one session-local temporary table.
-- ==========================================================================

-- The exact set of tables Track B creates (migrations 20-26 + the idempotency
-- table + the fidelity shipments table + the admin queue items table).
create temporary table if not exists _track_b_expected(table_name text);
truncate _track_b_expected;
insert into _track_b_expected(table_name) values
  -- Migration 20: catalog
  ('research_products'),
  ('research_product_facts'),
  ('research_product_goals'),
  ('research_product_guide_links'),
  ('research_product_prohibited_claims'),
  ('research_product_open_questions'),
  ('research_supplement_candidates'),
  -- Migration 21: inventory lots
  ('research_inventory_lots'),
  ('research_lot_quality_documents'),
  ('research_lot_excursion_events'),
  ('research_lot_allocations'),
  ('research_lot_shipments'),
  -- Migration 22: carts, orders, refunds
  ('research_carts'),
  ('research_cart_lines'),
  ('research_orders'),
  ('research_order_lines'),
  ('research_order_state_events'),
  ('research_provider_webhook_events'),
  ('research_claims'),
  ('research_refund_keys'),
  -- Migration 23: product subscriptions
  ('research_product_subscriptions'),
  ('research_subscription_events'),
  -- Migration 24: fulfillment and shipping
  ('research_fulfillment_orders'),
  ('research_fulfillment_lines'),
  ('research_shipments'),
  ('research_shipping_quotes'),
  ('research_shipping_profiles'),
  -- Migration 25: partners, attribution, organizations
  ('research_partners'),
  ('research_partner_agreements'),
  ('research_partner_training'),
  ('research_partner_lifecycle_events'),
  ('research_partner_links'),
  ('research_attribution_touches'),
  ('research_attribution_conversions'),
  ('research_organizations'),
  ('research_organization_representatives'),
  ('research_organization_events'),
  ('research_organization_rsvps'),
  ('research_content_assets'),
  ('research_content_violations'),
  -- Migration 26: ledgers and payouts
  ('research_commission_ledger'),
  ('research_store_credit_ledger'),
  ('research_payout_batches'),
  ('research_payout_attempts'),
  -- Track B additions
  ('research_idempotency_keys'),
  ('research_order_shipments'),
  ('research_admin_queue_items'),
  ('research_lot_reservations'),
  ('research_lot_reservation_allocations');

-- 1. Every expected Track B table EXISTS. Rows here are MISSING tables (FAIL).
select 'MISSING_TABLE' as check, e.table_name
from _track_b_expected e
where not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname = e.table_name);

-- 2. Every Track B table has RLS ENABLED. Rows here are FAILURES.
select 'RLS_DISABLED' as check, c.relname as table_name
from pg_class c join pg_namespace n on n.oid = c.relnamespace
join _track_b_expected e on e.table_name = c.relname
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false;

-- 3. Presence roll-up (expected: 47 present, rls_disabled = 0).
select count(*) as track_b_tables_present,
       count(*) filter (where c.relrowsecurity) as rls_enabled,
       count(*) filter (where not c.relrowsecurity) as rls_disabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
join _track_b_expected e on e.table_name = c.relname
where n.nspname = 'public' and c.relkind = 'r';

-- 4. No Track B table has ANY policy (service-role-only). Rows here are FAILURES.
select 'UNEXPECTED_POLICY' as check, p.tablename, p.policyname
from pg_policies p join _track_b_expected e on e.table_name = p.tablename
where p.schemaname = 'public';

-- 5. The append-only triggers exist on all four append-only trails.
--    Rows here are MISSING triggers (FAIL).
with expected_triggers(trigger_name, table_name) as (values
  ('research_commission_ledger_no_update',   'research_commission_ledger'),
  ('research_store_credit_ledger_no_update', 'research_store_credit_ledger'),
  ('research_order_state_events_no_update',  'research_order_state_events'),
  ('research_subscription_events_no_update', 'research_subscription_events'))
select 'MISSING_APPEND_ONLY_TRIGGER' as check, e.trigger_name, e.table_name
from expected_triggers e
where not exists (
  select 1
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = e.table_name
    and t.tgname = e.trigger_name and not t.tgisinternal);

-- 6. The load-bearing unique constraints and unique indexes exist.
--    Rows here are MISSING uniques (FAIL).
with expected_uniques(index_name, table_name) as (values
  -- Idempotency: exactly one reservation wins per (scope, key).
  ('research_idempotency_keys_scope_key_unique', 'research_idempotency_keys'),
  -- One checkout per (member, idempotency key): a retried submit cannot
  -- create a second order.
  ('research_orders_idempotency_unique',         'research_orders'),
  -- Webhook replay protection per (provider_name, event_id).
  ('research_provider_webhook_events_unique',    'research_provider_webhook_events'),
  -- One live commission accrual per order (partial unique index).
  ('research_commission_one_live_accrual_per_order', 'research_commission_ledger'),
  -- One settlement per store-credit entry (partial unique index on reverses_id).
  ('research_store_credit_settlement_unique',    'research_store_credit_ledger'),
  -- Shipment rows cannot interleave two save generations.
  ('research_order_shipments_unique_seq',        'research_order_shipments'),
  -- Durable refund idempotency: scope is the primary key.
  ('research_refund_keys_pkey',                  'research_refund_keys'))
select 'MISSING_UNIQUE' as check, e.index_name, e.table_name
from expected_uniques e
where not exists (
  select 1
  from pg_class i
  join pg_index ix on ix.indexrelid = i.oid
  join pg_class c on c.oid = ix.indrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = e.table_name
    and i.relname = e.index_name and ix.indisunique);

-- 7. The fidelity and completion columns landed. Rows here are MISSING (FAIL).
with expected_columns(table_name, column_name) as (values
  ('research_orders',                'approved_by'),
  ('research_orders',                'approved_at'),
  ('research_orders',                'cancellation_reason'),
  ('research_orders',                'authorization_release_failed'),
  ('research_claims',                'notes'),
  ('research_commission_ledger',     'kind'),
  ('research_product_subscriptions', 'price_version'),
  ('research_product_subscriptions', 'shipping_address_ref'),
  ('research_store_credit_ledger',   'expires_at'))
select 'MISSING_COLUMN' as check, e.table_name, e.column_name
from expected_columns e
where not exists (
  select 1 from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = e.table_name
    and c.column_name = e.column_name);

-- 8. Count roll-up for the report: tables, append-only triggers, policies.
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   join _track_b_expected e on e.table_name = c.relname
   where n.nspname = 'public' and c.relkind = 'r')                as track_b_tables,
  (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal
     and t.tgname like 'research%no_update')                      as append_only_triggers,
  (select count(*) from pg_policies p
   join _track_b_expected e on e.table_name = p.tablename
   where p.schemaname = 'public')                                 as track_b_policies;

-- Expected clean result: checks 1, 2, 4, 5, 6, 7 return ZERO rows; check 3
-- shows track_b_tables_present = 47 and rls_disabled = 0; check 8 shows
-- track_b_tables = 47, append_only_triggers = 4, track_b_policies = 0.
