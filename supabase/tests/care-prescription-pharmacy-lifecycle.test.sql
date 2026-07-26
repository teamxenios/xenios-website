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
  ('40000000-0000-4000-8000-000000000005'),
  ('40000000-0000-4000-8000-000000000006'),
  ('40000000-0000-4000-8000-000000000007')
on conflict (id) do nothing;

insert into public.care_role_assignments (user_id, role, granted_by) values
  ('40000000-0000-4000-8000-000000000001','care_patient','40000000-0000-4000-8000-000000000004'),
  ('40000000-0000-4000-8000-000000000002','care_patient','40000000-0000-4000-8000-000000000004'),
  ('40000000-0000-4000-8000-000000000003','clinician','40000000-0000-4000-8000-000000000004'),
  ('40000000-0000-4000-8000-000000000004','clinical_admin','40000000-0000-4000-8000-000000000004'),
  ('40000000-0000-4000-8000-000000000005','pharmacy_operations','40000000-0000-4000-8000-000000000004'),
  ('40000000-0000-4000-8000-000000000006','clinician','40000000-0000-4000-8000-000000000004'),
  ('40000000-0000-4000-8000-000000000007','pharmacy_operations','40000000-0000-4000-8000-000000000004');

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
insert into public.care_pharmacies
  (id,legal_name,legal_address,agreement_reference,integration_reference,support_contact_reference,
   verification_state,verified_by,verified_at)
values ('4c000000-0000-4000-8000-000000000002','Second disposable pharmacy','Disposable address',
  'disposable-agreement-two','disposable-integration-two','disposable-support-two','verified',
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
declare
  exact_facts jsonb;
  disjoint_facts jsonb;
  expired_facts jsonb;
begin
  exact_facts := public.care_prescription_readiness(
    '40000000-0000-4000-8000-000000000003',
    '4c000000-0000-4000-8000-000000000001',
    'IL',null,'2026-07-25T19:41:00Z'
  );
  if not (exact_facts->>'medical_group_verified')::boolean
    or not (exact_facts->>'clinician_coverage_verified')::boolean
    or not (exact_facts->>'pharmacy_partner_verified')::boolean
    or not (exact_facts->>'pharmacy_license_verified')::boolean
    or not (exact_facts->>'pharmacy_state_coverage_verified')::boolean
    or (exact_facts->>'patient_specific_content_verified')::boolean
  then raise exception 'exact readiness facts were not scoped correctly'; end if;

  disjoint_facts := public.care_prescription_readiness(
    '40000000-0000-4000-8000-000000000006',
    '4c000000-0000-4000-8000-000000000002',
    'IL',null,'2026-07-25T19:41:00Z'
  );
  if (disjoint_facts->>'medical_group_verified')::boolean
    or (disjoint_facts->>'clinician_coverage_verified')::boolean
    or (disjoint_facts->>'pharmacy_license_verified')::boolean
    or (disjoint_facts->>'pharmacy_state_coverage_verified')::boolean
  then raise exception 'disjoint readiness facts were combined'; end if;

  expired_facts := public.care_prescription_readiness(
    '40000000-0000-4000-8000-000000000003',
    '4c000000-0000-4000-8000-000000000001',
    'IL',null,'2028-07-25T19:41:00Z'
  );
  if (expired_facts->>'clinician_coverage_verified')::boolean
    or (expired_facts->>'pharmacy_license_verified')::boolean
    or (expired_facts->>'pharmacy_state_coverage_verified')::boolean
  then raise exception 'expired readiness facts remained operational'; end if;
end;
$$;

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
  'Disposable formulation','Disposable concentration','Disposable route',
  'Disposable quantity','Disposable patient-specific directions',0,null,
  'pr4-draft','2026-07-25T19:46:00Z'
);

do $$
begin
  begin
    perform public.care_create_prescription_draft(
      '41000000-0000-4000-8000-000000000001',
      '4b000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000003',
      'Mismatched replay','Disposable concentration','Disposable route',
      'Disposable quantity','Disposable patient-specific directions',0,null,
      'pr4-draft','2026-07-25T19:47:00Z'
    );
    raise exception 'mismatched draft replay was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.care_create_prescription_draft(
      '41000000-0000-4000-8000-000000000001',
      '4b000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000006',
      'Disposable formulation','Disposable concentration','Disposable route',
      'Disposable quantity','Disposable patient-specific directions',0,null,
      'pr4-draft','2026-07-25T19:47:00Z'
    );
    raise exception 'cross-clinician draft replay was accepted';
  exception when check_violation then null;
  end;
