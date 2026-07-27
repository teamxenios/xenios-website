\set ON_ERROR_STOP on

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create table public.research_products (
  id uuid primary key,
  sku text not null unique,
  admin_status text not null default 'draft'
    check (admin_status in ('draft','in_review','approved','published','archived')),
  active_state boolean not null default true
);

create table public.research_product_variants (
  id uuid primary key,
  product_id uuid not null references public.research_products(id),
  sku text not null unique,
  status text not null default 'draft'
    check (status in ('draft','in_review','approved','archived')),
  active boolean not null default false,
  unique (product_id, id)
);

create table public.research_inventory_lots (
  id uuid primary key default gen_random_uuid(),
  lot_id text not null unique,
  sku text not null,
  owner text not null check (owner in ('mitch','xenios')),
  disposition text not null default 'quarantined' check (disposition in (
    'available','allocated','picked','packed','shipped','quarantined','quality_hold',
    'temperature_hold','damaged','expired','recalled','destroyed'
  )),
  quantity_available integer not null default 0 check (quantity_available >= 0),
  manufactured_date date,
  expiry_date date,
  retest_date date,
  shelf_life_source text not null default 'not_confirmed' check (shelf_life_source in ('supplier_document','coa','not_confirmed')),
  excursion text not null default 'none' check (excursion in ('none','pending_review','cleared','rejected')),
  recalled boolean not null default false,
  recalled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.research_lot_quality_documents (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null unique references public.research_inventory_lots(id) on delete cascade,
  coa_on_file boolean not null default false,
  identity_confirmed boolean not null default false,
  purity_confirmed boolean not null default false,
  sterility_confirmed boolean,
  endotoxin_confirmed boolean,
  document_ref text,
  recorded_at timestamptz not null default now(),
  document_state text not null default 'pending' check (document_state in ('pending','available','withdrawn')),
  verification_state text not null default 'pending' check (verification_state in ('pending','document_on_file','withdrawn')),
  private_storage_key text,
  reviewed_at timestamptz
);

create table public.research_lot_allocations (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.research_inventory_lots(id),
  order_id uuid not null,
  quantity integer not null check (quantity > 0),
  allocated_at timestamptz not null default now(),
  released_at timestamptz
);

alter table public.research_inventory_lots enable row level security;
alter table public.research_lot_quality_documents enable row level security;
alter table public.research_lot_allocations enable row level security;
grant all on public.research_inventory_lots, public.research_lot_quality_documents, public.research_lot_allocations to anon, authenticated, service_role;
