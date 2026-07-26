-- Xenios canonical private pre-launch foundation.
-- Additive and idempotent. Creates no user, product, inventory, clinical,
-- financial, partner, or other seed record. Public launch remains disabled.

begin;

create extension if not exists "pgcrypto";

create table if not exists public.research_prelaunch_settings (
  key text primary key check (key = 'canonical'),
  launch_status text not null default 'internal_build'
    check (launch_status in (
      'internal_build',
      'internal_review',
      'ready_for_real_data',
      'real_data_entered',
      'release_review',
      'public_enabled',
      'paused',
      'disabled'
    )),
  provider_mode text not null default 'disabled'
    check (provider_mode in ('disabled', 'capture', 'live')),
  updated_by text,
  updated_at timestamptz not null default now()
);

insert into public.research_prelaunch_settings (
  key,
  launch_status,
  provider_mode
) values (
  'canonical',
  'internal_build',
  'disabled'
)
on conflict (key) do nothing;

create table if not exists public.research_prelaunch_role_assignments (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null
    check (role in (
      'super_admin',
      'internal_team',
      'product_admin',
      'operations_admin',
      'clinical_admin',
      'approved_internal_reviewer'
    )),
  assigned_by text not null,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by text,
  revocation_reason text,
  constraint research_prelaunch_role_expiry_after_grant
    check (expires_at is null or expires_at > granted_at),
  constraint research_prelaunch_role_revocation_complete
    check (
      (revoked_at is null and revoked_by is null and revocation_reason is null)
      or
      (
        revoked_at is not null
        and revoked_by is not null
        and length(btrim(revocation_reason)) between 3 and 500
      )
    )
);

create unique index if not exists
  research_prelaunch_role_assignments_active_unique
  on public.research_prelaunch_role_assignments (auth_user_id, role)
  where revoked_at is null;

create index if not exists research_prelaunch_role_assignments_user_idx
  on public.research_prelaunch_role_assignments (auth_user_id, granted_at desc);

create table if not exists public.research_prelaunch_seed_namespaces (
  id uuid primary key default gen_random_uuid(),
  namespace text not null unique
    check (namespace ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
  seed_version integer not null check (seed_version >= 1),
  reset_group text not null
    check (reset_group ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
  status text not null default 'active'
    check (status in ('active', 'reset_pending', 'reset', 'retired')),
  created_by text not null,
  created_at timestamptz not null default now(),
  reset_at timestamptz,
  release_eligible boolean not null default false
    check (release_eligible = false),
  constraint research_prelaunch_seed_reset_state
    check (
      (status in ('active', 'reset_pending') and reset_at is null)
      or
      (status in ('reset', 'retired') and reset_at is not null)
    )
);

create index if not exists research_prelaunch_seed_namespaces_status_idx
  on public.research_prelaunch_seed_namespaces (status, namespace);

create table if not exists public.research_prelaunch_access_audit (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  route_group text not null check (length(route_group) between 1 and 200),
  role text
    check (
      role is null
      or role in (
        'super_admin',
        'internal_team',
        'product_admin',
        'operations_admin',
        'clinical_admin',
        'approved_internal_reviewer'
      )
    ),
  decision text not null check (decision in ('allowed', 'denied')),
  reason_code text not null check (length(reason_code) between 1 and 100),
  request_id uuid not null unique,
  seed_namespace text,
  occurred_at timestamptz not null default now()
);

create index if not exists research_prelaunch_access_audit_user_time_idx
  on public.research_prelaunch_access_audit (auth_user_id, occurred_at desc);

create index if not exists research_prelaunch_access_audit_denied_idx
  on public.research_prelaunch_access_audit (occurred_at desc)
  where decision = 'denied';

create table if not exists public.research_prelaunch_external_action_capture (
  id uuid primary key default gen_random_uuid(),
  seed_namespace text not null
    references public.research_prelaunch_seed_namespaces(namespace)
    on delete restrict,
  provider text not null check (length(provider) between 1 and 100),
  action_type text not null check (length(action_type) between 1 and 100),
  idempotency_key text not null unique
    check (length(idempotency_key) between 8 and 200),
  payload_digest text not null
    check (payload_digest ~ '^[a-f0-9]{64}$'),
  data_origin text not null default 'internal_seed'
    check (data_origin = 'internal_seed'),
  release_eligible boolean not null default false
    check (release_eligible = false),
  captured_by text not null,
  captured_at timestamptz not null default now()
);

create index if not exists research_prelaunch_external_capture_namespace_idx
  on public.research_prelaunch_external_action_capture
  (seed_namespace, captured_at desc);

create or replace function public.research_prelaunch_reject_audit_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'prelaunch audit records are append-only'
    using errcode = '55000';
end;
$$;

revoke all on function public.research_prelaunch_reject_audit_mutation()
  from public, anon, authenticated;

drop trigger if exists research_prelaunch_access_audit_no_mutation
  on public.research_prelaunch_access_audit;
create trigger research_prelaunch_access_audit_no_mutation
before update or delete on public.research_prelaunch_access_audit
for each row execute function public.research_prelaunch_reject_audit_mutation();

drop trigger if exists research_prelaunch_external_capture_no_mutation
  on public.research_prelaunch_external_action_capture;
create trigger research_prelaunch_external_capture_no_mutation
before update or delete on public.research_prelaunch_external_action_capture
for each row execute function public.research_prelaunch_reject_audit_mutation();

alter table public.research_prelaunch_settings enable row level security;
alter table public.research_prelaunch_role_assignments enable row level security;
alter table public.research_prelaunch_seed_namespaces enable row level security;
alter table public.research_prelaunch_access_audit enable row level security;
alter table public.research_prelaunch_external_action_capture enable row level security;

alter table public.research_prelaunch_settings force row level security;
alter table public.research_prelaunch_role_assignments force row level security;
alter table public.research_prelaunch_seed_namespaces force row level security;
alter table public.research_prelaunch_access_audit force row level security;
alter table public.research_prelaunch_external_action_capture force row level security;

revoke all on table public.research_prelaunch_settings
  from public, anon, authenticated;
revoke all on table public.research_prelaunch_role_assignments
  from public, anon, authenticated;
revoke all on table public.research_prelaunch_seed_namespaces
  from public, anon, authenticated;
revoke all on table public.research_prelaunch_access_audit
  from public, anon, authenticated;
revoke all on table public.research_prelaunch_external_action_capture
  from public, anon, authenticated;

commit;