end;
$$;

select public.care_sign_prescription(
  (select id from public.care_prescriptions where create_idempotency_key='pr4-draft'),
  '40000000-0000-4000-8000-000000000003',0,'pr4-sign','2026-07-25T19:50:00Z'
);
select public.care_sign_prescription(
  (select id from public.care_prescriptions where create_idempotency_key='pr4-draft'),
  '40000000-0000-4000-8000-000000000003',0,'pr4-sign','2026-07-25T19:51:00Z'
);

do $$
declare prescription_id uuid := (
  select id from public.care_prescriptions where create_idempotency_key='pr4-draft'
);
begin
  begin
    perform public.care_sign_prescription(
      prescription_id,'40000000-0000-4000-8000-000000000003',1,
      'pr4-sign','2026-07-25T19:52:00Z'
    );
    raise exception 'mismatched sign replay was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.care_sign_prescription(
      prescription_id,'40000000-0000-4000-8000-000000000006',0,
      'pr4-sign','2026-07-25T19:52:00Z'
    );
    raise exception 'cross-clinician sign replay was accepted';
  exception when check_violation then null;
  end;
end;
$$;

do $$
declare facts jsonb;
begin
  facts := public.care_prescription_readiness(
    '40000000-0000-4000-8000-000000000003',
    '4c000000-0000-4000-8000-000000000001',
    'IL',
    (select id from public.care_prescriptions where create_idempotency_key='pr4-draft'),
    '2026-07-25T19:53:00Z'
  );
  if exists (
    select 1
    from jsonb_each_text(facts) fact
    where fact.value <> 'true'
  ) then raise exception 'one exact complete workflow did not clear readiness facts'; end if;
end;
$$;

select public.care_assign_pharmacy_order(
  (select id from public.care_prescriptions where create_idempotency_key='pr4-draft'),
  '4c000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000004',
  'pr4-assign','2026-07-25T19:55:00Z'
);
select public.care_assign_pharmacy_order(
  (select id from public.care_prescriptions where create_idempotency_key='pr4-draft'),
  '4c000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000004',
  'pr4-assign','2026-07-25T19:56:00Z'
);

do $$
declare prescription_id uuid := (
  select id from public.care_prescriptions where create_idempotency_key='pr4-draft'
);
begin
  begin
    perform public.care_assign_pharmacy_order(
      prescription_id,'4c000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'pr4-assign','2026-07-25T19:57:00Z'
    );
    raise exception 'non-admin assignment replay was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.care_assign_pharmacy_order(
      prescription_id,'4c000000-0000-4000-8000-000000000099',
      '40000000-0000-4000-8000-000000000004',
      'pr4-assign','2026-07-25T19:57:00Z'
    );
    raise exception 'cross-pharmacy assignment replay was accepted';
  exception when check_violation then null;
  end;
end;
$$;

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
select public.care_apply_pharmacy_order_action(
  (select id from public.care_pharmacy_orders),
  '40000000-0000-4000-8000-000000000005',0,'receive',null,null,
  'pr4-receive','2026-07-25T20:01:30Z'
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
    perform public.care_apply_pharmacy_order_action(
      order_id,'40000000-0000-4000-8000-000000000005',2,'receive',null,null,
      'pr4-operator-self-clear','2026-07-25T20:02:00Z'
    );
    raise exception 'operator self-cleared clarification by receipt';
  exception when check_violation then null;
  end;
  begin
    perform public.care_apply_pharmacy_order_action(
      order_id,'40000000-0000-4000-8000-000000000005',2,'accept',null,null,
      'pr4-operator-accept-open','2026-07-25T20:02:00Z'
    );
    raise exception 'operator accepted an open clarification';
  exception when check_violation then null;
  end;
  begin
    perform public.care_apply_pharmacy_order_action(
      order_id,'40000000-0000-4000-8000-000000000007',0,'receive',null,null,
      'pr4-receive','2026-07-25T20:02:00Z'
    );
    raise exception 'cross-operator replay was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.care_apply_pharmacy_order_action(
      order_id,'40000000-0000-4000-8000-000000000005',0,'accept',null,null,
      'pr4-receive','2026-07-25T20:02:00Z'
    );
    raise exception 'mismatched action replay was accepted';
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

