-- ==========================================================================
-- XENIOS RESEARCH - FOUNDING MEMBERSHIP VERIFICATION
-- (read-only, run after the research-founding-membership.sql apply)
-- ==========================================================================
-- Confirms the founding-membership schema landed with the safety posture the
-- server relies on. Any row returned by a check labelled FAIL is a DEFECT to
-- resolve. Read-only apart from session-local temporary tables.
-- ==========================================================================

-- The exact set of tables the FM bundle creates (15).
create temporary table if not exists _fm_expected(table_name text);
truncate _fm_expected;
insert into _fm_expected(table_name) values
  -- Domain 1: payment methods and the bridge
  ('research_fm_payment_methods'),
  ('research_fm_payment_method_versions'),
  ('research_fm_bridge_settings'),
  ('research_fm_bridge_audit_events'),
  -- Domain 2: the money spine
  ('research_fm_obligations'),
  ('research_fm_obligation_events'),
  ('research_fm_membership_periods'),
  ('research_fm_ledger'),
  ('research_fm_receipts'),
  -- Domain 3: identity
  ('research_fm_identity_cases'),
  ('research_fm_identity_reviews'),
  ('research_fm_identity_audit'),
  -- Domain 4: agreements
  ('research_fm_document_versions'),
  ('research_fm_document_signatures'),
  -- Section 5: the Day 15 checklist
  ('research_fm_bridge_checklist');

-- 1. Every expected FM table EXISTS. Rows here are MISSING tables (FAIL).
select 'MISSING_TABLE' as check, e.table_name
from _fm_expected e
where not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname = e.table_name);

-- 2. Every FM table has RLS ENABLED. Rows here are FAILURES.
select 'RLS_DISABLED' as check, c.relname as table_name
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname like 'research\_fm\_%'
  and not c.relrowsecurity;

-- 3. NO policies exist on any FM table (service-role-only posture).
-- Rows here are FAILURES: a policy would open a client-role path.
select 'UNEXPECTED_POLICY' as check, tablename, policyname
from pg_policies
where schemaname = 'public' and tablename like 'research\_fm\_%';

-- 4. The append-only and guard triggers are INSTALLED. Rows are MISSING
-- triggers (FAIL). These are the enforcement points the server's promises
-- rest on: history that can be edited is not history.
create temporary table if not exists _fm_expected_triggers(table_name text, trigger_name text);
truncate _fm_expected_triggers;
insert into _fm_expected_triggers(table_name, trigger_name) values
  ('research_fm_payment_method_versions', 'research_fm_method_versions_no_update'),
  ('research_fm_bridge_audit_events',     'research_fm_bridge_audit_no_update'),
  ('research_fm_obligation_events',       'research_fm_obligation_events_no_rewrite'),
  ('research_fm_membership_periods',      'research_fm_membership_periods_no_rewrite'),
  ('research_fm_ledger',                  'research_fm_ledger_no_rewrite'),
  ('research_fm_receipts',                'research_fm_receipts_no_rewrite'),
  ('research_fm_identity_audit',          'research_fm_identity_audit_no_update'),
  ('research_fm_document_versions',       'research_fm_versions_guard'),
  ('research_fm_document_versions',       'research_fm_versions_no_delete'),
  ('research_fm_document_signatures',     'research_fm_signature_requires_published'),
  ('research_fm_document_signatures',     'research_fm_signatures_no_update'),
  ('research_fm_document_signatures',     'research_fm_signatures_no_delete'),
  ('research_fm_bridge_checklist',        'research_fm_checklist_touch');
select 'MISSING_APPEND_ONLY_TRIGGER' as check, e.table_name, e.trigger_name
from _fm_expected_triggers e
where not exists (
  select 1
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
    and c.relname = e.table_name and t.tgname = e.trigger_name);

-- 5. The unique constraints and unique indexes concurrency correctness
-- rests on. Rows are MISSING uniques (FAIL). Notably:
--   - research_fm_receipts_one_per_obligation: createSupabaseReceipts relies
--     on this (error 23505) for exactly-one-receipt under concurrency.
--   - research_fm_periods_one_per_obligation: the double-extend lock.
--   - research_fm_one_live_activation_per_member: one live activation.
create temporary table if not exists _fm_expected_uniques(index_name text);
truncate _fm_expected_uniques;
insert into _fm_expected_uniques(index_name) values
  ('research_fm_payment_methods_method_id_key'),
  ('research_fm_method_versions_unique_version'),
  ('research_fm_bridge_audit_events_event_id_key'),
  ('research_fm_obligations_human_ref_unique'),
  ('research_fm_one_live_activation_per_member'),
  ('research_fm_obligation_events_event_unique'),
  ('research_fm_periods_one_per_obligation'),
  ('research_fm_periods_member_sequence_unique'),
  ('research_fm_ledger_entry_unique'),
  ('research_fm_receipts_one_per_obligation'),
  ('research_fm_receipts_number_unique'),
  ('research_fm_versions_unique_semver'),
  ('research_fm_versions_one_published_per_category'),
  ('research_fm_signatures_once'),
  ('research_fm_identity_reviews_case_idx');
