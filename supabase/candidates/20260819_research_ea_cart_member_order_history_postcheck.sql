-- Postcheck for 20260819_research_ea_cart_member_order_history.sql.
-- Read-only. Verdict APPLIED_OK means the routine exists STABLE and SECURITY
-- DEFINER, only service_role may execute it, and neither cart checkouts nor
-- legal bindings became directly readable by any public role.

with rpc as (
  select p.oid, p.provolatile, p.prosecdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'research_early_access_cart_checkouts_for_customers'
    and p.pronargs = 1
    and p.proargtypes[0] = 'pg_catalog.text[]'::regtype
), grants as (
  select
    exists (
      select 1 from rpc
      where exists (select 1 from pg_roles where rolname = 'service_role')
        and has_function_privilege('service_role', rpc.oid, 'EXECUTE')
    ) as service_role_may_execute,
    exists (
      select 1 from rpc, aclexplode((select proacl from pg_proc where oid = rpc.oid)) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ) as public_may_execute,
    exists (
      select 1 from pg_roles r
      where r.rolname in ('anon', 'authenticated')
        and has_function_privilege(r.rolname, (select oid from rpc), 'EXECUTE')
    ) as browser_role_may_execute,
    exists (
      -- Browser roles must never read either table directly. service_role is
      -- probed only on legal_bindings (revoked by M62): the M58 cart tables
      -- were never revoked from service_role in production, so probing it
      -- there would report REVIEW_REQUIRED forever for a pre-existing state
      -- this migration does not touch (closing that hole is the separate
      -- founder-gated hardening candidate 20260819_research_ea_cart_service_role_revoke).
      select 1 from pg_roles r
      where r.rolname in ('anon', 'authenticated')
        and (
          has_table_privilege(r.rolname, 'public.research_early_access_cart_checkouts', 'SELECT')
          or has_table_privilege(r.rolname, 'public.research_early_access_legal_bindings', 'SELECT')
        )
    ) or exists (
      select 1
      where has_table_privilege('service_role', 'public.research_early_access_legal_bindings', 'SELECT')
    ) as any_role_reads_tables_directly
)
select jsonb_build_object(
  'verdict', case
    when (select count(*) from rpc) = 1
     and (select provolatile from rpc) = 's'
     and (select prosecdef from rpc)
     and grants.service_role_may_execute
     and not grants.public_may_execute
     and not grants.browser_role_may_execute
     and not grants.any_role_reads_tables_directly
    then 'APPLIED_OK'
    else 'REVIEW_REQUIRED'
  end,
  'routinePresent', (select count(*) from rpc) = 1,
  'routineStable', coalesce((select provolatile from rpc) = 's', false),
  'routineSecurityDefiner', coalesce((select prosecdef from rpc), false),
  'serviceRoleMayExecute', grants.service_role_may_execute,
  'publicMayExecute', grants.public_may_execute,
  'browserRoleMayExecute', grants.browser_role_may_execute,
  'anyRoleReadsTablesDirectly', grants.any_role_reads_tables_directly
) as lane_c_history_postcheck
from grants;
