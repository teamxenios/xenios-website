-- Xenios Care foundation
-- Additive, idempotent, disabled by default, and intentionally free of
-- clinical content, products, doses, directions, or provider integrations.

create extension if not exists pgcrypto;

create table if not exists public.care_capabilities (
  capability_key text primary key,
  state text not null default 'disabled'
    check (state in ('disabled','pending_contract','pending_coverage','pending_credentials',
      'pending_content','pending_pharmacy','pending_clinicians','pending_qa','enabled')),
  approved_by uuid null,
  approved_at timestamptz null,
  updated_at timestamptz not null default now(),
  check (
    state <> 'enabled'
    or (approved_by is not null and approved_at is not null)
  )
);

insert into public.care_capabilities (capability_key, state)
values ('care', 'disabled')
on conflict (capability_key) do nothing;

create table if not exists public.care_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role text not null check (role in (
    'care_patient','clinician','clinical_admin','pharmacy_operations',
    'lab_reviewer','clinical_support','care_security_admin'
  )),
  granted_by uuid not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz null,
  unique (user_id, role)
);

create table if not exists public.care_medical_groups (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending_contract'
    check (status in ('pending_contract','pending_credentials','active','inactive')),
  created_at timestamptz not null default now()
);

create table if not exists public.care_clinicians (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  medical_group_id uuid not null references public.care_medical_groups(id),
  status text not null default 'pending_credentials'
    check (status in ('pending_credentials','active','suspended','inactive')),
  created_at timestamptz not null default now()
);

create table if not exists public.care_clinician_coverage (
  clinician_id uuid not null references public.care_clinicians(id),
  state_code text not null check (state_code ~ '^[A-Z]{2}$'),
  service_available boolean not null default false,
  starts_at timestamptz null,
  ends_at timestamptz null,
  primary key (clinician_id, state_code),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.care_patients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  status text not null default 'pending'
    check (status in ('pending','eligible','active','inactive','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.care_consents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.care_patients(id),
  kind text not null check (kind in ('eligibility','clinical_intake','telehealth','lab_share','secure_messaging')),
  version integer not null check (version > 0),
  granted_at timestamptz not null,
  revoked_at timestamptz null,
  unique (patient_id, kind, version),
  check (revoked_at is null or revoked_at >= granted_at)
);

create table if not exists public.care_eligibility_checks (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.care_patients(id),
  physical_state text null check (physical_state is null or physical_state ~ '^[A-Z]{2}$'),
  location_verified_at timestamptz null,
  identity_verified_at timestamptz null,
  consent_id uuid null references public.care_consents(id),
  decision text not null check (decision in (
    'eligible','care_disabled','location_unverified','unsupported_state',
    'clinician_unavailable','service_unavailable','identity_unverified','consent_required'
  )),
  evaluated_at timestamptz not null default now()
);

create table if not exists public.care_intake_instances (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.care_patients(id),
  consent_id uuid not null references public.care_consents(id),
  definition_version text not null,
  status text not null default 'draft' check (status in ('draft','submitted','superseded')),
  created_at timestamptz not null default now(),
  submitted_at timestamptz null
);

create table if not exists public.care_appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.care_patients(id),
  clinician_id uuid null references public.care_clinicians(id),
  state text not null default 'requested'
    check (state in ('requested','scheduled','checked_in','completed','cancelled','no_show')),
  mode text not null default 'telehealth' check (mode = 'telehealth'),
  starts_at timestamptz null,
  created_at timestamptz not null default now()
);

create table if not exists public.care_clinician_reviews (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.care_patients(id),
  intake_id uuid not null references public.care_intake_instances(id),
  assigned_clinician_id uuid not null references public.care_clinicians(id),
  status text not null default 'assigned'
    check (status in ('assigned','in_review','awaiting_information','awaiting_labs','decided')),
  last_action text null check (last_action is null or last_action in (
    'review','request_information','request_labs','approve','decline','no_treatment',
    'follow_up','draft_care_plan','prepare_prescription'
  )),
  final_decision_source text null check (final_decision_source is null or final_decision_source = 'human_clinician'),
  updated_at timestamptz not null default now()
);

create table if not exists public.care_clinical_orders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.care_patients(id),
  review_id uuid not null references public.care_clinician_reviews(id),
  ordered_by_clinician_id uuid not null references public.care_clinicians(id),
  kind text not null check (kind in ('lab','pharmacy','follow_up')),
  status text not null default 'draft' check (status in ('draft','placed','cancelled','completed')),
  created_at timestamptz not null default now()
);

