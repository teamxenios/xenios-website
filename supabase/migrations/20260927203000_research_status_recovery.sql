begin;

-- P-17 source-only candidate: a one-time, exact-assisted-order credential and
-- its bounded status-session grant. This migration sends no email, creates no
-- customer/order data, and grants browser roles no relation or routine access.

do $preflight$
begin
  if pg_catalog.to_regclass('public.research_assisted_order_requests') is null
     or pg_catalog.to_regclass('public.research_assisted_order_events') is null then
    raise exception 'research status recovery requires the assisted-order bridge'
      using errcode = '55000';
  end if;
end
$preflight$;

create table if not exists public.research_status_recovery_tokens (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_id uuid not null references public.research_assisted_order_requests(id) on delete restrict,
  owner_id uuid,
  subject_owner_binding text not null,
  token_digest text not null unique,
  purpose text not null default 'status_recovery',
  idempotency_key text not null unique,
  source text not null,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  constraint research_status_recovery_tokens_subject_type_chk
    check (subject_type = 'assisted_order'),
  constraint research_status_recovery_tokens_owner_binding_chk
    check (subject_owner_binding ~ '^(member:[0-9a-f-]{36}|early_access:[0-9a-f]{64})$'),
  constraint research_status_recovery_tokens_digest_chk
    check (token_digest ~ '^[0-9a-f]{64}$'),
  constraint research_status_recovery_tokens_purpose_chk
    check (purpose = 'status_recovery'),
  constraint research_status_recovery_tokens_idempotency_chk
    check (idempotency_key ~ '^[0-9a-f]{64}$'),
  constraint research_status_recovery_tokens_source_chk
    check (source = 'public_status_recovery'),
  constraint research_status_recovery_tokens_expiry_chk
    check (expires_at > created_at and expires_at <= created_at + interval '30 minutes'),
  constraint research_status_recovery_tokens_consumed_chk
    check (consumed_at is null or consumed_at >= created_at),
  constraint research_status_recovery_tokens_revoked_chk
    check (revoked_at is null or revoked_at >= created_at)
);

create index if not exists research_status_recovery_tokens_subject_idx
  on public.research_status_recovery_tokens(subject_type, subject_id, created_at desc);

create table if not exists public.research_status_recovery_sessions (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null,
  subject_id uuid not null references public.research_assisted_order_requests(id) on delete restrict,
  owner_id uuid,
  subject_owner_binding text not null,
  recovery_token_id uuid not null unique references public.research_status_recovery_tokens(id) on delete restrict,
  session_digest text not null unique,
  purpose text not null default 'status_recovery_session',
  created_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint research_status_recovery_sessions_subject_type_chk
    check (subject_type = 'assisted_order'),
  constraint research_status_recovery_sessions_owner_binding_chk
    check (subject_owner_binding ~ '^(member:[0-9a-f-]{36}|early_access:[0-9a-f]{64})$'),
  constraint research_status_recovery_sessions_digest_chk
    check (session_digest ~ '^[0-9a-f]{64}$'),
  constraint research_status_recovery_sessions_purpose_chk
    check (purpose = 'status_recovery_session'),
  constraint research_status_recovery_sessions_expiry_chk
    check (expires_at > created_at and expires_at <= created_at + interval '24 hours'),
  constraint research_status_recovery_sessions_revoked_chk
    check (revoked_at is null or revoked_at >= created_at)
);

create index if not exists research_status_recovery_sessions_subject_idx
  on public.research_status_recovery_sessions(subject_type, subject_id, created_at desc);

alter table public.research_status_recovery_tokens enable row level security;
alter table public.research_status_recovery_tokens force row level security;
alter table public.research_status_recovery_sessions enable row level security;
alter table public.research_status_recovery_sessions force row level security;

revoke all on table public.research_status_recovery_tokens from public, anon, authenticated, service_role;
revoke all on table public.research_status_recovery_sessions from public, anon, authenticated, service_role;

create or replace function public.research_status_recovery_match(
  p_public_reference text,
  p_normalized_email text
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'subjectType', 'assisted_order',
    'subjectId', request_row.id,
    'ownerId', request_row.actor_member_id,
    'publicReference', request_row.public_reference,
    'canonicalEmail', request_row.normalized_email
  )
  from public.research_assisted_order_requests request_row
  where request_row.public_reference = upper(btrim(p_public_reference))
    and request_row.normalized_email = lower(btrim(p_normalized_email))
    and request_row.source = 'early_access_manual_order_bridge'
  limit 1;
$$;

create or replace function public.research_status_recovery_prepare_delivery(
  p_subject_type text,
  p_subject_id uuid,
  p_owner_id uuid,
  p_idempotency_key text,
  p_token_digest text,
  p_created_at timestamptz,
  p_expires_at timestamptz,
  p_source text
) returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_request public.research_assisted_order_requests%rowtype;
  v_existing public.research_status_recovery_tokens%rowtype;
  v_owner_binding text;
  v_token_id uuid;
