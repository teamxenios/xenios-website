-- Disposable proof for Xenios Care PR 6. Run after Care PR 1-6 migrations.
-- No fixture survives this transaction and no external action is invoked.
begin;

do $$
begin
  if exists (select 1 from public.care_message_threads)
    or exists (select 1 from public.care_messages)
    or exists (select 1 from public.care_lab_cases)
    or exists (select 1 from public.care_adverse_events)
  then raise exception 'PR6 migration seeded communication, lab, or safety facts'; end if;
end;
$$;

insert into auth.users (id) values
  ('70000000-0000-4000-8000-000000000001'), -- patient
  ('70000000-0000-4000-8000-000000000002'), -- other patient
  ('70000000-0000-4000-8000-000000000003'), -- assigned clinician
  ('70000000-0000-4000-8000-000000000004'), -- clinical admin
  ('70000000-0000-4000-8000-000000000005'), -- lab reviewer
  ('70000000-0000-4000-8000-000000000006'), -- clinical support
  ('70000000-0000-4000-8000-000000000007')  -- unassigned clinician
on conflict (id) do nothing;

insert into public.care_role_assignments (user_id,role,granted_by) values
  ('70000000-0000-4000-8000-000000000001','care_patient','70000000-0000-4000-8000-000000000004'),
  ('70000000-0000-4000-8000-000000000002','care_patient','70000000-0000-4000-8000-000000000004'),
  ('70000000-0000-4000-8000-000000000003','clinician','70000000-0000-4000-8000-000000000004'),
  ('70000000-0000-4000-8000-000000000004','clinical_admin','70000000-0000-4000-8000-000000000004'),
  ('70000000-0000-4000-8000-000000000005','lab_reviewer','70000000-0000-4000-8000-000000000004'),
  ('70000000-0000-4000-8000-000000000006','clinical_support','70000000-0000-4000-8000-000000000004'),
  ('70000000-0000-4000-8000-000000000007','clinician','70000000-0000-4000-8000-000000000004');

insert into public.care_patients (id,user_id,identity_state,identity_verified_at) values
  ('71000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','verified','2026-07-25T18:00:00Z'),
  ('71000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002','verified','2026-07-25T18:00:00Z');
insert into public.care_patient_locations
  (id,patient_id,state_code,source,attested_at,idempotency_key) values
  ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','IL','patient_attestation','2026-07-25T18:01:00Z','pr6-location-1'),
  ('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','IL','patient_attestation','2026-07-25T18:01:00Z','pr6-location-2');
insert into public.care_supported_states
  (state_code,supported_state_active,service_coverage_active,waitlist_enabled,approved_by,approved_at)
values ('IL',true,true,false,'70000000-0000-4000-8000-000000000004','2026-07-25T18:02:00Z');
insert into public.care_clinician_state_coverage
  (id,clinician_user_id,state_code,active,verified_by,verified_at,expires_at)
values ('73000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003','IL',true,
  '70000000-0000-4000-8000-000000000004','2026-07-25T18:03:00Z','2027-07-25T18:03:00Z');

insert into public.care_consent_documents
  (id,kind,version,content_hash,status,approved_by,approved_at,effective_at) values
  ('74000000-0000-4000-8000-000000000001','telehealth','pr6-v1','sha256:pr6-t','approved','70000000-0000-4000-8000-000000000004','2026-07-25T18:04:00Z','2026-07-25T18:04:00Z'),
  ('74000000-0000-4000-8000-000000000002','privacy_notice','pr6-v1','sha256:pr6-p','approved','70000000-0000-4000-8000-000000000004','2026-07-25T18:04:00Z','2026-07-25T18:04:00Z');
insert into public.care_consent_events
  (id,patient_id,document_id,kind,document_version,action,idempotency_key,occurred_at) values
  ('75000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001','telehealth','pr6-v1','granted','pr6-consent-t','2026-07-25T18:05:00Z'),
  ('75000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000002','privacy_notice','pr6-v1','granted','pr6-consent-p','2026-07-25T18:05:00Z');
