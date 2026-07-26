-- Disposable proof for Xenios Care PR 5. Run after Care PR 1-5 migrations.
-- No fixture survives this transaction.
begin;

do $$
begin
  if exists (select 1 from public.care_instruction_sources)
    or exists (select 1 from public.care_patient_instructions)
    or exists (select 1 from public.care_supply_sources)
    or exists (select 1 from public.care_supply_kits)
  then raise exception 'PR5 migration seeded instruction or supply facts'; end if;
end;
$$;

insert into auth.users (id) values
  ('50000000-0000-4000-8000-000000000001'), -- patient
  ('50000000-0000-4000-8000-000000000002'), -- other patient
  ('50000000-0000-4000-8000-000000000003'), -- clinician
  ('50000000-0000-4000-8000-000000000004'), -- clinical admin
  ('50000000-0000-4000-8000-000000000005'), -- assigned pharmacy operator
  ('50000000-0000-4000-8000-000000000006')  -- other-pharmacy operator
on conflict (id) do nothing;

insert into public.care_role_assignments (user_id,role,granted_by) values
  ('50000000-0000-4000-8000-000000000001','care_patient','50000000-0000-4000-8000-000000000004'),
  ('50000000-0000-4000-8000-000000000002','care_patient','50000000-0000-4000-8000-000000000004'),
  ('50000000-0000-4000-8000-000000000003','clinician','50000000-0000-4000-8000-000000000004'),
  ('50000000-0000-4000-8000-000000000004','clinical_admin','50000000-0000-4000-8000-000000000004'),
  ('50000000-0000-4000-8000-000000000005','pharmacy_operations','50000000-0000-4000-8000-000000000004'),
  ('50000000-0000-4000-8000-000000000006','pharmacy_operations','50000000-0000-4000-8000-000000000004');

insert into public.care_patients (id,user_id,identity_state,identity_verified_at) values
  ('51000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','verified','2026-07-25T18:00:00Z'),
  ('51000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','verified','2026-07-25T18:00:00Z');
insert into public.care_patient_locations
  (id,patient_id,state_code,source,attested_at,idempotency_key) values
  ('52000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','IL','patient_attestation','2026-07-25T18:01:00Z','pr5-location-1'),
  ('52000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000002','IL','patient_attestation','2026-07-25T18:01:00Z','pr5-location-2');
insert into public.care_supported_states
  (state_code,supported_state_active,service_coverage_active,waitlist_enabled,approved_by,approved_at)
values ('IL',true,true,false,'50000000-0000-4000-8000-000000000004','2026-07-25T18:02:00Z');
insert into public.care_clinician_state_coverage
  (id,clinician_user_id,state_code,active,verified_by,verified_at,expires_at)
values ('53000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003','IL',true,
  '50000000-0000-4000-8000-000000000004','2026-07-25T18:03:00Z','2027-07-25T18:03:00Z');

insert into public.care_consent_documents
  (id,kind,version,content_hash,status,approved_by,approved_at,effective_at) values
  ('54000000-0000-4000-8000-000000000001','telehealth','pr5-v1','sha256:pr5-t','approved','50000000-0000-4000-8000-000000000004','2026-07-25T18:04:00Z','2026-07-25T18:04:00Z'),
  ('54000000-0000-4000-8000-000000000002','privacy_notice','pr5-v1','sha256:pr5-p','approved','50000000-0000-4000-8000-000000000004','2026-07-25T18:04:00Z','2026-07-25T18:04:00Z');
insert into public.care_consent_events
  (id,patient_id,document_id,kind,document_version,action,idempotency_key,occurred_at) values
  ('55000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000001','telehealth','pr5-v1','granted','pr5-consent-t','2026-07-25T18:05:00Z'),
  ('55000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000002','privacy_notice','pr5-v1','granted','pr5-consent-p','2026-07-25T18:05:00Z');
insert into public.care_intake_definitions
  (id,version,status,schema_hash,fields,approved_by,approved_at)
values ('56000000-0000-4000-8000-000000000001','pr5-v1','approved','sha256:pr5-i','[]',
  '50000000-0000-4000-8000-000000000004','2026-07-25T18:06:00Z');
insert into public.care_intakes
  (id,patient_id,definition_id,definition_version,telehealth_consent_event_id,
   privacy_consent_event_id,status,version,start_idempotency_key,submit_idempotency_key,
   created_at,submitted_at)
values ('57000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001',
  '56000000-0000-4000-8000-000000000001','pr5-v1',
  '55000000-0000-4000-8000-000000000001','55000000-0000-4000-8000-000000000002',
  'submitted',1,'pr5-intake-start','pr5-intake-submit','2026-07-25T18:07:00Z','2026-07-25T18:08:00Z');

