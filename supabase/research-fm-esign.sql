-- xenios research founding membership: e-signature integration (OpenSign).
-- DRAFT, NOT RUN as of 2026-07-22. Run once in the Supabase SQL Editor. Safe to
-- re-run (idempotent, no destructive DDL). RLS enabled, no policies; server-only
-- access through the service role.
--
-- Persists server/research/membership-activation/esign/persistence/esign-store.ts
-- (the SigningRequestRecord, TemplateMappingRecord, ArchiveRecord in
-- esign/contracts.ts). Sits ABOVE the native agreement engine
-- (research-fm-agreements.sql): OpenSign is the signature EXECUTION provider and
-- the native document_versions / document_signatures tables remain the source of
-- legal truth. A completed signing request records provider evidence; it never
-- replaces the Xenios agreement gate, which advances only after the server
-- processes a verified completion webhook.
--
-- RULES THIS SCHEMA ENFORCES RATHER THAN TRUSTS:
--   1. One provider signing document maps to exactly one Xenios request
--      (UNIQUE provider_document_id), so a webhook can never fan out.
--   2. A member cannot mint two requests for the same intent
--      (UNIQUE (member_id, idempotency_key)), so a refresh or repeat click
--      never creates a duplicate OpenSign document.
--   3. One provisioned template per deterministic key (PRIMARY KEY template_key);
--      a source-hash change yields a NEW key, so an old template can never be
--      used with new legal text.
--   4. Stored file hashes are sha-256 hex or null; no free-form value.
--   5. Statuses are constrained to the code vocabularies in esign/contracts.ts.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Provider template mappings (deterministic key -> provisioned OpenSign template)
-- ---------------------------------------------------------------------------

create table if not exists public.research_fm_esign_templates (
  template_key                 text primary key,
  tenant                       text not null default 'xenios_research',
  provider                     text not null,
  provider_template_id         text not null,
  provider_template_version    text not null,
  mode                         text not null check (mode in (
                                 'view_only_public_policy','clickwrap_acceptance',
                                 'typed_signature','opensign_document','opensign_packet',
                                 'esign_document','esign_packet')),
  xenios_document_version_ids  jsonb not null default '[]'::jsonb,
  source_content_hashes        jsonb not null default '[]'::jsonb,
  provisioning_status          text not null default 'provisioned' check (provisioning_status in (
                                 'provisioned','drifted','superseded')),
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);

alter table public.research_fm_esign_templates enable row level security;

-- ---------------------------------------------------------------------------
-- Signing requests (the durable Xenios record for one provider signing document)
-- ---------------------------------------------------------------------------

create table if not exists public.research_fm_esign_requests (
  id                           uuid primary key default gen_random_uuid(),
  tenant                       text not null default 'xenios_research',
  member_id                    text not null,
  packet_or_document_id        text not null,
  mode                         text not null check (mode in (
                                 'view_only_public_policy','clickwrap_acceptance',
                                 'typed_signature','opensign_document','opensign_packet',
                                 'esign_document','esign_packet')),
  provider                     text not null,
  provider_template_id         text,
  provider_template_version    text,
  provider_document_id         text,
  xenios_document_version_ids  jsonb not null default '[]'::jsonb,
  source_content_hashes        jsonb not null default '[]'::jsonb,
  signer_identifier            text not null,
  signing_link_status          text not null default 'created' check (signing_link_status in (
                                 'created','viewed','signed','completed','declined','revoked','expired')),
  viewed_at                    timestamptz,
  signed_at                    timestamptz,
  completed_at                 timestamptz,
  declined_at                  timestamptz,
  expired_at                   timestamptz,
  signed_pdf_ref               text,
  certificate_ref              text,
  signed_pdf_hash              text check (signed_pdf_hash is null or signed_pdf_hash ~ '^[0-9a-f]{64}$'),
  certificate_hash             text check (certificate_hash is null or certificate_hash ~ '^[0-9a-f]{64}$'),
  verified_event_ids           jsonb not null default '[]'::jsonb,
  provider_event_history       jsonb not null default '[]'::jsonb,
  xenios_acceptance_event_ids  jsonb not null default '[]'::jsonb,
  idempotency_key              text not null,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),

  -- No duplicate request for the same intent: a refresh/retry replays.
  constraint research_fm_esign_requests_idem_unique unique (member_id, idempotency_key)
);

-- One provider document maps to exactly one request. Partial unique so many
-- rows may sit at provider_document_id null (before the session is created).
create unique index if not exists research_fm_esign_requests_provider_doc_unique
  on public.research_fm_esign_requests (provider_document_id)
  where provider_document_id is not null;

create index if not exists research_fm_esign_requests_member_idx
  on public.research_fm_esign_requests (member_id);

alter table public.research_fm_esign_requests enable row level security;

-- ---------------------------------------------------------------------------
-- Archive records (Xenios private-storage copy of every completed document)
-- ---------------------------------------------------------------------------

create table if not exists public.research_fm_esign_archive (
  id                       uuid primary key default gen_random_uuid(),
  tenant                   text not null default 'xenios_research',
  member_id                text not null,
  packet_or_document_id    text not null,
  document_version_id      text,
  provider                 text not null,
  provider_document_id     text,
  signed_pdf_ref           text,
  signed_pdf_hash          text check (signed_pdf_hash is null or signed_pdf_hash ~ '^[0-9a-f]{64}$'),
  certificate_ref          text,
  certificate_hash         text check (certificate_hash is null or certificate_hash ~ '^[0-9a-f]{64}$'),
  xenios_source_hash       text check (xenios_source_hash is null or xenios_source_hash ~ '^[0-9a-f]{64}$'),
  signer_email             text,
  completed_at             timestamptz,
  retention_class          text not null default 'member_legal_record',
  access_classification    text not null default 'member_and_admin' check (access_classification in (
                             'member_and_admin','admin_only')),
  archive_status           text not null default 'stored' check (archive_status in (
                             'stored','ingest_failed')),
  email_delivery_status    text not null default 'pending' check (email_delivery_status in (
                             'pending','sent','skipped')),
  local_export_status      text not null default 'not_exported' check (local_export_status in (
                             'not_exported','exported')),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists research_fm_esign_archive_member_idx
  on public.research_fm_esign_archive (member_id);

alter table public.research_fm_esign_archive enable row level security;

-- ---------------------------------------------------------------------------
-- updated_at touch triggers (mirrors the other FM domains)
-- ---------------------------------------------------------------------------

create or replace function public.research_fm_esign_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists research_fm_esign_templates_touch on public.research_fm_esign_templates;
create trigger research_fm_esign_templates_touch
  before update on public.research_fm_esign_templates
  for each row execute function public.research_fm_esign_touch_updated_at();

drop trigger if exists research_fm_esign_requests_touch on public.research_fm_esign_requests;
create trigger research_fm_esign_requests_touch
  before update on public.research_fm_esign_requests
  for each row execute function public.research_fm_esign_touch_updated_at();

drop trigger if exists research_fm_esign_archive_touch on public.research_fm_esign_archive;
create trigger research_fm_esign_archive_touch
  before update on public.research_fm_esign_archive
  for each row execute function public.research_fm_esign_touch_updated_at();

-- STORAGE NOTE: completed signed PDFs and completion certificates live in a
-- PRIVATE Supabase Storage bucket named by RESEARCH_ESIGN_BUCKET, created in the
-- Storage dashboard (NOT by SQL), distinct from the identity and evidence
-- buckets. Reached only through short-lived signed URLs. Create it private, no
-- public access, before enabling RESEARCH_ESIGN_ENABLED.
