-- Read-only postcheck. Every query should return the declared object or the
-- expected boolean posture; this script does not create, update, or delete.
select
  c.relname,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('catalog_interest_leads', 'catalog_interest_consents')
order by c.relname;

select schemaname, tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('catalog_interest_leads', 'catalog_interest_consents');

select
  p.oid::regprocedure::text as function_signature,
  p.prosecdef as security_definer,
  p.proconfig as function_config,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'record_catalog_interest';

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('catalog_interest_leads', 'catalog_interest_consents')
  and grantee in ('anon', 'authenticated', 'service_role')
order by grantee, table_name, privilege_type;