create table if not exists public.care_prescriptions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.care_patients(id),
  clinician_id uuid not null references public.care_clinicians(id),
  review_id uuid not null references public.care_clinician_reviews(id),
  status text not null default 'draft'
    check (status in ('draft','signed','sent_to_pharmacy','cancelled','expired')),
  formulation_ref text null,
  concentration_ref text null,
  created_at timestamptz not null default now()
);

create table if not exists public.care_pharmacy_assignments (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.care_prescriptions(id),
  patient_id uuid not null references public.care_patients(id),
  pharmacy_organization_id uuid null,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.care_instruction_bindings (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.care_patients(id),
  prescription_id uuid not null references public.care_prescriptions(id),
  pharmacy_assignment_id uuid not null references public.care_pharmacy_assignments(id),
  formulation_ref text not null,
  concentration_ref text not null,
  kind text not null check (kind in (
    'pharmacy_label','pharmacy_patient_info','clinician_direction','manufacturer_material',
    'general_education','device_instruction','disposal','emergency_notice'
  )),
  version integer not null check (version > 0),
  is_current boolean not null default false,
  material_ref text null,
  unique (prescription_id, pharmacy_assignment_id, kind, version)
);

create unique index if not exists care_instruction_one_current
  on public.care_instruction_bindings (prescription_id, pharmacy_assignment_id, kind)
  where is_current;

create table if not exists public.care_supply_kits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.care_patients(id),
  prescription_id uuid not null references public.care_prescriptions(id),
  pharmacy_assignment_id uuid not null references public.care_pharmacy_assignments(id),
  instruction_binding_id uuid not null references public.care_instruction_bindings(id),
  status text not null default 'unavailable'
    check (status in ('unavailable','draft','approved','fulfilled')),
  supplier_ref text null,
  device_ref text null,
  syringe_ref text null,
  needle_ref text null,
  capacity_ref text null,
  preparation_items_ref text null,
  bandages_ref text null,
  sharps_container_ref text null,
  storage_ref text null,
  travel_ref text null,
  item_reference text null,
  instructions_ref text null,
  replacement_cadence_ref text null,
  created_at timestamptz not null default now()
);

create table if not exists public.care_lab_shares (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.care_patients(id),
  clinical_order_id uuid not null references public.care_clinical_orders(id),
  consent_id uuid not null references public.care_consents(id),
  recipient_role text not null check (recipient_role in ('clinician','lab_reviewer')),
  recipient_id uuid not null,
  status text not null default 'prepared' check (status in ('prepared','shared','revoked')),
  created_at timestamptz not null default now()
);

