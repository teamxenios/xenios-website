\set ON_ERROR_STOP on

-- Read-only production verification for the focused Care PR2 foundation.
-- This script creates or mutates no row.

do $$
declare
  expected_tables constant text[] := array[
    'care_patients',
    'care_patient_locations',
    'care_supported_states',
    'care_supported_state_audit',
    'care_clinician_state_coverage',
    'care_clinician_coverage_audit',
    'care_consent_documents',
    'care_consent_events',
    'care_eligibility_checks',
    'care_waitlist_events',
    'care_intake_definitions',
    'care_intakes',
    'care_intake_revisions'
  ];
  present_tables integer;
  forced_rls_tables integer;
  unexpected_browser_grants integer;
  unexpected_browser_routine_grants integer;
  service_routine_grants integer;
  unexpected_seed_rows bigint;
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
    raise exception 'Care PR2 table verification failed';
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
    raise exception 'Care PR2 forced RLS verification failed';
  end if;

  select count(*)
  into unexpected_browser_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = any(expected_tables)
    and grantee in ('anon', 'authenticated');

  if unexpected_browser_grants <> 0 then
    raise exception 'Care PR2 browser table grant verification failed';
  end if;

  select count(*)
  into unexpected_browser_routine_grants
  from information_schema.routine_privileges
  where specific_schema = 'public'
    and routine_name in (
      'care_active_clinician_count',
      'care_intake_autosave',
      'care_intake_submit'
    )
    and grantee in ('PUBLIC', 'anon', 'authenticated');

  if unexpected_browser_routine_grants <> 0 then
    raise exception 'Care PR2 browser routine grant verification failed';
  end if;

  select count(distinct routine_name)
  into service_routine_grants
  from information_schema.routine_privileges
  where specific_schema = 'public'
    and routine_name in (
      'care_active_clinician_count',
      'care_intake_autosave',
      'care_intake_submit'
    )
    and grantee = 'service_role'
    and privilege_type = 'EXECUTE';

  if service_routine_grants <> 3 then
    raise exception 'Care PR2 service routine grant verification failed';
  end if;

  select
    (select count(*) from public.care_patients)
    + (select count(*) from public.care_patient_locations)
    + (select count(*) from public.care_supported_states)
    + (select count(*) from public.care_supported_state_audit)
    + (select count(*) from public.care_clinician_state_coverage)
    + (select count(*) from public.care_clinician_coverage_audit)
    + (select count(*) from public.care_consent_documents)
    + (select count(*) from public.care_consent_events)
    + (select count(*) from public.care_eligibility_checks)
    + (select count(*) from public.care_waitlist_events)
    + (select count(*) from public.care_intake_definitions)
    + (select count(*) from public.care_intakes)
    + (select count(*) from public.care_intake_revisions)
  into unexpected_seed_rows;

  if unexpected_seed_rows <> 0 then
    raise exception 'Care PR2 migration created unexpected rows';
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
  'pr2_tables', 13,
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
  'browser_routine_grants', (
    select count(*)
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name in (
        'care_active_clinician_count',
        'care_intake_autosave',
        'care_intake_submit'
      )
      and grantee in ('PUBLIC', 'anon', 'authenticated')
  ),
  'service_routine_grants', (
    select count(distinct routine_name)
    from information_schema.routine_privileges
    where specific_schema = 'public'
      and routine_name in (
        'care_active_clinician_count',
        'care_intake_autosave',
        'care_intake_submit'
      )
      and grantee = 'service_role'
      and privilege_type = 'EXECUTE'
  ),
  'care_capability_state', (
    select state from public.care_capabilities where capability_key = 'care'
  ),
  'care_role_rows', (select count(*) from public.care_role_assignments),
  'care_patient_rows', (select count(*) from public.care_patients),
  'care_consent_rows', (select count(*) from public.care_consent_events),
  'care_intake_rows', (select count(*) from public.care_intakes)
);
