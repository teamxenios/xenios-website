-- xenios research founding membership activation: the Day 15 bridge exit
-- checklist (Domain 5 follow-up). DRAFT, NOT RUN as of 2026-07-22.
-- Run once in the Supabase SQL Editor. Safe to re-run (idempotent, no
-- destructive DDL). RLS enabled, no policies; server-only access through the
-- service role.
--
-- Persists: createSupabaseChecklistStore in
-- server/research/membership-activation/production-deps.ts, which reads and
-- upserts exactly one row shape: { id: 'day15', items: <jsonb> }, with
-- upsert(..., { onConflict: 'id' }). The store reads FAIL SOFT (a missing
-- table or row is an empty checklist) and writes LOUD (an upsert error
-- surfaces), so this table can ship after the code with no hazard; until it
-- exists, checklist saves error truthfully instead of losing progress
-- silently.
--
-- The items jsonb holds one entry per checklist key (see
-- DAY15_CHECKLIST_ITEMS), each { done, note, updatedBy, updatedAt }. This is
-- deliberately MUTABLE operational state (the one non-append-only FM table
-- besides the registry header rows): the record of WHO changed WHAT lives in
-- the per-item updatedBy/updatedAt fields the server always stamps.

create table if not exists public.research_fm_bridge_checklist (
  id          text primary key,
  tenant      text not null default 'xenios',
  items       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Keep updated_at honest on every write without asking the application.
create or replace function public.research_fm_checklist_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists research_fm_checklist_touch on public.research_fm_bridge_checklist;
create trigger research_fm_checklist_touch
  before update on public.research_fm_bridge_checklist
  for each row execute function public.research_fm_checklist_touch();

-- RLS: enabled, no policies. Server-only through the service_role client.
alter table public.research_fm_bridge_checklist enable row level security;
