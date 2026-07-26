-- Xenios Care PR 3: medical-group/clinician readiness, provider-neutral
-- scheduling, appointments, reminders, telehealth-session references, and
-- assigned human-clinician review.
--
-- Additive and idempotent. This migration seeds no medical group, clinician,
-- license, supported state, scheduling provider, telehealth session,
-- appointment, reminder, laboratory request, or clinical decision.
-- It depends on Care PR 1 and PR 2 and keeps the canonical Care capability
-- disabled.

create extension if not exists pgcrypto;

create table if not exists public.care_medical_groups (
  id uuid primary key default gen_random_uuid(),
  legal_name text null,
  business_address text null,
  authorized_representative text null,
  agreement_reference text null,
  agreement_effective_at timestamptz null,
  clinical_governance_owner text null,
  privacy_relationship_approved boolean not null default false,
  incident_process_reference text null,
  support_escalation_reference text null,
  verification_state text not null default 'missing'
    check (verification_state in (
      'missing', 'entered', 'under_review', 'verified', 'rejected',
      'expired', 'superseded'
    )),
  verified_by uuid null references auth.users(id),
  verified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    verification_state <> 'verified'
    or (
      nullif(trim(legal_name), '') is not null
      and nullif(trim(business_address), '') is not null
      and nullif(trim(authorized_representative), '') is not null
      and nullif(trim(agreement_reference), '') is not null
      and agreement_effective_at is not null
      and nullif(trim(clinical_governance_owner), '') is not null
      and privacy_relationship_approved
      and nullif(trim(incident_process_reference), '') is not null
      and nullif(trim(support_escalation_reference), '') is not null
      and verified_by is not null
      and verified_at is not null
    )
  )
);

create table if not exists public.care_clinician_profiles (
  clinician_user_id uuid primary key references auth.users(id) on delete cascade,
  medical_group_id uuid null references public.care_medical_groups(id),
  legal_name text null,
  professional_title text null,
  npi text null,
  specialty text null,
  agreement_reference text null,
  privacy_access_approved boolean not null default false,
  clinical_role_approved boolean not null default false,
  verification_state text not null default 'missing'
    check (verification_state in (
      'missing', 'entered', 'under_review', 'verified', 'rejected',
      'expired', 'superseded'
    )),
  verified_by uuid null references auth.users(id),
  verified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    verification_state <> 'verified'
    or (
      medical_group_id is not null
      and nullif(trim(legal_name), '') is not null
      and nullif(trim(professional_title), '') is not null
      and nullif(trim(specialty), '') is not null
      and nullif(trim(agreement_reference), '') is not null
      and privacy_access_approved
      and clinical_role_approved
      and verified_by is not null
      and verified_at is not null
    )
  )
);

create table if not exists public.care_clinician_licenses (
  id uuid primary key default gen_random_uuid(),
  clinician_user_id uuid not null
    references public.care_clinician_profiles(clinician_user_id)
    on delete cascade,
  license_number text null,
  state_code text not null check (state_code ~ '^[A-Z]{2}$'),
  expires_at timestamptz null,
  evidence_reference text null,
  verification_state text not null default 'missing'
    check (verification_state in (
      'missing', 'entered', 'under_review', 'verified', 'rejected',
      'expired', 'superseded'
    )),
  verified_by uuid null references auth.users(id),
  verified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    verification_state <> 'verified'
    or (
      nullif(trim(license_number), '') is not null
      and expires_at is not null
      and nullif(trim(evidence_reference), '') is not null
      and verified_by is not null
      and verified_at is not null
    )
  )
);

create unique index if not exists care_clinician_license_verified_state_idx
  on public.care_clinician_licenses (clinician_user_id, state_code)
  where verification_state = 'verified';

create table if not exists public.care_scheduling_providers (
  provider_key text primary key check (length(provider_key) between 3 and 120),
  legal_name text null,
  agreement_reference text null,
  scheduling_active boolean not null default false,
  telehealth_active boolean not null default false,
  reminder_offsets_minutes integer[] not null default '{}'::integer[],
  verification_state text not null default 'missing'
    check (verification_state in (
      'missing', 'entered', 'under_review', 'verified', 'rejected',
      'expired', 'superseded'
    )),
  verified_by uuid null references auth.users(id),
  verified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    verification_state <> 'verified'
    or (
      nullif(trim(legal_name), '') is not null
      and nullif(trim(agreement_reference), '') is not null
      and scheduling_active
      and telehealth_active
      and cardinality(reminder_offsets_minutes) > 0
      and verified_by is not null
      and verified_at is not null
    )
  ),
  check (
    0 < all(reminder_offsets_minutes)
    and 10080 >= all(reminder_offsets_minutes)
  )
);

create table if not exists public.care_clinical_configuration_audit (
  id bigint generated by default as identity primary key,
  record_type text not null check (record_type in (
    'medical_group',
    'clinician_profile',
    'clinician_license',
    'scheduling_provider'
  )),
  record_key text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  old_record jsonb null,
  new_record jsonb null,
  occurred_at timestamptz not null default now()
);

