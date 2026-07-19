-- xenios research consent registry + membership covenant (Super Mega V1
-- sections 5-6). Run once in the Supabase SQL Editor. Safe to re-run.
-- RLS on, no public policies. INERT until RESEARCH_MEMBER_COVENANT_ENABLED /
-- consent flows ship; the application's acknowledgement booleans remain the
-- current record until then.

create extension if not exists "pgcrypto";

-- Append-only consent registry: one row per consent event, never updated.
-- Withdrawal is a new row with granted=false. Latest row per (subject, kind) wins.
create table if not exists public.research_consent_events (
  id              uuid primary key default gen_random_uuid(),
  subject_type    text not null check (subject_type in ('applicant','member')),
  subject_id      uuid not null,
  consent_kind    text not null check (consent_kind in (
                    'application_terms','marketing_email','membership_covenant',
                    'research_use_policy','age_attestation','identity_verification',
                    'health_data_collection','data_export_archival')),
  granted         boolean not null,
  policy_version  text not null,
  presented_text_hash text,
  ip              text,
  user_agent      text,
  created_at      timestamptz not null default now()
);
create index if not exists research_consent_subject_idx
  on public.research_consent_events (subject_type, subject_id, consent_kind, created_at desc);

-- Membership covenant acceptances: versioned, append-only.
create table if not exists public.research_covenant_acceptances (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null,
  covenant_version  text not null,
  accepted          boolean not null default true,
  presented_text_hash text not null,
  ip                text,
  created_at        timestamptz not null default now(),
  unique (member_id, covenant_version)
);

alter table public.research_consent_events       enable row level security;
alter table public.research_covenant_acceptances enable row level security;
