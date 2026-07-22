-- xenios research inventory, lots, and quality (Website 3, G7).
-- DRAFT, NOT RUN as of 2026-07-21. Run once in the Supabase SQL Editor. Safe to
-- re-run. RLS enabled, no public policies; server-only access.
--
-- Persists: server/research/inventory/lots.ts (InventoryLot, LotDisposition,
-- QualityDocuments, FEFO allocation, recall traceability).
--
-- THE RULE THIS SCHEMA ENCODES: a lot must EARN the right to ship. Unknown data is
-- never acceptable data. Shelf life is never invented, so an unknown expiry is null
-- and null blocks allocation rather than defaulting to fine.

create extension if not exists "pgcrypto";

create table if not exists public.research_inventory_lots (
  id                  uuid primary key default gen_random_uuid(),
  lot_id              text not null unique,
  sku                 text not null,
  owner               text not null check (owner in ('mitch','xenios')),

  disposition         text not null default 'quarantined'
                        check (disposition in ('available','allocated','picked','packed','shipped',
                                               'quarantined','quality_hold','temperature_hold',
                                               'damaged','expired','recalled','destroyed')),
  quantity_available  integer not null default 0 check (quantity_available >= 0),

  -- Nullable on purpose. Null means unknown, and unknown blocks allocation.
  manufactured_date   date,
  expiry_date         date,
  retest_date         date,
  shelf_life_source   text not null default 'not_confirmed'
                        check (shelf_life_source in ('supplier_document','coa','not_confirmed')),

  excursion           text not null default 'none'
                        check (excursion in ('none','pending_review','cleared','rejected')),
  recalled            boolean not null default false,
  recalled_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint research_lots_recalled_has_date
    check (recalled = false or recalled_at is not null)
);
create index if not exists research_lots_sku_idx on public.research_inventory_lots (sku);
-- FEFO reads earliest expiry first among allocatable lots, so this is the hot index.
create index if not exists research_lots_fefo_idx
  on public.research_inventory_lots (sku, expiry_date)
  where disposition = 'available' and recalled = false and expiry_date is not null;

-- Quality documents are per LOT, not per product. A COA covering a different lot proves
-- nothing about this one.
create table if not exists public.research_lot_quality_documents (
  id                   uuid primary key default gen_random_uuid(),
  lot_id               uuid not null references public.research_inventory_lots (id) on delete cascade,
  coa_on_file          boolean not null default false,
  identity_confirmed   boolean not null default false,
  purity_confirmed     boolean not null default false,
  -- Tri-state: null means not applicable to this format, false means required and
  -- absent. Collapsing them into a boolean would let "not applicable" read as "missing"
  -- or, far worse, let "missing" read as "fine".
  sterility_confirmed  boolean,
  endotoxin_confirmed  boolean,
  document_ref         text,
  recorded_at          timestamptz not null default now(),
  constraint research_lot_quality_documents_unique unique (lot_id)
);

create table if not exists public.research_lot_excursion_events (
  id          uuid primary key default gen_random_uuid(),
  lot_id      uuid not null references public.research_inventory_lots (id) on delete cascade,
  detected_at timestamptz not null default now(),
  detail      text not null,
  reviewed_by text,
  outcome     text check (outcome in ('cleared','rejected')),
  reviewed_at timestamptz
);
create index if not exists research_lot_excursion_open_idx
  on public.research_lot_excursion_events (lot_id) where reviewed_at is null;

create table if not exists public.research_lot_allocations (
  id             uuid primary key default gen_random_uuid(),
  lot_id         uuid not null references public.research_inventory_lots (id),
  order_id       uuid not null,
  quantity       integer not null check (quantity > 0),
  allocated_at   timestamptz not null default now(),
  released_at    timestamptz
);
create index if not exists research_lot_allocations_order_idx on public.research_lot_allocations (order_id);
create index if not exists research_lot_allocations_lot_idx on public.research_lot_allocations (lot_id);

-- Recall traceability runs FROM THE LOT, because a recall is lot-scoped. Recalling an
-- entire SKU would be both wrong and alarming.
create table if not exists public.research_lot_shipments (
  id          uuid primary key default gen_random_uuid(),
  lot_id      uuid not null references public.research_inventory_lots (id),
  order_id    uuid not null,
  member_id   uuid not null,
  shipped_at  timestamptz not null default now()
);
create index if not exists research_lot_shipments_lot_idx on public.research_lot_shipments (lot_id);
create index if not exists research_lot_shipments_order_idx on public.research_lot_shipments (order_id);

alter table public.research_inventory_lots           enable row level security;
alter table public.research_lot_quality_documents    enable row level security;
alter table public.research_lot_excursion_events     enable row level security;
alter table public.research_lot_allocations          enable row level security;
alter table public.research_lot_shipments            enable row level security;
