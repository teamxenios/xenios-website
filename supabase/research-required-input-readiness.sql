-- Canonical required-input, readiness, and launch-switch foundation.
-- Additive and idempotent. Creates no domain input, launch manifest, seed
-- record, role assignment, or public-enabled capability.

begin;

create extension if not exists "pgcrypto";

create table if not exists public.research_required_inputs (
  id uuid primary key default gen_random_uuid(),
  key text not null unique
    check (key ~ '^[a-z0-9][a-z0-9_.:-]{2,199}$'),
  domain text not null
    check (domain ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
  label text not null check (length(btrim(label)) between 3 and 200),
  description text not null check (length(btrim(description)) between 3 and 1000),
  why_required text not null check (length(btrim(why_required)) between 3 and 1000),
  record_type text not null check (length(btrim(record_type)) between 2 and 100),
  record_id text,
  field_path text not null check (length(btrim(field_path)) between 1 and 300),
  current_state text not null default 'missing'
    check (current_state in (
      'missing', 'entered', 'under_review', 'verified', 'rejected',
      'expired', 'superseded', 'not_applicable'
    )),
  blocking_level text not null
    check (blocking_level in (
      'informational', 'blocks_display', 'blocks_transaction',
      'blocks_fulfillment', 'blocks_public_launch',
      'blocks_clinical_activation', 'blocks_provider_activation'
    )),
  responsible_role text not null
    check (responsible_role in (
      'super_admin', 'internal_team', 'product_admin', 'operations_admin',
      'clinical_admin', 'approved_internal_reviewer'
    )),
  verification_method text not null
    check (length(btrim(verification_method)) between 3 and 1000),
  evidence_required jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence_required) = 'array'),
  entry_mode text not null default 'direct'
    check (entry_mode in ('direct', 'record_reference', 'external_secret')),
  entered_value jsonb,
  external_reference_name text,
  entered_by text,
  entered_at timestamptz,
  verified_by text,
  verified_at timestamptz,
  rejection_reason text,
  public_launch_impact text not null
    check (length(btrim(public_launch_impact)) between 3 and 1000),
  next_action text not null check (length(btrim(next_action)) between 3 and 500),
  admin_entry_href text not null
    check (
      length(admin_entry_href) between 8 and 500
      and admin_entry_href ~ '^/admin/[A-Za-z0-9/_?=&.:%-]+$'
    ),
  version integer not null default 1 check (version >= 1),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_required_input_secret_not_stored
    check (entry_mode <> 'external_secret' or entered_value is null),
  constraint research_required_input_secret_reference_name
    check (
      entry_mode <> 'external_secret'
      or external_reference_name is null
      or external_reference_name ~ '^[A-Z][A-Z0-9_]{1,199}$'
    ),
  constraint research_required_input_sensitive_reference_only
    check (
      lower(key || ' ' || field_path || ' ' || label)
        !~ '(credential|secret|password|(^|[._ -])token([._ -]|$)|api[_ -]?key)'
      or entry_mode = 'external_secret'
    ),
  constraint research_required_input_entry_complete
    check (
      current_state not in ('entered', 'under_review', 'verified')
      or entered_at is not null
    ),
  constraint research_required_input_verification_complete
    check (
      current_state <> 'verified'
      or (verified_at is not null and verified_by is not null)
    )
);

create index if not exists research_required_inputs_domain_state_idx
  on public.research_required_inputs (domain, current_state, blocking_level);

