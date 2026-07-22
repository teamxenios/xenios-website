-- xenios research member platform: tracker observations (G5).
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- RLS on, no public policies: only the server's service-role client reads or
-- writes here. Observations are health-adjacent member content; they are never
-- logged and never placed in notification payloads.
--
-- THERE IS NO COMPOSITE HEALTH SCORE COLUMN, HERE OR ANYWHERE. The six domains
-- are stored and reported side by side. Nothing in this schema combines them
-- into a single number to grow.

create extension if not exists "pgcrypto";

-- One row per observation. `original_value` keeps exactly what the member
-- wrote; `normalized_value` is the number the charts read, and it is null when
-- the entry was words rather than a number (confidence then drops to 'low').
-- The member's words are never discarded and never guessed at.
--
-- `metric_key` allows the full contract vocabulary including data_completeness
-- so the column and shared/research/member-platform.ts stay in step, but the
-- API refuses a member-submitted data_completeness row: that metric is COMPUTED
-- from coverage of the other five domains at read time and is never stored.
--
-- `source` covers the media pipeline's writers (voice_note, photo, video) and
-- the server's own computed writes (system) as well as the member's manual
-- entries; the tracker write route only ever produces 'manual'.
create table if not exists public.research_tracker_observations (
  id               uuid primary key default gen_random_uuid(),
  member_id        uuid not null,
  metric_key       text not null check (metric_key in (
                     'plan_adherence',
                     'body_and_appearance',
                     'sleep_and_recovery',
                     'energy_stress_vitality',
                     'performance_and_function',
                     'data_completeness'
                   )),
  source           text not null check (source in (
                     'manual',
                     'voice_note',
                     'photo',
                     'video',
                     'system'
                   )),
  recorded_at      timestamptz not null,
  timezone         text not null,
  unit             text,
  original_value   text not null,
  normalized_value numeric,
  confidence       text check (confidence in ('low', 'medium', 'high')) default 'high',
  notes            text,
  plan_id          uuid,
  created_at       timestamptz not null default now()
);

-- The progress view reads one member's window, per metric domain, newest first.
create index if not exists research_tracker_observations_member_metric_idx
  on public.research_tracker_observations (member_id, metric_key, recorded_at desc);

-- The whole-window read (every domain at once) and the completeness count.
create index if not exists research_tracker_observations_member_recorded_idx
  on public.research_tracker_observations (member_id, recorded_at desc);

alter table public.research_tracker_observations enable row level security;