select 'MISSING_UNIQUE' as check, e.index_name
from _fm_expected_uniques e
where not exists (
  select 1 from pg_indexes i
  join pg_class c on c.relname = i.indexname
  join pg_index x on x.indexrelid = c.oid
  where i.schemaname = 'public' and i.indexname = e.index_name and x.indisunique);

-- 6. The check constraints the money spine's honesty rests on. Rows are
-- MISSING checks (FAIL). amount_matches_type is the canonical pricing in the
-- database: activation_50 = 5000 cents (includes the first 30 days),
-- renewal_25 = 2500 cents, no other pairing writable, so there is never a
-- $25 obligation at activation.
create temporary table if not exists _fm_expected_checks(table_name text, constraint_name text);
truncate _fm_expected_checks;
insert into _fm_expected_checks(table_name, constraint_name) values
  ('research_fm_obligations', 'research_fm_obligations_amount_matches_type'),
  ('research_fm_obligations', 'research_fm_obligations_status_check'),
  ('research_fm_obligations', 'research_fm_obligations_verified_needs_verification'),
  ('research_fm_ledger',      'research_fm_ledger_signed_amounts'),
  ('research_fm_membership_periods', 'research_fm_periods_ends_after_start'),
  ('research_fm_payment_methods', 'research_fm_methods_manual_never_product'),
  ('research_fm_payment_methods', 'research_fm_methods_approved_is_stamped'),
  ('research_fm_bridge_settings', 'research_fm_bridge_extension_complete'),
  ('research_fm_identity_reviews', 'research_fm_identity_rejection_reason'),
  ('research_fm_identity_cases', 'research_fm_identity_consent_before_upload');
select 'MISSING_CHECK' as check, e.table_name, e.constraint_name
from _fm_expected_checks e
where not exists (
  select 1 from information_schema.table_constraints tc
  where tc.constraint_schema = 'public'
    and tc.table_name = e.table_name
    and tc.constraint_name = e.constraint_name
    and tc.constraint_type = 'CHECK');

-- 7. The exact columns the production-deps.ts adapters read and write.
-- Rows are MISSING columns (FAIL).
create temporary table if not exists _fm_expected_columns(table_name text, column_name text);
truncate _fm_expected_columns;
insert into _fm_expected_columns(table_name, column_name) values
  -- createSupabaseLedger
  ('research_fm_ledger', 'entry_id'),
  ('research_fm_ledger', 'member_id'),
  ('research_fm_ledger', 'obligation_id'),
  ('research_fm_ledger', 'entry_type'),
  ('research_fm_ledger', 'amount_cents'),
  ('research_fm_ledger', 'actor_id'),
  ('research_fm_ledger', 'recorded_at'),
  -- createSupabaseReceipts
  ('research_fm_receipts', 'id'),
  ('research_fm_receipts', 'receipt_number'),
  ('research_fm_receipts', 'obligation_id'),
  ('research_fm_receipts', 'member_id'),
  ('research_fm_receipts', 'amount_cents'),
  ('research_fm_receipts', 'currency'),
  ('research_fm_receipts', 'method_label'),
  ('research_fm_receipts', 'issued_at'),
  -- createSupabaseChecklistStore
  ('research_fm_bridge_checklist', 'id'),
  ('research_fm_bridge_checklist', 'items');
select 'MISSING_COLUMN' as check, e.table_name, e.column_name
from _fm_expected_columns e
where not exists (
  select 1 from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = e.table_name
    and c.column_name = e.column_name);

-- 8. Secrecy posture: no FM table carries a plaintext receiving-instructions
-- column. The only instructions column permitted at rest is the ciphertext
-- column receiving_instructions_enc plus its masked derivative. Rows are
-- FAILURES.
select 'UNEXPECTED_PLAINTEXT_COLUMN' as check, c.table_name, c.column_name
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name like 'research\_fm\_%'
  and c.column_name ~ '(ssn|social_security|account_number|routing_number|card_number)';

-- 9. Informational roll-up (not a FAIL check): the FM posture at a glance.
select 'INFO_ROLLUP' as check,
       count(*) as fm_tables,
       count(*) filter (where c.relrowsecurity) as rls_enabled,
       count(*) filter (where not c.relrowsecurity) as rls_disabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'research\_fm\_%';
