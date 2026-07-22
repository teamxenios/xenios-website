-- xenios research member platform: plan documents (Wave 3, contract 9).
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- RLS on, no public policies: only the server's service-role client reads or
-- writes here. `storage_path` is server-only and is NEVER serialized to a
-- member; the member reaches bytes through a short-lived signed grant that also
-- requires their session. `checksum_sha256` is taken over the finished document
-- bytes, so it identifies the artifact and not the request that made it.

create extension if not exists "pgcrypto";

-- One row per member per document type per version. Exactly one row per
-- (member, type) is `current`; publishing a new version archives the prior one
-- and the new row points back at it through supersedes_document_id, so the
-- chain of what replaced what stays readable.
create table if not exists public.research_plan_documents (
  id                     uuid primary key default gen_random_uuid(),
  member_id              uuid not null,
  type                   text not null check (type in (
                           'blueprint_pdf',
                           'fitness_plan_pdf',
                           'nutrition_plan_pdf',
                           'xenios90_roadmap_pdf',
                           'other'
                         )),
  title                  text not null,
  version                int  not null default 1,
  template_version       text not null,
  checksum_sha256        text not null,
  storage_path           text not null,
  status                 text not null default 'current' check (status in ('current', 'archived')),
  supersedes_document_id uuid,
  reviewed_by            text,
  published_at           timestamptz not null,
  acknowledged_at        timestamptz,
  created_at             timestamptz default now(),
  unique (member_id, type, version)
);

-- The member Document Center reads by member and status; version lookups and
-- the "prior current document of this type" read go through the second index.
create index if not exists research_plan_documents_member_status_idx
  on public.research_plan_documents (member_id, status);
create index if not exists research_plan_documents_member_type_version_idx
  on public.research_plan_documents (member_id, type, version desc);

alter table public.research_plan_documents enable row level security;
