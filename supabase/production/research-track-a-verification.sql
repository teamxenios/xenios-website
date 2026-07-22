-- ==========================================================================
-- XENIOS RESEARCH - TRACK A VERIFICATION (read-only, run after the Track A apply)
-- ==========================================================================
-- Confirms the member-platform schema landed with the safety posture the server
-- relies on. Any row returned by checks 1, 2, or 4 is a DEFECT to resolve.
-- ==========================================================================

-- The exact set of tables Track A creates (parsed from migrations 9-19).
create temporary table if not exists _track_a_expected(table_name text);
truncate _track_a_expected;
insert into _track_a_expected(table_name) values
  ('research_agreement_acceptances'),
  ('research_member_profile_sections'),
  ('research_assessment_responses'),
  ('research_blueprints'),
  ('research_xenios30_plans'),
  ('research_xenios90_plans'),
  ('research_plan_change_requests'),
  ('research_plan_documents'),
  ('research_tracker_observations'),
  ('research_private_media'),
  ('research_media_access_log'),
  ('research_media_retention_elections'),
  ('research_member_questions'),
  ('research_telegram_links'),
  ('research_sla_events');

-- 1. Every expected Track A table EXISTS. Rows here are MISSING tables (FAIL).
select 'MISSING_TABLE' as check, e.table_name
from _track_a_expected e
where not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname = e.table_name);

-- 2. Every Track A table has RLS ENABLED. Rows here are FAILURES.
select 'RLS_DISABLED' as check, c.relname as table_name
from pg_class c join pg_namespace n on n.oid = c.relnamespace
join _track_a_expected e on e.table_name = c.relname
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false;

-- 3. Presence roll-up.
select count(*) as track_a_tables_present,
       count(*) filter (where c.relrowsecurity) as rls_enabled,
       count(*) filter (where not c.relrowsecurity) as rls_disabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
join _track_a_expected e on e.table_name = c.relname
where n.nspname = 'public' and c.relkind = 'r';

-- 4. No Track A table has ANY policy (service-role-only). Rows here are FAILURES.
select 'UNEXPECTED_POLICY' as check, p.tablename, p.policyname
from pg_policies p join _track_a_expected e on e.table_name = p.tablename
where p.schemaname = 'public';

-- 5. Confirm migration 9's billing_state column landed on research_members.
select 'MISSING_BILLING_STATE_COLUMN' as check
where not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'research_members'
    and column_name = 'billing_state');

-- Expected clean result: checks 1, 2, 4, 5 return ZERO rows; check 3 shows
-- rls_disabled = 0 and track_a_tables_present = 15.
