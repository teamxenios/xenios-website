-- Disposable-only minimum Track B schema for the unapplied refund-command candidate.
-- Never run against a shared or production database.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create table public.research_orders (
  id uuid primary key,
  member_id uuid not null,
  state text not null check (state in (
    'draft','checkout_pending','payment_authorized','manual_review','approved',
    'payment_captured','processing','partially_fulfilled','fulfilled','delivered',
    'exception','cancelled','refunded','replaced'
  )),
  captured_amount_cents bigint,
  refunded_cents bigint not null default 0 check (refunded_cents >= 0),
  payment_reference text,
  last_idempotency_key text,
  updated_at timestamptz not null,
  constraint research_orders_refund_within_capture
    check (captured_amount_cents is null or refunded_cents <= captured_amount_cents)
);

create table public.research_claims (
  id uuid primary key,
  order_id uuid not null references public.research_orders (id),
  member_id uuid not null,
  state text not null check (state in (
    'submitted','under_review','information_requested','approved','declined','resolved'
  )),
  resolution text check (resolution in ('replacement','refund','partial_refund','none')),
  reviewed_by text,
  updated_at timestamptz not null
);

create table public.research_order_state_events (
  id bigserial primary key,
  order_id uuid not null references public.research_orders (id),
  from_state text not null,
  to_state text not null,
  actor_type text not null check (actor_type in ('member','admin','system','provider_webhook')),
  actor_id text,
  provider_reference text,
  idempotency_key text,
  occurred_at timestamptz not null
);

create table public.research_refund_keys (
  scope text primary key,
  refund_reference text not null,
  recorded_at timestamptz not null
);

insert into public.research_orders (
  id, member_id, state, captured_amount_cents, refunded_cents,
  payment_reference, last_idempotency_key, updated_at
) values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001',
   'delivered', 10000, 0, 'pi_disposable_1', null, '2026-08-28T09:00:00Z'),
  ('10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002',
   'delivered', 10000, 0, 'pi_disposable_2', null, '2026-08-28T09:00:00Z'),
  ('10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003',
   'delivered', 10000, 0, 'pi_disposable_3', null, '2026-08-28T09:00:00Z');

insert into public.research_claims (
  id, order_id, member_id, state, resolution, reviewed_by, updated_at
) values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   '20000000-0000-4000-8000-000000000001', 'approved', null, 'reviewer', '2026-08-28T09:00:00Z'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002',
   '20000000-0000-4000-8000-000000000002', 'approved', null, 'reviewer', '2026-08-28T09:00:00Z'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003',
   '20000000-0000-4000-8000-000000000003', 'approved', null, 'reviewer', '2026-08-28T09:00:00Z');