create table if not exists public.care_message_threads (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.care_patients(id),
  consent_id uuid not null references public.care_consents(id),
  assigned_support_user_id uuid null,
  status text not null default 'open' check (status in ('open','waiting','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.care_secure_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.care_message_threads(id),
  patient_id uuid not null references public.care_patients(id),
  sender_user_id uuid not null,
  channel text not null default 'care_portal' check (channel = 'care_portal'),
  body_ciphertext bytea not null,
  created_at timestamptz not null default now()
);

create table if not exists public.care_support_cases (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.care_patients(id),
  assigned_support_user_id uuid null,
  status text not null default 'open' check (status in ('open','waiting','escalated','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.care_adverse_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.care_patients(id),
  prescription_id uuid null references public.care_prescriptions(id),
  state text not null default 'reported'
    check (state in ('reported','triaged','clinician_routed','pharmacy_notified','escalated','closed')),
  urgency text not null default 'unassessed'
    check (urgency in ('unassessed','routine','urgent','emergency')),
  assigned_clinician_id uuid null references public.care_clinicians(id),
  pharmacy_assignment_id uuid null references public.care_pharmacy_assignments(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz null
);

create table if not exists public.care_discovery_referrals (
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid not null,
  source_rail text not null check (source_rail = 'research'),
  destination_rail text not null check (destination_rail = 'care'),
  intent text not null check (intent = 'learn_about_care'),
  consented_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.care_audit_events (
  id bigint generated by default as identity primary key,
  action text not null,
  actor_user_id uuid not null,
  patient_id uuid null references public.care_patients(id),
  record_table text not null,
  record_id uuid not null,
  occurred_at timestamptz not null default now()
);

create index if not exists care_roles_user_active_idx
  on public.care_role_assignments (user_id, role) where revoked_at is null;
create index if not exists care_coverage_state_active_idx
  on public.care_clinician_coverage (state_code, service_available);
create index if not exists care_eligibility_patient_time_idx
  on public.care_eligibility_checks (patient_id, evaluated_at desc);
create index if not exists care_intake_patient_idx
  on public.care_intake_instances (patient_id, created_at desc);
create index if not exists care_appointments_patient_time_idx
  on public.care_appointments (patient_id, starts_at);
create index if not exists care_reviews_clinician_status_idx
  on public.care_clinician_reviews (assigned_clinician_id, status);
create index if not exists care_prescriptions_patient_status_idx
  on public.care_prescriptions (patient_id, status);
create index if not exists care_lab_shares_recipient_idx
  on public.care_lab_shares (recipient_role, recipient_id, status);
create index if not exists care_messages_thread_time_idx
  on public.care_secure_messages (thread_id, created_at);
create index if not exists care_adverse_events_status_idx
  on public.care_adverse_events (state, urgency, created_at);
create index if not exists care_audit_patient_time_idx
  on public.care_audit_events (patient_id, occurred_at desc);

create or replace function public.care_has_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.care_role_assignments cra
    where cra.user_id = auth.uid()
      and cra.revoked_at is null
      and cra.role = any(required_roles)
  );
$$;

create or replace function public.care_can_access_patient(target_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.care_patients cp
    where cp.id = target_patient_id and cp.user_id = auth.uid()
  ) or public.care_has_role(array[
    'clinician','clinical_admin','pharmacy_operations','lab_reviewer',
    'clinical_support','care_security_admin'
  ]);
$$;

revoke all on function public.care_has_role(text[]) from public;
revoke all on function public.care_can_access_patient(uuid) from public;
grant execute on function public.care_has_role(text[]) to authenticated;
grant execute on function public.care_can_access_patient(uuid) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'care_capabilities','care_role_assignments','care_medical_groups','care_clinicians',
    'care_clinician_coverage','care_patients','care_consents','care_eligibility_checks',
    'care_intake_instances','care_appointments','care_clinician_reviews','care_clinical_orders',
    'care_prescriptions','care_pharmacy_assignments','care_instruction_bindings',
    'care_supply_kits','care_lab_shares','care_message_threads','care_secure_messages',
    'care_support_cases','care_adverse_events','care_discovery_referrals','care_audit_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from anon', table_name);
    execute format('revoke all on table public.%I from public', table_name);
  end loop;
end $$;

-- Patient-bound access policies. These are intentionally authenticated-only
-- and always call a server-owned ownership/role predicate.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'care_consents','care_eligibility_checks','care_intake_instances','care_appointments',
    'care_clinician_reviews','care_clinical_orders','care_prescriptions',
    'care_pharmacy_assignments','care_instruction_bindings','care_supply_kits',
    'care_lab_shares','care_message_threads','care_secure_messages','care_support_cases',
    'care_adverse_events'
  ]
  loop
    execute format('drop policy if exists care_authorized_patient_access on public.%I', table_name);
    execute format(
      'create policy care_authorized_patient_access on public.%I for all to authenticated ' ||
      'using (public.care_can_access_patient(patient_id)) ' ||
      'with check (public.care_can_access_patient(patient_id))',
      table_name
    );
  end loop;
end $$;

drop policy if exists care_patient_self_access on public.care_patients;
create policy care_patient_self_access
  on public.care_patients for select to authenticated
  using (
    user_id = auth.uid()
    or public.care_has_role(array['clinician','clinical_admin','clinical_support','care_security_admin'])
  );

drop policy if exists care_security_roles_access on public.care_role_assignments;
create policy care_security_roles_access
  on public.care_role_assignments for all to authenticated
  using (public.care_has_role(array['care_security_admin']))
  with check (public.care_has_role(array['care_security_admin']));

drop policy if exists care_security_audit_access on public.care_audit_events;
create policy care_security_audit_access
  on public.care_audit_events for select to authenticated
  using (public.care_has_role(array['care_security_admin']));

-- No policies are intentionally added for capabilities, medical groups,
-- clinicians, coverage, or discovery referrals. They remain service-role-only
-- while partner identity and workflow integrations are pending.

-- Rollback notes (manual, destructive, and intentionally not executed):
-- 1. Disable application registration and confirm CARE_CAPABILITY_STATE=disabled.
-- 2. Export audit/consent records under the approved retention process.
-- 3. Drop policies/functions, then drop care_* tables in reverse FK order.
-- 4. Do not cascade into any research_* object; this migration has no Research FK.
