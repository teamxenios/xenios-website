-- xenios research member platform: Xenios 30 / Xenios 90 plans + the one
-- included early plan change per month (Website 2 lane, Wave 2).
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- RLS on, no public policies: only the server's service-role client reads or
-- writes here. Plan content is member-specific coaching material; members see
-- it only through the server routes, and only once published.

create extension if not exists "pgcrypto";

-- Monthly Xenios 30 plans. Publication is versioned per member per month:
-- publishing a newer version marks the earlier published one superseded, so
-- at most one published version per month is current. The content jsonb is
-- the Xenios30Plan payload minus the column-owned fields (planId, state,
-- version, monthLabel, reviewedBy, publishedAt, memberAcknowledgedAt).
-- Recommendation entries inside content reference product slugs and
-- dispositions only, never composition or dosing claims.
create table if not exists public.research_xenios30_plans (
  id                     uuid primary key default gen_random_uuid(),
  member_id              uuid not null,
  month_label            text not null check (month_label ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  version                int  not null default 1,
  state                  text not null default 'draft'
                         check (state in ('draft','samuel_review','published','superseded','archived')),
  content                jsonb not null default '{}'::jsonb,
  reviewed_by            text,
  published_at           timestamptz,
  member_acknowledged_at timestamptz,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now(),
  unique (member_id, month_label, version)
);

-- Member reads filter by member, then pick by state.
create index if not exists research_xenios30_member_state_idx
  on public.research_xenios30_plans (member_id, state);

-- Ninety-day arcs. One published version per member is current; publishing a
-- newer version supersedes the earlier one. The content jsonb is the
-- Xenios90Plan payload minus the column-owned fields (planId, state, version,
-- currentPhase, publishedAt).
create table if not exists public.research_xenios90_plans (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null,
  version       int  not null default 1,
  state         text not null default 'draft'
                check (state in ('draft','samuel_review','published','superseded','archived')),
  current_phase text not null check (current_phase in ('foundation','progression','consolidation')),
  content       jsonb not null default '{}'::jsonb,
  published_at  timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (member_id, version)
);

create index if not exists research_xenios90_member_state_idx
  on public.research_xenios90_plans (member_id, state);

-- The one included early plan change per calendar month. The unique
-- constraint IS the business rule: a second request in the same month cannot
-- exist, no matter how the request arrives, so the limit is structural rather
-- than best-effort application logic.
create table if not exists public.research_plan_change_requests (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null,
  month_label text not null check (month_label ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  reason      text not null,
  created_at  timestamptz default now(),
  unique (member_id, month_label)
);

alter table public.research_xenios30_plans enable row level security;
alter table public.research_xenios90_plans enable row level security;
alter table public.research_plan_change_requests enable row level security;