insert into public.care_medical_groups
  (id,legal_name,business_address,authorized_representative,agreement_reference,
   agreement_effective_at,clinical_governance_owner,privacy_relationship_approved,
   incident_process_reference,support_escalation_reference,verification_state,
   verified_by,verified_at)
values ('58000000-0000-4000-8000-000000000001','Disposable medical group','Disposable address',
  'Disposable representative','disposable-agreement','2026-07-25T18:09:00Z',
  'Disposable governance',true,'disposable-incident','disposable-support','verified',
  '50000000-0000-4000-8000-000000000004','2026-07-25T18:09:00Z');
insert into public.care_clinician_profiles
  (clinician_user_id,medical_group_id,legal_name,professional_title,specialty,
   agreement_reference,privacy_access_approved,clinical_role_approved,
   verification_state,verified_by,verified_at)
values ('50000000-0000-4000-8000-000000000003','58000000-0000-4000-8000-000000000001',
  'Disposable clinician','Clinician','Disposable specialty','disposable-clinician-agreement',
  true,true,'verified','50000000-0000-4000-8000-000000000004','2026-07-25T18:10:00Z');
insert into public.care_clinician_licenses
  (id,clinician_user_id,license_number,state_code,expires_at,evidence_reference,
   verification_state,verified_by,verified_at)
values ('59000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003',
  'DISPOSABLE-ONLY','IL','2027-07-25T18:10:00Z','disposable-evidence','verified',
  '50000000-0000-4000-8000-000000000004','2026-07-25T18:10:00Z');

insert into public.care_appointments
  (id,patient_id,intake_id,patient_location_id,patient_state_code,
   assigned_clinician_user_id,clinician_coverage_id,status,starts_at,ends_at,
   version,request_idempotency_key,created_at,updated_at)
values ('5a000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001',
  'IL','50000000-0000-4000-8000-000000000003','53000000-0000-4000-8000-000000000001',
  'completed','2026-07-25T19:00:00Z','2026-07-25T19:30:00Z',1,'pr5-appointment',
  '2026-07-25T18:30:00Z','2026-07-25T19:30:00Z');
insert into public.care_clinician_reviews
  (id,appointment_id,patient_id,assigned_clinician_user_id,patient_state_code,
   status,final_decision,final_decision_source,version,created_at,updated_at)
values ('5b000000-0000-4000-8000-000000000001','5a000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000003',
  'IL','decided','approved','human_clinician',1,'2026-07-25T19:30:00Z','2026-07-25T19:35:00Z');
insert into public.care_prescription_content_sources
  (id,patient_id,appointment_id,clinician_review_id,clinician_user_id,source_kind,
   formulation,concentration,route,quantity,directions,refills,verified_by,
   verified_at,idempotency_key,created_at)
values ('5c000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001',
  '5a000000-0000-4000-8000-000000000001','5b000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000003','clinician_direction',
  'Disposable formulation','Disposable concentration','Disposable route',
  'Disposable quantity','Disposable prescription directions',0,
  '50000000-0000-4000-8000-000000000003','2026-07-25T19:40:00Z',
  'pr5-prescription-source','2026-07-25T19:40:00Z');
insert into public.care_prescriptions
  (id,patient_id,appointment_id,clinician_review_id,prescribing_clinician_user_id,
   verified_content_source_id,status,version,signed_at,create_idempotency_key,
   created_at,updated_at)
values ('5d000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001',
  '5a000000-0000-4000-8000-000000000001','5b000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000003','5c000000-0000-4000-8000-000000000001',
  'signed',1,'2026-07-25T19:41:00Z','pr5-prescription',
  '2026-07-25T19:40:00Z','2026-07-25T19:41:00Z');

insert into public.care_pharmacies
  (id,legal_name,legal_address,agreement_reference,integration_reference,
   support_contact_reference,verification_state,verified_by,verified_at)
values ('5e000000-0000-4000-8000-000000000001','Disposable pharmacy','Disposable address',
  'disposable-agreement','disposable-integration','disposable-support','verified',
  '50000000-0000-4000-8000-000000000004','2026-07-25T19:42:00Z'),
  ('5e000000-0000-4000-8000-000000000002','Other disposable pharmacy','Disposable address',
  'other-disposable-agreement','other-disposable-integration','other-disposable-support','verified',
  '50000000-0000-4000-8000-000000000004','2026-07-25T19:42:00Z');