insert into public.care_intake_definitions
  (id,version,status,schema_hash,fields,approved_by,approved_at)
values ('76000000-0000-4000-8000-000000000001','pr6-v1','approved','sha256:pr6-i','[]',
  '70000000-0000-4000-8000-000000000004','2026-07-25T18:06:00Z');
insert into public.care_intakes
  (id,patient_id,definition_id,definition_version,telehealth_consent_event_id,
   privacy_consent_event_id,status,version,start_idempotency_key,submit_idempotency_key,
   created_at,submitted_at)
values ('77000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000001','pr6-v1',
  '75000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000002',
  'submitted',1,'pr6-intake-start','pr6-intake-submit','2026-07-25T18:07:00Z','2026-07-25T18:08:00Z');

insert into public.care_medical_groups
  (id,legal_name,business_address,authorized_representative,agreement_reference,
   agreement_effective_at,clinical_governance_owner,privacy_relationship_approved,
   incident_process_reference,support_escalation_reference,verification_state,
   verified_by,verified_at)
values ('78000000-0000-4000-8000-000000000001','Disposable medical group','Disposable address',
  'Disposable representative','disposable-agreement','2026-07-25T18:09:00Z',
  'Disposable governance',true,'disposable-incident','disposable-support','verified',
  '70000000-0000-4000-8000-000000000004','2026-07-25T18:09:00Z');
insert into public.care_clinician_profiles
  (clinician_user_id,medical_group_id,legal_name,professional_title,specialty,
   agreement_reference,privacy_access_approved,clinical_role_approved,
   verification_state,verified_by,verified_at)
values ('70000000-0000-4000-8000-000000000003','78000000-0000-4000-8000-000000000001',
  'Disposable clinician','Clinician','Disposable specialty','disposable-clinician-agreement',
  true,true,'verified','70000000-0000-4000-8000-000000000004','2026-07-25T18:10:00Z');
insert into public.care_clinician_licenses
  (id,clinician_user_id,license_number,state_code,expires_at,evidence_reference,
   verification_state,verified_by,verified_at)
values ('79000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003',
  'DISPOSABLE-ONLY','IL','2027-07-25T18:10:00Z','disposable-evidence','verified',
  '70000000-0000-4000-8000-000000000004','2026-07-25T18:10:00Z');

insert into public.care_appointments
  (id,patient_id,intake_id,patient_location_id,patient_state_code,
   assigned_clinician_user_id,clinician_coverage_id,status,starts_at,ends_at,
   version,request_idempotency_key,created_at,updated_at)
values ('7a000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',
  '77000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001',
  'IL','70000000-0000-4000-8000-000000000003','73000000-0000-4000-8000-000000000001',
  'completed','2026-07-25T19:00:00Z','2026-07-25T19:30:00Z',1,'pr6-appointment',
  '2026-07-25T18:30:00Z','2026-07-25T19:30:00Z');

do $$
begin
  begin
    perform public.care_create_message_thread(
      '71000000-0000-4000-8000-000000000002',
      '7a000000-0000-4000-8000-000000000001',
      'cross_patient','70000000-0000-4000-8000-000000000002',
      'pr6-cross-thread','2026-07-25T19:31:00Z'
    );
    raise exception 'cross-patient message thread was accepted';
  exception when check_violation then null;
  end;
end;
$$;

