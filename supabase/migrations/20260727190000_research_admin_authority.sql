-- Website 1: durable Research administrator authority and account continuity.
-- Additive, idempotent, and empty by default. This migration creates no auth
-- user, member, role assignment, preference, or audit row.

begin;

create extension if not exists "pgcrypto";

create table if not exists public.research_admin_experience_preferences (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_experience text not null
    check (preferred_experience in ('admin', 'member')),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_admin_authority_audit (
  id uuid primary key default gen_random_uuid(),
  event_type text not null
    check (event_type in (
      'experience_preference_changed',
      'role_granted',
      'role_revoked',
      'initial_super_admin_assigned'
    )),
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  target_auth_user_id uuid not null references auth.users(id) on delete restrict,
  role text,
  idempotency_key text not null unique
    check (length(idempotency_key) between 8 and 200),
  request_fingerprint text not null
    check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  result jsonb not null,
  occurred_at timestamptz not null default now()
);

create index if not exists research_admin_authority_audit_actor_time_idx
  on public.research_admin_authority_audit
  (actor_auth_user_id, occurred_at desc);

create index if not exists research_admin_authority_audit_target_time_idx
  on public.research_admin_authority_audit
  (target_auth_user_id, occurred_at desc);

create or replace function public.research_admin_authority_reject_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'administrator authority audit records are append-only'
    using errcode = '55000';
end;
$$;

revoke all on function public.research_admin_authority_reject_audit_mutation()
  from public, anon, authenticated;

drop trigger if exists research_admin_authority_audit_no_mutation
  on public.research_admin_authority_audit;
create trigger research_admin_authority_audit_no_mutation
before update or delete on public.research_admin_authority_audit
for each row
execute function public.research_admin_authority_reject_audit_mutation();

create or replace function public.research_admin_active_super_admin(
  p_auth_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.research_prelaunch_role_assignments assignment
     where assignment.auth_user_id = p_auth_user_id
       and assignment.role = 'super_admin'
       and assignment.revoked_at is null
       and (
         assignment.expires_at is null
         or assignment.expires_at > statement_timestamp()
       )
  );
$$;

create or replace function public.research_admin_set_experience_preference(
  p_actor_auth_user_id uuid,
  p_preferred_experience text,
  p_expected_version bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  existing_audit public.research_admin_authority_audit%rowtype;
  existing_preference public.research_admin_experience_preferences%rowtype;
  next_version bigint;
  request_fingerprint text;
  response jsonb;
begin
  if p_actor_auth_user_id is null
     or p_preferred_experience not in ('admin', 'member')
     or p_expected_version < 0
     or length(btrim(p_idempotency_key)) not between 8 and 200 then
    raise exception 'invalid experience preference command'
      using errcode = '22023';
  end if;

  request_fingerprint := encode(
    digest(
      concat_ws(
        ':',
        p_actor_auth_user_id::text,
        p_preferred_experience,
        p_expected_version::text
      ),
      'sha256'
    ),
    'hex'
  );
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  select *
    into existing_audit
    from public.research_admin_authority_audit
   where idempotency_key = p_idempotency_key;
  if found then
    if existing_audit.request_fingerprint <> request_fingerprint
       or existing_audit.event_type <> 'experience_preference_changed' then
      raise exception 'idempotency key was reused for another command'
        using errcode = '22023';
    end if;
    return existing_audit.result;
  end if;

  if not public.research_admin_active_super_admin(p_actor_auth_user_id) then
    raise exception 'active super_admin role required'
      using errcode = '42501';
  end if;
  if p_preferred_experience = 'member'
     and not exists (
       select 1
         from public.research_members member
        where member.auth_user_id = p_actor_auth_user_id
          and member.status <> 'closed'
     ) then
    raise exception 'member experience is not authorized'
      using errcode = '42501';
  end if;

  select *
    into existing_preference
    from public.research_admin_experience_preferences
   where auth_user_id = p_actor_auth_user_id
   for update;

  if found then
    if existing_preference.version <> p_expected_version then
      raise exception 'preference version conflict'
        using errcode = '40001';
    end if;
    next_version := existing_preference.version + 1;
    update public.research_admin_experience_preferences
       set preferred_experience = p_preferred_experience,
           version = next_version,
           updated_at = statement_timestamp()
     where auth_user_id = p_actor_auth_user_id;
  else
    if p_expected_version <> 0 then
      raise exception 'preference version conflict'
        using errcode = '40001';
    end if;
    next_version := 1;
    insert into public.research_admin_experience_preferences (
      auth_user_id,
      preferred_experience,
      version
    ) values (
      p_actor_auth_user_id,
      p_preferred_experience,
      next_version
    );
  end if;

  response := jsonb_build_object(
    'preferred_experience', p_preferred_experience,
    'version', next_version
  );
  insert into public.research_admin_authority_audit (
    event_type,
    actor_auth_user_id,
    target_auth_user_id,
    role,
    idempotency_key,
    request_fingerprint,
    result
  ) values (
    'experience_preference_changed',
    p_actor_auth_user_id,
    p_actor_auth_user_id,
    'super_admin',
    p_idempotency_key,
    request_fingerprint,
    response
  );
  return response;
end;
$$;

create or replace function public.research_admin_role_grant(
  p_actor_auth_user_id uuid,
  p_target_auth_user_id uuid,
  p_role text,
  p_reason text,
  p_expires_at timestamptz,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  existing_audit public.research_admin_authority_audit%rowtype;
  assignment public.research_prelaunch_role_assignments%rowtype;
  request_fingerprint text;
  response jsonb;
begin
  if p_actor_auth_user_id is null
     or p_target_auth_user_id is null
     or p_role not in (
       'super_admin',
       'internal_team',
       'product_admin',
       'operations_admin',
       'clinical_admin',
       'approved_internal_reviewer'
     )
     or length(btrim(p_reason)) not between 3 and 500
     or length(btrim(p_idempotency_key)) not between 8 and 200
     or (p_expires_at is not null and p_expires_at <= statement_timestamp()) then
    raise exception 'invalid role grant command'
      using errcode = '22023';
  end if;

  request_fingerprint := encode(
    digest(
      concat_ws(
        ':',
        p_actor_auth_user_id::text,
        p_target_auth_user_id::text,
        p_role,
        btrim(p_reason),
        coalesce(p_expires_at::text, '')
      ),
      'sha256'
    ),
    'hex'
  );
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  select *
    into existing_audit
    from public.research_admin_authority_audit
   where idempotency_key = p_idempotency_key;
  if found then
    if existing_audit.request_fingerprint <> request_fingerprint
       or existing_audit.event_type <> 'role_granted' then
      raise exception 'idempotency key was reused for another command'
        using errcode = '22023';
    end if;
    return existing_audit.result;
  end if;

  if not public.research_admin_active_super_admin(p_actor_auth_user_id) then
    raise exception 'active super_admin role required'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from auth.users where id = p_target_auth_user_id
  ) then
    raise exception 'target auth user does not exist'
      using errcode = '23503';
  end if;

  select *
    into assignment
    from public.research_prelaunch_role_assignments
   where auth_user_id = p_target_auth_user_id
     and role = p_role
     and revoked_at is null
   for update;

  if not found then
    insert into public.research_prelaunch_role_assignments (
      auth_user_id,
      role,
      assigned_by,
      reason,
      expires_at
    ) values (
      p_target_auth_user_id,
      p_role,
      p_actor_auth_user_id::text,
      btrim(p_reason),
      p_expires_at
    )
    returning * into assignment;
  end if;

  response := jsonb_build_object(
    'id', assignment.id,
    'auth_user_id', assignment.auth_user_id,
    'role', assignment.role,
    'granted_at', assignment.granted_at,
    'expires_at', assignment.expires_at,
    'revoked_at', assignment.revoked_at
  );
  insert into public.research_admin_authority_audit (
    event_type,
    actor_auth_user_id,
    target_auth_user_id,
    role,
    idempotency_key,
    request_fingerprint,
    result
  ) values (
    'role_granted',
    p_actor_auth_user_id,
    p_target_auth_user_id,
    p_role,
    p_idempotency_key,
    request_fingerprint,
    response
  );
  return response;
end;
$$;

create or replace function public.research_admin_role_revoke(
  p_actor_auth_user_id uuid,
  p_assignment_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  existing_audit public.research_admin_authority_audit%rowtype;
  assignment public.research_prelaunch_role_assignments%rowtype;
  request_fingerprint text;
  response jsonb;
begin
  if p_actor_auth_user_id is null
     or p_assignment_id is null
     or length(btrim(p_reason)) not between 3 and 500
     or length(btrim(p_idempotency_key)) not between 8 and 200 then
    raise exception 'invalid role revoke command'
      using errcode = '22023';
  end if;
  request_fingerprint := encode(
    digest(
      concat_ws(
        ':',
        p_actor_auth_user_id::text,
        p_assignment_id::text,
        btrim(p_reason)
      ),
      'sha256'
    ),
    'hex'
  );
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
  select *
    into existing_audit
    from public.research_admin_authority_audit
   where idempotency_key = p_idempotency_key;
  if found then
    if existing_audit.request_fingerprint <> request_fingerprint
       or existing_audit.event_type <> 'role_revoked' then
      raise exception 'idempotency key was reused for another command'
        using errcode = '22023';
    end if;
    return existing_audit.result;
  end if;

  if not public.research_admin_active_super_admin(p_actor_auth_user_id) then
    raise exception 'active super_admin role required'
      using errcode = '42501';
  end if;
  select *
    into assignment
    from public.research_prelaunch_role_assignments
   where id = p_assignment_id
   for update;
  if not found then
    raise exception 'role assignment does not exist'
      using errcode = 'P0002';
  end if;
  if assignment.auth_user_id = p_actor_auth_user_id
     and assignment.role = 'super_admin'
     and assignment.revoked_at is null then
    raise exception 'self-revocation of super_admin is prohibited'
      using errcode = '42501';
  end if;

  if assignment.revoked_at is null then
    update public.research_prelaunch_role_assignments
       set revoked_at = statement_timestamp(),
           revoked_by = p_actor_auth_user_id::text,
           revocation_reason = btrim(p_reason)
     where id = p_assignment_id
     returning * into assignment;
  end if;

  response := jsonb_build_object(
    'id', assignment.id,
    'auth_user_id', assignment.auth_user_id,
    'role', assignment.role,
    'revoked_at', assignment.revoked_at
  );
  insert into public.research_admin_authority_audit (
    event_type,
    actor_auth_user_id,
    target_auth_user_id,
    role,
    idempotency_key,
    request_fingerprint,
    result
  ) values (
    'role_revoked',
    p_actor_auth_user_id,
    assignment.auth_user_id,
    assignment.role,
    p_idempotency_key,
    request_fingerprint,
    response
  );
  return response;
end;
$$;

-- One-time bootstrap boundary. Website 2 must invoke it only after Website 6
-- accepts the exact release SHA and Website 2 verifies the existing auth.users
-- UUID. It never accepts or searches by email and never creates an auth user.
create or replace function public.research_admin_assign_initial_super_admin(
  p_verified_auth_user_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  existing_audit public.research_admin_authority_audit%rowtype;
  assignment public.research_prelaunch_role_assignments%rowtype;
  request_fingerprint text;
  response jsonb;
begin
  if p_verified_auth_user_id is null
     or length(btrim(p_reason)) not between 3 and 500
     or length(btrim(p_idempotency_key)) not between 8 and 200 then
    raise exception 'invalid initial super_admin command'
      using errcode = '22023';
  end if;
  request_fingerprint := encode(
    digest(
      concat_ws(
        ':',
        p_verified_auth_user_id::text,
        btrim(p_reason)
      ),
      'sha256'
    ),
    'hex'
  );
  perform pg_advisory_xact_lock(hashtextextended('initial-super-admin', 0));
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  select *
    into existing_audit
    from public.research_admin_authority_audit
   where idempotency_key = p_idempotency_key;
  if found then
    if existing_audit.request_fingerprint <> request_fingerprint
       or existing_audit.event_type <> 'initial_super_admin_assigned' then
      raise exception 'idempotency key was reused for another command'
        using errcode = '22023';
    end if;
    return existing_audit.result;
  end if;

  if not exists (
    select 1 from auth.users where id = p_verified_auth_user_id
  ) then
    raise exception 'verified auth user does not exist'
      using errcode = '23503';
  end if;
  if exists (
    select 1
      from public.research_prelaunch_role_assignments
     where role = 'super_admin'
       and revoked_at is null
       and (
         expires_at is null
         or expires_at > statement_timestamp()
       )
       and auth_user_id <> p_verified_auth_user_id
  ) then
    raise exception 'an active super_admin already exists'
      using errcode = '23505';
  end if;

  select *
    into assignment
    from public.research_prelaunch_role_assignments
   where auth_user_id = p_verified_auth_user_id
     and role = 'super_admin'
     and revoked_at is null
   for update;
  if not found then
    insert into public.research_prelaunch_role_assignments (
      auth_user_id,
      role,
      assigned_by,
      reason
    ) values (
      p_verified_auth_user_id,
      'super_admin',
      p_verified_auth_user_id::text,
      btrim(p_reason)
    )
    returning * into assignment;
  end if;

  response := jsonb_build_object(
    'id', assignment.id,
    'auth_user_id', assignment.auth_user_id,
    'role', assignment.role,
    'granted_at', assignment.granted_at,
    'expires_at', assignment.expires_at,
    'revoked_at', assignment.revoked_at
  );
  insert into public.research_admin_authority_audit (
    event_type,
    actor_auth_user_id,
    target_auth_user_id,
    role,
    idempotency_key,
    request_fingerprint,
    result
  ) values (
    'initial_super_admin_assigned',
    p_verified_auth_user_id,
    p_verified_auth_user_id,
    'super_admin',
    p_idempotency_key,
    request_fingerprint,
    response
  );
  return response;
end;
$$;

alter table public.research_admin_experience_preferences
  enable row level security;
alter table public.research_admin_experience_preferences
  force row level security;
alter table public.research_admin_authority_audit
  enable row level security;
alter table public.research_admin_authority_audit
  force row level security;

revoke all on table public.research_admin_experience_preferences
  from public, anon, authenticated, service_role;
revoke all on table public.research_admin_authority_audit
  from public, anon, authenticated, service_role;
revoke insert, update, delete
  on table public.research_prelaunch_role_assignments
  from service_role;
grant select on table public.research_admin_experience_preferences
  to service_role;
grant select on table public.research_admin_authority_audit
  to service_role;
grant select on table public.research_prelaunch_role_assignments
  to service_role;

revoke all on function public.research_admin_active_super_admin(uuid)
  from public, anon, authenticated;
revoke all on function public.research_admin_set_experience_preference(
  uuid, text, bigint, text
) from public, anon, authenticated;
revoke all on function public.research_admin_role_grant(
  uuid, uuid, text, text, timestamptz, text
) from public, anon, authenticated;
revoke all on function public.research_admin_role_revoke(
  uuid, uuid, text, text
) from public, anon, authenticated;
revoke all on function public.research_admin_assign_initial_super_admin(
  uuid, text, text
) from public, anon, authenticated;

grant execute on function public.research_admin_active_super_admin(uuid)
  to service_role;
grant execute on function public.research_admin_set_experience_preference(
  uuid, text, bigint, text
) to service_role;
grant execute on function public.research_admin_role_grant(
  uuid, uuid, text, text, timestamptz, text
) to service_role;
grant execute on function public.research_admin_role_revoke(
  uuid, uuid, text, text
) to service_role;
grant execute on function public.research_admin_assign_initial_super_admin(
  uuid, text, text
) to service_role;

commit;
