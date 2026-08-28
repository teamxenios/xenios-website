\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema extensions;
create extension pgcrypto with schema extensions;
create extension dblink with schema extensions;

create table public.research_products (
  id uuid primary key default extensions.gen_random_uuid(),
  sku text not null unique,
  display_name text not null,
  availability text not null,
  commerce_approval text not null,
  admin_status text not null,
  active_state boolean not null,
  visibility_state text not null,
  version integer not null check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table public.research_product_variants (
  id uuid primary key default extensions.gen_random_uuid(),
  product_id uuid not null references public.research_products(id) on delete cascade,
  sku text not null unique,
  label text not null,
  member_eligible boolean not null,
  status text not null,
  active boolean not null,
  version integer not null check (version > 0),
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (product_id, id)
);

create table public.research_carts (
  id uuid primary key default extensions.gen_random_uuid(),
  member_id uuid not null unique,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table public.research_cart_lines (
  id uuid primary key default extensions.gen_random_uuid(),
  cart_id uuid not null references public.research_carts(id) on delete cascade,
  sku text not null,
  quantity integer not null check (quantity > 0 and quantity <= 1000),
  purchase_mode text not null check (purchase_mode in ('one_time','subscription')),
  subscription_frequency_days integer check (subscription_frequency_days in (30,60,90)),
  added_at timestamptz not null default clock_timestamp(),
  constraint research_cart_lines_subscription_needs_frequency
    check ((purchase_mode = 'subscription') = (subscription_frequency_days is not null)),
  constraint research_cart_lines_unique_sku unique (cart_id, sku)
);

alter table public.research_products enable row level security;
alter table public.research_product_variants enable row level security;
alter table public.research_carts enable row level security;
alter table public.research_cart_lines enable row level security;
