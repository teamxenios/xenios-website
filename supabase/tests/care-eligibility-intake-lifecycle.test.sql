-- Disposable-database proof for Xenios Care PR 2.
-- Run after care-access-foundation.sql and care-eligibility-intake.sql.
-- The transaction always rolls back.

begin;

do $$
begin
  if exists (select 1 from public.care_supported_states)
    or exists (select 1 from public.care_consent_documents)
    or exists (select 1 from public.care_intake_definitions) then
    raise exception 'PR 2 migration seeded external state, consent, or intake data';
  end if;
end;
$$;

insert into auth.users (id)
values
  ('20000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000003'),
  ('20000000-0000-0000-0000-000000000004')
on conflict (id) do nothing;

insert into public.care_patients (
  id,
  user_id,
  identity_state,
  identity_verified_at
)
values
  (
    '21000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'verified',
    '2026-07-25T18:00:00Z'
  ),
  (
    '21000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000004',
    'verified',
    '2026-07-25T18:00:00Z'
  ),
  (
    '21000000-0000-0000-0000-000000000003',
    '20000000-0000-0000-0000-000000000003',
    'verified',
    '2026-07-25T18:00:00Z'
  );

insert into public.care_patient_locations (
  id,
  patient_id,
  state_code,
  source,
  attested_at,
  idempotency_key
)
values (
  '22000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  'IL',
  'patient_attestation',
  '2026-07-25T18:10:00Z',
  'location-key-1'
);

do $$
begin
  begin
    update public.care_patient_locations
    set state_code = 'WI'
    where id = '22000000-0000-0000-0000-000000000001';
    raise exception 'location update was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.care_patient_locations
    where id = '22000000-0000-0000-0000-000000000001';
    raise exception 'location delete was accepted';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

insert into public.care_supported_states (
  state_code,
  supported_state_active,
  service_coverage_active,
  waitlist_enabled,
  approved_by,
  approved_at
)
values (
  'IL',
  false,
  false,
  true,
  '20000000-0000-0000-0000-000000000003',
  '2026-07-25T18:15:00Z'
);

update public.care_supported_states
set
  supported_state_active = true,
  service_coverage_active = true,
  updated_at = '2026-07-25T18:20:00Z'
where state_code = 'IL';

insert into public.care_role_assignments (
  user_id,
  role,
  granted_by
)
values (
  '20000000-0000-0000-0000-000000000002',
  'clinician',
  '20000000-0000-0000-0000-000000000003'
);

do $$
begin
  if (
    select count(*)
    from public.care_supported_state_audit
    where state_code = 'IL'
  ) <> 2 then
    raise exception 'supported-state insert/update audit proof failed';
  end if;
  begin
    update public.care_supported_state_audit
    set changed_by = null
    where state_code = 'IL';
    raise exception 'supported-state audit update was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.care_supported_state_audit
    where state_code = 'IL';
    raise exception 'supported-state audit delete was accepted';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

insert into public.care_clinician_state_coverage (
  clinician_user_id,
  state_code,
  active,
  verified_by,
  verified_at,
  expires_at
)
values (
  '20000000-0000-0000-0000-000000000002',
  'IL',
  true,
  '20000000-0000-0000-0000-000000000003',
  '2026-07-25T18:30:00Z',
  '2026-08-25T18:30:00Z'
);

do $$
begin
  if public.care_active_clinician_count(
    'IL',
    '2026-07-25T19:00:00Z'
  ) <> 1 then
    raise exception 'active clinician role/coverage count proof failed';
  end if;
  if (
    select count(*)
    from public.care_clinician_coverage_audit
    where state_code = 'IL'
      and action = 'insert'
  ) <> 1 then
    raise exception 'clinician coverage audit proof failed';
  end if;
  begin
    update public.care_clinician_coverage_audit
    set changed_by = null
    where state_code = 'IL';
    raise exception 'clinician coverage audit update was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.care_clinician_coverage_audit
    where state_code = 'IL';
    raise exception 'clinician coverage audit delete was accepted';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

insert into public.care_consent_documents (
  id,
  kind,
  version,
  content_hash,
  status,
  approved_by,
  approved_at,
  effective_at
)
values
  (
    '23000000-0000-0000-0000-000000000001',
    'telehealth',
    'test-approved-v1',
    'sha256:test-telehealth-approved',
    'approved',
    '20000000-0000-0000-0000-000000000003',
    '2026-07-25T18:30:00Z',
    '2026-07-25T18:30:00Z'
  ),
  (
    '23000000-0000-0000-0000-000000000002',
    'privacy_notice',
    'test-approved-v1',
    'sha256:test-privacy-approved',
    'approved',
    '20000000-0000-0000-0000-000000000003',
    '2026-07-25T18:30:00Z',
    '2026-07-25T18:30:00Z'
  );

