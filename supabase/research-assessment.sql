-- xenios research member platform: assessment responses (G3).
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- RLS on, no public policies: only the server's service-role client reads or
-- writes here. Answers are health-adjacent and are keyed by questionId inside
-- one jsonb object; they never appear in logs or notification payloads.

create extension if not exists "pgcrypto";

-- One response per member per definition per mode. The initial assessment is
-- created in_progress on first open (or by the reminder sweep, with a null
-- started_at) and locked by submission; reminders_sent tracks the 0h/24h/48h/
-- 72h milestone emails after activation.
create table if not exists public.research_assessment_responses (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null,
  definition_id      text not null,
  definition_version int  not null,
  mode               text not null check (mode in ('initial','monthly_check_in')),
  status             text not null default 'in_progress' check (status in ('in_progress','submitted')),
  answers            jsonb not null default '{}'::jsonb,
  started_at         timestamptz,
  last_saved_at      timestamptz,
  submitted_at       timestamptz,
  reminders_sent     int not null default 0,
  created_at         timestamptz default now(),
  unique (member_id, definition_id, mode)
);

-- The reminder sweep scans by definition, mode, and status.
create index if not exists research_assessment_sweep_idx
  on public.research_assessment_responses (definition_id, mode, status);

alter table public.research_assessment_responses enable row level security;
