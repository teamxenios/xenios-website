\set ON_ERROR_STOP on

-- Disposable verification schema only. This is intentionally smaller than the
-- production Track B bundle while preserving every column, type, constraint,
-- role, and default consumed by the unapplied atomic-apply candidate.
create extension if not exists pgcrypto;

do $roles$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$roles$;

create table public.research_orders (
  id uuid primary key default gen_random_uuid(),
  state text not null check (state in (
    'draft', 'checkout_pending', 'payment_authorized', 'manual_review',
    'approved', 'payment_captured', 'processing', 'partially_fulfilled',
    'fulfilled', 'delivered', 'exception', 'cancelled', 'refunded', 'replaced'
  )),
  payment_reference text,
  last_idempotency_key text,
  updated_at timestamptz not null default now(),
  constraint research_orders_paid_needs_provider_reference check (
    state not in ('payment_authorized', 'payment_captured', 'refunded')
    or payment_reference is not null
  )
);

create table public.research_order_state_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.research_orders (id) on delete cascade,
  from_state text not null,
  to_state text not null,
  actor_type text not null,
  actor_id text,
  provider_reference text,
  idempotency_key text,
  occurred_at timestamptz not null default now()
);

create table public.research_order_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.research_orders (id) on delete cascade,
  seq integer not null,
  owner text not null,
  status text not null,
  tracking_number text,
  carrier text,
  created_at timestamptz not null default now(),
  constraint research_order_shipments_unique_seq unique (order_id, seq)
);

create table public.research_provider_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null,
  event_id text not null,
  event_type text not null,
  received_at timestamptz not null default now(),
  constraint research_provider_webhook_events_unique unique (provider_name, event_id)
);