insert into public.care_consent_events (
  id,
  patient_id,
  document_id,
  kind,
  document_version,
  action,
  idempotency_key,
  occurred_at
)
values
  (
    '24000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001',
    'telehealth',
    'test-approved-v1',
    'granted',
    'consent-telehealth-1',
    '2026-07-25T18:40:00Z'
  ),
  (
    '24000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000002',
    'privacy_notice',
    'test-approved-v1',
    'granted',
    'consent-privacy-1',
    '2026-07-25T18:41:00Z'
  ),
  (
    '24000000-0000-0000-0000-000000000003',
    '21000000-0000-0000-0000-000000000002',
    '23000000-0000-0000-0000-000000000001',
    'telehealth',
    'test-approved-v1',
    'granted',
    'other-telehealth-1',
    '2026-07-25T18:42:00Z'
  ),
  (
    '24000000-0000-0000-0000-000000000004',
    '21000000-0000-0000-0000-000000000002',
    '23000000-0000-0000-0000-000000000002',
    'privacy_notice',
    'test-approved-v1',
    'granted',
    'other-privacy-1',
    '2026-07-25T18:43:00Z'
  ),
  (
    '24000000-0000-0000-0000-000000000005',
    '21000000-0000-0000-0000-000000000003',
    '23000000-0000-0000-0000-000000000001',
    'telehealth',
    'test-approved-v1',
    'granted',
    'supersession-telehealth-1',
    '2026-07-25T18:44:00Z'
  ),
  (
    '24000000-0000-0000-0000-000000000006',
    '21000000-0000-0000-0000-000000000003',
    '23000000-0000-0000-0000-000000000002',
    'privacy_notice',
    'test-approved-v1',
    'granted',
    'supersession-privacy-1',
    '2026-07-25T18:45:00Z'
  );

do $$
begin
  begin
    update public.care_consent_events
    set action = 'revoked'
    where id = '24000000-0000-0000-0000-000000000001';
    raise exception 'consent event update was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.care_consent_events
    where id = '24000000-0000-0000-0000-000000000001';
    raise exception 'consent event delete was accepted';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

insert into public.care_eligibility_checks (
  patient_id,
  location_id,
  outcome,
  reason,
  state_code,
  care_eligibility_cleared,
  evaluated_at
)
values (
  '21000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  'intake_available',
  'intake_foundation_ready',
  'IL',
  false,
  '2026-07-25T18:45:00Z'
);

insert into public.care_waitlist_events (
  id,
  patient_id,
  state_code,
  action,
  idempotency_key,
  occurred_at
)
values
  (
    '24500000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    'IL',
    'joined',
    'waitlist-join-1',
    '2026-07-25T18:46:00Z'
  ),
  (
    '24500000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000001',
    'IL',
    'withdrawn',
    'waitlist-withdraw-1',
    '2026-07-25T18:47:00Z'
  );

do $$
begin
  begin
    update public.care_eligibility_checks
    set reason = 'care_disabled'
    where patient_id = '21000000-0000-0000-0000-000000000001';
    raise exception 'eligibility history update was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.care_eligibility_checks
    where patient_id = '21000000-0000-0000-0000-000000000001';
    raise exception 'eligibility history delete was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.care_waitlist_events
    set action = 'withdrawn'
    where id = '24500000-0000-0000-0000-000000000001';
    raise exception 'waitlist history update was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.care_waitlist_events
    where id = '24500000-0000-0000-0000-000000000002';
    raise exception 'waitlist history delete was accepted';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

insert into public.care_intake_definitions (
  id,
  version,
  status,
  schema_hash,
  fields,
  approved_by,
  approved_at
)
values (
  '25000000-0000-0000-0000-000000000001',
  'test-definition-v1',
  'approved',
  'sha256:test-definition-approved',
  '[{"key":"approved_test_field","kind":"text","required":true,"options":[]}]',
  '20000000-0000-0000-0000-000000000003',
  '2026-07-25T18:50:00Z'
);

do $$
begin
  begin
    insert into public.care_intakes (
      patient_id,
      definition_id,
      definition_version,
      telehealth_consent_event_id,
      privacy_consent_event_id,
      start_idempotency_key
    )
    values (
      '21000000-0000-0000-0000-000000000001',
      '25000000-0000-0000-0000-000000000001',
      'test-definition-v1',
      '24000000-0000-0000-0000-000000000003',
      '24000000-0000-0000-0000-000000000002',
      'wrong-patient-binding'
    );
    raise exception 'cross-patient consent binding was accepted';
  exception when check_violation then null;
  end;
