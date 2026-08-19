-- Postcheck for 20260819_research_ea_cart_commission_settlement.sql.
-- Read-only. Verdict APPLIED_OK means the ledger and the atomic door exist,
-- the door is SECURITY DEFINER and service_role-only, the ledger is behind
-- forced RLS with zero direct privileges, and the append-only trigger stands.

with rpc as (
  select p.oid, p.prosecdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'research_early_access_commit_cart_settlement_with_commission'
    and p.pronargs = 10
), ledger as (
  select c.oid, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'research_early_access_cart_commission_events'
), trigger_state as (
  select exists (
    select 1
    from pg_trigger t
    join ledger l on l.oid = t.tgrelid
    where t.tgname = 'research_early_access_cart_commission_events_append_only'
      and not t.tgisinternal
  ) as append_only_trigger_present
), grants as (
  select
    exists (
      select 1 from rpc
      where exists (select 1 from pg_roles where rolname = 'service_role')
        and has_function_privilege('service_role', rpc.oid, 'EXECUTE')
    ) as service_role_may_execute,
    exists (
      -- acldefault expansion: a NULL proacl means the PostgreSQL default,
      -- which INCLUDES a PUBLIC execute grant; skipping null would call
      -- the most dangerous case clean (the M71 rehearsal lesson).
      select 1 from rpc, aclexplode(coalesce((select proacl from pg_proc where oid = rpc.oid),
        acldefault('f', (select proowner from pg_proc where oid = rpc.oid)))) acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    ) as public_may_execute,
    exists (
      select 1 from pg_roles r
      where r.rolname in ('anon', 'authenticated', 'service_role')
        and has_table_privilege(
          r.rolname, 'public.research_early_access_cart_commission_events', 'SELECT'
        )
    ) as any_role_reads_ledger_directly
)
select jsonb_build_object(
  'verdict', case
    when (select count(*) from rpc) = 1
     and (select prosecdef from rpc)
     and (select count(*) from ledger) = 1
     and (select relrowsecurity and relforcerowsecurity from ledger)
     and (select append_only_trigger_present from trigger_state)
     and grants.service_role_may_execute
     and not grants.public_may_execute
     and not grants.any_role_reads_ledger_directly
    then 'APPLIED_OK'
    else 'REVIEW_REQUIRED'
  end,
  'atomicRpcPresent', (select count(*) from rpc) = 1,
  'atomicRpcSecurityDefiner', coalesce((select prosecdef from rpc), false),
  'ledgerPresent', (select count(*) from ledger) = 1,
  'ledgerForcedRls', coalesce((select relrowsecurity and relforcerowsecurity from ledger), false),
  'appendOnlyTriggerPresent', (select append_only_trigger_present from trigger_state),
  'serviceRoleMayExecute', grants.service_role_may_execute,
  'publicMayExecute', grants.public_may_execute,
  'anyRoleReadsLedgerDirectly', grants.any_role_reads_ledger_directly
) as lane_c_commission_postcheck
from grants;
