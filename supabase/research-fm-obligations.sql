-- ==========================================================================
-- MIGRATION (Track B, founding membership activation, Domain 2):
-- research-fm-obligations
-- ==========================================================================
-- The money spine of the founding membership: payment obligations, their
-- append-only audit trail, membership periods, the payment ledger, and
-- receipts. Persists server/research/membership-activation/.
--
-- Pricing facts these tables enforce: ONE membership, $50 at activation which
-- INCLUDES the first 30 calendar days, the first $25 renewal due 30 days
-- after activation, each $25 covering the next 30 days, and NO $25 at
-- activation (the amount check binds each obligation type to exactly one
-- amount).
--
-- PRIVACY AND SECRETS. The method jsonb carries the admin-configured LABEL
-- and an OPAQUE reference to the encrypted-at-rest receiving instructions.
-- No receiving detail (phone, email, handle, cash tag, account or routing
-- number, QR image) is ever stored in these tables, and the audit trail
-- stores IP and user agent as sha256 hashes only.
--
-- Additive, idempotent, RLS-on, no policies (server-only through the
-- service_role client), no destructive DDL. DRAFT, NOT RUN. Part of the
-- Track B founding activation migration set, gated behind
-- RESEARCH_FOUNDING_ACTIVATION_ENABLED (default false).
-- ==========================================================================

create extension if not exists "pgcrypto";

-- --------------------------------------------------------------------------
-- Obligations (header, current state)
-- --------------------------------------------------------------------------

create table if not exists public.research_fm_obligations (
  id                    uuid primary key default gen_random_uuid(),
  human_ref             text not null,
  member_id             uuid not null,
  type                  text not null
                          check (type in ('activation_50','renewal_25')),
  expected_amount_cents bigint not null,
  currency              text not null default 'USD',
  description           text not null,
  status                text not null
                          check (status in ('upcoming','due','submitted','under_review',
                                            'info_requested','mismatch','duplicate','verified',
                                            'rejected','overdue','in_grace','suspended',
                                            'cancelled','reversed','refunded')),
  bridge_phase          text not null default 'phase_a_manual_bridge'
                          check (bridge_phase in ('phase_a_manual_bridge','phase_b_business_methods')),
  -- Method snapshot: label plus opaque instructions ref only, never details.
  method                jsonb not null,
  -- Agreement-versions snapshot at creation (key, version, content hash).
  agreements            jsonb not null,
  -- The member's payment report. Recording it never changes membership state.
  submission            jsonb,
  -- The admin verification (every field plus the explicit confirmation).
  verification          jsonb,
  receiving_account_ref text,
  receipt_ref           text,
  created_at            timestamptz not null default now(),
  due_at                timestamptz not null,
  expires_at            timestamptz not null,

  constraint research_fm_obligations_human_ref_unique unique (human_ref),
  -- Each type owes exactly one amount: $50 activates (and includes the first
  -- 30 days), $25 renews. No other pairing can be written.
  constraint research_fm_obligations_amount_matches_type
    check ((type = 'activation_50' and expected_amount_cents = 5000)
        or (type = 'renewal_25'    and expected_amount_cents = 2500)),
  -- A verified obligation must carry its verification record.
  constraint research_fm_obligations_verified_needs_verification
    check (status <> 'verified' or verification is not null)
);

create index if not exists research_fm_obligations_member_idx
  on public.research_fm_obligations (member_id, created_at);
-- The admin review queue scan: reports waiting on a human.
create index if not exists research_fm_obligations_review_idx
  on public.research_fm_obligations (created_at)
  where status in ('submitted','under_review','info_requested','mismatch','duplicate');
-- One LIVE activation obligation per member. Closed ones (cancelled,
-- reversed, refunded) do not block a fresh start.
create unique index if not exists research_fm_one_live_activation_per_member
  on public.research_fm_obligations (member_id)
  where type = 'activation_50' and status not in ('cancelled','reversed','refunded');

-- --------------------------------------------------------------------------
-- Obligation audit events (append-only, enforced by trigger)
-- --------------------------------------------------------------------------

create table if not exists public.research_fm_obligation_events (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null,
  obligation_id   uuid not null references public.research_fm_obligations (id),
  action          text not null,
  actor_type      text not null check (actor_type in ('member','admin','system')),
  actor_id        text,
  actor_role      text,
  -- sha256 hex only, never raw request context.
  ip_hash         text,
  user_agent_hash text,
  from_status     text,
  to_status       text,
  detail          text,
  occurred_at     timestamptz not null default now(),

  -- The domain generates event ids, so a replayed save cannot duplicate an
  -- event on disk.
  constraint research_fm_obligation_events_event_unique unique (event_id)
);

create index if not exists research_fm_obligation_events_obligation_idx
  on public.research_fm_obligation_events (obligation_id, occurred_at);

