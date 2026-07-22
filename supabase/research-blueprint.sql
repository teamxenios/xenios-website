-- xenios research member platform: Whole-Life Blueprint versions (G4).
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- RLS on, no public policies: only the server's service-role client reads or
-- writes here. `content` carries the engine output (the BlueprintView payload
-- minus state and version) as one jsonb object; it is health-derived and is
-- never logged and never placed in notification payloads. `review_comment` is
-- Samuel's internal note and is never returned to members.

create extension if not exists "pgcrypto";

-- One row per member per blueprint version. Rows exist from the preliminary
-- state onward (the earlier states are derived from the assessment). The
-- state machine lives in shared/research/member-platform.ts
-- (BLUEPRINT_TRANSITIONS); transitions are server-owned and optimistic
-- (guarded updates on the current state).
create table if not exists public.research_blueprints (
  id                     uuid primary key default gen_random_uuid(),
  member_id              uuid not null,
  version                int  not null default 1,
  state                  text not null check (state in (
                           'not_started',
                           'assessment_due',
                           'assessment_submitted',
                           'preliminary',
                           'samuel_review',
                           'more_information_needed',
                           'published',
                           'updated'
                         )),
  content                jsonb not null,
  assessment_response_id uuid,
  reviewed_by            text,
  review_comment         text,
  member_visible_message text,
  published_at           timestamptz,
  superseded_by_version  int,
  member_acknowledged_at timestamptz,
  created_at             timestamptz default now(),
  updated_at             timestamptz default now(),
  unique (member_id, version)
);

-- The admin review queue scans by state; member reads scan newest-first.
create index if not exists research_blueprints_state_idx
  on public.research_blueprints (state);
create index if not exists research_blueprints_member_version_idx
  on public.research_blueprints (member_id, version desc);

alter table public.research_blueprints enable row level security;
