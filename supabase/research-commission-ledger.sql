-- xenios research commission and store-credit ledgers (Website 3, G8).
-- DRAFT, NOT RUN as of 2026-07-21. Run once in the Supabase SQL Editor. Safe to
-- re-run. RLS enabled, no public policies; server-only access.
--
-- Persists: server/research/partners/commissions.ts, server/research/providers/payout.ts,
-- and the ledger states in shared/research/distribution.ts.
--
-- THE DEFINING PROPERTY: these ledgers are APPEND-ONLY, enforced by trigger rather
-- than by convention. A correction is a NEW row referencing the original. Balances are
-- derived by summing rows, never stored as a mutable running total, so there is no
-- number an UPDATE could quietly change.

create extension if not exists "pgcrypto";

create table if not exists public.research_commission_ledger (
  id                  uuid primary key default gen_random_uuid(),
  partner_id          uuid not null,
  order_id            uuid not null,
  state               text not null default 'pending'
                        check (state in ('pending','held','approved','payable','paid',
                                         'reversed','disputed','forfeited')),

  -- Integer cents throughout. Rounding is DOWN in application code, so a fraction of a
  -- cent is never invented in the partner's favour.
  eligible_net_cents  bigint not null check (eligible_net_cents >= 0),
  basis_points        integer not null check (basis_points >= 0 and basis_points <= 10000),
  amount_cents        bigint not null check (amount_cents >= 0),

  -- A reversal is a new row pointing at what it reverses, never an edit.
  reverses_ledger_id  uuid references public.research_commission_ledger (id),
  -- The refund or chargeback reference that caused a reversal, so a replayed refund
  -- webhook cannot reverse the same commission twice.
  source_reference    text,

  -- Proof that money actually settled. A row cannot claim paid without it.
  payout_batch_id     uuid,
  payout_reference    text,

  actor_type          text not null default 'system'
                        check (actor_type in ('admin','system')),
  actor_id            text,
  created_at          timestamptz not null default now(),

  constraint research_commission_paid_needs_proof
    check (state <> 'paid' or (payout_reference is not null and payout_batch_id is not null)),
  constraint research_commission_reversal_needs_target
    check (reverses_ledger_id is null or state = 'reversed')
);
create index if not exists research_commission_partner_idx
  on public.research_commission_ledger (partner_id, created_at);
create index if not exists research_commission_order_idx
  on public.research_commission_ledger (order_id);
-- One live accrual per order. A re-attribution must reverse the losing chain before a
-- new partner can accrue, so this partial index refuses a second live accrual outright.
create unique index if not exists research_commission_one_live_accrual_per_order
  on public.research_commission_ledger (order_id)
  where state in ('pending','held','approved','payable','paid');

create table if not exists public.research_store_credit_ledger (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null,
  amount_cents bigint not null,
  state        text not null default 'pending'
                 check (state in ('pending','held','approved','reversed','fraud_flagged')),
  reason       text not null
                 check (reason in ('referral_new_member','referral_referrer',
                                   'service_recovery','manual_adjustment')),
  -- A 14 day hold before referral credit approves, per the founder decision.
  available_at timestamptz,
  reverses_id  uuid references public.research_store_credit_ledger (id),
  actor_type   text not null default 'system' check (actor_type in ('admin','system')),
  actor_id     text,
  created_at   timestamptz not null default now()
);
create index if not exists research_store_credit_member_idx
  on public.research_store_credit_ledger (member_id, created_at);
-- Spendable balance counts approved rows only, so this index serves the hot query.
create index if not exists research_store_credit_spendable_idx
  on public.research_store_credit_ledger (member_id) where state = 'approved';

-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------------
--
-- A financial ledger that can be edited is not a ledger. Blocking UPDATE and DELETE at
-- the database means an application bug, a migration, or a hand-run statement cannot
-- rewrite history. Corrections must be new rows, which is what makes the trail auditable.

create or replace function public.research_ledger_is_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'ledger % is append only. Record a new row that references the original instead of % on row %.',
    tg_table_name, tg_op, old.id;
end;
$$;

drop trigger if exists research_commission_ledger_no_update on public.research_commission_ledger;
create trigger research_commission_ledger_no_update
  before update or delete on public.research_commission_ledger
  for each row execute function public.research_ledger_is_append_only();

drop trigger if exists research_store_credit_ledger_no_update on public.research_store_credit_ledger;
create trigger research_store_credit_ledger_no_update
  before update or delete on public.research_store_credit_ledger
  for each row execute function public.research_ledger_is_append_only();

-- ---------------------------------------------------------------------------
-- Payouts
-- ---------------------------------------------------------------------------
--
-- No live payout exists. The provider defaults to disabled and the real adapter is a
-- shell, so these tables hold batches that were built and never sent.

create table if not exists public.research_payout_batches (
  id                uuid primary key default gen_random_uuid(),
  partner_id        uuid not null,
  total_cents       bigint not null check (total_cents >= 0),
  state             text not null default 'built'
                      check (state in ('built','submitted','settled','failed','cancelled')),
  provider_name     text not null default 'disabled',
  provider_reference text,
  -- Entries excluded from the batch and why, so an operator can see what was held back.
  excluded_reasons  text[] not null default '{}',
  built_at          timestamptz not null default now(),
  settled_at        timestamptz,

  constraint research_payout_settled_needs_reference
    check (state <> 'settled' or provider_reference is not null)
);
create index if not exists research_payout_batches_partner_idx
  on public.research_payout_batches (partner_id, built_at);

create table if not exists public.research_payout_attempts (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references public.research_payout_batches (id),
  attempt_no    integer not null check (attempt_no > 0),
  outcome       text not null check (outcome in ('disabled','misconfigured','rejected',
                                                 'retryable','permanent_failure','settled')),
  provider_code text,
  attempted_at  timestamptz not null default now(),
  constraint research_payout_attempts_unique unique (batch_id, attempt_no)
);

alter table public.research_commission_ledger   enable row level security;
alter table public.research_store_credit_ledger enable row level security;
alter table public.research_payout_batches      enable row level security;
alter table public.research_payout_attempts     enable row level security;