insert into public.care_pharmacy_operators
  (id,pharmacy_id,user_id,active,verified_by,verified_at)
values ('5f000000-0000-4000-8000-000000000001','5e000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000005',true,
  '50000000-0000-4000-8000-000000000004','2026-07-25T19:42:00Z'),
  ('5f000000-0000-4000-8000-000000000002','5e000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000006',true,
  '50000000-0000-4000-8000-000000000004','2026-07-25T19:42:00Z');
insert into public.care_pharmacy_licenses
  (id,pharmacy_id,state_code,license_number,expires_at,evidence_reference,
   verification_state,verified_by,verified_at)
values ('5f100000-0000-4000-8000-000000000001','5e000000-0000-4000-8000-000000000001',
  'IL','DISPOSABLE-PHARMACY-ONLY','2027-07-25T19:42:00Z',
  'disposable-pharmacy-license','verified',
  '50000000-0000-4000-8000-000000000004','2026-07-25T19:42:00Z');
insert into public.care_pharmacy_state_coverage
  (id,pharmacy_id,state_code,dispensing_scope_reference,
   shipping_coverage_reference,instruction_source_reference,
   supply_source_reference,active,verified_by,verified_at,expires_at)
values ('5f200000-0000-4000-8000-000000000001','5e000000-0000-4000-8000-000000000001',
  'IL','disposable-dispensing','disposable-shipping',
  'disposable-instruction-source','disposable-supply-source',true,
  '50000000-0000-4000-8000-000000000004','2026-07-25T19:42:00Z',
  '2027-07-25T19:42:00Z');
insert into public.care_pharmacy_orders
  (id,patient_id,prescription_id,assigned_pharmacy_id,patient_state_code,status,
   clarification_open,version,assignment_idempotency_key,created_at,updated_at)
values ('60000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001',
  '5d000000-0000-4000-8000-000000000001','5e000000-0000-4000-8000-000000000001',
  'IL','accepted',false,1,'pr5-pharmacy-order','2026-07-25T19:43:00Z','2026-07-25T19:43:00Z');

select public.care_create_instruction_source(
  '51000000-0000-4000-8000-000000000001','5d000000-0000-4000-8000-000000000001',
  'pharmacy_label','disposable-label-reference','sha256:disposable-label',
  'Disposable label content','50000000-0000-4000-8000-000000000005',
  'pr5-label-source','2026-07-25T19:45:00Z'
);
select public.care_create_instruction_source(
  '51000000-0000-4000-8000-000000000001','5d000000-0000-4000-8000-000000000001',
  'pharmacy_information','disposable-pharmacy-reference','sha256:disposable-pharmacy',
  'Disposable pharmacy information','50000000-0000-4000-8000-000000000005',
  'pr5-pharmacy-source','2026-07-25T19:46:00Z'
);
select public.care_create_instruction_source(
  '51000000-0000-4000-8000-000000000001','5d000000-0000-4000-8000-000000000001',
  'clinician_direction','disposable-clinician-reference','sha256:disposable-clinician',
  'Disposable clinician direction','50000000-0000-4000-8000-000000000003',
  'pr5-clinician-source','2026-07-25T19:47:00Z'
);
select public.care_create_instruction_source(
  '51000000-0000-4000-8000-000000000001','5d000000-0000-4000-8000-000000000001',
  'manufacturer_material','disposable-manufacturer-reference','sha256:disposable-manufacturer',
  'Disposable manufacturer material','50000000-0000-4000-8000-000000000004',
  'pr5-manufacturer-source','2026-07-25T19:48:00Z'
);
select public.care_create_instruction_source(
  null,null,'general_education','disposable-education-reference',
  'sha256:disposable-education','Disposable general education',
  '50000000-0000-4000-8000-000000000004','pr5-education-source',
  '2026-07-25T19:49:00Z'
);

do $$
begin
  begin
    perform public.care_create_patient_instruction_draft(
      '51000000-0000-4000-8000-000000000002',
      '5d000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000003',
      'Cross-patient content',
      (select id from public.care_instruction_sources where kind='pharmacy_label'),
      (select id from public.care_instruction_sources where kind='pharmacy_information'),
      (select id from public.care_instruction_sources where kind='clinician_direction'),
      (select id from public.care_instruction_sources where kind='manufacturer_material'),
      null,'pr5-cross-patient','2026-07-25T19:50:00Z'
    );
    raise exception 'cross-patient instruction was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.care_create_patient_instruction_draft(
      '51000000-0000-4000-8000-000000000001',
      '5d000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000003',
      'Education substitution content',
      (select id from public.care_instruction_sources where kind='pharmacy_label'),
      (select id from public.care_instruction_sources where kind='pharmacy_information'),
      (select id from public.care_instruction_sources where kind='clinician_direction'),
      (select id from public.care_instruction_sources where kind='general_education'),
      null,'pr5-education-substitution','2026-07-25T19:50:00Z'
    );
    raise exception 'general education was accepted as patient instruction source';
  exception when check_violation then null;
  end;
