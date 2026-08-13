-- Persist an authenticated user's intentional Xenios experience preference.
--
-- This is navigation state only. It grants no administrator role and creates
-- no Research membership. Every landing request still verifies the Supabase
-- identity, active/unexpired research_prelaunch_role_assignments, and the
-- research_members row before applying this preference.

begin;

create table if not exists public.research_authenticated_experience_preferences (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  preferred_experience text not null
    check (preferred_experience in ('admin', 'member')),
  updated_at timestamptz not null default now()
);

alter table public.research_authenticated_experience_preferences enable row level security;
alter table public.research_authenticated_experience_preferences force row level security;

revoke all on table public.research_authenticated_experience_preferences
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.research_authenticated_experience_preferences
  to service_role;

commit;