create table if not exists public.care_appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.care_patients(id) on delete cascade,
  intake_id uuid not null references public.care_intakes(id),
  patient_location_id uuid not null
    references public.care_patient_locations(id),
  patient_state_code text not null check (patient_state_code ~ '^[A-Z]{2}$'),
  assigned_clinician_user_id uuid null references auth.users(id),
  clinician_coverage_id uuid null
    references public.care_clinician_state_coverage(id),
  status text not null default 'requested'
    check (status in (
      'requested', 'scheduled', 'checked_in', 'completed', 'cancelled',
      'no_show'
    )),
  starts_at timestamptz null,
  ends_at timestamptz null,
  version integer not null default 0 check (version >= 0),
  request_idempotency_key text not null
    check (length(request_idempotency_key) between 8 and 128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id, request_idempotency_key),
  unique (id, patient_id),
  check (
    (status in ('requested', 'cancelled') and starts_at is null and ends_at is null)
    or
    (status in ('scheduled', 'checked_in', 'completed', 'no_show')
      and starts_at is not null
      and ends_at is not null
      and ends_at > starts_at)
  ),
  check (
    assigned_clinician_user_id is null
    or clinician_coverage_id is not null
  )
);

create unique index if not exists care_appointments_one_open_patient_idx
  on public.care_appointments (patient_id)
  where status in ('requested', 'scheduled', 'checked_in');

create table if not exists public.care_telehealth_sessions (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.care_appointments(id)
    on delete cascade,
  provider_key text not null
    references public.care_scheduling_providers(provider_key),
  provider_session_reference text not null
    check (length(provider_session_reference) between 8 and 500),
  status text not null default 'ready'
    check (status in ('ready', 'superseded', 'closed', 'cancelled')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  superseded_at timestamptz null,
  check (
    status <> 'superseded' or superseded_at is not null
  )
);

create unique index if not exists care_telehealth_one_ready_appointment_idx
  on public.care_telehealth_sessions (appointment_id)
  where status = 'ready';

create table if not exists public.care_appointment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.care_appointments(id)
    on delete cascade,
  patient_id uuid not null references public.care_patients(id) on delete cascade,
  actor_user_id uuid null references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in (
    'care_patient', 'clinical_admin', 'clinician', 'system'
  )),
  action text not null check (action in (
    'requested', 'assigned', 'reassigned', 'scheduled', 'rescheduled',
    'cancelled', 'checked_in', 'completed', 'no_show'
  )),
  from_status text null,
  to_status text not null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 128),
  occurred_at timestamptz not null default now(),
  unique (appointment_id, idempotency_key)
);

create table if not exists public.care_clinician_assignment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.care_appointments(id)
    on delete cascade,
  patient_id uuid not null references public.care_patients(id) on delete cascade,
  clinician_user_id uuid not null references auth.users(id),
  clinician_coverage_id uuid not null
    references public.care_clinician_state_coverage(id),
  action text not null check (action in ('assigned', 'reassigned')),
  assigned_by uuid not null references auth.users(id),
  idempotency_key text not null check (length(idempotency_key) between 8 and 128),
  occurred_at timestamptz not null default now(),
  unique (appointment_id, idempotency_key)
);

create table if not exists public.care_clinician_reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.care_appointments(id)
    on delete cascade,
  patient_id uuid not null references public.care_patients(id) on delete cascade,
  assigned_clinician_user_id uuid not null references auth.users(id),
  patient_state_code text not null check (patient_state_code ~ '^[A-Z]{2}$'),
  status text not null default 'assigned'
    check (status in (
      'assigned', 'in_review', 'awaiting_information', 'awaiting_labs',
      'follow_up', 'decided'
    )),
  final_decision text null
    check (final_decision is null or final_decision in (
      'approved', 'declined', 'no_treatment'
    )),
  final_decision_source text null
    check (
      final_decision_source is null
      or final_decision_source = 'human_clinician'
    ),
  version integer not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'decided'
      and final_decision is not null
      and final_decision_source = 'human_clinician')
    or
    (status <> 'decided'
      and final_decision is null
      and final_decision_source is null)
  )
);

create table if not exists public.care_clinician_review_events (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.care_clinician_reviews(id)
    on delete cascade,
  appointment_id uuid not null references public.care_appointments(id)
    on delete cascade,
  patient_id uuid not null references public.care_patients(id) on delete cascade,
  clinician_user_id uuid not null references auth.users(id),
  actor_kind text not null check (actor_kind = 'human_clinician'),
  action text not null check (action in (
    'review', 'request_information', 'request_labs', 'follow_up',
    'approve', 'decline', 'no_treatment'
  )),
  from_status text not null,
  to_status text not null,
  final_decision text null,
  idempotency_key text not null check (length(idempotency_key) between 8 and 128),
  occurred_at timestamptz not null default now(),
  unique (review_id, idempotency_key)
);

create table if not exists public.care_appointment_reminders (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.care_appointments(id)
    on delete cascade,
  patient_id uuid not null references public.care_patients(id) on delete cascade,
  due_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'dispatched', 'cancelled', 'failed')),
  template_key text not null default 'care_appointment_reminder'
    check (template_key = 'care_appointment_reminder'),
  dispatch_idempotency_key text not null
    check (length(dispatch_idempotency_key) between 8 and 180),
  created_at timestamptz not null default now(),
  dispatched_at timestamptz null,
  unique (dispatch_idempotency_key)
);

create index if not exists care_appointments_patient_time_idx
  on public.care_appointments (patient_id, created_at desc);
create index if not exists care_appointments_clinician_time_idx
  on public.care_appointments (assigned_clinician_user_id, created_at desc);
create index if not exists care_appointment_events_time_idx
  on public.care_appointment_events (appointment_id, occurred_at desc);