end;
$$;

select public.care_create_patient_instruction_draft(
  '51000000-0000-4000-8000-000000000001',
  '5d000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000003',
  'Disposable patient-specific instruction content',
  (select id from public.care_instruction_sources where kind='pharmacy_label'),
  (select id from public.care_instruction_sources where kind='pharmacy_information'),
  (select id from public.care_instruction_sources where kind='clinician_direction'),
  (select id from public.care_instruction_sources where kind='manufacturer_material'),
  null,'pr5-instruction-draft','2026-07-25T19:51:00Z'
);
do $$
declare
  instruction_count bigint;
  event_count bigint;
begin
  select count(*) into instruction_count from public.care_patient_instructions;
  select count(*) into event_count from public.care_instruction_events;
  begin
    perform public.care_create_patient_instruction_draft(
      '51000000-0000-4000-8000-000000000001',
      '5d000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000003',
      'Changed replay must fail',
      (select id from public.care_instruction_sources where kind='pharmacy_label'),
      (select id from public.care_instruction_sources where kind='pharmacy_information'),
      (select id from public.care_instruction_sources where kind='clinician_direction'),
      (select id from public.care_instruction_sources where kind='manufacturer_material'),
      null,'pr5-instruction-draft','2026-07-25T19:52:00Z'
    );
    raise exception 'changed instruction replay was accepted';
  exception when check_violation then null;
  end;
  if (select count(*) from public.care_patient_instructions) <> instruction_count
    or (select count(*) from public.care_instruction_events) <> event_count
  then raise exception 'changed instruction replay mutated history'; end if;
end;
$$;
select public.care_create_patient_instruction_draft(
  '51000000-0000-4000-8000-000000000001',
  '5d000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000003',
  'Disposable patient-specific instruction content',
  (select id from public.care_instruction_sources where kind='pharmacy_label'),
  (select id from public.care_instruction_sources where kind='pharmacy_information'),
  (select id from public.care_instruction_sources where kind='clinician_direction'),
  (select id from public.care_instruction_sources where kind='manufacturer_material'),
  null,'pr5-instruction-draft','2026-07-25T19:52:00Z'
);
update public.care_supported_states
set service_coverage_active=false
where state_code='IL';
do $$
declare before_count bigint;
begin
  select count(*) into before_count from public.care_patient_instructions;
  begin
    perform public.care_create_patient_instruction_draft(
      '51000000-0000-4000-8000-000000000001',
      '5d000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000003',
      'Blocked after state disablement',
      (select id from public.care_instruction_sources where kind='pharmacy_label'),
      (select id from public.care_instruction_sources where kind='pharmacy_information'),
      (select id from public.care_instruction_sources where kind='clinician_direction'),
      (select id from public.care_instruction_sources where kind='manufacturer_material'),
      null,'pr5-state-disabled-draft','2026-07-25T19:52:30Z'
    );
    raise exception 'state-disabled instruction draft was accepted';
  exception when check_violation then null;
  end;
  if (select count(*) from public.care_patient_instructions) <> before_count
  then raise exception 'state-disabled draft mutated instruction history'; end if;
end;
$$;
update public.care_supported_states
set service_coverage_active=true
where state_code='IL';
update public.care_clinician_state_coverage
set active=false
where id='53000000-0000-4000-8000-000000000001';
do $$
declare
  instruction_count bigint;
  event_count bigint;
begin
  select count(*) into instruction_count from public.care_patient_instructions;
  select count(*) into event_count from public.care_instruction_events;
  begin
    perform public.care_create_patient_instruction_draft(
      '51000000-0000-4000-8000-000000000001',
      '5d000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000003',
      'Disposable patient-specific instruction content',
      (select id from public.care_instruction_sources where kind='pharmacy_label'),
      (select id from public.care_instruction_sources where kind='pharmacy_information'),
      (select id from public.care_instruction_sources where kind='clinician_direction'),
      (select id from public.care_instruction_sources where kind='manufacturer_material'),
      null,'pr5-instruction-draft','2026-07-25T19:52:40Z'
    );
    raise exception 'revoked clinician-coverage replay was accepted';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.care_patient_instructions) <> instruction_count
    or (select count(*) from public.care_instruction_events) <> event_count
  then raise exception 'revoked clinician replay mutated instruction history'; end if;
