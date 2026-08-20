-- Read-only precheck for 20260819_research_affiliate_customer_bindings.sql.
-- APPLY_READY only when the table name is unclaimed and the roles the
-- candidate grants/revokes actually exist in this deployment.
with table_state as (
  select to_regclass('public.research_affiliate_customer_bindings') is not null
           as table_exists
), role_state as (
  select
    exists (select 1 from pg_roles where rolname = 'service_role') as service_role_exists,
    exists (select 1 from pg_roles where rolname = 'anon') as anon_exists,
    exists (select 1 from pg_roles where rolname = 'authenticated') as authenticated_exists
)
select jsonb_build_object(
  'verdict', case
    when not table_state.table_exists
     and role_state.service_role_exists
    then 'APPLY_READY'
    when table_state.table_exists
    then 'STOP_REVIEW_EXISTING_OBJECTS'
    else 'STOP_MISSING_ROLES'
  end,
  'tableExists', table_state.table_exists,
  'roles', jsonb_build_object(
    'service_role', role_state.service_role_exists,
    'anon', role_state.anon_exists,
    'authenticated', role_state.authenticated_exists
  )
) as affiliate_customer_bindings_precheck
from table_state
cross join role_state;
