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
  ('30000000-0000-0000-0000-000000000004')  -- clinical admin
on conflict (id) do nothing;

insert into public.care_role_assignments (user_id, role, granted_by)
values
  ('30000000-0000-0000-0000-000000000001', 'care_patient', '30000000-0000-0000-0000-000000000004'),
  ('30000000-0000-0000-0000-000000000002', 'care_patient', '30000000-0000-0000-0000-000000000004'),
  ('30000000-0000-0000-0000-000000000003', 'clinician', '30000000-0000-0000-0000-000000000004'),
  ('30000000-0000-0000-0000-000000000004', 'clinical_admin', '30000000-0000-0000-0000-000000000004');

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

select public.care_assign_clinician(
  (select id from public.care_appointments where patient_id = '31000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000004',
  'pr3-assign-clinician',
  '2026-07-25T19:05:00Z'
);

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

select public.care_admin_mark_no_show(
  (select id from public.care_appointments where patient_id = '31000000-0000-0000-0000-000000000001'),
  '30000000-0000-0000-0000-000000000004',
  2,
  'pr3-no-show',
  '2026-07-26T19:31:00Z'
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

select public.care_patient_appointment_action(
  (select id from public.care_appointments where patient_id = '31000000-0000-0000-0000-000000000001'),
  '31000000-0000-0000-0000-000000000001',
  4,
  'check_in',
  'pr3-check-in',
  '2026-07-27T18:55:00Z'
);
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