create index if not exists care_reviews_clinician_time_idx
  on public.care_clinician_reviews (
    assigned_clinician_user_id,
    updated_at desc
  );
create index if not exists care_reminders_pending_due_idx
  on public.care_appointment_reminders (due_at)
  where status = 'pending';

create or replace function public.care_audit_clinical_configuration()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  record_key text;
  record_type text;
  record_json jsonb;
begin
  record_type := case tg_table_name
    when 'care_medical_groups' then 'medical_group'
    when 'care_clinician_profiles' then 'clinician_profile'
    when 'care_clinician_licenses' then 'clinician_license'
    when 'care_scheduling_providers' then 'scheduling_provider'
  end;
  record_json := coalesce(to_jsonb(new), to_jsonb(old));
  record_key := case tg_table_name
    when 'care_medical_groups' then record_json ->> 'id'
    when 'care_clinician_profiles' then record_json ->> 'clinician_user_id'
    when 'care_clinician_licenses' then record_json ->> 'id'
    when 'care_scheduling_providers' then record_json ->> 'provider_key'
  end;
  insert into public.care_clinical_configuration_audit (
    record_type,
    record_key,
    action,
    old_record,
    new_record
  )
  values (
    record_type,
    record_key,
    lower(tg_op),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.care_audit_clinical_configuration()
  from public, anon, authenticated;

do $$
declare
  table_name text;
  trigger_name text;
begin
  foreach table_name in array array[
    'care_medical_groups',
    'care_clinician_profiles',
    'care_clinician_licenses',
    'care_scheduling_providers'
  ]
  loop
    trigger_name := table_name || '_audit_write';
    execute format('drop trigger if exists %I on public.%I', trigger_name, table_name);
    execute format(
      'create trigger %I after insert or update or delete on public.%I
       for each row execute function public.care_audit_clinical_configuration()',
      trigger_name,
      table_name
    );
  end loop;
end;
$$;

drop trigger if exists care_clinical_configuration_audit_append_only
  on public.care_clinical_configuration_audit;
create trigger care_clinical_configuration_audit_append_only
before update or delete on public.care_clinical_configuration_audit
for each row execute function public.care_reject_immutable_mutation();

do $$
declare
  table_name text;
  trigger_name text;
begin
  foreach table_name in array array[
    'care_appointment_events',
    'care_clinician_assignment_events',
    'care_clinician_review_events'
  ]
  loop
    trigger_name := table_name || '_append_only';
    execute format('drop trigger if exists %I on public.%I', trigger_name, table_name);
    execute format(
      'create trigger %I before update or delete on public.%I
       for each row execute function public.care_reject_immutable_mutation()',
      trigger_name,
      table_name
    );
  end loop;
end;
$$;

create or replace function public.care_clinician_ready(
  p_clinician_user_id uuid,
  p_state_code text,
  p_as_of timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.care_clinician_profiles profile
    join public.care_medical_groups medical_group
      on medical_group.id = profile.medical_group_id
      and medical_group.verification_state = 'verified'
    join public.care_clinician_licenses license
      on license.clinician_user_id = profile.clinician_user_id
      and license.state_code = p_state_code
      and license.verification_state = 'verified'
      and license.expires_at > p_as_of
    join public.care_clinician_state_coverage coverage
      on coverage.clinician_user_id = profile.clinician_user_id
      and coverage.state_code = p_state_code
      and coverage.active
      and (coverage.expires_at is null or coverage.expires_at > p_as_of)
    join public.care_role_assignments assignment
      on assignment.user_id = profile.clinician_user_id
      and assignment.role = 'clinician'
      and assignment.revoked_at is null
    where profile.clinician_user_id = p_clinician_user_id
      and profile.verification_state = 'verified'
      and profile.privacy_access_approved
      and profile.clinical_role_approved
  );
$$;

revoke all on function public.care_clinician_ready(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.care_clinician_ready(uuid, text, timestamptz)
  to service_role;

create or replace function public.care_operational_clinician_ready(
  p_state_code text,
  p_as_of timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.care_clinician_profiles profile
    where public.care_clinician_ready(
      profile.clinician_user_id,
      p_state_code,
      p_as_of
    )
  );
$$;

revoke all on function public.care_operational_clinician_ready(
  text, timestamptz
) from public, anon, authenticated;
grant execute on function public.care_operational_clinician_ready(
  text, timestamptz
) to service_role;

create or replace function public.care_appointment_consents_current(
  p_intake_id uuid,
  p_patient_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  intake_row public.care_intakes%rowtype;
begin
  perform 1
  from public.care_patients patient
  where patient.id = p_patient_id
  for update;
  if not found then return false; end if;

  select * into intake_row
  from public.care_intakes
  where id = p_intake_id
    and patient_id = p_patient_id
    and status = 'submitted'
  for share;
  if not found then return false; end if;

  perform 1
  from public.care_consent_events event
  where event.id in (
    intake_row.telehealth_consent_event_id,
    intake_row.privacy_consent_event_id
  )
  for share;
  perform 1
  from public.care_consent_documents document
  where document.id in (
    select event.document_id
    from public.care_consent_events event
    where event.id in (
      intake_row.telehealth_consent_event_id,
      intake_row.privacy_consent_event_id
    )
  )
  for share;

  return exists (
    select 1
    from public.care_consent_events event
    join public.care_consent_documents document
      on document.id = event.document_id
     and document.kind = event.kind
     and document.version = event.document_version
    where event.id = intake_row.telehealth_consent_event_id
      and event.patient_id = p_patient_id
      and event.kind = 'telehealth'
      and event.action = 'granted'
      and document.status = 'approved'
      and document.approved_at is not null
      and document.effective_at is not null
      and event.id = (
        select latest.id
        from public.care_consent_events latest
        where latest.patient_id = p_patient_id
          and latest.kind = 'telehealth'
        order by latest.occurred_at desc, latest.id desc
        limit 1
      )
  ) and exists (
    select 1
    from public.care_consent_events event
    join public.care_consent_documents document
      on document.id = event.document_id
     and document.kind = event.kind
     and document.version = event.document_version
    where event.id = intake_row.privacy_consent_event_id
      and event.patient_id = p_patient_id
      and event.kind = 'privacy_notice'
      and event.action = 'granted'
      and document.status = 'approved'
      and document.approved_at is not null
      and document.effective_at is not null
      and event.id = (
        select latest.id
        from public.care_consent_events latest
        where latest.patient_id = p_patient_id
          and latest.kind = 'privacy_notice'
        order by latest.occurred_at desc, latest.id desc
        limit 1
      )
  );
end;
$$;

revoke all on function public.care_appointment_consents_current(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.care_supported_state_current(
  p_state_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1
  from public.care_supported_states state
  where state.state_code = p_state_code
  for share;

  return exists (
    select 1
    from public.care_supported_states state
    where state.state_code = p_state_code
      and state.supported_state_active
      and state.service_coverage_active
      and state.approved_by is not null
      and state.approved_at is not null
  );
end;
$$;

revoke all on function public.care_supported_state_current(text)
  from public, anon, authenticated;

create or replace function public.care_request_appointment(
  p_patient_id uuid,
  p_intake_id uuid,
  p_idempotency_key text,
  p_occurred_at timestamptz
)
returns public.care_appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  appointment_row public.care_appointments%rowtype;
  location_row public.care_patient_locations%rowtype;
begin
  if not exists (
    select 1
    from public.care_intakes intake
    where intake.id = p_intake_id
      and intake.patient_id = p_patient_id
      and intake.status = 'submitted'
  ) then
    raise exception 'care_submitted_intake_required'
      using errcode = '23514';
  end if;
  if not public.care_appointment_consents_current(
    p_intake_id,
    p_patient_id
  ) then
    raise exception 'care_current_consent_required'
      using errcode = '23514';
  end if;

  select * into location_row
  from public.care_patient_locations
  where patient_id = p_patient_id
  order by attested_at desc, id desc
  limit 1;
  if not found then
    raise exception 'care_current_location_required'
      using errcode = '23514';
  end if;
  if not public.care_supported_state_current(location_row.state_code) then
    raise exception 'care_supported_state_required'
      using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.care_scheduling_providers provider
    where provider.verification_state = 'verified'
      and provider.scheduling_active
      and provider.telehealth_active
      and cardinality(provider.reminder_offsets_minutes) > 0
  ) then
    raise exception 'care_scheduling_provider_required'
      using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.care_clinician_profiles profile
    where public.care_clinician_ready(
      profile.clinician_user_id,
      location_row.state_code,
      p_occurred_at
    )
  ) then
    raise exception 'care_verified_clinician_coverage_required'
      using errcode = '23514';
  end if;

  select * into appointment_row
  from public.care_appointments
  where patient_id = p_patient_id
    and request_idempotency_key = p_idempotency_key;
  if found then return appointment_row; end if;

  insert into public.care_appointments (
    patient_id,
    intake_id,
    patient_location_id,
    patient_state_code,
    request_idempotency_key,
    created_at,
    updated_at
  )
  values (
    p_patient_id,
    p_intake_id,
    location_row.id,
    location_row.state_code,
    p_idempotency_key,
    p_occurred_at,
    p_occurred_at
  )
  returning * into appointment_row;

  insert into public.care_appointment_events (
    appointment_id,
    patient_id,
    actor_user_id,
    actor_role,
    action,
    from_status,
    to_status,
    idempotency_key,
    occurred_at
  )
  values (
    appointment_row.id,
    p_patient_id,
    (select user_id from public.care_patients where id = p_patient_id),
    'care_patient',
    'requested',
    null,
    'requested',
    p_idempotency_key,
    p_occurred_at
  );
  return appointment_row;
end;
$$;

create or replace function public.care_assign_clinician(
  p_appointment_id uuid,
  p_clinician_user_id uuid,
  p_admin_user_id uuid,
  p_idempotency_key text,
  p_occurred_at timestamptz
)
returns public.care_appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  appointment_row public.care_appointments%rowtype;
  coverage_id uuid;
  assignment_action text;
  existing_review_status text;
begin
  select appointment.* into appointment_row
  from public.care_appointments appointment
  where appointment.id = p_appointment_id
  for update;
  if not found then
    raise exception 'care_appointment_not_found' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.care_role_assignments assignment
    where assignment.user_id = p_admin_user_id
      and assignment.role = 'clinical_admin'
      and assignment.revoked_at is null
  ) then
    raise exception 'care_clinical_admin_required' using errcode = '42501';
  end if;
  if not public.care_appointment_consents_current(
    appointment_row.intake_id,
    appointment_row.patient_id
  ) then
    raise exception 'care_current_consent_required'
      using errcode = '23514';
  end if;
  if appointment_row.patient_location_id <> (
    select location.id
    from public.care_patient_locations location
    where location.patient_id = appointment_row.patient_id
    order by location.attested_at desc, location.id desc
    limit 1
  ) then
    raise exception 'care_patient_location_changed'
      using errcode = '23514';
  end if;
  if not public.care_supported_state_current(
    appointment_row.patient_state_code
  ) then
    raise exception 'care_supported_state_required'
      using errcode = '23514';
  end if;
  if exists (
    select 1 from public.care_clinician_assignment_events event
    where event.appointment_id = p_appointment_id
      and event.idempotency_key = p_idempotency_key
      and event.clinician_user_id = p_clinician_user_id
  ) then
    return appointment_row;
  end if;
  if appointment_row.status not in ('requested', 'scheduled', 'no_show') then
    raise exception 'care_appointment_assignment_unavailable'
      using errcode = '55000';
  end if;
  select review.status into existing_review_status
  from public.care_clinician_reviews review
  where review.appointment_id = p_appointment_id;
  if existing_review_status = 'decided' then
    raise exception 'care_decided_review_assignment_immutable'
      using errcode = '55000';
  end if;
  if not public.care_clinician_ready(
    p_clinician_user_id,
    appointment_row.patient_state_code,
    p_occurred_at
  ) then
    raise exception 'care_verified_clinician_coverage_required'
      using errcode = '23514';
  end if;
  select coverage.id into coverage_id
  from public.care_clinician_state_coverage coverage
  where coverage.clinician_user_id = p_clinician_user_id
    and coverage.state_code = appointment_row.patient_state_code
    and coverage.active
    and (coverage.expires_at is null or coverage.expires_at > p_occurred_at)
  limit 1;

  assignment_action := case
    when appointment_row.assigned_clinician_user_id is null then 'assigned'
    else 'reassigned'
  end;
  update public.care_appointments
  set
    assigned_clinician_user_id = p_clinician_user_id,
    clinician_coverage_id = coverage_id,
    version = version + 1,
    updated_at = p_occurred_at
  where id = p_appointment_id
  returning * into appointment_row;

  insert into public.care_clinician_assignment_events (
    appointment_id,
    patient_id,
    clinician_user_id,
    clinician_coverage_id,
    action,
    assigned_by,
    idempotency_key,
    occurred_at
  )
  values (
    p_appointment_id,
    appointment_row.patient_id,
    p_clinician_user_id,
    coverage_id,
    assignment_action,
    p_admin_user_id,
    p_idempotency_key,
    p_occurred_at
  );
  insert into public.care_appointment_events (
    appointment_id,
    patient_id,
    actor_user_id,
    actor_role,
    action,
    from_status,
    to_status,
    idempotency_key,
    occurred_at
  )
  values (
    p_appointment_id,
    appointment_row.patient_id,
    p_admin_user_id,
    'clinical_admin',
    assignment_action,
    appointment_row.status,
    appointment_row.status,
    p_idempotency_key || '-appointment',
    p_occurred_at
  );

  insert into public.care_clinician_reviews (
    appointment_id,
    patient_id,
    assigned_clinician_user_id,
    patient_state_code,
    created_at,
    updated_at
  )
  values (
    p_appointment_id,
    appointment_row.patient_id,
    p_clinician_user_id,
    appointment_row.patient_state_code,
    p_occurred_at,
    p_occurred_at
  )
  on conflict (appointment_id) do update
  set
    assigned_clinician_user_id = excluded.assigned_clinician_user_id,
    version = public.care_clinician_reviews.version + 1,
    updated_at = excluded.updated_at
  where public.care_clinician_reviews.status <> 'decided';
  return appointment_row;
end;
$$;

create or replace function public.care_schedule_appointment(
  p_appointment_id uuid,
  p_admin_user_id uuid,
  p_expected_version integer,
  p_provider_key text,
  p_provider_session_reference text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_idempotency_key text,
  p_occurred_at timestamptz
)
returns public.care_appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  appointment_row public.care_appointments%rowtype;
  prior_status text;
  transition_action text;
  reminder_offset integer;
begin
  select appointment.* into appointment_row
  from public.care_appointments appointment
  where appointment.id = p_appointment_id
  for update;
  if not found then
    raise exception 'care_appointment_not_found' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.care_role_assignments assignment
    where assignment.user_id = p_admin_user_id
      and assignment.role = 'clinical_admin'
      and assignment.revoked_at is null
  ) then
    raise exception 'care_clinical_admin_required' using errcode = '42501';
  end if;
  if not public.care_appointment_consents_current(
    appointment_row.intake_id,
    appointment_row.patient_id
  ) then
    raise exception 'care_current_consent_required'
      using errcode = '23514';
  end if;
  if appointment_row.patient_location_id <> (
    select location.id from public.care_patient_locations location
    where location.patient_id = appointment_row.patient_id
    order by location.attested_at desc, location.id desc limit 1
  ) then
    raise exception 'care_patient_location_changed'
      using errcode = '23514';
  end if;
  if not public.care_supported_state_current(
    appointment_row.patient_state_code
  ) then
    raise exception 'care_supported_state_required'
      using errcode = '23514';
  end if;
  if exists (
    select 1 from public.care_appointment_events event
    where event.appointment_id = p_appointment_id
      and event.idempotency_key = p_idempotency_key
      and event.action in ('scheduled', 'rescheduled')
  ) then
    return appointment_row;
  end if;
  if appointment_row.version <> p_expected_version then
    raise exception 'care_appointment_version_conflict'
      using errcode = '40001';
  end if;
  if appointment_row.status not in ('requested', 'scheduled', 'no_show')
    or appointment_row.assigned_clinician_user_id is null then
    raise exception 'care_appointment_not_schedulable'
      using errcode = '55000';
  end if;
  if p_starts_at <= p_occurred_at or p_ends_at <= p_starts_at then
    raise exception 'care_valid_schedule_window_required'
      using errcode = '22023';
  end if;
  if length(trim(p_provider_session_reference)) < 8 then
    raise exception 'care_telehealth_session_reference_required'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.care_scheduling_providers provider
    where provider.provider_key = p_provider_key
      and provider.verification_state = 'verified'
      and provider.scheduling_active
      and provider.telehealth_active
      and cardinality(provider.reminder_offsets_minutes) > 0
  ) then
    raise exception 'care_scheduling_provider_required'
      using errcode = '23514';
  end if;
  if not public.care_clinician_ready(
    appointment_row.assigned_clinician_user_id,
    appointment_row.patient_state_code,
    p_occurred_at
  ) then
    raise exception 'care_verified_clinician_coverage_required'
      using errcode = '23514';
  end if;

  prior_status := appointment_row.status;
  transition_action := case
    when appointment_row.status = 'requested' then 'scheduled'
    else 'rescheduled'
  end;
  update public.care_telehealth_sessions
  set status = 'superseded', superseded_at = p_occurred_at
  where appointment_id = p_appointment_id and status = 'ready';
  insert into public.care_telehealth_sessions (
    appointment_id,
    provider_key,
    provider_session_reference,
    created_by,
    created_at
  )
  values (
    p_appointment_id,
    p_provider_key,
    p_provider_session_reference,
    p_admin_user_id,
    p_occurred_at
  );

  update public.care_appointment_reminders
  set status = 'cancelled'
  where appointment_id = p_appointment_id and status = 'pending';
  for reminder_offset in
    select unnest(provider.reminder_offsets_minutes)
    from public.care_scheduling_providers provider
    where provider.provider_key = p_provider_key
  loop
    if p_starts_at - make_interval(mins => reminder_offset) > p_occurred_at then
      insert into public.care_appointment_reminders (
        appointment_id,
        patient_id,
        due_at,
        dispatch_idempotency_key,
        created_at
      )
      values (
        p_appointment_id,
        appointment_row.patient_id,
        p_starts_at - make_interval(mins => reminder_offset),
        p_appointment_id::text || ':' || p_starts_at::text || ':' || reminder_offset,
        p_occurred_at
      );
    end if;
  end loop;

  update public.care_appointments
  set
    status = 'scheduled',
    starts_at = p_starts_at,
    ends_at = p_ends_at,
    version = version + 1,
    updated_at = p_occurred_at
  where id = p_appointment_id
  returning * into appointment_row;
  insert into public.care_appointment_events (
    appointment_id,
    patient_id,
    actor_user_id,
    actor_role,
    action,
    from_status,
    to_status,
    idempotency_key,
    occurred_at
  )
  values (
    p_appointment_id,
    appointment_row.patient_id,
    p_admin_user_id,
    'clinical_admin',
    transition_action,
    prior_status,
    'scheduled',
    p_idempotency_key,
    p_occurred_at
  );
  return appointment_row;
