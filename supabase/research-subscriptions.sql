-- xenios research product subscriptions (Website 3, G7).
-- DRAFT, NOT RUN as of 2026-07-21. Run once in the Supabase SQL Editor. Safe to
-- re-run. RLS enabled, no public policies; server-only access.
--
-- Persists: the subscription state machine in shared/research/commerce.ts.
--
-- Note on discounts: subscription discount percentages remain admin-configurable and
-- are deliberately NOT modelled as a published permanent tier here, because unit
-- economics are not complete. A rate lives on the plan row and can change.

create extension if not exists "pgcrypto";

create table if not exists public.research_product_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null,
  sku                text not null,
  state              text not null default 'pending'
                       check (state in ('pending','active','paused','skip_scheduled',
                                        'rescheduled','payment_issue','cancelled')),
  frequency_days     integer not null check (frequency_days in (30,60,90)),
  quantity           integer not null check (quantity > 0 and quantity <= 1000),

  discount_basis_points integer not null default 0
                          check (discount_basis_points >= 0 and discount_basis_points <= 10000),

  next_charge_at     timestamptz,
  next_shipment_at   timestamptz,
  payment_reference  text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  cancelled_at       timestamptz,

  -- An active subscription needs a schedule. A cancelled one must not keep one, so a
  -- cancelled row cannot quietly continue charging.
  constraint research_subscriptions_active_has_schedule
    check (state <> 'active' or next_charge_at is not null),
  constraint research_subscriptions_cancelled_has_no_schedule
    check (state <> 'cancelled' or (next_charge_at is null and next_shipment_at is null)),
  constraint research_subscriptions_cancelled_has_date
    check (state <> 'cancelled' or cancelled_at is not null)
);
create index if not exists research_subscriptions_member_idx
  on public.research_product_subscriptions (member_id);
create index if not exists research_subscriptions_due_idx
  on public.research_product_subscriptions (next_charge_at) where state = 'active';

-- Append-only action history, so a pause, skip, or reschedule is auditable rather than
-- being an overwrite of the schedule columns.
create table if not exists public.research_subscription_events (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.research_product_subscriptions (id) on delete cascade,
  action          text not null
                    check (action in ('activate','pause','resume','skip','reschedule',
                                      'report_payment_issue','resolve_payment_issue','cancel')),
  from_state      text not null,
  to_state        text not null,
  actor_type      text not null check (actor_type in ('member','admin','system','provider_webhook')),
  actor_id        text,
  effective_at    timestamptz,
  occurred_at     timestamptz not null default now()
);
create index if not exists research_subscription_events_sub_idx
  on public.research_subscription_events (subscription_id, occurred_at);

alter table public.research_product_subscriptions enable row level security;
alter table public.research_subscription_events   enable row level security;