end;
$$;
update public.care_clinician_state_coverage
set active=true
where id='53000000-0000-4000-8000-000000000001';
select public.care_release_patient_instruction(
  (select id from public.care_patient_instructions),
  '50000000-0000-4000-8000-000000000003',0,
  'pr5-instruction-release','2026-07-25T19:53:00Z'
);
select public.care_acknowledge_patient_instruction(
  (select id from public.care_patient_instructions),
  '51000000-0000-4000-8000-000000000001',1,
  'pr5-instruction-ack','2026-07-25T19:54:00Z'
);
select public.care_acknowledge_patient_instruction(
  (select id from public.care_patient_instructions),
  '51000000-0000-4000-8000-000000000001',1,
  'pr5-instruction-ack','2026-07-25T19:55:00Z'
);

do $$
begin
  begin
    perform public.care_save_supply_source(
      null,'Unauthorized supply source','unauthorized-relationship',
      'unauthorized-support','verified',
      '50000000-0000-4000-8000-000000000003',0,
      'pr5-unauthorized-source','2026-07-25T19:55:00Z'
    );
    raise exception 'non-admin supply-source verification was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select public.care_save_supply_source(
  null,'Disposable supply source','disposable-relationship',
  'disposable-support','verified',
  '50000000-0000-4000-8000-000000000004',0,
  'pr5-supply-source','2026-07-25T19:56:00Z'
);
select public.care_save_supply_source(
  null,'Disposable supply source','disposable-relationship',
  'disposable-support','verified',
  '50000000-0000-4000-8000-000000000004',0,
  'pr5-supply-source','2026-07-25T19:56:00Z'
);

do $$
begin
  begin
    perform public.care_save_supply_source(
      null,'Changed replay source','disposable-relationship',
      'disposable-support','verified',
      '50000000-0000-4000-8000-000000000004',0,
      'pr5-supply-source','2026-07-25T19:56:00Z'
    );
    raise exception 'changed supply-source replay was accepted';
  exception when check_violation then null;
  end;
end;
$$;

select public.care_create_supply_kit(
  '51000000-0000-4000-8000-000000000001',
  '5d000000-0000-4000-8000-000000000001',
  (select id from public.care_patient_instructions),
  (select id from public.care_supply_sources),
  'Disposable product-specific device','Disposable verified replacement cadence',
  '50000000-0000-4000-8000-000000000004',null,
  'pr5-supply-kit','2026-07-25T19:57:00Z'
);
select public.care_release_supply_kit(
  (select id from public.care_supply_kits),
  '50000000-0000-4000-8000-000000000004',0,
  'pr5-supply-release','2026-07-25T19:58:00Z'
);

do $$
begin
  begin
    perform public.care_request_supply_replacement(
      (select id from public.care_supply_kits),
      '51000000-0000-4000-8000-000000000002',
      'pr5-cross-patient-replacement','2026-07-25T19:59:00Z'
    );
    raise exception 'cross-patient replacement was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select public.care_request_supply_replacement(
  (select id from public.care_supply_kits),
  '51000000-0000-4000-8000-000000000001',
  'pr5-replacement','2026-07-25T20:00:00Z'
);
select public.care_request_supply_replacement(
  (select id from public.care_supply_kits),
  '51000000-0000-4000-8000-000000000001',
  'pr5-replacement','2026-07-25T20:01:00Z'
);
select public.care_save_supply_source(
  (select id from public.care_supply_sources),
  'Disposable supply source','disposable-relationship','disposable-support',
  'expired','50000000-0000-4000-8000-000000000004',1,
  'pr5-supply-source-expire','2026-07-25T20:01:10Z'
);
select public.care_save_supply_source(
  (select id from public.care_supply_sources),
  'Disposable supply source','disposable-relationship','disposable-support',
  'expired','50000000-0000-4000-8000-000000000004',1,
  'pr5-supply-source-expire','2026-07-25T20:01:10Z'
);
do $$
declare
  replacement_status text;
  replacement_version integer;
  event_count bigint;