end;
$$;

create or replace function public.care_patient_appointment_action(
  p_appointment_id uuid,
  p_patient_id uuid,
  p_expected_version integer,
  p_action text,
  p_idempotency_key text,
  p_occurred_at timestamptz
)
returns public.care_appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  appointment_row public.care_appointments%rowtype;
  prior_status text;
  next_status text;
begin
  select appointment.* into appointment_row
  from public.care_appointments appointment
  where appointment.id = p_appointment_id
  for update;
  if not found or appointment_row.patient_id <> p_patient_id then
    raise exception 'care_appointment_not_found' using errcode = '42501';
  end if;
  if p_action = 'check_in' then
    if not public.care_appointment_consents_current(
      appointment_row.intake_id,
      appointment_row.patient_id
    ) then
      raise exception 'care_current_consent_required'
        using errcode = '23514';
    end if;
    if appointment_row.patient_location_id <> (
      select location.id from public.care_patient_locations location
      where location.patient_id = appointment_row.patient_id
      order by location.attested_at desc, location.id desc limit 1
    ) then
      raise exception 'care_patient_location_changed'
        using errcode = '23514';
    end if;
    if not public.care_supported_state_current(
      appointment_row.patient_state_code
    ) then
      raise exception 'care_supported_state_required'
        using errcode = '23514';
    end if;
  end if;
  if exists (
    select 1 from public.care_appointment_events event
    where event.appointment_id = p_appointment_id
      and event.idempotency_key = p_idempotency_key
      and event.action = case p_action
        when 'cancel' then 'cancelled'
        when 'check_in' then 'checked_in'
      end
  ) then
    return appointment_row;
  end if;
  if appointment_row.version <> p_expected_version then
    raise exception 'care_appointment_version_conflict'
      using errcode = '40001';
  end if;
  if p_action = 'cancel'
    and appointment_row.status in ('requested', 'scheduled') then
    next_status := 'cancelled';
  elsif p_action = 'check_in' and appointment_row.status = 'scheduled' then
    next_status := 'checked_in';
  else
    raise exception 'care_invalid_appointment_transition'
      using errcode = '55000';
  end if;
  prior_status := appointment_row.status;
  update public.care_appointments
  set
    status = next_status,
    starts_at = case when next_status = 'cancelled' then null else starts_at end,
    ends_at = case when next_status = 'cancelled' then null else ends_at end,
    version = version + 1,
    updated_at = p_occurred_at
  where id = p_appointment_id
  returning * into appointment_row;
  if next_status = 'cancelled' then
    update public.care_appointment_reminders
    set status = 'cancelled'
    where appointment_id = p_appointment_id and status = 'pending';
    update public.care_telehealth_sessions
    set status = 'cancelled'
    where appointment_id = p_appointment_id and status = 'ready';
  end if;
  insert into public.care_appointment_events (
    appointment_id, patient_id, actor_user_id, actor_role, action,
    from_status, to_status, idempotency_key, occurred_at
  )
  values (
    p_appointment_id,
    p_patient_id,
    (select user_id from public.care_patients where id = p_patient_id),
    'care_patient',
    next_status,
    prior_status,
    next_status,
    p_idempotency_key,
    p_occurred_at
  );
  return appointment_row;
