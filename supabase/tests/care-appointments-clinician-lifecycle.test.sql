-- Disposable-database proof for Xenios Care PR 3.
-- Run after Care PR 1, PR 2, and care-appointments-clinician.sql.
-- All test records are rolled back.

begin;

do $$
begin
  if exists (select 1 from public.care_medical_groups)
    or exists (select 1 from public.care_clinician_profiles)
    or exists (select 1 from public.care_scheduling_providers)
    or exists (select 1 from public.care_appointments) then
    raise exception 'PR 3 migration seeded clinical or scheduling facts';
  end if;
end;
$$;

insert into auth.users (id)
values
  ('30000000-0000-0000-0000-000000000001'), -- patient
  ('30000000-0000-0000-0000-000000000002'), -- other patient
  ('30000000-0000-0000-0000-000000000003'), -- clinician
  ('30000000-0000-0000-0000-000000000004'), -- clinical admin
  ('30000000-0000-0000-0000-000000000005'), -- disjoint profile
  ('30000000-0000-0000-0000-000000000006'), -- disjoint license
  ('30000000-0000-0000-0000-000000000007')  -- disjoint coverage
on conflict (id) do nothing;

insert into public.care_role_assignments (user_id, role, granted_by)
values
  ('30000000-0000-0000-0000-000000000001', 'care_patient', '30000000-0000-0000-0000-000000000004'),
  ('30000000-0000-0000-0000-000000000002', 'care_patient', '30000000-0000-0000-0000-000000000004'),
  ('30000000-0000-0000-0000-000000000003', 'clinician', '30000000-0000-0000-0000-000000000004'),
  ('30000000-0000-0000-0000-000000000004', 'clinical_admin', '30000000-0000-0000-0000-000000000004'),
  ('30000000-0000-0000-0000-000000000005', 'clinician', '30000000-0000-0000-0000-000000000004'),
  ('30000000-0000-0000-0000-000000000006', 'clinician', '30000000-0000-0000-0000-000000000004'),
  ('30000000-0000-0000-0000-000000000007', 'clinician', '30000000-0000-0000-0000-000000000004');

