-- xenios research membership (Phase 4)
-- Run once in the Supabase SQL Editor. Safe to re-run (IF NOT EXISTS guards).
-- Security model matches supabase/schema.sql: RLS enabled with NO public
-- policies; all access goes through the server with the service_role key.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- research_applications (email unique; one live application per person)
-- ---------------------------------------------------------------------------
create table if not exists public.research_applications (
  id                  uuid primary key default gen_random_uuid(),
  email               text not null unique,
  first_name          text not null,
  last_name           text not null,
  phone               text,
  country             text not null,
  region              text,
  city                text,
  age_confirmed       boolean not null default false,
  applicant_type      text not null default 'individual'
                        check (applicant_type in ('individual','professional')),
  occupation          text,
  organization        text,
  interests           jsonb not null default '[]'::jsonb,
  goals_text          text,
  fit_text            text,
  referral_source     text,
  referral_code       text,
  marketing_consent   boolean not null default false,
  status              text not null default 'submitted'
                        check (status in (
                          'draft','submitted','under_review','more_information_requested',
                          'resubmitted','approved_pending_payment','payment_pending',
                          'active','paused','declined','withdrawn','expired')),
  approval_expires_at timestamptz,
  submitted_at        timestamptz not null default now(),
  review_started_at   timestamptz,
  reviewed_at         timestamptz,
  reviewed_by         text,
  ip                  text,
  source_page         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists research_applications_status_idx
  on public.research_applications (status, submitted_at desc);
create index if not exists research_applications_created_idx
  on public.research_applications (created_at desc);

-- ---------------------------------------------------------------------------
-- research_application_events (append-only audit of every transition/action)
-- ---------------------------------------------------------------------------
create table if not exists public.research_application_events (
  id                  uuid primary key default gen_random_uuid(),
  application_id      uuid not null references public.research_applications (id) on delete cascade,
  previous_status     text,
  new_status          text,
  actor_type          text not null check (actor_type in ('applicant','admin','system')),
  actor_id            text,
  reason_code         text,
  internal_note       text,
  member_visible_note text,
  created_at          timestamptz not null default now()
);
create index if not exists research_application_events_app_idx
  on public.research_application_events (application_id, created_at);

alter table public.research_applications       enable row level security;
alter table public.research_application_events enable row level security;