end;
$$;

create or replace function public.care_clinician_complete_appointment(
  p_appointment_id uuid,
  p_clinician_user_id uuid,
  p_expected_version integer,
  p_idempotency_key text,
  p_occurred_at timestamptz
)
returns public.care_appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  appointment_row public.care_appointments%rowtype;
  prior_status text;
begin
  select appointment.* into appointment_row
  from public.care_appointments appointment
  where appointment.id = p_appointment_id
  for update;
  if not found
    or appointment_row.assigned_clinician_user_id <> p_clinician_user_id then
    raise exception 'care_assigned_clinician_required'
      using errcode = '42501';
  end if;
  if exists (
    select 1 from public.care_appointment_events event
    where event.appointment_id = p_appointment_id
      and event.idempotency_key = p_idempotency_key
      and event.action = 'completed'
  ) then
    return appointment_row;
  end if;
  if appointment_row.version <> p_expected_version then
    raise exception 'care_appointment_version_conflict'
      using errcode = '40001';
  end if;
  if appointment_row.status <> 'checked_in' then
    raise exception 'care_appointment_completion_unavailable'
      using errcode = '55000';
  end if;
  if not public.care_clinician_ready(
    p_clinician_user_id,
    appointment_row.patient_state_code,
    p_occurred_at
  ) then
    raise exception 'care_verified_clinician_coverage_required'
      using errcode = '23514';
  end if;
  update public.care_appointments
  set status = 'completed', version = version + 1, updated_at = p_occurred_at
  where id = p_appointment_id
  returning * into appointment_row;
  update public.care_telehealth_sessions
  set status = 'closed'
  where appointment_id = p_appointment_id and status = 'ready';
  insert into public.care_appointment_events (
    appointment_id, patient_id, actor_user_id, actor_role, action,
    from_status, to_status, idempotency_key, occurred_at
  )
  values (
    p_appointment_id,
    appointment_row.patient_id,
    p_clinician_user_id,
    'clinician',
    'completed',
    'checked_in',
    'completed',
    p_idempotency_key,
    p_occurred_at
  );
  return appointment_row;