select public.care_create_message_thread(
  '71000000-0000-4000-8000-000000000001',
  '7a000000-0000-4000-8000-000000000001',
  'patient_question','70000000-0000-4000-8000-000000000001',
  'pr6-message-thread','2026-07-25T19:32:00Z'
);
select public.care_create_message_thread(
  '71000000-0000-4000-8000-000000000001',
  '7a000000-0000-4000-8000-000000000001',
  'patient_question','70000000-0000-4000-8000-000000000001',
  'pr6-message-thread','2026-07-25T19:33:00Z'
);
select public.care_post_message(
  (select id from public.care_message_threads),
  '70000000-0000-4000-8000-000000000001',
  'Disposable patient message','pr6-patient-message','2026-07-25T19:34:00Z'
);
select public.care_post_message(
  (select id from public.care_message_threads),
  '70000000-0000-4000-8000-000000000001',
  'Disposable patient message','pr6-patient-message','2026-07-25T19:35:00Z'
);
do $$
begin
  begin
    perform public.care_post_message(
      (select id from public.care_message_threads),
      '70000000-0000-4000-8000-000000000007',
      'Unauthorized clinician message','pr6-wrong-clinician','2026-07-25T19:36:00Z'
    );
    raise exception 'unassigned clinician message was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select public.care_post_message(
  (select id from public.care_message_threads),
  '70000000-0000-4000-8000-000000000003',
  'Disposable clinician response','pr6-clinician-message','2026-07-25T19:37:00Z'
);

select public.care_create_lab_case(
  '71000000-0000-4000-8000-000000000001',
  '7a000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000004',
  'pr6-lab-case','2026-07-25T19:40:00Z'
);
select public.care_create_lab_case(
  '71000000-0000-4000-8000-000000000001',
  '7a000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000004',
  'pr6-lab-case','2026-07-25T19:41:00Z'
);
select public.care_assign_lab_reviewer(
  (select id from public.care_lab_cases),
  '70000000-0000-4000-8000-000000000005',
  '70000000-0000-4000-8000-000000000004',
  'pr6-lab-assign','2026-07-25T19:42:00Z'
);
do $$
begin
  begin
    perform public.care_apply_lab_action(
      (select id from public.care_lab_cases),
      '70000000-0000-4000-8000-000000000007',0,
      'record_order_reference','unauthorized-provider','unauthorized-order',
      null,null,'pr6-wrong-reviewer','2026-07-25T19:43:00Z'
    );
    raise exception 'unassigned lab reviewer action was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select public.care_apply_lab_action(
  (select id from public.care_lab_cases),
  '70000000-0000-4000-8000-000000000005',0,
  'record_order_reference','disposable-provider-reference','disposable-order-reference',
  null,null,'pr6-lab-order-reference','2026-07-25T19:44:00Z'
);
select public.care_apply_lab_action(
  (select id from public.care_lab_cases),
  '70000000-0000-4000-8000-000000000005',0,
  'record_order_reference','disposable-provider-reference','disposable-order-reference',
  null,null,'pr6-lab-order-reference','2026-07-25T19:45:00Z'
);
select public.care_apply_lab_action(
  (select id from public.care_lab_cases),
  '70000000-0000-4000-8000-000000000005',1,
  'record_result_reference',null,null,
  'disposable-result-reference','private/disposable-object-reference',
  'pr6-lab-result-reference','2026-07-25T19:46:00Z'
);
select public.care_apply_lab_action(
  (select id from public.care_lab_cases),
  '70000000-0000-4000-8000-000000000005',2,
  'review',null,null,null,null,'pr6-lab-review','2026-07-25T19:47:00Z'
);
select public.care_apply_lab_action(
  (select id from public.care_lab_cases),
  '70000000-0000-4000-8000-000000000005',3,
  'close',null,null,null,null,'pr6-lab-close','2026-07-25T19:48:00Z'
);

