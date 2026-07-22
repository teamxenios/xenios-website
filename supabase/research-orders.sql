-- xenios research orders and carts (Website 3, G7). DRAFT, NOT RUN as of 2026-07-21.
-- Run once in the Supabase SQL Editor. Safe to re-run. RLS enabled, no public
-- policies; server-only access.
--
-- Persists: server/research/commerce/{cart,checkout,orders,refunds}.ts and the order
-- state machine in shared/research/commerce.ts.
--
-- TWO RULES THIS SCHEMA ENFORCES RATHER THAN TRUSTS:
--   1. Money is integer cents. No float, no numeric with scale, no money type.
--   2. Every idempotency key is UNIQUE at the database level. Idempotency enforced
--      only in application code is not idempotency under concurrency: two requests
--      can both pass an in-process check and both create an order.

create extension if not exists "pgcrypto";

create table if not exists public.research_carts (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_cart_lines (
  id                          uuid primary key default gen_random_uuid(),
  cart_id                     uuid not null references public.research_carts (id) on delete cascade,
  sku                         text not null,
  quantity                    integer not null check (quantity > 0 and quantity <= 1000),
  purchase_mode               text not null default 'one_time'
                                check (purchase_mode in ('one_time','subscription')),
  subscription_frequency_days integer
                                check (subscription_frequency_days in (30,60,90)),
  added_at                    timestamptz not null default now(),

  -- A subscription line must name a frequency, and a one-time line must not.
  constraint research_cart_lines_subscription_needs_frequency
    check ((purchase_mode = 'subscription') = (subscription_frequency_days is not null)),
  constraint research_cart_lines_unique_sku unique (cart_id, sku)
);
create index if not exists research_cart_lines_cart_idx on public.research_cart_lines (cart_id);

create table if not exists public.research_orders (
  id                      uuid primary key default gen_random_uuid(),
  member_id               uuid not null,
  state                   text not null default 'draft'
                            check (state in ('draft','checkout_pending','payment_authorized',
                                             'manual_review','approved','payment_captured',
                                             'processing','partially_fulfilled','fulfilled',
                                             'delivered','exception','cancelled','refunded','replaced')),
  subtotal_cents          bigint not null check (subtotal_cents >= 0),
  shipping_cents          bigint not null default 0 check (shipping_cents >= 0),
  store_credit_applied_cents bigint not null default 0 check (store_credit_applied_cents >= 0),
  total_cents             bigint not null check (total_cents >= 0),

  -- The amount the provider actually authorized, as the provider reported it. A capture
  -- may never exceed this, so a total recomputed upward after the hold cannot take more
  -- than the member agreed to.
  authorized_amount_cents bigint check (authorized_amount_cents >= 0),
  captured_amount_cents   bigint check (captured_amount_cents >= 0),
  refunded_cents          bigint not null default 0 check (refunded_cents >= 0),

  payment_reference       text,
  -- Client-supplied, so a retried submit cannot create a second order. UNIQUE per member.
  checkout_idempotency_key text,
  last_idempotency_key    text,

  review_triggers         text[] not null default '{}',
  placed_at               timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- A paid state requires provider evidence. Code cannot mark itself paid, and neither
  -- can a manual UPDATE that forgets to set the reference.
  constraint research_orders_paid_needs_provider_reference
    check (state not in ('payment_authorized','payment_captured','refunded')
           or payment_reference is not null),
  constraint research_orders_capture_within_authorization
    check (captured_amount_cents is null
           or authorized_amount_cents is null
           or captured_amount_cents <= authorized_amount_cents),
  constraint research_orders_refund_within_capture
    check (captured_amount_cents is null or refunded_cents <= captured_amount_cents),
  constraint research_orders_idempotency_unique unique (member_id, checkout_idempotency_key)
);
create index if not exists research_orders_member_idx on public.research_orders (member_id);
create index if not exists research_orders_state_idx on public.research_orders (state);
create index if not exists research_orders_review_idx
  on public.research_orders (created_at) where state = 'manual_review';

create table if not exists public.research_order_lines (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.research_orders (id) on delete cascade,
  sku              text not null,
  display_name     text not null,
  quantity         integer not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0),
  fulfillment_owner text not null check (fulfillment_owner in ('mitch','xenios'))
);
create index if not exists research_order_lines_order_idx on public.research_order_lines (order_id);

-- Append-only state history. Every advance records who caused it and what proved it.
create table if not exists public.research_order_state_events (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.research_orders (id) on delete cascade,
  from_state          text not null,
  to_state            text not null,
  actor_type          text not null check (actor_type in ('member','admin','system','provider_webhook')),
  actor_id            text,
  provider_reference  text,
  idempotency_key     text,
  occurred_at         timestamptz not null default now()
);
create index if not exists research_order_state_events_order_idx
  on public.research_order_state_events (order_id, occurred_at);

-- Webhook replay protection. UNIQUE is the whole point: a replayed provider event
-- cannot be applied twice even if two instances race to handle it.
create table if not exists public.research_provider_webhook_events (
  id            uuid primary key default gen_random_uuid(),
  provider_name text not null,
  event_id      text not null,
  event_type    text not null,
  received_at   timestamptz not null default now(),
  constraint research_provider_webhook_events_unique unique (provider_name, event_id)
);

create table if not exists public.research_claims (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.research_orders (id),
  member_id      uuid not null,
  sku            text not null,
  lot_id         text,
  -- Founder policy: there are no ordinary returns. Only these five reasons exist.
  reason         text not null
                   check (reason in ('damaged','lost','incorrect','missing','temperature_concern')),
  state          text not null default 'submitted'
                   check (state in ('submitted','under_review','information_requested',
                                    'approved','declined','resolved')),
  resolution     text check (resolution in ('replacement','refund','partial_refund','none')),
  -- Opaque references only. No image bytes and no private media URLs cross this boundary.
  evidence_refs  text[] not null default '{}',
  reviewed_by    text,
  submitted_at   timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists research_claims_member_idx on public.research_claims (member_id);
create index if not exists research_claims_open_idx
  on public.research_claims (submitted_at) where state not in ('resolved','declined');

-- Refund idempotency, durable on purpose. It lived in a per-process map, which stops
-- being idempotency the moment the service restarts or a second instance handles the
-- retry: the map is empty, the key looks new, and real money moves twice.
create table if not exists public.research_refund_keys (
  scope             text primary key,
  refund_reference  text not null,
  recorded_at       timestamptz not null default now()
);

alter table public.research_orders                   enable row level security;
alter table public.research_order_lines              enable row level security;
alter table public.research_order_state_events       enable row level security;
alter table public.research_carts                    enable row level security;
alter table public.research_cart_lines               enable row level security;
alter table public.research_provider_webhook_events  enable row level security;
alter table public.research_claims                   enable row level security;
alter table public.research_refund_keys              enable row level security;