end;
$$;

insert into public.care_intakes (
  id,
  patient_id,
  definition_id,
  definition_version,
  telehealth_consent_event_id,
  privacy_consent_event_id,
  start_idempotency_key,
  created_at
)
values (
  '26000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  '25000000-0000-0000-0000-000000000001',
  'test-definition-v1',
  '24000000-0000-0000-0000-000000000001',
  '24000000-0000-0000-0000-000000000002',
  'intake-start-key-1',
  '2026-07-25T19:00:00Z'
);

select public.care_intake_autosave(
  '26000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  0,
  '{"approved_test_field":"fixture only"}'::jsonb,
  'intake-save-key-1',
  '2026-07-25T19:01:00Z'
);

-- A replay returns the first immutable revision and does not increment again.
select public.care_intake_autosave(
  '26000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  0,
  '{"approved_test_field":"different replay payload"}'::jsonb,
  'intake-save-key-1',
  '2026-07-25T19:02:00Z'
);

do $$
begin
  if (
    select count(*)
    from public.care_intake_revisions
    where intake_id = '26000000-0000-0000-0000-000000000001'
  ) <> 1 then
    raise exception 'autosave idempotency proof failed';
  end if;
  if (
    select version
    from public.care_intakes
    where id = '26000000-0000-0000-0000-000000000001'
  ) <> 1 then
    raise exception 'autosave projection version proof failed';
  end if;

  begin
    perform public.care_intake_autosave(
      '26000000-0000-0000-0000-000000000001',
      '21000000-0000-0000-0000-000000000002',
      1,
      '{}'::jsonb,
      'other-patient-save-1',
      '2026-07-25T19:03:00Z'
    );
    raise exception 'cross-patient autosave was accepted';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.care_intake_autosave(
      '26000000-0000-0000-0000-000000000001',
      '21000000-0000-0000-0000-000000000001',
      0,
      '{}'::jsonb,
      'stale-version-save-1',
      '2026-07-25T19:04:00Z'
    );
    raise exception 'stale-version autosave was accepted';
  exception when serialization_failure then null;
  end;

  begin
    update public.care_intake_revisions
    set responses = '{}'::jsonb
    where intake_id = '26000000-0000-0000-0000-000000000001';
    raise exception 'intake revision update was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.care_intake_revisions
    where intake_id = '26000000-0000-0000-0000-000000000001';
    raise exception 'intake revision delete was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    perform public.care_intake_submit(
      '26000000-0000-0000-0000-000000000001',
      '21000000-0000-0000-0000-000000000002',
      1,
      'other-patient-submit-1',
      '2026-07-25T19:04:30Z'
    );
    raise exception 'cross-patient submit was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select public.care_intake_submit(
  '26000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  1,
  'intake-submit-key-1',
  '2026-07-25T19:05:00Z'
);

-- Submission replay is idempotent.
select public.care_intake_submit(
  '26000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  1,
  'intake-submit-key-1',
  '2026-07-25T19:06:00Z'
);

do $$
begin
  if not exists (
    select 1
    from public.care_intakes
    where id = '26000000-0000-0000-0000-000000000001'
      and status = 'submitted'
      and version = 1
      and submit_idempotency_key = 'intake-submit-key-1'
  ) then
    raise exception 'intake submit/replay proof failed';
  end if;
end;
$$;

-- Two additional drafts prove that consent freshness is enforced by the
-- database independently of the HTTP preflight. Both begin with exact current
-- grants and successfully autosave once before their consent state changes.
insert into public.care_intakes (
  id,
  patient_id,
  definition_id,
  definition_version,
  telehealth_consent_event_id,
  privacy_consent_event_id,
  start_idempotency_key,
  created_at
)
values
  (
    '26000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000002',
    '25000000-0000-0000-0000-000000000001',
    'test-definition-v1',
    '24000000-0000-0000-0000-000000000003',
    '24000000-0000-0000-0000-000000000004',
    'revocation-intake-start',
    '2026-07-25T19:07:00Z'
  ),
  (
    '26000000-0000-0000-0000-000000000003',
    '21000000-0000-0000-0000-000000000003',
    '25000000-0000-0000-0000-000000000001',
    'test-definition-v1',
    '24000000-0000-0000-0000-000000000005',
    '24000000-0000-0000-0000-000000000006',
    'supersession-intake-start',
    '2026-07-25T19:07:30Z'
  );

select public.care_intake_autosave(
  '26000000-0000-0000-0000-000000000002',
  '21000000-0000-0000-0000-000000000002',
  0,
  '{"approved_test_field":"current consent"}'::jsonb,
  'revocation-current-save',
  '2026-07-25T19:08:00Z'
);

