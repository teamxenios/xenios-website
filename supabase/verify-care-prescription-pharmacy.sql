\set ON_ERROR_STOP on

-- Read-only production verification for the focused Care PR4 foundation.
-- This script creates or mutates no row.

do $$
declare
  expected_tables constant text[] := array[
    'care_pharmacies',
    'care_pharmacy_licenses',
    'care_pharmacy_state_coverage',
    'care_pharmacy_operators',
    'care_pharmacy_configuration_audit',
    'care_prescription_content_sources',
    'care_prescriptions',
    'care_prescription_events',
    'care_pharmacy_orders',
    'care_pharmacy_order_events'
  ];
  service_routines constant text[] := array[
    'care_pharmacy_ready',
    'care_prescription_readiness',
    'care_create_prescription_draft',
    'care_sign_prescription',
    'care_assign_pharmacy_order',
    'care_apply_pharmacy_order_action',
    'care_resolve_pharmacy_clarification'
  ];
  present_tables integer;
  forced_rls_tables integer;
  total_care_tables integer;
  total_forced_rls_tables integer;
  browser_table_grants integer;
  browser_policies integer;
  browser_routine_grants integer;
  service_routine_grants integer;
  unexpected_rows bigint;
  disabled_rows integer;
begin
  select count(*)
  into present_tables
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind = 'r'
    and relation.relname = any(expected_tables);

  if present_tables <> cardinality(expected_tables) then
    raise exception 'Care PR4 table verification failed';
  end if;

  select count(*)
  into forced_rls_tables
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = any(expected_tables)
    and relation.relrowsecurity
    and relation.relforcerowsecurity;

  if forced_rls_tables <> cardinality(expected_tables) then
    raise exception 'Care PR4 forced RLS verification failed';
  end if;

  select count(*)
  into total_care_tables
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind = 'r'
    and relation.relname like 'care_%';

  select count(*)
  into total_forced_rls_tables
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind = 'r'
    and relation.relname like 'care_%'
    and relation.relrowsecurity
    and relation.relforcerowsecurity;

  if total_care_tables <> 38 or total_forced_rls_tables <> 38 then
    raise exception 'Care PR1-4 total forced RLS verification failed';
  end if;

  select count(*)
  into browser_table_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = any(expected_tables)
    and grantee in ('anon', 'authenticated');

  if browser_table_grants <> 0 then
    raise exception 'Care PR4 browser table grant verification failed';
  end if;

  select count(*)
  into browser_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = any(expected_tables)
    and (
      'anon' = any(roles)
      or 'authenticated' = any(roles)
      or 'public' = any(roles)
    );

  if browser_policies <> 0 then
    raise exception 'Care PR4 browser policy verification failed';
  end if;

  select count(*)
  into browser_routine_grants
  from information_schema.routine_privileges
  where specific_schema = 'public'
    and routine_name = any(service_routines)
    and grantee in ('PUBLIC', 'anon', 'authenticated');

  if browser_routine_grants <> 0 then
    raise exception 'Care PR4 browser routine grant verification failed';
  end if;

  select count(distinct routine_name)
  into service_routine_grants
  from information_schema.routine_privileges
  where specific_schema = 'public'
    and routine_name = any(service_routines)
    and grantee = 'service_role'
    and privilege_type = 'EXECUTE';

  if service_routine_grants <> cardinality(service_routines) then
    raise exception 'Care PR4 service routine grant verification failed';
  end if;

  select
    (select count(*) from public.care_pharmacies)
    + (select count(*) from public.care_pharmacy_licenses)
    + (select count(*) from public.care_pharmacy_state_coverage)
    + (select count(*) from public.care_pharmacy_operators)
    + (select count(*) from public.care_pharmacy_configuration_audit)
    + (select count(*) from public.care_prescription_content_sources)
    + (select count(*) from public.care_prescriptions)
    + (select count(*) from public.care_prescription_events)
    + (select count(*) from public.care_pharmacy_orders)
    + (select count(*) from public.care_pharmacy_order_events)
  into unexpected_rows;

  if unexpected_rows <> 0 then
    raise exception 'Care PR4 migration created unexpected rows';
  end if;

  select count(*)
  into disabled_rows
  from public.care_capabilities
  where capability_key = 'care'
    and state = 'disabled'
    and approved_by is null
    and approved_at is null;

  if disabled_rows <> 1 then
    raise exception 'Care capability is not canonically disabled';
  end if;
end
$$;

select json_build_object(
  'pr4_tables', 10,
  'total_care_tables', (
    select count(*)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
      and relation.relname like 'care_%'
  ),
  'forced_rls_tables', (
    select count(*)
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
      and relation.relname like 'care_%'
      and relation.relrowsecurity
      and relation.relforcerowsecurity
  ),
  'browser_table_grants', (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'care_pharmacies',
        'care_pharmacy_licenses',
        'care_pharmacy_state_coverage',
        'care_pharmacy_operators',
        'care_pharmacy_configuration_audit',
        'care_prescription_content_sources',
        'care_prescriptions',
        'care_prescription_events',
        'care_pharmacy_orders',
        'care_pharmacy_order_events'
      )
      and grantee in ('anon', 'authenticated')
  ),
  'browser_routine_grants', (
    select count(*)
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name in (
        'care_pharmacy_ready',
        'care_prescription_readiness',
        'care_create_prescription_draft',
        'care_sign_prescription',
        'care_assign_pharmacy_order',
        'care_apply_pharmacy_order_action',
        'care_resolve_pharmacy_clarification'
      )
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ),
  'browser_policies', (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'care_pharmacies',
        'care_pharmacy_licenses',
        'care_pharmacy_state_coverage',
        'care_pharmacy_operators',
        'care_pharmacy_configuration_audit',
        'care_prescription_content_sources',
        'care_prescriptions',
        'care_prescription_events',
        'care_pharmacy_orders',
        'care_pharmacy_order_events'
      )
      and (
        'anon' = any(roles)
        or 'authenticated' = any(roles)
        or 'public' = any(roles)
      )
  ),
  'service_rpc_grants', (
    select count(distinct routine_name)
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name in (
        'care_pharmacy_ready',
        'care_prescription_readiness',
        'care_create_prescription_draft',
        'care_sign_prescription',
        'care_assign_pharmacy_order',
        'care_apply_pharmacy_order_action',
        'care_resolve_pharmacy_clarification'
      )
      and grantee = 'service_role'
      and privilege_type = 'EXECUTE'
  ),
  'care_capability_state', (
    select state from public.care_capabilities where capability_key = 'care'
  ),
  'care_role_rows', (select count(*) from public.care_role_assignments),
  'care_prescription_rows', (select count(*) from public.care_prescriptions),
  'care_pharmacy_order_rows', (select count(*) from public.care_pharmacy_orders)
);
