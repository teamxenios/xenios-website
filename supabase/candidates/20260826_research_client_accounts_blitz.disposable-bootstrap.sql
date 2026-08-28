\set ON_ERROR_STOP on

-- Disposable PostgreSQL-only dependency shell for the candidate rehearsal.
-- Synthetic rows only. This file is never an environment migration.

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$roles$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text not null unique
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table if not exists public.research_members (
  id uuid primary key,
  auth_user_id uuid not null unique references auth.users (id),
  email text not null unique,
  status text not null check (status in ('pending_activation', 'active', 'paused', 'closed'))
);

create table if not exists public.research_prelaunch_role_assignments (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in (
    'super_admin', 'internal_team', 'product_admin', 'operations_admin',
    'clinical_admin', 'approved_internal_reviewer'
  )),
  assigned_by text not null,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by text,
  revocation_reason text
);

create unique index if not exists research_prelaunch_role_assignments_active_unique
  on public.research_prelaunch_role_assignments (auth_user_id, role)
  where revoked_at is null;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'active-admin@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'non-admin@example.invalid'),
  ('33333333-3333-4333-8333-333333333333', 'revoked-admin@example.invalid'),
  ('44444444-4444-4444-8444-444444444444', 'expired-admin@example.invalid'),
  ('55555555-5555-4555-8555-555555555555', 'member@example.invalid')
on conflict (id) do nothing;

insert into public.research_members (id, auth_user_id, email, status) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '55555555-5555-4555-8555-555555555555',
  'member@example.invalid',
  'active'
) on conflict (id) do nothing;

insert into public.research_prelaunch_role_assignments (
  auth_user_id, role, assigned_by, reason, granted_at, expires_at,
  revoked_at, revoked_by, revocation_reason
) values
  (
    '11111111-1111-4111-8111-111111111111', 'super_admin',
    'disposable-harness', 'active synthetic administrator', now() - interval '1 day', null,
    null, null, null
  ),
  (
    '22222222-2222-4222-8222-222222222222', 'internal_team',
    'disposable-harness', 'synthetic non administrator', now() - interval '1 day', null,
    null, null, null
  ),
  (
    '33333333-3333-4333-8333-333333333333', 'super_admin',
    'disposable-harness', 'synthetic revoked administrator', now() - interval '2 days', null,
    now() - interval '1 day', 'disposable-harness', 'synthetic revocation'
  ),
  (
    '44444444-4444-4444-8444-444444444444', 'super_admin',
    'disposable-harness', 'synthetic expired administrator', now() - interval '2 days', now() - interval '1 day',
    null, null, null
  )
on conflict do nothing;

create schema if not exists rehearsal;

create or replace function rehearsal.expect_failure(
  p_label text,
  p_command text,
  p_message_pattern text default null
)
returns void
language plpgsql
as $$
declare
  did_fail boolean := false;
  failure_message text;
begin
  begin
    execute p_command;
  exception when others then
    did_fail := true;
    get stacked diagnostics failure_message = message_text;
  end;

  if not did_fail then
    raise exception 'FAIL %: attack unexpectedly succeeded: %', p_label, p_command;
  end if;
  if p_message_pattern is not null and failure_message not like p_message_pattern then
    raise exception 'FAIL %: wrong refusal. expected pattern %, got %',
      p_label, p_message_pattern, failure_message;
  end if;
  raise notice 'PASS %: refused (%).', p_label, failure_message;
end;
$$;

create or replace function rehearsal.assert_true(p_label text, p_value boolean)
returns void
language plpgsql
as $$
begin
  if p_value is distinct from true then
    raise exception 'FAIL %: assertion was not true', p_label;
  end if;
  raise notice 'PASS %.', p_label;
end;
$$;

grant usage on schema rehearsal to public;
grant execute on function rehearsal.expect_failure(text, text, text) to public;
grant execute on function rehearsal.assert_true(text, boolean) to public;

-- Deliberately hostile platform defaults. The candidate must remove every
-- inherited grant from its own tables, sequences, and routines before commit.
alter default privileges for role postgres in schema public
  grant all privileges on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all privileges on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;