do $$
declare order_id uuid := (select id from public.care_pharmacy_orders);
begin
  begin
    perform public.care_resolve_pharmacy_clarification(
      order_id,'40000000-0000-4000-8000-000000000001',2,
      'private-patient-response','pr4-patient-resolve','2026-07-25T20:03:00Z'
    );
    raise exception 'patient clarification resolution was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.care_resolve_pharmacy_clarification(
      order_id,'40000000-0000-4000-8000-000000000006',2,
      'private-other-clinician-response','pr4-other-resolve','2026-07-25T20:03:00Z'
    );
    raise exception 'other clinician clarification resolution was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select public.care_resolve_pharmacy_clarification(
  (select id from public.care_pharmacy_orders),
  '40000000-0000-4000-8000-000000000003',2,
  'private-assigned-clinician-response','pr4-clinician-resolve',
  '2026-07-25T20:04:00Z'
);
select public.care_resolve_pharmacy_clarification(
  (select id from public.care_pharmacy_orders),
  '40000000-0000-4000-8000-000000000003',2,
  'private-assigned-clinician-response','pr4-clinician-resolve',
  '2026-07-25T20:04:30Z'
);

do $$
begin
  begin
    perform public.care_resolve_pharmacy_clarification(
      (select id from public.care_pharmacy_orders),
      '40000000-0000-4000-8000-000000000003',2,
      'mismatched-response','pr4-clinician-resolve','2026-07-25T20:04:30Z'
    );
    raise exception 'mismatched clarification replay was accepted';
  exception when check_violation then null;
  end;
end;
$$;

select public.care_apply_pharmacy_order_action(
  (select id from public.care_pharmacy_orders),
  '40000000-0000-4000-8000-000000000005',3,'accept',null,null,
  'pr4-accept-one','2026-07-25T20:05:00Z'
);
select public.care_apply_pharmacy_order_action(
  (select id from public.care_pharmacy_orders),
  '40000000-0000-4000-8000-000000000005',4,'request_clarification',
  'second-private-question',null,'pr4-clarification-two','2026-07-25T20:06:00Z'
);
select public.care_resolve_pharmacy_clarification(
  (select id from public.care_pharmacy_orders),
  '40000000-0000-4000-8000-000000000004',5,
  'private-admin-response','pr4-admin-resolve','2026-07-25T20:07:00Z'
);
select public.care_apply_pharmacy_order_action(
  (select id from public.care_pharmacy_orders),
  '40000000-0000-4000-8000-000000000005',6,'accept',null,null,
  'pr4-accept-two','2026-07-25T20:08:00Z'
);
select public.care_apply_pharmacy_order_action(
  (select id from public.care_pharmacy_orders),
  '40000000-0000-4000-8000-000000000005',7,'dispense',null,null,
  'pr4-dispense','2026-07-25T20:09:00Z'
);

create or replace function pg_temp.assert_superseded_order_action_blocked(
  p_order_id uuid,
  p_expected_version integer,
  p_action text,
  p_clarification_reference text,
  p_tracking_reference text,
  p_idempotency_key text
)
returns void
language plpgsql
as $$
begin
  begin
    perform public.care_apply_pharmacy_order_action(
      p_order_id,
      '40000000-0000-4000-8000-000000000005',
      p_expected_version,
      p_action,
      p_clarification_reference,
      p_tracking_reference,
      p_idempotency_key,
      '2026-07-25T20:10:30Z'
    );
    raise exception 'superseded prescription accepted pharmacy action %', p_action;
  exception when check_violation then
    if sqlerrm <> 'care_current_signed_prescription_required' then raise; end if;
  end;
end;
$$;

do $$
declare
  original_prescription_id uuid := (
    select id from public.care_prescriptions
    where create_idempotency_key = 'pr4-draft'
  );
  original_order_id uuid := (select id from public.care_pharmacy_orders);
  replacement_prescription_id uuid;
  successor_prescription_id uuid;
  replacement_order_id uuid;
  clarification_order_id uuid;
  clarification_event_count_before bigint;
  prescription_count_before bigint := (select count(*) from public.care_prescriptions);
  prescription_event_count_before bigint := (select count(*) from public.care_prescription_events);
  order_count_before bigint := (select count(*) from public.care_pharmacy_orders);
  order_event_count_before bigint := (select count(*) from public.care_pharmacy_order_events);