do $$
begin
  begin
    perform public.care_report_adverse_event(
      '71000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000002',
      'adverse_event','possible_emergency','Cross-patient report',true,
      'pr6-cross-adverse','2026-07-25T19:50:00Z'
    );
    raise exception 'cross-patient adverse-event report was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select public.care_report_adverse_event(
  '71000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  'adverse_event','possible_emergency','Disposable private issue summary',true,
  'pr6-adverse-report','2026-07-25T19:51:00Z'
);
select public.care_report_adverse_event(
  '71000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  'adverse_event','possible_emergency','Disposable private issue summary',true,
  'pr6-adverse-report','2026-07-25T19:52:00Z'
);
select public.care_assign_adverse_event_owner(
  (select id from public.care_adverse_events),
  '70000000-0000-4000-8000-000000000006','clinical_support',
  '70000000-0000-4000-8000-000000000004',
  'pr6-adverse-assign','2026-07-25T19:53:00Z'
);
do $$
begin
  begin
    perform public.care_apply_adverse_event_action(
      (select id from public.care_adverse_events),
      '70000000-0000-4000-8000-000000000007',0,
      'acknowledge','pr6-wrong-owner','2026-07-25T19:54:00Z'
    );
    raise exception 'unassigned adverse-event owner action was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
select public.care_apply_adverse_event_action(
  (select id from public.care_adverse_events),
  '70000000-0000-4000-8000-000000000006',0,
  'acknowledge','pr6-adverse-ack','2026-07-25T19:55:00Z'
);
select public.care_apply_adverse_event_action(
  (select id from public.care_adverse_events),
  '70000000-0000-4000-8000-000000000006',0,
  'acknowledge','pr6-adverse-ack','2026-07-25T19:56:00Z'
);
do $$
begin
  begin
    perform public.care_apply_adverse_event_action(
      (select id from public.care_adverse_events),
      '70000000-0000-4000-8000-000000000006',1,
      'close','pr6-premature-close','2026-07-25T19:57:00Z'
    );
    raise exception 'possible-emergency issue closed before escalation';
  exception when check_violation then null;
  end;
end;
$$;
select public.care_apply_adverse_event_action(
  (select id from public.care_adverse_events),
  '70000000-0000-4000-8000-000000000006',1,
  'escalate','pr6-adverse-escalate','2026-07-25T19:58:00Z'
);
select public.care_apply_adverse_event_action(
  (select id from public.care_adverse_events),
  '70000000-0000-4000-8000-000000000006',2,
  'close','pr6-adverse-close','2026-07-25T19:59:00Z'
);

do $$
begin
  begin
    update public.care_messages set body='mutated';
    raise exception 'message history update was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.care_message_events;
    raise exception 'message event history delete was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.care_lab_events set action='close';
    raise exception 'lab event history update was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.care_adverse_event_history;
    raise exception 'adverse-event history delete was accepted';
  exception when sqlstate '55000' then null;
  end;
  if (select count(*) from public.care_message_threads) <> 1
    or (select count(*) from public.care_messages) <> 2
    or (select count(*) from public.care_lab_cases) <> 1
    or (select count(*) from public.care_adverse_events) <> 1
  then raise exception 'PR6 idempotency proof failed'; end if;
  if (select status <> 'closed' from public.care_lab_cases)
    or (select status <> 'closed' from public.care_adverse_events)
  then raise exception 'PR6 lifecycle proof failed'; end if;
  if (select state <> 'disabled' from public.care_capabilities where capability_key='care')
  then raise exception 'Care capability was enabled'; end if;
  if (
    select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in (
      'care_message_threads','care_messages','care_message_events',
      'care_lab_cases','care_lab_assignments','care_lab_events',
      'care_adverse_events','care_adverse_event_assignments',
      'care_adverse_event_history'
    ) and c.relrowsecurity and c.relforcerowsecurity
  ) <> 9 then raise exception 'PR6 forced RLS proof failed'; end if;
end;
$$;

rollback;

do $$
begin
  if exists (select 1 from public.care_message_threads)
    or exists (select 1 from public.care_messages)
    or exists (select 1 from public.care_lab_cases)
    or exists (select 1 from public.care_adverse_events)
  then raise exception 'PR6 disposable rows survived rollback'; end if;
end;
$$;
