-- xenios research member platform: the SLA event ledger (Website 2 lane,
-- Wave 5).
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- RLS on, no policies: only the server's service-role client reads or writes
-- here. Nothing in this table is member-facing.
--
-- WHAT THIS TABLE IS: the claim ledger for SLA notifications sent to Infinity.
-- One row means "this subject's at-risk (or breach) notification has been
-- claimed by a sweep". The unique constraint IS the idempotency: a subject
-- emits at_risk once and breached once, ever, no matter how many sweeps run,
-- how many workers run them, or how late they run.
--
-- WHAT THIS TABLE IS NOT: it is not a copy of member data. There is no column
-- for a name, an email, a health answer, a question body, or a token, because
-- none of those may cross the Infinity boundary (see infinity-provider.ts).
-- subject_ref is an opaque internal reference and subject_id is the uuid the
-- unique constraint is built on.
--
-- delivered = false means the claim exists but the provider refused (disabled,
-- unconfigured, or a transport error). A later sweep RETRIES the delivery
-- against the same claim; the claim is never deleted, so a flapping provider
-- can never produce a duplicate notification.

create extension if not exists "pgcrypto";

create table if not exists public.research_sla_events (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in (
                 'assessment_deadline',
                 'blueprint_review',
                 'monthly_plan_review',
                 'question_response'
               )),
  -- Opaque routing reference (member id, blueprint id, plan id, question id).
  subject_ref  text not null,
  -- NOT NULL is load bearing: Postgres treats NULLs as distinct in a unique
  -- constraint, so a nullable column here would silently allow unlimited
  -- duplicate claims and defeat the idempotency this table exists to provide.
  subject_id   uuid not null,
  deadline_at  timestamptz not null,
  phase        text not null check (phase in ('at_risk', 'breached')),
  emitted_at   timestamptz not null default now(),
  -- False until the provider confirms the emit. A retry sweep flips it true;
  -- it never causes a second claim.
  delivered    boolean not null default false,
  unique (kind, subject_id, phase)
);

-- The retry sweep's read: undelivered claims, oldest first.
create index if not exists research_sla_events_undelivered_idx
  on public.research_sla_events (delivered, emitted_at);

-- The admin sla_risk queue's read: what fired for this kind and when.
create index if not exists research_sla_events_kind_emitted_idx
  on public.research_sla_events (kind, emitted_at desc);

alter table public.research_sla_events enable row level security;
