-- Disposable proof for Xenios Care PR 4. Run after Care PR 1-4 migrations.
-- No fixture survives this transaction.
begin;

do $$
begin
  if exists (select 1 from public.care_pharmacies)
    or exists (select 1 from public.care_prescriptions)
    or exists (select 1 from public.care_pharmacy_orders)
  then raise exception 'PR4 migration seeded pharmacy or prescription facts'; end if;
end;
$$;

insert into auth.users (id) values
  ('40000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000003'),
  ('40000000-0000-4000-8000-000000000004'),
  ('40000000-0000-4000-8000-000000000005')
on conflict (id) do nothing;

insert into public.care_role_assignments (user_id, role, granted_by) values
  ('40000000-0000-4000-8000-000000000001','care_patient','40000000-0000-4000-8000-000000000004'),
  ('40000000-0000-4000-8000-000000000002','care_patient','40000000-0000-4000-8000-000000000004'),
  ('40000000-0000-4000-8000-000000000003','clinician','40000000-0000-4000-8000-000000000004'),
  ('40000000-0000-4000-8000-000000000004','clinical_admin','40000000-0000-4000-8000-000000000004'),
  ('40000000-0000-4000-8000-000000000005','pharmacy_operations','40000000-0000-4000-8000-000000000004');

insert into public.care_patients (id,user_id,identity_state,identity_verified_at) values
  ('41000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','verified','2026-07-25T18:00:00Z'),
  ('41000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','verified','2026-07-25T18:00:00Z');
insert into public.care_patient_locations
  (id,patient_id,state_code,source,attested_at,idempotency_key) values
  ('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','IL','patient_attestation','2026-07-25T18:01:00Z','pr4-location-1'),
  ('42000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000002','IL','patient_attestation','2026-07-25T18:01:00Z','pr4-location-2');
insert into public.care_supported_states
  (state_code,supported_state_active,service_coverage_active,waitlist_enabled,approved_by,approved_at)
values ('IL',true,true,false,'40000000-0000-4000-8000-000000000004','2026-07-25T18:02:00Z');
insert into public.care_clinician_state_coverage
  (id,clinician_user_id,state_code,active,verified_by,verified_at,expires_at)
values ('43000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','IL',true,
  '40000000-0000-4000-8000-000000000004','2026-07-25T18:03:00Z','2027-07-25T18:03:00Z');

insert into public.care_consent_documents
  (id,kind,version,content_hash,status,approved_by,approved_at,effective_at) values
  ('44000000-0000-4000-8000-000000000001','telehealth','pr4-v1','sha256:pr4-t','approved','40000000-0000-4000-8000-000000000004','2026-07-25T18:04:00Z','2026-07-25T18:04:00Z'),
  ('44000000-0000-4000-8000-000000000002','privacy_notice','pr4-v1','sha256:pr4-p','approved','40000000-0000-4000-8000-000000000004','2026-07-25T18:04:00Z','2026-07-25T18:04:00Z');
insert into public.care_consent_events
  (id,patient_id,document_id,kind,document_version,action,idempotency_key,occurred_at) values
  ('45000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000001','telehealth','pr4-v1','granted','pr4-consent-t','2026-07-25T18:05:00Z'),
  ('45000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000001','44000000-0000-4000-8000-000000000002','privacy_notice','pr4-v1','granted','pr4-consent-p','2026-07-25T18:05:00Z');
insert into public.care_intake_definitions
  (id,version,status,schema_hash,fields,approved_by,approved_at)
values ('46000000-0000-4000-8000-000000000001','pr4-v1','approved','sha256:pr4-i','[]',
  '40000000-0000-4000-8000-000000000004','2026-07-25T18:06:00Z');
insert into public.care_intakes
  (id,patient_id,definition_id,definition_version,telehealth_consent_event_id,privacy_consent_event_id,
   status,version,start_idempotency_key,submit_idempotency_key,created_at,submitted_at)
values ('47000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',
  '46000000-0000-4000-8000-000000000001','pr4-v1',
  '45000000-0000-4000-8000-000000000001','45000000-0000-4000-8000-000000000002',
  'submitted',1,'pr4-intake-start','pr4-intake-submit','2026-07-25T18:07:00Z','2026-07-25T18:08:00Z');