insert into public.care_patients (id, user_id, identity_state, identity_verified_at)
values
  ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'verified', '2026-07-25T18:00:00Z'),
  ('31000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'verified', '2026-07-25T18:00:00Z');

insert into public.care_patient_locations (
  id, patient_id, state_code, source, attested_at, idempotency_key
)
values
  ('32000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'IL', 'patient_attestation', '2026-07-25T18:05:00Z', 'pr3-location-1'),
  ('32000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002', 'IL', 'patient_attestation', '2026-07-25T18:05:00Z', 'pr3-location-2');

insert into public.care_supported_states (
  state_code, supported_state_active, service_coverage_active, waitlist_enabled,
  approved_by, approved_at
)
values ('IL', true, true, false, '30000000-0000-0000-0000-000000000004', '2026-07-25T18:10:00Z');
insert into public.care_supported_states (
  state_code, supported_state_active, service_coverage_active, waitlist_enabled
)
values ('WI', false, false, false);

insert into public.care_clinician_state_coverage (
  id, clinician_user_id, state_code, active, verified_by, verified_at, expires_at
)
values (
  '33000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000003',
  'IL',
  true,
  '30000000-0000-0000-0000-000000000004',
  '2026-07-25T18:15:00Z',
  '2027-07-25T18:15:00Z'
);

insert into public.care_consent_documents (
  id, kind, version, content_hash, status, approved_by, approved_at, effective_at
)
values
  ('34000000-0000-0000-0000-000000000001', 'telehealth', 'pr3-v1', 'sha256:pr3-telehealth', 'approved', '30000000-0000-0000-0000-000000000004', '2026-07-25T18:20:00Z', '2026-07-25T18:20:00Z'),
  ('34000000-0000-0000-0000-000000000002', 'privacy_notice', 'pr3-v1', 'sha256:pr3-privacy', 'approved', '30000000-0000-0000-0000-000000000004', '2026-07-25T18:20:00Z', '2026-07-25T18:20:00Z');

insert into public.care_consent_events (
  id, patient_id, document_id, kind, document_version, action, idempotency_key, occurred_at
)
values
  ('35000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000001', 'telehealth', 'pr3-v1', 'granted', 'pr3-consent-telehealth', '2026-07-25T18:25:00Z'),
  ('35000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000001', '34000000-0000-0000-0000-000000000002', 'privacy_notice', 'pr3-v1', 'granted', 'pr3-consent-privacy', '2026-07-25T18:25:00Z');

insert into public.care_intake_definitions (
  id, version, status, schema_hash, fields, approved_by, approved_at
)
values (
  '36000000-0000-0000-0000-000000000001',
  'pr3-definition-v1',
  'approved',
  'sha256:pr3-intake-definition',
  '[]'::jsonb,
  '30000000-0000-0000-0000-000000000004',
  '2026-07-25T18:30:00Z'
);

insert into public.care_intakes (
  id, patient_id, definition_id, definition_version,
  telehealth_consent_event_id, privacy_consent_event_id,
  status, version, start_idempotency_key, submit_idempotency_key,
  created_at, submitted_at
)
values (
  '37000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000001',
  '36000000-0000-0000-0000-000000000001',
  'pr3-definition-v1',
  '35000000-0000-0000-0000-000000000001',
  '35000000-0000-0000-0000-000000000002',
  'submitted',
  1,
  'pr3-intake-start',
  'pr3-intake-submit',
  '2026-07-25T18:30:00Z',
  '2026-07-25T18:35:00Z'
);

insert into public.care_medical_groups (
  id, legal_name, business_address, authorized_representative,
  agreement_reference, agreement_effective_at, clinical_governance_owner,
  privacy_relationship_approved, incident_process_reference,
  support_escalation_reference, verification_state, verified_by, verified_at
)
values (
  '38000000-0000-0000-0000-000000000001',
  'Disposable test medical group', 'Disposable test address', 'Disposable representative',
  'disposable-agreement-reference', '2026-07-25T18:40:00Z', 'Disposable governance owner',
  true, 'disposable-incident-reference', 'disposable-support-reference',
  'verified', '30000000-0000-0000-0000-000000000004', '2026-07-25T18:40:00Z'
);

insert into public.care_clinician_profiles (
  clinician_user_id, medical_group_id, legal_name, professional_title,
  specialty, agreement_reference, privacy_access_approved,
  clinical_role_approved, verification_state, verified_by, verified_at
)
values (
  '30000000-0000-0000-0000-000000000003',
  '38000000-0000-0000-0000-000000000001',
  'Disposable clinician', 'Clinician', 'Disposable specialty',
  'disposable-clinician-agreement', true, true, 'verified',
  '30000000-0000-0000-0000-000000000004', '2026-07-25T18:45:00Z'
);

insert into public.care_clinician_profiles (
  clinician_user_id, medical_group_id, legal_name, professional_title,
  specialty, agreement_reference, privacy_access_approved,
  clinical_role_approved, verification_state, verified_by, verified_at
)
values
  (
    '30000000-0000-0000-0000-000000000005',
    '38000000-0000-0000-0000-000000000001',
    'Disposable profile clinician', 'Clinician', 'Disposable specialty',
    'disposable-profile-agreement', true, true, 'verified',
    '30000000-0000-0000-0000-000000000004', '2026-07-25T18:45:00Z'
  ),
  (
    '30000000-0000-0000-0000-000000000006',
    '38000000-0000-0000-0000-000000000001',
    'Disposable license clinician', 'Clinician', 'Disposable specialty',
    'disposable-license-agreement', true, true, 'verified',
    '30000000-0000-0000-0000-000000000004', '2026-07-25T18:45:00Z'
  ),
  (
    '30000000-0000-0000-0000-000000000007',
    '38000000-0000-0000-0000-000000000001',
    'Disposable coverage clinician', 'Clinician', 'Disposable specialty',
    'disposable-coverage-agreement', true, true, 'verified',
    '30000000-0000-0000-0000-000000000004', '2026-07-25T18:45:00Z'
  );

insert into public.care_clinician_licenses (
  id, clinician_user_id, license_number, state_code, expires_at,
  evidence_reference, verification_state, verified_by, verified_at
)
values (
  '39000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000003',
  'DISPOSABLE-ONLY', 'IL', '2027-07-25T18:45:00Z',
  'disposable-license-evidence', 'verified',
  '30000000-0000-0000-0000-000000000004', '2026-07-25T18:45:00Z'
);

insert into public.care_clinician_licenses (
  id, clinician_user_id, license_number, state_code, expires_at,
  evidence_reference, verification_state, verified_by, verified_at
)
values (
  '39000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000006',
  'DISPOSABLE-WI-ONLY', 'WI', '2027-07-25T18:45:00Z',
  'disposable-wi-license-evidence', 'verified',
  '30000000-0000-0000-0000-000000000004', '2026-07-25T18:45:00Z'
);

insert into public.care_clinician_state_coverage (
  id, clinician_user_id, state_code, active, verified_by, verified_at,
  expires_at
)
values (
  '33000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000007',
  'WI',
  true,
  '30000000-0000-0000-0000-000000000004',
  '2026-07-25T18:45:00Z',
  '2027-07-25T18:45:00Z'
);

do $$
begin
  if public.care_operational_clinician_ready(
    'WI',
    '2026-07-25T18:46:00Z'
  ) then
    raise exception 'disjoint clinician readiness was accepted';
  end if;
end;
$$;

insert into public.care_clinician_state_coverage (
  id, clinician_user_id, state_code, active, verified_by, verified_at,
  expires_at
)
values (
  '33000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000006',
  'WI',
  true,
  '30000000-0000-0000-0000-000000000004',
  '2026-07-25T18:47:00Z',
  '2027-07-25T18:47:00Z'
);

do $$
begin
  if not public.care_operational_clinician_ready(
    'WI',
    '2026-07-25T18:48:00Z'
  ) then
    raise exception 'matched clinician readiness was rejected';
  end if;
end;
$$;

insert into public.care_scheduling_providers (
  provider_key, legal_name, agreement_reference, scheduling_active,
  telehealth_active, reminder_offsets_minutes, verification_state,
  verified_by, verified_at
)
values (
  'disposable-provider', 'Disposable provider', 'disposable-provider-agreement',
  true, true, array[60, 1440], 'verified',
  '30000000-0000-0000-0000-000000000004', '2026-07-25T18:50:00Z'
);

savepoint stale_request_consent;
insert into public.care_consent_events (
  id, patient_id, document_id, kind, document_version, action,
  idempotency_key, occurred_at
)
values (
  '35000000-0000-0000-0000-000000000003',
  '31000000-0000-0000-0000-000000000001',
  '34000000-0000-0000-0000-000000000001',
  'telehealth',
  'pr3-v1',
  'revoked',
  'pr3-consent-telehealth-revoked',
  '2026-07-25T18:55:00Z'
);
do $$
begin
  begin
    perform public.care_request_appointment(
      '31000000-0000-0000-0000-000000000001',
      '37000000-0000-0000-0000-000000000001',
      'stale-consent-request',
      '2026-07-25T19:00:00Z'
    );
    raise exception 'revoked-consent appointment request was accepted';
  exception when check_violation then null;
  end;
  if (select count(*) from public.care_appointments) <> 0
    or (select count(*) from public.care_appointment_events) <> 0
    or (select count(*) from public.care_telehealth_sessions) <> 0
    or (select count(*) from public.care_appointment_reminders) <> 0 then
    raise exception 'revoked-consent request changed appointment state';
  end if;
end;
$$;
rollback to savepoint stale_request_consent;
release savepoint stale_request_consent;

do $$
begin
  begin
    perform public.care_request_appointment(
      '31000000-0000-0000-0000-000000000002',
      '37000000-0000-0000-0000-000000000001',
      'cross-patient-request',
      '2026-07-25T19:00:00Z'
    );
    raise exception 'cross-patient appointment request was accepted';
  exception when check_violation then null;
  end;
end;
$$;

select public.care_request_appointment(
  '31000000-0000-0000-0000-000000000001',
  '37000000-0000-0000-0000-000000000001',
  'pr3-appointment-request',
  '2026-07-25T19:00:00Z'
);
select public.care_request_appointment(
  '31000000-0000-0000-0000-000000000001',
  '37000000-0000-0000-0000-000000000001',
  'pr3-appointment-request',
  '2026-07-25T19:01:00Z'
);

savepoint stale_request_replay;
insert into public.care_consent_events (
  id, patient_id, document_id, kind, document_version, action,
  idempotency_key, occurred_at
)
values (
  '35000000-0000-0000-0000-000000000003',
  '31000000-0000-0000-0000-000000000001',
  '34000000-0000-0000-0000-000000000001',
  'telehealth',
  'pr3-v1',
  'revoked',
  'pr3-consent-telehealth-replay-revoked',
  '2026-07-25T19:02:00Z'
);
do $$
begin
  begin
    perform public.care_request_appointment(
      '31000000-0000-0000-0000-000000000001',
      '37000000-0000-0000-0000-000000000001',
      'pr3-appointment-request',
      '2026-07-25T19:03:00Z'
    );
    raise exception 'revoked-consent appointment request replay was accepted';
  exception when check_violation then null;
  end;
  if (select count(*) from public.care_appointments) <> 1
    or (select version from public.care_appointments limit 1) <> 0
    or (select count(*) from public.care_appointment_events) <> 1 then
    raise exception 'revoked-consent request replay changed appointment state';
  end if;
end;
$$;
rollback to savepoint stale_request_replay;
release savepoint stale_request_replay;

savepoint inactive_state_assignment;
update public.care_supported_states
set service_coverage_active = false
where state_code = 'IL';
do $$
declare
  v_appointment_id uuid;
begin
  select id into v_appointment_id
  from public.care_appointments
  where patient_id = '31000000-0000-0000-0000-000000000001';
  begin
    perform public.care_assign_clinician(
      v_appointment_id,
      '30000000-0000-0000-0000-000000000003',
      '30000000-0000-0000-0000-000000000004',
      'inactive-state-assignment',
      '2026-07-25T19:04:00Z'
    );
    raise exception 'inactive-state appointment assignment was accepted';
  exception when check_violation then null;
  end;
  if (select version from public.care_appointments where id = v_appointment_id) <> 0
    or (select count(*) from public.care_appointment_events where appointment_id = v_appointment_id) <> 1
    or (select count(*) from public.care_clinician_assignment_events where appointment_id = v_appointment_id) <> 0
    or (select count(*) from public.care_clinician_reviews where appointment_id = v_appointment_id) <> 0
    or (select count(*) from public.care_telehealth_sessions where appointment_id = v_appointment_id) <> 0
    or (select count(*) from public.care_appointment_reminders where appointment_id = v_appointment_id) <> 0 then
    raise exception 'inactive-state assignment changed appointment state';
  end if;
end;
$$;
rollback to savepoint inactive_state_assignment;
release savepoint inactive_state_assignment;

select public.care_assign_clinician(
  (select id from public.care_appointments where patient_id = '31000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000004',
  'pr3-assign-clinician',
  '2026-07-25T19:05:00Z'
);

savepoint inactive_state_assignment_replay;
update public.care_supported_states
set supported_state_active = false,
    service_coverage_active = false
where state_code = 'IL';
do $$
declare
  v_appointment_id uuid;
begin
  select id into v_appointment_id from public.care_appointments limit 1;
  begin
    perform public.care_assign_clinician(
      v_appointment_id,
      '30000000-0000-0000-0000-000000000003',
      '30000000-0000-0000-0000-000000000004',
      'pr3-assign-clinician',
      '2026-07-25T19:06:00Z'
    );
    raise exception 'inactive-state appointment assignment replay was accepted';
  exception when check_violation then null;
  end;
  if (select version from public.care_appointments where id = v_appointment_id) <> 1
    or (select count(*) from public.care_appointment_events where appointment_id = v_appointment_id) <> 2
    or (select count(*) from public.care_clinician_assignment_events where appointment_id = v_appointment_id) <> 1
    or (select count(*) from public.care_clinician_reviews where appointment_id = v_appointment_id) <> 1 then
    raise exception 'inactive-state assignment replay changed appointment state';
  end if;
end;
$$;
rollback to savepoint inactive_state_assignment_replay;
release savepoint inactive_state_assignment_replay;

savepoint inactive_state_schedule;
update public.care_supported_states
set supported_state_active = false,
    service_coverage_active = false
where state_code = 'IL';
do $$
declare
  v_appointment_id uuid;
begin
  select id into v_appointment_id
  from public.care_appointments
  where patient_id = '31000000-0000-0000-0000-000000000001';
  begin
    perform public.care_schedule_appointment(
      v_appointment_id,
      '30000000-0000-0000-0000-000000000004',
      1,
      'disposable-provider',
      'private-inactive-state-session',
      '2026-07-26T19:00:00Z',
      '2026-07-26T19:30:00Z',
      'inactive-state-schedule',
      '2026-07-25T19:09:00Z'
    );
    raise exception 'inactive-state appointment scheduling was accepted';
  exception when check_violation then null;
  end;
  if (select version from public.care_appointments where id = v_appointment_id) <> 1
    or (select count(*) from public.care_appointment_events where appointment_id = v_appointment_id) <> 2
    or (select count(*) from public.care_clinician_assignment_events where appointment_id = v_appointment_id) <> 1
    or (select count(*) from public.care_clinician_reviews where appointment_id = v_appointment_id) <> 1
    or (select count(*) from public.care_telehealth_sessions where appointment_id = v_appointment_id) <> 0
    or (select count(*) from public.care_appointment_reminders where appointment_id = v_appointment_id) <> 0 then
    raise exception 'inactive-state scheduling changed appointment state';
  end if;
end;
$$;
rollback to savepoint inactive_state_schedule;
release savepoint inactive_state_schedule;

select public.care_schedule_appointment(
  (select id from public.care_appointments where patient_id = '31000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000004',
  1,
  'disposable-provider',
  'private-disposable-session-reference',
  '2026-07-26T19:00:00Z',
  '2026-07-26T19:30:00Z',
  'pr3-schedule-appointment',
  '2026-07-25T19:10:00Z'
);

savepoint inactive_state_schedule_replay;
update public.care_supported_states
set supported_state_active = false,
    service_coverage_active = false
where state_code = 'IL';
do $$
declare
  v_appointment_id uuid;
begin
  select id into v_appointment_id from public.care_appointments limit 1;
  begin
    perform public.care_schedule_appointment(
      v_appointment_id,
      '30000000-0000-0000-0000-000000000004',
      1,
      'disposable-provider',
      'private-disposable-session-reference',
      '2026-07-26T19:00:00Z',
      '2026-07-26T19:30:00Z',
      'pr3-schedule-appointment',
      '2026-07-25T19:11:00Z'
    );
    raise exception 'inactive-state appointment schedule replay was accepted';
  exception when check_violation then null;
  end;
  if (select version from public.care_appointments where id = v_appointment_id) <> 2
    or (select count(*) from public.care_appointment_events where appointment_id = v_appointment_id) <> 3
    or (select count(*) from public.care_telehealth_sessions where appointment_id = v_appointment_id) <> 1
    or (select count(*) from public.care_appointment_reminders where appointment_id = v_appointment_id) <> 1 then
    raise exception 'inactive-state schedule replay changed appointment state';
  end if;
end;
$$;
rollback to savepoint inactive_state_schedule_replay;
release savepoint inactive_state_schedule_replay;

do $$
declare
  v_appointment_id uuid;
begin
  select id into v_appointment_id from public.care_appointments
  where patient_id = '31000000-0000-0000-0000-000000000001';
  if (select count(*) from public.care_appointments where id = v_appointment_id) <> 1 then
    raise exception 'appointment idempotency proof failed';
  end if;
  if (
    select count(*) from public.care_appointment_reminders
    where appointment_id = v_appointment_id
  ) <> 1 then
    raise exception 'appointment reminder creation proof failed';
  end if;
  begin
    perform public.care_patient_appointment_action(
      v_appointment_id,
      '31000000-0000-0000-0000-000000000002',
      2,
      'check_in',
      'cross-patient-action',
      '2026-07-26T18:55:00Z'
    );
    raise exception 'cross-patient appointment mutation was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.care_appointment_events set action = 'cancelled'
    where appointment_id = v_appointment_id;
    raise exception 'appointment event update was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.care_clinician_assignment_events
    where appointment_id = v_appointment_id;
    raise exception 'clinician assignment event delete was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.care_clinical_configuration_audit set action = 'delete';
    raise exception 'clinical configuration audit update was accepted';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

do $$
declare
  v_appointment_id uuid;
begin
  select id into v_appointment_id
  from public.care_appointments
  where patient_id = '31000000-0000-0000-0000-000000000001';
  begin
    perform public.care_admin_mark_no_show(
      v_appointment_id,
      '30000000-0000-0000-0000-000000000004',
      2,
      'pr3-premature-no-show',
      '2026-07-26T18:59:00Z'
    );
    raise exception 'premature no-show transition was accepted';
  exception when sqlstate '55000' then null;
  end;
  if (select status from public.care_appointments where id = v_appointment_id) <> 'scheduled'
    or (select version from public.care_appointments where id = v_appointment_id) <> 2
    or (select count(*) from public.care_appointment_events where appointment_id = v_appointment_id) <> 3
    or (select count(*) from public.care_telehealth_sessions where appointment_id = v_appointment_id and status = 'ready') <> 1
    or (select count(*) from public.care_appointment_reminders where appointment_id = v_appointment_id and status = 'pending') <> 1 then
    raise exception 'premature no-show changed appointment state';
  end if;
end;
$$;

savepoint checked_in_no_show;
select public.care_patient_appointment_action(
  (select id from public.care_appointments where patient_id = '31000000-0000-0000-0000-000000000001'),
  '31000000-0000-0000-0000-000000000001',
  2,
  'check_in',
  'pr3-check-in-before-no-show-proof',
  '2026-07-26T18:55:00Z'
);
do $$
declare
  v_appointment_id uuid;
begin
  select id into v_appointment_id
  from public.care_appointments
  where patient_id = '31000000-0000-0000-0000-000000000001';
  begin
    perform public.care_admin_mark_no_show(
      v_appointment_id,
      '30000000-0000-0000-0000-000000000004',
      3,
      'pr3-checked-in-no-show',
      '2026-07-26T19:31:00Z'
    );
    raise exception 'checked-in no-show transition was accepted';
  exception when sqlstate '55000' then null;
  end;
  if (select status from public.care_appointments where id = v_appointment_id) <> 'checked_in'
    or (select version from public.care_appointments where id = v_appointment_id) <> 3
    or (select count(*) from public.care_appointment_events where appointment_id = v_appointment_id) <> 4
    or (select count(*) from public.care_telehealth_sessions where appointment_id = v_appointment_id and status = 'ready') <> 1
    or (select count(*) from public.care_appointment_reminders where appointment_id = v_appointment_id and status = 'pending') <> 1 then
    raise exception 'checked-in no-show changed appointment state';
  end if;
end;
$$;
rollback to savepoint checked_in_no_show;
release savepoint checked_in_no_show;

select public.care_admin_mark_no_show(
  (select id from public.care_appointments where patient_id = '31000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000004',
  2,
  'pr3-no-show',
  '2026-07-26T19:31:00Z'
);
select public.care_admin_mark_no_show(
  (select id from public.care_appointments where patient_id = '31000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000004',
  2,
  'pr3-no-show',
  '2026-07-26T19:32:00Z'
);

do $$
begin
  begin
    perform public.care_assign_clinician(
      (select id from public.care_appointments where patient_id = '31000000-0000-0000-0000-000000000001'),
      '30000000-0000-0000-0000-000000000003',
      '30000000-0000-0000-0000-000000000001',
      'pr3-assign-clinician',
      '2026-07-26T19:32:00Z'
    );
    raise exception 'unauthorized assignment replay was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.care_admin_mark_no_show(
      (select id from public.care_appointments where patient_id = '31000000-0000-0000-0000-000000000001'),
      '30000000-0000-0000-0000-000000000001',
      2,
      'pr3-no-show',
      '2026-07-26T19:32:00Z'
    );
    raise exception 'unauthorized no-show replay was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select public.care_schedule_appointment(
  (select id from public.care_appointments where patient_id = '31000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000004',
  3,
  'disposable-provider',
  'private-disposable-session-reference-2',
  '2026-07-27T19:00:00Z',
  '2026-07-27T19:30:00Z',
  'pr3-reschedule-appointment',
  '2026-07-26T19:35:00Z'
);

do $$
begin
  begin
    perform public.care_schedule_appointment(
      (select id from public.care_appointments where patient_id = '31000000-0000-0000-0000-000000000001'),
      '30000000-0000-0000-0000-000000000001',
      3,
      'disposable-provider',
      'private-disposable-session-reference-2',
      '2026-07-27T19:00:00Z',
      '2026-07-27T19:30:00Z',
      'pr3-reschedule-appointment',
      '2026-07-26T19:36:00Z'
    );
    raise exception 'unauthorized schedule replay was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

savepoint stale_consent_check_in;
insert into public.care_consent_events (
  id, patient_id, document_id, kind, document_version, action,
  idempotency_key, occurred_at
)
values (
  '35000000-0000-0000-0000-000000000004',
  '31000000-0000-0000-0000-000000000001',
  '34000000-0000-0000-0000-000000000002',
  'privacy_notice',
  'pr3-v1',
  'revoked',
  'pr3-consent-privacy-revoked',
  '2026-07-27T18:50:00Z'
);
do $$
declare
  v_appointment_id uuid;
begin
  select id into v_appointment_id
  from public.care_appointments
  where patient_id = '31000000-0000-0000-0000-000000000001';
  begin
    perform public.care_patient_appointment_action(
      v_appointment_id,
      '31000000-0000-0000-0000-000000000001',
      4,
      'check_in',
      'stale-consent-check-in',
      '2026-07-27T18:55:00Z'
    );
    raise exception 'revoked-consent check-in was accepted';
  exception when check_violation then null;
  end;
  if (select status from public.care_appointments where id = v_appointment_id) <> 'scheduled'
    or (select version from public.care_appointments where id = v_appointment_id) <> 4
    or (select count(*) from public.care_appointment_events where appointment_id = v_appointment_id) <> 5
    or (select count(*) from public.care_telehealth_sessions where appointment_id = v_appointment_id) <> 2
    or (select count(*) from public.care_appointment_reminders where appointment_id = v_appointment_id) <> 2 then
    raise exception 'revoked-consent check-in changed appointment state';
  end if;
end;
$$;
rollback to savepoint stale_consent_check_in;
release savepoint stale_consent_check_in;

select public.care_patient_appointment_action(
  (select id from public.care_appointments where patient_id = '31000000-0000-0000-0000-000000000001'),
  '31000000-0000-0000-0000-000000000001',
  4,
  'check_in',
  'pr3-check-in',
  '2026-07-27T18:55:00Z'
);

savepoint stale_consent_check_in_replay;
insert into public.care_consent_events (
  id, patient_id, document_id, kind, document_version, action,
  idempotency_key, occurred_at
)
values (
  '35000000-0000-0000-0000-000000000004',
  '31000000-0000-0000-0000-000000000001',
  '34000000-0000-0000-0000-000000000002',
  'privacy_notice',
  'pr3-v1',
  'revoked',
  'pr3-consent-privacy-replay-revoked',
  '2026-07-27T18:56:00Z'
);
do $$
declare
  v_appointment_id uuid;
begin
  select id into v_appointment_id from public.care_appointments limit 1;
  begin
    perform public.care_patient_appointment_action(
      v_appointment_id,
      '31000000-0000-0000-0000-000000000001',
      4,
      'check_in',
      'pr3-check-in',
      '2026-07-27T18:57:00Z'
    );
    raise exception 'revoked-consent check-in replay was accepted';
  exception when check_violation then null;
  end;
  if (select status from public.care_appointments where id = v_appointment_id) <> 'checked_in'
    or (select version from public.care_appointments where id = v_appointment_id) <> 5
    or (select count(*) from public.care_appointment_events where appointment_id = v_appointment_id) <> 6
    or (select count(*) from public.care_telehealth_sessions where appointment_id = v_appointment_id) <> 2
    or (select count(*) from public.care_appointment_reminders where appointment_id = v_appointment_id) <> 2 then
    raise exception 'revoked-consent check-in replay changed appointment state';
  end if;
end;
$$;
rollback to savepoint stale_consent_check_in_replay;
release savepoint stale_consent_check_in_replay;

select public.care_clinician_complete_appointment(
  (select id from public.care_appointments where patient_id = '31000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000003',
  5,
  'pr3-complete',
  '2026-07-27T19:31:00Z'
);
select public.care_apply_clinician_review_action(
  (select id from public.care_clinician_reviews where patient_id = '31000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000003',
  'human_clinician',
  0,
  'approve',
  'pr3-human-decision',
  '2026-07-27T19:35:00Z'
);

do $$
begin
  if exists (
    select 1 from public.care_clinician_reviews
    where patient_id = '31000000-0000-0000-0000-000000000001'
      and (
        status <> 'decided'
        or final_decision <> 'approved'
        or final_decision_source <> 'human_clinician'
      )
  ) then
    raise exception 'human clinician final-decision proof failed';
  end if;
  begin
    perform public.care_assign_clinician(
      (select id from public.care_appointments where patient_id = '31000000-0000-0000-0000-000000000001'),
      '30000000-0000-0000-0000-000000000003',
      '30000000-0000-0000-0000-000000000004',
      'pr3-reassign-decided',
      '2026-07-27T19:40:00Z'
    );
    raise exception 'decided review assignment mutation was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.care_clinician_review_events set actor_kind = 'ai';
    raise exception 'clinician review event update was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.care_clinician_review_events;
    raise exception 'clinician review event delete was accepted';
  exception when sqlstate '55000' then null;
  end;
  if (
    select state from public.care_capabilities
    where capability_key = 'care'
  ) <> 'disabled' then
    raise exception 'Care capability changed from disabled';
  end if;
end;
$$;

rollback;