begin
  select status,version into replacement_status,replacement_version
  from public.care_supply_replacements;
  select count(*) into event_count from public.care_supply_replacement_events;
  begin
    perform public.care_apply_supply_replacement_action(
      (select id from public.care_supply_replacements),
      '50000000-0000-4000-8000-000000000005',0,'approve',
      'pr5-expired-source-approve','2026-07-25T20:01:20Z'
    );
    raise exception 'expired supply source allowed replacement approval';
  exception when check_violation then null;
  end;
  begin
    perform public.care_save_supply_source(
      (select id from public.care_supply_sources),
      'Stale overwrite','disposable-relationship','disposable-support',
      'entered','50000000-0000-4000-8000-000000000004',1,
      'pr5-supply-source-stale','2026-07-25T20:01:30Z'
    );
    raise exception 'stale supply-source overwrite was accepted';
  exception when check_violation then null;
  end;
  if (select status from public.care_supply_replacements) <> replacement_status
    or (select version from public.care_supply_replacements) <> replacement_version
    or (select count(*) from public.care_supply_replacement_events) <> event_count
  then raise exception 'expired-chain rejection mutated replacement history'; end if;
end;
$$;
select public.care_save_supply_source(
  (select id from public.care_supply_sources),
  'Disposable supply source','disposable-relationship','disposable-support',
  'entered','50000000-0000-4000-8000-000000000004',2,
  'pr5-supply-source-renew','2026-07-25T20:01:40Z'
);
select public.care_save_supply_source(
  (select id from public.care_supply_sources),
  'Disposable supply source','disposable-relationship','disposable-support',
  'verified','50000000-0000-4000-8000-000000000004',3,
  'pr5-supply-source-reverify','2026-07-25T20:01:50Z'
);
select public.care_apply_supply_replacement_action(
  (select id from public.care_supply_replacements),
  '50000000-0000-4000-8000-000000000005',0,'approve',
  'pr5-replacement-approve','2026-07-25T20:02:00Z'
);
select public.care_apply_supply_replacement_action(
  (select id from public.care_supply_replacements),
  '50000000-0000-4000-8000-000000000005',0,'approve',
  'pr5-replacement-approve','2026-07-25T20:02:01Z'
);
do $$
begin
  begin
    perform public.care_apply_supply_replacement_action(
      (select id from public.care_supply_replacements),
      '50000000-0000-4000-8000-000000000005',0,'fulfill',
      'pr5-replacement-approve','2026-07-25T20:02:02Z'
    );
    raise exception 'changed replacement replay was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.care_apply_supply_replacement_action(
      (select id from public.care_supply_replacements),
      '50000000-0000-4000-8000-000000000006',0,'approve',
      'pr5-replacement-approve','2026-07-25T20:02:02Z'
    );
    raise exception 'cross-pharmacy replacement replay was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
update public.care_role_assignments
set revoked_at=clock_timestamp()
where user_id='50000000-0000-4000-8000-000000000005'
  and role='pharmacy_operations' and revoked_at is null;
do $$
begin
  begin
    perform public.care_apply_supply_replacement_action(
      (select id from public.care_supply_replacements),
      '50000000-0000-4000-8000-000000000005',0,'approve',
      'pr5-replacement-approve','2026-07-25T20:02:04Z'
    );
    raise exception 'revoked operator replay was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
insert into public.care_role_assignments (user_id,role,granted_by)
values ('50000000-0000-4000-8000-000000000005','pharmacy_operations',
  '50000000-0000-4000-8000-000000000004');
select public.care_apply_supply_replacement_action(
  (select id from public.care_supply_replacements),
  '50000000-0000-4000-8000-000000000005',1,'fulfill',
  'pr5-replacement-fulfill','2026-07-25T20:03:00Z'
);