end;
$$;

create or replace function public.care_apply_clinician_review_action(
  p_review_id uuid,
  p_clinician_user_id uuid,
  p_actor_kind text,
  p_expected_version integer,
  p_action text,
  p_idempotency_key text,
  p_occurred_at timestamptz
)
returns public.care_clinician_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  review_row public.care_clinician_reviews%rowtype;
  appointment_status text;
  next_status text;
  decision text;
  prior_status text;
begin
  select review.* into review_row
  from public.care_clinician_reviews review
  where review.id = p_review_id
  for update;
  if not found or review_row.assigned_clinician_user_id <> p_clinician_user_id then
    raise exception 'care_assigned_clinician_required'
      using errcode = '42501';
  end if;
  if exists (
    select 1 from public.care_clinician_review_events event
    where event.review_id = p_review_id
      and event.idempotency_key = p_idempotency_key
      and event.action = p_action
  ) then
    return review_row;
  end if;
  if p_actor_kind <> 'human_clinician' then
    raise exception 'care_human_clinician_required'
      using errcode = '42501';
  end if;
  if review_row.version <> p_expected_version then
    raise exception 'care_review_version_conflict'
      using errcode = '40001';
  end if;
  if review_row.status = 'decided' then
    raise exception 'care_review_already_decided'
      using errcode = '55000';
  end if;
  if not public.care_clinician_ready(
    p_clinician_user_id,
    review_row.patient_state_code,
    p_occurred_at
  ) then
    raise exception 'care_verified_clinician_coverage_required'
      using errcode = '23514';
  end if;
  select appointment.status into appointment_status
  from public.care_appointments appointment
  where appointment.id = review_row.appointment_id;
  next_status := case p_action
    when 'review' then 'in_review'
    when 'request_information' then 'awaiting_information'
    when 'request_labs' then 'awaiting_labs'
    when 'follow_up' then 'follow_up'
    when 'approve' then 'decided'
    when 'decline' then 'decided'
    when 'no_treatment' then 'decided'
  end;
  if next_status is null then
    raise exception 'care_invalid_review_action' using errcode = '22023';
  end if;
  decision := case p_action
    when 'approve' then 'approved'
    when 'decline' then 'declined'
    when 'no_treatment' then 'no_treatment'
    else null
  end;
  if decision is not null and appointment_status <> 'completed' then
    raise exception 'care_appointment_completion_required'
      using errcode = '23514';
  end if;
  prior_status := review_row.status;
  update public.care_clinician_reviews
  set
    status = next_status,
    final_decision = decision,
    final_decision_source = case
      when decision is null then null
      else 'human_clinician'
    end,
    version = version + 1,
    updated_at = p_occurred_at
  where id = p_review_id
  returning * into review_row;
  insert into public.care_clinician_review_events (
    review_id,
    appointment_id,
    patient_id,
    clinician_user_id,
    actor_kind,
    action,
    from_status,
    to_status,
    final_decision,
    idempotency_key,
    occurred_at
  )
  values (
    p_review_id,
    review_row.appointment_id,
    review_row.patient_id,
    p_clinician_user_id,
    'human_clinician',
    p_action,
    prior_status,
    next_status,
    decision,
    p_idempotency_key,
    p_occurred_at
  );
  return review_row;
