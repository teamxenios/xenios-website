-- xenios research referral-fraud schema verification. READ ONLY, changes nothing.
-- Paste into the Supabase SQL Editor and run after research-referral-fraud.sql.
-- Every row should say ok = true.
-- Covers: the 3 new tables (exist + RLS on + no public policies), the
-- applicant_ip column on referral_attributions, the two uniqueness indexes,
-- the queue/audit indexes, and the research_rate_limit_hit function.

with tables as (
  select r.table_name,
         c.oid is not null as table_exists,
         coalesce(c.relrowsecurity, false) as rls_enabled,
         (select count(*) from pg_policies p
           where p.schemaname = 'public' and p.tablename = r.table_name) as policy_count
  from (values ('referral_events'), ('referral_fraud_flags'), ('research_rate_limits')) as r(table_name)
  left join pg_class c
    on c.relname = r.table_name
   and c.relnamespace = 'public'::regnamespace
   and c.relkind = 'r'
),
indexes as (
  select i.index_name,
         exists (select 1 from pg_indexes x
                  where x.schemaname = 'public' and x.indexname = i.index_name) as index_exists
  from (values
    ('referral_identities_owner_active_uq'),
    ('referral_attributions_application_uq'),
    ('referral_events_attribution_idx'),
    ('referral_events_created_idx'),
    ('referral_fraud_flags_status_idx'),
    ('referral_fraud_flags_attribution_idx')
  ) as i(index_name)
)
select 'table: ' || table_name as check_name,
       table_exists and rls_enabled and policy_count = 0 as ok,
       case when not table_exists then 'MISSING TABLE'
            when not rls_enabled then 'RLS NOT ENABLED'
            when policy_count > 0 then policy_count || ' unexpected policies'
            else 'exists, rls on, no public policies' end as detail
from tables
union all
select 'index: ' || index_name, index_exists,
       case when index_exists then 'exists' else 'MISSING INDEX' end
from indexes
union all
select 'column: referral_attributions.applicant_ip',
       exists (select 1 from information_schema.columns
                where table_schema = 'public'
                  and table_name = 'referral_attributions'
                  and column_name = 'applicant_ip'),
       'household-correlation column'
union all
select 'function: research_rate_limit_hit(text, integer, integer)',
       exists (select 1 from pg_proc p
                join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public'
                 and p.proname = 'research_rate_limit_hit'
                 and pg_get_function_identity_arguments(p.oid)
                     = 'p_key text, p_window_seconds integer, p_max_hits integer'),
       'durable rate limiter, returns boolean allowed'
order by 1;

-- OPTIONAL live probe of the limiter (NOT read-only: writes one counter row,
-- then removes it). Uncomment to run; expect: allowed = true.
-- select public.research_rate_limit_hit('verify-probe', 60, 1000) as allowed;
-- delete from public.research_rate_limits where key = 'verify-probe';
