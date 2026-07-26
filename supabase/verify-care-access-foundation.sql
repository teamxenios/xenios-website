\set ON_ERROR_STOP on

-- Read-only production verification for the focused Care PR1 access foundation.
-- This file creates or mutates no row.

do $$
declare
  missing_tables integer;
  forced_rls_tables integer;
  unexpected_browser_grants integer;
  disabled_rows integer;
  non_disabled_rows integer;
begin
  select 3 - count(*)
  into missing_tables
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind = 'r'
    and relation.relname in (
      'care_capabilities',
      'care_role_assignments',
      'care_access_audit'
    );

  if missing_tables <> 0 then
    raise exception 'care access foundation table verification failed';
  end if;

  select count(*)
  into forced_rls_tables
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname in (
      'care_capabilities',
      'care_role_assignments',
      'care_access_audit'
    )
    and relation.relrowsecurity
    and relation.relforcerowsecurity;

  if forced_rls_tables <> 3 then
    raise exception 'care access foundation forced RLS verification failed';
  end if;

  select count(*)
  into unexpected_browser_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in (
      'care_capabilities',
      'care_role_assignments',
      'care_access_audit'
    )
    and grantee in ('anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER');

  if unexpected_browser_grants <> 0 then
    raise exception 'care access foundation browser mutation grant verification failed';
  end if;

  select count(*)
  into disabled_rows
  from public.care_capabilities
  where capability_key = 'care'
    and state = 'disabled'
    and approved_by is null
    and approved_at is null;

  select count(*)
  into non_disabled_rows
  from public.care_capabilities
  where capability_key = 'care'
    and state <> 'disabled';

  if disabled_rows <> 1 or non_disabled_rows <> 0 then
    raise exception 'canonical Care disabled capability verification failed';
  end if;
end
$$;

select json_build_object(
  'care_capability_rows', (select count(*) from public.care_capabilities),
  'care_role_rows', (select count(*) from public.care_role_assignments),
  'care_access_audit_rows', (select count(*) from public.care_access_audit),
  'forced_rls_tables', (
    select count(*)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'care_capabilities',
        'care_role_assignments',
        'care_access_audit'
      )
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  )
);