end;
$$;

create or replace function public.care_admin_mark_no_show(
  p_appointment_id uuid,
  p_admin_user_id uuid,
  p_expected_version integer,
  p_idempotency_key text,
  p_occurred_at timestamptz
)
returns public.care_appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  appointment_row public.care_appointments%rowtype;
  prior_status text;
begin
  select appointment.* into appointment_row
  from public.care_appointments appointment
  where appointment.id = p_appointment_id
  for update;
  if not found then
    raise exception 'care_appointment_not_found' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.care_role_assignments assignment
    where assignment.user_id = p_admin_user_id
      and assignment.role = 'clinical_admin'
      and assignment.revoked_at is null
  ) then
    raise exception 'care_clinical_admin_required' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.care_appointment_events event
    where event.appointment_id = p_appointment_id
      and event.idempotency_key = p_idempotency_key
      and event.action = 'no_show'
  ) then
    return appointment_row;
  end if;
  if appointment_row.version <> p_expected_version then
    raise exception 'care_appointment_version_conflict'
      using errcode = '40001';
  end if;
  if appointment_row.status <> 'scheduled'
    or appointment_row.starts_at is null
    or p_occurred_at < appointment_row.starts_at then
    raise exception 'care_no_show_unavailable' using errcode = '55000';
  end if;
  prior_status := appointment_row.status;
  update public.care_appointments
  set
    status = 'no_show',
    version = version + 1,
    updated_at = p_occurred_at
  where id = p_appointment_id
  returning * into appointment_row;
  update public.care_appointment_reminders
  set status = 'cancelled'
  where appointment_id = p_appointment_id and status = 'pending';
  update public.care_telehealth_sessions
  set status = 'closed'
  where appointment_id = p_appointment_id and status = 'ready';
  insert into public.care_appointment_events (
    appointment_id, patient_id, actor_user_id, actor_role, action,
    from_status, to_status, idempotency_key, occurred_at
  )
  values (
    p_appointment_id,
    appointment_row.patient_id,
    p_admin_user_id,
    'clinical_admin',
    'no_show',
    prior_status,
    'no_show',
    p_idempotency_key,
    p_occurred_at
  );
  return appointment_row;