-- --------------------------------------------------------------------------
-- Membership periods (append-only; one period per funding obligation)
-- --------------------------------------------------------------------------

create table if not exists public.research_fm_membership_periods (
  id                     uuid primary key default gen_random_uuid(),
  member_id              uuid not null,
  sequence               integer not null check (sequence >= 1),
  starts_at              timestamptz not null,
  ends_at                timestamptz not null,
  funding_obligation_id  uuid not null references public.research_fm_obligations (id),
  created_at             timestamptz not null default now(),

  constraint research_fm_periods_ends_after_start check (ends_at > starts_at),
  -- THE double-extend lock: one verified payment funds exactly one period,
  -- under concurrency, at the database.
  constraint research_fm_periods_one_per_obligation unique (funding_obligation_id),
  constraint research_fm_periods_member_sequence_unique unique (member_id, sequence)
);

create index if not exists research_fm_periods_member_idx
  on public.research_fm_membership_periods (member_id, sequence);

-- --------------------------------------------------------------------------
-- Payment ledger (append-only, enforced by trigger)
-- --------------------------------------------------------------------------

create table if not exists public.research_fm_ledger (
  id            uuid primary key default gen_random_uuid(),
  entry_id      uuid not null,
  member_id     uuid not null,
  obligation_id uuid not null references public.research_fm_obligations (id),
  entry_type    text not null
                  check (entry_type in ('activation_payment','renewal_payment','reversal','refund')),
  -- Positive for money received, negative for a reversal or refund. A
  -- correction is a NEW row; balances are sums, never a mutable total.
  amount_cents  bigint not null,
  actor_id      text not null,
  recorded_at   timestamptz not null default now(),

  constraint research_fm_ledger_entry_unique unique (entry_id),
  constraint research_fm_ledger_signed_amounts
    check ((entry_type in ('activation_payment','renewal_payment') and amount_cents > 0)
        or (entry_type in ('reversal','refund') and amount_cents < 0))
);

create index if not exists research_fm_ledger_member_idx
  on public.research_fm_ledger (member_id, recorded_at);
create index if not exists research_fm_ledger_obligation_idx
  on public.research_fm_ledger (obligation_id);

-- --------------------------------------------------------------------------
-- Receipts (exactly one per obligation)
-- --------------------------------------------------------------------------

create table if not exists public.research_fm_receipts (
  id             uuid primary key default gen_random_uuid(),
  receipt_number text not null,
  obligation_id  uuid not null references public.research_fm_obligations (id),
  member_id      uuid not null,
  amount_cents   bigint not null check (amount_cents > 0),
  currency       text not null default 'USD',
  -- The admin-configured method LABEL only, never receiving details.
  method_label   text not null,
  issued_at      timestamptz not null default now(),

  constraint research_fm_receipts_one_per_obligation unique (obligation_id),
  constraint research_fm_receipts_number_unique unique (receipt_number)
);

create index if not exists research_fm_receipts_member_idx
  on public.research_fm_receipts (member_id, issued_at);

-- --------------------------------------------------------------------------
-- Append-only enforcement
-- --------------------------------------------------------------------------
-- History that can be edited is not history. Events, periods, ledger rows,
-- and receipts are never updated or deleted; a correction is a new row that
-- references what it corrects.

create or replace function public.research_fm_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'table % is append only. Record a new row instead of % on row %.',
    tg_table_name, tg_op, old.id;
end;
$$;

drop trigger if exists research_fm_obligation_events_no_rewrite on public.research_fm_obligation_events;
create trigger research_fm_obligation_events_no_rewrite
  before update or delete on public.research_fm_obligation_events
  for each row execute function public.research_fm_append_only();

drop trigger if exists research_fm_membership_periods_no_rewrite on public.research_fm_membership_periods;
create trigger research_fm_membership_periods_no_rewrite
  before update or delete on public.research_fm_membership_periods
  for each row execute function public.research_fm_append_only();

drop trigger if exists research_fm_ledger_no_rewrite on public.research_fm_ledger;
create trigger research_fm_ledger_no_rewrite
  before update or delete on public.research_fm_ledger
  for each row execute function public.research_fm_append_only();

drop trigger if exists research_fm_receipts_no_rewrite on public.research_fm_receipts;
create trigger research_fm_receipts_no_rewrite
  before update or delete on public.research_fm_receipts
  for each row execute function public.research_fm_append_only();

-- --------------------------------------------------------------------------
-- RLS: enabled, no policies. Server-only through the service_role client.
-- --------------------------------------------------------------------------

alter table public.research_fm_obligations        enable row level security;
alter table public.research_fm_obligation_events  enable row level security;
alter table public.research_fm_membership_periods enable row level security;
alter table public.research_fm_ledger             enable row level security;
alter table public.research_fm_receipts           enable row level security;
