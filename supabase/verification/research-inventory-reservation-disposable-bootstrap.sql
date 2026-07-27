\set ON_ERROR_STOP on

-- Reuse the accepted Wave 2 disposable foundation and apply its exact
-- production migration before introducing the canonical dormant reservation
-- tables that Track B already owns.
\ir research-inventory-lot-coa-disposable-bootstrap.sql
\ir ../research-inventory-lot-coa-admin.sql

create table public.research_lot_reservations (
  id uuid primary key default gen_random_uuid(),
  reservation_id text not null unique,
  member_id uuid not null,
  sku text not null,
  quantity integer not null check (quantity > 0),
  status text not null default 'held'
    check (status in ('held', 'released', 'finalized')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  finalized_at timestamptz,
  constraint research_lot_reservations_released_has_date
    check (status <> 'released' or released_at is not null),
  constraint research_lot_reservations_finalized_has_date
    check (status <> 'finalized' or finalized_at is not null)
);
create index research_lot_reservations_member_idx
  on public.research_lot_reservations(member_id);
create index research_lot_reservations_expiry_idx
  on public.research_lot_reservations(expires_at)
  where status = 'held';

create table public.research_lot_reservation_allocations (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null
    references public.research_lot_reservations(id) on delete cascade,
  seq integer not null check (seq >= 0),
  lot_id text not null references public.research_inventory_lots(lot_id),
  quantity integer not null check (quantity > 0),
  constraint research_lot_reservation_allocations_unique_seq
    unique (reservation_id, seq)
);
create index research_lot_reservation_allocations_lot_idx
  on public.research_lot_reservation_allocations(lot_id);

alter table public.research_lot_reservations enable row level security;
alter table public.research_lot_reservation_allocations enable row level security;

-- Begin from the deliberately broad dormant-store posture. The candidate must
-- revoke this path and leave service_role with SELECT plus command execution.
grant all on table
  public.research_lot_reservations,
  public.research_lot_reservation_allocations
to anon, authenticated, service_role;
