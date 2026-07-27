\set ON_ERROR_STOP on

-- Production-shaped dependency chain: Wave 2 inventory/COA, Wave 3 atomic
-- reservations, then only the minimum pre-launch role seam consumed by this
-- route-free fulfillment unit.
\ir research-inventory-reservation-disposable-bootstrap.sql
\ir ../migrations/20260727160000_research_inventory_reservation_commands.sql

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text
);

create table if not exists public.research_prelaunch_role_assignments (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in (
    'super_admin','internal_team','product_admin','operations_admin',
    'clinical_admin','approved_internal_reviewer'
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
  on public.research_prelaunch_role_assignments(auth_user_id, role)
  where revoked_at is null;
alter table public.research_prelaunch_role_assignments enable row level security;
alter table public.research_prelaunch_role_assignments force row level security;
revoke all on table public.research_prelaunch_role_assignments
  from public, anon, authenticated, service_role;
grant select on table public.research_prelaunch_role_assignments to service_role;

-- Production-shape collision sentinel. These are the already deployed
-- canonical fulfillment tables owned by the legacy order pipeline. The
-- candidate must neither alter their columns nor revoke their existing grants.
create table if not exists public.research_fulfillment_orders (
  id uuid primary key,
  order_id uuid not null,
  legacy_grant_sentinel text not null
);
create table if not exists public.research_fulfillment_lines (
  id uuid primary key,
  fulfillment_order_id uuid not null references public.research_fulfillment_orders(id),
  legacy_grant_sentinel text not null
);
grant select on table public.research_fulfillment_orders to authenticated;
grant select on table public.research_fulfillment_lines to authenticated;

\ir ../migrations/20260728010000_research_fulfillment_supplier_operations.sql