begin
  if p_subject_type <> 'assisted_order'
     or p_source <> 'public_status_recovery'
     or p_idempotency_key !~ '^[0-9a-f]{64}$'
     or p_token_digest !~ '^[0-9a-f]{64}$'
     or p_created_at is null
     or p_expires_at <= p_created_at
     or p_expires_at > p_created_at + interval '30 minutes' then
    return null;
  end if;

  select * into v_request
  from public.research_assisted_order_requests request_row
  where request_row.id = p_subject_id
    and request_row.source = 'early_access_manual_order_bridge'
    and request_row.actor_member_id is not distinct from p_owner_id
  for update;
  if not found then return null; end if;

  v_owner_binding := case
    when v_request.actor_member_id is not null then 'member:' || v_request.actor_member_id::text
    else 'early_access:' || v_request.early_access_session_hash
  end;
  if v_owner_binding is null then return null; end if;

  select * into v_existing
  from public.research_status_recovery_tokens token_row
  where token_row.idempotency_key = p_idempotency_key
  for update;
  if found then
    if v_existing.subject_type <> p_subject_type
       or v_existing.subject_id <> p_subject_id
       or v_existing.owner_id is distinct from p_owner_id
       or v_existing.subject_owner_binding <> v_owner_binding
       or v_existing.token_digest <> p_token_digest
       or v_existing.consumed_at is not null
       or v_existing.revoked_at is not null
       or v_existing.expires_at <= p_created_at then
      return null;
    end if;
    return jsonb_build_object(
      'tokenRecordId', v_existing.id,
      'canonicalEmail', v_request.normalized_email,
      'publicReference', v_request.public_reference
    );
  end if;

  update public.research_status_recovery_tokens
  set revoked_at = p_created_at
  where subject_type = p_subject_type
    and subject_id = p_subject_id
    and purpose = 'status_recovery'
    and consumed_at is null
    and revoked_at is null;

  insert into public.research_status_recovery_tokens(
    subject_type, subject_id, owner_id, subject_owner_binding, token_digest,
    purpose, idempotency_key, source, created_at, expires_at
  ) values (
    p_subject_type, p_subject_id, p_owner_id, v_owner_binding, p_token_digest,
    'status_recovery', p_idempotency_key, p_source, p_created_at, p_expires_at
  ) returning id into v_token_id;

  return jsonb_build_object(
    'tokenRecordId', v_token_id,
    'canonicalEmail', v_request.normalized_email,
    'publicReference', v_request.public_reference
  );
end;
$$;

create or replace function public.research_status_recovery_exchange(
  p_token_digest text,
  p_session_digest text,
  p_created_at timestamptz,
  p_expires_at timestamptz
) returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_token public.research_status_recovery_tokens%rowtype;
  v_request public.research_assisted_order_requests%rowtype;
  v_owner_binding text;
begin
  if p_token_digest !~ '^[0-9a-f]{64}$'
     or p_session_digest !~ '^[0-9a-f]{64}$'
     or p_created_at is null
     or p_expires_at <= p_created_at
     or p_expires_at > p_created_at + interval '24 hours' then
    return false;
  end if;

  select * into v_token
  from public.research_status_recovery_tokens token_row
  where token_row.token_digest = p_token_digest
    and token_row.purpose = 'status_recovery'
    and token_row.consumed_at is null
    and token_row.revoked_at is null
    and token_row.expires_at > p_created_at
  for update;
  if not found then return false; end if;

  select * into v_request
  from public.research_assisted_order_requests request_row
  where request_row.id = v_token.subject_id
    and request_row.source = 'early_access_manual_order_bridge';
  if not found then return false; end if;
  v_owner_binding := case
    when v_request.actor_member_id is not null then 'member:' || v_request.actor_member_id::text
    else 'early_access:' || v_request.early_access_session_hash
  end;
  if v_token.subject_type <> 'assisted_order'
     or v_token.owner_id is distinct from v_request.actor_member_id
     or v_token.subject_owner_binding <> v_owner_binding then
    return false;
  end if;

  update public.research_status_recovery_tokens
  set consumed_at = p_created_at
  where id = v_token.id;

  insert into public.research_status_recovery_sessions(
    subject_type, subject_id, owner_id, subject_owner_binding,
    recovery_token_id, session_digest, purpose, created_at, expires_at
  ) values (
    v_token.subject_type, v_token.subject_id, v_token.owner_id, v_token.subject_owner_binding,
    v_token.id, p_session_digest, 'status_recovery_session', p_created_at, p_expires_at
  );
  return true;
exception
  when unique_violation then return false;
