-- xenios research Track B schema fidelity (waves 14+15). DRAFT, NOT RUN as of 2026-07-22.
-- Run once in the Supabase SQL Editor. Safe to re-run (create-if-not-exists and
-- add-column-if-not-exists only; NO destructive DDL). RLS enabled, no public
-- policies; server-only access.
--
-- Closes the round-trip fidelity gaps the wave 14 persistence audit named: the
-- domain OrderRecord (server/research/commerce/orders.ts) carries shipments,
-- approved_by, approved_at, cancellation_reason, and authorization_release_failed,
-- and ClaimRecord (server/research/commerce/refunds.ts) carries notes, none of
-- which the original tables could store. Without these columns the Supabase
-- stores silently dropped operator data the in-memory reference kept.
--
-- Shipments get a PROPER TYPED CHILD TABLE, not an untyped json column: the
-- domain shape is structured (owner, status, tracking, carrier), so the database
-- should hold the owner check and keep the rows queryable, exactly as
-- research_order_lines does for lines. Rows are current-state (replaced together
-- on save by the store), ordered by seq so the domain array order survives.

-- Order approval, cancellation, and authorization-release evidence. All nullable:
-- null means the service never set the field, and the store reads null back as
-- the absent optional key.
alter table public.research_orders add column if not exists approved_by text;
alter table public.research_orders add column if not exists approved_at timestamptz;
alter table public.research_orders add column if not exists cancellation_reason text;
alter table public.research_orders add column if not exists authorization_release_failed boolean;

-- One row per shipment of an order. seq preserves the domain array order and is
-- unique per order so a replace-on-save can never interleave two generations.
create table if not exists public.research_order_shipments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.research_orders (id) on delete cascade,
  seq             integer not null check (seq >= 0),
  owner           text not null check (owner in ('mitch','xenios')),
  status          text not null,
  tracking_number text,
  carrier         text,
  created_at      timestamptz not null default now(),
  constraint research_order_shipments_unique_seq unique (order_id, seq)
);
create index if not exists research_order_shipments_order_idx
  on public.research_order_shipments (order_id, seq);

-- Claim operator notes (the member's submitted detail, or a reviewer note).
-- Nullable so pre-migration rows read back as ''; the store writes the string.
alter table public.research_claims add column if not exists notes text;

alter table public.research_order_shipments enable row level security;

-- One settlement per store-credit entry, enforced by the DATABASE rather than
-- the store's read-then-insert application check (closes store-credit schema
-- gap 2): at most one row may reference a given entry via reverses_id, so two
-- concurrent approvals (or reverses) of one credit cannot both insert and
-- double the member's balance. Partial so ordinary issue rows (null) are free.
create unique index if not exists research_store_credit_settlement_unique
  on public.research_store_credit_ledger (reverses_id)
  where reverses_id is not null;

-- Commission chain fidelity: migration 26 stored no kind, so read-back derived
-- an entry's kind purely from sort position, which misreads the ledger when two
-- rows share a created_at millisecond (the accrual can reload as a "reversal"
-- and zero the partner's outstanding balance). Store the kind the service
-- wrote; nullable so pre-migration rows keep the positional fallback.
alter table public.research_commission_ledger add column if not exists kind text
  check (kind is null or kind in ('accrual', 'transition', 'reversal'));
