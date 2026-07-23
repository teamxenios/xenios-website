-- xenios research founding membership activation: identity documents,
-- manual name and age review, and retention (Domain 3).
-- Run once in the Supabase SQL Editor. Safe to re-run (idempotent, no
-- destructive DDL: nothing here drops a table or a column).
--
-- RLS is ON with NO policies on every table: only the server's service-role
-- client reads or writes here. Applicants reach their case only through the
-- server routes; administrators reach a document only through short-lived
-- signed URLs minted per request, each mint preceded by an audit row.
--
-- HARD RULES this schema keeps honest:
-- - No SSN, anywhere. There is no column on any table that could carry a
--   Social Security number, a full license number, a name, or a birth date.
--   license_last4 is the one sanctioned fragment and the check constraint
--   caps it at exactly four characters.
-- - The raw document lives in a PRIVATE storage bucket
--   (RESEARCH_IDENTITY_BUCKET), never in a table. storage_path is a pointer,
--   nulled when the retention worker or an emergency delete destroys the
--   object; after that, only the minimal review row remains.
-- - The audit trail is append only, enforced by a database trigger, not by
--   application promises.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Cases: one header row per identity document case (current state).
-- The twelve statuses mirror IDENTITY_CASE_STATUSES in
-- server/research/membership-activation/identity-documents.ts.
-- ---------------------------------------------------------------------------

create table if not exists public.research_fm_identity_cases (
  case_id                uuid primary key default gen_random_uuid(),
  tenant_id              text not null default 'xenios-research',
  member_id              text not null,
  status                 text not null default 'awaiting_consent' check (status in (
                           'awaiting_consent',
                           'consent_declined',
                           'consent_recorded',
                           'upload_url_issued',
                           'upload_expired',
                           'uploaded',
                           'review_pending',
                           'under_review',
                           'verified',
                           'rejected',
                           'deletion_scheduled',
                           'deleted'
                         )),
  consent_version        text,
  consent_recorded_at    timestamptz,
  -- The raw object pointer. Nulled at deletion; a deleted case keeps no path.
  storage_path           text,
  content_type           text check (content_type is null or content_type in (
                           'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
                         )),
  upload_url_expires_at  timestamptz,
  uploaded_at            timestamptz,
  review_id              uuid,
  raw_deleted_at         timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- Consent first, structurally: no case may hold an object pointer without
  -- a recorded consent timestamp.
  constraint research_fm_identity_consent_before_upload
    check (storage_path is null or consent_recorded_at is not null)
);

create index if not exists research_fm_identity_cases_member_idx
  on public.research_fm_identity_cases (tenant_id, member_id, created_at desc);

-- The deletion sweep scans for cases still holding an object.
create index if not exists research_fm_identity_cases_raw_idx
  on public.research_fm_identity_cases (tenant_id)
  where storage_path is not null;

-- The manual review queue.
create index if not exists research_fm_identity_cases_queue_idx
  on public.research_fm_identity_cases (tenant_id, updated_at)
  where status in ('review_pending', 'under_review');

-- ---------------------------------------------------------------------------
-- Reviews: the minimal verification record (what outlives the document).
-- Written once at review completion; the ONLY later update is stamping
-- raw_source_deleted_at when the retention worker destroys the object.
-- Note the columns that do NOT exist: no name, no birth date, no full
-- license or document number, no SSN, no image, ever.
-- ---------------------------------------------------------------------------

create table if not exists public.research_fm_identity_reviews (
  review_id             uuid primary key,
  case_id               uuid not null,
  tenant_id             text not null default 'xenios-research',
  member_id             text not null,
  -- This lane is a manual name and age check by a named person; the type is
  -- pinned so no other review flavor can ever be filed here.
  review_type           text not null default 'manual_name_age'
                          check (review_type = 'manual_name_age'),
  name_match            text not null check (name_match in ('match', 'mismatch')),
  age_threshold_met     boolean not null,
  document_not_expired  boolean not null,
  jurisdiction          text,
  -- The one sanctioned identifier fragment: exactly four characters or null.
  license_last4         text check (
                          license_last4 is null
                          or license_last4 ~ '^[A-Za-z0-9]{4}$'
                        ),
  outcome               text not null check (outcome in ('verified', 'rejected')),
  rejection_category    text check (rejection_category is null or rejection_category in (
                          'name_mismatch',
                          'age_threshold_not_met',
                          'document_expired',
                          'unreadable',
                          'required_field_concealed',
                          'not_a_government_id',
                          'other'
                        )),
  -- A rejection always carries a reason; a pass never does.
  constraint research_fm_identity_rejection_reason
    check (
      (outcome = 'rejected' and rejection_category is not null)
      or (outcome = 'verified' and rejection_category is null)
    ),
  reviewer_id           text not null,
  started_at            timestamptz not null,
  completed_at          timestamptz not null,
  raw_source_deleted_at timestamptz,
  created_at            timestamptz not null default now()
);

create unique index if not exists research_fm_identity_reviews_case_idx
  on public.research_fm_identity_reviews (tenant_id, case_id);

create index if not exists research_fm_identity_reviews_member_idx
  on public.research_fm_identity_reviews (tenant_id, member_id, completed_at desc);

-- ---------------------------------------------------------------------------
-- Audit: append only. One row per event, including EVERY administrator view
-- of a document (the row is written before the signed URL is minted) and
-- every deletion. History is never rewritten; the trigger refuses update and
-- delete outright.
-- ---------------------------------------------------------------------------

create table if not exists public.research_fm_identity_audit (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null default 'xenios-research',
  case_id     uuid not null,
  member_id   text not null,
  kind        text not null check (kind in (
                'case_opened',
                'consent_recorded',
                'consent_declined',
                'upload_url_issued',
                'upload_confirmed',
                'submitted_for_review',
                'review_started',
                'review_completed',
                'admin_viewed',
                'deletion_scheduled',
                'raw_deleted',
                'emergency_deleted'
              )),
  actor_type  text not null check (actor_type in ('member', 'admin', 'system')),
  actor_id    text,
  occurred_at timestamptz not null default now(),
  detail      text,
  created_at  timestamptz not null default now()
);

create index if not exists research_fm_identity_audit_case_idx
  on public.research_fm_identity_audit (tenant_id, case_id, occurred_at);

create index if not exists research_fm_identity_audit_member_idx
  on public.research_fm_identity_audit (tenant_id, member_id, occurred_at desc);

create or replace function public.research_fm_identity_audit_is_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'research_fm_identity_audit is append only. Record a new row instead of % on row %.',
    tg_op, old.id;
end;
$$;

drop trigger if exists research_fm_identity_audit_no_update on public.research_fm_identity_audit;
create trigger research_fm_identity_audit_no_update
  before update or delete on public.research_fm_identity_audit
  for each row execute function public.research_fm_identity_audit_is_append_only();

-- ---------------------------------------------------------------------------
-- RLS: on, with no policies. The anon and authenticated roles can touch
-- nothing here; only the service-role client (which bypasses RLS) operates,
-- and it does so exclusively through the server's identity store.
-- ---------------------------------------------------------------------------

alter table public.research_fm_identity_cases enable row level security;
alter table public.research_fm_identity_reviews enable row level security;
alter table public.research_fm_identity_audit enable row level security;
