\set ON_ERROR_STOP on

-- Read-only production verification for the focused Care PR3 foundation.
-- This script creates or mutates no row.

do $$
declare
  expected_tables constant text[] := array[
    'care_medical_groups',
    'care_clinician_profiles',
    'care_clinician_licenses',
    'care_scheduling_providers',
    'care_clinical_configuration_audit',
    'care_appointments',
    'care_telehealth_sessions',
    'care_appointment_events',
    'care_clinician_assignment_events',
    'care_clinician_reviews',
    'care_clinician_review_events',
    'care_appointment_reminders'
  ];
  service_routines constant text[] := array[
    'care_clinician_ready',
    'care_operational_clinician_ready',
    'care_request_appointment',
    'care_assign_clinician',
    'care_schedule_appointment',
    'care_patient_appointment_action',
    'care_clinician_complete_appointment',
    'care_apply_clinician_review_action',
    'care_admin_mark_no_show'
  ];
  present_tables integer;
  forced_rls_tables integer;
  browser_table_grants integer;
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
    raise exception 'Care PR3 table verification failed';
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
    raise exception 'Care PR3 forced RLS verification failed';
  end if;

  select count(*)
  into browser_table_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = any(expected_tables)
    and grantee in ('anon', 'authenticated');

  if browser_table_grants <> 0 then
    raise exception 'Care PR3 browser table grant verification failed';
  end if;

  select count(*)
  into browser_routine_grants
  from information_schema.routine_privileges
  where specific_schema = 'public'
    and routine_name = any(service_routines)
    and grantee in ('PUBLIC', 'anon', 'authenticated');

  if browser_routine_grants <> 0 then
    raise exception 'Care PR3 browser routine grant verification failed';
  end if;

  select count(distinct routine_name)
  into service_routine_grants
  from information_schema.routine_privileges
  where specific_schema = 'public'
    and routine_name = any(service_routines)
    and grantee = 'service_role'
    and privilege_type = 'EXECUTE';

  if service_routine_grants <> cardinality(service_routines) then
    raise exception 'Care PR3 service routine grant verification failed';
  end if;

  select
    (select count(*) from public.care_medical_groups)
    + (select count(*) from public.care_clinician_profiles)
    + (select count(*) from public.care_clinician_licenses)
    + (select count(*) from public.care_scheduling_providers)
    + (select count(*) from public.care_clinical_configuration_audit)
    + (select count(*) from public.care_appointments)
    + (select count(*) from public.care_telehealth_sessions)
    + (select count(*) from public.care_appointment_events)
    + (select count(*) from public.care_clinician_assignment_events)
    + (select count(*) from public.care_clinician_reviews)
    + (select count(*) from public.care_clinician_review_events)
    + (select count(*) from public.care_appointment_reminders)
  into unexpected_rows;

  if unexpected_rows <> 0 then
    raise exception 'Care PR3 migration created unexpected rows';
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
  'pr3_tables', 12,
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
        'care_medical_groups',
        'care_clinician_profiles',
        'care_clinician_licenses',
        'care_scheduling_providers',
        'care_clinical_configuration_audit',
        'care_appointments',
        'care_telehealth_sessions',
        'care_appointment_events',
        'care_clinician_assignment_events',
        'care_clinician_reviews',
        'care_clinician_review_events',
        'care_appointment_reminders'
      )
      and grantee in ('anon', 'authenticated')
  ),
  'care_capability_state', (
    select state from public.care_capabilities where capability_key = 'care'
  ),
  'care_role_rows', (select count(*) from public.care_role_assignments),
  'care_appointment_rows', (select count(*) from public.care_appointments),
  'care_review_rows', (select count(*) from public.care_clinician_reviews)
);
