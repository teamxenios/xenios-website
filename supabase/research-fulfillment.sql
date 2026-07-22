-- xenios research fulfillment and shipping (Website 3, G7).
-- DRAFT, NOT RUN as of 2026-07-21. Run once in the Supabase SQL Editor. Safe to
-- re-run. RLS enabled, no public policies; server-only access.
--
-- Persists: server/research/providers/{fulfillment,shipping}.ts and the split
-- fulfillment grouping in server/research/inventory/lots.ts.
--
-- THE PRIVACY CONSTRAINT, STATED SO A LATER MIGRATION DOES NOT QUIETLY BREAK IT:
--
-- A fulfillment partner needs to put a box on a truck. It does NOT need to know that
-- the recipient has a health goal, an assessment, a Blueprint, a tracker history, a
-- referral relationship, or any other order they have ever placed.
--
-- Therefore NO column on research_fulfillment_orders may carry member health data,
-- assessment answers, blueprint content, tracker observations, referral codes, or
-- order history. The outbound payload is built from a fixed allowlist in application
-- code, and this table exists to persist exactly that allowlist and nothing wider.
-- Adding such a column here is a privacy regression, not a convenience.

create extension if not exists "pgcrypto";

create table if not exists public.research_fulfillment_orders (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null,
  owner                 text not null check (owner in ('mitch','xenios')),
  state                 text not null default 'pending'
                          check (state in ('pending','submitted','accepted','rejected','on_hold',
                                           'shipped','delivered','exception','cancelled')),
  hold_reason           text,

  -- Minimum shipping identity only.
  recipient_name        text not null,
  address_line1         text not null,
  address_line2         text,
  address_city          text not null,
  address_state         char(2) not null,
  address_postal_code   text not null,
  address_country       char(2) not null default 'US',
  -- Present ONLY when the chosen carrier service genuinely requires it, so a partner
  -- does not receive a phone number merely because xenios holds one.
  recipient_phone       text,

  shipping_service      text not null,
  handling_profile      text not null default 'not_confirmed'
                          check (handling_profile in ('ambient','cold_chain','not_confirmed')),

  partner_reference     text,
  transport_mode        text not null default 'manual_export'
                          check (transport_mode in ('manual_export','signed_csv','sftp','api')),
  submitted_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Shipping without a confirmed storage decision is a safety failure, not a default.
  constraint research_fulfillment_shipped_needs_handling
    check (state not in ('shipped','delivered') or handling_profile <> 'not_confirmed'),
  constraint research_fulfillment_unique_owner_per_order unique (order_id, owner)
);
create index if not exists research_fulfillment_order_idx on public.research_fulfillment_orders (order_id);
create index if not exists research_fulfillment_open_idx
  on public.research_fulfillment_orders (created_at)
  where state in ('pending','submitted','on_hold','exception');

create table if not exists public.research_fulfillment_lines (
  id                    uuid primary key default gen_random_uuid(),
  fulfillment_order_id  uuid not null references public.research_fulfillment_orders (id) on delete cascade,
  sku                   text not null,
  quantity              integer not null check (quantity > 0),
  lot_id                text
);
create index if not exists research_fulfillment_lines_order_idx
  on public.research_fulfillment_lines (fulfillment_order_id);

create table if not exists public.research_shipments (
  id                    uuid primary key default gen_random_uuid(),
  fulfillment_order_id  uuid not null references public.research_fulfillment_orders (id) on delete cascade,
  carrier               text,
  tracking_number       text,
  service               text,
  shipped_at            timestamptz,
  estimated_delivery    date,
  delivered_at          timestamptz,
  exception_detail      text,
  created_at            timestamptz not null default now()
);
create index if not exists research_shipments_tracking_idx
  on public.research_shipments (tracking_number) where tracking_number is not null;

-- Quote provenance is persisted, because a configured fallback rate must never be
-- presented to a member as if a carrier returned it.
create table if not exists public.research_shipping_quotes (
  id                     uuid primary key default gen_random_uuid(),
  order_id               uuid not null,
  kind                   text not null check (kind in ('configured_fallback','live_carrier_quote')),
  service                text not null check (service in ('standard','expedited_2day','next_day',
                                                          'same_day','temperature_controlled')),
  amount_cents           bigint not null check (amount_cents >= 0),
  -- Null whenever no carrier confirmed a window. A delivery date is never invented.
  earliest_delivery_days integer,
  latest_delivery_days   integer,
  disclosure             text not null,
  quoted_at              timestamptz not null default now(),

  constraint research_shipping_quotes_fallback_has_no_promise
    check (kind <> 'configured_fallback'
           or (earliest_delivery_days is null and latest_delivery_days is null))
);
create index if not exists research_shipping_quotes_order_idx on public.research_shipping_quotes (order_id);

create table if not exists public.research_shipping_profiles (
  id                    uuid primary key default gen_random_uuid(),
  sku                   text not null unique,
  requires_cold_chain   boolean not null default false,
  validated             boolean not null default false,
  validation_document   text,
  notes                 text,
  updated_at            timestamptz not null default now(),

  -- A temperature-controlled claim requires a validated service and a document.
  constraint research_shipping_profiles_cold_chain_needs_validation
    check (requires_cold_chain = false or (validated = true and validation_document is not null))
);

alter table public.research_fulfillment_orders  enable row level security;
alter table public.research_fulfillment_lines   enable row level security;
alter table public.research_shipments           enable row level security;
alter table public.research_shipping_quotes     enable row level security;
alter table public.research_shipping_profiles   enable row level security;
