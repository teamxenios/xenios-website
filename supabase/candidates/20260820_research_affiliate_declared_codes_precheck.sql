-- Read-only precheck for 20260820_research_affiliate_declared_codes.sql.
-- APPLY_READY only when the table and its index names are unclaimed and
-- service_role exists.
with table_state as (
  select
    to_regclass('public.research_affiliate_declared_codes') is not null as table_exists,
    to_regclass('public.research_affiliate_declared_codes_one_capture') is not null as capture_index_exists,
    to_regclass('public.research_affiliate_declared_codes_by_request') is not null as request_index_exists,
    to_regclass('public.research_affiliate_declared_codes_by_key') is not null as key_index_exists
), role_state as (
  select exists (select 1 from pg_roles where rolname = 'service_role') as service_role_exists
)
select jsonb_build_object(
  'verdict', case
    when not table_state.table_exists
     and not table_state.capture_index_exists
     and not table_state.request_index_exists
     and not table_state.key_index_exists
     and role_state.service_role_exists
    then 'APPLY_READY'
    when role_state.service_role_exists is not true
    then 'STOP_MISSING_ROLES'
    else 'STOP_REVIEW_EXISTING_OBJECTS'
  end,
  'tableExists', table_state.table_exists,
  'indexes', jsonb_build_object(
    'one_capture', table_state.capture_index_exists,
    'by_request', table_state.request_index_exists,
    'by_key', table_state.key_index_exists
  ),
  'serviceRoleExists', role_state.service_role_exists
) as affiliate_declared_codes_precheck
from table_state
cross join role_state;
