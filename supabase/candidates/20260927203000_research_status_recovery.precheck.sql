\set ON_ERROR_STOP on

select case
  when pg_catalog.to_regclass('public.research_assisted_order_requests') is null
    then 'STOP_MISSING_ASSISTED_ORDER_REQUESTS'
  when pg_catalog.to_regclass('public.research_assisted_order_events') is null
    then 'STOP_MISSING_ASSISTED_ORDER_EVENTS'
  else 'PASS_PREREQUISITES_PRESENT'
end as precheck;

select
  pg_catalog.to_regclass('public.research_status_recovery_tokens') as token_table_before,
  pg_catalog.to_regclass('public.research_status_recovery_sessions') as session_table_before;

select p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'research_status_recovery_%'
order by p.proname, identity_arguments;

select 'READ_ONLY_PRECHECK_COMPLETE' as result;
