-- ==========================================================================
-- XENIOS RESEARCH - PRODUCTION SCHEMA VERIFICATION (read-only, run any time)
-- ==========================================================================
-- Run AFTER research-full-production.sql. It asserts the safety posture the
-- server relies on: every research table exists, has row level security
-- ENABLED, and carries ZERO public policies (service-role-only access). Any row
-- returned by the CHECK queries is a defect to resolve before enabling any
-- capability.
-- ==========================================================================

-- 1. Every research table has RLS enabled. Rows returned here are FAILURES.
select 'RLS_DISABLED' as check, c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname like 'research\_%'
  and c.relrowsecurity = false;

-- 2. No research table has ANY policy. Rows returned here are FAILURES
--    (a policy would expose a service-role-only table to client roles).
select 'UNEXPECTED_POLICY' as check, tablename as table_name, policyname
from pg_policies
where schemaname = 'public'
  and tablename like 'research\_%';

-- 3. Presence roll-up: count of research tables and how many have RLS on.
select
  count(*) as research_tables,
  count(*) filter (where c.relrowsecurity) as rls_enabled,
  count(*) filter (where not c.relrowsecurity) as rls_disabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'research\_%';

-- 4. Load-bearing safety objects exist:
--    the append-only ledger triggers on the commission and store-credit ledgers.
select 'MISSING_LEDGER_TRIGGER' as check, expected
from (values
  ('research_commission_ledger append-only trigger'),
  ('research_store_credit_ledger append-only trigger')
) as t(expected)
where not exists (
  select 1 from pg_trigger tg
  join pg_class c on c.oid = tg.tgrelid
  where c.relname in ('research_commission_ledger', 'research_store_credit_ledger')
    and not tg.tgisinternal
);

-- 5. Key idempotency / uniqueness constraints exist (SLA + Telegram link).
--    A missing unique index here would defeat escalation idempotency or the
--    one-active-link-per-chat rule.
select 'MISSING_UNIQUE_INDEX' as check, expected
from (values
  ('research_sla_events unique (kind, subject_id, phase)'),
  ('research_telegram_links active-chat partial unique index')
) as t(expected)
where not exists (
  select 1 from pg_indexes
  where schemaname = 'public'
    and (indexname like '%sla_events%' or indexname like '%telegram_links_active%')
);

-- Expected clean result: checks 1, 2, 4, 5 return ZERO rows; check 3 shows
-- research_tables = rls_enabled and rls_disabled = 0.

-- ==========================================================================
-- WEBSITE 3 / RELEASE TRAIN 1: PRODUCTS AND DIAGNOSTICS
-- Run after supabase/research-products-diagnostics.sql. Every query labeled
-- as a failure must return zero rows.
-- ==========================================================================

-- 6. All seven additive Website 3 tables exist with RLS enabled and forced.
--    Rows returned here are FAILURES.
with expected(table_name) as (
  values
    ('research_certificate_access_audit'),
    ('research_metabolic_pathways'),
    ('research_metabolic_interests'),
    ('research_superpower_offers'),
    ('research_biomarker_records'),
    ('research_biomarker_uploads'),
    ('research_product_content')
)
select
  'WEBSITE3_TABLE_RLS_MISSING' as check,
  expected.table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from expected
left join (
  pg_class c
  join pg_namespace n
    on n.oid = c.relnamespace
   and n.nspname = 'public'
) on c.relname = expected.table_name
where c.oid is null
   or c.relrowsecurity = false
   or c.relforcerowsecurity = false;

-- 7. Browser roles have no table privileges on the Website 3 tables.
--    Rows returned here are FAILURES.
select
  'WEBSITE3_UNEXPECTED_TABLE_GRANT' as check,
  grantee,
  table_name,
  privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and table_name in (
    'research_certificate_access_audit',
    'research_metabolic_pathways',
    'research_metabolic_interests',
    'research_superpower_offers',
    'research_biomarker_records',
    'research_biomarker_uploads',
    'research_product_content'
  )
  and grantee in ('PUBLIC', 'anon', 'authenticated');

-- 8. The biomarker confirmation RPC is SECURITY DEFINER with a fixed
--    pg_catalog-only search_path and no browser-role EXECUTE grant.
--    Rows returned here are FAILURES.
select
  'WEBSITE3_CONFIRMATION_FUNCTION_INVALID' as check,
  p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'research_confirm_biomarker_upload'
  and (
    p.prosecdef = false
    or coalesce(array_to_string(p.proconfig, ','), '') <> 'search_path=pg_catalog'
  )
union all
select
  'WEBSITE3_CONFIRMATION_FUNCTION_MISSING' as check,
  'research_confirm_biomarker_upload'
where not exists (
  select 1
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'research_confirm_biomarker_upload'
);

select
  'WEBSITE3_UNEXPECTED_FUNCTION_GRANT' as check,
  grantee,
  routine_name,
  privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name = 'research_confirm_biomarker_upload'
  and grantee in ('PUBLIC', 'anon', 'authenticated');

-- 9. Both Website 3 Storage buckets exist and remain private. Rows returned
--    here are FAILURES.
with expected(bucket_id) as (
  values
    ('research-coa-production'),
    ('research-biomarker-reports-production')
)
select
  'WEBSITE3_PRIVATE_BUCKET_MISSING' as check,
  expected.bucket_id
from expected
left join storage.buckets b on b.id = expected.bucket_id
where b.id is null or b.public = true;

-- 10. Canonical lot quality documents carry the four Website 3 fields. Rows
--     returned here are FAILURES.
with expected(column_name) as (
  values
    ('document_state'),
    ('verification_state'),
    ('private_storage_key'),
    ('reviewed_at')
)
select
  'WEBSITE3_CANONICAL_COA_COLUMN_MISSING' as check,
  expected.column_name
from expected
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = 'research_lot_quality_documents'
 and c.column_name = expected.column_name
where c.column_name is null;

-- 11. Parallel product/lot tables must not exist. Rows returned here are
--     FAILURES.
select
  'WEBSITE3_PARALLEL_COMMERCE_TABLE' as check,
  tablename
from pg_tables
where schemaname = 'public'
  and tablename in (
    'research_product_lots',
    'research_product_certificates'
  );

-- 12. Seed and invariant roll-up. Expected:
--     pathway_count = 3, superpower_count = 1,
--     available_affiliate_without_https = 0,
--     expired_pending_uploads = 0 after the release smoke cleanup.
select
  (select count(*) from public.research_metabolic_pathways) as pathway_count,
  (select count(*) from public.research_superpower_offers) as superpower_count,
  (
    select count(*)
    from public.research_superpower_offers
    where affiliate_enabled
      and (status <> 'available' or affiliate_url !~ '^https://')
  ) as available_affiliate_without_https,
  (
    select count(*)
    from public.research_biomarker_uploads
    where expires_at <= now()
  ) as expired_pending_uploads;