insert into public.care_medical_groups
  (id,legal_name,business_address,authorized_representative,agreement_reference,agreement_effective_at,
   clinical_governance_owner,privacy_relationship_approved,incident_process_reference,
   support_escalation_reference,verification_state,verified_by,verified_at)
values ('48000000-0000-4000-8000-000000000001','Disposable medical group','Disposable address',
  'Disposable representative','disposable-agreement','2026-07-25T18:09:00Z','Disposable governance',
  true,'disposable-incident','disposable-support','verified',
  '40000000-0000-4000-8000-000000000004','2026-07-25T18:09:00Z');
insert into public.care_clinician_profiles
  (clinician_user_id,medical_group_id,legal_name,professional_title,specialty,agreement_reference,
   privacy_access_approved,clinical_role_approved,verification_state,verified_by,verified_at)
values ('40000000-0000-4000-8000-000000000003','48000000-0000-4000-8000-000000000001',
  'Disposable clinician','Clinician','Disposable specialty','disposable-clinician-agreement',
  true,true,'verified','40000000-0000-4000-8000-000000000004','2026-07-25T18:10:00Z');
insert into public.care_clinician_licenses
  (id,clinician_user_id,license_number,state_code,expires_at,evidence_reference,
   verification_state,verified_by,verified_at)
values ('49000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003',
  'DISPOSABLE-ONLY','IL','2027-07-25T18:10:00Z','disposable-evidence','verified',
  '40000000-0000-4000-8000-000000000004','2026-07-25T18:10:00Z');

insert into public.care_appointments
  (id,patient_id,intake_id,patient_location_id,patient_state_code,assigned_clinician_user_id,
   clinician_coverage_id,status,starts_at,ends_at,version,request_idempotency_key,created_at,updated_at)
values ('4a000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',
  '47000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','IL',
  '40000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-000000000001',
  'completed','2026-07-25T19:00:00Z','2026-07-25T19:30:00Z',1,'pr4-appointment',
  '2026-07-25T18:30:00Z','2026-07-25T19:30:00Z');
insert into public.care_clinician_reviews
  (id,appointment_id,patient_id,assigned_clinician_user_id,patient_state_code,status,
   final_decision,final_decision_source,version,created_at,updated_at)
values ('4b000000-0000-4000-8000-000000000001','4a000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','IL',
  'decided','approved','human_clinician',1,'2026-07-25T19:30:00Z','2026-07-25T19:35:00Z');

insert into public.care_pharmacies
  (id,legal_name,legal_address,agreement_reference,integration_reference,support_contact_reference,
   verification_state,verified_by,verified_at)
values ('4c000000-0000-4000-8000-000000000001','Disposable pharmacy','Disposable address',
  'disposable-agreement','disposable-integration','disposable-support','verified',
  '40000000-0000-4000-8000-000000000004','2026-07-25T19:40:00Z');
insert into public.care_pharmacy_licenses
  (id,pharmacy_id,state_code,license_number,expires_at,evidence_reference,
   verification_state,verified_by,verified_at)
values ('4d000000-0000-4000-8000-000000000001','4c000000-0000-4000-8000-000000000001',
  'IL','DISPOSABLE-ONLY','2027-07-25T19:40:00Z','disposable-evidence','verified',
  '40000000-0000-4000-8000-000000000004','2026-07-25T19:40:00Z');
insert into public.care_pharmacy_state_coverage
  (id,pharmacy_id,state_code,dispensing_scope_reference,shipping_coverage_reference,
   instruction_source_reference,supply_source_reference,active,verified_by,verified_at,expires_at)
values ('4e000000-0000-4000-8000-000000000001','4c000000-0000-4000-8000-000000000001',
  'IL','disposable-dispensing','disposable-shipping','disposable-instruction','disposable-supply',
  true,'40000000-0000-4000-8000-000000000004','2026-07-25T19:40:00Z','2027-07-25T19:40:00Z');
insert into public.care_pharmacy_operators
  (id,pharmacy_id,user_id,active,verified_by,verified_at)
values ('4f000000-0000-4000-8000-000000000001','4c000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000005',true,
  '40000000-0000-4000-8000-000000000004','2026-07-25T19:40:00Z');