end;
$$;

create or replace function public.research_status_recovery_status(
  p_session_digest text,
  p_now timestamptz
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'publicReference', request_row.public_reference,
    'status', request_row.status,
    'updatedAt', request_row.updated_at,
    'timeline', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'status', event_row.status,
          'occurredAt', event_row.occurred_at,
          'customerMessage', event_row.customer_message
        ) order by event_row.occurred_at, event_row.id
      )
      from public.research_assisted_order_events event_row
      where event_row.request_id = request_row.id
    ), '[]'::jsonb)
  )
  from public.research_status_recovery_sessions session_row
  join public.research_assisted_order_requests request_row
    on request_row.id = session_row.subject_id
   and session_row.subject_type = 'assisted_order'
   and request_row.source = 'early_access_manual_order_bridge'
   and session_row.owner_id is not distinct from request_row.actor_member_id
   and session_row.subject_owner_binding = case
     when request_row.actor_member_id is not null then 'member:' || request_row.actor_member_id::text
     else 'early_access:' || request_row.early_access_session_hash
   end
  where session_row.session_digest = p_session_digest
    and session_row.purpose = 'status_recovery_session'
    and session_row.revoked_at is null
    and session_row.expires_at > p_now
  limit 1;
$$;

create or replace function public.research_status_recovery_end(
  p_session_digest text,
  p_revoked_at timestamptz
) returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_session_digest !~ '^[0-9a-f]{64}$' or p_revoked_at is null then
    return false;
  end if;
  update public.research_status_recovery_sessions
  set revoked_at = coalesce(revoked_at, p_revoked_at)
  where session_digest = p_session_digest;
  return found;
end;
$$;

alter function public.research_status_recovery_match(text, text) owner to postgres;
alter function public.research_status_recovery_prepare_delivery(text, uuid, uuid, text, text, timestamptz, timestamptz, text) owner to postgres;
alter function public.research_status_recovery_exchange(text, text, timestamptz, timestamptz) owner to postgres;
alter function public.research_status_recovery_status(text, timestamptz) owner to postgres;
alter function public.research_status_recovery_end(text, timestamptz) owner to postgres;

revoke all on function public.research_status_recovery_match(text, text) from public, anon, authenticated, service_role;
revoke all on function public.research_status_recovery_prepare_delivery(text, uuid, uuid, text, text, timestamptz, timestamptz, text) from public, anon, authenticated, service_role;
revoke all on function public.research_status_recovery_exchange(text, text, timestamptz, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.research_status_recovery_status(text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.research_status_recovery_end(text, timestamptz) from public, anon, authenticated, service_role;

grant execute on function public.research_status_recovery_match(text, text) to service_role;
grant execute on function public.research_status_recovery_prepare_delivery(text, uuid, uuid, text, text, timestamptz, timestamptz, text) to service_role;
grant execute on function public.research_status_recovery_exchange(text, text, timestamptz, timestamptz) to service_role;
grant execute on function public.research_status_recovery_status(text, timestamptz) to service_role;
grant execute on function public.research_status_recovery_end(text, timestamptz) to service_role;

do $postcondition$
declare
  v_table text;
  v_function text;
begin
  foreach v_table in array array['research_status_recovery_tokens', 'research_status_recovery_sessions'] loop
    if not exists (
      select 1 from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_table
        and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception 'status recovery table % is not forced RLS', v_table using errcode = '55000';
    end if;
    if exists (
      select 1
      from pg_catalog.aclexplode(coalesce(
        (select c.relacl from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = v_table),
        pg_catalog.acldefault('r', (select oid from pg_catalog.pg_roles where rolname = 'postgres'))
      )) acl
      left join pg_catalog.pg_roles role_row on role_row.oid = acl.grantee
      where acl.grantee = 0 or role_row.rolname in ('anon', 'authenticated', 'service_role')
    ) then
      raise exception 'status recovery table % has a direct role grant', v_table using errcode = '55000';
    end if;
  end loop;

  foreach v_function in array array[
    'research_status_recovery_match',
    'research_status_recovery_prepare_delivery',
    'research_status_recovery_exchange',
    'research_status_recovery_status',
    'research_status_recovery_end'
  ] loop
    if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = v_function) <> 1 then
      raise exception 'status recovery function % overload count is not one', v_function using errcode = '55000';
    end if;
    if exists (
      select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
      left join pg_catalog.pg_roles role_row on role_row.oid = acl.grantee
      where n.nspname = 'public' and p.proname = v_function
        and acl.privilege_type = 'EXECUTE'
        and (acl.grantee = 0 or role_row.rolname in ('anon', 'authenticated'))
    ) then
      raise exception 'status recovery function % is browser executable', v_function using errcode = '55000';
    end if;
  end loop;
end
$postcondition$;

commit;
