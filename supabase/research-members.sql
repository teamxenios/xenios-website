-- xenios research members (V3 section 13 foundation). Run once in the Supabase
-- SQL Editor. Safe to re-run. RLS on, no public policies; server-only access.
-- A member row is created when an APPROVED applicant claims their account via
-- the signed status link (proof of email ownership). Activation (payment) is
-- Phase 5; until then members hold status 'pending_activation'.

create table if not exists public.research_members (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null unique references public.research_applications (id),
  auth_user_id    uuid not null unique,
  email           text not null unique,
  first_name      text not null,
  status          text not null default 'pending_activation'
                    check (status in ('pending_activation','active','paused','closed')),
  activated_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists research_members_email_idx on public.research_members (email);

alter table public.research_members enable row level security;
