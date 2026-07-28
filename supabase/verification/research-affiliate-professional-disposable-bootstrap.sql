\set ON_ERROR_STOP on
\ir research-fulfillment-supplier-disposable-bootstrap.sql

create table public.research_commerce_paid_order_economics_fixture (
  order_id uuid primary key,
  affiliate_link_id uuid not null,
  state text not null check (state in ('paid','partially_refunded','refunded')),
  captured_cents bigint not null check (captured_cents >= 0),
  refunded_cents bigint not null check (
    refunded_cents >= 0 and refunded_cents <= captured_cents
  ),
  currency text not null,
  version bigint not null check (version > 0)
);

create function public.research_commerce_paid_order_economics(
  p_order_id uuid,
  p_at timestamptz
)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'orderId', order_id,
    'affiliateLinkId', affiliate_link_id,
    'state', state,
    'capturedCents', captured_cents,
    'refundedCents', refunded_cents,
    'currency', currency,
    'version', version
  )
  from public.research_commerce_paid_order_economics_fixture
  where order_id = p_order_id
    and p_at is not null
$$;

\ir ../migrations/20260728020000_research_affiliate_professional_operations.sql
