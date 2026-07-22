-- xenios research agreement acceptances (member platform, Website 2 lane).
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- Append-only like research_consent_events: rows are never updated; the
-- latest row per (subject, agreement key) wins. Definitions (keys, versions,
-- titles, draft status) live in code (server/research/agreements.ts); this
-- table records only who decided what, when, against which version and
-- content hash. IP and user agent are stored as sha256 hashes only.
-- RLS on, no policies (service-role access only).

create extension if not exists "pgcrypto";

create table if not exists public.research_agreement_acceptances (
  id                 uuid primary key default gen_random_uuid(),
  subject_type       text not null check (subject_type in ('applicant','member')),
  subject_id         uuid not null,
  agreement_key      text not null,
  agreement_version  text not null,
  content_hash       text not null,
  decision           text not null check (decision in ('accepted','declined')),
  ip_hash            text,
  user_agent_hash    text,
  created_at         timestamptz not null default now()
);

create index if not exists research_agreement_acceptances_subject_idx
  on public.research_agreement_acceptances (subject_type, subject_id, agreement_key, created_at desc);

alter table public.research_agreement_acceptances enable row level security;
