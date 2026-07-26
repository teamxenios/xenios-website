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
  ('50000000-0000-4000-8000-000000000005')  -- pharmacy operator
on conflict (id) do nothing;

insert into public.care_role_assignments (user_id,role,granted_by) values
  ('50000000-0000-4000-8000-000000000001','care_patient','50000000-0000-4000-8000-000000000004'),
  ('50000000-0000-4000-8000-000000000002','care_patient','50000000-0000-4000-8000-000000000004'),
  ('50000000-0000-4000-8000-000000000003','clinician','50000000-0000-4000-8000-000000000004'),
  ('50000000-0000-4000-8000-000000000004','clinical_admin','50000000-0000-4000-8000-000000000004'),
  ('50000000-0000-4000-8000-000000000005','pharmacy_operations','50000000-0000-4000-8000-000000000004');

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
  '50000000-0000-4000-8000-000000000004','2026-07-25T19:42:00Z');
insert into public.care_pharmacy_operators
  (id,pharmacy_id,user_id,active,verified_by,verified_at)
values ('5f000000-0000-4000-8000-000000000001','5e000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000005',true,
  '50000000-0000-4000-8000-000000000004','2026-07-25T19:42:00Z');
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
select public.care_create_patient_instruction_draft(
  '51000000-0000-4000-8000-000000000001',
  '5d000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000003',
  'Ignored replay',
  (select id from public.care_instruction_sources where kind='pharmacy_label'),
  (select id from public.care_instruction_sources where kind='pharmacy_information'),
  (select id from public.care_instruction_sources where kind='clinician_direction'),
  (select id from public.care_instruction_sources where kind='manufacturer_material'),
  null,'pr5-instruction-draft','2026-07-25T19:52:00Z'
);
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
      '50000000-0000-4000-8000-000000000003','2026-07-25T19:55:00Z'
    );
    raise exception 'non-admin supply-source verification was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select public.care_save_supply_source(
  null,'Disposable supply source','disposable-relationship',
  'disposable-support','verified',
  '50000000-0000-4000-8000-000000000004','2026-07-25T19:56:00Z'
);

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
select public.care_apply_supply_replacement_action(
  (select id from public.care_supply_replacements),
  '50000000-0000-4000-8000-000000000005',0,'approve',
  'pr5-replacement-approve','2026-07-25T20:02:00Z'
);
select public.care_apply_supply_replacement_action(
  (select id from public.care_supply_replacements),
  '50000000-0000-4000-8000-000000000005',1,'fulfill',
  'pr5-replacement-fulfill','2026-07-25T20:03:00Z'
);

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
    delete from public.care_supply_configuration_audit;
    raise exception 'supply configuration audit delete was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.care_supply_replacement_events set action='cancelled';
    raise exception 'replacement event history update was accepted';
  exception when sqlstate '55000' then null;
  end;
  if (select count(*) from public.care_patient_instructions) <> 1
    or (select count(*) from public.care_instruction_acknowledgments) <> 1
    or (select count(*) from public.care_supply_kits) <> 1
    or (select count(*) from public.care_supply_replacements) <> 1
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
      'care_supply_configuration_audit','care_supply_kits',
      'care_supply_kit_events','care_supply_replacements',
      'care_supply_replacement_events'
    ) and c.relrowsecurity and c.relforcerowsecurity
  ) <> 11 then raise exception 'PR5 forced RLS proof failed'; end if;
end;
$$;

rollback;

do $$
begin
  if exists (select 1 from public.care_instruction_sources)
    or exists (select 1 from public.care_patient_instructions)
    or exists (select 1 from public.care_supply_sources)
    or exists (select 1 from public.care_supply_kits)
    or exists (select 1 from public.care_supply_replacements)
  then raise exception 'PR5 disposable rows survived rollback'; end if;
end;
$$;