select public.care_create_instruction_source(
  null,null,'general_education','disposable-education-reference-v2',
  'sha256:disposable-education-v2','Disposable general education revision',
  '50000000-0000-4000-8000-000000000004','pr5-education-source-v2',
  '2026-07-25T20:03:02Z'
);
do $$
begin
  if not public.care_instruction_sources_current(
    (select id from public.care_patient_instructions where status='released'),
    '51000000-0000-4000-8000-000000000001',
    '5d000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'unrelated source supersession contaminated instruction chain';
  end if;
end;
$$;

select public.care_create_instruction_source(
  '51000000-0000-4000-8000-000000000001',
  '5d000000-0000-4000-8000-000000000001',
  'pharmacy_label','disposable-label-reference-v2','sha256:disposable-label-v2',
  'Disposable pharmacy label revision','50000000-0000-4000-8000-000000000005',
  'pr5-label-source-v2','2026-07-25T20:03:04Z'
);
do $$
declare
  replacement_status text;
  replacement_version integer;
  replacement_event_count bigint;
  replacement_count bigint;
  acknowledgment_count bigint;
begin
  if public.care_instruction_sources_current(
    (select id from public.care_patient_instructions where status='released'),
    '51000000-0000-4000-8000-000000000001',
    '5d000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'superseded linked source left instruction current';
  end if;
  select status,version into replacement_status,replacement_version
  from public.care_supply_replacements;
  select count(*) into replacement_event_count
  from public.care_supply_replacement_events;
  select count(*) into replacement_count from public.care_supply_replacements;
  select count(*) into acknowledgment_count
  from public.care_instruction_acknowledgments;
  begin
    perform public.care_request_supply_replacement(
      (select id from public.care_supply_kits where status='released'),
      '51000000-0000-4000-8000-000000000001',
      'pr5-stale-source-request','2026-07-25T20:03:05Z'
    );
    raise exception 'superseded linked source allowed replacement request';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.care_apply_supply_replacement_action(
      (select id from public.care_supply_replacements),
      '50000000-0000-4000-8000-000000000005',1,'fulfill',
      'pr5-replacement-fulfill','2026-07-25T20:03:06Z'
    );
    raise exception 'superseded linked source allowed replacement replay';
  exception when check_violation then null;
  end;
  begin
    perform public.care_acknowledge_patient_instruction(
      (select id from public.care_patient_instructions where status='released'),
      '51000000-0000-4000-8000-000000000001',1,
      'pr5-instruction-ack','2026-07-25T20:03:07Z'
    );
    raise exception 'superseded linked source allowed acknowledgment replay';
  exception when check_violation then null;
  end;
  if (select status from public.care_supply_replacements) <> replacement_status
    or (select version from public.care_supply_replacements) <> replacement_version
    or (select count(*) from public.care_supply_replacement_events)
      <> replacement_event_count
    or (select count(*) from public.care_supply_replacements) <> replacement_count
    or (select count(*) from public.care_instruction_acknowledgments)
      <> acknowledgment_count
  then raise exception 'superseded source rejection mutated history'; end if;
end;
$$;

select public.care_create_patient_instruction_draft(
  '51000000-0000-4000-8000-000000000001',
  '5d000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000003',
  'Disposable replacement instruction content',
  (select id from public.care_instruction_sources
    where source_reference='disposable-label-reference-v2'),
  (select id from public.care_instruction_sources where kind='pharmacy_information'),
  (select id from public.care_instruction_sources where kind='clinician_direction'),
  (select id from public.care_instruction_sources where kind='manufacturer_material'),
  (select id from public.care_patient_instructions where status='released'),
  'pr5-second-instruction','2026-07-25T20:03:10Z'
);
select public.care_release_patient_instruction(
  (select id from public.care_patient_instructions where status='draft'),
  '50000000-0000-4000-8000-000000000003',0,
  'pr5-second-release','2026-07-25T20:03:20Z'
);
select public.care_create_supply_kit(
  '51000000-0000-4000-8000-000000000001',
  '5d000000-0000-4000-8000-000000000001',
  (select id from public.care_patient_instructions where status='released'),
  (select id from public.care_supply_sources),
  'Disposable replacement product-specific device',
  'Disposable replacement verified cadence',
  '50000000-0000-4000-8000-000000000004',
  (select id from public.care_supply_kits where status='released'),
  'pr5-second-supply-kit','2026-07-25T20:03:22Z'
);
select public.care_release_supply_kit(
  (select id from public.care_supply_kits where status='verified'),
  '50000000-0000-4000-8000-000000000004',0,
  'pr5-second-supply-release','2026-07-25T20:03:24Z'
);
do $$
begin
  if not public.care_instruction_sources_current(
    (select id from public.care_patient_instructions where status='released'),
    '51000000-0000-4000-8000-000000000001',
    '5d000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'replacement instruction did not become current';
  end if;
  if not public.care_supply_kit_replacement_context_current(
    (select id from public.care_supply_kits where status='released'),
    '51000000-0000-4000-8000-000000000001',
    null,
    '2026-07-25T20:03:25Z'
  ) then
    raise exception 'replacement kit linked to canonical sources was blocked';
  end if;
end;
$$;
do $$
begin
  begin
    perform public.care_acknowledge_patient_instruction(
      (select id from public.care_patient_instructions where status='released'),
      '51000000-0000-4000-8000-000000000001',1,
      'pr5-instruction-ack','2026-07-25T20:03:30Z'
    );
    raise exception 'unrelated instruction acknowledgment replay was accepted';
  exception when check_violation then null;
  end;
end;
$$;

do $$
declare
  replacement_status text;
  replacement_version integer;
  event_count bigint;
begin
  select status,version into replacement_status,replacement_version
  from public.care_supply_replacements;
  select count(*) into event_count from public.care_supply_replacement_events;
  begin
    insert into public.care_consent_events
      (id,patient_id,document_id,kind,document_version,action,idempotency_key,occurred_at)
    values ('55000000-0000-4000-8000-000000000003',
      '51000000-0000-4000-8000-000000000001',
      '54000000-0000-4000-8000-000000000001','telehealth','pr5-v1',
      'revoked','pr5-consent-revoke','2026-07-25T20:03:40Z');
    begin
      perform public.care_apply_supply_replacement_action(
        (select id from public.care_supply_replacements),
        '50000000-0000-4000-8000-000000000005',1,'fulfill',
        'pr5-replacement-fulfill','2026-07-25T20:03:50Z'
      );
      raise exception 'revoked-consent replacement replay was accepted';
    exception when check_violation then null;
    end;
    if (select status from public.care_supply_replacements) <> replacement_status
      or (select version from public.care_supply_replacements) <> replacement_version
      or (select count(*) from public.care_supply_replacement_events) <> event_count
    then raise exception 'revoked-consent replay mutated replacement history'; end if;
    raise exception 'rollback_revocation_probe' using errcode='ZX001';
  exception when sqlstate 'ZX001' then null;
  end;

  begin
    update public.care_consent_documents
    set status='superseded',superseded_at='2026-07-25T20:04:00Z'
    where id='54000000-0000-4000-8000-000000000002';
    begin
      perform public.care_apply_supply_replacement_action(
        (select id from public.care_supply_replacements),
        '50000000-0000-4000-8000-000000000005',1,'fulfill',
        'pr5-replacement-fulfill','2026-07-25T20:04:10Z'
      );
      raise exception 'superseded-consent replacement replay was accepted';
    exception when check_violation then null;
    end;
    if (select status from public.care_supply_replacements) <> replacement_status
      or (select version from public.care_supply_replacements) <> replacement_version
      or (select count(*) from public.care_supply_replacement_events) <> event_count
    then raise exception 'superseded-consent replay mutated replacement history'; end if;
    raise exception 'rollback_supersession_probe' using errcode='ZX002';
  exception when sqlstate 'ZX002' then null;
  end;
end;
$$;

do $$
begin
  begin
    update public.care_instruction_sources set content='mutated';
    raise exception 'instruction source history update was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.care_instruction_events;
    raise exception 'instruction event history delete was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.care_instruction_acknowledgments set instruction_version=99;
    raise exception 'instruction acknowledgment history update was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.care_supply_kit_events;
    raise exception 'supply event history delete was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.care_supply_configuration_audit
      set action='delete';
    raise exception 'supply configuration audit update was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.care_supply_source_events set verification_state='rejected';
    raise exception 'supply-source idempotency history update was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.care_supply_source_events;
    raise exception 'supply-source idempotency history delete was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.care_supply_configuration_audit;
    raise exception 'supply configuration audit delete was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.care_supply_replacement_events set action='cancelled';
    raise exception 'replacement event history update was accepted';
  exception when sqlstate '55000' then null;
  end;
  if (select count(*) from public.care_patient_instructions) <> 2
    or (select count(*) from public.care_instruction_acknowledgments) <> 1
    or (select count(*) from public.care_supply_kits) <> 2
    or (select count(*) from public.care_supply_replacements) <> 1
    or (select count(*) from public.care_supply_source_events) <> 4
  then raise exception 'PR5 idempotency proof failed'; end if;
  if (select status <> 'fulfilled' from public.care_supply_replacements)
  then raise exception 'replacement lifecycle proof failed'; end if;
  if (select state <> 'disabled' from public.care_capabilities where capability_key='care')
  then raise exception 'Care capability was enabled'; end if;
  if (
    select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in (
      'care_instruction_sources','care_patient_instructions',
      'care_instruction_source_links','care_instruction_events',
      'care_instruction_acknowledgments','care_supply_sources',
      'care_supply_source_events','care_supply_configuration_audit',
      'care_supply_kits',
      'care_supply_kit_events','care_supply_replacements',
      'care_supply_replacement_events'
    ) and c.relrowsecurity and c.relforcerowsecurity
  ) <> 12 then raise exception 'PR5 forced RLS proof failed'; end if;
end;
$$;

rollback;

do $$
begin
  if exists (select 1 from public.care_instruction_sources)
    or exists (select 1 from public.care_patient_instructions)
    or exists (select 1 from public.care_supply_sources)
    or exists (select 1 from public.care_supply_source_events)
    or exists (select 1 from public.care_supply_kits)
    or exists (select 1 from public.care_supply_replacements)
  then raise exception 'PR5 disposable rows survived rollback'; end if;
end;
$$;
