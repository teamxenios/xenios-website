\set ON_ERROR_STOP on

select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('research_status_recovery_tokens', 'research_status_recovery_sessions')
order by c.relname;

select c.relname, coalesce(role_row.rolname, 'PUBLIC') as grantee, acl.privilege_type
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) acl
left join pg_catalog.pg_roles role_row on role_row.oid = acl.grantee
where n.nspname = 'public'
  and c.relname in ('research_status_recovery_tokens', 'research_status_recovery_sessions')
order by c.relname, grantee, acl.privilege_type;

select
  p.proname,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  owner_role.rolname as owner,
  p.prosecdef,
  p.provolatile,
  p.proconfig,
  encode(digest(pg_catalog.pg_get_functiondef(p.oid), 'sha256'), 'hex') as body_sha256
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
join pg_catalog.pg_roles owner_role on owner_role.oid = p.proowner
where n.nspname = 'public'
  and p.proname in (
    'research_status_recovery_match',
    'research_status_recovery_prepare_delivery',
    'research_status_recovery_exchange',
    'research_status_recovery_status',
    'research_status_recovery_end'
  )
order by p.proname;

select p.proname, coalesce(role_row.rolname, 'PUBLIC') as grantee, acl.privilege_type
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
left join pg_catalog.pg_roles role_row on role_row.oid = acl.grantee
where n.nspname = 'public'
  and p.proname like 'research_status_recovery_%'
order by p.proname, grantee, acl.privilege_type;

select
  (select count(*) from public.research_status_recovery_tokens) as token_rows,
  (select count(*) from public.research_status_recovery_sessions) as session_rows,
  'POSTCHECK_COMPLETE' as result;