select public.care_intake_autosave(
  '26000000-0000-0000-0000-000000000003',
  '21000000-0000-0000-0000-000000000003',
  0,
  '{"approved_test_field":"current consent"}'::jsonb,
  'supersession-current-save',
  '2026-07-25T19:08:30Z'
);

insert into public.care_consent_events (
  id,
  patient_id,
  document_id,
  kind,
  document_version,
  action,
  idempotency_key,
  occurred_at
)
values (
  '24000000-0000-0000-0000-000000000007',
  '21000000-0000-0000-0000-000000000002',
  '23000000-0000-0000-0000-000000000001',
  'telehealth',
  'test-approved-v1',
  'revoked',
  'revocation-telehealth-later',
  '2026-07-25T19:09:00Z'
);

do $$
begin
  begin
    perform public.care_intake_autosave(
      '26000000-0000-0000-0000-000000000002',
      '21000000-0000-0000-0000-000000000002',
      1,
      '{"approved_test_field":"must not persist"}'::jsonb,
      'revoked-consent-save',
      '2026-07-25T19:09:30Z'
    );
    raise exception 'autosave after consent revocation was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.care_intake_submit(
      '26000000-0000-0000-0000-000000000002',
      '21000000-0000-0000-0000-000000000002',
      1,
      'revoked-consent-submit',
      '2026-07-25T19:10:00Z'
    );
    raise exception 'submit after consent revocation was accepted';
  exception when check_violation then null;
  end;
  if (
    select count(*)
    from public.care_intake_revisions
    where intake_id = '26000000-0000-0000-0000-000000000002'
  ) <> 1 then
    raise exception 'revocation changed intake revision history';
  end if;
  if not exists (
    select 1
    from public.care_intakes
    where id = '26000000-0000-0000-0000-000000000002'
      and version = 1
      and status = 'draft'
      and submit_idempotency_key is null
  ) then
    raise exception 'revocation changed intake version or status';
  end if;
end;
$$;

insert into public.care_consent_documents (
  id,
  kind,
  version,
  content_hash,
  status
)
values (
  '23000000-0000-0000-0000-000000000003',
  'privacy_notice',
  'test-approved-v2',
  'sha256:test-privacy-approved-v2',
  'draft'
);

update public.care_consent_documents
set
  status = 'superseded',
  superseded_at = '2026-07-25T19:10:30Z'
where id = '23000000-0000-0000-0000-000000000002';

update public.care_consent_documents
set
  status = 'approved',
  approved_by = '20000000-0000-0000-0000-000000000003',
  approved_at = '2026-07-25T19:11:00Z',
  effective_at = '2026-07-25T19:11:00Z'
where id = '23000000-0000-0000-0000-000000000003';

do $$
begin
  begin
    perform public.care_intake_autosave(
      '26000000-0000-0000-0000-000000000003',
      '21000000-0000-0000-0000-000000000003',
      1,
      '{"approved_test_field":"must not persist"}'::jsonb,
      'superseded-consent-save',
      '2026-07-25T19:11:30Z'
    );
    raise exception 'autosave after consent supersession was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.care_intake_submit(
      '26000000-0000-0000-0000-000000000003',
      '21000000-0000-0000-0000-000000000003',
      1,
      'superseded-consent-submit',
      '2026-07-25T19:12:00Z'
    );
    raise exception 'submit after consent supersession was accepted';
  exception when check_violation then null;
  end;
  if (
    select count(*)
    from public.care_intake_revisions
    where intake_id = '26000000-0000-0000-0000-000000000003'
  ) <> 1 then
    raise exception 'supersession changed intake revision history';
  end if;
  if not exists (
    select 1
    from public.care_intakes
    where id = '26000000-0000-0000-0000-000000000003'
      and version = 1
      and status = 'draft'
      and submit_idempotency_key is null
  ) then
    raise exception 'supersession changed intake version or status';
  end if;
end;
$$;

do $$
begin
  begin
    update public.care_consent_documents
    set content_hash = 'sha256:changed-after-approval'
    where id = '23000000-0000-0000-0000-000000000001';
    raise exception 'approved consent document mutation was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.care_consent_documents
    where id = '23000000-0000-0000-0000-000000000001';
    raise exception 'approved consent document delete was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.care_intake_definitions
    set fields = '[]'::jsonb
    where id = '25000000-0000-0000-0000-000000000001';
    raise exception 'approved intake definition mutation was accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    delete from public.care_intake_definitions
    where id = '25000000-0000-0000-0000-000000000001';
    raise exception 'approved intake definition delete was accepted';
  exception when sqlstate '55000' then null;
  end;
end;
$$;

rollback;