create table if not exists public.research_required_input_audit (
  id uuid primary key default gen_random_uuid(),
  required_input_id uuid not null
    references public.research_required_inputs(id) on delete restrict,
  from_state text,
  to_state text not null,
  actor text not null,
  reason text not null check (length(btrim(reason)) between 3 and 1000),
  snapshot jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists research_required_input_audit_item_time_idx
  on public.research_required_input_audit
  (required_input_id, occurred_at desc);

create table if not exists public.research_domain_launch_controls (
  domain text primary key
    check (domain ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
  launch_status text not null default 'internal_build'
    check (launch_status in (
      'internal_build', 'internal_review', 'ready_for_real_data',
      'real_data_entered', 'release_review', 'public_enabled',
      'paused', 'disabled'
    )),
  software_complete boolean not null default false,
  manifest_version integer,
  manifest_hash text,
  expected_input_count integer,
  manifest_approved_by text,
  manifest_approved_at timestamptz,
  release_approved_by text,
  release_approved_at timestamptz,
  version integer not null default 1 check (version >= 1),
  updated_by text not null,
  updated_reason text not null,
  updated_at timestamptz not null default now(),
  constraint research_launch_manifest_complete
    check (
      (
        manifest_version is null and manifest_hash is null
        and expected_input_count is null and manifest_approved_by is null
        and manifest_approved_at is null
      )
      or
      (
        manifest_version >= 1
        and manifest_hash ~ '^[a-f0-9]{64}$'
        and expected_input_count >= 1
        and manifest_approved_by is not null
        and manifest_approved_at is not null
      )
    ),
  constraint research_public_launch_approved
    check (
      launch_status <> 'public_enabled'
      or (
        software_complete
        and release_approved_by is not null
        and release_approved_at is not null
      )
    )
);

create table if not exists public.research_domain_launch_audit (
  id uuid primary key default gen_random_uuid(),
  domain text not null
    references public.research_domain_launch_controls(domain) on delete restrict,
  from_status text,
  to_status text not null,
  actor text not null,
  reason text not null check (length(btrim(reason)) between 3 and 1000),
  manifest_hash text,
  occurred_at timestamptz not null default now()
);

create index if not exists research_domain_launch_audit_domain_time_idx
  on public.research_domain_launch_audit (domain, occurred_at desc);

create or replace function public.research_reject_governance_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'governance audit records are append-only'
    using errcode = '55000';
end;
$$;

drop trigger if exists research_required_input_audit_no_mutation
  on public.research_required_input_audit;
create trigger research_required_input_audit_no_mutation
before update or delete on public.research_required_input_audit
for each row execute function public.research_reject_governance_audit_mutation();

drop trigger if exists research_domain_launch_audit_no_mutation
  on public.research_domain_launch_audit;
create trigger research_domain_launch_audit_no_mutation
before update or delete on public.research_domain_launch_audit
for each row execute function public.research_reject_governance_audit_mutation();

create or replace function public.research_define_required_input(
  p_definition jsonb,
  p_actor text,
  p_now timestamptz
)
returns public.research_required_inputs
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_item public.research_required_inputs;
begin
  insert into public.research_required_inputs (
    key, domain, label, description, why_required, record_type, record_id,
    field_path, blocking_level, responsible_role, verification_method,
    evidence_required, entry_mode, public_launch_impact, next_action,
    admin_entry_href, created_by, created_at, updated_at
  ) values (
    p_definition->>'key',
    p_definition->>'domain',
    p_definition->>'label',
    p_definition->>'description',
    p_definition->>'whyRequired',
    p_definition->>'recordType',
    nullif(p_definition->>'recordId', ''),
    p_definition->>'fieldPath',
    p_definition->>'blockingLevel',
    p_definition->>'responsibleRole',
    p_definition->>'verificationMethod',
    coalesce(p_definition->'evidenceRequired', '[]'::jsonb),
    p_definition->>'entryMode',
    p_definition->>'publicLaunchImpact',
    p_definition->>'nextAction',
    p_definition->>'adminEntryHref',
    p_actor,
    p_now,
    p_now
  )
  returning * into v_item;

  insert into public.research_required_input_audit (
    required_input_id, from_state, to_state, actor, reason, snapshot, occurred_at
  ) values (
    v_item.id, null, 'missing', p_actor, 'Required input defined.',
    jsonb_build_object(
      'key', v_item.key,
      'domain', v_item.domain,
      'blockingLevel', v_item.blocking_level,
      'version', v_item.version
    ),
    p_now
  );
  return v_item;
end;
$$;

create or replace function public.research_transition_required_input(
  p_id uuid,
  p_expected_version integer,
  p_target_state text,
  p_actor text,
  p_reason text,
  p_entered_value jsonb,
  p_external_reference_name text,
  p_now timestamptz
)
returns public.research_required_inputs
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_before public.research_required_inputs;
  v_after public.research_required_inputs;
  v_allowed boolean := false;
begin
  select * into v_before
  from public.research_required_inputs
  where id = p_id and version = p_expected_version
  for update;
  if not found then raise exception 'state_conflict'; end if;

  v_allowed := case v_before.current_state
    when 'missing' then p_target_state in ('entered', 'superseded')
    when 'entered' then p_target_state in ('under_review', 'missing', 'superseded')
    when 'under_review' then p_target_state in ('verified', 'rejected', 'not_applicable')
    when 'rejected' then p_target_state in ('entered', 'superseded')
    when 'verified' then p_target_state in ('expired', 'superseded')
    when 'expired' then p_target_state in ('entered', 'superseded')
    when 'not_applicable' then p_target_state = 'superseded'
    else false
  end;
  if not v_allowed then raise exception 'invalid_transition'; end if;

  if v_before.entry_mode = 'external_secret' and p_entered_value is not null then
    raise exception 'secret_value_forbidden';
  end if;
  if p_target_state = 'entered' then
    if v_before.entry_mode = 'direct' and p_entered_value is null then
      raise exception 'entered_value_required';
    end if;
    if v_before.entry_mode <> 'direct'
       and nullif(btrim(p_external_reference_name), '') is null then
      raise exception 'external_reference_required';
    end if;
    if v_before.entry_mode = 'external_secret'
       and p_external_reference_name !~ '^[A-Z][A-Z0-9_]{1,199}$' then
      raise exception 'secret_reference_name_invalid';
    end if;
  end if;
  if p_target_state in ('verified', 'not_applicable')
     and v_before.entered_by = p_actor then
    raise exception 'independent_verifier_required';
  end if;

  update public.research_required_inputs
  set
    current_state = p_target_state,
    entered_value = case
      when p_target_state = 'entered' and entry_mode <> 'external_secret'
        then p_entered_value
      when p_target_state in ('missing', 'superseded') then null
      else entered_value
    end,
    external_reference_name = case
      when p_target_state = 'entered' then p_external_reference_name
      when p_target_state in ('missing', 'superseded') then null
      else external_reference_name
    end,
    entered_by = case
      when p_target_state = 'entered' then p_actor
      when p_target_state in ('missing', 'superseded') then null
      else entered_by
    end,
    entered_at = case
      when p_target_state = 'entered' then p_now
      when p_target_state in ('missing', 'superseded') then null
      else entered_at
    end,
    verified_by = case when p_target_state = 'verified' then p_actor else null end,
    verified_at = case when p_target_state = 'verified' then p_now else null end,
    rejection_reason = case when p_target_state = 'rejected' then p_reason else null end,
    version = version + 1,
    updated_at = p_now
  where id = p_id
  returning * into v_after;

  insert into public.research_required_input_audit (
    required_input_id, from_state, to_state, actor, reason, snapshot, occurred_at
  ) values (
    v_after.id, v_before.current_state, v_after.current_state, p_actor, p_reason,
    jsonb_build_object(
      'key', v_after.key,
      'domain', v_after.domain,
      'blockingLevel', v_after.blocking_level,
      'entryMode', v_after.entry_mode,
      'externalReferenceName', v_after.external_reference_name,
      'version', v_after.version
    ),
    p_now
  );
  return v_after;
end;
$$;

create or replace function public.research_domain_readiness(p_domain text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_control public.research_domain_launch_controls;
  v_actual integer;
  v_blocking integer;
  v_keys jsonb;
begin
  select * into v_control
  from public.research_domain_launch_controls
  where domain = p_domain;
  if not found then
    raise exception 'launch_control_not_configured';
  end if;

  select
    count(*) filter (where current_state <> 'superseded'),
    count(*) filter (
      where current_state not in ('verified', 'not_applicable', 'superseded')
        and blocking_level <> 'informational'
    ),
    coalesce(
      jsonb_agg(key order by key) filter (
        where current_state not in ('verified', 'not_applicable', 'superseded')
          and blocking_level <> 'informational'
      ),
      '[]'::jsonb
    )
  into v_actual, v_blocking, v_keys
  from public.research_required_inputs
  where domain = p_domain;

  return jsonb_build_object(
    'domain', v_control.domain,
    'launchStatus', v_control.launch_status,
    'softwareComplete', v_control.software_complete,
    'realInputsRequired', v_blocking > 0,
    'publicEnabled', v_control.launch_status = 'public_enabled',
    'manifestApproved', v_control.manifest_hash is not null,
    'expectedInputCount', coalesce(v_control.expected_input_count, 0),
    'actualInputCount', v_actual,
    'blockingInputCount', v_blocking,
    'blockingKeys', v_keys,
    'version', v_control.version
  );
end;
$$;

create or replace function public.research_set_readiness_manifest(
  p_domain text,
  p_expected_version integer,
  p_manifest_version integer,
  p_manifest_hash text,
  p_expected_input_count integer,
  p_software_complete boolean,
  p_actor text,
  p_reason text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_before public.research_domain_launch_controls;
begin
  select * into v_before
  from public.research_domain_launch_controls
  where domain = p_domain
  for update;

  if not found then
    if p_expected_version <> 0 then raise exception 'state_conflict'; end if;
    insert into public.research_domain_launch_controls (
      domain, launch_status, software_complete, manifest_version,
      manifest_hash, expected_input_count, manifest_approved_by,
      manifest_approved_at, version, updated_by, updated_reason, updated_at
    ) values (
      p_domain, 'internal_build', p_software_complete, p_manifest_version,
      p_manifest_hash, p_expected_input_count, p_actor, p_now, 1,
      p_actor, p_reason, p_now
    );
    insert into public.research_domain_launch_audit (
      domain, from_status, to_status, actor, reason, manifest_hash, occurred_at
    ) values (
      p_domain, null, 'internal_build', p_actor, p_reason, p_manifest_hash, p_now
    );
  else
    if v_before.version <> p_expected_version then raise exception 'state_conflict'; end if;
    if v_before.launch_status = 'public_enabled' then raise exception 'pause_before_manifest_change'; end if;
    update public.research_domain_launch_controls
    set software_complete = p_software_complete,
        manifest_version = p_manifest_version,
        manifest_hash = p_manifest_hash,
        expected_input_count = p_expected_input_count,
        manifest_approved_by = p_actor,
        manifest_approved_at = p_now,
        release_approved_by = null,
        release_approved_at = null,
        version = version + 1,
        updated_by = p_actor,
        updated_reason = p_reason,
        updated_at = p_now
    where domain = p_domain;
    insert into public.research_domain_launch_audit (
      domain, from_status, to_status, actor, reason, manifest_hash, occurred_at
    ) values (
      p_domain, v_before.launch_status, v_before.launch_status,
      p_actor, p_reason, p_manifest_hash, p_now
    );
  end if;
  return public.research_domain_readiness(p_domain);
end;
$$;

create or replace function public.research_transition_launch_status(
  p_domain text,
  p_expected_version integer,
  p_target_status text,
  p_actor text,
  p_reason text,
  p_now timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_before public.research_domain_launch_controls;
  v_readiness jsonb;
  v_allowed boolean := false;
begin
  select * into v_before
  from public.research_domain_launch_controls
  where domain = p_domain and version = p_expected_version
  for update;
  if not found then raise exception 'state_conflict'; end if;

  v_allowed := case v_before.launch_status
    when 'internal_build' then p_target_status in ('internal_review', 'disabled')
    when 'internal_review' then p_target_status in ('ready_for_real_data', 'paused', 'disabled')
    when 'ready_for_real_data' then p_target_status in ('real_data_entered', 'paused', 'disabled')
    when 'real_data_entered' then p_target_status in ('release_review', 'paused', 'disabled')
    when 'release_review' then p_target_status in ('public_enabled', 'paused', 'disabled')
    when 'public_enabled' then p_target_status in ('paused', 'disabled')
    when 'paused' then p_target_status in (
      'internal_review', 'ready_for_real_data', 'real_data_entered',
      'release_review', 'public_enabled', 'disabled'
    )
    when 'disabled' then p_target_status = 'internal_build'
    else false
  end;
  if not v_allowed then raise exception 'invalid_transition'; end if;

  if p_target_status = 'public_enabled' then
    v_readiness := public.research_domain_readiness(p_domain);
    if not v_before.software_complete
       or v_before.manifest_hash is null
       or (v_readiness->>'expectedInputCount')::integer < 1
       or (v_readiness->>'actualInputCount')::integer
          <> (v_readiness->>'expectedInputCount')::integer
       or (v_readiness->>'blockingInputCount')::integer <> 0 then
      raise exception 'readiness_blocked';
    end if;
  end if;

  update public.research_domain_launch_controls
  set launch_status = p_target_status,
      release_approved_by = case when p_target_status = 'public_enabled' then p_actor else null end,
      release_approved_at = case when p_target_status = 'public_enabled' then p_now else null end,
      version = version + 1,
      updated_by = p_actor,
      updated_reason = p_reason,
      updated_at = p_now
  where domain = p_domain;

  insert into public.research_domain_launch_audit (
    domain, from_status, to_status, actor, reason, manifest_hash, occurred_at
  ) values (
    p_domain, v_before.launch_status, p_target_status, p_actor, p_reason,
    v_before.manifest_hash, p_now
  );
  return public.research_domain_readiness(p_domain);
end;
$$;

alter table public.research_required_inputs enable row level security;
alter table public.research_required_input_audit enable row level security;
alter table public.research_domain_launch_controls enable row level security;
alter table public.research_domain_launch_audit enable row level security;

alter table public.research_required_inputs force row level security;
alter table public.research_required_input_audit force row level security;
alter table public.research_domain_launch_controls force row level security;
alter table public.research_domain_launch_audit force row level security;

revoke all on table public.research_required_inputs from public, anon, authenticated;
revoke all on table public.research_required_input_audit from public, anon, authenticated;
revoke all on table public.research_domain_launch_controls from public, anon, authenticated;
revoke all on table public.research_domain_launch_audit from public, anon, authenticated;

revoke all on function public.research_reject_governance_audit_mutation()
  from public, anon, authenticated;
revoke all on function public.research_define_required_input(jsonb, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.research_transition_required_input(
  uuid, integer, text, text, text, jsonb, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.research_domain_readiness(text)
  from public, anon, authenticated;
revoke all on function public.research_set_readiness_manifest(
  text, integer, integer, text, integer, boolean, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.research_transition_launch_status(
  text, integer, text, text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.research_define_required_input(jsonb, text, timestamptz)
  to service_role;
grant execute on function public.research_transition_required_input(
  uuid, integer, text, text, text, jsonb, text, timestamptz
) to service_role;
grant execute on function public.research_domain_readiness(text)
  to service_role;
grant execute on function public.research_set_readiness_manifest(
  text, integer, integer, text, integer, boolean, text, text, timestamptz
) to service_role;
grant execute on function public.research_transition_launch_status(
  text, integer, text, text, text, timestamptz
) to service_role;

commit;