end;
$$;

revoke all on function public.care_request_appointment(
  uuid, uuid, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.care_assign_clinician(
  uuid, uuid, uuid, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.care_schedule_appointment(
  uuid, uuid, integer, text, text, timestamptz, timestamptz, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.care_patient_appointment_action(
  uuid, uuid, integer, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.care_clinician_complete_appointment(
  uuid, uuid, integer, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.care_apply_clinician_review_action(
  uuid, uuid, text, integer, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.care_admin_mark_no_show(
  uuid, uuid, integer, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.care_request_appointment(
  uuid, uuid, text, timestamptz
) to service_role;
grant execute on function public.care_assign_clinician(
  uuid, uuid, uuid, text, timestamptz
) to service_role;
grant execute on function public.care_schedule_appointment(
  uuid, uuid, integer, text, text, timestamptz, timestamptz, text, timestamptz
) to service_role;
grant execute on function public.care_patient_appointment_action(
  uuid, uuid, integer, text, text, timestamptz
) to service_role;
grant execute on function public.care_clinician_complete_appointment(
  uuid, uuid, integer, text, timestamptz
) to service_role;
grant execute on function public.care_apply_clinician_review_action(
  uuid, uuid, text, integer, text, text, timestamptz
) to service_role;
grant execute on function public.care_admin_mark_no_show(
  uuid, uuid, integer, text, timestamptz
) to service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
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
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format(
      'revoke all on table public.%I from public, anon, authenticated',
      table_name
    );
  end loop;
end;
$$;

-- Rollback (manual and intentionally not executed):
-- 1. Keep Care disabled and remove PR 3 route registration.
-- 2. Preserve appointment, clinician-review, configuration, and audit records
--    under the approved clinical retention/correction process.
-- 3. Revoke service_role execution on PR 3 functions.
-- 4. Drop PR 3 functions and triggers.
-- 5. Drop PR 3 tables in reverse dependency order only after verified export.
-- 6. Never cascade into Auth, PR 1/2 Care objects, or Research objects.
