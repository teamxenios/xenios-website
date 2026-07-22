-- xenios research member profile sections (Website 2 lane, member platform
-- G2). Run once in the Supabase SQL Editor. Safe to re-run.
-- One row per (member, section). Section payloads are structured jsonb,
-- validated server-side against the section's zod schema at the recorded
-- schema_version (server/research/profile.ts owns the registry). Sensitive
-- sections are split at the API layer, not here: the service role reads all
-- rows and the server decides which endpoint may serve which section.
-- RLS on, no policies (service-role access only).

create extension if not exists "pgcrypto";

create table if not exists public.research_member_profile_sections (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null,
  section_key    text not null check (section_key in (
                   'basic_information','goals','body_and_routine','fitness',
                   'nutrition','sleep','energy','stress','current_products',
                   'allergies_and_restrictions','basic_safety_context','budget',
                   'routine_complexity','format_preferences',
                   'communication_preferences','media_settings','privacy_choices')),
  schema_version int not null default 1,
  data           jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now(),
  unique (member_id, section_key)
);
create index if not exists research_member_profile_sections_member_idx
  on public.research_member_profile_sections (member_id);

alter table public.research_member_profile_sections enable row level security;