begin
  begin
    select id into replacement_prescription_id
    from public.care_create_prescription_draft(
      '41000000-0000-4000-8000-000000000001',
      '4b000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000003',
      'Replacement disposable formulation','Replacement disposable concentration',
      'Replacement disposable route','Replacement disposable quantity',
      'Replacement disposable patient-specific directions',0,
      original_prescription_id,
      'pr4-supersession-draft','2026-07-25T20:10:00Z'
    );
    perform public.care_sign_prescription(
      replacement_prescription_id,
      '40000000-0000-4000-8000-000000000003',
      0,
      'pr4-supersession-sign',
      '2026-07-25T20:10:10Z'
    );
    if (select status from public.care_prescriptions where id = original_prescription_id) <> 'superseded'
      or (select status from public.care_prescriptions where id = replacement_prescription_id) <> 'signed'
    then raise exception 'replacement signing did not establish canonical supersession'; end if;

    perform pg_temp.assert_superseded_order_action_blocked(
      original_order_id,8,'receive',null,null,'pr4-superseded-new-receive'
    );
    perform pg_temp.assert_superseded_order_action_blocked(
      original_order_id,8,'accept',null,null,'pr4-superseded-new-accept'
    );
    perform pg_temp.assert_superseded_order_action_blocked(
      original_order_id,8,'dispense',null,null,'pr4-superseded-new-dispense'
    );
    perform pg_temp.assert_superseded_order_action_blocked(
      original_order_id,8,'ship',null,'private-superseded-tracking',
      'pr4-superseded-new-ship'
    );
    perform pg_temp.assert_superseded_order_action_blocked(
      original_order_id,0,'receive',null,null,'pr4-receive'
    );
    perform pg_temp.assert_superseded_order_action_blocked(
      original_order_id,3,'accept',null,null,'pr4-accept-one'
    );
    perform pg_temp.assert_superseded_order_action_blocked(
      original_order_id,7,'dispense',null,null,'pr4-dispense'
    );

    if (select status from public.care_pharmacy_orders where id = original_order_id) <> 'dispensed'
      or (select version from public.care_pharmacy_orders where id = original_order_id) <> 8
      or (select count(*) from public.care_pharmacy_order_events) <> order_event_count_before
    then raise exception 'superseded action rejection mutated the old order'; end if;

    perform public.care_apply_pharmacy_order_action(
      original_order_id,
      '40000000-0000-4000-8000-000000000005',
      8,'cancel',null,null,
      'pr4-superseded-cancel',
      '2026-07-25T20:10:40Z'
    );
    if (select status from public.care_pharmacy_orders where id = original_order_id) <> 'cancelled'
    then raise exception 'superseded-order cancellation was unavailable'; end if;

    select id into replacement_order_id
    from public.care_assign_pharmacy_order(
      replacement_prescription_id,
      '4c000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000004',
      'pr4-replacement-assign',
      '2026-07-25T20:10:50Z'
    );
    perform public.care_apply_pharmacy_order_action(
      replacement_order_id,'40000000-0000-4000-8000-000000000005',
      0,'receive',null,null,'pr4-replacement-receive','2026-07-25T20:11:00Z'
    );
    perform public.care_apply_pharmacy_order_action(
      replacement_order_id,'40000000-0000-4000-8000-000000000005',
      0,'receive',null,null,'pr4-replacement-receive','2026-07-25T20:11:01Z'
    );
    perform public.care_apply_pharmacy_order_action(
      replacement_order_id,'40000000-0000-4000-8000-000000000005',
      1,'accept',null,null,'pr4-replacement-accept','2026-07-25T20:11:10Z'
    );
    perform public.care_apply_pharmacy_order_action(
      replacement_order_id,'40000000-0000-4000-8000-000000000005',
      2,'dispense',null,null,'pr4-replacement-dispense','2026-07-25T20:11:20Z'
    );
    perform public.care_apply_pharmacy_order_action(
      replacement_order_id,'40000000-0000-4000-8000-000000000005',
      3,'ship',null,'private-replacement-tracking',
      'pr4-replacement-ship','2026-07-25T20:11:30Z'
    );
    if (select status from public.care_pharmacy_orders where id = replacement_order_id) <> 'shipped'
    then raise exception 'current replacement prescription did not follow the valid path'; end if;

    raise exception 'rollback-superseded-order-cancellation-proof';
  exception when raise_exception then
    if sqlerrm <> 'rollback-superseded-order-cancellation-proof' then raise; end if;
  end;

  begin
    perform public.care_apply_pharmacy_order_action(
      original_order_id,'40000000-0000-4000-8000-000000000005',
      8,'ship',null,'private-pre-supersession-tracking',
      'pr4-pre-supersession-ship','2026-07-25T20:10:00Z'
    );
    select id into replacement_prescription_id
    from public.care_create_prescription_draft(
      '41000000-0000-4000-8000-000000000001',
      '4b000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000003',
      'Replacement disposable formulation','Replacement disposable concentration',
      'Replacement disposable route','Replacement disposable quantity',
      'Replacement disposable patient-specific directions',0,
      original_prescription_id,
      'pr4-shipped-supersession-draft','2026-07-25T20:10:10Z'
    );
    perform public.care_sign_prescription(
      replacement_prescription_id,
      '40000000-0000-4000-8000-000000000003',
      0,
      'pr4-shipped-supersession-sign',
      '2026-07-25T20:10:20Z'
    );
    perform pg_temp.assert_superseded_order_action_blocked(
      original_order_id,8,'ship',null,'private-pre-supersession-tracking',
      'pr4-pre-supersession-ship'
    );
    perform public.care_apply_pharmacy_order_action(
      original_order_id,'40000000-0000-4000-8000-000000000005',
      9,'deliver',null,null,
      'pr4-superseded-terminal-delivery','2026-07-25T20:10:40Z'
    );
    if (select status from public.care_pharmacy_orders where id = original_order_id) <> 'delivered'
    then raise exception 'narrow terminal delivery recording was unavailable'; end if;

    raise exception 'rollback-superseded-order-delivery-proof';
  exception when raise_exception then
    if sqlerrm <> 'rollback-superseded-order-delivery-proof' then raise; end if;
  end;

  begin
    select id into replacement_prescription_id
    from public.care_create_prescription_draft(
      '41000000-0000-4000-8000-000000000001',
      '4b000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000003',
      'Clarification replacement formulation','Clarification replacement concentration',
      'Clarification replacement route','Clarification replacement quantity',
      'Clarification replacement patient-specific directions',0,
      original_prescription_id,
      'pr4-clarification-replacement-draft','2026-07-25T20:10:00Z'
    );
    perform public.care_sign_prescription(
      replacement_prescription_id,
      '40000000-0000-4000-8000-000000000003',
      0,
      'pr4-clarification-replacement-sign',
      '2026-07-25T20:10:10Z'
    );
    select id into clarification_order_id
    from public.care_assign_pharmacy_order(
      replacement_prescription_id,
      '4c000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000004',
      'pr4-clarification-replacement-assign',
      '2026-07-25T20:10:20Z'
    );
    perform public.care_apply_pharmacy_order_action(
      clarification_order_id,'40000000-0000-4000-8000-000000000005',
      0,'receive',null,null,
      'pr4-superseded-clarification-receive','2026-07-25T20:10:30Z'
    );
    perform public.care_apply_pharmacy_order_action(
      clarification_order_id,'40000000-0000-4000-8000-000000000005',
      1,'request_clarification','private-superseded-question',null,
      'pr4-superseded-clarification-request','2026-07-25T20:10:40Z'
    );

    select id into successor_prescription_id
    from public.care_create_prescription_draft(
      '41000000-0000-4000-8000-000000000001',
      '4b000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000003',
      'Clarification successor formulation','Clarification successor concentration',
      'Clarification successor route','Clarification successor quantity',
      'Clarification successor patient-specific directions',0,
      replacement_prescription_id,
      'pr4-clarification-successor-draft','2026-07-25T20:10:50Z'
    );
    perform public.care_sign_prescription(
      successor_prescription_id,
      '40000000-0000-4000-8000-000000000003',
      0,
      'pr4-clarification-successor-sign',
      '2026-07-25T20:11:00Z'
    );
    if (select status from public.care_prescriptions where id = replacement_prescription_id) <> 'superseded'
      or (select status from public.care_pharmacy_orders where id = clarification_order_id) <> 'clarification_requested'
      or (select version from public.care_pharmacy_orders where id = clarification_order_id) <> 2
    then raise exception 'clarification supersession setup failed'; end if;
    clarification_event_count_before := (
      select count(*) from public.care_pharmacy_order_events
      where pharmacy_order_id = clarification_order_id
    );

    begin
      perform public.care_resolve_pharmacy_clarification(
        clarification_order_id,
        '40000000-0000-4000-8000-000000000003',
        2,
        'private-stale-resolution',
        'pr4-stale-clarification-resolution',
        '2026-07-25T20:11:10Z'
      );
      raise exception 'superseded clarification resolution was accepted';
    exception when check_violation then
      if sqlerrm <> 'care_signed_prescription_required' then raise; end if;
    end;
    perform pg_temp.assert_superseded_order_action_blocked(
      clarification_order_id,2,'receive',null,null,
      'pr4-superseded-clarification-new-receive'
    );
    perform pg_temp.assert_superseded_order_action_blocked(
      clarification_order_id,2,'accept',null,null,
      'pr4-superseded-clarification-new-accept'
    );
    perform pg_temp.assert_superseded_order_action_blocked(
      clarification_order_id,2,'dispense',null,null,
      'pr4-superseded-clarification-new-dispense'
    );
    perform pg_temp.assert_superseded_order_action_blocked(
      clarification_order_id,2,'ship',null,'private-stale-tracking',
      'pr4-superseded-clarification-new-ship'
    );
    perform pg_temp.assert_superseded_order_action_blocked(
      clarification_order_id,0,'receive',null,null,
      'pr4-superseded-clarification-receive'
    );
    perform pg_temp.assert_superseded_order_action_blocked(
      clarification_order_id,1,'request_clarification',
      'private-superseded-question',null,
      'pr4-superseded-clarification-request'
    );
    begin
      perform public.care_apply_pharmacy_order_action(
        clarification_order_id,
        '40000000-0000-4000-8000-000000000005',
        2,'reject',null,null,
        'pr4-superseded-clarification-reject',
        '2026-07-25T20:11:20Z'
      );
      raise exception 'noncanonical clarification rejection was accepted';
    exception when check_violation then
      if sqlerrm <> 'care_invalid_pharmacy_transition' then raise; end if;
    end;
    begin
      perform public.care_apply_pharmacy_order_action(
        clarification_order_id,
        '40000000-0000-4000-8000-000000000007',
        2,'cancel',null,null,
        'pr4-superseded-clarification-cancel',
        '2026-07-25T20:11:20Z'
      );
      raise exception 'cross-pharmacy actor cancelled superseded clarification';
    exception when insufficient_privilege then null;
    end;

    if (select status from public.care_pharmacy_orders where id = clarification_order_id) <> 'clarification_requested'
      or (select version from public.care_pharmacy_orders where id = clarification_order_id) <> 2
      or (
        select count(*) from public.care_pharmacy_order_events
        where pharmacy_order_id = clarification_order_id
      ) <> clarification_event_count_before
    then raise exception 'blocked clarification actions mutated the order'; end if;

    perform public.care_apply_pharmacy_order_action(
      clarification_order_id,
      '40000000-0000-4000-8000-000000000005',
      2,'cancel',null,null,
      'pr4-superseded-clarification-cancel',
      '2026-07-25T20:11:30Z'
    );
    perform public.care_apply_pharmacy_order_action(
      clarification_order_id,
      '40000000-0000-4000-8000-000000000005',
      2,'cancel',null,null,
      'pr4-superseded-clarification-cancel',
      '2026-07-25T20:11:31Z'
    );
    begin
      perform public.care_apply_pharmacy_order_action(
        clarification_order_id,
        '40000000-0000-4000-8000-000000000005',
        2,'reject',null,null,
        'pr4-superseded-clarification-cancel',
        '2026-07-25T20:11:32Z'
      );
      raise exception 'mismatched terminal replay was accepted';
    exception when check_violation then
      if sqlerrm <> 'care_pharmacy_action_replay_mismatch' then raise; end if;
    end;
    begin
      perform public.care_apply_pharmacy_order_action(
        clarification_order_id,
        '40000000-0000-4000-8000-000000000007',
        2,'cancel',null,null,
        'pr4-superseded-clarification-cancel',
        '2026-07-25T20:11:32Z'
      );
      raise exception 'cross-pharmacy terminal replay was accepted';
    exception when insufficient_privilege then null;
    end;
    if (select status from public.care_pharmacy_orders where id = clarification_order_id) <> 'cancelled'
      or (select version from public.care_pharmacy_orders where id = clarification_order_id) <> 3
      or (
        select count(*) from public.care_pharmacy_order_events
        where pharmacy_order_id = clarification_order_id
      ) <> clarification_event_count_before + 1
      or not exists (
        select 1 from public.care_pharmacy_order_events
        where pharmacy_order_id = clarification_order_id
          and action = 'cancel'
          and from_status = 'clarification_requested'
          and to_status = 'cancelled'
          and actor_user_id = '40000000-0000-4000-8000-000000000005'
          and idempotency_key = 'pr4-superseded-clarification-cancel'
      )
    then raise exception 'terminal clarification cancellation audit proof failed'; end if;

    raise exception 'rollback-superseded-clarification-cancellation-proof';
  exception when raise_exception then
    if sqlerrm <> 'rollback-superseded-clarification-cancellation-proof' then raise; end if;
  end;

  if (select status from public.care_prescriptions where id = original_prescription_id) <> 'signed'
    or (select status from public.care_pharmacy_orders where id = original_order_id) <> 'dispensed'
    or (select version from public.care_pharmacy_orders where id = original_order_id) <> 8
    or (select count(*) from public.care_prescriptions) <> prescription_count_before
    or (select count(*) from public.care_prescription_events) <> prescription_event_count_before
    or (select count(*) from public.care_pharmacy_orders) <> order_count_before
    or (select count(*) from public.care_pharmacy_order_events) <> order_event_count_before
  then raise exception 'supersession lifecycle proof left residual state'; end if;