do $$
begin
  begin
    perform public.care_create_prescription_draft(
      '41000000-0000-4000-8000-000000000002',
      '4b000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000003',
      'Disposable formulation','Disposable concentration','Disposable route',
      'Disposable quantity','Disposable directions',0,null,
      'pr4-cross-patient','2026-07-25T19:45:00Z'
    );
    raise exception 'cross-patient prescription draft was accepted';
  exception when check_violation then null;
  end;
end;
$$;

select public.care_create_prescription_draft(
  '41000000-0000-4000-8000-000000000001',
  '4b000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000003',
  'Disposable formulation','Disposable concentration','Disposable route',
  'Disposable quantity','Disposable patient-specific directions',0,null,
  'pr4-draft','2026-07-25T19:45:00Z'
);
select public.care_create_prescription_draft(
  '41000000-0000-4000-8000-000000000001',
  '4b000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000003',
  'Ignored replay','Ignored replay','Ignored replay','Ignored replay','Ignored replay',9,null,
  'pr4-draft','2026-07-25T19:46:00Z'
);

select public.care_sign_prescription(
  (select id from public.care_prescriptions where create_idempotency_key='pr4-draft'),
  '40000000-0000-4000-8000-000000000003',0,'pr4-sign','2026-07-25T19:50:00Z'
);
select public.care_sign_prescription(
  (select id from public.care_prescriptions where create_idempotency_key='pr4-draft'),
  '40000000-0000-4000-8000-000000000003',0,'pr4-sign','2026-07-25T19:51:00Z'
);

select public.care_assign_pharmacy_order(
  (select id from public.care_prescriptions where create_idempotency_key='pr4-draft'),
  '4c000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000004',
  'pr4-assign','2026-07-25T19:55:00Z'
);

select public.care_apply_pharmacy_order_action(
  (select id from public.care_pharmacy_orders),
  '40000000-0000-4000-8000-000000000005',0,'receive',null,null,
  'pr4-receive','2026-07-25T20:00:00Z'
);
select public.care_apply_pharmacy_order_action(
  (select id from public.care_pharmacy_orders),
  '40000000-0000-4000-8000-000000000005',1,'request_clarification',
  'disposable-private-clarification-reference',null,
  'pr4-clarification','2026-07-25T20:01:00Z'
);

do $$
declare order_id uuid := (select id from public.care_pharmacy_orders);
begin
  begin
    perform public.care_apply_pharmacy_order_action(
      order_id,'40000000-0000-4000-8000-000000000005',2,'dispense',null,null,
      'pr4-blocked-dispense','2026-07-25T20:02:00Z'
    );
    raise exception 'dispense with open clarification was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.care_prescription_content_sources set directions='mutated';
    raise exception 'content history update was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.care_prescription_events;
    raise exception 'prescription event delete was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.care_pharmacy_order_events set action='mutated';
    raise exception 'pharmacy event update was accepted';
  exception when sqlstate '55000' then null;
  end;
  if (select count(*) from public.care_prescriptions) <> 1
    or (select count(*) from public.care_prescription_content_sources) <> 1
    or (select count(*) from public.care_pharmacy_orders) <> 1
  then raise exception 'idempotency proof failed'; end if;
  if (select state <> 'disabled' from public.care_capabilities where capability_key='care')
  then raise exception 'Care capability was enabled'; end if;
  if (
    select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in (
      'care_pharmacies','care_pharmacy_licenses','care_pharmacy_state_coverage',
      'care_pharmacy_operators','care_pharmacy_configuration_audit',
      'care_prescription_content_sources','care_prescriptions',
      'care_prescription_events','care_pharmacy_orders','care_pharmacy_order_events'
    ) and c.relrowsecurity and c.relforcerowsecurity
  ) <> 10 then raise exception 'forced RLS proof failed'; end if;
end;
$$;

rollback;

do $$
begin
  if exists (select 1 from public.care_pharmacies)
    or exists (select 1 from public.care_prescriptions)
    or exists (select 1 from public.care_pharmacy_orders)
  then raise exception 'PR4 disposable rows survived rollback'; end if;
end;
$$;