end;
$$;

select public.care_create_prescription_draft(
  '41000000-0000-4000-8000-000000000001',
  '4b000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000003',
  'Second disposable formulation','Second disposable concentration',
  'Second disposable route','Second disposable quantity',
  'Second disposable patient-specific directions',0,null,
  'pr4-stale-sign-draft','2026-07-25T20:10:00Z'
);

create or replace function pg_temp.assert_pr4_current_context_blocks()
returns void
language plpgsql
as $$
declare
  original_prescription_id uuid := (
    select id from public.care_prescriptions
    where create_idempotency_key = 'pr4-draft'
  );
  draft_prescription_id uuid := (
    select id from public.care_prescriptions
    where create_idempotency_key = 'pr4-stale-sign-draft'
  );
  order_id uuid := (select id from public.care_pharmacy_orders);
begin
  begin
    perform public.care_create_prescription_draft(
      '41000000-0000-4000-8000-000000000001',
      '4b000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000003',
      'Blocked formulation','Blocked concentration','Blocked route',
      'Blocked quantity','Blocked directions',0,null,
      'pr4-blocked-new-draft','2026-07-25T20:11:00Z'
    );
    raise exception 'stale context accepted a new draft';
  exception when check_violation then null;
  end;
  begin
    perform public.care_create_prescription_draft(
      '41000000-0000-4000-8000-000000000001',
      '4b000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000003',
      'Disposable formulation','Disposable concentration','Disposable route',
      'Disposable quantity','Disposable patient-specific directions',0,null,
      'pr4-draft','2026-07-25T20:11:00Z'
    );
    raise exception 'stale context accepted a draft replay';
  exception when check_violation then null;
  end;
  begin
    perform public.care_sign_prescription(
      draft_prescription_id,'40000000-0000-4000-8000-000000000003',0,
      'pr4-blocked-new-sign','2026-07-25T20:11:00Z'
    );
    raise exception 'stale context accepted a new sign';
  exception when check_violation then null;
  end;
  begin
    perform public.care_sign_prescription(
      original_prescription_id,'40000000-0000-4000-8000-000000000003',0,
      'pr4-sign','2026-07-25T20:11:00Z'
    );
    raise exception 'stale context accepted a sign replay';
  exception when check_violation then null;
  end;
  begin
    perform public.care_assign_pharmacy_order(
      original_prescription_id,'4c000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000004',
      'pr4-blocked-new-assign','2026-07-25T20:11:00Z'
    );
    raise exception 'stale context accepted a new assignment';
  exception when check_violation then null;
  end;
  begin
    perform public.care_assign_pharmacy_order(
      original_prescription_id,'4c000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000004',
      'pr4-assign','2026-07-25T20:11:00Z'
    );
    raise exception 'stale context accepted an assignment replay';
  exception when check_violation then null;
  end;
  begin
    perform public.care_apply_pharmacy_order_action(
      order_id,'40000000-0000-4000-8000-000000000005',8,'ship',null,
      'private-blocked-tracking','pr4-blocked-new-action',
      '2026-07-25T20:11:00Z'
    );
    raise exception 'stale context accepted a new pharmacy action';
  exception when check_violation then null;
  end;
  begin
    perform public.care_apply_pharmacy_order_action(
      order_id,'40000000-0000-4000-8000-000000000005',0,'receive',null,null,
      'pr4-receive','2026-07-25T20:11:00Z'
    );
    raise exception 'stale context accepted an action replay';
  exception when check_violation then null;
  end;

  if (select count(*) from public.care_prescriptions) <> 2
    or (select count(*) from public.care_prescription_content_sources) <> 2
    or (select count(*) from public.care_prescription_events) <> 3
    or (select count(*) from public.care_pharmacy_orders) <> 1
    or (select count(*) from public.care_pharmacy_order_events) <> 9
    or (select version from public.care_pharmacy_orders where id = order_id) <> 8
    or (select status from public.care_pharmacy_orders where id = order_id) <> 'dispensed'
  then raise exception 'stale-context rejection mutated PR4 state'; end if;
end;
$$;

do $$
begin
  begin
    insert into public.care_consent_events (
      patient_id,document_id,kind,document_version,action,
      idempotency_key,occurred_at
    ) values (
      '41000000-0000-4000-8000-000000000001',
      '44000000-0000-4000-8000-000000000001',
      'telehealth','pr4-v1','revoked','pr4-telehealth-revoked',
      '2026-07-25T20:12:00Z'
    );
    perform pg_temp.assert_pr4_current_context_blocks();
    raise exception 'rollback-telehealth-revocation';
  exception when raise_exception then
    if sqlerrm <> 'rollback-telehealth-revocation' then raise; end if;
  end;
  begin
    insert into public.care_consent_events (
      patient_id,document_id,kind,document_version,action,
      idempotency_key,occurred_at
    ) values (
      '41000000-0000-4000-8000-000000000001',
      '44000000-0000-4000-8000-000000000002',
      'privacy_notice','pr4-v1','revoked','pr4-privacy-revoked',
      '2026-07-25T20:12:00Z'
    );
    perform pg_temp.assert_pr4_current_context_blocks();
    raise exception 'rollback-privacy-revocation';
  exception when raise_exception then
    if sqlerrm <> 'rollback-privacy-revocation' then raise; end if;
  end;
  begin
    update public.care_consent_documents
    set status = 'superseded',
        superseded_at = '2026-07-25T20:12:00Z'
    where id = '44000000-0000-4000-8000-000000000001';
    insert into public.care_consent_documents (
      kind,version,content_hash,status,approved_by,approved_at,effective_at
    ) values (
      'telehealth','pr4-v2','sha256:pr4-t2','approved',
      '40000000-0000-4000-8000-000000000004',
      '2026-07-25T20:12:00Z','2026-07-25T20:12:00Z'
    );
    perform pg_temp.assert_pr4_current_context_blocks();
    raise exception 'rollback-telehealth-supersession';
  exception when raise_exception then
    if sqlerrm <> 'rollback-telehealth-supersession' then raise; end if;
  end;
  begin
    update public.care_consent_documents
    set status = 'superseded',
        superseded_at = '2026-07-25T20:12:00Z'
    where id = '44000000-0000-4000-8000-000000000002';
    insert into public.care_consent_documents (
      kind,version,content_hash,status,approved_by,approved_at,effective_at
    ) values (
      'privacy_notice','pr4-v2','sha256:pr4-p2','approved',
      '40000000-0000-4000-8000-000000000004',
      '2026-07-25T20:12:00Z','2026-07-25T20:12:00Z'
    );
    perform pg_temp.assert_pr4_current_context_blocks();
    raise exception 'rollback-privacy-supersession';
  exception when raise_exception then
    if sqlerrm <> 'rollback-privacy-supersession' then raise; end if;
  end;
  begin
    update public.care_supported_states
    set supported_state_active = false,
        service_coverage_active = false
    where state_code = 'IL';
    perform pg_temp.assert_pr4_current_context_blocks();
    raise exception 'rollback-state-deactivation';
  exception when raise_exception then
    if sqlerrm <> 'rollback-state-deactivation' then raise; end if;
  end;
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
